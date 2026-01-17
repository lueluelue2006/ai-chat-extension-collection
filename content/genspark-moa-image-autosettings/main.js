(() => {
  'use strict';

  const GUARD_KEY = '__aichat_genspark_moa_image_autosettings_v1__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  const TARGET_TYPE = 'moa_generate_image';
  const TARGET_QUALITY_PATTERNS = [/\b2\s*k\b/i, /\b2048\b/i, /\b2048\s*x\s*2048\b/i];

  const SETTINGS_TEXTS = ['setting', 'settings', '设置', '参数', '选项', '偏好', '配置'];
  const QUALITY_LABEL_TEXTS = ['quality', 'resolution', 'size', '画质', '分辨率', '尺寸'];
  const LOG_PREFIX = '[ai-chat] genspark image settings';
  const logged = new Set();

  function logOnce(key, ...args) {
    if (logged.has(key)) return;
    logged.add(key);
    // eslint-disable-next-line no-console
    console.log(LOG_PREFIX, ...args);
  }

  function getTopHref() {
    try {
      return typeof window.top?.location?.href === 'string' ? window.top.location.href : null;
    } catch {
      return null;
    }
  }

  function isTargetPage() {
    const topHref = getTopHref();
    try {
      const u = new URL(topHref || location.href);
      if (u.hostname !== 'www.genspark.ai') return false;
      if (!u.pathname.startsWith('/agents')) return false;
      return String(u.searchParams.get('type') || '').toLowerCase() === TARGET_TYPE;
    } catch {
      return false;
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitFor(cond, { timeoutMs = 15000, intervalMs = 80 } = {}) {
    const deadline = Date.now() + timeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const v = (() => {
        try {
          return cond();
        } catch {
          return null;
        }
      })();
      if (v) return v;
      if (Date.now() > deadline) return null;
      await sleep(intervalMs);
    }
  }

  function normText(v) {
    return String(v || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function textOf(el) {
    if (!el) return '';
    const t = normText(el.textContent || '');
    if (t) return t;
    const aria = normText(el.getAttribute?.('aria-label') || '');
    if (aria) return aria;
    const title = normText(el.getAttribute?.('title') || '');
    if (title) return title;
    return '';
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function matches2kText(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    for (const re of TARGET_QUALITY_PATTERNS) {
      try {
        if (re.test(t)) return true;
      } catch {}
    }
    return false;
  }

  function realClick(el) {
    if (!el || !(el instanceof Element)) return false;
    try {
      el.scrollIntoView?.({ block: 'center', inline: 'center' });
    } catch {}
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const events = [
        new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy }),
        new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }),
        new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy }),
        new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy })
      ];
      for (const ev of events) el.dispatchEvent(ev);
    } catch {}
    try {
      el.click();
      return true;
    } catch {
      return false;
    }
  }

  function findFirstVisible(root, selector) {
    try {
      const els = root.querySelectorAll(selector);
      for (const el of els) {
        if (isVisible(el)) return el;
      }
    } catch {}
    return null;
  }

  function findByTexts(root, texts, { selector = null } = {}) {
    const wanted = (Array.isArray(texts) ? texts : []).map((t) => String(t || '').toLowerCase()).filter(Boolean);
    if (!wanted.length) return null;

    const sel =
      selector ||
      [
        'button',
        '[role="button"]',
        '[role="menuitem"]',
        '[role="option"]',
        '[role="radio"]',
        'label',
        'a'
      ].join(',');

    let nodes = [];
    try {
      nodes = Array.from(root.querySelectorAll(sel));
    } catch {
      nodes = [];
    }

    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const t = textOf(el).toLowerCase();
      if (!t) continue;
      for (const w of wanted) {
        if (t.includes(w)) return el;
      }
    }
    return null;
  }

  function findDialogRoots() {
    const out = [];
    try {
      for (const el of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) {
        if (isVisible(el)) out.push(el);
      }
    } catch {}
    if (out.length) return out;

    try {
      const fallback = document.querySelectorAll(
        [
          'div[class*="modal" i]',
          'div[class*="dialog" i]',
          'div[class*="popover" i]',
          'div[class*="drawer" i]',
          'div[class*="sheet" i]'
        ].join(',')
      );
      for (const el of fallback) {
        if (isVisible(el)) out.push(el);
      }
    } catch {}
    return out;
  }

  function getAttrLower(el, name) {
    try {
      return String(el.getAttribute(name) || '').toLowerCase();
    } catch {
      return '';
    }
  }

  function findSettingsButtons() {
    const out = [];
    const seen = new Set();

    const selectors = [
      'button[aria-label*="setting" i]',
      'button[title*="setting" i]',
      '[role="button"][aria-label*="setting" i]',
      '[role="button"][title*="setting" i]',
      'button[data-testid*="setting" i]',
      '[role="button"][data-testid*="setting" i]',
      'button[id*="setting" i]',
      '[role="button"][id*="setting" i]',
      'button[class*="setting" i]',
      '[role="button"][class*="setting" i]'
    ];

    for (const sel of selectors) {
      let els = [];
      try {
        els = Array.from(document.querySelectorAll(sel));
      } catch {
        els = [];
      }
      for (const el of els) {
        if (!isVisible(el)) continue;
        if (seen.has(el)) continue;
        seen.add(el);
        out.push(el);
      }
    }

    const byText = findByTexts(document, SETTINGS_TEXTS);
    if (byText && isVisible(byText) && !seen.has(byText)) {
      seen.add(byText);
      out.push(byText);
    }

    // 兜底：找带 setting 字样属性的 icon button
    try {
      const iconBtns = Array.from(document.querySelectorAll('button,[role="button"]'));
      for (const el of iconBtns) {
        if (!isVisible(el)) continue;
        if (seen.has(el)) continue;
        const bag = [
          getAttrLower(el, 'aria-label'),
          getAttrLower(el, 'title'),
          getAttrLower(el, 'data-testid'),
          getAttrLower(el, 'id'),
          getAttrLower(el, 'class')
        ]
          .filter(Boolean)
          .join(' ');
        if (!bag.includes('setting')) continue;
        seen.add(el);
        out.push(el);
      }
    } catch {}

    return out;
  }

  function readToggleState(btn) {
    if (!btn || !(btn instanceof Element)) return null;
    const ariaExpanded = String(btn.getAttribute('aria-expanded') || '').toLowerCase();
    if (ariaExpanded === 'true') return true;
    if (ariaExpanded === 'false') return false;
    const ariaPressed = String(btn.getAttribute('aria-pressed') || '').toLowerCase();
    if (ariaPressed === 'true') return true;
    if (ariaPressed === 'false') return false;
    const ariaSelected = String(btn.getAttribute('aria-selected') || '').toLowerCase();
    if (ariaSelected === 'true') return true;
    if (ariaSelected === 'false') return false;
    const dataState = String(btn.getAttribute('data-state') || '').toLowerCase();
    if (dataState === 'open' || dataState === 'opened' || dataState === 'expanded') return true;
    if (dataState === 'closed' || dataState === 'collapsed') return false;
    return null;
  }

  function looksLikeSettingsPanelOpen() {
    try {
      for (const root of findDialogRoots()) {
        const t = String(root.textContent || '').toLowerCase();
        if (!t) continue;
        if (matches2kText(t)) return true;
        for (const w of QUALITY_LABEL_TEXTS) {
          const lw = String(w || '').toLowerCase();
          if (lw && t.includes(lw)) return true;
        }
      }
    } catch {}

    try {
      // Some versions render settings as an inline panel (not a dialog).
      const label = findByTexts(document, QUALITY_LABEL_TEXTS, { selector: 'span,div,label,button,[role="button"]' });
      if (label && isVisible(label)) return true;
    } catch {}

    return false;
  }

  async function ensureSettingsOpen() {
    if (looksLikeSettingsPanelOpen()) return true;
    const btns = findSettingsButtons();
    if (!btns.length) return false;

    for (const btn of btns.slice(0, 6)) {
      const state = readToggleState(btn);
      if (state === true) return true;
      realClick(btn);
      await sleep(240);
      if (looksLikeSettingsPanelOpen()) return true;
    }

    return looksLikeSettingsPanelOpen();
  }

  function findQualityTrigger(root) {
    const labelEl = findByTexts(root, QUALITY_LABEL_TEXTS, { selector: 'span,div,label,button,[role="button"]' });
    if (!labelEl) return null;
    const clickable = labelEl.closest?.('button,[role="button"]');
    if (clickable && isVisible(clickable)) return clickable;
    const container = labelEl.closest?.('div,section,li,label') || labelEl.parentElement;
    if (!container) return null;
    const btn = findFirstVisible(container, 'button,[role="button"]');
    return btn && isVisible(btn) ? btn : null;
  }

  function find2kOption(root) {
    const selector = [
      'button',
      '[role="option"]',
      '[role="menuitem"]',
      '[role="radio"]',
      '[role="button"]',
      '[role="tab"]',
      '[tabindex]',
      'label',
      'option'
    ].join(',');
    let nodes = [];
    try {
      nodes = Array.from(root.querySelectorAll(selector));
    } catch {
      nodes = [];
    }

    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const t = textOf(el);
      if (!t) continue;
      if (matches2kText(t)) return el;
    }

    // 兜底：弹窗/抽屉里可能是 div/span 无 role，仅靠文字可点击
    if (root !== document) {
      try {
        const texts = Array.from(root.querySelectorAll('div,span'));
        for (const el of texts) {
          if (!isVisible(el)) continue;
          const t = textOf(el);
          if (!matches2kText(t)) continue;
          const clickable = el.closest?.('button,[role="button"],[role="option"],[role="menuitem"],[role="radio"],[tabindex],a') || el;
          if (isVisible(clickable)) return clickable;
        }
      } catch {}
    }

    return null;
  }

  function find2kByAttribute(root) {
    const ATTRS = ['data-value', 'data-size', 'data-resolution', 'data-quality', 'value', 'aria-label', 'title'];
    let nodes = [];
    try {
      nodes = Array.from(
        root.querySelectorAll('[data-value],[data-size],[data-resolution],[data-quality],[value],[aria-label],[title]')
      );
    } catch {
      nodes = [];
    }

    for (const el of nodes) {
      if (!isVisible(el)) continue;
      let matched = false;
      for (const a of ATTRS) {
        const v = el.getAttribute?.(a);
        if (!v) continue;
        if (matches2kText(v)) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
      const clickable =
        el.closest?.('button,[role="button"],[role="option"],[role="menuitem"],[role="radio"],[tabindex],label,a') || el;
      if (isVisible(clickable)) return clickable;
    }
    return null;
  }

  function apply2kOnSelectIfAny(root) {
    try {
      const selects = root.querySelectorAll('select');
      for (const sel of selects) {
        if (!isVisible(sel)) continue;
        const options = Array.from(sel.options || []);
        const opt = options.find((o) => matches2kText(textOf(o)));
        if (!opt) continue;
        if (sel.value !== opt.value) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      }
    } catch {}
    return false;
  }

  async function tryOpenSettingsAndSelect2k() {
    if (!isTargetPage()) return false;

    // 1) 进入页面先尽量打开 Setting
    logOnce('loaded', 'loaded');
    logOnce(`target:${location.pathname}${location.search}`, 'target page');

    const opened = await ensureSettingsOpen();
    if (!opened) logOnce(`no_settings_btn:${location.pathname}${location.search}`, 'settings not opened yet');
    await sleep(180);

    // 2) 如果需要先展开 Quality 下拉/弹层，尽量做一次触发
    for (const root of [...findDialogRoots(), document]) {
      const trigger = findQualityTrigger(root);
      if (trigger) {
        realClick(trigger);
        logOnce(`clicked_quality:${location.pathname}${location.search}`, 'clicked quality trigger');
        break;
      }
    }
    await sleep(120);

    // 3) 选择 2K
    for (const root of [...findDialogRoots(), document]) {
      if (apply2kOnSelectIfAny(root)) return true;
      const opt = find2kOption(root);
      if (opt) {
        realClick(opt);
        logOnce(`applied:${location.pathname}${location.search}`, 'selected 2K');
        return true;
      }
      const opt2 = find2kByAttribute(root);
      if (opt2) {
        realClick(opt2);
        logOnce(`applied_attr:${location.pathname}${location.search}`, 'selected 2K (by attribute)');
        return true;
      }
    }

    return false;
  }

  async function boot() {
    await waitFor(() => document.documentElement, { timeoutMs: 15000 });

    let lastUrl = '';
    let appliedForUrl = false;
    let running = false;

    async function tick() {
      if (running) return;
      running = true;
      try {
        const url = String(location.href || '');
        if (url !== lastUrl) {
          lastUrl = url;
          appliedForUrl = false;
        }
        if (!isTargetPage()) return;
        if (appliedForUrl) return;
        const ok = await tryOpenSettingsAndSelect2k();
        if (ok) appliedForUrl = true;
      } finally {
        running = false;
      }
    }

    // 初次进入尽快执行一次
    void tick();
    setInterval(tick, 800);
  }

  void boot();
})();
