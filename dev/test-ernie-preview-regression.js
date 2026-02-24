#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'ernie-quicknav.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function loadPreviewHelpers(source) {
  const start = source.indexOf('const ERNIE_THINKING_FINISHED_MARKERS');
  const end = source.indexOf('function getTurnKey');
  assert.ok(start >= 0, 'preview helper constants should exist');
  assert.ok(end > start, 'preview helper block should end before getTurnKey');

  const snippet = source.slice(start, end);
  const script = `${snippet}
module.exports = {
  parseErnieAssistantPreviewText,
  getErnieAssistantPreview
};`;
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'ernie-preview-helpers.vm.js' });
  return sandbox.module.exports;
}

function testParseThinkingVsFinal(helpers) {
  const finalResult = helpers.parseErnieAssistantPreviewText('Thinking...\nFinished thinking.\n最终回答在这里。');
  assert.strictEqual(finalResult.transient, false, 'finished-thinking tail should be treated as final preview');
  assert.ok(finalResult.text.includes('最终回答在这里'), 'finished-thinking tail should keep final answer text');

  const regexMarkerResult = helpers.parseErnieAssistantPreviewText('Thinking complete\nFinished   thinking .\n这是最终回答');
  assert.strictEqual(regexMarkerResult.transient, false, 'regex marker variant should still be treated as final preview');
  assert.ok(regexMarkerResult.text.includes('这是最终回答'), 'regex marker variant should keep final answer text');

  const transientResult = helpers.parseErnieAssistantPreviewText('ThinkingUser 正在思考');
  assert.strictEqual(transientResult.transient, true, 'thinking-only text should stay transient');

  const userTraceResult = helpers.parseErnieAssistantPreviewText('好的，我们来分析一下。User0299429234想知道这个问题。');
  assert.strictEqual(userTraceResult.transient, true, 'reasoning trace with user id should stay transient when no finished marker');
}

function testAssistantPreviewCandidateSelection(helpers) {
  const el = {
    textContent: 'Thinking completeUser0299429234在思考。Finished thinking.最终回答：你好，世界。',
    querySelectorAll(selector) {
      if (selector.includes('answerText__')) {
        return [
          { textContent: '好的，我们来分析一下。User0299429234想知道这个问题。', closest: () => null }
        ];
      }
      return [];
    }
  };
  const result = helpers.getErnieAssistantPreview(el);
  assert.strictEqual(result.transient, false, 'should prefer non-transient candidate when available');
  assert.ok(result.text.includes('最终回答：你好，世界。'), 'should extract final answer from same assistant card');
}

function testCacheGuardContract(source) {
  expectRegex(
    source,
    /let\s+previewIsTransient\s*=\s*false;/,
    'buildIndex should track transient assistant previews'
  );

  expectRegex(
    source,
    /const\s+assistantPreview\s*=\s*getErnieAssistantPreview\(\s*el\s*\|\|\s*block\s*\);[\s\S]*?previewIsTransient\s*=\s*!!assistantPreview\.transient;/,
    'buildIndex should parse assistant preview from full turn context'
  );

  expectRegex(
    source,
    /if\s*\(\s*preview\s*\)\s*\{[\s\S]*?if\s*\(\s*isAssistant\s*&&\s*previewIsTransient\s*\)\s*previewCache\.delete\(msgKey\);[\s\S]*?else\s*previewCache\.set\(msgKey,\s*preview\);[\s\S]*?\}\s*else\s*\{[\s\S]*?previewCache\.delete\(msgKey\);[\s\S]*?\}/,
    'transient assistant preview should not be cached as final output'
  );
}

function main() {
  const source = readSource();
  const helpers = loadPreviewHelpers(source);
  testParseThinkingVsFinal(helpers);
  testAssistantPreviewCandidateSelection(helpers);
  testCacheGuardContract(source);
  console.log('PASS dev/test-ernie-preview-regression.js');
}

main();
