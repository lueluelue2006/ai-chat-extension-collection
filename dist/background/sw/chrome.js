(() => {
  "use strict";
  const root = globalThis;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== "object") root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;
  function toErrorMessage(error, fallback = "unknown_error") {
    try {
      if (error instanceof Error && error.message) return error.message;
      const text = String(error || "");
      return text || fallback;
    } catch {
      return fallback;
    }
  }
  function runtimeLastErrorMessage() {
    try {
      const err = chrome?.runtime?.lastError;
      if (!err) return "";
      return err?.message ? String(err.message) : String(err);
    } catch {
      return "";
    }
  }
  function callbackToPromise(invoker) {
    return new Promise((resolve, reject) => {
      try {
        invoker((value) => {
          const errText = runtimeLastErrorMessage();
          if (errText) reject(new Error(errText));
          else resolve(value);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  function getStorageArea(areaName) {
    const area = chrome?.storage?.[areaName];
    if (!area) throw new Error(`chrome.storage.${areaName} unavailable`);
    return area;
  }
  async function storageGet(areaName, query) {
    const area = getStorageArea(areaName);
    if (typeof area.get !== "function") throw new Error(`chrome.storage.${areaName}.get unavailable`);
    return await callbackToPromise((done) => area.get(query, done));
  }
  async function storageSet(areaName, items) {
    const area = getStorageArea(areaName);
    if (typeof area.set !== "function") throw new Error(`chrome.storage.${areaName}.set unavailable`);
    await callbackToPromise((done) => area.set(items, done));
  }
  async function storageRemove(areaName, keys) {
    const area = getStorageArea(areaName);
    if (typeof area.remove !== "function") throw new Error(`chrome.storage.${areaName}.remove unavailable`);
    await callbackToPromise((done) => area.remove(keys, done));
  }
  async function storageClear(areaName) {
    const area = getStorageArea(areaName);
    if (typeof area.clear !== "function") throw new Error(`chrome.storage.${areaName}.clear unavailable`);
    await callbackToPromise((done) => area.clear(done));
  }
  async function scriptingGetRegisteredContentScripts() {
    const api = chrome?.scripting;
    if (!api || typeof api.getRegisteredContentScripts !== "function") {
      throw new Error("chrome.scripting.getRegisteredContentScripts unavailable");
    }
    const result = await callbackToPromise((done) => api.getRegisteredContentScripts(done));
    return Array.isArray(result) ? result : [];
  }
  async function scriptingRegisterContentScripts(items) {
    const api = chrome?.scripting;
    if (!api || typeof api.registerContentScripts !== "function") {
      throw new Error("chrome.scripting.registerContentScripts unavailable");
    }
    await callbackToPromise((done) => api.registerContentScripts(items, done));
  }
  async function scriptingUnregisterContentScripts(filter) {
    const api = chrome?.scripting;
    if (!api || typeof api.unregisterContentScripts !== "function") {
      throw new Error("chrome.scripting.unregisterContentScripts unavailable");
    }
    await callbackToPromise((done) => {
      if (filter && typeof filter === "object") api.unregisterContentScripts(filter, done);
      else api.unregisterContentScripts({}, done);
    });
  }
  async function notificationsCreate(id, options) {
    const api = chrome?.notifications;
    if (!api || typeof api.create !== "function") throw new Error("chrome.notifications.create unavailable");
    await callbackToPromise((done) => api.create(id, options, done));
  }
  function isExtensionPageSender(sender) {
    try {
      const url = typeof sender?.url === "string" ? sender.url : "";
      if (!url) return false;
      const base = chrome?.runtime?.getURL?.("") || "";
      return !!(base && url.startsWith(base));
    } catch {
      return false;
    }
  }
  function getSupportedTabUrlPrefixes() {
    try {
      const reg = root.AISHORTCUTS_REGISTRY;
      const sites = Array.isArray(reg?.sites) ? reg.sites : [];
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const site of sites) {
        const patterns = Array.isArray(site?.matchPatterns) ? site.matchPatterns : [];
        for (const pattern of patterns) {
          const raw = String(pattern || "").trim();
          if (!raw) continue;
          const star = raw.indexOf("*");
          const prefix = (star >= 0 ? raw.slice(0, star) : raw).trim();
          if (!prefix || seen.has(prefix)) continue;
          seen.add(prefix);
          out.push(prefix);
        }
      }
      return out;
    } catch {
      return [];
    }
  }
  function isSupportedTabSender(sender) {
    try {
      const url = typeof sender?.url === "string" && sender.url ? sender.url : typeof sender?.tab?.url === "string" ? sender.tab.url : "";
      if (!url) return false;
      return getSupportedTabUrlPrefixes().some((prefix) => prefix && url.startsWith(prefix));
    } catch {
      return false;
    }
  }
  function senderGate(sender, options) {
    const allowTabSender = !!options?.allowTabSender;
    const requireSupportedTabUrl = !!options?.requireSupportedTabUrl;
    if (isExtensionPageSender(sender)) return "";
    if (allowTabSender && Number.isFinite(sender?.tab?.id)) {
      if (!requireSupportedTabUrl || isSupportedTabSender(sender)) return "";
    }
    return "forbidden";
  }
  ns.chrome = Object.assign({}, ns.chrome || {}, {
    toErrorMessage,
    runtimeLastErrorMessage,
    callbackToPromise,
    storageGet,
    storageSet,
    storageRemove,
    storageClear,
    scriptingGetRegisteredContentScripts,
    scriptingRegisterContentScripts,
    scriptingUnregisterContentScripts,
    notificationsCreate,
    isExtensionPageSender,
    isSupportedTabSender,
    senderGate
  });
})();
