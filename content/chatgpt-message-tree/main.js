(() => {
  'use strict';

  // ChatGPT conversation tree viewer (read-only).
  // Fetches /backend-api/conversation/:id and renders mapping as a collapsible tree.

  const STATE_KEY = '__aichat_chatgpt_message_tree_state__';
  const STATE_VERSION = 2;
  const STYLE_VERSION = 25;

  // Legacy key used by early versions (non-configurable). Keep only for best-effort cleanup.
  const LEGACY_KEY = '__aichat_chatgpt_message_tree_v1__';
  const STYLE_ID = '__aichat_chatgpt_message_tree_style_v1__';
  const TOGGLE_ID = '__aichat_chatgpt_message_tree_toggle_v1__';
  const PANEL_ID = '__aichat_chatgpt_message_tree_panel_v1__';
  const PREFS_KEY = '__aichat_chatgpt_message_tree_prefs_v1__';
  const MSG_HIGHLIGHT_CLASS = '__aichat_chatgpt_message_tree_msg_highlight_v1__';
  const GRAPH_API_KEY = '__aichat_chatgpt_conversation_graph_v1__';
  const MAPPING_CLIENT_KEY = '__aichat_chatgpt_mapping_client_v1__';
  const MAX_MAPPING_JSON_BYTES = 6 * 1024 * 1024;
  const MESSAGES = Object.freeze({
    panelTitle: { zh: '对话树', en: 'Conversation Tree' },
    toggleTitle: { zh: '对话树', en: 'Conversation tree' },
    simpleTitle: { zh: '隐藏系统/工具/内部节点（简洁）', en: 'Hide system / tool / internal nodes (simple view)' },
    simpleLabel: { zh: '简洁', en: 'Simple' },
    guidesTitle: { zh: '彩色对齐竖线（类似 VSCode 缩进线）', en: 'Colored alignment guides (similar to VSCode indent guides)' },
    guidesLabel: { zh: '彩线', en: 'Guides' },
    refreshLabel: { zh: '刷新', en: 'Refresh' },
    exportLabel: { zh: '导出 JSON', en: 'Export JSON' },
    closeLabel: { zh: '关闭', en: 'Close' },
    treeTooLarge: { zh: '对话树数据过大（>{size}MB），为稳定性已跳过加载', en: 'The conversation tree data is too large (>{size} MB), so loading was skipped for stability.' },
    nodeNotFoundInTree: { zh: '未在树数据中找到该节点', en: 'The node was not found in the tree data.' },
    turnNotFoundInPage: {
      zh: '未在页面中找到该节点对应的消息（可能不在当前分支：1/2、2/3 未切换，或系统/内部节点未渲染）',
      en: 'The message for this node was not found on the page. It may be on a different branch, or be a system/internal node that is not rendered.'
    },
    loadedConversation: { zh: '已加载：{id}…', en: 'Loaded: {id}…' },
    loading: { zh: '加载中…', en: 'Loading…' },
    loadingReason: { zh: '加载中…（{reason}）', en: 'Loading… ({reason})' },
    loadFailed: { zh: '加载失败：{message}', en: 'Load failed: {message}' },
    missingConversationId: { zh: '未检测到会话 ID（请先打开具体对话）', en: 'Conversation ID was not detected. Open a specific conversation first.' },
    missingFullTreeData: { zh: '未拿到完整消息树数据（可尝试先打开消息树面板再导出）', en: 'The full message tree data was not available. Try opening the tree panel before exporting.' },
    fileDownloadFailed: { zh: '文件下载失败', en: 'File download failed.' },
    exportSucceeded: { zh: '已导出完整树：{fileName}', en: 'Exported the full tree: {fileName}' },
    unknownError: { zh: '未知错误', en: 'Unknown error' },
    exportFailed: { zh: '导出失败：{message}', en: 'Export failed: {message}' },
    exportFullTreeJson: { zh: '导出完整树为 JSON', en: 'Export full tree as JSON' },
    rootLabel: { zh: 'root', en: 'root' },
    emptyLabel: { zh: '(empty)', en: '(empty)' }
  });

  const BRIDGE_REQ_SUMMARY = 'AISHORTCUTS_CHATGPT_TREE_SUMMARY_REQUEST';
  const BRIDGE_RES_SUMMARY = 'AISHORTCUTS_CHATGPT_TREE_SUMMARY_RESPONSE';
  const BRIDGE_STATE = 'AISHORTCUTS_CHATGPT_TREE_STATE';
  const BRIDGE_TOGGLE_PANEL = 'AISHORTCUTS_CHATGPT_TREE_TOGGLE';
  const BRIDGE_OPEN_PANEL = 'AISHORTCUTS_CHATGPT_TREE_OPEN';
  const BRIDGE_CLOSE_PANEL = 'AISHORTCUTS_CHATGPT_TREE_CLOSE';
  const BRIDGE_REFRESH = 'AISHORTCUTS_CHATGPT_TREE_REFRESH';
  const BRIDGE_NAVIGATE_TO = 'AISHORTCUTS_CHATGPT_TREE_NAVIGATE_TO';
  const BRIDGE_RES_NAVIGATE_TO = 'AISHORTCUTS_CHATGPT_TREE_NAVIGATE_TO_RESPONSE';
  const BRIDGE_CHANNEL = 'quicknav';
  const BRIDGE_V = 1;
  const BRIDGE_NONCE_DATASET_KEY = 'quicknavBridgeNonceV1';
  const BRIDGE_COMMAND_TYPES = new Set([
    BRIDGE_REQ_SUMMARY,
    BRIDGE_NAVIGATE_TO,
    BRIDGE_TOGGLE_PANEL,
    BRIDGE_OPEN_PANEL,
    BRIDGE_CLOSE_PANEL,
    BRIDGE_REFRESH
  ]);

  const MAIN_MENU_REGISTER_EVENT = '__quicknav_menu_bridge_register_main_command_v1__';
  const MAIN_MENU_RUN_EVENT = '__quicknav_menu_bridge_run_main_command_v1__';
  const MAIN_MENU_GROUP = 'ChatGPT Message Tree';
  const MAIN_MENU_MODULE_ID = 'chatgpt_message_tree';
  const MAIN_MENU_BRIDGE_SOURCE = 'content/menu-bridge.js';
  const MAIN_MENU_SELF_SOURCE = 'content/chatgpt-message-tree/main.js';

  function getUiLocale() {
    try {
      return String(document.documentElement?.dataset?.aichatLocale || 'en').trim() || 'en';
    } catch {
      return 'en';
    }
  }

  function isChineseLocale(locale = getUiLocale()) {
    return /^zh/i.test(String(locale || ''));
  }

  function formatTemplate(template, vars) {
    let out = String(template || '');
    if (!vars || typeof vars !== 'object') return out;
    for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value ?? ''));
    return out;
  }

  function t(key, vars) {
    const entry = MESSAGES[key];
    if (!entry) return formatTemplate(String(key || ''), vars);
    return formatTemplate(isChineseLocale() ? entry.zh : entry.en, vars);
  }

  function getConversationGraphApi() {
    try {
      const api = globalThis[GRAPH_API_KEY];
      if (api && typeof api === 'object' && typeof api.createDisplayGraph === 'function') return api;
    } catch {}
    throw new Error('ChatGPT conversation graph API is unavailable');
  }

  function getOrCreateBridgeNonce() {
    const fallback = 'quicknav-bridge-fallback';
    try {
      const docEl = document.documentElement;
      if (!docEl) return fallback;
      const existing = String(docEl.dataset?.[BRIDGE_NONCE_DATASET_KEY] || '').trim();
      if (existing) return existing;
      const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      docEl.dataset[BRIDGE_NONCE_DATASET_KEY] = next;
      const stored = String(docEl.dataset?.[BRIDGE_NONCE_DATASET_KEY] || '').trim();
      return stored || next || fallback;
    } catch {
      return fallback;
    }
  }

  const BRIDGE_NONCE = getOrCreateBridgeNonce();

  function postBridgeMessage(type, payload = null) {
    try {
      const msg = Object.assign(
        {
          __quicknav: 1,
          channel: BRIDGE_CHANNEL,
          v: BRIDGE_V,
          nonce: BRIDGE_NONCE
        },
        payload && typeof payload === 'object' ? payload : {}
      );
      msg.type = String(type || '');
      if (!msg.type) return;
      window.postMessage(msg, '*');
    } catch {}
  }

  function readBridgeMessage(event, allowedTypes) {
    try {
      if (!event || event.source !== window) return null;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return null;
      if (msg.__quicknav !== 1) return null;
      if (msg.channel !== BRIDGE_CHANNEL) return null;
      if (msg.v !== BRIDGE_V) return null;
      if (msg.nonce !== BRIDGE_NONCE) return null;
      if (typeof msg.type !== 'string' || !msg.type) return null;
      if (allowedTypes && !allowedTypes.has(msg.type)) return null;
      return msg;
    } catch {
      return null;
    }
  }

  const DEFAULT_PREFS = Object.freeze({
    simpleMode: true,
    guides: true
  });

  const SIMPLE_HIDE_ROLES = new Set(['system', 'tool']);
  // Treat internal assistant payloads as non-renderable (and hidden in simple mode),
  // otherwise branch navigation may mistakenly target them.
  const SIMPLE_HIDE_ASSISTANT_TYPES = new Set([
    'thoughts',
    'execution_output',
    'reasoning_recap',
    'reasoning',
    'code',
    'model_editable_context'
  ]);
  const SNIPPET_MAX_LEN = 32;

  const GUIDE_COLORS = Object.freeze([
    'rgba(239,68,68,0.55)',
    'rgba(249,115,22,0.55)',
    'rgba(234,179,8,0.55)',
    'rgba(34,197,94,0.55)',
    'rgba(59,130,246,0.55)',
    'rgba(168,85,247,0.55)'
  ]);

  function getGuideColor(depth) {
    const d = Math.max(0, Number(depth) || 0);
    const idx = Math.max(0, d - 1) % GUIDE_COLORS.length;
    return GUIDE_COLORS[idx];
  }

  // Allow hot-reinject (MV3 reload / reinject) by cleaning up any previous instance.
  // Note: legacy versions used a non-configurable global key; we cannot remove the property,
  // but we can still stop timers/unsubscribe/remove DOM and override message handling.
  try {
    /** @type {any} */
    const prev = window[STATE_KEY] || window[LEGACY_KEY];
    if (prev && typeof prev === 'object') {
      try {
        prev.cleanup?.();
      } catch {}
      // Best-effort cleanup for legacy instances without cleanup().
      try { prev.open = false; } catch {}
      try {
        if (prev.refreshTimer) clearTimeout(prev.refreshTimer);
      } catch {}
      try {
        if (prev.hrefWatchTimer) clearInterval(prev.hrefWatchTimer);
      } catch {}
      try {
        if (prev.generatingWatchTimer) clearInterval(prev.generatingWatchTimer);
      } catch {}
      try {
        if (prev.summaryDropTimer) clearTimeout(prev.summaryDropTimer);
      } catch {}
      try {
        if (prev.highlightTimer) clearTimeout(prev.highlightTimer);
      } catch {}
      try {
        prev.refreshAbortCtrl?.abort?.();
      } catch {}
      try {
        if (typeof prev.hubUnsub === 'function') prev.hubUnsub();
      } catch {}
    }
  } catch {}
  try { document.getElementById(TOGGLE_ID)?.remove?.(); } catch {}
  try { document.getElementById(PANEL_ID)?.remove?.(); } catch {}
  try { document.getElementById(STYLE_ID)?.remove?.(); } catch {}
  try {
    document.querySelectorAll(`article.${MSG_HIGHLIGHT_CLASS}`).forEach((n) => {
      n.classList.remove(MSG_HIGHLIGHT_CLASS);
    });
  } catch {}

  const now = () => Date.now();
  const ROUTE_REFRESH_DELAY_MS = 500;
  const SUMMARY_REUSE_MAX_AGE_MS = 15 * 1000;
  const SUMMARY_FAST_REUSE_MAX_AGE_MS = 2500;
  const SUMMARY_CACHE_MAX_NODES = 1600;
  const SUMMARY_CACHE_DROP_DELAY_MS = SUMMARY_REUSE_MAX_AGE_MS + 1000;

  function isAbortError(err) {
    try {
      if (!err || typeof err !== 'object') return false;
      const name = typeof err.name === 'string' ? err.name : '';
      if (name === 'AbortError') return true;
      const msg = typeof err.message === 'string' ? err.message : '';
      return /aborted|aborterror/i.test(msg);
    } catch {
      return false;
    }
  }

  function createEmptyAuthCache() {
    return {
      fetchedAt: 0,
      token: '',
      accountId: '',
      deviceId: ''
    };
  }

  let authCache = createEmptyAuthCache();

  function clearAuthCache() {
    authCache = createEmptyAuthCache();
  }

  function sanitizeFilePart(input) {
    return String(input || '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function pad2(n) {
    const x = Math.max(0, Number(n) || 0);
    return x < 10 ? `0${x}` : String(x);
  }

  function formatDate(d) {
    const dt = d instanceof Date ? d : new Date();
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function downloadText(text, fileName, mime = 'application/json;charset=utf-8') {
    try {
      const blob = new Blob([String(text || '')], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = String(fileName || 'chatgpt-tree-export.json');
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return true;
    } catch {
      return false;
    }
  }

  function getRouteKeyFromHref(href) {
    try {
      const raw = typeof href === 'string' && href ? href : location.href;
      const url = new URL(raw, location.href);
      return `${url.origin}${url.pathname}`;
    } catch {
      try {
        return `${location.origin}${location.pathname}`;
      } catch {
        return String(location.pathname || '');
      }
    }
  }

  const state = {
    version: STATE_VERSION,
    disposed: false,
    open: false,
    lastHref: location.href,
    routeKey: getRouteKeyFromHref(location.href),
    conversationId: '',
    lastLoadedAt: 0,
    dirty: true,
    // Reserved for future styling tweaks; kept for hot-reinject compatibility.
    guideDepth: 0,
    refreshTimer: 0,
    refreshPromise: null,
    refreshQueuedAfterPromise: false,
    hrefWatchTimer: 0,
    panelEl: null,
    toggleEl: null,
    treeEl: null,
    statusEl: null,
    statsEl: null,
    lastData: null,
    lastSummary: null,
    lastSummaryKey: '',
    lastSummaryAt: 0,
    summaryDropTimer: 0,
    refreshAbortCtrl: null,
    highlightTimer: 0,
    prefs: null,
    hubUnsub: null,
    generatingWatchTimer: 0,
    lastGenerating: false,
    turnsUnsub: null,
    hrefUnsub: null,
    escCloseInstalled: false,
    bridgeInstalled: false,
    bridgeHandler: null,
    escHandler: null,
    mainMenuHandlers: Object.create(null),
    mainMenuHandlerKeys: new Set(),
    mainMenuRetryTimers: new Set(),
    mainMenuOwnerKey: `chatgpt-message-tree-${Math.random().toString(36).slice(2, 10)}`,
    mainMenuRunHandler: null,
    cleanup: null
  };

  try {
    Object.defineProperty(window, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[STATE_KEY] = state;
    } catch {}
  }

  function installEscClose() {
    try {
      if (state.escCloseInstalled) return;
      state.escCloseInstalled = true;
    } catch {
      return;
    }
    try {
      state.escHandler = (e) => {
        try {
          if (state.disposed) return;
          if (!state.open) return;
          if (!e) return;
          if (e.key !== 'Escape' && e.code !== 'Escape') return;
          setOpen(false);
        } catch {}
      };
      window.addEventListener('keydown', state.escHandler, { capture: true });
    } catch {}
  }

  function releaseMainMenuHandlers() {
    try {
      for (const key of Array.from(state.mainMenuHandlerKeys || [])) {
        try { state.mainMenuHandlerKeys.delete(key); } catch {}
        try { delete state.mainMenuHandlers[key]; } catch {}
      }
    } catch {}
  }

  function dispatchMainMenuRegister(name, handlerKey) {
    try {
      const detail = { name, handlerKey, group: MAIN_MENU_GROUP, moduleId: MAIN_MENU_MODULE_ID, source: MAIN_MENU_SELF_SOURCE };
      window.dispatchEvent(new CustomEvent(MAIN_MENU_REGISTER_EVENT, { detail }));
    } catch {}
  }

  function getExtensionCallerSource(skipSource) {
    try {
      const stack = new Error().stack;
      if (!stack) return '';
      const skip = String(skipSource || '').trim();
      const lines = String(stack).split('\n').map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        const match = line.match(/chrome-extension:\/\/[^/]+\/([^\s:)]+\.js)/i);
        if (!match) continue;
        const source = String(match[1] || '').trim();
        if (!source) continue;
        if (skip && source.includes(skip)) continue;
        return source;
      }
      return '';
    } catch {
      return '';
    }
  }

  function isTrustedMainMenuRunDispatch() {
    const callerSource = getExtensionCallerSource(MAIN_MENU_SELF_SOURCE);
    return !!callerSource && callerSource.includes(MAIN_MENU_BRIDGE_SOURCE);
  }

  function clearMainMenuRetryTimers() {
    try {
      for (const timerId of Array.from(state.mainMenuRetryTimers || [])) {
        try { state.mainMenuRetryTimers.delete(timerId); } catch {}
        try { clearTimeout(timerId); } catch {}
      }
    } catch {}
  }

  function scheduleMainMenuRegisterRetry(name, handlerKey, delayMs) {
    try {
      const timerId = setTimeout(() => {
        try { state.mainMenuRetryTimers.delete(timerId); } catch {}
        if (state.disposed) return;
        dispatchMainMenuRegister(name, handlerKey);
      }, Math.max(0, Number(delayMs) || 0));
      state.mainMenuRetryTimers.add(timerId);
      return timerId;
    } catch {
      return 0;
    }
  }

  function registerMainMenuCommand(name, fn) {
    const n = String(name || '').trim();
    if (!n || typeof fn !== 'function') return null;

    // Best-effort direct registration when worlds are bridged.
    try {
      const reg = window.__quicknavRegisterMenuCommand;
      if (typeof reg === 'function') {
        return reg(n, fn, { group: MAIN_MENU_GROUP, moduleId: MAIN_MENU_MODULE_ID });
      }
    } catch {}

    const owner = String(state.mainMenuOwnerKey || 'message-tree').replace(/[^a-zA-Z0-9:_-]/g, '');
    const handlerKey = `chatgpt_message_tree:${owner}:${n}`;
    state.mainMenuHandlers[handlerKey] = fn;
    state.mainMenuHandlerKeys.add(handlerKey);

    dispatchMainMenuRegister(n, handlerKey);
    scheduleMainMenuRegisterRetry(n, handlerKey, 500);
    scheduleMainMenuRegisterRetry(n, handlerKey, 1500);
    return handlerKey;
  }

  function installMainMenuRunBridge() {
    try {
      if (state.mainMenuRunHandler) return;
      state.mainMenuRunHandler = (e) => {
        try {
          if (!isTrustedMainMenuRunDispatch()) return;
          const d = e?.detail && typeof e.detail === 'object' ? e.detail : {};
          const handlerKey = String(d.handlerKey || '').trim();
          const fn = handlerKey ? state.mainMenuHandlers?.[handlerKey] : null;
          if (typeof fn === 'function') fn();
        } catch {}
      };
      window.addEventListener(MAIN_MENU_RUN_EVENT, state.mainMenuRunHandler, true);
    } catch {
      state.mainMenuRunHandler = null;
    }
  }

  function uninstallMainMenuRunBridge() {
    try {
      if (state.mainMenuRunHandler) {
        window.removeEventListener(MAIN_MENU_RUN_EVENT, state.mainMenuRunHandler, true);
      }
    } catch {}
    state.mainMenuRunHandler = null;
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return { ...DEFAULT_PREFS };
      const parsed = JSON.parse(raw);
      const out = { ...DEFAULT_PREFS };
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.simpleMode === 'boolean') out.simpleMode = parsed.simpleMode;
        if (typeof parsed.guides === 'boolean') out.guides = parsed.guides;
      }
      return out;
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs || DEFAULT_PREFS));
    } catch {}
  }

  function setPref(key, value) {
    state.prefs = state.prefs && typeof state.prefs === 'object' ? state.prefs : { ...DEFAULT_PREFS };
    state.prefs[key] = value;
    savePrefs();
    applyPrefsToUi();
    renderFromCache();
  }

  function getConversationIdFromUrl() {
    try {
      const parts = String(location.pathname || '')
        .split('/')
        .filter(Boolean);
      const idx = parts.indexOf('c');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      return '';
    } catch {
      return '';
    }
  }

  function getCookie(name) {
    try {
      const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}=([^;]*)`));
      return m ? decodeURIComponent(m[1]) : '';
    } catch {
      return '';
    }
  }

  function getMappingClient() {
    try {
      const client = globalThis[MAPPING_CLIENT_KEY];
      if (client && typeof client === 'object' && typeof client.fetchConversationMapping === 'function') {
        return client;
      }
    } catch {}
    return null;
  }

  async function getAuthContext(signal = null) {
    const mappingClient = getMappingClient();
    if (mappingClient && typeof mappingClient.getAuthContext === 'function') {
      try {
        const auth = await mappingClient.getAuthContext({ signal });
        if (auth && typeof auth === 'object') {
          const token = typeof auth.token === 'string' ? auth.token : '';
          const accountId = typeof auth.accountId === 'string' ? auth.accountId : '';
          const deviceId = typeof auth.deviceId === 'string' ? auth.deviceId : '';
          if (deviceId) {
            authCache = { fetchedAt: now(), token, accountId, deviceId };
            return authCache;
          }
        }
      } catch (e) {
        if (isAbortError(e)) throw e;
      }
    }

    const age = now() - (Number(authCache.fetchedAt) || 0);
    if (authCache.token && authCache.accountId && authCache.deviceId && age < 5 * 60 * 1000) return authCache;

    let token = '';
    let accountId = '';
    try {
      const authReq = { credentials: 'include' };
      if (signal) authReq.signal = signal;
      const resp = await fetch('/api/auth/session', authReq);
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        token = typeof data?.accessToken === 'string' ? data.accessToken : '';
        accountId = typeof data?.account?.id === 'string' ? data.account.id : '';
      }
    } catch (e) {
      if (isAbortError(e)) throw e;
    }

    const deviceId = getCookie('oai-did');

    authCache = {
      fetchedAt: now(),
      token,
      accountId,
      deviceId
    };
    return authCache;
  }

  async function fetchConversation(conversationId, opts = {}) {
    const signal = opts && typeof opts === 'object' ? opts.signal || null : null;
    const mappingClient = getMappingClient();
    if (mappingClient && typeof mappingClient.fetchConversationMapping === 'function') {
      return await mappingClient.fetchConversationMapping(conversationId, {
        signal,
        maxJsonBytes: MAX_MAPPING_JSON_BYTES
      });
    }

    const { token, accountId, deviceId } = await getAuthContext(signal);
    const headers = {
      accept: 'application/json',
      authorization: token ? `Bearer ${token}` : '',
      'chatgpt-account-id': accountId || '',
      'oai-device-id': deviceId || '',
      'oai-language': navigator.language || 'en-US'
    };

    const url = `/backend-api/conversation/${encodeURIComponent(conversationId)}`;
    const request = { credentials: 'include', headers };
    if (signal) request.signal = signal;
    const resp = await fetch(url, request);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${text ? `(${text.slice(0, 120)})` : ''}`.trim());
    }
    // Guard: extremely long conversations can return very large JSON payloads.
    // Parsing them can cause huge memory spikes (multiple GB) on some machines.
    // Keep a conservative byte limit and ask users to rely on QuickNav list when exceeded.
    const MAX_JSON_BYTES = MAX_MAPPING_JSON_BYTES; // 6MB (decompressed). Tuned for stability over completeness.

    try {
      const lenHeader = resp.headers?.get?.('content-length') || '';
      const len = Number(lenHeader);
      if (Number.isFinite(len) && len > MAX_JSON_BYTES) {
        throw new Error(t('treeTooLarge', { size: Math.round(MAX_JSON_BYTES / 1024 / 1024) }));
      }
    } catch {}

    try {
      const body = resp.body;
      if (!body || typeof body.getReader !== 'function') return await resp.json();

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let received = 0;
      const parts = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength || 0;
        if (received > MAX_JSON_BYTES) {
          try { await reader.cancel(); } catch {}
          throw new Error(t('treeTooLarge', { size: Math.round(MAX_JSON_BYTES / 1024 / 1024) }));
        }
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode());
      const text = parts.join('');
      return JSON.parse(text);
    } catch (e) {
      if (isAbortError(e)) throw e;
      // If streaming parse fails for any reason, fall back to native json() (best-effort).
      // But keep the byte limit guard above to avoid the worst-case.
      if (e instanceof Error && /(对话树数据过大|conversation tree data is too large)/i.test(e.message)) throw e;
      try {
        return await resp.json();
      } catch {
        throw e;
      }
    }
  }

  function ensureStyles(_maxGuideDepthHint) {
    // Indent guides must remain visible even on very long conversations.
    // A single giant gradient can be clipped by Chrome's internal texture limits,
    // so we paint guides with a small repeating tile.
    const GUIDE_REPEAT_W = GUIDE_COLORS.length;
    const guidePatternStops = [];
    for (let i = 0; i < GUIDE_REPEAT_W; i++) {
      const color = GUIDE_COLORS[i];
      const x = `calc(var(--aichat-indent) * ${i})`;
      const x1 = `calc(var(--aichat-indent) * ${i} + 1px)`;
      const xNext = `calc(var(--aichat-indent) * ${i + 1})`;
      guidePatternStops.push(`${color} ${x} ${x1}`, `transparent ${x1} ${xNext}`);
    }
    const guidePattern = `linear-gradient(to right, ${guidePatternStops.join(',')})`;
    state.guideDepth = 0;

    const styleText = `
        #${TOGGLE_ID}{
          position: fixed;
          right: 12px;
          bottom: 96px;
          z-index: 2147483647;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 14px;
          background: rgba(17,17,17,0.92);
          color: rgba(255,255,255,0.92);
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          cursor: pointer;
          user-select: none;
        }
        #${TOGGLE_ID}:hover{ background: rgba(17,17,17,0.98); }
        #${TOGGLE_ID}[data-hidden="1"]{ display:none !important; }

        #${PANEL_ID}{
          position: fixed;
          right: 12px;
          top: 80px;
          bottom: 96px;
          width: min(380px, calc(100vw - 24px));
          z-index: 2147483647;
          background: rgba(17, 17, 17, 0.94);
          --aichat-panel-bg: rgba(17, 17, 17, 0.94);
          /* Use a fully-opaque color for masking indent guides behind rows. */
          --aichat-panel-bg-solid: rgb(17, 17, 17);
          color: rgba(255,255,255,0.92);
          border-radius: 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          overflow: hidden;
          display: none;
        }
        #${PANEL_ID}[data-open="1"]{ display: flex; flex-direction: column; }
        #${PANEL_ID}[data-hidden="1"]{ display:none !important; }
        #${PANEL_ID} .hdr{
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.10);
        }
        #${PANEL_ID} .hdr .title{
          font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          font-weight: 600;
          letter-spacing: 0.2px;
        }
        #${PANEL_ID} .hdr .spacer{ flex: 1; }
        #${PANEL_ID} .hdr button{
          appearance: none;
          border: 0;
          border-radius: 10px;
          padding: 6px 10px;
          background: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.92);
          cursor: pointer;
          font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        }
        #${PANEL_ID} .hdr button:hover{ background: rgba(255,255,255,0.18); }
        #${PANEL_ID} .hdr button.toggle[data-on="1"]{
          background: rgba(56,189,248,0.18);
          outline: 1px solid rgba(56,189,248,0.25);
        }
        #${PANEL_ID} .body{
          flex: 1;
          overflow: auto;
          padding: 10px 10px 14px;
        }
        #${PANEL_ID} .status{
          font: 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          opacity: 0.85;
          margin-bottom: 8px;
        }
        #${PANEL_ID} .stats{
          font: 11px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          opacity: 0.75;
          margin-bottom: 10px;
        }
	        #${PANEL_ID} .tree{
	          font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	          letter-spacing: 0.1px;
	          --aichat-indent: 16px;
            --aichat-row-h: 30px;
            /* Expand to content width so indent guides remain visible when the panel scrolls horizontally. */
            width: max-content;
            min-width: 100%;
	        }
        /* VSCode-like indent guides (continuous rails, independent of branch shapes). */
        #${PANEL_ID} .tree.guides{
          /* The guides themselves are painted in ::before so we can clip top/bottom without
             affecting node content (and avoid huge background gradients on long trees). */
          --aichat-guide-y: calc(var(--aichat-row-h) / 2);
          --aichat-guide-tile-h: 1024px;
          position: relative;
          isolation: isolate;
        }
        #${PANEL_ID} .tree.guides::before{
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          top: var(--aichat-guide-y);
          bottom: var(--aichat-guide-y);
          background-image: ${guidePattern};
          /* Repeat across depth and height (prevents "only first screen has guides"). */
          background-size: calc(var(--aichat-indent) * ${GUIDE_REPEAT_W}) var(--aichat-guide-tile-h);
          /* Shift by one indent so the first rail starts at depth=1 (not at x=0). */
          background-position: var(--aichat-indent) 0px;
          background-repeat: repeat;
          pointer-events: none;
          z-index: 0;
        }
        #${PANEL_ID} .tree.guides .aichat-tree-node{ z-index: 1; }
        /* Mask rails behind each row (VSCode-like: guides only in the indent gutter). */
        #${PANEL_ID} .tree.guides details.aichat-tree-node > summary,
        #${PANEL_ID} .tree.guides div.aichat-tree-node{
          background-color: var(--aichat-panel-bg-solid, rgb(17, 17, 17));
        }
	        #${PANEL_ID} .tree *{ box-sizing: border-box; }
	        #${PANEL_ID} .aichat-tree-node{
	          position: relative;
	          margin-left: var(--aichat-indent);
	        }
	        #${PANEL_ID} .tree > .aichat-tree-node{ margin-left: 0; }
	        #${PANEL_ID} .children{
	          position: relative;
	        }
        #${PANEL_ID} summary{
          list-style: none;
          cursor: pointer;
          outline: none;
          display: block;
        }
        #${PANEL_ID} summary::-webkit-details-marker{ display: none; }
	        #${PANEL_ID} .node-row{
	          display: inline-flex;
	          align-items: center;
	          gap: 8px;
	          padding: 0 6px;
            height: var(--aichat-row-h);
	          border-radius: 10px;
	          cursor: pointer;
	          white-space: nowrap;
          /* Keep a consistent max width across depths (aligns to panel edge), but don't force full-width. */
          max-width: calc(100% + (var(--aichat-indent) * var(--aichat-depth, 0)));
          min-width: 0;
          position: relative;
          overflow: visible;
	        }
        /* No "|-" connectors: show only VSCode-like vertical rails. */
        #${PANEL_ID} .node-row .label{
          flex: 0 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #${PANEL_ID} .node-row .meta{
          flex: 0 0 auto;
          white-space: nowrap;
        }
        #${PANEL_ID} .node-row:hover{ background: rgba(255,255,255,0.07); }
        #${PANEL_ID} .caret{
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          border-radius: 6px;
          flex: 0 0 14px;
          color: rgba(255,255,255,0.70);
        }
        #${PANEL_ID} .caret::before{
          content: '▸';
          display: block;
          transform: rotate(0deg);
          transition: transform 120ms ease;
          line-height: 14px;
          font-size: 12px;
        }
        #${PANEL_ID} details[open] > summary .caret::before{ transform: rotate(90deg); }
        #${PANEL_ID} .caret.placeholder{ opacity: 0; pointer-events: none; }
	        #${PANEL_ID} .node-row.selected{
          background: rgba(56,189,248,0.18);
          outline: 1px solid rgba(56,189,248,0.22);
        }
        #${PANEL_ID} .badge{
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 16px;
          padding: 0 6px;
          border-radius: 999px;
          font: 10px/16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          background: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.92);
        }
        #${PANEL_ID} .badge.user{ background: rgba(34,197,94,0.20); }
        #${PANEL_ID} .badge.assistant{ background: rgba(59,130,246,0.20); }
        #${PANEL_ID} .badge.system{ background: rgba(245,158,11,0.20); }
        #${PANEL_ID} .badge.tool{ background: rgba(168,85,247,0.20); }
        #${PANEL_ID} .meta{
          opacity: 0.65;
          font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        #${PANEL_ID} .node-row.current{
          background: rgba(255,255,255,0.12);
          outline: 1px solid rgba(255,255,255,0.18);
        }
        #${PANEL_ID} .node-row.path{
          outline: 1px solid rgba(56,189,248,0.18);
        }
        #${PANEL_ID} .node-row.branch .meta{
          opacity: 0.9;
          color: rgba(251,191,36,0.95);
        }
        article.${MSG_HIGHLIGHT_CLASS}{
          outline: 3px solid rgba(56,189,248,0.92) !important;
          outline-offset: 4px;
          border-radius: 14px;
          animation: aichat-tree-pulse 1600ms ease-in-out;
        }
        @keyframes aichat-tree-pulse{
          0%{ box-shadow: 0 0 0 0 rgba(56,189,248,0.0), 0 0 0 0 rgba(56,189,248,0.0); }
          20%{ box-shadow: 0 0 0 10px rgba(56,189,248,0.20), 0 0 22px 6px rgba(56,189,248,0.18); }
          45%{ box-shadow: 0 0 0 2px rgba(56,189,248,0.08), 0 0 10px 3px rgba(56,189,248,0.08); }
          70%{ box-shadow: 0 0 0 12px rgba(56,189,248,0.22), 0 0 26px 8px rgba(56,189,248,0.20); }
          100%{ box-shadow: 0 0 0 0 rgba(56,189,248,0.0), 0 0 0 0 rgba(56,189,248,0.0); }
        }
        @media (prefers-reduced-motion: reduce){
          article.${MSG_HIGHLIGHT_CLASS}{ animation: none; }
        }
      `;

    // Hot-reinject friendly: if a previous version already inserted the style tag, update it in place.
    const existing = document.getElementById(STYLE_ID);
    if (existing) {
      const key = `${STYLE_VERSION}`;
      if (existing.dataset?.aichatTreeStyleKey === key) return;
      try {
        existing.textContent = styleText;
        existing.dataset.aichatTreeStyleKey = key;
        existing.dataset.aichatTreeStyleVer = String(STYLE_VERSION);
        existing.dataset.aichatTreeGuideDepth = String(state.guideDepth || 0);
      } catch {}
      return;
    }

    try {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      try {
        const key = `${STYLE_VERSION}`;
        style.dataset.aichatTreeStyleKey = key;
        style.dataset.aichatTreeStyleVer = String(STYLE_VERSION);
        style.dataset.aichatTreeGuideDepth = String(state.guideDepth || 0);
      } catch {}
      style.textContent = styleText;
      document.documentElement?.appendChild(style);
    } catch {}
  }

  function findTurnElementByMessageId(messageId) {
    const id = String(messageId || '').trim();
    if (!id) return null;
    try {
      const article = document.querySelector(`article[data-turn-id="${id}"]`);
      if (article) return article;
    } catch {}
    try {
      const msg = document.querySelector(`[data-message-id="${id}"]`);
      if (!msg) return null;
      return (
        msg.closest?.(
          'article[data-testid^="conversation-turn-"],[data-testid^="conversation-turn-"],article[data-testid*="conversation-turn"],[data-testid*="conversation-turn"]'
        ) ||
        msg.closest?.('article') ||
        msg
      );
    } catch {
      return null;
    }
  }

  function clearHighlightTimer() {
    try {
      if (state.highlightTimer) clearTimeout(state.highlightTimer);
    } catch {}
    state.highlightTimer = 0;
  }

  function highlightTurnElement(el) {
    const element = el && el.nodeType === 1 ? el : null;
    if (!element) return;
    clearHighlightTimer();
    try {
      document.querySelectorAll(`article.${MSG_HIGHLIGHT_CLASS}`).forEach((n) => {
        n.classList.remove(MSG_HIGHLIGHT_CLASS);
      });
    } catch {}
    const article = element.closest?.('article') || element;
    try {
      article.classList.add(MSG_HIGHLIGHT_CLASS);
      state.highlightTimer = setTimeout(() => {
        try {
          article.classList.remove(MSG_HIGHLIGHT_CLASS);
        } catch {}
        state.highlightTimer = 0;
      }, 2200);
    } catch {}
  }

  function allowTreeNavScroll(ms = 1400) {
    const dur = Math.max(0, Math.round(Number(ms) || 0));
    const clamped = Math.max(60, Math.min(8000, dur));
    if (!clamped) return;

    // Cross-world escape hatch: isolated-world QuickNav scroll-lock also checks this dataset flag.
    const until = now() + clamped;
    try {
      const docEl = document.documentElement;
      if (docEl) {
        const prev = Number(docEl.dataset?.quicknavAllowScrollUntil || 0);
        const next = Math.max(Number.isFinite(prev) ? prev : 0, until);
        docEl.dataset.quicknavAllowScrollUntil = String(next);
      }
    } catch {}

    // Compat: older QuickNav builds only treat wheel/touch/keydown as "user intent" signals.
    // Dispatching a synthetic wheel event prevents the scroll-lock restore timer from fighting our jump.
    try {
      document.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: false, deltaY: 0 }));
    } catch {}
    // Main-world scroll guard (when installed) uses window.postMessage.
    try {
      postBridgeMessage('AISHORTCUTS_SCROLLLOCK_ALLOW', { ms: clamped });
    } catch {}
  }

  function scrollToMessageId(messageId) {
    const el = findTurnElementByMessageId(messageId);
    if (!el) return false;
    const article = el.closest?.('article') || el;
    const anchor = findTurnAnchor(article) || article;
    const topMargin = getFixedHeaderHeight();
    try {
      // Keep the scroll-lock logic from fighting tree navigation.
      allowTreeNavScroll(3200);
    } catch {}

    const ok = scrollToTopOfElement(anchor, topMargin);
    highlightTurnElement(article);
    return ok;
  }

  function getTurnMessageIdFromElement(el) {
    const element = el && el.nodeType === 1 ? el : null;
    if (!element) return '';
    try {
      const article = element.closest?.('article') || element;
      const msg = article.querySelector?.('[data-message-id]')?.getAttribute?.('data-message-id');
      if (msg) return String(msg);
      const id = article.getAttribute?.('data-turn-id');
      if (id) return String(id);
    } catch {}
    return '';
  }

  function findVisibleTurnElementByMessageIds(messageIds) {
    const ids = Array.isArray(messageIds) ? messageIds : [];
    for (const raw of ids) {
      const id = String(raw || '').trim();
      if (!id) continue;
      const el = findTurnElementByMessageId(id);
      if (el) return el.closest?.('article') || el;
    }
    return null;
  }

  function buildDisplayGraph(mapping, rootId, currentId) {
    const api = getConversationGraphApi();
    return api.createDisplayGraph(mapping, {
      rootId,
      currentId,
      isNodeHidden,
      extractText: extractTextFromMessage,
      formatSnippet: (text) => formatSnippet(text, 96)
    });
  }

  function getResponseSwitcherButtons(turnEl) {
    const el = turnEl && turnEl.nodeType === 1 ? turnEl : null;
    if (!el) return null;
    const article = el.closest?.('article') || el;
    const prev =
      article.querySelector?.('button[aria-label="Previous response"]') ||
      article.querySelector?.('button[aria-label*="Previous"][aria-label*="response"]') ||
      null;
    const next =
      article.querySelector?.('button[aria-label="Next response"]') ||
      article.querySelector?.('button[aria-label*="Next"][aria-label*="response"]') ||
      null;
    if (!prev && !next) return null;
    return { prev, next };
  }

  function waitForCondition(check, timeoutMs = 900, intervalMs = 50) {
    const timeout = Math.max(60, Number(timeoutMs) || 0);
    const interval = Math.max(16, Number(intervalMs) || 0);
    const startedAt = now();
    return new Promise((resolve) => {
      const tick = () => {
        try {
          if (check()) return resolve(true);
        } catch {}
        if (now() - startedAt >= timeout) return resolve(false);
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function resolveNodeIdForMessageId(mapping, messageId) {
    const id = String(messageId || '').trim();
    if (!id || !mapping || typeof mapping !== 'object') return '';
    try {
      if (Object.prototype.hasOwnProperty.call(mapping, id)) return id;
    } catch {}
    try {
      for (const [nodeId, node] of Object.entries(mapping)) {
        const mid = typeof node?.message?.id === 'string' ? node.message.id : '';
        if (mid === id) return nodeId;
      }
    } catch {}
    return '';
  }

  async function trySelectSiblingMessage(targetMsgId, siblingMsgIds) {
    const target = String(targetMsgId || '').trim();
    if (!target) return false;
    const siblings = Array.isArray(siblingMsgIds) ? siblingMsgIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
    if (siblings.length <= 1) return false;
    if (!siblings.includes(target)) return false;

    const maxSteps = Math.min(24, Math.max(2, siblings.length * 2 + 2));
    let direction = 'next';
    try {
      const curTurn = findVisibleTurnElementByMessageIds(siblings);
      const curId = getTurnMessageIdFromElement(curTurn);
      const curIdx = siblings.indexOf(curId);
      const targetIdx = siblings.indexOf(target);
      if (curIdx >= 0 && targetIdx >= 0) direction = targetIdx > curIdx ? 'next' : 'prev';
    } catch {}

    for (let step = 0; step < maxSteps; step++) {
      const visibleTurn = findVisibleTurnElementByMessageIds(siblings);
      if (!visibleTurn) return false;

      const beforeId = getTurnMessageIdFromElement(visibleTurn);
      if (beforeId === target) return true;
      if (findTurnElementByMessageId(target)) return true;

      const buttons = getResponseSwitcherButtons(visibleTurn);
      if (!buttons) return false;

      const canPrev = !!buttons.prev && !buttons.prev.disabled;
      const canNext = !!buttons.next && !buttons.next.disabled;

      let btn = null;
      if (direction === 'next') {
        if (canNext) btn = buttons.next;
        else if (canPrev) {
          direction = 'prev';
          btn = buttons.prev;
        }
      } else {
        if (canPrev) btn = buttons.prev;
        else if (canNext) {
          direction = 'next';
          btn = buttons.next;
        }
      }
      if (!btn) return false;

      try {
        allowTreeNavScroll(1800);
        btn.click();
      } catch {
        return false;
      }

      const afterTurn = findVisibleTurnElementByMessageIds(siblings);
      const afterId = getTurnMessageIdFromElement(afterTurn);
      if (afterId === target) return true;

      const moved = await waitForCondition(() => {
        if (findTurnElementByMessageId(target)) return true;
        const t = findVisibleTurnElementByMessageIds(siblings);
        const id = getTurnMessageIdFromElement(t);
        return !!id && id !== beforeId;
      }, 1200, 60);
      if (!moved) return !!findTurnElementByMessageId(target);
    }

    return !!findTurnElementByMessageId(target);
  }

  function nodeIdToMsgId(nodeId, mapping) {
    const id = String(nodeId || '');
    if (!id || !mapping || typeof mapping !== 'object') return '';
    const node = mapping?.[id] || null;
    const msgId = typeof node?.message?.id === 'string' ? node.message.id : id === 'client-created-root' ? '' : id;
    return String(msgId || '');
  }

  const representativeMsgIdCache = new Map();
  const REP_MSG_CACHE_MAX = 8000;
  const REP_MSG_CACHE_TRIM_TO = 6000;

  function clearRepresentativeMsgCache() {
    try {
      representativeMsgIdCache.clear();
    } catch {}
  }

  function trimRepresentativeMsgCache() {
    try {
      const over = representativeMsgIdCache.size - REP_MSG_CACHE_MAX;
      if (over <= 0) return;
      const target = REP_MSG_CACHE_TRIM_TO;
      let drop = representativeMsgIdCache.size - target;
      if (drop <= 0) drop = over;
      for (const k of representativeMsgIdCache.keys()) {
        representativeMsgIdCache.delete(k);
        drop -= 1;
        if (drop <= 0) break;
      }
    } catch {}
  }
  function isRenderableMessage(msg) {
    try {
      if (!msg || typeof msg !== 'object') return false;
      const role = msg?.author?.role ? String(msg.author.role) : '';
      if (!role) return false;
      if (role === 'system' || role === 'tool') return false;
      const contentType = msg?.content?.content_type ? String(msg.content.content_type) : '';
      if (role === 'assistant' && contentType && SIMPLE_HIDE_ASSISTANT_TYPES.has(contentType)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function getRepresentativeRenderableMsgId(startNodeId, mapping) {
    const start = String(startNodeId || '');
    if (!start || !mapping || typeof mapping !== 'object') return '';
    if (representativeMsgIdCache.has(start)) return representativeMsgIdCache.get(start) || '';

    const visited = new Set();
    const queue = [start];
    let qi = 0;
    let found = '';
    let guard = 0;

    while (qi < queue.length && guard++ < 4096) {
      const nodeId = queue[qi++];
      if (!nodeId || visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = mapping?.[nodeId] || null;
      const msg = node?.message || null;
      if (isRenderableMessage(msg)) {
        const mid = typeof msg?.id === 'string' ? String(msg.id) : '';
        if (mid) {
          found = mid;
          break;
        }
      }

      const children = Array.isArray(node?.children) ? node.children : [];
      for (const cid of children) {
        if (typeof cid === 'string' && cid) queue.push(cid);
      }
    }

    representativeMsgIdCache.set(start, found);
    trimRepresentativeMsgCache();
    return found;
  }

  function getPathNodeIds(mapping, rootId, targetNodeId) {
    const target = String(targetNodeId || '');
    const root = String(rootId || '');
    if (!target || !mapping || typeof mapping !== 'object') return [];

    const path = [];
    let cur = target;
    let guard = 0;
    while (cur && guard++ < 4096) {
      path.push(cur);
      if (cur === root) break;
      const node = mapping?.[cur];
      cur = node && typeof node.parent === 'string' ? node.parent : '';
    }
    return path.reverse();
  }

  async function ensureNodePathVisible(mapping, rootId, targetNodeId) {
    try {
      const path = getPathNodeIds(mapping, rootId, targetNodeId);
      if (path.length <= 1) return true;

      for (let i = 0; i < path.length - 1; i++) {
        const parentId = path[i];
        const childId = path[i + 1];
        const parentNode = mapping?.[parentId];
        const children = Array.isArray(parentNode?.children) ? parentNode.children : [];
        if (children.length <= 1) continue;

        const siblingMsgIds = [];
        const childToRep = new Map();
        for (const cid of children) {
          if (typeof cid !== 'string' || !cid) continue;
          const rep = getRepresentativeRenderableMsgId(cid, mapping);
          if (!rep) continue;
          if (!childToRep.has(cid)) childToRep.set(cid, rep);
          if (!siblingMsgIds.includes(rep)) siblingMsgIds.push(rep);
        }
        const desiredMsgId = childToRep.get(childId) || getRepresentativeRenderableMsgId(childId, mapping) || nodeIdToMsgId(childId, mapping);
        if (!desiredMsgId || siblingMsgIds.length <= 1 || !siblingMsgIds.includes(desiredMsgId)) continue;

        if (findTurnElementByMessageId(desiredMsgId)) continue;

        const ok = await trySelectSiblingMessage(desiredMsgId, siblingMsgIds);
        if (!ok) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function setSelectedNodeId(nodeId) {
    const id = String(nodeId || '');
    if (!state.treeEl) return;
    try {
      state.treeEl.querySelectorAll('.node-row.selected').forEach((n) => {
        n.classList.remove('selected');
      });
    } catch {}
    if (!id) return;
    try {
      const nodeEl = state.treeEl.querySelector(`.aichat-tree-node[data-node-id="${id}"]`);
      const row = nodeEl?.querySelector?.('.node-row');
      if (row) row.classList.add('selected');
    } catch {}
  }

  function ensureUi() {
    ensureStyles();
    const docEl = document.documentElement;
    if (!docEl) return;

    let toggle = document.getElementById(TOGGLE_ID);
    if (!toggle) {
      toggle = document.createElement('div');
      toggle.id = TOGGLE_ID;
      toggle.setAttribute('role', 'button');
      toggle.setAttribute('tabindex', '0');
      toggle.title = t('toggleTitle');
      toggle.textContent = t('panelTitle');
      toggle.addEventListener('click', () => setOpen(!state.open));
      toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(!state.open);
        }
      });
      docEl.appendChild(toggle);
    }
    state.toggleEl = toggle;

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.setAttribute('data-open', '0');
      panel.innerHTML = `
        <div class="hdr">
          <div class="title">${t('panelTitle')}</div>
          <div class="spacer"></div>
          <button type="button" class="toggle simple" title="${t('simpleTitle')}">${t('simpleLabel')}</button>
          <button type="button" class="toggle guides" title="${t('guidesTitle')}">${t('guidesLabel')}</button>
          <button type="button" class="refresh">${t('refreshLabel')}</button>
          <button type="button" class="export" title="${t('exportFullTreeJson')}">${t('exportLabel')}</button>
          <button type="button" class="close">${t('closeLabel')}</button>
        </div>
        <div class="body">
          <div class="status"></div>
          <div class="stats"></div>
          <div class="tree"></div>
        </div>
      `;
      panel.querySelector('button.simple')?.addEventListener('click', () => setPref('simpleMode', !state.prefs?.simpleMode));
      panel.querySelector('button.guides')?.addEventListener('click', () => setPref('guides', !state.prefs?.guides));
      panel.querySelector('button.refresh')?.addEventListener('click', () => scheduleRefresh(50, 'manual'));
      panel.querySelector('button.export')?.addEventListener('click', () => {
        void exportFullTreeJsonFromMenu();
      });
      panel.querySelector('button.close')?.addEventListener('click', () => setOpen(false));
      docEl.appendChild(panel);
    }

    state.panelEl = panel;
    state.statusEl = panel.querySelector('.status');
    state.statsEl = panel.querySelector('.stats');
    state.treeEl = panel.querySelector('.tree');

    applyPrefsToUi();
    updateToggleVisibility();
  }

  function updateToggleVisibility() {
    try {
      const hasQuickNav = !!document.getElementById('cgpt-compact-nav');
      const hidden = hasQuickNav ? '1' : '0';
      state.toggleEl?.setAttribute('data-hidden', hidden);
    } catch {}
  }

  function applyPrefsToUi() {
    try {
      ensureStyles();
    } catch {}
    state.prefs = state.prefs && typeof state.prefs === 'object' ? state.prefs : loadPrefs();

    const simpleOn = state.prefs.simpleMode !== false;
    const guidesOn = state.prefs.guides !== false;

    try {
      const btn = state.panelEl?.querySelector?.('button.simple');
      if (btn) btn.setAttribute('data-on', simpleOn ? '1' : '0');
    } catch {}
    try {
      const btn = state.panelEl?.querySelector?.('button.guides');
      if (btn) btn.setAttribute('data-on', guidesOn ? '1' : '0');
    } catch {}
    try {
      state.treeEl?.classList?.toggle?.('guides', guidesOn);
    } catch {}
  }

  function notifyTreeOpenState() {
    try {
      postBridgeMessage(BRIDGE_STATE, {
        isOpen: !!state.open,
        conversationId: getConversationIdFromUrl() || ''
      });
    } catch {}
  }

  function setOpen(open) {
    const next = !!open;
    const changed = next !== !!state.open;
    if (!next && state.refreshTimer) {
      try {
        clearTimeout(state.refreshTimer);
      } catch {}
      state.refreshTimer = 0;
    }
    state.open = next;
    ensureUi();
    try {
      state.panelEl?.setAttribute('data-open', state.open ? '1' : '0');
    } catch {}
    if (state.open) {
      ensureGeneratingWatcher();
      startHrefWatcher();
      scheduleRefresh(60, 'open');
    } else {
      stopGeneratingWatcher();
      dropLastDataIfClosed('close');
    }
    if (changed) notifyTreeOpenState();
  }

  // Expose a tiny API for other modules (e.g. memory-pressure cleanup).
  // NOTE: This is not a public stable interface; keep it minimal and versioned.
  try {
    const API_VERSION = 1;
    state.api = Object.freeze({
      version: API_VERSION,
      isOpen: () => !!state.open,
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen(!state.open),
      dropCache: (reason) => dropLastDataIfClosed(reason || 'api'),
      dispose: () => {
        try {
          state.cleanup?.();
        } catch {}
      }
    });
  } catch {}

  function setUiHidden(hidden) {
    ensureUi();
    const v = hidden ? '1' : '0';
    try {
      state.toggleEl?.setAttribute('data-hidden', v);
    } catch {}
    try {
      state.panelEl?.setAttribute('data-hidden', v);
    } catch {}
    if (hidden) setOpen(false);
  }

  function setStatus(text) {
    ensureUi();
    if (state.statusEl) state.statusEl.textContent = text || '';
  }

  function setStats(text) {
    ensureUi();
    if (state.statsEl) state.statsEl.textContent = text || '';
  }

  function clearTree() {
    ensureUi();
    if (!state.treeEl) return;
    state.treeEl.textContent = '';
  }

  function getRootId(mapping) {
    if (mapping && typeof mapping === 'object') {
      if (mapping['client-created-root']) return 'client-created-root';
      for (const [k, v] of Object.entries(mapping)) {
        if (v && v.parent == null) return k;
      }
    }
    return '';
  }

  function isNodeHidden(nodeId, node) {
    const prefs = state.prefs && typeof state.prefs === 'object' ? state.prefs : DEFAULT_PREFS;
    if (!prefs.simpleMode) return false;
    if (!nodeId) return false;
    if (nodeId === 'client-created-root') return false;
    if (!node) return false;

    if (!node.message) {
      const isRoot = node.parent == null;
      if (isRoot) return false;
      const children = Array.isArray(node?.children) ? node.children : [];
      if (children.length <= 1) return true;
      return false;
    }

    const msg = node.message;
    const role = msg?.author?.role ? String(msg.author.role) : '';
    if (SIMPLE_HIDE_ROLES.has(role)) return true;

    const ct = msg?.content?.content_type ? String(msg.content.content_type) : '';
    if (role === 'assistant' && SIMPLE_HIDE_ASSISTANT_TYPES.has(ct)) return true;

    return false;
  }

  function getEffectiveCurrentId(mapping, currentId) {
    try {
      let cur = String(currentId || '');
      let guard = 0;
      while (cur && guard++ < 4096) {
        const node = mapping?.[cur];
        if (!isNodeHidden(cur, node)) return cur;
        cur = node && typeof node.parent === 'string' ? node.parent : '';
      }
    } catch {}
    return String(currentId || '');
  }

  function computeVisiblePathSet(mapping, currentId) {
    const set = new Set();
    try {
      let cur = String(currentId || '');
      let guard = 0;
      while (cur && guard++ < 4096) {
        const node = mapping?.[cur];
        if (!isNodeHidden(cur, node)) set.add(cur);
        cur = node && typeof node.parent === 'string' ? node.parent : '';
      }
    } catch {}
    return set;
  }

  function clearSummaryCache() {
    try {
      if (state.summaryDropTimer) clearTimeout(state.summaryDropTimer);
    } catch {}
    state.summaryDropTimer = 0;
    state.lastSummary = null;
    state.lastSummaryKey = '';
    state.lastSummaryAt = 0;
  }

  function scheduleSummaryCacheDrop() {
    try {
      if (state.summaryDropTimer) clearTimeout(state.summaryDropTimer);
      state.summaryDropTimer = 0;
      if (!state.lastSummary) return;
      state.summaryDropTimer = setTimeout(() => {
        clearSummaryCache();
      }, SUMMARY_CACHE_DROP_DELAY_MS);
    } catch {
      state.summaryDropTimer = 0;
    }
  }

  function abortRefreshInFlight() {
    try {
      state.refreshAbortCtrl?.abort?.();
    } catch {}
    state.refreshAbortCtrl = null;
  }

  function clearConversationScopedData(reason = '') {
    try {
      if (state.refreshTimer) clearTimeout(state.refreshTimer);
    } catch {}
    state.refreshTimer = 0;
    abortRefreshInFlight();
    clearHighlightTimer();
    clearSummaryCache();
    clearRepresentativeMsgCache();
    state.refreshQueuedAfterPromise = false;
    state.lastData = null;
    state.dirty = true;
    if (reason) state.lastLoadedAt = now();
  }

  function handleRouteChange(nextHref, source = 'route') {
    try {
      const href = typeof nextHref === 'string' && nextHref ? nextHref : location.href;
      const nextRouteKey = getRouteKeyFromHref(href);
      state.lastHref = href;
      if (!nextRouteKey || nextRouteKey === String(state.routeKey || '')) return false;
      state.routeKey = nextRouteKey;
      state.conversationId = '';
      clearConversationScopedData(`route:${source}`);
      scheduleRefresh(ROUTE_REFRESH_DELAY_MS, 'route');
      return true;
    } catch {
      return false;
    }
  }

  function getReusableSummary(conversationId) {
    try {
      const cid = String(conversationId || '');
      if (!cid) return null;
      if (state.dirty) return null;
      const summary = state.lastSummary;
      if (!summary || typeof summary !== 'object') return null;
      if (String(summary.conversationId || '') !== cid) return null;
      const age = now() - (Number(state.lastSummaryAt) || 0);
      if (!Number.isFinite(age) || age < 0 || age >= SUMMARY_REUSE_MAX_AGE_MS) return null;
      return { ...summary, isOpen: !!state.open };
    } catch {
      return null;
    }
  }

  function dropLastDataIfClosed(reason = '') {
    try {
      if (state.open) return;
      if (!state.lastData) return;
      state.lastData = null;
      clearRepresentativeMsgCache();
      // Keep `lastSummary` (small) for QuickNav tooltips; drop mapping to reduce memory.
      if (reason) state.lastLoadedAt = now();
    } catch {}
  }

  function getBridgeSummary() {
    try {
      const cached = state.lastData;
      if (!cached || !cached.mapping || typeof cached.mapping !== 'object') return null;

      const prefs = state.prefs && typeof state.prefs === 'object' ? state.prefs : DEFAULT_PREFS;
      const key = `${cached.conversationId || ''}|${cached.currentId || ''}|${prefs.simpleMode ? '1' : '0'}`;

      const age = now() - (Number(state.lastSummaryAt) || 0);
      if (state.lastSummary && state.lastSummaryKey === key && age < SUMMARY_FAST_REUSE_MAX_AGE_MS) {
        return { ...state.lastSummary, isOpen: !!state.open };
      }

      const graph = buildDisplayGraph(cached.mapping, cached.rootId, cached.currentId);
      const stats = graph.stats;
      const pathIds = graph.pathMsgIds;
      const nodes = {};
      for (const [msgId, entry] of Object.entries(graph.nodesByMessageId || {})) {
        nodes[msgId] = {
          role: String(entry?.role || ''),
          snippet: String(entry?.snippet || ''),
          children: Array.isArray(entry?.childrenMsgIds) ? entry.childrenMsgIds.slice() : [],
          childrenCount: Math.max(0, Number(entry?.childrenCount) || 0),
          nodeId: String(entry?.nodeId || ''),
          parentNodeId: String(entry?.parentNodeId || ''),
          parentMsgId: String(entry?.parentMsgId || ''),
          depth: Math.max(0, Number(entry?.depth) || 0),
          isCurrent: !!entry?.isCurrent,
          isOnPath: !!entry?.isOnPath
        };
      }

      const summary = {
        v: 2,
        builtAt: now(),
        conversationId: cached.conversationId || '',
        isOpen: !!state.open,
        rootId: graph.rootMsgId,
        currentId: graph.currentMsgId,
        rootNodeId: graph.rootNodeId,
        currentNodeId: graph.effectiveCurrentNodeId,
        stats,
        pathMsgIds: pathIds.slice(),
        pathIds,
        nodes
      };

      const nodeCount = Math.max(0, Number(summary?.stats?.nodeCount) || Object.keys(nodes).length || 0);
      if (nodeCount <= SUMMARY_CACHE_MAX_NODES) {
        state.lastSummary = summary;
        state.lastSummaryKey = key;
        state.lastSummaryAt = now();
        scheduleSummaryCacheDrop();
      } else {
        clearSummaryCache();
      }
      return summary;
    } catch {
      return null;
    }
  }

  function installQuickNavBridge() {
    if (state.bridgeInstalled) return;
    state.bridgeInstalled = true;

    // Use a capture listener so we can override legacy bridge handlers from earlier versions.
    state.bridgeHandler = (event) => {
      try {
        if (state.disposed) return;
        const data = readBridgeMessage(event, BRIDGE_COMMAND_TYPES);
        if (!data) return;

        const type = data.type;
        try {
          event.stopImmediatePropagation();
        } catch {}

        if (type === BRIDGE_REQ_SUMMARY) {
          const reqId = typeof data.reqId === 'string' ? data.reqId : '';
          const reply = (summary) => {
            try {
              postBridgeMessage(BRIDGE_RES_SUMMARY, {
                reqId,
                ok: !!summary,
                summary: summary || null
              });
            } catch {}
          };

          const currentConvId = getConversationIdFromUrl();
          if (!currentConvId) {
            reply(null);
            return;
          }

          const reusableSummary = getReusableSummary(currentConvId);
          if (reusableSummary) {
            reply(reusableSummary);
            dropLastDataIfClosed('bridge-summary');
            return;
          }

          const cached = state.lastData;
          const age = now() - (Number(state.lastLoadedAt) || 0);
          const canUseCache = !!(
            cached &&
            cached.conversationId === currentConvId &&
            !state.dirty &&
            age >= 0 &&
            age < 15000
          );
          if (canUseCache) {
            reply(getBridgeSummary());
            dropLastDataIfClosed('bridge-cache');
            return;
          }

          const run = async () => {
            try {
              if (state.refreshPromise) {
                await state.refreshPromise;
              } else {
                const nextRefresh = refreshConversation('bridge', { silent: true })
                  .catch(() => void 0)
                  .finally(() => {
                    if (state.refreshPromise === nextRefresh) state.refreshPromise = null;
                  });
                state.refreshPromise = nextRefresh;
                await nextRefresh;
              }
              reply(getBridgeSummary());
              dropLastDataIfClosed('bridge-fetch');
            } catch {
              reply(null);
            }
          };
          void run();
          return;
        }

        if (type === BRIDGE_NAVIGATE_TO) {
          const reqId = typeof data.reqId === 'string' ? data.reqId : '';
          const targetMsgId = typeof data.msgId === 'string' ? data.msgId : '';
          const reply = (ok) => {
            try {
              postBridgeMessage(BRIDGE_RES_NAVIGATE_TO, { reqId, ok: !!ok });
            } catch {}
          };

          const currentConvId = getConversationIdFromUrl();
          if (!reqId || !targetMsgId || !currentConvId) {
            reply(false);
            return;
          }

          const run = async () => {
            try {
              const cached = state.lastData;
              const age = now() - (Number(state.lastLoadedAt) || 0);
              const canUseCache = !!(
                cached &&
                cached.conversationId === currentConvId &&
                !state.dirty &&
                age >= 0 &&
                age < 15000
              );
              if (!canUseCache) {
                if (state.refreshPromise) {
                  await state.refreshPromise;
                } else {
                  const nextRefresh = refreshConversation('bridge-navigate', { silent: true })
                    .catch(() => void 0)
                    .finally(() => {
                      if (state.refreshPromise === nextRefresh) state.refreshPromise = null;
                    });
                  state.refreshPromise = nextRefresh;
                  await nextRefresh;
                }
              }

              const latest = state.lastData;
              if (!latest || latest.conversationId !== currentConvId) {
                reply(false);
                return;
              }

              const mapping = latest.mapping;
              const rootId = latest.rootId || getRootId(mapping) || latest.currentId || '';
              const nodeId = resolveNodeIdForMessageId(mapping, targetMsgId);
              if (!mapping || !nodeId) {
                setStatus(t('nodeNotFoundInTree'));
                reply(false);
                return;
              }

              allowTreeNavScroll(2400);
              if (scrollToMessageId(targetMsgId)) {
                reply(true);
                return;
              }

              const ok = await ensureNodePathVisible(mapping, rootId, nodeId);
              if (ok) {
                const appeared = await waitForCondition(() => !!findTurnElementByMessageId(targetMsgId), 2000, 60);
                if (appeared && scrollToMessageId(targetMsgId)) {
                  reply(true);
                  return;
                }
              }

              setStatus(t('turnNotFoundInPage'));
              reply(false);
            } catch {
              reply(false);
            } finally {
              dropLastDataIfClosed('bridge-navigate');
            }
          };

          void run();
          return;
        }

        if (type === BRIDGE_TOGGLE_PANEL) {
          ensureUi();
          setOpen(!state.open);
          return;
        }

        if (type === BRIDGE_OPEN_PANEL) {
          ensureUi();
          setOpen(true);
          return;
        }

        if (type === BRIDGE_CLOSE_PANEL) {
          ensureUi();
          setOpen(false);
          return;
        }

        if (type === BRIDGE_REFRESH) {
          ensureUi();
          scheduleRefresh(50, 'external');
          return;
        }
      } catch {}
    };
    try {
      window.addEventListener('message', state.bridgeHandler, true);
    } catch {}
  }

  function uninstallQuickNavBridge() {
    try {
      if (state.bridgeHandler) window.removeEventListener('message', state.bridgeHandler, true);
    } catch {}
    state.bridgeHandler = null;
    state.bridgeInstalled = false;
  }

  function unwrapVisibleNodes(nodeId, mapping, localSeen, guard) {
    const id = String(nodeId || '');
    if (!id) return [];
    if (localSeen.has(id)) return [];
    if ((guard || 0) > 4096) return [];
    localSeen.add(id);

    const node = mapping?.[id] || null;
    if (!node) return [];

    if (isNodeHidden(id, node)) {
      const children = Array.isArray(node?.children) ? node.children : [];
      /** @type {string[]} */
      let out = [];
      for (const c of children) out = out.concat(unwrapVisibleNodes(c, mapping, localSeen, (guard || 0) + 1));
      return out;
    }

    return [id];
  }

  function getDisplayChildren(nodeId, mapping) {
    const node = mapping?.[nodeId] || null;
    const children = Array.isArray(node?.children) ? node.children : [];
    const localSeen = new Set();
    /** @type {string[]} */
    let out = [];
    for (const childId of children) out = out.concat(unwrapVisibleNodes(childId, mapping, localSeen, 0));
    return [...new Set(out)];
  }

  function getRoleBadgeClass(role) {
    if (role === 'user') return 'user';
    if (role === 'assistant') return 'assistant';
    if (role === 'system') return 'system';
    if (role === 'tool') return 'tool';
    return '';
  }

  function extractTextFromMessage(message) {
    try {
      const content = message?.content;
      const ct = String(content?.content_type || '');
      const parts = content?.parts;

      if (Array.isArray(parts)) {
        const strings = parts.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim());
        const hasImagePart = parts.some(
          (p) => p && typeof p === 'object' && typeof p.content_type === 'string' && p.content_type.toLowerCase().includes('image')
        );
        const text = strings.join(' ').trim();
        if (hasImagePart && text) return `[img] ${text}`;
        if (hasImagePart) return '[img]';
        if (text) return text;
      }

      if (ct && !parts) return `<${ct}>`;
    } catch {}
    return '';
  }

  function formatSnippet(text, maxLen = SNIPPET_MAX_LEN) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen - 1)}…`;
  }

  function isScrollableY(el) {
    if (!el || el.nodeType !== 1) return false;
    let style;
    try {
      style = getComputedStyle(el);
    } catch {
      return false;
    }
    const oy = style?.overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
    return (el.scrollHeight || 0) > (el.clientHeight || 0) + 1;
  }

  function findClosestScrollContainer(start) {
    let el = start && start.nodeType === 1 ? start : null;
    while (el && el !== document.documentElement && el !== document.body) {
      if (isScrollableY(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function isWindowScroller(el) {
    try {
      const doc = document.documentElement;
      const se = document.scrollingElement || doc;
      return !el || el === window || el === document || el === document.body || el === doc || el === se;
    } catch {
      return true;
    }
  }

  function getScrollPos(el) {
    try {
      if (!el || isWindowScroller(el)) {
        const se = document.scrollingElement || document.documentElement;
        return se ? se.scrollTop : (window.scrollY || 0);
      }
      return el.scrollTop || 0;
    } catch {
      return window.scrollY || 0;
    }
  }

  function getFixedHeaderHeight() {
    try {
      const h = document.querySelector('header, [data-testid="top-nav"]');
      if (!h) return 0;
      const r = h.getBoundingClientRect();
      return Math.max(0, Number(r?.height) || 0) + 12;
    } catch {
      return 0;
    }
  }

  function getChatScrollContainer() {
    try {
      const turns = document.querySelector('[data-testid="conversation-turns"]');
      const msg = document.querySelector('[data-message-id]');
      const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.getElementById('main');
      const target = turns || msg || main || document.body;
      const closest = findClosestScrollContainer(target);
      return closest || (document.scrollingElement || document.documentElement);
    } catch {
      return document.scrollingElement || document.documentElement;
    }
  }

  function findTurnAnchor(root) {
    const el = root && root.nodeType === 1 ? root : null;
    if (!el) return null;

    const selectors = [
      '[data-message-author-role] .whitespace-pre-wrap',
      '[data-message-content-part]',
      '.deep-research-result .markdown',
      '.border-token-border-sharp .markdown',
      '[data-message-author-role] .markdown',
      '[data-message-author-role] .prose',
      '.text-message',
      'article .markdown',
      '.prose p',
      'p',
      'li',
      'pre',
      'blockquote'
    ];

    for (const s of selectors) {
      let n = null;
      try {
        n = el.querySelector(s);
      } catch {
        n = null;
      }
      if (!n) continue;
      try {
        const r = n.getBoundingClientRect();
        if (r && Number.isFinite(r.height) && r.height > 0) return n;
      } catch {}
      try {
        if ((n.offsetHeight || 0) > 0) return n;
      } catch {}
    }

    return el;
  }

  function scrollToTopOfElement(targetEl, topMarginPx = 12) {
    const el = targetEl && targetEl.nodeType === 1 ? targetEl : null;
    if (!el) return false;

    const margin = Math.max(0, Math.round(Number(topMarginPx) || 0));
    // Always scroll the conversation scroller (not an inner overflow container like code blocks),
    // otherwise jumps can feel "random" depending on which element inside the turn we target.
    const scroller = getChatScrollContainer() || (document.scrollingElement || document.documentElement);
    const isWin = isWindowScroller(scroller);

    const setTop = (top) => {
      const value = Math.max(0, Math.round(Number(top) || 0));
      if (isWin) {
        try {
          window.scroll({ top: value, behavior: 'auto' });
          return;
        } catch {}
        try {
          window.scrollTo({ top: value, behavior: 'auto' });
          return;
        } catch {}
        try {
          window.scrollTo(0, value);
        } catch {}
        return;
      }

      try {
        scroller.scroll({ top: value, behavior: 'auto' });
        return;
      } catch {}
      try {
        scroller.scrollTo({ top: value, behavior: 'auto' });
        return;
      } catch {}
      try {
        scroller.scrollTop = value;
      } catch {}
    };

    try {
      const r = el.getBoundingClientRect();
      if (isWin) {
        const base = window.scrollY || getScrollPos(scroller);
        setTop(base + r.top - margin);
      } else {
        const sr = scroller.getBoundingClientRect();
        const base = getScrollPos(scroller);
        setTop(base + (r.top - sr.top) - margin);
      }
    } catch {
      // fallback: just ensure visible
      try {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
      } catch {}
      return true;
    }

    // Stabilize: ChatGPT can reflow after images/code blocks render; re-align a few frames.
    try {
      let tries = 0;
      const MAX_TRIES = 8;
      const step = () => {
        tries++;
        const sc = getChatScrollContainer() || scroller;
        const win = isWindowScroller(sc);
        const targetTop = (() => {
          if (win) return margin;
          try {
            return (sc.getBoundingClientRect().top || 0) + margin;
          } catch {
            return margin;
          }
        })();
        let delta = 0;
        try {
          delta = (el.getBoundingClientRect().top || 0) - targetTop;
        } catch {
          delta = 0;
        }
        if (Math.abs(delta) <= 3 || tries >= MAX_TRIES) return;
        if (win) {
          try { window.scrollBy({ top: delta, behavior: 'auto' }); }
          catch { try { window.scrollBy(0, delta); } catch {} }
        } else {
          try { sc.scrollBy({ top: delta, behavior: 'auto' }); }
          catch {
            try { sc.scrollBy(0, delta); } catch {}
          }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } catch {}

    return true;
  }

  function renderNodeRow({ nodeId, node, isCurrent, isOnPath, isBranch, childrenCount }) {
    const row = document.createElement('span');
    row.className = 'node-row';
    if (isCurrent) row.classList.add('current');
    if (isOnPath) row.classList.add('path');
    if (isBranch) row.classList.add('branch');

    const caret = document.createElement('span');
    caret.className = `caret${childrenCount ? '' : ' placeholder'}`;
    row.appendChild(caret);

    const msg = node?.message;
    const role = msg?.author?.role ? String(msg.author.role) : nodeId === 'client-created-root' ? 'root' : '';
    const badge = document.createElement('span');
    badge.className = `badge ${getRoleBadgeClass(role)}`.trim();
    badge.textContent = role ? role[0].toUpperCase() : '·';
    row.appendChild(badge);

    const text = msg ? extractTextFromMessage(msg) : t('rootLabel');
    const snippet = formatSnippet(text);
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = snippet || t('emptyLabel');
    if (text && text !== snippet) label.title = text;
    row.appendChild(label);

    const meta = document.createElement('span');
    meta.className = 'meta';
    const n = Math.max(0, Number(childrenCount) || 0);
    meta.textContent = isBranch ? `branches:${n}` : n ? `children:${n}` : '';
    row.appendChild(meta);

    return row;
  }

  function renderTree(mapping, rootId, currentId) {
    ensureUi();
    if (!state.treeEl) return;
    state.treeEl.textContent = '';
    const graph = buildDisplayGraph(mapping, rootId, currentId);
    const effectiveCurrent = graph.effectiveCurrentNodeId;
    const pathSet = graph.pathNodeSet;
    const visited = new Set();

    function bindNodeNavigate({ nodeId, node, clickableEl, isDetailsNode }) {
      const msgId = typeof node?.message?.id === 'string' ? node.message.id : nodeId === 'client-created-root' ? '' : nodeId;
      clickableEl.addEventListener('click', (e) => {
        let target = e.target && e.target.nodeType === 1 ? e.target : null;
        if (!target && e.target && e.target.nodeType === 3) target = e.target.parentElement;
        if (!target) return;

        const isCaret = !!target.closest('.caret');
        if (isDetailsNode) {
          e.preventDefault();
          if (isCaret) {
            const host = clickableEl.closest('details');
            if (host) host.open = !host.open;
            return;
          }
        }

	        const run = async () => {
	          allowTreeNavScroll(2200);
	          setSelectedNodeId(nodeId);
	          if (!msgId) return;
	          if (scrollToMessageId(msgId)) return;

	          // When the node isn't currently rendered (e.g. alternative responses 1/2),
	          // try to switch the UI onto the target branch/path first.
	          const ok = await ensureNodePathVisible(mapping, rootId, nodeId);
	          if (ok) {
	            const appeared = await waitForCondition(() => !!findTurnElementByMessageId(msgId), 1800, 60);
	            if (appeared && scrollToMessageId(msgId)) return;
	          }
	          setStatus(t('turnNotFoundInPage'));
	        };
	        void run();
	      });
	    }

		    function walk(nodeId, depth) {
		      if (!nodeId || visited.has(nodeId)) return null;
		      visited.add(nodeId);
		      const node = mapping?.[nodeId] || null;
		      const graphNode = graph.nodesByNodeId?.[nodeId] || null;
		      const children = graphNode?.childrenNodeIds || graph.getDisplayChildren(nodeId) || [];
      const isBranch = children.length > 1;
      const isCurrent = nodeId === effectiveCurrent;
      const isOnPath = pathSet.has(nodeId);

		      const el = children.length ? document.createElement('details') : document.createElement('div');
		      el.className = 'aichat-tree-node';
			      el.dataset.nodeId = nodeId;
			      el.dataset.depth = String(depth);
          try {
            el.style.setProperty('--aichat-depth', String(Math.max(0, Math.floor(Number(depth) || 0))));
          } catch {}
          try {
            if (depth > 0) el.style.setProperty('--aichat-guide-color', getGuideColor(depth));
          } catch {}
			      if (children.length) {
		        el.open = true;
		        const summary = document.createElement('summary');
	        const row = renderNodeRow({ nodeId, node, isCurrent, isOnPath, isBranch, childrenCount: children.length });
	        summary.appendChild(row);
	        el.appendChild(summary);
	        bindNodeNavigate({ nodeId, node, clickableEl: summary, isDetailsNode: true });
			        const childrenWrap = document.createElement('div');
			        childrenWrap.className = 'children';
			        childrenWrap.dataset.depth = String(depth + 1);
			        for (const childId of children) {
			          const childEl = walk(childId, depth + 1);
			          if (childEl) childrenWrap.appendChild(childEl);
			        }
        el.appendChild(childrenWrap);
      } else {
        const row = renderNodeRow({ nodeId, node, isCurrent, isOnPath, isBranch: false, childrenCount: 0 });
        el.appendChild(row);
        bindNodeNavigate({ nodeId, node, clickableEl: row, isDetailsNode: false });
      }
      return el;
    }

    const rootEl = walk(rootId, 0);
    if (rootEl) state.treeEl.appendChild(rootEl);

    setSelectedNodeId(effectiveCurrent);
  }

  function renderFromCache() {
    const cached = state.lastData;
    if (!cached || !cached.mapping || typeof cached.mapping !== 'object') return;
    const mapping = cached.mapping;
    const rootId = cached.rootId;
    const currentId = cached.currentId;

    const stats = buildDisplayGraph(mapping, rootId, currentId).stats;
    try {
      // Ensure we have enough guide rails for this conversation depth before rendering.
      ensureStyles(stats.maxDepth);
    } catch {}
    applyPrefsToUi();
    setStatus(t('loadedConversation', { id: String(cached.conversationId || '').slice(0, 8) }));
    setStats(`nodes:${stats.nodeCount} messages:${stats.msgCount} branches:${stats.branchCount} leaves:${stats.leafCount}`);
    renderTree(mapping, rootId, currentId);
  }

  async function refreshConversation(reason = '', opts = {}) {
    const silent = !!opts.silent;
    const routeKeyAtStart = getRouteKeyFromHref(location.href);
    state.routeKey = routeKeyAtStart;
    const prevConversationId = String(state.conversationId || '');
    const conversationId = getConversationIdFromUrl();
    if (prevConversationId && conversationId && prevConversationId !== conversationId) {
      clearConversationScopedData('conversation-switch');
    }
    state.conversationId = conversationId;

    if (!conversationId) {
      clearConversationScopedData('no-conversation');
      setUiHidden(true);
      return;
    }

    const refreshCtrl = new AbortController();
    state.refreshAbortCtrl = refreshCtrl;

    setUiHidden(false);
    if (!silent) {
      setStatus(reason ? t('loadingReason', { reason }) : t('loading'));
      setStats('');
      clearTree();
    }

    try {
      const data = await fetchConversation(conversationId, { signal: refreshCtrl.signal });
      if (refreshCtrl.signal.aborted) return;
      if (state.disposed) return;
      if (state.refreshAbortCtrl !== refreshCtrl) return;
      const latestRouteKey = getRouteKeyFromHref(location.href);
      const latestConversationId = getConversationIdFromUrl();
      if (latestRouteKey !== routeKeyAtStart || latestConversationId !== conversationId) return;

      const mapping = data?.mapping && typeof data.mapping === 'object' ? data.mapping : {};
      const currentId = typeof data?.current_node === 'string' ? data.current_node : '';
      const rootId = getRootId(mapping) || currentId;

      state.lastLoadedAt = now();
      state.dirty = false;
      state.lastData = { conversationId, mapping, currentId, rootId };
      if (state.open) renderFromCache();
    } catch (e) {
      if (isAbortError(e)) return;
      state.dirty = true;
      state.lastData = null;
      clearSummaryCache();
      if (!silent) {
        setStatus(t('loadFailed', { message: e instanceof Error ? e.message : String(e) }));
        setStats('');
        clearTree();
      }
    } finally {
      if (state.refreshAbortCtrl === refreshCtrl) state.refreshAbortCtrl = null;
    }
  }

  async function ensureConversationDataForExport() {
    const conversationId = getConversationIdFromUrl();
    if (!conversationId) throw new Error(t('missingConversationId'));

    const cached = state.lastData;
    const age = now() - (Number(state.lastLoadedAt) || 0);
    const canUseCache = !!(
      cached &&
      cached.conversationId === conversationId &&
      !state.dirty &&
      age >= 0 &&
      age < 15000 &&
      cached.mapping &&
      typeof cached.mapping === 'object'
    );
    if (canUseCache) return cached;

    if (state.refreshPromise) {
      await state.refreshPromise;
    } else {
      const nextRefresh = refreshConversation('menu-export', { silent: true })
        .catch(() => void 0)
        .finally(() => {
          if (state.refreshPromise === nextRefresh) state.refreshPromise = null;
        });
      state.refreshPromise = nextRefresh;
      await nextRefresh;
    }

    const latest = state.lastData;
    if (!latest || latest.conversationId !== conversationId || !latest.mapping || typeof latest.mapping !== 'object') {
      throw new Error(t('missingFullTreeData'));
    }
    return latest;
  }

  function buildFullTreeExportJson(cached) {
    const mapping = cached?.mapping && typeof cached.mapping === 'object' ? cached.mapping : {};
    const currentNodeId = String(cached?.currentId || '');
    const rootNodeId = String(cached?.rootId || getRootId(mapping) || currentNodeId || '');
    const stats = buildDisplayGraph(mapping, rootNodeId, currentNodeId).stats;
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportType: 'full-tree',
      source: 'chatgpt-message-tree',
      conversationId: String(cached?.conversationId || ''),
      rootNodeId,
      currentNodeId,
      stats,
      mapping
    };
  }

  async function exportFullTreeJsonFromMenu() {
    try {
      const cached = await ensureConversationDataForExport();
      const payload = buildFullTreeExportJson(cached);
      const date = formatDate(new Date());
      const cid = sanitizeFilePart(payload.conversationId || '');
      const fileName = cid ? `chatgpt-tree-${cid}-${date}.json` : `chatgpt-tree-${date}.json`;
      const ok = downloadText(JSON.stringify(payload, null, 2), fileName, 'application/json;charset=utf-8');
      if (!ok) throw new Error(t('fileDownloadFailed'));
      setStatus(t('exportSucceeded', { fileName }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e || t('unknownError'));
      setStatus(t('exportFailed', { message: msg }));
    } finally {
      dropLastDataIfClosed('menu-export');
    }
  }

  function installMainMenuCommands() {
    installMainMenuRunBridge();
    registerMainMenuCommand(t('exportFullTreeJson'), () => {
      void exportFullTreeJsonFromMenu();
    });
  }

  function scheduleRefresh(delayMs = 400, reason = 'auto') {
    try {
      if (!state.open) {
        state.dirty = true;
        if (state.refreshTimer) {
          clearTimeout(state.refreshTimer);
          state.refreshTimer = 0;
        }
        return;
      }
      if (state.refreshTimer) clearTimeout(state.refreshTimer);
      state.refreshTimer = setTimeout(() => {
        state.refreshTimer = 0;
        if (state.refreshPromise) {
          if (!state.refreshQueuedAfterPromise) {
            state.refreshQueuedAfterPromise = true;
            state.refreshPromise.finally(() => {
              state.refreshQueuedAfterPromise = false;
              if (state.disposed || !state.open || !state.dirty) return;
              scheduleRefresh(80, `${reason}:queued`);
            });
          }
          return;
        }
        const nextRefresh = refreshConversation(reason)
          .catch(() => void 0)
          .finally(() => {
            if (state.refreshPromise === nextRefresh) state.refreshPromise = null;
          });
        state.refreshQueuedAfterPromise = false;
        state.refreshPromise = nextRefresh;
      }, Math.max(0, Number(delayMs) || 0));
    } catch {}
  }

  function isGeneratingNow() {
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (core && typeof core.isGenerating === 'function') return !!core.isGenerating();
    } catch {}
    try {
      return !!document.querySelector('button[data-testid="stop-button"]');
    } catch {
      return false;
    }
  }

  function ensureGeneratingWatcher() {
    try {
      if (state.generatingWatchTimer) return;
      state.lastGenerating = isGeneratingNow();
      // If the user opens the tree while a response is already streaming, make sure we refresh once it finishes.
      if (state.lastGenerating) state.dirty = true;
      state.generatingWatchTimer = setInterval(() => {
        try {
          if (!state.open) return;
          if (document.hidden) return;
          const generating = isGeneratingNow();
          const prev = !!state.lastGenerating;
          state.lastGenerating = generating;
          if (generating && !prev) state.dirty = true;
          if (prev && !generating) scheduleRefresh(700, 'done');
        } catch {}
      }, 400);
    } catch {
      state.generatingWatchTimer = 0;
    }
  }

  function stopGeneratingWatcher() {
    try {
      if (state.generatingWatchTimer) clearInterval(state.generatingWatchTimer);
    } catch {}
    state.generatingWatchTimer = 0;
    state.lastGenerating = false;
  }

  function installTurnsWatcher() {
    try {
      if (state.turnsUnsub) return true;
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (!core || typeof core.onTurnsChange !== 'function') return false;
      state.turnsUnsub = core.onTurnsChange(() => {
        try {
          state.dirty = true;
          // Avoid fetching large conversation JSON while streaming; wait for `onConversationDone`.
          const generating = typeof core.isGenerating === 'function' ? core.isGenerating() : !!document.querySelector('[data-testid="stop-button"]');
          if (generating) return;
          scheduleRefresh(700, 'turns');
        } catch {}
      });
      return true;
    } catch {
      state.turnsUnsub = null;
      return false;
    }
  }

  function uninstallTurnsWatcher() {
    try {
      if (typeof state.turnsUnsub === 'function') state.turnsUnsub();
    } catch {}
    state.turnsUnsub = null;
  }

  function startHrefWatcher() {
    try {
      if (state.hrefWatchTimer || state.hrefUnsub) return;
      state.lastHref = location.href;
      state.routeKey = getRouteKeyFromHref(state.lastHref);

      // Prefer shared ChatGPT core (which itself prefers the shared bridge).
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (core && typeof core.onRouteChange === 'function') {
        try {
          updateToggleVisibility();
        } catch {}
        state.hrefUnsub = core.onRouteChange((ev) => {
          try {
            updateToggleVisibility();
          } catch {}
          const href = typeof ev?.href === 'string' ? ev.href : location.href;
          if (!href) return;
          handleRouteChange(href, 'core');
        });
        return;
      }

      // Prefer shared MAIN-world bridge (reduces duplicated polling across modules).
      const bridge = window.__aichat_quicknav_bridge_main_v1__;
      if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
        try {
          bridge.ensureRouteListener();
        } catch {}
        try {
          updateToggleVisibility();
        } catch {}
        state.hrefUnsub = bridge.on('routeChange', (ev) => {
          try {
            updateToggleVisibility();
          } catch {}
          const href = typeof ev?.href === 'string' ? ev.href : location.href;
          if (!href) return;
          handleRouteChange(href, 'bridge');
        });
        return;
      }

      state.hrefWatchTimer = setInterval(() => {
        updateToggleVisibility();
        handleRouteChange(location.href, 'poll');
      }, 800);
    } catch {}
  }

  function stopHrefWatcher() {
    try {
      if (state.hrefUnsub) {
        try {
          state.hrefUnsub();
        } catch {}
        state.hrefUnsub = null;
      }
      if (!state.hrefWatchTimer) return;
      clearInterval(state.hrefWatchTimer);
      state.hrefWatchTimer = 0;
    } catch {
      state.hrefWatchTimer = 0;
    }
  }

  function cleanup() {
    if (state.disposed) return;
    state.disposed = true;
    state.open = false;
    clearConversationScopedData('cleanup');
    state.conversationId = '';
    state.routeKey = '';
    state.refreshPromise = null;

    stopHrefWatcher();
    stopGeneratingWatcher();
    uninstallTurnsWatcher();
    uninstallQuickNavBridge();
    uninstallMainMenuRunBridge();
    clearMainMenuRetryTimers();
    releaseMainMenuHandlers();

    try {
      if (state.escHandler) window.removeEventListener('keydown', state.escHandler, { capture: true });
    } catch {}
    state.escHandler = null;
    state.escCloseInstalled = false;

    try { document.getElementById(TOGGLE_ID)?.remove?.(); } catch {}
    try { document.getElementById(PANEL_ID)?.remove?.(); } catch {}
    try { document.getElementById(STYLE_ID)?.remove?.(); } catch {}
    try {
      document.querySelectorAll(`article.${MSG_HIGHLIGHT_CLASS}`).forEach((n) => {
        n.classList.remove(MSG_HIGHLIGHT_CLASS);
      });
    } catch {}

    state.panelEl = null;
    state.toggleEl = null;
    state.treeEl = null;
    state.statusEl = null;
    state.statsEl = null;

    clearAuthCache();
  }

  state.cleanup = cleanup;

  state.ensureUi = ensureUi;
  state.scheduleRefresh = scheduleRefresh;

  state.prefs = loadPrefs();
  ensureUi();
  installEscClose();
  installQuickNavBridge();
  installMainMenuCommands();
  installTurnsWatcher();
  startHrefWatcher();
})();
