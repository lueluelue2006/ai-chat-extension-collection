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

function testKimiSiteRegistryEntry(registry) {
  const sites = Array.isArray(registry?.sites) ? registry.sites : [];
  const kimi = sites.find((site) => site && site.id === 'kimi');

  assert.ok(kimi, 'registry.sites should include kimi entry');

  const patterns = normalizePatterns(kimi.matchPatterns);
  assert.deepStrictEqual(patterns, ['https://kimi.com/*', 'https://www.kimi.com/*']);

  const modules = toLocalArray(kimi.modules).map((item) => String(item || ''));
  assert.ok(modules.includes('quicknav'), 'kimi site should include quicknav module');
  assert.ok(modules.includes('cmdenter_send'), 'kimi site should include cmdenter module');
}

function testKimiDefaultSettings(injections, registry) {
  const defaults = injections.buildDefaultSettings(registry);
  const siteModules = defaults?.siteModules?.kimi || {};

  assert.strictEqual(defaults?.sites?.kimi, true, 'default settings should enable kimi site');
  assert.strictEqual(siteModules.quicknav, true, 'default settings should enable kimi quicknav');
  assert.strictEqual(siteModules.cmdenter_send, true, 'default settings should enable kimi cmdenter');
}

function testKimiContentScriptRouting(injections, registry) {
  const defs = injections.buildContentScriptDefs(registry);
  const expectedPatterns = ['https://kimi.com/*', 'https://www.kimi.com/*'];

  const kimiQuicknav = findDef(defs, 'quicknav_kimi');
  assert.ok(kimiQuicknav, 'content script defs should include quicknav_kimi');
  assert.strictEqual(kimiQuicknav.siteId, 'kimi');
  assert.strictEqual(kimiQuicknav.moduleId, 'quicknav');
  assert.strictEqual(kimiQuicknav.runAt, 'document_end');
  assert.deepStrictEqual(normalizePatterns(kimiQuicknav.matches), expectedPatterns);
  const kimiQuicknavJs = toLocalArray(kimiQuicknav.js);
  assert.ok(kimiQuicknavJs.includes('content/kimi-quicknav.js'));
  assert.ok(kimiQuicknavJs.includes('content/menu-bridge.js'));
  assert.ok(kimiQuicknavJs.includes('content/ui-pos-drag.js'));

  const kimiScrollGuard = findDef(defs, 'quicknav_scroll_guard_kimi');
  assert.ok(kimiScrollGuard, 'content script defs should include quicknav_scroll_guard_kimi');
  assert.strictEqual(kimiScrollGuard.siteId, 'kimi');
  assert.strictEqual(kimiScrollGuard.moduleId, 'quicknav');
  assert.strictEqual(kimiScrollGuard.runAt, 'document_start');
  assert.strictEqual(kimiScrollGuard.world, 'MAIN');
  assert.deepStrictEqual(normalizePatterns(kimiScrollGuard.matches), expectedPatterns);
  const kimiScrollGuardJs = toScriptArray(kimiScrollGuard.js);
  assertRelativeOrder(
    kimiScrollGuardJs,
    ['content/aishortcuts-bridge-main.js', 'content/scroll-guard-main.js'],
    'quicknav_scroll_guard_kimi scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    kimiScrollGuardJs,
    'content/aishortcuts-scope-main.js',
    'content/aishortcuts-bridge-main.js',
    'quicknav_scroll_guard_kimi scripts'
  );

  const kimiCmdenter = findDef(defs, 'quicknav_kimi_cmdenter_send');
  assert.ok(kimiCmdenter, 'content script defs should include quicknav_kimi_cmdenter_send');
  assert.strictEqual(kimiCmdenter.siteId, 'kimi');
  assert.strictEqual(kimiCmdenter.moduleId, 'cmdenter_send');
  assert.strictEqual(kimiCmdenter.runAt, 'document_start');
  assert.deepStrictEqual(normalizePatterns(kimiCmdenter.matches), expectedPatterns);
  const kimiCmdenterJs = toScriptArray(kimiCmdenter.js);
  assertRelativeOrder(
    kimiCmdenterJs,
    ['content/aishortcuts-bridge.js', 'content/chatgpt-cmdenter-send/main.js'],
    'quicknav_kimi_cmdenter_send scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    kimiCmdenterJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    'quicknav_kimi_cmdenter_send scripts'
  );

  const kimiDefs = defs.filter((def) => def && def.siteId === 'kimi');
  assert.ok(kimiDefs.length >= 3, 'kimi should have at least quicknav, scroll guard, cmdenter defs');

  for (const def of kimiDefs) {
    const matches = normalizePatterns(def.matches);
    assert.deepStrictEqual(matches, expectedPatterns, `kimi def ${def.id} should only target kimi + www.kimi hosts`);
  }
}

function main() {
  const registry = evalSharedScript('shared/registry.ts').AISHORTCUTS_REGISTRY;
  const injections = evalSharedScript('shared/injections.ts').AISHORTCUTS_INJECTIONS;

  assert.ok(registry, 'AISHORTCUTS_REGISTRY should be available');
  assert.ok(injections, 'AISHORTCUTS_INJECTIONS should be available');
  assert.strictEqual(typeof injections.buildDefaultSettings, 'function');
  assert.strictEqual(typeof injections.buildContentScriptDefs, 'function');

  testKimiSiteRegistryEntry(registry);
  testKimiDefaultSettings(injections, registry);
  testKimiContentScriptRouting(injections, registry);

  console.log('PASS dev/test-kimi-injection-routing.js');
}

main();
