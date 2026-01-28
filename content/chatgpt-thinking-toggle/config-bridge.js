(() => {
  'use strict';

  // Bridge extension settings (chrome.storage) into page-readable DOM dataset,
  // so MAIN-world scripts can respect user config without accessing chrome APIs.

  const FLAG = '__aichatChatgptThinkingToggleConfigBridgeV1__';
  try {
    if (globalThis[FLAG]) return;
    Object.defineProperty(globalThis, FLAG, { value: true, configurable: true });
  } catch {
    try {
      if (globalThis[FLAG]) return;
      globalThis[FLAG] = true;
    } catch {}
  }

  const SETTINGS_KEY = 'quicknav_settings';

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

  function flushPending() {
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
    try {
      if (pending.timer) return;
      const ms = Math.max(0, Number(delayMs) || 0);
      pending.timer = setTimeout(() => {
        pending.timer = 0;
        flushPending();
      }, ms);
    } catch {}
  }

  function applyFromSettings(settings) {
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
    try {
      if (globalThis.__aichatThinkingToggleAttrGuardV1) return;
      globalThis.__aichatThinkingToggleAttrGuardV1 = true;
      const html = document.documentElement;
      if (!html || typeof MutationObserver !== 'function') return;
      const mo = new MutationObserver(() => scheduleFlush(0));
      mo.observe(html, {
        attributes: true,
        attributeFilter: ['data-aichat-hotkey-effort-enabled', 'data-aichat-hotkey-model-enabled']
      });
    } catch {}
  }

  // Always apply defaults once (so MAIN-world reads don't depend on storage timing).
  applyFromSettings(null);
  ensureAttrGuard();

  try {
    chrome.storage.local.get({ [SETTINGS_KEY]: null }, (items) => {
      void chrome.runtime?.lastError;
      applyFromSettings(items?.[SETTINGS_KEY]);
    });
  } catch {}

  // Best-effort live update (without requiring a full page reload).
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      try {
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
      document.addEventListener(
        'DOMContentLoaded',
        () => {
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
    document.addEventListener(
      'visibilitychange',
      () => {
        try {
          if (document.visibilityState === 'visible') scheduleFlush(0);
        } catch {}
      },
      true
    );
  } catch {}
})();
