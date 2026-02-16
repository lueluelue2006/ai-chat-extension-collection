(() => {
  'use strict';

  const __aichatUsageMonitorGuardKey = '__aichat_chatgpt_usage_monitor_v1__';
  try {
    if (globalThis[__aichatUsageMonitorGuardKey]) return;
    Object.defineProperty(globalThis, __aichatUsageMonitorGuardKey, { value: true, configurable: false, enumerable: false, writable: false });
  } catch {}

  // Keep this module out of iframes to avoid duplicated monitors and extra fetch patch work.
  const __aichatUsageMonitorAllowedFrame = (() => {
    try {
      return window.self === window.top;
    } catch {
      return false;
    }
  })();
  if (!__aichatUsageMonitorAllowedFrame) return;

  // MV3 MAIN-world helpers.
  // Note: The upstream script uses GM_* naming. In MV3 we prefer extension storage
  // (chrome.storage.local) and keep a best-effort localStorage cache for sync reads.

  const __aichatGMKeyPrefix = '__aichat_gm_chatgpt_usage_monitor__:';
  function __aichatGMStorageKey(key) {
    return __aichatGMKeyPrefix + String(key || '');
  }

  // Options page uses chrome.storage.local as the source of truth for import/export/clear.
  // We keep localStorage as the fast read path, and sync both ways with a monotonic "revision" key.
  const __aichatGMSyncRevKey = __aichatGMStorageKey('__sync_rev_v1__');

  const __aichatHasChromeStorage = (() => {
    try {
      return !!(globalThis.chrome?.storage?.local?.get && globalThis.chrome?.storage?.local?.set);
    } catch {
      return false;
    }
  })();

  const __aichatGMChromePendingSet = Object.create(null);
  const __aichatGMChromePendingRemove = new Set();
  let __aichatGMChromeFlushTimer = 0;
  function __aichatFlushChromeStorage() {
    if (!__aichatHasChromeStorage) return;
    try {
      const toSet = { ...__aichatGMChromePendingSet };
      const toRemove = Array.from(__aichatGMChromePendingRemove);
      for (const k of Object.keys(__aichatGMChromePendingSet)) delete __aichatGMChromePendingSet[k];
      __aichatGMChromePendingRemove.clear();

      if (Object.keys(toSet).length) {
        try { chrome.storage.local.set(toSet, () => void chrome.runtime?.lastError); } catch {}
      }
      if (toRemove.length) {
        try { chrome.storage.local.remove(toRemove, () => void chrome.runtime?.lastError); } catch {}
      }
    } catch {}
  }

  function __aichatQueueChromeSet(k, v) {
    if (!__aichatHasChromeStorage) return;
    __aichatGMChromePendingSet[String(k)] = v;
    __aichatGMChromePendingRemove.delete(String(k));
    if (__aichatGMChromeFlushTimer) return;
    __aichatGMChromeFlushTimer = setTimeout(() => {
      __aichatGMChromeFlushTimer = 0;
      __aichatFlushChromeStorage();
    }, 120);
  }

  function __aichatQueueChromeRemove(k) {
    if (!__aichatHasChromeStorage) return;
    const key = String(k);
    delete __aichatGMChromePendingSet[key];
    __aichatGMChromePendingRemove.add(key);
    if (__aichatGMChromeFlushTimer) return;
    __aichatGMChromeFlushTimer = setTimeout(() => {
      __aichatGMChromeFlushTimer = 0;
      __aichatFlushChromeStorage();
    }, 120);
  }

  function __aichatWarmLocalStorageFromChromeStorage() {
    if (!__aichatHasChromeStorage) return;
    try {
      const localRev = (() => {
        try {
          const raw = localStorage.getItem(__aichatGMSyncRevKey);
          if (raw == null) return 0;
          const n = Number(JSON.parse(raw));
          return Number.isFinite(n) ? n : 0;
        } catch {
          return 0;
        }
      })();

      chrome.storage.local.get(null, (items) => {
        void chrome.runtime?.lastError;
        try {
          const all = items && typeof items === 'object' ? items : {};
          let chromeRev = 0;
          try {
            chromeRev = Number(all?.[__aichatGMSyncRevKey]);
          } catch {
            chromeRev = 0;
          }
          if (!Number.isFinite(chromeRev)) chromeRev = 0;

          const chromeKeys = [];
          for (const k of Object.keys(all)) {
            if (!String(k).startsWith(__aichatGMKeyPrefix)) continue;
            chromeKeys.push(String(k));
          }
          const chromeKeySet = new Set(chromeKeys);

          // If chrome has a newer revision (set by Options import/clear), treat chrome as authoritative:
          // overwrite localStorage and remove orphaned local keys.
          if (chromeKeySet.size && chromeRev > localRev) {
            for (const k of chromeKeys) {
              try {
                localStorage.setItem(k, JSON.stringify(all[k]));
              } catch {}
            }
            try {
              const toRemove = [];
              const n = Number(localStorage.length || 0);
              for (let i = 0; i < n; i++) {
                const k = localStorage.key(i);
                if (!k || !String(k).startsWith(__aichatGMKeyPrefix)) continue;
                if (!chromeKeySet.has(k)) toRemove.push(k);
              }
              for (const k of toRemove) {
                try {
                  localStorage.removeItem(k);
                } catch {}
              }
            } catch {}
            return;
          }

          // Otherwise, non-destructive warm: only fill missing keys from chrome.
          for (const k of chromeKeys) {
            try {
              if (localStorage.getItem(k) != null) continue;
              localStorage.setItem(k, JSON.stringify(all[k]));
            } catch {}
          }

          // One-time migration from older localStorage-only builds:
          // if chrome has no prefixed keys at all, seed chrome from localStorage.
          if (!chromeKeySet.size) {
            try {
              __aichatMigrateLocalStorageToChromeStorage();
            } catch {}
          }
        } catch {}
      });
    } catch {}
  }

  function __aichatMigrateLocalStorageToChromeStorage() {
    if (!__aichatHasChromeStorage) return;
    try {
      const batch = Object.create(null);
      const n = Number(localStorage.length || 0);
      for (let i = 0; i < n; i++) {
        const k = localStorage.key(i);
        if (!k || !String(k).startsWith(__aichatGMKeyPrefix)) continue;
        try {
          const raw = localStorage.getItem(k);
          if (raw == null) continue;
          batch[k] = JSON.parse(raw);
        } catch {}
      }
      if (Object.keys(batch).length) {
        // Mark the migrated snapshot as "newer" so future boots prefer chrome storage.
        if (typeof batch[__aichatGMSyncRevKey] !== 'number') batch[__aichatGMSyncRevKey] = Date.now();
        chrome.storage.local.set(batch, () => void chrome.runtime?.lastError);
      }
    } catch {}
  }

  // Best-effort: keep chrome.storage in sync and allow recovery if localStorage is cleared.
  try {
    // NOTE: warm includes an optional one-time migration when chrome has no keys.
    __aichatWarmLocalStorageFromChromeStorage();
  } catch {}

  function GM_getValue(key, defaultValue) {
    try {
      const raw = localStorage.getItem(__aichatGMStorageKey(key));
      if (raw == null) return defaultValue;
      return JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  }

  function GM_setValue(key, value) {
    try {
      const sk = __aichatGMStorageKey(key);
      if (typeof value === 'undefined') {
        try { localStorage.removeItem(sk); } catch {}
        __aichatQueueChromeRemove(sk);
        try {
          const rev = Date.now();
          localStorage.setItem(__aichatGMSyncRevKey, JSON.stringify(rev));
          __aichatQueueChromeSet(__aichatGMSyncRevKey, rev);
        } catch {}
        return;
      }
      localStorage.setItem(sk, JSON.stringify(value));
      __aichatQueueChromeSet(sk, value);
      try {
        const rev = Date.now();
        localStorage.setItem(__aichatGMSyncRevKey, JSON.stringify(rev));
        __aichatQueueChromeSet(__aichatGMSyncRevKey, rev);
      } catch {}
    } catch {}
  }

  function GM_addStyle(cssText) {
    try {
      const id = '__aichat_chatgpt_usage_monitor_style_v1__';
      let style = document.getElementById(id);
      if (!style) {
        style = document.createElement('style');
        style.id = id;
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = String(cssText || '');
      return style;
    } catch {
      return null;
    }
  }

  const __aichatMainMenuRegisterEvent = '__quicknav_menu_bridge_register_main_command_v1__';
  const __aichatMainMenuRunEvent = '__quicknav_menu_bridge_run_main_command_v1__';
  const __aichatMainMenuGroup = 'ChatGPT 用量统计';
  const __aichatUsageMonitorSetPlanEvent = '__aichat_chatgpt_usage_monitor_set_plan_v1__';
  const __aichatUsageMonitorPlanChangedEvent = '__aichat_chatgpt_usage_monitor_plan_changed_v1__';
  const __aichatUsageMonitorActionEvent = '__aichat_chatgpt_usage_monitor_action_v1__';
  const __aichatMainMenuHandlers = (() => {
    try {
      const k = '__aichat_chatgpt_usage_monitor_main_menu_handlers_v1__';
      const prev = window[k];
      if (prev && typeof prev === 'object') return prev;
      const next = Object.create(null);
      Object.defineProperty(window, k, { value: next, configurable: true, enumerable: false, writable: false });
      return next;
    } catch {
      return Object.create(null);
    }
  })();

  function __aichatDispatchMainMenuRegister(name, handlerKey) {
    const detail = { name, handlerKey, group: __aichatMainMenuGroup };
    try {
      window.dispatchEvent(new CustomEvent(__aichatMainMenuRegisterEvent, { detail }));
    } catch {}
  }

  // Register a MAIN-world handler with the isolated-world menu bridge (via CustomEvent).
  function GM_registerMenuCommand(name, fn) {
    const n = String(name || '').trim();
    if (!n || typeof fn !== 'function') return null;

    // In some environments, isolated-world functions aren't callable from MAIN world. We keep this as best-effort.
    try {
      const reg = window.__quicknavRegisterMenuCommand;
      if (typeof reg === 'function') return reg(n, fn);
    } catch {}

    const handlerKey = `chatgpt_usage_monitor:${n}`;
    __aichatMainMenuHandlers[handlerKey] = fn;

    __aichatDispatchMainMenuRegister(n, handlerKey);
    // Retry in case the menu bridge isn't ready yet (both run at document_start).
    setTimeout(() => __aichatDispatchMainMenuRegister(n, handlerKey), 500);
    setTimeout(() => __aichatDispatchMainMenuRegister(n, handlerKey), 1500);
    return handlerKey;
  }

  // Receive run requests from the isolated-world menu proxy.
  try {
    if (!window.__aichatChatGptUsageMonitorMainMenuListenerInstalled) {
      window.__aichatChatGptUsageMonitorMainMenuListenerInstalled = true;
      window.addEventListener(
        __aichatMainMenuRunEvent,
        (e) => {
          try {
            const d = e?.detail && typeof e.detail === 'object' ? e.detail : {};
            const handlerKey = String(d.handlerKey || '').trim();
            const fn = handlerKey ? __aichatMainMenuHandlers[handlerKey] : null;
            if (typeof fn === 'function') fn();
          } catch {}
        },
        true
      );
    }
  } catch {}

  // src/config.js
  var COLORS = {
    primary: "#5E9EFF",
    background: "#1A1B1E",
    surface: "#2A2B2E",
    border: "#363636",
    text: "#E5E7EB",
    secondaryText: "#9CA3AF",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    disabled: "#4B5563",
    white: "oklch(.928 .006 264.531)",
    gray: "oklch(.92 .004 286.32)",
    yellow: "oklch(.905 .182 98.111)",
    green: "oklch(.845 .143 164.978)",
    progressLow: "#EF4444",
    progressMed: "#F59E0B",
    progressHigh: "#10B981",
    progressExceed: "#4B5563",
    hourModel: "#61DAFB",
    dailyModel: "#9F7AEA",
    weeklyModel: "#10B981",
    monthlyModel: "#F472B6"
  };
  var STYLE = {
    borderRadius: "12px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)",
    spacing: {
      xs: "4px",
      sm: "8px",
      md: "16px",
      lg: "24px"
    },
    textSize: {
      xs: "0.75rem",
      sm: "0.875rem",
      md: "1rem"
    },
    lineHeight: {
      xs: "calc(1/.75)",
      sm: "calc(1.25/.875)",
      md: "1.5"
    }
  };
  var TIME_WINDOWS = {
    hour3: 3 * 60 * 60 * 1e3,
    hour5: 5 * 60 * 60 * 1e3,
    daily: 24 * 60 * 60 * 1e3,
    weekly: 7 * 24 * 60 * 60 * 1e3,
    monthly: 30 * 24 * 60 * 60 * 1e3
  };
  var defaultUsageData = {
    position: { x: null, y: null },
    minimizedPosition: { x: null, y: null },
    // v2 position format (aligned with QuickNav): {top,left,right,anchor,ts}
    positionV2: null,
    minimizedPositionV2: null,
    size: { width: 400, height: 500 },
    minimized: false,
    // MV3: 默认静默（不在页面注入悬浮 UI），仅记录数据并在扩展配置页展示。
    silentMode: true,
    progressType: "bar",
    planType: "team",
    showWindowResetTime: false,
    sharedQuotaGroups: {},
    models: {
      "gpt-5-2-pro": { requests: [], quota: 15, windowType: "monthly" },
      "gpt-5-1-pro": { requests: [], quota: 15, windowType: "monthly" },
      "gpt-5-pro": { requests: [], quota: 15, windowType: "monthly" },
      "o3-pro": { requests: [], quota: 0, windowType: "monthly" },
      "gpt-4-5": { requests: [], quota: 0, windowType: "daily" },
      "gpt-5-2-thinking": { requests: [], quota: 3e3, windowType: "weekly" },
      "gpt-5-1-thinking": { requests: [], quota: 3e3, windowType: "weekly" },
      "gpt-5-thinking": { requests: [], quota: 3e3, windowType: "weekly" },
      o3: { requests: [], quota: 100, windowType: "weekly" },
      "gpt-5-2-instant": { requests: [], quota: 1e4, windowType: "hour3" },
      "gpt-5-1": { requests: [], quota: 1e4, windowType: "hour3" },
      "gpt-5": { requests: [], quota: 1e4, windowType: "hour3" },
      "gpt-5-t-mini": { requests: [], quota: 1e4, windowType: "hour3" },
      "o4-mini": { requests: [], quota: 300, windowType: "daily" },
      "gpt-4o": { requests: [], quota: 80, windowType: "hour3" },
      "gpt-4-1": { requests: [], quota: 500, windowType: "hour3" },
      "gpt-5-mini": { requests: [], quota: 1e4, windowType: "hour3" }
    }
  };
  var SHARED_GROUP_COLORS = {
    "pro-premium-shared": "#facc15",
    "pro-thinking-shared": "#34d399",
    "pro-instant-shared": "#60a5fa",
    "team-premium-shared": "#facc15",
    "edu-premium-shared": "#facc15",
    "enterprise-premium-shared": "#facc15",
    "go-thinking-shared": "#34d399",
    "k12-thinking-shared": "#34d399",
    "plus-thinking-shared": "#34d399",
    "team-thinking-shared": "#34d399",
    "edu-thinking-shared": "#34d399",
    "enterprise-thinking-shared": "#34d399",
    "free-instant-shared": "#60a5fa",
    "go-instant-shared": "#60a5fa",
    "k12-instant-shared": "#60a5fa",
    "plus-instant-shared": "#60a5fa",
    "team-instant-shared": "#60a5fa",
    "edu-instant-shared": "#60a5fa",
    "enterprise-instant-shared": "#60a5fa"
  };
  var MODEL_DISPLAY_ORDER = [
    "gpt-5-2-pro",
    "gpt-5-1-pro",
    "gpt-5-pro",
    "o3-pro",
    "gpt-4-5",
    "gpt-5-2-thinking",
    "gpt-5-1-thinking",
    "gpt-5-thinking",
    "o3",
    "gpt-5-2-instant",
    "gpt-5-1",
    "gpt-5-t-mini",
    "o4-mini",
    "gpt-4o",
    "gpt-4-1",
    "gpt-5-mini",
    "gpt-5",
    "alpha"
  ];
  var MODEL_KEY_ALIASES = {
    "gpt-5-instant": "gpt-5",
    "gpt-5-1-instant": "gpt-5-1",
    "gpt-5-2": "gpt-5-2-instant"
  };
  function canonicalizeUsageModelKey(modelKey) {
    const key = String(modelKey || "").trim();
    if (!key) return "";
    return MODEL_KEY_ALIASES[key] || key;
  }
  function displayModelName(modelKey) {
    return canonicalizeUsageModelKey(modelKey);
  }
  var PLAN_DISPLAY_ORDER = [
    "free",
    "go",
    "k12_teacher",
    "plus",
    "team",
    "edu",
    "enterprise",
    "pro"
  ];
  var PLAN_CONFIGS = {
    free: {
      name: "Free",
      sharedQuotaGroups: {
        "free-instant-shared": {
          quota: 10,
          windowType: "hour5",
          displayName: "Free即时共用池"
        }
      },
      models: {
        "gpt-5-2-pro": { quota: 0, windowType: "monthly" },
        "gpt-5-1-pro": { quota: 0, windowType: "monthly" },
        "gpt-5-pro": { quota: 0, windowType: "monthly" },
        "o3-pro": { quota: 0, windowType: "monthly" },
        "gpt-4-5": { quota: 0, windowType: "daily" },
        "gpt-5-2-thinking": { quota: 1, windowType: "hour5" },
        "gpt-5-1-thinking": { quota: 1, windowType: "hour5" },
        "gpt-5-thinking": { quota: 1, windowType: "hour5" },
        o3: { quota: 0, windowType: "weekly" },
        "gpt-5-2-instant": { sharedGroup: "free-instant-shared" },
        "gpt-5-1": { sharedGroup: "free-instant-shared" },
        "gpt-5": { sharedGroup: "free-instant-shared" },
        "gpt-5-t-mini": { quota: 10, windowType: "daily" },
        "o4-mini": { quota: 0, windowType: "daily" },
        "gpt-4o": { quota: 0, windowType: "hour3" },
        "gpt-4-1": { quota: 0, windowType: "hour3" },
        "gpt-5-mini": { quota: 1e4, windowType: "hour3" }
      }
    },
    go: {
      name: "Go",
      sharedQuotaGroups: {
        "go-thinking-shared": {
          quota: 10,
          windowType: "hour5",
          displayName: "Go思考共用池"
        },
        "go-instant-shared": {
          quota: 100,
          windowType: "hour5",
          displayName: "Go即时共用池"
        }
      },
      models: {
        "gpt-5-2-pro": { quota: 0, windowType: "monthly" },
        "gpt-5-1-pro": { quota: 0, windowType: "monthly" },
        "gpt-5-pro": { quota: 0, windowType: "monthly" },
        "o3-pro": { quota: 0, windowType: "monthly" },
        "gpt-4-5": { quota: 0, windowType: "daily" },
        "gpt-5-2-thinking": { sharedGroup: "go-thinking-shared" },
        "gpt-5-1-thinking": { sharedGroup: "go-thinking-shared" },
        "gpt-5-thinking": { sharedGroup: "go-thinking-shared" },
        o3: { quota: 0, windowType: "weekly" },
        "gpt-5-2-instant": { sharedGroup: "go-instant-shared" },
        "gpt-5-1": { sharedGroup: "go-instant-shared" },
        "gpt-5": { sharedGroup: "go-instant-shared" },
        "gpt-5-t-mini": { quota: 100, windowType: "daily" },
        "o4-mini": { quota: 0, windowType: "daily" },
        "gpt-4o": { quota: 0, windowType: "hour3" },
        "gpt-4-1": { quota: 0, windowType: "hour3" },
        "gpt-5-mini": { quota: 1e4, windowType: "hour3" }
      }
    },
    k12_teacher: {
      name: "K12 Teacher",
      sharedQuotaGroups: {
        "k12-thinking-shared": {
          quota: 160,
          windowType: "hour3",
          displayName: "K12思考共用池"
        },
        "k12-instant-shared": {
          quota: 1e4,
          windowType: "hour3",
          displayName: "K12即时共用池"
        }
      },
      models: {
        "gpt-5-2-pro": { quota: 0, windowType: "monthly" },
        "gpt-5-1-pro": { quota: 0, windowType: "monthly" },
        "gpt-5-pro": { quota: 0, windowType: "monthly" },
        "o3-pro": { quota: 0, windowType: "monthly" },
        "gpt-4-5": { quota: 0, windowType: "daily" },
        "gpt-5-2-thinking": { sharedGroup: "k12-thinking-shared" },
        "gpt-5-1-thinking": { sharedGroup: "k12-thinking-shared" },
        "gpt-5-thinking": { sharedGroup: "k12-thinking-shared" },
        o3: { quota: 0, windowType: "weekly" },
        "gpt-5-2-instant": { sharedGroup: "k12-instant-shared" },
        "gpt-5-1": { sharedGroup: "k12-instant-shared" },
        "gpt-5": { sharedGroup: "k12-instant-shared" },
        "gpt-5-t-mini": { quota: 0, windowType: "daily" },
        "o4-mini": { quota: 0, windowType: "daily" },
        "gpt-4o": { quota: 0, windowType: "hour3" },
        "gpt-4-1": { quota: 0, windowType: "hour3" },
        "gpt-5-mini": { quota: 1e4, windowType: "hour3" }
      }
    },
    plus: {
      name: "Plus",
      sharedQuotaGroups: {
        "plus-thinking-shared": {
          quota: 160,
          windowType: "hour3",
          displayName: "Plus思考共用池"
        },
        "plus-instant-shared": {
          quota: 1e4,
          windowType: "hour3",
          displayName: "Plus即时共用池"
        }
      },
      models: {
        "gpt-5-2-pro": { quota: 0, windowType: "monthly" },
        "gpt-5-1-pro": { quota: 0, windowType: "monthly" },
        "gpt-5-pro": { quota: 0, windowType: "monthly" },
        "o3-pro": { quota: 0, windowType: "monthly" },
        "gpt-4-5": { quota: 0, windowType: "daily" },
        "gpt-5-2-thinking": { sharedGroup: "plus-thinking-shared" },
        "gpt-5-1-thinking": { sharedGroup: "plus-thinking-shared" },
        "gpt-5-thinking": { sharedGroup: "plus-thinking-shared" },
        o3: { quota: 100, windowType: "weekly" },
        "gpt-5-2-instant": { sharedGroup: "plus-instant-shared" },
        "gpt-5-1": { sharedGroup: "plus-instant-shared" },
        "gpt-5": { sharedGroup: "plus-instant-shared" },
        "gpt-5-t-mini": { quota: 1e4, windowType: "hour3" },
        "o4-mini": { quota: 300, windowType: "daily" },
        "gpt-4o": { quota: 80, windowType: "hour3" },
        "gpt-4-1": { quota: 80, windowType: "hour3" },
        "gpt-5-mini": { quota: 1e4, windowType: "hour3" }
      }
    },
    team: {
      name: "Team",
      sharedQuotaGroups: {
        "team-premium-shared": {
          quota: 15,
          windowType: "monthly",
          displayName: "Team高级共用池"
        },
        "team-thinking-shared": {
          quota: 3e3,
          windowType: "weekly",
          displayName: "Team思考共用池"
        },
        "team-instant-shared": {
          quota: 1e4,
          windowType: "hour3",
          displayName: "Team即时共用池"
        }
      },
      models: {
        "gpt-5-2-pro": { sharedGroup: "team-premium-shared" },
        "gpt-5-1-pro": { sharedGroup: "team-premium-shared" },
        "gpt-5-pro": { sharedGroup: "team-premium-shared" },
        "o3-pro": { quota: 0, windowType: "monthly" },
        "gpt-4-5": { quota: 0, windowType: "daily" },
        "gpt-5-2-thinking": { sharedGroup: "team-thinking-shared" },
        "gpt-5-1-thinking": { sharedGroup: "team-thinking-shared" },
        "gpt-5-thinking": { sharedGroup: "team-thinking-shared" },
        o3: { quota: 100, windowType: "weekly" },
        "gpt-5-2-instant": { sharedGroup: "team-instant-shared" },
        "gpt-5-1": { sharedGroup: "team-instant-shared" },
        "gpt-5": { sharedGroup: "team-instant-shared" },
        "gpt-5-t-mini": { quota: 1e4, windowType: "hour3" },
        "o4-mini": { quota: 300, windowType: "daily" },
        "gpt-4o": { quota: 80, windowType: "hour3" },
        "gpt-4-1": { quota: 500, windowType: "hour3" },
        "gpt-5-mini": { quota: 1e4, windowType: "hour3" }
      }
    },
    edu: {
      name: "Edu",
      sharedQuotaGroups: {
        "edu-premium-shared": {
          quota: 15,
          windowType: "monthly",
          displayName: "Edu高级共用池"
        },
        "edu-thinking-shared": {
          quota: 3e3,
          windowType: "weekly",
          displayName: "Edu思考共用池"
        },
        "edu-instant-shared": {
          quota: 1e4,
          windowType: "hour3",
          displayName: "Edu即时共用池"
        }
      },
      models: {
        "gpt-5-2-pro": { sharedGroup: "edu-premium-shared" },
        "gpt-5-1-pro": { sharedGroup: "edu-premium-shared" },
        "gpt-5-pro": { sharedGroup: "edu-premium-shared" },
        "o3-pro": { quota: 0, windowType: "monthly" },
        "gpt-4-5": { quota: 0, windowType: "daily" },
        "gpt-5-2-thinking": { sharedGroup: "edu-thinking-shared" },
        "gpt-5-1-thinking": { sharedGroup: "edu-thinking-shared" },
        "gpt-5-thinking": { sharedGroup: "edu-thinking-shared" },
        o3: { quota: 100, windowType: "weekly" },
        "gpt-5-2-instant": { sharedGroup: "edu-instant-shared" },
        "gpt-5-1": { sharedGroup: "edu-instant-shared" },
        "gpt-5": { sharedGroup: "edu-instant-shared" },
        "gpt-5-t-mini": { quota: 1e4, windowType: "hour3" },
        "o4-mini": { quota: 300, windowType: "daily" },
        "gpt-4o": { quota: 80, windowType: "hour3" },
        "gpt-4-1": { quota: 500, windowType: "hour3" },
        "gpt-5-mini": { quota: 1e4, windowType: "hour3" }
      }
    },
    enterprise: {
      name: "Enterprise",
      sharedQuotaGroups: {
        "enterprise-premium-shared": {
          quota: 15,
          windowType: "monthly",
          displayName: "Enterprise高级共用池"
        },
        "enterprise-thinking-shared": {
          quota: 3e3,
          windowType: "weekly",
          displayName: "Enterprise思考共用池"
        },
        "enterprise-instant-shared": {
          quota: 1e4,
          windowType: "hour3",
          displayName: "Enterprise即时共用池"
        }
      },
      models: {
        "gpt-5-2-pro": { sharedGroup: "enterprise-premium-shared" },
        "gpt-5-1-pro": { sharedGroup: "enterprise-premium-shared" },
        "gpt-5-pro": { sharedGroup: "enterprise-premium-shared" },
        "o3-pro": { quota: 0, windowType: "monthly" },
        "gpt-4-5": { quota: 0, windowType: "daily" },
        "gpt-5-2-thinking": { sharedGroup: "enterprise-thinking-shared" },
        "gpt-5-1-thinking": { sharedGroup: "enterprise-thinking-shared" },
        "gpt-5-thinking": { sharedGroup: "enterprise-thinking-shared" },
        o3: { quota: 100, windowType: "weekly" },
        "gpt-5-2-instant": { sharedGroup: "enterprise-instant-shared" },
        "gpt-5-1": { sharedGroup: "enterprise-instant-shared" },
        "gpt-5": { sharedGroup: "enterprise-instant-shared" },
        "gpt-5-t-mini": { quota: 1e4, windowType: "hour3" },
        "o4-mini": { quota: 300, windowType: "daily" },
        "gpt-4o": { quota: 80, windowType: "hour3" },
        "gpt-4-1": { quota: 500, windowType: "hour3" },
        "gpt-5-mini": { quota: 1e4, windowType: "hour3" }
      }
    },
    pro: {
      name: "Pro",
      sharedQuotaGroups: {
        "pro-premium-shared": {
          quota: 100,
          windowType: "daily",
          displayName: "Pro高级共用池"
        },
        "pro-thinking-shared": {
          quota: 1e4,
          windowType: "hour3",
          displayName: "Pro思考共用池"
        },
        "pro-instant-shared": {
          quota: 1e4,
          windowType: "hour3",
          displayName: "Pro即时共用池"
        }
      },
      models: {
        "gpt-5-2-pro": { sharedGroup: "pro-premium-shared" },
        "gpt-5-1-pro": { sharedGroup: "pro-premium-shared" },
        "gpt-5-pro": { sharedGroup: "pro-premium-shared" },
        "o3-pro": { sharedGroup: "pro-premium-shared" },
        "gpt-4-5": { quota: 100, windowType: "daily" },
        "gpt-5-2-thinking": { sharedGroup: "pro-thinking-shared" },
        "gpt-5-1-thinking": { sharedGroup: "pro-thinking-shared" },
        "gpt-5-thinking": { sharedGroup: "pro-thinking-shared" },
        o3: { quota: 1e4, windowType: "hour3" },
        "gpt-5-2-instant": { sharedGroup: "pro-instant-shared" },
        "gpt-5-1": { sharedGroup: "pro-instant-shared" },
        "gpt-5": { sharedGroup: "pro-instant-shared" },
        "gpt-5-t-mini": { quota: 1e4, windowType: "hour3" },
        "o4-mini": { quota: 1e4, windowType: "hour3" },
        "gpt-4o": { quota: 1e4, windowType: "hour3" },
        "gpt-4-1": { quota: 1e4, windowType: "hour3" },
        "gpt-5-mini": { quota: 1e4, windowType: "hour3" }
      }
    }
  };

  // src/events.js
  var EVENT_DATA_CHANGED = "chatgpt-usage-monitor:data-changed";
  function emitDataChanged() {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_DATA_CHANGED));
    } catch {
    }
  }
  function onDataChanged(handler) {
    window.addEventListener(EVENT_DATA_CHANGED, handler);
    return () => window.removeEventListener(EVENT_DATA_CHANGED, handler);
  }

  // src/state.js
  var usageData = null;
  function isSilent() {
    return !!(usageData?.silentMode || FORCE_SILENT_MODE);
  }
  function setUsageData(next) {
    usageData = next;
  }

  // src/userConfig.js
  // User-controlled silent mode (stored in usageData.silentMode) applies to the top frame.
  // MV3: 在页面主世界注入悬浮 UI 会显著增加 DOM/定时器负担，且容易与性能优化模块叠加造成不稳定。
  // 因此在扩展内强制静默：仅记录用量数据，展示放到 options 页面。
  var FORCE_SILENT_MODE = true;
  try {
    if (window !== window.top) FORCE_SILENT_MODE = true;
  } catch {
    FORCE_SILENT_MODE = true;
  }
  var SILENT_MODE_USER_KEY = "silentModeUserSetV1";

  // src/utils.js
  function formatTimeAgo(timestamp) {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1e3);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
  function formatTimestampForFilename(date = /* @__PURE__ */ new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${y}-${m}-${d}_${hh}-${mm}-${ss}`;
  }
  function tsOf(req) {
    if (typeof req === "number") return req;
    if (req && typeof req.t === "number") return req.t;
    if (req && typeof req.timestamp === "number") return req.timestamp;
    return NaN;
  }
  function formatTimeLeft(windowEnd) {
    const now = Date.now();
    const timeLeft = windowEnd - now;
    if (timeLeft <= 0) return "0h 0m";
    const hours = Math.floor(timeLeft / (60 * 60 * 1e3));
    const minutes = Math.floor(timeLeft % (60 * 60 * 1e3) / (60 * 1e3));
    return `${hours}h ${minutes}m`;
  }
  function getWindowEnd(timestamp, windowType) {
    return timestamp + TIME_WINDOWS[windowType];
  }
  function mergeAliasedUsageModels(models) {
    if (!models || typeof models !== "object") return false;
    const validWindowTypes = /* @__PURE__ */ new Set(["hour3", "hour5", "daily", "weekly", "monthly"]);
    let changed = false;
    Object.keys(models).forEach((rawKey) => {
      const canonicalKey = canonicalizeUsageModelKey(rawKey);
      if (!canonicalKey || canonicalKey === rawKey) return;
      const source = models[rawKey];
      if (!source || typeof source !== "object") {
        delete models[rawKey];
        changed = true;
        return;
      }
      const target = models[canonicalKey];
      if (!target || typeof target !== "object") {
        models[canonicalKey] = source;
      } else {
        const targetReq = Array.isArray(target.requests) ? target.requests.map((r) => tsOf(r)).filter((ts) => typeof ts === "number" && !Number.isNaN(ts)) : [];
        const sourceReq = Array.isArray(source.requests) ? source.requests.map((r) => tsOf(r)).filter((ts) => typeof ts === "number" && !Number.isNaN(ts)) : [];
        if (sourceReq.length) {
          target.requests = [...targetReq, ...sourceReq].sort((a, b) => b - a);
        }
        if ((!target.sharedGroup || typeof target.sharedGroup !== "string") && typeof source.sharedGroup === "string" && source.sharedGroup) {
          target.sharedGroup = source.sharedGroup;
        }
        if (typeof target.quota !== "number" && typeof source.quota === "number") {
          target.quota = source.quota;
        }
        if (!validWindowTypes.has(target.windowType) && validWindowTypes.has(source.windowType)) {
          target.windowType = source.windowType;
        }
      }
      delete models[rawKey];
      changed = true;
    });
    return changed;
  }

  // src/storage.js
  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  var Storage = {
    key: "usageData",
    get() {
      let data = GM_getValue(this.key);
      if (!data || typeof data !== "object") {
        data = deepClone(defaultUsageData);
      }
      if (!data.models || typeof data.models !== "object") {
        data.models = {};
      }
      if (!data.position) {
        data.position = { x: null, y: null };
      }
      if (!data.minimizedPosition) {
        data.minimizedPosition = { x: null, y: null };
      }
      if (data.positionV2 === void 0) {
        data.positionV2 = null;
      }
      if (data.minimizedPositionV2 === void 0) {
        data.minimizedPositionV2 = null;
      }
      if (!data.size) {
        data.size = { width: 400, height: 500 };
      }
      if (data.minimized === void 0) {
        data.minimized = false;
      }
      if (data.silentMode === void 0) {
        data.silentMode = false;
      }
      // Legacy fix: older builds could accidentally persist silentMode=true from an iframe.
      // If the user never toggled silent mode explicitly, default to visible in the top frame.
      if (!FORCE_SILENT_MODE) {
        try {
          const userSet = !!GM_getValue(SILENT_MODE_USER_KEY, false);
          if (!userSet && data.silentMode === true) {
            data.silentMode = false;
            try {
              // Best-effort: persist the repair so it doesn't "stick" on refresh.
              GM_setValue(this.key, data);
            } catch {}
          }
        } catch {}
      }
      if (!data.progressType) {
        data.progressType = "bar";
      }
      const planFallbackRaw = (() => {
        try {
          return GM_getValue("planType", "team");
        } catch {
          return "team";
        }
      })();
      const planFallback = String(planFallbackRaw || "").trim();
      if (!data.planType) {
        data.planType = PLAN_CONFIGS[planFallback] ? planFallback : "team";
      }
      if (!PLAN_CONFIGS[data.planType]) {
        data.planType = PLAN_CONFIGS[planFallback] ? planFallback : "team";
      }
      if (!data.sharedQuotaGroups) {
        data.sharedQuotaGroups = {};
      }
      if (data.showWindowResetTime === void 0) {
        data.showWindowResetTime = false;
      }
      if (data.models["gpt-4-1-mini"]) delete data.models["gpt-4-1-mini"];
      if (data.models["o4-mini-high"]) delete data.models["o4-mini-high"];
      const gpt5ProAllowedPlans = ["team", "edu", "enterprise", "pro"];
      const isGpt5ProAllowed = gpt5ProAllowedPlans.includes(data.planType);
      if (!isGpt5ProAllowed) {
        ["gpt-5-2-pro", "gpt-5-1-pro"].forEach((key) => {
          if (data.models[key]) delete data.models[key];
        });
      }
      if (data.deepResearch) delete data.deepResearch;
      const newModels = [
        "gpt-5",
        "gpt-5-thinking",
        "gpt-5-2-instant",
        "gpt-5-2-thinking",
        "gpt-5-2-pro",
        "gpt-5-1",
        "gpt-5-1-thinking",
        "gpt-5-pro",
        "gpt-5-1-pro",
        "o3",
        "o3-pro",
        "gpt-4-5",
        "o4-mini",
        "gpt-4o",
        "gpt-4-1",
        "gpt-5-t-mini",
        "gpt-5-mini"
      ];
      if (!isGpt5ProAllowed) {
        ["gpt-5-2-pro", "gpt-5-1-pro"].forEach((m) => {
          const idx = newModels.indexOf(m);
          if (idx !== -1) newModels.splice(idx, 1);
        });
      }
      newModels.forEach((modelId) => {
        if (data.models[modelId]) return;
        if (modelId === "gpt-5") {
          data.models[modelId] = { requests: [], quota: 1e4, windowType: "hour3" };
        } else if (modelId === "gpt-5-thinking") {
          data.models[modelId] = { requests: [], quota: 3e3, windowType: "weekly" };
        } else if (modelId === "gpt-5-2-instant") {
          data.models[modelId] = { requests: [], quota: 1e4, windowType: "hour3" };
        } else if (modelId === "gpt-5-2-thinking") {
          data.models[modelId] = { requests: [], quota: 3e3, windowType: "weekly" };
        } else if (modelId === "gpt-5-1") {
          data.models[modelId] = { requests: [], quota: 1e4, windowType: "hour3" };
        } else if (modelId === "gpt-5-1-thinking") {
          data.models[modelId] = { requests: [], quota: 3e3, windowType: "weekly" };
        } else if (modelId === "gpt-5-pro") {
          data.models[modelId] = { requests: [], quota: 15, windowType: "monthly" };
        } else if (modelId === "gpt-5-2-pro") {
          data.models[modelId] = { requests: [], quota: 15, windowType: "monthly" };
        } else if (modelId === "gpt-5-1-pro") {
          data.models[modelId] = { requests: [], quota: 15, windowType: "monthly" };
        } else if (modelId === "o3") {
          data.models[modelId] = { requests: [], quota: 100, windowType: "weekly" };
        } else if (modelId === "o3-pro") {
          data.models[modelId] = { requests: [], quota: 0, windowType: "monthly" };
        } else if (modelId === "gpt-4-5") {
          data.models[modelId] = { requests: [], quota: 0, windowType: "daily" };
        } else if (modelId === "o4-mini") {
          data.models[modelId] = { requests: [], quota: 300, windowType: "daily" };
        } else if (modelId === "gpt-4o") {
          data.models[modelId] = { requests: [], quota: 80, windowType: "hour3" };
        } else if (modelId === "gpt-4-1") {
          data.models[modelId] = { requests: [], quota: 500, windowType: "hour3" };
        } else if (modelId === "gpt-5-t-mini") {
          data.models[modelId] = { requests: [], quota: 1e4, windowType: "hour3" };
        } else if (modelId === "gpt-5-mini") {
          data.models[modelId] = { requests: [], quota: 1e4, windowType: "hour3" };
        }
      });
      if (data.models["gpt-4"]) delete data.models["gpt-4"];
      Object.entries(data.models).forEach(([key, model]) => {
        if (!model || typeof model !== "object") {
          data.models[key] = { requests: [], quota: 50, windowType: "daily" };
          return;
        }
        if (!Array.isArray(model.requests)) {
          model.requests = [];
          if (typeof model.count === "number" && model.count > 0) {
            const now = Date.now();
            for (let i = 0; i < model.count; i++) {
              model.requests.push(now - i * 6e4);
            }
          }
          delete model.count;
          delete model.lastUpdate;
        }
        if (model.dailyLimit !== void 0 && model.quota === void 0) {
          model.quota = model.dailyLimit;
          delete model.dailyLimit;
        }
        if (model.resetFrequency !== void 0 && model.windowType === void 0) {
          model.windowType = model.resetFrequency;
          delete model.resetFrequency;
        }
        if (!["hour3", "hour5", "daily", "weekly", "monthly"].includes(model.windowType)) {
          model.windowType = "daily";
        }
        if (Array.isArray(model.requests)) {
          model.requests = model.requests.map((r) => tsOf(r)).filter((ts) => typeof ts === "number" && !Number.isNaN(ts));
        }
      });
      try { mergeAliasedUsageModels(data.models); } catch {
      }
      if (data.sharedQuotaGroups && typeof data.sharedQuotaGroups === "object") {
        Object.values(data.sharedQuotaGroups).forEach((group) => {
          if (group && Array.isArray(group.requests)) {
            group.requests = group.requests.map((r) => {
              if (typeof r === "number") return { t: r };
              if (r && typeof r === "object") {
                const t = tsOf(r);
                if (typeof r.modelId === "string") return { t, modelId: r.modelId };
                const copy = { ...r };
                if (typeof t === "number" && !Number.isNaN(t) && typeof copy.t !== "number") copy.t = t;
                return copy;
              }
              return r;
            }).filter((req) => {
              const t = tsOf(req);
              return typeof t === "number" && !Number.isNaN(t);
            });
          }
        });
      }
      delete data.lastDailyReset;
      delete data.lastWeeklyReset;
      delete data.lastReset;
      this.set(data);
      return data;
    },
    set(newData) {
      GM_setValue(this.key, newData);
    },
    update(callback) {
      const data = this.get();
      callback(data);
      this.set(data);
    }
  };
  function refreshUsageData() {
    const data = Storage.get();
    setUsageData(data);
    return usageData;
  }
  function updateUsageData(mutator) {
    Storage.update((data) => {
      mutator(data);
    });
    return refreshUsageData();
  }

  // src/ui/toast.js
  function showToast(message, type = "success") {
    const container = document.getElementById("chatUsageMonitor");
    if (!container) return;
    const existingToast = container.querySelector(".toast");
    if (existingToast) existingToast.remove();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    if (type === "error") {
      toast.style.color = COLORS.danger;
      toast.style.borderColor = COLORS.danger;
    } else if (type === "warning") {
      toast.style.color = COLORS.warning;
      toast.style.borderColor = COLORS.warning;
    }
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("show");
    }, 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3e3);
  }

  // src/features/importExport.js
  function exportUsageData() {
    const data = Storage.get();
    const exportData = { ...data };
    const jsonData = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chatgpt-usage-${formatTimestampForFilename()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("用量统计数据已导出");
    }, 100);
  }
  function importUsageData() {
    if (!confirm("导入将合并现有记录与导入文件中的记录。继续吗？")) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.style.display = "none";
    input.onchange = function(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const importedData = JSON.parse(event.target.result);
          if (!validateImportedData(importedData)) {
            showToast("导入失败：数据格式不正确", "error");
            return;
          }
          const importSummary = generateImportSummary(importedData);
          if (!confirm(`导入记录摘要:\\n${importSummary}\\n\\n确认导入这些数据吗？`)) return;
          const currentData = Storage.get();
          const mergedData = mergeUsageData(currentData, importedData);
          Storage.set(mergedData);
          refreshUsageData();
          emitDataChanged();
          showToast("用量记录已成功导入", "success");
        } catch (error) {
          console.error("[monitor] Import error:", error);
          showToast("导入失败：" + error.message, "error");
        } finally {
          document.body.removeChild(input);
        }
      };
      reader.readAsText(file);
    };
    document.body.appendChild(input);
    input.click();
  }
  function validateImportedData(data) {
    if (!data || typeof data !== "object") return false;
    if (!("models" in data) || typeof data.models !== "object") return false;
    for (const modelKey in data.models) {
      const model = data.models[modelKey];
      if (!model || typeof model !== "object") return false;
      if (!Array.isArray(model.requests)) return false;
      if (typeof model.quota !== "number" && typeof model.sharedGroup !== "string") return false;
      if (model.windowType && !["hour3", "hour5", "daily", "weekly", "monthly"].includes(model.windowType))
        return false;
    }
    return true;
  }
  function generateImportSummary(importedData) {
    let summary = "";
    const modelCount = Object.keys(importedData.models || {}).length;
    let totalRequests = 0;
    const modelDetails = [];
    Object.entries(importedData.models || {}).forEach(([key, model]) => {
      const count = (model.requests || []).length;
      totalRequests += count;
      if (count > 0) modelDetails.push(`${key}: ${count}条记录`);
    });
    summary += `共 ${modelCount} 个模型，${totalRequests} 条请求记录\\n`;
    if (modelDetails.length <= 5) {
      summary += `\\n模型详情:\\n${modelDetails.join("\\n")}`;
    }
    if (importedData.legacyMiniCount !== void 0 && importedData.legacyMiniCount > 0) {
      summary += `\\n\\n遗留特殊模型计数: ${importedData.legacyMiniCount} (已不再使用)`;
    }
    return summary;
  }
  function mergeUsageData(currentData, importedData) {
    const result = JSON.parse(JSON.stringify(currentData));
    Object.entries(importedData.models || {}).forEach(([modelKey, importedModel]) => {
      if (!result.models[modelKey]) {
        result.models[modelKey] = {
          requests: [],
          quota: importedModel.quota || 50,
          windowType: importedModel.windowType || "daily"
        };
        if (importedModel.sharedGroup) result.models[modelKey].sharedGroup = importedModel.sharedGroup;
      }
      const currentRequests = result.models[modelKey].requests || [];
      const now = Date.now();
      const windowType = result.models[modelKey].windowType || "daily";
      const windowDuration = TIME_WINDOWS[windowType] || TIME_WINDOWS.daily;
      const oldestRelevantTime = now - windowDuration;
      const relevantImportedRequests = (importedModel.requests || []).map((req) => tsOf(req)).filter((ts) => ts > oldestRelevantTime);
      const existingTimeMap = /* @__PURE__ */ new Map();
      currentRequests.forEach((req) => {
        const roundedTime = Math.floor(tsOf(req) / 1e3) * 1e3;
        existingTimeMap.set(roundedTime, true);
      });
      const newRequests = relevantImportedRequests.filter((ts) => {
        const roundedTime = Math.floor(ts / 1e3) * 1e3;
        return !existingTimeMap.has(roundedTime);
      });
      result.models[modelKey].requests = [...currentRequests.map(tsOf), ...newRequests].filter((ts) => typeof ts === "number" && !Number.isNaN(ts)).sort((a, b) => b - a);
    });
    return result;
  }

  // src/styles.js
  function injectStyles() {
    GM_addStyle(`
  #chatUsageMonitor {
  position: fixed;
  bottom: 100px;  /* 往下移动一点点 */
  left: ${STYLE.spacing.lg};  /* 改为左侧 */
  width: 400px;
  height: 500px;
  max-height: 80vh;
  overflow: auto;
  background: ${COLORS.background};
  color: ${COLORS.text};
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  border-radius: ${STYLE.borderRadius};
  box-shadow: ${STYLE.boxShadow};
  z-index: 9999;
  border: 1px solid ${COLORS.border};
  user-select: none;
  resize: both !important;
  transition: all 0.3s ease;
  transform-origin: top left;  /* 改为左侧 */
  }

  #chatUsageMonitor.hidden {
  display: none !important;
  }

  #chatUsageMonitor::after {
  content: "";
  position: absolute;
  bottom: 0;
  right: 0;
  width: 15px;
  height: 15px;
  background: transparent;
  border-bottom: 2px solid ${COLORS.yellow};
  border-right: 2px solid ${COLORS.yellow};
  opacity: 0.5;
  pointer-events: none;
  }

  #chatUsageMonitor:hover::after {
  opacity: 1;
  }

  #chatUsageMonitor.minimized {
  width: 30px !important;
  height: 30px !important;
  border-radius: 50%;
  overflow: hidden;
  resize: none;
  opacity: 0.8;
  cursor: pointer;
  background-color: ${COLORS.primary};
  bottom: auto;
  top: 100px;  /* 往下移动一点点 */
  left: ${STYLE.spacing.lg};  /* 改为左侧 */
  z-index: 9999;
  }

  #chatUsageMonitor.minimized:hover {
  opacity: 1;
  }

  #chatUsageMonitor.minimized > * {
  display: none !important;
  }

		  #chatUsageMonitor.minimized::before {
		  content: "次";
		  color: white;
		  position: absolute;
		  top: 0;
	  left: 0;
	  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  }

  #chatUsageMonitor header {
  padding: 0 ${STYLE.spacing.md};
  display: flex;
  border-radius: ${STYLE.borderRadius} ${STYLE.borderRadius} 0 0;
  background: ${COLORS.background};
  flex-direction: row;
  position: relative;
  align-items: center;
  height: 36px;
  cursor: move; /* 指示整个头部可拖动 */
  }

  #chatUsageMonitor .minimize-btn {
  position: absolute;
  left: 8px;
  top: 0;
  height: 36px;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${COLORS.secondaryText};
  cursor: pointer;
  font-size: 18px;
  transition: color 0.2s ease;
  z-index: 10;
  }

  #chatUsageMonitor .minimize-btn:hover {
  color: ${COLORS.yellow};
  }

  #chatUsageMonitor header button {
  border: none;
  background: none;
  color: ${COLORS.secondaryText};
  cursor: pointer;
  font-weight: 500;
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 30px; /* Move buttons to the right to avoid overlap with minimize button */
  padding-top: ${STYLE.spacing.sm};
  }

  #chatUsageMonitor header button.active {
  color: ${COLORS.yellow};
  }

  #chatUsageMonitor .content {
  padding: ${STYLE.spacing.xs} ${STYLE.spacing.md};
  overflow-y: auto;
  }

  #chatUsageMonitor .reset-info {
  font-size: ${STYLE.textSize.xs};
  color: ${COLORS.secondaryText};
  margin: ${STYLE.spacing.xs} 0;
  }

  #chatUsageMonitor input {
  width: 80px;
  padding: ${STYLE.spacing.xs} ${STYLE.spacing.sm};
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: ${COLORS.secondaryText};
  font-family: monospace;
  font-size: ${STYLE.textSize.xs};
  line-height: ${STYLE.lineHeight.xs};
  transition: color 0.2s ease;
  }

  #chatUsageMonitor input:focus {
  outline: none;
  color: ${COLORS.yellow};
  background: transparent;
  }

  #chatUsageMonitor input:hover {
  color: ${COLORS.yellow};
  }

  #chatUsageMonitor .btn {
  padding: ${STYLE.spacing.sm} ${STYLE.spacing.md};
  border: none;
  cursor: pointer;
  color: ${COLORS.white};
  font-weight: 500;
  font-size: ${STYLE.textSize.sm};
  transition: all 0.2s ease;
  text-decoration: underline;
  }

  #chatUsageMonitor .btn:hover {
  color: ${COLORS.yellow};
  }

  #chatUsageMonitor .delete-btn {
  padding: ${STYLE.spacing.xs} ${STYLE.spacing.sm};
  margin-left: ${STYLE.spacing.sm};
  }

  #chatUsageMonitor .delete-btn.btn:hover {
  color: ${COLORS.danger};
  }

  #chatUsageMonitor::-webkit-scrollbar {
  width: 8px;
  }

  #chatUsageMonitor::-webkit-scrollbar-track {
  background: ${COLORS.surface};
  border-radius: 4px;
  }

  #chatUsageMonitor::-webkit-scrollbar-thumb {
  background: ${COLORS.border};
  border-radius: 4px;
  }

  #chatUsageMonitor::-webkit-scrollbar-thumb:hover {
  background: ${COLORS.secondaryText};
  }

  #chatUsageMonitor .progress-container {
  width: 100%;
  background: ${COLORS.surface};
  margin-top: ${STYLE.spacing.xs};
  border-radius: 6px;
  overflow: hidden;
  height: 8px;
  position: relative;
  }

  #chatUsageMonitor .progress-bar {
  height: 100%;
  transition: width 0.3s ease;
  border-radius: 6px;
  background: linear-gradient(
  90deg,
  ${COLORS.progressLow} 0%,
  ${COLORS.progressMed} 50%,
  ${COLORS.progressHigh} 100%
  );
  background-size: 200% 100%;
  animation: gradientShift 2s linear infinite;
  }

  #chatUsageMonitor .progress-bar.low-usage {
  animation: pulse 1.5s ease-in-out infinite;
  }

  #chatUsageMonitor .progress-bar.exceeded {
  background: ${COLORS.progressExceed};
  animation: none;
  }

  #chatUsageMonitor .window-badge {
  display: inline-block;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 4px;
  margin-left: 4px;
  color: ${COLORS.background};
  font-weight: bold;
  }

  #chatUsageMonitor .window-badge.hour3 {
  background-color: ${COLORS.hourModel};
  }

  #chatUsageMonitor .window-badge.hour5 {
  background-color: ${COLORS.hourModel};
  }

  #chatUsageMonitor .window-badge.daily {
  background-color: ${COLORS.dailyModel};
  }

  #chatUsageMonitor .window-badge.weekly {
  background-color: ${COLORS.weeklyModel};
  }

  #chatUsageMonitor .window-badge.monthly {
  background-color: ${COLORS.monthlyModel};
  }

  #chatUsageMonitor .request-time {
  color: ${COLORS.secondaryText};
  font-size: ${STYLE.textSize.xs};
  }

  #chatUsageMonitor .window-info {
  color: ${COLORS.secondaryText};
  font-size: ${STYLE.textSize.xs};
  margin-top: 2px;
  }

  #chatUsageMonitor .active-window {
  font-weight: bold;
  }

  #chatUsageMonitor .unknown-quota {
  color: ${COLORS.warning};
  font-style: italic;
  }

  /* 为特殊模型添加样式 */
  #chatUsageMonitor .special-model-row {
  border-top: 1px dashed ${COLORS.border};
  margin-top: 8px;
  padding-top: 8px;
  opacity: 0.8;
  }

  #chatUsageMonitor .special-model-name {
  color: ${COLORS.disabled};
  font-style: italic;
  }

  /* 周分析报告样式 */
  #chatUsageMonitor .weekly-report {
  background: ${COLORS.surface};
  border-radius: 8px;
  padding: ${STYLE.spacing.md};
  margin-top: ${STYLE.spacing.md};
  }

  #chatUsageMonitor .weekly-report h3 {
  color: ${COLORS.yellow};
  margin-bottom: ${STYLE.spacing.sm};
  font-size: ${STYLE.textSize.md};
  }

  #chatUsageMonitor .weekly-report .stat-row {
  display: flex;
  justify-content: space-between;
  padding: ${STYLE.spacing.xs} 0;
  font-size: ${STYLE.textSize.sm};
  border-bottom: 1px solid ${COLORS.border};
  }

  #chatUsageMonitor .weekly-report .stat-row:last-child {
  border-bottom: none;
  }

  #chatUsageMonitor .weekly-report .stat-label {
  color: ${COLORS.secondaryText};
  }

  #chatUsageMonitor .weekly-report .stat-value {
  color: ${COLORS.text};
  font-weight: 500;
  }

  #chatUsageMonitor .weekly-report .model-breakdown {
  margin-top: ${STYLE.spacing.sm};
  }

  #chatUsageMonitor .weekly-report .model-item {
  display: flex;
  justify-content: space-between;
  padding: ${STYLE.spacing.xs} ${STYLE.spacing.sm};
  font-size: ${STYLE.textSize.xs};
  background: ${COLORS.background};
  border-radius: 4px;
  margin: 2px 0;
  }

  @keyframes gradientShift {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
  }

  @keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }

  /* Dot-based progression system */
  #chatUsageMonitor .dot-progress {
  display: flex;
  gap: 4px;
  align-items: center;
  height: 8px;
  }

  #chatUsageMonitor .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
  }

  #chatUsageMonitor .dot-empty {
  background: rgba(239, 68, 68, 0.3);
  border: 1px solid ${COLORS.progressLow};
  }

  #chatUsageMonitor .dot-partial {
  background: ${COLORS.progressMed};
  }

  #chatUsageMonitor .dot-full {
  background: ${COLORS.progressHigh};
  }

  #chatUsageMonitor .dot-exceeded {
  background: ${COLORS.progressExceed};
  position: relative;
  }

  #chatUsageMonitor .dot-exceeded::before {
  content: '';
  position: absolute;
  top: 50%;
  left: -2px;
  right: -2px;
  height: 2px;
  background: ${COLORS.surface};
  transform: rotate(45deg);
  }

  #chatUsageMonitor .table-header {
  font-family: monospace;
  color: ${COLORS.white};
  font-size:  ${STYLE.textSize.xs};
  line-height: ${STYLE.lineHeight.xs};
  display : grid;
  align-items: center;
  grid-template-columns: 2fr 1.5fr 1.5fr 2fr;
  }

  #chatUsageMonitor .model-row {
  font-family: monospace;
  color: ${COLORS.secondaryText};
  transition: color 0.2s ease;
  font-size:  ${STYLE.textSize.xs};
  line-height: ${STYLE.lineHeight.xs};
  display : grid;
  grid-template-columns: 2fr 1.5fr 1.5fr 2fr;
  align-items: center;
  }

  #chatUsageMonitor .model-row:hover {
  color: ${COLORS.yellow};
  text-decoration-line: underline;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  /* DeepResearch 分割线与区域样式 */
  #chatUsageMonitor .section-divider {
  margin: 8px 0 10px 0;
  border-top: 1px dashed ${COLORS.border};
  opacity: 0.8;
  }
  #chatUsageMonitor .deepresearch-title {
  font-family: monospace;
  font-weight: bold;
  color: ${COLORS.white};
  font-size: ${STYLE.textSize.xs};
  margin: 6px 0;
  }

  /* Container to help position the arrow (pseudo-element) */
  #chatUsageMonitor .custom-select {
  position: relative;
  display: inline-block;
  margin-right: 8px;
  }

  /* Hide the native select arrow and style the dropdown */
  #chatUsageMonitor .custom-select select {
  -webkit-appearance: none; /* Safari and Chrome */
  -moz-appearance: none;    /* Firefox */
  appearance: none;         /* Standard modern browsers */
  background-color: transparent;
  color: #ffffff;
  border: none;
  cursor: pointer;
  color: ${COLORS.white};
  font-size: ${STYLE.textSize.sm};
  line-height:  ${STYLE.lineHeight.sm};
  padding: 2px 5px;
  }

  /* Style the list of options (when the dropdown is open) */
  .custom-select select option {
  background: ${COLORS.background};
  color: ${COLORS.white};
  }

  /* Optional: highlight the hovered option in some browsers */
  .custom-select select option:hover {
  background: ${COLORS.background};
  color: ${COLORS.yellow};
  text-decoration-line: underline;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  #chatUsageMonitor input {
  width: 90%;
  padding: ${STYLE.spacing.xs} ${STYLE.spacing.sm};
  margin: 0;
  border: 1px solid ${COLORS.border};
  border-radius: 4px;
  background: ${COLORS.surface};
  color: ${COLORS.secondaryText};
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: ${STYLE.textSize.xs};
  line-height: ${STYLE.lineHeight.xs};
  transition: all 0.2s ease;
  }

  #chatUsageMonitor input:focus {
  outline: none;
  border-color: ${COLORS.yellow};
  color: ${COLORS.yellow};
  background: rgba(245, 158, 11, 0.1);
  }

  #chatUsageMonitor input:hover {
  border-color: ${COLORS.yellow};
  color: ${COLORS.yellow};
  }

  /* Toast notification for feedback */
  #chatUsageMonitor .toast {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: ${COLORS.background};
  color: ${COLORS.success};
  padding: ${STYLE.spacing.sm} ${STYLE.spacing.md};
  border-radius: ${STYLE.borderRadius};
  border: 1px solid ${COLORS.success};
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 10000;
  }

  #chatUsageMonitor .toast.show {
  opacity: 1;
  }
  `);
  }

			  // src/tracking/fetchInterceptor.js
			  function installFetchInterceptor() {
			    const targetWindow = window;
			    const hub = targetWindow.__aichat_chatgpt_fetch_hub_v1__ || null;
			    if (hub && typeof hub.register === "function") {
			      if (targetWindow.__chatgptUsageHubInstalled) return;
			      targetWindow.__chatgptUsageHubInstalled = true;

			      hub.register({
			        // Run after other modules that may rewrite the outgoing payload (e.g. model/effort toggles).
			        priority: 200,
			        onConversationStart: (ctx) => {
			          try {
			            // Use the final outgoing payload (after other modules rewrite the request).
			            const payload = ctx?.conversation?.payload;
			            const modelId =
			              payload && typeof payload === "object" && typeof payload.model === "string" ? payload.model : null;
			            const modelKey = modelId ? normalizeUsageModelKey(modelId) : getUsageModelKeyFromCookieOrBody(ctx?.init?.body);
			            if (!modelKey) return;
			            setTimeout(() => {
			              try {
			                recordModelUsageByModelId(modelKey);
			              } catch {}
			            }, 0);
			          } catch {}
			        },
		      });
		      return;
		    }

    // Fallback: patch fetch (legacy). Should not happen when the extension injects the shared hub.
		    const originalFetch = targetWindow.fetch;
		    if (originalFetch?.__chatgptUsagePatched) return;
		    const wrapped = new Proxy(originalFetch, {
		      apply: async function(target, thisArg, args) {
		        let modelKey = null;
		        /** @type {Promise<string|null>|null} */
		        let bodyTextPromise = null;
		        try {
		          const [requestInfo, requestInit] = args;
		          const fetchUrl = typeof requestInfo === "string" ? requestInfo : requestInfo?.href || requestInfo?.url || "";
		          const requestMethod = typeof requestInfo === "object" && requestInfo?.method ? requestInfo.method : requestInit?.method || "GET";
		          if (String(requestMethod || "").toUpperCase() === "POST" && /\/backend-api\/(?:f\/)?conversation(?:\?|$)/.test(fetchUrl || "")) {
		            if (typeof requestInit?.body === "string") {
		              modelKey = getUsageModelKeyFromCookieOrBody(requestInit.body);
		            } else if (requestInfo && typeof requestInfo === "object" && typeof requestInfo.clone === "function") {
		              // If fetch is called with a Request object, its body is not in init; read from a clone (best-effort).
		              bodyTextPromise = requestInfo
		                .clone()
		                .text()
		                .then((t) => (typeof t === "string" ? t : null))
		                .catch(() => null);
		            } else {
		              modelKey = getUsageModelKeyFromCookieOrBody(null);
		            }
		          }
		        } catch {
		        }
		        const response = await target.apply(thisArg, args);
		        if (!modelKey && bodyTextPromise) {
		          try {
		            const text = await bodyTextPromise;
		            modelKey = getUsageModelKeyFromCookieOrBody(text);
		          } catch {}
		        }
		        if (modelKey) {
		          setTimeout(() => {
		            try {
		              recordModelUsageByModelId(modelKey);
		            } catch {}
		          }, 0);
		        }
		        return response;
		      }
		    });
    wrapped.__chatgptUsagePatched = true;
    targetWindow.fetch = wrapped;
  }

  // src/usage.js
	  function cleanupExpiredRequests() {
	    const now = Date.now();
	    const maxWindow = TIME_WINDOWS.monthly;
    Object.values(usageData.models || {}).forEach((model) => {
      if (!Array.isArray(model.requests)) return;
      model.requests = model.requests.map((req) => tsOf(req)).filter((ts) => now - ts < maxWindow);
    });
    if (usageData.sharedQuotaGroups && typeof usageData.sharedQuotaGroups === "object") {
      Object.values(usageData.sharedQuotaGroups).forEach((group) => {
        if (!Array.isArray(group.requests)) return;
        group.requests = group.requests.filter((req) => now - tsOf(req) < maxWindow);
      });
	    }
	  }
	  let __aichatUsageMonitorLastCleanupAt = 0;
	  function recordModelUsageByModelId(modelId) {
	    if (!usageData || typeof usageData !== "object") refreshUsageData();
	    const now = Date.now();
	    // Avoid scanning all models on every request; monthly cleanup is enough.
	    if (!__aichatUsageMonitorLastCleanupAt || now - __aichatUsageMonitorLastCleanupAt > 3e4) {
	      __aichatUsageMonitorLastCleanupAt = now;
	      cleanupExpiredRequests();
	    }
	    if (!usageData.models[modelId]) {
	      usageData.models[modelId] = {
	        requests: [],
	        quota: 50,
	        windowType: "daily"
	      };
	    }
	    usageData.models[modelId].requests.push(now);
	    Storage.set(usageData);
	    emitDataChanged();
	  }
  function __aichatIsPlanStructureApplied(planType, data) {
    const planConfig = PLAN_CONFIGS[planType];
    if (!planConfig) return true;
    if (!data || typeof data !== "object") return false;

    const models = data.models && typeof data.models === "object" ? data.models : null;
    if (!models) return false;

    const planModels = planConfig.models && typeof planConfig.models === "object" ? planConfig.models : null;
    if (!planModels) return true;
    const firstModelKey = Object.keys(planModels)[0];
    if (!firstModelKey) return true;

    const firstCfg = planModels[firstModelKey];
    const firstModel = models[firstModelKey];
    if (!firstModel || typeof firstModel !== "object") return false;

    if (firstCfg && typeof firstCfg === "object" && typeof firstCfg.sharedGroup === "string") {
      if (firstModel.sharedGroup !== firstCfg.sharedGroup) return false;
    } else {
      // Base structure check only: don't force exact quotas (user may customize), but ensure it is not bound to a shared group.
      if (typeof firstModel.sharedGroup === "string" && firstModel.sharedGroup) return false;
      if (typeof firstModel.quota !== "number") return false;
      if (!firstModel.windowType) return false;
    }

    const groupsCfg = planConfig.sharedQuotaGroups && typeof planConfig.sharedQuotaGroups === "object" ? planConfig.sharedQuotaGroups : null;
    if (groupsCfg) {
      const groups = data.sharedQuotaGroups && typeof data.sharedQuotaGroups === "object" ? data.sharedQuotaGroups : null;
      if (!groups) return false;
      for (const groupId of Object.keys(groupsCfg)) {
        const expected = groupsCfg[groupId];
        const g = groups[groupId];
        if (!g || typeof g !== "object") return false;
        // Shared group quotas are not user-editable in UI, so keep them strictly in sync with plan defaults.
        if (expected && typeof expected === "object") {
          if (typeof expected.quota === "number" && g.quota !== expected.quota) return false;
          if (typeof expected.windowType === "string" && g.windowType !== expected.windowType) return false;
        }
      }
    }
    return true;
  }
  function applyPlanConfig(planType) {
    const planConfig = PLAN_CONFIGS[planType];
    if (!planConfig) return;
    updateUsageData((data) => {
      const existingUsageByModel = {};
      Object.entries(data.models || {}).forEach(([modelKey, model]) => {
        if (model?.requests?.length) existingUsageByModel[modelKey] = [...model.requests];
      });
      const existingGroupRequestsById = {};
      Object.entries(data.sharedQuotaGroups || {}).forEach(([groupId, group]) => {
        if (Array.isArray(group?.requests)) {
          existingGroupRequestsById[groupId] = [...group.requests];
        }
      });
      data.sharedQuotaGroups = {};
      if (planConfig.sharedQuotaGroups) {
        Object.entries(planConfig.sharedQuotaGroups).forEach(([groupId, groupConfig]) => {
          data.sharedQuotaGroups[groupId] = {
            quota: groupConfig.quota,
            windowType: groupConfig.windowType,
            models: groupConfig.models,
            displayName: groupConfig.displayName,
            requests: existingGroupRequestsById[groupId] ? [...existingGroupRequestsById[groupId]] : []
          };
        });
      }
      const nextModels = {};
      Object.entries(planConfig.models).forEach(([modelKey, cfg]) => {
        nextModels[modelKey] = {
          requests: existingUsageByModel[modelKey] ? [...existingUsageByModel[modelKey]] : []
        };
        if (cfg.sharedGroup) {
          nextModels[modelKey].sharedGroup = cfg.sharedGroup;
        } else {
          nextModels[modelKey].quota = cfg.quota;
          nextModels[modelKey].windowType = cfg.windowType;
        }
      });
      data.models = nextModels;
    });
    emitDataChanged();
  }
  function collectSharedGroupUsage(groupId, now = Date.now()) {
    const group = usageData.sharedQuotaGroups?.[groupId];
    if (!group) return null;
    const windowType = group.windowType || "daily";
    const windowDuration = TIME_WINDOWS[windowType];
    const activeRequests = [];
    Object.entries(usageData.models || {}).forEach(([key, model]) => {
      if (model.sharedGroup !== groupId) return;
      if (!Array.isArray(model.requests)) return;
      model.requests.map((req) => tsOf(req)).filter((ts) => typeof ts === "number" && !Number.isNaN(ts) && now - ts < windowDuration).forEach((ts) => activeRequests.push({ ts, modelKey: key }));
    });
    activeRequests.sort((a, b) => a.ts - b.ts);
    return {
      group,
      windowType,
      windowDuration,
      activeRequests,
      windowEnd: activeRequests.length > 0 ? getWindowEnd(activeRequests[0].ts, windowType) : null
    };
  }

	  // src/tracking/modelRouting.js
		  function resolveRedirectedModelId(originalModelId) {
	    if (originalModelId === "chatgpt_alpha_model_external_access_reserved_gate_13") {
	      return "alpha";
	    }
	    if (originalModelId === "auto") {
	      return "gpt-5-2-instant";
	    }
	    // Treat bare GPT-5.x slugs as instant for counting.
	    if (originalModelId === "gpt-5-2") {
	      return "gpt-5-2-instant";
	    }
	    try {
	      const plan = usageData && usageData.planType || "team";
	      if (originalModelId === "gpt-4-5" && plan !== "pro") return "gpt-5-2-instant";
	      if (originalModelId === "o3-pro" && plan !== "pro") return "gpt-5-2-instant";
	    } catch {
	    }
		    return originalModelId;
		  }
		  function normalizeUsageModelKey(modelId) {
		    const redirected = resolveRedirectedModelId(modelId);
		    return canonicalizeUsageModelKey(redirected);
		  }
			  function getUsageModelKeyFromCookieOrBody(bodyLike) {
			    // Prefer the actual outgoing request payload, because the cookie can lag behind
			    // right after switching models (first message would be mis-attributed otherwise).
			    const fromBody = typeof bodyLike === "string" ? extractModelIdFromJsonBodyText(bodyLike) : null;
			    const fromCookie = readLastModelIdFromCookie();
			    const modelId = fromBody || fromCookie;
			    if (!modelId) return null;
			    return normalizeUsageModelKey(modelId);
			  }
	  function readLastModelIdFromCookie() {
	    try {
	      const rawCookie = String(document.cookie || "");
	      const m = rawCookie.match(/(?:^|;\s*)oai-last-model-config=([^;]+)/);
	      const encoded = m && m[1] ? m[1] : null;
	      if (!encoded) return null;
	      const decoded = decodeURIComponent(encoded);
	      const obj = JSON.parse(decoded);
	      const model = obj && typeof obj === "object" ? obj.model : null;
	      return typeof model === "string" && model ? model : null;
	    } catch {
	      return null;
	    }
	  }
	  function extractModelIdFromJsonBodyText(bodyText) {
	    try {
	      const s = String(bodyText || "");
	      // Fast path: look for the first `"model":"..."` occurrence without JSON.parse.
	      const m = s.match(/"model"\s*:\s*"([^"]+)"/);
	      return m && m[1] ? m[1] : null;
	    } catch {
	      return null;
	    }
	  }

  // src/textScrambler.js
  function installTextScrambler() {
    (() => {
      var TextScrambler = (() => {
        var l = Object.defineProperty;
        var c = Object.getOwnPropertyDescriptor;
        var u = Object.getOwnPropertyNames;
        var m = Object.prototype.hasOwnProperty;
        var d = (n, t) => {
          for (var e in t) l(n, e, { get: t[e], enumerable: true });
        }, f = (n, t, e, s) => {
          if (t && typeof t == "object" || typeof t == "function")
            for (let i of u(t))
              !m.call(n, i) && i !== e && l(n, i, {
                get: () => t[i],
                enumerable: !(s = c(t, i)) || s.enumerable
              });
          return n;
        };
        var g = (n) => f(l({}, "__esModule", { value: true }), n);
        var T = {};
        d(T, { default: () => r });
        function _(n) {
          let t = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, {
            acceptNode: (s) => s.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
          }), e = [];
          for (; t.nextNode(); ) t.currentNode.nodeValue = t.currentNode.nodeValue.replace(/(\n|\r|\t)/gm, ""), e.push(t.currentNode);
          return e;
        }
        function p(n, t, e) {
          return t < 0 || t >= n.length ? n : n.substring(0, t) + e + n.substring(t + 1);
        }
        function M(n, t) {
          return n ? "x" : t[Math.floor(Math.random() * t.length)];
        }
        var r = class {
          constructor(t, e = {}) {
            this.el = t;
            let s = {
              duration: 1e3,
              delay: 0,
              reverse: false,
              absolute: false,
              pointerEvents: true,
              scrambleSymbols: "—~±§|[].+$^@*()•x%!?#",
              randomThreshold: null
            };
            this.config = Object.assign({}, s, e), this.config.randomThreshold === null && (this.config.randomThreshold = this.config.reverse ? 0.1 : 0.8), this.textNodes = _(this.el), this.nodeLengths = this.textNodes.map((i) => i.nodeValue.length), this.originalText = this.textNodes.map((i) => i.nodeValue).join(""), this.mask = this.originalText.split(" ").map((i) => " ".repeat(i.length)).join(" "), this.currentMask = this.mask, this.totalChars = this.originalText.length, this.scrambleRange = Math.floor(this.totalChars * (this.config.reverse ? 0.25 : 1.5)), this.direction = this.config.reverse ? -1 : 1, this.config.absolute && (this.el.style.position = "absolute", this.el.style.top = "0"), this.config.pointerEvents || (this.el.style.pointerEvents = "none"), this._animationFrame = null, this._startTime = null, this._running = false;
          }
          initialize() {
            return this.currentMask = this.mask, this;
          }
          _getEased(t) {
            let e = -(Math.cos(Math.PI * t) - 1) / 2;
            return e = Math.pow(e, 2), this.config.reverse ? 1 - e : e;
          }
          _updateScramble(t, e, s) {
            if (Math.random() < 0.5 && t > 0 && t < 1)
              for (let i = 0; i < 20; i++) {
                let o = i / 20, a;
                if (this.config.reverse) a = e - Math.floor((1 - Math.random()) * this.scrambleRange * o);
                else a = e + Math.floor((1 - Math.random()) * this.scrambleRange * o);
                if (!(a < 0 || a >= this.totalChars) && this.currentMask[a] !== " ") {
                  let h = Math.random() > this.config.randomThreshold ? this.originalText[a] : M(this.config.reverse, this.config.scrambleSymbols);
                  this.currentMask = p(this.currentMask, a, h);
                }
              }
          }
          _composeOutput(t, e, s) {
            let i = "";
            if (this.config.reverse) {
              let o = Math.max(e - s, 0);
              i = this.mask.slice(0, o) + this.currentMask.slice(o, e) + this.originalText.slice(e);
            } else i = this.originalText.slice(0, e) + this.currentMask.slice(e, e + s) + this.mask.slice(e + s);
            return i;
          }
          _updateTextNodes(t) {
            let e = 0;
            for (let s = 0; s < this.textNodes.length; s++) {
              let i = this.nodeLengths[s];
              this.textNodes[s].nodeValue = t.slice(e, e + i), e += i;
            }
          }
          _tick = (t) => {
            this._startTime || (this._startTime = t);
            let e = t - this._startTime, s = Math.min(e / this.config.duration, 1), i = this._getEased(s), o = Math.floor(this.totalChars * s), a = Math.floor(2 * (0.5 - Math.abs(s - 0.5)) * this.scrambleRange);
            this._updateScramble(s, o, a);
            let h = this._composeOutput(s, o, a);
            this._updateTextNodes(h), s < 1 ? this._animationFrame = requestAnimationFrame(this._tick) : this._running = false;
          };
          start() {
            this._running = true, this._startTime = null, this.config.delay ? setTimeout(() => {
              this._animationFrame = requestAnimationFrame(this._tick);
            }, this.config.delay) : this._animationFrame = requestAnimationFrame(this._tick);
          }
          stop() {
            this._animationFrame && (cancelAnimationFrame(this._animationFrame), this._animationFrame = null), this._running = false;
          }
        };
        return g(T);
      })();
      window.TextScrambler = TextScrambler.default || TextScrambler;
    })();
  }

  // src/features/reports.js
  function generateWeeklyReport() {
    const now = /* @__PURE__ */ new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgoStart = todayStart - 6 * TIME_WINDOWS.daily;
    const report = {
      totalRequests: 0,
      modelBreakdown: {},
      dailyData: [],
      // 最近7天的数据
      peakDay: "",
      averageDaily: 0,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    for (let i = 0; i < 7; i++) {
      const dayStart = todayStart - (6 - i) * TIME_WINDOWS.daily;
      const date = new Date(dayStart);
      report.dailyData.push({
        date: date.toLocaleDateString("zh-CN"),
        dayOfWeek: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()],
        models: {},
        total: 0,
        dayStart,
        dayEnd: dayStart + TIME_WINDOWS.daily - 1
      });
    }
    const currentPlanForWeekly = usageData && usageData.planType || "team";
    const sortedModelEntries = MODEL_DISPLAY_ORDER.filter((modelKey) => usageData.models[modelKey]).filter((modelKey) => !(modelKey === "o3-pro" && currentPlanForWeekly !== "pro")).map((modelKey) => [modelKey, usageData.models[modelKey]]);
    Object.entries(usageData.models).forEach(([modelKey, model]) => {
      if (!MODEL_DISPLAY_ORDER.includes(modelKey)) {
        if (modelKey === "o3-pro" && currentPlanForWeekly !== "pro") return;
        sortedModelEntries.push([modelKey, model]);
      }
    });
    sortedModelEntries.forEach(([modelKey, model]) => {
      const validRequests = model.requests.map((req) => tsOf(req)).filter((ts) => ts >= sevenDaysAgoStart && ts < todayStart + TIME_WINDOWS.daily);
      if (validRequests.length > 0) {
        if (!report.modelBreakdown[modelKey]) {
          report.modelBreakdown[modelKey] = 0;
        }
        validRequests.forEach((ts) => {
          const dayData = report.dailyData.find((day) => ts >= day.dayStart && ts <= day.dayEnd);
          if (dayData) {
            dayData.total++;
            dayData.models[modelKey] = (dayData.models[modelKey] || 0) + 1;
            report.modelBreakdown[modelKey]++;
            report.totalRequests++;
          }
        });
      }
    });
    const activeDays = report.dailyData.filter((d) => d.total > 0).length || 1;
    report.averageDaily = Math.round(report.totalRequests / activeDays);
    const maxDayUsage = Math.max(...report.dailyData.map((d) => d.total), 0);
    const peakDayData = report.dailyData.find((d) => d.total === maxDayUsage);
    if (peakDayData) {
      report.peakDay = `${peakDayData.date} ${peakDayData.dayOfWeek}`;
    }
    return report;
  }
  function generateMonthlyReport() {
    const now = /* @__PURE__ */ new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const thirtyDaysAgoStart = todayStart - 29 * TIME_WINDOWS.daily;
    const report = {
      totalRequests: 0,
      modelBreakdown: {},
      dailyData: [],
      // 最近30天的数据
      peakDay: "",
      averageDaily: 0,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    for (let i = 0; i < 30; i++) {
      const dayStart = todayStart - (29 - i) * TIME_WINDOWS.daily;
      const date = new Date(dayStart);
      report.dailyData.push({
        date: date.toLocaleDateString("zh-CN"),
        dayOfWeek: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()],
        models: {},
        total: 0,
        dayStart,
        dayEnd: dayStart + TIME_WINDOWS.daily - 1
      });
    }
    const currentPlanForMonthly = usageData && usageData.planType || "team";
    const sortedModelEntries = MODEL_DISPLAY_ORDER.filter((modelKey) => usageData.models[modelKey]).filter((modelKey) => !(modelKey === "o3-pro" && currentPlanForMonthly !== "pro")).map((modelKey) => [modelKey, usageData.models[modelKey]]);
    Object.entries(usageData.models).forEach(([modelKey, model]) => {
      if (!MODEL_DISPLAY_ORDER.includes(modelKey)) {
        if (modelKey === "o3-pro" && currentPlanForMonthly !== "pro") return;
        sortedModelEntries.push([modelKey, model]);
      }
    });
    sortedModelEntries.forEach(([modelKey, model]) => {
      const validRequests = model.requests.map((req) => tsOf(req)).filter((ts) => ts >= thirtyDaysAgoStart && ts < todayStart + TIME_WINDOWS.daily);
      if (validRequests.length > 0) {
        if (!report.modelBreakdown[modelKey]) {
          report.modelBreakdown[modelKey] = 0;
        }
        validRequests.forEach((ts) => {
          const dayData = report.dailyData.find((day) => ts >= day.dayStart && ts <= day.dayEnd);
          if (dayData) {
            dayData.total++;
            dayData.models[modelKey] = (dayData.models[modelKey] || 0) + 1;
            report.modelBreakdown[modelKey]++;
            report.totalRequests++;
          }
        });
      }
    });
    const activeDays = report.dailyData.filter((d) => d.total > 0).length || 1;
    report.averageDaily = Math.round(report.totalRequests / activeDays);
    const maxDayUsage = Math.max(...report.dailyData.map((d) => d.total), 0);
    const peakDayData = report.dailyData.find((d) => d.total === maxDayUsage);
    if (peakDayData) {
      report.peakDay = `${peakDayData.date} ${peakDayData.dayOfWeek}`;
    }
    return report;
  }
  function mergeUnknownModelsForHtml(report) {
    try {
      const KNOWN = /* @__PURE__ */ new Set([
        // 采用固定显示顺序中的模型
        ...MODEL_DISPLAY_ORDER,
        // 再补充兼容显示顺序外但“已知”的模型键
        "gpt-5",
        "gpt-5-thinking",
        "gpt-5-2-instant",
        "gpt-5-2-thinking",
        "gpt-5-2-pro",
        "gpt-5-1",
        "gpt-5-1-thinking",
        "gpt-5-1-instant",
        "alpha"
      ]);
      const targetKey = "gpt-5-2-instant";
      if (!report.modelBreakdown[targetKey]) report.modelBreakdown[targetKey] = 0;
      const unknownKeys = Object.keys(report.modelBreakdown).filter((k) => !KNOWN.has(k));
      if (unknownKeys.length === 0) return report;
      for (const key of unknownKeys) {
        report.modelBreakdown[targetKey] += report.modelBreakdown[key] || 0;
        delete report.modelBreakdown[key];
      }
      for (const day of report.dailyData) {
        let add = 0;
        for (const key of unknownKeys) {
          if (day.models[key]) {
            add += day.models[key];
            delete day.models[key];
          }
        }
        if (add > 0) {
          day.models[targetKey] = (day.models[targetKey] || 0) + add;
        }
      }
      return report;
    } catch (e) {
      console.warn("[monitor] Failed to merge unknown models for HTML:", e);
      return report;
    }
  }
  function exportWeeklyAnalysis() {
    const report = mergeUnknownModelsForHtml(generateWeeklyReport());
    const sortedModelKeys = MODEL_DISPLAY_ORDER.filter((modelKey) => report.modelBreakdown[modelKey]).concat(Object.keys(report.modelBreakdown).filter((key) => !MODEL_DISPLAY_ORDER.includes(key)));
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ChatGPT 一周用量分析报告 - ${(/* @__PURE__ */ new Date()).toLocaleDateString("zh-CN")}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: #1a1b1e;
        color: #e5e7eb;
        padding: 20px;
        margin: 0;
    }
    .container {
        max-width: 1200px;
        margin: 0 auto;
    }
    h1, h2 {
        color: #f59e0b;
    }
    .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 40px;
    }
    .card {
        background: #2a2b2e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #363636;
    }
    .card h3 {
        margin-top: 0;
        color: #9ca3af;
        font-size: 14px;
    }
    .card .value {
        font-size: 28px;
        font-weight: bold;
        color: #f59e0b;
    }
    .card .subtext {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 4px;
    }
    .chart-container {
        background: #2a2b2e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #363636;
        margin-bottom: 20px;
        position: relative;
    }
    .chart-container.daily {
        height: 400px;
    }
    .chart-container.pie {
        height: 350px;
    }
    .table-container {
        background: #2a2b2e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #363636;
        overflow-x: auto;
    }
    table {
        width: 100%;
        border-collapse: collapse;
    }
    th, td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #363636;
    }
    th {
        background: #1a1b1e;
        color: #f59e0b;
        font-weight: 600;
    }
    .highlight {
        color: #f59e0b;
        font-weight: bold;
    }
    .footer {
        text-align: center;
        margin-top: 40px;
        color: #9ca3af;
        font-size: 12px;
    }
    .info-text {
        color: #9ca3af;
        font-size: 14px;
        margin: 10px 0;
    }
</style>
</head>
<body>
<div class="container">
    <h1>ChatGPT 一周用量分析报告</h1>
    <p class="info-text">分析时间段: ${report.dailyData[0].date} 至 ${report.dailyData[6].date}</p>
    <p class="info-text">生成时间: ${(/* @__PURE__ */ new Date()).toLocaleString("zh-CN")}</p>

    <div class="summary-cards">
        <div class="card">
            <h3>总请求数</h3>
            <div class="value">${report.totalRequests}</div>
            <div class="subtext">最近7天</div>
        </div>
        <div class="card">
            <h3>日均使用</h3>
            <div class="value">${report.averageDaily}</div>
            <div class="subtext">活跃天数平均</div>
        </div>
        <div class="card">
            <h3>使用高峰日</h3>
            <div class="value" style="font-size: 20px;">${report.peakDay || "N/A"}</div>
        </div>
        <div class="card">
            <h3>活跃模型数</h3>
            <div class="value">${sortedModelKeys.length}</div>
            <div class="subtext">有使用记录</div>
        </div>
    </div>

    <h2>每日使用趋势</h2>
    <div class="chart-container daily">
        <canvas id="dailyChart"></canvas>
    </div>

    <h2>模型使用分布</h2>
    <div class="chart-container pie">
        <canvas id="modelChart"></canvas>
    </div>

    <h2>详细数据表</h2>
    <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th>日期</th>
                    <th>星期</th>
                    <th>总请求数</th>
                    ${sortedModelKeys.map((model) => `<th>${model}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
                ${report.dailyData.map((day, index) => `
                    <tr ${index === 6 ? 'style="background: rgba(245, 158, 11, 0.1);"' : ""}>
                        <td>${day.date} ${index === 6 ? '<span style="color: #f59e0b;">(今天)</span>' : ""}</td>
                        <td>${day.dayOfWeek}</td>
                        <td class="highlight">${day.total}</td>
                        ${sortedModelKeys.map(
      (model) => `<td>${day.models[model] || 0}</td>`
    ).join("")}
                    </tr>
                `).join("")}
            </tbody>
            <tfoot>
                <tr style="background: #1a1b1e; font-weight: bold;">
                    <td colspan="2">总计</td>
                    <td class="highlight">${report.totalRequests}</td>
                    ${sortedModelKeys.map(
      (model) => `<td>${report.modelBreakdown[model] || 0}</td>`
    ).join("")}
                </tr>
            </tfoot>
        </table>
    </div>

    <div class="footer">
        <p>此报告由 ChatGPT 用量统计脚本自动生成</p>
    </div>
