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
  const elSiteSearch = document.getElementById('siteSearch');
  const elModuleSearch = document.getElementById('moduleSearch');

  const REGISTRY = (() => {
    try {
      return globalThis.QUICKNAV_REGISTRY || null;
    } catch {
      return null;
    }
  })();
  const SITES = Array.isArray(REGISTRY?.sites) ? REGISTRY.sites : [];
  const MODULES = REGISTRY?.modules && typeof REGISTRY.modules === 'object' ? REGISTRY.modules : {};
  const REGISTRY_OK = !!(SITES.length && Object.keys(MODULES).length);

  const CGPT_PERF_STORAGE_KEY = 'cgpt_perf_mv3_settings_v1';
  const CGPT_PERF_DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    virtualizeOffscreen: true,
    virtualizeMarkdownBlocks: true,
    optimizeHeavyBlocks: true,
    disableAnimations: true,
    disableBackdropFilters: false,
    extremeLite: false,
    boostDuringInput: true,
    unfreezeOnFind: true,
    showOverlay: false,
    rootMarginPx: 1200
  });

  const CGPT_READALOUD_SPEED_STORAGE_KEY = 'aichat_chatgpt_readaloud_speed_v1';
  const CGPT_READALOUD_SPEED_DEFAULT = 1.8;
  const CGPT_READALOUD_SPEED_MIN = 0.01;
  const CGPT_READALOUD_SPEED_MAX = 100;

  const CGPT_USAGE_MONITOR_PLAN_STORAGE_KEY = 'cgpt_usage_monitor_plan_type_v1';
  const CGPT_USAGE_MONITOR_PLAN_DEFAULT = 'team';
  const CGPT_USAGE_MONITOR_PLAN_OPTIONS = Object.freeze([
    ['free', 'Free'],
    ['go', 'Go'],
    ['k12_teacher', 'K12 Teacher'],
    ['plus', 'Plus'],
    ['team', 'Team'],
    ['edu', 'Edu'],
    ['enterprise', 'Enterprise'],
    ['pro', 'Pro']
  ]);

  function setStatus(text, kind = '') {
    if (!elStatus) return;
    elStatus.textContent = text || '';
    elStatus.classList.remove('ok', 'warn', 'err');
    if (kind) elStatus.classList.add(kind);
  }

  if (!REGISTRY_OK) setStatus('脚本注册表缺失：shared/registry.js 未加载（请刷新扩展或重装）', 'err');

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

  function tabsQuery(query) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.query(query, (tabs) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(tabs || []);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function tabsSendMessage(tabId, msg, options = { frameId: 0 }) {
    return new Promise((resolve, reject) => {
      try {
        // IMPORTANT: some modules (e.g. Split View helpers) are injected with `allFrames: true`.
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

  async function patchSettings(patch) {
    const resp = await sendMessage({ type: 'QUICKNAV_PATCH_SETTINGS', patch });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to patch settings');
    return resp.settings;
  }

  async function resetDefaults() {
    const resp = await sendMessage({ type: 'QUICKNAV_RESET_DEFAULTS' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to reset defaults');
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
      disableBackdropFilters:
        typeof s.disableBackdropFilters === 'boolean' ? s.disableBackdropFilters : CGPT_PERF_DEFAULT_SETTINGS.disableBackdropFilters,
      extremeLite: typeof s.extremeLite === 'boolean' ? s.extremeLite : CGPT_PERF_DEFAULT_SETTINGS.extremeLite,
      boostDuringInput:
        typeof s.boostDuringInput === 'boolean' ? s.boostDuringInput : CGPT_PERF_DEFAULT_SETTINGS.boostDuringInput,
      unfreezeOnFind: typeof s.unfreezeOnFind === 'boolean' ? s.unfreezeOnFind : CGPT_PERF_DEFAULT_SETTINGS.unfreezeOnFind,
      showOverlay: typeof s.showOverlay === 'boolean' ? s.showOverlay : CGPT_PERF_DEFAULT_SETTINGS.showOverlay,
      rootMarginPx: Number.isFinite(Number(s.rootMarginPx)) ? Math.max(0, Number(s.rootMarginPx)) : CGPT_PERF_DEFAULT_SETTINGS.rootMarginPx
    };
  }

  function sanitizeCgptReadaloudSpeed(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return CGPT_READALOUD_SPEED_DEFAULT;
    return Math.max(CGPT_READALOUD_SPEED_MIN, Math.min(CGPT_READALOUD_SPEED_MAX, n));
  }

  function sanitizeCgptUsageMonitorPlanType(raw) {
    const s = String(raw || '').trim();
    const found = CGPT_USAGE_MONITOR_PLAN_OPTIONS.find(([key]) => key === s)?.[0];
    return found || CGPT_USAGE_MONITOR_PLAN_DEFAULT;
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

  async function loadCgptUsageMonitorPlanType() {
    const res = await storageGet(chrome.storage.sync, { [CGPT_USAGE_MONITOR_PLAN_STORAGE_KEY]: CGPT_USAGE_MONITOR_PLAN_DEFAULT });
    return sanitizeCgptUsageMonitorPlanType(res?.[CGPT_USAGE_MONITOR_PLAN_STORAGE_KEY]);
  }

  async function saveCgptUsageMonitorPlanType(next) {
    const sanitized = sanitizeCgptUsageMonitorPlanType(next);
    await storageSet(chrome.storage.sync, { [CGPT_USAGE_MONITOR_PLAN_STORAGE_KEY]: sanitized });
    return sanitized;
  }

  function openUrlSafe(url) {
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

  let saveSeq = 0;
  let renderSeq = 0;
  let currentSettings = null;
  let selectedSiteId = SITES[0]?.id || 'chatgpt';
  let selectedModuleId = 'quicknav';
  let siteSearchText = '';
  let moduleSearchText = '';

  function normalizeSearchText(s) {
    return String(s || '').trim().toLowerCase();
  }

  function siteMatchesSearch(site, term) {
    const t = normalizeSearchText(term);
    if (!t) return true;
    const hay = `${site?.name || ''} ${site?.sub || ''} ${site?.id || ''}`.toLowerCase();
    return hay.includes(t);
  }

  function moduleMatchesSearch(moduleId, term) {
    const t = normalizeSearchText(term);
    if (!t) return true;
    const def = MODULES?.[moduleId];
    const hay = `${def?.name || ''} ${def?.sub || ''} ${moduleId || ''}`.toLowerCase();
    return hay.includes(t);
  }

  function getSite(id) {
    return SITES.find((s) => s.id === id) || null;
  }

  function normalizePatterns(input) {
    if (!Array.isArray(input)) return [];
    return input.map((x) => String(x || '').trim()).filter(Boolean);
  }

  function getSiteUrlPatterns(siteId, { preferQuickNav = false } = {}) {
    const sid = String(siteId || '');
    if (!sid) return [];
    if (sid === 'common') {
      return Array.from(new Set(SITES.filter((s) => s.id !== 'common').flatMap((s) => normalizePatterns(s.matchPatterns))));
    }
    const site = getSite(sid);
    if (!site) return [];
    if (preferQuickNav) {
      const q = normalizePatterns(site.quicknavPatterns);
      if (q.length) return q;
    }
    return normalizePatterns(site.matchPatterns);
  }

  function getFilteredSites() {
    return SITES.filter((s) => siteMatchesSearch(s, siteSearchText));
  }

  function effectiveSelectedSiteId() {
    const picked = getSite(selectedSiteId);
    const filtered = getFilteredSites();
    if (picked && (siteMatchesSearch(picked, siteSearchText) || filtered.length === 0)) return picked.id;
    return filtered[0]?.id || SITES[0]?.id || 'chatgpt';
  }

  function getFilteredModuleIds(siteId) {
    const rawMods = getSite(siteId)?.modules || [];
    const mods = rawMods
      .map((id, idx) => ({
        id,
        idx,
        hasMenu: !!(MODULES[id]?.menuPreview && MODULES[id].menuPreview.length)
      }))
      .sort((a, b) => {
        if (a.hasMenu !== b.hasMenu) return a.hasMenu ? -1 : 1;
        return a.idx - b.idx;
      })
      .map((x) => x.id)
      .filter((id) => moduleMatchesSearch(id, moduleSearchText));
    return mods;
  }

  function effectiveSelectedModuleId(siteId) {
    const allMods = getSite(siteId)?.modules || [];
    const filtered = getFilteredModuleIds(siteId);
    if (filtered.length) {
      if (filtered.includes(selectedModuleId)) return selectedModuleId;
      return filtered[0];
    }
    if (allMods.includes(selectedModuleId)) return selectedModuleId;
    return allMods[0] || 'quicknav';
  }

  function buildPatchFromSettingsDiff(prev, next) {
    const out = [];
    const a = prev && typeof prev === 'object' ? prev : {};
    const b = next && typeof next === 'object' ? next : {};

    if (typeof b.enabled === 'boolean' && b.enabled !== !!a.enabled) {
      out.push({ op: 'set', path: ['enabled'], value: b.enabled });
    }

    const siteIds = SITES.map((s) => s.id).filter((id) => typeof id === 'string' && id);
    for (const siteId of siteIds) {
      const aSites = a?.sites && typeof a.sites === 'object' ? a.sites : {};
      const bSites = b?.sites && typeof b.sites === 'object' ? b.sites : {};
      if (typeof bSites?.[siteId] === 'boolean' && bSites[siteId] !== aSites?.[siteId]) {
        out.push({ op: 'set', path: ['sites', siteId], value: bSites[siteId] });
      }

      const aLock = a?.scrollLockDefaults && typeof a.scrollLockDefaults === 'object' ? a.scrollLockDefaults : {};
      const bLock = b?.scrollLockDefaults && typeof b.scrollLockDefaults === 'object' ? b.scrollLockDefaults : {};
      if (typeof bLock?.[siteId] === 'boolean' && bLock[siteId] !== aLock?.[siteId]) {
        out.push({ op: 'set', path: ['scrollLockDefaults', siteId], value: bLock[siteId] });
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

  async function patchQuickNavSettingsOps(patch, { statusText = '正在保存…' } = {}) {
    const ops = Array.isArray(patch) ? patch : [];
    if (!ops.length) return;

    const seq = ++saveSeq;
    setStatus(statusText);
    try {
      const saved = await patchSettings(ops);
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
    const prev = currentSettings;
    const next = cloneJsonSafe(prev) || {};
    try {
      mutator(next);
    } catch {}
    const patch = buildPatchFromSettingsDiff(prev, next);
    void patchQuickNavSettingsOps(patch);
  }

  function isSiteEnabled(siteId) {
    const v = currentSettings?.sites?.[siteId];
    return v !== false;
  }

  function isModuleEnabled(siteId, moduleId) {
    const v = currentSettings?.siteModules?.[siteId]?.[moduleId];
    if (typeof v === 'boolean') return v;
    return v !== false;
  }

  function renderSites(activeSiteId) {
    if (!elSiteList) return;
    elSiteList.textContent = '';

    for (const s of getFilteredSites()) {
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

    const mods = getFilteredModuleIds(siteId);

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

  function addPanelAttribution(moduleId) {
    const def = MODULES?.[moduleId] || null;
    const authors = Array.isArray(def?.authors) ? def.authors.map((v) => String(v || '').trim()).filter(Boolean) : [];
    const license = typeof def?.license === 'string' ? def.license.trim() : '';
    const upstream = typeof def?.upstream === 'string' ? def.upstream.trim() : '';
    if (!authors.length && !license && !upstream) return;

    const wrap = document.createElement('div');
    wrap.className = 'panelMeta';

    const addLine = (label, valueElOrText) => {
      const row = document.createElement('div');
      row.className = 'panelMetaRow';
      const k = document.createElement('span');
      k.className = 'panelMetaKey';
      k.textContent = label;
      const v = document.createElement('span');
      v.className = 'panelMetaVal';
      if (valueElOrText && valueElOrText.nodeType === 1) v.appendChild(valueElOrText);
      else v.textContent = String(valueElOrText || '');
      row.appendChild(k);
      row.appendChild(v);
      wrap.appendChild(row);
    };

    if (authors.length) addLine('作者', authors.join(' / '));
    if (license) addLine('许可证', license);
    if (upstream) {
      const a = document.createElement('a');
      a.href = upstream;
      a.textContent = upstream;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openUrlSafe(upstream);
      });
      addLine('上游', a);
    }

    elModuleSettings.appendChild(wrap);
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

  function addModuleHeader(moduleId, title, subtitle) {
    addPanelTitle(title, subtitle);
    addPanelHotkeys(moduleId);
    addPanelAttribution(moduleId);
    addPanelDivider();
  }

  function addPanelMenuPreview(moduleId) {
    const def = MODULES[moduleId];
    const items = Array.isArray(def?.menuPreview) ? def.menuPreview.filter((v) => typeof v === 'string' && v.trim()) : [];
    if (!items.length) return;

    addPanelDivider();
    addPanelTitle('菜单操作', '直接在配置页执行（会在已打开的目标站点页面中运行）。');

    const groupMatchesModule = (group, modId) => {
      const g = String(group || '');
      const m = String(modId || '');
      if (!g) return true;
      if (m === 'quicknav') return /QuickNav/.test(g);
      if (m === 'chatgpt_usage_monitor') return /用量统计/.test(g);
      if (m === 'chatgpt_export_conversation') return /对话导出/.test(g);
      if (m === 'chatgpt_split_view') return /Split View|拆分视图/i.test(g);
      return true;
    };

    const baseMenuName = (name) => String(name || '').replace(/（[^）]*）/g, '').trim();

    const findMenuCommand = (commands, modId, label) => {
      const list = Array.isArray(commands) ? commands : [];
      const filtered = list.filter((c) => groupMatchesModule(c?.group, modId));

      const exact = filtered.find((c) => String(c?.name || '') === String(label || ''));
      if (exact) return exact;

      const base = baseMenuName(label);
      if (base) {
        const starts = filtered.find((c) => String(c?.name || '').startsWith(base));
        if (starts) return starts;
        const contains = filtered.find((c) => String(c?.name || '').includes(base));
        if (contains) return contains;
      }

      return null;
    };

    const pickBestTab = async (siteId) => {
      const patterns = getSiteUrlPatterns(siteId, { preferQuickNav: true });
      if (!patterns.length) return null;
      const tabs = await tabsQuery({ url: patterns });
      if (!tabs.length) return null;

      return tabs
        .slice()
        .sort((a, b) => {
          if (!!b?.active !== !!a?.active) return b.active ? 1 : -1;
          return Number(b?.lastAccessed || 0) - Number(a?.lastAccessed || 0);
        })[0];
    };

    const runMenuAction = async (siteId, modId, label) => {
      const sid = String(siteId || '');
      const mid = String(modId || '');
      const name = String(label || '').trim();
      if (!sid || !mid || !name) return;

      try {
        const siteDef = SITES.find((s) => s.id === sid) || null;
        const siteLabel = siteDef ? `${siteDef.name}（${siteDef.sub}）` : sid;

        const tab = await pickBestTab(sid);
        const tabId = tab?.id;
        if (!Number.isFinite(tabId)) {
          setStatus(`未找到已打开的 ${siteLabel} 页面：请先打开该站点任意页面再执行。`, 'warn');
          return;
        }

        setStatus(`正在执行：${name}…`);

        let menuResp = null;
        try {
          menuResp = await tabsSendMessage(tabId, { type: 'QUICKNAV_GET_MENU' });
        } catch (e) {
          setStatus(`未能连接到页面菜单：${e instanceof Error ? e.message : String(e)}（可能需要刷新该页面）`, 'warn');
          return;
        }

        if (!menuResp || menuResp.ok !== true || !Array.isArray(menuResp.commands)) {
          setStatus(`未能获取页面菜单：请确认该站点已启用并刷新页面后再试。`, 'warn');
          return;
        }

        const cmd = findMenuCommand(menuResp.commands, mid, name);
        if (!cmd || typeof cmd.id !== 'string') {
          setStatus(`未找到对应菜单项：${name}（请确认该模块已注入到页面）`, 'warn');
          return;
        }

        const runResp = await tabsSendMessage(tabId, { type: 'QUICKNAV_RUN_MENU', id: cmd.id });
        if (runResp && runResp.ok === true) {
          setStatus(`已执行：${cmd.name}`, 'ok');
        } else {
          setStatus(`执行失败：${runResp?.error || 'unknown'}`, 'err');
        }
      } catch (e) {
        setStatus(`执行失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      }
    };

    const wrap = document.createElement('div');
    wrap.className = 'menuPreview';
    for (const label of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menuPreviewBtn';
      btn.textContent = label;
      btn.disabled = !(currentSettings?.enabled && isSiteEnabled(selectedSiteId) && isModuleEnabled(selectedSiteId, moduleId));
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          await runMenuAction(selectedSiteId, moduleId, label);
        } finally {
          btn.disabled = !(currentSettings?.enabled && isSiteEnabled(selectedSiteId) && isModuleEnabled(selectedSiteId, moduleId));
        }
      });
      wrap.appendChild(btn);
    }
    elModuleSettings.appendChild(wrap);
  }

  function renderQuickNavModuleSettings(siteId) {
    addModuleHeader('quicknav', 'QuickNav', '该模块负责对话导航面板、📌标记点、收藏夹、防自动滚动与快捷键。');

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

    addPanelMenuPreview('quicknav');
  }

  async function renderChatGPTPerfModuleSettings(siteId, token) {
    addModuleHeader('chatgpt_perf', 'ChatGPT 性能优化', '离屏虚拟化与 CSS contain，减少长对话卡顿（设置写入 storage.sync）。');

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
      {
        key: 'enabled',
        label: '模块内部总开关（默认开）',
        title: '只控制该模块内部逻辑；若关闭“启用该模块注入”，这里不会生效。'
      },
      {
        key: 'virtualizeOffscreen',
        label: '离屏虚拟化（默认开）',
        title: '核心优化：将离屏消息变为 content-visibility:auto，减少长对话滚动/渲染压力。'
      },
      {
        key: 'virtualizeMarkdownBlocks',
        label: 'Markdown 分段虚拟化（实验｜默认开）',
        title: '针对“单条超长回复”，对 .markdown 的块级节点做 content-visibility，降低 layout/paint。'
      },
      {
        key: 'optimizeHeavyBlocks',
        label: '重内容优化（默认开）',
        title: '对 pre/table/公式等高开销块使用 contain/content-visibility，减少卡顿。'
      },
      {
        key: 'disableAnimations',
        label: '禁用动画/过渡（默认开）',
        title: '将动画/过渡 duration 置 0，减少合成与重绘开销；外观变化较小。'
      },
      {
        key: 'disableBackdropFilters',
        label: '禁用毛玻璃（默认关）',
        title: '全站禁用 backdrop-filter（毛玻璃），通常可明显减轻弹层/侧边栏/滚动卡顿，但观感会变化。'
      },
      {
        key: 'extremeLite',
        label: '极限轻量（默认关）',
        title: '更激进：强制禁用 blur/filter/阴影/动画/过渡等，性能更好但会明显变丑，可能影响部分 UI。'
      },
      {
        key: 'boostDuringInput',
        label: '输入/交互加速（默认开）',
        title: '在输入/编辑/发送等交互期间临时收紧预加载边距，优先保证点击/发送流畅。'
      },
      {
        key: 'unfreezeOnFind',
        label: 'Ctrl/Cmd+F 临时解冻（默认开）',
        title: '使用查找时临时关闭虚拟化，确保能搜到远处内容（之后自动恢复）。'
      },
      {
        key: 'showOverlay',
        label: '显示页面内性能菜单（默认关）',
        title: '开启后在页面左下角显示“性能”按钮，可随时切换开关并测量一次交互卡顿。'
      }
    ];

    for (const field of fields) {
      const key = field.key;
      const label = field.label;
      const row = document.createElement('label');
      row.className = 'formRow';
      const left = document.createElement('span');
      left.textContent = label;
      if (field.title) left.title = field.title;
      const input = document.createElement('input');
      input.type = 'checkbox';
      if (field.title) input.title = field.title;
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

    const rowMargin = document.createElement('div');
    rowMargin.className = 'formRow rangeRow';
    const leftMargin = document.createElement('span');
    leftMargin.textContent = 'rootMarginPx（越大越不激进）';

    const marginStep = 50;
    const marginBaseMax = 4000;

    const inputMarginRange = document.createElement('input');
    inputMarginRange.type = 'range';
    inputMarginRange.min = '0';
    inputMarginRange.step = String(marginStep);

    const inputMarginNumber = document.createElement('input');
    inputMarginNumber.type = 'number';
    inputMarginNumber.min = '0';
    inputMarginNumber.step = String(marginStep);

    const marginVal = document.createElement('span');
    marginVal.className = 'rangeVal';

    const sanitizeMargin = (raw) => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return settings.rootMarginPx;
      return Math.max(0, Math.round(n / marginStep) * marginStep);
    };

    const applyMarginUi = (raw) => {
      const v = sanitizeMargin(raw);
      const max = Math.max(marginBaseMax, v);
      inputMarginRange.max = String(max);
      inputMarginRange.value = String(v);
      inputMarginNumber.value = String(v);
      marginVal.textContent = `${v}px`;
      return v;
    };

    const commitMargin = async (raw) => {
      const v = sanitizeMargin(raw);
      const next = { ...settings, rootMarginPx: v };
      setStatus('正在保存模块设置…');
      try {
        settings = await saveCgptPerfSettings(next);
        applyMarginUi(settings.rootMarginPx);
        setStatus('模块设置已保存', 'ok');
      } catch (e) {
        applyMarginUi(settings.rootMarginPx);
        setStatus(`模块设置保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      }
    };

    applyMarginUi(settings.rootMarginPx);

    inputMarginRange.addEventListener('input', () => applyMarginUi(inputMarginRange.value));
    inputMarginRange.addEventListener('change', () => void commitMargin(inputMarginRange.value));
    inputMarginNumber.addEventListener('input', () => {
      const v = sanitizeMargin(inputMarginNumber.value);
      marginVal.textContent = `${v}px`;
      inputMarginRange.value = String(Math.min(Number(inputMarginRange.max || marginBaseMax), v));
    });
    inputMarginNumber.addEventListener('change', () => void commitMargin(inputMarginNumber.value));

    const marginControls = document.createElement('div');
    marginControls.className = 'rangeControl';
    marginControls.appendChild(inputMarginRange);
    marginControls.appendChild(inputMarginNumber);
    marginControls.appendChild(marginVal);

    rowMargin.appendChild(leftMargin);
    rowMargin.appendChild(marginControls);
    elModuleSettings.appendChild(rowMargin);

    addPanelDivider();
    addPanelTitle('状态检测', '从已打开的 ChatGPT 页面读取 <html data-cgptperf*> 属性，确认设置是否已应用。');

    const btnProbe = document.createElement('button');
    btnProbe.type = 'button';
    btnProbe.className = 'btn secondary';
    btnProbe.textContent = '读取当前页面状态';

    const probeOut = document.createElement('pre');
    probeOut.className = 'codeBox';
    probeOut.textContent = '（未检测）';

    const pickBestChatgptTab = async () => {
      const patterns = getSiteUrlPatterns(siteId, { preferQuickNav: true });
      if (!patterns.length) return null;
      const tabs = await tabsQuery({ url: patterns });
      if (!tabs.length) return null;
      return tabs
        .slice()
        .sort((a, b) => {
          if (!!b?.active !== !!a?.active) return b.active ? 1 : -1;
          return Number(b?.lastAccessed || 0) - Number(a?.lastAccessed || 0);
        })[0];
    };

    const withTimeout = (promise, ms, label) => {
      let timer = 0;
      return new Promise((resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} 超时`)), Math.max(50, Number(ms) || 2000));
        promise.then(
          (v) => {
            window.clearTimeout(timer);
            resolve(v);
          },
          (e) => {
            window.clearTimeout(timer);
            reject(e);
          }
        );
      });
    };

    btnProbe.addEventListener('click', async () => {
      btnProbe.disabled = true;
      probeOut.textContent = '正在读取…';
      try {
        const tab = await withTimeout(pickBestChatgptTab(), 2000, '查找标签页');
        const tabId = tab?.id;
        if (!tabId) throw new Error('未找到已打开的 ChatGPT 标签页（请先打开 chatgpt.com）');
        const resp = await withTimeout(tabsSendMessage(tabId, { type: 'CGPT_PERF_GET_STATE' }), 2500, '读取页面状态');
        if (!resp || resp.ok !== true) throw new Error(resp?.error || '无响应（可能未注入或页面未刷新）');
        probeOut.textContent = JSON.stringify(resp, null, 2);
        setStatus('已读取当前页面状态', 'ok');
      } catch (e) {
        probeOut.textContent = '（读取失败）';
        setStatus(`读取失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        btnProbe.disabled = false;
      }
    });

    elModuleSettings.appendChild(btnProbe);
    elModuleSettings.appendChild(probeOut);

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
    addModuleHeader('gemini_math_fix', 'Gemini Enterprise 数学修复', '在 business.gemini.google 上修复 KaTeX / inline math 显示问题。');

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
    addModuleHeader(
      'chatgpt_thinking_toggle',
      'ChatGPT 推理强度/模型 快捷切换',
      '在 chatgpt.com：⌘O 切换推理强度（Light/Heavy 或 Standard/Extended）；⌘J 在 GPT 5.2 thinking ↔ GPT 5.2 pro 之间切换。'
    );

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

    const isHotkeyEnabled = (key) => {
      const v = currentSettings?.siteModules?.[siteId]?.[key];
      return typeof v === 'boolean' ? v : true;
    };

    const rowHotkeyO = document.createElement('label');
    rowHotkeyO.className = 'formRow';
    const leftHotkeyO = document.createElement('span');
    leftHotkeyO.textContent = '启用 ⌘O（切换推理强度）';
    const inputHotkeyO = document.createElement('input');
    inputHotkeyO.type = 'checkbox';
    inputHotkeyO.checked = isHotkeyEnabled('chatgpt_thinking_toggle_hotkey_effort');
    inputHotkeyO.addEventListener('change', () => {
      const checked = !!inputHotkeyO.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_thinking_toggle_hotkey_effort = checked;
      });
    });
    rowHotkeyO.appendChild(leftHotkeyO);
    rowHotkeyO.appendChild(inputHotkeyO);
    elModuleSettings.appendChild(rowHotkeyO);

    const rowHotkeyJ = document.createElement('label');
    rowHotkeyJ.className = 'formRow';
    const leftHotkeyJ = document.createElement('span');
    leftHotkeyJ.textContent = '启用 ⌘J（切换模型）';
    const inputHotkeyJ = document.createElement('input');
    inputHotkeyJ.type = 'checkbox';
    inputHotkeyJ.checked = isHotkeyEnabled('chatgpt_thinking_toggle_hotkey_model');
    inputHotkeyJ.addEventListener('change', () => {
      const checked = !!inputHotkeyJ.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_thinking_toggle_hotkey_model = checked;
      });
    });
    rowHotkeyJ.appendChild(leftHotkeyJ);
    rowHotkeyJ.appendChild(inputHotkeyJ);
    elModuleSettings.appendChild(rowHotkeyJ);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '提示：该模块会在页面主世界（MAIN world）监听 ⌘O/⌘J（可分别关闭）；并在发送成功后右下角弹窗显示实际使用的 thinking_effort（以及 model）。关闭模块后已打开页面可能需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTCmdEnterSendModuleSettings(siteId) {
    addModuleHeader('chatgpt_cmdenter_send', 'ChatGPT ⌘Enter 发送', '把 Enter/Shift+Enter 变为换行，⌘/Ctrl+Enter 才发送消息。');

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
    addModuleHeader(
      'chatgpt_readaloud_speed_controller',
      'ChatGPT 朗读速度控制器',
      '控制 ChatGPT “朗读/Read aloud”音频播放速度（HTMLAudioElement.playbackRate）。'
    );

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

    const rowSpeed = document.createElement('div');
    rowSpeed.className = 'formRow rangeRow';
    const leftSpeed = document.createElement('span');
    leftSpeed.textContent = '朗读速度倍速（0.01–100）';

    const SPEED_SLIDER_MIN = 0.5;
    const SPEED_SLIDER_MAX = 4;
    const SPEED_SLIDER_STEP = 0.05;

    const inputSpeedRange = document.createElement('input');
    inputSpeedRange.type = 'range';
    inputSpeedRange.min = String(SPEED_SLIDER_MIN);
    inputSpeedRange.max = String(SPEED_SLIDER_MAX);
    inputSpeedRange.step = String(SPEED_SLIDER_STEP);

    const inputSpeedNumber = document.createElement('input');
    inputSpeedNumber.type = 'number';
    inputSpeedNumber.min = String(CGPT_READALOUD_SPEED_MIN);
    inputSpeedNumber.max = String(CGPT_READALOUD_SPEED_MAX);
    inputSpeedNumber.step = '0.01';

    const speedVal = document.createElement('span');
    speedVal.className = 'rangeVal';

    const clampForSlider = (v) => Math.max(SPEED_SLIDER_MIN, Math.min(SPEED_SLIDER_MAX, v));
    const formatSpeed = (v) => {
      if (!Number.isFinite(v)) return '';
      return String(Number(v.toFixed(2))).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    };

    const applySpeedUi = (raw) => {
      const v = sanitizeCgptReadaloudSpeed(raw);
      inputSpeedNumber.value = String(v);
      inputSpeedRange.value = String(clampForSlider(v));
      speedVal.textContent = `${formatSpeed(v)}x`;
      return v;
    };

    const commitSpeed = async (raw) => {
      const next = sanitizeCgptReadaloudSpeed(raw);
      setStatus('正在保存模块设置…');
      try {
        speed = await saveCgptReadaloudSpeed(next);
        applySpeedUi(speed);
        setStatus('模块设置已保存', 'ok');
      } catch (e) {
        applySpeedUi(speed);
        setStatus(`模块设置保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      }
    };

    applySpeedUi(speed);

    inputSpeedRange.addEventListener('input', () => applySpeedUi(inputSpeedRange.value));
    inputSpeedRange.addEventListener('change', () => void commitSpeed(inputSpeedRange.value));
    inputSpeedNumber.addEventListener('input', () => {
      const v = sanitizeCgptReadaloudSpeed(inputSpeedNumber.value);
      speedVal.textContent = `${formatSpeed(v)}x`;
      inputSpeedRange.value = String(clampForSlider(v));
    });
    inputSpeedNumber.addEventListener('change', () => void commitSpeed(inputSpeedNumber.value));

    const speedControls = document.createElement('div');
    speedControls.className = 'rangeControl';
    speedControls.appendChild(inputSpeedRange);
    speedControls.appendChild(inputSpeedNumber);
    speedControls.appendChild(speedVal);

    rowSpeed.appendChild(leftSpeed);
    rowSpeed.appendChild(speedControls);
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

  async function renderChatGPTUsageMonitorModuleSettings(siteId, token) {
    addModuleHeader('chatgpt_usage_monitor', 'ChatGPT 用量统计', '实时统计各模型调用量（支持导入/导出、一周/一月分析报告）。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_usage_monitor');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_usage_monitor = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：该模块在页面主世界（MAIN world）拦截 fetch，并从 /backend-api/* 的请求与 SSE metadata 推断最终模型路由；面板可拖动/缩放，⌘I 可快速最小化。';
    elModuleSettings.appendChild(hint);

    let planType;
    try {
      planType = await loadCgptUsageMonitorPlanType();
    } catch (e) {
      if (token !== renderSeq) return;
      planType = CGPT_USAGE_MONITOR_PLAN_DEFAULT;
      const err = document.createElement('div');
      err.className = 'smallHint';
      err.textContent = `读取套餐设置失败：${e instanceof Error ? e.message : String(e)}`;
      elModuleSettings.appendChild(err);
    }
    if (token !== renderSeq) return;

    addPanelDivider();
    addPanelTitle('套餐（Plan）', '默认 Team；配置页与面板会自动保持一致（写入 storage.sync）。');

    const rowPlan = document.createElement('label');
    rowPlan.className = 'formRow';
    const leftPlan = document.createElement('span');
    leftPlan.textContent = '默认套餐';
    const selectPlan = document.createElement('select');
    for (const [key, label] of CGPT_USAGE_MONITOR_PLAN_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      selectPlan.appendChild(opt);
    }
    selectPlan.value = planType;
    selectPlan.addEventListener('change', async () => {
      const next = sanitizeCgptUsageMonitorPlanType(selectPlan.value);
      if (next === planType) return;
      if (
        !confirm(
          `切换套餐为 ${CGPT_USAGE_MONITOR_PLAN_OPTIONS.find(([k]) => k === next)?.[1] || next}？\n\n提示：切换套餐会按官方限制自动调整所有模型的配额和时间窗口设置（会保留使用历史）。`
        )
      ) {
        selectPlan.value = planType;
        return;
      }
      selectPlan.disabled = true;
      setStatus('正在保存套餐设置…');
      try {
        planType = await saveCgptUsageMonitorPlanType(next);
        selectPlan.value = planType;
        setStatus('套餐设置已保存', 'ok');
      } catch (e) {
        selectPlan.value = planType;
        setStatus(`套餐设置保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        selectPlan.disabled = false;
      }
    });
    rowPlan.appendChild(leftPlan);
    rowPlan.appendChild(selectPlan);
    elModuleSettings.appendChild(rowPlan);

    addPanelMenuPreview('chatgpt_usage_monitor');
  }

  function renderChatGPTReplyTimerModuleSettings(siteId) {
    addModuleHeader('chatgpt_reply_timer', 'ChatGPT 回复计时器', '统计从你发送消息到 GPT 回复完成的耗时（右下角极简数字，覆盖最底层）。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_reply_timer');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_reply_timer = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：该模块在页面主世界（MAIN world）拦截 fetch，并读取对话 SSE（/backend-api/(f/)conversation）来判断开始/结束；右下角仅显示一个小数字（秒），并使用极高 z-index 覆盖其它悬浮物。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTDownloadFileFixModuleSettings(siteId) {
    addModuleHeader('chatgpt_download_file_fix', 'ChatGPT 下载修复', '修复 chatgpt.com 下载文件失败：自动解码 download URL 的 sandbox_path。');

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
    addModuleHeader('chatgpt_strong_highlight_lite', 'ChatGPT 回复粗体高亮（Lite）', '高亮 ChatGPT 回复中的粗体文字，并隐藏底部免责声明提示。');

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
    addModuleHeader('chatgpt_quick_deep_search', '快捷深度搜索（译/搜/思）', '提供 “译 / 搜 / 思” 按钮（优先放在输入框右侧），并支持快捷键触发。');

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
      '说明：该模块会在输入框右侧添加“译/搜/思”按钮并自动发送；并拦截 fetch，把下一次 /backend-api/(f/)conversation 的 body.model 强制改为 gpt-5。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTHideFeedbackButtonsModuleSettings(siteId) {
    addModuleHeader('chatgpt_hide_feedback_buttons', 'ChatGPT 隐藏点赞/点踩', '隐藏 ChatGPT 回复下方的反馈按钮（点赞 / 点踩）。');

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
    addModuleHeader('chatgpt_tex_copy_quote', 'ChatGPT TeX Copy & Quote', '增强 ChatGPT 的复制/引用：优先复制 KaTeX 的原始 LaTeX。');

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

  function renderChatGPTExportConversationModuleSettings(siteId) {
    addModuleHeader('chatgpt_export_conversation', 'ChatGPT 对话导出（新版 UI）', '导出当前对话为 Markdown / HTML（菜单在扩展弹窗里）。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_export_conversation');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_export_conversation = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '说明：导出为纯前端下载（Blob），无需额外权限；图片会保持为原始链接（不做 base64 内嵌）。';
    elModuleSettings.appendChild(hint);

    addPanelMenuPreview('chatgpt_export_conversation');
  }

  function renderChatGPTImageMessageEditModuleSettings(siteId) {
    addModuleHeader('chatgpt_image_message_edit', 'ChatGPT 消息分叉编辑（可加图）', '为用户消息增加一个“分叉编辑”按钮（可与原生编辑共存）。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_image_message_edit');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] = next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_image_message_edit = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '使用方式：在用户消息下面会多出一个 QuickNav 铅笔按钮（在 ChatGPT 原生“编辑”左侧）；点击后会把原文（以及原图，如有）填入输入框。此时你可以继续编辑，并可新增/粘贴图片（Cmd+V）或用“添加文件/图片”上传，然后直接发送。发送时会自动改写 parent_message_id，实现真正的“分叉编辑”。若想恢复正常发送，点提示条里的“取消”。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTMessageTreeModuleSettings(siteId) {
    addModuleHeader('chatgpt_message_tree', 'ChatGPT 消息树（只读）', '显示当前对话的完整消息树/分支结构（不切换主界面分支）。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_message_tree');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] = next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_message_tree = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '使用方式：在右下角会出现 “Tree” 按钮。点开后显示当前对话的消息树（包含所有分支）并高亮当前分支路径；默认开启“简洁”（隐藏 system/tool/thoughts 等内部节点）和“彩线”（类似 VSCode 的缩进对齐竖线），可在面板顶部一键切换。该模块不会驱动主聊天区切换分支/定位消息；只用于查看结构。';
    elModuleSettings.appendChild(hint);
  }

  function renderGensparkMoaImageAutosettingsModuleSettings(siteId) {
    addModuleHeader('genspark_moa_image_autosettings', 'Genspark 绘图默认设置', '仅在绘图页面生效：进入页面自动打开 Setting，并自动选择 2K 画质。');

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
    addModuleHeader('genspark_credit_balance', 'Genspark 积分余量', '悬停页面上的小蓝点显示积分余量信息；支持折叠/展开、强制刷新、每分钟自动刷新。');

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
  }

  function renderGrokFastUnlockModuleSettings(siteId) {
    addModuleHeader('grok_fast_unlock', 'Grok 4 Fast 菜单项', '在模型菜单增加 “Grok 4 Fast”，并在发送时选用该模型。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'grok_fast_unlock');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] = next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].grok_fast_unlock = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '说明：该模块会拦截 grok.com 的发送请求，把 modelName/modelMode 改为 Grok 4 Fast 对应的模型参数。';
    elModuleSettings.appendChild(hint);
  }

  function renderGrokRateLimitDisplayModuleSettings(siteId) {
    addModuleHeader('grok_rate_limit_display', 'Grok 剩余次数显示', '在输入框附近显示 rate limit（剩余次数/等待时间）。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'grok_rate_limit_display');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] = next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].grok_rate_limit_display = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '说明：该模块会请求 https://grok.com/rest/rate-limits 并在页面输入框附近展示剩余次数/等待时间。';
    elModuleSettings.appendChild(hint);
  }

  function renderGensparkInlineUploadFixModuleSettings(siteId) {
    addModuleHeader('genspark_inline_upload_fix', 'Genspark 消息编辑上传修复', '修复消息编辑（铅笔）里的附件上传：Cmd+V 粘贴图片/文件；📎打开文件选择器。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'genspark_inline_upload_fix');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] = next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].genspark_inline_upload_fix = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '使用方式：先点击消息右侧的铅笔进入编辑，然后点击编辑框，再 Cmd+V 粘贴图片/文件；点击编辑器里的📎会弹出文件选择器。';
    elModuleSettings.appendChild(hint);
  }

  function renderBasicToggleModuleSettings(siteId, moduleId, hintText = '') {
    const def = MODULES?.[moduleId];
    addModuleHeader(moduleId, def?.name || moduleId, def?.sub || '');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, moduleId);
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] = next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId][moduleId] = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = hintText || '提示：关闭模块后，已打开页面一般需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);

    addPanelMenuPreview(moduleId);
  }

  function renderModuleSettings(siteId, moduleId, token) {
    if (!elModuleSettings) return;
    elModuleSettings.textContent = '';

    if (!currentSettings) {
      addPanelTitle('设置', '正在加载设置…');
      return;
    }

    if (moduleId === 'quicknav') return renderQuickNavModuleSettings(siteId);
    if (moduleId === 'hide_disclaimer') return renderBasicToggleModuleSettings(siteId, moduleId);
    if (moduleId === 'chatgpt_perf') return void renderChatGPTPerfModuleSettings(siteId, token);
    if (moduleId === 'chatgpt_thinking_toggle') return renderChatGPTThinkingToggleModuleSettings(siteId);
    if (moduleId === 'chatgpt_cmdenter_send') return renderChatGPTCmdEnterSendModuleSettings(siteId);
    if (moduleId === 'chatgpt_readaloud_speed_controller') return void renderChatGPTReadaloudSpeedControllerModuleSettings(siteId, token);
    if (moduleId === 'chatgpt_usage_monitor') return void renderChatGPTUsageMonitorModuleSettings(siteId, token);
    if (moduleId === 'chatgpt_reply_timer') return renderChatGPTReplyTimerModuleSettings(siteId);
    if (moduleId === 'chatgpt_download_file_fix') return renderChatGPTDownloadFileFixModuleSettings(siteId);
    if (moduleId === 'chatgpt_strong_highlight_lite') return renderChatGPTStrongHighlightLiteModuleSettings(siteId);
    if (moduleId === 'chatgpt_quick_deep_search') return renderChatGPTQuickDeepSearchModuleSettings(siteId);
    if (moduleId === 'chatgpt_hide_feedback_buttons') return renderChatGPTHideFeedbackButtonsModuleSettings(siteId);
    if (moduleId === 'chatgpt_tex_copy_quote') return renderChatGPTTexCopyQuoteModuleSettings(siteId);
    if (moduleId === 'chatgpt_export_conversation') return renderChatGPTExportConversationModuleSettings(siteId);
    if (moduleId === 'chatgpt_image_message_edit') return renderChatGPTImageMessageEditModuleSettings(siteId);
    if (moduleId === 'chatgpt_message_tree') return renderChatGPTMessageTreeModuleSettings(siteId);
    if (moduleId === 'gemini_math_fix') return renderGeminiMathFixModuleSettings(siteId);
    if (moduleId === 'gemini_auto_3_pro') return renderBasicToggleModuleSettings(siteId, moduleId);
    if (moduleId === 'genspark_moa_image_autosettings') return renderGensparkMoaImageAutosettingsModuleSettings(siteId);
    if (moduleId === 'genspark_credit_balance') return renderGensparkCreditBalanceModuleSettings(siteId);
    if (moduleId === 'genspark_codeblock_fold') return renderBasicToggleModuleSettings(siteId, moduleId);
    if (moduleId === 'genspark_inline_upload_fix') return renderGensparkInlineUploadFixModuleSettings(siteId);
    if (moduleId === 'grok_fast_unlock') return renderGrokFastUnlockModuleSettings(siteId);
    if (moduleId === 'grok_rate_limit_display') return renderGrokRateLimitDisplayModuleSettings(siteId);

    renderBasicToggleModuleSettings(siteId, moduleId, '未知模块：仅提供注入开关；如需额外设置请补充模块设置面板。');
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

  elSiteSearch?.addEventListener('input', () => {
    siteSearchText = normalizeSearchText(elSiteSearch.value);
    renderAll();
  });
  elModuleSearch?.addEventListener('input', () => {
    moduleSearchText = normalizeSearchText(elModuleSearch.value);
    renderAll();
  });

  btnRestoreDefault?.addEventListener('click', () => {
    const run = async () => {
      const seq = ++saveSeq;
      setStatus('正在恢复默认…');
      if (btnRestoreDefault) btnRestoreDefault.disabled = true;
      try {
        const settings = await resetDefaults();
        if (seq !== saveSeq) return;
        currentSettings = settings;
        renderAll();
        setStatus('已恢复默认', 'ok');
      } catch (e) {
        if (seq !== saveSeq) return;
        renderAll();
        setStatus(`恢复默认失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        if (btnRestoreDefault) btnRestoreDefault.disabled = false;
      }
    };
    void run();
  });

  btnReinjectNow?.addEventListener('click', async () => {
    setStatus('正在重新注入…');
    if (btnReinjectNow) btnReinjectNow.disabled = true;
    try {
      const settings = await reinjectNow();
      currentSettings = settings;
      renderAll();
      let openTabs = null;
      try {
        const patterns = Array.from(new Set(SITES.flatMap((s) => getSiteUrlPatterns(s.id))));
        if (patterns.length) {
          const tabs = await tabsQuery({ url: patterns });
          openTabs = tabs.length;
        }
      } catch {}

      if (typeof openTabs === 'number') {
        if (openTabs === 0) setStatus('已重新注入：当前没有已打开的匹配页面（0 个）；后续打开页面会自动注入。', 'ok');
        else setStatus(`已重新注入：已打开的匹配页面（${openTabs} 个）会立即生效；关闭功能需刷新页面。`, 'ok');
      } else {
        setStatus('已重新注入（已打开的匹配页面会立即生效；关闭功能需刷新页面）', 'ok');
      }
    } catch (e) {
      setStatus(`重新注入失败：${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      if (btnReinjectNow) btnReinjectNow.disabled = false;
    }
  });

  btnOpenRepo?.addEventListener('click', () => openUrlSafe(REPO_URL));

  init();
})();
