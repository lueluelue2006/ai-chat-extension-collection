(() => {
  'use strict';

  const GUARD_KEY = '__aichat_genspark_force_sonnet45_thinking_v1__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });
  if (window.top !== window) return;

  const TARGET_MODELS = new Set(['claude-sonnet-4-5', 'claude-sonnet-4-5-20250929']);
  const THINKING_MODEL = 'claude-sonnet-4-5-thinking';
  const ASK_API_RE = /\/api\/agent\/ask_proxy(?:\?|$)/i;
  const STYLE_ID = '__aichat_genspark_thinking_box_style_v1__';
  const BOX_ID = '__aichat_genspark_thinking_box_v1__';
  const MAX_TEXT = 32000;

  const state = {
    fullText: '',
    latestReasoningContent: '',
    lastUpdateAt: 0,
    boxEl: null,
    previewEl: null,
    fullEl: null,
    summaryEl: null,
    patchTimer: null,
    lastRewriteModel: '',
    rewriteCount: 0
  };

  function forceThinkingModel(model) {
    const value = String(model || '').trim();
    if (!value) return value;
    if (TARGET_MODELS.has(value)) return THINKING_MODEL;
    return value;
  }

  function shouldProcessAiChat(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (typeof payload.ai_chat_model === 'string' && payload.ai_chat_model) return true;
    try {
      const url = new URL(location.href);
      return /\/agents$/i.test(url.pathname) && url.searchParams.get('type') === 'ai_chat';
    } catch {
      return false;
    }
  }

  function parseJsonSafe(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BOX_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: min(560px, calc(100vw - 32px));
        max-height: 56vh;
        z-index: 2147483647;
        border: 1px solid rgba(120,120,120,0.4);
        border-radius: 12px;
        background: rgba(20,20,24,0.92);
        color: #e8e8ee;
        font-size: 13px;
        line-height: 1.45;
        box-shadow: 0 10px 26px rgba(0,0,0,0.28);
        overflow: hidden;
        backdrop-filter: blur(8px);
      }
      #${BOX_ID} summary {
        cursor: pointer;
        padding: 10px 12px;
        user-select: none;
        font-weight: 600;
        border-bottom: 1px solid rgba(120,120,120,0.25);
      }
      #${BOX_ID} summary::marker {
        color: #9bc3ff;
      }
      #${BOX_ID} .aichat-thinking-preview {
        padding: 10px 12px 12px;
        white-space: pre-wrap;
        word-break: break-word;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 5;
        overflow: hidden;
        color: #cfd8ff;
      }
      #${BOX_ID}[open] .aichat-thinking-preview {
        display: none;
      }
      #${BOX_ID} .aichat-thinking-full {
        display: none;
        max-height: calc(56vh - 42px);
        overflow: auto;
        padding: 10px 12px 12px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      #${BOX_ID}[open] .aichat-thinking-full {
        display: block;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureThinkingBox() {
    ensureStyles();
    let el = state.boxEl;
    if (el && el.isConnected) return el;
    el = document.createElement('details');
    el.id = BOX_ID;
    el.open = false;

    const summary = document.createElement('summary');
    summary.textContent = 'Thinking（折叠）';
    el.appendChild(summary);

    const preview = document.createElement('div');
    preview.className = 'aichat-thinking-preview';
    preview.textContent = '等待思考内容…';
    el.appendChild(preview);

    const full = document.createElement('div');
    full.className = 'aichat-thinking-full';
    full.textContent = '';
    el.appendChild(full);

    document.documentElement.appendChild(el);
    state.boxEl = el;
    state.previewEl = preview;
    state.fullEl = full;
    state.summaryEl = summary;
    return el;
  }

  function lastFiveLines(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    return lines.slice(-5).join('\n');
  }

  function normalizeReasoningText(text) {
    const str = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!str) return '';
    if (str.length <= MAX_TEXT) return str;
    return str.slice(str.length - MAX_TEXT);
  }

  function renderThinking() {
    const box = ensureThinkingBox();
    if (!box) return;
    const fullText = normalizeReasoningText(state.fullText || state.latestReasoningContent);
    if (!fullText) return;
    const previewText = lastFiveLines(fullText) || fullText;
    if (state.previewEl) state.previewEl.textContent = previewText;
    if (state.fullEl) state.fullEl.textContent = fullText;
    if (state.summaryEl) state.summaryEl.textContent = `Thinking（${new Date(state.lastUpdateAt || Date.now()).toLocaleTimeString()}，可展开）`;
  }

  function appendReasoningDelta(text) {
    const delta = String(text || '');
    if (!delta) return;
    state.fullText = normalizeReasoningText(`${state.fullText || ''}${delta}`);
    state.lastUpdateAt = Date.now();
    renderThinking();
  }

  function setReasoningContent(text) {
    const next = normalizeReasoningText(text);
    if (!next) return;
    if (next.length >= String(state.latestReasoningContent || '').length) {
      state.latestReasoningContent = next;
      if (next.length >= String(state.fullText || '').length) state.fullText = next;
      state.lastUpdateAt = Date.now();
      renderThinking();
    }
  }

  function flattenThinkingBlocks(input, out) {
    if (!input) return;
    if (typeof input === 'string') {
      out.push(input);
      return;
    }
    if (Array.isArray(input)) {
      input.forEach((item) => flattenThinkingBlocks(item, out));
      return;
    }
    if (typeof input === 'object') {
      const candidateKeys = ['text', 'content', 'delta', 'reasoning_content', 'reasoning_delta'];
      for (const key of candidateKeys) {
        if (typeof input[key] === 'string' && input[key]) out.push(input[key]);
      }
      for (const value of Object.values(input)) flattenThinkingBlocks(value, out);
    }
  }

  function handleReasoningPayload(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.reasoning_delta === 'string') appendReasoningDelta(obj.reasoning_delta);
    if (typeof obj.reasoning_content === 'string') setReasoningContent(obj.reasoning_content);

    if (obj.thinking_blocks != null) {
      const pieces = [];
      flattenThinkingBlocks(obj.thinking_blocks, pieces);
      const combined = pieces.join('\n').trim();
      if (combined) setReasoningContent(combined);
    }
  }

  function processStreamChunk(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const clean = line.trim();
      if (!clean) continue;
      const payload = clean.startsWith('data:') ? clean.slice(5).trim() : clean;
      if (!payload || payload === '[DONE]') continue;
      const obj = parseJsonSafe(payload);
      if (obj) handleReasoningPayload(obj);
    }
  }

  function tapResponseStream(res) {
    try {
      const clone = res?.clone?.();
      if (!clone?.body || typeof clone.body.getReader !== 'function') return;
      const reader = clone.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffered += decoder.decode(value, { stream: true });
          const parts = buffered.split(/\n\n/);
          buffered = parts.pop() || '';
          for (const p of parts) processStreamChunk(p);
        }
        const tail = buffered + decoder.decode();
        if (tail.trim()) processStreamChunk(tail);
      })().catch(() => {});
    } catch {}
  }

  function patchFetch() {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function' || originalFetch.__aichatGensparkSonnetThinkingPatched) return;
    const wrapped = async function (...args) {
      let [input, init] = args;
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (ASK_API_RE.test(String(url)) && init && typeof init.body === 'string') {
          const payload = parseJsonSafe(init.body);
          if (payload && shouldProcessAiChat(payload)) {
            const nextModel = forceThinkingModel(payload.ai_chat_model);
            if (nextModel && nextModel !== payload.ai_chat_model) {
              payload.ai_chat_model = nextModel;
              state.lastRewriteModel = nextModel;
              state.rewriteCount += 1;
            }
            init = { ...init, body: JSON.stringify(payload) };
            args[1] = init;
          }
        }
      } catch {}
      const res = await originalFetch.apply(this, args);
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (ASK_API_RE.test(String(url))) tapResponseStream(res);
      } catch {}
      return res;
    };
    wrapped.__aichatGensparkSonnetThinkingPatched = true;
    window.fetch = wrapped;
  }

  function ensurePatchedLoop() {
    try {
      patchFetch();
      window.__aichat_genspark_force_sonnet45_thinking_debug__ = {
        get rewriteCount() {
          return state.rewriteCount;
        },
        get lastRewriteModel() {
          return state.lastRewriteModel;
        },
        get fetchPatched() {
          return !!window.fetch?.__aichatGensparkSonnetThinkingPatched;
        },
        feedReasoning(sample) {
          setReasoningContent(String(sample || ''));
          return {
            preview: state.previewEl?.textContent || '',
            fullLength: (state.fullEl?.textContent || '').length
          };
        }
      };
    } catch {}
    if (!state.patchTimer) {
      state.patchTimer = window.setInterval(() => {
        try {
          patchFetch();
        } catch {}
      }, 1000);
    }
  }

  ensurePatchedLoop();
})();
