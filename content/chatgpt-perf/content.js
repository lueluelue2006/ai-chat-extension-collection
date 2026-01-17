(() => {
  'use strict';

  const EXT_VERSION = '0.1.20';

  const STORAGE_KEY = 'cgpt_perf_mv3_settings_v1';
  const BENCH_KEY = 'cgpt_perf_mv3_bench_arm_v1';

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    virtualizeOffscreen: true,
    virtualizeMarkdownBlocks: true,
    optimizeHeavyBlocks: true,
    disableAnimations: true,
    boostDuringInput: true,
    showOverlay: false,
    rootMarginPx: 1200,
  });

  const ROOT_ATTR = 'data-cgptperf';
  const ROOT_VER_ATTR = 'data-cgptperf-ver';
  const ROOT_ENABLED_ATTR = 'data-cgptperf-enabled';
  const ROOT_OFFSCREEN_ATTR = 'data-cgptperf-offscreen';
  const ROOT_BLOCKS_ATTR = 'data-cgptperf-blocks';
  const ROOT_HEAVY_ATTR = 'data-cgptperf-heavy';
  const ROOT_NOANIM_ATTR = 'data-cgptperf-noanim';

  const OFFSCREEN_CLASS = 'cgptperf-offscreen';
  const INTRINSIC_VAR = '--cgptperf-intrinsic-size';
  const UI_ID = 'cgptperf-ui';
  const UI_TOGGLE_CLASS = 'cgptperf-toggle';
  const UI_PANEL_CLASS = 'cgptperf-panel';
  const TOAST_ID = 'cgptperf-toast';
  const COPY_UNFREEZE_ATTR = 'data-cgptperf-copy-unfreeze';

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    storageArea: null,
    storageAreaName: 'sync',
    benchArmed: false,
    benchTimer: 0,
    lastActionBoostAt: 0,
    reconcileToken: 0,
    reconcileIdx: 0,
    reconcileArticles: null,
    reconcileFirst: 0,
    reconcileLast: -1,
    io: null,
    containerMo: null,
    routeTimer: null,
    containerEl: null,
    observed: new WeakSet(),
    scanScheduled: false,
    observeQueue: [],
    lastHeights: new WeakMap(),
    defaultIntrinsic: 420,
    uiCloseHandler: null,
    ioMarginPx: DEFAULT_SETTINGS.rootMarginPx,
    boostActive: false,
    boostFocusTimer: 0,
    boostActionTimer: 0,
    ioRestartTimer: 0,
    boostListenersAttached: false,
    rootAttrMo: null,
  };

  function clampInt(n, min, max) {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }

  function isTextInputElement(el) {
    if (!(el instanceof Element)) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const type = String(el.type || '').toLowerCase();
      return type === 'text' || type === 'search' || type === 'url' || type === 'email' || type === 'tel' || type === 'password';
    }
    if (el instanceof HTMLElement && el.isContentEditable) return true;
    return false;
  }

  function boostMarginPx() {
    // During editing/sending, we want aggressive pruning to reduce layout/paint work on huge conversations.
    return clampInt(window.innerHeight * 0.22, 80, 360);
  }

  function effectiveRootMarginPx() {
    const base = Number.isFinite(Number(state.settings.rootMarginPx)) ? Math.max(0, Number(state.settings.rootMarginPx)) : DEFAULT_SETTINGS.rootMarginPx;
    if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return base;
    if (!state.settings.boostDuringInput) return base;
    if (!state.boostActive) return base;
    return Math.min(base, boostMarginPx());
  }

  function sanitizeSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SETTINGS.enabled,
      virtualizeOffscreen:
        typeof s.virtualizeOffscreen === 'boolean' ? s.virtualizeOffscreen : DEFAULT_SETTINGS.virtualizeOffscreen,
      virtualizeMarkdownBlocks:
        typeof s.virtualizeMarkdownBlocks === 'boolean'
          ? s.virtualizeMarkdownBlocks
          : DEFAULT_SETTINGS.virtualizeMarkdownBlocks,
      optimizeHeavyBlocks:
        typeof s.optimizeHeavyBlocks === 'boolean' ? s.optimizeHeavyBlocks : DEFAULT_SETTINGS.optimizeHeavyBlocks,
      disableAnimations:
        typeof s.disableAnimations === 'boolean' ? s.disableAnimations : DEFAULT_SETTINGS.disableAnimations,
      boostDuringInput: typeof s.boostDuringInput === 'boolean' ? s.boostDuringInput : DEFAULT_SETTINGS.boostDuringInput,
      showOverlay: typeof s.showOverlay === 'boolean' ? s.showOverlay : DEFAULT_SETTINGS.showOverlay,
      rootMarginPx: Number.isFinite(Number(s.rootMarginPx))
        ? Math.max(0, Number(s.rootMarginPx))
        : DEFAULT_SETTINGS.rootMarginPx,
    };
  }

  function toggleRootAttr(attrName, enabled, value = '1') {
    const html = document.documentElement;
    if (!html) return;
    try {
      if (enabled) {
        if (html.getAttribute(attrName) !== value) html.setAttribute(attrName, value);
      } else if (html.hasAttribute(attrName)) {
        html.removeAttribute(attrName);
      }
    } catch {
      // ignore
    }
  }

  function applyRootAttrs() {
    const s = state.settings;
    toggleRootAttr(ROOT_ATTR, true, '1');
    toggleRootAttr(ROOT_VER_ATTR, true, EXT_VERSION);
    toggleRootAttr(ROOT_ENABLED_ATTR, s.enabled, '1');
    toggleRootAttr(ROOT_OFFSCREEN_ATTR, s.enabled && s.virtualizeOffscreen, '1');
    toggleRootAttr(ROOT_BLOCKS_ATTR, s.enabled && s.virtualizeMarkdownBlocks, '1');
    toggleRootAttr(ROOT_HEAVY_ATTR, s.enabled && s.optimizeHeavyBlocks, '1');
    toggleRootAttr(ROOT_NOANIM_ATTR, s.enabled && s.disableAnimations, '1');
  }

  function ensureRootAttrGuard() {
    if (state.rootAttrMo) return;
    const html = document.documentElement;
    if (!html || typeof MutationObserver !== 'function') return;

    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      Promise.resolve().then(() => {
        queued = false;
        applyRootAttrs();
      });
    };

    try {
      state.rootAttrMo = new MutationObserver(schedule);
      state.rootAttrMo.observe(html, {
        attributes: true,
        attributeFilter: [
          ROOT_ATTR,
          ROOT_VER_ATTR,
          ROOT_ENABLED_ATTR,
          ROOT_OFFSCREEN_ATTR,
          ROOT_BLOCKS_ATTR,
          ROOT_HEAVY_ATTR,
          ROOT_NOANIM_ATTR,
        ],
      });
    } catch {
      state.rootAttrMo = null;
    }

    schedule();
  }

  function ensureToast() {
    const existing = document.getElementById(TOAST_ID);
    if (existing instanceof HTMLElement) return existing;
    const el = document.createElement('div');
    el.id = TOAST_ID;
    el.dataset.show = '0';
    (document.documentElement || document.body).appendChild(el);
    return el;
  }

  function toast(text, durationMs = 1800) {
    const el = ensureToast();
    if (!(el instanceof HTMLElement)) return;
    el.textContent = String(text || '');
    el.dataset.show = '1';
    window.clearTimeout(el.__cgptperfTimer || 0);
    el.__cgptperfTimer = window.setTimeout(() => {
      el.dataset.show = '0';
    }, Math.max(400, durationMs));
  }

  function armBench(source = 'unknown') {
    state.benchArmed = true;
    if (state.benchTimer) window.clearTimeout(state.benchTimer);
    state.benchTimer = window.setTimeout(() => {
      state.benchTimer = 0;
      if (!state.benchArmed) return;
      state.benchArmed = false;
      toast('测量已取消（超时）');
    }, 12_000);
    const mode = state.settings.enabled ? '优化：开' : '优化：关';
    toast(`已开始测量（${source}｜${mode}）\n请点击“编辑/重试/停止”或在输入框按 Enter`,
      2400,
    );
  }

  function actionLabelFromTarget(target, fallback = '点击') {
    if (!(target instanceof Element)) return fallback;
    const btn = target.closest('button');
    if (!btn) return fallback;
    const aria = btn.getAttribute('aria-label') || '';
    const title = btn.getAttribute('title') || '';
    const testid = btn.getAttribute('data-testid') || '';
    const text = (btn.textContent || '').trim();
    const s = `${aria} ${title} ${testid} ${text}`.toLowerCase();
    if (/edit message|编辑/.test(s)) return '编辑';
    if (/regenerate|retry|try again|重新生成|重试/.test(s)) return '重试/重新生成';
    if (/stop generating|stop streaming|停止|pause|continue generating/.test(s)) return '停止/继续';
    if (/send|发送/.test(s)) return '发送';
    return fallback;
  }

  function isCopyButtonTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest(`#${UI_ID}`)) return false;
    const btn = target.closest('button');
    if (!btn) return false;
    const aria = btn.getAttribute('aria-label') || '';
    const title = btn.getAttribute('title') || '';
    const testid = btn.getAttribute('data-testid') || '';
    const text = (btn.textContent || '').trim();
    const s = `${aria} ${title} ${testid} ${text}`.toLowerCase();
    return /copy|复制/.test(s);
  }

  function prepareCopyUnfreeze(target) {
    if (!(target instanceof Element)) return;
    const article = target.closest('article');
    if (!(article instanceof HTMLElement)) return;

    // If an article is accidentally still treated as offscreen, clear it so the DOM is fully copyable.
    clearOffscreen(article);

    try {
      article.setAttribute(COPY_UNFREEZE_ATTR, '1');
      // Force style recalc so `content-visibility` overrides apply before ChatGPT reads the DOM.
      article.getBoundingClientRect();
    } catch {
      // ignore
    }

    window.setTimeout(() => {
      try {
        if (!article.isConnected) return;
        if (article.getAttribute(COPY_UNFREEZE_ATTR) === '1') article.removeAttribute(COPY_UNFREEZE_ATTR);
      } catch {
        // ignore
      }
    }, 1400);
  }

  function runBench(label, meta = {}) {
    if (!state.benchArmed) return;
    state.benchArmed = false;
    if (state.benchTimer) window.clearTimeout(state.benchTimer);
    state.benchTimer = 0;

    const t0 = performance.now();
    let longTaskTotal = 0;
    let longTaskCount = 0;
    let po = null;

    const supportsLongTask =
      typeof PerformanceObserver === 'function' &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes('longtask');

    if (supportsLongTask) {
      try {
        po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.startTime < t0) continue;
            longTaskTotal += entry.duration || 0;
            longTaskCount += 1;
          }
        });
        po.observe({ type: 'longtask', buffered: true });
      } catch {
        po = null;
      }
    }

    requestAnimationFrame(() => {
      const dt = Math.round(performance.now() - t0);
      if (po) {
        try {
          po.disconnect();
        } catch {
          // ignore
        }
      }
      const lt = Math.round(longTaskTotal);

      try {
        console.log('[cgptperf] bench', {
          label,
          dt,
          longTaskTotal: lt,
          longTaskCount,
          rootMarginPx: state.settings.rootMarginPx,
          boostDuringInput: state.settings.boostDuringInput,
          boostActive: state.boostActive,
          ...meta,
        });
      } catch {
        // ignore
      }

      toast(`测量：${label}\n输入到下一帧：${dt}ms\n长任务：${lt}ms（${longTaskCount} 次）`, 3200);
    });
  }

  function closeMenu() {
    const ui = document.getElementById(UI_ID);
    const toggle = ui?.querySelector?.(`button.${UI_TOGGLE_CLASS}`);
    const panel = ui?.querySelector?.(`.${UI_PANEL_CLASS}`);
    if (panel instanceof HTMLElement) {
      panel.hidden = true;
      toggle?.setAttribute?.('aria-expanded', 'false');
    }
    if (state.uiCloseHandler) {
      document.removeEventListener('pointerdown', state.uiCloseHandler, true);
      document.removeEventListener('keydown', state.uiCloseHandler, true);
      state.uiCloseHandler = null;
    }
  }

  function openMenu() {
    const ui = document.getElementById(UI_ID);
    if (!ui) return;
    const toggle = ui.querySelector(`button.${UI_TOGGLE_CLASS}`);
    const panel = ui.querySelector(`.${UI_PANEL_CLASS}`);
    if (!(panel instanceof HTMLElement)) return;
    panel.hidden = false;
    toggle?.setAttribute?.('aria-expanded', 'true');

    if (!state.uiCloseHandler) {
      state.uiCloseHandler = (e) => {
        if (e?.type === 'keydown') {
          if (e.key === 'Escape') closeMenu();
          return;
        }
        const target = e.target instanceof Node ? e.target : null;
        if (target && ui.contains(target)) return;
        closeMenu();
      };
      document.addEventListener('pointerdown', state.uiCloseHandler, true);
      document.addEventListener('keydown', state.uiCloseHandler, true);
    }
  }

  function findArticlesContainer() {
    const main = document.querySelector('main');
    if (!main) return null;
    const firstArticle = main.querySelector('article');
    const container = firstArticle?.parentElement;
    if (!(container instanceof HTMLElement)) return null;
    if (container.querySelectorAll(':scope > article').length === 0) return null;
    return container;
  }

  function clearOffscreen(article, measuredHeight) {
    if (!(article instanceof HTMLElement)) return;
    if (!article.classList.contains(OFFSCREEN_CLASS)) return;

    const h = Math.round(typeof measuredHeight === 'number' ? measuredHeight : 0);
    if (h > 0) state.lastHeights.set(article, h);

    article.classList.remove(OFFSCREEN_CLASS);
    article.style.removeProperty(INTRINSIC_VAR);
  }

  function setOffscreen(article, measuredHeight) {
    if (!(article instanceof HTMLElement)) return;
    if (article.classList.contains(OFFSCREEN_CLASS)) return;

    const h = Math.round(typeof measuredHeight === 'number' ? measuredHeight : 0);
    if (h > 0) state.lastHeights.set(article, h);
    const intrinsic = state.lastHeights.get(article) || state.defaultIntrinsic;

    article.style.setProperty(INTRINSIC_VAR, `1px ${intrinsic}px`);
    article.classList.add(OFFSCREEN_CLASS);
  }

  function updateDefaultIntrinsic(container) {
    if (!(container instanceof HTMLElement)) return;

    const heights = [];
    const topBound = -window.innerHeight * 0.8;
    const bottomBound = window.innerHeight * 1.8;
    const maxScan = 80;
    const want = 9;

    const collect = (start, step) => {
      let scanned = 0;
      for (let i = start; i >= 0 && i < container.children.length; i += step) {
        if (scanned >= maxScan) break;
        scanned += 1;
        const el = container.children[i];
        if (!(el instanceof HTMLElement)) continue;
        if (el.tagName !== 'ARTICLE') continue;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < topBound || rect.top > bottomBound) continue;
        const h = Math.round(rect.height);
        if (h > 0) heights.push(h);
        if (heights.length >= want) break;
      }
    };

    // Prefer sampling around the current viewport; scan from bottom then top.
    collect(container.children.length - 1, -1);
    if (heights.length < 3) collect(0, 1);

    if (heights.length) {
      heights.sort((a, b) => a - b);
      state.defaultIntrinsic = clampInt(heights[Math.floor(heights.length / 2)], 220, 1400);
    } else {
      state.defaultIntrinsic = clampInt(window.innerHeight * 0.65, 220, 900);
    }
  }

  function attachIo() {
    if (state.io) return;

    const marginPx = effectiveRootMarginPx();
    state.ioMarginPx = marginPx;
    state.io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const h = entry?.boundingClientRect?.height;
          if (entry.isIntersecting) clearOffscreen(entry.target, h);
          else setOffscreen(entry.target, h);
        }
      },
      { root: null, rootMargin: `${marginPx}px 0px ${marginPx}px 0px`, threshold: 0 },
    );
  }

  function detachIo() {
    try {
      state.io?.disconnect();
    } catch {
      // ignore
    }
    state.io = null;
    state.observed = new WeakSet();
    state.observeQueue = [];
  }

  function enqueueArticle(node) {
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName !== 'ARTICLE') return;
    if (state.observed.has(node)) return;
    state.observed.add(node);
    state.observeQueue.push(node);
  }

  function enqueueExistingArticles(container) {
    if (!(container instanceof HTMLElement)) return;
    const total = container.children.length;
    let i = 0;

    const run = (deadline) => {
      let processed = 0;
      while (i < total) {
        enqueueArticle(container.children[i]);
        i += 1;
        processed += 1;
        if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 5) break;
        if (!deadline && processed >= 250) break;
      }
      scheduleScan();
      if (i >= total) return;
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1200 });
      else setTimeout(run, 200);
    };

    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 0);
  }

  function scheduleScan() {
    if (state.scanScheduled) return;
    state.scanScheduled = true;

    const run = (deadline) => {
      state.scanScheduled = false;
      if (!state.io) return;

      let processed = 0;
      while (state.observeQueue.length) {
        const a = state.observeQueue.pop();
        if (!a) break;
        try {
          state.io.observe(a);
        } catch {
          // ignore
        }
        processed += 1;
        if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 5) break;
        if (!deadline && processed >= 250) break;
      }

      if (state.observeQueue.length) scheduleScan();
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      setTimeout(run, 200);
    }
  }

  function attachContainerObserver(container) {
    if (state.containerMo) return;
    state.containerMo = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          enqueueArticle(n);
        }
      }
      scheduleScan();
    });
    // Only observe list-level changes (avoid token-by-token streaming updates).
    state.containerMo.observe(container, { childList: true, subtree: false });
  }

  function detachContainerObserver() {
    try {
      state.containerMo?.disconnect();
    } catch {
      // ignore
    }
    state.containerMo = null;
  }

  function startVirtualization() {
    detachIo();
    detachContainerObserver();
    state.containerEl = null;

    attachIo();

    const container = findArticlesContainer();
    if (container) {
      state.containerEl = container;
      updateDefaultIntrinsic(container);
      attachContainerObserver(container);
      enqueueExistingArticles(container);
      return;
    }

    // Wait for SPA hydration
    let tries = 0;
    const tryFind = () => {
      if (!state.io) return;
      const c = findArticlesContainer();
      if (c) {
        state.containerEl = c;
        updateDefaultIntrinsic(c);
        attachContainerObserver(c);
        enqueueExistingArticles(c);
        return;
      }
      tries += 1;
      if (tries < 40) setTimeout(tryFind, 250);
    };
    setTimeout(tryFind, 250);
  }

  function stopVirtualization() {
    detachContainerObserver();
    detachIo();
    state.containerEl = null;
    document.querySelectorAll(`main article.${OFFSCREEN_CLASS}`).forEach((a) => clearOffscreen(a));
  }

  function ensureRouteWatch() {
    if (state.routeTimer) return;
    state.routeTimer = setInterval(() => {
      if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
      const current = findArticlesContainer();
      if (!current) return;
      if (state.containerEl && current === state.containerEl) return;
      // Container replaced due to SPA navigation; reattach cheaply (avoid clearing classes on a large DOM).
      startVirtualization();
    }, 2000);
  }

  function stopRouteWatch() {
    if (state.routeTimer) clearInterval(state.routeTimer);
    state.routeTimer = null;
  }

  function ensureUi() {
    if (!state.settings.showOverlay) {
      closeMenu();
      document.getElementById(UI_ID)?.remove();
      return;
    }
    if (document.getElementById(UI_ID)) return;

    const wrap = document.createElement('div');
    wrap.id = UI_ID;

    const mkBtn = (key, label, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.key = key;
      b.title = title;
      b.textContent = label;
      return b;
    };

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = UI_TOGGLE_CLASS;
    toggle.textContent = '性能';
    toggle.title = 'ChatGPT 性能菜单';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'menu');

    const panel = document.createElement('div');
    panel.className = UI_PANEL_CLASS;
    panel.hidden = true;

    const perfBtn = mkBtn('enabled', '性能：开', '切换性能优化总开关');
    const offBtn = mkBtn('virtualizeOffscreen', '离屏虚拟化：开', '切换离屏虚拟化（长对话更流畅）');
    const blocksBtn = mkBtn('virtualizeMarkdownBlocks', '分段虚拟化：关', '对超长单条消息按段落虚拟化（实验）');
    const heavyBtn = mkBtn('optimizeHeavyBlocks', '重内容优化：开', '切换重内容优化（pre/table/公式等）');
    const animBtn = mkBtn('disableAnimations', '动画：开', '切换动画/过渡（关闭可减少卡顿）');
    const boostBtn = mkBtn('boostDuringInput', '交互加速：开', '输入/编辑时临时收紧预加载，减少点击/发送卡顿');

    const marginRow = document.createElement('div');
    marginRow.className = 'cgptperf-row';
    const marginLabel = document.createElement('span');
    marginLabel.textContent = '预加载边距';
    const marginInput = document.createElement('input');
    marginInput.type = 'number';
    marginInput.min = '0';
    marginInput.step = '100';
    marginInput.inputMode = 'numeric';
    marginInput.autocomplete = 'off';
    marginInput.spellcheck = false;
    marginInput.dataset.key = 'rootMarginPx';
    marginInput.title = '值越大：快速滚动时更不容易出现空白，但性能收益会变小';
    marginRow.append(marginLabel, marginInput);

    const optsBtn = document.createElement('button');
    optsBtn.type = 'button';
    optsBtn.className = 'cgptperf-secondary';
    optsBtn.textContent = '选项…';
    optsBtn.title = '打开扩展选项页';

    const benchBtn = document.createElement('button');
    benchBtn.type = 'button';
    benchBtn.className = 'cgptperf-secondary';
    benchBtn.dataset.action = 'bench';
    benchBtn.textContent = '测量下一次交互卡顿';
    benchBtn.title = '点我后：回到页面点击“编辑/重试/停止/发送”或在输入框按 Enter，会弹出耗时（ms）';

    panel.append(perfBtn, offBtn, blocksBtn, heavyBtn, animBtn, boostBtn, marginRow, benchBtn, optsBtn);
    wrap.append(toggle, panel);
    (document.documentElement || document.body).appendChild(wrap);

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel.hidden) openMenu();
      else closeMenu();
    });

    panel.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const actionBtn = target.closest('button[data-action]');
      if (actionBtn instanceof HTMLButtonElement) {
        const action = actionBtn.dataset.action;
        if (action === 'bench') {
          armBench('悬浮菜单');
          closeMenu();
        }
        return;
      }

      const keyBtn = target.closest('button[data-key]');
      if (keyBtn instanceof HTMLButtonElement) {
        const key = keyBtn.dataset.key;
        if (!key) return;
        const next = { ...state.settings, [key]: !state.settings[key] };
        saveSettings(next);
        return;
      }

      if (target === optsBtn) {
        window.open(chrome.runtime.getURL('options.html'), '_blank', 'noopener,noreferrer');
      }
    });

    let marginTimer = 0;
    const scheduleMarginSave = () => {
      if (marginTimer) window.clearTimeout(marginTimer);
      marginTimer = window.setTimeout(() => {
        marginTimer = 0;
        const raw = Number(marginInput.value);
        const next = { ...state.settings, rootMarginPx: Number.isFinite(raw) ? Math.max(0, raw) : state.settings.rootMarginPx };
        saveSettings(next);
      }, 250);
    };

    marginInput.addEventListener('input', (e) => {
      e.stopPropagation();
      scheduleMarginSave();
    });
    marginInput.addEventListener('click', (e) => e.stopPropagation());

    renderUi();
  }

  function renderUi() {
    const ui = document.getElementById(UI_ID);
    if (!ui) return;
    const toggle = ui.querySelector(`button.${UI_TOGGLE_CLASS}`);
    if (toggle instanceof HTMLButtonElement) {
      toggle.setAttribute('data-enabled', state.settings.enabled ? '1' : '0');
    }

    const buttons = Array.from(ui.querySelectorAll('button[data-key]'));
    for (const b of buttons) {
      const key = b.dataset.key;
      const value = state.settings[key];
      const on = !!value;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (key === 'enabled') b.textContent = on ? '性能：开' : '性能：关';
      if (key === 'virtualizeOffscreen') b.textContent = on ? '离屏虚拟化：开' : '离屏虚拟化：关';
      if (key === 'virtualizeMarkdownBlocks') b.textContent = on ? '分段虚拟化：开' : '分段虚拟化：关';
      if (key === 'optimizeHeavyBlocks') b.textContent = on ? '重内容优化：开' : '重内容优化：关';
      if (key === 'disableAnimations') b.textContent = on ? '动画：关' : '动画：开';
      if (key === 'boostDuringInput') b.textContent = on ? '交互加速：开' : '交互加速：关';
    }

    const marginInput = ui.querySelector('input[data-key="rootMarginPx"]');
    if (marginInput instanceof HTMLInputElement && document.activeElement !== marginInput) {
      marginInput.value = String(state.settings.rootMarginPx ?? DEFAULT_SETTINGS.rootMarginPx);
    }
  }

  function saveSettings(next) {
    const sanitized = sanitizeSettings(next);
    applySettings(sanitized);
    try {
      state.storageArea?.set?.({ [STORAGE_KEY]: sanitized }, () => {
        // ignore errors
      });
    } catch {
      // ignore
    }
  }

  function applySettings(next) {
    const prev = state.settings;
    const nextSettings = sanitizeSettings(next);
    state.settings = nextSettings;
    updateBoostFromFocus();
    applyRootAttrs();
    ensureUi();
    renderUi();

    const shouldVirtualize = nextSettings.enabled && nextSettings.virtualizeOffscreen;
    const prevShouldVirtualize = prev.enabled && prev.virtualizeOffscreen;
    const marginChanged = prev.rootMarginPx !== nextSettings.rootMarginPx;
    const boostChanged = prev.boostDuringInput !== nextSettings.boostDuringInput;

    if (!shouldVirtualize) {
      stopVirtualization();
      stopRouteWatch();
    } else {
      if (!prevShouldVirtualize || marginChanged || boostChanged || !state.io) startVirtualization();
      ensureRouteWatch();
    }

    if (state.io && state.ioMarginPx !== effectiveRootMarginPx()) scheduleRestartIo();
  }

  function scheduleRestartIo() {
    if (!state.io) return;
    if (state.ioRestartTimer) return;
    state.ioRestartTimer = window.setTimeout(() => {
      state.ioRestartTimer = 0;
      if (!state.io) return;
      const want = effectiveRootMarginPx();
      if (want === state.ioMarginPx) return;
      restartIo();
    }, 120);
  }

  function restartIo() {
    if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
    const container = state.containerEl || findArticlesContainer();
    detachIo();
    attachIo();
    if (!container) return;
    updateDefaultIntrinsic(container);
    enqueueExistingArticles(container);
  }

  function findFirstIndexByBottom(articles, topBound) {
    let lo = 0;
    let hi = articles.length - 1;
    let ans = articles.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const rect = articles[mid].getBoundingClientRect();
      if (rect.bottom >= topBound) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }

  function findLastIndexByTop(articles, bottomBound) {
    let lo = 0;
    let hi = articles.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const rect = articles[mid].getBoundingClientRect();
      if (rect.top <= bottomBound) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  function scheduleReconcile(articles, first, last) {
    if (!(articles && typeof articles.length === 'number')) return;
    const total = articles.length;
    if (!total) return;

    state.reconcileToken += 1;
    const token = state.reconcileToken;
    state.reconcileArticles = articles;
    state.reconcileIdx = 0;
    state.reconcileFirst = first;
    state.reconcileLast = last;

    const run = (deadline) => {
      if (token !== state.reconcileToken) return;
      const list = state.reconcileArticles;
      if (!list) return;
      const max = list.length;
      const boundFirst = state.reconcileFirst;
      const boundLast = state.reconcileLast;

      let processed = 0;
      while (state.reconcileIdx < max) {
        const i = state.reconcileIdx;
        const el = list[i];
        if (i < boundFirst || i > boundLast) setOffscreen(el);
        else clearOffscreen(el);
        state.reconcileIdx += 1;
        processed += 1;
        if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 4) break;
        if (!deadline && processed >= 220) break;
      }

      if (token !== state.reconcileToken) return;
      if (state.reconcileIdx >= max) {
        state.reconcileArticles = null;
        return;
      }

      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1200 });
      else setTimeout(run, 80);
    };

    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 0);
  }

  function applyVirtualizationNow(marginPx) {
    if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
    const container = state.containerEl;
    if (!(container instanceof HTMLElement)) return;
    const articles = container.querySelectorAll(':scope > article');
    const total = articles.length;
    if (!total) return;

    const topBound = -marginPx;
    const bottomBound = window.innerHeight + marginPx;
    const first = findFirstIndexByBottom(articles, topBound);
    const last = findLastIndexByTop(articles, bottomBound);

    const padItems = 60;
    const start = Math.max(0, first - padItems);
    const end = Math.min(total - 1, last + padItems);
    for (let i = start; i <= end; i += 1) {
      const el = articles[i];
      if (i < first || i > last) setOffscreen(el);
      else clearOffscreen(el);
    }

    // Reconcile the rest during idle time to keep interactions snappy.
    scheduleReconcile(articles, first, last);
  }

  function setBoostActive(nextActive) {
    const allowed = state.settings.enabled && state.settings.virtualizeOffscreen && state.settings.boostDuringInput;
    const active = allowed && nextActive;
    if (state.boostActive === active) return;
    state.boostActive = active;
    scheduleRestartIo();
  }

  function scheduleActionBoost(durationMs = 1400) {
    if (!(state.settings.enabled && state.settings.virtualizeOffscreen && state.settings.boostDuringInput)) return;
    setBoostActive(true);
    if (state.boostActionTimer) window.clearTimeout(state.boostActionTimer);
    state.boostActionTimer = window.setTimeout(() => {
      state.boostActionTimer = 0;
      updateBoostFromFocus();
    }, durationMs);
  }

  function updateBoostFromFocus() {
    const active = isTextInputElement(document.activeElement);
    setBoostActive(active);
  }

  function ensureBoostListeners() {
    if (state.boostListenersAttached) return;
    state.boostListenersAttached = true;

    const schedule = () => {
      if (state.boostFocusTimer) window.clearTimeout(state.boostFocusTimer);
      state.boostFocusTimer = window.setTimeout(() => {
        state.boostFocusTimer = 0;
        updateBoostFromFocus();
      }, 0);
    };

    const buttonMeta = (btn) => {
      if (!(btn instanceof Element)) return '';
      const aria = btn.getAttribute('aria-label') || '';
      const title = btn.getAttribute('title') || '';
      const testid = btn.getAttribute('data-testid') || '';
      const text = (btn.textContent || '').trim();
      return `${aria} ${title} ${testid} ${text}`.toLowerCase();
    };

    const shouldBoostFromTarget = (target) => {
      if (!(target instanceof Element)) return false;
      if (target.closest(`#${UI_ID}`)) return false;

      // Composer interactions: opening, typing, sending.
      if (target.closest('form.group\\/composer')) return true;

      const btn = target.closest('button');
      if (!btn) return false;
      const s = buttonMeta(btn);

      // Fast path: edit/retry/stop are the most expensive interactions.
      if (
        /edit message|regenerate|retry|try again|stop generating|stop streaming|pause|continue generating|编辑|重试|重新生成|停止/.test(s)
      )
        return true;

      // Message action buttons are often icon-only; boost if it's inside the main chat.
      if (btn.closest('main') && (btn.getAttribute('aria-label') || btn.getAttribute('data-testid'))) return true;

      return false;
    };

    // Use `window` capture so we still observe actions even if the app stops propagation on `document`.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (isCopyButtonTarget(e.target)) prepareCopyUnfreeze(e.target);
        if (!shouldBoostFromTarget(e.target)) return;
        state.lastActionBoostAt = performance.now();
        runBench(actionLabelFromTarget(e.target), { via: 'pointerdown' });
        scheduleActionBoost();
      },
      true,
    );

    window.addEventListener(
      'click',
      (e) => {
        if (isCopyButtonTarget(e.target)) prepareCopyUnfreeze(e.target);
        if (!shouldBoostFromTarget(e.target)) return;
        const now = performance.now();
        if (now - state.lastActionBoostAt < 120) return;
        state.lastActionBoostAt = now;
        runBench(actionLabelFromTarget(e.target), { via: 'click' });
        scheduleActionBoost();
      },
      true,
    );

    document.addEventListener(
      'keydown',
      (e) => {
        // Hitting Enter to send can be expensive; boost before submission.
        if (e.key !== 'Enter') return;
        if (!isTextInputElement(document.activeElement)) return;
        state.lastActionBoostAt = performance.now();
        runBench('Enter（发送）', { via: 'keydown' });
        scheduleActionBoost(1100);
      },
      true,
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key.toLowerCase?.() !== 'b') return;
        if (!(e.ctrlKey && e.altKey) || e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();
        armBench('快捷键');
      },
      true,
    );

    document.addEventListener('focusin', schedule, true);
    document.addEventListener('focusout', schedule, true);

    window.addEventListener(
      'scroll',
      () => {
        if (!state.reconcileArticles) return;
        state.reconcileToken += 1;
        state.reconcileArticles = null;
      },
      { passive: true },
    );
  }

  function init() {
    ensureBoostListeners();
    ensureRootAttrGuard();

    const storage = chrome?.storage;
    const canUse = (area) => !!(area && typeof area.get === 'function' && typeof area.set === 'function');
    const preferSync = canUse(storage?.sync);
    const area = preferSync ? storage.sync : canUse(storage?.local) ? storage.local : null;
    state.storageArea = area;
    state.storageAreaName = preferSync ? 'sync' : 'local';

    // Make injection visible immediately (even if storage fails).
    toggleRootAttr(ROOT_ATTR, true, '1');
    toggleRootAttr(ROOT_VER_ATTR, true, EXT_VERSION);
    applySettings(DEFAULT_SETTINGS);

    try {
      area?.get?.({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (res) => {
        const next = res?.[STORAGE_KEY];
        if (next) applySettings(next);
      });
    } catch {
      // ignore
    }

    try {
      chrome?.storage?.onChanged?.addListener?.((changes, areaName) => {
        if (areaName === state.storageAreaName && changes?.[STORAGE_KEY]) {
          applySettings(changes[STORAGE_KEY].newValue);
        }
        if (areaName === 'local' && changes?.[BENCH_KEY]?.newValue) {
          armBench(changes[BENCH_KEY].newValue?.from || '弹窗/选项');
          try {
            chrome.storage.local.remove(BENCH_KEY);
          } catch {
            // ignore
          }
        }
      });
    } catch {
      // ignore
    }
  }

  init();
})();
