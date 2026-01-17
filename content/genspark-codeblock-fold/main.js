(() => {
  'use strict';

  const GUARD_KEY = '__aichat_genspark_codeblock_fold_v1__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  if (window.top !== window) return;

  const STYLE_ID = '__aichat_genspark_codeblock_fold_style_v1__';
  const ATTR_PROCESSED = 'data-aichat-gs-codefold';
  const ATTR_STATE = 'data-aichat-gs-codefold-state';

  const COLLAPSED_CLASS = 'aichat-gs-codefold-collapsed';
  const TOGGLE_BAR_CLASS = 'aichat-gs-codefold-togglebar';
  const TOGGLE_BTN_CLASS = 'aichat-gs-codefold-togglebtn';
  const LINE_HINT_CLASS = 'aichat-gs-codefold-linehint';

  const MAX_HEIGHT_PX = 420;
  const MIN_LINES = 40;
  const MIN_HEIGHT_PX = 900;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
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
      pre.${COLLAPSED_CLASS} {
        max-height: ${MAX_HEIGHT_PX}px !important;
        overflow: auto !important;
      }

      .${TOGGLE_BAR_CLASS} {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 6px;
      }

      .${LINE_HINT_CLASS} {
        font-size: 12px;
        opacity: 0.7;
        user-select: none;
      }

      .${TOGGLE_BTN_CLASS} {
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

      .${TOGGLE_BTN_CLASS}:hover {
        background: rgba(0, 0, 0, 0.28);
        border-color: rgba(255, 255, 255, 0.26);
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

    btn.addEventListener('click', (e) => {
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
      if (pre.getAttribute(ATTR_PROCESSED) === '1') continue;
      fold(pre);
    }
  }

  function startActive() {
    scan(document);

    const observer = new MutationObserver((mutations) => {
      if (!isAiChatPage()) return;
      for (const m of mutations) {
        for (const n of m.addedNodes || []) {
          if (n instanceof Element) scan(n);
        }
      }
    });

    try {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch {}

    // Fallback: streaming updates may not add nodes; rescan periodically.
    setInterval(() => scan(document), 1200);
  }

  async function boot() {
    // Wait for Nuxt root to exist; the page often hydrates after load.
    for (let i = 0; i < 200; i++) {
      if (document.getElementById('__nuxt')) break;
      await sleep(50);
    }

    if (isAiChatPage()) return startActive();

    // Avoid doing work on non-chat agents pages; activate lazily once chat UI appears.
    const watch = setInterval(() => {
      if (!isAiChatPage()) return;
      clearInterval(watch);
      startActive();
    }, 800);
  }

  void boot();
})();
