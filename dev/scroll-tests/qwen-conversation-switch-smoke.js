(async () => {
  'use strict';

  const config = Object.freeze({
    switchIntentTimeoutMs: 30000,
    readyTimeoutMs: 45000,
    sampleIntervalMs: 250,
    countdownStepMs: 1000,
    sustainedBadMs: 1500,
    ellipsisText: '...',
    ellipsisRatioThreshold: 0.65,
    navListSelector: '#cgpt-compact-nav .compact-list',
    itemSelector: '.compact-item',
    textSelector: '.compact-text, .pin-label',
    logPrefix: '[AI Shortcuts Dev][Qwen Switch Smoke]'
  });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nowMs = () => Date.now();
  const normalize = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const truncate = (v, max = 80) => (v.length <= max ? v : `${v.slice(0, Math.max(0, max - 3))}...`);
  const safeStringify = (v) => {
    try {
      return JSON.stringify(v);
    } catch (err) {
      return `[unserializable:${String((err && err.message) || err)}]`;
    }
  };
  const roleOf = (node) => {
    if (!node || !node.classList) return 'unknown';
    if (node.classList.contains('user')) return 'user';
    if (node.classList.contains('assistant')) return 'assistant';
    if (node.classList.contains('pin')) return 'pin';
    return 'unknown';
  };

  const readSnapshot = () => {
    const list = document.querySelector(config.navListSelector);
    if (!list) {
      return {
        ok: false,
        error: `QuickNav list not found (${config.navListSelector})`
      };
    }

    const nodes = Array.from(list.querySelectorAll(config.itemSelector));
    const items = nodes.map((node, idx) => {
      const textEl = node.querySelector(config.textSelector);
      return {
        idx,
        role: roleOf(node),
        id: normalize(node.dataset && node.dataset.id),
        key: normalize(node.dataset && node.dataset.key),
        text: normalize(textEl ? textEl.textContent : '')
      };
    });

    const emptyText = !items.length ? normalize(list.textContent) : '';
    const signature = items.length
      ? items.map((it) => `${it.idx}|${it.role}|${it.id}|${it.key}|${it.text}`).join('\n')
      : `EMPTY|${emptyText}`;

    return {
      ok: true,
      capturedAt: nowMs(),
      itemCount: items.length,
      emptyText,
      items,
      signature
    };
  };

  const readSwitchMarker = () => {
    let navEntryKey = '';
    try {
      const navigationApi = typeof Reflect !== 'undefined' && window ? Reflect.get(window, 'navigation') : null;
      navEntryKey = normalize(navigationApi && navigationApi.currentEntry && navigationApi.currentEntry.key);
    } catch (_) {
      navEntryKey = '';
    }

    return {
      href: normalize(location.href),
      title: normalize(document.title),
      historyStateKey: normalize(safeStringify(window.history && window.history.state)),
      navEntryKey
    };
  };

  let clickIntent = null;
  document.addEventListener(
    'click',
    (event) => {
      if (!event || !event.isTrusted) return;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      const chatItem = path.find(
        (node) =>
          node &&
          node.nodeType === 1 &&
          typeof node.matches === 'function' &&
          node.matches('a[aria-label="chat-item"]')
      );
      if (!chatItem) return;
      clickIntent = {
        atMs: nowMs(),
        text: truncate(normalize(chatItem.textContent || ''), 120)
      };
    },
    true
  );

  const detectSwitchIntent = (baseline, current) => {
    if (!baseline || !current) return { changed: false };

    if (current.href && baseline.href && current.href !== baseline.href) {
      return {
        changed: true,
        reason: 'href-changed',
        from: baseline.href,
        to: current.href
      };
    }

    if (current.navEntryKey && baseline.navEntryKey && current.navEntryKey !== baseline.navEntryKey) {
      return {
        changed: true,
        reason: 'navigation-entry-changed',
        from: baseline.navEntryKey,
        to: current.navEntryKey
      };
    }

    if (current.historyStateKey && baseline.historyStateKey && current.historyStateKey !== baseline.historyStateKey) {
      return {
        changed: true,
        reason: 'history-state-changed',
        from: baseline.historyStateKey,
        to: current.historyStateKey
      };
    }

    if (current.title && baseline.title && current.title !== baseline.title) {
      return {
        changed: true,
        reason: 'title-changed',
        from: baseline.title,
        to: current.title
      };
    }

    return { changed: false };
  };

  const evaluateHealth = (snap) => {
    const ellipsisCount = snap.items.reduce(
      (count, it) => count + (it.text === config.ellipsisText ? 1 : 0),
      0
    );
    const ellipsisRatio = snap.itemCount > 0 ? ellipsisCount / snap.itemCount : 0;
    const isEmpty = snap.itemCount === 0;
    const isEllipsisFlood = snap.itemCount > 0 && ellipsisRatio >= config.ellipsisRatioThreshold;

    return {
      itemCount: snap.itemCount,
      ellipsisCount,
      ellipsisRatio,
      isEmpty,
      isEllipsisFlood,
      bad: isEmpty || isEllipsisFlood
    };
  };

  const healthBrief = (health) => {
    if (!health) return null;
    return {
      itemCount: health.itemCount,
      ellipsisCount: health.ellipsisCount,
      ellipsisRatio: Number(health.ellipsisRatio.toFixed(3)),
      isEmpty: health.isEmpty,
      isEllipsisFlood: health.isEllipsisFlood
    };
  };

  const snapshotBrief = (snap) => {
    if (!snap || !snap.ok) return { ok: false, error: snap && snap.error ? snap.error : 'unknown' };
    const first = snap.items[0] || null;
    const last = snap.items[snap.items.length - 1] || null;
    return {
      ok: true,
      itemCount: snap.itemCount,
      firstId: first ? first.id : '',
      firstText: first ? truncate(first.text) : '',
      lastId: last ? last.id : '',
      lastText: last ? truncate(last.text) : '',
      emptyText: snap.emptyText || ''
    };
  };

  const compareBrief = (fromSnap, toSnap) => ({
    from: snapshotBrief(fromSnap),
    to: snapshotBrief(toSnap)
  });

  const waitForSwitchIntent = async (baselineMarker, baselineSignature, totalMs) => {
    const startedAt = nowMs();
    let nextCountdownAt = startedAt;
    clickIntent = null;

    while (true) {
      const loopNow = nowMs();
      const elapsedMs = loopNow - startedAt;
      if (elapsedMs >= totalMs) {
        return { ok: true, detected: false, elapsedMs: totalMs, signal: null, marker: null };
      }

      if (loopNow >= nextCountdownAt) {
        const leftSec = Math.ceil(Math.max(0, totalMs - elapsedMs) / 1000);
        console.info(`${config.logPrefix} wait-switch-intent countdown: ${leftSec}s`);
        nextCountdownAt += config.countdownStepMs;
      }

      if (clickIntent) {
        const marker = readSwitchMarker();
        return {
          ok: true,
          detected: true,
          reason: 'chat-item-click',
          elapsedMs: nowMs() - startedAt,
          signal: {
            changed: true,
            reason: 'chat-item-click',
            clickIntent
          },
          marker
        };
      }

      const marker = readSwitchMarker();
      const signal = detectSwitchIntent(baselineMarker, marker);
      if (signal.changed) {
        return {
          ok: true,
          detected: true,
          elapsedMs: nowMs() - startedAt,
          signal,
          marker
        };
      }

      const snap = readSnapshot();
      if (!snap.ok) {
        return {
          ok: false,
          detected: false,
          elapsedMs: nowMs() - startedAt,
          signal: null,
          marker: null,
          snapshot: null,
          error: snap.error
        };
      }
      if (snap.signature !== baselineSignature) {
        return {
          ok: true,
          detected: true,
          elapsedMs: nowMs() - startedAt,
          signal: {
            changed: true,
            reason: 'quicknav-signature-changed'
          },
          marker,
          snapshot: snap
        };
      }

      await sleep(config.sampleIntervalMs);
    }
  };

  const waitForSignatureChangeWithHealth = async (baselineSignature, totalMs, label) => {
    const startedAt = nowMs();
    let nextCountdownAt = startedAt;
    let badSinceMs = null;
    let maxBadStreakMs = 0;
    let sampleCount = 0;
    let unhealthySampleCount = 0;
    let lastHealth = null;

    while (true) {
      const loopNow = nowMs();
      const elapsedMs = loopNow - startedAt;
      if (elapsedMs >= totalMs) {
        return {
          ok: true,
          changed: false,
          elapsedMs: totalMs,
          snapshot: null,
          healthSummary: {
            sampleCount,
            unhealthySampleCount,
            maxBadStreakMs
          }
        };
      }

      if (loopNow >= nextCountdownAt) {
        const leftSec = Math.ceil(Math.max(0, totalMs - elapsedMs) / 1000);
        console.info(`${config.logPrefix} ${label} countdown: ${leftSec}s`);
        nextCountdownAt += config.countdownStepMs;
      }

      const snap = readSnapshot();
      if (!snap.ok) {
        return {
          ok: false,
          error: snap.error,
          elapsedMs: nowMs() - startedAt,
          snapshot: null,
          healthSummary: {
            sampleCount,
            unhealthySampleCount,
            maxBadStreakMs
          }
        };
      }

      sampleCount += 1;
      const health = evaluateHealth(snap);
      lastHealth = health;

      if (health.bad) {
        unhealthySampleCount += 1;
        if (badSinceMs === null) badSinceMs = snap.capturedAt;
        const badForMs = Math.max(0, snap.capturedAt - badSinceMs);
        maxBadStreakMs = Math.max(maxBadStreakMs, badForMs);

        if (badForMs >= config.sustainedBadMs) {
          return {
            ok: false,
            error: 'QuickNav list unhealthy for sustained period',
            reason: 'sustained-unhealthy',
            elapsedMs: nowMs() - startedAt,
            snapshot: snap,
            health,
            healthSummary: {
              sampleCount,
              unhealthySampleCount,
              maxBadStreakMs
            }
          };
        }
      } else {
        badSinceMs = null;
      }

      if (snap.signature !== baselineSignature) {
        return {
          ok: true,
          changed: true,
          elapsedMs: nowMs() - startedAt,
          snapshot: snap,
          health: lastHealth,
          healthSummary: {
            sampleCount,
            unhealthySampleCount,
            maxBadStreakMs
          }
        };
      }

      await sleep(config.sampleIntervalMs);
    }
  };

  const report = [];
  const push = (name, pass, details) => report.push({ name, pass: !!pass, details: details || null });
  const finalize = (extra) => {
    const passAll = report.every((r) => r.pass);
    const result = {
      passAll,
      report,
      config: {
        switchIntentTimeoutMs: config.switchIntentTimeoutMs,
        readyTimeoutMs: config.readyTimeoutMs,
        sampleIntervalMs: config.sampleIntervalMs,
        sustainedBadMs: config.sustainedBadMs,
        ellipsisRatioThreshold: config.ellipsisRatioThreshold
      },
      ...extra
    };

    console.groupCollapsed(`${config.logPrefix}: ${passAll ? 'PASS' : 'FAIL'}`);
    for (const row of report) {
      console.log(`${row.pass ? 'PASS' : 'FAIL'} - ${row.name}`, row.details || '');
    }
    console.log('result:', result);
    console.groupEnd();
    return result;
  };

  try {
    const baseline = readSnapshot();
    if (!baseline.ok) {
      push('QuickNavListFound', false, { reason: baseline.error });
      push('SwitchIntentDetected', false, { reason: 'cannot capture baseline' });
      push('ListHealthyDuringSwapWait', false, { reason: 'cannot capture baseline' });
      push('SignatureChangedAfterSwitchIntent', false, { reason: 'cannot capture baseline' });
      return finalize({ baseline: snapshotBrief(baseline), switchIntent: null, firstChange: null });
    }

    const baselineMarker = readSwitchMarker();
    push('QuickNavListFound', true, snapshotBrief(baseline));
    console.info(`${config.logPrefix} Baseline captured`, snapshotBrief(baseline));
    console.warn(`${config.logPrefix} ACTION: switch conversation now.`);

    const switchIntent = await waitForSwitchIntent(
      baselineMarker,
      baseline.signature,
      config.switchIntentTimeoutMs
    );
    if (!switchIntent.ok) {
      push('SwitchIntentDetected', false, {
        reason: switchIntent.error || 'switch-intent monitor failed',
        atMs: switchIntent.elapsedMs
      });
      push('ListHealthyDuringSwapWait', false, { reason: 'switch-intent monitor failed' });
      push('SignatureChangedAfterSwitchIntent', false, { reason: 'switch-intent monitor failed' });
      return finalize({ baseline: snapshotBrief(baseline), switchIntent: null, firstChange: null });
    }

    if (!switchIntent.detected) {
      push('SwitchIntentDetected', false, {
        reason: 'timeout waiting for switch intent signal',
        timeoutMs: config.switchIntentTimeoutMs
      });
      push('ListHealthyDuringSwapWait', false, {
        reason: 'did not enter swap wait because no switch intent signal'
      });
      push('SignatureChangedAfterSwitchIntent', false, { reason: 'no switch intent signal' });
      return finalize({
        baseline: snapshotBrief(baseline),
        switchIntent: null,
        firstChange: null
      });
    }

    push('SwitchIntentDetected', true, {
      atMs: switchIntent.elapsedMs,
      signal: switchIntent.signal
    });
    console.warn(`${config.logPrefix} Switch intent detected. Waiting for QuickNav list swap...`);

    const ready = await waitForSignatureChangeWithHealth(baseline.signature, config.readyTimeoutMs, 'swap-wait');
    if (!ready.ok) {
      push('ListHealthyDuringSwapWait', false, {
        reason: ready.error,
        atMs: ready.elapsedMs,
        health: healthBrief(ready.health),
        healthSummary: ready.healthSummary || null
      });
      push('SignatureChangedAfterSwitchIntent', false, {
        reason: 'phase-b monitor failed before signature changed',
        atMs: ready.elapsedMs
      });
      return finalize({ baseline: snapshotBrief(baseline), switchIntent, firstChange: null });
    }

    if (!ready.changed) {
      push('ListHealthyDuringSwapWait', true, ready.healthSummary || null);
      push('SignatureChangedAfterSwitchIntent', false, {
        reason: 'timeout waiting for QuickNav signature change',
        timeoutMs: config.readyTimeoutMs
      });
      return finalize({ baseline: snapshotBrief(baseline), switchIntent, firstChange: null });
    }

    push('ListHealthyDuringSwapWait', true, ready.healthSummary || null);
    push('SignatureChangedAfterSwitchIntent', true, {
      firstChangeAfterSwitchIntentMs: ready.elapsedMs,
      ...compareBrief(baseline, ready.snapshot)
    });

    return finalize({
      baseline: snapshotBrief(baseline),
      switchIntent,
      firstChange: {
        atMsAfterSwitchIntent: ready.elapsedMs,
        brief: snapshotBrief(ready.snapshot)
      },
      healthAtFirstChange: healthBrief(ready.health)
    });
  } catch (err) {
    push('ScriptRuntime', false, {
      error: String((err && err.stack) || err)
    });
    return finalize({ baseline: null, switchIntent: null, firstChange: null });
  }
})();
