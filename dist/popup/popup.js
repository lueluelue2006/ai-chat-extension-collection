(() => {
  'use strict';

  const REPO = 'lueluelue2006/ai-chat-extension-collection';
  const AUTHOR = 'lueluelue2006';
  const REPO_URL = `https://github.com/${REPO}`;
  const RELEASES_URL = `${REPO_URL}/releases`;
  const RAW_MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/dist/manifest.json`;
  const SHOW_DESCRIPTIONS = false;
  const I18N = (() => {
    try {
      return globalThis.AISHORTCUTS_I18N || null;
    } catch {
      return null;
    }
  })();
  let currentLocaleMode = 'auto';
  let lastStatusRaw = '';
  let lastStatusKind = '';
  let localeObserver = null;
  let localeObserverTimer = 0;

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
  const btnCheck = document.getElementById('checkUpdate');
  const btnOpen = document.getElementById('openRepo');
  const btnOptions = document.getElementById('openOptions');
  const btnExportDiagnostics = document.getElementById('exportDiagnostics');
  const elGpt53AlertCard = document.getElementById('gpt53AlertCard');
  const elGpt53AlertText = document.getElementById('gpt53AlertText');
  const btnGpt53AlertOpenOptions = document.getElementById('gpt53AlertOpenOptions');
  const btnGpt53AlertMarkRead = document.getElementById('gpt53AlertMarkRead');
  const elSiteName = document.getElementById('siteName');
  const elSiteUrl = document.getElementById('siteUrl');
  const elToggleList = document.getElementById('toggleList');
  let currentPageMetaResolved = false;

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

  function resolveUiLocale() {
    try {
      if (typeof I18N?.resolveLocale === 'function') return I18N.resolveLocale(currentLocaleMode, navigator);
    } catch {}
    return 'en';
  }

  function translateText(text) {
    try {
      if (typeof I18N?.translateText === 'function') return I18N.translateText(text, resolveUiLocale());
    } catch {}
    return String(text ?? '');
  }

  function localizeBody() {
    try {
      document.documentElement.lang = String(resolveUiLocale() || 'en');
    } catch {}
    try {
      if (typeof I18N?.localizeTree === 'function') I18N.localizeTree(document.body, resolveUiLocale());
    } catch {}
    try {
      document.title = /^zh/i.test(resolveUiLocale()) ? 'AI Shortcuts' : 'AI Shortcuts';
    } catch {}
    try {
      if (elStatus && lastStatusRaw) elStatus.textContent = translateText(lastStatusRaw);
      elStatus?.classList?.remove?.('ok', 'warn', 'err');
      if (elStatus && lastStatusKind) elStatus.classList.add(lastStatusKind);
    } catch {}
  }

  function scheduleLocalizeBody() {
    if (localeObserverTimer) return;
    localeObserverTimer = window.setTimeout(() => {
      localeObserverTimer = 0;
      localizeBody();
    }, 40);
  }

  function ensureLocaleObserver() {
    if (localeObserver || typeof MutationObserver !== 'function') return;
    try {
      localeObserver = new MutationObserver(() => scheduleLocalizeBody());
      localeObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    } catch {}
  }

  function setStatus(text, kind = '') {
    lastStatusRaw = String(text || '');
    lastStatusKind = String(kind || '');
    elStatus.textContent = translateText(lastStatusRaw);
    elStatus.classList.remove('ok', 'warn', 'err');
    if (kind) elStatus.classList.add(kind);
    localizeBody();
  }

  function getRuntimeVersion() {
    try {
      return String(chrome?.runtime?.getManifest?.()?.version || '').trim();
    } catch {
      return '';
    }
  }

  function getRuntimeId() {
    try {
      return String(chrome?.runtime?.id || '').trim();
    } catch {
      return '';
    }
  }

  function formatDateForFileName(date = new Date()) {
    const pad = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      '-',
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join('');
  }

  function redactUrlForDiagnostics(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      const path = String(parsed.pathname || '/')
        .split('/')
        .map((segment) => {
          if (!segment) return '';
          const decoded = (() => {
            try {
              return decodeURIComponent(segment);
            } catch {
              return segment;
            }
          })();
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)) return ':id';
          if (/^[A-Za-z0-9_-]{24,}$/.test(decoded)) return ':id';
          return segment.slice(0, 80);
        })
        .join('/')
        .slice(0, 240);
      return `${parsed.origin}${path}`;
    } catch {
      return '';
    }
  }

  function sanitizeDiagnosticDump(dump) {
    if (!dump || typeof dump !== 'object') return dump || null;
    const copy = cloneJsonSafe(dump) || {};
    if (Array.isArray(copy.events)) {
      copy.events = copy.events.map((event) => {
        if (!event || typeof event !== 'object') return event;
        const next = Object.assign({}, event);
        if (next.url) next.url = redactUrlForDiagnostics(next.url);
        return next;
      });
    }
    return copy;
  }

  function summarizeSettingsForDiagnostics(settings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const sites = source.sites && typeof source.sites === 'object' ? source.sites : {};
    const siteModules = source.siteModules && typeof source.siteModules === 'object' ? source.siteModules : {};
    const moduleSummary = {};
    for (const [siteId, mods] of Object.entries(siteModules)) {
      if (!mods || typeof mods !== 'object') continue;
      const values = Object.values(mods);
      moduleSummary[siteId] = {
        total: values.length,
        enabled: values.filter((v) => v !== false).length,
        disabled: values.filter((v) => v === false).length
      };
    }
    return {
      enabled: source.enabled !== false,
      metaKeyMode: String(source.metaKeyMode || 'auto'),
      localeMode: String(source.localeMode || 'auto'),
      sites,
      moduleSummary
    };
  }

  function safeDiagnosticError(error) {
    return error instanceof Error ? error.message : String(error || '');
  }

  async function executePageDiagnosticScript(tabId, world) {
    if (!Number.isFinite(tabId)) return { ok: false, error: 'no tabId' };
    if (!chrome?.scripting?.executeScript) return { ok: false, error: 'chrome.scripting unavailable' };
    try {
      const result = await new Promise((resolve, reject) => {
        try {
          const details = {
            target: { tabId, frameIds: [0] },
            func: () => {
              function readHref() {
                try {
                  return String(location.href || '');
                } catch {
                  return '';
                }
              }
              function redactUrl(input) {
                try {
                  const parsed = new URL(String(input || ''));
                  const path = String(parsed.pathname || '/')
                    .split('/')
                    .map((segment) => {
                      if (!segment) return '';
                      let decoded = segment;
                      try {
                        decoded = decodeURIComponent(segment);
                      } catch {}
                      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)) return ':id';
                      if (/^[A-Za-z0-9_-]{24,}$/.test(decoded)) return ':id';
                      return segment.slice(0, 80);
                    })
                    .join('/')
                    .slice(0, 240);
                  return `${parsed.origin}${path}`;
                } catch {
                  return '';
                }
              }
              function safeBoolGlobal(key) {
                try {
                  return !!globalThis[key];
                } catch {
                  return false;
                }
              }
              function readDataset(keys) {
                const out = {};
                try {
                  const ds = document.documentElement?.dataset || {};
                  for (const key of keys) {
                    const value = ds[key];
                    if (typeof value === 'string') out[key] = value.slice(0, 160);
                  }
                } catch {}
                return out;
              }
              function textLength(value) {
                return String(value || '').length;
              }
              function sanitizeTabQueueDebug() {
                try {
                  const api = globalThis.__aichat_chatgpt_tab_queue_debug_v1__;
                  if (!api || typeof api.getState !== 'function') return null;
                  const state = api.getState() || {};
                  const queue = Array.isArray(state.queue) ? state.queue : [];
                  return {
                    present: true,
                    queueLength: queue.length,
                    queue: queue.slice(0, 20).map((item) => ({
                      id: String(item?.id || '').slice(0, 80),
                      textLength: textLength(item?.text),
                      conversationIdPresent: !!item?.conversationId,
                      createdAt: Number(item?.createdAt) || 0,
                      hasQueuePoolHold: !!item?.queuePoolHold,
                      queuePoolHoldActive: !!item?.queuePoolHold?.active
                    })),
                    activeRequestCount: Array.isArray(state.activeRequestIds) ? state.activeRequestIds.length : 0,
                    pendingHighlightCount: Array.isArray(state.pendingHighlightCandidates) ? state.pendingHighlightCandidates.length : 0,
                    highlightedMsgIdCount: Array.isArray(state.highlightedMsgIds) ? state.highlightedMsgIds.length : 0,
                    highlightedKeyCount: Array.isArray(state.highlightedKeys) ? state.highlightedKeys.length : 0,
                    isGenerating: !!state.isGenerating,
                    processQueueBusy: !!state.processQueueBusy,
                    awaitingConversationStart: !!state.awaitingConversationStart,
                    hasPendingSendGate: !!state.pendingSendGate,
                    hasManualSendInterlock: !!state.manualSendInterlock,
                    hasComposerInterlock: !!state.composerInterlock,
                    restoredQueuedDraft: state.restoredQueuedDraft
                      ? {
                          id: String(state.restoredQueuedDraft.id || '').slice(0, 80),
                          textLength: textLength(state.restoredQueuedDraft.text),
                          activeResponseAtRestore: !!state.restoredQueuedDraft.activeResponseAtRestore
                        }
                      : null,
                    composerTextCache: state.composerTextCache
                      ? {
                          textLength: textLength(state.composerTextCache.text),
                          ageMs: Number(state.composerTextCache.ageMs) || 0,
                          hasEditor: !!state.composerTextCache.hasEditor,
                          editorConnected: !!state.composerTextCache.editorConnected
                        }
                      : null
                  };
                } catch (error) {
                  return { present: false, error: error instanceof Error ? error.message : String(error) };
                }
              }
              function collectKnownGlobals() {
                const keys = [
                  '__aichat_quicknav_bridge_v1__',
                  '__aichat_quicknav_bridge_main_v1__',
                  '__aichat_chatgpt_core_v1__',
                  '__aichat_chatgpt_core_main_v1__',
                  '__aichat_chatgpt_tab_queue_v1__',
                  '__aichat_chatgpt_tab_queue_debug_v1__',
                  '__cgpt_perf_get_state_v1__',
                  '__aichat_chatgpt_message_tree_v1__',
                  '__aichat_chatgpt_message_tree_state__',
                  '__aichat_chatgpt_better_tex_quote_v2__'
                ];
                const out = {};
                for (const key of keys) out[key] = safeBoolGlobal(key);
                return out;
              }
              function collectPerfState() {
                try {
                  const fn = globalThis.__cgpt_perf_get_state_v1__;
                  if (typeof fn !== 'function') return null;
                  const state = fn() || {};
                  return {
                    enabled: state.enabled,
                    hot: state.hot,
                    heavy: state.heavy,
                    extreme: state.extreme,
                    mode: state.mode,
                    budget: state.budget,
                    turnCount: state.turnCount,
                    nodeCount: state.nodeCount,
                    mathCount: state.mathCount,
                    displayMathCount: state.displayMathCount,
                    codeBlockCount: state.codeBlockCount,
                    longCodeCount: state.longCodeCount,
                    generating: state.generating
                  };
                } catch (error) {
                  return { error: error instanceof Error ? error.message : String(error) };
                }
              }
              return {
                href: redactUrl(readHref()),
                readyState: String(document.readyState || ''),
                visibilityState: String(document.visibilityState || ''),
                focused: (() => {
                  try {
                    return document.hasFocus();
                  } catch {
                    return false;
                  }
                })(),
                dataset: readDataset([
                  'quicknavCoreErrorCount',
                  'quicknavMemHeapMb',
                  'quicknavMemDomNodes',
                  'quicknavMemTurns',
                  'quicknavMemAt',
                  'cgptperfEnabled',
                  'cgptperfHot',
                  'cgptperfHeavy',
                  'cgptperfExtreme',
                  'cgptperfBudget',
                  'cgptperfTurnCount',
                  'cgptperfMathCount',
                  'cgptperfDisplayMathCount',
                  'cgptperfCodeBlockCount',
                  'cgptperfLongCodeCount',
                  'cgptperfGenerating',
                  'aichatTabQueueEnabled',
                  'aichatTabQueueCtrlCClearEnabled',
                  'aichatTabQueueQuicknavMarkEnabled'
                ]),
                globals: collectKnownGlobals(),
                tabQueue: sanitizeTabQueueDebug(),
                perf: collectPerfState()
              };
            }
          };
          if (world) details.world = world;
          chrome.scripting.executeScript(details, (items) => {
            const err = chrome.runtime.lastError;
            if (err) return reject(new Error(err.message || String(err)));
            resolve(items?.[0]?.result || null);
          });
        } catch (error) {
          reject(error);
        }
      });
      return { ok: true, world: world || 'ISOLATED', result };
    } catch (error) {
      return { ok: false, world: world || 'ISOLATED', error: safeDiagnosticError(error) };
    }
  }

  async function collectActivePageDiagnostics(ctx) {
    const tabId = ctx?.tabId;
    const out = {
      activeSiteId: ctx?.activeSiteId || '',
      href: redactUrlForDiagnostics(ctx?.href || getTabHrefCandidate(ctx?.tab)),
      tab: {
        id: Number.isFinite(tabId) ? tabId : null,
        status: String(ctx?.tab?.status || ''),
        audible: !!ctx?.tab?.audible,
        discarded: !!ctx?.tab?.discarded,
        incognito: !!ctx?.tab?.incognito
      },
      menu: ctx?.menuResp && ctx.menuResp.ok === true
        ? {
            ok: true,
            href: redactUrlForDiagnostics(ctx.menuResp.href),
            commandCount: Array.isArray(ctx.menuResp.commands) ? ctx.menuResp.commands.length : 0,
            commands: (Array.isArray(ctx.menuResp.commands) ? ctx.menuResp.commands : []).slice(0, 80).map((cmd) => ({
              name: String(cmd?.name || '').slice(0, 120),
              group: String(cmd?.group || '').slice(0, 120),
              moduleId: String(cmd?.moduleId || '').slice(0, 120)
            }))
          }
        : { ok: false, error: ctx?.menuResp?.error || '' },
      worlds: []
    };
    if (Number.isFinite(tabId)) {
      out.worlds.push(await executePageDiagnosticScript(tabId, 'ISOLATED'));
      out.worlds.push(await executePageDiagnosticScript(tabId, 'MAIN'));
    }
    return out;
  }

  function downloadJsonFile(payload, filename) {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        a.remove();
      } catch {}
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 1000);
  }

  function setDiagnosticsButtonBusy(busy) {
    if (!btnExportDiagnostics) return;
    btnExportDiagnostics.disabled = !!busy;
    btnExportDiagnostics.textContent = translateText(busy ? '导出中…' : '导出诊断包');
  }

  function setCheckButtonBusy(busy) {
    if (!btnCheck) return;
    btnCheck.disabled = !!busy;
    btnCheck.textContent = translateText(busy ? '检查中…' : '检查更新');
  }

  function buildUpdateActionHint() {
    const id = getRuntimeId();
    const zh = [
      '更新当前已安装实例：请去 Releases 下载最新 dist.zip，覆盖原目录后再到 chrome://extensions 点“重新加载”。',
      '如果 Releases 里暂时还没有这个版本，说明 main 分支已经更新，但发布包还没同步。',
      '不要再次使用“加载未打包的扩展程序”去装另一份目录副本，否则会出现两个同名扩展。'
    ];
    const en = [
      'To update the current installed instance, download the latest dist.zip from Releases, replace the files in your existing folder, then click “Reload” in chrome://extensions.',
      'If Releases does not contain this version yet, main has been updated but the release package has not been published yet.',
      'Do not use “Load unpacked” again with another folder copy, or you will end up with two extensions of the same name.'
    ];
    const lines = /^zh/i.test(resolveUiLocale()) ? zh : en;
    if (id) lines.push(/^zh/i.test(resolveUiLocale()) ? `当前扩展 ID：${id}` : `Current extension ID: ${id}`);
    return lines.join('\n');
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
      setStatus(/^zh/i.test(resolveUiLocale()) ? `已拦截不安全链接：${raw}` : `Blocked an unsafe link: ${raw}`, 'warn');
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
      setStatus(/^zh/i.test(resolveUiLocale()) ? '打开配置失败' : 'Failed to open settings', 'err');
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
      setStatus(/^zh/i.test(resolveUiLocale()) ? '打开配置失败' : 'Failed to open settings', 'err');
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
    const joiner = /^zh/i.test(resolveUiLocale()) ? '，' : ', ';
    const msg = parts.length ? `${parts.join(joiner)}${more}` : '';
    elGpt53AlertText.textContent = /^zh/i.test(resolveUiLocale())
      ? `检测到 ${unread} 条资源可用（每次检测都会提醒）：${msg}`
      : `${unread} monitored resources are available: ${msg}`;
    elGpt53AlertCard.hidden = false;
    localizeBody();
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

  function getSiteDisplayMeta(siteIdOrSite) {
    const site =
      siteIdOrSite && typeof siteIdOrSite === 'object'
        ? siteIdOrSite
        : getSiteDef(siteIdOrSite);
    return {
      name: translateText(String(site?.name || '').trim()),
      sub: translateText(String(site?.sub || '').trim())
    };
  }

  function getModuleDef(moduleId) {
    return MODULE_DEFS[moduleId] || { name: moduleId, sub: '' };
  }

  function shortenChatGPTModuleName(name) {
    return String(name || '').replace(/^ChatGPT\s+/i, '').trim();
  }

  function getModuleDisplayMeta(siteId, moduleId) {
    const def = getModuleDef(moduleId);
    let name = translateText(String(def?.name || moduleId || '').trim());
    const sub = translateText(String(def?.sub || '').trim());
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

  function tabsGet(tabId) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.get(tabId, (tab) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(tab || null);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function readDebugTabId() {
    try {
      const url = new URL(location.href);
      const raw = String(url.searchParams.get('debugTabId') || '').trim();
      if (!/^\d+$/.test(raw)) return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function getTabHrefCandidate(tab) {
    if (!tab || typeof tab !== 'object') return '';
    const direct = typeof tab.url === 'string' ? tab.url : '';
    if (direct) return direct;
    const pending = typeof tab.pendingUrl === 'string' ? tab.pendingUrl : '';
    if (pending) return pending;
    const fallback = typeof tab.pendingUrl === 'string' ? tab.pendingUrl : '';
    return fallback || '';
  }

  function setCurrentPageMeta(name, href = '', { resolved = false } = {}) {
    if (resolved || !!href) currentPageMetaResolved = true;
    if (elSiteName) elSiteName.textContent = translateText(String(name || ''));
    if (elSiteUrl) elSiteUrl.textContent = href ? href.replace(/^https?:\/\//, '') : '';
  }

  async function resolveActivePageContext({ attempts = 8, delayMs = 180, debugTabId = null } = {}) {
    let lastTab = null;
    let lastMenuResp = null;
    let lastHref = '';
    for (let i = 0; i < Math.max(1, Number(attempts) || 1); i++) {
      const tab = Number.isFinite(debugTabId) ? await tabsGet(debugTabId) : await tabsQueryActive();
      lastTab = tab;
      const tabId = tab?.id;
      if (!Number.isFinite(tabId)) throw new Error('No active tab');

      let menuResp = null;
      try {
        menuResp = await tabsSendMessage(tabId, { type: 'AISHORTCUTS_GET_MENU' });
      } catch {
        menuResp = null;
      }
      lastMenuResp = menuResp;

      const href =
        (menuResp && menuResp.ok === true && typeof menuResp.href === 'string' && menuResp.href) ||
        getTabHrefCandidate(tab) ||
        '';
      lastHref = href || lastHref;
      const activeSiteId = getSiteIdFromUrl(href);
      if (href && (activeSiteId || (menuResp && menuResp.ok === true))) {
        return { tab, tabId, menuResp, href, activeSiteId, settled: true };
      }
      if (i < attempts - 1) await sleep(delayMs);
    }
    const href = lastHref || getTabHrefCandidate(lastTab) || '';
    return {
      tab: lastTab,
      tabId: lastTab?.id,
      menuResp: lastMenuResp,
      href,
      activeSiteId: getSiteIdFromUrl(href),
      settled: false
    };
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
    mainEl.textContent = translateText(String(main || ''));

    textWrap.appendChild(mainEl);
    if (SHOW_DESCRIPTIONS) {
      const subEl = document.createElement('span');
      subEl.className = 'labelSub';
      subEl.textContent = translateText(String(sub || ''));
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
      btn.title = translateText('打开配置（定位到该脚本）');
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
    h.textContent = translateText(title);
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
      btn.textContent = translateText(c.name);
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
    if (/对话导出|Conversation export/i.test(g)) return 'chatgpt_export_conversation';
    if (/用量统计|Usage monitor/i.test(g)) return 'chatgpt_usage_monitor';
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
      const commonDisplay = getSiteDisplayMeta(commonDef);
      const group = createGroup(`${commonDisplay.name} (${commonDisplay.sub})`);
      group.appendChild(
        createToggleRow({
          main: `启用 ${commonDisplay.name}`,
          sub: commonDisplay.sub,
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

    const siteDisplay = getSiteDisplayMeta(siteDef);
    const group = createGroup(`${siteDisplay.name} (${siteDisplay.sub})`);
    group.appendChild(
      createToggleRow({
        main: `启用 ${siteDisplay.name}`,
        sub: siteDisplay.sub,
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
    const localVersion = getRuntimeVersion();
    const zh = /^zh/i.test(resolveUiLocale());
    setStatus(zh ? '正在检查更新…' : 'Checking for updates…');
    setCheckButtonBusy(true);
    try {
      const remoteVersion = await fetchRemoteManifestVersion();
      if (!remoteVersion) throw new Error(zh ? '远端 dist/manifest.json 没有 version 字段' : 'Remote dist/manifest.json has no version field');

      const cmp = cmpSemver(remoteVersion, localVersion);
      if (cmp > 0) {
        setStatus(
          zh
            ? `发现新版本：v${remoteVersion}\n当前版本：v${localVersion}\n\n${buildUpdateActionHint()}`
            : `New version available: v${remoteVersion}\nCurrent version: v${localVersion}\n\n${buildUpdateActionHint()}`,
          'warn'
        );
        return;
      }
      if (cmp < 0) {
        setStatus(
          zh
            ? `远端版本：v${remoteVersion}\n当前版本：v${localVersion}\n\n当前版本比远端新。通常表示你正在使用本地开发版，或者 GitHub main 还没同步到这个版本。`
            : `Remote version: v${remoteVersion}\nCurrent version: v${localVersion}\n\nYour local version is newer than main. This usually means you are on a local development build or GitHub main has not caught up yet.`,
          'ok'
        );
        return;
      }
      setStatus(
        zh
          ? `已是最新版本：v${localVersion}\n\n若你刚替换过代码，请打开扩展页并对当前实例点“重新加载”，不要重新加载另一份目录副本。`
          : `Already up to date: v${localVersion}\n\nIf you have just replaced the files, open the extensions page and click “Reload” on the current instance instead of loading another folder copy.`,
        'ok'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(
        zh
          ? `检查失败：${msg}\n\n你可以直接打开 Releases 页面下载最新 dist.zip；若要应用新代码，请覆盖当前目录后点“重新加载”，不要重复安装第二份。`
          : `Update check failed: ${msg}\n\nYou can download the latest dist.zip directly from Releases. To apply new code, replace the files in your current folder and click “Reload” instead of installing a second copy.`,
        'err'
      );
    } finally {
      setCheckButtonBusy(false);
    }
  }

  async function exportDiagnostics() {
    const zh = /^zh/i.test(resolveUiLocale());
    setDiagnosticsButtonBusy(true);
    setStatus(zh ? '正在生成诊断包…' : 'Building diagnostics…');
    try {
      const [settingsResult, diagResult, gpt53Result] = await Promise.allSettled([
        getSettings(),
        sendRuntimeMessage({ type: 'AISHORTCUTS_DIAG_GET_DUMP', tail: 120 }),
        sendRuntimeMessage({ type: 'AISHORTCUTS_GPT53_GET_STATUS' })
      ]);

      const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
      let page = null;
      let pageError = '';
      try {
        const ctx = await resolveActivePageContext({ attempts: 3, delayMs: 120, debugTabId: readDebugTabId() });
        page = await collectActivePageDiagnostics(ctx);
      } catch (error) {
        pageError = safeDiagnosticError(error);
      }

      const gpt53 =
        gpt53Result.status === 'fulfilled' && gpt53Result.value && gpt53Result.value.ok === true
          ? {
              enabled: !!gpt53Result.value.enabled,
              monitorEnabled: !!gpt53Result.value.monitorEnabled,
              monitorReason: String(gpt53Result.value.monitorReason || ''),
              urlCount: Array.isArray(gpt53Result.value.urls) ? gpt53Result.value.urls.length : 0,
              alertUnread: Number(gpt53Result.value.alerts?.unread) || 0
            }
          : { ok: false, error: gpt53Result.status === 'rejected' ? safeDiagnosticError(gpt53Result.reason) : String(gpt53Result.value?.error || '') };

      const payload = {
        schema: 'ai-shortcuts-diagnostics-v1',
        generatedAt: new Date().toISOString(),
        extension: {
          name: (() => {
            try {
              return chrome.runtime.getManifest().name || 'AI Shortcuts';
            } catch {
              return 'AI Shortcuts';
            }
          })(),
          version: getRuntimeVersion(),
          id: getRuntimeId()
        },
        registry: {
          ok: REGISTRY_OK,
          siteCount: SITE_DEFS.length,
          moduleCount: Object.keys(MODULE_DEFS || {}).length
        },
        settings:
          settingsResult.status === 'fulfilled'
            ? summarizeSettingsForDiagnostics(settings)
            : { ok: false, error: safeDiagnosticError(settingsResult.reason) },
        page: page || { ok: false, error: pageError || 'active page unavailable' },
        backgroundDiag:
          diagResult.status === 'fulfilled' && diagResult.value && diagResult.value.ok === true
            ? sanitizeDiagnosticDump(diagResult.value.dump)
            : { ok: false, error: diagResult.status === 'rejected' ? safeDiagnosticError(diagResult.reason) : String(diagResult.value?.error || '') },
        openAiModelWatch: gpt53,
        privacy: {
          rawConversationText: false,
          rawComposerText: false,
          rawCookies: false,
          rawStorageDump: false,
          note: 'Text-like runtime fields are reduced to counts/lengths; URLs are redacted to origin + path.'
        }
      };

      downloadJsonFile(payload, `ai-shortcuts-diagnostics-${formatDateForFileName()}.json`);
      setStatus(zh ? '诊断包已导出。' : 'Diagnostics exported.', 'ok');
    } catch (error) {
      setStatus(
        zh
          ? `导出诊断包失败：${safeDiagnosticError(error)}`
          : `Failed to export diagnostics: ${safeDiagnosticError(error)}`,
        'err'
      );
    } finally {
      setDiagnosticsButtonBusy(false);
    }
  }

  // init
  try {
    ensureLocaleObserver();
    elAuthor.textContent = AUTHOR;
    elVersion.textContent = getRuntimeVersion() || 'unknown';
    setStatus(
      /^zh/i.test(resolveUiLocale())
        ? '就绪'
        : 'Ready'
    );
    void getSettings()
      .then((settings) => {
        currentLocaleMode = String(settings?.localeMode || 'auto');
        localizeBody();
      })
      .catch(() => {
        localizeBody();
      });
  } catch {
    setStatus('初始化失败', 'err');
  }

  btnOpen?.addEventListener('click', () => openUrl(RELEASES_URL));
  btnCheck?.addEventListener('click', checkUpdate);
  btnOptions?.addEventListener('click', () => openOptionsTo('', ''));
  btnExportDiagnostics?.addEventListener('click', () => {
    void exportDiagnostics();
  });
  btnGpt53AlertOpenOptions?.addEventListener('click', () => openOptionsTo('', ''));
  btnGpt53AlertMarkRead?.addEventListener('click', async () => {
    if (btnGpt53AlertMarkRead) btnGpt53AlertMarkRead.disabled = true;
    try {
      await sendRuntimeMessage({ type: 'AISHORTCUTS_GPT53_MARK_READ' });
      await refreshGpt53AlertCard();
      setStatus(/^zh/i.test(resolveUiLocale()) ? '已清除 OpenAI 新模型提示' : 'Cleared the OpenAI model alert', 'ok');
    } catch (e) {
      setStatus(
        /^zh/i.test(resolveUiLocale())
          ? `清除提示失败：${e instanceof Error ? e.message : String(e)}`
          : `Failed to clear alert: ${e instanceof Error ? e.message : String(e)}`,
        'err'
      );
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
      currentPageMetaResolved = false;
      setCurrentPageMeta('检测中…', '');
      const ctx = await resolveActivePageContext({ debugTabId: readDebugTabId() });
      const tab = ctx?.tab;
      const tabId = ctx?.tabId;
      if (!Number.isFinite(tabId)) throw new Error('No active tab');

      let menuResp = ctx?.menuResp || null;
      const href = String(ctx?.href || '');
      const activeSiteId = getSiteIdFromUrl(href);
      const siteDef = activeSiteId ? getSiteDef(activeSiteId) : null;
      setCurrentPageMeta(siteDef ? getSiteDisplayMeta(siteDef).name : href ? '未支持站点' : '未检测', href, {
        resolved: !!href
      });

      let settings = await getSettings();
      currentLocaleMode = String(settings?.localeMode || 'auto');
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

          setStatus(/^zh/i.test(resolveUiLocale()) ? '正在保存…' : 'Saving…');
          try {
            settings = await patchSettings(patch);
          } catch (e) {
            setStatus(`保存失败：${e instanceof Error ? e.message : String(e)}`, 'err');
            return;
          }

          setStatus(/^zh/i.test(resolveUiLocale()) ? '已保存' : 'Saved.', 'ok');
          renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate: mutateSettings, onRunMenu });
          localizeBody();
          queueMenuRefresh(300);
        });
      }

      async function onRunMenu(cmd) {
        try {
          setStatus(/^zh/i.test(resolveUiLocale()) ? `正在执行：${cmd.name}…` : `Running: ${cmd.name}…`);
          const resp = await tabsSendMessage(tabId, { type: 'AISHORTCUTS_RUN_MENU', id: cmd.id });
          if (resp && resp.ok === true) setStatus(/^zh/i.test(resolveUiLocale()) ? `已执行：${cmd.name}` : `Completed: ${cmd.name}`, 'ok');
          else setStatus(/^zh/i.test(resolveUiLocale()) ? `执行失败：${resp?.error || 'unknown'}` : `Run failed: ${resp?.error || 'unknown'}`, 'err');
        } catch (e) {
          setStatus(
            /^zh/i.test(resolveUiLocale())
              ? `执行失败：${e instanceof Error ? e.message : String(e)}`
              : `Run failed: ${e instanceof Error ? e.message : String(e)}`,
            'err'
          );
        }
      }

      renderToggles({ settings, activeSiteId, menuByModule, unmappedMenu, onMutate: mutateSettings, onRunMenu });
      localizeBody();
      if ((!menuResp || menuResp.ok !== true) && activeSiteId) queueMenuRefresh(220);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!currentPageMetaResolved) setCurrentPageMeta('未检测', '');
      setStatus(/^zh/i.test(resolveUiLocale()) ? `初始化菜单失败：${msg}` : `Failed to initialize the menu: ${msg}`, 'warn');
    }
  })();
})();
