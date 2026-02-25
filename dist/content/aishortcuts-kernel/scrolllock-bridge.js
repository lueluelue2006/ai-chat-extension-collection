(function () {
  'use strict';

  const KERNEL_KEY = '__aichat_quicknav_kernel_v1__';

  function getKernelRoot() {
    let root = null;
    try {
      root = globalThis[KERNEL_KEY];
    } catch {}
    if (root && typeof root === 'object') return root;
    root = {};
    try {
      Object.defineProperty(globalThis, KERNEL_KEY, {
        value: root,
        configurable: true,
        enumerable: false,
        writable: true
      });
      return root;
    } catch {}
    try {
      globalThis[KERNEL_KEY] = root;
    } catch {}
    return root;
  }

  const kernel = getKernelRoot();
  if (kernel && kernel.scrolllockBridge && Number(kernel.scrolllockBridge.version || 0) >= 1) return;

  function getOrCreateBridgeNonce(options = {}) {
    const target = options.target || globalThis;
    const datasetKey = String(options.nonceDatasetKey || 'quicknavBridgeNonceV1');
    const fallback = String(options.fallback || 'quicknav-bridge-fallback');
    try {
      const docEl = options.docEl || target.document?.documentElement;
      if (!docEl || !docEl.dataset) return fallback;
      const existing = String(docEl.dataset[datasetKey] || '').trim();
      if (existing) return existing;
      const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      docEl.dataset[datasetKey] = next;
      const stored = String(docEl.dataset[datasetKey] || '').trim();
      return stored || next || fallback;
    } catch {
      return fallback;
    }
  }

  function postBridgeMessage(type, payload = null, options = {}) {
    try {
      const target = options.target || globalThis;
      const channel = String(options.channel || 'quicknav');
      const version = Number(options.version) || 1;
      const nonce = String(options.nonce || getOrCreateBridgeNonce(options));
      const msg = Object.assign(
        {
          __quicknav: 1,
          channel,
          v: version,
          nonce
        },
        payload && typeof payload === 'object' ? payload : {}
      );
      msg.type = String(type || '');
      if (!msg.type) return false;
      target.window.postMessage(msg, '*');
      return true;
    } catch {
      return false;
    }
  }

  function readBridgeMessage(event, allowedTypes, options = {}) {
    try {
      const target = options.target || globalThis;
      const channel = String(options.channel || 'quicknav');
      const version = Number(options.version) || 1;
      const nonce = String(options.nonce || getOrCreateBridgeNonce(options));

      if (!event || event.source !== target.window) return null;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return null;
      if (msg.__quicknav !== 1) return null;
      if (msg.channel !== channel) return null;
      if (msg.v !== version) return null;
      if (msg.nonce !== nonce) return null;
      if (typeof msg.type !== 'string' || !msg.type) return null;
      if (allowedTypes && typeof allowedTypes.has === 'function' && !allowedTypes.has(msg.type)) return null;
      return msg;
    } catch {
      return null;
    }
  }

  function createMessenger(options = {}) {
    const nonce = String(options.nonce || getOrCreateBridgeNonce(options));
    const channel = String(options.channel || 'quicknav');
    const version = Number(options.version) || 1;
    return Object.freeze({
      nonce,
      post(type, payload = null) {
        return postBridgeMessage(type, payload, {
          target: options.target,
          channel,
          version,
          nonce,
          nonceDatasetKey: options.nonceDatasetKey,
          fallback: options.fallback
        });
      },
      read(event, allowedTypes) {
        return readBridgeMessage(event, allowedTypes, {
          target: options.target,
          channel,
          version,
          nonce,
          nonceDatasetKey: options.nonceDatasetKey,
          fallback: options.fallback
        });
      }
    });
  }

  function postScrollLockStateToMainWorld(enabled, postMessage, docEl) {
    const post = typeof postMessage === 'function' ? postMessage : null;
    if (!post) return;
    try {
      const root = docEl || document.documentElement;
      if (root && root.dataset) root.dataset.quicknavScrollLockEnabled = enabled ? '1' : '0';
    } catch {}
    try {
      post('AISHORTCUTS_SCROLLLOCK_STATE', { enabled: !!enabled });
    } catch {}
  }

  function postScrollLockBaselineToMainWorld(top, force, state, postMessage, docEl) {
    const post = typeof postMessage === 'function' ? postMessage : null;
    if (!post) {
      return {
        lastTop: Number(state?.lastTop) || 0,
        lastPostAt: Number(state?.lastPostAt) || 0
      };
    }

    const nextTop = Math.max(0, Math.round(Number(top) || 0));
    const prevTop = Number(state?.lastTop) || 0;
    const prevAt = Number(state?.lastPostAt) || 0;
    const now = Date.now();

    if (!force) {
      if (Math.abs(nextTop - prevTop) < 2) {
        return { lastTop: prevTop, lastPostAt: prevAt };
      }
      if (now - prevAt < 180 && Math.abs(nextTop - prevTop) < 6) {
        return { lastTop: prevTop, lastPostAt: prevAt };
      }
    }

    try {
      const root = docEl || document.documentElement;
      if (root && root.dataset) root.dataset.quicknavScrollLockBaseline = String(nextTop);
    } catch {}

    try {
      post('AISHORTCUTS_SCROLLLOCK_BASELINE', { top: nextTop });
    } catch {}

    return { lastTop: nextTop, lastPostAt: now };
  }

  function postScrollLockAllowToMainWorld(ms, postMessage) {
    const post = typeof postMessage === 'function' ? postMessage : null;
    if (!post) return;
    try {
      post('AISHORTCUTS_SCROLLLOCK_ALLOW', { ms: Number(ms) || 0 });
    } catch {}
  }

  function ensureMainWorldGuard(options = {}) {
    const lastRequestedAt = Number(options.lastRequestedAt) || 0;
    const throttleMs = Math.max(200, Number(options.throttleMs) || 2000);
    const now = Date.now();
    if (now - lastRequestedAt < throttleMs) return lastRequestedAt;
    try {
      if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return lastRequestedAt;
      chrome.runtime.sendMessage(
        { type: String(options.messageType || 'AISHORTCUTS_ENSURE_SCROLL_GUARD') },
        () => void chrome.runtime?.lastError
      );
      return now;
    } catch {
      return lastRequestedAt;
    }
  }

  function bindReadyHandshake(options = {}) {
    const target = options.target || globalThis.window;
    const boundKey = String(options.boundKey || '__quicknavScrollGuardHandshakeBound');
    const readMessage = typeof options.readMessage === 'function' ? options.readMessage : null;
    const onReady = typeof options.onReady === 'function' ? options.onReady : null;
    const addListener = typeof options.addListener === 'function' ? options.addListener : null;
    const capture = Object.prototype.hasOwnProperty.call(options, 'capture') ? options.capture : true;
    if (!target || !readMessage || !onReady) return false;

    try {
      if (boundKey && target[boundKey]) return true;
    } catch {}
    try {
      if (boundKey) target[boundKey] = true;
    } catch {}

    const handler = (event) => {
      try {
        const msg = readMessage(event);
        if (!msg) return;
        onReady(msg, event);
      } catch {}
    };

    try {
      if (addListener) {
        addListener(handler, capture);
      } else {
        target.addEventListener('message', handler, capture);
      }
      return true;
    } catch {
      return false;
    }
  }

  const api = Object.freeze({
    version: 1,
    getOrCreateBridgeNonce,
    createMessenger,
    postBridgeMessage,
    readBridgeMessage,
    postScrollLockStateToMainWorld,
    postScrollLockBaselineToMainWorld,
    postScrollLockAllowToMainWorld,
    ensureMainWorldGuard,
    bindReadyHandshake
  });

  try {
    kernel.scrolllockBridge = api;
  } catch {}
})();
