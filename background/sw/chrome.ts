declare var chrome: any;

(() => {
  'use strict';

  const root = globalThis as any;
  if (!root.__quicknavSw || typeof root.__quicknavSw !== 'object') root.__quicknavSw = {};
  const ns = root.__quicknavSw;

  function toErrorMessage(error: any, fallback = 'unknown_error') {
    try {
      if (error instanceof Error && error.message) return error.message;
      const text = String(error || '');
      return text || fallback;
    } catch {
      return fallback;
    }
  }

  function runtimeLastErrorMessage() {
    try {
      const err = chrome?.runtime?.lastError;
      if (!err) return '';
      return err?.message ? String(err.message) : String(err);
    } catch {
      return '';
    }
  }

  function callbackToPromise(invoker: (done: (value: any) => void) => void) {
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

  function getStorageArea(areaName: string) {
    const area = chrome?.storage?.[areaName];
    if (!area) throw new Error(`chrome.storage.${areaName} unavailable`);
    return area;
  }

  async function storageGet(areaName: string, query: any) {
    const area = getStorageArea(areaName);
    if (typeof area.get !== 'function') throw new Error(`chrome.storage.${areaName}.get unavailable`);
    return await callbackToPromise((done) => area.get(query, done));
  }

  async function storageSet(areaName: string, items: any) {
    const area = getStorageArea(areaName);
    if (typeof area.set !== 'function') throw new Error(`chrome.storage.${areaName}.set unavailable`);
    await callbackToPromise((done) => area.set(items, done));
  }

  async function storageRemove(areaName: string, keys: any) {
    const area = getStorageArea(areaName);
    if (typeof area.remove !== 'function') throw new Error(`chrome.storage.${areaName}.remove unavailable`);
    await callbackToPromise((done) => area.remove(keys, done));
  }

  async function storageClear(areaName: string) {
    const area = getStorageArea(areaName);
    if (typeof area.clear !== 'function') throw new Error(`chrome.storage.${areaName}.clear unavailable`);
    await callbackToPromise((done) => area.clear(done));
  }

  async function scriptingGetRegisteredContentScripts() {
    const api = chrome?.scripting;
    if (!api || typeof api.getRegisteredContentScripts !== 'function') {
      throw new Error('chrome.scripting.getRegisteredContentScripts unavailable');
    }
    const result = await callbackToPromise((done) => api.getRegisteredContentScripts(done));
    return Array.isArray(result) ? result : [];
  }

  async function scriptingRegisterContentScripts(items: any[]) {
    const api = chrome?.scripting;
    if (!api || typeof api.registerContentScripts !== 'function') {
      throw new Error('chrome.scripting.registerContentScripts unavailable');
    }
    await callbackToPromise((done) => api.registerContentScripts(items, done));
  }

  async function scriptingUnregisterContentScripts(filter?: any) {
    const api = chrome?.scripting;
    if (!api || typeof api.unregisterContentScripts !== 'function') {
      throw new Error('chrome.scripting.unregisterContentScripts unavailable');
    }
    await callbackToPromise((done) => {
      if (filter && typeof filter === 'object') api.unregisterContentScripts(filter, done);
      else api.unregisterContentScripts({}, done);
    });
  }

  async function notificationsCreate(id: string, options: any) {
    const api = chrome?.notifications;
    if (!api || typeof api.create !== 'function') throw new Error('chrome.notifications.create unavailable');
    await callbackToPromise((done) => api.create(id, options, done));
  }

  function isExtensionPageSender(sender: any) {
    try {
      const url = typeof sender?.url === 'string' ? sender.url : '';
      if (!url) return false;
      const base = chrome?.runtime?.getURL?.('') || '';
      return !!(base && url.startsWith(base));
    } catch {
      return false;
    }
  }

  function senderGate(sender: any, options?: any) {
    const allowTabSender = !!options?.allowTabSender;
    if (isExtensionPageSender(sender)) return '';
    if (allowTabSender && Number.isFinite(sender?.tab?.id)) return '';
    return 'forbidden';
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
    senderGate
  });
})();
