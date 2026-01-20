(() => {
  'use strict';
  const GUARD_KEY = '__aichat_chatgpt_image_message_edit_v1__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  const ROOT_PARENT_MESSAGE_ID = 'client-created-root';

  const state = {
    pending: null,
    bannerEl: null,
    lastHref: location.href,
    scanTimer: null
  };

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
    if (document.getElementById('aichat-img-edit-style')) return;
    const style = document.createElement('style');
    style.id = 'aichat-img-edit-style';
    style.textContent = `
      #aichat-img-edit-banner{
        position: fixed;
        left: 50%;
        transform: translateX(-50%);
        bottom: 96px;
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
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 52vw;
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
    document.documentElement.appendChild(style);
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
  }

  function hideBanner() {
    const el = state.bannerEl;
    if (el && el.isConnected) el.remove();
    state.bannerEl = null;
  }

  function cancelEditMode() {
    state.pending = null;
    hideBanner();
  }

  function buildPencilSvg() {
    // 18x18 pencil icon (outline)
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l8.06-8.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
    `;
  }

  function isLikelyImageTurn(turnEl) {
    try {
      const userMsg = turnEl?.querySelector?.('[data-message-author-role="user"][data-message-id]');
      if (!userMsg) return false;
      return !!userMsg.querySelector('img');
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

    const conversationId = getConversationIdFromUrl();
    const parentMessageId = findParentMessageId(turnEl);
    state.pending = {
      startedAt: now(),
      conversationId,
      parentMessageId,
      sourceMessageId: userMsg.dataset?.messageId || ''
    };

    setBanner('图文消息编辑模式：已把原文/原图填入输入框；下一次发送会从该条消息处分叉（取消=恢复正常发送）');

    clearComposerText();
    setComposerText(extractUserText(userMsg));

    const files = await fetchImagesAsFiles(userMsg);
    if (files.length) {
      setBanner(`图文消息编辑模式：正在载入原图（${files.length} 张）…`);
      await sleep(50);
      const ok = attachFilesToComposer(files);
      if (!ok) {
        setBanner('图文消息编辑模式：未找到上传入口，请在输入框右侧点“添加文件/图片”手动上传（取消=恢复正常发送）');
      } else {
        setBanner('图文消息编辑模式：已载入原图；你可以继续编辑/粘贴图片/上传文件，然后直接发送（取消=恢复正常发送）');
      }
    }

    focusComposer();
  }

  function ensureEditButtonForTurn(turnEl) {
    if (!turnEl || turnEl.nodeType !== 1) return;
    if (!isLikelyImageTurn(turnEl)) return;

    const copyBtn = turnEl.querySelector('button[aria-label="Copy"]');
    if (!copyBtn) return;
    const actionBar = copyBtn.parentElement;
    if (!actionBar) return;

    if (actionBar.querySelector('button[data-aichat-img-edit="1"]')) return;
    if (actionBar.querySelector('button[aria-label="Edit message"],button[aria-label="Edit"]')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.aichatImgEdit = '1';
    btn.className = copyBtn.className || '';
    btn.setAttribute('aria-label', 'Edit message');
    btn.setAttribute('title', 'Edit message');
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

    actionBar.insertBefore(btn, copyBtn);
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
      hub.register({
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
              setBanner('图文消息编辑模式：发送失败（仍在编辑模式，可修改后再发 / 或点取消恢复正常发送）');
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
  try {
    mo.observe(document.documentElement, { subtree: true, childList: true });
  } catch {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleScan, { once: true });
  } else {
    scheduleScan();
  }
})();

