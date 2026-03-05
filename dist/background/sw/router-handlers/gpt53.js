(() => {
  "use strict";
  const root = globalThis;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== "object") root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;
  function handleGpt53Message(context) {
    const { msg, sender, sendResponse, requireAllowedSender, respondError, buildGpt53Status } = context || {};
    if (!msg || typeof msg !== "object") return false;
    if (msg.type === "AISHORTCUTS_GPT53_GET_STATUS") {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      buildGpt53Status().then((resp) => sendResponse(resp)).catch((error) => respondError(sendResponse, error));
      return true;
    }
    if (msg.type === "AISHORTCUTS_GPT53_SET_URLS") {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      (async () => {
        const urls = await ns.monitors.setGpt53Urls(msg?.urlsText ?? msg?.urls ?? null);
        const alarm = await ns.monitors.ensureGpt53Alarm();
        await ns.monitors.runGpt53Probe({ silent: true });
        return await buildGpt53Status({ urls, alarm });
      })().then((resp) => sendResponse(resp)).catch((error) => respondError(sendResponse, error));
      return true;
    }
    if (msg.type === "AISHORTCUTS_GPT53_RUN") {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      (async () => {
        const alarm = await ns.monitors.ensureGpt53Alarm();
        await ns.monitors.runGpt53Probe();
        return await buildGpt53Status({ alarm });
      })().then((resp) => sendResponse(resp)).catch((error) => respondError(sendResponse, error));
      return true;
    }
    if (msg.type === "AISHORTCUTS_GPT53_MARK_READ") {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      (async () => {
        const alerts = await ns.monitors.markGpt53AlertsRead();
        return { ok: true, alerts: { unread: alerts.unread, events: alerts.events.slice(-20) }, now: Date.now() };
      })().then((resp) => sendResponse(resp)).catch((error) => respondError(sendResponse, error));
      return true;
    }
    return false;
  }
  ns.routerHandlers = Object.assign({}, ns.routerHandlers || {}, {
    handleGpt53Message
  });
})();
