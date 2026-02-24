#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function assertNoLegacyDirectAssignments(source, siteName) {
  const legacyAssignmentPattern = /window\.__cgpt(?:KeysBound|ScrollLockUserIntentsBound|ScrollGuardsInstalled|ScrollLockBound|PinBound)\s*=/;
  assert.ok(!legacyAssignmentPattern.test(source), `${siteName}: should avoid direct legacy window.__cgpt* assignments`);
}

function testKimiNaming(source) {
  expectRegex(source, /const\s+KIMI_KEYS_BOUND_KEY\s*=\s*'__quicknavKimiKeysBoundV1';/, 'kimi: should define canonical key-bound runtime key');
  expectRegex(source, /const\s+KIMI_KEYS_BOUND_LEGACY_KEY\s*=\s*'__cgptKeysBound';/, 'kimi: should keep legacy key-bound runtime key for compatibility');
  expectRegex(source, /function\s+setKimiKeysBound\(\s*value\s*\)\s*\{[\s\S]*?writeRuntimeFlag\(/, 'kimi: should expose typed setter for key-bound runtime flag');

  expectRegex(source, /const\s+kimiQuicknavDebugApi\s*=\s*\{/, 'kimi: should expose canonical debug api object');
  expectRegex(source, /window\.kimiQuicknavDebug\s*=\s*kimiQuicknavDebugApi;/, 'kimi: should expose window.kimiQuicknavDebug');
  expectRegex(source, /window\.kimiNavDebug\s*=\s*kimiQuicknavDebugApi;/, 'kimi: should expose short alias window.kimiNavDebug');
  expectRegex(source, /window\.chatGptNavDebug\s*=\s*kimiQuicknavDebugApi;/, 'kimi: should keep legacy debug alias');

  expectRegex(source, /let\s+kimiQuicknavBooting\s*=\s*false;/, 'kimi: should use site-prefixed booting runtime variable');
  assert.ok(!/let\s+__cgptBooting\s*=/.test(source), 'kimi: should not keep __cgptBooting legacy variable');

  assertNoLegacyDirectAssignments(source, 'kimi');
}

function testGrokNaming(source) {
  expectRegex(source, /const\s+GROK_KEYS_BOUND_KEY\s*=\s*'__quicknavGrokKeysBoundV1';/, 'grok: should define canonical key-bound runtime key');
  expectRegex(source, /const\s+GROK_KEYS_BOUND_LEGACY_KEY\s*=\s*'__cgptKeysBound';/, 'grok: should keep legacy key-bound runtime key for compatibility');
  expectRegex(source, /function\s+setGrokKeysBound\(\s*value\s*\)\s*\{[\s\S]*?writeRuntimeFlag\(/, 'grok: should expose typed setter for key-bound runtime flag');

  expectRegex(source, /const\s+grokQuicknavDebugApi\s*=\s*\{/, 'grok: should expose canonical debug api object');
  expectRegex(source, /window\.grokQuicknavDebug\s*=\s*grokQuicknavDebugApi;/, 'grok: should expose window.grokQuicknavDebug');
  expectRegex(source, /window\.grokNavDebug\s*=\s*grokQuicknavDebugApi;/, 'grok: should expose short alias window.grokNavDebug');
  expectRegex(source, /window\.chatGptNavDebug\s*=\s*grokQuicknavDebugApi;/, 'grok: should keep legacy debug alias');

  expectRegex(source, /let\s+grokQuicknavBooting\s*=\s*false;/, 'grok: should use site-prefixed booting runtime variable');
  assert.ok(!/let\s+__cgptBooting\s*=/.test(source), 'grok: should not keep __cgptBooting legacy variable');

  assertNoLegacyDirectAssignments(source, 'grok');
}

function testQwenNaming(source) {
  expectRegex(source, /const\s+qwenQuicknavDebugApi\s*=\s*\{/, 'qwen: should keep canonical debug api object');
  expectRegex(source, /window\.qwenQuicknavDebug\s*=\s*qwenQuicknavDebugApi;/, 'qwen: should expose window.qwenQuicknavDebug');
  expectRegex(source, /window\.qwenNavDebug\s*=\s*qwenQuicknavDebugApi;/, 'qwen: should expose short alias window.qwenNavDebug');
  expectRegex(source, /window\.chatGptNavDebug\s*=\s*qwenQuicknavDebugApi;/, 'qwen: should keep legacy debug alias');
}

function testGensparkNaming(source) {
  expectRegex(source, /const\s+GENSPARK_KEYS_BOUND_KEY\s*=\s*'__quicknavGensparkKeysBoundV1';/, 'genspark: should define canonical key-bound runtime key');
  expectRegex(source, /const\s+GENSPARK_KEYS_BOUND_LEGACY_KEY\s*=\s*'__cgptKeysBound';/, 'genspark: should keep legacy key-bound runtime key for compatibility');
  expectRegex(source, /function\s+setGensparkKeysBound\(\s*value\s*\)\s*\{[\s\S]*?setCompatBoolFlag\(/, 'genspark: should expose typed setter for key-bound runtime flag');

  expectRegex(source, /const\s+gensparkQuicknavDebugApi\s*=\s*\{/, 'genspark: should expose canonical debug api object');
  expectRegex(source, /window\.gensparkQuicknavDebug\s*=\s*gensparkQuicknavDebugApi;/, 'genspark: should expose window.gensparkQuicknavDebug');
  expectRegex(source, /window\.gensparkNavDebug\s*=\s*gensparkQuicknavDebugApi;/, 'genspark: should expose short alias window.gensparkNavDebug');
  expectRegex(source, /window\.chatGptNavDebug\s*=\s*gensparkQuicknavDebugApi;/, 'genspark: should keep legacy debug alias');

  expectRegex(source, /let\s+gensparkQuicknavBooting\s*=\s*false;/, 'genspark: should use site-prefixed booting runtime variable');
  assert.ok(!/let\s+__cgptBooting\s*=/.test(source), 'genspark: should not keep __cgptBooting legacy variable');

  assertNoLegacyDirectAssignments(source, 'genspark');
}

function main() {
  const kimi = read('content/kimi-quicknav.js');
  const grok = read('content/grok-quicknav.js');
  const qwen = read('content/qwen-quicknav.js');
  const genspark = read('content/genspark-quicknav.js');

  testKimiNaming(kimi);
  testGrokNaming(grok);
  testQwenNaming(qwen);
  testGensparkNaming(genspark);

  console.log('PASS dev/test-quicknav-runtime-naming.js');
}

main();
