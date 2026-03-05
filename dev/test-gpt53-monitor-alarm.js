#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');

const ROOT = path.join(__dirname, '..');
const GPT53_URLS_KEY = 'aichat_ai_shortcuts_gpt53_probe_urls_v1';

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function transpileTsForVm(tsPath) {
  return transformSync(readText(tsPath), {
    loader: 'ts',
    target: 'chrome96',
    format: 'esm',
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    sourcefile: tsPath
  }).code;
}

function createChromeStub() {
  const alarms = new Map();
  return {
    __alarms: alarms,
    runtime: {
      lastError: null,
      getURL(relPath = '') {
        return `chrome-extension://test/${String(relPath || '')}`;
      },
      sendMessage(_msg, cb) {
        if (typeof cb === 'function') cb();
      }
    },
    alarms: {
      get(name, cb) {
        cb(alarms.get(String(name || '')) || null);
      },
      create(name, info) {
        const period = Number(info?.periodInMinutes) || 0;
        alarms.set(String(name || ''), {
          name: String(name || ''),
          periodInMinutes: period,
          scheduledTime: Date.now() + period * 60 * 1000
        });
      },
      clear(name, cb) {
        const existed = alarms.delete(String(name || ''));
        if (typeof cb === 'function') cb(existed);
      },
      onAlarm: {
        addListener() {}
      }
    },
    action: {
      setBadgeBackgroundColor() {},
      setBadgeText() {}
    },
    tabs: {
      remove(_tabId, cb) {
        if (typeof cb === 'function') cb();
      },
      discard(_tabId, cb) {
        if (typeof cb === 'function') cb();
      },
      create(_opts, cb) {
        if (typeof cb === 'function') cb({ id: 1, status: 'complete' });
      },
      get(_tabId, cb) {
        if (typeof cb === 'function') cb({ id: 1, status: 'complete' });
      },
      onUpdated: {
        addListener() {},
        removeListener() {}
      }
    },
    scripting: {
      executeScript(_opts, cb) {
        if (typeof cb === 'function') cb([]);
      }
    }
  };
}

function createStorageApi(localStore) {
  return {
    async storageGet(areaName, query) {
      assert.strictEqual(areaName, 'local');
      const result = {};
      for (const key of Object.keys(query || {})) {
        result[key] = Object.prototype.hasOwnProperty.call(localStore, key) ? localStore[key] : query[key];
      }
      return result;
    },
    async storageSet(areaName, items) {
      assert.strictEqual(areaName, 'local');
      Object.assign(localStore, items || {});
    },
    async notificationsCreate() {}
  };
}

function loadMonitors({ settingsEnabled = true, storedUrls } = {}) {
  const localStore = {};
  if (storedUrls !== undefined) localStore[GPT53_URLS_KEY] = storedUrls;

  const chrome = createChromeStub();
  const storageApi = createStorageApi(localStore);
  const sandbox = {
    chrome,
    fetch: async () => ({ status: 404 }),
    console: { log() {}, warn() {}, error() {} },
    URL,
    Date,
    setTimeout,
    clearTimeout,
    globalThis: {
      __aiShortcutsSw: {
        chrome: storageApi,
        storage: {
          async getSettings() {
            return { enabled: settingsEnabled };
          }
        }
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(transpileTsForVm('background/sw/monitors.ts'), sandbox, { filename: 'background/sw/monitors.ts' });

  return {
    chrome,
    localStore,
    monitors: sandbox.globalThis.__aiShortcutsSw.monitors
  };
}

async function testMonitorCreatesAlarmWhenEnabled() {
  const env = loadMonitors({ settingsEnabled: true });
  const status = await env.monitors.getGpt53MonitorStatus();
  assert.strictEqual(status.enabled, true, 'default monitor should be enabled when extension is enabled');
  assert.strictEqual(status.reason, 'active');

  const alarm = await env.monitors.ensureGpt53Alarm();
  assert.ok(alarm, 'enabled monitor should create an alarm');
  assert.strictEqual(alarm.periodInMinutes, 5);
  assert.strictEqual(env.chrome.__alarms.size, 1, 'alarm registry should contain the GPT53 alarm');
}

async function testMonitorDisablesAlarmForEmptyUrls() {
  const env = loadMonitors({ settingsEnabled: true, storedUrls: [] });
  const status = await env.monitors.getGpt53MonitorStatus();
  assert.strictEqual(status.enabled, false, 'empty URL list should disable the monitor');
  assert.strictEqual(status.reason, 'no_urls');

  const alarm = await env.monitors.ensureGpt53Alarm();
  assert.strictEqual(alarm, null, 'empty URL list must not keep an alarm alive');
  assert.strictEqual(env.chrome.__alarms.size, 0, 'no alarm should remain when URL list is empty');
}

async function testMonitorDisablesAlarmWhenExtensionDisabled() {
  const env = loadMonitors({
    settingsEnabled: false,
    storedUrls: ['https://cdn.openai.com/API/docs/images/model-page/model-icons/gpt-5.3.png']
  });
  const status = await env.monitors.getGpt53MonitorStatus();
  assert.strictEqual(status.enabled, false, 'global extension disable should disable GPT53 monitor');
  assert.strictEqual(status.reason, 'extension_disabled');

  const alarm = await env.monitors.ensureGpt53Alarm();
  assert.strictEqual(alarm, null, 'disabled extension must not keep a GPT53 alarm');
  assert.strictEqual(env.chrome.__alarms.size, 0, 'no alarm should remain when extension is disabled');
}

async function main() {
  await testMonitorCreatesAlarmWhenEnabled();
  await testMonitorDisablesAlarmForEmptyUrls();
  await testMonitorDisablesAlarmWhenExtensionDisabled();
  console.log('PASS dev/test-gpt53-monitor-alarm.js');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
