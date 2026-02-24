#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'grok-quicknav.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
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

function testBridgeHelpers(source) {
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

function testHandshakeAndRouteWatcher(source) {
  expectRegex(
    source,
    /function\s+bindMainWorldScrollGuardHandshake\(\)\s*\{[\s\S]*?readBridgeMessage\(\s*e,\s*SCROLL_GUARD_READY_TYPES\s*\)[\s\S]*?postScrollLockStateToMainWorld\(\)[\s\S]*?postScrollLockBaselineToMainWorld\(\s*scrollLockStablePos,\s*true\s*\)[\s\S]*?\}/,
    'scroll guard handshake should consume validated bridge-ready messages'
  );

  expectRegex(
    source,
    /installRouteWatcher\(\)\s*\{[\s\S]*?bridge\.on\(\s*'routeChange'\s*,\s*\(eventPayload\)\s*=>\s*detectUrlChange\(eventPayload\s*\|\|\s*null\)\s*\)[\s\S]*?window\.setInterval\(\(\)\s*=>\s*detectUrlChange\(\{\s*href:\s*location\.href,\s*reason:\s*'poll'\s*\}\),\s*1200\);[\s\S]*?\}/,
    'route watcher should prefer bridge routeChange and keep polling fallback'
  );

  assert.ok(!/history\.pushState\s*=\s*function\s*\(/.test(source), 'grok quicknav should avoid per-script history.pushState patching');
  assert.ok(!/history\.replaceState\s*=\s*function\s*\(/.test(source), 'grok quicknav should avoid per-script history.replaceState patching');
}

function testConversationPathGuard(source) {
  expectRegex(
    source,
    /function\s+isGrokConversationPath\(\s*pathname\s*=\s*location\.pathname\s*\)\s*\{[\s\S]*?\^\\\/c\(\?:\\\/\|\$\)\/[\s\S]*?\}/,
    'should provide explicit /c path guard helper for grok conversation routes'
  );

  expectRegex(
    source,
    /if\s*\(!isGrokConversationPath\(\)\)\s*return;/,
    'init bootstrap should skip long-lived observer on non-conversation routes'
  );
}

function main() {
  const source = readSource();
  testBridgeContractScaffold(source);
  testBridgeHelpers(source);
  testScrollLockBridgeMessages(source);
  testHandshakeAndRouteWatcher(source);
  testConversationPathGuard(source);
  console.log('PASS dev/test-grok-scroll-lock-bridge.js');
}

main();
