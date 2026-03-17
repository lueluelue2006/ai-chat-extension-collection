(() => {
  'use strict';

  const IS_TEST_ENV = typeof module === 'object' && module && module.exports;

  // ChatGPT reply timer (send -> done), minimal UI (a small number at bottom-right).
  // Primary signal: fetch-hub conversation lifecycle events.
  // Fallback signal: DOM generating-state watcher (stop-button presence) for degraded environments.

  // Avoid running inside iframes.
  const ALLOWED_FRAME = (() => {
    if (IS_TEST_ENV) return true;
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    return !inIframe;
  })();
  if (!ALLOWED_FRAME) return;

  const GLOBAL_KEY = '__aichat_chatgpt_reply_timer_v1__';
  const CONSUMER_KEY = 'chatgpt-reply-timer';
  const STYLE_ID = '__aichat_chatgpt_reply_timer_style_v1__';
  const EL_ID = '__aichat_chatgpt_reply_timer_el_v1__';

  try {
    const existing = window[GLOBAL_KEY];
    if (existing && typeof existing === 'object' && existing.__installed) {
      try {
        existing.ensureUi?.();
      } catch {}
      return;
    }
  } catch {}

  const CONFIG = Object.freeze({
    uiUpdateIntervalMs: 100,
    hideAfterDoneMs: 15000,
    debug: false
  });

  const now = () => Date.now();

  const state = {
    __installed: true,
    hubUnsub: null,
    usingHub: false,
    gen: {
      mo: null,
      root: null,
      bootstrapTimer: 0,
      bootstrapAttempts: 0,
      routeUnsub: null,
      lastGenerating: false,
      healthCheckAt: 0
    },
    ui: { el: null, tickId: 0, hideTimer: 0, resilienceMo: null, resilienceTimer: 0 },
    run: {
      active: null,
      last: null
    },
    runsByRequestId: new Map()
  };

  const MAX_TRACKED_RUNS = 40;

  function pruneRuns() {
    try {
      if (state.runsByRequestId.size <= MAX_TRACKED_RUNS) return;
      // Drop oldest entries first (Map preserves insertion order).
      const activeId = String(state.run.active?.id || '');
      for (const k of Array.from(state.runsByRequestId.keys())) {
        if (state.runsByRequestId.size <= MAX_TRACKED_RUNS) break;
        if (activeId && k === activeId) continue;
        state.runsByRequestId.delete(k);
      }
    } catch {}
  }

  function log(...args) {
    if (!CONFIG.debug) return;
    try {
      // eslint-disable-next-line no-console
      console.log('[AIChat][ReplyTimer]', ...args);
    } catch {}
  }

  function normalizeModelToken(input) {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/_+/g, '-')
      .replace(/-+/g, '-');
  }

  function isGptProModelIdentifier(input) {
    const normalized = normalizeModelToken(input);
    if (!normalized || !normalized.includes('pro')) return false;
    if (/^gpt-[a-z0-9.-]*-pro(?:\b|$)/.test(normalized)) return true;
    if (/^(?:gpt-?)?\d+(?:\.\d+)?(?:-[a-z0-9.]+)*-pro(?:\b|$)/.test(normalized)) return true;
    return false;
  }

  function isLikelyGptFamilyIdentifier(input) {
    const normalized = normalizeModelToken(input);
    if (!normalized) return false;
    if (normalized.startsWith('gpt-')) return true;
    if (/^\d+(?:\.\d+)?(?:-[a-z0-9.]+)*$/.test(normalized)) return true;
    return false;
  }

  function readCurrentModelLabel() {
    const selectors = [
      'button[aria-label*="Model selector, current model is" i]',
      'button[aria-label*="current model is" i]'
    ];
    for (const selector of selectors) {
      try {
        const button = document.querySelector(selector);
        const aria = String(button?.getAttribute?.('aria-label') || '').trim();
        if (aria) return aria.replace(/^.*current model is\s*/i, '').trim();
        const text = String(button?.innerText || button?.textContent || '').trim();
        if (text) return text;
      } catch {}
    }
    return '';
  }

  function readComposerModeLabel() {
    const selectors = ['button[aria-haspopup="menu"]', 'button'];
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      const editor = core && typeof core.getEditorEl === 'function' ? core.getEditorEl() : null;
      const form = core && typeof core.getComposerForm === 'function' ? core.getComposerForm(editor) : editor?.closest?.('form');
      const buttons = Array.from(form?.querySelectorAll?.(selectors.join(', ')) || []);
      for (const button of buttons) {
        const text = String(button?.innerText || button?.textContent || '').trim();
        if (!text) continue;
        if (/\bthinking\b/i.test(text) || /\bpro\b/i.test(text)) return text;
      }
    } catch {}
    return '';
  }

  function isSteerTurnUrl(url) {
    if (!url) return false;
    return /\/backend-api\/f\/steer_turn(?:\?|$)/.test(String(url));
  }

  function isConversationRoute() {
    try {
      return /^\/c\/[a-z0-9-]+$/i.test(String(location.pathname || ''));
    } catch {
      return false;
    }
  }

  function shouldTrackReplyTimer(options = {}) {
    const payloadModel = String(options.payloadModel || '');
    const modelLabel = String(options.modelLabel || readCurrentModelLabel() || '');
    const composerModeLabel = String(options.composerModeLabel || readComposerModeLabel() || '');
    if (isGptProModelIdentifier(payloadModel)) return false;
    if (isGptProModelIdentifier(modelLabel)) return false;
    if (/\b(?:extended\s+)?pro\b/i.test(composerModeLabel) && isLikelyGptFamilyIdentifier(modelLabel || payloadModel)) return false;
    return true;
  }

  function clearReplyTimerDisplay() {
    state.run.active = null;
    state.run.last = null;
    try {
      if (state.ui.hideTimer) clearTimeout(state.ui.hideTimer);
      state.ui.hideTimer = 0;
    } catch {}
    render();
    setUiVisible(false);
    stopUiLoop();
  }

  function ensureStyle() {
    try {
      const docEl = document.documentElement;
      if (!docEl) return;
      const existing = document.getElementById(STYLE_ID);
      if (existing) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${EL_ID}{
          position: fixed;
          right: 0;
          bottom: 0;
          z-index: 2147483647;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-variant-numeric: tabular-nums;
          font-size: 9px;
          line-height: 9px;
          padding: 2px 3px;
          margin: 0;
          border-top-left-radius: 4px;
          background: rgba(0, 0, 0, 0.70);
          color: rgba(255,255,255,0.92);
          user-select: none;
          pointer-events: none;
          display: none;
          opacity: 0;
          transition: opacity 120ms linear;
        }
        #${EL_ID}[data-visible="1"]{ display: block; opacity: 1; }
        #${EL_ID}[data-status="running"]{ color: rgba(251, 191, 36, 0.95); }
        #${EL_ID}[data-status="done"]{ color: rgba(167, 243, 208, 0.95); }
        #${EL_ID}[data-status="error"]{ color: rgba(252, 165, 165, 0.95); }
      `;
      docEl.appendChild(style);
    } catch {}
  }

  function ensureEl() {
    try {
      ensureStyle();
      const docEl = document.documentElement;
      if (!docEl) return null;
      const existing = document.getElementById(EL_ID);
      if (existing) {
        state.ui.el = existing;
        return existing;
      }
      const el = document.createElement('div');
      el.id = EL_ID;
      el.setAttribute('data-status', 'idle');
      el.setAttribute('data-visible', '0');
      el.textContent = '';
      docEl.appendChild(el);
      state.ui.el = el;
      return el;
    } catch {
      return null;
    }
  }

  function ensureUiResilience() {
    try {
      if (state.ui.resilienceMo) return;
      const html = document.documentElement;
      if (!html || typeof MutationObserver !== 'function') return;

      let repairing = false;
      const repair = () => {
        if (repairing) return;
        repairing = true;
        try {
          if (!document.getElementById(EL_ID)) {
            ensureEl();
            render();
          }
        } catch {}
        repairing = false;
      };

      // Run a few times during early hydration (ChatGPT sometimes wipes appended nodes).
      let tries = 0;
      const MAX_TRIES = 12;
      const tick = () => {
        tries += 1;
        repair();
        if (tries >= MAX_TRIES) {
          if (state.ui.resilienceTimer) {
            clearTimeout(state.ui.resilienceTimer);
            state.ui.resilienceTimer = 0;
          }
          return;
        }
        state.ui.resilienceTimer = setTimeout(tick, 800);
      };
      state.ui.resilienceTimer = setTimeout(tick, 800);

      const mo = new MutationObserver(() => repair());
      mo.observe(html, { childList: true });
      state.ui.resilienceMo = mo;
    } catch {}
  }

  function setUiVisible(visible) {
    const el = ensureEl();
    if (!el) return;
    el.setAttribute('data-visible', visible ? '1' : '0');
  }

  function formatSeconds(ms) {
    const sec = Math.max(0, Number(ms) || 0) / 1000;
    return sec.toFixed(1);
  }

  function render() {
    const el = ensureEl();
    if (!el) return;

    maybeRefreshGeneratingObserver();
    maybeFinalizeSettledRun();

    if (!shouldTrackReplyTimer()) {
      state.run.active = null;
      state.run.last = null;
      el.textContent = '';
      el.setAttribute('data-status', 'idle');
      setUiVisible(false);
      stopUiLoop();
      return;
    }

    const run = state.run.active;
    if (run && !run.doneAt) {
      const elapsed = now() - run.startedAt;
      el.textContent = formatSeconds(elapsed);
      el.setAttribute('data-status', 'running');
      setUiVisible(true);
      return;
    }

    const last = state.run.last;
    if (last && last.doneAt) {
      el.textContent = formatSeconds(last.doneAt - last.startedAt);
      el.setAttribute('data-status', last.outcome === 'complete' ? 'done' : 'error');
      setUiVisible(true);
      return;
    }

    el.textContent = '';
    el.setAttribute('data-status', 'idle');
    setUiVisible(false);
  }

  function stopUiLoop() {
    try {
      if (state.ui.tickId) clearInterval(state.ui.tickId);
      state.ui.tickId = 0;
    } catch {}
  }

  function startUiLoop() {
    try {
      if (state.ui.tickId) return;
      state.ui.tickId = setInterval(render, CONFIG.uiUpdateIntervalMs);
    } catch {}
  }

  function scheduleHideAfterDone() {
    try {
      if (state.ui.hideTimer) clearTimeout(state.ui.hideTimer);
      state.ui.hideTimer = setTimeout(() => {
        state.ui.hideTimer = 0;
        if (state.run.active && !state.run.active.doneAt) return;
        setUiVisible(false);
        stopUiLoop();
      }, CONFIG.hideAfterDoneMs);
    } catch {}
  }

  function startRunFromCtx(ctx) {
    const id = String(ctx?.id || '');
    if (!id) return null;
    const startedAt = Number(ctx?.startedAt);
    const run = {
      id,
      startedAt: Number.isFinite(startedAt) ? startedAt : now(),
      firstByteAt: null,
      doneAt: null,
      outcome: null,
      source: String(ctx?.source || 'hub'),
      pendingDone: null
    };
    state.runsByRequestId.set(id, run);
    pruneRuns();
    state.run.active = run;
    state.run.last = null;
    state.gen.lastGenerating = true;
    startUiLoop();
    render();
    return run;
  }

  function finalizeRun(run, doneAt, outcome) {
    if (!run || run.doneAt) return;
    run.doneAt = Number.isFinite(doneAt) ? doneAt : now();
    run.outcome = String(outcome || 'complete');
    run.pendingDone = null;
    state.run.last = run;
    if (state.run.active && state.run.active.id === run.id) state.run.active = null;
    render();
    scheduleHideAfterDone();
  }

  function finalizeRunFromCtx(ctx) {
    const id = String(ctx?.id || '');
    if (!id) return;
    const run = state.runsByRequestId.get(id);
    if (!run || run.doneAt) return;

    const sawDone = ctx?.stream?.sawDone === true;
    const hasError = !!ctx?.stream?.error;
    const outcome = hasError ? 'error' : sawDone ? 'complete' : 'ended';
    const doneAt = Number(ctx?.stream?.doneAt);

    if (isGeneratingNow()) {
      run.pendingDone = {
        doneAt: Number.isFinite(doneAt) ? doneAt : now(),
        outcome
      };
      state.gen.lastGenerating = true;
      startUiLoop();
      render();
      return;
    }

    finalizeRun(run, now(), outcome);
  }

  function startAuxRun(id, startedAt, source, reason = '') {
    try {
      const run = {
        id: String(id || `${source}:${now().toString(16)}:${Math.random().toString(16).slice(2)}`),
        startedAt: Number.isFinite(startedAt) ? startedAt : now(),
        firstByteAt: null,
        doneAt: null,
        outcome: null,
        source: String(source || 'dom'),
        reason: String(reason || ''),
        pendingDone: null
      };
      state.runsByRequestId.set(run.id, run);
      pruneRuns();
      state.run.active = run;
      state.run.last = null;
      state.gen.lastGenerating = true;
      startUiLoop();
      render();
      return run;
    } catch {
      return null;
    }
  }

  function startRunLocal(reason = '') {
    try {
      const existing = state.run.active;
      if (existing && !existing.doneAt) return existing;
      return startAuxRun('', now(), 'dom', reason);
    } catch {
      return null;
    }
  }

  function finalizeActiveAuxRun(outcome = 'complete') {
    try {
      const run = state.run.active;
      if (!run || run.doneAt) return;
      if (run.source === 'hub' && !run.pendingDone) return;
      finalizeRun(run, now(), outcome);
    } catch {}
  }

  function isGeneratingNow() {
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (core && typeof core.isGenerating === 'function') return !!core.isGenerating();
    } catch {}
    try {
      return !!document.querySelector('button[data-testid="stop-button"]');
    } catch {
      return false;
    }
  }

  function shouldTrackReplyTimerForCtx(ctx) {
    return shouldTrackReplyTimer({
      payloadModel: ctx?.conversation?.payload?.model || '',
      modelLabel: readCurrentModelLabel()
    });
  }

  function installHubConsumer() {
    try {
      if (state.hubUnsub) return true;
      const consumerBase = window.__aichat_chatgpt_fetch_consumer_base_v1__;
      const hub = window.__aichat_chatgpt_fetch_hub_v1__;
      const registerConsumer =
        consumerBase && typeof consumerBase.registerConsumer === 'function'
          ? (key, handlers) => consumerBase.registerConsumer(key, handlers)
          : hub && typeof hub.register === 'function'
            ? (_key, handlers) => hub.register(handlers)
            : null;
      if (!registerConsumer) return false;

      const maybeUnsub = registerConsumer(CONSUMER_KEY, {
        // Run very late: read final outgoing payload after model/effort rewrites.
        priority: 250,
        beforeFetch: (ctx) => {
          try {
            if (state.__installed !== true) return;
            const method = String(ctx?.method || '').toUpperCase();
            const url = String(ctx?.url || '');
            if (method !== 'POST' || !isSteerTurnUrl(url)) return;
            state.usingHub = true;
            if (!shouldTrackReplyTimer()) {
              clearReplyTimerDisplay();
              return;
            }
            startAuxRun(String(ctx?.id || ''), Number(ctx?.startedAt) || now(), 'steer', 'steer_turn');
          } catch {}
        },
        onConversationStart: (ctx) => {
          try {
            if (state.__installed !== true) return;
            state.usingHub = true;
            if (!shouldTrackReplyTimerForCtx(ctx)) {
              clearReplyTimerDisplay();
              return;
            }
            startRunFromCtx(ctx);
          } catch {}
        },
        onConversationDone: (ctx) => {
          try {
            if (state.__installed !== true) return;
            state.usingHub = true;
            finalizeRunFromCtx(ctx);
          } catch {}
        }
      });

      if (typeof maybeUnsub === 'function') {
        state.hubUnsub = maybeUnsub;
        return true;
      }
      if (maybeUnsub && typeof maybeUnsub.dispose === 'function') {
        state.hubUnsub = () => {
          try {
            maybeUnsub.dispose();
          } catch {}
        };
        return true;
      }
    } catch {}
    return false;
  }

  function checkGeneratingTransition() {
    try {
      if (!shouldTrackReplyTimer()) {
        clearReplyTimerDisplay();
        state.gen.lastGenerating = false;
        return;
      }
      const generating = isGeneratingNow();
      const prev = !!state.gen.lastGenerating;
      state.gen.lastGenerating = generating;

      if (generating && !prev) {
        const active = state.run.active;
        if (!active || active.doneAt || active.pendingDone) startAuxRun('', now(), 'dom', 'generating');
        return;
      }

      if (!generating && prev) {
        const active = state.run.active;
        if (active?.pendingDone) finalizeRun(active, now(), active.pendingDone.outcome || 'complete');
        else finalizeActiveAuxRun('complete');
      }
    } catch {}
  }

  function maybeRefreshGeneratingObserver() {
    try {
      const t = now();
      if (t - Number(state.gen.healthCheckAt || 0) < 400) return;
      state.gen.healthCheckAt = t;
      if (state.gen.root?.isConnected) return;
      if (ensureGeneratingObserver()) return;
      ensureGeneratingBootstrap();
    } catch {}
  }

  function maybeFinalizeSettledRun() {
    try {
      const run = state.run.active;
      if (!run || run.doneAt || !run.pendingDone) return;
      if (isGeneratingNow()) return;
      finalizeRun(run, now(), run.pendingDone.outcome || 'complete');
    } catch {}
  }

  function getComposerFormForWatch() {
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      const editor = core && typeof core.getEditorEl === 'function' ? core.getEditorEl() : null;
      const form = core && typeof core.getComposerForm === 'function' ? core.getComposerForm(editor) : null;
      if (form) return form;
      return editor?.closest?.('form') || null;
    } catch {
      return null;
    }
  }

  function detachGeneratingObserver() {
    try {
      state.gen.mo?.disconnect?.();
    } catch {}
    state.gen.mo = null;
    state.gen.root = null;
    try {
      if (state.gen.bootstrapTimer) clearInterval(state.gen.bootstrapTimer);
    } catch {}
    state.gen.bootstrapTimer = 0;
    state.gen.bootstrapAttempts = 0;
    state.gen.healthCheckAt = 0;
  }

  function ensureGeneratingObserver() {
    try {
      const form = getComposerFormForWatch();
      if (!form) return false;
      if (state.gen.mo && state.gen.root === form) return true;

      detachGeneratingObserver();
      state.gen.root = form;

      if (typeof MutationObserver === 'function') {
        const mo = new MutationObserver(() => checkGeneratingTransition());
        // Watch the composer subtree only (small), so overhead stays low.
        mo.observe(form, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-testid', 'aria-label', 'class', 'disabled', 'aria-disabled']
        });
        state.gen.mo = mo;
      }

      checkGeneratingTransition();
      return true;
    } catch {
      return false;
    }
  }

  function ensureGeneratingBootstrap() {
    if (state.gen.bootstrapTimer) return;
    const MAX_ATTEMPTS = 40; // ~24s
    const STEP_MS = 600;
    state.gen.bootstrapAttempts = 0;
    state.gen.bootstrapTimer = setInterval(() => {
      try {
        if (document.hidden) return;
        state.gen.bootstrapAttempts += 1;
        if (state.gen.bootstrapAttempts > MAX_ATTEMPTS) {
          clearInterval(state.gen.bootstrapTimer);
          state.gen.bootstrapTimer = 0;
          state.gen.bootstrapAttempts = 0;
          return;
        }
        if (ensureGeneratingObserver()) {
          clearInterval(state.gen.bootstrapTimer);
          state.gen.bootstrapTimer = 0;
          state.gen.bootstrapAttempts = 0;
        }
      } catch {
        clearInterval(state.gen.bootstrapTimer);
        state.gen.bootstrapTimer = 0;
        state.gen.bootstrapAttempts = 0;
      }
    }, STEP_MS);
  }

  function installRouteWatcher() {
    try {
      if (state.gen.routeUnsub) return;
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (core && typeof core.onRouteChange === 'function') {
        state.gen.routeUnsub = core.onRouteChange(() => {
          try {
            detachGeneratingObserver();
            if (!isConversationRoute() && !isGeneratingNow()) clearReplyTimerDisplay();
            ensureGeneratingBootstrap();
          } catch {}
        });
        return;
      }
    } catch {}

    // Fallback: slow poll (should rarely be used).
    try {
      let last = String(location.href || '');
      state.gen.routeUnsub = (() => {
        const t = setInterval(() => {
          try {
            const href = String(location.href || '');
            if (!href || href === last) return;
            last = href;
            detachGeneratingObserver();
            if (!isConversationRoute() && !isGeneratingNow()) clearReplyTimerDisplay();
            ensureGeneratingBootstrap();
          } catch {}
        }, 1500);
        return () => {
          try {
            clearInterval(t);
          } catch {}
        };
      })();
    } catch {}
  }

  function uninstall() {
    try {
      if (state.hubUnsub) state.hubUnsub();
      state.hubUnsub = null;
    } catch {}
    try {
      if (typeof state.gen.routeUnsub === 'function') state.gen.routeUnsub();
    } catch {}
    state.gen.routeUnsub = null;
    detachGeneratingObserver();
    try {
      if (state.ui.resilienceTimer) clearTimeout(state.ui.resilienceTimer);
      state.ui.resilienceTimer = 0;
    } catch {}
    try {
      state.ui.resilienceMo && state.ui.resilienceMo.disconnect();
      state.ui.resilienceMo = null;
    } catch {}
    try {
      stopUiLoop();
    } catch {}
    try {
      if (state.ui.hideTimer) clearTimeout(state.ui.hideTimer);
      state.ui.hideTimer = 0;
    } catch {}
    try {
      document.getElementById(EL_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    } catch {}
    try {
      state.__installed = false;
      delete window[GLOBAL_KEY];
    } catch {}
  }

  state.ensureUi = () => {
    ensureEl();
    render();
  };
  state.uninstall = uninstall;

  if (IS_TEST_ENV) {
    module.exports = {
      isGptProModelIdentifier,
      isLikelyGptFamilyIdentifier,
      normalizeModelToken,
      readComposerModeLabel,
      shouldTrackReplyTimer
    };
    return;
  }

  try {
    Object.defineProperty(window, GLOBAL_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[GLOBAL_KEY] = state;
    } catch {}
  }

  ensureEl();
  render();
  ensureUiResilience();
  installHubConsumer();
  installRouteWatcher();
  // Prefer watcher on composer form; fall back to a short-lived bootstrap until the form exists.
  if (!ensureGeneratingObserver()) ensureGeneratingBootstrap();
})();
