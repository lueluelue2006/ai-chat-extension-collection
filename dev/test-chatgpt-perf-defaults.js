#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OPTIONS_FILE = path.join(ROOT, 'options', 'options.js');
const PERF_FILE = path.join(ROOT, 'content', 'chatgpt-perf', 'content.js');
const PERF_CSS_FILE = path.join(ROOT, 'content', 'chatgpt-perf', 'content.css');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function testOptionsDefaults(source) {
  assert.ok(!/virtualizeMarkdownBlocks/.test(source), 'options defaults should not contain markdown block virtualization');
  expectRegex(source, /showOverlay:\s*false/, 'options defaults should keep in-page perf menu disabled');
  assert.ok(!/extremeLite/.test(source), 'options should remove extreme-lite setting key');
}

function testOptionsSettingsPanel(source) {
  assert.ok(!/key:\s*'virtualizeMarkdownBlocks'/.test(source), 'settings panel should not expose markdown block virtualization toggle');
  expectRegex(source, /key:\s*'showOverlay'[\s\S]*默认关/s, 'settings panel should keep in-page perf menu as default off');
  assert.ok(!/key:\s*'extremeLite'/.test(source), 'settings panel should not expose extreme-lite toggle');
}

function testContentDefaults(source) {
  assert.ok(!/virtualizeMarkdownBlocks/.test(source), 'content defaults should not contain markdown block virtualization');
  expectRegex(source, /showOverlay:\s*false/, 'content defaults should keep in-page perf menu disabled');
  assert.ok(!/extremeLite/.test(source), 'content script should remove extreme-lite runtime option');
}

function testContentOverlayMenu(source) {
  assert.ok(!/分段虚拟化/.test(source), 'overlay menu should not render markdown block virtualization controls');
  assert.ok(!/const\s+extremeBtn\s*=/.test(source), 'overlay menu should not render extreme-lite button');
}

function testCss(source) {
  assert.ok(!/data-cgptperf-blocks/.test(source), 'perf css should remove markdown block virtualization selectors');
  assert.ok(!/data-cgptperf-extreme/.test(source), 'perf css should remove extreme-lite root attribute selectors');
}

function main() {
  const optionsSource = read(OPTIONS_FILE);
  const perfSource = read(PERF_FILE);
  const cssSource = read(PERF_CSS_FILE);

  testOptionsDefaults(optionsSource);
  testOptionsSettingsPanel(optionsSource);
  testContentDefaults(perfSource);
  testContentOverlayMenu(perfSource);
  testCss(cssSource);

  console.log('PASS dev/test-chatgpt-perf-defaults.js');
}

main();
