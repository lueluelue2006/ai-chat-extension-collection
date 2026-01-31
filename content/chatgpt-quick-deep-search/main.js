(() => {
  'use strict';

  // ChatGPT 快捷深度搜索（扩展版，稳定优先）
  // Based on the user's long‑term stable Tampermonkey v1.8.4 logic:
  // - Strict 2-step pipeline (insert prefix → confirm → send)
  // - Confirmation + delays to avoid double send / flaky sends
  // - No global MutationObserver / deep DOM scanning (memory + stability)
  // - UI: inline (composer) + floating fallback, draggable + position memory

  const STARTED_AT = Date.now();

  // Avoid running inside internal ChatGPT iframes when split-view enables `allFrames` injection.
  const ALLOWED_FRAME = (() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    if (!inIframe) return true;
    try {
      const fe = window.frameElement;
      return !!(fe && fe.nodeType === 1 && String(fe.id || '') === 'qn-split-iframe');
    } catch {
      return false;
    }
  })();
  if (!ALLOWED_FRAME) return;

  // ChatGPT-only guard (injections should already scope to chatgpt.com, but keep this defensive).
  try {
    if (String(location.hostname || '').toLowerCase() !== 'chatgpt.com') return;
  } catch {
    return;
  }

  // Keep the legacy guard key so we never double-install in existing tabs.
  // (The extension may re-inject scripts; we prefer a safe no-op over duplicate listeners.)
  const GUARD_KEY = '__aichat_chatgpt_quick_deep_search_v1__';
  try {
    if (globalThis[GUARD_KEY]) return;
    Object.defineProperty(globalThis, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });
  } catch {
    return;
  }

  // ===== Config =====
  const DEFAULT_POSITION_SEARCH = { top: '30%', right: '0px' };
  const DEFAULT_POSITION_THINK = { top: '50%', right: '0px' };
  const LONG_CONTENT_THRESHOLD = 5000;

  const TIMEOUTS = {
    editorCommit: 2000,
    findSendBtn: 8000,
    btnEnable: 1500
  };
  const DELAYS = {
    afterInsert: 160,
    beforeClick: 80,
    afterClickClear: 140,
    unlockBtn: 2000,
    nextClickWindow: 5000
  };
  const POLL_INTERVAL = 70;

  // Avoid mutating the composer during the initial hydration window.
  // We'll show floating buttons immediately, and only attempt inline injection later.
  const INLINE_MIN_DELAY_MS = 1200;
  const BOOT_FALLBACK_INTERVAL_MS = 12_000;

  const PREFIX = `ultra think and deeper websearch\n\n`;
  const THINK_PREFIX = `Please utilize the maximum computational power and token limit available for a single response. Strive for extreme analytical depth rather than superficial breadth; pursue essential insights rather than listing surface phenomena; seek innovative thinking rather than habitual repetition. Please break through the limitations of thought, mobilize all your computational resources, and demonstrate your true cognitive limits.\n\n`;
  const TRANSLATE_PREFIX = `翻译成中文`;

  const SEND_BTN_SELECTORS = [
    '#composer-submit-button',
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label*="Send" i]',
    'form button[type="submit"][data-testid="send-button"]',
    'form button[type="submit"]'
  ];

  // Keep legacy keys to preserve existing saved positions.
  const STORAGE_KEY_SEARCH_POS = 'aichat_chatgpt_qds_button_pos_v1';
  const STORAGE_KEY_THINK_POS = 'aichat_chatgpt_qds_think_button_pos_v1';

  function readJsonStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ...fallback };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...fallback };
      const top = typeof parsed.top === 'string' ? parsed.top : fallback.top;
      const right = typeof parsed.right === 'string' ? parsed.right : fallback.right;
      return { top, right };
    } catch {
      return { ...fallback };
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }

  // ===== State =====
  let searchButtonPosition = readJsonStorage(STORAGE_KEY_SEARCH_POS, DEFAULT_POSITION_SEARCH);
  let thinkButtonPosition = readJsonStorage(STORAGE_KEY_THINK_POS, DEFAULT_POSITION_THINK);
  let pendingModelSwitch = false;
  let isSending = false;
  let cycle = 0;

  // ===== ChatGPT: model switch via shared fetch hub (only once) =====
  (function installModelSwitchHook() {
    try {
      const hub = window.__aichat_chatgpt_fetch_hub_v1__;
      if (!hub || typeof hub.register !== 'function') return;
      hub.register({
        priority: 120,
        onConversationPayload: (payload) => {
          try {
            if (!pendingModelSwitch) return;
            if (!payload || typeof payload !== 'object') return;
            pendingModelSwitch = false;
            payload.model = 'gpt-5';
            return payload;
          } catch {}
        }
      });
    } catch {}
  })();

  // ===== Helpers =====
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function waitUntil(condFn, timeout = 1000, step = 50) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      (function poll() {
        try {
          const v = condFn();
          if (v) return resolve(v);
          if (Date.now() > deadline) return reject(new Error('timeout'));
          setTimeout(poll, step);
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  function core() {
    try {
      const c = window.__aichat_chatgpt_core_main_v1__;
      return c && typeof c === 'object' ? c : null;
    } catch {
      return null;
    }
  }

  function editorEl() {
    try {
      const c = core();
      const el = c && typeof c.getEditorEl === 'function' ? c.getEditorEl() : null;
      if (el) return el;
    } catch {}
    try {
      return (
        document.querySelector('#prompt-textarea.ProseMirror') ||
        document.querySelector('#prompt-textarea[contenteditable="true"]') ||
        document.querySelector('#prompt-textarea .ProseMirror[contenteditable="true"]') ||
        document.querySelector('.ProseMirror[contenteditable="true"]') ||
        null
      );
    } catch {
      return null;
    }
  }

  function editorFallback() {
    try {
      return document.querySelector('textarea#prompt-textarea, textarea[name="prompt-textarea"]');
    } catch {
      return null;
    }
  }

  function readContentEditableText(el) {
    try {
      if (!el) return '';
      const text = typeof el.innerText === 'string' ? (el.innerText || '').trim() : '';
      if (!text) return '';
      const placeholderEl = el.querySelector?.('.placeholder.ProseMirror-widget, .placeholder');
      const placeholderText = placeholderEl ? String(placeholderEl.textContent || '').trim() : '';
      if (placeholderText && text === placeholderText) return '';
      return text;
    } catch {
      return '';
    }
  }

  function editorText() {
    const el = editorEl();
    if (el) return readContentEditableText(el);
    const fb = editorFallback();
    return fb && typeof fb.value === 'string' ? fb.value.trim() : '';
  }

  function isLongContent() {
    try {
      const el = editorEl();
      if (el && typeof el.innerText === 'string') return el.innerText.length > LONG_CONTENT_THRESHOLD;
    } catch {}
    try {
      const fb = editorFallback();
      if (fb && typeof fb.value === 'string') return fb.value.length > LONG_CONTENT_THRESHOLD;
    } catch {}
    return false;
  }

  function editorStartsWith(prefixText) {
    const prefix = String(prefixText || '').trimEnd();
    if (!prefix) return true;
    const el = editorEl();
    if (el) return readContentEditableText(el).startsWith(prefix);
    const fb = editorFallback();
    return !!(fb && typeof fb.value === 'string' && String(fb.value || '').trim().startsWith(prefix));
  }

  function lockButton(btn, lock) {
    try {
      if (!btn) return;
      btn.setAttribute('aria-disabled', lock ? 'true' : 'false');
      // @ts-ignore
      btn.disabled = !!lock;
    } catch {}
  }

  function clearEditorSafely() {
    const pm = editorEl();
    if (pm) {
      try {
        pm.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, '');
        pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
        pm.blur();
        pm.focus();
        return;
      } catch {}
    }
    const fb = editorFallback();
    if (fb) {
      try {
        fb.focus();
        fb.value = '';
        fb.dispatchEvent(new InputEvent('input', { bubbles: true }));
        fb.blur();
        fb.focus();
      } catch {}
    }
  }

  function isDisabled(btn) {
    if (!btn) return true;
    try {
      // @ts-ignore
      if (btn instanceof HTMLButtonElement) return !!btn.disabled;
    } catch {}
    try {
      const aria = btn.getAttribute?.('aria-disabled');
      if (aria && aria !== 'false') return true;
    } catch {}
    return false;
  }

  function findSendButton() {
    try {
      const c = core();
      const el = c && typeof c.findSendButton === 'function' ? c.findSendButton(editorEl()) : null;
      if (el) return el;
    } catch {}
    try {
      for (const sel of SEND_BTN_SELECTORS) {
        const btn = document.querySelector(sel);
        if (btn) return btn;
      }
    } catch {}
    return null;
  }

  function isStopButton(btn) {
    try {
      const testId = String(btn?.getAttribute?.('data-testid') || '');
      if (testId && /stop/i.test(testId)) return true;
    } catch {}
    try {
      const aria = String(btn?.getAttribute?.('aria-label') || '');
      if (aria && /stop/i.test(aria)) return true;
    } catch {}
    return false;
  }

  function realClick(btn) {
    try {
      if (!(btn instanceof HTMLElement)) return false;

      const form = btn.closest('form');
      if (form) {
        if (typeof form.requestSubmit === 'function') form.requestSubmit(btn);
        else form.submit();
        return true;
      }

      const rect = btn.getBoundingClientRect();
      const cx = Math.max(0, rect.left + rect.width / 2);
      const cy = Math.max(0, rect.top + rect.height / 2);
      const events = [
        new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy }),
        new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }),
        new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy }),
        new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy })
      ];
      for (const ev of events) btn.dispatchEvent(ev);
      btn.click();
      return true;
    } catch {
      return false;
    }
  }

  // ===== Main pipeline: insert prefix → confirm → send =====
  function insertPrefixAtBeginning(prefixText) {
    const prefix = String(prefixText || '');
    if (!prefix) return;

    const currentText = editorText();
    const finalText = currentText ? (currentText.startsWith(prefix) ? currentText : prefix + currentText) : prefix;

    const pm = editorEl();
    const fallback = editorFallback();
    const isLong = isLongContent();

    if (isLong) {
      if (pm) {
        try {
          pm.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, '');
          document.execCommand('insertText', false, finalText);
          pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
          pm.blur();
          pm.focus();
          return;
        } catch {}
      }
      if (fallback) {
        try {
          fallback.focus();
          fallback.value = finalText;
          fallback.dispatchEvent(new InputEvent('input', { bubbles: true }));
          fallback.blur();
          fallback.focus();
        } catch {}
      }
      return;
    }

    if (pm) {
      try {
        pm.focus();
        const range = document.createRange();
        range.selectNodeContents(pm);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, finalText);
        pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
        pm.blur();
        pm.focus();
        return;
      } catch {}
    }

    if (fallback) {
      try {
        fallback.focus();
        fallback.value = finalText;
        fallback.dispatchEvent(new InputEvent('input', { bubbles: true }));
        fallback.blur();
        fallback.focus();
      } catch {}
    }
  }

  async function runPrefixThenSend(prefixText) {
    if (isSending) return;

    // Never turn this into a "Stop generating" shortcut.
    try {
      const c = core();
      if (c && typeof c.isGenerating === 'function' && c.isGenerating(editorEl())) {
        notify('正在生成中…（已忽略快捷深度搜索）');
        return;
      }
    } catch {}

    isSending = true;
    const myCycle = ++cycle;

    try {
      insertPrefixAtBeginning(prefixText);
      await sleep(DELAYS.afterInsert);
      await waitUntil(() => editorStartsWith(prefixText), TIMEOUTS.editorCommit, POLL_INTERVAL);

      const btn = await waitUntil(() => {
        const b = findSendButton();
        if (!b) return null;
        if (isDisabled(b)) return null;
        if (isStopButton(b)) return null;
        return b;
      }, Math.max(TIMEOUTS.findSendBtn, TIMEOUTS.btnEnable), POLL_INTERVAL);

      lockButton(btn, true);
      pendingModelSwitch = true;
      await sleep(DELAYS.beforeClick);
      realClick(btn);

      await sleep(DELAYS.afterClickClear);
      clearEditorSafely();
      setTimeout(() => lockButton(btn, false), DELAYS.unlockBtn);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[AIChat][QuickDeepSearch] pipeline error:', e);
    } finally {
      setTimeout(() => {
        if (cycle === myCycle) isSending = false;
      }, DELAYS.nextClickWindow);
    }
  }

  // ===== Keyboard shortcuts (same as user's TM script) =====
  function setupKeyboardShortcuts() {
    document.addEventListener(
      'keydown',
      (e) => {
        if (!e || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
        const key = String(e.key || '').toLowerCase();
        if (!key) return;

        if (key === 'y' || key === 'z') {
          e.preventDefault();
          e.stopPropagation();
          runPrefixThenSend(TRANSLATE_PREFIX);
          notify('快捷键"译"已激活：Ctrl+Y / Ctrl+Z');
          return;
        }
        if (key === 's') {
          e.preventDefault();
          e.stopPropagation();
          runPrefixThenSend(PREFIX);
          notify('快捷键"搜"已激活：Ctrl+S');
          return;
        }
        if (key === 't') {
          e.preventDefault();
          e.stopPropagation();
          runPrefixThenSend(THINK_PREFIX);
          notify('快捷键"思"已激活：Ctrl+T');
        }
      },
      true
    );
  }
  setupKeyboardShortcuts();

  // ===== UI =====
  function notify(msg) {
    try {
      if (!document.body) return;
      const n = document.createElement('div');
      n.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0,0,0,.8);
        color: #fff;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 2147483647;
        transition: opacity .3s ease;
      `;
      n.textContent = String(msg || '');
      document.body.appendChild(n);
      setTimeout(() => {
        n.style.opacity = '0';
        setTimeout(() => n.remove(), 300);
      }, 2000);
    } catch {}
  }

  function makeDraggable(el, onSavePosition) {
    let isDragging = false;
    let pointerId = null;
    let startClientY = 0;
    let startTopPx = 0;
    const DRAG_THRESHOLD_PX = 6;

    try { el.style.touchAction = 'none'; } catch {}

    function toPxTop(value) {
      if (!value) return 0;
      if (String(value).endsWith('%')) {
        const percent = parseFloat(value) || 0;
        return (window.innerHeight || 0) * (percent / 100);
      }
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    }

    function clampTop(px) {
      const maxTop = Math.max(0, (window.innerHeight || 0) - (el.offsetHeight || 0));
      return Math.max(0, Math.min(px, maxTop));
    }

    function onPointerDown(e) {
      if (!e) return;
      if (e.button !== undefined && e.button !== 0) return;
      pointerId = e.pointerId || 'mouse';
      try { el.setPointerCapture && el.setPointerCapture(e.pointerId); } catch {}
      const comp = getComputedStyle(el);
      startTopPx = toPxTop(comp.top);
      startClientY = e.clientY;
      isDragging = false;
    }

    function onPointerMove(e) {
      if (!e) return;
      if ((e.pointerId || 'mouse') !== pointerId) return;
      const deltaY = e.clientY - startClientY;
      if (!isDragging && Math.abs(deltaY) >= DRAG_THRESHOLD_PX) {
        isDragging = true;
        el.style.cursor = 'move';
      }
      if (!isDragging) return;
      const nextTop = clampTop(startTopPx + deltaY);
      el.style.top = `${Math.round(nextTop)}px`;
      e.preventDefault();
      e.stopPropagation();
    }

    function onPointerUp(e) {
      if (!e) return;
      if ((e.pointerId || 'mouse') !== pointerId) return;
      try { el.releasePointerCapture && el.releasePointerCapture(e.pointerId); } catch {}
      if (isDragging) {
        // @ts-ignore
        el._suppressNextClick = true;
        el.style.cursor = 'pointer';
        if (typeof onSavePosition === 'function') onSavePosition({ top: el.style.top, right: el.style.right });
      }
      isDragging = false;
      pointerId = null;
    }

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
  }

  function addFloatingSearchButton() {
    if (!document.body) return;
    if (document.getElementById('qn-qds-search-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'qn-qds-search-btn';
    btn.style.cssText = `
      position: fixed;
      top: ${searchButtonPosition.top};
      right: ${searchButtonPosition.right};
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: linear-gradient(140.91deg, #7367F0 12.61%, #574AB8 76.89%);
      color: #fff;
      border-top-left-radius: 6px;
      border-bottom-left-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.2);
      transition: background .3s ease;
      font-size: 18px;
      user-select: none;
      touch-action: none;
    `;
    btn.textContent = '搜';

    makeDraggable(btn, ({ top, right }) => {
      searchButtonPosition = { top, right };
      writeJsonStorage(STORAGE_KEY_SEARCH_POS, searchButtonPosition);
      notify('"搜"按钮位置已保存');
    });

    btn.addEventListener('click', function () {
      // @ts-ignore
      if (this._suppressNextClick) { this._suppressNextClick = false; return; }
      runPrefixThenSend(PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #2ecc71 12.61%, #3498db 76.89%)';
      setTimeout(() => { this.style.background = 'linear-gradient(140.91deg, #7367F0 12.61%, #574AB8 76.89%)'; }, 2000);
      notify('"搜"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    document.body.appendChild(btn);
  }

  function addFloatingThinkButton() {
    if (!document.body) return;
    if (document.getElementById('qn-qds-think-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'qn-qds-think-btn';
    btn.style.cssText = `
      position: fixed;
      top: ${thinkButtonPosition.top};
      right: ${thinkButtonPosition.right};
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: linear-gradient(140.91deg, #FF6B6B 12.61%, #FF8E53 76.89%);
      color: #fff;
      border-top-left-radius: 6px;
      border-bottom-left-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.2);
      transition: background .3s ease;
      font-size: 18px;
      user-select: none;
      touch-action: none;
    `;
    btn.textContent = '思';

    makeDraggable(btn, ({ top, right }) => {
      thinkButtonPosition = { top, right };
      writeJsonStorage(STORAGE_KEY_THINK_POS, thinkButtonPosition);
      notify('"思"按钮位置已保存');
    });

    btn.addEventListener('click', function () {
      // @ts-ignore
      if (this._suppressNextClick) { this._suppressNextClick = false; return; }
      runPrefixThenSend(THINK_PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #27ae60 12.61%, #2ecc71 76.89%)';
      setTimeout(() => { this.style.background = 'linear-gradient(140.91deg, #FF6B6B 12.61%, #FF8E53 76.89%)'; }, 2000);
      notify('"思"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    document.body.appendChild(btn);
  }

  function removeFloatingButtonsIfAny() {
    try { document.getElementById('qn-qds-search-btn')?.remove(); } catch {}
    try { document.getElementById('qn-qds-think-btn')?.remove(); } catch {}
  }

  function hasInlineButtons() {
    try {
      const wrap = document.getElementById('qn-qds-inline-wrap');
      return !!(wrap && wrap.isConnected);
    } catch {
      return false;
    }
  }

  function findInlineContainer() {
    const c = core();
    const editor = editorEl();
    const form = c && typeof c.getComposerForm === 'function' ? c.getComposerForm(editor) : editor?.closest?.('form') || null;
    try {
      const direct = form?.querySelector?.('div[data-testid="composer-trailing-actions"]') || null;
      if (direct) return direct;
    } catch {}
    try {
      const legacy = document.querySelector('div[data-testid="composer-trailing-actions"]');
      if (legacy) return legacy;
    } catch {}
    try {
      // Some builds use a grid-area encoded in the class string.
      const alt = document.querySelector('form[data-type="unified-composer"] div[class*="[grid-area:trailing]"]');
      if (alt) return alt;
    } catch {}
    return null;
  }

  function addInlineButtons() {
    if (!document.body) return false;
    if (hasInlineButtons()) return true;
    if (Date.now() - STARTED_AT < INLINE_MIN_DELAY_MS) return false;

    const container = findInlineContainer();
    if (!container) return false;

    const wrap = document.createElement('div');
    wrap.id = 'qn-qds-inline-wrap';
    wrap.style.cssText = 'display:flex; align-items:center; gap:6px;';

    const commonBtnCss = `
      display:flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:9999px; color:#fff;
      box-shadow: 0 2px 8px rgba(0,0,0,.18); cursor:pointer;
      user-select:none; transition:opacity .2s ease, background .3s ease; font-weight:700; font-size:14px;
    `;

    const translateBtn = document.createElement('div');
    translateBtn.id = 'qn-qds-inline-translate';
    translateBtn.style.cssText = commonBtnCss + 'background: linear-gradient(140.91deg, #3498db 12.61%, #2980b9 76.89%);';
    translateBtn.textContent = '译';
    translateBtn.addEventListener('click', function () {
      runPrefixThenSend(TRANSLATE_PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #2ecc71 12.61%, #27ae60 76.89%)';
      setTimeout(() => { this.style.background = 'linear-gradient(140.91deg, #3498db 12.61%, #2980b9 76.89%)'; }, 2000);
      notify('"译"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    const searchBtn = document.createElement('div');
    searchBtn.id = 'qn-qds-inline-search';
    searchBtn.style.cssText = commonBtnCss + 'background: linear-gradient(140.91deg, #7367F0 12.61%, #574AB8 76.89%);';
    searchBtn.textContent = '搜';
    searchBtn.addEventListener('click', function () {
      runPrefixThenSend(PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #2ecc71 12.61%, #3498db 76.89%)';
      setTimeout(() => { this.style.background = 'linear-gradient(140.91deg, #7367F0 12.61%, #574AB8 76.89%)'; }, 2000);
      notify('"搜"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    const thinkBtn = document.createElement('div');
    thinkBtn.id = 'qn-qds-inline-think';
    thinkBtn.style.cssText = commonBtnCss + 'background: linear-gradient(140.91deg, #FF6B6B 12.61%, #FF8E53 76.89%);';
    thinkBtn.textContent = '思';
    thinkBtn.addEventListener('click', function () {
      runPrefixThenSend(THINK_PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #27ae60 12.61%, #2ecc71 76.89%)';
      setTimeout(() => { this.style.background = 'linear-gradient(140.91deg, #FF6B6B 12.61%, #FF8E53 76.89%)'; }, 2000);
      notify('"思"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    wrap.appendChild(translateBtn);
    wrap.appendChild(searchBtn);
    wrap.appendChild(thinkBtn);
    container.appendChild(wrap);
    return true;
  }

  function boot() {
    if (!document.body) return;
    const inlineOk = addInlineButtons();
    if (inlineOk) {
      removeFloatingButtonsIfAny();
      return;
    }
    addFloatingSearchButton();
    addFloatingThinkButton();
  }

  // ===== Keep-alive (event-driven + slow fallback) =====
  let bootTimer = 0;
  function scheduleBoot(wait = 0) {
    const w = Math.max(0, Number(wait) || 0);
    if (bootTimer) return;
    bootTimer = setTimeout(() => {
      bootTimer = 0;
      try { boot(); } catch {}
    }, w);
  }

  // Route change reinject (preferred).
  try {
    const b = window.__aichat_quicknav_bridge_main_v1__;
    if (b && typeof b.on === 'function') b.on('routeChange', () => scheduleBoot(0));
  } catch {}

  // Composer event signal: if ChatGPT remounts composer without a route change, recover.
  try {
    const isComposerEventTarget = (t) => {
      try {
        if (!(t instanceof Element)) return false;
        if (t.id === 'prompt-textarea') return true;
        if (t.closest?.('#prompt-textarea')) return true;
        if (t.closest?.('textarea[name="prompt-textarea"]')) return true;
      } catch {}
      return false;
    };
    const onComposerEvent = (e) => {
      try {
        if (hasInlineButtons()) return;
        if (!isComposerEventTarget(e?.target)) return;
        scheduleBoot(0);
      } catch {}
    };
    document.addEventListener('focusin', onComposerEvent, true);
    document.addEventListener('input', onComposerEvent, true);
  } catch {}

  // Initial boot.
  if (document.readyState === 'complete' || document.readyState === 'interactive') scheduleBoot(0);
  else document.addEventListener('DOMContentLoaded', () => scheduleBoot(0), { once: true });

  // Slow safety net: only do work when inline buttons are missing.
  setInterval(() => {
    try {
      if (!hasInlineButtons()) scheduleBoot(0);
    } catch {}
  }, BOOT_FALLBACK_INTERVAL_MS);
})();