</div>

<script>
    // 配置图表默认选项
    Chart.defaults.color = '#9ca3af';
    Chart.defaults.borderColor = '#363636';

    // 每日使用趋势图
    const dailyCtx = document.getElementById('dailyChart').getContext('2d');
    new Chart(dailyCtx, {
        type: 'line',
        data: {
            labels: ${JSON.stringify(report.dailyData.map(
      (d, i) => i === 6 ? d.date + " (今天)" : d.date
    ))},
            datasets: [{
                label: '每日请求数',
                data: ${JSON.stringify(report.dailyData.map((d) => d.total))},
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 5,
                pointHoverRadius: 8,
                pointBackgroundColor: '#f59e0b',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            const dayData = ${JSON.stringify(report.dailyData.map((d) => d.dayOfWeek))};
                            return dayData[index];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#363636'
                    },
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    grid: {
                        color: '#363636'
                    }
                }
            }
        }
    });

    // 模型使用分布饼图
    const modelCtx = document.getElementById('modelChart').getContext('2d');
    new Chart(modelCtx, {
        type: 'doughnut',
        data: {
            labels: ${JSON.stringify(sortedModelKeys)},
            datasets: [{
                data: ${JSON.stringify(sortedModelKeys.map((key) => report.modelBreakdown[key] || 0))},
                backgroundColor: [
                    '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
                    '#9333ea', '#ec4899', '#14b8a6', '#f97316',
                    '#06b6d4', '#84cc16', '#f43f5e', '#8b5cf6'
                ],
                borderWidth: 2,
                borderColor: '#1a1b1e'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(2);
                            return label + ': ' + value + ' (' + percentage + '%)';
                        }
                    }
                }
            }
        }
    });
