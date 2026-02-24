/* AI Shortcuts MV3 bootstrap content script
 * - Runs from manifest (not dynamically registered)
 * - Wakes up the MV3 service worker so it can (re)register dynamic scripts and reinject when needed
 */
(() => {
  'use strict';

  const STATE_KEY = '__quicknavBootstrapStateV2__';
  const LEGACY_GUARD_KEY = '__quicknavBootstrapV1';
  const SCOPE_API_KEY = '__aichat_quicknav_scope_v1__';
  const BRIDGE_CHANNEL = 'quicknav';
  const BRIDGE_V = 1;
  const BRIDGE_NONCE_DATASET_KEY = 'quicknavBridgeNonceV1';
  const ROUTE_SIGNAL_TYPES = new Set(['QUICKNAV_ROUTE_CHANGE']);
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
    const normalized = String(key || 'bootstrap');
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
      const key = String(stage || 'bootstrap');
      if (!shouldReportError(key)) return;
      incrementErrorCount();
      if (!isDebugEnabled()) return;
      const tag = normalizeErrorTag(error);
      if (tag) console.warn('[quicknav][bootstrap]', key, tag);
      else console.warn('[quicknav][bootstrap]', key);
    } catch (reportErrorFailure) {
      void reportErrorFailure;
    }
  }

  function clampRoutePollMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return ROUTE_POLL_MIN_MS;
    return Math.max(ROUTE_POLL_MIN_MS, Math.round(n));
  }

  function createFallbackScope() {
    const listenerOffs = new Set();
    const intervalOffs = new Set();
    const timeoutOffs = new Set();
    const noop = () => void 0;

    return {
      on(target, type, fn, opts) {
        if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return noop;
        const eventType = String(type || '');
        if (!eventType || (typeof fn !== 'function' && !(fn && typeof fn.handleEvent === 'function'))) return noop;

        try {
          target.addEventListener(eventType, fn, opts);
        } catch {
          return noop;
        }

        let active = true;
        const off = () => {
          if (!active) return;
          active = false;
          listenerOffs.delete(off);
          try {
            target.removeEventListener(eventType, fn, opts);
          } catch (error) {
            reportError('bootstrap:scope:off-listener', error);
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
            reportError('bootstrap:scope:off-interval', error);
          }
        };

        intervalOffs.add(off);
        return id;
      },
      timeout(fn, ms, ...args) {
        if (typeof fn !== 'function') return 0;

        const wait = Math.max(0, Number(ms) || 0);
        let id = 0;
        let active = true;

        const off = () => {
          if (!active) return;
          active = false;
          timeoutOffs.delete(off);
          try {
            window.clearTimeout(id);
          } catch (error) {
            reportError('bootstrap:scope:off-timeout', error);
          }
        };

        try {
          id = window.setTimeout(() => {
            try {
              fn(...args);
            } finally {
              off();
            }
          }, wait);
        } catch {
          return 0;
        }

        timeoutOffs.add(off);
        return id;
      },
      dispose() {
        for (const off of Array.from(listenerOffs)) off();
        for (const off of Array.from(intervalOffs)) off();
        for (const off of Array.from(timeoutOffs)) off();
      }
    };
  }

  function createBootstrapScope() {
    try {
      const scopeApi = globalThis[SCOPE_API_KEY];
      if (scopeApi && typeof scopeApi.createSingletonScope === 'function') {
        const scope = scopeApi.createSingletonScope('bootstrap');
        if (
          scope &&
          typeof scope.on === 'function' &&
          typeof scope.interval === 'function' &&
          typeof scope.timeout === 'function' &&
          typeof scope.dispose === 'function'
        ) {
          return scope;
        }
      }
    } catch (error) {
      reportError('bootstrap:create-scope', error);
    }

    return createFallbackScope();
  }

  function routeKeyFromHref(href) {
    const raw = String(href || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      return `${url.origin}${url.pathname}`;
    } catch {
      return raw;
    }
  }

  function currentRouteKey() {
    try {
      const origin = String(location.origin || '');
      const pathname = String(location.pathname || '');
      if (origin || pathname) return `${origin}${pathname}`;
    } catch (error) {
      reportError('bootstrap:route-key:origin', error);
    }
    try {
      return routeKeyFromHref(location.href);
    } catch {
      return '';
    }
  }

  function readBridgeRouteMessage(event) {
    try {
      if (!event || event.source !== window) return null;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return null;
      if (msg.__quicknav !== 1) return null;
      if (msg.channel !== BRIDGE_CHANNEL) return null;
      if (msg.v !== BRIDGE_V) return null;
      if (!ROUTE_SIGNAL_TYPES.has(msg.type)) return null;
      if (typeof msg.href !== 'string' || !msg.href) return null;

      const expectedNonce = String(document.documentElement?.dataset?.[BRIDGE_NONCE_DATASET_KEY] || '').trim();
      if (expectedNonce && msg.nonce !== expectedNonce) return null;

      return msg;
    } catch {
      return null;
    }
  }

  const hasQuicknavUi = () => {
    try {
      return !!(document.getElementById('cgpt-compact-nav') || document.getElementById('cgpt-compact-nav-style'));
    } catch {
      return false;
    }
  };

  let prevState = null;
  try {
    prevState = window[STATE_KEY] || null;
  } catch (error) {
    reportError('bootstrap:prev-state:read', error);
  }

  try {
    if (prevState && typeof prevState.dispose === 'function') prevState.dispose('reinject');
  } catch (error) {
    reportError('bootstrap:prev-state:dispose', error);
  }

  try {
    Object.defineProperty(window, LEGACY_GUARD_KEY, { value: true, configurable: true });
  } catch {
    try {
      window[LEGACY_GUARD_KEY] = true;
    } catch (error) {
      reportError('bootstrap:legacy-guard:set', error);
    }
  }

  try {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;

    const bootstrapScope = createBootstrapScope();
    let disposed = false;
    let attempt = 0;
    let ensureAttempt = 0;
    let lastRouteKey = '';
    let routePollTimer = 0;
    let routeWatcherInstalled = false;
    let sawBridgeRouteSignal = false;
    let lastBridgeRouteSignalAt = 0;

    const ensureInjected = ({ force = false, reason = '' } = {}) => {
      if (disposed) return;

      try {
        // If the shared bridge exists, at least one dynamic script is already running in this tab.
        if (!force && globalThis.__aichat_quicknav_bridge_v1__) return;
      } catch (error) {
        reportError('bootstrap:ensure:bridge-check', error);
      }

      ensureAttempt += 1;
      if (ensureAttempt > 3) return;
      try {
        chrome.runtime.sendMessage(
          {
            type: 'QUICKNAV_BOOTSTRAP_ENSURE',
            href: location.href,
            reason: String(reason || 'bootstrap')
          },
          () => void chrome.runtime.lastError
        );
      } catch (error) {
        reportError('bootstrap:ensure:send-message', error);
      }
    };

    const scheduleEnsureRetry = (force, reason, delayMs) => {
      if (disposed) return;
      try {
        bootstrapScope.timeout(
          () => {
            if (disposed) return;
            ensureInjected({ force, reason });
          },
          Math.max(0, Number(delayMs) || 0)
        );
      } catch (error) {
        reportError('bootstrap:ensure:schedule', error);
      }
    };

    const handleRouteMaybeChanged = (reason = 'route', href = '') => {
      if (disposed) return;

      const nextRouteKey = routeKeyFromHref(href) || currentRouteKey();
      if (!nextRouteKey || nextRouteKey === lastRouteKey) return;
      lastRouteKey = nextRouteKey;

      // New route => reset ensure budget, then run route-aware ensure.
      // Force ensure only when QuickNav UI is missing (e.g. Grok "/" -> "/c/..." SPA hop).
      ensureAttempt = 0;
      const force = !hasQuicknavUi();
      ensureInjected({ force, reason: `${reason}:changed` });
      if (force) {
        scheduleEnsureRetry(true, `${reason}:retry1`, 700);
        scheduleEnsureRetry(true, `${reason}:retry2`, 2200);
      }
    };

    const installRouteWatcher = () => {
      if (disposed || routeWatcherInstalled) return;
      routeWatcherInstalled = true;
      lastRouteKey = currentRouteKey();

      const onSignal = (reason, href = '') => {
        try {
          handleRouteMaybeChanged(reason, href);
        } catch (error) {
          reportError('bootstrap:route:on-signal', error);
        }
      };

      try {
        bootstrapScope.on(
          window,
          'message',
          (event) => {
            const msg = readBridgeRouteMessage(event);
            if (!msg) return;
            sawBridgeRouteSignal = true;
            lastBridgeRouteSignalAt = Date.now();
            onSignal(msg.reason || 'bridge', msg.href);
          },
          true
        );
      } catch (error) {
        reportError('bootstrap:route:watch-message', error);
      }

      try {
        bootstrapScope.on(window, 'pageshow', () => onSignal('pageshow'), true);
      } catch (error) {
        reportError('bootstrap:route:watch-pageshow', error);
      }
      try {
        bootstrapScope.on(window, 'popstate', () => onSignal('popstate'), true);
      } catch (error) {
        reportError('bootstrap:route:watch-popstate', error);
      }
      try {
        bootstrapScope.on(window, 'hashchange', () => onSignal('hashchange'), true);
      } catch (error) {
        reportError('bootstrap:route:watch-hashchange', error);
      }
      try {
        bootstrapScope.on(
          document,
          'visibilitychange',
          () => {
            if (!document.hidden) onSignal('visible');
          },
          true
        );
      } catch (error) {
        reportError('bootstrap:route:watch-visibility', error);
      }

      try {
        const pollMs = clampRoutePollMs(ROUTE_POLL_DEFAULT_MS);
        routePollTimer = bootstrapScope.interval(() => {
          if (disposed) return;
          if (sawBridgeRouteSignal && lastBridgeRouteSignalAt > 0 && Date.now() - lastBridgeRouteSignalAt < ROUTE_SIGNAL_GRACE_MS) return;
          onSignal('poll');
        }, pollMs);
      } catch {
        routePollTimer = 0;
      }
    };

    const disposeBootstrap = () => {
      if (disposed) return;
      disposed = true;
      routeWatcherInstalled = false;
      routePollTimer = 0;
      sawBridgeRouteSignal = false;
      lastBridgeRouteSignalAt = 0;
      try {
        bootstrapScope.dispose();
      } catch (error) {
        reportError('bootstrap:scope:dispose', error);
      }
    };

    const ping = () => {
      if (disposed) return;
      attempt += 1;
      chrome.runtime.sendMessage({ type: 'QUICKNAV_BOOTSTRAP_PING', href: location.href }, (res) => {
        if (disposed) return;
        const err = chrome.runtime.lastError;
        if (!err && res && res.ok) return;
        if (attempt >= 3) return;
        try {
          bootstrapScope.timeout(ping, 200 * attempt);
        } catch (error) {
          reportError('bootstrap:ping:schedule', error);
        }
      });
    };

    ping();
    installRouteWatcher();

    // Safety net: on some Chrome/MV3 edge cases the registered scripts may not run on first load.
    // Re-check shortly after start and ask SW to inject missing modules into *this* tab.
    scheduleEnsureRetry(false, 'bootstrap:retry1', 1200);
    scheduleEnsureRetry(false, 'bootstrap:retry2', 3200);

    const state = Object.freeze({
      version: 2,
      dispose: disposeBootstrap,
      counts: () => {
        let scopeCounts = null;
        try {
          if (typeof bootstrapScope.counts === 'function') scopeCounts = bootstrapScope.counts();
        } catch (error) {
          reportError('bootstrap:scope:counts', error);
        }
        return {
          routePollActive: routePollTimer ? 1 : 0,
          sawBridgeRouteSignal: sawBridgeRouteSignal ? 1 : 0,
          scope: scopeCounts
        };
      }
    });

    try {
      Object.defineProperty(window, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
    } catch {
      try {
        window[STATE_KEY] = state;
      } catch (error) {
        reportError('bootstrap:state:set', error);
      }
    }
  } catch (error) {
    reportError('bootstrap:init', error);
  }
})();
