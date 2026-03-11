(() => {
  'use strict';

  const STATE_KEY = '__aichat_locale_bridge_state_v1__';
  const SETTINGS_KEY = 'aichat_ai_shortcuts_settings_v1';
  const DS_LOCALE_MODE_KEY = 'aichatLocaleMode';
  const DS_LOCALE_KEY = 'aichatLocale';
  const LOCALE_MODE_AUTO = 'auto';
  const LOCALE_MODE_ZH_CN = 'zh_cn';
  const LOCALE_MODE_EN = 'en';
  const FULL_TREE_SELECTORS = Object.freeze([
    '#cgptperf-ui',
    '#cgptperf-toast',
    '#aichat-grok-trash-cleanup-root',
    '#aichat-grok-quota-panel',
    '#aichat-genspark-credit-hover-box',
    '#aichat-genspark-credit-info-window',
    '#aichat-img-edit-banner',
    '[data-aichat-google-ask-gpt]',
    '.aichat-gs-codefold-togglebar',
    '.aichat-gs-code-toolbar'
  ]);
  const QUICKNAV_ROOT_SELECTORS = Object.freeze(['#cgpt-compact-nav', '#__aichat_chatgpt_tab_queue_preview_v1__']);
  const QUICKNAV_SAFE_TEXT_SELECTORS = Object.freeze([
    '.compact-empty',
    '.compact-tree',
    '.aichatTabQueueCount',
    '.aichatTabQueueHint',
    '.aichatTabQueuePaused',
    '.aichatTabQueueItemRemove',
    '.hdr',
    '.status',
    '.stats'
  ]);
  const MESSAGE_TREE_SAFE_TEXT_SELECTORS = Object.freeze(['.hdr', '.status', '.stats']);

  const prev = (() => {
    try {
      return globalThis[STATE_KEY] || null;
    } catch {
      return null;
    }
  })();
  try {
    prev?.dispose?.();
  } catch {}

  let disposed = false;
  let removeStorageListener = null;
  let pendingLocaleSnapshot = { localeMode: LOCALE_MODE_AUTO, locale: 'en' };
  let localeWriteTimer = 0;
  let localizeTimer = 0;
  let mutationObserver = null;
  const listenerOffs = new Set();
  let currentLocale = 'en';

  function normalizeLocaleMode(input) {
    const value = String(input || '').trim().toLowerCase();
    if (value === LOCALE_MODE_AUTO || value === LOCALE_MODE_ZH_CN || value === LOCALE_MODE_EN) return value;
    return LOCALE_MODE_AUTO;
  }

  function normalizeLocaleTag(input) {
    return String(input || '').trim().toLowerCase().replace(/_/g, '-');
  }

  function isSimplifiedChineseTag(input) {
    const tag = normalizeLocaleTag(input);
    if (!tag) return false;
    if (tag === 'zh-cn' || tag === 'zh-sg') return true;
    if (tag === 'zh-hans' || tag.startsWith('zh-hans-')) return true;
    if (tag.startsWith('zh-cn-') || tag.startsWith('zh-sg-')) return true;
    return false;
  }

  function detectLocale(nav = globalThis.navigator) {
    const candidates = [];
    try {
      if (Array.isArray(nav?.languages)) candidates.push(...nav.languages);
    } catch {}
    try {
      if (nav?.language) candidates.push(nav.language);
    } catch {}
    try {
      if (nav?.userLanguage) candidates.push(nav.userLanguage);
    } catch {}
    try {
      if (nav?.browserLanguage) candidates.push(nav.browserLanguage);
    } catch {}
    for (const candidate of candidates) {
      if (isSimplifiedChineseTag(candidate)) return 'zh-CN';
    }
    return 'en';
  }

  function resolveLocale(mode) {
    const normalized = normalizeLocaleMode(mode);
    if (normalized === LOCALE_MODE_ZH_CN) return 'zh-CN';
    if (normalized === LOCALE_MODE_EN) return 'en';
    return detectLocale(globalThis.navigator);
  }

  function tryWriteLocaleDataset(localeMode, locale) {
    try {
      const docEl = document.documentElement;
      if (!docEl || !docEl.dataset) return false;
      docEl.dataset[DS_LOCALE_MODE_KEY] = normalizeLocaleMode(localeMode);
      docEl.dataset[DS_LOCALE_KEY] = String(locale || 'en');
      docEl.lang = String(locale || 'en');
      return true;
    } catch {}
    return false;
  }

  function scheduleLocaleDatasetWrite() {
    if (disposed || localeWriteTimer) return;
    localeWriteTimer = window.setTimeout(() => {
      localeWriteTimer = 0;
      if (!pendingLocaleSnapshot) return;
      if (!tryWriteLocaleDataset(pendingLocaleSnapshot.localeMode, pendingLocaleSnapshot.locale)) {
        scheduleLocaleDatasetWrite();
      }
    }, 50);
  }

  function writeLocaleDataset(localeMode, locale) {
    pendingLocaleSnapshot = {
      localeMode: normalizeLocaleMode(localeMode),
      locale: String(locale || 'en')
    };
    if (!tryWriteLocaleDataset(pendingLocaleSnapshot.localeMode, pendingLocaleSnapshot.locale)) {
      scheduleLocaleDatasetWrite();
    }
  }

  function addScopedListener(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return;
    try {
      target.addEventListener(type, handler, options);
      listenerOffs.add(() => {
        try {
          target.removeEventListener(type, handler, options);
        } catch {}
      });
    } catch {}
  }

  function installReadyHooks() {
    const replay = () => {
      if (disposed || !pendingLocaleSnapshot) return;
      writeLocaleDataset(pendingLocaleSnapshot.localeMode, pendingLocaleSnapshot.locale);
      scheduleLocalize();
    };
    addScopedListener(document, 'readystatechange', replay, true);
    addScopedListener(document, 'DOMContentLoaded', replay, true);
    addScopedListener(window, 'load', replay, true);
  }

  function applyLocaleFromSettings(settings) {
    const localeMode = normalizeLocaleMode(settings?.localeMode);
    currentLocale = resolveLocale(localeMode);
    writeLocaleDataset(localeMode, currentLocale);
    scheduleLocalize();
  }

  function localizeAttributes(root) {
    try {
      const elements = root instanceof Element ? [root, ...root.querySelectorAll('*')] : Array.from(root.querySelectorAll ? root.querySelectorAll('*') : []);
      for (const el of elements) {
        if (!(el instanceof Element)) continue;
        for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
          const value = el.getAttribute(attr);
          if (!value) continue;
          const translated = globalThis.AISHORTCUTS_I18N.translateText(value, currentLocale);
          if (translated !== value) el.setAttribute(attr, translated);
        }
      }
    } catch {}
  }

  function localizeSafeSelectors(root, selectors) {
    for (const selector of selectors) {
      try {
        for (const el of root.querySelectorAll(selector)) globalThis.AISHORTCUTS_I18N.localizeTree(el, currentLocale);
      } catch {}
    }
  }

  function localizeRootsNow() {
    const I18N = globalThis.AISHORTCUTS_I18N || null;
    if (disposed || !I18N || currentLocale.startsWith('zh')) return;
    for (const selector of FULL_TREE_SELECTORS) {
      try {
        for (const root of document.querySelectorAll(selector)) I18N.localizeTree(root, currentLocale);
      } catch {}
    }
    for (const selector of QUICKNAV_ROOT_SELECTORS) {
      try {
        for (const root of document.querySelectorAll(selector)) {
          localizeAttributes(root);
          localizeSafeSelectors(root, QUICKNAV_SAFE_TEXT_SELECTORS);
        }
      } catch {}
    }
    try {
      const treePanel = document.getElementById('__aichat_chatgpt_message_tree_panel_v1__');
      if (treePanel) {
        localizeAttributes(treePanel);
        localizeSafeSelectors(treePanel, MESSAGE_TREE_SAFE_TEXT_SELECTORS);
      }
    } catch {}
    try {
      const bannerHost = document.getElementById('aichat-openai-new-model-banner-host');
      if (bannerHost?.shadowRoot) I18N.localizeTree(bannerHost.shadowRoot, currentLocale);
    } catch {}
  }

  function scheduleLocalize() {
    if (disposed || localizeTimer) return;
    localizeTimer = window.setTimeout(() => {
      localizeTimer = 0;
      localizeRootsNow();
    }, 60);
  }

  function installDomObserver() {
    try {
      mutationObserver = new MutationObserver(() => scheduleLocalize());
      mutationObserver.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true });
    } catch {}
  }

  function installStorageSync() {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local || !chrome?.storage?.onChanged) {
      applyLocaleFromSettings(null);
      return;
    }

    applyLocaleFromSettings(null);
    try {
      chrome.storage.local.get({ [SETTINGS_KEY]: null }, (items) => {
        void chrome.runtime?.lastError;
        if (disposed) return;
        applyLocaleFromSettings(items?.[SETTINGS_KEY] || null);
      });
    } catch {}

    try {
      const onStorage = (changes, areaName) => {
        if (disposed || areaName !== 'local' || !changes || !changes[SETTINGS_KEY]) return;
        applyLocaleFromSettings(changes[SETTINGS_KEY].newValue || null);
      };
      chrome.storage.onChanged.addListener(onStorage);
      removeStorageListener = () => {
        try {
          chrome.storage.onChanged.removeListener(onStorage);
        } catch {}
      };
    } catch {}
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (localeWriteTimer) {
      try {
        window.clearTimeout(localeWriteTimer);
      } catch {}
      localeWriteTimer = 0;
    }
    if (localizeTimer) {
      try {
        window.clearTimeout(localizeTimer);
      } catch {}
      localizeTimer = 0;
    }
    try {
      mutationObserver?.disconnect?.();
    } catch {}
    for (const off of Array.from(listenerOffs)) {
      try {
        off();
      } catch {}
    }
    listenerOffs.clear();
    try {
      removeStorageListener?.();
    } catch {}
  }

  installStorageSync();
  installReadyHooks();
  installDomObserver();
  scheduleLocalize();

  try {
    Object.defineProperty(globalThis, STATE_KEY, {
      value: Object.freeze({ dispose }),
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[STATE_KEY] = { dispose };
    } catch {}
  }
})();
