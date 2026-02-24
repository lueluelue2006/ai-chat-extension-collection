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

function testGrokSiteRegistryEntry(registry) {
  const sites = Array.isArray(registry?.sites) ? registry.sites : [];
  const grok = sites.find((site) => site && site.id === 'grok');

  assert.ok(grok, 'registry.sites should include grok entry');

  assert.deepStrictEqual(normalizePatterns(grok.matchPatterns), ['https://grok.com/*']);
  assert.deepStrictEqual(normalizePatterns(grok.quicknavPatterns), ['https://grok.com/c/*']);

  const modules = toLocalArray(grok.modules).map((item) => String(item || ''));
  assert.ok(modules.includes('quicknav'), 'grok site should include quicknav module');
  assert.ok(modules.includes('cmdenter_send'), 'grok site should include cmdenter module');
  assert.ok(modules.includes('grok_rate_limit_display'), 'grok site should include rate-limit module');
  assert.ok(modules.includes('grok_trash_cleanup'), 'grok site should include trash-cleanup module');
}

function testGrokDefaultSettings(injections, registry) {
  const defaults = injections.buildDefaultSettings(registry);
  const siteModules = defaults?.siteModules?.grok || {};

  assert.strictEqual(defaults?.sites?.grok, true, 'default settings should enable grok site');
  assert.strictEqual(siteModules.quicknav, true, 'default settings should enable grok quicknav');
  assert.strictEqual(siteModules.cmdenter_send, true, 'default settings should enable grok cmdenter');
  assert.strictEqual(siteModules.grok_rate_limit_display, true, 'default settings should enable grok rate limit display');
  assert.strictEqual(siteModules.grok_trash_cleanup, true, 'default settings should enable grok trash cleanup');
}

