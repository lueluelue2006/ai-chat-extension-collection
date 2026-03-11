(() => {
  'use strict';

  const root = globalThis as any;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== 'object') root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;

  const SETTINGS_KEY = 'aichat_ai_shortcuts_settings_v1';
  const STORAGE_SCHEMA_MARKER_KEY = 'aichat_ai_shortcuts_storage_schema_v1';
  const STORAGE_SCHEMA_MARKER_VALUE = 'hard_cut_storage_v1';
  const GPT53_PROBE_URLS_KEY = 'aichat_ai_shortcuts_gpt53_probe_urls_v1';
  const GPT53_PROBE_STATE_KEY = 'aichat_ai_shortcuts_gpt53_probe_state_v1';
  const GPT53_PROBE_ALERTS_KEY = 'aichat_ai_shortcuts_gpt53_probe_alerts_v1';
  const QUICKNAV_CONTENT_SCRIPT_ID_PREFIX = 'quicknav_';
  const LEGACY_PRODUCT_STORAGE_KEYS = Object.freeze([
    'quicknav_settings',
    'quicknav_ui_theme_override_v1',
    'quicknav_gpt53_probe_urls_v1',
    'quicknav_gpt53_probe_state_v1',
    'quicknav_gpt53_probe_alerts_v1'
  ]);

  let SHARED_CONFIG_LOADED = false;
  let DEFAULT_SETTINGS: any = { enabled: true, sites: {}, scrollLockDefaults: {}, siteModules: {} };
  let MAIN_GUARD_FILE = 'content/scroll-guard-main.js';
  let CONTENT_SCRIPT_DEFS: any[] = [];
  let LEGACY_CONTENT_SCRIPT_IDS: string[] = [];

  let KNOWN_SITE_IDS = new Set<string>();
  let KNOWN_SITE_MODULE_KEYS = new Map<string, Set<string>>();
  let MODULE_ID_ALIASES: Record<string, string> = {};
  let MODULE_ALIAS_TARGETS = new Map<string, string[]>();

  let settingsMutationChain: Promise<any> = Promise.resolve();
  let hardCutSchemaInitialized = false;
  let hardCutSchemaInitPromise: Promise<any> | null = null;
  let hardCutSchemaLastReport: any = null;

  function deepCloneJsonSafe(obj: any) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return {};
    }
  }

  function buildStorageKeyList(input: any) {
    const source = Array.isArray(input) ? input : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of source) {
      const key = String(value || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  }

  async function listPresentStorageKeys(areaName: string, keys: any) {
    const list = buildStorageKeyList(keys);
    if (!list.length) return [];
    try {
      const items = await ns.chrome.storageGet(areaName, list);
      return list.filter((key) => Object.prototype.hasOwnProperty.call(items || {}, key));
    } catch {
      return [];
    }
  }

  async function purgeLegacyKeysInArea(areaName: string) {
    const legacyKeys = buildStorageKeyList(LEGACY_PRODUCT_STORAGE_KEYS);
    if (!legacyKeys.length) return [];
    const present = await listPresentStorageKeys(areaName, legacyKeys);
    try {
      await ns.chrome.storageRemove(areaName, legacyKeys);
    } catch {}
    return present;
  }

  async function purgeLegacyProductStorageKeys() {
    const removedByArea: any = { local: [], sync: [], session: [] };
    for (const areaName of ['local', 'sync', 'session']) {
      removedByArea[areaName] = await purgeLegacyKeysInArea(areaName);
    }
    const removed = new Set<string>();
    for (const areaName of Object.keys(removedByArea)) {
      const keys = Array.isArray(removedByArea[areaName]) ? removedByArea[areaName] : [];
      for (const key of keys) removed.add(String(key || ''));
    }
    return {
      removedLegacyKeys: Array.from(removed).filter(Boolean),
      removedByArea
    };
  }

  async function readStorageSchemaMarker() {
    try {
      const items = await ns.chrome.storageGet('local', [STORAGE_SCHEMA_MARKER_KEY]);
      const marker = items?.[STORAGE_SCHEMA_MARKER_KEY];
      return typeof marker === 'string' ? marker : '';
    } catch {
      return '';
    }
  }

  function buildHardCutReportBase(options: any = {}) {
    return {
      force: !!options.force,
      skipped: !!options.skipped,
      markerKey: STORAGE_SCHEMA_MARKER_KEY,
      markerValue: STORAGE_SCHEMA_MARKER_VALUE,
      canonical: {
        settingsKey: SETTINGS_KEY,
        gpt53UrlsKey: GPT53_PROBE_URLS_KEY,
        gpt53StateKey: GPT53_PROBE_STATE_KEY,
        gpt53AlertsKey: GPT53_PROBE_ALERTS_KEY
      },
      legacyKeys: [...LEGACY_PRODUCT_STORAGE_KEYS]
    };
  }

  function resetHardCutStorageSchemaRuntimeState() {
    hardCutSchemaInitialized = false;
    hardCutSchemaInitPromise = null;
    hardCutSchemaLastReport = null;
  }

  function getHardCutStorageSchemaStatus() {
    const last = hardCutSchemaLastReport && typeof hardCutSchemaLastReport === 'object' ? hardCutSchemaLastReport : null;
    return {
      initialized: hardCutSchemaInitialized,
      markerKey: STORAGE_SCHEMA_MARKER_KEY,
      markerValue: STORAGE_SCHEMA_MARKER_VALUE,
      canonical: {
        settingsKey: SETTINGS_KEY,
        gpt53UrlsKey: GPT53_PROBE_URLS_KEY,
        gpt53StateKey: GPT53_PROBE_STATE_KEY,
        gpt53AlertsKey: GPT53_PROBE_ALERTS_KEY
      },
      legacyKeys: [...LEGACY_PRODUCT_STORAGE_KEYS],
      lastReport: last ? deepCloneJsonSafe(last) : null
    };
  }

  function buildHardCutFallbackReport(options: any, markerWriteError: any) {
    return Object.assign(buildHardCutReportBase(options), {
      markerBefore: '',
      markerAfter: '',
      markerPersisted: false,
      markerWriteError: ns.chrome.toErrorMessage(markerWriteError),
      removedLegacyKeys: [],
      removedByArea: { local: [], sync: [], session: [] }
    });
  }

  async function ensureHardCutStorageSchema(options: any = {}) {
    const force = !!options?.force;
    if (!force && hardCutSchemaInitialized) {
      return hardCutSchemaLastReport || buildHardCutReportBase({ force, skipped: true });
    }
    if (!force && hardCutSchemaInitPromise) return await hardCutSchemaInitPromise;

    const run = async () => {
      const markerBefore = await readStorageSchemaMarker();
      const purgeReport = await purgeLegacyProductStorageKeys();
      let markerWriteError = '';
      try {
        await ns.chrome.storageSet('local', { [STORAGE_SCHEMA_MARKER_KEY]: STORAGE_SCHEMA_MARKER_VALUE });
      } catch (error) {
        markerWriteError = ns.chrome.toErrorMessage(error);
      }
      const markerAfter = await readStorageSchemaMarker();
      const markerPersisted = markerAfter === STORAGE_SCHEMA_MARKER_VALUE;
      if (markerPersisted) hardCutSchemaInitialized = true;

      const report = Object.assign(buildHardCutReportBase({ force }), {
        markerBefore,
        markerAfter,
        markerPersisted,
        markerWriteError,
        removedLegacyKeys: Array.isArray(purgeReport?.removedLegacyKeys) ? purgeReport.removedLegacyKeys : [],
        removedByArea:
          purgeReport && typeof purgeReport === 'object'
            ? purgeReport.removedByArea || { local: [], sync: [], session: [] }
            : { local: [], sync: [], session: [] }
      });
      hardCutSchemaLastReport = report;
      return report;
    };

    if (force) {
      try {
        return await run();
      } catch (error) {
        const fallback = buildHardCutFallbackReport({ force }, error);
        hardCutSchemaLastReport = fallback;
        return fallback;
      }
    }

    hardCutSchemaInitPromise = run()
      .catch((error: any) => {
        const fallback = buildHardCutFallbackReport({ force }, error);
        hardCutSchemaLastReport = fallback;
        return fallback;
      })
      .finally(() => {
        hardCutSchemaInitPromise = null;
      });

    return await hardCutSchemaInitPromise;
  }

  function normalizeModuleId(input: any) {
    let current = String(input || '').trim();
    if (!current) return '';
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const next = String(MODULE_ID_ALIASES?.[current] || '').trim();
      if (!next || next === current) break;
      current = next;
    }
    return current;
  }

  function getLegacyModuleIdsForCanonical(canonicalId: any) {
    const key = String(canonicalId || '').trim();
    if (!key) return [];
    const list = MODULE_ALIAS_TARGETS.get(key);
    return Array.isArray(list) ? list : [];
  }

  function normalizeMetaKeyMode(input: any, fallback = 'auto') {
    const value = String(input || '').trim().toLowerCase();
    if (value === 'auto' || value === 'has_meta' || value === 'no_meta') return value;
    return fallback;
  }

  function normalizeSettings(input: any) {
    const out: any = {
      enabled: true,
      metaKeyMode: normalizeMetaKeyMode(DEFAULT_SETTINGS?.metaKeyMode, 'auto'),
      sites: { ...DEFAULT_SETTINGS.sites },
      scrollLockDefaults: { ...DEFAULT_SETTINGS.scrollLockDefaults },
      siteModules: deepCloneJsonSafe(DEFAULT_SETTINGS.siteModules)
    };
    try {
      if (!input || typeof input !== 'object') return out;
      if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
      out.metaKeyMode = normalizeMetaKeyMode(input.metaKeyMode, out.metaKeyMode);
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
            if (typeof rawMods[modId] === 'boolean') {
              outMods[modId] = rawMods[modId];
              continue;
            }
            const legacyIds = getLegacyModuleIdsForCanonical(modId);
            for (const legacyId of legacyIds) {
              if (typeof rawMods[legacyId] === 'boolean') {
                outMods[modId] = rawMods[legacyId];
                break;
              }
            }
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
      const rawMetaKeyMode = typeof raw.metaKeyMode === 'string' ? raw.metaKeyMode.trim().toLowerCase() : '';
      if (!rawMetaKeyMode) return true;
      if (normalizeMetaKeyMode(rawMetaKeyMode, '') !== rawMetaKeyMode) return true;
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
    MODULE_ID_ALIASES = {};
    MODULE_ALIAS_TARGETS = new Map<string, string[]>();

    try {
      const aliases = registry?.moduleAliases;
      if (aliases && typeof aliases === 'object') {
        const sanitized: Record<string, string> = {};
        const targets = new Map<string, string[]>();
        for (const [legacyId, canonicalId] of Object.entries(aliases)) {
          const legacy = String(legacyId || '').trim();
          const canonical = String(canonicalId || '').trim();
          if (!legacy || !canonical || legacy === canonical) continue;
          sanitized[legacy] = canonical;
          const list = targets.get(canonical) || [];
          list.push(legacy);
          targets.set(canonical, list);
        }
        MODULE_ID_ALIASES = sanitized;
        MODULE_ALIAS_TARGETS = targets;
      }
    } catch {
      MODULE_ID_ALIASES = {};
      MODULE_ALIAS_TARGETS = new Map<string, string[]>();
    }

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
    void ensureHardCutStorageSchema();
  }

  async function getSettings() {
    await ensureHardCutStorageSchema();
    const items = await ns.chrome.storageGet('local', { [SETTINGS_KEY]: null });
    const raw = items && typeof items === 'object' ? items[SETTINGS_KEY] : null;
    const normalized = normalizeSettings(raw);
    if (SHARED_CONFIG_LOADED && shouldPersistNormalizedSettings(raw)) {
      await ns.chrome.storageSet('local', { [SETTINGS_KEY]: normalized });
    }
    return normalized;
  }

  async function setSettings(next: any) {
    await ensureHardCutStorageSchema();
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

      if (path.length === 1 && path[0] === 'metaKeyMode') {
        next.metaKeyMode = normalizeMetaKeyMode(op.value, next.metaKeyMode);
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
        const key = normalizeModuleId(path[2]);
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
    STORAGE_SCHEMA_MARKER_KEY,
    STORAGE_SCHEMA_MARKER_VALUE,
    GPT53_PROBE_URLS_KEY,
    GPT53_PROBE_STATE_KEY,
    GPT53_PROBE_ALERTS_KEY,
    LEGACY_PRODUCT_STORAGE_KEYS: [...LEGACY_PRODUCT_STORAGE_KEYS],
    initConfig,
    normalizeSettings,
    purgeLegacyProductStorageKeys,
    ensureHardCutStorageSchema,
    getHardCutStorageSchemaStatus,
    resetHardCutStorageSchemaRuntimeState,
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
    isSharedConfigLoaded,
    normalizeModuleId
  });
})();
