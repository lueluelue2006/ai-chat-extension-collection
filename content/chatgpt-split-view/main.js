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
  try {
    if (globalThis[FLAG]) return;
    Object.defineProperty(globalThis, FLAG, { value: true, configurable: true });
  } catch {
    try {
      if (globalThis[FLAG]) return;
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

  const DEFAULT_RIGHT_WIDTH_PX = 520;
  const MIN_RIGHT_WIDTH_PX = 320;
  const MAX_RIGHT_WIDTH_RATIO = 0.7;

  const DEFAULT_IFRAME_SRC = 'https://chatgpt.com/';
  const SELECTION_MAX_CHARS = 1600;

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

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

#${PANE_ID}{
  position:absolute;
  top:0; right:0; bottom:0;
  width: var(--qn-split-right-width, 520px);
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
  top:10px;
  right:10px;
  display:flex;
  gap:8px;
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
  right: calc(var(--qn-split-right-width, 520px) - 5px);
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
    document.documentElement.appendChild(style);
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
    return v;
  }

  function setOpen(open) {
    const on = !!open;
    const pane = document.getElementById(PANE_ID);
    if (pane) pane.dataset.open = on ? '1' : '0';
    document.documentElement.classList.toggle('qn-split-open', on);
    writeBool(OPEN_KEY, on);
  }

  function ensureUI() {
    ensureStyle();

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
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

      const btnClose = document.createElement('button');
      btnClose.type = 'button';
      btnClose.textContent = 'Close';
      btnClose.title = 'Close split view (Esc)';

      topbar.appendChild(btnNew);
      topbar.appendChild(btnClose);

      const iframe = document.createElement('iframe');
      iframe.id = IFRAME_ID;
      iframe.src = readString(SRC_KEY, DEFAULT_IFRAME_SRC);

      pane.appendChild(topbar);
      pane.appendChild(iframe);
      root.appendChild(pane);

      btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      });

      btnNew.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = DEFAULT_IFRAME_SRC;
        try {
          iframe.src = url;
        } catch {}
        writeString(SRC_KEY, url);
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
      document.documentElement.appendChild(ask);
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

  function openSplit() {
    const ui = ensureUI();
    applyRightWidthPx(loadRightWidthPx());
    setOpen(true);

    try {
      const iframe = ui.pane.querySelector(`#${IFRAME_ID}`);
      if (iframe && iframe.src) writeString(SRC_KEY, iframe.src);
    } catch {}
  }

  function closeSplit() {
    setOpen(false);
  }

  function toggleSplit() {
    const on = document.documentElement.classList.contains('qn-split-open');
    if (on) closeSplit();
    else openSplit();
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

      const text = String(sel.toString() || '').trim();
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
        if (doc && doc.readyState === 'complete') return true;
      } catch {}
      await wait(200);
    }
    return false;
  }

  async function prefillRightPrompt(text) {
    try {
      const iframe = document.getElementById(IFRAME_ID);
      if (!iframe) return false;

      await waitForIframeReady(iframe, 9000);

      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) return false;

      const prompt = doc.querySelector('#prompt-textarea');
      if (!prompt) return false;

      const lines = String(text || '')
        .split(/\r?\n/)
        .map((l) => `> ${l}`);
      const msg = `${lines.join('\n')}\n\n`;

      prompt.focus();

      // ChatGPT currently uses a textarea (#prompt-textarea), but keep this generic.
      if (typeof prompt.value === 'string') prompt.value = msg;
      else prompt.textContent = msg;

      try {
        const InputEv = win.InputEvent || window.InputEvent;
        prompt.dispatchEvent(
          new InputEv('input', { bubbles: true, inputType: 'insertText', data: msg })
        );
      } catch {
        try {
          prompt.dispatchEvent(new Event('input', { bubbles: true }));
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

    window.addEventListener(
      'keydown',
      (e) => {
        try {
          if (!e) return;

          if (e.key === 'Escape' && document.documentElement.classList.contains('qn-split-open')) {
            closeSplit();
          }

          // Alt+Shift+S toggles (best-effort; do not override inside inputs).
          if (e.key && (e.key === 'S' || e.key === 's') && e.altKey && e.shiftKey) {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))
              return;
            toggleSplit();
            e.preventDefault();
          }
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

  // Init (default closed; only auto-open if user explicitly left it open previously).
  try {
    ensureUI();
    applyRightWidthPx(loadRightWidthPx());
    bindGlobalEvents();

    const persistedOpen = readBool(OPEN_KEY, false);
    if (persistedOpen) {
      setTimeout(() => {
        try {
          if (document.visibilityState === 'visible') openSplit();
        } catch {}
      }, 600);
    }
  } catch {}
})();
