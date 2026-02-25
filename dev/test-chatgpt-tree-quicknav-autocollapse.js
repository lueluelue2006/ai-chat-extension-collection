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
    /let\s+treeAutoRestoreQuickNavAfterTreeClose\s*=\s*false;/.test(source),
    'quicknav should track whether tree close needs nav restore'
  );
  assert.ok(
    /if\s*\(!wasTreeOpen\)\s*\{\s*const\s+wasNavExpanded\s*=\s*!isQuickNavCollapsed\(ui\);\s*treeAutoRestoreQuickNavAfterTreeClose\s*=\s*wasNavExpanded;\s*if\s*\(wasNavExpanded\)\s*setQuickNavCollapsed\(ui,\s*true\);/s.test(
      source
    ),
    'opening tree should auto-collapse quicknav only when nav was expanded'
  );
  assert.ok(
    /function\s+syncQuickNavTreeAutoCollapse\(ui\)\s*\{[\s\S]*if\s*\(treePanelOpen\)\s*return;[\s\S]*if\s*\(!treeAutoRestoreQuickNavAfterTreeClose\)\s*return;[\s\S]*setQuickNavCollapsed\(ui,\s*false\);[\s\S]*treeAutoRestoreQuickNavAfterTreeClose\s*=\s*false;/s.test(
      source
    ),
    'closing tree should auto-restore quicknav only when previously auto-collapsed'
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
