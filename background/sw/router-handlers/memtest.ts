(() => {
  'use strict';

  const root = globalThis as any;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== 'object') root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;

  function handleMemtestMessage(context: any) {
    const { msg, sender, sendResponse, requireAllowedSender } = context || {};
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === 'AISHORTCUTS_MEMTEST_STATUS') {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      ns.monitors.memtestUpdateStatus(msg);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'AISHORTCUTS_MEMTEST_GUARD') {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      const reason = typeof msg.reason === 'string' ? msg.reason : 'memguard';
      ns.monitors.memtestCloseTestTab(reason);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'AISHORTCUTS_MEMTEST_ABORT') {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      const reason = typeof msg.reason === 'string' ? msg.reason : 'abort';
      ns.monitors.memtestBroadcastAbort(reason);
      ns.monitors.memtestCloseTestTab(reason);
      sendResponse({ ok: true });
      return true;
    }

    return false;
  }

  ns.routerHandlers = Object.assign({}, ns.routerHandlers || {}, {
    handleMemtestMessage
  });
})();
