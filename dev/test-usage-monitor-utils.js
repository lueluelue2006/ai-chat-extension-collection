#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const utils = require(path.join(__dirname, '..', 'shared', 'chatgpt-usage-monitor-utils.js'));

function testValidateImportedData() {
  assert.strictEqual(
    utils.validateImportedData({
      models: {
        'gpt-5': { requests: [123], quota: 10, windowType: 'daily' }
      }
    }),
    true
  );

  assert.strictEqual(
    utils.validateImportedData({
      models: {
        'gpt-5': { requests: [], sharedGroup: 'grp1', windowType: 'daily' }
      }
    }),
    true
  );

  assert.strictEqual(
    utils.validateImportedData({
      models: {
        'gpt-5': { requests: [], quota: 10, windowType: 'weird' }
      }
    }),
    false
  );

  assert.strictEqual(utils.validateImportedData(null), false);
  assert.strictEqual(utils.validateImportedData({}), false);
  assert.strictEqual(utils.validateImportedData({ models: null }), false);
  assert.strictEqual(utils.validateImportedData({ models: { 'gpt-5': null } }), false);
  assert.strictEqual(utils.validateImportedData({ models: { 'gpt-5': { requests: 'nope', quota: 1 } } }), false);
  assert.strictEqual(utils.validateImportedData({ models: { 'gpt-5': { requests: [], quota: 'nope' } } }), false);
}

function testSummarizeImport() {
  const s = utils.summarizeImport({
    models: {
      a: { requests: [1, 2], quota: 1, windowType: 'daily' },
      b: { requests: [], quota: 1, windowType: 'daily' }
    }
  });
  assert.ok(/共\s*2\s*个模型/.test(s));
  assert.ok(/2\s*条请求记录/.test(s));
}

function testMergeUsageData() {
  const now = 1_000_000_000;

  // Dedup by second.
  {
    const current = {
      models: {
        m: { requests: [900_123], quota: 50, windowType: 'daily' }
      }
    };
    const imported = {
      models: {
        m: { requests: [900_999], quota: 50, windowType: 'daily' }
      }
    };
    const merged = utils.mergeUsageData(current, imported, { now });
    assert.strictEqual(Array.isArray(merged?.models?.m?.requests), true);
    assert.strictEqual(merged.models.m.requests.length, 1);
    assert.strictEqual(merged.models.m.requests[0], 900_123);
  }

  // Filter requests outside the model's window.
  {
    const threeHours = utils.TIME_WINDOWS.hour3;
    const current = { models: { m: { requests: [], quota: 50, windowType: 'hour3' } } };
    const imported = { models: { m: { requests: [now - threeHours - 1000, now - 1000], quota: 50, windowType: 'hour3' } } };
    const merged = utils.mergeUsageData(current, imported, { now });
    assert.strictEqual(merged.models.m.requests.length, 1);
    assert.strictEqual(merged.models.m.requests[0], now - 1000);
  }

  // Create missing model with imported quota/window/sharedGroup.
  {
    const imported = {
      models: {
        'gpt-5-pro': { requests: [now - 1], quota: 77, windowType: 'daily', sharedGroup: 'pro-premium-shared' }
      }
    };
    const merged = utils.mergeUsageData(null, imported, { now });
    assert.strictEqual(merged.models['gpt-5-pro'].quota, 77);
    assert.strictEqual(merged.models['gpt-5-pro'].windowType, 'daily');
    assert.strictEqual(merged.models['gpt-5-pro'].sharedGroup, 'pro-premium-shared');
    assert.deepStrictEqual(merged.models['gpt-5-pro'].requests, [now - 1]);
  }
}

function main() {
  testValidateImportedData();
  testSummarizeImport();
  testMergeUsageData();
  // eslint-disable-next-line no-console
  console.log('OK dev/test-usage-monitor-utils.js');
}

main();

