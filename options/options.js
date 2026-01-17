(() => {
  'use strict';

  const REPO = 'lueluelue2006/AIChat_Quick_Nav';
  const REPO_URL = `https://github.com/${REPO}`;

  const elStatus = document.getElementById('status');
  const elEnabled = document.getElementById('enabled');
  const btnRestoreDefault = document.getElementById('restoreDefault');
  const btnReinjectNow = document.getElementById('reinjectNow');
  const btnOpenRepo = document.getElementById('openRepo');
  const elSiteList = document.getElementById('siteList');
  const elModuleList = document.getElementById('moduleList');
  const elModuleSettings = document.getElementById('moduleSettings');

  const SITES = [
    { id: 'chatgpt', name: 'ChatGPT', sub: 'chatgpt.com', modules: ['quicknav', 'chatgpt_perf'] },
    { id: 'ernie', name: '文心一言', sub: 'ernie.baidu.com', modules: ['quicknav'] },
    { id: 'deepseek', name: 'DeepSeek', sub: 'chat.deepseek.com', modules: ['quicknav'] },
    { id: 'qwen', name: 'Qwen', sub: 'chat.qwen.ai', modules: ['quicknav'] },
    { id: 'zai', name: 'GLM', sub: 'chat.z.ai', modules: ['quicknav'] },
    { id: 'grok', name: 'Grok', sub: 'grok.com', modules: ['quicknav'] },
    { id: 'gemini_app', name: 'Gemini App', sub: 'gemini.google.com/app', modules: ['quicknav'] },
    { id: 'gemini_business', name: 'Gemini Business', sub: 'business.gemini.google', modules: ['quicknav', 'gemini_math_fix'] },
    { id: 'genspark', name: 'Genspark', sub: 'genspark.ai/agents', modules: ['quicknav'] }
  ];

  const MODULES = {
    quicknav: {
      id: 'quicknav',
      name: 'QuickNav',
      sub: '对话导航 / 📌 标记 / 收藏 / 快捷键'
    },
    chatgpt_perf: {
      id: 'chatgpt_perf',
      name: 'ChatGPT 性能优化',
      sub: '离屏虚拟化 + CSS contain'
    },
    gemini_math_fix: {
      id: 'gemini_math_fix',
      name: 'Gemini Enterprise 数学修复',
      sub: 'KaTeX / inline math 修复'
    }
  };

  const CGPT_PERF_STORAGE_KEY = 'cgpt_perf_mv3_settings_v1';
  const CGPT_PERF_DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    virtualizeOffscreen: true,
    virtualizeMarkdownBlocks: true,
    optimizeHeavyBlocks: true,
    disableAnimations: true,
    boostDuringInput: true,
    showOverlay: false,
    rootMarginPx: 1200
  });

  function setStatus(text, kind = '') {
    if (!elStatus) return;
    elStatus.textContent = text || '';
    elStatus.classList.remove('ok', 'warn', 'err');
    if (kind) elStatus.classList.add(kind);
  }

  function cloneJsonSafe(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return null;
    }
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

  function sanitizeCgptPerfSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : CGPT_PERF_DEFAULT_SETTINGS.enabled,
      virtualizeOffscreen:
        typeof s.virtualizeOffscreen === 'boolean' ? s.virtualizeOffscreen : CGPT_PERF_DEFAULT_SETTINGS.virtualizeOffscreen,
      virtualizeMarkdownBlocks:
        typeof s.virtualizeMarkdownBlocks === 'boolean'
          ? s.virtualizeMarkdownBlocks
          : CGPT_PERF_DEFAULT_SETTINGS.virtualizeMarkdownBlocks,
      optimizeHeavyBlocks:
        typeof s.optimizeHeavyBlocks === 'boolean' ? s.optimizeHeavyBlocks : CGPT_PERF_DEFAULT_SETTINGS.optimizeHeavyBlocks,
      disableAnimations:
        typeof s.disableAnimations === 'boolean' ? s.disableAnimations : CGPT_PERF_DEFAULT_SETTINGS.disableAnimations,
      boostDuringInput:
        typeof s.boostDuringInput === 'boolean' ? s.boostDuringInput : CGPT_PERF_DEFAULT_SETTINGS.boostDuringInput,
      showOverlay: typeof s.showOverlay === 'boolean' ? s.showOverlay : CGPT_PERF_DEFAULT_SETTINGS.showOverlay,
      rootMarginPx: Number.isFinite(Number(s.rootMarginPx)) ? Math.max(0, Number(s.rootMarginPx)) : CGPT_PERF_DEFAULT_SETTINGS.rootMarginPx
    };
  }

  function storageGet(area, defaults) {
    return new Promise((resolve) => {
      try {
        area.get(defaults, (res) => resolve(res || defaults));
      } catch {
        resolve(defaults);
      }
    });
  }

  function storageSet(area, items) {
    return new Promise((resolve, reject) => {
      try {
        area.set(items, () => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message || String(err)));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function loadCgptPerfSettings() {
    const res = await storageGet(chrome.storage.sync, { [CGPT_PERF_STORAGE_KEY]: CGPT_PERF_DEFAULT_SETTINGS });
    return sanitizeCgptPerfSettings(res?.[CGPT_PERF_STORAGE_KEY]);
  }

  async function saveCgptPerfSettings(next) {
    const sanitized = sanitizeCgptPerfSettings(next);
    await storageSet(chrome.storage.sync, { [CGPT_PERF_STORAGE_KEY]: sanitized });
    return sanitized;
  }

  function openUrl(url) {
    try {
      chrome.tabs.create({ url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  let saveSeq = 0;
  let renderSeq = 0;
  let currentSettings = null;
  let selectedSiteId = SITES[0]?.id || 'chatgpt';
  let selectedModuleId = 'quicknav';

  function getSite(id) {
    return SITES.find((s) => s.id === id) || null;
  }

  function effectiveSelectedSiteId() {
    return getSite(selectedSiteId)?.id || SITES[0]?.id || 'chatgpt';
  }

  function effectiveSelectedModuleId(siteId) {
    const mods = getSite(siteId)?.modules || [];
    if (mods.includes(selectedModuleId)) return selectedModuleId;
    return mods[0] || 'quicknav';
  }

  async function saveQuickNavSettings(next) {
    const seq = ++saveSeq;
    setStatus('正在保存…');
    try {
      const saved = await setSettings(next);
      if (seq !== saveSeq) return;
      currentSettings = saved;
      renderAll();
      setStatus('已保存', 'ok');
    } catch (e) {
      if (seq !== saveSeq) return;
      renderAll();
      setStatus(`保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
    }
  }

  function patchQuickNavSettings(mutator) {
    if (!currentSettings) return;
    const next = cloneJsonSafe(currentSettings) || {};
    try {
      mutator(next);
    } catch {}
    void saveQuickNavSettings(next);
  }

  function isSiteEnabled(siteId) {
    const v = currentSettings?.sites?.[siteId];
    return v !== false;
  }

  function isModuleEnabled(siteId, moduleId) {
    const v = currentSettings?.siteModules?.[siteId]?.[moduleId];
    if (typeof v === 'boolean') return v;
    return moduleId === 'quicknav';
  }

  function renderSites(activeSiteId) {
    if (!elSiteList) return;
    elSiteList.textContent = '';

    for (const s of SITES) {
      const row = document.createElement('div');
      row.className = 'triRow' + (s.id === activeSiteId ? ' selected' : '');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'triBtn';

      const name = document.createElement('div');
      name.className = 'triName';
      name.textContent = s.name;

      const sub = document.createElement('div');
      sub.className = 'triSub';
      sub.textContent = s.sub;

      btn.appendChild(name);
      btn.appendChild(sub);
      btn.addEventListener('click', () => {
        selectedSiteId = s.id;
        selectedModuleId = effectiveSelectedModuleId(s.id);
        renderAll();
      });

      const toggleWrap = document.createElement('label');
      toggleWrap.className = 'triToggle';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = isSiteEnabled(s.id);
      toggle.addEventListener('change', () => {
        const checked = !!toggle.checked;
        patchQuickNavSettings((next) => {
          next.sites = next.sites && typeof next.sites === 'object' ? next.sites : {};
          next.sites[s.id] = checked;
        });
      });
      toggleWrap.appendChild(toggle);

      row.appendChild(btn);
      row.appendChild(toggleWrap);
      elSiteList.appendChild(row);
    }
  }

  function renderModules(siteId, activeModuleId) {
    if (!elModuleList) return;
    elModuleList.textContent = '';

    const mods = getSite(siteId)?.modules || [];

    for (const moduleId of mods) {
      const def = MODULES[moduleId];
      if (!def) continue;

      const row = document.createElement('div');
      row.className = 'triRow' + (moduleId === activeModuleId ? ' selected' : '');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'triBtn';

      const name = document.createElement('div');
      name.className = 'triName';
      name.textContent = def.name;

      const sub = document.createElement('div');
      sub.className = 'triSub';
      sub.textContent = def.sub || '';

      btn.appendChild(name);
      btn.appendChild(sub);
      btn.addEventListener('click', () => {
        selectedModuleId = moduleId;
        renderAll();
      });

      const toggleWrap = document.createElement('label');
      toggleWrap.className = 'triToggle';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = isModuleEnabled(siteId, moduleId);
      toggle.addEventListener('change', () => {
        const checked = !!toggle.checked;
        patchQuickNavSettings((next) => {
          next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
          next.siteModules[siteId] =
            next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
          next.siteModules[siteId][moduleId] = checked;
        });
      });
      toggleWrap.appendChild(toggle);

      row.appendChild(btn);
      row.appendChild(toggleWrap);
      elModuleList.appendChild(row);
    }
  }

  function addPanelTitle(title, subtitle) {
    const h = document.createElement('div');
    h.className = 'panelTitle';
    h.textContent = title;
    elModuleSettings.appendChild(h);

    if (subtitle) {
      const s = document.createElement('div');
      s.className = 'panelSubtitle';
      s.textContent = subtitle;
      elModuleSettings.appendChild(s);
    }
  }

  function addPanelDivider() {
    const d = document.createElement('div');
    d.className = 'panelGroup';
    elModuleSettings.appendChild(d);
  }

  function renderQuickNavModuleSettings(siteId) {
    addPanelTitle('QuickNav', '该模块负责对话导航面板、📌标记点、收藏夹、防自动滚动与快捷键。');
    addPanelDivider();

    const rowEnabled = document.createElement('label');
    rowEnabled.className = 'formRow';
    const leftEnabled = document.createElement('span');
    leftEnabled.textContent = '启用 QuickNav 模块';
    const inputEnabled = document.createElement('input');
    inputEnabled.type = 'checkbox';
    inputEnabled.checked = isModuleEnabled(siteId, 'quicknav');
    inputEnabled.addEventListener('change', () => {
      const checked = !!inputEnabled.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].quicknav = checked;
      });
    });
    rowEnabled.appendChild(leftEnabled);
    rowEnabled.appendChild(inputEnabled);
    elModuleSettings.appendChild(rowEnabled);

    const rowLock = document.createElement('label');
    rowLock.className = 'formRow';
    const leftLock = document.createElement('span');
    leftLock.textContent = '默认 🔐（防自动滚动）';
    const inputLock = document.createElement('input');
    inputLock.type = 'checkbox';
    inputLock.checked = currentSettings?.scrollLockDefaults?.[siteId] !== false;
    inputLock.addEventListener('change', () => {
      const checked = !!inputLock.checked;
      patchQuickNavSettings((next) => {
        next.scrollLockDefaults = next.scrollLockDefaults && typeof next.scrollLockDefaults === 'object' ? next.scrollLockDefaults : {};
        next.scrollLockDefaults[siteId] = checked;
      });
    });
    rowLock.appendChild(leftLock);
    rowLock.appendChild(inputLock);
    elModuleSettings.appendChild(rowLock);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = isSiteEnabled(siteId)
      ? '“默认 🔐”仅在该网站从未保存过 🔐 状态时生效（例如第一次使用，或清除该网站数据后）。'
      : '当前页面开关已关闭：该站点不会注入任何模块。';
    elModuleSettings.appendChild(hint);
  }

  async function renderChatGPTPerfModuleSettings(siteId, token) {
    addPanelTitle('ChatGPT 性能优化', '离屏虚拟化与 CSS contain，减少长对话卡顿（设置写入 storage.sync）。');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_perf');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_perf = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    let settings;
    try {
      settings = await loadCgptPerfSettings();
    } catch (e) {
      if (token !== renderSeq) return;
      const err = document.createElement('div');
      err.className = 'smallHint';
      err.textContent = `读取模块设置失败：${e instanceof Error ? e.message : String(e)}`;
      elModuleSettings.appendChild(err);
      return;
    }
    if (token !== renderSeq) return;

    addPanelDivider();

    const fields = [
      ['enabled', '模块内部总开关（enabled）'],
      ['virtualizeOffscreen', '离屏虚拟化（virtualizeOffscreen）'],
      ['virtualizeMarkdownBlocks', '虚拟化 Markdown 块（virtualizeMarkdownBlocks）'],
      ['optimizeHeavyBlocks', '重块优化（optimizeHeavyBlocks）'],
      ['disableAnimations', '禁用动画（disableAnimations）'],
      ['boostDuringInput', '输入时加强优化（boostDuringInput）'],
      ['showOverlay', '显示调试覆盖层（showOverlay）']
    ];

    for (const [key, label] of fields) {
      const row = document.createElement('label');
      row.className = 'formRow';
      const left = document.createElement('span');
      left.textContent = label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!settings[key];
      input.addEventListener('change', async () => {
        const next = { ...settings, [key]: !!input.checked };
        setStatus('正在保存模块设置…');
        try {
          settings = await saveCgptPerfSettings(next);
          setStatus('模块设置已保存', 'ok');
        } catch (e) {
          input.checked = !!settings[key];
          setStatus(`模块设置保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
        }
      });
      row.appendChild(left);
      row.appendChild(input);
      elModuleSettings.appendChild(row);
    }

    const rowMargin = document.createElement('label');
    rowMargin.className = 'formRow';
    const leftMargin = document.createElement('span');
    leftMargin.textContent = 'rootMarginPx（越大越不激进）';
    const inputMargin = document.createElement('input');
    inputMargin.type = 'number';
    inputMargin.min = '0';
    inputMargin.step = '50';
    inputMargin.value = String(settings.rootMarginPx);
    inputMargin.addEventListener('change', async () => {
      const n = Number(inputMargin.value);
      const next = { ...settings, rootMarginPx: Number.isFinite(n) ? Math.max(0, n) : settings.rootMarginPx };
      setStatus('正在保存模块设置…');
      try {
        settings = await saveCgptPerfSettings(next);
        inputMargin.value = String(settings.rootMarginPx);
        setStatus('模块设置已保存', 'ok');
      } catch (e) {
        inputMargin.value = String(settings.rootMarginPx);
        setStatus(`模块设置保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      }
    });
    rowMargin.appendChild(leftMargin);
    rowMargin.appendChild(inputMargin);
    elModuleSettings.appendChild(rowMargin);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn secondary';
    resetBtn.textContent = '恢复该模块默认设置';
    resetBtn.addEventListener('click', async () => {
      setStatus('正在恢复模块默认…');
      resetBtn.disabled = true;
      try {
        await saveCgptPerfSettings(CGPT_PERF_DEFAULT_SETTINGS);
        renderAll();
        setStatus('已恢复模块默认设置', 'ok');
      } catch (e) {
        setStatus(`恢复失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        resetBtn.disabled = false;
      }
    });
    elModuleSettings.appendChild(resetBtn);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '注意：这里的设置是模块内部逻辑的开关；“启用该模块注入”则决定脚本是否注入到页面。';
    elModuleSettings.appendChild(hint);
  }

  function renderGeminiMathFixModuleSettings(siteId) {
    addPanelTitle('Gemini Enterprise 数学修复', '在 business.gemini.google 上修复 KaTeX / inline math 显示问题。');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'gemini_math_fix');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].gemini_math_fix = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '该模块暂无额外设置。若关闭模块，已打开页面可能需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderModuleSettings(siteId, moduleId, token) {
    if (!elModuleSettings) return;
    elModuleSettings.textContent = '';

    if (!currentSettings) {
      addPanelTitle('设置', '正在加载设置…');
      return;
    }

    if (moduleId === 'quicknav') return renderQuickNavModuleSettings(siteId);
    if (moduleId === 'chatgpt_perf') return void renderChatGPTPerfModuleSettings(siteId, token);
    if (moduleId === 'gemini_math_fix') return renderGeminiMathFixModuleSettings(siteId);

    addPanelTitle('设置', '未知模块。');
  }

  function renderAll() {
    const token = ++renderSeq;
    const siteId = effectiveSelectedSiteId();
    const moduleId = effectiveSelectedModuleId(siteId);
    selectedSiteId = siteId;
    selectedModuleId = moduleId;

    if (elEnabled) elEnabled.checked = !!currentSettings?.enabled;
    renderSites(siteId);
    renderModules(siteId, moduleId);
    renderModuleSettings(siteId, moduleId, token);
  }

  async function init() {
    setStatus('正在加载设置…');
    try {
      const settings = await getSettings();
      currentSettings = settings;
      renderAll();
      setStatus('就绪');
    } catch (e) {
      setStatus(`加载失败：${e instanceof Error ? e.message : String(e)}`, 'err');
    }
  }

  elEnabled?.addEventListener('change', () => {
    const checked = !!elEnabled.checked;
    patchQuickNavSettings((next) => {
      next.enabled = checked;
    });
  });

  btnRestoreDefault?.addEventListener('click', () => {
    const next = {
      enabled: true,
      sites: {},
      scrollLockDefaults: {},
      siteModules: {}
    };
    for (const s of SITES) {
      next.sites[s.id] = true;
      next.scrollLockDefaults[s.id] = true;
      next.siteModules[s.id] = { quicknav: true };
    }
    next.siteModules.chatgpt = { quicknav: true, chatgpt_perf: false };
    next.siteModules.gemini_business = { quicknav: true, gemini_math_fix: false };
    void saveQuickNavSettings(next);
  });

  btnReinjectNow?.addEventListener('click', async () => {
    setStatus('正在重新注入…');
    if (btnReinjectNow) btnReinjectNow.disabled = true;
    try {
      const settings = await reinjectNow();
      currentSettings = settings;
      renderAll();
      setStatus('已重新注入（已打开的匹配页面会立即生效；关闭功能需刷新页面）', 'ok');
    } catch (e) {
      setStatus(`重新注入失败：${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      if (btnReinjectNow) btnReinjectNow.disabled = false;
    }
  });

  btnOpenRepo?.addEventListener('click', () => openUrl(REPO_URL));

  init();
})();

