(() => {
  'use strict';

  // Bridge extension settings (chrome.storage) into page-readable localStorage,
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

  function writeBool(key, val) {
    try {
      localStorage.setItem(key, val ? '1' : '0');
    } catch {}
  }

  function applyFromSettings(settings) {
    try {
      const mods = settings?.siteModules?.chatgpt;
      const effort = typeof mods?.chatgpt_thinking_toggle_hotkey_effort === 'boolean' ? mods.chatgpt_thinking_toggle_hotkey_effort : true;
      const model = typeof mods?.chatgpt_thinking_toggle_hotkey_model === 'boolean' ? mods.chatgpt_thinking_toggle_hotkey_model : true;
      writeBool(HOTKEY_EFFORT_ENABLED_KEY, effort);
      writeBool(HOTKEY_MODEL_ENABLED_KEY, model);
    } catch {}
  }

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
})();

