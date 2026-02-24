#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const sendModule = require(path.join(__dirname, '..', 'content', 'chatgpt-cmdenter-send', 'main.js'));

function createMockElement({ closestRules = [], matchRules = [], queryRules = [], selfClosestRules = [], parentElement = null, props = {} } = {}) {
  const element = {
    nodeType: 1,
    parentElement,
    closest(selector) {
      for (const needle of selfClosestRules) {
        if (selector.includes(needle)) return element;
      }
      for (const [needle, value] of closestRules) {
        if (selector.includes(needle)) return value;
      }
      return null;
    },
    matches(selector) {
      for (const needle of matchRules) {
        if (selector.includes(needle)) return true;
      }
      return false;
    },
    querySelector(selector) {
      for (const [needle, value] of queryRules) {
        if (selector.includes(needle)) return value;
      }
      return null;
    },
    getAttribute() {
      return null;
    },
    className: '',
    readOnly: false
  };

  Object.assign(element, props);
  return element;
}

function testQwenEnterIntent() {
  assert.strictEqual(sendModule.getQwenEnterIntent({ key: 'Enter', isTrusted: true, metaKey: true, ctrlKey: false }), 'send');
  assert.strictEqual(sendModule.getQwenEnterIntent({ key: 'Enter', isTrusted: true, metaKey: false, ctrlKey: true }), 'send');
  assert.strictEqual(sendModule.getQwenEnterIntent({ key: 'Enter', isTrusted: true, metaKey: false, ctrlKey: false }), 'newline');

  assert.strictEqual(sendModule.getQwenEnterIntent({ key: 'Enter', isTrusted: true, isComposing: true }), 'ignore');
  assert.strictEqual(sendModule.getQwenEnterIntent({ key: 'Enter', isTrusted: true, keyCode: 229 }), 'ignore');
  assert.strictEqual(sendModule.getQwenEnterIntent({ key: 'Enter', isTrusted: true, ctrlKey: true, repeat: true }), 'send');
  assert.strictEqual(sendModule.getQwenEnterIntent({ key: 'a', isTrusted: true, ctrlKey: true }), 'ignore');
}

function testCollectEventProbeTargetsOrderAndDedup() {
  const target = { id: 'target' };
  const deepActive = { id: 'deep' };
  const activeElement = { id: 'active' };

  const probes = sendModule.collectEventProbeTargets(
    {
      target,
      composedPath() {
        return [target, deepActive, null, 'x'];
      }
    },
    deepActive,
    activeElement
  );

  assert.deepStrictEqual(probes, [target, deepActive, activeElement]);
}

function testQwenPromptDetectionFromEditableTextareaTarget() {
  const textarea = createMockElement({
    selfClosestRules: ['textarea.message-input-textarea'],
    matchRules: ['textarea.message-input-textarea']
  });
  const target = createMockElement({ closestRules: [['textarea.message-input-textarea', textarea]] });

  assert.strictEqual(sendModule.getQwenPromptElementFrom(target), textarea);
}

function testQwenPromptDetectionIgnoresReadonlyEditorTextarea() {
  const readonlyEditor = createMockElement({
    selfClosestRules: ['textarea.inputarea[aria-label="Editor content"][readonly]'],
    matchRules: ['textarea.inputarea[aria-label="Editor content"][readonly]', '[readonly]'],
    props: { readOnly: true }
  });
  const target = createMockElement({ closestRules: [['textarea.inputarea[aria-label="Editor content"][readonly]', readonlyEditor]] });

  assert.strictEqual(sendModule.getQwenPromptElementFrom(target), null);
}

function testQwenPromptDetectionUsesComposedPathAndDeepActiveFallback() {
  const textareaFromPath = createMockElement({
    selfClosestRules: ['textarea.message-input-textarea'],
    matchRules: ['textarea.message-input-textarea']
  });
  const pathNode = createMockElement({ closestRules: [['textarea.message-input-textarea', textareaFromPath]] });

  const promptFromPath = sendModule.getQwenPromptElementFromEvent(
    {
      target: { nodeType: 3 },
      composedPath() {
        return [{}, pathNode];
      }
    },
    null,
    null
  );
  assert.strictEqual(promptFromPath, textareaFromPath);

  const readonlyEditor = createMockElement({
    selfClosestRules: ['textarea.inputarea[aria-label="Editor content"][readonly]'],
    matchRules: ['textarea.inputarea[aria-label="Editor content"][readonly]', '[readonly]'],
    props: { readOnly: true }
  });

  const textareaFromDeepActive = createMockElement({
    selfClosestRules: ['textarea.message-input-textarea'],
    matchRules: ['textarea.message-input-textarea']
  });

  const deepActive = createMockElement({ closestRules: [['textarea.message-input-textarea', textareaFromDeepActive]] });
  const promptFromDeepActive = sendModule.getQwenPromptElementFromEvent(
    {
      target: createMockElement({ closestRules: [['textarea.inputarea[aria-label="Editor content"][readonly]', readonlyEditor]] }),
      composedPath() {
        return [readonlyEditor];
      }
    },
    deepActive,
    null
  );

  assert.strictEqual(promptFromDeepActive, textareaFromDeepActive);
}

