(() => {
  'use strict';

  const GUARD_KEY = '__aichat_chatgpt_usage_monitor_bridge_v1__';
  try {
    if (window[GUARD_KEY]) return;
    Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });
  } catch {
    try {
      if (window[GUARD_KEY]) return;
      window[GUARD_KEY] = true;
    } catch {}
  }

  // Keep this bridge in the top frame only:
  // - Avoid duplicate storage listeners in split-view iframes
  // - localStorage is shared (same origin), so planType still propagates
  try {
    if (window.self !== window.top) return;
  } catch {}

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
  let __aichatPlanRetryTimers = [];

  function clearPlanDispatchRetries() {
    if (!__aichatPlanRetryTimers.length) return;
    for (const t of __aichatPlanRetryTimers) {
      try {
        clearTimeout(t);
      } catch {}
    }
    __aichatPlanRetryTimers = [];
  }

  function scheduleSetPlanRetry(seq, planType, source, delayMs) {
    const wait = Math.max(0, Number(delayMs) || 0);
    const id = setTimeout(() => {
      try {
        if (seq !== __aichatPlanDispatchSeq) return;
        dispatchSetPlan(planType, source);
      } catch {}
    }, wait);
    __aichatPlanRetryTimers.push(id);
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
  void readPlanFromSync().then((planType) => applyPlan(planType, 'sync:init'));

  // Keep page in sync when options changes plan
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      const ch = changes?.[PLAN_STORAGE_KEY];
      if (!ch) return;
      applyPlan(ch.newValue, 'sync:changed');
    });
  } catch {}

  // === usageData sync (page localStorage <-> extension storage.local) ===
  let __aichatUsageSyncTimer = 0;
  let __aichatLastLocalToChromeRev = 0;
  let __aichatLastAppliedChromeRev = 0;

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
    if (__aichatUsageSyncTimer) return;
    __aichatUsageSyncTimer = setTimeout(() => {
      __aichatUsageSyncTimer = 0;
      try {
        const data = readUsageFromLocalStorage();
        const rev = Date.now();
        writeRevToLocalStorage(rev);
        __aichatLastLocalToChromeRev = rev;
        chrome.storage.local.set({ [USAGE_DATA_LS_KEY]: data, [SYNC_REV_KEY]: rev }, () => void chrome.runtime?.lastError);
      } catch {}
    }, Math.max(0, Number(delayMs) || 0));
  }

  function applyChromeSnapshotToLocalStorage(data, rev) {
    const r = Number(rev) || 0;
    if (r && r <= __aichatLastAppliedChromeRev) return;
    __aichatLastAppliedChromeRev = r;
    writeUsageToLocalStorage(data || null);
    if (r) writeRevToLocalStorage(r);
  }

  function bootstrapUsageSync() {
    try {
      chrome.storage.local.get({ [USAGE_DATA_LS_KEY]: null, [SYNC_REV_KEY]: 0 }, (items) => {
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
    window.addEventListener(
      DATA_CHANGED_EVENT,
      () => {
        scheduleSyncUsageToChrome(300);
      },
      true
    );
  } catch {}

  // Sync to localStorage when Options imports/clears usageData in chrome.storage.local.
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
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
          void chrome.runtime?.lastError;
          try {
            const data = items?.[USAGE_DATA_LS_KEY] || null;
            const rev = Number(items?.[SYNC_REV_KEY]) || newRev || Date.now();
            applyChromeSnapshotToLocalStorage(data, rev);
          } catch {}
        });
      } catch {}
    });
  } catch {}

  // Bootstrap a one-time sync on load so Options can see existing usage data immediately.
  bootstrapUsageSync();
})();
