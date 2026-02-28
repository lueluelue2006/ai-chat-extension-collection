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

function toLocalArray(value) {
  return Array.from(Array.isArray(value) ? value : []);
}

function findDef(defs, id) {
  return defs.find((item) => item && item.id === id) || null;
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

function testScopeHelperOrdering(defs) {
  const ISOLATED_SCOPE = 'content/aishortcuts-scope.js';
  const ISOLATED_BRIDGE = 'content/aishortcuts-bridge.js';
  const MAIN_SCOPE = 'content/aishortcuts-scope-main.js';
  const MAIN_BRIDGE = 'content/aishortcuts-bridge-main.js';
  const MAIN_GUARD = 'content/scroll-guard-main.js';

  let orderingChecks = 0;
  let defsWithIsolatedBridge = 0;
  let defsWithMainBridge = 0;
  let defsWithMainGuard = 0;

  for (const def of defs) {
    const id = String(def?.id || '<unknown>');
    const js = toLocalArray(def?.js).map((item) => String(item || ''));

    const isolatedBridgeIndex = js.indexOf(ISOLATED_BRIDGE);
    if (isolatedBridgeIndex >= 0) {
      defsWithIsolatedBridge += 1;
      const isolatedScopeIndex = js.indexOf(ISOLATED_SCOPE);
      assert.ok(isolatedScopeIndex >= 0, `${id}: missing ${ISOLATED_SCOPE}`);
      orderingChecks += 1;
      assert.ok(isolatedScopeIndex < isolatedBridgeIndex, `${id}: quicknav-scope should be before quicknav-bridge`);
    }

    const mainBridgeIndex = js.indexOf(MAIN_BRIDGE);
    const mainScopeIndex = js.indexOf(MAIN_SCOPE);
    const mainGuardIndex = js.indexOf(MAIN_GUARD);

    if (mainBridgeIndex >= 0) {
      defsWithMainBridge += 1;
      assert.ok(mainScopeIndex >= 0, `${id}: missing ${MAIN_SCOPE}`);
      orderingChecks += 1;
      assert.ok(mainScopeIndex < mainBridgeIndex, `${id}: quicknav-scope-main should be before quicknav-bridge-main`);
    }

    if (mainGuardIndex >= 0) {
      defsWithMainGuard += 1;
      assert.ok(mainBridgeIndex >= 0, `${id}: missing ${MAIN_BRIDGE}`);
      assert.ok(mainScopeIndex >= 0, `${id}: missing ${MAIN_SCOPE}`);
      orderingChecks += 1;
      assert.ok(mainBridgeIndex < mainGuardIndex, `${id}: quicknav-bridge-main should be before scroll-guard-main`);
      assert.ok(mainScopeIndex < mainGuardIndex, `${id}: quicknav-scope-main should be before scroll-guard-main`);
    }
  }

  assert.ok(defsWithIsolatedBridge > 0, 'expected at least one def with isolated bridge scripts');
  assert.ok(defsWithMainBridge > 0, 'expected at least one def with main bridge scripts');
  assert.ok(defsWithMainGuard > 0, 'expected at least one def with main guard scripts');
  assert.ok(orderingChecks > 0, 'scope helper ordering checks should run');
}

function testChatgptQuicknavCoreOrdering(defs) {
  const chatgpt = findDef(defs, 'quicknav_chatgpt');
  assert.ok(chatgpt, 'defs should include quicknav_chatgpt');
  const js = toLocalArray(chatgpt.js).map((item) => String(item || ''));

  assertRelativeOrder(
    js,
    ['content/aishortcuts-bridge.js', 'content/chatgpt-core.js', 'content/menu-bridge.js', 'content/chatgpt-quicknav.js'],
    'quicknav_chatgpt ordering'
  );
}

function testGrokQuicknavOrdering(defs) {
  const grokQuicknav = findDef(defs, 'quicknav_grok');
  assert.ok(grokQuicknav, 'defs should include quicknav_grok');
  const quicknavJs = toLocalArray(grokQuicknav.js).map((item) => String(item || ''));

  assertRelativeOrder(
    quicknavJs,
    ['content/aishortcuts-bridge.js', 'content/menu-bridge.js', 'content/grok-quicknav.js'],
    'quicknav_grok ordering'
  );

  const grokGuard = findDef(defs, 'quicknav_scroll_guard_grok');
  assert.ok(grokGuard, 'defs should include quicknav_scroll_guard_grok');
  const guardJs = toLocalArray(grokGuard.js).map((item) => String(item || ''));
  assertRelativeOrder(
    guardJs,
    ['content/aishortcuts-bridge-main.js', 'content/scroll-guard-main.js'],
    'quicknav_scroll_guard_grok ordering'
  );
}

function testChatgptTreeMappingOrdering(defs) {
  const treeDef = findDef(defs, 'quicknav_chatgpt_message_tree');
  assert.ok(treeDef, 'defs should include quicknav_chatgpt_message_tree');
  const js = toLocalArray(treeDef.js).map((item) => String(item || ''));

  assertRelativeOrder(
    js,
    [
      'content/aishortcuts-bridge-main.js',
      'content/chatgpt-core-main.js',
      'content/chatgpt-mapping-client/main.js',
      'content/chatgpt-fetch-hub/main.js',
      'content/chatgpt-message-tree/main.js'
    ],
    'quicknav_chatgpt_message_tree ordering'
  );
}

function testChatgptExportMappingOrdering(defs) {
  const exportDef = findDef(defs, 'quicknav_chatgpt_export_conversation');
  assert.ok(exportDef, 'defs should include quicknav_chatgpt_export_conversation');
  const js = toLocalArray(exportDef.js).map((item) => String(item || ''));

  assertRelativeOrder(
    js,
    [
      'content/aishortcuts-bridge.js',
      'content/chatgpt-core.js',
      'content/chatgpt-mapping-client/main.js',
      'content/menu-bridge.js',
      'content/chatgpt-export-conversation/main.js'
    ],
    'quicknav_chatgpt_export_conversation ordering'
  );
}

function testChatgptReplyTimerHubOrdering(defs) {
  const timerDef = findDef(defs, 'quicknav_chatgpt_reply_timer');
  assert.ok(timerDef, 'defs should include quicknav_chatgpt_reply_timer');
  const js = toLocalArray(timerDef.js).map((item) => String(item || ''));

  assertRelativeOrder(
    js,
    [
      'content/aishortcuts-bridge-main.js',
      'content/chatgpt-core-main.js',
      'content/chatgpt-fetch-hub/main.js',
      'content/chatgpt-fetch-hub/consumer-base.js',
      'content/chatgpt-reply-timer/main.js'
    ],
    'quicknav_chatgpt_reply_timer ordering'
  );
}

function main() {
  const registry = evalSharedScript('shared/registry.ts').AISHORTCUTS_REGISTRY;
  const injections = evalSharedScript('shared/injections.ts').AISHORTCUTS_INJECTIONS;

  assert.ok(registry, 'AISHORTCUTS_REGISTRY should be available');
  assert.ok(injections, 'AISHORTCUTS_INJECTIONS should be available');
  assert.strictEqual(typeof injections.buildContentScriptDefs, 'function');

  const defs = toLocalArray(injections.buildContentScriptDefs(registry));
  testScopeHelperOrdering(defs);
  testChatgptQuicknavCoreOrdering(defs);
  testGrokQuicknavOrdering(defs);
  testChatgptTreeMappingOrdering(defs);
  testChatgptExportMappingOrdering(defs);
  testChatgptReplyTimerHubOrdering(defs);

  console.log('PASS dev/test-mcp-smoke-injection-ordering.js');
}

main();
