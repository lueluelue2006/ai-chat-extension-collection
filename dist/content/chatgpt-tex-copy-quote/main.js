(() => {
  'use strict';

  // Avoid installing global handlers in iframes.
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

  const GUARD_KEY = '__aichat_chatgpt_better_tex_quote_v2__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  const BTQ_STYLE_ID = '__btq_latex_tooltip_style_v2__';
  const BTQ_TOOLTIP_ID = '__btq_latex_tooltip_v2__';
  const MULTI_QUOTE_BUTTON_ID = '__btq_multi_quote_button_v1__';

  const HOVER_DELAY_MS = 800;
  const HOVER_MOVE_THROTTLE_MS = 80;
  const QUOTE_RETRY_DELAYS_MS = [0, 40, 120, 260, 520];
  const QUOTE_PATCH_WINDOW_MS = 2600;
  const MULTI_QUOTE_MIN_SELECTION_LENGTH = 2;
  const MULTI_QUOTE_BUTTON_WIDTH = 92;
  const MULTI_QUOTE_BUTTON_HEIGHT = 34;
  const MULTI_QUOTE_BUTTON_MARGIN = 8;
  const QUOTE_PREFIXES = ['> ', '>'];
  const QUOTE_TRAILINGS = ['\n\n', '\n', ''];
  const CONFIG_DATASET_KEYS = Object.freeze({
    multiQuote: 'aichatTexQuoteMultiQuoteEnabled',
    hideNativeQuote: 'aichatTexQuoteHideNativeQuoteEnabled',
    nativeQuotePatch: 'aichatTexQuoteNativeQuotePatchEnabled',
    copyLatex: 'aichatTexQuoteCopyLatexEnabled',
    hoverTooltip: 'aichatTexQuoteHoverTooltipEnabled',
    doubleClickCopy: 'aichatTexQuoteDoubleClickCopyEnabled'
  });
  const CONFIG_ATTR_FILTER = Object.freeze([
    'data-aichat-tex-quote-multi-quote-enabled',
    'data-aichat-tex-quote-hide-native-quote-enabled',
    'data-aichat-tex-quote-native-quote-patch-enabled',
    'data-aichat-tex-quote-copy-latex-enabled',
    'data-aichat-tex-quote-hover-tooltip-enabled',
    'data-aichat-tex-quote-double-click-copy-enabled'
  ]);

  const QUOTE_LABEL_RE = /(quote|引用|引述|援引|引用到输入框)/i;
  const QUICK_QUOTE_LABELS = new Set(['quote', '引用', '引述', '援引']);

  const state = {
    tooltip: null,
    tooltipTimer: null,
    hoverKatex: null,
    hoverMoveLastAt: 0,
    pendingPointerQuoteSnapshot: null,
    pendingPointerQuoteTimer: null,
    pendingQuotePatch: null,
    pendingQuotePatchTimer: null,
    selectionQuoteButton: null,
    selectionQuoteSnapshot: null,
    hiddenNativeQuoteControls: [],
    selectionRefreshTimer: null,
    selectionRefreshRetryTimers: [],
    selectionNativeHideTimers: [],
    selectionRepositionRaf: 0,
    configObserver: null
  };

  // Integrated from "ChatGPT TeX Copy & Quote 整合版.user.js"
  // Upstream: https://github.com/lueluelue2006/ChatGPT-Better-TeX-Quote
  // License: GPL-3.0-or-later
  //
  // This MV3 integration intentionally avoids monkey-patching Range/Selection prototypes.
  // Instead, it uses event-driven copy interception and quote-action post-processing.

  function readBoolDataset(key, fallback = true) {
    try {
      const raw = String(document.documentElement?.dataset?.[key] || '').trim();
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch {}
    return !!fallback;
  }

  function isFeatureEnabled(key) {
    const datasetKey = CONFIG_DATASET_KEYS?.[key];
    if (!datasetKey) return true;
    return readBoolDataset(datasetKey, true);
  }

  function isPerfHotOrHeavy() {
    try {
      const html = document.documentElement;
      return (
        html?.dataset?.cgptperfHot === '1' ||
        html?.dataset?.cgptperfHeavy === '1' ||
        (html?.dataset?.cgptperfExtreme === '1' && html?.dataset?.cgptperfGenerating === '1')
      );
    } catch {
      return false;
    }
  }

  function applyConfigSideEffects() {
    if (!isFeatureEnabled('multiQuote')) hideSelectionQuoteButton();
    if (!isFeatureEnabled('hideNativeQuote')) restoreNativeQuoteControls();
    if (!isFeatureEnabled('hoverTooltip')) updateHoverKatex(null);
    if (!isFeatureEnabled('nativeQuotePatch')) clearPendingQuotePatch();
  }

  function normalizeText(input) {
    return String(input == null ? '' : input)
      .replace(/\r\n?/g, '\n')
      .replace(/\u00A0/g, ' ');
  }

  function normalizeBlankLines(input) {
    return normalizeText(input).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  }

  function readLabel(el, attr) {
    try {
      return normalizeText(el?.getAttribute?.(attr) || '').trim();
    } catch {
      return '';
    }
  }

  function findTexFromKatex(katexEl) {
    if (!katexEl || !(katexEl instanceof Element)) return null;
    try {
      const ann = katexEl.querySelector('annotation[encoding="application/x-tex"], annotation');
      if (!ann || !ann.textContent) return null;
      const raw = ann.textContent.trim();
      if (!raw) return null;
      const isDisplay = katexEl.classList.contains('katex-display') || !!katexEl.closest('.katex-display');
      return isDisplay ? `$$${raw}$$` : `$${raw}$`;
    } catch {
      return null;
    }
  }

  function getKatexSelectionRoot(node) {
    const el = nodeToElement(node);
    if (!el) return null;
    try {
      return el.closest('.katex-display') || el.closest('.katex') || null;
    } catch {
      return null;
    }
  }

  function expandRangeToFormulaBoundaries(range) {
    if (!range || typeof range.cloneRange !== 'function') return range;
    try {
      const expanded = range.cloneRange();
      const startRoot = getKatexSelectionRoot(range.startContainer);
      const endRoot = getKatexSelectionRoot(range.endContainer);
      if (startRoot && startRoot.isConnected) expanded.setStartBefore(startRoot);
      if (endRoot && endRoot.isConnected) expanded.setEndAfter(endRoot);
      return expanded;
    } catch {
      return range;
    }
  }

  function transformFragment(fragment) {
    if (!fragment || !fragment.querySelectorAll) {
      return { fragment, hasKatex: false, changed: false };
    }

    const list = Array.from(fragment.querySelectorAll('.katex-display, .katex')).filter((el) => {
      try {
        const parentFormula = el.parentElement?.closest?.('.katex-display, .katex');
        return !parentFormula || !fragment.contains(parentFormula);
      } catch {
        return true;
      }
    });
    if (!list.length) {
      return { fragment, hasKatex: false, changed: false };
    }

    let changed = false;
    for (const el of list) {
      const tex = findTexFromKatex(el);
      if (!tex) continue;
      const textNode = fragment.ownerDocument.createTextNode(tex);
      el.replaceWith(textNode);
      changed = true;
    }

    return { fragment, hasKatex: true, changed };
  }

  function fragmentToHtml(fragment) {
    try {
      const doc = fragment?.ownerDocument || document;
      const wrap = doc.createElement('div');
      wrap.appendChild(fragment.cloneNode(true));
      return String(wrap.innerHTML || '');
    } catch {
      return '';
    }
  }

  function serializeRange(range) {
    if (!range || typeof range.cloneContents !== 'function') {
      return { plainText: '', htmlText: '', hasKatex: false, changed: false };
    }

    try {
      const originalFrag = range.cloneContents();
      const transformed = transformFragment(originalFrag);
      const plainText = normalizeText(transformed.fragment?.textContent || '');
      const htmlText = transformed.hasKatex ? fragmentToHtml(transformed.fragment) : '';
      return {
        plainText,
        htmlText,
        hasKatex: transformed.hasKatex,
        changed: transformed.changed
      };
    } catch {
      return { plainText: '', htmlText: '', hasKatex: false, changed: false };
    }
  }

  function snapshotActiveSelection() {
    let sel = null;
    try {
      sel = window.getSelection ? window.getSelection() : null;
    } catch {
      sel = null;
    }
    if (!sel || sel.rangeCount <= 0) return null;

    let range = null;
    try {
      range = sel.getRangeAt(0);
    } catch {
      range = null;
    }
    if (!range || range.collapsed) return null;

    const quoteRange = expandRangeToFormulaBoundaries(range);
    const serialized = serializeRange(quoteRange);
    if (!serialized.hasKatex) return null;

    const plainText = normalizeText(sel.toString());
    const latexText = serialized.plainText;
    if (!latexText) return null;

    return {
      capturedAt: Date.now(),
      plainText,
      latexText,
      htmlText: serialized.htmlText,
      hasKatex: serialized.hasKatex
    };
  }

  function quoteText(input, prefix, trailing) {
    const normalized = normalizeText(input);
    if (!normalized) return '';
    const lines = normalized.split('\n');
    const body = lines.map((line) => `${prefix}${line}`).join('\n');
    return `${body}${trailing}`;
  }

  function buildQuotePairs(plain, latex) {
    const src = normalizeText(plain);
    const dst = normalizeText(latex);
    if (!src || !dst || src === dst) return [];

    const pairs = [];
    const seen = new Set();
    for (const prefix of QUOTE_PREFIXES) {
      for (const trailing of QUOTE_TRAILINGS) {
        const from = quoteText(src, prefix, trailing);
        const to = quoteText(dst, prefix, trailing);
        if (!from || !to || from === to) continue;
        const key = `${from}\u0000${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ from, to });
      }
    }
    return pairs;
  }

  function replaceFirst(text, from, to) {
    const src = String(text || '');
    const idx = src.indexOf(from);
    if (idx < 0) return { changed: false, text: src };
    return {
      changed: true,
      text: src.slice(0, idx) + to + src.slice(idx + from.length)
    };
  }

  function isComposerEl(el) {
    if (!el || !(el instanceof Element)) return false;
    try {
      if (el.matches('#prompt-textarea')) return true;
      if (el.matches('#prompt-textarea[contenteditable="true"]')) return true;
      if (el.matches('textarea[name="prompt-textarea"]')) return true;
      if (el.matches('.ProseMirror[contenteditable="true"]')) return true;
    } catch {}
    return false;
  }

  function getComposerEl() {
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (core && typeof core.getEditorEl === 'function') {
        const editor = core.getEditorEl();
        if (editor && editor instanceof Element) return editor;
      }
    } catch {}

    const selectors = [
      '.ProseMirror[contenteditable="true"]',
      '#prompt-textarea[contenteditable="true"]',
      '#prompt-textarea',
      'textarea[name="prompt-textarea"]'
    ];

    for (const selector of selectors) {
      try {
        const list = Array.from(document.querySelectorAll(selector));
        if (!list.length) continue;
        const visible = list.filter((el) => {
          try {
            const rect = el.getBoundingClientRect();
            if (rect.width < 4 || rect.height < 4) return false;
            const cs = getComputedStyle(el);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
          } catch {
            return false;
          }
        });
        if (visible.length) return visible[visible.length - 1];
      } catch {}
    }

    return null;
  }

  function readComposerText(el) {
    if (!isComposerEl(el)) return '';
    try {
      if (el instanceof HTMLTextAreaElement) {
        return normalizeText(el.value || '');
      }
    } catch {}
    try {
      return normalizeText(el.innerText || el.textContent || '');
    } catch {
      return '';
    }
  }

  function writeComposerText(el, text) {
    if (!isComposerEl(el)) return false;
    const finalText = String(text ?? '');

    try {
      if (el instanceof HTMLTextAreaElement) {
        el.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) setter.call(el, finalText);
        else el.value = finalText;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        try {
          el.setSelectionRange(finalText.length, finalText.length);
        } catch {}
        return true;
      }
    } catch {}

    try {
      el.focus();
    } catch {}

    try {
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && typeof sel.removeAllRanges === 'function' && document.createRange) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        document.execCommand('selectAll', false, null);
      }
    } catch {}

    try {
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: finalText }));
    } catch {}

    try {
      document.execCommand('insertText', false, finalText);
    } catch {}

    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } catch {}

    try {
      const sel = window.getSelection ? window.getSelection() : null;
      if (sel && typeof sel.removeAllRanges === 'function' && document.createRange) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch {}

    return true;
  }

  function isQuoteActionTrigger(target) {
    if (!target || !(target instanceof Element)) return false;
    const control = target.closest('button,[role="button"],[role="menuitem"]');
    if (!control) return false;
    if (control.id === MULTI_QUOTE_BUTTON_ID || control.closest(`#${MULTI_QUOTE_BUTTON_ID}`)) return false;

    const dataTestId = readLabel(control, 'data-testid');
    if (dataTestId && dataTestId.toLowerCase().includes('quote')) return true;

    const attrs = ['aria-label', 'title', 'data-tooltip', 'aria-description', 'data-qa'];
    for (const attr of attrs) {
      const label = readLabel(control, attr);
      if (label && QUOTE_LABEL_RE.test(label)) return true;
    }

    const text = normalizeText(control.textContent || '')
      .trim()
      .toLowerCase();
    if (text && QUICK_QUOTE_LABELS.has(text)) return true;

    return false;
  }

  function nodeToElement(node) {
    if (!node) return null;
    if (node instanceof Element) return node;
    const parent = node.parentElement || node.parentNode;
    return parent instanceof Element ? parent : null;
  }

  function isInsideComposerOrControl(el) {
    if (!el || !(el instanceof Element)) return false;
    try {
      return !!el.closest(
        [
          `#${MULTI_QUOTE_BUTTON_ID}`,
          `#${BTQ_TOOLTIP_ID}`,
          '#prompt-textarea',
          '.ProseMirror[contenteditable="true"]',
          'textarea',
          'input',
          'button',
          '[role="button"]',
          '[role="menuitem"]',
          '[contenteditable="true"]'
        ].join(',')
      );
    } catch {
      return false;
    }
  }

  function selectionBelongsToChatContent(range) {
    const root = nodeToElement(range?.commonAncestorContainer);
    if (!root || isInsideComposerOrControl(root)) return false;
    try {
      if (root.closest('nav,header,aside,[data-testid*="sidebar"],[data-testid*="conversation-list"]')) return false;
      if (root.closest('main,[role="main"],[data-message-author-role],[data-testid*="conversation-turn"],article')) return true;
    } catch {}
    return !!normalizeText(range?.toString?.() || '').trim();
  }

  function rectIntersectsViewport(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const viewportWidth = Math.max(0, window.innerWidth || document.documentElement?.clientWidth || 0);
    const viewportHeight = Math.max(0, window.innerHeight || document.documentElement?.clientHeight || 0);
    return (
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      (!viewportWidth || rect.left <= viewportWidth) &&
      (!viewportHeight || rect.top <= viewportHeight)
    );
  }

  function getSelectionAnchorRect(range, options = {}) {
    if (!range || typeof range.getClientRects !== 'function') return null;
    try {
      const allRects = Array.from(range.getClientRects()).filter((rect) => rect && rect.width > 0 && rect.height > 0);
      const visibleRects = allRects.filter(rectIntersectsViewport);
      const rect = visibleRects.length ? visibleRects[visibleRects.length - 1] : allRects[allRects.length - 1] || range.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      if (options.requireVisible && !rectIntersectsViewport(rect)) return null;
      return rect;
    } catch {
      return null;
    }
  }

  function snapshotSelectionForMultiQuote() {
    let sel = null;
    try {
      sel = window.getSelection ? window.getSelection() : null;
    } catch {
      sel = null;
    }
    if (!sel || sel.rangeCount <= 0 || sel.isCollapsed) return null;

    let range = null;
    try {
      range = sel.getRangeAt(0);
    } catch {
      range = null;
    }
    if (!range || range.collapsed || !selectionBelongsToChatContent(range)) return null;

    const selectedText = normalizeBlankLines(sel.toString()).trim();
    if (selectedText.length < MULTI_QUOTE_MIN_SELECTION_LENGTH) return null;

    const quoteRange = expandRangeToFormulaBoundaries(range);
    const serialized = serializeRange(quoteRange);
    const quoteText = normalizeBlankLines(serialized.hasKatex && serialized.plainText ? serialized.plainText : selectedText).trim();
    if (quoteText.length < MULTI_QUOTE_MIN_SELECTION_LENGTH) return null;

    const rect = getSelectionAnchorRect(range);
    if (!rect) return null;

    let anchorRange = null;
    try {
      anchorRange = range.cloneRange();
    } catch {
      anchorRange = null;
    }

    return {
      capturedAt: Date.now(),
      quoteText,
      hasKatex: !!serialized.hasKatex,
      anchorRange,
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      }
    };
  }

  function buildMarkdownBlockquote(input) {
    const text = normalizeBlankLines(input).trim();
    if (!text) return '';
    return text
      .split('\n')
      .map((line) => (line.trim() ? `> ${line}` : '>'))
      .join('\n');
  }

  function appendQuoteToComposer(snapshot) {
    const quoteText = normalizeBlankLines(snapshot?.quoteText || '').trim();
    if (!quoteText) return false;

    const composer = getComposerEl();
    if (!composer) return false;

    const current = normalizeBlankLines(readComposerText(composer)).trimEnd();
    const block = buildMarkdownBlockquote(quoteText);
    if (!block) return false;

    const nextText = current ? `${current}\n\n${block}\n` : `${block}\n`;
    return writeComposerText(composer, normalizeBlankLines(nextText));
  }

  function restoreNativeQuoteControls() {
    const hidden = Array.isArray(state.hiddenNativeQuoteControls) ? state.hiddenNativeQuoteControls : [];
    state.hiddenNativeQuoteControls = [];
    for (const item of hidden) {
      try {
        if (!item || !item.el || !item.el.isConnected) continue;
        item.el.style.display = item.display;
        item.el.removeAttribute('data-aichat-btq-hidden-native-quote');
      } catch {}
    }
  }

  function hideNativeQuoteControlsNear(rect) {
    restoreNativeQuoteControls();
    if (!isFeatureEnabled('hideNativeQuote')) return;
    const hidden = [];
    const controls = Array.from(document.querySelectorAll('button,[role="button"],[role="menuitem"]'));
    for (const control of controls) {
      try {
        if (!(control instanceof HTMLElement)) continue;
        if (control.id === MULTI_QUOTE_BUTTON_ID) continue;
        const label = normalizeText(control.textContent || readLabel(control, 'aria-label') || '').trim().toLowerCase();
        if (label !== 'ask chatgpt' && label !== 'quote' && label !== '引用') continue;
        const r = control.getBoundingClientRect();
        if (label !== 'ask chatgpt' && rect && rectIntersectsViewport(rect)) {
          const dx = Math.max(0, Math.max(rect.left - r.right, r.left - rect.right));
          const dy = Math.max(0, Math.max(rect.top - r.bottom, r.top - rect.bottom));
          if (dx > 260 || dy > 160) continue;
        }
        hidden.push({ el: control, display: control.style.display || '' });
        control.setAttribute('data-aichat-btq-hidden-native-quote', '1');
        control.style.display = 'none';
      } catch {}
    }
    state.hiddenNativeQuoteControls = hidden;
  }

  function hideSelectionQuoteButton() {
    if (state.selectionRepositionRaf) {
      try {
        cancelAnimationFrame(state.selectionRepositionRaf);
      } catch {}
      state.selectionRepositionRaf = 0;
    }
    if (Array.isArray(state.selectionRefreshRetryTimers)) {
      for (const timer of state.selectionRefreshRetryTimers) {
        try {
          clearTimeout(timer);
        } catch {}
      }
      state.selectionRefreshRetryTimers = [];
    }
    if (Array.isArray(state.selectionNativeHideTimers)) {
      for (const timer of state.selectionNativeHideTimers) {
        try {
          clearTimeout(timer);
        } catch {}
      }
      state.selectionNativeHideTimers = [];
    }
    restoreNativeQuoteControls();
    state.selectionQuoteSnapshot = null;
    const btn = state.selectionQuoteButton;
    if (!btn) return;
    try {
      btn.style.display = 'none';
    } catch {}
  }

  function positionSelectionQuoteButton(snapshot, rect) {
    const btn = ensureSelectionQuoteButton();
    if (!btn || !snapshot || !rect) return false;

    const margin = MULTI_QUOTE_BUTTON_MARGIN;
    const buttonWidth = MULTI_QUOTE_BUTTON_WIDTH;
    const buttonHeight = MULTI_QUOTE_BUTTON_HEIGHT;
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || buttonWidth + margin * 2;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || buttonHeight + margin * 2;
    let bottomLimit = viewportHeight - margin;
    try {
      const composer = getComposerEl();
      const composerRect = composer?.getBoundingClientRect?.();
      if (composerRect && composerRect.width > 0 && composerRect.height > 0 && composerRect.top > margin && composerRect.top < viewportHeight) {
        bottomLimit = Math.min(bottomLimit, composerRect.top - margin);
      }
    } catch {}

    const maxLeft = Math.max(margin, viewportWidth - buttonWidth - margin);
    const maxTop = Math.max(margin, bottomLimit - buttonHeight);
    const left = Math.max(margin, Math.min(maxLeft, rect.right - buttonWidth));
    const top = Math.max(margin, Math.min(maxTop, rect.bottom + margin));

    btn.style.left = `${Math.round(left)}px`;
    btn.style.top = `${Math.round(top)}px`;
    btn.style.display = 'inline-flex';
    snapshot.rect = {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
    return true;
  }

  function ensureSelectionQuoteButton() {
    try {
      if (state.selectionQuoteButton && state.selectionQuoteButton.isConnected) return state.selectionQuoteButton;
      if (!document.body) return null;
      const existing = document.getElementById(MULTI_QUOTE_BUTTON_ID);
      if (existing instanceof HTMLButtonElement) {
        state.selectionQuoteButton = existing;
        return existing;
      }
      const btn = document.createElement('button');
      btn.id = MULTI_QUOTE_BUTTON_ID;
      btn.type = 'button';
      btn.className = 'btq-multi-quote-button';
      btn.textContent = 'Quote';
      btn.setAttribute('aria-label', 'Quote selected text');
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      });
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const snapshot = state.selectionQuoteSnapshot || snapshotSelectionForMultiQuote();
        const ok = appendQuoteToComposer(snapshot);
        if (ok) {
          showToast(snapshot?.hasKatex ? '已添加 LaTeX 引用' : '已添加引用');
          try {
            window.getSelection?.()?.removeAllRanges?.();
          } catch {}
        } else {
          showToast('引用失败：未找到输入框');
        }
        hideSelectionQuoteButton();
      });
      document.body.appendChild(btn);
      state.selectionQuoteButton = btn;
      return btn;
    } catch {
      return null;
    }
  }

  function showSelectionQuoteButton(snapshot) {
    if (!snapshot || !snapshot.rect) {
      hideSelectionQuoteButton();
      return;
    }
    const btn = ensureSelectionQuoteButton();
    if (!btn) return;
    state.selectionQuoteSnapshot = snapshot;
    positionSelectionQuoteButton(snapshot, snapshot.rect);
    hideNativeQuoteControlsNear(snapshot.rect);
    if (Array.isArray(state.selectionNativeHideTimers)) {
      for (const timer of state.selectionNativeHideTimers) {
        try {
          clearTimeout(timer);
        } catch {}
      }
    }
    state.selectionNativeHideTimers = [];
    for (const delay of [90, 240, 520, 900]) {
      const timer = setTimeout(() => {
        if (state.selectionQuoteSnapshot === snapshot) hideNativeQuoteControlsNear(snapshot.rect);
      }, delay);
      state.selectionNativeHideTimers.push(timer);
    }
  }

  function refreshSelectionQuotePosition() {
    state.selectionRepositionRaf = 0;
    const snapshot = state.selectionQuoteSnapshot;
    if (!snapshot || !snapshot.anchorRange) {
      hideSelectionQuoteButton();
      return;
    }

    const rect = getSelectionAnchorRect(snapshot.anchorRange);
    if (!rect) {
      hideSelectionQuoteButton();
      return;
    }

    if (!positionSelectionQuoteButton(snapshot, rect)) {
      hideSelectionQuoteButton();
      return;
    }
    hideNativeQuoteControlsNear(snapshot.rect);
  }

  function activeSelectionLooksQuotable() {
    try {
      const selectedText = normalizeBlankLines(window.getSelection?.()?.toString?.() || '').trim();
      return selectedText.length >= MULTI_QUOTE_MIN_SELECTION_LENGTH;
    } catch {
      return false;
    }
  }

  function selectionIsCollapsedInsideComposer() {
    try {
      const sel = window.getSelection?.();
      if (!sel || !sel.isCollapsed) return false;
      const node = sel.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      return isComposerOrInside(el);
    } catch {
      return false;
    }
  }

  function isComposerOrInside(el) {
    if (!el || !(el instanceof Element)) return false;
    if (isComposerEl(el)) return true;
    try {
      return !!el.closest?.('#prompt-textarea, textarea[name="prompt-textarea"], .ProseMirror[contenteditable="true"]');
    } catch {
      return false;
    }
  }

  function shouldSkipSelectionQuoteRefreshForTyping(ev) {
    const type = String(ev?.type || '');
    if (type !== 'selectionchange' && type !== 'keyup') return false;
    const active = document.activeElement;
    const target = ev?.target;
    if (!isComposerOrInside(active) && !isComposerOrInside(target)) return false;
    if (selectionIsCollapsedInsideComposer()) {
      if (state.selectionQuoteSnapshot) hideSelectionQuoteButton();
      return true;
    }
    if (activeSelectionLooksQuotable()) return false;
    if (state.selectionQuoteSnapshot) hideSelectionQuoteButton();
    return true;
  }

  function handleSelectionViewportChange() {
    if (state.selectionQuoteSnapshot) {
      scheduleSelectionQuoteReposition();
      return;
    }
    if (activeSelectionLooksQuotable()) scheduleSelectionQuoteRefresh();
  }

  function scheduleSelectionQuoteReposition() {
    if (!state.selectionQuoteSnapshot) return;
    if (state.selectionRepositionRaf) return;
    try {
      state.selectionRepositionRaf = requestAnimationFrame(refreshSelectionQuotePosition);
    } catch {
      refreshSelectionQuotePosition();
    }
  }

  function refreshSelectionQuoteButton() {
    if (!isFeatureEnabled('multiQuote')) {
      hideSelectionQuoteButton();
      return;
    }
    const snapshot = snapshotSelectionForMultiQuote();
    if (!snapshot) {
      hideSelectionQuoteButton();
      return;
    }
    showSelectionQuoteButton(snapshot);
  }

  function scheduleSelectionQuoteRefresh(ev = null) {
    if (shouldSkipSelectionQuoteRefreshForTyping(ev)) return;
    if (isPerfHotOrHeavy() && ev?.type !== 'pointerup' && !state.selectionQuoteSnapshot) return;
    if (!state.selectionQuoteSnapshot && ev?.type !== 'pointerup' && !activeSelectionLooksQuotable()) return;

    if (state.selectionRefreshTimer) {
      clearTimeout(state.selectionRefreshTimer);
      state.selectionRefreshTimer = null;
    }
    state.selectionRefreshTimer = setTimeout(() => {
      state.selectionRefreshTimer = null;
      refreshSelectionQuoteButton();
    }, 35);

    if (Array.isArray(state.selectionRefreshRetryTimers)) {
      for (const timer of state.selectionRefreshRetryTimers) {
        try {
          clearTimeout(timer);
        } catch {}
      }
    }
    state.selectionRefreshRetryTimers = [180, 450].map((delay) =>
      setTimeout(() => {
        if (!state.selectionQuoteSnapshot && activeSelectionLooksQuotable()) refreshSelectionQuoteButton();
      }, delay)
    );
  }

  function clearPendingQuotePatch() {
    if (state.pendingQuotePatchTimer) {
      try {
        clearTimeout(state.pendingQuotePatchTimer);
      } catch {}
      state.pendingQuotePatchTimer = null;
    }
    state.pendingQuotePatch = null;
    clearPendingPointerQuoteSnapshot();
  }

  function clearPendingPointerQuoteSnapshot() {
    if (state.pendingPointerQuoteTimer) {
      try {
        clearTimeout(state.pendingPointerQuoteTimer);
      } catch {}
      state.pendingPointerQuoteTimer = null;
    }
    state.pendingPointerQuoteSnapshot = null;
  }

  function setPendingPointerQuoteSnapshot(snapshot) {
    clearPendingPointerQuoteSnapshot();
    if (!snapshot) return;
    state.pendingPointerQuoteSnapshot = snapshot;
    state.pendingPointerQuoteTimer = setTimeout(() => {
      clearPendingPointerQuoteSnapshot();
    }, 1700);
  }

  function scheduleQuotePatch(snapshot) {
    if (!snapshot || !snapshot.hasKatex) return;
    if (state.pendingQuotePatchTimer) {
      try {
        clearTimeout(state.pendingQuotePatchTimer);
      } catch {}
      state.pendingQuotePatchTimer = null;
    }
    state.pendingQuotePatch = {
      createdAt: Date.now(),
      expiresAt: Date.now() + QUOTE_PATCH_WINDOW_MS,
      snapshot
    };
    state.pendingQuotePatchTimer = setTimeout(() => {
      clearPendingQuotePatch();
    }, QUOTE_PATCH_WINDOW_MS + 80);

    for (const delay of QUOTE_RETRY_DELAYS_MS) {
      setTimeout(() => {
        applyPendingQuotePatch();
      }, delay);
    }
  }

  function applyPendingQuotePatch() {
    const pending = state.pendingQuotePatch;
    if (!pending) return false;

    if (Date.now() > Number(pending.expiresAt || 0)) {
      clearPendingQuotePatch();
      return false;
    }

    const snapshot = pending.snapshot;
    if (!snapshot || !snapshot.hasKatex) {
      clearPendingQuotePatch();
      return false;
    }

    const composer = getComposerEl();
    if (!composer) return false;

    const currentText = readComposerText(composer);
    if (!currentText) return false;

    const pairs = buildQuotePairs(snapshot.plainText, snapshot.latexText);
    if (!pairs.length) {
      clearPendingQuotePatch();
      return false;
    }

    for (const pair of pairs) {
      if (currentText.includes(pair.to)) {
        clearPendingQuotePatch();
        return true;
      }
    }

    for (const pair of pairs) {
      if (!currentText.includes(pair.from)) continue;
      const replaced = replaceFirst(currentText, pair.from, pair.to);
      if (!replaced.changed) continue;
      const ok = writeComposerText(composer, replaced.text);
      if (ok) {
        clearPendingQuotePatch();
        return true;
      }
    }

    return false;
  }

  function copyTextFallback(text) {
    try {
      if (!document || !document.body || !document.createElement) return;
      const ta = document.createElement('textarea');
      ta.value = String(text || '');
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {}
      document.body.removeChild(ta);
    } catch {}
  }

  function copyTextToClipboard(text, onDone) {
    if (!text) return;
    const done = typeof onDone === 'function' ? onDone : function () {};
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard
          .writeText(text)
          .then(done)
          .catch(() => {
            copyTextFallback(text);
            done();
          });
      } else {
        copyTextFallback(text);
        done();
      }
    } catch {
      copyTextFallback(text);
      done();
    }
  }

  function showToast(message) {
    if (!document || !document.body) return;
    const el = document.createElement('div');
    el.className = 'btq-latex-copy-success';
    el.textContent = String(message || '');
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }, 200);
    }, 1000);
  }

  function showCopySuccessToast() {
    showToast('已复制 LaTeX 公式');
  }

  function ensureTooltipEl() {
    try {
      if (state.tooltip && state.tooltip.isConnected) return state.tooltip;
    } catch {}

    try {
      if (!document.body) return null;
      const existing = document.getElementById(BTQ_TOOLTIP_ID);
      if (existing) {
        state.tooltip = existing;
        return state.tooltip;
      }
      const next = document.createElement('div');
      next.id = BTQ_TOOLTIP_ID;
      next.className = 'btq-latex-tooltip';
      next.style.display = 'none';
      document.body.appendChild(next);
      state.tooltip = next;
      return state.tooltip;
    } catch {
      return null;
    }
  }

  function showTooltip(katexEl, tex) {
    if (!katexEl || !tex) return;
    const tip = ensureTooltipEl();
    if (!tip) return;
    try {
      const rect = katexEl.getBoundingClientRect();
      tip.textContent = tex;
      tip.style.left = `${rect.left}px`;
      const top = rect.top - 24;
      tip.style.top = `${top < 0 ? 0 : top}px`;
      tip.style.display = 'block';
      tip.style.opacity = '0.8';
    } catch {}
  }

  function hideTooltip() {
    const tip = ensureTooltipEl();
    if (!tip) return;
    tip.style.display = 'none';
    tip.style.opacity = '0';
  }

  function ensureStyles() {
    const css =
      '.btq-latex-tooltip{position:fixed;background-color:rgba(0,0,0,0.7);color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;z-index:1000;opacity:0;transition:opacity 0.15s;pointer-events:none;}' +
      '.btq-latex-copy-success{position:fixed;bottom:10%;left:50%;transform:translateX(-50%);background-color:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:4px;font-size:12px;z-index:1000;opacity:1;transition:opacity 0.2s;pointer-events:none;}' +
      '.btq-multi-quote-button{position:fixed;display:none;align-items:center;justify-content:center;gap:6px;height:32px;min-width:78px;padding:0 12px;border:1px solid rgba(192,132,252,0.58);border-radius:8px;background:rgba(109,40,217,0.96);color:#fff;font:600 13px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(88,28,135,0.34);z-index:2147483646;cursor:pointer;user-select:none;}' +
      '.btq-multi-quote-button:hover{background:rgba(126,34,206,0.98);border-color:rgba(216,180,254,0.78);}';

    if (!document.head) return;
    const existing = document.getElementById(BTQ_STYLE_ID);
    if (existing) {
      existing.textContent = css;
      return;
    }
    const styleEl = document.createElement('style');
    styleEl.id = BTQ_STYLE_ID;
    styleEl.type = 'text/css';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function clearHoverTooltipTimer() {
    if (state.tooltipTimer) {
      clearTimeout(state.tooltipTimer);
      state.tooltipTimer = null;
    }
  }

  function updateHoverKatex(nextKatex) {
    const normalized = nextKatex && nextKatex instanceof Element ? nextKatex : null;
    if (state.hoverKatex === normalized) return;

    state.hoverKatex = normalized;
    clearHoverTooltipTimer();
    hideTooltip();

    if (!normalized) return;
    normalized.style.cursor = 'pointer';

    state.tooltipTimer = setTimeout(() => {
      if (state.hoverKatex !== normalized) return;
      if (!normalized.isConnected) return;
      const tex = findTexFromKatex(normalized);
      if (!tex) return;
      showTooltip(normalized, tex);
    }, HOVER_DELAY_MS);
  }

  function onPointerMove(ev) {
    if (!isFeatureEnabled('hoverTooltip')) {
      updateHoverKatex(null);
      return;
    }
    if (isPerfHotOrHeavy()) {
      updateHoverKatex(null);
      return;
    }
    const target = ev?.target;
    if (!target || !(target instanceof Element)) return;

    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (now - Number(state.hoverMoveLastAt || 0) < HOVER_MOVE_THROTTLE_MS) return;
    state.hoverMoveLastAt = now;

    const katexEl = target.closest('.katex');
    updateHoverKatex(katexEl);
  }

  function onPointerLeaveDocument() {
    updateHoverKatex(null);
  }

  function onWindowBlur() {
    updateHoverKatex(null);
  }

  function onDblClick(ev) {
    if (!isFeatureEnabled('doubleClickCopy')) return;
    const target = ev?.target;
    if (!target || !(target instanceof Element)) return;
    const katexEl = target.closest('.katex');
    if (!katexEl) return;

    const tex = findTexFromKatex(katexEl);
    if (!tex) return;

    copyTextToClipboard(tex, showCopySuccessToast);
  }

  function onCopy(ev) {
    if (!isFeatureEnabled('copyLatex')) return;
    const snapshot = snapshotActiveSelection();
    if (!snapshot || !snapshot.hasKatex || !snapshot.latexText) return;

    const clipboardData = ev?.clipboardData;
    if (!clipboardData) return;

    try {
      clipboardData.setData('text/plain', snapshot.latexText);
      if (snapshot.htmlText) {
        clipboardData.setData('text/html', snapshot.htmlText);
      }
      ev.preventDefault();
    } catch {}
  }

  function onPointerDown(ev) {
    if (!isFeatureEnabled('nativeQuotePatch')) {
      clearPendingPointerQuoteSnapshot();
      return;
    }
    const target = ev?.target;
    if (!target || !(target instanceof Element)) return;
    if (!isQuoteActionTrigger(target)) return;

    const snapshot = snapshotActiveSelection();
    if (!snapshot || !snapshot.hasKatex) return;

    setPendingPointerQuoteSnapshot(snapshot);
  }

  function onQuoteTrigger(ev) {
    if (!isFeatureEnabled('nativeQuotePatch')) {
      clearPendingQuotePatch();
      return;
    }
    const target = ev?.target;
    if (!target || !(target instanceof Element)) return;
    if (!isQuoteActionTrigger(target)) return;

    const pointerSnapshot = state.pendingPointerQuoteSnapshot;
    const now = Date.now();
    const fallbackSnapshot = snapshotActiveSelection();

    let selectedSnapshot = null;
    if (pointerSnapshot && now - Number(pointerSnapshot.capturedAt || 0) <= 1600) {
      selectedSnapshot = pointerSnapshot;
    } else if (fallbackSnapshot && fallbackSnapshot.hasKatex) {
      selectedSnapshot = fallbackSnapshot;
    }

    if (!selectedSnapshot || !selectedSnapshot.hasKatex) {
      clearPendingPointerQuoteSnapshot();
      return;
    }

    scheduleQuotePatch(selectedSnapshot);
    clearPendingPointerQuoteSnapshot();
  }

  function releaseEphemeralState() {
    hideSelectionQuoteButton();
    clearPendingQuotePatch();
    clearPendingPointerQuoteSnapshot();
    updateHoverKatex(null);
  }

  function bindHandlers() {
    if (window.__btqHandlersBoundV2) return;
    window.__btqHandlersBoundV2 = true;

    document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    document.addEventListener('mouseleave', onPointerLeaveDocument, true);
    window.addEventListener('blur', onWindowBlur, true);
    document.addEventListener('dblclick', onDblClick, false);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onQuoteTrigger, true);
    document.addEventListener('pointerup', scheduleSelectionQuoteRefresh, { capture: true, passive: true });
    document.addEventListener('keyup', scheduleSelectionQuoteRefresh, true);
    document.addEventListener('selectionchange', scheduleSelectionQuoteRefresh, true);
    document.addEventListener('scroll', handleSelectionViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', handleSelectionViewportChange, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseEphemeralState();
    }, true);
    window.addEventListener('pagehide', releaseEphemeralState, true);
    try {
      window.visualViewport?.addEventListener?.('scroll', handleSelectionViewportChange, { passive: true });
      window.visualViewport?.addEventListener?.('resize', handleSelectionViewportChange, { passive: true });
    } catch {}
  }

  function ensureConfigObserver() {
    if (state.configObserver || typeof MutationObserver !== 'function') return;
    try {
      const target = document.documentElement;
      if (!target) return;
      state.configObserver = new MutationObserver(() => applyConfigSideEffects());
      state.configObserver.observe(target, { attributes: true, attributeFilter: [...CONFIG_ATTR_FILTER] });
    } catch {}
  }

  function setup() {
    if (!document || !document.body) return;
    ensureStyles();
    ensureTooltipEl();
    bindHandlers();
    ensureConfigObserver();
    applyConfigSideEffects();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setup();
        // ChatGPT hydration can wipe body children. Re-ensure tooltip + style a few times.
        setTimeout(setup, 1200);
        setTimeout(setup, 3200);
      });
    } else {
      setup();
      setTimeout(setup, 1200);
      setTimeout(setup, 3200);
    }
  }
})();
