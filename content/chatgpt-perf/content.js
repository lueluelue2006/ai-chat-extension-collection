(() => {
  'use strict';

  const GLOBAL_STATE_KEY = '__cgpt_perf_mv3_state_v1__';
  try {
    const prev = globalThis[GLOBAL_STATE_KEY];
    if (prev && typeof prev === 'object' && typeof prev.cleanup === 'function') prev.cleanup();
  } catch {}

  const EXT_VERSION = '0.1.32';

  const STORAGE_KEY = 'cgpt_perf_mv3_settings_v1';
  const BENCH_KEY = 'cgpt_perf_mv3_bench_arm_v1';
  const CHATGPT_CORE_API_KEY = '__aichat_chatgpt_core_v1__';

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
  const ROOT_HOT_ATTR = 'data-cgptperf-hot';
  const ROOT_NOANIM_ATTR = 'data-cgptperf-noanim';
  const ROOT_FIND_ATTR = 'data-cgptperf-find';

  const OFFSCREEN_CLASS = 'cgptperf-offscreen';
  const TURN_CLASS = 'cgptperf-turn';
  const THREAD_CLASS = 'cgptperf-thread';
  const INTRINSIC_VAR = '--cgptperf-intrinsic-size';
  const UI_ID = 'cgptperf-ui';
  const UI_TOGGLE_CLASS = 'cgptperf-toggle';
  const UI_PANEL_CLASS = 'cgptperf-panel';
  const TOAST_ID = 'cgptperf-toast';
  const COPY_UNFREEZE_ATTR = 'data-cgptperf-copy-unfreeze';
  const MSG_GET_STATE = 'CGPT_PERF_GET_STATE';
  const FALLBACK_TURN_HOST_SELECTOR = 'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]';
  const FALLBACK_TURN_SELECTOR = `${FALLBACK_TURN_HOST_SELECTOR}, [data-testid^="conversation-turn-"]`;
  const HEAVY_BLOCK_SELECTOR = [
    'pre',
    'table',
    '.katex-display',
    'mjx-container',
    '.markdown > p',
    '.markdown > ul',
    '.markdown > ol',
    '.markdown > blockquote',
    '.markdown > h1',
    '.markdown > h2',
    '.markdown > h3',
    '.markdown > h4',
    '.markdown > h5',
    '.markdown > h6'
  ].join(', ');

	  const state = {
	    settings: { ...DEFAULT_SETTINGS },
	    storageArea: null,
	    storageAreaName: 'sync',
	    benchArmed: false,
	    benchTimer: 0,
    lastActionBoostAt: 0,
    reconcileToken: 0,
    reconcileIdx: 0,
    reconcileTurns: null,
    reconcileFirst: 0,
    reconcileLast: -1,
    io: null,
    coreTurnsUnsub: null,
    coreRouteUnsub: null,
    containerEl: null,
    turnsRoot: null,
    turnsCache: [],
    turnsVersion: 0,
    observedTurns: new Set(),
    lastHeights: new WeakMap(),
    turnMetrics: new Map(),
    totalTurnDomNodes: 0,
    totalTurnKatexNodes: 0,
    totalTurnHeavyBlocks: 0,
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
    routeHref: '',
    routePollTimer: 0,
    onPopState: null,
    onHashChange: null,
    fallbackTurnsMo: null,
    fallbackTurnsRoot: null,
    fallbackTurnsTimer: 0,
    fallbackTailTimer: 0,
    uiHealObserver: null,
    uiHealTimer: 0,
    lastVirtualizeStartAt: 0,
    lastReconcileAt: 0,
    lastVisibleFirst: -1,
    lastVisibleLast: -1,
    lastVisibleTotal: 0,
    virtualizationActive: false,
    structureDirty: true,
    lastGeneratingCheckAt: 0,
    generatingCached: false,
    hotPathActive: false,
    hotPathTimer: 0,
    tailMetricsTimer: 0,
    activeTailTurn: null,
    lastTailEstimateAt: 0,
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

  function currentRouteKey() {
    try {
      return `${location.pathname || ''}${location.search || ''}${location.hash || ''}`;
    } catch {
      return '';
    }
  }

  function getChatgptCoreApi() {
    try {
      const api = globalThis[CHATGPT_CORE_API_KEY];
      return api && typeof api === 'object' ? api : null;
    } catch {
      return null;
    }
  }

  function getTurnSelector() {
    try {
      const selector = getChatgptCoreApi()?.getTurnSelector?.();
      if (typeof selector === 'string' && selector.trim()) return selector.trim();
    } catch {
      // ignore
    }
    return FALLBACK_TURN_SELECTOR;
  }

  function normalizeTurnElement(node) {
    try {
      if (!(node instanceof Element)) return null;
      const selector = getTurnSelector();
      if (node.matches?.(selector)) return node instanceof HTMLElement ? node : null;
      const turn = node.closest?.(selector);
      return turn instanceof HTMLElement ? turn : null;
    } catch {
      return null;
    }
  }

  function isTurnRootElement(node) {
    if (!(node instanceof Element)) return false;
    try {
      return !!node.matches?.(getTurnSelector());
    } catch {
      return false;
    }
  }

  function containsTurnRoot(node) {
    if (!(node instanceof Element)) return false;
    if (isTurnRootElement(node)) return true;
    try {
      return !!node.querySelector?.(getTurnSelector());
    } catch {
      return false;
    }
  }

  function getCoreTurnsSnapshot(force = false) {
    try {
      const core = getChatgptCoreApi();
      if (typeof core?.getTurnsSnapshot !== 'function') return null;
      const snapshot = core.getTurnsSnapshot(force);
      if (!snapshot || typeof snapshot !== 'object') return null;
      const turns = Array.isArray(snapshot.turns) ? snapshot.turns.filter((item) => item instanceof HTMLElement) : [];
      const root = snapshot.root instanceof HTMLElement ? snapshot.root : null;
      return {
        root,
        turns,
        turnsVersion: Number.isFinite(Number(snapshot.turnsVersion)) ? Number(snapshot.turnsVersion) : 0,
        rootChanged: !!snapshot.rootChanged,
        addedTurns: Array.isArray(snapshot.addedTurns) ? snapshot.addedTurns.filter((item) => item instanceof HTMLElement) : [],
        removedTurns: Array.isArray(snapshot.removedTurns) ? snapshot.removedTurns.filter((item) => item instanceof HTMLElement) : []
      };
    } catch {
      return null;
    }
  }

  function getDomTurnElements(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    try {
      const list = Array.from(scope.querySelectorAll(getTurnSelector()));
      const turns = [];
      const seen = new Set();
      for (const item of list) {
        const turn = normalizeTurnElement(item);
        if (!(turn instanceof HTMLElement) || seen.has(turn)) continue;
        seen.add(turn);
        turns.push(turn);
      }
      return turns;
    } catch {
      return [];
    }
  }

  function getTurnElements(root, payload = null, options = null) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    const payloadTurns = Array.isArray(payload?.turns) ? payload.turns.filter((item) => item instanceof HTMLElement) : null;
    if (payloadTurns && payloadTurns.length) return payloadTurns;

    const preferLiveDom = !!options?.preferLiveDom;
    if (preferLiveDom) {
      const turns = getDomTurnElements(scope);
      if (turns.length) return turns;
    }

    const snapshot = getCoreTurnsSnapshot(false);
    if (
      snapshot &&
      Array.isArray(snapshot.turns) &&
      snapshot.turns.length &&
      (!root || root === document || snapshot.root === root)
    ) {
      return snapshot.turns;
    }

    try {
      const coreTurns = getChatgptCoreApi()?.getTurnArticles?.(scope);
      if (Array.isArray(coreTurns)) {
        return coreTurns.filter((item) => item instanceof HTMLElement);
      }
    } catch {
      // ignore
    }

    try {
      return getDomTurnElements(scope);
    } catch {
      return [];
    }
  }

  function markTurnElement(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return;
    try {
      if (!turnEl.classList.contains(TURN_CLASS)) turnEl.classList.add(TURN_CLASS);
    } catch {
      // ignore
    }
  }

  function setTurnsCache(turns, root = null, version = 0) {
    state.turnsCache = Array.isArray(turns) ? turns.filter((item) => item instanceof HTMLElement) : [];
    state.turnsRoot = root instanceof HTMLElement ? root : state.turnsRoot;
    if (Number.isFinite(Number(version)) && Number(version) > 0) state.turnsVersion = Number(version);
  }

  function getTailTurn(turns = state.turnsCache) {
    const list = Array.isArray(turns) ? turns : state.turnsCache;
    if (!list || !list.length) return null;
    const tail = list[list.length - 1];
    return tail instanceof HTMLElement ? tail : null;
  }

  function measureTurnMetrics(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return { domNodes: 0, katexNodes: 0, heavyBlocks: 0 };
    let domNodes = 0;
    let katexNodes = 0;
    let heavyBlocks = 0;
    try {
      domNodes = turnEl.getElementsByTagName('*').length;
    } catch {
      domNodes = 0;
    }
    try {
      katexNodes = turnEl.querySelectorAll('.katex-display, mjx-container').length;
    } catch {
      katexNodes = 0;
    }
    try {
      heavyBlocks = turnEl.querySelectorAll(HEAVY_BLOCK_SELECTOR).length;
    } catch {
      heavyBlocks = 0;
    }
    return { domNodes, katexNodes, heavyBlocks };
  }

  function setTurnMetrics(turnEl, nextMetrics) {
    if (!(turnEl instanceof HTMLElement)) return;
    const prev = state.turnMetrics.get(turnEl);
    if (prev) {
      state.totalTurnDomNodes -= Number(prev.domNodes) || 0;
      state.totalTurnKatexNodes -= Number(prev.katexNodes) || 0;
      state.totalTurnHeavyBlocks -= Number(prev.heavyBlocks) || 0;
    }
    const safe = {
      domNodes: Math.max(0, Number(nextMetrics?.domNodes) || 0),
      katexNodes: Math.max(0, Number(nextMetrics?.katexNodes) || 0),
      heavyBlocks: Math.max(0, Number(nextMetrics?.heavyBlocks) || 0),
      estimated: !!nextMetrics?.estimated
    };
    state.turnMetrics.set(turnEl, safe);
    state.totalTurnDomNodes += safe.domNodes;
    state.totalTurnKatexNodes += safe.katexNodes;
    state.totalTurnHeavyBlocks += safe.heavyBlocks;
  }

  function dropTurnMetrics(turnEl) {
    const prev = state.turnMetrics.get(turnEl);
    if (!prev) return;
    state.turnMetrics.delete(turnEl);
    state.totalTurnDomNodes -= Number(prev.domNodes) || 0;
    state.totalTurnKatexNodes -= Number(prev.katexNodes) || 0;
    state.totalTurnHeavyBlocks -= Number(prev.heavyBlocks) || 0;
  }

  function getStreamingTailEstimate(turnEl) {
    const prev = state.turnMetrics.get(turnEl);
    let directChildren = 0;
    let markdownBlocks = 0;
    let formulaHint = 0;
    let heavyHint = 0;
    try {
      directChildren = Math.max(0, Number(turnEl?.childElementCount) || 0);
    } catch {}
    try {
      const markdown = turnEl?.querySelector?.('.markdown');
      markdownBlocks = Math.max(0, Number(markdown?.childElementCount) || 0);
    } catch {}
    try {
      formulaHint = turnEl?.querySelector?.('.katex-display, mjx-container') ? 1 : 0;
    } catch {}
    try {
      heavyHint = turnEl?.querySelector?.('pre, table, .markdown > blockquote') ? 1 : 0;
    } catch {}
    const shape = Math.max(directChildren, markdownBlocks);
    const prevDomNodes = Number(prev?.domNodes) || 0;
    const prevKatexNodes = Number(prev?.katexNodes) || 0;
    const prevHeavyBlocks = Number(prev?.heavyBlocks) || 0;
    return {
      domNodes: Math.max(prevDomNodes, 900 + (shape * 72)),
      katexNodes: Math.max(prevKatexNodes, formulaHint ? Math.min(48, Math.max(10, 6 + shape)) : Math.min(12, Math.max(2, shape >> 1))),
      heavyBlocks: Math.max(prevHeavyBlocks, Math.min(40, Math.max(4 + heavyHint, 4 + (shape >> 1)))),
      estimated: true
    };
  }

  function clearTailMetricsTimer() {
    try {
      if (state.tailMetricsTimer) window.clearTimeout(state.tailMetricsTimer);
    } catch {
      // ignore
    }
    state.tailMetricsTimer = 0;
  }

  function clearHotPathTimer() {
    try {
      if (state.hotPathTimer) window.clearTimeout(state.hotPathTimer);
    } catch {
      // ignore
    }
    state.hotPathTimer = 0;
  }

  function scheduleHotPathCooldown(delayMs = 900) {
    clearHotPathTimer();
    state.hotPathTimer = window.setTimeout(() => {
      state.hotPathTimer = 0;
      if (state.disposed) return;
      if (isGeneratingResponse(true)) {
        scheduleHotPathCooldown(Math.max(900, delayMs));
        return;
      }
      if (!state.hotPathActive) return;
      state.hotPathActive = false;
      applyRootAttrs();
      scheduleApplyVirtualizationNow('hot-cooldown');
    }, Math.max(240, Number(delayMs) || 900));
  }

  function setHotPathActive(nextActive) {
    const active = !!nextActive;
    if (state.hotPathActive === active) {
      if (active) scheduleHotPathCooldown();
      return;
    }
    state.hotPathActive = active;
    if (active) scheduleHotPathCooldown();
    else clearHotPathTimer();
    applyRootAttrs();
  }

  function schedulePreciseTailMetrics(turns = null, delayMs = 420) {
    const tail = getTailTurn(turns);
    if (!(tail instanceof HTMLElement)) return;
    state.activeTailTurn = tail;
    clearTailMetricsTimer();
    state.tailMetricsTimer = window.setTimeout(() => {
      state.tailMetricsTimer = 0;
      if (state.disposed || !tail.isConnected) return;
      if (isGeneratingResponse(true) && getTailTurn() === tail) {
        setTurnMetrics(tail, getStreamingTailEstimate(tail));
        schedulePreciseTailMetrics(state.turnsCache, Math.max(700, delayMs));
        return;
      }
      setTurnMetrics(tail, measureTurnMetrics(tail));
      state.structureDirty = true;
      scheduleApplyVirtualizationNow('tail-metrics-idle');
    }, Math.max(120, Number(delayMs) || 420));
  }

  function syncTailTurnMetrics(turns, { generating = false, force = false } = {}) {
    const tail = getTailTurn(turns);
    const prevTail = state.activeTailTurn;
    state.activeTailTurn = tail;
    if (!(tail instanceof HTMLElement)) return;
    if (generating) {
      const prev = state.turnMetrics.get(tail);
      const ts = nowPerf();
      if (force || !prev || (ts - (state.lastTailEstimateAt || 0)) >= 180 || prevTail !== tail) {
        setTurnMetrics(tail, getStreamingTailEstimate(tail));
        state.lastTailEstimateAt = ts;
      }
      schedulePreciseTailMetrics(turns, 900);
      return;
    }
    const prev = state.turnMetrics.get(tail);
    if (force || !prev || prev.estimated) {
      schedulePreciseTailMetrics(turns, force ? 140 : 420);
    }
  }

  function refreshTailTurnMetrics(turns, force = false) {
    const list = Array.isArray(turns) ? turns : state.turnsCache;
    if (!list || !list.length) return;
    syncTailTurnMetrics(list, { generating: isGeneratingResponse(true), force });
  }

  function getClosestTurnElement(target) {
    return normalizeTurnElement(target);
  }

  function setContainerEl(container) {
    const next = container instanceof HTMLElement ? container : null;
    if (state.containerEl === next) return;
    try {
      if (state.containerEl instanceof HTMLElement) state.containerEl.classList.remove(THREAD_CLASS);
    } catch {
      // ignore
    }
    state.containerEl = next;
    try {
      if (state.containerEl instanceof HTMLElement) state.containerEl.classList.add(THREAD_CLASS);
    } catch {
      // ignore
    }
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

  function collectBudgetSnapshot(turnCount, force = false) {
    const now = nowPerf();
    const prev = state.budgetSnapshot;
    const turnCountChanged = !prev || prev.turnCount !== turnCount;
    const staleByTime = now - state.budgetSnapshotAt > 1800;
    const shouldRefresh = force || turnCountChanged || state.structureDirty || staleByTime;

    if (!shouldRefresh && prev) return prev;

    const generating = isGeneratingResponse(true);
    syncTailTurnMetrics(state.turnsCache, { generating, force });

    const domNodes = Math.max(0, Number(state.totalTurnDomNodes) || 0);
    const katexNodes = Math.max(0, Number(state.totalTurnKatexNodes) || 0);
    const heavyBlocks = Math.max(0, Number(state.totalTurnHeavyBlocks) || 0);
    const snap = { turnCount, domNodes, katexNodes, heavyBlocks, ts: Date.now() };
    state.budgetSnapshot = snap;
    state.budgetSnapshotAt = now;
    return snap;
  }

  function computeBudgetLevel(snapshot) {
    if (!snapshot) return 0;
    let level = 0;
    const dom = Number(snapshot.domNodes) || 0;
    const katex = Number(snapshot.katexNodes) || 0;
    const heavyBlocks = Number(snapshot.heavyBlocks) || 0;
    const turns = Number(snapshot.turnCount) || 0;

    if (dom >= 5000) level += 1;
    if (dom >= 10000) level += 1;
    if (heavyBlocks >= 80) level += 1;
    if (heavyBlocks >= 160) level += 1;
    if (katex >= 80) level += 1;
    if (katex >= 160) level += 1;
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
    toggleRootAttr(ROOT_HOT_ATTR, !!state.hotPathActive, '1');
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
          ROOT_HOT_ATTR,
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

  function scheduleUiHeal() {
    if (state.disposed) return;
    if (state.uiHealTimer) return;
    state.uiHealTimer = window.setTimeout(() => {
      state.uiHealTimer = 0;
      if (state.disposed) return;
      ensureUi();
      renderUi();
    }, 16);
  }

  function installUiSelfHeal() {
    if (state.uiHealObserver || state.disposed || !document.body) return;
    try {
      state.uiHealObserver = new MutationObserver(() => {
        if (state.disposed) return;
        if (document.getElementById(UI_ID)) return;
        scheduleUiHeal();
      });
      state.uiHealObserver.observe(document.body, { childList: true });
    } catch {
      state.uiHealObserver = null;
    }
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
      ROOT_HOT_ATTR,
      ROOT_NOANIM_ATTR,
      ROOT_FIND_ATTR,
    ]) {
      try {
        attrs[name] = html?.getAttribute?.(name) ?? null;
      } catch {
        attrs[name] = null;
      }
    }

    let turnCount = 0;
    let offscreenCount = 0;
    try {
      turnCount = state.turnsCache.length || getTurnElements(document.querySelector('main')).length;
      offscreenCount = document.querySelectorAll(`.${TURN_CLASS}.${OFFSCREEN_CLASS}`).length;
    } catch {
      turnCount = 0;
      offscreenCount = 0;
    }

    return {
      ok: true,
      version: EXT_VERSION,
      url: String(location.href || ''),
      storageArea: state.storageAreaName,
      settings: state.settings,
      attrs,
      turnCount,
      articleCount: turnCount,
      offscreenCount,
      totalTurnDomNodes: state.totalTurnDomNodes,
      totalTurnKatexNodes: state.totalTurnKatexNodes,
      totalTurnHeavyBlocks: state.totalTurnHeavyBlocks,
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
    const turnEl = getClosestTurnElement(target);
    if (!(turnEl instanceof HTMLElement)) return;

    // If a turn is accidentally still treated as offscreen, clear it so the DOM is fully copyable.
    clearOffscreen(turnEl);

    try {
      if (turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1') return;
      turnEl.setAttribute(COPY_UNFREEZE_ATTR, '1');
      // Force style recalc so `content-visibility` overrides apply before ChatGPT reads the DOM.
      turnEl.getBoundingClientRect();
    } catch {
      // ignore
    }

    window.setTimeout(() => {
      try {
        if (!turnEl.isConnected) return;
        if (turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1') turnEl.removeAttribute(COPY_UNFREEZE_ATTR);
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

  function findTurnsContainer(payload = null) {
    const payloadRoot = payload?.root instanceof HTMLElement ? payload.root : null;
    if (payloadRoot && (Array.isArray(payload?.turns) ? payload.turns.length : getTurnElements(payloadRoot, payload).length)) {
      return payloadRoot;
    }
    if (state.turnsRoot instanceof HTMLElement && state.turnsRoot.isConnected && state.turnsCache.length) return state.turnsRoot;
    try {
      const core = getChatgptCoreApi();
      if (typeof core?.getTurnsRoot === 'function') {
        const root = core.getTurnsRoot();
        if (root instanceof HTMLElement && getTurnElements(root).length) return root;
      }
    } catch {
      // ignore
    }

    const main = document.querySelector('main');
    if (!(main instanceof HTMLElement)) return null;
    const turns = getTurnElements(main);
    if (!turns.length) return null;

    const firstTurn = turns[0];
    let cur = firstTurn?.parentElement || null;
    for (let depth = 0; cur && cur !== document.body && cur !== document.documentElement && depth < 12; depth += 1) {
      if (getTurnElements(cur).length) return cur;
      cur = cur.parentElement;
    }
    return firstTurn?.parentElement instanceof HTMLElement ? firstTurn.parentElement : null;
  }

  function clearOffscreen(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return;
    if (!turnEl.classList.contains(OFFSCREEN_CLASS)) return;

    const h = Math.round(typeof measuredHeight === 'number' ? measuredHeight : 0);
    if (h > 0) state.lastHeights.set(turnEl, h);

    turnEl.classList.remove(OFFSCREEN_CLASS);
    turnEl.style.removeProperty(INTRINSIC_VAR);
  }

  function setOffscreen(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return;
    if (turnEl.classList.contains(OFFSCREEN_CLASS)) return;

    const h = Math.round(typeof measuredHeight === 'number' ? measuredHeight : 0);
    if (h > 0) state.lastHeights.set(turnEl, h);
    const intrinsic = state.lastHeights.get(turnEl) || state.defaultIntrinsic;

    turnEl.style.setProperty(INTRINSIC_VAR, `1px ${intrinsic}px`);
    turnEl.classList.add(OFFSCREEN_CLASS);
  }

  function updateDefaultIntrinsic(container, turns = null) {
    if (!(container instanceof HTMLElement)) return;

    const turnList = Array.isArray(turns) ? turns.filter((item) => item instanceof HTMLElement) : getTurnElements(container);
    if (!turnList.length) {
      state.defaultIntrinsic = clampInt(window.innerHeight * 0.65, 220, 900);
      return;
    }

    const heights = [];
    const topBound = -window.innerHeight * 0.8;
    const bottomBound = window.innerHeight * 1.8;
    const maxScan = 80;
    const want = 9;

    const collect = (start, step) => {
      let scanned = 0;
      for (let i = start; i >= 0 && i < turnList.length; i += step) {
        if (scanned >= maxScan) break;
        scanned += 1;
        const turnEl = turnList[i];
        if (!(turnEl instanceof HTMLElement)) continue;
        const rect = turnEl.getBoundingClientRect();
        if (rect.bottom < topBound || rect.top > bottomBound) continue;
        const h = Math.round(rect.height);
        if (h > 0) heights.push(h);
        if (heights.length >= want) break;
      }
    };

    // Prefer sampling around the current viewport; scan from bottom then top.
    collect(turnList.length - 1, -1);
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
          if (!state.virtualizationActive) {
            clearOffscreen(entry.target, h);
            continue;
          }
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
    state.observedTurns = new Set();
    clearTailMetricsTimer();
    clearHotPathTimer();
    state.activeTailTurn = null;
    state.lastTailEstimateAt = 0;
  }

  function clearFallbackTurnsTimers() {
    try {
      if (state.fallbackTurnsTimer) window.clearTimeout(state.fallbackTurnsTimer);
    } catch {}
    try {
      if (state.fallbackTailTimer) window.clearTimeout(state.fallbackTailTimer);
    } catch {}
    state.fallbackTurnsTimer = 0;
    state.fallbackTailTimer = 0;
  }

  function scheduleFallbackTailRefresh(reason = 'fallback-tail') {
    if (state.fallbackTailTimer) return;
    state.fallbackTailTimer = window.setTimeout(() => {
      state.fallbackTailTimer = 0;
      if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
      if (document.visibilityState === 'hidden') return;
      const container = state.containerEl || findTurnsContainer();
      if (!(container instanceof HTMLElement)) return;
      const turns = getTurnElements(container, null, { preferLiveDom: true });
      if (!turns.length) return;
      setContainerEl(container);
      setTurnsCache(turns, container, 0);
      state.structureDirty = true;
      syncObservedTurns(turns);
      syncTailTurnMetrics(turns, { generating: isGeneratingResponse(true), force: false });
      scheduleApplyVirtualizationNow(reason);
    }, 90);
  }

  function scheduleFallbackTurnsRefresh(reason = 'fallback-turns') {
    if (state.fallbackTurnsTimer) return;
    state.fallbackTurnsTimer = window.setTimeout(() => {
      state.fallbackTurnsTimer = 0;
      if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
      if (document.visibilityState === 'hidden') return;
      const container = findTurnsContainer() || state.containerEl;
      if (!(container instanceof HTMLElement)) return;
      const turns = getTurnElements(container, null, { preferLiveDom: true });
      handleTurnsChanged(
        {
          root: container,
          turns,
          turnsVersion: 0,
          rootChanged: container !== state.containerEl,
          addedTurns: [],
          removedTurns: [],
        },
        reason,
      );
    }, 70);
  }

  function stopFallbackTurnsWatch() {
    try {
      state.fallbackTurnsMo?.disconnect?.();
    } catch {
      // ignore
    }
    state.fallbackTurnsMo = null;
    state.fallbackTurnsRoot = null;
    clearFallbackTurnsTimers();
  }

  function startFallbackTurnsWatch(root = state.containerEl) {
    const container = root instanceof HTMLElement ? root : state.containerEl;
    if (!(container instanceof HTMLElement)) return;
    if (state.fallbackTurnsMo && state.fallbackTurnsRoot === container) return;

    stopFallbackTurnsWatch();
    state.fallbackTurnsRoot = container;
    state.fallbackTurnsMo = new MutationObserver((mutations) => {
      try {
        state.kpi.moCallbackCount += 1;
      } catch {
        // ignore
      }

      let structural = false;
      let tailTouched = false;
      const tail = getTailTurn();

      for (const mut of mutations) {
        if (mut?.type !== 'childList') continue;
        const target = mut.target instanceof Element ? mut.target : null;
        if (target && (target === container || target.parentElement === container || containsTurnRoot(target))) structural = true;

        for (const node of [...mut.addedNodes, ...mut.removedNodes]) {
          if (!(node instanceof Element)) continue;
          if (containsTurnRoot(node)) {
            structural = true;
            break;
          }
          if (!tailTouched && tail instanceof HTMLElement && (node === tail || tail.contains(node) || node.contains(tail))) {
            tailTouched = true;
          }
        }

        if (!tailTouched && tail instanceof HTMLElement && target && tail.contains(target)) {
          tailTouched = true;
        }
        if (structural) break;
      }

      if (structural) {
        scheduleFallbackTurnsRefresh('fallback-turns-mo');
        return;
      }
      if (tailTouched) scheduleFallbackTailRefresh('fallback-tail-mo');
    });

    try {
      state.fallbackTurnsMo.observe(container, { childList: true, subtree: true });
    } catch {
      stopFallbackTurnsWatch();
    }
  }

  function syncObservedTurns(turns) {
    const list = Array.isArray(turns) ? turns : [];
    const generating = isGeneratingResponse();
    const tail = getTailTurn(list);
    const next = new Set();
    for (const turn of list) {
      if (!(turn instanceof HTMLElement)) continue;
      markTurnElement(turn);
      next.add(turn);
      if (!state.turnMetrics.has(turn) && tail === turn && generating) {
        setTurnMetrics(turn, getStreamingTailEstimate(turn));
      }
      if (!state.observedTurns.has(turn)) {
        try {
          state.io?.observe?.(turn);
        } catch {
          // ignore
        }
      }
    }

    for (const turn of Array.from(state.observedTurns)) {
      if (next.has(turn)) continue;
      try {
        state.io?.unobserve?.(turn);
      } catch {
        // ignore
      }
      clearOffscreen(turn);
      try {
        turn.classList.remove(TURN_CLASS);
        turn.removeAttribute(COPY_UNFREEZE_ATTR);
      } catch {
        // ignore
      }
      dropTurnMetrics(turn);
    }

    state.observedTurns = next;
  }

  function handleTurnsChanged(payload, reason = 'turns-change') {
    if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
    if (document.visibilityState === 'hidden') return;

    const snapshot = (() => {
      const payloadTurns = Array.isArray(payload?.turns) ? payload.turns.filter((item) => item instanceof HTMLElement) : null;
      if (payloadTurns && payloadTurns.length) {
        return {
          root: payload?.root instanceof HTMLElement ? payload.root : findTurnsContainer(payload),
          turns: payloadTurns,
          turnsVersion: Number.isFinite(Number(payload?.turnsVersion)) ? Number(payload.turnsVersion) : 0,
          rootChanged: !!payload?.rootChanged,
          addedTurns: Array.isArray(payload?.addedTurns) ? payload.addedTurns.filter((item) => item instanceof HTMLElement) : [],
          removedTurns: Array.isArray(payload?.removedTurns) ? payload.removedTurns.filter((item) => item instanceof HTMLElement) : []
        };
      }
      const coreSnapshot = getCoreTurnsSnapshot(false);
      if (coreSnapshot && coreSnapshot.turns.length) return coreSnapshot;
      const fallbackRoot = findTurnsContainer(payload);
      return {
        root: fallbackRoot,
        turns: fallbackRoot ? getTurnElements(fallbackRoot, payload) : [],
        turnsVersion: 0,
        rootChanged: false,
        addedTurns: [],
        removedTurns: []
      };
    })();
    const container = snapshot.root instanceof HTMLElement ? snapshot.root : findTurnsContainer(payload);
    if (!(container instanceof HTMLElement)) return;

    const changedContainer = container !== state.containerEl;
    const versionChanged =
      Number.isFinite(Number(snapshot.turnsVersion)) &&
      Number(snapshot.turnsVersion) > 0 &&
      Number(snapshot.turnsVersion) !== Number(state.turnsVersion || 0);
    const lengthChanged = snapshot.turns.length !== state.turnsCache.length;
    const hasStructuralDelta =
      changedContainer ||
      !!snapshot.rootChanged ||
      versionChanged ||
      lengthChanged ||
      (Array.isArray(snapshot.addedTurns) && snapshot.addedTurns.length > 0) ||
      (Array.isArray(snapshot.removedTurns) && snapshot.removedTurns.length > 0);
    const generating = isGeneratingResponse(true);

    setContainerEl(container);
    setTurnsCache(snapshot.turns, container, snapshot.turnsVersion);
    state.structureDirty = true;
    if (changedContainer) updateDefaultIntrinsic(container, snapshot.turns);
    if (hasStructuralDelta) syncObservedTurns(snapshot.turns);
    syncTailTurnMetrics(snapshot.turns, { generating, force: !generating && hasStructuralDelta });
    scheduleApplyVirtualizationNow(reason || String(payload?.reason || 'core-turns'));
  }

  function ensureTurnsWatch(root = state.containerEl) {
    const core = getChatgptCoreApi();
    startFallbackTurnsWatch(root);
    if (typeof core?.onTurnsChange === 'function') {
      if (!state.coreTurnsUnsub) {
        state.coreTurnsUnsub = core.onTurnsChange((payload) => {
          try {
            state.kpi.moCallbackCount += 1;
          } catch {
            // ignore
          }
          handleTurnsChanged(payload, String(payload?.reason || 'core-turns'));
        });
      }
    }
  }

  function stopTurnsWatch() {
    try {
      if (typeof state.coreTurnsUnsub === 'function') state.coreTurnsUnsub();
    } catch {
      // ignore
    }
    state.coreTurnsUnsub = null;
    stopFallbackTurnsWatch();
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
    setContainerEl(null);

    attachIo();

    const snapshot = getCoreTurnsSnapshot(false);
    const container = snapshot?.root instanceof HTMLElement ? snapshot.root : findTurnsContainer();
    if (container instanceof HTMLElement) {
      setContainerEl(container);
      const turns = snapshot?.turns?.length ? snapshot.turns : getTurnElements(container);
      setTurnsCache(turns, container, snapshot?.turnsVersion || 0);
      updateDefaultIntrinsic(container, turns);
      syncObservedTurns(turns);
      ensureTurnsWatch(container);
      scheduleApplyVirtualizationNow('start');
      return;
    }

    let tries = 0;
    const tryFind = () => {
      if (!state.io) return;
      const next = findTurnsContainer();
      if (next instanceof HTMLElement) {
        setContainerEl(next);
        const fallbackTurns = getTurnElements(next);
        setTurnsCache(fallbackTurns, next, 0);
        updateDefaultIntrinsic(next, fallbackTurns);
        syncObservedTurns(fallbackTurns);
        ensureTurnsWatch(next);
        scheduleApplyVirtualizationNow('start-hydration');
        return;
      }
      tries += 1;
      if (tries < 40) setTimeout(tryFind, 250);
    };
    setTimeout(tryFind, 250);
  }

  function stopVirtualization() {
    try {
      state.reconcileToken += 1;
      state.reconcileTurns = null;
      state.reconcileIdx = 0;
    } catch {}
    stopTurnsWatch();
    detachIo();
    syncObservedTurns([]);
    setContainerEl(null);
    state.turnsRoot = null;
    state.turnsCache = [];
    state.turnsVersion = 0;
    state.lastVisibleFirst = -1;
    state.lastVisibleLast = -1;
    state.lastVisibleTotal = 0;
    state.structureDirty = true;
    state.budgetSnapshot = null;
    state.budgetSnapshotAt = 0;
    state.budgetLevel = 0;
    setHotPathActive(false);
    state.lastTailEstimateAt = 0;
    state.turnMetrics.clear();
    state.totalTurnDomNodes = 0;
    state.totalTurnKatexNodes = 0;
    state.totalTurnHeavyBlocks = 0;
    document.querySelectorAll(`.${TURN_CLASS}.${OFFSCREEN_CLASS}`).forEach((turn) => clearOffscreen(turn));
  }

  function ensureRouteWatch() {
    const restartForRoute = () => {
      try {
        if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
        const nextKey = currentRouteKey();
        if (!nextKey || nextKey === state.routeHref) return;
        state.routeHref = nextKey;
        if (document.visibilityState === 'hidden') return;
        startVirtualization();
      } catch {
        // ignore
      }
    };

    state.routeHref = currentRouteKey();
    const core = getChatgptCoreApi();
    if (typeof core?.onRouteChange === 'function' && !state.coreRouteUnsub) {
      state.coreRouteUnsub = core.onRouteChange(() => {
        try {
          if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
          const nextKey = currentRouteKey();
          const changed = !!nextKey && nextKey !== state.routeHref;
          state.routeHref = nextKey;
          if (!changed || document.visibilityState === 'hidden') return;
          startVirtualization();
        } catch {
          // ignore
        }
      });
    }
    if (state.routePollTimer || state.onPopState || state.onHashChange) return;
    state.onPopState = () => restartForRoute();
    state.onHashChange = () => restartForRoute();
    window.addEventListener('popstate', state.onPopState, true);
    window.addEventListener('hashchange', state.onHashChange, true);
    state.routePollTimer = window.setInterval(restartForRoute, 400);
  }

  function stopRouteWatch() {
    try {
      if (typeof state.coreRouteUnsub === 'function') state.coreRouteUnsub();
    } catch {
      // ignore
    }
    state.coreRouteUnsub = null;
    if (state.routePollTimer) {
      try {
        window.clearInterval(state.routePollTimer);
      } catch {
        // ignore
      }
    }
    state.routePollTimer = 0;
    if (state.onPopState) {
      try {
        window.removeEventListener('popstate', state.onPopState, true);
      } catch {
        // ignore
      }
    }
    if (state.onHashChange) {
      try {
        window.removeEventListener('hashchange', state.onHashChange, true);
      } catch {
        // ignore
      }
    }
    state.onPopState = null;
    state.onHashChange = null;
    state.routeHref = '';
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
    const heavyBtn = mkBtn('optimizeHeavyBlocks', uiText('重内容优化：开', 'Heavy content optimization: on'), uiText('切换重内容优化（pre/table/公式/段落块等）', 'Toggle heavy content optimization (pre/table/formulas/markdown blocks, etc.)'));
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
    const snapshot = getCoreTurnsSnapshot(false);
    const container = state.containerEl || snapshot?.root || findTurnsContainer();
    detachIo();
    attachIo();
    state.structureDirty = true;
    if (!container) return;
    setContainerEl(container);
    const turns = snapshot?.turns?.length && snapshot.root === container ? snapshot.turns : getTurnElements(container);
    setTurnsCache(turns, container, snapshot?.turnsVersion || 0);
    updateDefaultIntrinsic(container, turns);
    syncObservedTurns(turns);
    ensureTurnsWatch(container);
  }

  function findFirstIndexByBottom(turns, topBound) {
    let lo = 0;
    let hi = turns.length - 1;
    let ans = turns.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const rect = turns[mid].getBoundingClientRect();
      if (rect.bottom >= topBound) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }

  function findLastIndexByTop(turns, bottomBound) {
    let lo = 0;
    let hi = turns.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const rect = turns[mid].getBoundingClientRect();
      if (rect.top <= bottomBound) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  function scheduleReconcile(turns, first, last) {
    if (!(turns && typeof turns.length === 'number')) return;
    const total = turns.length;
    if (!total) return;

    state.reconcileToken += 1;
    const token = state.reconcileToken;
    state.reconcileTurns = turns;
    state.reconcileIdx = 0;
    state.reconcileFirst = first;
    state.reconcileLast = last;

    const run = (deadline) => {
      if (token !== state.reconcileToken) return;
      const list = state.reconcileTurns;
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
        const metrics = state.turnMetrics.get(el);
        if (!metrics || metrics.estimated) {
          const tail = getTailTurn(list);
          if (!(tail && tail === el && isGeneratingResponse())) {
            setTurnMetrics(el, measureTurnMetrics(el));
          }
        }
        state.reconcileIdx += 1;
        processed += 1;
        if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 4) break;
        if (!deadline && processed >= 220) break;
      }

      if (token !== state.reconcileToken) return;
      if (state.reconcileIdx >= max) {
        state.reconcileTurns = null;
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
    const turns =
      state.turnsCache.length && state.turnsRoot === container
        ? state.turnsCache
        : getTurnElements(container);
    const total = turns.length;
    if (!total) return;
    setTurnsCache(turns, container, state.turnsVersion);

    const topBound = -marginPx;
    const bottomBound = window.innerHeight + marginPx;
    const first = findFirstIndexByBottom(turns, topBound);
    const last = findLastIndexByTop(turns, bottomBound);
    const hiddenCount = Math.max(0, first) + Math.max(0, total - last - 1);
    const unchangedWindow =
      first === state.lastVisibleFirst && last === state.lastVisibleLast && total === state.lastVisibleTotal;
    if (unchangedWindow && !state.structureDirty) return;
    state.lastVisibleFirst = first;
    state.lastVisibleLast = last;
    state.lastVisibleTotal = total;
    state.virtualizationActive = hiddenCount >= 2;

    if (!state.virtualizationActive) {
      state.reconcileToken += 1;
      state.reconcileTurns = null;
      state.budgetLevel = 0;
      setHotPathActive(false);
      state.structureDirty = false;
      for (let i = 0; i < total; i += 1) clearOffscreen(turns[i]);
      return;
    }

    const generating = isGeneratingResponse();
    const wasStructureDirty = state.structureDirty;
    const budget = collectBudgetSnapshot(total);
    setHotPathActive(!!(generating && computeBudgetLevel(budget) >= 2));
    const padItems = computeAdaptivePadItems({ generating, boostActive: state.boostActive, snapshot: budget });
    const start = Math.max(0, first - padItems);
    const end = Math.min(total - 1, last + padItems);
    for (let i = start; i <= end; i += 1) {
      const el = turns[i];
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
      scheduleReconcile(turns, first, last);
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
      if (!state.reconcileTurns) return;
      state.reconcileToken += 1;
      state.reconcileTurns = null;
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

    clearHotPathTimer();

    try { deactivateFindUnfreeze(); } catch {}

    try {
      if (state.ioRestartTimer) window.clearTimeout(state.ioRestartTimer);
    } catch {}
    state.ioRestartTimer = 0;

    try {
      if (state.uiHealTimer) window.clearTimeout(state.uiHealTimer);
    } catch {}
    state.uiHealTimer = 0;

    try { state.uiHealObserver?.disconnect?.(); } catch {}
    state.uiHealObserver = null;

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

    try {
      document.querySelectorAll(`.${TURN_CLASS}`).forEach((turnEl) => {
        try {
          turnEl.classList.remove(TURN_CLASS);
          turnEl.classList.remove(OFFSCREEN_CLASS);
          turnEl.style.removeProperty(INTRINSIC_VAR);
          if (turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1') turnEl.removeAttribute(COPY_UNFREEZE_ATTR);
        } catch {
          // ignore
        }
      });
    } catch {}
    setContainerEl(null);

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
    installUiSelfHeal();

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
