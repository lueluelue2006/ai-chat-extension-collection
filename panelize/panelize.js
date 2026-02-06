(() => {
  'use strict';

  const CLOSE_REQUEST_MESSAGE_TYPE = '__qn_split_close_request_v1__';
  const STORE_LEFT_PX_KEY = 'qn_panelize_left_px_v1';

  const DEFAULT_LEFT_URL = 'https://chatgpt.com/';
  const DEFAULT_RIGHT_URL = 'https://chatgpt.com/';

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function normalizeUrl(raw) {
    try {
      const s = String(raw || '').trim();
      if (!s) return '';
      const u = new URL(s);
      if (u.protocol !== 'https:') return '';
      const host = String(u.hostname || '').toLowerCase();
      if (host !== 'chatgpt.com' && host !== 'chat.openai.com') return '';
      return u.toString();
    } catch {
      return '';
    }
  }

  function readNumber(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  }

  function writeNumber(key, val) {
    try {
      const n = Number(val);
      if (!Number.isFinite(n)) return;
      window.localStorage.setItem(key, String(n));
    } catch {}
  }

  function closeSelf(reason) {
    try {
      chrome.runtime.sendMessage({ type: 'QUICKNAV_SPLIT_PANEL_CLOSE', reason: String(reason || '') }, () => void chrome.runtime.lastError);
    } catch {}
    try {
      window.close();
    } catch {}
  }

  function setLoadingHidden(el, hidden) {
    if (!el) return;
    el.dataset.hidden = hidden ? '1' : '0';
  }

  function isRealProviderUrl(url) {
    try {
      const s = String(url || '').trim().toLowerCase();
      return s.startsWith('https://chatgpt.com/') || s.startsWith('https://chat.openai.com/');
    } catch {
      return false;
    }
  }

  function reloadIframe(iframe) {
    if (!iframe) return;
    try {
      const src = String(iframe.getAttribute('src') || iframe.src || '');
      iframe.src = 'about:blank';
      setTimeout(() => {
        iframe.src = src || DEFAULT_RIGHT_URL;
      }, 0);
    } catch {}
  }

  function applyLeftPx(grid, leftPx) {
    try {
      const n = Number(leftPx);
      if (!Number.isFinite(n) || n <= 0) return;
      grid.style.gridTemplateColumns = `${Math.round(n)}px var(--qn-divider-w) 1fr`;
    } catch {}
  }

  function init() {
    const grid = $('qn-panelize-grid');
    const divider = $('qn-panelize-divider');
    const leftIframe = $('qn-split-iframe-left');
    const rightIframe = $('qn-split-iframe-right');
    const leftLoading = $('qn-panelize-left-loading');
    const rightLoading = $('qn-panelize-right-loading');

    const params = new URLSearchParams(location.search);
    const leftUrl = normalizeUrl(params.get('left')) || DEFAULT_LEFT_URL;
    const rightUrl = normalizeUrl(params.get('right')) || DEFAULT_RIGHT_URL;

    // Important: delay iframe navigation until after the extension page has fully loaded.
    // This keeps the panel UI responsive even when chatgpt.com is experiencing high error rates
    // (and also helps our browser automation tools avoid waiting forever on subframe loads).
    let started = false;
    const startIframes = () => {
      if (started) return;
      started = true;
      try {
        setLoadingHidden(leftLoading, false);
        setLoadingHidden(rightLoading, false);
      } catch {}
      try {
        leftIframe.src = leftUrl;
      } catch {}
      try {
        rightIframe.src = rightUrl;
      } catch {}
    };

    window.addEventListener('load', () => setTimeout(startIframes, 0), { once: true });

    leftIframe.addEventListener('load', () => {
      try {
        if (!isRealProviderUrl(leftIframe.src)) return;
      } catch {
        return;
      }
      setLoadingHidden(leftLoading, true);
    });
    rightIframe.addEventListener('load', () => {
      try {
        if (!isRealProviderUrl(rightIframe.src)) return;
      } catch {
        return;
      }
      setLoadingHidden(rightLoading, true);
    });

    $('qn-panelize-close')?.addEventListener('click', () => closeSelf('ui'));
    $('qn-panelize-reload-left')?.addEventListener('click', () => {
      try {
        setLoadingHidden(leftLoading, false);
      } catch {}
      reloadIframe(leftIframe);
    });
    $('qn-panelize-reload-right')?.addEventListener('click', () => {
      try {
        setLoadingHidden(rightLoading, false);
      } catch {}
      reloadIframe(rightIframe);
    });

    // Restore divider state (best-effort).
    try {
      const rect = grid.getBoundingClientRect();
      const leftPx = readNumber(STORE_LEFT_PX_KEY, 0);
      if (leftPx > 0 && rect.width > 800) {
        const minLeft = 320;
        const maxLeft = rect.width - 320 - 10;
        applyLeftPx(grid, clamp(leftPx, minLeft, maxLeft));
      }
    } catch {}

    // Divider drag (pointer events).
    let dragging = false;
    let lastLeftPx = 0;
    divider?.addEventListener('pointerdown', (event) => {
      if (!event || event.button !== 0) return;
      dragging = true;
      try {
        divider.setPointerCapture(event.pointerId);
      } catch {}
      event.preventDefault();
    });

    divider?.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      try {
        const rect = grid.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const minLeft = 320;
        const maxLeft = rect.width - 320 - 10;
        lastLeftPx = clamp(x, minLeft, maxLeft);
        applyLeftPx(grid, lastLeftPx);
      } catch {}
    });

    divider?.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      if (lastLeftPx > 0) writeNumber(STORE_LEFT_PX_KEY, lastLeftPx);
    });

    divider?.addEventListener('pointercancel', () => {
      if (!dragging) return;
      dragging = false;
    });

    // Close requests from embedded iframes (Esc×3 inside iframe hotkeys).
    window.addEventListener('message', (event) => {
      try {
        const data = event?.data;
        if (!data || typeof data !== 'object') return;
        if (data.__qn !== 1) return;
        if (String(data.type || '') !== CLOSE_REQUEST_MESSAGE_TYPE) return;
        closeSelf('esc3');
      } catch {}
    });
  }

  try {
    init();
  } catch {}
})();
