#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const QUICKNAV_FILE = path.join(ROOT, 'content', 'chatgpt-quicknav.js');
const TREE_FILE = path.join(ROOT, 'content', 'chatgpt-message-tree', 'main.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function testQuickNavBridgeState(source) {
  assert.ok(
    /const\s+TREE_BRIDGE_STATE\s*=\s*'AISHORTCUTS_CHATGPT_TREE_STATE'/.test(source),
    'quicknav should define tree panel state bridge type'
  );
  assert.ok(
    /TREE_BRIDGE_RESPONSE_TYPES\s*=\s*new Set\(\[TREE_BRIDGE_RES_SUMMARY,\s*TREE_BRIDGE_RES_NAVIGATE_TO,\s*TREE_BRIDGE_STATE\]\)/.test(
      source
    ),
    'quicknav should listen to tree panel state bridge messages'
  );
}

function testQuickNavAutoCollapse(source) {
  assert.ok(
    source.includes('function isWeakTurnKey(key)') &&
      source.includes('/^conversation-turn-\\d+$/i') &&
      source.includes('/^cgpt-turn-\\d+$/i'),
    'quicknav should classify weak turn keys to avoid restoring ambiguous legacy pins'
  );
  assert.ok(
    source.includes('function hasPinSegmentContext(ctx)') &&
      source.includes("typeof ctx.p === 'string'") &&
      source.includes("typeof ctx.s === 'string'"),
    'quicknav should detect whether a pin includes segment context for safe restoration'
  );
  assert.ok(
    /let\s+cpConvKey\s*=\s*'';/.test(source),
    'quicknav should track which conversation key the pin map is loaded from'
  );
  assert.ok(
    /if\s*\(!cpMap\s*\|\|\s*!\(cpMap\s+instanceof\s+Map\)\s*\|\|\s*cpConvKey\s*!==\s*convKey\)\s*loadCPSet\(\);/.test(
      source
    ),
    'quicknav should reload pin map when conversation key changes to avoid stale pin inheritance'
  );
  assert.ok(
    /if\s*\(!storedConvKey\s*&&\s*!storedMsgId\s*&&\s*isWeakTurnKey\(v\.msgKey\)\s*&&\s*!hasPinSegmentContext\(v\.ctx\)\)\s*\{[\s\S]*droppedLegacy\s*=\s*true;[\s\S]*continue;/.test(
      source
    ),
    'quicknav should drop legacy weak pin records that cannot be safely mapped to a specific message'
  );
  assert.ok(
    /if\s*\(!meta\.convKey\)\s*\{[\s\S]*meta\.convKey\s*=\s*convKey;[\s\S]*needSave\s*=\s*true;[\s\S]*\}\s*else\s*if\s*\(meta\.convKey\s*!==\s*convKey\)\s*\{[\s\S]*cpMap\.delete\(pinId\);[\s\S]*needSave\s*=\s*true;/.test(
      source
    ),
    'quicknav should scope pin rendering to the active conversation key'
  );
  assert.ok(
    /const\s+savedMsgId\s*=\s*\(typeof\s+meta\.msgId\s*===\s*'string'[\s\S]*findTurnByMessageId\(savedMsgId\)[\s\S]*if\s*\(savedMsgId\)\s*return\s+null;/.test(
      source
    ),
    'quicknav should resolve pins by stable message id first and refuse mismatched legacy fallbacks'
  );
  assert.ok(
    /const\s+msgId\s*=\s*getTurnMessageId\(turn,\s*null\)\s*\|\|\s*null;[\s\S]*convKey:\s*getConvKey\(\)/.test(
      source
    ),
    'new pins should persist message id + conversation key metadata'
  );
  assert.ok(
    /let\s+treeAutoRestoreQuickNavAfterTreeClose\s*=\s*false;/.test(source),
    'quicknav should track whether tree close needs nav restore'
  );
  assert.ok(
    /let\s+treeAutoRestorePollTimer\s*=\s*0;/.test(source),
    'quicknav should keep a dedicated poll timer for tree auto-restore fallback'
  );
  assert.ok(
    /function\s+scheduleTreeAutoRestorePoll\(ui,\s*delay\s*=\s*0\)\s*\{[\s\S]*syncQuickNavTreeAutoCollapse\(ui\)/.test(source),
    'quicknav should provide a short poll fallback to recover from delayed/lost tree state messages'
  );
  assert.ok(
    /function\s+ensureTreePanelOpenObserver\(ui\)\s*\{[\s\S]*attributeFilter:\s*\['data-open'\][\s\S]*syncQuickNavTreeAutoCollapse\(/.test(
      source
    ),
    'quicknav should observe message-tree panel data-open changes and sync restore immediately'
  );
  assert.ok(
    /function\s+bindTreePanelCloseSync\(ui\)\s*\{[\s\S]*closest\('button\.close'\)[\s\S]*setQuickNavCollapsed\(currentUi,\s*false\);[\s\S]*treeAutoRestoreQuickNavAfterTreeClose\s*=\s*false;[\s\S]*stopTreeAutoRestorePoll\(\);/.test(
      source
    ),
    'quicknav should force immediate restore when tree panel close button is clicked'
  );
  assert.ok(
    /if\s*\(!wasTreeOpen\)\s*\{\s*const\s+wasNavExpanded\s*=\s*!isQuickNavCollapsed\(ui\);\s*treeAutoRestoreQuickNavAfterTreeClose\s*=\s*wasNavExpanded;\s*if\s*\(wasNavExpanded\)\s*\{[\s\S]*setQuickNavCollapsed\(ui,\s*true\);[\s\S]*scheduleTreeAutoRestorePoll\(ui,\s*48\);/s.test(
      source
    ),
    'opening tree should auto-collapse quicknav and start fallback polling only when nav was expanded'
  );
  assert.ok(
    /function\s+syncQuickNavTreeAutoCollapse\(ui\)\s*\{[\s\S]*const\s+domTreeOpen\s*=\s*readTreePanelOpenFromDom\(\);[\s\S]*if\s*\(typeof\s+domTreeOpen\s*===\s*'boolean'\)\s*treePanelOpen\s*=\s*domTreeOpen;[\s\S]*if\s*\(treePanelOpen\)\s*return;[\s\S]*if\s*\(!treeAutoRestoreQuickNavAfterTreeClose\)\s*return;[\s\S]*setQuickNavCollapsed\(ui,\s*false\);[\s\S]*treeAutoRestoreQuickNavAfterTreeClose\s*=\s*false;[\s\S]*stopTreeAutoRestorePoll\(\);/s.test(
      source
    ),
    'closing tree should auto-restore quicknav only when previously auto-collapsed, and stop fallback polling'
  );
}

function testTreeStateBroadcast(source) {
  assert.ok(
    /const\s+BRIDGE_STATE\s*=\s*'AISHORTCUTS_CHATGPT_TREE_STATE'/.test(source),
    'message tree should define panel state bridge message type'
  );
  assert.ok(
    /postBridgeMessage\(BRIDGE_STATE,\s*\{[\s\S]*isOpen:\s*!!state\.open[\s\S]*\}\)/.test(source),
    'message tree should broadcast open/close state through bridge'
  );
  assert.ok(
    /isOpen:\s*!!state\.open/.test(source),
    'bridge summary should include current open state'
  );
}

function main() {
  const quicknav = read(QUICKNAV_FILE);
  const tree = read(TREE_FILE);
  testQuickNavBridgeState(quicknav);
  testQuickNavAutoCollapse(quicknav);
  testTreeStateBroadcast(tree);
  console.log('PASS dev/test-chatgpt-tree-quicknav-autocollapse.js');
}

main();
