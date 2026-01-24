(() => {
  'use strict';

  // ChatGPT reply timer (send -> done), minimal UI (a small number at bottom-right).
  // Uses the shared fetch/SSE hub (content/chatgpt-fetch-hub/main.js) to avoid stacked fetch patches.

  // Avoid running inside internal ChatGPT iframes when split-view enables `allFrames` injection.
  const ALLOWED_FRAME = (() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    if (!inIframe) return true;
    try {
      const fe = window.frameElement;
      return !!(fe && fe.nodeType === 1 && String(fe.id || '') === 'qn-split-iframe');
    } catch {
      return false;
    }
  })();
  if (!ALLOWED_FRAME) return;

  const GLOBAL_KEY = '__aichat_chatgpt_reply_timer_v1__';
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
    ui: { el: null, tickId: 0, hideTimer: 0 },
    run: {
      active: null,
      last: null
    },
    runsByRequestId: new Map()
  };

  function log(...args) {
    if (!CONFIG.debug) return;
    try {
      // eslint-disable-next-line no-console
      console.log('[AIChat][ReplyTimer]', ...args);
    } catch {}
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
          opacity: 0;
          transition: opacity 120ms linear;
        }
        #${EL_ID}[data-visible="1"]{ opacity: 1; }
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
      outcome: null
    };
    state.runsByRequestId.set(id, run);
    state.run.active = run;
    startUiLoop();
    render();
    return run;
  }

  function finalizeRunFromCtx(ctx) {
    const id = String(ctx?.id || '');
    if (!id) return;
    const run = state.runsByRequestId.get(id);
    if (!run || run.doneAt) return;

    const doneAt = Number(ctx?.stream?.doneAt);
    run.doneAt = Number.isFinite(doneAt) ? doneAt : now();

    const sawDone = ctx?.stream?.sawDone === true;
    const hasError = !!ctx?.stream?.error;
    run.outcome = hasError ? 'error' : sawDone ? 'complete' : 'ended';

    state.run.last = run;
    if (state.run.active && state.run.active.id === run.id) state.run.active = null;

    render();
    scheduleHideAfterDone();
  }

  function installHubHooks() {
    try {
      if (state.hubUnsub) return true;
      const hub = window.__aichat_chatgpt_fetch_hub_v1__;
      if (!hub || typeof hub.register !== 'function') return false;

      state.hubUnsub = hub.register({
        priority: 10,
        onConversationStart: (ctx) => {
          try {
            startRunFromCtx(ctx);
          } catch (e) {
            log('onConversationStart error', e);
          }
        },
        onConversationDone: (ctx) => {
          try {
            finalizeRunFromCtx(ctx);
          } catch (e) {
            log('onConversationDone error', e);
          }
        }
      });
      return true;
    } catch (e) {
      log('installHubHooks error', e);
      return false;
    }
  }

  function uninstall() {
    try {
      if (state.hubUnsub) state.hubUnsub();
      state.hubUnsub = null;
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

  try {
    Object.defineProperty(window, GLOBAL_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[GLOBAL_KEY] = state;
    } catch {}
  }

  ensureEl();
  render();
  installHubHooks();
})();
