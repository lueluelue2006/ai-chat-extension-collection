(() => {
  'use strict';

  const REPO = 'lueluelue2006/ai-chat-extension-collection';
  const AUTHOR = 'lueluelue2006';
  const REPO_URL = `https://github.com/${REPO}`;
  const RAW_MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/manifest.json`;
  const SHOW_DESCRIPTIONS = false;

  const elAuthor = document.getElementById('author');
  const elVersion = document.getElementById('version');
  const elStatus = document.getElementById('status');
  const btnCheck = document.getElementById('checkUpdate');
  const btnOpen = document.getElementById('openRepo');
  const btnOptions = document.getElementById('openOptions');
  const elSiteName = document.getElementById('siteName');
  const elSiteUrl = document.getElementById('siteUrl');
  const elToggleList = document.getElementById('toggleList');

  const REGISTRY = (() => {
    try {
      return globalThis.QUICKNAV_REGISTRY || null;
    } catch {
      return null;
    }
  })();
  const SITE_DEFS = Array.isArray(REGISTRY?.sites) ? REGISTRY.sites : [];
  const MODULE_DEFS = REGISTRY?.modules && typeof REGISTRY.modules === 'object' ? REGISTRY.modules : {};
  const REGISTRY_OK = !!(SITE_DEFS.length && Object.keys(MODULE_DEFS).length);

  function setStatus(text, kind = '') {
    elStatus.textContent = text || '';
    elStatus.classList.remove('ok', 'warn', 'err');
    if (kind) elStatus.classList.add(kind);
  }

  if (!REGISTRY_OK) setStatus('脚本注册表缺失：shared/registry.js 未加载（请刷新扩展或重装）', 'err');

  function parseSemver(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    const core = s.split('-')[0].split('+')[0];
    const parts = core.split('.').map((p) => {
      const m = String(p).match(/^\d+/);
      return m ? Number(m[0]) : 0;
    });
    if (!parts.length) return null;
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
  }

  function cmpSemver(a, b) {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    if (!pa || !pb) return 0;
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  function openUrl(url) {
    try {
      chrome.tabs.create({ url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function openOptions() {
    try {
      if (chrome?.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        return;
      }
      const url = chrome?.runtime?.getURL?.('options/options.html') || 'options/options.html';
      openUrl(url);
    } catch {
      setStatus('打开配置失败', 'err');
    }
  }

  function sendRuntimeMessage(msg) {
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
    const resp = await sendRuntimeMessage({ type: 'QUICKNAV_GET_SETTINGS' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to get settings');
    return resp.settings;
  }

  async function setSettings(settings) {
    const resp = await sendRuntimeMessage({ type: 'QUICKNAV_SET_SETTINGS', settings });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to save settings');
    return resp.settings;
  }

  function cloneJsonSafe(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return null;
    }
  }

  function getSiteIdFromUrl(url) {
    try {
      const u = new URL(String(url || ''));
      const host = String(u.hostname || '').toLowerCase();
      const path = String(u.pathname || '');
      if (host === 'chatgpt.com') return 'chatgpt';
      if (host === 'ernie.baidu.com') return 'ernie';
      if (host === 'chat.deepseek.com') return 'deepseek';
      if (host === 'chat.qwen.ai') return 'qwen';
      if (host === 'chat.z.ai') return 'zai';
      if (host === 'grok.com') return 'grok';
      if (host === 'gemini.google.com' && path.startsWith('/app')) return 'gemini_app';
      if (host === 'business.gemini.google') return 'gemini_business';
      if (host === 'www.genspark.ai') return 'genspark';
      return null;
    } catch {
      return null;
    }
  }

  function getSiteDef(siteId) {
    return SITE_DEFS.find((s) => s.id === siteId) || null;
  }

  function getModuleDef(moduleId) {
    return MODULE_DEFS[moduleId] || { name: moduleId, sub: '' };
  }

  function tabsQueryActive() {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve((tabs && tabs[0]) || null);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function tabsSendMessage(tabId, msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, msg, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function clearEl(el) {
    if (!el) return;
    try {
      el.replaceChildren();
    } catch {
      while (el.firstChild) el.removeChild(el.firstChild);
    }
  }

  function createToggleRow({ main, sub, checked, disabled, onChange }) {
    const row = document.createElement('div');
    row.className = 'toggleRow';

    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.disabled = !!disabled;

    const textWrap = document.createElement('span');
    textWrap.className = 'labelText';

    const mainEl = document.createElement('span');
    mainEl.className = 'labelMain';
    mainEl.textContent = String(main || '');

    textWrap.appendChild(mainEl);
    if (SHOW_DESCRIPTIONS) {
      const subEl = document.createElement('span');
      subEl.className = 'labelSub';
      subEl.textContent = String(sub || '');
      if (subEl.textContent) textWrap.appendChild(subEl);
    }

    label.appendChild(input);
    label.appendChild(textWrap);
    row.appendChild(label);

    input.addEventListener('change', () => {
      try {
        onChange?.(input.checked);
      } catch {}
    });

    return row;
  }

  function createGroup(title) {
    const group = document.createElement('div');
    group.className = 'toggleGroup';
    const h = document.createElement('div');
    h.className = 'toggleGroupTitle';
    h.textContent = title;
    group.appendChild(h);
    return group;
  }

  function createModuleMenu(cmds, onRun) {
    const wrap = document.createElement('div');
    wrap.className = 'moduleMenu';
    for (const c of cmds || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menuBtn';
      btn.textContent = c.name;
      btn.addEventListener('click', () => onRun(c));
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function mapGroupToModuleId(group, activeSiteId) {
    const g = String(group || '');
    if (/对话导出/.test(g)) return 'chatgpt_export_conversation';
    if (/用量统计/.test(g)) return 'chatgpt_usage_monitor';
    if (/QuickNav/.test(g)) return 'quicknav';
    // Future: map more groups to module ids here.
    return null;
  }

  function buildMenuByModule(commands, activeSiteId) {
    const byModule = {};
    const unmapped = [];
    for (const c of Array.isArray(commands) ? commands : []) {
      if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') continue;
      // QuickNav 维护操作已移到配置页执行，弹窗里不再展示（避免菜单过长）。
      if (/QuickNav/.test(String(c.group || ''))) continue;
      const moduleId = mapGroupToModuleId(c.group, activeSiteId);
      if (!moduleId) {
        unmapped.push(c);
        continue;
      }
      if (!byModule[moduleId]) byModule[moduleId] = [];
      byModule[moduleId].push(c);
    }
    return { byModule, unmapped };
  }

  function renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate, onRunMenu }) {
    clearEl(elToggleList);
    if (!elToggleList) return;

    const globalRow = createToggleRow({
      main: '启用扩展（所有模块）',
      sub: '',
      checked: !!settings?.enabled,
      disabled: false,
      onChange: (v) => onMutate((draft) => { draft.enabled = !!v; })
    });
    elToggleList.appendChild(globalRow);

    const commonDef = getSiteDef('common');
    if (commonDef) {
      const group = createGroup(`${commonDef.name}（${commonDef.sub}）`);
      group.appendChild(
        createToggleRow({
          main: `启用 ${commonDef.name}`,
          sub: commonDef.sub,
          checked: settings?.sites?.common !== false,
          disabled: !settings?.enabled,
          onChange: (v) => onMutate((draft) => { draft.sites.common = !!v; })
        })
      );
      for (const moduleId of commonDef.modules) {
        const def = getModuleDef(moduleId);
        group.appendChild(
          createToggleRow({
            main: def.name,
            sub: def.sub,
            checked: settings?.siteModules?.common?.[moduleId] !== false,
            disabled: !settings?.enabled || settings?.sites?.common === false,
            onChange: (v) => onMutate((draft) => { draft.siteModules.common[moduleId] = !!v; })
          })
        );
      }
      elToggleList.appendChild(group);
    }

    if (!activeSiteId || activeSiteId === 'common') {
      if (Array.isArray(unmappedMenu) && unmappedMenu.length) {
        const other = createGroup('其它菜单');
        other.appendChild(createModuleMenu(unmappedMenu, onRunMenu));
        elToggleList.appendChild(other);
      }
      return;
    }
    const siteDef = getSiteDef(activeSiteId);
    if (!siteDef) return;

    const group = createGroup(`${siteDef.name}（${siteDef.sub}）`);
    group.appendChild(
      createToggleRow({
        main: `启用 ${siteDef.name}`,
        sub: siteDef.sub,
        checked: settings?.sites?.[activeSiteId] !== false,
        disabled: !settings?.enabled,
        onChange: (v) => onMutate((draft) => { draft.sites[activeSiteId] = !!v; })
      })
    );

    const orderedModules = (siteDef.modules || [])
      .map((id, idx) => ({
        id,
        idx,
        hasMenu: !!(menuByModule && Array.isArray(menuByModule[id]) && menuByModule[id].length)
      }))
      .sort((a, b) => {
        if (a.hasMenu !== b.hasMenu) return a.hasMenu ? -1 : 1;
        return a.idx - b.idx;
      })
      .map((x) => x.id);

    for (const moduleId of orderedModules) {
      const def = getModuleDef(moduleId);
      const row = createToggleRow({
        main: def.name,
        sub: def.sub,
        checked: settings?.siteModules?.[activeSiteId]?.[moduleId] !== false,
        disabled: !settings?.enabled || settings?.sites?.[activeSiteId] === false,
        onChange: (v) => onMutate((draft) => { draft.siteModules[activeSiteId][moduleId] = !!v; })
      });
      group.appendChild(row);

      const cmds = menuByModule && Array.isArray(menuByModule[moduleId]) ? menuByModule[moduleId] : [];
      if (cmds.length) group.appendChild(createModuleMenu(cmds, onRunMenu));
    }

    elToggleList.appendChild(group);

    if (Array.isArray(unmappedMenu) && unmappedMenu.length) {
      const other = createGroup('其它菜单');
      other.appendChild(createModuleMenu(unmappedMenu, onRunMenu));
      elToggleList.appendChild(other);
    }
  }

  async function fetchRemoteManifestVersion() {
    const url = `${RAW_MANIFEST_URL}?t=${Date.now()}`;
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return String(json?.version || '').trim();
  }

  async function checkUpdate() {
    const localVersion = chrome?.runtime?.getManifest?.()?.version || '';
    setStatus('正在检查更新…');
    btnCheck.disabled = true;
    try {
      const remoteVersion = await fetchRemoteManifestVersion();
      if (!remoteVersion) throw new Error('远端 manifest.json 没有 version 字段');

      const cmp = cmpSemver(remoteVersion, localVersion);
      if (cmp > 0) {
        setStatus(`发现新版本：v${remoteVersion}\n当前版本：v${localVersion}\n\n打开仓库链接获取最新代码后，在 chrome://extensions 里点“重新加载”。`, 'warn');
        return;
      }
      if (cmp < 0) {
        setStatus(`远端版本：v${remoteVersion}\n当前版本：v${localVersion}\n\n当前版本比远端新（可能在本地开发中）。`, 'ok');
        return;
      }
      setStatus(`已是最新版本：v${localVersion}`, 'ok');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`检查失败：${msg}\n\n你可以直接打开仓库链接手动查看更新。`, 'err');
    } finally {
      btnCheck.disabled = false;
    }
  }

  // init
  try {
    elAuthor.textContent = AUTHOR;
    elVersion.textContent = chrome?.runtime?.getManifest?.()?.version || 'unknown';
    setStatus('就绪');
  } catch {
    setStatus('初始化失败', 'err');
  }

  btnOpen?.addEventListener('click', () => openUrl(REPO_URL));
  btnCheck?.addEventListener('click', checkUpdate);
  btnOptions?.addEventListener('click', openOptions);

  // Per-site toggles + menu (Tampermonkey-like)
  (async () => {
    try {
      const tab = await tabsQueryActive();
      const tabId = tab?.id;
      if (!Number.isFinite(tabId)) throw new Error('No active tab');

      // Prefer asking injected menu for href (works even if tabs.url is unavailable)
      let menuResp = null;
      try {
        menuResp = await tabsSendMessage(tabId, { type: 'QUICKNAV_GET_MENU' });
      } catch {
        menuResp = null;
      }

      const href =
        (menuResp && menuResp.ok === true && typeof menuResp.href === 'string' && menuResp.href) ||
        (typeof tab?.url === 'string' ? tab.url : '') ||
        '';
      const activeSiteId = getSiteIdFromUrl(href);
      const siteDef = activeSiteId ? getSiteDef(activeSiteId) : null;

      if (elSiteName) elSiteName.textContent = siteDef ? siteDef.name : '未支持站点';
      if (elSiteUrl) elSiteUrl.textContent = href ? href.replace(/^https?:\/\//, '') : '';

      let settings = await getSettings();
      let menuByModule = {};
      let unmappedMenu = [];
      try {
        if (menuResp && menuResp.ok === true) {
          const built = buildMenuByModule(menuResp.commands, activeSiteId);
          menuByModule = built.byModule;
          unmappedMenu = built.unmapped;
        }
      } catch {}

      async function refreshMenu() {
        try {
          const resp = await tabsSendMessage(tabId, { type: 'QUICKNAV_GET_MENU' });
          if (!resp || resp.ok !== true) return { byModule: {}, unmapped: [] };
          return buildMenuByModule(resp.commands, activeSiteId);
        } catch {
          return { byModule: {}, unmapped: [] };
        }
      }

      async function mutateSettings(mutator) {
        const draft = cloneJsonSafe(settings);
        if (!draft) throw new Error('Failed to clone settings');
        try {
          mutator(draft);
        } catch {}
        setStatus('正在保存…');
        settings = await setSettings(draft);
        setStatus('已保存', 'ok');
        renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate: mutateSettings, onRunMenu });

        setTimeout(async () => {
          const next = await refreshMenu();
          menuByModule = next.byModule;
          unmappedMenu = next.unmapped;
          renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate: mutateSettings, onRunMenu });
        }, 300);
      }

      async function onRunMenu(cmd) {
        setStatus(`正在执行：${cmd.name}…`);
        const resp = await tabsSendMessage(tabId, { type: 'QUICKNAV_RUN_MENU', id: cmd.id });
        if (resp && resp.ok === true) setStatus(`已执行：${cmd.name}`, 'ok');
        else setStatus(`执行失败：${resp?.error || 'unknown'}`, 'err');
      }

      renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate: mutateSettings, onRunMenu });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`初始化菜单失败：${msg}`, 'warn');
    }
  })();
})();
