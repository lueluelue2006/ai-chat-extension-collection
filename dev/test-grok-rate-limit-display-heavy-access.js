#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'grok-rate-limit-display', 'main.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function testAllOnlyTarget(source) {
  expectRegex(source, /const\s+TARGET_MODEL_NAME\s*=\s*'grok-4'/, 'all-only mode should keep Grok all pool target');
  expectRegex(
    source,
    /body:\s*JSON\.stringify\(\{[\s\S]*requestKind:\s*REQUEST_KIND,[\s\S]*modelName:\s*TARGET_MODEL_NAME[\s\S]*\}\)/,
    'all-only request payload should send TARGET_MODEL_NAME'
  );
}

function testDeprecatedEndpointsRemoved(source) {
  assert.ok(!/grok-4-heavy/.test(source), 'should remove deprecated Grok 4 heavy endpoint');
  assert.ok(!/grok-420/.test(source), 'should remove deprecated Grok 4.2 endpoint');
  assert.ok(!/key:\s*'heavy'/.test(source), 'should remove heavy quota row key');
  assert.ok(!/key:\s*'g420'/.test(source), 'should remove 4.2 quota row key');
}

function testDeprecatedInferenceRemoved(source) {
  assert.ok(!/inferHeavyAccessFromModelMenu\(/.test(source), 'all-only mode should remove menu-based heavy inference');
  assert.ok(!/inferHeavyAccessFromCounters\(/.test(source), 'all-only mode should remove counter-based heavy inference');
  assert.ok(!/filterRowsByCapabilities\(/.test(source), 'all-only mode should remove heavy row filtering');
}

function testValueOnlyRender(source) {
  expectRegex(source, /const\s+PANEL_VALUE_ID\s*=\s*'aichat-grok-quota-value'/, 'should render a single value node');
  expectRegex(source, /renderCounter\(formatCounter\(counter\),\s*'ready'\)/, 'should render all-only counter value');
}

function main() {
  const source = readSource();
  testAllOnlyTarget(source);
  testDeprecatedEndpointsRemoved(source);
  testDeprecatedInferenceRemoved(source);
  testValueOnlyRender(source);
  console.log('PASS dev/test-grok-rate-limit-display-heavy-access.js');
}

main();
