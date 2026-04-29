(() => {
  "use strict";
  const root = globalThis;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== "object") root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;
  let reinjectScheduled = false;
  let lastReinjectAt = 0;
  let pendingReinjectSettings = null;
  let forceNextContentScriptRegistration = true;
  let applyChain = Promise.resolve();
  const URL_PATTERN_RE_CACHE = /* @__PURE__ */ new Map();
  const ERROR_REPORT_WINDOW_MS = 15e3;
  const ERROR_REPORT_BURST = 3;
  const errorReportState = /* @__PURE__ */ new Map();
  function shouldReportError(key) {
    const normalized = String(key || "registration");
    const ts = Date.now();
    const state = errorReportState.get(normalized);
    if (!state || ts - state.windowStart > ERROR_REPORT_WINDOW_MS) {
      errorReportState.set(normalized, { windowStart: ts, count: 1 });
      return true;
    }
    state.count += 1;
    return state.count <= ERROR_REPORT_BURST;
  }
  function normalizeErrorTag(error) {
    if (!error) return "";
    if (typeof error === "object") {
      const name = typeof error.name === "string" ? String(error.name).trim() : "";
      if (name) return name.slice(0, 64);
    }
    const kind = typeof error;
    return kind && kind !== "object" ? kind : "";
  }
  function reportError(stage, error, details) {
    try {
      const key = String(stage || "registration");
      if (!shouldReportError(key)) return;
      if (!ns.diag || typeof ns.diag.log !== "function") return;
      const tag = normalizeErrorTag(error);
      const msg = tag ? `${key}:${tag}` : key;
      ns.diag.log(Object.assign({ ts: Date.now(), type: "registration_error", msg }, details || {}));
    } catch (reportErrorFailure) {
      void reportErrorFailure;
    }
  }
  function isModuleEnabled(settings, siteId, moduleId) {
    if (!settings?.enabled) return false;
    if (settings?.sites?.[siteId] === false) return false;
    const mods = settings?.siteModules?.[siteId];
    const canonicalModuleId = typeof ns.storage?.normalizeModuleId === "function" ? ns.storage.normalizeModuleId(moduleId) || moduleId : moduleId;
    if (!mods || typeof mods !== "object") return canonicalModuleId === "quicknav";
    if (typeof mods[canonicalModuleId] === "boolean") return mods[canonicalModuleId];
    if (canonicalModuleId !== moduleId && typeof mods[moduleId] === "boolean") return mods[moduleId];
    return ns.storage.getDefaultSettings()?.siteModules?.[siteId]?.[canonicalModuleId] === true;
  }
  function getEnabledContentScriptDefs(settings) {
    if (!settings?.enabled) return [];
    const defs = ns.storage.getContentScriptDefs();
    const out = [];
    for (const d of defs) {
      if (!isModuleEnabled(settings, d.siteId, d.moduleId)) continue;
      out.push(d);
    }
    return out;
  }
  function compileUrlPattern(pattern) {
    if (URL_PATTERN_RE_CACHE.has(pattern)) return URL_PATTERN_RE_CACHE.get(pattern);
    const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const re = new RegExp(`^${escaped}$`);
    URL_PATTERN_RE_CACHE.set(pattern, re);
    return re;
  }
  function urlMatchesAny(url, patterns) {
    if (!url || typeof url !== "string") return false;
    if (!Array.isArray(patterns) || !patterns.length) return false;
    for (const p of patterns) {
      if (!p || typeof p !== "string") continue;
      try {
        if (compileUrlPattern(p).test(url)) return true;
      } catch (error) {
        reportError("registration:url-pattern:test", error);
      }
    }
    return false;
  }
  function injectContentScriptDefsIntoTab(tabId, defs) {
    if (!Number.isFinite(tabId)) return;
    if (!Array.isArray(defs) || !defs.length) return;
    for (const rule of defs) {
      try {
        if (rule.css?.length) {
          chrome.scripting.insertCSS(
            {
              target: { tabId, ...rule.allFrames ? { allFrames: true } : {} },
              files: rule.css
            },
            () => void chrome.runtime.lastError
          );
        }
        chrome.scripting.executeScript(
          {
            target: { tabId, ...rule.allFrames ? { allFrames: true } : {} },
            files: rule.js,
            ...rule.world ? { world: rule.world } : {}
          },
          () => void chrome.runtime.lastError
        );
      } catch (error) {
        reportError("registration:inject-tab:def", error, { tabId: Number(tabId) });
      }
    }
  }
  function injectContentScriptDefsIntoMatchingTabs(defs) {
    if (!Array.isArray(defs) || !defs.length) return;
    for (const rule of defs) {
      try {
        chrome.tabs.query({ url: rule.matches }, (tabs) => {
          const err = chrome.runtime.lastError;
          if (err) return;
          for (const tab of tabs || []) {
            const tabId = tab && tab.id;
            if (!Number.isFinite(tabId)) continue;
            try {
              if (rule.css?.length) {
                chrome.scripting.insertCSS(
                  {
                    target: { tabId, ...rule.allFrames ? { allFrames: true } : {} },
                    files: rule.css
                  },
                  () => void chrome.runtime.lastError
                );
              }
              chrome.scripting.executeScript(
                {
                  target: { tabId, ...rule.allFrames ? { allFrames: true } : {} },
                  files: rule.js,
                  ...rule.world ? { world: rule.world } : {}
                },
                () => void chrome.runtime.lastError
              );
            } catch (error) {
              reportError("registration:inject-matching:tab", error, { tabId: Number(tabId) });
            }
          }
        });
      } catch (error) {
        reportError("registration:inject-matching:query", error);
      }
    }
  }
  function reinjectContentScripts(settings) {
    try {
      const now = Date.now();
      if (now - lastReinjectAt < 2e3) return;
      lastReinjectAt = now;
    } catch (error) {
      reportError("registration:reinject:throttle", error);
    }
    for (const rule of getEnabledContentScriptDefs(settings)) {
      try {
        chrome.tabs.query({ url: rule.matches }, (tabs) => {
          const err = chrome.runtime.lastError;
          if (err) return;
          for (const tab of tabs || []) {
            const tabId = tab && tab.id;
            if (!Number.isFinite(tabId)) continue;
            try {
              if (rule.css?.length) {
                chrome.scripting.insertCSS(
                  {
                    target: { tabId, ...rule.allFrames ? { allFrames: true } : {} },
                    files: rule.css
                  },
                  () => void chrome.runtime.lastError
                );
              }
              chrome.scripting.executeScript(
                {
                  target: { tabId, ...rule.allFrames ? { allFrames: true } : {} },
                  files: rule.js,
                  ...rule.world ? { world: rule.world } : {}
                },
                () => void chrome.runtime.lastError
              );
            } catch (error) {
              reportError("registration:reinject:tab", error, { tabId: Number(tabId) });
            }
          }
        });
      } catch (error) {
        reportError("registration:reinject:query", error);
      }
    }
  }
  function scheduleReinject(settings) {
    try {
      if (settings) pendingReinjectSettings = settings;
    } catch (error) {
      reportError("registration:schedule:queue-settings", error);
    }
    if (reinjectScheduled) return;
    reinjectScheduled = true;
    try {
      queueMicrotask(async () => {
        reinjectScheduled = false;
        const current = pendingReinjectSettings || await ns.storage.getSettings();
        pendingReinjectSettings = null;
        reinjectContentScripts(current);
      });
    } catch {
      Promise.resolve().then(async () => {
        reinjectScheduled = false;
        const current = pendingReinjectSettings || await ns.storage.getSettings();
        pendingReinjectSettings = null;
        reinjectContentScripts(current);
      }).catch(() => {
        reinjectScheduled = false;
        pendingReinjectSettings = null;
      });
    }
  }
  async function getRegisteredQuickNavContentScripts() {
    const scripts = await ns.chrome.scriptingGetRegisteredContentScripts();
    const out = [];
    const prefix = ns.storage.getQuicknavContentScriptIdPrefix();
    const legacyIds = /* @__PURE__ */ new Set();
    try {
      for (const id of ns.storage.getQuicknavLegacyContentScriptIds() || []) {
        if (typeof id !== "string" || !id) continue;
        legacyIds.add(id);
      }
    } catch (error) {
      reportError("registration:registered:legacy-ids", error);
    }
    for (const s of scripts || []) {
      const id = s && typeof s.id === "string" ? s.id : "";
      if (!id) continue;
      if (id.startsWith(prefix) || legacyIds.has(id)) out.push(s);
    }
    return out;
  }
  function normalizeWorld(input) {
    return input === "MAIN" ? "MAIN" : "ISOLATED";
  }
  function normalizeRunAt(input) {
    return input === "document_start" || input === "document_idle" || input === "document_end" ? input : "document_end";
  }
  function normalizeStringArray(input) {
    if (!Array.isArray(input)) return [];
    return input.filter((x) => typeof x === "string" && x);
  }
  function normalizeMatchPatterns(input) {
    const arr = normalizeStringArray(input);
    try {
      arr.sort();
    } catch (error) {
      reportError("registration:normalize:sort-matches", error);
    }
    return arr;
  }
  function getRuntimeContentScriptRevision() {
    try {
      const version = String(chrome?.runtime?.getManifest?.()?.version || "").trim();
      const normalized = version.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
      return normalized || "dev";
    } catch {
      return "dev";
    }
  }
  function buildRuntimeContentScriptId(id) {
    const base = String(id || "").trim();
    if (!base) return "";
    return `${base}_v${getRuntimeContentScriptRevision()}`;
  }
  function contentScriptDefToRegistration(def) {
    const sourceId = String(def?.id || "").trim();
    return {
      id: buildRuntimeContentScriptId(sourceId),
      sourceId,
      matches: normalizeMatchPatterns(def.matches),
      js: normalizeStringArray(def.js),
      css: normalizeStringArray(def.css),
      runAt: normalizeRunAt(def.runAt),
      allFrames: !!def.allFrames,
      world: normalizeWorld(def.world)
    };
  }
  function registeredContentScriptToComparable(reg) {
    return {
      id: typeof reg?.id === "string" ? reg.id : "",
      matches: normalizeMatchPatterns(reg?.matches),
      js: normalizeStringArray(reg?.js),
      css: normalizeStringArray(reg?.css),
      runAt: normalizeRunAt(reg?.runAt),
      allFrames: !!reg?.allFrames,
      world: normalizeWorld(reg?.world)
    };
  }
  function arraysEqual(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  function isSameContentScriptRegistration(registered, desired) {
    try {
      if (!registered || !desired) return false;
      return registered.id === desired.id && arraysEqual(registered.matches, desired.matches) && arraysEqual(registered.js, desired.js) && arraysEqual(registered.css, desired.css) && registered.runAt === desired.runAt && registered.allFrames === desired.allFrames && registered.world === desired.world;
    } catch {
      return false;
    }
  }
  async function applyContentScriptRegistration(settings) {
    const forceRefresh = forceNextContentScriptRegistration === true;
    const enabledDefs = getEnabledContentScriptDefs(settings);
    const desired = /* @__PURE__ */ new Map();
    for (const d of enabledDefs) {
      const item = contentScriptDefToRegistration(d);
      if (item.id) desired.set(item.id, item);
    }
    const registeredScripts = await getRegisteredQuickNavContentScripts();
    const registered = new Map(registeredScripts.map((s) => [s.id, registeredContentScriptToComparable(s)]));
    const unregisterIds = /* @__PURE__ */ new Set();
    const registerItems = [];
    for (const [id] of registered) {
      if (!desired.has(id)) unregisterIds.add(id);
    }
    for (const [id, desiredItem] of desired) {
      const regItem = registered.get(id);
      if (!regItem) {
        registerItems.push(desiredItem);
        continue;
      }
      if (forceRefresh) {
        unregisterIds.add(id);
        registerItems.push(desiredItem);
        continue;
      }
      if (!isSameContentScriptRegistration(regItem, desiredItem)) {
        unregisterIds.add(id);
        registerItems.push(desiredItem);
      }
    }
    const registeredIdSet = new Set(Array.from(registered.keys()));
    const safeUnregisterIds = Array.from(unregisterIds).filter((id) => registeredIdSet.has(id));
    const result = {
      registeredIds: registerItems.map((d) => d.id),
      registeredSourceIds: registerItems.map((d) => d.sourceId || d.id),
      unregisteredIds: safeUnregisterIds
    };
    if (safeUnregisterIds.length) {
      await ns.chrome.scriptingUnregisterContentScripts({ ids: safeUnregisterIds });
    }
    if (!registerItems.length) {
      forceNextContentScriptRegistration = false;
      return result;
    }
    await ns.chrome.scriptingRegisterContentScripts(
      registerItems.map((d) => ({
        id: d.id,
        matches: d.matches,
        js: d.js,
        ...d.css?.length ? { css: d.css } : {},
        runAt: d.runAt,
        ...d.allFrames ? { allFrames: true } : {},
        ...d.world !== "ISOLATED" ? { world: d.world } : {}
      }))
    );
    forceNextContentScriptRegistration = false;
    return result;
  }
  function applySettingsAndRegister(settings) {
    applyChain = applyChain.catch((error) => {
      reportError("registration:apply-chain:register", error);
      return void 0;
    }).then(async () => {
      return await applyContentScriptRegistration(settings);
    });
    return applyChain;
  }
  function applySettingsAndInjectRegistered(settings) {
    applyChain = applyChain.catch((error) => {
      reportError("registration:apply-chain:inject", error);
      return void 0;
    }).then(async () => {
      const reg = await applyContentScriptRegistration(settings);
      try {
        const ids = Array.isArray(reg?.registeredIds) ? reg.registeredIds : [];
        if (!ids.length) return reg;
        const sourceIds = Array.isArray(reg?.registeredSourceIds) ? reg.registeredSourceIds : [];
        const allow = new Set(sourceIds.length ? sourceIds : ids);
        const enabled = getEnabledContentScriptDefs(settings);
        const defs = enabled.filter((d) => allow.has(d.id));
        injectContentScriptDefsIntoMatchingTabs(defs);
      } catch (error) {
        reportError("registration:inject-registered:tabs", error);
      }
      return reg;
    });
    return applyChain;
  }
  function applySettingsAndReinject(settings) {
    applyChain = applyChain.catch((error) => {
      reportError("registration:apply-chain:reinject", error);
      return void 0;
    }).then(async () => {
      const reg = await applyContentScriptRegistration(settings);
      scheduleReinject(settings);
      return reg;
    });
    return applyChain;
  }
  function ensureMainWorldScrollGuard(tabId, sendResponse) {
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: [ns.storage.getMainGuardFile()],
          world: "MAIN"
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) sendResponse({ ok: false, error: err.message || String(err) });
          else sendResponse({ ok: true });
        }
      );
    } catch (error) {
      sendResponse({ ok: false, error: ns.chrome.toErrorMessage(error) });
    }
  }
  ns.registration = Object.assign({}, ns.registration || {}, {
    isModuleEnabled,
    getEnabledContentScriptDefs,
    urlMatchesAny,
    injectContentScriptDefsIntoTab,
    injectContentScriptDefsIntoMatchingTabs,
    reinjectContentScripts,
    scheduleReinject,
    getRegisteredQuickNavContentScripts,
    applyContentScriptRegistration,
    applySettingsAndRegister,
    applySettingsAndInjectRegistered,
    applySettingsAndReinject,
    ensureMainWorldScrollGuard
  });
})();