<\/script>
</body>
</html>
    `;
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chatgpt-weekly-analysis-${formatTimestampForFilename()}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("一周用量分析报告已导出", "success");
    }, 100);
  }
  function exportMonthlyAnalysis() {
    const report = mergeUnknownModelsForHtml(generateMonthlyReport());
    const sortedModelKeys = MODEL_DISPLAY_ORDER.filter((modelKey) => report.modelBreakdown[modelKey]).concat(Object.keys(report.modelBreakdown).filter((key) => !MODEL_DISPLAY_ORDER.includes(key)));
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ChatGPT 一个月用量分析报告 - ${(/* @__PURE__ */ new Date()).toLocaleDateString("zh-CN")}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: #1a1b1e;
        color: #e5e7eb;
        padding: 20px;
        margin: 0;
    }
    .container {
        max-width: 1200px;
        margin: 0 auto;
    }
    h1, h2 {
        color: #f59e0b;
    }
    .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 40px;
    }
    .card {
        background: #2a2b2e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #363636;
    }
    .card h3 {
        margin-top: 0;
        color: #9ca3af;
        font-size: 14px;
    }
    .card .value {
        font-size: 28px;
        font-weight: bold;
        color: #f59e0b;
    }
    .card .subtext {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 4px;
    }
    .chart-container {
        background: #2a2b2e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #363636;
        margin-bottom: 20px;
        position: relative;
    }
    .chart-container.daily {
        height: 500px;
    }
    .chart-container.pie {
        height: 350px;
    }
    .table-container {
        background: #2a2b2e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #363636;
        overflow-x: auto;
        max-height: 600px;
        overflow-y: auto;
    }
    table {
        width: 100%;
        border-collapse: collapse;
    }
    th, td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid #363636;
        font-size: 12px;
    }
    th {
        background: #1a1b1e;
        color: #f59e0b;
        font-weight: 600;
        position: sticky;
        top: 0;
        z-index: 1;
    }
    .highlight {
        color: #f59e0b;
        font-weight: bold;
    }
    .footer {
        text-align: center;
        margin-top: 40px;
        color: #9ca3af;
        font-size: 12px;
    }
    .info-text {
        color: #9ca3af;
        font-size: 14px;
        margin: 10px 0;
    }
    .week-separator {
        border-top: 2px solid #f59e0b;
        background: rgba(245, 158, 11, 0.1);
    }
</style>
</head>
<body>
<div class="container">
    <h1>ChatGPT 一个月用量分析报告</h1>
    <p class="info-text">分析时间段: ${report.dailyData[0].date} 至 ${report.dailyData[29].date}</p>
    <p class="info-text">生成时间: ${(/* @__PURE__ */ new Date()).toLocaleString("zh-CN")}</p>

    <div class="summary-cards">
        <div class="card">
            <h3>总请求数</h3>
            <div class="value">${report.totalRequests}</div>
            <div class="subtext">最近30天</div>
        </div>
        <div class="card">
            <h3>日均使用</h3>
            <div class="value">${report.averageDaily}</div>
            <div class="subtext">活跃天数平均</div>
        </div>
        <div class="card">
            <h3>使用高峰日</h3>
            <div class="value" style="font-size: 20px;">${report.peakDay || "N/A"}</div>
        </div>
        <div class="card">
            <h3>活跃模型数</h3>
            <div class="value">${sortedModelKeys.length}</div>
            <div class="subtext">有使用记录</div>
        </div>
    </div>

    <h2>每日使用趋势</h2>
    <div class="chart-container daily">
        <canvas id="dailyChart"></canvas>
    </div>

    <h2>模型使用分布</h2>
    <div class="chart-container pie">
        <canvas id="modelChart"></canvas>
    </div>

    <h2>详细数据表</h2>
    <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th>日期</th>
                    <th>星期</th>
                    <th>总请求数</th>
                    ${sortedModelKeys.map((model) => `<th>${model}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
                ${report.dailyData.map((day, index) => {
      const isToday = index === 29;
      const isWeekStart = new Date(day.dayStart).getDay() === 1;
      return `
                    <tr ${isToday ? 'style="background: rgba(245, 158, 11, 0.1);"' : ""} ${isWeekStart && !isToday ? 'class="week-separator"' : ""}>
                        <td>${day.date} ${isToday ? '<span style="color: #f59e0b;">(今天)</span>' : ""}</td>
                        <td>${day.dayOfWeek}</td>
                        <td class="highlight">${day.total}</td>
                        ${sortedModelKeys.map(
        (model) => `<td>${day.models[model] || 0}</td>`
      ).join("")}
                    </tr>
                `;
    }).join("")}
            </tbody>
            <tfoot>
                <tr style="background: #1a1b1e; font-weight: bold;">
                    <td colspan="2">总计</td>
                    <td class="highlight">${report.totalRequests}</td>
                    ${sortedModelKeys.map(
      (model) => `<td>${report.modelBreakdown[model] || 0}</td>`
    ).join("")}
                </tr>
            </tfoot>
        </table>
    </div>

    <div class="footer">
        <p>此报告由 ChatGPT 用量统计脚本自动生成</p>
    </div>
