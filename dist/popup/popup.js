(() => {
  'use strict';

  const REPO = 'lueluelue2006/ai-chat-extension-collection';
  const AUTHOR = 'lueluelue2006';
  const REPO_URL = `https://github.com/${REPO}`;
  const RAW_MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/dist/manifest.json`;
  const SHOW_DESCRIPTIONS = false;

  const UI_THEME_OVERRIDE_KEY = 'aichat_ai_shortcuts_ui_theme_override_v1';

  function applyUiThemeOverride() {
    try {
      const v = String(window.localStorage.getItem(UI_THEME_OVERRIDE_KEY) || '').trim();
      const theme = v === 'dark' || v === 'light' ? v : '';
      if (theme) document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
    } catch {}
  }

  applyUiThemeOverride();

  const elAuthor = document.getElementById('author');
  const elVersion = document.getElementById('version');
  const elStatus = document.getElementById('status');
  const elGlobalStateLabel = document.getElementById('globalStateLabel');
  const elActiveModuleCount = document.getElementById('activeModuleCount');
  const elActiveMenuCount = document.getElementById('activeMenuCount');
  const elSiteContextLabel = document.getElementById('siteContextLabel');
  const elWorkspaceSummary = document.getElementById('workspaceSummary');
  const btnCheck = document.getElementById('checkUpdate');
  const btnOpen = document.getElementById('openRepo');
  const btnOptions = document.getElementById('openOptions');
  const elGpt53AlertCard = document.getElementById('gpt53AlertCard');
  const elGpt53AlertText = document.getElementById('gpt53AlertText');
  const btnGpt53AlertOpenOptions = document.getElementById('gpt53AlertOpenOptions');
  const btnGpt53AlertMarkRead = document.getElementById('gpt53AlertMarkRead');
  const elSiteName = document.getElementById('siteName');
  const elSiteUrl = document.getElementById('siteUrl');
  const elToggleList = document.getElementById('toggleList');

  const REGISTRY = (() => {
    try {
      return globalThis.AISHORTCUTS_REGISTRY || null;
    } catch {
      return null;
    }
  })();
  const SITE_DEFS = Array.isArray(REGISTRY?.sites) ? REGISTRY.sites : [];
  const MODULE_DEFS = REGISTRY?.modules && typeof REGISTRY.modules === 'object' ? REGISTRY.modules : {};
  const MODULE_ALIASES = REGISTRY?.moduleAliases && typeof REGISTRY.moduleAliases === 'object' ? REGISTRY.moduleAliases : {};
  const CHATGPT_MODULE_ORDER = Object.freeze([
    'quicknav',
    'cmdenter_send',
    'chatgpt_thinking_toggle',
    'chatgpt_reply_timer',
    'chatgpt_usage_monitor',
    'chatgpt_quick_deep_search',
    'chatgpt_export_conversation',
    'chatgpt_readaloud_speed_controller',
    'chatgpt_tex_copy_quote',
    'chatgpt_strong_highlight_lite',
    'chatgpt_image_message_edit',
    'chatgpt_message_tree',
    'chatgpt_download_file_fix',
    'chatgpt_sidebar_header_fix',
    'chatgpt_hide_feedback_buttons',
    'chatgpt_perf',
    'openai_new_model_banner'
  ]);
  const REGISTRY_OK = !!(SITE_DEFS.length && Object.keys(MODULE_DEFS).length);

  function setStatus(text, kind = '') {
    elStatus.textContent = text || '';
    elStatus.classList.remove('ok', 'warn', 'err');
    if (kind) elStatus.classList.add(kind);
  }

  if (!REGISTRY_OK) setStatus('脚本注册表缺失：shared/registry.js 未加载（请刷新扩展或重装）', 'err');

  function toCanonicalModuleId(input) {
    let current = String(input || '').trim();
    if (!current) return '';
    const visited = new Set();
    while (current && !visited.has(current)) {
      visited.add(current);
      const next = String(MODULE_ALIASES?.[current] || '').trim();
      if (!next || next === current) break;
      current = next;
    }
    return current;
  }

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
    const raw = String(url || '').trim();
    if (!raw) return;
    let parsed = null;
    try {
      parsed = new URL(raw);
    } catch {
      parsed = null;
    }
    const proto = String(parsed?.protocol || '').toLowerCase();
    if (proto !== 'https:' && proto !== 'chrome-extension:') {
      setStatus(`已拦截不安全链接：${raw}`, 'warn');
      return;
    }
    try {
      chrome.tabs.create({ url: raw });
    } catch {
      window.open(raw, '_blank', 'noopener,noreferrer');
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

  function buildOptionsDeepLink(siteId, moduleId) {
    const base = chrome?.runtime?.getURL?.('options/options.html') || 'options/options.html';
    const params = new URLSearchParams();
    const site = String(siteId || '').trim();
    const mod = toCanonicalModuleId(moduleId);
    if (site) params.set('site', site);
    if (mod) params.set('module', mod);
    const hash = params.toString();
    return hash ? `${base}#${hash}` : base;
  }

  function openOptionsTo(siteId, moduleId) {
    try {
      const hasHash = !!(String(siteId || '').trim() || String(moduleId || '').trim());
      if (!hasHash && chrome?.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        return;
      }
      openUrl(buildOptionsDeepLink(siteId, moduleId));
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

  function formatGpt53AlertLine(ev) {
    try {
      const url = String(ev?.url || '');
      const status = Number(ev?.status) || 0;
      const u = new URL(url);
      const name = String(u.pathname || '').split('/').filter(Boolean).slice(-1)[0] || u.hostname;
      return status ? `${name}（${status}）` : name;
    } catch {
      const status = Number(ev?.status) || 0;
      return status ? `（${status}）` : '';
    }
  }

  function renderGpt53AlertCard(alerts) {
    if (!elGpt53AlertCard || !elGpt53AlertText) return;
    const unread = Number(alerts?.unread) || 0;
    const events = Array.isArray(alerts?.events) ? alerts.events : [];
    if (!unread || !events.length) {
      elGpt53AlertCard.hidden = true;
      elGpt53AlertText.textContent = '';
      return;
    }
    const last = events.slice(-3);
    const parts = last.map((x) => formatGpt53AlertLine(x)).filter(Boolean);
    const more = events.length > 3 ? `…+${events.length - 3}` : '';
    const msg = parts.length ? `${parts.join('，')}${more}` : '';
    elGpt53AlertText.textContent = `检测到 ${unread} 条资源可访问（每次检测都会提醒）：${msg}`;
    elGpt53AlertCard.hidden = false;
  }

  async function refreshGpt53AlertCard() {
    try {
      const resp = await sendRuntimeMessage({ type: 'AISHORTCUTS_GPT53_GET_STATUS' });
      if (!resp || resp.ok !== true) return;
      renderGpt53AlertCard(resp.alerts);
    } catch {}
  }

  async function getSettings() {
    const resp = await sendRuntimeMessage({ type: 'AISHORTCUTS_GET_SETTINGS' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to get settings');
    return resp.settings;
  }

  async function setSettings(settings) {
    const resp = await sendRuntimeMessage({ type: 'AISHORTCUTS_SET_SETTINGS', settings });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to save settings');
    return resp.settings;
  }

  async function patchSettings(patch) {
    const resp = await sendRuntimeMessage({ type: 'AISHORTCUTS_PATCH_SETTINGS', patch });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to patch settings');
    return resp.settings;
  }

  function cloneJsonSafe(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return null;
    }
  }

  function buildPatchFromSettingsDiff(prev, next) {
    const out = [];
    const a = prev && typeof prev === 'object' ? prev : {};
    const b = next && typeof next === 'object' ? next : {};

    if (typeof b.enabled === 'boolean' && b.enabled !== !!a.enabled) out.push({ op: 'set', path: ['enabled'], value: b.enabled });

    const siteIds = SITE_DEFS.map((s) => s.id).filter((id) => typeof id === 'string' && id);
    for (const siteId of siteIds) {
      const aSites = a?.sites && typeof a.sites === 'object' ? a.sites : {};
      const bSites = b?.sites && typeof b.sites === 'object' ? b.sites : {};
      if (typeof bSites?.[siteId] === 'boolean' && bSites[siteId] !== aSites?.[siteId]) {
        out.push({ op: 'set', path: ['sites', siteId], value: bSites[siteId] });
      }

      const aMods = a?.siteModules?.[siteId] && typeof a.siteModules[siteId] === 'object' ? a.siteModules[siteId] : {};
      const bMods = b?.siteModules?.[siteId] && typeof b.siteModules[siteId] === 'object' ? b.siteModules[siteId] : {};
      const keys = new Set([...Object.keys(aMods), ...Object.keys(bMods)]);
      for (const key of keys) {
        const av = aMods?.[key];
        const bv = bMods?.[key];
        if (typeof bv !== 'boolean') continue;
        if (bv !== av) out.push({ op: 'set', path: ['siteModules', siteId, key], value: bv });
      }
    }
    return out;
  }

  function escapeRegExp(s) {
    return String(s || '').replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }

  function wildcardToRegExp(pattern) {
    return new RegExp(`^${escapeRegExp(pattern).replace(/\*/g, '.*')}$`);
  }

  function parseMatchPattern(pattern) {
    const s = String(pattern || '').trim();
    const m = s.match(/^(\*|http|https|file|ftp|chrome-extension):\/\/([^/]+)(\/.*)$/i);
    if (!m) return null;
    return { scheme: String(m[1]).toLowerCase(), host: String(m[2]).toLowerCase(), path: String(m[3]) };
  }

  function matchHost(host, patternHost) {
    const h = String(host || '').toLowerCase();
    const ph = String(patternHost || '').toLowerCase();
    if (!h || !ph) return false;
    if (ph === '*') return true;
    if (ph.startsWith('*.')) {
      const base = ph.slice(2);
      if (!base) return false;
      return h === base || h.endsWith(`.${base}`);
    }
    if (ph.includes('*')) return wildcardToRegExp(ph).test(h);
    return h === ph;
  }

  function matchPath(pathAndSearch, patternPath) {
    const p = String(pathAndSearch || '');
    const pp = String(patternPath || '');
    if (!p || !pp) return false;
    if (pp === '/*') return true;
    return wildcardToRegExp(pp).test(p);
  }

  function matchesUrlPattern(urlObj, pattern) {
    const pat = parseMatchPattern(pattern);
    if (!pat || !urlObj) return false;

    const proto = String(urlObj.protocol || '').replace(/:$/, '').toLowerCase();
    if (pat.scheme === '*') {
      if (proto !== 'http' && proto !== 'https') return false;
    } else if (proto !== pat.scheme) return false;

    const host = String(urlObj.hostname || '').toLowerCase();
    if (!matchHost(host, pat.host)) return false;

    const pathAndSearch = `${urlObj.pathname || ''}${urlObj.search || ''}`;
    return matchPath(pathAndSearch, pat.path);
  }

  function getSiteIdFromUrl(url) {
    let u = null;
    try {
      u = new URL(String(url || ''));
    } catch {
      u = null;
    }
    if (!u) return null;

    // Registry-driven matching (preferred).
    if (REGISTRY_OK) {
      let bestSiteId = null;
      let bestScore = -1;
      for (const s of SITE_DEFS) {
        const siteId = String(s?.id || '');
        if (!siteId || siteId === 'common') continue;
        const patterns = [...(Array.isArray(s?.matchPatterns) ? s.matchPatterns : []), ...(Array.isArray(s?.quicknavPatterns) ? s.quicknavPatterns : [])]
          .map((x) => String(x || '').trim())
          .filter(Boolean);
        for (const p of patterns) {
          if (!matchesUrlPattern(u, p)) continue;
          const score = p.replace(/\*/g, '').length;
          if (score > bestScore) {
            bestScore = score;
            bestSiteId = siteId;
          }
        }
      }
      if (bestSiteId) return bestSiteId;
    }

    // Fallback for safety if registry is missing.
    try {
      const host = String(u.hostname || '').toLowerCase();
      if (host === 'chatgpt.com') return 'chatgpt';
      if (host === 'chat.qwen.ai') return 'qwen';
    } catch {}
    return null;
  }

  function getSiteDef(siteId) {
    return SITE_DEFS.find((s) => s.id === siteId) || null;
  }

  function getModuleDef(moduleId) {
    return MODULE_DEFS[moduleId] || { name: moduleId, sub: '' };
  }

  function shortenChatGPTModuleName(name) {
    return String(name || '').replace(/^ChatGPT\s+/i, '').trim();
  }

  function getModuleDisplayMeta(siteId, moduleId) {
    const def = getModuleDef(moduleId);
    let name = String(def?.name || moduleId || '').trim();
    const sub = String(def?.sub || '').trim();
    if (siteId === 'chatgpt') name = shortenChatGPTModuleName(name);
    return { name, sub };
  }

  function getModuleSortWeight(siteId, item) {
    if (siteId === 'chatgpt') {
      const orderIdx = CHATGPT_MODULE_ORDER.indexOf(item.id);
      return orderIdx >= 0 ? orderIdx : 1000 + item.idx;
    }
    return item.hasMenu ? -1000 + item.idx : item.idx;
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

  function tabsSendMessage(tabId, msg, options = { frameId: 0 }) {
    return new Promise((resolve, reject) => {
      try {
        // IMPORTANT: force top-frame response for stable menu discovery/execution.
        // Without forcing `frameId: 0`, `sendMessage` may respond from an iframe (often `about:blank`)
        // which breaks menu discovery/execution.
        chrome.tabs.sendMessage(tabId, msg, options, (resp) => {
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

  function createToggleRow({ main, sub, checked, disabled, onChange, onDetails }) {
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

    if (typeof onDetails === 'function') {
      const actions = document.createElement('div');
      actions.className = 'toggleRowActions';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rowIconBtn';
      btn.title = '打开配置（定位到该脚本）';
      btn.textContent = '⋯';
      btn.addEventListener('click', (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch {}
        Promise.resolve()
          .then(() => onDetails())
          .catch(() => void 0);
      });
      actions.appendChild(btn);
      row.appendChild(actions);
    }

    input.addEventListener('change', () => {
      Promise.resolve()
        .then(() => onChange?.(input.checked))
        .catch(() => void 0);
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
      btn.addEventListener('click', () => {
        Promise.resolve()
          .then(() => onRun(c))
          .catch(() => void 0);
      });
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

  function resolveMenuModuleId(command, activeSiteId) {
    const moduleId = toCanonicalModuleId(command?.moduleId);
    if (moduleId && MODULE_DEFS[moduleId]) return moduleId;
    return mapGroupToModuleId(command?.group, activeSiteId);
  }

  function buildMenuByModule(commands, activeSiteId) {
    const byModule = {};
    const unmapped = [];
    for (const c of Array.isArray(commands) ? commands : []) {
      if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') continue;
      const moduleId = resolveMenuModuleId(c, activeSiteId);
      // QuickNav 维护操作已移到配置页执行，弹窗里不再展示（避免菜单过长）。
      if (moduleId === 'quicknav' || /QuickNav/.test(String(c.group || ''))) continue;
      if (!moduleId) {
        unmapped.push(c);
        continue;
      }
      if (!byModule[moduleId]) byModule[moduleId] = [];
      byModule[moduleId].push(c);
    }
    return { byModule, unmapped };
  }

  function countEnabledModulesForPopup(settings, activeSiteId) {
    if (settings?.enabled === false) return 0;
    let total = 0;
    const collect = (siteId, modules) => {
      if (!Array.isArray(modules)) return;
      for (const moduleId of modules) {
        if (settings?.siteModules?.[siteId]?.[moduleId] !== false) total += 1;
      }
    };

    const commonDef = getSiteDef('common');
    if (commonDef && settings?.sites?.common !== false) collect('common', commonDef.modules);

    if (activeSiteId && activeSiteId !== 'common') {
      const siteDef = getSiteDef(activeSiteId);
      if (siteDef && settings?.sites?.[activeSiteId] !== false) collect(activeSiteId, siteDef.modules);
    }

    return total;
  }

  function countVisibleMenuCommands(menuByModule, unmappedMenu) {
    let total = 0;
    for (const list of Object.values(menuByModule || {})) {
      if (Array.isArray(list)) total += list.length;
    }
    if (Array.isArray(unmappedMenu)) total += unmappedMenu.length;
    return total;
  }

  function renderHeroSummary({ settings, activeSiteId, menuByModule, unmappedMenu }) {
    const siteDef = activeSiteId ? getSiteDef(activeSiteId) : null;
    const enabledModules = countEnabledModulesForPopup(settings, activeSiteId);
    const menuCount = countVisibleMenuCommands(menuByModule, unmappedMenu);

    if (elActiveModuleCount) elActiveModuleCount.textContent = String(enabledModules);
    if (elActiveMenuCount) elActiveMenuCount.textContent = String(menuCount);

    if (elSiteContextLabel) {
      if (settings?.enabled === false) elSiteContextLabel.textContent = '扩展总开关已关闭，当前页面不会执行脚本';
      else if (!siteDef) elSiteContextLabel.textContent = '当前页面未接入可控模块';
      else elSiteContextLabel.textContent = String(siteDef.sub || '当前页面已接入控制台');
    }

    if (elGlobalStateLabel) {
      if (settings?.enabled === false) elGlobalStateLabel.textContent = '总开关关闭';
      else if (!siteDef) elGlobalStateLabel.textContent = '未接入站点';
      else if (settings?.sites?.[activeSiteId] === false) elGlobalStateLabel.textContent = `${siteDef.name} 已停用`;
      else elGlobalStateLabel.textContent = '脚本就绪';
    }

    if (elWorkspaceSummary) {
      if (!siteDef) {
        elWorkspaceSummary.textContent = '当前标签页没有接入可控脚本，只保留基础入口。';
      } else if (menuCount > 0) {
        elWorkspaceSummary.textContent = `当前页面可直接运行 ${menuCount} 个菜单动作，并可切换 ${enabledModules} 个启用模块。`;
      } else {
        elWorkspaceSummary.textContent = `当前页面没有暴露菜单动作；你仍可切换 ${enabledModules} 个启用模块。`;
      }
    }
  }

  function renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate, onRunMenu }) {
    clearEl(elToggleList);
    renderHeroSummary({ settings, activeSiteId, menuByModule, unmappedMenu });
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
        const display = getModuleDisplayMeta('common', moduleId);
        group.appendChild(
          createToggleRow({
            main: display.name || def.name,
            sub: display.sub || def.sub,
            checked: settings?.siteModules?.common?.[moduleId] !== false,
            disabled: !settings?.enabled || settings?.sites?.common === false,
            onChange: (v) => onMutate((draft) => { draft.siteModules.common[moduleId] = !!v; }),
            onDetails: () => openOptionsTo('common', moduleId)
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
        const wa = getModuleSortWeight(activeSiteId, a);
        const wb = getModuleSortWeight(activeSiteId, b);
        if (wa !== wb) return wa - wb;
        return a.idx - b.idx;
      })
      .map((x) => x.id);

    for (const moduleId of orderedModules) {
      const def = getModuleDef(moduleId);
      const display = getModuleDisplayMeta(activeSiteId, moduleId);
      const row = createToggleRow({
        main: display.name || def.name,
        sub: display.sub || def.sub,
        checked: settings?.siteModules?.[activeSiteId]?.[moduleId] !== false,
        disabled: !settings?.enabled || settings?.sites?.[activeSiteId] === false,
        onChange: (v) => onMutate((draft) => { draft.siteModules[activeSiteId][moduleId] = !!v; }),
        onDetails: () => openOptionsTo(activeSiteId, moduleId)
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
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : 0;
    const resp = await fetch(url, { cache: 'no-store', ...(ctrl ? { signal: ctrl.signal } : {}) });
    if (timer) clearTimeout(timer);
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
      if (!remoteVersion) throw new Error('远端 dist/manifest.json 没有 version 字段');

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
  btnOptions?.addEventListener('click', () => openOptionsTo('', ''));
  btnGpt53AlertOpenOptions?.addEventListener('click', () => openOptionsTo('', ''));
  btnGpt53AlertMarkRead?.addEventListener('click', async () => {
    if (btnGpt53AlertMarkRead) btnGpt53AlertMarkRead.disabled = true;
    try {
      await sendRuntimeMessage({ type: 'AISHORTCUTS_GPT53_MARK_READ' });
      await refreshGpt53AlertCard();
      setStatus('已清除 OpenAI 新模型提示', 'ok');
    } catch (e) {
      setStatus(`清除提示失败：${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      if (btnGpt53AlertMarkRead) btnGpt53AlertMarkRead.disabled = false;
    }
  });

  // Show alerts as soon as the popup opens.
  void refreshGpt53AlertCard();
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      try {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type !== 'AISHORTCUTS_GPT53_ALERT') return;
        void refreshGpt53AlertCard();
      } catch {}
    });
  } catch {}

  // Per-site toggles + menu (Tampermonkey-like)
  (async () => {
    try {
      const tab = await tabsQueryActive();
      const tabId = tab?.id;
      if (!Number.isFinite(tabId)) throw new Error('No active tab');

      // Prefer asking injected menu for href (works even if tabs.url is unavailable)
      let menuResp = null;
      try {
        menuResp = await tabsSendMessage(tabId, { type: 'AISHORTCUTS_GET_MENU' });
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
          const resp = await tabsSendMessage(tabId, { type: 'AISHORTCUTS_GET_MENU' });
          if (!resp || resp.ok !== true) return { byModule: {}, unmapped: [] };
          return buildMenuByModule(resp.commands, activeSiteId);
        } catch {
          return { byModule: {}, unmapped: [] };
        }
      }

      let saveChain = Promise.resolve();
      let menuRefreshTimer = 0;
      let menuRefreshSeq = 0;
      let menuRefreshAppliedSeq = 0;

      function clearPendingMenuRefresh() {
        if (!menuRefreshTimer) return;
        clearTimeout(menuRefreshTimer);
        menuRefreshTimer = 0;
      }

      function queueMenuRefresh(delayMs = 300) {
        const seq = ++menuRefreshSeq;
        clearPendingMenuRefresh();
        menuRefreshTimer = setTimeout(async () => {
          menuRefreshTimer = 0;
          const next = await refreshMenu();
          if (seq !== menuRefreshSeq || seq < menuRefreshAppliedSeq) return;
          menuRefreshAppliedSeq = seq;
          menuByModule = next.byModule;
          unmappedMenu = next.unmapped;
          renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate: mutateSettings, onRunMenu });
        }, Math.max(0, Number(delayMs) || 0));
      }

      function enqueueSave(fn) {
        saveChain = saveChain
          .catch(() => void 0)
          .then(() => fn());
        return saveChain;
      }

      async function mutateSettings(mutator) {
        return enqueueSave(async () => {
          const draft = cloneJsonSafe(settings);
          if (!draft) throw new Error('Failed to clone settings');
          try {
            mutator(draft);
          } catch {}

          const patch = buildPatchFromSettingsDiff(settings, draft);
          if (!patch.length) return;

          setStatus('正在保存…');
          try {
            settings = await patchSettings(patch);
          } catch (e) {
            setStatus(`保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
            return;
          }

          setStatus('已保存', 'ok');
          renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate: mutateSettings, onRunMenu });
          queueMenuRefresh(300);
        });
      }

      async function onRunMenu(cmd) {
        try {
          setStatus(`正在执行：${cmd.name}…`);
          const resp = await tabsSendMessage(tabId, { type: 'AISHORTCUTS_RUN_MENU', id: cmd.id });
          if (resp && resp.ok === true) setStatus(`已执行：${cmd.name}`, 'ok');
          else setStatus(`执行失败：${resp?.error || 'unknown'}`, 'err');
        } catch (e) {
          setStatus(`执行失败：${e instanceof Error ? e.message : String(e)}`, 'err');
        }
      }

      renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate: mutateSettings, onRunMenu });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`初始化菜单失败：${msg}`, 'warn');
    }
  })();
})();
