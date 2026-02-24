(() => {
  'use strict';

  const GUARD_KEY = '__aichat_genspark_force_sonnet45_thinking_v2__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });
  if (window.top !== window) return;

  const ASK_API_RE = /\/api\/agent\/ask_proxy(?:\?|$)/i;
  const TARGET_MODELS = new Set(['claude-sonnet-4-5', 'claude-sonnet-4-5-20250929']);
  const THINKING_MODEL = 'claude-sonnet-4-5-thinking';
  const MAX_REASONING_LEN = 12000;
  const FETCH_PATCH_FLAG = '__aichatGensparkSonnet45ThinkingPatched';

  const STYLE_ID = '__aichat_genspark_thinking_inline_style_v1__';
  const PANEL_CLASS = 'aichat-genspark-thinking-panel';
  const PANEL_OPEN_ATTR = 'data-aichat-open';

  const state = {
    reasoningText: '',
    lastReqId: 0,
    panelRoot: null,
    previewEl: null,
    fullEl: null,
    toggleEl: null,
    maskTimerShort: null,
    maskTimerLong: null
  };

  function parseJsonSafe(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function isAiChatPage() {
    try {
      const u = new URL(location.href);
      if (!/www\.genspark\.ai$/i.test(u.hostname)) return false;
      if (!u.pathname.startsWith('/agents')) return false;
      const t = String(u.searchParams.get('type') || '').toLowerCase();
      return !t || t === 'ai_chat' || t === 'moa_chat';
    } catch {
      return false;
    }
  }

  function forceThinkingModel(inputModel) {
    const v = String(inputModel || '').trim();
    if (!v) return v;
    return TARGET_MODELS.has(v) ? THINKING_MODEL : v;
  }

  function capReasoningText(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!raw) return '';
    if (raw.length <= MAX_REASONING_LEN) return raw;
    return raw.slice(raw.length - MAX_REASONING_LEN);
  }

  function lastFiveLines(text) {
    const lines = String(text || '')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean);
    return lines.slice(-5).join('\n');
  }

  function normalizeInlineText(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function looksAnswerOnlyText(text) {
    const raw = String(text || '').trim();
    if (!raw) return false;
    if (raw.length > 48) return false;
    return /^[\d\s.,+\-*/=()]+$/.test(raw);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${PANEL_CLASS} {
        --aichat-thinking-bg: #f6f8fc;
        --aichat-thinking-border: rgba(15, 23, 42, 0.16);
        --aichat-thinking-title: #1f2937;
        --aichat-thinking-text: #1f2937;
        --aichat-thinking-toggle-bg: rgba(31, 41, 55, 0.04);
        --aichat-thinking-toggle-border: rgba(31, 41, 55, 0.26);
        --aichat-thinking-toggle-text: #243244;
        margin: 10px 0 14px;
        border: 1px solid var(--aichat-thinking-border);
        border-radius: 12px;
        background: var(--aichat-thinking-bg);
        color: var(--aichat-thinking-text);
        overflow: hidden;
      }
      @media (prefers-color-scheme: dark) {
        .${PANEL_CLASS} {
          --aichat-thinking-bg: rgba(26, 33, 45, 0.9);
          --aichat-thinking-border: rgba(148, 163, 184, 0.34);
          --aichat-thinking-title: #e7efff;
          --aichat-thinking-text: #e5edf8;
          --aichat-thinking-toggle-bg: rgba(226, 232, 240, 0.08);
          --aichat-thinking-toggle-border: rgba(226, 232, 240, 0.33);
          --aichat-thinking-toggle-text: #f1f5f9;
        }
      }
      html.dark .${PANEL_CLASS},
      body.dark .${PANEL_CLASS},
      [data-theme="dark"] .${PANEL_CLASS},
      [data-color-mode="dark"] .${PANEL_CLASS} {
        --aichat-thinking-bg: rgba(26, 33, 45, 0.9);
        --aichat-thinking-border: rgba(148, 163, 184, 0.34);
        --aichat-thinking-title: #e7efff;
        --aichat-thinking-text: #e5edf8;
        --aichat-thinking-toggle-bg: rgba(226, 232, 240, 0.08);
        --aichat-thinking-toggle-border: rgba(226, 232, 240, 0.33);
        --aichat-thinking-toggle-text: #f1f5f9;
      }
      .${PANEL_CLASS} .aichat-thinking-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 12px;
        font-size: 13px;
        font-weight: 600;
        color: var(--aichat-thinking-title);
      }
      .${PANEL_CLASS} .aichat-thinking-toggle {
        border: 1px solid var(--aichat-thinking-toggle-border);
        border-radius: 999px;
        padding: 3px 11px;
        font-size: 12px;
        line-height: 1.4;
        background: var(--aichat-thinking-toggle-bg);
        color: var(--aichat-thinking-toggle-text);
        cursor: pointer;
      }
      .${PANEL_CLASS} .aichat-thinking-toggle:hover {
        filter: brightness(1.06);
      }
      .${PANEL_CLASS} .aichat-thinking-preview,
      .${PANEL_CLASS} .aichat-thinking-full {
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
        font-size: 13px;
        line-height: 1.5;
        padding: 0 12px 10px;
        color: var(--aichat-thinking-text);
        opacity: 1;
      }
      .${PANEL_CLASS} .aichat-thinking-preview {
        max-height: 96px;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        scrollbar-gutter: stable;
      }
      .${PANEL_CLASS}[${PANEL_OPEN_ATTR}="0"] .aichat-thinking-full { display: none; }
      .${PANEL_CLASS}[${PANEL_OPEN_ATTR}="1"] .aichat-thinking-preview { display: none; }
      .${PANEL_CLASS}[${PANEL_OPEN_ATTR}="1"] .aichat-thinking-full { display: block; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function findLastAssistantAnchor() {
    const selectors = [
      '.conversation-statement.assistant .conversation-item-desc.assistant',
      '.conversation-statement.assistant .conversation-item-desc',
      '.conversation-statement.assistant',
      '.main-inner.j-chat-agent.ai_chat .item-box .markdown-body',
      '.main-inner.j-chat-agent.ai_chat .markdown-body',
      '.item-box .markdown-body'
    ];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (let idx = nodes.length - 1; idx >= 0; idx -= 1) {
        const node = nodes[idx];
        if (!(node instanceof HTMLElement)) continue;
        if (!node.isConnected) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        return node;
      }
    }
    return null;
  }

  function findAttachContainer(anchor) {
    if (!anchor) return null;
    return (
      anchor.closest('.conversation-statement.assistant') ||
      anchor.closest('.conversation-statement') ||
      anchor.closest('.conversation-content') ||
      anchor.closest('.item-box') ||
      anchor.closest('[class*="message"]') ||
      anchor.closest('article') ||
      anchor.parentElement ||
      null
    );
  }

  function ensurePanel() {
    ensureStyle();
    let panel = state.panelRoot;
    if (panel && panel.isConnected) return panel;

    panel = document.createElement('section');
    panel.className = PANEL_CLASS;
    panel.setAttribute(PANEL_OPEN_ATTR, '0');

    const head = document.createElement('div');
    head.className = 'aichat-thinking-head';

    const title = document.createElement('span');
    title.textContent = 'Thinking';
    head.appendChild(title);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'aichat-thinking-toggle';
    toggle.textContent = '展开';
    toggle.addEventListener('click', () => {
      const nextOpen = panel.getAttribute(PANEL_OPEN_ATTR) === '1' ? '0' : '1';
      panel.setAttribute(PANEL_OPEN_ATTR, nextOpen);
      toggle.textContent = nextOpen === '1' ? '收起' : '展开';
    });
    head.appendChild(toggle);

    const preview = document.createElement('div');
    preview.className = 'aichat-thinking-preview';
    preview.textContent = '等待思考内容…';

    const full = document.createElement('div');
    full.className = 'aichat-thinking-full';
    full.textContent = '';

    panel.appendChild(head);
    panel.appendChild(preview);
    panel.appendChild(full);

    state.panelRoot = panel;
    state.previewEl = preview;
    state.fullEl = full;
    state.toggleEl = toggle;
    return panel;
  }

  function attachPanelNearLatestAnswer() {
    const panel = ensurePanel();
    const anchor = findLastAssistantAnchor();
    const container = findAttachContainer(anchor);
    if (!container || !container.parentElement) return;
    if (panel.parentElement === container && panel.nextElementSibling === anchor) return;
    if (anchor && anchor.parentElement === container) container.insertBefore(panel, anchor);
    else container.insertBefore(panel, container.firstChild);
  }

  function renderReasoning() {
    const text = capReasoningText(state.reasoningText);
    if (!text) return;
    attachPanelNearLatestAnswer();
    if (state.previewEl) state.previewEl.textContent = lastFiveLines(text) || text;
    if (state.fullEl) state.fullEl.textContent = text;
    scheduleMaskInlineReasoning();
  }

  function scheduleMaskInlineReasoning() {
    maskInlineReasoningInLatestAnswer();
    if (state.maskTimerShort) clearTimeout(state.maskTimerShort);
    if (state.maskTimerLong) clearTimeout(state.maskTimerLong);
    state.maskTimerShort = setTimeout(() => {
      state.maskTimerShort = null;
      maskInlineReasoningInLatestAnswer();
    }, 120);
    state.maskTimerLong = setTimeout(() => {
      state.maskTimerLong = null;
      maskInlineReasoningInLatestAnswer();
    }, 700);
  }

  function maskInlineReasoningInLatestAnswer() {
    const panel = state.panelRoot;
    if (!panel || !panel.isConnected) return;

    const statement = panel.closest('.conversation-statement.assistant');
    if (!(statement instanceof HTMLElement)) return;

    const desc = statement.querySelector('.conversation-item-desc.assistant, .conversation-item-desc');
    if (!(desc instanceof HTMLElement)) return;

    const reasoningNorm = normalizeInlineText(state.reasoningText);
    if (!reasoningNorm) return;

    let blocks = Array.from(desc.querySelectorAll('p, li')).filter((el) => el instanceof HTMLElement);
    if (!blocks.length) {
      blocks = Array.from(desc.children).filter((el) => el instanceof HTMLElement);
    }
    for (const block of blocks) {
      if (block === panel || panel.contains(block)) continue;

      const raw = String(block.innerText || '').trim();
      const norm = normalizeInlineText(raw);
      if (!norm) continue;

      const inReasoning = norm.length >= 10 && reasoningNorm.includes(norm);
      const shouldHide = inReasoning && !looksAnswerOnlyText(raw);

      if (shouldHide) {
        block.setAttribute('data-aichat-thinking-hidden', '1');
        block.style.display = 'none';
      } else if (block.getAttribute('data-aichat-thinking-hidden') === '1') {
        block.removeAttribute('data-aichat-thinking-hidden');
        block.style.removeProperty('display');
      }
    }
  }

  function appendReasoningDelta(delta) {
    const part = String(delta || '');
    if (!part) return;
    state.reasoningText = capReasoningText(`${state.reasoningText}${part}`);
    renderReasoning();
  }

  function replaceReasoning(text) {
    const next = capReasoningText(text);
    if (!next) return;
    state.reasoningText = next;
    renderReasoning();
  }

  function collectReasoningDeep(input, out) {
    if (!input) return;
    if (Array.isArray(input)) {
      for (const item of input) collectReasoningDeep(item, out);
      return;
    }
    if (typeof input !== 'object') return;

    if (typeof input.reasoning_content === 'string') out.push(input.reasoning_content);
    if (typeof input.reasoning_delta === 'string') out.push(input.reasoning_delta);
    if (typeof input.thinking === 'string') out.push(input.thinking);

    if (input.field_name === 'reasoning_delta' && typeof input.delta === 'string') {
      out.push(input.delta);
    }
    if (input.field_name === 'reasoning_content' && typeof input.field_value === 'string') {
      out.push(input.field_value);
    }

    for (const value of Object.values(input)) {
      if (value && typeof value === 'object') collectReasoningDeep(value, out);
    }
  }

  function processPayloadObject(obj) {
    if (!obj || typeof obj !== 'object') return;

    if (typeof obj.reasoning_delta === 'string') appendReasoningDelta(obj.reasoning_delta);
    if (typeof obj.reasoning_content === 'string') replaceReasoning(obj.reasoning_content);

    if (obj.type === 'message_field_delta' && obj.field_name === 'reasoning_delta' && typeof obj.delta === 'string') {
      appendReasoningDelta(obj.delta);
    }
    if (obj.type === 'message_field' && obj.field_name === 'reasoning_content' && typeof obj.field_value === 'string') {
      replaceReasoning(obj.field_value);
    }

    const thinkingBlocks =
      obj.thinking_blocks ??
      (obj.type === 'message_result' && obj.message && typeof obj.message === 'object'
        ? obj.message.thinking_blocks
        : null);

    if (thinkingBlocks != null) {
      const out = [];
      collectReasoningDeep(thinkingBlocks, out);
      const merged = out.join('\n').trim();
      if (merged) replaceReasoning(merged);
    }
  }

  function processSseChunk(chunk) {
    const text = String(chunk || '');
    if (!text) return;
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
      if (!payload || payload === '[DONE]') continue;
      const obj = parseJsonSafe(payload);
      if (obj) processPayloadObject(obj);
    }
  }

  function tapResponseStream(reqId, res) {
    let clone = null;
    try {
      clone = res?.clone?.();
    } catch {
      clone = null;
    }
    if (!clone?.body || typeof clone.body.getReader !== 'function') return;
    const reader = clone.body.getReader();
    const decoder = new TextDecoder();

    let buffered = '';
    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (reqId !== state.lastReqId) break;
          buffered += decoder.decode(value, { stream: true });
          const parts = buffered.split(/\n\n/);
          buffered = parts.pop() || '';
          for (const part of parts) processSseChunk(part);
        }
        if (reqId === state.lastReqId) {
          const tail = `${buffered}${decoder.decode()}`;
          if (tail.trim()) processSseChunk(tail);
        }
      } catch {}
      try {
        reader.releaseLock();
      } catch {}
    })();
  }

  function patchFetch() {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') return;
    if (originalFetch[FETCH_PATCH_FLAG]) return;

    const wrapped = async function (...args) {
      let [input, init] = args;
      let reqUrl = '';
      try {
        reqUrl = typeof input === 'string' ? input : String(input?.url || '');
      } catch {
        reqUrl = '';
      }

      if (ASK_API_RE.test(reqUrl) && init && typeof init.body === 'string' && isAiChatPage()) {
        const payload = parseJsonSafe(init.body);
        if (payload && typeof payload === 'object') {
          const current = String(payload.ai_chat_model || '').trim();
          const next = forceThinkingModel(current);
          if (next && next !== current) payload.ai_chat_model = next;
          init = { ...init, body: JSON.stringify(payload) };
          args[1] = init;
        }
      }

      const response = await originalFetch.apply(this, args);

      if (ASK_API_RE.test(reqUrl) && isAiChatPage()) {
        state.lastReqId += 1;
        state.reasoningText = '';
        tapResponseStream(state.lastReqId, response);
      }
      return response;
    };

    try {
      Object.defineProperty(wrapped, FETCH_PATCH_FLAG, {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false
      });
    } catch {
      try {
        wrapped[FETCH_PATCH_FLAG] = true;
      } catch {}
    }
    window.fetch = wrapped;
  }

  function ensurePatchedFetch() {
    try {
      patchFetch();
    } catch {}
  }

  ensurePatchedFetch();
  setTimeout(ensurePatchedFetch, 0);
  setTimeout(ensurePatchedFetch, 250);
  setTimeout(ensurePatchedFetch, 1200);
  setTimeout(ensurePatchedFetch, 5000);
  window.addEventListener('load', ensurePatchedFetch, { once: true });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible') ensurePatchedFetch();
    },
    { passive: true }
  );
})();
