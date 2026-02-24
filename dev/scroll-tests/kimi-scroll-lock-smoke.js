// Kimi scroll-lock smoke test (dev-only)
//
// Usage:
// - Open https://kimi.com/ or https://www.kimi.com/ in Chrome
// - Open DevTools Console
// - Paste this entire file and run it
//
// Checks:
// 1) lock signal parity (button state vs dataset)
// 2) programmatic downward scroll is blocked while lock is enabled
// 3) QuickNav next click opens temporary allow window, then lock resumes
// 4) (best-effort) conversation route switch keeps lock state

(async () => {
  'use strict';

  const LOCK_DRIFT_PX = 16;
  const LOCK_TOLERANCE_PX = 2.5;
  const MIN_SCROLL_ROOM_PX = 28;
  const SETTLE_MS = 140;
  const MAX_ROUTE_WAIT_MS = 5000;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const settle = async () => {
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } catch {}
    await sleep(SETTLE_MS);
  };

  const boolFromUnknown = (value) => {
    if (value === true || value === false) return value;
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') return true;
    if (normalized === '0' || normalized === 'false') return false;
    return null;
  };

  const finiteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const isScrollableY = (el) => {
    if (!el || typeof el !== 'object') return false;
    try {
      const cs = getComputedStyle(el);
      const oy = cs ? cs.overflowY : '';
      if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
      return (el.scrollHeight || 0) > (el.clientHeight || 0) + 6;
    } catch {
      return false;
    }
  };

  const findClosestScrollable = (seed) => {
    let el = seed;
    while (el && el !== document.documentElement) {
      if (isScrollableY(el)) return el;
      el = el.parentElement;
    }
    if (el === document.documentElement && isScrollableY(el)) return el;
    return null;
  };

  const getScrollRoom = (el) => {
    if (!el || typeof el !== 'object') return 0;
    return Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
  };

  const pickBestScrollable = (candidates) => {
    let best = null;
    let bestRoom = -1;
    const seen = new Set();
    for (const candidate of candidates || []) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      if (!isScrollableY(candidate)) continue;
      const room = getScrollRoom(candidate);
      if (room > bestRoom) {
        best = candidate;
        bestRoom = room;
      }
    }
    return { el: best, room: bestRoom };
  };

  const findScroller = () => {
    const marker = document.querySelector('[data-quicknav-scrolllock-scroller="1"]');
    const seeds = [
      document.querySelector('.chat-detail-main'),
      document.querySelector('[class*="chat-detail-main"]'),
      document.querySelector('[data-testid="conversation-turns"]'),
      document.querySelector('[data-message-id]'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.scrollingElement,
      document.body,
      document.documentElement
    ].filter(Boolean);

    const candidates = [];
    for (const seed of seeds) {
      const scroller = findClosestScrollable(seed);
      if (scroller) candidates.push(scroller);
    }

    const best = pickBestScrollable(candidates);
    const markerRoom = getScrollRoom(marker);
    const markerScrollable = !!marker && isScrollableY(marker);
    const markerIsRoot =
      !!marker &&
      (marker === document.documentElement || marker === document.body || marker === document.scrollingElement);

    if (markerScrollable) {
      const bestRoom = best.room >= 0 ? best.room : 0;
      const markerComparable = markerRoom + 8 >= bestRoom;
      if (!best.el || marker === best.el || (markerComparable && !markerIsRoot)) {
        return {
          el: marker,
          source: 'quicknav-marker',
          marker,
          markerRoom,
          bestCandidateRoom: bestRoom,
          markerIsRoot
        };
      }
    }

    if (best.el) {
      return {
        el: best.el,
        source: marker ? 'fallback-best-scrollable' : 'fallback-closest-scrollable',
        marker,
        markerRoom,
        bestCandidateRoom: best.room,
        markerIsRoot
      };
    }

    return {
      el: marker || document.scrollingElement || document.documentElement,
      source: marker ? 'marker-no-scroll-room' : 'fallback-document-scroller',
      marker,
      markerRoom,
      bestCandidateRoom: best.room,
      markerIsRoot
    };
  };

  const detectLockState = () => {
    const dataset = (document.documentElement && document.documentElement.dataset) || {};
    const datasetRaw = dataset.quicknavScrollLockEnabled;
    const datasetEnabled = boolFromUnknown(datasetRaw);

    const lockBtn = document.querySelector('#cgpt-compact-nav .compact-lock');
    const buttonEnabled = lockBtn ? lockBtn.classList.contains('active') : null;

    let enabled = null;
    let source = 'unknown';
    if (typeof datasetEnabled === 'boolean') {
      enabled = datasetEnabled;
      source = 'dataset';
    } else if (typeof buttonEnabled === 'boolean') {
      enabled = buttonEnabled;
      source = 'lock-button';
    }

    const conflict =
      typeof datasetEnabled === 'boolean' &&
      typeof buttonEnabled === 'boolean' &&
      datasetEnabled !== buttonEnabled;

    return {
      known: typeof enabled === 'boolean',
      enabled,
      source,
      conflict,
      datasetRaw: datasetRaw == null ? null : String(datasetRaw),
      buttonPresent: !!lockBtn,
      buttonEnabled
    };
  };

  const getTop = (el) => {
    const n = finiteNumber(el && el.scrollTop);
    return n == null ? 0 : n;
  };

  const setTop = (el, top) => {
    try {
      el.scrollTop = top;
    } catch {}
  };

  const getMaxTop = (el) => {
    const max = (el.scrollHeight || 0) - (el.clientHeight || 0);
    return Math.max(0, finiteNumber(max) || 0);
  };

  const waitForAllowWindowToSettle = async () => {
    const dataset = (document.documentElement && document.documentElement.dataset) || {};
    const firstUntil = finiteNumber(dataset.quicknavAllowScrollUntil);
    if (firstUntil == null) return { waitedMs: 0, stillActive: false, until: null };

    const now = Date.now();
    let waitedMs = 0;
    const firstRemaining = firstUntil - now;
    if (firstRemaining > 60) {
      waitedMs = Math.min(1800, Math.max(0, firstRemaining + 24));
      await sleep(waitedMs);
    }

    const nextDataset = (document.documentElement && document.documentElement.dataset) || {};
    const nextUntil = finiteNumber(nextDataset.quicknavAllowScrollUntil);
    const stillActive = nextUntil != null && nextUntil - Date.now() > 50;
    return { waitedMs, stillActive, until: nextUntil };
  };

  const runProgrammaticDownBlockCheck = async (scroller, checkName) => {
    await settle();

    let startTop = getTop(scroller);
    const maxTop = getMaxTop(scroller);
    let room = maxTop - startTop;

    if (room < MIN_SCROLL_ROOM_PX && maxTop > MIN_SCROLL_ROOM_PX * 3) {
      const moveUpBy = Math.max(120, (scroller.clientHeight || 0) * 0.5);
      setTop(scroller, Math.max(0, startTop - moveUpBy));
      await settle();
      startTop = getTop(scroller);
      room = maxTop - startTop;
    }

    if (room < MIN_SCROLL_ROOM_PX) {
      return {
        [checkName]: {
          status: 'skip',
          details: { reason: 'not enough downward scroll room to run smoke check', startTop, maxTop, room }
        }
      };
    }

    const attemptDelta = Math.min(room, Math.max(120, (scroller.clientHeight || 0) * 0.6));
    const attempts = [];
    let maxObservedTop = startTop;

    const runAttempt = async (name, invoke) => {
      const before = getTop(scroller);
      let error = null;
      try {
        invoke(before);
      } catch (e) {
        error = e && e.message ? String(e.message) : String(e);
      }
      await settle();
      const after = getTop(scroller);
      if (after > maxObservedTop) maxObservedTop = after;
      attempts.push({ name, before, after, movedDown: after - before, error });
    };

    await runAttempt('set-scrollTop', (before) => {
      setTop(scroller, before + attemptDelta);
    });

    if (typeof scroller.scrollTo === 'function') {
      await runAttempt('element-scrollTo', (before) => {
        scroller.scrollTo({ top: before + attemptDelta, behavior: 'auto' });
      });
    } else {
      attempts.push({ name: 'element-scrollTo', skipped: true, reason: 'scrollTo not supported on selected scroller' });
    }

    if (typeof scroller.scrollBy === 'function') {
      await runAttempt('element-scrollBy', () => {
        scroller.scrollBy({ top: attemptDelta, behavior: 'auto' });
      });
    } else {
      attempts.push({ name: 'element-scrollBy', skipped: true, reason: 'scrollBy not supported on selected scroller' });
    }

    const totalDownward = maxObservedTop - startTop;
    const allowedDownward = LOCK_DRIFT_PX + LOCK_TOLERANCE_PX;
    const blocked = totalDownward <= allowedDownward;

    return {
      [checkName]: {
        status: blocked ? 'pass' : 'fail',
        details: { startTop, maxObservedTop, totalDownward, allowedDownward, attemptDelta, attempts }
      }
    };
  };

  const findSidebarRouteCandidate = () => {
    const hrefNow = location.href;
    const current = new URL(hrefNow);
    const links = Array.from(
      document.querySelectorAll(
        'aside a[href], nav a[href], [data-testid*="history" i] a[href], [class*="sidebar" i] a[href], a[href*="/chat/"], a[href*="/c/"]'
      )
    );

    for (const link of links) {
      const raw = String(link.getAttribute('href') || '').trim();
      if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) continue;
      let targetUrl;
      try {
        targetUrl = new URL(raw, hrefNow);
      } catch {
        continue;
      }
      if (targetUrl.origin !== current.origin) continue;
      if (targetUrl.href === hrefNow) continue;
      if (targetUrl.pathname === current.pathname && targetUrl.search === current.search) continue;
      const text = (link.textContent || '').trim();
      if (!text) continue;
      return { link, href: targetUrl.href, text: text.slice(0, 80) };
    }
    return null;
  };

  const run = async () => {
    const checks = {};
    const dataset = (document.documentElement && document.documentElement.dataset) || {};

    checks.bridgeNoncePresent = dataset.quicknavBridgeNonceV1
      ? { status: 'pass', details: { nonce: String(dataset.quicknavBridgeNonceV1).slice(0, 18) } }
      : { status: 'fail', details: { reason: 'documentElement.dataset.quicknavBridgeNonceV1 missing' } };

    const lockState = detectLockState();
    checks.lockStateDetected = lockState.known
      ? { status: 'pass', details: lockState }
      : { status: 'fail', details: lockState };

    checks.lockSignalParity = lockState.conflict
      ? { status: 'fail', details: lockState }
      : { status: 'pass', details: lockState };

    const scrollerInfo = findScroller();
    const scroller = scrollerInfo.el;
    checks.scrollerDetected = scroller
      ? {
          status: 'pass',
          details: {
            source: scrollerInfo.source,
            tagName: String(scroller.tagName || '').toLowerCase() || 'unknown',
            className: String(scroller.className || '').slice(0, 80) || null
          }
        }
      : { status: 'fail', details: { source: scrollerInfo.source } };

    if (scrollerInfo.marker && scrollerInfo.source !== 'quicknav-marker') {
      checks.scrollerMarkerParity = {
        status: 'fail',
        details: {
          reason: 'quicknav marker does not point to the best scrollable conversation container',
          markerTag: String(scrollerInfo.marker.tagName || '').toLowerCase() || null,
          markerClass: String(scrollerInfo.marker.className || '').slice(0, 80) || null,
          markerIsRoot: !!scrollerInfo.markerIsRoot,
          markerRoom: scrollerInfo.markerRoom,
          selectedSource: scrollerInfo.source,
          selectedTag: String(scroller.tagName || '').toLowerCase() || null,
          selectedClass: String(scroller.className || '').slice(0, 80) || null,
          bestCandidateRoom: scrollerInfo.bestCandidateRoom
        }
      };
    } else {
      checks.scrollerMarkerParity = {
        status: 'pass',
        details: {
          markerPresent: !!scrollerInfo.marker,
          selectedSource: scrollerInfo.source
        }
      };
    }

    if (!scroller) {
      console.log({ passAll: false, mode: 'error', checks });
      return;
    }

    if (lockState.known && !lockState.enabled) {
      checks.programmaticDownScrollBlocked = { status: 'skip', details: { reason: 'quicknav scroll lock is disabled', source: lockState.source } };
      checks.allowWindowAfterQuicknavNav = { status: 'skip', details: { reason: 'lock disabled' } };
      checks.routeSwitchKeepsLock = { status: 'skip', details: { reason: 'lock disabled' } };
      const passAll = Object.values(checks).every((check) => check.status !== 'fail');
      console.log({ passAll, mode: 'skip-lock-disabled', checks });
      return;
    }

    const preAllow = await waitForAllowWindowToSettle();
    if (preAllow.stillActive) {
      checks.programmaticDownScrollBlocked = {
        status: 'skip',
        details: { reason: 'temporary allow window is active; rerun after it expires', allowUntil: preAllow.until, waitedMs: preAllow.waitedMs }
      };
      checks.allowWindowAfterQuicknavNav = {
        status: 'skip',
        details: { reason: 'allow window already active before test', allowUntil: preAllow.until, waitedMs: preAllow.waitedMs }
      };
      checks.routeSwitchKeepsLock = { status: 'skip', details: { reason: 'allow window active' } };
      const passAll = Object.values(checks).every((check) => check.status !== 'fail');
      console.log({ passAll, mode: 'skip-allow-window', checks });
      return;
    }

    Object.assign(checks, await runProgrammaticDownBlockCheck(scroller, 'programmaticDownScrollBlocked'));

    const nextBtn = document.getElementById('cgpt-nav-next');
    if (!nextBtn) {
      checks.allowWindowAfterQuicknavNav = { status: 'skip', details: { reason: '#cgpt-nav-next not found' } };
      checks.lockResumesAfterAllowWindow = { status: 'skip', details: { reason: '#cgpt-nav-next not found' } };
    } else {
      const beforeUntil = finiteNumber(((document.documentElement && document.documentElement.dataset) || {}).quicknavAllowScrollUntil) || 0;
      nextBtn.click();
      await sleep(40);
      const afterUntil = finiteNumber(((document.documentElement && document.documentElement.dataset) || {}).quicknavAllowScrollUntil);
      const allowOpened = afterUntil != null && afterUntil > Date.now() + 40 && afterUntil >= beforeUntil;
      checks.allowWindowAfterQuicknavNav = {
        status: allowOpened ? 'pass' : 'fail',
        details: { beforeUntil, afterUntil, now: Date.now() }
      };

      if (!allowOpened) {
        checks.lockResumesAfterAllowWindow = { status: 'skip', details: { reason: 'allow window did not open' } };
      } else {
        await sleep(Math.min(1800, Math.max(120, afterUntil - Date.now() + 40)));
        Object.assign(checks, await runProgrammaticDownBlockCheck(scroller, 'lockResumesAfterAllowWindow'));
      }
    }

    const beforeRouteLock = detectLockState();
    const candidate = findSidebarRouteCandidate();
    if (!candidate) {
      checks.routeSwitchKeepsLock = { status: 'skip', details: { reason: 'no sidebar route candidate found' } };
    } else {
      const fromHref = location.href;
      candidate.link.click();
      const start = Date.now();
      let changed = false;
      while (Date.now() - start < MAX_ROUTE_WAIT_MS) {
        await sleep(120);
        if (location.href !== fromHref) {
          changed = true;
          break;
        }
      }
      await settle();
      const afterRouteLock = detectLockState();
      const keepLock =
        changed &&
        beforeRouteLock.known &&
        afterRouteLock.known &&
        beforeRouteLock.enabled === afterRouteLock.enabled;
      checks.routeSwitchKeepsLock = {
        status: keepLock ? 'pass' : (changed ? 'fail' : 'skip'),
        details: {
          changed,
          fromHref,
          toHref: location.href,
          candidateText: candidate.text,
          beforeRouteLock,
          afterRouteLock
        }
      };
    }

    const passAll = Object.values(checks).every((check) => check.status !== 'fail');
    console.log({ passAll, mode: 'active-lock-check', checks });
  };

  run().catch((error) => {
    console.log({
      passAll: false,
      mode: 'error',
      checks: {
        runtime: {
          status: 'fail',
          details: { message: error && error.message ? String(error.message) : String(error) }
        }
      }
    });
  });
})();
