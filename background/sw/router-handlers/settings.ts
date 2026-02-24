(() => {
  'use strict';

  const root = globalThis as any;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== 'object') root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;

  function handleSettingsMessage(context: any) {
    const { msg, sender, sendResponse, requireAllowedSender, respondError } = context || {};
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === 'AISHORTCUTS_GET_SETTINGS') {
      ns.storage
        .getSettings()
        .then((settings: any) => sendResponse({ ok: true, settings }))
        .catch((error: any) => respondError(sendResponse, error));
      return true;
    }

    if (msg.type === 'AISHORTCUTS_SET_SETTINGS') {
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

    if (msg.type === 'AISHORTCUTS_PATCH_SETTINGS') {
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

    if (msg.type === 'AISHORTCUTS_RESET_DEFAULTS') {
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

    return false;
  }

  ns.routerHandlers = Object.assign({}, ns.routerHandlers || {}, {
    handleSettingsMessage
  });
})();
