(() => {
  'use strict';

  // Bridge extension settings (chrome.storage) into page-readable DOM dataset,
  // so MAIN-world scripts can respect user config without accessing chrome APIs.

  const STATE_KEY = '__aichat_chatgpt_thinking_toggle_config_bridge_state_v2__';
  const SCOPE_API_KEY = '__aichat_quicknav_scope_v1__';
  const SCOPE_KEY = 'chatgpt_thinking_toggle_config_bridge';

  const prevState = (() => {
    try {
      return globalThis[STATE_KEY] || null;
    } catch {
      return null;
    }
  })();

  try {
    prevState?.dispose?.('reinject');
  } catch {}

  function createFallbackScope() {
    const listenerOffs = new Set();
    const observerOffs = new Set();
    const noop = () => void 0;

    return {
      on(target, type, fn, opts) {
        if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return noop;
        const eventType = String(type || '');
        if (!eventType || typeof fn !== 'function') return noop;

        try {
          target.addEventListener(eventType, fn, opts);
        } catch {
          return noop;
        }

        let active = true;
        const off = () => {
          if (!active) return;
          active = false;
          listenerOffs.delete(off);
          try {
            target.removeEventListener(eventType, fn, opts);
          } catch {}
        };

        listenerOffs.add(off);
        return off;
      },
      observer(target, fn, opts) {
        if (!target || typeof fn !== 'function' || typeof MutationObserver !== 'function') return null;

        let mo = null;
        try {
          mo = new MutationObserver(fn);
          mo.observe(target, opts && typeof opts === 'object' ? opts : { childList: true, subtree: true });
        } catch {
          try {
            mo?.disconnect?.();
          } catch {}
          return null;
        }

        let active = true;
        const off = () => {
          if (!active) return;
          active = false;
          observerOffs.delete(off);
          try {
            mo.disconnect();
          } catch {}
        };

        observerOffs.add(off);
        return mo;
      },
      dispose() {
        for (const off of Array.from(listenerOffs)) off();
        for (const off of Array.from(observerOffs)) off();
      }
    };
  }

  function createBridgeScope() {
    try {
      const scopeApi = globalThis[SCOPE_API_KEY];
      if (scopeApi && typeof scopeApi.createSingletonScope === 'function') {
        const scope = scopeApi.createSingletonScope(SCOPE_KEY);
        if (scope && typeof scope.on === 'function' && typeof scope.observer === 'function' && typeof scope.dispose === 'function') {
          return scope;
        }
      }
    } catch {}

    return createFallbackScope();
  }

  const bridgeScope = createBridgeScope();
  const storageListenerOffs = new Set();
  let attrObserver = null;
  let disposed = false;

  function addStorageOnChangedListener(fn) {
    if (disposed || typeof fn !== 'function') return () => void 0;

    try {
      chrome.storage.onChanged.addListener(fn);
    } catch {
      return () => void 0;
    }

    let active = true;
    const off = () => {
      if (!active) return;
      active = false;
      storageListenerOffs.delete(off);
      try {
        chrome.storage.onChanged.removeListener(fn);
      } catch {}
    };

    storageListenerOffs.add(off);
    return off;
  }

  function disposeBridge() {
    if (disposed) return;
    disposed = true;

    if (pending.timer) {
      try {
        clearTimeout(pending.timer);
      } catch {}
      pending.timer = 0;
    }

    for (const off of Array.from(storageListenerOffs)) off();

    try {
      bridgeScope.dispose();
    } catch {}

    attrObserver = null;
  }

  const SETTINGS_KEY = 'aichat_ai_shortcuts_settings_v1';
  const LEGACY_SETTINGS_KEY = 'quicknav_settings';

  const HOTKEY_EFFORT_ENABLED_KEY = '__aichat_chatgpt_thinking_toggle_hotkey_effort_v1__';
  const HOTKEY_MODEL_ENABLED_KEY = '__aichat_chatgpt_thinking_toggle_hotkey_model_v1__';

  const DS_EFFORT_KEY = 'aichatHotkeyEffortEnabled';
  const DS_MODEL_KEY = 'aichatHotkeyModelEnabled';

  const pending = {
    effort: true,
    model: true,
    timer: 0,
    tries: 0
  };

  function writeBoolDataset(key, val) {
    if (disposed) return false;
    try {
      if (!document.documentElement || !document.documentElement.dataset) return;
      const next = val ? '1' : '0';
      if (document.documentElement.dataset[key] !== next) document.documentElement.dataset[key] = next;
      return true;
    } catch {}
    return false;
  }

  function cleanupLegacyLocalStorage() {
    try { localStorage.removeItem(HOTKEY_EFFORT_ENABLED_KEY); } catch {}
    try { localStorage.removeItem(HOTKEY_MODEL_ENABLED_KEY); } catch {}
  }

  function purgeLegacySettingsKey() {
    try {
      chrome.storage.local.remove([LEGACY_SETTINGS_KEY], () => void chrome.runtime?.lastError);
    } catch {}
  }

  function flushPending() {
    if (disposed) return;
    try {
      const ok1 = writeBoolDataset(DS_EFFORT_KEY, pending.effort);
      const ok2 = writeBoolDataset(DS_MODEL_KEY, pending.model);
      if (ok1 && ok2) {
        pending.tries = 0;
        return;
      }
    } catch {}

    pending.tries += 1;
    if (pending.tries > 30) return;
    scheduleFlush(200);
  }

  function scheduleFlush(delayMs) {
    if (disposed) return;
    try {
      if (pending.timer) return;
      const ms = Math.max(0, Number(delayMs) || 0);
      pending.timer = setTimeout(() => {
        pending.timer = 0;
        if (disposed) return;
        flushPending();
      }, ms);
    } catch {}
  }

  function applyFromSettings(settings) {
    if (disposed) return;
    try {
      const mods = settings?.siteModules?.chatgpt;
      const effort = typeof mods?.chatgpt_thinking_toggle_hotkey_effort === 'boolean' ? mods.chatgpt_thinking_toggle_hotkey_effort : true;
      const model = typeof mods?.chatgpt_thinking_toggle_hotkey_model === 'boolean' ? mods.chatgpt_thinking_toggle_hotkey_model : true;
      cleanupLegacyLocalStorage();
      pending.effort = !!effort;
      pending.model = !!model;
      flushPending();
    } catch {}
  }

  function ensureAttrGuard() {
    if (disposed || attrObserver) return;
    try {
      const html = document.documentElement;
      if (!html) return;
      attrObserver = bridgeScope.observer(html, () => scheduleFlush(0), {
        attributes: true,
        attributeFilter: ['data-aichat-hotkey-effort-enabled', 'data-aichat-hotkey-model-enabled']
      });
    } catch {}
  }

  // Always apply defaults once (so MAIN-world reads don't depend on storage timing).
  purgeLegacySettingsKey();
  applyFromSettings(null);
  ensureAttrGuard();

  try {
    chrome.storage.local.get({ [SETTINGS_KEY]: null }, (items) => {
      if (disposed) return;
      void chrome.runtime?.lastError;
      applyFromSettings(items?.[SETTINGS_KEY]);
    });
  } catch {}

  // Best-effort live update (without requiring a full page reload).
  try {
    addStorageOnChangedListener((changes, areaName) => {
      try {
        if (disposed) return;
        if (areaName !== 'local') return;
        const next = changes?.[SETTINGS_KEY]?.newValue;
        if (!next) return;
        applyFromSettings(next);
      } catch {}
    });
  } catch {}

  // Some ChatGPT navigations/hydration can briefly swap DOM roots; retry a few times.
  try {
    if (document.readyState === 'loading') {
      bridgeScope.on(
        document,
        'DOMContentLoaded',
        () => {
          if (disposed) return;
          scheduleFlush(0);
          scheduleFlush(800);
          scheduleFlush(2200);
        },
        { once: true, capture: true }
      );
    } else {
      scheduleFlush(0);
      scheduleFlush(800);
      scheduleFlush(2200);
    }
  } catch {}

  // Some browsers/sites use prerendered documents (visibilityState='prerender') and later swap to visible.
  // Ensure dataset is present after the page becomes visible.
  try {
    bridgeScope.on(
      document,
      'visibilitychange',
      () => {
        try {
          if (disposed) return;
          if (document.visibilityState === 'visible') scheduleFlush(0);
        } catch {}
      },
      true
    );
  } catch {}

  const state = Object.freeze({
    version: 2,
    dispose: disposeBridge,
    counts: () => ({
      storageListeners: storageListenerOffs.size,
      hasObserver: attrObserver ? 1 : 0,
      pendingTimer: pending.timer ? 1 : 0
    })
  });

  try {
    Object.defineProperty(globalThis, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      globalThis[STATE_KEY] = state;
    } catch {}
  }
})();
