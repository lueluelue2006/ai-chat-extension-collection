/* QuickNav MV3 service worker (background) */
(() => {
  'use strict';

  const SETTINGS_KEY = 'quicknav_settings';
  let REGISTRY = null;
  let INJECTIONS = null;
  try {
    // Keep injection/registry as the single source of truth.
    importScripts('../shared/registry.js', '../shared/injections.js');
  } catch {}
  try { REGISTRY = globalThis.QUICKNAV_REGISTRY || null; } catch {}
  try { INJECTIONS = globalThis.QUICKNAV_INJECTIONS || null; } catch {}

  const DEFAULT_SETTINGS = (() => {
    try {
      if (INJECTIONS && typeof INJECTIONS.buildDefaultSettings === 'function') {
        return INJECTIONS.buildDefaultSettings(REGISTRY);
      }
    } catch {}
    return { enabled: true, sites: {}, scrollLockDefaults: {}, siteModules: {} };
  })();

  const MAIN_GUARD_FILE = String(INJECTIONS?.MAIN_GUARD_FILE || 'content/scroll-guard-main.js');
  const CONTENT_SCRIPT_DEFS = (() => {
    try {
      if (INJECTIONS && typeof INJECTIONS.buildContentScriptDefs === 'function') {
        return INJECTIONS.buildContentScriptDefs(REGISTRY);
      }
    } catch {}
    return [];
  })();

  const LEGACY_CONTENT_SCRIPT_IDS = Array.isArray(INJECTIONS?.LEGACY_CONTENT_SCRIPT_IDS)
    ? INJECTIONS.LEGACY_CONTENT_SCRIPT_IDS
    : ['quicknav_grok_model_selector'];
  const QUICKNAV_CONTENT_SCRIPT_IDS = [...new Set([...CONTENT_SCRIPT_DEFS.map((d) => d.id), ...LEGACY_CONTENT_SCRIPT_IDS])];

  let reinjectScheduled = false;
  let lastReinjectAt = 0;
  let pendingReinjectSettings = null;

  // Memtest (dev only) state bridge: used by OS-level guards to stop the running matrix + close the current test tab.
  const MEMTEST = {
    controllerTabId: null,
    testTabId: null,
    running: false,
    lastAt: 0,
    lastCaseId: '',
    lastModules: null
  };

  function memtestUpdateStatus(msg) {
    try {
      MEMTEST.lastAt = Date.now();
      MEMTEST.running = !!msg?.running;
      MEMTEST.controllerTabId = Number.isFinite(msg?.controllerTabId) ? msg.controllerTabId : MEMTEST.controllerTabId;
      MEMTEST.testTabId = Number.isFinite(msg?.testTabId) ? msg.testTabId : msg?.testTabId === null ? null : MEMTEST.testTabId;
      MEMTEST.lastCaseId = typeof msg?.caseId === 'string' ? msg.caseId : MEMTEST.lastCaseId;
      MEMTEST.lastModules = Array.isArray(msg?.modules) ? msg.modules.slice() : MEMTEST.lastModules;
    } catch {}
  }

  function memtestBroadcastAbort(reason) {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'QUICKNAV_MEMTEST_ABORT',
          reason: String(reason || 'abort'),
          caseId: typeof MEMTEST.lastCaseId === 'string' ? MEMTEST.lastCaseId : '',
          modules: Array.isArray(MEMTEST.lastModules) ? MEMTEST.lastModules.slice() : null,
        },
        () => void chrome.runtime.lastError
      );
    } catch {}
  }

  function memtestBroadcastGuard(reason) {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'QUICKNAV_MEMTEST_GUARD_EVENT',
          reason: String(reason || 'guard'),
          caseId: typeof MEMTEST.lastCaseId === 'string' ? MEMTEST.lastCaseId : '',
          modules: Array.isArray(MEMTEST.lastModules) ? MEMTEST.lastModules.slice() : null,
        },
        () => void chrome.runtime.lastError
      );
    } catch {}
  }

  function memtestCloseTestTab(reason) {
    const tabId = MEMTEST.testTabId;
    if (!Number.isFinite(tabId)) return;
    try {
      chrome.tabs.remove(tabId, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
    try {
      chrome.tabs.discard(tabId, () => void chrome.runtime.lastError);
    } catch {}
    try {
      memtestBroadcastGuard(reason);
    } catch {}
    try {
      MEMTEST.testTabId = null;
      MEMTEST.running = false;
      MEMTEST.lastAt = Date.now();
    } catch {}
    try {
      if (typeof reason === 'string' && reason) {
        const caseId = typeof MEMTEST.lastCaseId === 'string' ? MEMTEST.lastCaseId : '';
        const mods = Array.isArray(MEMTEST.lastModules) ? MEMTEST.lastModules.join(', ') : '';
        const details = `${caseId ? `\ncase: ${caseId}` : ''}${mods ? `\nmodules: ${mods}` : ''}`;
        chrome.notifications.create(`quicknav_memtest_abort_${Date.now()}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: 'QuickNav memtest stopped',
          message: (`Stopped due to: ${reason}${details}`).slice(0, 220),
          priority: 1
        });
      }
    } catch {}
  }

  function deepCloneJsonSafe(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return {};
    }
  }

  function normalizeSettings(input) {
    const out = {
      enabled: true,
      sites: { ...DEFAULT_SETTINGS.sites },
      scrollLockDefaults: { ...DEFAULT_SETTINGS.scrollLockDefaults },
      siteModules: deepCloneJsonSafe(DEFAULT_SETTINGS.siteModules)
    };
    try {
      if (!input || typeof input !== 'object') return out;
      if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
      if (input.sites && typeof input.sites === 'object') {
        for (const key of Object.keys(DEFAULT_SETTINGS.sites)) {
          if (typeof input.sites[key] === 'boolean') out.sites[key] = input.sites[key];
        }
      }
      if (input.scrollLockDefaults && typeof input.scrollLockDefaults === 'object') {
        for (const key of Object.keys(DEFAULT_SETTINGS.scrollLockDefaults)) {
          if (typeof input.scrollLockDefaults[key] === 'boolean') out.scrollLockDefaults[key] = input.scrollLockDefaults[key];
        }
      }
      if (input.siteModules && typeof input.siteModules === 'object') {
        for (const siteId of Object.keys(DEFAULT_SETTINGS.siteModules)) {
          const rawMods = input.siteModules?.[siteId];
          if (!rawMods || typeof rawMods !== 'object') continue;
          const outMods = out.siteModules?.[siteId];
          if (!outMods || typeof outMods !== 'object') continue;
          for (const modId of Object.keys(outMods)) {
            if (typeof rawMods[modId] === 'boolean') outMods[modId] = rawMods[modId];
          }
        }
      }
    } catch {}
    return out;
  }

  function shouldPersistNormalizedSettings(raw) {
    try {
      if (!raw || typeof raw !== 'object') return true;
      if (typeof raw.enabled !== 'boolean') return true;
      if (!raw.sites || typeof raw.sites !== 'object') return true;
      for (const key of Object.keys(DEFAULT_SETTINGS.sites)) {
        if (typeof raw.sites[key] !== 'boolean') return true;
      }
      if (!raw.scrollLockDefaults || typeof raw.scrollLockDefaults !== 'object') return true;
      for (const key of Object.keys(DEFAULT_SETTINGS.scrollLockDefaults)) {
        if (typeof raw.scrollLockDefaults[key] !== 'boolean') return true;
      }
      if (!raw.siteModules || typeof raw.siteModules !== 'object') return true;
      for (const siteId of Object.keys(DEFAULT_SETTINGS.siteModules)) {
        const expectedMods = DEFAULT_SETTINGS.siteModules?.[siteId];
        if (!expectedMods || typeof expectedMods !== 'object') continue;
        const rawMods = raw.siteModules?.[siteId];
        if (!rawMods || typeof rawMods !== 'object') return true;
        for (const modId of Object.keys(expectedMods)) {
          if (typeof rawMods[modId] !== 'boolean') return true;
        }
      }
      return false;
    } catch {
      return true;
    }
  }

  async function getSettings() {
    try {
      const raw = await new Promise((resolve) => {
        try {
          chrome.storage.local.get({ [SETTINGS_KEY]: null }, (items) => resolve(items[SETTINGS_KEY]));
        } catch {
          resolve(null);
        }
      });
      const normalized = normalizeSettings(raw);
      if (shouldPersistNormalizedSettings(raw)) {
        await new Promise((resolve) => {
          try {
            chrome.storage.local.set({ [SETTINGS_KEY]: normalized }, () => resolve());
          } catch {
            resolve();
          }
        });
      }
      return normalized;
    } catch {
      return normalizeSettings(null);
    }
  }

  async function setSettings(next) {
    const normalized = normalizeSettings(next);
    await new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [SETTINGS_KEY]: normalized }, () => resolve());
      } catch {
        resolve();
      }
    });
    return normalized;
  }

  let factoryResetRunning = false;

  async function clearDnrDynamicAndSessionRules() {
    const api = chrome?.declarativeNetRequest;
    if (!api || typeof api.getDynamicRules !== 'function' || typeof api.updateDynamicRules !== 'function') return;

    const dynamic = await new Promise((resolve) => {
      try {
        api.getDynamicRules((rules) => resolve(Array.isArray(rules) ? rules : []));
      } catch {
        resolve([]);
      }
    });
    if (dynamic.length) {
      await new Promise((resolve) => {
        try {
          api.updateDynamicRules({ removeRuleIds: dynamic.map((r) => r.id) }, () => resolve());
        } catch {
          resolve();
        }
      });
    }

    if (typeof api.getSessionRules !== 'function' || typeof api.updateSessionRules !== 'function') return;
    const session = await new Promise((resolve) => {
      try {
        api.getSessionRules((rules) => resolve(Array.isArray(rules) ? rules : []));
      } catch {
        resolve([]);
      }
    });
    if (session.length) {
      await new Promise((resolve) => {
        try {
          api.updateSessionRules({ removeRuleIds: session.map((r) => r.id) }, () => resolve());
        } catch {
          resolve();
        }
      });
    }
  }

  async function unregisterAllContentScripts() {
    if (!chrome?.scripting?.unregisterContentScripts) return;
    await new Promise((resolve) => {
      try {
        chrome.scripting.unregisterContentScripts({}, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  async function clearStorageArea(area) {
    if (!area || typeof area.clear !== 'function') return;
    await new Promise((resolve) => {
      try {
        area.clear(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  async function clearExtensionCaches() {
    try {
      if (!globalThis.caches || typeof globalThis.caches.keys !== 'function') return;
      const keys = await globalThis.caches.keys();
      await Promise.all(keys.map((k) => globalThis.caches.delete(k)));
    } catch {}
  }

  async function clearExtensionIndexedDb() {
    try {
      if (!globalThis.indexedDB || typeof globalThis.indexedDB.databases !== 'function') return;
      const dbs = await globalThis.indexedDB.databases();
      const names = Array.isArray(dbs) ? dbs.map((d) => d?.name).filter(Boolean) : [];
      await Promise.all(
        names.map(
          (name) =>
            new Promise((resolve) => {
              try {
                const req = globalThis.indexedDB.deleteDatabase(name);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
                req.onblocked = () => resolve(false);
              } catch {
                resolve(false);
              }
            }),
        ),
      );
    } catch {}
  }

  async function factoryResetAllData() {
    // Order matters: unregister first to stop any persisted content scripts.
    await unregisterAllContentScripts();
    await clearDnrDynamicAndSessionRules();

    // Best-effort cleanup for extension origin caches/DBs.
    await clearExtensionCaches();
    await clearExtensionIndexedDb();

    // Storage: clear everything so the extension starts like a fresh profile.
    await clearStorageArea(chrome?.storage?.session);
    await clearStorageArea(chrome?.storage?.local);
    await clearStorageArea(chrome?.storage?.sync);

    try {
      chrome.alarms.clearAll(() => void chrome.runtime.lastError);
    } catch {}
  }

  const KNOWN_SITE_IDS = (() => {
    try {
      const out = new Set();
      const sites = DEFAULT_SETTINGS?.sites && typeof DEFAULT_SETTINGS.sites === 'object' ? DEFAULT_SETTINGS.sites : {};
      for (const k of Object.keys(sites)) out.add(k);
      return out;
    } catch {
      return new Set();
    }
  })();

  const KNOWN_SITE_MODULE_KEYS = (() => {
    try {
      const out = new Map();
      const siteModules =
        DEFAULT_SETTINGS?.siteModules && typeof DEFAULT_SETTINGS.siteModules === 'object' ? DEFAULT_SETTINGS.siteModules : {};
      for (const siteId of Object.keys(siteModules)) {
        const mods = siteModules?.[siteId];
        if (!mods || typeof mods !== 'object') continue;
        out.set(siteId, new Set(Object.keys(mods)));
      }
      return out;
    } catch {
      return new Map();
    }
  })();

  function applySettingsPatchOps(current, patch) {
    const base = current && typeof current === 'object' ? current : normalizeSettings(null);
    const next = deepCloneJsonSafe(base);

    if (!next || typeof next !== 'object') return base;
    if (!next.sites || typeof next.sites !== 'object') next.sites = {};
    if (!next.scrollLockDefaults || typeof next.scrollLockDefaults !== 'object') next.scrollLockDefaults = {};
    if (!next.siteModules || typeof next.siteModules !== 'object') next.siteModules = {};

    const ops = Array.isArray(patch) ? patch : [];
    for (const op of ops) {
      const type = String(op?.op || 'set');
      if (type !== 'set') continue;
      const path = Array.isArray(op?.path) ? op.path.map((x) => String(x || '')) : [];
      if (!path.length) continue;

      if (path.length === 1 && path[0] === 'enabled') {
        if (typeof op.value === 'boolean') next.enabled = op.value;
        continue;
      }

      if (path.length === 2 && path[0] === 'sites') {
        const siteId = path[1];
        if (!KNOWN_SITE_IDS.has(siteId)) continue;
        if (typeof op.value === 'boolean') next.sites[siteId] = op.value;
        continue;
      }

      if (path.length === 2 && path[0] === 'scrollLockDefaults') {
        const siteId = path[1];
        if (!KNOWN_SITE_IDS.has(siteId)) continue;
        if (typeof op.value === 'boolean') next.scrollLockDefaults[siteId] = op.value;
        continue;
      }

      if (path.length === 3 && path[0] === 'siteModules') {
        const siteId = path[1];
        const key = path[2];
        if (!KNOWN_SITE_IDS.has(siteId)) continue;
        const allow = KNOWN_SITE_MODULE_KEYS.get(siteId);
        if (!allow || !allow.has(key)) continue;
        if (typeof op.value === 'boolean') {
          if (!next.siteModules[siteId] || typeof next.siteModules[siteId] !== 'object') next.siteModules[siteId] = {};
          next.siteModules[siteId][key] = op.value;
        }
        continue;
      }
    }

    return next;
  }

  function isExtensionPageSender(sender) {
    try {
      const url = typeof sender?.url === 'string' ? sender.url : '';
      if (!url) return false;
      const base = chrome?.runtime?.getURL?.('') || '';
      return !!(base && url.startsWith(base));
    } catch {
      return false;
    }
  }

  function isModuleEnabled(settings, siteId, moduleId) {
    if (!settings?.enabled) return false;
    if (settings?.sites?.[siteId] === false) return false;
    const mods = settings?.siteModules?.[siteId];
    if (!mods || typeof mods !== 'object') return moduleId === 'quicknav';
    if (typeof mods[moduleId] === 'boolean') return mods[moduleId];
    return DEFAULT_SETTINGS.siteModules?.[siteId]?.[moduleId] === true;
  }

  function getEnabledContentScriptDefs(settings) {
    if (!settings?.enabled) return [];
    const out = [];
    for (const d of CONTENT_SCRIPT_DEFS) {
      if (!isModuleEnabled(settings, d.siteId, d.moduleId)) continue;
      out.push(d);
    }
    return out;
  }

  const URL_PATTERN_RE_CACHE = new Map();
  function compileUrlPattern(pattern) {
    if (URL_PATTERN_RE_CACHE.has(pattern)) return URL_PATTERN_RE_CACHE.get(pattern);
    const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp(`^${escaped}$`);
    URL_PATTERN_RE_CACHE.set(pattern, re);
    return re;
  }

  function urlMatchesAny(url, patterns) {
    if (!url || typeof url !== 'string') return false;
    if (!Array.isArray(patterns) || !patterns.length) return false;
    for (const p of patterns) {
      if (!p || typeof p !== 'string') continue;
      try {
        if (compileUrlPattern(p).test(url)) return true;
      } catch {}
    }
    return false;
  }

  function injectContentScriptDefsIntoTab(tabId, defs) {
    if (!Number.isFinite(tabId)) return;
    if (!Array.isArray(defs) || !defs.length) return;

    for (const rule of defs) {
      try {
        if (rule.css?.length) {
          chrome.scripting.insertCSS(
            {
              target: { tabId, ...(rule.allFrames ? { allFrames: true } : {}) },
              files: rule.css
            },
            () => void chrome.runtime.lastError
          );
        }
        chrome.scripting.executeScript(
          {
            target: { tabId, ...(rule.allFrames ? { allFrames: true } : {}) },
            files: rule.js,
            ...(rule.world ? { world: rule.world } : {})
          },
          () => void chrome.runtime.lastError
        );
      } catch {}
    }
  }

  function injectContentScriptDefsIntoMatchingTabs(defs) {
    if (!Array.isArray(defs) || !defs.length) return;

    for (const rule of defs) {
      try {
        chrome.tabs.query({ url: rule.matches }, (tabs) => {
          const err = chrome.runtime.lastError;
          if (err) return;
          for (const tab of tabs || []) {
            const tabId = tab && tab.id;
            if (!Number.isFinite(tabId)) continue;
            try {
              if (rule.css?.length) {
                chrome.scripting.insertCSS(
                  {
                    target: { tabId, ...(rule.allFrames ? { allFrames: true } : {}) },
                    files: rule.css
                  },
                  () => void chrome.runtime.lastError
                );
              }
              chrome.scripting.executeScript(
                {
                  target: { tabId, ...(rule.allFrames ? { allFrames: true } : {}) },
                  files: rule.js,
                  ...(rule.world ? { world: rule.world } : {})
                },
                () => void chrome.runtime.lastError
              );
            } catch {}
          }
        });
      } catch {}
    }
  }

  function reinjectContentScripts(settings) {
    try {
      const now = Date.now();
      // 避免 service worker 被唤醒时反复注入
      if (now - lastReinjectAt < 2000) return;
      lastReinjectAt = now;
    } catch {}

    for (const rule of getEnabledContentScriptDefs(settings)) {
      try {
        chrome.tabs.query({ url: rule.matches }, (tabs) => {
          const err = chrome.runtime.lastError;
          if (err) return;
          for (const tab of tabs || []) {
            const tabId = tab && tab.id;
            if (!Number.isFinite(tabId)) continue;
            try {
              if (rule.css?.length) {
                chrome.scripting.insertCSS(
                  {
                    target: { tabId, ...(rule.allFrames ? { allFrames: true } : {}) },
                    files: rule.css
                  },
                  () => void chrome.runtime.lastError
                );
              }
              chrome.scripting.executeScript(
                {
                  target: { tabId, ...(rule.allFrames ? { allFrames: true } : {}) },
                  files: rule.js,
                  ...(rule.world ? { world: rule.world } : {})
                },
                () => void chrome.runtime.lastError
              );
            } catch {}
          }
        });
      } catch {}
    }
  }

  function scheduleReinject() {
    try {
      // allow callers to pass latest settings via scheduleReinject(settings)
      if (arguments.length && arguments[0]) pendingReinjectSettings = arguments[0];
    } catch {}
    if (reinjectScheduled) return;
    reinjectScheduled = true;
    try {
      queueMicrotask(async () => {
        reinjectScheduled = false;
        const settings = pendingReinjectSettings || (await getSettings());
        pendingReinjectSettings = null;
        reinjectContentScripts(settings);
      });
    } catch {
      Promise.resolve()
        .then(async () => {
          reinjectScheduled = false;
          const settings = pendingReinjectSettings || (await getSettings());
          pendingReinjectSettings = null;
          reinjectContentScripts(settings);
        })
        .catch(() => {
          reinjectScheduled = false;
          pendingReinjectSettings = null;
        });
    }
  }

  async function getRegisteredQuickNavContentScripts() {
    try {
      const scripts = await new Promise((resolve) => {
        try {
          chrome.scripting.getRegisteredContentScripts((items) => resolve(items || []));
        } catch {
          resolve([]);
        }
      });
      const out = [];
      for (const s of scripts || []) {
        const id = s && typeof s.id === 'string' ? s.id : '';
        if (id && QUICKNAV_CONTENT_SCRIPT_IDS.includes(id)) out.push(s);
      }
      return out;
    } catch {
      return [];
    }
  }

  function normalizeWorld(input) {
    return input === 'MAIN' ? 'MAIN' : 'ISOLATED';
  }

  function normalizeRunAt(input) {
    return input === 'document_start' || input === 'document_idle' || input === 'document_end' ? input : 'document_end';
  }

  function normalizeStringArray(input) {
    if (!Array.isArray(input)) return [];
    return input.filter((x) => typeof x === 'string' && x);
  }

  function normalizeMatchPatterns(input) {
    const arr = normalizeStringArray(input);
    // `matches` order is not semantically meaningful; Chrome may return patterns in a different order.
    // Sort to keep registration comparison stable and avoid needless unregister/register + reinject cycles.
    try {
      arr.sort();
    } catch {}
    return arr;
  }

  function contentScriptDefToRegistration(def) {
    return {
      id: def.id,
      matches: normalizeMatchPatterns(def.matches),
      js: normalizeStringArray(def.js),
      css: normalizeStringArray(def.css),
      runAt: normalizeRunAt(def.runAt),
      allFrames: !!def.allFrames,
      world: normalizeWorld(def.world)
    };
  }

  function registeredContentScriptToComparable(reg) {
    return {
      id: typeof reg?.id === 'string' ? reg.id : '',
      matches: normalizeMatchPatterns(reg?.matches),
      js: normalizeStringArray(reg?.js),
      css: normalizeStringArray(reg?.css),
      runAt: normalizeRunAt(reg?.runAt),
      allFrames: !!reg?.allFrames,
      world: normalizeWorld(reg?.world)
    };
  }

  function arraysEqual(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function isSameContentScriptRegistration(registered, desired) {
    try {
      if (!registered || !desired) return false;
      return (
        registered.id === desired.id &&
        arraysEqual(registered.matches, desired.matches) &&
        arraysEqual(registered.js, desired.js) &&
        arraysEqual(registered.css, desired.css) &&
        registered.runAt === desired.runAt &&
        registered.allFrames === desired.allFrames &&
        registered.world === desired.world
      );
    } catch {
      return false;
    }
  }

  async function applyContentScriptRegistration(settings) {
    const enabledDefs = getEnabledContentScriptDefs(settings);
    const desired = new Map(enabledDefs.map((d) => [d.id, contentScriptDefToRegistration(d)]));

    const registeredScripts = await getRegisteredQuickNavContentScripts();
    const registered = new Map(registeredScripts.map((s) => [s.id, registeredContentScriptToComparable(s)]));

    const unregisterIds = new Set();
    const registerItems = [];

    // Remove scripts that no longer exist or are disabled.
    for (const [id] of registered) {
      if (!desired.has(id)) unregisterIds.add(id);
    }

    // Add scripts that are missing, or update scripts whose registration changed.
    for (const [id, desiredItem] of desired) {
      const regItem = registered.get(id);
      if (!regItem) {
        registerItems.push(desiredItem);
        continue;
      }
      if (!isSameContentScriptRegistration(regItem, desiredItem)) {
        unregisterIds.add(id);
        registerItems.push(desiredItem);
      }
    }

    const result = { registeredIds: registerItems.map((d) => d.id), unregisteredIds: Array.from(unregisterIds) };

    if (unregisterIds.size) {
      await new Promise((resolve) => {
        try {
          chrome.scripting.unregisterContentScripts({ ids: Array.from(unregisterIds) }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        } catch {
          resolve();
        }
      });
    }

    if (!registerItems.length) return result;

    await new Promise((resolve, reject) => {
      try {
        chrome.scripting.registerContentScripts(
          registerItems.map((d) => ({
            id: d.id,
            matches: d.matches,
            js: d.js,
            ...(d.css?.length ? { css: d.css } : {}),
            runAt: d.runAt,
            ...(d.allFrames ? { allFrames: true } : {}),
            ...(d.world !== 'ISOLATED' ? { world: d.world } : {})
          })),
          () => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message || String(err)));
            else resolve();
          }
        );
      } catch (e) {
        reject(e);
      }
    });

    return result;
  }

  let applyChain = Promise.resolve();

  // Serialize settings mutations to avoid lost updates when multiple extension pages
  // (popup/options) update settings concurrently.
  let settingsMutationChain = Promise.resolve();
  function runSettingsMutation(fn) {
    settingsMutationChain = settingsMutationChain
      .catch(() => void 0)
      .then(() => fn());
    return settingsMutationChain;
  }

  function applySettingsAndRegister(settings) {
    applyChain = applyChain
      .catch(() => void 0)
      .then(async () => {
        const reg = await applyContentScriptRegistration(settings);
        return reg;
      });
    return applyChain;
  }

  function applySettingsAndInjectRegistered(settings) {
    applyChain = applyChain
      .catch(() => void 0)
      .then(async () => {
        const reg = await applyContentScriptRegistration(settings);
        try {
          const ids = Array.isArray(reg?.registeredIds) ? reg.registeredIds : [];
          if (!ids.length) return reg;

          const allow = new Set(ids);
          const enabled = getEnabledContentScriptDefs(settings);
          const defs = enabled.filter((d) => allow.has(d.id));
          injectContentScriptDefsIntoMatchingTabs(defs);
        } catch {}
        return reg;
      });
    return applyChain;
  }

  function applySettingsAndReinject(settings) {
    applyChain = applyChain
      .catch(() => void 0)
      .then(async () => {
        const reg = await applyContentScriptRegistration(settings);
        scheduleReinject(settings);
        return reg;
      });
    return applyChain;
  }

  function ensureMainWorldScrollGuard(tabId, sendResponse) {
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: [MAIN_GUARD_FILE],
          world: 'MAIN'
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) sendResponse({ ok: false, error: err.message || String(err) });
          else sendResponse({ ok: true });
        }
      );
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // === OpenAI model icon monitor (configurable) ===
  const GPT53_MONITOR = Object.freeze({
    defaultUrls: Object.freeze(['https://cdn.openai.com/API/docs/images/model-page/model-icons/gpt-5.3.png']),
    alarmName: 'quicknav_gpt53_probe',
    intervalMin: 5,
    urlsKey: 'quicknav_gpt53_probe_urls_v1',
    storageKey: 'quicknav_gpt53_probe_state_v1',
    alertKey: 'quicknav_gpt53_probe_alerts_v1',
    notifyId: 'quicknav_gpt53_available',
    badgeBg: '#ed5284'
  });

  async function getGpt53Alerts() {
    try {
      const raw = await new Promise((resolve) => {
        try {
          chrome.storage.local.get({ [GPT53_MONITOR.alertKey]: null }, (items) => resolve(items[GPT53_MONITOR.alertKey]));
        } catch {
          resolve(null);
        }
      });
      if (!raw || typeof raw !== 'object') return { unread: 0, events: [] };
      const unread = Number(raw.unread) || 0;
      const events = Array.isArray(raw.events) ? raw.events.filter((x) => x && typeof x === 'object') : [];
      return {
        unread: Math.max(0, Math.min(99, unread)),
        events: events
          .map((e) => ({
            at: Number(e.at) || 0,
            url: String(e.url || ''),
            status: Number(e.status) || 0
          }))
          .filter((e) => e.at && e.url)
      };
    } catch {
      return { unread: 0, events: [] };
    }
  }

  async function setGpt53Alerts(next) {
    try {
      const v = next && typeof next === 'object' ? next : { unread: 0, events: [] };
      await new Promise((resolve) => {
        try {
          chrome.storage.local.set({ [GPT53_MONITOR.alertKey]: v }, () => resolve());
        } catch {
          resolve();
        }
      });
    } catch {}
  }

  function setActionBadge(unread) {
    const n = Number(unread) || 0;
    const text = n > 0 ? String(Math.min(99, n)) : '';
    try {
      if (chrome?.action?.setBadgeBackgroundColor) chrome.action.setBadgeBackgroundColor({ color: GPT53_MONITOR.badgeBg });
    } catch {}
    try {
      if (chrome?.action?.setBadgeText) chrome.action.setBadgeText({ text });
    } catch {}
  }

  async function syncGpt53Badge() {
    try {
      const alerts = await getGpt53Alerts();
      setActionBadge(alerts.unread);
    } catch {}
  }

  async function markGpt53AlertsRead() {
    try {
      const alerts = await getGpt53Alerts();
      if (!alerts.unread) return alerts;
      const next = { ...alerts, unread: 0 };
      await setGpt53Alerts(next);
      setActionBadge(0);
      return next;
    } catch {
      setActionBadge(0);
      return { unread: 0, events: [] };
    }
  }

  function broadcastGpt53Alert(payload) {
    try {
      chrome.runtime.sendMessage({ type: 'QUICKNAV_GPT53_ALERT', payload }, () => void chrome.runtime.lastError);
    } catch {}
  }

  function formatGpt53AlertLine(ev) {
    try {
      const url = String(ev?.url || '');
      const status = Number(ev?.status) || 0;
      const u = new URL(url);
      const name = String(u.pathname || '').split('/').filter(Boolean).slice(-1)[0] || u.hostname;
      return status ? `${name}（${status}）` : name;
    } catch {
      const status = Number(ev?.status) || 0;
      return status ? `（${status}）` : '';
    }
  }

  function buildGpt53AlertMessage(alerts) {
    const events = Array.isArray(alerts?.events) ? alerts.events : [];
    if (!events.length) return '';
    const last = events.slice(-3);
    const parts = last.map((x) => formatGpt53AlertLine(x)).filter(Boolean);
    const more = events.length > 3 ? `…+${events.length - 3}` : '';
    return parts.length ? `${parts.join('，')}${more}` : '';
  }

  function normalizeGpt53ProbeUrls(input) {
    const rawLines = (() => {
      if (Array.isArray(input)) return input;
      if (typeof input === 'string') return input.split(/\r?\n/);
      return [];
    })();

    const out = [];
    const seen = new Set();
    for (const line of rawLines) {
      const raw = String(line || '').trim();
      if (!raw) continue;
      if (raw.startsWith('#')) continue;
      let url = '';
      try {
        const u = new URL(raw);
        if (u.protocol !== 'https:') continue;
        // Keep this scoped to existing host_permissions to avoid broad permission prompts.
        // Users can still edit the path/query to probe different model icon URLs.
        if (String(u.hostname || '').toLowerCase() !== 'cdn.openai.com') continue;
        u.hash = '';
        url = u.href;
      } catch {
        url = '';
      }
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
      if (out.length >= 20) break;
    }
    return out.length ? out : [...GPT53_MONITOR.defaultUrls];
  }

  async function getGpt53Urls() {
    try {
      const raw = await new Promise((resolve) => {
        try {
          chrome.storage.local.get({ [GPT53_MONITOR.urlsKey]: null }, (items) => resolve(items[GPT53_MONITOR.urlsKey]));
        } catch {
          resolve(null);
        }
      });
      return normalizeGpt53ProbeUrls(raw);
    } catch {
      return [...GPT53_MONITOR.defaultUrls];
    }
  }

  async function setGpt53Urls(next) {
    try {
      const urls = normalizeGpt53ProbeUrls(next);
      await new Promise((resolve) => {
        try {
          chrome.storage.local.set({ [GPT53_MONITOR.urlsKey]: urls }, () => resolve());
        } catch {
          resolve();
        }
      });
      return urls;
    } catch {
      return [...GPT53_MONITOR.defaultUrls];
    }
  }

  async function getGpt53State() {
    try {
      const raw = await new Promise((resolve) => {
        try {
          chrome.storage.local.get({ [GPT53_MONITOR.storageKey]: null }, (items) => resolve(items[GPT53_MONITOR.storageKey]));
        } catch {
          resolve(null);
        }
      });
      // Backward compatibility: old versions stored `{ available, status, checkedAt, error? }`.
      if (raw && typeof raw === 'object') {
        const isLegacy = Object.prototype.hasOwnProperty.call(raw, 'available') && Object.prototype.hasOwnProperty.call(raw, 'status');
        if (isLegacy) {
          const url = GPT53_MONITOR.defaultUrls[0];
          return {
            checkedAt: Number(raw.checkedAt) || 0,
            items: {
              [url]: {
                available: !!raw.available,
                status: Number(raw.status) || 0,
                checkedAt: Number(raw.checkedAt) || 0,
                error: typeof raw.error === 'string' ? raw.error : ''
              }
            }
          };
        }
        return raw;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function setGpt53State(next) {
    try {
      await new Promise((resolve) => {
        try {
          chrome.storage.local.set({ [GPT53_MONITOR.storageKey]: next || null }, () => resolve());
        } catch {
          resolve();
        }
      });
    } catch {}
  }

  async function fetchUrlStatus(url) {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return res?.status || 0;
    } catch {}
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Range: 'bytes=0-0' }
      });
      return res?.status || 0;
    } catch {}
    return 0;
  }

  async function runGpt53Probe() {
    try {
      const settings = await getSettings();
      if (settings && settings.enabled === false) return;
    } catch {}

    const urls = await getGpt53Urls();
    const checkedAt = Date.now();

    const prev = await getGpt53State();
    const prevItems = prev && typeof prev === 'object' && prev.items && typeof prev.items === 'object' ? prev.items : {};

    const nextItems = {};
    const availableNow = [];

    for (const url of urls) {
      const prevAvailable = !!prevItems?.[url]?.available;
      const status = await fetchUrlStatus(url);
      if (!status) {
        nextItems[url] = { available: prevAvailable, status: 0, checkedAt, error: 'fetch_failed' };
        if (prevAvailable) availableNow.push({ url, status: 0 });
        continue;
      }
      const available = status !== 404;
      nextItems[url] = { available, status, checkedAt, error: '' };
      if (available) availableNow.push({ url, status });
    }

    await setGpt53State({ checkedAt, items: nextItems });

    try {
      // Keep alerts as "current availability" (not a one-shot event stream).
      const events = availableNow
        .map((it) => ({ at: checkedAt, url: String(it.url || ''), status: Number(it.status) || 0 }))
        .filter((e) => e.at && e.url)
        .slice(-50);
      const unread = Math.max(0, Math.min(99, availableNow.length));
      const nextAlerts = { unread, events };
      await setGpt53Alerts(nextAlerts);
      setActionBadge(unread);

      if (!availableNow.length) return;

      const msg = buildGpt53AlertMessage(nextAlerts);
      const title = 'OpenAI 新模型提示';

      // System notification (best-effort).
      // NOTE: intentionally notify every probe while resources remain available so users won't miss it.
      try {
        chrome.notifications.create(`${GPT53_MONITOR.notifyId}_${checkedAt}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title,
          message:
            availableNow.length === 1
              ? `检测到资源可访问：${formatGpt53AlertLine({ url: availableNow[0]?.url, status: availableNow[0]?.status })}`
              : `检测到 ${availableNow.length} 个资源可访问：${msg}`,
          priority: 2
        });
      } catch {}

      // In-extension alert (Options / Popup).
      broadcastGpt53Alert({ title, message: msg, unread, checkedAt });
    } catch {}
  }

  async function getGpt53Alarm() {
    try {
      return await new Promise((resolve) => {
        try {
          chrome.alarms.get(GPT53_MONITOR.alarmName, (alarm) => resolve(alarm || null));
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  }

  async function ensureGpt53Alarm() {
    try {
      const existing = await getGpt53Alarm();
      if (existing && Number(existing.periodInMinutes) === GPT53_MONITOR.intervalMin) return existing;
    } catch {}

    try {
      chrome.alarms.create(GPT53_MONITOR.alarmName, { periodInMinutes: GPT53_MONITOR.intervalMin });
    } catch {}

    return await getGpt53Alarm();
  }

  try {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm?.name !== GPT53_MONITOR.alarmName) return;
      void runGpt53Probe();
    });
  } catch {}

  // Restore badge state when the service worker wakes.
  void syncGpt53Badge();
  // Keep the 5-minute polling alive even if the user never opens Options/Popup.
  void (async () => {
    try {
      await ensureGpt53Alarm();
    } catch {}
    // Prime state once (best-effort) so the UI shows meaningful data immediately.
    try {
      const state = await getGpt53State();
      const checkedAt = Number(state?.checkedAt) || 0;
      if (!checkedAt) await runGpt53Probe();
    } catch {}
  })();

  try {
    // For service-worker DevTools console: `__quicknavGpt53Probe.run()`
    globalThis.__quicknavGpt53Probe = {
      defaultUrls: GPT53_MONITOR.defaultUrls,
      urls: () => getGpt53Urls(),
      setUrls: (urls) => setGpt53Urls(urls),
      run: () => runGpt53Probe(),
      state: () => getGpt53State(),
      alerts: () => getGpt53Alerts(),
      markRead: () => markGpt53AlertsRead()
    };
  } catch {}

  // === Dev-only smoke tests (not exposed in UI) ===
  const DEV_SMOKE_TARGETS = [
    { id: 'chatgpt', url: 'https://chatgpt.com/' },
    { id: 'kimi', url: 'https://kimi.com/' },
    { id: 'gemini_app', url: 'https://gemini.google.com/app' },
    { id: 'gemini_business', url: 'https://business.gemini.google/' },
    { id: 'grok', url: 'https://grok.com/' },
    { id: 'deepseek', url: 'https://chat.deepseek.com/' },
    { id: 'zai', url: 'https://chat.z.ai/' },
    { id: 'qwen', url: 'https://chat.qwen.ai/' },
    { id: 'ernie', url: 'https://ernie.baidu.com/' },
    { id: 'genspark', url: 'https://www.genspark.ai/' }
  ];

  function normalizeDevSmokeTargetIds(value) {
    try {
      if (!value) return [];
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (Array.isArray(value)) {
        return value.map((s) => String(s || '').trim()).filter(Boolean);
      }
    } catch {}
    return [];
  }

  function resolveDevSmokeTargets(options) {
    const ids = normalizeDevSmokeTargetIds(options?.targets || options?.ids || options?.only);
    if (!ids.length) return DEV_SMOKE_TARGETS;
    const allow = new Set(ids);
    return DEV_SMOKE_TARGETS.filter((t) => allow.has(t.id));
  }

  function waitForTabComplete(tabId, timeoutMs) {
    const timeout = Math.max(2000, Number(timeoutMs) || 25000);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err, tab) => {
        if (done) return;
        done = true;
        try { chrome.tabs.onUpdated.removeListener(onUpdated); } catch {}
        try { clearTimeout(timer); } catch {}
        if (err) reject(err);
        else resolve(tab || null);
      };

      const onUpdated = (id, changeInfo, tab) => {
        try {
          if (id !== tabId) return;
          if (changeInfo && changeInfo.status === 'complete') finish(null, tab);
        } catch (e) {
          finish(e);
        }
      };
      const timer = setTimeout(() => finish(new Error('Tab load timeout')), timeout);
      try {
        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.get(tabId, (tab) => {
          void chrome.runtime.lastError;
          if (tab && tab.status === 'complete') finish(null, tab);
        });
      } catch (e) {
        finish(e);
      }
    });
  }

  function execSmokeCheck(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            world: 'ISOLATED',
            func: () => {
              const out = {
                href: (() => {
                  try {
                    return location.href;
                  } catch {
                    return '';
                  }
                })(),
                hasBridge: (() => {
                  try {
                    return typeof window.__aichat_quicknav_bridge_v1__ === 'object';
                  } catch {
                    return false;
                  }
                })(),
                hasMenuBridge: typeof window.__quicknavRegisterMenuCommand === 'function',
                navCount: 0,
                hasNav: false,
                hasLock: false,
                keysBound: false
              };
              try {
                out.navCount = document.querySelectorAll('#cgpt-compact-nav').length;
                out.hasNav = !!document.getElementById('cgpt-compact-nav');
                out.hasLock = !!document.querySelector('#cgpt-compact-nav .compact-lock');
              } catch {}
              try {
                out.keysBound = !!window.__cgptKeysBound;
              } catch {}
              return out;
            }
          },
          (res) => {
            const err = chrome.runtime.lastError;
            if (err) return resolve({ ok: false, error: err.message || String(err) });
            const v = Array.isArray(res) && res[0] ? res[0].result : null;
            resolve({ ok: true, result: v });
          }
        );
      } catch (e) {
        resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  async function runDevSmokeTests(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const closeTabs = options.closeTabs !== false;
    const timeoutMs = Math.max(2000, Number(options.timeoutMs) || 25000);
    const targets = resolveDevSmokeTargets(options);

    const summary = [];
    for (const t of targets) {
      const row = { id: t.id, url: t.url, ok: false, detail: null, error: null };
      let tabId = null;
      try {
        const tab = await new Promise((resolve) => {
          chrome.tabs.create({ url: t.url, active: false }, (tb) => {
            void chrome.runtime.lastError;
            resolve(tb || null);
          });
        });
        tabId = tab?.id;
        if (!Number.isFinite(tabId)) throw new Error('Failed to create tab');

        await waitForTabComplete(tabId, timeoutMs);
        const check = await execSmokeCheck(tabId);
        if (!check.ok) throw new Error(check.error || 'Smoke check failed');
        row.ok = true;
        row.detail = check.result;
      } catch (e) {
        row.ok = false;
        row.error = e instanceof Error ? e.message : String(e);
      } finally {
        if (closeTabs && Number.isFinite(tabId)) {
          try {
            chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
          } catch {}
        }
        summary.push(row);
      }
    }
    return summary;
  }

  try {
    // For service-worker DevTools console: `__quicknavDevSmoke.run()`
    globalThis.__quicknavDevSmoke = { run: (opts) => runDevSmokeTests(opts) };
  } catch {}

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (!msg || typeof msg !== 'object') return;
      const fromExtensionPage = isExtensionPageSender(sender);

      if (msg.type === 'QUICKNAV_MEMTEST_STATUS') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        try {
          memtestUpdateStatus(msg);
        } catch {}
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === 'QUICKNAV_MEMTEST_GUARD') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        const reason = typeof msg.reason === 'string' ? msg.reason : 'memguard';
        try {
          memtestCloseTestTab(reason);
        } catch {}
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === 'QUICKNAV_MEMTEST_ABORT') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        const reason = typeof msg.reason === 'string' ? msg.reason : 'abort';
        try {
          memtestBroadcastAbort(reason);
        } catch {}
        try {
          memtestCloseTestTab(reason);
        } catch {}
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === 'QUICKNAV_BOOTSTRAP_PING') {
	        const tabId = sender?.tab?.id;
	        const href = typeof msg.href === 'string' ? msg.href : '';
	        getSettings()
	          .then((settings) =>
	            // NOTE: `registerContentScripts` already handles normal page loads.
	            // Avoid reinjecting on every SW wake/ping (can double-run content scripts and cost memory/CPU).
	            applySettingsAndRegister(settings)
	              .catch((e) => {
	                // even if registration fails, still best-effort inject into sender tab
	                try {
	                  if (Number.isFinite(tabId) && href) {
                    const enabled = getEnabledContentScriptDefs(settings);
                    const defsForUrl = enabled.filter((d) => urlMatchesAny(href, d.matches));
                    injectContentScriptDefsIntoTab(tabId, defsForUrl);
                  }
                } catch {}
                // Return a dummy registration result so the bootstrap script won't retry ping
                // (otherwise it can trigger multiple fallback injections).
                return { registeredIds: [], unregisteredIds: [], error: e instanceof Error ? e.message : String(e) };
              })
              .then((reg) => ({ settings, reg }))
          )
          .then(({ settings, reg }) => {
            try {
              if (Number.isFinite(tabId) && href) {
                const enabled = getEnabledContentScriptDefs(settings);
                const defsForUrl = enabled.filter((d) => urlMatchesAny(href, d.matches));
                const allowIds = new Set(Array.isArray(reg?.registeredIds) ? reg.registeredIds : []);
                const defsToInject = allowIds.size ? defsForUrl.filter((d) => allowIds.has(d.id)) : [];
                // Only inject scripts that were just (re)registered; avoids double-inject on normal page loads.
                injectContentScriptDefsIntoTab(tabId, defsToInject);
              }
            } catch {}
            sendResponse({ ok: true, settings });
          })
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_BOOTSTRAP_ENSURE') {
        // Called by the manifest bootstrap content script as a safety net: inject enabled modules into *this* tab
        // if dynamic scripts didn't run for some reason (SW restart edge cases / tab restore oddities).
        const tabId = sender?.tab?.id;
        const href = typeof msg.href === 'string' ? msg.href : typeof sender?.url === 'string' ? sender.url : '';
        if (!Number.isFinite(tabId) || !href) {
          sendResponse({ ok: false, error: 'No tabId/href' });
          return true;
        }
        getSettings()
          .then((settings) =>
            // Keep registrations up-to-date (future loads) but inject only into the sender tab (lightweight).
            applySettingsAndRegister(settings).catch(() => ({ registeredIds: [], unregisteredIds: [] })).then(() => settings)
          )
          .then((settings) => {
            try {
              const enabled = getEnabledContentScriptDefs(settings);
              const defsForUrl = enabled.filter((d) => urlMatchesAny(href, d.matches));
              injectContentScriptDefsIntoTab(tabId, defsForUrl);
            } catch {}
            sendResponse({ ok: true });
          })
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_NOTIFY') {
        // Best-effort notification helper (used by content scripts for warnings).
        try {
          const title = typeof msg.title === 'string' ? msg.title : '';
          const message = typeof msg.message === 'string' ? msg.message : '';
          if (!title || !message) {
            sendResponse({ ok: false, error: 'Missing title/message' });
            return true;
          }
          const notifyId = typeof msg.id === 'string' && msg.id ? msg.id : `quicknav_notify_${Date.now()}`;
          chrome.notifications.create(notifyId, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: title.slice(0, 64),
            message: message.slice(0, 256),
            priority: 1
          });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        return true;
      }

      if (msg.type === 'QUICKNAV_GET_SETTINGS') {
        getSettings().then((settings) => sendResponse({ ok: true, settings })).catch(() => sendResponse({ ok: true, settings: normalizeSettings(null) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_SET_SETTINGS') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        runSettingsMutation(async () => {
          const settings = await setSettings(msg.settings);
          if (msg && msg.noInject) await applySettingsAndRegister(settings);
          else await applySettingsAndInjectRegistered(settings);
          return settings;
        })
          .then((settings) => sendResponse({ ok: true, settings }))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_PATCH_SETTINGS') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        runSettingsMutation(async () => {
          const current = await getSettings();
          const patched = applySettingsPatchOps(current, msg.patch);
          const settings = await setSettings(patched);
          if (msg && msg.noInject) await applySettingsAndRegister(settings);
          else await applySettingsAndInjectRegistered(settings);
          return settings;
        })
          .then((settings) => sendResponse({ ok: true, settings }))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_RESET_DEFAULTS') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        runSettingsMutation(async () => {
          const settings = await setSettings(DEFAULT_SETTINGS);
          if (msg && msg.noInject) await applySettingsAndRegister(settings);
          else await applySettingsAndInjectRegistered(settings);
          return settings;
        })
          .then((settings) => sendResponse({ ok: true, settings }))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_FACTORY_RESET') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        if (factoryResetRunning) {
          sendResponse({ ok: false, error: 'busy' });
          return true;
        }

        factoryResetRunning = true;
        (async () => {
          await factoryResetAllData();
          sendResponse({ ok: true });
          setTimeout(() => {
            try {
              chrome.runtime.reload();
            } catch {}
          }, 120);
        })()
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }))
          .finally(() => {
            factoryResetRunning = false;
          });
        return true;
      }

      if (msg.type === 'QUICKNAV_REINJECT_NOW') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        getSettings()
          .then((settings) => {
            reinjectContentScripts(settings);
            return settings;
          })
          .then((settings) => sendResponse({ ok: true, settings }))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_GPT53_GET_STATUS') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        (async () => {
          const alarm = await ensureGpt53Alarm();
          const urls = await getGpt53Urls();
          const state = await getGpt53State();
          const alerts = await getGpt53Alerts();
          let enabled = true;
          try {
            const settings = await getSettings();
            if (settings && settings.enabled === false) enabled = false;
          } catch {}
          return {
            ok: true,
            enabled,
            urls,
            url: urls[0] || GPT53_MONITOR.defaultUrls[0] || '',
            alarm,
            state,
            alerts: { unread: alerts.unread, events: alerts.events.slice(-20) },
            now: Date.now()
          };
        })()
          .then((resp) => sendResponse(resp))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_GPT53_SET_URLS') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        (async () => {
          const urls = await setGpt53Urls(msg?.urlsText ?? msg?.urls ?? null);
          const alarm = await ensureGpt53Alarm();
          const state = await getGpt53State();
          const alerts = await getGpt53Alerts();
          let enabled = true;
          try {
            const settings = await getSettings();
            if (settings && settings.enabled === false) enabled = false;
          } catch {}
          return {
            ok: true,
            enabled,
            urls,
            url: urls[0] || GPT53_MONITOR.defaultUrls[0] || '',
            alarm,
            state,
            alerts: { unread: alerts.unread, events: alerts.events.slice(-20) },
            now: Date.now()
          };
        })()
          .then((resp) => sendResponse(resp))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_GPT53_RUN') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        (async () => {
          const alarm = await ensureGpt53Alarm();
          await runGpt53Probe();
          const urls = await getGpt53Urls();
          const state = await getGpt53State();
          const alerts = await getGpt53Alerts();
          let enabled = true;
          try {
            const settings = await getSettings();
            if (settings && settings.enabled === false) enabled = false;
          } catch {}
          return {
            ok: true,
            enabled,
            urls,
            url: urls[0] || GPT53_MONITOR.defaultUrls[0] || '',
            alarm,
            state,
            alerts: { unread: alerts.unread, events: alerts.events.slice(-20) },
            now: Date.now()
          };
        })()
          .then((resp) => sendResponse(resp))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_GPT53_MARK_READ') {
        if (!fromExtensionPage) {
          sendResponse({ ok: false, error: 'forbidden' });
          return true;
        }
        (async () => {
          const alerts = await markGpt53AlertsRead();
          return { ok: true, alerts: { unread: alerts.unread, events: alerts.events.slice(-20) }, now: Date.now() };
        })()
          .then((resp) => sendResponse(resp))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type !== 'QUICKNAV_ENSURE_SCROLL_GUARD') return;
      const tabId = sender?.tab?.id;
      if (!Number.isFinite(tabId)) return sendResponse({ ok: false, error: 'No tabId' });
      ensureMainWorldScrollGuard(tabId, sendResponse);
      return true;
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  });

  // 扩展重新加载/更新时，把内容脚本注入到已打开的匹配标签页里（便于开发时只点“重新加载”即可生效）
      try {
	        chrome.runtime.onInstalled.addListener(() => {
	          getSettings().then((settings) => applySettingsAndReinject(settings)).catch(() => scheduleReinject());
          void ensureGpt53Alarm();
	          void runGpt53Probe();
	        });
	        chrome.runtime.onStartup?.addListener(() => {
	          // On browser startup, restored tabs will load normally and trigger registered content scripts.
	          // Avoid reinject here to prevent double-inject on session restore.
	          getSettings().then((settings) => applySettingsAndRegister(settings)).catch(() => void 0);
          void ensureGpt53Alarm();
	        });
	        // Service worker may wake up frequently (e.g. from page pings).
	        // Keep registrations up-to-date but avoid reinjecting on every wake.
	        getSettings().then((settings) => applySettingsAndRegister(settings)).catch(() => void 0);
        void ensureGpt53Alarm();
      } catch {}
	})();
