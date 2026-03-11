(() => {
  'use strict';

  const API_KEY = '__aichat_chatgpt_fetch_consumer_base_v1__';
  const API_VERSION = 1;
  const HUB_KEY = '__aichat_chatgpt_fetch_hub_v1__';
  const REGISTRY_KEY = '__aichat_chatgpt_fetch_hub_consumers_v1__';

  try {
    const prev = globalThis[API_KEY];
    if (prev && typeof prev === 'object' && typeof prev.registerConsumer === 'function' && Number(prev.version || 0) >= API_VERSION) {
      return;
    }
  } catch {}

  function safeCall(fn, ...args) {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  }

  function normalizeConsumerKey(key) {
    const raw = String(key == null ? '' : key).trim();
    return raw || 'default';
  }

  function getHub() {
    try {
      const hub = window[HUB_KEY];
      if (hub && typeof hub.register === 'function') return hub;
    } catch {}
    return null;
  }

  function getRegistry() {
    try {
      const existing = window[REGISTRY_KEY];
      if (existing && typeof existing === 'object') return existing;
      const next = Object.create(null);
      window[REGISTRY_KEY] = next;
      return next;
    } catch {
      return Object.create(null);
    }
  }

  function registerConsumer(key, handlers) {
    const consumerKey = normalizeConsumerKey(key);
    const registry = getRegistry();

    const prev = registry[consumerKey];
    if (prev && typeof prev.dispose === 'function') {
      safeCall(prev.dispose, 'replace');
    }

    const hub = getHub();
    let unsub = null;

    if (hub && handlers && typeof handlers === 'object') {
      const maybeUnsub = safeCall(() => hub.register(handlers));
      if (typeof maybeUnsub === 'function') unsub = maybeUnsub;
    }

    const token = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
    let disposed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;

      if (typeof unsub === 'function') {
        safeCall(unsub);
      }
      unsub = null;

      try {
        const active = registry[consumerKey];
        if (active && active.token === token) {
          delete registry[consumerKey];
        }
      } catch {}
    };

    registry[consumerKey] = {
      token,
      dispose
    };

    return dispose;
  }

  const api = Object.freeze({
    version: API_VERSION,
    registerConsumer
  });

  try {
    Object.defineProperty(globalThis, API_KEY, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }
})();
