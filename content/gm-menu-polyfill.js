(() => {
  'use strict';

  const STATE_KEY = '__aichat_gm_menu_polyfill_state_v1__';
  /** @type {{commands: Array<{id: string, name: string, fn: Function}>, nextId: number, listenerInstalled: boolean}} */
  const state = (() => {
    try {
      const prev = window[STATE_KEY];
      if (prev && typeof prev === 'object' && Array.isArray(prev.commands)) return prev;
    } catch {}
    const fresh = { commands: [], nextId: 1, listenerInstalled: false };
    try {
      Object.defineProperty(window, STATE_KEY, { value: fresh, configurable: true, enumerable: false, writable: false });
    } catch {
      try {
        window[STATE_KEY] = fresh;
      } catch {}
    }
    return fresh;
  })();

  try {
    const existing = window.GM_registerMenuCommand;
    const isOurFn = !!(existing && existing.__aichat_gm_menu_polyfill);
    if (typeof existing !== 'function' || !isOurFn) {
      const register = (name, fn) => {
        const id = String(state.nextId++);
        state.commands.push({ id, name: String(name || ''), fn });
        return id;
      };
      register.__aichat_gm_menu_polyfill = true;
      window.GM_registerMenuCommand = register;
    }
  } catch {}

  // Ensure main-world scroll guards are installed (needed to block page-driven autoscroll reliably).
  try {
    if (!window.__quicknavScrollGuardRequested) {
      window.__quicknavScrollGuardRequested = true;
      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'QUICKNAV_ENSURE_SCROLL_GUARD' }, () => void chrome.runtime.lastError);
      }
    }
  } catch {}

  const canMessage = typeof chrome !== 'undefined' && chrome?.runtime?.onMessage?.addListener;
  if (!canMessage) return;
  if (state.listenerInstalled) return;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'QUICKNAV_GET_MENU') {
      sendResponse({
        ok: true,
        href: (() => {
          try {
            return location.href;
          } catch {
            return '';
          }
        })(),
        commands: state.commands.map((c) => ({ id: c.id, name: c.name }))
      });
      return true;
    }

    if (msg.type === 'QUICKNAV_RUN_MENU') {
      const id = String(msg.id || '');
      const cmd = state.commands.find((c) => c.id === id);
      if (!cmd) {
        sendResponse({ ok: false, error: 'Command not found' });
        return true;
      }
      try {
        const ret = cmd.fn();
        if (ret && typeof ret.then === 'function') {
          ret.then(() => sendResponse({ ok: true })).catch((e) => {
            sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
          });
          return true;
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      return true;
    }
  });

  state.listenerInstalled = true;
})();
