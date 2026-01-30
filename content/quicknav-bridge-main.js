// QuickNav shared bridge (MAIN world)
(() => {
  'use strict';

  // This runs in the page world; keep it extremely defensive.
  const API_KEY = '__aichat_quicknav_bridge_main_v1__';
  const API_VERSION = 1;

  // Avoid installing timers/listeners inside unrelated iframes.
  // Allow top-frame and our split-view iframe (ChatGPT).
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
    const prev = window[API_KEY];
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= API_VERSION) return;
  } catch {}

  function now() {
    return Date.now();
  }

  function safeCall(fn, ...args) {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  }

  function createEmitter() {
    const listeners = new Map();
    const on = (event, fn) => {
      const key = String(event || '');
      if (!key || typeof fn !== 'function') return () => void 0;
      const set = listeners.get(key) || new Set();
      set.add(fn);
      listeners.set(key, set);
      return () => off(key, fn);
    };
    const off = (event, fn) => {
      const key = String(event || '');
      const set = listeners.get(key);
      if (!set) return;
      set.delete(fn);
      if (!set.size) listeners.delete(key);
    };
    const emit = (event, payload) => {
      const key = String(event || '');
      const set = listeners.get(key);
      if (!set || !set.size) return;
      for (const fn of Array.from(set)) safeCall(fn, payload);
    };
    return { on, off, emit };
  }

  const emitter = createEmitter();

  let lastHref = '';
  let routeListenerInstalled = false;
  let pollTimer = 0;

  function readHref() {
    try {
      return String(location.href || '');
    } catch {
      return '';
    }
  }

  function handleRouteChange(nextHref, reason) {
    const href = String(nextHref || '');
    if (!href) return;
    if (href === lastHref) return;
    const prevHref = lastHref;
    lastHref = href;
    emitter.emit('routeChange', { href, prevHref, reason: String(reason || ''), at: now() });
  }

  function ensureRouteListener() {
    if (routeListenerInstalled) return;
    routeListenerInstalled = true;
    lastHref = readHref();

    // If the MAIN-world scroll guard is installed, it already posts QUICKNAV_ROUTE_CHANGE.
    try {
      window.addEventListener(
        'message',
        (e) => {
          try {
            if (!e || e.source !== window) return;
            const msg = e.data;
            if (!msg || typeof msg !== 'object' || msg.__quicknav !== 1) return;
            if (msg.type !== 'QUICKNAV_ROUTE_CHANGE') return;
            if (typeof msg.href !== 'string' || !msg.href) return;
            handleRouteChange(msg.href, msg.reason || 'scroll-guard');
          } catch {}
        },
        true
      );
    } catch {}

    // Fallback polling for cases where the scroll guard isn't present.
    try {
      pollTimer = window.setInterval(() => {
        const href = readHref();
        if (href && href !== lastHref) handleRouteChange(href, 'poll');
      }, 1200);
    } catch {
      pollTimer = 0;
    }
  }

  const api = Object.freeze({
    version: API_VERSION,
    on: emitter.on,
    off: emitter.off,
    emit: emitter.emit,
    now,
    ensureRouteListener
  });

  try {
    Object.defineProperty(window, API_KEY, { value: api, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[API_KEY] = api;
    } catch {}
  }

  ensureRouteListener();
})();
