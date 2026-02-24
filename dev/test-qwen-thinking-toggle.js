#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

class MockClassList {
  constructor(list = []) {
    this._set = new Set(list);
  }

  contains(name) {
    return this._set.has(name);
  }
}

global.Element = class MockBaseElement {};

global.HTMLTextAreaElement = class MockTextarea extends global.Element {};
global.HTMLInputElement = class MockInput extends global.Element {};

class MockElement extends global.Element {
  constructor({ text = '', ariaLabel = '', selected = false } = {}) {
    super();
    this.textContent = text;
    this._ariaLabel = ariaLabel;
    this._selected = selected;
    this.classList = new MockClassList(selected ? ['ant-select-item-option-selected'] : []);
  }

  getAttribute(name) {
    if (name === 'aria-label') return this._ariaLabel;
    if (name === 'aria-selected') return this._selected ? 'true' : null;
    return null;
  }
}

const toggleModule = require(path.join(__dirname, '..', 'content', 'qwen-thinking-toggle', 'main.js'));

function testClassifyMode() {
  assert.strictEqual(toggleModule.classifyMode('Thinking'), 'thinking');
  assert.strictEqual(toggleModule.classifyMode('快速模式'), 'fast');
  assert.strictEqual(toggleModule.classifyMode('Auto'), 'auto');
  assert.strictEqual(toggleModule.classifyMode('Unknown'), 'unknown');
}

function testHotkeyActionResolve() {
  assert.strictEqual(toggleModule.getActionFromKeydown({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: 'o' }), 'toggle_mode');
  assert.strictEqual(toggleModule.getActionFromKeydown({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, code: 'KeyJ' }), 'toggle_model');
  assert.strictEqual(toggleModule.getActionFromKeydown({ metaKey: false, key: 'o' }), null);
  assert.strictEqual(toggleModule.getActionFromKeydown({ metaKey: true, ctrlKey: true, key: 'o' }), null);
}

function testPickModeOptionToggleDirection() {
  const thinking = new MockElement({ text: 'Thinking' });
  const fast = new MockElement({ text: 'Fast' });

  const fromThinking = toggleModule.pickModeOption([thinking, fast], 'Thinking');
  assert.strictEqual(fromThinking.option, fast);
  assert.strictEqual(fromThinking.want, 'fast');

  const fromFast = toggleModule.pickModeOption([thinking, fast], 'Fast');
  assert.strictEqual(fromFast.option, thinking);
  assert.strictEqual(fromFast.want, 'thinking');
}

function testPickSpecificModeOptionForInitialBootstrap() {
  const auto = new MockElement({ text: 'Auto' });
  const thinking = new MockElement({ text: 'Thinking' });
  const fast = new MockElement({ text: 'Fast' });

  assert.strictEqual(toggleModule.pickSpecificModeOption([auto, fast, thinking], 'thinking'), thinking);
  assert.strictEqual(toggleModule.pickSpecificModeOption([auto, fast], 'thinking'), null);
}

function main() {
  testClassifyMode();
  testHotkeyActionResolve();
  testPickModeOptionToggleDirection();
  testPickSpecificModeOptionForInitialBootstrap();

  console.log('PASS dev/test-qwen-thinking-toggle.js');
}

main();
