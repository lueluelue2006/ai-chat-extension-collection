(() => {
  'use strict';

  const REPO = 'lueluelue2006/ai-chat-extension-collection';
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
    { id: 'common', name: '通用', sub: '全部站点', modules: ['hide_disclaimer'] },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      sub: 'chatgpt.com',
      modules: [
        'quicknav',
        'chatgpt_perf',
        'chatgpt_thinking_toggle',
        'chatgpt_cmdenter_send',
        'chatgpt_readaloud_speed_controller',
        'chatgpt_download_file_fix',
        'chatgpt_strong_highlight_lite',
        'chatgpt_quick_deep_search',
        'chatgpt_hide_feedback_buttons',
        'chatgpt_tex_copy_quote'
      ]
    },
    { id: 'ernie', name: '文心一言', sub: 'ernie.baidu.com', modules: ['quicknav'] },
    { id: 'deepseek', name: 'DeepSeek', sub: 'chat.deepseek.com', modules: ['quicknav'] },
    { id: 'qwen', name: 'Qwen', sub: 'chat.qwen.ai', modules: ['quicknav'] },
    { id: 'zai', name: 'GLM', sub: 'chat.z.ai', modules: ['quicknav'] },
    { id: 'grok', name: 'Grok', sub: 'grok.com', modules: ['quicknav'] },
    { id: 'gemini_app', name: 'Gemini App', sub: 'gemini.google.com/app', modules: ['quicknav'] },
    {
      id: 'gemini_business',
      name: 'Gemini Business',
      sub: 'business.gemini.google',
      modules: ['quicknav', 'gemini_math_fix', 'gemini_auto_3_pro']
    },
    {
      id: 'genspark',
      name: 'Genspark',
      sub: 'genspark.ai/agents',
      modules: ['quicknav', 'genspark_moa_image_autosettings', 'genspark_credit_balance', 'genspark_codeblock_fold']
    }
  ];

  const MODULES = {
    hide_disclaimer: {
      id: 'hide_disclaimer',
      name: '隐藏免责声明/提示条',
      sub: '自动隐藏“AI 可能会犯错/数据使用”等提示条',
      hotkeys: []
    },
    quicknav: {
      id: 'quicknav',
      name: 'QuickNav',
      sub: '对话导航 / 📌 标记 / 收藏 / 防自动滚动',
      hotkeys: ['⌘↑/⌘↓', '⌥↑/⌥↓', '⌥/']
    },
    chatgpt_perf: {
      id: 'chatgpt_perf',
      name: 'ChatGPT 性能优化',
      sub: '离屏虚拟化 + CSS contain',
      hotkeys: []
    },
    chatgpt_thinking_toggle: {
      id: 'chatgpt_thinking_toggle',
      name: 'ChatGPT 推理强度快捷切换',
      sub: 'Light ↔ Heavy / Standard ↔ Extended',
      hotkeys: ['⌘O']
    },
    chatgpt_cmdenter_send: {
      id: 'chatgpt_cmdenter_send',
      name: 'ChatGPT ⌘Enter 发送',
      sub: 'Enter/Shift+Enter 换行（强制）',
      hotkeys: ['⌘Enter', 'Ctrl+Enter']
    },
    chatgpt_readaloud_speed_controller: {
      id: 'chatgpt_readaloud_speed_controller',
      name: 'ChatGPT 朗读速度控制器',
      sub: '控制 ChatGPT 朗读音频播放速度（0.01–100x）',
      hotkeys: []
    },
    chatgpt_download_file_fix: {
      id: 'chatgpt_download_file_fix',
      name: 'ChatGPT 下载修复',
      sub: '修复文件下载失败（sandbox_path 解码）',
      hotkeys: []
    },
    chatgpt_strong_highlight_lite: {
      id: 'chatgpt_strong_highlight_lite',
      name: 'ChatGPT 回复粗体高亮（Lite）',
      sub: '高亮粗体 + 隐藏免责声明',
      hotkeys: []
    },
    chatgpt_quick_deep_search: {
      id: 'chatgpt_quick_deep_search',
      name: 'ChatGPT 快捷深度搜索（自用版）',
      sub: '译 / 搜 / 思（按钮 + 快捷键）并强制下一次请求模型为 gpt-5',
      hotkeys: ['Ctrl+S', 'Ctrl+T', 'Ctrl+Y', 'Ctrl+Z']
    },
    chatgpt_hide_feedback_buttons: {
      id: 'chatgpt_hide_feedback_buttons',
      name: 'ChatGPT 隐藏点赞/点踩',
      sub: '隐藏回复下方反馈按钮（👍/👎）',
      hotkeys: []
    },
    chatgpt_tex_copy_quote: {
      id: 'chatgpt_tex_copy_quote',
      name: 'ChatGPT TeX Copy & Quote',
      sub: '复制/引用含 KaTeX 的选区时优先还原 LaTeX，并支持悬停提示/双击复制',
      hotkeys: []
    },
    gemini_math_fix: {
      id: 'gemini_math_fix',
      name: 'Gemini Enterprise 数学修复',
      sub: 'KaTeX / inline math 修复',
      hotkeys: []
    },
    gemini_auto_3_pro: {
      id: 'gemini_auto_3_pro',
      name: 'Gemini Enterprise 自动切换 3 Pro',
      sub: '自动将模型切换为 Gemini 3 Pro（可用时）',
      hotkeys: []
    },
    genspark_moa_image_autosettings: {
      id: 'genspark_moa_image_autosettings',
      name: 'Genspark 绘图默认设置',
      sub: '进入绘图页自动打开 Setting，并选择 2K 画质',
      hotkeys: []
    },
    genspark_credit_balance: {
      id: 'genspark_credit_balance',
      name: 'Genspark 积分余量',
      sub: '悬停小蓝点显示积分信息（可刷新/折叠/拖动）',
      hotkeys: []
    },
    genspark_codeblock_fold: {
      id: 'genspark_codeblock_fold',
      name: 'Genspark 长代码块折叠',
      sub: '自动折叠长代码块并提供 展开/收起 按钮（仅 AI Chat 页）',
      hotkeys: []
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

  const CGPT_READALOUD_SPEED_STORAGE_KEY = 'aichat_chatgpt_readaloud_speed_v1';
  const CGPT_READALOUD_SPEED_DEFAULT = 1.8;
  const CGPT_READALOUD_SPEED_MIN = 0.01;
  const CGPT_READALOUD_SPEED_MAX = 100;

  function setStatus(text, kind = '') {
    if (!elStatus) return;
    elStatus.textContent = text || '';
    elStatus.classList.remove('ok', 'warn', 'err');
    if (kind) elStatus.classList.add(kind);
  }

  function formatHotkeys(hotkeys) {
    const arr = Array.isArray(hotkeys) ? hotkeys.filter((v) => typeof v === 'string' && v.trim()) : [];
    return arr.join(' / ');
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

  function sanitizeCgptReadaloudSpeed(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return CGPT_READALOUD_SPEED_DEFAULT;
    return Math.max(CGPT_READALOUD_SPEED_MIN, Math.min(CGPT_READALOUD_SPEED_MAX, n));
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

  async function loadCgptReadaloudSpeed() {
    const res = await storageGet(chrome.storage.sync, { [CGPT_READALOUD_SPEED_STORAGE_KEY]: CGPT_READALOUD_SPEED_DEFAULT });
    return sanitizeCgptReadaloudSpeed(res?.[CGPT_READALOUD_SPEED_STORAGE_KEY]);
  }

  async function saveCgptReadaloudSpeed(next) {
    const sanitized = sanitizeCgptReadaloudSpeed(next);
    await storageSet(chrome.storage.sync, { [CGPT_READALOUD_SPEED_STORAGE_KEY]: sanitized });
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

      const hotkeysText = formatHotkeys(def.hotkeys);
      const hotkeys = document.createElement('div');
      hotkeys.className = 'triSub triHotkeys';
      hotkeys.textContent = hotkeysText ? `快捷键：${hotkeysText}` : '';

      btn.appendChild(name);
      btn.appendChild(sub);
      if (hotkeysText) btn.appendChild(hotkeys);
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

  function addPanelHotkeys(moduleId) {
    const def = MODULES[moduleId];
    if (!def) return;
    const hotkeysText = formatHotkeys(def.hotkeys);
    if (!hotkeysText) return;
    const s = document.createElement('div');
    s.className = 'panelSubtitle';
    s.textContent = `快捷键：${hotkeysText}`;
    elModuleSettings.appendChild(s);
  }

  function addPanelDivider() {
    const d = document.createElement('div');
    d.className = 'panelGroup';
    elModuleSettings.appendChild(d);
  }

  function renderQuickNavModuleSettings(siteId) {
    addPanelTitle('QuickNav', '该模块负责对话导航面板、📌标记点、收藏夹、防自动滚动与快捷键。');
    addPanelHotkeys('quicknav');
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
    addPanelHotkeys('chatgpt_perf');
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
    addPanelHotkeys('gemini_math_fix');
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

  function renderChatGPTThinkingToggleModuleSettings(siteId) {
    addPanelTitle('ChatGPT 推理强度快捷切换', '在 chatgpt.com 使用 ⌘O 切换：Light ↔ Heavy / Standard ↔ Extended。');
    addPanelHotkeys('chatgpt_thinking_toggle');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_thinking_toggle');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_thinking_toggle = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '提示：该模块会在页面主世界（MAIN world）监听 ⌘O，并在发送成功后右下角弹窗显示实际使用的 thinking_effort。关闭模块后已打开页面可能需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTCmdEnterSendModuleSettings(siteId) {
    addPanelTitle('ChatGPT ⌘Enter 发送', '把 Enter/Shift+Enter 变为换行，⌘/Ctrl+Enter 才发送消息。');
    addPanelHotkeys('chatgpt_cmdenter_send');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_cmdenter_send');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_cmdenter_send = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '注意：开启后会拦截输入框 Enter 行为（只允许 ⌘/Ctrl+Enter 发送）。若你习惯 Enter 直接发送，请不要开启。';
    elModuleSettings.appendChild(hint);
  }

  async function renderChatGPTReadaloudSpeedControllerModuleSettings(siteId, token) {
    addPanelTitle('ChatGPT 朗读速度控制器', '控制 ChatGPT “朗读/Read aloud”音频播放速度（HTMLAudioElement.playbackRate）。');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_readaloud_speed_controller');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_readaloud_speed_controller = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    let speed;
    try {
      speed = await loadCgptReadaloudSpeed();
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

    const rowSpeed = document.createElement('label');
    rowSpeed.className = 'formRow';
    const leftSpeed = document.createElement('span');
    leftSpeed.textContent = '朗读速度倍速（0.01–100）';
    const inputSpeed = document.createElement('input');
    inputSpeed.type = 'number';
    inputSpeed.min = String(CGPT_READALOUD_SPEED_MIN);
    inputSpeed.max = String(CGPT_READALOUD_SPEED_MAX);
    inputSpeed.step = '0.01';
    inputSpeed.value = String(speed);
    inputSpeed.addEventListener('change', async () => {
      const next = Number(inputSpeed.value);
      setStatus('正在保存模块设置…');
      try {
        speed = await saveCgptReadaloudSpeed(next);
        inputSpeed.value = String(speed);
        setStatus('模块设置已保存', 'ok');
      } catch (e) {
        inputSpeed.value = String(speed);
        setStatus(`模块设置保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      }
    });
    rowSpeed.appendChild(leftSpeed);
    rowSpeed.appendChild(inputSpeed);
    elModuleSettings.appendChild(rowSpeed);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn secondary';
    resetBtn.textContent = '恢复默认速度（1.8x）';
    resetBtn.addEventListener('click', async () => {
      setStatus('正在恢复模块默认…');
      resetBtn.disabled = true;
      try {
        await saveCgptReadaloudSpeed(CGPT_READALOUD_SPEED_DEFAULT);
        renderAll();
        setStatus('已恢复默认速度', 'ok');
      } catch (e) {
        setStatus(`恢复失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        resetBtn.disabled = false;
      }
    });
    elModuleSettings.appendChild(resetBtn);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '说明：该模块会监听 audio 的 play/ratechange，并保持你设置的倍速；修改后无需刷新，正在播放的音频会自动更新。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTDownloadFileFixModuleSettings(siteId) {
    addPanelTitle('ChatGPT 下载修复', '修复 chatgpt.com 下载文件失败：自动解码 download URL 的 sandbox_path。');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_download_file_fix');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_download_file_fix = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：该模块会在页面主世界（MAIN world）拦截 fetch / XMLHttpRequest 的 GET 请求，仅对 /backend-api/conversation/.../interpreter/download 且包含 sandbox_path 的 URL 进行修复。关闭模块后已打开页面可能需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTStrongHighlightLiteModuleSettings(siteId) {
    addPanelTitle('ChatGPT 回复粗体高亮（Lite）', '高亮 ChatGPT 回复中的粗体文字，并隐藏底部免责声明提示。');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_strong_highlight_lite');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_strong_highlight_lite = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '说明：暗色主题下把 .markdown strong 设为亮绿；亮色主题（.light）下设为紫色；并通过 CSS 隐藏底部 “ChatGPT can make mistakes...” 免责声明。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTQuickDeepSearchModuleSettings(siteId) {
    addPanelTitle(
      'ChatGPT 快捷深度搜索（自用版）',
      '提供 “译 / 搜 / 思” 按钮（优先放在输入框右侧；找不到时回退为可拖动悬浮按钮），并支持快捷键触发。'
    );
    addPanelHotkeys('chatgpt_quick_deep_search');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_quick_deep_search');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_quick_deep_search = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：该模块会在页面主世界（MAIN world）拦截 fetch，把 “译/搜/思” 触发的下一次 /backend-api/conversation（含 /backend-api/f/conversation）请求的 body.model 强制改为 gpt-5。关闭模块后已打开页面可能需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTHideFeedbackButtonsModuleSettings(siteId) {
    addPanelTitle('ChatGPT 隐藏点赞/点踩', '隐藏 ChatGPT 回复下方的反馈按钮（点赞 / 点踩）。');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_hide_feedback_buttons');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_hide_feedback_buttons = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：该模块通过 CSS 隐藏 button[data-testid="good-response-turn-action-button"] 和 button[data-testid="bad-response-turn-action-button"]。若关闭模块，已打开页面可能需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTTexCopyQuoteModuleSettings(siteId) {
    addPanelTitle('ChatGPT TeX Copy & Quote', '增强 ChatGPT 的复制/引用：优先复制 KaTeX 的原始 LaTeX。');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_tex_copy_quote');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_tex_copy_quote = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：该模块在页面主世界（MAIN world）重载 Range/Selection 的复制逻辑：选区中遇到 .katex 会读取 annotation 还原为 $...$ / $$...$$。交互：悬停公式 0.8s 显示 LaTeX 提示，双击公式复制 LaTeX 并弹出提示。关闭模块后已打开页面可能需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderGensparkMoaImageAutosettingsModuleSettings(siteId) {
    addPanelTitle('Genspark 绘图默认设置', '仅在绘图页面生效：进入页面自动打开 Setting，并自动选择 2K 画质。');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'genspark_moa_image_autosettings');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].genspark_moa_image_autosettings = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：该模块只在 https://www.genspark.ai/agents?type=moa_generate_image 生效；会尽量通过按钮文本/aria-label/弹窗选项等启发式方式打开设置并选择 2K。若关闭模块，已打开页面可能需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderGensparkCreditBalanceModuleSettings(siteId) {
    addPanelTitle('Genspark 积分余量', '悬停页面上的小蓝点显示积分余量信息；支持折叠/展开、强制刷新、每分钟自动刷新。');
    addPanelDivider();

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'genspark_credit_balance');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].genspark_credit_balance = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：该模块在 https://www.genspark.ai/* 生效；右上角会出现一个可拖动的小蓝点，鼠标悬停时展示积分信息窗口；窗口位置会跟随蓝点。';
    elModuleSettings.appendChild(hint);

    const credit = document.createElement('div');
    credit.className = 'smallHint';
    credit.textContent = '原作者：LinuxDo 悟空';
    elModuleSettings.appendChild(credit);
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
    if (moduleId === 'chatgpt_thinking_toggle') return renderChatGPTThinkingToggleModuleSettings(siteId);
    if (moduleId === 'chatgpt_cmdenter_send') return renderChatGPTCmdEnterSendModuleSettings(siteId);
    if (moduleId === 'chatgpt_readaloud_speed_controller') return void renderChatGPTReadaloudSpeedControllerModuleSettings(siteId, token);
    if (moduleId === 'chatgpt_download_file_fix') return renderChatGPTDownloadFileFixModuleSettings(siteId);
    if (moduleId === 'chatgpt_strong_highlight_lite') return renderChatGPTStrongHighlightLiteModuleSettings(siteId);
    if (moduleId === 'chatgpt_quick_deep_search') return renderChatGPTQuickDeepSearchModuleSettings(siteId);
    if (moduleId === 'chatgpt_hide_feedback_buttons') return renderChatGPTHideFeedbackButtonsModuleSettings(siteId);
    if (moduleId === 'chatgpt_tex_copy_quote') return renderChatGPTTexCopyQuoteModuleSettings(siteId);
    if (moduleId === 'gemini_math_fix') return renderGeminiMathFixModuleSettings(siteId);
    if (moduleId === 'genspark_moa_image_autosettings') return renderGensparkMoaImageAutosettingsModuleSettings(siteId);
    if (moduleId === 'genspark_credit_balance') return renderGensparkCreditBalanceModuleSettings(siteId);

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
      next.siteModules[s.id] = {};
      for (const modId of s.modules) next.siteModules[s.id][modId] = true;
    }
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
