// ChatGPT scroll-lock smoke test (dev-only)
//
// Usage:
// - Open https://chatgpt.com/ in Chrome
// - Open DevTools Console
// - Paste this entire file and run it
//
// It checks:
// 1) Lock toggle does not "jump back" to an old scrollTop after enabling.
// 2) QuickNav next jump changes scrollTop and remains stable for ~1.6s.
// 3) Clicking a visible "Copy code" button does not change scrollTop.

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
    const seed =
      document.querySelector('[data-testid="conversation-turns"]') ||
      document.querySelector('main') ||
      document.body;
    let el = seed;
    while (el && el !== document.documentElement) {
      if (okScrollableY(el)) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  const findLockBtn = () => document.querySelector('#cgpt-compact-nav .compact-lock');
  const findNextBtn = () => document.getElementById('cgpt-nav-next');
  const findSendBtn = () =>
    document.querySelector(
      'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"], button[aria-label*="发送"], form button[type="submit"]'
    );

  const findVisibleCodeCopyBtn = () => {
    const btns = Array.from(document.querySelectorAll('button[aria-label="Copy"], button[title="Copy"], button[data-testid*="copy"]'));
    for (const b of btns) {
      try {
        if (!b.closest('pre')) continue;
        const r = b.getBoundingClientRect();
        const vis = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < (window.innerHeight || 0);
        if (!vis) continue;
        return b;
      } catch {}
    }
    return null;
  };

  const sc = findChatScroller();
  const lock = findLockBtn();
  const next = findNextBtn();

  if (!lock) throw new Error('QuickNav lock button not found (#cgpt-compact-nav .compact-lock)');
  if (!next) throw new Error('QuickNav next button not found (#cgpt-nav-next)');

  const getTop = () => Math.round(sc.scrollTop || 0);
  const setTop = (v) => { try { sc.scrollTop = v; } catch {} };

  const report = [];
  const push = (name, pass, details) => report.push({ name, pass: !!pass, details: details || null });

  // === 1) Lock toggle should not jump back ===
  // Ensure unlocked for manual positioning.
  if (lock.classList.contains('active')) {
    lock.click();
    await sleep(120);
  }

  const desiredTop = Math.max(0, Math.min((sc.scrollHeight || 0) - (sc.clientHeight || 0) - 1, 8000));
  setTop(desiredTop);
  await sleep(120);
  const beforeLockTop = getTop();

  lock.click(); // enable lock
  await sleep(220);
  const afterLockTop = getTop();

  // Allow a bit of drift because the page can reflow; we only care about big jump-backs.
  push('LockOnNoJumpBack', Math.abs(afterLockTop - beforeLockTop) <= 8, { beforeLockTop, afterLockTop });

  // === 2) Next jump should move, then stay stable ===
  // Sample scrollTop for ~1.6s after jump.
  const samples = [];
  const t0 = performance.now();
  const sample = () => samples.push([Math.round(performance.now() - t0), getTop()]);

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  sample();
  next.click();
  const endAt = t0 + 1600;
  while (performance.now() < endAt) {
    await new Promise((r) => requestAnimationFrame(r));
    sample();
  }

  const moved = samples.length >= 2 && samples[samples.length - 1][1] !== samples[0][1];
  // Stability: after initial move, the tail shouldn't oscillate (rough heuristic).
  const tail = samples.slice(-30).map((x) => x[1]);
  const tailMin = Math.min(...tail);
  const tailMax = Math.max(...tail);
  push('NavNextMoves', moved, { from: samples[0]?.[1], to: samples[samples.length - 1]?.[1] });
  push('NavNextStableTail', (tailMax - tailMin) <= 6, { tailMin, tailMax });

  // === 3) Code-block Copy should not change scrollTop ===
  const copyBtn = findVisibleCodeCopyBtn();
  if (!copyBtn) {
    push('CopyCodeScrollStable', false, { reason: 'no visible code copy button found in viewport' });
  } else {
    const beforeCopyTop = getTop();
    copyBtn.click();
    // Wait for the "Copied" UI to appear/disappear.
    await sleep(800);
    const afterCopyTop = getTop();
    push('CopyCodeScrollStable', Math.abs(afterCopyTop - beforeCopyTop) <= 2, { beforeCopyTop, afterCopyTop });
  }

  const sendBtn = findSendBtn();
  if (!sendBtn) {
    push('SendClickLockedStable', false, { reason: 'send button not found' });
  } else if (sendBtn.disabled || sendBtn.getAttribute('aria-disabled') === 'true') {
    push('SendClickLockedStable', false, { reason: 'send button disabled; type a draft message first, then rerun' });
  } else {
    const scrollMaxTop = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0) - 1);
    const sendProbeTop = Math.max(0, Math.min(scrollMaxTop, Math.round(scrollMaxTop * 0.55)));
    setTop(sendProbeTop);
    await sleep(120);

    const SEND_JUMP_THRESHOLD = 8;
    const sendBaseTop = getTop();
    const sendSamples = [];
    const sendT0 = performance.now();
    const sampleSend = () => sendSamples.push([Math.round(performance.now() - sendT0), getTop()]);

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    sampleSend();

    try {
      sendBtn.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          composed: true,
          button: 0,
          buttons: 1,
          pointerType: 'mouse',
          isPrimary: true
        })
      );
    } catch {}
    sendBtn.click();

    const sendEndAt = sendT0 + 1400;
    while (performance.now() < sendEndAt) {
      await new Promise((r) => requestAnimationFrame(r));
      sampleSend();
    }

    const sendTops = sendSamples.map((x) => x[1]);
    const sendMinTop = Math.min(...sendTops);
    const sendMaxTop = Math.max(...sendTops);
    const sendMaxDelta = Math.max(Math.abs(sendMaxTop - sendBaseTop), Math.abs(sendBaseTop - sendMinTop));
    push('SendClickLockedStable', sendMaxDelta <= SEND_JUMP_THRESHOLD, {
      sendBaseTop,
      sendMinTop,
      sendMaxTop,
      sendMaxDelta,
      threshold: SEND_JUMP_THRESHOLD
    });
  }

  // Print report
  const passAll = report.every((r) => r.pass);
  console.groupCollapsed(`[AI Shortcuts Dev] ChatGPT scroll-lock smoke: ${passAll ? 'PASS' : 'FAIL'}`);
  for (const r of report) console.log(`${r.pass ? 'PASS' : 'FAIL'} - ${r.name}`, r.details || '');
  if (!passAll) console.log('NavNext samples:', samples);
  console.groupEnd();

  return { passAll, report, samples };
})();
