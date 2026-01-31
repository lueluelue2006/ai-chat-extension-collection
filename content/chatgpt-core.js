(() => {
  'use strict';

  // ChatGPT shared helpers (ISOLATED world).
  // Goal: reduce duplicated brittle selectors / route polling across ChatGPT-only modules.

  const API_KEY = '__aichat_chatgpt_core_v1__';
  const API_VERSION = 5;

  // Avoid installing timers/listeners inside unrelated iframes.
  // Allow top-frame and our split-view iframe.
  const isAllowedFrame = (() => {
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

  if (!isAllowedFrame) return;

  try {
    const prev = globalThis[API_KEY];
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= API_VERSION) return;
  } catch {}

  function now() {
    return Date.now();
  }

  function pickBottomMostVisible(candidates) {
    const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    let best = null;
    let bestScore = -Infinity;
    for (const el of list) {
      try {
        if (!el || !el.getBoundingClientRect) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const score = Number(r.bottom) || 0;
        if (score >= bestScore) {
          bestScore = score;
          best = el;
        }
      } catch {}
    }
    return best;
  }

  function safeCall(fn, ...args) {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  }

  function getConversationIdFromUrl(url) {
    try {
      const u = new URL(String(url || ''), location.href);
      const parts = String(u.pathname || '')
        .split('/')
        .filter(Boolean);
      const idx = parts.indexOf('c');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      const sidx = parts.indexOf('share');
      if (sidx >= 0 && parts[sidx + 1]) return parts[sidx + 1];
      return '';
    } catch {
      // Fallback: parse pathname directly.
      try {
        const parts = String(location.pathname || '')
          .split('/')
          .filter(Boolean);
        const idx = parts.indexOf('c');
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
        const sidx = parts.indexOf('share');
        if (sidx >= 0 && parts[sidx + 1]) return parts[sidx + 1];
      } catch {}
      return '';
    }
  }

  function getRoute() {
    const href = (() => {
      try {
        return String(location.href || '');
      } catch {
        return '';
      }
    })();
    const pathname = (() => {
      try {
        return String(location.pathname || '');
      } catch {
        return '';
      }
    })();
    const conversationId = getConversationIdFromUrl(href);
    return {
      href,
      pathname,
      conversationId,
      isConversation: pathname.startsWith('/c/'),
      isShare: pathname.startsWith('/share/'),
      isHome: pathname === '/' || pathname === ''
    };
  }

  function getEditorEl() {
    // Real editor is usually ProseMirror; keep fallbacks.
    try {
      const list = Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]'));
      const pm = pickBottomMostVisible(list);
      if (pm) return pm;
    } catch {}
    try {
      const list = Array.from(document.querySelectorAll('#prompt-textarea[contenteditable="true"]'));
      const el = pickBottomMostVisible(list);
      if (el) return el;
    } catch {}
    try {
      const el = document.querySelector('#prompt-textarea');
      if (el) return el;
    } catch {}
    try {
      const el = document.querySelector('textarea[name="prompt-textarea"]');
      if (el) return el;
    } catch {}
    return null;
  }

  function getComposerForm(editorEl) {
    try {
      const el = editorEl || getEditorEl();
      return el?.closest?.('form') || null;
    } catch {
      return null;
    }
  }

  function findSendButton(editorEl) {
    const form = getComposerForm(editorEl);
    const root = form || document;
    try {
      return (
        root.querySelector('#composer-submit-button') ||
        root.querySelector('button[data-testid="send-button"]') ||
        root.querySelector('button[aria-label*="Send" i]') ||
        null
      );
    } catch {
      return null;
    }
  }

  function findStopButton(editorEl) {
    const form = getComposerForm(editorEl);
    const root = form || document;
    try {
      return root.querySelector('button[data-testid="stop-button"]') || root.querySelector('button[aria-label*="Stop" i]') || null;
    } catch {
      return null;
    }
  }

  function isGenerating(editorEl) {
    return !!findStopButton(editorEl);
  }

  function isElementDisabled(el) {
    if (!el) return true;
    try {
      if (el instanceof HTMLButtonElement) return !!el.disabled;
    } catch {}
    try {
      const ariaDisabled = el.getAttribute?.('aria-disabled');
      if (ariaDisabled && ariaDisabled !== 'false') return true;
    } catch {}
    return false;
  }

  function clickSendButton(editorEl) {
    try {
      const btn = findSendButton(editorEl);
      if (!(btn instanceof HTMLElement)) return false;
      if (isElementDisabled(btn)) return false;
      const testId = String(btn.getAttribute?.('data-testid') || '');
      if (testId && /stop/i.test(testId)) return false;
      btn.click();
      return true;
    } catch {
      return false;
    }
  }

  function clickStopButton(editorEl) {
    try {
      const btn = findStopButton(editorEl);
      if (!(btn instanceof HTMLElement)) return false;
      if (isElementDisabled(btn)) return false;
      btn.click();
      return true;
    } catch {
      return false;
    }
  }

  function getTurnsRoot() {
    try {
      const stable = document.querySelector('[data-testid="conversation-turns"]');
      if (stable) return stable;
    } catch {}
    // Newer ChatGPT builds may not expose a stable `conversation-turns` container.
    // Fall back to a narrow ancestor derived from the first turn article.
    try {
      const first = document.querySelector('article[data-testid^="conversation-turn-"]');
      if (first) {
        // Prefer a list container whose *direct* children are turn articles (cheap + ignores inner streaming mutations).
        let cur = first.parentElement;
        const MAX_DEPTH = 12;
        for (let i = 0; cur && cur !== document.body && cur !== document.documentElement && i < MAX_DEPTH; i++) {
          try {
            if (cur.querySelector?.(':scope > article[data-testid^="conversation-turn-"]')) return cur;
          } catch {}
          cur = cur.parentElement;
        }

        // Pragmatic fallback: the overall thread container.
        const thread = document.getElementById('thread');
        if (thread && thread.querySelector?.('article[data-testid^="conversation-turn-"]')) return thread;

        return first.parentElement || document;
      }
    } catch {}
    return document;
  }

  function getTurnArticles(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    try {
      const list = Array.from(scope.querySelectorAll('article[data-testid^="conversation-turn-"]'));
      if (list.length) return list;
    } catch {}
    try {
      const list = Array.from(scope.querySelectorAll('[data-testid^="conversation-turn-"]'));
      return list.filter((n) => n && n.tagName === 'ARTICLE');
    } catch {}
    return [];
  }

  function shouldObserveTurnsSubtree(root) {
    try {
      if (!root || typeof root.querySelectorAll !== 'function') return true;
      const deep = root.querySelectorAll('article[data-testid^="conversation-turn-"]').length;
      if (!deep) return true;
      const direct = root.querySelectorAll(':scope > article[data-testid^="conversation-turn-"]').length;
      // If all turn articles are direct children, avoid subtree observation to ignore streaming text mutations.
      if (direct && direct === deep) return false;
      // Common case: turns are wrapped one level deep (e.g. :scope > div > article).
      // We can still keep `subtree:false` and just detect wrapper insertions.
      const wrapped = root.querySelectorAll(':scope > * article[data-testid^="conversation-turn-"]').length;
      if (wrapped && wrapped === deep) return false;
    } catch {}
    return true;
  }

  // === Turns change subscription (ISOLATED) ===
  const turnsWatch = (() => {
    const st = {
      mo: null,
      listeners: new Set(),
      scheduled: false,
      timer: 0,
      root: null,
      pendingAddedTurns: new Set(),
      bootstrapTimer: 0,
      bootstrapAttempts: 0,
      routeUnsub: null
    };
    return st;
  })();

  function isTurnishNode(node) {
    try {
      if (!node || !(node instanceof Element)) return false;
      if (node.matches('article[data-testid^="conversation-turn-"],[data-testid^="conversation-turn-"]')) return true;
      if (node.querySelector?.('article[data-testid^="conversation-turn-"],[data-testid^="conversation-turn-"]')) return true;
    } catch {}
    return false;
  }

  function emitTurnsChange(payload) {
    const list = Array.from(turnsWatch.listeners);
    if (!list.length) return;
    for (const fn of list) safeCall(fn, payload);
  }

  function collectAddedTurnsFromNode(node, out) {
    if (!out) return;
    // Avoid unbounded growth if a huge subtree is added in one tick.
    const LIMIT = 60;
    try {
      if (!node || !(node instanceof Element)) return;
      if (out.size > LIMIT) return;
      if (node.matches('article[data-testid^="conversation-turn-"]')) {
        out.add(node);
        return;
      }
      const list = node.querySelectorAll?.('article[data-testid^="conversation-turn-"]');
      if (!list || !list.length) return;
      for (const el of Array.from(list)) {
        out.add(el);
        if (out.size > LIMIT) break;
      }
    } catch {}
  }

  function stopTurnsBootstrap() {
    try {
      if (turnsWatch.bootstrapTimer) clearInterval(turnsWatch.bootstrapTimer);
    } catch {}
    turnsWatch.bootstrapTimer = 0;
    turnsWatch.bootstrapAttempts = 0;
  }

  function ensureTurnsBootstrap() {
    if (turnsWatch.bootstrapTimer) return;
    // Keep this small and self-limiting: on non-conversation pages, ChatGPT may never mount turns.
    const MAX_ATTEMPTS = 40; // ~24s
    const STEP_MS = 600;
    turnsWatch.bootstrapAttempts = 0;
    turnsWatch.bootstrapTimer = setInterval(() => {
      try {
        if (!turnsWatch.listeners.size) return stopTurnsBootstrap();
        if (document.hidden) return;
        turnsWatch.bootstrapAttempts += 1;
        if (turnsWatch.bootstrapAttempts > MAX_ATTEMPTS) return stopTurnsBootstrap();
        const root = getTurnsRoot();
        if (!root || root === document) return;
        stopTurnsBootstrap();
        ensureTurnsObserver(true);
      } catch {
        stopTurnsBootstrap();
      }
    }, STEP_MS);
  }

  function detachTurnsObserver() {
    try {
      turnsWatch.mo?.disconnect?.();
    } catch {}
    turnsWatch.mo = null;
    turnsWatch.root = null;
    turnsWatch.scheduled = false;
    try {
      turnsWatch.pendingAddedTurns.clear();
    } catch {}
    try {
      if (turnsWatch.timer) clearTimeout(turnsWatch.timer);
    } catch {}
    turnsWatch.timer = 0;
  }

  function ensureTurnsRouteListener() {
    if (turnsWatch.routeUnsub) return;
    // Prefer the shared bridge; avoid patching history.
    try {
      const bridge = globalThis.__aichat_quicknav_bridge_v1__ || null;
      if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
        safeCall(bridge.ensureRouteListener);
        turnsWatch.routeUnsub = bridge.on('routeChange', () => {
          try {
            if (!turnsWatch.listeners.size) return;
            detachTurnsObserver();
            stopTurnsBootstrap();
            ensureTurnsObserver(true);
          } catch {}
        });
        return;
      }
    } catch {}
  }

  function ensureTurnsObserver(emitInitial = false) {
    if (turnsWatch.mo) {
      try {
        if (turnsWatch.root && turnsWatch.root.isConnected) return;
      } catch {}
      detachTurnsObserver();
    }
    // Only observe within the stable turns root to avoid noisy global observers.
    const root = getTurnsRoot();
    if (!root || root === document) {
      ensureTurnsBootstrap();
      return;
    }
    turnsWatch.root = root;

    try {
      const mo = new MutationObserver((muts) => {
        const added = turnsWatch.pendingAddedTurns;
        try {
          let changed = false;
          for (const m of muts || []) {
            if (!m || m.type !== 'childList') continue;
            for (const n of Array.from(m.addedNodes || [])) {
              if (!n || n.nodeType !== 1) continue;
              collectAddedTurnsFromNode(n, added);
              if (isTurnishNode(n)) changed = true;
            }
            for (const n of Array.from(m.removedNodes || [])) {
              if (isTurnishNode(n)) {
                changed = true;
                break;
              }
            }
          }
          if (!changed) return;
        } catch {
          // If unsure, err on the side of emitting (but still debounce).
        }

        if (turnsWatch.scheduled) return;
        turnsWatch.scheduled = true;
        try {
          if (turnsWatch.timer) clearTimeout(turnsWatch.timer);
        } catch {}
        turnsWatch.timer = setTimeout(() => {
          turnsWatch.scheduled = false;
          turnsWatch.timer = 0;
          const r = turnsWatch.root && turnsWatch.root.isConnected ? turnsWatch.root : getTurnsRoot();
          const addedTurns = Array.from(turnsWatch.pendingAddedTurns);
          turnsWatch.pendingAddedTurns.clear();
          emitTurnsChange({ at: now(), reason: 'mutation', turnCount: getTurnArticles(r).length, addedTurns });
        }, 60);
      });
      mo.observe(root, { childList: true, subtree: shouldObserveTurnsSubtree(root) });
      turnsWatch.mo = mo;
      if (emitInitial) emitTurnsChange({ at: now(), reason: 'attach', turnCount: getTurnArticles(root).length });
    } catch {
      turnsWatch.mo = null;
    }
  }

  function onTurnsChange(cb) {
    if (typeof cb !== 'function') return () => void 0;
    turnsWatch.listeners.add(cb);
    ensureTurnsObserver(true);
    ensureTurnsRouteListener();
    return () => {
      try {
        turnsWatch.listeners.delete(cb);
        if (!turnsWatch.listeners.size) {
          detachTurnsObserver();
          stopTurnsBootstrap();
          try {
            if (typeof turnsWatch.routeUnsub === 'function') turnsWatch.routeUnsub();
          } catch {}
          turnsWatch.routeUnsub = null;
        }
      } catch {}
    };
  }

  function getTurnRole(turnEl) {
    try {
      const v = String(turnEl?.getAttribute?.('data-turn') || '').trim();
      if (v) return v;
    } catch {}
    try {
      const v = String(turnEl?.getAttribute?.('data-message-author-role') || '').trim();
      if (v) return v;
    } catch {}
    try {
      const el = turnEl?.querySelector?.('[data-message-author-role]');
      const v = String(el?.getAttribute?.('data-message-author-role') || '').trim();
      if (v) return v;
    } catch {}
    return '';
  }

  function getTurnId(turnEl) {
    try {
      const v = String(turnEl?.getAttribute?.('data-turn-id') || '').trim();
      if (v) return v;
    } catch {}
    return '';
  }

  function getMessageId(turnEl) {
    try {
      const v = String(turnEl?.getAttribute?.('data-message-id') || '').trim();
      if (v) return v;
    } catch {}
    try {
      const el = turnEl?.querySelector?.('[data-message-id]');
      const v = String(el?.getAttribute?.('data-message-id') || '').trim();
      if (v) return v;
    } catch {}
    return '';
  }

  // === Route change subscription (ISOLATED) ===
  function onRouteChange(cb) {
    if (typeof cb !== 'function') return () => void 0;
    const bridge = (() => {
      try {
        return globalThis.__aichat_quicknav_bridge_v1__ || null;
      } catch {
        return null;
      }
    })();
    if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
      safeCall(bridge.ensureRouteListener);
      return bridge.on('routeChange', cb);
    }

    // Fallback: slow polling.
    let last = '';
    try {
      last = String(location.href || '');
    } catch {
      last = '';
    }
    const timer = setInterval(() => {
      try {
        const href = String(location.href || '');
        if (!href || href === last) return;
        last = href;
        cb({ href, reason: 'poll', at: now() });
      } catch {}
    }, 1200);
    return () => {
      try {
        clearInterval(timer);
      } catch {}
    };
  }

  // === Memory guard (ChatGPT stability) ===
  // NOTE: This is a best-effort early warning based on JS heap usage. It cannot see total renderer RSS.
  // It is intentionally conservative to avoid noisy alerts in normal use.
  const memGuard = (() => {
    try {
      // Top-frame only: avoid duplicated timers when split-view enables `allFrames` injection.
      if (window.self !== window.top) return null;
    } catch {
      return null;
    }

    const MAX_SAMPLES = 24; // ~12 minutes @ 30s interval
    const SAMPLE_MS = 30 * 1000;
    const WARN_RATIO = 0.55;
    const CRIT_RATIO = 0.75;
    const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;
    const CLEANUP_COOLDOWN_MS = 3 * 60 * 1000;

    const state = {
      timer: 0,
      samples: /** @type {Array<{at:number, used:number, total:number, limit:number, ratio:number}>} */ ([]),
      lastNotifyAt: 0,
      lastCleanupAt: 0,
      lastLevel: 'ok'
    };

    function readHeap() {
      try {
        const pm = performance?.memory;
        if (!pm) return null;
        const used = Number(pm.usedJSHeapSize) || 0;
        const total = Number(pm.totalJSHeapSize) || 0;
        const limit = Number(pm.jsHeapSizeLimit) || 0;
        if (!used || !limit) return null;
        const ratio = used / limit;
        return { at: now(), used, total, limit, ratio };
      } catch {
        return null;
      }
    }

    function formatMb(bytes) {
      const n = Number(bytes) || 0;
      if (!Number.isFinite(n) || n <= 0) return '0MB';
      return `${Math.round(n / 1024 / 1024)}MB`;
    }

    function notify(title, message) {
      const ts = now();
      if (ts - state.lastNotifyAt < NOTIFY_COOLDOWN_MS) return;
      state.lastNotifyAt = ts;
      try {
        if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
        chrome.runtime.sendMessage(
          { type: 'QUICKNAV_NOTIFY', id: 'quicknav_chatgpt_mem_guard', title, message },
          () => void chrome.runtime.lastError
        );
      } catch {}
    }

    function emergencyCleanup(level, sample) {
      const ts = now();
      if (ts - state.lastCleanupAt < CLEANUP_COOLDOWN_MS) return;
      state.lastCleanupAt = ts;

      try {
        // Split View: unload/destroy iframe and close.
        const split = window.__aichat_chatgpt_split_view_api_v1__;
        split?.hardClose?.(`mem:${level}`);
      } catch {}

      try {
        // Message Tree runs in MAIN world; close it via the existing QuickNav bridge message.
        window.postMessage({ __quicknav: 1, type: 'QUICKNAV_CHATGPT_TREE_CLOSE' }, '*');
      } catch {}

      try {
        // QuickNav: best-effort de-dupe panel if reinject happened.
        window.chatGptNavDebug?.checkOverlap?.();
      } catch {}

      try {
        notify(
          'ChatGPT 内存保护：已执行清理',
          `level=${level} used=${formatMb(sample.used)} (${Math.round(sample.ratio * 100)}%)`
        );
      } catch {}
    }

    function tick() {
      const sample = readHeap();
      if (!sample) return;
      state.samples.push(sample);
      if (state.samples.length > MAX_SAMPLES) state.samples.splice(0, state.samples.length - MAX_SAMPLES);

      const ratio = sample.ratio;
      const level = ratio >= CRIT_RATIO ? 'critical' : ratio >= WARN_RATIO ? 'warning' : 'ok';
      const levelChanged = level !== state.lastLevel;
      state.lastLevel = level;

      if (level === 'critical') {
        notify(
          'ChatGPT 内存预警（严重）',
          `JS heap 已接近上限：${formatMb(sample.used)} / ${formatMb(sample.limit)}`
        );
        emergencyCleanup(level, sample);
        return;
      }

      if (level === 'warning' && levelChanged) {
        notify(
          'ChatGPT 内存预警',
          `JS heap 占用偏高：${formatMb(sample.used)} / ${formatMb(sample.limit)}`
        );
      }
    }

    try {
      if (!state.timer) {
        state.timer = setInterval(tick, SAMPLE_MS);
        // Quick first sample once the page settles a bit.
        setTimeout(tick, 6000);
      }
    } catch {}

    return Object.freeze({
      sample: () => readHeap(),
      history: () => state.samples.slice(),
      tick,
      cleanup: (reason) => {
        const sample = readHeap();
        if (sample) emergencyCleanup(String(reason || 'manual'), sample);
      }
    });
  })();

  const api = Object.freeze({
    version: API_VERSION,
    now,
    safeCall,
    getRoute,
    getConversationIdFromUrl,
    getEditorEl,
    getComposerForm,
    findSendButton,
    findStopButton,
    isGenerating,
    clickSendButton,
    clickStopButton,
    getTurnsRoot,
    getTurnArticles,
    onTurnsChange,
    getTurnRole,
    getTurnId,
    getMessageId,
    onRouteChange,
    memGuard
  });

  try {
    Object.defineProperty(globalThis, API_KEY, { value: api, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }
})();
