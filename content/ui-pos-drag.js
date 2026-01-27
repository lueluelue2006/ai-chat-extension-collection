(() => {
  'use strict';

  const API_KEY = '__aichat_ui_pos_drag_v1__';
  try {
    if (globalThis[API_KEY]) return;
  } catch {}

  function clampNum(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function viewportSize() {
    const vw = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
    // Prefer visualViewport height (avoids forced reflow and handles mobile keyboard).
    const vh = Math.max(window.visualViewport?.height || 0, window.innerHeight || 0);
    return { vw, vh };
  }

  function getSplitRightWidth() {
    try {
      const html = document.documentElement;
      if (!html || !html.classList || !html.classList.contains('qn-split-open')) return 0;
      const raw = getComputedStyle(html).getPropertyValue('--qn-split-right-width');
      const splitW = parseFloat(String(raw || '').trim());
      return Number.isFinite(splitW) && splitW > 0 ? splitW : 0;
    } catch {
      return 0;
    }
  }

  function effectiveViewportWidth({ splitAware }) {
    const { vw } = viewportSize();
    if (!splitAware) return vw;
    const splitW = getSplitRightWidth();
    if (!Number.isFinite(splitW) || splitW <= 0) return vw;
    const clamped = Math.min(Math.max(0, splitW), vw);
    return Math.max(0, vw - clamped);
  }

  function normalizePosV2(raw) {
    try {
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
        anchor,
        ts: Number.isFinite(Number(raw.ts)) ? Number(raw.ts) : Date.now()
      };
    } catch {
      return null;
    }
  }

  function posV2FromRect(rect, opts = {}) {
    const { vh } = viewportSize();
    const vw = effectiveViewportWidth({ splitAware: !!opts.splitAware });
    const safeVw = Math.max(0, vw);
    const safeVh = Math.max(0, vh);

    const centerX = rect.left + (rect.width || 0) / 2;
    const anchorRight = safeVw && centerX >= safeVw / 2;

    const clampBottomPx = Number.isFinite(Number(opts.clampBottomPx)) ? Number(opts.clampBottomPx) : 40;
    const maxTop = Math.max(0, safeVh - Math.max(0, clampBottomPx));
    const top = clampNum(rect.top, 0, maxTop || rect.top);

    const left = Math.max(0, rect.left);
    const right = Math.max(0, safeVw - rect.right);

    return {
      top,
      left: anchorRight ? null : left,
      right: anchorRight ? right : null,
      anchor: anchorRight ? 'right' : 'left',
      ts: Date.now()
    };
  }

  function posV2FromLegacyXY(x, y, width, height, opts = {}) {
    const { vh } = viewportSize();
    const vw = effectiveViewportWidth({ splitAware: !!opts.splitAware });
    const w = Math.max(0, Number(width) || 0);
    const h = Math.max(0, Number(height) || 0);
    const safeVw = Math.max(0, vw);
    const safeVh = Math.max(0, vh);

    const leftPx = clampNum(x, 0, Math.max(0, safeVw - w));
    const clampBottomPx = Number.isFinite(Number(opts.clampBottomPx)) ? Number(opts.clampBottomPx) : 40;
    const topPx = clampNum(y, 0, Math.max(0, safeVh - Math.min(Math.max(0, clampBottomPx), h || clampBottomPx)));

    const centerX = leftPx + w / 2;
    const anchorRight = safeVw && centerX >= safeVw / 2;
    const rightPx = Math.max(0, safeVw - (leftPx + w));

    return {
      top: topPx,
      left: anchorRight ? null : leftPx,
      right: anchorRight ? rightPx : null,
      anchor: anchorRight ? 'right' : 'left',
      ts: Date.now()
    };
  }

  function applyPosV2(el, posV2, widthHint, heightHint, opts = {}) {
    const pos = normalizePosV2(posV2);
    if (!el || !pos) return false;

    const { vh } = viewportSize();
    const vw = effectiveViewportWidth({ splitAware: !!opts.splitAware });
    const w = Math.max(0, Number(widthHint) || el.offsetWidth || 0);
    const h = Math.max(0, Number(heightHint) || el.offsetHeight || 0);
    const safeVw = Math.max(0, vw);
    const safeVh = Math.max(0, vh);

    const maxLeft = Math.max(0, safeVw - w);
    const maxRight = Math.max(0, safeVw - w);
    const clampBottomPx = Number.isFinite(Number(opts.clampBottomPx)) ? Number(opts.clampBottomPx) : 40;
    const maxTop = Math.max(0, safeVh - Math.min(Math.max(0, clampBottomPx), h || clampBottomPx));

    const top = clampNum(pos.top, 0, maxTop || pos.top);
    el.style.setProperty('top', `${Math.round(top)}px`, 'important');
    el.style.setProperty('bottom', 'auto', 'important');

    if (pos.anchor === 'right') {
      const right = clampNum(pos.right ?? 0, 0, maxRight || (pos.right ?? 0));
      el.style.setProperty('right', `${Math.round(right)}px`, 'important');
      el.style.setProperty('left', 'auto', 'important');
    } else {
      const left = clampNum(pos.left ?? 0, 0, maxLeft || (pos.left ?? 0));
      el.style.setProperty('left', `${Math.round(left)}px`, 'important');
      el.style.setProperty('right', 'auto', 'important');
    }
    return true;
  }

  function enableRightTopDrag(element, handle, opts = {}) {
    if (!element) return;
    const dragHandle = handle || element;
    if (!dragHandle || !dragHandle.addEventListener) return;

    const onDragStart = typeof opts.onDragStart === 'function' ? opts.onDragStart : null;
    const onDragMove = typeof opts.onDragMove === 'function' ? opts.onDragMove : null;
    const onDragEnd = typeof opts.onDragEnd === 'function' ? opts.onDragEnd : null;
    const shouldStart = typeof opts.shouldStart === 'function' ? opts.shouldStart : null;
    const isInteractive =
      typeof opts.isInteractive === 'function'
        ? opts.isInteractive
        : (target) => {
            try {
              if (!target || !target.closest) return false;
              return !!target.closest('button, a, input, textarea, select, [role="button"]');
            } catch {
              return false;
            }
          };

    const DRAG_THRESHOLD_PX = Number.isFinite(Number(opts.thresholdPx)) ? Number(opts.thresholdPx) : 6;
    let tracking = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startTop = 0;

    dragHandle.addEventListener('mousedown', (e) => {
      if (!e || e.button !== 0) return;
      if (shouldStart) {
        try {
          if (!shouldStart(e)) return;
        } catch {
          return;
        }
      }
      if (isInteractive(e.target)) return;

      tracking = true;
      dragStarted = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = element.getBoundingClientRect();
      startTop = rect.top;
      startRight = Math.max(0, (window.innerWidth || 0) - rect.right);
    });

    document.addEventListener('mousemove', (e) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragStarted) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        dragStarted = true;
        if (onDragStart) {
          try {
            onDragStart(e);
          } catch {}
        }
      }

      const newRight = Math.max(0, startRight - dx);
      element.style.setProperty('right', `${newRight}px`, 'important');
      element.style.setProperty('left', 'auto', 'important');
      element.style.setProperty('top', `${startTop + dy}px`, 'important');
      element.style.setProperty('bottom', 'auto', 'important');

      if (onDragMove) {
        try {
          onDragMove(e);
        } catch {}
      }
      try {
        e.preventDefault();
      } catch {}
    });

    document.addEventListener('mouseup', (e) => {
      if (!tracking) return;
      tracking = false;
      if (!dragStarted) return;
      dragStarted = false;
      if (onDragEnd) {
        try {
          onDragEnd(e);
        } catch {}
      }
    });
  }

  const api = {
    normalizePosV2,
    posV2FromRect,
    posV2FromLegacyXY,
    applyPosV2,
    enableRightTopDrag
  };

  try {
    Object.defineProperty(globalThis, API_KEY, {
      value: api,
      configurable: false,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }
})();
