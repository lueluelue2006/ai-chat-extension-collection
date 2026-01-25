(() => {
  'use strict';

  // ChatGPT sidebar header fix:
  // - Keep the top-left control always as sidebar toggle (no "logo morph" on hover).
  // - When sidebar is expanded, swap header controls so: [Close sidebar] on the left, [Home/New chat] on the right.
  // - Add a tiny click-guard during rapid toggle to prevent accidental "New chat" clicks before swap settles.
  //
  // Keep it lightweight & robust:
  // - Pure CSS based on `#stage-slideover-sidebar` inline width (rail vs expanded).
  // - No global MutationObserver: at most a tiny attribute watcher on the sidebar style.

  const FLAG = '__quicknavChatgptSidebarHeaderFixV1__';
  try {
    if (globalThis[FLAG]) return;
    Object.defineProperty(globalThis, FLAG, { value: true, configurable: true });
  } catch {
    try {
      if (globalThis[FLAG]) return;
      globalThis[FLAG] = true;
    } catch {}
  }

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
  const root = document.documentElement;
  let lockUntil = 0;
  let unlockTimer = 0;

  let intentMode = '';
  let intentAt = 0;
  let intentSyncTimer = 0;

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

    if (unlockTimer) clearTimeout(unlockTimer);
    const delay = Math.min(Math.max(0, lockUntil - now + 20), 500);
    unlockTimer = setTimeout(() => {
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
      clearTimeout(intentSyncTimer);
      intentSyncTimer = 0;
    }
  }

  function scheduleIntentSync() {
    if (intentSyncTimer) return;
    intentSyncTimer = setTimeout(() => {
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
  document.addEventListener(
    'pointerdown',
    (e) => {
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
    },
    true
  );

  document.addEventListener(
    'click',
    (e) => {
      try {
        if (!isLocked()) return;
        if (!isGuardedClickTarget(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch {}
    },
    true
  );

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
	`;
	    (document.head || document.documentElement).appendChild(style);
	  }

  ensureStyle();

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
	      const mo = new MutationObserver(() => {
	        const next = getMode();
	        if (!next || next === lastMode) return;
	        lastMode = next;
	        // Baseline: 0.1s, extended by intent sync if needed.
	        setTransientLock(LOCK_BASE_MS);
	      });
	      mo.observe(sidebar, { attributes: true, attributeFilter: ['style'] });
	      sidebar.__qnSidebarHeaderFixMo = mo;
	    };

	    install();
	    setTimeout(install, 800);
	    setTimeout(install, 2000);
	  } catch {}
	})();
