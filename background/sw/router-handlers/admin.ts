(() => {
  'use strict';

  const root = globalThis as any;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== 'object') root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;

  function handleAdminMessage(context: any) {
    const {
      msg,
      sender,
      sendResponse,
      requireAllowedSender,
      respondError,
      diagLog,
      openOptionsPageForSender
    } = context || {};
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === 'AISHORTCUTS_DIAG_GET_DUMP') {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      try {
        const tail = Number.isFinite(msg?.tail) ? Math.max(0, Math.floor(msg.tail)) : undefined;
        const dump =
          ns.diag && typeof ns.diag.dump === 'function'
            ? ns.diag.dump(typeof tail === 'number' ? { tail } : {})
            : { max: 0, size: 0, droppedDuplicateMsgCount: 0, events: [] };
        sendResponse({ ok: true, dump });
      } catch (error) {
        respondError(sendResponse, error);
      }
      return true;
    }

    if (msg.type === 'AISHORTCUTS_DIAG_CLEAR') {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      try {
        if (ns.diag && typeof ns.diag.clear === 'function') ns.diag.clear();
        diagLog({ ts: Date.now(), type: 'diag_clear', msg: 'cleared by extension page' });
        sendResponse({ ok: true });
      } catch (error) {
        respondError(sendResponse, error);
      }
      return true;
    }

    if (msg.type === 'AISHORTCUTS_NOTIFY') {
      if (!requireAllowedSender(sendResponse, sender, { allowTabSender: true, requireSupportedTabUrl: true })) return true;
      const title = typeof msg.title === 'string' ? msg.title : '';
      const message = typeof msg.message === 'string' ? msg.message : '';
      if (!title || !message) {
        sendResponse({ ok: false, error: 'Missing title/message' });
        return true;
      }
      const notifyId = typeof msg.id === 'string' && msg.id ? msg.id : `quicknav_notify_${Date.now()}`;
      ns.chrome
        .notificationsCreate(notifyId, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: title.slice(0, 64),
          message: message.slice(0, 256),
          priority: 1
        })
        .then(() => sendResponse({ ok: true }))
        .catch((error: any) => respondError(sendResponse, error));
      return true;
    }

    if (msg.type === 'AISHORTCUTS_FACTORY_RESET') {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      if (ns.reset.isFactoryResetRunning()) {
        sendResponse({ ok: false, error: 'busy' });
        return true;
      }

      ns.reset.setFactoryResetRunning(true);
      (async () => {
        await ns.reset.factoryResetAllData();
        sendResponse({ ok: true });
        setTimeout(() => {
          try {
            chrome.runtime.reload();
          } catch {}
        }, 120);
      })()
        .catch((error: any) => respondError(sendResponse, error))
        .finally(() => {
          ns.reset.setFactoryResetRunning(false);
        });
      return true;
    }

    if (msg.type === 'AISHORTCUTS_REINJECT_NOW') {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      ns.storage
        .getSettings()
        .then((settings: any) => {
          ns.registration.reinjectContentScripts(settings);
          return settings;
        })
        .then((settings: any) => sendResponse({ ok: true, settings }))
        .catch((error: any) => respondError(sendResponse, error));
      return true;
    }

    if (msg.type === 'AISHORTCUTS_OPEN_OPTIONS_PAGE') {
      openOptionsPageForSender()
        .then(() => sendResponse({ ok: true }))
        .catch((error: any) => respondError(sendResponse, error));
      return true;
    }

    if (msg.type !== 'AISHORTCUTS_ENSURE_SCROLL_GUARD') return false;
    const tabId = sender?.tab?.id;
    if (!Number.isFinite(tabId)) {
      sendResponse({ ok: false, error: 'No tabId' });
      return true;
    }
    ns.registration.ensureMainWorldScrollGuard(tabId, sendResponse);
    return true;
  }

  ns.routerHandlers = Object.assign({}, ns.routerHandlers || {}, {
    handleAdminMessage
  });
})();
