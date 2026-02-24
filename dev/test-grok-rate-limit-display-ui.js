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
  expectRegex(source, /const\s+DOM_GUARD_ATTR\s*=\s*'data-aichat-grok-quota-display-active'/, 'should define cross-context singleton guard attribute');
  expectRegex(source, /document\.documentElement\?\.getAttribute\(DOM_GUARD_ATTR\)\s*===\s*'1'/, 'should short-circuit when guard attribute is already set');
  expectRegex(source, /document\.documentElement\?\.setAttribute\(DOM_GUARD_ATTR,\s*'1'\)/, 'should set singleton guard attribute when booting');
  expectRegex(source, /function\s+cleanupDuplicateFloatingRoots\(/, 'should define duplicate floating root cleanup');
  expectRegex(source, /document\.querySelectorAll\(`#\$\{FLOATING_ROOT_ID\}`\)/, 'duplicate cleanup should scan roots by id');
  expectRegex(source, /if\s*\(root\s*===\s*keeper\)\s*continue;/, 'duplicate cleanup should keep exactly one root');
  expectRegex(source, /root\.remove\(\)/, 'duplicate cleanup should remove extra roots');
}

function testResidentPanelDesign(source) {
  expectRegex(source, /const\s+ROOT_MIN_HEIGHT_PX\s*=\s*16/, 'resident panel should keep compact minimum height');
  expectRegex(source, /card\.style\.padding\s*=\s*'2px 4px'/, 'resident panel should keep compact padding');
  expectRegex(source, /card\.style\.display\s*=\s*'inline-flex'/, 'resident panel should render as compact inline card');
  expectRegex(source, /root\.appendChild\(card\)/, 'root should append quota card directly');
  expectRegex(source, /const\s+PANEL_VALUE_ID\s*=\s*'aichat-grok-quota-value'/, 'should use dedicated value node id');
  expectRegex(source, /value\.textContent\s*=\s*'--\/--'/, 'initial value should be placeholder');
}

function testAllOnlyAndNoMenu(source) {
  expectRegex(source, /const\s+TARGET_MODEL_NAME\s*=\s*'grok-4'/, 'should fetch only Grok all pool model');
  assert.ok(!/grok-4-heavy/.test(source), 'all-only mode should remove heavy endpoint');
  assert.ok(!/grok-420/.test(source), 'all-only mode should remove 4.2 endpoint');
  assert.ok(!/ACTION_MENU_BUTTON_ID/.test(source), 'all-only mode should remove dropdown menu trigger');
  assert.ok(!/ACTION_MENU_PANEL_ID/.test(source), 'all-only mode should remove dropdown menu panel');
  assert.ok(!/createIconButton\(/.test(source), 'all-only mode should remove icon button helper');
  assert.ok(!/toggleActionMenu\(/.test(source), 'all-only mode should remove menu toggle logic');
  assert.ok(!/inferHeavyAccessFromModelMenu\(/.test(source), 'all-only mode should remove heavy capability inference');
  assert.ok(!/filterRowsByCapabilities\(/.test(source), 'all-only mode should remove heavy row filtering logic');
}

function testRefreshBehavior(source) {
  expectRegex(source, /body:\s*JSON\.stringify\(\{[\s\S]*modelName:\s*TARGET_MODEL_NAME[\s\S]*\}\)/, 'request payload should use all-only model target');
  expectRegex(source, /renderCounter\('--\/--',\s*'loading'\)/, 'refresh should show loading placeholder');
  expectRegex(source, /renderCounter\(formatCounter\(counter\),\s*'ready'\)/, 'refresh should render parsed all counter');
  expectRegex(source, /renderCounter\('—\/—',\s*'error'\)/, 'refresh should render fallback on request failure');
}

function testRouteGatingAndObserverDebounce(source) {
  expectRegex(source, /function\s+isGrokConversationPath\(/, 'quota panel should define Grok conversation route guard');
  expectRegex(source, /return\s+\/\^\\\/c\(\?:\\\/\|\$\)\/\.test\(path\);/, 'route guard should target /c conversation paths');
  expectRegex(source, /function\s+scheduleSyncQueryBar\(/, 'mutation observer sync should be debounced');
  expectRegex(source, /window\.requestAnimationFrame\(/, 'debounced sync should schedule via requestAnimationFrame');
}

function testLegacyCleanup(source) {
  expectRegex(source, /const\s+POSITION_STATE_KEY\s*=\s*'aichat_grok_quota_position_v1'/, 'should keep legacy key for cleanup compatibility');
  expectRegex(source, /window\.localStorage\?\.removeItem\(POSITION_STATE_KEY\)/, 'should clear legacy position key to avoid stale state');
}

function main() {
  const source = readSource();
  testFloatingLayout(source);
  testSingletonGuardAndDedupe(source);
  testResidentPanelDesign(source);
  testAllOnlyAndNoMenu(source);
  testRefreshBehavior(source);
  testRouteGatingAndObserverDebounce(source);
  testLegacyCleanup(source);
  console.log('PASS dev/test-grok-rate-limit-display-ui.js');
}

main();
