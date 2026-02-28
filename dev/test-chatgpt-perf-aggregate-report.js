#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  EXIT_CODES,
  ExitError,
  asExitCode,
  parseArgs,
  formatHelp,
  ensureDir,
  readJson,
  writeJson,
  readCsv,
  writeCsv,
  readNdjson,
  sha256,
  quantile,
  mean,
  bootstrapDifference,
  permutationTest,
  iqrOutlierFilter,
  computeMissingRate,
  safeExit
} = require('./perf-ab/common');

const VERDICTS = Object.freeze(['PASS', 'FAIL', 'INVALID', 'INVALID_TIMEOUT']);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function parseRoundOrdinal(value, fallbackIndex) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const raw = String(value || '').trim();
  if (!raw) return fallbackIndex + 1;
  const match = raw.match(/(\d+)/);
  if (!match) return fallbackIndex + 1;
  return Number.parseInt(match[1], 10);
}

function parseSuccess(value) {
  if (typeof value === 'boolean') return value;
  const s = String(value || '').trim().toLowerCase();
  if (!s) return false;
  return s === '1' || s === 'true' || s === 'yes' || s === 'ok' || s === 'success';
}

function toEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;
  const num = Number(raw);
  if (Number.isFinite(num)) {
    if (num > 1000000000000) return num;
    if (num > 1000000000) return num * 1000;
    return num;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function walkFiles(dir, matcher) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [path.resolve(dir)];
  while (stack.length) {
    const cur = stack.pop();
    const ents = fs.readdirSync(cur, { withFileTypes: true });
    for (const ent of ents) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!matcher || matcher(ent.name, full)) out.push(full);
    }
  }
  out.sort();
  return out;
}

function parsePathIds(subRoot, filePath) {
  const rel = path.relative(path.resolve(subRoot), path.resolve(filePath));
  const parts = rel.split(path.sep);
  if (parts.length < 4) return { blockId: 'unknown-block', arm: 'X', attemptId: 'unknown-attempt' };
  return {
    blockId: String(parts[0] || 'unknown-block'),
    arm: String(parts[1] || 'X').toUpperCase(),
    attemptId: String(parts[2] || 'unknown-attempt')
  };
}

function attemptKey(blockId, arm, attemptId) {
  return `${blockId}::${arm}::${attemptId}`;
}

function computeGitHead(repoRoot) {
  try {
    return childProcess.execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
  } catch {
    return 'unknown';
  }
}

function applyWarmupByRounds(rows, warmupRounds, exclusions, runId, datasetName) {
  if (!warmupRounds || warmupRounds <= 0) return rows.slice();
  const grouped = new Map();
  for (const row of rows) {
    const key = attemptKey(row.block_id, row.arm, row.attempt_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const kept = [];
  for (const groupRows of grouped.values()) {
    groupRows.sort((a, b) => a.round_ord - b.round_ord);
    for (let i = 0; i < groupRows.length; i += 1) {
      const row = groupRows[i];
      if (i < warmupRounds) {
        exclusions.push({
          run_id: runId,
          block_id: row.block_id,
          arm: row.arm,
          attempt_id: row.attempt_id,
          round_id: row.round_id || '',
          reason: `warmup_${datasetName}`
        });
        continue;
      }
      kept.push(row);
    }
  }
  return kept;
}

function applyWarmupBySeconds(rows, warmupSeconds, exclusions, runId) {
  if (!warmupSeconds || warmupSeconds <= 0) return rows.slice();
  const grouped = new Map();
  for (const row of rows) {
    const key = attemptKey(row.block_id, row.arm, row.attempt_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const warmupMs = warmupSeconds * 1000;
  const kept = [];
  for (const groupRows of grouped.values()) {
    const start = groupRows.reduce((acc, row) => {
      if (!Number.isFinite(row.ts_ms)) return acc;
      if (!Number.isFinite(acc)) return row.ts_ms;
      return Math.min(acc, row.ts_ms);
    }, Number.NaN);
    for (const row of groupRows) {
      if (Number.isFinite(start) && Number.isFinite(row.ts_ms) && row.ts_ms - start < warmupMs) {
        exclusions.push({
          run_id: runId,
          block_id: row.block_id,
          arm: row.arm,
          attempt_id: row.attempt_id,
          round_id: row.round_id || '',
          reason: 'warmup_bench'
        });
        continue;
      }
      kept.push(row);
    }
  }
  return kept;
}

function madOutlierIndices(values, multiplier = 3) {
  const vals = values
    .map((n, idx) => ({ idx, value: Number(n) }))
    .filter((x) => Number.isFinite(x.value));
  if (vals.length < 4) return [];
  const data = vals.map((x) => x.value).sort((a, b) => a - b);
  const med = quantile(data, 0.5);
  const absDevs = data.map((v) => Math.abs(v - med));
  const mad = quantile(absDevs, 0.5);
  if (!Number.isFinite(mad) || mad === 0) return [];
  const sigma = mad * 1.4826;
  const low = med - multiplier * sigma;
  const high = med + multiplier * sigma;
  return vals.filter((x) => x.value < low || x.value > high).map((x) => x.idx);
}

function applyOutlierFilter(samples, outlierMethod, metricName, exclusions, runId) {
  const grouped = new Map();
  for (const s of samples) {
    if (!grouped.has(s.arm)) grouped.set(s.arm, []);
    grouped.get(s.arm).push(s);
  }
  const kept = [];
  for (const [arm, rows] of grouped.entries()) {
    const values = rows.map((row) => row.value);
    let outlierIdx = [];
    if (outlierMethod === 'iqr3') {
      outlierIdx = iqrOutlierFilter(values, { multiplier: 3 }).outlierIndices;
    } else if (outlierMethod === 'mad3') {
      outlierIdx = madOutlierIndices(values, 3);
    } else {
      throw new ExitError(EXIT_CODES.ARG_ERROR, `Unsupported outlier-method: ${outlierMethod}`);
    }
    const outlierSet = new Set(outlierIdx);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (outlierSet.has(i)) {
        exclusions.push({
          run_id: runId,
          block_id: row.block_id,
          arm,
          attempt_id: row.attempt_id,
          round_id: row.round_id || '',
          reason: `outlier_${outlierMethod}_${metricName}`
        });
        continue;
      }
      kept.push(row);
    }
  }
  return kept;
}

function valuesByArm(samples) {
  const out = { A: [], B: [] };
  for (const row of samples) {
    if (row.arm === 'A' || row.arm === 'B') out[row.arm].push(row.value);
  }
  return out;
}

function safeRatio(numer, denom) {
  if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom === 0) return Number.NaN;
  return numer / denom;
}

function computeMetric({
  id,
  unit,
  direction,
  samples,
  summaryFn,
  statFn,
  alpha,
  bootstrapResamples,
  permutationResamples,
  seed
}) {
  const byArm = valuesByArm(samples);
  const armA = Number(summaryFn(byArm.A));
  const armB = Number(summaryFn(byArm.B));
  const deltaAbs = armB - armA;
  const deltaPct = Number.isFinite(armA) && armA !== 0 ? (deltaAbs / armA) * 100 : Number.NaN;

  const bootstrap = bootstrapDifference(byArm.A, byArm.B, {
    alpha,
    resamples: bootstrapResamples,
    statFn,
    seed: `${seed}-boot-${id}`
  });
  const permutation = permutationTest(byArm.A, byArm.B, {
    resamples: permutationResamples,
    statFn,
    seed: `${seed}-perm-${id}`,
    tail: 'two-sided'
  });

  const ciLow = bootstrap.ciLow;
  const ciHigh = bootstrap.ciHigh;
  const pValue = permutation.pValue;
  const significant = Number.isFinite(pValue) && pValue < alpha && !(ciLow <= 0 && ciHigh >= 0);
  const improved = direction === 'higher_better' ? armB > armA : armB < armA;
  const regressed = direction === 'higher_better' ? armB < armA : armB > armA;

  return {
    summary: {
      metric: id,
      arm_a: armA,
      arm_b: armB,
      delta_abs: deltaAbs,
      delta_pct: deltaPct,
      unit
    },
    stats: {
      metric: id,
      bootstrap_ci_low: ciLow,
      bootstrap_ci_high: ciHigh,
      bootstrap_ci_width: Number.isFinite(ciLow) && Number.isFinite(ciHigh) ? Math.abs(ciHigh - ciLow) : Number.NaN,
      p_value: pValue,
      significant,
      improved,
      regressed,
      sample_n_a: byArm.A.length,
      sample_n_b: byArm.B.length
    }
  };
}

function buildFunctionalRates(functionalRows) {
  const byArmAction = new Map();
  for (const row of functionalRows) {
    const arm = row.arm;
    const action = String(row.action || '').trim().toLowerCase() || 'unknown';
    const key = `${arm}::${action}`;
    if (!byArmAction.has(key)) byArmAction.set(key, { ok: 0, total: 0 });
    const stat = byArmAction.get(key);
    stat.total += 1;
    if (row.success_bool) stat.ok += 1;
  }

  const rates = { A: {}, B: {} };
  for (const [key, stat] of byArmAction.entries()) {
    const [arm, action] = key.split('::');
    rates[arm][action] = stat.total ? stat.ok / stat.total : Number.NaN;
  }
  return rates;
}

function evaluateMissingByBlock(rows, requiredFields, threshold) {
  const byBlock = new Map();
  for (const row of rows) {
    const blockId = String(row.block_id || 'unknown-block');
    if (!byBlock.has(blockId)) byBlock.set(blockId, []);
    byBlock.get(blockId).push(row);
  }
  const reports = [];
  const invalidBlocks = [];
  for (const [blockId, blockRows] of byBlock.entries()) {
    const report = computeMissingRate(blockRows, requiredFields);
    reports.push({
      block_id: blockId,
      total: report.total,
      overall_missing_rate: report.overallMissingRate,
      missing_rate_by_field: report.missingRateByField
    });
    if (report.overallMissingRate > threshold) {
      invalidBlocks.push({
        block_id: blockId,
        overall_missing_rate: report.overallMissingRate
      });
    }
  }
  return { reports, invalidBlocks };
}

function asBool(raw, fallback = false) {
  if (typeof raw === 'boolean') return raw;
  if (raw === undefined || raw === null) return fallback;
  const text = String(raw).trim().toLowerCase();
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'on', 'y'].includes(text)) return true;
  if (['0', 'false', 'no', 'off', 'n'].includes(text)) return false;
  return fallback;
}