function testQwenSendControlsResolveSendButtonFromComposerScope() {
  const sendButton = createMockElement();
  const composerScope = createMockElement({ queryRules: [['button.send-button', sendButton]] });

  const prompt = createMockElement({
    selfClosestRules: ['textarea.message-input-textarea'],
    matchRules: ['textarea.message-input-textarea'],
    closestRules: [['form', null]],
    parentElement: composerScope
  });

  const controls = sendModule.resolveQwenSendControls(prompt);
  assert.strictEqual(controls.scopedSubmitButton, sendButton);
  assert.strictEqual(controls.fallbackButton, sendButton);
}

function testQwenSendMethodPreference() {
  assert.strictEqual(
    sendModule.decideQwenSendMethod({
      hasForm: true,
      canRequestSubmit: true,
      hasScopedSubmitButton: true,
      hasFallbackButton: true
    }),
    'requestSubmit'
  );

  assert.strictEqual(
    sendModule.decideQwenSendMethod({
      hasForm: false,
      canRequestSubmit: false,
      hasScopedSubmitButton: true,
      hasFallbackButton: true
    }),
    'scopedClick'
  );

  assert.strictEqual(
    sendModule.decideQwenSendMethod({
      hasForm: false,
      canRequestSubmit: false,
      hasScopedSubmitButton: false,
      hasFallbackButton: true
    }),
    'fallbackClick'
  );

  assert.strictEqual(
    sendModule.decideQwenSendMethod({
      hasForm: false,
      canRequestSubmit: false,
      hasScopedSubmitButton: false,
      hasFallbackButton: false
    }),
    'none'
  );
}

function testModelPresetLabelNormalizers() {
  assert.strictEqual(sendModule.normalizeModelLabel('  Gemini   2.5  PRO  '), 'gemini 2.5 pro');
  assert.strictEqual(sendModule.normalizeModelLabel('ERNIE（5.0）'), 'ernie 5.0');
}

function testGeminiProLabelDetection() {
  assert.strictEqual(sendModule.isGeminiProLabel('Gemini 2.5 Pro'), true);
  assert.strictEqual(sendModule.isGeminiProLabel('Gemini Pro Experimental'), true);
  assert.strictEqual(sendModule.isGeminiProLabel('Gemini 2.5 Flash'), false);
}

function testErnieFiveLabelDetection() {
  assert.strictEqual(sendModule.isErnieFiveLabel('ERNIE 5.0'), true);
  assert.strictEqual(sendModule.isErnieFiveLabel('文心大模型 5.0'), true);
  assert.strictEqual(sendModule.isErnieFiveLabel('ERNIE 4.0 Turbo'), false);
}

function testKimiPromptDetectionFromComposerEditor() {
  const composer = createMockElement();
  const editor = createMockElement({
    matchRules: ['.chat-input-editor[contenteditable="true"][role="textbox"]'],
    closestRules: [
      ['.chat-input-editor[contenteditable="true"][role="textbox"]', null],
      ['.chat-editor', composer]
    ]
  });
  // self-close to editor when asked for exact editor selector
  editor.closest = (selector) => {
    if (selector.includes('.chat-input-editor[contenteditable="true"][role="textbox"]')) return editor;
    if (selector.includes('.chat-editor, .chat-action')) return composer;
    if (selector.includes('#cgpt-compact-nav')) return null;
    return null;
  };
  const target = createMockElement({
    closestRules: [['.chat-input-editor[contenteditable="true"][role="textbox"]', editor]]
  });

  assert.strictEqual(sendModule.isKimiComposerEditor(editor), true);
  assert.strictEqual(sendModule.getKimiPromptElementFrom(target), editor);
}

