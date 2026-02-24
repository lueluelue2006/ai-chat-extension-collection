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

function testGensparkSiteRegistryEntry(registry) {
  const sites = Array.isArray(registry?.sites) ? registry.sites : [];
  const genspark = sites.find((site) => site && site.id === 'genspark');

  assert.ok(genspark, 'registry.sites should include genspark entry');

  assert.deepStrictEqual(normalizePatterns(genspark.matchPatterns), ['https://www.genspark.ai/*']);
  assert.deepStrictEqual(normalizePatterns(genspark.quicknavPatterns), ['https://www.genspark.ai/agents*']);

  const modules = toLocalArray(genspark.modules).map((item) => String(item || ''));
  const expectedModules = [
    'quicknav',
    'cmdenter_send',
    'genspark_moa_image_autosettings',
    'genspark_credit_balance',
    'genspark_codeblock_fold',
    'genspark_inline_upload_fix',
    'genspark_force_sonnet45_thinking'
  ];

  for (const moduleId of expectedModules) {
    assert.ok(modules.includes(moduleId), `genspark site should include module ${moduleId}`);
  }
}

function testGensparkDefaultSettings(injections, registry) {
  const defaults = injections.buildDefaultSettings(registry);
  const siteModules = defaults?.siteModules?.genspark || {};

  assert.strictEqual(defaults?.sites?.genspark, true, 'default settings should enable genspark site');
  assert.strictEqual(siteModules.quicknav, true, 'default settings should enable genspark quicknav');
  assert.strictEqual(siteModules.cmdenter_send, true, 'default settings should enable genspark cmdenter');
  assert.strictEqual(siteModules.genspark_moa_image_autosettings, true, 'default settings should enable genspark moa autosettings');
  assert.strictEqual(siteModules.genspark_credit_balance, true, 'default settings should enable genspark credit balance');
  assert.strictEqual(siteModules.genspark_codeblock_fold, true, 'default settings should enable genspark codeblock fold');
  assert.strictEqual(siteModules.genspark_inline_upload_fix, true, 'default settings should enable genspark inline upload fix');
  assert.strictEqual(siteModules.genspark_force_sonnet45_thinking, true, 'default settings should enable genspark sonnet45 thinking');
}

