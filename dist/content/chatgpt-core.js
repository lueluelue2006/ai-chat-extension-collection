(() => {
  'use strict';

  // ChatGPT shared helpers (ISOLATED world).
  // Goal: reduce duplicated brittle selectors / route polling across ChatGPT-only modules.

  const API_KEY = '__aichat_chatgpt_core_v1__';
  const API_VERSION = 6;
  const BRIDGE_CHANNEL = 'quicknav';
  const BRIDGE_V = 1;
  const BRIDGE_NONCE_DATASET_KEY = 'quicknavBridgeNonceV1';

  // Avoid installing timers/listeners inside iframes.
  const isAllowedFrame = (() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    return !inIframe;
  })();

  if (!isAllowedFrame) return;

  try {
    const prev = globalThis[API_KEY];
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= API_VERSION) return;
  } catch {}

  function getOrCreateBridgeNonce() {
    const fallback = 'quicknav-bridge-fallback';
    try {
      const docEl = document.documentElement;
      if (!docEl) return fallback;
      const existing = String(docEl.dataset?.[BRIDGE_NONCE_DATASET_KEY] || '').trim();
      if (existing) return existing;
      const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      docEl.dataset[BRIDGE_NONCE_DATASET_KEY] = next;
      const stored = String(docEl.dataset?.[BRIDGE_NONCE_DATASET_KEY] || '').trim();
      return stored || next || fallback;
    } catch {
      return fallback;
    }
  }

  const BRIDGE_NONCE = getOrCreateBridgeNonce();

  function postBridgeMessage(type, payload = null) {
    try {
      const msg = Object.assign(
        {
          __quicknav: 1,
          channel: BRIDGE_CHANNEL,
          v: BRIDGE_V,
          nonce: BRIDGE_NONCE
        },
        payload && typeof payload === 'object' ? payload : {}
      );
      msg.type = String(type || '');
      if (!msg.type) return;
      window.postMessage(msg, '*');
    } catch {}
  }

  function now() {
    return Date.now();
  }

  const TURN_HOST_SELECTOR = 'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]';
  const TURN_SELECTOR = `${TURN_HOST_SELECTOR}, [data-testid^="conversation-turn-"]`;
  const MODEL_SWITCHER_SELECTOR =
    'button[data-testid="model-switcher-dropdown-button"], button[aria-label*="Model selector" i], button[aria-label*="current model is" i]';
  const COMPOSER_MODE_TOKEN_RE =
    /\b(?:instant|thinking|pro|extended pro|standard pro|light thinking|heavy thinking)\b|思考|推理|专业|标准|扩展|即时/i;
  const DIRECT_TURN_HOST_SELECTOR = prefixSelectorList(':scope >', TURN_HOST_SELECTOR);
  const WRAPPED_TURN_HOST_SELECTOR = prefixSelectorList(':scope > *', TURN_HOST_SELECTOR);

  function prefixSelectorList(prefix, selectorList) {
    return String(selectorList || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => `${prefix} ${part}`)
      .join(', ');
  }

  function getUiLocale() {
    try {
      return String(document.documentElement?.dataset?.aichatLocale || navigator.language || 'en').trim() || 'en';
    } catch {
      return 'en';
    }
  }

  function uiText(zh, en) {
    return /^zh/i.test(getUiLocale()) ? zh : en;
  }

  function isVisibleElement(el) {
    try {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      return true;
    } catch {
      return false;
    }
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

  function getModelSwitcherButton() {
    try {
      const visible = pickBottomMostVisible(Array.from(document.querySelectorAll(MODEL_SWITCHER_SELECTOR)).filter(isVisibleElement));
      if (visible) return visible;
    } catch {}
    try {
      return document.querySelector(MODEL_SWITCHER_SELECTOR);
    } catch {
      return null;
    }
  }

  function readCurrentModelLabel() {
    try {
      const button = getModelSwitcherButton();
      const aria = String(button?.getAttribute?.('aria-label') || '').trim();
      if (aria && /current model is/i.test(aria)) return aria.replace(/^.*current model is\s*/i, '').trim();
      const text = String(button?.innerText || button?.textContent || '').trim();
      if (text) return text;
      return aria;
    } catch {
      return '';
    }
  }

  function readComposerModeLabel(editorEl) {
    try {
      const form = getComposerForm(editorEl);
      const buttons = Array.from(form?.querySelectorAll?.("button[aria-haspopup='menu'],button") || []);
      for (const button of buttons) {
        const text = String(button?.innerText || button?.textContent || '').trim();
        const aria = String(button?.getAttribute?.('aria-label') || '').trim();
        const combined = `${text} ${aria}`.trim();
        if (!combined) continue;
        if (COMPOSER_MODE_TOKEN_RE.test(combined)) return text || aria;
      }
    } catch {}
    return '';
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

  function normalizeTurnElement(el) {
    try {
      if (!(el instanceof Element)) return null;
      if (el.matches(TURN_HOST_SELECTOR)) return el;
      return el.closest?.(TURN_HOST_SELECTOR) || el.closest?.('[data-testid^="conversation-turn-"]') || null;
    } catch {
      return null;
    }
  }

  function getTurnsRoot() {
    try {
      const stable = document.querySelector('[data-testid="conversation-turns"]');
      if (stable) return stable;
    } catch {}
    // Newer ChatGPT builds may not expose a stable `conversation-turns` container.
    // Fall back to a narrow ancestor derived from the first turn host.
    try {
      const first = normalizeTurnElement(document.querySelector(TURN_SELECTOR));
      if (first) {
        // Prefer a list container whose *direct* children are turn hosts (cheap + ignores inner streaming mutations).
        let cur = first.parentElement;
        const MAX_DEPTH = 12;
        for (let i = 0; cur && cur !== document.body && cur !== document.documentElement && i < MAX_DEPTH; i++) {
          try {
            if (cur.querySelector?.(DIRECT_TURN_HOST_SELECTOR)) return cur;
          } catch {}
          cur = cur.parentElement;
        }

        // Pragmatic fallback: the overall thread container.
        const thread = document.getElementById('thread');
        if (thread && thread.querySelector?.(TURN_SELECTOR)) return thread;

        return first.parentElement || document;
      }
    } catch {}
    return document;
  }

  function getTurnArticles(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    try {
      const list = Array.from(scope.querySelectorAll(TURN_SELECTOR));
      const normalized = [];
      const seen = new Set();
      for (const item of list) {
        const turn = normalizeTurnElement(item);
        if (!turn || seen.has(turn)) continue;
        seen.add(turn);
        normalized.push(turn);
      }
      return normalized;
    } catch {}
    return [];
  }

  function shouldObserveTurnsSubtree(root) {
    try {
      if (!root || typeof root.querySelectorAll !== 'function') return true;
      const deep = root.querySelectorAll(TURN_HOST_SELECTOR).length;
      if (!deep) return true;
      const direct = root.querySelectorAll(DIRECT_TURN_HOST_SELECTOR).length;
      // If all turn hosts are direct children, avoid subtree observation to ignore streaming text mutations.
      if (direct && direct === deep) return false;
      // Common case: turns are wrapped one level deep (e.g. :scope > div > section/article).
      // We can still keep `subtree:false` and just detect wrapper insertions.
      const wrapped = root.querySelectorAll(WRAPPED_TURN_HOST_SELECTOR).length;
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
      if (node.matches(TURN_SELECTOR)) return true;
      if (node.querySelector?.(TURN_SELECTOR)) return true;
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
      const turn = normalizeTurnElement(node);
      if (turn) {
        out.add(turn);
        return;
      }
      const list = node.querySelectorAll?.(TURN_SELECTOR);
      if (!list || !list.length) return;
      for (const el of Array.from(list)) {
        const normalized = normalizeTurnElement(el);
        if (normalized) out.add(normalized);
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
      // Top-frame only.
      if (window.self !== window.top) return null;
    } catch {
      return null;
    }

    const MAX_SAMPLES = 24; // ~12 minutes @ 30s interval
    const SAMPLE_MS = 30 * 1000;
    // WARNING: avoid being too aggressive. This guard is a last resort for 8GB-memory machines.
    // Prefer detecting "runaway growth" over stable high usage.
    const WARN_RATIO = 0.45;
    const CRIT_RATIO = 0.6;
    const WARN_USED_MB = 800;
    const CRIT_USED_MB = 1100;
    const RAPID_GROWTH_WINDOW_MS = 2 * 60 * 1000;
    const RAPID_GROWTH_MB = 300;
    const RAPID_GROWTH_MIN_USED_MB = 500;
    const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;
    const CLEANUP_COOLDOWN_MS = 3 * 60 * 1000;

    const RAPID_DOM_GROWTH_WINDOW_MS = RAPID_GROWTH_WINDOW_MS;
    const RAPID_DOM_GROWTH_NODES = 12000;
    const RAPID_DOM_GROWTH_MIN_DOM_NODES = 20000;
    const RAPID_DOM_GROWTH_MAX_TURN_DELTA = 30;

    const state = {
      timer: 0,
      samples:
        /** @type {Array<{at:number, used:number, total:number, limit:number, ratio:number, dom:number, turns:number, iframes:number, splitLoaded:boolean}>} */ (
          []
        ),
      lastNotifyAt: 0,
      lastCleanupAt: 0,
      lastLevel: 'ok'
    };

    function readSample() {
      try {
        const pm = performance?.memory;
        if (!pm) return null;
        const used = Number(pm.usedJSHeapSize) || 0;
        const total = Number(pm.totalJSHeapSize) || 0;
        const limit = Number(pm.jsHeapSizeLimit) || 0;
        if (!used || !limit) return null;
        const ratio = used / limit;
        const at = now();

        // Extra heuristics: while we cannot access total RSS, we can still detect pathological DOM growth.
        // Keep this cheap: only sample counts (no deep traversal / no text reads).
        let dom = 0;
        let turns = 0;
        let iframes = 0;
        let splitLoaded = false;
        try {
          dom = document.getElementsByTagName('*').length;
        } catch {}
        try {
          turns = document.querySelectorAll(TURN_HOST_SELECTOR).length;
        } catch {}
        try {
          iframes = document.getElementsByTagName('iframe').length;
        } catch {}
        splitLoaded = false;

        // Expose last sample in DOM for quick debugging (DevTools / other worlds).
        try {
          const ds = document.documentElement?.dataset;
          if (ds) {
            ds.quicknavMemHeapMb = String(Math.round(used / 1024 / 1024));
            ds.quicknavMemDomNodes = String(dom || 0);
            ds.quicknavMemTurns = String(turns || 0);
            ds.quicknavMemIframes = String(iframes || 0);
            ds.quicknavMemSplitLoaded = splitLoaded ? '1' : '0';
            ds.quicknavMemAt = String(at);
          }
        } catch {}

        return { at, used, total, limit, ratio, dom, turns, iframes, splitLoaded };
      } catch {
        return null;
      }
    }

    function formatMb(bytes) {
      const n = Number(bytes) || 0;
      if (!Number.isFinite(n) || n <= 0) return '0MB';
      return `${Math.round(n / 1024 / 1024)}MB`;
    }

    function computeGrowthMb(sample) {
      try {
        const windowStart = Number(sample?.at || 0) - RAPID_GROWTH_WINDOW_MS;
        if (!Number.isFinite(windowStart) || windowStart <= 0) return 0;
        let baseline = null;
        for (let i = state.samples.length - 1; i >= 0; i--) {
          const s = state.samples[i];
          if (!s) continue;
          if (Number(s.at || 0) <= windowStart) {
            baseline = s;
            break;
          }
          baseline = s;
        }
        if (!baseline) return 0;
        const diff = Number(sample.used || 0) - Number(baseline.used || 0);
        if (!Number.isFinite(diff) || diff <= 0) return 0;
        return diff / 1024 / 1024;
      } catch {
        return 0;
      }
    }

    function computeDomGrowth(sample) {
      try {
        const windowStart = Number(sample?.at || 0) - RAPID_DOM_GROWTH_WINDOW_MS;
        if (!Number.isFinite(windowStart) || windowStart <= 0) return 0;
        let baseline = null;
        for (let i = state.samples.length - 1; i >= 0; i--) {
          const s = state.samples[i];
          if (!s) continue;
          if (Number(s.at || 0) <= windowStart) {
            baseline = s;
            break;
          }
          baseline = s;
        }
        if (!baseline) return 0;
        const domDiff = Number(sample.dom || 0) - Number(baseline.dom || 0);
        if (!Number.isFinite(domDiff) || domDiff <= 0) return 0;
        const turnDelta = Math.abs(Number(sample.turns || 0) - Number(baseline.turns || 0));
        return { domDiff, turnDelta };
      } catch {
        return 0;
      }
    }

    function notify(title, message) {
      const ts = now();
      if (ts - state.lastNotifyAt < NOTIFY_COOLDOWN_MS) return;
      state.lastNotifyAt = ts;
      try {
        if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
        chrome.runtime.sendMessage(
          { type: 'AISHORTCUTS_NOTIFY', id: 'quicknav_chatgpt_mem_guard', title, message },
          () => void chrome.runtime.lastError
        );
      } catch {}
    }

    function emergencyCleanup(level, sample) {
      const ts = now();
      if (ts - state.lastCleanupAt < CLEANUP_COOLDOWN_MS) return;
      state.lastCleanupAt = ts;

      try {
        // Keep cleanup lightweight; split view has been removed.
      } catch {}

      try {
        // Message Tree runs in MAIN world; close it via the existing QuickNav bridge message.
        postBridgeMessage('AISHORTCUTS_CHATGPT_TREE_CLOSE');
      } catch {}

      try {
        // QuickNav: best-effort de-dupe panel if reinject happened.
        window.chatGptNavDebug?.checkOverlap?.();
      } catch {}

      try {
        // QuickNav: drop ephemeral caches to reduce JS heap pressure.
        window.chatGptNavDebug?.softCleanup?.(`mem:${level}`);
      } catch {}

      try {
        notify(
          uiText('ChatGPT 内存保护：已执行清理', 'ChatGPT memory guard: cleanup completed'),
          `level=${level} used=${formatMb(sample.used)} (${Math.round(sample.ratio * 100)}%) dom=${Number(sample.dom || 0)} ifr=${Number(sample.iframes || 0)} split=${sample.splitLoaded ? '1' : '0'}`
        );
      } catch {}
    }

    function tick() {
      const sample = readSample();
      if (!sample) return;
      state.samples.push(sample);
      if (state.samples.length > MAX_SAMPLES) state.samples.splice(0, state.samples.length - MAX_SAMPLES);

      const ratio = sample.ratio;
      const usedMb = Number(sample.used || 0) / 1024 / 1024;
      const growthMb = computeGrowthMb(sample);
      const domGrowth = computeDomGrowth(sample);
      const domGrowthNodes = domGrowth && typeof domGrowth === 'object' ? Number(domGrowth.domDiff || 0) : 0;
      const domTurnDelta = domGrowth && typeof domGrowth === 'object' ? Number(domGrowth.turnDelta || 0) : 0;
      const isRapidGrowth =
        Number.isFinite(growthMb) &&
        growthMb >= RAPID_GROWTH_MB &&
        Number.isFinite(usedMb) &&
        usedMb >= RAPID_GROWTH_MIN_USED_MB;

      const isRapidDomGrowth =
        Number.isFinite(domGrowthNodes) &&
        domGrowthNodes >= RAPID_DOM_GROWTH_NODES &&
        Number(sample.dom || 0) >= RAPID_DOM_GROWTH_MIN_DOM_NODES &&
        domTurnDelta <= RAPID_DOM_GROWTH_MAX_TURN_DELTA;

      const thresholdLevel =
        (Number.isFinite(usedMb) && usedMb >= CRIT_USED_MB) || ratio >= CRIT_RATIO
          ? 'critical'
          : (Number.isFinite(usedMb) && usedMb >= WARN_USED_MB) || ratio >= WARN_RATIO
            ? 'warning'
            : 'ok';

      const level = isRapidGrowth || isRapidDomGrowth ? 'critical' : thresholdLevel;
      const levelChanged = level !== state.lastLevel;
      state.lastLevel = level;

      if (level === 'critical') {
        notify(
          uiText('ChatGPT 内存预警（严重）', 'ChatGPT memory warning (critical)'),
          `JS heap=${formatMb(sample.used)} / ${formatMb(sample.limit)}${isRapidGrowth ? uiText(`（2min +${Math.round(growthMb)}MB）`, ` (2 min +${Math.round(growthMb)} MB)`) : ''}${isRapidDomGrowth ? uiText(`（DOM 2min +${Math.round(domGrowthNodes)}）`, ` (DOM 2 min +${Math.round(domGrowthNodes)})`) : ''}`
        );
        emergencyCleanup(level, sample);
        return;
      }

      if (level === 'warning' && levelChanged) {
        notify(
          uiText('ChatGPT 内存预警', 'ChatGPT memory warning'),
          `JS heap=${formatMb(sample.used)} / ${formatMb(sample.limit)}`
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
	      sample: () => readSample(),
	      history: () => state.samples.slice(),
	      tick,
	      cleanup: (reason) => {
	        const sample = readSample();
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
    getModelSwitcherButton,
    readCurrentModelLabel,
    readComposerModeLabel,
    findSendButton,
    findStopButton,
    isGenerating,
    clickSendButton,
    clickStopButton,
    getTurnsRoot,
    getTurnArticles,
    getTurnSelector: () => TURN_SELECTOR,
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
