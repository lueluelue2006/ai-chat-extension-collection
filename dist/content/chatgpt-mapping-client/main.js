(() => {
  'use strict';

  const API_KEY = '__aichat_chatgpt_mapping_client_v1__';
  const API_VERSION = 1;
  const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
  const DEFAULT_MAX_JSON_BYTES = 6 * 1024 * 1024;

  try {
    const prev = globalThis[API_KEY];
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= API_VERSION) return;
  } catch {}

  const isAllowedFrame = (() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    return !inIframe;
  })();

  if (!isAllowedFrame) return;

  function now() {
    return Date.now();
  }

  function toFinitePositiveInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.max(1, Math.floor(n));
  }

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

  function getCoreApi() {
    try {
      return (
        globalThis.__aichat_chatgpt_core_main_v1__ ||
        globalThis.__aichat_chatgpt_core_v1__ ||
        null
      );
    } catch {
      return null;
    }
  }

  function getConversationIdFromUrl(url) {
    const core = getCoreApi();
    if (core && typeof core.getConversationIdFromUrl === 'function') {
      try {
        const id = core.getConversationIdFromUrl(url || location.href);
        if (id) return id;
      } catch {}
    }
    try {
      const u = new URL(String(url || ''), location.href);
      const parts = String(u.pathname || '')
        .split('/')
        .filter(Boolean);
      const idx = parts.indexOf('c');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      const sidx = parts.indexOf('share');
      if (sidx >= 0 && parts[sidx + 1]) return parts[sidx + 1];
      return '';
    } catch {
      try {
        const parts = String(location.pathname || '')
          .split('/')
          .filter(Boolean);
        const idx = parts.indexOf('c');
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
        const sidx = parts.indexOf('share');
        if (sidx >= 0 && parts[sidx + 1]) return parts[sidx + 1];
      } catch {}
      return '';
    }
  }

  function getCookie(name) {
    try {
      const n = String(name || '');
      if (!n) return '';
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
      return m ? decodeURIComponent(m[1] || '') : '';
    } catch {
      return '';
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

  async function getAuthContext(opts = {}) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const signal = options.signal || null;
    const forceRefresh = options.forceRefresh === true;

    const age = now() - (Number(authCache.fetchedAt) || 0);
    if (!forceRefresh && authCache.deviceId && age < AUTH_CACHE_TTL_MS) {
      return { ...authCache };
    }

    let token = '';
    let accountId = '';
    try {
      const request = { credentials: 'include' };
      if (signal) request.signal = signal;
      const resp = await fetch('/api/auth/session', request);
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        token = typeof data?.accessToken === 'string' ? data.accessToken : '';
        accountId = typeof data?.account?.id === 'string' ? data.account.id : '';
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
    }

    const deviceId = getCookie('oai-did');
    authCache = {
      fetchedAt: now(),
      token,
      accountId,
      deviceId
    };
    return { ...authCache };
  }

  function buildHeaders(auth) {
    return {
      accept: 'application/json',
      authorization: auth?.token ? `Bearer ${auth.token}` : '',
      'chatgpt-account-id': auth?.accountId || '',
      'oai-device-id': auth?.deviceId || '',
      'oai-language': navigator.language || 'en-US'
    };
  }

  async function readJsonWithLimit(resp, maxJsonBytes, maxMessagePrefix) {
    const capBytes = toFinitePositiveInt(maxJsonBytes, DEFAULT_MAX_JSON_BYTES);
    const msgPrefix = String(maxMessagePrefix || '对话树数据过大');
    const capMb = Math.max(1, Math.round(capBytes / 1024 / 1024));

    try {
      const lenHeader = resp.headers?.get?.('content-length') || '';
      const len = Number(lenHeader);
      if (Number.isFinite(len) && len > capBytes) {
        throw new Error(`${msgPrefix}（>${capMb}MB），已停止加载`);
      }
    } catch (error) {
      if (error instanceof Error && error.message) throw error;
    }

    const body = resp?.body;
    if (!body || typeof body.getReader !== 'function') return await resp.json();

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength || 0;
      if (received > capBytes) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error(`${msgPrefix}（>${capMb}MB），已停止加载`);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(''));
  }

  async function fetchConversationMapping(conversationId, opts = {}) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const signal = options.signal || null;
    const maxJsonBytes = toFinitePositiveInt(options.maxJsonBytes, DEFAULT_MAX_JSON_BYTES);
    const id = String(conversationId || '').trim() || getConversationIdFromUrl(location.href);
    if (!id) throw new Error('未找到 conversation_id');

    const auth = await getAuthContext({ signal });
    const headers = buildHeaders(auth);
    const request = { credentials: 'include', headers };
    if (signal) request.signal = signal;

    const url = `/backend-api/conversation/${encodeURIComponent(id)}`;
    const resp = await fetch(url, request);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${text ? `(${text.slice(0, 120)})` : ''}`.trim());
    }

    return await readJsonWithLimit(resp, maxJsonBytes, '对话树数据过大');
  }

  const api = Object.freeze({
    version: API_VERSION,
    getConversationIdFromUrl,
    getAuthContext,
    clearAuthCache,
    fetchConversationMapping
  });

  try {
    Object.defineProperty(globalThis, API_KEY, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }
})();
