#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const activeLock = require(path.join(__dirname, '..', 'content', 'qwen-quicknav-active-lock.js'));

function createController() {
  return activeLock.createQwenQuicknavActiveLockController({
    STREAM_END_STABLE_MS: 100,
    UNLOCK_GRACE_MS: 50,
    MAX_LOCK_MS: 1_000
  });
}

function testAutoUpdateSuppressedWhileLocked() {
  const ctl = createController();

  ctl.onStreaming(true, 0);
  ctl.lock('turn-a', 10);

  assert.strictEqual(ctl.isLocked(10), true);
  assert.strictEqual(ctl.shouldAllowAutoActiveUpdate(10), false);
}

function testUnlockAfterStreamingEndStablePlusGrace() {
  const ctl = createController();

  ctl.onStreaming(true, 0);
  ctl.lock('turn-a', 10);

  ctl.onStreaming(false, 20);
  assert.strictEqual(ctl.isLocked(169), true);
  assert.strictEqual(ctl.isLocked(170), false);
  assert.strictEqual(ctl.shouldAllowAutoActiveUpdate(170), true);
}

function testMissingIdTriggersUnlock() {
  const ctl = createController();

  ctl.onStreaming(true, 0);
  ctl.lock('turn-a', 10);

  assert.strictEqual(ctl.onLockedIdResolved(false, 30), false);
  assert.strictEqual(ctl.isLocked(30), false);
  assert.strictEqual(ctl.getLockedId(30), '');
}

function testSecondClickReplacesLockTarget() {
  const ctl = createController();

  ctl.onStreaming(true, 0);
  ctl.lock('turn-a', 10);
  ctl.lock('turn-b', 20);

  assert.strictEqual(ctl.isLocked(20), true);
  assert.strictEqual(ctl.getLockedId(20), 'turn-b');
  assert.strictEqual(ctl.shouldAllowAutoActiveUpdate(20), false);
}

function testRouteChangeUnlocksImmediately() {
  const ctl = createController();

  ctl.onStreaming(true, 0);
  ctl.lock('turn-a', 10);

  assert.strictEqual(ctl.onRouteChange(20), false);
  assert.strictEqual(ctl.isLocked(20), false);
}

function testMaxLockMsFailsafe() {
  const ctl = createController();

  ctl.onStreaming(true, 0);
  ctl.lock('turn-a', 10);

  assert.strictEqual(ctl.isLocked(1_009), true);
  assert.strictEqual(ctl.isLocked(1_010), false);
}

function main() {
  testAutoUpdateSuppressedWhileLocked();
  testUnlockAfterStreamingEndStablePlusGrace();
  testMissingIdTriggersUnlock();
  testSecondClickReplacesLockTarget();
  testRouteChangeUnlocksImmediately();
  testMaxLockMsFailsafe();

  console.log('PASS dev/test-qwen-quicknav-active-lock.js');
}

main();