function testKimiPromptDetectionIgnoresQuickNavEditor() {
  const navRoot = createMockElement();
  const editor = createMockElement({
    matchRules: ['.chat-input-editor[contenteditable="true"][role="textbox"]']
  });
  editor.closest = (selector) => {
    if (selector.includes('.chat-input-editor[contenteditable="true"][role="textbox"]')) return editor;
    if (selector.includes('.chat-editor, .chat-action')) return createMockElement();
    if (selector.includes('#cgpt-compact-nav')) return navRoot;
    return null;
  };
  const target = createMockElement({
    closestRules: [['.chat-input-editor[contenteditable="true"][role="textbox"]', editor]]
  });

  assert.strictEqual(sendModule.isInsideQuickNavPanel(editor), true);
  assert.strictEqual(sendModule.isKimiComposerEditor(editor), false);
  assert.strictEqual(sendModule.getKimiPromptElementFrom(target), null);
}

function testErniePromptDetectionFromComposerEditor() {
  const composer = createMockElement();
  const editor = createMockElement({
    props: { className: 'editable__demo' }
  });
  editor.closest = (selector) => {
    if (selector.includes('#cgpt-compact-nav')) return null;
    if (
      selector.includes('[class*="dialogueInputContainer"]') ||
      selector.includes('[class*="dialogueInputWrapper"]') ||
      selector.includes('[class*="inputArea__"]') ||
      selector.includes('[class*="editorContainer__"]') ||
      selector.includes('[class*="inputGuidance__"]') ||
      selector.includes('#eb_chat_viewer')
    ) {
      return composer;
    }
    return null;
  };

  const target = createMockElement({
    closestRules: [['[contenteditable="true"][role="textbox"]', editor]]
  });

  assert.strictEqual(sendModule.getErniePromptElementFrom(target), editor);
}

function testErniePromptDetectionFallsBackToNearbySendControl() {
  const sendBtn = createMockElement();
  const parent = createMockElement({
    queryRules: [['[class*="sendInner__"]', sendBtn]]
  });
  const editor = createMockElement({
    parentElement: parent,
    props: { className: 'editorNoKnownContainer' }
  });
  editor.closest = (selector) => {
    if (selector.includes('#cgpt-compact-nav')) return null;
    return null;
  };

  const target = createMockElement({
    closestRules: [['[contenteditable="true"][role="textbox"]', editor]]
  });

  assert.strictEqual(sendModule.getErniePromptElementFrom(target), editor);
}

function testResolveErnieSendButtonPrefersScopedComposerControl() {
  const sendBtn = createMockElement();
  const composer = createMockElement({
    queryRules: [['[class*="sendInner__"]', sendBtn]]
  });
  const prompt = createMockElement({
    closestRules: [['[class*="dialogueInputContainer"]', composer]]
  });

  assert.strictEqual(sendModule.resolveErnieSendButton(prompt), sendBtn);
}

function testResolveErnieSendButtonPrefersInnerControlOverOuterContainer() {
  const sendInner = createMockElement();
  const sendOuter = createMockElement();
  const composer = createMockElement({
    // 模拟 querySelector 旧实现（单复合选择器）可能先命中外层容器的场景。
    queryRules: [
      ['[class*="send__"]', sendOuter],
      ['[class*="sendInner__"]', sendInner]
    ]
  });
  const prompt = createMockElement({
    closestRules: [['[class*="dialogueInputContainer"]', composer]]
  });

  assert.strictEqual(sendModule.resolveErnieSendButton(prompt), sendInner);
}

function main() {
  testQwenEnterIntent();
  testCollectEventProbeTargetsOrderAndDedup();
  testQwenPromptDetectionFromEditableTextareaTarget();
  testQwenPromptDetectionIgnoresReadonlyEditorTextarea();
  testQwenPromptDetectionUsesComposedPathAndDeepActiveFallback();
  testQwenSendControlsResolveSendButtonFromComposerScope();
  testQwenSendMethodPreference();
  testModelPresetLabelNormalizers();
  testGeminiProLabelDetection();
  testErnieFiveLabelDetection();
  testKimiPromptDetectionFromComposerEditor();
  testKimiPromptDetectionIgnoresQuickNavEditor();
  testErniePromptDetectionFromComposerEditor();
  testErniePromptDetectionFallsBackToNearbySendControl();
  testResolveErnieSendButtonPrefersScopedComposerControl();
  testResolveErnieSendButtonPrefersInnerControlOverOuterContainer();

  console.log('PASS dev/test-chatgpt-cmdenter-send.js');
}

main();
