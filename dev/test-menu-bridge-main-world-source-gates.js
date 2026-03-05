#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MENU_BRIDGE_SOURCE = fs.readFileSync(path.join(ROOT, 'content', 'menu-bridge.js'), 'utf8');
const USAGE_MONITOR_SOURCE = fs.readFileSync(path.join(ROOT, 'content', 'chatgpt-usage-monitor', 'main.js'), 'utf8');
const MESSAGE_TREE_SOURCE = fs.readFileSync(path.join(ROOT, 'content', 'chatgpt-message-tree', 'main.js'), 'utf8');

function testMainWorldRegistrationIsSourceGated() {
  assert.ok(
    MENU_BRIDGE_SOURCE.includes("sourceIncludes: 'content/chatgpt-usage-monitor/main.js'") &&
      MENU_BRIDGE_SOURCE.includes("sourceIncludes: 'content/chatgpt-message-tree/main.js'"),
    'main-world menu registrations should pin each allowlist entry to an extension source file'
  );
  assert.ok(
    MENU_BRIDGE_SOURCE.includes('function getMainWorldAllowRule(group, handlerKey, callerSource)'),
    'menu bridge should centralize main-world source allowlist checks'
  );
  assert.ok(
    MENU_BRIDGE_SOURCE.includes('if (!getMainWorldAllowRule(group, handlerKey, callerSource)) return;'),
    'menu bridge should reject main-world registration events without a trusted caller source'
  );
}

function testMainWorldRunHandlersOnlyTrustMenuBridgeSource() {
  assert.ok(
    USAGE_MONITOR_SOURCE.includes("const __aichatMainMenuBridgeSource = 'content/menu-bridge.js';") &&
      USAGE_MONITOR_SOURCE.includes('if (!__aichatIsTrustedMainMenuRunDispatch()) return;'),
    'usage monitor should only run menu commands dispatched from content/menu-bridge.js'
  );
  assert.ok(
    MESSAGE_TREE_SOURCE.includes("const MAIN_MENU_BRIDGE_SOURCE = 'content/menu-bridge.js';") &&
      MESSAGE_TREE_SOURCE.includes('if (!isTrustedMainMenuRunDispatch()) return;'),
    'message tree should only run menu commands dispatched from content/menu-bridge.js'
  );
}

function main() {
  testMainWorldRegistrationIsSourceGated();
  testMainWorldRunHandlersOnlyTrustMenuBridgeSource();
  console.log('PASS dev/test-menu-bridge-main-world-source-gates.js');
}

main();
