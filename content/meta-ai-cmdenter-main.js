(() => {
  'use strict';

  const STATE_KEY = '__aishortcuts_meta_ai_cmdenter_main_state_v1__';
  const runtimeDisposers = [];
  const runtimeState = {
    disposed: false,
    disposeRuntime() {
      if (runtimeState.disposed) return;
      runtimeState.disposed = true;
      for (const dispose of runtimeDisposers.splice(0)) {
        try { dispose(); } catch {}
      }
    }
  };

  try {
    const prev = globalThis[STATE_KEY];
    if (prev && typeof prev.disposeRuntime === 'function') prev.disposeRuntime();
  } catch {}
  try {
    Object.defineProperty(globalThis, STATE_KEY, { value: runtimeState, configurable: true, enumerable: false, writable: false });
  } catch {
    try { globalThis[STATE_KEY] = runtimeState; } catch {}
  }

  function on(target, type, listener, options) {
    if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return;
    try {
      target.addEventListener(type, listener, options);
      runtimeDisposers.push(() => {
        try { target.removeEventListener(type, listener, options); } catch {}
      });
    } catch {}
  }

  function timeout(fn, delay) {
    if (typeof fn !== 'function') return 0;
    let id = 0;
    try {
      id = window.setTimeout(() => {
        if (runtimeState.disposed) return;
        fn();
      }, delay);
      runtimeDisposers.push(() => {
        try { window.clearTimeout(id); } catch {}
      });
    } catch {}
    return id;
  }

  const TEXTAREA_PROMPT_SELECTOR =
    'textarea[placeholder*="Ask Meta AI" i], textarea[placeholder*="Describe an image or video" i]';
  const PROMPT_SELECTOR = `${TEXTAREA_PROMPT_SELECTOR}, [role="textbox"]`;
  const SEND_BUTTON_SELECTORS = ['button[aria-label="Send"]', 'button[aria-label*="Send" i]', 'button[type="submit"]'];
  const SEND_BUTTON_SCOPE_SELECTOR = SEND_BUTTON_SELECTORS.join(', ');

  function isMetaAiHost() {
    const host = String(location.hostname || '').toLowerCase();
    return host === 'www.meta.ai' || host === 'meta.ai';
  }

  function normalizeText(input) {
    return String(input || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isElementNode(node) {
    if (!node || typeof node !== 'object') return false;
    try {
      return node.nodeType === 1 && typeof node.closest === 'function';
    } catch {
      return false;
    }
  }

  function asElement(node) {
    if (isElementNode(node)) return node;
    try {
      if (isElementNode(node?.parentElement)) return node.parentElement;
    } catch {}
    return null;
  }

  function getPromptText(promptEl) {
    try {
      if (!promptEl) return '';
      if (typeof promptEl.value === 'string') return promptEl.value;
      return String(promptEl.innerText || promptEl.textContent || '');
    } catch {
      return '';
    }
  }

  function getComposerScope(promptEl) {
    const el = asElement(promptEl);
    if (!el) return null;
    let cursor = el;
    for (let depth = 0; cursor && depth < 14; depth += 1) {
      try {
        const hasTextbox = !!cursor.querySelector?.(PROMPT_SELECTOR);
        const hasSend = !!cursor.querySelector?.(SEND_BUTTON_SCOPE_SELECTOR);
        if (hasTextbox && hasSend) return cursor;
      } catch {}
      cursor = cursor.parentElement || null;
    }
    return null;
  }

  function getPromptFrom(target) {
    const el = asElement(target);
    if (!el) return null;

    let prompt = null;
    try {
      prompt = el.closest(TEXTAREA_PROMPT_SELECTOR) || null;
      if (!prompt) {
        const roleTextbox = el.closest('[role="textbox"]');
        if (roleTextbox?.isContentEditable || roleTextbox?.getAttribute?.('contenteditable')) prompt = roleTextbox;
      }
    } catch {}
    if (!prompt) return null;
    if (!getComposerScope(prompt)) return null;
    return prompt;
  }

  function getActivePrompt(event) {
    const candidates = [];
    const push = (node) => {
      const el = asElement(node);
      if (!el || candidates.includes(el)) return;
      candidates.push(el);
    };

    push(event?.target);
    push(document.activeElement);
    try {
      for (const node of event?.composedPath?.() || []) push(node);
    } catch {}

    for (const candidate of candidates) {
      const prompt = getPromptFrom(candidate);
      if (prompt) return prompt;
    }
    return null;
  }

  function isDisabled(el) {
    if (!el) return true;
    try {
      if (el.disabled) return true;
      if (el.getAttribute?.('aria-disabled') === 'true') return true;
      if (el.matches?.('[disabled], [aria-disabled="true"]')) return true;
    } catch {}
    return false;
  }

  function isStopLike(button) {
    const label = normalizeText(button?.getAttribute?.('aria-label') || button?.innerText || button?.textContent || '').toLowerCase();
    return /\bstop\b|停止|取消/.test(label);
  }

  function getSendButton(promptEl) {
    const root = getComposerScope(promptEl) || document;
    for (const selector of SEND_BUTTON_SELECTORS) {
      try {
        const scoped = root.querySelector?.(selector);
        if (scoped) return scoped;
      } catch {}
    }
    for (const selector of SEND_BUTTON_SELECTORS) {
      try {
        const global = document.querySelector?.(selector);
        if (global) return global;
      } catch {}
    }
    return null;
  }

  function clickSendButton(button) {
    if (!isElementNode(button) || isDisabled(button) || isStopLike(button)) return false;
    try {
      button.focus?.({ preventScroll: true });
    } catch {}
    try {
      button.click();
      return true;
    } catch {
      return false;
    }
  }

  function hasSubmittedUserMessage(expectedText) {
    const expected = normalizeText(expectedText);
    if (!expected) return false;
    try {
      for (const node of document.querySelectorAll('[class*="group/user-message"]')) {
        if (normalizeText(node.innerText || node.textContent || '').includes(expected)) return true;
      }
    } catch {}
    return false;
  }

  function clearPrompt(promptEl, expectedText) {
    if (!isElementNode(promptEl)) return false;
    if (expectedText && normalizeText(getPromptText(promptEl)) !== normalizeText(expectedText)) return false;

    try {
      if (typeof promptEl.value === 'string') {
        promptEl.value = '';
      } else {
        try {
          promptEl.focus?.({ preventScroll: true });
        } catch {}
        try {
          const selection = window.getSelection?.();
          const range = document.createRange?.();
          if (selection && range) {
            range.selectNodeContents(promptEl);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand?.('delete');
            selection.removeAllRanges();
          }
        } catch {}
        if (normalizeText(promptEl.innerText || promptEl.textContent || '')) promptEl.textContent = '';
      }
      try {
        promptEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward', data: null }));
      } catch {}
      try {
        promptEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
      return true;
    } catch {
      return false;
    }
  }

  function scheduleClear(promptEl, expectedText) {
    const expected = normalizeText(expectedText);
    if (!expected) return;
    for (const delay of [180, 620, 1500, 2500]) {
      timeout(() => {
        try {
          const prompt = getPromptFrom(promptEl) || getPromptFrom(document.activeElement);
          if (!prompt) return;
          if (!hasSubmittedUserMessage(expected)) return;
          clearPrompt(prompt, expected);
        } catch {}
      }, delay);
    }
  }

  function scheduleSend(promptEl) {
    const promptText = getPromptText(promptEl);
    if (!normalizeText(promptText)) return;

    for (const delay of [80, 500, 1400]) {
      timeout(() => {
        try {
          const prompt = getPromptFrom(promptEl) || getPromptFrom(document.activeElement);
          if (!prompt) return;
          const currentText = getPromptText(prompt);
          if (!normalizeText(currentText)) return;
          if (hasSubmittedUserMessage(currentText)) {
            scheduleClear(prompt, currentText);
            return;
          }
          const button = getSendButton(prompt);
          if (clickSendButton(button)) scheduleClear(prompt, currentText);
        } catch {}
      }, delay);
    }
  }

  let lastShortcutAt = 0;

  function handleShortcut(event) {
    if (!isMetaAiHost()) return;
    if (!event || event.key !== 'Enter') return;
    if (!event.isTrusted) return;
    if (event.isComposing || event.keyCode === 229) return;
    if (!(event.metaKey || event.ctrlKey)) return;

    const prompt = getActivePrompt(event);
    if (!prompt) return;

    try {
      event.preventDefault();
      event.stopImmediatePropagation();
    } catch {}

    if (event.repeat) return;
    if (Date.now() - lastShortcutAt < 700) return;
    lastShortcutAt = Date.now();
    scheduleSend(prompt);
  }

  on(window, 'keydown', handleShortcut, true);
  on(window, 'keyup', handleShortcut, true);
})();
