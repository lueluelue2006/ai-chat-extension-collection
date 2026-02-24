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

function main() {
  const source = read('content/gemini-app-quicknav.js');

  expectRegex(source, /const\s+BRIDGE_CHANNEL\s*=\s*'quicknav';/, 'gemini_app: should define bridge channel');
  expectRegex(source, /const\s+BRIDGE_NONCE_DATASET_KEY\s*=\s*'quicknavBridgeNonceV1';/, 'gemini_app: should define bridge nonce dataset key');
  expectRegex(source, /const\s+SCROLL_GUARD_READY_TYPES\s*=\s*new Set\(\['QUICKNAV_SCROLL_GUARD_READY'\]\);/, 'gemini_app: should define guard ready message allow-list');
  expectRegex(source, /function\s+postBridgeMessage\(type,\s*payload\s*=\s*null\)/, 'gemini_app: should use bridge envelope helper');
  expectRegex(source, /function\s+readBridgeMessage\(event,\s*allowedTypes\)/, 'gemini_app: should validate bridge envelope');

  expectRegex(source, /const\s+GEMINI_APP_KEYS_BOUND_KEY\s*=\s*'__quicknavGeminiAppKeysBoundV1';/, 'gemini_app: should define canonical key-bound flag');
  expectRegex(source, /const\s+GEMINI_APP_KEYS_BOUND_LEGACY_KEY\s*=\s*'__cgptKeysBound';/, 'gemini_app: should keep legacy key-bound flag');
  expectRegex(source, /function\s+setGeminiAppKeysBound\(value\)\s*\{[\s\S]*?writeRuntimeFlag\(/, 'gemini_app: should expose typed setter for key-bound runtime flag');

  expectRegex(source, /const\s+geminiAppQuicknavDebugApi\s*=\s*\{/, 'gemini_app: should expose canonical debug api object');
  expectRegex(source, /function\s+installGeminiAppNavDebugApi\(debugApi\)/, 'gemini_app: should install canonical debug api aliases');
  expectRegex(source, /const\s+GEMINI_APP_NAV_DEBUG_KEY\s*=\s*'geminiNavDebug';/, 'gemini_app: should expose window.geminiNavDebug');
  expectRegex(source, /const\s+GEMINI_APP_NAV_DEBUG_LEGACY_KEY\s*=\s*'chatGptNavDebug';/, 'gemini_app: should keep legacy debug alias');

  expectRegex(source, /bridge\.on\('routeChange',\s*\(eventPayload\)\s*=>\s*detectUrlChange\(eventPayload\s*\|\|\s*null\)\)/, 'gemini_app: should subscribe to shared bridge routeChange channel');
  assert.ok(!/history\.pushState\s*=\s*function/.test(source), 'gemini_app: should not monkey-patch history.pushState');
  assert.ok(!/history\.replaceState\s*=\s*function/.test(source), 'gemini_app: should not monkey-patch history.replaceState');

  expectRegex(source, /let\s+manualSelectionHoldUntil\s*=\s*0;/, 'gemini_app: should track manual-selection freeze window');
  expectRegex(source, /const\s+MANUAL_SELECTION_HOLD_MS_NORMAL\s*=\s*900;/, 'gemini_app: should define normal manual-selection hold');
  expectRegex(source, /const\s+MANUAL_SELECTION_HOLD_MS_STREAMING\s*=\s*1800;/, 'gemini_app: should define streaming manual-selection hold');
  expectRegex(source, /function\s+getManualSelectionHoldMs\(\)\s*\{[\s\S]*?checkStreamingState\(null,\s*true\)/, 'gemini_app: should derive hold duration from streaming state');
  expectRegex(source, /function\s+armManualSelectionHold\(ms\s*=\s*0\)/, 'gemini_app: should expose manual-selection hold helper');
  expectRegex(source, /function\s+updateActiveFromAnchor\(\)\s*\{[\s\S]*?if\s*\(manualSelectionHoldUntil\s*&&\s*Date\.now\(\)\s*<\s*manualSelectionHoldUntil\)\s*return;/, 'gemini_app: should skip anchor auto-active while manual hold is active');
  expectRegex(source, /list\.appendChild\(frag\);[\s\S]*?if\s*\(currentActiveId\)\s*\{[\s\S]*?setActiveTurn\(currentActiveId\);/, 'gemini_app: should restore active class after list rerender');
  expectRegex(source, /list\.addEventListener\('click',[\s\S]*?armManualSelectionHold\(\);[\s\S]*?setActiveTurn\(item\.dataset\.id\);/, 'gemini_app: should freeze auto-active before manual row selection');
  expectRegex(source, /function\s+jumpToEdge\(which\)\s*\{[\s\S]*?armManualSelectionHold\(\);/, 'gemini_app: should freeze auto-active for edge jump');
  expectRegex(source, /function\s+jumpActiveBy\(delta\)\s*\{[\s\S]*?armManualSelectionHold\(\);/, 'gemini_app: should freeze auto-active for relative jump');
  expectRegex(source, /function\s+normalizeGeminiPreview\(text,\s*role\s*=\s*'user'\)/, 'gemini_app: should normalize Gemini preview labels');
  expectRegex(source, /querySelector\('\.query-text \.query-text-line, \.query-text-line'\)/, 'gemini_app: should prefer query-text-line content for user preview');
  expectRegex(source, /const\s+normalizedQPreview\s*=\s*normalizeGeminiPreview\(qPreview,\s*'user'\);/, 'gemini_app: should normalize cached user preview labels');
  expectRegex(source, /const\s+normalizedAPreview\s*=\s*normalizeGeminiPreview\(aPreview,\s*'assistant'\);/, 'gemini_app: should normalize cached assistant preview labels');

  assertNoLegacyDirectAssignments(source, 'gemini_app');

  console.log('PASS dev/test-gemini-app-quicknav-kernel.js');
}

main();
