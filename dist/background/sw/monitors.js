(() => {
  "use strict";
  const root = globalThis;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== "object") root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;
  const MEMTEST = {
    controllerTabId: null,
    testTabId: null,
    running: false,
    lastAt: 0,
    lastCaseId: "",
    lastModules: null
  };
  const GPT53_ALARM_NAME = "aichat_ai_shortcuts_gpt53_probe";
  const GPT53_LEGACY_ALARM_NAME = "quicknav_gpt53_probe";
  const GPT53_URLS_KEY = String(ns.storage?.GPT53_PROBE_URLS_KEY || "aichat_ai_shortcuts_gpt53_probe_urls_v1");
  const GPT53_STATE_KEY = String(ns.storage?.GPT53_PROBE_STATE_KEY || "aichat_ai_shortcuts_gpt53_probe_state_v1");
  const GPT53_ALERTS_KEY = String(ns.storage?.GPT53_PROBE_ALERTS_KEY || "aichat_ai_shortcuts_gpt53_probe_alerts_v1");
  const GPT53_MONITOR = Object.freeze({
    defaultUrls: Object.freeze(["https://cdn.openai.com/API/docs/images/model-page/model-icons/gpt-5.3.png"]),
    alarmName: GPT53_ALARM_NAME,
    legacyAlarmName: GPT53_LEGACY_ALARM_NAME,
    intervalMin: 5,
    urlsKey: GPT53_URLS_KEY,
    storageKey: GPT53_STATE_KEY,
    alertKey: GPT53_ALERTS_KEY,
    notifyId: "quicknav_gpt53_available",
    badgeBg: "#ed5284"
  });
  const DEV_SMOKE_TARGETS = [
    { id: "chatgpt", url: "https://chatgpt.com/" },
    { id: "qwen", url: "https://chat.qwen.ai/" }
  ];
  let initialized = false;
  let alarmListenerInstalled = false;
  function memtestUpdateStatus(msg) {
    try {
      MEMTEST.lastAt = Date.now();
      MEMTEST.running = !!msg?.running;
      MEMTEST.controllerTabId = Number.isFinite(msg?.controllerTabId) ? msg.controllerTabId : MEMTEST.controllerTabId;
      MEMTEST.testTabId = Number.isFinite(msg?.testTabId) ? msg.testTabId : msg?.testTabId === null ? null : MEMTEST.testTabId;
      MEMTEST.lastCaseId = typeof msg?.caseId === "string" ? msg.caseId : MEMTEST.lastCaseId;
      MEMTEST.lastModules = Array.isArray(msg?.modules) ? msg.modules.slice() : MEMTEST.lastModules;
    } catch {
    }
  }
  function memtestBroadcastAbort(reason) {
    try {
      chrome.runtime.sendMessage(
        {
          type: "AISHORTCUTS_MEMTEST_ABORT",
          reason: String(reason || "abort"),
          caseId: typeof MEMTEST.lastCaseId === "string" ? MEMTEST.lastCaseId : "",
          modules: Array.isArray(MEMTEST.lastModules) ? MEMTEST.lastModules.slice() : null
        },
        () => void chrome.runtime.lastError
      );
    } catch {
    }
  }
  function memtestBroadcastGuard(reason) {
    try {
      chrome.runtime.sendMessage(
        {
          type: "AISHORTCUTS_MEMTEST_GUARD_EVENT",
          reason: String(reason || "guard"),
          caseId: typeof MEMTEST.lastCaseId === "string" ? MEMTEST.lastCaseId : "",
          modules: Array.isArray(MEMTEST.lastModules) ? MEMTEST.lastModules.slice() : null
        },
        () => void chrome.runtime.lastError
      );
    } catch {
    }
  }
  function memtestCloseTestTab(reason) {
    const tabId = MEMTEST.testTabId;
    if (!Number.isFinite(tabId)) return;
    try {
      chrome.tabs.remove(tabId, () => {
        void chrome.runtime.lastError;
      });
    } catch {
    }
    try {
      chrome.tabs.discard(tabId, () => void chrome.runtime.lastError);
    } catch {
    }
    try {
      memtestBroadcastGuard(reason);
    } catch {
    }
    try {
      MEMTEST.testTabId = null;
      MEMTEST.running = false;
      MEMTEST.lastAt = Date.now();
    } catch {
    }
    try {
      if (typeof reason === "string" && reason) {
        const caseId = typeof MEMTEST.lastCaseId === "string" ? MEMTEST.lastCaseId : "";
        const mods = Array.isArray(MEMTEST.lastModules) ? MEMTEST.lastModules.join(", ") : "";
        const details = `${caseId ? `
case: ${caseId}` : ""}${mods ? `
modules: ${mods}` : ""}`;
        const notifyId = `quicknav_memtest_abort_${Date.now()}`;
        void ns.chrome.notificationsCreate(notifyId, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: "QuickNav memtest stopped",
          message: `Stopped due to: ${reason}${details}`.slice(0, 220),
          priority: 1
        }).catch(() => void 0);
      }
    } catch {
    }
  }
  async function getGpt53Alerts() {
    try {
      const items = await ns.chrome.storageGet("local", { [GPT53_MONITOR.alertKey]: null });
      const raw = items?.[GPT53_MONITOR.alertKey];
      if (!raw || typeof raw !== "object") return { unread: 0, events: [] };
      const unread = Number(raw.unread) || 0;
      const events = Array.isArray(raw.events) ? raw.events.filter((x) => x && typeof x === "object") : [];
      return {
        unread: Math.max(0, Math.min(99, unread)),
        events: events.map((e) => ({
          at: Number(e.at) || 0,
          url: String(e.url || ""),
          status: Number(e.status) || 0
        })).filter((e) => e.at && e.url)
      };
    } catch {
      return { unread: 0, events: [] };
    }
  }
  async function setGpt53Alerts(next) {
    try {
      const v = next && typeof next === "object" ? next : { unread: 0, events: [] };
      await ns.chrome.storageSet("local", { [GPT53_MONITOR.alertKey]: v });
    } catch {
    }
  }
  function setActionBadge(unread) {
    const n = Number(unread) || 0;
    const text = n > 0 ? String(Math.min(99, n)) : "";
    try {
      if (chrome?.action?.setBadgeBackgroundColor) chrome.action.setBadgeBackgroundColor({ color: GPT53_MONITOR.badgeBg });
    } catch {
    }
    try {
      if (chrome?.action?.setBadgeText) chrome.action.setBadgeText({ text });
    } catch {
    }
  }
  async function syncGpt53Badge() {
    try {
      const alerts = await getGpt53Alerts();
      setActionBadge(alerts.unread);
    } catch {
    }
  }
  async function markGpt53AlertsRead() {
    try {
      const alerts = await getGpt53Alerts();
      if (!alerts.unread) return alerts;
      const next = { ...alerts, unread: 0 };
      await setGpt53Alerts(next);
      setActionBadge(0);
      return next;
    } catch {
      setActionBadge(0);
      return { unread: 0, events: [] };
    }
  }
  function broadcastGpt53Alert(payload) {
    try {
      chrome.runtime.sendMessage({ type: "AISHORTCUTS_GPT53_ALERT", payload }, () => void chrome.runtime.lastError);
    } catch {
    }
  }
  function formatGpt53AlertLine(ev) {
    try {
      const url = String(ev?.url || "");
      const status = Number(ev?.status) || 0;
      const u = new URL(url);
      const name = String(u.pathname || "").split("/").filter(Boolean).slice(-1)[0] || u.hostname;
      return status ? `${name}\uFF08${status}\uFF09` : name;
    } catch {
      const status = Number(ev?.status) || 0;
      return status ? `\uFF08${status}\uFF09` : "";
    }
  }
  function buildGpt53AlertMessage(alerts) {
    const events = Array.isArray(alerts?.events) ? alerts.events : [];
    if (!events.length) return "";
    const last = events.slice(-3);
    const parts = last.map((x) => formatGpt53AlertLine(x)).filter(Boolean);
    const more = events.length > 3 ? `\u2026+${events.length - 3}` : "";
    return parts.length ? `${parts.join("\uFF0C")}${more}` : "";
  }
  function normalizeGpt53ProbeUrls(input) {
    if (input == null) return [...GPT53_MONITOR.defaultUrls];
    const rawLines = (() => {
      if (Array.isArray(input)) return input;
      if (typeof input === "string") return input.split(/\r?\n/);
      return [];
    })();
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const line of rawLines) {
      const raw = String(line || "").trim();
      if (!raw) continue;
      if (raw.startsWith("#")) continue;
      let url = "";
      try {
        const u = new URL(raw);
        if (u.protocol !== "https:") continue;
        if (String(u.hostname || "").toLowerCase() !== "cdn.openai.com") continue;
        u.hash = "";
        url = u.href;
      } catch {
        url = "";
      }
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
      if (out.length >= 20) break;
    }
    return out;
  }
  async function getGpt53Urls() {
    try {
      const items = await ns.chrome.storageGet("local", { [GPT53_MONITOR.urlsKey]: null });
      const raw = items?.[GPT53_MONITOR.urlsKey];
      return normalizeGpt53ProbeUrls(raw);
    } catch {
      return [...GPT53_MONITOR.defaultUrls];
    }
  }
  async function setGpt53Urls(next) {
    try {
      const urls = normalizeGpt53ProbeUrls(next);
      await ns.chrome.storageSet("local", { [GPT53_MONITOR.urlsKey]: urls });
      return urls;
    } catch {
      return [...GPT53_MONITOR.defaultUrls];
    }
  }
  async function getGpt53State() {
    try {
      const items = await ns.chrome.storageGet("local", { [GPT53_MONITOR.storageKey]: null });
      const raw = items?.[GPT53_MONITOR.storageKey];
      if (raw && typeof raw === "object") {
        const isLegacy = Object.prototype.hasOwnProperty.call(raw, "available") && Object.prototype.hasOwnProperty.call(raw, "status");
        if (isLegacy) {
          const url = GPT53_MONITOR.defaultUrls[0];
          return {
            checkedAt: Number(raw.checkedAt) || 0,
            items: {
              [url]: {
                available: !!raw.available,
                status: Number(raw.status) || 0,
                checkedAt: Number(raw.checkedAt) || 0,
                error: typeof raw.error === "string" ? raw.error : ""
              }
            }
          };
        }
        return raw;
      }
      return null;
    } catch {
      return null;
    }
  }
  async function setGpt53State(next) {
    try {
      await ns.chrome.storageSet("local", { [GPT53_MONITOR.storageKey]: next || null });
    } catch {
    }
  }
  async function fetchUrlStatus(url) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      return res?.status || 0;
    } catch {
    }
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { Range: "bytes=0-0" }
      });
      return res?.status || 0;
    } catch {
    }
    return 0;
  }
  async function runGpt53Probe(options = {}) {
    const silent = !!options?.silent;
    try {
      const settings = await ns.storage.getSettings();
      if (settings && settings.enabled === false) {
        await setGpt53Alerts({ unread: 0, events: [] });
        setActionBadge(0);
        return;
      }
    } catch {
    }
    const urls = await getGpt53Urls();
    const checkedAt = Date.now();
    const prev = await getGpt53State();
    const prevItems = prev && typeof prev === "object" && prev.items && typeof prev.items === "object" ? prev.items : {};
    const nextItems = {};
    const availableNow = [];
    for (const url of urls) {
      const prevAvailable = !!prevItems?.[url]?.available;
      const status = await fetchUrlStatus(url);
      if (!status) {
        nextItems[url] = { available: prevAvailable, status: 0, checkedAt, error: "fetch_failed" };
        if (prevAvailable) availableNow.push({ url, status: 0 });
        continue;
      }
      const available = status !== 404;
      nextItems[url] = { available, status, checkedAt, error: "" };
      if (available) availableNow.push({ url, status });
    }
    await setGpt53State({ checkedAt, items: nextItems });
    try {
      const events = availableNow.map((it) => ({ at: checkedAt, url: String(it.url || ""), status: Number(it.status) || 0 })).filter((e) => e.at && e.url).slice(-50);
      const unread = Math.max(0, Math.min(99, availableNow.length));
      const nextAlerts = { unread, events };
      await setGpt53Alerts(nextAlerts);
      setActionBadge(unread);
      if (!availableNow.length) return;
      const msg = buildGpt53AlertMessage(nextAlerts);
      const title = "OpenAI \u65B0\u6A21\u578B\u63D0\u793A";
      try {
        if (silent) return;
        await ns.chrome.notificationsCreate(`${GPT53_MONITOR.notifyId}_${checkedAt}`, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title,
          message: availableNow.length === 1 ? `\u68C0\u6D4B\u5230\u8D44\u6E90\u53EF\u8BBF\u95EE\uFF1A${formatGpt53AlertLine({ url: availableNow[0]?.url, status: availableNow[0]?.status })}` : `\u68C0\u6D4B\u5230 ${availableNow.length} \u4E2A\u8D44\u6E90\u53EF\u8BBF\u95EE\uFF1A${msg}`,
          priority: 2
        });
      } catch {
      }
      if (!silent) broadcastGpt53Alert({ title, message: msg, unread, checkedAt });
    } catch {
    }
  }
  async function getGpt53Alarm() {
    try {
      return await new Promise((resolve) => {
        try {
          chrome.alarms.get(GPT53_MONITOR.alarmName, (alarm) => {
            const err = chrome.runtime.lastError;
            if (err) resolve(null);
            else resolve(alarm || null);
          });
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  }
  async function clearGpt53Alarm() {
    try {
      return await new Promise((resolve) => {
        try {
          chrome.alarms.clear(GPT53_MONITOR.alarmName, (cleared) => {
            void chrome.runtime.lastError;
            resolve(!!cleared);
          });
        } catch {
          resolve(false);
        }
      });
    } catch {
      return false;
    }
  }
  async function clearLegacyGpt53Alarm() {
    const legacyName = String(GPT53_MONITOR.legacyAlarmName || "").trim();
    const canonicalName = String(GPT53_MONITOR.alarmName || "").trim();
    if (!legacyName || legacyName === canonicalName) return;
    try {
      await new Promise((resolve) => {
        try {
          chrome.alarms.clear(legacyName, () => {
            void chrome.runtime.lastError;
            resolve(true);
          });
        } catch {
          resolve(false);
        }
      });
    } catch {
    }
  }
  async function getGpt53MonitorStatus(options = {}) {
    let settingsEnabled = options?.settingsEnabled;
    if (typeof settingsEnabled !== "boolean") {
      try {
        const settings = await ns.storage.getSettings();
        settingsEnabled = !(settings && settings.enabled === false);
      } catch {
        settingsEnabled = true;
      }
    }
    const urls = Array.isArray(options?.urls) ? options.urls.filter((url) => typeof url === "string" && url.trim()) : await getGpt53Urls();
    if (!settingsEnabled) {
      return {
        enabled: false,
        reason: "extension_disabled",
        settingsEnabled: false,
        urls
      };
    }
    if (!urls.length) {
      return {
        enabled: false,
        reason: "no_urls",
        settingsEnabled: true,
        urls
      };
    }
    return {
      enabled: true,
      reason: "active",
      settingsEnabled: true,
      urls
    };
  }
  async function clearGpt53Alerts() {
    try {
      await setGpt53Alerts({ unread: 0, events: [] });
    } catch {
    }
    setActionBadge(0);
    return { unread: 0, events: [] };
  }
  async function ensureGpt53Alarm() {
    await clearLegacyGpt53Alarm();
    const monitor = await getGpt53MonitorStatus();
    if (!monitor.enabled) {
      await clearGpt53Alarm();
      return null;
    }
    try {
      const existing = await getGpt53Alarm();
      if (existing && Number(existing.periodInMinutes) === GPT53_MONITOR.intervalMin) return existing;
    } catch {
    }
    try {
      chrome.alarms.create(GPT53_MONITOR.alarmName, { periodInMinutes: GPT53_MONITOR.intervalMin });
    } catch {
    }
    return await getGpt53Alarm();
  }
  function normalizeDevSmokeTargetIds(value) {
    try {
      if (!value) return [];
      if (typeof value === "string") {
        return value.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (Array.isArray(value)) {
        return value.map((s) => String(s || "").trim()).filter(Boolean);
      }
    } catch {
    }
    return [];
  }
  function resolveDevSmokeTargets(options) {
    const ids = normalizeDevSmokeTargetIds(options?.targets || options?.ids || options?.only);
    if (!ids.length) return DEV_SMOKE_TARGETS;
    const allow = new Set(ids);
    return DEV_SMOKE_TARGETS.filter((t) => allow.has(t.id));
  }
  function waitForTabComplete(tabId, timeoutMs) {
    const timeout = Math.max(2e3, Number(timeoutMs) || 25e3);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error, tab) => {
        if (done) return;
        done = true;
        try {
          chrome.tabs.onUpdated.removeListener(onUpdated);
        } catch {
        }
        try {
          clearTimeout(timer);
        } catch {
        }
        if (error) reject(error);
        else resolve(tab || null);
      };
      const onUpdated = (id, changeInfo, tab) => {
        try {
          if (id !== tabId) return;
          if (changeInfo && changeInfo.status === "complete") finish(null, tab);
        } catch (error) {
          finish(error, null);
        }
      };
      const timer = setTimeout(() => finish(new Error("Tab load timeout"), null), timeout);
      try {
        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.get(tabId, (tab) => {
          void chrome.runtime.lastError;
          if (tab && tab.status === "complete") finish(null, tab);
        });
      } catch (error) {
        finish(error, null);
      }
    });
  }
  function execSmokeCheck(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            world: "ISOLATED",
            func: () => {
              const out = {
                href: (() => {
                  try {
                    return location.href;
                  } catch {
                    return "";
                  }
                })(),
                hasBridge: (() => {
                  try {
                    return typeof window.__aichat_quicknav_bridge_v1__ === "object";
                  } catch {
                    return false;
                  }
                })(),
                hasMenuBridge: typeof window.__quicknavRegisterMenuCommand === "function",
                navCount: 0,
                hasNav: false,
                hasLock: false,
                keysBound: false
              };
              try {
                out.navCount = document.querySelectorAll("#cgpt-compact-nav").length;
                out.hasNav = !!document.getElementById("cgpt-compact-nav");
                out.hasLock = !!document.querySelector("#cgpt-compact-nav .compact-lock");
              } catch {
              }
              try {
                out.keysBound = !!window.__cgptKeysBound;
              } catch {
              }
              return out;
            }
          },
          (res) => {
            const err = chrome.runtime.lastError;
            if (err) return resolve({ ok: false, error: err.message || String(err) });
            const v = Array.isArray(res) && res[0] ? res[0].result : null;
            resolve({ ok: true, result: v });
          }
        );
      } catch (error) {
        resolve({ ok: false, error: ns.chrome.toErrorMessage(error) });
      }
    });
  }
  async function runDevSmokeTests(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const closeTabs = options.closeTabs !== false;
    const timeoutMs = Math.max(2e3, Number(options.timeoutMs) || 25e3);
    const targets = resolveDevSmokeTargets(options);
    const summary = [];
    for (const t of targets) {
      const row = { id: t.id, url: t.url, ok: false, detail: null, error: null };
      let tabId = null;
      try {
        const tab = await new Promise((resolve) => {
          chrome.tabs.create({ url: t.url, active: false }, (tb) => {
            void chrome.runtime.lastError;
            resolve(tb || null);
          });
        });
        tabId = tab?.id;
        if (!Number.isFinite(tabId)) throw new Error("Failed to create tab");
        const currentTabId = Number(tabId);
        await waitForTabComplete(currentTabId, timeoutMs);
        const check = await execSmokeCheck(currentTabId);
        if (!check.ok) throw new Error(check.error || "Smoke check failed");
        row.ok = true;
        row.detail = check.result;
      } catch (error) {
        row.ok = false;
        row.error = ns.chrome.toErrorMessage(error);
      } finally {
        if (closeTabs && Number.isFinite(tabId)) {
          try {
            chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
          } catch {
          }
        }
        summary.push(row);
      }
    }
    return summary;
  }
  function installAlarmListener() {
    if (alarmListenerInstalled) return;
    alarmListenerInstalled = true;
    try {
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm?.name !== GPT53_MONITOR.alarmName) return;
        void runGpt53Probe();
      });
    } catch {
    }
  }
  function installDebugGlobals() {
    try {
      root.__quicknavGpt53Probe = {
        defaultUrls: GPT53_MONITOR.defaultUrls,
        urls: () => getGpt53Urls(),
        setUrls: (urls) => setGpt53Urls(urls),
        run: () => runGpt53Probe(),
        state: () => getGpt53State(),
        alerts: () => getGpt53Alerts(),
        markRead: () => markGpt53AlertsRead()
      };
    } catch {
    }
    try {
      root.__quicknavDevSmoke = {
        run: (opts) => runDevSmokeTests(opts),
        registeredContentScripts: () => ns.registration.getRegisteredQuickNavContentScripts()
      };
    } catch {
    }
  }
  function init() {
    if (initialized) return;
    initialized = true;
    installAlarmListener();
    void syncGpt53Badge();
    void (async () => {
      try {
        await ensureGpt53Alarm();
      } catch {
      }
      try {
        const state = await getGpt53State();
        const checkedAt = Number(state?.checkedAt) || 0;
        if (!checkedAt) await runGpt53Probe();
      } catch {
      }
    })();
    installDebugGlobals();
  }
  ns.monitors = Object.assign({}, ns.monitors || {}, {
    GPT53_MONITOR,
    init,
    memtestUpdateStatus,
    memtestBroadcastAbort,
    memtestBroadcastGuard,
    memtestCloseTestTab,
    getGpt53Alerts,
    setGpt53Alerts,
    getGpt53Urls,
    setGpt53Urls,
    getGpt53State,
    setGpt53State,
    getGpt53MonitorStatus,
    clearGpt53Alerts,
    clearGpt53Alarm,
    runGpt53Probe,
    ensureGpt53Alarm,
    markGpt53AlertsRead,
    runDevSmokeTests
  });
})();
