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

function testHeavyRowMarked(source) {
  expectRegex(
    source,
    /\{\s*key:\s*'heavy'[\s\S]*?requiresHeavyAccess:\s*true[\s\S]*?\}/,
    'heavy quota row should be explicitly marked as requiring heavy access'
  );
}

function testMenuInference(source) {
  expectRegex(
    source,
    /function\s+inferHeavyAccessFromModelMenu\(/,
    'should infer heavy access from model menu state when available'
  );

  expectRegex(
    source,
    /opacity-75\\b\|\\btext-secondary/,
    'menu-based heavy access inference should detect visually-disabled heavy option'
  );
}

function testCounterInference(source) {
  expectRegex(
    source,
    /function\s+inferHeavyAccessFromCounters\(/,
    'should infer heavy access from quota totals as fallback'
  );

  expectRegex(
    source,
    /poolTotal\s*>=\s*300/,
    'counter inference should treat high pool total as heavy-capable'
  );

  expectRegex(
    source,
    /poolTotal\s*>\s*0\s*&&\s*poolTotal\s*<=\s*220/,
    'counter inference should treat low pool total as non-heavy'
  );

  assert.ok(!/g41Total/.test(source), 'counter inference should no longer depend on Grok 4.1 totals');
}

function testQuotaRowsSimplified(source) {
  expectRegex(
    source,
    /\{\s*key:\s*'g420'[\s\S]*?modelName:\s*'grok-420'[\s\S]*?\}/,
    'quota rows should keep Grok 4.20'
  );
  assert.ok(!/key:\s*'g41'/.test(source), 'quota rows should remove Grok 4.1 line');
  assert.ok(!/key:\s*'mini'/.test(source), 'quota rows should remove Grok 3 line');
}

function testFiltering(source) {
  expectRegex(
    source,
    /function\s+filterRowsByCapabilities\(/,
    'should filter rows by capability before rendering'
  );

  expectRegex(
    source,
    /rows\.filter\(\(row\)\s*=>\s*row\.key\s*!==\s*'heavy'\)/,
    'non-heavy accounts should hide heavy row from quota panel'
  );
}

function main() {
  const source = readSource();
  testHeavyRowMarked(source);
  testMenuInference(source);
  testCounterInference(source);
  testQuotaRowsSimplified(source);
  testFiltering(source);
  console.log('PASS dev/test-grok-rate-limit-display-heavy-access.js');
}

main();
