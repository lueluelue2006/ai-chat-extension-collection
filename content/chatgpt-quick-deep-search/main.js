(() => {
  'use strict';

  // ChatGPT 快捷深度搜索（仅快捷键版）
  // - Ctrl+S：搜（插入搜索前缀并发送）
  // - Ctrl+T：思（插入思考前缀并发送）
  // - Ctrl+Y / Ctrl+Z：译（插入“翻译成中文”并发送）
  //
  // 设计目标：稳定优先；不再注入任何按钮（避免 UI 注入/定位/保活导致的脆弱性与内存风险）。

  // Avoid running inside iframes.
  const ALLOWED_FRAME = (() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    return !inIframe;
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

  // Best-effort cleanup: remove legacy injected QDS buttons from previous versions.
  function removeLegacyQdsButtons() {
    try {
      const ids = [
        // v1.2.10+ (our inline wrap / floating)
        'qn-qds-inline-wrap',
        'qn-qds-search-btn',
        'qn-qds-think-btn',
        // older overlay versions
        'o4-inline-btn-wrap',
        'o4-mini-button',
        'o4-think-button',
        'o4-translate-inline-btn',
        'o4-mini-inline-btn',
        'o4-think-inline-btn'
      ];
      for (const id of ids) {
        try {
          const el = document.getElementById(id);
          if (el && el.remove) el.remove();
        } catch {}
      }
    } catch {}
  }

  // Try immediately (in case the DOM is already available), and once more after DOMContentLoaded.
  removeLegacyQdsButtons();
  try {
    document.addEventListener('DOMContentLoaded', () => removeLegacyQdsButtons(), { once: true });
  } catch {}

  // ===== Config =====
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

  // ===== State =====
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

    // If the user hasn't typed anything (spaces count as empty), do nothing.
    // Sending only the prefix is usually accidental and can be confusing.
    try {
      if (!editorText()) {
        notify('输入为空…（已忽略快捷深度搜索）');
        return;
      }
    } catch {}

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

  // ===== UI (tiny toast for feedback) =====
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
})();
