(() => {
  'use strict';

  // QuickNav shared bridge (ISOLATED world)
  // - Small cross-module event bus
  // - Route-change signals (from MAIN-world scroll-guard or a polling fallback)
  //
  // Designed to be safe to load multiple times (hot reinject / multiple scripts).

  const API_KEY = '__aichat_quicknav_bridge_v1__';
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
    const prev = globalThis[API_KEY];
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
    const listeners = new Map(); // event -> Set<fn>
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
      // Copy to avoid mutation during emit.
      for (const fn of Array.from(set)) safeCall(fn, payload);
    };
    return { on, off, emit };
  }

  const emitter = createEmitter();

  // === Settings (best-effort) ===
  const SETTINGS_MSG = Object.freeze({
    get: { type: 'QUICKNAV_GET_SETTINGS' }
  });
  let settingsCache = null;
  let settingsCacheAt = 0;
  const SETTINGS_CACHE_TTL_MS = 1500;

  function canUseChromeRuntime() {
    try {
      return typeof chrome !== 'undefined' && !!chrome?.runtime?.sendMessage;
    } catch {
      return false;
    }
  }

  async function getSettings({ force } = {}) {
    const ts = now();
    if (!force && settingsCache && ts - settingsCacheAt < SETTINGS_CACHE_TTL_MS) return settingsCache;
    if (!canUseChromeRuntime()) return settingsCache;
    const resp = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(SETTINGS_MSG.get, (r) => {
          void chrome.runtime.lastError;
          resolve(r || null);
        });
      } catch {
        resolve(null);
      }
    });
    if (resp && resp.ok === true && resp.settings && typeof resp.settings === 'object') {
      settingsCache = resp.settings;
      settingsCacheAt = ts;
      emitter.emit('settings', { settings: settingsCache, at: ts, source: 'runtime' });
    }
    return settingsCache;
  }

  // === Route change (from MAIN scroll guard + polling fallback) ===
  let lastHref = '';
  let routeListenerInstalled = false;
  let routePollTimer = 0;
  let sawMainRouteSignal = false;

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

    // Prefer MAIN-world route hook (from content/scroll-guard-main.js).
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
            sawMainRouteSignal = true;
            handleRouteChange(msg.href, msg.reason || 'main');
          } catch {}
        },
        true
      );
    } catch {}

    // Fallback polling (kept intentionally slow).
    try {
      routePollTimer = window.setInterval(() => {
        // If MAIN signals are coming in reliably, poll even slower.
        if (sawMainRouteSignal) return;
        const href = readHref();
        if (href && href !== lastHref) handleRouteChange(href, 'poll');
      }, 1000);
    } catch {
      routePollTimer = 0;
    }
  }

  function registerMenuCommand(name, fn) {
    try {
      const reg = window.__quicknavRegisterMenuCommand;
      if (typeof reg === 'function') return reg(name, fn);
    } catch {}
    return null;
  }

  const api = Object.freeze({
    version: API_VERSION,
    on: emitter.on,
    off: emitter.off,
    emit: emitter.emit,
    now,
    getSettings,
    ensureRouteListener,
    registerMenuCommand
  });

  try {
    Object.defineProperty(globalThis, API_KEY, { value: api, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }

  // Auto-start only the cheap part.
  ensureRouteListener();
})();
