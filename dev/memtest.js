(() => {
  'use strict';

  const SITE_ID = 'chatgpt';
  const CHATGPT_URL = 'https://chatgpt.com/';

  const $ = (id) => document.getElementById(id);
  const logEl = $('log');
  const btnStart = $('btnStart');
  const btnStop = $('btnStop');
  const btnDryRun = $('btnDryRun');
  const btnOpenChatGPT = $('btnOpenChatGPT');
  const btnSaveReport = $('btnSaveReport');
  const statusPill = $('statusPill');

  const caseMinutesEl = $('caseMinutes');
  const messagesPerCaseEl = $('messagesPerCase');
  const sampleSecondsEl = $('sampleSeconds');
  const heapAbortMbEl = $('heapAbortMb');
  const promptTemplateEl = $('promptTemplate');
  const treeOpenModeEl = $('treeOpenMode');
  const matrixModeEl = $('matrixMode');
  const exerciseModeEl = $('exerciseMode');

  const modsEl = $('mods');

  const REGISTRY = globalThis.QUICKNAV_REGISTRY;
  if (!REGISTRY || !Array.isArray(REGISTRY.sites) || !REGISTRY.modules) {
    writeLog('[FATAL] QUICKNAV_REGISTRY not found. Did shared/registry.js load?');
    return;
  }

  const chatgptSite = REGISTRY.sites.find((s) => s && s.id === SITE_ID) || null;
  const chatgptModuleIds = Array.isArray(chatgptSite?.modules) ? chatgptSite.modules.map((x) => String(x || '')).filter(Boolean) : [];
  const moduleMeta = (id) => (REGISTRY.modules && typeof REGISTRY.modules === 'object' ? REGISTRY.modules[id] : null);

  const runner = {
    running: false,
    abort: false,
    abortReason: '',
    testTabId: null,
    controllerTabId: null,
    controllerWindowId: null,
    controllerLockOwner: false,
    controllerLockHeartbeatTimer: null,
    backupSettings: null,
    results: [],
    guardEvents: [],
    currentRec: null,
    autoSave: false,
    resume: true,
    caseIdAllow: null,
    seed: null,
    groupMaxFactors: 8,
    matrixMode: null,
    matrixMeta: null,
    matrixSelected: null,
    matrixConfig: null,
    maxWaitPerMessageMsOverride: null,
    reportSeq: 0,
    createdTabIds: new Set(),
    orphanCleanupTimer: null,
    orphanCleanupInFlight: false,
    consecutiveUiReadyFailures: 0
  };

  const CONTROLLER_LOCK_KEY = '__qn_memtest_controller_lock_v1';
  const CONTROLLER_LOCK_HEARTBEAT_MS = 5000;
  const CONTROLLER_LOCK_TTL_MS = 120000;

  function setStatus(text, ok = true) {
    try {
      statusPill.innerHTML = ok
        ? `<span class=\"okDot\"></span><span>${escapeHtml(text)}</span>`
        : `<span class=\"badDot\"></span><span>${escapeHtml(text)}</span>`;
    } catch {}
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function writeLog(line) {
    const ts = new Date().toISOString();
    const msg = `[${ts}] ${String(line || '')}`;
    try {
      logEl.textContent += (logEl.textContent ? '\n' : '') + msg;
      // Prevent the dev page itself from ballooning memory during long runs.
      if (logEl.textContent.length > 350_000) logEl.textContent = logEl.textContent.slice(-300_000);
      logEl.scrollTop = logEl.scrollHeight;
    } catch {}
    try {
      // eslint-disable-next-line no-console
      console.log(msg);
    } catch {}
  }

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageLocalSet(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  function storageLocalRemove(keys) {
    const arr = Array.isArray(keys) ? keys : [keys];
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(arr.filter(Boolean), () => {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  function storageLocalGet(keysOrObj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keysOrObj, (items) => {
          void chrome.runtime.lastError;
          resolve(items || {});
        });
      } catch {
        resolve({});
      }
    });
  }

  async function loadPersistedPartialReport() {
    try {
      const d = await storageLocalGet({ __qn_memtest_partial_v1: null });
      const r = d && d.__qn_memtest_partial_v1;
      if (!r || typeof r !== 'object') return null;
      return r;
    } catch {
      return null;
    }
  }

  function sameStringSet(a, b) {
    const as = Array.isArray(a) ? a.map(String) : [];
    const bs = Array.isArray(b) ? b.map(String) : [];
    if (as.length !== bs.length) return false;
    const sa = new Set(as);
    const sb = new Set(bs);
    if (sa.size !== sb.size) return false;
    for (const x of sa) if (!sb.has(x)) return false;
    return true;
  }

  function isCompatiblePersistedReport(report, mode, selected, seed) {
    try {
      if (!report || typeof report !== 'object') return false;
      const rMode = String(report?.matrix?.mode || '');
      if (rMode && String(mode || '') && rMode !== String(mode || '')) return false;

      const rSelected = report?.matrix?.selectedModules;
      if (Array.isArray(rSelected) && Array.isArray(selected) && !sameStringSet(rSelected, selected)) return false;

      const rSeed = report?.config?.seed;
      if (rSeed != null && seed != null && Number(rSeed) !== Number(seed)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function buildDoneCaseIdSet(results) {
    const done = new Set();
    for (const rec of Array.isArray(results) ? results : []) {
      if (!rec || typeof rec !== 'object') continue;
      const id = typeof rec.caseId === 'string' ? rec.caseId : '';
      if (!id) continue;
      // Consider a case "done" only if it did NOT error and did not end due to controller-level timeouts.
      // (Retry flaky/hung cases on resume.)
      const stop = typeof rec.stopReason === 'string' ? rec.stopReason : '';
      if (rec.error) continue;
      if (!stop) continue;
      if (stop === 'poll_timeout' || stop === 'poll_deadline' || stop === 'collect_timeout') continue;
      done.add(id);
    }
    return done;
  }

  async function ensureSingleController() {
    if (runner.controllerLockOwner) return true;

    const selfTabId = await new Promise((resolve) => {
      try {
        chrome.tabs.getCurrent((tab) => resolve(tab && Number.isFinite(tab.id) ? tab.id : null));
      } catch {
        resolve(null);
      }
    });

    // Best-effort: if we can't get tab id, don't block running.
    if (!Number.isFinite(selfTabId)) return true;

    const now = Date.now();
    const d = await storageLocalGet({ [CONTROLLER_LOCK_KEY]: null });
    const lock = d && d[CONTROLLER_LOCK_KEY] && typeof d[CONTROLLER_LOCK_KEY] === 'object' ? d[CONTROLLER_LOCK_KEY] : null;
    const ownerTabId = lock && Number.isFinite(lock.ownerTabId) ? lock.ownerTabId : null;
    const heartbeatAt = lock && Number.isFinite(lock.heartbeatAt) ? lock.heartbeatAt : 0;
    let stale = !heartbeatAt || now - heartbeatAt > CONTROLLER_LOCK_TTL_MS;
    // Defensive: sometimes the controller tab crashes/reloads and fails to remove the lock.
    // If the recorded owner tab no longer exists, treat the lock as stale so a new controller can proceed.
    if (!stale && ownerTabId != null && ownerTabId !== selfTabId) {
      try {
        const ownerTab = await tabsGet(ownerTabId);
        if (!ownerTab) stale = true;
      } catch {
        stale = true;
      }
    }

    if (ownerTabId != null && ownerTabId !== selfTabId && !stale) {
      writeLog(`[WARN] another memtest controller is active (tabId=${ownerTabId}); closing this controller tab`);
      setStatus('Secondary controller (closing)', false);
      try {
        btnStart.disabled = true;
        btnStop.disabled = true;
        btnDryRun.disabled = true;
        btnOpenChatGPT.disabled = true;
      } catch {}
      closeSelfTabSoon(900);
      return false;
    }

    await storageLocalSet({
      [CONTROLLER_LOCK_KEY]: {
        ownerTabId: selfTabId,
        claimedAt: lock && Number.isFinite(lock.claimedAt) ? lock.claimedAt : now,
        heartbeatAt: now,
      },
    });

    runner.controllerLockOwner = true;
    try {
      if (runner.controllerLockHeartbeatTimer) clearInterval(runner.controllerLockHeartbeatTimer);
    } catch {}
    runner.controllerLockHeartbeatTimer = setInterval(() => {
      try {
        void storageLocalSet({
          [CONTROLLER_LOCK_KEY]: {
            ownerTabId: selfTabId,
            claimedAt: lock && Number.isFinite(lock.claimedAt) ? lock.claimedAt : now,
            heartbeatAt: Date.now(),
          },
        });
      } catch {}
    }, CONTROLLER_LOCK_HEARTBEAT_MS);

    try {
      window.addEventListener(
        'beforeunload',
        () => {
          try {
            if (runner.controllerLockOwner) void storageLocalRemove(CONTROLLER_LOCK_KEY);
          } catch {}
        },
        { once: true }
      );
    } catch {}

    return true;
  }

  function broadcastMemtestStatus(extra) {
    try {
      const payload = {
        type: 'QUICKNAV_MEMTEST_STATUS',
        at: Date.now(),
        running: !!runner.running,
        abort: !!runner.abort,
        controllerTabId: runner.controllerTabId,
        testTabId: runner.testTabId,
        matrixMode: runner.matrixMode || null,
        matrixMeta: runner.matrixMeta || null,
        resultsCount: Array.isArray(runner.results) ? runner.results.length : 0,
      };
      if (extra && typeof extra === 'object') {
        for (const [k, v] of Object.entries(extra)) payload[k] = v;
      }
      void sendMessage(payload).catch(() => void 0);
    } catch {}
  }

  function closeSelfTabSoon(delayMs = 800) {
    const ms = Math.max(0, Number(delayMs) || 0);
    setTimeout(() => {
      try {
        chrome.tabs.getCurrent((tab) => {
          const id = tab && Number.isFinite(tab.id) ? tab.id : null;
          if (!Number.isFinite(id)) return;
          chrome.tabs.remove(id, () => void chrome.runtime.lastError);
        });
      } catch {}
    }, ms);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function withTimeout(promise, timeoutMs, label) {
    const ms = Math.max(1, Number(timeoutMs) || 0);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`timeout: ${label || 'operation'}`));
      }, ms);
      Promise.resolve(promise).then(
        (v) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }

  function throwIfAborted() {
    if (runner.abort) throw new Error('aborted');
  }

  function tabsCreate(createProps) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.create(createProps, (tab) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(tab);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function tabsRemove(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.remove(tabId, () => {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  function tabsDiscard(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.discard(tabId, () => {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  function tabsGet(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.get(tabId, (tab) => {
          const err = chrome.runtime.lastError;
          if (err) return resolve(null);
          resolve(tab || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function tabsQuery(queryInfo) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query(queryInfo, (tabs) => {
          const err = chrome.runtime.lastError;
          if (err) return resolve([]);
          resolve(Array.isArray(tabs) ? tabs : []);
        });
      } catch {
        resolve([]);
      }
    });
  }

  function tabsSendMessage(tabId, msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, msg, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function ensureTabClosed(tabId) {
    if (!Number.isFinite(tabId)) return;
    await tabsRemove(tabId);
    await sleep(200);
    const still = await tabsGet(tabId);
    if (still) {
      // Some renderer-leak cases correlate with a hung tab; discard can free memory even if remove fails.
      await tabsDiscard(tabId);
      await sleep(200);
      await tabsRemove(tabId);
    }
  }

  async function cleanupCreatedTabs() {
    const ids = Array.from(runner.createdTabIds || []);
    for (const id of ids) {
      try {
        await ensureTabClosed(id);
      } catch {}
    }
    try {
      runner.createdTabIds.clear();
    } catch {}
  }

  async function cleanupOrphanChatgptTabs(reason, keepTabId) {
    if (runner.orphanCleanupInFlight) return;
    runner.orphanCleanupInFlight = true;
    try {
      const query = { url: ['https://chatgpt.com/*', 'https://chat.openai.com/*'] };
      const chatTabs = await tabsQuery(query);
      const keep = Number.isFinite(keepTabId) ? keepTabId : Number.isFinite(runner.testTabId) ? runner.testTabId : null;
      // Guard: interval cleanup can run while we're *creating* the first test tab (testTabId still null).
      // In that window, closing "all chatgpt tabs" risks killing the newly created tab before we can record its id.
      if (String(reason || '') === 'interval' && !Number.isFinite(keep)) return;
      // Safety: never close user ChatGPT tabs. Only close tabs we created (tracked in createdTabIds).
      const created = new Set(Array.from(runner.createdTabIds || []));
      const toClose = chatTabs
        .map((t) => (t && Number.isFinite(t.id) ? t.id : null))
        .filter((id) => Number.isFinite(id) && created.has(id) && (!Number.isFinite(keep) || id !== keep));

      if (toClose.length) {
        writeLog(
          `[INFO] cleanup orphan ChatGPT tabs (${String(reason || 'unknown')}): closing ${toClose.length}${
            Number.isFinite(keep) ? ` keep=${keep}` : ''
          } ids=${JSON.stringify(toClose)}`
        );
        for (const id of toClose) await ensureTabClosed(id);
      }

      // Extra safety for resume/orphan-adoption: a previous controller may have died and lost `createdTabIds`,
      // leaving behind a memtest-instrumented ChatGPT tab. Close those if they are not the active keep tab.
      const candidates = chatTabs
        .map((t) => (t && Number.isFinite(t.id) ? t.id : null))
        .filter((id) => Number.isFinite(id) && (!Number.isFinite(keep) || id !== keep) && !created.has(id));
      if (candidates.length) {
        const orphanMemtest = [];
        for (const id of candidates) {
          let info = null;
          try {
            info = await execInTab(
              id,
              () => {
                const s = window.__qnMemtest;
                if (!s || typeof s !== 'object') return null;
                const cfg = s.cfg && typeof s.cfg === 'object' ? s.cfg : null;
                const tag = s.tag || s.__qnMemtestTag || null;
                const caseId = cfg && typeof cfg.caseId === 'string' ? cfg.caseId : null;
                return { hasMemtest: true, tag: tag ? String(tag) : null, caseId };
              },
              [],
              'MAIN',
              4000
            );
          } catch {
            info = null;
          }
          if (info && info.hasMemtest) orphanMemtest.push({ tabId: id, caseId: info.caseId, tag: info.tag });
        }

        if (orphanMemtest.length) {
          writeLog(
            `[WARN] cleanup orphan memtest tabs (${String(reason || 'unknown')}): closing ${orphanMemtest.length} tabs=${JSON.stringify(orphanMemtest)}`
          );
          for (const row of orphanMemtest) {
            try {
              await ensureTabClosed(row.tabId);
            } catch {}
          }
        }
      }
    } catch (e) {
      writeLog(`[WARN] cleanup orphan ChatGPT tabs failed (${String(reason || 'unknown')}): ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      runner.orphanCleanupInFlight = false;
    }
  }

  function startOrphanCleanupLoop() {
    try {
      if (runner.orphanCleanupTimer) return;
      runner.orphanCleanupTimer = setInterval(() => {
        if (!runner.running) return;
        void cleanupOrphanChatgptTabs('interval').catch(() => void 0);
      }, 12_000);
    } catch {}
  }

  function stopOrphanCleanupLoop() {
    try {
      if (runner.orphanCleanupTimer) clearInterval(runner.orphanCleanupTimer);
    } catch {}
    runner.orphanCleanupTimer = null;
  }

  function tabsReload(tabId, opts = { bypassCache: true }) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.reload(tabId, opts, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function tabsUpdate(tabId, updateProps) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.update(tabId, updateProps, (tab) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          resolve(tab);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function waitTabComplete(tabId, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const onUpdated = (id, info) => {
        try {
          if (id !== tabId) return;
          if (info.status === 'complete') cleanup(true);
        } catch {}
      };
      const onRemoved = (id) => {
        try {
          if (id !== tabId) return;
          cleanup(false, 'tab removed');
        } catch {}
      };
      const timer = setInterval(() => {
        if (Date.now() - t0 > timeoutMs) cleanup(false, 'timeout');
      }, 250);
      const cleanup = (ok, reason) => {
        try {
          chrome.tabs.onUpdated.removeListener(onUpdated);
        } catch {}
        try {
          chrome.tabs.onRemoved.removeListener(onRemoved);
        } catch {}
        try {
          clearInterval(timer);
        } catch {}
        if (!ok) reject(new Error(reason === 'tab removed' ? 'tab removed while waiting complete' : 'timeout waiting tab complete'));
        else resolve();
      };
      try {
        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.onRemoved.addListener(onRemoved);
      } catch (e) {
        clearInterval(timer);
        reject(e);
      }
    });
  }

  async function waitChatgptUiReady(tabId, timeoutMs = 180_000) {
    const started = Date.now();
    let activated = false;
    let last = null;
    let pendingCommitSince = 0;

    while (Date.now() - started < timeoutMs) {
      if (!activated && Date.now() - started > 15_000) {
        activated = true;
        try {
          await tabsUpdate(tabId, { active: true });
        } catch {}
      }

      // If navigation never commits (url stays null while pendingUrl is set), `executeScript` can hang.
      // Detect and fail fast so the runner can back off instead of burning long timeouts.
      try {
        const t = await tabsGet(tabId);
        if (!t) throw new Error(`tab closed while waiting ChatGPT UI (tabId=${tabId})`);
        const url = typeof t.url === 'string' ? t.url : '';
        const pendingUrl = typeof t.pendingUrl === 'string' ? t.pendingUrl : '';
        const status = typeof t.status === 'string' ? t.status : '';
        if (!url && pendingUrl) {
          if (!pendingCommitSince) pendingCommitSince = Date.now();
          if (Date.now() - pendingCommitSince > 25_000) {
            throw new Error(`timeout waiting ChatGPT navigation commit (pendingUrl=${pendingUrl} status=${status})`);
          }
        } else {
          pendingCommitSince = 0;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('tab closed while waiting ChatGPT UI')) throw e;
        if (msg.includes('timeout waiting ChatGPT navigation commit')) throw e;
      }

      try {
        last = await execInTab(
          tabId,
          () => {
            const href = String(location.href || '');
            const readyState = String(document.readyState || '');
            const title = String(document.title || '');
            const hasComposer = !!(
              document.querySelector('textarea[data-testid="prompt-textarea"]') ||
              document.querySelector('textarea#prompt-textarea') ||
              document.querySelector('div[contenteditable="true"]')
            );

            // Quick gate detection (best-effort; avoid expensive full-text scans).
            const loginLike =
              href.includes('/auth/') ||
              !!document.querySelector('form[action*="login"],a[href*="login"],button[data-testid*="login"]');

            const challengeLike =
              title.toLowerCase().includes('just a moment') ||
              href.includes('__cf_chl_') ||
              !!document.querySelector('#challenge-error-text') ||
              !!document.querySelector('script[src*="challenge-platform"]');

            return { href, readyState, title, hasComposer, loginLike, challengeLike };
          },
          [],
          'MAIN',
          25_000
        );
      } catch (e) {
        // If the tab was closed/crashed, fail fast; otherwise ignore transient injection failures while loading.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('No tab with id')) throw new Error(`tab closed while waiting ChatGPT UI (tabId=${tabId})`);
        const still = await tabsGet(tabId);
        if (!still) throw new Error(`tab closed while waiting ChatGPT UI (tabId=${tabId})`);
      }

      if (last && last.hasComposer) return last;
      if (last && last.loginLike) throw new Error(`ChatGPT login gate detected (href=${last.href || ''})`);
      if (last && last.challengeLike) throw new Error(`ChatGPT challenge gate detected (href=${last.href || ''} title=${last.title || ''})`);

      await sleep(1000);
    }

    throw new Error(`timeout waiting ChatGPT UI (last=${last ? JSON.stringify(last) : 'null'})`);
  }

  function getRegisteredContentScripts() {
    return new Promise((resolve) => {
      try {
        chrome.scripting.getRegisteredContentScripts((items) => {
          resolve({ items: items || [], err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null });
        });
      } catch (e) {
        resolve({ items: [], err: String(e) });
      }
    });
  }

  function execInTab(tabId, func, args = [], world = 'MAIN', timeoutMs = 12000) {
    const ms = Math.max(1000, Number(timeoutMs) || 0);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`timeout: execInTab(${ms}ms)`));
      }, ms);

      const finish = (fn) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      try {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            world,
            func,
            args,
          },
          (res) => {
            finish(() => {
              const err = chrome.runtime.lastError;
              if (err) return reject(new Error(err.message || String(err)));
              // res is an array of InjectionResult
              resolve(res && res[0] ? res[0].result : null);
            });
          }
        );
      } catch (e) {
        finish(() => reject(e));
      }
    });
  }

  async function getMenuCommands(tabId) {
    try {
      const resp = await withTimeout(tabsSendMessage(tabId, { type: 'QUICKNAV_GET_MENU' }), 5000, 'tabsSendMessage(GET_MENU)');
      if (!resp || resp.ok !== true) return null;
      const cmds = Array.isArray(resp.commands) ? resp.commands : [];
      return cmds
        .map((c) => ({
          id: typeof c?.id === 'string' ? c.id : '',
          name: typeof c?.name === 'string' ? c.name : '',
          group: typeof c?.group === 'string' ? c.group : '',
        }))
        .filter((c) => c.id && c.name);
    } catch {
      return null;
    }
  }

  async function runMenuCommandByName(tabId, name) {
    const want = String(name || '').trim();
    if (!want) return { ok: false, error: 'empty command name' };

    const cmds = await getMenuCommands(tabId);
    if (!cmds) return { ok: false, error: 'menu unavailable' };

    const cmd = cmds.find((c) => String(c.name || '').trim() === want) || null;
    if (!cmd || !cmd.id) return { ok: false, error: `command not found: ${want}` };

    try {
      const resp = await withTimeout(
        tabsSendMessage(tabId, { type: 'QUICKNAV_RUN_MENU', id: cmd.id }),
        15_000,
        `tabsSendMessage(RUN_MENU:${want})`
      );
      if (resp && typeof resp === 'object' && typeof resp.ok === 'boolean') return resp;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function maybeRunPostCaseMenuExercises(tabId, caseId, enabledModules, exerciseMode) {
    try {
      if (exerciseMode !== 'aggressive') return;
      // Only do heavier integration exercises in the full "all_on" stress case.
      if (String(caseId || '') !== 'all_on') return;

      const enabled = new Set(Array.isArray(enabledModules) ? enabledModules : []);
      if (!enabled.has('quicknav')) return;

      // Export conversation: only meaningful on /c/* with at least one turn.
      if (enabled.has('chatgpt_export_conversation')) {
        let probe = null;
        try {
          probe = await withTimeout(
            execInTab(
              tabId,
              () => ({
                path: String(location.pathname || ''),
                turns: document.querySelectorAll('article[data-testid^=\"conversation-turn-\"]').length,
              }),
              [],
              'MAIN',
              5000
            ),
            5000,
            'export_probe'
          );
        } catch {}

        const isConv = probe && typeof probe.path === 'string' && probe.path.startsWith('/c/');
        const turns = probe && Number.isFinite(probe.turns) ? probe.turns : 0;
        if (!isConv || turns <= 0) {
          writeLog(`[INFO] menu exercise: skip export (isConv=${!!isConv} turns=${turns})`);
        } else {
          const r = await runMenuCommandByName(tabId, '导出为 Markdown');
          if (r.ok === false) writeLog(`[WARN] menu exercise: export markdown failed: ${r.error || 'unknown'}`);
          else writeLog('[INFO] menu exercise: export markdown ok');
        }
      }
    } catch (e) {
      writeLog(`[WARN] menu exercise failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function getSettings() {
    const resp = await sendMessage({ type: 'QUICKNAV_GET_SETTINGS' });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to get settings');
    return resp.settings;
  }

  async function setSettings(settings) {
    // memtest deliberately opens fresh tabs per case; avoid injecting into the user's existing tabs.
    const resp = await sendMessage({ type: 'QUICKNAV_SET_SETTINGS', settings, noInject: true });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to save settings');
    return resp.settings;
  }

  async function patchSettings(patch) {
    const resp = await sendMessage({ type: 'QUICKNAV_PATCH_SETTINGS', patch, noInject: true });
    if (!resp || resp.ok !== true) throw new Error(resp?.error || 'Failed to patch settings');
    return resp.settings;
  }

  function readSelectedModuleIds() {
    const ids = [];
    for (const row of Array.from(modsEl.querySelectorAll('input[data-mod-id]'))) {
      if (!(row instanceof HTMLInputElement)) continue;
      if (!row.checked) continue;
      const id = String(row.getAttribute('data-mod-id') || '');
      if (id) ids.push(id);
    }
    return ids;
  }

  function renderModules() {
    modsEl.innerHTML = '';
    for (const id of chatgptModuleIds) {
      const def = moduleMeta(id);
      const name = typeof def?.name === 'string' ? def.name : id;
      const sub = typeof def?.sub === 'string' ? def.sub : '';

      const wrap = document.createElement('label');
      wrap.className = 'mod';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.setAttribute('data-mod-id', id);

      const text = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'modTitle';
      title.textContent = name;
      const subEl = document.createElement('div');
      subEl.className = 'modSub';
      subEl.textContent = `${id}${sub ? ` · ${sub}` : ''}`;
      text.appendChild(title);
      text.appendChild(subEl);

      wrap.appendChild(cb);
      wrap.appendChild(text);
      modsEl.appendChild(wrap);
    }
  }

  function buildChatgptOnlySettings(base, enabledModules) {
    const next = JSON.parse(JSON.stringify(base || {}));
    if (!next || typeof next !== 'object') return base;

    if (!next.enabled) next.enabled = true;
    if (!next.sites || typeof next.sites !== 'object') next.sites = {};
    if (!next.siteModules || typeof next.siteModules !== 'object') next.siteModules = {};
    if (!next.siteModules[SITE_ID] || typeof next.siteModules[SITE_ID] !== 'object') next.siteModules[SITE_ID] = {};

    // Keep other sites as-is; only manipulate ChatGPT modules here.
    const mods = next.siteModules[SITE_ID];
    for (const id of chatgptModuleIds) mods[id] = false;
    for (const id of enabledModules || []) {
      if (Object.prototype.hasOwnProperty.call(mods, id)) mods[id] = true;
    }
    return next;
  }

  function normalizeMatrixMode(raw) {
    const v = String(raw || '').trim();
    if (v === 'pairwise' || v === 'incremental' || v === 'exhaustive' || v === 'grouped_exhaustive') return v;
    if (v === 'grouped' || v === 'grouped-exhaustive' || v === 'groupedExhaustive') return 'grouped_exhaustive';
    if (v === 'combo' || v === 'combinations') return 'pairwise';
    return 'pairwise';
  }

  function getMatrixMode() {
    try {
      return normalizeMatrixMode(matrixModeEl?.value);
    } catch {
      return 'pairwise';
    }
  }

  function normalizeExerciseMode(raw) {
    const v = String(raw || '').trim();
    if (v === 'light' || v === 'aggressive' || v === 'none') return v;
    return 'light';
  }

  function getExerciseMode() {
    try {
      return normalizeExerciseMode(exerciseModeEl?.value);
    } catch {
      return 'light';
    }
  }

  function makeRng(seed) {
    let x = (Number(seed) >>> 0) || 0x12345678;
    return () => {
      // xorshift32
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x >>>= 0;
      x ^= x << 5;
      x >>>= 0;
      return x / 0x100000000;
    };
  }

  function splitBaseAndFactors(selected) {
    const all = Array.isArray(selected) ? selected.slice() : [];
    const base = [];
    let factors = all.slice();
    // In most real usage, QuickNav is always enabled. Treat it as a fixed base module to reduce the
    // search space and avoid "module depends on quicknav" false negatives in combination tests.
    if (factors.includes('quicknav')) {
      base.push('quicknav');
      factors = factors.filter((x) => x !== 'quicknav');
    }
    return { base, factors };
  }

  function buildCasesIncremental(selected) {
    const picked = Array.isArray(selected) ? selected.slice() : [];
    const { base, factors } = splitBaseAndFactors(picked);
    const cases = [];
    cases.push({ id: 'baseline_none', modules: [] });
    if (base.length) {
      cases.push({ id: base.length === 1 && base[0] === 'quicknav' ? 'quicknav_only' : 'base_only', modules: base.slice() });
    }
    for (const mid of factors) cases.push({ id: `base_plus_${mid}`, modules: [...base, mid] });
    return { cases, meta: { mode: 'incremental', base, factors } };
  }

  function buildCasesExhaustive(selected) {
    const picked = Array.isArray(selected) ? selected.slice() : [];
    const { base, factors } = splitBaseAndFactors(picked);
    const k = factors.length;
    // Exhaustive is exponential; keep it intentionally small.
    if (k > 8) {
      throw new Error(`exhaustive too large: factors=${k} (limit=8). Use only=... to narrow or use pairwise mode.`);
    }

    const cases = [];
    cases.push({ id: 'baseline_none', modules: [] });
    if (base.length) {
      cases.push({ id: base.length === 1 && base[0] === 'quicknav' ? 'quicknav_only' : 'base_only', modules: base.slice() });
    }

    const total = 1 << k;
    for (let mask = 1; mask < total; mask++) {
      const mods = base.slice();
      for (let i = 0; i < k; i++) {
        if (mask & (1 << i)) mods.push(factors[i]);
      }
      cases.push({ id: `exh_${mask.toString(16).padStart(Math.ceil(k / 4), '0')}`, modules: mods });
    }
    return { cases, meta: { mode: 'exhaustive', base, factors, totalCombos: total - 1 } };
  }

  function buildCasesGroupedExhaustive(selected, groupMaxFactors = 8) {
    const picked = Array.isArray(selected) ? selected.slice() : [];
    const { base, factors } = splitBaseAndFactors(picked);
    const maxK = Math.max(1, Math.min(8, Math.floor(Number(groupMaxFactors) || 8)));

    const groupCount = Math.max(1, Math.ceil((factors.length || 0) / maxK));
    const pad = Math.max(2, String(groupCount).length);

    const groups = [];
    let totalCases = 0;
    for (let gi = 0; gi < groupCount; gi++) {
      const groupFactors = factors.slice(gi * maxK, (gi + 1) * maxK);
      const k = groupFactors.length;
      const total = 1 << k;
      const totalCombos = Math.max(0, total - 1);
      const gid = `g${String(gi + 1).padStart(pad, '0')}`;

      const cases = [];
      cases.push({ id: `${gid}_baseline_none`, modules: [] });
      if (base.length) {
        const baseId = base.length === 1 && base[0] === 'quicknav' ? 'quicknav_only' : 'base_only';
        cases.push({ id: `${gid}_${baseId}`, modules: base.slice() });
      }

      for (let mask = 1; mask < total; mask++) {
        const mods = base.slice();
        for (let i = 0; i < k; i++) {
          if (mask & (1 << i)) mods.push(groupFactors[i]);
        }
        cases.push({ id: `${gid}_exh_${mask.toString(16).padStart(Math.ceil(k / 4), '0')}`, modules: mods });
      }

      totalCases += cases.length;
      groups.push({ id: gid, index: gi + 1, factors: groupFactors, totalCombos, cases });
    }

    return {
      groups,
      meta: {
        mode: 'grouped_exhaustive',
        base,
        factorsTotal: factors.length,
        groupMaxFactors: maxK,
        groupCount,
        totalCases,
        groups: groups.map((g) => ({
          id: g.id,
          index: g.index,
          k: g.factors.length,
          factors: g.factors.slice(),
          totalCombos: g.totalCombos,
          cases: g.cases.length,
        })),
      },
    };
  }

  function buildPairwiseCoveringVectors(k, seed) {
    const rng = makeRng(seed);
    const uncovered = new Set();
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        uncovered.add(`${i}|${j}|0|0`);
        uncovered.add(`${i}|${j}|0|1`);
        uncovered.add(`${i}|${j}|1|0`);
        uncovered.add(`${i}|${j}|1|1`);
      }
    }

    const coverVector = (vec) => {
      for (let i = 0; i < k; i++) {
        const ai = vec[i] ? 1 : 0;
        for (let j = i + 1; j < k; j++) {
          const bj = vec[j] ? 1 : 0;
          uncovered.delete(`${i}|${j}|${ai}|${bj}`);
        }
      }
    };

    const countCoverage = (vec) => {
      let c = 0;
      for (let i = 0; i < k; i++) {
        const ai = vec[i] ? 1 : 0;
        for (let j = i + 1; j < k; j++) {
          const bj = vec[j] ? 1 : 0;
          if (uncovered.has(`${i}|${j}|${ai}|${bj}`)) c += 1;
        }
      }
      return c;
    };

    const randVec = () => {
      const v = new Array(k);
      for (let i = 0; i < k; i++) v[i] = rng() < 0.5 ? 0 : 1;
      return v;
    };

    const hillclimb = (vec) => {
      let best = vec.slice();
      let bestScore = countCoverage(best);
      let improved = true;
      let iter = 0;
      const maxIter = Math.max(10, k * 12);
      while (improved && iter < maxIter) {
        improved = false;
        iter += 1;
        for (let p = 0; p < k; p++) {
          const cand = best.slice();
          cand[p] = cand[p] ? 0 : 1;
          const score = countCoverage(cand);
          if (score > bestScore) {
            best = cand;
            bestScore = score;
            improved = true;
          }
        }
      }
      return { vec: best, score: bestScore };
    };

    // Baseline (all-0) and all-on (all-1) are separate cases; mark them covered so the generator focuses on 01/10.
    coverVector(new Array(k).fill(0));
    coverVector(new Array(k).fill(1));

    const vectors = [];
    const seen = new Set();
    const addVec = (v) => {
      const key = v.join('');
      if (seen.has(key)) return false;
      const score = countCoverage(v);
      if (score <= 0) return false;
      seen.add(key);
      vectors.push(v);
      coverVector(v);
      return true;
    };

    // Deterministic seeds that usually cover a lot of 01/10 pairs.
    addVec(Array.from({ length: k }, (_, i) => (i % 2 ? 1 : 0)));
    addVec(Array.from({ length: k }, (_, i) => (i % 2 ? 0 : 1)));

    let guard = 0;
    const maxVectors = 64;
    const triesPerVector = 48;
    while (uncovered.size && guard < maxVectors) {
      guard += 1;
      let best = null;
      let bestScore = -1;
      for (let t = 0; t < triesPerVector; t++) {
        const v0 = randVec();
        const { vec, score } = hillclimb(v0);
        const key = vec.join('');
        if (seen.has(key)) continue;
        if (score > bestScore) {
          best = vec;
          bestScore = score;
        }
      }
      if (!best || bestScore <= 0) break;
      addVec(best);
    }

    return { vectors, uncoveredLeft: uncovered.size };
  }

  function buildCasesPairwise(selected) {
    const picked = Array.isArray(selected) ? selected.slice() : [];
    const { base, factors } = splitBaseAndFactors(picked);
    const cases = [];

    cases.push({ id: 'baseline_none', modules: [] });
    if (base.length) {
      cases.push({ id: base.length === 1 && base[0] === 'quicknav' ? 'quicknav_only' : 'base_only', modules: base.slice() });
    }
    if (!factors.length) return { cases, meta: { mode: 'pairwise', base, factors, seed: runner.seed || null, vectors: 0, uncoveredLeft: 0 } };

    if (runner.seed == null) runner.seed = Date.now();
    const seed = runner.seed;
    const { vectors, uncoveredLeft } = buildPairwiseCoveringVectors(factors.length, seed);

    // "All-on" stress case (base + all selected factors).
    cases.push({ id: 'all_on', modules: [...base, ...factors] });

    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i];
      const mods = base.slice();
      for (let j = 0; j < vec.length; j++) {
        if (vec[j]) mods.push(factors[j]);
      }
      cases.push({ id: `pairwise_${String(i + 1).padStart(2, '0')}`, modules: mods });
    }

    return { cases, meta: { mode: 'pairwise', base, factors, seed, vectors: vectors.length, uncoveredLeft } };
  }

  function computeSummary(samples) {
    const s = Array.isArray(samples) ? samples : [];
    let maxHeap = 0;
    let maxDom = 0;
    let maxIframes = 0;
    let last = null;
    for (const row of s) {
      if (!row || typeof row !== 'object') continue;
      const heapMb = Number(row.heapMb) || 0;
      const dom = Number(row.domNodes) || 0;
      const ifr = Number(row.iframes) || 0;
      if (heapMb > maxHeap) maxHeap = heapMb;
      if (dom > maxDom) maxDom = dom;
      if (ifr > maxIframes) maxIframes = ifr;
      last = row;
    }
    const first = s[0] || null;
    const durSec = first && last ? Math.max(0, (Number(last.tMs) - Number(first.tMs)) / 1000) : 0;
    const heapDelta = first && last ? (Number(last.heapMb) || 0) - (Number(first.heapMb) || 0) : 0;
    const heapSlope = durSec > 0 ? heapDelta / durSec : 0;
    return { count: s.length, maxHeap, maxDom, maxIframes, durSec: Math.round(durSec), heapDelta, heapSlope };
  }

  function isTimeoutError(err, label) {
    const msg = err instanceof Error ? err.message : String(err || '');
    return msg === `timeout: ${String(label || '')}`;
  }

  async function captureHangEvidence(tabId, phase, timeoutError) {
    const ev = {
      at: new Date().toISOString(),
      phase: String(phase || ''),
      timeoutError: timeoutError ? String(timeoutError) : null,
      tab: null,
      probe: null,
      probeError: null,
    };

    try {
      const tab = await tabsGet(tabId);
      if (tab) {
        ev.tab = {
          id: tab.id,
          url: tab.url || tab.pendingUrl || null,
          title: tab.title || null,
        };
      }
    } catch {}

    try {
      ev.probe = await withTimeout(
        execInTab(tabId, () => {
          const mem = performance && performance.memory ? performance.memory : null;
          const heapMb = mem && mem.usedJSHeapSize ? Math.round(mem.usedJSHeapSize / 1048576) : null;
          const domNodes = document.getElementsByTagName('*').length;
          const iframes = document.getElementsByTagName('iframe').length;
          const s = window.__qnMemtest;
          const lastSample =
            s && typeof s === 'object' && Array.isArray(s.samples) && s.samples.length ? s.samples[s.samples.length - 1] : null;
          return {
            href: String(location.href || ''),
            title: String(document.title || ''),
            readyState: String(document.readyState || ''),
            heapMb,
            domNodes,
            iframes,
            memtest: s
              ? {
                  sent: Number(s.sent) || 0,
                  stoppedAt: Number(s.stoppedAt) || 0,
                  stopReason: String(s.stopReason || ''),
                  samples: Array.isArray(s.samples) ? s.samples.length : 0,
                  errors: Array.isArray(s.errors) ? s.errors.length : 0,
                  lastSample,
                }
              : null,
          };
        }),
        3000,
        `execInTab(hang_evidence:${String(phase || '')})`
      );
    } catch (e) {
      ev.probeError = e instanceof Error ? e.message : String(e);
    }

    return ev;
  }

  async function runSingleCase(caseId, enabledModules, opts) {
    const caseMinutes = Math.max(1, Math.min(120, Number(caseMinutesEl.value) || 20));
    const durationMs = Math.round(caseMinutes * 60 * 1000);
    const messagesPerCase = Math.max(0, Math.min(50, Number(messagesPerCaseEl.value) || 0));
    const sampleMs = Math.round(Math.max(1, Math.min(60, Number(sampleSecondsEl.value) || 3)) * 1000);
    const heapAbortMb = Math.max(128, Math.min(8192, Number(heapAbortMbEl.value) || 1400));
    const promptTemplate = String(promptTemplateEl.value || '').trim();
    const exerciseMode = getExerciseMode();

    writeLog(`CASE ${caseId} start: modules=${JSON.stringify(enabledModules)}`);

    const startedAt = Date.now();
    const rec = {
      caseId,
      modules: Array.isArray(enabledModules) ? enabledModules.slice() : [],
      startedAt: new Date(startedAt).toISOString(),
      endedAt: null,
      stopReason: '',
      sent: 0,
      summary: null,
      samplesTail: [],
      errorsTail: [],
      evidence: [],
      group: opts && typeof opts === 'object' && opts.group ? opts.group : null,
      error: null,
    };
    runner.currentRec = rec;

    let tabId = null;
    try {
      throwIfAborted();

      const nextSettings = buildChatgptOnlySettings(runner.backupSettings, enabledModules);
      await withTimeout(setSettings(nextSettings), 15_000, 'setSettings');

      throwIfAborted();

      // Keep strict single-concurrency: if prior runs (or buggy features) left extra ChatGPT tabs behind,
      // close them before creating a new test tab. (Scope is the controller window when known.)
      await cleanupOrphanChatgptTabs('before_case', null);

      const reg = await withTimeout(getRegisteredContentScripts(), 10_000, 'getRegisteredContentScripts');
      if (reg.err) writeLog(`CASE ${caseId} warn: getRegisteredContentScripts error: ${reg.err}`);
      const chatgptAllFrames = (reg.items || [])
        .filter((s) => s && s.allFrames && Array.isArray(s.matches) && s.matches.some((m) => String(m).includes('chatgpt.com')))
        .map((s) => s.id)
        .sort();
      if (chatgptAllFrames.length) {
        writeLog(`CASE ${caseId} info: registered chatgpt allFrames scripts: ${chatgptAllFrames.join(', ')}`);
      }

      throwIfAborted();

      // Important for reliability: ChatGPT often deprioritizes background tabs. Create as active so UI
      // becomes ready quickly, and keep it active while the in-page runner is executing.
      const tab = await withTimeout(tabsCreate({ url: CHATGPT_URL, active: true }), 15_000, 'tabsCreate');
      tabId = tab?.id;
      if (!Number.isFinite(tabId)) throw new Error('failed to create tab');
      runner.testTabId = tabId;
      broadcastMemtestStatus({ event: 'test_tab_created', caseId, modules: Array.isArray(enabledModules) ? enabledModules.slice() : [] });
      try {
        runner.createdTabIds.add(tabId);
      } catch {}

      // If any code opened extra ChatGPT tabs (or a previous controller is still around),
      // close them immediately to prevent memory stacking and test distortion.
      await cleanupOrphanChatgptTabs('after_create', tabId);

      // ChatGPT is an SPA and may not reliably reach `tabs.onUpdated(status=complete)` quickly (or ever).
      // Prefer a UI-ready probe (composer present) with a generous timeout.
      await withTimeout(waitChatgptUiReady(tabId, 3 * 60_000), 3 * 60_000 + 5_000, 'waitChatgptUiReady');
      await sleep(800);

      throwIfAborted();

      // Note: do NOT switch focus back to the controller here.
      // Background-tab timer throttling can cause the in-page runner to miss deadlines and produce false hangs.

      // Start in-page runner (MAIN world so it can see main-world objects if needed)
      const treeMode = String(treeOpenModeEl.value || 'open_once');
      const caseOptions = {
        caseId,
        enabledModules,
        durationMs,
        messagesPerCase,
        sampleMs,
        heapAbortMb,
        promptTemplate,
        treeMode,
        exerciseMode,
        // Use conservative timeouts to avoid stuck runs. Decouple this from `durationMs` so a long case
        // doesn't imply we should wait minutes for a single reply.
        maxWaitPerMessageMs: (() => {
          const ov = runner.maxWaitPerMessageMsOverride;
          if (Number.isFinite(ov) && ov > 0) return ov;
          const third = Math.round(durationMs * 0.33);
          return Math.min(60_000, Math.max(45_000, third));
        })(),
      };

      await withTimeout(
        execInTab(
          tabId,
          (cfg) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const now = () => Date.now();

        const pickVisible = (els) => {
          for (const el of Array.from(els || [])) {
            if (!(el instanceof HTMLElement)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
            return el;
          }
          return null;
        };

        const isGenerating = () => {
          try {
            return !!(
              document.querySelector('button[data-testid=\"stop-button\"]') ||
              document.querySelector('button[aria-label*=\"Stop\"]') ||
              document.querySelector('[data-testid=\"stop-button\"]')
            );
          } catch {
            return false;
          }
        };

        const getComposer = () => {
          // Prefer common ChatGPT selectors; fall back carefully.
          const ta =
            document.querySelector('textarea[data-testid=\"prompt-textarea\"]') ||
            document.querySelector('textarea#prompt-textarea') ||
            pickVisible(document.querySelectorAll('textarea'));
          if (ta instanceof HTMLTextAreaElement) return { kind: 'textarea', el: ta };

          const ce = pickVisible(document.querySelectorAll('div[contenteditable=\"true\"]'));
          if (ce instanceof HTMLElement) return { kind: 'contenteditable', el: ce };

          return null;
        };

        const setComposerText = (composer, text) => {
          if (!composer) return false;
          const el = composer.el;
          try {
            el.focus?.();
          } catch {}

          if (composer.kind === 'textarea' && el instanceof HTMLTextAreaElement) {
            el.value = text;
            try {
              el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true, data: text }));
            } catch {
              el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            }
            return true;
          }

          if (composer.kind === 'contenteditable' && el instanceof HTMLElement) {
            try {
              // Clear
              el.textContent = '';
            } catch {}
            try {
              // Insert text
              el.textContent = text;
            } catch {}
            try {
              el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true, data: text }));
            } catch {
              el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            }
            return true;
          }

          return false;
        };

        const clickSend = (composer) => {
          if (!composer) return false;
          const el = composer.el;
          const form = el && el.closest ? el.closest('form') : null;

          // 1) Prefer the form submit path if available (more resilient to UI changes).
          try {
            if (form && typeof form.requestSubmit === 'function') {
              form.requestSubmit();
              return true;
            }
          } catch {}

          // 2) Click a "send-ish" button (form-scoped first; then fallback to global).
          const isSendish = (btn) => {
            try {
              if (!(btn instanceof HTMLElement)) return false;
              if (btn instanceof HTMLButtonElement && btn.disabled) return false;
              const dt = String(btn.getAttribute('data-testid') || '');
              if (dt && dt.toLowerCase().includes('send')) return true;
              const type = String(btn.getAttribute('type') || '');
              if (type === 'submit') return true;
              const aria = String(btn.getAttribute('aria-label') || '');
              // UI language can vary; include a few common substrings.
              if (/send/i.test(aria) || aria.includes('发送') || aria.includes('提交')) return true;
              return false;
            } catch {
              return false;
            }
          };

          try {
            const scoped = [];
            if (form && form.querySelectorAll) scoped.push(...form.querySelectorAll('button'));
            const btn = pickVisible(scoped.filter(isSendish));
            if (btn) {
              btn.click();
              return true;
            }
          } catch {}

          try {
            const global = Array.from(document.querySelectorAll('button'));
            const btn = pickVisible(global.filter(isSendish));
            if (btn) {
              btn.click();
              return true;
            }
          } catch {}

          // 3) Fallback: press Enter in the composer.
          try {
            const init = { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true };
            el.dispatchEvent(new KeyboardEvent('keydown', init));
            el.dispatchEvent(new KeyboardEvent('keypress', init));
            el.dispatchEvent(new KeyboardEvent('keyup', init));
            return true;
          } catch {}

          return false;
        };

        const getTurnCount = () => {
          try {
            const n = document.querySelectorAll('article[data-testid^="conversation-turn-"]').length;
            if (Number.isFinite(n) && n > 0) return n;
          } catch {}
          try {
            const n = document.querySelectorAll('[data-message-id]').length;
            if (Number.isFinite(n) && n > 0) return n;
          } catch {}
          return 0;
        };

        const waitForSendAck = async (composer, before) => {
          const timeoutMs = Math.max(4000, Number(before?.timeoutMs) || 30_000);
          const start = now();
          while (now() - start < timeoutMs) {
            if (isGenerating()) return true;
            try {
              const href = String(location.href || '');
              if (before?.href && href && href !== before.href) return true;
              // After the first send, ChatGPT usually navigates from `/` to `/c/<id>`.
              if (!before?.isConv && String(location.pathname || '').startsWith('/c/')) return true;
            } catch {}
            try {
              const turns = getTurnCount();
              if (Number.isFinite(before?.turns) && turns > before.turns) return true;
            } catch {}
            try {
              const el = composer?.el;
              if (composer?.kind === 'textarea' && el instanceof HTMLTextAreaElement) {
                if (!String(el.value || '')) return true;
              }
              if (composer?.kind === 'contenteditable' && el instanceof HTMLElement) {
                if (!String(el.textContent || '').trim()) return true;
              }
            } catch {}
            await sleep(200);
          }
          return false;
        };

        const maybeOpenTree = async (mode) => {
          if (mode === 'never') return;
          const toggle = document.getElementById('__aichat_chatgpt_message_tree_toggle_v1__');
          if (!(toggle instanceof HTMLElement)) return;
          toggle.click();
          await sleep(800);
          if (mode === 'open_once') toggle.click();
        };

        const startAt = now();
        const state = {
          cfg,
          startedAt: startAt,
          stoppedAt: 0,
          stopReason: '',
          tag: 'quicknav_memtest_v1',
          sent: 0,
          samples: [],
          errors: [],
          timers: { sample: 0 },
          stop() {
            if (state.stoppedAt) return;
            state.stoppedAt = now();
            state.stopReason = state.stopReason || 'stop';
            try {
              if (state.timers.sample) clearInterval(state.timers.sample);
            } catch {}
          },
        };

        try {
          // Reset any previous run
          if (window.__qnMemtest && typeof window.__qnMemtest.stop === 'function') window.__qnMemtest.stop();
        } catch {}
        try {
          window.__qnMemtest = state;
        } catch {}

        const sampleOnce = () => {
          try {
            const mem = performance && performance.memory ? performance.memory : null;
            const heapMb = mem && mem.usedJSHeapSize ? Math.round(mem.usedJSHeapSize / 1048576) : null;
            const domNodes = document.getElementsByTagName('*').length;
            const iframes = document.getElementsByTagName('iframe').length;
            state.samples.push({ tMs: now() - startAt, heapMb, domNodes, iframes, generating: isGenerating() });
            if (heapMb != null && heapMb >= Number(cfg.heapAbortMb || 1e9)) {
              state.stopReason = `heap_abort_mb:${heapMb}`;
              state.stop();
            }
          } catch (e) {
            state.errors.push({ atMs: now() - startAt, type: 'sample', err: String(e) });
          }
        };

        state.timers.sample = setInterval(sampleOnce, Math.max(250, Number(cfg.sampleMs) || 1000));
        sampleOnce();

        (async () => {
          try {
            // Give the UI a moment to settle after load.
            await sleep(1200);

            const exerciseMode = String(cfg.exerciseMode || 'light');
            const enabled = Array.isArray(cfg.enabledModules) ? cfg.enabledModules : [];

            const clickTextBtn = (txt) => {
              try {
                const want = String(txt || '').trim();
                if (!want) return false;
                const btns = Array.from(document.querySelectorAll('button'));
                for (const b of btns) {
                  if (!(b instanceof HTMLElement)) continue;
                  const t = String(b.textContent || '').trim();
                  if (t !== want) continue;
                  const rect = b.getBoundingClientRect();
                  if (rect.width < 10 || rect.height < 10) continue;
                  b.click();
                  return true;
                }
              } catch {}
              return false;
            };

            const dispatchKey = (init) => {
              try {
                const ev1 = new KeyboardEvent('keydown', init);
                const ev2 = new KeyboardEvent('keyup', init);
                document.dispatchEvent(ev1);
                document.dispatchEvent(ev2);
                return true;
              } catch {
                return false;
              }
            };

            const clickStopGenerating = () => {
              try {
                const candidates = Array.from(
                  document.querySelectorAll(
                    'button[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="停止"],button[aria-label*="停"]'
                  )
                );
                const btn = pickVisible(candidates);
                if (!(btn instanceof HTMLElement)) return false;
                btn.click();
                return true;
              } catch {
                return false;
              }
            };

            const exerciseOnce = async (phase) => {
              if (exerciseMode === 'none') return;
              const isAfterMsg = String(phase || '').startsWith('after_msg_');
              try {
                // QuickNav: click a few lightweight controls if present.
                if (enabled.includes('quicknav')) {
                  clickTextBtn('🔐'); // lock/unlock autoscroll
                  await sleep(120);
                  clickTextBtn('⤓'); // bottom
                  await sleep(120);
                  clickTextBtn('↑'); // prev
                  await sleep(120);
                  clickTextBtn('↓'); // next
                  await sleep(120);
                  clickTextBtn('⤒'); // top
                }

                // Tree: only do at startup to avoid flapping open/close every message.
                if (!isAfterMsg) {
                  if (enabled.includes('chatgpt_message_tree')) await maybeOpenTree(String(cfg.treeMode || 'open_once'));

                  // Thinking toggle hotkeys (Cmd+O / Cmd+J). Synthetic events are best-effort.
                  if (enabled.includes('chatgpt_thinking_toggle')) {
                    dispatchKey({ key: 'o', code: 'KeyO', metaKey: true, bubbles: true, cancelable: true });
                    await sleep(120);
                    dispatchKey({ key: 'j', code: 'KeyJ', metaKey: true, bubbles: true, cancelable: true });
                    await sleep(120);
                    dispatchKey({ key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
                  }

                  // Image message fork-edit: click our green pencil then cancel the banner.
                  if (enabled.includes('chatgpt_image_message_edit')) {
                    try {
                      const editBtn = pickVisible(document.querySelectorAll('button[data-aichat-img-edit=\"1\"]'));
                      if (editBtn) {
                        editBtn.click();
                        await sleep(320);
                        const cancel = document.querySelector('#aichat-img-edit-banner button.cancel');
                        if (cancel instanceof HTMLElement) cancel.click();
                      }
                    } catch {}
                  }

                  // Read-aloud speed controller: try to start read-aloud once, then pause audio.
                  if (enabled.includes('chatgpt_readaloud_speed_controller')) {
                    try {
                      const candidates = Array.from(
                        document.querySelectorAll('button[aria-label*=\"Read aloud\"],button[aria-label*=\"朗读\"]')
                      );
                      const btn = pickVisible(candidates);
                      if (btn) {
                        btn.click();
                        await sleep(900);
                        const audio = document.querySelector('audio');
                        if (audio instanceof HTMLAudioElement) {
                          try {
                            audio.pause();
                          } catch {}
                        }
                      }
                    } catch {}
                  }
                }

                if (exerciseMode === 'aggressive') {
                  try {
                    window.scrollTo(0, document.body.scrollHeight);
                    await sleep(200);
                    window.scrollTo(0, 0);
                  } catch {}
                  // Best-effort: trigger Quick Deep Search hotkeys (synthetic events may be ignored by isTrusted checks).
                  if (enabled.includes('chatgpt_quick_deep_search')) {
                    dispatchKey({ key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true });
                    await sleep(100);
                    dispatchKey({ key: 't', code: 'KeyT', ctrlKey: true, bubbles: true, cancelable: true });
                  }
                }
              } catch (e) {
                state.errors.push({ atMs: now() - startAt, type: 'exercise', err: `${phase || 'exercise'}: ${String(e)}` });
              }
            };

            // Optional one-off feature exercise (startup)
            await exerciseOnce('startup');

            // Main loop
            const endAt = startAt + Math.max(5000, Number(cfg.durationMs) || 0);
            const maxWaitPerMessageMs = Math.max(10_000, Number(cfg.maxWaitPerMessageMs) || 120_000);
            const want = Math.max(0, Number(cfg.messagesPerCase) || 0);

            const ensureNotGenerating = async (phase, timeoutMs) => {
              try {
                if (!isGenerating()) return true;
              } catch {}

              const waitMs = Math.max(2000, Number(timeoutMs) || 0);
              const t0 = now();
              while (!state.stoppedAt && isGenerating() && now() - t0 < waitMs) {
                await sleep(600);
              }
              if (!isGenerating()) return true;

              // Best-effort: stop generation, then re-check.
              const clicked = clickStopGenerating();
              if (clicked) await sleep(900);

              const t1 = now();
              while (!state.stoppedAt && isGenerating() && now() - t1 < 15_000) {
                await sleep(600);
              }
              if (!isGenerating()) return true;

              state.errors.push({ atMs: now() - startAt, type: 'hang', err: `stuck generating (${String(phase || 'unknown')})` });
              state.stopReason = `stuck_generating:${String(phase || 'unknown')}`;
              state.stop();
              return false;
            };

            while (!state.stoppedAt && now() < endAt) {
              // Send up to `messagesPerCase`, but keep the test running (sampling) until `durationMs` ends.
              if (want > 0 && state.sent < want) {
                // Critical: never attempt sending while ChatGPT is already generating.
                // Otherwise we can get false-positive acks and distort the case (or pile up pending sends).
                const okIdleBefore = await ensureNotGenerating('before_send', maxWaitPerMessageMs);
                if (!okIdleBefore) break;

                const idx = state.sent + 1;
                const text = `${cfg.promptTemplate || ''}\\n\\n[MEMTEST_CASE=${cfg.caseId}] [MSG=${idx}]`;
                const composer = getComposer();
                const okSet = setComposerText(composer, text);
                if (!okSet) {
                  state.errors.push({ atMs: now() - startAt, type: 'composer', err: 'composer not found' });
                  await sleep(1500);
                  continue;
                }
                const before = (() => {
                  try {
                    return {
                      href: String(location.href || ''),
                      isConv: String(location.pathname || '').startsWith('/c/'),
                      turns: getTurnCount(),
                      timeoutMs: 30_000
                    };
                  } catch {
                    return { href: '', isConv: false, turns: 0, timeoutMs: 30_000 };
                  }
                })();

                // Try Cmd+Enter once (first message) to exercise the cmdenter module.
                let usedHotkeySend = false;
                let okSendAction = false;
                if (enabled.includes('chatgpt_cmdenter_send') && idx === 1) {
                  try {
                    const el = composer?.el;
                    if (el) {
                      usedHotkeySend = true;
                      const init = { key: 'Enter', code: 'Enter', metaKey: true, bubbles: true, cancelable: true };
                      el.dispatchEvent(new KeyboardEvent('keydown', init));
                      el.dispatchEvent(new KeyboardEvent('keypress', init));
                      el.dispatchEvent(new KeyboardEvent('keyup', init));
                      okSendAction = true;
                    }
                  } catch {}
                  await sleep(120);
                }

                if (!okSendAction) okSendAction = clickSend(composer);
                if (!okSendAction) {
                  state.errors.push({ atMs: now() - startAt, type: 'send', err: 'send action failed' });
                  await sleep(1500);
                  continue;
                }

                let ack = false;
                if (usedHotkeySend) {
                  // Hotkey send is best-effort: confirm quickly, then fall back to clicking send.
                  ack = await waitForSendAck(composer, { ...before, timeoutMs: 6000 });
                  if (!ack) {
                    try {
                      state.errors.push({ atMs: now() - startAt, type: 'send', err: 'hotkey send not acknowledged; falling back to clickSend' });
                    } catch {}
                    const okFallback = clickSend(composer);
                    if (okFallback) ack = await waitForSendAck(composer, before);
                  }
                } else {
                  ack = await waitForSendAck(composer, before);
                }
                if (!ack) {
                  state.errors.push({ atMs: now() - startAt, type: 'send', err: 'send not acknowledged (no generating / no clear)' });
                  await sleep(1500);
                  continue;
                }
                state.sent += 1;

                // Wait for generation to finish (best-effort)
                const waitStart = now();
                while (!state.stoppedAt && isGenerating() && now() - waitStart < maxWaitPerMessageMs) {
                  await sleep(600);
                }
                if (isGenerating()) {
                  // If it's still generating after a full wait window, treat it as hang and stop the case.
                  const okIdleAfter = await ensureNotGenerating('after_send_wait', 2000);
                  if (!okIdleAfter) break;
                }
                // After each message, do a tiny exercise pass (can help trigger leaks caused by repeated UI ops).
                await exerciseOnce(`after_msg_${idx}`);
                // Small idle pause between messages/samples
                await sleep(1200);
                continue;
              }

              // No more messages to send: idle while sampling continues.
              await sleep(1500);
            }
          } catch (e) {
            state.errors.push({ atMs: now() - startAt, type: 'runner', err: String(e) });
          } finally {
            if (!state.stoppedAt) state.stopReason = state.stopReason || 'done';
            state.stop();
          }
        })();
      },
      [caseOptions],
      'MAIN',
      60_000
        ),
        35_000,
        'execInTab(start runner)'
      );

      // Poll until done or aborted
      const pollSlackMs = Math.max(2 * 60 * 1000, Math.max(0, Number(caseOptions.maxWaitPerMessageMs) || 0) + 30_000);
      const pollDeadline = Date.now() + durationMs + pollSlackMs;
      while (!runner.abort && Date.now() < pollDeadline) {
        if (!runner.testTabId) break;
        let st = null;
        try {
          st = await withTimeout(
            execInTab(tabId, () => {
              const s = window.__qnMemtest;
              if (!s || typeof s !== 'object') return null;
              return { stoppedAt: Number(s.stoppedAt) || 0, stopReason: String(s.stopReason || ''), sent: Number(s.sent) || 0 };
            }, [], 'MAIN', 60_000),
            20_000,
            'execInTab(poll)'
          );
        } catch (e) {
          if (isTimeoutError(e, 'execInTab(poll)')) {
            const msg = e instanceof Error ? e.message : String(e);
            rec.stopReason = rec.stopReason || 'poll_timeout';
            try {
              const ev = await captureHangEvidence(tabId, 'poll', msg);
              rec.evidence.push(ev);
              writeLog(`CASE ${caseId} hang: poll timeout; tabTitle=${ev?.tab?.title || 'unknown'}`);
            } catch {}
          }
          throw e;
        }

        if (st && st.stoppedAt) break;
        await sleep(1200);
      }

      // If we hit the poll deadline and the tab runner still hasn't stopped, force-stop it so
      // we don't end up with `stop=unknown` and a silently running tab.
      if (!runner.abort && runner.testTabId && Date.now() >= pollDeadline) {
        rec.stopReason = rec.stopReason || 'poll_deadline';
        try {
          const ev = await captureHangEvidence(tabId, 'poll_deadline', 'deadline reached');
          rec.evidence.push(ev);
          writeLog(`CASE ${caseId} hang: poll deadline reached; tabTitle=${ev?.tab?.title || 'unknown'}`);
        } catch {}
        try {
          await execInTab(
            tabId,
            (reason) => {
              try {
                const s = window.__qnMemtest;
                if (s && typeof s === 'object' && typeof s.stop === 'function') {
                  s.stopReason = String(reason || 'poll_deadline');
                  s.stop();
                }
              } catch {}
            },
            ['poll_deadline'],
            'MAIN',
            8000
          );
        } catch {}
        await sleep(800);
      }

      let result = null;
      try {
        result = await withTimeout(
          execInTab(tabId, () => {
            const s = window.__qnMemtest;
            if (!s || typeof s !== 'object') return null;

            const samples = Array.isArray(s.samples) ? s.samples : [];
            let maxHeap = 0;
            let maxDom = 0;
            let maxIframes = 0;
            let last = null;
            for (const row of samples) {
              if (!row || typeof row !== 'object') continue;
              const heapMb = Number(row.heapMb) || 0;
              const dom = Number(row.domNodes) || 0;
              const ifr = Number(row.iframes) || 0;
              if (heapMb > maxHeap) maxHeap = heapMb;
              if (dom > maxDom) maxDom = dom;
              if (ifr > maxIframes) maxIframes = ifr;
              last = row;
            }
            const first = samples[0] || null;
            const durSec = first && last ? Math.max(0, (Number(last.tMs) - Number(first.tMs)) / 1000) : 0;
            const heapDelta = first && last ? (Number(last.heapMb) || 0) - (Number(first.heapMb) || 0) : 0;
            const heapSlope = durSec > 0 ? heapDelta / durSec : 0;
            const summary = { count: samples.length, maxHeap, maxDom, maxIframes, durSec: Math.round(durSec), heapDelta, heapSlope };

            return {
              stoppedAt: Number(s.stoppedAt) || 0,
              stopReason: String(s.stopReason || ''),
              sent: Number(s.sent) || 0,
              summary,
              samplesTail: samples.slice(-90),
              errorsTail: (Array.isArray(s.errors) ? s.errors : []).slice(-12),
            };
          }, [], 'MAIN', 60_000),
          25_000,
          'execInTab(collect)'
        );
      } catch (e) {
        if (isTimeoutError(e, 'execInTab(collect)')) {
          const msg = e instanceof Error ? e.message : String(e);
          rec.stopReason = rec.stopReason || 'collect_timeout';
          try {
            const ev = await captureHangEvidence(tabId, 'collect', msg);
            rec.evidence.push(ev);
            writeLog(`CASE ${caseId} hang: collect timeout; tabTitle=${ev?.tab?.title || 'unknown'}`);
          } catch {}
        }
        throw e;
      }

      rec.stopReason = String(result?.stopReason || rec.stopReason || '');
      rec.sent = Number(result?.sent) || 0;
      rec.summary = result?.summary || null;
      rec.samplesTail = Array.isArray(result?.samplesTail) ? result.samplesTail : [];
      rec.errorsTail = Array.isArray(result?.errorsTail) ? result.errorsTail : [];

      const summary = rec.summary || computeSummary([]);
      writeLog(
        `CASE ${caseId} end: stop=${rec.stopReason || 'unknown'} sent=${rec.sent || 0} samples=${summary.count} maxHeapMB=${summary.maxHeap} heapΔ=${summary.heapDelta}MB slope=${summary.heapSlope.toFixed(
          4
        )}MB/s maxDom=${summary.maxDom} maxIframes=${summary.maxIframes}`
      );
      if (rec.errorsTail.length) writeLog(`CASE ${caseId} errors: ${JSON.stringify(rec.errorsTail)}`);
    } catch (e) {
      rec.error = e instanceof Error ? e.message : String(e);
      writeLog(`CASE ${caseId} error: ${rec.error}`);
    } finally {
      try {
        if (Number.isFinite(tabId)) await maybeRunPostCaseMenuExercises(tabId, caseId, enabledModules, exerciseMode);
      } catch {}
      try {
        if (Number.isFinite(tabId)) await ensureTabClosed(tabId);
      } catch {}
      runner.testTabId = null;
      broadcastMemtestStatus({ event: 'test_tab_closed', caseId, modules: Array.isArray(enabledModules) ? enabledModules.slice() : [] });
      try {
        await cleanupOrphanChatgptTabs('after_case', null);
      } catch {}
      rec.endedAt = new Date().toISOString();
      runner.results.push(rec);
      try {
        const n = runner.results.length;
        await persistPartialReport(`case_${String(n).padStart(3, '0')}`);
        // Checkpoint to Downloads periodically to survive full-Chrome/OS crashes.
        if (runner.autoSave && n > 0 && n % 5 === 0) {
          // Best-effort: bring the controller back to front so the download is not blocked.
          try {
            const ctlId = runner.controllerTabId;
            if (Number.isFinite(ctlId)) await tabsUpdate(ctlId, { active: true });
          } catch {}
          saveReport(`checkpoint_${String(n).padStart(3, '0')}`);
        }
      } catch {}
      try {
        const msg = String(rec.error || rec.stopReason || '');
        if (
          msg.includes('waitChatgptUiReady') ||
          msg.includes('timeout waiting ChatGPT UI') ||
          msg.includes('timeout waiting ChatGPT navigation commit') ||
          msg.includes('challenge gate') ||
          msg.includes('login gate') ||
          msg.includes('execInTab(')
        ) {
          runner.consecutiveUiReadyFailures = Math.min(50, (Number(runner.consecutiveUiReadyFailures) || 0) + 1);
        } else {
          runner.consecutiveUiReadyFailures = 0;
        }
      } catch {}
      try {
        btnSaveReport.disabled = !runner.results.length;
      } catch {}
      try {
        if (runner.currentRec === rec) runner.currentRec = null;
      } catch {}
    }
  }

  async function runMatrix() {
    if (!(await ensureSingleController())) return;
    if (runner.running) return;
    runner.running = true;
    runner.abort = false;
    btnStart.disabled = true;
    btnDryRun.disabled = true;
    btnOpenChatGPT.disabled = true;
    btnStop.disabled = false;
    setStatus('Running', true);
    broadcastMemtestStatus({ event: 'matrix_start' });
    startOrphanCleanupLoop();

    try {
      runner.backupSettings = await getSettings();
      writeLog(`[INFO] backed up settings`);
      runner.results = [];
      runner.guardEvents = [];
      runner.abortReason = '';
      runner.reportSeq = 0;
      try {
        btnSaveReport.disabled = true;
      } catch {}

      const selected = readSelectedModuleIds();
      if (!selected.length) throw new Error('no modules selected');
      runner.matrixSelected = selected.slice();

      const mode = getMatrixMode();
      let pack = null;
      if (mode === 'incremental') pack = buildCasesIncremental(selected);
      else if (mode === 'exhaustive') pack = buildCasesExhaustive(selected);
      else if (mode === 'grouped_exhaustive') pack = buildCasesGroupedExhaustive(selected, runner.groupMaxFactors);
      else pack = buildCasesPairwise(selected);
      runner.matrixMode = mode;

      // Optional caseId filter for fast repro loops (e.g. only rerun a small set of flaky cases).
      try {
        const allow = runner.caseIdAllow;
        if (allow && allow.size) {
          if (Array.isArray(pack?.cases)) {
            pack.cases = pack.cases.filter((c) => c && typeof c.id === 'string' && allow.has(c.id));
            writeLog(`[INFO] caseIds filter applied: cases=${pack.cases.length}`);
            if (!pack.cases.length) throw new Error('matched 0 cases');
          } else if (Array.isArray(pack?.groups)) {
            for (const g of pack.groups) {
              if (!g || !Array.isArray(g.cases)) continue;
              g.cases = g.cases.filter((c) => c && typeof c.id === 'string' && allow.has(c.id));
            }
            const left = pack.groups.reduce((n, g) => n + (Array.isArray(g?.cases) ? g.cases.length : 0), 0);
            writeLog(`[INFO] caseIds filter applied: groups=${pack.groups.length} cases=${left}`);
            if (left <= 0) throw new Error('matched 0 cases');
          }
        }
      } catch (e) {
        throw new Error(`caseIds filter invalid: ${e instanceof Error ? e.message : String(e)}`);
      }

      const meta = pack?.meta || null;
      runner.matrixMeta = meta;
      runner.matrixConfig = {
        caseMinutes: Math.max(1, Math.min(120, Number(caseMinutesEl.value) || 20)),
        messagesPerCase: Math.max(0, Math.min(50, Number(messagesPerCaseEl.value) || 0)),
        sampleSeconds: Math.max(1, Math.min(60, Number(sampleSecondsEl.value) || 3)),
        heapAbortMb: Math.max(128, Math.min(8192, Number(heapAbortMbEl.value) || 1400)),
        treeOpenMode: String(treeOpenModeEl?.value || 'open_once'),
        exerciseMode: getExerciseMode(),
        groupMaxFactors: mode === 'grouped_exhaustive' ? runner.groupMaxFactors : null,
        caseIds: runner.caseIdAllow && runner.caseIdAllow.size ? Array.from(runner.caseIdAllow) : null,
      };

      // Resume: restore partial report from previous crash and skip already-done cases.
      let doneCaseIds = new Set();
      if (runner.resume) {
        const persisted = await loadPersistedPartialReport();
        if (persisted && isCompatiblePersistedReport(persisted, mode, selected, runner.seed)) {
          const prior = Array.isArray(persisted.results) ? persisted.results : [];
          if (prior.length) {
            runner.results = prior;
            doneCaseIds = buildDoneCaseIdSet(prior);
            writeLog(`[INFO] resume enabled: restored ${prior.length} results; doneCases=${doneCaseIds.size}`);
            try {
              btnSaveReport.disabled = !runner.results.length;
            } catch {}
          }
        } else if (persisted && typeof persisted === 'object') {
          writeLog(`[INFO] resume: persisted report found but not compatible; starting fresh`);
        }
      }

      // If the previous controller died mid-case, there may be a leftover ChatGPT tab still running memtest.
      // Adopt it (collect its results) so the run can proceed cleanly.
      try {
        const adopted = await adoptOrphanMemtestTabIfAny(doneCaseIds);
        if (adopted) {
          doneCaseIds = buildDoneCaseIdSet(runner.results);
          writeLog(`[INFO] resume: orphan adoption complete; doneCases=${doneCaseIds.size}`);
        }
      } catch {}

      if (mode === 'grouped_exhaustive') {
        const groups = Array.isArray(pack?.groups) ? pack.groups : [];
        if (!groups.length) throw new Error('no groups generated');
        const totalCases =
          Number(meta?.totalCases) ||
          groups.reduce((sum, g) => sum + (Array.isArray(g?.cases) ? g.cases.length : 0), 0);

        writeLog(`[INFO] matrixMode=${mode} groups=${groups.length} totalCases=${totalCases}`);
        writeLog(
          `[INFO] grouped_exhaustive base=${JSON.stringify(meta?.base || [])} factorsTotal=${Number(meta?.factorsTotal) || 0} groupMaxFactors=${
            Number(meta?.groupMaxFactors) || runner.groupMaxFactors
          }`
        );

        for (let gi = 0; gi < groups.length; gi++) {
          if (runner.abort) break;
          const g = groups[gi];
          const gcases = Array.isArray(g?.cases) ? g.cases : [];
          const groupLabel = `${gi + 1}/${groups.length}`;
          writeLog(
            `[INFO] group ${groupLabel} id=${String(g?.id || '')} k=${Array.isArray(g?.factors) ? g.factors.length : 0} combos=${
              Number(g?.totalCombos) || 0
            } cases=${gcases.length} factors=${JSON.stringify(Array.isArray(g?.factors) ? g.factors : [])}`
          );

          let ran = 0;
        for (let ci = 0; ci < gcases.length; ci++) {
          if (runner.abort) break;
          const c = gcases[ci];
          if (doneCaseIds.has(c.id)) {
            writeLog(`[INFO] skip case ${c.id} (already done)`);
            continue;
          }
          setStatus(`Group ${groupLabel} · Case ${ci + 1}/${gcases.length}`, true);
          await runSingleCase(c.id, c.modules, { group: { id: g.id, index: g.index, factors: Array.isArray(g.factors) ? g.factors.slice() : [] } });
          doneCaseIds.add(c.id);
          ran += 1;
          // If ChatGPT is temporarily unreachable (gate/throttle), back off to avoid burning retries.
          const streak = Number(runner.consecutiveUiReadyFailures) || 0;
          if (streak >= 3) {
            const cool = Math.min(4 * 60_000, 20_000 + streak * 10_000);
            writeLog(`[WARN] consecutive UI-ready failures=${streak}; cooling down ${Math.round(cool / 1000)}s`);
            await sleep(cool);
          } else {
            // small cool-down
            await sleep(5000);
          }
        }

          if (runner.autoSave && ran > 0 && runner.results.length) {
            try {
              saveReport(`group_${String(g?.id || gi + 1)}`);
            } catch {}
          }
        }
      } else {
        const cases = Array.isArray(pack?.cases) ? pack.cases : [];
        if (!cases.length) throw new Error('no cases generated');

        writeLog(`[INFO] matrixMode=${mode} cases=${cases.length}`);
        if (meta && meta.mode === 'pairwise') {
          writeLog(
            `[INFO] pairwise seed=${meta.seed} base=${JSON.stringify(meta.base || [])} factors=${(meta.factors || []).length} vectors=${meta.vectors} uncoveredLeft=${meta.uncoveredLeft}`
          );
        }

        for (let i = 0; i < cases.length; i++) {
          if (runner.abort) break;
          setStatus(`Case ${i + 1}/${cases.length}`, true);
          const c = cases[i];
          if (doneCaseIds.has(c.id)) {
            writeLog(`[INFO] skip case ${c.id} (already done)`);
            continue;
          }
          await runSingleCase(c.id, c.modules);
          doneCaseIds.add(c.id);
          const streak = Number(runner.consecutiveUiReadyFailures) || 0;
          if (streak >= 3) {
            const cool = Math.min(4 * 60_000, 20_000 + streak * 10_000);
            writeLog(`[WARN] consecutive UI-ready failures=${streak}; cooling down ${Math.round(cool / 1000)}s`);
            await sleep(cool);
          } else {
            await sleep(5000);
          }
        }
      }
    } catch (e) {
      writeLog(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
      setStatus('Error', false);
    } finally {
      try {
        if (runner.testTabId) await ensureTabClosed(runner.testTabId);
      } catch {}
      runner.testTabId = null;
      try {
        await cleanupCreatedTabs();
      } catch {}
      try {
        await cleanupOrphanChatgptTabs('matrix_end', null);
      } catch {}

      try {
        if (runner.backupSettings) await setSettings(runner.backupSettings);
        writeLog(`[INFO] restored settings`);
      } catch (e) {
        writeLog(`[WARN] failed to restore settings: ${e instanceof Error ? e.message : String(e)}`);
      }

      runner.running = false;
      runner.abort = false;
      stopOrphanCleanupLoop();
      btnStart.disabled = false;
      btnDryRun.disabled = false;
      btnOpenChatGPT.disabled = false;
      btnStop.disabled = true;
      setStatus('Idle', true);
      broadcastMemtestStatus({ event: 'matrix_end' });
      try {
        if (runner.autoSave && runner.results.length) {
          // Best-effort: bring the controller back to front so the download is not blocked.
          try {
            const ctlId = runner.controllerTabId;
            if (Number.isFinite(ctlId)) await tabsUpdate(ctlId, { active: true });
          } catch {}
          saveReport();
        }
      } catch {}
    }
  }

  function buildReportPayload() {
    const nowIso = new Date().toISOString();
    const manifest = (() => {
      try {
        return chrome.runtime.getManifest ? chrome.runtime.getManifest() : null;
      } catch {
        return null;
      }
    })();
    return {
      generatedAt: nowIso,
      extension: {
        id: (() => {
          try {
            return chrome.runtime.id || null;
          } catch {
            return null;
          }
        })(),
        version: manifest && typeof manifest.version === 'string' ? manifest.version : null,
      },
      matrix: {
        mode: runner.matrixMode || null,
        meta: runner.matrixMeta || null,
        selectedModules: Array.isArray(runner.matrixSelected) ? runner.matrixSelected.slice() : null,
        config: runner.matrixConfig || null,
      },
      config: {
        caseMinutes: Number(caseMinutesEl.value) || null,
        messagesPerCase: Number(messagesPerCaseEl.value) || null,
        sampleSeconds: Number(sampleSecondsEl.value) || null,
        heapAbortMb: Number(heapAbortMbEl.value) || null,
        treeOpenMode: String(treeOpenModeEl.value || ''),
        matrixMode: String(getMatrixMode() || ''),
        exerciseMode: String(getExerciseMode() || ''),
        promptTemplate: String(promptTemplateEl.value || ''),
        seed: runner.seed != null ? Number(runner.seed) : null,
      },
      userAgent: (() => {
        try {
          return navigator.userAgent;
        } catch {
          return null;
        }
      })(),
      guardEvents: Array.isArray(runner.guardEvents) ? runner.guardEvents : [],
      results: Array.isArray(runner.results) ? runner.results : [],
    };
  }

  async function persistPartialReport(tag) {
    try {
      const payload = buildReportPayload();
      payload.persistedAt = new Date().toISOString();
      payload.persistTag = typeof tag === 'string' ? tag : null;
      await storageLocalSet({ __qn_memtest_partial_v1: payload });
    } catch {}
  }

  async function findOrphanMemtestTabInWindow() {
    try {
      const query = { url: ['https://chatgpt.com/*', 'https://chat.openai.com/*'] };
      if (Number.isFinite(runner.controllerWindowId)) query.windowId = runner.controllerWindowId;
      const tabs = await tabsQuery(query);
      for (const t of tabs) {
        const tabId = t && Number.isFinite(t.id) ? t.id : null;
        if (!Number.isFinite(tabId)) continue;
        // Skip the current "testTabId" if we already know it (not orphan).
        if (Number.isFinite(runner.testTabId) && tabId === runner.testTabId) continue;
        let info = null;
        try {
          info = await execInTab(
            tabId,
            () => {
              const s = window.__qnMemtest;
              if (!s || typeof s !== 'object') return null;
              const cfg = s.cfg || null;
              const last = Array.isArray(s.samples) && s.samples.length ? s.samples[s.samples.length - 1] : null;
              return {
                caseId: typeof cfg?.caseId === 'string' ? cfg.caseId : '',
                enabledModules: Array.isArray(cfg?.enabledModules) ? cfg.enabledModules : [],
                durationMs: typeof cfg?.durationMs === 'number' ? cfg.durationMs : null,
                startedAt: typeof s.startedAt === 'number' ? s.startedAt : null,
                stoppedAt: typeof s.stoppedAt === 'number' ? s.stoppedAt : null,
                stopReason: typeof s.stopReason === 'string' ? s.stopReason : '',
                sent: typeof s.sent === 'number' ? s.sent : 0,
                samples: Array.isArray(s.samples) ? s.samples.length : 0,
                lastTms: last && typeof last.tMs === 'number' ? last.tMs : null,
              };
            },
            [],
            'MAIN',
            3500
          );
        } catch {
          // ignore
        }
        if (info && typeof info === 'object' && (info.caseId || (info.enabledModules && info.enabledModules.length))) {
          return { tabId, info };
        }
      }
    } catch {}
    return null;
  }

  async function adoptOrphanMemtestTabIfAny(doneCaseIds) {
    const found = await findOrphanMemtestTabInWindow();
    if (!found) return false;
    const tabId = found.tabId;
    const info = found.info || {};
    const caseId = typeof info.caseId === 'string' && info.caseId ? info.caseId : `orphan_${Date.now()}`;
    const mods = Array.isArray(info.enabledModules) ? info.enabledModules.slice() : [];

    if (doneCaseIds && doneCaseIds.has(caseId)) {
      writeLog(`[WARN] orphan memtest tab already done; closing tabId=${tabId} case=${caseId}`);
      await ensureTabClosed(tabId);
      return true;
    }

    writeLog(`[WARN] adopting orphan memtest tabId=${tabId} case=${caseId} modules=${JSON.stringify(mods)}`);

    const rec = {
      caseId,
      modules: mods,
      startedAt: new Date().toISOString(),
      endedAt: null,
      stopReason: '',
      sent: 0,
      summary: null,
      samplesTail: [],
      errorsTail: [],
      evidence: [],
      group: null,
      error: null,
      adopted: true,
    };

    // Wait for the in-page runner to finish (best-effort).
    const durationMs = Number(info.durationMs) || 20 * 60 * 1000;
    const pollDeadline = Date.now() + durationMs + 2 * 60 * 1000;
    while (!runner.abort && Date.now() < pollDeadline) {
      let st = null;
      try {
        st = await withTimeout(
          execInTab(
            tabId,
            () => {
              const s = window.__qnMemtest;
              if (!s || typeof s !== 'object') return null;
              return { stoppedAt: Number(s.stoppedAt) || 0, stopReason: String(s.stopReason || ''), sent: Number(s.sent) || 0 };
            },
            [],
            'MAIN',
            25_000
          ),
          25_000,
          'adopt_poll'
        );
      } catch (e) {
        // If the tab vanished, stop trying.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('No tab with id')) break;
      }
      if (st && st.stoppedAt) break;
      await sleep(1200);
    }

    try {
      const result = await withTimeout(
        execInTab(
          tabId,
          () => {
            const s = window.__qnMemtest;
            if (!s || typeof s !== 'object') return null;

            const samples = Array.isArray(s.samples) ? s.samples : [];
            let maxHeap = 0;
            let maxDom = 0;
            let maxIframes = 0;
            let last = null;
            for (const row of samples) {
              if (!row || typeof row !== 'object') continue;
              const heapMb = Number(row.heapMb) || 0;
              const dom = Number(row.domNodes) || 0;
              const ifr = Number(row.iframes) || 0;
              if (heapMb > maxHeap) maxHeap = heapMb;
              if (dom > maxDom) maxDom = dom;
              if (ifr > maxIframes) maxIframes = ifr;
              last = row;
            }
            const first = samples[0] || null;
            const durSec = first && last ? Math.max(0, (Number(last.tMs) - Number(first.tMs)) / 1000) : 0;
            const heapDelta = first && last ? (Number(last.heapMb) || 0) - (Number(first.heapMb) || 0) : 0;
            const heapSlope = durSec > 0 ? heapDelta / durSec : 0;
            const summary = { count: samples.length, maxHeap, maxDom, maxIframes, durSec: Math.round(durSec), heapDelta, heapSlope };

            return {
              stoppedAt: Number(s.stoppedAt) || 0,
              stopReason: String(s.stopReason || ''),
              sent: Number(s.sent) || 0,
              summary,
              samplesTail: samples.slice(-90),
              errorsTail: (Array.isArray(s.errors) ? s.errors : []).slice(-12),
            };
          },
          [],
          'MAIN',
          30_000
        ),
        30_000,
        'adopt_collect'
      );

      rec.stopReason = String(result?.stopReason || '');
      rec.sent = Number(result?.sent) || 0;
      rec.summary = result?.summary || null;
      rec.samplesTail = Array.isArray(result?.samplesTail) ? result.samplesTail : [];
      rec.errorsTail = Array.isArray(result?.errorsTail) ? result.errorsTail : [];
    } catch (e) {
      rec.error = e instanceof Error ? e.message : String(e);
    } finally {
      try {
        await ensureTabClosed(tabId);
      } catch {}
      rec.endedAt = new Date().toISOString();
      runner.results.push(rec);
      try {
        const n = runner.results.length;
        await persistPartialReport(`adopt_${String(n).padStart(3, '0')}`);
      } catch {}
    }

    return true;
  }

  function saveReport(tag) {
    try {
      const payload = buildReportPayload();
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const safeTag = (() => {
        const t = String(tag || '').trim();
        if (!t) return '';
        return t
          .replace(/[^a-zA-Z0-9_-]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 40);
      })();
      let seq = '';
      if (safeTag) {
        try {
          runner.reportSeq = Math.max(0, Number(runner.reportSeq) || 0) + 1;
          seq = String(runner.reportSeq).padStart(3, '0');
        } catch {}
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = `quicknav-memtest-${ts}${safeTag ? `-${seq}-${safeTag}` : ''}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        try {
          a.remove();
        } catch {}
      }, 5000);
      writeLog(`[INFO] report download triggered${safeTag ? ` (${safeTag})` : ''}`);
    } catch (e) {
      writeLog(`[WARN] report download failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function dryRun() {
    if (runner.running) return;
    runner.running = true;
    runner.abort = false;
    btnStart.disabled = true;
    btnDryRun.disabled = true;
    btnOpenChatGPT.disabled = true;
    btnStop.disabled = false;
    setStatus('Dry-run', true);
    startOrphanCleanupLoop();

    try {
      runner.backupSettings = await getSettings();
      writeLog(`[INFO] dry-run: backed up settings`);

      // baseline only (no chat automation)
      const next = buildChatgptOnlySettings(runner.backupSettings, []);
      await setSettings(next);

      await cleanupOrphanChatgptTabs('before_dryrun', null);
      const tab = await tabsCreate({ url: CHATGPT_URL, active: false });
      const tabId = tab?.id;
      if (!Number.isFinite(tabId)) throw new Error('failed to create tab');
      runner.testTabId = tabId;
      try {
        runner.createdTabIds.add(tabId);
      } catch {}

      await waitTabComplete(tabId, 60000);
      await sleep(1200);

      const sample = await execInTab(tabId, () => {
        const mem = performance && performance.memory ? performance.memory : null;
        const heapMb = mem && mem.usedJSHeapSize ? Math.round(mem.usedJSHeapSize / 1048576) : null;
        return {
          href: location.href,
          heapMb,
          domNodes: document.getElementsByTagName('*').length,
          iframes: document.getElementsByTagName('iframe').length,
        };
      });

      writeLog(`[INFO] dry-run sample: ${JSON.stringify(sample)}`);
      await ensureTabClosed(tabId);
      runner.testTabId = null;
    } catch (e) {
      writeLog(`[ERROR] dry-run: ${e instanceof Error ? e.message : String(e)}`);
      setStatus('Error', false);
    } finally {
      try {
        if (runner.testTabId) await ensureTabClosed(runner.testTabId);
      } catch {}
      runner.testTabId = null;
      try {
        await cleanupCreatedTabs();
      } catch {}
      try {
        await cleanupOrphanChatgptTabs('after_dryrun', null);
      } catch {}
      try {
        if (runner.backupSettings) await setSettings(runner.backupSettings);
        writeLog(`[INFO] dry-run: restored settings`);
      } catch {}
      runner.running = false;
      runner.abort = false;
      stopOrphanCleanupLoop();
      btnStart.disabled = false;
      btnDryRun.disabled = false;
      btnOpenChatGPT.disabled = false;
      btnStop.disabled = true;
      setStatus('Idle', true);
    }
  }

  function stop() {
    if (!runner.running) return;
    const reason = typeof arguments[0] === 'string' ? String(arguments[0] || '').trim() : '';
    runner.abort = true;
    runner.abortReason = reason || 'user_stop';
    setStatus('Stopping…', false);
    writeLog(`[INFO] stop requested${runner.abortReason ? ` (${runner.abortReason})` : ''}`);
    // Best-effort: tell tab runner to stop now.
    try {
      const tabId = runner.testTabId;
      if (Number.isFinite(tabId)) {
        void execInTab(tabId, (stopReason) => {
          try {
            if (window.__qnMemtest && typeof window.__qnMemtest.stop === 'function') {
              window.__qnMemtest.stopReason = String(stopReason || 'user_stop');
              window.__qnMemtest.stop();
            }
          } catch {}
        }, [runner.abortReason]).catch(() => void 0);
      }
    } catch {}
  }

  async function openChatGptTab() {
    try {
      const tab = await tabsCreate({ url: CHATGPT_URL, active: true });
      writeLog(`[INFO] opened tab ${tab?.id}`);
    } catch (e) {
      writeLog(`[ERROR] open tab failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function applyUrlParams() {
    try {
      const u = new URL(location.href);
      const p = u.searchParams;
      const assignNum = (key, el, min, max) => {
        if (!el) return;
        const v = p.get(key);
        if (v == null) return;
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        const clamped = Math.max(min, Math.min(max, n));
        el.value = String(clamped);
      };
      assignNum('caseMinutes', caseMinutesEl, 1, 120);
      assignNum('messagesPerCase', messagesPerCaseEl, 0, 50);
      assignNum('sampleSeconds', sampleSecondsEl, 1, 60);
      assignNum('heapAbortMb', heapAbortMbEl, 128, 8192);

      // Optional override: fail-fast on stuck generations / site issues.
      // Example: `...&maxWaitSeconds=45` (10–600)
      try {
        const raw =
          p.get('maxWaitSeconds') || p.get('maxWaitSec') || p.get('maxWaitPerMessageSeconds') || p.get('maxWaitPerMsgSeconds');
        if (raw != null) {
          const n = Number(raw);
          if (Number.isFinite(n)) {
            const sec = Math.max(10, Math.min(600, Math.floor(n)));
            runner.maxWaitPerMessageMsOverride = sec * 1000;
            writeLog(`[INFO] maxWaitSeconds override enabled: ${sec}s`);
          }
        } else {
          runner.maxWaitPerMessageMsOverride = null;
        }
      } catch {}

      const tree = p.get('treeOpenMode');
      if (tree) treeOpenModeEl.value = tree;
      const mode = p.get('mode') || p.get('matrixMode');
      if (mode && matrixModeEl) matrixModeEl.value = normalizeMatrixMode(mode);
      const ex = p.get('exerciseMode');
      if (ex && exerciseModeEl) exerciseModeEl.value = normalizeExerciseMode(ex);
      const seed = p.get('seed');
      if (seed != null) {
        const n = Number(seed);
        if (Number.isFinite(n)) runner.seed = Math.floor(n);
      }

      const groupMax = p.get('groupMaxFactors') || p.get('groupMax') || p.get('groupSize');
      if (groupMax != null) {
        const n = Number(groupMax);
        if (Number.isFinite(n)) runner.groupMaxFactors = Math.max(1, Math.min(8, Math.floor(n)));
      }

      const only = p.get('only');
      if (only) {
        const allow = new Set(String(only).split(',').map((s) => s.trim()).filter(Boolean));
        for (const row of Array.from(modsEl.querySelectorAll('input[data-mod-id]'))) {
          if (!(row instanceof HTMLInputElement)) continue;
          const id = String(row.getAttribute('data-mod-id') || '');
          row.checked = allow.has(id);
        }
      }

      const caseIds = p.get('caseIds') || p.get('cases') || p.get('caseId');
      if (caseIds) {
        const allow = new Set(String(caseIds).split(',').map((s) => s.trim()).filter(Boolean));
        runner.caseIdAllow = allow.size ? allow : null;
        if (runner.caseIdAllow) writeLog(`[INFO] caseIds filter enabled: ${JSON.stringify(Array.from(runner.caseIdAllow))}`);
      } else {
        runner.caseIdAllow = null;
      }

      const memguardClose = p.get('memguard') || p.get('memguard_close') || p.get('memguardClose');
      if (memguardClose === '1' || String(memguardClose || '').toLowerCase() === 'true') {
        writeLog('[WARN] memguard detected; requesting background to close current test tab (keep matrix running)');
        void sendMessage({ type: 'QUICKNAV_MEMTEST_GUARD', reason: 'memguard_close' }).catch(() => void 0);
        closeSelfTabSoon(900);
        return;
      }

      const memguardAbort = p.get('memguard_abort') || p.get('memguardAbort') || p.get('abort');
      if (memguardAbort === '1' || String(memguardAbort || '').toLowerCase() === 'true') {
        writeLog('[WARN] memguard_abort detected; requesting background abort + closing this tab');
        void sendMessage({ type: 'QUICKNAV_MEMTEST_ABORT', reason: 'memguard_abort' }).catch(() => void 0);
        closeSelfTabSoon(900);
        return;
      }

      const autorun = p.get('autorun');
      const wantsAutorun = autorun === '1' || String(autorun || '').toLowerCase() === 'true';
      if (wantsAutorun) {
        const autosave = p.get('autosave');
        runner.autoSave = autosave == null || autosave === '1' || String(autosave || '').toLowerCase() === 'true';
        setTimeout(() => void runMatrix(), 400);
      }
    } catch {}
  }

  // Expose a small debug surface for MCP automation / external watchdogs.
  // (Useful when investigating non-JS-heap renderer blow-ups where `performance.memory` stays low.)
  try {
    window.__qnMemtestDev = Object.freeze({
      version: 1,
      getState: () => ({
        running: !!runner.running,
        abort: !!runner.abort,
        testTabId: runner.testTabId,
        createdTabIds: Array.from(runner.createdTabIds || []),
        resultsCount: Array.isArray(runner.results) ? runner.results.length : 0,
        matrixMode: runner.matrixMode || null,
        matrixMeta: runner.matrixMeta || null,
        caseIds: runner.caseIdAllow && runner.caseIdAllow.size ? Array.from(runner.caseIdAllow) : null,
        seed: runner.seed == null ? null : runner.seed,
        groupMaxFactors: runner.groupMaxFactors,
        reportSeq: runner.reportSeq,
      }),
      stop: () => stop(),
      start: () => void runMatrix(),
      save: () => saveReport(),
      discardTestTab: () => {
        try {
          const id = runner.testTabId;
          if (Number.isFinite(id)) chrome.tabs.discard(id, () => void chrome.runtime.lastError);
        } catch {}
      },
    });
  } catch {}

  renderModules();
  setStatus('Idle', true);
  writeLog(`[READY] site=${SITE_ID} modules=${chatgptModuleIds.length}`);
  writeLog(`[TIP] Open this page URL: chrome-extension://<id>/dev/memtest.html`);

  // If a previous long-run crashed mid-way, keep a recoverable partial snapshot in storage.local.
  try {
    void storageLocalGet({ __qn_memtest_partial_v1: null }).then((d) => {
      const r = d && d.__qn_memtest_partial_v1;
      if (!r || typeof r !== 'object') return;
      const n = Array.isArray(r.results) ? r.results.length : 0;
      if (n <= 0) return;
      writeLog(`[INFO] found persisted partial report: results=${n} generatedAt=${String(r.generatedAt || '')}`);

      // If the user opened the dev page without URL params, prefill the UI from the persisted config
      // to make resuming less error-prone.
      try {
        const u = new URL(location.href);
        const p = u.searchParams;
        const hasOverrides = [
          'caseMinutes',
          'messagesPerCase',
          'sampleSeconds',
          'heapAbortMb',
          'treeOpenMode',
          'mode',
          'matrixMode',
          'exerciseMode',
          'seed',
          'only',
          'caseIds',
          'groupMaxFactors',
          'groupMax',
          'groupSize',
        ].some((k) => p.has(k));

        const looksUntouched = (() => {
          try {
            if (String(matrixModeEl?.value || '') !== 'pairwise') return false;
            if (runner.seed != null) return false;
            const rows = Array.from(modsEl.querySelectorAll('input[data-mod-id]'));
            if (!rows.length) return false;
            return !rows.some((cb) => cb instanceof HTMLInputElement && !cb.checked);
          } catch {
            return false;
          }
        })();

        if (!hasOverrides && looksUntouched) {
          const cfg = r.config && typeof r.config === 'object' ? r.config : {};
          const sel = Array.isArray(r?.matrix?.selectedModules) ? r.matrix.selectedModules : [];

          const setNum = (el, v) => {
            if (!el) return;
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            el.value = String(n);
          };

          setNum(caseMinutesEl, cfg.caseMinutes);
          setNum(messagesPerCaseEl, cfg.messagesPerCase);
          setNum(sampleSecondsEl, cfg.sampleSeconds);
          setNum(heapAbortMbEl, cfg.heapAbortMb);

          if (typeof cfg.treeOpenMode === 'string' && treeOpenModeEl) treeOpenModeEl.value = cfg.treeOpenMode;
          if (typeof cfg.exerciseMode === 'string' && exerciseModeEl) exerciseModeEl.value = normalizeExerciseMode(cfg.exerciseMode);
          if (typeof cfg.matrixMode === 'string' && matrixModeEl) matrixModeEl.value = normalizeMatrixMode(cfg.matrixMode);
          if (cfg.seed != null) {
            const sn = Number(cfg.seed);
            if (Number.isFinite(sn)) runner.seed = Math.floor(sn);
          }

          if (Array.isArray(sel) && sel.length) {
            const allow = new Set(sel.map((x) => String(x || '')).filter(Boolean));
            for (const row of Array.from(modsEl.querySelectorAll('input[data-mod-id]'))) {
              if (!(row instanceof HTMLInputElement)) continue;
              const id = String(row.getAttribute('data-mod-id') || '');
              if (!id) continue;
              row.checked = allow.has(id);
            }
          }

          writeLog(
            `[INFO] applied persisted config to UI: mode=${String(cfg.matrixMode || '')} seed=${
              cfg.seed == null ? '' : String(cfg.seed)
            } selected=${Array.isArray(sel) ? sel.length : 0}`
          );
        }
      } catch {}
    });
  } catch {}

  // Controller tab id (best-effort, for background watchdogs / OS memguard triggers).
  try {
    chrome.tabs.getCurrent((tab) => {
      const id = tab && Number.isFinite(tab.id) ? tab.id : null;
      if (Number.isFinite(id)) runner.controllerTabId = id;
      const winId = tab && Number.isFinite(tab.windowId) ? tab.windowId : null;
      if (Number.isFinite(winId)) runner.controllerWindowId = winId;
      broadcastMemtestStatus({ event: 'controller_ready' });
    });
  } catch {}

  // Allow background/guard to stop the current run.
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      try {
        if (!msg || typeof msg !== 'object') return;
        const type = String(msg.type || '');

        if (type === 'QUICKNAV_MEMTEST_GUARD_EVENT') {
          const reason = typeof msg.reason === 'string' ? msg.reason : 'guard';
          const caseId = typeof msg.caseId === 'string' ? msg.caseId : '';
          const mods = Array.isArray(msg.modules) ? msg.modules : null;
          const ev = {
            at: new Date().toISOString(),
            type: 'guard',
            reason,
            caseId,
            modules: mods ? mods.slice() : null,
          };
          try {
            runner.guardEvents.push(ev);
          } catch {}
          try {
            if (runner.currentRec && typeof runner.currentRec === 'object') {
              if (!caseId || runner.currentRec.caseId === caseId) runner.currentRec.evidence.push(ev);
            }
          } catch {}
          writeLog(
            `[WARN] memguard event (${reason})${caseId ? ` case=${caseId}` : ''}${mods && mods.length ? ` modules=${JSON.stringify(mods)}` : ''}`
          );
          return;
        }

        if (type !== 'QUICKNAV_MEMTEST_ABORT') return;
        const reason = typeof msg.reason === 'string' ? msg.reason : 'abort';
        const caseId = typeof msg.caseId === 'string' ? msg.caseId : '';
        const mods = Array.isArray(msg.modules) ? msg.modules : null;
        writeLog(
          `[WARN] received abort from background (${reason})${caseId ? ` case=${caseId}` : ''}${
            mods && mods.length ? ` modules=${JSON.stringify(mods)}` : ''
          }`
        );
        stop(reason);
      } catch {}
    });
  } catch {}

  btnStart.addEventListener('click', () => void runMatrix());
  btnDryRun.addEventListener('click', () => void dryRun());
  btnOpenChatGPT.addEventListener('click', () => void openChatGptTab());
  btnStop.addEventListener('click', stop);
  btnSaveReport.addEventListener('click', () => saveReport());
  applyUrlParams();
})();
