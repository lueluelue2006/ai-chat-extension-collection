(() => {
  'use strict';

  const RUNTIME_STATE_KEY = '__aichat_cmdenter_send_runtime_state_v1__';
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
    const prev = typeof globalThis === 'object' ? globalThis[RUNTIME_STATE_KEY] : null;
    if (prev && typeof prev.disposeRuntime === 'function') prev.disposeRuntime();
  } catch {}
  try {
    if (typeof globalThis === 'object') {
      Object.defineProperty(globalThis, RUNTIME_STATE_KEY, { value: runtimeState, configurable: true, enumerable: false, writable: false });
      globalThis.__aichat_cmdenter_send_installed__ = true;
    }
  } catch {
    try { globalThis[RUNTIME_STATE_KEY] = runtimeState; } catch {}
  }

  function runtimeOn(target, type, listener, options) {
    if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return;
    try {
      target.addEventListener(type, listener, options);
      runtimeDisposers.push(() => {
        try { target.removeEventListener(type, listener, options); } catch {}
      });
    } catch {}
  }

  function getChatgptCore() {
    try {
      return globalThis.__aichat_chatgpt_core_v1__ || null;
    } catch {
      return null;
    }
  }

  function detectSiteFromLocation() {
    const host = String((typeof location === 'object' && location && location.hostname) || '').toLowerCase();
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
  }

  let SITE = detectSiteFromLocation();

  function getCurrentSite() {
    const next = detectSiteFromLocation();
    if (next && next !== 'unknown' && next !== SITE) SITE = next;
    return SITE;
  }

  let lastShortcutSendAt = 0;

  function isElementNode(target) {
    if (!target || typeof target !== 'object') return false;
    try {
      if (typeof Element === 'function' && target instanceof Element) return true;
    } catch {}
    return target.nodeType === 1 && typeof target.closest === 'function';
  }

  function asElement(target) {
    if (isElementNode(target)) return target;
    try {
      if (isElementNode(target?.parentElement)) return target.parentElement;
    } catch {}
    return null;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForValue(read, timeoutMs = 1000, intervalMs = 24) {
    const startAt = Date.now();
    while (Date.now() - startAt <= timeoutMs) {
      const value = read();
      if (value) return value;
      await sleep(intervalMs);
    }
    return read();
  }

  function normalizeText(input) {
    return String(input || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isVisibleElement(el) {
    if (!isElementNode(el)) return false;
    try {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
      if (style) {
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (style.opacity === '0') return false;
      }
    } catch {}
    try {
      if (el.closest?.('[hidden], [aria-hidden="true"]')) return false;
    } catch {}
    try {
      const rect = el.getBoundingClientRect?.();
      if (rect) {
        if (rect.width <= 1 || rect.height <= 1) return false;
      }
    } catch {}
    return true;
  }

  function dispatchUserClick(el) {
    if (!isElementNode(el)) return false;
    try {
      el.focus?.({ preventScroll: true });
    } catch {}

    const base = { bubbles: true, cancelable: true, view: typeof window === 'object' ? window : null };
    try {
      el.dispatchEvent(new MouseEvent('mousedown', base));
      el.dispatchEvent(new MouseEvent('mouseup', base));
      el.dispatchEvent(new MouseEvent('click', base));
      return true;
    } catch {}
    try {
      el.click?.();
      return true;
    } catch {
      return false;
    }
  }

  function walkOpenShadows(start, visit) {
    const stack = [start];
    const seen = new Set();
    while (stack.length) {
      const root = stack.pop();
      if (!root || seen.has(root)) continue;
      seen.add(root);
      try {
        visit(root);
      } catch {}
      if (!root.querySelectorAll) continue;
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el && el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
  }

  function deepQueryFirst(start, selector) {
    let found = null;
    walkOpenShadows(start, (root) => {
      if (found || !root.querySelector) return;
      const hit = root.querySelector(selector);
      if (hit) found = hit;
    });
    return found;
  }

  function deepQueryAll(start, selector) {
    const out = [];
    walkOpenShadows(start, (root) => {
      if (!root.querySelectorAll) return;
      out.push(...root.querySelectorAll(selector));
    });
    return out;
  }

  function normalizeModelLabel(input) {
    return normalizeText(input)
      .toLowerCase()
      .replace(/[‐‑‒–—−]/g, '-')
      .replace(/[()（）]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isGeminiProLabel(input) {
    const text = normalizeModelLabel(input);
    if (!text) return false;
    return /\bpro\b/.test(text) || /专业版|高级版/.test(text);
  }

  function isErnieFiveLabel(input) {
    const text = normalizeModelLabel(input);
    if (!text) return false;
    if (/\bernie\s*5(?:\.0)?\b/.test(text)) return true;
    if (/文心(?:大模型)?\s*5(?:\.0)?/.test(text)) return true;
    return false;
  }

  function isTextareaLikeElement(el) {
    if (!isElementNode(el)) return false;
    try {
      const tag = String(el.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA') return true;
    } catch {}
    try {
      if (!(typeof HTMLTextAreaElement === 'function' && el instanceof HTMLTextAreaElement)) return false;
    } catch {
      return false;
    }
    // Some test/mocked environments implement very broad `instanceof` checks.
    // Guard with textarea-specific shape to avoid false positives.
    try {
      if (typeof el.value !== 'string') return false;
    } catch {
      return false;
    }
    return true;
  }

  function collectEventProbeTargets(event, deepActive, activeElement) {
    const out = [];
    const seen = new Set();

    const push = (candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      if (seen.has(candidate)) return;
      seen.add(candidate);
      out.push(candidate);
    };

    push(event?.target || null);
    try {
      if (event && typeof event.composedPath === 'function') {
        const path = event.composedPath();
        if (Array.isArray(path)) {
          for (const item of path) push(item);
        }
      }
    } catch {}

    push(deepActive || null);
    push(activeElement || null);
    return out;
  }

  function getQwenEnterIntent(event) {
    if (!event || event.key !== 'Enter') return 'ignore';
    if (!event.isTrusted) return 'ignore';
    if (event.isComposing || event.keyCode === 229) return 'ignore';
    if (event.metaKey || event.ctrlKey) return 'send';
    return 'newline';
  }

  function decideQwenSendMethod({ hasForm, canRequestSubmit, hasScopedSubmitButton, hasFallbackButton }) {
    if (hasForm && canRequestSubmit && hasScopedSubmitButton) return 'requestSubmit';
    if (hasScopedSubmitButton) return 'scopedClick';
    if (hasFallbackButton) return 'fallbackClick';
    return 'none';
  }

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

    // Native "Edit message" mode uses a plain textarea inside the message article,
    // outside the normal composer form. Keep this scoped to articles that expose
    // the expected Cancel / Send controls so we don't grab unrelated textareas.
    try {
      const byTextarea = target.closest('textarea');
      const article = byTextarea?.closest?.('article');
      const buttons = article ? Array.from(article.querySelectorAll('button')) : [];
      const hasCancel = buttons.some((btn) => /^(cancel|取消)$/i.test(String(btn.innerText || btn.textContent || '').trim()));
      const hasSend = buttons.some((btn) => /^(send|发送)$/i.test(String(btn.innerText || btn.textContent || '').trim()));
      if (byTextarea && article && hasCancel && hasSend) return byTextarea;
    } catch {}

    // #prompt-textarea might be a textarea or a wrapper; accept only when it looks editable.
    try {
      const byId = target.closest('#prompt-textarea');
      if (byId) {
        if (isTextareaLikeElement(byId)) return byId;
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

  function isQwenReadonlyEditorTextarea(el) {
    if (!isElementNode(el)) return false;
    try {
      if (el.matches('textarea.inputarea[aria-label="Editor content"][readonly]')) return true;
    } catch {}
    try {
      if (el.matches('textarea.inputarea[readonly]')) return true;
    } catch {}
    try {
      if (el.matches('textarea[aria-label="Editor content"][readonly]')) return true;
    } catch {}
    return false;
  }

  function isQwenPromptTextarea(el) {
    if (!isElementNode(el)) return false;
    try {
      if (!el.matches('textarea.message-input-textarea')) return false;
    } catch {
      return false;
    }
    if (isQwenReadonlyEditorTextarea(el)) return false;
    try {
      if (el.matches('[readonly]')) return false;
    } catch {}
    try {
      if (el.readOnly) return false;
    } catch {}
    return true;
  }

  function getQwenComposerScopeFrom(target) {
    const el = asElement(target);
    if (!el) return null;

    const prompt = getQwenPromptElementFrom(el);
    if (prompt) {
      try {
        const byForm = prompt.closest('form');
        if (byForm) return byForm;
      } catch {}

      let cursor = prompt.parentElement || null;
      for (let depth = 0; cursor && depth < 8; depth += 1) {
        try {
          if (cursor.querySelector?.('button.send-button, button[type="submit"], button.omni-button-content-btn')) return cursor;
        } catch {}
        cursor = cursor.parentElement || null;
      }
      return prompt.parentElement || null;
    }

    try {
      const byForm = el.closest('form');
      if (byForm && byForm.querySelector?.('textarea.message-input-textarea:not([readonly])')) return byForm;
    } catch {}

    let cursor = el;
    for (let depth = 0; cursor && depth < 8; depth += 1) {
      try {
        if (cursor.querySelector?.('textarea.message-input-textarea:not([readonly])')) return cursor;
      } catch {}
      cursor = cursor.parentElement || null;
    }

    return null;
  }

  function getQwenPromptElementFrom(target) {
    const el = asElement(target);
    if (!el) return null;

    try {
      const readonlyEditor = el.closest(
        'textarea.inputarea[aria-label="Editor content"][readonly], textarea.inputarea[readonly], textarea[aria-label="Editor content"][readonly]'
      );
      if (readonlyEditor) return null;
    } catch {}

    try {
      const byQwenTextarea = el.closest('textarea.message-input-textarea');
      if (byQwenTextarea && isQwenPromptTextarea(byQwenTextarea)) return byQwenTextarea;
    } catch {}

    try {
      const byLegacyTextarea = el.closest('textarea#chat-input, textarea[name="chat-input"], #chat-message-input textarea');
      if (byLegacyTextarea && !isQwenReadonlyEditorTextarea(byLegacyTextarea)) return byLegacyTextarea;
    } catch {}

    return null;
  }

  function getQwenPromptElementFromEvent(event, deepActive, activeElement) {
    const candidates = collectEventProbeTargets(event, deepActive, activeElement);
    for (const candidate of candidates) {
      const prompt = getQwenPromptElementFrom(candidate);
      if (prompt) return prompt;
    }
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
    const el = asElement(target);
    if (!el) return null;

    const byRole =
      el.closest('[contenteditable="true"][role="textbox"]') ||
      el.closest('div[contenteditable="true"][class*="editable"]') ||
      null;
    if (byRole) {
      if (isInsideQuickNavPanel(byRole)) return null;
      if (
        byRole.closest('[class*="dialogueInputContainer"]') ||
        byRole.closest('[class*="dialogueInputWrapper"]') ||
        byRole.closest('[class*="inputArea__"]') ||
        byRole.closest('[class*="editorContainer__"]') ||
        byRole.closest('[class*="inputGuidance__"]') ||
        byRole.closest('#eb_chat_viewer')
      ) {
        return byRole;
      }

      // AB 变体兜底：如果祖先附近存在“发送”控件，也认定为主输入区。
      let cursor = byRole.parentElement || null;
      for (let depth = 0; cursor && depth < 8; depth += 1) {
        try {
          if (
            cursor.querySelector?.(
              '[class*="sendInner__"], [class*="sendBtnLottie__"], [class*="send__"], [class*="sendBtn"], [data-testid*="send" i], button[type="submit"], [aria-label*="发送" i], [title*="发送" i]'
            )
          ) {
            return byRole;
          }
        } catch {}
        cursor = cursor.parentElement || null;
      }
    }
    return null;
  }

  function getErnieComposerScopeFromPrompt(promptEl) {
    const doc = typeof document === 'object' && document ? document : null;
    const el = asElement(promptEl);
    if (!el) return doc;
    return (
      el.closest('[class*="dialogueInputContainer"]') ||
      el.closest('[class*="dialogueInputWrapper"]') ||
      el.closest('[class*="inputGuidance__"]') ||
      el.closest('#eb_chat_viewer') ||
      doc
    );
  }

  function resolveErnieSendButton(promptEl) {
    const root = getErnieComposerScopeFromPrompt(promptEl);
    const doc = typeof document === 'object' && document ? document : null;
    const selectorsInPriorityOrder = [
      // 内层可点击节点优先，避免命中外层容器导致点击无效。
      '[class*="sendInner__"]',
      '[class*="sendBtnLottie__"]',
      '[data-testid*="send" i]',
      'button[type="submit"]',
      '[aria-label*="发送" i]',
      '[title*="发送" i]',
      '[class*="sendBtn"]',
      '[class*="send__"]'
    ];

    const pickFirst = (container) => {
      if (!container || typeof container.querySelector !== 'function') return null;
      for (const selector of selectorsInPriorityOrder) {
        try {
          const node = container.querySelector(selector);
          if (node) return node;
        } catch {}
      }
      return null;
    };

    const scoped = pickFirst(root);
    const global = pickFirst(doc);
    return scoped || global || null;
  }

  function getGrokPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;
    const byProseMirror = target.closest('.ProseMirror[contenteditable="true"]');
    if (byProseMirror) return byProseMirror;
    const byTextarea = target.closest('textarea');
    if (byTextarea) {
      const response = byTextarea.closest('[id^="response-"]');
      const hasEditControls = !!response?.querySelector('button');
      const controls = hasEditControls
        ? Array.from(response.querySelectorAll('button')).map((btn) => normalizeText(btn.innerText || btn.textContent || btn.getAttribute?.('aria-label') || ''))
        : [];
      const hasCancel = controls.some((text) => /^(cancel|取消)$/i.test(text));
      const hasSave = controls.some((text) => /^(save|send|保存|发送)$/i.test(text));
      if (response && hasCancel && hasSave) return byTextarea;
    }
    return null;
  }

  function getGrokEditScopeFromPrompt(promptEl) {
    return promptEl?.closest?.('[id^="response-"]') || null;
  }

  function resolveGrokEditSaveButton(promptEl) {
    const scope = getGrokEditScopeFromPrompt(promptEl);
    if (!scope) return null;
    const buttons = Array.from(scope.querySelectorAll('button'));
    for (const button of buttons) {
      if (!isButtonLikeElement(button) || isElementDisabled(button)) continue;
      const label = normalizeText(button.innerText || button.textContent || button.getAttribute?.('aria-label') || '');
      if (!/^(save|send|保存|发送)$/i.test(label)) continue;
      return button;
    }
    return null;
  }

  function isInsideQuickNavPanel(target) {
    const el = asElement(target);
    if (!el) return false;
    try {
      return !!el.closest('#cgpt-compact-nav');
    } catch {
      return false;
    }
  }

  function isKimiComposerEditor(el) {
    if (!isElementNode(el)) return false;
    if (isInsideQuickNavPanel(el)) return false;
    try {
      if (!el.matches('.chat-input-editor[contenteditable="true"][role="textbox"]')) return false;
    } catch {
      return false;
    }
    try {
      const composerScope = el.closest('.chat-editor, .chat-action');
      if (!composerScope) return false;
    } catch {
      return false;
    }
    return true;
  }

  function getKimiPromptElementFrom(target) {
    const el = asElement(target);
    if (!el) return null;

    try {
      const byEditor = el.closest('.chat-input-editor[contenteditable="true"][role="textbox"]');
      if (isKimiComposerEditor(byEditor)) return byEditor;
    } catch {}

    try {
      const byRole = el.closest('[contenteditable="true"][role="textbox"]');
      if (byRole && String(byRole.className || '').includes('chat-input-editor') && isKimiComposerEditor(byRole)) return byRole;
    } catch {}

    return null;
  }

  function getKimiComposerScopeFromPrompt(promptEl) {
    return promptEl?.closest?.('.chat-action') || promptEl?.closest?.('.chat-editor') || document;
  }

  function isKimiQuickNavKeyboardContext(event, deepActive, activeElement) {
    if (SITE !== 'kimi') return false;
    const probes = collectEventProbeTargets(event, deepActive, activeElement);
    return probes.some((candidate) => isInsideQuickNavPanel(candidate));
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

  const INITIAL_MODEL_PRESET_RETRY_DELAYS_MS = Object.freeze([0, 160, 420, 900, 1600, 2600, 4200, 7000, 11000]);

  function collectVisibleNodes(root, selectors) {
    const out = [];
    const seen = new Set();
    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = Array.from(root.querySelectorAll(selector) || []);
      } catch {
        nodes = [];
      }
      for (const node of nodes) {
        if (!isElementNode(node)) continue;
        if (!isVisibleElement(node)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        out.push(node);
      }
    }
    return out;
  }

  function getErnieCurrentModelText() {
    const selectors = [
      '[class*="modelSign__"]',
      '[class*="modelSelector"] [class*="text"]',
      '[class*="model-selector"] [class*="text"]',
      '[class*="modelName"]',
      '[aria-label*="模型" i]',
      '[title*="模型" i]'
    ];
    const nodes = collectVisibleNodes(document, selectors);
    for (const node of nodes) {
      const text = normalizeText(node.textContent || node.getAttribute?.('aria-label') || node.getAttribute?.('title') || '');
      if (!text) continue;
      if (isErnieFiveLabel(text)) return text;
    }
    return '';
  }

  function getErnieModelMenuOption() {
    const selectors = [
      '[role="option"]',
      '[role="menuitem"]',
      '[class*="menu"] [class*="item"]',
      '[class*="dropdown"] [class*="item"]',
      '[class*="select"] [class*="option"]',
      'li',
      'button'
    ];
    const nodes = collectVisibleNodes(document, selectors);
    const direct = nodes.find((node) => {
      const text = normalizeText(node.textContent || node.getAttribute?.('aria-label') || '');
      return !!text && isErnieFiveLabel(text);
    });
    if (direct) return direct;
    return null;
  }

  function getErnieModelTrigger() {
    const selectors = [
      '[class*="modelSign__"]',
      '[class*="modelSelector"]',
      '[class*="model-selector"]',
      '[aria-label*="模型" i]',
      '[title*="模型" i]',
      'button'
    ];
    const candidates = collectVisibleNodes(document, selectors);
    const filtered = candidates.filter((node) => {
      const text = normalizeText(node.textContent || node.getAttribute?.('aria-label') || node.getAttribute?.('title') || '');
      if (!text) return false;
      if (isErnieFiveLabel(text)) return true;
      return /ernie|模型|model|turbo|lite|pro|5\.0|4\.0/i.test(text);
    });
    if (!filtered.length) return null;
    return filtered[0];
  }

  async function tryErnieSelectModelOnce() {
    if (isErnieFiveLabel(getErnieCurrentModelText())) return true;

    const trigger = getErnieModelTrigger();
    if (!trigger) return false;
    dispatchUserClick(trigger);

    const option = await waitForValue(() => getErnieModelMenuOption(), 1200, 30);
    if (!option) return false;

    if (!dispatchUserClick(option)) return false;

    const selected = await waitForValue(() => getErnieCurrentModelText(), 1500, 36);
    return isErnieFiveLabel(selected);
  }

  function getGeminiRoot() {
    return document.querySelector('ucs-standalone-app')?.shadowRoot || document;
  }

  function findGeminiModelSelectorHost() {
    const root = getGeminiRoot();
    const selectors = [
      'md-text-button.action-model-selector#model-selector-menu-anchor',
      '#model-selector-menu-anchor',
      '[id*="model-selector"][aria-haspopup]',
      'button[aria-haspopup="menu"][aria-label*="model" i]',
      'button[aria-haspopup="menu"][aria-label*="模型" i]'
    ];

    for (const selector of selectors) {
      const found = deepQueryAll(root, selector).find((node) => isElementNode(node) && isVisibleElement(node));
      if (found) return found;
    }
    return null;
  }

  function getGeminiCurrentModelText() {
    const host = findGeminiModelSelectorHost();
    if (!host) return '';
    const text = normalizeText(host.textContent || host.getAttribute?.('aria-label') || host.getAttribute?.('title') || '');
    return text;
  }

  function isGeminiMenuOpen(menuEl) {
    if (!isElementNode(menuEl)) return false;
    const ariaHidden = String(menuEl.getAttribute?.('aria-hidden') || '').toLowerCase();
    if (ariaHidden === 'true') return false;
    if (menuEl.hasAttribute?.('open')) return true;
    return isVisibleElement(menuEl);
  }

  function findGeminiModelMenu() {
    const root = getGeminiRoot();
    const menu =
      deepQueryFirst(root, 'md-menu.model-selector-menu') ||
      deepQueryFirst(root, 'md-menu[role="menu"]') ||
      deepQueryFirst(root, '[role="menu"]');
    return isElementNode(menu) ? menu : null;
  }

  function findGeminiProOption(menuEl) {
    if (!isElementNode(menuEl)) return null;
    const options = collectVisibleNodes(menuEl, ['md-menu-item', '[role="menuitemradio"]', '[role="menuitem"]', 'button', 'li']);
    const preferred = options.find((node) => {
      const text = normalizeText(node.textContent || node.getAttribute?.('aria-label') || '');
      if (!text) return false;
      if (!isGeminiProLabel(text)) return false;
      return /gemini|pro|2\.5|1\.5/i.test(text);
    });
    if (preferred) return preferred;
    return options.find((node) => isGeminiProLabel(normalizeText(node.textContent || node.getAttribute?.('aria-label') || ''))) || null;
  }

  async function tryGeminiSelectProOnce() {
    if (isGeminiProLabel(getGeminiCurrentModelText())) return true;

    const trigger = findGeminiModelSelectorHost();
    if (!trigger) return false;
    dispatchUserClick(trigger.shadowRoot?.querySelector?.('button') || trigger);

    const menu = await waitForValue(() => {
      const m = findGeminiModelMenu();
      return m && isGeminiMenuOpen(m) ? m : null;
    }, 1600, 32);
    if (!menu) return false;

    const option = await waitForValue(() => findGeminiProOption(menu), 1200, 30);
    if (!option) return false;
    if (!dispatchUserClick(option.shadowRoot?.querySelector?.('#item') || option)) return false;

    const selected = await waitForValue(() => getGeminiCurrentModelText(), 1800, 40);
    return isGeminiProLabel(selected);
  }

  function bootstrapInitialModelPresetForSite() {
    if (SITE !== 'gemini_app' && SITE !== 'ernie') return;

    const job = SITE === 'gemini_app' ? tryGeminiSelectProOnce : tryErnieSelectModelOnce;
    let index = 0;
    let stopped = false;

    const runStep = () => {
      if (stopped) return;
      const delay = INITIAL_MODEL_PRESET_RETRY_DELAYS_MS[Math.min(index, INITIAL_MODEL_PRESET_RETRY_DELAYS_MS.length - 1)];
      index += 1;
      setTimeout(async () => {
        if (stopped) return;
        try {
          const ok = await job();
          if (ok) {
            stopped = true;
            return;
          }
        } catch {}
        if (index < INITIAL_MODEL_PRESET_RETRY_DELAYS_MS.length) runStep();
      }, delay);
    };

    runStep();
  }

  function getDeepActiveElement(rootDoc) {
    const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    try {
      let active = doc.activeElement;
      // Descend into open shadow roots to get the real focused node.
      while (active && active.shadowRoot && active.shadowRoot.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      return active;
    } catch {
      return doc.activeElement || null;
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
    if (isTextareaLikeElement(promptEl)) {
      insertNewlineIntoTextarea(promptEl);
      return;
    }
    if (SITE === 'kimi' || SITE === 'ernie') {
      // Kimi / Ernie use custom contenteditable editors; they may ignore untrusted key events.
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
    if (isButtonLikeElement(el)) return !!el.disabled;
    const ariaDisabled = el.getAttribute?.('aria-disabled');
    if (ariaDisabled && ariaDisabled !== 'false') return true;
    return false;
  }

  function isStopButton(button) {
    if (!isButtonLikeElement(button)) return false;
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
    if (!isElementNode(el)) return false;
    try {
      if (isButtonLikeElement(el) && isStopButton(el)) return true;
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
    try {
      // Icon-based stop markers (some sites only change an SVG icon name/class).
      const svgs = Array.from(el.querySelectorAll?.('svg[name],svg[aria-label],svg[title],svg[class]') || []);
      for (const svg of svgs.slice(0, 6)) {
        const combined = `${svg.getAttribute('name') || ''} ${svg.getAttribute('aria-label') || ''} ${svg.getAttribute('title') || ''} ${
          svg.getAttribute('class') || ''
        }`;
        if (/(stop|cancel)/i.test(combined)) return true;
        if (/(停止|取消|中止|终止)/.test(combined)) return true;
      }
    } catch {}
    return false;
  }

  function isSendLikeControl(el) {
    if (!(el instanceof Element)) return false;
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

      // Special-case: Kimi uses a persistent wrapper class `send-button-container` even when the icon morphs.
      // Treat that wrapper class as ambiguous; require explicit send markers from inner icon/attrs.
      if (/\bsend-button-container\b/.test(className)) {
        try {
          const svg = el.querySelector?.('svg[name],svg[aria-label],svg[title],svg[class]');
          const svgCombined = svg
            ? `${svg.getAttribute('name') || ''} ${svg.getAttribute('aria-label') || ''} ${svg.getAttribute('title') || ''} ${
                svg.getAttribute('class') || ''
              }`
            : '';
          if (/(send|submit)/i.test(svgCombined)) return true;
          if (/(发送|提交|发送消息)/.test(svgCombined)) return true;
        } catch {}
        return false;
      }

      if (/(send|submit)/i.test(combined)) return true;
      if (/(发送|提交|发送消息)/.test(combined)) return true;
    } catch {}
    try {
      const inner = el.querySelector?.(
        '[data-testid*="send" i],[aria-label*="send" i],[title*="send" i],[name*="send" i],[data-icon*="send" i],[icon*="send" i],[aria-label*="submit" i],[title*="submit" i],[name*="submit" i],[data-icon*="submit" i],[icon*="submit" i],[aria-label*="发送" i],[title*="发送" i],[aria-label*="提交" i],[title*="提交" i]'
      );
      if (inner) return true;
    } catch {}
    return false;
  }

  function getPromptText(promptEl) {
    if (!promptEl) return '';
    try {
      if (isTextareaLikeElement(promptEl)) return String(promptEl.value || '');
    } catch {}
    try {
      // Prefer innerText for contenteditable; fall back to textContent.
      return String(promptEl.innerText || promptEl.textContent || '');
    } catch {
      return '';
    }
  }

  function isButtonLikeElement(el) {
    if (!el || typeof el !== 'object') return false;
    try {
      if (typeof HTMLButtonElement === 'function' && el instanceof HTMLButtonElement) return true;
    } catch {}
    return isElementNode(el) && String(el.tagName || '').toUpperCase() === 'BUTTON';
  }

  function getStopLikeSelector() {
    return (
      '[data-testid*="stop" i],[aria-label*="Stop" i],[aria-label*="Cancel" i],[title*="Stop" i],[title*="Cancel" i],[name*="stop" i],[name*="cancel" i],[data-icon*="stop" i],[data-icon*="cancel" i],[icon*="stop" i],[icon*="cancel" i],' +
      '[aria-label*="停止" i],[title*="停止" i],[aria-label*="取消" i],[title*="取消" i],[aria-label*="中止" i],[title*="中止" i],[aria-label*="终止" i],[title*="终止" i]'
    );
  }

  function queryStopLikeControl(root) {
    if (!root) return null;
    const selector = getStopLikeSelector();
    const isEligible = (candidate) => {
      if (!(candidate instanceof Element)) return false;
      if (isInsideQuickNavPanel(candidate)) return false;
      try {
        if (candidate.closest?.('[hidden], [aria-hidden="true"]')) return false;
      } catch {}
      return true;
    };
    try {
      const first = root.querySelector?.(selector) || null;
      if (isEligible(first)) return first;
    } catch {}
    try {
      const all = root.querySelectorAll?.(selector) || [];
      for (const node of all) {
        if (isEligible(node)) return node;
      }
    } catch {}
    return null;
  }

  function findStopLikeControl(...roots) {
    for (const root of roots) {
      const found = queryStopLikeControl(root);
      if (found) return found;
    }
    return null;
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
        const root = getKimiComposerScopeFromPrompt(promptEl);
        // Keep stop detection scoped to composer area.
        // Avoid document-wide stop scans: unrelated controls (e.g. QuickNav "收藏/取消收藏")
        // can otherwise be misclassified as generating-state stop buttons.
        const stopLike = findStopLikeControl(root);
        if (stopLike) return true;

        const control = root.querySelector?.('.send-button-container') || document.querySelector('.send-button-container');
        if (control) {
          if (isStopLikeControl(control)) return true;
          // If we can't positively identify it as a send control, treat it as "generating"
          // to avoid turning Cmd+Enter into a Stop shortcut.
          if (!isSendLikeControl(control)) return true;
        }
        return false;
      }

      if (SITE === 'qwen') {
        const root = getQwenComposerScopeFrom(promptEl) || document;
        const stopLike = findStopLikeControl(root, document);
        if (stopLike) return true;

        const submitButton =
          root.querySelector?.('button.send-button, button[type="submit"]') || document.querySelector?.('button.send-button, button[type="submit"]') || null;
        if (submitButton && isStopLikeControl(submitButton)) return true;

        const fallbackButton =
          root.querySelector?.('button.send-button, button.omni-button-content-btn') ||
          document.querySelector?.('button.send-button, button.omni-button-content-btn') ||
          null;
        if (fallbackButton && isStopLikeControl(fallbackButton)) return true;

        return false;
      }

      if (SITE === 'gemini_app') {
        const root = promptEl?.getRootNode?.() || document;
        const stopLike = findStopLikeControl(root, document);
        if (stopLike) return true;

        const button =
          root.querySelector?.('button.send-button') ||
          root.querySelector?.('button[aria-label="Send message"]') ||
          document.querySelector?.('button.send-button') ||
          document.querySelector?.('button[aria-label="Send message"]') ||
          null;
        if (button) {
          if (isStopLikeControl(button)) return true;
          // Same safety rule as Kimi: if we can't confirm it's a send control, assume it's a stop/cancel morph.
          if (!isSendLikeControl(button)) return true;
        }
        return false;
      }

      if (SITE === 'ernie') {
        const root = promptEl ? getErnieComposerScopeFromPrompt(promptEl) : document.querySelector('#eb_chat_viewer') || document;
        const stopLike = findStopLikeControl(root, document);
        if (stopLike) return true;

        const sendControl = resolveErnieSendButton(promptEl);
        if (sendControl && isStopLikeControl(sendControl)) return true;
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

  function getChatgptSendButtonNear(promptEl) {
    const form = promptEl?.closest?.('form') || null;
    const button = form?.querySelector('button[data-testid="send-button"], button#composer-submit-button') || null;
    if (isButtonLikeElement(button) && !button.disabled && !isStopButton(button) && isSendLikeControl(button)) return button;

    // ChatGPT native edit mode uses an article-local "Send" button outside the composer form.
    try {
      const article = promptEl?.closest?.('article') || null;
      if (article) {
        const candidates = Array.from(article.querySelectorAll('button'));
        for (const candidate of candidates) {
          if (!isButtonLikeElement(candidate) || candidate.disabled) continue;
          if (isStopButton(candidate)) continue;
          const label = String(candidate.innerText || candidate.textContent || '').trim();
          if (!/^(send|发送)$/i.test(label)) continue;
          return candidate;
        }
      }
    } catch {}

    return isButtonLikeElement(button) && !button.disabled && !isStopButton(button) && isSendLikeControl(button) ? button : null;
  }

  function hasChatgptAttachmentPreview(promptEl) {
    const form = promptEl?.closest?.('form') || null;
    if (!form) return false;
    const selectors = [
      'button[aria-label*="Remove file" i]',
      'button[aria-label*="移除文件"]',
      'button[aria-label*="Open image in full view" i]',
      'button[aria-label*="打开图片"]',
      'button[aria-label*="Edit image" i]',
      'button[aria-label*="编辑图片"]'
    ];
    try {
      return !!form.querySelector(selectors.join(','));
    } catch {
      return false;
    }
  }

  function canSendWithoutTextForSite(promptEl, siteId = SITE) {
    if (siteId !== 'chatgpt') return false;
    return !!getChatgptSendButtonNear(promptEl) && hasChatgptAttachmentPreview(promptEl);
  }

  function clickSendButtonNear(promptEl) {
    const button = getChatgptSendButtonNear(promptEl);
    if (!button) return false;
    button.click();
    return true;
  }

  function isUsableQwenSendButton(button) {
    if (!button || !(button instanceof HTMLButtonElement)) return false;
    if (isElementDisabled(button)) return false;
    if (isStopLikeControl(button)) return false;
    return true;
  }

  function resolveQwenSendControls(promptEl) {
    const root = getQwenComposerScopeFrom(promptEl) || promptEl?.closest?.('form') || promptEl?.parentElement || document;
    const form = promptEl?.closest?.('form') || root?.closest?.('form') || root?.querySelector?.('form') || null;

    const scopedSubmitButton =
      form?.querySelector?.('button.send-button, button[type="submit"]') ||
      root?.querySelector?.('button.send-button, button[type="submit"]') ||
      null;

    const fallbackButton =
      root?.querySelector?.('button.send-button, button.omni-button-content-btn') ||
      document.querySelector?.('button.send-button, button.omni-button-content-btn') ||
      null;

    return {
      form,
      scopedSubmitButton,
      fallbackButton
    };
  }

  function clickQwenSendControl(promptEl) {
    const { form, scopedSubmitButton, fallbackButton } = resolveQwenSendControls(promptEl);

    const canUseScopedSubmitButton = isUsableQwenSendButton(scopedSubmitButton);
    const canUseFallbackButton = isUsableQwenSendButton(fallbackButton);
    const method = decideQwenSendMethod({
      hasForm: !!form,
      canRequestSubmit: typeof form?.requestSubmit === 'function',
      hasScopedSubmitButton: canUseScopedSubmitButton,
      hasFallbackButton: canUseFallbackButton
    });

    if (method === 'requestSubmit') {
      try {
        form.requestSubmit(scopedSubmitButton);
        return true;
      } catch {}
      scopedSubmitButton.click();
      return true;
    }

    if (method === 'scopedClick') {
      scopedSubmitButton.click();
      return true;
    }

    if (method === 'fallbackClick') {
      fallbackButton.click();
      return true;
    }

    return false;
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
        const root = promptEl?.getRootNode?.() || document;
        const button =
          root.querySelector?.('button.send-button') ||
          root.querySelector?.('button[aria-label="Send message"]') ||
          document.querySelector?.('button.send-button') ||
          document.querySelector?.('button[aria-label="Send message"]') ||
          null;
        if (!button || !(button instanceof HTMLButtonElement) || isElementDisabled(button)) return false;
        if (isStopLikeControl(button)) return false;
        if (!isSendLikeControl(button)) return false;
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
        const root = getKimiComposerScopeFromPrompt(promptEl);
        const button = root.querySelector('.send-button-container') || document.querySelector('.send-button-container') || null;
        if (!button || !(button instanceof Element)) return false;
        if (isStopLikeControl(button)) return false;
        if (!isSendLikeControl(button)) return false;
        try {
          const cls = String(button.className || '');
          if (/\bdisabled\b/i.test(cls)) return false;
        } catch {}
        try {
          const ariaDisabled = button.getAttribute?.('aria-disabled');
          if (ariaDisabled && ariaDisabled !== 'false') return false;
        } catch {}
        try {
          if (getComputedStyle(button).pointerEvents === 'none') return false;
        } catch {}
        if (dispatchUserClick(button)) return true;
        try {
          button.click();
          return true;
        } catch {}
        return false;
      }

      if (SITE === 'qwen') {
        return clickQwenSendControl(promptEl);
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
        const editButton = resolveGrokEditSaveButton(promptEl);
        if (editButton) {
          editButton.click();
          return true;
        }
        const form = promptEl.closest('form') || null;
        const button =
          form?.querySelector('button[aria-label="Submit"]') || form?.querySelector('button[type="submit"]') || null;
        if (!button || !(button instanceof HTMLButtonElement) || isElementDisabled(button)) return false;
        if (isStopButton(button)) return false;
        button.click();
        return true;
      }

      if (SITE === 'ernie') {
        const button = resolveErnieSendButton(promptEl);
        if (!button || !(button instanceof Element)) return false;
        if (isElementDisabled(button)) return false;
        if (isStopLikeControl(button)) return false;

        const innerSelector = '[class*="sendInner__"], [class*="sendBtnLottie__"]';
        const containerSelector = '[class*="send__"], [class*="sendBtn"]';
        const innerNode = button.matches?.(innerSelector) ? button : button.querySelector?.(innerSelector) || null;
        const containerNode = button.matches?.(containerSelector)
          ? button
          : button.closest?.(containerSelector) || button.querySelector?.(containerSelector) || null;

        const targets = [];
        const push = (node) => {
          if (!(node instanceof Element)) return;
          if (targets.includes(node)) return;
          targets.push(node);
        };

        // 优先点击最里层可视按钮，再回退到容器，兼容 React 委托和 AB 变体。
        push(innerNode);
        push(button);
        push(containerNode);

        for (const t of targets) {
          try {
            t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          } catch {}
          try {
            if (typeof t.click === 'function') t.click();
          } catch {}
        }
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
    // Also don't send when the input is empty (spaces count as empty). This prevents accidental
    // clicks on stop/cancel morph controls after a send (when the input is typically empty).
    let hasText = false;
    try {
      hasText = !!getPromptText(promptEl).replace(/\u00a0/g, ' ').trim();
    } catch {}
    if (!hasText && !canSendWithoutTextForSite(promptEl)) return;
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
    if (!hasText) return;
    dispatchEnter(promptEl, { shiftKey: false });
  }

  function sendMessageFromShortcut(promptEl) {
    sendMessage(promptEl);
  }

  function handleKeyDown(event) {
    getCurrentSite();
    if (event.key !== 'Enter') return;
    if (!event.isTrusted) return;
    if (event.isComposing || event.keyCode === 229) return;

    if (SITE === 'unknown') return;

    const qwenIntent = SITE === 'qwen' ? getQwenEnterIntent(event) : 'ignore';
    const wantsSend = SITE === 'qwen' ? qwenIntent === 'send' : event.metaKey || event.ctrlKey;

    // Important: On some sites the UI maps Cmd/Ctrl+Enter to "Stop generating" even when the composer
    // is not focused. We never want a "stop" shortcut (users reported accidental stops on Kimi/Gemini).
    // So when the site is currently generating, swallow Cmd/Ctrl+Enter globally.
    if (wantsSend && (SITE === 'kimi' || SITE === 'gemini_app' || SITE === 'gemini_business' || SITE === 'ernie')) {
      try {
        if (isGeneratingForSite(null)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      } catch {}
    }

    const deepActive = getDeepActiveElement();
    const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
    if (isKimiQuickNavKeyboardContext(event, deepActive, activeElement)) return;

    const promptEl =
      SITE === 'qwen'
        ? getQwenPromptElementFromEvent(event, deepActive, activeElement)
        : getPromptElementFrom(event.target) || getPromptElementFrom(deepActive) || getPromptElementFrom(activeElement);
    if (!promptEl) return;

    if (SITE === 'qwen' && qwenIntent === 'ignore') return;
    if (SITE === 'qwen' && qwenIntent === 'send') return;

    if (wantsSend && event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    // Kimi uses Lexical (controlled editor). Direct DOM editing (execCommand / synthetic key events)
    // is often overwritten on the next render. The most reliable way to get a newline is to allow
    // the browser default behavior, while blocking app-level "send on Enter" handlers.
    if (SITE === 'kimi' && !wantsSend) {
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (wantsSend) {
      lastShortcutSendAt = Date.now();
      sendMessageFromShortcut(promptEl);
    }
    else insertNewline(promptEl);
  }

  function handleKeyUp(event) {
    getCurrentSite();
    if (SITE !== 'kimi' && SITE !== 'ernie') return;
    if (!event || event.key !== 'Enter') return;
    if (!event.isTrusted) return;
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.isComposing || event.keyCode === 229) return;
    if (Date.now() - lastShortcutSendAt < 900) return;

    const deepActive = getDeepActiveElement();
    const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
    const promptEl = getPromptElementFrom(event.target) || getPromptElementFrom(deepActive) || getPromptElementFrom(activeElement);
    if (!promptEl) return;

    try {
      event.preventDefault();
      event.stopImmediatePropagation();
    } catch {}

    lastShortcutSendAt = Date.now();
    sendMessageFromShortcut(promptEl);
  }

  const testApi = Object.freeze({
    bootstrapInitialModelPresetForSite,
    collectEventProbeTargets,
    decideQwenSendMethod,
    getChatGPTPromptElementFrom,
    getErnieComposerScopeFromPrompt,
    getErnieCurrentModelText,
    getErnieModelMenuOption,
    getErnieModelTrigger,
    getGeminiCurrentModelText,
    getGeminiRoot,
    isErnieFiveLabel,
    isGeminiProLabel,
    getErniePromptElementFrom,
    getKimiPromptElementFrom,
    getQwenComposerScopeFrom,
    getQwenEnterIntent,
    getQwenPromptElementFrom,
    getQwenPromptElementFromEvent,
    canSendWithoutTextForSite,
    hasChatgptAttachmentPreview,
    isInsideQuickNavPanel,
    isKimiComposerEditor,
    isKimiQuickNavKeyboardContext,
    normalizeModelLabel,
    getChatgptSendButtonNear,
    sendMessageForTest: sendMessage,
    resolveErnieSendButton,
    resolveQwenSendControls
  });

  if (typeof module === 'object' && module && module.exports) module.exports = testApi;

  if (typeof window === 'object' && window && typeof window.addEventListener === 'function') {
    bootstrapInitialModelPresetForSite();
    runtimeOn(window, 'keydown', handleKeyDown, true);
    runtimeOn(window, 'keyup', handleKeyUp, true);
  }
})();
