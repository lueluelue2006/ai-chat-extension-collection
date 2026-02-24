(function () {
  'use strict';

  const GUARD_KEY = '__aichat_grok_rate_limit_display_v3__';
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
  const PANEL_BODY_ID = 'aichat-grok-quota-body';
  const ACTION_MENU_BUTTON_ID = 'aichat-grok-quota-menu-trigger';
  const ACTION_MENU_PANEL_ID = 'aichat-grok-quota-menu-panel';
  const POSITION_STATE_KEY = 'aichat_grok_quota_position_v1';
  const REQUEST_KIND = 'DEFAULT';
  const SEND_REFRESH_DELAY_MS = 2800;
  const ROOT_WIDTH_PX = 90;
  const ROOT_MIN_HEIGHT_PX = 44;
  const PINNED_RIGHT_PX = 0;
  const PINNED_BOTTOM_PX = 0;

  const QUOTA_ITEMS = Object.freeze([
    { key: 'pool', label: 'all', modelName: 'grok-4' },
    { key: 'heavy', label: 'heavy', modelName: 'grok-4-heavy', requiresHeavyAccess: true },
    { key: 'g420', label: '4.2', modelName: 'grok-420' }
  ]);

  let currentQueryBar = null;
  let refreshTimer = null;
  let isRefreshing = false;
  let queuedRefresh = false;
  let actionMenuPanel = null;
  let actionMenuButton = null;
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
    if (!counter) return '—';
    return `${counter.remaining}/${counter.total}`;
  }

  function normalizeMenuItemText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function inferHeavyAccessFromModelMenu() {
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    if (!items.length) return null;

    const heavyItem = items.find((el) => normalizeMenuItemText(el.textContent).startsWith('heavy'));
    if (!heavyItem) return null;

    const classText = String(heavyItem.className || '');
    if (/\bopacity-75\b|\btext-secondary\b/.test(classText)) return false;
    if (/\btext-primary\b/.test(classText)) return true;
    return null;
  }

  function inferHeavyAccessFromCounters(itemsByKey) {
    const poolTotal = itemsByKey.pool?.counter?.total ?? null;
    const g420Total = itemsByKey.g420?.counter?.total ?? null;

    if (poolTotal !== null) {
      if (poolTotal >= 300) return true;
      if (poolTotal > 0 && poolTotal <= 220) return false;
    }

    if (g420Total !== null) {
      if (g420Total >= 100) return true;
      if (g420Total > 0 && g420Total <= 50) return false;
    }

    return null;
  }

  function filterRowsByCapabilities(itemsByKey, rows) {
    const fromMenu = inferHeavyAccessFromModelMenu();
    const heavyAccess = fromMenu ?? inferHeavyAccessFromCounters(itemsByKey);
    if (heavyAccess !== false) return rows;
    return rows.filter((row) => row.key !== 'heavy');
  }

  function pinFloatingRootToBottomRight(root = floatingRoot) {
    if (!root || !root.isConnected) return false;
    root.style.left = 'auto';
    root.style.top = 'auto';
    root.style.right = `${PINNED_RIGHT_PX}px`;
    root.style.bottom = `${PINNED_BOTTOM_PX}px`;
    return true;
  }

  function clearPositionState() {
    try {
      window.localStorage?.removeItem(POSITION_STATE_KEY);
    } catch (error) {
      void error;
    }
  }

  function resetFloatingPosition() {
    pinFloatingRootToBottomRight();
    clearPositionState();
  }

  function restoreFloatingPosition() {
    if (!floatingRoot || !floatingRoot.isConnected) return;
    resetFloatingPosition();
  }

  function hideActionMenu() {
    if (!actionMenuPanel) return;
    actionMenuPanel.style.display = 'none';
    actionMenuPanel.setAttribute('aria-hidden', 'true');
    if (actionMenuButton) actionMenuButton.setAttribute('aria-expanded', 'false');
  }

  function toggleActionMenu() {
    if (!actionMenuPanel || !actionMenuButton) return;
    const shouldOpen = actionMenuPanel.style.display !== 'block';
    if (!shouldOpen) {
      hideActionMenu();
      return;
    }
    actionMenuPanel.style.display = 'block';
    actionMenuPanel.setAttribute('aria-hidden', 'false');
    actionMenuButton.setAttribute('aria-expanded', 'true');
  }

  async function fetchRateLimit(modelName) {
    const response = await fetch(`${window.location.origin}/rest/rate-limits`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestKind: REQUEST_KIND,
        modelName
      })
    });

    if (!response.ok) {
      throw new Error(`rate-limits request failed: ${response.status}`);
    }

    return response.json();
  }

  function createIconButton({ label, title, onClick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.title = title;
    btn.style.width = '16px';
    btn.style.height = '16px';
    btn.style.border = '0';
    btn.style.borderRadius = '5px';
    btn.style.background = 'rgba(255,255,255,0.1)';
    btn.style.color = 'rgba(255,255,255,0.92)';
    btn.style.cursor = 'pointer';
    btn.style.font = '600 9px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.transition = 'background 140ms ease';

    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255,255,255,0.16)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255,255,255,0.1)';
    });

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick?.();
    });

    return btn;
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

  function createFloatingUi() {
    const root = document.createElement('div');
    root.id = FLOATING_ROOT_ID;
    root.style.position = 'fixed';
    root.style.left = 'auto';
    root.style.top = 'auto';
    root.style.right = `${PINNED_RIGHT_PX}px`;
    root.style.bottom = `${PINNED_BOTTOM_PX}px`;
    root.style.width = `${ROOT_WIDTH_PX}px`;
    root.style.height = 'auto';
    root.style.zIndex = '2147482000';
    root.style.pointerEvents = 'none';
    root.style.userSelect = 'none';
    root.style.display = 'block';

    const card = document.createElement('div');
    card.id = PANEL_ID;
    card.style.pointerEvents = 'auto';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '2px';
    card.style.padding = '3px 4px';
    card.style.width = '100%';
    card.style.minHeight = `${ROOT_MIN_HEIGHT_PX}px`;
    card.style.border = '1px solid rgba(148,163,184,0.24)';
    card.style.borderRadius = '5px';
    card.style.background = 'rgba(0, 0, 0, 0.72)';
    card.style.backdropFilter = 'blur(8px)';
    card.style.webkitBackdropFilter = 'blur(8px)';
    card.style.boxShadow = '0 6px 12px rgba(2,6,23,0.28)';
    card.style.color = 'rgb(226,232,240)';
    card.style.font = '500 8px/1.15 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '2px';
    header.style.cursor = 'default';
    header.style.paddingBottom = '0';

    const title = document.createElement('div');
    title.textContent = 'Q';
    title.style.fontWeight = '700';
    title.style.letterSpacing = '0.02em';
    title.style.color = 'rgba(191,219,254,0.98)';

    const actions = document.createElement('div');
    actions.style.display = 'inline-flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '1px';
    actions.style.position = 'relative';

    const menuBtn = createIconButton({
      label: '⋯',
      title: '更多操作',
      onClick: () => toggleActionMenu()
    });
    menuBtn.id = ACTION_MENU_BUTTON_ID;
    menuBtn.style.width = '13px';
    menuBtn.style.height = '13px';
    menuBtn.style.font = '700 8px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.setAttribute('aria-expanded', 'false');

    const menuPanel = document.createElement('div');
    menuPanel.id = ACTION_MENU_PANEL_ID;
    menuPanel.style.position = 'absolute';
    menuPanel.style.top = 'calc(100% + 6px)';
    menuPanel.style.right = '0';
    menuPanel.style.display = 'none';
    menuPanel.style.minWidth = '94px';
    menuPanel.style.padding = '5px';
    menuPanel.style.border = '1px solid rgba(148,163,184,0.35)';
    menuPanel.style.borderRadius = '7px';
    menuPanel.style.background = 'rgba(15,23,42,0.94)';
    menuPanel.style.boxShadow = '0 8px 16px rgba(2,6,23,0.4)';
    menuPanel.style.backdropFilter = 'blur(12px)';
    menuPanel.style.webkitBackdropFilter = 'blur(12px)';
    menuPanel.style.zIndex = '4';
    menuPanel.style.pointerEvents = 'auto';
    menuPanel.setAttribute('aria-hidden', 'true');

    const appendMenuItem = (label, action) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = label;
      item.style.width = '100%';
      item.style.border = '0';
      item.style.borderRadius = '5px';
      item.style.padding = '4px 5px';
      item.style.margin = '0';
      item.style.background = 'transparent';
      item.style.color = 'rgba(226,232,240,0.95)';
      item.style.cursor = 'pointer';
      item.style.textAlign = 'left';
      item.style.font = '500 9px/1.1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(148,163,184,0.18)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideActionMenu();
        action?.();
      });
      menuPanel.appendChild(item);
    };

    appendMenuItem('立即刷新', () => queueRefresh(0));
    appendMenuItem('贴右下角', () => resetFloatingPosition());

    actions.appendChild(menuBtn);
    actions.appendChild(menuPanel);
    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.id = PANEL_BODY_ID;
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '2px';

    card.appendChild(header);
    card.appendChild(body);

    root.appendChild(card);

    actionMenuPanel = menuPanel;
    actionMenuButton = menuBtn;

    return { root, card };
  }

  function renderPanelRows(rows, state = 'ready') {
    if (!panel) return;
    const body = panel.querySelector(`#${PANEL_BODY_ID}`);
    if (!body) return;

    body.textContent = '';

    for (const rowData of rows) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '3px';

      const label = document.createElement('span');
      label.textContent = rowData.label;
      label.style.opacity = rowData.highlight ? '1' : '0.88';
      label.style.color = rowData.highlight ? 'rgb(191, 219, 254)' : 'inherit';
      label.style.textTransform = 'lowercase';
      label.style.letterSpacing = '0.01em';

      const value = document.createElement('span');
      value.textContent = rowData.value;
      value.style.fontWeight = '700';
      value.style.letterSpacing = '0.01em';
      value.style.fontVariantNumeric = 'tabular-nums';
      value.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

      row.appendChild(label);
      row.appendChild(value);
      body.appendChild(row);
    }

    if (state === 'loading') {
      panel.style.opacity = '0.78';
      panel.title = '额度刷新中…';
    } else if (state === 'error') {
      panel.style.opacity = '0.94';
      panel.title = '额度刷新失败，点击重试';
    } else {
      panel.style.opacity = '0.96';
      panel.title = '额度面板';
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
      restoreFloatingPosition();

      renderPanelRows(
        QUOTA_ITEMS.map((item) => ({
          label: item.label,
          value: '--/--',
          highlight: item.key === 'pool'
        })),
        'loading'
      );
    }
    return panel;
  }

  function removeFloatingUi() {
    hideActionMenu();
    if (floatingRoot && floatingRoot.parentNode) {
      floatingRoot.parentNode.removeChild(floatingRoot);
    }
    actionMenuPanel = null;
    actionMenuButton = null;
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
    renderPanelRows(
      QUOTA_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        value: '--/--',
        highlight: item.key === 'pool'
      })),
      'loading'
    );

    try {
      const rawItems = await Promise.all(
        QUOTA_ITEMS.map(async (item) => {
          try {
            const payload = await fetchRateLimit(item.modelName);
            const counter = extractCounter(payload);
            return {
              key: item.key,
              label: item.label,
              counter,
              value: formatCounter(counter),
              highlight: item.key === 'pool',
              requiresHeavyAccess: !!item.requiresHeavyAccess
            };
          } catch {
            return {
              key: item.key,
              label: item.label,
              counter: null,
              value: '—',
              highlight: item.key === 'pool',
              requiresHeavyAccess: !!item.requiresHeavyAccess
            };
          }
        })
      );

      const itemsByKey = rawItems.reduce((acc, item) => {
        if (item?.key) acc[item.key] = item;
        return acc;
      }, {});
      const rows = filterRowsByCapabilities(itemsByKey, rawItems).map((item) => ({
        key: item.key,
        label: item.label,
        value: item.value,
        highlight: item.highlight
      }));

      renderPanelRows(rows, 'ready');
    } catch (error) {
      console.warn('[QuickNav][GrokQuota] refresh failed', error);
      renderPanelRows(
        QUOTA_ITEMS.map((item) => ({
          label: item.label,
          value: '—',
          highlight: item.key === 'pool'
        })),
        'error'
      );
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
    document.addEventListener('pointerdown', (event) => {
      if (!actionMenuPanel || actionMenuPanel.style.display !== 'block') return;
      const target = event.target;
      if (target instanceof Node && (actionMenuPanel.contains(target) || actionMenuButton?.contains(target))) return;
      hideActionMenu();
    }, true);
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      hideActionMenu();
    }, true);

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
