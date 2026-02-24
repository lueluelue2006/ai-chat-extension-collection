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

function evalSharedScript(tsPath) {
  const source = readText(tsPath);
  const code = transformSync(source, {
    loader: 'ts',
    target: 'chrome96',
    format: 'esm',
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    sourcefile: tsPath
  }).code;

  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: tsPath });
  return sandbox.globalThis;
}

function normalizePatterns(value) {
  return Array.from(Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .sort();
}

function toLocalArray(value) {
  return Array.from(Array.isArray(value) ? value : []);
}

function toScriptArray(value) {
  return toLocalArray(value).map((item) => String(item || ''));
}

function assertRelativeOrder(jsFiles, expectedOrder, messagePrefix) {
  let lastIndex = -1;
  for (let i = 0; i < expectedOrder.length; i += 1) {
    const file = expectedOrder[i];
    const index = jsFiles.indexOf(file);
    assert.ok(index >= 0, `${messagePrefix}: missing ${file}`);
    if (i > 0) {
      assert.ok(index > lastIndex, `${messagePrefix}: ${file} should appear after ${expectedOrder[i - 1]}`);
    }
    lastIndex = index;
  }
}

function assertScopeBeforeBridgeWhenPresent(jsFiles, scopeFile, bridgeFile, messagePrefix) {
  const scopeIndex = jsFiles.indexOf(scopeFile);
  const bridgeIndex = jsFiles.indexOf(bridgeFile);
  assert.ok(scopeIndex >= 0, `${messagePrefix}: missing ${scopeFile}`);
  assert.ok(bridgeIndex >= 0, `${messagePrefix}: missing ${bridgeFile}`);
  assert.ok(scopeIndex < bridgeIndex, `${messagePrefix}: ${scopeFile} should be before ${bridgeFile}`);
}

function findDef(defs, id) {
  return defs.find((item) => item && item.id === id) || null;
}

function testDeepseekSiteRegistryEntry(registry) {
  const sites = Array.isArray(registry?.sites) ? registry.sites : [];
  const deepseek = sites.find((site) => site && site.id === 'deepseek');

  assert.ok(deepseek, 'registry.sites should include deepseek entry');

  const patterns = normalizePatterns(deepseek.matchPatterns);
  assert.deepStrictEqual(patterns, ['https://chat.deepseek.com/*']);

  const modules = toLocalArray(deepseek.modules).map((item) => String(item || ''));
  assert.ok(modules.includes('quicknav'), 'deepseek site should include quicknav module');
  assert.ok(modules.includes('cmdenter_send'), 'deepseek site should include cmdenter module');
}

function testDeepseekDefaultSettings(injections, registry) {
  const defaults = injections.buildDefaultSettings(registry);
  const siteModules = defaults?.siteModules?.deepseek || {};

  assert.strictEqual(defaults?.sites?.deepseek, true, 'default settings should enable deepseek site');
  assert.strictEqual(siteModules.quicknav, true, 'default settings should enable deepseek quicknav');
  assert.strictEqual(siteModules.cmdenter_send, true, 'default settings should enable deepseek cmdenter');
}

function testDeepseekContentScriptRouting(injections, registry) {
  const defs = injections.buildContentScriptDefs(registry);
  const expectedPatterns = ['https://chat.deepseek.com/*'];

  const deepseekQuicknav = findDef(defs, 'quicknav_deepseek');
  assert.ok(deepseekQuicknav, 'content script defs should include quicknav_deepseek');
  assert.strictEqual(deepseekQuicknav.siteId, 'deepseek');
  assert.strictEqual(deepseekQuicknav.moduleId, 'quicknav');
  assert.strictEqual(deepseekQuicknav.runAt, 'document_end');
  assert.deepStrictEqual(normalizePatterns(deepseekQuicknav.matches), expectedPatterns);
  const deepseekQuicknavJs = toLocalArray(deepseekQuicknav.js);
  assert.ok(deepseekQuicknavJs.includes('content/deepseek-quicknav.js'));
  assert.ok(deepseekQuicknavJs.includes('content/menu-bridge.js'));
  assert.ok(deepseekQuicknavJs.includes('content/ui-pos-drag.js'));

  const deepseekScrollGuard = findDef(defs, 'quicknav_scroll_guard_deepseek');
  assert.ok(deepseekScrollGuard, 'content script defs should include quicknav_scroll_guard_deepseek');
  assert.strictEqual(deepseekScrollGuard.siteId, 'deepseek');
  assert.strictEqual(deepseekScrollGuard.moduleId, 'quicknav');
  assert.strictEqual(deepseekScrollGuard.runAt, 'document_start');
  assert.strictEqual(deepseekScrollGuard.world, 'MAIN');
  assert.deepStrictEqual(normalizePatterns(deepseekScrollGuard.matches), expectedPatterns);
  const deepseekScrollGuardJs = toScriptArray(deepseekScrollGuard.js);
  assertRelativeOrder(
    deepseekScrollGuardJs,
    ['content/aishortcuts-bridge-main.js', 'content/scroll-guard-main.js'],
    'quicknav_scroll_guard_deepseek scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    deepseekScrollGuardJs,
    'content/aishortcuts-scope-main.js',
    'content/aishortcuts-bridge-main.js',
    'quicknav_scroll_guard_deepseek scripts'
  );

  const deepseekCmdenter = findDef(defs, 'quicknav_deepseek_cmdenter_send');
  assert.ok(deepseekCmdenter, 'content script defs should include quicknav_deepseek_cmdenter_send');
  assert.strictEqual(deepseekCmdenter.siteId, 'deepseek');
  assert.strictEqual(deepseekCmdenter.moduleId, 'cmdenter_send');
  assert.strictEqual(deepseekCmdenter.runAt, 'document_start');
  assert.deepStrictEqual(normalizePatterns(deepseekCmdenter.matches), expectedPatterns);
  const deepseekCmdenterJs = toScriptArray(deepseekCmdenter.js);
  assertRelativeOrder(
    deepseekCmdenterJs,
    ['content/aishortcuts-bridge.js', 'content/chatgpt-cmdenter-send/main.js'],
    'quicknav_deepseek_cmdenter_send scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    deepseekCmdenterJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    'quicknav_deepseek_cmdenter_send scripts'
  );

  const deepseekDefs = defs.filter((def) => def && def.siteId === 'deepseek');
  assert.strictEqual(deepseekDefs.length, 3, 'deepseek should have quicknav + scroll guard + cmdenter defs');

  for (const def of deepseekDefs) {
    const matches = normalizePatterns(def.matches);
    assert.deepStrictEqual(matches, expectedPatterns, `deepseek def ${def.id} should only target chat.deepseek.com`);
  }
}

function main() {
  const registry = evalSharedScript('shared/registry.ts').AISHORTCUTS_REGISTRY;
  const injections = evalSharedScript('shared/injections.ts').AISHORTCUTS_INJECTIONS;

  assert.ok(registry, 'AISHORTCUTS_REGISTRY should be available');
  assert.ok(injections, 'AISHORTCUTS_INJECTIONS should be available');
  assert.strictEqual(typeof injections.buildDefaultSettings, 'function');
  assert.strictEqual(typeof injections.buildContentScriptDefs, 'function');

  testDeepseekSiteRegistryEntry(registry);
  testDeepseekDefaultSettings(injections, registry);
  testDeepseekContentScriptRouting(injections, registry);

  console.log('PASS dev/test-deepseek-injection-routing.js');
}

main();
