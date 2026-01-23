/* QuickNav MV3 service worker (background) */
(() => {
  'use strict';

  const SETTINGS_KEY = 'quicknav_settings';
  const DEFAULT_SETTINGS = {
    enabled: true,
    sites: {
      common: true,
      chatgpt: true,
      ernie: true,
      deepseek: true,
      qwen: true,
      zai: true,
      grok: true,
      gemini_app: true,
      gemini_business: true,
      genspark: true
    },
    scrollLockDefaults: {
      common: true,
      chatgpt: true,
      ernie: true,
      deepseek: true,
      qwen: true,
      zai: true,
      grok: true,
      gemini_app: true,
      gemini_business: true,
      genspark: true
    },
    siteModules: {
      common: { hide_disclaimer: true },
      chatgpt: {
        quicknav: true,
        chatgpt_perf: true,
        chatgpt_thinking_toggle: true,
        chatgpt_cmdenter_send: true,
        chatgpt_readaloud_speed_controller: true,
        chatgpt_reply_timer: true,
        chatgpt_usage_monitor: true,
        chatgpt_download_file_fix: true,
        chatgpt_strong_highlight_lite: true,
        chatgpt_quick_deep_search: true,
        chatgpt_hide_feedback_buttons: true,
        chatgpt_tex_copy_quote: true,
        chatgpt_export_conversation: true,
        chatgpt_image_message_edit: true,
        chatgpt_message_tree: true
      },
      ernie: { quicknav: true, chatgpt_cmdenter_send: true },
      deepseek: { quicknav: true, chatgpt_cmdenter_send: true },
      qwen: { quicknav: true, chatgpt_cmdenter_send: true },
      zai: { quicknav: true, chatgpt_cmdenter_send: true },
      grok: { quicknav: true, chatgpt_cmdenter_send: true, grok_fast_unlock: true, grok_rate_limit_display: true },
      gemini_app: { quicknav: true, chatgpt_cmdenter_send: true },
      gemini_business: { quicknav: true, chatgpt_cmdenter_send: true, gemini_math_fix: true, gemini_auto_3_pro: true },
      genspark: {
        quicknav: true,
        genspark_moa_image_autosettings: true,
        genspark_credit_balance: true,
        genspark_codeblock_fold: true,
        genspark_inline_upload_fix: true,
        chatgpt_cmdenter_send: true
      }
    }
  };

  const MAIN_GUARD_FILE = 'content/scroll-guard-main.js';
  const CONTENT_SCRIPT_DEFS = [
    {
      id: 'quicknav_common_hide_disclaimer',
      siteId: 'common',
      moduleId: 'hide_disclaimer',
      matches: [
        'https://chatgpt.com/*',
        'https://ernie.baidu.com/*',
        'https://chat.deepseek.com/*',
        'https://chat.qwen.ai/*',
        'https://chat.z.ai/*',
        'https://grok.com/*',
        'https://gemini.google.com/app*',
        'https://business.gemini.google/*',
        'https://www.genspark.ai/*'
      ],
      js: ['content/common-hide-disclaimer/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_chatgpt',
      siteId: 'chatgpt',
      moduleId: 'quicknav',
      matches: ['https://chatgpt.com/*'],
      js: ['content/menu-bridge.js', 'content/chatgpt-quicknav.js'],
      runAt: 'document_start'
    },
    {
      // MAIN-world scroll guard is required for scroll-lock to reliably block site-driven autoscroll.
      // (Isolated-world patches can't intercept page JS calls.)
      id: 'quicknav_scroll_guard_chatgpt',
      siteId: 'chatgpt',
      moduleId: 'quicknav',
      matches: ['https://chatgpt.com/*'],
      js: [MAIN_GUARD_FILE],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_ernie',
      siteId: 'ernie',
      moduleId: 'quicknav',
      matches: ['https://ernie.baidu.com/*'],
      js: ['content/menu-bridge.js', 'content/ernie-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_scroll_guard_ernie',
      siteId: 'ernie',
      moduleId: 'quicknav',
      matches: ['https://ernie.baidu.com/*'],
      js: [MAIN_GUARD_FILE],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_deepseek',
      siteId: 'deepseek',
      moduleId: 'quicknav',
      matches: ['https://chat.deepseek.com/*'],
      js: ['content/menu-bridge.js', 'content/deepseek-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_scroll_guard_deepseek',
      siteId: 'deepseek',
      moduleId: 'quicknav',
      matches: ['https://chat.deepseek.com/*'],
      js: [MAIN_GUARD_FILE],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_qwen',
      siteId: 'qwen',
      moduleId: 'quicknav',
      matches: ['https://chat.qwen.ai/*'],
      js: ['content/menu-bridge.js', 'content/qwen-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_scroll_guard_qwen',
      siteId: 'qwen',
      moduleId: 'quicknav',
      matches: ['https://chat.qwen.ai/*'],
      js: [MAIN_GUARD_FILE],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_zai',
      siteId: 'zai',
      moduleId: 'quicknav',
      matches: ['https://chat.z.ai/*'],
      js: ['content/menu-bridge.js', 'content/zai-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_scroll_guard_zai',
      siteId: 'zai',
      moduleId: 'quicknav',
      matches: ['https://chat.z.ai/*'],
      js: [MAIN_GUARD_FILE],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_gemini_business',
      siteId: 'gemini_business',
      moduleId: 'quicknav',
      matches: ['https://business.gemini.google/*'],
      js: ['content/menu-bridge.js', 'content/gemini-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_scroll_guard_gemini_business',
      siteId: 'gemini_business',
      moduleId: 'quicknav',
      matches: ['https://business.gemini.google/*'],
      js: [MAIN_GUARD_FILE],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_gemini_app',
      siteId: 'gemini_app',
      moduleId: 'quicknav',
      matches: ['https://gemini.google.com/app*'],
      js: ['content/menu-bridge.js', 'content/gemini-app-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_scroll_guard_gemini_app',
      siteId: 'gemini_app',
      moduleId: 'quicknav',
      matches: ['https://gemini.google.com/app*'],
      js: [MAIN_GUARD_FILE],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_grok',
      siteId: 'grok',
      moduleId: 'quicknav',
      matches: ['https://grok.com/*'],
      js: ['content/menu-bridge.js', 'content/grok-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_scroll_guard_grok',
      siteId: 'grok',
      moduleId: 'quicknav',
      matches: ['https://grok.com/*'],
      js: [MAIN_GUARD_FILE],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_genspark',
      siteId: 'genspark',
      moduleId: 'quicknav',
      matches: ['https://www.genspark.ai/agents*'],
      js: ['content/menu-bridge.js', 'content/genspark-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_scroll_guard_genspark',
      siteId: 'genspark',
      moduleId: 'quicknav',
      matches: ['https://www.genspark.ai/agents*'],
      js: [MAIN_GUARD_FILE],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_genspark_moa_image_autosettings',
      siteId: 'genspark',
      moduleId: 'genspark_moa_image_autosettings',
      matches: ['https://www.genspark.ai/*'],
      js: ['content/genspark-moa-image-autosettings/main.js'],
      runAt: 'document_start',
      allFrames: true
    },
    {
      id: 'quicknav_genspark_credit_balance',
      siteId: 'genspark',
      moduleId: 'genspark_credit_balance',
      matches: ['https://www.genspark.ai/*'],
      js: ['content/genspark-credit-balance/main.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_genspark_codeblock_fold',
      siteId: 'genspark',
      moduleId: 'genspark_codeblock_fold',
      matches: ['https://www.genspark.ai/agents*'],
      js: ['content/genspark-codeblock-fold/main.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_genspark_inline_upload_fix',
      siteId: 'genspark',
      moduleId: 'genspark_inline_upload_fix',
      matches: ['https://www.genspark.ai/agents*'],
      js: ['content/genspark-inline-upload-fix/main.js'],
      runAt: 'document_idle',
      world: 'MAIN'
    },
    {
      id: 'quicknav_chatgpt_perf',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_perf',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-perf/content.js'],
      css: ['content/chatgpt-perf/content.css'],
      runAt: 'document_idle'
    },
    {
      id: 'quicknav_chatgpt_thinking_toggle',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_thinking_toggle',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-fetch-hub/main.js', 'content/chatgpt-thinking-toggle/main.js'],
      runAt: 'document_idle',
      world: 'MAIN'
    },
    {
      id: 'quicknav_chatgpt_cmdenter_send',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_cmdenter_send',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_ernie_cmdenter_send',
      siteId: 'ernie',
      moduleId: 'chatgpt_cmdenter_send',
      matches: ['https://ernie.baidu.com/*'],
      js: ['content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_deepseek_cmdenter_send',
      siteId: 'deepseek',
      moduleId: 'chatgpt_cmdenter_send',
      matches: ['https://chat.deepseek.com/*'],
      js: ['content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_qwen_cmdenter_send',
      siteId: 'qwen',
      moduleId: 'chatgpt_cmdenter_send',
      matches: ['https://chat.qwen.ai/*'],
      js: ['content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_zai_cmdenter_send',
      siteId: 'zai',
      moduleId: 'chatgpt_cmdenter_send',
      matches: ['https://chat.z.ai/*'],
      js: ['content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_grok_cmdenter_send',
      siteId: 'grok',
      moduleId: 'chatgpt_cmdenter_send',
      matches: ['https://grok.com/*'],
      js: ['content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_grok_fast_unlock',
      siteId: 'grok',
      moduleId: 'grok_fast_unlock',
      matches: ['https://grok.com/*'],
      js: ['content/grok-fast-unlock/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_grok_rate_limit_display',
      siteId: 'grok',
      moduleId: 'grok_rate_limit_display',
      matches: ['https://grok.com/*'],
      js: ['content/grok-rate-limit-display/main.js'],
      runAt: 'document_end',
      world: 'MAIN'
    },
    {
      id: 'quicknav_gemini_app_cmdenter_send',
      siteId: 'gemini_app',
      moduleId: 'chatgpt_cmdenter_send',
      matches: ['https://gemini.google.com/app*'],
      js: ['content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_gemini_business_cmdenter_send',
      siteId: 'gemini_business',
      moduleId: 'chatgpt_cmdenter_send',
      matches: ['https://business.gemini.google/*'],
      js: ['content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_genspark_cmdenter_send',
      siteId: 'genspark',
      moduleId: 'chatgpt_cmdenter_send',
      matches: ['https://www.genspark.ai/agents*'],
      js: ['content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_chatgpt_readaloud_speed_controller',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_readaloud_speed_controller',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-readaloud-speed-controller/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_chatgpt_reply_timer',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_reply_timer',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-fetch-hub/main.js', 'content/chatgpt-reply-timer/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_chatgpt_usage_monitor',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_usage_monitor',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-fetch-hub/main.js', 'content/chatgpt-usage-monitor/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_chatgpt_download_file_fix',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_download_file_fix',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-fetch-hub/main.js', 'content/chatgpt-download-file-fix/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_chatgpt_strong_highlight_lite',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_strong_highlight_lite',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-strong-highlight-lite/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_chatgpt_quick_deep_search',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_quick_deep_search',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-fetch-hub/main.js', 'content/chatgpt-quick-deep-search/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_chatgpt_hide_feedback_buttons',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_hide_feedback_buttons',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-hide-feedback-buttons/main.js'],
      runAt: 'document_start'
    },
    {
      id: 'quicknav_chatgpt_tex_copy_quote',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_tex_copy_quote',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-tex-copy-quote/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_chatgpt_export_conversation',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_export_conversation',
      matches: ['https://chatgpt.com/*'],
      js: ['content/menu-bridge.js', 'content/chatgpt-export-conversation/main.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_chatgpt_image_message_edit',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_image_message_edit',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-fetch-hub/main.js', 'content/chatgpt-image-message-edit/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_chatgpt_message_tree',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_message_tree',
      matches: ['https://chatgpt.com/*'],
      js: ['content/chatgpt-fetch-hub/main.js', 'content/chatgpt-message-tree/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_gemini_math_fix',
      siteId: 'gemini_business',
      moduleId: 'gemini_math_fix',
      matches: ['https://business.gemini.google/*'],
      js: ['content/gemini-enterprise-math-fix/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: 'quicknav_gemini_auto_3_pro',
      siteId: 'gemini_business',
      moduleId: 'gemini_auto_3_pro',
      matches: ['https://business.gemini.google/*'],
      js: ['content/gemini-enterprise-auto-gemini-3-pro/main.js'],
      runAt: 'document_end'
    }
  ];

  const LEGACY_CONTENT_SCRIPT_IDS = ['quicknav_grok_model_selector'];
  const QUICKNAV_CONTENT_SCRIPT_IDS = [...new Set([...CONTENT_SCRIPT_DEFS.map((d) => d.id), ...LEGACY_CONTENT_SCRIPT_IDS])];

  let reinjectScheduled = false;
  let lastReinjectAt = 0;
  let pendingReinjectSettings = null;

  function deepCloneJsonSafe(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return {};
    }
  }

  function normalizeSettings(input) {
    const out = {
      enabled: true,
      sites: { ...DEFAULT_SETTINGS.sites },
      scrollLockDefaults: { ...DEFAULT_SETTINGS.scrollLockDefaults },
      siteModules: deepCloneJsonSafe(DEFAULT_SETTINGS.siteModules)
    };
    try {
      if (!input || typeof input !== 'object') return out;
      if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
      if (input.sites && typeof input.sites === 'object') {
        for (const key of Object.keys(DEFAULT_SETTINGS.sites)) {
          if (typeof input.sites[key] === 'boolean') out.sites[key] = input.sites[key];
        }
      }
      if (input.scrollLockDefaults && typeof input.scrollLockDefaults === 'object') {
        for (const key of Object.keys(DEFAULT_SETTINGS.scrollLockDefaults)) {
          if (typeof input.scrollLockDefaults[key] === 'boolean') out.scrollLockDefaults[key] = input.scrollLockDefaults[key];
        }
      }
      if (input.siteModules && typeof input.siteModules === 'object') {
        for (const siteId of Object.keys(DEFAULT_SETTINGS.siteModules)) {
          const rawMods = input.siteModules?.[siteId];
          if (!rawMods || typeof rawMods !== 'object') continue;
          const outMods = out.siteModules?.[siteId];
          if (!outMods || typeof outMods !== 'object') continue;
          for (const modId of Object.keys(outMods)) {
            if (typeof rawMods[modId] === 'boolean') outMods[modId] = rawMods[modId];
          }
        }
      }
    } catch {}
    return out;
  }

  function shouldPersistNormalizedSettings(raw) {
    try {
      if (!raw || typeof raw !== 'object') return true;
      if (typeof raw.enabled !== 'boolean') return true;
      if (!raw.sites || typeof raw.sites !== 'object') return true;
      for (const key of Object.keys(DEFAULT_SETTINGS.sites)) {
        if (typeof raw.sites[key] !== 'boolean') return true;
      }
      if (!raw.scrollLockDefaults || typeof raw.scrollLockDefaults !== 'object') return true;
      for (const key of Object.keys(DEFAULT_SETTINGS.scrollLockDefaults)) {
        if (typeof raw.scrollLockDefaults[key] !== 'boolean') return true;
      }
      if (!raw.siteModules || typeof raw.siteModules !== 'object') return true;
      for (const siteId of Object.keys(DEFAULT_SETTINGS.siteModules)) {
        const expectedMods = DEFAULT_SETTINGS.siteModules?.[siteId];
        if (!expectedMods || typeof expectedMods !== 'object') continue;
        const rawMods = raw.siteModules?.[siteId];
        if (!rawMods || typeof rawMods !== 'object') return true;
        for (const modId of Object.keys(expectedMods)) {
          if (typeof rawMods[modId] !== 'boolean') return true;
        }
      }
      return false;
    } catch {
      return true;
    }
  }

  async function getSettings() {
    try {
      const raw = await new Promise((resolve) => {
        try {
          chrome.storage.local.get({ [SETTINGS_KEY]: null }, (items) => resolve(items[SETTINGS_KEY]));
        } catch {
          resolve(null);
        }
      });
      const normalized = normalizeSettings(raw);
      if (shouldPersistNormalizedSettings(raw)) {
        await new Promise((resolve) => {
          try {
            chrome.storage.local.set({ [SETTINGS_KEY]: normalized }, () => resolve());
          } catch {
            resolve();
          }
        });
      }
      return normalized;
    } catch {
      return normalizeSettings(null);
    }
  }

  async function setSettings(next) {
    const normalized = normalizeSettings(next);
    await new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [SETTINGS_KEY]: normalized }, () => resolve());
      } catch {
        resolve();
      }
    });
    return normalized;
  }

  function isModuleEnabled(settings, siteId, moduleId) {
    if (!settings?.enabled) return false;
    if (settings?.sites?.[siteId] === false) return false;
    const mods = settings?.siteModules?.[siteId];
    if (!mods || typeof mods !== 'object') return moduleId === 'quicknav';
    if (typeof mods[moduleId] === 'boolean') return mods[moduleId];
    return DEFAULT_SETTINGS.siteModules?.[siteId]?.[moduleId] === true;
  }

  function getEnabledContentScriptDefs(settings) {
    if (!settings?.enabled) return [];
    return CONTENT_SCRIPT_DEFS.filter((d) => isModuleEnabled(settings, d.siteId, d.moduleId));
  }

  const URL_PATTERN_RE_CACHE = new Map();
  function compileUrlPattern(pattern) {
    if (URL_PATTERN_RE_CACHE.has(pattern)) return URL_PATTERN_RE_CACHE.get(pattern);
    const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp(`^${escaped}$`);
    URL_PATTERN_RE_CACHE.set(pattern, re);
    return re;
  }

  function urlMatchesAny(url, patterns) {
    if (!url || typeof url !== 'string') return false;
    if (!Array.isArray(patterns) || !patterns.length) return false;
    for (const p of patterns) {
      if (!p || typeof p !== 'string') continue;
      try {
        if (compileUrlPattern(p).test(url)) return true;
      } catch {}
    }
    return false;
  }

  function injectContentScriptDefsIntoTab(tabId, defs) {
    if (!Number.isFinite(tabId)) return;
    if (!Array.isArray(defs) || !defs.length) return;

    for (const rule of defs) {
      try {
        if (rule.css?.length) {
          chrome.scripting.insertCSS(
            {
              target: { tabId, ...(rule.allFrames ? { allFrames: true } : {}) },
              files: rule.css
            },
            () => void chrome.runtime.lastError
          );
        }
        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: rule.js,
            ...(rule.allFrames ? { allFrames: true } : {}),
            ...(rule.world ? { world: rule.world } : {})
          },
          () => void chrome.runtime.lastError
        );
      } catch {}
    }
  }

  function reinjectContentScripts(settings) {
    try {
      const now = Date.now();
      // 避免 service worker 被唤醒时反复注入
      if (now - lastReinjectAt < 2000) return;
      lastReinjectAt = now;
    } catch {}

    for (const rule of getEnabledContentScriptDefs(settings)) {
      try {
        chrome.tabs.query({ url: rule.matches }, (tabs) => {
          const err = chrome.runtime.lastError;
          if (err) return;
          for (const tab of tabs || []) {
            const tabId = tab && tab.id;
            if (!Number.isFinite(tabId)) continue;
            try {
              if (rule.css?.length) {
                chrome.scripting.insertCSS(
                  {
                    target: { tabId },
                    files: rule.css
                  },
                  () => void chrome.runtime.lastError
                );
              }
              chrome.scripting.executeScript(
                {
                  target: { tabId },
                  files: rule.js,
                  ...(rule.allFrames ? { allFrames: true } : {}),
                  ...(rule.world ? { world: rule.world } : {})
                },
                () => void chrome.runtime.lastError
              );
            } catch {}
          }
        });
      } catch {}
    }
  }

  function scheduleReinject() {
    try {
      // allow callers to pass latest settings via scheduleReinject(settings)
      if (arguments.length && arguments[0]) pendingReinjectSettings = arguments[0];
    } catch {}
    if (reinjectScheduled) return;
    reinjectScheduled = true;
    try {
      queueMicrotask(async () => {
        reinjectScheduled = false;
        const settings = pendingReinjectSettings || (await getSettings());
        pendingReinjectSettings = null;
        reinjectContentScripts(settings);
      });
    } catch {
      Promise.resolve()
        .then(async () => {
          reinjectScheduled = false;
          const settings = pendingReinjectSettings || (await getSettings());
          pendingReinjectSettings = null;
          reinjectContentScripts(settings);
        })
        .catch(() => {
          reinjectScheduled = false;
          pendingReinjectSettings = null;
        });
    }
  }

  async function getRegisteredQuickNavContentScripts() {
    try {
      const scripts = await new Promise((resolve) => {
        try {
          chrome.scripting.getRegisteredContentScripts((items) => resolve(items || []));
        } catch {
          resolve([]);
        }
      });
      const out = [];
      for (const s of scripts || []) {
        const id = s && typeof s.id === 'string' ? s.id : '';
        if (id && QUICKNAV_CONTENT_SCRIPT_IDS.includes(id)) out.push(s);
      }
      return out;
    } catch {
      return [];
    }
  }

  function normalizeWorld(input) {
    return input === 'MAIN' ? 'MAIN' : 'ISOLATED';
  }

  function normalizeRunAt(input) {
    return input === 'document_start' || input === 'document_idle' || input === 'document_end' ? input : 'document_end';
  }

  function normalizeStringArray(input) {
    if (!Array.isArray(input)) return [];
    return input.filter((x) => typeof x === 'string' && x);
  }

  function contentScriptDefToRegistration(def) {
    return {
      id: def.id,
      matches: normalizeStringArray(def.matches),
      js: normalizeStringArray(def.js),
      css: normalizeStringArray(def.css),
      runAt: normalizeRunAt(def.runAt),
      allFrames: !!def.allFrames,
      world: normalizeWorld(def.world)
    };
  }

  function registeredContentScriptToComparable(reg) {
    return {
      id: typeof reg?.id === 'string' ? reg.id : '',
      matches: normalizeStringArray(reg?.matches),
      js: normalizeStringArray(reg?.js),
      css: normalizeStringArray(reg?.css),
      runAt: normalizeRunAt(reg?.runAt),
      allFrames: !!reg?.allFrames,
      world: normalizeWorld(reg?.world)
    };
  }

  function arraysEqual(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function isSameContentScriptRegistration(registered, desired) {
    try {
      if (!registered || !desired) return false;
      return (
        registered.id === desired.id &&
        arraysEqual(registered.matches, desired.matches) &&
        arraysEqual(registered.js, desired.js) &&
        arraysEqual(registered.css, desired.css) &&
        registered.runAt === desired.runAt &&
        registered.allFrames === desired.allFrames &&
        registered.world === desired.world
      );
    } catch {
      return false;
    }
  }

  async function applyContentScriptRegistration(settings) {
    const enabledDefs = getEnabledContentScriptDefs(settings);
    const desired = new Map(enabledDefs.map((d) => [d.id, contentScriptDefToRegistration(d)]));

    const registeredScripts = await getRegisteredQuickNavContentScripts();
    const registered = new Map(registeredScripts.map((s) => [s.id, registeredContentScriptToComparable(s)]));

    const unregisterIds = new Set();
    const registerItems = [];

    // Remove scripts that no longer exist or are disabled.
    for (const [id] of registered) {
      if (!desired.has(id)) unregisterIds.add(id);
    }

    // Add scripts that are missing, or update scripts whose registration changed.
    for (const [id, desiredItem] of desired) {
      const regItem = registered.get(id);
      if (!regItem) {
        registerItems.push(desiredItem);
        continue;
      }
      if (!isSameContentScriptRegistration(regItem, desiredItem)) {
        unregisterIds.add(id);
        registerItems.push(desiredItem);
      }
    }

    const result = { registeredIds: registerItems.map((d) => d.id), unregisteredIds: Array.from(unregisterIds) };

    if (unregisterIds.size) {
      await new Promise((resolve) => {
        try {
          chrome.scripting.unregisterContentScripts({ ids: Array.from(unregisterIds) }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        } catch {
          resolve();
        }
      });
    }

    if (!registerItems.length) return result;

    await new Promise((resolve, reject) => {
      try {
        chrome.scripting.registerContentScripts(
          registerItems.map((d) => ({
            id: d.id,
            matches: d.matches,
            js: d.js,
            ...(d.css?.length ? { css: d.css } : {}),
            runAt: d.runAt,
            ...(d.allFrames ? { allFrames: true } : {}),
            ...(d.world !== 'ISOLATED' ? { world: d.world } : {})
          })),
          () => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message || String(err)));
            else resolve();
          }
        );
      } catch (e) {
        reject(e);
      }
    });

    return result;
  }

  let applyChain = Promise.resolve();
  function applySettingsAndReinject(settings) {
    applyChain = applyChain
      .catch(() => void 0)
      .then(async () => {
        const reg = await applyContentScriptRegistration(settings);
        scheduleReinject(settings);
        return reg;
      });
    return applyChain;
  }

  function ensureMainWorldScrollGuard(tabId, sendResponse) {
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: [MAIN_GUARD_FILE],
          world: 'MAIN'
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) sendResponse({ ok: false, error: err.message || String(err) });
          else sendResponse({ ok: true });
        }
      );
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'QUICKNAV_BOOTSTRAP_PING') {
        const tabId = sender?.tab?.id;
        const href = typeof msg.href === 'string' ? msg.href : '';
        getSettings()
          .then((settings) =>
            applySettingsAndReinject(settings)
              .catch((e) => {
                // even if registration fails, still best-effort inject into sender tab
                try {
                  if (Number.isFinite(tabId) && href) {
                    const enabled = getEnabledContentScriptDefs(settings);
                    const defsForUrl = enabled.filter((d) => urlMatchesAny(href, d.matches));
                    injectContentScriptDefsIntoTab(tabId, defsForUrl);
                  }
                } catch {}
                throw e;
              })
              .then((reg) => ({ settings, reg }))
          )
          .then(({ settings, reg }) => {
            try {
              if (Number.isFinite(tabId) && href) {
                const enabled = getEnabledContentScriptDefs(settings);
                const defsForUrl = enabled.filter((d) => urlMatchesAny(href, d.matches));
                const allowIds = new Set(Array.isArray(reg?.registeredIds) ? reg.registeredIds : []);
                const defsToInject = allowIds.size ? defsForUrl.filter((d) => allowIds.has(d.id)) : [];
                // Only inject scripts that were just (re)registered; avoids double-inject on normal page loads.
                injectContentScriptDefsIntoTab(tabId, defsToInject);
              }
            } catch {}
            sendResponse({ ok: true, settings });
          })
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_GET_SETTINGS') {
        getSettings().then((settings) => sendResponse({ ok: true, settings })).catch(() => sendResponse({ ok: true, settings: normalizeSettings(null) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_SET_SETTINGS') {
        setSettings(msg.settings)
          .then((settings) => applySettingsAndReinject(settings).then(() => settings))
          .then((settings) => sendResponse({ ok: true, settings }))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type === 'QUICKNAV_REINJECT_NOW') {
        getSettings()
          .then((settings) => {
            reinjectContentScripts(settings);
            return settings;
          })
          .then((settings) => sendResponse({ ok: true, settings }))
          .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        return true;
      }

      if (msg.type !== 'QUICKNAV_ENSURE_SCROLL_GUARD') return;
      const tabId = sender?.tab?.id;
      if (!Number.isFinite(tabId)) return sendResponse({ ok: false, error: 'No tabId' });
      ensureMainWorldScrollGuard(tabId, sendResponse);
      return true;
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  });

  // 扩展重新加载/更新时，把内容脚本注入到已打开的匹配标签页里（便于开发时只点“重新加载”即可生效）
  try {
    chrome.runtime.onInstalled.addListener(() => {
      getSettings().then((settings) => applySettingsAndReinject(settings)).catch(() => scheduleReinject());
    });
    chrome.runtime.onStartup?.addListener(() => {
      getSettings().then((settings) => applySettingsAndReinject(settings)).catch(() => scheduleReinject());
    });
    // 对于“加载已解压扩展程序/手动重新加载”场景，service worker 启动本身也触发一次
    getSettings().then((settings) => applySettingsAndReinject(settings)).catch(() => scheduleReinject());
  } catch {}
})();
