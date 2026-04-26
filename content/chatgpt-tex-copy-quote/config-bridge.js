(() => {
  'use strict';

  // Bridge extension settings into DOM dataset for the MAIN-world TeX script.
  const STATE_KEY = '__aichat_chatgpt_tex_copy_quote_config_bridge_state_v1__';
  const SCOPE_API_KEY = '__aichat_quicknav_scope_v1__';
  const SCOPE_KEY = 'chatgpt_tex_copy_quote_config_bridge';
  const SETTINGS_KEY = 'aichat_ai_shortcuts_settings_v1';
  const LEGACY_SETTINGS_KEY = 'quicknav_settings';

  const DATASET_KEYS = Object.freeze({
    multiQuote: 'aichatTexQuoteMultiQuoteEnabled',
    hideNativeQuote: 'aichatTexQuoteHideNativeQuoteEnabled',
    nativeQuotePatch: 'aichatTexQuoteNativeQuotePatchEnabled',
    copyLatex: 'aichatTexQuoteCopyLatexEnabled',
    hoverTooltip: 'aichatTexQuoteHoverTooltipEnabled',
    doubleClickCopy: 'aichatTexQuoteDoubleClickCopyEnabled'
  });

  const ATTR_FILTER = Object.freeze([
    'data-aichat-tex-quote-multi-quote-enabled',
    'data-aichat-tex-quote-hide-native-quote-enabled',
    'data-aichat-tex-quote-native-quote-patch-enabled',
    'data-aichat-tex-quote-copy-latex-enabled',
    'data-aichat-tex-quote-hover-tooltip-enabled',
    'data-aichat-tex-quote-double-click-copy-enabled'
  ]);

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
  const pending = {
    multiQuote: true,
    hideNativeQuote: true,
    nativeQuotePatch: true,
    copyLatex: true,
    hoverTooltip: true,
    doubleClickCopy: true,
    timer: 0,
    tries: 0
  };

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

  function readBool(value, fallback) {
    return typeof value === 'boolean' ? value : !!fallback;
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

  function flushPending() {
    if (disposed) return;
    const ok = [
      writeBoolDataset(DATASET_KEYS.multiQuote, pending.multiQuote),
      writeBoolDataset(DATASET_KEYS.hideNativeQuote, pending.hideNativeQuote),
      writeBoolDataset(DATASET_KEYS.nativeQuotePatch, pending.nativeQuotePatch),
      writeBoolDataset(DATASET_KEYS.copyLatex, pending.copyLatex),
      writeBoolDataset(DATASET_KEYS.hoverTooltip, pending.hoverTooltip),
      writeBoolDataset(DATASET_KEYS.doubleClickCopy, pending.doubleClickCopy)
    ].every(Boolean);
    if (ok) {
      pending.tries = 0;
      return;
    }
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
        if (!disposed) flushPending();
      }, ms);
    } catch {}
  }

  function applyFromSettings(settings) {
    if (disposed) return;
    try {
      const mods = settings?.siteModules?.chatgpt;
      pending.multiQuote = readBool(mods?.chatgpt_tex_copy_quote_multi_quote, true);
      pending.hideNativeQuote = readBool(mods?.chatgpt_tex_copy_quote_hide_native_quote, true);
      pending.nativeQuotePatch = readBool(mods?.chatgpt_tex_copy_quote_native_quote_patch, true);
      pending.copyLatex = readBool(mods?.chatgpt_tex_copy_quote_copy_latex, true);
      pending.hoverTooltip = readBool(mods?.chatgpt_tex_copy_quote_hover_tooltip, true);
      pending.doubleClickCopy = readBool(mods?.chatgpt_tex_copy_quote_double_click_copy, true);
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
        attributeFilter: [...ATTR_FILTER]
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
