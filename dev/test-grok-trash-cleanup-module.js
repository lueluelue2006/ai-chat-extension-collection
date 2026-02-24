#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'grok-trash-cleanup', 'main.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function testDeletedConversationsRouteGate(source) {
  expectRegex(
    source,
    /function\s+isDeletedConversationsPath\([\s\S]*?\/\^\\\/deleted-conversations\\\/\?\$\//,
    'trash cleanup module should only run on deleted-conversations route'
  );
}

function testUiButtonAndStatus(source) {
  expectRegex(
    source,
    /const\s+BTN_ID\s*=\s*'aichat-grok-trash-cleanup-btn'/,
    'trash cleanup module should define a dedicated button id'
  );

  expectRegex(
    source,
    /btn\.textContent\s*=\s*'一键清空废纸篓'/,
    'trash cleanup module should render one-click clear button text'
  );

  expectRegex(
    source,
    /const\s+STATUS_ID\s*=\s*'aichat-grok-trash-cleanup-status'/,
    'trash cleanup module should render inline status text'
  );

  expectRegex(
    source,
    /const\s+HEADER_ROW_ID\s*=\s*'aichat-grok-trash-cleanup-header-row'/,
    'trash cleanup module should anchor button in a dedicated heading row'
  );

  assert.ok(
    !/root\.style\.position\s*=\s*'absolute'/.test(source),
    'trash cleanup module should avoid top-overlay absolute positioning'
  );
}

function testLegacyButtonCleanup(source) {
  expectRegex(
    source,
    /const\s+LEGACY_BTN_ID\s*=\s*'quicknav-grok-trash-cleanup-btn'/,
    'trash cleanup module should define legacy button id for cleanup'
  );

  expectRegex(
    source,
    /removeLegacyNodes\(\)/,
    'trash cleanup module should cleanup legacy duplicate button nodes'
  );
}

function testGuard(source) {
  expectRegex(
    source,
    /const\s+GUARD_KEY\s*=\s*'__aichat_grok_trash_cleanup_v2__'/,
    'trash cleanup module should include singleton guard to avoid duplicate mounting'
  );
}

function testApiCalls(source) {
  expectRegex(
    source,
    /new URL\('\/rest\/app-chat\/conversations\/deleted',\s*location\.origin\)/,
    'trash cleanup module should fetch deleted conversations from dedicated endpoint'
  );

  expectRegex(
    source,
    /\/rest\/app-chat\/conversations\/\$\{encodeURIComponent\(id\)\}/,
    'trash cleanup module should force-delete conversations by id'
  );
}

function testNoMenuBridgeRegistration(source) {
  assert.ok(
    !/__quicknavRegisterMenuCommand/.test(source),
    'trash cleanup module should be standalone page UI, not a quicknav menu command'
  );
}

function main() {
  const source = readSource();
  testDeletedConversationsRouteGate(source);
  testUiButtonAndStatus(source);
  testLegacyButtonCleanup(source);
  testGuard(source);
  testApiCalls(source);
  testNoMenuBridgeRegistration(source);
  console.log('PASS dev/test-grok-trash-cleanup-module.js');
}

main();
