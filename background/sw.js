/* QuickNav MV3 service worker (background) */
(() => {
  'use strict';

  const SETTINGS_KEY = 'quicknav_settings';
  const DEFAULT_SETTINGS = {
    enabled: true,
    sites: {
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
      chatgpt: { quicknav: true, chatgpt_perf: false },
      ernie: { quicknav: true },
      deepseek: { quicknav: true },
      qwen: { quicknav: true },
      zai: { quicknav: true },
      grok: { quicknav: true },
      gemini_app: { quicknav: true },
      gemini_business: { quicknav: true, gemini_math_fix: false },
      genspark: { quicknav: true }
    }
  };

  const MAIN_GUARD_FILE = 'content/scroll-guard-main.js';
  const CONTENT_SCRIPT_DEFS = [
    {
      id: 'quicknav_chatgpt',
      siteId: 'chatgpt',
      moduleId: 'quicknav',
      matches: ['https://chatgpt.com/*'],
      js: ['content/gm-menu-polyfill.js', 'content/chatgpt-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_ernie',
      siteId: 'ernie',
      moduleId: 'quicknav',
      matches: ['https://ernie.baidu.com/*'],
      js: ['content/gm-menu-polyfill.js', 'content/ernie-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_deepseek',
      siteId: 'deepseek',
      moduleId: 'quicknav',
      matches: ['https://chat.deepseek.com/*'],
      js: ['content/gm-menu-polyfill.js', 'content/deepseek-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_qwen',
      siteId: 'qwen',
      moduleId: 'quicknav',
      matches: ['https://chat.qwen.ai/*'],
      js: ['content/gm-menu-polyfill.js', 'content/qwen-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_zai',
      siteId: 'zai',
      moduleId: 'quicknav',
      matches: ['https://chat.z.ai/*'],
      js: ['content/gm-menu-polyfill.js', 'content/zai-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_gemini_business',
      siteId: 'gemini_business',
      moduleId: 'quicknav',
      matches: ['https://business.gemini.google/*'],
      js: ['content/gm-menu-polyfill.js', 'content/gemini-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_gemini_app',
      siteId: 'gemini_app',
      moduleId: 'quicknav',
      matches: ['https://gemini.google.com/app*'],
      js: ['content/gm-menu-polyfill.js', 'content/gemini-app-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_grok',
      siteId: 'grok',
      moduleId: 'quicknav',
      matches: ['https://grok.com/*'],
      js: ['content/gm-menu-polyfill.js', 'content/grok-quicknav.js'],
      runAt: 'document_end'
    },
    {
      id: 'quicknav_genspark',
      siteId: 'genspark',
      moduleId: 'quicknav',
      matches: ['https://www.genspark.ai/agents*'],
      js: ['content/gm-menu-polyfill.js', 'content/genspark-quicknav.js'],
      runAt: 'document_end'
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
      id: 'quicknav_gemini_math_fix',
      siteId: 'gemini_business',
      moduleId: 'gemini_math_fix',
      matches: ['https://business.gemini.google/*'],
      js: ['content/gemini-enterprise-math-fix/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    }
  ];

  const QUICKNAV_CONTENT_SCRIPT_IDS = CONTENT_SCRIPT_DEFS.map((d) => d.id);

  let reinjectScheduled = false;
  let lastReinjectAt = 0;

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
    if (reinjectScheduled) return;
    reinjectScheduled = true;
    setTimeout(async () => {
      reinjectScheduled = false;
      const settings = await getSettings();
      reinjectContentScripts(settings);
    }, 150);
  }

  async function getRegisteredQuickNavContentScriptIds() {
    try {
      const scripts = await new Promise((resolve) => {
        try {
          chrome.scripting.getRegisteredContentScripts((items) => resolve(items || []));
        } catch {
          resolve([]);
        }
      });
      const ids = [];
      for (const s of scripts || []) {
        const id = s && typeof s.id === 'string' ? s.id : '';
        if (id && QUICKNAV_CONTENT_SCRIPT_IDS.includes(id)) ids.push(id);
      }
      return ids;
    } catch {
      return [];
    }
  }

  async function applyContentScriptRegistration(settings) {
    const registeredIds = await getRegisteredQuickNavContentScriptIds();
    if (registeredIds.length) {
      await new Promise((resolve) => {
        try {
          chrome.scripting.unregisterContentScripts({ ids: registeredIds }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        } catch {
          resolve();
        }
      });
    }

    const enabledDefs = getEnabledContentScriptDefs(settings);
    if (!enabledDefs.length) return;

    await new Promise((resolve, reject) => {
      try {
        chrome.scripting.registerContentScripts(
          enabledDefs.map((d) => ({
            id: d.id,
            matches: d.matches,
            js: d.js,
            ...(d.css?.length ? { css: d.css } : {}),
            runAt: d.runAt || 'document_end',
            ...(d.world ? { world: d.world } : {})
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
  }

  let applyChain = Promise.resolve();
  function applySettingsAndReinject(settings) {
    applyChain = applyChain
      .catch(() => void 0)
      .then(async () => {
        await applyContentScriptRegistration(settings);
        scheduleReinject();
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
