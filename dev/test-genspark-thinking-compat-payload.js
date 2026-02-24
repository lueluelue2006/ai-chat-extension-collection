#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'genspark-force-sonnet45-thinking', 'main.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function testNoCrossVersionFallbackAndNoGlobalThinkingPatch(source) {
  assert.ok(!/THINKING_MODEL_ALIASES/.test(source), 'should not define broad alias map');
  assert.ok(!/THINKING_MODEL_BASE_RE/.test(source), 'should not define broad model fallback regex');
  assert.ok(!/patchThinkingPayloadFlags/.test(source), 'should not mutate generic thinking payload flags');
  assert.ok(!/patchThinkingMessageFlags/.test(source), 'should not mutate user message thinking flags globally');
}

function testLegacyGuardAndFetchFlag(source) {
  assert.ok(
    /__aichat_genspark_force_sonnet45_thinking_v2__/.test(source),
    'should keep dedicated sonnet45 guard key'
  );
  assert.ok(
    /__aichatGensparkSonnet45ThinkingPatched/.test(source),
    'should keep dedicated sonnet45 fetch patch flag'
  );
}

function main() {
  const source = readSource();
  testNoCrossVersionFallbackAndNoGlobalThinkingPatch(source);
  testLegacyGuardAndFetchFlag(source);
  console.log('PASS dev/test-genspark-thinking-compat-payload.js');
}

main();
