// Grok scroll-lock smoke test (dev-only)
//
// Usage:
// - Open https://grok.com/c/... in Chrome (conversation page)
// - Open DevTools Console
// - Paste this entire file and run it
//
// Checks:
// 1) lock signal parity (button state vs dataset)
// 2) AISHORTCUTS_SCROLLLOCK_STATE bridge envelope includes channel/v/nonce and can be observed on toggle
// 3) while locked, programmatic downward scroll is blocked
// 4) (best-effort) route switch keeps lock state

(async () => {
  'use strict';

  const LOCK_DRIFT_PX = 16;
  const LOCK_TOLERANCE_PX = 2.5;
  const MIN_SCROLL_ROOM_PX = 28;
  const SETTLE_MS = 140;
  const ROUTE_WAIT_MS = 5000;

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

  const pickBestScrollable = (candidates) => {
    let best = null;
    let bestRoom = -1;
    const seen = new Set();
    for (const candidate of candidates || []) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      if (!isScrollableY(candidate)) continue;
      const room = Math.max(0, (candidate.scrollHeight || 0) - (candidate.clientHeight || 0));
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
      document.querySelector('#last-reply-container'),
      document.querySelector('[id^="response-"]'),
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
    if (marker && isScrollableY(marker)) {
      return {
        el: marker,
        source: marker === best.el ? 'quicknav-marker' : 'quicknav-marker-preferred',
        marker,
        bestCandidateRoom: best.room
      };
    }

    if (best.el) {
      return {
        el: best.el,
        source: marker ? 'fallback-best-scrollable-with-marker-miss' : 'fallback-best-scrollable',
        marker,
        bestCandidateRoom: best.room
      };
    }

    return {
      el: marker || document.scrollingElement || document.documentElement,
      source: marker ? 'marker-no-scroll-room' : 'fallback-document-scroller',
      marker,
      bestCandidateRoom: best.room
    };
  };

  const getLockBtn = () => document.querySelector('#cgpt-compact-nav .compact-lock');

  const detectLockState = () => {
    const dataset = (document.documentElement && document.documentElement.dataset) || {};
    const datasetRaw = dataset.quicknavScrollLockEnabled;
    const datasetEnabled = boolFromUnknown(datasetRaw);

    const lockBtn = getLockBtn();
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

  const captureBridgeStateSignalsByToggle = async () => {
    const nonce = String(document.documentElement?.dataset?.quicknavBridgeNonceV1 || '').trim();
    if (!nonce) {
      return {
        status: 'fail',
        details: { reason: 'dataset.quicknavBridgeNonceV1 is missing' }
      };
    }

    const lockBtn = getLockBtn();
    if (!lockBtn) {
      return {
        status: 'fail',
        details: { reason: 'lock button missing during bridge capture' }
      };
    }

    const received = [];
    const onMessage = (event) => {
      try {
        if (!event || event.source !== window) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.__quicknav !== 1) return;
        if (data.type !== 'AISHORTCUTS_SCROLLLOCK_STATE') return;
        if (data.channel !== 'quicknav' || data.v !== 1 || data.nonce !== nonce) return;
        received.push({ enabled: !!data.enabled, ts: Date.now() });
      } catch {}
    };

    const before = detectLockState();

    window.addEventListener('message', onMessage, true);
    try {
      lockBtn.click();
      await settle();
      lockBtn.click();
      await settle();
    } finally {
      window.removeEventListener('message', onMessage, true);
    }

    const after = detectLockState();
    const restored = before.known && after.known ? before.enabled === after.enabled : null;

    if (received.length < 2) {
      return {
        status: 'fail',
        details: { reason: 'insufficient AISHORTCUTS_SCROLLLOCK_STATE messages captured', nonce, received, restored }
      };
    }

    return {
      status: 'pass',
      details: {
        nonce,
        capturedCount: received.length,
        received,
        restored
      }
    };
  };

  const findSidebarRouteCandidate = () => {
    const hrefNow = location.href;
    const current = new URL(hrefNow);
    const links = Array.from(
      document.querySelectorAll(
        'aside a[href], nav a[href], [data-testid*="history" i] a[href], [class*="sidebar" i] a[href], a[href*="/c/"]'
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
      if (!/\/c(?:\/|$)/.test(targetUrl.pathname)) continue;
      const text = (link.textContent || '').trim();
      if (!text) continue;
      return { link, href: targetUrl.href, text: text.slice(0, 80) };
    }

    return null;
  };

  const waitForHrefChange = async (fromHref, timeoutMs) => {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
      if (location.href !== fromHref) return true;
      await sleep(120);
    }
    return false;
  };

  const checks = {};
  let initialKnown = false;
  let initialEnabled = null;

  try {
    const lockState = detectLockState();
    initialKnown = lockState.known;
    initialEnabled = lockState.enabled;

    checks.lockStateDetected = lockState.known
      ? { status: lockState.conflict ? 'fail' : 'pass', details: lockState }
      : { status: 'fail', details: lockState };

    const scrollerInfo = findScroller();
    const scroller = scrollerInfo.el;
    checks.scrollerDetected = scroller
      ? {
          status: 'pass',
          details: {
            source: scrollerInfo.source,
            tagName: String(scroller.tagName || '').toLowerCase() || 'unknown'
          }
        }
      : {
          status: 'fail',
          details: { source: scrollerInfo.source }
        };

    if (!scroller) {
      const passAll = Object.values(checks).every((check) => check.status !== 'fail');
      console.log({ passAll, mode: 'error-no-scroller', checks });
      return;
    }

    const lockBtn = getLockBtn();
    if (!lockBtn) {
      checks.lockButtonPresent = { status: 'fail', details: { reason: 'QuickNav lock button not found' } };
      const passAll = Object.values(checks).every((check) => check.status !== 'fail');
      console.log({ passAll, mode: 'error-no-lock-button', checks });
      return;
    }

    checks.lockButtonPresent = { status: 'pass', details: { selector: '#cgpt-compact-nav .compact-lock' } };

    if (!lockState.known || !lockState.enabled) {
      lockBtn.click();
      await settle();
    }

    const enabledState = detectLockState();
    checks.lockEnabledForChecks = enabledState.known && enabledState.enabled
      ? { status: 'pass', details: enabledState }
      : { status: 'fail', details: enabledState };

    checks.bridgeStateEnvelope = await captureBridgeStateSignalsByToggle();

    const allowWindow = await waitForAllowWindowToSettle();
    if (allowWindow.stillActive) {
      checks.programmaticDownScrollBlocked = {
        status: 'skip',
        details: {
          reason: 'temporary allow window is active; rerun after it expires',
          allowUntil: allowWindow.until,
          waitedMs: allowWindow.waitedMs
        }
      };
    } else {
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
        checks.programmaticDownScrollBlocked = {
          status: 'skip',
          details: {
            reason: 'not enough downward scroll room to run smoke check',
            startTop,
            maxTop,
            room
          }
        };
      } else {
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

        checks.programmaticDownScrollBlocked = {
          status: blocked ? 'pass' : 'fail',
          details: {
            startTop,
            maxObservedTop,
            totalDownward,
            allowedDownward,
            attemptDelta,
            attempts
          }
        };
      }
    }

    const routeCandidate = findSidebarRouteCandidate();
    if (!routeCandidate) {
      checks.routeSwitchKeepsLockState = {
        status: 'skip',
        details: { reason: 'no sidebar conversation link found for route smoke check' }
      };
    } else {
      const beforeRouteState = detectLockState();
      const fromHref = location.href;

      routeCandidate.link.click();
      const changed = await waitForHrefChange(fromHref, ROUTE_WAIT_MS);
      if (!changed) {
        checks.routeSwitchKeepsLockState = {
          status: 'skip',
          details: {
            reason: 'route did not change within timeout',
            targetHref: routeCandidate.href,
            timeoutMs: ROUTE_WAIT_MS
          }
        };
      } else {
        await settle();
        const afterRouteState = detectLockState();
        if (beforeRouteState.known && afterRouteState.known) {
          checks.routeSwitchKeepsLockState = {
            status: beforeRouteState.enabled === afterRouteState.enabled ? 'pass' : 'fail',
            details: {
              targetHref: routeCandidate.href,
              before: beforeRouteState,
              after: afterRouteState,
              linkText: routeCandidate.text
            }
          };
        } else {
          checks.routeSwitchKeepsLockState = {
            status: 'skip',
            details: {
              reason: 'lock state not known before/after route switch',
              targetHref: routeCandidate.href,
              before: beforeRouteState,
              after: afterRouteState
            }
          };
        }
      }
    }

    const passAll = Object.values(checks).every((check) => check.status !== 'fail');
    console.log({ passAll, mode: 'grok-scroll-lock-smoke', checks });
    return { passAll, checks };
  } finally {
    try {
      const lockBtn = getLockBtn();
      if (lockBtn && initialKnown) {
        const current = detectLockState();
        if (current.known && current.enabled !== initialEnabled) {
          lockBtn.click();
          await settle();
        }
      }
    } catch {}
  }
})();
