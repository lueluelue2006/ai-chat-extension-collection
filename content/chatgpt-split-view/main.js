(() => {
  'use strict';

  // ChatGPT split-view (experimental)
  // - Optional right-side ChatGPT iframe pane with draggable divider
  // - "Ask" bubble on text selection to quote into the right pane
  //
  // Design goals:
  // - Disabled by default (opt-in module)
  // - When closed, should not affect normal usage (minimal DOM/CSS, no layout rewrites)

  const FLAG = '__quicknavChatgptSplitViewV1';
  const __qnMaybeHasUi = () => {
    try {
      return !!(document.getElementById('qn-split-root') || document.getElementById('qn-split-handle'));
    } catch {
      return false;
    }
  };
  try {
    // If we already ran and the UI exists, bail out.
    // If we ran but failed early (e.g. injected too early before <html>/<body> exists),
    // allow re-entry so we can self-heal and mount the UI.
    if (globalThis[FLAG] && __qnMaybeHasUi()) return;
    Object.defineProperty(globalThis, FLAG, { value: true, configurable: true });
  } catch {
    try {
      if (globalThis[FLAG] && __qnMaybeHasUi()) return;
      globalThis[FLAG] = true;
    } catch {}
  }

  const STORE_NS = 'chatgpt-split-view';
  const OPEN_KEY = `${STORE_NS}:open`;
  const WIDTH_KEY = `${STORE_NS}:rightWidthPx`;
  const SRC_KEY = `${STORE_NS}:src`;

  const STYLE_ID = 'qn-split-style';
  const ROOT_ID = 'qn-split-root';
  const PANE_ID = 'qn-split-pane';
  const DIVIDER_ID = 'qn-split-divider';
  const HANDLE_ID = 'qn-split-handle';
  const IFRAME_ID = 'qn-split-iframe';
  const TOPBAR_ID = 'qn-split-topbar';
  const ASK_ID = 'qn-split-ask';

  const BLANK_SRC = 'about:blank';
  const IFRAME_TWEAK_STYLE_ID = 'qn-split-iframe-tweaks';

  const MULTI_ESC_WINDOW_MS = 600;
  const CLOSE_ESC_PRESS_COUNT = 3;
  const CLOSE_REQUEST_MESSAGE_TYPE = '__qn_split_close_request_v1__';

  const DEFAULT_RIGHT_WIDTH_PX = 560;
  const MIN_RIGHT_WIDTH_PX = 320;
  const MAX_RIGHT_WIDTH_RATIO = 0.7;

  // Auto-expand the iframe (right pane) *internal* ChatGPT sidebar when the split pane becomes wide enough.
  // This makes the right pane feel more like a full ChatGPT tab when you drag the divider left.
  const IFRAME_AUTO_SIDEBAR_ENABLED = true;
  const IFRAME_AUTO_SIDEBAR_WIDTH_PX = 260; // ChatGPT expanded sidebar is ~260px
  const IFRAME_AUTO_SIDEBAR_MIN_MAIN_PX = 480; // avoid making the chat area too cramped
  const IFRAME_AUTO_SIDEBAR_OPEN_THRESHOLD_PX = IFRAME_AUTO_SIDEBAR_WIDTH_PX + IFRAME_AUTO_SIDEBAR_MIN_MAIN_PX; // 740px
  const IFRAME_AUTO_SIDEBAR_HYSTERESIS_PX = 80;
  const IFRAME_AUTO_SIDEBAR_COOLDOWN_MS = 260;

  const DEFAULT_IFRAME_SRC = 'https://chatgpt.com/';
  const SELECTION_MAX_CHARS = 1600;
  const UNLOAD_IFRAME_ON_CLOSE = true;
  const DESTROY_IFRAME_ON_CLOSE = true;

  let desiredOpen = false;
  let __qnSplitGuardsActive = false;
  let __qnSplitHtmlMo = null;
  let __qnSplitBodyMo = null;
  let __qnSplitRootMo = null;
  let __qnSplitCurrentRoot = null;
  let __qnSplitGuardTimer = 0;

  let __qnSplitIframeSidebarWanted = null; // boolean | null
  let __qnSplitIframeSidebarPending = null; // boolean | null
  let __qnSplitIframeSidebarTimer = 0;
  let __qnSplitIframeSidebarLastAt = 0;

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const BLOCK_TAGS = new Set([
    'P',
    'DIV',
    'LI',
    'TR',
    'TD',
    'TH',
    'SECTION',
    'ARTICLE',
    'HEADER',
    'FOOTER',
    'ASIDE',
    'MAIN',
    'NAV',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'PRE',
    'BLOCKQUOTE'
  ]);

  function readNumber(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  }

  function readBool(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return fallback;
      return raw === '1';
    } catch {
      return fallback;
    }
  }

  function writeBool(key, val) {
    try {
      window.localStorage.setItem(key, val ? '1' : '0');
    } catch {}
  }

  function readString(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return typeof raw === 'string' && raw ? raw : fallback;
    } catch {
      return fallback;
    }
  }

  function writeString(key, val) {
    try {
      if (!val) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, String(val));
    } catch {}
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* Split view overlay (right side) */
#${ROOT_ID}{ position:fixed; inset:0; z-index:2147483590; pointer-events:none; }


/* When open, reposition QuickNav to stay on the left side of the divider. */
html.qn-split-open #cgpt-compact-nav{
  right: calc(var(--qn-split-right-width, 0px) + 10px) !important;
}

/* When open, keep the Conversation Tree panel/toggle on the left side as well. */
html.qn-split-open #__aichat_chatgpt_message_tree_panel_v1__,
html.qn-split-open #__aichat_chatgpt_message_tree_toggle_v1__{
  right: calc(var(--qn-split-right-width, 0px) + 12px) !important;
}

/* Keep fixed bottom-right micro UIs on the left side while split view is open. */
html.qn-split-open #__aichat_chatgpt_reply_timer_el_v1__{
  right: calc(var(--qn-split-right-width, 0px) + 2px) !important;
}

#${PANE_ID}{
  position:absolute;
  top:0; right:0; bottom:0;
  width: var(--qn-split-right-width, ${DEFAULT_RIGHT_WIDTH_PX}px);
  min-width:${MIN_RIGHT_WIDTH_PX}px;
  max-width:${Math.round(MAX_RIGHT_WIDTH_RATIO * 100)}vw;
  background: var(--token-main-surface, #fff);
  border-left:2px solid rgba(59,130,246,0.92);
  box-shadow: -14px 0 44px rgba(0,0,0,0.12), -1px 0 0 rgba(59,130,246,0.18);
  pointer-events:auto;
  display:none;
}
#${PANE_ID}[data-open="1"]{ display:block; }

