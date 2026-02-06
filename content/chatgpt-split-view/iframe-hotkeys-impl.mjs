export function initSplitIframeHotkeys() {
  // NOTE: This module is loaded dynamically only inside the split-view iframe.
  // Keep this file as the "heavy" implementation; `iframe-hotkeys.js` is the tiny bootstrap.

  // Hotkeys inside the right split-view ChatGPT iframe.
  // Goal: prevent browser Cmd+O "Open File..." etc from winning when focus is in the iframe,
  // without injecting the heavier modules (fetch hub / thinking-toggle) into the iframe.

  function isSplitViewIframe() {
    try {
      const fe = window.frameElement;
      if (!fe || fe.nodeType !== 1) return false;
      return String(fe.id || '').startsWith('qn-split-iframe');
    } catch {
      return false;
    }
  }

  // Only run inside the split-view iframe.
  if (!isSplitViewIframe()) return;

  const MULTI_ESC_WINDOW_MS = 600;
  const CLOSE_ESC_PRESS_COUNT = 3;
  const CLOSE_REQUEST_MESSAGE_TYPE = '__qn_split_close_request_v1__';

  // Respect the same config as the main ChatGPT thinking toggle module.
  const HOTKEY_EFFORT_ENABLED_KEY = '__aichat_chatgpt_thinking_toggle_hotkey_effort_v1__';
  const HOTKEY_MODEL_ENABLED_KEY = '__aichat_chatgpt_thinking_toggle_hotkey_model_v1__';

  const HOTKEY_COOLDOWN_MS = 120;
  let busy = false;
  let lastHotkeyAt = 0;
  let lastEscAt = 0;
  let escStreak = 0;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(input) {
    return String(input || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function clickLikeUser(el) {
    if (!(el instanceof Element)) return false;
    try {
      el.focus?.();
    } catch {}

    const rect = el.getBoundingClientRect?.();
    const x = Math.round((rect?.left || 0) + Math.min(12, Math.max(6, (rect?.width || 12) / 2)));
    const y = Math.round((rect?.top || 0) + Math.min(12, Math.max(6, (rect?.height || 12) / 2)));
    const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };

    try {
      el.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    } catch {}

    el.dispatchEvent(new MouseEvent('mousedown', base));
    el.dispatchEvent(new MouseEvent('mouseup', base));
    el.dispatchEvent(new MouseEvent('click', base));
    return true;
  }

  function getDeepActiveElement() {
    try {
      let active = document.activeElement;
      while (active && active.shadowRoot && active.shadowRoot.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      return active;
    } catch {
      return document.activeElement;
    }
  }

  function getChatGPTPromptElementFrom(target) {
    if (!(target instanceof Element)) return null;

    // Prefer the real editor (ProseMirror).
    try {
      const byProseMirror = target.closest('.ProseMirror[contenteditable="true"]');
      if (byProseMirror) return byProseMirror;
    } catch {}

    // Textarea fallback (sometimes hidden mirror).
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

    return null;
  }

  function getPromptElementFrom(target) {
    return getChatGPTPromptElementFrom(target);
  }

  function getPromptText(promptEl) {
    try {
      if (!promptEl) return '';
      if (promptEl instanceof HTMLTextAreaElement) return promptEl.value || '';
      return promptEl.textContent || '';
    } catch {
      return '';
    }
  }

  function dispatchKey(target, type, { shiftKey }) {
    try {
      const event = new KeyboardEvent(type, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        shiftKey: !!shiftKey,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      target.dispatchEvent(event);
    } catch {}
  }

  function dispatchEnter(target, { shiftKey }) {
    dispatchKey(target, 'keydown', { shiftKey });
    dispatchKey(target, 'keypress', { shiftKey });
    dispatchKey(target, 'keyup', { shiftKey });
  }

  function insertNewlineIntoTextarea(textarea) {
    try {
      const value = textarea.value ?? '';
      const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : value.length;
      const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : value.length;
      const nextValue = value.slice(0, start) + '\n' + value.slice(end);
      textarea.value = nextValue;

      const nextCursor = start + 1;
      textarea.selectionStart = nextCursor;
      textarea.selectionEnd = nextCursor;

      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  function insertNewline(promptEl) {
    if (!promptEl) return false;
    if (promptEl instanceof HTMLTextAreaElement) return insertNewlineIntoTextarea(promptEl);

    try {
      promptEl.focus?.();
    } catch {}

    let ok = false;
    try {
      if (typeof document.execCommand === 'function') {
        try {
          if (typeof document.queryCommandSupported === 'function' && document.queryCommandSupported('insertLineBreak')) {
            ok = !!document.execCommand('insertLineBreak');
          }
        } catch {}
        if (!ok) {
          try {
            ok = !!document.execCommand('insertText', false, '\n');
          } catch {}
        }
      }
    } catch {}

    if (!ok) {
      try {
        dispatchEnter(promptEl, { shiftKey: true });
        ok = true;
      } catch {}
    }

    try {
      promptEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } catch {
      try {
        promptEl.dispatchEvent(new Event('input', { bubbles: true }));
      } catch {}
    }

    return ok;
  }

  function isStopButton(button) {
    if (!(button instanceof HTMLButtonElement)) return false;
    const testId = String(button.getAttribute('data-testid') || '').toLowerCase();
    if (testId.includes('stop') || testId.includes('cancel')) return true;
    const aria = String(button.getAttribute('aria-label') || '');
    if (/(stop|cancel)/i.test(aria)) return true;
    if (/(停止|取消|中止|终止)/.test(aria)) return true;
    return false;
  }

  function isGenerating(promptEl) {
    try {
      const form = promptEl?.closest?.('form') || null;
      if (form) {
        if (form.querySelector('button[data-testid="stop-button"]')) return true;
        const submit = form.querySelector('#composer-submit-button');
        if (submit instanceof HTMLButtonElement && isStopButton(submit)) return true;
      }
    } catch {}
    try {
      return !!document.querySelector('button[data-testid="stop-button"]');
    } catch {
      return false;
    }
  }

  function clickSendButtonNear(promptEl) {
    try {
      const form = promptEl?.closest?.('form') || null;
      const button =
        form?.querySelector?.('button[data-testid="send-button"], button#composer-submit-button') ||
        document.querySelector?.('button[data-testid="send-button"], button#composer-submit-button') ||
        null;
      if (!button || !(button instanceof HTMLElement)) return false;
      if (button instanceof HTMLButtonElement && button.disabled) return false;
      if (button instanceof HTMLButtonElement && isStopButton(button)) return false;
      clickLikeUser(button);
      return true;
    } catch {
      return false;
    }
  }

  function sendMessage(promptEl) {
    try {
      const text = getPromptText(promptEl).replace(/\u00a0/g, ' ').trim();
      if (!text) return;
    } catch {}

    if (isGenerating(promptEl)) return;
    if (clickSendButtonNear(promptEl)) return;
    dispatchEnter(promptEl, { shiftKey: false });
  }

  function getHotkeyAction(event) {
    if (!event || !event.metaKey) return null;
    if (event.ctrlKey || event.altKey || event.shiftKey) return null;
    if (event.repeat) return null;

    const code = typeof event.code === 'string' ? event.code : '';
    const key = typeof event.key === 'string' ? event.key : '';
    const k = key.toLowerCase();

    // Keep consistent with chatgpt-thinking-toggle defaults.
    const action = (() => {
      if (code === 'KeyO' || k === 'o') return 'toggle_effort';
      if (code === 'KeyJ' || k === 'j') return 'toggle_model';
      return null;
    })();
    if (!action) return null;

    const enabled = (() => {
      try {
        if (action === 'toggle_effort') return localStorage.getItem(HOTKEY_EFFORT_ENABLED_KEY) !== '0';
        if (action === 'toggle_model') return localStorage.getItem(HOTKEY_MODEL_ENABLED_KEY) !== '0';
      } catch {}
      return true;
    })();
    if (!enabled) return null;

    return action;
  }

  function getComposerRoot() {
    return document.querySelector('#thread-bottom-container') || document.body;
  }

  function listComposerPills() {
    const root = getComposerRoot();
    return Array.from(root.querySelectorAll("button.__composer-pill[aria-haspopup='menu'],button.__composer-pill")).filter(
      (el) => el instanceof HTMLButtonElement
    );
  }

  function getEffortItems(menu) {
    const items = Array.from(menu.querySelectorAll("[role='menuitemradio']"));
    let light = null;
    let standard = null;
    let extended = null;
    let heavy = null;

    for (const item of items) {
      const t = normalizeText(item.textContent || '');
      if (!light && /\blight\b/.test(t)) light = item;
      if (!standard && /\bstandard\b/.test(t)) standard = item;
      if (!extended && /\bextended\b/.test(t)) extended = item;
      if (!heavy && /\bheavy\b/.test(t)) heavy = item;
    }

    return { light, standard, extended, heavy };
  }

  function menuHasEffortOptions(menu) {
    if (!(menu instanceof Element)) return false;
    const { light, standard, extended, heavy } = getEffortItems(menu);
    return (!!standard && !!extended) || (!!light && !!heavy);
  }

  function findMenuForPill(pill) {
    if (!(pill instanceof Element)) return null;
    const labelId = typeof pill.id === 'string' ? pill.id : '';
    if (!labelId) return null;

    for (const menu of Array.from(document.querySelectorAll("[role='menu']"))) {
      if (menu.getAttribute('aria-labelledby') === labelId) return menu;
    }
    return null;
  }

  async function openMenu(pill) {
    clickLikeUser(pill);
    await sleep(60);
    if (pill.getAttribute('aria-expanded') === 'true') return true;
    if (pill.getAttribute('data-state') === 'open') return true;

    clickLikeUser(pill);
    await sleep(120);
    return pill.getAttribute('aria-expanded') === 'true' || pill.getAttribute('data-state') === 'open';
  }

  async function findEffortPill() {
    const pills = listComposerPills();
    if (!pills.length) return null;
    if (pills.length === 1) return pills[0];

    const ordered = [];
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && active.matches('button.__composer-pill')) ordered.push(active);

    const likely = pills.filter((p) => /thinking|pro/i.test((p.textContent || '').trim()));
    for (const p of likely) if (!ordered.includes(p)) ordered.push(p);
    for (const p of pills) if (!ordered.includes(p)) ordered.push(p);

    for (const pill of ordered) {
      const opened = await openMenu(pill);
      if (!opened) continue;

      let menu = null;
      for (let i = 0; i < 8; i++) {
        menu = findMenuForPill(pill);
        if (menu) break;
        await sleep(40);
      }
      if (menu && menuHasEffortOptions(menu)) return pill;

      // Not the effort menu: close and keep trying.
      clickLikeUser(pill);
      await sleep(60);
    }

    return ordered[0] || null;
  }

  async function toggleEffort() {
    const pill = await findEffortPill();
    if (!pill) return;

    const opened = await openMenu(pill);
    if (!opened) return;

    let menu = null;
    for (let i = 0; i < 10; i++) {
      menu = findMenuForPill(pill);
      if (menu && menuHasEffortOptions(menu)) break;
      await sleep(50);
    }
    if (!menu) return;

    const { light, standard, extended, heavy } = getEffortItems(menu);
    if (light && heavy) {
      const heavyChecked = heavy.getAttribute('aria-checked') === 'true';
      clickLikeUser(heavyChecked ? light : heavy);
      return;
    }
    if (standard && extended) {
      const extendedChecked = extended.getAttribute('aria-checked') === 'true';
      clickLikeUser(extendedChecked ? standard : extended);
    }
  }

  function findModelSelectorTrigger() {
    const byTestId = document.querySelector("button[data-testid='model-switcher-dropdown-button']");
    if (byTestId instanceof HTMLElement) return byTestId;

    const byAria = Array.from(document.querySelectorAll('button[aria-label],[role=\"button\"][aria-label]')).find((el) =>
      normalizeText(el.getAttribute('aria-label') || '').startsWith('model selector')
    );
    return byAria instanceof HTMLElement ? byAria : null;
  }

  function isVisibleElement(el) {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width < 4 || rect.height < 4) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    } catch {}
    return true;
  }

  function findVisibleByTestId(testId) {
    const id = String(testId || '').trim();
    if (!id) return null;
    const el = document.querySelector(`[data-testid='${CSS.escape(id)}']`);
    return isVisibleElement(el) ? el : null;
  }

  function findVisibleMenuItemMatchText(wanted) {
    const w = normalizeText(wanted);
    if (!w) return null;

    const menus = Array.from(document.querySelectorAll("[role='menu']")).filter((m) => {
      if (!(m instanceof HTMLElement)) return false;
      const rect = m.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return false;
      const style = window.getComputedStyle(m);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return true;
    });
    if (!menus.length) return null;

    const items = menus
      .flatMap((menu) => Array.from(menu.querySelectorAll("[role='menuitemradio'],[role='menuitem']")))
      .filter((el) => el instanceof HTMLElement);

    // Prefer exact startsWith match for stability.
    for (const el of items) {
      const t = normalizeText(el.textContent || '');
      if (t === w || t.startsWith(w + ' ')) return el;
    }
    // Fallback: contains
    for (const el of items) {
      const t = normalizeText(el.textContent || '');
      if (t.includes(w)) return el;
    }
    return null;
  }

  async function toggleModel() {
    const trigger = findModelSelectorTrigger();
    if (!trigger) return;

    const label = normalizeText(trigger.textContent || trigger.getAttribute('aria-label') || '');
    const targetMode = label.includes('thinking') ? 'pro' : 'thinking';

    // Prefer stable data-testid options for GPT-5.2 Thinking/Pro.
    const preferredTestId =
      targetMode === 'pro' ? 'model-switcher-gpt-5-2-pro' : 'model-switcher-gpt-5-2-thinking';

    let item = findVisibleByTestId(preferredTestId);
    if (!item) {
      clickLikeUser(trigger);
      for (let i = 0; i < 14; i++) {
        item = findVisibleByTestId(preferredTestId);
        if (item) break;
        await sleep(50);
      }
    }

    if (!item) {
      // Some builds require a second click.
      clickLikeUser(trigger);
      for (let i = 0; i < 14; i++) {
        item = findVisibleByTestId(preferredTestId);
        if (item) break;
        await sleep(50);
      }
    }

    if (item) {
      clickLikeUser(item);
      return;
    }

    // Fallback: match by visible menu item text.
    let byText = findVisibleMenuItemMatchText(targetMode);
    if (!byText) {
      clickLikeUser(trigger);
      for (let i = 0; i < 12; i++) {
        byText = findVisibleMenuItemMatchText(targetMode);
        if (byText) break;
        await sleep(50);
      }
    }
    if (byText) clickLikeUser(byText);
  }

  function requestCloseSplit() {
    try {
      const doc = window.top && window.top.document;
      const topbar = doc && doc.getElementById('qn-split-topbar');
      const btns = topbar && topbar.querySelectorAll && topbar.querySelectorAll('button');
      const closeBtn = btns && btns.length ? btns[btns.length - 1] : null;
      if (closeBtn) {
        closeBtn.click();
        return;
      }
    } catch {}

    // Fallback (in case the UI structure changes).
    try {
      // Use '*' because the split-view may be hosted in an extension page (cross-origin top).
      window.top.postMessage({ __qn: 1, type: CLOSE_REQUEST_MESSAGE_TYPE }, '*');
    } catch {}
  }

  window.addEventListener(
    'keydown',
    (event) => {
      try {
        if (!event) return;
        if (event.key !== 'Escape') return;
        if (event.repeat) return;

        const now = Date.now();
        if (now - lastEscAt < MULTI_ESC_WINDOW_MS) {
          escStreak += 1;
        } else {
          escStreak = 1;
        }
        lastEscAt = now;

        if (escStreak >= CLOSE_ESC_PRESS_COUNT) {
          lastEscAt = 0;
          escStreak = 0;
          requestCloseSplit();
          event.preventDefault();
          event.stopPropagation();
          try {
            event.stopImmediatePropagation();
          } catch {}
        }
      } catch {}
    },
    true
  );

  window.addEventListener(
    'keydown',
    (event) => {
      const action = getHotkeyAction(event);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const now = Date.now();
      if (now - lastHotkeyAt < HOTKEY_COOLDOWN_MS) return;
      lastHotkeyAt = now;
      if (busy) return;

      busy = true;
      Promise.resolve()
        .then(async () => {
          if (action === 'toggle_effort') await toggleEffort();
          else if (action === 'toggle_model') await toggleModel();
        })
        .finally(() => {
      busy = false;
        });
    },
    true
  );

  // Cmd/Ctrl+Enter send inside split iframe (Enter inserts newline).
  // Keep behavior aligned with the main-page `chatgpt-cmdenter-send` module, but ChatGPT-only + minimal.
  window.addEventListener(
    'keydown',
    (event) => {
      try {
        if (!event || event.key !== 'Enter') return;
        if (!event.isTrusted) return;
        if (event.isComposing || event.keyCode === 229) return;

        const wantsSend = !!(event.metaKey || event.ctrlKey);
        const deepActive = getDeepActiveElement();
        const promptEl =
          getPromptElementFrom(event.target) ||
          getPromptElementFrom(deepActive) ||
          getPromptElementFrom(document.activeElement);
        if (!promptEl) return;

        // When generating, swallow Cmd/Ctrl+Enter to avoid accidental Stop shortcuts.
        if (wantsSend && isGenerating(promptEl)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }

        if (wantsSend && event.repeat) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (wantsSend) sendMessage(promptEl);
        else insertNewline(promptEl);
      } catch {
        // ignore
      }
    },
    true
  );
}
