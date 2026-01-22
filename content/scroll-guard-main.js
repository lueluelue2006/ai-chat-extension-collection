// QuickNav main-world scroll guard (injected via chrome.scripting world: MAIN)
(() => {
  'use strict';

  try {
    const GUARD_VERSION = 5;
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
    baselineTop: null
  };

  // How many pixels of downward drift we tolerate before blocking.
  // Keep this small to avoid visible "micro jumps" when sites try to autoscroll.
  const DRIFT = 2;
  // Some apps occasionally reset scrollTop to ~0 during re-render. While locked, block large upward jumps too.
  const UP_JUMP = Math.max(DRIFT * 4, 64);
  const MAX_ALLOW_MS = 8000;
  const SCROLLER_ATTR = 'data-quicknav-scrolllock-scroller';
  const ANCHOR_STYLE_ID = '__quicknav_scrolllock_anchor_style__';
  let __lastMarkedScroller = null;

  const now = () => Date.now();
  const isAllowed = () => {
    if (!STATE.enabled) return true;
    if (now() < (STATE.allowUntil || 0)) return true;
    // Synchronous escape hatch for our own navigation actions (tree jump / quicknav jump).
    // The postMessage-based allow can land a tick later; this flag makes navigation feel instant.
    try {
      if (window.__cgptNavAllowScroll) return true;
      if (window.__quicknavAllowScroll) return true;
    } catch {}
    // Cross-world allow window: main/isolated scripts share DOM dataset, not JS globals.
    try {
      const v = document.documentElement?.dataset?.quicknavAllowScrollUntil;
      const until = Number(v);
      if (Number.isFinite(until) && now() < until) return true;
    } catch {}
    return false;
  };

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
        if (!msg || typeof msg !== 'object' || msg.__quicknav !== 1) return;

        if (msg.type === 'QUICKNAV_SCROLLLOCK_STATE') {
          STATE.enabled = !!msg.enabled;
          // When scroll-lock toggles, also toggle scroll anchoring mitigation.
          try {
            refreshScrollerMarker();
          } catch {}
          return;
        }

        if (msg.type === 'QUICKNAV_SCROLLLOCK_BASELINE') {
          const top = Number(msg.top);
          if (Number.isFinite(top)) STATE.baselineTop = Math.max(0, Math.round(top));
          return;
        }

        if (msg.type === 'QUICKNAV_SCROLLLOCK_ALLOW') {
          const ms = clampAllow(msg.ms);
          if (!ms) return;
          STATE.allowUntil = Math.max(STATE.allowUntil || 0, now() + ms);
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

    const grokScrollerSeed = (() => {
      try {
        if (String(location.hostname || '').toLowerCase() !== 'grok.com') return null;
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

  function refreshScrollerMarker(scroller = null) {
    try {
      if (!STATE.enabled) return clearScrollerMarker();
      const sc =
        (scroller && scroller.isConnected ? scroller : null) ||
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
      try {
        // Keep the marker in sync even when we return the cached scroller.
        if (STATE.enabled) refreshScrollerMarker(__cachedScroller);
      } catch {}
      return __cachedScroller;
    }
    __cachedScrollerAt = t;
    const sc = getGeminiScroller() || detectChatScrollerFallback();
    __cachedScroller = sc || null;
    try {
      if (STATE.enabled) refreshScrollerMarker(__cachedScroller);
      else clearScrollerMarker();
    } catch {}
    return __cachedScroller;
  }

  function isWindowScroller(el) {
    const doc = document.documentElement;
    const se = document.scrollingElement || doc;
    return !el || el === window || el === document || el === document.body || el === doc || el === se;
  }

  function getScrollPos(el) {
    if (!el) return window.scrollY || 0;
    if (isWindowScroller(el)) {
      const se = document.scrollingElement || document.documentElement;
      return se ? se.scrollTop : (window.scrollY || 0);
    }
    return el.scrollTop || 0;
  }

  function getBaselineTop(scroller) {
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
    if (isAllowed()) return false;
    const sc = getChatScroller();
    if (!sc) return false;
    if (isWindowScroller(sc)) return false;
    if (el !== sc) return false;
    const baseline = getBaselineTop(sc);
    const targetTop = Number(nextTop);
    if (!Number.isFinite(targetTop)) return false;
    if (targetTop > baseline + DRIFT) return true;
    if (targetTop < baseline - UP_JUMP) return true;
    return false;
  }

  function shouldBlockWindowScroll(nextTop) {
    if (isAllowed()) return false;
    const sc = getChatScroller();
    if (!sc || !isWindowScroller(sc)) return false;
    const baseline = getBaselineTop(sc);
    const targetTop = Number(nextTop);
    if (!Number.isFinite(targetTop)) return false;
    if (targetTop > baseline + DRIFT) return true;
    if (targetTop < baseline - UP_JUMP) return true;
    return false;
  }

  function shouldBlockIntoView(target) {
    if (isAllowed()) return false;
    const sc = getChatScroller();
    if (!sc || !target || !target.getBoundingClientRect) return false;

    const r = target.getBoundingClientRect();
    if (isWindowScroller(sc)) {
      // Only block downward scroll.
      const bottom = (window.innerHeight || 0) - 4;
      return r.bottom > bottom + 1;
    }

    try {
      if (!sc.contains(target)) return false;
    } catch {
      return false;
    }

    const sr = sc.getBoundingClientRect();
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
            if (shouldBlockWindowScroll(v) && isWindowScroller(this)) return;
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
    window.scrollTo = function (...args) {
      const current = getScrollPos(getChatScroller());
      const targetTop = getScrollTopFromArgs(args, current);
      if (shouldBlockWindowScroll(targetTop)) return;
      return ORIGINAL_WINDOW_SCROLL_TO.apply(window, args);
    };
  }

  // window.scroll (alias of scrollTo; some apps call this)
  if (typeof ORIGINAL_WINDOW_SCROLL === 'function') {
    window.scroll = function (...args) {
      const current = getScrollPos(getChatScroller());
      const targetTop = getScrollTopFromArgs(args, current);
      if (shouldBlockWindowScroll(targetTop)) return;
      return ORIGINAL_WINDOW_SCROLL.apply(window, args);
    };
  }

  if (typeof ORIGINAL_WINDOW_SCROLL_BY === 'function') {
    window.scrollBy = function (...args) {
      if (!isAllowed()) {
        const sc = getChatScroller();
        if (sc && isWindowScroller(sc)) {
          const dy = getScrollDeltaFromArgs(args);
          if (Number(dy) > DRIFT) return;
        }
      }
      return ORIGINAL_WINDOW_SCROLL_BY.apply(window, args);
    };
  }

  // element.scrollTo / scrollBy (only when called on the chat scroller element)
  if (typeof ORIGINAL_ELEM_SCROLL_TO === 'function') {
    Element.prototype.scrollTo = function (...args) {
      const current = getScrollPos(this);
      const targetTop = getScrollTopFromArgs(args, current);
      if (shouldBlockElementScroll(this, targetTop)) return;
      return ORIGINAL_ELEM_SCROLL_TO.apply(this, args);
    };
  }

  // Element.scroll (alias of scrollTo; ChatGPT uses this for autoscroll)
  if (typeof ORIGINAL_ELEM_SCROLL === 'function') {
    Element.prototype.scroll = function (...args) {
      const current = getScrollPos(this);
      const targetTop = getScrollTopFromArgs(args, current);
      try {
        if (shouldBlockElementScroll(this, targetTop)) return;
        // If the chat scroller is window-based, it might call .scroll on documentElement/body.
        if (shouldBlockWindowScroll(targetTop) && isWindowScroller(this)) return;
      } catch {}
      return ORIGINAL_ELEM_SCROLL.apply(this, args);
    };
  }

  if (typeof ORIGINAL_ELEM_SCROLL_BY === 'function') {
    Element.prototype.scrollBy = function (...args) {
      if (!isAllowed()) {
        const dy = getScrollDeltaFromArgs(args);
        if (Number(dy) > DRIFT && shouldBlockElementScroll(this, getScrollPos(this) + dy)) return;
      }
      return ORIGINAL_ELEM_SCROLL_BY.apply(this, args);
    };
  }

  // Notify isolated-world content scripts that the main-world guard is ready.
  try {
    window.postMessage({ __quicknav: 1, type: 'QUICKNAV_SCROLL_GUARD_READY' }, '*');
  } catch {}
})();
