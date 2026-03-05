#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');

const ROOT = path.join(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function transpileTsForVm(tsPath) {
  return transformSync(readText(tsPath), {
    loader: 'ts',
    target: 'chrome96',
    format: 'esm',
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    sourcefile: tsPath
  }).code;
}

function loadRegistry() {
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(transpileTsForVm('shared/registry.ts'), sandbox, { filename: 'shared/registry.ts' });
  const registry = sandbox.globalThis.AISHORTCUTS_REGISTRY;
  assert.ok(registry, 'registry should load for sender gate tests');
  return registry;
}

function loadChromeApi(registry) {
  const sandbox = {
    chrome: {
      runtime: {
        getURL(relPath = '') {
          return `chrome-extension://test-extension/${String(relPath || '')}`;
        }
      }
    },
    console: { log() {}, warn() {}, error() {} },
    globalThis: {
      AISHORTCUTS_REGISTRY: registry,
      __aiShortcutsSw: {}
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(transpileTsForVm('background/sw/chrome.ts'), sandbox, { filename: 'background/sw/chrome.ts' });
  return sandbox.globalThis.__aiShortcutsSw.chrome;
}

function loadGpt53Handler() {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    globalThis: {
      __aiShortcutsSw: {
        routerHandlers: {},
        monitors: {
          async markGpt53AlertsRead() {
            return { unread: 0, events: [] };
          }
        }
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(transpileTsForVm('background/sw/router-handlers/gpt53.ts'), sandbox, {
    filename: 'background/sw/router-handlers/gpt53.ts'
  });
  return sandbox.globalThis.__aiShortcutsSw.routerHandlers.handleGpt53Message;
}

function testSenderGateAllowsExtensionPages(chromeApi) {
  const result = chromeApi.senderGate({ url: 'chrome-extension://test-extension/options/options.html' });
  assert.strictEqual(result, '', 'extension pages should always pass senderGate');
}

function testSenderGateRestrictsTabSendersToSupportedSites(chromeApi) {
  const supported = chromeApi.senderGate(
    { tab: { id: 1, url: 'https://chatgpt.com/c/123' }, url: 'https://chatgpt.com/c/123' },
    { allowTabSender: true, requireSupportedTabUrl: true }
  );
  assert.strictEqual(supported, '', 'supported site tab senders should pass restricted senderGate');

  const blocked = chromeApi.senderGate(
    { tab: { id: 2, url: 'https://evil.example/frame' }, url: 'https://evil.example/frame' },
    { allowTabSender: true, requireSupportedTabUrl: true }
  );
  assert.strictEqual(blocked, 'forbidden', 'unsupported tab senders should be rejected when restricted');
}

function testSenderGateKeepsLegacyAllowTabBehavior(chromeApi) {
  const result = chromeApi.senderGate(
    { tab: { id: 3, url: 'https://evil.example/frame' }, url: 'https://evil.example/frame' },
    { allowTabSender: true }
  );
  assert.strictEqual(result, '', 'legacy allowTabSender behavior should stay unchanged unless restricted explicitly');
}

function testGpt53MarkReadIsExtensionPageOnly() {
  const handler = loadGpt53Handler();
  let capturedOptions = '__unset__';
  const handled = handler({
    msg: { type: 'AISHORTCUTS_GPT53_MARK_READ' },
    sender: { tab: { id: 1 }, url: 'https://chatgpt.com/c/123' },
    sendResponse() {},
    requireAllowedSender(_sendResponse, _sender, options) {
      capturedOptions = options;
      return false;
    },
    respondError() {},
    buildGpt53Status() {}
  });
  assert.strictEqual(handled, true, 'MARK_READ handler should claim the message');
  assert.strictEqual(capturedOptions, undefined, 'MARK_READ should no longer allow generic tab senders');
}

function main() {
  const registry = loadRegistry();
  const chromeApi = loadChromeApi(registry);

  testSenderGateAllowsExtensionPages(chromeApi);
  testSenderGateRestrictsTabSendersToSupportedSites(chromeApi);
  testSenderGateKeepsLegacyAllowTabBehavior(chromeApi);
  testGpt53MarkReadIsExtensionPageOnly();

  console.log('PASS dev/test-sw-sender-gates.js');
}

main();
