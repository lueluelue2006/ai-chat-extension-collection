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

function assertScriptIncluded(def, script, label) {
  const js = toLocalArray(def?.js).map((item) => String(item || ''));
  assert.ok(js.includes(script), `${label}: missing ${script}`);
}

function main() {
  const registry = evalSharedScript('shared/registry.ts').AISHORTCUTS_REGISTRY;
  const injections = evalSharedScript('shared/injections.ts').AISHORTCUTS_INJECTIONS;
  assert.ok(registry, 'AISHORTCUTS_REGISTRY should be available');
  assert.ok(injections, 'AISHORTCUTS_INJECTIONS should be available');
  assert.strictEqual(typeof injections.buildContentScriptDefs, 'function');

  const defs = toLocalArray(injections.buildContentScriptDefs(registry));

  const exportDef = findDef(defs, 'quicknav_chatgpt_export_conversation');
  assert.ok(exportDef, 'defs should include quicknav_chatgpt_export_conversation');
  assertScriptIncluded(exportDef, 'content/chatgpt-mapping-client/main.js', 'chatgpt_export_conversation');

  const treeDef = findDef(defs, 'quicknav_chatgpt_message_tree');
  assert.ok(treeDef, 'defs should include quicknav_chatgpt_message_tree');
  assertScriptIncluded(treeDef, 'content/chatgpt-mapping-client/main.js', 'chatgpt_message_tree');

  const timerDef = findDef(defs, 'quicknav_chatgpt_reply_timer');
  assert.ok(timerDef, 'defs should include quicknav_chatgpt_reply_timer');
  assertScriptIncluded(timerDef, 'content/chatgpt-fetch-hub/consumer-base.js', 'chatgpt_reply_timer');

  const exportSource = readText('content/chatgpt-export-conversation/main.js');
  assert.ok(exportSource.includes('MAPPING_CLIENT_KEY'), 'export should declare mapping client key');
  assert.ok(
    exportSource.includes('mappingClient.fetchConversationMapping'),
    'export should prefer mappingClient.fetchConversationMapping'
  );
  assert.ok(exportSource.includes('mappingClient.getAuthContext'), 'export should prefer mappingClient.getAuthContext');

  const treeSource = readText('content/chatgpt-message-tree/main.js');
  assert.ok(treeSource.includes('MAPPING_CLIENT_KEY'), 'message_tree should declare mapping client key');
  assert.ok(
    treeSource.includes('mappingClient.fetchConversationMapping'),
    'message_tree should prefer mappingClient.fetchConversationMapping'
  );

  const timerSource = readText('content/chatgpt-reply-timer/main.js');
  assert.ok(timerSource.includes('onConversationStart'), 'reply_timer should subscribe onConversationStart');
  assert.ok(timerSource.includes('onConversationDone'), 'reply_timer should subscribe onConversationDone');
  assert.ok(timerSource.includes('if (state.usingHub) return;'), 'reply_timer should retain DOM fallback guard');

  console.log('PASS dev/test-chatgpt-mapping-client-and-reply-timer.js');
}

main();
