(() => {
  'use strict';
  const STATE_KEY = '__aichat_chatgpt_image_message_edit_state__';
  const STATE_VERSION = 2;
  const STYLE_VERSION = 4;

  // Allow hot-reinject (MV3 reload / reinject) by cleaning up the previous instance.
  try {
    const prev = window[STATE_KEY];
    if (prev && typeof prev === 'object') {
      try {
        prev.cleanup?.();
      } catch {}
    }
  } catch {}

  const ROOT_PARENT_MESSAGE_ID = 'client-created-root';
  const COMPOSER_SUBMIT_SELECTOR = '#composer-submit-button,button[data-testid="send-button"],button[data-testid="stop-button"]';
  const STOP_BUTTON_SELECTOR =
    'button[data-testid="stop-button"],button[aria-label*="Stop" i],button[title*="Stop" i],button[aria-label*="Cancel" i],button[title*="Cancel" i],button[aria-label*="停止" i],button[title*="停止" i],button[aria-label*="取消" i],button[title*="取消" i]';
  const SEND_BUTTON_SELECTOR =
    '#composer-submit-button,button[data-testid="send-button"],button[aria-label*="Send" i],button[title*="Send" i],button[aria-label*="发送" i],button[title*="发送" i]';
  const COMPOSER_ATTACHMENT_SELECTOR =
    '[data-testid*="composer-attachment" i],[data-testid*="attachment" i],[data-testid*="uploaded-file" i],[data-testid*="file-chip" i],button[aria-label*="Remove file" i],button[aria-label*="移除文件" i],button[aria-label*="删除文件" i]';
  const AUTO_BRANCH_SEND_TIMEOUT_MS = 15000;
  const AUTO_BRANCH_STOP_RETRY_MS = 4000;
  const AUTO_BRANCH_MAX_STOP_CLICKS = 2;

  const state = {
    version: STATE_VERSION,
    pending: null,
    autoBranchSend: null,
    autoBranchSendTimer: null,
    bannerEl: null,
    lastHref: location.href,
    seenTurns: null,
    retryTurns: null,
    retryAttempts: null,
    scanTimer: null,
    retryTimer: null,
    retryDelayMs: 0,
    bootstrapTimer: null,
    hoverHandler: null,
    bannerPosRaf: 0,
    bannerResizeObserver: null,
    bannerResizeTarget: null,
    mo: null,
    moRoot: null,
    turnsUnsub: null,
    hubUnsub: null,
    unwatchHref: null,
    sendIntentClickHandler: null,
    sendIntentKeyHandler: null,
    cleanup: null
  };

  try {
    Object.defineProperty(window, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[STATE_KEY] = state;
    } catch {}
  }

  function now() {
    return Date.now();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getConversationIdFromUrl() {
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (core && typeof core.getConversationIdFromUrl === 'function') {
        return core.getConversationIdFromUrl(location.href);
      }
    } catch {}
    try {
      const parts = String(location.pathname || '')
        .split('/')
        .filter(Boolean);
      const idx = parts.indexOf('c');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      return '';
    } catch {
      return '';
    }
  }

  function getComposerEl() {
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      const el = core && typeof core.getEditorEl === 'function' ? core.getEditorEl() : null;
      if (el) return el;
    } catch {}
    return (
      document.querySelector('.ProseMirror[contenteditable="true"]') ||
      document.querySelector('#prompt-textarea[contenteditable="true"]') ||
      document.querySelector('#prompt-textarea') ||
      document.querySelector('textarea[name="prompt-textarea"]')
    );
  }

  function getUploadPhotosInput() {
    return (
      document.getElementById('upload-photos') ||
      document.querySelector('input[type="file"][accept*="image"]') ||
      document.querySelector('input[type="file"][multiple]')
    );
  }

  function getCoreApi() {
    try {
      return window.__aichat_chatgpt_core_main_v1__ || null;
    } catch {
      return null;
    }
  }

  function getComposerFormEl() {
    const editor = getComposerEl();
    try {
      const core = getCoreApi();
      if (core && typeof core.getComposerForm === 'function') {
        const form = core.getComposerForm(editor);
        if (form) return form;
      }
    } catch {}
    try {
      return editor?.closest?.('form') || null;
    } catch {
      return null;
    }
  }

  function isElementDisabled(el) {
    if (!el) return true;
    try {
      if (el instanceof HTMLButtonElement && el.disabled) return true;
    } catch {}
    try {
      const ariaDisabled = String(el.getAttribute?.('aria-disabled') || '').toLowerCase();
      if (ariaDisabled && ariaDisabled !== 'false') return true;
    } catch {}
    return false;
  }

  function getComposerDraftText() {
    const el = getComposerEl();
    if (!el) return '';
    try {
      if (typeof el.value === 'string') return String(el.value || '');
    } catch {}
    try {
      return String(el.innerText || el.textContent || '');
    } catch {
      return '';
    }
  }

  function hasDraftAttachment() {
    const input = getUploadPhotosInput();
    try {
      if (input?.files?.length) return true;
    } catch {}
    const form = getComposerFormEl();
    if (!form) return false;
    try {
      return !!form.querySelector(COMPOSER_ATTACHMENT_SELECTOR);
    } catch {
      return false;
    }
  }

  function hasDraftForSend() {
    try {
      const text = getComposerDraftText().replace(/[\u00a0\u200b]/g, ' ').trim();
      if (text) return true;
    } catch {}
    return hasDraftAttachment();
  }

  function getComposerSubmitButton() {
    try {
      const form = getComposerFormEl();
      const btn = form?.querySelector(COMPOSER_SUBMIT_SELECTOR) || document.querySelector(COMPOSER_SUBMIT_SELECTOR);
      return btn instanceof HTMLElement ? btn : null;
    } catch {
      return null;
    }
  }

  function classifyComposerSubmitButton(btn) {
    if (!(btn instanceof HTMLElement)) return 'unknown';
    try {
      const testId = String(btn.getAttribute?.('data-testid') || '').toLowerCase();
      if (testId.includes('stop')) return 'stop';
      if (testId.includes('send')) return 'send';
    } catch {}
    try {
      const cls = String(btn.className || '').toLowerCase();
      if (cls.includes('secondary-button-color')) return 'stop';
      if (cls.includes('submit-button-color')) return 'send';
    } catch {}
    try {
      const text = `${String(btn.getAttribute?.('aria-label') || '')} ${String(btn.getAttribute?.('title') || '')} ${String(btn.textContent || '')}`;
      if (/stop|cancel|停止|取消/i.test(text)) return 'stop';
      if (/send|发送/i.test(text)) return 'send';
    } catch {}
    return 'unknown';
  }

  function findCopyButton(turnEl) {
    return (
      turnEl?.querySelector?.('button[data-testid="copy-turn-action-button"]') ||
      turnEl?.querySelector?.('button[aria-label="Copy"]') ||
      turnEl?.querySelector?.('button[aria-label="复制"]') ||
      null
    );
  }

  function focusComposer() {
    const el = getComposerEl();
    if (!el) return;
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {}
    try {
      el.focus();
    } catch {}
  }

  function clearComposerText() {
    const el = getComposerEl();
    if (!el) return false;
    el.focus();
    try {
      document.execCommand('selectAll', false, null);
    } catch {}
    try {
      el.dispatchEvent(
        new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward', data: '' })
      );
    } catch {}
    try {
      document.execCommand('insertText', false, '');
    } catch {}
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } catch {}
    el.blur();
    el.focus();
    return true;
  }

  function setComposerText(text) {
    const el = getComposerEl();
    if (!el) return false;
    el.focus();
    try {
      document.execCommand('selectAll', false, null);
    } catch {}
    const finalText = String(text ?? '');
    try {
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: finalText }));
    } catch {}
    try {
      document.execCommand('insertText', false, finalText);
    } catch {}
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } catch {}
    el.blur();
    el.focus();
    return true;
  }

  function ensureStyles() {
    const STYLE_ID = 'aichat-img-edit-style';
    const styleText = `
      /* Make the QuickNav edit pencil visually distinct from ChatGPT's native edit icon. */
      button[data-aichat-img-edit="1"]{
        color: #22c55e !important; /* green-500 */
      }
      button[data-aichat-img-edit="1"]:hover{
        color: #4ade80 !important; /* green-400 */
      }
      #aichat-img-edit-banner{
        position: fixed;
        left: 50%;
        transform: translateX(-50%);
        bottom: var(--aichat-img-edit-banner-bottom, 96px);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(17, 17, 17, 0.92);
        color: #fff;
        font: 12px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        max-width: min(680px, calc(100vw - 24px));
      }
      #aichat-img-edit-banner .msg{
        flex: 1 1 auto;
        min-width: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      #aichat-img-edit-banner button{
        appearance: none;
        border: 0;
        border-radius: 10px;
        padding: 6px 10px;
        background: rgba(255,255,255,0.14);
        color: #fff;
        cursor: pointer;
      }
      #aichat-img-edit-banner button:hover{
        background: rgba(255,255,255,0.2);
      }
    `;

    // Hot-reinject friendly: if a previous version already inserted the style tag, update it in place.
    const existing = document.getElementById(STYLE_ID);
    if (existing) {
      if (existing.dataset?.aichatImgEditStyleVer === String(STYLE_VERSION)) return;
      try {
        existing.textContent = styleText;
        existing.dataset.aichatImgEditStyleVer = String(STYLE_VERSION);
      } catch {}
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    try {
      style.dataset.aichatImgEditStyleVer = String(STYLE_VERSION);
    } catch {}
    style.textContent = styleText;
    document.documentElement.appendChild(style);
  }

  function clamp(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }

  function getComposerLayoutEl() {
    const el = getComposerEl();
    if (!el) return null;
    return el.closest?.('form') || el.parentElement || el;
  }

  function updateBannerPosition() {
    const el = state.bannerEl;
    if (!el || !el.isConnected) return;

    const composer = getComposerLayoutEl();
    if (!(composer instanceof Element)) return;
    let rect = null;
    try {
      rect = composer.getBoundingClientRect();
    } catch {
      rect = null;
    }
    if (!rect || !Number.isFinite(rect.top)) return;

    // Place the banner just above the composer so it never covers the editor.
    const GAP = 16;
    const rawBottom = (window.innerHeight || 0) - rect.top + GAP;
    const maxBottom = Math.max(96, Math.round((window.innerHeight || 0) - 80));
    const bottom = Math.round(clamp(rawBottom, 96, maxBottom));
    try {
      el.style.setProperty('--aichat-img-edit-banner-bottom', `${bottom}px`);
    } catch {}
  }

  function scheduleBannerPositionUpdate() {
    if (state.bannerPosRaf) return;
    state.bannerPosRaf = requestAnimationFrame(() => {
      state.bannerPosRaf = 0;
      updateBannerPosition();
    });
  }

  function ensureBannerPositionObservers() {
    if (!window.__aichatImgEditBannerResizeBound) {
      window.__aichatImgEditBannerResizeBound = true;
      window.addEventListener('resize', scheduleBannerPositionUpdate, { passive: true });
    }

    const target = getComposerLayoutEl();
    if (!target || typeof ResizeObserver !== 'function') return;
    if (state.bannerResizeTarget === target && state.bannerResizeObserver) return;

    try {
      state.bannerResizeObserver?.disconnect?.();
    } catch {}
    state.bannerResizeObserver = null;
    state.bannerResizeTarget = null;

    try {
      const ro = new ResizeObserver(() => scheduleBannerPositionUpdate());
      ro.observe(target);
      state.bannerResizeObserver = ro;
      state.bannerResizeTarget = target;
    } catch {
      state.bannerResizeObserver = null;
      state.bannerResizeTarget = null;
    }
  }

  function cleanupBannerPositionObservers() {
    if (state.bannerPosRaf) cancelAnimationFrame(state.bannerPosRaf);
    state.bannerPosRaf = 0;
    try {
      state.bannerResizeObserver?.disconnect?.();
    } catch {}
    state.bannerResizeObserver = null;
    state.bannerResizeTarget = null;
  }

  function setBanner(text) {
    ensureStyles();
    let el = state.bannerEl;
    if (!el || !el.isConnected) {
      el = document.createElement('div');
      el.id = 'aichat-img-edit-banner';
      el.innerHTML = `
        <span class="msg"></span>
        <button type="button" class="cancel">取消</button>
      `;
      el.querySelector('button.cancel')?.addEventListener('click', () => cancelEditMode());
      document.documentElement.appendChild(el);
      state.bannerEl = el;
    }
    const msg = el.querySelector('.msg');
    if (msg) msg.textContent = text;
    ensureBannerPositionObservers();
    scheduleBannerPositionUpdate();
  }

  function hideBanner() {
    const el = state.bannerEl;
    if (el && el.isConnected) el.remove();
    state.bannerEl = null;
    cleanupBannerPositionObservers();
  }

  function clearAutoBranchSend() {
    try {
      if (state.autoBranchSendTimer) clearTimeout(state.autoBranchSendTimer);
    } catch {}
    state.autoBranchSendTimer = null;
    state.autoBranchSend = null;
  }

  function scheduleAutoBranchSendTick(delayMs = 80) {
    if (state.autoBranchSendTimer) return;
    state.autoBranchSendTimer = setTimeout(() => {
      state.autoBranchSendTimer = null;
      try {
        runAutoBranchSendTick();
      } catch {}
    }, Math.max(0, Number(delayMs) || 0));
  }

  function isGeneratingNow() {
    const editor = getComposerEl();
    const core = getCoreApi();
    try {
      if (core && typeof core.isGenerating === 'function') return !!core.isGenerating(editor);
    } catch {}
    const submitBtn = getComposerSubmitButton();
    if (classifyComposerSubmitButton(submitBtn) === 'stop') return true;
    try {
      const form = getComposerFormEl();
      return !!(form?.querySelector(STOP_BUTTON_SELECTOR) || document.querySelector(STOP_BUTTON_SELECTOR));
    } catch {
      return false;
    }
  }

  function clickStopButtonOnce() {
    const editor = getComposerEl();
    const core = getCoreApi();
    try {
      if (core && typeof core.clickStopButton === 'function' && core.clickStopButton(editor)) return true;
    } catch {}
    try {
      const submitBtn = getComposerSubmitButton();
      if (classifyComposerSubmitButton(submitBtn) === 'stop' && !isElementDisabled(submitBtn)) {
        submitBtn.click();
        return true;
      }
    } catch {}
    try {
      const form = getComposerFormEl();
      const btn = form?.querySelector(STOP_BUTTON_SELECTOR) || document.querySelector(STOP_BUTTON_SELECTOR);
      if (!(btn instanceof HTMLElement) || isElementDisabled(btn)) return false;
      btn.click();
      return true;
    } catch {
      return false;
    }
  }

  function clickSendButtonOnce() {
    const editor = getComposerEl();
    const core = getCoreApi();
    try {
      if (core && typeof core.clickSendButton === 'function' && core.clickSendButton(editor)) return true;
    } catch {}
    try {
      const submitBtn = getComposerSubmitButton();
      if (submitBtn && !isElementDisabled(submitBtn)) {
        const mode = classifyComposerSubmitButton(submitBtn);
        if (mode === 'send' || (mode === 'unknown' && !isGeneratingNow())) {
          submitBtn.click();
          return true;
        }
      }
    } catch {}
    try {
      const form = getComposerFormEl();
      const btn = form?.querySelector(SEND_BUTTON_SELECTOR) || document.querySelector(SEND_BUTTON_SELECTOR);
      if (!(btn instanceof HTMLElement) || isElementDisabled(btn)) return false;
      if (classifyComposerSubmitButton(btn) === 'stop') return false;
      btn.click();
      return true;
    } catch {
      return false;
    }
  }

  function runAutoBranchSendTick() {
    const req = state.autoBranchSend;
    if (!req) return;
    if (!state.pending) return clearAutoBranchSend();

    const elapsed = now() - Number(req.requestedAt || 0);
    if (elapsed > AUTO_BRANCH_SEND_TIMEOUT_MS) {
      setBanner('消息编辑模式：自动分叉发送超时；请再点一次发送（或点取消恢复正常发送）');
      clearAutoBranchSend();
      return;
    }

    if (isGeneratingNow()) {
      const nowMs = now();
      const lastStopAt = Number(req.lastStopAt || 0);
      const stopClicks = Number(req.stopClicks || 0);
      if (stopClicks <= 0) {
        if (clickStopButtonOnce()) {
          req.lastStopAt = nowMs;
          req.stopClicks = 1;
        }
      } else if (stopClicks < AUTO_BRANCH_MAX_STOP_CLICKS && nowMs - lastStopAt >= AUTO_BRANCH_STOP_RETRY_MS) {
        if (clickStopButtonOnce()) {
          req.lastStopAt = nowMs;
          req.stopClicks = stopClicks + 1;
        }
      }
      scheduleAutoBranchSendTick(stopClicks > 0 ? 180 : 100);
      return;
    }

    if (!hasDraftForSend()) {
      setBanner('消息编辑模式：已结束当前回复，但未检测到可发送内容；请继续编辑后发送（取消=恢复正常发送）');
      clearAutoBranchSend();
      return;
    }

    if (clickSendButtonOnce()) {
      setBanner('消息编辑模式：已自动分叉发送（若失败可继续编辑后重试 / 或点取消恢复正常发送）');
      clearAutoBranchSend();
      return;
    }

    scheduleAutoBranchSendTick(120);
  }

  function requestAutoBranchSend(reason = 'send-intent') {
    if (!state.pending) return false;
    if (!ensureDraftReadyForAutoSend()) {
      setBanner('消息编辑模式：未检测到可发送内容，请先输入文本或添加附件后重试（或点取消恢复正常发送）');
      return false;
    }
    const existing = state.autoBranchSend;
    if (existing && typeof existing === 'object') {
      existing.reason = String(reason || existing.reason || 'send-intent');
      existing.requestedAt = now();
      scheduleAutoBranchSendTick(0);
      return true;
    }
    state.autoBranchSend = {
      requestedAt: now(),
      stopClicks: 0,
      lastStopAt: 0,
      reason: String(reason || 'send-intent')
    };
    setBanner('消息编辑模式：检测到回复仍在生成，正在自动结束并分叉发送…');
    scheduleAutoBranchSendTick(0);
    return true;
  }

  function ensureDraftReadyForAutoSend() {
    if (hasDraftForSend()) return true;
    const pending = state.pending;
    if (!pending) return false;
    let hydrated = false;
    try {
      const sourceText = String(pending.sourceText || '').trim();
      if (sourceText) {
        clearComposerText();
        setComposerText(sourceText);
        hydrated = true;
      }
    } catch {}
    try {
      if (!hasDraftForSend() && Array.isArray(pending.sourceFiles) && pending.sourceFiles.length) {
        if (attachFilesToComposer(pending.sourceFiles)) hydrated = true;
      }
    } catch {}
    if (hydrated) {
      try {
        focusComposer();
      } catch {}
    }
    return hasDraftForSend();
  }

  function cancelEditMode() {
    clearAutoBranchSend();
    state.pending = null;
    hideBanner();
  }

  function cleanup() {
    try {
      if (state.scanTimer) clearTimeout(state.scanTimer);
    } catch {}
    state.scanTimer = null;

    try {
      if (state.retryTimer) clearTimeout(state.retryTimer);
    } catch {}
    state.retryTimer = null;

    try {
      if (state.bootstrapTimer) clearTimeout(state.bootstrapTimer);
    } catch {}
    state.bootstrapTimer = null;

    try {
      state.mo?.disconnect?.();
    } catch {}
    state.mo = null;
    state.moRoot = null;

    try {
      if (typeof state.turnsUnsub === 'function') state.turnsUnsub();
    } catch {}
    state.turnsUnsub = null;

    try {
      state.hubUnsub?.();
    } catch {}
    state.hubUnsub = null;

    try {
      state.unwatchHref?.();
    } catch {}
    state.unwatchHref = null;

    try {
      if (state.hoverHandler) {
        document.removeEventListener('mouseover', state.hoverHandler, true);
        document.removeEventListener('focusin', state.hoverHandler, true);
      }
    } catch {}
    state.hoverHandler = null;

    try {
      if (state.sendIntentClickHandler) {
        document.removeEventListener('click', state.sendIntentClickHandler, true);
      }
    } catch {}
    state.sendIntentClickHandler = null;

    try {
      if (state.sendIntentKeyHandler) {
        document.removeEventListener('keydown', state.sendIntentKeyHandler, true);
      }
    } catch {}
    state.sendIntentKeyHandler = null;

    state.seenTurns = null;
    state.retryTurns = null;
    state.retryAttempts = null;
    state.retryDelayMs = 0;
    cancelEditMode();
  }

  state.cleanup = cleanup;

  function buildPencilSvg() {
    // 18x18 pencil icon (outline)
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l8.06-8.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
    `;
  }

  function hasUserMessageImages(userMsgEl) {
    try {
      if (!userMsgEl) return false;
      return !!userMsgEl.querySelector('img');
    } catch {
      return false;
    }
  }

  function getUserMessageEl(turnEl) {
    return turnEl?.querySelector?.('[data-message-author-role="user"][data-message-id]') || null;
  }

  function extractUserText(userMsgEl) {
    try {
      const pre = userMsgEl?.querySelector?.('.whitespace-pre-wrap');
      const text = (pre ? pre.textContent : userMsgEl?.textContent || '').trim();
      return text;
    } catch {
      return '';
    }
  }

  function findParentMessageId(turnEl) {
    try {
      let prev = turnEl?.previousElementSibling || null;
      while (prev) {
        if (prev.tagName === 'ARTICLE') {
          const assistant = prev.querySelector?.('[data-message-author-role="assistant"][data-message-id]');
          if (assistant && assistant.dataset?.messageId) return assistant.dataset.messageId;
        }
        prev = prev.previousElementSibling;
      }
    } catch {}
    return ROOT_PARENT_MESSAGE_ID;
  }

  async function fetchImagesAsFiles(userMsgEl) {
    const imgs = Array.from(userMsgEl.querySelectorAll('img'));
    const out = [];
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const src = img?.currentSrc || img?.src;
      if (!src) continue;
      let blob = null;
      try {
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok) continue;
        blob = await res.blob();
      } catch {
        blob = null;
      }
      if (!blob) continue;

      const mime = blob.type || 'image/png';
      const ext =
        mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'bin';
      const file = new File([blob], `edited-image-${i + 1}.${ext}`, { type: mime });
      out.push(file);
    }
    return out;
  }

  function attachFilesToComposer(files) {
    const input = getUploadPhotosInput();
    if (!input) return false;
    try {
      const dt = new DataTransfer();
      for (const f of files || []) dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  async function enterEditMode(turnEl) {
    const userMsg = getUserMessageEl(turnEl);
    if (!userMsg) return;
    const hasImages = hasUserMessageImages(userMsg);
    const sourceText = extractUserText(userMsg);

    const conversationId = getConversationIdFromUrl();
    const parentMessageId = findParentMessageId(turnEl);
    state.pending = {
      startedAt: now(),
      conversationId,
      parentMessageId,
      sourceMessageId: userMsg.dataset?.messageId || '',
      sourceText,
      sourceHasImages: hasImages,
      sourceFiles: null
    };

    setBanner('消息编辑模式：正在准备…');

    clearComposerText();
    setComposerText(sourceText);

    if (!hasImages) {
      setBanner('消息编辑模式：已把原文填入输入框；你可以添加图片/文件，下一次发送会从该条消息处分叉（若当前仍在回复，点一次发送会自动结束并分叉发送；取消=恢复正常发送）');
      focusComposer();
      return;
    }

    const files = await fetchImagesAsFiles(userMsg);
    if (!files.length) {
      setBanner('消息编辑模式：未能读取原图；你可以手动添加图片/文件，下一次发送会从该条消息处分叉（若当前仍在回复，点一次发送会自动结束并分叉发送；取消=恢复正常发送）');
      focusComposer();
      return;
    }

    setBanner(`消息编辑模式：正在载入原图（${files.length} 张）…`);
    await sleep(50);
    const ok = attachFilesToComposer(files);
    state.pending.sourceFiles = files;
    if (!ok) {
      setBanner('消息编辑模式：未找到上传入口，请在输入框右侧点“添加文件/图片”手动上传；下一次发送会从该条消息处分叉（若当前仍在回复，点一次发送会自动结束并分叉发送；取消=恢复正常发送）');
    } else {
      setBanner('消息编辑模式：已载入原图；你可以继续编辑/粘贴图片/上传文件，下一次发送会从该条消息处分叉（若当前仍在回复，点一次发送会自动结束并分叉发送；取消=恢复正常发送）');
    }

    focusComposer();
  }

  function ensureEditButtonForTurn(turnEl) {
    try {
      if (!turnEl || turnEl.nodeType !== 1) return false;
      const userMsg = getUserMessageEl(turnEl);
      if (!userMsg) return false;

      // Ensure our styling (including icon color) is present before injecting the button.
      ensureStyles();

      const copyBtn = findCopyButton(turnEl);
      if (!copyBtn) return false;
      const actionBar = copyBtn.parentElement;
      if (!actionBar) return false;

      if (actionBar.querySelector('button[data-aichat-img-edit="1"]')) return true;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.aichatImgEdit = '1';
      btn.className = copyBtn.className || '';
      btn.setAttribute('aria-label', 'QuickNav edit');
      btn.setAttribute('title', 'QuickNav 编辑（可加图/文件，分叉编辑）');
      btn.innerHTML = buildPencilSvg();
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          void enterEditMode(turnEl);
        },
        true
      );

      const nativeEdit = actionBar.querySelector(
        'button[aria-label="Edit message"],button[aria-label="Edit"],button[aria-label="编辑消息"],button[aria-label="编辑"]'
      );
      actionBar.insertBefore(btn, nativeEdit || copyBtn.nextSibling);
      return true;
    } catch {
      return false;
    }
  }

  const USER_TURN_SELECTOR = 'article[data-testid^="conversation-turn-"][data-turn="user"], article[data-turn="user"]';
  const ANY_TURN_SELECTOR = 'article[data-testid^="conversation-turn-"], article[data-turn]';

  function onRouteChange() {
    state.lastHref = location.href;
    state.seenTurns = new WeakSet();
    state.retryTurns = null;
    state.retryAttempts = null;
    state.retryDelayMs = 0;
    try {
      if (state.bootstrapTimer) clearTimeout(state.bootstrapTimer);
    } catch {}
    state.bootstrapTimer = null;
    cancelEditMode();
    try {
      state.mo?.disconnect?.();
    } catch {}
    state.mo = null;
    state.moRoot = null;
    scheduleScan(150);
  }

  function getRetryTurns() {
    return state.retryTurns || (state.retryTurns = new Set());
  }

  const MAX_RETRY_TURNS = 80;
  const MAX_RETRY_ATTEMPTS = 6;

  function getRetryAttempts() {
    return state.retryAttempts || (state.retryAttempts = new WeakMap());
  }

  function noteRetryAttempt(turnEl) {
    try {
      if (!turnEl) return false;
      const wm = getRetryAttempts();
      const prev = Number(wm.get(turnEl) || 0);
      const next = prev + 1;
      wm.set(turnEl, next);
      return next <= MAX_RETRY_ATTEMPTS;
    } catch {
      return false;
    }
  }

  function pruneRetrySet(set) {
    try {
      if (!set || set.size <= MAX_RETRY_TURNS) return;
      for (const t of set) {
        set.delete(t);
        if (set.size <= MAX_RETRY_TURNS) break;
      }
    } catch {}
  }

  function installTurnsWatcher() {
    if (state.turnsUnsub) return true;
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (!core || typeof core.onTurnsChange !== 'function') return false;

      state.turnsUnsub = core.onTurnsChange((ev) => {
        try {
          if (location.href !== state.lastHref) onRouteChange();
          const reason = typeof ev?.reason === 'string' ? ev.reason : '';

          // When the turns root appears (or is reattached after a SPA nav), do a full scan once.
          if (reason === 'attach') return scheduleScan(120);

          const addedTurns = Array.isArray(ev?.addedTurns) ? ev.addedTurns : [];
          if (!addedTurns.length) return;

          const seen = state.seenTurns || (state.seenTurns = new WeakSet());
          const retry = getRetryTurns();
          let needRetry = false;

          for (const t of addedTurns) {
            if (!t || t.nodeType !== 1) continue;
            if (!t.matches?.(USER_TURN_SELECTOR)) continue;
            if (seen.has(t)) continue;
            if (ensureEditButtonForTurn(t)) {
              seen.add(t);
            } else {
              if (noteRetryAttempt(t)) {
                retry.add(t);
                pruneRetrySet(retry);
                needRetry = true;
              }
            }
          }

          if (needRetry) scheduleRetryScan();
        } catch {}
      });
      return true;
    } catch {
      state.turnsUnsub = null;
      return false;
    }
  }

  function installHrefWatcher() {
    // Prefer shared core/bridge (avoids patching history in every module).
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (core && typeof core.onRouteChange === 'function') {
        return core.onRouteChange(() => onRouteChange());
      }
    } catch {}

    // Fallback: route-change events from MAIN-world bridge (scroll-guard or polling).
    try {
      const bridge = window.__aichat_quicknav_bridge_main_v1__;
      if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
        try {
          bridge.ensureRouteListener();
        } catch {}
        return bridge.on('routeChange', () => onRouteChange());
      }
    } catch {}

    // Last resort: slow polling (no history patch).
    let last = '';
    try {
      last = String(location.href || '');
    } catch {
      last = '';
    }
    const timer = setInterval(() => {
      try {
        const href = String(location.href || '');
        if (!href || href === last) return;
        last = href;
        onRouteChange();
      } catch {}
    }, 1200);
    return () => {
      try {
        clearInterval(timer);
      } catch {}
    };
  }

  function ensureTurnsObserver() {
    if (state.turnsUnsub) return true;
    const first = document.querySelector(ANY_TURN_SELECTOR);
    const root = first?.parentElement || null;
    if (!root) return false;
    if (state.mo && state.moRoot === root) return true;

    try {
      state.mo?.disconnect?.();
    } catch {}
    state.mo = null;
    state.moRoot = null;
    try {
      if (state.bootstrapTimer) clearTimeout(state.bootstrapTimer);
    } catch {}
    state.bootstrapTimer = null;

    const mo = new MutationObserver((records) => {
      try {
        const seen = state.seenTurns || (state.seenTurns = new WeakSet());
        const set = new Set();
        for (const rec of records) {
          for (const n of rec.addedNodes) {
            if (!n || n.nodeType !== 1) continue;
            const el = /** @type {Element} */ (n);
            if (el.matches?.(USER_TURN_SELECTOR)) set.add(el);
            const nested = el.querySelectorAll?.(USER_TURN_SELECTOR);
            if (nested && nested.length) {
              for (const t of nested) set.add(t);
            }
          }
        }
        if (!set.size) return;
        let needRetry = false;
        for (const t of set) {
          if (seen.has(t)) continue;
          if (ensureEditButtonForTurn(t)) {
            seen.add(t);
          } else {
            needRetry = true;
          }
        }
        if (needRetry) scheduleRetryScan();
        else state.retryDelayMs = 0;
      } catch {}
    });

    try {
      mo.observe(root, { childList: true });
      state.mo = mo;
      state.moRoot = root;
      return true;
    } catch {
      try {
        mo.disconnect();
      } catch {}
      return false;
    }
  }

  function ensureBootstrapObserver() {
    if (state.turnsUnsub) return true;
    try {
      if (state.mo) return true;
      // Only needed when loading an existing conversation: React often renders turns after DOMContentLoaded.
      if (!getConversationIdFromUrl()) return false;

      const root =
        document.getElementById('thread') || document.getElementById('main') || document.body || document.documentElement || null;
      if (!root) return false;

      const mo = new MutationObserver(() => {
        try {
          if (!document.querySelector(USER_TURN_SELECTOR)) return;
          try {
            mo.disconnect();
          } catch {}
          state.mo = null;
          state.moRoot = null;
          if (state.bootstrapTimer) clearTimeout(state.bootstrapTimer);
          state.bootstrapTimer = null;
          scheduleScan(0);
        } catch {}
      });
      try {
        mo.observe(root, { subtree: true, childList: true });
      } catch {
        return false;
      }
      state.mo = mo;
      state.moRoot = root;
      state.bootstrapTimer = setTimeout(() => {
        try {
          if (state.mo !== mo) return;
          mo.disconnect();
          state.mo = null;
          state.moRoot = null;
        } catch {}
        state.bootstrapTimer = null;
      }, 10_000);
      return true;
    } catch {
      return false;
    }
  }

  function scanAllTurns() {
    if (location.href !== state.lastHref) onRouteChange();

    if (!state.seenTurns) state.seenTurns = new WeakSet();
    const hasTurnsWatcher = installTurnsWatcher();
    if (!hasTurnsWatcher) ensureTurnsObserver();

    const seen = state.seenTurns;
    const retry = getRetryTurns();
    const turns = document.querySelectorAll(USER_TURN_SELECTOR);
    if (!turns.length) {
      if (!hasTurnsWatcher) ensureBootstrapObserver();
      return;
    }
    let needRetry = false;
    for (const t of turns) {
      if (seen.has(t)) continue;
      if (ensureEditButtonForTurn(t)) {
        seen.add(t);
      } else {
        if (noteRetryAttempt(t)) {
          retry.add(t);
          pruneRetrySet(retry);
          needRetry = true;
        }
      }
    }
    if (needRetry) scheduleRetryScan();
    else state.retryDelayMs = 0;
  }

  function retryPendingTurns() {
    try {
      if (location.href !== state.lastHref) onRouteChange();
      const retry = state.retryTurns;
      if (!retry || !retry.size) {
        state.retryDelayMs = 0;
        return;
      }
      const seen = state.seenTurns || (state.seenTurns = new WeakSet());
      let stillPending = false;
      for (const t of Array.from(retry)) {
        try {
          if (!t || !t.isConnected) {
            retry.delete(t);
            continue;
          }
          if (seen.has(t)) {
            retry.delete(t);
            continue;
          }
          if (ensureEditButtonForTurn(t)) {
            seen.add(t);
            retry.delete(t);
            continue;
          }
          if (!noteRetryAttempt(t)) {
            retry.delete(t);
            continue;
          }
          stillPending = true;
        } catch {}
      }
      if (stillPending) scheduleRetryScan();
      else state.retryDelayMs = 0;
    } catch {}
  }

  function scheduleRetryScan() {
    if (state.retryTimer) return;
    const delay = state.retryDelayMs || 600;
    state.retryDelayMs = Math.min(Math.max(delay, 300) * 2, 5000);
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      try {
        retryPendingTurns();
      } catch {}
    }, delay);
  }

  function scheduleScan(delayMs = 300) {
    if (state.scanTimer) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      scanAllTurns();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function installTurnActivator() {
    if (state.hoverHandler) return;
    let lastTurn = null;
    let lastAt = 0;
    const handler = (e) => {
      try {
        const target = e?.target;
        if (!target || typeof target.closest !== 'function') return;
        const turn = target.closest(USER_TURN_SELECTOR);
        if (!turn) return;
        const nowMs = now();
        if (turn === lastTurn && nowMs - lastAt < 250) return;
        lastTurn = turn;
        lastAt = nowMs;
        const seen = state.seenTurns || (state.seenTurns = new WeakSet());
        if (ensureEditButtonForTurn(turn)) {
          seen.add(turn);
          state.retryDelayMs = 0;
        } else {
          if (noteRetryAttempt(turn)) {
            const set = getRetryTurns();
            set.add(turn);
            pruneRetrySet(set);
            scheduleRetryScan();
          }
        }
      } catch {}
    };
    state.hoverHandler = handler;
    try {
      document.addEventListener('mouseover', handler, true);
      document.addEventListener('focusin', handler, true);
    } catch {}
  }

  function installSendIntentCapture() {
    if (!state.sendIntentClickHandler) {
      const clickHandler = (e) => {
        try {
          if (!state.pending) return;
          const target = e.target;
          if (!(target instanceof Element)) return;
          const submitBtn = target.closest(`${COMPOSER_SUBMIT_SELECTOR},${STOP_BUTTON_SELECTOR},${SEND_BUTTON_SELECTOR}`);
          if (!(submitBtn instanceof HTMLElement) || isElementDisabled(submitBtn)) return;
          const form = getComposerFormEl();
          if (form && !form.contains(submitBtn)) return;
          const mode = classifyComposerSubmitButton(submitBtn);
          if (mode !== 'stop' && !isGeneratingNow()) return;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          requestAutoBranchSend(mode === 'stop' ? 'stop-button-click' : 'submit-button-click');
        } catch {}
      };
      state.sendIntentClickHandler = clickHandler;
      try {
        document.addEventListener('click', clickHandler, true);
      } catch {}
    }

    if (!state.sendIntentKeyHandler) {
      const keyHandler = (e) => {
        try {
          if (!state.pending) return;
          if (e.key !== 'Enter') return;
          if (e.isComposing || e.keyCode === 229) return;
          if (e.shiftKey || e.altKey) return;
          if (!isGeneratingNow()) return;
          const target = e.target;
          if (!(target instanceof Element)) return;
          const form = getComposerFormEl();
          if (form && !form.contains(target)) return;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const reason = e.metaKey || e.ctrlKey ? 'cmd-enter-while-generating' : 'enter-while-generating';
          requestAutoBranchSend(reason);
        } catch {}
      };
      state.sendIntentKeyHandler = keyHandler;
      try {
        document.addEventListener('keydown', keyHandler, true);
      } catch {}
    }
  }

  function installPayloadRewriter() {
    const hub = window.__aichat_chatgpt_fetch_hub_v1__;
    if (hub && typeof hub.register === 'function') {
      try {
        state.hubUnsub?.();
      } catch {}
      state.hubUnsub = hub.register({
        priority: 100,
        onConversationStart: () => {
          // Helps on the "new chat" page where turns container doesn't exist until the first send.
          scheduleScan(250);
        },
        onConversationPayload: (payload, ctx) => {
          try {
            const pending = state.pending;
            if (!pending) return payload;
            if (!payload || typeof payload !== 'object') return payload;
            const conv = pending.conversationId;
            if (conv && typeof payload.conversation_id === 'string' && payload.conversation_id && payload.conversation_id !== conv) {
              return payload;
            }
            if (conv && !payload.conversation_id) payload.conversation_id = conv;
            if (pending.parentMessageId) payload.parent_message_id = pending.parentMessageId;
            if (ctx && typeof ctx === 'object') ctx.__aichatImgEdit = { ...pending };
          } catch {}
          return payload;
        },
        onConversationResponse: (ctx) => {
          try {
            const info = ctx && ctx.__aichatImgEdit;
            if (!info) return;
            const ok = !!ctx?.response?.ok;
            if (ok) {
              cancelEditMode();
            } else {
              setBanner('消息编辑模式：发送失败（仍在编辑模式，可修改后再发 / 或点取消恢复正常发送）');
            }
          } catch {}
        }
      });
      return;
    }

    // Fallback (should not happen when fetch hub is present): patch fetch to rewrite payload once.
    try {
      const originalFetch = window.fetch;
      if (originalFetch?.__aichatImgEditPatched) return;
      const wrapped = new Proxy(originalFetch, {
        apply: async function (target, thisArg, args) {
          try {
            const pending = state.pending;
            if (pending) {
              const [requestInfo, requestInit] = args;
              const url = typeof requestInfo === 'string' ? requestInfo : requestInfo?.url || requestInfo?.href || '';
              const method = typeof requestInfo === 'object' && requestInfo?.method ? requestInfo.method : requestInit?.method || 'GET';
              if (String(method).toUpperCase() === 'POST' && /\/backend-api\/(?:f\/)?conversation(?:\?|$)/.test(String(url))) {
                const bodyText = requestInit?.body;
                if (typeof bodyText === 'string') {
                  const payload = JSON.parse(bodyText);
                  const conv = pending.conversationId;
                  if (conv && payload?.conversation_id && payload.conversation_id !== conv) return target.apply(thisArg, args);
                  if (conv && !payload.conversation_id) payload.conversation_id = conv;
                  if (pending.parentMessageId) payload.parent_message_id = pending.parentMessageId;
                  const nextInit = { ...(requestInit || {}), body: JSON.stringify(payload) };
                  args[1] = nextInit;
                }
              }
            }
          } catch {}
          const res = await target.apply(thisArg, args);
          try {
            if (state.pending && res && typeof res.ok === 'boolean' && res.ok) cancelEditMode();
          } catch {}
          return res;
        }
      });
      wrapped.__aichatImgEditPatched = true;
      window.fetch = wrapped;
    } catch {}
  }

  installPayloadRewriter();
  installTurnActivator();
  installSendIntentCapture();

  try {
    state.unwatchHref = installHrefWatcher();
  } catch {}

  function bootScan() {
    try {
      scanAllTurns();
    } catch {}

    // ChatGPT can hydrate/re-render the turn action bar after the initial render.
    setTimeout(() => {
      try {
        if (!document.querySelector('button[data-aichat-img-edit="1"]')) scanAllTurns();
      } catch {}
    }, 1200);
    setTimeout(() => {
      try {
        if (!document.querySelector('button[data-aichat-img-edit="1"]')) scanAllTurns();
      } catch {}
    }, 3500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootScan, { once: true });
  else bootScan();
})();