</div>

<script>
    // 配置图表默认选项
    Chart.defaults.color = '#9ca3af';
    Chart.defaults.borderColor = '#363636';

    // 每日使用趋势图
    const dailyCtx = document.getElementById('dailyChart').getContext('2d');
    new Chart(dailyCtx, {
        type: 'line',
        data: {
            labels: ${JSON.stringify(report.dailyData.map(
      (d, i) => i === 29 ? d.date + " (今天)" : d.date
    ))},
            datasets: [{
                label: '每日请求数',
                data: ${JSON.stringify(report.dailyData.map((d) => d.total))},
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: '#f59e0b',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            const dayData = ${JSON.stringify(report.dailyData.map((d) => d.dayOfWeek))};
                            return dayData[index];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#363636'
                    },
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    grid: {
                        color: '#363636'
                    },
                    ticks: {
                        maxTicksLimit: 15,
                        callback: function(value, index) {
                            // 只显示部分日期标签，避免过于拥挤
                            const date = new Date(${JSON.stringify(report.dailyData.map((d) => d.dayStart))}[index]);
                            if (index === 0 || index === 14 || index === 29 || date.getDate() === 1 || date.getDay() === 1) {
                                return this.getLabelForValue(value);
                            }
                            return '';
                        }
                    }
                }
            }
        }
    });

    // 模型使用分布饼图
    const modelCtx = document.getElementById('modelChart').getContext('2d');
    new Chart(modelCtx, {
        type: 'doughnut',
        data: {
            labels: ${JSON.stringify(sortedModelKeys)},
            datasets: [{
                data: ${JSON.stringify(sortedModelKeys.map((key) => report.modelBreakdown[key] || 0))},
                backgroundColor: [
                    '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
                    '#9333ea', '#ec4899', '#14b8a6', '#f97316',
                    '#06b6d4', '#84cc16', '#f43f5e', '#8b5cf6'
                ],
                borderWidth: 2,
                borderColor: '#1a1b1e'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(2);
                            return label + ': ' + value + ' (' + percentage + '%)';
                        }
                    }
                }
            }
        }
    });
