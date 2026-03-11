(() => {
  'use strict';

  const API_KEY = '__aichat_quicknav_scope_main_v1__';
  const API_VERSION = 1;
  const BUCKETS_KEY = '__qnScopeMainBucketsV1__';

  try {
    const prev = globalThis[API_KEY];
    if (
      prev &&
      typeof prev === 'object' &&
      typeof prev.createScope === 'function' &&
      typeof prev.createSingletonScope === 'function' &&
      Number(prev.version || 0) >= API_VERSION
    ) {
      return;
    }
  } catch {}

  function normalizeScopeKey(key) {
    const raw = String(key == null ? '' : key).trim();
    if (!raw) return 'Default';
    const parts = raw
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return 'Default';
    let out = '';
    for (const part of parts) {
      out += part.charAt(0).toUpperCase() + part.slice(1);
    }
    return out || 'Default';
  }

  function getOrCreateBuckets() {
    try {
      const existing = window[BUCKETS_KEY];
      if (existing && typeof existing === 'object') return existing;
      const next = Object.create(null);
      window[BUCKETS_KEY] = next;
      return next;
    } catch {
      return Object.create(null);
    }
  }

  function getOrCreateBucket(scopes, keyPart) {
    if (!scopes[keyPart] || typeof scopes[keyPart] !== 'object') {
      scopes[keyPart] = { listeners: 0, observers: 0, intervals: 0 };
    }
    return scopes[keyPart];
  }

  function datasetKeysFor(keyPart) {
    return {
      listeners: `qnScope${keyPart}Listeners`,
      observers: `qnScope${keyPart}Observers`,
      intervals: `qnScope${keyPart}Intervals`
    };
  }

  function writeDatasetCount(datasetKey, value) {
    try {
      const docEl = document.documentElement;
      if (!docEl || !docEl.dataset) return;
      const next = Math.max(0, Math.round(Number(value) || 0));
      docEl.dataset[datasetKey] = String(next);
    } catch {}
  }

  function isMutationObserverLike(value) {
    return !!value && typeof value.observe === 'function' && typeof value.disconnect === 'function';
  }

  function isEventListenerLike(value) {
    return typeof value === 'function' || (!!value && typeof value.handleEvent === 'function');
  }

  function createScope(key) {
    const keyPart = normalizeScopeKey(key);
    const keys = datasetKeysFor(keyPart);
    const buckets = getOrCreateBuckets();
    const bucket = getOrCreateBucket(buckets, keyPart);

    let localListeners = 0;
    let localObservers = 0;
    let localIntervals = 0;
    let localTimeouts = 0;
    let disposed = false;

    const listenerOffs = new Set();
    const observerOffs = new Set();
    const intervalOffs = new Set();
    const timeoutOffs = new Set();

    function syncDatasetCounters() {
      writeDatasetCount(keys.listeners, bucket.listeners);
      writeDatasetCount(keys.observers, bucket.observers);
      writeDatasetCount(keys.intervals, bucket.intervals);
    }

    function applyCountDelta(kind, delta) {
      if (!delta) return;
      if (kind === 'listeners') {
        const next = Math.max(0, localListeners + delta);
        const applied = next - localListeners;
        if (!applied) return;
        localListeners = next;
        bucket.listeners = Math.max(0, (Number(bucket.listeners) || 0) + applied);
        syncDatasetCounters();
        return;
      }
      if (kind === 'observers') {
        const next = Math.max(0, localObservers + delta);
        const applied = next - localObservers;
        if (!applied) return;
        localObservers = next;
        bucket.observers = Math.max(0, (Number(bucket.observers) || 0) + applied);
        syncDatasetCounters();
        return;
      }
      if (kind === 'intervals') {
        const next = Math.max(0, localIntervals + delta);
        const applied = next - localIntervals;
        if (!applied) return;
        localIntervals = next;
        bucket.intervals = Math.max(0, (Number(bucket.intervals) || 0) + applied);
        syncDatasetCounters();
        return;
      }
      if (kind === 'timeouts') {
        localTimeouts = Math.max(0, localTimeouts + delta);
      }
    }

    function on(target, type, fn, opts) {
      if (disposed) return () => void 0;
      if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return () => void 0;
      const eventType = String(type || '');
      if (!eventType || !isEventListenerLike(fn)) return () => void 0;

      try {
        target.addEventListener(eventType, fn, opts);
      } catch {
        return () => void 0;
      }

      let active = true;
      applyCountDelta('listeners', 1);

      const off = () => {
        if (!active) return;
        active = false;
        listenerOffs.delete(off);
        try {
          target.removeEventListener(eventType, fn, opts);
        } catch {}
        applyCountDelta('listeners', -1);
      };

      listenerOffs.add(off);
      return off;
    }

    function interval(fn, ms, ...args) {
      if (disposed || typeof fn !== 'function') return 0;
      let id = 0;

      try {
        id = window.setInterval(fn, ms, ...args);
      } catch {
        return 0;
      }

      let active = true;
      applyCountDelta('intervals', 1);

      const off = () => {
        if (!active) return;
        active = false;
        intervalOffs.delete(off);
        try {
          window.clearInterval(id);
        } catch {}
        applyCountDelta('intervals', -1);
      };

      intervalOffs.add(off);
      return id;
    }

    function timeout(fn, ms, ...args) {
      if (disposed || typeof fn !== 'function') return 0;

      let active = true;
      let id = 0;

      const off = () => {
        if (!active) return;
        active = false;
        timeoutOffs.delete(off);
        try {
          window.clearTimeout(id);
        } catch {}
        applyCountDelta('timeouts', -1);
      };

      const wrapped = () => {
        try {
          fn(...args);
        } finally {
          off();
        }
      };

      try {
        id = window.setTimeout(wrapped, ms);
      } catch {
        return 0;
      }

      timeoutOffs.add(off);
      applyCountDelta('timeouts', 1);
      return id;
    }

    function observer(moOrTarget, maybeTargetOrFn, maybeOpts) {
      if (disposed) return null;

      let mo = null;
      let target = null;
      let opts = null;

      if (isMutationObserverLike(moOrTarget)) {
        mo = moOrTarget;
        target = maybeTargetOrFn || null;
        opts = maybeOpts;
      } else {
        const canCreate = typeof MutationObserver === 'function';
        if (!canCreate) return null;

        if (typeof moOrTarget === 'function') {
          try {
            mo = new MutationObserver(moOrTarget);
            target = maybeTargetOrFn || null;
            opts = maybeOpts;
          } catch {
            return null;
          }
        } else if (moOrTarget && typeof maybeTargetOrFn === 'function') {
          try {
            mo = new MutationObserver(maybeTargetOrFn);
            target = moOrTarget;
            opts = maybeOpts;
          } catch {
            return null;
          }
        } else {
          return null;
        }
      }

      let active = true;
      applyCountDelta('observers', 1);

      const off = () => {
        if (!active) return;
        active = false;
        observerOffs.delete(off);
        try {
          mo.disconnect();
        } catch {}
        applyCountDelta('observers', -1);
      };

      observerOffs.add(off);

      if (target && typeof mo.observe === 'function') {
        const defaultOpts = { childList: true, subtree: true };
        try {
          mo.observe(target, opts && typeof opts === 'object' ? opts : defaultOpts);
        } catch {
          off();
          return null;
        }
      }

      return mo;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;

      for (const off of Array.from(listenerOffs)) off();
      for (const off of Array.from(observerOffs)) off();
      for (const off of Array.from(intervalOffs)) off();
      for (const off of Array.from(timeoutOffs)) off();

      if (localListeners) applyCountDelta('listeners', -localListeners);
      if (localObservers) applyCountDelta('observers', -localObservers);
      if (localIntervals) applyCountDelta('intervals', -localIntervals);
      if (localTimeouts) applyCountDelta('timeouts', -localTimeouts);

      syncDatasetCounters();
    }

    const counts = function () {
      return {
        listeners: localListeners,
        observers: localObservers,
        intervals: localIntervals,
        timeouts: localTimeouts
      };
    };

    try {
      Object.defineProperties(counts, {
        listeners: { enumerable: true, get: () => localListeners },
        observers: { enumerable: true, get: () => localObservers },
        intervals: { enumerable: true, get: () => localIntervals },
        timeouts: { enumerable: true, get: () => localTimeouts }
      });
    } catch {}

    syncDatasetCounters();

    return {
      on,
      interval,
      timeout,
      observer,
      dispose,
      counts
    };
  }

  function createSingletonScope(key) {
    const rawKey = String(key == null ? '' : key);
    const singletonKey = `__qnScope:${rawKey}`;

    try {
      const prev = window[singletonKey];
      if (prev && typeof prev.dispose === 'function') prev.dispose();
    } catch {}

    const scope = createScope(rawKey);

    try {
      window[singletonKey] = scope;
    } catch {}

    return scope;
  }

  const api = Object.freeze({
    version: API_VERSION,
    createScope,
    createSingletonScope
  });

  try {
    Object.defineProperty(globalThis, API_KEY, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }
})();
