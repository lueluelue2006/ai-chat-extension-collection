#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'grok-rate-limit-display', 'main.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function testFloatingLayout(source) {
  expectRegex(source, /const\s+FLOATING_ROOT_ID\s*=\s*'aichat-grok-quota-floating-root'/, 'should define floating root id');
  expectRegex(source, /root\.style\.position\s*=\s*'fixed'/, 'quota UI should use fixed floating layout');
  expectRegex(source, /const\s+PINNED_RIGHT_PX\s*=\s*0/, 'quota ui should pin to the far right edge');
  expectRegex(source, /const\s+PINNED_BOTTOM_PX\s*=\s*0/, 'quota ui should pin to the far bottom edge');
  expectRegex(source, /root\.style\.right\s*=\s*`\$\{PINNED_RIGHT_PX\}px`/, 'floating root should initialize at bottom-right corner');
  expectRegex(source, /root\.style\.bottom\s*=\s*`\$\{PINNED_BOTTOM_PX\}px`/, 'floating root should initialize at bottom-right corner');
}

function testSingletonGuardAndDedupe(source) {
  expectRegex(source, /const\s+DOM_GUARD_ATTR\s*=\s*'data-aichat-grok-quota-display-active'/, 'should define a cross-context singleton guard attribute');
  expectRegex(source, /document\.documentElement\?\.getAttribute\(DOM_GUARD_ATTR\)\s*===\s*'1'/, 'should short-circuit when guard attribute is already set');
  expectRegex(source, /document\.documentElement\?\.setAttribute\(DOM_GUARD_ATTR,\s*'1'\)/, 'should set singleton guard attribute when booting');
  expectRegex(source, /function\s+cleanupDuplicateFloatingRoots\(/, 'should define duplicate floating root cleanup');
  expectRegex(source, /document\.querySelectorAll\(`#\$\{FLOATING_ROOT_ID\}`\)/, 'duplicate cleanup should scan roots by id');
  expectRegex(source, /if\s*\(root\s*===\s*keeper\)\s*continue;/, 'duplicate cleanup should keep exactly one root');
  expectRegex(source, /root\.remove\(\)/, 'duplicate cleanup should remove extra roots');
}

function testResidentPanelDesign(source) {
  expectRegex(source, /const\s+ROOT_WIDTH_PX\s*=\s*90/, 'resident panel should keep micro-card width');
  expectRegex(source, /const\s+ROOT_MIN_HEIGHT_PX\s*=\s*44/, 'resident panel should keep compact minimum height');
  expectRegex(source, /card\.style\.padding\s*=\s*'3px 4px'/, 'resident panel should maximize compact content area');
  expectRegex(source, /root\.appendChild\(card\)/, 'root should always append quota card directly');
  assert.ok(!/TOGGLE_ID/.test(source), 'resident mode should remove expand/collapse toggle id');
  assert.ok(!/setCollapsed\(/.test(source), 'resident mode should remove collapsed-state transitions');
  assert.ok(!/panel\.style\.display\s*=\s*isCollapsed/.test(source), 'resident mode should not hide panel by collapsed state');
  assert.ok(!/root\.appendChild\(toggle\)/.test(source), 'resident mode should not append a toggle button');
}

function testSingleDropdownMenu(source) {
  expectRegex(source, /const\s+ACTION_MENU_BUTTON_ID\s*=\s*'aichat-grok-quota-menu-trigger'/, 'should define deterministic menu trigger id');
  expectRegex(source, /const\s+ACTION_MENU_PANEL_ID\s*=\s*'aichat-grok-quota-menu-panel'/, 'should define deterministic menu panel id');
  expectRegex(source, /const\s+menuBtn\s*=\s*createIconButton\(\{[\s\S]*label:\s*'⋯'/, 'should provide a single dropdown trigger button');
  expectRegex(source, /menuBtn\.id\s*=\s*ACTION_MENU_BUTTON_ID/, 'dropdown trigger should expose stable id');
  expectRegex(source, /menuPanel\.id\s*=\s*ACTION_MENU_PANEL_ID/, 'dropdown panel should expose stable id');
  expectRegex(source, /appendMenuItem\('立即刷新'/, 'dropdown should include refresh action');
  expectRegex(source, /appendMenuItem\('贴右下角'/, 'dropdown should include re-pin action');
  assert.ok(!/actions\.appendChild\(dockLeftBtn\)/.test(source), 'should remove multiple always-visible action buttons');
}

function testPositionPersistence(source) {
  expectRegex(source, /function\s+pinFloatingRootToBottomRight\(/, 'should provide a dedicated bottom-right pin helper');
  expectRegex(source, /root\.style\.left\s*=\s*'auto'/, 'pin helper should clear left anchor');
  expectRegex(source, /root\.style\.top\s*=\s*'auto'/, 'pin helper should clear top anchor');
  expectRegex(source, /root\.style\.right\s*=\s*`\$\{PINNED_RIGHT_PX\}px`/, 'pin helper should enforce right anchor');
  expectRegex(source, /root\.style\.bottom\s*=\s*`\$\{PINNED_BOTTOM_PX\}px`/, 'pin helper should enforce bottom anchor');
  expectRegex(source, /function\s+resetFloatingPosition\(/, 'should expose reset action for re-pinning');
}

function testDragInteractions(source) {
  assert.ok(!/function\s+enableFloatingDrag\(/.test(source), 'resident mode should remove drag helper implementation');
  assert.ok(!/enableFloatingDrag\(header\)/.test(source), 'bottom-right pinned mode should not install header drag handlers');
  assert.ok(!/enableFloatingDrag\(toggle/.test(source), 'bottom-right pinned mode should not install toggle drag handlers');
}

function testViewportClampBehavior(source) {
  expectRegex(source, /function\s+onViewportChanged\(/, 'should react to viewport changes');
  expectRegex(source, /pinFloatingRootToBottomRight\(\);/, 'viewport handler should re-pin widget to bottom-right');
}

function testNoQueryBarInlineEmbedding(source) {
  assert.ok(!/findToolsContainer\(/.test(source), 'should no longer embed inside query-bar tools area');
}

function testStatePersistence(source) {
  expectRegex(source, /const\s+POSITION_STATE_KEY\s*=\s*'aichat_grok_quota_position_v1'/, 'should keep position storage key for backward cleanup compatibility');
  assert.ok(!/POSITION_STATE_SCHEMA/.test(source), 'resident mode should remove legacy position schema transforms');
  assert.ok(!/function\s+readPositionState\(/.test(source), 'resident mode should remove position read path');
  assert.ok(!/function\s+writePositionState\(/.test(source), 'resident mode should remove position write path');
  assert.ok(!/aichat_grok_quota_ui_state_v1/.test(source), 'resident mode should remove collapsed-state storage key');
  assert.ok(!/collapsed/.test(source), 'resident mode should remove collapsed-state storage logic');
}

function testLegacyRootRecovery(source) {
  assert.ok(!/function\s+adoptExistingFloatingUi\(/.test(source), 'legacy root adoption path should be removed to avoid stale collapsed DOM');
  expectRegex(
    source,
    /if\s*\(dedupedRoot\s*&&\s*dedupedRoot\.parentNode\)\s*\{\s*dedupedRoot\.parentNode\.removeChild\(dedupedRoot\);/s,
    'ensureFloatingUi should discard deduped legacy root before creating a fresh resident card'
  );
}

function testCompactQuotaLabels(source) {
  expectRegex(source, /\{\s*key:\s*'pool',\s*label:\s*'all'/, 'pool row should use compact all label');
  expectRegex(source, /\{\s*key:\s*'heavy',\s*label:\s*'heavy'/, 'heavy row should use compact heavy label');
  expectRegex(source, /\{\s*key:\s*'g420',\s*label:\s*'4\.2'/, '4.20 row should use compact 4.2 label');
}

function testRouteGatingAndObserverDebounce(source) {
  expectRegex(source, /function\s+isGrokConversationPath\(/, 'quota panel should define Grok conversation route guard');
  expectRegex(source, /return\s+\/\^\\\/c\(\?:\\\/\|\$\)\/\.test\(path\);/, 'route guard should target /c conversation paths');
  expectRegex(source, /function\s+scheduleSyncQueryBar\(/, 'mutation observer sync should be debounced');
  expectRegex(source, /window\.requestAnimationFrame\(/, 'debounced sync should schedule via requestAnimationFrame');
}

function main() {
  const source = readSource();
  testFloatingLayout(source);
  testSingletonGuardAndDedupe(source);
  testResidentPanelDesign(source);
  testSingleDropdownMenu(source);
  testPositionPersistence(source);
  testDragInteractions(source);
  testViewportClampBehavior(source);
  testNoQueryBarInlineEmbedding(source);
  testStatePersistence(source);
  testLegacyRootRecovery(source);
  testCompactQuotaLabels(source);
  testRouteGatingAndObserverDebounce(source);
  console.log('PASS dev/test-grok-rate-limit-display-ui.js');
}

main();