<\/script>
</body>
</html>
    `;
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chatgpt-monthly-analysis-${formatTimestampForFilename()}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("一个月用量分析报告已导出", "success");
    }, 100);
  }

  // src/ui/monitor.js
  function animateText(el, config) {
    try {
      const Scrambler = typeof window !== "undefined" && (window.TextScrambler || window["TextScrambler"]) || null;
      if (!Scrambler) return;
      const animator = new Scrambler(el, { ...config });
      if (typeof animator.initialize === "function") animator.initialize();
      if (typeof animator.start === "function") animator.start();
    } catch (e) {
      console.debug("[monitor] Text animation skipped:", e?.message || e);
    }
  }
  function updateUI() {
    const usageContent = document.getElementById("usageContent");
    const settingsContent = document.getElementById("settingsContent");
    if (usageContent) {
      updateUsageContent(usageContent);
      animateText(usageContent, {
        duration: 500,
        delay: 0,
        reverse: false,
        absolute: false,
        pointerEvents: true
      });
    }
    if (settingsContent) {
      updateSettingsContent(settingsContent);
      animateText(settingsContent, {
        duration: 500,
        delay: 0,
        reverse: false,
        absolute: false,
        pointerEvents: true
      });
    }
  }
  function createSettingsModelRow(model, modelKey) {
    const row = document.createElement("div");
    row.className = "model-row";
    const keyLabel = document.createElement("div");
    keyLabel.textContent = displayModelName(modelKey);
    row.appendChild(keyLabel);
    const quotaInput = document.createElement("input");
    quotaInput.type = "number";
    if (model.sharedGroup && usageData.sharedQuotaGroups?.[model.sharedGroup]) {
      quotaInput.value = usageData.sharedQuotaGroups[model.sharedGroup].quota ?? "";
      quotaInput.disabled = true;
      quotaInput.title = `由共享组（${usageData.sharedQuotaGroups[model.sharedGroup].displayName || model.sharedGroup}）控制`;
    } else {
      quotaInput.value = typeof model.quota === "number" ? model.quota : "";
    }
    quotaInput.placeholder = "配额";
    quotaInput.dataset.modelKey = modelKey;
    quotaInput.dataset.field = "quota";
    row.appendChild(quotaInput);
    const windowSelect = document.createElement("select");
    windowSelect.dataset.modelKey = modelKey;
    windowSelect.dataset.field = "windowType";
    windowSelect.innerHTML = `
    <option value="hour3">3小时窗口</option>
    <option value="hour5">5小时窗口</option>
    <option value="daily">24小时窗口</option>
    <option value="weekly">7天窗口</option>
    <option value="monthly">30天窗口</option>
  `;
    if (model.sharedGroup && usageData.sharedQuotaGroups?.[model.sharedGroup]) {
      windowSelect.value = usageData.sharedQuotaGroups[model.sharedGroup].windowType || "daily";
      windowSelect.disabled = true;
      windowSelect.title = `由共享组（${usageData.sharedQuotaGroups[model.sharedGroup].displayName || model.sharedGroup}）控制`;
    } else {
      windowSelect.value = model.windowType || "daily";
    }
    const controlsContainer = document.createElement("div");
    controlsContainer.style.display = "flex";
    controlsContainer.style.alignItems = "center";
    controlsContainer.style.gap = "4px";
    controlsContainer.appendChild(windowSelect);
    const delBtn = document.createElement("button");
    delBtn.className = "btn delete-btn";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", () => handleDeleteModel(modelKey));
    controlsContainer.appendChild(delBtn);
    row.appendChild(controlsContainer);
    return row;
  }
  function createUsageModelRow(model, modelKey) {
    const now = Date.now();
    let count = 0;
    let quota = 0;
    let windowType = "daily";
    let lastRequestTime = "never";
    let windowEndInfo = "";
    if (model.sharedGroup) {
      const sharedUsage = collectSharedGroupUsage(model.sharedGroup, now);
      if (sharedUsage) {
        quota = sharedUsage.group.quota;
        windowType = sharedUsage.windowType;
        count = sharedUsage.activeRequests.length;
        const modelRequests = sharedUsage.activeRequests.filter((req) => req.modelKey === modelKey);
        if (modelRequests.length > 0) {
          lastRequestTime = formatTimeAgo(Math.max(...modelRequests.map((req) => req.ts)));
        }
        if (count > 0 && usageData.showWindowResetTime) {
          const oldestActiveTimestamp = Math.min(...sharedUsage.activeRequests.map((req) => req.ts));
          const windowEnd = getWindowEnd(oldestActiveTimestamp, windowType);
          if (windowEnd > now) {
            windowEndInfo = `Window resets in: ${formatTimeLeft(windowEnd)}`;
          }
        }
      }
    } else {
      quota = model.quota;
      windowType = model.windowType;
      const windowDuration = TIME_WINDOWS[windowType] || TIME_WINDOWS.daily;
      const activeRequests = (model.requests || []).map((req) => tsOf(req)).filter((ts) => now - ts < windowDuration);
      count = activeRequests.length;
      if (count > 0) {
        lastRequestTime = formatTimeAgo(Math.max(...activeRequests));
      }
      if (count > 0 && usageData.showWindowResetTime) {
        const oldestActiveTimestamp = Math.min(...activeRequests);
        const windowEnd = getWindowEnd(oldestActiveTimestamp, windowType);
        if (windowEnd > now) {
          windowEndInfo = `Window resets in: ${formatTimeLeft(windowEnd)}`;
        }
      }
    }
    const row = document.createElement("div");
    row.className = "model-row";
    const modelNameContainer = document.createElement("div");
    modelNameContainer.style.display = "flex";
    modelNameContainer.style.alignItems = "center";
    const modelName = document.createElement("span");
    modelName.textContent = displayModelName(modelKey);
    let sharedColor = null;
    if (model.sharedGroup) {
      sharedColor = SHARED_GROUP_COLORS[model.sharedGroup] || COLORS.warning;
      modelName.style.color = sharedColor;
      modelName.title = `共享组：${usageData.sharedQuotaGroups?.[model.sharedGroup]?.displayName || model.sharedGroup}`;
    }
    modelNameContainer.appendChild(modelName);
    const windowBadge = document.createElement("span");
    windowBadge.className = `window-badge ${windowType}`;
    windowBadge.textContent = windowType === "hour3" ? "3h" : windowType === "hour5" ? "5h" : windowType === "daily" ? "24h" : windowType === "weekly" ? "7d" : "30d";
    modelNameContainer.appendChild(windowBadge);
    row.appendChild(modelNameContainer);
    const lastUpdateValue = document.createElement("div");
    lastUpdateValue.className = "request-time";
    lastUpdateValue.textContent = lastRequestTime;
    row.appendChild(lastUpdateValue);
    const usageValue = document.createElement("div");
    if (sharedColor) usageValue.style.color = sharedColor;
    const currentPlan = usageData.planType || "team";
    const quotaDisplay = quota === 0 ? currentPlan === "pro" ? "∞" : "不可用" : String(quota ?? "不可用");
    usageValue.textContent = `${count} / ${quotaDisplay}`;
    if (windowEndInfo && usageData.showWindowResetTime) {
      const windowInfoEl = document.createElement("div");
      windowInfoEl.className = "window-info";
      windowInfoEl.textContent = windowEndInfo;
      usageValue.appendChild(windowInfoEl);
    }
    row.appendChild(usageValue);
    const progressCell = document.createElement("div");
    if (quota === 0) {
      if (currentPlan === "pro") {
        progressCell.textContent = "无限制";
        progressCell.style.color = COLORS.success;
        progressCell.style.fontStyle = "italic";
      } else {
        progressCell.textContent = "不可用";
        progressCell.style.color = COLORS.disabled;
        progressCell.style.fontStyle = "italic";
      }
    } else {
      const usagePercent = count / quota;
      if (usageData.progressType === "dots") {
        const dotContainer = document.createElement("div");
        dotContainer.className = "dot-progress";
        const totalDots = 8;
        for (let i = 0; i < totalDots; i++) {
          const dot = document.createElement("div");
          dot.className = "dot";
          const dotThreshold = (i + 1) / totalDots;
          if (usagePercent >= 1) {
            dot.classList.add("dot-exceeded");
          } else if (usagePercent >= dotThreshold) {
            dot.classList.add("dot-full");
          } else if (usagePercent >= dotThreshold - 0.1) {
            dot.classList.add("dot-partial");
          } else {
            dot.classList.add("dot-empty");
          }
          dotContainer.appendChild(dot);
        }
        progressCell.appendChild(dotContainer);
      } else {
        const progressContainer = document.createElement("div");
        progressContainer.className = "progress-container";
        const progressBar = document.createElement("div");
        progressBar.className = "progress-bar";
        if (usagePercent > 1) progressBar.classList.add("exceeded");
        else if (usagePercent < 0.3) progressBar.classList.add("low-usage");
        progressBar.style.width = `${Math.min(usagePercent * 100, 100)}%`;
        progressContainer.appendChild(progressBar);
        progressCell.appendChild(progressContainer);
      }
    }
    row.appendChild(progressCell);
    return row;
  }
  function updateUsageContent(container) {
    container.innerHTML = "";
    const infoSection = document.createElement("div");
    infoSection.className = "reset-info";
    infoSection.innerHTML = `<b>滑动窗口跟踪:</b>`;
    const windowTypes = document.createElement("div");
    windowTypes.style.display = "flex";
    windowTypes.style.justifyContent = "space-between";
    windowTypes.style.marginTop = "4px";
    windowTypes.innerHTML = `
    <span><span class="window-badge hour3">3h</span> 3小时窗口</span>
    <span><span class="window-badge hour5">5h</span> 5小时窗口</span>
    <span><span class="window-badge daily">24h</span> 24小时窗口</span>
    <span><span class="window-badge weekly">7d</span> 7天窗口</span>
    <span><span class="window-badge monthly">30d</span> 30天窗口</span>
  `;
    infoSection.appendChild(windowTypes);
    container.appendChild(infoSection);
    const tableHeader = document.createElement("div");
    tableHeader.className = "table-header";
    tableHeader.innerHTML = `
    <div>模型名称</div>
    <div>最后使用</div>
    <div>使用量</div>
    <div>进度</div>
  `;
    container.appendChild(tableHeader);
    const now = Date.now();
    const planType = usageData.planType || "team";
    const canonicalModelEntries = [];
    const seenCanonicalKeys = /* @__PURE__ */ new Set();
    Object.entries(usageData.models || {}).forEach(([rawKey, model]) => {
      const key = canonicalizeUsageModelKey(rawKey);
      if (!key || seenCanonicalKeys.has(key)) return;
      seenCanonicalKeys.add(key);
      canonicalModelEntries.push([key, usageData.models?.[key] || model]);
    });
    const modelCounts = canonicalModelEntries.map(([key, model]) => {
      let activeCount = 0;
      let hasBeenUsed = false;
      let isAvailable = false;
      if (model.sharedGroup) {
        const sharedUsage = collectSharedGroupUsage(model.sharedGroup, now);
        if (sharedUsage) {
          activeCount = sharedUsage.activeRequests.length;
          hasBeenUsed = activeCount > 0;
          isAvailable = sharedUsage.group.quota > 0 || sharedUsage.group.quota === 0 && planType === "pro";
        }
      } else {
        const windowDuration = TIME_WINDOWS[model.windowType] || TIME_WINDOWS.daily;
        activeCount = (model.requests || []).map(tsOf).filter((ts) => now - ts < windowDuration).length;
        hasBeenUsed = (model.requests || []).length > 0;
        isAvailable = model.quota > 0 || model.quota === 0 && planType === "pro";
      }
      return { key, model, hasBeenUsed, isAvailable };
    });
    const sortedModels = MODEL_DISPLAY_ORDER.filter((modelKey) => {
      const modelData = modelCounts.find(({ key }) => key === modelKey);
      if (!modelData) return false;
      if (modelKey === "o3-pro" && planType !== "pro") return false;
      return modelData.hasBeenUsed || modelData.isAvailable;
    }).map((modelKey) => modelCounts.find(({ key }) => key === modelKey)).filter(Boolean);
    const extraModels = modelCounts.filter(({ key }) => !MODEL_DISPLAY_ORDER.includes(key)).filter(({ key }) => !(key === "o3-pro" && planType !== "pro")).filter(({ hasBeenUsed, isAvailable }) => hasBeenUsed || isAvailable).sort((a, b) => a.key.localeCompare(b.key));
    [...sortedModels, ...extraModels].forEach(({ key, model }) => {
      container.appendChild(createUsageModelRow(model, key));
    });
    if (sortedModels.length === 0 && extraModels.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.style.textAlign = "center";
      emptyState.style.color = COLORS.secondaryText;
      emptyState.style.padding = STYLE.spacing.lg;
      emptyState.textContent = Object.keys(usageData.models || {}).length > 0 ? "使用模型后才会显示用量统计。" : "未配置任何模型，请在设置中添加。";
      container.appendChild(emptyState);
    }
  }
  function updateSettingsContent(container) {
    container.innerHTML = "";
    const info = document.createElement("p");
    info.innerHTML = `配置模型映射与配额:<br>
    <span style="color:${COLORS.secondaryText}; font-size:${STYLE.textSize.xs};">
    使用像OpenAI一样的滑动时间窗口（统计最近N小时的使用量）
    </span>`;
    info.style.fontSize = STYLE.textSize.md;
    info.style.lineHeight = STYLE.lineHeight.md;
    info.style.color = COLORS.text;
    container.appendChild(info);
    const tableHeader = document.createElement("div");
    tableHeader.className = "table-header";
    tableHeader.style.gridTemplateColumns = "2fr 1fr 2fr";
    tableHeader.innerHTML = `<div>模型ID</div><div>配额</div><div>窗口/操作</div>`;
    container.appendChild(tableHeader);
    if (!document.querySelector('style[data-monitor-settings-style="true"]')) {
      const css = `
      #settingsContent .table-header,
      #settingsContent .model-row { grid-template-columns: 2fr 1fr 2fr; }
    `;
      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-monitor-settings-style", "true");
      styleEl.textContent = css;
      document.head.appendChild(styleEl);
    }
    const canonicalModels = /* @__PURE__ */ new Map();
    Object.entries(usageData.models || {}).forEach(([rawKey, model]) => {
      const canonicalKey = canonicalizeUsageModelKey(rawKey);
      if (!canonicalKey || canonicalModels.has(canonicalKey)) return;
      canonicalModels.set(canonicalKey, usageData.models?.[canonicalKey] || model);
    });
    const sortedModelKeys = MODEL_DISPLAY_ORDER.filter((modelKey) => canonicalModels.has(modelKey));
    const extraModelKeys = Array.from(canonicalModels.keys()).filter((k) => !MODEL_DISPLAY_ORDER.includes(k));
    [...sortedModelKeys, ...extraModelKeys].forEach((modelKey) => {
      const model = canonicalModels.get(modelKey);
      if (!model) return;
      container.appendChild(createSettingsModelRow(model, modelKey));
    });
    const addBtn = document.createElement("button");
    addBtn.className = "btn";
    addBtn.textContent = "添加模型映射";
    addBtn.style.marginTop = "20px";
    addBtn.addEventListener("click", () => {
      const rawId = prompt('输入新模型的内部ID（例如："o3-mini"）');
      const newModelID = rawId ? rawId.trim() : "";
      if (!newModelID) return;
      let added = false;
      updateUsageData((data) => {
        if (data.models[newModelID]) return;
        data.models[newModelID] = { requests: [], quota: 50, windowType: "daily" };
        added = true;
      });
      if (!added) {
        alert("模型映射已存在。");
        return;
      }
      updateUI();
      showToast(`模型 ${newModelID} 已添加。`, "success");
    });
    container.appendChild(addBtn);
    const saveBtn = document.createElement("button");
    saveBtn.className = "btn";
    saveBtn.textContent = "保存设置";
    saveBtn.style.marginLeft = STYLE.spacing.sm;
    saveBtn.addEventListener("click", () => {
      const inputs = container.querySelectorAll("input, select");
      let hasChanges = false;
      updateUsageData((data) => {
        inputs.forEach((input) => {
          if (input.disabled) return;
          const modelKey = input.dataset.modelKey;
          const field = input.dataset.field;
          if (!modelKey || !data.models[modelKey]) return;
          if (field === "quota") {
            const newQuota = parseInt(input.value, 10);
            if (!isNaN(newQuota) && newQuota !== data.models[modelKey].quota) {
              data.models[modelKey].quota = newQuota;
              hasChanges = true;
            }
          } else if (field === "windowType") {
            const newWindowType = input.value;
            if (newWindowType && newWindowType !== data.models[modelKey].windowType) {
              data.models[modelKey].windowType = newWindowType;
              hasChanges = true;
            }
          }
        });
      });
      if (hasChanges) {
        updateUI();
        showToast("设置保存成功。");
      } else {
        showToast("未检测到更改。", "warning");
      }
    });
    container.appendChild(saveBtn);
    const clearBtn = document.createElement("button");
    clearBtn.className = "btn";
    clearBtn.textContent = "清除历史";
    clearBtn.style.marginLeft = STYLE.spacing.sm;
    clearBtn.addEventListener("click", () => {
      if (!confirm("确定要清除所有模型的使用历史吗？")) return;
      updateUsageData((data) => {
        Object.values(data.models).forEach((model) => {
          if (Array.isArray(model.requests)) model.requests = [];
        });
        if (data.sharedQuotaGroups && typeof data.sharedQuotaGroups === "object") {
          Object.values(data.sharedQuotaGroups).forEach((group) => {
            if (Array.isArray(group.requests)) group.requests = [];
          });
        }
      });
      updateUI();
      showToast("所有模型的使用历史已清除。");
    });
    container.appendChild(clearBtn);
    const resetQuotaBtn = document.createElement("button");
    resetQuotaBtn.className = "btn";
    resetQuotaBtn.textContent = "恢复默认配额";
    resetQuotaBtn.style.marginLeft = STYLE.spacing.sm;
    resetQuotaBtn.style.color = COLORS.warning;
    resetQuotaBtn.addEventListener("click", () => {
      if (!confirm("确定要恢复当前套餐的默认配额设置吗？\n\n这将重置所有模型的配额和时间窗口，但保留使用历史。")) return;
      const currentPlan = refreshUsageData().planType || "team";
      applyPlanConfig(currentPlan);
      updateUI();
      showToast(`已恢复 ${PLAN_CONFIGS[currentPlan].name} 套餐的默认配额设置`, "success");
    });
    container.appendChild(resetQuotaBtn);
    const resetAllBtn = document.createElement("button");
    resetAllBtn.className = "btn";
    resetAllBtn.textContent = "重置所有";
    resetAllBtn.style.marginLeft = STYLE.spacing.sm;
    resetAllBtn.style.color = COLORS.danger;
    resetAllBtn.addEventListener("click", () => {
      if (!confirm("警告：这将重置所有内容为默认值，包括所有模型配置。确定继续吗？")) return;
      const freshDefaults = JSON.parse(JSON.stringify(defaultUsageData));
      Storage.set(freshDefaults);
      refreshUsageData();
      const planToApply = usageData.planType || "team";
      applyPlanConfig(planToApply);
      updateUI();
      showToast("所有内容已重置为默认值。", "warning");
    });
    container.appendChild(resetAllBtn);
    const weeklyAnalysisBtn = document.createElement("button");
    weeklyAnalysisBtn.className = "btn";
    weeklyAnalysisBtn.textContent = "导出一周分析";
    weeklyAnalysisBtn.style.marginTop = "20px";
    weeklyAnalysisBtn.style.display = "block";
    weeklyAnalysisBtn.style.width = "100%";
    weeklyAnalysisBtn.style.backgroundColor = COLORS.surface;
    weeklyAnalysisBtn.style.border = `1px solid ${COLORS.yellow}`;
    weeklyAnalysisBtn.addEventListener("click", () => exportWeeklyAnalysis());
    container.appendChild(weeklyAnalysisBtn);
    const monthlyAnalysisBtn = document.createElement("button");
    monthlyAnalysisBtn.className = "btn";
    monthlyAnalysisBtn.textContent = "导出一个月分析";
    monthlyAnalysisBtn.style.marginTop = "10px";
    monthlyAnalysisBtn.style.display = "block";
    monthlyAnalysisBtn.style.width = "100%";
    monthlyAnalysisBtn.style.backgroundColor = COLORS.surface;
    monthlyAnalysisBtn.style.border = `1px solid ${COLORS.green}`;
    monthlyAnalysisBtn.addEventListener("click", () => exportMonthlyAnalysis());
    container.appendChild(monthlyAnalysisBtn);
    const dataOperationsContainer = document.createElement("div");
    dataOperationsContainer.style.marginTop = "20px";
    dataOperationsContainer.style.display = "flex";
    dataOperationsContainer.style.gap = "8px";
    dataOperationsContainer.style.justifyContent = "center";
    const exportBtn = document.createElement("button");
    exportBtn.className = "btn";
    exportBtn.textContent = "导出数据";
    exportBtn.style.backgroundColor = COLORS.background;
    exportBtn.style.border = `1px solid ${COLORS.border}`;
    exportBtn.style.borderRadius = "4px";
    exportBtn.style.padding = "8px 12px";
    exportBtn.addEventListener("click", exportUsageData);
    const importBtn = document.createElement("button");
    importBtn.className = "btn";
    importBtn.textContent = "导入数据";
    importBtn.style.backgroundColor = COLORS.background;
    importBtn.style.border = `1px solid ${COLORS.border}`;
    importBtn.style.borderRadius = "4px";
    importBtn.style.padding = "8px 12px";
    importBtn.addEventListener("click", importUsageData);
    dataOperationsContainer.appendChild(exportBtn);
    dataOperationsContainer.appendChild(importBtn);
    container.appendChild(dataOperationsContainer);
    const dataOperationsInfo = document.createElement("div");
    dataOperationsInfo.style.textAlign = "center";
    dataOperationsInfo.style.marginTop = "8px";
    dataOperationsInfo.style.color = COLORS.secondaryText;
    dataOperationsInfo.style.fontSize = STYLE.textSize.xs;
    dataOperationsInfo.textContent = "导入/导出功能可在不同浏览器间同步用量统计数据";
    container.appendChild(dataOperationsInfo);
    const planSelectorContainer = document.createElement("div");
    planSelectorContainer.style.marginTop = STYLE.spacing.md;
    planSelectorContainer.style.display = "flex";
    planSelectorContainer.style.flexDirection = "column";
    planSelectorContainer.style.gap = "12px";
    planSelectorContainer.style.padding = "10px";
    planSelectorContainer.style.border = `1px solid ${COLORS.border}`;
    planSelectorContainer.style.borderRadius = "8px";
    planSelectorContainer.style.backgroundColor = COLORS.surface;
    const planTitle = document.createElement("div");
    planTitle.textContent = "套餐设置";
    planTitle.style.fontWeight = "bold";
    planTitle.style.marginBottom = "8px";
    planTitle.style.color = COLORS.white;
    planSelectorContainer.appendChild(planTitle);
    const planSelectContainer = document.createElement("div");
    planSelectContainer.style.display = "flex";
    planSelectContainer.style.alignItems = "center";
    planSelectContainer.style.justifyContent = "space-between";
    planSelectContainer.style.width = "100%";
    const planTypeLabel = document.createElement("span");
    planTypeLabel.textContent = "当前套餐:";
    planTypeLabel.style.color = COLORS.secondaryText;
    planSelectContainer.appendChild(planTypeLabel);
    const planTypeSelect = document.createElement("select");
    planTypeSelect.style.width = "140px";
    planTypeSelect.style.backgroundColor = COLORS.background;
    planTypeSelect.style.color = COLORS.white;
    planTypeSelect.style.border = `1px solid ${COLORS.border}`;
    planTypeSelect.style.borderRadius = "4px";
    planTypeSelect.style.padding = "4px 8px";
    PLAN_DISPLAY_ORDER.filter((k) => PLAN_CONFIGS[k]).concat(Object.keys(PLAN_CONFIGS).filter((k) => !PLAN_DISPLAY_ORDER.includes(k))).forEach((key) => {
      const config = PLAN_CONFIGS[key];
      const option = document.createElement("option");
      option.value = key;
      option.textContent = config.name;
      planTypeSelect.appendChild(option);
    });
    planTypeSelect.value = usageData.planType || "team";
    planTypeSelect.addEventListener("change", () => {
      const newPlan = planTypeSelect.value;
      const currentPlan = refreshUsageData().planType || "team";
      if (!confirm(`确定要切换到 ${PLAN_CONFIGS[newPlan].name} 套餐吗？

