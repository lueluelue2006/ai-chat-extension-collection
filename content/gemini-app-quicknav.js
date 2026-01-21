// ==UserScript==
// @name         Gemini（gemini.google.com/app）对话导航（QuickNav）
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Gemini（gemini.google.com/app）版 QuickNav：紧凑导航 + 实时定位 + 📌标记点 + 收藏夹 + 防自动滚动 + 快捷键 Cmd/Alt+↑↓ 等。
// @author       schweigen
// @license      MIT
// @match        https://gemini.google.com/app*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = { maxPreviewLength: 12, animation: 250, refreshInterval: 2000, forceRefreshInterval: 10000, anchorOffset: 8 };
  const BOUNDARY_EPS = 28;
  const DEFAULT_FOLLOW_MARGIN = Math.max(CONFIG.anchorOffset || 8, 12);
  const GEMINI_SIDEBAR_EXPANDED_MIN_WIDTH = 160; // px: show top header only when sidebar expanded
  const DEBUG = false;
  const TAIL_RECALC_TURNS = 2; // 仅重算末尾预览（流式输出期间变化最多）
  // 存储键与检查点状态
  const STORE_NS = 'gemini-app-quicknav';
  const QUICKNAV_SITE_ID = 'gemini_app';
  const WIDTH_KEY = `${STORE_NS}:nav-width`;
  const POS_KEY = `${STORE_NS}:nav-pos`;
  const CP_KEY_PREFIX = `${STORE_NS}:cp:`; // + 会话 key
  const CP_TTL_MS = 31 * 24 * 60 * 60 * 1000; // 检查点保留 31 天
  let cpSet = new Set();          // 仅用于快速 membership（遗留）
  let cpMap = new Map();          // pinId -> meta
  // 收藏夹（favorites）
  const FAV_KEY_PREFIX = `${STORE_NS}:fav:`;         // + 会话 key
  const FAV_FILTER_PREFIX = `${STORE_NS}:fav-filter:`; // + 会话 key
  const FAV_TTL_MS = 31 * 24 * 60 * 60 * 1000; // 收藏保留 31 天
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
  let ORIGINAL_SCROLL_INTO_VIEW = null;
  let ORIGINAL_SCROLL_TO = null;
  let ORIGINAL_SCROLL_BY = null;
  let ORIGINAL_ELEM_SCROLL_TO = null;
  let ORIGINAL_ELEM_SCROLL_BY = null;

  // Gemini Enterprise 启用了 Trusted Types：innerHTML 需要 TrustedHTML
  const TT_POLICY = (() => {
    try {
      if (!window.trustedTypes || typeof window.trustedTypes.createPolicy !== 'function') return null;
      return window.trustedTypes.createPolicy(`gemini-quicknav-${Math.random().toString(36).slice(2)}`, {
        createHTML: (s) => s
      });
    } catch {
      return null;
    }
  })();

  function setHTML(el, html) {
    if (!el) return;
    try {
      el.innerHTML = TT_POLICY ? TT_POLICY.createHTML(String(html ?? '')) : String(html ?? '');
    } catch {
      // Fallback：尽量不崩（但会丢失结构）
      try { while (el.firstChild) el.removeChild(el.firstChild); } catch {}
      try { el.textContent = String(html ?? '').replace(/<[^>]*>/g, ''); } catch {}
    }
  }

  function clearEl(el) {
    if (!el) return;
    try {
      el.replaceChildren();
    } catch {
      while (el.firstChild) el.removeChild(el.firstChild);
    }
  }

  // === Gemini App DOM helpers ===
  const GEMINI_HOST_SELECTOR = 'chat-app#app-root';
  let __geminiScrollerCache = null;

  function getGeminiHost() { return document.querySelector(GEMINI_HOST_SELECTOR); }
  // gemini.google.com/app 主要是常规 DOM（非 open shadow），这里直接以根节点为查询范围
  function getGeminiRoot() { return getGeminiHost() || null; }

  function walkOpenShadows(start, visit) {
    const stack = [start];
    const seen = new Set();
    while (stack.length) {
      const root = stack.pop();
      if (!root || seen.has(root)) continue;
      seen.add(root);
      try { visit(root); } catch {}
      if (!root.querySelectorAll) continue;
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el && el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
  }

  function deepQueryFirst(start, selector) {
    let found = null;
    walkOpenShadows(start, (root) => {
      if (found || !root.querySelector) return;
      const hit = root.querySelector(selector);
      if (hit) found = hit;
    });
    return found;
  }

  function deepQueryAll(start, selector) {
    const out = [];
    walkOpenShadows(start, (root) => {
      if (!root.querySelectorAll) return;
      out.push(...root.querySelectorAll(selector));
    });
    return out;
  }

  function cssEscape(s) {
    const str = String(s ?? '');
    if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') return CSS.escape(str);
    return str.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }

  function getById(id) {
    const direct = document.getElementById(id);
    if (direct) return direct;
    const root = getGeminiRoot();
    if (!root) return null;
    return deepQueryFirst(root, `#${cssEscape(id)}`);
  }

  function closestCrossShadow(node, selector) {
    let el = node && node.nodeType === 1 ? node : (node?.parentElement || null);
    while (el) {
      try { if (el.matches && el.matches(selector)) return el; } catch {}
      if (el.parentElement) { el = el.parentElement; continue; }
      const rn = el.getRootNode && el.getRootNode();
      el = rn && rn.host ? rn.host : null;
    }
    return null;
  }

  function getGeminiScroller() {
    try {
      if (__geminiScrollerCache && __geminiScrollerCache.isConnected && isScrollableY(__geminiScrollerCache)) return __geminiScrollerCache;
    } catch {}
    const root = getGeminiRoot();
    if (!root) return null;
    // gemini.google.com/app：实际滚动容器常见为 <infinite-scroller class="chat-history">，
    // 而 #chat-history 有时只是外层壳（不可滚动）。这里优先选择“可滚动”的元素。
    const candidates = [
      root.querySelector?.('infinite-scroller.chat-history'),
      root.querySelector?.('infinite-scroller'),
      root.querySelector?.('#chat-history.chat-history-scroll-container'),
      root.querySelector?.('#chat-history'),
      deepQueryFirst(root, 'infinite-scroller.chat-history'),
      deepQueryFirst(root, 'infinite-scroller'),
      deepQueryFirst(root, '#chat-history.chat-history-scroll-container'),
      deepQueryFirst(root, '#chat-history'),
      deepQueryFirst(root, 'div.chat-history-scroll-container')
    ].filter(Boolean);

    let scroller = null;
    for (const el of candidates) {
      try {
        if (isScrollableY(el)) { scroller = el; break; }
      } catch {}
    }
    __geminiScrollerCache = scroller;
    return __geminiScrollerCache;
  }

  // 全局调试函数，用户可在控制台调用
  window.geminiNavDebug = {
    forceRefresh: () => {
      console.log('Gemini Navigation: 手动强制刷新');
      TURN_SELECTOR = null;
      const ui = getById('cgpt-compact-nav')?._ui;
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

  GM_registerMenuCommand("重置问题栏位置", resetPanelPosition);
  GM_registerMenuCommand("清理过期检查点（31天）", cleanupExpiredCheckpoints);
  GM_registerMenuCommand("清理无效收藏", cleanupInvalidFavorites);
  function resetPanelPosition() {
    const nav = document.getElementById('cgpt-compact-nav');
    if (nav) {
      nav.style.top = '60px';
      nav.style.right = '10px';
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
        alert(removed > 0 ? `已清理 ${removed} 条过期检查点（>31天）` : '无过期检查点需要清理');
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
      const removed = runFavoritesGC(true, valid, false, true);
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
  let activeScrollEl = null; // Gemini scroller 绑定用

  // Gemini Enterprise 顶栏（header）自动显隐：仅在左侧边栏展开时显示
  let headerAutoHideStarted = false;
  const headerAutoHide = {
    rafId: 0,
    intervalId: 0,
    ro: null,
    sidebarEl: null,
    headerEl: null,
    lastExpanded: null
  };

  // 性能缓存：避免长对话频繁扫描/强制重排
  const previewCache = new Map(); // msgKey -> preview
  const roleCache = new Map(); // msgKey -> 'user' | 'assistant'
  const turnIdToPos = new Map(); // turnId -> position in cachedTurns
  let cachedTurns = [];

  function scheduleRefresh(ui, { delay = 80, force = false, soft = false } = {}) {
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
        const oldCount = cacheIndex.length;
        refreshIndex(ui, { force, soft });
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
    const hasStop = (() => {
      const root = getGeminiRoot();
      if (!root) return false;
      const scope = getGeminiScroller() || root;
      // 多重启发式：进度条/停止按钮/Thinking 状态
      const selectors = [
        '[role="progressbar"]',
        'md-circular-progress',
        'md-linear-progress',
        'button[aria-label*="Stop" i]',
        'button[title*="Stop" i]',
        'button[aria-label*="Cancel" i]',
        'button[title*="Cancel" i]',
        '[aria-label*="Thinking" i]',
        '[title*="Thinking" i]',
        'ucs-text-streamer[aria-busy="true"]'
      ];
      for (const sel of selectors) {
        const hit = deepQueryFirst(scope, sel);
        if (hit) return true;
      }
      return false;
    })();
    if (lastHasStop === null) {
      lastHasStop = hasStop;
      return hasStop;
    }
    if (lastHasStop && !hasStop && ui) scheduleRefresh(ui, { force: true });
    lastHasStop = hasStop;
    return hasStop;
  }

  function init() {
    initGeminiHeaderAutoHide();
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
    const checkContentLoaded = () => {
      return !!getGeminiRoot() && (!!getGeminiScroller() || qsTurns().length > 0);
    };
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
    const tryBoot = () => {
      if (document.getElementById('cgpt-compact-nav')) return true;
      if (checkContentLoaded()) { boot(); return true; }
      return false;
    };

    if (tryBoot()) return;

    // Gemini Enterprise 的关键 DOM 多在 open shadow roots 内，单靠监听 document.body 可能捕捉不到。
    // 这里加一个轮询兜底，确保 scroller / turn 出现后可以启动。
    // 注意：用户可能在页面停留很久后才打开某个会话，因此不要在 60 秒后停止（否则会“永远不启动”）。
    let timer = 0;
    let observer = null;
    let stopped = false;
    const cleanup = () => {
      stopped = true;
      if (timer) { clearTimeout(timer); timer = 0; }
      if (observer) { try { observer.disconnect(); } catch {} observer = null; }
    };

    let attempts = 0;
    const tick = () => {
      if (stopped) return;
      attempts++;
      try {
        if (tryBoot()) { cleanup(); return; }
      } catch (e) {
        if (DEBUG || window.DEBUG_TEMP) console.error('Gemini Navigation: boot tick error:', e);
      }

      // 逐步退避：前期更积极，后期降低频率以减少长期驻留开销
      const delay = attempts < 120 ? 500 : (attempts < 600 ? 2000 : 5000);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 500);

    observer = new MutationObserver(() => {
      try { if (tryBoot()) cleanup(); } catch {}
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  let currentUrl = location.href;
  function detectUrlChange() {
    if (location.href !== currentUrl) {
      if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: URL变化，清理旧实例', currentUrl, '->', location.href);
      currentUrl = location.href;
      const oldNav = document.getElementById('cgpt-compact-nav');
      if (oldNav) {
        if (oldNav._ui) {
          // 清理定时器
          if (oldNav._ui._forceRefreshTimer) {
            clearInterval(oldNav._ui._forceRefreshTimer);
            if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 已清理定时器');
          }
          // 断开MutationObserver
          if (oldNav._ui._mo) {
            try {
              oldNav._ui._mo.disconnect();
              if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 已断开MutationObserver');
            } catch (e) {
              if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 断开MutationObserver失败', e);
            }
          }
          if (oldNav._ui.layout && typeof oldNav._ui.layout.destroy === 'function') {
            try { oldNav._ui.layout.destroy(); } catch {}
          }
        }
        oldNav.remove();
        if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 已移除旧面板');
      }
      // 重置"正在启动"标志，避免新页面被卡住
      __cgptBooting = false;
      // 重置键盘事件绑定标志，允许新页面重新绑定
      window.__cgptKeysBound = false;
      lastTurnCount = 0;
      TURN_SELECTOR = null; // 同时重置选择器缓存
      __geminiScrollerCache = null;
      previewCache.clear();
      roleCache.clear();
      turnIdToPos.clear();
      cachedTurns = [];
      lastDomTurnCount = 0;
      currentActiveTurnPos = 0;
      setTimeout(init, 100);
    }
  }
  window.addEventListener('popstate', detectUrlChange);
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function (...args) { originalPushState.apply(this, args); setTimeout(detectUrlChange, 0); };
  history.replaceState = function (...args) { originalReplaceState.apply(this, args); setTimeout(detectUrlChange, 0); };
  // 兜底：部分站点/隔离环境下 pushState/replaceState hook 可能不稳定，周期检测 URL 变化更可靠
  setInterval(detectUrlChange, 1000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  function qsTurns() {
    const scroller = getGeminiScroller();
    if (!scroller) return [];
    const turns = Array.from(scroller.querySelectorAll('.conversation-container'));
    // 只保留可见节点，避免误把模板/隐藏节点算进去
    const visible = turns.filter((el) => {
      try {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      } catch {
        return false;
      }
    });
    visible.sort((a, b) => {
      try { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; }
      catch { return 0; }
    });
    return visible;
  }

  function getTextPreview(el) {
    if (!el) return '';
    // 注意：innerText 会触发同步样式/布局计算（长对话非常慢），尽量只用 textContent
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return '...';
    // 让 CSS 负责根据宽度省略，JS 只做上限裁剪以防极端超长文本
    const HARD_CAP = 600;
    return text.length > HARD_CAP ? text.slice(0, HARD_CAP) : text;
  }

  function getTurnKey(el) {
    if (!el) return '';
    return el.getAttribute('data-gq-key') || el.getAttribute('data-message-id') || el.getAttribute('data-testid') || el.id || '';
  }

  function fnv1a32(input) {
    const str = String(input ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  function getComposedAncestors(el, max = 60) {
    const chain = [];
    let cur = el;
    while (cur && max-- > 0) {
      chain.push(cur);
      if (cur.parentElement) {
        cur = cur.parentElement;
        continue;
      }
      const rn = cur.getRootNode && cur.getRootNode();
      cur = rn && rn.host ? rn.host : null;
    }
    return chain;
  }

  function classifyMarkdownDoc(docEl) {
    const chain = getComposedAncestors(docEl, 50);
    const hasTag = (tag) => chain.some((n) => n && n.tagName === tag);
    const classContains = (substr) =>
      chain.some((n) => {
        if (!n) return false;
        if (n.classList && n.classList.contains(substr)) return true;
        const cn = typeof n.className === 'string' ? n.className : '';
        return cn.includes(substr);
      });

    const isQuestion =
      classContains('question-wrapper') ||
      classContains('question-block') ||
      chain.some((n) => typeof n?.className === 'string' && /\bquestion\b/.test(n.className));
    const isAnswer =
      hasTag('UCS-SUMMARY') ||
      hasTag('UCS-RESPONSE-MARKDOWN') ||
      classContains('summary-container') ||
      classContains('summary-contents') ||
      chain.some((n) => typeof n?.className === 'string' && /\bsummary\b/.test(n.className));

    return { isQuestion, isAnswer };
  }

  function extractGeminiTurnParts(turnEl) {
    // gemini.google.com/app：一个 conversation-container 内通常包含 user-query + model-response
    const uq = turnEl.querySelector('user-query');
    const mr = turnEl.querySelector('model-response');
    const qDoc = uq?.querySelector('.query-text') || uq || null;
    const aDoc = mr?.querySelector('message-content') || mr || null;
    const questionText = qDoc ? getTextPreview(qDoc) : '';
    const answerText = aDoc ? getTextPreview(aDoc) : '';
    return { qDoc, aDoc: aDoc || null, answerFallback: aDoc || null, questionText, answerText };
  }

  function buildIndex(turnsOverride) {
    const turns = turnsOverride || qsTurns();
    cachedTurns = turns;
    lastDomTurnCount = turns.length;
    lastDomFirstKey = turns.length ? getTurnKey(turns[0]) : '';
    lastDomLastKey = turns.length ? getTurnKey(turns[turns.length - 1]) : '';
    turnIdToPos.clear();
    if (!turns.length) {
      if (DEBUG || window.DEBUG_TEMP) console.log('Gemini Navigation: 没有找到任何对话元素');
      return [];
    }

    if (DEBUG) console.log(`Gemini Navigation: 开始分析 ${turns.length} 个 turn`);

    const hashMaxOcc = new Map(); // hash -> max occurrence
    let u = 0, a = 0;
    const list = [];

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (turn.getAttribute('data-cgpt-turn') !== '1') turn.setAttribute('data-cgpt-turn', '1');
      if (!turn.id) turn.id = `cgpt-turn-${i + 1}`;

      const shouldRecalcPreview = i >= turns.length - TAIL_RECALC_TURNS;

      let baseKey = turn.getAttribute('data-gq-key') || '';
      if (baseKey) {
        const m = /^([0-9a-f]+):(\d+)$/.exec(baseKey);
        if (m) {
          const h = m[1];
          const occ = parseInt(m[2], 10) || 0;
          const cur = hashMaxOcc.get(h) || 0;
          if (occ > cur) hashMaxOcc.set(h, occ);
        }
      }

      let qid = turn.getAttribute('data-gq-qid') || '';
      let aid = turn.getAttribute('data-gq-aid') || '';
      let qPreview = turn.getAttribute('data-gq-qpreview') || '';
      let aPreview = turn.getAttribute('data-gq-apreview') || '';

      let parts = null;
      const needRecalc = shouldRecalcPreview || !baseKey || !qid || !aid || !qPreview || !aPreview;
      if (needRecalc) {
        parts = extractGeminiTurnParts(turn);

        // baseKey：优先使用 turn 的稳定 id（Gemini App 的 conversation-container 通常自带 id）
        if (!baseKey) {
          const tid = String(turn.id || '');
          if (tid && !/^cgpt-turn-\d+$/.test(tid)) {
            baseKey = `r_${tid}`;
          } else {
            const basis = parts.questionText || parts.answerText || getTextPreview(turn);
            const h = fnv1a32(basis);
            const nextOcc = (hashMaxOcc.get(h) || 0) + 1;
            hashMaxOcc.set(h, nextOcc);
            baseKey = `${h}:${nextOcc}`;
          }
          turn.setAttribute('data-gq-key', baseKey);
        }

        const qAnchor = parts.qDoc;
        const aAnchor = parts.aDoc || parts.answerFallback;

        if (!qid) {
          if (qAnchor && qAnchor !== turn) {
            qid = `${turn.id}-q`;
            try { qAnchor.id = qid; } catch {}
          } else {
            qid = turn.id;
          }
          turn.setAttribute('data-gq-qid', qid);
        } else if (shouldRecalcPreview && qAnchor && qAnchor !== turn) {
          try { qAnchor.id = qid; } catch {}
        }

        if (!aid) {
          if (aAnchor && aAnchor !== turn) {
            aid = `${turn.id}-a`;
            try { aAnchor.id = aid; } catch {}
          } else {
            aid = turn.id;
          }
          turn.setAttribute('data-gq-aid', aid);
        } else if (shouldRecalcPreview && aAnchor && aAnchor !== turn) {
          try { aAnchor.id = aid; } catch {}
        }

        if (!qPreview || shouldRecalcPreview) {
          qPreview = parts.questionText || (qAnchor ? getTextPreview(qAnchor) : '') || '...';
          turn.setAttribute('data-gq-qpreview', qPreview);
        }
        if (!aPreview || shouldRecalcPreview) {
          aPreview = parts.answerText || (aAnchor ? getTextPreview(aAnchor) : '') || '...';
          turn.setAttribute('data-gq-apreview', aPreview);
        }
      }

      // 让 turn 和两个锚点 id 都能映射回 turn 的位置（用于边界扫描优化）
      turnIdToPos.set(turn.id, i);
      if (qid) turnIdToPos.set(qid, i);
      if (aid) turnIdToPos.set(aid, i);

      // Gemini 一个 turn 内包含“问题+答案”，这里拆成两条，保持与原脚本一致
      const userKey = `${baseKey}:q`;
      list.push({ id: qid || turn.id, key: userKey, idx: i, role: 'user', preview: qPreview || '...', seq: ++u });
      list.push({ id: aid || turn.id, key: baseKey, idx: i, role: 'assistant', preview: aPreview || '...', seq: ++a });
    }

    if (DEBUG) console.log(`Gemini Navigation: 生成 ${list.length} 条索引 (用户: ${u}, 助手: ${a})`);
    return list;
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
  --cgpt-nav-font: var(--font-family-default, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
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
#cgpt-compact-nav.cgpt-has-scrollbar { --cgpt-nav-gutter: clamp(4px, calc(var(--cgpt-nav-width, 210px) / 32), 8px); }
#cgpt-compact-nav * { -webkit-user-select:none; user-select:none; box-sizing:border-box; }
#cgpt-compact-nav > .compact-header,
#cgpt-compact-nav > .compact-list,
#cgpt-compact-nav > .compact-footer { width:100%; }
.compact-header { display:flex; align-items:center; justify-content:space-between; padding:4px 8px; margin-bottom:4px; background:var(--cgpt-nav-panel-bg); border-radius:var(--cgpt-nav-radius-lg); border:1px solid var(--cgpt-nav-panel-border); pointer-events:auto; cursor:move; box-shadow:var(--cgpt-nav-panel-shadow); min-width:100px; backdrop-filter:saturate(180%) blur(18px); width:100%; padding-inline-end: calc(8px + var(--cgpt-nav-gutter)); }
.compact-actions { display:flex; align-items:center; gap:4px; width:100%; }
.compact-title { font-size:11px; font-weight:600; color:var(--cgpt-nav-text-muted); display:flex; align-items:center; gap:3px; text-transform:uppercase; letter-spacing:.04em; }
.compact-title span { color:var(--cgpt-nav-text-strong); }
.compact-title svg { width:12px; height:12px; opacity:.55; }
.compact-toggle, .compact-refresh, .compact-lock { background:var(--cgpt-nav-item-bg); border:1px solid var(--cgpt-nav-border-muted); color:var(--cgpt-nav-text-strong); cursor:pointer; width:clamp(20px, calc(var(--cgpt-nav-width, 210px) / 10), 26px); height:clamp(20px, calc(var(--cgpt-nav-width, 210px) / 10), 26px); display:flex; align-items:center; justify-content:center; border-radius:var(--cgpt-nav-radius); transition:all .2s ease; font-weight:600; line-height:1; box-shadow:var(--cgpt-nav-item-shadow); backdrop-filter:saturate(180%) blur(18px); }
.compact-toggle { font-size:clamp(14px, calc(var(--cgpt-nav-width, 210px) / 14), 18px); }
.compact-refresh { font-size:clamp(12px, calc(var(--cgpt-nav-width, 210px) / 18), 14px); margin-left:4px; }
.compact-lock { font-size:clamp(12px, calc(var(--cgpt-nav-width, 210px) / 14), 16px); margin-left:4px; }
.compact-toggle:hover, .compact-refresh:hover, .compact-lock:hover { border-color:var(--cgpt-nav-accent-subtle); color:var(--cgpt-nav-accent); box-shadow:0 4px 14px rgba(147,51,234,0.12); background:var(--cgpt-nav-item-hover-bg); }
.compact-toggle:active, .compact-refresh:active, .compact-lock:active { transform:scale(.94); }
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
  .compact-star { background:var(--cgpt-nav-item-bg); border:1px solid var(--cgpt-nav-border-muted); color:var(--cgpt-nav-text-strong); cursor:pointer; width:clamp(20px, calc(var(--cgpt-nav-width, 210px) / 10), 26px); height:clamp(20px, calc(var(--cgpt-nav-width, 210px) / 10), 26px); display:flex; align-items:center; justify-content:center; border-radius:var(--cgpt-nav-radius); transition:all .2s ease; font-weight:600; line-height:1; box-shadow:var(--cgpt-nav-item-shadow); backdrop-filter:saturate(180%) blur(18px); font-size:clamp(12px, calc(var(--cgpt-nav-width, 210px) / 14), 16px); margin-left:4px; }
  .compact-star:hover { border-color:var(--cgpt-nav-fav-border); color:var(--cgpt-nav-fav-color); box-shadow:0 4px 14px rgba(147,51,234,0.12); background:var(--cgpt-nav-item-hover-bg); }
  .compact-star.active { background:var(--cgpt-nav-fav-bg); color:var(--cgpt-nav-fav-color); border-color:var(--cgpt-nav-fav-border); }
  .compact-lock.active { background:var(--cgpt-nav-arrow-bg); color:var(--cgpt-nav-arrow-color); border-color:var(--cgpt-nav-arrow-border); box-shadow:0 4px 14px color-mix(in srgb, var(--cgpt-nav-arrow-color) 26%, transparent); }
  .fav-toggle { position:absolute; right:calc(6px + var(--cgpt-nav-gutter)); top:2px; border:none; background:transparent; color:var(--cgpt-nav-text-muted); cursor:pointer; font-size:12px; line-height:1; padding:2px; opacity:.7; }
  .fav-toggle:hover { color:var(--cgpt-nav-fav-color); opacity:1; }
  .fav-toggle.active { color:var(--cgpt-nav-fav-color); opacity:1; }
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
.nav-btn { flex:1 1 25%; min-width:0; padding: clamp(4px, calc(var(--cgpt-nav-width, 210px) / 56), 6px) clamp(6px, calc(var(--cgpt-nav-width, 210px) / 35), 8px); font-size: clamp(12px, calc(var(--cgpt-nav-width, 210px) / 14), 14px); border-radius:var(--cgpt-nav-radius-lg); border:1px solid var(--cgpt-nav-border-muted); background:var(--cgpt-nav-footer-bg); cursor:pointer; box-shadow:var(--cgpt-nav-item-shadow); line-height:1; color:var(--cgpt-nav-text-strong); transition:all .18s ease; backdrop-filter:saturate(180%) blur(18px); }
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

.highlight-pulse { animation: pulse 1.5s ease-out; }
@keyframes pulse { 0% { background-color: rgba(255,243,205,0); } 20% { background-color: rgba(168,218,255,0.3); } 100% { background-color: rgba(255,243,205,0); } }
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
    setHTML(nav, `
      <div class="compact-header">
        <div class="compact-actions">
          <button class="compact-toggle" type="button" title="收起/展开"><span class="toggle-text">−</span></button>
          <button class="compact-refresh" type="button" title="刷新对话列表">⟳</button>
          <button class="compact-lock" type="button" title="阻止新回复自动滚动">🔐</button>
          <button class="compact-star" type="button" title="仅显示收藏">☆</button>
        </div>
      </div>
      <div class="compact-list" role="listbox" aria-label="对话项"></div>
      <div class="compact-footer">
        <button class="nav-btn" type="button" id="cgpt-nav-top" title="回到顶部">⤒</button>
        <button class="nav-btn arrow" type="button" id="cgpt-nav-prev" title="上一条（Cmd+↑ / Alt+↑）">↑</button>
        <button class="nav-btn arrow" type="button" id="cgpt-nav-next" title="下一条（Cmd+↓ / Alt+↓）">↓</button>
        <button class="nav-btn" type="button" id="cgpt-nav-bottom" title="回到底部">⤓</button>
      </div>
    `);
    document.body.appendChild(nav);
    applySavedPosition(nav);
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

    const ui = { nav, layout };
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
      manual: { top: 0, left: null, right: null },
      leftEl: null,
      rightEl: null,
      leftObserver: null,
      rightObserver: null,
      mutationObserver: null,
      resizeHandler: null,
      pendingEval: false,
      rafId: 0,
      rightRecheckTimer: 0,
      rightRecheckAttempts: 0,
      rightSavedPosition: null,
      rightFollowLoopId: 0
    };

    function captureManualPositions() {
      try {
        const rect = nav.getBoundingClientRect();
        const comp = window.getComputedStyle(nav);
        const topPx = parseFloat(comp.top);
        const leftPx = comp.left && comp.left !== 'auto' ? parseFloat(comp.left) : null;
        const rightPx = comp.right && comp.right !== 'auto' ? parseFloat(comp.right) : null;
        state.manual = {
          top: Number.isFinite(topPx) ? topPx : rect.top,
          left: Number.isFinite(leftPx) ? leftPx : null,
          right: Number.isFinite(rightPx) ? rightPx : null
        };
      } catch {
        state.manual = { top: 60, left: null, right: 10 };
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
      if (state.mutationObserver) { try { state.mutationObserver.disconnect(); } catch {} }
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
      state.leftObserver = null;
      state.rightObserver = null;
      state.mutationObserver = null;
    }

    state.mutationObserver = new MutationObserver(() => scheduleEvaluation('mutation'));
    try { state.mutationObserver.observe(document.body, { childList: true, subtree: true }); } catch {}

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
    // Gemini Enterprise: left sidebar lives inside `ucs-nav-panel` (open shadow root).
    try {
      const root = getGeminiRoot();
      if (!root) return null;
      const navHost = root.querySelector('ucs-nav-panel');
      const navRoot = navHost?.shadowRoot || null;
      const panel = navRoot?.querySelector('.nav-panel') || null;
      if (panel) return panel;
      return deepQueryFirst(root, '.nav-panel') || null;
    } catch {
      return null;
    }
  }

  function findRightPanelElement() {
    // Gemini Enterprise: right panel lives inside `ucs-results` -> `ucs-sources-panel` / `.desktop-sources-panel`.
    try {
      const root = getGeminiRoot();
      if (!root) return null;
      const resultsHost = root.querySelector('ucs-results');
      const resultsRoot = resultsHost?.shadowRoot || null;
      const direct =
        resultsRoot?.querySelector('.panel-container.desktop-sources-panel') ||
        resultsRoot?.querySelector('.desktop-sources-panel') ||
        resultsRoot?.querySelector('ucs-sources-panel') ||
        null;
      if (direct) return direct;
      return (
        deepQueryFirst(root, '.panel-container.desktop-sources-panel') ||
        deepQueryFirst(root, '.desktop-sources-panel') ||
        deepQueryFirst(root, 'ucs-sources-panel') ||
        null
      );
    } catch {
      return null;
    }
  }

  function findGeminiTopHeaderElement() {
    // Gemini Enterprise: header bar container is inside `ucs-standalone-app.shadowRoot`.
    try {
      const root = getGeminiRoot();
      if (!root) return null;
      const direct = root.querySelector('div.ucs-standalone-header');
      if (direct) return direct;
      return deepQueryFirst(root, 'div.ucs-standalone-header') || null;
    } catch {
      return null;
    }
  }

  function setGeminiTopHeaderHidden(headerEl, hidden) {
    if (!headerEl) return;
    if (hidden) {
      try {
        if (headerEl.dataset.gqnHeaderHidden !== '1') {
          headerEl.dataset.gqnHeaderRestoreDisplay = headerEl.style.display || '';
          headerEl.dataset.gqnHeaderHidden = '1';
        }
      } catch {}
      headerEl.style.display = 'none';
      return;
    }

    let restore = '';
    try { restore = headerEl.dataset.gqnHeaderRestoreDisplay || ''; } catch {}
    headerEl.style.display = restore || '';
    try { delete headerEl.dataset.gqnHeaderHidden; } catch {}
  }

  function scheduleGeminiHeaderAutoHideSync(reason) {
    if (headerAutoHide.rafId) return;
    const schedule = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : (cb) => setTimeout(cb, 16);
    headerAutoHide.rafId = schedule(() => {
      headerAutoHide.rafId = 0;
      try { syncGeminiHeaderAutoHide(reason); } catch {}
    });
  }

  function syncGeminiHeaderAutoHide(reason) {
    // Poll-based + ResizeObserver based; keep light and safe across SPA navigations.
    const root = getGeminiRoot();
    if (!root) return;

    const sidebar = findLeftSidebarElement();
    const header = findGeminiTopHeaderElement();

    if (header && header !== headerAutoHide.headerEl) headerAutoHide.headerEl = header;

    if (sidebar !== headerAutoHide.sidebarEl) {
      if (headerAutoHide.ro) {
        try { headerAutoHide.ro.disconnect(); } catch {}
        headerAutoHide.ro = null;
      }
      headerAutoHide.sidebarEl = sidebar;
      if (sidebar && window.ResizeObserver) {
        try {
          headerAutoHide.ro = new ResizeObserver(() => scheduleGeminiHeaderAutoHideSync('sidebar-resize'));
          headerAutoHide.ro.observe(sidebar);
        } catch {
          headerAutoHide.ro = null;
        }
      }
    }

    if (!header || !sidebar) return;

    let expanded = null;
    try {
      const r = sidebar.getBoundingClientRect();
      expanded = !!r && (r.width >= GEMINI_SIDEBAR_EXPANDED_MIN_WIDTH);
    } catch {
      expanded = null;
    }
    if (expanded === null) return;

    const shouldHide = !expanded;
    if (headerAutoHide.lastExpanded === expanded) {
      // Keep consistent even if something else touched styles.
      if (shouldHide && header.style.display !== 'none') setGeminiTopHeaderHidden(header, true);
      return;
    }

    headerAutoHide.lastExpanded = expanded;
    setGeminiTopHeaderHidden(header, shouldHide);

    if (DEBUG || window.DEBUG_TEMP) console.log('Gemini header auto-hide:', { reason, expanded, shouldHide });
  }

  function initGeminiHeaderAutoHide() {
    if (headerAutoHideStarted) {
      scheduleGeminiHeaderAutoHideSync('re-init');
      return;
    }
    headerAutoHideStarted = true;
    scheduleGeminiHeaderAutoHideSync('init');
    headerAutoHide.intervalId = setInterval(() => {
      try { syncGeminiHeaderAutoHide('poll'); } catch {}
    }, 1200);
    window.addEventListener('resize', () => scheduleGeminiHeaderAutoHideSync('resize'), { passive: true });
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
    const onDragStart = typeof opts.onDragStart === 'function' ? opts.onDragStart : null;
    const onDragMove = typeof opts.onDragMove === 'function' ? opts.onDragMove : null;
    const onDragEnd = typeof opts.onDragEnd === 'function' ? opts.onDragEnd : null;
    let isDragging = false, startX, startY, startRight, startTop;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.compact-toggle, .compact-refresh, .compact-lock, .compact-star')) return;
      isDragging = true; startX = e.clientX; startY = e.clientY;
      const rect = nav.getBoundingClientRect();
      startTop = rect.top;
      startRight = Math.max(0, window.innerWidth - rect.right);
      if (onDragStart) {
        try { onDragStart(e); } catch {}
      }
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const newRight = Math.max(0, startRight - dx);
      nav.style.right = `${newRight}px`;
      nav.style.left = 'auto';
      nav.style.top = `${startTop + dy}px`;
      if (onDragMove) {
        try { onDragMove(e); } catch {}
      }
    });
    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
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
      const obj = (typeof GM_getValue === 'function') ? GM_getValue(key, {}) : (JSON.parse(window.localStorage.getItem(key) || '{}'));
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
      if (typeof GM_setValue === 'function') GM_setValue(key, obj);
      else window.localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }

  // ===== 收藏夹存取 =====
  function getFavKeys() { return FAV_KEY_PREFIX + getConvKey(); }
  function getFavFilterKey() { return FAV_FILTER_PREFIX + getConvKey(); }
  function loadFavSet() {
    try {
      const key = getFavKeys();
      const obj = (typeof GM_getValue === 'function') ? GM_getValue(key, {}) : (JSON.parse(window.localStorage.getItem(key) || '{}'));
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
      if (typeof GM_setValue === 'function') GM_setValue(key, obj);
      else window.localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }
  function loadFavFilterState() {
    try {
      const k = getFavFilterKey();
      filterFav = (typeof GM_getValue === 'function') ? !!GM_getValue(k, false) : (window.localStorage.getItem(k) === '1');
    } catch { filterFav = false; }
  }
  function saveFavFilterState() {
    try {
      const k = getFavFilterKey();
      if (typeof GM_setValue === 'function') GM_setValue(k, !!filterFav);
      else window.localStorage.setItem(k, filterFav ? '1' : '0');
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
      const w = (typeof GM_getValue === 'function') ? GM_getValue(WIDTH_KEY, 0) : parseInt(window.localStorage.getItem(WIDTH_KEY) || '0', 10);
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
      if (typeof GM_setValue === 'function') GM_setValue(WIDTH_KEY, px);
      else window.localStorage.setItem(WIDTH_KEY, String(px));
    } catch {}
  }

  function loadSavedPosition() {
    try {
      const raw = (typeof GM_getValue === 'function') ? GM_getValue(POS_KEY, null) : JSON.parse(window.localStorage.getItem(POS_KEY) || 'null');
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
      if (typeof GM_setValue === 'function') GM_setValue(POS_KEY, payload);
      else window.localStorage.setItem(POS_KEY, JSON.stringify(payload));
    } catch {}
  }

  function applySavedPosition(nav) {
    const saved = loadSavedPosition();
    if (!nav || !saved) return;
    const vh = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
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
      const rect = nav.getBoundingClientRect();
      const vw = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
      const vh = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
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
    // 自动清理收藏：仅按 TTL 清理（避免 Gemini 虚拟列表导致“未加载即被当成无效”）
    const nextFull = cacheIndex;
    const favRemoved = runFavoritesGC(true, null, false, false);
    if (favRemoved) updateStarBtnState(ui);
    const next = filterFav ? nextFull.filter(it => favSet.has(it.key)) : nextFull;
    if (!next.length) {
      setHTML(list, `<div class="compact-empty">${filterFav ? '暂无收藏' : '暂无对话'}</div>`);
      queueScrollbarState();
      return;
    }
    clearEl(list);
    const frag = document.createDocumentFragment();
    for (const item of next) {
      const node = document.createElement('div');
      const fav = favSet.has(item.key);
      node.className = `compact-item ${item.role} ${fav ? 'has-fav' : ''}`;
      node.dataset.id = item.id;
      node.dataset.key = item.key;
      if (item.role === 'pin') {
        node.classList.add('pin');
        node.title = 'Option+单击删除📌';
        setHTML(node, `<span class="pin-label">${escapeHtml(item.preview)}</span><button class="fav-toggle ${fav ? 'active' : ''}" type="button" title="收藏/取消收藏">★</button>`);
      } else {
        const label = item.role === 'user' ? `U${item.seq}` : (item.role === 'assistant' ? `A${item.seq}` : String(item.idx + 1));
        setHTML(node, `<span class="compact-number">${escapeHtml(label)}.</span><span class="compact-text" title="${escapeAttr(item.preview)}">${escapeHtml(item.preview)}</span><button class="fav-toggle ${fav ? 'active' : ''}" type="button" title="收藏/取消收藏">★</button>`);
      }
      node.setAttribute('draggable', 'false');
      frag.appendChild(node);
    }
    list.appendChild(frag);
    queueScrollbarState();
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
        const item = e.target.closest('.compact-item');
        if (!item) return;
        // 删除📌：Option+单击在📌行
        if (e.altKey && item.classList.contains('pin')) {
          const pinId = item.dataset.key;
          if (pinId && cpMap.has(pinId)) {
            const meta = cpMap.get(pinId);
            // 尝试移除旧锚点
            try { const old = getById(meta.anchorId); if (old) old.remove(); } catch {}
            cpMap.delete(pinId);
            if (favSet.has(pinId)) { favSet.delete(pinId); favMeta.delete(pinId); saveFavSet(); updateStarBtnState(ui); }
            saveCPSet();
            renderList(ui);
            return;
          }
        }
        const el = getById(item.dataset.id);
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
    const unchanged = turnCount === lastDomTurnCount && firstKey === lastDomFirstKey && lastKey === lastDomLastKey;
    if (soft && !force && unchanged && cacheIndex.length && turnCount > 0) return false;

    const base = buildIndex(turns);
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
      if (!anchorId || !getById(anchorId)) {
        anchorId = resolvePinAnchor(meta);
        if (anchorId) { meta.anchorId = anchorId; needSave = true; }
      }
      if (!anchorId) return; // 无法解析，跳过
      try {
        const ae = getById(anchorId);
        if (ae) {
          ae.setAttribute('data-pin-id', pinId);
          ensurePinAnchorStyled(ae);
        }
      } catch {}
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
    // 先预计算锚点y用于排序
    const getY = (id) => {
      const el = getById(id);
      if (!el) return Infinity;
      const r = el.getBoundingClientRect();
      return r ? r.top : Infinity;
    };

    // 全局📌编号
    let pinSeq = 0;
    for (const item of baseList) {
      combined.push(item);
      const arr = byMsg.get(item.key);
      if (!arr || !arr.length) continue;
      arr.sort((a,b) => {
        const ya = getY(a.anchorId), yb = getY(b.anchorId);
        if (ya !== yb) return ya - yb;
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
      ensurePinAnchorStyled(span);

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
      const k = getTurnKey(t);
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
    const geminiScroller = getGeminiScroller();
    if (geminiScroller) return geminiScroller;
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
    if (root.classList && root.classList.contains('markdown-document')) return root;
    const selectors = [
      // Gemini App
      '.query-text',
      'message-content',
      // 兜底
      'p','li','pre','code','blockquote'
    ];
    for (const s of selectors) {
      const n = deepQueryFirst(root, s) || root.querySelector?.(s);
      if (n && n.offsetParent !== null && n.offsetHeight > 0) return n;
    }
    return root;
  }

  function scrollToTurn(el) {
    const anchor = findTurnAnchor(el) || el;
    const behavior = scrollLockEnabled ? 'auto' : 'smooth';
    const scroller = getScrollRoot(anchor);
    const isWindow = isWindowScroller(scroller);
    markNavScrollIntent(scrollLockEnabled ? 1600 : 800);
    try {
      if (!isWindow && scroller && scroller.getBoundingClientRect) {
        const scRect = scroller.getBoundingClientRect();
        const aRect = anchor.getBoundingClientRect();
        const top = scroller.scrollTop + (aRect.top - scRect.top) - (CONFIG.anchorOffset || 8);
        scroller.scrollTo({ top: Math.max(0, top), behavior });
      } else {
        const margin = Math.max(0, getFixedHeaderHeight());
        const r = anchor.getBoundingClientRect?.();
        const se = document.scrollingElement || document.documentElement;
        const currentTop = se ? (se.scrollTop || 0) : (window.scrollY || 0);
        const targetTop = r ? (currentTop + r.top - margin - (CONFIG.anchorOffset || 8)) : currentTop;
        window.scrollTo({ top: Math.max(0, targetTop), behavior });
      }
    } catch {
      // 最后兜底：不崩溃
      try { anchor.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' }); } catch {}
    }
    scheduleActiveUpdateNow();
    el.classList.add('highlight-pulse');
    anchor.classList.add('highlight-pulse');
    setTimeout(() => { el.classList.remove('highlight-pulse'); anchor.classList.remove('highlight-pulse'); }, 1600);
  }

  function postScrollNudge(targetEl) {
    markNavScrollIntent(scrollLockEnabled ? 1200 : 600);
    let tries = 0;
    const step = () => {
      tries++;
      const y = getAnchorY();
      const r = targetEl.getBoundingClientRect();
      const diff = r.top - y;
      if (diff > 1 && tries <= 6) {
        const scroller = getScrollRoot(targetEl);
        const isWindow = (scroller === document.documentElement || scroller === document.body);
        if (isWindow) window.scrollBy(0, diff + 1);
        else scroller.scrollBy({ top: diff + 1 });
        requestAnimationFrame(step);
      } else {
        scheduleActiveUpdateNow();
      }
    };
    requestAnimationFrame(step);
  }

  function wirePanel(ui) {
    const toggleBtn = ui.nav.querySelector('.compact-toggle');
    const refreshBtn = ui.nav.querySelector('.compact-refresh');
    const starBtn = ui.nav.querySelector('.compact-star');

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


    // 底部按钮
    const prevBtn = ui.nav.querySelector('#cgpt-nav-prev');
    const nextBtn = ui.nav.querySelector('#cgpt-nav-next');
    const topBtn  = ui.nav.querySelector('#cgpt-nav-top');
    const bottomBtn = ui.nav.querySelector('#cgpt-nav-bottom');

    if (prevBtn) prevBtn.addEventListener('click', () => jumpActiveBy(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => jumpActiveBy(+1));
    if (topBtn) topBtn.addEventListener('click', () => jumpToEdge('top'));
    if (bottomBtn) bottomBtn.addEventListener('click', () => jumpToEdge('bottom'));

    // 键盘事件只绑定一次：避免重复绑定
    if (!window.__cgptKeysBound) {
      const onKeydown = (e) => {
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
          const list = ui.nav.querySelector('.compact-list');
          const toggleText = ui.nav.querySelector('.compact-toggle .toggle-text');
          const isHidden = list.getAttribute('data-hidden') === '1';
          if (isHidden) { list.style.visibility = 'visible'; list.style.height = ''; list.style.overflow = ''; list.setAttribute('data-hidden', '0'); if (toggleText) toggleText.textContent = '−'; }
          else { list.style.visibility = 'hidden'; list.style.height = '0'; list.style.overflow = 'hidden'; list.setAttribute('data-hidden', '1'); if (toggleText) toggleText.textContent = '+'; }
          e.preventDefault();
        }
      };

      document.addEventListener('keydown', onKeydown, { passive: false });
      window.__cgptKeysBound = true;
      if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 已绑定键盘事件');
    } else {
      if (DEBUG || window.DEBUG_TEMP) console.log('ChatGPT Navigation: 键盘事件已存在，跳过绑定');
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

  // 收藏 GC：默认只按 TTL 清理；当 removeInvalid=true 时再清理不在 validKeys 的条目
  function runFavoritesGC(saveAfter = false, validKeys = null, onlyPins = false, removeInvalid = false) {
    try {
      if (!favSet || !(favSet instanceof Set) || favSet.size === 0) return 0;
      const valid = removeInvalid ? (validKeys instanceof Set ? validKeys : new Set()) : null;
      // 仅当需要清理 invalid 时才构造 validKeys，避免 Gemini 虚拟渲染误伤
      if (removeInvalid && !(validKeys instanceof Set)) {
        try { const base = buildIndex(); base.forEach(i => valid.add(i.key)); } catch {}
        try { loadCPSet(); cpMap.forEach((_, pid) => valid.add(pid)); } catch {}
      }
      let removed = 0;
      const now = Date.now();
      for (const k of Array.from(favSet.values())) {
        if (onlyPins && !(typeof k === 'string' && k.startsWith('pin-'))) continue;
        const meta = favMeta.get(k) || { created: 0 };
        const expired = !meta.created || (now - meta.created) > FAV_TTL_MS;
        const invalid = !!(removeInvalid && valid && !valid.has(k));
        if (expired || invalid) { favSet.delete(k); favMeta.delete(k); removed++; }
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
      const el = getById(targetItem.id) || qsTurns()[targetItem.idx] || null;
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
    const scroller = getGeminiScroller();
    if (scroller) {
      const convo = deepQueryFirst(scroller, 'ucs-conversation');
      if (convo && convo.shadowRoot) return convo.shadowRoot;
      return scroller;
    }
    return getGeminiRoot() || document.body;
  }

  function observeChat(ui) {
    const target = getTurnsContainer() || document.body;
    if (ui._mo) {
      try { ui._mo.disconnect(); } catch {}
    }
    const mo = new MutationObserver((muts) => {
      const isLongChat = (lastDomTurnCount || 0) > 120;
      const hasStop = checkStreamingState(ui);
      const useSoft = isLongChat && !!hasStop;
      handleScrollLockMutations(muts);
      scheduleRefresh(ui, { delay: isLongChat ? 200 : 80, soft: useSoft });
    });

    mo.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-message-author-role', 'data-testid', 'data-message-id', 'class']
    });

    ui._mo = mo;
    ui._moTarget = target;

    // 定期兜底（10s 一次，别等 30s）
    if (forceRefreshTimer) clearInterval(forceRefreshTimer);
    forceRefreshTimer = setInterval(() => {
      const hasStop = !!checkStreamingState(ui, true);
      const count = qsTurns().length;
      if (!hasStop && count === lastDomTurnCount) return;
      scheduleRefresh(ui, { force: hasStop, soft: !hasStop && (lastDomTurnCount || 0) > 120 });
    }, 10000);
    ui._forceRefreshTimer = forceRefreshTimer;
  }

  // 防自动滚动（不改全局原型，避免与其他脚本冲突）
  function postScrollLockStateToMainWorld() {
    try {
      window.postMessage({ __quicknav: 1, type: 'QUICKNAV_SCROLLLOCK_STATE', enabled: !!scrollLockEnabled }, '*');
    } catch {}
  }

  let __quicknavBaselinePostAt = 0;
  let __quicknavBaselineTop = -1;

  function postScrollLockBaselineToMainWorld(top, force = false) {
    try {
      const px = Math.max(0, Math.round(Number(top) || 0));
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

  function bindMainWorldScrollGuardHandshake() {
    if (window.__quicknavScrollGuardHandshakeBound) return;
    window.__quicknavScrollGuardHandshakeBound = true;
    window.addEventListener('message', (e) => {
      try {
        if (!e || e.source !== window) return;
        const msg = e.data;
        if (!msg || typeof msg !== 'object' || msg.__quicknav !== 1) return;
        if (msg.type === 'QUICKNAV_SCROLL_GUARD_READY') {
          postScrollLockStateToMainWorld();
          if (scrollLockEnabled) postScrollLockBaselineToMainWorld(scrollLockStablePos, true);
        }
      } catch {}
    }, true);
  }

  function hasSavedScrollLockState() {
    try {
      // Userscript 环境下无法区分“未设置/默认值”，避免覆写
      if (typeof GM_getValue === 'function') return true;
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
      if (typeof GM_getValue === 'function') return !!GM_getValue(SCROLL_LOCK_KEY, true);
      const raw = window.localStorage.getItem(SCROLL_LOCK_KEY);
      if (raw === null) return true; // 默认开启
      return raw === '1';
    } catch { return false; }
  }

  function saveScrollLockState(on) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(SCROLL_LOCK_KEY, !!on);
      else window.localStorage.setItem(SCROLL_LOCK_KEY, on ? '1' : '0');
    } catch {}
  }

  function isWindowScroller(el) {
    const doc = document.documentElement;
    return !el || el === window || el === document || el === document.body || el === doc || el === (document.scrollingElement || doc);
  }

  function getChatScrollContainer() {
    try {
      const scroller = getGeminiScroller();
      if (scroller) return scroller;
      const root = getGeminiRoot();
      if (root && root.host) {
        const closest = findClosestScrollContainer(root.host);
        if (closest) return closest;
        return getScrollRoot(root.host);
      }
      return getScrollRoot(document.body);
    } catch { return getScrollRoot(document.body); }
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
    const prev = window.__cgptNavAllowScroll;
    window.__cgptNavAllowScroll = true;
    const value = Math.max(0, Math.round(top || 0));
    if (isWindowScroller(el)) {
      window.scrollTo({ top: value, behavior: 'auto' });
    } else {
      try { el.scrollTo({ top: value, behavior: 'auto' }); }
      catch { el.scrollTop = value; }
    }
    window.__cgptNavAllowScroll = prev;
  }

  function handleScrollLockUserScroll(evt) {
    const sc = scrollLockScrollEl || getChatScrollContainer();
    if (!sc) return;
    const now = Date.now();
    const pos = getScrollPos(sc);
    const guardActive = scrollLockEnabled && now < scrollLockGuardUntil;
    const trusted = !!(evt && evt.isTrusted);
    if (trusted) scrollLockLastUserIntentTs = now;
    const recentUserIntent = trusted || (now - (scrollLockLastUserIntentTs || 0)) <= SCROLL_LOCK_INTENT_MS || !!scrollLockPointerActive;
    const allowNav = !!window.__cgptNavAllowScroll;

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
    navAllowScrollDepth = Math.max(0, (navAllowScrollDepth || 0) + 1);
    window.__cgptNavAllowScroll = true;
    postScrollLockAllowToMainWorld(ms);
    setTimeout(() => {
      navAllowScrollDepth = Math.max(0, (navAllowScrollDepth || 0) - 1);
      if (navAllowScrollDepth === 0) window.__cgptNavAllowScroll = false;
    }, ms);
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
    const mark = (e) => {
      if (!scrollLockEnabled) return;
      if (ignoreIfInNav(e?.target)) return;
      scrollLockLastUserIntentTs = Date.now();
    };

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
        if (sc && sc.contains && sc.contains(e.target)) {
          scrollLockLastUserIntentTs = Date.now();
        }
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
    if (window.__cgptNavAllowScroll) return false;
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
    if (!scrollLockEnabled || window.__cgptNavAllowScroll) return false;
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
      if (scrollLockEnabled && !window.__cgptNavAllowScroll) {
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
        if (scrollLockEnabled && !window.__cgptNavAllowScroll) {
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
    updateLockBtnState(ui?.nav || getById('cgpt-compact-nav'));
    installScrollGuards();
    postScrollLockStateToMainWorld();
    if (scrollLockEnabled) postScrollLockBaselineToMainWorld(scrollLockStablePos, true);
    return scrollLockEnabled;
  }

  function initScrollLock(ui) {
    const hadSaved = hasSavedScrollLockState();
    scrollLockEnabled = loadScrollLockState();
    bindMainWorldScrollGuardHandshake();
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
    // Gemini Enterprise: 主要在 open shadow DOM 内
    if (node.matches('div.turn, .markdown-document, ucs-text-streamer, ucs-summary, ucs-response-markdown, div.summary, div.summary-contents')) return true;
    if (node.querySelector?.('div.turn, .markdown-document, ucs-text-streamer, ucs-summary, ucs-response-markdown, div.summary, div.summary-contents')) return true;
    return false;
  }

  function handleScrollLockMutations(muts) {
    if (!scrollLockEnabled || !muts || !muts.length) return;
    let relevant = false;
    for (const mut of muts) {
      if (mutationTouchesConversation(mut.target)) { relevant = true; break; }
      if (mut.addedNodes && mut.addedNodes.length) {
        for (const n of mut.addedNodes) {
          if (mutationTouchesConversation(n)) { relevant = true; break; }
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
      if (window.__cgptNavAllowScroll) return;
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
    document.addEventListener('scroll', onAnyScroll, { passive: true, capture: true });
    window.addEventListener('resize', onAnyScroll, { passive: true });
    const sc = getGeminiScroller();
    if (sc && sc !== activeScrollEl) {
      try { if (activeScrollEl) activeScrollEl.removeEventListener('scroll', onAnyScroll); } catch {}
      activeScrollEl = sc;
      try { sc.addEventListener('scroll', onAnyScroll, { passive: true }); }
      catch { sc.addEventListener('scroll', onAnyScroll); }
    }
    scheduleActiveUpdateNow();
  }

  // 绑定 Option+单击 添加📌
  function bindAltPin(ui) {
    if (window.__cgptPinBound) return;
    // 非 Alt 点击锚点：阻止默认，避免文本选中/抖动
    document.addEventListener('mousedown', (e) => {
      const path = (e && typeof e.composedPath === 'function') ? e.composedPath() : [];
      const hit = (Array.isArray(path) ? path : []).find((n) => n && n.nodeType === 1 && (
        (n.classList && n.classList.contains('cgpt-pin-anchor')) ||
        (n.closest && n.closest('.cgpt-pin-anchor'))
      ));
      const anc = hit && hit.nodeType === 1 ? (hit.classList && hit.classList.contains('cgpt-pin-anchor') ? hit : hit.closest('.cgpt-pin-anchor')) : null;
      if (anc && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    const onClick = (e) => {
      try {
        if (!e.altKey || e.button !== 0) return;
        const path = (e && typeof e.composedPath === 'function') ? e.composedPath() : [];
        const nt = (Array.isArray(path) ? path : []).find((n) => n && n.nodeType === 1) || e.target;
        if (!nt) return;
        if (Array.isArray(path) && path.some((n) => n && n.nodeType === 1 && (n.id === 'cgpt-compact-nav' || (n.closest && n.closest('#cgpt-compact-nav'))))) return; // 忽略在面板内
        // 若点击在内容中的📌图标上，则删除该📌
        const hit = (Array.isArray(path) ? path : []).find((n) => n && n.nodeType === 1 && (
          (n.classList && n.classList.contains('cgpt-pin-anchor')) ||
          (n.closest && n.closest('.cgpt-pin-anchor'))
        ));
        const anc = hit && hit.nodeType === 1 ? (hit.classList && hit.classList.contains('cgpt-pin-anchor') ? hit : hit.closest('.cgpt-pin-anchor')) : (nt.closest && nt.closest('.cgpt-pin-anchor'));
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
            if (favSet.has(pid)) { favSet.delete(pid); favMeta.delete(pid); saveFavSet(); updateStarBtnState(ui); }
            saveCPSet();
            scheduleRefresh(ui);
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
        if (!turn.getAttribute('data-gq-key')) {
          try { refreshIndex(ui, { force: true }); } catch {}
        }
        const msgKey = getTurnKey(turn) || turn.id;
        if (!msgKey) return;

        // 在点击位置插入隐形锚点
        const anchor = insertPinAnchorAtPoint(e.clientX, e.clientY, turn);
        if (!anchor) return;

        // 保存📌
        const pinId = `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
        const meta = { msgKey, anchorId: anchor.id, frac: anchor.frac, created: Date.now(), ctx: anchor.ctx || null, rel: anchor.rel || null };
        try { if (!cpMap || !(cpMap instanceof Map)) loadCPSet(); } catch {}
        cpMap.set(pinId, meta);
        try { const ae = getById(meta.anchorId); if (ae) ae.setAttribute('data-pin-id', pinId); } catch {}
        // 新增：图钉默认自动加入收藏夹
        try {
          if (!favSet || !(favSet instanceof Set)) loadFavSet();
          favSet.add(pinId);
          favMeta.set(pinId, { created: Date.now() });
          saveFavSet();
          updateStarBtnState(ui);
        } catch {}
        saveCPSet();
        runCheckpointGC(true);
        scheduleRefresh(ui);
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
    let el = closestCrossShadow(node, '[data-cgpt-turn="1"]');
    if (el) return el;
    // 兜底：尝试已知选择器
    el = closestCrossShadow(node, '.conversation-container') ||
      closestCrossShadow(node, 'div.turn') ||
      node.closest?.('article[data-testid^="conversation-turn-"],[data-testid^="conversation-turn-"],div[data-message-id],div[class*="group"][data-testid]') ||
      null;
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
    ensurePinAnchorStyled(span);
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
      // Gemini App
      'message-content',
      '.query-text',
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

  function ensurePinAnchorStyled(el) {
    if (!el || el.nodeType !== 1) return;
    const span = /** @type {HTMLElement} */ (el);
    if (!span.classList || !span.classList.contains('cgpt-pin-anchor')) return;
    // NOTE: 📌锚点经常被插入到 Gemini 的 open shadow roots 内，document.head 的 CSS 无法穿透，
    // 因此必须给锚点写入必要的 inline style，保证“可见 + 可定位”。（否则会出现“图钉不显示/定位不准”）
    try {
      if (!span.textContent || !span.textContent.trim()) span.textContent = '📌';
      span.style.position = 'absolute';
      span.style.width = '48px';
      span.style.height = '48px';
      span.style.display = 'flex';
      span.style.alignItems = 'center';
      span.style.justifyContent = 'center';
      span.style.transform = 'translate(-50%,-50%)';
      span.style.pointerEvents = 'auto';
      span.style.userSelect = 'none';
      span.style.webkitUserSelect = 'none';
      span.style.caretColor = 'transparent';
      span.style.cursor = 'default';
      span.style.zIndex = '2';
      span.style.fontSize = '40px';
      span.style.lineHeight = '1';
      span.style.opacity = '0.95';
      span.style.filter = 'drop-shadow(0 3px 3px rgba(0,0,0,0.5))';
      // 取面板的 CSS 变量作为颜色（有值则跟随主题），否则用亮色兜底。
      let color = '';
      try {
        const nav = document.getElementById('cgpt-compact-nav');
        if (nav) color = getComputedStyle(nav).getPropertyValue('--cgpt-nav-pin-color').trim();
      } catch {}
      span.style.color = color || '#4ade80';
    } catch {}

    // 绝对定位需要父级作为定位上下文
    try {
      const p = span.parentElement;
      if (p) {
        const cs = getComputedStyle(p);
        if (cs.position === 'static') p.style.position = 'relative';
      }
    } catch {}
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
    const getPath = (e) => {
      try {
        const p = e && typeof e.composedPath === 'function' ? e.composedPath() : null;
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    };

    const isSendButton = (el) => {
      try {
        if (!el || el.nodeType !== 1) return false;
        if (el.tagName !== 'BUTTON') return false;
        const label = (el.getAttribute('aria-label') || '').trim();
        const title = (el.getAttribute('title') || '').trim();
        const text = (el.textContent || '').trim();
        const hay = `${label} ${title} ${text}`.trim();
        // Gemini Enterprise uses aria-label="Submit" on the send button.
        return /^(submit|send|发送|提交)$/i.test(label) || /^(submit|send|发送|提交)$/i.test(text) || /\bsubmit\b/i.test(hay);
      } catch {
        return false;
      }
    };

    // Click send
    document.addEventListener('click', (e) => {
      const path = getPath(e);
      const hit = path.find(isSendButton);
      if (!hit) return;
      if (DEBUG || window.DEBUG_TEMP) console.log('Gemini Navigation: 检测到发送按钮点击，启动突发刷新');
      armScrollLockGuard(2200);
      startBurstRefresh(ui);
    }, true);

    // Keyboard send: Enter (common), Cmd/Ctrl+Enter (power users)
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.isComposing) return;
      if (e.shiftKey) return; // Shift+Enter usually means newline

      // Avoid accidental triggers for navigation shortcuts
      if (e.altKey) return;

      // Shadow DOM retargeting: rely on composedPath() instead of e.target.
      const path = getPath(e);
      const isEditable = path.some((node) => {
        if (!node || node.nodeType !== 1) return false;
        const el = /** @type {HTMLElement} */ (node);
        const tag = el.tagName;
        return tag === 'TEXTAREA' || tag === 'INPUT' || !!el.isContentEditable;
      });
      if (!isEditable) return;

      // Heuristic: plain Enter or Cmd/Ctrl+Enter
      if (DEBUG || window.DEBUG_TEMP) console.log('Gemini Navigation: 检测到输入区回车，启动突发刷新');
      armScrollLockGuard(2200);
      startBurstRefresh(ui);
    }, true);

    // 回到前台时强制跑一次
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (DEBUG || window.DEBUG_TEMP) console.log('Gemini Navigation: 页面重新可见，强制刷新');
        scheduleRefresh(ui, { force: true });
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
    const sc = getGeminiScroller();
    if (sc && sc.getBoundingClientRect) {
      const r = sc.getBoundingClientRect();
      return Math.max(0, Math.min(window.innerHeight - 20, r.top + (CONFIG.anchorOffset || 8)));
    }
    const h = getFixedHeaderHeight();
    return Math.max(0, Math.min(window.innerHeight - 20, h + (CONFIG.anchorOffset || 8)));
  }

  function updateActiveFromAnchor() {
    if (!cacheIndex.length) return;
    const y = getAnchorY();

    // Gemini Enterprise 的主要内容位于 open shadow DOM 内，document.elementsFromPoint()
    // 往往只能拿到 shadow host（无法直接命中 turn 内部元素）。
    // 因此这里改为基于 turn.getBoundingClientRect()（shadow-safe）定位 active turn。
    const turns = cachedTurns && cachedTurns.length ? cachedTurns : qsTurns();
    if (!turns || !turns.length) return;

    // 仅用 top + next.top 推进，避免 y 落在 turn 之间的空隙时发生“来回震荡”导致定位不稳
    let idx = Math.max(0, Math.min(turns.length - 1, currentActiveTurnPos || 0));
    let steps = 0;
    const maxSteps = 480;
    while (steps < maxSteps) {
      steps++;
      const t = turns[idx];
      if (!t || !t.getBoundingClientRect) break;
      const r = t.getBoundingClientRect();
      if (r.top > y) {
        if (idx > 0) { idx--; continue; }
        break;
      }
      const next = turns[idx + 1];
      if (next && next.getBoundingClientRect) {
        const rn = next.getBoundingClientRect();
        if (rn.top <= y) { idx++; continue; }
      }
      break;
    }
    // 极端跳转：兜底全量扫描一次（选 top <= y 的最后一个）
    if (steps >= maxSteps) {
      idx = 0;
      for (let i = 0; i < turns.length; i++) {
        const t = turns[i];
        if (!t || !t.getBoundingClientRect) continue;
        const r = t.getBoundingClientRect();
        if (r.top <= y) idx = i;
      }
    }

    const activeTurn = turns[idx] || null;
    if (!activeTurn) return;

    const qid = activeTurn.getAttribute('data-gq-qid') || '';
    const aid = activeTurn.getAttribute('data-gq-aid') || '';

    const qEl = qid ? getById(qid) : null;
    const aEl = aid ? getById(aid) : null;

    const dist = (node) => {
      if (!node || !node.getBoundingClientRect) return Infinity;
      const r = node.getBoundingClientRect();
      if (r.top <= y && r.bottom >= y) return 0;
      return Math.min(Math.abs(r.top - y), Math.abs(r.bottom - y));
    };
    const containsY = (node) => {
      if (!node || !node.getBoundingClientRect) return false;
      const r = node.getBoundingClientRect();
      return r.top <= y && r.bottom >= y;
    };

    const id = (() => {
      if (qEl && aEl) {
        const aIn = containsY(aEl);
        const qIn = containsY(qEl);
        if (aIn && !qIn) return aid || activeTurn.id;
        if (qIn && !aIn) return qid || activeTurn.id;
        return dist(aEl) <= dist(qEl) ? (aid || activeTurn.id) : (qid || activeTurn.id);
      }
      if (aEl) return aid || activeTurn.id;
      if (qEl) return qid || activeTurn.id;
      return activeTurn.id;
    })();

    setActiveTurn(id);
  }

  function findNearNextTop(y, eps) {
    const turns = cachedTurns && cachedTurns.length ? cachedTurns : qsTurns();
    if (!turns || !turns.length) return null;
    const start = Math.max(0, (currentActiveTurnPos || 0) - 3);
    const maxChecks = 30;
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
    // 允许在列表重渲染后“补涂”active（避免 currentActiveId 已设置但 DOM 高亮丢失）
    if (currentActiveId === id && list) {
      const already = list.querySelector(`.compact-item[data-id="${id}"]`);
      if (already && already.classList.contains('active')) return;
    }

    currentActiveId = id;
    currentActiveTurnPos = turnIdToPos.get(id) ?? currentActiveTurnPos;
    if (!list) return;
    list.querySelectorAll('.compact-item.active').forEach(n => n.classList.remove('active'));
    const n = list.querySelector(`.compact-item[data-id="${id}"]`);
    if (n) {
      n.classList.add('active');
      const r = n.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      if (r.top < lr.top) list.scrollTop += (r.top - lr.top - 4);
      else if (r.bottom > lr.bottom) list.scrollTop += (r.bottom - lr.bottom + 4);
    }
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
    const el = getById(id);
    if (el) { setActiveTurn(id); scrollToTurn(el); }
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  window.requestIdleCallback ||= (cb, opt = {}) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), opt.timeout || 1);
  window.cancelIdleCallback ||= (id) => clearTimeout(id);
})();
