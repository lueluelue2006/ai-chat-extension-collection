// QuickNav main-world scroll guard (injected via chrome.scripting world: MAIN)
(() => {
  'use strict';

  const BRIDGE_CHANNEL = 'quicknav';
  const BRIDGE_V = 1;
  const BRIDGE_NONCE_DATASET_KEY = 'quicknavBridgeNonceV1';

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

  try {
    const GUARD_VERSION = 12;
    const ORIGINALS_KEY = '__quicknavMainScrollGuardOriginalsV1__';

    const prevVersion = Number(window.__quicknavMainScrollGuardVersion || 0);
    /** @type {any} */
    const prevOriginals = window[ORIGINALS_KEY];
    const hasOriginals = !!(prevOriginals && typeof prevOriginals === 'object');

    // If an older, non-upgradable guard is already installed, we can only update after a page refresh.
    if (window.__quicknavMainScrollGuardInstalled && !hasOriginals) return;

    if (prevVersion >= GUARD_VERSION) return;

    window.__quicknavMainScrollGuardInstalled = true;
    window.__quicknavMainScrollGuardVersion = GUARD_VERSION;

    if (!hasOriginals) {
      // Capture unpatched originals once so future updates can safely replace wrappers without stacking.
      const scrollTopDesc =
        Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop') ||
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop') ||
        null;

      window[ORIGINALS_KEY] = {
        scrollIntoView: Element.prototype.scrollIntoView,
        windowScrollTo: window.scrollTo,
        windowScrollBy: window.scrollBy,
        windowScroll: window.scroll,
        elemScrollTo: Element.prototype.scrollTo,
        elemScrollBy: Element.prototype.scrollBy,
        elemScroll: Element.prototype.scroll,
        historyPushState: history.pushState,
        historyReplaceState: history.replaceState,
        scrollTopOwner: scrollTopDesc
          ? {
              proto:
                Object.prototype.hasOwnProperty.call(Element.prototype, 'scrollTop') ? Element.prototype : HTMLElement.prototype,
              desc: scrollTopDesc
            }
          : null
      };
    } else {
      // Backfill originals added in newer versions to keep future updates safe.
      try {
        if (!prevOriginals.windowScroll && typeof window.scroll === 'function') prevOriginals.windowScroll = window.scroll;
        if (!prevOriginals.elemScroll && typeof Element.prototype.scroll === 'function') prevOriginals.elemScroll = Element.prototype.scroll;
        if (!prevOriginals.historyPushState && typeof history.pushState === 'function') prevOriginals.historyPushState = history.pushState;
        if (!prevOriginals.historyReplaceState && typeof history.replaceState === 'function') prevOriginals.historyReplaceState = history.replaceState;
      } catch {}
    }
  } catch {
    // If we can't touch window, do nothing.
    return;
  }

  const ORIGINALS = (() => {
    try {
      const v = window.__quicknavMainScrollGuardOriginalsV1__;
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  })();

  const STATE = {
    enabled: false,
    allowUntil: 0,
    baselineTop: null,
    sourceGateUntil: 0,
    sourceGateReason: ''
  };

  // === Route-change broadcast (MAIN world) ===
  // Let isolated-world scripts react to SPA navigation without a tight polling loop.
  try {
    const ROUTE_HOOK_VERSION = 1;
    const prev = Number(window.__quicknavRouteHookVersion || 0);
    if (prev < ROUTE_HOOK_VERSION) {
      window.__quicknavRouteHookVersion = ROUTE_HOOK_VERSION;

      let postTimer = 0;
      let lastHref = '';
      const schedulePost = (reason) => {
        try {
          const href = String(location.href || '');
          if (!href || href === lastHref) return;
          lastHref = href;
          if (postTimer) return;
          postTimer = window.setTimeout(() => {
            postTimer = 0;
            try {
              postBridgeMessage('QUICKNAV_ROUTE_CHANGE', { href, reason: String(reason || '') });
            } catch {}
          }, 0);
        } catch {}
      };

      const push = ORIGINALS.historyPushState || history.pushState;
      const replace = ORIGINALS.historyReplaceState || history.replaceState;

      if (typeof push === 'function') {
        history.pushState = function () {
          const ret = push.apply(this, arguments);
          schedulePost('pushState');
          return ret;
        };
      }
      if (typeof replace === 'function') {
        history.replaceState = function () {
          const ret = replace.apply(this, arguments);
          schedulePost('replaceState');
          return ret;
        };
      }

      window.addEventListener('popstate', () => schedulePost('popstate'), true);
      window.addEventListener('hashchange', () => schedulePost('hashchange'), true);
      schedulePost('init');
    }
  } catch {}

  const HOST = (() => {
    try {
      return String(location.hostname || '').toLowerCase();
    } catch {
      return '';
    }
  })();

  // How many pixels of downward drift we tolerate before blocking.
  // ChatGPT uses a tighter threshold to reduce visible "one-step jump" after send.
  // Other sites keep the standard threshold to avoid over-correcting micro reflows.
  const DRIFT = HOST === 'chatgpt.com' ? 8 : 16;
  const NAV_TARGET_TOLERANCE = 96;
  const MAX_ALLOW_MS = 8000;
  const SCROLLER_ATTR = 'data-quicknav-scrolllock-scroller';
  const ANCHOR_STYLE_ID = '__quicknav_scrolllock_anchor_style__';
  const CHATGPT_SCROLL_LOCK_KEY = 'cgpt-quicknav:scroll-lock';
  const CHATGPT_SEND_SOURCE_GATE_MS = 65000;
  const CHATGPT_SOURCE_GATE_RUNTIME_KEY = '__quicknavMainScrollGuardSourceGateRuntimeV1__';
  const CHATGPT_TAB_QUEUE_SEND_PROTECT = 'AISHORTCUTS_CHATGPT_TAB_QUEUE_SEND_PROTECT';
  const CHATGPT_GENERIC_SEND_PROTECT = 'AISHORTCUTS_CHATGPT_SEND_PROTECT';
  const ALLOWED_SCROLLLOCK_TYPES = new Set([
    'AISHORTCUTS_SCROLLLOCK_STATE',
    'AISHORTCUTS_SCROLLLOCK_BASELINE',
    'AISHORTCUTS_SCROLLLOCK_ALLOW',
    CHATGPT_TAB_QUEUE_SEND_PROTECT,
    CHATGPT_GENERIC_SEND_PROTECT
  ]);
  let __lastMarkedScroller = null;

  const now = () => Date.now();
  let __enabledDatasetCached = null;
  let __enabledDatasetSyncAt = 0;

  // Dataset reads are relatively expensive and can land on very hot paths
  // (e.g. scrollTop setter wrappers). Throttle them aggressively.
  let __allowUntilDatasetCached = 0;
  let __allowUntilDatasetCachedAt = 0;
  let __baselineDatasetCached = null;
  let __baselineDatasetCachedAt = 0;
  let __navExpectedDatasetCached = null;
  let __navExpectedDatasetCachedAt = 0;
  let __perfHotDatasetCached = false;
  let __perfHotDatasetCachedAt = 0;

  function readNumberDataset(key) {
    try {
      const v = document.documentElement?.dataset?.[key];
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  function readEnabledFromDataset() {
    try {
      const v = document.documentElement?.dataset?.quicknavScrollLockEnabled;
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
    } catch {}
    return null;
  }

  function readChatgptScrollLockPreference() {
    try {
      const v = readEnabledFromDataset();
      if (typeof v === 'boolean') return v;
    } catch {}
    try {
      if (HOST === 'chatgpt.com') {
        const raw = window.localStorage?.getItem?.(CHATGPT_SCROLL_LOCK_KEY);
        if (raw === '0') return false;
        if (raw === '1') return true;
      }
    } catch {}
    try {
      if (typeof STATE.enabled === 'boolean' && STATE.enabled) return true;
    } catch {}
    return HOST === 'chatgpt.com';
  }

  function syncEnabledFromDataset(ts = now(), force = false) {
    if (!force) {
      const last = Number(__enabledDatasetSyncAt || 0);
      if (ts - last < 250) return;
    }
    __enabledDatasetSyncAt = ts;
    const v = readEnabledFromDataset();
    if (typeof v !== 'boolean') return;
    if (__enabledDatasetCached === v && STATE.enabled === v) return;
    __enabledDatasetCached = v;
    if (STATE.enabled !== v) {
      STATE.enabled = v;
      try {
        refreshScrollerMarker();
      } catch {}
    }
  }

  function readAllowUntilFromDataset(ts = now()) {
    const last = Number(__allowUntilDatasetCachedAt || 0);
    if (ts - last < 80) return __allowUntilDatasetCached;
    __allowUntilDatasetCachedAt = ts;
    const n = readNumberDataset('quicknavAllowScrollUntil');
    __allowUntilDatasetCached = n && n > 0 ? n : 0;
    return __allowUntilDatasetCached;
  }

  function readBaselineFromDataset(ts = now()) {
    const last = Number(__baselineDatasetCachedAt || 0);
    if (ts - last < 80) return __baselineDatasetCached;
    __baselineDatasetCachedAt = ts;
    const n = readNumberDataset('quicknavScrollLockBaseline');
    __baselineDatasetCached = n != null && n >= 0 ? Math.max(0, Math.round(n)) : null;
    return __baselineDatasetCached;
  }

  function clearScrollAllowWindowForSend() {
    STATE.allowUntil = 0;
    __allowUntilDatasetCached = 0;
    __allowUntilDatasetCachedAt = now();
    try {
      const docEl = document.documentElement;
      if (docEl?.dataset) {
        docEl.dataset.quicknavAllowScrollUntil = '0';
        docEl.dataset.quicknavAllowScrollReason = 'send-source-gate';
      }
    } catch {}
  }

  function readNavExpectedFromDataset(ts = now()) {
    const last = Number(__navExpectedDatasetCachedAt || 0);
    if (ts - last < 40) return __navExpectedDatasetCached;
    __navExpectedDatasetCachedAt = ts;
    const top = readNumberDataset('quicknavNavExpectedTop');
    const until = readNumberDataset('quicknavNavExpectedUntil');
    __navExpectedDatasetCached =
      top != null && top >= 0 && until != null && until > ts
        ? { top: Math.max(0, Math.round(top)), until }
        : null;
    return __navExpectedDatasetCached;
  }

  function isExpectedAllowedTarget(targetTop, ts = now()) {
    const expected = readNavExpectedFromDataset(ts);
    if (!expected) return true;
    const target = Number(targetTop);
    if (!Number.isFinite(target)) return false;
    return Math.abs(target - expected.top) <= NAV_TARGET_TOLERANCE;
  }

  function readPerfHotFromDataset(ts = now()) {
    const last = Number(__perfHotDatasetCachedAt || 0);
    if (ts - last < 80) return __perfHotDatasetCached;
    __perfHotDatasetCachedAt = ts;
    try {
      const v = document.documentElement?.dataset?.cgptperfHot;
      __perfHotDatasetCached = v === '1' || v === 'true';
    } catch {
      __perfHotDatasetCached = false;
    }
    return __perfHotDatasetCached;
  }

  function isAllowed(ts = now(), targetTop = null) {
    // Do not bypass scroll-lock just because the page is hot/heavy. On long ChatGPT
    // threads, allowing send-time autoscroll forces the browser to materialize the
    // whole range between the user's reading position and the composer.
    void ts;
    try {
      syncEnabledFromDataset(ts);
    } catch {}
    if (!STATE.enabled) return true;
    if (ts < (STATE.allowUntil || 0)) return isExpectedAllowedTarget(targetTop, ts);
    // Cross-world allow window: use DOM dataset (survives hot reinject; auto-expires).
    const until = readAllowUntilFromDataset(ts);
    if (until && ts < until) return isExpectedAllowedTarget(targetTop, ts);
    if (STATE.sourceGateUntil && ts < STATE.sourceGateUntil) return false;
    return false;
  }

  function clampAllow(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.min(MAX_ALLOW_MS, Math.round(n)));
  }

  // === state sync from content script (isolated world) ===
  window.addEventListener(
    'message',
    (e) => {
      try {
        if (!e || e.source !== window) return;
        const msg = e.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.__quicknav !== 1) return;
        if (msg.channel !== BRIDGE_CHANNEL) return;
        if (msg.v !== BRIDGE_V) return;
        if (msg.nonce !== BRIDGE_NONCE) return;
        const type = typeof msg.type === 'string' ? msg.type : '';
        if (!ALLOWED_SCROLLLOCK_TYPES.has(type)) return;

        if (type === 'AISHORTCUTS_SCROLLLOCK_STATE') {
          STATE.enabled = !!msg.enabled;
          __enabledDatasetCached = STATE.enabled;
          __enabledDatasetSyncAt = now();
          // When scroll-lock toggles, also toggle scroll anchoring mitigation.
          try {
            refreshScrollerMarker();
          } catch {}
          return;
        }

        if (type === 'AISHORTCUTS_SCROLLLOCK_BASELINE') {
          const top = Number(msg.top);
          if (Number.isFinite(top)) {
            const nextTop = Math.max(0, Math.round(top));
            STATE.baselineTop = nextTop;
            // Important: invalidate/refresh dataset baseline cache immediately.
            // Without this, a recently cached stale value (up to ~80ms) can win the race
            // right after send and allow one visible downward "jump" before correction.
            __baselineDatasetCached = nextTop;
            __baselineDatasetCachedAt = now();
            try {
              __cachedScroller = null;
              __cachedScrollerAt = 0;
              refreshScrollerMarker(getChatScroller());
            } catch {}
          }
          return;
        }

        if (type === 'AISHORTCUTS_SCROLLLOCK_ALLOW') {
          const ms = clampAllow(msg.ms);
          if (!ms) return;
          STATE.allowUntil = Math.max(STATE.allowUntil || 0, now() + ms);
          return;
        }

        if (type === CHATGPT_TAB_QUEUE_SEND_PROTECT || type === CHATGPT_GENERIC_SEND_PROTECT) {
          const phase = String(msg.phase || '');
          if (phase === 'failed') return;
          const prefix = type === CHATGPT_TAB_QUEUE_SEND_PROTECT ? 'tab-queue' : 'send';
          armChatgptSendSourceGate(`${prefix}-${phase || 'protect'}`);
        }
      } catch {
        // ignore
      }
    },
    true
  );

  function ensureAnchorStyle() {
    try {
      if (document.getElementById(ANCHOR_STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = ANCHOR_STYLE_ID;
      // Disable scroll anchoring inside the active chat scroller while locked.
      // This avoids subtle scrollTop changes caused by reflow (e.g. Copy -> Copied).
      style.textContent = `
        [${SCROLLER_ATTR}="1"] { overflow-anchor: none !important; }
        [${SCROLLER_ATTR}="1"] * { overflow-anchor: none !important; }
      `;
      (document.head || document.documentElement).appendChild(style);
    } catch {}
  }

  // === open shadow DOM helpers (Gemini Enterprise) ===
  function walkOpenShadows(start, visit) {
    const stack = [start];
    const seen = new Set();
    while (stack.length) {
      const root = stack.pop();
      if (!root || seen.has(root)) continue;
      seen.add(root);
      try {
        visit(root);
      } catch {}
      if (!root.querySelectorAll) continue;
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el && el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
  }

  function deepQueryFirst(start, selector) {
    let found = null;
    walkOpenShadows(start, (root) => {
      if (found || !root.querySelector) return;
      const hit = root.querySelector(selector);
      if (hit) found = hit;
    });
    return found;
  }

  function getGeminiRoot() {
    try {
      return document.querySelector('ucs-standalone-app')?.shadowRoot || null;
    } catch {
      return null;
    }
  }

  let __cachedGeminiScroller = null;
  function getGeminiScroller() {
    try {
      if (__cachedGeminiScroller && __cachedGeminiScroller.isConnected) return __cachedGeminiScroller;
      const root = getGeminiRoot();
      if (!root) return null;
      const scroller = deepQueryFirst(root, 'div.chat-mode-scroller');
      __cachedGeminiScroller = scroller || null;
      return __cachedGeminiScroller;
    } catch {
      return null;
    }
  }

  // === generic scroll container detection (ChatGPT / Genspark fallback) ===
  function isScrollableY(el) {
    if (!el) return false;
    let style;
    try {
      style = getComputedStyle(el);
    } catch {
      return false;
    }
    const oy = style?.overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
    return (el.scrollHeight || 0) > (el.clientHeight || 0) + 1;
  }

  function findClosestScrollContainer(start) {
    let el = start || null;
    while (el && el !== document.documentElement && el !== document.body) {
      if (isScrollableY(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function detectChatScrollerFallback() {
    const doc = document.scrollingElement || document.documentElement;
    const host = HOST;

    const kimiScroller = (() => {
      try {
        if (host !== 'kimi.com' && host !== 'www.kimi.com') return null;

        const seeds = [
          document.querySelector?.('.chat-detail-main') || null,
          document.querySelector?.('[class*="chat-detail-main"]') || null,
          document.querySelector?.('.ds-scroll-area') || null,
          document.querySelector?.('[data-testid="conversation-turns"]') || null,
          document.querySelector?.('[data-message-id]') || null,
          document.querySelector?.('main') || document.querySelector?.('[role="main"]') || document.getElementById?.('main') || null
        ].filter(Boolean);

        for (const seed of seeds) {
          if (isScrollableY(seed)) return seed;
          const closest = findClosestScrollContainer(seed);
          if (closest) return closest;
        }
      } catch {
        return null;
      }
      return null;
    })();

    if (kimiScroller) return kimiScroller;

    const qwenScroller = (() => {
      try {
        if (host !== 'chat.qwen.ai') return null;
        const byId = document.getElementById?.('chat-messages-scroll-container') || null;
        if (byId && isScrollableY(byId)) return byId;
        const qwenTurn = document.querySelector?.('.qwen-chat-message') || byId;
        if (!qwenTurn) return null;
        return findClosestScrollContainer(qwenTurn);
      } catch {
        return null;
      }
    })();

    if (qwenScroller) return qwenScroller;

    const grokScrollerSeed = (() => {
      try {
        if (host !== 'grok.com') return null;
        // Grok conversation messages usually have ids like "response-<uuid>".
        // Using a message element as seed lets us climb to the real overflow scroller.
        return document.querySelector?.('[id^="response-"]') || null;
      } catch {
        return null;
      }
    })();

    const deepseekScroller = (() => {
      try {
        const list = document.querySelectorAll?.('.ds-scroll-area');
        if (!list || !list.length) return null;
        for (const el of list) {
          if (isScrollableY(el)) return el;
        }
      } catch {}
      return null;
    })();

    const ernieScroller = document.getElementById?.('DIALOGUE_CONTAINER_ID') || null;
    const zaiScroller = document.getElementById?.('messages-container') || null;
    const geminiAppScroller = document.querySelector?.('infinite-scroller.chat-history') || null;
    const turns = document.querySelector?.('[data-testid="conversation-turns"]') || null;
    const msg = document.querySelector?.('[data-message-id]') || null;
    const gensparkTurn = document.querySelector?.('.conversation-statement') || null;
    const main = document.querySelector?.('main') || document.querySelector?.('[role="main"]') || document.getElementById?.('main') || null;

    const seeds = [grokScrollerSeed, deepseekScroller, ernieScroller, zaiScroller, geminiAppScroller, turns, msg, gensparkTurn, main, document.body].filter(Boolean);
    for (const s of seeds) {
      const closest = findClosestScrollContainer(s);
      if (closest) return closest;
    }

    const candidates = [
      turns?.parentElement,
      msg?.parentElement,
      gensparkTurn?.parentElement,
      main,
      doc
    ].filter(Boolean);

    for (const c of candidates) {
      if (isScrollableY(c)) return c;
    }

    return doc;
  }

  let __cachedScroller = null;
  let __cachedScrollerAt = 0;
  let __cachedScrollerRect = null;
  let __cachedScrollerRectAt = 0;
  const __targetRectCache = new WeakMap();

  function clearScrollerMarker() {
    try {
      if (__lastMarkedScroller && __lastMarkedScroller.removeAttribute) {
        __lastMarkedScroller.removeAttribute(SCROLLER_ATTR);
      }
    } catch {}
    __lastMarkedScroller = null;
  }

  function setScrollerMarker(el) {
    try {
      if (!el || !el.setAttribute) return;
      if (__lastMarkedScroller === el) return;
      clearScrollerMarker();
      ensureAnchorStyle();
      el.setAttribute(SCROLLER_ATTR, '1');
      __lastMarkedScroller = el;
    } catch {}
  }

  function getCoreChatScroller() {
    try {
      if (HOST !== 'chatgpt.com') return null;
      const core = window.__aichat_chatgpt_core_main_v1__ || null;
      if (!core || typeof core.getChatScrollContainer !== 'function') return null;
      const sc = core.getChatScrollContainer(false);
      return sc && sc.isConnected ? sc : null;
    } catch {
      return null;
    }
  }

  function refreshScrollerMarker(scroller = null) {
    try {
      if (!STATE.enabled) return clearScrollerMarker();
      const coreScroller = getCoreChatScroller();
      const sc =
        (scroller && scroller.isConnected ? scroller : null) ||
        (coreScroller && coreScroller.isConnected ? coreScroller : null) ||
        (__cachedScroller && __cachedScroller.isConnected ? __cachedScroller : null) ||
        getGeminiScroller() ||
        detectChatScrollerFallback();
      if (!sc) return clearScrollerMarker();
      // If the chat uses the window scroller, mark documentElement as the best-effort root.
      if (isWindowScroller(sc)) return setScrollerMarker(document.scrollingElement || document.documentElement);
      return setScrollerMarker(sc);
    } catch {
      return clearScrollerMarker();
    }
  }

  function getChatScroller() {
    const t = now();
    if (__cachedScroller && __cachedScroller.isConnected && (t - __cachedScrollerAt) < 1200) {
      if (HOST === 'chatgpt.com' && isWindowScroller(__cachedScroller)) {
        const coreScroller = getCoreChatScroller();
        if (coreScroller && !isWindowScroller(coreScroller)) {
          __cachedScroller = coreScroller;
          __cachedScrollerAt = t;
          try {
            if (STATE.enabled) refreshScrollerMarker(__cachedScroller);
            else clearScrollerMarker();
          } catch {}
          return __cachedScroller;
        }
      }
      return __cachedScroller;
    }
    __cachedScrollerAt = t;
    let sc = getCoreChatScroller();
    if (!sc) sc = getGeminiScroller() || detectChatScrollerFallback();
    __cachedScroller = sc || null;
    try {
      if (STATE.enabled) refreshScrollerMarker(__cachedScroller);
      else clearScrollerMarker();
    } catch {}
    return __cachedScroller;
  }

  function describeSourceGate() {
    return {
      enabled: !!STATE.enabled,
      baselineTop: Number.isFinite(Number(STATE.baselineTop)) ? Number(STATE.baselineTop) : null,
      sourceGateUntil: Number(STATE.sourceGateUntil) || 0,
      sourceGateReason: String(STATE.sourceGateReason || ''),
      allowUntil: Number(STATE.allowUntil) || 0
    };
  }

  function isChatgptHeavyStreaming() {
    try {
      if (HOST !== 'chatgpt.com') return false;
      const docEl = document.documentElement;
      const perfHeavy = docEl?.dataset?.cgptperfHot === '1' || docEl?.dataset?.cgptperfHeavy === '1';
      if (!perfHeavy) return false;
      const core = window.__aichat_chatgpt_core_main_v1__ || null;
      return !!(core && typeof core.isGenerating === 'function' && core.isGenerating());
    } catch {
      return false;
    }
  }

  function isWindowScroller(el) {
    const doc = document.documentElement;
    const se = document.scrollingElement || doc;
    return !el || el === window || el === document || el === document.body || el === doc || el === se;
  }

  function getCodeInteractionRoot(node) {
    try {
      const el =
        node && node.nodeType === 1
          ? node
          : node && node.nodeType === 3
            ? node.parentElement
            : null;
      if (!el || !el.closest) return null;
      const direct =
        el.closest('.cm-scroller, .cm-editor, pre, code, [id="code-block-viewer"], [data-testid*="code"], [class*="codeBlock"], [class*="CodeBlock"]') ||
        null;
      if (direct) return direct;

      let cur = el;
      for (let depth = 0; cur && depth < 4; depth += 1, cur = cur.parentElement) {
        if (!(cur instanceof HTMLElement)) continue;
        const cls = String(cur.className || '');
        if (!/(overflow-y-auto|overflow-auto|overflow-scroll)/.test(cls)) continue;
        if (!cur.closest?.('[data-testid^="conversation-turn-"], [data-message-id], .markdown, .prose')) continue;
        const rangeY = Math.max(0, (cur.scrollHeight || 0) - (cur.clientHeight || 0));
        const rangeX = Math.max(0, (cur.scrollWidth || 0) - (cur.clientWidth || 0));
        if (rangeY < 1 && rangeX < 1) continue;
        if (cur.clientHeight >= (window.innerHeight || 0) * 0.92) continue;
        if (!cur.querySelector?.('pre, code, [id="code-block-viewer"], [data-testid*="code"], [class*="codeBlock"], [class*="CodeBlock"]')) continue;
        return cur;
      }
      return null;
    } catch {
      return null;
    }
  }

  function shouldBypassNestedCodeScroll(el) {
    if (!(el instanceof Element) || isWindowScroller(el)) return false;
    const codeRoot = getCodeInteractionRoot(el);
    if (!codeRoot) return false;
    const cached = __cachedScroller && __cachedScroller.isConnected ? __cachedScroller : null;
    return !(cached && (cached === el || cached === codeRoot));
  }

  function shouldBypassCodeIntoView(target) {
    const codeRoot = getCodeInteractionRoot(target);
    if (!codeRoot) return false;
    const cached = __cachedScroller && __cachedScroller.isConnected ? __cachedScroller : null;
    return !(cached && cached === codeRoot);
  }

  function asElement(node) {
    try {
      if (!node) return null;
      if (node.nodeType === 1) return node;
      if (node.nodeType === 3) return node.parentElement || null;
    } catch {}
    return null;
  }

  function isProbablyChatgptComposerTextTarget(target) {
    try {
      const el = asElement(target);
      if (!el || !el.closest) return false;
      if (el.closest('#prompt-textarea, textarea[name="prompt-textarea"], [contenteditable="true"][id="prompt-textarea"], [role="textbox"][id="prompt-textarea"]')) {
        return true;
      }
      const form = el.closest('form');
      return !!(form && form.querySelector?.('#prompt-textarea, textarea[name="prompt-textarea"], [contenteditable="true"][id="prompt-textarea"], [role="textbox"][id="prompt-textarea"]'));
    } catch {
      return false;
    }
  }

  function getChatgptComposerFormFromTarget(target) {
    try {
      const el = asElement(target);
      if (!el || !el.closest) return null;
      const form = el.closest('form');
      if (!form || !form.querySelector) return null;
      if (form.querySelector('#prompt-textarea, textarea[name="prompt-textarea"], [contenteditable="true"][id="prompt-textarea"], [role="textbox"][id="prompt-textarea"]')) {
        return form;
      }
      return null;
    } catch {
      return null;
    }
  }

  function getChatgptComposerTextFromTarget(target) {
    try {
      const form = getChatgptComposerFormFromTarget(target);
      const editor =
        form?.querySelector?.('#prompt-textarea, textarea[name="prompt-textarea"], [contenteditable="true"][id="prompt-textarea"], [role="textbox"][id="prompt-textarea"]') ||
        document.querySelector?.('#prompt-textarea, textarea[name="prompt-textarea"], [contenteditable="true"][id="prompt-textarea"], [role="textbox"][id="prompt-textarea"]');
      if (!editor) return '';
      if ('value' in editor) return String(editor.value || '').trim();
      return String(editor.innerText || editor.textContent || '').trim();
    } catch {
      return '';
    }
  }

  function isChatgptStopLikeControl(button) {
    try {
      if (!button) return false;
      const text = [
        button.getAttribute?.('aria-label') || '',
        button.getAttribute?.('title') || '',
        button.getAttribute?.('data-testid') || '',
        button.textContent || ''
      ].join(' ').toLowerCase();
      return /stop|cancel|interrupt|停止|取消|中断/.test(text) && !/send|submit|发送|提交/.test(text);
    } catch {
      return false;
    }
  }

  function isChatgptSendActionTarget(target) {
    try {
      const el = asElement(target);
      if (!el || !el.closest) return false;
      const button = el.closest(
        'button#composer-submit-button, button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"], button[aria-label*="发送"], form button[type="submit"]'
      );
      if (!button || isChatgptStopLikeControl(button)) return false;
      const form = getChatgptComposerFormFromTarget(button);
      if (!form) return false;
      if (button.disabled || button.getAttribute?.('aria-disabled') === 'true') return false;
      return true;
    } catch {
      return false;
    }
  }

  function armChatgptSendSourceGate(reason = 'send') {
    try {
      if (HOST !== 'chatgpt.com') return false;
      if (!readChatgptScrollLockPreference()) return false;
      const sc = getChatScroller();
      if (!sc) return false;
      const baseline = Math.max(0, Math.round(getScrollPos(sc)));
      const ts = now();
      STATE.enabled = true;
      STATE.baselineTop = baseline;
      STATE.sourceGateUntil = Math.max(Number(STATE.sourceGateUntil) || 0, ts + CHATGPT_SEND_SOURCE_GATE_MS);
      STATE.sourceGateReason = String(reason || 'send');
      clearScrollAllowWindowForSend();
      __enabledDatasetCached = true;
      __enabledDatasetSyncAt = ts;
      __baselineDatasetCached = baseline;
      __baselineDatasetCachedAt = ts;
      try {
        const docEl = document.documentElement;
        if (docEl?.dataset) {
          docEl.dataset.quicknavScrollLockEnabled = '1';
          docEl.dataset.quicknavScrollLockBaseline = String(baseline);
          docEl.dataset.quicknavScrollLockProtectReason = `source-${STATE.sourceGateReason}`;
          docEl.dataset.quicknavScrollLockSourceGateUntil = String(STATE.sourceGateUntil);
        }
      } catch {}
      try {
        refreshScrollerMarker(sc);
      } catch {}
      return true;
    } catch {
      return false;
    }
  }

  function getScrollPos(el) {
    if (!el) return window.scrollY || 0;
    if (isWindowScroller(el)) {
      const se = document.scrollingElement || document.documentElement;
      return se ? se.scrollTop : (window.scrollY || 0);
    }
    return el.scrollTop || 0;
  }

  function readRectCached(el, ttl = 16) {
    if (!el || !el.getBoundingClientRect) return null;
    const ts = now();
    if (el === __cachedScroller) {
      if (__cachedScrollerRect && (ts - __cachedScrollerRectAt) <= ttl) return __cachedScrollerRect;
      const rect = el.getBoundingClientRect();
      __cachedScrollerRect = rect;
      __cachedScrollerRectAt = ts;
      return rect;
    }
    try {
      const cached = __targetRectCache.get(el);
      if (cached && (ts - cached.at) <= ttl) return cached.rect;
    } catch {}
    const rect = el.getBoundingClientRect();
    try { __targetRectCache.set(el, { rect, at: ts }); } catch {}
    return rect;
  }

  function getBaselineTop(scroller) {
    // Prefer the DOM dataset baseline written by the isolated-world content script.
    // This is synchronous (no postMessage race) and survives hot-reinjects.
    const ts = now();
    const cached = readBaselineFromDataset(ts);
    if (typeof cached === 'number') return cached;
    const b = Number(STATE.baselineTop);
    if (Number.isFinite(b) && b >= 0) return b;
    return getScrollPos(scroller);
  }

  function getScrollTopFromArgs(args, current) {
    try {
      if (args.length === 1 && args[0] && typeof args[0] === 'object') {
        const top = args[0].top ?? args[0].y;
        return Number.isFinite(top) ? top : current;
      }
      if (args.length >= 2) {
        const top = args[1];
        return Number.isFinite(top) ? top : current;
      }
    } catch {}
    return current;
  }

  function getScrollDeltaFromArgs(args) {
    try {
      if (args.length === 1 && args[0] && typeof args[0] === 'object') return args[0].top ?? args[0].y ?? 0;
      if (args.length >= 2) return args[1] ?? 0;
    } catch {}
    return 0;
  }

  function shouldBlockElementScroll(el, nextTop) {
    if (shouldBypassNestedCodeScroll(el)) return false;
    const cached = __cachedScroller && __cachedScroller.isConnected ? __cachedScroller : null;
    if (cached && !isWindowScroller(cached) && el !== cached) return false;

    const ts = now();
    // Occasionally refresh the cached scroller in case SPA navigation/hydration replaced it.
    // This also allows switching from an early window-scroller guess to the real nested chat scroller.
    if (!isChatgptHeavyStreaming() && cached && ts - (__cachedScrollerAt || 0) > 1200) {
      try {
        getChatScroller();
      } catch {}
    }

    if (cached) {
      if (isWindowScroller(cached)) return false;
      if (el !== cached) return false;
      const baseline = getBaselineTop(cached);
      const targetTop = Number(nextTop);
      if (!Number.isFinite(targetTop)) return false;
      if (isAllowed(ts, targetTop)) return false;
      if (targetTop > baseline + DRIFT) return true;
      return false;
    }

    const sc = getChatScroller();
    if (!sc || isWindowScroller(sc) || el !== sc) return false;
    const baseline = getBaselineTop(sc);
    const targetTop = Number(nextTop);
    if (!Number.isFinite(targetTop)) return false;
    if (isAllowed(ts, targetTop)) return false;
    if (targetTop > baseline + DRIFT) return true;
    return false;
  }

  function shouldBlockWindowScroll(nextTop) {
    const ts = now();
    if (!isChatgptHeavyStreaming() && __cachedScroller && __cachedScroller.isConnected && ts - (__cachedScrollerAt || 0) > 1200) {
      try {
        getChatScroller();
      } catch {}
    }
    const cached = __cachedScroller && __cachedScroller.isConnected ? __cachedScroller : null;
    if (cached) {
      if (!isWindowScroller(cached)) return false;
      const baseline = getBaselineTop(cached);
      const targetTop = Number(nextTop);
      if (!Number.isFinite(targetTop)) return false;
      if (isAllowed(ts, targetTop)) return false;
      if (targetTop > baseline + DRIFT) return true;
      return false;
    }

    const sc = getChatScroller();
    if (!sc || !isWindowScroller(sc)) return false;
    const baseline = getBaselineTop(sc);
    const targetTop = Number(nextTop);
    if (!Number.isFinite(targetTop)) return false;
    if (isAllowed(ts, targetTop)) return false;
    if (targetTop > baseline + DRIFT) return true;
    return false;
  }

  function shouldBlockIntoView(target) {
    if (shouldBypassCodeIntoView(target)) return false;
    const ts = now();
    const sc = getChatScroller();
    if (!sc || !target || !target.getBoundingClientRect) return false;

    const r = readRectCached(target);
    if (!r) return false;
    if (isWindowScroller(sc)) {
      const targetTop = getScrollPos(sc) + Number(r.top || 0);
      if (isAllowed(ts, targetTop)) return false;
      // Only block downward scroll.
      const bottom = (window.innerHeight || 0) - 4;
      return r.bottom > bottom + 1;
    }

    try {
      if (!sc.contains(target)) return false;
    } catch {
      return false;
    }

    const sr = readRectCached(sc);
    if (!sr) return false;
    const targetTop = getScrollPos(sc) + (Number(r.top || 0) - Number(sr.top || 0));
    if (isAllowed(ts, targetTop)) return false;
    // Only block if target is below the visible viewport of scroller.
    return r.bottom > sr.bottom + 1;
  }

  // === install guards ===
  const ORIGINAL_SCROLL_INTO_VIEW = typeof ORIGINALS.scrollIntoView === 'function' ? ORIGINALS.scrollIntoView : Element.prototype.scrollIntoView;
  const ORIGINAL_WINDOW_SCROLL_TO = typeof ORIGINALS.windowScrollTo === 'function' ? ORIGINALS.windowScrollTo : window.scrollTo;
  const ORIGINAL_WINDOW_SCROLL_BY = typeof ORIGINALS.windowScrollBy === 'function' ? ORIGINALS.windowScrollBy : window.scrollBy;
  const ORIGINAL_WINDOW_SCROLL = typeof ORIGINALS.windowScroll === 'function' ? ORIGINALS.windowScroll : window.scroll;
  const ORIGINAL_ELEM_SCROLL_TO = typeof ORIGINALS.elemScrollTo === 'function' ? ORIGINALS.elemScrollTo : Element.prototype.scrollTo;
  const ORIGINAL_ELEM_SCROLL_BY = typeof ORIGINALS.elemScrollBy === 'function' ? ORIGINALS.elemScrollBy : Element.prototype.scrollBy;
  const ORIGINAL_ELEM_SCROLL = typeof ORIGINALS.elemScroll === 'function' ? ORIGINALS.elemScroll : Element.prototype.scroll;

  // scrollTop setter is the key path for Gemini / ChatGPT autoscroll.
  const scrollTopOwner =
    (ORIGINALS && ORIGINALS.scrollTopOwner && typeof ORIGINALS.scrollTopOwner === 'object' ? ORIGINALS.scrollTopOwner : null) ||
    (() => {
      const d1 = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      if (d1 && typeof d1.get === 'function' && typeof d1.set === 'function') return { proto: Element.prototype, desc: d1 };
      const d2 = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
      if (d2 && typeof d2.get === 'function' && typeof d2.set === 'function') return { proto: HTMLElement.prototype, desc: d2 };
      return null;
    })();

  if (scrollTopOwner?.desc?.configurable) {
    try {
      Object.defineProperty(scrollTopOwner.proto, 'scrollTop', {
        configurable: true,
        enumerable: scrollTopOwner.desc.enumerable,
        get: function () {
          return scrollTopOwner.desc.get.call(this);
        },
        set: function (v) {
          try {
            if (shouldBlockElementScroll(this, v)) return;
            // If the chat scroller is window-based, it might set on documentElement/body.
            if (isWindowScroller(this) && shouldBlockWindowScroll(v)) return;
          } catch {}
          return scrollTopOwner.desc.set.call(this, v);
        }
      });
    } catch {}
  }

  // scrollIntoView
  if (typeof ORIGINAL_SCROLL_INTO_VIEW === 'function') {
    Element.prototype.scrollIntoView = function (options) {
      if (shouldBlockIntoView(this)) return;
      return ORIGINAL_SCROLL_INTO_VIEW.call(this, options);
    };
  }

  // window.scrollTo / scrollBy (only when chat scroller is window-based)
  if (typeof ORIGINAL_WINDOW_SCROLL_TO === 'function') {
    window.scrollTo = function () {
      const current = getScrollPos(getChatScroller());
      const targetTop = getScrollTopFromArgs(arguments, current);
      if (shouldBlockWindowScroll(targetTop)) return;
      return ORIGINAL_WINDOW_SCROLL_TO.apply(window, arguments);
    };
  }

  // window.scroll (alias of scrollTo; some apps call this)
  if (typeof ORIGINAL_WINDOW_SCROLL === 'function') {
    window.scroll = function () {
      const current = getScrollPos(getChatScroller());
      const targetTop = getScrollTopFromArgs(arguments, current);
      if (shouldBlockWindowScroll(targetTop)) return;
      return ORIGINAL_WINDOW_SCROLL.apply(window, arguments);
    };
  }

  if (typeof ORIGINAL_WINDOW_SCROLL_BY === 'function') {
    window.scrollBy = function () {
      if (!isAllowed()) {
        const sc = getChatScroller();
        if (sc && isWindowScroller(sc)) {
          const dy = getScrollDeltaFromArgs(arguments);
          if (Number(dy) > DRIFT) return;
        }
      }
      return ORIGINAL_WINDOW_SCROLL_BY.apply(window, arguments);
    };
  }

  // element.scrollTo / scrollBy (only when called on the chat scroller element)
  if (typeof ORIGINAL_ELEM_SCROLL_TO === 'function') {
    Element.prototype.scrollTo = function () {
      const current = getScrollPos(this);
      const targetTop = getScrollTopFromArgs(arguments, current);
      if (shouldBlockElementScroll(this, targetTop)) return;
      return ORIGINAL_ELEM_SCROLL_TO.apply(this, arguments);
    };
  }

  // Element.scroll (alias of scrollTo; ChatGPT uses this for autoscroll)
  if (typeof ORIGINAL_ELEM_SCROLL === 'function') {
    Element.prototype.scroll = function () {
      const current = getScrollPos(this);
      const targetTop = getScrollTopFromArgs(arguments, current);
      try {
        if (shouldBlockElementScroll(this, targetTop)) return;
        // If the chat scroller is window-based, it might call .scroll on documentElement/body.
        if (isWindowScroller(this) && shouldBlockWindowScroll(targetTop)) return;
      } catch {}
      return ORIGINAL_ELEM_SCROLL.apply(this, arguments);
    };
  }

  if (typeof ORIGINAL_ELEM_SCROLL_BY === 'function') {
    Element.prototype.scrollBy = function () {
      if (!isAllowed()) {
        const dy = getScrollDeltaFromArgs(arguments);
        if (Number(dy) > DRIFT && shouldBlockElementScroll(this, getScrollPos(this) + dy)) return;
      }
      return ORIGINAL_ELEM_SCROLL_BY.apply(this, arguments);
    };
  }

  function installChatgptSendSourceGate() {
    try {
      if (HOST !== 'chatgpt.com') return;
      try {
        window[CHATGPT_SOURCE_GATE_RUNTIME_KEY]?.dispose?.();
      } catch {}

      const disposers = [];
      const on = (target, type, listener, options) => {
        try {
          target.addEventListener(type, listener, options);
          disposers.push(() => {
            try { target.removeEventListener(type, listener, options); } catch {}
          });
        } catch {}
      };

      const maybeArmFromKeydown = (event) => {
        try {
          if (!event || event.defaultPrevented) return;
          const key = String(event.key || event.code || '');
          const isComposer = isProbablyChatgptComposerTextTarget(event.target);
          if (!isComposer) return;

          const isCmdEnter =
            key === 'Enter' &&
            (event.metaKey || event.ctrlKey) &&
            !event.altKey &&
            !event.shiftKey;
          const isPlainTab =
            (key === 'Tab' || event.code === 'Tab') &&
            !event.shiftKey &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey;
          if (!isCmdEnter && !isPlainTab) return;
          if (!getChatgptComposerTextFromTarget(event.target)) return;
          armChatgptSendSourceGate(isCmdEnter ? 'cmdenter-keydown' : 'tab-keydown');
        } catch {}
      };

      const maybeArmFromSendButton = (event) => {
        try {
          if (!event) return;
          if (event.type === 'pointerdown' && event.button !== 0) return;
          if (!isChatgptSendActionTarget(event.target)) return;
          armChatgptSendSourceGate(`${event.type || 'click'}-send-button`);
        } catch {}
      };

      const maybeArmFromSubmit = (event) => {
        try {
          const form = event?.target;
          if (!form || typeof form.querySelector !== 'function') return;
          if (!form.querySelector('#prompt-textarea, textarea[name="prompt-textarea"], [contenteditable="true"][id="prompt-textarea"], [role="textbox"][id="prompt-textarea"]')) return;
          armChatgptSendSourceGate('form-submit');
        } catch {}
      };

      on(window, 'keydown', maybeArmFromKeydown, true);
      on(document, 'keydown', maybeArmFromKeydown, true);
      on(document, 'pointerdown', maybeArmFromSendButton, true);
      on(document, 'click', maybeArmFromSendButton, true);
      on(document, 'submit', maybeArmFromSubmit, true);

      window[CHATGPT_SOURCE_GATE_RUNTIME_KEY] = {
        dispose() {
          for (const dispose of disposers.splice(0)) {
            try { dispose(); } catch {}
          }
        },
        snapshot: describeSourceGate
      };
    } catch {}
  }

  installChatgptSendSourceGate();

  // Notify isolated-world content scripts that the main-world guard is ready.
  try {
    postBridgeMessage('QUICKNAV_SCROLL_GUARD_READY');
  } catch {}
})();
