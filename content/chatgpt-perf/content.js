(() => {
  'use strict';

  const GLOBAL_STATE_KEY = '__cgpt_perf_mv3_state_v1__';
  const GLOBAL_HANDOFF_KEY = '__cgpt_perf_mv3_handoff_v1__';
  let initialHandoff = null;
  try {
    const prev = globalThis[GLOBAL_STATE_KEY];
    if (prev && typeof prev === 'object') {
      if (typeof prev.prepareForReload === 'function') prev.prepareForReload(GLOBAL_HANDOFF_KEY);
      else if (typeof prev.cleanup === 'function') prev.cleanup();
    }
    const handoff = globalThis[GLOBAL_HANDOFF_KEY];
    if (handoff && typeof handoff === 'object') initialHandoff = handoff;
  } catch {}
  try { delete globalThis[GLOBAL_HANDOFF_KEY]; } catch {}

  const EXT_VERSION = '0.1.63';

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
  const ROOT_OVERLAY_ATTR = 'data-cgptperf-overlay';
  const ROOT_OPTIONS_OPEN_ATTR = 'data-cgptperf-options-open';
  const ROOT_TURNS_SOURCE_ATTR = 'data-cgptperf-turns-source';
  const ROOT_ROUTE_SOURCE_ATTR = 'data-cgptperf-route-source';
  const ROOT_PARKED_COUNT_ATTR = 'data-cgptperf-parked-count';
  const ROOT_PARKED_PLACEHOLDERS_ATTR = 'data-cgptperf-parked-placeholders';
  const ROOT_PARKED_BYTES_ATTR = 'data-cgptperf-parked-bytes';
  const ROOT_PARKED_RAW_BYTES_ATTR = 'data-cgptperf-parked-raw-bytes';
  const ROOT_PARKED_COMPRESSED_COUNT_ATTR = 'data-cgptperf-parked-compressed-count';
  const ROOT_PARKED_SAVED_BYTES_ATTR = 'data-cgptperf-parked-saved-bytes';
  const ROOT_PARKED_LIVE_REFS_ATTR = 'data-cgptperf-parked-live-body-refs';
  const ROOT_PARKED_ESTIMATED_NODES_ATTR = 'data-cgptperf-parked-estimated-dom-nodes';
  const ROOT_PENDING_PARK_FRAMES_ATTR = 'data-cgptperf-pending-park-frames';
  const ROOT_PENDING_PARK_QUEUE_ATTR = 'data-cgptperf-pending-park-queue';
  const ROOT_PENDING_RESTORE_QUEUE_ATTR = 'data-cgptperf-pending-restore-queue';
  const ROOT_COLD_DEFERRED_ATTR = 'data-cgptperf-cold-deferred';
  const ROOT_TRUSTED_PARK_ATTR = 'data-cgptperf-trusted-park-turns';
  const ROOT_TURNS_CACHE_ATTR = 'data-cgptperf-turns-cache';
  const ROOT_ASSISTANT_OFFSCREEN_UNPARKED_ATTR = 'data-cgptperf-assistant-offscreen-unparked';
  const ROOT_ASSISTANT_OFFSCREEN_PARKABLE_ATTR = 'data-cgptperf-assistant-offscreen-parkable';
  const ROOT_ASSISTANT_OFFSCREEN_WARM_ATTR = 'data-cgptperf-assistant-offscreen-warm';
  const ROOT_LITE_CODE_COUNT_ATTR = 'data-cgptperf-lite-code-count';
  const ROOT_LITE_CODE_BYTES_ATTR = 'data-cgptperf-lite-code-bytes';
  const ROOT_LITE_CODE_RAW_BYTES_ATTR = 'data-cgptperf-lite-code-raw-bytes';
  const ROOT_LITE_CODE_SAVED_BYTES_ATTR = 'data-cgptperf-lite-code-saved-bytes';
  const ROOT_LITE_CODE_ESTIMATED_NODES_ATTR = 'data-cgptperf-lite-code-estimated-dom-nodes';
  const ROOT_VISIBLE_HEAVY_REASON_ATTR = 'data-cgptperf-visible-heavy-reason';
  const ROOT_VISIBLE_HEAVY_VISIBLE_TURNS_ATTR = 'data-cgptperf-visible-heavy-visible-turns';
  const ROOT_VISIBLE_HEAVY_PENDING_MATH_ATTR = 'data-cgptperf-visible-heavy-pending-math';
  const ROOT_VISIBLE_HEAVY_SIMPLIFIED_ATTR = 'data-cgptperf-visible-heavy-simplified';
  const ROOT_VISIBLE_HEAVY_AT_ATTR = 'data-cgptperf-visible-heavy-at';
  const ROOT_STARTUP_VIEWPORT_REASON_ATTR = 'data-cgptperf-startup-viewport-reason';
  const ROOT_STARTUP_VIEWPORT_SCROLLTOP_ATTR = 'data-cgptperf-startup-viewport-scrolltop';
  const ROOT_STARTUP_VIEWPORT_SCROLLER_ATTR = 'data-cgptperf-startup-viewport-scroller';
  const ROOT_LITE_MATH_LAST_REASON_ATTR = 'data-cgptperf-lite-math-last-reason';
  const ROOT_LITE_MATH_LAST_TEXT_LEN_ATTR = 'data-cgptperf-lite-math-last-text-len';
  const ROOT_LITE_MATH_LAST_HEIGHT_ATTR = 'data-cgptperf-lite-math-last-height';
  const ROOT_LITE_MATH_LAST_MARKUP_LEN_ATTR = 'data-cgptperf-lite-math-last-markup-len';
  const ROOT_BROKEN_MATH_COUNT_ATTR = 'data-cgptperf-broken-math-count';
  const MATHML_FALLBACK_ATTR = 'data-cgptperf-mathml-fallback';

  const OFFSCREEN_CLASS = 'cgptperf-offscreen';
  const TURN_CLASS = 'cgptperf-turn';
  const THREAD_CLASS = 'cgptperf-thread';
  const PARKED_ATTR = 'data-cgptperf-parked';
  const PARKED_BODY_CLASS = 'cgptperf-parked-body';
  const PARKED_PREVIEW_CLASS = 'cgptperf-parked-preview';
  const PARKED_PREVIEW_ATTR = 'data-cgptperf-preview';
  const PARKED_HANDOFF_MARKUP_ATTR = 'data-cgptperf-handoff-markup';
  const PARKED_HANDOFF_MODE_ATTR = 'data-cgptperf-handoff-mode';
  const PARKED_HANDOFF_RAW_BYTES_ATTR = 'data-cgptperf-handoff-raw-bytes';
  const PARKED_HANDOFF_SAVED_BYTES_ATTR = 'data-cgptperf-handoff-saved-bytes';
  const PARKED_HANDOFF_DOM_NODES_ATTR = 'data-cgptperf-handoff-dom-nodes';
  const PARKED_HANDOFF_KATEX_NODES_ATTR = 'data-cgptperf-handoff-katex-nodes';
  const PARKED_HANDOFF_HEAVY_BLOCKS_ATTR = 'data-cgptperf-handoff-heavy-blocks';
  const PARKED_HANDOFF_ESTIMATED_ATTR = 'data-cgptperf-handoff-estimated';
  const LITE_CODE_ATTR = 'data-cgptperf-lite-code';
  const LITE_CODE_ID_ATTR = 'data-cgptperf-lite-code-id';
  const LITE_CODE_MODE_ATTR = 'data-cgptperf-lite-code-mode';
  const LITE_CODE_PAYLOAD_ATTR = 'data-cgptperf-lite-code-payload';
  const LITE_CODE_RAW_BYTES_ITEM_ATTR = 'data-cgptperf-lite-code-raw-bytes';
  const LITE_CODE_SAVED_BYTES_ITEM_ATTR = 'data-cgptperf-lite-code-saved-bytes';
  const LITE_CODE_ESTIMATED_NODES_ITEM_ATTR = 'data-cgptperf-lite-code-estimated-nodes';
  const LITE_CODE_VIEW_ATTR = 'data-cgptperf-lite-code-view';
  const LITE_CODE_COLLAPSED_ATTR = 'data-cgptperf-lite-code-collapsed';
  const LITE_CODE_BLOCK_SIZE_VAR = '--cgptperf-lite-code-block-size';
  const LITE_CODE_PLAINTEXT_SIZE_VAR = '--cgptperf-lite-code-plaintext-size';
  const LITE_MATH_ATTR = 'data-cgptperf-lite-math';
  const LITE_MATH_ID_ATTR = 'data-cgptperf-lite-math-id';
  const LITE_MATH_BLOCK_SIZE_VAR = '--cgptperf-lite-math-block-size';
  const INTRINSIC_VAR = '--cgptperf-intrinsic-size';
  const VISIBLE_AUTO_ATTR = 'data-cgptperf-visible-auto';
  const VISIBLE_INTRINSIC_VAR = '--cgptperf-visible-intrinsic-size';
  const UI_ID = 'cgptperf-ui';
  const UI_TOGGLE_CLASS = 'cgptperf-toggle';
  const UI_PANEL_CLASS = 'cgptperf-panel';
  const TOAST_ID = 'cgptperf-toast';
  const COPY_UNFREEZE_ATTR = 'data-cgptperf-copy-unfreeze';
  const PARKED_MARKUP_MODE_RAW = 'raw';
  const PARKED_MARKUP_MODE_LZ16 = 'lz16';
  const PARKED_MARKUP_COMPRESS_MIN_CHARS = 4096;
  const PARKED_MARKUP_COMPRESS_MIN_SAVINGS_RATIO = 0.12;
  const LIGHT_TURN_PARK_MIN_DOM_NODES = 2600;
  const LIGHT_TURN_PARK_MIN_KATEX_NODES = 24;
  const LIGHT_TURN_PARK_MIN_HEAVY_BLOCKS = 8;
  const LIGHT_TURN_PARK_MIN_HEIGHT_PX = 2400;
  const LIGHT_THREAD_PARK_MIN_TURNS = 18;
  const LIGHT_THREAD_PARK_MIN_DOM_NODES = 4500;
  const LIGHT_THREAD_PARK_MIN_KATEX_NODES = 40;
  const LIGHT_THREAD_PARK_MIN_HEAVY_BLOCKS = 32;
  const PARKED_PREVIEW_BASE_MAX_CHARS = 220;
  const PARKED_PREVIEW_MEDIUM_MAX_CHARS = 360;
  const PARKED_PREVIEW_HEAVY_MAX_CHARS = 520;
  const VISIBLE_AUTO_CONTENT_MIN_HEIGHT_PX = 1600;
  const LITE_CODE_MIN_DESCENDANTS = 600;
  const LITE_CODE_MIN_TEXT_CHARS = 5000;
  const LITE_CODE_MIN_HEIGHT_PX = 1800;
  const LITE_CODE_MIN_HORIZONTAL_OVERFLOW_PX = 480;
  const LITE_CODE_PLAINTEXT_MIN_TEXT_CHARS = 20_000;
  const LITE_CODE_PLAINTEXT_MIN_HEIGHT_PX = 3_200;
  const LITE_CODE_PLAINTEXT_MIN_HORIZONTAL_OVERFLOW_PX = 1_200;
  const LITE_CODE_PLAINTEXT_MIN_DESCENDANTS = 900;
  const LITE_CODE_PLAINTEXT_MIN_DESCENDANTS_HEIGHT_PX = 2_200;
  const LITE_CODE_PREVIEW_MAX_LINES = 24;
  const LITE_CODE_PREVIEW_MAX_CHARS = 1200;
  const LITE_CODE_PREVIEW_MAX_LINE_CHARS = 160;
  const LITE_CODE_VIEW_PREVIEW = 'preview';
  const LITE_CODE_VIEW_PLAINTEXT = 'plaintext';
  const LITE_MATH_MIN_TURN_KATEX_NODES = 32;
  const LITE_MATH_MIN_DISPLAY_BLOCKS = 6;
  const LITE_MATH_MIN_TURN_HEIGHT_PX = 2800;
  const LITE_MATH_MIN_DENSE_TURN_HEIGHT_PX = 1800;
  const LITE_MATH_MIN_DENSE_TURN_DOM_NODES = 1400;
  const LITE_MATH_MIN_BLOCK_HEIGHT_PX = 280;
  const LITE_MATH_MIN_BLOCK_TEXT_CHARS = 18;
  const BROKEN_MATH_EMPTY_HOST_MAX_HEIGHT_PX = 4;
  const BROKEN_MATH_FALLBACK_RE = /(?:^|\s)\\(?:int|frac|sqrt|arctan|arcsin|sin|cos|tan|sec|ln|quad|ne|cdot|times|left|right|sum|prod|lim)\b|\\[\[\](){}]|^\]$/m;
  const WINDOW_SCROLL_SHIELD_MS = 260;
  const VISIBLE_PENDING_RESTORE_EARLY_MS = 120;
  const VISIBLE_PENDING_RESTORE_IDLE_MS = 72;
  const STARTUP_VIEWPORT_WATCH_MS = 240;
  const STARTUP_VIEWPORT_WATCH_MAX_TICKS = 28;
  const STARTUP_AGGRESSIVE_RECONCILE_MS = 6000;
  const AGGRESSIVE_RECONCILE_PARK_THRESHOLD = 24;
  const VISIBLE_HEAVY_RETRY_DELAY_MS = 420;
  const VISIBLE_HEAVY_RETRY_MAX_ATTEMPTS = 5;
  const MSG_GET_STATE = 'CGPT_PERF_GET_STATE';
  const FALLBACK_TURN_HOST_SELECTOR = 'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]';
  const FALLBACK_TURN_SELECTOR = `${FALLBACK_TURN_HOST_SELECTOR}, [data-testid^="conversation-turn-"]`;
  const USER_TURN_BODY_SELECTOR =
    '[data-message-author-role="user"] .whitespace-pre-wrap, [data-message-author-role="user"] div[data-message-content-part], [data-message-author-role="user"] .prose, div[data-message-author-role="user"] p, .text-message[data-author="user"]';
  const ASSISTANT_TURN_BODY_SELECTOR =
    '.deep-research-result, .border-token-border-sharp .markdown, [data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] .prose, [data-message-author-role="assistant"] div[data-message-content-part], div[data-message-author-role="assistant"] p, .text-message[data-author="assistant"]';
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
  const CODE_SCROLL_INTERACTION_SELECTOR = [
    '.cm-scroller',
    '.cm-editor',
    '.cm-content',
    'pre',
    'code',
    '.katex-display',
    '.katex-display > .katex',
    'mjx-container',
    '[data-testid*="code"]',
    '[class*="codeBlock"]',
    '[class*="CodeBlock"]'
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
    aggressiveReconcileUntil: 0,
    io: null,
    coreTurnsUnsub: null,
    coreRouteUnsub: null,
    containerEl: null,
    turnsRoot: null,
    turnsCache: [],
    turnsVersion: 0,
    turnsWatchSource: 'idle',
    routeWatchSource: 'idle',
    coreTurnRecordsVersion: 0,
    coreTurnRecordMap: null,
    parkedTurns: new WeakMap(),
    parkedTurnSet: new Set(),
    liteCodeBlocks: new WeakMap(),
    liteCodeBlockSet: new Set(),
    liteMathBlocks: new WeakMap(),
    liteMathBlockSet: new Set(),
    pendingParkFrames: new Map(),
    pendingParkTurns: new Map(),
    pendingParkRaf: 0,
    observedTurns: new Set(),
    lastHeights: new WeakMap(),
    lastBodyHeights: new WeakMap(),
    trustedParkTurns: new WeakSet(),
    coldDeferredTurns: new WeakSet(),
    turnMetrics: new WeakMap(),
    totalTurnDomNodes: 0,
    totalTurnKatexNodes: 0,
    totalTurnHeavyBlocks: 0,
    defaultIntrinsic: 420,
    uiCloseHandler: null,
    ioMarginPx: DEFAULT_SETTINGS.rootMarginPx,
    boostActive: false,
    optionsOpenState: '',
    optionsOpenTimer: 0,
    boostFocusTimer: 0,
    boostActionTimer: 0,
    codeScrollShieldUntil: 0,
    codeScrollResumeTimer: 0,
    windowScrollShieldUntil: 0,
    windowScrollResumeTimer: 0,
    lastWindowScrollAt: 0,
    restorePulseRaf: 0,
    parkingTelemetryRaf: 0,
    findTimer: 0,
    visibleHeavyPassTimers: new Set(),
    startupViewportWatchTimer: 0,
    startupViewportWatchTicks: 0,
    startupViewportLastScrollTop: 0,
    startupViewportTriggered: false,
    startupViewportLastReason: 'idle',
    startupViewportScrollerLabel: 'unset',
    visibleHeavyLastReason: 'idle',
    visibleHeavyLastVisibleTurns: 0,
    visibleHeavyLastPendingMathHosts: 0,
    visibleHeavyLastSimplified: 0,
    visibleHeavyLastAt: 0,
    liteMathLastReason: 'idle',
    liteMathLastTextLen: 0,
    liteMathLastHeight: 0,
    liteMathLastMarkupLen: 0,
    brokenMathCount: 0,
    ioRestartTimer: 0,
    virtualizeNowRaf: 0,
    pendingRestoreTurns: new Map(),
    pendingRestoreRaf: 0,
    pendingRestoreTimer: 0,
    pendingRestoreDueAt: 0,
    boostListenersAttached: false,
    rootAttrMo: null,
    disposed: false,
    onPointerDown: null,
    onClick: null,
    onKeydown: null,
    onFocusIn: null,
    onFocusOut: null,
    onScroll: null,
    onElementScroll: null,
    onResize: null,
    onVisibilityChange: null,
    onStorageChanged: null,
    onMessage: null,
    visibilityResumeTimer: 0,
    cleanup: null,
    routeHref: '',
    routePollTimer: 0,
    onPopState: null,
    onHashChange: null,
    fallbackTurnsMo: null,
    fallbackTurnsRoot: null,
    fallbackTurnsTimer: 0,
    fallbackTailTimer: 0,
    uiMountReady: false,
    uiMountTimer: 0,
    uiMountMaxTimer: 0,
    uiMountRaf: 0,
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
    liteCodeSweepToken: 0,
    liteCodeSweepTurns: null,
    liteCodeSweepIdx: 0,
    liteCodeSweepStart: 0,
    liteCodeSweepEnd: -1,
    nextLiteCodeId: 1,
    nextLiteMathId: 1,
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

  function isCodeScrollInteractionTarget(target) {
    try {
      const el =
        target instanceof Element
          ? target
          : target && target.nodeType === 3
            ? target.parentElement
            : null;
      if (!(el instanceof Element) || !el.closest) return false;
      return !!el.closest(CODE_SCROLL_INTERACTION_SELECTOR);
    } catch {
      return false;
    }
  }

  function isWindowScrollInteractionTarget(target) {
    try {
      const el =
        target instanceof Element
          ? target
          : target && target.nodeType === 3
            ? target.parentElement
            : null;
      if (!(el instanceof HTMLElement)) return false;
      if (el === document.documentElement || el === document.body) return true;
      if (isCodeScrollInteractionTarget(el)) return false;
      const container = state.containerEl || state.turnsRoot;
      if (!(container instanceof HTMLElement)) return false;
      if (!(el === container || el.contains(container))) return false;
      const scrollRange = Math.max(0, Number(el.scrollHeight) - Number(el.clientHeight));
      return scrollRange >= Math.max(window.innerHeight, 1200);
    } catch {
      return false;
    }
  }

  function describeElementForTelemetry(el) {
    if (!(el instanceof Element)) return 'none';
    const tag = String(el.tagName || 'node').toLowerCase();
    const id = String(el.id || '').trim();
    const classes = Array.from(el.classList || []).slice(0, 2).join('.');
    if (id) return `${tag}#${id}`;
    if (classes) return `${tag}.${classes}`;
    return tag;
  }

  function isScrollableViewportCandidate(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el === document.body || el === document.documentElement) return true;
    const scrollRange = Math.max(0, Number(el.scrollHeight) - Number(el.clientHeight));
    if (scrollRange < Math.max(240, Math.round((window.innerHeight || 0) * 0.25))) return false;
    try {
      const style = window.getComputedStyle(el);
      const overflowY = String(style?.overflowY || '').toLowerCase();
      if (overflowY === 'scroll' || overflowY === 'auto' || overflowY === 'overlay') return true;
    } catch {
      // ignore
    }
    return Number(el.scrollTop) > 0;
  }

  function publishRuntimeDebugTelemetry() {
    const html = document.documentElement;
    if (!(html instanceof HTMLElement)) return;
    try {
      html.setAttribute(ROOT_VISIBLE_HEAVY_REASON_ATTR, String(state.visibleHeavyLastReason || 'idle'));
      html.setAttribute(ROOT_VISIBLE_HEAVY_VISIBLE_TURNS_ATTR, String(Math.max(0, Number(state.visibleHeavyLastVisibleTurns) || 0)));
      html.setAttribute(ROOT_VISIBLE_HEAVY_PENDING_MATH_ATTR, String(Math.max(0, Number(state.visibleHeavyLastPendingMathHosts) || 0)));
      html.setAttribute(ROOT_VISIBLE_HEAVY_SIMPLIFIED_ATTR, String(Math.max(0, Number(state.visibleHeavyLastSimplified) || 0)));
      html.setAttribute(ROOT_VISIBLE_HEAVY_AT_ATTR, String(Math.round(Number(state.visibleHeavyLastAt) || 0)));
      html.setAttribute(ROOT_STARTUP_VIEWPORT_REASON_ATTR, String(state.startupViewportLastReason || 'idle'));
      html.setAttribute(ROOT_STARTUP_VIEWPORT_SCROLLTOP_ATTR, String(Math.round(Number(state.startupViewportLastScrollTop) || 0)));
      html.setAttribute(ROOT_STARTUP_VIEWPORT_SCROLLER_ATTR, String(state.startupViewportScrollerLabel || 'unset'));
      html.setAttribute(ROOT_LITE_MATH_LAST_REASON_ATTR, String(state.liteMathLastReason || 'idle'));
      html.setAttribute(ROOT_LITE_MATH_LAST_TEXT_LEN_ATTR, String(Math.max(0, Number(state.liteMathLastTextLen) || 0)));
      html.setAttribute(ROOT_LITE_MATH_LAST_HEIGHT_ATTR, String(Math.max(0, Number(state.liteMathLastHeight) || 0)));
      html.setAttribute(ROOT_LITE_MATH_LAST_MARKUP_LEN_ATTR, String(Math.max(0, Number(state.liteMathLastMarkupLen) || 0)));
      html.setAttribute(ROOT_BROKEN_MATH_COUNT_ATTR, String(Math.max(0, Number(state.brokenMathCount) || 0)));
    } catch {
      // ignore
    }
  }

  function recordLiteMathDebug(reason, hostEl, meta = null) {
    state.liteMathLastReason = String(reason || 'unknown');
    state.liteMathLastTextLen = Math.max(0, Number(meta?.textLen) || 0);
    state.liteMathLastHeight = Math.max(0, Number(meta?.height) || 0);
    state.liteMathLastMarkupLen = Math.max(0, Number(meta?.markupLen) || 0);
    publishRuntimeDebugTelemetry();
  }

  function nowPerf() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  }

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  // Keep parking restore synchronous while shrinking large HTML strings in JS heap.
  function lzCompress(sourceInput, bitsPerChar, getCharFromInt) {
    if (sourceInput == null) return '';
    const source = String(sourceInput);
    if (!source) return '';

    let i;
    let value;
    const dictionary = Object.create(null);
    const pending = Object.create(null);
    let c = '';
    let wc = '';
    let w = '';
    let enlargeIn = 2;
    let dictSize = 3;
    let numBits = 2;
    const out = [];
    let outVal = 0;
    let outPos = 0;

    const pushValueBit = (bit) => {
      outVal = (outVal << 1) | (bit & 1);
      if (outPos === bitsPerChar - 1) {
        outPos = 0;
        out.push(getCharFromInt(outVal));
        outVal = 0;
      } else {
        outPos += 1;
      }
    };

    for (let ii = 0; ii < source.length; ii += 1) {
      c = source.charAt(ii);
      if (!hasOwn(dictionary, c)) {
        dictionary[c] = dictSize++;
        pending[c] = true;
      }

      wc = w + c;
      if (hasOwn(dictionary, wc)) {
        w = wc;
      } else {
        if (hasOwn(pending, w)) {
          if (w.charCodeAt(0) < 256) {
            for (i = 0; i < numBits; i += 1) pushValueBit(0);
            value = w.charCodeAt(0);
            for (i = 0; i < 8; i += 1) {
              pushValueBit(value & 1);
              value >>= 1;
            }
          } else {
            value = 1;
            for (i = 0; i < numBits; i += 1) {
              pushValueBit(value);
              value = 0;
            }
            value = w.charCodeAt(0);
            for (i = 0; i < 16; i += 1) {
              pushValueBit(value & 1);
              value >>= 1;
            }
          }
          enlargeIn -= 1;
          if (enlargeIn === 0) {
            enlargeIn = Math.pow(2, numBits);
            numBits += 1;
          }
          delete pending[w];
        } else {
          value = dictionary[w];
          for (i = 0; i < numBits; i += 1) {
            pushValueBit(value & 1);
            value >>= 1;
          }
        }

        enlargeIn -= 1;
        if (enlargeIn === 0) {
          enlargeIn = Math.pow(2, numBits);
          numBits += 1;
        }
        dictionary[wc] = dictSize++;
        w = String(c);
      }
    }

    if (w !== '') {
      if (hasOwn(pending, w)) {
        if (w.charCodeAt(0) < 256) {
          for (i = 0; i < numBits; i += 1) pushValueBit(0);
          value = w.charCodeAt(0);
          for (i = 0; i < 8; i += 1) {
            pushValueBit(value & 1);
            value >>= 1;
          }
        } else {
          value = 1;
          for (i = 0; i < numBits; i += 1) {
            pushValueBit(value);
            value = 0;
          }
          value = w.charCodeAt(0);
          for (i = 0; i < 16; i += 1) {
            pushValueBit(value & 1);
            value >>= 1;
          }
        }
        enlargeIn -= 1;
        if (enlargeIn === 0) {
          enlargeIn = Math.pow(2, numBits);
          numBits += 1;
        }
        delete pending[w];
      } else {
        value = dictionary[w];
        for (i = 0; i < numBits; i += 1) {
          pushValueBit(value & 1);
          value >>= 1;
        }
      }

      enlargeIn -= 1;
      if (enlargeIn === 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits += 1;
      }
    }

    value = 2;
    for (i = 0; i < numBits; i += 1) {
      pushValueBit(value & 1);
      value >>= 1;
    }

    while (true) {
      outVal <<= 1;
      if (outPos === bitsPerChar - 1) {
        out.push(getCharFromInt(outVal));
        break;
      }
      outPos += 1;
    }

    return out.join('');
  }

  function lzDecompress(length, resetValue, getNextValue) {
    if (!Number.isFinite(length) || length <= 0) return '';

    const dictionary = [];
    let next;
    let enlargeIn = 4;
    let dictSize = 4;
    let numBits = 3;
    let entry = '';
    const result = [];
    let i;
    let w;
    let bits;
    let resb;
    let maxpower;
    let power;
    let c;
    const data = { val: getNextValue(0), position: resetValue, index: 1 };

    for (i = 0; i < 3; i += 1) dictionary[i] = i;

    bits = 0;
    maxpower = Math.pow(2, 2);
    power = 1;
    while (power !== maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }

    switch ((next = bits)) {
      case 0:
        bits = 0;
        maxpower = Math.pow(2, 8);
        power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        c = String.fromCharCode(bits);
        break;
      case 1:
        bits = 0;
        maxpower = Math.pow(2, 16);
        power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        c = String.fromCharCode(bits);
        break;
      case 2:
        return '';
      default:
        c = '';
        break;
    }

    dictionary[3] = c;
    w = c;
    result.push(c);

    while (true) {
      if (data.index > length) return '';

      bits = 0;
      maxpower = Math.pow(2, numBits);
      power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }

      switch ((c = bits)) {
        case 0:
          bits = 0;
          maxpower = Math.pow(2, 8);
          power = 1;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          dictionary[dictSize++] = String.fromCharCode(bits);
          c = dictSize - 1;
          enlargeIn -= 1;
          break;
        case 1:
          bits = 0;
          maxpower = Math.pow(2, 16);
          power = 1;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          dictionary[dictSize++] = String.fromCharCode(bits);
          c = dictSize - 1;
          enlargeIn -= 1;
          break;
        case 2:
          return result.join('');
        default:
          break;
      }

      if (enlargeIn === 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits += 1;
      }

      if (dictionary[c]) {
        entry = dictionary[c];
      } else if (c === dictSize) {
        entry = w + w.charAt(0);
      } else {
        return '';
      }
      result.push(entry);

      dictionary[dictSize++] = w + entry.charAt(0);
      enlargeIn -= 1;
      w = entry;

      if (enlargeIn === 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits += 1;
      }
    }
  }

  function lzCompressToUtf16(input) {
    return lzCompress(input, 15, (value) => String.fromCharCode(value + 32)) + ' ';
  }

  function lzDecompressFromUtf16(input) {
    if (input == null) return '';
    const source = String(input);
    if (!source) return '';
    return lzDecompress(source.length, 16384, (index) => source.charCodeAt(index) - 32);
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

  function hasCoreTurnsRuntime() {
    try {
      const core = getChatgptCoreApi();
      return !!(core && typeof core.onTurnsChange === 'function' && typeof core.getTurnsSnapshot === 'function');
    } catch {
      return false;
    }
  }

  function publishPerfRuntimeState() {
    try {
      const core = getChatgptCoreApi();
      if (!core || typeof core.setPerfSnapshot !== 'function') return;
      core.setPerfSnapshot({
        enabled: !!state.settings.enabled,
        windowingEnabled: !!(state.settings.enabled && state.settings.virtualizeOffscreen),
        heavyEnabled: !!(state.settings.enabled && state.settings.optimizeHeavyBlocks),
        hotPathActive: !!state.hotPathActive,
        virtualizationActive: !!state.virtualizationActive,
        budgetLevel: Math.max(0, Number(state.budgetLevel) || 0),
        isTurnOffscreen: (turnEl) => {
          try {
            return !!(turnEl instanceof HTMLElement && turnEl.classList.contains(OFFSCREEN_CLASS));
          } catch {
            return false;
          }
        }
      });
    } catch {
      // ignore
    }
  }

  function clearPerfRuntimeState() {
    try {
      const core = getChatgptCoreApi();
      if (core && typeof core.clearPerfSnapshot === 'function') core.clearPerfSnapshot();
    } catch {
      // ignore
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

  function getCoreTurnRecordsSnapshot(force = false) {
    try {
      const core = getChatgptCoreApi();
      if (typeof core?.getTurnRecordsSnapshot !== 'function') return null;
      const snapshot = core.getTurnRecordsSnapshot(force);
      if (!snapshot || typeof snapshot !== 'object') return null;
      const records = Array.isArray(snapshot.records) ? snapshot.records.filter((item) => item && item.turnEl instanceof HTMLElement) : [];
      return {
        records,
        recordsVersion: Number.isFinite(Number(snapshot.recordsVersion)) ? Number(snapshot.recordsVersion) : 0,
        turnsVersion: Number.isFinite(Number(snapshot.turnsVersion)) ? Number(snapshot.turnsVersion) : 0
      };
    } catch {
      return null;
    }
  }

  function getCoreTurnRecordMap(force = false) {
    const snapshot = getCoreTurnRecordsSnapshot(force);
    const version = Number(snapshot?.recordsVersion || snapshot?.turnsVersion || 0);
    if (!force && state.coreTurnRecordMap instanceof Map && state.coreTurnRecordsVersion === version) {
      return state.coreTurnRecordMap;
    }
    if (!snapshot || !Array.isArray(snapshot.records) || !snapshot.records.length) {
      state.coreTurnRecordMap = null;
      state.coreTurnRecordsVersion = 0;
      return null;
    }
    const map = new Map();
    for (const record of snapshot.records) {
      try {
        if (record?.turnEl instanceof HTMLElement) map.set(record.turnEl, record);
      } catch {
        // ignore
      }
    }
    state.coreTurnRecordMap = map;
    state.coreTurnRecordsVersion = version;
    return map;
  }

  function getCoreTurnRecord(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return null;
    const map = getCoreTurnRecordMap(false);
    if (!(map instanceof Map)) return null;
    return map.get(turnEl) || null;
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
    if (Array.isArray(turns)) {
      const allElements = turns.every((item) => item instanceof HTMLElement);
      state.turnsCache = allElements ? turns : turns.filter((item) => item instanceof HTMLElement);
    } else {
      state.turnsCache = [];
    }
    state.turnsRoot = root instanceof HTMLElement ? root : state.turnsRoot;
    if (Number.isFinite(Number(version)) && Number(version) > 0) state.turnsVersion = Number(version);
  }

  function getTailTurn(turns = state.turnsCache) {
    const list = Array.isArray(turns) ? turns : state.turnsCache;
    if (!list || !list.length) return null;
    const tail = list[list.length - 1];
    return tail instanceof HTMLElement ? tail : null;
  }

  function getParkedTurnState(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return null;
    return state.parkedTurns.get(turnEl) || null;
  }

  function collectParkingTelemetry() {
    let parkedCount = 0;
    let placeholderCount = 0;
    let serializedBytes = 0;
    let rawSerializedBytes = 0;
    let compressedCount = 0;
    let savedBytes = 0;
    let retainedLiveBodyRefs = 0;
    let estimatedDomNodes = 0;

    for (const turnEl of Array.from(state.parkedTurnSet)) {
      if (!(turnEl instanceof HTMLElement)) continue;
      if (!turnEl.isConnected) {
        clearParkedTurnState(turnEl);
        continue;
      }
      const parked = state.parkedTurns.get(turnEl);
      if (!parked) {
        state.parkedTurnSet.delete(turnEl);
        continue;
      }
      const placeholder = parked.placeholder instanceof HTMLElement ? parked.placeholder : null;
      if (placeholder && !placeholder.isConnected) {
        clearParkedTurnState(turnEl);
        continue;
      }
      const persisted = readParkedHandoffAttrs(placeholder);
      const serializedMarkup =
        typeof parked.serializedBodyMarkup === 'string'
          ? parked.serializedBodyMarkup
          : typeof persisted?.serializedBodyMarkup === 'string'
            ? persisted.serializedBodyMarkup
            : '';
      const serializedMode =
        typeof parked.serializedBodyMode === 'string' && parked.serializedBodyMode
          ? parked.serializedBodyMode
          : typeof persisted?.serializedBodyMode === 'string' && persisted.serializedBodyMode
            ? persisted.serializedBodyMode
            : PARKED_MARKUP_MODE_RAW;
      const serializedRawBytes = Math.max(
        0,
        Number(
          parked.serializedBodyRawBytes ??
          persisted?.serializedBodyRawBytes
        ) || 0
      );
      const serializedSavedBytes = Math.max(
        0,
        Number(
          parked.serializedBodySavedBytes ??
          persisted?.serializedBodySavedBytes
        ) || 0
      );
      parkedCount += 1;
      if (placeholder instanceof HTMLElement) placeholderCount += 1;
      if (serializedMarkup) serializedBytes += serializedMarkup.length;
      rawSerializedBytes += serializedRawBytes;
      if (serializedMarkup && serializedMode === PARKED_MARKUP_MODE_LZ16) compressedCount += 1;
      savedBytes += serializedSavedBytes;
      if (parked.bodyEl instanceof HTMLElement) retainedLiveBodyRefs += 1;
      if (parked.metrics && typeof parked.metrics === 'object') {
        estimatedDomNodes += Math.max(0, Number(parked.metrics.domNodes) || 0);
      } else if (persisted?.metrics && typeof persisted.metrics === 'object') {
        estimatedDomNodes += Math.max(0, Number(persisted.metrics.domNodes) || 0);
      }
    }

    return {
      parkedCount,
      placeholderCount,
      serializedBytes,
      rawSerializedBytes,
      compressedCount,
      savedBytes,
      retainedLiveBodyRefs,
      estimatedDomNodes
    };
  }

  function collectLiteCodeTelemetry() {
    let liteCodeCount = 0;
    let serializedBytes = 0;
    let rawSerializedBytes = 0;
    let savedBytes = 0;
    let estimatedDomNodes = 0;

    for (const hostEl of Array.from(state.liteCodeBlockSet)) {
      if (!(hostEl instanceof HTMLElement) || !hostEl.isConnected) {
        state.liteCodeBlockSet.delete(hostEl);
        continue;
      }
      const lite = getLiteCodeBlockState(hostEl);
      if (!lite) {
        state.liteCodeBlockSet.delete(hostEl);
        continue;
      }
      liteCodeCount += 1;
      if (typeof lite.serializedMarkup === 'string') serializedBytes += lite.serializedMarkup.length;
      rawSerializedBytes += Math.max(0, Number(lite.serializedRawBytes) || 0);
      savedBytes += Math.max(0, Number(lite.serializedSavedBytes) || 0);
      estimatedDomNodes += Math.max(0, Number(lite.estimatedDomNodes) || 0);
    }

    return {
      liteCodeCount,
      serializedBytes,
      rawSerializedBytes,
      savedBytes,
      estimatedDomNodes
    };
  }

  function publishParkingTelemetry() {
    try {
      if (state.parkingTelemetryRaf) window.cancelAnimationFrame(state.parkingTelemetryRaf);
    } catch {
      // ignore
    }
    state.parkingTelemetryRaf = 0;
    const html = document.documentElement;
    if (!html) return;
    const telemetry = collectParkingTelemetry();
    const liteTelemetry = collectLiteCodeTelemetry();
    let coldDeferredCount = 0;
    let trustedParkCount = 0;
    let assistantOffscreenUnparked = 0;
    let assistantOffscreenParkable = 0;
    let assistantOffscreenWarm = 0;
    try {
      assistantOffscreenUnparked = state.turnsCache.reduce((count, turnEl) => {
        if (!(turnEl instanceof HTMLElement)) return count;
        if (state.coldDeferredTurns.has(turnEl)) coldDeferredCount += 1;
        if (state.trustedParkTurns.has(turnEl)) trustedParkCount += 1;
        if (!turnEl.classList.contains(OFFSCREEN_CLASS) || getParkedTurnState(turnEl)) return count;
        const record = getCoreTurnRecord(turnEl);
        const role = inferTurnRoleForParking(turnEl, record);
        if (role !== 'assistant') return count;
        const bodyEl = findTurnBodyElForParking(turnEl, role, record);
        if (canParkTurnBody(turnEl, bodyEl, role)) assistantOffscreenParkable += 1;
        if (shouldKeepOffscreenWarm(turnEl)) assistantOffscreenWarm += 1;
        return count + 1;
      }, 0);
    } catch {
      coldDeferredCount = 0;
      trustedParkCount = 0;
      assistantOffscreenUnparked = 0;
      assistantOffscreenParkable = 0;
      assistantOffscreenWarm = 0;
    }
    try {
      html.setAttribute(ROOT_PARKED_COUNT_ATTR, String(telemetry.parkedCount));
      html.setAttribute(ROOT_PARKED_PLACEHOLDERS_ATTR, String(telemetry.placeholderCount));
      html.setAttribute(ROOT_PARKED_BYTES_ATTR, String(telemetry.serializedBytes));
      html.setAttribute(ROOT_PARKED_RAW_BYTES_ATTR, String(telemetry.rawSerializedBytes));
      html.setAttribute(ROOT_PARKED_COMPRESSED_COUNT_ATTR, String(telemetry.compressedCount));
      html.setAttribute(ROOT_PARKED_SAVED_BYTES_ATTR, String(telemetry.savedBytes));
      html.setAttribute(ROOT_PARKED_LIVE_REFS_ATTR, String(telemetry.retainedLiveBodyRefs));
      html.setAttribute(ROOT_PARKED_ESTIMATED_NODES_ATTR, String(telemetry.estimatedDomNodes));
      html.setAttribute(ROOT_PENDING_PARK_FRAMES_ATTR, String(state.pendingParkFrames.size));
      html.setAttribute(ROOT_PENDING_PARK_QUEUE_ATTR, String(state.pendingParkTurns.size));
      html.setAttribute(ROOT_PENDING_RESTORE_QUEUE_ATTR, String(state.pendingRestoreTurns.size));
      html.setAttribute(ROOT_COLD_DEFERRED_ATTR, String(coldDeferredCount));
      html.setAttribute(ROOT_TRUSTED_PARK_ATTR, String(trustedParkCount));
      html.setAttribute(ROOT_TURNS_CACHE_ATTR, String(state.turnsCache.length));
      html.setAttribute(ROOT_ASSISTANT_OFFSCREEN_UNPARKED_ATTR, String(assistantOffscreenUnparked));
      html.setAttribute(ROOT_ASSISTANT_OFFSCREEN_PARKABLE_ATTR, String(assistantOffscreenParkable));
      html.setAttribute(ROOT_ASSISTANT_OFFSCREEN_WARM_ATTR, String(assistantOffscreenWarm));
      html.setAttribute(ROOT_LITE_CODE_COUNT_ATTR, String(liteTelemetry.liteCodeCount));
      html.setAttribute(ROOT_LITE_CODE_BYTES_ATTR, String(liteTelemetry.serializedBytes));
      html.setAttribute(ROOT_LITE_CODE_RAW_BYTES_ATTR, String(liteTelemetry.rawSerializedBytes));
      html.setAttribute(ROOT_LITE_CODE_SAVED_BYTES_ATTR, String(liteTelemetry.savedBytes));
      html.setAttribute(ROOT_LITE_CODE_ESTIMATED_NODES_ATTR, String(liteTelemetry.estimatedDomNodes));
    } catch {
      // ignore
    }
  }

  function scheduleParkingTelemetryPublish() {
    if (state.disposed) return;
    if (state.parkingTelemetryRaf) return;
    state.parkingTelemetryRaf = window.requestAnimationFrame(() => {
      state.parkingTelemetryRaf = 0;
      publishParkingTelemetry();
    });
  }

  function cancelPendingPark(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return;
    const pending = state.pendingParkFrames.get(turnEl);
    if (pending) {
      try {
        if (pending.raf1) window.cancelAnimationFrame(pending.raf1);
      } catch {}
      try {
        if (pending.raf2) window.cancelAnimationFrame(pending.raf2);
      } catch {}
      state.pendingParkFrames.delete(turnEl);
      scheduleParkingTelemetryPublish();
    }
    cancelQueuedParkTurn(turnEl);
  }

  function cancelAllPendingParks() {
    for (const turnEl of Array.from(state.pendingParkFrames.keys())) cancelPendingPark(turnEl);
  }

  function cancelQueuedParkTurn(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return;
    if (!state.pendingParkTurns.delete(turnEl)) return;
    scheduleParkingTelemetryPublish();
  }

  function cancelAllQueuedParks() {
    const hadQueuedTurns = state.pendingParkTurns.size > 0;
    state.pendingParkTurns.clear();
    try {
      if (state.pendingParkRaf) window.cancelAnimationFrame(state.pendingParkRaf);
    } catch {
      // ignore
    }
    state.pendingParkRaf = 0;
    if (hadQueuedTurns) scheduleParkingTelemetryPublish();
  }

  function rememberTurnHeight(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return 0;
    const next = Math.round(Number(measuredHeight) || 0);
    const prev = Math.round(Number(state.lastHeights.get(turnEl)) || 0);
    if (next <= 0) return prev > 0 ? prev : 0;
    const remembered = prev > 0 ? Math.max(prev, next) : next;
    state.lastHeights.set(turnEl, remembered);
    return remembered;
  }

  function commitTurnHeight(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return 0;
    const next = Math.round(Number(measuredHeight) || 0);
    if (next <= 0) return Math.round(Number(state.lastHeights.get(turnEl)) || 0);
    state.lastHeights.set(turnEl, next);
    return next;
  }

  function primeTurnHeight(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return 0;
    if (state.lastHeights.has(turnEl)) return Math.round(Number(state.lastHeights.get(turnEl)) || 0);
    const measured = measureTurnHeightExact(turnEl);
    return rememberTurnHeight(turnEl, measured);
  }

  function rememberTurnBodyHeight(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return 0;
    const next = Math.round(Number(measuredHeight) || 0);
    if (next <= 0) {
      return Math.round(Number(state.lastBodyHeights.get(turnEl)) || 0);
    }
    state.lastBodyHeights.set(turnEl, next);
    return next;
  }

  function commitTurnBodyHeight(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return 0;
    const next = Math.round(Number(measuredHeight) || 0);
    if (next <= 0) return Math.round(Number(state.lastBodyHeights.get(turnEl)) || 0);
    state.lastBodyHeights.set(turnEl, next);
    return next;
  }

  function coldParkSuspicionThresholdPx() {
    return clampInt(window.innerHeight * 3.25, 2400, 6000);
  }

  function withTurnUnfrozen(turnEl, reader) {
    if (!(turnEl instanceof HTMLElement) || typeof reader !== 'function') return 0;
    const hadAttr = turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1';
    try {
      if (!hadAttr) turnEl.setAttribute(COPY_UNFREEZE_ATTR, '1');
      turnEl.getBoundingClientRect();
      return reader();
    } catch {
      return 0;
    } finally {
      if (!hadAttr) {
        try {
          turnEl.removeAttribute(COPY_UNFREEZE_ATTR);
        } catch {
          // ignore
        }
      }
    }
  }

  function measureTurnHeightExact(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return 0;
    return withTurnUnfrozen(turnEl, () => {
      let next = 0;
      try {
        next = Math.round(turnEl.getBoundingClientRect().height);
      } catch {
        next = 0;
      }
      if (next <= 0) {
        try {
          next = Math.round(turnEl.offsetHeight || 0);
        } catch {
          next = 0;
        }
      }
      if (next <= 0) {
        try {
          next = Math.round(turnEl.scrollHeight || 0);
        } catch {
          next = 0;
        }
      }
      return next;
    });
  }

  function isTurnCloseToViewport(turnEl, marginPx = Math.max(window.innerHeight * 0.35, 180)) {
    if (!(turnEl instanceof HTMLElement)) return false;
    try {
      const rect = turnEl.getBoundingClientRect();
      return rect.bottom >= -marginPx && rect.top <= window.innerHeight + marginPx;
    } catch {
      return false;
    }
  }

  function getTurnViewportDistance(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
    try {
      const rect = turnEl.getBoundingClientRect();
      if (rect.bottom < 0) return Math.abs(rect.bottom);
      if (rect.top > window.innerHeight) return Math.abs(rect.top - window.innerHeight);
      return 0;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  function hasActiveSelectionIn(root) {
    if (!(root instanceof Element)) return false;
    try {
      const activeEl = document.activeElement;
      if (activeEl instanceof Element && root.contains(activeEl)) return true;
    } catch {
      // ignore
    }
    try {
      const sel = document.getSelection?.();
      if (!sel || sel.rangeCount < 1) return false;
      const anchorNode = sel.anchorNode;
      const focusNode = sel.focusNode;
      if (anchorNode && root.contains(anchorNode)) return true;
      if (focusNode && root.contains(focusNode)) return true;
    } catch {
      // ignore
    }
    return false;
  }

  function collectFallbackParkedPreview(bodyEl, hardCap = 220, nodeCap = 120) {
    if (!(bodyEl instanceof Element)) return '';
    let out = '';
    let scanned = 0;
    let lastWasSpace = false;
    let walker = null;
    try {
      walker = document.createTreeWalker(
        bodyEl,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            try {
              if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
              const parent = node.parentElement;
              if (parent && parent.closest?.('pre, .katex-display, mjx-container, table')) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            } catch {
              return NodeFilter.FILTER_REJECT;
            }
          }
        }
      );
    } catch {
      walker = null;
    }
    if (!walker) {
      try {
        const text = String(bodyEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) return '';
        return text.length > hardCap ? text.slice(0, hardCap) : text;
      } catch {
        return '';
      }
    }
    while (walker.nextNode()) {
      scanned += 1;
      if (scanned > nodeCap || out.length >= hardCap) break;
      const text = String(walker.currentNode?.nodeValue || '');
      if (!text) continue;
      for (let i = 0; i < text.length && out.length < hardCap; i += 1) {
        const ch = text[i];
        const isSpace = ch <= ' ' || /\s/.test(ch);
        if (isSpace) {
          if (!lastWasSpace && out.length) {
            out += ' ';
            lastWasSpace = true;
          }
          continue;
        }
        out += ch;
        lastWasSpace = false;
      }
    }
    return out.trim();
  }

  function getParkedPreviewText(record, bodyEl) {
    const raw = String(record?.preview || bodyEl?.getAttribute?.(PARKED_PREVIEW_ATTR) || collectFallbackParkedPreview(bodyEl) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    const bodyHeight = Math.max(
      0,
      Math.round(Number(bodyEl?.scrollHeight) || Number(bodyEl?.getBoundingClientRect?.().height) || 0)
    );
    const previewCap =
      bodyHeight >= 2400
        ? PARKED_PREVIEW_HEAVY_MAX_CHARS
        : bodyHeight >= 1400
          ? PARKED_PREVIEW_MEDIUM_MAX_CHARS
          : PARKED_PREVIEW_BASE_MAX_CHARS;
    return raw.length > previewCap ? raw.slice(0, previewCap) : raw;
  }

  function inferTurnRoleForParking(turnEl, record) {
    const normalized = String(record?.role || '').trim();
    if (normalized === 'assistant' || normalized === 'user') return normalized;

    let testId = '';
    try {
      testId = String(turnEl?.getAttribute?.('data-testid') || '').trim();
    } catch {
      testId = '';
    }
    try {
      if (
        turnEl?.querySelector?.('[data-message-author-role="assistant"]') ||
        turnEl?.querySelector?.('.text-message[data-author="assistant"]') ||
        /\bassistant\b/i.test(testId)
      ) {
        return 'assistant';
      }
    } catch {
      // ignore
    }
    try {
      if (
        turnEl?.querySelector?.('[data-message-author-role="user"]') ||
        turnEl?.querySelector?.('.text-message[data-author="user"]') ||
        /\buser\b/i.test(testId)
      ) {
        return 'user';
      }
    } catch {
      // ignore
    }
    return '';
  }

  function findTurnBodyElForParking(turnEl, role, record) {
    if (!(turnEl instanceof HTMLElement)) return null;

    const normalizedRole = String(role || '').trim();
    const selector = normalizedRole === 'user' ? USER_TURN_BODY_SELECTOR : ASSISTANT_TURN_BODY_SELECTOR;
    try {
      const body = turnEl.querySelector(selector);
      if (body instanceof HTMLElement) return body;
    } catch {
      // ignore
    }
    if (normalizedRole !== 'user') {
      try {
        const fallback = turnEl.querySelector(USER_TURN_BODY_SELECTOR);
        if (fallback instanceof HTMLElement) return fallback;
      } catch {
        // ignore
      }
    }
    return turnEl;
  }

  function canParkTurnBody(turnEl, bodyEl, role) {
    if (!(turnEl instanceof HTMLElement) || !(bodyEl instanceof HTMLElement)) return false;
    if (bodyEl === turnEl) return false;
    if (String(role || '').trim() !== 'assistant') return false;
    if (turnEl === getTailTurn() && isGeneratingResponse(true)) return false;
    if (turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1') return false;
    if (document.documentElement?.getAttribute?.(ROOT_FIND_ATTR) === '1') return false;
    if (hasActiveSelectionIn(bodyEl)) return false;
    try {
      if (
        bodyEl.querySelector(
          [
            'iframe',
            'canvas',
            'video',
            'audio',
            'textarea',
            'input',
            '[contenteditable="true"]',
            '[role="textbox"]',
            '.ProseMirror'
          ].join(', ')
        )
      ) {
        return false;
      }
    } catch {
      // ignore
    }
    return true;
  }

  function createParkedPlaceholder(bodyEl, bodyHeight, record) {
    const placeholder = document.createElement('div');
    placeholder.className = `${PARKED_BODY_CLASS} markdown`;
    placeholder.setAttribute(PARKED_ATTR, '1');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.height = `${Math.max(1, Math.round(bodyHeight || 0))}px`;
    const preview = getParkedPreviewText(record, bodyEl);
    if (preview) {
      placeholder.setAttribute(PARKED_PREVIEW_ATTR, preview);
      const previewEl = document.createElement('div');
      previewEl.className = PARKED_PREVIEW_CLASS;
      previewEl.textContent = preview;
      placeholder.appendChild(previewEl);
    }
    return placeholder;
  }

  function clearParkedHandoffAttrs(placeholder) {
    if (!(placeholder instanceof HTMLElement)) return;
    try { placeholder.removeAttribute(PARKED_HANDOFF_MARKUP_ATTR); } catch {}
    try { placeholder.removeAttribute(PARKED_HANDOFF_MODE_ATTR); } catch {}
    try { placeholder.removeAttribute(PARKED_HANDOFF_RAW_BYTES_ATTR); } catch {}
    try { placeholder.removeAttribute(PARKED_HANDOFF_SAVED_BYTES_ATTR); } catch {}
    try { placeholder.removeAttribute(PARKED_HANDOFF_DOM_NODES_ATTR); } catch {}
    try { placeholder.removeAttribute(PARKED_HANDOFF_KATEX_NODES_ATTR); } catch {}
    try { placeholder.removeAttribute(PARKED_HANDOFF_HEAVY_BLOCKS_ATTR); } catch {}
    try { placeholder.removeAttribute(PARKED_HANDOFF_ESTIMATED_ATTR); } catch {}
  }

  function writeParkedHandoffAttrs(placeholder, parked) {
    if (!(placeholder instanceof HTMLElement) || !parked || typeof parked !== 'object') return false;
    const markup = typeof parked.serializedBodyMarkup === 'string' ? parked.serializedBodyMarkup : '';
    if (!markup) return false;
    try { placeholder.setAttribute(PARKED_HANDOFF_MARKUP_ATTR, markup); } catch { return false; }
    try { placeholder.setAttribute(PARKED_HANDOFF_MODE_ATTR, String(parked.serializedBodyMode || PARKED_MARKUP_MODE_RAW)); } catch {}
    try { placeholder.setAttribute(PARKED_HANDOFF_RAW_BYTES_ATTR, String(Math.max(0, Number(parked.serializedBodyRawBytes) || 0))); } catch {}
    try { placeholder.setAttribute(PARKED_HANDOFF_SAVED_BYTES_ATTR, String(Math.max(0, Number(parked.serializedBodySavedBytes) || 0))); } catch {}
    try { placeholder.setAttribute(PARKED_HANDOFF_DOM_NODES_ATTR, String(Math.max(0, Number(parked.metrics?.domNodes) || 0))); } catch {}
    try { placeholder.setAttribute(PARKED_HANDOFF_KATEX_NODES_ATTR, String(Math.max(0, Number(parked.metrics?.katexNodes) || 0))); } catch {}
    try { placeholder.setAttribute(PARKED_HANDOFF_HEAVY_BLOCKS_ATTR, String(Math.max(0, Number(parked.metrics?.heavyBlocks) || 0))); } catch {}
    try { placeholder.setAttribute(PARKED_HANDOFF_ESTIMATED_ATTR, parked.metrics?.estimated ? '1' : '0'); } catch {}
    return true;
  }

  function readParkedHandoffAttrs(placeholder) {
    if (!(placeholder instanceof HTMLElement)) return null;
    const markup = placeholder.getAttribute(PARKED_HANDOFF_MARKUP_ATTR) || '';
    if (!markup) return null;
    return {
      serializedBodyMarkup: markup,
      serializedBodyMode: placeholder.getAttribute(PARKED_HANDOFF_MODE_ATTR) || PARKED_MARKUP_MODE_RAW,
      serializedBodyRawBytes: Math.max(0, Number(placeholder.getAttribute(PARKED_HANDOFF_RAW_BYTES_ATTR)) || 0),
      serializedBodySavedBytes: Math.max(0, Number(placeholder.getAttribute(PARKED_HANDOFF_SAVED_BYTES_ATTR)) || 0),
      metrics: {
        domNodes: Math.max(0, Number(placeholder.getAttribute(PARKED_HANDOFF_DOM_NODES_ATTR)) || 0),
        katexNodes: Math.max(0, Number(placeholder.getAttribute(PARKED_HANDOFF_KATEX_NODES_ATTR)) || 0),
        heavyBlocks: Math.max(0, Number(placeholder.getAttribute(PARKED_HANDOFF_HEAVY_BLOCKS_ATTR)) || 0),
        estimated: placeholder.getAttribute(PARKED_HANDOFF_ESTIMATED_ATTR) === '1'
      }
    };
  }

  function snapshotParkedBodyMarkup(bodyEl) {
    if (!(bodyEl instanceof HTMLElement)) return '';
    let hasLiteCode = false;
    let hasLiteMath = false;
    try {
      hasLiteCode = !!bodyEl.querySelector?.(`pre[${LITE_CODE_ATTR}='1']`);
      if (!hasLiteCode) hasLiteMath = !!bodyEl.querySelector?.(`[${LITE_MATH_ATTR}='1'][${LITE_MATH_ID_ATTR}]`);
    } catch {
      hasLiteCode = false;
      hasLiteMath = false;
    }
    if (!hasLiteCode && !hasLiteMath) {
      try {
        return String(bodyEl.outerHTML || '').trim();
      } catch {
        return '';
      }
    }
    try {
      const clone = bodyEl.cloneNode(true);
      if (clone instanceof HTMLElement) {
        const originalHosts = bodyEl.querySelectorAll?.(`pre[${LITE_CODE_ATTR}='1']`) || [];
        const cloneHosts = clone.querySelectorAll?.(`pre[${LITE_CODE_ATTR}='1']`) || [];
        const limit = Math.min(originalHosts.length, cloneHosts.length);
        for (let i = 0; i < limit; i += 1) {
          const originalHost = originalHosts[i];
          const cloneHost = cloneHosts[i];
          if (!(originalHost instanceof HTMLElement) || !(cloneHost instanceof HTMLElement)) continue;
          const lite = getLiteCodeBlockState(originalHost);
          const originalMarkup = unpackParkedBodyMarkup(lite?.serializedMarkup, lite?.serializedMode);
          if (originalMarkup) {
            try {
              cloneHost.innerHTML = originalMarkup;
            } catch {
              // ignore
            }
          }
          clearLiteCodeStateAttrs(cloneHost);
        }
        const originalMathHosts = bodyEl.querySelectorAll?.(`[${LITE_MATH_ATTR}='1'][${LITE_MATH_ID_ATTR}]`) || [];
        for (const originalHost of originalMathHosts) {
          if (!(originalHost instanceof HTMLElement)) continue;
          const lite = getLiteMathBlockState(originalHost);
          const originalMarkup = unpackParkedBodyMarkup(lite?.serializedMarkup, lite?.serializedMode);
          const liteId = String(originalHost.getAttribute(LITE_MATH_ID_ATTR) || '').trim();
          if (!liteId) continue;
          const cloneHost = clone.querySelector?.(`[${LITE_MATH_ATTR}='1'][${LITE_MATH_ID_ATTR}='${liteId}']`);
          if (!(cloneHost instanceof HTMLElement)) continue;
          if (originalMarkup) {
            try {
              cloneHost.innerHTML = originalMarkup;
            } catch {
              // ignore
            }
          }
          clearLiteMathStateAttrs(cloneHost);
        }
      }
      const html = String(clone?.outerHTML || bodyEl.outerHTML || '');
      return html.trim();
    } catch {
      return '';
    }
  }

  function snapshotElementInnerMarkup(el) {
    if (!(el instanceof HTMLElement)) return '';
    try {
      return String(el.innerHTML || '');
    } catch {
      return '';
    }
  }

  function packMarkupString(rawMarkupInput) {
    const rawMarkup = rawMarkupInput == null ? '' : String(rawMarkupInput);
    const rawLength = rawMarkup.length;
    if (!rawLength) {
      return {
        mode: PARKED_MARKUP_MODE_RAW,
        markup: '',
        rawBytes: 0,
        savedBytes: 0,
      };
    }
    if (rawLength < PARKED_MARKUP_COMPRESS_MIN_CHARS) {
      return {
        mode: PARKED_MARKUP_MODE_RAW,
        markup: rawMarkup,
        rawBytes: rawLength,
        savedBytes: 0,
      };
    }
    try {
      const compressedMarkup = lzCompressToUtf16(rawMarkup);
      const compressedLength = compressedMarkup.length;
      const savings = rawLength - compressedLength;
      const savingsRatio = savings / Math.max(1, rawLength);
      if (
        compressedLength > 0 &&
        compressedLength < rawLength &&
        savingsRatio >= PARKED_MARKUP_COMPRESS_MIN_SAVINGS_RATIO
      ) {
        return {
          mode: PARKED_MARKUP_MODE_LZ16,
          markup: compressedMarkup,
          rawBytes: rawLength,
          savedBytes: Math.max(0, savings),
        };
      }
    } catch {
      // ignore
    }
    return {
      mode: PARKED_MARKUP_MODE_RAW,
      markup: rawMarkup,
      rawBytes: rawLength,
      savedBytes: 0,
    };
  }

  function packParkedBodyMarkup(bodyEl) {
    return packMarkupString(snapshotParkedBodyMarkup(bodyEl));
  }

  function unpackParkedBodyMarkup(markup, mode) {
    const source = markup == null ? '' : String(markup);
    if (!source) return '';
    if (String(mode || '').trim() === PARKED_MARKUP_MODE_LZ16) {
      try {
        return String(lzDecompressFromUtf16(source) || '');
      } catch {
        return '';
      }
    }
    return source;
  }

  function reviveParkedBodyFromMarkup(markup, mode = PARKED_MARKUP_MODE_RAW) {
    const html = unpackParkedBodyMarkup(markup, mode);
    if (!html) return null;
    try {
      const template = document.createElement('template');
      template.innerHTML = html;
      const restored = template.content.firstElementChild;
      return restored instanceof HTMLElement ? restored : null;
    } catch {
      return null;
    }
  }

  function getLiteCodeBlockState(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return null;
    try {
      const runtimeState = state.liteCodeBlocks.get(hostEl);
      if (runtimeState && typeof runtimeState === 'object' && typeof runtimeState.serializedMarkup === 'string' && runtimeState.serializedMarkup) {
        return runtimeState;
      }
    } catch {
      // ignore
    }
    try {
      if (hostEl.getAttribute(LITE_CODE_ATTR) !== '1') return null;
      const serializedMarkup = hostEl.getAttribute(LITE_CODE_PAYLOAD_ATTR) || '';
      if (!serializedMarkup) return null;
      return {
        serializedMarkup,
        serializedMode: hostEl.getAttribute(LITE_CODE_MODE_ATTR) || PARKED_MARKUP_MODE_RAW,
        serializedRawBytes: Math.max(0, Number(hostEl.getAttribute(LITE_CODE_RAW_BYTES_ITEM_ATTR)) || 0),
        serializedSavedBytes: Math.max(0, Number(hostEl.getAttribute(LITE_CODE_SAVED_BYTES_ITEM_ATTR)) || 0),
        estimatedDomNodes: Math.max(0, Number(hostEl.getAttribute(LITE_CODE_ESTIMATED_NODES_ITEM_ATTR)) || 0),
        displayMode: hostEl.getAttribute(LITE_CODE_VIEW_ATTR) || LITE_CODE_VIEW_PREVIEW
      };
    } catch {
      return null;
    }
  }

  function clearLiteCodeStateAttrs(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return;
    try { hostEl.removeAttribute(LITE_CODE_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_ID_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_MODE_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_PAYLOAD_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_RAW_BYTES_ITEM_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_SAVED_BYTES_ITEM_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_ESTIMATED_NODES_ITEM_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_VIEW_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_COLLAPSED_ATTR); } catch {}
    try { hostEl.style.removeProperty(LITE_CODE_BLOCK_SIZE_VAR); } catch {}
    try { hostEl.style.removeProperty(LITE_CODE_PLAINTEXT_SIZE_VAR); } catch {}
    try { hostEl.style.removeProperty('overflow'); } catch {}
    try { hostEl.style.removeProperty('white-space'); } catch {}
    try { hostEl.style.removeProperty('word-break'); } catch {}
    try { hostEl.style.removeProperty('overflow-wrap'); } catch {}
  }

  function allocateLiteCodeId() {
    const value = Math.max(1, Number(state.nextLiteCodeId) || 1);
    state.nextLiteCodeId = value + 1;
    return `lc${value.toString(36)}`;
  }

  function ensureLiteCodeId(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return '';
    try {
      const existing = String(hostEl.getAttribute(LITE_CODE_ID_ATTR) || '').trim();
      if (existing) return existing;
    } catch {
      // ignore
    }
    const nextId = allocateLiteCodeId();
    try { hostEl.setAttribute(LITE_CODE_ID_ATTR, nextId); } catch {}
    return nextId;
  }

  function writeLiteCodeStateAttrs(hostEl, liteState) {
    if (!(hostEl instanceof HTMLElement) || !liteState) return;
    try { hostEl.setAttribute(LITE_CODE_ATTR, '1'); } catch {}
    ensureLiteCodeId(hostEl);
    try { hostEl.setAttribute(LITE_CODE_VIEW_ATTR, String(liteState.displayMode || LITE_CODE_VIEW_PREVIEW)); } catch {}
  }

  function getLiteMathBlockState(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return null;
    try {
      const runtimeState = state.liteMathBlocks.get(hostEl);
      if (runtimeState && typeof runtimeState === 'object' && typeof runtimeState.serializedMarkup === 'string' && runtimeState.serializedMarkup) {
        return runtimeState;
      }
    } catch {
      // ignore
    }
    return null;
  }

  function clearLiteMathStateAttrs(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return;
    try { hostEl.removeAttribute(LITE_MATH_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_MATH_ID_ATTR); } catch {}
    try { hostEl.style.removeProperty(LITE_MATH_BLOCK_SIZE_VAR); } catch {}
  }

  function allocateLiteMathId() {
    const value = Math.max(1, Number(state.nextLiteMathId) || 1);
    state.nextLiteMathId = value + 1;
    return `lm${value.toString(36)}`;
  }

  function ensureLiteMathId(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return '';
    try {
      const existing = String(hostEl.getAttribute(LITE_MATH_ID_ATTR) || '').trim();
      if (existing) return existing;
    } catch {
      // ignore
    }
    const nextId = allocateLiteMathId();
    try { hostEl.setAttribute(LITE_MATH_ID_ATTR, nextId); } catch {}
    return nextId;
  }

  function writeLiteMathStateAttrs(hostEl, liteState) {
    if (!(hostEl instanceof HTMLElement) || !liteState) return;
    try { hostEl.setAttribute(LITE_MATH_ATTR, '1'); } catch {}
    ensureLiteMathId(hostEl);
    const measuredHeight = Math.max(0, Math.round(Number(liteState.measuredHeight) || 0));
    if (measuredHeight > 0) {
      try { hostEl.style.setProperty(LITE_MATH_BLOCK_SIZE_VAR, `${measuredHeight}px`); } catch {}
    }
  }

  function extractLiteMathText(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return '';
    let raw = '';
    try {
      raw = String(hostEl.querySelector('annotation[encoding="application/x-tex"], annotation')?.textContent || '').trim();
    } catch {
      raw = '';
    }
    if (!raw) {
      try {
        raw = String(hostEl.getAttribute('aria-label') || hostEl.innerText || hostEl.textContent || '').replace(/\s+/g, ' ').trim();
      } catch {
        raw = '';
      }
    }
    if (!raw) return '';
    if (/^\$\$[\s\S]*\$\$$/.test(raw) || /^\\\[[\s\S]*\\\]$/.test(raw)) return raw;
    return `$$${raw}$$`;
  }

  function hasBrokenMathFallbackText(rootEl) {
    if (!(rootEl instanceof Element)) return false;
    try {
      const paragraphs = rootEl.querySelectorAll('p');
      for (const paragraph of paragraphs) {
        const text = String(paragraph?.textContent || '').trim();
        if (!text || text.length > 220) continue;
        if (BROKEN_MATH_FALLBACK_RE.test(text)) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  function isBrokenDisplayMathHost(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return false;
    let annotationText = '';
    let renderedText = '';
    let hasRenderedMarkup = false;
    let hasMathml = false;
    let height = 0;
    try {
      annotationText = String(hostEl.querySelector('annotation[encoding="application/x-tex"], annotation')?.textContent || '').trim();
    } catch {
      annotationText = '';
    }
    try {
      renderedText = String(hostEl.querySelector('.katex-html, mjx-assistive-mml + *')?.textContent || '').trim();
    } catch {
      renderedText = '';
    }
    try {
      const renderedEl = hostEl.querySelector('.katex-html, mjx-assistive-mml + *');
      hasRenderedMarkup = !!(renderedEl instanceof Element && renderedEl.querySelector('*'));
    } catch {
      hasRenderedMarkup = false;
    }
    try {
      hasMathml = !!hostEl.querySelector('.katex-mathml math, math');
    } catch {
      hasMathml = false;
    }
    try {
      height = Math.max(
        0,
        Math.round(hostEl.getBoundingClientRect?.().height || 0),
        Math.round(hostEl.scrollHeight || hostEl.offsetHeight || 0)
      );
    } catch {
      height = 0;
    }
    return !renderedText && !hasRenderedMarkup && height <= BROKEN_MATH_EMPTY_HOST_MAX_HEIGHT_PX && (!!annotationText || hasMathml);
  }

  function repairBrokenDisplayMathHost(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return false;
    let mathClone = null;
    let ariaLabel = '';
    try {
      const mathEl = hostEl.querySelector('.katex-mathml math, math');
      if (mathEl instanceof Element) mathClone = mathEl.cloneNode(true);
    } catch {
      mathClone = null;
    }
    if (!(mathClone instanceof Element)) return false;
    try {
      ariaLabel = String(
        mathClone.querySelector('annotation[encoding="application/x-tex"], annotation')?.textContent ||
        hostEl.getAttribute('aria-label') ||
        ''
      ).trim();
    } catch {
      ariaLabel = '';
    }
    try {
      hostEl.innerHTML = '';
      hostEl.appendChild(mathClone);
      hostEl.setAttribute(MATHML_FALLBACK_ATTR, '1');
      hostEl.removeAttribute(LITE_MATH_ATTR);
      if (ariaLabel) hostEl.setAttribute('aria-label', ariaLabel);
      hostEl.style.removeProperty(LITE_MATH_BLOCK_SIZE_VAR);
      return true;
    } catch {
      return false;
    }
  }

  function repairBrokenDisplayMathWithin(rootEl) {
    if (!(rootEl instanceof Element)) return 0;
    let repaired = 0;
    try {
      const hosts = rootEl.querySelectorAll('.katex-display, mjx-container');
      for (const hostEl of hosts) {
        if (!(hostEl instanceof HTMLElement)) continue;
        if (!isBrokenDisplayMathHost(hostEl)) continue;
        if (repairBrokenDisplayMathHost(hostEl)) repaired += 1;
      }
    } catch {
      return repaired;
    }
    return repaired;
  }

  function countLikelyBrokenDisplayMath(rootEl) {
    if (!(rootEl instanceof Element)) return 0;
    if (!hasBrokenMathFallbackText(rootEl)) return 0;
    let count = 0;
    try {
      const hosts = rootEl.querySelectorAll('.katex-display, mjx-container');
      for (const hostEl of hosts) {
        if (isBrokenDisplayMathHost(hostEl)) count += 1;
      }
    } catch {
      return 0;
    }
    return count;
  }

  function collapseLiteMathBlockDom(hostEl, textContent, measuredHeight = 0) {
    if (!(hostEl instanceof HTMLElement)) return false;
    const nextText = String(textContent || '').trim();
    if (!nextText) return false;
    try {
      hostEl.textContent = nextText;
      if (measuredHeight > 0) hostEl.style.setProperty(LITE_MATH_BLOCK_SIZE_VAR, `${Math.round(measuredHeight)}px`);
    } catch {
      return false;
    }
    return true;
  }

  function restoreLiteMathBlock(hostEl) {
    const lite = getLiteMathBlockState(hostEl);
    if (!lite) return false;
    if (!(hostEl instanceof HTMLElement) || !hostEl.isConnected) {
      state.liteMathBlocks.delete(hostEl);
      state.liteMathBlockSet.delete(hostEl);
      return false;
    }
    const markup = unpackParkedBodyMarkup(lite.serializedMarkup, lite.serializedMode);
    if (!markup) {
      state.liteMathBlocks.delete(hostEl);
      state.liteMathBlockSet.delete(hostEl);
      clearLiteMathStateAttrs(hostEl);
      return false;
    }
    try {
      hostEl.innerHTML = markup;
    } catch {
      return false;
    }
    state.liteMathBlocks.delete(hostEl);
    state.liteMathBlockSet.delete(hostEl);
    clearLiteMathStateAttrs(hostEl);
    return true;
  }

  function restoreLiteMathBlocksWithin(rootEl) {
    if (!(rootEl instanceof Element)) return 0;
    let restored = 0;
    for (const hostEl of Array.from(state.liteMathBlockSet)) {
      if (!(hostEl instanceof HTMLElement)) {
        state.liteMathBlockSet.delete(hostEl);
        continue;
      }
      if (!rootEl.contains(hostEl)) continue;
      if (restoreLiteMathBlock(hostEl)) restored += 1;
    }
    return restored;
  }

  function restoreAllLiteMathBlocks() {
    for (const hostEl of Array.from(state.liteMathBlockSet)) restoreLiteMathBlock(hostEl);
  }

  function discardLiteCodeBlocksWithin(rootEl) {
    if (!(rootEl instanceof Element)) return 0;
    let discarded = 0;
    for (const hostEl of Array.from(state.liteCodeBlockSet)) {
      if (!(hostEl instanceof HTMLElement)) {
        state.liteCodeBlockSet.delete(hostEl);
        continue;
      }
      if (!rootEl.contains(hostEl)) continue;
      state.liteCodeBlocks.delete(hostEl);
      state.liteCodeBlockSet.delete(hostEl);
      discarded += 1;
    }
    return discarded;
  }

  function pruneDetachedLiteCodeBlocks() {
    let pruned = 0;
    for (const hostEl of Array.from(state.liteCodeBlockSet)) {
      if (hostEl instanceof HTMLElement && hostEl.isConnected) continue;
      state.liteCodeBlocks.delete(hostEl);
      state.liteCodeBlockSet.delete(hostEl);
      pruned += 1;
    }
    return pruned;
  }

  function discardLiteMathBlocksWithin(rootEl) {
    if (!(rootEl instanceof Element)) return 0;
    let discarded = 0;
    for (const hostEl of Array.from(state.liteMathBlockSet)) {
      if (!(hostEl instanceof HTMLElement)) {
        state.liteMathBlockSet.delete(hostEl);
        continue;
      }
      if (!rootEl.contains(hostEl)) continue;
      state.liteMathBlocks.delete(hostEl);
      state.liteMathBlockSet.delete(hostEl);
      discarded += 1;
    }
    return discarded;
  }

  function pruneDetachedLiteMathBlocks() {
    let pruned = 0;
    for (const hostEl of Array.from(state.liteMathBlockSet)) {
      if (hostEl instanceof HTMLElement && hostEl.isConnected) continue;
      state.liteMathBlocks.delete(hostEl);
      state.liteMathBlockSet.delete(hostEl);
      pruned += 1;
    }
    return pruned;
  }

  function simplifyLiteMathBlock(hostEl, options = null) {
    if (!(hostEl instanceof HTMLElement)) return false;
    const denseTurn = !!options?.denseTurn;
    if (getLiteMathBlockState(hostEl)) {
      recordLiteMathDebug('runtime-state', hostEl);
      return false;
    }
    if (hostEl.getAttribute(LITE_MATH_ATTR) === '1') {
      recordLiteMathDebug('already-lite', hostEl);
      return false;
    }
    if (hostEl.closest(`.${PARKED_BODY_CLASS}`)) {
      recordLiteMathDebug('parked-body', hostEl);
      return false;
    }
    const originalMarkup = snapshotElementInnerMarkup(hostEl);
    if (!originalMarkup) {
      recordLiteMathDebug('empty-markup', hostEl);
      return false;
    }
    const textContent = extractLiteMathText(hostEl);
    if (!textContent) {
      recordLiteMathDebug('empty-text', hostEl, { markupLen: originalMarkup.length });
      return false;
    }
    const collapsedTextLen = textContent.replace(/\s+/g, '').length;
    if (denseTurn && collapsedTextLen < LITE_MATH_MIN_BLOCK_TEXT_CHARS) {
      recordLiteMathDebug('dense-too-short', hostEl, { textLen: collapsedTextLen, markupLen: originalMarkup.length });
      return false;
    }
    const measuredHeight = Math.max(
      0,
      Math.round(hostEl.getBoundingClientRect?.().height || 0),
      Math.round(hostEl.scrollHeight || hostEl.offsetHeight || 0)
    );
    if (!denseTurn && measuredHeight < LITE_MATH_MIN_BLOCK_HEIGHT_PX) {
      recordLiteMathDebug('short-height', hostEl, { textLen: collapsedTextLen, height: measuredHeight, markupLen: originalMarkup.length });
      return false;
    }
    const packedMarkup = packMarkupString(originalMarkup);
    if (!collapseLiteMathBlockDom(hostEl, textContent, measuredHeight)) {
      recordLiteMathDebug('collapse-failed', hostEl, { textLen: collapsedTextLen, height: measuredHeight, markupLen: originalMarkup.length });
      return false;
    }
    const liteState = {
      serializedMarkup: packedMarkup.markup,
      serializedMode: packedMarkup.mode,
      serializedRawBytes: packedMarkup.rawBytes,
      serializedSavedBytes: packedMarkup.savedBytes,
      measuredHeight
    };
    state.liteMathBlocks.set(hostEl, liteState);
    state.liteMathBlockSet.add(hostEl);
    writeLiteMathStateAttrs(hostEl, liteState);
    recordLiteMathDebug('simplified', hostEl, { textLen: collapsedTextLen, height: measuredHeight, markupLen: originalMarkup.length });
    if (!options?.deferTelemetry) scheduleParkingTelemetryPublish();
    return true;
  }

  function measureLiteMathTurnProfile(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return { turnHeight: 0, katexNodes: 0, displayBlocks: 0, domNodes: 0, bodyRoot: null };
    const metrics = state.turnMetrics.get(turnEl);
    const record = getCoreTurnRecord(turnEl);
    const role = inferTurnRoleForParking(turnEl, record);
    const bodyRoot = findTurnBodyElForParking(turnEl, role, record) || turnEl;
    let turnHeight = 0;
    let domNodes = Math.max(0, Number(metrics?.domNodes) || 0);
    let katexNodes = Math.max(0, Number(metrics?.katexNodes) || 0);
    let displayBlocks = 0;
    try {
      turnHeight = Math.round(turnEl.getBoundingClientRect().height);
    } catch {
      turnHeight = 0;
    }
    if (turnHeight <= 0) turnHeight = Math.round(Number(state.lastHeights.get(turnEl)) || 0);
    try {
      displayBlocks = bodyRoot?.querySelectorAll?.('.katex-display, mjx-container')?.length || 0;
    } catch {
      displayBlocks = 0;
    }
    if (katexNodes <= 0) {
      try {
        katexNodes = bodyRoot?.querySelectorAll?.('.katex, math, mjx-container')?.length || 0;
      } catch {
        katexNodes = 0;
      }
    }
    if (
      bodyRoot instanceof Element &&
      displayBlocks >= LITE_MATH_MIN_DISPLAY_BLOCKS &&
      turnHeight >= LITE_MATH_MIN_DENSE_TURN_HEIGHT_PX &&
      domNodes < LITE_MATH_MIN_DENSE_TURN_DOM_NODES
    ) {
      try {
        domNodes = bodyRoot.querySelectorAll('*').length || domNodes;
      } catch {
        // ignore
      }
    }
    return { turnHeight, katexNodes, displayBlocks, domNodes, bodyRoot };
  }

  function maybeSimplifyTurnMathBlocks(turnEl, options = null) {
    if (!(state.settings.enabled && state.settings.optimizeHeavyBlocks)) return 0;
    const allowOffscreen = !!options?.allowOffscreen;
    if (!(turnEl instanceof HTMLElement)) return 0;
    pruneDetachedLiteMathBlocks();
    if (!allowOffscreen && turnEl.classList.contains(OFFSCREEN_CLASS)) return 0;
    if (turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1') return 0;
    const visible = isTurnIntersectingViewport(turnEl, 48);
    const profile = options?.profile && typeof options.profile === 'object' ? options.profile : measureLiteMathTurnProfile(turnEl);
    if (!(profile.bodyRoot instanceof Element)) return 0;
    const brokenMathCount = countLikelyBrokenDisplayMath(profile.bodyRoot);
    state.brokenMathCount = brokenMathCount;
    const restored = restoreLiteMathBlocksWithin(profile.bodyRoot);
    if (restored > 0) scheduleParkingTelemetryPublish();
    if (brokenMathCount > 0) {
      const repaired = repairBrokenDisplayMathWithin(profile.bodyRoot);
      if (repaired > 0) scheduleParkingTelemetryPublish();
      recordLiteMathDebug('broken-visible-math', null, { textLen: 0, height: 0, markupLen: 0 });
      publishRuntimeDebugTelemetry();
      return 0;
    }
    if (visible && !allowOffscreen) return 0;
    // Formula correctness wins over the incremental DOM savings from lite-math.
    // We still park whole turns for memory, but we no longer collapse formulas
    // into raw TeX because extension reloads can orphan that representation.
    return 0;
  }

  function primeRestoredBodyMathBlocks(bodyEl) {
    if (!(state.settings.enabled && state.settings.optimizeHeavyBlocks)) return 0;
    if (!(bodyEl instanceof HTMLElement)) return 0;
    const turnEl = bodyEl.closest?.(`.${TURN_CLASS}`);
    if (!(turnEl instanceof HTMLElement)) return 0;
    return maybeSimplifyTurnMathBlocks(turnEl);
  }

  function measureLiteCodeCandidate(hostEl) {
    if (!(hostEl instanceof HTMLElement)) {
      return { descendants: 0, textLength: 0, height: 0, horizontalOverflow: 0 };
    }
    let textLength = 0;
    let height = 0;
    let horizontalOverflow = 0;
    try {
      textLength = String(hostEl.textContent || hostEl.innerText || '').length;
    } catch {}
    try {
      height = Math.round(hostEl.getBoundingClientRect().height);
    } catch {}
    if (height <= 0) {
      try {
        height = Math.round(hostEl.scrollHeight || hostEl.offsetHeight || 0);
      } catch {
        height = 0;
      }
    }
    try {
      horizontalOverflow = Math.max(0, Math.round((hostEl.scrollWidth || 0) - (hostEl.clientWidth || 0)));
    } catch {}
    const shouldCountDescendantsForLiteGate =
      textLength < LITE_CODE_MIN_TEXT_CHARS &&
      height < LITE_CODE_MIN_HEIGHT_PX &&
      horizontalOverflow < LITE_CODE_MIN_HORIZONTAL_OVERFLOW_PX;
    const shouldCountDescendantsForVisiblePlaintextGate =
      textLength < LITE_CODE_PLAINTEXT_MIN_TEXT_CHARS &&
      height >= LITE_CODE_PLAINTEXT_MIN_DESCENDANTS_HEIGHT_PX &&
      height < LITE_CODE_PLAINTEXT_MIN_HEIGHT_PX &&
      horizontalOverflow < LITE_CODE_PLAINTEXT_MIN_HORIZONTAL_OVERFLOW_PX;
    let descendants = 0;
    if (shouldCountDescendantsForLiteGate || shouldCountDescendantsForVisiblePlaintextGate) {
      try {
        descendants = hostEl.querySelectorAll('*').length;
      } catch {}
    }
    return { descendants, textLength, height, horizontalOverflow };
  }

  function buildLiteCodePreviewText(textContent) {
    const fullText = String(textContent || '');
    if (!fullText) return '';
    const lines = fullText
      .split('\n')
      .slice(0, LITE_CODE_PREVIEW_MAX_LINES)
      .map((line) => (line.length > LITE_CODE_PREVIEW_MAX_LINE_CHARS ? `${line.slice(0, LITE_CODE_PREVIEW_MAX_LINE_CHARS)} …` : line));
    const cappedLines = lines.join('\n');
    const previewBase =
      cappedLines.length > LITE_CODE_PREVIEW_MAX_CHARS
        ? `${cappedLines.slice(0, LITE_CODE_PREVIEW_MAX_CHARS)}\n…`
        : cappedLines;
    return `${previewBase}\n\n${uiText('/* 点击展开完整重代码块 */', '/* Click to expand full heavy code block */')}`;
  }

  function collapseLiteCodeBlockDom(hostEl, textContent, profile = null, displayMode = LITE_CODE_VIEW_PREVIEW) {
    if (!(hostEl instanceof HTMLElement)) return false;
    const mode = displayMode === LITE_CODE_VIEW_PLAINTEXT ? LITE_CODE_VIEW_PLAINTEXT : LITE_CODE_VIEW_PREVIEW;
    const nextText = mode === LITE_CODE_VIEW_PLAINTEXT ? String(textContent || '') : buildLiteCodePreviewText(textContent);
    if (!nextText) return false;
    const measuredHeight = Math.max(
      0,
      Math.round(Number(profile?.height) || 0),
      Math.round(hostEl.getBoundingClientRect?.().height || 0)
    );
    try {
      hostEl.textContent = nextText;
      hostEl.style.setProperty('overflow', mode === LITE_CODE_VIEW_PREVIEW ? 'hidden' : 'auto', 'important');
      if (mode === LITE_CODE_VIEW_PREVIEW) {
        hostEl.style.setProperty('white-space', 'pre-wrap', 'important');
        hostEl.style.setProperty('word-break', 'break-word', 'important');
        hostEl.style.setProperty('overflow-wrap', 'anywhere', 'important');
        hostEl.setAttribute(LITE_CODE_COLLAPSED_ATTR, '1');
        if (measuredHeight > 0) hostEl.style.setProperty(LITE_CODE_BLOCK_SIZE_VAR, `${measuredHeight}px`);
        hostEl.style.removeProperty(LITE_CODE_PLAINTEXT_SIZE_VAR);
      } else {
        hostEl.style.setProperty('white-space', 'pre', 'important');
        hostEl.style.setProperty('word-break', 'normal', 'important');
        hostEl.style.setProperty('overflow-wrap', 'normal', 'important');
        hostEl.removeAttribute(LITE_CODE_COLLAPSED_ATTR);
        hostEl.style.removeProperty(LITE_CODE_BLOCK_SIZE_VAR);
        if (measuredHeight > 0) hostEl.style.setProperty(LITE_CODE_PLAINTEXT_SIZE_VAR, `${measuredHeight}px`);
        else hostEl.style.removeProperty(LITE_CODE_PLAINTEXT_SIZE_VAR);
      }
    } catch {
      return false;
    }
    return true;
  }

  function findLiteCodeHost(target) {
    if (!(target instanceof Element)) return null;
    const hostEl = target.closest(`pre[${LITE_CODE_ATTR}='1']`);
    return hostEl instanceof HTMLElement ? hostEl : null;
  }

  function maybeRestoreLiteCodeFromTarget(target) {
    const hostEl = findLiteCodeHost(target);
    if (!(hostEl instanceof HTMLElement)) return false;
    const lite = getLiteCodeBlockState(hostEl);
    if (lite?.displayMode === LITE_CODE_VIEW_PLAINTEXT) return false;
    if (hostEl.getAttribute(LITE_CODE_COLLAPSED_ATTR) !== '1') return false;
    const restored = restoreLiteCodeBlock(hostEl);
    if (restored) {
      armCodeScrollShield(1200);
      scheduleActionBoost(1200);
    }
    return restored;
  }

  function findLiteMathHost(target) {
    if (!(target instanceof Element)) return null;
    const hostEl = target.closest(`[${LITE_MATH_ATTR}='1']`);
    return hostEl instanceof HTMLElement ? hostEl : null;
  }

  function maybeRestoreLiteMathFromTarget(target) {
    const hostEl = findLiteMathHost(target);
    if (!(hostEl instanceof HTMLElement)) return false;
    const restored = restoreLiteMathBlock(hostEl);
    if (restored) {
      armCodeScrollShield(900);
      scheduleActionBoost(900);
    }
    return restored;
  }

  function isTurnIntersectingViewport(turnEl, marginPx = 0) {
    if (!(turnEl instanceof HTMLElement)) return false;
    const margin = Math.max(0, Number(marginPx) || 0);
    try {
      const rect = turnEl.getBoundingClientRect();
      return rect.bottom > -margin && rect.top < window.innerHeight + margin;
    } catch {
      return false;
    }
  }

  function canLiteCodeBlock(hostEl) {
    if (!(hostEl instanceof HTMLElement)) return false;
    if (getLiteCodeBlockState(hostEl)) return false;
    if (hostEl.getAttribute(LITE_CODE_ATTR) === '1') return false;
    if (hostEl.closest(`.${PARKED_BODY_CLASS}`)) return false;
    const profile = measureLiteCodeCandidate(hostEl);
    if (profile.textLength < 800) return false;
    if (profile.descendants >= LITE_CODE_MIN_DESCENDANTS) return true;
    if (profile.textLength >= LITE_CODE_MIN_TEXT_CHARS) return true;
    if (profile.height >= LITE_CODE_MIN_HEIGHT_PX) return true;
    if (profile.horizontalOverflow >= LITE_CODE_MIN_HORIZONTAL_OVERFLOW_PX) return true;
    return false;
  }

  function selectLiteCodeDisplayMode(profile, options = null) {
    const visible = !!options?.visible;
    if (!visible) return LITE_CODE_VIEW_PREVIEW;
    if ((Number(profile?.textLength) || 0) >= LITE_CODE_PLAINTEXT_MIN_TEXT_CHARS) return LITE_CODE_VIEW_PLAINTEXT;
    if ((Number(profile?.height) || 0) >= LITE_CODE_PLAINTEXT_MIN_HEIGHT_PX) return LITE_CODE_VIEW_PLAINTEXT;
    if ((Number(profile?.horizontalOverflow) || 0) >= LITE_CODE_PLAINTEXT_MIN_HORIZONTAL_OVERFLOW_PX) return LITE_CODE_VIEW_PLAINTEXT;
    if (
      (Number(profile?.descendants) || 0) >= LITE_CODE_PLAINTEXT_MIN_DESCENDANTS &&
      (Number(profile?.height) || 0) >= LITE_CODE_PLAINTEXT_MIN_DESCENDANTS_HEIGHT_PX
    ) {
      return LITE_CODE_VIEW_PLAINTEXT;
    }
    return '';
  }

  function simplifyLiteCodeBlock(hostEl, options = null) {
    if (!canLiteCodeBlock(hostEl)) return false;
    const profile = measureLiteCodeCandidate(hostEl);
    const displayMode = selectLiteCodeDisplayMode(profile, options);
    if (!displayMode) return false;
    const originalMarkup = snapshotElementInnerMarkup(hostEl);
    if (!originalMarkup) return false;
    const deferTelemetry = !!options?.deferTelemetry;
    let textContent = '';
    try {
      textContent = String(hostEl.innerText || hostEl.textContent || '');
    } catch {
      textContent = '';
    }
    if (!textContent) return false;

    const packedMarkup = packMarkupString(originalMarkup);
    if (!collapseLiteCodeBlockDom(hostEl, textContent, profile, displayMode)) {
      return false;
    }

    const liteState = {
      serializedMarkup: packedMarkup.markup,
      serializedMode: packedMarkup.mode,
      serializedRawBytes: packedMarkup.rawBytes,
      serializedSavedBytes: packedMarkup.savedBytes,
      estimatedDomNodes: Math.max(0, Number(profile.descendants) || 0),
      displayMode
    };
    state.liteCodeBlocks.set(hostEl, liteState);
    writeLiteCodeStateAttrs(hostEl, liteState);
    state.liteCodeBlockSet.add(hostEl);
    if (!deferTelemetry) publishParkingTelemetry();
    return true;
  }

  function restoreLiteCodeBlock(hostEl) {
    const lite = getLiteCodeBlockState(hostEl);
    if (!lite) return false;
    if (!(hostEl instanceof HTMLElement) || !hostEl.isConnected) {
      state.liteCodeBlocks.delete(hostEl);
      state.liteCodeBlockSet.delete(hostEl);
      return false;
    }
    const markup = unpackParkedBodyMarkup(lite.serializedMarkup, lite.serializedMode);
    if (!markup) {
      state.liteCodeBlocks.delete(hostEl);
      state.liteCodeBlockSet.delete(hostEl);
      clearLiteCodeStateAttrs(hostEl);
      publishParkingTelemetry();
      return false;
    }
    try {
      hostEl.innerHTML = markup;
    } catch {
      return false;
    }
    state.liteCodeBlocks.delete(hostEl);
    state.liteCodeBlockSet.delete(hostEl);
    clearLiteCodeStateAttrs(hostEl);
    publishParkingTelemetry();
    return true;
  }

  function restoreLiteCodeBlocksWithin(rootEl) {
    if (!(rootEl instanceof Element)) return 0;
    let restored = 0;
    for (const hostEl of Array.from(state.liteCodeBlockSet)) {
      if (!(hostEl instanceof HTMLElement)) {
        state.liteCodeBlockSet.delete(hostEl);
        continue;
      }
      if (!rootEl.contains(hostEl)) continue;
      const lite = getLiteCodeBlockState(hostEl);
      if (lite?.displayMode === LITE_CODE_VIEW_PLAINTEXT) continue;
      if (restoreLiteCodeBlock(hostEl)) restored += 1;
    }
    return restored;
  }

  function restoreAllLiteCodeBlocks() {
    for (const hostEl of Array.from(state.liteCodeBlockSet)) restoreLiteCodeBlock(hostEl);
  }

  function primeRestoredBodyCodeBlocks(bodyEl) {
    if (!(state.settings.enabled && state.settings.optimizeHeavyBlocks)) return 0;
    if (!(bodyEl instanceof HTMLElement)) return 0;
    const turnEl = bodyEl.closest?.(`.${TURN_CLASS}`);
    // Freshly restored visible turns should paint their full code immediately.
    // Offscreen/parked turns still get lite-mode for memory savings.
    if (turnEl instanceof HTMLElement && isTurnIntersectingViewport(turnEl, 48)) return 0;
    const hosts = bodyEl.querySelectorAll?.('pre');
    if (!hosts?.length) return 0;
    let simplified = 0;
    for (const hostEl of hosts) {
      const profile = measureLiteCodeCandidate(hostEl);
      if (profile.textLength < 800) continue;
      if (profile.descendants < LITE_CODE_MIN_DESCENDANTS && profile.textLength < LITE_CODE_MIN_TEXT_CHARS) continue;
      if (simplifyLiteCodeBlock(hostEl, { deferTelemetry: true, visible: false })) simplified += 1;
    }
    return simplified;
  }

  function maybeSimplifyTurnCodeBlocks(turnEl, options = null) {
    if (!(state.settings.enabled && state.settings.optimizeHeavyBlocks)) return 0;
    const allowOffscreen = !!options?.allowOffscreen;
    if (!(turnEl instanceof HTMLElement)) return 0;
    pruneDetachedLiteCodeBlocks();
    const visible = isTurnIntersectingViewport(turnEl, 48);
    if (!allowOffscreen && turnEl.classList.contains(OFFSCREEN_CLASS)) return 0;
    if (turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1') return 0;
    const metrics = state.turnMetrics.get(turnEl);
    if (metrics && Number(metrics.heavyBlocks) <= 0) return 0;
    const record = getCoreTurnRecord(turnEl);
    const role = inferTurnRoleForParking(turnEl, record);
    const bodyRoot = findTurnBodyElForParking(turnEl, role, record) || turnEl;
    const hosts = bodyRoot?.querySelectorAll?.('pre');
    if (!hosts?.length) return 0;
    let simplified = 0;
    for (const hostEl of hosts) {
      if (simplifyLiteCodeBlock(hostEl, { visible, deferTelemetry: true })) simplified += 1;
    }
    if (simplified > 0) publishParkingTelemetry();
    return simplified;
  }

  function turnHasWarmableCodeBlock(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return false;
    const parkedMetrics = getParkedTurnState(turnEl)?.metrics;
    if (parkedMetrics && Number(parkedMetrics.heavyBlocks) <= 0) return false;
    const metrics = state.turnMetrics.get(turnEl);
    if (metrics && Number(metrics.heavyBlocks) <= 0) return false;
    const record = getCoreTurnRecord(turnEl);
    const role = inferTurnRoleForParking(turnEl, record);
    const bodyRoot = findTurnBodyElForParking(turnEl, role, record) || turnEl;
    try {
      return !!bodyRoot?.querySelector?.('pre');
    } catch {
      return false;
    }
  }

  function shouldKeepOffscreenWarm(turnEl) {
    if (!(state.settings.enabled && state.settings.optimizeHeavyBlocks)) return false;
    if (!(turnEl instanceof HTMLElement)) return false;
    if (!turnHasWarmableCodeBlock(turnEl)) return false;
    const level = Math.max(0, Number(state.budgetLevel) || 0);
    if (level >= 4) return false;
    const warmMargin =
      level >= 3
        ? Math.max(window.innerHeight * 0.28, 220)
        : level >= 2
          ? Math.max(window.innerHeight * 0.5, 320)
          : Math.max(window.innerHeight * 0.9, 520);
    return isTurnCloseToViewport(turnEl, warmMargin);
  }

  function shouldParkOffscreenTurn(turnEl, measuredHeight, bodyHeightHint) {
    if (!(turnEl instanceof HTMLElement)) return false;
    const level = Math.max(0, Number(state.budgetLevel) || 0);
    if (level >= 2) return true;

    const metrics = getParkedTurnState(turnEl)?.metrics || state.turnMetrics.get(turnEl);
    const turnDomNodes = Math.max(0, Number(metrics?.domNodes) || 0);
    let turnKatexNodes = Math.max(0, Number(metrics?.katexNodes) || 0);
    let turnHeavyBlocks = Math.max(0, Number(metrics?.heavyBlocks) || 0);
    const turnHeight = Math.max(
      0,
      Math.round(Number(measuredHeight) || 0),
      Math.round(Number(bodyHeightHint) || 0)
    );

    if ((!metrics || metrics.estimated) && turnHeight >= 960) {
      try {
        turnKatexNodes = Math.max(turnKatexNodes, turnEl.querySelectorAll('.katex, math, mjx-container').length);
        turnHeavyBlocks = Math.max(turnHeavyBlocks, turnEl.querySelectorAll(HEAVY_BLOCK_SELECTOR).length);
      } catch {
        // ignore
      }
    }

    const heavyTurn =
      turnDomNodes >= LIGHT_TURN_PARK_MIN_DOM_NODES ||
      turnKatexNodes >= LIGHT_TURN_PARK_MIN_KATEX_NODES ||
      turnHeavyBlocks >= LIGHT_TURN_PARK_MIN_HEAVY_BLOCKS ||
      turnHeight >= LIGHT_TURN_PARK_MIN_HEIGHT_PX;
    if (heavyTurn) return true;

    if (level <= 0) return false;

    const totalTurns = Math.max(0, Number(state.turnsCache.length) || 0);
    const totalDomNodes = Math.max(0, Number(state.totalTurnDomNodes) || 0);
    const totalKatexNodes = Math.max(0, Number(state.totalTurnKatexNodes) || 0);
    const totalHeavyBlocks = Math.max(0, Number(state.totalTurnHeavyBlocks) || 0);
    return (
      totalTurns >= LIGHT_THREAD_PARK_MIN_TURNS ||
      totalDomNodes >= LIGHT_THREAD_PARK_MIN_DOM_NODES ||
      totalKatexNodes >= LIGHT_THREAD_PARK_MIN_KATEX_NODES ||
      totalHeavyBlocks >= LIGHT_THREAD_PARK_MIN_HEAVY_BLOCKS
    );
  }

  function measureParkableBodyHeight(turnEl, recordHint = null) {
    if (!(turnEl instanceof HTMLElement)) return 0;
    const record = recordHint || getCoreTurnRecord(turnEl);
    const role = inferTurnRoleForParking(turnEl, record);
    const bodyEl = findTurnBodyElForParking(turnEl, role, record);
    if (!canParkTurnBody(turnEl, bodyEl, role)) return 0;

    return withTurnUnfrozen(turnEl, () => {
      let next = 0;
      try {
        next = Math.round(bodyEl.getBoundingClientRect().height);
      } catch {
        next = 0;
      }
      if (next <= 0) {
        try {
          next = Math.round(bodyEl.offsetHeight || 0);
        } catch {
          next = 0;
        }
      }
      if (next <= 0) {
        try {
          next = Math.round(bodyEl.scrollHeight || 0);
        } catch {
          next = 0;
        }
      }
      return next;
    });
  }

  function promoteTrustedTurn(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return false;
    if (!isTurnCloseToViewport(turnEl)) return false;

    let turnHeight = Math.round(Number(measuredHeight) || 0);
    if (turnHeight <= 0) turnHeight = measureTurnHeightExact(turnEl);
    const bodyHeightRaw = measureParkableBodyHeight(turnEl);
    const committedTurn = commitTurnHeight(turnEl, turnHeight > 0 ? turnHeight : bodyHeightRaw);
    let committedBody = Math.round(Number(bodyHeightRaw) || 0);
    if (committedTurn > 0 && committedBody > committedTurn) committedBody = committedTurn;
    if (committedBody > 0) commitTurnBodyHeight(turnEl, committedBody);
    if (committedTurn <= 0 && committedBody <= 0) return false;

    state.trustedParkTurns.add(turnEl);
    state.coldDeferredTurns.delete(turnEl);
    return true;
  }

  function maybeWarmDeferredTurn(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return false;
    if (!state.coldDeferredTurns.has(turnEl)) return false;
    if (getParkedTurnState(turnEl)) return false;
    if (!turnEl.isConnected) return false;
    if (turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1') return false;

    const turnHeight = measureTurnHeightExact(turnEl);
    const bodyHeightRaw = measureParkableBodyHeight(turnEl);
    const committedTurn = commitTurnHeight(turnEl, turnHeight > 0 ? turnHeight : bodyHeightRaw);
    let committedBody = Math.round(Number(bodyHeightRaw) || 0);
    if (committedTurn > 0 && committedBody > committedTurn) committedBody = committedTurn;
    if (committedBody > 0) commitTurnBodyHeight(turnEl, committedBody);
    if (committedTurn <= 0 && committedBody <= 0) return false;

    state.trustedParkTurns.add(turnEl);
    state.coldDeferredTurns.delete(turnEl);
    return true;
  }

  function parkTurnBody(turnEl, measuredHeight, bodyHeightHint) {
    if (!(turnEl instanceof HTMLElement)) return false;
    if (getParkedTurnState(turnEl)) return true;

    const record = getCoreTurnRecord(turnEl);
    const role = inferTurnRoleForParking(turnEl, record);
    const bodyEl = findTurnBodyElForParking(turnEl, role, record);
    if (!canParkTurnBody(turnEl, bodyEl, role)) return false;

    const parentEl = bodyEl.parentNode instanceof Element ? bodyEl.parentNode : null;
    if (!(parentEl instanceof Element)) return false;

    let bodyHeight = Math.round(Number(bodyHeightHint) || 0);
    if (bodyHeight <= 0) bodyHeight = Math.round(Number(state.lastBodyHeights.get(turnEl)) || 0);
    if (bodyHeight <= 0) {
      try {
        bodyHeight = Math.round(bodyEl.getBoundingClientRect().height);
      } catch {
        bodyHeight = 0;
      }
    }
    if (bodyHeight <= 0) {
      try {
        bodyHeight = Math.round(bodyEl.offsetHeight || 0);
      } catch {
        bodyHeight = 0;
      }
    }
    if (bodyHeight <= 0) {
      try {
        bodyHeight = Math.round(bodyEl.scrollHeight || 0);
      } catch {
        bodyHeight = 0;
      }
    }
    if (bodyHeight <= 0) {
      const turnHeight = Math.round(typeof measuredHeight === 'number' ? measuredHeight : turnEl.getBoundingClientRect().height);
      bodyHeight = Math.max(1, turnHeight);
    }
    const turnHeightHint = Math.round(Number(measuredHeight) || 0);
    if (turnHeightHint > 0 && bodyHeight > turnHeightHint) bodyHeight = turnHeightHint;
    if (bodyHeight > 0) commitTurnBodyHeight(turnEl, bodyHeight);

    const placeholder = createParkedPlaceholder(bodyEl, bodyHeight, record);
    const packedBody = packParkedBodyMarkup(bodyEl);
    discardLiteCodeBlocksWithin(bodyEl);
    discardLiteMathBlocksWithin(bodyEl);
    const parkedMetrics =
      state.turnMetrics.get(turnEl) ||
      measureTurnMetrics(turnEl);
    const nextSibling = bodyEl.nextSibling;
    try {
      parentEl.replaceChild(placeholder, bodyEl);
    } catch {
      return false;
    }

    clearParkedHandoffAttrs(placeholder);

    state.parkedTurns.set(turnEl, {
      placeholder,
      parentEl,
      nextSibling,
      bodyHeight,
      serializedBodyMarkup: packedBody.markup,
      serializedBodyMode: packedBody.mode,
      serializedBodyRawBytes: packedBody.rawBytes,
      serializedBodySavedBytes: packedBody.savedBytes,
      metrics: parkedMetrics && typeof parkedMetrics === 'object'
        ? {
            domNodes: Math.max(0, Number(parkedMetrics.domNodes) || 0),
            katexNodes: Math.max(0, Number(parkedMetrics.katexNodes) || 0),
            heavyBlocks: Math.max(0, Number(parkedMetrics.heavyBlocks) || 0),
            estimated: !!parkedMetrics.estimated
          }
        : null
    });
    state.parkedTurnSet.add(turnEl);
    try {
      turnEl.setAttribute(PARKED_ATTR, '1');
    } catch {
      // ignore
    }
    publishParkingTelemetry();
    return true;
  }

  function clearParkedTurnState(turnEl) {
    const parked = state.parkedTurns.get(turnEl);
    const placeholder = parked?.placeholder instanceof HTMLElement ? parked.placeholder : null;
    if (placeholder instanceof HTMLElement) clearParkedHandoffAttrs(placeholder);
    state.parkedTurns.delete(turnEl);
    state.parkedTurnSet.delete(turnEl);
    try {
      turnEl.removeAttribute(PARKED_ATTR);
    } catch {
      // ignore
    }
  }

  function restoreTurnBody(turnEl) {
    cancelPendingPark(turnEl);
    const parked = getParkedTurnState(turnEl);
    if (!parked) return false;

    const currentRecord = getCoreTurnRecord(turnEl);
    const currentRole = inferTurnRoleForParking(turnEl, currentRecord);
    const currentBodyEl = findTurnBodyElForParking(turnEl, currentRole, currentRecord);
    const placeholderStillMounted =
      parked.placeholder instanceof Node &&
      parked.placeholder.isConnected &&
      parked.placeholder.parentNode instanceof Node;
    if (
      !placeholderStillMounted &&
      currentBodyEl instanceof HTMLElement &&
      currentBodyEl !== turnEl &&
      currentBodyEl !== parked.placeholder
    ) {
      clearParkedTurnState(turnEl);
      publishParkingTelemetry();
      return false;
    }

    const { placeholder, parentEl, nextSibling } = parked;
    const persisted = readParkedHandoffAttrs(placeholder);
    const serializedBodyMarkup =
      typeof persisted?.serializedBodyMarkup === 'string'
        ? persisted.serializedBodyMarkup
        : typeof parked.serializedBodyMarkup === 'string'
          ? parked.serializedBodyMarkup
          : '';
    const serializedBodyMode =
      typeof persisted?.serializedBodyMode === 'string' && persisted.serializedBodyMode
        ? persisted.serializedBodyMode
        : String(parked.serializedBodyMode || PARKED_MARKUP_MODE_RAW);
    const bodyEl = reviveParkedBodyFromMarkup(serializedBodyMarkup, serializedBodyMode);
    if (!(bodyEl instanceof HTMLElement)) {
      if (!placeholderStillMounted) clearParkedTurnState(turnEl);
      publishParkingTelemetry();
      return false;
    }
    let restored = false;
    try {
      if (placeholder instanceof Node && placeholder.parentNode instanceof Node) {
        placeholder.parentNode.replaceChild(bodyEl, placeholder);
        restored = true;
      } else if (parentEl instanceof Node) {
        if (nextSibling instanceof Node && nextSibling.parentNode === parentEl) parentEl.insertBefore(bodyEl, nextSibling);
        else parentEl.appendChild(bodyEl);
        restored = true;
      }
    } catch {
      restored = false;
    }

    if (restored) {
      window.requestAnimationFrame(() => {
        const run = () => {
          if (!bodyEl.isConnected) return;
          primeRestoredBodyCodeBlocks(bodyEl);
          primeRestoredBodyMathBlocks(bodyEl);
          publishParkingTelemetry();
        };
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 260 });
        else window.setTimeout(run, 0);
      });
    }
    if (restored || !placeholderStillMounted) clearParkedTurnState(turnEl);
    publishParkingTelemetry();
    return restored;
  }

  function restoreAllParkedTurns() {
    const parkedTurns = Array.from(state.parkedTurnSet);
    for (const turnEl of parkedTurns) restoreTurnBody(turnEl);
  }

  function publishReloadHandoff(payload, key = GLOBAL_HANDOFF_KEY) {
    if (!payload || typeof payload !== 'object') return;
    try {
      Object.defineProperty(globalThis, key, {
        value: payload,
        configurable: true,
        enumerable: false,
        writable: true,
      });
      return;
    } catch {
      // ignore
    }
    try {
      globalThis[key] = payload;
    } catch {
      // ignore
    }
  }

  function captureReloadHandoff() {
    const parkedEntries = [];
    for (const turnEl of Array.from(state.parkedTurnSet)) {
      if (!(turnEl instanceof HTMLElement) || !turnEl.isConnected) continue;
      const parked = state.parkedTurns.get(turnEl);
      if (!parked || typeof parked !== 'object') continue;
      const placeholder = parked.placeholder instanceof HTMLElement ? parked.placeholder : null;
      if (!(placeholder instanceof HTMLElement) || !placeholder.isConnected) continue;
      const persisted = readParkedHandoffAttrs(placeholder);
      parkedEntries.push({
        turnEl,
        parked: {
          placeholder,
          parentEl: parked.parentEl instanceof Node ? parked.parentEl : null,
          nextSibling: parked.nextSibling instanceof Node ? parked.nextSibling : null,
          bodyHeight: Math.max(0, Number(parked.bodyHeight) || 0),
          serializedBodyMarkup:
            typeof persisted?.serializedBodyMarkup === 'string'
              ? persisted.serializedBodyMarkup
              : typeof parked.serializedBodyMarkup === 'string'
                ? parked.serializedBodyMarkup
                : '',
          serializedBodyMode: String(
            persisted?.serializedBodyMode ||
            parked.serializedBodyMode ||
            PARKED_MARKUP_MODE_RAW
          ),
          serializedBodyRawBytes: Math.max(
            0,
            Number(persisted?.serializedBodyRawBytes ?? parked.serializedBodyRawBytes) || 0
          ),
          serializedBodySavedBytes: Math.max(
            0,
            Number(persisted?.serializedBodySavedBytes ?? parked.serializedBodySavedBytes) || 0
          ),
          metrics:
            persisted?.metrics && typeof persisted.metrics === 'object'
              ? {
                  domNodes: Math.max(0, Number(persisted.metrics.domNodes) || 0),
                  katexNodes: Math.max(0, Number(persisted.metrics.katexNodes) || 0),
                  heavyBlocks: Math.max(0, Number(persisted.metrics.heavyBlocks) || 0),
                  estimated: !!persisted.metrics.estimated
                }
              : parked.metrics && typeof parked.metrics === 'object'
                ? {
                    domNodes: Math.max(0, Number(parked.metrics.domNodes) || 0),
                    katexNodes: Math.max(0, Number(parked.metrics.katexNodes) || 0),
                    heavyBlocks: Math.max(0, Number(parked.metrics.heavyBlocks) || 0),
                    estimated: !!parked.metrics.estimated
                }
              : null
        }
      });
    }
    const liteCodeEntries = [];
    for (const hostEl of Array.from(state.liteCodeBlockSet)) {
      if (!(hostEl instanceof HTMLElement) || !hostEl.isConnected) continue;
      const lite = getLiteCodeBlockState(hostEl);
      if (!lite || typeof lite.serializedMarkup !== 'string' || !lite.serializedMarkup) continue;
      const liteId = ensureLiteCodeId(hostEl);
      if (!liteId) continue;
      liteCodeEntries.push({
        liteId,
        serializedMarkup: lite.serializedMarkup,
        serializedMode: String(lite.serializedMode || PARKED_MARKUP_MODE_RAW),
        serializedRawBytes: Math.max(0, Number(lite.serializedRawBytes) || 0),
        serializedSavedBytes: Math.max(0, Number(lite.serializedSavedBytes) || 0),
        estimatedDomNodes: Math.max(0, Number(lite.estimatedDomNodes) || 0),
        displayMode: String(lite.displayMode || LITE_CODE_VIEW_PREVIEW)
      });
    }
    const liteMathEntries = [];
    for (const hostEl of Array.from(state.liteMathBlockSet)) {
      if (!(hostEl instanceof HTMLElement) || !hostEl.isConnected) continue;
      const lite = getLiteMathBlockState(hostEl);
      if (!lite || typeof lite.serializedMarkup !== 'string' || !lite.serializedMarkup) continue;
      const liteMathId = ensureLiteMathId(hostEl);
      if (!liteMathId) continue;
      liteMathEntries.push({
        liteMathId,
        serializedMarkup: lite.serializedMarkup,
        serializedMode: String(lite.serializedMode || PARKED_MARKUP_MODE_RAW),
        serializedRawBytes: Math.max(0, Number(lite.serializedRawBytes) || 0),
        serializedSavedBytes: Math.max(0, Number(lite.serializedSavedBytes) || 0),
        measuredHeight: Math.max(0, Number(lite.measuredHeight) || 0)
      });
    }
    return {
      url: String(location.href || ''),
      version: EXT_VERSION,
      parkedEntries,
      liteCodeEntries,
      liteMathEntries
    };
  }

  function importLiteCodeRuntimeState(hostEl, lite) {
    if (!(hostEl instanceof HTMLElement) || !lite || typeof lite !== 'object') return false;
    const serializedMarkup = typeof lite.serializedMarkup === 'string' ? lite.serializedMarkup : '';
    if (!serializedMarkup) return false;
    const runtimeLite = {
      serializedMarkup,
      serializedMode: String(lite.serializedMode || PARKED_MARKUP_MODE_RAW),
      serializedRawBytes: Math.max(0, Number(lite.serializedRawBytes) || 0),
      serializedSavedBytes: Math.max(0, Number(lite.serializedSavedBytes) || 0),
      estimatedDomNodes: Math.max(0, Number(lite.estimatedDomNodes) || 0),
      displayMode:
        String(lite.displayMode || hostEl.getAttribute(LITE_CODE_VIEW_ATTR) || LITE_CODE_VIEW_PREVIEW)
    };
    state.liteCodeBlocks.set(hostEl, runtimeLite);
    state.liteCodeBlockSet.add(hostEl);
    try { hostEl.setAttribute(LITE_CODE_ATTR, '1'); } catch {}
    ensureLiteCodeId(hostEl);
    try { hostEl.removeAttribute(LITE_CODE_MODE_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_PAYLOAD_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_RAW_BYTES_ITEM_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_SAVED_BYTES_ITEM_ATTR); } catch {}
    try { hostEl.removeAttribute(LITE_CODE_ESTIMATED_NODES_ITEM_ATTR); } catch {}
    return true;
  }

  function importLiteMathRuntimeState(hostEl, lite) {
    if (!(hostEl instanceof HTMLElement) || !lite || typeof lite !== 'object') return false;
    const serializedMarkup = typeof lite.serializedMarkup === 'string' ? lite.serializedMarkup : '';
    if (!serializedMarkup) return false;
    const runtimeLite = {
      serializedMarkup,
      serializedMode: String(lite.serializedMode || PARKED_MARKUP_MODE_RAW),
      serializedRawBytes: Math.max(0, Number(lite.serializedRawBytes) || 0),
      serializedSavedBytes: Math.max(0, Number(lite.serializedSavedBytes) || 0),
      measuredHeight: Math.max(0, Number(lite.measuredHeight) || 0)
    };
    state.liteMathBlocks.set(hostEl, runtimeLite);
    state.liteMathBlockSet.add(hostEl);
    writeLiteMathStateAttrs(hostEl, runtimeLite);
    return true;
  }

  function adoptReloadHandoffFromDom() {
    const turnEls = document.querySelectorAll(
      [
        `.${TURN_CLASS}[${PARKED_ATTR}='1']`,
        `${FALLBACK_TURN_HOST_SELECTOR}[${PARKED_ATTR}='1']`,
        `${FALLBACK_TURN_SELECTOR}[${PARKED_ATTR}='1']`
      ].join(', ')
    );
    let adopted = 0;
    for (const turnEl of turnEls) {
      if (!(turnEl instanceof HTMLElement) || !turnEl.isConnected) continue;
      const placeholder = turnEl.querySelector(`.${PARKED_BODY_CLASS}[${PARKED_ATTR}='1']`);
      if (!(placeholder instanceof HTMLElement) || !placeholder.isConnected) continue;
      const persisted = readParkedHandoffAttrs(placeholder);
      if (!persisted?.serializedBodyMarkup) continue;
      state.parkedTurns.set(turnEl, {
        placeholder,
        parentEl: placeholder.parentNode instanceof Node ? placeholder.parentNode : null,
        nextSibling: placeholder.nextSibling instanceof Node ? placeholder.nextSibling : null,
        bodyHeight: Math.max(0, Math.round(Number.parseFloat(placeholder.style.height) || 0)),
        serializedBodyMarkup: persisted.serializedBodyMarkup,
        serializedBodyMode: String(persisted.serializedBodyMode || PARKED_MARKUP_MODE_RAW),
        serializedBodyRawBytes: Math.max(0, Number(persisted.serializedBodyRawBytes) || 0),
        serializedBodySavedBytes: Math.max(0, Number(persisted.serializedBodySavedBytes) || 0),
        metrics: {
          domNodes: Math.max(0, Number(persisted.metrics?.domNodes) || 0),
          katexNodes: Math.max(0, Number(persisted.metrics?.katexNodes) || 0),
          heavyBlocks: Math.max(0, Number(persisted.metrics?.heavyBlocks) || 0),
          estimated: !!persisted.metrics?.estimated
        }
      });
      state.parkedTurnSet.add(turnEl);
      try { turnEl.setAttribute(PARKED_ATTR, '1'); } catch {}
      clearParkedHandoffAttrs(placeholder);
      adopted += 1;
    }
    let adoptedLite = 0;
    const liteHosts = document.querySelectorAll(`pre[${LITE_CODE_ATTR}='1']`);
    for (const hostEl of liteHosts) {
      if (!(hostEl instanceof HTMLElement) || !hostEl.isConnected) continue;
      const legacyLite = {
        serializedMarkup: hostEl.getAttribute(LITE_CODE_PAYLOAD_ATTR) || '',
        serializedMode: hostEl.getAttribute(LITE_CODE_MODE_ATTR) || PARKED_MARKUP_MODE_RAW,
        serializedRawBytes: Math.max(0, Number(hostEl.getAttribute(LITE_CODE_RAW_BYTES_ITEM_ATTR)) || 0),
        serializedSavedBytes: Math.max(0, Number(hostEl.getAttribute(LITE_CODE_SAVED_BYTES_ITEM_ATTR)) || 0),
        estimatedDomNodes: Math.max(0, Number(hostEl.getAttribute(LITE_CODE_ESTIMATED_NODES_ITEM_ATTR)) || 0),
        displayMode: hostEl.getAttribute(LITE_CODE_VIEW_ATTR) || LITE_CODE_VIEW_PREVIEW
      };
      if (importLiteCodeRuntimeState(hostEl, legacyLite)) adoptedLite += 1;
    }
    if (adopted > 0 || adoptedLite > 0) publishParkingTelemetry();
    return adopted;
  }

  function adoptReloadHandoff(payload) {
    if (!payload || typeof payload !== 'object') return 0;
    const parkedEntries = Array.isArray(payload.parkedEntries) ? payload.parkedEntries : [];
    const liteCodeEntries = Array.isArray(payload.liteCodeEntries) ? payload.liteCodeEntries : [];
    const liteMathEntries = Array.isArray(payload.liteMathEntries) ? payload.liteMathEntries : [];
    let adopted = 0;
    for (const entry of parkedEntries) {
      const turnEl = entry?.turnEl;
      const parked = entry?.parked;
      if (!(turnEl instanceof HTMLElement) || !turnEl.isConnected) continue;
      if (!parked || typeof parked !== 'object') continue;
      const placeholder = parked.placeholder instanceof HTMLElement ? parked.placeholder : null;
      if (!(placeholder instanceof HTMLElement) || !placeholder.isConnected) continue;
      state.parkedTurns.set(turnEl, {
        placeholder,
        parentEl: parked.parentEl instanceof Node ? parked.parentEl : null,
        nextSibling: parked.nextSibling instanceof Node ? parked.nextSibling : null,
        bodyHeight: Math.max(0, Number(parked.bodyHeight) || 0),
        serializedBodyMarkup: typeof parked.serializedBodyMarkup === 'string' ? parked.serializedBodyMarkup : '',
        serializedBodyMode: String(parked.serializedBodyMode || PARKED_MARKUP_MODE_RAW),
        serializedBodyRawBytes: Math.max(0, Number(parked.serializedBodyRawBytes) || 0),
        serializedBodySavedBytes: Math.max(0, Number(parked.serializedBodySavedBytes) || 0),
        metrics:
          parked.metrics && typeof parked.metrics === 'object'
            ? {
                domNodes: Math.max(0, Number(parked.metrics.domNodes) || 0),
                katexNodes: Math.max(0, Number(parked.metrics.katexNodes) || 0),
                heavyBlocks: Math.max(0, Number(parked.metrics.heavyBlocks) || 0),
                estimated: !!parked.metrics.estimated
              }
            : null
      });
      state.parkedTurnSet.add(turnEl);
      try { turnEl.setAttribute(PARKED_ATTR, '1'); } catch {}
      clearParkedHandoffAttrs(placeholder);
      adopted += 1;
    }
    let adoptedLite = 0;
    if (liteCodeEntries.length) {
      const liteById = new Map();
      for (const entry of liteCodeEntries) {
        const liteId = String(entry?.liteId || '').trim();
        if (!liteId) continue;
        liteById.set(liteId, entry);
      }
      if (liteById.size) {
        const liteHosts = document.querySelectorAll(`pre[${LITE_CODE_ATTR}='1'][${LITE_CODE_ID_ATTR}]`);
        for (const hostEl of liteHosts) {
          if (!(hostEl instanceof HTMLElement) || !hostEl.isConnected) continue;
          const liteId = String(hostEl.getAttribute(LITE_CODE_ID_ATTR) || '').trim();
          if (!liteId) continue;
          const lite = liteById.get(liteId);
          if (!lite) continue;
          if (importLiteCodeRuntimeState(hostEl, lite)) adoptedLite += 1;
        }
      }
    }
    let adoptedLiteMath = 0;
    if (liteMathEntries.length) {
      const liteById = new Map();
      for (const entry of liteMathEntries) {
        const liteMathId = String(entry?.liteMathId || '').trim();
        if (!liteMathId) continue;
        liteById.set(liteMathId, entry);
      }
      if (liteById.size) {
        const liteHosts = document.querySelectorAll(`[${LITE_MATH_ATTR}='1'][${LITE_MATH_ID_ATTR}]`);
        for (const hostEl of liteHosts) {
          if (!(hostEl instanceof HTMLElement) || !hostEl.isConnected) continue;
          const liteMathId = String(hostEl.getAttribute(LITE_MATH_ID_ATTR) || '').trim();
          if (!liteMathId) continue;
          const lite = liteById.get(liteMathId);
          if (!lite) continue;
          if (importLiteMathRuntimeState(hostEl, lite)) adoptedLiteMath += 1;
        }
      }
    }
    if (adopted > 0 || adoptedLite > 0 || adoptedLiteMath > 0) publishParkingTelemetry();
    return adopted;
  }

  function cancelQueuedRestoreTurn(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return;
    state.pendingRestoreTurns.delete(turnEl);
  }

  function cancelAllQueuedRestores() {
    state.pendingRestoreTurns.clear();
    try {
      if (state.pendingRestoreRaf) window.cancelAnimationFrame(state.pendingRestoreRaf);
    } catch {
      // ignore
    }
    state.pendingRestoreRaf = 0;
    try {
      if (state.restorePulseRaf) window.cancelAnimationFrame(state.restorePulseRaf);
    } catch {
      // ignore
    }
    state.restorePulseRaf = 0;
    try {
      if (state.pendingRestoreTimer) window.clearTimeout(state.pendingRestoreTimer);
    } catch {
      // ignore
    }
    state.pendingRestoreTimer = 0;
    state.pendingRestoreDueAt = 0;
  }

  function clearPendingRestoreTimer() {
    try {
      if (state.pendingRestoreTimer) window.clearTimeout(state.pendingRestoreTimer);
    } catch {
      // ignore
    }
    state.pendingRestoreTimer = 0;
    state.pendingRestoreDueAt = 0;
  }

  function hasVisiblePendingRestoreTurn() {
    for (const turnEl of state.pendingRestoreTurns.keys()) {
      if (!(turnEl instanceof HTMLElement) || !turnEl.isConnected) continue;
      try {
        const rect = turnEl.getBoundingClientRect();
        if (rect.bottom > -48 && rect.top < window.innerHeight + 48) return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  function getQueuedRestoreShieldRetryDelay(hasVisiblePending = false) {
    const remaining = getScrollParkingShieldDelayMs();
    if (remaining <= 0) return 0;
    if (hasVisiblePending) return clampInt(remaining + 16, 32, 96);
    return clampInt(remaining + 40, 96, 180);
  }

  function restorePulseMarginPx() {
    const level = Math.max(0, Number(state.budgetLevel) || 0);
    const base =
      level >= 4
        ? window.innerHeight * 0.58
        : level >= 3
          ? window.innerHeight * 0.74
          : level >= 2
            ? window.innerHeight * 0.92
            : window.innerHeight * 1.1;
    return clampInt(base, 320, 920);
  }

  function restorePulseLimit() {
    const level = Math.max(0, Number(state.budgetLevel) || 0);
    if (level >= 4) return 2;
    if (level >= 2) return 3;
    return 4;
  }

  function clearVisibleTurnContainment(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return;
    try {
      turnEl.removeAttribute(VISIBLE_AUTO_ATTR);
    } catch {
      // ignore
    }
    turnEl.style.removeProperty(VISIBLE_INTRINSIC_VAR);
  }

  function syncVisibleTurnContainment(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return;
    if (
      turnEl.classList.contains(OFFSCREEN_CLASS) ||
      turnEl.getAttribute(PARKED_ATTR) === '1' ||
      turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1' ||
      turnEl.querySelector("iframe[title='internal://deep-research'], iframe[src*='connector_openai_deep_research' i]")
    ) {
      clearVisibleTurnContainment(turnEl);
      return;
    }
    const brokenMathCount = countLikelyBrokenDisplayMath(turnEl);
    state.brokenMathCount = brokenMathCount;
    if (brokenMathCount > 0) {
      clearVisibleTurnContainment(turnEl);
      publishRuntimeDebugTelemetry();
      return;
    }
    const height =
      Math.round(Number(measuredHeight) || Number(state.lastHeights.get(turnEl)) || 0) ||
      Math.round(turnEl.getBoundingClientRect?.().height || turnEl.scrollHeight || 0);
    if (height < VISIBLE_AUTO_CONTENT_MIN_HEIGHT_PX) {
      clearVisibleTurnContainment(turnEl);
      return;
    }
    try {
      turnEl.setAttribute(VISIBLE_AUTO_ATTR, '1');
    } catch {
      // ignore
    }
    turnEl.style.setProperty(VISIBLE_INTRINSIC_VAR, `1px ${Math.max(1, height)}px`);
  }

  function shouldDeferVisibleParkedRestore(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return false;
    if (!(isWindowScrollShieldActive() || isCodeScrollShieldActive())) return false;
    const parked = getParkedTurnState(turnEl);
    if (!parked) return false;
    if (isWindowScrollShieldActive()) return true;
    const rawBytes = Math.max(0, Number(parked.serializedBodyRawBytes) || 0);
    const bodyHeight = Math.max(0, Number(parked.bodyHeight) || 0);
    const domNodes = Math.max(0, Number(parked.metrics?.domNodes) || 0);
    const katexNodes = Math.max(0, Number(parked.metrics?.katexNodes) || 0);
    const heavyBlocks = Math.max(0, Number(parked.metrics?.heavyBlocks) || 0);
    return (
      rawBytes >= 24_000 ||
      bodyHeight >= 1_800 ||
      domNodes >= 1_600 ||
      katexNodes >= 24 ||
      heavyBlocks >= 8
    );
  }

  function shouldPreviewOnlyVisibleParkedTurn(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return false;
    if (!isWindowScrollShieldActive()) return false;
    const parked = getParkedTurnState(turnEl);
    if (!parked) return false;
    const rawBytes = Math.max(0, Number(parked.serializedBodyRawBytes) || 0);
    const bodyHeight = Math.max(0, Number(parked.bodyHeight) || 0);
    const domNodes = Math.max(0, Number(parked.metrics?.domNodes) || 0);
    const katexNodes = Math.max(0, Number(parked.metrics?.katexNodes) || 0);
    const heavyBlocks = Math.max(0, Number(parked.metrics?.heavyBlocks) || 0);
    const distance = Math.max(0, Number(getTurnViewportDistance(turnEl)) || 0);
    const urgentMargin = Math.max(96, Math.min(restorePulseMarginPx(), 240));
    if (distance > urgentMargin) return true;
    return (
      rawBytes >= 8_000 ||
      bodyHeight >= 900 ||
      domNodes >= 420 ||
      katexNodes >= 8 ||
      heavyBlocks >= 2
    );
  }

  function restoreTurnImmediately(turnEl, measuredHeight, options = null) {
    if (!(turnEl instanceof HTMLElement)) return false;
    cancelPendingPark(turnEl);
    cancelQueuedRestoreTurn(turnEl);
    if (options?.allowDeferred && shouldDeferVisibleParkedRestore(turnEl)) {
      finalizeVisibleTurn(turnEl, measuredHeight);
      scheduleRestoreTurn(turnEl, measuredHeight);
      return true;
    }
    restoreTurnBody(turnEl);
    finalizeVisibleTurn(turnEl, measuredHeight);
    return true;
  }

  function applyVisibleRestorePulse(marginPx = restorePulseMarginPx()) {
    if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return 0;
    const container = state.containerEl;
    if (!(container instanceof HTMLElement)) return 0;
    const windowShieldActive = isWindowScrollShieldActive();

    const turns =
      state.turnsCache.length && state.turnsRoot === container
        ? state.turnsCache
        : getTurnElements(container);
    const total = turns.length;
    if (!total) return 0;
    setTurnsCache(turns, container, state.turnsVersion);

    const topBound = -Math.max(0, Number(marginPx) || 0);
    const bottomBound = window.innerHeight + Math.max(0, Number(marginPx) || 0);
    const first = findFirstIndexByBottom(turns, topBound);
    const last = findLastIndexByTop(turns, bottomBound);
    if (last < first) return 0;

    const candidates = [];
    for (let i = first; i <= last; i += 1) {
      const turnEl = turns[i];
      if (!(turnEl instanceof HTMLElement) || !turnEl.isConnected) continue;
      const parked = getParkedTurnState(turnEl);
      const offscreen = turnEl.classList.contains(OFFSCREEN_CLASS);
      if (!(parked || offscreen || state.pendingRestoreTurns.has(turnEl))) continue;
      if (windowShieldActive && offscreen && !parked && !state.pendingRestoreTurns.has(turnEl)) continue;
      candidates.push({
        turnEl,
        distance: getTurnViewportDistance(turnEl),
        measuredHeight: Math.round(Number(state.lastHeights.get(turnEl)) || 0),
      });
    }

    if (!candidates.length) return 0;
    candidates.sort((a, b) => a.distance - b.distance);

    let restored = 0;
    let remaining = false;
    const limit = windowShieldActive ? 1 : restorePulseLimit();
    const startedAt = nowPerf();
    for (let i = 0; i < candidates.length; i += 1) {
      const entry = candidates[i];
      restoreTurnImmediately(entry.turnEl, entry.measuredHeight, { allowDeferred: true });
      restored += 1;
      if (i + 1 < candidates.length) remaining = true;
      if (restored >= limit) break;
      if (nowPerf() - startedAt >= 14) break;
    }

    if (remaining) scheduleVisibleRestorePulse('continue');
    return restored;
  }

  function scheduleVisibleRestorePulse(reason = 'unknown') {
    if (state.disposed || state.restorePulseRaf) return;
    if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
    state.restorePulseRaf = window.requestAnimationFrame(() => {
      state.restorePulseRaf = 0;
      try {
        applyVisibleRestorePulse();
      } catch (err) {
        if (state.settings.showOverlay) console.warn('[cgptperf] visible restore pulse failed', reason, err);
      }
    });
  }

  function clearVisibleHeavyPassTimers() {
    for (const timer of Array.from(state.visibleHeavyPassTimers)) {
      try {
        window.clearTimeout(timer);
      } catch {
        // ignore
      }
    }
    state.visibleHeavyPassTimers.clear();
  }

  function applyVisibleHeavyBlockPass(turnsInput = null, firstInput = null, lastInput = null, options = null) {
    if (!(state.settings.enabled && state.settings.optimizeHeavyBlocks)) {
      state.visibleHeavyLastReason = String(options?.reason || 'disabled');
      state.visibleHeavyLastVisibleTurns = 0;
      state.visibleHeavyLastPendingMathHosts = 0;
      state.visibleHeavyLastSimplified = 0;
      state.visibleHeavyLastAt = nowPerf();
      publishRuntimeDebugTelemetry();
      return { simplified: 0, visibleTurns: 0, pendingMathHosts: 0 };
    }
    const container = state.containerEl;
    if (!(container instanceof HTMLElement)) {
      state.visibleHeavyLastReason = String(options?.reason || 'no-container');
      state.visibleHeavyLastVisibleTurns = 0;
      state.visibleHeavyLastPendingMathHosts = 0;
      state.visibleHeavyLastSimplified = 0;
      state.visibleHeavyLastAt = nowPerf();
      publishRuntimeDebugTelemetry();
      return { simplified: 0, visibleTurns: 0, pendingMathHosts: 0 };
    }

    const turns =
      Array.isArray(turnsInput) && turnsInput.length
        ? turnsInput
        : state.turnsCache.length && state.turnsRoot === container
          ? state.turnsCache
          : getTurnElements(container);
    const total = turns.length;
    if (!total) {
      state.visibleHeavyLastReason = String(options?.reason || 'no-turns');
      state.visibleHeavyLastVisibleTurns = 0;
      state.visibleHeavyLastPendingMathHosts = 0;
      state.visibleHeavyLastSimplified = 0;
      state.visibleHeavyLastAt = nowPerf();
      publishRuntimeDebugTelemetry();
      return { simplified: 0, visibleTurns: 0, pendingMathHosts: 0 };
    }

    const topBound = -48;
    const bottomBound = window.innerHeight + 48;
    const first = Number.isFinite(Number(firstInput)) ? Math.max(0, Number(firstInput) || 0) : findFirstIndexByBottom(turns, topBound);
    const last = Number.isFinite(Number(lastInput))
      ? Math.min(total - 1, Number(lastInput) || 0)
      : findLastIndexByTop(turns, bottomBound);
    if (last < first) {
      state.visibleHeavyLastReason = String(options?.reason || 'empty-window');
      state.visibleHeavyLastVisibleTurns = 0;
      state.visibleHeavyLastPendingMathHosts = 0;
      state.visibleHeavyLastSimplified = 0;
      state.visibleHeavyLastAt = nowPerf();
      publishRuntimeDebugTelemetry();
      return { simplified: 0, visibleTurns: 0, pendingMathHosts: 0 };
    }

    let simplified = 0;
    let visibleTurns = 0;
    let pendingMathHosts = 0;
    const startedAt = nowPerf();
    for (let i = first; i <= last; i += 1) {
      const turnEl = turns[i];
      if (!(turnEl instanceof HTMLElement) || !turnEl.isConnected) continue;
      if (turnEl.classList.contains(OFFSCREEN_CLASS)) continue;
      if (!isTurnIntersectingViewport(turnEl, 48)) continue;
      visibleTurns += 1;
      const mathProfile = measureLiteMathTurnProfile(turnEl);
      let pendingMathForTurn = 0;
      if (mathProfile.bodyRoot instanceof Element) {
        const denseTurn =
          mathProfile.displayBlocks >= LITE_MATH_MIN_DISPLAY_BLOCKS &&
          mathProfile.turnHeight >= LITE_MATH_MIN_DENSE_TURN_HEIGHT_PX &&
          mathProfile.domNodes >= LITE_MATH_MIN_DENSE_TURN_DOM_NODES;
        const qualifies =
          denseTurn ||
          (mathProfile.katexNodes >= LITE_MATH_MIN_TURN_KATEX_NODES && mathProfile.turnHeight >= LITE_MATH_MIN_TURN_HEIGHT_PX);
        if (qualifies) {
          try {
            const hosts = mathProfile.bodyRoot.querySelectorAll('.katex-display, mjx-container');
            for (const hostEl of hosts) {
              if (!(hostEl instanceof HTMLElement)) continue;
              if (hostEl.getAttribute(LITE_MATH_ATTR) === '1') continue;
              pendingMathForTurn += 1;
            }
          } catch {
            pendingMathForTurn = 0;
          }
        }
      }
      pendingMathHosts += pendingMathForTurn;
      simplified += maybeSimplifyTurnMathBlocks(turnEl, { profile: mathProfile });
      simplified += maybeSimplifyTurnCodeBlocks(turnEl);
      if (nowPerf() - startedAt >= 14) break;
    }
    state.visibleHeavyLastReason = String(options?.reason || 'runtime');
    state.visibleHeavyLastVisibleTurns = visibleTurns;
    state.visibleHeavyLastPendingMathHosts = pendingMathHosts;
    state.visibleHeavyLastSimplified = simplified;
    state.visibleHeavyLastAt = nowPerf();
    publishRuntimeDebugTelemetry();
    return { simplified, visibleTurns, pendingMathHosts };
  }

  function scheduleVisibleHeavyBlockPass(delayMs = 0, turnsInput = null, firstInput = null, lastInput = null, options = null) {
    if (!(state.settings.enabled && state.settings.optimizeHeavyBlocks)) return;
    const waitMs = Math.max(0, Math.round(Number(delayMs) || 0));
    const timer = window.setTimeout(() => {
      state.visibleHeavyPassTimers.delete(timer);
      if (state.disposed) return;
      try {
        const result = applyVisibleHeavyBlockPass(turnsInput, firstInput, lastInput, options);
        const retriesLeft = Math.max(0, Number(options?.remainingRetries) || 0);
        if (
          options?.retryOnMathMiss &&
          retriesLeft > 0 &&
          Number(result?.pendingMathHosts) > 0 &&
          Number(result?.simplified) < Number(result?.pendingMathHosts)
        ) {
          scheduleVisibleHeavyBlockPass(VISIBLE_HEAVY_RETRY_DELAY_MS, null, null, null, {
            ...options,
            remainingRetries: retriesLeft - 1,
            reason: String(options?.reason || 'visible-heavy-retry'),
          });
        }
      } catch (err) {
        if (state.settings.showOverlay) console.warn('[cgptperf] visible heavy pass failed', err);
      }
    }, waitMs);
    state.visibleHeavyPassTimers.add(timer);
  }

  function getViewportScroller() {
    const seeds = [];
    if (state.containerEl instanceof HTMLElement) seeds.push(state.containerEl);
    if (state.turnsRoot instanceof HTMLElement && state.turnsRoot !== state.containerEl) seeds.push(state.turnsRoot);
    const mainEl = document.querySelector('main');
    if (mainEl instanceof HTMLElement) seeds.push(mainEl);

    for (const seed of seeds) {
      let node = seed;
      while (node instanceof HTMLElement) {
        if (isScrollableViewportCandidate(node)) return node;
        node = node.parentElement;
      }
    }

    const mainParent = document.querySelector('main')?.parentElement;
    if (isScrollableViewportCandidate(mainParent)) return mainParent;
    if (document.scrollingElement instanceof HTMLElement) return document.scrollingElement;
    return document.documentElement;
  }

  function getViewportScrollTop() {
    try {
      const scroller = getViewportScroller();
      state.startupViewportScrollerLabel = describeElementForTelemetry(scroller);
      return Math.max(0, Number(scroller?.scrollTop) || 0);
    } catch {
      return 0;
    }
  }

  function clearStartupViewportWatch() {
    try {
      if (state.startupViewportWatchTimer) window.clearInterval(state.startupViewportWatchTimer);
    } catch {
      // ignore
    }
    state.startupViewportWatchTimer = 0;
    state.startupViewportWatchTicks = 0;
    state.startupViewportTriggered = false;
    publishRuntimeDebugTelemetry();
  }

  function startStartupViewportWatch() {
    clearStartupViewportWatch();
    state.startupViewportLastScrollTop = getViewportScrollTop();
    state.startupViewportLastReason = 'armed';
    publishRuntimeDebugTelemetry();
    state.startupViewportWatchTimer = window.setInterval(() => {
      if (state.disposed) {
        clearStartupViewportWatch();
        return;
      }
      state.startupViewportWatchTicks += 1;
      const currentScrollTop = getViewportScrollTop();
      const previousScrollTop = Number(state.startupViewportLastScrollTop) || 0;
      state.startupViewportLastScrollTop = currentScrollTop;
      const shiftThreshold = Math.max(180, Math.round((window.innerHeight || 0) * 0.3));
      if (Math.abs(currentScrollTop - previousScrollTop) >= shiftThreshold) {
        state.startupViewportLastReason = 'shift';
        scheduleApplyVirtualizationNow('startup-viewport-shift');
        scheduleVisibleHeavyBlockPass(120, null, null, null, {
          reason: 'startup-viewport-shift',
          retryOnMathMiss: true,
          remainingRetries: VISIBLE_HEAVY_RETRY_MAX_ATTEMPTS,
        });
        state.startupViewportTriggered = true;
      } else if (currentScrollTop > shiftThreshold && !state.startupViewportTriggered) {
        state.startupViewportLastReason = 'restored';
        scheduleApplyVirtualizationNow('startup-viewport-restored');
        scheduleVisibleHeavyBlockPass(120, null, null, null, {
          reason: 'startup-viewport-restored',
          retryOnMathMiss: true,
          remainingRetries: VISIBLE_HEAVY_RETRY_MAX_ATTEMPTS,
        });
        state.startupViewportTriggered = true;
      } else {
        state.startupViewportLastReason = state.startupViewportTriggered ? 'steady-after-restore' : 'steady';
      }
      publishRuntimeDebugTelemetry();
      if (
        state.startupViewportWatchTicks >= STARTUP_VIEWPORT_WATCH_MAX_TICKS ||
        (currentScrollTop > shiftThreshold && state.startupViewportTriggered)
      ) {
        clearStartupViewportWatch();
      }
    }, STARTUP_VIEWPORT_WATCH_MS);
  }

  function scheduleQueuedRestoreDrain(delayMs = 0) {
    if (state.disposed) return;
    const waitMs = Math.max(0, Math.round(Number(delayMs) || 0));
    if (state.pendingRestoreRaf) return;
    const desiredDueAt = nowPerf() + waitMs;
    if (state.pendingRestoreTimer) {
      const currentDueAt = Math.max(0, Number(state.pendingRestoreDueAt) || 0);
      if (waitMs <= 0) {
        return;
      }
      if (currentDueAt > 0 && currentDueAt <= desiredDueAt + 8) {
        return;
      }
      clearPendingRestoreTimer();
    }
    if (waitMs > 0) {
      state.pendingRestoreDueAt = desiredDueAt;
      state.pendingRestoreTimer = window.setTimeout(() => {
        state.pendingRestoreTimer = 0;
        state.pendingRestoreDueAt = 0;
        if (state.disposed || state.pendingRestoreRaf) return;
        state.pendingRestoreRaf = window.requestAnimationFrame(drainQueuedRestores);
      }, waitMs);
      return;
    }
    state.pendingRestoreRaf = window.requestAnimationFrame(drainQueuedRestores);
  }

  function finalizeVisibleTurn(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return;
    const wasOffscreen = turnEl.classList.contains(OFFSCREEN_CLASS);
    if (!wasOffscreen && !state.coldDeferredTurns.has(turnEl)) {
      syncVisibleTurnContainment(turnEl, measuredHeight);
      return;
    }
    turnEl.classList.remove(OFFSCREEN_CLASS);
    turnEl.style.removeProperty(INTRINSIC_VAR);
    syncVisibleTurnContainment(turnEl, measuredHeight);
    restoreLiteCodeBlocksWithin(turnEl);
    if (state.trustedParkTurns.has(turnEl)) {
      const turnHeight = Math.round(Number(measuredHeight) || 0);
      if (turnHeight > 0) commitTurnHeight(turnEl, turnHeight);
      const bodyHeight = measureParkableBodyHeight(turnEl);
      let nextBody = Math.round(Number(bodyHeight) || 0);
      if (turnHeight > 0 && nextBody > turnHeight) nextBody = turnHeight;
      if (nextBody > 0) commitTurnBodyHeight(turnEl, nextBody);
      state.coldDeferredTurns.delete(turnEl);
      return;
    }
    promoteTrustedTurn(turnEl, measuredHeight);
  }

  function drainQueuedRestores() {
    state.pendingRestoreRaf = 0;
    if (!state.pendingRestoreTurns.size) return;
    if (state.pendingRestoreTimer) clearPendingRestoreTimer();
    const now = nowPerf();
    const codeShieldDelay = Math.max(0, (Number(state.codeScrollShieldUntil) || 0) - now);
    const windowShieldDelay = Math.max(0, (Number(state.windowScrollShieldUntil) || 0) - now);
    const shieldDelay = Math.max(codeShieldDelay, windowShieldDelay);
    if (shieldDelay > 0) {
      const hasVisiblePending = hasVisiblePendingRestoreTurn();
      const idleFor = now - Math.max(0, Number(state.lastWindowScrollAt) || 0);
      const allowEarlyVisibleRestore =
        hasVisiblePending &&
        codeShieldDelay <= 0 &&
        (windowShieldDelay <= VISIBLE_PENDING_RESTORE_EARLY_MS || idleFor >= VISIBLE_PENDING_RESTORE_IDLE_MS);
      if (!allowEarlyVisibleRestore) {
        scheduleQueuedRestoreDrain(getQueuedRestoreShieldRetryDelay(hasVisiblePending));
        return;
      }
    }

    const entries = [];
    for (const [turnEl, measuredHeight] of Array.from(state.pendingRestoreTurns.entries())) {
      if (!(turnEl instanceof HTMLElement) || !turnEl.isConnected) {
        state.pendingRestoreTurns.delete(turnEl);
        continue;
      }
      if (turnEl.classList.contains(OFFSCREEN_CLASS)) {
        state.pendingRestoreTurns.delete(turnEl);
        continue;
      }
      let distance = Number.POSITIVE_INFINITY;
      let visible = false;
      try {
        const rect = turnEl.getBoundingClientRect();
        visible = rect.bottom > 0 && rect.top < window.innerHeight;
        distance = Math.abs(rect.top);
      } catch {
        distance = Number.POSITIVE_INFINITY;
      }
      entries.push({ turnEl, measuredHeight, distance, visible });
    }

    if (!entries.length) return;
    entries.sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      return a.distance - b.distance;
    });

    const batchLimit = entries.some((entry) => entry.visible)
      ? Math.max(1, Math.min(restorePulseLimit(), 3))
      : 1;
    const startedAt = nowPerf();
    let processed = 0;
    let nextDelay = 180;
    while (entries.length) {
      const entry = entries.shift();
      if (!entry) break;
      state.pendingRestoreTurns.delete(entry.turnEl);
      const parked = getParkedTurnState(entry.turnEl);
      const parkedBodyHeight = Math.max(0, Number(parked?.bodyHeight) || 0);
      const heavyBlocks = Math.max(0, Number(parked?.metrics?.heavyBlocks) || 0);
      restoreTurnImmediately(entry.turnEl, entry.measuredHeight);
      processed += 1;
      const nextEntry = entries[0] || null;
      const nextEntryDistance = Number(nextEntry?.distance);
      if (nextEntry?.visible) nextDelay = 24;
      else if (Number.isFinite(nextEntryDistance) && nextEntryDistance <= restorePulseMarginPx()) nextDelay = 32;
      else nextDelay = heavyBlocks > 0 || parkedBodyHeight >= 2400 ? 420 : parkedBodyHeight >= 1400 ? 280 : 180;
      if (processed >= batchLimit) break;
      if (nowPerf() - startedAt >= 12) break;
    }

    if (state.pendingRestoreTurns.size) {
      scheduleQueuedRestoreDrain(nextDelay);
    }
  }

  function scheduleRestoreTurn(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return;
    state.pendingRestoreTurns.set(turnEl, Math.round(Number(measuredHeight) || 0));
    scheduleParkingTelemetryPublish();
    const preferredDelay = isTurnIntersectingViewport(turnEl, 72) ? 24 : 0;
    scheduleQueuedRestoreDrain(preferredDelay);
  }

  function drainQueuedParks() {
    state.pendingParkRaf = 0;
    if (!state.pendingParkTurns.size) return;
    if (isScrollParkingShieldActive()) {
      state.pendingParkRaf = window.requestAnimationFrame(drainQueuedParks);
      return;
    }

    const entries = [];
    for (const [turnEl, hints] of Array.from(state.pendingParkTurns.entries())) {
      if (!(turnEl instanceof HTMLElement) || !turnEl.isConnected) {
        state.pendingParkTurns.delete(turnEl);
        continue;
      }
      if (!turnEl.classList.contains(OFFSCREEN_CLASS) || getParkedTurnState(turnEl)) {
        state.pendingParkTurns.delete(turnEl);
        continue;
      }
      let distance = 0;
      try {
        const rect = turnEl.getBoundingClientRect();
        distance = Math.abs(rect.top);
      } catch {
        distance = 0;
      }
      entries.push({
        turnEl,
        hints: hints && typeof hints === 'object' ? hints : {},
        distance
      });
    }

    if (!entries.length) return;
    entries.sort((a, b) => b.distance - a.distance);
    const pendingCount = entries.length;
    const backlogBoost =
      pendingCount >= 48
        ? 8
        : pendingCount >= 24
          ? 6
          : pendingCount >= 12
            ? 4
            : pendingCount >= 6
              ? 2
              : 1;
    const limit = Math.max(1, state.budgetLevel >= 3 ? 2 : 1, backlogBoost);
    const aggressive = shouldUseAggressiveReconcile();
    const sliceStart = nowPerf();
    let processed = 0;
    for (const entry of entries) {
      if (processed >= limit) break;
      state.pendingParkTurns.delete(entry.turnEl);
      let measuredHeight = Math.round(Number(entry.hints.turnHeightHint) || 0);
      if (measuredHeight <= 0) measuredHeight = Math.round(Number(state.lastHeights.get(entry.turnEl)) || 0);
      if (measuredHeight <= 0) {
        try {
          measuredHeight = Math.round(entry.turnEl.getBoundingClientRect().height);
        } catch {
          measuredHeight = 0;
        }
      }
      const bodyHeightHint =
        Math.round(Number(entry.hints.bodyHeightHint) || 0) ||
        Math.round(Number(state.lastBodyHeights.get(entry.turnEl)) || 0);
      parkTurnBody(entry.turnEl, measuredHeight, bodyHeightHint);
      processed += 1;
      if (aggressive && nowPerf() - sliceStart >= 10) break;
    }

    if (state.pendingParkTurns.size) {
      state.pendingParkRaf = window.requestAnimationFrame(drainQueuedParks);
    }
  }

  function scheduleQueuedParkTurn(turnEl, hints = null) {
    if (!(turnEl instanceof HTMLElement)) return;
    const nextHints = {
      turnHeightHint: Math.round(Number(hints?.turnHeightHint) || 0),
      bodyHeightHint: Math.round(Number(hints?.bodyHeightHint) || 0),
    };
    const prev = state.pendingParkTurns.get(turnEl);
    if (prev && typeof prev === 'object') {
      if (nextHints.turnHeightHint <= 0) nextHints.turnHeightHint = Math.round(Number(prev.turnHeightHint) || 0);
      if (nextHints.bodyHeightHint <= 0) nextHints.bodyHeightHint = Math.round(Number(prev.bodyHeightHint) || 0);
    }
    state.pendingParkTurns.set(turnEl, nextHints);
    scheduleParkingTelemetryPublish();
    if (state.pendingParkRaf) return;
    state.pendingParkRaf = window.requestAnimationFrame(drainQueuedParks);
  }

  function shouldFastQueueParkTurn(turnEl, hints = null) {
    if (!(turnEl instanceof HTMLElement)) return false;
    if (isScrollParkingShieldActive()) return false;
    if (!turnEl.isConnected || !turnEl.classList.contains(OFFSCREEN_CLASS)) return false;
    if (getParkedTurnState(turnEl)) return false;
    const distance = getTurnViewportDistance(turnEl);
    const farEnough = distance >= Math.max(window.innerHeight * 0.75, 640);
    if (!farEnough) return false;
    const turnHeightHint =
      Math.round(Number(hints?.turnHeightHint) || 0) ||
      Math.round(Number(state.lastHeights.get(turnEl)) || 0);
    if (turnHeightHint <= 0) return false;
    const bodyHeightHint =
      Math.round(Number(hints?.bodyHeightHint) || 0) ||
      Math.round(Number(state.lastBodyHeights.get(turnEl)) || 0);
    if (bodyHeightHint > 0 || state.trustedParkTurns.has(turnEl)) return true;
    const metrics = state.turnMetrics.get(turnEl);
    const domNodes = Math.max(0, Number(metrics?.domNodes) || 0);
    const katexNodes = Math.max(0, Number(metrics?.katexNodes) || 0);
    const heavyBlocks = Math.max(0, Number(metrics?.heavyBlocks) || 0);
    return (
      domNodes >= LIGHT_TURN_PARK_MIN_DOM_NODES ||
      katexNodes >= LIGHT_TURN_PARK_MIN_KATEX_NODES ||
      heavyBlocks >= LIGHT_TURN_PARK_MIN_HEAVY_BLOCKS
    );
  }

  function scheduleParkTurn(turnEl, hints = null) {
    if (!(turnEl instanceof HTMLElement)) return;
    if (getParkedTurnState(turnEl)) return;
    if (state.pendingParkTurns.has(turnEl)) {
      scheduleQueuedParkTurn(turnEl, hints);
      return;
    }
    if (state.pendingParkFrames.has(turnEl)) {
      const pending = state.pendingParkFrames.get(turnEl);
      if (pending && hints && typeof hints === 'object') {
        if (Number(hints.turnHeightHint) > 0) pending.turnHeightHint = Math.round(Number(hints.turnHeightHint) || 0);
        if (Number(hints.bodyHeightHint) > 0) pending.bodyHeightHint = Math.round(Number(hints.bodyHeightHint) || 0);
      }
      if (pending && shouldFastQueueParkTurn(turnEl, pending)) {
        try {
          if (pending.raf1) window.cancelAnimationFrame(pending.raf1);
        } catch {}
        try {
          if (pending.raf2) window.cancelAnimationFrame(pending.raf2);
        } catch {}
        state.pendingParkFrames.delete(turnEl);
        scheduleQueuedParkTurn(turnEl, pending);
      }
      return;
    }

    const pending = {
      raf1: 0,
      raf2: 0,
      turnHeightHint: Math.round(Number(hints?.turnHeightHint) || 0),
      bodyHeightHint: Math.round(Number(hints?.bodyHeightHint) || 0),
    };
    if (shouldFastQueueParkTurn(turnEl, pending)) {
      scheduleQueuedParkTurn(turnEl, pending);
      return;
    }
    if (shouldUseAggressiveReconcile() && turnEl.classList.contains(OFFSCREEN_CLASS)) {
      scheduleQueuedParkTurn(turnEl, pending);
      return;
    }
    const finalize = () => {
      if (isScrollParkingShieldActive()) {
        state.pendingParkFrames.delete(turnEl);
        scheduleParkingTelemetryPublish();
        scheduleQueuedParkTurn(turnEl, pending);
        return;
      }
      state.pendingParkFrames.delete(turnEl);
      scheduleParkingTelemetryPublish();
      if (!turnEl.isConnected) return;
      if (!turnEl.classList.contains(OFFSCREEN_CLASS)) return;
      if (getParkedTurnState(turnEl)) return;
      let measuredHeight = Math.round(Number(pending.turnHeightHint) || 0);
      if (measuredHeight <= 0) measuredHeight = Math.round(Number(state.lastHeights.get(turnEl)) || 0);
      if (measuredHeight <= 0) {
        try {
          measuredHeight = Math.round(turnEl.getBoundingClientRect().height);
        } catch {
          measuredHeight = 0;
        }
      }
      const bodyHeightHint = Math.round(Number(pending.bodyHeightHint) || 0) || Math.round(Number(state.lastBodyHeights.get(turnEl)) || 0);
      parkTurnBody(turnEl, measuredHeight, bodyHeightHint);
    };

    pending.raf1 = window.requestAnimationFrame(() => {
      pending.raf1 = 0;
      pending.raf2 = window.requestAnimationFrame(() => {
        pending.raf2 = 0;
        finalize();
      });
    });

    state.pendingParkFrames.set(turnEl, pending);
    scheduleParkingTelemetryPublish();
  }

  function measureTurnMetrics(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return { domNodes: 0, katexNodes: 0, heavyBlocks: 0 };
    const parked = getParkedTurnState(turnEl);
    if (parked?.metrics) {
      return {
        domNodes: Math.max(0, Number(parked.metrics.domNodes) || 0),
        katexNodes: Math.max(0, Number(parked.metrics.katexNodes) || 0),
        heavyBlocks: Math.max(0, Number(parked.metrics.heavyBlocks) || 0),
        estimated: !!parked.metrics.estimated
      };
    }
    const record = getCoreTurnRecord(turnEl);
    const role = inferTurnRoleForParking(turnEl, record);
    const bodyRoot = findTurnBodyElForParking(turnEl, role, record) || turnEl;
    let directChildren = 0;
    let markdownBlocks = 0;
    let codeBlocks = 0;
    let katexNodes = 0;
    let tables = 0;
    let quotes = 0;
    try {
      directChildren = Math.max(0, Number(bodyRoot?.childElementCount) || 0);
    } catch {}
    try {
      const markdown = bodyRoot?.querySelector?.('.markdown');
      markdownBlocks = Math.max(0, Number(markdown?.childElementCount) || 0);
    } catch {}
    try {
      codeBlocks = bodyRoot?.querySelectorAll?.('pre')?.length || 0;
    } catch {}
    try {
      // New ChatGPT replies often render most formula weight as inline `.katex`
      // spans instead of only `.katex-display`/`mjx-container`.
      katexNodes = bodyRoot?.querySelectorAll?.('.katex, math, mjx-container')?.length || 0;
    } catch {}
    try {
      tables = bodyRoot?.querySelectorAll?.('table')?.length || 0;
    } catch {}
    try {
      quotes = bodyRoot?.querySelectorAll?.('.markdown > blockquote, blockquote')?.length || 0;
    } catch {}
    const heavyBlocks = Math.max(0, codeBlocks + tables + quotes + katexNodes);
    const shape = Math.max(directChildren, markdownBlocks);
    const domNodes = Math.max(120, (shape * 36) + (codeBlocks * 180) + (katexNodes * 96) + (tables * 220) + (quotes * 72));
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

  function isWindowScrollShieldActive() {
    try {
      return performance.now() < (Number(state.windowScrollShieldUntil) || 0);
    } catch {
      return false;
    }
  }

  function getScrollParkingShieldDelayMs() {
    const now = nowPerf();
    const codeDelay = Math.max(0, (Number(state.codeScrollShieldUntil) || 0) - now);
    const windowDelay = Math.max(0, (Number(state.windowScrollShieldUntil) || 0) - now);
    return Math.max(codeDelay, windowDelay);
  }

  function isScrollParkingShieldActive() {
    return getScrollParkingShieldDelayMs() > 0;
  }

  function clearWindowScrollShieldTimer() {
    try {
      if (state.windowScrollResumeTimer) window.clearTimeout(state.windowScrollResumeTimer);
    } catch {
      // ignore
    }
    state.windowScrollResumeTimer = 0;
  }

  function armWindowScrollShield(delayMs = 180) {
    const ms = clampInt(delayMs, 80, 600);
    const now = nowPerf();
    state.windowScrollShieldUntil = Math.max(Number(state.windowScrollShieldUntil) || 0, now + ms);
    clearWindowScrollShieldTimer();
    state.windowScrollResumeTimer = window.setTimeout(() => {
      state.windowScrollResumeTimer = 0;
      if (state.disposed) return;
      if (isWindowScrollShieldActive()) {
        armWindowScrollShield(Math.ceil((Number(state.windowScrollShieldUntil) || 0) - nowPerf()));
        return;
      }
      scheduleApplyVirtualizationNow('window-scroll-resume');
    }, ms + 24);
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
    const hasModerateContentPressure = dom >= 3500 || heavyBlocks >= 24 || katex >= 24;
    const hasHighContentPressure = dom >= 6500 || heavyBlocks >= 64 || katex >= 64;

    if (dom >= 5000) level += 1;
    if (dom >= 10000) level += 1;
    if (heavyBlocks >= 80) level += 1;
    if (heavyBlocks >= 160) level += 1;
    if (katex >= 80) level += 1;
    if (katex >= 160) level += 1;
    // Conversation length should only amplify real content pressure.
    if (hasModerateContentPressure && turns >= 24) level += 1;
    if (hasHighContentPressure && turns >= 36) level += 1;

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

  function isAggressiveReconcileActive() {
    return Math.max(0, Number(state.aggressiveReconcileUntil) || 0) > nowPerf();
  }

  function shouldUseAggressiveReconcile() {
    if (isGeneratingResponse()) return false;
    if (isAggressiveReconcileActive()) return true;
    const pendingQueue = Math.max(0, Number(state.pendingParkTurns?.size) || 0);
    const pendingFrames = Math.max(0, Number(state.pendingParkFrames?.size) || 0);
    return pendingQueue >= AGGRESSIVE_RECONCILE_PARK_THRESHOLD || pendingFrames >= Math.max(8, Math.floor(AGGRESSIVE_RECONCILE_PARK_THRESHOLD / 2));
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

  function setRootAttrValue(attrName, value) {
    const html = document.documentElement;
    if (!html) return;
    try {
      const next = typeof value === 'string' && value ? value : null;
      if (!next) {
        html.removeAttribute(attrName);
        return;
      }
      if (html.getAttribute(attrName) !== next) html.setAttribute(attrName, next);
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
    toggleRootAttr(ROOT_OVERLAY_ATTR, !!s.showOverlay, '1');
    setRootAttrValue(ROOT_OPTIONS_OPEN_ATTR, state.optionsOpenState || null);
    setRootAttrValue(ROOT_TURNS_SOURCE_ATTR, s.enabled && s.virtualizeOffscreen ? state.turnsWatchSource : null);
    setRootAttrValue(ROOT_ROUTE_SOURCE_ATTR, s.enabled && s.virtualizeOffscreen ? state.routeWatchSource : null);
    publishParkingTelemetry();
    publishPerfRuntimeState();
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
          ROOT_OVERLAY_ATTR,
          ROOT_OPTIONS_OPEN_ATTR,
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

  function finishInitialUiMount() {
    if (state.disposed || state.uiMountReady) return;
    state.uiMountReady = true;
    try {
      if (state.uiMountTimer) window.clearTimeout(state.uiMountTimer);
    } catch {}
    try {
      if (state.uiMountMaxTimer) window.clearTimeout(state.uiMountMaxTimer);
    } catch {}
    state.uiMountTimer = 0;
    state.uiMountMaxTimer = 0;
    state.uiMountRaf = 0;
    installUiSelfHeal();
    ensureUi();
    renderUi();
  }

  function armInitialUiMount() {
    if (state.disposed || state.uiMountReady) return;
    if (document.body && !state.uiMountRaf) {
      state.uiMountRaf = window.requestAnimationFrame(() => {
        state.uiMountRaf = 0;
        finishInitialUiMount();
      });
    }
    try {
      if (state.uiMountTimer) window.clearTimeout(state.uiMountTimer);
    } catch {}
    state.uiMountTimer = window.setTimeout(() => {
      state.uiMountTimer = 0;
      finishInitialUiMount();
    }, 1400);
    if (state.uiMountMaxTimer) return;
    state.uiMountMaxTimer = window.setTimeout(() => {
      state.uiMountMaxTimer = 0;
      finishInitialUiMount();
    }, 3200);
  }

  function scheduleUiHeal() {
    if (state.disposed) return;
    if (!state.uiMountReady) return;
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
        if (!state.uiMountReady) {
          armInitialUiMount();
          return;
        }
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
      ROOT_OVERLAY_ATTR,
      ROOT_OPTIONS_OPEN_ATTR,
    ]) {
      try {
        attrs[name] = html?.getAttribute?.(name) ?? null;
      } catch {
        attrs[name] = null;
      }
    }

    let turnCount = 0;
    let offscreenCount = 0;
    let parkedCount = 0;
    const parkingTelemetry = collectParkingTelemetry();
    try {
      turnCount = state.turnsCache.length || getTurnElements(document.querySelector('main')).length;
      offscreenCount = document.querySelectorAll(`.${TURN_CLASS}.${OFFSCREEN_CLASS}`).length;
      parkedCount = parkingTelemetry.parkedCount;
    } catch {
      turnCount = 0;
      offscreenCount = 0;
      parkedCount = 0;
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
      parkedCount,
      parkedPlaceholderCount: parkingTelemetry.placeholderCount,
      parkedSerializedBytes: parkingTelemetry.serializedBytes,
      parkedRawSerializedBytes: parkingTelemetry.rawSerializedBytes,
      parkedCompressedCount: parkingTelemetry.compressedCount,
      parkedSavedBytes: parkingTelemetry.savedBytes,
      parkedEstimatedDomNodes: parkingTelemetry.estimatedDomNodes,
      parkedLiveBodyRefs: parkingTelemetry.retainedLiveBodyRefs,
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

    restoreTurnBody(turnEl);

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
    cancelPendingPark(turnEl);
    const parked = getParkedTurnState(turnEl);
    if (parked && isWindowScrollShieldActive()) {
      turnEl.classList.remove(OFFSCREEN_CLASS);
      turnEl.style.removeProperty(INTRINSIC_VAR);
      clearVisibleTurnContainment(turnEl);
      if (shouldPreviewOnlyVisibleParkedTurn(turnEl)) {
        scheduleRestoreTurn(turnEl, measuredHeight);
        return;
      }
      restoreTurnImmediately(turnEl, measuredHeight, { allowDeferred: true });
      maybeSimplifyTurnMathBlocks(turnEl);
      return;
    }
    if (parked) {
      turnEl.classList.remove(OFFSCREEN_CLASS);
      turnEl.style.removeProperty(INTRINSIC_VAR);
      restoreTurnImmediately(turnEl, measuredHeight, { allowDeferred: true });
      maybeSimplifyTurnMathBlocks(turnEl);
      return;
    }
    restoreTurnImmediately(turnEl, measuredHeight, { allowDeferred: true });
    maybeSimplifyTurnMathBlocks(turnEl);
  }

  function setOffscreen(turnEl, measuredHeight) {
    if (!(turnEl instanceof HTMLElement)) return;
    cancelQueuedRestoreTurn(turnEl);
    clearVisibleTurnContainment(turnEl);
    if (state.coldDeferredTurns.has(turnEl) && !isTurnCloseToViewport(turnEl, Math.max(window.innerHeight * 0.5, 240))) return;
    const h = Math.round(typeof measuredHeight === 'number' ? measuredHeight : 0) || primeTurnHeight(turnEl);
    const trusted = state.trustedParkTurns.has(turnEl);
    let bodyHeightHint = Math.round(Number(state.lastBodyHeights.get(turnEl)) || 0);
    if (bodyHeightHint <= 0 || !trusted) bodyHeightHint = measureParkableBodyHeight(turnEl);
    // Low-memory mode needs the biggest historical turns parked, not left live forever.
    // If we already measured the assistant body itself, that body height is good enough
    // to park against even when the total turn height is very large.
    const suspiciousColdMeasurement =
      !trusted &&
      bodyHeightHint <= 0 &&
      Math.max(h, bodyHeightHint) > coldParkSuspicionThresholdPx();
    if (suspiciousColdMeasurement) {
      cancelPendingPark(turnEl);
      restoreTurnBody(turnEl);
      turnEl.classList.remove(OFFSCREEN_CLASS);
      turnEl.style.removeProperty(INTRINSIC_VAR);
      state.lastHeights.delete(turnEl);
      state.lastBodyHeights.delete(turnEl);
      state.coldDeferredTurns.add(turnEl);
      return;
    }
    state.coldDeferredTurns.delete(turnEl);
    const intrinsic = rememberTurnHeight(turnEl, h) || state.defaultIntrinsic;
    const keepWarm = shouldKeepOffscreenWarm(turnEl);
    const shouldPark = shouldParkOffscreenTurn(turnEl, h, bodyHeightHint);

    turnEl.style.setProperty(INTRINSIC_VAR, `1px ${intrinsic}px`);
    turnEl.classList.add(OFFSCREEN_CLASS);
    if (keepWarm) {
      // Keep near-viewport heavy code turns mounted so they can be simplified
      // before entering the visible range, instead of restoring rich DOM on entry.
      cancelPendingPark(turnEl);
      restoreTurnBody(turnEl);
      maybeSimplifyTurnCodeBlocks(turnEl, { allowOffscreen: true });
      maybeSimplifyTurnMathBlocks(turnEl, { allowOffscreen: true });
      return;
    }
    if (!shouldPark) {
      cancelPendingPark(turnEl);
      restoreTurnBody(turnEl);
      return;
    }
    if (!getParkedTurnState(turnEl)) {
      scheduleParkTurn(turnEl, {
        turnHeightHint: intrinsic,
        bodyHeightHint,
      });
    }
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
      primeTurnHeight(turn);
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
        clearParkedTurnState(turn);
        turn.classList.remove(TURN_CLASS);
        turn.removeAttribute(COPY_UNFREEZE_ATTR);
      } catch {
        // ignore
      }
      dropTurnMetrics(turn);
    }

    state.observedTurns = next;
  }

  function pruneDetachedRuntimeState(removedTurns = null) {
    pruneDetachedLiteCodeBlocks();
    pruneDetachedLiteMathBlocks();

    for (const turnEl of Array.from(state.pendingRestoreTurns.keys())) {
      if (turnEl instanceof HTMLElement && turnEl.isConnected) continue;
      state.pendingRestoreTurns.delete(turnEl);
    }
    for (const turnEl of Array.from(state.pendingParkTurns.keys())) {
      if (turnEl instanceof HTMLElement && turnEl.isConnected) continue;
      state.pendingParkTurns.delete(turnEl);
    }
    for (const turnEl of Array.from(state.pendingParkFrames.keys())) {
      if (turnEl instanceof HTMLElement && turnEl.isConnected) continue;
      state.pendingParkFrames.delete(turnEl);
    }

    const staleObserved = new Set();
    for (const turnEl of Array.from(state.observedTurns)) {
      if (turnEl instanceof HTMLElement && turnEl.isConnected) continue;
      staleObserved.add(turnEl);
    }
    if (staleObserved.size) {
      const nextObserved = new Set();
      for (const turnEl of Array.from(state.observedTurns)) {
        if (staleObserved.has(turnEl)) continue;
        nextObserved.add(turnEl);
      }
      state.observedTurns = nextObserved;
    }

    const removed = Array.isArray(removedTurns) ? removedTurns : [];
    for (const turnEl of removed) {
      if (!(turnEl instanceof HTMLElement)) continue;
      cancelPendingPark(turnEl);
      state.pendingRestoreTurns.delete(turnEl);
      discardLiteCodeBlocksWithin(turnEl);
      discardLiteMathBlocksWithin(turnEl);
      clearParkedTurnState(turnEl);
      dropTurnMetrics(turnEl);
    }
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
    if (hasStructuralDelta || state.pendingRestoreTurns.size || state.pendingParkTurns.size || state.pendingParkFrames.size) {
      pruneDetachedRuntimeState(snapshot.removedTurns);
    }
    syncTailTurnMetrics(snapshot.turns, { generating, force: !generating && hasStructuralDelta });
    scheduleApplyVirtualizationNow(reason || String(payload?.reason || 'core-turns'));
  }

  function ensureTurnsWatch(root = state.containerEl) {
    const core = getChatgptCoreApi();
    if (typeof core?.onTurnsChange === 'function') {
      const sourceChanged = state.turnsWatchSource !== 'core';
      state.turnsWatchSource = 'core';
      stopFallbackTurnsWatch();
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
      if (sourceChanged) applyRootAttrs();
      return;
    }
    const sourceChanged = state.turnsWatchSource !== 'fallback';
    state.turnsWatchSource = 'fallback';
    startFallbackTurnsWatch(root);
    if (sourceChanged) applyRootAttrs();
  }

  function stopTurnsWatch() {
    try {
      if (typeof state.coreTurnsUnsub === 'function') state.coreTurnsUnsub();
    } catch {
      // ignore
    }
    state.coreTurnsUnsub = null;
    stopFallbackTurnsWatch();
    if (state.turnsWatchSource !== 'idle') {
      state.turnsWatchSource = 'idle';
      applyRootAttrs();
    }
  }

  function pageCanStartVirtualization() {
    return document.visibilityState !== 'hidden';
  }

  function scheduleVisibleTabVirtualizationResume(reason = 'visible') {
    if (state.disposed) return;
    if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
    if (!pageCanStartVirtualization()) return;
    try {
      if (state.visibilityResumeTimer) window.clearTimeout(state.visibilityResumeTimer);
    } catch {
      // ignore
    }
    state.visibilityResumeTimer = window.setTimeout(() => {
      state.visibilityResumeTimer = 0;
      if (state.disposed || !pageCanStartVirtualization()) return;
      state.startupViewportLastReason = String(reason || 'visible');
      startVirtualization();
    }, 120);
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
    ensureTurnsWatch();

    const snapshot = getCoreTurnsSnapshot(false);
    const container = snapshot?.root instanceof HTMLElement ? snapshot.root : findTurnsContainer();
    if (container instanceof HTMLElement) {
      setContainerEl(container);
      const turns = snapshot?.turns?.length ? snapshot.turns : getTurnElements(container);
      setTurnsCache(turns, container, snapshot?.turnsVersion || 0);
      updateDefaultIntrinsic(container, turns);
      syncObservedTurns(turns);
      ensureTurnsWatch(container);
      state.aggressiveReconcileUntil = nowPerf() + STARTUP_AGGRESSIVE_RECONCILE_MS;
      scheduleApplyVirtualizationNow('start');
      scheduleVisibleHeavyBlockPass(420, null, null, null, {
        reason: 'startup-initial-420',
        retryOnMathMiss: true,
        remainingRetries: 2,
      });
      scheduleVisibleHeavyBlockPass(1400, null, null, null, {
        reason: 'startup-initial-1400',
        retryOnMathMiss: true,
        remainingRetries: 3,
      });
      startStartupViewportWatch();
      return;
    }

    if (hasCoreTurnsRuntime()) return;

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
        state.aggressiveReconcileUntil = nowPerf() + STARTUP_AGGRESSIVE_RECONCILE_MS;
        scheduleApplyVirtualizationNow('start-hydration');
        scheduleVisibleHeavyBlockPass(420, null, null, null, {
          reason: 'startup-hydration-420',
          retryOnMathMiss: true,
          remainingRetries: 2,
        });
        scheduleVisibleHeavyBlockPass(1400, null, null, null, {
          reason: 'startup-hydration-1400',
          retryOnMathMiss: true,
          remainingRetries: 3,
        });
        startStartupViewportWatch();
        return;
      }
      tries += 1;
      if (tries < 40) setTimeout(tryFind, 250);
    };
    setTimeout(tryFind, 250);
  }

  function stopVirtualization(options = null) {
    const restoreDom = options?.restoreDom !== false;
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
    state.coreTurnRecordsVersion = 0;
    state.coreTurnRecordMap = null;
    clearLiteCodeSweep();
    clearVisibleHeavyPassTimers();
    clearStartupViewportWatch();
    cancelAllPendingParks();
    cancelAllQueuedParks();
    cancelAllQueuedRestores();
    clearWindowScrollShieldTimer();
    state.windowScrollShieldUntil = 0;
    if (restoreDom) {
      restoreAllLiteMathBlocks();
      restoreAllLiteCodeBlocks();
      restoreAllParkedTurns();
    }
    state.lastVisibleFirst = -1;
    state.lastVisibleLast = -1;
    state.lastVisibleTotal = 0;
    state.structureDirty = true;
    state.budgetSnapshot = null;
    state.budgetSnapshotAt = 0;
    state.budgetLevel = 0;
    setHotPathActive(false);
    state.lastTailEstimateAt = 0;
    state.turnMetrics = new WeakMap();
    state.liteMathBlocks = new WeakMap();
    state.liteMathBlockSet = new Set();
    state.liteCodeBlocks = new WeakMap();
    state.liteCodeBlockSet = new Set();
    state.totalTurnDomNodes = 0;
    state.totalTurnKatexNodes = 0;
    state.totalTurnHeavyBlocks = 0;
    if (restoreDom) {
      document.querySelectorAll(`.${TURN_CLASS}.${OFFSCREEN_CLASS}`).forEach((turn) => clearOffscreen(turn));
    }
    publishPerfRuntimeState();
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
    if (typeof core?.onRouteChange === 'function') {
      const sourceChanged = state.routeWatchSource !== 'core';
      state.routeWatchSource = 'core';
      if (!state.coreRouteUnsub) {
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
      if (sourceChanged) applyRootAttrs();
      return;
    }
    const sourceChanged = state.routeWatchSource !== 'fallback';
    state.routeWatchSource = 'fallback';
    if (state.routePollTimer || state.onPopState || state.onHashChange) return;
    state.onPopState = () => restartForRoute();
    state.onHashChange = () => restartForRoute();
    window.addEventListener('popstate', state.onPopState, true);
    window.addEventListener('hashchange', state.onHashChange, true);
    state.routePollTimer = window.setInterval(restartForRoute, 400);
    if (sourceChanged) applyRootAttrs();
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
    if (state.routeWatchSource !== 'idle') {
      state.routeWatchSource = 'idle';
      applyRootAttrs();
    }
  }

  function ensureVisibilityWatch() {
    if (state.onVisibilityChange) return;
    state.onVisibilityChange = () => {
      if (state.disposed) return;
      if (document.visibilityState === 'hidden') {
        clearVisibleHeavyPassTimers();
        clearStartupViewportWatch();
        cancelAllPendingParks();
        cancelAllQueuedParks();
        cancelAllQueuedRestores();
        clearWindowScrollShieldTimer();
        state.windowScrollShieldUntil = 0;
        detachIo();
        stopTurnsWatch();
        return;
      }
      scheduleVisibleTabVirtualizationResume('visibility-resume');
    };
    document.addEventListener('visibilitychange', state.onVisibilityChange, true);
  }

  function ensureUi() {
    if (!state.uiMountReady) return document.getElementById(UI_ID);

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
        void requestOpenOptionsPage().then((opened) => {
          if (opened) return;
          toast(
            uiText(
              '打开扩展选项页失败，请从扩展图标进入“扩展程序选项”。',
              'Failed to open the extension options page. Please open Extension Options from the extension icon.'
            ),
            2800
          );
        });
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

  function requestOpenOptionsPage() {
    const setOptionsOpenState = (value, clearDelayMs = 0) => {
      state.optionsOpenState = String(value || '');
      applyRootAttrs();
      try {
        if (state.optionsOpenTimer) window.clearTimeout(state.optionsOpenTimer);
      } catch {}
      state.optionsOpenTimer = 0;
      if (clearDelayMs > 0) {
        state.optionsOpenTimer = window.setTimeout(() => {
          state.optionsOpenTimer = 0;
          state.optionsOpenState = '';
          applyRootAttrs();
        }, clearDelayMs);
      }
    };
    setOptionsOpenState('pending');
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'AISHORTCUTS_OPEN_OPTIONS_PAGE' }, (resp) => {
          void chrome.runtime?.lastError;
          if (resp && resp.ok) {
            setOptionsOpenState('ok', 4000);
            resolve(true);
            return;
          }
          try {
            if (typeof chrome?.runtime?.openOptionsPage === 'function') {
              chrome.runtime.openOptionsPage(() => {
                void chrome.runtime?.lastError;
                setOptionsOpenState('ok', 4000);
                resolve(true);
              });
              return;
            }
          } catch {}
          setOptionsOpenState('failed', 6000);
          resolve(false);
        });
      } catch {
        try {
          if (typeof chrome?.runtime?.openOptionsPage === 'function') {
            chrome.runtime.openOptionsPage(() => {
              void chrome.runtime?.lastError;
              setOptionsOpenState('ok', 4000);
              resolve(true);
            });
            return;
          }
        } catch {}
        setOptionsOpenState('failed', 6000);
        resolve(false);
      }
    });
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
    const heavyChanged = prev.optimizeHeavyBlocks !== nextSettings.optimizeHeavyBlocks;

    if (!shouldVirtualize) {
      stopVirtualization();
      stopRouteWatch();
    } else {
      if (!prevShouldVirtualize || marginChanged || boostChanged || !state.io) {
        if (pageCanStartVirtualization()) startVirtualization();
        else {
          detachIo();
          stopTurnsWatch();
        }
      }
      ensureRouteWatch();
    }

    if (!(nextSettings.enabled && nextSettings.optimizeHeavyBlocks)) {
      clearLiteCodeSweep();
      restoreAllLiteMathBlocks();
      restoreAllLiteCodeBlocks();
    } else if (heavyChanged && state.turnsCache.length) {
      scheduleLiteCodeSweep(
        state.turnsCache,
        Math.max(0, state.lastVisibleFirst),
        state.lastVisibleLast >= 0 ? state.lastVisibleLast : state.turnsCache.length - 1,
      );
    }

    if (state.io && state.ioMarginPx !== effectiveRootMarginPx()) scheduleRestartIo();
  }

  function activateFindUnfreeze(durationMs = 25000) {
    if (state.disposed) return;
    if (!(state.settings.enabled && state.settings.unfreezeOnFind)) return;
    restoreAllLiteMathBlocks();
    restoreAllLiteCodeBlocks();
    restoreAllParkedTurns();
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
    scheduleApplyVirtualizationNow('find-reset');
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

    const active = state.reconcileTurns;
    if (
      Array.isArray(active) &&
      state.reconcileIdx < active.length &&
      active.length === total &&
      active[0] === turns[0] &&
      active[active.length - 1] === turns[turns.length - 1]
    ) {
      state.reconcileTurns = turns;
      state.reconcileFirst = first;
      state.reconcileLast = last;
      return;
    }

    state.reconcileToken += 1;
    const token = state.reconcileToken;
    state.reconcileTurns = turns;
    state.reconcileIdx = 0;
    state.reconcileFirst = first;
    state.reconcileLast = last;
    const aggressive = shouldUseAggressiveReconcile();

    const run = (deadline) => {
      if (token !== state.reconcileToken) return;
      const list = state.reconcileTurns;
      if (!list) return;
      const max = list.length;
      const boundFirst = state.reconcileFirst;
      const boundLast = state.reconcileLast;

      let processed = 0;
      let warmedDeferred = 0;
      const sliceStart = nowPerf();
      while (state.reconcileIdx < max) {
        const i = state.reconcileIdx;
        const el = list[i];
        if (i < boundFirst || i > boundLast) {
          if (warmedDeferred < 1 && maybeWarmDeferredTurn(el)) {
            warmedDeferred += 1;
            setOffscreen(el, Math.round(Number(state.lastHeights.get(el)) || 0));
          }
          else setOffscreen(el);
        }
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
        if (!aggressive && deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 4) break;
        if (aggressive) {
          if (processed >= 520) break;
          if (nowPerf() - sliceStart >= 12) break;
        } else if (!deadline && processed >= 220) {
          break;
        }
      }

      if (token !== state.reconcileToken) return;
      if (state.reconcileIdx >= max) {
        state.reconcileTurns = null;
        return;
      }

      if (aggressive) {
        window.requestAnimationFrame(() => run(null));
        return;
      }
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1200 });
      else setTimeout(run, 80);
    };

    if (aggressive) {
      window.requestAnimationFrame(() => run(null));
      return;
    }
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 0);
  }

  function clearLiteCodeSweep() {
    state.liteCodeSweepToken += 1;
    state.liteCodeSweepTurns = null;
    state.liteCodeSweepIdx = 0;
    state.liteCodeSweepStart = 0;
    state.liteCodeSweepEnd = -1;
  }

  function scheduleLiteCodeSweep(turns, first = 0, last = Array.isArray(turns) ? turns.length - 1 : -1) {
    if (!(state.settings.enabled && state.settings.optimizeHeavyBlocks)) return;
    if (!(turns && typeof turns.length === 'number' && turns.length)) return;

    const start = Math.max(0, Number(first) || 0);
    const end = Math.min(turns.length - 1, Number(last) || 0);
    if (end < start) return;

    state.liteCodeSweepToken += 1;
    const token = state.liteCodeSweepToken;
    state.liteCodeSweepTurns = turns;
    state.liteCodeSweepStart = start;
    state.liteCodeSweepEnd = end;
    state.liteCodeSweepIdx = start;

    const run = (deadline) => {
      if (token !== state.liteCodeSweepToken) return;
      const list = state.liteCodeSweepTurns;
      if (!list) return;

      let processed = 0;
      while (state.liteCodeSweepIdx <= state.liteCodeSweepEnd) {
        const turnEl = list[state.liteCodeSweepIdx];
        maybeSimplifyTurnCodeBlocks(turnEl);
        maybeSimplifyTurnMathBlocks(turnEl);
        state.liteCodeSweepIdx += 1;
        processed += 1;
        if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 4) break;
        if (!deadline && processed >= 4) break;
      }

      if (token !== state.liteCodeSweepToken) return;
      if (state.liteCodeSweepIdx > state.liteCodeSweepEnd) {
        state.liteCodeSweepTurns = null;
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
    if (unchangedWindow && !state.structureDirty) {
      if (!hiddenCount) return;
      if (isGeneratingResponse()) return;
      if (state.reconcileTurns) return;
      const perfNow = nowPerf();
      const budget = collectBudgetSnapshot(total);
      computeAdaptivePadItems({ generating: false, boostActive: state.boostActive, snapshot: budget });
      if (perfNow - state.lastReconcileAt < reconcileIntervalMs()) return;
      state.lastReconcileAt = perfNow;
      scheduleReconcile(turns, first, last);
      return;
    }
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
      applyVisibleHeavyBlockPass(turns, first, last);
      scheduleLiteCodeSweep(turns, 0, total - 1);
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
    applyVisibleHeavyBlockPass(turns, first, last);
    scheduleLiteCodeSweep(turns, start, end);

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
    if (isCodeScrollShieldActive()) {
      armCodeScrollShield(Math.ceil((Number(state.codeScrollShieldUntil) || 0) - performance.now()));
      return;
    }
    if (isWindowScrollShieldActive()) {
      scheduleVisibleRestorePulse(reason);
      armWindowScrollShield(Math.ceil((Number(state.windowScrollShieldUntil) || 0) - performance.now()));
      return;
    }
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

  function isCodeScrollShieldActive() {
    return performance.now() < (Number(state.codeScrollShieldUntil) || 0);
  }

  function armCodeScrollShield(durationMs = 900) {
    const now = performance.now();
    const extraMs = Math.max(180, Number(durationMs) || 0);
    const nextUntil = now + extraMs;
    if (nextUntil > (Number(state.codeScrollShieldUntil) || 0)) state.codeScrollShieldUntil = nextUntil;
    if (state.codeScrollResumeTimer) window.clearTimeout(state.codeScrollResumeTimer);
    state.codeScrollResumeTimer = window.setTimeout(() => {
      state.codeScrollResumeTimer = 0;
      if (state.disposed) return;
      if (isCodeScrollShieldActive()) return;
      if (!(state.settings.enabled && state.settings.virtualizeOffscreen)) return;
      scheduleApplyVirtualizationNow('code-scroll-resume');
    }, extraMs + 24);
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
      if (isCodeScrollInteractionTarget(target)) return true;

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
      if (maybeRestoreLiteMathFromTarget(e.target)) return;
      if (maybeRestoreLiteCodeFromTarget(e.target)) return;
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
      if (maybeRestoreLiteMathFromTarget(e.target)) return;
      if (maybeRestoreLiteCodeFromTarget(e.target)) return;
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
      state.lastWindowScrollAt = nowPerf();
      armWindowScrollShield(WINDOW_SCROLL_SHIELD_MS);
      scheduleVisibleRestorePulse('window-scroll');
      if (!state.reconcileTurns) return;
      state.reconcileToken += 1;
      state.reconcileTurns = null;
    };
    window.addEventListener('scroll', state.onScroll, { passive: true });

    state.onElementScroll = (e) => {
      if (state.disposed) return;
      if (isCodeScrollInteractionTarget(e?.target)) {
        armCodeScrollShield(900);
      } else if (isWindowScrollInteractionTarget(e?.target)) {
        state.lastWindowScrollAt = nowPerf();
        armWindowScrollShield(WINDOW_SCROLL_SHIELD_MS);
        scheduleVisibleRestorePulse('element-scroll');
      } else {
        return;
      }
      if (state.reconcileTurns) {
        state.reconcileToken += 1;
        state.reconcileTurns = null;
      }
    };
    document.addEventListener('scroll', state.onElementScroll, { passive: true, capture: true });

    state.onResize = () => {
      if (state.disposed) return;
      state.structureDirty = true;
      scheduleApplyVirtualizationNow('resize');
    };
    window.addEventListener('resize', state.onResize, { passive: true });
  }

  function cleanup(options = null) {
    const handoff = !!options?.handoff;
    if (state.disposed) return;
    state.disposed = true;

    try { closeMenu(); } catch {}
    try { stopRouteWatch(); } catch {}
    try { stopVirtualization({ restoreDom: !handoff }); } catch {}
    try {
      if (state.virtualizeNowRaf) window.cancelAnimationFrame(state.virtualizeNowRaf);
    } catch {}
    state.virtualizeNowRaf = 0;
    try {
      if (state.pendingRestoreRaf) window.cancelAnimationFrame(state.pendingRestoreRaf);
    } catch {}
    state.pendingRestoreRaf = 0;
    try {
      if (state.restorePulseRaf) window.cancelAnimationFrame(state.restorePulseRaf);
    } catch {}
    state.restorePulseRaf = 0;
    state.pendingRestoreTurns.clear();
    clearWindowScrollShieldTimer();
    state.windowScrollShieldUntil = 0;

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
    try {
      if (state.optionsOpenTimer) window.clearTimeout(state.optionsOpenTimer);
    } catch {}
    state.optionsOpenTimer = 0;
    state.optionsOpenState = '';
    state.codeScrollShieldUntil = 0;

    try {
      if (state.codeScrollResumeTimer) window.clearTimeout(state.codeScrollResumeTimer);
    } catch {}
    state.codeScrollResumeTimer = 0;

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

    try {
      if (state.uiMountTimer) window.clearTimeout(state.uiMountTimer);
    } catch {}
    try {
      if (state.uiMountMaxTimer) window.clearTimeout(state.uiMountMaxTimer);
    } catch {}
    try {
      if (state.uiMountRaf) window.cancelAnimationFrame(state.uiMountRaf);
    } catch {}
    state.uiMountTimer = 0;
    state.uiMountMaxTimer = 0;
    state.uiMountRaf = 0;

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
      if (state.onElementScroll) document.removeEventListener('scroll', state.onElementScroll, true);
    } catch {}
    state.onElementScroll = null;

    try {
      if (state.onResize) window.removeEventListener('resize', state.onResize, false);
    } catch {}
    state.onResize = null;

    try {
      if (state.onVisibilityChange) document.removeEventListener('visibilitychange', state.onVisibilityChange, true);
    } catch {}
    state.onVisibilityChange = null;

    try {
      if (state.visibilityResumeTimer) window.clearTimeout(state.visibilityResumeTimer);
    } catch {}
    state.visibilityResumeTimer = 0;

    try {
      if (state.onStorageChanged) chrome?.storage?.onChanged?.removeListener?.(state.onStorageChanged);
    } catch {}
    state.onStorageChanged = null;

    try {
      if (state.onMessage) chrome?.runtime?.onMessage?.removeListener?.(state.onMessage);
    } catch {}
    state.onMessage = null;

    if (!handoff) {
      try {
        document.querySelectorAll(`.${TURN_CLASS}`).forEach((turnEl) => {
          try {
            restoreTurnBody(turnEl);
            turnEl.classList.remove(TURN_CLASS);
            turnEl.classList.remove(OFFSCREEN_CLASS);
            turnEl.style.removeProperty(INTRINSIC_VAR);
            turnEl.removeAttribute(PARKED_ATTR);
            if (turnEl.getAttribute(COPY_UNFREEZE_ATTR) === '1') turnEl.removeAttribute(COPY_UNFREEZE_ATTR);
          } catch {
            // ignore
          }
        });
      } catch {}
    }
    setContainerEl(null);

    try { document.getElementById(UI_ID)?.remove?.(); } catch {}
    try { document.getElementById(TOAST_ID)?.remove?.(); } catch {}
    clearPerfRuntimeState();

    try { delete globalThis[GLOBAL_STATE_KEY]; } catch {}
  }

  function prepareForReload(handoffKey = GLOBAL_HANDOFF_KEY) {
    if (state.disposed) return;
    for (const turnEl of Array.from(state.parkedTurnSet)) {
      if (!(turnEl instanceof HTMLElement) || !turnEl.isConnected) continue;
      const parked = state.parkedTurns.get(turnEl);
      const placeholder = parked?.placeholder instanceof HTMLElement ? parked.placeholder : null;
      if (!(placeholder instanceof HTMLElement) || !placeholder.isConnected) continue;
      writeParkedHandoffAttrs(placeholder, parked);
    }
    publishReloadHandoff(captureReloadHandoff(), handoffKey);
    cleanup({ handoff: true });
  }

  function init() {
    state.cleanup = cleanup;
    state.prepareForReload = prepareForReload;
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

    adoptReloadHandoffFromDom();

    if (initialHandoff) {
      try {
        adoptReloadHandoff(initialHandoff);
      } catch {
        // ignore
      }
      initialHandoff = null;
    }

    ensureBoostListeners();
    ensureVisibilityWatch();
    ensureRootAttrGuard();
    ensureMessageListener();
    installUiSelfHeal();
    armInitialUiMount();

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
