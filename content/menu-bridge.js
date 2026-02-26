(() => {
  'use strict';

  // Internal menu bridge:
  // - Lets content scripts register "menu commands" (shown in the extension popup)
  // - Provides message handlers for popup -> page (get list / run command)
  //
  // This is an internal API for this extension (not a userscript compatibility layer).
  const STATE_KEY = '__quicknav_menu_bridge_state_v1__';
  const REGISTER_FN_KEY = '__quicknavRegisterMenuCommand';
  // Bridge MAIN-world modules that can't directly share function references with the isolated world.
  // MAIN -> isolated: register command
  // isolated -> MAIN: run command
  const MAIN_MENU_REGISTER_EVENT = '__quicknav_menu_bridge_register_main_command_v1__';
  const MAIN_MENU_RUN_EVENT = '__quicknav_menu_bridge_run_main_command_v1__';
  const MAIN_MENU_SOURCE = 'main-world';
  const MAIN_WORLD_ALLOWLIST = Object.freeze([
    // Only a few scripts run in MAIN world and need this bridge. Keep it tight to reduce page spoofing.
    Object.freeze({ group: 'ChatGPT 用量统计', handlerKeyPrefix: 'chatgpt_usage_monitor:' })
  ]);
  const MAX_COMMANDS = 100;
  /** @type {{commands: Array<{id: string, name: string, fn: Function, group?: string, source?: string, moduleId?: string, handlerKey?: string}>, nextId: number, listenerInstalled: boolean, __deduped?: boolean}} */
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

  try {
    const prevDispose = typeof state.dispose === 'function' ? state.dispose : null;
    if (prevDispose) prevDispose('reinjection');
  } catch {}

  function unbindMainMenuRegisterListener() {
    try {
      const mainListener = state.__mainMenuRegisterListener;
      state.__mainMenuRegisterListener = null;
      state.__mainMenuBridgeInstalled = false;
      if (typeof mainListener === 'function') {
        window.removeEventListener(MAIN_MENU_REGISTER_EVENT, mainListener, true);
      }
    } catch {}
  }

  function unbindRuntimeMessageListener() {
    try {
      const runtimeListener = state.__runtimeMessageListener;
      state.__runtimeMessageListener = null;
      state.listenerInstalled = false;
      if (typeof runtimeListener === 'function' && typeof chrome !== 'undefined' && chrome?.runtime?.onMessage?.removeListener) {
        chrome.runtime.onMessage.removeListener(runtimeListener);
      }
    } catch {}
  }

  state.dispose = (reason) => {
    unbindMainMenuRegisterListener();
    unbindRuntimeMessageListener();
    if (reason === 'reinjection') {
      state.commands = [];
      state.nextId = 1;
    }
    if (typeof reason === 'string' && reason) state.__lastDisposeReason = reason;
  };

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
        if (path.endsWith('content/menu-bridge.js')) continue;
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
    if (p.includes('chatgpt-usage-monitor')) return 'ChatGPT 用量统计';
    if (p.includes('ernie-quicknav')) return '文心一言 QuickNav';
    if (p.includes('deepseek-quicknav')) return 'DeepSeek QuickNav';
    if (p.includes('qwen-quicknav')) return 'Qwen QuickNav';
    if (p.includes('zai-quicknav')) return 'GLM QuickNav';
    if (p.includes('grok-quicknav')) return 'Grok QuickNav';
    if (p.includes('gemini-app-quicknav')) return 'Gemini App QuickNav';
    if (p.includes('genspark-quicknav')) return 'Genspark QuickNav';
    // Fallback to path tail
    const tail = p.split('/').filter(Boolean).slice(-2).join('/');
    return tail || p;
  }

  function readMenuMetadata(rawMetadata) {
    const meta = rawMetadata && typeof rawMetadata === 'object' ? rawMetadata : null;
    if (!meta) return { group: '', moduleId: '' };
    const group = String(meta.group || '').trim();
    const moduleId = String(meta.moduleId || '').trim();
    return {
      group: group.length <= 120 ? group : group.slice(0, 120),
      moduleId: moduleId.length <= 120 ? moduleId : moduleId.slice(0, 120)
    };
  }

  try {
    const register = (name, fn, metadata) => {
      const id = String(state.nextId++);
      const source = getCallerSource();
      const inferredGroup = sourceToGroup(source);
      const meta = readMenuMetadata(metadata);
      const group = meta.group || inferredGroup;
      const moduleId = meta.moduleId || '';
      // De-dupe: same group + same name should map to one latest handler
      const n = String(name || '');
      const existingCmd = state.commands.find((c) => c && c.group === group && c.name === n);
      if (existingCmd) {
        existingCmd.fn = fn;
        existingCmd.source = source;
        if (moduleId) existingCmd.moduleId = moduleId;
        return existingCmd.id;
      }
      const command = { id, name: n, fn, group, source };
      if (moduleId) command.moduleId = moduleId;
      state.commands.push(command);
      if (state.commands.length > MAX_COMMANDS) state.commands = state.commands.slice(-MAX_COMMANDS);
      return id;
    };
    register.__quicknav_menu_bridge = true;
    window[REGISTER_FN_KEY] = register;
  } catch {}

  // MAIN-world menu command bridge (via CustomEvent).
  try {
    unbindMainMenuRegisterListener();

    const onMainMenuRegister = (e) => {
      try {
        const d = e?.detail && typeof e.detail === 'object' ? e.detail : {};
        const name = String(d.name || '').trim();
        const handlerKey = String(d.handlerKey || '').trim();
        const group = String(d.group || 'Main').trim() || 'Main';
        const moduleId = String(d.moduleId || '').trim();
        if (!name || !handlerKey) return;
        if (name.length > 120 || handlerKey.length > 240 || group.length > 120 || moduleId.length > 120) return;

        const allow = MAIN_WORLD_ALLOWLIST.some((r) => r && r.group === group && handlerKey.startsWith(String(r.handlerKeyPrefix || '')));
        if (!allow) return;

        const runProxy = () => {
          try {
            window.dispatchEvent(new CustomEvent(MAIN_MENU_RUN_EVENT, { detail: { handlerKey } }));
          } catch {}
        };

        // De-dupe (group+name) across all sources and update handlerKey if re-registered.
        const existingCmd = state.commands.find((c) => c && c.group === group && c.name === name);
        if (existingCmd) {
          existingCmd.fn = runProxy;
          existingCmd.handlerKey = handlerKey;
          existingCmd.source = MAIN_MENU_SOURCE;
          if (moduleId) existingCmd.moduleId = moduleId;
          return;
        }

        const id = String(state.nextId++);
        const command = { id, name, fn: runProxy, group, source: MAIN_MENU_SOURCE, handlerKey };
        if (moduleId) command.moduleId = moduleId;
        state.commands.push(command);
        if (state.commands.length > MAX_COMMANDS) state.commands = state.commands.slice(-MAX_COMMANDS);
      } catch {}
    };

    window.addEventListener(MAIN_MENU_REGISTER_EVENT, onMainMenuRegister, true);
    state.__mainMenuRegisterListener = onMainMenuRegister;
    state.__mainMenuBridgeInstalled = true;
  } catch {}

  // Ensure main-world scroll guards are installed (needed to block page-driven autoscroll reliably).
  try {
    if (!window.__quicknavScrollGuardRequested) {
      window.__quicknavScrollGuardRequested = true;
      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'AISHORTCUTS_ENSURE_SCROLL_GUARD' }, () => void chrome.runtime.lastError);
      }
    }
  } catch {}

  unbindRuntimeMessageListener();

  const canMessage = typeof chrome !== 'undefined' && chrome?.runtime?.onMessage?.addListener;
  if (!canMessage) return;

  const onRuntimeMessage = (msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'AISHORTCUTS_GET_MENU') {
      const list = (state.commands || []).filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string').slice(-MAX_COMMANDS);
      sendResponse({
        ok: true,
        href: (() => {
          try {
            return location.href;
          } catch {
            return '';
          }
        })(),
        commands: list.map((c) => {
          const command = { id: c.id, name: c.name, group: c.group || 'unknown' };
          if (typeof c.moduleId === 'string' && c.moduleId) command.moduleId = c.moduleId;
          return command;
        })
      });
      return true;
    }

    if (msg.type === 'AISHORTCUTS_RUN_MENU') {
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
  };

  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  state.__runtimeMessageListener = onRuntimeMessage;

  state.listenerInstalled = true;
})();