function groupByAttempt(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = attemptKey(row.block_id, row.arm, row.attempt_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function evaluateChannelQuality({
  channel,
  rows,
  successAttemptsMeta,
  warmupRounds,
  thresholds,
  validPredicate
}) {
  const byAttemptRows = groupByAttempt(rows);
  const byArm = { A: { expected: 0, observed: 0, valid: 0, invalid: 0, missing: 0 }, B: { expected: 0, observed: 0, valid: 0, invalid: 0, missing: 0 } };
  const perAttempt = [];
  const perBlockArm = new Map();

  for (const meta of successAttemptsMeta) {
    const key = attemptKey(meta.block_id, meta.arm, meta.attempt_id);
    const attemptRows = byAttemptRows.get(key) || [];
    const expected = Math.max(0, Number(meta.rounds_target || 0) - Number(warmupRounds || 0));
    const observed = attemptRows.length;
    let valid = 0;
    for (const row of attemptRows) {
      if (validPredicate(row)) valid += 1;
    }
    const invalid = Math.max(0, observed - valid);
    const missing = Math.max(0, expected - observed);
    const missingRate = expected > 0 ? missing / expected : 0;
    const invalidRate = observed > 0 ? invalid / observed : expected > 0 ? 1 : 0;
    const pass =
      missingRate <= thresholds.missingRateMax &&
      invalidRate <= thresholds.invalidRateMax &&
      valid >= thresholds.minSamplesPerAttempt &&
      valid >= thresholds.minRoundsPerBlockArm;

    perAttempt.push({
      block_id: meta.block_id,
      arm: meta.arm,
      attempt_id: meta.attempt_id,
      expected,
      observed,
      valid,
      invalid,
      missing,
      missing_rate: missingRate,
      invalid_rate: invalidRate,
      pass
    });

    const armStat = byArm[meta.arm] || byArm.A;
    armStat.expected += expected;
    armStat.observed += observed;
    armStat.valid += valid;
    armStat.invalid += invalid;
    armStat.missing += missing;

    const blockArmKey = `${meta.block_id}::${meta.arm}`;
    if (!perBlockArm.has(blockArmKey)) {
      perBlockArm.set(blockArmKey, {
        block_id: meta.block_id,
        arm: meta.arm,
        expected: 0,
        observed: 0,
        valid: 0,
        invalid: 0,
        missing: 0
      });
    }
    const blockArm = perBlockArm.get(blockArmKey);
    blockArm.expected += expected;
    blockArm.observed += observed;
    blockArm.valid += valid;
    blockArm.invalid += invalid;
    blockArm.missing += missing;
  }

  const blockArmStats = Array.from(perBlockArm.values()).map((row) => {
    const missingRate = row.expected > 0 ? row.missing / row.expected : 0;
    const invalidRate = row.observed > 0 ? row.invalid / row.observed : row.expected > 0 ? 1 : 0;
    return {
      ...row,
      missing_rate: missingRate,
      invalid_rate: invalidRate,
      pass:
        missingRate <= thresholds.missingRateMax &&
        invalidRate <= thresholds.invalidRateMax &&
        row.valid >= thresholds.minRoundsPerBlockArm
    };
  });

  for (const arm of ['A', 'B']) {
    const stat = byArm[arm];
    stat.missing_rate = stat.expected > 0 ? stat.missing / stat.expected : 0;
    stat.invalid_rate = stat.observed > 0 ? stat.invalid / stat.observed : stat.expected > 0 ? 1 : 0;
    stat.pass =
      stat.missing_rate <= thresholds.missingRateMax &&
      stat.invalid_rate <= thresholds.invalidRateMax &&
      stat.valid >= thresholds.minSamplesPerArm;
  }

  const pass =
    perAttempt.every((x) => x.pass) &&
    blockArmStats.every((x) => x.pass) &&
    byArm.A.pass &&
    byArm.B.pass;

  return {
    channel,
    thresholds,
    by_arm: byArm,
    per_attempt: perAttempt,
    per_block_arm: blockArmStats,
    pass
  };
}

function computeHeapSlopeMbPerMin(rows) {
  const valid = rows
    .filter((row) => Number.isFinite(row.ts_ms) && Number.isFinite(row.heap_mb))
    .sort((a, b) => a.ts_ms - b.ts_ms);
  if (valid.length < 2) return Number.NaN;
  const dtMs = valid[valid.length - 1].ts_ms - valid[0].ts_ms;
  if (!(dtMs > 0)) return Number.NaN;
  return ((valid[valid.length - 1].heap_mb - valid[0].heap_mb) / dtMs) * 60000;
}

function computeCounterSlopePerMin(rows, key) {
  const k = String(key || '').trim();
  if (!k) return Number.NaN;
  const valid = rows
    .filter((row) => Number.isFinite(row.ts_ms) && Number.isFinite(row?.[k]))
    .sort((a, b) => a.ts_ms - b.ts_ms);
  if (valid.length < 2) return Number.NaN;
  const head = valid[0];
  const tail = valid[valid.length - 1];
  const dtMs = tail.ts_ms - head.ts_ms;
  if (!(dtMs > 0)) return Number.NaN;
  return ((tail[k] - head[k]) / dtMs) * 60000;
}

function maxSwitchesInWindow(events, windowMs) {
  if (!events.length) return 0;
  const tsList = events
    .map((e) => toEpochMs(e.ts))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b);
  if (!tsList.length) return 0;
  let max = 0;
  let i = 0;
  for (let j = 0; j < tsList.length; j += 1) {
    while (tsList[j] - tsList[i] > windowMs) i += 1;
    max = Math.max(max, j - i + 1);
  }
  return max;
}

function evaluateControlPlaneByArm(rows, policy, arm) {
  const filtered = rows
    .filter((row) => row.arm === arm && Number.isFinite(row.ts_ms))
    .sort((a, b) => a.ts_ms - b.ts_ms);
  if (!filtered.length) {
    return {
      arm,
      windows: [],
      events: [],
      switch_count: 0,
      blocked_switches: 0,
      cooldown_hits: 0,
      max_switches_per_10min_observed: 0,
      pass: true
    };
  }

  const windows = [];
  const stepMs = Math.max(1000, Number(policy.window_sec) * 1000);
  const startTs = filtered[0].ts_ms;
  const endTs = filtered[filtered.length - 1].ts_ms;
  let cursor = startTs;
  while (cursor <= endTs) {
    const next = cursor + stepMs;
    const windowRows = filtered.filter((row) => row.ts_ms >= cursor && row.ts_ms < next);
    const dtP95 = quantile(windowRows.map((row) => row.dt_ms), 0.95);
    const longTaskP95 = quantile(windowRows.map((row) => row.long_task_total_ms), 0.95);
    const heapWindowRows = filtered.filter((row) => row.ts_ms >= next - 5 * 60 * 1000 && row.ts_ms <= next);
    const heapSlope5m = computeHeapSlopeMbPerMin(heapWindowRows);
    windows.push({
      start_ts: new Date(cursor).toISOString(),
      end_ts: new Date(next).toISOString(),
      dt_p95_ms: dtP95,
      long_task_p95_ms: longTaskP95,
      heap_slope_5m_mb_per_min: heapSlope5m
    });
    cursor = next;
  }

  let state = 'normal';
  let triggerHits = 0;
  let exitHits = 0;
  let cooldownUntilMs = 0;
  let blockedSwitches = 0;
  let cooldownHits = 0;
  const events = [];
  const switchTimestamps = [];
  const maxWindowMs = 10 * 60 * 1000;

  for (const window of windows) {
    const tsMs = toEpochMs(window.end_ts);
    const triggerHit =
      (Number.isFinite(window.long_task_p95_ms) && window.long_task_p95_ms > policy.trigger.long_task_p95_ms) ||
      (Number.isFinite(window.dt_p95_ms) && window.dt_p95_ms > policy.trigger.frame_dt_p95_ms) ||
      (Number.isFinite(window.heap_slope_5m_mb_per_min) && window.heap_slope_5m_mb_per_min > policy.trigger.heap_slope_5m_mb_per_min);
    const exitHit =
      (Number.isFinite(window.long_task_p95_ms) && window.long_task_p95_ms < policy.exit.long_task_p95_ms) &&
      (Number.isFinite(window.dt_p95_ms) && window.dt_p95_ms < policy.exit.frame_dt_p95_ms) &&
      (Number.isFinite(window.heap_slope_5m_mb_per_min) && window.heap_slope_5m_mb_per_min < policy.exit.heap_slope_5m_mb_per_min);

    if (Number.isFinite(tsMs) && tsMs < cooldownUntilMs) {
      cooldownHits += 1;
      events.push({
        ts: window.end_ts,
        arm,
        event: 'cooldown_skip',
        state,
        metrics: {
          dt_p95_ms: window.dt_p95_ms,
          long_task_p95_ms: window.long_task_p95_ms,
          heap_slope_5m_mb_per_min: window.heap_slope_5m_mb_per_min
        }
      });
      continue;
    }

    if (state === 'normal') {
      triggerHits = triggerHit ? triggerHits + 1 : 0;
      if (triggerHits >= policy.trigger_consecutive) {
        const recent = switchTimestamps.filter((t) => tsMs - t <= maxWindowMs);
        if (recent.length >= policy.max_switch_per_10min) {
          blockedSwitches += 1;
          events.push({ ts: window.end_ts, arm, event: 'switch_blocked', from: 'normal', to: 'degraded', reason: 'max_switch_per_10min' });
          triggerHits = 0;
        } else {
          state = 'degraded';
          triggerHits = 0;
          exitHits = 0;
          switchTimestamps.push(tsMs);
          cooldownUntilMs = tsMs + policy.cooldown_sec * 1000;
          events.push({ ts: window.end_ts, arm, event: 'switch', from: 'normal', to: 'degraded' });
        }
      }
    } else {
      exitHits = exitHit ? exitHits + 1 : 0;
      if (exitHits >= policy.exit_consecutive) {
        const recent = switchTimestamps.filter((t) => tsMs - t <= maxWindowMs);
        if (recent.length >= policy.max_switch_per_10min) {
          blockedSwitches += 1;
          events.push({ ts: window.end_ts, arm, event: 'switch_blocked', from: 'degraded', to: 'normal', reason: 'max_switch_per_10min' });
          exitHits = 0;
        } else {
          state = 'normal';
          exitHits = 0;
          triggerHits = 0;
          switchTimestamps.push(tsMs);
          cooldownUntilMs = tsMs + policy.cooldown_sec * 1000;
          events.push({ ts: window.end_ts, arm, event: 'switch', from: 'degraded', to: 'normal' });
        }
      }
    }
  }

  const maxObserved = maxSwitchesInWindow(
    events.filter((e) => e.event === 'switch'),
    maxWindowMs
  );
  return {
    arm,
    windows,
    events,
    switch_count: events.filter((e) => e.event === 'switch').length,
    blocked_switches: blockedSwitches,
    cooldown_hits: cooldownHits,
    max_switches_per_10min_observed: maxObserved,
    pass: blockedSwitches === 0 && maxObserved <= policy.max_switch_per_10min
  };
}

function evaluateControlPlane(rows, policy) {
  const armA = evaluateControlPlaneByArm(rows, policy, 'A');
  const armB = evaluateControlPlaneByArm(rows, policy, 'B');
  return {
    policy,
    arm_reports: {
      A: armA,
      B: armB
    },
    events: [...armA.events, ...armB.events].sort((a, b) => String(a.ts).localeCompare(String(b.ts), 'en')),
    switch_count: armA.switch_count + armB.switch_count,
    blocked_switches: armA.blocked_switches + armB.blocked_switches,
    cooldown_hits: armA.cooldown_hits + armB.cooldown_hits,
    pass: armA.pass && armB.pass
  };
}

function blockSummaries(replyRows, benchRows, functionalRows) {
  const blocks = new Map();
  const ensure = (blockId, arm) => {
    const key = `${blockId}::${arm}`;
    if (!blocks.has(key)) {
      blocks.set(key, {
        block_id: blockId,
        arm,
        latency: [],
        bench_dt: [],
        bench_long: [],
        functional: []
      });
    }
    return blocks.get(key);
  };

  for (const row of replyRows) {
    if (!Number.isFinite(row.latency_ms) || !row.success_bool) continue;
    ensure(row.block_id, row.arm).latency.push(row.latency_ms);
  }
  for (const row of benchRows) {
    if (Number.isFinite(row.dt_ms)) ensure(row.block_id, row.arm).bench_dt.push(row.dt_ms);
    if (Number.isFinite(row.long_task_total_ms)) ensure(row.block_id, row.arm).bench_long.push(row.long_task_total_ms);
  }
  for (const row of functionalRows) {
    ensure(row.block_id, row.arm).functional.push(row.success_bool ? 1 : 0);
  }

  const byBlock = new Map();
  for (const item of blocks.values()) {
    if (!byBlock.has(item.block_id)) byBlock.set(item.block_id, {});
    byBlock.get(item.block_id)[item.arm] = {
      latency_p95: quantile(item.latency, 0.95),
      bench_dt_p95: quantile(item.bench_dt, 0.95),
      bench_long_p95: quantile(item.bench_long, 0.95),
      functional_rate: mean(item.functional)
    };
  }
  return byBlock;
}

function writeVerdictMarkdown(filePath, payload) {
  const lines = [];
  lines.push(`# ChatGPT Perf AB Verdict`);
  lines.push('');
  lines.push(`- run_id: ${payload.run_id}`);
  lines.push(`- verdict: ${payload.verdict}`);
  lines.push(`- status: ${payload.status}`);
  lines.push(`- generated_at: ${payload.generated_at}`);
  lines.push('');
  lines.push('## Reasons');
  for (const reason of payload.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Metrics');
  for (const row of payload.summary_rows) {
    lines.push(`- ${row.metric}: A=${row.arm_a} B=${row.arm_b} delta=${row.delta_abs} (${row.delta_pct}%) [${row.unit}]`);
  }
  lines.push('');
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const spec = {
    'run-id': { type: 'string', required: true, description: 'Run id.' },
    'run-root': { type: 'path', required: true, description: 'Root folder containing raw/ derived/ index/.' },
    'warmup-rounds': { type: 'int', default: 3, validate: (v) => v >= 0, description: 'Warmup rounds to drop per attempt for round based datasets.' },
    'warmup-seconds': { type: 'int', default: 120, validate: (v) => v >= 0, description: 'Warmup seconds to drop for bench samples.' },
    'outlier-method': { type: 'string', default: 'iqr3', choices: ['iqr3', 'mad3'], description: 'Outlier method.' },
    'missing-threshold': { type: 'number', default: 0.03, validate: (v) => v >= 0 && v <= 1, description: 'Missing-rate threshold.' },
    'require-block-count': { type: 'int', default: 3, validate: (v) => v >= 1, description: 'Minimum unique blocks required.' },
    'min-rounds-per-block-arm': { type: 'int', default: 30, validate: (v) => v >= 1, description: 'Minimum valid rounds required for each block+arm.' },
    'reply-missing-threshold': { type: 'number', default: 0.03, validate: (v) => v >= 0 && v <= 1, description: 'Reply channel missing-rate max.' },
    'reply-invalid-threshold': { type: 'number', default: 0.02, validate: (v) => v >= 0 && v <= 1, description: 'Reply channel invalid-rate max.' },
    'reply-min-samples-arm': { type: 'int', default: 85, validate: (v) => v >= 1, description: 'Reply channel minimum valid samples per arm.' },
    'bench-missing-threshold': { type: 'number', default: 0.05, validate: (v) => v >= 0 && v <= 1, description: 'Bench channel missing-rate max.' },
    'bench-invalid-threshold': { type: 'number', default: 0, validate: (v) => v >= 0 && v <= 1, description: 'Bench channel invalid-rate max.' },
    'bench-min-samples-arm': { type: 'int', default: 80, validate: (v) => v >= 1, description: 'Bench channel minimum valid samples per arm.' },
    'functional-missing-threshold': { type: 'number', default: 0.03, validate: (v) => v >= 0 && v <= 1, description: 'Functional channel missing-rate max.' },
    'functional-invalid-threshold': { type: 'number', default: 0.01, validate: (v) => v >= 0 && v <= 1, description: 'Functional channel invalid-rate max.' },
    'functional-min-samples-arm': { type: 'int', default: 85, validate: (v) => v >= 1, description: 'Functional channel minimum valid samples per arm.' },
    'gate-latency-p95-ratio': { type: 'number', default: 0.75, validate: (v) => v > 0, description: 'Release gate: latency p95 ratio (B/A) upper bound.' },
    'gate-bench-dt-p95-abs': { type: 'number', default: 22, validate: (v) => v > 0, description: 'Release gate: bench dt p95 absolute upper bound (arm B).' },
    'gate-heap-slope-abs': { type: 'number', default: 1.5, validate: (v) => v > 0, description: 'Release gate: heap slope MB/min upper bound (arm B).' },
    'gate-dom-query-ops-ratio': { type: 'number', default: 0.7, validate: (v) => v > 0, description: 'Release gate: dom_query_ops_per_min ratio (B/A) upper bound.' },
    'gate-mo-callbacks-ratio': { type: 'number', default: 0.75, validate: (v) => v > 0, description: 'Release gate: mo_callbacks_per_min ratio (B/A) upper bound.' },
    'gate-turn-scans-ratio': { type: 'number', default: 0.8, validate: (v) => v > 0, description: 'Release gate: turn_scans_per_min ratio (B/A) upper bound.' },
    'require-significance': { type: 'boolean', default: true, description: 'Require p-value + CI significance for release PASS.' },
    'control-window-sec': { type: 'int', default: 30, validate: (v) => v >= 5, description: 'Control-plane evaluation window (seconds).' },
    'control-trigger-consecutive': { type: 'int', default: 3, validate: (v) => v >= 1, description: 'Consecutive trigger windows required to enter degraded mode.' },
    'control-exit-consecutive': { type: 'int', default: 5, validate: (v) => v >= 1, description: 'Consecutive recovery windows required to exit degraded mode.' },
    'control-cooldown-sec': { type: 'int', default: 90, validate: (v) => v >= 0, description: 'Cooldown seconds after each mode switch.' },
    'control-max-switch-per-10min': { type: 'int', dest: 'controlMaxSwitchPer10Min', default: 4, validate: (v) => v >= 1, description: 'Maximum allowed mode switches within any 10 minute window.' },
    'control-trigger-long-task-ms': { type: 'number', default: 180, validate: (v) => v > 0, description: 'Trigger threshold: long task p95 (ms).' },
    'control-trigger-frame-dt-ms': { type: 'number', default: 28, validate: (v) => v > 0, description: 'Trigger threshold: frame dt p95 (ms).' },
    'control-trigger-heap-slope': { type: 'number', default: 2, validate: (v) => v > 0, description: 'Trigger threshold: heap slope 5m (MB/min).' },
    'control-exit-long-task-ms': { type: 'number', default: 120, validate: (v) => v > 0, description: 'Exit threshold: long task p95 (ms).' },
    'control-exit-frame-dt-ms': { type: 'number', default: 22, validate: (v) => v > 0, description: 'Exit threshold: frame dt p95 (ms).' },
    'control-exit-heap-slope': { type: 'number', default: 1.2, validate: (v) => v > 0, description: 'Exit threshold: heap slope 5m (MB/min).' },
    'bootstrap-resamples': { type: 'int', default: 10000, validate: (v) => v >= 100, description: 'Bootstrap resamples.' },
    'permutation-resamples': { type: 'int', default: 10000, validate: (v) => v >= 100, description: 'Permutation resamples.' },
    alpha: { type: 'number', default: 0.05, validate: (v) => v > 0 && v < 1, description: 'Significance alpha.' },
    'schema-version': { type: 'string', default: 'v2', description: 'Output schema version for index.' }
  };

  const { help, args } = parseArgs(process.argv.slice(2), spec);
  if (help) {
    process.stdout.write(formatHelp(
      {
        usage: 'node dev/test-chatgpt-perf-aggregate-report.js --run-id <id> --run-root <path> [options]',
        description: 'Aggregate ChatGPT perf AB raw data (reply-timer CSV, bench NDJSON, functional CSV, attempt.meta), then output derived report and evidence index.',
        examples: [
          'node dev/test-chatgpt-perf-aggregate-report.js --run-id run-20260227T120000Z-abcd123 --run-root ./.omx/logs/chatgpt-perf-ab/run-20260227T120000Z-abcd123',
          'node dev/test-chatgpt-perf-aggregate-report.js --run-id run-20260227T120000Z-abcd123 --run-root ./tmp/run --warmup-rounds 3 --warmup-seconds 120 --outlier-method iqr3 --missing-threshold 0.03 --bootstrap-resamples 5000 --permutation-resamples 5000 --alpha 0.05'
        ]
      },
      spec
    ));
    return;
  }

  const runId = String(args.runId).trim();
  const runRoot = path.resolve(String(args.runRoot));
  const warmupRounds = Number(args.warmupRounds);
  const warmupSeconds = Number(args.warmupSeconds);
  const outlierMethod = String(args.outlierMethod);
  const missingThreshold = Number(args.missingThreshold);
  const requireBlockCount = Number(args.requireBlockCount);
  const minRoundsPerBlockArm = Number(args.minRoundsPerBlockArm);
  const replyMissingThreshold = Number(args.replyMissingThreshold);
  const replyInvalidThreshold = Number(args.replyInvalidThreshold);
  const replyMinSamplesArm = Number(args.replyMinSamplesArm);
  const benchMissingThreshold = Number(args.benchMissingThreshold);
  const benchInvalidThreshold = Number(args.benchInvalidThreshold);
  const benchMinSamplesArm = Number(args.benchMinSamplesArm);
  const functionalMissingThreshold = Number(args.functionalMissingThreshold);
  const functionalInvalidThreshold = Number(args.functionalInvalidThreshold);
  const functionalMinSamplesArm = Number(args.functionalMinSamplesArm);
  const gateLatencyP95Ratio = Number(args.gateLatencyP95Ratio);
  const gateBenchDtP95Abs = Number(args.gateBenchDtP95Abs);
  const gateHeapSlopeAbs = Number(args.gateHeapSlopeAbs);
  const gateDomQueryOpsRatio = Number(args.gateDomQueryOpsRatio);
  const gateMoCallbacksRatio = Number(args.gateMoCallbacksRatio);
  const gateTurnScansRatio = Number(args.gateTurnScansRatio);
  const requireSignificance = asBool(args.requireSignificance, true);
  const controlWindowSec = Number(args.controlWindowSec);
  const controlTriggerConsecutive = Number(args.controlTriggerConsecutive);
  const controlExitConsecutive = Number(args.controlExitConsecutive);
  const controlCooldownSec = Number(args.controlCooldownSec);
  const controlMaxSwitchPer10Min = Number(args.controlMaxSwitchPer10Min);
  const controlTriggerLongTaskMs = Number(args.controlTriggerLongTaskMs);
  const controlTriggerFrameDtMs = Number(args.controlTriggerFrameDtMs);
  const controlTriggerHeapSlope = Number(args.controlTriggerHeapSlope);
  const controlExitLongTaskMs = Number(args.controlExitLongTaskMs);
  const controlExitFrameDtMs = Number(args.controlExitFrameDtMs);
  const controlExitHeapSlope = Number(args.controlExitHeapSlope);
  const bootstrapResamples = Number(args.bootstrapResamples);
  const permutationResamples = Number(args.permutationResamples);
  const alpha = Number(args.alpha);
  const schemaVersion = String(args.schemaVersion || 'v2').trim() || 'v2';

  if (!fs.existsSync(runRoot)) throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, `run-root not found: ${runRoot}`);

  const attemptMetaRoot = path.join(runRoot, 'raw', 'runner');
  const replyRoot = path.join(runRoot, 'raw', 'reply-timer');
  const benchRoot = path.join(runRoot, 'raw', 'bench');
  const functionalRoot = path.join(runRoot, 'raw', 'functional');
  const derivedRoot = path.join(runRoot, 'derived');
  const indexRoot = path.join(runRoot, 'index');

  const attemptMetaFiles = walkFiles(
    attemptMetaRoot,
    (name) => /^attempt\.meta(\.json)?$/i.test(name) || /^attempt\.meta\./i.test(name)
  );
  if (!attemptMetaFiles.length) {
    throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, 'No attempt.meta files found under raw/runner');
  }

  const attemptMetaMap = new Map();
  let timeoutAttemptCount = 0;
  for (const file of attemptMetaFiles) {
    const meta = readJson(file);
    const ids = parsePathIds(attemptMetaRoot, file);
    const blockId = String(meta.block_id || ids.blockId);
    const arm = String(meta.arm || ids.arm).toUpperCase();
    const attemptId = String(meta.attempt_id || ids.attemptId);
    const key = attemptKey(blockId, arm, attemptId);
    const status = String(meta.status || '').trim().toUpperCase();
    if (status.includes('TIMEOUT')) timeoutAttemptCount += 1;
    attemptMetaMap.set(key, {
      run_id: String(meta.run_id || runId),
      block_id: blockId,
      arm,
      attempt_id: attemptId,
      status,
      rounds_target: Number(meta.rounds_target || 0),
      rounds_completed: Number(meta.rounds_completed || 0),
      stage: String(meta.stage || ''),
      mode: String(meta.mode || '')
    });
  }

  const successAttempts = new Set(
    Array.from(attemptMetaMap.values())
      .filter((meta) => meta.status === 'SUCCESS')
      .map((meta) => attemptKey(meta.block_id, meta.arm, meta.attempt_id))
  );
  const successAttemptsMeta = Array.from(attemptMetaMap.values()).filter((meta) => meta.status === 'SUCCESS');
  if (!successAttempts.size) {
    throw new ExitError(EXIT_CODES.DATA_QUALITY_FAILED, 'No SUCCESS attempt.meta entries found');
  }

  const replyRowsRaw = [];
  for (const file of walkFiles(replyRoot, (name) => name.toLowerCase().endsWith('.csv'))) {
    const ids = parsePathIds(replyRoot, file);
    const rows = readCsv(file);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const blockId = String(row.block_id || ids.blockId);
      const arm = String(row.arm || ids.arm).toUpperCase();
      const attemptId = String(row.attempt_id || ids.attemptId);
      const key = attemptKey(blockId, arm, attemptId);
      if (!successAttempts.has(key)) continue;
      replyRowsRaw.push({
        sample_id: String(row.sample_id || ''),
        run_id: String(row.run_id || runId),
        block_id: blockId,
        arm,
        attempt_id: attemptId,
        round_id: String(row.round_id || `r${String(i + 1).padStart(4, '0')}`),
        round_ord: parseRoundOrdinal(row.round_id, i),
        send_ts_ms: toEpochMs(row.send_ts),
        done_ts_ms: toEpochMs(row.done_ts),
        latency_ms: toFiniteNumber(row.latency_ms),
        success_bool: parseSuccess(row.success)
      });
    }
  }

  const benchRowsRaw = [];
  for (const file of walkFiles(benchRoot, (name) => name.toLowerCase().endsWith('.ndjson'))) {
    const ids = parsePathIds(benchRoot, file);
    const rows = readNdjson(file);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const blockId = String(row.block_id || ids.blockId);
      const arm = String(row.arm || ids.arm).toUpperCase();
      const attemptId = String(row.attempt_id || ids.attemptId);
      const key = attemptKey(blockId, arm, attemptId);
      if (!successAttempts.has(key)) continue;
      benchRowsRaw.push({
        sample_id: String(row.sample_id || ''),
        run_id: String(row.run_id || runId),
        block_id: blockId,
        arm,
        attempt_id: attemptId,
        round_id: String(row.round_id || ''),
        channel: String(row.channel || 'bench'),
        action_seq: Number.isInteger(Number(row.action_seq)) ? Number(row.action_seq) : 0,
        round_ord: parseRoundOrdinal(row.round_id, i),
        ts_ms: toEpochMs(row.ts),
        dt_ms: toFiniteNumber(row.dt_ms),
        long_task_total_ms: toFiniteNumber(row.long_task_total_ms),
        long_task_count: toFiniteNumber(row.long_task_count),
        heap_mb: toFiniteNumber(row.heap_mb),
        dom_nodes: toFiniteNumber(row.dom_nodes),
        dom_query_ops: toFiniteNumber(row.dom_query_ops),
        mo_callback_count: toFiniteNumber(row.mo_callback_count),
        turn_scan_count: toFiniteNumber(row.turn_scan_count),
        iframes: toFiniteNumber(row.iframes)
      });
    }
  }

  const functionalRowsRaw = [];
  for (const file of walkFiles(functionalRoot, (name) => name.toLowerCase().endsWith('.csv'))) {
    const ids = parsePathIds(functionalRoot, file);
    const rows = readCsv(file);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const blockId = String(row.block_id || ids.blockId);
      const arm = String(row.arm || ids.arm).toUpperCase();
      const attemptId = String(row.attempt_id || ids.attemptId);
      const key = attemptKey(blockId, arm, attemptId);
      if (!successAttempts.has(key)) continue;
      functionalRowsRaw.push({
        sample_id: String(row.sample_id || ''),
        run_id: String(row.run_id || runId),
        block_id: blockId,
        arm,
        attempt_id: attemptId,
        round_id: String(row.round_id || `r${String(i + 1).padStart(4, '0')}`),
        round_ord: parseRoundOrdinal(row.round_id, i),
        action: String(row.action || '').trim().toLowerCase(),
        action_seq: Number.isInteger(Number(row.action_seq)) ? Number(row.action_seq) : 0,
        success_bool: parseSuccess(row.success),
        latency_ms: toFiniteNumber(row.latency_ms)
      });
    }
  }

  const exclusions = [];
  const replyRows = applyWarmupByRounds(replyRowsRaw, warmupRounds, exclusions, runId, 'reply');
  const functionalRows = applyWarmupByRounds(functionalRowsRaw, warmupRounds, exclusions, runId, 'functional');
  const benchRows = applyWarmupBySeconds(benchRowsRaw, warmupSeconds, exclusions, runId);

  const missingReply = evaluateMissingByBlock(replyRows, ['send_ts_ms', 'done_ts_ms', 'latency_ms'], missingThreshold);
  const missingBench = evaluateMissingByBlock(benchRows, ['ts_ms', 'dt_ms', 'long_task_total_ms', 'heap_mb'], missingThreshold);
  const missingFunctional = evaluateMissingByBlock(functionalRows, ['action', 'success_bool'], missingThreshold);
  const requiredBlockIds = new Set(successAttemptsMeta.map((meta) => meta.block_id));

  const sampleIdCounts = new Map();
  for (const row of [...replyRows, ...benchRows, ...functionalRows]) {
    const sampleId = String(row.sample_id || '').trim();
    if (!sampleId) continue;
    sampleIdCounts.set(sampleId, (sampleIdCounts.get(sampleId) || 0) + 1);
  }
  const duplicateSampleIds = Array.from(sampleIdCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([sampleId, count]) => ({ sample_id: sampleId, count }));

  const qualityThresholds = {
    require_block_count: requireBlockCount,
    min_rounds_per_block_arm: minRoundsPerBlockArm,
    channels: {
      reply: {
        missing_rate_max: replyMissingThreshold,
        invalid_rate_max: replyInvalidThreshold,
        min_samples_per_arm: replyMinSamplesArm
      },
      bench: {
        missing_rate_max: benchMissingThreshold,
        invalid_rate_max: benchInvalidThreshold,
        min_samples_per_arm: benchMinSamplesArm
      },
      functional: {
        missing_rate_max: functionalMissingThreshold,
        invalid_rate_max: functionalInvalidThreshold,
        min_samples_per_arm: functionalMinSamplesArm
      }
    }
  };

  const qualityReply = evaluateChannelQuality({
    channel: 'reply',
    rows: replyRows,
    successAttemptsMeta,
    warmupRounds,
    thresholds: {
      missingRateMax: replyMissingThreshold,
      invalidRateMax: replyInvalidThreshold,
      minSamplesPerArm: replyMinSamplesArm,
      minSamplesPerAttempt: Math.min(minRoundsPerBlockArm, replyMinSamplesArm),
      minRoundsPerBlockArm
    },
    validPredicate: (row) => row.success_bool && Number.isFinite(row.latency_ms) && Number.isFinite(row.send_ts_ms) && Number.isFinite(row.done_ts_ms)
  });
  const qualityBench = evaluateChannelQuality({
    channel: 'bench',
    rows: benchRows,
    successAttemptsMeta,
    warmupRounds,
    thresholds: {
      missingRateMax: benchMissingThreshold,
      invalidRateMax: benchInvalidThreshold,
      minSamplesPerArm: benchMinSamplesArm,
      minSamplesPerAttempt: Math.min(minRoundsPerBlockArm, benchMinSamplesArm),
      minRoundsPerBlockArm
    },
    validPredicate: (row) =>
      Number.isFinite(row.dt_ms) &&
      row.dt_ms > 0 &&
      Number.isFinite(row.long_task_total_ms) &&
      Number.isFinite(row.ts_ms)
  });
  const qualityFunctional = evaluateChannelQuality({
    channel: 'functional',
    rows: functionalRows,
    successAttemptsMeta,
    warmupRounds,
    thresholds: {
      missingRateMax: functionalMissingThreshold,
      invalidRateMax: functionalInvalidThreshold,
      minSamplesPerArm: functionalMinSamplesArm,
      minSamplesPerAttempt: Math.min(minRoundsPerBlockArm, functionalMinSamplesArm),
      minRoundsPerBlockArm
    },
    validPredicate: (row) => !!String(row.action || '').trim() && (row.success_bool === true || row.success_bool === false)
  });

  const blockCountPass = requiredBlockIds.size >= requireBlockCount;
  const dataQualityPass = blockCountPass && duplicateSampleIds.length === 0 && qualityReply.pass && qualityBench.pass && qualityFunctional.pass;
  const dataQualityReasons = [];
  if (!blockCountPass) dataQualityReasons.push(`block_count<${requireBlockCount}`);
  if (duplicateSampleIds.length) dataQualityReasons.push(`duplicate_sample_id=${duplicateSampleIds.length}`);
  if (!qualityReply.pass) dataQualityReasons.push('reply_quality_failed');
  if (!qualityBench.pass) dataQualityReasons.push('bench_quality_failed');
  if (!qualityFunctional.pass) dataQualityReasons.push('functional_quality_failed');

  const controlPolicy = {
    window_sec: controlWindowSec,
    trigger_consecutive: controlTriggerConsecutive,
    exit_consecutive: controlExitConsecutive,
    cooldown_sec: controlCooldownSec,
    max_switch_per_10min: controlMaxSwitchPer10Min,
    trigger: {
      long_task_p95_ms: controlTriggerLongTaskMs,
      frame_dt_p95_ms: controlTriggerFrameDtMs,
      heap_slope_5m_mb_per_min: controlTriggerHeapSlope
    },
    exit: {
      long_task_p95_ms: controlExitLongTaskMs,
      frame_dt_p95_ms: controlExitFrameDtMs,
      heap_slope_5m_mb_per_min: controlExitHeapSlope
    }
  };
  const controlReport = evaluateControlPlane(benchRows, controlPolicy);

  const latencySamples = replyRows
    .filter((row) => row.success_bool && Number.isFinite(row.latency_ms))
    .map((row) => ({
      block_id: row.block_id,
      arm: row.arm,
      attempt_id: row.attempt_id,
      round_id: row.round_id,
      value: row.latency_ms
    }));

  const benchDtSamples = benchRows
    .filter((row) => Number.isFinite(row.dt_ms))
    .map((row) => ({
      block_id: row.block_id,
      arm: row.arm,
      attempt_id: row.attempt_id,
      round_id: row.round_id,
      value: row.dt_ms
    }));

  const benchLongSamples = benchRows
    .filter((row) => Number.isFinite(row.long_task_total_ms))
    .map((row) => ({
      block_id: row.block_id,
      arm: row.arm,
      attempt_id: row.attempt_id,
      round_id: row.round_id,
      value: row.long_task_total_ms
    }));

  const benchGroupedByAttempt = new Map();
  for (const row of benchRows) {
    const key = attemptKey(row.block_id, row.arm, row.attempt_id);
    if (!benchGroupedByAttempt.has(key)) benchGroupedByAttempt.set(key, []);
    benchGroupedByAttempt.get(key).push(row);
  }

  const heapSlopeSamples = [];
  const maxHeapSamples = [];
  const domQueryOpsSamples = [];
  const moCallbackSamples = [];
  const turnScanSamples = [];
  for (const rows of benchGroupedByAttempt.values()) {
    const valid = rows
      .filter((row) => Number.isFinite(row.ts_ms) && Number.isFinite(row.heap_mb))
      .sort((a, b) => a.ts_ms - b.ts_ms);
    if (!valid.length) continue;
    const head = valid[0];
    const tail = valid[valid.length - 1];
    const dtMs = tail.ts_ms - head.ts_ms;
    if (dtMs > 0) {
      const slope = ((tail.heap_mb - head.heap_mb) / dtMs) * 60000;
      heapSlopeSamples.push({
        block_id: head.block_id,
        arm: head.arm,
        attempt_id: head.attempt_id,
        round_id: '',
        value: slope
      });
    }

    const maxHeap = Math.max(...valid.map((row) => row.heap_mb));
    maxHeapSamples.push({
      block_id: head.block_id,
      arm: head.arm,
      attempt_id: head.attempt_id,
      round_id: '',
      value: maxHeap
    });

    const domQueryOpsPerMin = computeCounterSlopePerMin(rows, 'dom_query_ops');
    if (Number.isFinite(domQueryOpsPerMin)) {
      domQueryOpsSamples.push({
        block_id: head.block_id,
        arm: head.arm,
        attempt_id: head.attempt_id,
        round_id: '',
        value: domQueryOpsPerMin
      });
    }

    const moCallbacksPerMin = computeCounterSlopePerMin(rows, 'mo_callback_count');
    if (Number.isFinite(moCallbacksPerMin)) {
      moCallbackSamples.push({
        block_id: head.block_id,
        arm: head.arm,
        attempt_id: head.attempt_id,
        round_id: '',
        value: moCallbacksPerMin
      });
    }

    const turnScansPerMin = computeCounterSlopePerMin(rows, 'turn_scan_count');
    if (Number.isFinite(turnScansPerMin)) {
      turnScanSamples.push({
        block_id: head.block_id,
        arm: head.arm,
        attempt_id: head.attempt_id,
        round_id: '',
        value: turnScansPerMin
      });
    }
  }

  const functionalSamples = functionalRows
    .filter((row) => row.action)
    .map((row) => ({
      block_id: row.block_id,
      arm: row.arm,
      attempt_id: row.attempt_id,
      round_id: row.round_id,
      action: row.action,
      value: row.success_bool ? 1 : 0
    }));

  const latencyFiltered = applyOutlierFilter(latencySamples, outlierMethod, 'latency_ms', exclusions, runId);
  const benchDtFiltered = applyOutlierFilter(benchDtSamples, outlierMethod, 'bench_dt_ms', exclusions, runId);
  const benchLongFiltered = applyOutlierFilter(benchLongSamples, outlierMethod, 'bench_long_task_total_ms', exclusions, runId);
  const heapSlopeFiltered = applyOutlierFilter(heapSlopeSamples, outlierMethod, 'heap_slope_mb_per_min', exclusions, runId);
  const maxHeapFiltered = applyOutlierFilter(maxHeapSamples, outlierMethod, 'max_heap_mb', exclusions, runId);
  const domQueryOpsFiltered = applyOutlierFilter(domQueryOpsSamples, outlierMethod, 'dom_query_ops_per_min', exclusions, runId);
  const moCallbacksFiltered = applyOutlierFilter(moCallbackSamples, outlierMethod, 'mo_callbacks_per_min', exclusions, runId);
  const turnScansFiltered = applyOutlierFilter(turnScanSamples, outlierMethod, 'turn_scans_per_min', exclusions, runId);

  const metricResults = [];
  metricResults.push(computeMetric({
    id: 'latency_p95_ms',
    unit: 'ms',
    direction: 'lower_better',
    samples: latencyFiltered,
    summaryFn: (arr) => quantile(arr, 0.95),
    statFn: (arr) => quantile(arr, 0.95),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));
  metricResults.push(computeMetric({
    id: 'latency_p50_ms',
    unit: 'ms',
    direction: 'lower_better',
    samples: latencyFiltered,
    summaryFn: (arr) => quantile(arr, 0.5),
    statFn: (arr) => quantile(arr, 0.5),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));
  metricResults.push(computeMetric({
    id: 'bench_dt_p95_ms',
    unit: 'ms',
    direction: 'lower_better',
    samples: benchDtFiltered,
    summaryFn: (arr) => quantile(arr, 0.95),
    statFn: (arr) => quantile(arr, 0.95),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));
  metricResults.push(computeMetric({
    id: 'bench_long_task_total_p95_ms',
    unit: 'ms',
    direction: 'lower_better',
    samples: benchLongFiltered,
    summaryFn: (arr) => quantile(arr, 0.95),
    statFn: (arr) => quantile(arr, 0.95),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));
  metricResults.push(computeMetric({
    id: 'heap_slope_mb_per_min',
    unit: 'MB/min',
    direction: 'lower_better',
    samples: heapSlopeFiltered,
    summaryFn: (arr) => mean(arr),
    statFn: (arr) => mean(arr),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));
  metricResults.push(computeMetric({
    id: 'dom_query_ops_per_min',
    unit: 'ops/min',
    direction: 'lower_better',
    samples: domQueryOpsFiltered,
    summaryFn: (arr) => mean(arr),
    statFn: (arr) => mean(arr),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));
  metricResults.push(computeMetric({
    id: 'mo_callbacks_per_min',
    unit: 'callbacks/min',
    direction: 'lower_better',
    samples: moCallbacksFiltered,
    summaryFn: (arr) => mean(arr),
    statFn: (arr) => mean(arr),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));
  metricResults.push(computeMetric({
    id: 'turn_scans_per_min',
    unit: 'scans/min',
    direction: 'lower_better',
    samples: turnScansFiltered,
    summaryFn: (arr) => mean(arr),
    statFn: (arr) => mean(arr),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));
  metricResults.push(computeMetric({
    id: 'max_heap_mb',
    unit: 'MB',
    direction: 'lower_better',
    samples: maxHeapFiltered,
    summaryFn: (arr) => (arr.length ? Math.max(...arr) : Number.NaN),
    statFn: (arr) => quantile(arr, 0.95),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));
  metricResults.push(computeMetric({
    id: 'functional_success_rate',
    unit: 'ratio',
    direction: 'higher_better',
    samples: functionalSamples,
    summaryFn: (arr) => mean(arr),
    statFn: (arr) => mean(arr),
    alpha,
    bootstrapResamples,
    permutationResamples,
    seed: runId
  }));

  const summaryRows = metricResults.map((x) => x.summary);
  const statsRows = metricResults.map((x) => x.stats);
  const summaryMap = new Map(summaryRows.map((row) => [row.metric, row]));
  const statsMap = new Map(statsRows.map((row) => [row.metric, row]));
  const functionalRates = buildFunctionalRates(functionalRows);
  const perBlock = blockSummaries(replyRows, benchRows, functionalRows);

  const reasons = [];
  if (timeoutAttemptCount > 0) reasons.push(`Found ${timeoutAttemptCount} timeout attempt.meta status.`);
  if (!dataQualityPass) reasons.push(`Data quality failed: ${dataQualityReasons.join(', ')}`);
  if (!controlReport.pass) reasons.push('Control-plane policy check failed.');

  const latencyP95 = summaryMap.get('latency_p95_ms');
  const latencyP50 = summaryMap.get('latency_p50_ms');
  const benchDtP95 = summaryMap.get('bench_dt_p95_ms');
  const benchLongP95 = summaryMap.get('bench_long_task_total_p95_ms');
  const heapSlope = summaryMap.get('heap_slope_mb_per_min');
  const domQueryOps = summaryMap.get('dom_query_ops_per_min');
  const moCallbacks = summaryMap.get('mo_callbacks_per_min');
  const turnScans = summaryMap.get('turn_scans_per_min');
  const maxHeap = summaryMap.get('max_heap_mb');
  const funcRate = summaryMap.get('functional_success_rate');

  const ratioLatencyP95 = safeRatio(latencyP95?.arm_b, latencyP95?.arm_a);
  const ratioLatencyP50 = safeRatio(latencyP50?.arm_b, latencyP50?.arm_a);
  const ratioBenchDt = safeRatio(benchDtP95?.arm_b, benchDtP95?.arm_a);
  const ratioBenchLong = safeRatio(benchLongP95?.arm_b, benchLongP95?.arm_a);
  const ratioHeapSlope = safeRatio(heapSlope?.arm_b, heapSlope?.arm_a);
  const ratioDomQueryOps = safeRatio(domQueryOps?.arm_b, domQueryOps?.arm_a);
  const ratioMoCallbacks = safeRatio(moCallbacks?.arm_b, moCallbacks?.arm_a);
  const ratioTurnScans = safeRatio(turnScans?.arm_b, turnScans?.arm_a);
  const ratioMaxHeap = safeRatio(maxHeap?.arm_b, maxHeap?.arm_a);

  const sendRateB = toFiniteNumber(functionalRates.B.send);
  const nonSendRatesB = Object.entries(functionalRates.B)
    .filter(([action]) => action !== 'send')
    .map(([, rate]) => toFiniteNumber(rate))
    .filter((rate) => Number.isFinite(rate));
  const minNonSendRateB = nonSendRatesB.length ? Math.min(...nonSendRatesB) : Number.NaN;

  const functionalGatePass =
    Number.isFinite(sendRateB) &&
    sendRateB >= 0.995 &&
    (!nonSendRatesB.length || minNonSendRateB >= 0.99) &&
    Number.isFinite(funcRate?.arm_b) &&
    funcRate.arm_b >= 0.99;

  const coreStats = [
    statsMap.get('latency_p95_ms'),
    statsMap.get('bench_dt_p95_ms'),
    statsMap.get('heap_slope_mb_per_min')
  ];
  const significancePass = coreStats.every((s) => s && Number.isFinite(s.p_value) && s.p_value < alpha && s.bootstrap_ci_high < 0);

  const passThresholds =
    Number.isFinite(ratioLatencyP95) && ratioLatencyP95 <= gateLatencyP95Ratio &&
    Number.isFinite(benchDtP95?.arm_b) && benchDtP95.arm_b <= gateBenchDtP95Abs &&
    Number.isFinite(heapSlope?.arm_b) && heapSlope.arm_b <= gateHeapSlopeAbs &&
    Number.isFinite(ratioDomQueryOps) && ratioDomQueryOps <= gateDomQueryOpsRatio &&
    Number.isFinite(ratioMoCallbacks) && ratioMoCallbacks <= gateMoCallbacksRatio &&
    Number.isFinite(ratioTurnScans) && ratioTurnScans <= gateTurnScansRatio &&
    Number.isFinite(ratioLatencyP50) &&
    Number.isFinite(ratioBenchLong) &&
    Number.isFinite(ratioHeapSlope) &&
    Number.isFinite(ratioMaxHeap) &&
    functionalGatePass;

  let verdict = 'FAIL';
  let status = 'OK';
  if (timeoutAttemptCount > 0) {
    verdict = 'INVALID_TIMEOUT';
    status = 'TIMEOUT';
  } else if (!dataQualityPass) {
    verdict = 'INVALID';
    status = 'DATA_QUALITY_FAILED';
  } else if (!controlReport.pass) {
    verdict = 'FAIL';
    status = 'REGRESSION';
  } else if (passThresholds && (!requireSignificance || significancePass)) {
    verdict = 'PASS';
    status = 'OK';
    reasons.push('All release gates passed.');
    if (requireSignificance) reasons.push('Significance gate passed.');
  } else {
    verdict = 'FAIL';
    status = 'REGRESSION';
    if (!passThresholds) reasons.push('One or more release gates failed.');
    if (requireSignificance && !significancePass) reasons.push('Significance gate failed.');
    if (!functionalGatePass) reasons.push('Functional gate failed.');
  }

  if (!VERDICTS.includes(verdict)) {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `Invalid verdict generated: ${verdict}`);
  }

  for (const row of summaryRows) {
    for (const key of ['metric', 'arm_a', 'arm_b', 'delta_abs', 'delta_pct', 'unit']) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) {
        throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `ab-summary row missing key: ${key}`);
      }
    }
  }
  for (const row of statsRows) {
    for (const key of ['metric', 'bootstrap_ci_low', 'bootstrap_ci_high', 'p_value', 'significant']) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) {
        throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `stats row missing key: ${key}`);
      }
    }
  }

  ensureDir(derivedRoot);
  ensureDir(indexRoot);

  const summaryCsvPath = path.join(derivedRoot, 'ab-summary.csv');
  const summaryJsonPath = path.join(derivedRoot, 'ab-summary.json');
  const statsJsonPath = path.join(derivedRoot, 'stats.json');
  const qualityJsonPath = path.join(derivedRoot, 'quality.json');
  const controlJsonPath = path.join(derivedRoot, 'control-plane.json');
  const exclusionsCsvPath = path.join(derivedRoot, 'exclusions.csv');
  const verdictMdPath = path.join(derivedRoot, 'verdict.md');
  const indexPath = path.join(indexRoot, 'evidence-index.json');

  writeCsv(summaryCsvPath, summaryRows, ['metric', 'arm_a', 'arm_b', 'delta_abs', 'delta_pct', 'unit']);
  writeJson(summaryJsonPath, {
    run_id: runId,
    generated_at: new Date().toISOString(),
    rows: summaryRows
  });
  writeJson(statsJsonPath, {
    run_id: runId,
    alpha,
    generated_at: new Date().toISOString(),
    rows: statsRows,
    gates: {
      latency_p95_ratio_max: gateLatencyP95Ratio,
      bench_dt_p95_abs_max: gateBenchDtP95Abs,
      heap_slope_abs_max: gateHeapSlopeAbs,
      dom_query_ops_per_min_ratio_max: gateDomQueryOpsRatio,
      mo_callbacks_per_min_ratio_max: gateMoCallbacksRatio,
      turn_scans_per_min_ratio_max: gateTurnScansRatio,
      require_significance: requireSignificance
    },
    per_block_summary: Array.from(perBlock.entries()).map(([block_id, arms]) => ({
      block_id,
      A: arms.A || null,
      B: arms.B || null
    })),
    missing: {
      threshold: missingThreshold,
      reply_by_block: missingReply.reports,
      bench_by_block: missingBench.reports,
      functional_by_block: missingFunctional.reports
    }
  });
  writeJson(qualityJsonPath, {
    run_id: runId,
    generated_at: new Date().toISOString(),
    thresholds: qualityThresholds,
    required_blocks: requireBlockCount,
    observed_blocks: Array.from(requiredBlockIds).sort(),
    duplicate_sample_ids: duplicateSampleIds,
    channels: {
      reply: qualityReply,
      bench: qualityBench,
      functional: qualityFunctional
    },
    pass: dataQualityPass,
    reasons: dataQualityReasons
  });
  writeJson(controlJsonPath, {
    run_id: runId,
    generated_at: new Date().toISOString(),
    policy: controlPolicy,
    arm_reports: controlReport.arm_reports,
    events: controlReport.events,
    switch_count: controlReport.switch_count,
    blocked_switches: controlReport.blocked_switches,
    cooldown_hits: controlReport.cooldown_hits,
    pass: controlReport.pass
  });
  writeCsv(exclusionsCsvPath, exclusions, ['run_id', 'block_id', 'arm', 'attempt_id', 'round_id', 'reason']);

  writeVerdictMarkdown(verdictMdPath, {
    run_id: runId,
    verdict,
    status,
    generated_at: new Date().toISOString(),
    reasons,
    summary_rows: summaryRows
  });

  const fileManifest = [
    { path: 'derived/ab-summary.csv', sha256: sha256(fs.readFileSync(summaryCsvPath)), row_count: summaryRows.length },
    { path: 'derived/ab-summary.json', sha256: sha256(fs.readFileSync(summaryJsonPath)), row_count: summaryRows.length },
    { path: 'derived/stats.json', sha256: sha256(fs.readFileSync(statsJsonPath)), row_count: statsRows.length },
    { path: 'derived/quality.json', sha256: sha256(fs.readFileSync(qualityJsonPath)), row_count: 1 },
    { path: 'derived/control-plane.json', sha256: sha256(fs.readFileSync(controlJsonPath)), row_count: controlReport.events.length },
    { path: 'derived/exclusions.csv', sha256: sha256(fs.readFileSync(exclusionsCsvPath)), row_count: exclusions.length },
    { path: 'derived/verdict.md', sha256: sha256(fs.readFileSync(verdictMdPath)), row_count: fs.readFileSync(verdictMdPath, 'utf8').split(/\r?\n/).length }
  ];

  const evidenceIndex = {
    run_id: runId,
    git_head: computeGitHead(path.resolve(__dirname, '..')),
    schema_version: schemaVersion,
    generated_at: new Date().toISOString(),
    verdict,
    status,
    file_manifest: fileManifest
  };
  if (!isObject(evidenceIndex) || !Array.isArray(evidenceIndex.file_manifest) || !evidenceIndex.file_manifest.length) {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'evidence-index schema invalid');
  }
  writeJson(indexPath, evidenceIndex);

  const withIndexEntry = {
    ...evidenceIndex,
    file_manifest: [
      ...fileManifest,
      { path: 'index/evidence-index.json', sha256: sha256(fs.readFileSync(indexPath)), row_count: 1 }
    ]
  };
  writeJson(indexPath, withIndexEntry);

  const payload = {
    ok: true,
    run_id: runId,
    verdict,
    status,
    outputs: {
      summary_csv: summaryCsvPath,
      summary_json: summaryJsonPath,
      stats_json: statsJsonPath,
      quality_json: qualityJsonPath,
      control_json: controlJsonPath,
      exclusions_csv: exclusionsCsvPath,
      verdict_md: verdictMdPath,
      evidence_index_json: indexPath
    }
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

  if (verdict === 'PASS') return;
  if (verdict === 'INVALID_TIMEOUT') throw new ExitError(EXIT_CODES.TIMEOUT, 'Run marked INVALID_TIMEOUT');
  if (verdict === 'INVALID') throw new ExitError(EXIT_CODES.DATA_QUALITY_FAILED, 'Run marked INVALID');
  if (verdict === 'FAIL') {
    throw new ExitError(EXIT_CODES.ASSERTION_FAILED, `Run marked ${verdict}`);
  }
}

try {
  main();
} catch (error) {
  const code = asExitCode(error);
  const payload = {
    ok: false,
    exit_code: code,
    message: error instanceof Error ? error.message : String(error)
  };
  if (error instanceof ExitError && error.details !== undefined) payload.details = error.details;
  safeExit(code, payload);
}
