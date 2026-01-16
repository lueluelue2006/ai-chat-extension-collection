(() => {
  'use strict';

  const REPO = 'lueluelue2006/AIChat_Quick_Nav';
  const REPO_URL = `https://github.com/${REPO}`;

  const elStatus = document.getElementById('status');
  const elEnabled = document.getElementById('enabled');
  const btnRestoreDefault = document.getElementById('restoreDefault');
  const btnReinjectNow = document.getElementById('reinjectNow');
  const btnOpenRepo = document.getElementById('openRepo');

  const SITE_KEYS = [
    'chatgpt',
    'ernie',
    'deepseek',
    'qwen',
    'zai',
    'grok',
    'gemini_app',
    'gemini_business',
    'genspark'
  ];

  function setStatus(text, kind = '') {
    elStatus.textContent = text || '';
    elStatus.classList.remove('ok', 'warn', 'err');
    if (kind) elStatus.classList.add(kind);
  }

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function getSettings() {
    const resp = await sendMessage({ type: 'QUICKNAV_GET_SETTINGS' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to get settings');
    return resp.settings;
  }

  async function setSettings(settings) {
    const resp = await sendMessage({ type: 'QUICKNAV_SET_SETTINGS', settings });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to save settings');
    return resp.settings;
  }

  async function reinjectNow() {
    const resp = await sendMessage({ type: 'QUICKNAV_REINJECT_NOW' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to reinject');
    return resp.settings;
  }

  function readSettingsFromUI() {
    const sites = {};
    for (const key of SITE_KEYS) {
      const el = document.getElementById(`site_${key}`);
      sites[key] = !!el?.checked;
    }
    const scrollLockDefaults = {};
    for (const key of SITE_KEYS) {
      const el = document.getElementById(`lock_${key}`);
      scrollLockDefaults[key] = !!el?.checked;
    }
    return { enabled: !!elEnabled?.checked, sites, scrollLockDefaults };
  }

  function applySettingsToUI(settings) {
    elEnabled.checked = !!settings?.enabled;
    for (const key of SITE_KEYS) {
      const el = document.getElementById(`site_${key}`);
      if (el) el.checked = settings?.sites?.[key] !== false;
    }
    for (const key of SITE_KEYS) {
      const el = document.getElementById(`lock_${key}`);
      if (el) el.checked = settings?.scrollLockDefaults?.[key] !== false;
    }
  }

  function openUrl(url) {
    try {
      chrome.tabs.create({ url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  let saveSeq = 0;
  let currentSettings = null;

  async function saveFromUI() {
    const seq = ++saveSeq;
    setStatus('正在保存…');
    try {
      const next = readSettingsFromUI();
      const saved = await setSettings(next);
      if (seq !== saveSeq) return;
      currentSettings = saved;
      applySettingsToUI(saved);
      setStatus('已保存', 'ok');
    } catch (e) {
      if (seq !== saveSeq) return;
      applySettingsToUI(currentSettings);
      setStatus(`保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
    }
  }

  async function init() {
    setStatus('正在加载设置…');
    try {
      const settings = await getSettings();
      currentSettings = settings;
      applySettingsToUI(settings);
      setStatus('就绪');
    } catch (e) {
      setStatus(`加载失败：${e instanceof Error ? e.message : String(e)}`, 'err');
    }
  }

  elEnabled?.addEventListener('change', () => void saveFromUI());
  for (const key of SITE_KEYS) {
    document.getElementById(`site_${key}`)?.addEventListener('change', () => void saveFromUI());
    document.getElementById(`lock_${key}`)?.addEventListener('change', () => void saveFromUI());
  }

  btnRestoreDefault?.addEventListener('click', () => {
    elEnabled.checked = true;
    for (const key of SITE_KEYS) {
      const el = document.getElementById(`site_${key}`);
      if (el) el.checked = true;
    }
    for (const key of SITE_KEYS) {
      const el = document.getElementById(`lock_${key}`);
      if (el) el.checked = true;
    }
    void saveFromUI();
  });

  btnReinjectNow?.addEventListener('click', async () => {
    setStatus('正在重新注入…');
    btnReinjectNow.disabled = true;
    try {
      const settings = await reinjectNow();
      currentSettings = settings;
      setStatus('已重新注入（已打开的匹配页面会立即生效；关闭功能需刷新页面）', 'ok');
    } catch (e) {
      setStatus(`重新注入失败：${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      btnReinjectNow.disabled = false;
    }
  });

  btnOpenRepo?.addEventListener('click', () => openUrl(REPO_URL));

  init();
})();
