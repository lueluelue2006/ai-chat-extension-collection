(() => {
  'use strict';

  // ChatGPT header fix:
  // - Keep the top-left control always as sidebar toggle (no "logo morph" on hover).
  // - When sidebar is expanded, swap header controls so: [Close sidebar] on the left, [Home/New chat] on the right.
  // - Add a tiny click-guard during rapid toggle to prevent accidental "New chat" clicks before swap settles.
  // - Move the top-right "group chat / temporary chat" actions next to the model selector,
  //   so they stop occupying the far-right gap that collides with QuickNav.
  //
  // Keep it lightweight & robust:
  // - Sidebar swap is still pure CSS based on `#stage-slideover-sidebar` inline width (rail vs expanded).
  // - Top banner relayout is DOM-based, but only watches the active header subtree.

  const FLAG = '__quicknavChatgptSidebarHeaderFixV1__';
  const STATE_KEY = '__quicknavChatgptSidebarHeaderFixStateV1__';

  try {
    const prev = globalThis[STATE_KEY];
    if (prev && typeof prev.dispose === 'function') prev.dispose();
  } catch {}

  const DEBUG = false;

  const STYLE_ID = 'qn-chatgpt-sidebar-header-fix-style';

  // === Rapid-toggle misclick guard ===
  // Baseline lock window: 0.1s
  // - Prevent the "second click" during fast toggles from landing on a transiently re-positioned Home/New chat control.
  // - If the DOM hasn't settled yet, we extend the lock briefly (bounded) until the detected sidebar mode matches intent.
  const LOCK_BASE_MS = 100;
  const LOCK_SYNC_MAX_MS = 480;
  const LOCK_CLASS = 'qn-chatgpt-sidebar-header-fix-lock';
  const FORCE_EXPANDED_CLASS = 'qn-chatgpt-sidebar-header-fix-force-expanded';
  const MODE_EXPANDED_CLASS = 'qn-chatgpt-sidebar-header-fix-mode-expanded';
  const MODE_RAIL_CLASS = 'qn-chatgpt-sidebar-header-fix-mode-rail';
  const TOPBAR_MODEL_SELECTOR = 'button[data-testid="model-switcher-dropdown-button"]';
  const TOPBAR_INLINE_MODEL_ROW_CLASS = 'qn-chatgpt-topbar-inline-model-row';
  const TOPBAR_INLINE_ACTIONS_CLASS = 'qn-chatgpt-topbar-inline-actions';
  const TOPBAR_PLACEHOLDER_ATTR = 'data-qn-chatgpt-topbar-actions-placeholder';
  const TOPBAR_RELOCATED_ATTR = 'data-qn-chatgpt-topbar-actions-relocated';
  const TOPBAR_SYNTHETIC_HOST_ATTR = 'data-qn-chatgpt-topbar-actions-synthetic';
  const TOPBAR_MIN_WIDTH_PX = 720;
  const TOPBAR_MIN_GAP_PX = 6;
  const root = document.documentElement;
  let lockUntil = 0;
  let unlockTimer = 0;

  let intentMode = '';
  let intentAt = 0;
  let intentSyncTimer = 0;
  let topbarEnsureTimer = 0;
  let topbarRouteBound = false;
  let topbarWatchedHeader = null;
  let topbarHeaderObserver = null;
  let topbarInlineRow = null;
  let topbarActionsHost = null;
  let topbarActionsPlaceholder = null;

  const trackedOffs = [];
  const trackedObservers = new Set();
  const trackedTimers = new Set();

  function trackOff(fn) {
    if (typeof fn !== 'function') return;
    trackedOffs.push(fn);
  }

  function setTrackedTimeout(fn, ms) {
    const id = setTimeout(() => {
      trackedTimers.delete(id);
      fn();
    }, ms);
    trackedTimers.add(id);
    return id;
  }

  function clearTrackedTimeout(id) {
    if (!id) return;
    clearTimeout(id);
    trackedTimers.delete(id);
  }

  function addTrackedListener(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') return;
    target.addEventListener(type, handler, options);
    trackOff(() => {
      try {
        target.removeEventListener(type, handler, options);
      } catch {}
    });
  }

  function trackObserver(observer) {
    if (observer && typeof observer.disconnect === 'function') trackedObservers.add(observer);
    return observer;
  }

  function getSidebarEl() {
    try {
      return document.getElementById('stage-slideover-sidebar');
    } catch {
      return null;
    }
  }

  function detectSidebarMode() {
    const sidebar = getSidebarEl();
    if (!sidebar) return '';

    try {
      const s = String(sidebar.getAttribute?.('style') || '');
      if (s.includes('--sidebar-width')) return 'expanded';
      if (s.includes('--sidebar-rail-width')) return 'rail';
    } catch {}

    // Fallback: best-effort width heuristic (avoids being coupled to ChatGPT inline CSS vars).
    try {
      const w = Number(sidebar.getBoundingClientRect?.().width || 0);
      if (!Number.isFinite(w) || w <= 0) return '';
      return w >= 160 ? 'expanded' : 'rail';
    } catch {
      return '';
    }
  }

  function syncModeClass(reason = '') {
    const mode = detectSidebarMode();
    try {
      root.classList.toggle(MODE_EXPANDED_CLASS, mode === 'expanded');
      root.classList.toggle(MODE_RAIL_CLASS, mode === 'rail');
    } catch {}
    if (DEBUG || globalThis.DEBUG_TEMP) {
      try {
        if (reason) console.log('[QuickNav] sidebar-header-fix mode:', mode, reason);
      } catch {}
    }
    return mode;
  }

  function setTransientLock(ms, { forceExpanded = null } = {}) {
    const now = Date.now();
    const duration = typeof ms === 'number' && ms > 0 ? ms : LOCK_BASE_MS;
    lockUntil = Math.max(lockUntil, now + duration);
    try {
      root.classList.add(LOCK_CLASS);
      if (forceExpanded === true) root.classList.add(FORCE_EXPANDED_CLASS);
      else if (forceExpanded === false) root.classList.remove(FORCE_EXPANDED_CLASS);
    } catch {}

    if (unlockTimer) clearTrackedTimeout(unlockTimer);
    const delay = Math.min(Math.max(0, lockUntil - now + 20), 500);
    unlockTimer = setTrackedTimeout(() => {
      unlockTimer = 0;
      try {
        if (Date.now() < lockUntil) {
          setTransientLock(lockUntil - Date.now());
          return;
        }
        root.classList.remove(LOCK_CLASS);
        root.classList.remove(FORCE_EXPANDED_CLASS);
      } catch {}
    }, delay);
  }

  function isLocked() {
    return Date.now() < lockUntil;
  }

  function isGuardedClickTarget(target) {
    try {
      if (!target || typeof target.closest !== 'function') return false;
      // 1) Any Home/New chat link inside the sidebar that navigates to "/".
      // ChatGPT uses "/" for both Home and New chat, and the layout may morph during sidebar toggles.
      const homeOrNewChatLink = target.closest(
        '#stage-slideover-sidebar a[href="/"], #stage-slideover-sidebar a[href^="/?"], #stage-slideover-sidebar a[href="https://chatgpt.com/"], #stage-slideover-sidebar a[href="https://chatgpt.com"], #stage-slideover-sidebar a[href^="https://chatgpt.com/?"]'
      );
      if (homeOrNewChatLink) return true;

      // 2) Sidebar New chat button/link (ChatGPT may render 1-2 variants).
      const newChat = target.closest(
        '#stage-slideover-sidebar [data-testid="create-new-chat-button"], #stage-slideover-sidebar [aria-label*="new chat" i], #stage-slideover-sidebar [aria-label*="新建对话" i], #stage-slideover-sidebar [aria-label*="新对话" i], #stage-slideover-sidebar [aria-label*="新聊天" i]'
      );
      if (newChat) return true;

      return false;
    } catch {
      return false;
    }
  }

  function setIntent(nextMode) {
    intentMode = nextMode === 'expanded' || nextMode === 'rail' ? nextMode : '';
    intentAt = Date.now();
  }

  function clearIntent() {
    intentMode = '';
    intentAt = 0;
    if (intentSyncTimer) {
      clearTrackedTimeout(intentSyncTimer);
      intentSyncTimer = 0;
    }
  }

  function scheduleIntentSync() {
    if (intentSyncTimer) return;
    intentSyncTimer = setTrackedTimeout(() => {
      intentSyncTimer = 0;
      try {
        if (!intentMode) return;
        const elapsed = Date.now() - intentAt;
        if (elapsed > LOCK_SYNC_MAX_MS) return clearIntent();

        const mode = syncModeClass('intent-sync');
        if (mode && mode === intentMode) return clearIntent();

        // DOM hasn't caught up yet: extend lock a bit more (bounded by LOCK_SYNC_MAX_MS overall).
        setTransientLock(LOCK_BASE_MS, { forceExpanded: intentMode === 'expanded' });
        scheduleIntentSync();
      } catch {
        clearIntent();
      }
    }, 60);
  }

  // When toggling quickly, the header re-renders and CSS swap may lag by a few frames.
  // Guard the Home/New chat control for a short window after any sidebar toggle click.
  const onPointerDown = (e) => {
      try {
        const t = e.target;
        if (isLocked() && isGuardedClickTarget(t)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }

        if (!t || typeof t.closest !== 'function') return;
        // Sidebar toggle can be rendered outside the sidebar node when collapsed.
        const toggle = t.closest(
          'button[aria-controls="stage-slideover-sidebar"], button[data-testid="close-sidebar-button"]'
        );
        if (!toggle) return;
        const ariaLabel = String(toggle.getAttribute('aria-label') || '');
        const expanded = toggle.getAttribute('aria-expanded');

        // Keep a mode baseline in sync for CSS fallbacks.
        const baseline = syncModeClass('toggle-pointerdown');

        // Infer intent: prefer aria-expanded, then aria-label, then baseline.
        let next = '';
        if (expanded === 'false') next = 'expanded';
        else if (expanded === 'true') next = 'rail';
        else if (/open sidebar/i.test(ariaLabel)) next = 'expanded';
        else if (/close sidebar/i.test(ariaLabel)) next = 'rail';
        else if (baseline) next = baseline === 'expanded' ? 'rail' : 'expanded';

        // Baseline cooldown: 0.1s. If DOM hasn't settled yet, intent sync will extend (bounded).
        setTransientLock(LOCK_BASE_MS, { forceExpanded: next === 'expanded' });
        if (next) {
          setIntent(next);
          scheduleIntentSync();
        }
      } catch {}
    };
  addTrackedListener(document, 'pointerdown', onPointerDown, true);

  const onClickGuard = (e) => {
      try {
        if (!isLocked()) return;
        if (!isGuardedClickTarget(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch {}
    };
  addTrackedListener(document, 'click', onClickGuard, true);

  function getChatGptCore() {
    try {
      return globalThis.__aichat_chatgpt_core_v1__ || null;
    } catch {
      return null;
    }
  }

  function matchesTopbarActionLabel(label) {
    const raw = String(label || '').trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (lower.includes('group chat')) return true;
    if (lower.includes('temporary chat')) return true;
    if (/群聊/.test(raw)) return true;
    if (/临时(聊天|对话|会话)/.test(raw)) return true;
    return false;
  }

  function isTopbarActionButton(node) {
    try {
      if (!(node instanceof HTMLButtonElement)) return false;
      const aria = String(node.getAttribute('aria-label') || '').trim();
      if (matchesTopbarActionLabel(aria)) return true;
      return matchesTopbarActionLabel(node.innerText || '');
    } catch {
      return false;
    }
  }

  function getTopbarModelButton() {
    try {
      return document.querySelector(TOPBAR_MODEL_SELECTOR);
    } catch {
      return null;
    }
  }

  function getTopbarModelRow(modelButton) {
    const btn = modelButton || getTopbarModelButton();
    const row = btn?.parentElement || null;
    if (!btn || !row) return null;
    if (!row.closest?.('header')) return null;
    return row;
  }

  function getTopbarHeader(modelButton) {
    try {
      return (modelButton || getTopbarModelButton())?.closest?.('header') || null;
    } catch {
      return null;
    }
  }

  function cleanupTopbarOrphans() {
    if (topbarInlineRow && !topbarInlineRow.isConnected) topbarInlineRow = null;
    if (topbarWatchedHeader && !topbarWatchedHeader.isConnected) topbarWatchedHeader = null;
    if (topbarActionsHost && !topbarActionsHost.isConnected) topbarActionsHost = null;
    if (topbarActionsPlaceholder && !topbarActionsPlaceholder.isConnected) topbarActionsPlaceholder = null;
    if (!topbarActionsHost && topbarActionsPlaceholder) {
      try {
        topbarActionsPlaceholder.remove();
      } catch {}
      topbarActionsPlaceholder = null;
    }
  }

  function resetTopbarObserver() {
    if (!topbarHeaderObserver) return;
    try {
      topbarHeaderObserver.disconnect();
    } catch {}
    trackedObservers.delete(topbarHeaderObserver);
    topbarHeaderObserver = null;
    topbarWatchedHeader = null;
  }

  function restoreTopbarActionsHost() {
    cleanupTopbarOrphans();
    try {
      topbarInlineRow?.classList?.remove(TOPBAR_INLINE_MODEL_ROW_CLASS);
    } catch {}
    try {
      topbarActionsHost?.classList?.remove(TOPBAR_INLINE_ACTIONS_CLASS);
      topbarActionsHost?.removeAttribute?.(TOPBAR_RELOCATED_ATTR);
    } catch {}
    try {
      if (
        topbarActionsHost &&
        topbarActionsPlaceholder &&
        topbarActionsHost.isConnected &&
        topbarActionsPlaceholder.isConnected &&
        topbarActionsPlaceholder.parentElement
      ) {
        topbarActionsPlaceholder.parentElement.insertBefore(topbarActionsHost, topbarActionsPlaceholder);
      }
    } catch {}
    try {
      topbarActionsPlaceholder?.remove?.();
    } catch {}
    topbarInlineRow = null;
    topbarActionsHost = null;
    topbarActionsPlaceholder = null;
  }

  function findTopbarActionsHost(header, modelRow) {
    cleanupTopbarOrphans();
    if (topbarActionsHost && topbarActionsHost.isConnected) return topbarActionsHost;

    const row = modelRow || null;
    try {
      const relocated = row?.querySelector?.(`[${TOPBAR_RELOCATED_ATTR}="1"]`);
      if (relocated instanceof HTMLElement) return relocated;
    } catch {}

    const host = header || null;
    if (!host) return null;
    const children = Array.from(host.children).filter((node) => node instanceof HTMLElement);

    for (const child of children) {
      if (!(child instanceof HTMLElement) || child === row) continue;
      if (String(child.className || '').includes('absolute')) continue;
      const buttons = Array.from(child.querySelectorAll('button'));
      if (buttons.filter((button) => isTopbarActionButton(button)).length >= 2) return child;
    }

    for (const child of children) {
      if (!(child instanceof HTMLElement) || child === row) continue;
      if (String(child.className || '').includes('absolute')) continue;
      if (child.querySelector(TOPBAR_MODEL_SELECTOR)) continue;
      const buttons = Array.from(child.querySelectorAll('button'));
      if (buttons.length >= 1 && buttons.length <= 4) return child;
    }

    const directButtons = children.filter((child) => isTopbarActionButton(child));
    if (directButtons.length >= 1) {
      const syntheticHost = document.createElement('div');
      syntheticHost.className = 'flex items-center';
      syntheticHost.setAttribute(TOPBAR_SYNTHETIC_HOST_ATTR, '1');
      try {
        host.insertBefore(syntheticHost, directButtons[0]);
      } catch {
        return null;
      }
      directButtons.forEach((button) => {
        try {
          syntheticHost.appendChild(button);
        } catch {}
      });
      return syntheticHost;
    }

    return null;
  }

  function canInlineTopbarActions(modelRow, modelButton, actionsHost) {
    try {
      if (!modelRow || !modelButton || !actionsHost) return false;
      if (window.innerWidth < TOPBAR_MIN_WIDTH_PX) return false;
      const rowWidth = Number(modelRow.getBoundingClientRect?.().width || 0);
      const modelWidth = Number(modelButton.getBoundingClientRect?.().width || 0);
      let hostWidth = Number(actionsHost.getBoundingClientRect?.().width || 0);
      if (!Number.isFinite(hostWidth) || hostWidth <= 0) {
        hostWidth = Math.max(72, actionsHost.querySelectorAll('button').length * 40);
      }
      if (!Number.isFinite(rowWidth) || !Number.isFinite(modelWidth)) return false;
      return rowWidth >= modelWidth + hostWidth + TOPBAR_MIN_GAP_PX + 24;
    } catch {
      return false;
    }
  }

  function moveTopbarActionsInline(modelRow, modelButton, actionsHost) {
    if (!modelRow || !modelButton || !actionsHost) return false;

    if (topbarActionsHost && topbarActionsHost !== actionsHost) restoreTopbarActionsHost();

    if (actionsHost.parentElement !== modelRow) {
      const parent = actionsHost.parentElement;
      if (!parent) return false;
      if (!(topbarActionsPlaceholder && topbarActionsHost === actionsHost && topbarActionsPlaceholder.isConnected)) {
        try {
          topbarActionsPlaceholder?.remove?.();
        } catch {}
        const placeholder = document.createElement('span');
        placeholder.hidden = true;
        placeholder.setAttribute(TOPBAR_PLACEHOLDER_ATTR, '1');
        parent.insertBefore(placeholder, actionsHost);
        topbarActionsPlaceholder = placeholder;
      }
      const anchor = Array.from(modelRow.children).find((child) => child !== modelButton && child !== actionsHost) || null;
      if (anchor) modelRow.insertBefore(actionsHost, anchor);
      else modelRow.appendChild(actionsHost);
    }

    if (topbarInlineRow && topbarInlineRow !== modelRow) {
      try {
        topbarInlineRow.classList.remove(TOPBAR_INLINE_MODEL_ROW_CLASS);
      } catch {}
    }

    topbarInlineRow = modelRow;
    topbarActionsHost = actionsHost;

    try {
      modelRow.classList.add(TOPBAR_INLINE_MODEL_ROW_CLASS);
      actionsHost.classList.add(TOPBAR_INLINE_ACTIONS_CLASS);
      actionsHost.setAttribute(TOPBAR_RELOCATED_ATTR, '1');
    } catch {}
    return true;
  }

  function ensureTopbarActionsInline(reason = '') {
    cleanupTopbarOrphans();
    const modelButton = getTopbarModelButton();
    const modelRow = getTopbarModelRow(modelButton);
    const header = getTopbarHeader(modelButton);
    if (!modelButton || !modelRow || !header) {
      restoreTopbarActionsHost();
      resetTopbarObserver();
      return false;
    }

    const actionsHost = findTopbarActionsHost(header, modelRow);
    if (!actionsHost) return false;
    if (!canInlineTopbarActions(modelRow, modelButton, actionsHost)) {
      restoreTopbarActionsHost();
      return false;
    }

    const moved = moveTopbarActionsInline(modelRow, modelButton, actionsHost);
    if (!moved) return false;

    if (header !== topbarWatchedHeader) {
      resetTopbarObserver();
      topbarWatchedHeader = header;
      topbarHeaderObserver = trackObserver(
        new MutationObserver(() => {
          scheduleTopbarEnsure(`header-mutation:${reason}`);
        })
      );
      try {
        topbarHeaderObserver.observe(header, { childList: true, subtree: true });
      } catch {}
    }
    return true;
  }

  function scheduleTopbarEnsure(reason = '') {
    if (topbarEnsureTimer) return;
    topbarEnsureTimer = setTrackedTimeout(() => {
      topbarEnsureTimer = 0;
      ensureTopbarActionsInline(reason);
    }, 40);
  }

  function installTopbarRouteSync() {
    if (topbarRouteBound) return;
    const core = getChatGptCore();
    if (!core || typeof core.onRouteChange !== 'function') return;
    const off = core.onRouteChange(() => {
      scheduleTopbarEnsure('route');
      setTrackedTimeout(() => scheduleTopbarEnsure('route+160'), 160);
      setTrackedTimeout(() => scheduleTopbarEnsure('route+640'), 640);
    });
    trackOff(() => {
      topbarRouteBound = false;
      try {
        off();
      } catch {}
    });
    topbarRouteBound = true;
  }

  function runTopbarStartupPasses(reason = 'startup') {
    scheduleTopbarEnsure(reason);
    setTrackedTimeout(() => scheduleTopbarEnsure(`${reason}+400`), 400);
    setTrackedTimeout(() => scheduleTopbarEnsure(`${reason}+1400`), 1400);
    setTrackedTimeout(() => scheduleTopbarEnsure(`${reason}+3200`), 3200);
  }

	  function ensureStyle() {
	    if (document.getElementById(STYLE_ID)) return;
	    const style = document.createElement('style');
	    style.id = STYLE_ID;
	    style.textContent = `
/* Sidebar header controls swap + overlap fix (ChatGPT 2025/2026 UI). */

/* Rapid-toggle guard: temporarily disable the Home/New chat control to prevent misclicks. */
html.${LOCK_CLASS} #stage-slideover-sidebar a[href="/"],
html.${LOCK_CLASS} #stage-slideover-sidebar a[href^="/?"],
html.${LOCK_CLASS} #stage-slideover-sidebar a[href="https://chatgpt.com/"],
html.${LOCK_CLASS} #stage-slideover-sidebar a[href="https://chatgpt.com"],
html.${LOCK_CLASS} #stage-slideover-sidebar a[href^="https://chatgpt.com/?"],
html.${LOCK_CLASS} #stage-slideover-sidebar [data-testid="create-new-chat-button"],
html.${LOCK_CLASS} #stage-slideover-sidebar [aria-label*="new chat" i],
html.${LOCK_CLASS} #stage-slideover-sidebar [aria-label*="新建对话" i],
html.${LOCK_CLASS} #stage-slideover-sidebar [aria-label*="新对话" i],
html.${LOCK_CLASS} #stage-slideover-sidebar [aria-label*="新聊天" i]{
	  pointer-events: none !important;
	  cursor: default !important;
}

/* During expand transition, force the swapped layout early for a few frames. */
html.${FORCE_EXPANDED_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between,
html.${MODE_EXPANDED_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between{
	  flex-direction: row-reverse !important;
}

/* Treat the "Open sidebar" control as the authoritative top-left toggle. */
#stage-slideover-sidebar button[aria-controls="stage-slideover-sidebar"][aria-expanded="false"]{
	  position: relative !important;
	  z-index: 5 !important;
}

/* Collapsed rail: show Open, hide Home, hide Close (avoid icon morph). */
#stage-slideover-sidebar[style*="--sidebar-rail-width"] button[aria-controls="stage-slideover-sidebar"][aria-expanded="false"],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar button[aria-controls="stage-slideover-sidebar"][aria-expanded="false"]{
	  opacity: 1 !important;
	  pointer-events: auto !important;
}
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between a[href="/"],
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between a[href^="/?"],
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between a[href="https://chatgpt.com/"],
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between a[href="https://chatgpt.com"],
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between a[href^="https://chatgpt.com/?"],
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between [data-testid="create-new-chat-button"],
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between [aria-label*="new chat" i],
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between [aria-label*="新建对话" i],
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between [aria-label*="新对话" i],
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between [aria-label*="新聊天" i],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between a[href="/"],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between a[href^="/?"],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between a[href="https://chatgpt.com/"],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between a[href="https://chatgpt.com"],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between a[href^="https://chatgpt.com/?"],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between [data-testid="create-new-chat-button"],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between [aria-label*="new chat" i],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between [aria-label*="新建对话" i],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between [aria-label*="新对话" i],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between [aria-label*="新聊天" i]{
	  opacity: 0 !important;
	  pointer-events: none !important;
}
#stage-slideover-sidebar[style*="--sidebar-rail-width"] button[aria-controls="stage-slideover-sidebar"][aria-expanded="true"],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar button[aria-controls="stage-slideover-sidebar"][aria-expanded="true"]{
	  opacity: 0 !important;
	  pointer-events: none !important;
}
#stage-slideover-sidebar[style*="--sidebar-rail-width"] button[data-testid="close-sidebar-button"],
html.${MODE_RAIL_CLASS} #stage-slideover-sidebar button[data-testid="close-sidebar-button"]{
	  opacity: 0 !important;
	  pointer-events: none !important;
}

/* Expanded: hide Open (so hover doesn't reveal it), and swap header so Close is on the left. */
#stage-slideover-sidebar[style*="--sidebar-width"] button[aria-controls="stage-slideover-sidebar"][aria-expanded="false"],
html.${MODE_EXPANDED_CLASS} #stage-slideover-sidebar button[aria-controls="stage-slideover-sidebar"][aria-expanded="false"]{
	  opacity: 0 !important;
	  pointer-events: none !important;
}
#stage-slideover-sidebar[style*="--sidebar-width"] .h-header-height.flex.items-center.justify-between{
	  flex-direction: row-reverse !important;
}

/* Top banner: keep utility actions close to the model selector so they stop blocking QuickNav. */
.${TOPBAR_INLINE_MODEL_ROW_CLASS}{
	  flex: 1 1 auto !important;
	  min-width: 0 !important;
	  gap: 0 !important;
}
.${TOPBAR_INLINE_MODEL_ROW_CLASS} > ${TOPBAR_MODEL_SELECTOR}{
	  flex: none !important;
}
.${TOPBAR_INLINE_ACTIONS_CLASS}{
	  flex: none !important;
	  align-items: center !important;
	  justify-content: flex-start !important;
	  gap: 4px !important;
	  margin-inline-start: ${TOPBAR_MIN_GAP_PX}px !important;
	  overflow: visible !important;
}
.${TOPBAR_INLINE_ACTIONS_CLASS} .flex.items-center{
	  gap: 4px !important;
}
.${TOPBAR_INLINE_ACTIONS_CLASS} button{
	  flex: none !important;
}
.${TOPBAR_INLINE_ACTIONS_CLASS} .me-1{
	  margin-inline-end: 4px !important;
}
		`;
	    (document.head || document.documentElement).appendChild(style);
	  }

  ensureStyle();
  trackOff(() => {
    try {
      document.getElementById(STYLE_ID)?.remove();
    } catch {}
  });

  addTrackedListener(window, 'resize', () => scheduleTopbarEnsure('resize'), { passive: true });
  addTrackedListener(document, 'visibilitychange', () => {
    try {
      if (!document.hidden) scheduleTopbarEnsure('visible');
    } catch {}
  });
  addTrackedListener(window, 'pageshow', () => runTopbarStartupPasses('pageshow'));
  addTrackedListener(window, 'load', () => runTopbarStartupPasses('window-load'));

  installTopbarRouteSync();
  setTrackedTimeout(installTopbarRouteSync, 800);
  setTrackedTimeout(installTopbarRouteSync, 2000);
  if (document.readyState === 'complete') runTopbarStartupPasses('ready-complete');
  else setTrackedTimeout(() => {
    try {
      if (document.readyState === 'complete') runTopbarStartupPasses('late-ready');
    } catch {}
  }, 5000);

	  // When the sidebar flips between rail <-> expanded, the DOM may re-render for a few frames.
	  // Add a short lock window so users can't accidentally click a transiently positioned control.
	  try {
	    let lastMode = '';
	    const getMode = () => {
	      return syncModeClass('mo-getMode');
	    };

	    const install = () => {
	      const sidebar = document.getElementById('stage-slideover-sidebar');
	      if (!sidebar) return;
	      if (sidebar.__qnSidebarHeaderFixMo) return;
	      lastMode = getMode();
	      const mo = trackObserver(new MutationObserver(() => {
	        const next = getMode();
	        if (!next || next === lastMode) return;
	        lastMode = next;
	        // Baseline: 0.1s, extended by intent sync if needed.
	        setTransientLock(LOCK_BASE_MS);
	      }));
	      mo.observe(sidebar, { attributes: true, attributeFilter: ['style'] });
	      sidebar.__qnSidebarHeaderFixMo = mo;
	    };

	    install();
	    setTrackedTimeout(install, 800);
	    setTrackedTimeout(install, 2000);
	  } catch {}

	  function disposeRuntime() {
	    restoreTopbarActionsHost();
	    resetTopbarObserver();
	    clearTrackedTimeout(unlockTimer);
	    unlockTimer = 0;
	    clearTrackedTimeout(intentSyncTimer);
	    intentSyncTimer = 0;
	    clearTrackedTimeout(topbarEnsureTimer);
	    topbarEnsureTimer = 0;
	    clearIntent();
	    topbarRouteBound = false;
	    lockUntil = 0;
	    try {
	      root.classList.remove(LOCK_CLASS);
	      root.classList.remove(FORCE_EXPANDED_CLASS);
	      root.classList.remove(MODE_EXPANDED_CLASS);
	      root.classList.remove(MODE_RAIL_CLASS);
	    } catch {}
	    for (const observer of Array.from(trackedObservers)) {
	      trackedObservers.delete(observer);
	      try {
	        observer.disconnect();
	      } catch {}
	    }
	    while (trackedOffs.length) {
	      const off = trackedOffs.pop();
	      try {
	        off();
	      } catch {}
	    }
	    for (const timerId of Array.from(trackedTimers)) {
	      clearTrackedTimeout(timerId);
	    }
	    try {
	      const sidebar = document.getElementById('stage-slideover-sidebar');
	      const mo = sidebar && sidebar.__qnSidebarHeaderFixMo;
	      if (mo && typeof mo.disconnect === 'function') mo.disconnect();
	      if (sidebar) delete sidebar.__qnSidebarHeaderFixMo;
	    } catch {}
	  }

	  try {
	    Object.defineProperty(globalThis, FLAG, { value: true, configurable: true });
	  } catch {
	    try {
	      globalThis[FLAG] = true;
	    } catch {}
	  }
	  try {
	    Object.defineProperty(globalThis, STATE_KEY, {
	      value: Object.freeze({ dispose: disposeRuntime }),
	      configurable: true,
	      enumerable: false,
	      writable: false
	    });
	  } catch {
	    try {
	      globalThis[STATE_KEY] = { dispose: disposeRuntime };
	    } catch {}
	  }
	})();
