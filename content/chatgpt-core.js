(() => {
  'use strict';

  // ChatGPT shared helpers (ISOLATED world).
  // Goal: reduce duplicated brittle selectors / route polling across ChatGPT-only modules.

  const API_KEY = '__aichat_chatgpt_core_v1__';
  const DOM_ADAPTER_KEY = '__aichat_chatgpt_dom_adapter_v1__';
  const API_VERSION = 11;
  const DOM_ADAPTER_MIN_VERSION = 1;
  const BRIDGE_CHANNEL = 'quicknav';
  const BRIDGE_V = 1;
  const BRIDGE_NONCE_DATASET_KEY = 'quicknavBridgeNonceV1';

  // Avoid installing timers/listeners inside iframes.
  const isAllowedFrame = (() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    return !inIframe;
  })();

  if (!isAllowedFrame) return;

  try {
    const prev = globalThis[API_KEY];
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= API_VERSION) return;
  } catch {}

  function getOrCreateBridgeNonce() {
    const fallback = 'quicknav-bridge-fallback';
    try {
      const docEl = document.documentElement;
      if (!docEl) return fallback;
      const existing = String(docEl.dataset?.[BRIDGE_NONCE_DATASET_KEY] || '').trim();
      if (existing) return existing;
      const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      docEl.dataset[BRIDGE_NONCE_DATASET_KEY] = next;
      const stored = String(docEl.dataset?.[BRIDGE_NONCE_DATASET_KEY] || '').trim();
      return stored || next || fallback;
    } catch {
      return fallback;
    }
  }

  const BRIDGE_NONCE = getOrCreateBridgeNonce();

  function postBridgeMessage(type, payload = null) {
    try {
      const msg = Object.assign(
        {
          __quicknav: 1,
          channel: BRIDGE_CHANNEL,
          v: BRIDGE_V,
          nonce: BRIDGE_NONCE
        },
        payload && typeof payload === 'object' ? payload : {}
      );
      msg.type = String(type || '');
      if (!msg.type) return;
      window.postMessage(msg, '*');
    } catch {}
  }

  function now() {
    return Date.now();
  }

  const TURN_HOST_SELECTOR = 'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]';
  const TURN_SELECTOR = `${TURN_HOST_SELECTOR}, [data-testid^="conversation-turn-"]`;
  const USER_TURN_BODY_SELECTOR =
    '[data-message-author-role="user"] .whitespace-pre-wrap, [data-message-author-role="user"] div[data-message-content-part], [data-message-author-role="user"] .prose, div[data-message-author-role="user"] p, .text-message[data-author="user"]';
  const ASSISTANT_TURN_BODY_SELECTOR =
    '.deep-research-result, .border-token-border-sharp .markdown, [data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] .prose, [data-message-author-role="assistant"] div[data-message-content-part], div[data-message-author-role="assistant"] p, .text-message[data-author="assistant"]';
  const TURN_PREVIEW_SKIP_SELECTOR = 'pre, .katex-display, mjx-container, table';
  const TURN_RECORD_COUNT_ATTR = 'data-aichat-core-turn-record-count';
  const TURN_RECORD_BODYREFS_ATTR = 'data-aichat-core-turn-record-live-body-refs';
  const TURN_RECORD_VERSION_ATTR = 'data-aichat-core-turn-record-version';
  const MODEL_SWITCHER_SELECTOR =
    'button[data-testid="model-switcher-dropdown-button"], button[aria-label*="Model selector" i], button[aria-label*="current model is" i]';
  const COMPOSER_MODEL_TRIGGER_SELECTOR =
    'button.__composer-pill[aria-haspopup="menu"], button.__composer-pill, button[aria-haspopup="menu"]';
  const COMPOSER_MODE_TOKEN_RE =
    /\b(?:latest|instant|thinking|pro|light|heavy|standard|extended|extended pro|standard pro|light thinking|heavy thinking)\b|思考|推理|专业|标准|扩展|即时/i;
  const COMPOSER_MODEL_EXCLUDE_RE = /\b(?:add files?|attach|dictation|voice|microphone|send|submit)\b|添加|附件|语音|听写|发送|提交/i;
  const DIRECT_TURN_HOST_SELECTOR = prefixSelectorList(':scope >', TURN_HOST_SELECTOR);
  const WRAPPED_TURN_HOST_SELECTOR = prefixSelectorList(':scope > *', TURN_HOST_SELECTOR);

  function prefixSelectorList(prefix, selectorList) {
    return String(selectorList || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => `${prefix} ${part}`)
      .join(', ');
  }

  function getUiLocale() {
    try {
      return String(document.documentElement?.dataset?.aichatLocale || navigator.language || 'en').trim() || 'en';
    } catch {
      return 'en';
    }
  }

  function uiText(zh, en) {
    return /^zh/i.test(getUiLocale()) ? zh : en;
  }

  function isVisibleElement(el) {
    try {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      return true;
    } catch {
      return false;
    }
  }

  function pickBottomMostVisible(candidates) {
    const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    let best = null;
    let bestScore = -Infinity;
    for (const el of list) {
      try {
        if (!el || !el.getBoundingClientRect) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const score = Number(r.bottom) || 0;
        if (score >= bestScore) {
          bestScore = score;
          best = el;
        }
      } catch {}
    }
    return best;
  }

  function safeCall(fn, ...args) {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  }

  function getDomAdapter() {
    try {
      const api = globalThis[DOM_ADAPTER_KEY] || window[DOM_ADAPTER_KEY] || null;
      if (api && typeof api === 'object' && Number(api.version || 0) >= DOM_ADAPTER_MIN_VERSION) return api;
    } catch {}
    return null;
  }

  function getConversationIdFromUrl(url) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getConversationIdFromUrl === 'function') return adapter.getConversationIdFromUrl(url);
    try {
      const u = new URL(String(url || ''), location.href);
      const parts = String(u.pathname || '')
        .split('/')
        .filter(Boolean);
      const idx = parts.indexOf('c');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      const sidx = parts.indexOf('share');
      if (sidx >= 0 && parts[sidx + 1]) return parts[sidx + 1];
      return '';
    } catch {
      // Fallback: parse pathname directly.
      try {
        const parts = String(location.pathname || '')
          .split('/')
          .filter(Boolean);
        const idx = parts.indexOf('c');
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
        const sidx = parts.indexOf('share');
        if (sidx >= 0 && parts[sidx + 1]) return parts[sidx + 1];
      } catch {}
      return '';
    }
  }

  function getRoute() {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getRoute === 'function') return adapter.getRoute();
    const href = (() => {
      try {
        return String(location.href || '');
      } catch {
        return '';
      }
    })();
    const pathname = (() => {
      try {
        return String(location.pathname || '');
      } catch {
        return '';
      }
    })();
    const conversationId = getConversationIdFromUrl(href);
    return {
      href,
      pathname,
      conversationId,
      isConversation: pathname.startsWith('/c/'),
      isShare: pathname.startsWith('/share/'),
      isHome: pathname === '/' || pathname === ''
    };
  }

  function getEditorEl() {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getEditorEl === 'function') return adapter.getEditorEl();
    // Real editor is usually ProseMirror; keep fallbacks.
    try {
      const list = Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]'));
      const pm = pickBottomMostVisible(list);
      if (pm) return pm;
    } catch {}
    try {
      const list = Array.from(document.querySelectorAll('#prompt-textarea[contenteditable="true"]'));
      const el = pickBottomMostVisible(list);
      if (el) return el;
    } catch {}
    try {
      const el = document.querySelector('#prompt-textarea');
      if (el) return el;
    } catch {}
    try {
      const el = document.querySelector('textarea[name="prompt-textarea"]');
      if (el) return el;
    } catch {}
    return null;
  }

  function getComposerForm(editorEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getComposerForm === 'function') return adapter.getComposerForm(editorEl);
    try {
      const el = editorEl || getEditorEl();
      return el?.closest?.('form') || null;
    } catch {
      return null;
    }
  }

  function getModelSwitcherButton() {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getModelSwitcherButton === 'function') return adapter.getModelSwitcherButton();
    try {
      const visible = pickBottomMostVisible(Array.from(document.querySelectorAll(MODEL_SWITCHER_SELECTOR)).filter(isVisibleElement));
      if (visible) return visible;
    } catch {}
    try {
      const composer = getComposerModelButton();
      if (composer) return composer;
    } catch {}
    try {
      return document.querySelector(MODEL_SWITCHER_SELECTOR);
    } catch {
      return null;
    }
  }

  function isComposerModelTrigger(button, editorEl) {
    try {
      if (!(button instanceof HTMLButtonElement) || !isVisibleElement(button)) return false;
      const form = getComposerForm(editorEl);
      if (!(form instanceof HTMLElement) || !form.contains(button)) return false;
      const text = String(button.innerText || button.textContent || '').trim();
      const aria = String(button.getAttribute?.('aria-label') || '').trim();
      const testId = String(button.getAttribute?.('data-testid') || '').trim();
      const combined = `${text} ${aria} ${testId}`.trim();
      if (!combined || COMPOSER_MODEL_EXCLUDE_RE.test(combined)) return false;
      return COMPOSER_MODE_TOKEN_RE.test(combined);
    } catch {
      return false;
    }
  }

  function getComposerModelButton(editorEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getComposerModelButton === 'function') return adapter.getComposerModelButton(editorEl);
    try {
      const form = getComposerForm(editorEl);
      const candidates = Array.from(form?.querySelectorAll?.(COMPOSER_MODEL_TRIGGER_SELECTOR) || []);
      const modelButtons = candidates.filter((button) => isComposerModelTrigger(button, editorEl));
      const pill = pickBottomMostVisible(modelButtons.filter((button) => /\b__composer-pill\b/.test(String(button.className || ''))));
      return pill || pickBottomMostVisible(modelButtons) || null;
    } catch {
      return null;
    }
  }

  function readCurrentModelLabel() {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.readCurrentModelLabel === 'function') return adapter.readCurrentModelLabel();
    try {
      const button = getModelSwitcherButton();
      const aria = String(button?.getAttribute?.('aria-label') || '').trim();
      if (aria && /current model is/i.test(aria)) return aria.replace(/^.*current model is\s*/i, '').trim();
      const text = String(button?.innerText || button?.textContent || '').trim();
      if (text) return text;
      return aria;
    } catch {
      return '';
    }
  }

  function readComposerModeLabel(editorEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.readComposerModeLabel === 'function') return adapter.readComposerModeLabel(editorEl);
    try {
      const form = getComposerForm(editorEl);
      const buttons = Array.from(form?.querySelectorAll?.("button[aria-haspopup='menu'],button") || []);
      for (const button of buttons) {
        if (!isVisibleElement(button)) continue;
        const text = String(button?.innerText || button?.textContent || '').trim();
        const aria = String(button?.getAttribute?.('aria-label') || '').trim();
        const combined = `${text} ${aria}`.trim();
        if (!combined) continue;
        if (COMPOSER_MODE_TOKEN_RE.test(combined)) return text || aria;
      }
    } catch {}
    return '';
  }

  function findSendButton(editorEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.findSendButton === 'function') return adapter.findSendButton(editorEl);
    const form = getComposerForm(editorEl);
    const root = form || document;
    try {
      const direct =
        root.querySelector('#composer-submit-button') ||
        root.querySelector('button[data-testid="send-button"]') ||
        root.querySelector('button[aria-label*="Send" i]') ||
        root.querySelector('button[type="submit"]');
      if (direct) return direct;
      const buttons = Array.from(root.querySelectorAll('button'));
      for (const button of buttons) {
        const text = String(button?.innerText || button?.textContent || '').trim();
        const aria = String(button?.getAttribute?.('aria-label') || '').trim();
        const combined = `${text} ${aria}`.trim();
        if (!combined) continue;
        if (/\bstop\b/i.test(combined)) continue;
        if (/\b(send|submit)\b/i.test(combined) || /发送|提交/.test(combined)) return button;
      }
      return null;
    } catch {
      return null;
    }
  }

  function findStopButton(editorEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.findStopButton === 'function') return adapter.findStopButton(editorEl);
    const form = getComposerForm(editorEl);
    const root = form || document;
    try {
      return root.querySelector('button[data-testid="stop-button"]') || root.querySelector('button[aria-label*="Stop" i]') || null;
    } catch {
      return null;
    }
  }

  function isGenerating(editorEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.isGenerating === 'function') return !!adapter.isGenerating(editorEl);
    return !!findStopButton(editorEl);
  }

  function isElementDisabled(el) {
    if (!el) return true;
    try {
      if (el instanceof HTMLButtonElement) return !!el.disabled;
    } catch {}
    try {
      const ariaDisabled = el.getAttribute?.('aria-disabled');
      if (ariaDisabled && ariaDisabled !== 'false') return true;
    } catch {}
    return false;
  }

  function clickSendButton(editorEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.clickSendButton === 'function') return !!adapter.clickSendButton(editorEl);
    try {
      const btn = findSendButton(editorEl);
      if (!(btn instanceof HTMLElement)) return false;
      if (isElementDisabled(btn)) return false;
      const testId = String(btn.getAttribute?.('data-testid') || '');
      if (testId && /stop/i.test(testId)) return false;
      btn.click();
      return true;
    } catch {
      return false;
    }
  }

  function clickStopButton(editorEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.clickStopButton === 'function') return !!adapter.clickStopButton(editorEl);
    try {
      const btn = findStopButton(editorEl);
      if (!(btn instanceof HTMLElement)) return false;
      if (isElementDisabled(btn)) return false;
      btn.click();
      return true;
    } catch {
      return false;
    }
  }

  function normalizeTurnElement(el) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.normalizeTurnElement === 'function') return adapter.normalizeTurnElement(el);
    try {
      if (!(el instanceof Element)) return null;
      if (el.matches(TURN_HOST_SELECTOR)) return el;
      return el.closest?.(TURN_HOST_SELECTOR) || el.closest?.('[data-testid^="conversation-turn-"]') || null;
    } catch {
      return null;
    }
  }

  function isLikelyConversationTurnElement(turnEl) {
    try {
      if (!(turnEl instanceof Element)) return false;
      const role = inferTurnRole(turnEl);
      if (role === 'user' || role === 'assistant') return true;
      if (getMessageId(turnEl) || getTurnId(turnEl)) return true;

      const bodyEl = findTurnBodyEl(turnEl, role);
      const hasMessageShell = !!turnEl.querySelector?.(
        '[data-message-id], [data-message-author-role], .text-message[data-author], .markdown, .prose, .whitespace-pre-wrap, div[data-message-content-part]'
      );
      if (!hasMessageShell) return false;

      const text = collectTurnPreviewText(bodyEl instanceof Element ? bodyEl : turnEl, {
        hardCap: 64,
        nodeCap: 32
      });
      return !!text;
    } catch {}
    return false;
  }

  const chatScrollWatch = (() => ({
    scroller: null,
    at: 0
  }))();

  const visibleTurnsWatch = (() => ({
    ts: 0,
    turnsVersion: 0,
    scroller: null,
    marginPx: 0,
    result: null
  }))();

  function getTurnsRoot() {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getTurnsRoot === 'function') return adapter.getTurnsRoot();
    try {
      const stable = document.querySelector('[data-testid="conversation-turns"]');
      if (stable) return stable;
    } catch {}
    // Newer ChatGPT builds may not expose a stable `conversation-turns` container.
    // Fall back to a narrow ancestor derived from the first turn host.
    try {
      const allTurns = [];
      const seen = new Set();
      for (const item of Array.from(document.querySelectorAll(TURN_SELECTOR))) {
        const turn = normalizeTurnElement(item);
        if (!turn || seen.has(turn)) continue;
        if (!isLikelyConversationTurnElement(turn)) continue;
        seen.add(turn);
        allTurns.push(turn);
      }
      const first = allTurns[0] || null;
      if (first) {
        // Prefer the smallest ancestor that still covers every normalized turn.
        // Current ChatGPT wraps each turn in its own div, so the first direct-turn
        // wrapper can contain only one turn.
        let cur = first.parentElement;
        const MAX_DEPTH = 12;
        for (let i = 0; cur && cur !== document.body && cur !== document.documentElement && i < MAX_DEPTH; i++) {
          try {
            if (allTurns.every((turn) => cur.contains(turn))) return cur;
          } catch {}
          cur = cur.parentElement;
        }

        // Pragmatic fallback: the overall thread container.
        const thread = document.getElementById('thread');
        if (thread && thread.querySelector?.(TURN_SELECTOR)) return thread;

        return first.parentElement || document;
      }
    } catch {}
    return document;
  }

  function getTurnArticles(root, options = null) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getTurnArticles === 'function') return adapter.getTurnArticles(root, options);
    const forceFresh = !!(options && typeof options === 'object' && options.forceFresh);
    try {
      const cachedRoot = turnsWatch.cachedRoot;
      const cachedTurns = turnsWatch.cachedTurns;
      const useCached =
        !forceFresh &&
        Array.isArray(cachedTurns) &&
        cachedTurns.length &&
        (!root || root === document || root === cachedRoot);
      if (useCached) return cachedTurns.slice();
    } catch {}

    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    try {
      const list = Array.from(scope.querySelectorAll(TURN_SELECTOR));
      const normalized = [];
      const seen = new Set();
      for (const item of list) {
        const turn = normalizeTurnElement(item);
        if (!turn || seen.has(turn)) continue;
        if (!isLikelyConversationTurnElement(turn)) continue;
        seen.add(turn);
        normalized.push(turn);
      }
      return normalized;
    } catch {}
    return [];
  }

  function isWindowScroller(el) {
    const doc = document.documentElement;
    const se = document.scrollingElement || doc;
    return !el || el === window || el === document || el === document.body || el === doc || el === se;
  }

  function isScrollableY(el) {
    try {
      if (!(el instanceof Element)) return false;
      const style = getComputedStyle(el);
      const oy = String(style?.overflowY || '').toLowerCase();
      if (!(oy === 'auto' || oy === 'scroll' || oy === 'overlay')) return false;
      return (el.scrollHeight || 0) > (el.clientHeight || 0) + 1;
    } catch {}
    return false;
  }

  function findClosestScrollContainer(start) {
    let el = start || null;
    while (el && el !== document.documentElement && el !== document.body) {
      if (isScrollableY(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function getChatScrollContainer(force = false) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getChatScrollContainer === 'function') return adapter.getChatScrollContainer(force);
    const ts = now();
    if (!force) {
      try {
        const cached = chatScrollWatch.scroller;
        if (cached && cached.isConnected && (ts - chatScrollWatch.at) < 1200) return cached;
      } catch {}
    }

    let next = null;
    try {
      const main = document.getElementById('main') || document.querySelector('main');
      const parent = main?.parentElement || null;
      if (isScrollableY(parent)) next = parent;
    } catch {}

    if (!next) {
      try {
        const root = getTurnsRoot();
        if (root && root !== document) {
          next = findClosestScrollContainer(root) || root.parentElement || null;
        }
      } catch {}
    }

    if (!next) {
      try {
        const anchor =
          document.querySelector(TURN_SELECTOR) ||
          document.querySelector('[data-message-id]') ||
          document.getElementById('thread') ||
          document.querySelector('main') ||
          document.querySelector('[role="main"]') ||
          document.body;
        next = findClosestScrollContainer(anchor) || document.scrollingElement || document.documentElement;
      } catch {
        next = document.scrollingElement || document.documentElement;
      }
    }

    chatScrollWatch.scroller = next || null;
    chatScrollWatch.at = ts;
    return next || null;
  }

  function getScrollerViewportBounds(scroller, marginPx = 0) {
    const margin = Math.max(0, Number(marginPx) || 0);
    if (isWindowScroller(scroller)) {
      return {
        top: -margin,
        bottom: (window.innerHeight || 0) + margin
      };
    }
    try {
      const rect = scroller?.getBoundingClientRect?.();
      if (rect) {
        return {
          top: rect.top - margin,
          bottom: rect.bottom + margin
        };
      }
    } catch {}
    return {
      top: -margin,
      bottom: (window.innerHeight || 0) + margin
    };
  }

  function findFirstVisibleTurnIndex(turns, topBound) {
    let lo = 0;
    let hi = turns.length - 1;
    let ans = turns.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const rect = turns[mid]?.getBoundingClientRect?.();
      if (rect && rect.bottom >= topBound) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }

  function findLastVisibleTurnIndex(turns, bottomBound) {
    let lo = 0;
    let hi = turns.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const rect = turns[mid]?.getBoundingClientRect?.();
      if (rect && rect.top <= bottomBound) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  function getVisibleTurnWindow(force = false, marginPx = 0) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getVisibleTurnWindow === 'function') return adapter.getVisibleTurnWindow(force, marginPx);
    const snapshot = getTurnsSnapshot(force);
    const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : [];
    const scroller = getChatScrollContainer(force);
    const margin = Math.max(0, Number(marginPx) || 0);
    const ts = now();
    if (
      !force &&
      visibleTurnsWatch.result &&
      visibleTurnsWatch.turnsVersion === Number(snapshot?.turnsVersion || 0) &&
      visibleTurnsWatch.scroller === scroller &&
      visibleTurnsWatch.marginPx === margin &&
      (ts - visibleTurnsWatch.ts) < 80
    ) {
      return visibleTurnsWatch.result;
    }

    const total = turns.length;
    let first = 0;
    let last = total - 1;
    if (total) {
      const bounds = getScrollerViewportBounds(scroller, margin);
      first = findFirstVisibleTurnIndex(turns, bounds.top);
      last = findLastVisibleTurnIndex(turns, bounds.bottom);
      if (first >= total) first = total - 1;
      if (last < 0) last = 0;
      if (last < first) last = first;
    }

    const result = {
      root: snapshot?.root || null,
      scroller: scroller || null,
      turns,
      turnsVersion: Number(snapshot?.turnsVersion || 0),
      total,
      first,
      last,
      visibleTurns: total ? turns.slice(first, last + 1) : []
    };
    visibleTurnsWatch.ts = ts;
    visibleTurnsWatch.turnsVersion = result.turnsVersion;
    visibleTurnsWatch.scroller = scroller || null;
    visibleTurnsWatch.marginPx = margin;
    visibleTurnsWatch.result = result;
    return result;
  }

  function shouldObserveTurnsSubtree(root) {
    try {
      if (!root || typeof root.querySelectorAll !== 'function') return true;
      const deep = root.querySelectorAll(TURN_HOST_SELECTOR).length;
      if (!deep) return true;
      const direct = root.querySelectorAll(DIRECT_TURN_HOST_SELECTOR).length;
      // If all turn hosts are direct children, avoid subtree observation to ignore streaming text mutations.
      if (direct && direct === deep) return false;
      // Common case: turns are wrapped one level deep (e.g. :scope > div > section/article).
      // We can still keep `subtree:false` and just detect wrapper insertions.
      const wrapped = root.querySelectorAll(WRAPPED_TURN_HOST_SELECTOR).length;
      if (wrapped && wrapped === deep) return false;
    } catch {}
    return true;
  }

  // === Turns change subscription (ISOLATED) ===
  const turnsWatch = (() => {
    const st = {
      mo: null,
      listeners: new Set(),
      scheduled: false,
      timer: 0,
      root: null,
      pendingAddedTurns: new Set(),
      bootstrapTimer: 0,
      bootstrapAttempts: 0,
      routeUnsub: null,
      cachedRoot: null,
      cachedTurns: [],
      version: 0
    };
    return st;
  })();

  function refreshTurnsSnapshot(root, { addedHint = null, force = false } = {}) {
    const nextRoot = root && root !== document ? root : getTurnsRoot();
    const normalizedRoot = nextRoot && nextRoot !== document ? nextRoot : document;
    const prevRoot = turnsWatch.cachedRoot;
    const prevTurns = Array.isArray(turnsWatch.cachedTurns) ? turnsWatch.cachedTurns : [];
    const prevSet = prevRoot === normalizedRoot ? new Set(prevTurns) : null;
    // Force a DOM rescan here. This is the single path that is allowed to replace the
    // cached turn list, so reading `cachedTurns` would freeze the snapshot after appends.
    const turns = getTurnArticles(normalizedRoot, { forceFresh: true });
    const turnsSet = new Set(turns);
    const rootChanged = prevRoot !== normalizedRoot;

    const addedTurns = [];
    if (Array.isArray(addedHint) && addedHint.length) {
      for (const item of addedHint) {
        const turn = normalizeTurnElement(item);
        if (!turn || !turnsSet.has(turn) || (prevSet && prevSet.has(turn))) continue;
        addedTurns.push(turn);
      }
    }
    if (!addedTurns.length && prevSet) {
      for (const turn of turns) {
        if (!prevSet.has(turn)) addedTurns.push(turn);
      }
    }

    const removedTurns = [];
    if (prevSet) {
      for (const turn of prevTurns) {
        if (!turnsSet.has(turn)) removedTurns.push(turn);
      }
    }

    let changed = force || rootChanged || prevTurns.length !== turns.length;
    if (!changed && prevSet) {
      for (let i = 0; i < turns.length; i += 1) {
        if (turns[i] !== prevTurns[i]) {
          changed = true;
          break;
        }
      }
    } else if (!prevSet && turns.length) {
      changed = true;
    }

    if (changed || !Array.isArray(turnsWatch.cachedTurns)) turnsWatch.version += 1;
    turnsWatch.cachedRoot = normalizedRoot;
    turnsWatch.cachedTurns = turns;

    return {
      root: normalizedRoot,
      turns,
      turnsVersion: turnsWatch.version,
      rootChanged,
      addedTurns,
      removedTurns
    };
  }

  function getTurnsSnapshot(force = false) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getTurnsSnapshot === 'function') return adapter.getTurnsSnapshot(force);
    const root = turnsWatch.root && turnsWatch.root.isConnected ? turnsWatch.root : getTurnsRoot();
    if (
      !force &&
      turnsWatch.cachedRoot === root &&
      Array.isArray(turnsWatch.cachedTurns) &&
      turnsWatch.cachedTurns.length
    ) {
      return {
        root,
        turns: turnsWatch.cachedTurns,
        turnsVersion: turnsWatch.version,
        rootChanged: false,
        addedTurns: [],
        removedTurns: []
      };
    }
    return refreshTurnsSnapshot(root, { force });
  }

  function isTurnishNode(node) {
    try {
      if (!node || !(node instanceof Element)) return false;
      if (node.matches(TURN_SELECTOR)) return true;
      if (node.querySelector?.(TURN_SELECTOR)) return true;
    } catch {}
    return false;
  }

  function emitTurnsChange(payload) {
    const list = Array.from(turnsWatch.listeners);
    if (!list.length) return;
    for (const fn of list) safeCall(fn, payload);
  }

  function collectAddedTurnsFromNode(node, out) {
    if (!out) return;
    // Avoid unbounded growth if a huge subtree is added in one tick.
    const LIMIT = 60;
    try {
      if (!node || !(node instanceof Element)) return;
      if (out.size > LIMIT) return;
      const turn = normalizeTurnElement(node);
      if (turn) {
        out.add(turn);
        return;
      }
      const list = node.querySelectorAll?.(TURN_SELECTOR);
      if (!list || !list.length) return;
      for (const el of Array.from(list)) {
        const normalized = normalizeTurnElement(el);
        if (normalized) out.add(normalized);
        if (out.size > LIMIT) break;
      }
    } catch {}
  }

  function stopTurnsBootstrap() {
    try {
      if (turnsWatch.bootstrapTimer) clearInterval(turnsWatch.bootstrapTimer);
    } catch {}
    turnsWatch.bootstrapTimer = 0;
    turnsWatch.bootstrapAttempts = 0;
  }

  function ensureTurnsBootstrap() {
    if (turnsWatch.bootstrapTimer) return;
    // Keep this small and self-limiting: on non-conversation pages, ChatGPT may never mount turns.
    const MAX_ATTEMPTS = 40; // ~24s
    const STEP_MS = 600;
    turnsWatch.bootstrapAttempts = 0;
    turnsWatch.bootstrapTimer = setInterval(() => {
      try {
        if (!turnsWatch.listeners.size) return stopTurnsBootstrap();
        if (document.hidden) return;
        turnsWatch.bootstrapAttempts += 1;
        if (turnsWatch.bootstrapAttempts > MAX_ATTEMPTS) return stopTurnsBootstrap();
        const root = getTurnsRoot();
        if (!root || root === document) return;
        stopTurnsBootstrap();
        ensureTurnsObserver(true);
      } catch {
        stopTurnsBootstrap();
      }
    }, STEP_MS);
  }

  function detachTurnsObserver() {
    try {
      turnsWatch.mo?.disconnect?.();
    } catch {}
    turnsWatch.mo = null;
    turnsWatch.root = null;
    turnsWatch.scheduled = false;
    try {
      turnsWatch.pendingAddedTurns.clear();
    } catch {}
    try {
      if (turnsWatch.timer) clearTimeout(turnsWatch.timer);
    } catch {}
    turnsWatch.timer = 0;
  }

  function clearVisibleTurnWindowCache() {
    try {
      visibleTurnsWatch.ts = 0;
      visibleTurnsWatch.turnsVersion = 0;
      visibleTurnsWatch.scroller = null;
      visibleTurnsWatch.marginPx = 0;
      visibleTurnsWatch.result = null;
    } catch {}
    try {
      chatScrollWatch.scroller = null;
      chatScrollWatch.at = 0;
    } catch {}
  }

  function releaseTurnNodeCaches(reason = '') {
    const before = {
      turns: Array.isArray(turnsWatch.cachedTurns) ? turnsWatch.cachedTurns.length : 0,
      records: 0
    };
    try {
      const cached = turnRecordsWatch?.cachedSnapshot;
      before.records = Array.isArray(cached?.records) ? cached.records.length : 0;
    } catch {}
    try {
      turnsWatch.cachedRoot = null;
      turnsWatch.cachedTurns = [];
      turnsWatch.pendingAddedTurns.clear();
      turnsWatch.version += 1;
    } catch {}
    clearVisibleTurnWindowCache();
    try {
      turnRecordsWatch.cachedSnapshot = null;
      turnRecordsWatch.metaByTurn = new WeakMap();
      turnRecordsWatch.recordsVersion += 1;
      publishTurnRecordDebugAttrs({ records: [], recordsVersion: turnRecordsWatch.recordsVersion });
    } catch {}
    return { reason: String(reason || ''), before };
  }

  function ensureTurnsRouteListener() {
    if (turnsWatch.routeUnsub) return;
    // Prefer the shared bridge; avoid patching history.
    try {
      const bridge = globalThis.__aichat_quicknav_bridge_v1__ || null;
      if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
        safeCall(bridge.ensureRouteListener);
        turnsWatch.routeUnsub = bridge.on('routeChange', () => {
          try {
            if (!turnsWatch.listeners.size) return;
            releaseTurnNodeCaches('route');
            detachTurnsObserver();
            stopTurnsBootstrap();
            ensureTurnsObserver(true);
          } catch {}
        });
        return;
      }
    } catch {}
  }

  function ensureTurnsObserver(emitInitial = false) {
    if (turnsWatch.mo) {
      try {
        if (turnsWatch.root && turnsWatch.root.isConnected) return;
      } catch {}
      detachTurnsObserver();
    }
    // Only observe within the stable turns root to avoid noisy global observers.
    const root = getTurnsRoot();
    if (!root || root === document) {
      ensureTurnsBootstrap();
      return;
    }
    turnsWatch.root = root;

    try {
      const mo = new MutationObserver((muts) => {
        const added = turnsWatch.pendingAddedTurns;
        try {
          let changed = false;
          for (const m of muts || []) {
            if (!m || m.type !== 'childList') continue;
            for (const n of Array.from(m.addedNodes || [])) {
              if (!n || n.nodeType !== 1) continue;
              collectAddedTurnsFromNode(n, added);
              if (isTurnishNode(n)) changed = true;
            }
            for (const n of Array.from(m.removedNodes || [])) {
              if (isTurnishNode(n)) {
                changed = true;
                break;
              }
            }
          }
          if (!changed) return;
        } catch {
          // If unsure, err on the side of emitting (but still debounce).
        }

        if (turnsWatch.scheduled) return;
        turnsWatch.scheduled = true;
        try {
          if (turnsWatch.timer) clearTimeout(turnsWatch.timer);
        } catch {}
        turnsWatch.timer = setTimeout(() => {
          turnsWatch.scheduled = false;
          turnsWatch.timer = 0;
          const r = turnsWatch.root && turnsWatch.root.isConnected ? turnsWatch.root : getTurnsRoot();
          const addedTurns = Array.from(turnsWatch.pendingAddedTurns);
          turnsWatch.pendingAddedTurns.clear();
          const snapshot = refreshTurnsSnapshot(r, { addedHint: addedTurns });
          emitTurnsChange({
            at: now(),
            reason: 'mutation',
            turnCount: snapshot.turns.length,
            root: snapshot.root,
            turns: snapshot.turns,
            turnsVersion: snapshot.turnsVersion,
            rootChanged: snapshot.rootChanged,
            addedTurns: snapshot.addedTurns,
            removedTurns: snapshot.removedTurns
          });
        }, 60);
      });
      mo.observe(root, { childList: true, subtree: shouldObserveTurnsSubtree(root) });
      turnsWatch.mo = mo;
      if (emitInitial) {
        const snapshot = refreshTurnsSnapshot(root, { force: true });
        emitTurnsChange({
          at: now(),
          reason: 'attach',
          turnCount: snapshot.turns.length,
          root: snapshot.root,
          turns: snapshot.turns,
          turnsVersion: snapshot.turnsVersion,
          rootChanged: snapshot.rootChanged,
          addedTurns: snapshot.addedTurns,
          removedTurns: snapshot.removedTurns
        });
      }
    } catch {
      turnsWatch.mo = null;
    }
  }

  function onTurnsChange(cb) {
    if (typeof cb !== 'function') return () => void 0;
    turnsWatch.listeners.add(cb);
    ensureTurnsObserver(true);
    ensureTurnsRouteListener();
    return () => {
      try {
        turnsWatch.listeners.delete(cb);
        if (!turnsWatch.listeners.size) {
          detachTurnsObserver();
          stopTurnsBootstrap();
          releaseTurnNodeCaches('idle');
          try {
            if (typeof turnsWatch.routeUnsub === 'function') turnsWatch.routeUnsub();
          } catch {}
          turnsWatch.routeUnsub = null;
        }
      } catch {}
    };
  }

  function getTurnRole(turnEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getTurnRole === 'function') return adapter.getTurnRole(turnEl);
    try {
      const v = String(turnEl?.getAttribute?.('data-turn') || '').trim();
      if (v) return v;
    } catch {}
    try {
      const v = String(turnEl?.getAttribute?.('data-message-author-role') || '').trim();
      if (v) return v;
    } catch {}
    try {
      const el = turnEl?.querySelector?.('[data-message-author-role]');
      const v = String(el?.getAttribute?.('data-message-author-role') || '').trim();
      if (v) return v;
    } catch {}
    return '';
  }

  function getTurnId(turnEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getTurnId === 'function') return adapter.getTurnId(turnEl);
    try {
      const v = String(turnEl?.getAttribute?.('data-turn-id') || '').trim();
      if (v) return v;
    } catch {}
    return '';
  }

  function getMessageId(turnEl) {
    const adapter = getDomAdapter();
    if (adapter && typeof adapter.getMessageId === 'function') return adapter.getMessageId(turnEl);
    try {
      const v = String(turnEl?.getAttribute?.('data-message-id') || '').trim();
      if (v) return v;
    } catch {}
    try {
      const el = turnEl?.querySelector?.('[data-message-id]');
      const v = String(el?.getAttribute?.('data-message-id') || '').trim();
      if (v) return v;
    } catch {}
    return '';
  }

  function getStableTurnId(turnEl) {
    return getMessageId(turnEl) || getTurnId(turnEl);
  }

  function getTurnKey(turnEl) {
    try {
      if (!turnEl) return '';
      return (
        String(turnEl.getAttribute?.('data-message-id') || '').trim() ||
        String(turnEl.getAttribute?.('data-testid') || '').trim() ||
        String(turnEl.id || '').trim()
      );
    } catch {
      return '';
    }
  }

  function inferTurnRole(turnEl) {
    const direct = getTurnRole(turnEl);
    if (direct) return direct;
    let testId = '';
    try {
      testId = String(turnEl?.getAttribute?.('data-testid') || '').trim();
    } catch {
      testId = '';
    }
    try {
      if (
        turnEl?.querySelector?.('[data-message-author-role="user"]') ||
        turnEl?.querySelector?.('.text-message[data-author="user"]') ||
        /\buser\b/i.test(testId)
      ) {
        return 'user';
      }
    } catch {}
    try {
      if (
        turnEl?.querySelector?.('[data-message-author-role="assistant"]') ||
        turnEl?.querySelector?.('.text-message[data-author="assistant"]') ||
        /\bassistant\b/i.test(testId)
      ) {
        return 'assistant';
      }
    } catch {}
    return '';
  }

  function findTurnBodyEl(turnEl, role = '') {
    if (!(turnEl instanceof Element)) return null;
    const normalizedRole = String(role || '').trim();
    const selector = normalizedRole === 'user' ? USER_TURN_BODY_SELECTOR : ASSISTANT_TURN_BODY_SELECTOR;
    try {
      const body = turnEl.querySelector(selector);
      if (body instanceof HTMLElement) return body;
    } catch {}
    if (normalizedRole !== 'user') {
      try {
        const fallback = turnEl.querySelector(USER_TURN_BODY_SELECTOR);
        if (fallback instanceof HTMLElement) return fallback;
      } catch {}
    }
    return turnEl instanceof HTMLElement ? turnEl : null;
  }

  function collectTurnPreviewText(root, { hardCap = 320, nodeCap = 180, skipHeavy = false } = {}) {
    if (!(root instanceof Element)) return '';
    try {
      const parkedPreview = String(root.getAttribute?.('data-cgptperf-preview') || '').replace(/\s+/g, ' ').trim();
      if (parkedPreview) return parkedPreview.length > hardCap ? parkedPreview.slice(0, hardCap) : parkedPreview;
    } catch {}
    let out = '';
    let lastWasSpace = false;
    let scanned = 0;

    let walker = null;
    try {
      walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            try {
              if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
              if (skipHeavy) {
                const parent = node.parentElement;
                if (parent && parent.closest?.(TURN_PREVIEW_SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            } catch {
              return NodeFilter.FILTER_REJECT;
            }
          }
        }
      );
    } catch {
      walker = null;
    }

    if (walker) {
      while (walker.nextNode()) {
        scanned += 1;
        if (scanned > nodeCap) break;
        const text = String(walker.currentNode?.nodeValue || '');
        if (!text) continue;
        for (let i = 0; i < text.length && out.length < hardCap; i += 1) {
          const ch = text[i];
          const isSpace = ch <= ' ' || /\s/.test(ch);
          if (isSpace) {
            if (!lastWasSpace && out.length) {
              out += ' ';
              lastWasSpace = true;
            }
            continue;
          }
          out += ch;
          lastWasSpace = false;
        }
        if (out.length >= hardCap) break;
      }
      return out.trim();
    }

    try {
      const text = String(root.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      return text.length > hardCap ? text.slice(0, hardCap) : text;
    } catch {
      return '';
    }
  }

  function formatTurnStructureSummary({ codeBlocks = 0, mathBlocks = 0, tables = 0 } = {}) {
    const parts = [];
    if (codeBlocks > 0) parts.push(uiText(`代码 ${codeBlocks}`, `code ${codeBlocks}`));
    if (mathBlocks > 0) parts.push(uiText(`公式 ${mathBlocks}`, `math ${mathBlocks}`));
    if (tables > 0) parts.push(uiText(`表格 ${tables}`, `table ${tables}`));
    return parts.join(' · ');
  }

  function getTurnPreview(turnEl, bodyEl, role = '') {
    const root = bodyEl instanceof Element ? bodyEl : turnEl instanceof Element ? turnEl : null;
    if (!(root instanceof Element)) return '...';

    let codeBlocks = 0;
    let mathBlocks = 0;
    let tables = 0;
    try {
      codeBlocks = root.querySelectorAll('pre').length;
    } catch {}
    try {
      mathBlocks = root.querySelectorAll('.katex-display, mjx-container').length;
    } catch {}
    try {
      tables = root.querySelectorAll('table').length;
    } catch {}

    const heavySummary = formatTurnStructureSummary({ codeBlocks, mathBlocks, tables });
    const preferStructured = String(role || '') === 'assistant' && (codeBlocks > 0 || mathBlocks > 0 || tables > 0);
    const text = collectTurnPreviewText(root, {
      hardCap: preferStructured ? 180 : 320,
      nodeCap: preferStructured ? 120 : 180,
      skipHeavy: preferStructured
    });
    if (text && heavySummary) return `${text} · ${heavySummary}`;
    if (text) return text;
    if (heavySummary) return heavySummary;
    return '...';
  }

  function isPlaceholderPreview(preview) {
    const value = String(preview || '').trim();
    return !value || value === '...' || value === '…';
  }

  function getTurnAppendMarker(turnEl) {
    try {
      const msgId = getMessageId(turnEl);
      if (msgId) return `msg:${msgId}`;
    } catch {}
    try {
      const key = getTurnKey(turnEl);
      if (key) return `key:${key}`;
    } catch {}
    try {
      const domId = String(turnEl?.id || '').trim();
      if (domId) return `id:${domId}`;
    } catch {}
    return '';
  }

  const turnRecordsWatch = (() => ({
    listeners: new Set(),
    turnsUnsub: null,
    recordsVersion: 0,
    cachedSnapshot: null,
    metaByTurn: new WeakMap()
  }))();

  function buildTurnRecord(turnEl, index, turnsVersion, { forcePreview = false } = {}) {
    if (!(turnEl instanceof HTMLElement)) return null;
    const role = inferTurnRole(turnEl);
    const msgId = getMessageId(turnEl);
    const turnId = getTurnId(turnEl);
    const stableTurnId = msgId || turnId || getTurnKey(turnEl);
    const key = getTurnKey(turnEl) || stableTurnId;
    const bodyEl = findTurnBodyEl(turnEl, role);
    const appendMarker = getTurnAppendMarker(turnEl);
    const cached = (() => {
      try {
        return turnRecordsWatch.metaByTurn.get(turnEl) || null;
      } catch {
        return null;
      }
    })();
    let preview =
      cached &&
      !forcePreview &&
      cached.msgId === msgId &&
      cached.role === role &&
      cached.key === key &&
      cached.appendMarker === appendMarker &&
      !isPlaceholderPreview(cached.preview)
        ? String(cached.preview || '')
        : '';
    if (!preview) preview = getTurnPreview(turnEl, bodyEl, role);
    const record = {
      index,
      key,
      role,
      msgId,
      turnId,
      stableTurnId,
      appendMarker,
      preview: preview || '...',
      turnVersion: Number(turnsVersion) || 0,
      turnEl
    };
    try {
      turnRecordsWatch.metaByTurn.set(turnEl, {
        key,
        role,
        msgId,
        appendMarker,
        preview: isPlaceholderPreview(record.preview) ? '' : record.preview
      });
    } catch {}
    return record;
  }

  function areTurnRecordsEqual(prev, next) {
    if (prev === next) return true;
    if (!prev || !next) return false;
    return (
      prev.turnEl === next.turnEl &&
      prev.key === next.key &&
      prev.role === next.role &&
      prev.msgId === next.msgId &&
      prev.turnId === next.turnId &&
      prev.stableTurnId === next.stableTurnId &&
      prev.appendMarker === next.appendMarker &&
      prev.preview === next.preview
    );
  }

  function publishTurnRecordDebugAttrs(snapshot) {
    const html = document.documentElement;
    if (!html) return;
    const records = Array.isArray(snapshot?.records) ? snapshot.records : [];
    let liveBodyRefs = 0;
    for (const record of records) {
      if (record?.bodyEl instanceof HTMLElement) liveBodyRefs += 1;
    }
    try {
      html.setAttribute(TURN_RECORD_COUNT_ATTR, String(records.length));
      html.setAttribute(TURN_RECORD_BODYREFS_ATTR, String(liveBodyRefs));
      html.setAttribute(TURN_RECORD_VERSION_ATTR, String(Number(snapshot?.recordsVersion || 0)));
    } catch {}
  }

  function refreshTurnRecordsSnapshot(sourceSnapshot = null, { force = false } = {}) {
    const baseSnapshot =
      sourceSnapshot && typeof sourceSnapshot === 'object'
        ? sourceSnapshot
        : getTurnsSnapshot(force);
    const turns = Array.isArray(baseSnapshot?.turns) ? baseSnapshot.turns.filter((item) => item instanceof HTMLElement) : [];
    const records = [];
    for (let i = 0; i < turns.length; i += 1) {
      const record = buildTurnRecord(turns[i], i, baseSnapshot?.turnsVersion, {
        forcePreview: !!force || i >= Math.max(0, turns.length - 2)
      });
      if (record) records.push(record);
    }

    const prev = turnRecordsWatch.cachedSnapshot;
    let changed =
      force ||
      !prev ||
      prev.root !== (baseSnapshot?.root || null) ||
      Number(prev.turnsVersion || 0) !== Number(baseSnapshot?.turnsVersion || 0) ||
      prev.records.length !== records.length;
    if (!changed && prev) {
      for (let i = 0; i < records.length; i += 1) {
        if (!areTurnRecordsEqual(prev.records[i], records[i])) {
          changed = true;
          break;
        }
      }
    }
    if (changed) turnRecordsWatch.recordsVersion += 1;

    const snapshot = {
      root: baseSnapshot?.root || null,
      turns,
      turnsVersion: Number(baseSnapshot?.turnsVersion || 0),
      rootChanged: !!baseSnapshot?.rootChanged,
      addedTurns: Array.isArray(baseSnapshot?.addedTurns) ? baseSnapshot.addedTurns.filter((item) => item instanceof HTMLElement) : [],
      removedTurns: Array.isArray(baseSnapshot?.removedTurns) ? baseSnapshot.removedTurns.filter((item) => item instanceof HTMLElement) : [],
      records,
      recordsVersion: turnRecordsWatch.recordsVersion
    };
    turnRecordsWatch.cachedSnapshot = snapshot;
    publishTurnRecordDebugAttrs(snapshot);
    return snapshot;
  }

  function getTurnRecordsSnapshot(force = false) {
    if (!force && turnRecordsWatch.cachedSnapshot) {
      try {
        const cached = turnRecordsWatch.cachedSnapshot;
        const cachedRecords = Array.isArray(cached?.records) ? cached.records : [];
        const cachedTurns = Array.isArray(cached?.turns) ? cached.turns : [];
        const hasPlaceholder = cachedRecords.some((record) => isPlaceholderPreview(record?.preview));
        if (hasPlaceholder) return refreshTurnRecordsSnapshot(null, { force: true });
        if (cachedRecords.length || cachedTurns.length) return cached;
        const liveTurns = getTurnsSnapshot(false);
        if (!Array.isArray(liveTurns?.turns) || liveTurns.turns.length === 0) return cached;
      } catch {
        return turnRecordsWatch.cachedSnapshot;
      }
    }
    return refreshTurnRecordsSnapshot(null, { force });
  }

  function emitTurnRecordsChange(payload) {
    const list = Array.from(turnRecordsWatch.listeners);
    if (!list.length) return;
    for (const fn of list) safeCall(fn, payload);
  }

  function ensureTurnRecordsWatcher() {
    if (typeof turnRecordsWatch.turnsUnsub === 'function') return;
    turnRecordsWatch.turnsUnsub = onTurnsChange((payload) => {
      const snapshot = refreshTurnRecordsSnapshot(payload, { force: String(payload?.reason || '') === 'attach' });
      emitTurnRecordsChange({
        at: now(),
        reason: String(payload?.reason || 'turn-records'),
        root: snapshot.root,
        turns: snapshot.turns,
        turnCount: snapshot.turns.length,
        turnsVersion: snapshot.turnsVersion,
        rootChanged: snapshot.rootChanged,
        addedTurns: snapshot.addedTurns,
        removedTurns: snapshot.removedTurns,
        records: snapshot.records,
        recordsVersion: snapshot.recordsVersion
      });
    });
  }

  function onTurnRecordsChange(cb) {
    if (typeof cb !== 'function') return () => void 0;
    turnRecordsWatch.listeners.add(cb);
    ensureTurnRecordsWatcher();
    return () => {
      try {
        turnRecordsWatch.listeners.delete(cb);
        if (!turnRecordsWatch.listeners.size && typeof turnRecordsWatch.turnsUnsub === 'function') {
          turnRecordsWatch.turnsUnsub();
          turnRecordsWatch.turnsUnsub = null;
        }
      } catch {}
    };
  }

  // === Route change subscription (ISOLATED) ===
  function onRouteChange(cb) {
    if (typeof cb !== 'function') return () => void 0;
    const bridge = (() => {
      try {
        return globalThis.__aichat_quicknav_bridge_v1__ || null;
      } catch {
        return null;
      }
    })();
    if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
      safeCall(bridge.ensureRouteListener);
      return bridge.on('routeChange', cb);
    }

    // Fallback: slow polling.
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
        cb({ href, reason: 'poll', at: now() });
      } catch {}
    }, 1200);
    return () => {
      try {
        clearInterval(timer);
      } catch {}
    };
  }

  // Shared perf runtime bridge. This lets sibling ChatGPT modules consume perf
  // state through chatgpt-core instead of reading perf-specific DOM attributes.
  const perfRuntime = (() => {
    const state = {
      snapshot: Object.freeze({
        enabled: false,
        windowingEnabled: false,
        heavyEnabled: false,
        hotPathActive: false,
        virtualizationActive: false,
        budgetLevel: 0
      }),
      isTurnOffscreen: null,
      listeners: new Set()
    };

    function snapshotEqual(a, b) {
      if (a === b) return true;
      if (!a || !b) return false;
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        if (!Object.is(a[key], b[key])) return false;
      }
      return true;
    }

    function sanitizeSnapshot(next) {
      const src = next && typeof next === 'object' ? next : {};
      return Object.freeze({
        enabled: !!src.enabled,
        windowingEnabled: !!src.windowingEnabled,
        heavyEnabled: !!src.heavyEnabled,
        hotPathActive: !!src.hotPathActive,
        virtualizationActive: !!src.virtualizationActive,
        budgetLevel: Math.max(0, Number(src.budgetLevel) || 0)
      });
    }

    function emit(snapshot) {
      const list = Array.from(state.listeners);
      for (const cb of list) safeCall(cb, snapshot);
    }

    return {
      update(next = {}) {
        const snapshot = sanitizeSnapshot(next);
        const resolver = typeof next?.isTurnOffscreen === 'function' ? next.isTurnOffscreen : null;
        const changed = !snapshotEqual(state.snapshot, snapshot) || state.isTurnOffscreen !== resolver;
        state.snapshot = snapshot;
        state.isTurnOffscreen = resolver;
        if (changed) emit(snapshot);
        return snapshot;
      },
      clear() {
        return this.update({});
      },
      getSnapshot() {
        return state.snapshot;
      },
      onChange(cb) {
        if (typeof cb !== 'function') return () => void 0;
        state.listeners.add(cb);
        return () => {
          try {
            state.listeners.delete(cb);
          } catch {}
        };
      },
      isOffscreen(turnEl) {
        try {
          if (typeof state.isTurnOffscreen === 'function') return !!state.isTurnOffscreen(turnEl);
        } catch {}
        return false;
      }
    };
  })();

  // === Memory guard (ChatGPT stability) ===
  // NOTE: This is a best-effort early warning based on JS heap usage. It cannot see total renderer RSS.
  // It is intentionally conservative to avoid noisy alerts in normal use.
  const memGuard = (() => {
    try {
      // Top-frame only.
      if (window.self !== window.top) return null;
    } catch {
      return null;
    }

    const MAX_SAMPLES = 24; // ~12 minutes @ 30s interval
    const SAMPLE_MS = 30 * 1000;
    // WARNING: avoid being too aggressive. This guard is a last resort for 8GB-memory machines.
    // Prefer detecting "runaway growth" over stable high usage.
    const WARN_RATIO = 0.45;
    const CRIT_RATIO = 0.6;
    const WARN_USED_MB = 800;
    const CRIT_USED_MB = 1100;
    const RAPID_GROWTH_WINDOW_MS = 2 * 60 * 1000;
    const RAPID_GROWTH_MB = 300;
    const RAPID_GROWTH_MIN_USED_MB = 500;
    const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;
    const CLEANUP_COOLDOWN_MS = 3 * 60 * 1000;

    const RAPID_DOM_GROWTH_WINDOW_MS = RAPID_GROWTH_WINDOW_MS;
    const RAPID_DOM_GROWTH_NODES = 12000;
    const RAPID_DOM_GROWTH_MIN_DOM_NODES = 20000;
    const RAPID_DOM_GROWTH_MAX_TURN_DELTA = 30;

    const state = {
      timer: 0,
      samples:
        /** @type {Array<{at:number, used:number, total:number, limit:number, ratio:number, dom:number, turns:number, iframes:number, splitLoaded:boolean}>} */ (
          []
        ),
      lastNotifyAt: 0,
      lastCleanupAt: 0,
      lastLevel: 'ok'
    };

    function readSample() {
      try {
        const pm = performance?.memory;
        if (!pm) return null;
        const used = Number(pm.usedJSHeapSize) || 0;
        const total = Number(pm.totalJSHeapSize) || 0;
        const limit = Number(pm.jsHeapSizeLimit) || 0;
        if (!used || !limit) return null;
        const ratio = used / limit;
        const at = now();

        // Extra heuristics: while we cannot access total RSS, we can still detect pathological DOM growth.
        // Keep this cheap: only sample counts (no deep traversal / no text reads).
        let dom = 0;
        let turns = 0;
        let iframes = 0;
        let splitLoaded = false;
        try {
          dom = document.getElementsByTagName('*').length;
        } catch {}
        try {
          turns = document.querySelectorAll(TURN_HOST_SELECTOR).length;
        } catch {}
        try {
          iframes = document.getElementsByTagName('iframe').length;
        } catch {}
        splitLoaded = false;

        // Expose last sample in DOM for quick debugging (DevTools / other worlds).
        try {
          const ds = document.documentElement?.dataset;
          if (ds) {
            ds.quicknavMemHeapMb = String(Math.round(used / 1024 / 1024));
            ds.quicknavMemDomNodes = String(dom || 0);
            ds.quicknavMemTurns = String(turns || 0);
            ds.quicknavMemIframes = String(iframes || 0);
            ds.quicknavMemSplitLoaded = splitLoaded ? '1' : '0';
            ds.quicknavMemAt = String(at);
          }
        } catch {}

        return { at, used, total, limit, ratio, dom, turns, iframes, splitLoaded };
      } catch {
        return null;
      }
    }

    function formatMb(bytes) {
      const n = Number(bytes) || 0;
      if (!Number.isFinite(n) || n <= 0) return '0MB';
      return `${Math.round(n / 1024 / 1024)}MB`;
    }

    function computeGrowthMb(sample) {
      try {
        const windowStart = Number(sample?.at || 0) - RAPID_GROWTH_WINDOW_MS;
        if (!Number.isFinite(windowStart) || windowStart <= 0) return 0;
        let baseline = null;
        for (let i = state.samples.length - 1; i >= 0; i--) {
          const s = state.samples[i];
          if (!s) continue;
          if (Number(s.at || 0) <= windowStart) {
            baseline = s;
            break;
          }
          baseline = s;
        }
        if (!baseline) return 0;
        const diff = Number(sample.used || 0) - Number(baseline.used || 0);
        if (!Number.isFinite(diff) || diff <= 0) return 0;
        return diff / 1024 / 1024;
      } catch {
        return 0;
      }
    }

    function computeDomGrowth(sample) {
      try {
        const windowStart = Number(sample?.at || 0) - RAPID_DOM_GROWTH_WINDOW_MS;
        if (!Number.isFinite(windowStart) || windowStart <= 0) return 0;
        let baseline = null;
        for (let i = state.samples.length - 1; i >= 0; i--) {
          const s = state.samples[i];
          if (!s) continue;
          if (Number(s.at || 0) <= windowStart) {
            baseline = s;
            break;
          }
          baseline = s;
        }
        if (!baseline) return 0;
        const domDiff = Number(sample.dom || 0) - Number(baseline.dom || 0);
        if (!Number.isFinite(domDiff) || domDiff <= 0) return 0;
        const turnDelta = Math.abs(Number(sample.turns || 0) - Number(baseline.turns || 0));
        return { domDiff, turnDelta };
      } catch {
        return 0;
      }
    }

    function notify(title, message) {
      const ts = now();
      if (ts - state.lastNotifyAt < NOTIFY_COOLDOWN_MS) return;
      state.lastNotifyAt = ts;
      try {
        if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
        chrome.runtime.sendMessage(
          { type: 'AISHORTCUTS_NOTIFY', id: 'quicknav_chatgpt_mem_guard', title, message },
          () => void chrome.runtime.lastError
        );
      } catch {}
    }

    function emergencyCleanup(level, sample) {
      const ts = now();
      if (ts - state.lastCleanupAt < CLEANUP_COOLDOWN_MS) return;
      state.lastCleanupAt = ts;

      try {
        releaseTurnNodeCaches(`mem:${level}`);
      } catch {}

      try {
        // Keep cleanup lightweight; split view has been removed.
      } catch {}

      try {
        // Message Tree runs in MAIN world; close it via the existing QuickNav bridge message.
        postBridgeMessage('AISHORTCUTS_CHATGPT_TREE_CLOSE');
      } catch {}

      try {
        // QuickNav: best-effort de-dupe panel if reinject happened.
        window.chatGptNavDebug?.checkOverlap?.();
      } catch {}

      try {
        // QuickNav: drop ephemeral caches to reduce JS heap pressure.
        window.chatGptNavDebug?.softCleanup?.(`mem:${level}`);
      } catch {}

      try {
        notify(
          uiText('ChatGPT 内存保护：已执行清理', 'ChatGPT memory guard: cleanup completed'),
          `level=${level} used=${formatMb(sample.used)} (${Math.round(sample.ratio * 100)}%) dom=${Number(sample.dom || 0)} ifr=${Number(sample.iframes || 0)} split=${sample.splitLoaded ? '1' : '0'}`
        );
      } catch {}
    }

    function tick() {
      const sample = readSample();
      if (!sample) return;
      state.samples.push(sample);
      if (state.samples.length > MAX_SAMPLES) state.samples.splice(0, state.samples.length - MAX_SAMPLES);

      const ratio = sample.ratio;
      const usedMb = Number(sample.used || 0) / 1024 / 1024;
      const growthMb = computeGrowthMb(sample);
      const domGrowth = computeDomGrowth(sample);
      const domGrowthNodes = domGrowth && typeof domGrowth === 'object' ? Number(domGrowth.domDiff || 0) : 0;
      const domTurnDelta = domGrowth && typeof domGrowth === 'object' ? Number(domGrowth.turnDelta || 0) : 0;
      const isRapidGrowth =
        Number.isFinite(growthMb) &&
        growthMb >= RAPID_GROWTH_MB &&
        Number.isFinite(usedMb) &&
        usedMb >= RAPID_GROWTH_MIN_USED_MB;

      const isRapidDomGrowth =
        Number.isFinite(domGrowthNodes) &&
        domGrowthNodes >= RAPID_DOM_GROWTH_NODES &&
        Number(sample.dom || 0) >= RAPID_DOM_GROWTH_MIN_DOM_NODES &&
        domTurnDelta <= RAPID_DOM_GROWTH_MAX_TURN_DELTA;

      const thresholdLevel =
        (Number.isFinite(usedMb) && usedMb >= CRIT_USED_MB) || ratio >= CRIT_RATIO
          ? 'critical'
          : (Number.isFinite(usedMb) && usedMb >= WARN_USED_MB) || ratio >= WARN_RATIO
            ? 'warning'
            : 'ok';

      const level = isRapidGrowth || isRapidDomGrowth ? 'critical' : thresholdLevel;
      const levelChanged = level !== state.lastLevel;
      state.lastLevel = level;

      if (level === 'critical') {
        notify(
          uiText('ChatGPT 内存预警（严重）', 'ChatGPT memory warning (critical)'),
          `JS heap=${formatMb(sample.used)} / ${formatMb(sample.limit)}${isRapidGrowth ? uiText(`（2min +${Math.round(growthMb)}MB）`, ` (2 min +${Math.round(growthMb)} MB)`) : ''}${isRapidDomGrowth ? uiText(`（DOM 2min +${Math.round(domGrowthNodes)}）`, ` (DOM 2 min +${Math.round(domGrowthNodes)})`) : ''}`
        );
        emergencyCleanup(level, sample);
        return;
      }

      if (level === 'warning' && levelChanged) {
        notify(
          uiText('ChatGPT 内存预警', 'ChatGPT memory warning'),
          `JS heap=${formatMb(sample.used)} / ${formatMb(sample.limit)}`
        );
      }
    }

    try {
      if (!state.timer) {
        state.timer = setInterval(tick, SAMPLE_MS);
        // Quick first sample once the page settles a bit.
        setTimeout(tick, 6000);
      }
    } catch {}

		    return Object.freeze({
		      sample: () => readSample(),
		      history: () => state.samples.slice(),
		      tick,
	      cleanup: (reason) => {
	        const sample = readSample();
	        if (sample) emergencyCleanup(String(reason || 'manual'), sample);
	      }
		    });
		  })();

  function installMemoryReleaseHooks() {
    try {
      if (globalThis.__aichat_chatgpt_core_memory_hooks_v1__) return;
      Object.defineProperty(globalThis, '__aichat_chatgpt_core_memory_hooks_v1__', {
        value: true,
        configurable: true,
        enumerable: false,
        writable: true
      });
    } catch {}
    const releaseIfHidden = () => {
      try {
        if (document.hidden) releaseTurnNodeCaches('hidden');
      } catch {}
    };
    try {
      document.addEventListener('visibilitychange', releaseIfHidden, true);
    } catch {}
    try {
      window.addEventListener('pagehide', () => releaseTurnNodeCaches('pagehide'), true);
    } catch {}
  }

  installMemoryReleaseHooks();

	  const api = Object.freeze({
    version: API_VERSION,
    now,
    safeCall,
    getRoute,
    getDomAdapter,
    getConversationIdFromUrl,
    getEditorEl,
    getComposerForm,
    getModelSwitcherButton,
    getComposerModelButton,
    readCurrentModelLabel,
    readComposerModeLabel,
    findSendButton,
    findStopButton,
    isGenerating,
    clickSendButton,
    clickStopButton,
    getTurnsRoot,
    getTurnArticles,
    getTurnsSnapshot,
    getTurnRecordsSnapshot,
    getChatScrollContainer,
    getVisibleTurnWindow,
    getTurnSelector: () => TURN_SELECTOR,
    onTurnsChange,
    onTurnRecordsChange,
    getTurnRole,
    getTurnId,
    getMessageId,
    getStableTurnId,
    onRouteChange,
    getPerfSnapshot: () => perfRuntime.getSnapshot(),
    setPerfSnapshot: (next) => perfRuntime.update(next),
    clearPerfSnapshot: () => perfRuntime.clear(),
	    onPerfStateChange: (cb) => perfRuntime.onChange(cb),
	    isTurnOffscreen: (turnEl) => perfRuntime.isOffscreen(turnEl),
    releaseMemory: (reason) => releaseTurnNodeCaches(reason || 'api'),
	    memGuard
	  });

  try {
    Object.defineProperty(globalThis, API_KEY, { value: api, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }
})();
