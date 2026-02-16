(() => {
  'use strict';

  const root = globalThis as any;
  const ns = root.__quicknavSw || (root.__quicknavSw = {});

  let initialized = false;

  function requireAllowedSender(sendResponse: (value: any) => void, sender: any, options?: any) {
    const gateError = ns.chrome.senderGate(sender, options);
    if (!gateError) return true;
    sendResponse({ ok: false, error: gateError });
    return false;
  }

  function respondError(sendResponse: (value: any) => void, error: any) {
    sendResponse({ ok: false, error: ns.chrome.toErrorMessage(error) });
  }

  async function openOptionsPageForSender() {
    const optionsUrl = (() => {
      try {
        return chrome.runtime.getURL('options/options.html');
      } catch {
        return '';
      }
    })();

    if (!optionsUrl) throw new Error('no options url');

    try {
      await ns.chrome.callbackToPromise((done: (value: any) => void) => {
        chrome.tabs.create({ url: optionsUrl, active: true }, done);
      });
      return;
    } catch {}

    if (typeof chrome?.runtime?.openOptionsPage !== 'function') throw new Error('open options unavailable');
    await ns.chrome.callbackToPromise((done: (value: any) => void) => {
      chrome.runtime.openOptionsPage(done);
    });
  }

  async function buildGpt53Status() {
    const alarm = await ns.monitors.ensureGpt53Alarm();
    const urls = await ns.monitors.getGpt53Urls();
    const state = await ns.monitors.getGpt53State();
    const alerts = await ns.monitors.getGpt53Alerts();
    let enabled = true;
    try {
      const settings = await ns.storage.getSettings();
      if (settings && settings.enabled === false) enabled = false;
    } catch {}
    return {
      ok: true,
      enabled,
      urls,
      url: urls[0] || ns.monitors.GPT53_MONITOR.defaultUrls[0] || '',
      alarm,
      state,
      alerts: { unread: alerts.unread, events: alerts.events.slice(-20) },
      now: Date.now()
    };
  }

  function registerMessageRouter() {
    chrome.runtime.onMessage.addListener((msg: any, sender: any, sendResponse: (value: any) => void) => {
      try {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'QUICKNAV_MEMTEST_STATUS') {
          if (!requireAllowedSender(sendResponse, sender)) return true;
          ns.monitors.memtestUpdateStatus(msg);
          sendResponse({ ok: true });
          return true;
        }

        if (msg.type === 'QUICKNAV_MEMTEST_GUARD') {
          if (!requireAllowedSender(sendResponse, sender)) return true;
          const reason = typeof msg.reason === 'string' ? msg.reason : 'memguard';
          ns.monitors.memtestCloseTestTab(reason);
          sendResponse({ ok: true });
          return true;
        }

        if (msg.type === 'QUICKNAV_MEMTEST_ABORT') {
          if (!requireAllowedSender(sendResponse, sender)) return true;
          const reason = typeof msg.reason === 'string' ? msg.reason : 'abort';
          ns.monitors.memtestBroadcastAbort(reason);
          ns.monitors.memtestCloseTestTab(reason);
          sendResponse({ ok: true });
          return true;
        }

        if (msg.type === 'QUICKNAV_BOOTSTRAP_PING') {
          const tabId = sender?.tab?.id;
          const href = typeof msg.href === 'string' ? msg.href : '';
          ns.storage
            .getSettings()
            .then((settings: any) =>
              ns.registration
                .applySettingsAndRegister(settings)
                .catch((error: any) => {
                  try {
                    if (Number.isFinite(tabId) && href) {
                      const enabled = ns.registration.getEnabledContentScriptDefs(settings);
                      const defsForUrl = enabled.filter((d: any) => ns.registration.urlMatchesAny(href, d.matches));
                      ns.registration.injectContentScriptDefsIntoTab(tabId, defsForUrl);
                    }
                  } catch {}
                  return { registeredIds: [], unregisteredIds: [], error: ns.chrome.toErrorMessage(error) };
                })
                .then((reg: any) => ({ settings, reg }))
            )
            .then(({ settings, reg }: any) => {
              try {
                if (Number.isFinite(tabId) && href) {
                  const enabled = ns.registration.getEnabledContentScriptDefs(settings);
                  const defsForUrl = enabled.filter((d: any) => ns.registration.urlMatchesAny(href, d.matches));
                  const allowIds = new Set(Array.isArray(reg?.registeredIds) ? reg.registeredIds : []);
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
          if (!Number.isFinite(tabId) || !href) {
            sendResponse({ ok: false, error: 'No tabId/href' });
            return true;
          }
          ns.storage
            .getSettings()
            .then((settings: any) =>
              ns.registration
                .applySettingsAndRegister(settings)
                .catch(() => ({ registeredIds: [], unregisteredIds: [] }))
                .then(() => settings)
            )
            .then((settings: any) => {
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

        if (msg.type === 'QUICKNAV_NOTIFY') {
          if (!requireAllowedSender(sendResponse, sender, { allowTabSender: true })) return true;
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

        if (msg.type === 'QUICKNAV_GET_SETTINGS') {
          ns.storage
            .getSettings()
            .then((settings: any) => sendResponse({ ok: true, settings }))
            .catch((error: any) => respondError(sendResponse, error));
          return true;
        }

        if (msg.type === 'QUICKNAV_SET_SETTINGS') {
          if (!requireAllowedSender(sendResponse, sender)) return true;
          ns.storage
            .runSettingsMutation(async () => {
              const settings = await ns.storage.setSettings(msg.settings);
              if (msg && msg.noInject) await ns.registration.applySettingsAndRegister(settings);
              else await ns.registration.applySettingsAndInjectRegistered(settings);
              return settings;
            })
            .then((settings: any) => sendResponse({ ok: true, settings }))
            .catch((error: any) => respondError(sendResponse, error));
          return true;
        }

        if (msg.type === 'QUICKNAV_PATCH_SETTINGS') {
          if (!requireAllowedSender(sendResponse, sender)) return true;
          ns.storage
            .runSettingsMutation(async () => {
              const current = await ns.storage.getSettings();
              const patched = ns.storage.applySettingsPatchOps(current, msg.patch);
              const settings = await ns.storage.setSettings(patched);
              if (msg && msg.noInject) await ns.registration.applySettingsAndRegister(settings);
              else await ns.registration.applySettingsAndInjectRegistered(settings);
              return settings;
            })
            .then((settings: any) => sendResponse({ ok: true, settings }))
            .catch((error: any) => respondError(sendResponse, error));
          return true;
        }

        if (msg.type === 'QUICKNAV_RESET_DEFAULTS') {
          if (!requireAllowedSender(sendResponse, sender)) return true;
          ns.storage
            .runSettingsMutation(async () => {
              const settings = await ns.storage.setSettings(ns.storage.getDefaultSettingsClone());
              if (msg && msg.noInject) await ns.registration.applySettingsAndRegister(settings);
              else await ns.registration.applySettingsAndInjectRegistered(settings);
              return settings;
            })
            .then((settings: any) => sendResponse({ ok: true, settings }))
            .catch((error: any) => respondError(sendResponse, error));
          return true;
        }

        if (msg.type === 'QUICKNAV_FACTORY_RESET') {
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

        if (msg.type === 'QUICKNAV_REINJECT_NOW') {
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

        if (msg.type === 'QUICKNAV_OPEN_OPTIONS_PAGE') {
          openOptionsPageForSender()
            .then(() => sendResponse({ ok: true }))
            .catch((error: any) => respondError(sendResponse, error));
          return true;
        }

        if (msg.type === 'QUICKNAV_GPT53_GET_STATUS') {
          if (!requireAllowedSender(sendResponse, sender)) return true;
          buildGpt53Status()
            .then((resp: any) => sendResponse(resp))
            .catch((error: any) => respondError(sendResponse, error));
          return true;
        }

        if (msg.type === 'QUICKNAV_GPT53_SET_URLS') {
          if (!requireAllowedSender(sendResponse, sender)) return true;
          (async () => {
            const urls = await ns.monitors.setGpt53Urls(msg?.urlsText ?? msg?.urls ?? null);
            const alarm = await ns.monitors.ensureGpt53Alarm();
            await ns.monitors.runGpt53Probe({ silent: true });
            const state = await ns.monitors.getGpt53State();
            const alerts = await ns.monitors.getGpt53Alerts();
            let enabled = true;
            try {
              const settings = await ns.storage.getSettings();
              if (settings && settings.enabled === false) enabled = false;
            } catch {}
            return {
              ok: true,
              enabled,
              urls,
              url: urls[0] || ns.monitors.GPT53_MONITOR.defaultUrls[0] || '',
              alarm,
              state,
              alerts: { unread: alerts.unread, events: alerts.events.slice(-20) },
              now: Date.now()
            };
          })()
            .then((resp: any) => sendResponse(resp))
            .catch((error: any) => respondError(sendResponse, error));
          return true;
        }

        if (msg.type === 'QUICKNAV_GPT53_RUN') {
          if (!requireAllowedSender(sendResponse, sender)) return true;
          (async () => {
            const alarm = await ns.monitors.ensureGpt53Alarm();
            await ns.monitors.runGpt53Probe();
            const urls = await ns.monitors.getGpt53Urls();
            const state = await ns.monitors.getGpt53State();
            const alerts = await ns.monitors.getGpt53Alerts();
            let enabled = true;
            try {
              const settings = await ns.storage.getSettings();
              if (settings && settings.enabled === false) enabled = false;
            } catch {}
            return {
              ok: true,
              enabled,
              urls,
              url: urls[0] || ns.monitors.GPT53_MONITOR.defaultUrls[0] || '',
              alarm,
              state,
              alerts: { unread: alerts.unread, events: alerts.events.slice(-20) },
              now: Date.now()
            };
          })()
            .then((resp: any) => sendResponse(resp))
            .catch((error: any) => respondError(sendResponse, error));
          return true;
        }

        if (msg.type === 'QUICKNAV_GPT53_MARK_READ') {
          if (!requireAllowedSender(sendResponse, sender, { allowTabSender: true })) return true;
          (async () => {
            const alerts = await ns.monitors.markGpt53AlertsRead();
            return { ok: true, alerts: { unread: alerts.unread, events: alerts.events.slice(-20) }, now: Date.now() };
          })()
            .then((resp: any) => sendResponse(resp))
            .catch((error: any) => respondError(sendResponse, error));
          return true;
        }

        if (msg.type !== 'QUICKNAV_ENSURE_SCROLL_GUARD') return;
        const tabId = sender?.tab?.id;
        if (!Number.isFinite(tabId)) {
          sendResponse({ ok: false, error: 'No tabId' });
          return true;
        }
        ns.registration.ensureMainWorldScrollGuard(tabId, sendResponse);
        return true;
      } catch (error) {
        respondError(sendResponse, error);
        return false;
      }
    });
  }

  function registerLifecycleListeners() {
    try {
      chrome.runtime.onInstalled.addListener(() => {
        ns.storage
          .getSettings()
          .then((settings: any) => ns.registration.applySettingsAndReinject(settings))
          .catch(() => ns.registration.scheduleReinject());
        void ns.monitors.ensureGpt53Alarm();
        void ns.monitors.runGpt53Probe();
      });

      chrome.runtime.onStartup?.addListener(() => {
        ns.storage
          .getSettings()
          .then((settings: any) => ns.registration.applySettingsAndRegister(settings))
          .catch(() => void 0);
        void ns.monitors.ensureGpt53Alarm();
      });

      ns.storage
        .getSettings()
        .then((settings: any) => ns.registration.applySettingsAndRegister(settings))
        .catch(() => void 0);
      void ns.monitors.ensureGpt53Alarm();
    } catch {}
  }

  function init() {
    if (initialized) return;
    initialized = true;

    ns.monitors.init();
    registerMessageRouter();
    registerLifecycleListeners();
  }

  ns.router = Object.assign({}, ns.router || {}, {
    init,
    openOptionsPageForSender
  });
})();
