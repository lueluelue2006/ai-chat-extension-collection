#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'genspark-quicknav.js');

function readSource() {
  return fs.readFileSync(FILE, 'utf8');
}

function expectRegex(source, regex, message) {
  assert.ok(regex.test(source), message);
}

function loadPreviewHelpers(source) {
  const start = source.indexOf('const GENSPARK_TOOLCALL_PREFIX_RE');
  const end = source.indexOf('function getTurnKey');
  assert.ok(start >= 0, 'genspark preview helper constants should exist');
  assert.ok(end > start, 'genspark preview helper block should end before getTurnKey');

  const snippet = source.slice(start, end);
  const script = `${snippet}
module.exports = {
  parseGensparkAssistantPreviewText,
  getGensparkAssistantPreview
};`;
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'genspark-preview-helpers.vm.js' });
  return sandbox.module.exports;
}

function testParseToolcallThinkingVsFinal(helpers) {
  const finalResult = helpers.parseGensparkAssistantPreviewText(
    'Using Tool | Search\nquery: best model\nUsing Tool | Read\nsource: docs\n最终回答：这里是结论。'
  );
  assert.strictEqual(finalResult.transient, false, 'toolcall prefix should be stripped when final answer exists');
  assert.ok(finalResult.text.includes('最终回答：这里是结论'), 'final answer should remain after stripping transient lines');

  const transientToolResult = helpers.parseGensparkAssistantPreviewText('Using Tool | Search');
  assert.strictEqual(transientToolResult.transient, true, 'toolcall-only text should stay transient');

  const transientToolUrlResult = helpers.parseGensparkAssistantPreviewText('Using Tool|Searchsite:bilibili.com 仙剑奇侠传 花楹 3D CG 人形View');
  assert.strictEqual(transientToolUrlResult.transient, true, 'toolcall-only text with URL should stay transient');

  const transientThinkingResult = helpers.parseGensparkAssistantPreviewText('Thinking...');
  assert.strictEqual(transientThinkingResult.transient, true, 'thinking-only text should stay transient');

  const mixedTailResult = helpers.parseGensparkAssistantPreviewText('最终判断：这是花楹。 Using Tool|Search仙剑奇侠传三 花楹 人形 游戏截图 3DView');
  assert.strictEqual(mixedTailResult.transient, false, 'final answer with trailing toolcall segment should stay non-transient');
  assert.strictEqual(mixedTailResult.text, '最终判断：这是花楹。', 'trailing toolcall segment should be trimmed from preview');

  const finalMentionResult = helpers.parseGensparkAssistantPreviewText('Using Tool can help audits. 这是最终建议。');
  assert.strictEqual(finalMentionResult.transient, false, 'final prose mentioning "Using Tool" should not be treated as transient');
}

function testAssistantPreviewCandidateSelection(helpers) {
  const el = {
    textContent: 'Using Tool | Search\nquery: weather\nThinking...\n最终答案：明天晴。',
    querySelectorAll(selector) {
      if (selector.includes('.deep-research-result')) {
        return [{ textContent: 'Using Tool | Search\nquery: weather\nThinking...' }];
      }
      if (selector.includes('.markdown')) {
        return [{ textContent: '最终答案：明天晴。' }];
      }
      return [];
    }
  };
  const result = helpers.getGensparkAssistantPreview(el);
  assert.strictEqual(result.transient, false, 'should prefer non-transient candidate when available');
  assert.ok(result.text.includes('最终答案：明天晴。'), 'should keep final answer text');
}

function testCacheGuardContract(source) {
  expectRegex(
    source,
    /let\s+previewIsTransient\s*=\s*false;/,
    'buildIndex should track transient assistant previews'
  );

  expectRegex(
    source,
    /const\s+assistantPreview\s*=\s*getGensparkAssistantPreview\(\s*el\s*\|\|\s*block\s*\);[\s\S]*?previewIsTransient\s*=\s*!!assistantPreview\.transient;/,
    'buildIndex should parse assistant preview from full turn context'
  );

  expectRegex(
    source,
    /if\s*\(\s*preview\s*\)\s*\{[\s\S]*?if\s*\(\s*isAssistant\s*&&\s*previewIsTransient\s*\)\s*previewCache\.delete\(msgKey\);[\s\S]*?else\s*previewCache\.set\(msgKey,\s*preview\);[\s\S]*?\}\s*else\s*\{[\s\S]*?previewCache\.delete\(msgKey\);[\s\S]*?\}/,
    'transient assistant preview should not be cached as final output'
  );

  expectRegex(
    source,
    /if\s*\(\s*isAssistant\s*&&\s*previewIsTransient\s*\)\s*\{[\s\S]*?continue;/,
    'transient assistant preview should be skipped from nav list'
  );
}

function main() {
  const source = readSource();
  const helpers = loadPreviewHelpers(source);
  testParseToolcallThinkingVsFinal(helpers);
  testAssistantPreviewCandidateSelection(helpers);
  testCacheGuardContract(source);
  console.log('PASS dev/test-genspark-preview-filter.js');
}

main();
