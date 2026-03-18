// ChatGPT shared helpers (MAIN world)
(() => {
  'use strict';

  const API_KEY = '__aichat_chatgpt_core_main_v1__';
  const API_VERSION = 6;

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
  const COMPOSER_MODE_TOKEN_RE =
    /\b(?:instant|thinking|pro|extended pro|standard pro|light thinking|heavy thinking)\b|思考|推理|专业|标准|扩展|即时/i;
  const DIRECT_TURN_HOST_SELECTOR = prefixSelectorList(':scope >', TURN_HOST_SELECTOR);
  const WRAPPED_TURN_HOST_SELECTOR = prefixSelectorList(':scope > *', TURN_HOST_SELECTOR);

  let editorCache = {
    at: 0,
    routeKey: '',
    el: null
  };

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
      healthTimer: 0
    };
    return st;
  })();

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
          emitTurnsChange({ at: now(), reason: 'mutation', turnCount: getTurnArticles(r).length, addedTurns });
        }, 60);
      });
      mo.observe(root, { childList: true, subtree: shouldObserveTurnsSubtree(root) });
      turnsWatch.mo = mo;
      if (emitInitial) emitTurnsChange({ at: now(), reason: 'attach', turnCount: getTurnArticles(root).length });
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
    readComposerModeLabel,
    findSendButton,
    findStopButton,
    isGenerating,
    clickSendButton,
    clickStopButton,
    getTurnsRoot,
    getTurnArticles,
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
})();
