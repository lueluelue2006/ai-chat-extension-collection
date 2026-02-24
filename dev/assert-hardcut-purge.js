#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');

const ROOT = path.join(__dirname, '..');
const STORAGE_MODULE_PATH = 'background/sw/storage.ts';
const ROUTER_MODULE_PATH = 'background/sw/router.ts';
const STORAGE_AREAS = Object.freeze(['local', 'sync', 'session']);

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function deepClone(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeStringList(input) {
  const source = Array.isArray(input) ? input : [];
  return Array.from(
    new Set(
      source
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  ).sort();
}

function normalizeAreaMap(input) {
  const out = {};
  for (const area of STORAGE_AREAS) {
    out[area] = normalizeStringList(input?.[area]);
  }
  return out;
}

function toErrorMessage(error, fallback = 'unknown_error') {
  if (error instanceof Error && error.message) return error.message;
  const text = String(error || '').trim();
  return text || fallback;
}

function transpileTsForVm(tsPath) {
  const source = readText(tsPath);
  return transformSync(source, {
    loader: 'ts',
    target: 'chrome96',
    format: 'esm',
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    sourcefile: tsPath
  }).code;
}

async function flushAsyncWork(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createLifecycleEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      if (typeof listener === 'function') listeners.push(listener);
    },
    dispatch(...args) {
      for (const listener of [...listeners]) {
        listener(...args);
      }
    },
    listenerCount() {
      return listeners.length;
    }
  };
}

function createStorageBackend() {
  const stores = {
    local: new Map(),
    sync: new Map(),
    session: new Map()
  };

  function getStore(areaName) {
    const area = String(areaName || '');
    const store = stores[area];
    if (!store) throw new Error(`Unsupported storage area: ${area}`);
    return store;
  }

  function keysFromQuery(store, query) {
    if (query == null) return Array.from(store.keys());
    if (Array.isArray(query)) return query.map((key) => String(key || ''));
    if (typeof query === 'string') return [query];
    if (typeof query === 'object') return Object.keys(query);
    return [];
  }

  function storageGet(areaName, query) {
    const store = getStore(areaName);
    const keys = keysFromQuery(store, query);
    const out = {};

    for (const key of keys) {
      if (!key) continue;
      if (store.has(key)) {
        out[key] = deepClone(store.get(key));
      } else if (query && typeof query === 'object' && !Array.isArray(query)) {
        out[key] = deepClone(query[key]);
      }
    }

    return out;
  }

  function storageSet(areaName, items) {
    const store = getStore(areaName);
    const source = items && typeof items === 'object' ? items : {};
    for (const [key, value] of Object.entries(source)) {
      store.set(String(key || ''), deepClone(value));
    }
  }

  function storageRemove(areaName, keys) {
    const store = getStore(areaName);
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      const text = String(key || '');
      if (!text) continue;
      store.delete(text);
    }
  }

  function seed(areaName, key, value) {
    storageSet(areaName, { [String(key || '')]: value });
  }

  function getPresentKeys(areaName, keys) {
    const store = getStore(areaName);
    return normalizeStringList(keys).filter((key) => store.has(key));
  }

  function getValue(areaName, key) {
    const store = getStore(areaName);
    return deepClone(store.get(String(key || '')));
  }

  return {
    storageGet,
    storageSet,
    storageRemove,
    seed,
    getPresentKeys,
    getValue
  };
}

function loadStorageHarness() {
  const backend = createStorageBackend();
  const swNs = {
    chrome: {
      storageGet: async (areaName, query) => backend.storageGet(areaName, query),
      storageSet: async (areaName, items) => {
        backend.storageSet(areaName, items);
      },
      storageRemove: async (areaName, keys) => {
        backend.storageRemove(areaName, keys);
      },
      toErrorMessage
    }
  };

  const sandbox = {
    globalThis: {
      __aiShortcutsSw: swNs
    }
  };
  sandbox.globalThis.globalThis = sandbox.globalThis;

  vm.createContext(sandbox);
  vm.runInContext(transpileTsForVm(STORAGE_MODULE_PATH), sandbox, { filename: STORAGE_MODULE_PATH });

  const storage = sandbox.globalThis.__aiShortcutsSw?.storage;
  assert.ok(storage && typeof storage.ensureHardCutStorageSchema === 'function', 'storage.ensureHardCutStorageSchema missing');
  assert.ok(Array.isArray(storage.LEGACY_PRODUCT_STORAGE_KEYS), 'storage.LEGACY_PRODUCT_STORAGE_KEYS missing');
  assert.ok(typeof storage.getHardCutStorageSchemaStatus === 'function', 'storage.getHardCutStorageSchemaStatus missing');

  if (typeof storage.resetHardCutStorageSchemaRuntimeState === 'function') {
    storage.resetHardCutStorageSchemaRuntimeState();
  }

  return { storage, backend };
}

