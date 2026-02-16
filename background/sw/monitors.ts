(() => {
  'use strict';

  const root = globalThis as any;
  const ns = root.__quicknavSw || (root.__quicknavSw = {});

  const MEMTEST = {
    controllerTabId: null as number | null,
    testTabId: null as number | null,
    running: false,
    lastAt: 0,
    lastCaseId: '',
    lastModules: null as string[] | null
  };

  const GPT53_MONITOR = Object.freeze({
    defaultUrls: Object.freeze(['https://cdn.openai.com/API/docs/images/model-page/model-icons/gpt-5.3.png']),
    alarmName: 'quicknav_gpt53_probe',
    intervalMin: 5,
    urlsKey: 'quicknav_gpt53_probe_urls_v1',
    storageKey: 'quicknav_gpt53_probe_state_v1',
    alertKey: 'quicknav_gpt53_probe_alerts_v1',
    notifyId: 'quicknav_gpt53_available',
    badgeBg: '#ed5284'
  });

  const DEV_SMOKE_TARGETS = [
    { id: 'chatgpt', url: 'https://chatgpt.com/' },
    { id: 'qwen', url: 'https://chat.qwen.ai/' }
  ];

  let initialized = false;
  let alarmListenerInstalled = false;

  function memtestUpdateStatus(msg: any) {
    try {
      MEMTEST.lastAt = Date.now();
      MEMTEST.running = !!msg?.running;
      MEMTEST.controllerTabId = Number.isFinite(msg?.controllerTabId) ? msg.controllerTabId : MEMTEST.controllerTabId;
      MEMTEST.testTabId = Number.isFinite(msg?.testTabId) ? msg.testTabId : msg?.testTabId === null ? null : MEMTEST.testTabId;
      MEMTEST.lastCaseId = typeof msg?.caseId === 'string' ? msg.caseId : MEMTEST.lastCaseId;
      MEMTEST.lastModules = Array.isArray(msg?.modules) ? msg.modules.slice() : MEMTEST.lastModules;
    } catch {}
  }

  function memtestBroadcastAbort(reason: any) {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'QUICKNAV_MEMTEST_ABORT',
          reason: String(reason || 'abort'),
          caseId: typeof MEMTEST.lastCaseId === 'string' ? MEMTEST.lastCaseId : '',
          modules: Array.isArray(MEMTEST.lastModules) ? MEMTEST.lastModules.slice() : null
        },
        () => void chrome.runtime.lastError
      );
    } catch {}
  }

  function memtestBroadcastGuard(reason: any) {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'QUICKNAV_MEMTEST_GUARD_EVENT',
          reason: String(reason || 'guard'),
          caseId: typeof MEMTEST.lastCaseId === 'string' ? MEMTEST.lastCaseId : '',
          modules: Array.isArray(MEMTEST.lastModules) ? MEMTEST.lastModules.slice() : null
        },
        () => void chrome.runtime.lastError
      );
    } catch {}
  }

  function memtestCloseTestTab(reason: any) {
    const tabId = MEMTEST.testTabId;
    if (!Number.isFinite(tabId)) return;
    try {
      chrome.tabs.remove(tabId, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
    try {
      chrome.tabs.discard(tabId, () => void chrome.runtime.lastError);
    } catch {}
    try {
      memtestBroadcastGuard(reason);
    } catch {}
    try {
      MEMTEST.testTabId = null;
      MEMTEST.running = false;
      MEMTEST.lastAt = Date.now();
    } catch {}
    try {
      if (typeof reason === 'string' && reason) {
        const caseId = typeof MEMTEST.lastCaseId === 'string' ? MEMTEST.lastCaseId : '';
        const mods = Array.isArray(MEMTEST.lastModules) ? MEMTEST.lastModules.join(', ') : '';
        const details = `${caseId ? `\ncase: ${caseId}` : ''}${mods ? `\nmodules: ${mods}` : ''}`;
        const notifyId = `quicknav_memtest_abort_${Date.now()}`;
        void ns.chrome
          .notificationsCreate(notifyId, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: 'QuickNav memtest stopped',
            message: (`Stopped due to: ${reason}${details}`).slice(0, 220),
            priority: 1
          })
          .catch(() => void 0);
      }
    } catch {}
  }

  async function getGpt53Alerts() {
    try {
      const items = await ns.chrome.storageGet('local', { [GPT53_MONITOR.alertKey]: null });
      const raw = items?.[GPT53_MONITOR.alertKey];
      if (!raw || typeof raw !== 'object') return { unread: 0, events: [] };
      const unread = Number(raw.unread) || 0;
      const events = Array.isArray(raw.events) ? raw.events.filter((x: any) => x && typeof x === 'object') : [];
      return {
        unread: Math.max(0, Math.min(99, unread)),
        events: events
          .map((e: any) => ({
            at: Number(e.at) || 0,
            url: String(e.url || ''),
            status: Number(e.status) || 0
          }))
          .filter((e: any) => e.at && e.url)
      };
    } catch {
      return { unread: 0, events: [] };
    }
  }

  async function setGpt53Alerts(next: any) {
    try {
      const v = next && typeof next === 'object' ? next : { unread: 0, events: [] };
      await ns.chrome.storageSet('local', { [GPT53_MONITOR.alertKey]: v });
    } catch {}
  }

  function setActionBadge(unread: any) {
    const n = Number(unread) || 0;
    const text = n > 0 ? String(Math.min(99, n)) : '';
    try {
      if (chrome?.action?.setBadgeBackgroundColor) chrome.action.setBadgeBackgroundColor({ color: GPT53_MONITOR.badgeBg });
    } catch {}
    try {
      if (chrome?.action?.setBadgeText) chrome.action.setBadgeText({ text });
    } catch {}
  }

  async function syncGpt53Badge() {
    try {
      const alerts = await getGpt53Alerts();
      setActionBadge(alerts.unread);
    } catch {}
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

  function broadcastGpt53Alert(payload: any) {
    try {
      chrome.runtime.sendMessage({ type: 'QUICKNAV_GPT53_ALERT', payload }, () => void chrome.runtime.lastError);
    } catch {}
  }

  function formatGpt53AlertLine(ev: any) {
    try {
      const url = String(ev?.url || '');
      const status = Number(ev?.status) || 0;
      const u = new URL(url);
      const name = String(u.pathname || '').split('/').filter(Boolean).slice(-1)[0] || u.hostname;
      return status ? `${name}（${status}）` : name;
    } catch {
      const status = Number(ev?.status) || 0;
      return status ? `（${status}）` : '';
    }
  }

  function buildGpt53AlertMessage(alerts: any) {
    const events = Array.isArray(alerts?.events) ? alerts.events : [];
    if (!events.length) return '';
    const last = events.slice(-3);
    const parts = last.map((x: any) => formatGpt53AlertLine(x)).filter(Boolean);
    const more = events.length > 3 ? `…+${events.length - 3}` : '';
    return parts.length ? `${parts.join('，')}${more}` : '';
  }

  function normalizeGpt53ProbeUrls(input: any) {
    if (input == null) return [...GPT53_MONITOR.defaultUrls];

    const rawLines = (() => {
      if (Array.isArray(input)) return input;
      if (typeof input === 'string') return input.split(/\r?\n/);
      return [];
    })();

    const out: string[] = [];
    const seen = new Set<string>();
    for (const line of rawLines) {
      const raw = String(line || '').trim();
      if (!raw) continue;
      if (raw.startsWith('#')) continue;
      let url = '';
      try {
        const u = new URL(raw);
        if (u.protocol !== 'https:') continue;
        if (String(u.hostname || '').toLowerCase() !== 'cdn.openai.com') continue;
        u.hash = '';
        url = u.href;
      } catch {
        url = '';
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
      const items = await ns.chrome.storageGet('local', { [GPT53_MONITOR.urlsKey]: null });
      const raw = items?.[GPT53_MONITOR.urlsKey];
      return normalizeGpt53ProbeUrls(raw);
    } catch {
      return [...GPT53_MONITOR.defaultUrls];
    }
  }

  async function setGpt53Urls(next: any) {
    try {
      const urls = normalizeGpt53ProbeUrls(next);
      await ns.chrome.storageSet('local', { [GPT53_MONITOR.urlsKey]: urls });
      return urls;
    } catch {
      return [...GPT53_MONITOR.defaultUrls];
    }
  }

  async function getGpt53State() {
    try {
      const items = await ns.chrome.storageGet('local', { [GPT53_MONITOR.storageKey]: null });
      const raw = items?.[GPT53_MONITOR.storageKey];
      if (raw && typeof raw === 'object') {
        const isLegacy = Object.prototype.hasOwnProperty.call(raw, 'available') && Object.prototype.hasOwnProperty.call(raw, 'status');
        if (isLegacy) {
          const url = GPT53_MONITOR.defaultUrls[0];
          return {
            checkedAt: Number(raw.checkedAt) || 0,
            items: {
              [url]: {
                available: !!raw.available,
                status: Number(raw.status) || 0,
                checkedAt: Number(raw.checkedAt) || 0,
                error: typeof raw.error === 'string' ? raw.error : ''
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

  async function setGpt53State(next: any) {
    try {
      await ns.chrome.storageSet('local', { [GPT53_MONITOR.storageKey]: next || null });
    } catch {}
  }

  async function fetchUrlStatus(url: string) {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return res?.status || 0;
    } catch {}
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Range: 'bytes=0-0' }
      });
      return res?.status || 0;
    } catch {}
    return 0;
  }

  async function runGpt53Probe(options: any = {}) {
    const silent = !!options?.silent;
    try {
      const settings = await ns.storage.getSettings();
      if (settings && settings.enabled === false) {
        await setGpt53Alerts({ unread: 0, events: [] });
        setActionBadge(0);
        return;
      }
    } catch {}

    const urls = await getGpt53Urls();
    const checkedAt = Date.now();

    const prev = await getGpt53State();
    const prevItems = prev && typeof prev === 'object' && prev.items && typeof prev.items === 'object' ? prev.items : {};

    const nextItems: any = {};
    const availableNow: Array<{ url: string; status: number }> = [];

    for (const url of urls) {
      const prevAvailable = !!prevItems?.[url]?.available;
      const status = await fetchUrlStatus(url);
      if (!status) {
        nextItems[url] = { available: prevAvailable, status: 0, checkedAt, error: 'fetch_failed' };
        if (prevAvailable) availableNow.push({ url, status: 0 });
        continue;
      }
      const available = status !== 404;
      nextItems[url] = { available, status, checkedAt, error: '' };
      if (available) availableNow.push({ url, status });
    }

    await setGpt53State({ checkedAt, items: nextItems });

    try {
      const events = availableNow
        .map((it) => ({ at: checkedAt, url: String(it.url || ''), status: Number(it.status) || 0 }))
        .filter((e) => e.at && e.url)
        .slice(-50);
      const unread = Math.max(0, Math.min(99, availableNow.length));
      const nextAlerts = { unread, events };
      await setGpt53Alerts(nextAlerts);
      setActionBadge(unread);

      if (!availableNow.length) return;

      const msg = buildGpt53AlertMessage(nextAlerts);
      const title = 'OpenAI 新模型提示';

      try {
        if (silent) return;
        await ns.chrome.notificationsCreate(`${GPT53_MONITOR.notifyId}_${checkedAt}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title,
          message:
            availableNow.length === 1
              ? `检测到资源可访问：${formatGpt53AlertLine({ url: availableNow[0]?.url, status: availableNow[0]?.status })}`
              : `检测到 ${availableNow.length} 个资源可访问：${msg}`,
          priority: 2
        });
      } catch {}

      if (!silent) broadcastGpt53Alert({ title, message: msg, unread, checkedAt });
    } catch {}
  }

  async function getGpt53Alarm() {
    try {
      return await new Promise((resolve) => {
        try {
          chrome.alarms.get(GPT53_MONITOR.alarmName, (alarm: any) => {
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

  async function ensureGpt53Alarm() {
    try {
      const existing = await getGpt53Alarm();
      if (existing && Number((existing as any).periodInMinutes) === GPT53_MONITOR.intervalMin) return existing;
    } catch {}

    try {
      chrome.alarms.create(GPT53_MONITOR.alarmName, { periodInMinutes: GPT53_MONITOR.intervalMin });
    } catch {}

    return await getGpt53Alarm();
  }

  function normalizeDevSmokeTargetIds(value: any) {
    try {
      if (!value) return [];
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
      if (Array.isArray(value)) {
        return value.map((s: any) => String(s || '').trim()).filter(Boolean);
      }
    } catch {}
    return [];
  }

  function resolveDevSmokeTargets(options: any) {
    const ids = normalizeDevSmokeTargetIds(options?.targets || options?.ids || options?.only);
    if (!ids.length) return DEV_SMOKE_TARGETS;
    const allow = new Set(ids);
    return DEV_SMOKE_TARGETS.filter((t) => allow.has(t.id));
  }

  function waitForTabComplete(tabId: number, timeoutMs: any) {
    const timeout = Math.max(2000, Number(timeoutMs) || 25000);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error: any, tab: any) => {
        if (done) return;
        done = true;
        try {
          chrome.tabs.onUpdated.removeListener(onUpdated);
        } catch {}
        try {
          clearTimeout(timer);
        } catch {}
        if (error) reject(error);
        else resolve(tab || null);
      };

      const onUpdated = (id: number, changeInfo: any, tab: any) => {
        try {
          if (id !== tabId) return;
          if (changeInfo && changeInfo.status === 'complete') finish(null, tab);
        } catch (error) {
          finish(error, null);
        }
      };
      const timer = setTimeout(() => finish(new Error('Tab load timeout'), null), timeout);

      try {
        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.get(tabId, (tab: any) => {
          void chrome.runtime.lastError;
          if (tab && tab.status === 'complete') finish(null, tab);
        });
      } catch (error) {
        finish(error, null);
      }
    });
  }

  function execSmokeCheck(tabId: number) {
    return new Promise((resolve) => {
      try {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            world: 'ISOLATED',
            func: () => {
              const out = {
                href: (() => {
                  try {
                    return location.href;
                  } catch {
                    return '';
                  }
                })(),
                hasBridge: (() => {
                  try {
                    return typeof (window as any).__aichat_quicknav_bridge_v1__ === 'object';
                  } catch {
                    return false;
                  }
                })(),
                hasMenuBridge: typeof (window as any).__quicknavRegisterMenuCommand === 'function',
                navCount: 0,
                hasNav: false,
                hasLock: false,
                keysBound: false
              };
              try {
                out.navCount = document.querySelectorAll('#cgpt-compact-nav').length;
                out.hasNav = !!document.getElementById('cgpt-compact-nav');
                out.hasLock = !!document.querySelector('#cgpt-compact-nav .compact-lock');
              } catch {}
              try {
                out.keysBound = !!(window as any).__cgptKeysBound;
              } catch {}
              return out;
            }
          },
          (res: any[]) => {
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

  async function runDevSmokeTests(opts: any) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const closeTabs = options.closeTabs !== false;
    const timeoutMs = Math.max(2000, Number(options.timeoutMs) || 25000);
    const targets = resolveDevSmokeTargets(options);

    const summary: any[] = [];
    for (const t of targets) {
      const row: any = { id: t.id, url: t.url, ok: false, detail: null, error: null };
      let tabId: number | null = null;
      try {
        const tab = await new Promise<any>((resolve) => {
          chrome.tabs.create({ url: t.url, active: false }, (tb: any) => {
            void chrome.runtime.lastError;
            resolve(tb || null);
          });
        });

        tabId = tab?.id;
        if (!Number.isFinite(tabId)) throw new Error('Failed to create tab');

        const currentTabId = Number(tabId);
        await waitForTabComplete(currentTabId, timeoutMs);
        const check = await execSmokeCheck(currentTabId);
        if (!(check as any).ok) throw new Error((check as any).error || 'Smoke check failed');
        row.ok = true;
        row.detail = (check as any).result;
      } catch (error) {
        row.ok = false;
        row.error = ns.chrome.toErrorMessage(error);
      } finally {
        if (closeTabs && Number.isFinite(tabId)) {
          try {
            chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
          } catch {}
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
      chrome.alarms.onAlarm.addListener((alarm: any) => {
        if (alarm?.name !== GPT53_MONITOR.alarmName) return;
        void runGpt53Probe();
      });
    } catch {}
  }

  function installDebugGlobals() {
    try {
      root.__quicknavGpt53Probe = {
        defaultUrls: GPT53_MONITOR.defaultUrls,
        urls: () => getGpt53Urls(),
        setUrls: (urls: any) => setGpt53Urls(urls),
        run: () => runGpt53Probe(),
        state: () => getGpt53State(),
        alerts: () => getGpt53Alerts(),
        markRead: () => markGpt53AlertsRead()
      };
    } catch {}

    try {
      root.__quicknavDevSmoke = {
        run: (opts: any) => runDevSmokeTests(opts),
        registeredContentScripts: () => ns.registration.getRegisteredQuickNavContentScripts()
      };
    } catch {}
  }

  function init() {
    if (initialized) return;
    initialized = true;

    installAlarmListener();
    void syncGpt53Badge();

    void (async () => {
      try {
        await ensureGpt53Alarm();
      } catch {}
      try {
        const state = await getGpt53State();
        const checkedAt = Number((state as any)?.checkedAt) || 0;
        if (!checkedAt) await runGpt53Probe();
      } catch {}
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
    runGpt53Probe,
    ensureGpt53Alarm,
    markGpt53AlertsRead,
    runDevSmokeTests
  });
})();
