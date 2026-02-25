(function () {
  'use strict';

  const GUARD_KEY = '__aichat_grok_rate_limit_display_v4__';
  const DOM_GUARD_ATTR = 'data-aichat-grok-quota-display-active';

  if (window.top !== window) return;

  if (document.documentElement?.getAttribute(DOM_GUARD_ATTR) === '1') return;
  document.documentElement?.setAttribute(DOM_GUARD_ATTR, '1');

  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const QUERY_BAR_SELECTOR = '.query-bar';
  const FLOATING_ROOT_ID = 'aichat-grok-quota-floating-root';
  const PANEL_ID = 'aichat-grok-quota-panel';
  const PANEL_VALUE_ID = 'aichat-grok-quota-value';
  const POSITION_STATE_KEY = 'aichat_grok_quota_position_v1';
  const REQUEST_KIND = 'DEFAULT';
  const TARGET_MODEL_NAME = 'grok-4';
  const SEND_REFRESH_DELAY_MS = 2800;
  const ROOT_MIN_HEIGHT_PX = 16;
  const PINNED_RIGHT_PX = 0;
  const PINNED_BOTTOM_PX = 0;

  let currentQueryBar = null;
  let refreshTimer = null;
  let isRefreshing = false;
  let queuedRefresh = false;
  let syncQueryBarScheduled = false;

  let floatingRoot = null;
  let panel = null;

  function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeCounterPart(value) {
    const num = toFiniteNumber(value);
    if (num === null) return null;
    return Math.max(0, Math.floor(num));
  }

  function extractCounter(payload) {
    if (!payload || typeof payload !== 'object') return null;

    const directPairs = [
      ['remainingTokens', 'totalTokens'],
      ['remainingQueries', 'totalQueries']
    ];

    for (const [remainingKey, totalKey] of directPairs) {
      const remaining = normalizeCounterPart(payload[remainingKey]);
      const total = normalizeCounterPart(payload[totalKey]);
      if (remaining !== null && total !== null) {
        return { remaining, total };
      }
    }

    const nestedKeys = ['highEffortRateLimits', 'lowEffortRateLimits'];
    for (const key of nestedKeys) {
      const nested = payload[key];
      if (!nested || typeof nested !== 'object') continue;
      const remaining = normalizeCounterPart(nested.remainingQueries);
      const total = normalizeCounterPart(nested.totalQueries);
      if (remaining !== null && total !== null) {
        return { remaining, total };
      }
    }

    return null;
  }

  function formatCounter(counter) {
    if (!counter) return '—/—';
    return `${counter.remaining}/${counter.total}`;
  }

  async function fetchRateLimit() {
    const response = await fetch(`${window.location.origin}/rest/rate-limits`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestKind: REQUEST_KIND,
        modelName: TARGET_MODEL_NAME
      })
    });

    if (!response.ok) {
      throw new Error(`rate-limits request failed: ${response.status}`);
    }

    return response.json();
  }

  function cleanupDuplicateFloatingRoots() {
    const roots = Array.from(document.querySelectorAll(`#${FLOATING_ROOT_ID}`));
    if (!roots.length) return null;
    const keeper = roots[roots.length - 1];
    for (const root of roots) {
      if (root === keeper) continue;
      try {
        root.remove();
      } catch {}
    }
    return keeper;
  }

  function pinFloatingRootToBottomRight(root = floatingRoot) {
    if (!root || !root.isConnected) return false;
    root.style.left = 'auto';
    root.style.top = 'auto';
    root.style.right = `${PINNED_RIGHT_PX}px`;
    root.style.bottom = `${PINNED_BOTTOM_PX}px`;
    return true;
  }

  function clearLegacyPositionState() {
    try {
      window.localStorage?.removeItem(POSITION_STATE_KEY);
    } catch {}
  }

  function createFloatingUi() {
    const root = document.createElement('div');
    root.id = FLOATING_ROOT_ID;
    root.style.position = 'fixed';
    root.style.left = 'auto';
    root.style.top = 'auto';
    root.style.right = `${PINNED_RIGHT_PX}px`;
    root.style.bottom = `${PINNED_BOTTOM_PX}px`;
    root.style.width = 'auto';
    root.style.height = 'auto';
    root.style.zIndex = '2147482000';
    root.style.pointerEvents = 'none';
    root.style.userSelect = 'none';
    root.style.display = 'block';

    const card = document.createElement('div');
    card.id = PANEL_ID;
    card.style.pointerEvents = 'none';
    card.style.display = 'inline-flex';
    card.style.alignItems = 'center';
    card.style.justifyContent = 'center';
    card.style.padding = '2px 4px';
    card.style.minHeight = `${ROOT_MIN_HEIGHT_PX}px`;
    card.style.border = '1px solid rgba(148,163,184,0.24)';
    card.style.borderRadius = '4px';
    card.style.background = 'rgba(0, 0, 0, 0.72)';
    card.style.backdropFilter = 'blur(8px)';
    card.style.webkitBackdropFilter = 'blur(8px)';
    card.style.boxShadow = '0 6px 12px rgba(2,6,23,0.28)';
    card.style.color = 'rgb(226,232,240)';
    card.style.font = '700 9px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    card.style.fontVariantNumeric = 'tabular-nums';
    card.style.letterSpacing = '0.01em';

    const value = document.createElement('span');
    value.id = PANEL_VALUE_ID;
    value.textContent = '--/--';
    card.appendChild(value);

    root.appendChild(card);

    return { root, card };
  }

  function renderCounter(value, state = 'ready') {
    if (!panel) return;

    const valueEl = panel.querySelector(`#${PANEL_VALUE_ID}`);
    if (!(valueEl instanceof HTMLElement)) return;

    valueEl.textContent = String(value || '—/—');

    if (state === 'loading') {
      panel.style.opacity = '0.78';
      panel.title = '额度刷新中…';
    } else if (state === 'error') {
      panel.style.opacity = '0.94';
      panel.title = '额度刷新失败';
    } else {
      panel.style.opacity = '0.96';
      panel.title = 'all 积分余量';
    }
  }

  function ensureFloatingUi() {
    if (!document.body) return null;

    const dedupedRoot = cleanupDuplicateFloatingRoots();

    if (!floatingRoot || !document.body.contains(floatingRoot)) {
      if (dedupedRoot && dedupedRoot.parentNode) {
        dedupedRoot.parentNode.removeChild(dedupedRoot);
      }

      const created = createFloatingUi();
      floatingRoot = created.root;
      panel = created.card;
      document.body.appendChild(floatingRoot);
      pinFloatingRootToBottomRight();
      clearLegacyPositionState();

      renderCounter('--/--', 'loading');
    }

    return panel;
  }

  function removeFloatingUi() {
    if (floatingRoot && floatingRoot.parentNode) {
      floatingRoot.parentNode.removeChild(floatingRoot);
    }
    floatingRoot = null;
    panel = null;
  }

  async function refreshQuota() {
    if (!currentQueryBar || !document.body.contains(currentQueryBar)) return;

    const panelElement = ensureFloatingUi();
    if (!panelElement) return;

    if (isRefreshing) {
      queuedRefresh = true;
      return;
    }

    isRefreshing = true;
    renderCounter('--/--', 'loading');

    try {
      const payload = await fetchRateLimit();
      const counter = extractCounter(payload);
      renderCounter(formatCounter(counter), 'ready');
    } catch (error) {
      console.warn('[QuickNav][GrokQuota] refresh failed', error);
      renderCounter('—/—', 'error');
    } finally {
      isRefreshing = false;
      if (queuedRefresh) {
        queuedRefresh = false;
        queueRefresh(400);
      }
    }
  }

  function queueRefresh(delayMs = SEND_REFRESH_DELAY_MS) {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    const waitMs = Number.isFinite(delayMs) ? Math.max(0, Math.floor(delayMs)) : SEND_REFRESH_DELAY_MS;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      refreshQuota();
    }, waitMs);
  }

  function onViewportChanged() {
    if (!floatingRoot || !floatingRoot.isConnected) return;
    pinFloatingRootToBottomRight();
  }

  function getComposerText(eventTarget) {
    if (!(eventTarget instanceof Element)) return '';

    const editable = eventTarget.closest('textarea, [contenteditable="true"]');
    if (!editable || !currentQueryBar || !currentQueryBar.contains(editable)) return '';

    if (editable instanceof HTMLTextAreaElement || editable instanceof HTMLInputElement) {
      return editable.value || '';
    }
    return editable.textContent || '';
  }

  function looksLikeSendButton(button) {
    if (!(button instanceof HTMLButtonElement)) return false;

    if (button.type === 'submit') return true;

    const attrsText = [
      button.getAttribute('aria-label') || '',
      button.getAttribute('data-testid') || '',
      button.getAttribute('title') || '',
      button.textContent || ''
    ]
      .join(' ')
      .toLowerCase();

    if (/(send|submit|发送|提交)/.test(attrsText)) return true;

    const iconPath = Array.from(button.querySelectorAll('path'))
      .map((path) => path.getAttribute('d') || '')
      .join(' ');

    return iconPath.includes('M6 11L12 5M12 5L18 11M12 5V19') || iconPath.includes('M5 12L12 5L19 12');
  }

  function onQueryBarKeydown(event) {
    if (event.key !== 'Enter') return;
    if (event.shiftKey) return;
    if (event.isComposing || event.keyCode === 229) return;
    if (!event.metaKey && !event.ctrlKey) return;

    const text = getComposerText(event.target);
    if (!text.trim()) return;

    queueRefresh(SEND_REFRESH_DELAY_MS);
  }

  function onQueryBarSubmit(event) {
    if (!(event.target instanceof Element)) return;
    if (!currentQueryBar || !currentQueryBar.contains(event.target)) return;
    queueRefresh(SEND_REFRESH_DELAY_MS);
  }

  function onQueryBarClick(event) {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest('button');
    if (!(button instanceof HTMLButtonElement)) return;
    if (!currentQueryBar || !currentQueryBar.contains(button)) return;
    if (!looksLikeSendButton(button)) return;

    queueRefresh(SEND_REFRESH_DELAY_MS);
  }

  function detachQueryBar() {
    if (currentQueryBar) {
      currentQueryBar.removeEventListener('keydown', onQueryBarKeydown, true);
      currentQueryBar.removeEventListener('click', onQueryBarClick, true);
      currentQueryBar.removeEventListener('submit', onQueryBarSubmit, true);
    }
    currentQueryBar = null;

    removeFloatingUi();

    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function attachQueryBar(queryBar) {
    if (queryBar === currentQueryBar) {
      ensureFloatingUi();
      return;
    }

    detachQueryBar();

    currentQueryBar = queryBar;
    currentQueryBar.addEventListener('keydown', onQueryBarKeydown, true);
    currentQueryBar.addEventListener('click', onQueryBarClick, true);
    currentQueryBar.addEventListener('submit', onQueryBarSubmit, true);

    ensureFloatingUi();
    queueRefresh(120);
  }

  function isGrokConversationPath(pathname = window.location.pathname) {
    try {
      const path = String(pathname || '');
      return /^\/c(?:\/|$)/.test(path);
    } catch {
      return false;
    }
  }

  function routeSupportsPanel() {
    if (!isGrokConversationPath()) return false;
    return !window.location.pathname.startsWith('/imagine');
  }

  function syncQueryBar() {
    if (!routeSupportsPanel()) {
      detachQueryBar();
      return;
    }

    const nextQueryBar = document.querySelector(QUERY_BAR_SELECTOR);
    if (!(nextQueryBar instanceof Element)) {
      detachQueryBar();
      return;
    }

    attachQueryBar(nextQueryBar);
  }

  function scheduleSyncQueryBar() {
    if (syncQueryBarScheduled) return;
    syncQueryBarScheduled = true;
    window.requestAnimationFrame(() => {
      syncQueryBarScheduled = false;
      syncQueryBar();
    });
  }

  function boot() {
    window.addEventListener('resize', onViewportChanged, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportChanged, { passive: true });
      window.visualViewport.addEventListener('scroll', onViewportChanged, { passive: true });
    }

    syncQueryBar();

    const observerRoot = document.body || document.documentElement;
    if (!observerRoot) return;

    const observer = new MutationObserver(() => {
      scheduleSyncQueryBar();
    });
    observer.observe(observerRoot, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
