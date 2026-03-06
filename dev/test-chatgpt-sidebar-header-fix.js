#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'content', 'chatgpt-sidebar-header-fix', 'main.js'), 'utf8');

function testTopbarActionsAreRelocatedInline() {
  assert.ok(
    SOURCE.includes(`const TOPBAR_MODEL_SELECTOR = 'button[data-testid="model-switcher-dropdown-button"]';`),
    'sidebar-header-fix should anchor the topbar action move to the ChatGPT model switcher'
  );
  assert.ok(
    SOURCE.includes('function matchesTopbarActionLabel(label)') &&
      SOURCE.includes("lower.includes('group chat')") &&
      SOURCE.includes("lower.includes('temporary chat')"),
    'sidebar-header-fix should recognize the group chat / temporary chat topbar actions'
  );
  assert.ok(
    SOURCE.includes('/群聊/.test(raw)') &&
      SOURCE.includes('/临时(聊天|对话|会话)/.test(raw)'),
    'sidebar-header-fix should keep the topbar action detection locale-tolerant'
  );
  assert.ok(
    SOURCE.includes('function findTopbarActionsHost(header, modelRow)') &&
      SOURCE.includes('function moveTopbarActionsInline(modelRow, modelButton, actionsHost)'),
    'sidebar-header-fix should locate and move the topbar actions container instead of using brittle offsets'
  );
  assert.ok(
    SOURCE.includes("topbarActionsPlaceholder.setAttribute(TOPBAR_PLACEHOLDER_ATTR, '1');") ||
      SOURCE.includes("placeholder.setAttribute(TOPBAR_PLACEHOLDER_ATTR, '1');"),
    'sidebar-header-fix should keep a placeholder so the topbar actions can be restored on cleanup'
  );
  assert.ok(
    SOURCE.includes("actionsHost.setAttribute(TOPBAR_RELOCATED_ATTR, '1');"),
    'sidebar-header-fix should mark relocated topbar actions to avoid duplicate reparenting'
  );
  assert.ok(
    SOURCE.includes('scheduleTopbarEnsure(\'route\');') &&
      SOURCE.includes('setTrackedTimeout(() => scheduleTopbarEnsure(\'route+160\'), 160);') &&
      SOURCE.includes('setTrackedTimeout(() => scheduleTopbarEnsure(\'route+640\'), 640);'),
    'sidebar-header-fix should resync the topbar layout after ChatGPT route changes'
  );
  assert.ok(
    SOURCE.includes('new MutationObserver(() => {') &&
      SOURCE.includes('scheduleTopbarEnsure(`header-mutation:${reason}`);'),
    'sidebar-header-fix should watch the active topbar header for re-renders'
  );
  assert.ok(
    SOURCE.includes(`.${'${TOPBAR_INLINE_ACTIONS_CLASS}'}{`) &&
      SOURCE.includes(`margin-inline-start: ${'${TOPBAR_MIN_GAP_PX}'}px !important;`),
    'sidebar-header-fix should style the relocated topbar actions as a compact inline group'
  );
}

function main() {
  testTopbarActionsAreRelocatedInline();
  console.log('PASS dev/test-chatgpt-sidebar-header-fix.js');
}

main();
