#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const BRIDGE_SRC = fs.readFileSync(path.join(ROOT, 'content', 'chatgpt-usage-monitor', 'bridge.js'), 'utf8');

function createLocalStorage(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [String(k), String(v)]));
  return {
    getItem(key) {
      const k = String(key);
      return map.has(k) ? map.get(k) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    _dump() {
      return Object.fromEntries(map.entries());
    }
  };
}

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      const t = String(type);
      if (typeof fn !== 'function') return;
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t).add(fn);
    },
    removeEventListener(type, fn) {
      const t = String(type);
      const set = listeners.get(t);
      if (!set) return;
      set.delete(fn);
      if (!set.size) listeners.delete(t);
    },
    dispatchEvent(ev) {
      const type = String(ev?.type || '');
      const set = listeners.get(type);
      if (!set) return true;
      for (const fn of Array.from(set)) {
        try {
          fn(ev);
        } catch {
          // ignore
        }
      }
      return true;
    }
  };
}

function createChromeStorageArea(items, onChangedEmitter) {
  const store = items && typeof items === 'object' ? { ...items } : {};

  const get = (keys, cb) => {
    const out = {};
    if (keys == null) {
      Object.assign(out, store);
      cb(out);
      return;
    }
    const defaults = keys && typeof keys === 'object' ? keys : {};
    for (const [k, def] of Object.entries(defaults)) out[k] = Object.prototype.hasOwnProperty.call(store, k) ? store[k] : def;
    cb(out);
  };

  const set = (obj, cb) => {
    const changes = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const key = String(k);
      changes[key] = { oldValue: store[key], newValue: v };
      store[key] = v;
    }
    onChangedEmitter('local', changes);
    cb?.();
  };

  const remove = (keys, cb) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    const changes = {};
    for (const k of arr) {
      const key = String(k);
      changes[key] = { oldValue: store[key], newValue: undefined };
      delete store[key];
    }
    onChangedEmitter('local', changes);
    cb?.();
  };

  return { get, set, remove, _store: store };
}

function createChromeMock({ syncItems = {}, localItems = {} } = {}) {
  const onChangedListeners = [];
  const emitOnChanged = (areaName, changes) => {
    for (const fn of onChangedListeners) {
      try {
        fn(changes, areaName);
      } catch {
        // ignore
      }
    }
  };

  const chrome = {
    runtime: { lastError: null },
    storage: {
      onChanged: {
        addListener(fn) {
          if (typeof fn === 'function') onChangedListeners.push(fn);
        }
      },
      sync: {
        get(keys, cb) {
          const out = {};
          const defaults = keys && typeof keys === 'object' ? keys : {};
          for (const [k, def] of Object.entries(defaults)) out[k] = Object.prototype.hasOwnProperty.call(syncItems, k) ? syncItems[k] : def;
          cb(out);
        },
        set(obj, cb) {
          Object.assign(syncItems, obj || {});
          emitOnChanged('sync', Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, { oldValue: undefined, newValue: v }])));
          cb?.();
        }
      },
      local: createChromeStorageArea(localItems, emitOnChanged)
    }
  };

  return { chrome, _emitOnChanged: emitOnChanged };
}

