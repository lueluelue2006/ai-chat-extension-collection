(() => {
  "use strict";
  const root = globalThis;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== "object") root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;
  let initialized = false;
  function requireAllowedSender(sendResponse, sender, options) {
    const gateError = ns.chrome.senderGate(sender, options);
    if (!gateError) return true;
    sendResponse({ ok: false, error: gateError });
    return false;
  }
  function respondError(sendResponse, error) {
    sendResponse({ ok: false, error: ns.chrome.toErrorMessage(error) });
  }
  function diagLog(event) {
    try {
      if (!ns.diag || typeof ns.diag.log !== "function") return;
      ns.diag.log(event);
    } catch {
    }
  }
  function logRegistrationDiff(context, reg, details) {
    const registeredCount = Array.isArray(reg?.registeredIds) ? reg.registeredIds.length : 0;
    const unregisteredCount = Array.isArray(reg?.unregisteredIds) ? reg.unregisteredIds.length : 0;
    const errorText = typeof reg?.error === "string" ? reg.error : "";
    const msg = errorText ? `${context} register:+${registeredCount} unregister:-${unregisteredCount} error:${errorText}` : `${context} register:+${registeredCount} unregister:-${unregisteredCount}`;
    diagLog(Object.assign({ ts: Date.now(), type: "registration_diff", msg }, details || {}));
  }
  async function openOptionsPageForSender() {
    const optionsUrl = (() => {
      try {
        return chrome.runtime.getURL("options/options.html");
      } catch {
        return "";
      }
    })();
    if (!optionsUrl) throw new Error("no options url");
    try {
      await ns.chrome.callbackToPromise((done) => {
        chrome.tabs.create({ url: optionsUrl, active: true }, done);
      });
      return;
    } catch {
    }
    if (typeof chrome?.runtime?.openOptionsPage !== "function") throw new Error("open options unavailable");
    await ns.chrome.callbackToPromise((done) => {
      chrome.runtime.openOptionsPage(done);
    });
  }
  async function buildGpt53Status(options = {}) {
    const urls = Array.isArray(options?.urls) ? options.urls : await ns.monitors.getGpt53Urls();
    const state = await ns.monitors.getGpt53State();
    const alerts = await ns.monitors.getGpt53Alerts();
    let enabled = true;
    try {
      const settings = await ns.storage.getSettings();
      if (settings && settings.enabled === false) enabled = false;
    } catch {
    }
    const monitor = await ns.monitors.getGpt53MonitorStatus({ urls, settingsEnabled: enabled });
    const alarm = Object.prototype.hasOwnProperty.call(options, "alarm") ? options.alarm || null : await ns.monitors.ensureGpt53Alarm();
    return {
      ok: true,
      enabled,
      monitorEnabled: !!monitor?.enabled,
      monitorReason: typeof monitor?.reason === "string" ? monitor.reason : "",
      urls,
      url: urls[0] || ns.monitors.GPT53_MONITOR.defaultUrls[0] || "",
      alarm,
      state,
      alerts: { unread: alerts.unread, events: alerts.events.slice(-20) },
      now: Date.now()
    };
  }
  const ROUTER_HANDLER_ORDER = [
    "handleBootstrapMessage",
    "handleSettingsMessage",
    "handleGpt53Message",
    "handleAdminMessage"
  ];
  function dispatchDelegatedMessage(context) {
    const handlers = ns.routerHandlers;
    if (!handlers || typeof handlers !== "object") return false;
    for (const key of ROUTER_HANDLER_ORDER) {
      const handler = handlers[key];
      if (typeof handler !== "function") continue;
      if (handler(context) === true) return true;
    }
    return false;
  }
  function registerMessageRouter() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        if (!msg || typeof msg !== "object") return;
        const context = {
          msg,
          sender,
          sendResponse,
          requireAllowedSender,
          respondError,
          diagLog,
          logRegistrationDiff,
          openOptionsPageForSender,
          buildGpt53Status,
          ns
        };
        if (dispatchDelegatedMessage(context)) return true;
      } catch (error) {
        respondError(sendResponse, error);
        return false;
      }
    });
  }
  async function ensureHardCutLifecycleSchema(context) {
    const ensure = ns.storage?.ensureHardCutStorageSchema;
    if (typeof ensure !== "function") return null;
    try {
      return await ensure({ force: true });
    } catch (error) {
      diagLog({
        ts: Date.now(),
        type: "hard_cut_storage_schema_error",
        msg: `${context}: ${ns.chrome.toErrorMessage(error)}`
      });
      return null;
    }
  }
  async function getLifecycleSettings(context) {
    await ensureHardCutLifecycleSchema(context);
    return await ns.storage.getSettings();
  }
  function registerLifecycleListeners() {
    try {
      chrome.runtime.onInstalled.addListener(() => {
        getLifecycleSettings("onInstalled").then((settings) => ns.registration.applySettingsAndReinject(settings)).catch((error) => {
          diagLog({
            ts: Date.now(),
            type: "reinject_schedule",
            msg: `onInstalled fallback: ${ns.chrome.toErrorMessage(error)}`
          });
          ns.registration.scheduleReinject();
        });
        void ns.monitors.ensureGpt53Alarm();
        void ns.monitors.runGpt53Probe();
      });
      chrome.runtime.onStartup?.addListener(() => {
        getLifecycleSettings("onStartup").then((settings) => ns.registration.applySettingsAndRegister(settings)).catch(() => void 0);
        void ns.monitors.ensureGpt53Alarm();
      });
      getLifecycleSettings("init").then((settings) => ns.registration.applySettingsAndRegister(settings)).catch(() => void 0);
      void ns.monitors.ensureGpt53Alarm();
    } catch {
    }
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
