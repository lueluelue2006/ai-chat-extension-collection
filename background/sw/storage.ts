(() => {
  'use strict';

  const root = globalThis as any;
  const ns = root.__quicknavSw || (root.__quicknavSw = {});

  const SETTINGS_KEY = 'quicknav_settings';
  const QUICKNAV_CONTENT_SCRIPT_ID_PREFIX = 'quicknav_';

  let SHARED_CONFIG_LOADED = false;
  let DEFAULT_SETTINGS: any = { enabled: true, sites: {}, scrollLockDefaults: {}, siteModules: {} };
  let MAIN_GUARD_FILE = 'content/scroll-guard-main.js';
  let CONTENT_SCRIPT_DEFS: any[] = [];
  let LEGACY_CONTENT_SCRIPT_IDS: string[] = [];

  let KNOWN_SITE_IDS = new Set<string>();
  let KNOWN_SITE_MODULE_KEYS = new Map<string, Set<string>>();

  let settingsMutationChain: Promise<any> = Promise.resolve();

  function deepCloneJsonSafe(obj: any) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return {};
    }
  }

  function normalizeSettings(input: any) {
    const out: any = {
      enabled: true,
      sites: { ...DEFAULT_SETTINGS.sites },
      scrollLockDefaults: { ...DEFAULT_SETTINGS.scrollLockDefaults },
      siteModules: deepCloneJsonSafe(DEFAULT_SETTINGS.siteModules)
    };
    try {
      if (!input || typeof input !== 'object') return out;
      if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
      if (input.sites && typeof input.sites === 'object') {
        for (const key of Object.keys(DEFAULT_SETTINGS.sites || {})) {
          if (typeof input.sites[key] === 'boolean') out.sites[key] = input.sites[key];
        }
      }
      if (input.scrollLockDefaults && typeof input.scrollLockDefaults === 'object') {
        for (const key of Object.keys(DEFAULT_SETTINGS.scrollLockDefaults || {})) {
          if (typeof input.scrollLockDefaults[key] === 'boolean') out.scrollLockDefaults[key] = input.scrollLockDefaults[key];
        }
      }
      if (input.siteModules && typeof input.siteModules === 'object') {
        for (const siteId of Object.keys(DEFAULT_SETTINGS.siteModules || {})) {
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

  function shouldPersistNormalizedSettings(raw: any) {
    try {
      if (!raw || typeof raw !== 'object') return true;
      if (typeof raw.enabled !== 'boolean') return true;
      if (!raw.sites || typeof raw.sites !== 'object') return true;
      for (const key of Object.keys(DEFAULT_SETTINGS.sites || {})) {
        if (typeof raw.sites[key] !== 'boolean') return true;
      }
      if (!raw.scrollLockDefaults || typeof raw.scrollLockDefaults !== 'object') return true;
      for (const key of Object.keys(DEFAULT_SETTINGS.scrollLockDefaults || {})) {
        if (typeof raw.scrollLockDefaults[key] !== 'boolean') return true;
      }
      if (!raw.siteModules || typeof raw.siteModules !== 'object') return true;
      for (const siteId of Object.keys(DEFAULT_SETTINGS.siteModules || {})) {
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

  function rebuildKnownKeys() {
    KNOWN_SITE_IDS = new Set<string>();
    KNOWN_SITE_MODULE_KEYS = new Map<string, Set<string>>();

    try {
      const sites = DEFAULT_SETTINGS?.sites && typeof DEFAULT_SETTINGS.sites === 'object' ? DEFAULT_SETTINGS.sites : {};
      for (const key of Object.keys(sites)) KNOWN_SITE_IDS.add(key);
    } catch {
      KNOWN_SITE_IDS = new Set<string>();
    }

    try {
      const siteModules =
        DEFAULT_SETTINGS?.siteModules && typeof DEFAULT_SETTINGS.siteModules === 'object' ? DEFAULT_SETTINGS.siteModules : {};
      for (const siteId of Object.keys(siteModules)) {
        const mods = siteModules?.[siteId];
        if (!mods || typeof mods !== 'object') continue;
        KNOWN_SITE_MODULE_KEYS.set(siteId, new Set(Object.keys(mods)));
      }
    } catch {
      KNOWN_SITE_MODULE_KEYS = new Map<string, Set<string>>();
    }
  }

  function initConfig(config: any) {
    const registry = config && typeof config === 'object' ? config.registry || null : null;
    const injections = config && typeof config === 'object' ? config.injections || null : null;

    SHARED_CONFIG_LOADED = !!(config && config.sharedConfigLoaded);

    DEFAULT_SETTINGS = { enabled: true, sites: {}, scrollLockDefaults: {}, siteModules: {} };
    MAIN_GUARD_FILE = 'content/scroll-guard-main.js';
    CONTENT_SCRIPT_DEFS = [];
    LEGACY_CONTENT_SCRIPT_IDS = [];

    try {
      if (injections && typeof injections.buildDefaultSettings === 'function') {
        DEFAULT_SETTINGS = injections.buildDefaultSettings(registry);
      } else {
        SHARED_CONFIG_LOADED = false;
      }
    } catch {
      SHARED_CONFIG_LOADED = false;
      DEFAULT_SETTINGS = { enabled: true, sites: {}, scrollLockDefaults: {}, siteModules: {} };
    }

    try {
      MAIN_GUARD_FILE = String(injections?.MAIN_GUARD_FILE || 'content/scroll-guard-main.js');
    } catch {
      MAIN_GUARD_FILE = 'content/scroll-guard-main.js';
    }

    try {
      if (injections && typeof injections.buildContentScriptDefs === 'function') {
        const defs = injections.buildContentScriptDefs(registry);
        CONTENT_SCRIPT_DEFS = Array.isArray(defs) ? defs : [];
      } else {
        SHARED_CONFIG_LOADED = false;
        CONTENT_SCRIPT_DEFS = [];
      }
    } catch {
      SHARED_CONFIG_LOADED = false;
      CONTENT_SCRIPT_DEFS = [];
    }

    try {
      const rawLegacyIds = injections?.LEGACY_CONTENT_SCRIPT_IDS;
      if (!Array.isArray(rawLegacyIds)) {
        LEGACY_CONTENT_SCRIPT_IDS = [];
      } else {
        const deduped = new Set<string>();
        for (const id of rawLegacyIds) {
          if (typeof id !== 'string' || !id) continue;
          deduped.add(id);
        }
        LEGACY_CONTENT_SCRIPT_IDS = Array.from(deduped);
      }
    } catch {
      LEGACY_CONTENT_SCRIPT_IDS = [];
    }

    rebuildKnownKeys();
  }

  async function getSettings() {
    const items = await ns.chrome.storageGet('local', { [SETTINGS_KEY]: null });
    const raw = items && typeof items === 'object' ? items[SETTINGS_KEY] : null;
    const normalized = normalizeSettings(raw);
    if (SHARED_CONFIG_LOADED && shouldPersistNormalizedSettings(raw)) {
      await ns.chrome.storageSet('local', { [SETTINGS_KEY]: normalized });
    }
    return normalized;
  }

  async function setSettings(next: any) {
    const normalized = normalizeSettings(next);
    await ns.chrome.storageSet('local', { [SETTINGS_KEY]: normalized });
    return normalized;
  }

  function applySettingsPatchOps(current: any, patch: any) {
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
      const path = Array.isArray(op?.path) ? op.path.map((x: any) => String(x || '')) : [];
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
      }
    }

    return next;
  }

  function runSettingsMutation(fn: () => any) {
    settingsMutationChain = settingsMutationChain.catch(() => void 0).then(() => fn());
    return settingsMutationChain;
  }

  function getDefaultSettings() {
    return DEFAULT_SETTINGS;
  }

  function getDefaultSettingsClone() {
    return normalizeSettings(DEFAULT_SETTINGS);
  }

  function getContentScriptDefs() {
    return Array.isArray(CONTENT_SCRIPT_DEFS) ? CONTENT_SCRIPT_DEFS : [];
  }

  function getMainGuardFile() {
    return MAIN_GUARD_FILE;
  }

  function getQuicknavContentScriptIdPrefix() {
    return QUICKNAV_CONTENT_SCRIPT_ID_PREFIX;
  }

  function getQuicknavLegacyContentScriptIds() {
    return Array.isArray(LEGACY_CONTENT_SCRIPT_IDS) ? [...LEGACY_CONTENT_SCRIPT_IDS] : [];
  }

  function isSharedConfigLoaded() {
    return SHARED_CONFIG_LOADED;
  }

  ns.storage = Object.assign({}, ns.storage || {}, {
    SETTINGS_KEY,
    initConfig,
    normalizeSettings,
    getSettings,
    setSettings,
    applySettingsPatchOps,
    runSettingsMutation,
    getDefaultSettings,
    getDefaultSettingsClone,
    getContentScriptDefs,
    getMainGuardFile,
    getQuicknavContentScriptIdPrefix,
    getQuicknavLegacyContentScriptIds,
    isSharedConfigLoaded
  });
})();
