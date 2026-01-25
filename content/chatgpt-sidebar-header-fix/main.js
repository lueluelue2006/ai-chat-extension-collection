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

  const STYLE_ID = 'qn-chatgpt-sidebar-header-fix-style';

  // === Rapid-toggle misclick guard ===
  // ChatGPT sidebar transitions can take a couple hundred ms (DOM re-render + CSS transition).
  // Keep the guard window slightly longer to fully cover rapid-click scenarios.
  const LOCK_MS = 220;
  const LOCK_CLASS = 'qn-chatgpt-sidebar-header-fix-lock';
  const FORCE_EXPANDED_CLASS = 'qn-chatgpt-sidebar-header-fix-force-expanded';
  const root = document.documentElement;
  let lockUntil = 0;
  let unlockTimer = 0;

  function setTransientLock(ms, { forceExpanded = null } = {}) {
    const now = Date.now();
    const duration = typeof ms === 'number' && ms > 0 ? ms : LOCK_MS;
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
        '#stage-slideover-sidebar a[href="/"], #stage-slideover-sidebar a[href="https://chatgpt.com/"], #stage-slideover-sidebar a[href="https://chatgpt.com"]'
      );
      if (homeOrNewChatLink) return true;

      // 2) Sidebar New chat button/link (ChatGPT may render 1-2 variants).
      const newChat = target.closest(
        '#stage-slideover-sidebar [data-testid="create-new-chat-button"], #stage-slideover-sidebar [aria-label*="new chat" i]'
      );
      if (newChat) return true;

      return false;
    } catch {
      return false;
    }
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
        const toggle = t.closest('button[aria-controls="stage-slideover-sidebar"]');
        if (!toggle) return;
        const ariaLabel = String(toggle.getAttribute('aria-label') || '');
        if (/open sidebar/i.test(ariaLabel)) setTransientLock(LOCK_MS, { forceExpanded: true });
        else if (/close sidebar/i.test(ariaLabel)) setTransientLock(LOCK_MS, { forceExpanded: false });
        else {
          const expanded = toggle.getAttribute('aria-expanded');
          if (expanded === 'false') setTransientLock(LOCK_MS, { forceExpanded: true });
          else setTransientLock(LOCK_MS, { forceExpanded: false });
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
html.${LOCK_CLASS} #stage-slideover-sidebar a[href="https://chatgpt.com/"],
html.${LOCK_CLASS} #stage-slideover-sidebar a[href="https://chatgpt.com"],
html.${LOCK_CLASS} #stage-slideover-sidebar [data-testid="create-new-chat-button"],
html.${LOCK_CLASS} #stage-slideover-sidebar [aria-label*="new chat" i]{
  pointer-events: none !important;
  cursor: default !important;
}

/* During expand transition, force the swapped layout early for a few frames. */
html.${FORCE_EXPANDED_CLASS} #stage-slideover-sidebar .h-header-height.flex.items-center.justify-between{
  flex-direction: row-reverse !important;
}

/* Treat the "Open sidebar" control as the authoritative top-left toggle. */
#stage-slideover-sidebar button[aria-controls="stage-slideover-sidebar"][aria-expanded="false"]{
  position: relative !important;
  z-index: 5 !important;
}

/* Collapsed rail: show Open, hide Home, hide Close (avoid icon morph). */
#stage-slideover-sidebar[style*="--sidebar-rail-width"] button[aria-controls="stage-slideover-sidebar"][aria-expanded="false"]{
  opacity: 1 !important;
  pointer-events: auto !important;
}
#stage-slideover-sidebar[style*="--sidebar-rail-width"] .h-header-height.flex.items-center.justify-between > a[href="/"]{
  opacity: 0 !important;
  pointer-events: none !important;
}
#stage-slideover-sidebar[style*="--sidebar-rail-width"] button[aria-controls="stage-slideover-sidebar"][aria-expanded="true"]{
  opacity: 0 !important;
  pointer-events: none !important;
}
#stage-slideover-sidebar[style*="--sidebar-rail-width"] button[data-testid="close-sidebar-button"]{
  opacity: 0 !important;
  pointer-events: none !important;
}

/* Expanded: hide Open (so hover doesn't reveal it), and swap header so Close is on the left. */
#stage-slideover-sidebar[style*="--sidebar-width"] button[aria-controls="stage-slideover-sidebar"][aria-expanded="false"]{
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
      try {
        const el = document.getElementById('stage-slideover-sidebar');
        const s = String(el?.getAttribute?.('style') || '');
        if (s.includes('--sidebar-width')) return 'expanded';
        if (s.includes('--sidebar-rail-width')) return 'rail';
      } catch {}
      return '';
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
        setTransientLock(LOCK_MS);
      });
      mo.observe(sidebar, { attributes: true, attributeFilter: ['style'] });
      sidebar.__qnSidebarHeaderFixMo = mo;
    };

    install();
    setTimeout(install, 800);
    setTimeout(install, 2000);
  } catch {}
})();