function testGrokContentScriptRouting(injections, registry) {
  const defs = injections.buildContentScriptDefs(registry);
  const expectedQuickNavPatterns = ['https://grok.com/c/*'];
  const expectedSitePatterns = ['https://grok.com/*'];
  const expectedTrashPatterns = ['https://grok.com/deleted-conversations*'];

  const grokQuicknav = findDef(defs, 'quicknav_grok');
  assert.ok(grokQuicknav, 'content script defs should include quicknav_grok');
  assert.strictEqual(grokQuicknav.siteId, 'grok');
  assert.strictEqual(grokQuicknav.moduleId, 'quicknav');
  assert.strictEqual(grokQuicknav.runAt, 'document_end');
  assert.deepStrictEqual(normalizePatterns(grokQuicknav.matches), expectedQuickNavPatterns);
  const grokQuicknavJs = toLocalArray(grokQuicknav.js);
  assert.ok(grokQuicknavJs.includes('content/grok-quicknav.js'));
  assert.ok(grokQuicknavJs.includes('content/menu-bridge.js'));
  assert.ok(grokQuicknavJs.includes('content/ui-pos-drag.js'));

  const grokScrollGuard = findDef(defs, 'quicknav_scroll_guard_grok');
  assert.ok(grokScrollGuard, 'content script defs should include quicknav_scroll_guard_grok');
  assert.strictEqual(grokScrollGuard.siteId, 'grok');
  assert.strictEqual(grokScrollGuard.moduleId, 'quicknav');
  assert.strictEqual(grokScrollGuard.runAt, 'document_start');
  assert.strictEqual(grokScrollGuard.world, 'MAIN');
  assert.deepStrictEqual(normalizePatterns(grokScrollGuard.matches), expectedQuickNavPatterns);
  const grokScrollGuardJs = toScriptArray(grokScrollGuard.js);
  assertRelativeOrder(
    grokScrollGuardJs,
    ['content/aishortcuts-bridge-main.js', 'content/scroll-guard-main.js'],
    'quicknav_scroll_guard_grok scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    grokScrollGuardJs,
    'content/aishortcuts-scope-main.js',
    'content/aishortcuts-bridge-main.js',
    'quicknav_scroll_guard_grok scripts'
  );

  const grokCmdenter = findDef(defs, 'quicknav_grok_cmdenter_send');
  assert.ok(grokCmdenter, 'content script defs should include quicknav_grok_cmdenter_send');
  assert.strictEqual(grokCmdenter.siteId, 'grok');
  assert.strictEqual(grokCmdenter.moduleId, 'cmdenter_send');
  assert.strictEqual(grokCmdenter.runAt, 'document_start');
  assert.deepStrictEqual(normalizePatterns(grokCmdenter.matches), expectedSitePatterns);
  const grokCmdenterJs = toScriptArray(grokCmdenter.js);
  assertRelativeOrder(
    grokCmdenterJs,
    ['content/aishortcuts-bridge.js', 'content/chatgpt-cmdenter-send/main.js'],
    'quicknav_grok_cmdenter_send scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    grokCmdenterJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    'quicknav_grok_cmdenter_send scripts'
  );

  const grokRateLimit = findDef(defs, 'quicknav_grok_rate_limit_display');
  assert.ok(grokRateLimit, 'content script defs should include quicknav_grok_rate_limit_display');
  assert.strictEqual(grokRateLimit.siteId, 'grok');
  assert.strictEqual(grokRateLimit.moduleId, 'grok_rate_limit_display');
  assert.strictEqual(grokRateLimit.runAt, 'document_end');
  assert.deepStrictEqual(normalizePatterns(grokRateLimit.matches), expectedQuickNavPatterns);
  const grokRateLimitJs = toScriptArray(grokRateLimit.js);
  assertRelativeOrder(
    grokRateLimitJs,
    ['content/aishortcuts-bridge.js', 'content/grok-rate-limit-display/main.js'],
    'quicknav_grok_rate_limit_display scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    grokRateLimitJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    'quicknav_grok_rate_limit_display scripts'
  );

  const grokTrashCleanup = findDef(defs, 'quicknav_grok_trash_cleanup');
  assert.ok(grokTrashCleanup, 'content script defs should include quicknav_grok_trash_cleanup');
  assert.strictEqual(grokTrashCleanup.siteId, 'grok');
  assert.strictEqual(grokTrashCleanup.moduleId, 'grok_trash_cleanup');
  assert.strictEqual(grokTrashCleanup.runAt, 'document_end');
  assert.deepStrictEqual(normalizePatterns(grokTrashCleanup.matches), expectedTrashPatterns);
  const grokTrashCleanupJs = toScriptArray(grokTrashCleanup.js);
  assertRelativeOrder(
    grokTrashCleanupJs,
    ['content/aishortcuts-bridge.js', 'content/grok-trash-cleanup/main.js'],
    'quicknav_grok_trash_cleanup scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    grokTrashCleanupJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    'quicknav_grok_trash_cleanup scripts'
  );

  const grokDefs = defs.filter((def) => def && def.siteId === 'grok');
  assert.strictEqual(grokDefs.length, 5, 'grok should have quicknav + scroll guard + cmdenter + rate-limit + trash-cleanup defs in this scope');

  for (const def of grokDefs) {
    const matches = normalizePatterns(def.matches);
    if (def.id === 'quicknav_grok_trash_cleanup') {
      assert.deepStrictEqual(matches, expectedTrashPatterns, `grok def ${def.id} should target deleted conversations pages`);
    } else if (def.id === 'quicknav_grok_cmdenter_send') {
      assert.deepStrictEqual(matches, expectedSitePatterns, `grok def ${def.id} should target all grok pages to survive SPA route hops`);
    } else {
      assert.deepStrictEqual(matches, expectedQuickNavPatterns, `grok def ${def.id} should only target grok conversation paths`);
    }
  }
}

function main() {
  const registry = evalSharedScript('shared/registry.ts').AISHORTCUTS_REGISTRY;
  const injections = evalSharedScript('shared/injections.ts').AISHORTCUTS_INJECTIONS;

  assert.ok(registry, 'AISHORTCUTS_REGISTRY should be available');
  assert.ok(injections, 'AISHORTCUTS_INJECTIONS should be available');
  assert.strictEqual(typeof injections.buildDefaultSettings, 'function');
  assert.strictEqual(typeof injections.buildContentScriptDefs, 'function');

  testGrokSiteRegistryEntry(registry);
  testGrokDefaultSettings(injections, registry);
  testGrokContentScriptRouting(injections, registry);

  console.log('PASS dev/test-grok-injection-routing.js');
}

main();
