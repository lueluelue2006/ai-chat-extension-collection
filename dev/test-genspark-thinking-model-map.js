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

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function testScopeIsSonnet45Only(source) {
  expectRegex(
    source,
    /const\s+TARGET_MODELS\s*=\s*new\s+Set\(\s*\[\s*'claude-sonnet-4-5'\s*,\s*'claude-sonnet-4-5-20250929'\s*\]\s*\)/,
    'should only target sonnet 4.5 model ids'
  );
  expectRegex(
    source,
    /const\s+THINKING_MODEL\s*=\s*'claude-sonnet-4-5-thinking'/,
    'should force sonnet 4.5 thinking model'
  );

  assert.ok(!/claude-sonnet-4-6/.test(source), 'should not include sonnet 4.6 mapping');
  assert.ok(!/claude-opus-4-6/.test(source), 'should not include opus 4.6 mapping');
  assert.ok(!/claude-opus-4-5/.test(source), 'should not include opus 4.5 mapping');
}

function testForceThinkingModelImplementation(source) {
  expectRegex(
    source,
    /function\s+forceThinkingModel\(\s*inputModel\s*\)\s*\{[\s\S]*?return\s+TARGET_MODELS\.has\(v\)\s*\?\s*THINKING_MODEL\s*:\s*v;/,
    'forceThinkingModel should only replace configured sonnet 4.5 models'
  );
}

function testNoBroadModelRewriteHelpers(source) {
  assert.ok(!/THINKING_MODEL_ALIASES/.test(source), 'should not define broad model alias map');
  assert.ok(!/THINKING_MODEL_BASE_RE/.test(source), 'should not define broad model fallback regex');
}

function main() {
  const source = readSource();
  testScopeIsSonnet45Only(source);
  testForceThinkingModelImplementation(source);
  testNoBroadModelRewriteHelpers(source);
  console.log('PASS dev/test-genspark-thinking-model-map.js');
}

main();
