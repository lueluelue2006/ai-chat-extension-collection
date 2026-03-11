(function () {
  'use strict';

  const KERNEL_KEY = '__aichat_quicknav_kernel_v1__';

  function getKernelRoot() {
    let root = null;
    try {
      root = globalThis[KERNEL_KEY];
    } catch {}
    if (root && typeof root === 'object') return root;
    root = {};
    try {
      Object.defineProperty(globalThis, KERNEL_KEY, {
        value: root,
        configurable: true,
        enumerable: false,
        writable: true
      });
      return root;
    } catch {}
    try {
      globalThis[KERNEL_KEY] = root;
    } catch {}
    return root;
  }

  const kernel = getKernelRoot();
  if (kernel && kernel.routeWatch && Number(kernel.routeWatch.version || 0) >= 1) return;

  function normalizeHref(href) {
    const raw = String(href || '').trim();
    if (raw) return raw;
    try {
      return String(location.href || '').trim();
    } catch {
      return '';
    }
  }

  function toRouteKey(href) {
    const nextHref = normalizeHref(href);
    if (!nextHref) return '';
    try {
      const u = new URL(nextHref, location.href);
      return `${u.origin}${u.pathname}`;
    } catch {
      return nextHref;
    }
  }

  function installBridgeFirstWatcher(options = {}) {
    const target = options.target || globalThis;
    const onRouteChange = typeof options.onRouteChange === 'function' ? options.onRouteChange : null;
    if (!target || !onRouteChange) return { installed: false, mode: 'none' };

    const unsubKey = String(options.unsubKey || '');
    const pollKey = String(options.pollKey || '');
    const pollMs = Math.max(200, Number(options.pollMs) || 1200);
    const getHref = typeof options.getHref === 'function'
      ? options.getHref
      : () => {
          try {
            return location.href;
          } catch {
            return '';
          }
        };

    try {
      if (unsubKey && typeof target[unsubKey] === 'function') {
        return { installed: true, mode: 'bridge' };
      }
    } catch {}

    try {
      const bridge = options.bridge || target.__aichat_quicknav_bridge_v1__;
      if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
        try {
          bridge.ensureRouteListener();
        } catch {}
        const unsubscribe = bridge.on('routeChange', (payload) => {
          try {
            onRouteChange(payload && typeof payload === 'object' ? payload : null);
          } catch {}
        });
        if (unsubKey) {
          try {
            target[unsubKey] = unsubscribe;
          } catch {}
        }
        return { installed: true, mode: 'bridge' };
      }
    } catch {}

    try {
      if (pollKey && target[pollKey]) {
        return { installed: true, mode: 'poll', timerId: Number(target[pollKey]) || 0 };
      }
    } catch {}

    try {
      const timerId = setInterval(() => {
        try {
          onRouteChange({ href: normalizeHref(getHref()), reason: 'poll' });
        } catch {}
      }, pollMs);
      if (pollKey) {
        try {
          target[pollKey] = timerId;
        } catch {}
      }
      return { installed: true, mode: 'poll', timerId };
    } catch {
      return { installed: false, mode: 'none' };
    }
  }

  const api = Object.freeze({
    version: 1,
    normalizeHref,
    toRouteKey,
    installBridgeFirstWatcher
  });

  try {
    kernel.routeWatch = api;
  } catch {}
})();
