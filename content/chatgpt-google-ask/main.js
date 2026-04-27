(() => {
  'use strict';

  const HOST_OK = (() => {
    try {
      return window.self === window.top && String(location.hostname || '').toLowerCase() === 'chatgpt.com';
    } catch {
      return false;
    }
  })();
  if (!HOST_OK) return;

  const GUARD_KEY = '__aichat_chatgpt_google_ask_v1__';
  try {
    if (window[GUARD_KEY]) return;
    Object.defineProperty(window, GUARD_KEY, { value: true, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      if (window[GUARD_KEY]) return;
      window[GUARD_KEY] = true;
    } catch {}
  }

  const HANDOFF_FLAG = 'aichat_google_ask';
  const SEARCH_PROMPT = 'prompt';
  const HASH_QUERY = 'q';
  const PROMPT_PREFIX = 'web search:\n';
  const SEND_BTN_SELECTORS = [
    '#composer-submit-button',
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label*="Send" i]',
    'form button[type="submit"][data-testid="send-button"]',
    'form button[type="submit"]'
  ];
  const MAX_ATTEMPTS = 80;
  const ATTEMPT_DELAY_MS = 250;

  let processRunning = false;
  let retryTimer = 0;
  let attempts = 0;

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getPendingPromptFromUrl() {
    try {
      const url = new URL(String(location.href || ''));
      if (url.searchParams.get(HANDOFF_FLAG) === '1') {
        return {
          prompt: normalizeText(url.searchParams.get(SEARCH_PROMPT) || ''),
          route: 'search'
        };
      }

      const raw = String(url.hash || '').replace(/^#/, '');
      if (!raw) return { prompt: '', route: '' };
      const params = new URLSearchParams(raw);
      if (params.get(HANDOFF_FLAG) !== '1') return { prompt: '', route: '' };
      const query = normalizeText(params.get(HASH_QUERY) || '');
      return {
        prompt: query ? `${PROMPT_PREFIX}${query}` : '',
        route: 'hash'
      };
    } catch {
      return { prompt: '', route: '' };
    }
  }

  function clearHandledParams() {
    try {
      const url = new URL(String(location.href || ''));
      url.searchParams.delete(HANDOFF_FLAG);
      if (!location.pathname.startsWith('/c/')) {
        url.searchParams.delete(SEARCH_PROMPT);
      }
      url.hash = '';
      history.replaceState(history.state, '', url.toString());
    } catch {}
  }

  function core() {
    try {
      return window.__aichat_chatgpt_core_main_v1__ || null;
    } catch {
      return null;
    }
  }

  function editorEl() {
    try {
      const c = core();
      const el = c && typeof c.getEditorEl === 'function' ? c.getEditorEl() : null;
      if (el instanceof HTMLElement) return el;
    } catch {}
    const selectors = [
      '.ProseMirror[contenteditable="true"]',
      '#prompt-textarea[contenteditable="true"]',
      '#prompt-textarea',
      'textarea[name="prompt-textarea"]'
    ];
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el instanceof HTMLElement) return el;
      } catch {}
    }
    return null;
  }

  function editorFallback() {
    try {
      const list = Array.from(document.querySelectorAll('textarea[name="prompt-textarea"], textarea'));
      for (const el of list) {
        if (el instanceof HTMLTextAreaElement) return el;
      }
    } catch {}
    return null;
  }

  function readContentEditableText(el) {
    try {
      return normalizeText(el?.innerText || el?.textContent || '');
    } catch {
      return '';
    }
  }

  function editorText() {
    const editor = editorEl();
    if (editor) {
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) return normalizeText(editor.value || '');
      if (editor.isContentEditable) return readContentEditableText(editor);
    }
    const fallback = editorFallback();
    return fallback ? normalizeText(fallback.value || '') : '';
  }

  function findSendButton() {
    try {
      const c = core();
      const el = c && typeof c.findSendButton === 'function' ? c.findSendButton(editorEl()) : null;
      if (el instanceof HTMLElement) return el;
    } catch {}
    for (const selector of SEND_BTN_SELECTORS) {
      try {
        const el = document.querySelector(selector);
        if (el instanceof HTMLElement) return el;
      } catch {}
    }
    return null;
  }

  function isDisabled(btn) {
    if (!(btn instanceof HTMLElement)) return true;
    try {
      if (btn instanceof HTMLButtonElement && btn.disabled) return true;
    } catch {}
    try {
      const ariaDisabled = String(btn.getAttribute('aria-disabled') || '').trim();
      if (ariaDisabled && ariaDisabled !== 'false') return true;
    } catch {}
    return false;
  }

  function isStopButton(btn) {
    if (!(btn instanceof HTMLElement)) return false;
    try {
      const testId = String(btn.getAttribute('data-testid') || '');
      if (testId && /stop/i.test(testId)) return true;
    } catch {}
    try {
      const aria = String(btn.getAttribute('aria-label') || '');
      if (aria && /stop/i.test(aria)) return true;
    } catch {}
    return false;
  }

  function writeEditorText(finalText) {
    const editor = editorEl();
    if (editor instanceof HTMLElement) {
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        try {
          editor.focus();
          editor.value = finalText;
          editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: finalText }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        } catch {}
      }

      if (editor.isContentEditable) {
        try {
          editor.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, '');
          document.execCommand('insertText', false, finalText);
          editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: finalText }));
          editor.blur();
          editor.focus();
          return true;
        } catch {}
      }
    }

    const fallback = editorFallback();
    if (fallback) {
      try {
        fallback.focus();
        fallback.value = finalText;
        fallback.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: finalText }));
        fallback.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch {}
    }
    return false;
  }

  function sendViaButton(btn) {
    try {
      if (!(btn instanceof HTMLElement)) return false;
      const c = core();
      if (c && typeof c.clickSendButton === 'function') {
        try {
          if (c.clickSendButton(editorEl())) return true;
        } catch {}
      }

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
      for (const event of events) btn.dispatchEvent(event);
      btn.click();
      return true;
    } catch {
      return false;
    }
  }

  async function processPendingQuery() {
    const handoff = getPendingPromptFromUrl();
    const prompt = handoff.prompt;
    if (!prompt) return;
    if (processRunning) return;
    processRunning = true;

    try {
      while (attempts < MAX_ATTEMPTS) {
        attempts += 1;

        const c = core();
        const generating = !!(c && typeof c.isGenerating === 'function' ? c.isGenerating(editorEl()) : false);
        const currentText = editorText();
        const sendButton = findSendButton();
        const sendReady = sendButton && !isDisabled(sendButton) && !isStopButton(sendButton);

        if (!generating && sendReady) {
          if (handoff.route === 'search') {
            if (currentText !== normalizeText(prompt)) {
              await sleep(ATTEMPT_DELAY_MS);
              continue;
            }

            if (sendViaButton(sendButton)) {
              clearHandledParams();
              return;
            }
          } else if (!currentText || currentText === prompt) {
            if (!writeEditorText(prompt)) {
              await sleep(ATTEMPT_DELAY_MS);
              continue;
            }

            await sleep(180);

            if (editorText() !== normalizeText(prompt)) {
              await sleep(ATTEMPT_DELAY_MS);
              continue;
            }

            if (sendViaButton(sendButton)) {
              clearHandledParams();
              return;
            }
          } else {
            await sleep(ATTEMPT_DELAY_MS);
            continue;
          }
        }

        await sleep(ATTEMPT_DELAY_MS);
      }
    } finally {
      processRunning = false;
    }
  }

  void processPendingQuery();

  const scheduleRetry = () => {
    if (!getPendingPromptFromUrl().prompt) return;
    if (retryTimer) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      void processPendingQuery();
    }, 120);
  };

  document.addEventListener('readystatechange', scheduleRetry, true);
  window.addEventListener('load', scheduleRetry, true);
  window.addEventListener('hashchange', () => {
    attempts = 0;
    scheduleRetry();
  });
})();
