#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const BRIDGE_SRC = fs.readFileSync(path.join(ROOT, 'content', 'quicknav-bridge.js'), 'utf8');

const API_KEY = '__aichat_quicknav_bridge_v1__';
const BRIDGE_CHANNEL = 'quicknav';
const BRIDGE_VERSION = 1;
const BRIDGE_NONCE_DATASET_KEY = 'quicknavBridgeNonceV1';
const ROUTE_CHANGE_TYPE = 'QUICKNAV_ROUTE_CHANGE';

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      const t = String(type || '');
      if (!t || typeof fn !== 'function') return;
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t).add(fn);
    },
    removeEventListener(type, fn) {
      const t = String(type || '');
      const set = listeners.get(t);
      if (!set) return;
      set.delete(fn);
      if (!set.size) listeners.delete(t);
    },
    dispatchEvent(event) {
      const type = String(event?.type || '');
      const set = listeners.get(type);
      if (!set) return true;
      for (const fn of Array.from(set)) {
        try {
          fn(event);
        } catch {
        }
      }
      return true;
    }
  };
}

function createIntervalStubs() {
  let nextId = 1;
  const active = new Map();
  return {
    setInterval(fn, ms) {
      const id = nextId++;
      active.set(id, { fn, ms: Number(ms) || 0 });
      return id;
    },
    clearInterval(id) {
      active.delete(id);
    }
  };
}

function runBridge({ href, nonce, now }) {
  const win = createEventTarget();
  win.self = win;
  win.top = win;
  win.window = win;

  const intervals = createIntervalStubs();
  win.setInterval = intervals.setInterval;
  win.clearInterval = intervals.clearInterval;

  const sandbox = {
    window: win,
    globalThis: win,
    document: {
      documentElement: {
        dataset: {
          [BRIDGE_NONCE_DATASET_KEY]: nonce
        }
      }
    },
    location: { href },
    setInterval: intervals.setInterval,
    clearInterval: intervals.clearInterval,
    Date: { now: () => now },
    console: { log() {}, warn() {}, error() {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(BRIDGE_SRC, sandbox, { filename: 'content/quicknav-bridge.js' });

  const api = win[API_KEY];
  assert.ok(api && typeof api.on === 'function', 'QuickNav bridge API should be installed');
  return { window: win, api };
}

function postRouteMessage(windowObj, payload) {
  windowObj.dispatchEvent({
    type: 'message',
    source: windowObj,
    data: payload
  });
}

function testRouteChangeMessageRequiresBridgeNonce() {
  const seededNonce = 'nonce-fixed-v1';
  const initialHref = 'https://example.test/chat/seed';
  const now = 1_700_000_000_000;
  const { window: win, api } = runBridge({ href: initialHref, nonce: seededNonce, now });

  const routeChanges = [];
  api.on('routeChange', (evt) => routeChanges.push(evt));

  postRouteMessage(win, {
    __quicknav: 1,
    channel: BRIDGE_CHANNEL,
    v: BRIDGE_VERSION,
    type: ROUTE_CHANGE_TYPE,
    href: 'https://example.test/chat/spoof-missing-nonce',
    reason: 'spoof-missing'
  });

  postRouteMessage(win, {
    __quicknav: 1,
    channel: BRIDGE_CHANNEL,
    v: BRIDGE_VERSION,
    nonce: 'nonce-wrong-v1',
    type: ROUTE_CHANGE_TYPE,
    href: 'https://example.test/chat/spoof-wrong-nonce',
    reason: 'spoof-wrong'
  });

  assert.strictEqual(routeChanges.length, 0, 'messages without the correct nonce must be ignored');

  const validHref = 'https://example.test/chat/real-route-change';
  postRouteMessage(win, {
    __quicknav: 1,
    channel: BRIDGE_CHANNEL,
    v: BRIDGE_VERSION,
    nonce: seededNonce,
    type: ROUTE_CHANGE_TYPE,
    href: validHref,
    reason: 'main'
  });

  assert.strictEqual(routeChanges.length, 1, 'message with the correct nonce should emit exactly one routeChange');
  assert.strictEqual(routeChanges[0].href, validHref);
  assert.strictEqual(routeChanges[0].prevHref, initialHref);
  assert.strictEqual(routeChanges[0].reason, 'main');
  assert.strictEqual(routeChanges[0].at, now);
}

function main() {
  testRouteChangeMessageRequiresBridgeNonce();
  // eslint-disable-next-line no-console
  console.log('OK dev/test-quicknav-bridge-nonce.js');
}

try {
  main();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
}
