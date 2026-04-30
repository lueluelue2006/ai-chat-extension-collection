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
  const TOPBAR_MODEL_SELECTOR =
    'button[data-testid="model-switcher-dropdown-button"], button[aria-label*="Model selector" i], button[aria-label*="current model is" i]';
  const TOPBAR_MODEL_META_ATTR = 'data-qn-chatgpt-model-meta-label';
  const TOPBAR_INLINE_MODEL_ROW_CLASS = 'qn-chatgpt-topbar-inline-model-row';
  const TOPBAR_INLINE_ACTIONS_CLASS = 'qn-chatgpt-topbar-inline-actions';
  const TOPBAR_MODEL_BADGE_ATTR = 'data-qn-chatgpt-topbar-model-label';
  const TOPBAR_MODEL_BADGE_BUTTON_ATTR = 'data-qn-chatgpt-topbar-model-toggle';
  const TOPBAR_MODEL_BADGE_BUTTON_CLASS = 'qn-chatgpt-topbar-model-toggle';
  const TOPBAR_MODEL_BADGE_EVENT = '__aichat_chatgpt_topbar_model_toggle_v2__';
  const TOPBAR_MODEL_BADGE_SESSION_KEY = 'qn-chatgpt-topbar-model-label-v1';
  const TOPBAR_MODEL_BADGE_SESSION_TTL_MS = 10 * 60 * 1000;
  const TOPBAR_PLACEHOLDER_ATTR = 'data-qn-chatgpt-topbar-actions-placeholder';
  const TOPBAR_RELOCATED_ATTR = 'data-qn-chatgpt-topbar-actions-relocated';
  const TOPBAR_SYNTHETIC_HOST_ATTR = 'data-qn-chatgpt-topbar-actions-synthetic';
  const HEADER_ACTIONS_RESERVE_CLASS = 'qn-chatgpt-header-actions-reserved';
  const HEADER_ACTIONS_RESERVE_ATTR = 'data-qn-chatgpt-header-actions-reserved';
  const HEADER_ACTIONS_RESERVE_SELECTOR = '[data-testid="thread-header-right-actions-container"]';
  const HEADER_ACTIONS_RESERVE_CSS_VAR = '--qn-chatgpt-header-actions-reserve';
  const HEADER_ACTIONS_RESERVE_GAP_PX = 12;
  const HEADER_ACTIONS_MAX_RESERVE_PX = 540;
  const TOPBAR_MIN_WIDTH_PX = 720;
  const TOPBAR_MIN_GAP_PX = 6;
  const TOPBAR_ROUTE_RECOVERY_MS = 1800;
  const TOPBAR_STARTUP_DELAYS_MS = Object.freeze([0, 120, 360, 900, 1800, 3200, 6000]);
  const root = document.documentElement;
  let lockUntil = 0;
  let unlockTimer = 0;

  let intentMode = '';
  let intentAt = 0;
  let intentSyncTimer = 0;
  let topbarEnsureTimer = 0;
  let topbarRouteBound = false;
  let topbarRouteKey = '';
  let topbarRoutePollTimer = 0;
  let topbarRouteRecoveryUntil = 0;
  let topbarWatchedHeader = null;
  let topbarHeaderObserver = null;
  let topbarInlineRow = null;
  let topbarActionsHost = null;
  let topbarActionsPlaceholder = null;
  let headerActionsReservedEl = null;
  let topbarModelToggleBusy = false;
  let topbarLastModelBadgeLabel = readStoredTopbarBadgeLabel();
  let topbarMenuSelectionBadgeUntil = 0;

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

  function getChatGptCoreMain() {
    try {
      return window.__aichat_chatgpt_core_main_v1__ || null;
    } catch {
      return null;
    }
  }

  function currentRouteKey() {
    try {
      return `${location.pathname || ''}${location.search || ''}${location.hash || ''}`;
    } catch {
      return '';
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

  function matchesHeaderUtilityActionLabel(label) {
    const raw = String(label || '').trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (matchesTopbarActionLabel(raw)) return true;
    if (lower === 'share' || lower.includes('share chat')) return true;
    if (lower.includes('conversation options')) return true;
    if (/分享/.test(raw)) return true;
    if (/对话.*(选项|菜单)|会话.*(选项|菜单)/.test(raw)) return true;
    return false;
  }

  function isHeaderUtilityActionButton(node) {
    try {
      if (!(node instanceof HTMLButtonElement)) return false;
      const aria = String(node.getAttribute('aria-label') || '').trim();
      if (matchesHeaderUtilityActionLabel(aria)) return true;
      return matchesHeaderUtilityActionLabel(node.innerText || node.textContent || '');
    } catch {
      return false;
    }
  }

  function getPageHeader() {
    try {
      return document.querySelector('header#page-header, header[data-fixed-header], header');
    } catch {
      return null;
    }
  }

  function getHeaderDirectChildFor(node, header) {
    try {
      let cur = node instanceof Element ? node : null;
      while (cur && cur.parentElement && cur.parentElement !== header) cur = cur.parentElement;
      return cur instanceof HTMLElement && cur.parentElement === header ? cur : null;
    } catch {
      return null;
    }
  }

  function findHeaderActionsReserveTarget() {
    try {
      const explicit = document.querySelector(HEADER_ACTIONS_RESERVE_SELECTOR);
      if (explicit instanceof HTMLElement) return explicit;

      const header = getPageHeader();
      if (!(header instanceof HTMLElement)) return null;
      const buttons = Array.from(header.querySelectorAll('button')).filter((button) => isHeaderUtilityActionButton(button));
      if (!buttons.length) return null;

      for (const button of buttons) {
        const direct = getHeaderDirectChildFor(button, header);
        if (direct) return direct;
      }
      return buttons[0]?.parentElement instanceof HTMLElement ? buttons[0].parentElement : null;
    } catch {
      return null;
    }
  }

  function getQuickNavRectForHeaderReserve() {
    try {
      const nav = document.getElementById('cgpt-compact-nav');
      if (!(nav instanceof HTMLElement)) return null;
      const rect = nav.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      const style = window.getComputedStyle(nav);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null;
      return rect;
    } catch {
      return null;
    }
  }

  function clearHeaderActionsReserve(target = headerActionsReservedEl) {
    if (!(target instanceof HTMLElement)) return;
    try {
      target.classList.remove(HEADER_ACTIONS_RESERVE_CLASS);
      target.removeAttribute(HEADER_ACTIONS_RESERVE_ATTR);
      target.style.removeProperty(HEADER_ACTIONS_RESERVE_CSS_VAR);
    } catch {}
    if (headerActionsReservedEl === target) headerActionsReservedEl = null;
  }

  function buildHeaderActionsReservePlan() {
    const target = findHeaderActionsReserveTarget();
    const navRect = getQuickNavRectForHeaderReserve();
    const header = target?.closest?.('header') || getPageHeader();
    if (!(target instanceof HTMLElement) || !navRect || !(header instanceof HTMLElement)) {
      return { shouldReserve: false, target: target instanceof HTMLElement ? target : null, reservePx: 0 };
    }

    let headerRect = null;
    try {
      headerRect = header.getBoundingClientRect();
    } catch {}
    if (!headerRect || headerRect.width <= 0 || headerRect.height <= 0) {
      return { shouldReserve: false, target, reservePx: 0 };
    }

    const verticalOverlap = navRect.bottom > headerRect.top + 4 && navRect.top < headerRect.bottom - 4;
    const headerRight = Math.min(
      Math.max(window.visualViewport?.width || 0, window.innerWidth || 0, document.documentElement?.clientWidth || 0),
      headerRect.right
    );
    const navPinnedToHeaderRight = navRect.right >= headerRight - 8;
    const reservePx = Math.ceil(
      Math.min(
        HEADER_ACTIONS_MAX_RESERVE_PX,
        Math.max(0, headerRight - navRect.left + HEADER_ACTIONS_RESERVE_GAP_PX)
      )
    );
    const shouldReserve = verticalOverlap && navPinnedToHeaderRight && reservePx >= 32;
    return { shouldReserve, target, reservePx };
  }

  function syncHeaderActionsReserve() {
    const plan = buildHeaderActionsReservePlan();
    if (headerActionsReservedEl && headerActionsReservedEl !== plan.target) clearHeaderActionsReserve(headerActionsReservedEl);
    if (!plan.shouldReserve || !(plan.target instanceof HTMLElement)) {
      clearHeaderActionsReserve(plan.target || headerActionsReservedEl);
      return false;
    }
    headerActionsReservedEl = plan.target;
    try {
      plan.target.classList.add(HEADER_ACTIONS_RESERVE_CLASS);
      plan.target.setAttribute(HEADER_ACTIONS_RESERVE_ATTR, '1');
      plan.target.style.setProperty(HEADER_ACTIONS_RESERVE_CSS_VAR, `${plan.reservePx}px`);
    } catch {}
    return true;
  }

  function headerActionsReserveNeedsRepair() {
    const plan = buildHeaderActionsReservePlan();
    if (!plan.shouldReserve) return !!headerActionsReservedEl;
    const target = plan.target;
    if (!(target instanceof HTMLElement)) return false;
    const current = Number.parseFloat(String(target.style.getPropertyValue(HEADER_ACTIONS_RESERVE_CSS_VAR) || '').trim());
    return (
      headerActionsReservedEl !== target ||
      !target.classList.contains(HEADER_ACTIONS_RESERVE_CLASS) ||
      target.getAttribute(HEADER_ACTIONS_RESERVE_ATTR) !== '1' ||
      !Number.isFinite(current) ||
      Math.abs(current - plan.reservePx) > 1
    );
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
    const header = btn.closest?.('header') || null;
    if (!header || !row.closest?.('header')) return null;
    const expandedRow = row.parentElement || null;
    try {
      if (
        expandedRow &&
        expandedRow !== header &&
        expandedRow.closest?.('header') === header &&
        /\bflex\b/.test(String(expandedRow.className || ''))
      ) {
        return expandedRow;
      }
    } catch {}
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

  function enterTopbarRouteRecovery(ms = TOPBAR_ROUTE_RECOVERY_MS) {
    const duration = Math.max(0, Number(ms) || TOPBAR_ROUTE_RECOVERY_MS);
    topbarRouteRecoveryUntil = Math.max(topbarRouteRecoveryUntil, Date.now() + duration);
  }

  function isTopbarRouteRecovering() {
    return Date.now() < Number(topbarRouteRecoveryUntil || 0);
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
      topbarActionsHost?.querySelector?.(`[${TOPBAR_MODEL_BADGE_BUTTON_ATTR}="1"]`)?.remove?.();
    } catch {}
    try {
      topbarActionsPlaceholder?.remove?.();
    } catch {}
    try {
      topbarActionsHost?.removeAttribute?.(TOPBAR_MODEL_BADGE_ATTR);
    } catch {}
    topbarInlineRow = null;
    topbarActionsHost = null;
    topbarActionsPlaceholder = null;
  }

  function readModelButtonReactLabel(modelButton) {
    try {
      if (!(modelButton instanceof HTMLElement)) return '';
      const keys = Object.keys(modelButton);
      const propsKey = keys.find((key) => key.startsWith('__reactProps$'));
      const fiberKey = keys.find((key) => key.startsWith('__reactFiber$'));
      const reactProps =
        (propsKey && modelButton[propsKey]) ||
        (fiberKey && modelButton[fiberKey] && modelButton[fiberKey].memoizedProps) ||
        null;
      if (reactProps && typeof reactProps.label === 'string' && reactProps.label.trim()) {
        return reactProps.label.trim();
      }
      const children = Array.isArray(reactProps?.children) ? reactProps.children : [];
      for (const child of children) {
        const label = child?.props?.label;
        if (typeof label === 'string' && label.trim()) return label.trim();
      }
    } catch {}
    return '';
  }

  function readVisibleModelMenuLabel() {
    try {
      const menus = Array.from(document.querySelectorAll('[role="menu"]'));
      for (const menu of menus) {
        if (!(menu instanceof HTMLElement)) continue;
        const options = Array.from(menu.querySelectorAll('[role="menuitemradio"], [role="menuitemcheckbox"], button'));
        for (const option of options) {
          if (!(option instanceof HTMLElement)) continue;
          const selected =
            option.getAttribute('aria-checked') === 'true' ||
            option.getAttribute('aria-selected') === 'true' ||
            option.querySelector?.('[data-state="checked"], [aria-hidden="true"].icon, svg[aria-hidden="true"]');
          if (!selected) continue;
          const text = String(option.innerText || option.textContent || '').trim();
          if (text) return text.split(/\n+/).map((part) => part.trim()).filter(Boolean)[0] || '';
        }
      }
    } catch {}
    return '';
  }

  function prettifyModelIdentifier(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const compact = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (
      /\binstant\b/.test(compact) ||
      /(?:^|[^a-z0-9])gpt[-.]5[-.]3(?:[^a-z0-9]|$)/.test(compact) ||
      compact.endsWith('-instant')
    ) return 'Instant';
    if (/\b(light|heavy)(?:\s+thinking)?\b/.test(compact) || /\bthinking\b/.test(compact) || /思考|推理/.test(compact)) return 'Thinking';
    if (/\b(?:standard|extended)\s+pro\b/.test(compact) || /\b(?:extended\s+)?pro\b/.test(compact) || /专业/.test(compact)) return 'Pro';
    if (/\blatest\b/.test(compact)) return 'Latest';
    if (/^gpt-\d+(?:\.\d+)?(?:-[a-z0-9]+)*$/.test(compact)) {
      if (compact.endsWith('-thinking')) return 'Thinking';
      if (compact.endsWith('-pro')) return 'Pro';
      return compact.toUpperCase();
    }
    return raw;
  }

  function isTopbarModelFamilyLabel(label) {
    const text = String(label || '').trim();
    return /^(Instant|Thinking|Pro|Latest)$/i.test(text) || /^GPT[-.]/i.test(text);
  }

  function cleanTopbarBadgeLabel(label) {
    const text = prettifyModelIdentifier(label);
    if (!text || text.toLowerCase() === 'chatgpt') return '';
    if (!isTopbarModelFamilyLabel(text)) return '';
    return text;
  }

  function readStoredTopbarBadgeLabel() {
    try {
      const raw = sessionStorage.getItem(TOPBAR_MODEL_BADGE_SESSION_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      const label = cleanTopbarBadgeLabel(parsed?.label);
      const at = Number(parsed?.at || 0);
      if (!label || !Number.isFinite(at) || Date.now() - at > TOPBAR_MODEL_BADGE_SESSION_TTL_MS) return '';
      return label;
    } catch {
      return '';
    }
  }

  function writeStoredTopbarBadgeLabel(label) {
    try {
      sessionStorage.setItem(TOPBAR_MODEL_BADGE_SESSION_KEY, JSON.stringify({ label, at: Date.now() }));
    } catch {}
  }

  function rememberTopbarBadgeLabel(label) {
    const text = cleanTopbarBadgeLabel(label);
    if (text) {
      topbarLastModelBadgeLabel = text;
      writeStoredTopbarBadgeLabel(text);
    }
    return text;
  }

  function readExistingTopbarBadgeLabel(actionsHost) {
    if (!(actionsHost instanceof HTMLElement)) return topbarLastModelBadgeLabel;
    const button = actionsHost.querySelector?.(`[${TOPBAR_MODEL_BADGE_BUTTON_ATTR}="1"]`);
    const candidates = [
      actionsHost.getAttribute?.(TOPBAR_MODEL_BADGE_ATTR),
      button?.dataset?.label,
      button?.textContent,
      topbarLastModelBadgeLabel
    ];
    for (const candidate of candidates) {
      const label = cleanTopbarBadgeLabel(candidate);
      if (label) return label;
    }
    return '';
  }

  function readMenuOptionModelLabel(option) {
    if (!(option instanceof HTMLElement)) return '';
    const primaryText = String(option.innerText || option.textContent || '')
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean)[0] || '';
    const combined = [
      option.getAttribute?.('data-testid'),
      option.getAttribute?.('aria-label'),
      option.getAttribute?.('data-value'),
      primaryText
    ].map((value) => String(value || '').trim()).filter(Boolean).join(' ');
    return cleanTopbarBadgeLabel(combined);
  }

  function rememberTopbarModelSelectionFromEvent(event) {
    try {
      const target = event?.target instanceof Element ? event.target : null;
      const option = target?.closest?.('[role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], button');
      if (!(option instanceof HTMLElement)) return;
      const inModelMenu = option.closest?.('[role="menu"], [role="listbox"], [data-radix-menu-content], [cmdk-list]');
      if (!(inModelMenu instanceof HTMLElement)) return;
      const label = readMenuOptionModelLabel(option);
      if (!label) return;
      rememberTopbarBadgeLabel(label);
      topbarMenuSelectionBadgeUntil = Date.now() + 2500;
      scheduleTopbarEnsure('model-menu-selection');
    } catch {}
  }

  function readTopbarModelBadgeLabel(modelButton) {
    const visible = prettifyModelIdentifier(readVisibleModelMenuLabel());
    if (visible) return visible;

    const mirroredMeta = prettifyModelIdentifier(String(modelButton?.getAttribute?.(TOPBAR_MODEL_META_ATTR) || '').trim());
    if (mirroredMeta) return mirroredMeta;

    const coreMain = getChatGptCoreMain();
    try {
      const metaLabel = prettifyModelIdentifier(coreMain?.readCurrentModelMetaLabel?.());
      if (metaLabel) return metaLabel;
    } catch {}

    const reactLabel = prettifyModelIdentifier(readModelButtonReactLabel(modelButton));
    if (reactLabel) return reactLabel;

    const core = getChatGptCore();
    try {
      const composerMode = prettifyModelIdentifier(core?.readComposerModeLabel?.());
      if (composerMode) return composerMode;
    } catch {}
    try {
      const currentLabel = prettifyModelIdentifier(core?.readCurrentModelLabel?.());
      if (currentLabel && currentLabel.toLowerCase() !== 'chatgpt') return currentLabel;
    } catch {}

    const text = prettifyModelIdentifier(String(modelButton?.innerText || modelButton?.textContent || '').trim());
    if (text && text.toLowerCase() !== 'chatgpt') return text;
    return '';
  }

  function resolveTopbarModelBadgeLabel(modelButton, actionsHost = null) {
    if (Date.now() < topbarMenuSelectionBadgeUntil) {
      const selectedLabel = cleanTopbarBadgeLabel(topbarLastModelBadgeLabel);
      if (selectedLabel) return selectedLabel;
    }
    const liveLabel = rememberTopbarBadgeLabel(readTopbarModelBadgeLabel(modelButton));
    if (liveLabel) return liveLabel;
    const fallbackLabel = readExistingTopbarBadgeLabel(actionsHost);
    const existingLabel = cleanTopbarBadgeLabel(fallbackLabel);
    if (existingLabel) return existingLabel;
    return '';
  }

  function estimateModelBadgeWidth(label) {
    const text = String(label || '').trim();
    if (!text) return 0;
    return Math.max(48, Math.min(112, 18 + text.length * 8));
  }

  function resolveTopbarToggleTarget(label) {
    const pretty = String(label || '').trim().toLowerCase();
    if (pretty === 'pro') return 'thinking';
    if (pretty === 'thinking') return 'pro';
    return 'thinking';
  }

  function expectedTopbarToggleTitle(targetMode) {
    return targetMode === 'pro' ? '切换到 Pro' : '切换到 Thinking';
  }

  function isLegacyTopbarBadgeButton(button, label) {
    if (!(button instanceof HTMLButtonElement)) return true;
    const text = String(label || '').trim();
    const targetMode = resolveTopbarToggleTarget(text);
    const expectedTitle = expectedTopbarToggleTitle(targetMode);
    return (
      button.disabled ||
      String(button.dataset?.targetMode || '').trim() !== targetMode ||
      String(button.textContent || '').trim() !== text ||
      String(button.getAttribute('title') || '').trim() !== expectedTitle ||
      String(button.getAttribute('aria-label') || '').trim() !== expectedTitle
    );
  }

  async function handleTopbarModelBadgeToggle(event) {
    try {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
    } catch {}
    if (topbarModelToggleBusy) return;
    const button = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const actionsHost = button?.closest?.(`.${TOPBAR_INLINE_ACTIONS_CLASS}`) || topbarActionsHost;
    const currentLabel = String(button?.dataset?.label || actionsHost?.getAttribute?.(TOPBAR_MODEL_BADGE_ATTR) || '').trim();
    const targetMode = resolveTopbarToggleTarget(currentLabel);
    topbarModelToggleBusy = true;
    try {
      button?.setAttribute?.('aria-busy', 'true');
      button?.classList?.add('is-busy');
      try {
        window.dispatchEvent(new CustomEvent(TOPBAR_MODEL_BADGE_EVENT, { detail: { targetMode } }));
      } catch {}
    } catch {}
    finally {
      setTrackedTimeout(() => {
        topbarModelToggleBusy = false;
        try {
          button?.removeAttribute?.('aria-busy');
          button?.classList?.remove('is-busy');
        } catch {}
        scheduleTopbarEnsure('badge-toggle');
      }, 420);
    }
  }

  function syncTopbarModelBadgeButton(actionsHost, label) {
    if (!(actionsHost instanceof HTMLElement)) return false;
    const text = String(label || '').trim();
    let button = actionsHost.querySelector(`[${TOPBAR_MODEL_BADGE_BUTTON_ATTR}="1"]`);
    if (!text) {
      try { button?.remove?.(); } catch {}
      return false;
    }
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = TOPBAR_MODEL_BADGE_BUTTON_CLASS;
      button.setAttribute(TOPBAR_MODEL_BADGE_BUTTON_ATTR, '1');
      button.addEventListener('click', handleTopbarModelBadgeToggle, true);
      try {
        actionsHost.insertBefore(button, actionsHost.firstChild || null);
      } catch {
        return false;
      }
    }
    const targetMode = resolveTopbarToggleTarget(text);
    const expectedTitle = expectedTopbarToggleTitle(targetMode);
    button.textContent = text;
    button.dataset.label = text;
    button.dataset.targetMode = targetMode;
    button.disabled = false;
    button.removeAttribute('disabled');
    button.title = expectedTitle;
    button.setAttribute('aria-label', expectedTitle);
    return true;
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
      const badgeWidth = estimateModelBadgeWidth(resolveTopbarModelBadgeLabel(modelButton, actionsHost));
      let hostWidth = Number(actionsHost.getBoundingClientRect?.().width || 0);
      const badgeButton = actionsHost.querySelector?.(`[${TOPBAR_MODEL_BADGE_BUTTON_ATTR}="1"]`);
      const badgeButtonWidth = Number(badgeButton?.getBoundingClientRect?.().width || 0);
      if (badgeButtonWidth > 0 && Number.isFinite(hostWidth)) hostWidth = Math.max(0, hostWidth - badgeButtonWidth);
      if (!Number.isFinite(hostWidth) || hostWidth <= 0) {
        const actionButtons = Array.from(actionsHost.querySelectorAll('button')).filter((button) => !(button instanceof HTMLElement) || button.getAttribute(TOPBAR_MODEL_BADGE_BUTTON_ATTR) !== '1');
        hostWidth = Math.max(72, actionButtons.length * 40);
      }
      if (!Number.isFinite(rowWidth) || !Number.isFinite(modelWidth)) return false;
      return rowWidth >= modelWidth + badgeWidth + hostWidth + TOPBAR_MIN_GAP_PX + 24;
    } catch {
      return false;
    }
  }

  function syncTopbarModelBadge(modelRow, modelButton, actionsHost) {
    if (!modelRow || !modelButton || !(actionsHost instanceof HTMLElement)) return false;
    const label = resolveTopbarModelBadgeLabel(modelButton, actionsHost);
    if (!label) {
      try {
        actionsHost.removeAttribute(TOPBAR_MODEL_BADGE_ATTR);
      } catch {}
      syncTopbarModelBadgeButton(actionsHost, '');
      return false;
    }
    try {
      actionsHost.setAttribute(TOPBAR_MODEL_BADGE_ATTR, label);
      actionsHost.setAttribute('aria-live', 'polite');
    } catch {}
    syncTopbarModelBadgeButton(actionsHost, label);
    return true;
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
      const modelSlot =
        (modelButton.parentElement instanceof HTMLElement && modelRow.contains(modelButton.parentElement))
          ? modelButton.parentElement
          : modelButton;
      const children = Array.from(modelRow.children).filter((child) => child instanceof HTMLElement && child !== actionsHost);
      const modelIdx = children.indexOf(modelSlot);
      const anchor = modelIdx >= 0 ? (children[modelIdx + 1] || null) : (children[0] || null);
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
      if (!isTopbarRouteRecovering()) {
        restoreTopbarActionsHost();
        resetTopbarObserver();
      }
      return false;
    }

    const actionsHost = findTopbarActionsHost(header, modelRow);
    if (!actionsHost) {
      if (!isTopbarRouteRecovering()) restoreTopbarActionsHost();
      return false;
    }
    if (!canInlineTopbarActions(modelRow, modelButton, actionsHost)) {
      if (!isTopbarRouteRecovering()) restoreTopbarActionsHost();
      return false;
    }

    const moved = moveTopbarActionsInline(modelRow, modelButton, actionsHost);
    if (!moved) return false;
    syncTopbarModelBadge(modelRow, modelButton, actionsHost);

    if (header !== topbarWatchedHeader) {
      resetTopbarObserver();
      topbarWatchedHeader = header;
      topbarHeaderObserver = trackObserver(
        new MutationObserver(() => {
          scheduleTopbarEnsure(`header-mutation:${reason}`);
        })
      );
      try {
        topbarHeaderObserver.observe(header, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: [TOPBAR_MODEL_META_ATTR, 'aria-label', 'data-state']
        });
      } catch {}
    }
    return true;
  }

  function topbarNeedsRepair() {
    if (headerActionsReserveNeedsRepair()) return true;
    cleanupTopbarOrphans();
    const modelButton = getTopbarModelButton();
    const modelRow = getTopbarModelRow(modelButton);
    const header = getTopbarHeader(modelButton);
    if (!modelButton || !modelRow || !header) return false;
    const actionsHost = findTopbarActionsHost(header, modelRow);
    if (!actionsHost) return false;
    const expectedBadge = resolveTopbarModelBadgeLabel(modelButton, actionsHost);
    const currentBadge = String(actionsHost.getAttribute?.(TOPBAR_MODEL_BADGE_ATTR) || '').trim();
    const badgeButton = actionsHost.querySelector?.(`[${TOPBAR_MODEL_BADGE_BUTTON_ATTR}="1"]`);
    if (modelRow.classList?.contains?.(TOPBAR_INLINE_MODEL_ROW_CLASS)) {
      if (!expectedBadge) return false;
      return currentBadge !== expectedBadge || isLegacyTopbarBadgeButton(badgeButton, expectedBadge);
    }
    return canInlineTopbarActions(modelRow, modelButton, actionsHost);
  }

  function scheduleTopbarEnsure(reason = '') {
    if (topbarEnsureTimer) return;
    topbarEnsureTimer = setTrackedTimeout(() => {
      topbarEnsureTimer = 0;
      syncHeaderActionsReserve(reason);
      ensureTopbarActionsInline(reason);
    }, 40);
  }

  function installTopbarRouteSync() {
    topbarRouteKey = currentRouteKey();
    if (topbarRouteBound) return;
    const core = getChatGptCore();
    if (core && typeof core.onRouteChange === 'function') {
      const off = core.onRouteChange(() => {
        topbarRouteKey = currentRouteKey();
        enterTopbarRouteRecovery();
        runTopbarStartupPasses('route');
      });
      trackOff(() => {
        topbarRouteBound = false;
        try {
          off();
        } catch {}
      });
      topbarRouteBound = true;
      return;
    }
    if (!topbarRoutePollTimer) {
      topbarRoutePollTimer = window.setInterval(() => {
        const nextKey = currentRouteKey();
        const changed = !!nextKey && nextKey !== topbarRouteKey;
        if (changed) topbarRouteKey = nextKey;
        if (changed) enterTopbarRouteRecovery();
        if (!changed && !topbarNeedsRepair() && !isTopbarRouteRecovering()) return;
        runTopbarStartupPasses(changed ? 'route-poll' : 'repair-poll');
      }, 900);
      trackOff(() => {
        if (topbarRoutePollTimer) {
          try {
            clearInterval(topbarRoutePollTimer);
          } catch {}
          topbarRoutePollTimer = 0;
        }
      });
    }
  }

  function runTopbarStartupPasses(reason = 'startup') {
    for (const delay of TOPBAR_STARTUP_DELAYS_MS) {
      if (delay <= 0) scheduleTopbarEnsure(reason);
      else setTrackedTimeout(() => scheduleTopbarEnsure(`${reason}+${delay}`), delay);
    }
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
.${TOPBAR_INLINE_MODEL_ROW_CLASS} ${TOPBAR_MODEL_SELECTOR}{
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
.${TOPBAR_MODEL_BADGE_BUTTON_CLASS}{
	  display: inline-flex !important;
	  align-items: center !important;
	  justify-content: center !important;
	  min-height: 28px !important;
	  padding: 0 10px !important;
	  margin-inline-end: ${TOPBAR_MIN_GAP_PX}px !important;
	  border-radius: 999px !important;
	  border: none !important;
	  background: color-mix(in srgb, var(--main-surface-secondary, rgba(255,255,255,0.08)) 78%, transparent) !important;
	  color: var(--text-secondary, rgba(255,255,255,0.78)) !important;
	  font-size: 12px !important;
	  font-weight: 600 !important;
	  letter-spacing: 0.01em !important;
	  line-height: 1 !important;
	  white-space: nowrap !important;
	  user-select: none !important;
	  pointer-events: auto !important;
	  cursor: pointer !important;
	  transition: background-color .16s ease, color .16s ease, opacity .16s ease !important;
}
.${TOPBAR_MODEL_BADGE_BUTTON_CLASS}:hover{
	  background: color-mix(in srgb, var(--main-surface-secondary, rgba(255,255,255,0.12)) 88%, transparent) !important;
	  color: var(--text-primary, rgba(255,255,255,0.92)) !important;
}
.${TOPBAR_MODEL_BADGE_BUTTON_CLASS}.is-busy,
.${TOPBAR_MODEL_BADGE_BUTTON_CLASS}[aria-busy=\"true\"]{
	  opacity: .72 !important;
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
.${HEADER_ACTIONS_RESERVE_CLASS}{
	  margin-inline-end: var(${HEADER_ACTIONS_RESERVE_CSS_VAR}, 0px) !important;
	  overflow: visible !important;
}
.${HEADER_ACTIONS_RESERVE_CLASS} [data-testid="thread-header-right-actions"],
.${HEADER_ACTIONS_RESERVE_CLASS} #conversation-header-actions{
	  overflow: visible !important;
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
  addTrackedListener(document, 'pointerup', rememberTopbarModelSelectionFromEvent, true);
  addTrackedListener(document, 'click', rememberTopbarModelSelectionFromEvent, true);
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
	    clearHeaderActionsReserve(headerActionsReservedEl);
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
