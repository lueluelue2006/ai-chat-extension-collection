(() => {
  'use strict';

  const STATE_KEY = '__aichat_chatgpt_quick_deep_search_config_bridge_state_v1__';
  const SCOPE_API_KEY = '__aichat_quicknav_scope_v1__';
  const SCOPE_KEY = 'chatgpt_quick_deep_search_config_bridge';
  const SETTINGS_KEY = 'aichat_ai_shortcuts_settings_v1';
  const LEGACY_SETTINGS_KEY = 'quicknav_settings';
  const DS_HOTKEYS_KEY = 'aichatQuickDeepSearchHotkeysEnabled';

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
        let observer = null;
        try {
          observer = new MutationObserver(fn);
          observer.observe(target, opts && typeof opts === 'object' ? opts : { attributes: true });
        } catch {
          try {
            observer?.disconnect?.();
          } catch {}
          return null;
        }
        let active = true;
        const off = () => {
          if (!active) return;
          active = false;
          observerOffs.delete(off);
          try {
            observer.disconnect();
          } catch {}
        };
        observerOffs.add(off);
        return observer;
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
  const pending = { enabled: true, timer: 0, tries: 0 };

  function normalizeMetaKeyMode(mode) {
    const value = String(mode || '').trim().toLowerCase();
    if (value === 'auto' || value === 'has_meta' || value === 'no_meta') return value;
    return 'auto';
  }

  function detectHasMetaKeyCapability() {
    try {
      const platform = String(navigator?.userAgentData?.platform || navigator?.platform || navigator?.userAgent || '').toLowerCase();
      return platform.includes('mac');
    } catch {
      return false;
    }
  }

  function resolveHasMetaKey(settings) {
    const mode = normalizeMetaKeyMode(settings?.metaKeyMode);
    if (mode === 'has_meta') return true;
    if (mode === 'no_meta') return false;
    return detectHasMetaKeyCapability();
  }

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

  function writeBoolDataset(key, val) {
    if (disposed) return false;
    try {
      if (!document.documentElement || !document.documentElement.dataset) return false;
      const next = val ? '1' : '0';
      if (document.documentElement.dataset[key] !== next) document.documentElement.dataset[key] = next;
      return true;
    } catch {
      return false;
    }
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

  function flushPending() {
    if (disposed) return;
    if (writeBoolDataset(DS_HOTKEYS_KEY, pending.enabled)) {
      pending.tries = 0;
      return;
    }
    pending.tries += 1;
    if (pending.tries > 30) return;
    scheduleFlush(200);
  }

  function applyFromSettings(settings) {
    if (disposed) return;
    try {
      const mods = settings?.siteModules?.chatgpt;
      const hotkeys = typeof mods?.chatgpt_quick_deep_search_hotkeys === 'boolean' ? mods.chatgpt_quick_deep_search_hotkeys : true;
      const force = typeof mods?.chatgpt_quick_deep_search_hotkeys_force === 'boolean' ? mods.chatgpt_quick_deep_search_hotkeys_force : false;
      const hasMetaKey = resolveHasMetaKey(settings);
      pending.enabled = !!hotkeys && (!!hasMetaKey || !!force);
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
        attributeFilter: ['data-aichat-quick-deep-search-hotkeys-enabled']
      });
    } catch {}
  }

  function purgeLegacySettingsKey() {
    try {
      chrome.storage.local.remove([LEGACY_SETTINGS_KEY], () => void chrome.runtime?.lastError);
    } catch {}
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

  try {
    addStorageOnChangedListener((changes, areaName) => {
      try {
        if (disposed || areaName !== 'local') return;
        const next = changes?.[SETTINGS_KEY]?.newValue;
        if (!next) return;
        applyFromSettings(next);
      } catch {}
    });
  } catch {}

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

  try {
    bridgeScope.on(
      document,
      'visibilitychange',
      () => {
        try {
          if (!disposed && document.visibilityState === 'visible') scheduleFlush(0);
        } catch {}
      },
      true
    );
  } catch {}

  const state = Object.freeze({
    version: 1,
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