function testGensparkContentScriptRouting(injections, registry) {
  const defs = injections.buildContentScriptDefs(registry);
  const expectedAllPatterns = ['https://www.genspark.ai/*'];
  const expectedChatPatterns = ['https://www.genspark.ai/agents*'];

  const quicknav = findDef(defs, 'quicknav_genspark');
  assert.ok(quicknav, 'content script defs should include quicknav_genspark');
  assert.strictEqual(quicknav.siteId, 'genspark');
  assert.strictEqual(quicknav.moduleId, 'quicknav');
  assert.strictEqual(quicknav.runAt, 'document_end');
  assert.deepStrictEqual(normalizePatterns(quicknav.matches), expectedChatPatterns);
  const quicknavJs = toLocalArray(quicknav.js);
  assert.ok(quicknavJs.includes('content/genspark-quicknav.js'));
  assert.ok(quicknavJs.includes('content/menu-bridge.js'));
  assert.ok(quicknavJs.includes('content/ui-pos-drag.js'));

  const scrollGuard = findDef(defs, 'quicknav_scroll_guard_genspark');
  assert.ok(scrollGuard, 'content script defs should include quicknav_scroll_guard_genspark');
  assert.strictEqual(scrollGuard.siteId, 'genspark');
  assert.strictEqual(scrollGuard.moduleId, 'quicknav');
  assert.strictEqual(scrollGuard.runAt, 'document_start');
  assert.strictEqual(scrollGuard.world, 'MAIN');
  assert.deepStrictEqual(normalizePatterns(scrollGuard.matches), expectedChatPatterns);
  const scrollGuardJs = toScriptArray(scrollGuard.js);
  assertRelativeOrder(
    scrollGuardJs,
    ['content/aishortcuts-bridge-main.js', 'content/scroll-guard-main.js'],
    'quicknav_scroll_guard_genspark scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    scrollGuardJs,
    'content/aishortcuts-scope-main.js',
    'content/aishortcuts-bridge-main.js',
    'quicknav_scroll_guard_genspark scripts'
  );

  const cmdenter = findDef(defs, 'quicknav_genspark_cmdenter_send');
  assert.ok(cmdenter, 'content script defs should include quicknav_genspark_cmdenter_send');
  assert.strictEqual(cmdenter.siteId, 'genspark');
  assert.strictEqual(cmdenter.moduleId, 'cmdenter_send');
  assert.strictEqual(cmdenter.runAt, 'document_start');
  assert.deepStrictEqual(normalizePatterns(cmdenter.matches), expectedChatPatterns);
  const cmdenterJs = toScriptArray(cmdenter.js);
  assertRelativeOrder(
    cmdenterJs,
    ['content/aishortcuts-bridge.js', 'content/chatgpt-cmdenter-send/main.js'],
    'quicknav_genspark_cmdenter_send scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    cmdenterJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    'quicknav_genspark_cmdenter_send scripts'
  );

  const moa = findDef(defs, 'quicknav_genspark_moa_image_autosettings');
  assert.ok(moa, 'content script defs should include quicknav_genspark_moa_image_autosettings');
  assert.strictEqual(moa.siteId, 'genspark');
  assert.strictEqual(moa.moduleId, 'genspark_moa_image_autosettings');
  assert.strictEqual(moa.runAt, 'document_start');
  assert.strictEqual(moa.allFrames, true);
  assert.deepStrictEqual(normalizePatterns(moa.matches), expectedAllPatterns);
  const moaJs = toScriptArray(moa.js);
  assertRelativeOrder(
    moaJs,
    ['content/aishortcuts-bridge.js', 'content/genspark-moa-image-autosettings/main.js'],
    'quicknav_genspark_moa_image_autosettings scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    moaJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    'quicknav_genspark_moa_image_autosettings scripts'
  );

  const credit = findDef(defs, 'quicknav_genspark_credit_balance');
  assert.ok(credit, 'content script defs should include quicknav_genspark_credit_balance');
  assert.strictEqual(credit.siteId, 'genspark');
  assert.strictEqual(credit.moduleId, 'genspark_credit_balance');
  assert.strictEqual(credit.runAt, 'document_end');
  assert.deepStrictEqual(normalizePatterns(credit.matches), expectedAllPatterns);
  const creditJs = toScriptArray(credit.js);
  assertRelativeOrder(
    creditJs,
    ['content/aishortcuts-bridge.js', 'content/genspark-credit-balance/main.js'],
    'quicknav_genspark_credit_balance scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    creditJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    'quicknav_genspark_credit_balance scripts'
  );

  const codeblockFold = findDef(defs, 'quicknav_genspark_codeblock_fold');
  assert.ok(codeblockFold, 'content script defs should include quicknav_genspark_codeblock_fold');
  assert.strictEqual(codeblockFold.siteId, 'genspark');
  assert.strictEqual(codeblockFold.moduleId, 'genspark_codeblock_fold');
  assert.strictEqual(codeblockFold.runAt, 'document_end');
  assert.deepStrictEqual(normalizePatterns(codeblockFold.matches), expectedChatPatterns);
  const codeblockFoldJs = toScriptArray(codeblockFold.js);
  assertRelativeOrder(
    codeblockFoldJs,
    ['content/aishortcuts-bridge.js', 'content/genspark-codeblock-fold/main.js'],
    'quicknav_genspark_codeblock_fold scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    codeblockFoldJs,
    'content/aishortcuts-scope.js',
    'content/aishortcuts-bridge.js',
    'quicknav_genspark_codeblock_fold scripts'
  );

  const inlineUploadFix = findDef(defs, 'quicknav_genspark_inline_upload_fix');
  assert.ok(inlineUploadFix, 'content script defs should include quicknav_genspark_inline_upload_fix');
  assert.strictEqual(inlineUploadFix.siteId, 'genspark');
  assert.strictEqual(inlineUploadFix.moduleId, 'genspark_inline_upload_fix');
  assert.strictEqual(inlineUploadFix.runAt, 'document_idle');
  assert.strictEqual(inlineUploadFix.world, 'MAIN');
  assert.deepStrictEqual(normalizePatterns(inlineUploadFix.matches), expectedChatPatterns);
  const inlineUploadFixJs = toScriptArray(inlineUploadFix.js);
  assertRelativeOrder(
    inlineUploadFixJs,
    ['content/aishortcuts-bridge-main.js', 'content/genspark-inline-upload-fix/main.js'],
    'quicknav_genspark_inline_upload_fix scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    inlineUploadFixJs,
    'content/aishortcuts-scope-main.js',
    'content/aishortcuts-bridge-main.js',
    'quicknav_genspark_inline_upload_fix scripts'
  );

  const sonnetThinking = findDef(defs, 'quicknav_genspark_force_sonnet45_thinking');
  assert.ok(sonnetThinking, 'content script defs should include quicknav_genspark_force_sonnet45_thinking');
  assert.strictEqual(sonnetThinking.siteId, 'genspark');
  assert.strictEqual(sonnetThinking.moduleId, 'genspark_force_sonnet45_thinking');
  assert.strictEqual(sonnetThinking.runAt, 'document_start');
  assert.strictEqual(sonnetThinking.world, 'MAIN');
  assert.deepStrictEqual(normalizePatterns(sonnetThinking.matches), expectedChatPatterns);
  const sonnetThinkingJs = toScriptArray(sonnetThinking.js);
  assertRelativeOrder(
    sonnetThinkingJs,
    ['content/aishortcuts-bridge-main.js', 'content/genspark-force-sonnet45-thinking/main.js'],
    'quicknav_genspark_force_sonnet45_thinking scripts'
  );
  assertScopeBeforeBridgeWhenPresent(
    sonnetThinkingJs,
    'content/aishortcuts-scope-main.js',
    'content/aishortcuts-bridge-main.js',
    'quicknav_genspark_force_sonnet45_thinking scripts'
  );

  const gensparkDefs = defs.filter((def) => def && def.siteId === 'genspark');
  assert.strictEqual(gensparkDefs.length, 8, 'genspark should have quicknav + scroll guard + cmdenter + 5 genspark defs');
}

function main() {
  const registry = evalSharedScript('shared/registry.ts').AISHORTCUTS_REGISTRY;
  const injections = evalSharedScript('shared/injections.ts').AISHORTCUTS_INJECTIONS;

  assert.ok(registry, 'AISHORTCUTS_REGISTRY should be available');
  assert.ok(injections, 'AISHORTCUTS_INJECTIONS should be available');
  assert.strictEqual(typeof injections.buildDefaultSettings, 'function');
  assert.strictEqual(typeof injections.buildContentScriptDefs, 'function');

  testGensparkSiteRegistryEntry(registry);
  testGensparkDefaultSettings(injections, registry);
  testGensparkContentScriptRouting(injections, registry);

  console.log('PASS dev/test-genspark-injection-routing.js');
}

main();
