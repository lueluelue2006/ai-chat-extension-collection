#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'chatgpt-quicknav.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function testSegmentContextCapture(source) {
  expectRegex(source, /function\s+captureSegmentContext\s*\(/, 'should define segment context capture helper');
  expectRegex(source, /const\s+ctx\s*=\s*\{\s*p:\s*path\s*\}/, 'segment context should include path anchor');
  expectRegex(source, /ctx\.s\s*=\s*snippet/, 'segment context should optionally include snippet');
  expectRegex(source, /ctx\.y\s*=\s*relY/, 'segment context should include segment relative y');
  expectRegex(source, /\.text-message/, 'segment extraction should include user-message text blocks');
}

function testRelFallbackPersistence(source) {
  expectRegex(source, /const\s+relX\s*=\s*\(v\.rel[\s\S]*?Number\(v\.rel\.x\)/, 'loadCPSet should coerce rel.x to numeric value');
  expectRegex(source, /const\s+relY\s*=\s*\(v\.rel[\s\S]*?Number\(v\.rel\.y\)/, 'loadCPSet should coerce rel.y to numeric value');
  expectRegex(source, /const\s+rel\s*=\s*\(v\.rel\s*&&\s*typeof\s+v\.rel\s*===\s*'object'\)/, 'loadCPSet should deserialize persisted rel anchor');
  expectRegex(source, /relValid\s*=\s*rel\s*&&\s*\(Number\.isFinite\(rel\.x\)\s*\|\|\s*Number\.isFinite\(rel\.y\)\)/, 'rel fallback should remain valid when either axis is recoverable');
  expectRegex(source, /rel:\s*relValid\s*\?\s*rel\s*:\s*null/, 'cpMap meta should keep rel fallback when valid');
  expectRegex(source, /if\s*\(\s*rel\s*&&\s*typeof\s+rel\s*===\s*'object'\s*\)/, 'resolve should parse rel object axis-by-axis');
  expectRegex(source, /const\s+relX\s*=\s*Number\(rel\.x\)/, 'resolve should coerce rel.x before use');
  expectRegex(source, /const\s+relY\s*=\s*Number\(rel\.y\)/, 'resolve should coerce rel.y before use');
  expectRegex(source, /meta\.rel\s*=\s*\{\s*x:\s*rx,\s*y:\s*ry\s*\}/, 'resolve should write normalized rel fallback');
}

function testResolvePipeline(source) {
  expectRegex(source, /function\s+resolveSegmentAnchorPlacement\s*\(/, 'should define segment anchor resolve helper');
  expectRegex(source, /const\s+segPlacement\s*=\s*resolveSegmentAnchorPlacement\(/, 'resolvePinAnchor should prefer segment placement');
  expectRegex(source, /if\s*\(\s*segPlacement\s*\)\s*\{[\s\S]*meta\.ctx\s*=\s*\{\s*p:\s*segPlacement\.p,\s*s:\s*segPlacement\.s,\s*y:\s*segPlacement\.yInSegment\s*\}/, 'successful resolve should refresh compact ctx payload');
  expectRegex(source, /const\s+ctx\s*=\s*captureSegmentContext\(turnEl,\s*x,\s*y\)/, 'pin insertion should capture segment context');
}

function main() {
  const source = readSource();
  testSegmentContextCapture(source);
  testRelFallbackPersistence(source);
  testResolvePipeline(source);
  console.log('PASS dev/test-chatgpt-quicknav-pin-anchor.js');
}

main();
