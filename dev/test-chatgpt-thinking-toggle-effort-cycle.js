#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'chatgpt-thinking-toggle', 'main.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function main() {
  const source = readSource();

  assert.ok(
    /if\s*\(lowIdx\s*>=\s*0\s*&&\s*highIdx\s*>=\s*0\)\s*\{\s*targetIdx\s*=\s*checkedIndex\s*===\s*highIdx\s*\?\s*lowIdx\s*:\s*highIdx;/.test(
      source
    ),
    'effort hotkey should prefer extreme pair (Light/Heavy) when available'
  );

  const extremeIdx = source.indexOf('if (lowIdx >= 0 && highIdx >= 0)');
  const midIdx = source.indexOf('else if (proLowIdx >= 0 && proHighIdx >= 0 && (checkedIndex === proLowIdx || checkedIndex === proHighIdx))');
  assert.ok(extremeIdx >= 0 && midIdx > extremeIdx, 'extreme pair routing should run before mid pair routing');

  assert.ok(
    /route\s*=\s*items\.length\s*>=\s*4\s*\?\s*'extreme-pair-4lvl'\s*:\s*'extreme-pair'/.test(source),
    '4-level effort menu should still follow Light/Heavy edge toggling'
  );

  console.log('PASS dev/test-chatgpt-thinking-toggle-effort-cycle.js');
}

main();
