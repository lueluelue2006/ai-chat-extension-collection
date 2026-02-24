(() => {
  'use strict';

  const root = globalThis as any;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== 'object') root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;

  function handleGpt53Message(context: any) {
    const { msg, sender, sendResponse, requireAllowedSender, respondError, buildGpt53Status } = context || {};
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === 'AISHORTCUTS_GPT53_GET_STATUS') {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      buildGpt53Status()
        .then((resp: any) => sendResponse(resp))
        .catch((error: any) => respondError(sendResponse, error));
      return true;
    }

    if (msg.type === 'AISHORTCUTS_GPT53_SET_URLS') {
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

    if (msg.type === 'AISHORTCUTS_GPT53_RUN') {
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

    if (msg.type === 'AISHORTCUTS_GPT53_MARK_READ') {
      if (!requireAllowedSender(sendResponse, sender, { allowTabSender: true })) return true;
      (async () => {
        const alerts = await ns.monitors.markGpt53AlertsRead();
        return { ok: true, alerts: { unread: alerts.unread, events: alerts.events.slice(-20) }, now: Date.now() };
      })()
        .then((resp: any) => sendResponse(resp))
        .catch((error: any) => respondError(sendResponse, error));
      return true;
    }

    return false;
  }

  ns.routerHandlers = Object.assign({}, ns.routerHandlers || {}, {
    handleGpt53Message
  });
})();
