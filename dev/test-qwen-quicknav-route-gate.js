#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const routeGateApi = require(path.join(__dirname, '..', 'content', 'qwen-quicknav-route-gate.js'));

function createController() {
  return routeGateApi.createQwenQuicknavRouteGateController({
    STABLE_MS: 50,
    MIN_STABLE_SAMPLES: 2,
    HARD_TIMEOUT_MS: 120
  });
}

function testGlobalExposureAndFactoryExport() {
  assert.ok(routeGateApi);
  assert.strictEqual(typeof routeGateApi.createQwenQuicknavRouteGateController, 'function');
  assert.ok(globalThis.__quicknavQwenRouteGate);
  assert.strictEqual(typeof globalThis.__quicknavQwenRouteGate.createQwenQuicknavRouteGateController, 'function');
}

function testInitialStateIsReady() {
  const ctl = createController();

  assert.strictEqual(ctl.isReady(), true);
  assert.strictEqual(ctl.isPending(), false);
  assert.strictEqual(ctl.shouldKeepOld(0), false);
}

function testKeepOldUntilStableFingerprint() {
  const ctl = createController();

  ctl.onRouteChange({ href: 'https://chat.qwen.ai/c/next', reason: 'pushState', nowMs: 100 });
  assert.strictEqual(ctl.isPending(), true);
  assert.strictEqual(ctl.shouldKeepOld(100), true);

  ctl.onFingerprintSample({ fingerprint: 'turns:6|first:a|last:f', nowMs: 120 });
  assert.strictEqual(ctl.shouldKeepOld(140), true);

  ctl.onFingerprintSample({ fingerprint: 'turns:6|first:a|last:f', nowMs: 169 });
  assert.strictEqual(ctl.isPending(), true);

  ctl.onFingerprintSample({ fingerprint: 'turns:6|first:a|last:f', nowMs: 170 });
  assert.strictEqual(ctl.isReady(), true);
  assert.strictEqual(ctl.isPending(), false);
  assert.strictEqual(ctl.shouldKeepOld(170), false);
}

function testFingerprintChurnResetsStabilityWindow() {
  const ctl = createController();

  ctl.onRouteChange({ href: '/c/churn', reason: 'replaceState', nowMs: 0 });
  ctl.onFingerprintSample({ fingerprint: 'turns:2|last:a', nowMs: 10 });
  ctl.onFingerprintSample({ fingerprint: 'turns:2|last:a', nowMs: 40 });
  assert.strictEqual(ctl.isReady(), false);

  ctl.onFingerprintSample({ fingerprint: 'turns:3|last:b', nowMs: 45 });
  ctl.onFingerprintSample({ fingerprint: 'turns:3|last:b', nowMs: 80 });
  assert.strictEqual(ctl.isReady(), false);

  ctl.onFingerprintSample({ fingerprint: 'turns:3|last:b', nowMs: 96 });
  assert.strictEqual(ctl.isReady(), true);
  assert.strictEqual(ctl.shouldKeepOld(96), false);
}

function testHardTimeoutFailOpen() {
  const ctl = createController();

  ctl.onRouteChange({ href: '/c/timeout', reason: 'popstate', nowMs: 200 });
  ctl.onFingerprintSample({ fingerprint: 'unstable-a', nowMs: 220 });
  ctl.onFingerprintSample({ fingerprint: 'unstable-b', nowMs: 250 });

  assert.strictEqual(ctl.shouldKeepOld(319), true);
  assert.strictEqual(ctl.shouldKeepOld(320), false);
  assert.strictEqual(ctl.isReady(), true);
  assert.strictEqual(ctl.getState().readyReason, 'timeout');
}

function testRouteChangeSupersessionWithRouteVersion() {
  const ctl = createController();

  const routeV1 = ctl.onRouteChange({ href: '/c/one', reason: 'pushState', nowMs: 0 });
  ctl.onFingerprintSample({ fingerprint: 'route-one', nowMs: 20, routeVersion: routeV1 });

  const routeV2 = ctl.onRouteChange({ href: '/c/two', reason: 'pushState', nowMs: 30 });
  assert.strictEqual(routeV2 > routeV1, true);
  assert.strictEqual(ctl.isPending(), true);

  ctl.onFingerprintSample({ fingerprint: 'route-one', nowMs: 60, routeVersion: routeV1 });
  assert.strictEqual(ctl.shouldKeepOld(60), true);

  ctl.onFingerprintSample({ fingerprint: 'route-two', nowMs: 70, routeVersion: routeV2 });
  ctl.onFingerprintSample({ fingerprint: 'route-two', nowMs: 120, routeVersion: routeV2 });

  assert.strictEqual(ctl.isReady(), true);
  assert.strictEqual(ctl.shouldKeepOld(120), false);
  assert.strictEqual(ctl.getState().routeVersion, routeV2);
  assert.strictEqual(ctl.getState().href, '/c/two');
}

function main() {
  testGlobalExposureAndFactoryExport();
  testInitialStateIsReady();
  testKeepOldUntilStableFingerprint();
  testFingerprintChurnResetsStabilityWindow();
  testHardTimeoutFailOpen();
  testRouteChangeSupersessionWithRouteVersion();

  console.log('PASS dev/test-qwen-quicknav-route-gate.js');
}

main();
