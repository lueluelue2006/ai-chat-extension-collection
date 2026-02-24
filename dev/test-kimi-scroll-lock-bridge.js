#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'kimi-quicknav.js');
const SCROLL_GUARD_FILE = path.join(ROOT, 'content', 'scroll-guard-main.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function readScrollGuardSource() {
  return fs.readFileSync(SCROLL_GUARD_FILE, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function testBridgeContractScaffold(source) {
  expectRegex(source, /const\s+BRIDGE_CHANNEL\s*=\s*'quicknav';/, 'should define BRIDGE_CHANNEL');
  expectRegex(source, /const\s+BRIDGE_V\s*=\s*1;/, 'should define BRIDGE_V');
  expectRegex(source, /const\s+BRIDGE_NONCE_DATASET_KEY\s*=\s*'quicknavBridgeNonceV1';/, 'should define bridge nonce dataset key');
  expectRegex(source, /const\s+SCROLL_GUARD_READY_TYPES\s*=\s*new\s+Set\(\['QUICKNAV_SCROLL_GUARD_READY'\]\);/, 'should define ready message allowlist');
}

function testBridgeMessageHelpers(source) {
  expectRegex(
    source,
    /function\s+postBridgeMessage\(\s*type,\s*payload\s*=\s*null\s*\)\s*\{[\s\S]*?channel:\s*BRIDGE_CHANNEL[\s\S]*?v:\s*BRIDGE_V[\s\S]*?nonce:\s*BRIDGE_NONCE[\s\S]*?msg\.type\s*=\s*String\(type\s*\|\|\s*''\);[\s\S]*?window\.postMessage\(msg,\s*'\*'\);[\s\S]*?\}/,
    'postBridgeMessage should send channel/v/nonce typed envelope'
  );

  expectRegex(
    source,
    /function\s+readBridgeMessage\(\s*event,\s*allowedTypes\s*\)\s*\{[\s\S]*?event\.source\s*!==\s*window[\s\S]*?msg\.channel\s*!==\s*BRIDGE_CHANNEL[\s\S]*?msg\.v\s*!==\s*BRIDGE_V[\s\S]*?msg\.nonce\s*!==\s*BRIDGE_NONCE[\s\S]*?allowedTypes[\s\S]*?allowedTypes\.has\(msg\.type\)[\s\S]*?return\s+msg;[\s\S]*?\}/,
    'readBridgeMessage should validate channel/v/nonce and allowed type'
  );
}

function testScrollLockBridgeMessages(source) {
  expectRegex(
    source,
    /function\s+postScrollLockStateToMainWorld\(\)\s*\{[\s\S]*?dataset\.quicknavScrollLockEnabled\s*=\s*scrollLockEnabled\s*\?\s*'1'\s*:\s*'0'[\s\S]*?postBridgeMessage\(\s*'AISHORTCUTS_SCROLLLOCK_STATE'\s*,\s*\{\s*enabled:\s*!!scrollLockEnabled\s*\}\s*\);[\s\S]*?\}/,
    'scroll lock state should sync dataset and bridge message'
  );

  expectRegex(
    source,
    /function\s+postScrollLockBaselineToMainWorld\(\s*top,\s*force\s*=\s*false\s*\)\s*\{[\s\S]*?dataset\.quicknavScrollLockBaseline[\s\S]*?postBridgeMessage\(\s*'AISHORTCUTS_SCROLLLOCK_BASELINE'\s*,\s*\{\s*top:\s*px\s*\}\s*\);[\s\S]*?\}/,
    'scroll lock baseline should be sent via bridge envelope'
  );

  expectRegex(
    source,
    /function\s+postScrollLockAllowToMainWorld\(\s*ms\s*\)\s*\{[\s\S]*?postBridgeMessage\(\s*'AISHORTCUTS_SCROLLLOCK_ALLOW'\s*,\s*\{\s*ms:\s*Number\(ms\)\s*\|\|\s*0\s*\}\s*\);[\s\S]*?\}/,
    'scroll lock allow-window should be sent via bridge envelope'
  );
}

function testHandshakeUsesBridgeValidation(source) {
  expectRegex(
    source,
    /function\s+bindMainWorldScrollGuardHandshake\(\)\s*\{[\s\S]*?readBridgeMessage\(\s*e,\s*SCROLL_GUARD_READY_TYPES\s*\)[\s\S]*?postScrollLockStateToMainWorld\(\)[\s\S]*?postScrollLockBaselineToMainWorld\(\s*scrollLockStablePos,\s*true\s*\)[\s\S]*?\}/,
    'scroll guard handshake should consume validated bridge-ready messages'
  );
}

function testKimiScrollerDetectionUsesChatDetailMain(source) {
  expectRegex(
    source,
    /function\s+getChatScrollContainer\(\)\s*\{[\s\S]*?document\.querySelector\(\s*'\.chat-detail-main'\s*\)[\s\S]*?document\.querySelector\(\s*'\[class\*=\"chat-detail-main\"\]'\s*\)[\s\S]*?\}/,
    'Kimi scroller detection should prefer .chat-detail-main containers'
  );
}

function testMainGuardRefreshesStaleWindowScroller(guardSource) {
  expectRegex(
    guardSource,
    /function\s+shouldBlockElementScroll\(\s*el,\s*nextTop\s*\)\s*\{[\s\S]*?if\s*\(__cachedScroller\s*&&\s*__cachedScroller\.isConnected\s*&&\s*ts\s*-\s*\(__cachedScrollerAt\s*\|\|\s*0\)\s*>\s*1200\)[\s\S]*?getChatScroller\(\)[\s\S]*?const\s+cached\s*=\s*__cachedScroller\s*&&\s*__cachedScroller\.isConnected\s*\?\s*__cachedScroller\s*:\s*null;/,
    'main guard should refresh stale cached scroller before element fast-path checks'
  );
}

function main() {
  const source = readSource();
  const guardSource = readScrollGuardSource();
  testBridgeContractScaffold(source);
  testBridgeMessageHelpers(source);
  testScrollLockBridgeMessages(source);
  testHandshakeUsesBridgeValidation(source);
  testKimiScrollerDetectionUsesChatDetailMain(source);
  testMainGuardRefreshesStaleWindowScroller(guardSource);
  console.log('PASS dev/test-kimi-scroll-lock-bridge.js');
}

main();
