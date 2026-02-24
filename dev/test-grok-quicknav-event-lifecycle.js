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

function testRouteChangeDoesNotForceRebind(source) {
  assert.ok(!/setGrokKeysBound\(\s*false\s*\)/.test(source), 'route change should not force key binding reset');
}

function testKeyboardBindingUsesCurrentUiLookup(source) {
  expectRegex(
    source,
    /if\s*\(!isGrokKeysBound\(\)\)\s*\{[\s\S]*?const\s+getCurrentUi\s*=\s*\(\)\s*=>[\s\S]*?const\s+onKeydown\s*=\s*\(e\)\s*=>\s*\{[\s\S]*?const\s+currentUi\s*=\s*getCurrentUi\(\);[\s\S]*?if\s*\(!currentUi\)\s*return;/,
    'keyboard binding should use current ui lookup to avoid stale route closures'
  );

  expectRegex(
    source,
    /if\s*\(e\.altKey\s*&&\s*e\.key\s*===\s*'\/'\)\s*\{[\s\S]*?const\s+list\s*=\s*currentUi\.nav\.querySelector\('\.compact-list'\);/,
    'Alt+/ toggle should target current ui nav list'
  );
}

function testWatchSendEventsBoundOnce(source) {
  expectRegex(
    source,
    /function\s+watchSendEvents\(\s*ui\s*\)\s*\{[\s\S]*?if\s*\(isGrokSendEventsBound\(\)\)\s*return;[\s\S]*?setGrokSendEventsBound\(\s*true\s*\);/,
    'watchSendEvents should bind once with runtime guard'
  );

  expectRegex(
    source,
    /function\s+watchSendEvents\(\s*ui\s*\)\s*\{[\s\S]*?const\s+getUi\s*=\s*\(\)\s*=>[\s\S]*?document\.getElementById\('cgpt-compact-nav'\)\?\._ui\s*\|\|\s*ui\s*\|\|\s*null;/,
    'watchSendEvents should resolve current ui lazily'
  );
}

function testQuicknavDoesNotOwnTrashCleanup(source) {
  assert.ok(
    !/一键清空废纸篓/.test(source),
    'grok quicknav should not contain trash cleanup logic; keep it in standalone grok_trash_cleanup module'
  );
}

function main() {
  const source = readSource();
  testRouteChangeDoesNotForceRebind(source);
  testKeyboardBindingUsesCurrentUiLookup(source);
  testWatchSendEventsBoundOnce(source);
  testQuicknavDoesNotOwnTrashCleanup(source);
  console.log('PASS dev/test-grok-quicknav-event-lifecycle.js');
}

main();
