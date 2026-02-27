#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PERF_FILE = path.join(ROOT, 'content', 'chatgpt-perf', 'content.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function main() {
  const source = read(PERF_FILE);

  expectRegex(source, /function\s+settingsEqual\(a,\s*b\)\s*\{/, 'should define settingsEqual guard');
  expectRegex(
    source,
    /if\s*\(areaName\s*===\s*state\.storageAreaName[\s\S]*const\s+next\s*=\s*sanitizeSettings\(changes\[STORAGE_KEY\]\.newValue\);[\s\S]*if\s*\(!settingsEqual\(next,\s*state\.settings\)\)\s*applySettings\(next\);/s,
    'onStorageChanged should avoid duplicate applySettings when values are unchanged'
  );
  expectRegex(
    source,
    /if\s*\(article\.getAttribute\(COPY_UNFREEZE_ATTR\)\s*===\s*'1'\)\s*return;/,
    'copy unfreeze should skip duplicate forced layout while pending'
  );
  assert.ok(!/Array\.from\(list\)/.test(source), 'removed-nodes unobserve path should avoid Array.from(list) allocation');
  expectRegex(
    source,
    /if\s*\(e\s*&&\s*typeof\s+e\.detail\s*===\s*'number'\s*&&\s*e\.detail\s*!==\s*0\)\s*return;/,
    'onClick should ignore pointer-originated clicks already handled by pointerdown'
  );
  expectRegex(
    source,
    /if\s*\(perfNow\s*-\s*state\.lastVirtualizeStartAt\s*<\s*480\)\s*return;/,
    'startVirtualization should have route-trigger dedupe guard'
  );
  expectRegex(
    source,
    /if\s*\(perfNow\s*-\s*state\.lastReconcileAt\s*>=\s*220\)\s*\{/,
    'reconcile scheduling should be throttled'
  );

  console.log('PASS dev/test-chatgpt-perf-runtime-guards.js');
}

main();
