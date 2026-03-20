// ChatGPT shared helpers (MAIN world)
(() => {
  'use strict';

  const API_KEY = '__aichat_chatgpt_core_main_v1__';
  const API_VERSION = 7;

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
    const prev = window[API_KEY];
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= API_VERSION) return;
  } catch {}

  function now() {
    return Date.now();
  }

  const TURN_HOST_SELECTOR = 'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]';
  const TURN_SELECTOR = `${TURN_HOST_SELECTOR}, [data-testid^="conversation-turn-"]`;
  const MODEL_SWITCHER_SELECTOR =
    'button[data-testid="model-switcher-dropdown-button"], button[aria-label*="Model selector" i], button[aria-label*="current model is" i]';
  const MODEL_META_LABEL_ATTR = 'data-qn-chatgpt-model-meta-label';
  const COMPOSER_MODE_TOKEN_RE =
    /\b(?:instant|thinking|pro|extended pro|standard pro|light thinking|heavy thinking)\b|思考|推理|专业|标准|扩展|即时/i;
  const DIRECT_TURN_HOST_SELECTOR = prefixSelectorList(':scope >', TURN_HOST_SELECTOR);
  const WRAPPED_TURN_HOST_SELECTOR = prefixSelectorList(':scope > *', TURN_HOST_SELECTOR);

  let editorCache = {
    at: 0,
    routeKey: '',
    el: null
  };
  let modelMetaButton = null;
  let modelMetaHeader = null;
  let modelMetaObserver = null;
  let modelMetaSyncTimers = new Set();
  let modelMetaBootstrapTimer = 0;
  let modelMetaBootstrapAttempts = 0;
  const MODEL_META_BOOTSTRAP_MAX_ATTEMPTS = 16;

  function prefixSelectorList(prefix, selectorList) {
    return String(selectorList || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => `${prefix} ${part}`)
      .join(', ');
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
        if (r.bottom <= 0 || r.top >= (window.innerHeight || document.documentElement?.clientHeight || 0)) continue;
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

  function isVisibleElement(el) {
    try {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      if (r.bottom <= 0 || r.top >= (window.innerHeight || document.documentElement?.clientHeight || 0)) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      return true;
    } catch {
      return false;
    }
  }

  function getConversationIdFromUrl(url) {
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
    const route = getRoute();
    const routeKey = `${route.pathname}::${route.conversationId || ''}`;
    try {
      if (
        editorCache.el &&
        editorCache.el.isConnected &&
        editorCache.routeKey === routeKey &&
        (now() - editorCache.at) < 250
      ) {
        return editorCache.el;
      }
    } catch {}

    let found = null;
    try {
      const list = Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]'));
      const pm = pickBottomMostVisible(list);
      if (pm) found = pm;
    } catch {}
    if (!found) {
      try {
        const list = Array.from(document.querySelectorAll('#prompt-textarea[contenteditable="true"]'));
        const el = pickBottomMostVisible(list);
        if (el) found = el;
      } catch {}
    }
    if (!found) {
      try {
        const el = document.querySelector('#prompt-textarea');
        if (el) found = el;
      } catch {}
    }
    if (!found) {
      try {
        const el = document.querySelector('textarea[name="prompt-textarea"]');
        if (el) found = el;
      } catch {}
    }
    editorCache = {
      at: now(),
      routeKey,
      el: found || null
    };
    return found || null;
  }

  function getComposerForm(editorEl) {
    try {
      const el = editorEl || getEditorEl();
      return el?.closest?.('form') || null;
    } catch {
      return null;
    }
  }

  function getModelSwitcherButton() {
    try {
      const visible = pickBottomMostVisible(Array.from(document.querySelectorAll(MODEL_SWITCHER_SELECTOR)).filter(isVisibleElement));
      if (visible) return visible;
    } catch {}
    try {
      return document.querySelector(MODEL_SWITCHER_SELECTOR);
    } catch {
      return null;
    }
  }

  function readCurrentModelLabel() {
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

  function readCurrentModelMetaLabel() {
    try {
      const button = getModelSwitcherButton();
      if (!(button instanceof HTMLElement)) return '';
      const keys = Object.keys(button);
      const propsKey = keys.find((key) => key.startsWith('__reactProps$'));
      const fiberKey = keys.find((key) => key.startsWith('__reactFiber$'));
      const props =
        (propsKey && button[propsKey]) ||
        (fiberKey && button[fiberKey] && button[fiberKey].memoizedProps) ||
        null;
      if (props && typeof props.label === 'string' && props.label.trim()) return props.label.trim();
      const children = Array.isArray(props?.children) ? props.children : [];
      for (const child of children) {
        const label = child?.props?.label;
        if (typeof label === 'string' && label.trim()) return label.trim();
      }
    } catch {}
    return '';
  }

  function clearCurrentModelMetaLabel(button = modelMetaButton) {
    try {
      button?.removeAttribute?.(MODEL_META_LABEL_ATTR);
    } catch {}
  }

  function resetCurrentModelMetaObserver() {
    try {
      modelMetaObserver?.disconnect?.();
    } catch {}
    modelMetaObserver = null;
    modelMetaHeader = null;
  }

  function stopCurrentModelMetaBootstrap() {
    try {
      if (modelMetaBootstrapTimer) clearInterval(modelMetaBootstrapTimer);
    } catch {}
    modelMetaBootstrapTimer = 0;
    modelMetaBootstrapAttempts = 0;
  }

  function ensureCurrentModelMetaBootstrap(force = false) {
    if (force) stopCurrentModelMetaBootstrap();
    if (modelMetaBootstrapTimer) return;
    modelMetaBootstrapAttempts = 0;
    modelMetaBootstrapTimer = window.setInterval(() => {
      try {
        modelMetaBootstrapAttempts += 1;
        syncCurrentModelMetaLabel();
        if (modelMetaBootstrapAttempts >= MODEL_META_BOOTSTRAP_MAX_ATTEMPTS) return stopCurrentModelMetaBootstrap();
      } catch {
        stopCurrentModelMetaBootstrap();
      }
    }, 500);
  }

  function syncCurrentModelMetaLabel() {
    try {
      const button = getModelSwitcherButton();
      if (modelMetaButton && modelMetaButton !== button) clearCurrentModelMetaLabel(modelMetaButton);
      modelMetaButton = button instanceof HTMLElement ? button : null;

      const label = readCurrentModelMetaLabel();
      if (modelMetaButton && label) {
        modelMetaButton.setAttribute(MODEL_META_LABEL_ATTR, label);
      } else {
        clearCurrentModelMetaLabel(modelMetaButton);
        ensureCurrentModelMetaBootstrap();
      }

      const nextHeader = modelMetaButton?.closest?.('header') || null;
      if (nextHeader === modelMetaHeader) return;
      resetCurrentModelMetaObserver();
      if (!(nextHeader instanceof HTMLElement)) return;
      modelMetaHeader = nextHeader;
      modelMetaObserver = new MutationObserver(() => {
        scheduleCurrentModelMetaSync(40);
      });
      modelMetaObserver.observe(nextHeader, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'data-state']
      });
    } catch {}
  }

  function scheduleCurrentModelMetaSync(delayMs = 0) {
    const id = window.setTimeout(() => {
      try {
        modelMetaSyncTimers.delete(id);
      } catch {}
      syncCurrentModelMetaLabel();
    }, Math.max(0, Number(delayMs) || 0));
    try {
      modelMetaSyncTimers.add(id);
    } catch {}
  }

  function readComposerModeLabel(editorEl) {
    try {
      const form = getComposerForm(editorEl);
      const buttons = Array.from(form?.querySelectorAll?.("button[aria-haspopup='menu'],button") || []);
      for (const button of buttons) {
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
    const form = getComposerForm(editorEl);
    try {
      if (form) {
        const inForm =
          form.querySelector('#composer-submit-button') ||
          form.querySelector('button[data-testid="send-button"]') ||
          form.querySelector('button[aria-label*="Send" i]') ||
          null;
        if (inForm) return inForm;
      }
    } catch {}
    try {
      return (
        document.querySelector('#composer-submit-button') ||
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[aria-label*="Send" i]') ||
        null
      );
    } catch {
      return null;
    }
  }

  function findStopButton(editorEl) {
    const form = getComposerForm(editorEl);
    try {
      if (form) {
        const inForm =
          form.querySelector('button[data-testid="stop-button"]') ||
          form.querySelector('button[aria-label*="Stop" i]') ||
          null;
        if (inForm) return inForm;
      }
    } catch {}
    try {
      return (
        document.querySelector('button[data-testid="stop-button"]') ||
        document.querySelector('button[aria-label*="Stop" i]') ||
        null
      );
    } catch {
      return null;
    }
  }

  function isGenerating(editorEl) {
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
    try {
      if (!(el instanceof Element)) return null;
      if (el.matches(TURN_HOST_SELECTOR)) return el;
      return el.closest?.(TURN_HOST_SELECTOR) || el.closest?.('[data-testid^="conversation-turn-"]') || null;
    } catch {
      return null;
    }
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
    try {
      const stable = document.querySelector('[data-testid="conversation-turns"]');
      if (stable) return stable;
    } catch {}
    // Newer ChatGPT builds may not expose a stable `conversation-turns` container.
    // Fall back to a narrow ancestor derived from the first turn host.
    try {
      const first = normalizeTurnElement(document.querySelector(TURN_SELECTOR));
      if (first) {
        // Prefer a list container whose *direct* children are turn hosts (cheap + ignores inner streaming mutations).
        let cur = first.parentElement;
        const MAX_DEPTH = 12;
        for (let i = 0; cur && cur !== document.body && cur !== document.documentElement && i < MAX_DEPTH; i++) {
          try {
            if (cur.querySelector?.(DIRECT_TURN_HOST_SELECTOR)) return cur;
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

  function getTurnArticles(root) {
    try {
      const cachedRoot = turnsWatch.cachedRoot;
      const cachedTurns = turnsWatch.cachedTurns;
      const useCached =
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
      // Prefer `subtree:false` so streaming text mutations don't flood the observer.
      const wrapped = root.querySelectorAll(WRAPPED_TURN_HOST_SELECTOR).length;
      if (wrapped && wrapped === deep) return false;
    } catch {}
    return true;
  }

  // === Turns change subscription (MAIN) ===
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
      healthTimer: 0,
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
    const turns = getTurnArticles(normalizedRoot);
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

  function stopTurnsHealthCheck() {
    try {
      if (turnsWatch.healthTimer) clearInterval(turnsWatch.healthTimer);
    } catch {}
    turnsWatch.healthTimer = 0;
  }

  function ensureTurnsHealthCheck() {
    if (turnsWatch.healthTimer) return;
    // Low-frequency health check to recover from React remounts that replace the turns root
    // without a route change (which would otherwise leave observers attached to a detached node).
    turnsWatch.healthTimer = setInterval(() => {
      try {
        if (!turnsWatch.listeners.size) return stopTurnsHealthCheck();
        if (document.hidden) return;

        const currentRoot = turnsWatch.root;
        if (!currentRoot || !currentRoot.isConnected) {
          detachTurnsObserver();
          stopTurnsBootstrap();
          ensureTurnsObserver(true);
          return;
        }

        const latest = getTurnsRoot();
        if (latest && latest !== document && latest !== currentRoot) {
          detachTurnsObserver();
          stopTurnsBootstrap();
          ensureTurnsObserver(true);
        }
      } catch {}
    }, 2500);
  }

  function ensureTurnsRouteListener() {
    if (turnsWatch.routeUnsub) return;
    try {
      const bridge = window.__aichat_quicknav_bridge_main_v1__ || null;
      if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
        safeCall(bridge.ensureRouteListener);
        turnsWatch.routeUnsub = bridge.on('routeChange', () => {
          try {
            if (!turnsWatch.listeners.size) return;
            detachTurnsObserver();
            stopTurnsBootstrap();
            ensureTurnsObserver(true);
          } catch {}
        });
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
    ensureTurnsHealthCheck();
    return () => {
      try {
        turnsWatch.listeners.delete(cb);
        if (!turnsWatch.listeners.size) {
          detachTurnsObserver();
          stopTurnsBootstrap();
          stopTurnsHealthCheck();
          try {
            if (typeof turnsWatch.routeUnsub === 'function') turnsWatch.routeUnsub();
          } catch {}
          turnsWatch.routeUnsub = null;
        }
      } catch {}
    };
  }

  function getTurnRole(turnEl) {
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
    try {
      const v = String(turnEl?.getAttribute?.('data-turn-id') || '').trim();
      if (v) return v;
    } catch {}
    return '';
  }

  function getMessageId(turnEl) {
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

  function onRouteChange(cb) {
    if (typeof cb !== 'function') return () => void 0;
    const bridge = (() => {
      try {
        return window.__aichat_quicknav_bridge_main_v1__ || null;
      } catch {
        return null;
      }
    })();
    if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
      safeCall(bridge.ensureRouteListener);
      return bridge.on('routeChange', cb);
    }

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

  function installCurrentModelMetaSync() {
    syncCurrentModelMetaLabel();
    ensureCurrentModelMetaBootstrap(true);
    scheduleCurrentModelMetaSync(0);
    scheduleCurrentModelMetaSync(250);
    scheduleCurrentModelMetaSync(1200);
    scheduleCurrentModelMetaSync(3200);
    safeCall(() =>
      onRouteChange(() => {
        ensureCurrentModelMetaBootstrap(true);
        scheduleCurrentModelMetaSync(0);
        scheduleCurrentModelMetaSync(250);
        scheduleCurrentModelMetaSync(1200);
      })
    );
    try {
      window.addEventListener('pageshow', () => {
        ensureCurrentModelMetaBootstrap(true);
        scheduleCurrentModelMetaSync(0);
      }, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          ensureCurrentModelMetaBootstrap(true);
          scheduleCurrentModelMetaSync(0);
        }
      });
    } catch {}
  }

  const api = Object.freeze({
    version: API_VERSION,
    now,
    safeCall,
    getRoute,
    getConversationIdFromUrl,
    getEditorEl,
    getComposerForm,
    getModelSwitcherButton,
    readCurrentModelLabel,
    readCurrentModelMetaLabel,
    readComposerModeLabel,
    findSendButton,
    findStopButton,
    isGenerating,
    clickSendButton,
    clickStopButton,
    getTurnsRoot,
    getTurnArticles,
    getTurnsSnapshot,
    getChatScrollContainer,
    getVisibleTurnWindow,
    getTurnSelector: () => TURN_SELECTOR,
    onTurnsChange,
    getTurnRole,
    getTurnId,
    getMessageId,
    onRouteChange
  });

  try {
    Object.defineProperty(window, API_KEY, { value: api, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[API_KEY] = api;
    } catch {}
  }

  installCurrentModelMetaSync();
})();
