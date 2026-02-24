#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function main() {
  const source = read('content/grok-quicknav.js');

  assert.ok(
    !/\.thinking-container\s*\{\s*display\s*:\s*none\s*!important\s*;\s*\}/.test(source),
    'grok: should not globally hide .thinking-container (may hide real reply content)'
  );

  assert.ok(
    /\[id\^="response-"\].*scroll-margin-top:\$\{gap\}px!important;/.test(source),
    'grok: should keep scroll-margin safety rule for response blocks'
  );

  console.log('PASS dev/test-grok-quicknav-visibility-safety.js');
}

main();
