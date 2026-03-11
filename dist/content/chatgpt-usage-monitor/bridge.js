(() => {
  'use strict';

  const STATE_KEY = '__aichat_chatgpt_usage_monitor_bridge_state_v2__';
  const SCOPE_API_KEY = '__aichat_quicknav_scope_v1__';
  const SCOPE_KEY = 'chatgpt_usage_monitor_bridge';

  // Keep this bridge in the top frame only:
  // - Avoid duplicate storage listeners in iframes
  // - localStorage is shared (same origin), so planType still propagates
  try {
    if (window.self !== window.top) return;
  } catch {}

  const prevState = (() => {
    try {
      return window[STATE_KEY] || null;
    } catch {
      return null;
    }
  })();

  try {
    prevState?.dispose?.('reinject');
  } catch {}

  function createFallbackScope() {
    const listenerOffs = new Set();
    const timeoutOffs = new Set();
    const noop = () => void 0;

    return {
      on(target, type, fn, opts) {
        if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return noop;
        const eventType = String(type || '');
        if (!eventType || typeof fn !== 'function') return noop;

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
          } catch {}
        };

        listenerOffs.add(off);
        return off;
      },
      timeout(fn, ms, ...args) {
        if (typeof fn !== 'function') return 0;

        let id = 0;
        let active = true;

        const off = () => {
          if (!active) return;
          active = false;
          timeoutOffs.delete(off);
          try {
            clearTimeout(id);
          } catch {}
        };

        try {
          id = setTimeout(() => {
            try {
              fn(...args);
            } finally {
              off();
            }
          }, Math.max(0, Number(ms) || 0));
        } catch {
          return 0;
        }

        timeoutOffs.add(off);
        return id;
      },
      dispose() {
        for (const off of Array.from(listenerOffs)) off();
        for (const off of Array.from(timeoutOffs)) off();
      }
    };
  }

  function createBridgeScope() {
    try {
      const scopeApi = globalThis[SCOPE_API_KEY];
      if (scopeApi && typeof scopeApi.createSingletonScope === 'function') {
        const scope = scopeApi.createSingletonScope(SCOPE_KEY);
        if (scope && typeof scope.on === 'function' && typeof scope.dispose === 'function') {
          return scope;
        }
      }
    } catch {}

    return createFallbackScope();
  }

  const bridgeScope = createBridgeScope();
  const bridgeTimerScope = (() => {
    try {
      if (bridgeScope && typeof bridgeScope.timeout === 'function') return bridgeScope;
    } catch {}
    return createFallbackScope();
  })();
  const storageListenerOffs = new Set();
  let disposed = false;
  let routeUnsub = null;

  function addStorageOnChangedListener(fn) {
    if (disposed || typeof fn !== 'function') return () => void 0;

    try {
      chrome.storage.onChanged.addListener(fn);
    } catch {
      return () => void 0;
    }

    let active = true;
    const off = () => {
      if (!active) return;
      active = false;
      storageListenerOffs.delete(off);
      try {
        chrome.storage.onChanged.removeListener(fn);
      } catch {}
    };

    storageListenerOffs.add(off);
    return off;
  }

  function clearStorageOnChangedListeners() {
    for (const off of Array.from(storageListenerOffs)) off();
  }

  function disposeBridge() {
    if (disposed) return;
    disposed = true;
    clearPlanDispatchRetries();
    clearUsageSyncTimer();

    if (typeof routeUnsub === 'function') {
      try {
        routeUnsub();
      } catch {}
      routeUnsub = null;
    }

    clearStorageOnChangedListeners();

    try {
      bridgeScope.dispose();
    } catch {}

    if (bridgeTimerScope !== bridgeScope) {
      try {
        bridgeTimerScope.dispose();
      } catch {}
    }
  }

  const PLAN_STORAGE_KEY = 'cgpt_usage_monitor_plan_type_v1';
  const DEFAULT_PLAN = 'team';
  const ALLOWED_PLANS = new Set(['free', 'go', 'k12_teacher', 'plus', 'team', 'edu', 'enterprise', 'pro']);

  const SET_PLAN_EVENT = '__aichat_chatgpt_usage_monitor_set_plan_v1__';
  const USAGE_DATA_LS_KEY = '__aichat_gm_chatgpt_usage_monitor__:usageData';
  const PLAN_TYPE_GM_KEY = '__aichat_gm_chatgpt_usage_monitor__:planType';
  const SYNC_REV_KEY = '__aichat_gm_chatgpt_usage_monitor__:__sync_rev_v1__';
  const DATA_CHANGED_EVENT = 'chatgpt-usage-monitor:data-changed';

  let lastAppliedPlan = '';
  let lastAppliedAt = 0;
  let __aichatPlanDispatchSeq = 0;
  let __aichatPlanRetryCancels = [];

  function removePlanDispatchRetry(cancel) {
    const idx = __aichatPlanRetryCancels.indexOf(cancel);
    if (idx >= 0) __aichatPlanRetryCancels.splice(idx, 1);
  }

  function clearPlanDispatchRetries() {
    if (!__aichatPlanRetryCancels.length) return;
    for (const cancel of __aichatPlanRetryCancels.slice()) {
      try {
        cancel();
      } catch {}
    }
    __aichatPlanRetryCancels = [];
  }

  function scheduleSetPlanRetry(seq, planType, source, delayMs) {
    if (disposed) return;
    const wait = Math.max(0, Number(delayMs) || 0);
    let active = true;
    const cancel = () => {
      if (!active) return;
      active = false;
      removePlanDispatchRetry(cancel);
    };

    __aichatPlanRetryCancels.push(cancel);

    try {
      bridgeTimerScope.timeout(() => {
        if (!active) return;
        cancel();
        try {
          if (disposed) return;
          if (seq !== __aichatPlanDispatchSeq) return;
          dispatchSetPlan(planType, source);
        } catch {}
      }, wait);
    } catch {
      cancel();
    }
  }

  function normalizePlanType(raw) {
    const s = String(raw || '').trim();
    return ALLOWED_PLANS.has(s) ? s : DEFAULT_PLAN;
  }

  function dispatchSetPlan(planType, source = '') {
    try {
      window.dispatchEvent(
        new CustomEvent(SET_PLAN_EVENT, { detail: { planType: String(planType || ''), source: String(source || '') } })
      );
    } catch {}
  }

  function patchLocalStoragePlan(planType) {
    try {
      // Keep a dedicated key so MAIN-world code can read planType even when usageData hasn't been created yet.
      // (CustomEvent dispatch can race with MAIN-world listener installation during document_start injection.)
      try {
        localStorage.setItem(PLAN_TYPE_GM_KEY, JSON.stringify(planType));
      } catch {}
      try {
        chrome.storage.local.set({ [PLAN_TYPE_GM_KEY]: planType }, () => void chrome.runtime?.lastError);
      } catch {}

      const raw = localStorage.getItem(USAGE_DATA_LS_KEY);
      if (raw == null) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      if (data.planType === planType) return;
      data.planType = planType;
      localStorage.setItem(USAGE_DATA_LS_KEY, JSON.stringify(data));
      try {
        const rev = Date.now();
        localStorage.setItem(SYNC_REV_KEY, JSON.stringify(rev));
        chrome.storage.local.set({ [USAGE_DATA_LS_KEY]: data, [SYNC_REV_KEY]: rev }, () => void chrome.runtime?.lastError);
      } catch {}
    } catch {}
  }

  function applyPlan(planType, source) {
    if (disposed) return;
    const next = normalizePlanType(planType);
    const now = Date.now();
    if (next === lastAppliedPlan && now - lastAppliedAt < 250) return;
    lastAppliedPlan = next;
    lastAppliedAt = now;
    __aichatPlanDispatchSeq += 1;
    clearPlanDispatchRetries();
    const seq = __aichatPlanDispatchSeq;
    // Dispatch first so MAIN-world code can apply the full plan config (models + shared groups).
    // We still keep a localStorage best-effort cache in case MAIN isn't ready yet.
    dispatchSetPlan(next, source);
    // Retry a couple times: in some races, MAIN-world listener may not be installed yet.
    try {
      scheduleSetPlanRetry(seq, next, `${String(source || '')}:retry1`, 700);
      scheduleSetPlanRetry(seq, next, `${String(source || '')}:retry2`, 1700);
    } catch {}
    patchLocalStoragePlan(next);
  }

  function readPlanFromSync() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ [PLAN_STORAGE_KEY]: DEFAULT_PLAN }, (res) => {
          void chrome.runtime?.lastError;
          resolve(normalizePlanType(res?.[PLAN_STORAGE_KEY]));
        });
      } catch {
        resolve(DEFAULT_PLAN);
      }
    });
  }

  // Initial sync -> page
  void readPlanFromSync().then((planType) => {
    if (disposed) return;
    applyPlan(planType, 'sync:init');
  });

  // === usageData sync (page localStorage <-> extension storage.local) ===
  let __aichatUsageSyncTimer = null;
  let __aichatLastLocalToChromeRev = 0;
  let __aichatLastAppliedChromeRev = 0;

  function clearUsageSyncTimer() {
    if (typeof __aichatUsageSyncTimer !== 'function') {
      __aichatUsageSyncTimer = null;
      return;
    }

    try {
      __aichatUsageSyncTimer();
    } catch {}
    __aichatUsageSyncTimer = null;
  }

  function readRevFromLocalStorage() {
    try {
      const raw = localStorage.getItem(SYNC_REV_KEY);
      if (raw == null) return 0;
      const n = Number(JSON.parse(raw));
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  function writeRevToLocalStorage(rev) {
    try {
      localStorage.setItem(SYNC_REV_KEY, JSON.stringify(Number(rev) || 0));
    } catch {}
  }

  function readUsageFromLocalStorage() {
    try {
      const raw = localStorage.getItem(USAGE_DATA_LS_KEY);
      if (raw == null) return null;
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : null;
    } catch {
      return null;
    }
  }

  function writeUsageToLocalStorage(data) {
    try {
      if (data == null) localStorage.removeItem(USAGE_DATA_LS_KEY);
      else localStorage.setItem(USAGE_DATA_LS_KEY, JSON.stringify(data));
    } catch {}
  }

  function scheduleSyncUsageToChrome(delayMs = 260) {
    if (disposed) return;
    if (__aichatUsageSyncTimer) return;
    let active = true;
    const cancel = () => {
      if (!active) return;
      active = false;
      if (__aichatUsageSyncTimer === cancel) __aichatUsageSyncTimer = null;
    };

    __aichatUsageSyncTimer = cancel;

    try {
      bridgeTimerScope.timeout(() => {
        if (!active) return;
        cancel();
        if (disposed) return;
        try {
          const data = readUsageFromLocalStorage();
          const rev = Date.now();
          writeRevToLocalStorage(rev);
          __aichatLastLocalToChromeRev = rev;
          chrome.storage.local.set({ [USAGE_DATA_LS_KEY]: data, [SYNC_REV_KEY]: rev }, () => void chrome.runtime?.lastError);
        } catch {}
      }, Math.max(0, Number(delayMs) || 0));
    } catch {
      cancel();
    }
  }

  function applyChromeSnapshotToLocalStorage(data, rev) {
    const r = Number(rev) || 0;
    if (r && r <= __aichatLastAppliedChromeRev) return;
    __aichatLastAppliedChromeRev = r;
    writeUsageToLocalStorage(data || null);
    if (r) writeRevToLocalStorage(r);
  }

  function bootstrapUsageSync() {
    if (disposed) return;
    try {
      chrome.storage.local.get({ [USAGE_DATA_LS_KEY]: null, [SYNC_REV_KEY]: 0 }, (items) => {
        if (disposed) return;
        void chrome.runtime?.lastError;
        try {
          const chromeRev = Number(items?.[SYNC_REV_KEY]) || 0;
          const chromeData = items?.[USAGE_DATA_LS_KEY] || null;
          const localRev = readRevFromLocalStorage();
          const localData = readUsageFromLocalStorage();

          if (chromeRev > localRev) {
            applyChromeSnapshotToLocalStorage(chromeData, chromeRev);
            return;
          }

          if (localData && localRev >= chromeRev) {
            const nextRev = localRev > 0 ? localRev : Date.now();
            writeRevToLocalStorage(nextRev);
            __aichatLastLocalToChromeRev = nextRev;
            chrome.storage.local.set({ [USAGE_DATA_LS_KEY]: localData, [SYNC_REV_KEY]: nextRev }, () => void chrome.runtime?.lastError);
            return;
          }

          // Neither side has data -> nothing to do.
        } catch {}
      });
    } catch {}
  }

  // Sync to chrome.storage.local when MAIN-world code updates usageData.
  try {
    bridgeScope.on(
      window,
      DATA_CHANGED_EVENT,
      () => {
        if (disposed) return;
        scheduleSyncUsageToChrome(300);
      },
      true
    );
  } catch {}

  function onPlanStorageChanged(changes, areaName) {
    if (disposed) return;
    if (areaName !== 'sync') return;
    const ch = changes?.[PLAN_STORAGE_KEY];
    if (!ch) return;
    applyPlan(ch.newValue, 'sync:changed');
  }

  function onUsageStorageChanged(changes, areaName) {
    if (disposed) return;
    if (areaName !== 'local') return;
    const hasUsage = !!changes?.[USAGE_DATA_LS_KEY];
    const hasRev = !!changes?.[SYNC_REV_KEY];
    if (!hasUsage && !hasRev) return;

    const newRevRaw = changes?.[SYNC_REV_KEY]?.newValue;
    const newRev = Number(newRevRaw) || 0;
    if (newRev && newRev === __aichatLastLocalToChromeRev) return;
    if (newRev && newRev <= __aichatLastAppliedChromeRev) return;

    // Prefer the current storage.local snapshot (in case the change event only carries rev).
    try {
      chrome.storage.local.get({ [USAGE_DATA_LS_KEY]: null, [SYNC_REV_KEY]: newRev || 0 }, (items) => {
        if (disposed) return;
        void chrome.runtime?.lastError;
        try {
          const data = items?.[USAGE_DATA_LS_KEY] || null;
          const rev = Number(items?.[SYNC_REV_KEY]) || newRev || Date.now();
          applyChromeSnapshotToLocalStorage(data, rev);
        } catch {}
      });
    } catch {}
  }

  function installStorageListeners() {
    clearStorageOnChangedListeners();
    addStorageOnChangedListener(onPlanStorageChanged);
    addStorageOnChangedListener(onUsageStorageChanged);
  }

  function bindRouteStorageRebind() {
    if (disposed || typeof routeUnsub === 'function') return;
    try {
      const core = globalThis.__aichat_chatgpt_core_v1__;
      if (!core || typeof core.onRouteChange !== 'function') return;
      routeUnsub = core.onRouteChange(() => {
        if (disposed) return;
        installStorageListeners();
      });
    } catch {}
  }

  installStorageListeners();
  bindRouteStorageRebind();

  // Bootstrap a one-time sync on load so Options can see existing usage data immediately.
  bootstrapUsageSync();

  const state = Object.freeze({
    version: 2,
    dispose: disposeBridge,
    counts: () => ({
      storageListeners: storageListenerOffs.size,
      retryTimers: __aichatPlanRetryCancels.length,
      usageSyncTimer: __aichatUsageSyncTimer ? 1 : 0
    })
  });

  try {
    Object.defineProperty(window, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[STATE_KEY] = state;
    } catch {}
  }
})();
