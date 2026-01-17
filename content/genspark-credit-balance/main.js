(() => {
  'use strict';

  const GUARD_KEY = '__aichat_genspark_credit_balance_v1__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  if (window.top !== window) return;

  const STYLE_ID = '__aichat_genspark_credit_balance_style_v1__';
  const POS_STORAGE_KEY = 'aichat_genspark_credit_balance_pos_v1';

  const HOVER_BOX_ID = 'aichat-genspark-credit-hover-box';
  const HOVER_DOT_ID = 'aichat-genspark-credit-hover-dot';
  const WINDOW_ID = 'aichat-genspark-credit-info-window';
  const HEADER_ID = 'aichat-genspark-credit-info-header';
  const CONTENT_ID = 'aichat-genspark-credit-info-content';
  const REFRESH_BUTTON_ID = 'aichat-genspark-credit-refresh-button';

  const COLLAPSED_CLASS = 'aichat-collapsed';
  const SHOW_CLASS = 'aichat-show';

  const API_URL_BASE = 'https://www.genspark.ai/api/payment/get_credit_history';
  const REFRESH_INTERVAL_MS = 60 * 1000;

  const HOVER_BOX_SIZE = 32;
  const PANEL_WIDTH = 280;
  const PANEL_TOP_OFFSET = 5;
  const DRAG_THRESHOLD_PX = 4;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function storageGet(area, defaults) {
    return new Promise((resolve) => {
      try {
        area.get(defaults, (res) => resolve(res || defaults));
      } catch {
        resolve(defaults);
      }
    });
  }

  function storageSet(area, items) {
    return new Promise((resolve) => {
      try {
        area.set(items, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  async function ensureBody() {
    if (document.body) return document.body;
    if (document.readyState !== 'loading') return document.body;
    await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    return document.body;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const styleSheet = document.createElement('style');
    styleSheet.id = STYLE_ID;
    styleSheet.textContent = `
      #${HOVER_BOX_ID} {
        position: fixed;
        width: ${HOVER_BOX_SIZE}px;
        height: ${HOVER_BOX_SIZE}px;
        border-radius: 8px;
        background: rgba(220,232,245,0.10);
        z-index: 9999;
        cursor: pointer;
        transition: background 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 12px rgba(0,0,0,0.07);
        user-select: none;
        touch-action: none;
      }
      #${HOVER_BOX_ID}:hover {
        background: #e6f1fa;
      }
      #${HOVER_DOT_ID} {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #59a6f7;
        opacity: 0.5;
        pointer-events: none;
      }
      #${WINDOW_ID} {
        position: fixed;
        background-color: #ffffff;
        border: none;
        border-radius: 10px;
        padding: 0;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        width: ${PANEL_WIDTH}px;
        opacity: 1;
        transition: opacity 0.3s ease, transform 0.3s ease;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        overflow: hidden;
        cursor: default;
        display: none;
      }
      #${WINDOW_ID}.${SHOW_CLASS} { display: block; }
      #${HEADER_ID} {
        padding: 8px 12px;
        background-color: #f0f4f8;
        margin-bottom: 0;
        font-weight: bold;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #2c3e50;
        cursor: pointer;
        position: relative;
        border-bottom: 1px solid transparent;
        transition: border-color 0.3s ease;
        user-select: none;
        touch-action: none;
      }
      #${WINDOW_ID}.${COLLAPSED_CLASS} #${HEADER_ID} {
        border-bottom-left-radius: 6px;
        border-bottom-right-radius: 6px;
        border-bottom: 1px solid #e0e4e8;
      }
      #${HEADER_ID}::after {
        content: '▲';
        font-size: 10px;
        color: #7f8c8d;
        position: absolute;
        right: 35px;
        top: 50%;
        transform: translateY(-50%);
        transition: transform 0.3s ease;
      }
      #${WINDOW_ID}.${COLLAPSED_CLASS} #${HEADER_ID}::after { content: '▼'; }
      #${REFRESH_BUTTON_ID} {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 18px;
        color: #3498db;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s;
        padding: 0;
        z-index: 1;
        position: relative;
      }
      #${REFRESH_BUTTON_ID}:hover { background-color: #e8f4fc; }
      #${CONTENT_ID} {
        display: block;
        padding: 12px;
        line-height: 1.5;
        color: #333;
        transition: max-height 0.35s ease-out, opacity 0.3s ease-in-out, padding 0.35s ease-out;
        max-height: 500px;
        opacity: 1;
        overflow: hidden;
        background-color: #ffffff;
        border-top: 1px solid #e0e4e8;
      }
      #${WINDOW_ID}.${COLLAPSED_CLASS} #${CONTENT_ID} {
        max-height: 0;
        opacity: 0;
        padding-top: 0;
        padding-bottom: 0;
        border-top-color: transparent;
      }
      #${WINDOW_ID} .info-section { margin-bottom: 12px; padding: 8px; background-color: #f8f9fa; border-radius: 6px; }
      #${WINDOW_ID} .info-section:last-child { margin-bottom: 0; }
      #${WINDOW_ID} .info-section strong { color: #2c3e50; }
      #${WINDOW_ID} .info-section .highlight { color: #27ae60; font-weight: bold; }
      #${WINDOW_ID} .info-section .plan { text-transform: capitalize; font-weight: bold; }
      #${WINDOW_ID} .model-usage-item { display: flex; justify-content: space-between; margin: 3px 0; }
      #${WINDOW_ID} .model-usage-item .model-name { color: #3498db; }
      #${WINDOW_ID} .model-usage-item .model-count { font-weight: bold; }
      #${WINDOW_ID} .query-period-details div { margin-top: 3px; }
      #${WINDOW_ID} .query-period-details .label { color: #7f8c8d; display: inline-block; width: 40px; }
      #${WINDOW_ID} .loading-message, #${WINDOW_ID} .error-message { padding: 10px; text-align: center; color: #7f8c8d; }
      #${WINDOW_ID} .error-message { color: red; font-weight: bold; }
    `;
    const root = document.head || document.documentElement;
    if (root) root.appendChild(styleSheet);
  }

  function formatModelUsage(modelUsage) {
    const usage = modelUsage && typeof modelUsage === 'object' ? modelUsage : {};
    const keys = Object.keys(usage);
    let html = '<div style="padding-left: 10px; margin-top: 5px;">';
    if (!keys.length) html += '无模型使用记录';
    else {
      for (const model of keys) {
        html += `<div class="model-usage-item">
          <span class="model-name">${String(model)}:</span>
          <span class="model-count">${String(usage[model])}</span>
        </div>`;
      }
    }
    html += '</div>';
    return html;
  }

  function formatQueryPeriod(queryPeriod) {
    const qp = queryPeriod && typeof queryPeriod === 'object' ? queryPeriod : null;
    if (!qp?.start_time || !qp?.end_time) return '<div>查询时间段信息不可用</div>';
    const startTime = new Date(qp.start_time).toLocaleString();
    const endTime = new Date(qp.end_time).toLocaleString();
    return `<div class="query-period-details" style="padding-left: 10px; margin-top: 5px;">
      <div><span class="label">开始:</span> ${startTime}</div>
      <div><span class="label">结束:</span> ${endTime}</div>
    </div>`;
  }

  function setLoading(elContent) {
    elContent.innerHTML = '<div class="loading-message">加载中...</div>';
  }

  function setError(elContent, message) {
    elContent.innerHTML = `<div class="error-message">${String(message || '出错了')}</div>`;
  }

  function updateContent(elContent, data) {
    const d = data && typeof data === 'object' ? data : {};
    const modelUsageHtml = formatModelUsage(d.model_usage || {});
    const queryPeriodHtml = formatQueryPeriod(d.query_period);
    const planDisplay = d.plan || '未知';
    const balance = d.current_balance !== undefined ? d.current_balance : 'N/A';
    elContent.innerHTML = `
      <div class="info-section">
        <strong>当前余额:</strong> <span class="highlight">${String(balance)}</span>
      </div>
      <div class="info-section">
        <strong>套餐:</strong> <span class="plan">${String(planDisplay)}</span>
      </div>
      <div class="info-section">
        <strong>模型使用情况:</strong>
        ${modelUsageHtml}
      </div>
      <div class="info-section">
        <strong>查询时间段:</strong>
        ${queryPeriodHtml}
      </div>
    `;
  }

  async function fetchAccountInfo(elContent) {
    setLoading(elContent);

    const now = new Date();
    const endDate = new Date(now);
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 1);

    const url = `${API_URL_BASE}?start_date=${encodeURIComponent(startDate.toISOString())}&end_date=${encodeURIComponent(endDate.toISOString())}`;

    let resp;
    try {
      resp = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: '*/*', 'Cache-Control': 'no-cache' }
      });
    } catch (e) {
      setError(elContent, '获取数据时出错');
      return;
    }

    if (!resp || !resp.ok) {
      setError(elContent, `请求失败：${resp ? resp.status : 'unknown'}`);
      return;
    }

    let json;
    try {
      json = await resp.json();
    } catch (e) {
      setError(elContent, '解析响应时出错');
      return;
    }

    try {
      if (json && json.status === 0 && json.data) {
        updateContent(elContent, json.data);
        return;
      }
      setError(elContent, '未能获取有效数据');
    } catch {
      setError(elContent, '渲染数据时出错');
    }
  }

  function applyHoverBoxPos(elHoverBox, pos) {
    const w = Number.isFinite(pos?.left) ? Number(pos.left) : window.innerWidth - 15 - HOVER_BOX_SIZE;
    const h = Number.isFinite(pos?.top) ? Number(pos.top) : 15;
    const left = clamp(w, 0, Math.max(0, window.innerWidth - HOVER_BOX_SIZE));
    const top = clamp(h, 0, Math.max(0, window.innerHeight - HOVER_BOX_SIZE));
    elHoverBox.style.left = `${Math.round(left)}px`;
    elHoverBox.style.top = `${Math.round(top)}px`;
    elHoverBox.style.right = 'auto';
    elHoverBox.style.bottom = 'auto';
  }

  function readHoverBoxPos(elHoverBox) {
    const rect = elHoverBox.getBoundingClientRect();
    return { top: rect.top, left: rect.left };
  }

  function syncWindowPos(elHoverBox, elWindow) {
    const boxRect = elHoverBox.getBoundingClientRect();
    const winWidth = PANEL_WIDTH;
    const winHeight = isVisible(elWindow) ? elWindow.getBoundingClientRect().height : 0;

    // Prefer aligning to the right edge of the dot; if it would overflow, flip to the left edge.
    const preferLeft = boxRect.left + boxRect.width - winWidth;
    const preferRight = boxRect.left;
    const desiredTop = boxRect.top + PANEL_TOP_OFFSET;

    let left = preferLeft;
    if (preferLeft < 0 && preferRight + winWidth <= window.innerWidth) left = preferRight;
    left = clamp(left, 0, Math.max(0, window.innerWidth - winWidth));
    const top = clamp(desiredTop, 0, Math.max(0, window.innerHeight - (winHeight || 0)));

    elWindow.style.left = `${Math.round(left)}px`;
    elWindow.style.top = `${Math.round(top)}px`;
    elWindow.style.right = 'auto';
    elWindow.style.bottom = 'auto';
  }

  function setupInteractions({ elHoverBox, elWindow, elHeader, elRefreshButton, persistPos }) {
    const state = {
      hoveringDot: false,
      hoveringPanel: false,
      dragging: false,
      dragPointerId: null,
      dragCaptureEl: null,
      dragStartX: 0,
      dragStartY: 0,
      dragStartTop: 0,
      dragStartLeft: 0,
      dragMoved: false,
      suppressHeaderClick: false,
      showTimer: 0,
      hideTimer: 0
    };

    function clearTimers() {
      clearTimeout(state.showTimer);
      clearTimeout(state.hideTimer);
      state.showTimer = 0;
      state.hideTimer = 0;
    }

    function openPanel() {
      elWindow.classList.add(SHOW_CLASS);
      syncWindowPos(elHoverBox, elWindow);
    }

    function closePanel() {
      elWindow.classList.remove(SHOW_CLASS);
    }

    function shouldKeepOpen() {
      return state.dragging || state.hoveringDot || state.hoveringPanel;
    }

    function scheduleOpen() {
      clearTimeout(state.hideTimer);
      clearTimeout(state.showTimer);
      state.showTimer = setTimeout(() => {
        openPanel();
      }, 80);
    }

    function scheduleClose() {
      clearTimeout(state.showTimer);
      clearTimeout(state.hideTimer);
      state.hideTimer = setTimeout(() => {
        if (shouldKeepOpen()) return;
        closePanel();
      }, 200);
    }

    function updateHoverFromPoint(x, y) {
      try {
        const el = document.elementFromPoint(x, y);
        state.hoveringDot = !!(el && elHoverBox.contains(el));
        state.hoveringPanel = !!(el && elWindow.contains(el));
      } catch {
        state.hoveringDot = false;
        state.hoveringPanel = false;
      }
    }

    function beginDrag(e, captureEl) {
      if (e.button !== undefined && e.button !== 0) return;
      state.dragging = true;
      state.dragMoved = false;
      state.dragPointerId = e.pointerId ?? 'mouse';
      state.dragCaptureEl = captureEl || null;
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      const pos = readHoverBoxPos(elHoverBox);
      state.dragStartTop = pos.top;
      state.dragStartLeft = pos.left;
      clearTimers();
      openPanel();
      try {
        state.dragCaptureEl?.setPointerCapture?.(e.pointerId);
      } catch {}
    }

    async function endDrag(e) {
      if (!state.dragging) return;
      if ((e.pointerId ?? 'mouse') !== state.dragPointerId) return;
      state.dragging = false;
      try {
        state.dragCaptureEl?.releasePointerCapture?.(e.pointerId);
      } catch {}
      state.dragPointerId = null;
      state.dragCaptureEl = null;

      if (state.dragMoved) {
        state.suppressHeaderClick = true;
        setTimeout(() => {
          state.suppressHeaderClick = false;
        }, 0);
        const pos = readHoverBoxPos(elHoverBox);
        await persistPos(pos);
      }

      updateHoverFromPoint(e.clientX, e.clientY);
      if (shouldKeepOpen()) scheduleOpen();
      else scheduleClose();
    }

    function onPointerMove(e) {
      if (!state.dragging) return;
      if ((e.pointerId ?? 'mouse') !== state.dragPointerId) return;

      const dx = e.clientX - state.dragStartX;
      const dy = e.clientY - state.dragStartY;
      if (!state.dragMoved && (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX)) state.dragMoved = true;
      if (!state.dragMoved) return;

      const nextTop = clamp(state.dragStartTop + dy, 0, Math.max(0, window.innerHeight - HOVER_BOX_SIZE));
      const nextLeft = clamp(state.dragStartLeft + dx, 0, Math.max(0, window.innerWidth - HOVER_BOX_SIZE));
      applyHoverBoxPos(elHoverBox, { top: nextTop, left: nextLeft });
      openPanel();
      e.preventDefault();
    }

    function onHeaderClick(e) {
      if (state.suppressHeaderClick) return;
      if (elRefreshButton && elRefreshButton.contains(e.target)) return;
      elWindow.classList.toggle(COLLAPSED_CLASS);
      openPanel();
    }

    elHoverBox.addEventListener('pointerenter', () => {
      state.hoveringDot = true;
      scheduleOpen();
    });
    elHoverBox.addEventListener('pointerleave', () => {
      state.hoveringDot = false;
      scheduleClose();
    });
    elWindow.addEventListener('pointerenter', () => {
      state.hoveringPanel = true;
      scheduleOpen();
    });
    elWindow.addEventListener('pointerleave', () => {
      state.hoveringPanel = false;
      scheduleClose();
    });

    elHoverBox.addEventListener(
      'pointerdown',
      (e) => {
        beginDrag(e, elHoverBox);
      },
      { passive: true }
    );
    elHeader.addEventListener(
      'pointerdown',
      (e) => {
        if (elRefreshButton && elRefreshButton.contains(e.target)) return;
        beginDrag(e, elHeader);
      },
      { passive: true }
    );
    elHeader.addEventListener('click', onHeaderClick);

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', (e) => void endDrag(e), { passive: true });
    window.addEventListener('pointercancel', (e) => void endDrag(e), { passive: true });

    // Ensure initial state is consistent
    clearTimers();
    if (!shouldKeepOpen()) closePanel();
  }

  async function boot() {
    injectStyles();
    await ensureBody();

    if (document.getElementById(HOVER_BOX_ID) || document.getElementById(WINDOW_ID)) return;

    const elHoverBox = document.createElement('div');
    elHoverBox.id = HOVER_BOX_ID;
    elHoverBox.title = '鼠标悬停显示 Genspark 积分余量（可拖动位置）';
    const elHoverDot = document.createElement('div');
    elHoverDot.id = HOVER_DOT_ID;
    elHoverBox.appendChild(elHoverDot);

    const elWindow = document.createElement('div');
    elWindow.id = WINDOW_ID;

    const elHeader = document.createElement('div');
    elHeader.id = HEADER_ID;
    elHeader.textContent = 'Genspark 积分信息';

    const refreshButton = document.createElement('button');
    refreshButton.id = REFRESH_BUTTON_ID;
    refreshButton.type = 'button';
    refreshButton.textContent = '↻';
    refreshButton.title = '刷新';
    elHeader.appendChild(refreshButton);
    elWindow.appendChild(elHeader);

    const elContent = document.createElement('div');
    elContent.id = CONTENT_ID;
    elWindow.appendChild(elContent);

    document.body.appendChild(elHoverBox);
    document.body.appendChild(elWindow);

    const defaults = { [POS_STORAGE_KEY]: null };
    const saved = await storageGet(chrome.storage.sync, defaults);
    const pos = saved?.[POS_STORAGE_KEY];
    applyHoverBoxPos(elHoverBox, pos);
    syncWindowPos(elHoverBox, elWindow);

    async function persistPos(nextPos) {
      const payload = {
        top: Number.isFinite(nextPos?.top) ? Math.round(Number(nextPos.top)) : 15,
        left: Number.isFinite(nextPos?.left) ? Math.round(Number(nextPos.left)) : window.innerWidth - 15 - HOVER_BOX_SIZE
      };
      await storageSet(chrome.storage.sync, { [POS_STORAGE_KEY]: payload });
    }

    setupInteractions({ elHoverBox, elWindow, elHeader, elRefreshButton: refreshButton, persistPos });

    refreshButton.addEventListener('click', (e) => {
      e.stopPropagation();
      void fetchAccountInfo(elContent);
    });

    window.addEventListener('resize', () => {
      const curr = readHoverBoxPos(elHoverBox);
      applyHoverBoxPos(elHoverBox, curr);
      syncWindowPos(elHoverBox, elWindow);
    });

    void fetchAccountInfo(elContent);
    setInterval(() => void fetchAccountInfo(elContent), REFRESH_INTERVAL_MS);

    // 给 layout 一个机会取到真实高度（用于 clamp）
    await sleep(0);
    syncWindowPos(elHoverBox, elWindow);
  }

  void boot();
})();
