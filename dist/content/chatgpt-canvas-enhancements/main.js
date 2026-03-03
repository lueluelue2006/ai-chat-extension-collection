(() => {
  'use strict';

  const STATE_KEY = '__aichat_chatgpt_canvas_enhancements_state_v1__';
  const STATE_VERSION = 1;
  const STYLE_ID = '__aichat_chatgpt_canvas_enhancements_style_v1__';
  const BADGE_CLASS = '__aichat_canvas_id_badge_v1__';
  const BLOCK_SELECTOR = '[data-writing-block][id^="writing-block-"]';
  const TEXTDOC_CARD_SELECTOR = 'div[id^="textdoc-message-"]';
  const CORE_KEY = '__aichat_chatgpt_core_main_v1__';
  const MAPPING_CLIENT_KEY = '__aichat_chatgpt_mapping_client_v1__';
  const MAX_MAPPING_JSON_BYTES = 6 * 1024 * 1024;

  const REFRESH_DEBOUNCE_MS = 650;
  const REFRESH_COOLDOWN_MS = 12_000;
  const ANNOTATE_DEBOUNCE_MS = 80;

  const ALLOWED_FRAME = (() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    return !inIframe;
  })();
  if (!ALLOWED_FRAME) return;

  try {
    const prev = window[STATE_KEY];
    if (prev && typeof prev === 'object' && typeof prev.cleanup === 'function') prev.cleanup();
  } catch {}

  try {
    document.getElementById(STYLE_ID)?.remove?.();
  } catch {}

  function safeCall(fn, ...args) {
    try {
      return typeof fn === 'function' ? fn(...args) : undefined;
    } catch {
      return undefined;
    }
  }

  function now() {
    return Date.now();
  }

  function getCoreApi() {
    try {
      const core = window[CORE_KEY];
      return core && typeof core === 'object' ? core : null;
    } catch {
      return null;
    }
  }

  function getMappingClient() {
    try {
      const client = window[MAPPING_CLIENT_KEY];
      return client && typeof client === 'object' ? client : null;
    } catch {
      return null;
    }
  }

  function getConversationIdFromUrl(url) {
    const core = getCoreApi();
    if (core && typeof core.getConversationIdFromUrl === 'function') {
      const id = safeCall(core.getConversationIdFromUrl, url || location.href);
      return String(id || '').trim();
    }
    try {
      const u = new URL(String(url || ''), location.href);
      const parts = String(u.pathname || '')
        .split('/')
        .filter(Boolean);
      const idx = parts.indexOf('c');
      return idx >= 0 && parts[idx + 1] ? String(parts[idx + 1] || '').trim() : '';
    } catch {
      return '';
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const sheet = document.createElement('style');
    sheet.id = STYLE_ID;
    sheet.textContent = `
      .${BADGE_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 1px 7px;
        margin-right: 8px;
        border-radius: 9999px;
        border: 1px solid rgba(116, 240, 167, 0.45);
        background: rgba(0, 0, 0, 0.65);
        color: #74f0a7;
        font: 12px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
        letter-spacing: 0.2px;
        user-select: none;
        pointer-events: none;
        white-space: nowrap;
      }

      [data-theme='light'] .${BADGE_CLASS} {
        background: rgba(255, 255, 255, 0.75);
        color: #0b6b3a;
        border-color: rgba(11, 107, 58, 0.28);
      }
    `;
    const root = document.head || document.documentElement;
    if (!root) return;
    root.appendChild(sheet);
  }

  const WRITING_MARKER = ':::writing{';
  // Support: id="51231" / id='51231' / id=51231
  // Also tolerate escaped quotes: id=\"51231\" (some backends/models emit this literally)
  const WRITING_ID_RE = /(?:^|\s)id\s*=\s*(?:\\?"([^"]+)"|\\?'([^']+)'|([^\s"'}]+))/i;

  function extractWritingIds(text) {
    const ids = [];
    const input = String(text || '');
    if (!input.includes(WRITING_MARKER)) return ids;

    let cursor = 0;
    while (true) {
      const start = input.indexOf(WRITING_MARKER, cursor);
      if (start < 0) break;

      const attrsStart = start + WRITING_MARKER.length;
      const end = input.indexOf('}', attrsStart);
      if (end < 0) break;

      const attrs = input.slice(attrsStart, end);
      const idMatch = attrs.match(WRITING_ID_RE);
      const id = String(idMatch?.[1] || idMatch?.[2] || idMatch?.[3] || '').trim();
      if (id) ids.push(id);

      cursor = end + 1;
    }

    return ids;
  }

  function buildWritingIndex(mappingJson) {
    const out = new Map();
    const mapping = mappingJson && typeof mappingJson === 'object' ? mappingJson.mapping : null;
    if (!mapping || typeof mapping !== 'object') return out;

    for (const node of Object.values(mapping)) {
      const msg = node && typeof node === 'object' ? node.message : null;
      if (!msg || typeof msg !== 'object') continue;
      const content = msg.content;
      const parts = content && typeof content === 'object' ? content.parts : null;
      if (!Array.isArray(parts)) continue;

      const joined = parts.filter((p) => typeof p === 'string').join('\\n');
      if (!joined.includes(':::writing{')) continue;

      const ids = extractWritingIds(joined);
      if (!ids.length) continue;

      const msgId = String(msg.id || '').trim();
      if (!msgId) continue;
      out.set(msgId, ids);
    }

    return out;
  }

  function listWritingBlocks() {
    try {
      return Array.from(document.querySelectorAll(BLOCK_SELECTOR));
    } catch {
      return [];
    }
  }

  function listTextdocCards() {
    try {
      return Array.from(document.querySelectorAll(TEXTDOC_CARD_SELECTOR));
    } catch {
      return [];
    }
  }

  function clearBadges() {
    try {
      document.querySelectorAll(`.${BADGE_CLASS}`).forEach((n) => n.remove());
    } catch {}
  }

  function getMsgIdFromBlock(el) {
    try {
      const raw = String(el?.id || '');
      return raw.startsWith('writing-block-') ? raw.slice('writing-block-'.length) : '';
    } catch {
      return '';
    }
  }

  function compareDomOrder(a, b) {
    if (a === b) return 0;
    try {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    } catch {}
    return 0;
  }

  function getTextdocIdFromCard(el) {
    try {
      const raw = String(el?.id || '');
      if (!raw.startsWith('textdoc-message-')) return '';
      return raw.slice('textdoc-message-'.length).trim();
    } catch {
      return '';
    }
  }

  function formatTextdocId(textdocId) {
    const id = String(textdocId || '').trim();
    if (!id) return '';
    if (id.length <= 12) return id;
    const head = id.slice(0, 6);
    const tail = id.slice(-5);
    return `${head}…${tail}`;
  }

  function setBlockBadge(blockEl, canvasId) {
    if (!blockEl || !(blockEl instanceof Element)) return false;
    const headerInner = blockEl.querySelector(':scope > .sticky > div');
    if (!headerInner) return false;
    const labelContainer = headerInner.firstElementChild;
    if (!labelContainer || !(labelContainer instanceof Element)) return false;

    const existing = labelContainer.querySelector(`:scope > span.${BADGE_CLASS}`);
    if (existing && existing.getAttribute('data-canvas-id') === canvasId) return false;
    try {
      existing?.remove?.();
    } catch {}

    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.setAttribute('data-canvas-id', String(canvasId || '').trim());
    badge.textContent = `Canvas ${String(canvasId || '').trim()}`;
    try {
      labelContainer.insertBefore(badge, labelContainer.firstChild);
    } catch {
      try {
        labelContainer.appendChild(badge);
      } catch {
        return false;
      }
    }
    return true;
  }

  function setTextdocBadge(cardEl) {
    if (!cardEl || !(cardEl instanceof Element)) return false;
    const textdocId = getTextdocIdFromCard(cardEl);
    if (!textdocId) return false;

    const shortId = formatTextdocId(textdocId);
    if (!shortId) return false;

    const headerBar = cardEl.querySelector(':scope > div.sticky > div');
    if (!headerBar) return false;

    const left = headerBar.firstElementChild;
    if (!left || !(left instanceof Element)) return false;

    const existing = left.querySelector(`:scope > span.${BADGE_CLASS}`);
    if (existing && existing.getAttribute('data-textdoc-id') === textdocId) return false;
    try {
      existing?.remove?.();
    } catch {}

    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.setAttribute('data-textdoc-id', textdocId);
    badge.textContent = `Doc ${shortId}`;

    try {
      left.insertBefore(badge, left.firstChild);
    } catch {
      try {
        left.appendChild(badge);
      } catch {
        return false;
      }
    }

    return true;
  }

  const state = {
    version: STATE_VERSION,
    disposed: false,
    conversationId: '',
    writingIdsByMsg: new Map(),
    mappingAbort: null,
    mappingPromise: null,
    refreshTimer: 0,
    annotateTimer: 0,
    nextRefreshAllowedAt: 0,
    lastRefreshAt: 0,
    mo: null,
    routeUnsub: null,
    cleanup: null,
  };

  function scheduleAnnotate() {
    if (state.disposed) return;
    if (state.annotateTimer) return;
    state.annotateTimer = window.setTimeout(() => {
      state.annotateTimer = 0;
      annotateNow();
    }, ANNOTATE_DEBOUNCE_MS);
  }

  function scheduleRefresh(reason) {
    if (state.disposed) return;
    const convId = getConversationIdFromUrl(location.href);
    if (!convId) return;
    if (!listWritingBlocks().length) return;

    const ts = now();
    if (ts < state.nextRefreshAllowedAt) return;
    if (state.mappingPromise) return;

    try {
      if (state.refreshTimer) clearTimeout(state.refreshTimer);
    } catch {}
    state.refreshTimer = window.setTimeout(() => {
      state.refreshTimer = 0;
      void refreshMappingNow(reason);
    }, REFRESH_DEBOUNCE_MS);
  }

  async function refreshMappingNow(reason) {
    if (state.disposed) return;
    if (!listWritingBlocks().length) return;
    const convId = getConversationIdFromUrl(location.href);
    if (!convId) return;

    const client = getMappingClient();
    if (!client || typeof client.fetchConversationMapping !== 'function') return;

    const ts = now();
    if (ts < state.nextRefreshAllowedAt) return;
    if (state.mappingPromise) return;

    state.conversationId = convId;
    state.lastRefreshAt = ts;

    const abort = new AbortController();
    state.mappingAbort = abort;

    state.mappingPromise = (async () => {
      try {
        const json = await client.fetchConversationMapping(convId, {
          signal: abort.signal,
          maxJsonBytes: MAX_MAPPING_JSON_BYTES
        });
        if (state.disposed) return;
        state.writingIdsByMsg = buildWritingIndex(json);
      } catch {
        state.nextRefreshAllowedAt = now() + REFRESH_COOLDOWN_MS;
      } finally {
        state.mappingAbort = null;
        state.mappingPromise = null;
        scheduleAnnotate();
      }
    })();

    void reason;
  }

  function annotateNow() {
    if (state.disposed) return;
    ensureStyle();

    const textdocCards = listTextdocCards();
    let wroteAny = false;
    if (textdocCards.length) {
      for (const card of textdocCards) wroteAny = setTextdocBadge(card) || wroteAny;
    }

    const blocks = listWritingBlocks();
    if (!blocks.length) return;

    const groups = new Map();
    for (const el of blocks) {
      const msgId = getMsgIdFromBlock(el);
      if (!msgId) continue;
      const list = groups.get(msgId);
      if (list) list.push(el);
      else groups.set(msgId, [el]);
    }

    let needRefresh = false;
    for (const [msgId, els] of groups.entries()) {
      const ids = state.writingIdsByMsg.get(msgId) || null;
      if (!ids || !ids.length) {
        needRefresh = true;
        continue;
      }

      els.sort(compareDomOrder);
      for (let i = 0; i < els.length; i++) {
        const canvasId = ids[i] || '';
        if (!canvasId) {
          needRefresh = true;
          continue;
        }
        wroteAny = setBlockBadge(els[i], canvasId) || wroteAny;
      }
    }

    if (needRefresh) scheduleRefresh('missing-canvas-id');
    if (!wroteAny && blocks.length) scheduleRefresh('no-badge-written');
  }

  function resetForRouteChange() {
    if (state.disposed) return;
    const nextId = getConversationIdFromUrl(location.href);
    if (nextId && nextId === state.conversationId) {
      scheduleAnnotate();
      return;
    }

    state.conversationId = nextId;
    state.writingIdsByMsg = new Map();
    state.nextRefreshAllowedAt = 0;

    try {
      state.mappingAbort?.abort?.();
    } catch {}
    state.mappingAbort = null;
    state.mappingPromise = null;

    clearBadges();
    scheduleAnnotate();
    scheduleRefresh('route-change');
  }

  function startObservers() {
    const core = getCoreApi();
    if (core && typeof core.onRouteChange === 'function') {
      state.routeUnsub = core.onRouteChange(() => resetForRouteChange());
    }

    const mo = new MutationObserver((mutations) => {
      if (state.disposed) return;
      let sawWritingBlock = false;
      let sawTextdoc = false;
      for (const m of mutations) {
        if (!m || !m.addedNodes) continue;
        for (const n of Array.from(m.addedNodes)) {
          if (!(n instanceof Element)) continue;
          if (n.matches?.(BLOCK_SELECTOR) || n.querySelector?.(BLOCK_SELECTOR)) {
            sawWritingBlock = true;
            break;
          }
          if (n.matches?.(TEXTDOC_CARD_SELECTOR) || n.querySelector?.(TEXTDOC_CARD_SELECTOR)) {
            sawTextdoc = true;
            // keep scanning: writing blocks should still trigger refresh
          }
        }
        if (sawWritingBlock) break;
      }
      if (!sawWritingBlock && !sawTextdoc) return;
      scheduleAnnotate();
      if (sawWritingBlock) scheduleRefresh('dom-added');
    });

    try {
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      state.mo = mo;
    } catch {
      try {
        mo.disconnect();
      } catch {}
    }
  }

  function cleanup() {
    if (state.disposed) return;
    state.disposed = true;

    try {
      if (state.refreshTimer) clearTimeout(state.refreshTimer);
    } catch {}
    state.refreshTimer = 0;

    try {
      if (state.annotateTimer) clearTimeout(state.annotateTimer);
    } catch {}
    state.annotateTimer = 0;

    try {
      state.mappingAbort?.abort?.();
    } catch {}
    state.mappingAbort = null;
    state.mappingPromise = null;

    try {
      state.mo?.disconnect?.();
    } catch {}
    state.mo = null;

    try {
      if (typeof state.routeUnsub === 'function') state.routeUnsub();
    } catch {}
    state.routeUnsub = null;

    clearBadges();
    try {
      document.getElementById(STYLE_ID)?.remove?.();
    } catch {}
  }

  state.cleanup = cleanup;

  try {
    Object.defineProperty(window, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[STATE_KEY] = state;
    } catch {}
  }

  state.conversationId = getConversationIdFromUrl(location.href);
  startObservers();
  scheduleAnnotate();
  scheduleRefresh('init');
})();
