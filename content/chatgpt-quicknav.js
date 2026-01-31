(function () {
  'use strict';

  // Prevent duplicate installs on MV3 reinject / extension reload.
  // QuickNav binds multiple global listeners/timers; running twice can lead to heavy CPU/memory overhead.
  const __aichatCgptQuickNavGuardKey = '__aichat_chatgpt_quicknav_v1__';
  try {
    if (globalThis[__aichatCgptQuickNavGuardKey]) return;
    Object.defineProperty(globalThis, __aichatCgptQuickNavGuardKey, { value: true, configurable: false, enumerable: false, writable: false });
  } catch {
    try {
      if (globalThis[__aichatCgptQuickNavGuardKey]) return;
      globalThis[__aichatCgptQuickNavGuardKey] = true;
    } catch {}
  }

  const CONFIG = { maxPreviewLength: 12, animation: 250, refreshInterval: 2000, forceRefreshInterval: 10000, anchorOffset: 8 };
  const STOP_BTN_SELECTOR = '[data-testid="stop-button"]';
  const BOUNDARY_EPS = 28;
  const DEFAULT_FOLLOW_MARGIN = Math.max(CONFIG.anchorOffset || 8, 12);
  const DEFAULT_NAV_TOP = 60;
  const DEFAULT_NAV_RIGHT = 10;
  const DEBUG = false;
  const TAIL_RECALC_TURNS = 2; // 仅重算末尾预览（流式输出期间变化最多）
  // 存储键与检查点状态
  const STORE_NS = 'cgpt-quicknav';
  const QUICKNAV_SITE_ID = 'chatgpt';
  const WIDTH_KEY = `${STORE_NS}:nav-width`;
  const POS_KEY = `${STORE_NS}:nav-pos`;
  const CP_KEY_PREFIX = `${STORE_NS}:cp:`; // + 会话 key
  const CP_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 检查点保留 30 天
  let cpSet = new Set();          // 仅用于快速 membership（遗留）
  let cpMap = new Map();          // pinId -> meta
  // 收藏夹（favorites）
  const FAV_KEY_PREFIX = `${STORE_NS}:fav:`;         // + 会话 key
  const FAV_FILTER_PREFIX = `${STORE_NS}:fav-filter:`; // + 会话 key
  const FAV_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 收藏保留 30 天
  let favSet = new Set();         // 收藏的 key（消息 msgKey 或 图钉 pinId）
  let favMeta = new Map();        // key -> { created }
  let filterFav = false;          // 是否只显示收藏
  // 防自动滚动（可选）
  const SCROLL_LOCK_KEY = `${STORE_NS}:scroll-lock`;
  const SCROLL_LOCK_DRIFT = 16;
  const SCROLL_LOCK_IDLE_MS = 120;
  const SCROLL_LOCK_INTENT_MS = 1200;
  let scrollLockEnabled = false;
  let scrollLockScrollEl = null;
  let __cgptChatScrollContainer = null;
  let __cgptChatScrollContainerTs = 0;
  let scrollLockBoundTarget = null;
  let scrollLockLastUserTs = 0;
  let scrollLockLastUserIntentTs = 0;
  let scrollLockLastMutationTs = 0;
  let scrollLockLastPos = 0;
  let scrollLockStablePos = 0; // 用户视角的基准位置
  let scrollLockRestoreTimer = 0;
  let scrollLockRestoring = false;
  let scrollLockGuardUntil = 0;
  let scrollLockPointerActive = false;
  let scrollLockUserTouched = false;
  let navAllowScrollDepth = 0;
  let navJumpSeq = 0;
  let navJumpStabilizerCtrl = null;
  let ORIGINAL_SCROLL_INTO_VIEW = null;
  let ORIGINAL_SCROLL_TO = null;
  let ORIGINAL_SCROLL_BY = null;
  let ORIGINAL_ELEM_SCROLL_TO = null;
  let ORIGINAL_ELEM_SCROLL_BY = null;

  // Conversation Tree (bridge to MAIN-world chatgpt-message-tree)
  const TREE_BRIDGE_REQ_SUMMARY = 'QUICKNAV_CHATGPT_TREE_SUMMARY_REQUEST';
  const TREE_BRIDGE_RES_SUMMARY = 'QUICKNAV_CHATGPT_TREE_SUMMARY_RESPONSE';
  const TREE_BRIDGE_TOGGLE_PANEL = 'QUICKNAV_CHATGPT_TREE_TOGGLE';
  const TREE_BRIDGE_OPEN_PANEL = 'QUICKNAV_CHATGPT_TREE_OPEN';
  const TREE_BRIDGE_CLOSE_PANEL = 'QUICKNAV_CHATGPT_TREE_CLOSE';
  const TREE_BRIDGE_REFRESH = 'QUICKNAV_CHATGPT_TREE_REFRESH';
  const TREE_BRIDGE_NAVIGATE_TO = 'QUICKNAV_CHATGPT_TREE_NAVIGATE_TO';
  const TREE_BRIDGE_RES_NAVIGATE_TO = 'QUICKNAV_CHATGPT_TREE_NAVIGATE_TO_RESPONSE';
  const TREE_TOOLTIP_ID = 'cgpt-quicknav-branch-tooltip';

  let treeSummary = null;
  let treePathSet = new Set();
  let treeSummaryReqTimer = 0;
  let treeSummaryPendingReqId = '';
  const treeNavigatePending = new Map(); // reqId -> { resolve, timer }

  // 全局调试函数，用户可在控制台调用
  window.chatGptNavDebug = {
    forceRefresh: () => {
      console.log('ChatGPT Navigation: 手动强制刷新');
      TURN_SELECTOR = null;
      const ui = document.getElementById('cgpt-compact-nav')?._ui;
      if (ui) scheduleRefresh(ui);
      else console.log('导航面板未找到');
    },
    showCurrentSelector: () => {
      console.log('当前使用的选择器:', TURN_SELECTOR || '无');
      console.log('当前对话数量:', qsTurns().length);
    },
    testAllSelectors: () => {
      const originalSelector = TURN_SELECTOR;
      TURN_SELECTOR = null;
      qsTurns(); // 这会触发调试输出
      TURN_SELECTOR = originalSelector;
    },
    getCurrentTurns: () => {
      const turns = qsTurns();
      console.log('当前检测到的对话元素:', turns);
      return turns;
    },
    checkOverlap: () => {
      const panels = document.querySelectorAll('#cgpt-compact-nav');
      const styles = document.querySelectorAll('#cgpt-compact-nav-style');
      console.log(`找到 ${panels.length} 个导航面板`);
      console.log(`找到 ${styles.length} 个样式节点`);
      console.log(`键盘事件已绑定: ${!!window.__cgptKeysBound}`);
      console.log(`正在启动中: ${__cgptBooting}`);
      if (panels.length > 1) {
        console.warn('检测到重叠面板！清理中...');
        panels.forEach((panel, index) => {
          if (index > 0) {
            panel.remove();
            console.log(`已删除重复面板 ${index}`);
          }
        });
      }
      return { panels: panels.length, styles: styles.length, keysBound: !!window.__cgptKeysBound, booting: __cgptBooting };
    },
    getStats: () => {
      try {
        return {
          previewCache: typeof previewCache?.size === 'number' ? previewCache.size : 0,
          roleCache: typeof roleCache?.size === 'number' ? roleCache.size : 0,
          turnIdToPos: typeof turnIdToPos?.size === 'number' ? turnIdToPos.size : 0,
          cachedTurnIds: Array.isArray(cachedTurnIds) ? cachedTurnIds.length : 0,
          treeNavigatePending: typeof treeNavigatePending?.size === 'number' ? treeNavigatePending.size : 0,
          treeSummary: !!treeSummary,
          treePathCount: typeof treePathSet?.size === 'number' ? treePathSet.size : 0
        };
      } catch {
        return null;
      }
    },
    softCleanup: (reason = '') => {
      const before = (() => {
        try {
          return window.chatGptNavDebug?.getStats?.();
        } catch {
          return null;
        }
      })();

      try { previewCache?.clear?.(); } catch {}
      try { roleCache?.clear?.(); } catch {}
      try { turnIdToPos?.clear?.(); } catch {}
      try { cachedTurnIds = []; } catch {}

      try {
        for (const [reqId, p] of treeNavigatePending.entries()) {
          try { clearTimeout(p?.timer); } catch {}
          treeNavigatePending.delete(reqId);
          try { p?.resolve?.(false); } catch {}
        }
      } catch {}

      try {
        treeSummary = null;
        treePathSet = new Set();
        treeSummaryPendingReqId = '';
        if (treeSummaryReqTimer) {
          try { clearTimeout(treeSummaryReqTimer); } catch {}
          treeSummaryReqTimer = 0;
        }
      } catch {}

      try {
        const ui = document.getElementById('cgpt-compact-nav')?._ui;
        if (ui) scheduleRefresh(ui, { force: true, delay: 120 });
      } catch {}

      const after = (() => {
        try {
          return window.chatGptNavDebug?.getStats?.();
        } catch {
          return null;
        }
      })();

      try {
        console.log('[QuickNav] softCleanup', { reason, before, after });
      } catch {}

      return { reason, before, after };
    },
    getTreeSummary: () => treeSummary,
    testObserver: () => {
      const nav = document.getElementById('cgpt-compact-nav');
      if (!nav || !nav._ui || !nav._ui._mo) {
        console.log('MutationObserver 未找到');
        return false;
      }

      const mo = nav._ui._mo;
      const target = nav._ui._moTarget;
      console.log('MutationObserver 状态:');
      console.log('- 目标容器:', target);
      console.log('- 观察者存在:', !!mo);
      console.log('- 当前对话数量:', qsTurns().length);
      console.log('- 当前选择器:', TURN_SELECTOR || '无');

      // 临时启用DEBUG模式进行测试
      const oldDebug = DEBUG;
      window.DEBUG_TEMP = true;
      console.log('已临时启用DEBUG模式，请尝试发送一条消息，然后查看控制台输出');

      setTimeout(() => {
        window.DEBUG_TEMP = false;
        console.log('DEBUG模式已关闭');
      }, 30000);

      return true;
    }
  };

  function registerMenuCommand(name, fn) {
    try {
      const reg = window.__quicknavRegisterMenuCommand;
      if (typeof reg === 'function') return reg(name, fn);
    } catch {}
    return null;
  }

  registerMenuCommand("重置问题栏位置", resetPanelPosition);
  registerMenuCommand("清理过期检查点（30天）", cleanupExpiredCheckpoints);
  registerMenuCommand("清理无效收藏", cleanupInvalidFavorites);
  registerMenuCommand("紧急：释放内存（关闭树/分屏/去重）", emergencyCleanup);
  function resetPanelPosition() {
    const nav = document.getElementById('cgpt-compact-nav');
    if (nav) {
      nav.style.top = `${DEFAULT_NAV_TOP}px`;
      nav.style.right = `${DEFAULT_NAV_RIGHT}px`;
      nav.style.left = 'auto';
      nav.style.bottom = 'auto';
      persistNavPosition(nav);
      if (nav._ui && nav._ui.layout && typeof nav._ui.layout.notifyExternalPositionChange === 'function') {
        try { nav._ui.layout.notifyExternalPositionChange(); } catch {}
      }
      const originalBg = nav.style.background;
      const originalOutline = nav.style.outline;
      nav.style.background = 'var(--cgpt-nav-accent-subtle)';
      nav.style.outline = '2px solid var(--cgpt-nav-accent)';
      setTimeout(() => {
        nav.style.background = originalBg;
        nav.style.outline = originalOutline;
      }, 500);
    }
  }
  function cleanupExpiredCheckpoints() {
    try {
      loadCPSet();
      const removed = runCheckpointGC(true);
      const nav = document.getElementById('cgpt-compact-nav');
      if (nav && nav._ui) {
        renderList(nav._ui);
      }
      if (typeof alert === 'function') {
        alert(removed > 0 ? `已清理 ${removed} 条过期检查点（>30天）` : '无过期检查点需要清理');
      } else {
        console.log('清理结果：', removed > 0 ? `清理 ${removed} 条` : '无过期检查点');
      }
    } catch (e) {
      console.error('清理过期检查点失败:', e);
    }
  }

  function cleanupInvalidFavorites() {
    try {
      loadFavSet();
      // 计算有效 key：当前对话项 + 现存的图钉ID
      const valid = new Set();
      try { const base = buildIndex(); base.forEach(i => valid.add(i.key)); } catch {}
      try { loadCPSet(); cpMap.forEach((_, pid) => valid.add(pid)); } catch {}
      const removed = runFavoritesGC(true, valid);
      const nav = document.getElementById('cgpt-compact-nav');
      if (nav && nav._ui) { updateStarBtnState(nav._ui); renderList(nav._ui); }
      if (typeof alert === 'function') {
        alert(removed > 0 ? `已清理 ${removed} 个无效收藏` : '无无效收藏需要清理');
      } else {
        console.log('收藏清理结果：', removed > 0 ? `清理 ${removed} 个` : '无无效收藏');
      }
    } catch (e) {
      console.error('清理无效收藏失败:', e);
    }
  }

  function emergencyCleanup() {
    // Best-effort: delegate to ChatGPT core memory guard if present.
    try {
      const core = globalThis.__aichat_chatgpt_core_v1__ || null;
      if (core && core.memGuard && typeof core.memGuard.cleanup === 'function') {
        core.memGuard.cleanup('quicknav_menu');
        return;
      }
    } catch {}

    // Fallback: perform minimal direct cleanup steps.
    try {
      window.__aichat_chatgpt_split_view_api_v1__?.hardClose?.('quicknav_menu');
    } catch {}
    try {
      // Message Tree runs in MAIN world; close it via bridge.
      window.postMessage({ __quicknav: 1, type: 'QUICKNAV_CHATGPT_TREE_CLOSE' }, '*');
    } catch {}
    try {
      window.chatGptNavDebug?.checkOverlap?.();
    } catch {}
  }

  let pending = false, rafId = null, idleId = null;
  let forceRefreshTimer = null;
  let lastTurnCount = 0;
  let lastDomTurnCount = 0;
  let lastDomFirstKey = '';
  let lastDomLastKey = '';
  let TURN_SELECTOR = null;
  let scrollTicking = false;
  let activeUpdateTimer = 0;
  let lastScrollTs = 0;
  let currentActiveId = null;
  let currentActiveTurnPos = 0; // 当前激活 turn 在 qsTurns() 里的位置，用于减少扫描
  let __cgptBooting = false;
  let refreshTimer = 0; // 新的尾随去抖定时器
  let lastStopCheckTs = 0;
  let lastHasStop = null;
  let __cgptKeydownHandler = null;
  let __cgptSendEventsBound = false;
  let __cgptActiveTrackingBound = false;

  function isChatRoute() {
    try {
      const p = location && location.pathname ? location.pathname : '/';
      return p === '/' || p.startsWith('/c/') || p.startsWith('/g/') || p.startsWith('/share/');
    } catch {
      return true;
    }
  }

  function getConversationIdFromUrl() {
    try {
      const core = globalThis.__aichat_chatgpt_core_v1__;
      if (core && typeof core.getConversationIdFromUrl === 'function') {
        const id = core.getConversationIdFromUrl(location.href);
        if (id) return id;
      }
    } catch {}
    try {
      const parts = String(location.pathname || '')
        .split('/')
        .filter(Boolean);
      const idx = parts.indexOf('c');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      return '';
    } catch {
      return '';
    }
  }

  function getRouteKey() {
    try {
      // For our UI lifecycle, `pathname` is what matters (ChatGPT may change query/hash during hydration).
      return String(location.pathname || '/');
    } catch {
      return '/';
    }
  }

  function installTreeBridgeListener() {
    if (window.__cgptTreeBridgeBound) return;
    window.__cgptTreeBridgeBound = true;

    window.addEventListener('message', (event) => {
      try {
        if (!event || event.source !== window) return;
        const data = event.data;
        if (!data || typeof data !== 'object' || data.__quicknav !== 1) return;
        const type = String(data.type || '');

        if (type === TREE_BRIDGE_RES_SUMMARY) {
          if (typeof data.reqId !== 'string' || !data.reqId) return;
          if (treeSummaryPendingReqId && data.reqId !== treeSummaryPendingReqId) return;

          const ok = !!data.ok;
          const summary = ok && data.summary && typeof data.summary === 'object' ? data.summary : null;
          treeSummaryPendingReqId = '';

          const currentConv = getConversationIdFromUrl();
          if (summary && summary.conversationId && currentConv && summary.conversationId !== currentConv) return;

          treeSummary = summary;
          treePathSet = new Set(Array.isArray(summary?.pathIds) ? summary.pathIds.filter((x) => typeof x === 'string' && x) : []);

          const ui = document.getElementById('cgpt-compact-nav')?._ui;
          if (ui) {
            try { updateTreeBtnState(ui); } catch {}
            try { renderList(ui); } catch {}
          }
          return;
        }

        if (type === TREE_BRIDGE_RES_NAVIGATE_TO) {
          const reqId = typeof data.reqId === 'string' ? data.reqId : '';
          if (!reqId) return;
          const pending = treeNavigatePending.get(reqId);
          if (!pending) return;
          treeNavigatePending.delete(reqId);
          try { clearTimeout(pending.timer); } catch {}
          pending.resolve(!!data.ok);
          if (data.ok) scheduleTreeSummaryRequest(240);
          return;
        }
      } catch {}
    });
  }

  function requestTreeSummary() {
    try {
      if (!getConversationIdFromUrl()) return;
      const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      treeSummaryPendingReqId = reqId;
      window.postMessage({ __quicknav: 1, type: TREE_BRIDGE_REQ_SUMMARY, reqId }, '*');
      try {
        const ui = document.getElementById('cgpt-compact-nav')?._ui;
        if (ui) updateTreeBtnState(ui);
      } catch {}
    } catch {}
  }

  function scheduleTreeSummaryRequest(delay = 650) {
    try {
      if (treeSummaryReqTimer) clearTimeout(treeSummaryReqTimer);
      treeSummaryReqTimer = setTimeout(() => {
        treeSummaryReqTimer = 0;
        requestTreeSummary();
      }, Math.max(0, Number(delay) || 0));
    } catch {}
  }

  function requestTreeNavigateToMessageId(msgId, { timeoutMs = 2600 } = {}) {
    const id = String(msgId || '').trim();
    if (!id || !getConversationIdFromUrl()) return Promise.resolve(false);

    return new Promise((resolve) => {
      const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const timeout = Math.max(400, Number(timeoutMs) || 0);
      const timer = setTimeout(() => {
        treeNavigatePending.delete(reqId);
        resolve(false);
      }, timeout);
      treeNavigatePending.set(reqId, { resolve, timer });

      try {
        window.postMessage({ __quicknav: 1, type: TREE_BRIDGE_NAVIGATE_TO, reqId, msgId: id }, '*');
      } catch {
        try { clearTimeout(timer); } catch {}
        treeNavigatePending.delete(reqId);
        resolve(false);
      }
    });
  }

  function whenBodyReady(cb) {
    try {
      if (document.body) return cb();
      const mo = new MutationObserver(() => {
        if (!document.body) return;
        try { mo.disconnect(); } catch {}
        cb();
      });
      mo.observe(document.documentElement, { childList: true });
    } catch {
      try {
        window.addEventListener(
          'DOMContentLoaded',
          () => {
            try { cb(); } catch {}
          },
          { once: true }
        );
      } catch {}
    }
  }

  // 性能缓存：避免长对话频繁扫描/强制重排
  const previewCache = new Map(); // msgKey -> preview
  const roleCache = new Map(); // msgKey -> 'user' | 'assistant'
  const turnIdToPos = new Map(); // turnId -> position in cachedTurnIds
  // Store only turn element ids (strings), not DOM nodes. This avoids accidentally keeping
  // old/virtualized turns alive and reduces long-session memory pressure.
  let cachedTurnIds = [];

  function scheduleRefresh(ui, { delay = 80, force = false, soft = null } = {}) {
    if (force) {
      if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = 0; }
      run();
      return;
    }
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(run, delay);

    function run() {
      refreshTimer = 0;
      pending = false; // 旧标志直接归零，防止误伤
      try {
        const useSoft = soft === null ? (lastDomTurnCount || 0) > 120 : !!soft;
        const oldCount = cacheIndex.length;
        refreshIndex(ui, { force, soft: useSoft });
        const newCount = cacheIndex.length;

        // 如果刷新期间 turn 数变化，再来一次"收尾"（防抖窗口内很常见）
        if (newCount !== oldCount) {
          setTimeout(() => {
            refreshIndex(ui, { force: true });
            scheduleActiveUpdateNow();
          }, 120);
        } else {
          scheduleActiveUpdateNow();
        }
      } catch (e) {
        if (DEBUG || window.DEBUG_TEMP) console.error('scheduleRefresh error:', e);
      }
    }
  }

  function checkStreamingState(ui, force = false) {
    const now = Date.now();
    if (!force && now - lastStopCheckTs < 250) return lastHasStop;
    lastStopCheckTs = now;
    const hasStop = !!document.querySelector(STOP_BTN_SELECTOR);
    if (lastHasStop === null) {
      lastHasStop = hasStop;
      return hasStop;
    }
    if (lastHasStop && !hasStop && ui) scheduleRefresh(ui, { force: true });
    lastHasStop = hasStop;
    return hasStop;
  }

  function init() {
    if (!isChatRoute()) {
      // 非聊天路由：避免在 Library/GPTs 等页面显示面板
      try {
        const nav = document.getElementById('cgpt-compact-nav');
        if (nav) nav.remove();
      } catch {}
      return;
    }
    const existing = document.getElementById('cgpt-compact-nav');
    if (existing) {
      // 扩展“重新加载”后旧内容脚本上下文会消失，但 DOM 还在；此时需要清理并重新初始化
      try {
        if (!existing._ui) {
          document.querySelectorAll('#cgpt-compact-nav').forEach((n) => { try { n.remove(); } catch {} });
          document.querySelectorAll('#cgpt-compact-nav-style').forEach((n) => { try { n.remove(); } catch {} });
        } else {
          return;
        }
      } catch {
        return;
      }
    }
    const boot = () => {
      // 二次校验：已有面板或正在启动就直接退出
      if (document.getElementById('cgpt-compact-nav')) {
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 面板已存在，跳过创建');
        return;
      }
      if (__cgptBooting) {
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 正在启动中，跳过重复创建');
        return;
      }

      __cgptBooting = true;
      try {
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 开始创建面板');
        const ui = createPanel();
        wirePanel(ui);
        installTreeBridgeListener();
        initScrollLock(ui);
        observeChat(ui);
        bindActiveTracking();
        watchSendEvents(ui); // 新增这一行
        bindAltPin(ui); // 绑定 Option+单击添加📌
        scheduleRefresh(ui);
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 面板创建完成');
      } finally {
        __cgptBooting = false;
      }
    };
    boot();
  }

  let currentRouteKey = getRouteKey();
  function detectUrlChange() {
    const nextKey = getRouteKey();
    if (nextKey === currentRouteKey) return;

    if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: route changed', currentRouteKey, '->', nextKey);
    currentRouteKey = nextKey;

    // Leaving chat route: remove panel to avoid showing in Library/GPTs/etc.
    if (!isChatRoute()) {
      try {
        const nav = document.getElementById('cgpt-compact-nav');
        if (nav && nav._ui) {
          try {
            if (nav._ui._forceRefreshTimer) clearInterval(nav._ui._forceRefreshTimer);
          } catch {}
          try {
            if (nav._ui._moBootstrapTimer) clearInterval(nav._ui._moBootstrapTimer);
          } catch {}
          try {
            nav._ui._mo?.disconnect?.();
          } catch {}
        }
        if (nav) nav.remove();
      } catch {}
      return;
    }

    // Reset per-route caches and restart observers, but keep the panel DOM to avoid flicker.
    const nav = document.getElementById('cgpt-compact-nav');
    const ui = nav && nav._ui ? nav._ui : null;
    if (!ui) {
      // If DOM exists but context is gone (e.g. extension reload), rebuild cleanly.
      try {
        if (nav) nav.remove();
      } catch {}
      setTimeout(init, 0);
      return;
    }

    try {
      if (ui._forceRefreshTimer) clearInterval(ui._forceRefreshTimer);
    } catch {}
    try {
      if (ui._moBootstrapTimer) clearInterval(ui._moBootstrapTimer);
    } catch {}
    try {
      ui._mo?.disconnect?.();
    } catch {}
    ui._mo = null;
    ui._moTarget = null;
    ui._moBootstrapTimer = 0;
    ui._moBootstrapAttempts = 0;
    ui._forceRefreshTimer = null;

    try {
      if (refreshTimer) clearTimeout(refreshTimer);
    } catch {}
    refreshTimer = 0;
    try {
      if (activeUpdateTimer) clearTimeout(activeUpdateTimer);
    } catch {}
    activeUpdateTimer = 0;
    try {
      if (forceRefreshTimer) clearInterval(forceRefreshTimer);
    } catch {}
    forceRefreshTimer = null;
    try {
      if (scrollLockRestoreTimer) clearTimeout(scrollLockRestoreTimer);
    } catch {}
    scrollLockRestoreTimer = 0;

    // Re-load per-conversation state (pins/favorites/filter) because keys are derived from `location.pathname`.
    try { loadCPSet(); } catch {}
    try { loadFavSet(); } catch {}
    try { loadFavFilterState(); } catch {}

    lastTurnCount = 0;
    TURN_SELECTOR = null;
    __cgptChatScrollContainer = null;
    __cgptChatScrollContainerTs = 0;
    scrollLockScrollEl = null;
    previewCache.clear();
    roleCache.clear();
    turnIdToPos.clear();
    cachedTurnIds = [];
    lastDomTurnCount = 0;
    currentActiveTurnPos = 0;
    currentActiveId = null;
    treeSummary = null;
    treePathSet = new Set();
    treeSummaryPendingReqId = '';
    if (treeSummaryReqTimer) {
      try { clearTimeout(treeSummaryReqTimer); } catch {}
      treeSummaryReqTimer = 0;
    }

    try { updateStarBtnState(ui); } catch {}
    try { updateTreeBtnState(ui); } catch {}
    try { observeChat(ui); } catch {}
    try { scheduleRefresh(ui, { force: true, delay: 120 }); } catch {}
    try { scheduleActiveUpdateNow(); } catch {}
    // Tree summary fetches the full conversation mapping (`/backend-api/conversation/:id`),
    // which can be very large on long chats and cause huge memory spikes.
    // Keep it lazy: only request after the user clicks the Tree button.
  }

  function installRouteWatcher() {
    try {
      if (window.__cgptRouteWatcherInstalledV2) return;
      window.__cgptRouteWatcherInstalledV2 = true;
    } catch {}

    // Prefer shared core/bridge (MAIN-world route hook + slow polling fallback).
    try {
      const core = globalThis.__aichat_chatgpt_core_v1__;
      if (core && typeof core.onRouteChange === 'function') {
        window.__cgptRouteWatcherUnsubV2 = core.onRouteChange(() => {
          try { detectUrlChange(); } catch {}
        });
        return;
      }
    } catch {}

    // Fallback: shared isolated bridge.
    try {
      const bridge = globalThis.__aichat_quicknav_bridge_v1__;
      if (bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function') {
        try {
          bridge.ensureRouteListener();
        } catch {}
        window.__cgptRouteWatcherUnsubV2 = bridge.on('routeChange', () => {
          try { detectUrlChange(); } catch {}
        });
        return;
      }
    } catch {}

    // Last resort: popstate/hashchange + slow polling.
    try {
      window.addEventListener('popstate', detectUrlChange);
      window.addEventListener('hashchange', detectUrlChange);
    } catch {}
    try {
      setInterval(() => {
        try {
          if (document.hidden) return;
          detectUrlChange();
        } catch {}
      }, 8000);
    } catch {}
  }

  installRouteWatcher();

  function installNavSelfHeal() {
    try {
      if (window.__cgptNavSelfHealInstalled) return;
      window.__cgptNavSelfHealInstalled = true;
    } catch {
      // ignore
    }

    let ensureTimer = 0;
    let ensureAttempts = 0;

    const ensure = () => {
      try {
        if (!isChatRoute()) return;
        if (document.getElementById('cgpt-compact-nav')) return;
        init();
      } catch {}
    };

    const scheduleEnsure = (delay = 200) => {
      if (ensureTimer) return;
      ensureTimer = setTimeout(() => {
        ensureTimer = 0;
        ensure();
        ensureAttempts++;
        // Some ChatGPT renders can wipe body children during hydration; retry briefly.
        if (ensureAttempts < 12 && isChatRoute() && !document.getElementById('cgpt-compact-nav')) {
          scheduleEnsure(600);
        } else {
          ensureAttempts = 0;
        }
      }, Math.max(0, Number(delay) || 0));
    };

    // Fast path: if body child list changes and panel is missing, restore it.
    try {
      const mo = new MutationObserver(() => {
        try {
          if (!isChatRoute()) return;
          if (document.getElementById('cgpt-compact-nav')) return;
          scheduleEnsure(120);
        } catch {}
      });
      if (document.body) mo.observe(document.body, { childList: true });
    } catch {}

    // Slow path: adaptive sanity check (covers SPA navigations that don't touch body root children).
    // Use setTimeout (not setInterval) so we can back off when everything is stable.
    try {
      if (!window.__cgptNavSelfHealTimerInstalled) {
        window.__cgptNavSelfHealTimerInstalled = true;
        let t = 0;
        const schedule = (ms) => {
          try { if (t) clearTimeout(t); } catch {}
          t = setTimeout(tick, Math.max(0, Number(ms) || 0));
        };
        const tick = () => {
          try {
            if (document.hidden) return schedule(15000);
            if (!isChatRoute()) return schedule(15000);
            if (document.getElementById('cgpt-compact-nav')) return schedule(15000);
            scheduleEnsure(0);
            schedule(4000);
          } catch {
            schedule(15000);
          }
        };
        schedule(4000);
      }
    } catch {}
  }

  whenBodyReady(() => {
    const start = () => {
      try {
        init();
        installNavSelfHeal();
      } catch {}
    };

    // ChatGPT sometimes does a fast "hydrate / router bootstrap" pass right after first paint,
    // which can wipe early-injected DOM nodes and make UIs flicker (looks like a refresh).
    // Delay the initial mount slightly so our UI appears once and stays.
    const INITIAL_MOUNT_DELAY_MS = 350;

    try {
      if (document.readyState === 'loading') {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            setTimeout(start, INITIAL_MOUNT_DELAY_MS);
          },
          { once: true }
        );
        return;
      }
    } catch {}

    setTimeout(start, INITIAL_MOUNT_DELAY_MS);
  });

  function qsTurns(root = document) {
    // Narrow the scan root when possible: ChatGPT exposes a stable turns container.
    // This avoids scanning the full page DOM on long chats.
    try {
      if (root === document) {
        const stable = document.querySelector('[data-testid="conversation-turns"]');
        if (
          stable &&
          stable.querySelector?.(
            'article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"], div[data-message-id], [data-message-author-role]'
          )
        ) {
          root = stable;
        }
      }
    } catch {}

    // Prefer shared core selector for the modern ChatGPT turn DOM.
    try {
      const core = globalThis.__aichat_chatgpt_core_v1__;
      if (core && typeof core.getTurnArticles === 'function') {
        const turns = core.getTurnArticles(root);
        if (Array.isArray(turns) && turns.length) {
          TURN_SELECTOR = 'article[data-testid^="conversation-turn-"]';
          return turns;
        }
      }
    } catch {}

    if (TURN_SELECTOR) {
      const els = root.querySelectorAll(TURN_SELECTOR);
      if (els.length) return Array.from(els);
      // 选择器失效则自动回退重选，避免每次 mutation 都清空缓存
      TURN_SELECTOR = null;
    }

    // 快速返回：没有任何消息时，避免触发大量 fallback 选择器扫描（新会话/加载中常见）
    try {
      const hasAnyTurn = !!root.querySelector(
        'article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"], div[data-message-id]'
      );
      if (!hasAnyTurn) {
        const hasRoleMarker = !!root.querySelector('[data-message-author-role]');
        if (!hasRoleMarker) return [];
      }
    } catch {}

    const selectors = [
      // 原有选择器
      'article[data-testid^="conversation-turn-"]',
      '[data-testid^="conversation-turn-"]',
      'div[data-message-id]',
      'div[class*="group"][data-testid]',
      // 新增备用选择器
      '[data-testid*="conversation-turn"]',
      '[data-testid*="message-"]',
      'div[class*="turn"]',
      'div[class*="message"]',
      'div[class*="group"] div[data-message-author-role]',
      'div[class*="conversation"] > div',
      '[class*="chat"] > div',
      '[role="presentation"] > div',
      'main div[class*="group"]',
      'main div[data-testid]'
    ];

    if (DEBUG || window.DEBUG_TEMP) {
      console.log('ChatGPT Navigation Debug: 检测对话选择器');
      for (const selector of selectors) {
        const els = root.querySelectorAll(selector);
        console.log(`- ${selector}: ${els.length} 个元素`);
        if (els.length > 0) {
          console.log('  样本元素:', els[0]);
        }
      }
    }

    for (const selector of selectors) {
      // Probe with `querySelector` first (cheaper than `querySelectorAll`).
      let hit = null;
      try { hit = root.querySelector(selector); } catch {}
      if (!hit) continue;
      const els = root.querySelectorAll(selector);
      if (!els.length) continue;
      TURN_SELECTOR = selector;
      if (DEBUG || window.DEBUG_TEMP) console.log(`ChatGPT Navigation: 使用选择器 ${selector}, 找到 ${els.length} 个对话`);
      return Array.from(els);
    }

    if (DEBUG || window.DEBUG_TEMP) {
      console.log('ChatGPT Navigation Debug: 所有预设选择器都失效，尝试智能检测');
      console.log('页面中的所有可能对话元素:');
      const potentialElements = [
        ...root.querySelectorAll('div[class*="group"]'),
        ...root.querySelectorAll('div[data-message-id]'),
        ...root.querySelectorAll('article'),
        ...root.querySelectorAll('[data-testid]'),
        ...root.querySelectorAll('div[role="presentation"]')
      ];
      console.log('潜在元素数量:', potentialElements.length);
    }

    // 增强的fallback检测
    const fallbackSelectors = [
      'div[class*="group"], div[data-message-id]',
      'div[class*="turn"], div[class*="message"]',
      'main > div > div',
      '[role="presentation"] > div'
    ];

    for (const fallbackSelector of fallbackSelectors) {
      let raw = null;
      try { raw = root.querySelectorAll(fallbackSelector); } catch { raw = null; }
      if (!raw || !raw.length) continue;

      // Avoid creating huge arrays on weird pages; a bounded sample is enough for heuristics.
      const HARD_CAP = 2500;
      const list = [];
      if (raw.length > HARD_CAP) {
        for (let i = 0; i < raw.length && i < HARD_CAP; i++) list.push(raw[i]);
      } else {
        for (const el of raw) list.push(el);
      }

      const candidates = list.filter(el => {
        // 检查是否包含消息相关的内容
        return (
          el.querySelector('div[data-message-author-role]') ||
          el.querySelector('[data-testid*="user"]') ||
          el.querySelector('[data-testid*="assistant"]') ||
          el.querySelector('[data-author]') ||
          el.querySelector('.markdown') ||
          el.querySelector('.prose') ||
          el.querySelector('.whitespace-pre-wrap') ||
          // Avoid `textContent` here: it allocates a full string and can spike memory on huge pages.
          el.querySelector('p,li,pre,code,blockquote')
        );
      });

      if (candidates.length > 0) {
        if (DEBUG || window.DEBUG_TEMP) console.log(`ChatGPT Navigation: Fallback选择器 ${fallbackSelector} 找到 ${candidates.length} 个候选对话`);
        return candidates;
      }
    }

    if (DEBUG) console.log('ChatGPT Navigation: 所有检测方法均失效');
    return [];
  }

  function getTextPreview(el) {
    // Some turns (e.g. streaming assistant placeholder / image-only messages) may not have
    // a markdown/prose block yet. Keep a placeholder preview so the last turn won't disappear.
    if (!el) return '...';

    // NOTE:
    // - `innerText` forces layout (very slow on long chats).
    // - `textContent` allocates the full string for the entire subtree (can spike memory on huge turns).
    // So we collect a bounded snippet from text nodes.
    const HARD_CAP = 600;
    const NODE_CAP = 240; // safety cap to avoid deep traversal on weird DOM

    let out = '';
    let lastWasSpace = false;
    let scanned = 0;

    /** @type {TreeWalker|null} */
    let tw = null;
    try {
      tw = document.createTreeWalker(
        el,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            try {
              if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
              if (!node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
              return NodeFilter.FILTER_ACCEPT;
            } catch {
              return NodeFilter.FILTER_REJECT;
            }
          }
        },
        false
      );
    } catch {
      tw = null;
    }

    if (tw) {
      while (tw.nextNode()) {
        scanned += 1;
        if (scanned > NODE_CAP) break;
        const s = tw.currentNode?.nodeValue || '';
        if (!s) continue;

        for (let i = 0; i < s.length && out.length < HARD_CAP; i++) {
          const ch = s[i];
          // Cheap whitespace check (ASCII + common unicode spaces handled by regex fallback).
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
        if (out.length >= HARD_CAP) break;
      }
    } else {
      // Fallback: may allocate large strings, but only when TreeWalker is unavailable.
      try {
        const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) return '...';
        return text.length > HARD_CAP ? text.slice(0, HARD_CAP) : text;
      } catch {
        return '...';
      }
    }

    out = out.trim();
    return out || '...';
  }

  function getTurnKey(el) {
    if (!el) return '';
    return el.getAttribute('data-message-id') || el.getAttribute('data-testid') || el.id || '';
  }

  function getTurnMessageId(turnEl, previewEl) {
    try {
      if (!turnEl) return '';
      const direct = turnEl.getAttribute('data-message-id');
      if (direct) return direct;
      const fromPreview = previewEl && previewEl.closest ? previewEl.closest('[data-message-id]')?.getAttribute?.('data-message-id') : '';
      if (fromPreview) return fromPreview;
      const found = turnEl.querySelector?.('[data-message-id]')?.getAttribute?.('data-message-id');
      if (found) return found;
      const turnId = turnEl.getAttribute('data-turn-id');
      if (turnId) return turnId;
    } catch {}
    return '';
  }

  function analyzeTurnToIndexItem(el, i, fullLen, userSeq, assistantSeq) {
    if (!el) return { item: null, userSeq, assistantSeq };
    try {
      if (el.getAttribute('data-cgpt-turn') !== '1') el.setAttribute('data-cgpt-turn', '1');
    } catch {}

    const attrTestId = (() => {
      try {
        return el.getAttribute('data-testid') || '';
      } catch {
        return '';
      }
    })();

    try {
      if (!el.id) el.id = `cgpt-turn-${i + 1}`;
    } catch {}
    try {
      turnIdToPos.set(el.id, i);
    } catch {}

    const msgKey = getTurnKey(el);
    let role = roleCache.get(msgKey) || '';

    let isUser = role === 'user';
    let isAssistant = role === 'assistant';
    if (!isUser && !isAssistant) {
      try {
        isUser = !!(
          el.querySelector('[data-message-author-role="user"]') ||
          el.querySelector('.text-message[data-author="user"]') ||
          attrTestId.includes('user')
        );
      } catch {}
      try {
        isAssistant = !!(
          el.querySelector('[data-message-author-role="assistant"]') ||
          el.querySelector('.text-message[data-author="assistant"]') ||
          attrTestId.includes('assistant')
        );
      } catch {}
      role = isUser ? 'user' : isAssistant ? 'assistant' : '';
      if (role) roleCache.set(msgKey, role);
    }

    if (DEBUG && i < 3) {
      try {
        console.log(`ChatGPT Navigation Debug - 元素 ${i}:`, {
          element: el,
          testId: attrTestId,
          isUser,
          isAssistant
        });
      } catch {}
    }

    if (!isUser && !isAssistant) {
      if (DEBUG && i < 5) console.log(`ChatGPT Navigation: 元素 ${i} 角色识别失败`);
      return { item: null, userSeq, assistantSeq };
    }

    const shouldRecalcPreview = i >= fullLen - TAIL_RECALC_TURNS;
    let preview = previewCache.get(msgKey) || '';
    let block = null;
    if (!preview || shouldRecalcPreview) {
      try {
        if (isUser) {
          block = el.querySelector(
            '[data-message-author-role="user"] .whitespace-pre-wrap, [data-message-author-role="user"] div[data-message-content-part], [data-message-author-role="user"] .prose, div[data-message-author-role="user"] p, .text-message[data-author="user"]'
          );
        } else {
          block = el.querySelector(
            '.deep-research-result, .border-token-border-sharp .markdown, [data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] .prose, [data-message-author-role="assistant"] div[data-message-content-part], div[data-message-author-role="assistant"] p, .text-message[data-author="assistant"]'
          );
        }
      } catch {
        block = null;
      }
      preview = getTextPreview(block);
      if (preview) previewCache.set(msgKey, preview);
    }
    if (!preview) {
      if (DEBUG && i < 5) console.log(`ChatGPT Navigation: 元素 ${i} 无法提取预览文本`);
      return { item: null, userSeq, assistantSeq };
    }

    const seq = isUser ? ++userSeq : ++assistantSeq;
    const msgId = getTurnMessageId(el, block) || '';
    return {
      item: { id: el.id, key: msgKey, msgId, idx: i, role: isUser ? 'user' : 'assistant', preview, seq },
      userSeq,
      assistantSeq
    };
  }

  function buildIndex(turnsOverride) {
    const turns = turnsOverride || qsTurns();
    lastDomTurnCount = turns.length;
    lastDomFirstKey = turns.length ? getTurnKey(turns[0]) : '';
    lastDomLastKey = turns.length ? getTurnKey(turns[turns.length - 1]) : '';
    turnIdToPos.clear();
    if (!turns.length) {
      if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 没有找到任何对话元素');
      return [];
    }

    if (DEBUG) console.log(`ChatGPT Navigation: 开始分析 ${turns.length} 个对话元素`);

    let u = 0,
      a = 0;
    const list = [];
    for (let i = 0; i < turns.length; i++) {
      const res = analyzeTurnToIndexItem(turns[i], i, turns.length, u, a);
      u = res.userSeq;
      a = res.assistantSeq;
      if (res.item) list.push(res.item);
    }

    try {
      cachedTurnIds = turns.map((t) => String(t?.id || '')).filter(Boolean);
    } catch {
      cachedTurnIds = [];
    }

    if (DEBUG) console.log(`ChatGPT Navigation: 成功识别 ${list.length} 个对话 (用户: ${u}, 助手: ${a})`);
    lastUserSeq = u;
    lastAssistantSeq = a;
    return list;
  }

  function canAppendTurns(turns, prevCount) {
    const turnsArr = Array.isArray(turns) ? turns : [];
    const oldCount = Number(prevCount) || 0;
    if (!oldCount || turnsArr.length <= oldCount) return false;
    if (!Array.isArray(cachedTurnIds) || cachedTurnIds.length !== oldCount) return false;

    // Cheap structural checks: same DOM nodes at key positions => safe to treat as append-only.
    try {
      if (String(turnsArr[0]?.id || '') !== cachedTurnIds[0]) return false;
      if (String(turnsArr[oldCount - 1]?.id || '') !== cachedTurnIds[oldCount - 1]) return false;
      const mid = Math.floor(oldCount / 2);
      if (mid > 0 && String(turnsArr[mid]?.id || '') !== cachedTurnIds[mid]) return false;
    } catch {
      return false;
    }

    return true;
  }

  function appendTurnsToBaseIndex(turns, startIdx) {
    const t = Array.isArray(turns) ? turns : [];
    const start = Math.max(0, Number(startIdx) || 0);
    lastDomTurnCount = t.length;
    lastDomFirstKey = t.length ? getTurnKey(t[0]) : '';
    lastDomLastKey = t.length ? getTurnKey(t[t.length - 1]) : '';

    let u = Number(lastUserSeq) || 0;
    let a = Number(lastAssistantSeq) || 0;
    const base = Array.isArray(cacheBaseIndex) ? cacheBaseIndex : [];

    for (let i = start; i < t.length; i++) {
      const res = analyzeTurnToIndexItem(t[i], i, t.length, u, a);
      u = res.userSeq;
      a = res.assistantSeq;
      if (res.item) base.push(res.item);
    }

    try {
      cachedTurnIds = t.map((el) => String(el?.id || '')).filter(Boolean);
    } catch {
      cachedTurnIds = [];
    }

    // Update seq baselines for the next append.
    lastUserSeq = u;
    lastAssistantSeq = a;
    cacheBaseIndex = base;
    return base;
  }

  function createPanel() {
    // 样式去重：避免重复插入样式
    const styleId = 'cgpt-compact-nav-style';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
:root {
  --cgpt-nav-font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --cgpt-nav-radius: var(--token-radius-md, 6px);
  --cgpt-nav-radius-lg: var(--token-radius-lg, 8px);
  --cgpt-nav-panel-bg: var(--token-main-surface-tertiary, rgba(255,255,255,0.92));
  --cgpt-nav-panel-border: var(--token-border-subtle, rgba(15,23,42,0.08));
  --cgpt-nav-panel-shadow: var(--token-shadow-medium, 0 8px 24px rgba(15,23,42,0.12));
  --cgpt-nav-text-strong: var(--token-text-primary, rgba(17,24,39,0.92));
  --cgpt-nav-text-muted: var(--token-text-tertiary, rgba(71,85,105,0.78));
  --cgpt-nav-scrollbar-thumb: var(--token-scrollbar-thumb, rgba(15,23,42,0.18));
  --cgpt-nav-scrollbar-thumb-hover: var(--token-scrollbar-thumb-hover, rgba(15,23,42,0.3));
  --cgpt-nav-item-bg: var(--token-interactive-surface, rgba(255,255,255,0.85));
  --cgpt-nav-item-hover-bg: var(--token-interactive-surface-hover, rgba(255,255,255,0.95));
  --cgpt-nav-item-shadow: var(--token-shadow-small, 0 1px 2px rgba(15,23,42,0.08));
  --cgpt-nav-border-muted: var(--token-border-subtle, rgba(15,23,42,0.12));
  --cgpt-nav-accent: var(--token-brand-accent, #9333ea);
  --cgpt-nav-accent-subtle: var(--token-brand-accent-soft, rgba(147,51,234,0.12));
  --cgpt-nav-accent-strong: var(--token-brand-accent-strong, rgba(147,51,234,0.28));
  --cgpt-nav-arrow-color: var(--cgpt-nav-accent);
  --cgpt-nav-arrow-bg: var(--cgpt-nav-accent-subtle);
  --cgpt-nav-arrow-border: var(--cgpt-nav-accent-subtle);
  --cgpt-nav-arrow-hover-bg: var(--cgpt-nav-accent-strong);
  --cgpt-nav-arrow-hover-border: var(--cgpt-nav-accent-strong);
  --cgpt-nav-arrow-hover-text: var(--token-text-on-accent, #ffffff);
  --cgpt-nav-pin-color: var(--cgpt-nav-accent);
  --cgpt-nav-fav-color: var(--cgpt-nav-accent);
  --cgpt-nav-fav-bg: var(--cgpt-nav-accent-subtle);
  --cgpt-nav-fav-border: var(--cgpt-nav-accent-subtle);
  --cgpt-nav-positive: var(--token-text-positive, #00c896);
	  --cgpt-nav-info: var(--token-text-info, #2ea5ff);
	  --cgpt-nav-footer-bg: var(--token-interactive-surface, rgba(255,255,255,0.92));
	  --cgpt-nav-footer-hover: var(--token-interactive-surface-hover, rgba(15,23,42,0.08));
	  /* Performance: blur/backdrop-filter is expensive; default off. */
	  --cgpt-nav-backdrop: none;
	}

@media (prefers-color-scheme: dark) {
  :root {
    --cgpt-nav-panel-bg: var(--token-main-surface-tertiary, rgba(32,33,35,0.92));
    --cgpt-nav-panel-border: var(--token-border-subtle, rgba(148,163,184,0.18));
    --cgpt-nav-panel-shadow: var(--token-shadow-medium, 0 16px 32px rgba(0,0,0,0.4));
    --cgpt-nav-text-strong: var(--token-text-primary, rgba(226,232,240,0.92));
    --cgpt-nav-text-muted: var(--token-text-tertiary, rgba(148,163,184,0.78));
    --cgpt-nav-scrollbar-thumb: var(--token-scrollbar-thumb, rgba(148,163,184,0.2));
    --cgpt-nav-scrollbar-thumb-hover: var(--token-scrollbar-thumb-hover, rgba(148,163,184,0.35));
    --cgpt-nav-item-bg: var(--token-interactive-surface, rgba(46,48,56,0.84));
    --cgpt-nav-item-hover-bg: var(--token-interactive-surface-hover, rgba(63,65,74,0.92));
    --cgpt-nav-item-shadow: var(--token-shadow-small, 0 1px 3px rgba(0,0,0,0.4));
    --cgpt-nav-border-muted: var(--token-border-subtle, rgba(148,163,184,0.25));
    --cgpt-nav-footer-bg: var(--token-interactive-surface, rgba(49,51,60,0.9));
    --cgpt-nav-footer-hover: var(--token-interactive-surface-hover, rgba(255,255,255,0.12));
    --cgpt-nav-accent-subtle: var(--token-brand-accent-soft, rgba(147,51,234,0.2));
    --cgpt-nav-accent-strong: var(--token-brand-accent-strong, rgba(147,51,234,0.45));
    --cgpt-nav-arrow-color: #4ade80;
    --cgpt-nav-arrow-bg: rgba(74,222,128,0.2);
    --cgpt-nav-arrow-border: rgba(74,222,128,0.26);
    --cgpt-nav-arrow-hover-bg: rgba(74,222,128,0.35);
    --cgpt-nav-arrow-hover-border: rgba(74,222,128,0.4);
    --cgpt-nav-arrow-hover-text: var(--token-text-on-accent, #ffffff);
    --cgpt-nav-pin-color: #4ade80;
    --cgpt-nav-positive: #2ef5a8;
    --cgpt-nav-info: #4fc3ff;
    --cgpt-nav-fav-color: #4ade80;
    --cgpt-nav-fav-bg: rgba(74,222,128,0.2);
    --cgpt-nav-fav-border: rgba(74,222,128,0.26);
  }
}

/* Follow site theme when available (overrides OS prefers-color-scheme). */
html.dark #cgpt-compact-nav,
body.dark #cgpt-compact-nav,
html[data-theme='dark'] #cgpt-compact-nav,
body[data-theme='dark'] #cgpt-compact-nav,
html[data-color-mode='dark'] #cgpt-compact-nav,
body[data-color-mode='dark'] #cgpt-compact-nav,
html[data-color-scheme='dark'] #cgpt-compact-nav,
body[data-color-scheme='dark'] #cgpt-compact-nav {
  color-scheme: dark;
  --cgpt-nav-panel-bg: var(--token-main-surface-tertiary, rgba(32,33,35,0.92));
  --cgpt-nav-panel-border: var(--token-border-subtle, rgba(148,163,184,0.18));
  --cgpt-nav-panel-shadow: var(--token-shadow-medium, 0 16px 32px rgba(0,0,0,0.4));
  --cgpt-nav-text-strong: var(--token-text-primary, rgba(226,232,240,0.92));
  --cgpt-nav-text-muted: var(--token-text-tertiary, rgba(148,163,184,0.78));
  --cgpt-nav-scrollbar-thumb: var(--token-scrollbar-thumb, rgba(148,163,184,0.2));
  --cgpt-nav-scrollbar-thumb-hover: var(--token-scrollbar-thumb-hover, rgba(148,163,184,0.35));
  --cgpt-nav-item-bg: var(--token-interactive-surface, rgba(46,48,56,0.84));
  --cgpt-nav-item-hover-bg: var(--token-interactive-surface-hover, rgba(63,65,74,0.92));
  --cgpt-nav-item-shadow: var(--token-shadow-small, 0 1px 3px rgba(0,0,0,0.4));
  --cgpt-nav-border-muted: var(--token-border-subtle, rgba(148,163,184,0.25));
  --cgpt-nav-footer-bg: var(--token-interactive-surface, rgba(49,51,60,0.9));
  --cgpt-nav-footer-hover: var(--token-interactive-surface-hover, rgba(255,255,255,0.12));
  --cgpt-nav-accent-subtle: var(--token-brand-accent-soft, rgba(147,51,234,0.2));
  --cgpt-nav-accent-strong: var(--token-brand-accent-strong, rgba(147,51,234,0.45));
  --cgpt-nav-arrow-color: #4ade80;
  --cgpt-nav-arrow-bg: rgba(74,222,128,0.2);
  --cgpt-nav-arrow-border: rgba(74,222,128,0.26);
  --cgpt-nav-arrow-hover-bg: rgba(74,222,128,0.35);
  --cgpt-nav-arrow-hover-border: rgba(74,222,128,0.4);
  --cgpt-nav-arrow-hover-text: var(--token-text-on-accent, #ffffff);
  --cgpt-nav-pin-color: #4ade80;
  --cgpt-nav-positive: #2ef5a8;
  --cgpt-nav-info: #4fc3ff;
  --cgpt-nav-fav-color: #4ade80;
  --cgpt-nav-fav-bg: rgba(74,222,128,0.2);
  --cgpt-nav-fav-border: rgba(74,222,128,0.26);
}

html.light #cgpt-compact-nav,
body.light #cgpt-compact-nav,
html[data-theme='light'] #cgpt-compact-nav,
body[data-theme='light'] #cgpt-compact-nav,
html[data-color-mode='light'] #cgpt-compact-nav,
body[data-color-mode='light'] #cgpt-compact-nav,
html[data-color-scheme='light'] #cgpt-compact-nav,
body[data-color-scheme='light'] #cgpt-compact-nav {
  color-scheme: light;
  --cgpt-nav-panel-bg: var(--token-main-surface-tertiary, rgba(255,255,255,0.92));
  --cgpt-nav-panel-border: var(--token-border-subtle, rgba(15,23,42,0.08));
  --cgpt-nav-panel-shadow: var(--token-shadow-medium, 0 8px 24px rgba(15,23,42,0.12));
  --cgpt-nav-text-strong: var(--token-text-primary, rgba(17,24,39,0.92));
  --cgpt-nav-text-muted: var(--token-text-tertiary, rgba(71,85,105,0.78));
  --cgpt-nav-scrollbar-thumb: var(--token-scrollbar-thumb, rgba(15,23,42,0.18));
  --cgpt-nav-scrollbar-thumb-hover: var(--token-scrollbar-thumb-hover, rgba(15,23,42,0.3));
  --cgpt-nav-item-bg: var(--token-interactive-surface, rgba(255,255,255,0.85));
  --cgpt-nav-item-hover-bg: var(--token-interactive-surface-hover, rgba(255,255,255,0.95));
  --cgpt-nav-item-shadow: var(--token-shadow-small, 0 1px 2px rgba(15,23,42,0.08));
  --cgpt-nav-border-muted: var(--token-border-subtle, rgba(15,23,42,0.12));
  --cgpt-nav-footer-bg: var(--token-interactive-surface, rgba(255,255,255,0.92));
  --cgpt-nav-footer-hover: var(--token-interactive-surface-hover, rgba(15,23,42,0.08));
  --cgpt-nav-accent-subtle: var(--token-brand-accent-soft, rgba(147,51,234,0.12));
  --cgpt-nav-accent-strong: var(--token-brand-accent-strong, rgba(147,51,234,0.28));
  --cgpt-nav-arrow-color: var(--cgpt-nav-accent);
  --cgpt-nav-arrow-bg: var(--cgpt-nav-accent-subtle);
  --cgpt-nav-arrow-border: var(--cgpt-nav-accent-subtle);
  --cgpt-nav-arrow-hover-bg: var(--cgpt-nav-accent-strong);
  --cgpt-nav-arrow-hover-border: var(--cgpt-nav-accent-strong);
  --cgpt-nav-arrow-hover-text: var(--token-text-on-accent, #ffffff);
  --cgpt-nav-pin-color: var(--cgpt-nav-accent);
  --cgpt-nav-positive: var(--token-text-positive, #00c896);
  --cgpt-nav-info: var(--token-text-info, #2ea5ff);
  --cgpt-nav-fav-color: var(--cgpt-nav-accent);
  --cgpt-nav-fav-bg: var(--cgpt-nav-accent-subtle);
  --cgpt-nav-fav-border: var(--cgpt-nav-accent-subtle);
}

#cgpt-compact-nav { position: fixed; top: 60px; right: 10px; width: var(--cgpt-nav-width, auto); min-width: 80px; max-width: var(--cgpt-nav-width, 210px); z-index: 2147483647 !important; font-family: var(--cgpt-nav-font); font-size: 13px; pointer-events: auto; background: transparent; -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color: transparent; color: var(--cgpt-nav-text-strong); color-scheme: light dark; display:flex; flex-direction:column; align-items:stretch; box-sizing:border-box; --cgpt-nav-gutter: 0px; }
/* Tree 已集成到 QuickNav 顶部按钮：隐藏独立悬浮入口，避免打扰 */
#__aichat_chatgpt_message_tree_toggle_v1__ { display:none !important; }
#cgpt-compact-nav.cgpt-has-scrollbar { --cgpt-nav-gutter: clamp(4px, calc(var(--cgpt-nav-width, 210px) / 32), 8px); }
#cgpt-compact-nav * { -webkit-user-select:none; user-select:none; box-sizing:border-box; }
#cgpt-compact-nav > .compact-header,
#cgpt-compact-nav > .compact-list,
#cgpt-compact-nav > .compact-footer { width:100%; }
.compact-header { display:flex; align-items:center; justify-content:space-between; padding:4px 8px; margin-bottom:4px; background:var(--cgpt-nav-panel-bg); border-radius:var(--cgpt-nav-radius-lg); border:1px solid var(--cgpt-nav-panel-border); pointer-events:auto; cursor:move; box-shadow:var(--cgpt-nav-panel-shadow); min-width:100px; -webkit-backdrop-filter:var(--cgpt-nav-backdrop); backdrop-filter:var(--cgpt-nav-backdrop); width:100%; padding-inline-end: calc(8px + var(--cgpt-nav-gutter)); }
.compact-actions { display:flex; align-items:center; gap:4px; width:100%; }
.compact-title { font-size:11px; font-weight:600; color:var(--cgpt-nav-text-muted); display:flex; align-items:center; gap:3px; text-transform:uppercase; letter-spacing:.04em; }
.compact-title span { color:var(--cgpt-nav-text-strong); }
.compact-title svg { width:12px; height:12px; opacity:.55; }
.compact-toggle, .compact-refresh, .compact-lock, .compact-tree { background:var(--cgpt-nav-item-bg); border:1px solid var(--cgpt-nav-border-muted); color:var(--cgpt-nav-text-strong); cursor:pointer; width:clamp(20px, calc(var(--cgpt-nav-width, 210px) / 10), 26px); height:clamp(20px, calc(var(--cgpt-nav-width, 210px) / 10), 26px); display:flex; align-items:center; justify-content:center; border-radius:var(--cgpt-nav-radius); transition:background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease, opacity .18s ease, box-shadow .18s ease; font-weight:600; line-height:1; box-shadow:var(--cgpt-nav-item-shadow); -webkit-backdrop-filter:var(--cgpt-nav-backdrop); backdrop-filter:var(--cgpt-nav-backdrop); }
.compact-toggle { font-size:clamp(14px, calc(var(--cgpt-nav-width, 210px) / 14), 18px); }
.compact-refresh { font-size:clamp(12px, calc(var(--cgpt-nav-width, 210px) / 18), 14px); margin-left:4px; }
.compact-lock { font-size:clamp(12px, calc(var(--cgpt-nav-width, 210px) / 14), 16px); margin-left:4px; }
.compact-tree { font-size:clamp(12px, calc(var(--cgpt-nav-width, 210px) / 14), 16px); margin-left:4px; position:relative; }
.compact-toggle:hover, .compact-refresh:hover, .compact-lock:hover, .compact-tree:hover { border-color:var(--cgpt-nav-accent-subtle); color:var(--cgpt-nav-accent); box-shadow:0 4px 14px rgba(147,51,234,0.12); background:var(--cgpt-nav-item-hover-bg); }
.compact-tree:hover { border-color:color-mix(in srgb, var(--cgpt-nav-positive) 55%, transparent); color:var(--cgpt-nav-positive); box-shadow:0 4px 14px color-mix(in srgb, var(--cgpt-nav-positive) 22%, transparent); }
.compact-toggle:active, .compact-refresh:active, .compact-lock:active, .compact-tree:active { transform:scale(.94); }
.toggle-text { display:block; font-family:monospace; font-size:clamp(12px, calc(var(--cgpt-nav-width, 210px) / 14), 16px); }
  .compact-list { max-height:400px; overflow-y:auto; overflow-x:hidden; padding:0; pointer-events:auto; display:flex; flex-direction:column; gap:8px; scrollbar-width:thin; scrollbar-color:var(--cgpt-nav-scrollbar-thumb) transparent; width:100%; padding-right: var(--cgpt-nav-gutter); scrollbar-gutter: stable both-edges; }
.compact-list::-webkit-scrollbar { width:3px; }
.compact-list::-webkit-scrollbar-thumb { background:var(--cgpt-nav-scrollbar-thumb); border-radius:2px; }
.compact-list::-webkit-scrollbar-thumb:hover { background:var(--cgpt-nav-scrollbar-thumb-hover); }
.compact-item { display:block; padding:3px 8px; margin:0; border-radius:var(--cgpt-nav-radius); cursor:pointer; transition:all .16s ease; font-size:12px; line-height:1.4; min-height:20px; white-space:nowrap; overflow:hidden; /* 省略号交给 .compact-text */ pointer-events:auto; background:var(--cgpt-nav-item-bg); box-shadow:var(--cgpt-nav-item-shadow); width:100%; min-width:0; color:var(--cgpt-nav-text-strong); border:1px solid transparent; position:relative; padding-right: calc(26px + var(--cgpt-nav-gutter)); }
.compact-item:hover { background:var(--cgpt-nav-item-hover-bg); transform:translateX(2px); box-shadow:0 6px 16px rgba(15,23,42,0.12); }
.compact-item.user { color:var(--cgpt-nav-positive); border-color:var(--cgpt-nav-positive); border-color:color-mix(in srgb, var(--cgpt-nav-positive) 45%, transparent); }
.compact-item.assistant { color:var(--cgpt-nav-info); border-color:var(--cgpt-nav-info); border-color:color-mix(in srgb, var(--cgpt-nav-info) 45%, transparent); }
.compact-item.active { outline:2px solid var(--cgpt-nav-accent); background:var(--cgpt-nav-accent-subtle); box-shadow:0 0 0 1px var(--cgpt-nav-accent-strong) inset, 0 12px 30px rgba(147,51,234,0.15); border-color:var(--cgpt-nav-accent-subtle); transform:translateX(2px); }
.compact-item.pin { color:var(--cgpt-nav-pin-color); border-color:color-mix(in srgb, var(--cgpt-nav-pin-color) 45%, transparent); }
.pin-label { font-weight:600; margin-right:4px; }
.compact-text { display:inline-block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:bottom; }
.compact-number { display:inline-block; margin-right:4px; font-weight:600; color:var(--cgpt-nav-text-muted); font-size:11px; }
.compact-empty { padding:10px; text-align:center; color:var(--cgpt-nav-text-muted); font-size:11px; background:var(--cgpt-nav-panel-bg); border-radius:var(--cgpt-nav-radius-lg); pointer-events:auto; min-height:20px; line-height:1.4; border:1px dashed var(--cgpt-nav-border-muted); }

/* 收藏与锚点 */
  .compact-star { background:var(--cgpt-nav-item-bg); border:1px solid var(--cgpt-nav-border-muted); color:var(--cgpt-nav-text-strong); cursor:pointer; width:clamp(20px, calc(var(--cgpt-nav-width, 210px) / 10), 26px); height:clamp(20px, calc(var(--cgpt-nav-width, 210px) / 10), 26px); display:flex; align-items:center; justify-content:center; border-radius:var(--cgpt-nav-radius); transition:background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease, opacity .18s ease, box-shadow .18s ease; font-weight:600; line-height:1; box-shadow:var(--cgpt-nav-item-shadow); -webkit-backdrop-filter:var(--cgpt-nav-backdrop); backdrop-filter:var(--cgpt-nav-backdrop); font-size:clamp(12px, calc(var(--cgpt-nav-width, 210px) / 14), 16px); margin-left:4px; }
  .compact-star:hover { border-color:var(--cgpt-nav-fav-border); color:var(--cgpt-nav-fav-color); box-shadow:0 4px 14px rgba(147,51,234,0.12); background:var(--cgpt-nav-item-hover-bg); }
  .compact-star.active { background:var(--cgpt-nav-fav-bg); color:var(--cgpt-nav-fav-color); border-color:var(--cgpt-nav-fav-border); }
  .compact-lock.active { background:var(--cgpt-nav-arrow-bg); color:var(--cgpt-nav-arrow-color); border-color:var(--cgpt-nav-arrow-border); box-shadow:0 4px 14px color-mix(in srgb, var(--cgpt-nav-arrow-color) 26%, transparent); }
  .fav-toggle { position:absolute; right:calc(6px + var(--cgpt-nav-gutter)); top:2px; border:none; background:transparent; color:var(--cgpt-nav-text-muted); cursor:pointer; font-size:12px; line-height:1; padding:2px; opacity:.7; }
  .fav-toggle:hover { color:var(--cgpt-nav-fav-color); opacity:1; }
  .fav-toggle.active { color:var(--cgpt-nav-fav-color); opacity:1; }

  .compact-tree .tree-count {
    position:absolute;
    right:-6px;
    top:-6px;
    min-width:16px;
    height:16px;
    padding:0 4px;
    border-radius:999px;
    background:var(--cgpt-nav-accent);
    color:var(--token-text-on-accent, #fff);
    font-size:10px;
    line-height:16px;
    display:none;
    align-items:center;
    justify-content:center;
    box-shadow:0 6px 18px rgba(15,23,42,0.18);
  }
  .compact-tree[data-count]:not([data-count="0"]) .tree-count { display:inline-flex; }

  .compact-item.has-branches { padding-right: calc(58px + var(--cgpt-nav-gutter)); }
  .branch-badge {
    position:absolute;
    right:calc(22px + var(--cgpt-nav-gutter));
    top:2px;
    height:18px;
    padding:0 6px;
    border-radius:999px;
    border:1px solid color-mix(in srgb, var(--cgpt-nav-accent) 28%, transparent);
    background:color-mix(in srgb, var(--cgpt-nav-accent) 10%, transparent);
    color:var(--cgpt-nav-accent);
    font-size:10px;
    line-height:18px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    pointer-events:auto;
    opacity:.95;
  }
  .branch-badge:hover { background:color-mix(in srgb, var(--cgpt-nav-accent) 14%, transparent); }

	  #${TREE_TOOLTIP_ID}{
    position:fixed;
    z-index:2147483647;
    display:none;
    min-width:240px;
    max-width:min(360px, calc(100vw - 24px));
    background:var(--cgpt-nav-panel-bg);
    border:1px solid var(--cgpt-nav-panel-border);
    border-radius:var(--cgpt-nav-radius-lg);
	    box-shadow:var(--cgpt-nav-panel-shadow);
	    color:var(--cgpt-nav-text-strong);
	    padding:8px 10px;
	    -webkit-backdrop-filter:var(--cgpt-nav-backdrop);
	    backdrop-filter:var(--cgpt-nav-backdrop);
	  }
  #${TREE_TOOLTIP_ID}[data-open="1"]{ display:block; }
  #${TREE_TOOLTIP_ID} .hdr{ display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11px; font-weight:700; color:var(--cgpt-nav-text-muted); margin-bottom:8px; }
  #${TREE_TOOLTIP_ID} .rows{ display:flex; flex-direction:column; gap:6px; max-height:260px; overflow:auto; padding-right:2px; }
  #${TREE_TOOLTIP_ID} .rows::-webkit-scrollbar{ width:3px; }
  #${TREE_TOOLTIP_ID} .rows::-webkit-scrollbar-thumb{ background:var(--cgpt-nav-scrollbar-thumb); border-radius:2px; }
  #${TREE_TOOLTIP_ID} .row{ display:flex; align-items:center; gap:8px; width:100%; border:1px solid var(--cgpt-nav-border-muted); background:var(--cgpt-nav-item-bg); border-radius:var(--cgpt-nav-radius); padding:6px 8px; cursor:pointer; color:var(--cgpt-nav-text-strong); text-align:left; }
  #${TREE_TOOLTIP_ID} .row:hover{ background:var(--cgpt-nav-item-hover-bg); border-color:var(--cgpt-nav-accent-subtle); }
  #${TREE_TOOLTIP_ID} .role{ width:18px; height:18px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; background:var(--cgpt-nav-accent-subtle); color:var(--cgpt-nav-accent); flex:0 0 auto; }
  #${TREE_TOOLTIP_ID} .role.user{ background:color-mix(in srgb, var(--cgpt-nav-positive) 16%, transparent); color:var(--cgpt-nav-positive); }
  #${TREE_TOOLTIP_ID} .role.assistant{ background:color-mix(in srgb, var(--cgpt-nav-info) 16%, transparent); color:var(--cgpt-nav-info); }
  #${TREE_TOOLTIP_ID} .snippet{ flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
	  #${TREE_TOOLTIP_ID} .tag{ flex:0 0 auto; font-size:10px; padding:2px 6px; border-radius:999px; border:1px solid color-mix(in srgb, var(--cgpt-nav-positive) 40%, transparent); background:color-mix(in srgb, var(--cgpt-nav-positive) 14%, transparent); color:var(--cgpt-nav-positive); }
  #${TREE_TOOLTIP_ID} .foot{ margin-top:8px; display:flex; gap:6px; justify-content:flex-end; }
  #${TREE_TOOLTIP_ID} .btn{ border:1px solid var(--cgpt-nav-border-muted); background:var(--cgpt-nav-footer-bg); border-radius:var(--cgpt-nav-radius); padding:5px 8px; font-size:11px; cursor:pointer; color:var(--cgpt-nav-text-strong); box-shadow:var(--cgpt-nav-item-shadow); }
  #${TREE_TOOLTIP_ID} .btn:hover{ background:var(--cgpt-nav-footer-hover); }
/* 锚点占位（绝对定位，不再插入文本流） */
  .cgpt-pin-anchor { position:absolute; width:48px; height:48px; display:flex; align-items:center; justify-content:center; transform:translate(-50%,-50%); pointer-events:auto; user-select:none; -webkit-user-select:none; caret-color:transparent; cursor:default; z-index:2; }
  .cgpt-pin-anchor::after { content:'📌'; font-size:40px; line-height:1; opacity:.95; color:var(--cgpt-nav-pin-color); transition:opacity .18s ease, transform .18s ease; filter: drop-shadow(0 3px 3px rgba(0,0,0,0.5)); }
  .cgpt-pin-anchor:hover::after { opacity:1; transform:translateY(-1px); }
  .cgpt-pin-host { position: relative; }

/* 调整宽度手柄 */
.cgpt-resize-handle { position:absolute; left:-10px; top:0; bottom:0; width:14px; cursor:ew-resize; background:transparent; touch-action:none; }
.cgpt-resize-handle::after { content:''; position:absolute; left:6px; top:25%; bottom:25%; width:2px; background: var(--cgpt-nav-border-muted); border-radius:1px; opacity:.25; transition:opacity .2s ease; }
.cgpt-resize-handle:hover::after,
#cgpt-compact-nav.cgpt-resizing .cgpt-resize-handle::after { opacity:.6; }

/* 底部导航条 */
.compact-footer { margin-top:6px; display:flex; gap:clamp(3px, calc(var(--cgpt-nav-width, 210px) / 70), 6px); width:100%; padding-right: var(--cgpt-nav-gutter); }
.nav-btn { flex:1 1 25%; min-width:0; padding: clamp(4px, calc(var(--cgpt-nav-width, 210px) / 56), 6px) clamp(6px, calc(var(--cgpt-nav-width, 210px) / 35), 8px); font-size: clamp(12px, calc(var(--cgpt-nav-width, 210px) / 14), 14px); border-radius:var(--cgpt-nav-radius-lg); border:1px solid var(--cgpt-nav-border-muted); background:var(--cgpt-nav-footer-bg); cursor:pointer; box-shadow:var(--cgpt-nav-item-shadow); line-height:1; color:var(--cgpt-nav-text-strong); transition:background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease, box-shadow .18s ease; -webkit-backdrop-filter:var(--cgpt-nav-backdrop); backdrop-filter:var(--cgpt-nav-backdrop); }
.nav-btn:hover { background:var(--cgpt-nav-footer-hover); transform:translateY(-1px); }
.nav-btn:active { transform: translateY(1px); }

/* 上下箭头按钮 */
.nav-btn.arrow { background:var(--cgpt-nav-arrow-bg); border-color:var(--cgpt-nav-arrow-border); color:var(--cgpt-nav-arrow-color); font-weight:600; }
.nav-btn.arrow:hover { background:var(--cgpt-nav-arrow-hover-bg); border-color:var(--cgpt-nav-arrow-hover-border); color:var(--cgpt-nav-arrow-hover-text); box-shadow:0 8px 24px rgba(147,51,234,0.25); }

/* 极窄模式布局：(顶)[ ↑ ][ ↓ ](底) */
#cgpt-compact-nav.narrow .compact-footer {
  display: grid;
  grid-template-columns:
    minmax(12px, clamp(14px, calc(var(--cgpt-nav-width, 210px) / 12), 18px))
    1fr 1fr
    minmax(12px, clamp(14px, calc(var(--cgpt-nav-width, 210px) / 12), 18px));
  align-items: stretch;
  gap: clamp(3px, calc(var(--cgpt-nav-width, 210px) / 70), 6px);
}
#cgpt-compact-nav.narrow #cgpt-nav-top,
#cgpt-compact-nav.narrow #cgpt-nav-bottom {
  padding: clamp(4px, calc(var(--cgpt-nav-width, 210px) / 56), 6px) 4px;
  font-size: clamp(12px, calc(var(--cgpt-nav-width, 210px) / 18), 14px);
  justify-self: stretch;
  align-self: stretch;
}
#cgpt-compact-nav.narrow #cgpt-nav-prev,
#cgpt-compact-nav.narrow #cgpt-nav-next {
  width: auto;
  min-width: 34px;
}

/* 移动端 */
@media (max-width: 768px) {
  #cgpt-compact-nav { right:5px; }
  .compact-item { font-size:11px; padding:2px 5px; min-height:18px; }
  .nav-btn { padding:5px 6px; font-size:13px; }
}

.highlight-pulse{
  outline: 3px solid rgba(56,189,248,0.92);
  outline-offset: 4px;
  border-radius: 14px;
  animation: cgpt-turn-pulse 1600ms ease-in-out;
}
@keyframes cgpt-turn-pulse{
  0%{ box-shadow: 0 0 0 0 rgba(56,189,248,0.0), 0 0 0 0 rgba(56,189,248,0.0); }
  20%{ box-shadow: 0 0 0 10px rgba(56,189,248,0.20), 0 0 22px 6px rgba(56,189,248,0.18); }
  45%{ box-shadow: 0 0 0 2px rgba(56,189,248,0.08), 0 0 10px 3px rgba(56,189,248,0.08); }
  70%{ box-shadow: 0 0 0 12px rgba(56,189,248,0.22), 0 0 26px 8px rgba(56,189,248,0.20); }
  100%{ box-shadow: 0 0 0 0 rgba(56,189,248,0.0), 0 0 0 0 rgba(56,189,248,0.0); }
}
@media (prefers-reduced-motion: reduce){
  .highlight-pulse{ animation: none; }
}
`;
      document.head.appendChild(style);
      if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 已创建样式');
    } else {
      if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 样式已存在，跳过创建');
    }

    // 启动前清理多余面板（保险丝）
    const existingPanels = document.querySelectorAll('#cgpt-compact-nav');
    if (existingPanels.length > 0) {
      if (DEBUG || window.DEBUG_TEMP) console.log(`ChatGPT Navigation: 发现 ${existingPanels.length} 个已存在的面板，清理中...`);
      existingPanels.forEach((panel, index) => {
        if (index > 0) { // 保留第一个，删除其他
          panel.remove();
          if (DEBUG || window.DEBUG_TEMP) console.log(`ChatGPT Navigation: 已删除重复面板 ${index}`);
        }
      });
      // 如果已经有面板存在，直接返回现有的
      if (existingPanels.length > 0) {
        const existingNav = existingPanels[0];
        if (existingNav._ui) {
          if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 返回已存在的面板');
          return existingNav._ui;
        }
      }
    }

    const nav = document.createElement('div');
    nav.id = 'cgpt-compact-nav';
    nav.innerHTML = `
      <div class="compact-header">
        <div class="compact-actions">
          <button class="compact-toggle" type="button" title="收起/展开"><span class="toggle-text">−</span></button>
          <button class="compact-refresh" type="button" title="刷新对话列表">⟳</button>
          <button class="compact-lock" type="button" title="阻止新回复自动滚动">🔐</button>
          <button class="compact-star" type="button" title="仅显示收藏">☆</button>
          <button class="compact-tree" type="button" title="分支 / 对话树">树<span class="tree-count" aria-hidden="true"></span></button>
        </div>
      </div>
      <div class="compact-list" role="listbox" aria-label="对话项"></div>
      <div class="compact-footer">
        <button class="nav-btn" type="button" id="cgpt-nav-top" title="回到顶部">⤒</button>
        <button class="nav-btn arrow" type="button" id="cgpt-nav-prev" title="上一条（Cmd+↑ / Alt+↑）">↑</button>
        <button class="nav-btn arrow" type="button" id="cgpt-nav-next" title="下一条（Cmd+↓ / Alt+↓）">↓</button>
        <button class="nav-btn" type="button" id="cgpt-nav-bottom" title="回到底部">⤓</button>
      </div>
    `;
    // Apply saved position before attaching to DOM to avoid sync layout work during startup.
    applySavedPosition(nav);
    document.body.appendChild(nav);
    // 分支悬浮提示（固定定位，不受列表 overflow 影响）
    try {
      const oldTip = document.getElementById(TREE_TOOLTIP_ID);
      if (oldTip) oldTip.remove();
    } catch {}
    const branchTip = document.createElement('div');
    branchTip.id = TREE_TOOLTIP_ID;
    branchTip.setAttribute('data-open', '0');
    nav.appendChild(branchTip);
    let layout = {
      beginUserInteraction: () => {},
      endUserInteraction: () => {},
      notifyExternalPositionChange: () => {},
      scheduleEvaluation: () => {},
      captureManualPositions: () => {},
      destroy: () => {}
    };
    try {
      layout = createLayoutManager(nav) || layout;
    } catch (err) {
      if (DEBUG || window.DEBUG_TEMP) console.error('ChatGPT Navigation: 布局管理器初始化失败', err);
    }
    enableDrag(nav, {
      onDragStart: () => { try { layout.beginUserInteraction(); } catch {} },
      onDragEnd: () => { try { layout.endUserInteraction(); } catch {} }
    });
    enableResize(nav, layout);
    enableResponsiveClasses(nav);
    initCheckpoints(nav);
    applySavedWidth(nav);

    // 禁用面板内双击与文本选中
    nav.addEventListener('dblclick', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.cgpt-resize-handle')) return; // 允许双击把手重置宽度
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });
    nav.addEventListener('selectstart', (e) => { e.preventDefault(); }, { capture: true });
    nav.addEventListener('mousedown', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.cgpt-resize-handle')) return;
      if (e.detail > 1) e.preventDefault();
    }, { capture: true });

    const ui = { nav, layout, branchTip };
    nav._ui = ui;
    return ui;
  }

	  function createLayoutManager(nav) {
	    const state = {
	      nav,
	      destroyed: false,
	      userAdjusting: false,
	      followLeft: false,
	      followRight: false,
	      leftMargin: DEFAULT_FOLLOW_MARGIN,
	      rightMargin: DEFAULT_FOLLOW_MARGIN,
	      manual: { top: DEFAULT_NAV_TOP, left: null, right: DEFAULT_NAV_RIGHT },
	      leftEl: null,
	      rightEl: null,
	      leftObserver: null,
	      rightObserver: null,
	      resizeHandler: null,
      pendingEval: false,
      rafId: 0,
      rightRecheckTimer: 0,
      rightRecheckAttempts: 0,
      rightSavedPosition: null,
      rightFollowLoopId: 0,
      pollTimer: 0
	    };

	    function captureManualPositions() {
	      // Manual position should represent the last user-adjusted anchor.
	      // Avoid expensive layout reads (getBoundingClientRect/getComputedStyle) on hot paths.
	      if (state.followLeft || state.followRight) return;
	      try {
	        const toNum = (v) => {
	          const n = parseFloat(String(v || '').trim());
	          return Number.isFinite(n) ? n : null;
	        };
	
	        const prev = state.manual || {};
	        const topPx = toNum(nav.style.top);
	        const leftPx = nav.style.left && nav.style.left !== 'auto' ? toNum(nav.style.left) : null;
	        const rightPx = nav.style.right && nav.style.right !== 'auto' ? toNum(nav.style.right) : null;
	
	        const top = Number.isFinite(topPx) ? topPx : Number.isFinite(prev.top) ? prev.top : DEFAULT_NAV_TOP;
	        let left = Number.isFinite(leftPx) ? leftPx : null;
	        let right = Number.isFinite(rightPx) ? rightPx : null;
	
	        if (!Number.isFinite(left) && !Number.isFinite(right)) {
	          if (Number.isFinite(prev.left)) left = prev.left;
	          else right = Number.isFinite(prev.right) ? prev.right : DEFAULT_NAV_RIGHT;
	        }
	
	        state.manual = { top, left, right };
	      } catch {
	        state.manual = { top: DEFAULT_NAV_TOP, left: null, right: DEFAULT_NAV_RIGHT };
	      }
	    }
    captureManualPositions();

    function cancelPending() {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = 0;
      }
      state.pendingEval = false;
    }

    function scheduleEvaluation(reason) {
      if (state.destroyed || state.userAdjusting) return;
      if (state.pendingEval) return;
      state.pendingEval = true;
      state.rafId = requestAnimationFrame(() => {
        state.rafId = 0;
        state.pendingEval = false;
        try { evaluateNow(reason); } catch (err) { if (DEBUG || window.DEBUG_TEMP) console.error('ChatGPT Navigation layout evaluate error:', err); }
      });
    }

    function clearRightRecheck() {
      if (state.rightRecheckTimer) {
        clearTimeout(state.rightRecheckTimer);
        state.rightRecheckTimer = 0;
      }
      state.rightRecheckAttempts = 0;
    }

    function releaseRightFollow() {
      const saved = state.rightSavedPosition || state.manual || null;
      state.followRight = false;
      state.rightSavedPosition = null;
      stopRightFollowLoop();
      if (saved && Number.isFinite(saved.top)) {
        nav.style.top = `${Math.round(saved.top)}px`;
      }
      if (saved) {
        if (Number.isFinite(saved.right)) {
          nav.style.right = `${Math.round(saved.right)}px`;
          nav.style.left = 'auto';
        } else if (Number.isFinite(saved.left)) {
          nav.style.left = `${Math.round(saved.left)}px`;
          nav.style.right = 'auto';
        } else {
          nav.style.right = `${DEFAULT_FOLLOW_MARGIN}px`;
          nav.style.left = 'auto';
        }
      } else {
        nav.style.right = `${DEFAULT_FOLLOW_MARGIN}px`;
        nav.style.left = 'auto';
      }
      captureManualPositions();
    }

    function requestRightRecheck() {
      if (state.rightRecheckTimer) return;
      const attempts = Number.isFinite(state.rightRecheckAttempts) ? state.rightRecheckAttempts : 0;
      const clamped = attempts > 8 ? 8 : attempts;
      const delay = 180 + clamped * 70;
      state.rightRecheckAttempts = attempts + 1;
      state.rightRecheckTimer = window.setTimeout(() => {
        state.rightRecheckTimer = 0;
        scheduleEvaluation('right-recheck');
      }, delay);
    }

    function stopRightFollowLoop() {
      if (state.rightFollowLoopId) {
        cancelAnimationFrame(state.rightFollowLoopId);
        state.rightFollowLoopId = 0;
      }
    }

    function ensureRightFollowLoop() {
      if (state.rightFollowLoopId) return;
      state.rightFollowLoopId = requestAnimationFrame(() => {
        state.rightFollowLoopId = 0;
        scheduleEvaluation('right-loop');
      });
    }

    function beginUserInteraction() {
      if (state.destroyed) return;
      state.userAdjusting = true;
      state.followLeft = false;
      state.followRight = false;
      state.rightSavedPosition = null;
      stopRightFollowLoop();
      cancelPending();
    }

    function endUserInteraction() {
      if (state.destroyed) return;
      state.userAdjusting = false;
      captureManualPositions();
      persistNavPosition(nav);
      scheduleEvaluation('user-adjust');
    }

    function notifyExternalPositionChange() {
      if (state.destroyed) return;
      state.followLeft = false;
      state.followRight = false;
      state.rightSavedPosition = null;
      stopRightFollowLoop();
      captureManualPositions();
      scheduleEvaluation('external-position');
    }

    function updateObservedElements() {
      const leftEl = findLeftSidebarElement();
      if (leftEl !== state.leftEl) {
        if (state.leftObserver) {
          try { state.leftObserver.disconnect(); } catch {}
          state.leftObserver = null;
        }
        state.leftEl = leftEl;
        if (leftEl && window.ResizeObserver) {
          try {
            const ro = new ResizeObserver(() => scheduleEvaluation('left-resize'));
            ro.observe(leftEl);
            state.leftObserver = ro;
          } catch {}
        }
      }

      const rightEl = findRightPanelElement();
      if (rightEl !== state.rightEl) {
        if (state.rightObserver) {
          try { state.rightObserver.disconnect(); } catch {}
          state.rightObserver = null;
        }
        state.rightEl = rightEl;
        if (rightEl && window.ResizeObserver) {
          try {
            const ro = new ResizeObserver(() => scheduleEvaluation('right-resize'));
            ro.observe(rightEl);
            state.rightObserver = ro;
          } catch {}
        }
        if (rightEl) {
          state.rightRecheckAttempts = 0;
          requestRightRecheck();
        } else {
          clearRightRecheck();
        }
      }
    }

    function evaluateNow(reason) {
      if (state.destroyed || state.userAdjusting) return;
      updateObservedElements();

      const navRect = nav.getBoundingClientRect();
      try {
        const panel = state.rightEl ? getVisibleRect(state.rightEl, 0) : null;
        if (nav && nav.dataset) {
          nav.dataset.cgptLayout = JSON.stringify({
            t: Date.now(),
            reason,
            followRight: !!state.followRight,
            navRight: navRect ? navRect.right : null,
            panelLeft: panel ? panel.left : null
          });
        }
      } catch {}
      if (!navRect || !Number.isFinite(navRect.left) || navRect.width <= 0) return;

      const leftRect = state.leftEl ? getVisibleRect(state.leftEl, 0.5) : null;
      if (!state.followLeft && leftRect && overlapsLeft(navRect, leftRect)) {
        const gap = navRect.left - leftRect.right;
        state.leftMargin = Number.isFinite(gap) && gap > DEFAULT_FOLLOW_MARGIN ? gap : DEFAULT_FOLLOW_MARGIN;
        state.followLeft = true;
      }

      if (state.followLeft) {
        applyLeftFollow(leftRect, navRect);
        if (state.followRight) state.followRight = false;
        return;
      }

      const rightRect = state.rightEl ? getVisibleRect(state.rightEl, 0.5) : null;
      if (!state.rightEl) {
        if (state.followRight) releaseRightFollow();
        clearRightRecheck();
      } else if (!rightRect) {
        if (state.followRight) releaseRightFollow();
        requestRightRecheck();
      } else {
        clearRightRecheck();
      }
      if (!state.followRight && rightRect && overlapsRight(navRect, rightRect)) {
        if (!state.rightSavedPosition) {
          const manual = state.manual || {};
          state.rightSavedPosition = {
            top: Number.isFinite(manual.top) ? manual.top : navRect.top,
            left: Number.isFinite(manual.left) ? manual.left : null,
            right: Number.isFinite(manual.right) ? manual.right : null
          };
        }
        const gap = rightRect.left - navRect.right;
        state.rightMargin = Number.isFinite(gap) && gap > DEFAULT_FOLLOW_MARGIN ? gap : DEFAULT_FOLLOW_MARGIN;
        state.followRight = true;
      }

      if (state.followRight) {
        if (!state.rightEl || !rightRect) {
          releaseRightFollow();
        } else {
          applyRightFollow(rightRect, navRect);
        }
      }

      if (state.followRight) ensureRightFollowLoop();
      else stopRightFollowLoop();
    }

    function applyLeftFollow(panelRect, cachedNavRect) {
      const rect = cachedNavRect || nav.getBoundingClientRect();
      const navWidth = rect.width || nav.offsetWidth || 210;
      const margin = Number.isFinite(state.leftMargin) ? state.leftMargin : DEFAULT_FOLLOW_MARGIN;
      let targetLeft = margin;
      if (panelRect) targetLeft = panelRect.right + margin;
      const maxLeft = Math.max(0, window.innerWidth - navWidth - DEFAULT_FOLLOW_MARGIN);
      if (targetLeft > maxLeft) targetLeft = maxLeft;
      if (targetLeft < 0) targetLeft = 0;
      const currentLeft = parseFloat(nav.style.left || '');
      if (!Number.isFinite(currentLeft) || Math.abs(currentLeft - targetLeft) > 0.5) {
        nav.style.left = `${Math.round(targetLeft)}px`;
      }
      nav.style.right = 'auto';
      captureManualPositions();
    }

    function applyRightFollow(panelRect, cachedNavRect) {
      const rect = cachedNavRect || nav.getBoundingClientRect();
      const navWidth = rect.width || nav.offsetWidth || 210;
      const margin = Number.isFinite(state.rightMargin) ? state.rightMargin : DEFAULT_FOLLOW_MARGIN;
      let targetRight = margin;
      if (panelRect) {
        const panelWidth = window.innerWidth - panelRect.left;
        targetRight = panelWidth + margin;
      }
      const maxRight = Math.max(DEFAULT_FOLLOW_MARGIN, window.innerWidth - navWidth);
      if (targetRight > maxRight) targetRight = maxRight;
      if (targetRight < DEFAULT_FOLLOW_MARGIN) targetRight = DEFAULT_FOLLOW_MARGIN;
      const currentRight = parseFloat(nav.style.right || '');
      if (!Number.isFinite(currentRight) || Math.abs(currentRight - targetRight) > 0.5) {
        nav.style.right = `${Math.round(targetRight)}px`;
      }
      nav.style.left = 'auto';
      captureManualPositions();
    }

    function destroy() {
      state.destroyed = true;
      cancelPending();
      if (state.leftObserver) { try { state.leftObserver.disconnect(); } catch {} }
      if (state.rightObserver) { try { state.rightObserver.disconnect(); } catch {} }
      if (state.resizeHandler) { window.removeEventListener('resize', state.resizeHandler); }
      if (state.rightRecheckTimer) {
        clearTimeout(state.rightRecheckTimer);
        state.rightRecheckTimer = 0;
      }
      state.rightRecheckAttempts = 0;
      state.rightSavedPosition = null;
      if (state.rightFollowLoopId) {
        cancelAnimationFrame(state.rightFollowLoopId);
        state.rightFollowLoopId = 0;
      }
      if (state.pollTimer) {
        clearInterval(state.pollTimer);
        state.pollTimer = 0;
      }
      state.leftObserver = null;
      state.rightObserver = null;
    }

    // Layout changes are largely driven by:
    // - window resize
    // - sidebar/panel width changes (ResizeObserver on those elements)
    // We avoid a global `MutationObserver({subtree:true})` here because ChatGPT hydration can produce
    // extremely high mutation rates during first load, causing forced reflow spikes.
    // Instead, a low-frequency poll keeps element presence in sync (when they are mounted/unmounted).
    try {
      state.pollTimer = setInterval(() => {
        try {
          if (document.hidden) return;
          if (state.destroyed || state.userAdjusting) return;
          const leftNow = findLeftSidebarElement();
          const rightNow = findRightPanelElement();
          if (leftNow !== state.leftEl || rightNow !== state.rightEl) scheduleEvaluation('layout-poll');
        } catch {}
      }, 1200);
    } catch {}

    state.resizeHandler = () => scheduleEvaluation('resize');
    window.addEventListener('resize', state.resizeHandler, { passive: true });

    scheduleEvaluation('init');

    return {
      beginUserInteraction,
      endUserInteraction,
      notifyExternalPositionChange,
      scheduleEvaluation,
      captureManualPositions,
      destroy
    };
  }

  function getVisibleRect(el, minSize) {
    if (!el) return null;
    try {
      const rect = el.getBoundingClientRect();
      if (!rect) return null;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null;
      if ((rect.width || 0) <= minSize && (rect.height || 0) <= minSize) return null;
      return rect;
    } catch { return null; }
  }

  function findLeftSidebarElement() {
    const candidates = [
      document.getElementById('stage-slideover-sidebar'),
      document.querySelector('nav[aria-label="Chat history"]'),
      document.querySelector('[data-testid="chat-history"]')
    ];
    for (const el of candidates) {
      if (el) return el;
    }
    return null;
  }

  function findRightPanelElement() {
    return document.querySelector('section[data-testid="screen-threadFlyOut"]');
  }

  function overlapsLeft(navRect, panelRect) {
    return navRect.left < (panelRect.right - 4);
  }

  function overlapsRight(navRect, panelRect) {
    return navRect.right > (panelRect.left + 4);
  }

  function enableResponsiveClasses(nav) {
    try {
      const ro = new ResizeObserver((entries) => {
        const r = entries[0].contentRect;
        const w = r ? r.width : nav.getBoundingClientRect().width;
        nav.classList.toggle('narrow', w <= 160);
      });
      ro.observe(nav);
      nav._ro = ro;
    } catch {}
  }

  function enableDrag(nav, opts = {}) {
    const header = nav.querySelector('.compact-header');
    try {
      const api = globalThis.__aichat_ui_pos_drag_v1__;
      if (api && typeof api.enableRightTopDrag === 'function') {
        api.enableRightTopDrag(nav, header, opts || {});
        return;
      }
    } catch {}
    const onDragStart = typeof opts.onDragStart === 'function' ? opts.onDragStart : null;
    const onDragMove = typeof opts.onDragMove === 'function' ? opts.onDragMove : null;
    const onDragEnd = typeof opts.onDragEnd === 'function' ? opts.onDragEnd : null;
    const isInteractive = (target) => {
      try {
        if (!target || !target.closest) return false;
        return !!target.closest('button, a, input, textarea, select, [role=\"button\"]');
      } catch {
        return false;
      }
    };

    const DRAG_THRESHOLD_PX = 6;
    let tracking = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (!e || e.button !== 0) return;
      if (isInteractive(e.target)) return;

      tracking = true;
      dragStarted = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = nav.getBoundingClientRect();
      startTop = rect.top;
      startRight = Math.max(0, window.innerWidth - rect.right);
    });

    document.addEventListener('mousemove', (e) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragStarted) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        dragStarted = true;
        if (onDragStart) {
          try { onDragStart(e); } catch {}
        }
      }

      const newRight = Math.max(0, startRight - dx);
      nav.style.right = `${newRight}px`;
      nav.style.left = 'auto';
      nav.style.top = `${startTop + dy}px`;
      if (onDragMove) {
        try { onDragMove(e); } catch {}
      }
      // Avoid text selection while dragging.
      try { e.preventDefault(); } catch {}
    });

    document.addEventListener('mouseup', () => {
      if (!tracking) return;
      tracking = false;
      if (!dragStarted) return;
      dragStarted = false;
      if (onDragEnd) {
        try { onDragEnd(); } catch {}
      }
    });
  }

  // ===== 检查点与宽度调整 =====
  function getConvKey() { try { return location.pathname || 'root'; } catch { return 'root'; } }

  function loadCPSet() {
    try {
      const key = CP_KEY_PREFIX + getConvKey();
      const obj = JSON.parse(window.localStorage.getItem(key) || '{}');
      cpMap = new Map();
      for (const k of Object.keys(obj || {})) {
        const v = obj[k];
        if (v && typeof v === 'object' && v.anchorId && v.msgKey) {
          // 保留新增字段：frac 和 ctx，用于字符级精确还原
          cpMap.set(k, {
            msgKey: v.msgKey,
            anchorId: v.anchorId,
            created: v.created || Date.now(),
            frac: (typeof v.frac === 'number' ? v.frac : undefined),
            ctx: v.ctx || null
          });
        } else {
          // 兼容旧数据：仅时间戳，视为无 anchor 的过期项
          const ts = (typeof v === 'number' && isFinite(v)) ? v : Date.now();
          cpMap.set(k, { msgKey: k, anchorId: null, created: ts });
        }
      }
    } catch {
      cpMap = new Map();
    }
  }

  function saveCPSet() {
    try {
      const key = CP_KEY_PREFIX + getConvKey();
      const obj = {};
      cpMap.forEach((meta, k) => { obj[k] = meta; });
      window.localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }

  // ===== 收藏夹存取 =====
  function getFavKeys() { return FAV_KEY_PREFIX + getConvKey(); }
  function getFavFilterKey() { return FAV_FILTER_PREFIX + getConvKey(); }
  function loadFavSet() {
    try {
      const key = getFavKeys();
      const obj = JSON.parse(window.localStorage.getItem(key) || '{}');
      favSet = new Set();
      favMeta = new Map();
      for (const k of Object.keys(obj || {})) {
        const v = obj[k];
        const created = (v && typeof v === 'object' && typeof v.created === 'number') ? v.created : (typeof v === 'number' ? v : Date.now());
        favSet.add(k);
        favMeta.set(k, { created });
      }
    } catch { favSet = new Set(); favMeta = new Map(); }
  }
  function saveFavSet() {
    try {
      const key = getFavKeys();
      const obj = {};
      for (const k of favSet.values()) {
        const meta = favMeta.get(k) || { created: Date.now() };
        obj[k] = { created: meta.created };
      }
      window.localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }
  function loadFavFilterState() {
    try {
      const k = getFavFilterKey();
      filterFav = window.localStorage.getItem(k) === '1';
    } catch { filterFav = false; }
  }
  function saveFavFilterState() {
    try {
      const k = getFavFilterKey();
      window.localStorage.setItem(k, filterFav ? '1' : '0');
    } catch {}
  }
  function toggleFavorite(key) {
    if (!key) return;
    if (!favSet || !(favSet instanceof Set)) loadFavSet();
    if (favSet.has(key)) { favSet.delete(key); favMeta.delete(key); }
    else { favSet.add(key); favMeta.set(key, { created: Date.now() }); }
    saveFavSet();
  }

  // 过滤状态与收藏开关已移除

  function runCheckpointGC(saveAfter = false) {
    let removed = 0;
    const now = Date.now();
    for (const [k, v] of Array.from(cpMap.entries())) {
      const created = (v && typeof v === 'object') ? (v.created || 0) : (typeof v === 'number' ? v : 0);
      if (!created || (now - created) > CP_TTL_MS) {
        cpMap.delete(k);
        removed++;
      }
    }
    if (removed && saveAfter) saveCPSet();
    // 顺带移除已失效图钉的收藏
    let favRemoved = 0;
    try {
      if (favSet && favSet.size) {
        for (const key of Array.from(favSet.values())) {
          if (typeof key === 'string' && key.startsWith('pin-') && !cpMap.has(key)) {
            favSet.delete(key);
            favMeta.delete(key);
            favRemoved++;
          }
        }
        if (favRemoved) saveFavSet();
      }
    } catch {}
    return removed;
  }

  // 星标过滤按钮已移除

  function initCheckpoints(nav) {
    loadCPSet();
    runCheckpointGC(true);
    loadFavSet();
    loadFavFilterState();
    updateStarBtnState({ nav });
  }

  function applySavedWidth(nav) {
    try {
      const w = parseInt(window.localStorage.getItem(WIDTH_KEY) || '0', 10);
      if (w && w >= 100 && w <= 480) {
        nav.style.setProperty('--cgpt-nav-width', `${w}px`);
      } else {
        if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
          nav.style.setProperty('--cgpt-nav-width', '160px');
        } else {
          nav.style.setProperty('--cgpt-nav-width', '210px');
        }
      }
    } catch {}
  }

  function saveWidth(px) {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(px));
    } catch {}
  }

  function loadSavedPosition() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(POS_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return null;
      const toNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const top = toNum(raw.top);
      if (!Number.isFinite(top)) return null;
      const left = toNum(raw.left);
      const right = toNum(raw.right);
      const anchor = raw.anchor === 'right' ? 'right' : 'left';
      return {
        top,
        left: Number.isFinite(left) ? left : null,
        right: Number.isFinite(right) ? right : null,
        anchor
      };
    } catch { return null; }
  }

  function saveNavPosition(pos) {
    if (!pos || !Number.isFinite(pos.top)) return;
    const payload = {
      top: Math.max(0, pos.top),
      left: Number.isFinite(pos.left) ? Math.max(0, pos.left) : null,
      right: Number.isFinite(pos.right) ? Math.max(0, pos.right) : null,
      anchor: pos.anchor === 'right' ? 'right' : 'left',
      ts: Date.now()
    };
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(payload));
    } catch {}
  }

  function applySavedPosition(nav) {
    const saved = loadSavedPosition();
    if (!nav || !saved) return;
    // Avoid forced reflow on startup:
    // - `document.documentElement.clientHeight` can trigger a synchronous layout right after we append the panel.
    // - `window.innerHeight` / `visualViewport.height` are enough for clamping.
    const vh = Math.max(window.visualViewport?.height || 0, window.innerHeight || 0);
    const maxTop = Math.max(0, vh - 40);
    const top = Number.isFinite(saved.top) ? Math.min(Math.max(0, saved.top), maxTop || saved.top) : null;
    if (Number.isFinite(top)) nav.style.top = `${Math.round(top)}px`;
    const anchorRight = saved.anchor === 'right';
    if (anchorRight && Number.isFinite(saved.right)) {
      nav.style.right = `${Math.round(Math.max(0, saved.right))}px`;
      nav.style.left = 'auto';
    } else if (!anchorRight && Number.isFinite(saved.left)) {
      nav.style.left = `${Math.round(Math.max(0, saved.left))}px`;
      nav.style.right = 'auto';
    } else if (Number.isFinite(saved.right)) {
      nav.style.right = `${Math.round(Math.max(0, saved.right))}px`;
      nav.style.left = 'auto';
    } else if (Number.isFinite(saved.left)) {
      nav.style.left = `${Math.round(Math.max(0, saved.left))}px`;
      nav.style.right = 'auto';
    }
  }

  function persistNavPosition(nav) {
    if (!nav || !nav.isConnected) return;
    try {
      const api = globalThis.__aichat_ui_pos_drag_v1__;
      if (api && typeof api.posV2FromRect === 'function') {
        const rect = nav.getBoundingClientRect();
        const payload = api.posV2FromRect(rect, { splitAware: true, clampBottomPx: 40 });
        saveNavPosition(payload);
        return;
      }
    } catch {}
    try {
      const rect = nav.getBoundingClientRect();
      let vw = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
      const vh = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
      // If split view is open, QuickNav is visually shifted left via CSS.
      // Persist the position in the "main pane" coordinate system so it doesn't get saved as "pushed away".
      try {
        if (document.documentElement.classList.contains('qn-split-open')) {
          const raw = getComputedStyle(document.documentElement).getPropertyValue('--qn-split-right-width');
          const splitW = parseFloat(String(raw || '').trim());
          if (Number.isFinite(splitW) && splitW > 0) {
            const clamped = Math.min(Math.max(0, splitW), vw);
            vw = Math.max(0, vw - clamped);
          }
        }
      } catch {}
      const centerX = rect.left + (rect.width || 0) / 2;
      const anchorRight = vw && centerX >= vw / 2;
      const top = Number.isFinite(rect.top) ? rect.top : 0;
      const left = Math.max(0, rect.left);
      const right = Math.max(0, vw - rect.right);
      const maxTop = Math.max(0, vh - 40);
      const payload = {
        top: Math.min(Math.max(0, top), maxTop || top),
        left: anchorRight ? null : left,
        right: anchorRight ? right : null,
        anchor: anchorRight ? 'right' : 'left'
      };
      saveNavPosition(payload);
    } catch {}
  }

  function enableResize(nav, layout) {
    const handle = document.createElement('div');
    handle.className = 'cgpt-resize-handle';
    nav.appendChild(handle);

    let startX = 0; let startW = 0; let resizing = false; let startRight = 0;
    let activePointerId = null;
    const MIN_W = 100, MAX_W = 480;

    const onMove = (e) => {
      if (!resizing) return;
      const dx = e.clientX - startX; // 把手在左侧，向左拖动是负数 -> 增加宽度
      // 基于左侧把手：宽度随dx变化，同时保持右边界不动
      let w = startW - dx; // 向右拖动(正)减小宽度，向左拖动(负)增大宽度
      w = Math.max(MIN_W, Math.min(MAX_W, w));
      const newLeft = startRight - w; // 右边界固定在按下时的位置
      nav.style.left = `${Math.round(newLeft)}px`;
      nav.style.right = 'auto';
      nav.style.setProperty('--cgpt-nav-width', `${Math.round(w)}px`);
    };
    const onUp = (e) => {
      if (!resizing) return;
      resizing = false;
      nav.classList.remove('cgpt-resizing');
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      try {
        if (Number.isFinite(activePointerId)) handle.releasePointerCapture(activePointerId);
      } catch {}
      activePointerId = null;
      const comp = getComputedStyle(nav);
      const w = parseFloat((comp.getPropertyValue('--cgpt-nav-width') || '').replace('px','')) || nav.getBoundingClientRect().width;
      saveWidth(Math.round(w));
      if (layout && typeof layout.endUserInteraction === 'function') {
        try { layout.endUserInteraction(); } catch {}
      }
    };

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      resizing = true;
      startX = e.clientX;
      const rect = nav.getBoundingClientRect();
      startW = rect.width;
      startRight = rect.right;
      activePointerId = e.pointerId;
      nav.classList.add('cgpt-resizing');
      if (layout && typeof layout.beginUserInteraction === 'function') {
        try { layout.beginUserInteraction(); } catch {}
      }
      try { handle.setPointerCapture(activePointerId); } catch {}
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onUp, true);
    }, true);

    handle.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation();
      const def = (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ? 160 : 210;
      nav.style.setProperty('--cgpt-nav-width', `${def}px`);
      saveWidth(def);
      if (layout && typeof layout.notifyExternalPositionChange === 'function') {
        try { layout.notifyExternalPositionChange(); } catch {}
      }
    }, true);
  }

  let cacheIndex = [];
  // Base list without pins (used for incremental updates to avoid rebuilding the whole list on append).
  let cacheBaseIndex = [];
  let lastUserSeq = 0;
  let lastAssistantSeq = 0;

  function getBranchInfo(msgId) {
    try {
      const id = String(msgId || '');
      if (!id) return null;
      const nodes = treeSummary && typeof treeSummary === 'object' ? treeSummary.nodes : null;
      if (!nodes || typeof nodes !== 'object') return null;
      const node = nodes[id];
      if (!node || typeof node !== 'object') return null;
      const children = Array.isArray(node.children) ? node.children.filter((x) => typeof x === 'string' && x) : [];
      const count = Math.max(0, Number(node.childrenCount) || children.length);
      return { count, children, role: String(node.role || ''), snippet: String(node.snippet || '') };
    } catch {
      return null;
    }
  }

  function cssEscape(value) {
    const s = String(value || '');
    try {
      if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') return CSS.escape(s);
    } catch {}
    return s.replace(/["\\]/g, '\\$&');
  }

  function findTurnByMessageId(msgId) {
    const id = String(msgId || '');
    if (!id) return null;
    try {
      const msgEl = document.querySelector(`[data-message-id="${cssEscape(id)}"]`);
      const art = msgEl ? msgEl.closest('article') : null;
      if (art) return art;
    } catch {}
    try {
      const art = document.querySelector(`article[data-turn-id="${cssEscape(id)}"]`);
      if (art) return art;
    } catch {}
    return null;
  }

  function jumpToMessageId(msgId) {
    try {
      const el = findTurnByMessageId(msgId);
      if (!el) return false;
      if (!el.id) el.id = `cgpt-turn-msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      setActiveTurn(el.id);
      scrollToTurn(el);
      return true;
    } catch {
      return false;
    }
  }

  function hideBranchTooltip(ui) {
    try {
      const tip = ui?.branchTip || document.getElementById(TREE_TOOLTIP_ID);
      if (!tip) return;
      tip.setAttribute('data-open', '0');
      tip.textContent = '';
    } catch {}
  }

	  function renderBranchTooltip(ui, anchorEl) {
	    try {
	      if (!ui) return false;
	      const tip = ui.branchTip || document.getElementById(TREE_TOOLTIP_ID);
	      if (!tip) return false;
      if (!treeSummary || !treeSummary.nodes) return false;

	      const msgId = anchorEl?.dataset?.msgId ? String(anchorEl.dataset.msgId) : '';
	      const info = getBranchInfo(msgId);
	      if (!info || info.count <= 1) {
	        hideBranchTooltip(ui);
	        return false;
	      }

	      const currentChildMsgId = (() => {
	        try {
	          let found = '';
	          let foundCount = 0;
	          for (const cid of info.children) {
	            if (!cid || typeof cid !== 'string') continue;
	            if (findTurnByMessageId(cid)) {
	              found = cid;
	              foundCount++;
	              if (foundCount > 1) break;
	            }
	          }
	          if (foundCount === 1) return found;
	        } catch {}
	        try {
	          for (const cid of info.children) {
	            if (treePathSet && treePathSet.has(cid)) return cid;
	          }
	        } catch {}
	        return '';
	      })();

	      tip.textContent = '';
	      const hdr = document.createElement('div');
	      hdr.className = 'hdr';
	      const title = document.createElement('span');
      title.textContent = `分支 ${info.count}`;
      const hint = document.createElement('span');
      hint.textContent = '悬停预览';
      hdr.appendChild(title);
      hdr.appendChild(hint);
      tip.appendChild(hdr);

      const rows = document.createElement('div');
	      rows.className = 'rows';
	      const children = info.children.slice(0, 10);
	      for (const cid of children) {
	        const child = treeSummary.nodes?.[cid];
	        const role = child && typeof child === 'object' ? String(child.role || '') : '';
	        const snippet = child && typeof child === 'object' ? String(child.snippet || '') : '';

        const row = document.createElement('div');
        row.className = 'row';
        row.setAttribute('data-branch-msg-id', cid);

        const roleEl = document.createElement('span');
        roleEl.className = `role ${role}`.trim();
        roleEl.textContent = role ? role[0].toUpperCase() : '·';

        const textEl = document.createElement('span');
        textEl.className = 'snippet';
        textEl.textContent = snippet || '(empty)';

	        row.appendChild(roleEl);
	        row.appendChild(textEl);

	        const isCurrentChild = currentChildMsgId ? cid === currentChildMsgId : treePathSet && treePathSet.has(cid);
	        if (isCurrentChild) {
	          const tag = document.createElement('span');
	          tag.className = 'tag';
	          tag.textContent = '当前';
	          row.appendChild(tag);
	        }

        rows.appendChild(row);
      }

      if (info.children.length > children.length) {
        const more = document.createElement('div');
        more.className = 'row';
        more.setAttribute('data-branch-msg-id', '__open_tree__');
        const roleEl = document.createElement('span');
        roleEl.className = 'role';
        roleEl.textContent = '…';
        const textEl = document.createElement('span');
        textEl.className = 'snippet';
        textEl.textContent = `还有 ${info.children.length - children.length} 条分支，打开树查看`;
        more.appendChild(roleEl);
        more.appendChild(textEl);
        rows.appendChild(more);
      }

      tip.appendChild(rows);

      const foot = document.createElement('div');
      foot.className = 'foot';
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn';
      openBtn.setAttribute('data-action', 'open-tree');
      openBtn.textContent = '打开树';
      foot.appendChild(openBtn);
      tip.appendChild(foot);

      tip.setAttribute('data-open', '1');

      const a = anchorEl.getBoundingClientRect();
      tip.style.left = '0px';
      tip.style.top = '0px';

      const tRect = tip.getBoundingClientRect();
      const gap = 10;
      let left = a.left - tRect.width - gap;
      if (left < 8) left = a.right + gap;
      let top = a.top - 6;
      if (top + tRect.height > window.innerHeight - 8) top = window.innerHeight - tRect.height - 8;
      if (top < 8) top = 8;

      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      return true;
    } catch {
      return false;
    }
  }

  function bindBranchHover(ui) {
    try {
      const list = ui.nav.querySelector('.compact-list');
      if (!list || list._branchHoverBound) return;
      const tip = ui.branchTip || document.getElementById(TREE_TOOLTIP_ID);
      let activeRow = null;
      let hideTimer = 0;

      const scheduleHide = () => {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          hideTimer = 0;
          activeRow = null;
          hideBranchTooltip(ui);
        }, 160);
      };

      list.addEventListener('mouseover', (e) => {
        const row = e.target.closest('.compact-item.has-branches');
        if (!row || !list.contains(row)) return;
        if (row === activeRow) return;
        activeRow = row;
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
        renderBranchTooltip(ui, row);
      });
      list.addEventListener('mouseout', (e) => {
        const row = e.target.closest('.compact-item.has-branches');
        if (!row || !list.contains(row)) return;
        const to = e.relatedTarget;
        if (to && row.contains(to)) return;
        scheduleHide();
      });
      list.addEventListener('scroll', () => scheduleHide(), { passive: true });

      if (tip) {
        tip.addEventListener('mouseenter', () => {
          if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
        });
        tip.addEventListener('mouseleave', () => scheduleHide());
        tip.addEventListener('click', (e) => {
          const action = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
          if (action && action.getAttribute('data-action') === 'open-tree') {
            try { window.postMessage({ __quicknav: 1, type: TREE_BRIDGE_OPEN_PANEL }, '*'); } catch {}
            scheduleHide();
            return;
          }
          const row = e.target && e.target.closest ? e.target.closest('[data-branch-msg-id]') : null;
          if (!row) return;
          const targetId = String(row.getAttribute('data-branch-msg-id') || '');
          if (!targetId) return;
          if (targetId === '__open_tree__') {
            try { window.postMessage({ __quicknav: 1, type: TREE_BRIDGE_OPEN_PANEL }, '*'); } catch {}
            scheduleHide();
            return;
          }
          scheduleHide();
          if (jumpToMessageId(targetId)) return;
          void (async () => {
            const ok = await requestTreeNavigateToMessageId(targetId);
            if (!ok) {
              try { window.postMessage({ __quicknav: 1, type: TREE_BRIDGE_OPEN_PANEL }, '*'); } catch {}
            }
          })();
        });
      }

      list._branchHoverBound = true;
    } catch {}
  }

  function renderList(ui) {
    const list = ui.nav.querySelector('.compact-list');
    if (!list) return;
    const updateScrollbarState = () => {
      const hasScroll = list.scrollHeight > list.clientHeight + 1;
      list.classList.toggle('has-scroll', hasScroll);
      ui.nav.classList.toggle('cgpt-has-scrollbar', hasScroll);
    };
    const queueScrollbarState = () => {
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
      raf(() => updateScrollbarState());
    };
    const removed = runCheckpointGC(false);
    if (removed) { saveCPSet(); }
    // 清理已失效的收藏（不再存在的消息或图钉）
    const nextFull = cacheIndex;
    const validKeys = new Set(nextFull.map(i => i.key));
    const favRemoved = runFavoritesGC(false, validKeys);
    if (favRemoved) updateStarBtnState(ui);
    const next = filterFav ? nextFull.filter(it => favSet.has(it.key)) : nextFull;
    if (!next.length) {
      list.innerHTML = `<div class="compact-empty">${filterFav ? '暂无收藏' : '暂无对话'}</div>`;
      try {
        list._qnRenderState = { len: 0, lastKey: '', filterFav: !!filterFav };
      } catch {}
      queueScrollbarState();
      return;
    }

    const createRow = (item) => {
      const node = document.createElement('div');
      const fav = favSet.has(item.key);
      const msgId = typeof item.msgId === 'string' ? item.msgId : '';
      const branchInfo = item.role === 'pin' ? null : getBranchInfo(msgId);
      const branchCount = branchInfo && branchInfo.count > 1 ? branchInfo.count : 0;
      node.className = `compact-item ${item.role} ${fav ? 'has-fav' : ''} ${branchCount ? 'has-branches' : ''}`;
      node.dataset.id = item.id;
      node.dataset.key = item.key;
      if (msgId) node.dataset.msgId = msgId;
      if (item.role === 'pin') {
        node.classList.add('pin');
        node.title = 'Option+单击删除📌';
        node.innerHTML = `<span class="pin-label">${escapeHtml(item.preview)}</span><button class="fav-toggle ${fav ? 'active' : ''}" type="button" title="收藏/取消收藏">★</button>`;
      } else {
        const branchBadge = branchCount ? `<span class="branch-badge" title="分支：${branchCount}">[${branchCount}]</span>` : '';
        node.innerHTML = `<span class="compact-number">${item.idx + 1}.</span><span class="compact-text" title="${escapeAttr(item.preview)}">${escapeHtml(item.preview)}</span>${branchBadge}<button class="fav-toggle ${fav ? 'active' : ''}" type="button" title="收藏/取消收藏">★</button>`;
      }
      node.setAttribute('draggable', 'false');
      return node;
    };

    // Incremental render: when new turns append, avoid rebuilding the whole list (very expensive on long chats).
    try {
      const prev = list._qnRenderState && typeof list._qnRenderState === 'object' ? list._qnRenderState : null;
      const prevLen = prev && Number.isFinite(prev.len) ? prev.len : 0;
      const prevLastKey = prev ? String(prev.lastKey || '') : '';
      const prevFilterFav = prev ? !!prev.filterFav : false;

      const canAppend =
        !filterFav &&
        !prevFilterFav &&
        prevLen > 0 &&
        next.length > prevLen &&
        list.children.length === prevLen &&
        prevLastKey &&
        next[prevLen - 1] &&
        String(next[prevLen - 1].key || '') === prevLastKey &&
        list.lastElementChild &&
        String(list.lastElementChild.dataset?.key || '') === prevLastKey;

      if (canAppend) {
        const frag = document.createDocumentFragment();
        for (let i = prevLen; i < next.length; i++) frag.appendChild(createRow(next[i]));
        list.appendChild(frag);
        list._qnRenderState = { len: next.length, lastKey: String(next[next.length - 1].key || ''), filterFav: false };
        queueScrollbarState();
        scheduleActiveUpdateNow();
        return;
      }

      // Tail patch: on long chats, avoid full rebuild when only the last few previews change (e.g. after streaming).
      const canPatchTail =
        !filterFav &&
        !prevFilterFav &&
        prevLen > 0 &&
        next.length === prevLen &&
        list.children.length === prevLen &&
        prevLastKey &&
        list.lastElementChild &&
        String(list.lastElementChild.dataset?.key || '') === prevLastKey;

      if (canPatchTail) {
        const tail = Math.min(6, next.length);
        let ok = true;
        for (let i = next.length - tail; i < next.length; i++) {
          const row = list.children[i];
          if (!row || String(row.dataset?.key || '') !== String(next[i].key || '')) {
            ok = false;
            break;
          }
        }
        if (ok) {
          for (let i = next.length - tail; i < next.length; i++) {
            const item = next[i];
            const row = list.children[i];
            if (!row) continue;
            // Favorite state can change.
            const favBtn = row.querySelector('.fav-toggle');
            if (favBtn) favBtn.classList.toggle('active', favSet.has(item.key));

            if (item.role === 'pin') {
              const label = row.querySelector('.pin-label');
              if (label) label.textContent = item.preview || '📌';
              continue;
            }

            // Update preview + index label.
            const num = row.querySelector('.compact-number');
            if (num) num.textContent = `${item.idx + 1}.`;
            const txt = row.querySelector('.compact-text');
            if (txt) {
              const preview = String(item.preview || '');
              txt.textContent = preview;
              try {
                txt.setAttribute('title', preview);
              } catch {}
            }
          }
          list._qnRenderState = { len: next.length, lastKey: String(next[next.length - 1].key || ''), filterFav: false };
          queueScrollbarState();
          scheduleActiveUpdateNow();
          return;
        }
      }
    } catch {}

    // Full rebuild.
    list.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const item of next) frag.appendChild(createRow(item));
    list.appendChild(frag);
    try {
      list._qnRenderState = { len: next.length, lastKey: String(next[next.length - 1].key || ''), filterFav: !!filterFav };
    } catch {}

    queueScrollbarState();
    // 重新渲染会丢失 active class：根据 currentActiveId 立即恢复一次，避免闪烁/丢失高亮
    if (currentActiveId) {
      try { setActiveTurn(currentActiveId); } catch {}
    }
    if (!list._eventBound) {
      list.addEventListener('click', (e) => {
        // 行内收藏切换
        const star = e.target.closest('.fav-toggle');
        if (star) {
          e.stopPropagation();
          const row = star.closest('.compact-item');
          if (row) {
            const key = row.dataset.key;
            toggleFavorite(key);
            updateStarBtnState(ui);
            renderList(ui);
          }
          return;
        }
        const branchBadge = e.target.closest('.branch-badge');
        if (branchBadge) {
          e.stopPropagation();
          try { window.postMessage({ __quicknav: 1, type: TREE_BRIDGE_OPEN_PANEL }, '*'); } catch {}
          return;
        }
        const item = e.target.closest('.compact-item');
        if (!item) return;
        // 删除📌：Option+单击在📌行
        if (e.altKey && item.classList.contains('pin')) {
          const pinId = item.dataset.key;
          if (pinId && cpMap.has(pinId)) {
            const meta = cpMap.get(pinId);
            // 尝试移除旧锚点
            try { const old = document.getElementById(meta.anchorId); if (old) old.remove(); } catch {}
            cpMap.delete(pinId);
            if (favSet.has(pinId)) { favSet.delete(pinId); favMeta.delete(pinId); saveFavSet(); updateStarBtnState(ui); }
            saveCPSet();
            renderList(ui);
            return;
          }
        }
        const el = document.getElementById(item.dataset.id);
        if (el) {
          setActiveTurn(item.dataset.id);
          scrollToTurn(el);
        }
      });
      list._eventBound = true;
    }
    scheduleActiveUpdateNow();
  }

  function refreshIndex(ui, { soft = false, force = false } = {}) {
    const turns = qsTurns();
    const turnCount = turns.length;
    const firstKey = turnCount ? getTurnKey(turns[0]) : '';
    const lastKey = turnCount ? getTurnKey(turns[turnCount - 1]) : '';
    const prevDomCount = lastDomTurnCount;
    const unchanged = turnCount === lastDomTurnCount && firstKey === lastDomFirstKey && lastKey === lastDomLastKey;
    if (soft && !force && unchanged && cacheIndex.length && turnCount > 0) return false;

    const base = (() => {
      try {
        if (!force && canAppendTurns(turns, prevDomCount) && Array.isArray(cacheBaseIndex) && cacheBaseIndex.length) {
          return appendTurnsToBaseIndex(turns, prevDomCount);
        }
      } catch {}
      const full = buildIndex(turns);
      cacheBaseIndex = full;
      return full;
    })();
    const next = composeWithPins(base);
    if (DEBUG) console.log('ChatGPT Navigation: turns', next.length, '(含📌)');
    lastTurnCount = next.length;
    cacheIndex = next;
    renderList(ui);
    return true;
  }

  // 将📌插入到对应消息之后
  function composeWithPins(baseList) {
    try { if (!cpMap || !(cpMap instanceof Map)) loadCPSet(); } catch {}
    const pins = [];
    let needSave = false;
    cpMap.forEach((meta, pinId) => {
      if (!meta || typeof meta !== 'object') return;
      const msgKey = meta.msgKey;
      if (!msgKey) return;
      let anchorId = meta.anchorId;
      if (!anchorId || !document.getElementById(anchorId)) {
        anchorId = resolvePinAnchor(meta);
        if (anchorId) { meta.anchorId = anchorId; needSave = true; }
      }
      if (!anchorId) return; // 无法解析，跳过
      try { const ae = document.getElementById(anchorId); if (ae) ae.setAttribute('data-pin-id', pinId); } catch {}
      const created = meta.created || 0;
      pins.push({ pinId, msgKey, anchorId, created });
    });
    if (needSave) saveCPSet();

    // 按消息分组
    const byMsg = new Map();
    for (const p of pins) {
      if (!byMsg.has(p.msgKey)) byMsg.set(p.msgKey, []);
      byMsg.get(p.msgKey).push(p);
    }

    // 构建合成列表
    const combined = [];
    // Sort pins inside a message by DOM order (avoids layout reads).
    const compareDomOrder = (aId, bId) => {
      try {
        const aEl = document.getElementById(aId);
        const bEl = document.getElementById(bId);
        if (!aEl || !bEl || aEl === bEl) return 0;
        const pos = aEl.compareDocumentPosition(bEl);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      } catch {}
      return 0;
    };

    // 全局📌编号
    let pinSeq = 0;
    for (const item of baseList) {
      combined.push(item);
      const arr = byMsg.get(item.key);
      if (!arr || !arr.length) continue;
      arr.sort((a, b) => {
        const d = compareDomOrder(a.anchorId, b.anchorId);
        if (d) return d;
        return a.created - b.created;
      });
      for (const p of arr) {
        pinSeq++;
        combined.push({
          id: p.anchorId,
          key: p.pinId,
          parentKey: item.key,
          idx: item.idx, // 用父消息的 idx 保持相邻
          role: 'pin',
          preview: `📌${pinSeq}`,
          seq: pinSeq
        });
      }
    }
    return combined;
  }

  function resolvePinAnchor(meta) {
    try {
      const { msgKey, frac, ctx, rel } = meta;
      const turn = findTurnByKey(msgKey);
      if (!turn) return null;
      const host = ensurePinHost(turn);
      if (!host) return null;
      const id = meta.anchorId || `cgpt-pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
      const span = document.createElement('span');
      span.id = id;
      span.className = 'cgpt-pin-anchor';

      let rx = null, ry = null;
      if (rel && typeof rel.x === 'number' && typeof rel.y === 'number') {
        rx = rel.x; ry = rel.y;
      }
      if (!Number.isFinite(ry)) {
        const measureEl = getTurnMeasureEl(turn) || host;
        const mrect = measureEl.getBoundingClientRect();
        const f = Math.max(0, Math.min(1, typeof frac === 'number' ? frac : 0.0));
        ry = f;
        rx = rx ?? 0.5;
        // 若有 ctx，可尝试从路径找目标元素中心
        if (ctx && ctx.p != null) {
          const el = resolveElementPath(turn, ctx.p);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r && r.width && r.height) {
              const fx = Math.max(0, Math.min(1, (r.left + r.width * 0.5 - mrect.left) / Math.max(1, mrect.width)));
              const fy = Math.max(0, Math.min(1, (r.top + r.height * 0.5 - mrect.top) / Math.max(1, mrect.height)));
              rx = rx ?? fx;
              ry = Number.isFinite(ry) ? ry : fy;
            }
          }
        }
        meta.frac = ry;
        meta.rel = { x: rx ?? 0.5, y: ry };
      } else {
        meta.rel = { x: rx, y: ry };
      }

      span.style.left = `${Math.max(0, Math.min(100, (rx ?? 0.5) * 100))}%`;
      span.style.top = `${Math.max(0, Math.min(100, (ry ?? 0) * 100))}%`;
      host.appendChild(span);
      meta.anchorId = id;
      return id;
    } catch {}
    return null;
  }

  function findTurnByKey(key) {
    const turns = qsTurns();
    for (const t of turns) {
      const k = t.getAttribute('data-message-id') || t.getAttribute('data-testid') || t.id;
      if (k === key) return t;
    }
    return null;
  }

  function findNodeAtYWithin(root, y) {
    const blocks = root.querySelectorAll('p,li,pre,code,blockquote,h1,h2,h3,h4,h5,h6, .markdown > *, .prose > *');
    let best = null, bestDist = Infinity;
    for (const el of blocks) {
      if (!root.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r || r.height === 0) continue;
      const cy = r.top + r.height / 2;
      const d = Math.abs(cy - y);
      if (d < bestDist) { bestDist = d; best = el; }
    }
    return best;
  }

  function isScrollableY(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.overflowY !== 'auto' && s.overflowY !== 'scroll' && s.overflowY !== 'overlay') return false;
    return el.scrollHeight > el.clientHeight + 1;
  }

  function findClosestScrollContainer(start) {
    let el = start || null;
    while (el && el !== document.documentElement && el !== document.body) {
      if (isScrollableY(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function getScrollRoot(start) {
    const closest = findClosestScrollContainer(start);
    if (closest) return closest;
    const doc = document.scrollingElement || document.documentElement;
    const candidates = [
      document.querySelector('[data-testid="conversation-turns"]')?.parentElement,
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      doc
    ];
    for (const c of candidates) {
      if (!c) continue;
      if (isScrollableY(c)) return c;
    }
    return doc;
  }

  function getFixedHeaderHeight() {
    const h = document.querySelector('header, [data-testid="top-nav"]');
    if (!h) return 0;
    const r = h.getBoundingClientRect();
    return Math.max(0, r.height) + 12;
  }

  function findTurnAnchor(root) {
    if (!root) return null;
    if (root.classList && root.classList.contains('cgpt-pin-anchor')) return root;
    const selectors = [
      '[data-message-author-role] .whitespace-pre-wrap',
      '[data-message-content-part]',
      '.deep-research-result .markdown',
      '.border-token-border-sharp .markdown',
      '[data-message-author-role] .markdown',
      '[data-message-author-role] .prose',
      '.text-message',
      'article .markdown',
      '.prose p',
      'p','li','pre','blockquote'
    ];
    for (const s of selectors) {
      const n = root.querySelector(s);
      if (n && n.offsetParent !== null && n.offsetHeight > 0) return n;
    }
    return root;
  }

  function scrollToTopOfElement(targetEl, topMarginPx = 12, behavior = 'auto') {
    const el = targetEl && targetEl.nodeType === 1 ? targetEl : null;
    if (!el) return false;

    const margin = Math.max(0, Math.round(Number(topMarginPx) || 0));
    // Always use the chat scroller (avoid inner overflow elements like code blocks).
    const scroller = getChatScrollContainer() || (document.scrollingElement || document.documentElement);
    const isWin = isWindowScroller(scroller);
    const scrollBehavior = behavior === 'smooth' ? 'smooth' : 'auto';

    const setTop = (top) => {
      const value = Math.max(0, Math.round(Number(top) || 0));
      if (isWin) {
        try { window.scroll({ top: value, behavior: scrollBehavior }); return; } catch {}
        try { window.scrollTo({ top: value, behavior: scrollBehavior }); return; } catch {}
        try { window.scrollTo(0, value); } catch {}
        return;
      }

      try { scroller.scroll({ top: value, behavior: scrollBehavior }); return; } catch {}
      try { scroller.scrollTo({ top: value, behavior: scrollBehavior }); return; } catch {}
      try { scroller.scrollTop = value; } catch {}
    };

    try {
      const r = el.getBoundingClientRect();
      if (isWin) {
        const base = window.scrollY || getScrollPos(scroller);
        setTop(base + r.top - margin);
      } else {
        const sr = scroller.getBoundingClientRect();
        const base = getScrollPos(scroller);
        setTop(base + (r.top - sr.top) - margin);
      }
    } catch {
      try { el.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch {}
      return true;
    }

    return true;
  }

  function cancelNavJumpStabilizer() {
    try { navJumpStabilizerCtrl?.abort?.(); } catch {}
    navJumpStabilizerCtrl = null;
  }

  function computeDeltaToAlignTop(el, marginPx, scroller) {
    try {
      const margin = Math.max(0, Math.round(Number(marginPx) || 0));
      const win = isWindowScroller(scroller);
      const targetTop = win ? margin : ((scroller?.getBoundingClientRect?.().top || 0) + margin);
      const r = el.getBoundingClientRect();
      const top = Number(r?.top || 0);
      if (!Number.isFinite(top)) return 0;
      return top - targetTop;
    } catch {
      return 0;
    }
  }

  function startNavJumpStabilizer(targetEl, marginPx, opts = {}) {
    const el = targetEl && targetEl.nodeType === 1 ? targetEl : null;
    if (!el) return;

    cancelNavJumpStabilizer();

    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : { signal: { aborted: false }, abort: () => void 0 };
    navJumpStabilizerCtrl = ctrl;
    const signal = ctrl.signal;

    const startedAt = Date.now();
    const maxMsRaw = Number(opts.maxMs);
    const maxMs = Number.isFinite(maxMsRaw) ? Math.max(150, Math.min(2000, Math.round(maxMsRaw))) : 1200;
    const settleFrames = 8;
    const scroller = getChatScrollContainer() || (document.scrollingElement || document.documentElement);
    const win = isWindowScroller(scroller);

    const ignoreIfInNav = (t) => !!(t && t.closest && t.closest('#cgpt-compact-nav'));
    const cleanupFns = [];
    const cleanup = () => {
      cleanupFns.splice(0).forEach((fn) => { try { fn(); } catch {} });
      if (navJumpStabilizerCtrl === ctrl) navJumpStabilizerCtrl = null;
    };

    const abortFromUser = (e) => {
      try {
        if (ignoreIfInNav(e?.target)) return;
        ctrl.abort();
      } catch {
        // ignore
      }
    };

    const onKeyDown = (e) => {
      try {
        if (!e) return;
        if (ignoreIfInNav(e?.target)) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        const k = e.key;
        if (k === 'PageDown' || k === 'PageUp' || k === 'End' || k === 'Home' || k === 'ArrowDown' || k === 'ArrowUp' || k === ' ') abortFromUser(e);
      } catch {}
    };

    const onPointerDown = (e) => {
      try {
        if (!e) return;
        if (ignoreIfInNav(e?.target)) return;
        if (e.button !== 0) return;
        const sc = scrollLockScrollEl || getChatScrollContainer();
        if (isProbablyScrollbarGrab(e, sc)) abortFromUser(e);
      } catch {}
    };

    try {
      document.addEventListener('wheel', abortFromUser, { passive: true, capture: true });
      cleanupFns.push(() => document.removeEventListener('wheel', abortFromUser, true));
    } catch {}
    try {
      document.addEventListener('touchstart', abortFromUser, { passive: true, capture: true });
      document.addEventListener('touchmove', abortFromUser, { passive: true, capture: true });
      cleanupFns.push(() => document.removeEventListener('touchstart', abortFromUser, true));
      cleanupFns.push(() => document.removeEventListener('touchmove', abortFromUser, true));
    } catch {}
    try {
      document.addEventListener('keydown', onKeyDown, true);
      cleanupFns.push(() => document.removeEventListener('keydown', onKeyDown, true));
    } catch {}
    try {
      document.addEventListener('pointerdown', onPointerDown, true);
      cleanupFns.push(() => document.removeEventListener('pointerdown', onPointerDown, true));
    } catch {}

    try {
      signal?.addEventListener?.('abort', cleanup, { once: true });
      cleanupFns.push(() => { try { signal?.removeEventListener?.('abort', cleanup); } catch {} });
    } catch {}

    let stable = 0;
    const tick = () => {
      if (signal?.aborted) return;
      if ((Date.now() - startedAt) > maxMs) { cleanup(); return; }
      // If another jump starts, stop stabilizing this one.
      if (navJumpStabilizerCtrl !== ctrl) return;

      const delta = computeDeltaToAlignTop(el, marginPx, scroller);
      if (Math.abs(delta) > 3) {
        stable = 0;
        // Keep the allow window small: enough for this correction + the ensuing scroll event.
        allowNavScrollFor(260);
        if (win) {
          try { window.scrollBy({ top: delta, behavior: 'auto' }); }
          catch { try { window.scrollBy(0, delta); } catch {} }
        } else {
          try { scroller.scrollBy({ top: delta, behavior: 'auto' }); }
          catch { try { scroller.scrollBy(0, delta); } catch {} }
        }
      } else {
        stable++;
        if (stable >= settleFrames) { cleanup(); return; }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  function scrollToTurn(el) {
    const article = el?.closest?.('article') || el;
    const margin = Math.max(0, getFixedHeaderHeight());
    const behavior = scrollLockEnabled ? 'auto' : 'smooth';
    const allowMs = scrollLockEnabled ? 1800 : 1200;
    markNavScrollIntent(allowMs);
    const isPin = !!(el && el.classList && el.classList.contains('cgpt-pin-anchor'));
    const target = isPin ? el : article;
    // For normal turns, align the turn itself to the top. This keeps the highlight box fully visible
    // (otherwise the turn's header can sit above the viewport and the top border gets hidden).
    scrollToTopOfElement(target, margin, behavior);
    cancelNavJumpStabilizer();
    // ChatGPT can shift layout shortly after a jump (images, code blocks, virtualization).
    // Stabilize the alignment, but immediately stop if the user starts scrolling.
    if (behavior === 'auto') startNavJumpStabilizer(target, margin, { maxMs: 1200, seq: ++navJumpSeq });

    // Highlight the whole turn, not just the first paragraph (more obvious).
    try { document.querySelectorAll('article.highlight-pulse').forEach((n) => n.classList.remove('highlight-pulse')); } catch {}
    try { article.classList.add('highlight-pulse'); } catch {}
    setTimeout(() => { try { article.classList.remove('highlight-pulse'); } catch {} }, 2200);
    scheduleActiveUpdateNow();
  }

  function wirePanel(ui) {
    const toggleBtn = ui.nav.querySelector('.compact-toggle');
    const refreshBtn = ui.nav.querySelector('.compact-refresh');
    const starBtn = ui.nav.querySelector('.compact-star');
    const treeBtn = ui.nav.querySelector('.compact-tree');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const list = ui.nav.querySelector('.compact-list');
        const toggleText = toggleBtn.querySelector('.toggle-text');
        const isHidden = list.getAttribute('data-hidden') === '1';
        if (isHidden) {
          list.style.visibility = 'visible'; list.style.height = ''; list.style.overflow = '';
          list.setAttribute('data-hidden', '0'); toggleText.textContent = '−';
        } else {
          list.style.visibility = 'hidden'; list.style.height = '0'; list.style.overflow = 'hidden';
          list.setAttribute('data-hidden', '1'); toggleText.textContent = '+';
        }
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        if (e.shiftKey) {
          // Shift+点击 = 强制重新扫描
          if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 强制重新扫描 (清除缓存选择器)');
          TURN_SELECTOR = null; // 重置选择器缓存
          const originalBg = refreshBtn.style.background;
          const originalColor = refreshBtn.style.color;
          refreshBtn.style.background = 'var(--cgpt-nav-accent-subtle)';
          refreshBtn.style.color = 'var(--cgpt-nav-accent)';
          setTimeout(() => {
            refreshBtn.style.background = originalBg;
            refreshBtn.style.color = originalColor;
          }, 300);
        }
        scheduleRefresh(ui);
      });

      // 添加右键菜单功能
      refreshBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 右键强制重新扫描');
        TURN_SELECTOR = null;
        const originalBg = refreshBtn.style.background;
        const originalColor = refreshBtn.style.color;
        refreshBtn.style.background = 'var(--cgpt-nav-accent-subtle)';
        refreshBtn.style.color = 'var(--cgpt-nav-accent)';
        setTimeout(() => {
          refreshBtn.style.background = originalBg;
          refreshBtn.style.color = originalColor;
        }, 300);
        scheduleRefresh(ui);
      });

      // 更新提示文本
      refreshBtn.title = "刷新对话列表 (Shift+点击 或 右键 = 强制重新扫描)";
    }

    // 收藏过滤按钮
    if (starBtn) {
      starBtn.addEventListener('click', () => {
        filterFav = !filterFav;
        saveFavFilterState();
        updateStarBtnState(ui);
        renderList(ui);
      });
      updateStarBtnState(ui);
    }

    if (treeBtn) {
      treeBtn.addEventListener('click', (e) => {
        if (e && e.altKey) {
          try { window.postMessage({ __quicknav: 1, type: TREE_BRIDGE_REFRESH }, '*'); } catch {}
          scheduleTreeSummaryRequest(240);
          return;
        }
        try { window.postMessage({ __quicknav: 1, type: TREE_BRIDGE_TOGGLE_PANEL }, '*'); } catch {}
        // Lazy load: only request tree summary after user interacts with the tree button.
        scheduleTreeSummaryRequest(420);
      });
      updateTreeBtnState(ui);
    }

    bindBranchHover(ui);


    // 底部按钮
    const prevBtn = ui.nav.querySelector('#cgpt-nav-prev');
    const nextBtn = ui.nav.querySelector('#cgpt-nav-next');
    const topBtn  = ui.nav.querySelector('#cgpt-nav-top');
    const bottomBtn = ui.nav.querySelector('#cgpt-nav-bottom');

    if (prevBtn) prevBtn.addEventListener('click', () => jumpActiveBy(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => jumpActiveBy(+1));
    if (topBtn) topBtn.addEventListener('click', () => jumpToEdge('top'));
    if (bottomBtn) bottomBtn.addEventListener('click', () => jumpToEdge('bottom'));

    // 键盘事件只绑定一次：避免重复绑定（ChatGPT SPA 路由切换不会刷新页面）
    if (!__cgptKeydownHandler) {
      __cgptKeydownHandler = (e) => {
        const navEl = document.getElementById('cgpt-compact-nav');
        const currentUi = navEl && navEl._ui ? navEl._ui : null;
        if (!currentUi || !currentUi.nav) return;

        const t = e.target;
        const tag = t && t.tagName;
        const isEditable = t && ((tag === 'INPUT') || (tag === 'TEXTAREA') || (tag === 'SELECT') || (t.isContentEditable));

        // Cmd+↑ / Cmd+↓（Mac, metaKey）
        if (!isEditable && e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          jumpActiveBy(e.key === 'ArrowDown' ? +1 : -1);
          e.preventDefault();
          return;
        }

        // Alt+↑ / Alt+↓（Windows/Linux 常用）
        if (!isEditable && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          jumpActiveBy(e.key === 'ArrowDown' ? +1 : -1);
          e.preventDefault();
          return;
        }

        // Alt+/ 面板显隐
        if (e.altKey && e.key === '/') {
          const list = currentUi.nav.querySelector('.compact-list');
          if (!list) return;
          const toggleText = currentUi.nav.querySelector('.compact-toggle .toggle-text');
          const isHidden = list.getAttribute('data-hidden') === '1';
          if (isHidden) {
            list.style.visibility = 'visible';
            list.style.height = '';
            list.style.overflow = '';
            list.setAttribute('data-hidden', '0');
            if (toggleText) toggleText.textContent = '−';
          } else {
            list.style.visibility = 'hidden';
            list.style.height = '0';
            list.style.overflow = 'hidden';
            list.setAttribute('data-hidden', '1');
            if (toggleText) toggleText.textContent = '+';
          }
          e.preventDefault();
        }
      };

      document.addEventListener('keydown', __cgptKeydownHandler, { passive: false });
      window.__cgptKeysBound = true;
      if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 已绑定键盘事件');
    }
  }

  function updateStarBtnState(ui) {
    try {
      const starBtn = ui.nav.querySelector('.compact-star');
      if (!starBtn) return;
      const count = favSet ? favSet.size : 0;
      starBtn.classList.toggle('active', !!filterFav);
      starBtn.textContent = filterFav ? '★' : '☆';
      starBtn.title = (filterFav ? '显示全部（当前仅收藏）' : '仅显示收藏') + (count ? `（${count}）` : '');
    } catch {}
  }

  function updateTreeBtnState(ui) {
    try {
      const btn = ui.nav.querySelector('.compact-tree');
      if (!btn) return;
      const badge = btn.querySelector('.tree-count');
      const refreshHint = 'Option+点击=强制刷新';
      const hasSummary = !!(treeSummary && typeof treeSummary === 'object' && treeSummary.stats && typeof treeSummary.stats === 'object');
      if (!hasSummary) {
        try { btn.removeAttribute('data-count'); } catch {}
        if (badge) badge.textContent = '';
        if (!getConversationIdFromUrl()) {
          btn.title = '分支 / 对话树（仅对话页可用）';
        } else {
          btn.title = treeSummaryPendingReqId ? `分支 / 对话树（加载中…，${refreshHint}）` : `分支 / 对话树（点击加载，${refreshHint}）`;
        }
        return;
      }

      const count = Math.max(0, Number(treeSummary?.stats?.branchCount) || 0);
      btn.setAttribute('data-count', String(count));
      if (badge) badge.textContent = count ? String(count) : '';
      btn.title = count ? `分支 / 对话树（分支点：${count}，${refreshHint}）` : `分支 / 对话树（当前对话无分支，${refreshHint}）`;
    } catch {}
  }

  // 移除不存在于 validKeys 的收藏，返回移除数量
  function runFavoritesGC(saveAfter = false, validKeys = null, onlyPins = false) {
    try {
      if (!favSet || !(favSet instanceof Set) || favSet.size === 0) return 0;
      const valid = validKeys instanceof Set ? validKeys : new Set();
      // 如果没提供 validKeys，就尽量构造一个
      if (!(validKeys instanceof Set)) {
        try { const base = buildIndex(); base.forEach(i => valid.add(i.key)); } catch {}
        try { loadCPSet(); cpMap.forEach((_, pid) => valid.add(pid)); } catch {}
      }
      let removed = 0;
      const now = Date.now();
      for (const k of Array.from(favSet.values())) {
        if (onlyPins && !(typeof k === 'string' && k.startsWith('pin-'))) continue;
        const meta = favMeta.get(k) || { created: 0 };
        if (!valid.has(k) || !meta.created || (now - meta.created) > FAV_TTL_MS) { favSet.delete(k); favMeta.delete(k); removed++; }
      }
      if (removed && saveAfter) saveFavSet();
      return removed;
    } catch { return 0; }
  }

  // 改为不依赖缓存索引，单击立即滚动
  function jumpToEdge(which) {
    const listNow = cacheIndex;
    if (listNow && listNow.length) {
      const targetItem = which === 'top' ? listNow[0] : listNow[listNow.length - 1];
      const el = document.getElementById(targetItem.id) || qsTurns()[targetItem.idx] || null;
      if (el) {
        if (!el.id) el.id = `cgpt-turn-edge-${which}`;
        setActiveTurn(el.id);
        markNavScrollIntent(scrollLockEnabled ? 1600 : 800);
        scrollToTurn(el);
        return;
      }
    }
    const sc = getScrollRoot(document.body);
    const isWindow = (sc === document.documentElement || sc === document.body || sc === (document.scrollingElement || document.documentElement));
    const top = which === 'top' ? 0 : Math.max(0, (isWindow ? document.body.scrollHeight : sc.scrollHeight) - (isWindow ? window.innerHeight : sc.clientHeight));
    const behavior = scrollLockEnabled ? 'auto' : 'smooth';
    markNavScrollIntent(scrollLockEnabled ? 1600 : 800);
    if (isWindow) window.scrollTo({ top, behavior });
    else sc.scrollTo({ top, behavior });
    scheduleActiveUpdateNow();
  }

  function getTurnsContainer() {
    // Prefer shared ChatGPT core's turns root (usually narrow and stable).
    try {
      const core = globalThis.__aichat_chatgpt_core_v1__;
      if (core && typeof core.getTurnsRoot === 'function') {
        const root = core.getTurnsRoot();
        if (root && root !== document) return root;
      }
    } catch {}

    // Prefer the stable ChatGPT turns root.
    try {
      const root = document.querySelector('[data-testid="conversation-turns"]');
      if (root) return root;
    } catch {}

    const nodes = qsTurns();
    if (!nodes.length) {
      // No turns yet: don't attach a wide observer (it would cover the whole app and be very noisy).
      // `observeChat()` will bootstrap a narrow observer later when turns appear.
      return null;
    }

    // 找到包含所有对话节点的最小公共父元素
    let a = nodes[0];
    while (a) {
      if (nodes.every(n => a.contains(n))) {
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 对话容器:', a);
        return a;
      }
      a = a.parentElement;
    }

    return document.body;
  }

  function shouldObserveTurnsSubtree(target) {
    // If all turn articles are direct children of the target, avoid subtree observation
    // to ignore streaming text mutations (which can be extremely noisy).
    try {
      if (!target || typeof target.querySelectorAll !== 'function') return true;
      const deep = target.querySelectorAll('article[data-testid^="conversation-turn-"]').length;
      if (!deep) return true;
      const direct = target.querySelectorAll(':scope > article[data-testid^="conversation-turn-"]').length;
      if (direct && direct === deep) return false;
      // Common wrapper case (:scope > div > article). Still safe to observe `subtree:false`.
      const wrapped = target.querySelectorAll(':scope > * article[data-testid^="conversation-turn-"]').length;
      if (wrapped && wrapped === deep) return false;
    } catch {}
    return true;
  }

  function observeChat(ui) {
    const target = getTurnsContainer();
    if (ui._mo) {
      try { ui._mo.disconnect(); } catch {}
    }

    // Clear any bootstrap poller.
    try {
      if (ui._moBootstrapTimer) {
        clearInterval(ui._moBootstrapTimer);
        ui._moBootstrapTimer = 0;
      }
      ui._moBootstrapAttempts = 0;
    } catch {}

    // No turns yet (home/library/etc.): keep a short-lived poller to mount the observer later.
    if (!target) {
      ui._mo = null;
      ui._moTarget = null;

      try {
        if (!ui._moBootstrapTimer) {
          ui._moBootstrapTimer = setInterval(() => {
            try {
              if (document.hidden) return;
              const nav = document.getElementById('cgpt-compact-nav');
              if (!nav || !nav._ui) {
                clearInterval(ui._moBootstrapTimer);
                ui._moBootstrapTimer = 0;
                return;
              }
              ui._moBootstrapAttempts = (ui._moBootstrapAttempts || 0) + 1;
              // Stop after ~18s to avoid keeping a watcher on pages without turns.
              if (ui._moBootstrapAttempts > 30) {
                clearInterval(ui._moBootstrapTimer);
                ui._moBootstrapTimer = 0;
                return;
              }
              const next = getTurnsContainer();
              if (!next) return;
              clearInterval(ui._moBootstrapTimer);
              ui._moBootstrapTimer = 0;
              ui._moBootstrapAttempts = 0;
              observeChat(nav._ui);
              scheduleRefresh(nav._ui, { force: true });
            } catch {}
          }, 600);
        }
      } catch {}
    } else {
      const observeSubtree = shouldObserveTurnsSubtree(target);
      const mo = new MutationObserver((muts) => {
        const isLongChat = (lastDomTurnCount || 0) > 120;
        const hasStop = checkStreamingState(ui);
        const useSoft = isLongChat && !!hasStop;
        handleScrollLockMutations(muts, !!hasStop);

        // Avoid refreshing on every subtree mutation. We only need to rebuild the index
        // when turns/messages are structurally added/removed. Streaming text changes are
        // covered by `checkStreamingState()` (force refresh on stop-button transition).
        let turnsChanged = false;
        try {
          for (const mut of muts || []) {
            if (!mut || mut.type !== 'childList') continue;
            const added = mut.addedNodes;
            if (added && added.length) {
              for (const n of added) {
                if (isConversationTurnishNode(n)) {
                  turnsChanged = true;
                  break;
                }
              }
            }
            if (!turnsChanged) {
              const removed = mut.removedNodes;
              if (removed && removed.length) {
                for (const n of removed) {
                  if (isConversationTurnishNode(n)) {
                    turnsChanged = true;
                    break;
                  }
                }
              }
            }
            if (turnsChanged) break;
          }
        } catch {}

        if (!turnsChanged) return;

        const delay = isLongChat ? (hasStop ? 420 : 140) : 80;
        scheduleRefresh(ui, { delay, soft: useSoft });
      });

      mo.observe(target, {
        childList: true,
        subtree: observeSubtree
      });

      ui._mo = mo;
      ui._moTarget = target;
    }

    // 定期兜底（10s 一次，别等 30s）
    if (forceRefreshTimer) clearInterval(forceRefreshTimer);
    forceRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      const hasStop = !!checkStreamingState(ui, true);
      const count = qsTurns().length;
      const bootstrapRunning = !!ui._moBootstrapTimer;
      const targetGone = !!(ui._moTarget && !ui._moTarget.isConnected);
      if (targetGone) {
        observeChat(ui);
        scheduleRefresh(ui, { force: true });
        return;
      }
      // If we don't have a target yet (no turns rendered), let the bootstrap poller do its job.
      if (!ui._moTarget) {
        if (!bootstrapRunning) observeChat(ui);
        return;
      }
      // 某些切换会话场景：turn selector 暂时抓不到元素（一直 0），这里强制重绑+刷新，避免长期“暂无对话”
      if (!hasStop && count === 0 && lastDomTurnCount === 0) {
        observeChat(ui);
        scheduleRefresh(ui, { force: true });
        return;
      }
      if (!hasStop && count === lastDomTurnCount) return;
      scheduleRefresh(ui, { force: hasStop, soft: !hasStop && (lastDomTurnCount || 0) > 120 });
    }, 10000);
    ui._forceRefreshTimer = forceRefreshTimer;
  }

  // 防自动滚动（不改全局原型，避免与其他脚本冲突）
  function postScrollLockStateToMainWorld() {
    try {
      // Cross-world sync: MAIN-world guard reads this synchronously from DOM dataset.
      try { document.documentElement.dataset.quicknavScrollLockEnabled = scrollLockEnabled ? '1' : '0'; } catch {}
      window.postMessage({ __quicknav: 1, type: 'QUICKNAV_SCROLLLOCK_STATE', enabled: !!scrollLockEnabled }, '*');
    } catch {}
  }

  let __quicknavBaselinePostAt = 0;
  let __quicknavBaselineTop = -1;

  function postScrollLockBaselineToMainWorld(top, force = false) {
    try {
      const px = Math.max(0, Math.round(Number(top) || 0));
      // Cross-world baseline sync: MAIN-world guard reads this synchronously from DOM dataset.
      // This avoids a race where scroll-lock is toggled on and the guard still has an old baseline
      // for a brief moment (which can allow a "jump back" to the previous position).
      try { document.documentElement.dataset.quicknavScrollLockBaseline = String(px); } catch {}
      const now = Date.now();
      if (!force) {
        if (Math.abs(px - (__quicknavBaselineTop || 0)) < 2) return;
        if ((now - (__quicknavBaselinePostAt || 0)) < 180 && Math.abs(px - (__quicknavBaselineTop || 0)) < 6) return;
      }
      __quicknavBaselineTop = px;
      __quicknavBaselinePostAt = now;
      window.postMessage({ __quicknav: 1, type: 'QUICKNAV_SCROLLLOCK_BASELINE', top: px }, '*');
    } catch {}
  }

  function postScrollLockAllowToMainWorld(ms) {
    try {
      window.postMessage({ __quicknav: 1, type: 'QUICKNAV_SCROLLLOCK_ALLOW', ms: Number(ms) || 0 }, '*');
    } catch {}
  }

  // In MV3, many sites (ChatGPT/Gemini/etc.) drive autoscroll from the page JS (MAIN world).
  // Ask the extension service worker to inject the MAIN-world scroll guard, best-effort and throttled.
  let __quicknavMainGuardRequestedAt = 0;
  let __quicknavMainGuardReady = false;
  let __quicknavMainGuardRetryTimer = 0;
  function ensureMainWorldScrollGuard() {
    try {
      if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
      const now = Date.now();
      if (now - (__quicknavMainGuardRequestedAt || 0) < 2000) return;
      __quicknavMainGuardRequestedAt = now;
      chrome.runtime.sendMessage({ type: 'QUICKNAV_ENSURE_SCROLL_GUARD' }, () => void chrome.runtime?.lastError);
    } catch {}
  }

  function scheduleMainWorldScrollGuardRetry() {
    try {
      if (__quicknavMainGuardReady) return;
      if (!scrollLockEnabled) return;
      if (__quicknavMainGuardRetryTimer) return;
      __quicknavMainGuardRetryTimer = window.setTimeout(() => {
        __quicknavMainGuardRetryTimer = 0;
        if (__quicknavMainGuardReady) return;
        if (!scrollLockEnabled) return;
        ensureMainWorldScrollGuard();
        // If the guard gets (re)installed after we posted state, re-sync once more.
        postScrollLockStateToMainWorld();
        postScrollLockBaselineToMainWorld(scrollLockStablePos, true);
        scheduleMainWorldScrollGuardRetry();
      }, 2200);
    } catch {}
  }

  function bindMainWorldScrollGuardHandshake() {
    if (window.__quicknavScrollGuardHandshakeBound) return;
    window.__quicknavScrollGuardHandshakeBound = true;
    window.addEventListener('message', (e) => {
      try {
        if (!e || e.source !== window) return;
        const msg = e.data;
        if (!msg || typeof msg !== 'object' || msg.__quicknav !== 1) return;
        if (msg.type === 'QUICKNAV_SCROLL_GUARD_READY') {
          __quicknavMainGuardReady = true;
          if (__quicknavMainGuardRetryTimer) {
            clearTimeout(__quicknavMainGuardRetryTimer);
            __quicknavMainGuardRetryTimer = 0;
          }
          postScrollLockStateToMainWorld();
          if (scrollLockEnabled) postScrollLockBaselineToMainWorld(scrollLockStablePos, true);
        }
      } catch {}
    }, true);
  }

  function hasSavedScrollLockState() {
    try {
      return window.localStorage.getItem(SCROLL_LOCK_KEY) !== null;
    } catch {
      return true;
    }
  }

  function fetchDefaultScrollLockFromExtension() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return resolve(null);
        chrome.runtime.sendMessage({ type: 'QUICKNAV_GET_SETTINGS' }, (resp) => {
          const err = chrome.runtime?.lastError;
          if (err) return resolve(null);
          const v = resp?.settings?.scrollLockDefaults?.[QUICKNAV_SITE_ID];
          resolve(typeof v === 'boolean' ? v : null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function applyDefaultScrollLockFromExtension(ui) {
    fetchDefaultScrollLockFromExtension()
      .then((val) => {
        if (typeof val !== 'boolean') return;
        if (scrollLockUserTouched) return;
        if (hasSavedScrollLockState()) return;
        setScrollLockEnabled(val, ui);
      })
      .catch(() => void 0);
  }

  function loadScrollLockState() {
    try {
      const raw = window.localStorage.getItem(SCROLL_LOCK_KEY);
      if (raw === null) return true; // 默认开启
      return raw === '1';
    } catch { return false; }
  }

  function saveScrollLockState(on) {
    try {
      window.localStorage.setItem(SCROLL_LOCK_KEY, on ? '1' : '0');
    } catch {}
  }

  function isWindowScroller(el) {
    const doc = document.documentElement;
    return !el || el === window || el === document || el === document.body || el === doc || el === (document.scrollingElement || doc);
  }

	  function getChatScrollContainer() {
	    try {
	      // Hot path: reuse the last known scroll container when possible.
	      const cached = __cgptChatScrollContainer || scrollLockScrollEl;
	      if (cached && cached.nodeType === 1 && cached.isConnected) {
	        __cgptChatScrollContainer = cached;
	        return cached;
	      }
	    } catch {}

	    // ChatGPT's main chat scroller is typically the direct parent of <main id="main">.
	    // Grab it directly to avoid repeated ancestor scans and layout reads during hydration.
	    try {
	      const main = document.getElementById('main') || document.querySelector('main');
	      const parent = main && main.parentElement;
	      if (parent && parent.nodeType === 1 && parent.isConnected) {
	        const oy = getComputedStyle(parent).overflowY;
	        if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
	          __cgptChatScrollContainer = parent;
	          __cgptChatScrollContainerTs = Date.now();
	          return parent;
	        }
	      }
	    } catch {}

	    try {
	      const anchor =
	        document.querySelector(
	          'article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"], [data-message-id]'
	        ) ||
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        document.getElementById('main') ||
        document.body;

      // Walk up from a known message/root to find the first scrollable container.
	      let el = anchor;
	      for (let i = 0; i < 16 && el && el.nodeType === 1; i++) {
	        try {
	          // Check computed overflow first, then do layout reads only when needed.
	          const oy = getComputedStyle(el).overflowY;
	          if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
	            if (el.scrollHeight > el.clientHeight + 1) {
	              __cgptChatScrollContainer = el;
	              __cgptChatScrollContainerTs = Date.now();
	              return el;
	            }
	          }
	        } catch {}
	        el = el.parentElement;
	      }

      const fallback = getScrollRoot(anchor);
      __cgptChatScrollContainer = fallback;
      __cgptChatScrollContainerTs = Date.now();
      return fallback;
    } catch {
      const fallback = getScrollRoot(document.body);
      __cgptChatScrollContainer = fallback;
      __cgptChatScrollContainerTs = Date.now();
      return fallback;
    }
  }


  function getScrollPos(el) {
    if (!el) return window.scrollY || 0;
    if (isWindowScroller(el)) {
      const se = document.scrollingElement || document.documentElement;
      return se ? se.scrollTop : (window.scrollY || 0);
    }
    return el.scrollTop || 0;
  }

  function setScrollPos(el, top) {
    if (!el) return;
    navAllowScrollDepth = Math.max(0, (navAllowScrollDepth || 0) + 1);
    try {
      const value = Math.max(0, Math.round(top || 0));
      if (isWindowScroller(el)) {
        window.scrollTo({ top: value, behavior: 'auto' });
      } else {
        try { el.scrollTo({ top: value, behavior: 'auto' }); }
        catch { el.scrollTop = value; }
      }
    } finally {
      navAllowScrollDepth = Math.max(0, (navAllowScrollDepth || 0) - 1);
    }
  }

  function getNavAllowScrollUntil() {
    try {
      const v = document.documentElement?.dataset?.quicknavAllowScrollUntil;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  function bumpNavAllowScrollUntil(ms) {
    const dur = Math.max(0, Math.round(Number(ms) || 0));
    const nextUntil = Date.now() + dur;
    try {
      const docEl = document.documentElement;
      if (!docEl) return nextUntil;
      const prev = Number(docEl.dataset?.quicknavAllowScrollUntil || 0);
      const next = Math.max(Number.isFinite(prev) ? prev : 0, nextUntil);
      docEl.dataset.quicknavAllowScrollUntil = String(next);
      return next;
    } catch {
      return nextUntil;
    }
  }

  function isNavAllowScroll() {
    if ((navAllowScrollDepth || 0) > 0) return true;
    try {
      const until = getNavAllowScrollUntil();
      return !!until && Date.now() < until;
    } catch {
      return false;
    }
  }

  function handleScrollLockUserScroll(evt) {
    const sc = scrollLockScrollEl || getChatScrollContainer();
    if (!sc) return;
    const now = Date.now();
    const pos = getScrollPos(sc);
    const guardActive = scrollLockEnabled && now < scrollLockGuardUntil;
    // NOTE: In Chrome, scroll events caused by programmatic scrollTop/scrollTo are still `isTrusted === true`,
    // so we cannot use `evt.isTrusted` to infer user scroll. Instead, rely on explicit intent signals.
    void evt;
    const recentUserIntent = (now - (scrollLockLastUserIntentTs || 0)) <= SCROLL_LOCK_INTENT_MS || !!scrollLockPointerActive;
    const allowNav = isNavAllowScroll();

    // 用户主动滚动：先更新基准，避免被“回弹”误伤
    const userLikely = allowNav || recentUserIntent;
    if (userLikely) {
      scrollLockLastUserTs = now;
      scrollLockStablePos = pos;
      scrollLockLastPos = pos;
      postScrollLockBaselineToMainWorld(pos);
      return;
    }

    // 仅在“新回复变更窗口”内回弹，避免用户正常滚动抽搐
    const recentMutation = (now - (scrollLockLastMutationTs || 0)) <= 2500;
    const restoreWindow = guardActive || recentMutation;
    const UP_JUMP = Math.max(SCROLL_LOCK_DRIFT * 4, 64);
    if (!scrollLockRestoring && scrollLockEnabled && restoreWindow && !allowNav && !recentUserIntent) {
      if (pos > scrollLockStablePos + SCROLL_LOCK_DRIFT) {
        scrollLockRestoring = true;
        setScrollPos(sc, scrollLockStablePos);
        setTimeout(() => { scrollLockRestoring = false; }, 80);
        return;
      }
      // 某些站点在流式输出/重渲染时会把 scrollTop 复位到 0，属于程序行为而非用户滚动；这里需要“拉回”到用户基准位置
      if (pos < scrollLockStablePos - UP_JUMP) {
        scrollLockRestoring = true;
        setScrollPos(sc, scrollLockStablePos);
        setTimeout(() => { scrollLockRestoring = false; }, 120);
        return;
      }
    }

    if (scrollLockRestoring) return;
    scrollLockLastPos = pos;
  }

  function bindScrollLockTarget(scroller) {
    const target = isWindowScroller(scroller) ? window : scroller;
    if (scrollLockBoundTarget === target) return;
    if (scrollLockBoundTarget) {
      scrollLockBoundTarget.removeEventListener('scroll', handleScrollLockUserScroll, true);
      scrollLockBoundTarget.removeEventListener('scroll', handleScrollLockUserScroll, false);
    }
    scrollLockBoundTarget = target;
    try { target.addEventListener('scroll', handleScrollLockUserScroll, { passive: false, capture: true }); }
    catch { target.addEventListener('scroll', handleScrollLockUserScroll, true); }
  }

  function ensureScrollLockBindings() {
    const sc = getChatScrollContainer();
    if (!sc) return null;
    if (scrollLockScrollEl !== sc) {
      scrollLockScrollEl = sc;
      bindScrollLockTarget(sc);
    }
    if (!Number.isFinite(scrollLockLastPos) || scrollLockLastPos < 0) {
      scrollLockLastPos = getScrollPos(sc);
      scrollLockStablePos = scrollLockLastPos;
    }
    return sc;
  }

  function allowNavScrollFor(ms = 600) {
    const dur = Math.max(0, Math.round(Number(ms) || 0));
    navAllowScrollDepth = Math.max(0, (navAllowScrollDepth || 0) + 1);
    bumpNavAllowScrollUntil(dur);
    postScrollLockAllowToMainWorld(dur);
    setTimeout(() => {
      navAllowScrollDepth = Math.max(0, (navAllowScrollDepth || 0) - 1);
    }, dur);
  }

  function markNavScrollIntent(ms = 1200) {
    const now = Date.now();
    scrollLockLastUserIntentTs = now;
    scrollLockLastUserTs = now;
    allowNavScrollFor(ms);
    setTimeout(() => {
      if (!scrollLockEnabled) return;
      const sc = ensureScrollLockBindings();
      if (!sc) return;
      const pos = getScrollPos(sc);
      scrollLockStablePos = pos;
      scrollLockLastPos = pos;
    }, Math.min(ms, 900));
  }

  function armScrollLockGuard(ms = 2000) {
    if (!scrollLockEnabled) return;
    const sc = ensureScrollLockBindings();
    if (!sc) return;
    const now = Date.now();
    scrollLockLastMutationTs = now;
    scrollLockGuardUntil = now + ms;
    const pos = getScrollPos(sc);
    scrollLockLastPos = pos;
    scrollLockStablePos = pos;
  }

  function isConversationElement(el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      return !!el.closest(
        '[data-testid="conversation-turns"], [data-message-author-role], [data-message-id], [data-testid^="conversation-turn-"], [data-testid*="conversation-turn"], main, #main, [role="main"]'
      );
    } catch { return false; }
  }

  function isProbablyScrollbarGrab(e, scroller) {
    try {
      if (!e || !scroller || isWindowScroller(scroller)) return false;
      const rect = scroller.getBoundingClientRect();
      const x = e.clientX, y = e.clientY;
      if (!(x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return false;
      // 给滚动条留一个较宽的“可抓取区域”，避免 overlay scrollbar 抓不住
      return x >= rect.right - 26;
    } catch { return false; }
  }

  function bindScrollLockUserIntents() {
    if (window.__cgptScrollLockUserIntentsBound) return;
    window.__cgptScrollLockUserIntentsBound = true;

    const ignoreIfInNav = (t) => !!(t && t.closest && t.closest('#cgpt-compact-nav'));
    const isSendAction = (t) => {
      try {
        if (!t || !t.closest) return false;
        return !!t.closest(
          'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"], button[aria-label*="发送"], form button[type="submit"]'
        );
      } catch {
        return false;
      }
    };
    const isSidebarToggle = (t) => {
      try {
        if (!t || !t.closest) return false;
        return !!t.closest('button[aria-label*="sidebar"], button[aria-label*="Sidebar"], button[aria-label*="侧边栏"], button[data-testid*="sidebar"]');
      } catch {
        return false;
      }
    };
    const isCopyCode = (t) => {
      try {
        if (!t || !t.closest) return false;
        const btn = t.closest('button');
        if (!btn) return false;
        // Best-effort: copy buttons inside message/code areas.
        if (!btn.closest('pre, code, .markdown, .prose, [data-message-id]')) return false;
        const al = String(btn.getAttribute('aria-label') || '');
        const ti = String(btn.getAttribute('title') || '');
        const text = String(btn.textContent || '');
        const hay = `${al} ${ti} ${text}`.toLowerCase();
        return hay.includes('copy') || hay.includes('复制');
      } catch {
        return false;
      }
    };
    const mark = (e) => {
      if (!scrollLockEnabled) return;
      if (ignoreIfInNav(e?.target)) return;
      scrollLockLastUserIntentTs = Date.now();
    };

    // Non-scroll UI interactions that can trigger layout-driven scrollTop adjustments.
    // Treat them as "user intent" so the baseline follows naturally (no visible bounce).
    document.addEventListener(
      'pointerdown',
      (e) => {
        try {
          if (!scrollLockEnabled) return;
          if (ignoreIfInNav(e?.target)) return;
          if (isSendAction(e?.target)) return; // never allow send-triggered autoscroll to redefine baseline
          if (isSidebarToggle(e?.target) || isCopyCode(e?.target)) {
            scrollLockLastUserIntentTs = Date.now();
          }
        } catch {}
      },
      true
    );

    document.addEventListener('wheel', mark, { passive: true, capture: true });
    document.addEventListener('touchstart', mark, { passive: true, capture: true });
    document.addEventListener('touchmove', mark, { passive: true, capture: true });
    document.addEventListener('keydown', (e) => {
      try {
        if (!scrollLockEnabled) return;
        if (ignoreIfInNav(e?.target)) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        const k = e.key;
        if (k === 'PageDown' || k === 'PageUp' || k === 'End' || k === 'Home' || k === 'ArrowDown' || k === 'ArrowUp' || k === ' ') {
          scrollLockLastUserIntentTs = Date.now();
        }
      } catch {}
    }, true);

    document.addEventListener('pointerdown', (e) => {
      try {
        if (!scrollLockEnabled) return;
        if (ignoreIfInNav(e?.target)) return;
        if (e.button !== 0) return;
        const sc = scrollLockScrollEl || getChatScrollContainer();
        if (isProbablyScrollbarGrab(e, sc)) {
          scrollLockPointerActive = true;
          scrollLockLastUserIntentTs = Date.now();
        }
      } catch {}
    }, true);
    const clearPointer = () => { scrollLockPointerActive = false; };
    document.addEventListener('pointerup', clearPointer, true);
    document.addEventListener('pointercancel', clearPointer, true);
  }

  function shouldBlockScrollFor(target) {
    if (!scrollLockEnabled) return false;
    if (isNavAllowScroll()) return false;
    const sc = getChatScrollContainer();
    if (!sc) return false;
    if (scrollLockGuardUntil && Date.now() > scrollLockGuardUntil && (Date.now() - scrollLockLastUserTs) < 200) return false;
    if (isWindowScroller(sc)) return isConversationElement(target);
    try { return sc.contains(target); } catch { return isConversationElement(target); }
  }

  function getScrollTopFromArgs(args, current) {
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      const top = args[0].top ?? args[0].y;
      return Number.isFinite(top) ? top : current;
    }
    if (args.length >= 2) {
      const top = args[1];
      return Number.isFinite(top) ? top : current;
    }
    return current;
  }

  function getScrollDeltaFromArgs(args) {
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      return args[0].top ?? args[0].y ?? 0;
    }
    if (args.length >= 2) return args[1] ?? 0;
    return 0;
  }

  function shouldBlockScrollTop(scroller, nextTop) {
    if (!scrollLockEnabled || isNavAllowScroll()) return false;
    const sc = scroller || getChatScrollContainer();
    if (!sc) return false;
    const current = getScrollPos(sc);
    const targetTop = Number.isFinite(nextTop) ? nextTop : current;
    return targetTop > current + SCROLL_LOCK_DRIFT;
  }

  function shouldBlockWindowScroll(nextTop) {
    return shouldBlockScrollTop(null, nextTop);
  }

  function shouldBlockElementScroll(el, nextTop) {
    const sc = scrollLockScrollEl || getChatScrollContainer();
    if (!sc || sc !== el) return false;
    return shouldBlockScrollTop(sc, nextTop);
  }

  function installScrollGuards() {
    if (window.__cgptScrollGuardsInstalled) return;
    window.__cgptScrollGuardsInstalled = true;
    if (!ORIGINAL_SCROLL_INTO_VIEW) ORIGINAL_SCROLL_INTO_VIEW = Element.prototype.scrollIntoView;
    if (!ORIGINAL_SCROLL_TO) ORIGINAL_SCROLL_TO = window.scrollTo;
    if (!ORIGINAL_SCROLL_BY) ORIGINAL_SCROLL_BY = window.scrollBy;
    if (!ORIGINAL_ELEM_SCROLL_TO) ORIGINAL_ELEM_SCROLL_TO = Element.prototype.scrollTo;
    if (!ORIGINAL_ELEM_SCROLL_BY) ORIGINAL_ELEM_SCROLL_BY = Element.prototype.scrollBy;

    Element.prototype.scrollIntoView = function(options) {
      if (shouldBlockScrollFor(this)) return;
      return ORIGINAL_SCROLL_INTO_VIEW.call(this, options);
    };

    window.scrollTo = function(...args) {
      const targetTop = getScrollTopFromArgs(args, getScrollPos(getChatScrollContainer()));
      if (shouldBlockWindowScroll(targetTop)) return;
      return ORIGINAL_SCROLL_TO.apply(window, args);
    };

    window.scrollBy = function(...args) {
      if (scrollLockEnabled && !isNavAllowScroll()) {
        // 只关心向下滚
        const dy = getScrollDeltaFromArgs(args);
        if (dy > SCROLL_LOCK_DRIFT) return;
      }
      return ORIGINAL_SCROLL_BY.apply(window, args);
    };

    if (ORIGINAL_ELEM_SCROLL_TO) {
      Element.prototype.scrollTo = function(...args) {
        const current = getScrollPos(this);
        const targetTop = getScrollTopFromArgs(args, current);
        if (shouldBlockElementScroll(this, targetTop)) return;
        return ORIGINAL_ELEM_SCROLL_TO.apply(this, args);
      };
    }

    if (ORIGINAL_ELEM_SCROLL_BY) {
      Element.prototype.scrollBy = function(...args) {
        if (scrollLockEnabled && !isNavAllowScroll()) {
          const dy = getScrollDeltaFromArgs(args);
          if (dy > SCROLL_LOCK_DRIFT && shouldBlockElementScroll(this, getScrollPos(this) + dy)) return;
        }
        return ORIGINAL_ELEM_SCROLL_BY.apply(this, args);
      };
    }
  }

  function updateLockBtnState(nav) {
    const btn = nav?.querySelector('.compact-lock');
    if (!btn) return;
    btn.classList.toggle('active', scrollLockEnabled);
    btn.title = scrollLockEnabled ? '已锁定自动滚动（点击关闭）' : '阻止新回复自动滚动';
  }

  function setScrollLockEnabled(on, ui) {
    const next = !!on;
    if (scrollLockEnabled === next) return scrollLockEnabled;
    scrollLockEnabled = next;
    saveScrollLockState(scrollLockEnabled);
    if (!scrollLockEnabled && scrollLockRestoreTimer) {
      clearTimeout(scrollLockRestoreTimer);
      scrollLockRestoreTimer = 0;
    }
    const sc = ensureScrollLockBindings();
    scrollLockLastUserTs = Date.now();
    scrollLockLastPos = getScrollPos(sc || scrollLockScrollEl || getChatScrollContainer());
    scrollLockStablePos = scrollLockLastPos;
    updateLockBtnState(ui?.nav || document.getElementById('cgpt-compact-nav'));
    installScrollGuards();
    postScrollLockStateToMainWorld();
    if (scrollLockEnabled) postScrollLockBaselineToMainWorld(scrollLockStablePos, true);
    ensureMainWorldScrollGuard();
    if (scrollLockEnabled) scheduleMainWorldScrollGuardRetry();
    return scrollLockEnabled;
  }

  function initScrollLock(ui) {
    const hadSaved = hasSavedScrollLockState();
    scrollLockEnabled = loadScrollLockState();
    bindMainWorldScrollGuardHandshake();
    ensureMainWorldScrollGuard();
    scheduleMainWorldScrollGuardRetry();
    ensureScrollLockBindings();
    updateLockBtnState(ui.nav);
    bindScrollLockUserIntents();
    postScrollLockStateToMainWorld();
    if (scrollLockEnabled) postScrollLockBaselineToMainWorld(scrollLockStablePos, true);
    const lockBtn = ui.nav.querySelector('.compact-lock');
    if (lockBtn) {
      lockBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        scrollLockUserTouched = true;
        setScrollLockEnabled(!scrollLockEnabled, ui);
      });
    }
    if (!hadSaved) applyDefaultScrollLockFromExtension(ui);
    if (!window.__cgptScrollLockBound) {
      window.addEventListener('resize', () => { if (scrollLockEnabled) ensureScrollLockBindings(); }, { passive: true });
      window.__cgptScrollLockBound = true;
    }
    if (scrollLockEnabled) {
      scrollLockLastPos = getScrollPos(scrollLockScrollEl || getChatScrollContainer());
      scrollLockStablePos = scrollLockLastPos;
      scrollLockLastUserTs = Date.now();
      postScrollLockBaselineToMainWorld(scrollLockStablePos, true);
    }
    installScrollGuards();
  }

  function mutationTouchesConversation(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches('[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"], [data-message-id], [data-message-author-role]')) return true;
    if (node.matches('.markdown, .prose, article')) return true;
    if (node.querySelector?.('[data-message-author-role], [data-message-id], .markdown, .prose')) return true;
    return false;
  }

  function isConversationTurnishNode(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.matches('[data-message-id], [data-message-author-role], [data-testid^="conversation-turn-"], [data-testid*="conversation-turn"]')) return true;
      if (node.querySelector?.('[data-message-id], [data-message-author-role], [data-testid^="conversation-turn-"], [data-testid*="conversation-turn"]')) return true;
    } catch {}
    return false;
  }

  function isWithinConversation(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.closest?.('[data-testid="conversation-turns"], [data-message-author-role], [data-message-id], [data-testid^="conversation-turn-"], [data-testid*="conversation-turn"]')) return true;
    } catch {}
    return false;
  }

  function handleScrollLockMutations(muts, streaming = false) {
    if (!scrollLockEnabled || !muts || !muts.length) return;
    const isStreaming = !!streaming;
    let relevant = false;
    for (const mut of muts) {
      if (!mut) continue;
      // Ignore pure attribute flips (theme/layout toggles, copy button states, etc.) when not streaming.
      if (mut.type === 'attributes') continue;
      if (mut.type === 'characterData') {
        if (!isStreaming) continue;
        const t = mut.target && mut.target.nodeType === 3 ? mut.target.parentElement : mut.target;
        if (isWithinConversation(t)) { relevant = true; break; }
        continue;
      }
      if (mut.type !== 'childList') continue;

      // ChildList: only treat as relevant when actual turns/messages are added/removed.
      const added = mut.addedNodes;
      const removed = mut.removedNodes;
      if (added && added.length) {
        for (const n of added) {
          if (isConversationTurnishNode(n)) { relevant = true; break; }
        }
      }
      if (!relevant && removed && removed.length) {
        for (const n of removed) {
          if (isConversationTurnishNode(n)) { relevant = true; break; }
        }
      }
      if (relevant) break;
    }
    if (!relevant) return;
    scrollLockLastMutationTs = Date.now();
    scrollLockGuardUntil = scrollLockLastMutationTs + 2000; // 2s 内更积极地回弹
    const scroller = ensureScrollLockBindings();
    if (!scroller) return;
    const baseline = Number.isFinite(scrollLockStablePos) ? scrollLockStablePos : (Number.isFinite(scrollLockLastPos) ? scrollLockLastPos : getScrollPos(scroller));
    if (scrollLockRestoreTimer) clearTimeout(scrollLockRestoreTimer);
    scrollLockRestoreTimer = setTimeout(() => {
      scrollLockRestoreTimer = 0;
      if (!scrollLockEnabled) return;
      if (isNavAllowScroll()) return;
      const intentGap = Date.now() - (scrollLockLastUserIntentTs || 0);
      if (intentGap <= SCROLL_LOCK_INTENT_MS || scrollLockPointerActive) return;
      const sc = ensureScrollLockBindings();
      if (!sc) return;
      const current = getScrollPos(sc);
      const drift = current - baseline;
      const UP_JUMP = Math.max(SCROLL_LOCK_DRIFT * 4, 64);
      if ((drift > SCROLL_LOCK_DRIFT || drift < -UP_JUMP) && (Date.now() - scrollLockLastUserTs) > SCROLL_LOCK_IDLE_MS) {
        scrollLockRestoring = true;
        setScrollPos(sc, baseline);
        setTimeout(() => { scrollLockRestoring = false; }, 80);
      }
    }, 140);
  }

  function bindActiveTracking() {
    if (__cgptActiveTrackingBound) return;
    __cgptActiveTrackingBound = true;
    document.addEventListener('scroll', onAnyScroll, { passive: true, capture: true });
    window.addEventListener('resize', onAnyScroll, { passive: true });
    scheduleActiveUpdateNow();
  }

  // 绑定 Option+单击 添加📌
  function bindAltPin(ui) {
    if (window.__cgptPinBound) return;
    const getUi = () => {
      try {
        const nav = document.getElementById('cgpt-compact-nav');
        return nav && nav._ui ? nav._ui : null;
      } catch {
        return null;
      }
    };
    // 非 Alt 点击锚点：阻止默认，避免文本选中/抖动
    document.addEventListener('mousedown', (e) => {
      const anc = e.target && e.target.closest && e.target.closest('.cgpt-pin-anchor');
      if (anc && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    const onClick = (e) => {
      try {
        if (!e.altKey || e.button !== 0) return;
        const nt = e.target;
        if (!nt) return;
        if (nt.closest && nt.closest('#cgpt-compact-nav')) return; // 忽略在面板内
        // 若点击在内容中的📌图标上，则删除该📌
        const anc = nt.closest && nt.closest('.cgpt-pin-anchor');
        if (anc) {
          let pid = anc.getAttribute('data-pin-id') || '';
          if (!pid) {
            // 兼容：从 cpMap 反查
            for (const [k, v] of Array.from(cpMap.entries())) {
              if (v && v.anchorId === anc.id) { pid = k; break; }
            }
          }
	          if (pid && cpMap.has(pid)) {
	            cpMap.delete(pid);
	            try { anc.remove(); } catch {}
	            const currentUi = getUi();
	            if (favSet.has(pid)) {
	              favSet.delete(pid);
	              favMeta.delete(pid);
	              saveFavSet();
	              if (currentUi) updateStarBtnState(currentUi);
	            }
	            saveCPSet();
	            if (currentUi) scheduleRefresh(currentUi);
	            e.preventDefault();
	            e.stopPropagation();
	            return;
	          }
        }
        e.preventDefault();
        e.stopPropagation();
        // 找到所属消息
        const turn = findTurnFromNode(nt);
        if (!turn) return;
        const msgKey = turn.getAttribute('data-message-id') || turn.getAttribute('data-testid') || turn.id;
        if (!msgKey) return;

        // 在点击位置插入隐形锚点
        const anchor = insertPinAnchorAtPoint(e.clientX, e.clientY, turn);
        if (!anchor) return;

        // 保存📌
        const pinId = `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
        const meta = { msgKey, anchorId: anchor.id, frac: anchor.frac, created: Date.now(), ctx: anchor.ctx || null, rel: anchor.rel || null };
        try { if (!cpMap || !(cpMap instanceof Map)) loadCPSet(); } catch {}
        cpMap.set(pinId, meta);
        try { const ae = document.getElementById(meta.anchorId); if (ae) ae.setAttribute('data-pin-id', pinId); } catch {}
        // 新增：图钉默认自动加入收藏夹
        try {
          if (!favSet || !(favSet instanceof Set)) loadFavSet();
	          favSet.add(pinId);
	          favMeta.set(pinId, { created: Date.now() });
	          saveFavSet();
	          const currentUi = getUi();
	          if (currentUi) updateStarBtnState(currentUi);
	        } catch {}
	        saveCPSet();
	        runCheckpointGC(true);
	        {
	          const currentUi = getUi();
	          if (currentUi) scheduleRefresh(currentUi);
	        }
	      } catch (err) {
	        if (DEBUG || window.DEBUG_TEMP) console.error('添加📌失败:', err);
	      }
	    };
    document.addEventListener('click', onClick, true);
    window.__cgptPinBound = true;
  }

  function findTurnFromNode(node) {
    if (!node || node.nodeType !== 1) node = node?.parentElement || null;
    if (!node) return null;
    let el = node.closest('[data-cgpt-turn="1"]');
    if (el) return el;
    // 兜底：尝试已知选择器
    el = node.closest('article[data-testid^="conversation-turn-"],[data-testid^="conversation-turn-"],div[data-message-id],div[class*="group"][data-testid]');
    return el;
  }

  function caretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    const pos = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null;
    if (!pos) return null;
    const r = document.createRange();
    try { r.setStart(pos.offsetNode, pos.offset); } catch { return null; }
    r.collapse(true);
    return r;
  }

  function getElementsFromPoint(x, y) {
    const arr = (document.elementsFromPoint ? document.elementsFromPoint(x, y) : []);
    return Array.isArray(arr) ? arr : [];
  }

  function deepestDescendantAtPointWithin(turnEl, x, y) {
    const stack = getElementsFromPoint(x, y);
    for (const el of stack) {
      if (!el || el.id === 'cgpt-compact-nav') continue;
      if (turnEl.contains(el)) return el;
    }
    return null;
  }

  function findNearestCharRange(container, x, y) {
    try {
      const tw = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
          if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      let best = null; // {node, offset, dist}
      let nodesChecked = 0;
      const maxNodes = 200;

      while (tw.nextNode() && nodesChecked < maxNodes) {
        const node = tw.currentNode;
        nodesChecked++;
        const len = node.nodeValue.length;
        if (!len) continue;
        const step = Math.max(1, Math.ceil(len / 64)); // 粗取样
        const range = document.createRange();
        for (let i = 0; i < len; i += step) {
          range.setStart(node, i);
          range.setEnd(node, Math.min(len, i + 1));
          const r = range.getBoundingClientRect();
          if (!r || !isFinite(r.top) || r.width === 0 && r.height === 0) continue;
          const cx = Math.max(r.left, Math.min(x, r.right));
          const cy = Math.max(r.top, Math.min(y, r.bottom));
          const dx = cx - x, dy = cy - y;
          const dist = dx * dx + dy * dy;
          if (!best || dist < best.dist) best = { node, offset: i, dist };
        }
        // 精细化：在最佳附近逐字符搜索
        if (best && best.node === node) {
          const i0 = Math.max(0, best.offset - step * 2);
          const i1 = Math.min(len, best.offset + step * 2);
          for (let i = i0; i < i1; i++) {
            range.setStart(node, i);
            range.setEnd(node, Math.min(len, i + 1));
            const r = range.getBoundingClientRect();
            if (!r || (!r.width && !r.height)) continue;
            const cx = Math.max(r.left, Math.min(x, r.right));
            const cy = Math.max(r.top, Math.min(y, r.bottom));
            const dx = cx - x, dy = cy - y;
            const dist = dx * dx + dy * dy;
            if (dist < best.dist) best = { node, offset: i, dist };
          }
        }
      }

      if (best) {
        const res = document.createRange();
        res.setStart(best.node, best.offset);
        res.collapse(true);
        return res;
      }
    } catch {}
    return null;
  }

  function insertPinAnchorAtPoint(x, y, turnEl) {
    const id = `cgpt-pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
    const host = ensurePinHost(turnEl);
    if (!host) return null;
    const span = document.createElement('span');
    span.id = id;
    span.className = 'cgpt-pin-anchor';
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const rx = Math.max(0, Math.min(1, (x - rect.left) / w));
    const ry = Math.max(0, Math.min(1, (y - rect.top) / h));
    span.style.left = `${(rx * 100).toFixed(3)}%`;
    span.style.top = `${(ry * 100).toFixed(3)}%`;
    host.appendChild(span);
    return { id, frac: ry, ctx: null, rel: { x: rx, y: ry } };
  }

  function getTurnMeasureEl(turnEl) {
    const sels = [
      '[data-message-author-role] .markdown',
      '[data-message-author-role] .prose',
      '.deep-research-result .markdown',
      '.border-token-border-sharp .markdown',
      '.text-message',
      'article .markdown',
      '.prose',
      '[data-message-content-part]'
    ];
    let best = null, bestH = 0;
    for (const s of sels) {
      const list = turnEl.querySelectorAll(s);
      for (const el of list) {
        const h = el.getBoundingClientRect().height;
        if (h > bestH) { bestH = h; best = el; }
      }
    }
    return best || turnEl;
  }

  function ensurePinHost(turnEl) {
    const host = getTurnMeasureEl(turnEl) || turnEl;
    if (!host) return null;
    try {
      const cs = getComputedStyle(host);
      if (cs.position === 'static') {
        host.style.position = 'relative';
      }
    } catch {
      try { host.style.position = 'relative'; } catch {}
    }
    return host;
  }

  function extractRangeInfo(range, turnEl) {
    try {
      const start = range.startContainer;
      const parentEl = (start.nodeType === 3 ? start.parentElement : start.closest('*'));
      if (!parentEl || !turnEl.contains(parentEl)) return null;
      const path = buildElementPath(turnEl, parentEl);
      const offset = computeElementTextOffset(parentEl, range.startContainer, range.startOffset);
      return { p: path, o: offset };
    } catch { return null; }
  }

  function buildElementPath(base, el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== base) {
      const parent = cur.parentElement;
      if (!parent) break;
      let idx = 0, sib = cur;
      while ((sib = sib.previousElementSibling)) idx++;
      parts.push(idx);
      cur = parent;
    }
    parts.push(0); // base marker (not used)
    return parts.reverse().join('/');
  }

  function resolveElementPath(base, pathStr) {
    try {
      if (!pathStr) return null;
      const parts = pathStr.split('/').map(n => parseInt(n, 10));
      let cur = base;
      for (let i = 1; i < parts.length; i++) { // skip base marker
        const idx = parts[i];
        cur = cur && cur.children ? cur.children[idx] : null;
        if (!cur) return null;
      }
      return cur;
    } catch { return null; }
  }

  function computeElementTextOffset(el, node, off) {
    // compute char offset within element text by summing text node lengths before target node
    let total = 0;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (tw.nextNode()) {
      const n = tw.currentNode;
      if (n === node) { total += Math.max(0, Math.min(off, n.nodeValue ? n.nodeValue.length : 0)); break; }
      total += n.nodeValue ? n.nodeValue.length : 0;
    }
    return total;
  }

  function createCollapsedRangeAtElementOffset(el, ofs) {
    const r = document.createRange();
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let remain = Math.max(0, ofs);
    while (tw.nextNode()) {
      const n = tw.currentNode;
      const len = n.nodeValue ? n.nodeValue.length : 0;
      if (remain <= len) {
        r.setStart(n, remain);
        r.collapse(true);
        return r;
      }
      remain -= len;
    }
    // fallback: place at end of element
    r.selectNodeContents(el);
    r.collapse(false);
    return r;
  }

  function startBurstRefresh(ui, ms = 6000, step = 160) {
    const end = Date.now() + ms;
    const isLongChat = (lastDomTurnCount || 0) > 120;
    const tickStep = isLongChat ? Math.max(step, 700) : step;
    const tick = () => {
      const hasStop = !!checkStreamingState(ui, true);
      if (hasStop) {
        if (isLongChat) scheduleRefresh(ui, { delay: 260, soft: true });
        else scheduleRefresh(ui, { force: true });
        if (Date.now() < end) setTimeout(tick, tickStep);
        return;
      }
      scheduleRefresh(ui, { force: true });
    };
    tick();
  }

  function watchSendEvents(ui) {
    if (__cgptSendEventsBound) return;
    __cgptSendEventsBound = true;

    const getUi = () => {
      try {
        const nav = document.getElementById('cgpt-compact-nav');
        return nav && nav._ui ? nav._ui : null;
      } catch {
        return null;
      }
    };

    const isComposerForm = (form) => {
      try {
        if (!form || typeof form.querySelector !== 'function') return false;
        return !!(form.querySelector('#prompt-textarea') || form.querySelector('textarea[name="prompt-textarea"]'));
      } catch {
        return false;
      }
    };

    // 点击发送按钮
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-testid="send-button"]')) {
        const currentUi = getUi();
        if (!currentUi) return;
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 检测到发送按钮点击，启动突发刷新');
        armScrollLockGuard(2200);
        startBurstRefresh(currentUi);
      }
    }, true);

    // 表单提交（覆盖 Enter 发送等路径）
    document.addEventListener('submit', (e) => {
      const form = e?.target;
      if (!isComposerForm(form)) return;
      const currentUi = getUi();
      if (!currentUi) return;
      if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 检测到表单提交，启动突发刷新');
      armScrollLockGuard(2200);
      startBurstRefresh(currentUi);
    }, true);

    // ⌘/Ctrl + Enter 发送
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (!t) return;
      const isTextarea = t.tagName === 'TEXTAREA' || t.isContentEditable;
      if (isTextarea && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const currentUi = getUi();
        if (!currentUi) return;
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 检测到快捷键发送，启动突发刷新');
        armScrollLockGuard(2200);
        startBurstRefresh(currentUi);
      }
    }, true);

    // 回到前台时强制跑一次
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        try { detectUrlChange(); } catch {}
        const currentUi = getUi();
        if (!currentUi) return;
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 页面重新可见，强制刷新');
        scheduleRefresh(currentUi, { force: true });
      }
    });
  }

  function onAnyScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      lastScrollTs = Date.now();
      scheduleActiveUpdateDebounced();
      scrollTicking = false;
    });
  }

  function scheduleActiveUpdateDebounced(delay = 90) {
    if (activeUpdateTimer) clearTimeout(activeUpdateTimer);
    activeUpdateTimer = setTimeout(() => {
      activeUpdateTimer = 0;
      updateActiveFromAnchor();
    }, delay);
  }

  function scheduleActiveUpdateNow() { requestAnimationFrame(updateActiveFromAnchor); }

  function getAnchorY() {
    const h = getFixedHeaderHeight();
    return Math.max(0, Math.min(window.innerHeight - 20, h + CONFIG.anchorOffset));
  }

  function updateActiveFromAnchor() {
    if (!cacheIndex.length) return;
    const y = getAnchorY();
    const xs = [Math.floor(window.innerWidth * 0.40), Math.floor(window.innerWidth * 0.60)];
    let activeEl = null;

    for (const x of xs) {
      const stack = (document.elementsFromPoint ? document.elementsFromPoint(x, y) : []);
      if (!stack || !stack.length) continue;
      for (const el of stack) {
        if (!el) continue;
        if (el.id === 'cgpt-compact-nav' || (el.closest && el.closest('#cgpt-compact-nav'))) continue;
        const t = el.closest && el.closest('[data-cgpt-turn="1"]');
        if (t) { activeEl = t; break; }
      }
      if (activeEl) break;
    }

    const nearNext = findNearNextTop(y, BOUNDARY_EPS);
    if (nearNext) activeEl = nearNext;

    if (!activeEl) {
      const sinceScroll = Date.now() - (lastScrollTs || 0);
      if (sinceScroll < 160) return;
      const turns = qsTurns();
      for (const t of turns) { const r = t.getBoundingClientRect(); if (r.bottom >= y) { activeEl = t; break; } }
      if (!activeEl && turns.length) activeEl = turns[0];
    }

    if (activeEl) setActiveTurn(activeEl.id);
  }

  function findNearNextTop(y, eps) {
    const start = Math.max(0, (currentActiveTurnPos || 0) - 3);
    const maxChecks = 30;

    const ids = Array.isArray(cachedTurnIds) && cachedTurnIds.length ? cachedTurnIds : null;
    // Prefer cached ids to avoid keeping turn DOM nodes alive.
    if (ids) {
      for (let i = start, checked = 0; i < ids.length && checked < maxChecks; i++, checked++) {
        const id = ids[i];
        if (!id) continue;
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const d = r.top - y;
        if (d >= 0 && d <= eps) return el;
        if (r.top > y + eps) break;
      }
      return null;
    }

    const turns = qsTurns();
    if (!turns || !turns.length) return null;
    for (let i = start, checked = 0; i < turns.length && checked < maxChecks; i++, checked++) {
      const el = turns[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const d = r.top - y;
      if (d >= 0 && d <= eps) return el;
      if (r.top > y + eps) break;
    }
    return null;
  }

  function setActiveTurn(id) {
    const list = document.querySelector('#cgpt-compact-nav .compact-list');
    if (!id) return;
    // 同一条目：如果 active class 仍然存在就直接返回；否则继续走恢复逻辑
    if (currentActiveId === id && list) {
      const existing = list.querySelector(`.compact-item[data-id="${id}"]`);
      if (existing && existing.classList.contains('active')) return;
    } else if (currentActiveId === id) {
      return;
    }

    currentActiveId = id;
    currentActiveTurnPos = turnIdToPos.get(id) ?? currentActiveTurnPos;
    if (!list) return;

    const n = list.querySelector(`.compact-item[data-id="${id}"]`);
    // 过滤模式下可能找不到对应项：清掉旧高亮，避免残留
    list.querySelectorAll('.compact-item.active').forEach(node => node.classList.remove('active'));
    if (!n) return;

    n.classList.add('active');
    const r = n.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    if (r.top < lr.top) list.scrollTop += (r.top - lr.top - 4);
    else if (r.bottom > lr.bottom) list.scrollTop += (r.bottom - lr.bottom + 4);
  }

  function jumpActiveBy(delta) {
    const listNow = cacheIndex;
    if (!listNow.length) return;
    let idx = listNow.findIndex(x => x.id === currentActiveId);
    if (idx < 0) {
      updateActiveFromAnchor();
      idx = listNow.findIndex(x => x.id === currentActiveId);
      if (idx < 0) idx = 0;
    }
    const nextIdx = Math.max(0, Math.min(listNow.length - 1, idx + delta));
    const id = listNow[nextIdx].id;
    const el = document.getElementById(id);
    if (el) { setActiveTurn(id); scrollToTurn(el); }
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  window.requestIdleCallback ||= (cb, opt = {}) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), opt.timeout || 1);
  window.cancelIdleCallback ||= (id) => clearTimeout(id);
})();