async function loadRuntimeHarness() {
  const backend = createStorageBackend();
  const lifecycleEvents = {
    onInstalled: createLifecycleEvent(),
    onStartup: createLifecycleEvent(),
    onMessage: createLifecycleEvent()
  };

  const runtimeMetrics = {
    ensureCalls: 0,
    getSettingsCalls: 0,
    applyRegisterCalls: 0,
    applyReinjectCalls: 0,
    scheduleReinjectCalls: 0
  };

  const swNs = {
    chrome: {
      storageGet: async (areaName, query) => backend.storageGet(areaName, query),
      storageSet: async (areaName, items) => {
        backend.storageSet(areaName, items);
      },
      storageRemove: async (areaName, keys) => {
        backend.storageRemove(areaName, keys);
      },
      toErrorMessage,
      senderGate: () => ''
    },
    diag: {
      log: () => void 0
    },
    registration: {
      applySettingsAndRegister: async () => {
        runtimeMetrics.applyRegisterCalls += 1;
        return { registeredIds: [], unregisteredIds: [] };
      },
      applySettingsAndReinject: async () => {
        runtimeMetrics.applyReinjectCalls += 1;
        return { registeredIds: [], unregisteredIds: [] };
      },
      scheduleReinject: () => {
        runtimeMetrics.scheduleReinjectCalls += 1;
      }
    },
    monitors: {
      init: () => void 0,
      ensureGpt53Alarm: async () => ({ ok: true }),
      runGpt53Probe: async () => ({ ok: true }),
      getGpt53Urls: async () => [],
      getGpt53State: async () => ({}),
      getGpt53Alerts: async () => ({ unread: 0, events: [] }),
      GPT53_MONITOR: { defaultUrls: [] }
    },
    routerHandlers: {
      handleMemtestMessage: () => false,
      handleBootstrapMessage: () => false,
      handleSettingsMessage: () => false,
      handleGpt53Message: () => false,
      handleAdminMessage: () => false
    }
  };

  const chromeStub = {
    runtime: {
      onInstalled: { addListener: (listener) => lifecycleEvents.onInstalled.addListener(listener) },
      onStartup: { addListener: (listener) => lifecycleEvents.onStartup.addListener(listener) },
      onMessage: { addListener: (listener) => lifecycleEvents.onMessage.addListener(listener) },
      getURL: (rel = '') => `chrome-extension://test/${String(rel || '').replace(/^\/+/, '')}`,
      openOptionsPage: (done) => {
        if (typeof done === 'function') done();
      }
    },
    tabs: {
      create: (_opts, done) => {
        if (typeof done === 'function') done({ id: 1 });
      }
    }
  };

  const sandbox = {
    chrome: chromeStub,
    globalThis: {
      __aiShortcutsSw: swNs,
      chrome: chromeStub
    }
  };
  sandbox.globalThis.globalThis = sandbox.globalThis;

  vm.createContext(sandbox);
  vm.runInContext(transpileTsForVm(STORAGE_MODULE_PATH), sandbox, { filename: STORAGE_MODULE_PATH });

  const storage = sandbox.globalThis.__aiShortcutsSw?.storage;
  assert.ok(storage && typeof storage.initConfig === 'function', 'runtime storage.initConfig missing');
  assert.ok(typeof storage.ensureHardCutStorageSchema === 'function', 'runtime ensureHardCutStorageSchema missing');
  assert.ok(typeof storage.normalizeSettings === 'function', 'runtime storage.normalizeSettings missing');

  storage.initConfig({ registry: null, injections: null, sharedConfigLoaded: false });
  await flushAsyncWork();
  if (typeof storage.resetHardCutStorageSchemaRuntimeState === 'function') {
    storage.resetHardCutStorageSchemaRuntimeState();
  }

  const originalEnsureHardCutStorageSchema = storage.ensureHardCutStorageSchema.bind(storage);
  storage.ensureHardCutStorageSchema = async (options) => {
    runtimeMetrics.ensureCalls += 1;
    return await originalEnsureHardCutStorageSchema(options);
  };

  storage.getSettings = async () => {
    runtimeMetrics.getSettingsCalls += 1;
    const items = await swNs.chrome.storageGet('local', { [storage.SETTINGS_KEY]: null });
    const raw = items && typeof items === 'object' ? items[storage.SETTINGS_KEY] : null;
    return storage.normalizeSettings(raw);
  };

  vm.runInContext(transpileTsForVm(ROUTER_MODULE_PATH), sandbox, { filename: ROUTER_MODULE_PATH });

  const router = sandbox.globalThis.__aiShortcutsSw?.router;
  assert.ok(router && typeof router.init === 'function', 'runtime router.init missing');

  return {
    storage,
    backend,
    router,
    runtimeMetrics,
    lifecycleEvents
  };
}

