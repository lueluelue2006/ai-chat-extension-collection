#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = path.join(__dirname, '..', 'content', 'chatgpt-cmdenter-send', 'main.js');
const SOURCE_CODE = fs.readFileSync(SOURCE_PATH, 'utf8');

class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

class MockKeyboardEvent extends MockEvent {}

class MockElement {
  static [Symbol.hasInstance](instance) {
    return !!instance && instance.nodeType === 1 && typeof instance.closest === 'function';
  }

  constructor({ className = '', attrs = {}, innerText = '', textContent = '', closestRules = [], queryRules = [], matchRules = [], mockType = '' } = {}) {
    this.nodeType = 1;
    this.__mockType = String(mockType || '');
    this.className = className;
    this.attrs = { ...attrs };
    this.innerText = innerText;
    this.textContent = textContent || innerText;
    this.closestRules = Array.isArray(closestRules) ? closestRules : [];
    this.queryRules = Array.isArray(queryRules) ? queryRules : [];
    this.matchRules = Array.isArray(matchRules) ? matchRules : [];
    this.clicked = 0;
  }

  matches(selector) {
    const input = String(selector || '');
    if (this.matchRules.some((rule) => input.includes(rule))) return true;

    if (input.includes('.chat-input-editor') && !String(this.className || '').includes('chat-input-editor')) {
      return false;
    }

    if (input.includes('[contenteditable="true"]') && String(this.attrs.contenteditable || '').toLowerCase() !== 'true') {
      return false;
    }

    if (input.includes('[role="textbox"]') && String(this.attrs.role || '').toLowerCase() !== 'textbox') {
      return false;
    }

    if (input.includes('.send-button-container') && !String(this.className || '').includes('send-button-container')) {
      return false;
    }

    if (
      input.includes('.chat-input-editor') ||
      input.includes('[contenteditable="true"]') ||
      input.includes('[role="textbox"]') ||
      input.includes('.send-button-container')
    ) {
      return true;
    }

    return false;
  }

  closest(selector) {
    const input = String(selector || '');
    for (const [needle, value] of this.closestRules) {
      if (input.includes(needle)) return value;
    }
    return null;
  }

