(() => {
  'use strict';

  const STATE_KEY = '__aichat_hide_disclaimer_state__';
  try {
    const prev = window[STATE_KEY];
    if (prev && typeof prev === 'object') {
      try {
        prev.observer?.disconnect?.();
      } catch {}
      try {
        if (prev.scanTimer) clearTimeout(prev.scanTimer);
      } catch {}
    }
  } catch {}

  const state = { observer: null, scanTimer: null };
  try {
    Object.defineProperty(window, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[STATE_KEY] = state;
    } catch {}
  }

  const STYLE_ID = 'aichat-hide-disclaimer-style';

  function upsertStyle(cssText) {
    try {
      const existing = document.getElementById(STYLE_ID);
      if (existing) {
        existing.textContent = cssText;
        return;
      }
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = cssText;
      (document.head || document.documentElement).appendChild(style);
    } catch {}
  }

  function isChatGpt() {
    const host = String(location.hostname || '').toLowerCase();
    return host === 'chatgpt.com' || host === 'chat.openai.com';
  }

  // ChatGPT：用 CSS 精确隐藏免责声明，避免在该站点做重 DOM 扫描（该站点 DOM 变动很频繁）
  if (isChatGpt()) {
    upsertStyle(`
      #thread-bottom-container [class*="vt-disclaimer"],
      div.text-token-text-secondary.min-h-8.text-xs[class*="md:px-"] {
        display: none !important;
      }
    `);
    return;
  }

  const DATA_ATTR = 'data-aichat-hidden-disclaimer';

  const PATTERNS = [
    /can make mistakes/i,
    /may make mistakes/i,
    /can be wrong/i,
    /may not be accurate/i,
    /ai-generated content may not be accurate/i,
    /solely for reference/i,
    /for reference only/i,
    /ai-generated.*for reference/i,
    /check important information/i,
    /consider checking important information/i,
    /doesn['’]t use .* data to train/i,
    /don['’]t use .* data to train/i,
    /do not use .* data to train/i,
    /will not use .* data to train/i,
    /won['’]t use .* data to train/i,
    /not.*use .* data to train/i,
    /可能会犯错/,
    /可能会出错/,
    /内容可能不准确/,
    /请核实重要信息/,
    /不(?:会|使用).*(?:训练|训练其).*(?:模型)?/,
    /不用于训练/,
    /不会将.*用于训练/
  ];

  const MIN_TEXT_LEN = 10;
  const MAX_TEXT_LEN = 320;
  const MAX_HIDE_HEIGHT_PX = 180;
  const MAX_ASCEND = 4;

  function trimText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function matchesDisclaimerText(text) {
    if (!text) return false;
    return PATTERNS.some((re) => {
      try {
        return re.test(text);
      } catch {
        return false;
      }
    });
  }

  function markHidden(el) {
    try {
      el.setAttribute(DATA_ATTR, '1');
    } catch {}
  }

  function isMarkedHidden(el) {
    try {
      return el?.getAttribute?.(DATA_ATTR) === '1';
    } catch {
      return false;
    }
  }

  function hideElement(el) {
    if (!el || isMarkedHidden(el)) return false;
    try {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('opacity', '0', 'important');
    } catch {}
    markHidden(el);
    return true;
  }

  function hasInteractiveDescendant(el) {
    try {
      return !!el.querySelector('textarea, input, select, [contenteditable="true"], button[data-testid="send-button"], button[type="submit"]');
    } catch {
      return false;
    }
  }

  function pickHideTarget(el, text) {
    let current = el;
    for (let i = 0; i < MAX_ASCEND; i++) {
      const parent = current?.parentElement;
      if (!parent) break;
      if (hasInteractiveDescendant(parent)) break;

      const parentText = trimText(parent.textContent);
      if (!parentText) break;
      if (parentText.length > MAX_TEXT_LEN * 2) break;
      if (!matchesDisclaimerText(parentText)) break;

      const rect = parent.getBoundingClientRect?.();
      const height = rect ? rect.height : 0;
      if (height && height > MAX_HIDE_HEIGHT_PX) break;

      current = parent;
    }
    return current;
  }

  function maybeHide(el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      if (isMarkedHidden(el)) return false;
      if (el.closest?.('pre, code, textarea, input, [contenteditable="true"]')) return false;

      const text = trimText(el.textContent);
      if (!text || text.length < MIN_TEXT_LEN || text.length > MAX_TEXT_LEN) return false;
      if (!matchesDisclaimerText(text)) return false;

      const rect = el.getBoundingClientRect?.();
      const height = rect ? rect.height : 0;
      if (height && height > MAX_HIDE_HEIGHT_PX) return false;

      const target = pickHideTarget(el, text);
      return hideElement(target);
    } catch {
      return false;
    }
  }

  function scan(root) {
    try {
      if (!root) return 0;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let count = 0;
      let node = walker.nextNode();
      while (node) {
        if (maybeHide(node)) count++;
        node = walker.nextNode();
      }
      return count;
    } catch {
      return 0;
    }
  }

  const pendingRoots = new Set();

  function enqueueRoot(node) {
    try {
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      if (!el || el.nodeType !== 1) return;
      pendingRoots.add(el);
    } catch {}
  }

  function flushPendingRoots() {
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    for (const root of roots) scan(root);
  }

  function scheduleScanSoon() {
    if (state.scanTimer) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      flushPendingRoots();
    }, 120);
  }

  function boot() {
    scan(document.body || document.documentElement);

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        for (const n of m.addedNodes || []) enqueueRoot(n);
      }
      if (pendingRoots.size) scheduleScanSoon();
    });

    // 覆盖 SSR/水合后才出现的提示（仅一次）
    setTimeout(() => {
      enqueueRoot(document.body || document.documentElement);
      scheduleScanSoon();
    }, 800);

    try {
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch {}

    state.observer = mo;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