#${TOPBAR_ID}{
  position:absolute;
  /* Stick to the top edge (respect safe-area insets on notched displays). */
  top: env(safe-area-inset-top);
  right: env(safe-area-inset-right);
  display:flex;
  gap:6px;
  z-index:2;
}
#${TOPBAR_ID} button{
  appearance:none;
  border:1px solid rgba(148,163,184,0.55);
  background: rgba(255,255,255,0.88);
  color:#0f172a;
  border-radius:10px;
  padding:6px 10px;
  font-size:12px;
  line-height:1;
  cursor:pointer;
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 18px rgba(0,0,0,0.08);
}
#${TOPBAR_ID} button:hover{ border-color: rgba(59,130,246,0.6); }
#${TOPBAR_ID} button:active{ transform: translateY(1px); }

#${IFRAME_ID}{ width:100%; height:100%; border:0; display:block; background:#fff; }

#${DIVIDER_ID}{
  position:absolute;
  top:0; bottom:0;
  right: calc(var(--qn-split-right-width, ${DEFAULT_RIGHT_WIDTH_PX}px) - 5px);
  width: 10px;
  cursor: col-resize;
  pointer-events:auto;
  display:none;
}
html.qn-split-open #${DIVIDER_ID}{ display:block; }
#${DIVIDER_ID}::after{
  content:'';
  position:absolute;
  top:0; bottom:0;
  left:4px;
  width:2px;
  background: rgba(59,130,246,0.9);
  box-shadow: 0 0 0 1px rgba(59,130,246,0.25);
}
html.qn-split-drag *{ cursor: col-resize !important; user-select:none !important; }

/* Auto-hide ChatGPT left sidebar (only when we explicitly opt-in per-session). */
html.qn-split-open.qn-split-hide-left-sidebar #stage-slideover-sidebar > div > div:not(#stage-sidebar-tiny-bar){
  display: none !important;
}

/* Closed-state handle */
#${HANDLE_ID}{
  position:fixed;
  top:45%;
  right:0;
  width:14px;
  height:64px;
  border-radius:12px 0 0 12px;
  background: rgba(59,130,246,0.88);
  box-shadow: -8px 0 28px rgba(0,0,0,0.18);
  pointer-events:auto;
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
}
#${HANDLE_ID}::before{
  content:'\u21d4';
  font-size:12px;
  color:#fff;
  transform: rotate(90deg);
  opacity:0.95;
}
html.qn-split-open #${HANDLE_ID}{ display:none; }

