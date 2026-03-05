#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'popup', 'popup.js'), 'utf8');

function testPopupMenuRefreshIsSequenced() {
  assert.ok(SOURCE.includes('let menuRefreshSeq = 0;'), 'popup should track menu refresh sequence numbers');
  assert.ok(SOURCE.includes('let menuRefreshAppliedSeq = 0;'), 'popup should track the latest applied menu refresh');
  assert.ok(SOURCE.includes('function clearPendingMenuRefresh()'), 'popup should clear pending delayed menu refreshes');
  assert.ok(SOURCE.includes('function queueMenuRefresh(delayMs = 300)'), 'popup should use a dedicated delayed menu refresh queue');
  assert.ok(
    SOURCE.includes('if (seq !== menuRefreshSeq || seq < menuRefreshAppliedSeq) return;'),
    'popup should drop stale delayed menu refresh results'
  );
  assert.ok(SOURCE.includes('queueMenuRefresh(300);'), 'popup should refresh menu through the queued refresh helper after saves');
  assert.ok(
    !/setTimeout\(async \(\) => \{\s*const next = await refreshMenu\(\);[\s\S]*renderToggles\(\{ settings, activeSiteId, menuByModule, unmappedMenu, onMutate: mutateSettings, onRunMenu \}\);\s*\}, 300\);/m.test(
      SOURCE
    ),
    'popup should no longer use an uncancelled raw delayed menu refresh after saves'
  );
}

function main() {
  testPopupMenuRefreshIsSequenced();
  console.log('PASS dev/test-popup-menu-refresh-race.js');
}

main();
