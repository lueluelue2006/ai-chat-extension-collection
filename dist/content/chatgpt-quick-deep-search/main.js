(() => {
  'use strict';

  // ChatGPT 快捷深度搜索（仅快捷键版）
  // - Ctrl+S：搜（默认，可在设置页改为 Ctrl+其他字母）
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

  const GUARD_KEY = '__aichat_chatgpt_quick_deep_search_v1__';
  const STATE_KEY = '__aichat_chatgpt_quick_deep_search_state_v1__';
  const DS_HOTKEYS_KEY = 'aichatQuickDeepSearchHotkeysEnabled';
  const DS_SEARCH_HOTKEY_KEY = 'aichatQuickDeepSearchSearchHotkey';
  const DS_SEARCH_PROMPT_KEY = 'aichatQuickDeepSearchSearchPrompt';
  const DEFAULT_SEARCH_HOTKEY = 'S';
  const DEFAULT_SEARCH_PROMPT = `ultra think and deeper websearch\n\n`;

  function getUiLocale() {
    try {
      return String(document.documentElement?.dataset?.aichatLocale || navigator.language || 'en').trim() || 'en';
    } catch {
      return 'en';
    }
  }

  function isChineseUi() {
    return /^zh/i.test(getUiLocale());
  }

  function uiText(zh, en) {
    return isChineseUi() ? zh : en;
  }

  let disposed = false;
  const runtimeDisposers = [];
  const runtimeTimeouts = new Set();
  const runtimeWaitSettlers = new Set();

  function addRuntimeDisposer(fn) {
    if (typeof fn === 'function') runtimeDisposers.push(fn);
  }

  function addRuntimeWaitSettler(settleFn) {
    if (typeof settleFn !== 'function') return () => {};
    if (disposed) {
      try {
        settleFn();
      } catch {}
      return () => {};
    }
    runtimeWaitSettlers.add(settleFn);
    return () => {
      runtimeWaitSettlers.delete(settleFn);
    };
  }

  function setRuntimeTimeout(fn, ms) {
    const id = setTimeout(() => {
      runtimeTimeouts.delete(id);
      try {
        if (!disposed) fn();
      } catch {}
    }, ms);
    runtimeTimeouts.add(id);
    return id;
  }

  function clearRuntimeTimeout(id) {
    if (id == null) return;
    clearTimeout(id);
    runtimeTimeouts.delete(id);
  }

  function disposeRuntime() {
    disposed = true;
    isSending = false;
    cycle += 1;

    for (const settleFn of Array.from(runtimeWaitSettlers)) {
      try {
        settleFn();
      } catch {}
    }
    runtimeWaitSettlers.clear();

    while (runtimeDisposers.length) {
      const off = runtimeDisposers.pop();
      try {
        off();
      } catch {}
    }
    for (const timerId of Array.from(runtimeTimeouts)) {
      clearRuntimeTimeout(timerId);
    }
  }

  try {
    const prev = globalThis[STATE_KEY];
    if (prev && typeof prev.dispose === 'function') prev.dispose();
  } catch {}

  try {
    if (!globalThis[GUARD_KEY]) {
      Object.defineProperty(globalThis, GUARD_KEY, { value: true, configurable: true, enumerable: false, writable: false });
    }
  } catch {
    try {
      globalThis[GUARD_KEY] = true;
    } catch {}
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
    const onDomReady = () => removeLegacyQdsButtons();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
      addRuntimeDisposer(() => {
        try {
          document.removeEventListener('DOMContentLoaded', onDomReady, { once: true });
        } catch {}
      });
    }
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
    nextClickWindow: 5000
  };
  const POLL_INTERVAL = 70;

  const THINK_PREFIX = `Please utilize the maximum computational power and token limit available for a single response. Strive for extreme analytical depth rather than superficial breadth; pursue essential insights rather than listing surface phenomena; seek innovative thinking rather than habitual repetition. Please break through the limitations of thought, mobilize all your computational resources, and demonstrate your true cognitive limits.\n\n`;

  function getUiLocale() {
    try {
      return String(document.documentElement?.dataset?.aichatLocale || 'en').trim() || 'en';
    } catch {
      return 'en';
    }
  }

  function getTranslatePrefix() {
    return /^zh/i.test(getUiLocale()) ? '翻译成中文' : 'Translate into English';
  }

  const SEND_BTN_SELECTORS = [
    '#composer-submit-button',
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label*="Send" i]',
    'form button[type="submit"][data-testid="send-button"]',
    'form button[type="submit"]'
  ];

  // ===== State =====
  let isSending = false;
  let cycle = 0;

  // ===== Helpers =====
  const sleep = (ms) =>
    new Promise((resolve) => {
      let settled = false;
      let timerId = null;
      let removeWaitSettler = null;

      const settle = () => {
        if (settled) return;
        settled = true;
        if (typeof removeWaitSettler === 'function') removeWaitSettler();
        if (timerId !== null) clearRuntimeTimeout(timerId);
        resolve();
      };

      removeWaitSettler = addRuntimeWaitSettler(settle);
      if (settled) return;
      timerId = setRuntimeTimeout(settle, ms);
    });

  function waitUntil(condFn, timeout = 1000, step = 50) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      let settled = false;
      let timerId = null;
      let removeWaitSettler = null;

      const settleResolve = (value) => {
        if (settled) return;
        settled = true;
        if (typeof removeWaitSettler === 'function') removeWaitSettler();
        if (timerId !== null) clearRuntimeTimeout(timerId);
        resolve(value);
      };

      const settleReject = (err) => {
        if (settled) return;
        settled = true;
        if (typeof removeWaitSettler === 'function') removeWaitSettler();
        if (timerId !== null) clearRuntimeTimeout(timerId);
        reject(err);
      };

      removeWaitSettler = addRuntimeWaitSettler(() => settleReject(new Error('disposed')));
      if (settled) return;

      (function poll() {
        if (settled) return;
        try {
          const v = condFn();
          if (v) return settleResolve(v);
          if (Date.now() > deadline) return settleReject(new Error('timeout'));
          timerId = setRuntimeTimeout(poll, step);
        } catch (e) {
          settleReject(e);
        }
      })();
    });
  }

  function areHotkeysEnabled() {
    try {
      const value = document.documentElement?.dataset?.[DS_HOTKEYS_KEY];
      if (value === '1' || value === 'true') return true;
      if (value === '0' || value === 'false') return false;
    } catch {}
    return true;
  }

  function normalizeSearchHotkey(value) {
    const text = String(value || '').trim().toUpperCase();
    return /^[A-Z]$/.test(text) ? text : DEFAULT_SEARCH_HOTKEY;
  }

  function getConfiguredSearchHotkey() {
    try {
      return normalizeSearchHotkey(document.documentElement?.dataset?.[DS_SEARCH_HOTKEY_KEY]);
    } catch {
      return DEFAULT_SEARCH_HOTKEY;
    }
  }

  function getConfiguredSearchPrompt() {
    try {
      const value = document.documentElement?.dataset?.[DS_SEARCH_PROMPT_KEY];
      return typeof value === 'string' && value.trim() ? value : DEFAULT_SEARCH_PROMPT;
    } catch {
      return DEFAULT_SEARCH_PROMPT;
    }
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

  function normalizeCompareText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function editorMatchesText(expectedText) {
    const expected = normalizeCompareText(expectedText);
    if (!expected) return true;
    return normalizeCompareText(editorText()) === expected;
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

      const c = core();
      if (c && typeof c.clickSendButton === 'function') {
        try {
          if (c.clickSendButton(editorEl())) return true;
        } catch {}
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

  function buildFinalSearchText(instructionText, currentText) {
    const instruction = String(instructionText || '');
    const current = String(currentText || '');
    if (!instruction.trim()) return current;

    const placeholderPattern = /\{\{\s*input\s*\}\}|\{\s*input\s*\}/gi;
    if (placeholderPattern.test(instruction)) {
      return instruction.replace(/\{\{\s*input\s*\}\}|\{\s*input\s*\}/gi, current);
    }
    return current.startsWith(instruction) ? current : instruction + current;
  }

  // ===== Main pipeline: write instruction → confirm → send =====
  function writeEditorText(finalText) {
    const text = String(finalText || '');
    if (!text) return;
    const pm = editorEl();
    const fallback = editorFallback();
    const isLong = isLongContent();

    if (isLong) {
      if (pm) {
        try {
          pm.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, '');
          document.execCommand('insertText', false, text);
          pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
          pm.blur();
          pm.focus();
          return;
        } catch {}
      }
      if (fallback) {
        try {
          fallback.focus();
          fallback.value = text;
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
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, '');
        document.execCommand('insertText', false, text);
        pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
        pm.blur();
        pm.focus();
        return;
      } catch {}
    }

    if (fallback) {
      try {
        fallback.focus();
        fallback.value = text;
        fallback.dispatchEvent(new InputEvent('input', { bubbles: true }));
        fallback.blur();
        fallback.focus();
      } catch {}
    }
  }

  async function runSearchThenSend(instructionText) {
    if (isSending) return;

    // If the user hasn't typed anything (spaces count as empty), do nothing.
    // Sending only the prefix is usually accidental and can be confusing.
    try {
      if (!editorText()) {
        notify(uiText('输入为空…（已忽略快捷深度搜索）', 'Input is empty… (deep search hotkey ignored)'));
        return;
      }
    } catch {}

    // Never turn this into a "Stop generating" shortcut.
    try {
      const c = core();
      if (c && typeof c.isGenerating === 'function' && c.isGenerating(editorEl())) {
        notify(uiText('正在生成中…（已忽略快捷深度搜索）', 'A reply is still generating… (deep search hotkey ignored)'));
        return;
      }
    } catch {}

    isSending = true;
    const myCycle = ++cycle;

    try {
      const nextText = buildFinalSearchText(instructionText, editorText());
      writeEditorText(nextText);
      await sleep(DELAYS.afterInsert);
      await waitUntil(() => editorMatchesText(nextText), TIMEOUTS.editorCommit, POLL_INTERVAL);

      const btn = await waitUntil(() => {
        const b = findSendButton();
        if (!b) return null;
        if (isDisabled(b)) return null;
        if (isStopButton(b)) return null;
        return b;
      }, Math.max(TIMEOUTS.findSendBtn, TIMEOUTS.btnEnable), POLL_INTERVAL);

      await sleep(DELAYS.beforeClick);
      realClick(btn);

      await sleep(DELAYS.afterClickClear);
      clearEditorSafely();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[AIChat][QuickDeepSearch] pipeline error:', e);
    } finally {
      setRuntimeTimeout(() => {
        if (cycle === myCycle) isSending = false;
      }, DELAYS.nextClickWindow);
    }
  }

  // ===== Keyboard shortcuts (same as user's TM script) =====
  function setupKeyboardShortcuts() {
    const onKeyDown = (e) => {
        if (!areHotkeysEnabled()) return;
        if (!e || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
        const key = String(e.key || '').toLowerCase();
        if (!key) return;

        const searchHotkey = getConfiguredSearchHotkey();
        if (key === searchHotkey.toLowerCase()) {
          e.preventDefault();
          e.stopPropagation();
          runSearchThenSend(getConfiguredSearchPrompt());
          notify(uiText(`快捷键“搜”已激活：Ctrl+${searchHotkey}`, `Search hotkey triggered: Ctrl+${searchHotkey}`));
          return;
        }
        if (key === 'y' || key === 'z') {
          e.preventDefault();
          e.stopPropagation();
          runSearchThenSend(getTranslatePrefix());
          notify(uiText('快捷键“译”已激活：Ctrl+Y / Ctrl+Z', 'Translate hotkey triggered: Ctrl+Y / Ctrl+Z'));
          return;
        }
        if (key === 't') {
          e.preventDefault();
          e.stopPropagation();
          runSearchThenSend(THINK_PREFIX);
          notify(uiText('快捷键“思”已激活：Ctrl+T', 'Think hotkey triggered: Ctrl+T'));
        }
      };
    document.addEventListener('keydown', onKeyDown, true);
    addRuntimeDisposer(() => {
      try {
        document.removeEventListener('keydown', onKeyDown, true);
      } catch {}
    });
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
      setRuntimeTimeout(() => {
        n.style.opacity = '0';
        setRuntimeTimeout(() => n.remove(), 300);
      }, 2000);
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