这将更新所有模型的配额和时间窗口设置。`)) {
        planTypeSelect.value = currentPlan;
        return;
      }
      updateUsageData((data) => {
        data.planType = newPlan;
      });
      applyPlanConfig(newPlan);
      updateUI();
      showToast(`已切换到 ${PLAN_CONFIGS[newPlan].name} 套餐`, "success");
      try {
        window.dispatchEvent(new CustomEvent(__aichatUsageMonitorPlanChangedEvent, { detail: { planType: newPlan } }));
      } catch {}
    });
    planSelectContainer.appendChild(planTypeSelect);
    planSelectorContainer.appendChild(planSelectContainer);
    const planInfo = document.createElement("div");
    planInfo.style.fontSize = STYLE.textSize.xs;
    planInfo.style.color = COLORS.secondaryText;
    planInfo.style.marginTop = "4px";
    planInfo.textContent = "切换套餐将根据官方限制自动调整所有模型的配额和时间窗口";
    planSelectorContainer.appendChild(planInfo);
    const currentPlanConfig = PLAN_CONFIGS[usageData.planType || "team"];
    const planDetailsContainer = document.createElement("div");
    planDetailsContainer.style.marginTop = "8px";
    planDetailsContainer.style.padding = "8px";
    planDetailsContainer.style.backgroundColor = COLORS.background;
    planDetailsContainer.style.borderRadius = "4px";
    planDetailsContainer.style.border = `1px solid ${COLORS.border}`;
    const planDetailsTitle = document.createElement("div");
    planDetailsTitle.textContent = `${currentPlanConfig.name} 套餐配置:`;
    planDetailsTitle.style.fontWeight = "bold";
    planDetailsTitle.style.marginBottom = "6px";
    planDetailsTitle.style.fontSize = STYLE.textSize.xs;
    planDetailsTitle.style.color = COLORS.yellow;
    planDetailsContainer.appendChild(planDetailsTitle);
    const planDetailsList = document.createElement("div");
    planDetailsList.style.fontSize = STYLE.textSize.xs;
    planDetailsList.style.color = COLORS.secondaryText;
    planDetailsList.style.lineHeight = "1.4";
    const windowTextOf = (windowType) => windowType === "hour3" ? "3小时" : windowType === "hour5" ? "5小时" : windowType === "daily" ? "24小时" : windowType === "weekly" ? "7天" : windowType === "monthly" ? "30天" : "";
    const visibleModels = Object.entries(currentPlanConfig.models).filter(([_, cfg]) => {
      if (cfg.sharedGroup) {
        const group = currentPlanConfig.sharedQuotaGroups?.[cfg.sharedGroup];
        if (!group) return false;
        if (group.quota === 0 && (usageData.planType || "team") !== "pro") return false;
        return true;
      }
      return !(cfg.quota === 0 && (usageData.planType || "team") !== "pro");
    });
    const detailsText = visibleModels.map(([model, cfg]) => {
      if (cfg.sharedGroup) {
        const group = currentPlanConfig.sharedQuotaGroups?.[cfg.sharedGroup];
        if (!group) return `• ${displayModelName(model)}: 未知配置`;
        const quotaText2 = group.quota === 0 ? "无限制" : `${group.quota}次`;
        return `• ${displayModelName(model)}: ${quotaText2}/${windowTextOf(group.windowType)} (共享)`;
      }
      const quotaText = cfg.quota === 0 ? "无限制" : `${cfg.quota}次`;
      return `• ${displayModelName(model)}: ${quotaText}/${windowTextOf(cfg.windowType)}`;
    }).join("\n") || "当前套餐未包含可用模型";
    planDetailsList.textContent = detailsText;
    planDetailsList.style.whiteSpace = "pre-line";
    planDetailsContainer.appendChild(planDetailsList);
    planSelectorContainer.appendChild(planDetailsContainer);
    container.appendChild(planSelectorContainer);
    const optionsContainer = document.createElement("div");
    optionsContainer.style.marginTop = STYLE.spacing.md;
    optionsContainer.style.display = "flex";
    optionsContainer.style.flexDirection = "column";
    optionsContainer.style.gap = "12px";
    optionsContainer.style.padding = "10px";
    optionsContainer.style.border = `1px solid ${COLORS.border}`;
    optionsContainer.style.borderRadius = "8px";
    optionsContainer.style.backgroundColor = COLORS.surface;
    const optionsTitle = document.createElement("div");
    optionsTitle.textContent = "显示选项";
    optionsTitle.style.fontWeight = "bold";
    optionsTitle.style.marginBottom = "8px";
    optionsTitle.style.color = COLORS.white;
    optionsContainer.appendChild(optionsTitle);

    const panelSizeContainer = document.createElement("div");
    panelSizeContainer.style.display = "flex";
    panelSizeContainer.style.alignItems = "center";
    panelSizeContainer.style.justifyContent = "space-between";
    panelSizeContainer.style.width = "100%";
    const panelSizeLabel = document.createElement("span");
    panelSizeLabel.textContent = "面板大小:";
    panelSizeLabel.style.color = COLORS.secondaryText;
    panelSizeContainer.appendChild(panelSizeLabel);

    const panelSizeControls = document.createElement("div");
    panelSizeControls.style.display = "flex";
    panelSizeControls.style.alignItems = "center";
    panelSizeControls.style.gap = "6px";

    const widthInput = document.createElement("input");
    widthInput.type = "number";
    widthInput.min = "200";
    widthInput.max = "1400";
    widthInput.step = "10";
    widthInput.value = String(usageData.size?.width || 400);
    widthInput.title = "宽度(px)";
    widthInput.style.width = "76px";
    widthInput.style.backgroundColor = COLORS.background;
    widthInput.style.color = COLORS.white;
    widthInput.style.border = `1px solid ${COLORS.border}`;
    widthInput.style.borderRadius = "4px";
    widthInput.style.padding = "3px 6px";

    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.min = "200";
    heightInput.max = "1400";
    heightInput.step = "10";
    heightInput.value = String(usageData.size?.height || 500);
    heightInput.title = "高度(px)";
    heightInput.style.width = "76px";
    heightInput.style.backgroundColor = COLORS.background;
    heightInput.style.color = COLORS.white;
    heightInput.style.border = `1px solid ${COLORS.border}`;
    heightInput.style.borderRadius = "4px";
    heightInput.style.padding = "3px 6px";

    function clampInt(v, min, max, fallback) {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(Math.max(n, min), max);
    }

    function applyPanelSize(width, height) {
      const w = clampInt(width, 200, 1400, 400);
      const h = clampInt(height, 200, 1400, 500);
      widthInput.value = String(w);
      heightInput.value = String(h);

      updateUsageData((data) => {
        data.size = { width: w, height: h };
      });

      const monitor = document.getElementById("chatUsageMonitor");
      if (monitor && !monitor.classList.contains("minimized")) {
        monitor.style.width = `${w}px`;
        monitor.style.height = `${h}px`;
      }

      showToast("面板大小已更新", "success");
    }

    const applySizeBtn = document.createElement("button");
    applySizeBtn.className = "btn";
    applySizeBtn.textContent = "应用";
    applySizeBtn.style.padding = "4px 8px";
    applySizeBtn.addEventListener("click", () => {
      applyPanelSize(widthInput.value, heightInput.value);
    });

    const resetSizeBtn = document.createElement("button");
    resetSizeBtn.className = "btn";
    resetSizeBtn.textContent = "默认";
    resetSizeBtn.style.padding = "4px 8px";
    resetSizeBtn.addEventListener("click", () => {
      applyPanelSize(400, 500);
    });

    panelSizeControls.appendChild(widthInput);
    panelSizeControls.appendChild(heightInput);
    panelSizeControls.appendChild(applySizeBtn);
    panelSizeControls.appendChild(resetSizeBtn);
    panelSizeContainer.appendChild(panelSizeControls);
    optionsContainer.appendChild(panelSizeContainer);

    const panelSizeHint = document.createElement("div");
    panelSizeHint.textContent = "提示：也可拖动面板右下角调整大小（最小化状态下不可调整）";
    panelSizeHint.style.fontSize = STYLE.textSize.xs;
    panelSizeHint.style.color = COLORS.secondaryText;
    panelSizeHint.style.lineHeight = STYLE.lineHeight.xs;
    optionsContainer.appendChild(panelSizeHint);

    const panelPositionContainer = document.createElement("div");
    panelPositionContainer.style.display = "flex";
    panelPositionContainer.style.alignItems = "center";
    panelPositionContainer.style.justifyContent = "space-between";
    panelPositionContainer.style.width = "100%";
    const panelPositionLabel = document.createElement("span");
    panelPositionLabel.textContent = "面板位置:";
    panelPositionLabel.style.color = COLORS.secondaryText;
    panelPositionContainer.appendChild(panelPositionLabel);

    const resetPositionBtn = document.createElement("button");
    resetPositionBtn.className = "btn";
    resetPositionBtn.textContent = "重置";
    resetPositionBtn.style.padding = "4px 8px";
	    resetPositionBtn.addEventListener("click", () => {
	      cancelPendingMonitorMinimized();
	      const nextData = updateUsageData((data) => {
	        data.position = { x: null, y: null };
	        data.minimizedPosition = { x: null, y: null };
	        data.minimized = false;
	      });
      const monitor = document.getElementById("chatUsageMonitor");
      if (monitor) {
        monitor.classList.remove("minimized");
        monitor.style.setProperty("left", STYLE.spacing.lg, "important");
        monitor.style.setProperty("bottom", "100px", "important");
        monitor.style.setProperty("right", "auto", "important");
        monitor.style.setProperty("top", "auto", "important");
        if (nextData.size?.width && nextData.size?.height) {
          monitor.style.width = `${nextData.size.width}px`;
          monitor.style.height = `${nextData.size.height}px`;
        }
      }
      showToast("监视器位置已重置", "success");
    });
    panelPositionContainer.appendChild(resetPositionBtn);
    optionsContainer.appendChild(panelPositionContainer);

    const progressSelectContainer = document.createElement("div");
    progressSelectContainer.style.display = "flex";
    progressSelectContainer.style.alignItems = "center";
    progressSelectContainer.style.justifyContent = "space-between";
    progressSelectContainer.style.width = "100%";
    const progressTypeLabel = document.createElement("span");
    progressTypeLabel.textContent = "进度条样式:";
    progressTypeLabel.style.color = COLORS.secondaryText;
    progressSelectContainer.appendChild(progressTypeLabel);
    const progressTypeSelect = document.createElement("select");
    progressTypeSelect.style.width = "100px";
    progressTypeSelect.style.backgroundColor = COLORS.background;
    progressTypeSelect.style.color = COLORS.white;
    progressTypeSelect.style.border = `1px solid ${COLORS.border}`;
    progressTypeSelect.style.borderRadius = "4px";
    progressTypeSelect.style.padding = "3px 6px";
    progressTypeSelect.innerHTML = `<option value="dots">点状进度</option><option value="bar">条状进度</option>`;
    progressTypeSelect.value = usageData.progressType || "bar";
    progressTypeSelect.addEventListener("change", () => {
      updateUsageData((data) => {
        data.progressType = progressTypeSelect.value;
      });
      updateUI();
    });
    progressSelectContainer.appendChild(progressTypeSelect);
    optionsContainer.appendChild(progressSelectContainer);
    const showResetTimeContainer = document.createElement("div");
    showResetTimeContainer.style.display = "flex";
    showResetTimeContainer.style.alignItems = "center";
    showResetTimeContainer.style.justifyContent = "space-between";
    showResetTimeContainer.style.width = "100%";
    const showResetTimeLabel = document.createElement("label");
    showResetTimeLabel.textContent = "显示窗口重置时间";
    showResetTimeLabel.style.color = COLORS.secondaryText;
    showResetTimeLabel.style.cursor = "pointer";
    const checkboxWrapper = document.createElement("div");
    checkboxWrapper.style.position = "relative";
    checkboxWrapper.style.width = "40px";
    checkboxWrapper.style.height = "20px";
    checkboxWrapper.style.backgroundColor = usageData.showWindowResetTime ? COLORS.success : COLORS.disabled;
    checkboxWrapper.style.borderRadius = "10px";
    checkboxWrapper.style.transition = "all 0.3s ease";
    checkboxWrapper.style.cursor = "pointer";
    const slider = document.createElement("div");
    slider.style.position = "absolute";
    slider.style.top = "2px";
    slider.style.left = usageData.showWindowResetTime ? "22px" : "2px";
    slider.style.width = "16px";
    slider.style.height = "16px";
    slider.style.borderRadius = "50%";
    slider.style.backgroundColor = COLORS.white;
    slider.style.transition = "all 0.3s ease";
    checkboxWrapper.appendChild(slider);
    checkboxWrapper.addEventListener("click", () => {
      const checked = !usageData.showWindowResetTime;
      updateUsageData((data) => {
        data.showWindowResetTime = checked;
      });
      checkboxWrapper.style.backgroundColor = checked ? COLORS.success : COLORS.disabled;
      slider.style.left = checked ? "22px" : "2px";
      updateUI();
    });
    showResetTimeLabel.addEventListener("click", () => checkboxWrapper.click());
    showResetTimeContainer.appendChild(showResetTimeLabel);
    showResetTimeContainer.appendChild(checkboxWrapper);
    optionsContainer.appendChild(showResetTimeContainer);
    container.appendChild(optionsContainer);
  }
  function handleDeleteModel(modelKey) {
    if (!confirm(`确定要删除模型 "${modelKey}" 的配置吗？`)) return;
    let removed = false;
    updateUsageData((data) => {
      if (data.models[modelKey]) {
        delete data.models[modelKey];
        removed = true;
      }
    });
    if (removed) {
      updateUI();
      showToast(`模型 "${modelKey}" 已删除。`);
    } else {
      showToast(`未找到模型 "${modelKey}"。`, "warning");
    }
  }

  // ===== Position helpers (unified with QuickNav) =====
  function __aichatUiPosApi() {
    try {
      const existing = globalThis.__aichat_ui_pos_drag_v1__;
      if (existing) return existing;
    } catch {
      // ignore
    }

    // Fallback: embed the same helper so the monitor keeps working even if the shared file
    // wasn't injected (e.g. old registered content scripts).
    function clampNum(v, min, max) {
      const n = Number(v);
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    }

    function viewportSize() {
      const vw = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
      const vh = Math.max(window.visualViewport?.height || 0, window.innerHeight || 0);
      return { vw, vh };
    }

    function normalizePosV2(raw) {
      try {
        if (!raw || typeof raw !== "object") return null;
        const toNum = (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const top = toNum(raw.top);
        if (!Number.isFinite(top)) return null;
        const left = toNum(raw.left);
        const right = toNum(raw.right);
        const anchor = raw.anchor === "right" ? "right" : "left";
        return {
          top,
          left: Number.isFinite(left) ? left : null,
          right: Number.isFinite(right) ? right : null,
          anchor,
          ts: Number.isFinite(Number(raw.ts)) ? Number(raw.ts) : Date.now()
        };
      } catch {
        return null;
      }
    }

    function posV2FromRect(rect) {
      const { vw, vh } = viewportSize();
      const safeVw = Math.max(0, vw);
      const safeVh = Math.max(0, vh);
      const centerX = rect.left + (rect.width || 0) / 2;
      const anchorRight = safeVw && centerX >= safeVw / 2;
      const maxTop = Math.max(0, safeVh - 40);
      const top = clampNum(rect.top, 0, maxTop || rect.top);
      const left = Math.max(0, rect.left);
      const right = Math.max(0, safeVw - rect.right);
      return {
        top,
        left: anchorRight ? null : left,
        right: anchorRight ? right : null,
        anchor: anchorRight ? "right" : "left",
        ts: Date.now()
      };
    }

    function posV2FromLegacyXY(x, y, width, height) {
      const { vw, vh } = viewportSize();
      const w = Math.max(0, Number(width) || 0);
      const h = Math.max(0, Number(height) || 0);
      const safeVw = Math.max(0, vw);
      const safeVh = Math.max(0, vh);
      const leftPx = clampNum(x, 0, Math.max(0, safeVw - w));
      const topPx = clampNum(y, 0, Math.max(0, safeVh - Math.min(40, h)));
      const centerX = leftPx + w / 2;
      const anchorRight = safeVw && centerX >= safeVw / 2;
      const rightPx = Math.max(0, safeVw - (leftPx + w));
      return {
        top: topPx,
        left: anchorRight ? null : leftPx,
        right: anchorRight ? rightPx : null,
        anchor: anchorRight ? "right" : "left",
        ts: Date.now()
      };
    }

    function applyPosV2(el, posV2, widthHint, heightHint) {
      const pos = normalizePosV2(posV2);
      if (!el || !pos) return false;
      const { vw, vh } = viewportSize();
      const w = Math.max(0, Number(widthHint) || el.offsetWidth || 0);
      const h = Math.max(0, Number(heightHint) || el.offsetHeight || 0);
      const safeVw = Math.max(0, vw);
      const safeVh = Math.max(0, vh);
      const maxLeft = Math.max(0, safeVw - w);
      const maxRight = Math.max(0, safeVw - w);
      const maxTop = Math.max(0, safeVh - Math.min(40, h));

      const top = clampNum(pos.top, 0, maxTop || pos.top);
      el.style.setProperty("top", `${Math.round(top)}px`, "important");
      el.style.setProperty("bottom", "auto", "important");

      if (pos.anchor === "right") {
        const right = clampNum(pos.right ?? 0, 0, maxRight || (pos.right ?? 0));
        el.style.setProperty("right", `${Math.round(right)}px`, "important");
        el.style.setProperty("left", "auto", "important");
      } else {
        const left = clampNum(pos.left ?? 0, 0, maxLeft || (pos.left ?? 0));
        el.style.setProperty("left", `${Math.round(left)}px`, "important");
        el.style.setProperty("right", "auto", "important");
      }
      return true;
    }

    function enableRightTopDrag(element, handle, opts = {}) {
      if (!element) return;
      const dragHandle = handle || element;
      if (!dragHandle || !dragHandle.addEventListener) return;

      const onDragStart = typeof opts.onDragStart === "function" ? opts.onDragStart : null;
      const onDragMove = typeof opts.onDragMove === "function" ? opts.onDragMove : null;
      const onDragEnd = typeof opts.onDragEnd === "function" ? opts.onDragEnd : null;
      const shouldStart = typeof opts.shouldStart === "function" ? opts.shouldStart : null;
      const isInteractive =
        typeof opts.isInteractive === "function"
          ? opts.isInteractive
          : (target) => {
              try {
                if (!target || !target.closest) return false;
                return !!target.closest('button, a, input, textarea, select, [role="button"]');
              } catch {
                return false;
              }
            };

      const DRAG_THRESHOLD_PX = Number.isFinite(Number(opts.thresholdPx)) ? Number(opts.thresholdPx) : 6;
      let tracking = false;
      let dragStarted = false;
      let startX = 0;
      let startY = 0;
      let startRight = 0;
      let startTop = 0;

      dragHandle.addEventListener("mousedown", (e) => {
        if (!e || e.button !== 0) return;
        if (shouldStart) {
          try {
            if (!shouldStart(e)) return;
          } catch {
            return;
          }
        }
        if (isInteractive(e.target)) return;

        tracking = true;
        dragStarted = false;
        startX = e.clientX;
        startY = e.clientY;

        const rect = element.getBoundingClientRect();
        startTop = rect.top;
        startRight = Math.max(0, (window.innerWidth || 0) - rect.right);
      });

      document.addEventListener("mousemove", (e) => {
        if (!tracking) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!dragStarted) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
          dragStarted = true;
          if (onDragStart) {
            try {
              onDragStart(e);
            } catch {}
          }
        }

        const newRight = Math.max(0, startRight - dx);
        element.style.setProperty("right", `${newRight}px`, "important");
        element.style.setProperty("left", "auto", "important");
        element.style.setProperty("top", `${startTop + dy}px`, "important");
        element.style.setProperty("bottom", "auto", "important");

        if (onDragMove) {
          try {
            onDragMove(e);
          } catch {}
        }
        try {
          e.preventDefault();
        } catch {}
      });

      document.addEventListener("mouseup", (e) => {
        if (!tracking) return;
        tracking = false;
        if (!dragStarted) return;
        dragStarted = false;
        if (onDragEnd) {
          try {
            onDragEnd(e);
          } catch {}
        }
      });
    }

    const api = { normalizePosV2, posV2FromRect, posV2FromLegacyXY, applyPosV2, enableRightTopDrag };
    try {
      Object.defineProperty(globalThis, "__aichat_ui_pos_drag_v1__", {
        value: api,
        configurable: false,
        enumerable: false,
        writable: false
      });
    } catch {
      try {
        globalThis.__aichat_ui_pos_drag_v1__ = api;
      } catch {}
    }
    return api;
  }

  function __aichatNormalizePosV2(raw) {
    return __aichatUiPosApi()?.normalizePosV2(raw) || null;
  }

  function __aichatPosV2FromRect(rect) {
    return __aichatUiPosApi()?.posV2FromRect(rect) || null;
  }

  function __aichatPosV2FromLegacyXY(x, y, width, height) {
    return __aichatUiPosApi()?.posV2FromLegacyXY(x, y, width, height) || null;
  }

  function __aichatApplyPosV2(el, posV2, widthHint, heightHint) {
    return __aichatUiPosApi()?.applyPosV2(el, posV2, widthHint, heightHint) || false;
  }

  var __aichatDragSuppressClickKey = "__aichat_chatgpt_usage_monitor_drag_suppress_click_v1__";
  function setupDraggable(element) {
    const api = __aichatUiPosApi();
    if (!api || typeof api.enableRightTopDrag !== "function") return;

    const handle = element.querySelector("header");
    const isInteractive = (target) => {
      try {
        if (!target || !target.closest) return false;
        return !!target.closest('button, a, input, textarea, select, [role="button"]');
      } catch {
        return false;
      }
    };

    const commitPosition = () => {
      try {
        element[__aichatDragSuppressClickKey] = Date.now();
      } catch {}

      const isMinimized = element.classList.contains("minimized");
      try {
        const rect = element.getBoundingClientRect();
        const posV2 = __aichatPosV2FromRect(rect);
        const legacy = { x: Math.max(0, Math.round(rect.left)), y: Math.max(0, Math.round(rect.top)) };
        Storage.update((data) => {
          if (isMinimized) {
            data.minimizedPosition = legacy;
            data.minimizedPositionV2 = posV2;
          } else {
            data.position = legacy;
            data.positionV2 = posV2;
          }
        });
      } catch {}
    };

    if (handle) {
      api.enableRightTopDrag(element, handle, {
        thresholdPx: 6,
        isInteractive,
        onDragEnd: (e) => {
          commitPosition();
          try {
            e?.preventDefault?.();
          } catch {}
        }
      });
    }

    api.enableRightTopDrag(element, element, {
      thresholdPx: 6,
      shouldStart: (e) => {
        try {
          if (!element.classList.contains("minimized")) return false;
          if (handle && e?.target && handle.contains(e.target)) return false;
          return true;
        } catch {
          return false;
        }
      },
      isInteractive: (target) => {
        if (!element.classList.contains("minimized")) return true;
        return isInteractive(target);
      },
      onDragEnd: (e) => {
        commitPosition();
        try {
          e?.preventDefault?.();
          e?.stopPropagation?.();
        } catch {}
      }
    });
  }
  var _keyboardShortcutsInstalled = false;
  function setupKeyboardShortcuts() {
    if (_keyboardShortcutsInstalled) return;
    _keyboardShortcutsInstalled = true;
    const handleShortcut = (e) => {
      if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key && e.key.toLowerCase() === "i") {
        // In silent mode we do not intercept Cmd+I at all.
        if (isSilent()) return;
        const monitor = document.getElementById("chatUsageMonitor");
        if (!monitor) return;

        e.preventDefault();
        e.stopPropagation();
        try {
          e.stopImmediatePropagation();
        } catch {}
        const current = _minimizeDesired !== null ? _minimizeDesired : monitor.classList.contains("minimized");
        requestMonitorMinimized(!current);
        return false;
      }
    };
    document.addEventListener("keydown", handleShortcut, true);
  }
  var _uiUpdateIntervalId = null;
  // Coalesce rapid minimize/restore actions:
  // 1) Intent wins (last request applies)
  // 2) 0.1s cooldown to avoid UI thrash on spam clicks
  var _minimizeDesired = null;
  var _minimizeTimerId = null;
  var _minimizeLastAppliedAt = 0;
  function cancelPendingMonitorMinimized() {
    _minimizeDesired = null;
    if (_minimizeTimerId) {
      try {
        clearTimeout(_minimizeTimerId);
      } catch {
      }
      _minimizeTimerId = null;
    }
  }
	  function applyMonitorMinimized(nextMinimized) {
	    const monitor = document.getElementById("chatUsageMonitor");
	    if (!monitor) return;

	    const next = !!nextMinimized;
	    const currentData = Storage.get();

	    if (next) {
	      monitor.classList.add("minimized");
	      // If the user never set a minimized position, derive it from the current panel rect
	      // so the badge doesn't "jump" to a default corner.
	      try {
	        const hasMinV2 = !!__aichatNormalizePosV2(currentData.minimizedPositionV2);
	        const hasMinLegacy = currentData.minimizedPosition?.x !== null && currentData.minimizedPosition?.y !== null;
	        if (!hasMinV2 && !hasMinLegacy) {
	          const rect = monitor.getBoundingClientRect();
	          const legacy = { x: Math.max(0, Math.round(rect.left)), y: Math.max(0, Math.round(rect.top)) };
	          const posV2 = __aichatPosV2FromRect(rect);
	          Storage.update((data) => {
	            data.minimizedPosition = legacy;
	            data.minimizedPositionV2 = posV2;
	          });
	          // keep local view in sync for immediate apply
	          try {
	            currentData.minimizedPosition = legacy;
	            currentData.minimizedPositionV2 = posV2;
	          } catch {}
	        }
	      } catch {}

	      // Restore minimized position if the user set it (do not override expanded position).
	      try {
	        const posV2 =
	          __aichatNormalizePosV2(currentData.minimizedPositionV2) ||
	          (currentData.minimizedPosition?.x !== null && currentData.minimizedPosition?.y !== null
	            ? __aichatPosV2FromLegacyXY(currentData.minimizedPosition.x, currentData.minimizedPosition.y, 30, 30)
	            : null);
	        if (posV2) __aichatApplyPosV2(monitor, posV2, 30, 30);
	      } catch {}
	    } else {
	      monitor.classList.remove("minimized");
	      if (currentData.size?.width && currentData.size?.height) {
	        monitor.style.width = `${currentData.size.width}px`;
	        monitor.style.height = `${currentData.size.height}px`;
	      }
	      // Restore expanded position when leaving minimized mode.
	      try {
	        const width = currentData.size?.width || monitor.offsetWidth || 400;
	        const height = currentData.size?.height || monitor.offsetHeight || 500;
	        const posV2 =
	          __aichatNormalizePosV2(currentData.positionV2) ||
	          (currentData.position?.x !== null && currentData.position?.y !== null
	            ? __aichatPosV2FromLegacyXY(currentData.position.x, currentData.position.y, width, height)
	            : null);
	        if (posV2) {
	          __aichatApplyPosV2(monitor, posV2, width, height);
	        } else {
	          monitor.style.setProperty("left", STYLE.spacing.lg, "important");
	          monitor.style.setProperty("bottom", "100px", "important");
	          monitor.style.setProperty("right", "auto", "important");
	          monitor.style.setProperty("top", "auto", "important");
	        }
	      } catch {}
	      // Ensure content is fresh when the user expands it.
	      try {
	        updateUI();
	      } catch {}
	    }

	    try {
	      Storage.update((data) => {
	        data.minimized = next;
      });
      refreshUsageData();
    } catch {}
  }
  function requestMonitorMinimized(nextMinimized) {
    const monitor = document.getElementById("chatUsageMonitor");
    if (!monitor) return;
    if (isSilent()) return;

    const next = !!nextMinimized;
    _minimizeDesired = next;

    const COOLDOWN_MS = 100;
    const now = Date.now();
    const earliest = _minimizeLastAppliedAt + COOLDOWN_MS;
    const waitMs = Math.max(0, earliest - now);

    if (_minimizeTimerId) return;
    if (waitMs === 0) {
      _minimizeLastAppliedAt = now;
      const desired = _minimizeDesired;
      _minimizeDesired = null;
      applyMonitorMinimized(desired);
      return;
    }
    _minimizeTimerId = setTimeout(() => {
      _minimizeTimerId = null;
      _minimizeLastAppliedAt = Date.now();
      const desired = _minimizeDesired;
      _minimizeDesired = null;
      applyMonitorMinimized(desired);
    }, waitMs);
  }
	  function createMonitorUI() {
	    if (isSilent()) return;
	    if (document.getElementById("chatUsageMonitor")) return;
	    const container = document.createElement("div");
	    container.id = "chatUsageMonitor";
	    if (usageData.minimized) container.classList.add("minimized");
	    if (usageData.size?.width && usageData.size?.height && !usageData.minimized) {
	      container.style.width = `${usageData.size.width}px`;
	      container.style.height = `${usageData.size.height}px`;
	    }
	    const defaultWidth = usageData.minimized ? 30 : usageData.size?.width || 400;
	    const defaultHeight = usageData.minimized ? 30 : usageData.size?.height || 500;
	    let usedFallbackMinPos = false;
	    let posV2 = null;
	    try {
	      if (usageData.minimized) {
	        posV2 = __aichatNormalizePosV2(usageData.minimizedPositionV2);
	        if (!posV2 && usageData.minimizedPosition?.x !== null && usageData.minimizedPosition?.y !== null) {
	          posV2 = __aichatPosV2FromLegacyXY(usageData.minimizedPosition.x, usageData.minimizedPosition.y, 30, 30);
	          // migrate legacy -> v2
	          Storage.update((data) => {
	            data.minimizedPositionV2 = posV2;
	          });
	        }
	        if (!posV2) {
	          usedFallbackMinPos = true;
	          posV2 = __aichatNormalizePosV2(usageData.positionV2);
	          if (!posV2 && usageData.position?.x !== null && usageData.position?.y !== null) {
	            posV2 = __aichatPosV2FromLegacyXY(usageData.position.x, usageData.position.y, defaultWidth, defaultHeight);
	          }
	        }
	      } else {
	        posV2 = __aichatNormalizePosV2(usageData.positionV2);
	        if (!posV2 && usageData.position?.x !== null && usageData.position?.y !== null) {
	          posV2 = __aichatPosV2FromLegacyXY(usageData.position.x, usageData.position.y, defaultWidth, defaultHeight);
	          // migrate legacy -> v2
	          Storage.update((data) => {
	            data.positionV2 = posV2;
	          });
	        }
	      }
	    } catch {}
	    if (posV2) {
	      __aichatApplyPosV2(container, posV2, defaultWidth, defaultHeight);
	    } else {
	      container.style.setProperty("left", STYLE.spacing.lg, "important");
	      container.style.setProperty("bottom", "100px", "important");
	      container.style.setProperty("right", "auto", "important");
	      container.style.setProperty("top", "auto", "important");
	    }
	    const header = document.createElement("header");
	    const minimizeBtn = document.createElement("div");
	    minimizeBtn.className = "minimize-btn";
	    minimizeBtn.innerHTML = "−";
    minimizeBtn.title = "最小化监视器";
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      requestMonitorMinimized(true);
    });
    header.appendChild(minimizeBtn);
    const usageTabBtn = document.createElement("button");
    usageTabBtn.innerHTML = `<span>用量</span>`;
    usageTabBtn.classList.add("active");
    const settingsTabBtn = document.createElement("button");
    settingsTabBtn.innerHTML = `<span>设置</span>`;
    header.appendChild(usageTabBtn);
    header.appendChild(settingsTabBtn);
    container.appendChild(header);
    const usageContent = document.createElement("div");
    usageContent.className = "content";
    usageContent.id = "usageContent";
    container.appendChild(usageContent);
    const settingsContent = document.createElement("div");
    settingsContent.className = "content";
    settingsContent.id = "settingsContent";
    settingsContent.style.display = "none";
    container.appendChild(settingsContent);
    usageTabBtn.addEventListener("click", () => {
      usageTabBtn.classList.add("active");
      settingsTabBtn.classList.remove("active");
      usageContent.style.display = "";
      settingsContent.style.display = "none";
    });
    settingsTabBtn.addEventListener("click", () => {
      settingsTabBtn.classList.add("active");
      usageTabBtn.classList.remove("active");
      settingsContent.style.display = "";
      usageContent.style.display = "none";
    });
	    container.addEventListener("click", (e) => {
	      if (!container.classList.contains("minimized")) return;
      const lastDragAt = Number(container[__aichatDragSuppressClickKey] || 0);
      if (lastDragAt && Date.now() - lastDragAt < 250) {
        e.stopPropagation();
        return;
      }
      requestMonitorMinimized(false);
      e.stopPropagation();
	    });
	    document.body.appendChild(container);
	    // If the minimized badge overlaps ChatGPT sidebar controls, move it to a safer corner.
	    try {
	      if (usedFallbackMinPos && container.classList.contains("minimized")) {
	        const sidebar =
	          document.querySelector('nav[aria-label="Chat history"]') ||
	          document.querySelector('[data-testid="chat-history"]') ||
	          document.getElementById("stage-slideover-sidebar") ||
	          null;
	        if (sidebar && typeof sidebar.getBoundingClientRect === "function") {
	          const sr = sidebar.getBoundingClientRect();
	          const r = container.getBoundingClientRect();
	          const pad = 6;
	          const overlaps =
	            r.left < sr.right + pad && r.right > sr.left - pad && r.top < sr.bottom + pad && r.bottom > sr.top - pad;
	          if (overlaps) {
	            const margin = 12;
	            const x = Math.max(margin, Math.round(window.innerWidth - r.width - margin));
	            const y = Math.max(margin, Math.round(window.innerHeight - r.height - margin));
	            container.style.setProperty("left", `${x}px`, "important");
	            container.style.setProperty("top", `${y}px`, "important");
	            container.style.setProperty("right", "auto", "important");
	            container.style.setProperty("bottom", "auto", "important");
	            Storage.update((data) => {
	              data.minimizedPosition = { x, y };
	              try {
	                data.minimizedPositionV2 = __aichatPosV2FromLegacyXY(x, y, r.width, r.height);
	              } catch {}
	            });
	          }
	        }
	      }
	    } catch {}
	    setupDraggable(container);
	    updateUI();
	    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        if (container.classList.contains("minimized")) return;
        const width = container.offsetWidth;
        const height = container.offsetHeight;
        if (width > 50 && height > 50) {
          Storage.update((data) => {
            data.size = { width, height };
          });
        }
      });
      resizeObserver.observe(container);
    }
    if (_uiUpdateIntervalId) {
      clearInterval(_uiUpdateIntervalId);
      _uiUpdateIntervalId = null;
    }
    _uiUpdateIntervalId = setInterval(updateUI, 6e4);
  }

	  // src/main.js
	  function main() {
		    // UI mode: show the original in-page floating usage monitor panel (upstream UI),
		    // while still keeping Options as a secondary place for viewing/import/export/clear.
		    const UI_ENABLED = true;

	    refreshUsageData();
	    const startsSilent = isSilent();

	    if (UI_ENABLED && !startsSilent) {
	      installTextScrambler();
	      injectStyles();
	    }

	    installFetchInterceptor();

	    // Ensure plan structure is applied at least once (even without UI).
	    try {
	      const currentPlan = usageData?.planType || "team";
	      if (currentPlan && PLAN_CONFIGS[currentPlan]) {
	        const shouldReapply = !__aichatIsPlanStructureApplied(currentPlan, usageData);
	        if (shouldReapply) {
	          applyPlanConfig(currentPlan);
	        } else {
	          const planConfig = PLAN_CONFIGS[currentPlan];
	          let addedModels = 0;
	          updateUsageData((data) => {
	            Object.entries(planConfig.models).forEach(([modelKey, cfg]) => {
	              if (data.models[modelKey]) return;
	              data.models[modelKey] = { requests: [], quota: cfg.quota, windowType: cfg.windowType };
	              if (cfg.sharedGroup) delete data.models[modelKey].quota;
	              if (cfg.sharedGroup) delete data.models[modelKey].windowType;
	              if (cfg.sharedGroup) data.models[modelKey].sharedGroup = cfg.sharedGroup;
	              addedModels++;
	            });
	          });
	          if (addedModels > 0) {
	            console.log(`[monitor] Added ${addedModels} missing models for ${planConfig.name} plan during init`);
	          }
	        }
	      }
	      cleanupExpiredRequests();
	    } catch {}

    onDataChanged(() => {
	      if (!UI_ENABLED) return;
	      if (isSilent()) return;
	      const monitor = document.getElementById("chatUsageMonitor");
	      if (monitor?.classList?.contains("minimized")) return;
	      updateUI();
	    });
    let _pendingInitTimerId = null;
    let _pendingInitDueAt = 0;
    let _initializedOnce = false;
    function scheduleInitialize(delay = 300) {
      const now = Date.now();
      const safeDelay = Math.max(0, Number(delay) || 0);
      const dueAt = now + safeDelay;
      if (_pendingInitTimerId) {
        // If we already scheduled an init but now we need it sooner (e.g. user action),
        // reschedule to the earlier time instead of ignoring the request.
        if (dueAt >= _pendingInitDueAt) return;
        try { clearTimeout(_pendingInitTimerId); } catch {}
        _pendingInitTimerId = null;
      }
      _pendingInitDueAt = dueAt;
      _pendingInitTimerId = setTimeout(() => {
        _pendingInitTimerId = null;
        _pendingInitDueAt = 0;
        initialize();
      }, Math.max(0, dueAt - now));
    }

    // External plan sync (Options -> page). The bridge runs in isolated-world and dispatches a CustomEvent here.
    try {
      if (!window.__aichatChatGptUsageMonitorExternalPlanListenerInstalled) {
        window.__aichatChatGptUsageMonitorExternalPlanListenerInstalled = true;
        window.addEventListener(
          __aichatUsageMonitorSetPlanEvent,
          (e) => {
            try {
              const nextPlan = String(e?.detail?.planType || "").trim();
              if (!nextPlan || !PLAN_CONFIGS[nextPlan]) return;
              const currentData = refreshUsageData();
              const currentPlan = currentData.planType || "team";
              const alreadyApplied = __aichatIsPlanStructureApplied(nextPlan, currentData);
              if (currentPlan === nextPlan && alreadyApplied) return;
              if (currentPlan !== nextPlan) {
                updateUsageData((data) => {
                  data.planType = nextPlan;
                });
              }
	              applyPlanConfig(nextPlan);
	              cleanupExpiredRequests();
	              if (UI_ENABLED && !isSilent()) {
	                try {
	                  updateUI();
	                } catch {}
	                try {
	                  showToast(`已切换到 ${PLAN_CONFIGS[nextPlan].name} 套餐`, "success");
	                } catch {}
	                scheduleInitialize(0);
	              }
	            } catch {}
	          },
	          true
	        );
	      }
    } catch {}

    if (UI_ENABLED && isSilent()) {
      const existingMonitor = document.getElementById("chatUsageMonitor");
      if (existingMonitor) existingMonitor.remove();
      console.log("🚀 ChatGPT Usage Monitor loaded (silent headless)");
      return;
    }

    function initialize() {
      if (!document?.body) {
        setTimeout(initialize, 300);
        return;
      }
      refreshUsageData();
      const currentPlan = usageData.planType || "team";
      const planConfig = PLAN_CONFIGS[currentPlan];
      if (planConfig) {
        const shouldReapply = !__aichatIsPlanStructureApplied(currentPlan, usageData);
        if (shouldReapply) {
          applyPlanConfig(currentPlan);
        } else {
          let addedModels = 0;
          updateUsageData((data) => {
            Object.entries(planConfig.models).forEach(([modelKey, cfg]) => {
              if (data.models[modelKey]) return;
              data.models[modelKey] = {
                requests: [],
                quota: cfg.quota,
                windowType: cfg.windowType
              };
              if (cfg.sharedGroup) delete data.models[modelKey].quota;
              if (cfg.sharedGroup) delete data.models[modelKey].windowType;
              if (cfg.sharedGroup) data.models[modelKey].sharedGroup = cfg.sharedGroup;
              addedModels++;
            });
          });
          if (addedModels > 0) {
            console.log(`[monitor] Added ${addedModels} missing models for ${planConfig.name} plan during init`);
          }
        }
      }
      cleanupExpiredRequests();
      if (isSilent()) {
        const existingMonitor = document.getElementById("chatUsageMonitor");
        if (existingMonitor) existingMonitor.remove();
        return;
      }
      createMonitorUI();
      setupKeyboardShortcuts();
      _initializedOnce = true;
    }
	    function resetMonitorPosition() {
	      cancelPendingMonitorMinimized();
	      Storage.update((data) => {
	        data.position = { x: null, y: null };
	        data.minimizedPosition = { x: null, y: null };
	        data.positionV2 = null;
	        data.minimizedPositionV2 = null;
	        data.minimized = false;
	      });
	      const existingMonitor = document.getElementById("chatUsageMonitor");
	      if (existingMonitor) existingMonitor.remove();
      scheduleInitialize(100);
      setTimeout(() => {
        const monitor = document.getElementById("chatUsageMonitor");
        if (monitor) {
          monitor.style.setProperty("left", STYLE.spacing.lg, "important");
          monitor.style.setProperty("bottom", "100px", "important");
          monitor.style.setProperty("right", "auto", "important");
          monitor.style.setProperty("top", "auto", "important");
          showToast("监视器已重置并重新加载", "success");
        } else {
          alert("监视器重置完成。如果没有看到监视器，请刷新页面。");
        }
      }, 500);
    }

    function toggleSilentMode() {
      cancelPendingMonitorMinimized();
      const current = Storage.get();
      const nextSilent = !current?.silentMode;
      try { GM_setValue(SILENT_MODE_USER_KEY, Date.now()); } catch {}
      Storage.update((data) => {
        data.silentMode = nextSilent;
        if (nextSilent) data.minimized = false;
      });
      const existingMonitor = document.getElementById("chatUsageMonitor");
      if (existingMonitor) existingMonitor.remove();
      scheduleInitialize(50);
      try {
        console.log(`[monitor] Silent mode: ${nextSilent ? "ON" : "OFF"}`);
      } catch {}
    }

	    if (!UI_ENABLED) {
	      console.log("🚀 ChatGPT Usage Monitor loaded (headless)");
	      return;
	    }

	    if (document.readyState === "loading") {
	      window.addEventListener("DOMContentLoaded", () => scheduleInitialize(0));
	    } else {
	      scheduleInitialize(0);
	    }

	    // SPA navigation: re-init when route changes.
	    try {
	      if (!window.__aichatChatGptUsageMonitorRouteWatchInstalled) {
	        window.__aichatChatGptUsageMonitorRouteWatchInstalled = true;
	        // Avoid a "double init" during the initial ChatGPT hydration/router bootstrap, which can look like a page refresh.
	        // We only start reacting to route changes after the monitor has been initialized at least once.
	        const onRoute = () => {
	          try {
	            if (!_initializedOnce) return;
	          } catch {}
	          scheduleInitialize(300);
	        };
	        const core = window.__aichat_chatgpt_core_main_v1__;
	        if (core && typeof core.onRouteChange === "function") {
	          window.__aichatChatGptUsageMonitorRouteUnsub = core.onRouteChange(onRoute);
	        } else {
	          // Fallback: use the shared MAIN-world bridge; avoid patching history (can conflict with other modules).
	          const bridge = window.__aichat_quicknav_bridge_main_v1__;
	          if (bridge && typeof bridge.ensureRouteListener === "function" && typeof bridge.on === "function") {
	            try { bridge.ensureRouteListener(); } catch {}
	            window.__aichatChatGptUsageMonitorRouteUnsub = bridge.on("routeChange", onRoute);
	          } else {
	            let last = "";
	            try { last = String(location.href || ""); } catch { last = ""; }
	            setInterval(() => {
	              try {
	                const href = String(location.href || "");
	                if (!href || href === last) return;
	                last = href;
	                onRoute();
	              } catch {}
	            }, 1200);
	          }
	        }
	      }
	    } catch {}

	    // Cheap self-heal: body child observer + slow timer (avoid global subtree MutationObserver on ChatGPT).
	    try {
	      if (!window.__aichatChatGptUsageMonitorEnsureInstalled) {
	        window.__aichatChatGptUsageMonitorEnsureInstalled = true;

	        let __aichatEnsureMo = null;
	        let __aichatEnsureTimer = 0;
	        let __aichatEnsureTries = 0;

	        const __aichatInstallEnsureMo = () => {
	          try {
	            if (__aichatEnsureMo) return true;
	            const body = document.body;
	            if (!body || typeof MutationObserver !== "function") return false;
	            __aichatEnsureMo = new MutationObserver(() => {
	              try {
	                if (isSilent()) return;
	                if (!document.getElementById("chatUsageMonitor")) scheduleInitialize(0);
	              } catch {}
	            });
	            __aichatEnsureMo.observe(body, { childList: true, subtree: false });
	            return true;
	          } catch {
	            try { __aichatEnsureMo?.disconnect(); } catch {}
	            __aichatEnsureMo = null;
	            return false;
	          }
	        };

	        const __aichatScheduleEnsure = (ms) => {
	          if (__aichatEnsureTimer) return;
	          __aichatEnsureTimer = setTimeout(() => {
	            __aichatEnsureTimer = 0;
	            try {
	              if (document.hidden) return __aichatScheduleEnsure(15000);
	              if (isSilent()) return __aichatScheduleEnsure(15000);
	              if (!document.getElementById("chatUsageMonitor")) scheduleInitialize(0);
	            } catch {}
	            __aichatScheduleEnsure(15000);
	          }, Math.max(0, Number(ms) || 0));
	        };

	        const __aichatBootstrapEnsure = () => {
	          try {
	            if (__aichatInstallEnsureMo()) return;
	            __aichatEnsureTries += 1;
	            if (__aichatEnsureTries < 20) setTimeout(__aichatBootstrapEnsure, 500);
	          } catch {}
	        };

	        __aichatBootstrapEnsure();
	        __aichatScheduleEnsure(4000);
	      }
	    } catch {}

	    console.log("🚀 ChatGPT Usage Monitor loaded");
  }

  // src/index.js
  main();
})();
