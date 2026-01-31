(() => {
  'use strict';

  try {
    if (globalThis.__aichat_cmdenter_send_installed__) return;
    globalThis.__aichat_cmdenter_send_installed__ = true;
  } catch {}

  function getChatgptCore() {
    try {
      return globalThis.__aichat_chatgpt_core_v1__ || null;
    } catch {
      return null;
    }
  }

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
    if (host === 'www.kimi.com' || host === 'kimi.com') return 'kimi';
    return 'unknown';
  })();

  function getChatGPTPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;

    // Prefer the real editor (ProseMirror).
    try {
      const byProseMirror = target.closest('.ProseMirror[contenteditable="true"]');
      if (byProseMirror) return byProseMirror;
    } catch {}

    // Textarea fallback (often hidden mirror).
    try {
      const byName = target.closest('textarea[name="prompt-textarea"]');
      if (byName) return byName;
    } catch {}

    // #prompt-textarea might be a textarea or a wrapper; accept only when it looks editable.
    try {
      const byId = target.closest('#prompt-textarea');
      if (byId) {
        if (byId instanceof HTMLTextAreaElement) return byId;
        if (byId.isContentEditable) return byId;
        if (String(byId.className || '').includes('ProseMirror')) return byId;
      }
    } catch {}

    // Fallback via shared core: only accept when the event target is within the composer form.
    try {
      const core = getChatgptCore();
      if (core && typeof core.getEditorEl === 'function' && typeof core.getComposerForm === 'function') {
        const editor = core.getEditorEl();
        const form = core.getComposerForm(editor);
        if (form && form.contains(target)) return editor;
      }
    } catch {}

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

  function getKimiPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byEditor = target.closest('.chat-input-editor[contenteditable="true"][role="textbox"]');
    if (byEditor) return byEditor;
    const byRole = target.closest('[contenteditable="true"][role="textbox"]');
    if (byRole && String(byRole.className || '').includes('chat-input-editor')) return byRole;
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
    if (SITE === 'kimi') return getKimiPromptElementFrom(target);
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
    if (SITE === 'kimi') {
      // Kimi uses a custom contenteditable editor; it may ignore untrusted key events.
      // Prefer editing commands to ensure a newline is inserted.
      try {
        promptEl.focus?.();
      } catch {}
      try {
        if (typeof document.execCommand === 'function') {
          try {
            if (typeof document.queryCommandSupported === 'function' && document.queryCommandSupported('insertLineBreak')) {
              if (document.execCommand('insertLineBreak')) return;
            }
          } catch {}
          try {
            if (document.execCommand('insertText', false, '\n')) return;
          } catch {}
        }
      } catch {}
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
    if (/(stop|cancel)/i.test(aria)) return true;
    if (/(停止|取消|中止|终止)/.test(aria)) return true;
    if (button.querySelector('svg[aria-label*="Stop"]')) return true;
    if (button.querySelector('svg[aria-label*="Cancel"]')) return true;
    if (button.querySelector('svg[aria-label*="停止"]')) return true;
    if (button.querySelector('svg[aria-label*="取消"]')) return true;
    return false;
  }

  function isStopLikeControl(el) {
    if (!(el instanceof Element)) return false;
    try {
      if (el instanceof HTMLButtonElement && isStopButton(el)) return true;
    } catch {}
    try {
      const testId = String(el.getAttribute?.('data-testid') || '');
      const aria = String(el.getAttribute?.('aria-label') || '');
      const title = String(el.getAttribute?.('title') || '');
      const name = String(el.getAttribute?.('name') || '');
      const dataIcon = String(el.getAttribute?.('data-icon') || '');
      const icon = String(el.getAttribute?.('icon') || '');
      const className = String(el.className || '');
      const text = String(el.textContent || '').slice(0, 200);
      const combined = `${testId} ${aria} ${title} ${name} ${dataIcon} ${icon} ${className} ${text}`;
      if (/(stop|cancel)/i.test(combined)) return true;
      if (/(停止|取消|中止|终止)/.test(combined)) return true;
    } catch {}
    try {
      // Some sites wrap the stop button as a div containing a labeled inner element (svg/button).
      const inner = el.querySelector?.(
        '[data-testid*="stop" i],[aria-label*="Stop" i],[aria-label*="Cancel" i],[title*="Stop" i],[title*="Cancel" i],[name*="stop" i],[name*="cancel" i],[data-icon*="stop" i],[data-icon*="cancel" i],[icon*="stop" i],[icon*="cancel" i],[aria-label*="停止" i],[title*="停止" i],[aria-label*="取消" i],[title*="取消" i],[aria-label*="中止" i],[title*="中止" i],[aria-label*="终止" i],[title*="终止" i]'
      );
      if (inner) return true;
    } catch {}
    return false;
  }

  function isGeneratingForSite(promptEl) {
    try {
      if (SITE === 'chatgpt') {
        const form = promptEl?.closest?.('form') || null;
        try {
          const core = getChatgptCore();
          if (core && typeof core.isGenerating === 'function') return !!core.isGenerating(promptEl);
        } catch {}
        return isGenerating(form);
      }

      if (SITE === 'kimi') {
        const root = promptEl?.closest?.('.chat-action') || promptEl?.closest?.('.chat-editor') || document;
        // Kimi: the send control often morphs into a stop control while streaming.
        // Be aggressive here: if any stop-like control is present in the composer area, treat as generating.
        const stopLike =
          root.querySelector?.(
            '[data-testid*="stop" i],[aria-label*="Stop" i],[aria-label*="Cancel" i],[title*="Stop" i],[title*="Cancel" i],[name*="stop" i],[name*="cancel" i],[data-icon*="stop" i],[data-icon*="cancel" i],[icon*="stop" i],[icon*="cancel" i],[aria-label*="停止" i],[title*="停止" i],[aria-label*="取消" i],[title*="取消" i],[aria-label*="中止" i],[title*="中止" i],[aria-label*="终止" i],[title*="终止" i]'
          ) ||
          document.querySelector?.(
            '[data-testid*="stop" i],[aria-label*="Stop" i],[aria-label*="Cancel" i],[title*="Stop" i],[title*="Cancel" i],[name*="stop" i],[name*="cancel" i],[data-icon*="stop" i],[data-icon*="cancel" i],[icon*="stop" i],[icon*="cancel" i],[aria-label*="停止" i],[title*="停止" i],[aria-label*="取消" i],[title*="取消" i],[aria-label*="中止" i],[title*="中止" i],[aria-label*="终止" i],[title*="终止" i]'
          ) ||
          null;
        if (stopLike) return true;

        const control = root.querySelector?.('.send-button-container') || document.querySelector('.send-button-container');
        if (control && isStopLikeControl(control)) return true;
        return false;
      }

      if (SITE === 'gemini_app') {
        const root = promptEl?.getRootNode?.() || document;
        // Gemini: there is typically a dedicated Stop generating control while streaming.
        const stopLike =
          root.querySelector?.(
            'button[aria-label*="Stop" i],button[title*="Stop" i],button[aria-label*="Cancel" i],button[title*="Cancel" i],button[aria-label*="停止" i],button[title*="停止" i],button[aria-label*="取消" i],button[title*="取消" i],button[aria-label*="中止" i],button[title*="中止" i],button[aria-label*="终止" i],button[title*="终止" i]'
          ) || null;
        if (stopLike) return true;

        const button =
          root.querySelector?.('button.send-button') || root.querySelector?.('button[aria-label="Send message"]') || null;
        if (button && isStopLikeControl(button)) return true;
        return false;
      }
    } catch {}
    return false;
  }

  function isGenerating(form) {
    if (!form) return false;
    if (SITE === 'chatgpt') {
      try {
        const core = getChatgptCore();
        if (core && typeof core.isGenerating === 'function') return !!core.isGenerating(form);
      } catch {}
    }
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
      if (SITE === 'chatgpt') {
        try {
          const core = getChatgptCore();
          if (core && typeof core.clickSendButton === 'function') {
            if (core.clickSendButton(promptEl)) return true;
          }
        } catch {}
        return clickSendButtonNear(promptEl);
      }

      if (SITE === 'gemini_app') {
        const button =
          document.querySelector('button.send-button') || document.querySelector('button[aria-label="Send message"]') || null;
        if (!button || !(button instanceof HTMLButtonElement) || isElementDisabled(button)) return false;
        if (isStopButton(button)) return false;
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

      if (SITE === 'kimi') {
        const root = promptEl.closest('.chat-action') || promptEl.closest('.chat-editor') || document;
        const button = root.querySelector('.send-button-container') || document.querySelector('.send-button-container') || null;
        if (!button || !(button instanceof Element)) return false;
        if (isStopLikeControl(button)) return false;
        try {
          const ariaDisabled = button.getAttribute?.('aria-disabled');
          if (ariaDisabled && ariaDisabled !== 'false') return false;
        } catch {}
        try {
          if (getComputedStyle(button).pointerEvents === 'none') return false;
        } catch {}
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
    // Do not turn Cmd/Ctrl+Enter into a "stop generation" hotkey on sites where the send button
    // morphs into a stop/cancel control while streaming.
    if (isGeneratingForSite(promptEl)) return;

    if (SITE === 'chatgpt') {
      const form = promptEl.closest('form');
      // Avoid sending while generating.
      try {
        const core = getChatgptCore();
        if (core && typeof core.isGenerating === 'function') {
          if (core.isGenerating(promptEl)) return;
        } else {
          if (isGenerating(form)) return;
        }
      } catch {
        if (isGenerating(form)) return;
      }
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

    // Kimi uses Lexical (controlled editor). Direct DOM editing (execCommand / synthetic key events)
    // is often overwritten on the next render. The most reliable way to get a newline is to allow
    // the browser default behavior, while blocking app-level "send on Enter" handlers.
    if (SITE === 'kimi' && !wantsSend) {
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (wantsSend) sendMessage(promptEl);
    else insertNewline(promptEl);
  }

  window.addEventListener('keydown', handleKeyDown, true);
})();
