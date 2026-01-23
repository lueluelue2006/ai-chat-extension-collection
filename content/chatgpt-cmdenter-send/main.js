(() => {
  'use strict';

  try {
    if (globalThis.__aichat_cmdenter_send_installed__) return;
    globalThis.__aichat_cmdenter_send_installed__ = true;
  } catch {}

  const SITE = (() => {
    const host = String(location.hostname || '').toLowerCase();
    if (host === 'chatgpt.com') return 'chatgpt';
    if (host === 'gemini.google.com') return 'gemini_app';
    if (host === 'business.gemini.google') return 'gemini_business';
    if (host === 'www.genspark.ai') return 'genspark';
    if (host === 'ernie.baidu.com') return 'ernie';
    if (host === 'chat.deepseek.com') return 'deepseek';
    if (host === 'chat.qwen.ai') return 'qwen';
    if (host === 'chat.z.ai') return 'zai';
    if (host === 'grok.com') return 'grok';
    return 'unknown';
  })();

  function getChatGPTPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;

    const byId = target.closest('#prompt-textarea');
    if (byId) return byId;

    const byProseMirror = target.closest('.ProseMirror[contenteditable="true"]');
    if (byProseMirror && byProseMirror.closest('form')?.querySelector('textarea[name="prompt-textarea"]')) {
      return byProseMirror;
    }

    const byName = target.closest('textarea[name="prompt-textarea"]');
    if (byName) return byName;

    return null;
  }

  function getGeminiAppPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byEditor = target.closest('div.ql-editor[contenteditable="true"][role="textbox"]');
    if (byEditor) return byEditor;
    return null;
  }

  function getGeminiBusinessPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byRole = target.closest('[contenteditable="true"][role="textbox"]');
    if (byRole) return byRole;
    const byProseMirror = target.closest('.ProseMirror[contenteditable="true"]');
    if (byProseMirror) return byProseMirror;
    const byTextarea = target.closest('textarea');
    if (byTextarea) return byTextarea;
    return null;
  }

  function getGensparkPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byTextarea = target.closest('textarea.search-input, textarea[name="query"]');
    if (byTextarea) return byTextarea;
    return null;
  }

  function getQwenPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byId = target.closest('textarea#chat-input, textarea[name="chat-input"]');
    if (byId) return byId;
    return null;
  }

  function getZaiPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byId = target.closest('textarea#chat-input');
    if (byId) return byId;
    return null;
  }

  function getDeepseekPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byClass = target.closest('textarea.ds-scroll-area');
    if (byClass) return byClass;
    const byPlaceholder = target.closest('textarea[placeholder*="DeepSeek"], textarea[placeholder*="deepseek"]');
    if (byPlaceholder) return byPlaceholder;
    return null;
  }

  function getErniePromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byRole = target.closest('div[contenteditable="true"][role="textbox"][class*="editable__"]');
    if (byRole) {
      if (
        byRole.closest('[class*="dialogueInputContainer"]') ||
        byRole.closest('[class*="dialogueInputWrapper"]') ||
        byRole.closest('[class*="inputArea__"]') ||
        byRole.closest('[class*="editorContainer__"]')
      ) {
        return byRole;
      }
    }
    return null;
  }

  function getGrokPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byProseMirror = target.closest('.ProseMirror[contenteditable="true"]');
    if (byProseMirror) return byProseMirror;
    return null;
  }

  function getPromptElementFrom(target) {
    if (SITE === 'chatgpt') return getChatGPTPromptElementFrom(target);
    if (SITE === 'gemini_app') return getGeminiAppPromptElementFrom(target);
    if (SITE === 'gemini_business') return getGeminiBusinessPromptElementFrom(target);
    if (SITE === 'genspark') return getGensparkPromptElementFrom(target);
    if (SITE === 'qwen') return getQwenPromptElementFrom(target);
    if (SITE === 'zai') return getZaiPromptElementFrom(target);
    if (SITE === 'deepseek') return getDeepseekPromptElementFrom(target);
    if (SITE === 'ernie') return getErniePromptElementFrom(target);
    if (SITE === 'grok') return getGrokPromptElementFrom(target);
    return null;
  }

  function getDeepActiveElement() {
    try {
      let active = document.activeElement;
      // Descend into open shadow roots to get the real focused node.
      while (active && active.shadowRoot && active.shadowRoot.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      return active;
    } catch {
      return document.activeElement;
    }
  }

  function dispatchKey(target, type, { shiftKey }) {
    const event = new KeyboardEvent(type, {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      shiftKey,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      bubbles: true,
      cancelable: true,
      composed: true
    });
    target.dispatchEvent(event);
  }

  function dispatchEnter(target, { shiftKey }) {
    dispatchKey(target, 'keydown', { shiftKey });
    dispatchKey(target, 'keypress', { shiftKey });
    dispatchKey(target, 'keyup', { shiftKey });
  }

  function insertNewlineIntoTextarea(textarea) {
    const value = textarea.value ?? '';
    const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : value.length;
    const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : value.length;
    const nextValue = value.slice(0, start) + '\n' + value.slice(end);
    textarea.value = nextValue;

    const nextCursor = start + 1;
    textarea.selectionStart = nextCursor;
    textarea.selectionEnd = nextCursor;

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertNewline(promptEl) {
    if (promptEl instanceof HTMLTextAreaElement) {
      insertNewlineIntoTextarea(promptEl);
      return;
    }
    dispatchEnter(promptEl, { shiftKey: true });
  }

  function isElementDisabled(el) {
    if (!el) return true;
    if (el instanceof HTMLButtonElement) return !!el.disabled;
    const ariaDisabled = el.getAttribute?.('aria-disabled');
    if (ariaDisabled && ariaDisabled !== 'false') return true;
    return false;
  }

  function isStopButton(button) {
    if (!(button instanceof HTMLButtonElement)) return false;
    const testId = button.getAttribute('data-testid');
    if (testId && testId.toLowerCase().includes('stop')) return true;
    const aria = button.getAttribute('aria-label') || '';
    if (/stop/i.test(aria)) return true;
    if (button.querySelector('svg[aria-label*="Stop"]')) return true;
    return false;
  }

  function isGenerating(form) {
    if (!form) return false;
    const stopButton = form.querySelector('button[data-testid="stop-button"]');
    if (stopButton) return true;
    const submitButton = form.querySelector('#composer-submit-button');
    return submitButton ? isStopButton(submitButton) : false;
  }

  function clickSendButtonNear(promptEl) {
    const form = promptEl.closest('form');
    const button = form?.querySelector('button[data-testid="send-button"], button#composer-submit-button');
    if (!button || !(button instanceof HTMLButtonElement) || button.disabled) return false;
    if (isStopButton(button)) return false;
    button.click();
    return true;
  }

  function clickSendButtonForSite(promptEl) {
    try {
      if (SITE === 'chatgpt') return clickSendButtonNear(promptEl);

      if (SITE === 'gemini_app') {
        const button =
          document.querySelector('button.send-button') || document.querySelector('button[aria-label="Send message"]') || null;
        if (!button || !(button instanceof HTMLButtonElement) || isElementDisabled(button)) return false;
        button.click();
        return true;
      }

      if (SITE === 'gemini_business') {
        const root = promptEl.getRootNode?.() || document;
        const button =
          root.querySelector?.('button[aria-label="Submit"], button[aria-label="Send message"], button[type="submit"]') || null;
        if (!button || !(button instanceof HTMLButtonElement) || isElementDisabled(button)) return false;
        if (isStopButton(button)) return false;
        button.click();
        return true;
      }

      if (SITE === 'genspark') {
        const button = document.querySelector('.enter-icon-wrapper') || null;
        if (!button || !(button instanceof Element)) return false;
        if (isElementDisabled(button)) return false;
        button.click();
        return true;
      }

      if (SITE === 'qwen') {
        const button =
          document.querySelector('#chat-message-input button.omni-button-content-btn') ||
          document.querySelector('button.omni-button-content-btn') ||
          null;
        if (!button || !(button instanceof HTMLButtonElement) || isElementDisabled(button)) return false;
        button.click();
        return true;
      }

      if (SITE === 'zai') {
        const form = promptEl.closest('form') || null;
        const button = form?.querySelector('button.sendMessageButton') || form?.querySelector('button[type="submit"]') || null;
        if (!button || !(button instanceof HTMLButtonElement) || isElementDisabled(button)) return false;
        if (isStopButton(button)) return false;
        button.click();
        return true;
      }

      if (SITE === 'grok') {
        const form = promptEl.closest('form') || null;
        const button =
          form?.querySelector('button[aria-label="Submit"]') || form?.querySelector('button[type="submit"]') || null;
        if (!button || !(button instanceof HTMLButtonElement) || isElementDisabled(button)) return false;
        if (isStopButton(button)) return false;
        button.click();
        return true;
      }

      if (SITE === 'ernie') {
        const container =
          promptEl.closest('[class*="dialogueInputContainer"]') || promptEl.closest('[class*="dialogueInputWrapper"]') || null;
        const button =
          container?.querySelector?.('[class*="send__"], [class*="sendBtn"], [data-testid*="send"]') ||
          document.querySelector('[class*="send__"], [class*="sendBtn"]') ||
          null;
        if (!button || !(button instanceof Element)) return false;
        if (isElementDisabled(button)) return false;
        button.click();
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  function sendMessage(promptEl) {
    if (SITE === 'chatgpt') {
      const form = promptEl.closest('form');
      if (isGenerating(form)) return;
    }
    if (clickSendButtonForSite(promptEl)) return;
    dispatchEnter(promptEl, { shiftKey: false });
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter') return;
    if (!event.isTrusted) return;
    if (event.isComposing || event.keyCode === 229) return;

    if (SITE === 'unknown') return;

    const deepActive = getDeepActiveElement();
    const promptEl = getPromptElementFrom(event.target) || getPromptElementFrom(deepActive) || getPromptElementFrom(document.activeElement);
    if (!promptEl) return;

    const wantsSend = event.metaKey || event.ctrlKey;
    if (wantsSend && event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (wantsSend) {
      sendMessage(promptEl);
    } else {
      insertNewline(promptEl);
    }
  }

  window.addEventListener('keydown', handleKeyDown, true);
})();
