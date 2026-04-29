(() => {
  'use strict';

  const root = globalThis as any;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== 'object') root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;

  function handleBootstrapMessage(context: any) {
    const { msg, sender, sendResponse, respondError, diagLog, logRegistrationDiff } = context || {};
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === 'QUICKNAV_BOOTSTRAP_PING') {
      const tabId = sender?.tab?.id;
      const href = typeof msg.href === 'string' ? msg.href : '';
      diagLog({ ts: Date.now(), type: 'bootstrap_ping', tabId, url: href, msg: 'received' });
      ns.storage
        .getSettings()
        .then((settings: any) =>
          ns.registration
            .applySettingsAndRegister(settings)
            .catch((error: any) => {
              const errorText = ns.chrome.toErrorMessage(error);
              diagLog({ ts: Date.now(), type: 'bootstrap_ping_register_error', tabId, url: href, msg: errorText });
              try {
                if (Number.isFinite(tabId) && href) {
                  const enabled = ns.registration.getEnabledContentScriptDefs(settings);
                  const defsForUrl = enabled.filter((d: any) => ns.registration.urlMatchesAny(href, d.matches));
                  ns.registration.injectContentScriptDefsIntoTab(tabId, defsForUrl);
                }
              } catch {}
              return { registeredIds: [], unregisteredIds: [], error: errorText };
            })
            .then((reg: any) => ({ settings, reg }))
        )
        .then(({ settings, reg }: any) => {
          logRegistrationDiff('bootstrap_ping', reg, { tabId, url: href });
          try {
            if (Number.isFinite(tabId) && href) {
              const enabled = ns.registration.getEnabledContentScriptDefs(settings);
              const defsForUrl = enabled.filter((d: any) => ns.registration.urlMatchesAny(href, d.matches));
              const sourceIds = Array.isArray(reg?.registeredSourceIds) ? reg.registeredSourceIds : [];
              const registeredIds = Array.isArray(reg?.registeredIds) ? reg.registeredIds : [];
              const allowIds = new Set(sourceIds.length ? sourceIds : registeredIds);
              const defsToInject = allowIds.size ? defsForUrl.filter((d: any) => allowIds.has(d.id)) : [];
              ns.registration.injectContentScriptDefsIntoTab(tabId, defsToInject);
            }
          } catch {}
          sendResponse({ ok: true, settings });
        })
        .catch((error: any) => respondError(sendResponse, error));
      return true;
    }

    if (msg.type === 'QUICKNAV_BOOTSTRAP_ENSURE') {
      const tabId = sender?.tab?.id;
      const href = typeof msg.href === 'string' ? msg.href : typeof sender?.url === 'string' ? sender.url : '';
      diagLog({ ts: Date.now(), type: 'bootstrap_ensure', tabId, url: href, msg: 'received' });
      if (!Number.isFinite(tabId) || !href) {
        diagLog({ ts: Date.now(), type: 'bootstrap_ensure_invalid', tabId, url: href, msg: 'No tabId/href' });
        sendResponse({ ok: false, error: 'No tabId/href' });
        return true;
      }
      ns.storage
        .getSettings()
        .then((settings: any) =>
          ns.registration
            .applySettingsAndRegister(settings)
            .then((reg: any) => ({ settings, reg }))
            .catch((error: any) => {
              const errorText = ns.chrome.toErrorMessage(error);
              return { settings, reg: { registeredIds: [], unregisteredIds: [], error: errorText } };
            })
        )
        .then(({ settings, reg }: any) => {
          logRegistrationDiff('bootstrap_ensure', reg, { tabId, url: href });
          try {
            const enabled = ns.registration.getEnabledContentScriptDefs(settings);
            const defsForUrl = enabled.filter((d: any) => ns.registration.urlMatchesAny(href, d.matches));
            ns.registration.injectContentScriptDefsIntoTab(tabId, defsForUrl);
          } catch {}
          sendResponse({ ok: true });
        })
        .catch((error: any) => respondError(sendResponse, error));
      return true;
    }

    return false;
  }

  ns.routerHandlers = Object.assign({}, ns.routerHandlers || {}, {
    handleBootstrapMessage
  });
})();