function assertNoLegacyKeysRemain(backend, legacyKeys) {
  for (const area of STORAGE_AREAS) {
    const present = backend.getPresentKeys(area, legacyKeys);
    assert.deepStrictEqual(present, [], `legacy keys should be removed from ${area}`);
  }
}

function assertMarkerPersisted(storage, backend) {
  const marker = backend.getValue('local', storage.STORAGE_SCHEMA_MARKER_KEY);
  assert.strictEqual(marker, storage.STORAGE_SCHEMA_MARKER_VALUE, 'schema marker should persist canonical value');
}

function seedLegacyKeys(backend, legacyKeys) {
  const seededByArea = { local: [], sync: [], session: [] };
  for (let i = 0; i < legacyKeys.length; i += 1) {
    const key = legacyKeys[i];
    const area = STORAGE_AREAS[i % STORAGE_AREAS.length];
    backend.seed(area, key, `legacy_${i + 1}`);
    seededByArea[area].push(key);
  }
  return normalizeAreaMap(seededByArea);
}

async function runBaselineScenario() {
  const { storage, backend } = loadStorageHarness();
  const legacyKeys = normalizeStringList(storage.LEGACY_PRODUCT_STORAGE_KEYS);

  const report = await storage.ensureHardCutStorageSchema({ force: true });
  assert.strictEqual(report.markerKey, storage.STORAGE_SCHEMA_MARKER_KEY, 'marker key should match export');
  assert.strictEqual(report.markerValue, storage.STORAGE_SCHEMA_MARKER_VALUE, 'marker value should match export');
  assert.strictEqual(report.markerPersisted, true, 'marker should be persisted during baseline');
  assert.strictEqual(report.markerAfter, storage.STORAGE_SCHEMA_MARKER_VALUE, 'marker after baseline should be canonical value');
  assert.deepStrictEqual(normalizeStringList(report.removedLegacyKeys), [], 'baseline should not report removed legacy keys');
  assert.deepStrictEqual(normalizeAreaMap(report.removedByArea), { local: [], sync: [], session: [] });

  const status = storage.getHardCutStorageSchemaStatus();
  assert.strictEqual(status.initialized, true, 'status should be initialized after baseline run');
  assertNoLegacyKeysRemain(backend, legacyKeys);
  assertMarkerPersisted(storage, backend);

  return {
    marker: `${storage.STORAGE_SCHEMA_MARKER_KEY}=${storage.STORAGE_SCHEMA_MARKER_VALUE}`,
    legacyCount: legacyKeys.length
  };
}

