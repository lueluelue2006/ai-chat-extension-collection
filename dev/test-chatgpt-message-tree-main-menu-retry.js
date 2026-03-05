#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'content', 'chatgpt-message-tree', 'main.js'), 'utf8');

function testRetryTimersAreLifecycleBound() {
  assert.ok(SOURCE.includes('mainMenuRetryTimers: new Set()'), 'message-tree state should track retry timers');
  assert.ok(SOURCE.includes('function clearMainMenuRetryTimers()'), 'message-tree should expose retry timer cleanup');
  assert.ok(
    SOURCE.includes('function scheduleMainMenuRegisterRetry(name, handlerKey, delayMs)'),
    'message-tree should route delayed menu registration through a lifecycle-aware helper'
  );
  assert.ok(
    SOURCE.includes('scheduleMainMenuRegisterRetry(n, handlerKey, 500);') &&
      SOURCE.includes('scheduleMainMenuRegisterRetry(n, handlerKey, 1500);'),
    'message-tree should use lifecycle-aware retry scheduling for both delayed menu re-register attempts'
  );
  assert.ok(
    !SOURCE.includes('setTimeout(() => dispatchMainMenuRegister(n, handlerKey), 500);') &&
      !SOURCE.includes('setTimeout(() => dispatchMainMenuRegister(n, handlerKey), 1500);'),
    'message-tree should not leave raw delayed menu retries outside cleanup control'
  );
  assert.ok(
    /clearMainMenuRetryTimers\(\);\s*releaseMainMenuHandlers\(\);/.test(SOURCE),
    'cleanup should clear retry timers before releasing handler registrations'
  );
}

function main() {
  testRetryTimersAreLifecycleBound();
  console.log('PASS dev/test-chatgpt-message-tree-main-menu-retry.js');
}

main();