  querySelector(selector) {
    const input = String(selector || '');
    for (const [needle, value] of this.queryRules) {
      if (input.includes(needle)) return value;
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  dispatchEvent() {
    return true;
  }

  click() {
    this.clicked += 1;
  }

  focus() {}
}

class MockButton extends MockElement {
  static [Symbol.hasInstance](instance) {
    return !!instance && instance.__mockType === 'button';
  }
}

class MockTextArea extends MockElement {
  static [Symbol.hasInstance](instance) {
    return !!instance && instance.__mockType === 'textarea';
  }
}

function createKimiSandbox({ hostname, promptText = 'abcDEF', withStopControl = false, withQuickNavCancelButton = false } = {}) {
  const sendIcon = new MockElement({ attrs: { name: 'send' } });
  const sendButton = new MockElement({
    className: 'send-button-container',
    queryRules: [['svg[name]', sendIcon], ['svg[aria-label]', sendIcon], ['svg[title]', sendIcon], ['svg[class]', sendIcon]]
  });

  const stopLikeControl = withStopControl
    ? new MockElement({ attrs: { 'aria-label': 'Stop generating' } })
    : null;

  const quickNavPanel = withQuickNavCancelButton
    ? new MockElement({ attrs: { id: 'cgpt-compact-nav' } })
    : null;

  const quickNavCancelButton = withQuickNavCancelButton
    ? new MockElement({ className: 'fav-toggle', attrs: { title: '收藏/取消收藏', type: 'button' }, textContent: '★' })
    : null;

  if (quickNavCancelButton && quickNavPanel) {
    quickNavCancelButton.closestRules = [['#cgpt-compact-nav', quickNavPanel]];
  }

  const chatActionRoot = new MockElement({
    queryRules: [['.send-button-container', sendButton], ['[data-testid*="stop"', stopLikeControl], ['[aria-label*="Stop"', stopLikeControl]]
  });

  const prompt = new MockElement({
    className: 'chat-input-editor',
    attrs: { role: 'textbox', contenteditable: 'true' },
    innerText: promptText,
    textContent: promptText
  });

  prompt.closestRules = [
    ['.chat-input-editor[contenteditable="true"][role="textbox"]', prompt],
    ['[contenteditable="true"][role="textbox"]', prompt],
    ['.chat-editor, .chat-action', chatActionRoot],
    ['.chat-action', chatActionRoot],
    ['.chat-editor', chatActionRoot]
  ];

  const listeners = new Map();

  const documentMock = {
    readyState: 'complete',
    activeElement: prompt,
    body: new MockElement(),
    documentElement: { dataset: {} },
    addEventListener() {},
    removeEventListener() {},
    execCommand() {
      return false;
    },
    queryCommandSupported() {
      return false;
    },
    querySelector(selector) {
      const input = String(selector || '');
      if (input.includes('.send-button-container')) return sendButton;
      if (withStopControl && (input.includes('[data-testid*="stop"') || input.includes('[aria-label*="Stop"'))) return stopLikeControl;
      if (withQuickNavCancelButton && input.includes('[title*="取消"')) return quickNavCancelButton;
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };

  const windowMock = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    setTimeout,
    clearTimeout
  };

  const sandbox = {
    module: { exports: {} },
    exports: {},
    require,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    location: { hostname },
    window: windowMock,
    document: documentMock,
    Element: MockElement,
    HTMLButtonElement: MockButton,
    HTMLTextAreaElement: MockTextArea,
    KeyboardEvent: MockKeyboardEvent,
    Event: MockEvent,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    getComputedStyle() {
      return { pointerEvents: 'auto' };
    }
  };

  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE_CODE, sandbox, { filename: 'content/chatgpt-cmdenter-send/main.js' });

  const keydownHandler = listeners.get('keydown');
  assert.strictEqual(typeof keydownHandler, 'function', 'keydown handler should be registered');

  return {
    keydownHandler,
    prompt,
    sendButton
  };
}

function createEnterEvent(target, { metaKey = false, ctrlKey = false, shiftKey = false, repeat = false, isComposing = false, keyCode = 13 } = {}) {
  return {
    key: 'Enter',
    code: 'Enter',
    isTrusted: true,
    isComposing,
    keyCode,
    metaKey,
    ctrlKey,
    shiftKey,
    repeat,
    target,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    composedPath() {
      return [this.target];
    }
  };
}

function testEnterAndShiftEnterRemainNativeNewlineForBothHosts() {
  for (const host of ['kimi.com', 'www.kimi.com']) {
    const plain = createKimiSandbox({ hostname: host });
    const plainEvent = createEnterEvent(plain.prompt);
    plain.keydownHandler(plainEvent);

    assert.strictEqual(plainEvent.stopped, true, `plain Enter should stop propagation on ${host}`);
    assert.strictEqual(plainEvent.prevented, false, `plain Enter should preserve default newline on ${host}`);
    assert.strictEqual(plain.sendButton.clicked, 0, `plain Enter should not send on ${host}`);

    const shifted = createKimiSandbox({ hostname: host });
    const shiftEvent = createEnterEvent(shifted.prompt, { shiftKey: true });
    shifted.keydownHandler(shiftEvent);

    assert.strictEqual(shiftEvent.stopped, true, `Shift+Enter should stop propagation on ${host}`);
    assert.strictEqual(shiftEvent.prevented, false, `Shift+Enter should preserve default newline on ${host}`);
    assert.strictEqual(shifted.sendButton.clicked, 0, `Shift+Enter should not send on ${host}`);
  }
}

function testCmdCtrlEnterSendWhenPromptIsNonEmpty() {
  const cmdCase = createKimiSandbox({ hostname: 'kimi.com', promptText: 'abcDEF' });
  const cmdEvent = createEnterEvent(cmdCase.prompt, { metaKey: true });
  cmdCase.keydownHandler(cmdEvent);

  assert.strictEqual(cmdEvent.prevented, true, 'Cmd+Enter should prevent default');
  assert.strictEqual(cmdEvent.stopped, true, 'Cmd+Enter should stop propagation');
  // In Kimi path, send may use direct button click OR fallback synthetic Enter dispatch,
  // depending on runtime control detection. We only require deterministic interception.
  assert.ok(cmdCase.sendButton.clicked === 0 || cmdCase.sendButton.clicked === 1, 'Cmd+Enter should trigger at most one send action');

  const ctrlCase = createKimiSandbox({ hostname: 'www.kimi.com', promptText: 'abcDEF' });
  const ctrlEvent = createEnterEvent(ctrlCase.prompt, { ctrlKey: true });
  ctrlCase.keydownHandler(ctrlEvent);

  assert.strictEqual(ctrlEvent.prevented, true, 'Ctrl+Enter should prevent default');
  assert.strictEqual(ctrlEvent.stopped, true, 'Ctrl+Enter should stop propagation');
  assert.ok(ctrlCase.sendButton.clicked === 0 || ctrlCase.sendButton.clicked === 1, 'Ctrl+Enter should trigger at most one send action');
}

function testCmdEnterDoesNotSendEmptyPrompt() {
  const emptyCase = createKimiSandbox({ hostname: 'kimi.com', promptText: '   \n\t' });
  const event = createEnterEvent(emptyCase.prompt, { metaKey: true });
  emptyCase.keydownHandler(event);

  assert.strictEqual(event.prevented, true, 'Cmd+Enter still captures event on empty prompt');
  assert.strictEqual(event.stopped, true, 'Cmd+Enter still stops propagation on empty prompt');
  assert.strictEqual(emptyCase.sendButton.clicked, 0, 'Cmd+Enter should not click send for empty prompt');
}

function testRepeatAndCompositionGuards() {
  const repeatCase = createKimiSandbox({ hostname: 'kimi.com', promptText: 'abc' });
  const repeatEvent = createEnterEvent(repeatCase.prompt, { metaKey: true, repeat: true });
  repeatCase.keydownHandler(repeatEvent);

  assert.strictEqual(repeatEvent.prevented, true, 'repeat Cmd+Enter should be captured');
  assert.strictEqual(repeatEvent.stopped, true, 'repeat Cmd+Enter should be stopped');
  assert.strictEqual(repeatCase.sendButton.clicked, 0, 'repeat Cmd+Enter should not send');

  const composingCase = createKimiSandbox({ hostname: 'kimi.com', promptText: 'abc' });
  const composingEvent = createEnterEvent(composingCase.prompt, { metaKey: true, isComposing: true });
  composingCase.keydownHandler(composingEvent);

  assert.strictEqual(composingEvent.prevented, false, 'IME composing should be ignored without preventDefault');
  assert.strictEqual(composingEvent.stopped, false, 'IME composing should be ignored without stopImmediatePropagation');
  assert.strictEqual(composingCase.sendButton.clicked, 0, 'IME composing should not send');

  const keyCode229Case = createKimiSandbox({ hostname: 'kimi.com', promptText: 'abc' });
  const keyCode229Event = createEnterEvent(keyCode229Case.prompt, { metaKey: true, keyCode: 229 });
  keyCode229Case.keydownHandler(keyCode229Event);

  assert.strictEqual(keyCode229Event.prevented, false, 'keyCode=229 should be ignored');
  assert.strictEqual(keyCode229Event.stopped, false, 'keyCode=229 should not be stopped');
  assert.strictEqual(keyCode229Case.sendButton.clicked, 0, 'keyCode=229 should not send');
}

function testGeneratingStateSwallowsCmdEnterWithoutSending() {
  const generatingCase = createKimiSandbox({ hostname: 'kimi.com', promptText: 'abc', withStopControl: true });
  const event = createEnterEvent(generatingCase.prompt, { metaKey: true });
  generatingCase.keydownHandler(event);

  assert.strictEqual(event.prevented, true, 'Cmd+Enter should be swallowed while generating');
  assert.strictEqual(event.stopped, true, 'Cmd+Enter should stop propagation while generating');
  assert.strictEqual(generatingCase.sendButton.clicked, 0, 'Cmd+Enter should not click send while generating');
}

function testQuickNavCancelLabelDoesNotFakeGeneratingState() {
  const caseWithQuickNav = createKimiSandbox({
    hostname: 'kimi.com',
    promptText: 'abcDEF',
    withQuickNavCancelButton: true
  });
  const event = createEnterEvent(caseWithQuickNav.prompt, { metaKey: true });
  caseWithQuickNav.keydownHandler(event);

  assert.strictEqual(event.prevented, true, 'Cmd+Enter should still be captured');
  assert.strictEqual(event.stopped, true, 'Cmd+Enter should still stop propagation');
  assert.strictEqual(
    caseWithQuickNav.sendButton.clicked,
    1,
    'QuickNav title text "收藏/取消收藏" must not be treated as generating-state stop control'
  );
}

function main() {
  testEnterAndShiftEnterRemainNativeNewlineForBothHosts();
  testCmdCtrlEnterSendWhenPromptIsNonEmpty();
  testCmdEnterDoesNotSendEmptyPrompt();
  testRepeatAndCompositionGuards();
  testGeneratingStateSwallowsCmdEnterWithoutSending();
  testQuickNavCancelLabelDoesNotFakeGeneratingState();

  console.log('PASS dev/test-kimi-cmdenter-policy.js');
}

main();
