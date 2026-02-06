(() => {
  'use strict';

  // ChatGPT split-view (experimental) — Panelize-style popup
  //
  // New direction (2026-02-05):
  // - Stop embedding a same-origin ChatGPT iframe inside chatgpt.com (observed severe memory issues).
  // - Instead, open an extension popup page (`panelize/panelize.html`) that hosts ChatGPT in iframes.
  // - Keep this content script ~0-cost: only a small handle + Esc×3 hotkey + API bridge.

  const FLAG = '__quicknavChatgptSplitViewPanelizeV1__';
  const API_KEY = '__aichat_chatgpt_split_view_api_v1__';
  const API_VERSION = 2;

  // Split view UI must only exist in the top frame.
  try {
    if (window.self !== window.top) return;
  } catch {
    return;
  }

  try {
    if (globalThis[FLAG]) return;
    Object.defineProperty(globalThis, FLAG, { value: true, configurable: true });
  } catch {
    try {
      if (globalThis[FLAG]) return;
      globalThis[FLAG] = true;
    } catch {}
  }

  // Best-effort: if the legacy in-page split view is still running (from an older version),
  // ask it to hard-close so we don't keep stale observers/iframes alive.
  try {
    const legacy = window[API_KEY];
    legacy?.hardClose?.('superseded');
  } catch {}

  // Remove legacy DOM nodes if they exist (best-effort).
  try {
    const legacyIds = [
      'qn-split-root',
      'qn-split-pane',
      'qn-split-divider',
      'qn-split-topbar',
      'qn-split-ask',
      'qn-split-style'
    ];
    for (const id of legacyIds) {
      try {
        document.getElementById(id)?.remove?.();
      } catch {}
    }
    try {
      document.documentElement.classList.remove('qn-split-open');
    } catch {}
  } catch {}

  const STYLE_ID = 'qn-split-style';
  const HANDLE_ID = 'qn-split-handle';

  const MULTI_ESC_WINDOW_MS = 600;
  const CLOSE_ESC_PRESS_COUNT = 3;

  let lastEscAt = 0;
  let escStreak = 0;
  let lastKnownOpen = false;

  function sendToBackground(type, payload = null) {
    try {
      if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return Promise.resolve({ ok: false });
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: String(type || ''), ...(payload && typeof payload === 'object' ? payload : {}) },
            (res) => resolve(res || { ok: false })
          );
        } catch {
          resolve({ ok: false });
        }
      });
    } catch {
      return Promise.resolve({ ok: false });
    }
  }

  async function openPanelize() {
    const res = await sendToBackground('QUICKNAV_SPLIT_PANEL_OPEN', { leftUrl: location.href, mode: 'popup' });
    lastKnownOpen = !!res?.ok;
    updateHandleState();
    return !!res?.ok;
  }

  async function closePanelize(reason) {
    const res = await sendToBackground('QUICKNAV_SPLIT_PANEL_CLOSE', { reason: String(reason || '') });
    lastKnownOpen = false;
    updateHandleState();
    return !!res?.ok;
  }

  async function togglePanelize() {
    const res = await sendToBackground('QUICKNAV_SPLIT_PANEL_TOGGLE', { leftUrl: location.href, mode: 'popup' });
    if (typeof res?.open === 'boolean') lastKnownOpen = res.open;
    updateHandleState();
    return !!res?.ok;
  }

  function ensureStyle() {
    try {
      if (document.getElementById(STYLE_ID)) return true;
    } catch {}
    try {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${HANDLE_ID} {
          position: fixed;
          top: 50%;
          right: 0;
          transform: translateY(-50%);
          width: 14px;
          height: 56px;
          border-radius: 10px 0 0 10px;
          background: rgba(47, 125, 255, 0.92);
          box-shadow: 0 8px 22px rgba(0,0,0,0.28);
          z-index: 2147483646;
          cursor: pointer;
          user-select: none;
          opacity: 0.9;
        }
        #${HANDLE_ID}:hover { opacity: 1; }
        #${HANDLE_ID}::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 2px;
          height: 22px;
          transform: translate(-50%, -50%);
          background: rgba(255,255,255,0.75);
          border-radius: 2px;
        }
        #${HANDLE_ID}[data-open='1'] {
          background: rgba(47, 125, 255, 1);
        }
      `.trim();
      (document.head || document.documentElement).appendChild(style);
      return true;
    } catch {
      return false;
    }
  }

  function updateHandleState() {
    try {
      const handle = document.getElementById(HANDLE_ID);
      if (!handle) return;
      handle.dataset.open = lastKnownOpen ? '1' : '0';
      handle.title = lastKnownOpen ? 'QuickNav Split：已打开（点击关闭）' : 'QuickNav Split：点击打开（Esc×3）';
    } catch {}
  }

  function ensureHandle() {
    try {
      if (document.getElementById(HANDLE_ID)) return true;
    } catch {}

    if (!ensureStyle()) return false;
    try {
      const handle = document.createElement('div');
      handle.id = HANDLE_ID;
      handle.dataset.open = '0';
      handle.title = 'QuickNav Split：点击打开（Esc×3）';
      handle.addEventListener('click', (e) => {
        try {
          e?.preventDefault?.();
          e?.stopPropagation?.();
        } catch {}
        togglePanelize();
      });
      document.documentElement.appendChild(handle);
      return true;
    } catch {
      return false;
    }
  }

  function bindHotkey() {
    try {
      window.addEventListener(
        'keydown',
        (e) => {
          try {
            if (!e) return;
            if (e.key !== 'Escape') return;
            if (e.repeat) return;

            const now = Date.now();
            if (now - lastEscAt < MULTI_ESC_WINDOW_MS) escStreak += 1;
            else escStreak = 1;
            lastEscAt = now;

            if (escStreak >= CLOSE_ESC_PRESS_COUNT) {
              lastEscAt = 0;
              escStreak = 0;
              togglePanelize();
              e.preventDefault();
              e.stopPropagation();
              try {
                e.stopImmediatePropagation();
              } catch {}
            }
          } catch {}
        },
        true
      );
    } catch {}
  }

  function registerMenuCommands() {
    try {
      if (window.__qnSplitMenuRegisteredV2) return;
      window.__qnSplitMenuRegisteredV2 = true;
      const reg = window.__quicknavRegisterMenuCommand;
      if (typeof reg !== 'function') return;
      reg('打开 QuickNav Split（弹窗）', () => openPanelize());
      reg('关闭 QuickNav Split（释放内存）', () => closePanelize('menu'));
    } catch {}
  }

  function registerApi() {
    try {
      const prev = window[API_KEY];
      if (prev && typeof prev === 'object' && Number(prev.version || 0) >= API_VERSION) return;
    } catch {}

    const api = Object.freeze({
      version: API_VERSION,
      isOpen: () => !!lastKnownOpen,
      open: () => openPanelize(),
      close: () => closePanelize('api'),
      toggle: () => togglePanelize(),
      hardClose: (reason) => closePanelize(reason || 'hardClose')
    });

    try {
      Object.defineProperty(window, API_KEY, { value: api, configurable: true, enumerable: false, writable: false });
    } catch {
      try {
        window[API_KEY] = api;
      } catch {}
    }
  }

  function init() {
    ensureHandle();
    bindHotkey();
    registerMenuCommands();
    registerApi();
  }

  try {
    init();
  } catch {}
})();

