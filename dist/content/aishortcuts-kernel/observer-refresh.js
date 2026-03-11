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
  if (kernel && kernel.observerRefresh && Number(kernel.observerRefresh.version || 0) >= 1) return;

  function scheduleDebounced(options = {}) {
    const run = typeof options.run === 'function' ? options.run : null;
    const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : (id) => clearTimeout(id);
    const setTimer = typeof options.setTimer === 'function' ? options.setTimer : (fn, ms) => setTimeout(fn, ms);
    let timerId = Number(options.timerId) || 0;
    const delay = Math.max(0, Number(options.delay) || 0);
    const force = !!options.force;
    if (!run) return { timerId, ranNow: false };

    if (force) {
      if (timerId) {
        try {
          clearTimer(timerId);
        } catch {}
        timerId = 0;
      }
      run();
      return { timerId: 0, ranNow: true };
    }

    if (timerId) {
      try {
        clearTimer(timerId);
      } catch {}
      timerId = 0;
    }

    try {
      timerId = setTimer(run, delay);
    } catch {
      timerId = 0;
    }

    return { timerId, ranNow: false };
  }

  function attachObserver(options = {}) {
    const target = options.target || null;
    const callback = typeof options.callback === 'function' ? options.callback : null;
    const observeOptions = options.observeOptions && typeof options.observeOptions === 'object'
      ? options.observeOptions
      : { childList: true, subtree: true };
    let observer = options.observer || null;
    const ObserverCtor = options.ObserverCtor || globalThis.MutationObserver;
    if (!callback || !target || typeof ObserverCtor !== 'function') return null;

    if (!observer) {
      try {
        observer = new ObserverCtor(callback);
      } catch {
        return null;
      }
    }

    try {
      observer.observe(target, observeOptions);
      return observer;
    } catch {
      try {
        observer.disconnect();
      } catch {}
      return null;
    }
  }

  function restartInterval(options = {}) {
    const clearIntervalFn = typeof options.clearIntervalFn === 'function' ? options.clearIntervalFn : (id) => clearInterval(id);
    const setIntervalFn = typeof options.setIntervalFn === 'function' ? options.setIntervalFn : (fn, ms) => setInterval(fn, ms);
    const onTick = typeof options.onTick === 'function' ? options.onTick : null;
    const intervalMs = Math.max(200, Number(options.intervalMs) || 1000);
    let timerId = Number(options.timerId) || 0;
    if (timerId) {
      try {
        clearIntervalFn(timerId);
      } catch {}
      timerId = 0;
    }
    if (!onTick) return 0;
    try {
      timerId = setIntervalFn(onTick, intervalMs);
      return timerId;
    } catch {
      return 0;
    }
  }

  const api = Object.freeze({
    version: 1,
    scheduleDebounced,
    attachObserver,
    restartInterval
  });

  try {
    kernel.observerRefresh = api;
  } catch {}
})();
