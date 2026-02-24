#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHATGPT_QUICKNAV_FILE = path.join(ROOT, 'content', 'chatgpt-quicknav.js');
const MAIN_GUARD_FILE = path.join(ROOT, 'content', 'scroll-guard-main.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function testChatgptFastRestore(source) {
  expectRegex(
    source,
    /const\s+SCROLL_LOCK_FAST_RESTORE_DELAY_MS\s*=\s*16\s*;/,
    'chatgpt quicknav should define fast restore delay constant'
  );

  expectRegex(
    source,
    /const\s+SCROLL_LOCK_NORMAL_RESTORE_DELAY_MS\s*=\s*140\s*;/,
    'chatgpt quicknav should define normal restore delay constant'
  );

  expectRegex(
    source,
    /const\s+inGuardWindow\s*=\s*Date\.now\(\)\s*<\s*\(scrollLockGuardUntil\s*\|\|\s*0\);\s*[\s\S]*?const\s+restoreDelay\s*=\s*inGuardWindow\s*\?\s*SCROLL_LOCK_FAST_RESTORE_DELAY_MS\s*:\s*SCROLL_LOCK_NORMAL_RESTORE_DELAY_MS;/,
    'mutation restore should use fast delay while send guard window is active'
  );

  expectRegex(
    source,
    /const\s+stillGuarded\s*=\s*Date\.now\(\)\s*<\s*\(scrollLockGuardUntil\s*\|\|\s*0\);\s*[\s\S]*?const\s+userIdleLongEnough\s*=\s*\(Date\.now\(\)\s*-\s*scrollLockLastUserTs\)\s*>\s*SCROLL_LOCK_IDLE_MS;\s*[\s\S]*?\(stillGuarded\s*\|\|\s*userIdleLongEnough\)/,
    'restore gate should allow immediate correction during guarded send window'
  );
}

function testMainGuardChatgptDrift(source) {
  expectRegex(
    source,
    /const\s+HOST\s*=\s*\(\(\)\s*=>[\s\S]*?location\.hostname[\s\S]*?\)\(\)\s*;/,
    'main guard should normalize host once'
  );

  expectRegex(
    source,
    /const\s+DRIFT\s*=\s*HOST\s*===\s*'chatgpt\.com'\s*\?\s*8\s*:\s*16\s*;/,
    'main guard should apply tighter drift threshold for chatgpt.com'
  );

  expectRegex(
    source,
    /if\s*\(\s*type\s*===\s*'AISHORTCUTS_SCROLLLOCK_BASELINE'\s*\)\s*\{[\s\S]*?__baselineDatasetCached\s*=\s*nextTop;[\s\S]*?__baselineDatasetCachedAt\s*=\s*now\(\);[\s\S]*?\}/,
    'main guard should refresh baseline cache immediately when baseline bridge message arrives'
  );
}

function main() {
  const chatgptQuicknav = read(CHATGPT_QUICKNAV_FILE);
  const mainGuard = read(MAIN_GUARD_FILE);
  testChatgptFastRestore(chatgptQuicknav);
  testMainGuardChatgptDrift(mainGuard);
  console.log('PASS dev/test-chatgpt-scroll-lock-send-guard.js');
}

main();
