// QuickNav shared bridge (MAIN world)
(() => {
  'use strict';

  // This runs in the page world; keep it extremely defensive.
  const API_KEY = '__aichat_quicknav_bridge_main_v1__';
  const API_VERSION = 1;
  const SCOPE_API_KEY = '__aichat_quicknav_scope_main_v1__';
  const BRIDGE_CHANNEL = 'quicknav';
  const BRIDGE_V = 1;
  const BRIDGE_NONCE_DATASET_KEY = 'quicknavBridgeNonceV1';
  const ALLOWED_ROUTE_TYPES = new Set(['QUICKNAV_ROUTE_CHANGE']);
  const ROUTE_POLL_MIN_MS = 1200;
  const ROUTE_POLL_DEFAULT_MS = 1800;
  const ROUTE_SIGNAL_GRACE_MS = 15000;
  const ERROR_DATASET_KEY = 'quicknavCoreErrorCount';
  const ERROR_REPORT_WINDOW_MS = 15000;
  const ERROR_REPORT_BURST = 3;
  const errorReportState = new Map();

  function isDebugEnabled() {
    try {
      if (globalThis.DEBUG_TEMP === true) return true;
    } catch (error) {
      void error;
    }
    try {
      if (globalThis.__quicknavDebug === true) return true;
    } catch (error) {
      void error;
    }
    try {
      return String(document.documentElement?.dataset?.quicknavDebug || '') === '1';
    } catch {
      return false;
    }
  }

  function shouldReportError(key) {
    const normalized = String(key || 'bridge-main');
    const ts = Date.now();
    const state = errorReportState.get(normalized);
    if (!state || ts - state.windowStart > ERROR_REPORT_WINDOW_MS) {
      errorReportState.set(normalized, { windowStart: ts, count: 1 });
      return true;
    }
    state.count += 1;
    return state.count <= ERROR_REPORT_BURST;
  }

  function incrementErrorCount() {
    try {
      const docEl = document.documentElement;
      if (!docEl || !docEl.dataset) return;
      const prev = Number(docEl.dataset[ERROR_DATASET_KEY] || 0);
      const next = Number.isFinite(prev) ? Math.max(0, Math.floor(prev)) + 1 : 1;
      docEl.dataset[ERROR_DATASET_KEY] = String(next);
    } catch (error) {
      void error;
    }
  }

  function normalizeErrorTag(error) {
    if (!error) return '';
    try {
      if (typeof error === 'object' && typeof error.name === 'string' && error.name) return String(error.name).slice(0, 64);
    } catch (readError) {
      void readError;
    }
    const kind = typeof error;
    return kind && kind !== 'object' ? kind : '';
  }

  function reportError(stage, error) {
    try {
      const key = String(stage || 'bridge-main');
      if (!shouldReportError(key)) return;
      incrementErrorCount();
      if (!isDebugEnabled()) return;
      const tag = normalizeErrorTag(error);
      if (tag) console.warn('[quicknav][bridge-main]', key, tag);
      else console.warn('[quicknav][bridge-main]', key);
    } catch (reportErrorFailure) {
      void reportErrorFailure;
    }
  }

  function clampRoutePollMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return ROUTE_POLL_MIN_MS;
    return Math.max(ROUTE_POLL_MIN_MS, Math.round(n));
  }

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

  let prevApi = null;
  try {
    prevApi = window[API_KEY];
    if (prevApi && typeof prevApi === 'object' && Number(prevApi.version || 0) > API_VERSION) return;
  } catch (error) {
    reportError('bridge-main:prev-api:read', error);
  }

  try {
    if (prevApi && typeof prevApi.dispose === 'function') prevApi.dispose();
  } catch (error) {
    reportError('bridge-main:prev-api:dispose', error);
  }

  function createFallbackScope() {
    const listenerOffs = new Set();
    const intervalOffs = new Set();
    const noop = () => void 0;
    return {
      on(target, type, fn, opts) {
        if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return noop;
        if (!type || (typeof fn !== 'function' && !(fn && typeof fn.handleEvent === 'function'))) return noop;
        try {
          target.addEventListener(type, fn, opts);
        } catch {
          return noop;
        }
        let active = true;
        const off = () => {
          if (!active) return;
          active = false;
          listenerOffs.delete(off);
          try {
            target.removeEventListener(type, fn, opts);
          } catch (error) {
            reportError('bridge-main:scope:off-listener', error);
          }
        };
        listenerOffs.add(off);
        return off;
      },
      interval(fn, ms, ...args) {
        if (typeof fn !== 'function') return 0;
        const pollMs = clampRoutePollMs(ms);
        let id = 0;
        try {
          id = window.setInterval(fn, pollMs, ...args);
        } catch {
          return 0;
        }
        let active = true;
        const off = () => {
          if (!active) return;
          active = false;
          intervalOffs.delete(off);
          try {
            window.clearInterval(id);
          } catch (error) {
            reportError('bridge-main:scope:off-interval', error);
          }
        };
        intervalOffs.add(off);
        return id;
      },
      dispose() {
        for (const off of Array.from(listenerOffs)) off();
        for (const off of Array.from(intervalOffs)) off();
      }
    };
  }

  function createBridgeScope() {
    try {
      const scopeApi = window[SCOPE_API_KEY];
      if (scopeApi && typeof scopeApi.createSingletonScope === 'function') {
        const scope = scopeApi.createSingletonScope('bridge');
        if (scope && typeof scope.on === 'function' && typeof scope.interval === 'function' && typeof scope.dispose === 'function') {
          return scope;
        }
      }
    } catch (error) {
      reportError('bridge-main:create-scope', error);
    }
    return createFallbackScope();
  }

  const bridgeScope = createBridgeScope();

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

  function readBridgeMessage(event, allowedTypes) {
    try {
      if (!event || event.source !== window) return null;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return null;
      if (msg.__quicknav !== 1) return null;
      if (msg.channel !== BRIDGE_CHANNEL) return null;
      if (msg.v !== BRIDGE_V) return null;
      if (msg.nonce !== BRIDGE_NONCE) return null;
      if (typeof msg.type !== 'string' || !msg.type) return null;
      if (allowedTypes && !allowedTypes.has(msg.type)) return null;
      return msg;
    } catch {
      return null;
    }
  }

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
    const clear = () => {
      listeners.clear();
    };
    return { on, off, emit, clear };
  }

  const emitter = createEmitter();

  let lastHref = '';
  let routeListenerInstalled = false;
  let pollTimer = 0;
  let lastRouteSignalAt = 0;

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
      bridgeScope.on(
        window,
        'message',
        (e) => {
          try {
            const msg = readBridgeMessage(e, ALLOWED_ROUTE_TYPES);
            if (!msg) return;
            if (typeof msg.href !== 'string' || !msg.href) return;
            lastRouteSignalAt = now();
            handleRouteChange(msg.href, msg.reason || 'scroll-guard');
          } catch (error) {
            reportError('bridge-main:route:handle-message', error);
          }
        },
        true
      );
    } catch (error) {
      reportError('bridge-main:route:watch-message', error);
    }

    // Fallback polling for cases where the scroll guard isn't present.
    try {
      const pollMs = clampRoutePollMs(ROUTE_POLL_DEFAULT_MS);
      pollTimer = bridgeScope.interval(() => {
        if (lastRouteSignalAt > 0 && now() - lastRouteSignalAt < ROUTE_SIGNAL_GRACE_MS) return;
        const href = readHref();
        if (href && href !== lastHref) handleRouteChange(href, 'poll');
      }, pollMs);
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
    ensureRouteListener,
    dispose: () => {
      routeListenerInstalled = false;
      pollTimer = 0;
      lastRouteSignalAt = 0;
      bridgeScope.dispose();
      emitter.clear();
    }
  });

  try {
    Object.defineProperty(window, API_KEY, { value: api, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[API_KEY] = api;
    } catch (error) {
      reportError('bridge-main:api:set', error);
    }
  }

  ensureRouteListener();
})();
