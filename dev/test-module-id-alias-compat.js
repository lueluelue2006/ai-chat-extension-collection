#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');

const ROOT = path.join(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
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

function loadSharedConfigSandbox() {
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);

  vm.runInContext(transpileTsForVm('shared/registry.ts'), sandbox, { filename: 'shared/registry.ts' });
  vm.runInContext(transpileTsForVm('shared/injections.ts'), sandbox, { filename: 'shared/injections.ts' });

  const registry = sandbox.globalThis.AISHORTCUTS_REGISTRY;
  const injections = sandbox.globalThis.AISHORTCUTS_INJECTIONS;
  assert.ok(registry, 'AISHORTCUTS_REGISTRY should be available');
  assert.ok(injections, 'AISHORTCUTS_INJECTIONS should be available');

  const swSandbox = {
    globalThis: {
      __aiShortcutsSw: {
        chrome: {
          storageGet: async () => ({ quicknav_settings: null }),
          storageSet: async () => void 0,
          scriptingGetRegisteredContentScripts: async () => []
        }
      }
    }
  };
  vm.createContext(swSandbox);
  vm.runInContext(transpileTsForVm('background/sw/storage.ts'), swSandbox, { filename: 'background/sw/storage.ts' });

  const storage = swSandbox.globalThis.__aiShortcutsSw?.storage;
  assert.ok(storage, 'background storage API should be available');

  storage.initConfig({
    sharedConfigLoaded: true,
    registry,
    injections
  });

  return { registry, storage };
}

function testRegistryModuleAlias(registry) {
  const aliases = registry?.moduleAliases || {};
  assert.strictEqual(aliases.chatgpt_cmdenter_send, 'cmdenter_send', 'registry should expose cmdenter module legacy alias');
  assert.ok(registry.modules?.cmdenter_send, 'registry should expose cmdenter_send module');
  assert.ok(!registry.modules?.chatgpt_cmdenter_send, 'registry should not keep legacy cmdenter module id in modules map');
}

function testNormalizeLegacyModuleSetting(storage) {
  const raw = {
    enabled: true,
    sites: { grok: true },
    scrollLockDefaults: { grok: true },
    siteModules: {
      grok: {
        quicknav: true,
        chatgpt_cmdenter_send: false,
        grok_rate_limit_display: true,
        grok_trash_cleanup: true
      }
    }
  };

  const normalized = storage.normalizeSettings(raw);
  assert.strictEqual(normalized?.siteModules?.grok?.cmdenter_send, false, 'normalizeSettings should migrate legacy cmdenter key');
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(normalized?.siteModules?.grok || {}, 'chatgpt_cmdenter_send'),
    false,
    'normalizeSettings result should only keep canonical cmdenter key'
  );
}

function testPatchOpsAcceptLegacyModuleKey(storage) {
  const base = storage.normalizeSettings(null);
  const next = storage.applySettingsPatchOps(base, [
    { op: 'set', path: ['siteModules', 'grok', 'chatgpt_cmdenter_send'], value: false }
  ]);

  assert.strictEqual(next?.siteModules?.grok?.cmdenter_send, false, 'patch ops should canonicalize legacy module key');

  const next2 = storage.applySettingsPatchOps(next, [
    { op: 'set', path: ['siteModules', 'grok', 'cmdenter_send'], value: true }
  ]);
  assert.strictEqual(next2?.siteModules?.grok?.cmdenter_send, true, 'patch ops should also support canonical module key');
}

function main() {
  const { registry, storage } = loadSharedConfigSandbox();
  testRegistryModuleAlias(registry);
  testNormalizeLegacyModuleSetting(storage);
  testPatchOpsAcceptLegacyModuleKey(storage);
  console.log('PASS dev/test-module-id-alias-compat.js');
}

main();
