(() => {
  "use strict";
  const root = globalThis;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== "object") root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;
  async function applySettingsChange(settings, msg) {
    if (msg && msg.noInject) {
      await ns.registration.applySettingsAndRegister(settings);
      return;
    }
    await ns.registration.applySettingsAndReinject(settings);
  }
  function handleSettingsMessage(context) {
    const { msg, sender, sendResponse, requireAllowedSender, respondError } = context || {};
    if (!msg || typeof msg !== "object") return false;
    if (msg.type === "AISHORTCUTS_GET_SETTINGS") {
      ns.storage.getSettings().then((settings) => sendResponse({ ok: true, settings })).catch((error) => respondError(sendResponse, error));
      return true;
    }
    if (msg.type === "AISHORTCUTS_SET_SETTINGS") {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      ns.storage.runSettingsMutation(async () => {
        const settings = await ns.storage.setSettings(msg.settings);
        await applySettingsChange(settings, msg);
        return settings;
      }).then((settings) => sendResponse({ ok: true, settings })).catch((error) => respondError(sendResponse, error));
      return true;
    }
    if (msg.type === "AISHORTCUTS_PATCH_SETTINGS") {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      ns.storage.runSettingsMutation(async () => {
        const current = await ns.storage.getSettings();
        const patched = ns.storage.applySettingsPatchOps(current, msg.patch);
        const settings = await ns.storage.setSettings(patched);
        await applySettingsChange(settings, msg);
        return settings;
      }).then((settings) => sendResponse({ ok: true, settings })).catch((error) => respondError(sendResponse, error));
      return true;
    }
    if (msg.type === "AISHORTCUTS_RESET_DEFAULTS") {
      if (!requireAllowedSender(sendResponse, sender)) return true;
      ns.storage.runSettingsMutation(async () => {
        const settings = await ns.storage.setSettings(ns.storage.getDefaultSettingsClone());
        await applySettingsChange(settings, msg);
        return settings;
      }).then((settings) => sendResponse({ ok: true, settings })).catch((error) => respondError(sendResponse, error));
      return true;
    }
    return false;
  }
  ns.routerHandlers = Object.assign({}, ns.routerHandlers || {}, {
    handleSettingsMessage
  });
})();
