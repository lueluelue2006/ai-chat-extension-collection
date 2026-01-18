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

  function scheduleScanSoon() {
    if (state.scanTimer) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      scan(document.body || document.documentElement);
    }, 80);
  }

  function boot() {
    scan(document.body || document.documentElement);

    const mo = new MutationObserver((mutations) => {
      let should = false;
      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        if (m.addedNodes && m.addedNodes.length) {
          should = true;
          break;
        }
      }
      if (should) scheduleScanSoon();
    });

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