async function runSeededScenario(doubleRun) {
  const { storage, backend } = loadStorageHarness();
  const legacyKeys = normalizeStringList(storage.LEGACY_PRODUCT_STORAGE_KEYS);
  const seededByArea = seedLegacyKeys(backend, legacyKeys);

  backend.seed('local', storage.STORAGE_SCHEMA_MARKER_KEY, 'legacy_marker');

  const first = await storage.ensureHardCutStorageSchema({ force: true });
  assert.strictEqual(first.markerPersisted, true, 'seeded run should persist marker');
  assert.strictEqual(first.markerAfter, storage.STORAGE_SCHEMA_MARKER_VALUE, 'seeded run should overwrite stale marker');
  assert.deepStrictEqual(normalizeStringList(first.removedLegacyKeys), legacyKeys, 'seeded run should remove full exported legacy key set');
  assert.deepStrictEqual(normalizeAreaMap(first.removedByArea), seededByArea, 'seeded run should report deterministic per-area removals');
  assertNoLegacyKeysRemain(backend, legacyKeys);
  assertMarkerPersisted(storage, backend);

  let second = null;
  if (doubleRun) {
    second = await storage.ensureHardCutStorageSchema({ force: true });
    assert.strictEqual(second.markerPersisted, true, 'double-run second pass should keep marker persisted');
    assert.deepStrictEqual(normalizeStringList(second.removedLegacyKeys), [], 'double-run second pass should remove nothing');
    assert.deepStrictEqual(normalizeAreaMap(second.removedByArea), { local: [], sync: [], session: [] });
    assertNoLegacyKeysRemain(backend, legacyKeys);
    assertMarkerPersisted(storage, backend);
  }

  return {
    removedFirst: first.removedLegacyKeys.length,
    removedSecond: second ? second.removedLegacyKeys.length : null,
    legacyCount: legacyKeys.length
  };
}

function seedRuntimeLegacyState(backend, storage, legacyKeys) {
  const seededByArea = seedLegacyKeys(backend, legacyKeys);
  backend.seed('local', storage.STORAGE_SCHEMA_MARKER_KEY, 'legacy_marker');
  return seededByArea;
}

function readLastHardCutReport(storage) {
  const status = storage.getHardCutStorageSchemaStatus();
  const report = status && typeof status === 'object' ? status.lastReport : null;
  return report && typeof report === 'object' ? report : null;
}

function assertRuntimeReport(report, expectedLegacyKeys, expectedByArea, context) {
  assert.ok(report && typeof report === 'object', `${context}: hard-cut report should exist`);
  assert.strictEqual(report.markerPersisted, true, `${context}: marker should be persisted`);
  assert.strictEqual(report.markerAfter, report.markerValue, `${context}: marker should be canonical`);
  assert.deepStrictEqual(
    normalizeStringList(report.removedLegacyKeys),
    normalizeStringList(expectedLegacyKeys),
    `${context}: removed legacy keys mismatch`
  );
  assert.deepStrictEqual(
    normalizeAreaMap(report.removedByArea),
    normalizeAreaMap(expectedByArea),
    `${context}: removed legacy per-area report mismatch`
  );
}

