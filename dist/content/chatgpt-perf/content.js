(() => {
  'use strict';

  const GLOBAL_STATE_KEY = '__cgpt_perf_mv3_state_v1__';
  const STORAGE_KEY = 'cgpt_perf_mv3_settings_v1';
  const BENCH_KEY = 'cgpt_perf_mv3_bench_arm_v1';
  const CHATGPT_CORE_API_KEY = '__aichat_chatgpt_core_v1__';
  const MSG_GET_STATE = 'CGPT_PERF_GET_STATE';
  const EXT_VERSION = '0.2.0-coordinator';

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    extremeMode: true,
    virtualizeOffscreen: true,
    optimizeHeavyBlocks: true,
    disableAnimations: true,
    boostDuringInput: true,
    unfreezeOnFind: true,
    showOverlay: false,
    rootMarginPx: 1000
  });

  // Destructive DOM rewrites are intentionally not part of the new default path.
  const EXPERIMENTAL_DOM_REWRITES_ENABLED = false;

  const ROOT_ATTR = 'data-cgptperf';
  const ROOT_VER_ATTR = 'data-cgptperf-ver';
  const ROOT_ENABLED_ATTR = 'data-cgptperf-enabled';
  const ROOT_HOT_ATTR = 'data-cgptperf-hot';
  const ROOT_HEAVY_ATTR = 'data-cgptperf-heavy';
  const ROOT_NOANIM_ATTR = 'data-cgptperf-noanim';
  const ROOT_OVERLAY_ATTR = 'data-cgptperf-overlay';
  const ROOT_BUDGET_ATTR = 'data-cgptperf-budget';
  const ROOT_MODE_ATTR = 'data-cgptperf-mode';
  const ROOT_EXTREME_ATTR = 'data-cgptperf-extreme';
  const ROOT_TURN_COUNT_ATTR = 'data-cgptperf-turn-count';
  const ROOT_NODE_COUNT_ATTR = 'data-cgptperf-node-count';
  const ROOT_NODE_CAPPED_ATTR = 'data-cgptperf-node-count-capped';
  const ROOT_MATH_COUNT_ATTR = 'data-cgptperf-math-count';
  const ROOT_DISPLAY_MATH_COUNT_ATTR = 'data-cgptperf-display-math-count';
  const ROOT_CODE_BLOCK_COUNT_ATTR = 'data-cgptperf-code-block-count';
  const ROOT_LONG_CODE_COUNT_ATTR = 'data-cgptperf-long-code-count';
  const ROOT_LONG_TASK_COUNT_ATTR = 'data-cgptperf-long-task-count';
  const ROOT_LONG_TASK_MAX_ATTR = 'data-cgptperf-long-task-max';
  const ROOT_GENERATING_ATTR = 'data-cgptperf-generating';
  const ROOT_WINDOWING_ATTR = 'data-cgptperf-windowing';
  const ROOT_VIRTUALIZATION_ATTR = 'data-cgptperf-virtualization-active';
  const ROOT_TURNS_SOURCE_ATTR = 'data-cgptperf-turns-source';
  const ROOT_PARKED_COUNT_ATTR = 'data-cgptperf-parked-count';
  const ROOT_LITE_CODE_COUNT_ATTR = 'data-cgptperf-lite-code-count';

  const TURN_HOST_SELECTOR = 'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]';
  const TURN_SELECTOR = `${TURN_HOST_SELECTOR}, [data-testid^="conversation-turn-"]`;
  const MATH_SELECTOR = '.katex, .katex-display, mjx-container, math';
  const DISPLAY_MATH_SELECTOR = '.katex-display, mjx-container[display="true"], mjx-container[jax][display="true"]';
  const CODE_BLOCK_SELECTOR = 'pre, .cm-editor, [data-testid*="code" i]';
  const LONG_CODE_CANDIDATE_SELECTOR = 'pre, .cm-editor';
  const OVERLAY_ID = '__cgpt_perf_mv3_overlay__';

  const SCAN_NORMAL_MS = 2400;
  const SCAN_HOT_MS = 900;
  const SCAN_COMPOSER_INPUT_MS = 900;
  const SCAN_EXTREME_NORMAL_MS = 8000;
  const SCAN_EXTREME_MUTATION_IDLE_MS = 1800;
  const SCAN_EXTREME_MUTATION_BUSY_MS = 3200;
  const SCAN_EXTREME_COMPOSER_IDLE_MS = 2600;
  const SCAN_MUTATION_DEBOUNCE_MS = 650;
  const LONG_TASK_WINDOW_MS = 15000;
  const INTERACTION_HOT_MS = 1600;
  const NODE_COUNT_CAP = 30000;
  const MAX_LONG_CODE_CANDIDATES = 10;
  const LONG_CODE_CHAR_THRESHOLD = 9000;
  const LONG_CODE_LINE_THRESHOLD = 140;

  const isAllowedFrame = (() => {
    try {
      return window.self === window.top;
    } catch {
      return false;
    }
  })();
  if (!isAllowedFrame) return;

  try {
    const prev = globalThis[GLOBAL_STATE_KEY];
    if (prev && typeof prev.cleanup === 'function') prev.cleanup('reinject');
  } catch {}

  const state = {
    running: false,
    settings: { ...DEFAULT_SETTINGS },
    metrics: null,
    budgetLevel: 0,
    hotPathActive: false,
    heavyEnabled: false,
    windowingEnabled: false,
    virtualizationActive: false,
    turnsSource: 'none',
    scanTimer: 0,
    intervalTimer: 0,
    mutationObserver: null,
    performanceObserver: null,
    storageListener: null,
    messageListener: null,
    eventCleanups: [],
    markedLongCodeBlocks: new Set(),
    longTasks: [],
    mutationScore: 0,
    lastScanAt: 0,
    lastReason: '',
    interactionHotUntil: 0,
    legacyTurnMarkCleanupDone: false,
    overlayEl: null
  };

  function now() {
    return Date.now();
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function sanitizeSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    return {
      enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_SETTINGS.enabled,
      extremeMode: typeof src.extremeMode === 'boolean' ? src.extremeMode : DEFAULT_SETTINGS.extremeMode,
      virtualizeOffscreen:
        typeof src.virtualizeOffscreen === 'boolean' ? src.virtualizeOffscreen : DEFAULT_SETTINGS.virtualizeOffscreen,
      optimizeHeavyBlocks:
        typeof src.optimizeHeavyBlocks === 'boolean' ? src.optimizeHeavyBlocks : DEFAULT_SETTINGS.optimizeHeavyBlocks,
      disableAnimations:
        typeof src.disableAnimations === 'boolean' ? src.disableAnimations : DEFAULT_SETTINGS.disableAnimations,
      boostDuringInput: typeof src.boostDuringInput === 'boolean' ? src.boostDuringInput : DEFAULT_SETTINGS.boostDuringInput,
      unfreezeOnFind: typeof src.unfreezeOnFind === 'boolean' ? src.unfreezeOnFind : DEFAULT_SETTINGS.unfreezeOnFind,
      showOverlay: typeof src.showOverlay === 'boolean' ? src.showOverlay : DEFAULT_SETTINGS.showOverlay,
      rootMarginPx: clampNumber(src.rootMarginPx, 0, 8000, DEFAULT_SETTINGS.rootMarginPx)
    };
  }

  function getChromeStorageArea() {
    try {
      return chrome?.storage?.sync || null;
    } catch {
      return null;
    }
  }

  function loadSettings() {
    return new Promise((resolve) => {
      const storage = getChromeStorageArea();
      if (!storage || typeof storage.get !== 'function') {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }
      try {
        storage.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) => {
          resolve(sanitizeSettings(result?.[STORAGE_KEY]));
        });
      } catch {
        resolve({ ...DEFAULT_SETTINGS });
      }
    });
  }

  function getCore() {
    try {
      const core = globalThis[CHATGPT_CORE_API_KEY] || null;
      return core && typeof core === 'object' ? core : null;
    } catch {
      return null;
    }
  }

  function isGenerating() {
    try {
      const core = getCore();
      if (core && typeof core.isGenerating === 'function' && core.isGenerating()) return true;
    } catch {}
    try {
      return !!document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop" i], button[aria-label*="停止"]');
    } catch {
      return false;
    }
  }

  function getFallbackTurnsSnapshot() {
    let turns = [];
    try {
      turns = Array.from(document.querySelectorAll(TURN_SELECTOR)).filter((el) => el instanceof HTMLElement);
    } catch {
      turns = [];
    }
    const root = turns[0]?.parentElement || document.querySelector('main') || document.body || null;
    return { root, turns, records: [], turnsVersion: 0, source: 'fallback' };
  }

  function getTurnsSnapshot(force = false) {
    const core = getCore();
    let best = null;
    try {
      if (core && typeof core.getTurnRecordsSnapshot === 'function') {
        const snapshot = core.getTurnRecordsSnapshot(force);
        const turns = Array.isArray(snapshot?.turns) ? snapshot.turns.filter((el) => el instanceof HTMLElement) : [];
        if (turns.length) {
          best = {
            root: snapshot?.root || turns[0]?.parentElement || document.body || null,
            turns,
            records: Array.isArray(snapshot?.records) ? snapshot.records : [],
            turnsVersion: Number(snapshot?.turnsVersion || 0),
            source: 'core-records'
          };
        }
      }
    } catch {}
    try {
      if (core && typeof core.getTurnsSnapshot === 'function') {
        const snapshot = core.getTurnsSnapshot(force);
        const turns = Array.isArray(snapshot?.turns) ? snapshot.turns.filter((el) => el instanceof HTMLElement) : [];
        if (turns.length && (!best || turns.length > best.turns.length)) {
          best = {
            root: snapshot?.root || turns[0]?.parentElement || document.body || null,
            turns,
            records: [],
            turnsVersion: Number(snapshot?.turnsVersion || 0),
            source: 'core-turns'
          };
        }
      }
    } catch {}
    const fallback = getFallbackTurnsSnapshot();
    if (fallback.turns.length && (!best || fallback.turns.length > best.turns.length)) {
      return {
        ...fallback,
        source: best ? `${best.source}+fallback-newer` : 'fallback'
      };
    }
    return best || fallback;
  }

  function setRootAttr(name, value) {
    try {
      const root = document.documentElement;
      if (!root) return;
      if (value === null || value === undefined || value === false) {
        if (root.hasAttribute(name)) root.removeAttribute(name);
        return;
      }
      const next = String(value);
      if (root.getAttribute(name) !== next) root.setAttribute(name, next);
    } catch {}
  }

  function countBySelector(root, selector) {
    if (!root || !selector) return 0;
    try {
      return root.querySelectorAll(selector).length;
    } catch {
      return 0;
    }
  }

  function countElementNodesCapped(root, cap = NODE_COUNT_CAP) {
    if (!root) return { count: 0, capped: false };
    let count = 0;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        count += 1;
        if (count >= cap) return { count, capped: true };
      }
    } catch {
      try {
        return { count: root.children ? root.children.length : 0, capped: false };
      } catch {}
    }
    return { count, capped: false };
  }

  function clearLongCodeMark(el) {
    try {
      el?.classList?.remove?.('cgptperf-long-code');
      el?.removeAttribute?.('data-cgptperf-code-chars');
      el?.removeAttribute?.('data-cgptperf-code-lines');
    } catch {}
  }

  function estimateCodeLines(host, rawText) {
    if (!host) return 0;
    try {
      const structuralLines = Math.max(
        host.querySelectorAll('br').length + 1,
        host.querySelectorAll('.cm-line, .view-line, .hljs-ln-line, [data-line-number]').length
      );
      if (structuralLines > 1) return structuralLines;
    } catch {}
    try {
      const text = String(rawText || '');
      if (text) return text.split('\n').length;
    } catch {}
    return 0;
  }

  function normalizeCodeCandidates(candidates = []) {
    const out = [];
    const seen = new Set();
    for (const el of candidates) {
      try {
        if (!(el instanceof HTMLElement)) continue;
        const host = el.closest?.('pre') || el;
        if (!host || seen.has(host)) continue;
        seen.add(host);
        out.push(host);
      } catch {}
    }
    if (out.length <= MAX_LONG_CODE_CANDIDATES) return out;
    const headCount = Math.max(2, Math.floor(MAX_LONG_CODE_CANDIDATES / 3));
    const tailCount = Math.max(2, MAX_LONG_CODE_CANDIDATES - headCount);
    return [
      ...out.slice(0, headCount),
      ...out.slice(Math.max(headCount, out.length - tailCount))
    ];
  }

  function measureLongCodeCandidates(candidates, thresholdChars, thresholdLines) {
    const result = { longCodeBlocks: 0, sampledCodeBlocks: 0, maxCodeChars: 0, maxCodeLines: 0 };
    const normalized = normalizeCodeCandidates(candidates);
    if (!normalized.length) {
      for (const el of Array.from(state.markedLongCodeBlocks)) clearLongCodeMark(el);
      state.markedLongCodeBlocks.clear();
      return result;
    }
    const longHosts = new Set();
    for (const host of normalized) {
      if (result.sampledCodeBlocks >= MAX_LONG_CODE_CANDIDATES) break;
      result.sampledCodeBlocks += 1;
      let text = '';
      try {
        text = String(host.textContent || '');
      } catch {
        text = '';
      }
      const chars = text.length;
      if (chars > result.maxCodeChars) result.maxCodeChars = chars;
      const lines = estimateCodeLines(host, text);
      if (lines > result.maxCodeLines) result.maxCodeLines = lines;
      if (chars >= thresholdChars || lines >= thresholdLines) {
        result.longCodeBlocks += 1;
        longHosts.add(host);
        try {
          host.classList.add('cgptperf-long-code');
          host.setAttribute('data-cgptperf-code-chars', String(chars));
          host.setAttribute('data-cgptperf-code-lines', String(lines));
        } catch {}
      }
    }
    for (const el of Array.from(state.markedLongCodeBlocks)) {
      if (!longHosts.has(el) || el.isConnected === false) {
        clearLongCodeMark(el);
        state.markedLongCodeBlocks.delete(el);
      }
    }
    for (const el of longHosts) state.markedLongCodeBlocks.add(el);
    return result;
  }

  function measureLongCode(root, thresholdChars, thresholdLines) {
    if (!root) return measureLongCodeCandidates([], thresholdChars, thresholdLines);
    let candidates = [];
    try {
      candidates = Array.from(root.querySelectorAll(LONG_CODE_CANDIDATE_SELECTOR)).filter((el) => el instanceof HTMLElement);
      if (root instanceof HTMLElement && root.matches?.(LONG_CODE_CANDIDATE_SELECTOR)) candidates.unshift(root);
    } catch {
      candidates = [];
    }
    return measureLongCodeCandidates(candidates, thresholdChars, thresholdLines);
  }

  function dedupeElements(items = []) {
    const out = [];
    const seen = new Set();
    for (const item of items) {
      try {
        if (!(item instanceof HTMLElement) || seen.has(item)) continue;
        seen.add(item);
        out.push(item);
      } catch {}
    }
    return out;
  }

  function getVisibleMetricTurns(turns = []) {
    try {
      const core = getCore();
      if (!core || typeof core.getVisibleTurnWindow !== 'function') return [];
      const visible = core.getVisibleTurnWindow(false, 1400);
      const visibleTurns = Array.isArray(visible?.turns) ? visible.turns : [];
      return visibleTurns.filter((el) => el instanceof HTMLElement);
    } catch {
      return [];
    }
  }

  function buildExtremeMetricScope(snapshot) {
    const turns = Array.isArray(snapshot?.turns) ? snapshot.turns.filter((el) => el instanceof HTMLElement) : [];
    if (!turns.length) {
      const root = snapshot?.root || document.body || document.documentElement;
      return { root, turns, elements: root instanceof HTMLElement ? [root] : [], sampledTurnCount: 0, estimated: false };
    }

    const visible = getVisibleMetricTurns(turns);
    const head = turns.slice(0, 2);
    const tail = turns.slice(Math.max(0, turns.length - 8));
    const aroundVisible = visible.length ? visible : [];
    const elements = dedupeElements([...head, ...aroundVisible, ...tail]);
    return {
      root: snapshot?.root || turns[0]?.parentElement || document.body || document.documentElement,
      turns,
      elements,
      sampledTurnCount: elements.length,
      estimated: elements.length > 0 && elements.length < turns.length
    };
  }

  function countElementNodesCappedInElements(elements = [], cap = NODE_COUNT_CAP) {
    let count = 0;
    try {
      for (const root of elements) {
        if (!(root instanceof HTMLElement)) continue;
        count += 1;
        if (count >= cap) return { count, capped: true };
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
          count += 1;
          if (count >= cap) return { count, capped: true };
        }
      }
    } catch {}
    return { count, capped: false };
  }

  function countBySelectorInElements(elements = [], selector, cap = 10000) {
    if (!selector) return 0;
    let count = 0;
    const seen = new Set();
    const add = (el) => {
      if (!(el instanceof HTMLElement) || seen.has(el)) return;
      seen.add(el);
      count += 1;
    };
    try {
      for (const root of elements) {
        if (!(root instanceof HTMLElement)) continue;
        try {
          if (root.matches?.(selector)) add(root);
        } catch {}
        const nodes = root.querySelectorAll(selector);
        for (const el of nodes) {
          add(el);
          if (count >= cap) return count;
        }
      }
    } catch {}
    return count;
  }

  function collectCodeCandidatesInElements(elements = []) {
    const candidates = [];
    const seen = new Set();
    for (const root of elements) {
      try {
        if (!(root instanceof HTMLElement)) continue;
        if (root.matches?.(LONG_CODE_CANDIDATE_SELECTOR) && !seen.has(root)) {
          seen.add(root);
          candidates.push(root);
        }
        const nodes = root.querySelectorAll(LONG_CODE_CANDIDATE_SELECTOR);
        for (const el of nodes) {
          if (!(el instanceof HTMLElement) || seen.has(el)) continue;
          seen.add(el);
          candidates.push(el);
        }
      } catch {}
    }
    return candidates;
  }

  function extrapolateSampledCount(raw, sampledTurns, totalTurns) {
    const value = Math.max(0, Number(raw) || 0);
    const sampled = Math.max(0, Number(sampledTurns) || 0);
    const total = Math.max(0, Number(totalTurns) || 0);
    if (!sampled || !total || sampled >= total) return value;
    const multiplier = Math.min(6, total / sampled);
    return Math.max(value, Math.round(value * multiplier));
  }

  function pruneLongTasks(ts = now()) {
    const cutoff = ts - LONG_TASK_WINDOW_MS;
    state.longTasks = state.longTasks.filter((item) => item && Number(item.at || 0) >= cutoff);
    let max = 0;
    let total = 0;
    for (const item of state.longTasks) {
      const duration = Number(item.duration || 0);
      total += duration;
      if (duration > max) max = duration;
    }
    return {
      count: state.longTasks.length,
      max,
      total
    };
  }

  function thresholdScale() {
    // Preserve the old "higher rootMarginPx means less aggressive" setting semantics.
    return clampNumber(0.85 + Number(state.settings.rootMarginPx || 0) / 2500, 0.85, 2.25, 1.25);
  }

  function t(base) {
    return Math.max(1, Math.round(Number(base || 0) * thresholdScale()));
  }

  function isExtremeMode() {
    return !!state.settings.extremeMode;
  }

  function classifyBudget(metrics) {
    if (!metrics) return 0;
    if (
      metrics.nodeCount >= t(18000) ||
      metrics.mathNodes >= t(180) ||
      metrics.displayMathNodes >= t(56) ||
      metrics.longTaskMaxMs >= 180 ||
      metrics.longCodeBlocks >= 2
    ) {
      return 3;
    }
    if (
      metrics.nodeCount >= t(10000) ||
      metrics.mathNodes >= t(100) ||
      metrics.displayMathNodes >= t(28) ||
      metrics.longCodeBlocks >= 1 ||
      metrics.longTaskCount >= 3
    ) {
      return 2;
    }
    if (
      metrics.turnCount >= t(18) ||
      metrics.nodeCount >= t(5500) ||
      metrics.mathNodes >= t(45) ||
      metrics.codeBlockNodes >= t(14) ||
      metrics.longTaskCount >= 1
    ) {
      return 1;
    }
    return 0;
  }

  function destructiveHeavyOptimizationsEnabled() {
    return EXPERIMENTAL_DOM_REWRITES_ENABLED === true;
  }

  function isTurnOffscreen() {
    return false;
  }

  function cleanupLegacyTurnMarks() {
    try {
      const nodes = Array.from(document.querySelectorAll('.cgptperf-turn, .cgptperf-offscreen, [data-cgptperf-turn-index]'));
      for (const el of nodes) {
        try {
          el.classList?.remove?.('cgptperf-turn', 'cgptperf-offscreen');
          el.removeAttribute?.('data-cgptperf-turn-index');
        } catch {}
      }
    } catch {}
  }

  function syncTailTurnMetrics(snapshot) {
    if (!state.legacyTurnMarkCleanupDone) {
      state.legacyTurnMarkCleanupDone = true;
      cleanupLegacyTurnMarks();
    }
    return Array.isArray(snapshot?.turns) ? snapshot.turns.length : 0;
  }

  function pruneLongCodeMarks() {
    for (const el of Array.from(state.markedLongCodeBlocks)) {
      try {
        if (el.isConnected === false) {
          clearLongCodeMark(el);
          state.markedLongCodeBlocks.delete(el);
        }
      } catch {
        state.markedLongCodeBlocks.delete(el);
      }
    }
  }

  function collectMetrics(reason) {
    const snapshot = getTurnsSnapshot(false);
    syncTailTurnMetrics(snapshot);
    state.turnsSource = snapshot.source || 'unknown';
    const turnCount = Array.isArray(snapshot.turns) ? snapshot.turns.length : 0;
    const extreme = isExtremeMode();
    const scope = extreme ? buildExtremeMetricScope(snapshot) : null;
    const root = snapshot.root || document.body || document.documentElement;
    const sampledTurnCount = extreme ? Math.max(0, Number(scope?.sampledTurnCount || 0)) : turnCount;
    const nodeCountRaw = extreme
      ? countElementNodesCappedInElements(scope?.elements || [], NODE_COUNT_CAP)
      : countElementNodesCapped(root, NODE_COUNT_CAP);
    const estimatedNodeCount =
      extreme && scope?.estimated
        ? extrapolateSampledCount(nodeCountRaw.count, sampledTurnCount, turnCount)
        : nodeCountRaw.count;
    const mathNodesRaw = extreme
      ? countBySelectorInElements(scope?.elements || [], MATH_SELECTOR)
      : countBySelector(root, MATH_SELECTOR);
    const displayMathNodesRaw = extreme
      ? countBySelectorInElements(scope?.elements || [], DISPLAY_MATH_SELECTOR)
      : countBySelector(root, DISPLAY_MATH_SELECTOR);
    const codeBlockNodesRaw = extreme
      ? countBySelectorInElements(scope?.elements || [], CODE_BLOCK_SELECTOR)
      : countBySelector(root, CODE_BLOCK_SELECTOR);
    const longTasks = pruneLongTasks();
    const longCode = extreme
      ? measureLongCodeCandidates(collectCodeCandidatesInElements(scope?.elements || []), LONG_CODE_CHAR_THRESHOLD, LONG_CODE_LINE_THRESHOLD)
      : measureLongCode(root, LONG_CODE_CHAR_THRESHOLD, LONG_CODE_LINE_THRESHOLD);
    const generating = isGenerating();
    const metrics = {
      at: now(),
      reason: String(reason || ''),
      turnCount,
      nodeCount: estimatedNodeCount,
      nodeCountCapped: nodeCountRaw.capped,
      nodeCountEstimated: !!(extreme && scope?.estimated),
      sampledTurnCount,
      mathNodes: extrapolateSampledCount(mathNodesRaw, sampledTurnCount, turnCount),
      displayMathNodes: extrapolateSampledCount(displayMathNodesRaw, sampledTurnCount, turnCount),
      codeBlockNodes: extrapolateSampledCount(codeBlockNodesRaw, sampledTurnCount, turnCount),
      longCodeBlocks: longCode.longCodeBlocks,
      sampledCodeBlocks: longCode.sampledCodeBlocks,
      maxCodeChars: longCode.maxCodeChars,
      maxCodeLines: longCode.maxCodeLines,
      longTaskCount: longTasks.count,
      longTaskMaxMs: Math.round(longTasks.max),
      longTaskTotalMs: Math.round(longTasks.total),
      mutationScore: state.mutationScore,
      generating
    };
    state.mutationScore = Math.max(0, Math.floor(state.mutationScore * 0.35));
    return metrics;
  }

  function publishState() {
    const m = state.metrics || {};
    const enabled = !!(state.running && state.settings.enabled);
    const snapshot = {
      enabled,
      windowingEnabled: !!state.windowingEnabled,
      heavyEnabled: !!state.heavyEnabled,
      hotPathActive: !!state.hotPathActive,
      virtualizationActive: !!state.virtualizationActive,
      budgetLevel: Number(state.budgetLevel || 0),
      isTurnOffscreen
    };

    setRootAttr(ROOT_ATTR, enabled ? '1' : null);
    setRootAttr(ROOT_VER_ATTR, EXT_VERSION);
    setRootAttr(ROOT_ENABLED_ATTR, enabled ? '1' : '0');
    setRootAttr(ROOT_MODE_ATTR, enabled ? 'coordinator' : 'off');
    setRootAttr(ROOT_EXTREME_ATTR, enabled && state.settings.extremeMode ? '1' : '0');
    setRootAttr(ROOT_HOT_ATTR, state.hotPathActive ? '1' : '0');
    setRootAttr(ROOT_HEAVY_ATTR, state.heavyEnabled ? '1' : '0');
    setRootAttr(ROOT_NOANIM_ATTR, enabled && state.settings.disableAnimations && state.hotPathActive ? '1' : '0');
    setRootAttr(ROOT_OVERLAY_ATTR, enabled && state.settings.showOverlay ? '1' : '0');
    setRootAttr(ROOT_BUDGET_ATTR, String(Number(state.budgetLevel || 0)));
    setRootAttr(ROOT_TURN_COUNT_ATTR, String(Number(m.turnCount || 0)));
    setRootAttr(ROOT_NODE_COUNT_ATTR, String(Number(m.nodeCount || 0)));
    setRootAttr(ROOT_NODE_CAPPED_ATTR, m.nodeCountCapped ? '1' : '0');
    setRootAttr(ROOT_MATH_COUNT_ATTR, String(Number(m.mathNodes || 0)));
    setRootAttr(ROOT_DISPLAY_MATH_COUNT_ATTR, String(Number(m.displayMathNodes || 0)));
    setRootAttr(ROOT_CODE_BLOCK_COUNT_ATTR, String(Number(m.codeBlockNodes || 0)));
    setRootAttr(ROOT_LONG_CODE_COUNT_ATTR, String(Number(m.longCodeBlocks || 0)));
    setRootAttr(ROOT_LONG_TASK_COUNT_ATTR, String(Number(m.longTaskCount || 0)));
    setRootAttr(ROOT_LONG_TASK_MAX_ATTR, String(Number(m.longTaskMaxMs || 0)));
    setRootAttr(ROOT_GENERATING_ATTR, m.generating ? '1' : '0');
    setRootAttr(ROOT_WINDOWING_ATTR, state.windowingEnabled ? '1' : '0');
    setRootAttr(ROOT_VIRTUALIZATION_ATTR, state.virtualizationActive ? '1' : '0');
    setRootAttr(ROOT_TURNS_SOURCE_ATTR, state.turnsSource || 'none');
    setRootAttr(ROOT_PARKED_COUNT_ATTR, '0');
    setRootAttr(ROOT_LITE_CODE_COUNT_ATTR, '0');

    try {
      const core = getCore();
      if (core && typeof core.setPerfSnapshot === 'function') core.setPerfSnapshot(snapshot);
    } catch {}

    updateOverlay();
  }

  function runScan(reason = 'scan') {
    if (!state.running) return;
    if (!state.settings.enabled) {
      pruneLongTasks();
      pruneLongCodeMarks();
      state.metrics = state.metrics || { at: now(), reason: 'disabled', turnCount: 0 };
      state.budgetLevel = 0;
      state.hotPathActive = false;
      state.heavyEnabled = false;
      state.windowingEnabled = false;
      state.virtualizationActive = false;
      publishState();
      return;
    }

    const metrics = collectMetrics(reason);
    const budget = classifyBudget(metrics);
    const interactionHot = state.settings.boostDuringInput && now() < Number(state.interactionHotUntil || 0);
    const hot =
      interactionHot ||
      budget >= 3 ||
      (metrics.generating && budget >= 1) ||
      metrics.longTaskCount >= 2 ||
      metrics.longTaskMaxMs >= 120 ||
      metrics.mutationScore >= 80;

    state.metrics = metrics;
    state.budgetLevel = budget;
    state.hotPathActive = !!hot;
    state.heavyEnabled = !!(state.settings.optimizeHeavyBlocks && budget >= 2);
    state.windowingEnabled = !!(state.settings.virtualizeOffscreen && budget >= 2);
    state.virtualizationActive = false;
    state.lastScanAt = now();
    state.lastReason = reason;
    publishState();
  }

  function scheduleScan(delay = SCAN_MUTATION_DEBOUNCE_MS, reason = 'scheduled') {
    if (!state.running) return;
    const ms = Math.max(50, Number(delay) || 0);
    if (state.scanTimer) clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => {
      state.scanTimer = 0;
      runScan(reason);
    }, ms);
  }

  function armIntervalTimer() {
    try {
      if (state.intervalTimer) clearInterval(state.intervalTimer);
    } catch {}
    state.intervalTimer = 0;
    try {
      state.intervalTimer = setInterval(() => {
        if (document.hidden) return;
        runScan('interval');
      }, isExtremeMode() ? SCAN_EXTREME_NORMAL_MS : SCAN_NORMAL_MS);
    } catch {}
  }

  function isComposerInteractionTarget(target = null) {
    if (!target || typeof target !== 'object') return false;
    try {
      const core = getCore();
      const editor = core && typeof core.getEditorEl === 'function' ? core.getEditorEl() : null;
      if (editor && (target === editor || editor.contains?.(target))) return true;
    } catch {}
    try {
      if (target.matches?.('#prompt-textarea, textarea[name="prompt-textarea"], .ProseMirror[contenteditable="true"]')) return true;
    } catch {}
    try {
      return !!target.closest?.('#prompt-textarea, textarea[name="prompt-textarea"], .ProseMirror[contenteditable="true"]');
    } catch {
      return false;
    }
  }

  function isComposerMutationRecord(record = null) {
    if (!record) return false;
    try {
      if (isComposerInteractionTarget(record.target)) return true;
    } catch {}
    const lists = [record.addedNodes, record.removedNodes];
    for (const list of lists) {
      if (!list || !list.length) continue;
      const limit = Math.min(3, list.length);
      for (let i = 0; i < limit; i += 1) {
        const node = list[i];
        if (!node) continue;
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (el && isComposerInteractionTarget(el)) return true;
      }
    }
    return false;
  }

  function isComposerOnlyMutation(records = []) {
    if (!isExtremeMode() || !records || !records.length) return false;
    const limit = Math.min(16, records.length);
    for (let i = 0; i < limit; i += 1) {
      if (!isComposerMutationRecord(records[i])) return false;
    }
    return true;
  }

  function markInteractionHot(event = null) {
    state.interactionHotUntil = now() + INTERACTION_HOT_MS;
    if ((event?.type === 'input' || event?.type === 'keydown') && isComposerInteractionTarget(event?.target)) {
      if (isExtremeMode()) {
        state.hotPathActive = true;
        state.lastReason = 'composer-input-hot';
        publishState();
        scheduleScan(SCAN_EXTREME_COMPOSER_IDLE_MS, 'composer-input-idle');
        return;
      }
      scheduleScan(SCAN_COMPOSER_INPUT_MS, 'composer-input');
      return;
    }
    scheduleScan(90, 'interaction');
  }

  function installObservers() {
    try {
      if ('PerformanceObserver' in window && PerformanceObserver.supportedEntryTypes?.includes?.('longtask')) {
        state.performanceObserver = new PerformanceObserver((list) => {
          try {
            for (const entry of list.getEntries()) {
              const duration = Number(entry?.duration || 0);
              if (duration >= 50) state.longTasks.push({ at: now(), duration });
            }
            pruneLongTasks();
            scheduleScan(120, 'longtask');
          } catch {}
        });
        state.performanceObserver.observe({ entryTypes: ['longtask'] });
      }
    } catch {}

    const attachMutationObserver = () => {
      if (!state.running || state.mutationObserver || !document.body) return;
      try {
        state.mutationObserver = new MutationObserver((records) => {
          if (document.hidden) return;
          if (isComposerOnlyMutation(records)) {
            state.hotPathActive = true;
            state.lastReason = 'composer-mutation-hot';
            publishState();
            scheduleScan(SCAN_EXTREME_COMPOSER_IDLE_MS, 'composer-mutation-idle');
            return;
          }
          state.mutationScore = Math.min(500, state.mutationScore + Math.min(80, records?.length || 0));
          if (isExtremeMode()) {
            const generating = isGenerating();
            if (generating || state.budgetLevel >= 1) {
              state.hotPathActive = true;
              state.lastReason = 'mutation-hot';
              publishState();
            }
            const delay = generating || state.budgetLevel >= 2 ? SCAN_EXTREME_MUTATION_BUSY_MS : SCAN_EXTREME_MUTATION_IDLE_MS;
            scheduleScan(delay, 'mutation-extreme');
            return;
          }
          const delay = isGenerating() ? SCAN_HOT_MS : SCAN_MUTATION_DEBOUNCE_MS;
          scheduleScan(delay, 'mutation');
        });
        state.mutationObserver.observe(document.body, { childList: true, subtree: true });
      } catch {}
    };

    if (document.body) attachMutationObserver();
    else document.addEventListener('DOMContentLoaded', attachMutationObserver, { once: true });
  }

  function installEventListeners() {
    const opts = { capture: true, passive: true };
    const on = (target, type, handler, options) => {
      try {
        target.addEventListener(type, handler, options);
        state.eventCleanups.push(() => {
          try {
            target.removeEventListener(type, handler, options);
          } catch {}
        });
      } catch {}
    };
    try {
      on(document, 'input', markInteractionHot, opts);
      on(document, 'keydown', markInteractionHot, opts);
      on(document, 'pointerdown', markInteractionHot, opts);
      on(document, 'scroll', () => {
        if (state.budgetLevel >= 2) scheduleScan(700, 'scroll-heavy');
      }, opts);
      on(document, 'visibilitychange', () => {
        if (document.hidden) {
          try {
            getCore()?.releaseMemory?.('perf-hidden');
          } catch {}
          state.hotPathActive = false;
          pruneLongTasks();
          pruneLongCodeMarks();
          publishState();
          return;
        }
        scheduleScan(isExtremeMode() ? 900 : 200, 'visible');
      });
      on(window, 'pageshow', () => scheduleScan(150, 'pageshow'));
      on(window, 'load', () => scheduleScan(250, 'load'));
      on(document, 'readystatechange', () => scheduleScan(250, 'readystatechange'));
      on(window, 'AISHORTCUTS_CGPT_PERF_FORCE_SCAN', () => runScan('force-event'));
    } catch {}
  }

  function installStorageListener() {
    try {
      if (!chrome?.storage?.onChanged || state.storageListener) return;
      state.storageListener = (changes, area) => {
        if (area !== 'sync' || !changes?.[STORAGE_KEY]) return;
        state.settings = sanitizeSettings(changes[STORAGE_KEY].newValue);
        armIntervalTimer();
        scheduleScan(50, 'settings');
      };
      chrome.storage.onChanged.addListener(state.storageListener);
    } catch {}
  }

  function getPublicState() {
    return {
      ok: true,
      version: EXT_VERSION,
      settings: { ...state.settings },
      metrics: { ...(state.metrics || {}) },
      budgetLevel: state.budgetLevel,
      hotPathActive: state.hotPathActive,
      heavyEnabled: state.heavyEnabled,
      windowingEnabled: state.windowingEnabled,
      virtualizationActive: state.virtualizationActive,
      destructiveDomRewritesEnabled: destructiveHeavyOptimizationsEnabled(),
      lastScanAt: state.lastScanAt,
      lastReason: state.lastReason,
      turnsSource: state.turnsSource,
      benchKey: BENCH_KEY
    };
  }

  function installMessageListener() {
    try {
      if (!chrome?.runtime?.onMessage || state.messageListener) return;
      state.messageListener = (msg, sender, sendResponse) => {
        if (!msg || msg.type !== MSG_GET_STATE) return undefined;
        try {
          sendResponse(getPublicState());
        } catch (error) {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        }
        return true;
      };
      chrome.runtime.onMessage.addListener(state.messageListener);
    } catch {}
    try {
      globalThis.__cgpt_perf_get_state_v1__ = getPublicState;
    } catch {}
  }

  function updateOverlay() {
    if (!state.settings.showOverlay || !state.running) {
      try {
        state.overlayEl?.remove?.();
      } catch {}
      state.overlayEl = null;
      return;
    }
    try {
      let el = state.overlayEl || document.getElementById(OVERLAY_ID);
      if (!el) {
        el = document.createElement('div');
        el.id = OVERLAY_ID;
        document.documentElement.appendChild(el);
      }
      state.overlayEl = el;
      const m = state.metrics || {};
      el.textContent = `Perf B${state.budgetLevel} ${state.hotPathActive ? 'hot' : 'idle'} · nodes ${m.nodeCount || 0} · math ${m.mathNodes || 0}`;
    } catch {}
  }

  function clearRootAttrs() {
    const attrs = [
      ROOT_ATTR,
      ROOT_VER_ATTR,
      ROOT_ENABLED_ATTR,
      ROOT_HOT_ATTR,
      ROOT_HEAVY_ATTR,
      ROOT_NOANIM_ATTR,
      ROOT_OVERLAY_ATTR,
      ROOT_BUDGET_ATTR,
      ROOT_MODE_ATTR,
      ROOT_EXTREME_ATTR,
      ROOT_TURN_COUNT_ATTR,
      ROOT_NODE_COUNT_ATTR,
      ROOT_NODE_CAPPED_ATTR,
      ROOT_MATH_COUNT_ATTR,
      ROOT_DISPLAY_MATH_COUNT_ATTR,
      ROOT_CODE_BLOCK_COUNT_ATTR,
      ROOT_LONG_CODE_COUNT_ATTR,
      ROOT_LONG_TASK_COUNT_ATTR,
      ROOT_LONG_TASK_MAX_ATTR,
      ROOT_GENERATING_ATTR,
      ROOT_WINDOWING_ATTR,
      ROOT_VIRTUALIZATION_ATTR,
      ROOT_TURNS_SOURCE_ATTR,
      ROOT_PARKED_COUNT_ATTR,
      ROOT_LITE_CODE_COUNT_ATTR
    ];
    for (const attr of attrs) setRootAttr(attr, null);
  }

  function cleanup(reason = 'cleanup') {
    state.running = false;
    try {
      if (state.scanTimer) clearTimeout(state.scanTimer);
      if (state.intervalTimer) clearInterval(state.intervalTimer);
    } catch {}
    state.scanTimer = 0;
    state.intervalTimer = 0;
    try {
      state.mutationObserver?.disconnect?.();
    } catch {}
    try {
      state.performanceObserver?.disconnect?.();
    } catch {}
    state.mutationObserver = null;
    state.performanceObserver = null;
    try {
      if (state.storageListener) chrome?.storage?.onChanged?.removeListener?.(state.storageListener);
    } catch {}
    try {
      if (state.messageListener) chrome?.runtime?.onMessage?.removeListener?.(state.messageListener);
    } catch {}
    state.storageListener = null;
    state.messageListener = null;
    for (const off of state.eventCleanups.splice(0)) {
      try {
        off();
      } catch {}
    }
    cleanupLegacyTurnMarks();
    for (const el of Array.from(state.markedLongCodeBlocks)) clearLongCodeMark(el);
    state.markedLongCodeBlocks.clear();
    try {
      state.overlayEl?.remove?.();
    } catch {}
    state.overlayEl = null;
    clearRootAttrs();
    try {
      const core = getCore();
      if (core && typeof core.clearPerfSnapshot === 'function') core.clearPerfSnapshot();
    } catch {}
    try {
      if (globalThis[GLOBAL_STATE_KEY]?.cleanup === cleanup) delete globalThis[GLOBAL_STATE_KEY];
    } catch {}
    state.lastReason = reason;
  }

  async function start() {
    state.settings = sanitizeSettings(await loadSettings());
    state.running = true;
    installMessageListener();
    installStorageListener();
    installObservers();
    installEventListeners();
    runScan('start');
    armIntervalTimer();
  }

  const api = {
    version: EXT_VERSION,
    cleanup,
    prepareForReload: () => cleanup('reload'),
    getState: getPublicState
  };

  try {
    globalThis[GLOBAL_STATE_KEY] = api;
  } catch {}

  void start();
})();