/* Selection bubble */
#${ASK_ID}{
  position:fixed;
  z-index:2147483605;
  display:none;
  pointer-events:auto;
  border:1px solid rgba(2,132,199,0.45);
  background: rgba(14,165,233,0.92);
  color:#fff;
  border-radius:999px;
  padding:6px 10px;
  font-size:12px;
  line-height:1;
  box-shadow: 0 10px 26px rgba(0,0,0,0.16);
  backdrop-filter: blur(10px);
}
#${ASK_ID}[data-open="1"]{ display:block; }
#${ASK_ID}:hover{ background: rgba(2,132,199,0.95); }
#${ASK_ID}:active{ transform: translateY(1px); }
`;
    const mount = document.head || document.documentElement;
    if (!mount) return;
    mount.appendChild(style);
  }

  function normalizeChatgptUrl(input) {
    const raw = String(input || '').trim();
    if (!raw || raw === BLANK_SRC) return DEFAULT_IFRAME_SRC;
    try {
      const u = new URL(raw, location.href);
      if (u.protocol !== 'https:') return DEFAULT_IFRAME_SRC;
      if (u.origin !== location.origin) return DEFAULT_IFRAME_SRC;
      return u.href;
    } catch {
      return DEFAULT_IFRAME_SRC;
    }
  }

  function resolveRightPaneUrl() {
    try {
      const pane = document.getElementById(PANE_ID);
      const iframe = pane && pane.querySelector && pane.querySelector(`#${IFRAME_ID}`);
      if (iframe) {
        try {
          const href = String(iframe.contentWindow?.location?.href || '').trim();
          if (href && href !== BLANK_SRC) return normalizeChatgptUrl(href);
        } catch {}
        try {
          const src = String(iframe.getAttribute('src') || iframe.src || '').trim();
          if (src && src !== BLANK_SRC) return normalizeChatgptUrl(src);
        } catch {}
        return normalizeChatgptUrl(getDesiredIframeSrc(iframe));
      }
    } catch {}
    return normalizeChatgptUrl(readString(SRC_KEY, DEFAULT_IFRAME_SRC));
  }

  function openRightPaneInNewTab({ close = true } = {}) {
    const url = resolveRightPaneUrl();
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {}
    if (close) closeSplit();
  }

  function createSplitIframe() {
    const iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    // IMPORTANT: don't load ChatGPT until the user actually opens split view.
    // This avoids doubling memory/CPU just by enabling the module.
    iframe.src = BLANK_SRC;
    try {
      iframe.loading = 'lazy';
    } catch {}
    setDesiredIframeSrc(iframe, readString(SRC_KEY, DEFAULT_IFRAME_SRC));
    iframe.addEventListener(
      'load',
      () => {
        try {
          if (!document.documentElement.classList.contains('qn-split-open')) return;
          void ensureIframeTweaks();
        } catch {}
      },
      true
    );
    return iframe;
  }

  function ensurePaneIframe(pane) {
    if (!pane) return null;
    let iframe = pane.querySelector(`#${IFRAME_ID}`);
    if (iframe) return iframe;
    iframe = createSplitIframe();
    pane.appendChild(iframe);
    return iframe;
  }

  function destroyPaneIframe(pane) {
    if (!pane) return false;
    const iframe = pane.querySelector(`#${IFRAME_ID}`);
    if (!iframe) return false;
    try {
      iframe.src = BLANK_SRC;
    } catch {}
    try {
      iframe.remove();
    } catch {
      try {
        pane.removeChild(iframe);
      } catch {}
    }
    return true;
  }

  function getDesiredIframeSrc(iframe) {
    try {
      const v = String(iframe?.dataset?.qnDesiredSrc || '').trim();
      if (v) return v;
    } catch {}
    return readString(SRC_KEY, DEFAULT_IFRAME_SRC);
  }

  function setDesiredIframeSrc(iframe, url) {
    const v = String(url || '').trim();
    if (!v) return;
    try {
      if (iframe) iframe.dataset.qnDesiredSrc = v;
    } catch {}
    writeString(SRC_KEY, v);
  }

  function ensureIframeLoaded(iframe) {
    if (!iframe) return false;
    const desired = getDesiredIframeSrc(iframe);
    if (!desired) return false;
    const current = String(iframe.getAttribute('src') || iframe.src || '').trim();
    if (!current || current === BLANK_SRC) {
      try {
        iframe.src = desired;
      } catch {
        return false;
      }
    }
    return true;
  }

  function unloadIframe(iframe) {
    if (!iframe) return;
    try {
      const current = String(iframe.getAttribute('src') || iframe.src || '').trim();
      if (!current || current === BLANK_SRC) return;
      iframe.src = BLANK_SRC;
    } catch {}
  }

  function getMaxRightWidthPx() {
    return Math.max(MIN_RIGHT_WIDTH_PX, Math.floor(window.innerWidth * MAX_RIGHT_WIDTH_RATIO));
  }

  function loadRightWidthPx() {
    const max = getMaxRightWidthPx();
    const n = Math.round(readNumber(WIDTH_KEY, DEFAULT_RIGHT_WIDTH_PX));
    return clamp(n, MIN_RIGHT_WIDTH_PX, max);
  }

  function applyRightWidthPx(px) {
    const max = getMaxRightWidthPx();
    const v = clamp(Math.round(px), MIN_RIGHT_WIDTH_PX, max);
    try {
      document.documentElement.style.setProperty('--qn-split-right-width', `${v}px`);
    } catch {}
    try {
      window.localStorage.setItem(WIDTH_KEY, String(v));
    } catch {}
    try {
      scheduleIframeSidebarAutoByWidth(v);
    } catch {}
    return v;
  }

  function resetIframeSidebarAutoState() {
    __qnSplitIframeSidebarWanted = null;
    __qnSplitIframeSidebarPending = null;
    if (__qnSplitIframeSidebarTimer) {
      try {
        clearTimeout(__qnSplitIframeSidebarTimer);
      } catch {}
      __qnSplitIframeSidebarTimer = 0;
    }
  }

  function getIframeSidebarState(iframe) {
    let doc;
    try {
      doc = iframe?.contentDocument;
    } catch {
      return 'unknown';
    }
    if (!doc) return 'unknown';

    // Desktop layout: a persistent sidebar container with width toggled between rail/expanded.
    let stage = null;
    try {
      stage = doc.getElementById('stage-slideover-sidebar');
    } catch {}
    if (stage) {
      try {
        const w = String(stage.style.width || '').trim();
        if (w.includes('--sidebar-width')) return 'expanded';
        if (w.includes('--sidebar-rail-width')) return 'collapsed';
      } catch {}

      try {
        const px = stage.getBoundingClientRect?.().width || 0;
        if (px >= 140) return 'expanded';
        if (px > 0) return 'collapsed';
      } catch {}

      return 'unknown';
    }

    // Compact layout: popover sidebar that is mounted only when open.
    try {
      const pop = doc.getElementById('stage-popover-sidebar');
      if (pop) return 'expanded';
    } catch {}

    try {
      const openBtn = doc.querySelector('button[data-testid="open-sidebar-button"]');
      if (openBtn) {
        const expanded = openBtn.getAttribute('aria-expanded') === 'true';
        return expanded ? 'expanded' : 'collapsed';
      }
    } catch {}

    return 'unknown';
  }

  function clickEl(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      el.click();
      return true;
    } catch {
      return false;
    }
  }

  function syncIframeSidebarExpanded(expanded) {
    if (!IFRAME_AUTO_SIDEBAR_ENABLED) return false;
    if (!document.documentElement.classList.contains('qn-split-open')) return false;

    const iframe = document.getElementById(IFRAME_ID);
    if (!iframe) return false;

    let doc;
    try {
      doc = iframe.contentDocument;
    } catch {
      return false;
    }
    if (!doc) return false;

    try {
      const href = String(doc.location?.href || '');
      if (!href || href === BLANK_SRC) return false;
    } catch {}

    const state = getIframeSidebarState(iframe);
    if (expanded && state === 'expanded') return true;
    if (!expanded && state === 'collapsed') return true;
    if (state !== 'expanded' && state !== 'collapsed') return false;

    // Prefer locale-agnostic selectors.
    const openBtnSelector =
      'button[data-testid="open-sidebar-button"][aria-expanded="false"],' +
      '#stage-sidebar-tiny-bar button[aria-controls="stage-slideover-sidebar"],' +
      '#stage-slideover-sidebar button[aria-controls="stage-slideover-sidebar"][aria-expanded="false"]:not([data-testid="close-sidebar-button"]),' +
      'button[aria-label="Open sidebar"]';
    const closeBtnSelector =
      'button[data-testid="close-sidebar-button"],' +
      '#stage-slideover-sidebar button[aria-controls="stage-slideover-sidebar"][aria-expanded="true"],' +
      'button[aria-label="Close sidebar"]';

    if (expanded && state === 'collapsed') {
      const btn = doc.querySelector(openBtnSelector);
      return clickEl(btn);
    }
    if (!expanded && state === 'expanded') {
      const btn = doc.querySelector(closeBtnSelector);
      return clickEl(btn);
    }
    return false;
  }

  function scheduleIframeSidebarAutoByWidth(rightWidthPx) {
    if (!IFRAME_AUTO_SIDEBAR_ENABLED) return;
    if (!document.documentElement.classList.contains('qn-split-open')) return;

    const max = getMaxRightWidthPx();
    const w = clamp(Math.round(rightWidthPx), MIN_RIGHT_WIDTH_PX, max);

    const openAt = IFRAME_AUTO_SIDEBAR_OPEN_THRESHOLD_PX;
    const closeAt = openAt - IFRAME_AUTO_SIDEBAR_HYSTERESIS_PX;

    let next = null;
    if (__qnSplitIframeSidebarWanted === true) {
      if (w <= closeAt) next = false;
    } else if (__qnSplitIframeSidebarWanted === false) {
      if (w >= openAt) next = true;
    } else {
      if (w >= openAt) next = true;
      else if (w <= closeAt) next = false;
    }
    if (typeof next !== 'boolean') return;

    __qnSplitIframeSidebarWanted = next;
    __qnSplitIframeSidebarPending = next;

    const now = Date.now();
    const delay = Math.max(120, (__qnSplitIframeSidebarLastAt + IFRAME_AUTO_SIDEBAR_COOLDOWN_MS) - now);

    if (__qnSplitIframeSidebarTimer) {
      try {
        clearTimeout(__qnSplitIframeSidebarTimer);
      } catch {}
      __qnSplitIframeSidebarTimer = 0;
    }

    __qnSplitIframeSidebarTimer = setTimeout(() => {
      __qnSplitIframeSidebarTimer = 0;
      const desired = __qnSplitIframeSidebarPending;
      __qnSplitIframeSidebarPending = null;
      if (typeof desired !== 'boolean') return;

      __qnSplitIframeSidebarLastAt = Date.now();
      try {
        syncIframeSidebarExpanded(desired);
      } catch {}
    }, delay);
  }

  function findTexFromKatex(katexEl) {
    // Avoid `instanceof Element` here: in extension isolated worlds, DOM wrappers can be cross-realm.
    if (!katexEl || katexEl.nodeType !== 1) return null;
    try {
      const ann = katexEl.querySelector('annotation[encoding="application/x-tex"], annotation');
      const raw = String(ann?.textContent || '').trim();
      if (!raw) return null;
      const isDisplay = katexEl.classList.contains('katex-display');
      return isDisplay ? `$$${raw}$$` : `$${raw}$`;
    } catch {
      return null;
    }
  }

  function transformFragmentForText(frag) {
    if (!frag || typeof frag.querySelectorAll !== 'function') return false;
    let changed = false;

    // Prefer replacing the full KaTeX root to avoid duplicated text (katex-html + katex-mathml).
    const roots = frag.querySelectorAll('.katex');
    for (const el of Array.from(roots)) {
      const tex = findTexFromKatex(el);
      if (!tex) continue;
      try {
        el.replaceWith(document.createTextNode(tex));
        changed = true;
      } catch {}
    }

    // Fallback: some ranges clone only KaTeX internals (no `.katex` wrapper). Handle `.katex-mathml`.
    const mathmlList = frag.querySelectorAll('.katex-mathml');
    for (const el of Array.from(mathmlList)) {
      try {
        if (el.closest && el.closest('.katex')) continue; // already handled via root replacement
      } catch {}

      const parent = el.parentNode;
      let raw = '';
      try {
        const ann = el.querySelector('annotation[encoding="application/x-tex"], annotation');
        raw = String(ann?.textContent || '').trim();
      } catch {}
      if (!raw) continue;

      let isDisplay = false;
      try {
        isDisplay = !!(el.closest && el.closest('.katex-display'));
      } catch {}
      const tex = isDisplay ? `$$${raw}$$` : `$${raw}$`;

      try {
        el.replaceWith(document.createTextNode(tex));
        changed = true;
      } catch {}

      // Best-effort: remove possible `.katex-html` siblings in the same subtree to avoid duplicates.
      try {
        if (parent && parent.nodeType === 1 && parent.querySelectorAll) {
          for (const sib of Array.from(parent.querySelectorAll('.katex-html'))) sib.remove();
        }
      } catch {}
    }

    return changed;
  }

  function fragmentTextWithNewlines(root) {
    let out = '';
    const ensureTrailingNewline = () => {
      if (out && !out.endsWith('\n')) out += '\n';
    };

    const walk = (node) => {
      if (!node) return;
      const t = node.nodeType;

      // Text node
      if (t === 3) {
        out += node.nodeValue || '';
        return;
      }

      // Element / Fragment
      if (t !== 1 && t !== 11) return;

      if (t === 1) {
        const tag = node.tagName;
        if (tag === 'BR') {
          out += '\n';
          return;
        }

        const isBlock = BLOCK_TAGS.has(tag);
        if (isBlock) ensureTrailingNewline();
        for (const child of Array.from(node.childNodes || [])) walk(child);
        if (isBlock) ensureTrailingNewline();
        return;
      }

      // DocumentFragment
      for (const child of Array.from(node.childNodes || [])) walk(child);
    };

    walk(root);
    return String(out)
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function selectionToCleanText(sel) {
    try {
      if (!sel || sel.rangeCount <= 0) return '';
      const range = sel.getRangeAt(0);
      if (!range) return String(sel.toString() || '').trim();

      const frag = range.cloneContents();
      transformFragmentForText(frag);
      return fragmentTextWithNewlines(frag);
    } catch {
      return String(sel?.toString?.() || '').trim();
    }
  }

  function applyDomOpenState(on) {
    const pane = document.getElementById(PANE_ID);
    if (pane) pane.dataset.open = on ? '1' : '0';
    try {
      document.documentElement.classList.toggle('qn-split-open', !!on);
    } catch {}
  }

  function setOpen(open) {
    const on = !!open;
    desiredOpen = on;
    applyDomOpenState(on);
    writeBool(OPEN_KEY, on);
    try {
      setSplitGuardsActive(on);
    } catch {}
  }

  function scheduleSplitGuardRepair() {
    try {
      if (!desiredOpen) return;
      if (__qnSplitGuardTimer) return;
      __qnSplitGuardTimer = window.setTimeout(() => {
        __qnSplitGuardTimer = 0;
        if (!desiredOpen) return;

        // 1) Some sites rewrite `html.className` (theme, etc.). Keep our open flag stable.
        try {
          if (!document.documentElement.classList.contains('qn-split-open')) applyDomOpenState(true);
        } catch {}

        // 2) The host container can get its inline styles reset by SPA re-renders.
        try { ensureHostLayout(true); } catch {}

        // 3) The UI nodes might get removed. Recreate if missing.
        try {
          const missing =
            !document.getElementById(ROOT_ID) ||
            !document.getElementById(PANE_ID) ||
            !document.getElementById(DIVIDER_ID) ||
            !document.getElementById(HANDLE_ID) ||
            !document.getElementById(ASK_ID);
          if (missing) {
            const ui = ensureUI();
            applyRightWidthPx(loadRightWidthPx());
            applyDomOpenState(true);
            const iframe = ensurePaneIframe(ui.pane);
            ensureIframeLoaded(iframe);
            void ensureIframeTweaks();
          }
        } catch {}

        // 4) Root swap: reattach root observer.
        try {
          const nextRoot = findHostAppRoot();
          if (nextRoot && nextRoot !== __qnSplitCurrentRoot) {
            try { __qnSplitRootMo && __qnSplitRootMo.disconnect(); } catch {}
            __qnSplitCurrentRoot = nextRoot;
            if (typeof MutationObserver === 'function') {
              __qnSplitRootMo = new MutationObserver(() => {
                if (!desiredOpen) return;
                ensureHostLayout(true);
              });
              try { __qnSplitRootMo.observe(__qnSplitCurrentRoot, { attributes: true, attributeFilter: ['style', 'class'] }); } catch {}
            }
          }
        } catch {}
      }, 0);
    } catch {}
  }

  function setSplitGuardsActive(on) {
    const active = !!on;
    if (!active) {
      __qnSplitGuardsActive = false;
      try { __qnSplitHtmlMo && __qnSplitHtmlMo.disconnect(); } catch {}
      try { __qnSplitBodyMo && __qnSplitBodyMo.disconnect(); } catch {}
      try { __qnSplitRootMo && __qnSplitRootMo.disconnect(); } catch {}
      __qnSplitHtmlMo = null;
      __qnSplitBodyMo = null;
      __qnSplitRootMo = null;
      __qnSplitCurrentRoot = null;
      if (__qnSplitGuardTimer) {
        clearTimeout(__qnSplitGuardTimer);
        __qnSplitGuardTimer = 0;
      }
      return;
    }

    if (__qnSplitGuardsActive) return;
    __qnSplitGuardsActive = true;

    if (typeof MutationObserver !== 'function') return;

    try {
      const html = document.documentElement;
      if (!__qnSplitHtmlMo && html) {
        __qnSplitHtmlMo = new MutationObserver(() => {
          if (!desiredOpen) return;
          scheduleSplitGuardRepair();
        });
        __qnSplitHtmlMo.observe(html, { attributes: true, attributeFilter: ['class'] });
      }
    } catch {}

    try {
      const body = document.body;
      if (!__qnSplitBodyMo && body) {
        __qnSplitBodyMo = new MutationObserver(() => {
          if (!desiredOpen) return;
          scheduleSplitGuardRepair();
        });
        __qnSplitBodyMo.observe(body, { childList: true });
      }
    } catch {}

    scheduleSplitGuardRepair();
  }

  function ensureUI() {
    ensureStyle();

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      (document.body || document.documentElement).appendChild(root);
    }

    let pane = document.getElementById(PANE_ID);
    if (!pane) {
      pane = document.createElement('div');
      pane.id = PANE_ID;
      pane.dataset.open = '0';

      const topbar = document.createElement('div');
      topbar.id = TOPBAR_ID;

      const btnNew = document.createElement('button');
      btnNew.type = 'button';
      btnNew.textContent = 'New';
      btnNew.title = 'Open a new chat (chatgpt.com)';

      const btnTab = document.createElement('button');
      btnTab.type = 'button';
      btnTab.textContent = 'Tab';
      btnTab.title = 'Open right pane in a new tab';

      const btnClose = document.createElement('button');
      btnClose.type = 'button';
      btnClose.textContent = 'Close';
      btnClose.title = 'Close split view (Esc×3)';

      topbar.appendChild(btnNew);
      topbar.appendChild(btnTab);
      topbar.appendChild(btnClose);

      pane.appendChild(topbar);
      pane.appendChild(createSplitIframe());
      root.appendChild(pane);

      btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeSplit();
      });

      btnNew.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = DEFAULT_IFRAME_SRC;
        const currentIframe = ensurePaneIframe(pane);
        setDesiredIframeSrc(currentIframe, url);
        ensureIframeLoaded(currentIframe);
      });

      btnTab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openRightPaneInNewTab({ close: true });
      });
    }

    let divider = document.getElementById(DIVIDER_ID);
    if (!divider) {
      divider = document.createElement('div');
      divider.id = DIVIDER_ID;
      root.appendChild(divider);
    }

    let handle = document.getElementById(HANDLE_ID);
    if (!handle) {
      handle = document.createElement('div');
      handle.id = HANDLE_ID;
      handle.title = 'Open split view';
      root.appendChild(handle);
      handle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSplit();
      });
    }

    let ask = document.getElementById(ASK_ID);
    if (!ask) {
      ask = document.createElement('button');
      ask.id = ASK_ID;
      ask.type = 'button';
      ask.textContent = 'Ask';
      ask.title = 'Quote selection into the right ChatGPT pane';
      (document.body || document.documentElement).appendChild(ask);
    }

    // Divider drag logic (only when open).
    let dragging = false;
    const onDown = (e) => {
      if (!e || e.button !== 0) return;
      if (!document.documentElement.classList.contains('qn-split-open')) return;

      dragging = true;
      try {
        divider.setPointerCapture(e.pointerId);
      } catch {}
      document.documentElement.classList.add('qn-split-drag');
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e) => {
      if (!dragging) return;
      const next = window.innerWidth - (Number(e.clientX) || 0);
      applyRightWidthPx(next);
      e.preventDefault();
      e.stopPropagation();
    };

    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      document.documentElement.classList.remove('qn-split-drag');
      try {
        divider.releasePointerCapture(e.pointerId);
      } catch {}
      e.preventDefault();
      e.stopPropagation();
    };

    if (!divider.__qnBound) {
      divider.__qnBound = true;
      divider.addEventListener('pointerdown', onDown, true);
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    }

    if (!ask.__qnBound) {
      ask.__qnBound = true;
      ask.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = ask.__qnSelectionText || '';
        hideAsk();
        if (!text) return;
        openSplit();
        void prefillRightPrompt(text);
      });
    }

    return { root, pane, divider, handle, ask };
  }

  async function ensureIframeTweaks() {
    try {
      const iframe = document.getElementById(IFRAME_ID);
      if (!iframe) return false;
      const current = String(iframe.getAttribute('src') || iframe.src || '').trim();
      if (!current || current === BLANK_SRC) return false;
      await waitForIframeReady(iframe, 9000);
      const doc = iframe.contentDocument;
      if (!doc) return false;
      try {
        const href = String(doc.location?.href || '');
        if (!href || href === BLANK_SRC) return false;
      } catch {}
      const css = `
        #thread-bottom-container [class*="vt-disclaimer"],
        div.text-token-text-secondary.min-h-8.text-xs[class*="md:px-"] {
          display: none !important;
        }
      `;
      let style = doc.getElementById(IFRAME_TWEAK_STYLE_ID);
      if (!style) {
        style = doc.createElement('style');
        style.id = IFRAME_TWEAK_STYLE_ID;
        (doc.head || doc.documentElement).appendChild(style);
      }
      style.textContent = css;
      try {
        if (document.documentElement.classList.contains('qn-split-open')) {
          scheduleIframeSidebarAutoByWidth(loadRightWidthPx());
        }
      } catch {}
      return true;
    } catch {
      return false;
    }
  }


  function findHostAppRoot() {
    try {
      const main = document.getElementById('main') || document.querySelector('main');
      const root = main && main.closest && main.closest('body > div');
      if (root && root.id !== ROOT_ID) return root;
    } catch {}

    // Fallback: pick the largest body child DIV (excluding our own UI).
    try {
      let best = null;
      let bestArea = 0;
      for (const el of Array.from(document.body?.children || [])) {
        if (!el || el.nodeType !== 1) continue;
        if (el.tagName !== 'DIV') continue;
        if (el.id === ROOT_ID) continue;
        if (el.id === 'cgpt-compact-nav') continue;
        const r = el.getBoundingClientRect();
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area > bestArea) {
          best = el;
          bestArea = area;
        }
      }
      return best;
    } catch {
      return null;
    }
  }

  function restoreHostLayout(el) {
    const node = el && el.nodeType === 1 ? el : null;
    if (!node) return;
    const looksPatched = () => {
      try {
        const pr = String(node.style?.paddingRight || '').trim();
        if (!pr) return false;
        if (pr.includes('--qn-split-right-width')) return true;
        // Legacy versions might have written a literal px value instead of the CSS var.
        // Only treat "large padding-right" as ours when this node looks like the host app root.
        const m = pr.match(/^(\d+(?:\.\d+)?)px$/);
        if (!m) return false;
        const px = Number(m[1]);
        if (!Number.isFinite(px)) return false;
        if (px < MIN_RIGHT_WIDTH_PX) return false;
        if (px > getMaxRightWidthPx() + 64) return false;
        try {
          if (node.querySelector?.('#main, main, [role="main"], [data-testid="conversation-turns"], [data-message-id]')) return true;
        } catch {}
      } catch {}
      return false;
    };

    // If our dataset markers are gone (some SPA re-renders/clones), we still want to undo the padding.
    // We only touch nodes that clearly look like ours.
    try {
      if (node.dataset?.qnSplitHostPatched !== '1') {
        if (!looksPatched()) return;
        try { node.style.paddingRight = ''; } catch {}
        try { node.style.boxSizing = ''; } catch {}
        return;
      }
    } catch {
      if (!looksPatched()) return;
      try { node.style.paddingRight = ''; } catch {}
      try { node.style.boxSizing = ''; } catch {}
      return;
    }

    const prevPr = node.dataset?.qnSplitHostPrevPaddingRight ?? '';
    const prevBs = node.dataset?.qnSplitHostPrevBoxSizing ?? '';
    try { node.style.paddingRight = prevPr; } catch {}
    try { node.style.boxSizing = prevBs; } catch {}

    try {
      delete node.dataset.qnSplitHostPatched;
      delete node.dataset.qnSplitHostPrevPaddingRight;
      delete node.dataset.qnSplitHostPrevBoxSizing;
    } catch {}
  }

  function ensureHostLayout(open) {
    if (!open) {
      try {
        document.querySelectorAll('[data-qn-split-host-patched="1"]').forEach(restoreHostLayout);
      } catch {}
      // Safety net: if the SPA stripped our data marker but left the padding, clean it up.
      try {
        for (const el of Array.from(document.body?.children || [])) {
          if (!el || el.nodeType !== 1) continue;
          if (el.id === ROOT_ID) continue;
          if (el.id === 'cgpt-compact-nav') continue;
          restoreHostLayout(el);
        }
      } catch {}
      return;
    }

    const root = findHostAppRoot();
    if (!root) return;

    // ChatGPT may swap the root container during navigation; keep only one patched.
    try {
      document.querySelectorAll('[data-qn-split-host-patched="1"]').forEach((n) => {
        if (n !== root) restoreHostLayout(n);
      });
    } catch {}

    // Also clear any stray padding markers (in case a re-render dropped our dataset attributes).
    try {
      for (const el of Array.from(document.body?.children || [])) {
        if (!el || el.nodeType !== 1) continue;
        if (el === root) continue;
        if (el.id === ROOT_ID) continue;
        if (el.id === 'cgpt-compact-nav') continue;
        restoreHostLayout(el);
      }
    } catch {}

    try {
      if (root.dataset.qnSplitHostPatched === '1') {
        // Ensure it follows divider drag and remains stable.
        if (String(root.style.paddingRight || '') !== 'var(--qn-split-right-width, 0px)') {
          root.style.paddingRight = 'var(--qn-split-right-width, 0px)';
        }
        if (String(root.style.boxSizing || '') !== 'border-box') {
          root.style.boxSizing = 'border-box';
        }
        return;
      }
    } catch {}

    try {
      root.dataset.qnSplitHostPatched = '1';
      root.dataset.qnSplitHostPrevPaddingRight = root.style.paddingRight || '';
      root.dataset.qnSplitHostPrevBoxSizing = root.style.boxSizing || '';
    } catch {}

    try {
      root.style.boxSizing = 'border-box';
      root.style.paddingRight = 'var(--qn-split-right-width, 0px)';
    } catch {}
  }

  function openSplit() {
    try {
      // If the user keeps the left sidebar open, split view becomes very cramped.
      // Auto-collapse it on open, and restore it on close (only if we changed it).
      maybeAutoCollapseLeftSidebar();
    } catch {}
    const ui = ensureUI();
    const width = applyRightWidthPx(loadRightWidthPx());
    ensureHostLayout(true);
    setOpen(true);
    try {
      scheduleIframeSidebarAutoByWidth(width);
    } catch {}
    try {
      const iframe = ensurePaneIframe(ui.pane);
      ensureIframeLoaded(iframe);
    } catch {}
    void ensureIframeTweaks();
  }

  function closeSplit() {
    setOpen(false);
    ensureHostLayout(false);
    hideAsk();
    resetIframeSidebarAutoState();
    // Best-effort restore: only when we are sure we're staying closed.
    try {
      setTimeout(() => {
        if (document.documentElement.classList.contains('qn-split-open')) return;
        maybeRestoreLeftSidebar();
      }, 250);
    } catch {}
    if (!UNLOAD_IFRAME_ON_CLOSE) return;
    try {
      // Only unload after we are sure we're closed (avoid a quick toggle flicker).
      setTimeout(() => {
        if (document.documentElement.classList.contains('qn-split-open')) return;
        const pane = document.getElementById(PANE_ID);
        const iframe = pane && pane.querySelector(`#${IFRAME_ID}`);
        unloadIframe(iframe);
        if (DESTROY_IFRAME_ON_CLOSE && pane) destroyPaneIframe(pane);
      }, 250);
    } catch {}
  }

  function toggleSplit() {
    const on = document.documentElement.classList.contains('qn-split-open');
    if (on) closeSplit();
    else openSplit();
  }

  // Sidebar auto-collapse (host page only)
  let __qnSplitLeftSidebarRestoreWanted = false;
  function isVisibleEl(el) {
    try {
      if (!el) return false;
      if (el.nodeType !== 1) return false;
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const cs = window.getComputedStyle?.(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) return false;
      return true;
    } catch {
      return false;
    }
  }

  function findExpandedSidebarPanel() {
    // ChatGPT 2025/2026 UI: `#stage-slideover-sidebar` contains a tiny rail and an expanded panel sibling.
    // We hide only the expanded panel so the tiny bar remains usable.
    try {
      const panels = Array.from(
        document.querySelectorAll('#stage-slideover-sidebar > div > div:not(#stage-sidebar-tiny-bar)')
      );
      for (const el of panels) {
        const rect = el.getBoundingClientRect?.();
        if (!rect || rect.width < 120 || rect.height < 120) continue;
        return el;
      }
    } catch {}
    return null;
  }

  function maybeAutoCollapseLeftSidebar() {
    try {
      if (window !== window.top) return false;
    } catch {}

    // If the expanded panel is visible, hide it while split view is open.
    const panel = findExpandedSidebarPanel();
    if (!panel || !isVisibleEl(panel)) return false;
    try {
      document.documentElement.classList.add('qn-split-hide-left-sidebar');
      __qnSplitLeftSidebarRestoreWanted = true;
      return true;
    } catch {
      return false;
    }
  }

  function maybeRestoreLeftSidebar() {
    if (!__qnSplitLeftSidebarRestoreWanted) return false;
    __qnSplitLeftSidebarRestoreWanted = false;

    try {
      document.documentElement.classList.remove('qn-split-hide-left-sidebar');
      return true;
    } catch {
      return false;
    }
  }

  function clearSplitViewStorage() {
    try {
      const prefix = `${STORE_NS}:`;
      const keys = [];
      const n = Number(window.localStorage.length || 0);
      for (let i = 0; i < n; i++) {
        const k = window.localStorage.key(i);
        if (!k || typeof k !== 'string') continue;
        if (k.startsWith(prefix)) keys.push(k);
      }
      for (const k of keys) {
        try { window.localStorage.removeItem(k); } catch {}
      }
      return;
    } catch {}
    // Fallback (best-effort)
    try { window.localStorage.removeItem(OPEN_KEY); } catch {}
    try { window.localStorage.removeItem(WIDTH_KEY); } catch {}
    try { window.localStorage.removeItem(SRC_KEY); } catch {}
  }

  function resetSplitViewState() {
    try {
      // Force-close and fully reset the right pane (iframe + layout + persisted state).
      setOpen(false);
      ensureHostLayout(false);
      hideAsk();
      resetIframeSidebarAutoState();
    } catch {}

    try {
      const pane = document.getElementById(PANE_ID);
      const iframe = pane && pane.querySelector && pane.querySelector(`#${IFRAME_ID}`);
      try { unloadIframe(iframe); } catch {}
      try { if (pane) destroyPaneIframe(pane); } catch {}
    } catch {}

    clearSplitViewStorage();

    // Re-open with defaults so "blank/misaligned" states can be recovered in one click.
    try {
      openSplit();
    } catch {}
  }

  function registerMenuCommands() {
    try {
      if (window.__qnSplitMenuRegistered) return;
      window.__qnSplitMenuRegistered = true;
      const reg = window.__quicknavRegisterMenuCommand;
      if (typeof reg !== 'function') return;
      reg('重置右侧状态 / 清理 Split View 存储', resetSplitViewState);
      reg('在新标签页打开右侧（并关闭 Split View）', () => openRightPaneInNewTab({ close: true }));
    } catch {}
  }

  function showAskAt(rect, text) {
    const ask = ensureUI().ask;
    if (!ask) return;

    const t = String(text || '').trim();
    if (!t) return;

    ask.__qnSelectionText = t;

    const x = clamp(
      Math.round(((rect && rect.right) || 0) + 8),
      8,
      Math.max(8, window.innerWidth - 80)
    );
    const y = clamp(
      Math.round(((rect && rect.top) || 0) - 10),
      8,
      Math.max(8, window.innerHeight - 40)
    );

    ask.style.left = `${x}px`;
    ask.style.top = `${y}px`;
    ask.dataset.open = '1';
  }

  function hideAsk() {
    const ask = document.getElementById(ASK_ID);
    if (!ask) return;
    ask.dataset.open = '0';
    ask.__qnSelectionText = '';
  }

  function getSelectionInfo() {
    try {
      const sel = window.getSelection && window.getSelection();
      if (!sel || sel.rangeCount <= 0) return null;

      const text = selectionToCleanText(sel);
      if (!text) return null;
      if (text.length > SELECTION_MAX_CHARS) return null;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect && range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return null;

      // Ignore selections inside editable inputs or in our own UI.
      const node =
        sel.anchorNode &&
        (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (
        node &&
        (node.closest('textarea, input, [contenteditable="true"], [role="textbox"]') ||
          node.closest(`#${PANE_ID}`) ||
          node.closest('#cgpt-compact-nav'))
      ) {
        return null;
      }

      return { text, rect };
    } catch {
      return null;
    }
  }

  async function waitForIframeReady(iframe, timeoutMs = 8000) {
    const started = Date.now();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    while (Date.now() - started < timeoutMs) {
      try {
        const doc = iframe && iframe.contentDocument;
        const href = String(doc?.location?.href || '');
        if (doc && doc.readyState === 'complete' && href && href !== BLANK_SRC) return true;
      } catch {}
      await wait(200);
    }
    return false;
  }

  async function prefillRightPrompt(text) {
    try {
      const pane = document.getElementById(PANE_ID);
      const iframe = pane && pane.querySelector(`#${IFRAME_ID}`);
      if (!iframe) return false;

      ensureIframeLoaded(iframe);
      await waitForIframeReady(iframe, 9000);

      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) return false;

      const prompt = doc.querySelector('#prompt-textarea');
      if (!prompt) return false;

      const msg = `${String(text || '').trim()}\n\n`;

      prompt.focus();

      // Prefer execCommand to preserve newlines for contenteditable prompts.
      let ok = false;
      try {
        if (typeof doc.execCommand === 'function') {
          try {
            doc.execCommand('selectAll', false);
          } catch {}
          ok = !!doc.execCommand('insertText', false, msg);
        }
      } catch {}

      try {
        if (!ok) prompt.textContent = msg;
      } catch {}

      try {
        prompt.dispatchEvent(new Event('input', { bubbles: true }));
      } catch {
        try {
          // ignore
        } catch {}
      }

      return true;
    } catch {
      return false;
    }
  }

  function bindGlobalEvents() {
    if (window.__qnSplitBound) return;
    window.__qnSplitBound = true;

    let lastEscAt = 0;
    let escStreak = 0;

    window.addEventListener(
      'keydown',
      (e) => {
        try {
          if (!e) return;

          if (e.key === 'Escape' && document.documentElement.classList.contains('qn-split-open')) {
            if (e.repeat) return;
            const now = Date.now();
            if (now - lastEscAt < MULTI_ESC_WINDOW_MS) {
              escStreak += 1;
            } else {
              escStreak = 1;
            }
            lastEscAt = now;
            if (escStreak >= CLOSE_ESC_PRESS_COUNT) {
              lastEscAt = 0;
              escStreak = 0;
              closeSplit();
              e.preventDefault();
              e.stopPropagation();
              try {
                e.stopImmediatePropagation();
              } catch {}
              return;
            }
          }
        } catch {}
      },
      true
    );

    window.addEventListener(
      'message',
      (event) => {
        try {
          if (!event || event.origin !== location.origin) return;
          const data = event.data;
          if (!data || data.type !== CLOSE_REQUEST_MESSAGE_TYPE) return;

          // Best-effort: only allow the request from our split-view iframe.
          // In extension isolated worlds, direct WindowProxy equality can be unreliable.
          try {
            const src = event.source;
            const fe = src && src.frameElement;
            if (fe && String(fe.id || '') !== IFRAME_ID) return;
          } catch {}

          if (!document.documentElement.classList.contains('qn-split-open')) return;
          closeSplit();
        } catch {}
      },
      true
    );

    // Selection bubble: show on mouseup (avoid heavy selectionchange loops).
    document.addEventListener(
      'mouseup',
      () => {
        try {
          const info = getSelectionInfo();
          if (!info) return hideAsk();
          showAskAt(info.rect, info.text);
        } catch {
          hideAsk();
        }
      },
      true
    );

    // Hide bubble on scroll / resize.
    window.addEventListener('scroll', hideAsk, { passive: true, capture: true });
    window.addEventListener('resize', () => {
      hideAsk();
      if (document.documentElement.classList.contains('qn-split-open')) {
        applyRightWidthPx(loadRightWidthPx());
      }
    });

    // Clicking anywhere clears the bubble (unless clicking the bubble itself).
    document.addEventListener(
      'mousedown',
      (e) => {
        try {
          if (e && e.target && e.target.closest && e.target.closest(`#${ASK_ID}`)) return;
          hideAsk();
        } catch {}
      },
      true
    );
  }


  function ensureOpenStateGuards() {
    if (window.__qnSplitOpenStateGuard) return;
    window.__qnSplitOpenStateGuard = true;

    // Track desired state from storage on first run.
    try { desiredOpen = readBool(OPEN_KEY, false); } catch {}

    if (typeof MutationObserver !== 'function') return;

    // 1) Some sites rewrite `html.className` (theme, etc.). Keep our open flag stable.
    try {
      const html = document.documentElement;
      if (html) {
        let repairing = false;
        const mo = new MutationObserver(() => {
          if (repairing) return;
          if (!html) return;
          const has = html.classList.contains('qn-split-open');
          if (desiredOpen && !has) {
            repairing = true;
            applyDomOpenState(true);
            try { ensureHostLayout(true); } catch {}
            repairing = false;
          }
          if (!desiredOpen && has) {
            repairing = true;
            applyDomOpenState(false);
            try { ensureHostLayout(false); } catch {}
            repairing = false;
          }
        });
        mo.observe(html, { attributes: true, attributeFilter: ['class'] });
      }
    } catch {}

    // 2) The host container can get its inline styles reset by SPA re-renders.
    try {
      let currentRoot = null;
      let rootMo = null;

      const watchRoot = () => {
        if (!desiredOpen) return;
        const nextRoot = findHostAppRoot();
        if (!nextRoot || nextRoot === currentRoot) return;

        try { rootMo && rootMo.disconnect(); } catch {}
        currentRoot = nextRoot;

        try {
          rootMo = new MutationObserver(() => {
            if (!desiredOpen) return;
            // Re-apply layout if the app overwrote our inline styles.
            ensureHostLayout(true);
          });
          rootMo.observe(currentRoot, { attributes: true, attributeFilter: ['style', 'class'] });
        } catch {}
      };

      // Observe body child changes (root swaps) and also run once.
      const body = document.body;
      if (body) {
        const bodyMo = new MutationObserver(() => {
          watchRoot();
          if (desiredOpen) ensureHostLayout(true);
        });
        bodyMo.observe(body, { childList: true });
      }

      watchRoot();
    } catch {}
  }

  function ensureUiResilience() {
    if (window.__qnSplitUiGuard) return;
    window.__qnSplitUiGuard = true;
    if (typeof MutationObserver !== 'function') return;
    const target = document.body;
    if (!target) return;

    let timer = 0;
    const schedule = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        try {
          const wasOpen = document.documentElement.classList.contains('qn-split-open');
          if (wasOpen) ensureHostLayout(true);

          const missing =
            !document.getElementById(ROOT_ID) ||
            !document.getElementById(PANE_ID) ||
            !document.getElementById(DIVIDER_ID) ||
            !document.getElementById(HANDLE_ID) ||
            !document.getElementById(ASK_ID);
          if (!missing) return;

          const ui = ensureUI();
          applyRightWidthPx(loadRightWidthPx());
          if (wasOpen) {
            setOpen(true);
            const iframe = ensurePaneIframe(ui.pane);
            ensureIframeLoaded(iframe);
            void ensureIframeTweaks();
          }
        } catch {}
      }, 0);
    };

    try {
      const mo = new MutationObserver(schedule);
      mo.observe(target, { childList: true });
    } catch {}
  }

  function tryInit() {
    try {
      if (!document.documentElement) return false;
      // ChatGPT can briefly swap the whole document during navigation; avoid binding in hidden docs.
      if (document.visibilityState === 'prerender') return false;

      ensureUI();
      applyRightWidthPx(loadRightWidthPx());
      bindGlobalEvents();
      registerMenuCommands();

      const persistedOpen = readBool(OPEN_KEY, false);
      if (persistedOpen) {
        setTimeout(() => {
          try {
            if (document.visibilityState === 'visible') openSplit();
          } catch {}
        }, 600);
      } else {
        // Clean up any stray host padding left by older versions / unexpected shutdowns.
        // Run once after the SPA mounts to avoid missing the real host root.
        setTimeout(() => {
          try {
            if (!document.documentElement.classList.contains('qn-split-open')) ensureHostLayout(false);
          } catch {}
        }, 1200);
      }

      return true;
    } catch (e) {
      try {
        // eslint-disable-next-line no-console
        console.warn('[QuickNav][SplitView] init failed:', e);
      } catch {}
      return false;
    }
  }

  // Init (default closed; only auto-open if user explicitly left it open previously).
  // NOTE: this file can be injected "too early" via reinject/registration sync; keep it self-healing.
  try {
    let attempts = 0;
    const maxAttempts = 80;
    const retryMs = 120;

    const schedule = () => {
      if (tryInit()) return;
      attempts += 1;
      if (attempts >= maxAttempts) return;
      setTimeout(schedule, retryMs);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', schedule, { once: true, capture: true });
      setTimeout(schedule, 600);
    } else {
      schedule();
    }
  } catch {}
})();
