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

  const STYLE_ID = '__aichat_genspark_thinking_inline_style_v1__';
  const PANEL_CLASS = 'aichat-genspark-thinking-panel';
  const PANEL_OPEN_ATTR = 'data-aichat-open';

  const state = {
    reasoningText: '',
    lastReqId: 0,
    panelRoot: null,
    previewEl: null,
    fullEl: null,
    toggleEl: null
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

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${PANEL_CLASS} {
        margin: 10px 0 14px;
        border: 1px solid rgba(120,120,120,0.32);
        border-radius: 12px;
        background: rgba(127,127,127,0.08);
        color: inherit;
        overflow: hidden;
      }
      .${PANEL_CLASS} .aichat-thinking-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 12px;
        font-size: 13px;
        font-weight: 600;
      }
      .${PANEL_CLASS} .aichat-thinking-toggle {
        border: 1px solid rgba(120,120,120,0.35);
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 12px;
        line-height: 1.4;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .${PANEL_CLASS} .aichat-thinking-preview,
      .${PANEL_CLASS} .aichat-thinking-full {
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
        font-size: 12px;
        line-height: 1.45;
        padding: 0 12px 10px;
        opacity: 0.92;
      }
      .${PANEL_CLASS}[${PANEL_OPEN_ATTR}="0"] .aichat-thinking-full { display: none; }
      .${PANEL_CLASS}[${PANEL_OPEN_ATTR}="1"] .aichat-thinking-preview { display: none; }
      .${PANEL_CLASS}[${PANEL_OPEN_ATTR}="1"] .aichat-thinking-full { display: block; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function findLastAssistantAnchor() {
    const selectors = [
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

  function collectTextDeep(input, out) {
    if (!input) return;
    if (typeof input === 'string') {
      out.push(input);
      return;
    }
    if (Array.isArray(input)) {
      for (const item of input) collectTextDeep(item, out);
      return;
    }
    if (typeof input === 'object') {
      if (typeof input.reasoning_content === 'string') out.push(input.reasoning_content);
      if (typeof input.reasoning_delta === 'string') out.push(input.reasoning_delta);
      if (typeof input.content === 'string') out.push(input.content);
      for (const value of Object.values(input)) collectTextDeep(value, out);
    }
  }

  function processPayloadObject(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.reasoning_delta === 'string') appendReasoningDelta(obj.reasoning_delta);
    if (typeof obj.reasoning_content === 'string') replaceReasoning(obj.reasoning_content);
    if (obj.thinking_blocks != null) {
      const out = [];
      collectTextDeep(obj.thinking_blocks, out);
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
    if (originalFetch.__aichatGensparkSonnet45ThinkingPatched) return;

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

    Object.defineProperty(wrapped, '__aichatGensparkSonnet45ThinkingPatched', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    window.fetch = wrapped;
  }

  patchFetch();
})();
