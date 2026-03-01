#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function main() {
  const source = readText('content/chatgpt-tex-copy-quote/main.js');

  assert.ok(!source.includes('rangeProto.cloneContents ='), 'should not monkey-patch Range.prototype.cloneContents');
  assert.ok(!source.includes('rangeProto.toString ='), 'should not monkey-patch Range.prototype.toString');
  assert.ok(!source.includes('selProto.toString ='), 'should not monkey-patch Selection.prototype.toString');
  assert.ok(!source.includes('_btqPatched'), 'legacy prototype patch sentinel should be removed');

  assert.ok(source.includes("document.addEventListener('copy'"), 'should intercept copy via event listener');
  assert.ok(source.includes('snapshotActiveSelection'), 'should snapshot selection on-demand');
  assert.ok(source.includes('buildQuotePairs'), 'should keep quote replacement strategy isolated');
  assert.ok(source.includes('isQuoteActionTrigger'), 'should scope quote patch to quote action trigger');
  assert.ok(source.includes("document.addEventListener('pointerdown'"), 'should capture pre-click selection before quote');
  assert.ok(source.includes('applyPendingQuotePatch'), 'should patch quote text only in pending quote window');

  const optionsSource = readText('options/options.js');
  assert.ok(optionsSource.includes('不再全局重载 Range/Selection'), 'options copy should document no-global-patch behavior');

  console.log('PASS dev/test-chatgpt-tex-copy-quote.js');
}

main();
