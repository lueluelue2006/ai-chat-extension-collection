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

  const HOVER_DELAY_MS = 800;
  const QUOTE_RETRY_DELAYS_MS = [0, 40, 120, 260, 520];
  const QUOTE_PATCH_WINDOW_MS = 2600;
  const QUOTE_PREFIXES = ['> ', '>'];
  const QUOTE_TRAILINGS = ['\n\n', '\n', ''];

  const QUOTE_LABEL_RE = /(quote|引用|引述|援引|引用到输入框)/i;
  const QUICK_QUOTE_LABELS = new Set(['quote', '引用', '引述', '援引']);

  const state = {
    tooltip: null,
    tooltipTimer: null,
    pendingPointerQuoteSnapshot: null,
    pendingQuotePatch: null
  };

  // Integrated from "ChatGPT TeX Copy & Quote 整合版.user.js"
  // Upstream: https://github.com/lueluelue2006/ChatGPT-Better-TeX-Quote
  // License: GPL-3.0-or-later
  //
  // This MV3 integration intentionally avoids monkey-patching Range/Selection prototypes.
  // Instead, it uses event-driven copy interception and quote-action post-processing.

  function normalizeText(input) {
    return String(input == null ? '' : input)
      .replace(/\r\n?/g, '\n')
      .replace(/\u00A0/g, ' ');
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
      const isDisplay = katexEl.classList.contains('katex-display');
      return isDisplay ? `$$${raw}$$` : `$${raw}$`;
    } catch {
      return null;
    }
  }

  function transformFragment(fragment) {
    if (!fragment || !fragment.querySelectorAll) {
      return { fragment, hasKatex: false, changed: false };
    }

    const list = fragment.querySelectorAll('.katex');
    if (!list.length) {
      return { fragment, hasKatex: false, changed: false };
    }

    let changed = false;
    for (const el of Array.from(list)) {
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

    const serialized = serializeRange(range);
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
        el.value = finalText;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return true;
      }
    } catch {}

    try {
      el.focus();
    } catch {}

    try {
      document.execCommand('selectAll', false, null);
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

  function clearPendingQuotePatch() {
    state.pendingQuotePatch = null;
    state.pendingPointerQuoteSnapshot = null;
  }

  function scheduleQuotePatch(snapshot) {
    if (!snapshot || !snapshot.hasKatex) return;
    state.pendingQuotePatch = {
      createdAt: Date.now(),
      expiresAt: Date.now() + QUOTE_PATCH_WINDOW_MS,
      snapshot
    };

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

  function showCopySuccessToast() {
    if (!document || !document.body) return;
    const el = document.createElement('div');
    el.className = 'btq-latex-copy-success';
    el.textContent = '已复制 LaTeX 公式';
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
      '.btq-latex-copy-success{position:fixed;bottom:10%;left:50%;transform:translateX(-50%);background-color:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:4px;font-size:12px;z-index:1000;opacity:1;transition:opacity 0.2s;pointer-events:none;}';

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

  function onMouseOver(ev) {
    const target = ev?.target;
    if (!target || !(target instanceof Element)) return;
    if (!ensureTooltipEl()) return;

    const katexEl = target.closest('.katex');
    if (!katexEl) return;

    katexEl.style.cursor = 'pointer';
    if (state.tooltipTimer) {
      clearTimeout(state.tooltipTimer);
    }

    state.tooltipTimer = setTimeout(() => {
      const tex = findTexFromKatex(katexEl);
      if (!tex) return;
      showTooltip(katexEl, tex);
    }, HOVER_DELAY_MS);
  }

  function onMouseOut(ev) {
    const from = ev?.target;
    if (!from || !(from instanceof Element)) return;

    const fromKatex = from.closest('.katex');
    if (!fromKatex) return;

    const to = ev?.relatedTarget;
    if (to && to instanceof Element) {
      const toKatex = to.closest('.katex');
      if (toKatex === fromKatex) {
        return;
      }
    }

    if (state.tooltipTimer) {
      clearTimeout(state.tooltipTimer);
      state.tooltipTimer = null;
    }
    hideTooltip();
  }

  function onDblClick(ev) {
    const target = ev?.target;
    if (!target || !(target instanceof Element)) return;
    const katexEl = target.closest('.katex');
    if (!katexEl) return;

    const tex = findTexFromKatex(katexEl);
    if (!tex) return;

    copyTextToClipboard(tex, showCopySuccessToast);
  }

  function onCopy(ev) {
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
    const target = ev?.target;
    if (!target || !(target instanceof Element)) return;
    if (!isQuoteActionTrigger(target)) return;

    const snapshot = snapshotActiveSelection();
    if (!snapshot || !snapshot.hasKatex) return;

    state.pendingPointerQuoteSnapshot = snapshot;
  }

  function onQuoteTrigger(ev) {
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
      state.pendingPointerQuoteSnapshot = null;
      return;
    }

    scheduleQuotePatch(selectedSnapshot);
  }

  function bindHandlers() {
    if (window.__btqHandlersBoundV2) return;
    window.__btqHandlersBoundV2 = true;

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('dblclick', onDblClick, false);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onQuoteTrigger, true);
  }

  function setup() {
    if (!document || !document.body) return;
    ensureStyles();
    ensureTooltipEl();
    bindHandlers();
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
