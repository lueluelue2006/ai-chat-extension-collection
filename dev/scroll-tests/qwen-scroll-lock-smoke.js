(() => {
  'use strict';

  const LOCK_DRIFT_PX = 16;
  const LOCK_TOLERANCE_PX = 2.5;
  const MIN_SCROLL_ROOM_PX = 28;
  const SETTLE_MS = 140;

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

  const findScroller = () => {
    const marker = document.querySelector('[data-quicknav-scrolllock-scroller="1"]');
    if (marker) return { el: marker, source: 'quicknav-marker' };

    const main = document.querySelector('main');
    const roleMain = document.querySelector('[role="main"]');
    const seeds = [main, roleMain, document.scrollingElement, document.body, document.documentElement].filter(Boolean);

    for (const seed of seeds) {
      const scroller = findClosestScrollable(seed);
      if (scroller) return { el: scroller, source: 'fallback-closest-scrollable' };
    }

    return { el: document.scrollingElement || document.documentElement, source: 'fallback-document-scroller' };
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
      waitedMs = Math.min(1500, Math.max(0, firstRemaining + 20));
      await sleep(waitedMs);
    }

    const nextDataset = (document.documentElement && document.documentElement.dataset) || {};
    const nextUntil = finiteNumber(nextDataset.quicknavAllowScrollUntil);
    const stillActive = nextUntil != null && nextUntil - Date.now() > 50;

    return { waitedMs, stillActive, until: nextUntil };
  };

  const run = async () => {
    const checks = {};

    const lockState = detectLockState();
    checks.lockStateDetected = lockState.known
      ? { status: 'pass', details: lockState }
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
      console.log({ passAll: false, mode: 'error', checks });
      return;
    }

    if (lockState.known && !lockState.enabled) {
      checks.programmaticDownScrollBlocked = {
        status: 'skip',
        details: {
          reason: 'quicknav scroll lock is disabled',
          source: lockState.source
        }
      };
      const passAll = Object.values(checks).every((check) => check.status !== 'fail');
      console.log({ passAll, mode: 'skip-lock-disabled', checks });
      return;
    }

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
      const passAll = Object.values(checks).every((check) => check.status !== 'fail');
      console.log({ passAll, mode: 'skip-allow-window', checks });
      return;
    }

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
      const passAll = Object.values(checks).every((check) => check.status !== 'fail');
      console.log({ passAll, mode: 'skip-insufficient-room', checks });
      return;
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
          details: {
            message: error && error.message ? String(error.message) : String(error)
          }
        }
      }
    });
  });
})();
