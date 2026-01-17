(() => {
  'use strict';

  const GUARD_KEY = '__aichat_genspark_moa_image_autosettings_v1__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  const TARGET_TYPE = 'moa_generate_image';
  const TARGET_QUALITY_TEXT = '2k';

  const SETTINGS_TEXTS = ['setting', 'settings', '设置', '参数', '选项', '偏好', '配置'];
  const QUALITY_LABEL_TEXTS = ['quality', 'resolution', 'size', '画质', '分辨率', '尺寸'];

  function isTargetPage() {
    try {
      const u = new URL(location.href);
      if (u.hostname !== 'www.genspark.ai') return false;
      if (!u.pathname.startsWith('/agents')) return false;
      return u.searchParams.get('type') === TARGET_TYPE;
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

  function findSettingsButton() {
    const selectors = [
      'button[aria-label*="setting" i]',
      'button[title*="setting" i]',
      '[role="button"][aria-label*="setting" i]',
      '[role="button"][title*="setting" i]',
      'button[data-testid*="setting" i]',
      '[role="button"][data-testid*="setting" i]'
    ];
    for (const sel of selectors) {
      const el = findFirstVisible(document, sel);
      if (el) return el;
    }
    return findByTexts(document, SETTINGS_TEXTS);
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
      const t = textOf(el).toLowerCase();
      if (!t) continue;
      if (t.includes(TARGET_QUALITY_TEXT)) return el;
    }
    return null;
  }

  function apply2kOnSelectIfAny(root) {
    try {
      const selects = root.querySelectorAll('select');
      for (const sel of selects) {
        if (!isVisible(sel)) continue;
        const options = Array.from(sel.options || []);
        const opt = options.find((o) => textOf(o).toLowerCase().includes(TARGET_QUALITY_TEXT));
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

    // 1) 如果设置面板已开，直接找 2K 选项
    for (const root of [...findDialogRoots(), document]) {
      if (apply2kOnSelectIfAny(root)) return true;
      const opt = find2kOption(root);
      if (opt) {
        realClick(opt);
        return true;
      }
    }

    // 2) 尝试打开 Setting
    const settingsBtn = findSettingsButton();
    if (settingsBtn) realClick(settingsBtn);
    await sleep(200);

    // 3) 如果需要先展开 Quality 下拉/弹层，尽量做一次触发
    for (const root of [...findDialogRoots(), document]) {
      const trigger = findQualityTrigger(root);
      if (trigger) {
        realClick(trigger);
        break;
      }
    }
    await sleep(120);

    // 4) 再找 2K
    for (const root of [...findDialogRoots(), document]) {
      if (apply2kOnSelectIfAny(root)) return true;
      const opt = find2kOption(root);
      if (opt) {
        realClick(opt);
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

