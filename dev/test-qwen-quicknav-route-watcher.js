#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'qwen-quicknav.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function testBridgePreferredRouteChannel(source) {
  expectRegex(
    source,
    /function\s+installRouteWatcher\(\)\s*\{[\s\S]*?bridge\.ensureRouteListener\(\)[\s\S]*?window\.__quicknavQwenRouteUnsubV1\s*=\s*bridge\.on\(\s*'routeChange'\s*,\s*\(eventPayload\)\s*=>\s*detectUrlChange\(eventPayload\s*\|\|\s*null\)\s*\);[\s\S]*?return;[\s\S]*?\}/,
    'qwen route watcher should prefer bridge routeChange channel and return once subscribed'
  );
}

function testPollingFallback(source) {
  expectRegex(
    source,
    /if\s*\(window\.__quicknavQwenRoutePollV1\)\s*return;[\s\S]*?window\.__quicknavQwenRoutePollV1\s*=\s*window\.setInterval\(\(\)\s*=>\s*detectUrlChange\(\{\s*href:\s*location\.href,\s*reason:\s*'poll'\s*\}\),\s*1200\);/,
    'qwen route watcher should keep slow polling fallback when bridge channel is unavailable'
  );
}

function testNoPerScriptHistoryMonkeyPatch(source) {
  assert.ok(!/history\.pushState\s*=\s*function\s*\(/.test(source), 'qwen quicknav should avoid per-script history.pushState monkey patch');
  assert.ok(!/history\.replaceState\s*=\s*function\s*\(/.test(source), 'qwen quicknav should avoid per-script history.replaceState monkey patch');
  assert.ok(!/__quicknavQwenRouteHooksInstalledV1/.test(source), 'qwen quicknav should remove legacy route hook installation flag');
}

function main() {
  const source = readSource();
  testBridgePreferredRouteChannel(source);
  testPollingFallback(source);
  testNoPerScriptHistoryMonkeyPatch(source);
  console.log('PASS dev/test-qwen-quicknav-route-watcher.js');
}

main();
