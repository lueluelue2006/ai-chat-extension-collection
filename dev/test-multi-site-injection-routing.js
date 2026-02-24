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

function assertSiteRegistryEntry(registry, { siteId, expectedMatchPatterns, expectedQuickNavPatterns, expectedModules }) {
  const sites = Array.isArray(registry?.sites) ? registry.sites : [];
  const site = sites.find((item) => item && item.id === siteId);

  assert.ok(site, `registry.sites should include ${siteId} entry`);
  assert.deepStrictEqual(normalizePatterns(site.matchPatterns), normalizePatterns(expectedMatchPatterns));

  if (Array.isArray(expectedQuickNavPatterns)) {
    assert.deepStrictEqual(normalizePatterns(site.quicknavPatterns), normalizePatterns(expectedQuickNavPatterns));
  }

  const modules = toLocalArray(site.modules).map((item) => String(item || ''));
  for (const moduleId of expectedModules) {
    assert.ok(modules.includes(moduleId), `${siteId} should include module ${moduleId}`);
  }
}

function assertSiteDefaultSettings(injections, registry, siteId) {
  const defaults = injections.buildDefaultSettings(registry);
  const siteModules = defaults?.siteModules?.[siteId] || {};

  assert.strictEqual(defaults?.sites?.[siteId], true, `default settings should enable ${siteId}`);
  assert.strictEqual(siteModules.quicknav, true, `default settings should enable ${siteId}.quicknav`);
  assert.strictEqual(siteModules.cmdenter_send, true, `default settings should enable ${siteId}.cmdenter_send`);
}

function assertSiteDefs(defs, {
  siteId,
  quicknavDefId,
  quicknavFile,
  quicknavPatterns,
  cmdenterDefId,
  cmdenterPatterns
}) {
  const quicknav = findDef(defs, quicknavDefId);
  assert.ok(quicknav, `defs should include ${quicknavDefId}`);
  assert.strictEqual(quicknav.siteId, siteId);
  assert.strictEqual(quicknav.moduleId, 'quicknav');
  assert.strictEqual(quicknav.runAt, 'document_end');
  assert.deepStrictEqual(normalizePatterns(quicknav.matches), normalizePatterns(quicknavPatterns));
  const quicknavJs = toLocalArray(quicknav.js);
  assert.ok(quicknavJs.includes(quicknavFile), `${quicknavDefId} should include ${quicknavFile}`);
  assert.ok(quicknavJs.includes('content/menu-bridge.js'), `${quicknavDefId} should include menu-bridge`);
  assert.ok(quicknavJs.includes('content/ui-pos-drag.js'), `${quicknavDefId} should include ui-pos-drag`);

  const guardId = `quicknav_scroll_guard_${siteId}`;
  const guard = findDef(defs, guardId);
  assert.ok(guard, `defs should include ${guardId}`);
  assert.strictEqual(guard.siteId, siteId);
  assert.strictEqual(guard.moduleId, 'quicknav');
  assert.strictEqual(guard.runAt, 'document_start');
  assert.strictEqual(guard.world, 'MAIN');
  assert.deepStrictEqual(normalizePatterns(guard.matches), normalizePatterns(quicknavPatterns));
  const guardJs = toScriptArray(guard.js);
  assertRelativeOrder(
    guardJs,
    ['content/aishortcuts-bridge-main.js', 'content/scroll-guard-main.js'],
    `${guardId} scripts`
  );
  assertScopeBeforeBridgeWhenPresent(
    guardJs,
    'content/aishortcuts-scope-main.js',
    'content/aishortcuts-bridge-main.js',
    `${guardId} scripts`
  );

  const cmdenter = findDef(defs, cmdenterDefId);
  assert.ok(cmdenter, `defs should include ${cmdenterDefId}`);
  assert.strictEqual(cmdenter.siteId, siteId);
  assert.strictEqual(cmdenter.moduleId, 'cmdenter_send');
  assert.strictEqual(cmdenter.runAt, 'document_start');
  assert.deepStrictEqual(normalizePatterns(cmdenter.matches), normalizePatterns(cmdenterPatterns));
  const cmdenterJs = toScriptArray(cmdenter.js);
  assertRelativeOrder(
    cmdenterJs,
    ['content/aishortcuts-bridge.js', 'content/chatgpt-cmdenter-send/main.js'],
    `${cmdenterDefId} scripts`
  );
  assertScopeBeforeBridgeWhenPresent(
    cmdenterJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    `${cmdenterDefId} scripts`
  );

  const siteDefs = defs.filter((def) => def && def.siteId === siteId);
  assert.strictEqual(siteDefs.length, 3, `${siteId} should have quicknav + scroll guard + cmdenter defs`);
}

function main() {
  const registry = evalSharedScript('shared/registry.ts').AISHORTCUTS_REGISTRY;
  const injections = evalSharedScript('shared/injections.ts').AISHORTCUTS_INJECTIONS;
  const defs = injections.buildContentScriptDefs(registry);

  assert.ok(registry, 'AISHORTCUTS_REGISTRY should be available');
  assert.ok(injections, 'AISHORTCUTS_INJECTIONS should be available');

  assertSiteRegistryEntry(registry, {
    siteId: 'gemini_app',
    expectedMatchPatterns: ['https://gemini.google.com/*'],
    expectedQuickNavPatterns: ['https://gemini.google.com/app*'],
    expectedModules: ['quicknav', 'cmdenter_send']
  });
  assertSiteRegistryEntry(registry, {
    siteId: 'ernie',
    expectedMatchPatterns: ['https://ernie.baidu.com/*'],
    expectedQuickNavPatterns: null,
    expectedModules: ['quicknav', 'cmdenter_send']
  });
  assertSiteRegistryEntry(registry, {
    siteId: 'zai',
    expectedMatchPatterns: ['https://chat.z.ai/*'],
    expectedQuickNavPatterns: null,
    expectedModules: ['quicknav', 'cmdenter_send']
  });

  assertSiteDefaultSettings(injections, registry, 'gemini_app');
  assertSiteDefaultSettings(injections, registry, 'ernie');
  assertSiteDefaultSettings(injections, registry, 'zai');

  assertSiteDefs(defs, {
    siteId: 'gemini_app',
    quicknavDefId: 'quicknav_gemini_app',
    quicknavFile: 'content/gemini-app-quicknav.js',
    quicknavPatterns: ['https://gemini.google.com/app*'],
    cmdenterDefId: 'quicknav_gemini_app_cmdenter_send',
    cmdenterPatterns: ['https://gemini.google.com/*']
  });

  assertSiteDefs(defs, {
    siteId: 'ernie',
    quicknavDefId: 'quicknav_ernie',
    quicknavFile: 'content/ernie-quicknav.js',
    quicknavPatterns: ['https://ernie.baidu.com/*'],
    cmdenterDefId: 'quicknav_ernie_cmdenter_send',
    cmdenterPatterns: ['https://ernie.baidu.com/*']
  });

  assertSiteDefs(defs, {
    siteId: 'zai',
    quicknavDefId: 'quicknav_zai',
    quicknavFile: 'content/zai-quicknav.js',
    quicknavPatterns: ['https://chat.z.ai/*'],
    cmdenterDefId: 'quicknav_zai_cmdenter_send',
    cmdenterPatterns: ['https://chat.z.ai/*']
  });

  console.log('PASS dev/test-multi-site-injection-routing.js');
}

main();