function createTimers() {
  let nextId = 1;
  let queue = [];
  const setTimeout = (fn, ms) => {
    const id = nextId++;
    queue.push({ id, fn, ms: Number(ms) || 0 });
    return id;
  };
  const clearTimeout = (id) => {
    queue = queue.filter((t) => t.id !== id);
  };
  const runAll = () => {
    const batch = queue.slice();
    queue = [];
    for (const t of batch) {
      try {
        t.fn();
      } catch {
        // ignore
      }
    }
  };
  return { setTimeout, clearTimeout, runAll };
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function runBridgeScenario({ now = 1_000_000_000, localStorageInit = {}, chromeLocalInit = {}, chromeSyncInit = {} } = {}) {
  const localStorage = createLocalStorage(localStorageInit);
  const timers = createTimers();
  const win = createEventTarget();
  win.self = win;
  win.top = win;
  win.window = win;

  class CustomEvent {
    constructor(type, init) {
      this.type = String(type || '');
      this.detail = init && typeof init === 'object' ? init.detail : undefined;
    }
  }

  const { chrome, _emitOnChanged } = createChromeMock({ localItems: chromeLocalInit, syncItems: chromeSyncInit });

  const sandbox = {
    window: win,
    globalThis: win,
    localStorage,
    chrome,
    CustomEvent,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    Date: { now: () => now },
    console: { log() {}, warn() {}, error() {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(BRIDGE_SRC, sandbox, { filename: 'content/chatgpt-usage-monitor/bridge.js' });
  await flushPromises();

  return { window: win, localStorage, chrome, timers, emitOnChanged: _emitOnChanged };
}

async function testBootstrapChromeOverridesLocal() {
  const USAGE_KEY = '__aichat_gm_chatgpt_usage_monitor__:usageData';
  const REV_KEY = '__aichat_gm_chatgpt_usage_monitor__:__sync_rev_v1__';
  const chromeData = { models: { a: { requests: [1], quota: 1, windowType: 'daily' } } };

  const ctx = await runBridgeScenario({
    localStorageInit: { [USAGE_KEY]: JSON.stringify({ models: { x: { requests: [9], quota: 9, windowType: 'daily' } } }), [REV_KEY]: JSON.stringify(1) },
    chromeLocalInit: { [USAGE_KEY]: chromeData, [REV_KEY]: 100 }
  });

  const applied = JSON.parse(ctx.localStorage.getItem(USAGE_KEY));
  assert.deepStrictEqual(applied?.models, chromeData.models);
  // Plan is patched on load (default "team") and may be persisted into usageData.
  assert.strictEqual(typeof applied?.planType, 'string');
  const rev = JSON.parse(ctx.localStorage.getItem(REV_KEY));
  assert.strictEqual(typeof rev, 'number');
  assert.ok(rev >= 100);
}

async function testBootstrapLocalPushesToChrome() {
  const USAGE_KEY = '__aichat_gm_chatgpt_usage_monitor__:usageData';
  const REV_KEY = '__aichat_gm_chatgpt_usage_monitor__:__sync_rev_v1__';
  const localData = { models: { a: { requests: [1], quota: 1, windowType: 'daily' } } };

  const ctx = await runBridgeScenario({
    localStorageInit: { [USAGE_KEY]: JSON.stringify(localData), [REV_KEY]: JSON.stringify(200) },
    chromeLocalInit: { [USAGE_KEY]: null, [REV_KEY]: 100 }
  });

  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.chrome.storage.local._store[USAGE_KEY]?.models)), localData.models);
  assert.strictEqual(typeof ctx.chrome.storage.local._store[REV_KEY], 'number');
  assert.ok(ctx.chrome.storage.local._store[REV_KEY] >= 200);
}

async function testDataChangedEventSyncsToChrome() {
  const USAGE_KEY = '__aichat_gm_chatgpt_usage_monitor__:usageData';
  const REV_KEY = '__aichat_gm_chatgpt_usage_monitor__:__sync_rev_v1__';
  const DATA_CHANGED_EVENT = 'chatgpt-usage-monitor:data-changed';

  const localData = { models: { a: { requests: [1], quota: 1, windowType: 'daily' } } };
  const ctx = await runBridgeScenario({
    now: 555,
    localStorageInit: { [USAGE_KEY]: JSON.stringify(localData), [REV_KEY]: JSON.stringify(1) },
    chromeLocalInit: {}
  });

  ctx.window.dispatchEvent({ type: DATA_CHANGED_EVENT });
  ctx.timers.runAll();

  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.chrome.storage.local._store[USAGE_KEY]?.models)), localData.models);
  assert.strictEqual(ctx.chrome.storage.local._store[REV_KEY], 555);
  assert.strictEqual(JSON.parse(ctx.localStorage.getItem(REV_KEY)), 555);
}

async function testChromeOnChangedAppliesToLocal() {
  const USAGE_KEY = '__aichat_gm_chatgpt_usage_monitor__:usageData';
  const REV_KEY = '__aichat_gm_chatgpt_usage_monitor__:__sync_rev_v1__';

  const ctx = await runBridgeScenario({
    localStorageInit: {},
    chromeLocalInit: { [USAGE_KEY]: { models: { a: { requests: [1], quota: 1, windowType: 'daily' } } }, [REV_KEY]: 300 }
  });

  ctx.emitOnChanged('local', { [REV_KEY]: { oldValue: 0, newValue: 300 } });
  assert.deepStrictEqual(JSON.parse(ctx.localStorage.getItem(USAGE_KEY)), JSON.parse(JSON.stringify(ctx.chrome.storage.local._store[USAGE_KEY])));
  const rev = JSON.parse(ctx.localStorage.getItem(REV_KEY));
  assert.strictEqual(typeof rev, 'number');
  assert.ok(rev >= 300);
}

async function main() {
  await testBootstrapChromeOverridesLocal();
  await testBootstrapLocalPushesToChrome();
  await testDataChangedEventSyncsToChrome();
  await testChromeOnChangedAppliesToLocal();
  // eslint-disable-next-line no-console
  console.log('OK dev/test-usage-monitor-bridge.js');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});
