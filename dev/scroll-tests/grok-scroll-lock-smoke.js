// Grok scroll-lock smoke test (dev-only)
//
// Usage:
// - Open https://grok.com/c/... in Chrome (a conversation page, not the landing page)
// - Open DevTools Console
// - Paste this entire file and run it
//
// It checks:
// 1) Lock toggle does not "jump back" after enabling.
// 2) While locked, sending (or triggering UI changes) should not force-scroll.
//    (We only validate scrollTop stability around scripted actions.)

(async () => {
  'use strict';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const okScrollableY = (n) => {
    try {
      const cs = getComputedStyle(n);
      const oy = cs && cs.overflowY;
      if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
      return (n.scrollHeight || 0) > (n.clientHeight || 0) + 10;
    } catch {
      return false;
    }
  };

  const findChatScroller = () => {
    // Grok conversation messages often have ids like "response-<uuid>".
    const seed = document.querySelector('[id^="response-"]') || document.querySelector('main') || document.body;
    let el = seed;
    while (el && el !== document.documentElement) {
      if (okScrollableY(el)) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  const findLockBtn = () => document.querySelector('#cgpt-compact-nav .compact-lock');

  const sc = findChatScroller();
  const lock = findLockBtn();
  if (!lock) throw new Error('QuickNav lock button not found (#cgpt-compact-nav .compact-lock)');

  const getTop = () => Math.round(sc.scrollTop || 0);
  const setTop = (v) => { try { sc.scrollTop = v; } catch {} };

  const report = [];
  const push = (name, pass, details) => report.push({ name, pass: !!pass, details: details || null });

  // Ensure unlocked for manual positioning.
  if (lock.classList.contains('active')) {
    lock.click();
    await sleep(150);
  }

  const desiredTop = Math.max(0, Math.min((sc.scrollHeight || 0) - (sc.clientHeight || 0) - 1, 120));
  setTop(desiredTop);
  await sleep(150);
  const beforeLockTop = getTop();

  lock.click(); // enable lock
  await sleep(250);
  const afterLockTop = getTop();
  push('LockOnNoJumpBack', Math.abs(afterLockTop - beforeLockTop) <= 8, { beforeLockTop, afterLockTop });

  // Try to trigger a few common UI updates without user input:
  // - Clicking "Copy" on a visible message
  // - Clicking "More actions" / "Like" buttons if present
  const clickIf = async (sel, label) => {
    const el = document.querySelector(sel);
    if (!el) return push(label, true, { skipped: true });
    const before = getTop();
    try { el.click(); } catch {}
    await sleep(250);
    const after = getTop();
    push(label, Math.abs(after - before) <= 2, { before, after });
  };

  await clickIf('button[aria-label="Copy"]', 'ClickCopyNoScroll');
  await clickIf('button[aria-label="More actions"]', 'ClickMoreActionsNoScroll');
  await clickIf('button[aria-label="Like"]', 'ClickLikeNoScroll');

  const passAll = report.every((r) => r.pass);
  console.groupCollapsed(`[QuickNav Dev] Grok scroll-lock smoke: ${passAll ? 'PASS' : 'FAIL'}`);
  for (const r of report) console.log(`${r.pass ? 'PASS' : 'FAIL'} - ${r.name}`, r.details || '');
  console.groupEnd();

  return { passAll, report };
})();

