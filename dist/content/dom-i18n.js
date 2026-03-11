(() => {
  'use strict';

  const STATE_KEY = '__aichat_dom_i18n_state_v1__';
  const LOCALE_DATASET_KEY = 'aichatLocale';
  const FULL_TREE_SELECTORS = Object.freeze([
    '#cgptperf-ui',
    '#cgptperf-toast',
    '#__aichat_chatgpt_tab_queue_toasts_v1__',
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

  const I18N = (() => {
    try {
      return globalThis.AISHORTCUTS_I18N || null;
    } catch {
      return null;
    }
  })();
  if (!I18N) return;

  let disposed = false;
  let observer = null;
  let scheduleTimer = 0;
  let localeAttrObserver = null;

  const originalAlert = globalThis.alert;
  const originalConfirm = globalThis.confirm;
  const originalPrompt = globalThis.prompt;

  function getLocale() {
    try {
      const raw = String(document.documentElement?.dataset?.[LOCALE_DATASET_KEY] || '').trim();
      return raw || I18N.resolveLocale('auto', navigator);
    } catch {
      return 'en';
    }
  }

  function translate(value) {
    return I18N.translateText(String(value ?? ''), getLocale());
  }

  function installDialogPatches() {
    try {
      globalThis.alert = (message) => originalAlert.call(globalThis, translate(message));
    } catch {}
    try {
      globalThis.confirm = (message) => originalConfirm.call(globalThis, translate(message));
    } catch {}
    try {
      globalThis.prompt = (message, defaultValue) => originalPrompt.call(globalThis, translate(message), defaultValue);
    } catch {}
  }

  function restoreDialogs() {
    try {
      globalThis.alert = originalAlert;
    } catch {}
    try {
      globalThis.confirm = originalConfirm;
    } catch {}
    try {
      globalThis.prompt = originalPrompt;
    } catch {}
  }

  function collectRoots() {
    const roots = [];
    for (const selector of FULL_TREE_SELECTORS) {
      try {
        for (const node of document.querySelectorAll(selector)) roots.push({ mode: 'full', root: node });
      } catch {}
    }
    for (const selector of QUICKNAV_ROOT_SELECTORS) {
      try {
        for (const node of document.querySelectorAll(selector)) roots.push({ mode: 'quicknav', root: node });
      } catch {}
    }
    try {
      const treePanel = document.getElementById('__aichat_chatgpt_message_tree_panel_v1__');
      if (treePanel) roots.push({ mode: 'message-tree', root: treePanel });
    } catch {}
    try {
      const bannerHost = document.getElementById('aichat-openai-new-model-banner-host');
      if (bannerHost?.shadowRoot) roots.push({ mode: 'full', root: bannerHost.shadowRoot });
    } catch {}
    return roots;
  }

  function localizeAttributes(root, locale) {
    try {
      const elements =
        root instanceof Element ? [root, ...root.querySelectorAll('*')] : Array.from(root.querySelectorAll ? root.querySelectorAll('*') : []);
      for (const el of elements) {
        if (!(el instanceof Element)) continue;
        for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
          const value = el.getAttribute(attr);
          if (!value) continue;
          const translated = I18N.translateText(value, locale);
          if (translated !== value) el.setAttribute(attr, translated);
        }
      }
    } catch {}
  }

  function localizeSafeSelectors(root, locale, selectors) {
    for (const selector of selectors) {
      try {
        for (const el of root.querySelectorAll(selector)) I18N.localizeTree(el, locale);
      } catch {}
    }
  }

  function localizeNow() {
    if (disposed) return;
    const locale = getLocale();
    if (I18N.isChineseLocale(locale)) return;
    for (const entry of collectRoots()) {
      try {
        if (!entry || !entry.root) continue;
        if (entry.mode === 'full') {
          I18N.localizeTree(entry.root, locale);
          continue;
        }
        if (entry.mode === 'quicknav') {
          localizeAttributes(entry.root, locale);
          localizeSafeSelectors(entry.root, locale, QUICKNAV_SAFE_TEXT_SELECTORS);
          continue;
        }
        if (entry.mode === 'message-tree') {
          localizeAttributes(entry.root, locale);
          localizeSafeSelectors(entry.root, locale, ['.hdr', '.status', '.stats']);
        }
      } catch {}
    }
  }

  function scheduleLocalize() {
    if (disposed || scheduleTimer) return;
    scheduleTimer = window.setTimeout(() => {
      scheduleTimer = 0;
      localizeNow();
    }, 60);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
      scheduleTimer = 0;
    }
    try {
      observer?.disconnect?.();
    } catch {}
    try {
      localeAttrObserver?.disconnect?.();
    } catch {}
    restoreDialogs();
  }

  installDialogPatches();
  localizeNow();

  try {
    observer = new MutationObserver(() => scheduleLocalize());
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true });
  } catch {}

  try {
    localeAttrObserver = new MutationObserver(() => scheduleLocalize());
    localeAttrObserver.observe(document.documentElement || document.body, {
      attributes: true,
      attributeFilter: ['data-aichat-locale', 'data-aichat-locale-mode']
    });
  } catch {}

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
