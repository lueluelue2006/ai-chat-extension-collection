(() => {
  'use strict';

  if (window.top !== window) return;

  const STATE_KEY = '__aichat_genspark_codeblock_fold_state_v1__';
  const STYLE_ID = '__aichat_genspark_codeblock_fold_style_v1__';
  const ATTR_PROCESSED = 'data-aichat-gs-codefold';
  const ATTR_STATE = 'data-aichat-gs-codefold-state';
  const ATTR_CODEWRAP = 'data-aichat-gs-codewrap';
  const ATTR_EXT_COPY = 'data-aichat-gs-extcopy';

  const COLLAPSED_CLASS = 'aichat-gs-codefold-collapsed';
  const TOGGLE_BAR_CLASS = 'aichat-gs-codefold-togglebar';
  const TOGGLE_BTN_CLASS = 'aichat-gs-codefold-togglebtn';
  const LINE_HINT_CLASS = 'aichat-gs-codefold-linehint';
  const CODE_WRAP_CLASS = 'aichat-gs-codewrap';
  const TOOLBAR_CLASS = 'aichat-gs-code-toolbar';
  const EXT_COPY_BTN_CLASS = 'aichat-gs-code-copybtn';

  const MAX_HEIGHT_PX = 260;
  const MIN_LINES = 40;
  const MIN_HEIGHT_PX = 900;

  const state = {
    observer: null,
    watchTimer: 0,
    fullScanTimer: 0,
    disposers: [],
    disposed: false,
    disposeRuntime() {
      if (state.disposed) return;
      state.disposed = true;
      for (const dispose of state.disposers.splice(0)) {
        try { dispose(); } catch {}
      }
      try { if (state.fullScanTimer) window.clearTimeout(state.fullScanTimer); } catch {}
      state.fullScanTimer = 0;
      try { if (state.watchTimer) window.clearInterval(state.watchTimer); } catch {}
      state.watchTimer = 0;
      try { state.observer?.disconnect?.(); } catch {}
      state.observer = null;
      try {
        for (const pre of document.querySelectorAll(`pre[${ATTR_EXT_COPY}="1"]`)) {
          const copyButton = findCopyButton(pre);
          if (copyButton) copyButton.style.display = '';
          pre.removeAttribute(ATTR_EXT_COPY);
        }
      } catch {}
      try {
        for (const pre of document.querySelectorAll(`pre[${ATTR_PROCESSED}="1"]`)) {
          pre.classList.remove(COLLAPSED_CLASS);
          pre.removeAttribute(ATTR_PROCESSED);
          pre.removeAttribute(ATTR_STATE);
        }
      } catch {}
      try {
        for (const bar of document.querySelectorAll(`.${TOGGLE_BAR_CLASS}, .${TOOLBAR_CLASS}`)) bar.remove();
      } catch {}
      try {
        for (const wrap of document.querySelectorAll(`.${CODE_WRAP_CLASS}[${ATTR_CODEWRAP}="1"]`)) {
          const parent = wrap.parentNode;
          if (!parent) continue;
          while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
          wrap.remove();
        }
      } catch {}
    }
  };

  try {
    const prev = window[STATE_KEY];
    if (prev && typeof prev.disposeRuntime === 'function') prev.disposeRuntime();
  } catch {}
  try {
    Object.defineProperty(window, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try { window[STATE_KEY] = state; } catch {}
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function addRuntimeDisposer(dispose) {
    if (typeof dispose !== 'function') return () => void 0;
    state.disposers.push(dispose);
    return dispose;
  }

  function on(target, type, listener, options) {
    if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return;
    try {
      target.addEventListener(type, listener, options);
      addRuntimeDisposer(() => {
        try { target.removeEventListener(type, listener, options); } catch {}
      });
    } catch {}
  }

  function timeout(fn, ms) {
    if (typeof fn !== 'function') return 0;
    let id = 0;
    try {
      id = window.setTimeout(() => {
        if (state.disposed) return;
        fn();
      }, ms);
      addRuntimeDisposer(() => {
        try { window.clearTimeout(id); } catch {}
      });
    } catch {}
    return id;
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isAiChatPage() {
    try {
      const u = new URL(location.href);
      if (u.hostname !== 'www.genspark.ai') return false;
      if (!u.pathname.startsWith('/agents')) return false;
    } catch {
      return false;
    }

    if (document.querySelector('.main-inner.j-chat-agent.ai_chat')) return true;
    const placeholder = document.querySelector('textarea')?.getAttribute('placeholder') || '';
    if (String(placeholder).toLowerCase().includes('ask anything')) return true;
    try {
      const u = new URL(location.href);
      const t = String(u.searchParams.get('type') || '').toLowerCase();
      const redirected = String(u.searchParams.get('redirected_from') || '').toLowerCase();
      if (t === 'ai_chat' || t === 'moa_chat') return true;
      if (redirected === 'moa_chat') return true;
    } catch {}
    return false;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const styleSheet = document.createElement('style');
    styleSheet.id = STYLE_ID;
    styleSheet.textContent = `
      .${CODE_WRAP_CLASS} {
        position: relative;
      }

      .${TOOLBAR_CLASS} {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        margin-bottom: 4px;
      }

      pre.${COLLAPSED_CLASS} {
        max-height: ${MAX_HEIGHT_PX}px !important;
        overflow: auto !important;
      }

      .${TOGGLE_BAR_CLASS} {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 4px;
      }

      .${LINE_HINT_CLASS} {
        font-size: 12px;
        opacity: 0.7;
        user-select: none;
      }

      .${TOGGLE_BTN_CLASS},
      .${EXT_COPY_BTN_CLASS} {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(0, 0, 0, 0.18);
        color: inherit;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s ease, border-color 0.15s ease;
      }

      .${TOGGLE_BTN_CLASS}:hover,
      .${EXT_COPY_BTN_CLASS}:hover {
        background: rgba(0, 0, 0, 0.28);
        border-color: rgba(255, 255, 255, 0.26);
      }

      pre[${ATTR_EXT_COPY}="1"] button.hljs-copy-button {
        display: none !important;
      }
    `;

    (document.head || document.documentElement).appendChild(styleSheet);
  }

  function countLines(pre) {
    const raw = String(pre?.innerText || '');
    if (!raw) return 0;
    const lines = raw.split(/\r?\n/);
    if (lines.length && String(lines[0] || '').trim().toLowerCase() === 'copy') lines.shift();
    return lines.filter((l) => l != null).length;
  }

  function isLong(pre) {
    const lines = countLines(pre);
    let h = 0;
    try {
      h = pre.getBoundingClientRect().height;
    } catch {
      h = 0;
    }
    return lines >= MIN_LINES || h >= MIN_HEIGHT_PX;
  }

  function ensureToggleBar(pre) {
    if (!pre || !(pre instanceof Element)) return null;
    const next = pre.nextElementSibling;
    if (next && next.classList?.contains(TOGGLE_BAR_CLASS)) return next;

    const bar = document.createElement('div');
    bar.className = TOGGLE_BAR_CLASS;

    const hint = document.createElement('span');
    hint.className = LINE_HINT_CLASS;
    bar.appendChild(hint);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = TOGGLE_BTN_CLASS;
    bar.appendChild(btn);

    pre.insertAdjacentElement('afterend', bar);
    return bar;
  }

  function updateToggleUi(pre) {
    const bar = pre?.nextElementSibling;
    if (!bar || !bar.classList?.contains(TOGGLE_BAR_CLASS)) return;
    const hint = bar.querySelector(`.${LINE_HINT_CLASS}`);
    const btn = bar.querySelector(`.${TOGGLE_BTN_CLASS}`);
    if (!btn) return;

    const lines = countLines(pre);
    if (hint) hint.textContent = lines ? `${lines} 行` : '';

    const state = pre.getAttribute(ATTR_STATE) || 'collapsed';
    btn.textContent = state === 'expanded' ? '收起' : '展开';
  }

  function attachToggleHandlers(pre) {
    const bar = pre?.nextElementSibling;
    if (!bar || !bar.classList?.contains(TOGGLE_BAR_CLASS)) return;
    const btn = bar.querySelector(`.${TOGGLE_BTN_CLASS}`);
    if (!btn || btn.__aichatBound) return;
    Object.defineProperty(btn, '__aichatBound', { value: true });

    on(btn, 'click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const cur = pre.getAttribute(ATTR_STATE) || 'collapsed';
      const next = cur === 'expanded' ? 'collapsed' : 'expanded';
      pre.setAttribute(ATTR_STATE, next);
      if (next === 'expanded') pre.classList.remove(COLLAPSED_CLASS);
      else pre.classList.add(COLLAPSED_CLASS);

      if (next === 'collapsed') {
        try {
          pre.scrollIntoView({ block: 'center' });
        } catch {}
      }

      updateToggleUi(pre);
    });
  }

  function findCopyButton(pre) {
    if (!pre || !(pre instanceof Element)) return null;
    try {
      const btn = pre.querySelector('button.hljs-copy-button');
      if (btn) return btn;
    } catch {}

    try {
      const buttons = Array.from(pre.querySelectorAll('button'));
      for (const b of buttons) {
        const t = String(b.textContent || '').trim().toLowerCase();
        const aria = String(b.getAttribute('aria-label') || '').trim().toLowerCase();
        const title = String(b.getAttribute('title') || '').trim().toLowerCase();
        if (t === 'copy' || t === '复制') return b;
        if (aria === 'copy' || aria.includes('copy') || aria.includes('复制')) return b;
        if (title === 'copy' || title.includes('copy') || title.includes('复制')) return b;
      }
    } catch {}

    return null;
  }

  function ensureCodeWrap(pre) {
    if (!pre || !(pre instanceof Element)) return null;
    const parent = pre.parentElement;
    if (parent && parent.getAttribute(ATTR_CODEWRAP) === '1') return parent;

    const existingToggleBar =
      pre.nextElementSibling && pre.nextElementSibling.classList?.contains(TOGGLE_BAR_CLASS) ? pre.nextElementSibling : null;

    const wrap = document.createElement('div');
    wrap.className = CODE_WRAP_CLASS;
    wrap.setAttribute(ATTR_CODEWRAP, '1');
    pre.insertAdjacentElement('beforebegin', wrap);
    wrap.appendChild(pre);
    if (existingToggleBar) wrap.appendChild(existingToggleBar);
    return wrap;
  }

  function ensureToolbar(wrap) {
    if (!wrap || !(wrap instanceof Element)) return null;
    const first = wrap.firstElementChild;
    if (first && first.classList?.contains(TOOLBAR_CLASS)) return first;
    const toolbar = document.createElement('div');
    toolbar.className = TOOLBAR_CLASS;
    wrap.insertBefore(toolbar, wrap.firstElementChild);
    return toolbar;
  }

  function getCodeText(pre) {
    const codeEl = pre?.querySelector?.('code');
    const raw = String(codeEl?.innerText || pre?.innerText || '');
    if (!raw) return '';
    const lines = raw.split(/\r?\n/);
    const first = String(lines[0] || '').trim().toLowerCase();
    if (first === 'copy' || first === '复制') lines.shift();
    return lines.join('\n').replace(/\s+$/, '');
  }

  async function copyText(text) {
    const v = String(text || '');
    if (!v) return false;

    try {
      await navigator.clipboard.writeText(v);
      return true;
    } catch {}

    try {
      const ta = document.createElement('textarea');
      ta.value = v;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return Boolean(ok);
    } catch {
      return false;
    }
  }

  function ensureExternalCopy(pre) {
    if (!pre || !(pre instanceof Element)) return false;
    if (!isLong(pre)) return false;

    const internal = findCopyButton(pre);
    if (!internal) return false;

    injectStyles();

    const wrap = ensureCodeWrap(pre);
    if (!wrap) return false;

    const toolbar = ensureToolbar(wrap);
    if (!toolbar) return false;

    let extBtn = toolbar.querySelector(`button.${EXT_COPY_BTN_CLASS}`);
    if (!extBtn) {
      extBtn = document.createElement('button');
      extBtn.type = 'button';
      extBtn.className = EXT_COPY_BTN_CLASS;
      extBtn.textContent = 'Copy';
      toolbar.appendChild(extBtn);
    }

    if (pre.getAttribute(ATTR_EXT_COPY) !== '1') pre.setAttribute(ATTR_EXT_COPY, '1');
    try {
      internal.style.display = 'none';
    } catch {}

    if (!extBtn.__aichatBound) {
      Object.defineProperty(extBtn, '__aichatBound', { value: true });
      on(extBtn, 'click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await copyText(getCodeText(pre));
        const old = extBtn.textContent;
        extBtn.textContent = ok ? 'Copied' : 'Copy failed';
        timeout(() => {
          extBtn.textContent = old || 'Copy';
        }, ok ? 900 : 1400);
      });
    }

    return true;
  }

  function fold(pre) {
    if (!pre || !(pre instanceof Element)) return false;
    if (pre.getAttribute(ATTR_PROCESSED) === '1') return false;
    if (!isAiChatPage()) return false;
    if (!isVisible(pre)) return false;
    if (!isLong(pre)) return false;

    injectStyles();

    pre.setAttribute(ATTR_PROCESSED, '1');
    pre.setAttribute(ATTR_STATE, 'collapsed');
    pre.classList.add(COLLAPSED_CLASS);

    ensureToggleBar(pre);
    attachToggleHandlers(pre);
    updateToggleUi(pre);
    return true;
  }

  function scan(root = document) {
    if (!isAiChatPage()) return;
    let pres = [];
    try {
      pres = Array.from(root.querySelectorAll?.('pre') || []);
      if (root instanceof Element && root.tagName === 'PRE') pres.unshift(root);
    } catch {
      pres = [];
    }

    for (const pre of pres) {
      if (pre.getAttribute(ATTR_PROCESSED) !== '1') fold(pre);
      ensureExternalCopy(pre);
    }
  }

  function startActive() {
    if (state.disposed) return;
    scan(document);

    const armFullScan = (delay = 900) => {
      try {
        if (state.fullScanTimer) clearTimeout(state.fullScanTimer);
        state.fullScanTimer = setTimeout(() => {
          state.fullScanTimer = 0;
          if (state.disposed) return;
          scan(document);
        }, Math.max(0, Number(delay) || 0));
      } catch {}
    };

    const observer = new MutationObserver((mutations) => {
      if (state.disposed) return;
      if (!isAiChatPage()) return;
      let shouldFullScan = false;
      for (const m of mutations) {
        if (m.type === 'characterData') shouldFullScan = true;
        for (const n of m.addedNodes || []) {
          if (n instanceof Element) {
            scan(n);
            shouldFullScan = true;
          }
        }
      }
      // Streaming updates sometimes mutate text nodes without adding elements; do one debounced full scan
      // after the burst settles instead of a permanent interval.
      if (shouldFullScan) armFullScan(900);
    });

    try {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      state.observer = observer;
    } catch {}
  }

  async function boot() {
    // Wait for Nuxt root to exist; the page often hydrates after load.
    for (let i = 0; i < 200; i++) {
      if (document.getElementById('__nuxt')) break;
      await sleep(50);
    }

    if (isAiChatPage()) return startActive();

    // Avoid doing work on non-chat agents pages; activate lazily once chat UI appears.
    state.watchTimer = setInterval(() => {
      if (state.disposed) return;
      if (!isAiChatPage()) return;
      clearInterval(state.watchTimer);
      state.watchTimer = 0;
      startActive();
    }, 800);
  }

  void boot();
})();
