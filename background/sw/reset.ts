(() => {
  'use strict';

  const root = globalThis as any;
  const ns = root.__quicknavSw || (root.__quicknavSw = {});

  let factoryResetRunning = false;

  async function clearDnrDynamicAndSessionRules() {
    const api = chrome?.declarativeNetRequest;
    if (!api || typeof api.getDynamicRules !== 'function' || typeof api.updateDynamicRules !== 'function') return;

    const dynamic = await new Promise<any[]>((resolve) => {
      try {
        api.getDynamicRules((rules: any[]) => {
          const err = chrome.runtime.lastError;
          if (err) resolve([]);
          else resolve(Array.isArray(rules) ? rules : []);
        });
      } catch {
        resolve([]);
      }
    });

    if (dynamic.length) {
      await new Promise<void>((resolve) => {
        try {
          api.updateDynamicRules({ removeRuleIds: dynamic.map((r: any) => r.id) }, () => resolve());
        } catch {
          resolve();
        }
      });
    }

    if (typeof api.getSessionRules !== 'function' || typeof api.updateSessionRules !== 'function') return;

    const session = await new Promise<any[]>((resolve) => {
      try {
        api.getSessionRules((rules: any[]) => {
          const err = chrome.runtime.lastError;
          if (err) resolve([]);
          else resolve(Array.isArray(rules) ? rules : []);
        });
      } catch {
        resolve([]);
      }
    });

    if (session.length) {
      await new Promise<void>((resolve) => {
        try {
          api.updateSessionRules({ removeRuleIds: session.map((r: any) => r.id) }, () => resolve());
        } catch {
          resolve();
        }
      });
    }
  }

  async function unregisterAllContentScripts() {
    if (!chrome?.scripting?.unregisterContentScripts) return;
    await ns.chrome.scriptingUnregisterContentScripts({});
  }

  async function clearStorageArea(areaName: string) {
    const area = chrome?.storage?.[areaName];
    if (!area || typeof area.clear !== 'function') return;
    await ns.chrome.storageClear(areaName);
  }

  async function clearExtensionCaches() {
    try {
      if (!globalThis.caches || typeof globalThis.caches.keys !== 'function') return;
      const keys = await globalThis.caches.keys();
      await Promise.all(keys.map((k: string) => globalThis.caches.delete(k)));
    } catch {}
  }

  async function clearExtensionIndexedDb() {
    try {
      if (!globalThis.indexedDB || typeof globalThis.indexedDB.databases !== 'function') return;
      const dbs = await globalThis.indexedDB.databases();
      const names = Array.isArray(dbs) ? dbs.map((d: any) => d?.name).filter(Boolean) : [];
      await Promise.all(
        names.map(
          (name: string) =>
            new Promise((resolve) => {
              try {
                const req = globalThis.indexedDB.deleteDatabase(name);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
                req.onblocked = () => resolve(false);
              } catch {
                resolve(false);
              }
            })
        )
      );
    } catch {}
  }

  async function factoryResetAllData() {
    await unregisterAllContentScripts();
    await clearDnrDynamicAndSessionRules();

    await clearExtensionCaches();
    await clearExtensionIndexedDb();

    await clearStorageArea('session');
    await clearStorageArea('local');
    await clearStorageArea('sync');

    try {
      chrome.alarms.clearAll(() => void chrome.runtime.lastError);
    } catch {}
  }

  function isFactoryResetRunning() {
    return factoryResetRunning;
  }

  function setFactoryResetRunning(next: any) {
    factoryResetRunning = !!next;
  }

  ns.reset = Object.assign({}, ns.reset || {}, {
    isFactoryResetRunning,
    setFactoryResetRunning,
    factoryResetAllData
  });
})();
