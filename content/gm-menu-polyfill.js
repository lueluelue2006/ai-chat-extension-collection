(() => {
  'use strict';

  const commands = [];
  let nextId = 1;

  if (typeof window.GM_registerMenuCommand !== 'function') {
    window.GM_registerMenuCommand = (name, fn) => {
      const id = String(nextId++);
      commands.push({ id, name: String(name || ''), fn });
      return id;
    };
  }

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
        commands: commands.map((c) => ({ id: c.id, name: c.name }))
      });
      return true;
    }

    if (msg.type === 'QUICKNAV_RUN_MENU') {
      const id = String(msg.id || '');
      const cmd = commands.find((c) => c.id === id);
      if (!cmd) {
        sendResponse({ ok: false, error: 'Command not found' });
        return true;
      }
      try {
        cmd.fn();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      return true;
    }
  });
})();
