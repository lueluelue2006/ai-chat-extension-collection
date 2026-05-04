(() => {
  'use strict';

  const STATE_KEY = '__aichat_genspark_moa_image_autosettings_state_v1__';
  const runtimeDisposers = [];
  const runtimeState = {
    disposed: false,
    disposeRuntime() {
      if (runtimeState.disposed) return;
      runtimeState.disposed = true;
      for (const dispose of runtimeDisposers.splice(0)) {
        try { dispose(); } catch {}
      }
      try {
        document.documentElement?.removeAttribute?.('data-aichat-genspark-moa-image-autosettings');
      } catch {}
    }
  };

  try {
    const prev = window[STATE_KEY];
    if (prev && typeof prev.disposeRuntime === 'function') prev.disposeRuntime();
  } catch {}
  try {
    Object.defineProperty(window, STATE_KEY, { value: runtimeState, configurable: true, enumerable: false, writable: false });
  } catch {
    try { window[STATE_KEY] = runtimeState; } catch {}
  }
  try {
    document.documentElement?.setAttribute?.('data-aichat-genspark-moa-image-autosettings', '1');
  } catch {}

  const TARGET_TYPES = new Set(['moa_generate_image', 'image_generation_agent']);
  const TARGET_MODEL_TEXT = 'GPT Image 2';
  const TARGET_MODEL_VALUE = 'gpt-image-2';
  const TARGET_IMAGE_SIZE_VALUE = '4k';
  const TARGET_QUALITY_VALUE = 'medium';
  const TARGET_IMAGE_SIZE_PATTERNS = [/\b4\s*k\b/i, /\b4096\b/i, /\b4096\s*x\s*4096\b/i];
  const TARGET_QUALITY_PATTERNS = [/\bmedium\b/i, /中等/i];
  const TARGET_MAX_ATTEMPTS_PER_URL = 30;

  const SETTINGS_TEXTS = ['setting', 'settings', '设置', '参数', '选项', '偏好', '配置'];
  const QUALITY_LABEL_TEXTS = ['quality', 'resolution', 'size', '画质', '分辨率', '尺寸'];
  const LOG_PREFIX = '[ai-chat] genspark image settings';
  const logged = new Set();

  function addRuntimeDisposer(dispose) {
    if (typeof dispose !== 'function') return () => void 0;
    runtimeDisposers.push(dispose);
    return dispose;
  }

  function interval(fn, ms) {
    if (typeof fn !== 'function') return 0;
    let id = 0;
    try {
      id = window.setInterval(fn, ms);
    } catch {
      return 0;
    }
    addRuntimeDisposer(() => {
      try { window.clearInterval(id); } catch {}
    });
    return id;
  }

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
      const type = String(u.searchParams.get('type') || '').toLowerCase();
      if (TARGET_TYPES.has(type)) return true;
      if (type) return false;
      return !!document.querySelector('.main-inner.image_generation_agent, .main-inner.moa_generate_image');
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

  function hasPointerCursor(el) {
    try {
      return getComputedStyle(el).cursor === 'pointer';
    } catch {
      return false;
    }
  }

  function matchesAnyPattern(text, patterns) {
    const t = String(text || '').trim();
    if (!t) return false;
    for (const re of patterns || []) {
      try {
        if (re.test(t)) return true;
      } catch {}
    }
    return false;
  }

  function matchesImageSizeText(text) {
    return matchesAnyPattern(text, TARGET_IMAGE_SIZE_PATTERNS);
  }

  function matchesQualityText(text) {
    return matchesAnyPattern(text, TARGET_QUALITY_PATTERNS);
  }

  function matchesTargetModelText(text) {
    return normText(text).toLowerCase() === TARGET_MODEL_TEXT.toLowerCase();
  }

  function getGensparkPinia() {
    try {
      const app = typeof window.useNuxtApp === 'function' ? window.useNuxtApp() : null;
      const provides = app?.vueApp?._context?.provides || {};
      for (const key of Reflect.ownKeys(provides)) {
        const candidate = provides[key];
        if (candidate && typeof candidate === 'object' && candidate._s && candidate.state) return candidate;
      }
    } catch {}
    return null;
  }

  function getGensparkStore(id) {
    try {
      return getGensparkPinia()?._s?.get?.(id) || null;
    } catch {}
    return null;
  }

  function setLocalReflectionDisabled() {
    try {
      if (localStorage.getItem('moa-image-reflectionEnabled') !== 'false') {
        localStorage.setItem('moa-image-reflectionEnabled', 'false');
      }
    } catch {}
  }

  function applyPiniaImageDefaults() {
    if (!isTargetPage()) return false;

    const imageStore = getGensparkStore('image-select');
    const paramsStore = getGensparkStore('model-params');
    if (!imageStore && !paramsStore) return false;

    let touched = false;

    try {
      if (imageStore && imageStore.modelsSelected !== TARGET_MODEL_VALUE && typeof imageStore.setModelsSelected === 'function') {
        imageStore.setModelsSelected(TARGET_MODEL_VALUE);
        touched = true;
      }
    } catch {}

    try {
      if (
        paramsStore &&
        paramsStore.selectedImageSize !== TARGET_IMAGE_SIZE_VALUE &&
        typeof paramsStore.setSelectedImageSize === 'function'
      ) {
        paramsStore.setSelectedImageSize(TARGET_IMAGE_SIZE_VALUE);
        touched = true;
      }
    } catch {}

    try {
      if (
        paramsStore &&
        paramsStore.selectedImageQuality !== TARGET_QUALITY_VALUE &&
        typeof paramsStore.setSelectedImageQuality === 'function'
      ) {
        paramsStore.setSelectedImageQuality(TARGET_QUALITY_VALUE);
        touched = true;
      }
    } catch {}

    try {
      if (imageStore && imageStore.reflectionEnabled !== false && typeof imageStore.setReflectionEnabled === 'function') {
        imageStore.setReflectionEnabled(false);
        touched = true;
      }
    } catch {}

    try {
      if (paramsStore && paramsStore.reflectionEnabled !== false && typeof paramsStore.setReflectionEnabled === 'function') {
        paramsStore.setReflectionEnabled(false);
        touched = true;
      }
    } catch {}

    setLocalReflectionDisabled();
    return true;
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
      const base = { bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: cy, button: 0 };
      const pointerDown = Object.assign({}, base, { pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 });
      const pointerUp = Object.assign({}, base, { pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 });
      const events = [
        new PointerEvent('pointerover', pointerDown),
        new MouseEvent('mouseover', pointerDown),
        new PointerEvent('pointerenter', pointerDown),
        new MouseEvent('mouseenter', pointerDown),
        new PointerEvent('pointerdown', pointerDown),
        new MouseEvent('mousedown', pointerDown),
        new PointerEvent('pointerup', pointerUp),
        new MouseEvent('mouseup', pointerUp),
        new MouseEvent('click', pointerUp)
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

    // Genspark AI Image page uses a non-semantic "Setting" selector (div with pointer cursor).
    const preferredSelectors = [
      '.models-selected.aspect-ratio-selector',
      '.models-selected.aspect-ratio-selector .model-selected',
      '.aspect-ratio-selector',
      '.settings-selector',
      '.settings-trigger'
    ];
    for (const sel of preferredSelectors) {
      let els = [];
      try {
        els = Array.from(document.querySelectorAll(sel));
      } catch {
        els = [];
      }
      for (const el of els) {
        if (!isVisible(el)) continue;
        if (!hasPointerCursor(el)) continue;
        if (seen.has(el)) continue;
        seen.add(el);
        out.push(el);
      }
    }

    try {
      const roots = [
        document.querySelector('.controls'),
        document.querySelector('.options-wrapper'),
        document.querySelector('.input-wrapper-wrapper'),
        document.querySelector('.main-inner.j-chat-agent'),
        document
      ].filter(Boolean);

      const wanted = SETTINGS_TEXTS.map((t) => String(t || '').toLowerCase()).filter(Boolean);
      for (const root of roots) {
        let nodes = [];
        try {
          nodes = Array.from(root.querySelectorAll('div,span,button,[role="button"],[tabindex],a'));
        } catch {
          nodes = [];
        }
        for (const el of nodes) {
          if (!isVisible(el)) continue;
          if (!hasPointerCursor(el)) continue;
          const t = textOf(el).toLowerCase();
          if (!t) continue;
          if (!wanted.some((w) => t.includes(w))) continue;

          // Avoid clicking huge containers that merely contain the word.
          const rect = el.getBoundingClientRect();
          if (rect.width > window.innerWidth * 0.85 || rect.height > window.innerHeight * 0.85) continue;
          if (t.length > 30) continue;

          if (seen.has(el)) continue;
          seen.add(el);
          out.push(el);
        }
      }
    } catch {}

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
        if (matchesImageSizeText(t)) return true;
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

  function isClickableLike(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.tagName === 'BUTTON' || el.tagName === 'A') return true;
    const role = String(el.getAttribute('role') || '').toLowerCase();
    if (role === 'button' || role === 'option' || role === 'menuitem' || role === 'radio') return true;
    if (el.hasAttribute('tabindex')) return true;
    return hasPointerCursor(el);
  }

  function getClickableForText(el) {
    if (!el || !(el instanceof Element)) return null;
    const clickable =
      el.closest?.(
        [
          'button',
          '[role="button"]',
          '[role="option"]',
          '[role="menuitem"]',
          '[role="radio"]',
          '[tabindex]',
          'label',
          'a',
          '.model-button',
          '.model-selected',
          '.reflection-toggle',
          '.setting-button',
          '.style-selector',
          '.camera-control-selector'
        ].join(',')
      ) || el;
    return isClickableLike(clickable) ? clickable : null;
  }

  function findTextOption(root, matcher) {
    if (!root || typeof matcher !== 'function') return null;
    const selector = [
      'button',
      '[role="option"]',
      '[role="menuitem"]',
      '[role="radio"]',
      '[role="button"]',
      '[role="tab"]',
      '[tabindex]',
      'label',
      'option',
      'div',
      'span'
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
      if (t.length > 80) continue;
      if (!matcher(t)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.85 || rect.height > window.innerHeight * 0.85) continue;
      const clickable = getClickableForText(el);
      if (clickable && isVisible(clickable)) return clickable;
    }

    return null;
  }

  function findOptionByAttribute(root, matcher) {
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
        if (matcher(v)) {
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

  function applySelectOptionIfAny(root, matcher) {
    try {
      const selects = root.querySelectorAll('select');
      for (const sel of selects) {
        if (!isVisible(sel)) continue;
        const options = Array.from(sel.options || []);
        const opt = options.find((o) => matcher(textOf(o)));
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

  function getSelectedModelButton() {
    try {
      const buttons = Array.from(document.querySelectorAll('.model-button'));
      for (const el of buttons) {
        if (!isVisible(el)) continue;
        const t = textOf(el);
        if (!t) continue;
        if (/setting|style|camera|prompt|assets/i.test(t)) continue;
        if (/image|banana|gpt/i.test(t)) return el;
      }
    } catch {}
    return null;
  }

  async function ensureTargetModelSelected() {
    const current = getSelectedModelButton();
    if (current && matchesTargetModelText(textOf(current))) return true;
    if (!current) return false;

    realClick(current);
    await sleep(240);

    for (const root of [...findDialogRoots(), document]) {
      const opt = findTextOption(root, matchesTargetModelText);
      if (opt && opt !== current && !current.contains(opt)) {
        realClick(opt);
        logOnce(`model:${location.pathname}${location.search}`, `selected ${TARGET_MODEL_TEXT}`);
        await sleep(360);
        return true;
      }
    }

    return matchesTargetModelText(textOf(getSelectedModelButton()));
  }

  function findAutoPromptToggle() {
    try {
      const direct = Array.from(document.querySelectorAll('.reflection-toggle, [class*="reflection-toggle"]')).find((el) => {
        if (!isVisible(el)) return false;
        return /auto\s*prompt/i.test(textOf(el));
      });
      if (direct) return direct;
    } catch {}

    try {
      const label = findTextOption(document, (text) => /^auto\s*prompt$/i.test(normText(text)));
      const toggle = label?.closest?.('.reflection-toggle, [class*="reflection-toggle"], button, [role="button"], [tabindex]');
      if (toggle && isVisible(toggle)) return toggle;
    } catch {}

    return null;
  }

  function isAutoPromptEnabled(toggle) {
    if (!toggle || !(toggle instanceof Element)) return false;
    const cls = String(toggle.className || '').toLowerCase();
    if (/\bactive\b/.test(cls)) return true;
    const ariaPressed = String(toggle.getAttribute('aria-pressed') || '').toLowerCase();
    if (ariaPressed === 'true') return true;
    const ariaSelected = String(toggle.getAttribute('aria-selected') || '').toLowerCase();
    if (ariaSelected === 'true') return true;
    const dataState = String(toggle.getAttribute('data-state') || '').toLowerCase();
    if (dataState === 'on' || dataState === 'active' || dataState === 'checked') return true;
    return false;
  }

  async function ensureAutoPromptOff() {
    applyPiniaImageDefaults();
    await sleep(80);

    const toggle = findAutoPromptToggle();
    if (!toggle) return false;
    if (!isAutoPromptEnabled(toggle)) return true;
    realClick(toggle);
    logOnce(`auto_prompt_off:${location.pathname}${location.search}`, 'disabled Auto Prompt');
    await sleep(180);
    return !isAutoPromptEnabled(toggle);
  }

  async function selectSettingOption(matcher, logKey, logText) {
    for (const root of [...findDialogRoots(), document]) {
      if (applySelectOptionIfAny(root, matcher)) {
        logOnce(`${logKey}_select:${location.pathname}${location.search}`, logText);
        return true;
      }
      const opt = findTextOption(root, matcher);
      if (opt) {
        realClick(opt);
        logOnce(`${logKey}:${location.pathname}${location.search}`, logText);
        await sleep(160);
        return true;
      }
      const opt2 = findOptionByAttribute(root, matcher);
      if (opt2) {
        realClick(opt2);
        logOnce(`${logKey}_attr:${location.pathname}${location.search}`, `${logText} (by attribute)`);
        await sleep(160);
        return true;
      }
    }
    return false;
  }

  async function tryApplyImageDefaults() {
    if (!isTargetPage()) return false;

    // Prefer Genspark's own Pinia stores when this script runs in MAIN world.
    applyPiniaImageDefaults();
    await sleep(120);

    // 1) 新版 AI Image 入口默认先切到 GPT Image 2
    logOnce('loaded', 'loaded');
    logOnce(`target:${location.pathname}${location.search}`, 'target page');
    const modelOk = await ensureTargetModelSelected();
    applyPiniaImageDefaults();

    // 2) 进入页面先尽量打开 Setting
    const opened = await ensureSettingsOpen();
    if (!opened) logOnce(`no_settings_btn:${location.pathname}${location.search}`, 'settings not opened yet');
    applyPiniaImageDefaults();
    await sleep(180);

    // 3) 如果需要先展开 Quality 下拉/弹层，尽量做一次触发
    for (const root of [...findDialogRoots(), document]) {
      const trigger = findQualityTrigger(root);
      if (trigger) {
        realClick(trigger);
        logOnce(`clicked_quality:${location.pathname}${location.search}`, 'clicked quality trigger');
        break;
      }
    }
    await sleep(120);

    // 4) 选择 4K + Medium，并关闭 Auto Prompt
    const sizeOk = await selectSettingOption(matchesImageSizeText, 'image_size', 'selected 4K');
    const qualityOk = await selectSettingOption(matchesQualityText, 'quality', 'selected Medium');
    const autoPromptOk = await ensureAutoPromptOff();
    applyPiniaImageDefaults();

    return !!(modelOk && opened && sizeOk && qualityOk && autoPromptOk);
  }

  async function boot() {
    await waitFor(() => document.documentElement, { timeoutMs: 15000 });

    let lastUrl = '';
    let appliedForUrl = false;
    let attemptsForUrl = 0;
    let running = false;

    async function tick() {
      if (runtimeState.disposed) return;
      if (running) return;
      running = true;
      try {
        const url = String(location.href || '');
        if (url !== lastUrl) {
          lastUrl = url;
          appliedForUrl = false;
          attemptsForUrl = 0;
        }
        if (!isTargetPage()) return;
        if (appliedForUrl) return;
        if (attemptsForUrl >= TARGET_MAX_ATTEMPTS_PER_URL) return;
        attemptsForUrl += 1;
        const ok = await tryApplyImageDefaults();
        if (ok) appliedForUrl = true;
      } finally {
        running = false;
      }
    }

    // 初次进入尽快执行一次
    void tick();
    interval(tick, 800);
  }

  void boot();
})();
