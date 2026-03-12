(() => {
  'use strict';

  const GLOBAL_STATE_KEY = '__cgpt_perf_mv3_state_v1__';
  try {
    const prev = globalThis[GLOBAL_STATE_KEY];
    if (prev && typeof prev === 'object' && typeof prev.cleanup === 'function') prev.cleanup();
  } catch {}

  const EXT_VERSION = '0.1.24';

  const STORAGE_KEY = 'cgpt_perf_mv3_settings_v1';
  const BENCH_KEY = 'cgpt_perf_mv3_bench_arm_v1';

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    virtualizeOffscreen: true,
    optimizeHeavyBlocks: true,
    disableAnimations: true,
    boostDuringInput: true,
    unfreezeOnFind: true,
    showOverlay: false,
    rootMarginPx: 1000,
  });

  const ROOT_ATTR = 'data-cgptperf';
  const ROOT_VER_ATTR = 'data-cgptperf-ver';
  const ROOT_ENABLED_ATTR = 'data-cgptperf-enabled';
  const ROOT_OFFSCREEN_ATTR = 'data-cgptperf-offscreen';
  const ROOT_HEAVY_ATTR = 'data-cgptperf-heavy';
  const ROOT_NOANIM_ATTR = 'data-cgptperf-noanim';
  const ROOT_FIND_ATTR = 'data-cgptperf-find';

  const OFFSCREEN_CLASS = 'cgptperf-offscreen';
  const INTRINSIC_VAR = '--cgptperf-intrinsic-size';
  const UI_ID = 'cgptperf-ui';
  const UI_TOGGLE_CLASS = 'cgptperf-toggle';
  const UI_PANEL_CLASS = 'cgptperf-panel';
  const TOAST_ID = 'cgptperf-toast';
  const COPY_UNFREEZE_ATTR = 'data-cgptperf-copy-unfreeze';
  const MSG_GET_STATE = 'CGPT_PERF_GET_STATE';

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
    routeUnsub: null,
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
    findTimer: 0,
    ioRestartTimer: 0,
    virtualizeNowRaf: 0,
    boostListenersAttached: false,
    rootAttrMo: null,
    disposed: false,
    onPointerDown: null,
    onClick: null,
    onKeydown: null,
    onFocusIn: null,
    onFocusOut: null,
    onScroll: null,
    onStorageChanged: null,
    onMessage: null,
    cleanup: null,
    lastHref: '',
    lastVirtualizeStartAt: 0,
    lastReconcileAt: 0,
    lastVisibleFirst: -1,
    lastVisibleLast: -1,
    lastVisibleTotal: 0,
    structureDirty: true,
    lastGeneratingCheckAt: 0,
    generatingCached: false,
	    budgetSnapshot: null,
	    budgetSnapshotAt: 0,
	    budgetLevel: 0,
	    kpi: {
	      domQueryOps: 0,
	      moCallbackCount: 0,
	      turnScanCount: 0,
	    },
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

  function nowPerf() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  }

	  function isGeneratingResponse(force = false) {
	    const now = nowPerf();
	    if (!force && now - state.lastGeneratingCheckAt < 220) return state.generatingCached;

	    let active = false;
	    try {
	      state.kpi.domQueryOps += 1;
	      active = !!document.querySelector(
	        'button[aria-label*="Stop streaming" i], button[aria-label*="Stop generating" i], button[aria-label*="Continue generating" i], button[aria-label*="停止" i], button[aria-label*="继续生成" i]',
	      );
	    } catch {
	      active = false;
    }
    state.lastGeneratingCheckAt = now;
    state.generatingCached = active;
    return active;
  }

	  function collectBudgetSnapshot(totalArticles, force = false) {
	    const now = nowPerf();
	    const prev = state.budgetSnapshot;
	    const articleChanged = !prev || prev.totalArticles !== totalArticles;
	    const staleByTime = now - state.budgetSnapshotAt > 1800;
    const shouldRefresh = force || articleChanged || state.structureDirty || staleByTime;

    if (!shouldRefresh && prev) return prev;

	    let domNodes = prev?.domNodes ?? 0;
	    let katexNodes = prev?.katexNodes ?? 0;
	    try {
	      state.kpi.domQueryOps += 1;
	      domNodes = document.getElementsByTagName('*').length;
	    } catch {
	      // ignore
	    }
    // KaTeX query is relatively expensive; only refresh when the conversation has enough turns
    // or we explicitly force a refresh.
	    if (force || articleChanged || totalArticles >= 10) {
	      try {
	        state.kpi.domQueryOps += 1;
	        katexNodes = document.querySelectorAll('.katex-display, mjx-container').length;
	      } catch {
	        // ignore
	      }
	    }

    const snap = { totalArticles, domNodes, katexNodes, ts: Date.now() };
    state.budgetSnapshot = snap;
    state.budgetSnapshotAt = now;
    return snap;
  }

  function computeBudgetLevel(snapshot) {
    if (!snapshot) return 0;
    let level = 0;
    const dom = Number(snapshot.domNodes) || 0;
    const katex = Number(snapshot.katexNodes) || 0;
    const turns = Number(snapshot.totalArticles) || 0;

    if (dom >= 10000) level += 1;
    if (dom >= 18000) level += 1;
    if (dom >= 26000) level += 1;
    if (katex >= 120) level += 1;
    if (katex >= 220) level += 1;
    if (turns >= 24) level += 1;
    if (turns >= 36) level += 1;

    return Math.max(0, Math.min(4, level));
  }

  function computeAdaptivePadItems({ generating, boostActive, snapshot }) {
    const base = generating ? 24 : boostActive ? 36 : 60;
    const level = computeBudgetLevel(snapshot);
    state.budgetLevel = level;

    const factors = generating ? [1, 0.92, 0.78, 0.64, 0.54] : [1, 0.9, 0.76, 0.62, 0.5];
    const scaled = Math.round(base * factors[level]);
    const minPad = generating ? 12 : boostActive ? 16 : 20;
    return clampInt(scaled, minPad, base);
  }

  function reconcileIntervalMs() {
    const level = Number(state.budgetLevel) || 0;
    if (level >= 4) return 1500;
    if (level >= 3) return 1000;
    if (level >= 2) return 650;
    return 220;
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
      optimizeHeavyBlocks:
        typeof s.optimizeHeavyBlocks === 'boolean' ? s.optimizeHeavyBlocks : DEFAULT_SETTINGS.optimizeHeavyBlocks,
      disableAnimations:
        typeof s.disableAnimations === 'boolean' ? s.disableAnimations : DEFAULT_SETTINGS.disableAnimations,
      boostDuringInput: typeof s.boostDuringInput === 'boolean' ? s.boostDuringInput : DEFAULT_SETTINGS.boostDuringInput,
      unfreezeOnFind: typeof s.unfreezeOnFind === 'boolean' ? s.unfreezeOnFind : DEFAULT_SETTINGS.unfreezeOnFind,
      showOverlay: typeof s.showOverlay === 'boolean' ? s.showOverlay : DEFAULT_SETTINGS.showOverlay,
      rootMarginPx: Number.isFinite(Number(s.rootMarginPx))
        ? Math.max(0, Number(s.rootMarginPx))
        : DEFAULT_SETTINGS.rootMarginPx,
    };
  }

  function settingsEqual(a, b) {
    if (!a || !b) return false;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!Object.is(a[key], b[key])) return false;
    }
    return true;
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
	      const onMutate = () => {
	        try {
	          state.kpi.moCallbackCount += 1;
	        } catch {
	          // ignore
	        }
	        schedule();
	      };
	      state.rootAttrMo = new MutationObserver(onMutate);
	      state.rootAttrMo.observe(html, {
	        attributes: true,
	        attributeFilter: [
	          ROOT_ATTR,
          ROOT_VER_ATTR,
          ROOT_ENABLED_ATTR,
          ROOT_OFFSCREEN_ATTR,
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
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function debugSnapshot() {
    const html = document.documentElement;
    const attrs = {};
    for (const name of [
      ROOT_ATTR,
      ROOT_VER_ATTR,
      ROOT_ENABLED_ATTR,
      ROOT_OFFSCREEN_ATTR,
      ROOT_HEAVY_ATTR,
      ROOT_NOANIM_ATTR,
      ROOT_FIND_ATTR,
    ]) {
      try {
        attrs[name] = html?.getAttribute?.(name) ?? null;
      } catch {
        attrs[name] = null;
      }
    }

    let articleCount = 0;
    let offscreenCount = 0;
    try {
      articleCount = document.querySelectorAll('main article').length;
      offscreenCount = document.querySelectorAll(`main article.${OFFSCREEN_CLASS}`).length;
    } catch {
      articleCount = 0;
      offscreenCount = 0;
    }

    return {
      ok: true,
      version: EXT_VERSION,
      url: String(location.href || ''),
      storageArea: state.storageAreaName,
      settings: state.settings,
      attrs,
      articleCount,
      offscreenCount,
      boostActive: !!state.boostActive,
      budgetLevel: state.budgetLevel || 0,
      ioMarginPx: state.ioMarginPx,
      ts: Date.now(),
    };
  }

  function ensureMessageListener() {
    if (state.onMessage) return;
    state.onMessage = (msg, sender, sendResponse) => {
      if (!msg || msg.type !== MSG_GET_STATE) return;
      try {
        sendResponse(debugSnapshot());
      } catch (e) {
        try {
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
        } catch {
          // ignore
        }
      }
    };
    try {
      chrome?.runtime?.onMessage?.addListener?.(state.onMessage);
    } catch {
      state.onMessage = null;
    }
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

  function getUiLocale() {
    try {
      return String(document.documentElement?.dataset?.aichatLocale || navigator.language || 'en').trim() || 'en';
    } catch {
      return 'en';
    }
  }

  function isChineseUi() {
    return /^zh/i.test(getUiLocale());
  }

  function uiText(zh, en) {
    return isChineseUi() ? zh : en;
  }

  function armBench(source = 'unknown') {
    state.benchArmed = true;
    if (state.benchTimer) window.clearTimeout(state.benchTimer);
    state.benchTimer = window.setTimeout(() => {
      state.benchTimer = 0;
      if (!state.benchArmed) return;
      state.benchArmed = false;
      toast(uiText('测量已取消（超时）', 'Measurement cancelled (timed out)'));
    }, 12_000);
    const mode = state.settings.enabled ? uiText('优化：开', 'Optimization: on') : uiText('优化：关', 'Optimization: off');
    toast(uiText(`已开始测量（${source}｜${mode}）\n请点击“编辑/重试/停止”或在输入框按 Enter`, `Measurement started (${source} | ${mode})\nClick Edit / Retry / Stop, or press Enter in the composer.`),
      2400,
    );
  }

  function actionLabelFromTarget(target, fallback = uiText('点击', 'click')) {
    if (!(target instanceof Element)) return fallback;
    const btn = target.closest('button');
    if (!btn) return fallback;
    const aria = btn.getAttribute('aria-label') || '';
    const title = btn.getAttribute('title') || '';
    const testid = btn.getAttribute('data-testid') || '';
    const text = (btn.textContent || '').trim();
    const s = `${aria} ${title} ${testid} ${text}`.toLowerCase();
    if (/edit message|编辑/.test(s)) return uiText('编辑', 'Edit');
    if (/regenerate|retry|try again|重新生成|重试/.test(s)) return uiText('重试/重新生成', 'Retry / Regenerate');
    if (/stop generating|stop streaming|停止|pause|continue generating/.test(s)) return uiText('停止/继续', 'Stop / Continue');
    if (/send|发送/.test(s)) return uiText('发送', 'Send');
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
      if (article.getAttribute(COPY_UNFREEZE_ATTR) === '1') return;
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
	        let heapMb = Number.NaN;
	        try {
	          const used = performance?.memory?.usedJSHeapSize;
	          if (typeof used === 'number' && Number.isFinite(used)) heapMb = used / 1024 / 1024;
	        } catch {
	          // ignore
	        }
	        let domNodes = Number(state.budgetSnapshot?.domNodes);
	        if (!Number.isFinite(domNodes)) domNodes = Number.NaN;
	        let iframes = 0;
	        try {
	          state.kpi.domQueryOps += 1;
	          iframes = document.querySelectorAll('iframe').length;
	        } catch {
	          iframes = 0;
	        }
	        console.log('[cgptperf] bench', {
	          label,
	          dt,
	          longTaskTotal: lt,
	          longTaskCount,
	          heapMb,
	          domNodes,
	          iframes,
	          domQueryOps: state.kpi.domQueryOps,
	          moCallbackCount: state.kpi.moCallbackCount,
	          turnScanCount: state.kpi.turnScanCount,
	          rootMarginPx: state.settings.rootMarginPx,
	          boostDuringInput: state.settings.boostDuringInput,
	          boostActive: state.boostActive,
	          ...meta,
	        });
      } catch {
        // ignore
      }

      toast(
        uiText(
          `测量：${label}\n输入到下一帧：${dt}ms\n长任务：${lt}ms（${longTaskCount} 次）`,
          `Measurement: ${label}\nInput to next frame: ${dt}ms\nLong tasks: ${lt}ms (${longTaskCount})`
        ),
        3200,
      );
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
    // Cheap existence check (avoid scanning all children).
    try {
      if (!container.querySelector(':scope > article')) return null;
    } catch {
      return null;
    }
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
        if (!a.isConnected) {
          try {
            state.io.unobserve(a);
          } catch {
            // ignore
          }
          try {
            state.observed.delete(a);
          } catch {
            // ignore
          }
          continue;
        }
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
	      try {
	        state.kpi.moCallbackCount += 1;
	      } catch {
	        // ignore
	      }
	      let structureChanged = false;
	      for (const r of records) {
	        for (const n of r.addedNodes) {
	          enqueueArticle(n);
	          if (n instanceof HTMLElement && (n.tagName === 'ARTICLE' || n.querySelector?.('article'))) {
            structureChanged = true;
          }
        }
        // Prevent memory leaks: IntersectionObserver keeps strong refs to observed nodes.
        // If ChatGPT swaps/removes turn <article> elements (common on SPA navigations),
        // we must `unobserve()` removed nodes so they can be GC'd.
        for (const n of r.removedNodes || []) {
          if (n instanceof HTMLElement && (n.tagName === 'ARTICLE' || n.querySelector?.('article'))) {
            structureChanged = true;
          }
          try {
            if (!state.io) continue;
            if (!(n instanceof HTMLElement)) continue;
            if (n.tagName === 'ARTICLE') {
              state.io.unobserve(n);
              try {
                state.observed.delete(n);
              } catch {
                // ignore
              }
              continue;
            }
            const list = n.querySelectorAll?.('article');
            if (!list || !list.length) continue;
            for (const a of list) {
              try {
                if (a instanceof HTMLElement) state.io.unobserve(a);
                if (a instanceof HTMLElement) state.observed.delete(a);
              } catch {
                // ignore
              }
            }
          } catch {
            // ignore
          }
        }
      }
      if (structureChanged) state.structureDirty = true;
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
    const perfNow = nowPerf();
    if (perfNow - state.lastVirtualizeStartAt < 480) return;
    state.lastVirtualizeStartAt = perfNow;
    state.lastVisibleFirst = -1;
    state.lastVisibleLast = -1;
    state.lastVisibleTotal = 0;
    state.structureDirty = true;

    detachIo();
    detachContainerObserver();
    state.containerEl = null;

    attachIo();

    const container = findArticlesContainer();
    if (container) {
      state.containerEl = container;
      updateDefaultIntrinsic(container);
      scheduleApplyVirtualizationNow('start');
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
        scheduleApplyVirtualizationNow('start-hydration');
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
    // Cancel any ongoing idle reconciliation that may still hold a NodeList reference.
    try {
      state.reconcileToken += 1;
      state.reconcileArticles = null;
      state.reconcileIdx = 0;
    } catch {}
    detachContainerObserver();
    detachIo();
    state.containerEl = null;
    state.lastVisibleFirst = -1;
    state.lastVisibleLast = -1;
    state.lastVisibleTotal = 0;
    state.structureDirty = true;
    state.budgetSnapshot = null;
    state.budgetSnapshotAt = 0;
    state.budgetLevel = 0;
    document.querySelectorAll(`main article.${OFFSCREEN_CLASS}`).forEach((a) => clearOffscreen(a));
  }

  function ensureRouteWatch() {
    if (state.routeTimer) return;

    try {
      state.lastHref = String(location.href || '');
    } catch {
      state.lastHref = '';
    }

    // Prefer shared bridge route-change events; keep a slow poll as a safety net.
    try {
      if (!state.routeUnsub) {
        const bridge = globalThis.__aichat_quicknav_bridge_v1__;
        if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
          try {
            bridge.ensureRouteListener();
          } catch {}
          state.routeUnsub = bridge.on('routeChange', () => {
            try {
              if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
              if (document.visibilityState === 'hidden') return;
              startVirtualization();
            } catch {
              // ignore
            }
          });
        }
      }
    } catch {}

    state.routeTimer = setInterval(() => {
      if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
      if (document.visibilityState === 'hidden') return;
      try {
        const href = String(location.href || '');
        if (href && href !== state.lastHref) {
          state.lastHref = href;
          startVirtualization();
          return;
        }
      } catch {}
      // Steady state: the existing container is still connected; avoid any DOM queries.
      if (state.containerEl && state.containerEl.isConnected) return;
      const current = findArticlesContainer();
      if (!current) return;
      if (state.containerEl && current === state.containerEl) return;
      // Container replaced due to SPA navigation; reattach cheaply (avoid clearing classes on a large DOM).
      startVirtualization();
    }, 4000);
  }

  function stopRouteWatch() {
    if (state.routeTimer) clearInterval(state.routeTimer);
    state.routeTimer = null;
    try {
      if (state.routeUnsub) state.routeUnsub();
    } catch {}
    state.routeUnsub = null;
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
    toggle.textContent = uiText('性能', 'Perf');
    toggle.title = uiText('ChatGPT 性能菜单', 'ChatGPT performance menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'menu');

    const panel = document.createElement('div');
    panel.className = UI_PANEL_CLASS;
    panel.hidden = true;

    const perfBtn = mkBtn('enabled', uiText('性能：开', 'Performance: on'), uiText('切换性能优化总开关', 'Toggle the overall performance optimization switch'));
    const offBtn = mkBtn('virtualizeOffscreen', uiText('离屏虚拟化：开', 'Offscreen virtualization: on'), uiText('切换离屏虚拟化（长对话更流畅）', 'Toggle offscreen virtualization for smoother long conversations'));
    const heavyBtn = mkBtn('optimizeHeavyBlocks', uiText('重内容优化：开', 'Heavy content optimization: on'), uiText('切换重内容优化（pre/table/公式等）', 'Toggle heavy content optimization (pre/table/formulas, etc.)'));
    const animBtn = mkBtn('disableAnimations', uiText('动画：开', 'Animations: on'), uiText('切换动画/过渡（关闭可减少卡顿）', 'Toggle animations/transitions (turning them off can reduce jank)'));
    const boostBtn = mkBtn('boostDuringInput', uiText('交互加速：开', 'Interaction boost: on'), uiText('输入/编辑时临时收紧预加载，减少点击/发送卡顿', 'Temporarily tighten preloading while typing/editing to reduce click/send lag'));

    const marginRow = document.createElement('div');
    marginRow.className = 'cgptperf-row';
    const marginLabel = document.createElement('span');
    marginLabel.textContent = uiText('预加载边距', 'Preload margin');
    const marginInput = document.createElement('input');
    marginInput.type = 'number';
    marginInput.min = '0';
    marginInput.step = '100';
    marginInput.inputMode = 'numeric';
    marginInput.autocomplete = 'off';
    marginInput.spellcheck = false;
    marginInput.dataset.key = 'rootMarginPx';
    marginInput.title = uiText('值越大：快速滚动时更不容易出现空白，但性能收益会变小', 'Higher values reduce blank gaps during fast scrolling, but also reduce the performance benefit.');
    marginRow.append(marginLabel, marginInput);

    const optsBtn = document.createElement('button');
    optsBtn.type = 'button';
    optsBtn.className = 'cgptperf-secondary';
    optsBtn.textContent = uiText('选项…', 'Options…');
    optsBtn.title = uiText('打开扩展选项页', 'Open the extension options page');

    const benchBtn = document.createElement('button');
    benchBtn.type = 'button';
    benchBtn.className = 'cgptperf-secondary';
    benchBtn.dataset.action = 'bench';
    benchBtn.textContent = uiText('测量下一次交互卡顿', 'Measure next interaction lag');
    benchBtn.title = uiText('点我后：回到页面点击“编辑/重试/停止/发送”或在输入框按 Enter，会弹出耗时（ms）', 'Click this, then return to the page and trigger Edit / Retry / Stop / Send or press Enter in the composer to see the latency (ms).');

    panel.append(perfBtn, offBtn, heavyBtn, animBtn, boostBtn, marginRow, benchBtn, optsBtn);
    wrap.append(toggle, panel);
    (document.body || document.documentElement).appendChild(wrap);

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
          armBench(uiText('悬浮菜单', 'Floating menu'));
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
        window.open(chrome.runtime.getURL('options/options.html'), '_blank', 'noopener,noreferrer');
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
      if (key === 'enabled') b.textContent = on ? uiText('性能：开', 'Performance: on') : uiText('性能：关', 'Performance: off');
      if (key === 'virtualizeOffscreen') b.textContent = on ? uiText('离屏虚拟化：开', 'Offscreen virtualization: on') : uiText('离屏虚拟化：关', 'Offscreen virtualization: off');
      if (key === 'optimizeHeavyBlocks') b.textContent = on ? uiText('重内容优化：开', 'Heavy content optimization: on') : uiText('重内容优化：关', 'Heavy content optimization: off');
      if (key === 'disableAnimations') b.textContent = on ? uiText('动画：关', 'Animations: off') : uiText('动画：开', 'Animations: on');
      if (key === 'boostDuringInput') b.textContent = on ? uiText('交互加速：开', 'Interaction boost: on') : uiText('交互加速：关', 'Interaction boost: off');
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
    if (!(nextSettings.enabled && nextSettings.unfreezeOnFind)) deactivateFindUnfreeze();
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

  function activateFindUnfreeze(durationMs = 25000) {
    if (state.disposed) return;
    if (!(state.settings.enabled && state.settings.unfreezeOnFind)) return;
    toggleRootAttr(ROOT_FIND_ATTR, true, '1');
    if (state.findTimer) window.clearTimeout(state.findTimer);
    state.findTimer = window.setTimeout(() => {
      state.findTimer = 0;
      toggleRootAttr(ROOT_FIND_ATTR, false);
    }, Math.max(5000, Number(durationMs) || 25000));
  }

  function deactivateFindUnfreeze() {
    try {
      if (state.findTimer) window.clearTimeout(state.findTimer);
    } catch {}
    state.findTimer = 0;
    toggleRootAttr(ROOT_FIND_ATTR, false);
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
    state.structureDirty = true;
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
	    try {
	      state.kpi.domQueryOps += 1;
	      state.kpi.turnScanCount += 1;
	    } catch {
	      // ignore
	    }
	    const articles = container.querySelectorAll(':scope > article');
	    const total = articles.length;
	    if (!total) return;

    const topBound = -marginPx;
    const bottomBound = window.innerHeight + marginPx;
    const first = findFirstIndexByBottom(articles, topBound);
    const last = findLastIndexByTop(articles, bottomBound);
    const unchangedWindow =
      first === state.lastVisibleFirst && last === state.lastVisibleLast && total === state.lastVisibleTotal;
    if (unchangedWindow && !state.structureDirty) return;
    state.lastVisibleFirst = first;
    state.lastVisibleLast = last;
    state.lastVisibleTotal = total;

    const generating = isGeneratingResponse();
    const wasStructureDirty = state.structureDirty;
    const budget = collectBudgetSnapshot(total);
    const padItems = computeAdaptivePadItems({ generating, boostActive: state.boostActive, snapshot: budget });
    const start = Math.max(0, first - padItems);
    const end = Math.min(total - 1, last + padItems);
    for (let i = start; i <= end; i += 1) {
      const el = articles[i];
      if (i < first || i > last) setOffscreen(el);
      else clearOffscreen(el);
    }
    state.structureDirty = false;

    // Streaming responses are the hottest path; avoid full-list reconcile scans in this phase.
    if (generating) return;

    // Reconcile the rest during idle time to keep interactions snappy.
    const perfNow = nowPerf();
    const minReconcileMs = wasStructureDirty ? 220 : reconcileIntervalMs();
    if (perfNow - state.lastReconcileAt >= minReconcileMs) {
      state.lastReconcileAt = perfNow;
      scheduleReconcile(articles, first, last);
    }
  }

  function scheduleApplyVirtualizationNow(reason = 'unknown') {
    if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
    if (state.virtualizeNowRaf) return;
    state.virtualizeNowRaf = window.requestAnimationFrame(() => {
      state.virtualizeNowRaf = 0;
      try {
        applyVirtualizationNow(effectiveRootMarginPx());
      } catch (err) {
        if (state.settings.showOverlay) console.warn('[cgptperf] applyVirtualizationNow failed', reason, err);
      }
    });
  }

  function setBoostActive(nextActive) {
    const allowed = state.settings.enabled && state.settings.virtualizeOffscreen && state.settings.boostDuringInput;
    const active = allowed && nextActive;
    if (state.boostActive === active) return;
    state.boostActive = active;
    scheduleRestartIo();
    if (active) scheduleApplyVirtualizationNow('boost');
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
    state.onPointerDown = (e) => {
      if (state.disposed) return;
      if (isCopyButtonTarget(e.target)) prepareCopyUnfreeze(e.target);
      if (!shouldBoostFromTarget(e.target)) return;
      state.lastActionBoostAt = performance.now();
      runBench(actionLabelFromTarget(e.target), { via: 'pointerdown' });
      scheduleActionBoost();
    };
    window.addEventListener('pointerdown', state.onPointerDown, true);

    state.onClick = (e) => {
      if (state.disposed) return;
      // pointerdown already handles normal mouse/touch clicks; keep click only for keyboard-triggered activations.
      if (e && typeof e.detail === 'number' && e.detail !== 0) return;
      if (isCopyButtonTarget(e.target)) prepareCopyUnfreeze(e.target);
      if (!shouldBoostFromTarget(e.target)) return;
      const now = performance.now();
      if (now - state.lastActionBoostAt < 120) return;
      state.lastActionBoostAt = now;
      runBench(actionLabelFromTarget(e.target), { via: 'click' });
      scheduleActionBoost();
    };
    window.addEventListener('click', state.onClick, true);

    state.onKeydown = (e) => {
      if (state.disposed) return;
      try {
        if (state.settings.enabled && state.settings.unfreezeOnFind) {
          const key = String(e.key || '').toLowerCase();
          if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === 'f') {
            activateFindUnfreeze(25_000);
            return;
          }
          if (key === 'escape') deactivateFindUnfreeze();
        }
      } catch {}
      // Hitting Enter to send can be expensive; boost before submission.
      if (e.key !== 'Enter') return;
      if (!isTextInputElement(document.activeElement)) return;
      state.lastActionBoostAt = performance.now();
      runBench(uiText('Enter（发送）', 'Enter (send)'), { via: 'keydown' });
      scheduleActionBoost(1100);
    };
    document.addEventListener('keydown', state.onKeydown, true);

    state.onFocusIn = schedule;
    state.onFocusOut = schedule;
    document.addEventListener('focusin', state.onFocusIn, true);
    document.addEventListener('focusout', state.onFocusOut, true);

    state.onScroll = () => {
      if (state.disposed) return;
      if (!state.reconcileArticles) return;
      state.reconcileToken += 1;
      state.reconcileArticles = null;
    };
    window.addEventListener('scroll', state.onScroll, { passive: true });
  }

  function cleanup() {
    if (state.disposed) return;
    state.disposed = true;

    try { closeMenu(); } catch {}
    try { stopRouteWatch(); } catch {}
    try { stopVirtualization(); } catch {}
    try {
      if (state.virtualizeNowRaf) window.cancelAnimationFrame(state.virtualizeNowRaf);
    } catch {}
    state.virtualizeNowRaf = 0;

    try { state.rootAttrMo?.disconnect?.(); } catch {}
    state.rootAttrMo = null;

    try { state.containerMo?.disconnect?.(); } catch {}
    state.containerMo = null;

    try { state.io?.disconnect?.(); } catch {}
    state.io = null;

    try {
      if (state.benchTimer) window.clearTimeout(state.benchTimer);
    } catch {}
    state.benchTimer = 0;

    try {
      if (state.boostFocusTimer) window.clearTimeout(state.boostFocusTimer);
    } catch {}
    state.boostFocusTimer = 0;

    try {
      if (state.boostActionTimer) window.clearTimeout(state.boostActionTimer);
    } catch {}
    state.boostActionTimer = 0;

    try { deactivateFindUnfreeze(); } catch {}

    try {
      if (state.ioRestartTimer) window.clearTimeout(state.ioRestartTimer);
    } catch {}
    state.ioRestartTimer = 0;

    try {
      if (state.onPointerDown) window.removeEventListener('pointerdown', state.onPointerDown, true);
    } catch {}
    state.onPointerDown = null;

    try {
      if (state.onClick) window.removeEventListener('click', state.onClick, true);
    } catch {}
    state.onClick = null;

    try {
      if (state.onKeydown) document.removeEventListener('keydown', state.onKeydown, true);
    } catch {}
    state.onKeydown = null;

    try {
      if (state.onFocusIn) document.removeEventListener('focusin', state.onFocusIn, true);
    } catch {}
    state.onFocusIn = null;

    try {
      if (state.onFocusOut) document.removeEventListener('focusout', state.onFocusOut, true);
    } catch {}
    state.onFocusOut = null;

    try {
      if (state.onScroll) window.removeEventListener('scroll', state.onScroll, false);
    } catch {}
    state.onScroll = null;

    try {
      if (state.onStorageChanged) chrome?.storage?.onChanged?.removeListener?.(state.onStorageChanged);
    } catch {}
    state.onStorageChanged = null;

    try {
      if (state.onMessage) chrome?.runtime?.onMessage?.removeListener?.(state.onMessage);
    } catch {}
    state.onMessage = null;

    try { document.getElementById(UI_ID)?.remove?.(); } catch {}
    try { document.getElementById(TOAST_ID)?.remove?.(); } catch {}

    try { delete globalThis[GLOBAL_STATE_KEY]; } catch {}
  }

  function init() {
    state.cleanup = cleanup;
    try {
      Object.defineProperty(globalThis, GLOBAL_STATE_KEY, {
        value: state,
        configurable: true,
        enumerable: false,
        writable: false,
      });
    } catch {
      try {
        globalThis[GLOBAL_STATE_KEY] = state;
      } catch {}
    }

    ensureBoostListeners();
    ensureRootAttrGuard();
    ensureMessageListener();

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
        const next = sanitizeSettings(res?.[STORAGE_KEY]);
        applySettings(next);
      });
    } catch {
      // ignore
    }

    try {
      state.onStorageChanged = (changes, areaName) => {
        if (state.disposed) return;
        if (areaName === state.storageAreaName && changes?.[STORAGE_KEY]) {
          const next = sanitizeSettings(changes[STORAGE_KEY].newValue);
          if (!settingsEqual(next, state.settings)) applySettings(next);
        }
        if (areaName === 'local' && changes?.[BENCH_KEY]?.newValue) {
          armBench(changes[BENCH_KEY].newValue?.from || uiText('弹窗/选项', 'Popup / options'));
          try {
            chrome.storage.local.remove(BENCH_KEY);
          } catch {
            // ignore
          }
        }
      };
      chrome?.storage?.onChanged?.addListener?.(state.onStorageChanged);
    } catch {
      state.onStorageChanged = null;
    }
  }

  init();
})();
