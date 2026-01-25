(() => {
  'use strict';

  // ChatGPT sidebar header fix:
  // - Keep the top-left control always as sidebar toggle (no "logo morph" on hover).
  // - When sidebar is expanded, swap header controls so: [Close sidebar] on the left, [Home/New chat] on the right.
  //
  // Keep it lightweight & robust:
  // - Pure CSS based on `#stage-slideover-sidebar` inline width (rail vs expanded).
  // - No MutationObserver (avoid extra watchers + survives DOM re-renders).

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

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* Sidebar header controls swap + overlap fix (ChatGPT 2025/2026 UI). */

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
})();
