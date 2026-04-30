// ChatGPT DOM adapter shared by MAIN and ISOLATED content worlds.
(() => {
  'use strict';

  const API_KEY = '__aichat_chatgpt_dom_adapter_v1__';
  const API_VERSION = 1;

  const TURN_HOST_SELECTOR = 'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]';
  const TURN_SELECTOR = `${TURN_HOST_SELECTOR}, [data-testid^="conversation-turn-"]`;
  const MODEL_SWITCHER_SELECTOR =
    'button[data-testid="model-switcher-dropdown-button"], button[aria-label*="Model selector" i], button[aria-label*="current model is" i]';
  const COMPOSER_MODEL_TRIGGER_SELECTOR =
    'button.__composer-pill[aria-haspopup="menu"], button.__composer-pill, button[aria-haspopup="menu"]';
  const COMPOSER_MODE_TOKEN_RE =
    /\b(?:latest|instant|thinking|pro|light|heavy|standard|extended|extended pro|standard pro|light thinking|heavy thinking)\b|思考|推理|专业|标准|扩展|即时/i;
  const COMPOSER_MODEL_EXCLUDE_RE = /\b(?:add files?|attach|dictation|voice|microphone|send|submit)\b|添加|附件|语音|听写|发送|提交/i;

  const editorCache = {
    at: 0,
    routeKey: '',
    el: null
  };

  const turnsCache = {
    root: null,
    turns: [],
    version: 0
  };

  const scrollCache = {
    at: 0,
    scroller: null
  };

  const visibleTurnsCache = {
    at: 0,
    key: '',
    result: null
  };

  function now() {
    return Date.now();
  }

  function safeCall(fn, ...args) {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  }

  function isElementLike(el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      if (typeof Element === 'undefined') return true;
      return el instanceof Element;
    } catch {
      return false;
    }
  }

  function isHtmlElementLike(el) {
    try {
      if (!isElementLike(el)) return false;
      if (typeof HTMLElement === 'undefined') return true;
      return el instanceof HTMLElement;
    } catch {
      return false;
    }
  }

  function isButtonElementLike(el) {
    try {
      if (!isElementLike(el)) return false;
      if (typeof HTMLButtonElement !== 'undefined') return el instanceof HTMLButtonElement;
      return String(el.tagName || '').toUpperCase() === 'BUTTON';
    } catch {
      return false;
    }
  }

  function isVisibleElement(el) {
    try {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      if (r.bottom <= 0 || r.top >= (window.innerHeight || document.documentElement?.clientHeight || 0)) return false;
      const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) return false;
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
        if (!isVisibleElement(el)) continue;
        const r = el.getBoundingClientRect();
        const score = Number(r.bottom) || 0;
        if (score >= bestScore) {
          bestScore = score;
          best = el;
        }
      } catch {}
    }
    return best;
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
        editorCache.el.isConnected !== false &&
        editorCache.routeKey === routeKey &&
        now() - editorCache.at < 250
      ) {
        return editorCache.el;
      }
    } catch {}

    let found = null;
    try {
      const list = Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]'));
      found = pickBottomMostVisible(list);
    } catch {}
    if (!found) {
      try {
        const list = Array.from(document.querySelectorAll('#prompt-textarea[contenteditable="true"]'));
        found = pickBottomMostVisible(list);
      } catch {}
    }
    if (!found) {
      try {
        found = document.querySelector('#prompt-textarea');
      } catch {}
    }
    if (!found) {
      try {
        found = document.querySelector('textarea[name="prompt-textarea"]');
      } catch {}
    }

    editorCache.at = now();
    editorCache.routeKey = routeKey;
    editorCache.el = found || null;
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
      if (!isButtonElementLike(button) || !isVisibleElement(button)) return false;
      const form = getComposerForm(editorEl);
      if (!(form && typeof form.contains === 'function' && form.contains(button))) return false;
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
    const button = getModelSwitcherButton();
    try {
      if (!isHtmlElementLike(button)) return '';
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
    try {
      const mirrored = String(button?.getAttribute?.('data-qn-chatgpt-model-meta-label') || '').trim();
      if (mirrored) return mirrored;
    } catch {}
    return '';
  }

  function readComposerModeLabel(editorEl) {
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
    const form = getComposerForm(editorEl);
    const findWithin = (root) => {
      if (!root) return null;
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
          if (/\bstop\b/i.test(combined) || /停止|取消/.test(combined)) continue;
          if (/\b(send|submit)\b/i.test(combined) || /发送|提交/.test(combined)) return button;
        }
      } catch {}
      return null;
    };
    try {
      if (form) {
        const inForm = findWithin(form);
        if (inForm) return inForm;
      }
    } catch {}
    try {
      return findWithin(document);
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
      if (isButtonElementLike(el) && el.disabled) return true;
    } catch {}
    try {
      const ariaDisabled = String(el.getAttribute?.('aria-disabled') || '').toLowerCase();
      if (ariaDisabled && ariaDisabled !== 'false') return true;
    } catch {}
    return false;
  }

  function clickSendButton(editorEl) {
    try {
      const btn = findSendButton(editorEl);
      if (!isHtmlElementLike(btn)) return false;
      if (isElementDisabled(btn)) return false;
      const testId = String(btn.getAttribute?.('data-testid') || '');
      if (testId && /stop/i.test(testId)) return false;
      btn.click?.();
      return true;
    } catch {
      return false;
    }
  }

  function clickStopButton(editorEl) {
    try {
      const btn = findStopButton(editorEl);
      if (!isHtmlElementLike(btn)) return false;
      if (isElementDisabled(btn)) return false;
      btn.click?.();
      return true;
    } catch {
      return false;
    }
  }

  function normalizeTurnElement(el) {
    try {
      if (!isElementLike(el)) return null;
      if (el.matches?.(TURN_HOST_SELECTOR)) return el;
      return el.closest?.(TURN_HOST_SELECTOR) || el.closest?.('[data-testid^="conversation-turn-"]') || null;
    } catch {
      return null;
    }
  }

  function collectNormalizedTurns(root = document) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    const normalized = [];
    const seen = new Set();
    try {
      const list = Array.from(scope.querySelectorAll(TURN_SELECTOR));
      for (const item of list) {
        const turn = normalizeTurnElement(item);
        if (!turn || seen.has(turn)) continue;
        seen.add(turn);
        normalized.push(turn);
      }
    } catch {}
    return normalized;
  }

  function getTurnsRoot() {
    try {
      const stable = document.querySelector('[data-testid="conversation-turns"]');
      if (stable) return stable;
    } catch {}
    try {
      const turns = collectNormalizedTurns(document);
      const first = turns[0] || null;
      if (!first) return document;
      let cur = first.parentElement;
      const maxDepth = 12;
      for (let i = 0; cur && cur !== document.body && cur !== document.documentElement && i < maxDepth; i += 1) {
        try {
          if (turns.every((turn) => cur.contains(turn))) return cur;
        } catch {}
        cur = cur.parentElement;
      }
      const thread = document.getElementById?.('thread');
      if (thread && thread.querySelector?.(TURN_SELECTOR)) return thread;
      return first.parentElement || document;
    } catch {}
    return document;
  }

  function getTurnArticles(root, options = null) {
    const forceFresh = !!(options && typeof options === 'object' && options.forceFresh);
    try {
      const scope = root && typeof root.querySelectorAll === 'function' ? root : getTurnsRoot();
      if (
        !forceFresh &&
        turnsCache.root === scope &&
        Array.isArray(turnsCache.turns) &&
        turnsCache.turns.length &&
        turnsCache.turns.every((turn) => turn && turn.isConnected !== false)
      ) {
        return turnsCache.turns.slice();
      }
      const turns = collectNormalizedTurns(scope);
      if (turnsCache.root !== scope || turns.length !== turnsCache.turns.length || turns.some((turn, i) => turn !== turnsCache.turns[i])) {
        turnsCache.version += 1;
      }
      turnsCache.root = scope;
      turnsCache.turns = turns;
      return turns.slice();
    } catch {}
    return [];
  }

  function getTurnsSnapshot(force = false) {
    const root = getTurnsRoot();
    const turns = getTurnArticles(root, { forceFresh: force });
    return {
      root,
      turns,
      turnsVersion: turnsCache.version,
      rootChanged: turnsCache.root !== root,
      addedTurns: [],
      removedTurns: []
    };
  }

  function isWindowScroller(el) {
    const doc = document.documentElement;
    const se = document.scrollingElement || doc;
    return !el || el === window || el === document || el === document.body || el === doc || el === se;
  }

  function isScrollableY(el) {
    try {
      if (!isElementLike(el)) return false;
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
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
        const cached = scrollCache.scroller;
        if (cached && cached.isConnected !== false && ts - scrollCache.at < 1200) return cached;
      } catch {}
    }
    let next = null;
    try {
      const main = document.getElementById?.('main') || document.querySelector('main');
      const parent = main?.parentElement || null;
      if (isScrollableY(parent)) next = parent;
    } catch {}
    if (!next) {
      try {
        const root = getTurnsRoot();
        if (root && root !== document) next = findClosestScrollContainer(root) || root.parentElement || null;
      } catch {}
    }
    if (!next) {
      try {
        const anchor =
          document.querySelector(TURN_SELECTOR) ||
          document.querySelector('[data-message-id]') ||
          document.getElementById?.('thread') ||
          document.querySelector('main') ||
          document.querySelector('[role="main"]') ||
          document.body;
        next = findClosestScrollContainer(anchor) || document.scrollingElement || document.documentElement;
      } catch {
        next = document.scrollingElement || document.documentElement;
      }
    }
    scrollCache.at = ts;
    scrollCache.scroller = next || null;
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

  function getVisibleTurnWindow(force = false, marginPx = 0) {
    const snapshot = getTurnsSnapshot(force);
    const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : [];
    const scroller = getChatScrollContainer(force);
    const margin = Math.max(0, Number(marginPx) || 0);
    const key = `${snapshot.turnsVersion || 0}::${margin}::${turns.length}`;
    const ts = now();
    if (!force && visibleTurnsCache.result && visibleTurnsCache.key === key && ts - visibleTurnsCache.at < 80) {
      return visibleTurnsCache.result;
    }
    const bounds = getScrollerViewportBounds(scroller, margin);
    const visibleTurns = [];
    let first = turns.length ? turns.length - 1 : 0;
    let last = turns.length ? 0 : -1;
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i];
      let visible = false;
      try {
        const rect = turn?.getBoundingClientRect?.();
        visible = !!rect && rect.bottom >= bounds.top && rect.top <= bounds.bottom;
      } catch {}
      if (!visible) continue;
      if (!visibleTurns.length) first = i;
      last = i;
      visibleTurns.push(turn);
    }
    if (turns.length && !visibleTurns.length) {
      first = 0;
      last = turns.length - 1;
      visibleTurns.push(...turns);
    }
    const result = {
      root: snapshot.root || null,
      scroller: scroller || null,
      turns,
      turnsVersion: Number(snapshot.turnsVersion || 0),
      total: turns.length,
      first,
      last,
      visibleTurns
    };
    visibleTurnsCache.at = ts;
    visibleTurnsCache.key = key;
    visibleTurnsCache.result = result;
    return result;
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
    try {
      const v = String(turnEl?.getAttribute?.('data-testid') || '').trim();
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

  const api = Object.freeze({
    version: API_VERSION,
    selectors: Object.freeze({
      TURN_HOST_SELECTOR,
      TURN_SELECTOR,
      MODEL_SWITCHER_SELECTOR
    }),
    now,
    safeCall,
    isVisibleElement,
    pickBottomMostVisible,
    getConversationIdFromUrl,
    getRoute,
    getEditorEl,
    getComposerForm,
    getModelSwitcherButton,
    getComposerModelButton,
    readCurrentModelLabel,
    readCurrentModelMetaLabel,
    readComposerModeLabel,
    findSendButton,
    findStopButton,
    isGenerating,
    clickSendButton,
    clickStopButton,
    normalizeTurnElement,
    collectNormalizedTurns,
    getTurnsRoot,
    getTurnArticles,
    getTurnsSnapshot,
    getChatScrollContainer,
    getVisibleTurnWindow,
    getTurnRole,
    getTurnId,
    getMessageId,
    getTurnSelector: () => TURN_SELECTOR
  });

  try {
    Object.defineProperty(globalThis, API_KEY, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }
})();
