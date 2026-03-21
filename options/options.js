(() => {
  'use strict';

  const REPO = 'lueluelue2006/ai-chat-extension-collection';
  const REPO_URL = `https://github.com/${REPO}`;

  const elStatus = document.getElementById('status');
  const elEnabled = document.getElementById('enabled');
  const btnRestoreDefault = document.getElementById('restoreDefault');
  const btnFactoryReset = document.getElementById('factoryReset');
  const btnReinjectNow = document.getElementById('reinjectNow');
  const btnOpenRepo = document.getElementById('openRepo');
  const btnGpt53Save = document.getElementById('gpt53Save');
  const btnGpt53Refresh = document.getElementById('gpt53Refresh');
  const btnGpt53Run = document.getElementById('gpt53Run');
  const elGpt53Urls = document.getElementById('gpt53Urls');
  const elGpt53Status = document.getElementById('gpt53Status');
  const elGpt53AlertBox = document.getElementById('gpt53AlertBox');
  const elGpt53AlertText = document.getElementById('gpt53AlertText');
  const btnGpt53MarkRead = document.getElementById('gpt53MarkRead');
  const elThemeToggle = document.getElementById('themeToggle');
  const btnThemeLight = document.getElementById('themeLight');
  const btnThemeDark = document.getElementById('themeDark');
  const elSiteList = document.getElementById('siteList');
  const elModuleList = document.getElementById('moduleList');
  const elModuleSettings = document.getElementById('moduleSettings');
  const elSiteSearch = document.getElementById('siteSearch');
  const elModuleSearch = document.getElementById('moduleSearch');
  const elSiteListCount = document.getElementById('siteListCount');
  const elModuleListCount = document.getElementById('moduleListCount');
  const elSiteListNote = document.getElementById('siteListNote');
  const elModuleListNote = document.getElementById('moduleListNote');
  const elPanelSelectionTitle = document.getElementById('panelSelectionTitle');
  const elPanelSelectionSub = document.getElementById('panelSelectionSub');
  const elPanelSelectionMeta = document.getElementById('panelSelectionMeta');
  const elPanelInfoWrap = document.getElementById('panelInfoWrap');
  const elPanelInfoCard = document.getElementById('panelInfoCard');
  const elMetaKeyProfileState = document.getElementById('metaKeyProfileState');
  const elMetaKeyProfilePill = document.getElementById('metaKeyProfilePill');
  const elMetaKeyProfileHint = document.getElementById('metaKeyProfileHint');
  const inputMetaKeyModeAuto = document.getElementById('metaKeyModeAuto');
  const inputMetaKeyModeHasMeta = document.getElementById('metaKeyModeHasMeta');
  const inputMetaKeyModeNoMeta = document.getElementById('metaKeyModeNoMeta');
  const elLocaleToggle = document.getElementById('localeToggle');
  const btnLocaleToggleZh = document.getElementById('localeToggleZh');
  const btnLocaleToggleEn = document.getElementById('localeToggleEn');
  const I18N = (() => {
    try {
      return globalThis.AISHORTCUTS_I18N || null;
    } catch {
      return null;
    }
  })();

  const REGISTRY = (() => {
    try {
      return globalThis.AISHORTCUTS_REGISTRY || null;
    } catch {
      return null;
    }
  })();
  const SITES = Array.isArray(REGISTRY?.sites) ? REGISTRY.sites : [];
  const MODULES = REGISTRY?.modules && typeof REGISTRY.modules === 'object' ? REGISTRY.modules : {};
  const MODULE_ALIASES = REGISTRY?.moduleAliases && typeof REGISTRY.moduleAliases === 'object' ? REGISTRY.moduleAliases : {};
  const MODULE_ALIAS_TARGETS = (() => {
    const out = {};
    try {
      for (const [legacyId, canonicalId] of Object.entries(MODULE_ALIASES)) {
        const legacy = String(legacyId || '').trim();
        const canonical = String(canonicalId || '').trim();
        if (!legacy || !canonical || legacy === canonical) continue;
        if (!Array.isArray(out[canonical])) out[canonical] = [];
        out[canonical].push(legacy);
      }
    } catch {}
    return out;
  })();
  const REGISTRY_OK = !!(SITES.length && Object.keys(MODULES).length);

  const CGPT_PERF_STORAGE_KEY = 'cgpt_perf_mv3_settings_v1';
  const CGPT_PERF_DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    virtualizeOffscreen: true,
    optimizeHeavyBlocks: true,
    disableAnimations: true,
    boostDuringInput: true,
    unfreezeOnFind: true,
    showOverlay: false,
    rootMarginPx: 1000
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

  const UI_THEME_OVERRIDE_KEY = 'aichat_ai_shortcuts_ui_theme_override_v1';
  const MODULE_SETTINGS_REGISTRY_GLOBAL_KEY = '__aiShortcutsOptionsModuleSettingsRegistryV1__';
  const MODULE_SETTINGS_SUBMODULE_SCRIPTS = Object.freeze([
    './module-settings/core.js',
    './module-settings/chatgpt.js',
    './module-settings/sites.js'
  ]);
  const META_KEY_MODE_AUTO = 'auto';
  const META_KEY_MODE_HAS_META = 'has_meta';
  const META_KEY_MODE_NO_META = 'no_meta';
  const LOCALE_MODE_AUTO = 'auto';
  const LOCALE_MODE_ZH_CN = 'zh_cn';
  const LOCALE_MODE_EN = 'en';
  let lastStatusRaw = '';
  let lastStatusKind = '';
  let localeObserver = null;
  let localeObserverTimer = 0;

  function setStatus(text, kind = '') {
    if (!elStatus) return;
    lastStatusRaw = String(text || '');
    lastStatusKind = String(kind || '');
    elStatus.textContent = translateText(lastStatusRaw);
    elStatus.classList.remove('ok', 'warn', 'err');
    if (kind) elStatus.classList.add(kind);
    localizeBody(resolveUiLocale());
  }

  if (!REGISTRY_OK) setStatus('脚本注册表缺失：shared/registry.js 未加载（请刷新扩展或重装）', 'err');

  function readUiThemeOverride() {
    try {
      const v = String(window.localStorage.getItem(UI_THEME_OVERRIDE_KEY) || '').trim();
      return v === 'dark' || v === 'light' ? v : '';
    } catch {
      return '';
    }
  }

  function writeUiThemeOverride(next) {
    const v = String(next || '').trim();
    try {
      if (!v) window.localStorage.removeItem(UI_THEME_OVERRIDE_KEY);
      else window.localStorage.setItem(UI_THEME_OVERRIDE_KEY, v);
    } catch {}
  }

  function getSystemTheme() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function getEffectiveTheme() {
    const stored = readUiThemeOverride();
    return stored || getSystemTheme();
  }

  function applyUiTheme() {
    const stored = readUiThemeOverride();
    try {
      if (stored) document.documentElement.dataset.theme = stored;
      else delete document.documentElement.dataset.theme;
    } catch {}
  }

  function renderThemeToggle() {
    const effective = getEffectiveTheme();
    const isLight = effective === 'light';

    if (btnThemeLight) {
      btnThemeLight.classList.toggle('active', isLight);
      btnThemeLight.setAttribute('aria-pressed', isLight ? 'true' : 'false');
      btnThemeLight.title = isLight ? '当前：亮色' : '切换为亮色';
    }
    if (btnThemeDark) {
      btnThemeDark.classList.toggle('active', !isLight);
      btnThemeDark.setAttribute('aria-pressed', !isLight ? 'true' : 'false');
      btnThemeDark.title = !isLight ? '当前：暗色' : '切换为暗色';
    }
  }

  function initUiThemeToggle() {
    applyUiTheme();
    renderThemeToggle();

    btnThemeLight?.addEventListener('click', () => {
      writeUiThemeOverride('light');
      applyUiTheme();
      renderThemeToggle();
    });
    btnThemeDark?.addEventListener('click', () => {
      writeUiThemeOverride('dark');
      applyUiTheme();
      renderThemeToggle();
    });

    try {
      const mql = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (mql && typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', () => {
          if (readUiThemeOverride()) return; // user override wins
          renderThemeToggle();
        });
      }
    } catch {}
  }

  function normalizeMetaKeyMode(mode, fallback = META_KEY_MODE_AUTO) {
    const value = String(mode || '').trim().toLowerCase();
    if (value === META_KEY_MODE_AUTO || value === META_KEY_MODE_HAS_META || value === META_KEY_MODE_NO_META) return value;
    return fallback;
  }

  function normalizeLocaleMode(mode, fallback = LOCALE_MODE_AUTO) {
    try {
      if (typeof I18N?.normalizeLocaleMode === 'function') return I18N.normalizeLocaleMode(mode, fallback);
    } catch {}
    const value = String(mode || '').trim().toLowerCase();
    if (value === LOCALE_MODE_AUTO || value === LOCALE_MODE_ZH_CN || value === LOCALE_MODE_EN) return value;
    return fallback;
  }

  function resolveUiLocale(settings = currentSettings) {
    try {
      if (typeof I18N?.resolveLocale === 'function') return I18N.resolveLocale(settings?.localeMode, navigator);
    } catch {}
    return 'en';
  }

  function translateText(text, locale = resolveUiLocale()) {
    try {
      if (typeof I18N?.translateText === 'function') return I18N.translateText(text, locale);
    } catch {}
    return String(text ?? '');
  }

  function localizeBody(locale = resolveUiLocale()) {
    try {
      document.documentElement.lang = String(locale || 'en');
    } catch {}
    try {
      if (typeof I18N?.localizeTree === 'function') I18N.localizeTree(document.body, locale);
    } catch {}
    try {
      document.title = translateText('AI捷径 设置', locale);
    } catch {}
    try {
      if (elStatus && lastStatusRaw) elStatus.textContent = translateText(lastStatusRaw, locale);
      elStatus?.classList?.remove?.('ok', 'warn', 'err');
      if (elStatus && lastStatusKind) elStatus.classList.add(lastStatusKind);
    } catch {}
  }

  function scheduleLocalizeBody() {
    if (localeObserverTimer) return;
    localeObserverTimer = window.setTimeout(() => {
      localeObserverTimer = 0;
      localizeBody(resolveUiLocale());
    }, 40);
  }

  function ensureLocaleObserver() {
    if (localeObserver || typeof MutationObserver !== 'function') return;
    try {
      localeObserver = new MutationObserver(() => scheduleLocalizeBody());
      localeObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    } catch {}
  }

  function detectPlatformOs() {
    const platform =
      String(
        navigator?.userAgentData?.platform ||
          navigator?.platform ||
          navigator?.userAgent ||
          ''
      ).toLowerCase();
    if (platform.includes('mac')) return 'mac';
    if (platform.includes('win')) return 'win';
    if (platform.includes('linux') || platform.includes('x11')) return 'linux';
    return 'unknown';
  }

  function detectDeviceContext() {
    const os = detectPlatformOs();
    return {
      os,
      hasMetaKey: os === 'mac'
    };
  }

  const DETECTED_DEVICE_CONTEXT = Object.freeze(detectDeviceContext());

  function formatDateTime(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '';
    try {
      const locale = resolveUiLocale();
      return new Date(n).toLocaleString(/^zh/i.test(String(locale || '')) ? 'zh-CN' : 'en-US');
    } catch {
      return String(n);
    }
  }

  function formatAgeMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '';
    const sec = Math.max(0, Math.floor(n / 1000));
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    if (hr > 0) return `${hr}h ${min % 60}m`;
    if (min > 0) return `${min}m ${sec % 60}s`;
    return `${sec}s`;
  }

  function formatMonitorIntervalMinutes(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return translateText('未知');
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      if (/^zh/i.test(resolveUiLocale())) return hours === 1 ? '1 小时' : `${hours} 小时`;
      return hours === 1 ? '1 hour' : `${hours} hours`;
    }
    return /^zh/i.test(resolveUiLocale()) ? `${minutes} 分钟` : `${minutes} minutes`;
  }

  function isChineseUi() {
    return /^zh/i.test(resolveUiLocale());
  }

  function localeText(zh, en) {
    return isChineseUi() ? zh : en;
  }

  function wrapAge(ageText) {
    const text = String(ageText || '').trim();
    if (!text) return '';
    return isChineseUi() ? `（${text}）` : `(${text})`;
  }

  function formatAgo(ageText) {
    const text = String(ageText || '').trim();
    if (!text) return '';
    return isChineseUi() ? `（${text} 前）` : `(${text} ago)`;
  }

  function formatGpt53AlertLine(ev) {
    try {
      const url = String(ev?.url || '');
      const status = Number(ev?.status) || 0;
      const u = new URL(url);
      const name = String(u.pathname || '').split('/').filter(Boolean).slice(-1)[0] || u.hostname;
      return status ? `${name}${isChineseUi() ? `（${status}）` : ` (${status})`}` : name;
    } catch {
      const status = Number(ev?.status) || 0;
      return status ? (isChineseUi() ? `（${status}）` : ` (${status})`) : '';
    }
  }

  function renderGpt53MonitorStatus(resp) {
    if (!elGpt53Status) return;
    elGpt53Status.textContent = '';
    if (!resp || resp.ok !== true) {
      elGpt53Status.textContent = localeText('（无响应）', '(no response)');
      return;
    }
    const alarm = resp.alarm && typeof resp.alarm === 'object' ? resp.alarm : null;
    const state = resp.state && typeof resp.state === 'object' ? resp.state : null;
    const now = Number(resp.now) || Date.now();
    const urls = Array.isArray(resp.urls) ? resp.urls.filter((u) => typeof u === 'string' && u.trim()) : [];

    // Sync URL list into textarea when the user isn't actively editing.
    try {
      if (elGpt53Urls && document.activeElement !== elGpt53Urls) {
        const next = urls.join('\n');
        if (elGpt53Urls.value !== next) elGpt53Urls.value = next;
      }
    } catch {}

    const items = state && state.items && typeof state.items === 'object' ? state.items : {};
    const results = urls.map((url) => {
      const it = items?.[url] && typeof items[url] === 'object' ? items[url] : null;
      const checkedAt = Number(it?.checkedAt) || 0;
      return {
        url,
        available: typeof it?.available === 'boolean' ? it.available : null,
        status: typeof it?.status === 'number' ? it.status : null,
        error: typeof it?.error === 'string' ? it.error : '',
        checkedAt,
        checkedAtText: formatDateTime(checkedAt),
        checkedAgo: checkedAt ? formatAgeMs(now - checkedAt) : ''
      };
    });

    const view = {
      globalEnabled: resp.enabled !== false,
      monitorEnabled: resp.monitorEnabled === true,
      monitorReason: typeof resp.monitorReason === 'string' ? resp.monitorReason : '',
      urls,
      alarm: alarm
        ? {
            name: alarm.name,
            periodInMinutes: alarm.periodInMinutes,
            scheduledTime: alarm.scheduledTime,
            scheduledAt: formatDateTime(alarm.scheduledTime),
            nextIn: Number.isFinite(Number(alarm.scheduledTime)) ? formatAgeMs(Number(alarm.scheduledTime) - now) : ''
          }
        : null,
      state: state
        ? {
            checkedAt: state.checkedAt,
            checkedAtText: formatDateTime(state.checkedAt),
            checkedAgo: Number.isFinite(Number(state.checkedAt)) ? formatAgeMs(now - Number(state.checkedAt)) : '',
            results
          }
        : { results },
      now,
      nowText: formatDateTime(now)
    };

    const summary = document.createElement('div');
    summary.className = 'gpt53StatusSummary';

    const pushLine = (label, value) => {
      const line = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = isChineseUi() ? `${label}：` : `${label}: `;
      line.appendChild(strong);
      line.appendChild(document.createTextNode(String(value || '')));
      summary.appendChild(line);
    };

    const interval = Number(view.alarm?.periodInMinutes) || 60;
    const monitorDetail = (() => {
      if (!view.globalEnabled) return localeText('关闭（扩展总开关已关闭）', 'Off (extension master switch is off)');
      if (!view.monitorEnabled && view.monitorReason === 'no_urls') return localeText('关闭（URL 列表为空）', 'Off (URL list is empty)');
      if (!view.monitorEnabled) return localeText('关闭', 'Off');
      return isChineseUi() ? `开启（每 ${formatMonitorIntervalMinutes(interval)}）` : `On (every ${formatMonitorIntervalMinutes(interval)})`;
    })();
    pushLine(localeText('监控', 'Monitor'), monitorDetail);

    if (view.monitorEnabled && view.alarm?.scheduledAt) {
      pushLine(localeText('下次', 'Next'), `${view.alarm.scheduledAt}${wrapAge(view.alarm.nextIn)}`);
    } else if (!view.monitorEnabled) {
      pushLine(localeText('下次', 'Next'), localeText('（未启用）', '(disabled)'));
    } else {
      pushLine(localeText('下次', 'Next'), localeText('（未知）', '(unknown)'));
    }

    const checkedAtText = view.state?.checkedAtText || '';
    const checkedAgo = view.state?.checkedAgo || '';
    if (checkedAtText) {
      pushLine(localeText('上次', 'Last'), `${checkedAtText}${formatAgo(checkedAgo)}`);
    } else {
      pushLine(localeText('上次', 'Last'), localeText('（未检测）', '(not checked)'));
    }

    elGpt53Status.appendChild(summary);

    const resultsList = Array.isArray(view.state?.results) ? view.state.results : [];
    if (!resultsList.length) {
      const empty = document.createElement('div');
      empty.style.marginTop = '10px';
      empty.style.color = 'var(--muted)';
      empty.style.fontSize = '12px';
      empty.textContent = localeText('（URL 列表为空）', '(URL list is empty)');
      elGpt53Status.appendChild(empty);
      return;
    }

    const table = document.createElement('div');
    table.className = 'gpt53Table';

    const header = document.createElement('div');
    header.className = 'gpt53TableHeader';
    header.innerHTML = isChineseUi()
      ? '<div>资源</div><div>状态</div><div>结果</div><div>上次</div>'
      : '<div>Resource</div><div>Status</div><div>Result</div><div>Last</div>';
    table.appendChild(header);

    for (const it of resultsList) {
      const url = String(it?.url || '').trim();
      const status = Number(it?.status) || 0;
      const available = typeof it?.available === 'boolean' ? it.available : null;
      const error = String(it?.error || '').trim();
      const checkedAgo = String(it?.checkedAgo || '').trim();
      const checkedAtText = String(it?.checkedAtText || '').trim();

      const name = (() => {
        try {
          const u = new URL(url);
          return String(u.pathname || '').split('/').filter(Boolean).slice(-1)[0] || u.hostname;
        } catch {
          return url || 'unknown';
        }
      })();

      const row = document.createElement('div');
      row.className = 'gpt53TableRow';

      const cellName = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'gpt53CellTitle';
      title.textContent = name;
      cellName.appendChild(title);
      if (url) {
        const sub = document.createElement('div');
        sub.className = 'gpt53CellSub';
        sub.textContent = url;
        cellName.appendChild(sub);
      }
      if (error) {
        const sub = document.createElement('div');
        sub.className = 'gpt53CellSub';
        sub.textContent = `error: ${error}`;
        cellName.appendChild(sub);
      }

      const cellStatus = document.createElement('div');
      cellStatus.textContent = status ? String(status) : '—';

      const cellResult = document.createElement('div');
      if (available === true) {
        cellResult.className = 'gpt53ResultOk';
        cellResult.textContent = localeText('可用', 'Available');
      } else if (available === false) {
        cellResult.className = 'gpt53ResultBad';
        cellResult.textContent = localeText('不可用', 'Unavailable');
      } else {
        cellResult.className = 'gpt53ResultUnknown';
        cellResult.textContent = localeText('未知', 'Unknown');
      }

      const cellWhen = document.createElement('div');
      cellWhen.textContent = checkedAgo ? (isChineseUi() ? `${checkedAgo} 前` : `${checkedAgo} ago`) : checkedAtText ? checkedAtText : '—';

      row.appendChild(cellName);
      row.appendChild(cellStatus);
      row.appendChild(cellResult);
      row.appendChild(cellWhen);
      table.appendChild(row);
    }

    elGpt53Status.appendChild(table);
  }

  function renderGpt53AlertBox(alerts) {
    if (!elGpt53AlertBox || !elGpt53AlertText) return;
    const unread = Number(alerts?.unread) || 0;
    const events = Array.isArray(alerts?.events) ? alerts.events : [];
    if (!unread || !events.length) {
      elGpt53AlertBox.hidden = true;
      elGpt53AlertText.textContent = '';
      return;
    }

    const last = events.slice(-3);
    const parts = last.map((x) => formatGpt53AlertLine(x)).filter(Boolean);
    const more = events.length > 3 ? `…+${events.length - 3}` : '';
    const joiner = isChineseUi() ? '，' : ', ';
    const msg = parts.length ? `${parts.join(joiner)}${more}` : '';
    elGpt53AlertText.textContent = localeText(
      `检测到 ${unread} 条资源可访问（每次检测都会提醒）：${msg}`,
      `${unread} monitored resources are reachable (each check will alert again): ${msg}`
    );
    elGpt53AlertBox.hidden = false;
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

  function withRuntimeRecoveryHint(message) {
    const text = String(message || '').trim();
    if (!text) return localeText('未知错误', 'Unknown error');
    const normalized = text.toLowerCase();
    const likelyServiceWorkerNotReady =
      normalized.includes('receiving end does not exist') ||
      normalized.includes('the message port closed before a response was received');
    if (!likelyServiceWorkerNotReady) return text;
    return localeText(
      `${text}（扩展后台未就绪：请确认加载的是 dist 目录，并在 chrome://extensions 点一次“重新加载”）`,
      `${text} (the extension background is not ready: make sure the dist directory is loaded, then click “Reload” once in chrome://extensions)`
    );
  }

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(withRuntimeRecoveryHint(err.message || String(err))));
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

  async function getSettings() {
    const resp = await sendMessage({ type: 'AISHORTCUTS_GET_SETTINGS' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to get settings');
    return resp.settings;
  }

  async function setSettings(settings) {
    const resp = await sendMessage({ type: 'AISHORTCUTS_SET_SETTINGS', settings });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to save settings');
    return resp.settings;
  }

  async function patchSettings(patch) {
    const resp = await sendMessage({ type: 'AISHORTCUTS_PATCH_SETTINGS', patch });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to patch settings');
    return resp.settings;
  }

  async function resetDefaults() {
    const resp = await sendMessage({ type: 'AISHORTCUTS_RESET_DEFAULTS' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to reset defaults');
    return resp.settings;
  }

  async function factoryReset() {
    const resp = await sendMessage({ type: 'AISHORTCUTS_FACTORY_RESET' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to factory reset');
    return resp;
  }

  async function reinjectNow() {
    const resp = await sendMessage({ type: 'AISHORTCUTS_REINJECT_NOW' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to reinject');
    return resp.settings;
  }

  function sanitizeCgptPerfSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : CGPT_PERF_DEFAULT_SETTINGS.enabled,
      virtualizeOffscreen:
        typeof s.virtualizeOffscreen === 'boolean' ? s.virtualizeOffscreen : CGPT_PERF_DEFAULT_SETTINGS.virtualizeOffscreen,
      optimizeHeavyBlocks:
        typeof s.optimizeHeavyBlocks === 'boolean' ? s.optimizeHeavyBlocks : CGPT_PERF_DEFAULT_SETTINGS.optimizeHeavyBlocks,
      disableAnimations:
        typeof s.disableAnimations === 'boolean' ? s.disableAnimations : CGPT_PERF_DEFAULT_SETTINGS.disableAnimations,
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
  let gpt53Seq = 0;
  let renderSeq = 0;
  let pendingDeepLinkScroll = null; // { siteId, moduleId }
  let teardownModuleSettingsSideEffects = () => {}; // called before switching module settings
  let currentSettings = null;
  let selectedSiteId = SITES[0]?.id || 'chatgpt';
  let selectedModuleId = 'quicknav';
  let siteSearchText = '';
  let moduleSearchText = '';
  let moduleSettingsRegistryPromise = null;
  let moduleSettingsRegistryMap = null;
  const moduleSettingsScriptLoaders = new Map();
  const CHATGPT_MODULE_ORDER = Object.freeze([
    'quicknav',
    'chatgpt_tab_queue',
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

  function getMetaKeyMode(settings = currentSettings) {
    return normalizeMetaKeyMode(settings?.metaKeyMode, META_KEY_MODE_AUTO);
  }

  function getLocaleMode(settings = currentSettings) {
    return normalizeLocaleMode(settings?.localeMode, LOCALE_MODE_AUTO);
  }

  function getEffectiveHasMetaKey(settings = currentSettings) {
    const mode = getMetaKeyMode(settings);
    if (mode === META_KEY_MODE_HAS_META) return true;
    if (mode === META_KEY_MODE_NO_META) return false;
    return !!DETECTED_DEVICE_CONTEXT.hasMetaKey;
  }

  function getMetaKeyModeLabel(mode) {
    const normalized = normalizeMetaKeyMode(mode, META_KEY_MODE_AUTO);
    if (normalized === META_KEY_MODE_HAS_META) return localeText('有 Meta 键', 'Meta key');
    if (normalized === META_KEY_MODE_NO_META) return localeText('无 Meta 键', 'No Meta key');
    return localeText('自动', 'Auto');
  }

  function getMetaKeyProfileSummary(settings = currentSettings) {
    const mode = getMetaKeyMode(settings);
    const hasMetaKey = getEffectiveHasMetaKey(settings);
    const effectiveLabel = hasMetaKey ? localeText('有 Meta 键', 'Meta key') : localeText('无 Meta 键', 'No Meta key');
    const detectedOsLabel =
      DETECTED_DEVICE_CONTEXT.os === 'mac'
        ? 'macOS'
        : DETECTED_DEVICE_CONTEXT.os === 'win'
          ? 'Windows'
          : DETECTED_DEVICE_CONTEXT.os === 'linux'
            ? 'Linux'
            : localeText('未知环境', 'Unknown environment');

    if (mode === META_KEY_MODE_AUTO) {
      return {
        pill: localeText(`自动 · ${effectiveLabel}`, `Auto · ${effectiveLabel}`),
        state: localeText(`当前按“${effectiveLabel}”处理快捷键。`, `Hotkeys are currently handled as if a ${effectiveLabel.toLowerCase()} is available.`),
        hint: localeText(
          `自动检测基于当前设备环境：${detectedOsLabel}。无 Meta 键时，依赖 ⌘ 的快捷键会默认停用；Ctrl+S / T / Y / Z 这类冲突型快捷键也会默认停用。`,
          `Automatic detection uses the current device environment: ${detectedOsLabel}. Without a Meta key, ⌘-based hotkeys are disabled by default; Ctrl+S / T / Y / Z conflict-prone hotkeys are also disabled.`
        )
      };
    }

    return {
      pill: getMetaKeyModeLabel(mode),
      state: localeText(`你已手动指定为“${effectiveLabel}”。`, `You manually set this device as ${effectiveLabel.toLowerCase()}.`),
      hint:
        mode === META_KEY_MODE_HAS_META
          ? localeText(
              '会按带 Meta 键的键盘处理快捷键策略。依赖 ⌘ 的模块默认可用，Ctrl 冲突型快捷键不再默认停用。',
              'Hotkeys are handled as if a Meta key is available. ⌘-based modules stay enabled by default, and the conflicting Ctrl hotkeys are no longer disabled.'
            )
          : localeText(
              '会按不带 Meta 键的键盘处理快捷键策略。依赖 ⌘ 的模块默认停用，Ctrl+S / T / Y / Z 这类冲突型快捷键也默认停用。',
              'Hotkeys are handled as if no Meta key is available. ⌘-based modules are disabled by default, and Ctrl+S / T / Y / Z are also disabled to avoid conflicts.'
            )
    };
  }

  function renderLocaleModeToggle() {
    const mode = getLocaleMode();
    const locale = resolveUiLocale();
    const isZh = /^zh/i.test(String(locale || ''));
    if (elLocaleToggle) {
      const label = isZh ? 'Switch UI language to English' : '切换界面语言到中文';
      elLocaleToggle.setAttribute('aria-label', label);
      elLocaleToggle.title = label;
    }

    if (btnLocaleToggleZh) {
      const active = mode === LOCALE_MODE_ZH_CN || (mode === LOCALE_MODE_AUTO && isZh);
      btnLocaleToggleZh.classList.toggle('active', active);
      btnLocaleToggleZh.setAttribute('aria-pressed', active ? 'true' : 'false');
      btnLocaleToggleZh.title =
        mode === LOCALE_MODE_AUTO
          ? (isZh ? 'Auto mode · currently Chinese' : '切换为简体中文')
          : (active ? '当前：简体中文' : '切换为简体中文');
    }

    if (btnLocaleToggleEn) {
      const active = mode === LOCALE_MODE_EN || (mode === LOCALE_MODE_AUTO && !isZh);
      btnLocaleToggleEn.classList.toggle('active', active);
      btnLocaleToggleEn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btnLocaleToggleEn.title =
        mode === LOCALE_MODE_AUTO
          ? (!isZh ? 'Auto mode · currently English' : 'Switch to English')
          : (active ? 'Current: English' : 'Switch to English');
    }
  }

  function getSiteModuleSetting(siteId, key, fallback = false) {
    const value = currentSettings?.siteModules?.[siteId]?.[key];
    return typeof value === 'boolean' ? value : fallback;
  }

  function getModuleHotkeyPolicy(moduleId) {
    const def = MODULES?.[moduleId];
    return def?.hotkeyPolicy && typeof def.hotkeyPolicy === 'object' ? def.hotkeyPolicy : null;
  }

  function getModuleHotkeyControls(moduleId) {
    return Array.isArray(MODULES?.[moduleId]?.hotkeyControls) ? MODULES[moduleId].hotkeyControls : [];
  }

  function getModuleHotkeyPolicyState(siteId, moduleId) {
    const policy = getModuleHotkeyPolicy(moduleId);
    const controls = getModuleHotkeyControls(moduleId);
    if (!policy || !controls.length) return null;

    const profile = String(policy.profile || '').trim();
    if (profile !== 'requires_meta_key' && profile !== 'prefer_meta_key') return null;

    const hasMetaKey = getEffectiveHasMetaKey();
    const profileBlocked = !hasMetaKey;
    const forceKey = String(policy.forceKey || '').trim();
    const forceEnabled = forceKey ? getSiteModuleSetting(siteId, forceKey, false) : false;
    const controlStates = controls.map((control) => {
      const key = String(control?.key || '').trim();
      return {
        key,
        label: String(control?.label || '').trim(),
        enabled: key ? getSiteModuleSetting(siteId, key, true) : false
      };
    });
    const anyConfiguredEnabled = controlStates.some((control) => control.enabled);
    const anyEffectiveEnabled = controlStates.some((control) => control.enabled && (!profileBlocked || forceEnabled));
    const shouldWarn = profileBlocked && (anyConfiguredEnabled || forceEnabled);

    return {
      moduleId,
      siteId,
      policy,
      profile,
      hasMetaKey,
      profileBlocked,
      forceEnabled,
      anyConfiguredEnabled,
      anyEffectiveEnabled,
      shouldWarn,
      controls: controlStates
    };
  }

  function buildModuleHotkeyWarningText(state) {
    if (!state || !state.shouldWarn) return '';
    const mode = getMetaKeyMode();
    const forceKey = String(state?.policy?.forceKey || '').trim();
    const canForce = !!forceKey;
    const prefix = mode === META_KEY_MODE_AUTO
      ? localeText('当前自动判定为“无 Meta 键”。', 'Auto mode currently treats this device as having no Meta key.')
      : localeText('当前键盘能力已设为“无 Meta 键”。', 'Keyboard capability is currently set to “no Meta key”.');

    if (state.profile === 'requires_meta_key') {
      if (state.forceEnabled) {
        return localeText(
          `${prefix} 这组快捷键原本依赖 Meta 键，你已强制保留；如果你的键盘没有可用的 Meta 映射，它仍可能无法触发。`,
          `${prefix} These hotkeys originally depend on a Meta key. You kept them force-enabled, but they still may not trigger if no usable Meta mapping exists.`
        );
      }
      return canForce
        ? localeText(
            `${prefix} 这组快捷键依赖 Meta 键，因此默认停用；若你实际有映射后的 Meta 键，可在详情里强制开启。`,
            `${prefix} These hotkeys depend on a Meta key, so they are disabled by default. If you actually have a mapped Meta key, you can force-enable them in the details panel.`
          )
        : localeText(
            `${prefix} 这组快捷键依赖 Meta 键，因此当前不会生效；如果你的设备其实有可用的 Meta 键，请把右上角键盘能力切回“自动”或“我有 Meta 键”。`,
            `${prefix} These hotkeys depend on a Meta key and will not work. If your device really has a usable Meta key, switch the keyboard capability to “Auto” or “I have a Meta key”.`
          );
    }

    return state.forceEnabled
      ? localeText(
          `${prefix} 这组 Ctrl 快捷键在无 Meta 键设备上容易与浏览器或系统快捷键冲突，你已强制保留。`,
          `${prefix} This Ctrl hotkey group often conflicts with browser or system shortcuts on keyboards without a Meta key, and you have kept it force-enabled.`
        )
      : localeText(
          `${prefix} 这组 Ctrl 快捷键在无 Meta 键设备上容易与浏览器或系统快捷键冲突，因此默认停用。`,
          `${prefix} This Ctrl hotkey group often conflicts with browser or system shortcuts on keyboards without a Meta key, so it is disabled by default.`
        );
  }

  function createModuleHotkeyWarningIndicator(state) {
    if (!state?.shouldWarn) return null;
    const wrap = document.createElement('span');
    wrap.className = 'triWarn';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.textContent = '!';

    const card = document.createElement('span');
    card.className = 'triWarnCard';
    card.textContent = buildModuleHotkeyWarningText(state);
    wrap.appendChild(card);
    return wrap;
  }

  function appendHotkeyPolicyNote(siteId, moduleId) {
    const state = getModuleHotkeyPolicyState(siteId, moduleId);
    if (!state?.shouldWarn) return null;

    const note = document.createElement('div');
    note.className = 'hotkeyPolicyNote';

    const title = document.createElement('div');
    title.className = 'hotkeyPolicyNoteTitle';
    title.textContent = localeText(
      state.forceEnabled ? '快捷键已强制保留' : '快捷键当前默认停用',
      state.forceEnabled ? 'Hotkeys are force-enabled' : 'Hotkeys are currently disabled by default'
    );

    const text = document.createElement('div');
    text.className = 'hotkeyPolicyNoteText';
    text.textContent = buildModuleHotkeyWarningText(state);

    note.appendChild(title);
    note.appendChild(text);
    elModuleSettings.appendChild(note);
    return state;
  }

  function confirmForceEnableHotkeys(state) {
    if (!state?.profileBlocked) return true;
    const message = state.profile === 'requires_meta_key'
      ? localeText(
          '当前配置按“无 Meta 键”处理。强制开启后，若你的键盘没有可用的 Meta 键或映射，⌘O / ⌘J 仍可能无法使用。\n\n确定继续强制开启吗？',
          'The current configuration treats this keyboard as having no Meta key. If you force-enable it, ⌘O / ⌘J may still fail if your keyboard has no usable Meta mapping.\n\nContinue anyway?'
        )
      : localeText(
          '当前配置按“无 Meta 键”处理。强制开启后，Ctrl+S / Ctrl+T / Ctrl+Y / Ctrl+Z 可能与浏览器或系统快捷键冲突。\n\n确定继续强制开启吗？',
          'The current configuration treats this keyboard as having no Meta key. If you force-enable it, Ctrl+S / Ctrl+T / Ctrl+Y / Ctrl+Z may conflict with browser or system shortcuts.\n\nContinue anyway?'
        );
    return window.confirm(message);
  }

  function renderMetaKeyProfileCard() {
    const mode = getMetaKeyMode();
    const summary = getMetaKeyProfileSummary();
    const controls = [
      [inputMetaKeyModeAuto, META_KEY_MODE_AUTO],
      [inputMetaKeyModeHasMeta, META_KEY_MODE_HAS_META],
      [inputMetaKeyModeNoMeta, META_KEY_MODE_NO_META]
    ];

    for (const [input, value] of controls) {
      if (!input) continue;
      const checked = mode === value;
      input.checked = checked;
      input.parentElement?.classList.toggle('is-active', checked);
    }

    setNodeText(elMetaKeyProfileState, summary.state);
    setNodeText(elMetaKeyProfilePill, summary.pill);
    setNodeText(elMetaKeyProfileHint, summary.hint);
  }

  function normalizeSearchText(s) {
    return String(s || '').trim().toLowerCase();
  }

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

  function siteMatchesSearch(site, term) {
    const t = normalizeSearchText(term);
    if (!t) return true;
    const hay = `${site?.name || ''} ${site?.sub || ''} ${site?.id || ''}`.toLowerCase();
    return hay.includes(t);
  }

  function shortenChatGPTModuleName(name) {
    return String(name || '').replace(/^ChatGPT\s+/i, '').trim();
  }

  function getSiteDisplayMeta(siteIdOrSite) {
    const site =
      siteIdOrSite && typeof siteIdOrSite === 'object'
        ? siteIdOrSite
        : getSite(siteIdOrSite);
    return {
      name: translateText(String(site?.name || '').trim()),
      sub: translateText(String(site?.sub || '').trim())
    };
  }

  function getModuleDisplayMeta(siteId, moduleId) {
    const def = MODULES?.[moduleId];
    let name = translateText(String(def?.name || moduleId || '').trim());
    const sub = translateText(String(def?.sub || '').trim());
    if (siteId === 'chatgpt') name = shortenChatGPTModuleName(name);
    return { name, sub };
  }

  function setNodeText(node, text) {
    if (!node) return;
    const raw = text == null ? '' : String(text).trim();
    node.textContent = translateText(raw);
  }

  function formatCountLabel(visible, total) {
    const v = Math.max(0, Number(visible) || 0);
    const t = Math.max(0, Number(total) || 0);
    return v === t ? String(t) : `${v}/${t}`;
  }

  function createTriEmpty(title, detail) {
    const wrap = document.createElement('div');
    wrap.className = 'triEmpty';

    const heading = document.createElement('div');
    heading.className = 'triEmptyTitle';
    heading.textContent = translateText(title);
    wrap.appendChild(heading);

    if (detail) {
      const text = document.createElement('div');
      text.className = 'triEmptyDetail';
      text.textContent = translateText(detail);
      wrap.appendChild(text);
    }

    return wrap;
  }

  function renderConfigContext(siteId, moduleId) {
    const site = getSite(siteId);
    const moduleDef = MODULES?.[moduleId] || null;
    const display = getModuleDisplayMeta(siteId, moduleId);
    const siteModules = Array.isArray(site?.modules) ? site.modules : [];
    const totalSites = SITES.length;
    const visibleSites = getFilteredSites();
    const visibleModules = getFilteredModuleIds(siteId);
    const hotkeysText = formatHotkeys(moduleDef?.hotkeys);
    setNodeText(elSiteListCount, formatCountLabel(visibleSites.length, totalSites));
    setNodeText(elModuleListCount, formatCountLabel(visibleModules.length, siteModules.length));
    setNodeText(elSiteListNote, siteSearchText ? `筛出 ${visibleSites.length} 个网站。` : '按站点切换。');
    const siteDisplay = getSiteDisplayMeta(site);
    setNodeText(
      elModuleListNote,
      site ? `${siteDisplay.name} · ${siteDisplay.sub || '当前站点脚本清单'}` : '选择网站后查看该站点脚本。'
    );
    setPanelHeaderContent({
      title: display.name || '未选择脚本',
      subtitle: site && moduleDef ? display.sub || '编辑该模块的详细配置。' : '选择中间脚本后加载对应设置面板。',
      chips: moduleDef ? [siteDisplay.name || '', isModuleEnabled(siteId, moduleId) ? '已启用' : '已停用', hotkeysText] : [],
      infoEntries: moduleDef ? getPanelInfoEntries(moduleId) : []
    });
  }

  function moduleMatchesSearch(siteId, moduleId, term) {
    const t = normalizeSearchText(term);
    if (!t) return true;
    const display = getModuleDisplayMeta(siteId, moduleId);
    const def = MODULES?.[moduleId];
    const hay = `${display.name || ''} ${display.sub || ''} ${def?.name || ''} ${def?.sub || ''} ${moduleId || ''}`.toLowerCase();
    return hay.includes(t);
  }

  function getModuleSortWeight(siteId, item) {
    if (siteId === 'chatgpt') {
      const orderIdx = CHATGPT_MODULE_ORDER.indexOf(item.id);
      return orderIdx >= 0 ? orderIdx : 1000 + item.idx;
    }
    return item.hasMenu ? -1000 + item.idx : item.idx;
  }

  function getSite(id) {
    return SITES.find((s) => s.id === id) || null;
  }

  function parseDeepLinkHash() {
    try {
      const raw = String(window.location.hash || '').trim();
      if (!raw || raw === '#') return null;
      const params = new URLSearchParams(raw.replace(/^#/, ''));
      const site = String(params.get('site') || '').trim();
      const moduleId = toCanonicalModuleId(params.get('module'));
      if (!site) return null;
      return { site, moduleId };
    } catch {
      return null;
    }
  }

  function applyDeepLinkSelection() {
    const parsed = parseDeepLinkHash();
    if (!parsed) return false;
    const site = getSite(parsed.site);
    if (!site) return false;

    selectedSiteId = site.id;
    if (typeof parsed.moduleId === 'string' && parsed.moduleId && Array.isArray(site.modules) && site.modules.includes(parsed.moduleId)) {
      selectedModuleId = parsed.moduleId;
    }

    // Clear searches so the deep-linked target is always visible/selected.
    siteSearchText = '';
    moduleSearchText = '';
    if (elSiteSearch) elSiteSearch.value = '';
    if (elModuleSearch) elModuleSearch.value = '';

    pendingDeepLinkScroll = { siteId: selectedSiteId, moduleId: selectedModuleId };
    return true;
  }

  function scrollTriListToSelected(listEl) {
    if (!listEl) return false;
    const selected = listEl.querySelector('.triRow.selected');
    if (!selected) return false;
    const isVisible = () => {
      try {
        const listRect = listEl.getBoundingClientRect();
        const elRect = selected.getBoundingClientRect();
        // Allow a tiny margin for sub-pixel/scrollbar rounding.
        return elRect.top >= listRect.top - 2 && elRect.bottom <= listRect.bottom + 2;
      } catch {
        return false;
      }
    };
    if (isVisible()) return true;
    try {
      selected.scrollIntoView({ block: 'center', inline: 'nearest' });
      return isVisible();
    } catch {
      try {
        selected.scrollIntoView();
        return isVisible();
      } catch {
        return false;
      }
    }
  }

  function flushDeepLinkScroll() {
    if (!pendingDeepLinkScroll) return;

    const startedAt = Date.now();
    const DEADLINE_MS = 1500;

    const attempt = () => {
      if (!pendingDeepLinkScroll) return;
      const okA = scrollTriListToSelected(elSiteList);
      const okB = scrollTriListToSelected(elModuleList);

      // If we at least located the selected row(s), treat it as success and stop retrying.
      if (okA || okB) {
        pendingDeepLinkScroll = null;
        return;
      }

      if (Date.now() - startedAt > DEADLINE_MS) {
        pendingDeepLinkScroll = null;
        return;
      }

      try {
        requestAnimationFrame(attempt);
      } catch {
        setTimeout(attempt, 50);
      }
    };

    // Run after paint so the scroll containers have computed sizes.
    try {
      requestAnimationFrame(attempt);
    } catch {
      setTimeout(attempt, 0);
    }
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
        const wa = getModuleSortWeight(siteId, a);
        const wb = getModuleSortWeight(siteId, b);
        if (wa !== wb) return wa - wb;
        return a.idx - b.idx;
      })
      .map((x) => x.id)
      .filter((id) => moduleMatchesSearch(siteId, id, moduleSearchText));
    return mods;
  }

  function effectiveSelectedModuleId(siteId) {
    const allMods = getSite(siteId)?.modules || [];
    const filtered = getFilteredModuleIds(siteId);
    const selected = toCanonicalModuleId(selectedModuleId) || selectedModuleId;
    if (filtered.length) {
      if (filtered.includes(selected)) return selected;
      return filtered[0];
    }
    if (allMods.includes(selected)) return selected;
    return allMods[0] || 'quicknav';
  }

  function buildPatchFromSettingsDiff(prev, next) {
    const out = [];
    const a = prev && typeof prev === 'object' ? prev : {};
    const b = next && typeof next === 'object' ? next : {};

    if (typeof b.enabled === 'boolean' && b.enabled !== !!a.enabled) {
      out.push({ op: 'set', path: ['enabled'], value: b.enabled });
    }

    if (normalizeMetaKeyMode(b.metaKeyMode, META_KEY_MODE_AUTO) !== normalizeMetaKeyMode(a.metaKeyMode, META_KEY_MODE_AUTO)) {
      out.push({ op: 'set', path: ['metaKeyMode'], value: normalizeMetaKeyMode(b.metaKeyMode, META_KEY_MODE_AUTO) });
    }
    if (normalizeLocaleMode(b.localeMode, LOCALE_MODE_AUTO) !== normalizeLocaleMode(a.localeMode, LOCALE_MODE_AUTO)) {
      out.push({ op: 'set', path: ['localeMode'], value: normalizeLocaleMode(b.localeMode, LOCALE_MODE_AUTO) });
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
    const canonical = toCanonicalModuleId(moduleId);
    const mods = currentSettings?.siteModules?.[siteId];
    const v = mods?.[canonical];
    if (typeof v === 'boolean') return v;
    const aliases = MODULE_ALIAS_TARGETS?.[canonical];
    if (Array.isArray(aliases)) {
      for (const legacyId of aliases) {
        const legacyValue = mods?.[legacyId];
        if (typeof legacyValue === 'boolean') return legacyValue;
      }
    }
    return v !== false;
  }

  function bindTriRowClick(row, onSelect) {
    row.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.triBtn, .triToggle')) return;
      onSelect();
    });
  }

  function renderSites(activeSiteId) {
    if (!elSiteList) return;
    elSiteList.textContent = '';
    const filteredSites = getFilteredSites();
    if (!filteredSites.length) {
      elSiteList.appendChild(createTriEmpty('没有匹配的网站', siteSearchText ? '调整搜索词，或清空搜索后查看全部网站。' : '当前没有可展示的网站。'));
      return;
    }

    for (const s of filteredSites) {
      const display = getSiteDisplayMeta(s);
      const siteEnabled = isSiteEnabled(s.id);
      const row = document.createElement('div');
      row.className = 'triRow' + (s.id === activeSiteId ? ' selected' : '') + (siteEnabled ? '' : ' is-disabled');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'triBtn';

      const name = document.createElement('div');
      name.className = 'triName';
      name.textContent = display.name || s.name;

      const sub = document.createElement('div');
      sub.className = 'triSub';
      sub.textContent = display.sub || s.sub;

      btn.appendChild(name);
      btn.appendChild(sub);
      const selectSite = () => {
        selectedSiteId = s.id;
        selectedModuleId = effectiveSelectedModuleId(s.id);
        renderAll();
      };
      btn.addEventListener('click', selectSite);
      bindTriRowClick(row, selectSite);

      const toggleWrap = document.createElement('label');
      toggleWrap.className = 'triToggle';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = siteEnabled;
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
    if (!mods.length) {
      elModuleList.appendChild(
        createTriEmpty('没有匹配的脚本', moduleSearchText ? '调整搜索词，或切换到其他网站继续查看。' : '当前网站没有可展示的脚本。')
      );
      return;
    }

    for (const moduleId of mods) {
      const def = MODULES[moduleId];
      if (!def) continue;
      const display = getModuleDisplayMeta(siteId, moduleId);
      const moduleEnabled = isModuleEnabled(siteId, moduleId);

      const row = document.createElement('div');
      row.className = 'triRow' + (moduleId === activeModuleId ? ' selected' : '') + (moduleEnabled ? '' : ' is-disabled');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'triBtn';

      const name = document.createElement('div');
      name.className = 'triName';
      name.textContent = display.name || def.name;
      const nameRow = document.createElement('div');
      nameRow.className = 'triNameRow';
      nameRow.appendChild(name);

      const hotkeyPolicyState = getModuleHotkeyPolicyState(siteId, moduleId);
      const warningIndicator = createModuleHotkeyWarningIndicator(hotkeyPolicyState);
      if (warningIndicator) nameRow.appendChild(warningIndicator);

      const sub = document.createElement('div');
      sub.className = 'triSub';
      sub.textContent = display.sub || '';

      const hotkeysText = formatHotkeys(def.hotkeys);
      const hotkeys = document.createElement('div');
      hotkeys.className = 'triSub triHotkeys';
      hotkeys.textContent = hotkeysText ? localeText(`快捷键：${hotkeysText}`, `Hotkeys: ${hotkeysText}`) : '';

      btn.appendChild(nameRow);
      btn.appendChild(sub);
      if (hotkeysText) btn.appendChild(hotkeys);
      const selectModule = () => {
        selectedModuleId = moduleId;
        renderAll();
      };
      btn.addEventListener('click', selectModule);
      bindTriRowClick(row, selectModule);

      const toggleWrap = document.createElement('label');
      toggleWrap.className = 'triToggle';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = moduleEnabled;
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
    h.textContent = translateText(title);
    elModuleSettings.appendChild(h);

    if (subtitle) {
      const s = document.createElement('div');
      s.className = 'panelSubtitle';
      s.textContent = translateText(subtitle);
      elModuleSettings.appendChild(s);
    }
  }

  function getPanelInfoEntries(moduleId) {
    const def = MODULES?.[moduleId] || null;
    const authors = Array.isArray(def?.authors) ? def.authors.map((v) => String(v || '').trim()).filter(Boolean) : [];
    const license = typeof def?.license === 'string' ? def.license.trim() : '';
    const upstream = typeof def?.upstream === 'string' ? def.upstream.trim() : '';
    const entries = [];
    if (authors.length) entries.push({ label: localeText('作者', 'Author'), text: authors.join(' / ') });
    if (license) entries.push({ label: localeText('许可', 'License'), text: license });
    if (upstream) entries.push({ label: localeText('上游', 'Upstream'), url: upstream });
    return entries;
  }

  function renderPanelInfoEntries(entries) {
    if (!elPanelInfoWrap || !elPanelInfoCard) return;
    elPanelInfoCard.textContent = '';

    const list = Array.isArray(entries) ? entries.filter((entry) => entry && (entry.text || entry.url)) : [];
    if (!list.length) {
      elPanelInfoWrap.hidden = true;
      elPanelInfoCard.setAttribute('aria-hidden', 'true');
      return;
    }

    for (const entry of list) {
      const row = document.createElement('div');
      row.className = 'panelInfoRow';

      const key = document.createElement('div');
      key.className = 'panelInfoKey';
      key.textContent = translateText(String(entry.label || '').trim());

      const val = document.createElement('div');
      val.className = 'panelInfoVal';
      if (entry.url) {
        const link = document.createElement('a');
        link.href = entry.url;
        link.textContent = entry.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.addEventListener('click', (e) => {
          e.preventDefault();
          openUrlSafe(entry.url);
        });
        val.appendChild(link);
      } else {
        val.textContent = translateText(String(entry.text || '').trim());
      }

      row.appendChild(key);
      row.appendChild(val);
      elPanelInfoCard.appendChild(row);
    }

    elPanelInfoWrap.hidden = false;
    elPanelInfoCard.setAttribute('aria-hidden', 'false');
  }

  function renderPanelMetaChips(items) {
    if (!elPanelSelectionMeta) return;
    elPanelSelectionMeta.textContent = '';

    const list = Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
    if (!list.length) {
      elPanelSelectionMeta.hidden = true;
      return;
    }

    for (const item of list) {
      const chip = document.createElement('span');
      chip.className = 'panelShellChip';
      chip.textContent = translateText(item);
      elPanelSelectionMeta.appendChild(chip);
    }

    elPanelSelectionMeta.hidden = false;
  }

  function setPanelHeaderContent({ title, subtitle = '', chips = [], infoEntries = [] } = {}) {
    setNodeText(elPanelSelectionTitle, title || '未选择脚本');
    setNodeText(elPanelSelectionSub, subtitle || '选择中间脚本后加载对应设置面板。');
    renderPanelMetaChips(chips);
    renderPanelInfoEntries(infoEntries);
  }

  function addPanelDivider() {
    const d = document.createElement('div');
    d.className = 'panelGroup';
    elModuleSettings.appendChild(d);
  }

  function addModuleHeader(moduleId, title, subtitle) {
    const site = getSite(selectedSiteId);
    const display = getModuleDisplayMeta(selectedSiteId, moduleId);
    const def = MODULES?.[moduleId] || null;
    const hotkeysText = formatHotkeys(def?.hotkeys);
    setPanelHeaderContent({
      title: display.name || String(title || '').trim() || moduleId,
      subtitle: String(subtitle || '').trim() || display.sub || '编辑该模块的详细配置。',
      chips: [getSiteDisplayMeta(site).name || '', isModuleEnabled(selectedSiteId, moduleId) ? '已启用' : '已停用', hotkeysText],
      infoEntries: getPanelInfoEntries(moduleId)
    });
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
      return true;
    };

    const commandMatchesModule = (command, modId) => {
      const expectedModuleId = toCanonicalModuleId(modId) || String(modId || '').trim();
      if (!expectedModuleId) return true;
      const commandModuleId = toCanonicalModuleId(command?.moduleId);
      if (commandModuleId) return commandModuleId === expectedModuleId;
      return groupMatchesModule(command?.group, expectedModuleId);
    };

    const baseMenuName = (name) => String(name || '').replace(/（[^）]*）/g, '').trim();

    const findMenuCommand = (commands, modId, label) => {
      const list = Array.isArray(commands) ? commands : [];
      const filtered = list.filter((c) => commandMatchesModule(c, modId));

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
          menuResp = await tabsSendMessage(tabId, { type: 'AISHORTCUTS_GET_MENU' });
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

        const runResp = await tabsSendMessage(tabId, { type: 'AISHORTCUTS_RUN_MENU', id: cmd.id });
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

    if (siteId === 'chatgpt') {
      const rowHideNativeOutline = document.createElement('label');
      rowHideNativeOutline.className = 'formRow';
      const leftHideNativeOutline = document.createElement('span');
      leftHideNativeOutline.textContent = '默认隐藏 ChatGPT 原生对话横杠目录';
      leftHideNativeOutline.title = '默认开启：当页面右侧出现 ChatGPT 自带的细横杠对话目录时，QuickNav 会自动把它隐藏，只保留扩展自己的 QuickNav。';
      const inputHideNativeOutline = document.createElement('input');
      inputHideNativeOutline.type = 'checkbox';
      inputHideNativeOutline.checked = getSiteModuleSetting(siteId, 'chatgpt_quicknav_hide_native_outline', true);
      inputHideNativeOutline.addEventListener('change', () => {
        const checked = !!inputHideNativeOutline.checked;
        patchQuickNavSettings((next) => {
          next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
          next.siteModules[siteId] =
            next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
          next.siteModules[siteId].chatgpt_quicknav_hide_native_outline = checked;
          next.siteModules[siteId].chatgpt_quicknav_hide_native_outline_user_set = true;
        });
      });
      rowHideNativeOutline.appendChild(leftHideNativeOutline);
      rowHideNativeOutline.appendChild(inputHideNativeOutline);
      elModuleSettings.appendChild(rowHideNativeOutline);
    }

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
        key: 'optimizeHeavyBlocks',
        label: '重内容优化（默认开）',
        title: '对 pre/table/公式/段落块等高开销内容使用 contain/content-visibility，减少长回复卡顿。'
      },
      {
        key: 'disableAnimations',
        label: '禁用动画/过渡（默认开）',
        title: '将对话线程范围内的动画/过渡 duration 置 0，减少合成与重绘开销；避免误伤整个站点页面。'
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
      return getSiteModuleSetting(siteId, key, true);
    };
    const hotkeyPolicyState = appendHotkeyPolicyNote(siteId, 'chatgpt_thinking_toggle');

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

    const rowForce = document.createElement('label');
    rowForce.className = 'formRow';
    const leftForce = document.createElement('span');
    leftForce.textContent = '无 Meta 键时仍强制启用 ⌘O / ⌘J';
    const inputForce = document.createElement('input');
    inputForce.type = 'checkbox';
    inputForce.checked = getSiteModuleSetting(siteId, 'chatgpt_thinking_toggle_hotkeys_force', false);
    inputForce.addEventListener('change', () => {
      const checked = !!inputForce.checked;
      if (checked && !confirmForceEnableHotkeys(hotkeyPolicyState || getModuleHotkeyPolicyState(siteId, 'chatgpt_thinking_toggle'))) {
        inputForce.checked = false;
        return;
      }
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_thinking_toggle_hotkeys_force = checked;
      });
    });
    rowForce.appendChild(leftForce);
    rowForce.appendChild(inputForce);
    elModuleSettings.appendChild(rowForce);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '提示：该模块会在页面主世界（MAIN world）监听 ⌘O/⌘J（可分别关闭）；并在发送成功后右下角弹窗显示实际使用的 thinking_effort（以及 model）。关闭模块后已打开页面可能需要刷新才会完全停用。若你把键盘能力设为“无 Meta 键”，这里只会保留模块注入，快捷键默认停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderQwenThinkingToggleModuleSettings(siteId) {
    addModuleHeader('qwen_thinking_toggle', 'Qwen 模型/推理 快捷切换', '在 Qwen 中用 ⌘O / ⌘J 切换推理模式与模型。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'qwen_thinking_toggle');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].qwen_thinking_toggle = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const hotkeyPolicyState = appendHotkeyPolicyNote(siteId, 'qwen_thinking_toggle');

    const rowHotkeys = document.createElement('label');
    rowHotkeys.className = 'formRow';
    const leftHotkeys = document.createElement('span');
    leftHotkeys.textContent = '启用 ⌘O / ⌘J 快捷键';
    const inputHotkeys = document.createElement('input');
    inputHotkeys.type = 'checkbox';
    inputHotkeys.checked = getSiteModuleSetting(siteId, 'qwen_thinking_toggle_hotkeys', true);
    inputHotkeys.addEventListener('change', () => {
      const checked = !!inputHotkeys.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].qwen_thinking_toggle_hotkeys = checked;
      });
    });
    rowHotkeys.appendChild(leftHotkeys);
    rowHotkeys.appendChild(inputHotkeys);
    elModuleSettings.appendChild(rowHotkeys);

    const rowForce = document.createElement('label');
    rowForce.className = 'formRow';
    const leftForce = document.createElement('span');
    leftForce.textContent = '无 Meta 键时仍强制启用 ⌘O / ⌘J';
    const inputForce = document.createElement('input');
    inputForce.type = 'checkbox';
    inputForce.checked = getSiteModuleSetting(siteId, 'qwen_thinking_toggle_hotkeys_force', false);
    inputForce.addEventListener('change', () => {
      const checked = !!inputForce.checked;
      if (checked && !confirmForceEnableHotkeys(hotkeyPolicyState || getModuleHotkeyPolicyState(siteId, 'qwen_thinking_toggle'))) {
        inputForce.checked = false;
        return;
      }
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].qwen_thinking_toggle_hotkeys_force = checked;
      });
    });
    rowForce.appendChild(leftForce);
    rowForce.appendChild(inputForce);
    elModuleSettings.appendChild(rowForce);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent = '提示：模块本身仍会保留页面逻辑；当键盘能力按“无 Meta 键”处理时，⌘O / ⌘J 默认停用，但你仍可手动强制保留。';
    elModuleSettings.appendChild(hint);
  }

  function renderCmdEnterSendModuleSettings(siteId) {
    addModuleHeader('cmdenter_send', '⌘Enter 发送（通用）', '把 Enter/Shift+Enter 变为换行，⌘/Ctrl+Enter 才发送消息。');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'cmdenter_send');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].cmdenter_send = checked;
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
    const usageText = (zh, en) => localeText(zh, en);
    addModuleHeader(
      'chatgpt_usage_monitor',
      usageText('ChatGPT 用量统计', 'Usage Monitor'),
      usageText(
        '在配置页展示“油猴同款”用量面板（含滑动窗口与进度条）；数据来自 storage.local（需在 chatgpt.com 发送消息后才会产生记录）。',
        'Shows the Tampermonkey-style usage panel in Options, including sliding windows and progress bars. Data comes from storage.local and appears after you send messages on chatgpt.com.'
      )
    );

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = usageText('启用该模块注入', 'Enable this module injection');
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
      usageText(
        '说明：该模块在页面主世界（MAIN world）拦截 fetch，并从 /backend-api/* 的请求与 SSE metadata 推断最终模型路由；为稳定与性能考虑，不在 chatgpt.com 页面注入用量面板，仅在本配置页展示。',
        'This module intercepts fetch in the page MAIN world and infers the final model route from /backend-api/* requests plus SSE metadata. For stability and performance, it does not inject the usage panel on chatgpt.com itself; it is shown only in this settings page.'
      );
    elModuleSettings.appendChild(hint);

    let planType;
    try {
      planType = await loadCgptUsageMonitorPlanType();
    } catch (e) {
      if (token !== renderSeq) return;
      planType = CGPT_USAGE_MONITOR_PLAN_DEFAULT;
      const err = document.createElement('div');
      err.className = 'smallHint';
      err.textContent = usageText('读取套餐设置失败：', 'Failed to read the saved plan: ') + (e instanceof Error ? e.message : String(e));
      elModuleSettings.appendChild(err);
    }
    if (token !== renderSeq) return;

    addPanelDivider();
    addPanelTitle(
      usageText('套餐（Plan）', 'Plan'),
      usageText('默认 Team；配置页与页面统计逻辑会自动保持一致（写入 storage.sync）。', 'Default is Team. The settings page and page-side usage logic stay in sync automatically through storage.sync.')
    );

    const rowPlan = document.createElement('label');
    rowPlan.className = 'formRow';
    const leftPlan = document.createElement('span');
    leftPlan.textContent = usageText('默认套餐', 'Default plan');
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
          usageText(
            `切换套餐为 ${CGPT_USAGE_MONITOR_PLAN_OPTIONS.find(([k]) => k === next)?.[1] || next}？\n\n提示：切换套餐会按官方限制自动调整所有模型的配额和时间窗口设置（会保留使用历史）。`,
            `Switch the plan to ${CGPT_USAGE_MONITOR_PLAN_OPTIONS.find(([k]) => k === next)?.[1] || next}?\n\nThis will update quotas and window limits to match the official plan while keeping usage history.`
          )
        )
      ) {
        selectPlan.value = planType;
        return;
      }
      selectPlan.disabled = true;
      setStatus(usageText('正在保存套餐设置…', 'Saving plan setting…'));
      try {
        planType = await saveCgptUsageMonitorPlanType(next);
        selectPlan.value = planType;
        setStatus(usageText('套餐设置已保存', 'Plan setting saved'), 'ok');
      } catch (e) {
        selectPlan.value = planType;
        setStatus(`${usageText('套餐设置保存失败：', 'Failed to save the plan setting: ')}${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        selectPlan.disabled = false;
      }
    });
    rowPlan.appendChild(leftPlan);
    rowPlan.appendChild(selectPlan);
    elModuleSettings.appendChild(rowPlan);

    // Usage dashboard viewer (options-only).
    addPanelDivider();
    addPanelTitle(
      usageText('用量面板', 'Usage panel'),
      usageText('展示效果与油猴脚本一致；数据存储在扩展 storage.local（需在 chatgpt.com 发送消息后才会产生记录）。', 'Matches the legacy userscript panel. Data is stored in extension storage.local and appears after messages are sent on chatgpt.com.')
    );
    const usagePanelNotice = document.createElement('div');
    usagePanelNotice.className = 'cgptUsageEmpty';
    usagePanelNotice.textContent = usageText('正在初始化用量面板…', 'Initializing the usage panel…');
    elModuleSettings.appendChild(usagePanelNotice);
    const setUsagePanelNotice = (message) => {
      usagePanelNotice.textContent = String(message || '').trim() || usageText('用量面板暂不可用。', 'The usage panel is temporarily unavailable.');
    };
    const clearUsagePanelNotice = () => {
      try {
        if (usagePanelNotice.parentNode) usagePanelNotice.parentNode.removeChild(usagePanelNotice);
      } catch {}
    };

    const USAGE_DATA_KEY = '__aichat_gm_chatgpt_usage_monitor__:usageData';
    const PLAN_TYPE_GM_KEY = '__aichat_gm_chatgpt_usage_monitor__:planType';
    const SYNC_REV_KEY = '__aichat_gm_chatgpt_usage_monitor__:__sync_rev_v1__';

    const usageUtils = (() => {
      try {
        const u = globalThis.__aichatChatGPTUsageMonitorUtilsV1__;
        return u && typeof u === 'object' ? u : null;
      } catch {
        return null;
      }
    })();
    if (!usageUtils) {
      setUsagePanelNotice(
        usageText(
          '内部错误：用量统计工具库未加载（shared/chatgpt-usage-monitor-utils.js）。请尝试在 chrome://extensions 重新加载当前扩展。',
          'Internal error: the usage monitor utility bundle was not loaded (shared/chatgpt-usage-monitor-utils.js). Try reloading the current extension in chrome://extensions.'
        )
      );
      setStatus(usageText('用量统计工具库缺失，无法导入/合并/展示数据', 'The usage monitor utility bundle is missing, so import/merge/render is unavailable.'), 'err');
      return;
    }
    const { TIME_WINDOWS, tsOf, validateImportedData, summarizeImport, mergeUsageData, createLegacyMonthlyUsageReportHtml } = usageUtils;

    // Match the upstream (Tampermonkey) usage dashboard UI.
    const COLORS = {
      background: '#1A1B1E',
      surface: '#2A2B2E',
      border: '#363636',
      text: '#E5E7EB',
      secondaryText: '#9CA3AF',
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      disabled: '#4B5563',
      yellow: '#facc15',
      progressLow: '#EF4444',
      progressMed: '#F59E0B',
      progressHigh: '#10B981',
      progressExceed: '#4B5563',
      hourModel: '#61DAFB',
      dailyModel: '#9F7AEA',
      weeklyModel: '#10B981',
      monthlyModel: '#F472B6'
    };

    const SHARED_GROUP_COLORS = {
      'pro-premium-shared': '#facc15',
      'pro-thinking-shared': '#34d399',
      'pro-instant-shared': '#60a5fa',
      'team-premium-shared': '#facc15',
      'edu-premium-shared': '#facc15',
      'enterprise-premium-shared': '#facc15',
      'go-thinking-shared': '#34d399',
      'k12-thinking-shared': '#34d399',
      'plus-thinking-shared': '#34d399',
      'team-thinking-shared': '#34d399',
      'edu-thinking-shared': '#34d399',
      'enterprise-thinking-shared': '#34d399',
      'free-thinking-shared': '#34d399',
      'free-instant-shared': '#60a5fa',
      'go-instant-shared': '#60a5fa',
      'k12-instant-shared': '#60a5fa',
      'plus-instant-shared': '#60a5fa',
      'team-instant-shared': '#60a5fa',
      'edu-instant-shared': '#60a5fa',
      'enterprise-instant-shared': '#60a5fa'
    };

    const MODEL_DISPLAY_NAMES = {
      'gpt-5-4-pro': 'gpt-5.4-pro',
      'gpt-5-2-pro': 'gpt-5.2-pro',
      'gpt-5-1-pro': 'gpt-5.1-pro',
      'gpt-4-5': 'gpt-4.5',
      'gpt-5-4-thinking': 'gpt-5.4-thinking',
      'gpt-5-2-thinking': 'gpt-5.2-thinking',
      'gpt-5-1-thinking': 'gpt-5.1-thinking',
      'gpt-5-3-instant': 'gpt-5.3-instant',
      'gpt-5-2-instant': 'gpt-5.2-instant',
      'gpt-5-1-instant': 'gpt-5.1-instant',
      o3: 'o3',
      'gpt-5-t-mini': 'gpt-5-t-mini',
      'gpt-5-mini': 'gpt-5-mini',
      alpha: 'alpha'
    };
    const MODEL_DISPLAY_ORDER = [
      'gpt-5-4-pro',
      'gpt-5-2-pro',
      'gpt-5-1-pro',
      'gpt-4-5',
      'gpt-5-4-thinking',
      'gpt-5-2-thinking',
      'gpt-5-1-thinking',
      'gpt-5-3-instant',
      'gpt-5-2-instant',
      'gpt-5-1-instant',
      'o3',
      'gpt-5-t-mini',
      'gpt-5-mini',
      'alpha'
    ];
    const LEGACY_NOMINAL_UNLIMITED_QUOTA = 10000;
    const LEGACY_NOMINAL_UNLIMITED_WINDOW_TYPE = 'hour3';
    const MODEL_KEY_ALIASES = {
      'gpt-5-pro': 'gpt-5-4-pro',
      'gpt-5-pro-shared': 'gpt-5-4-pro',
      'gpt-5-thinking': 'gpt-5-4-thinking',
      'gpt-5-thinking-shared': 'gpt-5-4-thinking',
      'gpt-5-instant': 'gpt-5-3-instant',
      'gpt-5-instant-shared': 'gpt-5-3-instant',
      'gpt-5': 'gpt-5-3-instant',
      'gpt-5-1': 'gpt-5-1-instant',
      'gpt-5-2': 'gpt-5-2-instant',
      'gpt-5-3': 'gpt-5-3-instant',
      'o3-pro': 'o3'
    };
    const canonicalizeUsageModelKey = (modelKey) => {
      const key = String(modelKey || '').trim();
      if (!key) return '';
      return MODEL_KEY_ALIASES[key] || key;
    };
    const isUsagePanelKnownModelKey = (modelKey) => MODEL_DISPLAY_ORDER.includes(canonicalizeUsageModelKey(modelKey));
    const displayModelName = (modelKey) => {
      const key = canonicalizeUsageModelKey(modelKey);
      return MODEL_DISPLAY_NAMES[key] || key;
    };
    const upgradeLegacyNominalUnlimitedEntry = (entry) => {
      if (!entry || typeof entry !== 'object' || entry.nominalUnlimited !== true) return false;
      if (typeof entry.sharedGroup !== 'string' || !entry.sharedGroup) {
        entry.quota = LEGACY_NOMINAL_UNLIMITED_QUOTA;
        entry.windowType = LEGACY_NOMINAL_UNLIMITED_WINDOW_TYPE;
      }
      try {
        delete entry.nominalUnlimited;
      } catch {
        entry.nominalUnlimited = false;
      }
      return true;
    };
    const upgradeLegacyNominalUnlimitedData = (data) => {
      let changed = false;
      const models = data?.models && typeof data.models === 'object' ? data.models : null;
      if (models) {
        Object.values(models).forEach((model) => {
          if (upgradeLegacyNominalUnlimitedEntry(model)) changed = true;
        });
      }
      const groups = data?.sharedQuotaGroups && typeof data.sharedQuotaGroups === 'object' ? data.sharedQuotaGroups : null;
      if (groups) {
        Object.values(groups).forEach((group) => {
          if (upgradeLegacyNominalUnlimitedEntry(group)) changed = true;
        });
      }
      return changed;
    };
    const mergeAliasedUsageModels = (models) => {
      if (!models || typeof models !== 'object') return false;
      const validWindowTypes = new Set(['hour3', 'hour5', 'daily', 'weekly', 'monthly']);
      let changed = false;
      Object.keys(models).forEach((rawKey) => {
        const canonicalKey = canonicalizeUsageModelKey(rawKey);
        if (!canonicalKey || canonicalKey === rawKey) return;
        const source = models[rawKey];
        if (!source || typeof source !== 'object') {
          delete models[rawKey];
          changed = true;
          return;
        }
        if (upgradeLegacyNominalUnlimitedEntry(source)) changed = true;
        const target = models[canonicalKey];
        if (!target || typeof target !== 'object') {
          models[canonicalKey] = source;
        } else {
          if (upgradeLegacyNominalUnlimitedEntry(target)) changed = true;
          const targetReq = Array.isArray(target.requests)
            ? target.requests.map((r) => tsOf(r)).filter((ts) => typeof ts === 'number' && !Number.isNaN(ts))
            : [];
          const sourceReq = Array.isArray(source.requests)
            ? source.requests.map((r) => tsOf(r)).filter((ts) => typeof ts === 'number' && !Number.isNaN(ts))
            : [];
          if (sourceReq.length) target.requests = [...targetReq, ...sourceReq].sort((a, b) => b - a);
          if ((!target.sharedGroup || typeof target.sharedGroup !== 'string') && typeof source.sharedGroup === 'string' && source.sharedGroup) {
            target.sharedGroup = source.sharedGroup;
          }
          if (typeof target.quota !== 'number' && typeof source.quota === 'number') target.quota = source.quota;
          if (!validWindowTypes.has(target.windowType) && validWindowTypes.has(source.windowType)) {
            target.windowType = source.windowType;
          }
        }
        delete models[rawKey];
        changed = true;
      });
      return changed;
    };
    const normalizeUsageDataForRender = (data) => {
      if (!data || typeof data !== 'object') return null;
      let next = null;
      try {
        next = JSON.parse(JSON.stringify(data));
      } catch {
        return data;
      }
      if (!next.models || typeof next.models !== 'object') next.models = {};
      if (!next.sharedQuotaGroups || typeof next.sharedQuotaGroups !== 'object') next.sharedQuotaGroups = {};
      try {
        upgradeLegacyNominalUnlimitedData(next);
      } catch {}
      try {
        mergeAliasedUsageModels(next.models);
      } catch {}
      return next;
    };

    const formatTimeAgo = (timestamp) => {
      const now = Date.now();
      const seconds = Math.floor((now - timestamp) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    };

    const formatTimeLeft = (windowEnd) => {
      const now = Date.now();
      const timeLeft = Number(windowEnd) - now;
      if (!Number.isFinite(timeLeft) || timeLeft <= 0) return '0h 0m';
      const hours = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      return `${hours}h ${minutes}m`;
    };

    const getWindowEnd = (timestamp, windowType) => {
      const dur = TIME_WINDOWS[String(windowType || '')] || TIME_WINDOWS.daily;
      return Number(timestamp) + dur;
    };

    const getAllUsageKeys = async () => {
      try {
        const items = await new Promise((resolve) => {
          try {
            chrome.storage.local.get(null, (res) => {
              void chrome.runtime.lastError;
              resolve(res && typeof res === 'object' ? res : {});
            });
          } catch {
            resolve({});
          }
        });
        return Object.keys(items).filter((k) => String(k).startsWith('__aichat_gm_chatgpt_usage_monitor__:'));
      } catch {
        return [];
      }
    };

    const STORAGE_READ_TIMEOUT_MS = 2500;
    const readLocalStorageWithTimeout = async (defaults, timeoutMs = STORAGE_READ_TIMEOUT_MS) => {
      const fallback = defaults && typeof defaults === 'object' ? defaults : {};
      return await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(usageText(`读取 storage.local 超时（>${timeoutMs}ms）`, `Timed out while reading storage.local (> ${timeoutMs}ms)`)));
        }, timeoutMs);
        try {
          chrome.storage.local.get(fallback, (items) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const err = chrome.runtime?.lastError;
            if (err) {
              reject(new Error(err.message || String(err)));
              return;
            }
            resolve(items && typeof items === 'object' ? items : fallback);
          });
        } catch (e) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e);
        }
      });
    };

    const loadUsageSnapshot = async () => {
      const res = await readLocalStorageWithTimeout({ [USAGE_DATA_KEY]: null, [PLAN_TYPE_GM_KEY]: null });
      return {
        usageData: res?.[USAGE_DATA_KEY] || null,
        planType: String(res?.[PLAN_TYPE_GM_KEY] || '').trim()
      };
    };
    const usageLocale = /^zh/i.test(resolveUiLocale()) ? 'zh-CN' : 'en';

    const dash = document.createElement('div');
    dash.className = 'cgptUsageDash';
    elModuleSettings.appendChild(dash);
    clearUsagePanelNotice();

    const dashHeader = document.createElement('header');
    dashHeader.className = 'cgptUsageDashHeader';
    dash.appendChild(dashHeader);

    const dashTitle = document.createElement('div');
    dashTitle.className = 'cgptUsageDashTitle';
    dashTitle.textContent = usageText('ChatGPT 用量监视器', 'ChatGPT Usage Monitor');
    dashHeader.appendChild(dashTitle);

    const dashContent = document.createElement('div');
    dashContent.className = 'cgptUsageDashContent';
    dash.appendChild(dashContent);

    const usagePane = document.createElement('div');
    usagePane.className = 'cgptUsageDashPane';
    dashContent.appendChild(usagePane);
    const loadingState = document.createElement('div');
    loadingState.className = 'cgptUsageEmpty';
    loadingState.textContent = usageText('正在读取本地用量数据…', 'Reading local usage data…');
    usagePane.appendChild(loadingState);
    const ensureUsagePanelVisible = (reason) => {
      try {
        if (token !== renderSeq) return true;
        const isVisiblyRendered = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = globalThis.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity || 1) > 0.01 &&
            rect.width >= 40 &&
            rect.height >= 24
          );
        };
        const attached = dash.isConnected && usagePane.isConnected;
        const hasChildren = usagePane.childElementCount > 0;
        const hasText = String(usagePane.textContent || '').trim().length > 0;
        const dashVisible = isVisiblyRendered(dash);
        const paneVisible = isVisiblyRendered(usagePane);
        if (attached && dashVisible && paneVisible && (hasChildren || hasText)) {
          const existing = elModuleSettings.querySelector('[data-qn-usage-panel-fallback="1"]');
          if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
          return true;
        }
        let fallback = elModuleSettings.querySelector('[data-qn-usage-panel-fallback="1"]');
        if (!(fallback instanceof HTMLElement)) {
          fallback = document.createElement('div');
          fallback.setAttribute('data-qn-usage-panel-fallback', '1');
          fallback.className = 'cgptUsageEmpty';
          elModuleSettings.appendChild(fallback);
        }
        fallback.textContent = usageText(
          `用量面板渲染异常（${String(reason || 'unknown')}）：attached=${attached ? '1' : '0'} / dashVisible=${dashVisible ? '1' : '0'} / paneVisible=${paneVisible ? '1' : '0'}，请点击“刷新数据”重试。`,
          `The usage panel did not render correctly (${String(reason || 'unknown')}): attached=${attached ? '1' : '0'} / dashVisible=${dashVisible ? '1' : '0'} / paneVisible=${paneVisible ? '1' : '0'}. Click “Refresh data” to try again.`
        );
        return false;
      } catch {
        return false;
      }
    };
    const ensureUsagePaneNotBlank = (message) => {
      try {
        const hasChildren = usagePane.childElementCount > 0;
        const hasText = String(usagePane.textContent || '').trim().length > 0;
        if (hasChildren || hasText) return false;
        const fallback = document.createElement('div');
        fallback.className = 'cgptUsageEmpty';
        fallback.textContent = String(message || '').trim() || usageText('用量面板当前无可视内容，请点击“刷新数据”重试。', 'The usage panel is currently blank. Click “Refresh data” to try again.');
        usagePane.appendChild(fallback);
        return true;
      } catch {
        return false;
      }
    };

    const settingsActions = document.createElement('div');
    settingsActions.className = 'cgptUsageActions cgptUsageActionsInline';
    dashHeader.appendChild(settingsActions);

    const settingsHint = document.createElement('div');
    settingsHint.className = 'cgptUsageHint';
    settingsHint.textContent = usageText('仅本地数据：导入/导出/清空不会影响 ChatGPT 账号。', 'Local data only: import/export/clear never changes your ChatGPT account.');
    dashContent.appendChild(settingsHint);

    const btnRefresh = document.createElement('button');
    btnRefresh.type = 'button';
    btnRefresh.className = 'cgptUsageBtn';
    btnRefresh.textContent = usageText('刷新数据', 'Refresh data');
    settingsActions.appendChild(btnRefresh);

    const btnExport = document.createElement('button');
    btnExport.type = 'button';
    btnExport.className = 'cgptUsageBtn';
    btnExport.textContent = usageText('导出 JSON', 'Export JSON');
    settingsActions.appendChild(btnExport);

    const btnExportHtml = document.createElement('button');
    btnExportHtml.type = 'button';
    btnExportHtml.className = 'cgptUsageBtn';
    btnExportHtml.textContent = usageText('导出 HTML', 'Export HTML');
    settingsActions.appendChild(btnExportHtml);

    const btnImport = document.createElement('button');
    btnImport.type = 'button';
    btnImport.className = 'cgptUsageBtn';
    btnImport.textContent = usageText('导入 JSON', 'Import JSON');
    settingsActions.appendChild(btnImport);

    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.className = 'cgptUsageBtn cgptUsageBtnDanger';
    btnClear.textContent = usageText('清空数据', 'Clear data');
    settingsActions.appendChild(btnClear);

    const collectSharedGroupUsage = (usageData, groupId, now) => {
      const group = usageData?.sharedQuotaGroups?.[groupId];
      if (!group) return null;
      const windowType = group.windowType || 'daily';
      const windowDuration = TIME_WINDOWS[String(windowType)] || TIME_WINDOWS.daily;
      const activeRequests = [];
      for (const [rawKey, model] of Object.entries(usageData?.models || {})) {
        if (String(model?.sharedGroup || '') !== String(groupId)) continue;
        if (!Array.isArray(model?.requests)) continue;
        const modelKey = canonicalizeUsageModelKey(rawKey) || rawKey;
        model.requests
          .map((req) => tsOf(req))
          .filter((ts) => typeof ts === 'number' && !Number.isNaN(ts) && now - ts < windowDuration)
          .forEach((ts) => {
            activeRequests.push({ ts, modelKey });
          });
      }
      activeRequests.sort((a, b) => a.ts - b.ts);
      return {
        group,
        windowType,
        windowDuration,
        activeRequests,
        windowEnd: activeRequests.length > 0 ? getWindowEnd(activeRequests[0].ts, windowType) : null
      };
    };

    const createUsageModelRow = (usageData, model, modelKey) => {
      const now = Date.now();
      let count = 0;
      let quota = 0;
      let windowType = 'daily';
      let lastRequestTime = 'never';
      let windowEndInfo = '';

      if (model?.sharedGroup) {
        const sharedUsage = collectSharedGroupUsage(usageData, model.sharedGroup, now);
        if (sharedUsage) {
          quota = sharedUsage.group.quota;
          windowType = sharedUsage.windowType;
          count = sharedUsage.activeRequests.length;
          const modelRequests = sharedUsage.activeRequests.filter((req) => req.modelKey === modelKey);
          if (modelRequests.length > 0) {
            lastRequestTime = formatTimeAgo(Math.max(...modelRequests.map((req) => req.ts)));
          }
          if (count > 0 && usageData?.showWindowResetTime) {
            const oldestActiveTimestamp = Math.min(...sharedUsage.activeRequests.map((req) => req.ts));
            const windowEnd = getWindowEnd(oldestActiveTimestamp, windowType);
            if (windowEnd > now) windowEndInfo = `Window resets in: ${formatTimeLeft(windowEnd)}`;
          }
        }
      } else {
        quota = model?.quota;
        windowType = model?.windowType;
        const windowDuration = TIME_WINDOWS[String(windowType)] || TIME_WINDOWS.daily;
        const activeRequests = (model?.requests || []).map((req) => tsOf(req)).filter((ts) => now - ts < windowDuration);
        count = activeRequests.length;
        if (count > 0) lastRequestTime = formatTimeAgo(Math.max(...activeRequests));
        if (count > 0 && usageData?.showWindowResetTime) {
          const oldestActiveTimestamp = Math.min(...activeRequests);
          const windowEnd = getWindowEnd(oldestActiveTimestamp, windowType);
          if (windowEnd > now) windowEndInfo = `Window resets in: ${formatTimeLeft(windowEnd)}`;
        }
      }

      const row = document.createElement('div');
      row.className = 'model-row';

      const modelNameContainer = document.createElement('div');
      modelNameContainer.style.display = 'flex';
      modelNameContainer.style.alignItems = 'center';
      const modelName = document.createElement('span');
      modelName.textContent = displayModelName(modelKey);
      let sharedColor = null;
      if (model?.sharedGroup) {
        sharedColor = SHARED_GROUP_COLORS[String(model.sharedGroup)] || COLORS.warning;
        modelName.style.color = sharedColor;
        modelName.title = `${usageText('共享组：', 'Shared group: ')}${usageData?.sharedQuotaGroups?.[model.sharedGroup]?.displayName || model.sharedGroup}`;
      }
      modelNameContainer.appendChild(modelName);

      const windowBadge = document.createElement('span');
      windowBadge.className = `window-badge ${windowType}`;
      windowBadge.textContent =
        windowType === 'hour3'
          ? '3h'
          : windowType === 'hour5'
            ? '5h'
            : windowType === 'daily'
              ? '24h'
              : windowType === 'weekly'
                ? '7d'
                : '30d';
      modelNameContainer.appendChild(windowBadge);
      row.appendChild(modelNameContainer);

      const lastUpdateValue = document.createElement('div');
      lastUpdateValue.className = 'request-time';
      lastUpdateValue.textContent = lastRequestTime;
      row.appendChild(lastUpdateValue);

      const usageValue = document.createElement('div');
      if (sharedColor) usageValue.style.color = sharedColor;
      const unavailableText = usageText('不可用', 'Unavailable');
      const quotaDisplay = quota === 0 ? unavailableText : String(quota ?? unavailableText);
      usageValue.textContent = `${count} / ${quotaDisplay}`;
      if (windowEndInfo && usageData?.showWindowResetTime) {
        const windowInfoEl = document.createElement('div');
        windowInfoEl.className = 'window-info';
        windowInfoEl.textContent = windowEndInfo;
        usageValue.appendChild(windowInfoEl);
      }
      row.appendChild(usageValue);

      const progressCell = document.createElement('div');
      if (quota === 0) {
        progressCell.textContent = unavailableText;
        progressCell.style.color = COLORS.disabled;
        progressCell.style.fontStyle = 'italic';
      } else {
        const usagePercent = quota ? count / quota : 0;
        if (usageData?.progressType === 'dots') {
          const dotContainer = document.createElement('div');
          dotContainer.className = 'dot-progress';
          const totalDots = 8;
          for (let i = 0; i < totalDots; i++) {
            const dot = document.createElement('div');
            dot.className = 'dot';
            const dotThreshold = (i + 1) / totalDots;
            if (usagePercent >= 1) dot.classList.add('dot-exceeded');
            else if (usagePercent >= dotThreshold) dot.classList.add('dot-full');
            else if (usagePercent >= dotThreshold - 0.1) dot.classList.add('dot-partial');
            else dot.classList.add('dot-empty');
            dotContainer.appendChild(dot);
          }
          progressCell.appendChild(dotContainer);
        } else {
          const progressContainer = document.createElement('div');
          progressContainer.className = 'progress-container';
          const progressBar = document.createElement('div');
          progressBar.className = 'progress-bar';
          if (usagePercent > 1) progressBar.classList.add('exceeded');
          else if (usagePercent < 0.3) progressBar.classList.add('low-usage');
          progressBar.style.width = `${Math.min(usagePercent * 100, 100)}%`;
          progressContainer.appendChild(progressBar);
          progressCell.appendChild(progressContainer);
        }
      }
      row.appendChild(progressCell);
      return row;
    };

    const windowShort = (windowType) => {
      const t = String(windowType || '').trim();
      if (t === 'hour3') return '3h';
      if (t === 'hour5') return '5h';
      if (t === 'daily') return '24h';
      if (t === 'weekly') return '7d';
      if (t === 'monthly') return '30d';
      return t || '—';
    };

    const formatBytes = (bytes) => {
      const n = Number(bytes);
      if (!Number.isFinite(n) || n < 0) return '';
      if (n < 1024) return `${n} B`;
      const kb = n / 1024;
      if (kb < 1024) return `${kb.toFixed(1)} KiB`;
      const mb = kb / 1024;
      if (mb < 1024) return `${mb.toFixed(1)} MiB`;
      const gb = mb / 1024;
      return `${gb.toFixed(1)} GiB`;
    };

    const computeUsageDataBytes = (usageData) => {
      try {
        const json = JSON.stringify(usageData || null) || '';
        return new Blob([json]).size;
      } catch {
        return 0;
      }
    };

    const computeLastActivityAt = (usageData) => {
      try {
        const models = usageData?.models && typeof usageData.models === 'object' ? usageData.models : {};
        let last = 0;
        for (const m of Object.values(models)) {
          const reqs = Array.isArray(m?.requests) ? m.requests : [];
          for (const r of reqs) {
            const t = tsOf(r);
            if (!Number.isFinite(t)) continue;
            if (t > last) last = t;
          }
        }
        return last || 0;
      } catch {
        return 0;
      }
    };

    const renderUsagePane = (usageData) => {
      usagePane.textContent = '';
      if (!usageData || typeof usageData !== 'object') {
        const empty = document.createElement('div');
        empty.className = 'cgptUsageEmpty';
        empty.textContent = usageText('暂无用量记录。打开 chatgpt.com 发送一条消息后才会产生统计数据。', 'No usage records yet. Send a message on chatgpt.com first to generate data.');
        usagePane.appendChild(empty);
        return;
      }

      const infoSection = document.createElement('div');
      infoSection.className = 'reset-info';
      const windowLegendLabel = document.createElement('span');
      windowLegendLabel.className = 'cgptUsageLegendTitle';
      windowLegendLabel.textContent = usageText('窗口', 'Window');
      infoSection.appendChild(windowLegendLabel);
      const windowTypes = document.createElement('div');
      windowTypes.className = 'cgptUsageWindowTypes';
      windowTypes.innerHTML = `
        <span class="window-badge hour3">3h</span>
        <span class="window-badge hour5">5h</span>
        <span class="window-badge daily">24h</span>
        <span class="window-badge weekly">7d</span>
        <span class="window-badge monthly">30d</span>
      `;
      infoSection.appendChild(windowTypes);
      usagePane.appendChild(infoSection);

      const tableHeader = document.createElement('div');
      tableHeader.className = 'table-header';
      tableHeader.innerHTML = `<div>${usageText('模型名称', 'Model')}</div><div>${usageText('最后使用', 'Last used')}</div><div>${usageText('使用量', 'Usage')}</div><div>${usageText('进度', 'Progress')}</div>`;
      usagePane.appendChild(tableHeader);

      const now = Date.now();
      const currentPlan = String(usageData?.planType || planType || 'team').trim() || 'team';
      const canonicalModelEntries = [];
      const seenCanonicalKeys = new Set();
      Object.entries(usageData?.models || {}).forEach(([rawKey, model]) => {
        const key = canonicalizeUsageModelKey(rawKey);
        if (!key || seenCanonicalKeys.has(key)) return;
        seenCanonicalKeys.add(key);
        canonicalModelEntries.push([key, usageData?.models?.[key] || model]);
      });

      const modelCounts = canonicalModelEntries.map(([key, model]) => {
        let activeCount = 0;
        let hasBeenUsed = false;
        let isAvailable = false;
        if (model?.sharedGroup) {
          const sharedUsage = collectSharedGroupUsage(usageData, model.sharedGroup, now);
          if (sharedUsage) {
            activeCount = sharedUsage.activeRequests.length;
            hasBeenUsed = activeCount > 0;
            isAvailable = Number(sharedUsage.group.quota) > 0;
          }
        } else {
          const windowDuration = TIME_WINDOWS[String(model?.windowType || '')] || TIME_WINDOWS.daily;
          activeCount = (model?.requests || []).map(tsOf).filter((ts) => Number.isFinite(ts) && now - ts < windowDuration).length;
          hasBeenUsed = (model?.requests || []).length > 0;
          isAvailable = Number(model?.quota ?? 0) > 0;
        }
        return { key, model, hasBeenUsed, isAvailable };
      });

      const sortedModels = MODEL_DISPLAY_ORDER.filter((modelKey) => {
        const modelData = modelCounts.find(({ key }) => key === modelKey);
        if (!modelData) return false;
        return modelData.hasBeenUsed || modelData.isAvailable;
      })
        .map((modelKey) => modelCounts.find(({ key }) => key === modelKey))
        .filter(Boolean);

      sortedModels.filter(({ key }) => isUsagePanelKnownModelKey(key)).forEach(({ key, model }) => {
        usagePane.appendChild(createUsageModelRow(usageData, model, key));
      });

      if (sortedModels.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'cgptUsageEmpty';
        emptyState.textContent =
          Object.keys(usageData?.models || {}).length > 0
            ? usageText('使用模型后才会显示用量统计。', 'Usage appears after one of the tracked models is used.')
            : usageText('未配置任何模型，请在设置中添加。', 'No models are configured yet. Add one in settings first.');
        usagePane.appendChild(emptyState);
      }
    };

    let latestUsageData = null;
    let initialRenderWatchdog = null;
    const clearInitialRenderWatchdog = () => {
      try {
        if (initialRenderWatchdog != null) clearTimeout(initialRenderWatchdog);
      } catch {}
      initialRenderWatchdog = null;
    };
    const refreshDashboard = async (showStatus) => {
      btnRefresh.disabled = true;
      try {
        const { usageData } = await loadUsageSnapshot();
        latestUsageData = normalizeUsageDataForRender(usageData || null);
        renderUsagePane(latestUsageData);
        ensureUsagePaneNotBlank();
        ensureUsagePanelVisible('refresh-ok');
        clearInitialRenderWatchdog();
        if (showStatus) setStatus(usageText('已刷新用量数据', 'Usage data refreshed'), 'ok');
      } catch (e) {
        usagePane.textContent = '';
        const errState = document.createElement('div');
        errState.className = 'cgptUsageEmpty';
        errState.textContent = `${usageText('读取失败：', 'Read failed: ')}${e instanceof Error ? e.message : String(e)}`;
        usagePane.appendChild(errState);
        setStatus(`${usageText('刷新失败：', 'Refresh failed: ')}${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        ensureUsagePaneNotBlank(usageText('用量面板未获取到可视内容，请点击“刷新数据”重试。', 'The usage panel did not produce visible content. Click “Refresh data” to try again.'));
        ensureUsagePanelVisible('refresh-finally');
        btnRefresh.disabled = false;
      }
    };

    btnRefresh.addEventListener('click', () => void refreshDashboard(true));

    const triggerUsageDownload = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch {}
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 0);
    };

    // Auto-refresh when storage changes (avoid polling).
    const storageListener = (changes, areaName) => {
      try {
        if (token !== renderSeq) return;
        if (areaName !== 'local') return;
        if (!changes || typeof changes !== 'object') return;
        if (!(USAGE_DATA_KEY in changes) && !(PLAN_TYPE_GM_KEY in changes)) return;
        void refreshDashboard(false);
      } catch {}
    };
    try {
      chrome.storage.onChanged.addListener(storageListener);
    } catch {}
    try {
      initialRenderWatchdog = setTimeout(() => {
        if (token !== renderSeq) return;
        const patched = ensureUsagePaneNotBlank(usageText('用量面板加载超时，请点击“刷新数据”重试。', 'The usage panel timed out while loading. Click “Refresh data” to try again.'));
        ensureUsagePanelVisible('watchdog-timeout');
        if (patched) setStatus(usageText('用量面板加载超时，已显示兜底提示', 'The usage panel timed out. A fallback message is now shown.'), 'err');
      }, STORAGE_READ_TIMEOUT_MS + 600);
    } catch {}
    teardownModuleSettingsSideEffects = () => {
      try {
        chrome.storage.onChanged.removeListener(storageListener);
      } catch {}
      clearInitialRenderWatchdog();
    };

    btnExport.addEventListener('click', async () => {
      btnExport.disabled = true;
      try {
        const { usageData } = await loadUsageSnapshot();
        if (!usageData || typeof usageData !== 'object') throw new Error(usageText('暂无可导出的用量数据', 'No usage data is available to export yet.'));
        const normalizedUsageData = normalizeUsageDataForRender(usageData) || usageData;
        const exportUsageData = cloneJsonSafe(normalizedUsageData) || normalizedUsageData;
        try {
          if (exportUsageData && exportUsageData.sharedQuotaGroups && typeof exportUsageData.sharedQuotaGroups === 'object') {
            Object.values(exportUsageData.sharedQuotaGroups).forEach((group) => {
              if (!group || typeof group !== 'object') return;
              if (typeof group.displayName === 'string') group.displayName = translateText(group.displayName);
            });
          }
        } catch {}
        const json = JSON.stringify(exportUsageData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        triggerUsageDownload(blob, `chatgpt-usage-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        setStatus(usageText('已导出用量统计数据', 'Usage data exported'), 'ok');
      } catch (e) {
        setStatus(`${usageText('导出失败：', 'Export failed: ')}${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        btnExport.disabled = false;
      }
    });

    btnExportHtml.addEventListener('click', async () => {
      btnExportHtml.disabled = true;
      try {
        const { usageData } = await loadUsageSnapshot();
        if (!usageData || typeof usageData !== 'object') throw new Error(usageText('暂无可导出的用量数据', 'No usage data is available to export yet.'));
        const normalizedUsageData = normalizeUsageDataForRender(usageData) || usageData;
        const exportPayload = createLegacyMonthlyUsageReportHtml(normalizedUsageData, {
          now: Date.now(),
          locale: usageLocale,
          preferredOrder: MODEL_DISPLAY_ORDER,
          knownModelKeys: [...MODEL_DISPLAY_ORDER, ...Object.keys(MODEL_KEY_ALIASES)]
        });
        if (!exportPayload || typeof exportPayload.html !== 'string' || !exportPayload.html.trim()) {
          throw new Error(usageText('旧版 HTML 报告生成失败', 'Failed to build the legacy HTML report.'));
        }
        const blob = new Blob([exportPayload.html], { type: 'text/html;charset=utf-8' });
        triggerUsageDownload(blob, exportPayload.filename || `chatgpt-monthly-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.html`);
        setStatus(usageText('已导出旧版月度 HTML 报告', 'Legacy monthly HTML report exported'), 'ok');
      } catch (e) {
        setStatus(`${usageText('导出 HTML 失败：', 'HTML export failed: ')}${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        btnExportHtml.disabled = false;
      }
    });

    const IMPORT_INPUT_ID = 'qn-cgpt-usage-import-input';
    const ensureImportInput = () => {
      /** @type {HTMLInputElement|null} */
      let input = document.getElementById(IMPORT_INPUT_ID);
      if (!(input instanceof HTMLInputElement)) {
        input = document.createElement('input');
        input.id = IMPORT_INPUT_ID;
        input.type = 'file';
        input.accept = 'application/json';
        input.setAttribute('aria-label', usageText('用量统计导入 JSON', 'Import usage JSON'));
        // Keep it non-visible but still present in DOM (better accessibility + easier to debug/automate).
        input.style.cssText = 'position:fixed; left:-9999px; top:-9999px; width:1px; height:1px; opacity:0;';
        (document.body || document.documentElement).appendChild(input);
      }

      // Install listener once (avoid accumulating listeners when switching modules).
      if (input.dataset.qnListener !== '1') {
        input.dataset.qnListener = '1';
        input.addEventListener('change', async () => {
          try {
            const file = input.files && input.files[0];
            if (!file) return;
            const text = await file.text();
            const imported = JSON.parse(text);
            if (!validateImportedData(imported)) throw new Error(usageText('数据格式不正确（models/requests/quota/windowType）', 'Invalid data format (models/requests/quota/windowType).'));
            const summary = summarizeImport(imported, { locale: usageLocale });
            if (
              !confirm(
                usageText(
                  `导入将合并现有记录与导入文件中的记录。\n\n${summary}\n\n确认导入吗？`,
                  `The import will merge the current records with the records in the selected file.\n\n${summary}\n\nContinue with the import?`
                )
              )
            )
              return;

            const { usageData: current } = await loadUsageSnapshot();
            const merged = mergeUsageData(current, imported);
            await new Promise((resolve, reject) => {
              try {
                chrome.storage.local.set({ [USAGE_DATA_KEY]: merged, [SYNC_REV_KEY]: Date.now() }, () => {
                  const err = chrome.runtime.lastError;
                  if (err) reject(new Error(err.message || String(err)));
                  else resolve();
                });
              } catch (e) {
                reject(e);
              }
            });
            setStatus(usageText('已导入并合并用量数据（下次打开 chatgpt.com 会自动同步）', 'Usage data imported and merged. It will sync the next time chatgpt.com opens.'), 'ok');
            await refreshDashboard();
          } catch (e) {
            setStatus(`${usageText('导入失败：', 'Import failed: ')}${e instanceof Error ? e.message : String(e)}`, 'err');
          } finally {
            // Allow importing the same file repeatedly.
            try {
              input.value = '';
            } catch {}
          }
        });
      }

      return input;
    };

    btnImport.addEventListener('click', () => {
      const input = ensureImportInput();
      try {
        input.value = '';
      } catch {}
      input.click();
    });

    btnClear.addEventListener('click', async () => {
      if (
        !confirm(
          usageText(
            '确认清空 ChatGPT 用量统计数据？（仅清空扩展存储；不会影响你的 ChatGPT 账号）',
            'Clear all ChatGPT usage monitor data? This only clears extension storage and does not affect your ChatGPT account.'
          )
        )
      )
        return;
      btnClear.disabled = true;
      try {
        const keys = await getAllUsageKeys();
        if (keys.length) {
          await new Promise((resolve) => {
            try {
              chrome.storage.local.remove(keys, () => {
                void chrome.runtime.lastError;
                resolve();
              });
            } catch {
              resolve();
            }
          });
        } else {
          await new Promise((resolve) => {
            try {
              chrome.storage.local.remove([USAGE_DATA_KEY, PLAN_TYPE_GM_KEY], () => {
                void chrome.runtime.lastError;
                resolve();
              });
            } catch {
              resolve();
            }
          });
        }

        // Mark the clear as authoritative so chatgpt.com will wipe its localStorage snapshot on next load.
        await new Promise((resolve) => {
          try {
            chrome.storage.local.set({ [SYNC_REV_KEY]: Date.now() }, () => {
              void chrome.runtime.lastError;
              resolve();
            });
          } catch {
            resolve();
          }
        });

        setStatus(usageText('已清空用量统计数据', 'Usage data cleared'), 'ok');
        await refreshDashboard();
      } catch (e) {
        setStatus(`${usageText('清空失败：', 'Clear failed: ')}${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        btnClear.disabled = false;
      }
    });

    await refreshDashboard();
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
    hint.textContent = localeText(
      '说明：该模块会在页面主世界（MAIN world）拦截 fetch / XMLHttpRequest 的 GET 请求，仅对 /backend-api/conversation/.../interpreter/download 且包含 sandbox_path 的 URL 进行修复。关闭模块后已打开页面可能需要刷新才会完全停用。',
      'This module intercepts fetch / XMLHttpRequest GET requests in the page MAIN world and only fixes URLs that target /backend-api/conversation/.../interpreter/download and contain sandbox_path. If you disable it, already-open pages may need a refresh to fully stop it.'
    );
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
    hint.textContent = localeText(
      '说明：暗色主题下把 .markdown strong 设为亮绿；亮色主题（.light）下设为紫色；并通过 CSS 隐藏底部 “ChatGPT can make mistakes...” 免责声明。',
      'In dark mode, this module makes .markdown strong bright green; in light mode (.light), it makes it purple. It also hides the bottom “ChatGPT can make mistakes...” disclaimer with CSS.'
    );
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTQuickDeepSearchModuleSettings(siteId) {
    addModuleHeader(
      'chatgpt_quick_deep_search',
      '快捷深度搜索（译/搜/思）',
      '仅快捷键：Ctrl+S（搜）/ Ctrl+T（思）/ Ctrl+Y|Ctrl+Z（译）（不注入按钮，更稳）。'
    );

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

    const hotkeyPolicyState = appendHotkeyPolicyNote(siteId, 'chatgpt_quick_deep_search');

    const rowHotkeys = document.createElement('label');
    rowHotkeys.className = 'formRow';
    const leftHotkeys = document.createElement('span');
    leftHotkeys.textContent = '启用 Ctrl+S / T / Y / Z 快捷键';
    const inputHotkeys = document.createElement('input');
    inputHotkeys.type = 'checkbox';
    inputHotkeys.checked = getSiteModuleSetting(siteId, 'chatgpt_quick_deep_search_hotkeys', true);
    inputHotkeys.addEventListener('change', () => {
      const checked = !!inputHotkeys.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_quick_deep_search_hotkeys = checked;
      });
    });
    rowHotkeys.appendChild(leftHotkeys);
    rowHotkeys.appendChild(inputHotkeys);
    elModuleSettings.appendChild(rowHotkeys);

    const rowForce = document.createElement('label');
    rowForce.className = 'formRow';
    const leftForce = document.createElement('span');
    leftForce.textContent = '无 Meta 键时仍强制启用这组 Ctrl 快捷键';
    const inputForce = document.createElement('input');
    inputForce.type = 'checkbox';
    inputForce.checked = getSiteModuleSetting(siteId, 'chatgpt_quick_deep_search_hotkeys_force', false);
    inputForce.addEventListener('change', () => {
      const checked = !!inputForce.checked;
      if (checked && !confirmForceEnableHotkeys(hotkeyPolicyState || getModuleHotkeyPolicyState(siteId, 'chatgpt_quick_deep_search'))) {
        inputForce.checked = false;
        return;
      }
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_quick_deep_search_hotkeys_force = checked;
      });
    });
    rowForce.appendChild(leftForce);
    rowForce.appendChild(inputForce);
    elModuleSettings.appendChild(rowForce);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：触发快捷键后，会把对应前缀插入到输入框开头并自动发送；并通过共享 fetch hub 让“这一次发送”强制使用 gpt-5（仅生效一次）。当键盘能力按“无 Meta 键”处理时，这组 Ctrl 快捷键默认停用，避免与浏览器或系统快捷键冲突。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTTabQueueModuleSettings(siteId) {
    addModuleHeader('chatgpt_tab_queue', 'ChatGPT Tab 队列发送', 'Tab 把草稿排队，等当前轮真正结束后再按 FIFO 自动发出下一条。');

    appendHotkeyPolicyNote(siteId, 'chatgpt_tab_queue');

    const rowInject = document.createElement('label');
    rowInject.className = 'formRow';
    const leftInject = document.createElement('span');
    leftInject.textContent = '启用该模块注入';
    const inputInject = document.createElement('input');
    inputInject.type = 'checkbox';
    inputInject.checked = isModuleEnabled(siteId, 'chatgpt_tab_queue');
    inputInject.addEventListener('change', () => {
      const checked = !!inputInject.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_tab_queue = checked;
      });
    });
    rowInject.appendChild(leftInject);
    rowInject.appendChild(inputInject);
    elModuleSettings.appendChild(rowInject);

    const rowQueue = document.createElement('label');
    rowQueue.className = 'formRow';
    const leftQueue = document.createElement('span');
    leftQueue.textContent = '启用 Tab 队列发送 / ⌥↑ / Alt+↑ 取回最近一条';
    const inputQueue = document.createElement('input');
    inputQueue.type = 'checkbox';
    inputQueue.checked = getSiteModuleSetting(siteId, 'chatgpt_tab_queue_queue_shortcut', true);
    inputQueue.addEventListener('change', () => {
      const checked = !!inputQueue.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_tab_queue_queue_shortcut = checked;
      });
    });
    rowQueue.appendChild(leftQueue);
    rowQueue.appendChild(inputQueue);
    elModuleSettings.appendChild(rowQueue);

    const rowClear = document.createElement('label');
    rowClear.className = 'formRow';
    const leftClear = document.createElement('span');
    leftClear.textContent = '启用 Ctrl+C 清空输入框（仅有 Meta 键时生效）';
    const inputClear = document.createElement('input');
    inputClear.type = 'checkbox';
    inputClear.checked = getSiteModuleSetting(siteId, 'chatgpt_tab_queue_ctrl_c_clear', true);
    inputClear.addEventListener('change', () => {
      const checked = !!inputClear.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_tab_queue_ctrl_c_clear = checked;
      });
    });
    rowClear.appendChild(leftClear);
    rowClear.appendChild(inputClear);
    elModuleSettings.appendChild(rowClear);

    const rowQuicknavMark = document.createElement('label');
    rowQuicknavMark.className = 'formRow';
    const leftQuicknavMark = document.createElement('span');
    leftQuicknavMark.textContent = '为 QuickNav 中由队列发出的用户消息保留橙色标记';
    const inputQuicknavMark = document.createElement('input');
    inputQuicknavMark.type = 'checkbox';
    inputQuicknavMark.checked = getSiteModuleSetting(siteId, 'chatgpt_tab_queue_quicknav_mark', true);
    inputQuicknavMark.addEventListener('change', () => {
      const checked = !!inputQuicknavMark.checked;
      patchQuickNavSettings((next) => {
        next.siteModules = next.siteModules && typeof next.siteModules === 'object' ? next.siteModules : {};
        next.siteModules[siteId] =
          next.siteModules[siteId] && typeof next.siteModules[siteId] === 'object' ? next.siteModules[siteId] : {};
        next.siteModules[siteId].chatgpt_tab_queue_quicknav_mark = checked;
      });
    });
    rowQuicknavMark.appendChild(leftQuicknavMark);
    rowQuicknavMark.appendChild(inputQuicknavMark);
    elModuleSettings.appendChild(rowQuicknavMark);

    const hint = document.createElement('div');
    hint.className = 'smallHint';
    hint.textContent =
      '说明：当前只支持纯文本队列；Tab 会拦截原生焦点切换并把当前草稿排进队列，Shift+Tab 仅负责阻止浏览器切焦点，不附带额外语义，⌥↑ / Alt+↑ 取回最近一条已排队草稿。排队预览里每条末尾都可以直接删除。自动发送下一条时，主判定来自 conversation stream 的 [DONE]，不会只看发送按钮是否高亮；Ctrl+C 清空走浏览器编辑命令，尽量保留 Cmd+Z 撤销链；QuickNav 橙色标记会在点击对应消息后清掉。';
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
      '说明：该模块在页面主世界（MAIN world）通过事件驱动处理复制/引用：复制时仅在选区含 .katex 时改写剪贴板为原始 LaTeX；点击原生 Quote 时仅对该次引用做补丁替换（不再全局重载 Range/Selection）。交互：悬停公式 0.8s 显示 LaTeX 提示，双击公式复制 LaTeX 并弹出提示。关闭模块后已打开页面可能需要刷新才会完全停用。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTExportConversationModuleSettings(siteId) {
    addModuleHeader('chatgpt_export_conversation', 'ChatGPT 对话导出（新版 UI）', '按 mapping 导出当前分支（Markdown / HTML）；失败时自动回退当前可见导出。');

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
    hint.textContent = '说明：导出为纯前端下载（Blob），无需额外权限；图片默认导出为原始链接（不做 base64 内嵌）。完整树 JSON 请使用“ChatGPT 消息树”模块菜单导出。';
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
      '使用方式：在用户消息下面会多出一个 QuickNav 铅笔按钮（在 ChatGPT 原生“编辑”左侧）；点击后会把原文（以及原图，如有）填入输入框。此时你可以继续编辑，并可新增/粘贴图片（Cmd+V）或用“添加文件/图片”上传，然后直接发送。发送时会自动改写 parent_message_id，实现真正的“分叉编辑”；若对方还在回复，点一次发送会自动结束当前回复并继续分叉发送。若想恢复正常发送，点提示条里的“取消”。';
    elModuleSettings.appendChild(hint);
  }

  function renderChatGPTMessageTreeModuleSettings(siteId) {
    addModuleHeader('chatgpt_message_tree', 'ChatGPT 消息树', '显示当前对话的完整消息树/分支结构（不切换主界面分支），并支持导出完整树 JSON。');

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
      '使用方式：在右下角会出现 “Tree” 按钮。点开后显示当前对话的消息树（包含所有分支）并高亮当前分支路径；默认开启“简洁”（隐藏 system/tool/thoughts 等内部节点）和“彩线”（类似 VSCode 的缩进对齐竖线），可在面板顶部一键切换。该模块不会驱动主聊天区切换分支/定位消息；只用于查看结构。若要导出完整树，请在扩展菜单中执行“导出完整树为 JSON”。';
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

  function renderGrokRateLimitDisplayModuleSettings(siteId) {
    addModuleHeader('grok_rate_limit_display', 'Grok 剩余额度显示', '仅显示 all 积分余量（发送后更新）。');

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
    hint.textContent = '说明：该模块仅在 Grok 对话页（/c/...）请求 https://grok.com/rest/rate-limits，在最右下角显示常驻极简卡片（仅 all 积分，例如 400/400）。2026-02-25 发现 4.2 与 4.2 heavy 次数接口失效，已不再展示这两项。';
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

  function getModuleSettingsRegistryNamespace() {
    const existing = globalThis[MODULE_SETTINGS_REGISTRY_GLOBAL_KEY];
    if (existing && typeof existing === 'object' && typeof existing.register === 'function' && Array.isArray(existing.entries)) {
      return existing;
    }

    const ns = {
      entries: [],
      register(items) {
        const list = Array.isArray(items) ? items : [];
        for (const raw of list) {
          if (!raw || typeof raw !== 'object') continue;
          const moduleId = String(raw.moduleId || '').trim();
          const renderer = String(raw.renderer || '').trim();
          if (!moduleId || !renderer) continue;
          this.entries.push({
            moduleId,
            renderer,
            hintText: typeof raw.hintText === 'string' ? raw.hintText : ''
          });
        }
      }
    };

    globalThis[MODULE_SETTINGS_REGISTRY_GLOBAL_KEY] = ns;
    return ns;
  }

  function loadModuleSettingsScriptOnce(relativePath) {
    const path = String(relativePath || '').trim();
    if (!path) return Promise.reject(new Error('Empty module settings submodule path'));
    if (moduleSettingsScriptLoaders.has(path)) return moduleSettingsScriptLoaders.get(path);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.async = false;
      script.defer = false;
      script.dataset.qnModuleSettings = path;
      script.addEventListener('load', () => {
        try {
          script.remove();
        } catch {}
        resolve();
      });
      script.addEventListener('error', () => {
        try {
          script.remove();
        } catch {}
        moduleSettingsScriptLoaders.delete(path);
        reject(new Error(`Failed to load module settings submodule: ${path}`));
      });
      (document.head || document.documentElement).appendChild(script);
    });

    moduleSettingsScriptLoaders.set(path, promise);
    return promise;
  }

  function ensureModuleSettingsRegistryLoaded() {
    if (moduleSettingsRegistryMap) return Promise.resolve(moduleSettingsRegistryMap);
    if (moduleSettingsRegistryPromise) return moduleSettingsRegistryPromise;

    moduleSettingsRegistryPromise = (async () => {
      const ns = getModuleSettingsRegistryNamespace();
      for (const scriptPath of MODULE_SETTINGS_SUBMODULE_SCRIPTS) {
        await loadModuleSettingsScriptOnce(scriptPath);
      }

      const map = new Map();
      for (const entry of ns.entries) {
        if (map.has(entry.moduleId)) continue;
        map.set(entry.moduleId, entry);
      }
      moduleSettingsRegistryMap = map;
      return map;
    })().catch((e) => {
      moduleSettingsRegistryPromise = null;
      throw e;
    });

    return moduleSettingsRegistryPromise;
  }

  function resolveModuleSettingsRenderer(rendererKey) {
    const key = String(rendererKey || '').trim();
    if (!key) return null;

    const table = {
      quicknav: ({ siteId }) => renderQuickNavModuleSettings(siteId),
      basicToggle: ({ siteId, moduleId, hintText }) => renderBasicToggleModuleSettings(siteId, moduleId, hintText),
      chatgptPerf: ({ siteId, token }) => renderChatGPTPerfModuleSettings(siteId, token),
      chatgptThinkingToggle: ({ siteId }) => renderChatGPTThinkingToggleModuleSettings(siteId),
      qwenThinkingToggle: ({ siteId }) => renderQwenThinkingToggleModuleSettings(siteId),
      cmdEnterSend: ({ siteId }) => renderCmdEnterSendModuleSettings(siteId),
      chatgptReadaloudSpeedController: ({ siteId, token }) => renderChatGPTReadaloudSpeedControllerModuleSettings(siteId, token),
      chatgptUsageMonitor: ({ siteId, token }) => renderChatGPTUsageMonitorModuleSettings(siteId, token),
      chatgptReplyTimer: ({ siteId }) => renderChatGPTReplyTimerModuleSettings(siteId),
      chatgptDownloadFileFix: ({ siteId }) => renderChatGPTDownloadFileFixModuleSettings(siteId),
      chatgptStrongHighlightLite: ({ siteId }) => renderChatGPTStrongHighlightLiteModuleSettings(siteId),
      chatgptQuickDeepSearch: ({ siteId }) => renderChatGPTQuickDeepSearchModuleSettings(siteId),
      chatgptTabQueue: ({ siteId }) => renderChatGPTTabQueueModuleSettings(siteId),
      chatgptHideFeedbackButtons: ({ siteId }) => renderChatGPTHideFeedbackButtonsModuleSettings(siteId),
      chatgptTexCopyQuote: ({ siteId }) => renderChatGPTTexCopyQuoteModuleSettings(siteId),
      chatgptExportConversation: ({ siteId }) => renderChatGPTExportConversationModuleSettings(siteId),
      chatgptImageMessageEdit: ({ siteId }) => renderChatGPTImageMessageEditModuleSettings(siteId),
      chatgptMessageTree: ({ siteId }) => renderChatGPTMessageTreeModuleSettings(siteId),
      gensparkMoaImageAutosettings: ({ siteId }) => renderGensparkMoaImageAutosettingsModuleSettings(siteId),
      gensparkCreditBalance: ({ siteId }) => renderGensparkCreditBalanceModuleSettings(siteId),
      gensparkInlineUploadFix: ({ siteId }) => renderGensparkInlineUploadFixModuleSettings(siteId),
      grokRateLimitDisplay: ({ siteId }) => renderGrokRateLimitDisplayModuleSettings(siteId)
    };

    return table[key] || null;
  }

  function renderModuleSettings(siteId, moduleId, token) {
    if (!elModuleSettings) return;
    try {
      teardownModuleSettingsSideEffects?.();
    } catch {}
    teardownModuleSettingsSideEffects = () => {};
    elModuleSettings.textContent = '';

    if (!currentSettings) {
      elModuleSettings.appendChild(createTriEmpty('正在加载设置', '等待后台返回当前配置。'));
      return;
    }

    elModuleSettings.appendChild(createTriEmpty('正在加载模块设置面板', '根据当前模块选择对应的设置渲染器。'));

    const run = async () => {
      try {
        const registry = await ensureModuleSettingsRegistryLoaded();
        if (token !== renderSeq) return;

        elModuleSettings.textContent = '';
        const entry = registry.get(moduleId) || null;
        const renderer = resolveModuleSettingsRenderer(entry?.renderer);
        if (!renderer) {
          renderBasicToggleModuleSettings(siteId, moduleId, '未知模块：仅提供注入开关；如需额外设置请补充模块设置面板。');
          return;
        }

        await renderer({
          siteId,
          moduleId,
          token,
          hintText: entry?.hintText || ''
        });
      } catch (e) {
        if (token !== renderSeq) return;
        elModuleSettings.textContent = '';
        setStatus(`加载模块设置失败：${e instanceof Error ? e.message : String(e)}`, 'err');
        renderBasicToggleModuleSettings(siteId, moduleId, '模块设置加载失败：已回退到基础注入开关。');
      }
    };

    void run();
  }

  function renderAll() {
    const token = ++renderSeq;
    const siteId = effectiveSelectedSiteId();
    const moduleId = effectiveSelectedModuleId(siteId);
    selectedSiteId = siteId;
    selectedModuleId = moduleId;

    if (elEnabled) elEnabled.checked = !!currentSettings?.enabled;
    renderMetaKeyProfileCard();
    renderLocaleModeToggle();
    renderConfigContext(siteId, moduleId);
    renderSites(siteId);
    renderModules(siteId, moduleId);
    renderModuleSettings(siteId, moduleId, token);
    flushDeepLinkScroll();
    localizeBody(resolveUiLocale());
  }

  async function init() {
    setStatus('正在加载设置…');
    ensureLocaleObserver();
    try {
      const settings = await getSettings();
      currentSettings = settings;
      applyDeepLinkSelection();
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

  for (const input of [inputMetaKeyModeAuto, inputMetaKeyModeHasMeta, inputMetaKeyModeNoMeta]) {
    input?.addEventListener('change', () => {
      if (!input.checked) return;
      const nextMode = normalizeMetaKeyMode(input.value, META_KEY_MODE_AUTO);
      patchQuickNavSettings((next) => {
        next.metaKeyMode = nextMode;
      });
    });
  }

  btnLocaleToggleZh?.addEventListener('click', () => {
    patchQuickNavSettings((next) => {
      next.localeMode = LOCALE_MODE_ZH_CN;
    });
  });

  btnLocaleToggleEn?.addEventListener('click', () => {
    patchQuickNavSettings((next) => {
      next.localeMode = LOCALE_MODE_EN;
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

  btnFactoryReset?.addEventListener('click', () => {
    const run = async () => {
      const ok = window.confirm(localeText(
        '将清空扩展的所有设置与缓存（storage/local/sync/session、已注册内容脚本等），并自动重新加载扩展。\n\n确定要恢复出厂吗？',
        'This will clear all extension settings and caches (storage/local/sync/session, registered content scripts, and more), then reload the extension automatically.\n\nContinue with factory reset?'
      ));
      if (!ok) return;

      setStatus('正在清空所有数据（恢复出厂）…');
      if (btnFactoryReset) btnFactoryReset.disabled = true;
      if (btnRestoreDefault) btnRestoreDefault.disabled = true;
      if (btnReinjectNow) btnReinjectNow.disabled = true;

      try {
        await factoryReset();
        setStatus('已触发恢复出厂：扩展即将重新加载。完成后请刷新已打开的页面。', 'ok');
      } catch (e) {
        setStatus(`恢复出厂失败：${e instanceof Error ? e.message : String(e)}`, 'err');
        if (btnFactoryReset) btnFactoryReset.disabled = false;
        if (btnRestoreDefault) btnRestoreDefault.disabled = false;
        if (btnReinjectNow) btnReinjectNow.disabled = false;
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

  const runGpt53Action = (action) => {
    if (!elGpt53Status) return;
    const isRun = action === 'run';
    const isSave = action === 'save';
    const btnA = btnGpt53Refresh;
    const btnB = btnGpt53Run;
    const btnC = btnGpt53Save;

    const run = async () => {
      const seq = ++gpt53Seq;
      if (btnA) btnA.disabled = true;
      if (btnB) btnB.disabled = true;
      if (btnC) btnC.disabled = true;
      elGpt53Status.textContent = isRun ? '正在检测…' : isSave ? '正在保存…' : '正在读取…';
      try {
        const resp = await sendMessage({
          type: isRun ? 'AISHORTCUTS_GPT53_RUN' : isSave ? 'AISHORTCUTS_GPT53_SET_URLS' : 'AISHORTCUTS_GPT53_GET_STATUS',
          urlsText: isSave ? elGpt53Urls?.value || '' : undefined
        });
        if (seq !== gpt53Seq) return;
        if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed');
        renderGpt53AlertBox(resp.alerts);
        renderGpt53MonitorStatus(resp);
        setStatus(isRun ? '已完成检测' : isSave ? '已保存监控列表' : '已读取监控状态', 'ok');
      } catch (e) {
        if (seq !== gpt53Seq) return;
        elGpt53Status.textContent = '';
        const box = document.createElement('div');
        box.className = 'gpt53StatusSummary';
        box.textContent = `（失败）${e instanceof Error ? e.message : String(e)}`;
        elGpt53Status.appendChild(box);
        setStatus(`OpenAI 监控操作失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        if (btnA) btnA.disabled = false;
        if (btnB) btnB.disabled = false;
        if (btnC) btnC.disabled = false;
      }
    };
    void run();
  };

  btnGpt53Save?.addEventListener('click', () => runGpt53Action('save'));
  btnGpt53Refresh?.addEventListener('click', () => runGpt53Action('status'));
  btnGpt53Run?.addEventListener('click', () => runGpt53Action('run'));
  btnGpt53MarkRead?.addEventListener('click', () => {
    const run = async () => {
      if (btnGpt53MarkRead) btnGpt53MarkRead.disabled = true;
      try {
        const resp = await sendMessage({ type: 'AISHORTCUTS_GPT53_MARK_READ' });
        if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed');
        renderGpt53AlertBox(resp.alerts);
        setStatus('已清除 OpenAI 新模型提示', 'ok');
        try {
          if (elGpt53Status) runGpt53Action('status');
        } catch {}
      } catch (e) {
        setStatus(`清除提示失败：${e instanceof Error ? e.message : String(e)}`, 'err');
      } finally {
        if (btnGpt53MarkRead) btnGpt53MarkRead.disabled = false;
      }
    };
    void run();
  });

  // Load the current monitor config/status once on open so users can edit immediately.
  try {
    if (elGpt53Status) runGpt53Action('status');
  } catch {}

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      try {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type !== 'AISHORTCUTS_GPT53_ALERT') return;
        // Refresh alert box (and status JSON) when a new alert arrives while options is open.
        if (elGpt53Status) runGpt53Action('status');
      } catch {}
    });
  } catch {}

  window.addEventListener('hashchange', () => {
    try {
      if (!applyDeepLinkSelection()) return;
      if (!currentSettings) return;
      renderAll();
    } catch {}
  });

  initUiThemeToggle();
  init();
})();
