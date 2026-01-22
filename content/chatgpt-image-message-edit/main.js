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

  const state = {
    version: STATE_VERSION,
    pending: null,
    bannerEl: null,
    lastHref: location.href,
    scanTimer: null,
    bannerPosRaf: 0,
    bannerResizeObserver: null,
    bannerResizeTarget: null,
    mo: null,
    hubUnsub: null,
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
    return document.querySelector('#prompt-textarea[contenteditable="true"]');
  }

  function getUploadPhotosInput() {
    return (
      document.getElementById('upload-photos') ||
      document.querySelector('input[type="file"][accept*="image"]') ||
      document.querySelector('input[type="file"][multiple]')
    );
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

  function cancelEditMode() {
    state.pending = null;
    hideBanner();
  }

  function cleanup() {
    try {
      if (state.scanTimer) clearTimeout(state.scanTimer);
    } catch {}
    state.scanTimer = null;

    try {
      state.mo?.disconnect?.();
    } catch {}
    state.mo = null;

    try {
      state.hubUnsub?.();
    } catch {}
    state.hubUnsub = null;

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

    const conversationId = getConversationIdFromUrl();
    const parentMessageId = findParentMessageId(turnEl);
    state.pending = {
      startedAt: now(),
      conversationId,
      parentMessageId,
      sourceMessageId: userMsg.dataset?.messageId || ''
    };

    setBanner('消息编辑模式：正在准备…');

    clearComposerText();
    setComposerText(extractUserText(userMsg));

    if (!hasImages) {
      setBanner('消息编辑模式：已把原文填入输入框；你可以添加图片/文件，下一次发送会从该条消息处分叉（取消=恢复正常发送）');
      focusComposer();
      return;
    }

    const files = await fetchImagesAsFiles(userMsg);
    if (!files.length) {
      setBanner('消息编辑模式：未能读取原图；你可以手动添加图片/文件，下一次发送会从该条消息处分叉（取消=恢复正常发送）');
      focusComposer();
      return;
    }

    setBanner(`消息编辑模式：正在载入原图（${files.length} 张）…`);
    await sleep(50);
    const ok = attachFilesToComposer(files);
    if (!ok) {
      setBanner('消息编辑模式：未找到上传入口，请在输入框右侧点“添加文件/图片”手动上传；下一次发送会从该条消息处分叉（取消=恢复正常发送）');
    } else {
      setBanner('消息编辑模式：已载入原图；你可以继续编辑/粘贴图片/上传文件，下一次发送会从该条消息处分叉（取消=恢复正常发送）');
    }

    focusComposer();
  }

  function ensureEditButtonForTurn(turnEl) {
    if (!turnEl || turnEl.nodeType !== 1) return;
    const userMsg = getUserMessageEl(turnEl);
    if (!userMsg) return;

    // Ensure our styling (including icon color) is present before injecting the button.
    ensureStyles();

    const copyBtn = findCopyButton(turnEl);
    if (!copyBtn) return;
    const actionBar = copyBtn.parentElement;
    if (!actionBar) return;

    if (actionBar.querySelector('button[data-aichat-img-edit="1"]')) return;

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
  }

  function scan() {
    const href = location.href;
    if (href !== state.lastHref) {
      state.lastHref = href;
      cancelEditMode();
    }

    const turns = Array.from(
      document.querySelectorAll('article[data-testid^="conversation-turn-"][data-turn="user"], article[data-turn="user"]')
    );
    for (const t of turns) ensureEditButtonForTurn(t);
  }

  function scheduleScan() {
    if (state.scanTimer) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      scan();
    }, 300);
  }

  function installPayloadRewriter() {
    const hub = window.__aichat_chatgpt_fetch_hub_v1__;
    if (hub && typeof hub.register === 'function') {
      try {
        state.hubUnsub?.();
      } catch {}
      state.hubUnsub = hub.register({
        priority: 100,
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

  const mo = new MutationObserver(scheduleScan);
  state.mo = mo;
  try {
    mo.observe(document.documentElement, { subtree: true, childList: true });
  } catch {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleScan, { once: true });
  } else {
    scheduleScan();
  }
})();
