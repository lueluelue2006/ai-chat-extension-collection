(() => {
  'use strict';

  const STATE_KEY = '__aichat_gm_menu_polyfill_state_v1__';
  /** @type {{commands: Array<{id: string, name: string, fn: Function, group?: string, source?: string}>, nextId: number, listenerInstalled: boolean, __deduped?: boolean}} */
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

  // One-time cleanup for old duplicated commands (if any).
  try {
    if (!state.__deduped) {
      const seen = new Map(); // key -> cmd
      const next = [];
      for (const c of Array.isArray(state.commands) ? state.commands : []) {
        if (!c || typeof c !== 'object') continue;
        const g = String(c.group || '');
        const n = String(c.name || '');
        const key = `${g}\n${n}`;
        if (seen.has(key)) continue;
        seen.set(key, c);
        next.push(c);
      }
      state.commands = next;
      state.__deduped = true;
    }
  } catch {}

  function getCallerSource() {
    try {
      const stack = new Error().stack;
      if (!stack) return '';
      const lines = String(stack).split('\n').map((l) => l.trim()).filter(Boolean);
      // Find first chrome-extension url that isn't this file.
      for (const line of lines) {
        const m = line.match(/chrome-extension:\/\/[^/]+\/([^\s:)]+\.js)/i);
        if (!m) continue;
        const path = m[1];
        // Skip frames from this polyfill itself.
        if (path.endsWith('content/gm-menu-polyfill.js')) continue;
        return path;
      }
      return '';
    } catch {
      return '';
    }
  }

  function sourceToGroup(sourcePath) {
    const p = String(sourcePath || '');
    if (!p) return 'unknown';
    if (p.includes('chatgpt-export-conversation')) return 'ChatGPT 对话导出';
    if (p.includes('chatgpt-quicknav')) return 'ChatGPT QuickNav';
    if (p.includes('ernie-quicknav')) return '文心一言 QuickNav';
    if (p.includes('deepseek-quicknav')) return 'DeepSeek QuickNav';
    if (p.includes('qwen-quicknav')) return 'Qwen QuickNav';
    if (p.includes('zai-quicknav')) return 'GLM QuickNav';
    if (p.includes('grok-quicknav')) return 'Grok QuickNav';
    if (p.includes('gemini-app-quicknav')) return 'Gemini App QuickNav';
    if (p.includes('gemini-quicknav')) return 'Gemini Enterprise QuickNav';
    if (p.includes('genspark-quicknav')) return 'Genspark QuickNav';
    // Fallback to path tail
    const tail = p.split('/').filter(Boolean).slice(-2).join('/');
    return tail || p;
  }

  try {
    const existing = window.GM_registerMenuCommand;
    const isOurFn = !!(existing && existing.__aichat_gm_menu_polyfill);
    if (typeof existing !== 'function' || !isOurFn) {
      const register = (name, fn) => {
        const id = String(state.nextId++);
        const source = getCallerSource();
        const group = sourceToGroup(source);
        // De-dupe: same group + same name should map to one latest handler
        const n = String(name || '');
        const existingCmd = state.commands.find((c) => c && c.group === group && c.name === n);
        if (existingCmd) {
          existingCmd.fn = fn;
          existingCmd.source = source;
          return existingCmd.id;
        }
        state.commands.push({ id, name: n, fn, group, source });
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
        commands: state.commands.map((c) => ({ id: c.id, name: c.name, group: c.group || 'unknown' }))
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
