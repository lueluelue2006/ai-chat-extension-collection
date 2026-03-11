(function () {
  'use strict';

  const STATE_KEY = '__aichat_grok_trash_cleanup_state_v3__';
  const GUARD_KEY = '__aichat_grok_trash_cleanup_v2__';
  const SCOPE_API_KEY = '__aichat_quicknav_scope_v1__';
  const SCOPE_KEY = 'grok_trash_cleanup';
  const BRIDGE_CHANNEL = 'quicknav';
  const BRIDGE_V = 1;
  const BRIDGE_NONCE_DATASET_KEY = 'quicknavBridgeNonceV1';
  const ROUTE_SIGNAL_TYPES = new Set(['QUICKNAV_ROUTE_CHANGE']);

  const ROOT_ID = 'aichat-grok-trash-cleanup-root';
  const HEADER_ROW_ID = 'aichat-grok-trash-cleanup-header-row';
  const BTN_ID = 'aichat-grok-trash-cleanup-btn';
  const STATUS_ID = 'aichat-grok-trash-cleanup-status';
  const LEGACY_BTN_ID = 'quicknav-grok-trash-cleanup-btn';
  const LEGACY_ROOT_ID = 'quicknav-grok-trash-cleanup-root';
  const LEGACY_STATUS_ID = 'quicknav-grok-trash-cleanup-status';
  const PAGE_SIZE = 100;
  const MAX_ROUNDS = 20;
  const ROUTE_CHECK_MS = 2200;
  const ROUTE_POLL_MIN_MS = 1500;

  const prevState = (() => {
    try {
      return window[STATE_KEY] || window[GUARD_KEY] || null;
    } catch {
      return null;
    }
  })();

  try {
    prevState?.dispose?.('reinject');
  } catch {}

  function clampRoutePollMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return ROUTE_POLL_MIN_MS;
    return Math.max(ROUTE_POLL_MIN_MS, Math.round(n));
  }

  function createFallbackScope() {
    const listenerOffs = new Set();
    const intervalOffs = new Set();
    const timeoutOffs = new Set();
    const noop = () => void 0;

    return {
      on(target, type, fn, opts) {
        if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return noop;
        const eventType = String(type || '');
        if (!eventType || (typeof fn !== 'function' && !(fn && typeof fn.handleEvent === 'function'))) return noop;

        try {
          target.addEventListener(eventType, fn, opts);
        } catch {
          return noop;
        }

        let active = true;
        const off = () => {
          if (!active) return;
          active = false;
          listenerOffs.delete(off);
          try {
            target.removeEventListener(eventType, fn, opts);
          } catch {}
        };

        listenerOffs.add(off);
        return off;
      },
      interval(fn, ms, ...args) {
        if (typeof fn !== 'function') return 0;
        const pollMs = clampRoutePollMs(ms);
        let id = 0;

        try {
          id = window.setInterval(fn, pollMs, ...args);
        } catch {
          return 0;
        }

        let active = true;
        const off = () => {
          if (!active) return;
          active = false;
          intervalOffs.delete(off);
          try {
            window.clearInterval(id);
          } catch {}
        };

        intervalOffs.add(off);
        return id;
      },
      timeout(fn, ms, ...args) {
        if (typeof fn !== 'function') return 0;
        const wait = Math.max(0, Number(ms) || 0);
        let id = 0;
        let active = true;

        const off = () => {
          if (!active) return;
          active = false;
          timeoutOffs.delete(off);
          try {
            window.clearTimeout(id);
          } catch {}
        };

        try {
          id = window.setTimeout(() => {
            try {
              fn(...args);
            } finally {
              off();
            }
          }, wait);
        } catch {
          return 0;
        }

        timeoutOffs.add(off);
        return id;
      },
      dispose() {
        for (const off of Array.from(listenerOffs)) off();
        for (const off of Array.from(intervalOffs)) off();
        for (const off of Array.from(timeoutOffs)) off();
      }
    };
  }

  function createModuleScope() {
    try {
      const scopeApi = globalThis[SCOPE_API_KEY];
      if (scopeApi && typeof scopeApi.createSingletonScope === 'function') {
        const scope = scopeApi.createSingletonScope(SCOPE_KEY);
        if (
          scope &&
          typeof scope.on === 'function' &&
          typeof scope.interval === 'function' &&
          typeof scope.timeout === 'function' &&
          typeof scope.dispose === 'function'
        ) {
          return scope;
        }
      }
    } catch {}
    return createFallbackScope();
  }

  function routeKeyFromHref(href) {
    const raw = String(href || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      return `${url.origin}${url.pathname}`;
    } catch {
      return raw;
    }
  }

  function currentRouteKey() {
    try {
      const origin = String(location.origin || '');
      const pathname = String(location.pathname || '');
      if (origin || pathname) return `${origin}${pathname}`;
    } catch {}
    try {
      return routeKeyFromHref(location.href);
    } catch {
      return '';
    }
  }

  function readRouteBridgeMessage(event) {
    try {
      if (!event || event.source !== window) return null;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return null;
      if (msg.__quicknav !== 1) return null;
      if (msg.channel !== BRIDGE_CHANNEL) return null;
      if (msg.v !== BRIDGE_V) return null;
      if (!ROUTE_SIGNAL_TYPES.has(msg.type)) return null;
      if (typeof msg.href !== 'string' || !msg.href) return null;

      const expectedNonce = String(document.documentElement?.dataset?.[BRIDGE_NONCE_DATASET_KEY] || '').trim();
      if (expectedNonce && msg.nonce !== expectedNonce) return null;

      return msg;
    } catch {
      return null;
    }
  }

  const moduleScope = createModuleScope();
  let disposed = false;
  let routeWatcherInstalled = false;
  let routePollTimer = 0;
  let lastRouteKey = '';

  async function fetchDeletedConversations(pageSize = PAGE_SIZE) {
    const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.min(200, Math.floor(pageSize))) : PAGE_SIZE;
    const url = new URL('/rest/app-chat/conversations/deleted', location.origin);
    url.searchParams.set('pageSize', String(safePageSize));
    const res = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`获取废纸篓失败（HTTP ${res.status}）`);
    const data = await res.json();
    return Array.isArray(data?.conversations) ? data.conversations : [];
  }

  async function forceDeleteConversation(conversationId) {
    const id = String(conversationId || '').trim();
    if (!id) return false;
    const url = `${location.origin}/rest/app-chat/conversations/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`彻底删除失败（HTTP ${res.status}）`);
    return true;
  }

  async function clearDeletedConversations(onStatus) {
    let round = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let anyFound = false;

    try {
      if (typeof onStatus === 'function') onStatus('正在清理…');
      while (round < MAX_ROUNDS) {
        round++;
        const list = await fetchDeletedConversations(PAGE_SIZE);
        const ids = list.map((item) => String(item?.conversationId || '').trim()).filter(Boolean);
        if (!ids.length) break;
        anyFound = true;

        let roundSuccess = 0;
        for (const id of ids) {
          try {
            const ok = await forceDeleteConversation(id);
            if (ok) {
              roundSuccess++;
              totalSuccess++;
            }
          } catch (err) {
            totalFailed++;
            console.warn('彻底删除单条废纸篓会话失败:', id, err);
          }
        }

        if (roundSuccess === 0) break;
        if (ids.length < PAGE_SIZE) break;
      }

      if (!anyFound) return '废纸篓为空，无需清理';
      return totalFailed > 0
        ? `废纸篓清理完成：成功 ${totalSuccess} 条，失败 ${totalFailed} 条`
        : `废纸篓清理完成：已彻底删除 ${totalSuccess} 条`;
    } catch (e) {
      console.error('一键清空废纸篓失败:', e);
      return `清空废纸篓失败：${e?.message || e}`;
    }
  }

  function isDeletedConversationsPath(pathname = location.pathname) {
    try {
      return /^\/deleted-conversations\/?$/.test(String(pathname || ''));
    } catch {
      return false;
    }
  }

  function findHostMain() {
    const main = document.querySelector('main');
    if (!main) return null;
    const heading = Array.from(main.querySelectorAll('h1,h2')).find((el) => /Deleted Conversations/i.test(el.textContent || ''));
    if (!heading) return null;
    return { main, heading };
  }

  function setStatus(text, type = 'normal') {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = String(text || '');
    el.style.color = type === 'error' ? '#fca5a5' : type === 'ok' ? '#86efac' : 'rgba(255,255,255,0.7)';
  }

  function unmountCleanupButton() {
    const root = document.getElementById(ROOT_ID);
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  function removeLegacyNodes() {
    [LEGACY_ROOT_ID, LEGACY_BTN_ID, LEGACY_STATUS_ID].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function ensureHeaderRow(heading) {
    const parent = heading?.parentElement;
    if (!parent) return null;

    let row = document.getElementById(HEADER_ROW_ID);
    if (!row) {
      row = document.createElement('div');
      row.id = HEADER_ROW_ID;
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '12px';
      row.style.marginBottom = '8px';
    }

    if (heading.parentElement !== row) {
      parent.insertBefore(row, heading);
      row.appendChild(heading);
    }

    return row;
  }

  function mountCleanupButton() {
    const host = findHostMain();
    if (!host) return;
    const { heading } = host;

    removeLegacyNodes();
    const headerRow = ensureHeaderRow(heading);
    if (!headerRow) return;

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.style.display = 'flex';
      root.style.flexDirection = 'row';
      root.style.alignItems = 'center';
      root.style.gap = '10px';
      root.style.marginInlineStart = 'auto';
      root.style.pointerEvents = 'auto';

      const btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.textContent = '一键清空废纸篓';
      btn.style.padding = '8px 14px';
      btn.style.borderRadius = '10px';
      btn.style.border = '1px solid rgba(255,255,255,0.2)';
      btn.style.background = 'rgba(244,63,94,0.18)';
      btn.style.color = '#ffe4e6';
      btn.style.fontWeight = '600';
      btn.style.fontSize = '13px';
      btn.style.lineHeight = '1.2';
      btn.style.cursor = 'pointer';
      btn.style.backdropFilter = 'blur(6px)';
      btn.style.webkitBackdropFilter = 'blur(6px)';
      btn.style.whiteSpace = 'nowrap';

      const status = document.createElement('div');
      status.id = STATUS_ID;
      status.style.fontSize = '12px';
      status.style.color = 'rgba(255,255,255,0.7)';
      status.style.maxWidth = '280px';
      status.style.textAlign = 'left';
      status.textContent = '';

      btn.addEventListener('click', async () => {
        if (!isDeletedConversationsPath()) return;
        const ok = typeof confirm !== 'function'
          ? true
          : confirm('确认彻底清空废纸篓？该操作不可恢复。');
        if (!ok) return;
        btn.disabled = true;
        btn.style.opacity = '0.65';
        try {
          const result = await clearDeletedConversations((msg) => setStatus(msg, 'normal'));
          const isError = /失败/.test(String(result || ''));
          setStatus(result, isError ? 'error' : 'ok');
        } finally {
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      });

      root.appendChild(btn);
      root.appendChild(status);
    }

    if (!headerRow.contains(root)) headerRow.appendChild(root);
  }

  function syncUi() {
    if (disposed) return;
    if (!isDeletedConversationsPath()) {
      unmountCleanupButton();
      return;
    }
    removeLegacyNodes();
    mountCleanupButton();
  }

  function scheduleSettleSync(delayMs) {
    if (disposed) return;
    const wait = Math.max(0, Number(delayMs) || 0);
    try {
      moduleScope.timeout(() => {
        if (disposed) return;
        syncUi();
      }, wait);
    } catch {}
  }

  function onRouteSignal(reason, href = '') {
    if (disposed) return;

    const nextRouteKey = routeKeyFromHref(href) || currentRouteKey();
    const routeChanged = !!nextRouteKey && nextRouteKey !== lastRouteKey;
    if (routeChanged) lastRouteKey = nextRouteKey;

    syncUi();

    if (routeChanged || reason === 'visible' || reason === 'domready') {
      scheduleSettleSync(350);
      scheduleSettleSync(1200);
    }
  }

  function installRouteWatcher() {
    if (disposed || routeWatcherInstalled) return;
    routeWatcherInstalled = true;
    lastRouteKey = currentRouteKey();

    try {
      moduleScope.on(
        window,
        'message',
        (event) => {
          const msg = readRouteBridgeMessage(event);
          if (!msg) return;
          onRouteSignal(msg.reason || 'bridge', msg.href);
        },
        true
      );
    } catch {}

    try {
      moduleScope.on(window, 'pageshow', () => onRouteSignal('pageshow'), true);
    } catch {}
    try {
      moduleScope.on(window, 'popstate', () => onRouteSignal('popstate'), true);
    } catch {}
    try {
      moduleScope.on(window, 'hashchange', () => onRouteSignal('hashchange'), true);
    } catch {}
    try {
      moduleScope.on(
        document,
        'visibilitychange',
        () => {
          if (!document.hidden) onRouteSignal('visible');
        },
        true
      );
    } catch {}

    try {
      const pollMs = clampRoutePollMs(ROUTE_CHECK_MS);
      routePollTimer = moduleScope.interval(() => {
        if (disposed) return;
        syncUi();
      }, pollMs);
    } catch {
      routePollTimer = 0;
    }
  }

  if (document.readyState === 'loading') {
    try {
      moduleScope.on(
        document,
        'DOMContentLoaded',
        () => {
          onRouteSignal('domready');
        },
        { once: true }
      );
    } catch {}
  } else {
    onRouteSignal('init');
  }

  installRouteWatcher();

  const state = Object.freeze({
    version: 3,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      routeWatcherInstalled = false;
      routePollTimer = 0;
      try {
        moduleScope.dispose();
      } catch {}
    },
    counts: () => {
      let scopeCounts = null;
      try {
        if (typeof moduleScope.counts === 'function') scopeCounts = moduleScope.counts();
      } catch {}
      return {
        routePollActive: routePollTimer ? 1 : 0,
        scope: scopeCounts
      };
    }
  });

  try {
    Object.defineProperty(window, STATE_KEY, {
      value: state,
      writable: false,
      configurable: true,
      enumerable: false
    });
  } catch {
    try {
      window[STATE_KEY] = state;
    } catch {}
  }

  try {
    window[GUARD_KEY] = state;
  } catch {}
})();