async function runRuntimeScenario(doubleRun) {
  const { storage, backend, router, runtimeMetrics, lifecycleEvents } = await loadRuntimeHarness();
  const legacyKeys = normalizeStringList(storage.LEGACY_PRODUCT_STORAGE_KEYS);

  const initSeededByArea = seedRuntimeLegacyState(backend, storage, legacyKeys);
  router.init();
  await flushAsyncWork();

  assert.ok(lifecycleEvents.onInstalled.listenerCount() >= 1, 'runtime onInstalled listener should be registered');
  assert.ok(lifecycleEvents.onStartup.listenerCount() >= 1, 'runtime onStartup listener should be registered');
  assert.ok(lifecycleEvents.onMessage.listenerCount() >= 1, 'runtime onMessage listener should be registered');

  const initReport = readLastHardCutReport(storage);
  assertRuntimeReport(initReport, legacyKeys, initSeededByArea, 'runtime init');
  assertNoLegacyKeysRemain(backend, legacyKeys);
  assertMarkerPersisted(storage, backend);

  const startupSeededByArea = seedRuntimeLegacyState(backend, storage, legacyKeys);
  lifecycleEvents.onStartup.dispatch();
  await flushAsyncWork();

  const startupReport = readLastHardCutReport(storage);
  assertRuntimeReport(startupReport, legacyKeys, startupSeededByArea, 'runtime onStartup');
  assertNoLegacyKeysRemain(backend, legacyKeys);
  assertMarkerPersisted(storage, backend);

  const installedSeededByArea = seedRuntimeLegacyState(backend, storage, legacyKeys);
  lifecycleEvents.onInstalled.dispatch();
  await flushAsyncWork();

  const installedReport = readLastHardCutReport(storage);
  assertRuntimeReport(installedReport, legacyKeys, installedSeededByArea, 'runtime onInstalled');
  assertNoLegacyKeysRemain(backend, legacyKeys);
  assertMarkerPersisted(storage, backend);

  let secondRemoved = null;
  if (doubleRun) {
    lifecycleEvents.onStartup.dispatch();
    await flushAsyncWork();

    const secondReport = readLastHardCutReport(storage);
    assertRuntimeReport(secondReport, [], { local: [], sync: [], session: [] }, 'runtime double-run');
    secondRemoved = normalizeStringList(secondReport?.removedLegacyKeys).length;
    assertNoLegacyKeysRemain(backend, legacyKeys);
    assertMarkerPersisted(storage, backend);
  }

  assert.ok(runtimeMetrics.getSettingsCalls >= 3, 'runtime lifecycle should read settings on init/startup/install');
  assert.ok(runtimeMetrics.ensureCalls >= 3, 'runtime lifecycle should hard-cut purge before settings reads');

  return {
    initRemoved: normalizeStringList(initReport?.removedLegacyKeys).length,
    startupRemoved: normalizeStringList(startupReport?.removedLegacyKeys).length,
    installedRemoved: normalizeStringList(installedReport?.removedLegacyKeys).length,
    secondRemoved,
    ensureCalls: runtimeMetrics.ensureCalls,
    settingsReads: runtimeMetrics.getSettingsCalls,
    legacyCount: legacyKeys.length
  };
}

function usage() {
  return [
    'Usage:',
    '  node dev/assert-hardcut-purge.js',
    '  node dev/assert-hardcut-purge.js --seed-legacy',
    '  node dev/assert-hardcut-purge.js --double-run',
    '  node dev/assert-hardcut-purge.js --runtime',
    '  node dev/assert-hardcut-purge.js --runtime --double-run'
  ].join('\n');
}

function parseCli(argv) {
  const args = Array.from(argv || []);
  const known = new Set(['--help', '-h', '--seed-legacy', '--double-run', '--runtime']);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length) {
    throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
  }

  const help = args.includes('--help') || args.includes('-h');
  const runtime = args.includes('--runtime');
  const seedLegacy = args.includes('--seed-legacy') || args.includes('--double-run');
  const doubleRun = args.includes('--double-run');
  return { help, runtime, seedLegacy, doubleRun };
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return;
  }

  const baseline = await runBaselineScenario();
  console.log(`PASS baseline marker=${baseline.marker} legacy_keys=${baseline.legacyCount} removed=0`);

  if (!opts.runtime && opts.seedLegacy) {
    const seeded = await runSeededScenario(opts.doubleRun);
    console.log(`PASS seeded legacy_removed=${seeded.removedFirst}/${seeded.legacyCount}`);
    if (opts.doubleRun) {
      console.log(`PASS idempotent second_removed=${seeded.removedSecond}/${seeded.legacyCount}`);
    }
  }

  if (opts.runtime) {
    const runtime = await runRuntimeScenario(opts.doubleRun);
    console.log(
      `PASS runtime init_removed=${runtime.initRemoved}/${runtime.legacyCount} startup_removed=${runtime.startupRemoved}/${runtime.legacyCount} installed_removed=${runtime.installedRemoved}/${runtime.legacyCount}`
    );
    if (opts.doubleRun) {
      console.log(`PASS runtime-idempotent second_removed=${runtime.secondRemoved}/${runtime.legacyCount}`);
    }
    console.log(`PASS runtime-metrics ensure_calls=${runtime.ensureCalls} settings_reads=${runtime.settingsReads}`);
  }

  console.log('PASS dev/assert-hardcut-purge.js');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FAIL] dev/assert-hardcut-purge.js: ${message}`);
  process.exitCode = 1;
});
