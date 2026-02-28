#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function runNode(args, expectCode = 0) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32
  });
  const expectList = Array.isArray(expectCode) ? expectCode : [expectCode];
  if (!expectList.includes(result.status)) {
    throw new Error(
      `node ${args.join(' ')} exit=${result.status} expect=${expectList.join('|')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
  return result;
}

function mustExist(filePath) {
  assert.ok(fs.existsSync(filePath), `expected file exists: ${filePath}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function buildBenchLog(lines = 160, arm = 'A') {
  const out = [];
  const baseTs = Date.now();
  for (let i = 1; i <= lines; i += 1) {
    const dt = arm === 'B' ? 10 + ((i * 2) % 10) : 24 + ((i * 3) % 14);
    const longTaskTotal = arm === 'B' ? 28 + ((i * 5) % 42) : 62 + ((i * 7) % 58);
    const rec = {
      round_id: `r${String(i).padStart(4, '0')}`,
      dt,
      longTaskTotal,
      longTaskCount: 1 + (i % 3),
      heapMb: 220 + i * (arm === 'B' ? 0.09 : 0.14),
      domNodes: 2400 + i * 3,
      iframes: 0
    };
    const ts = new Date(baseTs + i * 1200).toISOString();
    out.push(`${ts} [cgptperf] bench ${JSON.stringify(rec)}`);
  }
  return `${out.join('\n')}\n`;
}

function parseMode(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const idx = args.findIndex((x) => x === '--mode');
  if (idx < 0) return 'gate';
  const raw = String(args[idx + 1] || '').trim().toLowerCase();
  if (raw === 'smoke' || raw === 'gate') return raw;
  throw new Error(`Invalid --mode: ${raw || '(empty)'}`);
}

function toReplySource(roundsNdjsonPath) {
  const lines = fs
    .readFileSync(roundsNdjsonPath, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const row = JSON.parse(line);
    return {
      round_id: row.round_id,
      send_ts: row.send_ts,
      done_ts: row.done_ts,
      latency_ms: row.latency_ms,
      success: row.success
    };
  });
}

function main() {
  const mode = parseMode(process.argv.slice(2));
  const gateMode = mode === 'gate';

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aichat-perf-ab-'));
  const runId = `run-${Date.now()}-tooling`;
  const runRoot = path.join(tmpRoot, 'run-root');
  fs.mkdirSync(runRoot, { recursive: true });

  const settingsFile = path.join(tmpRoot, 'settings.json');
  writeJson(settingsFile, {
    full_settings: {
      cgpt_perf: {
        enabled: true,
        virtualizeOffscreen: true,
        optimizeHeavyBlocks: true,
        disableAnimations: true,
        boostDuringInput: true,
        unfreezeOnFind: true,
        showOverlay: false,
        rootMarginPx: 1200
      },
      siteModules: {
        chatgpt: {
          quicknav: true,
          chatgpt_perf: true,
          chatgpt_message_tree: true
        }
      }
    }
  });

  const blockId = 'b01-AthenB';
  const aAttempt = 'att-001';
  const bAttempt = 'att-002';
  const promptPath = path.join(ROOT, 'dev', 'prompts', 'math-long.txt');

  const aBefore = path.join(runRoot, 'raw', 'settings', blockId, 'before-a.settings.json');
  const aAfter = path.join(runRoot, 'raw', 'settings', blockId, 'after-a.settings.json');
  const aDiff = path.join(runRoot, 'raw', 'settings', blockId, 'a.settings.diff.json');
  runNode([
    'dev/test-chatgpt-perf-ab-config-smoke.js',
    '--run-id',
    runId,
    '--arm',
    'A',
    '--settings-file',
    settingsFile,
    '--snapshot-before',
    aBefore,
    '--snapshot-after',
    aAfter,
    '--diff-out',
    aDiff,
    '--force-disable-non-perf',
    'true'
  ]);

  const bBefore = path.join(runRoot, 'raw', 'settings', blockId, 'before-b.settings.json');
  const bAfter = path.join(runRoot, 'raw', 'settings', blockId, 'after-b.settings.json');
  const bDiff = path.join(runRoot, 'raw', 'settings', blockId, 'b.settings.diff.json');
  runNode([
    'dev/test-chatgpt-perf-ab-config-smoke.js',
    '--run-id',
    runId,
    '--arm',
    'B',
    '--settings-file',
    settingsFile,
    '--snapshot-before',
    bBefore,
    '--snapshot-after',
    bAfter,
    '--diff-out',
    bDiff,
    '--force-disable-non-perf',
    'true'
  ]);

  runNode([
    'dev/test-chatgpt-perf-ab-runner.js',
    '--run-id',
    runId,
    '--stage',
    'main',
    '--block-id',
    blockId,
    '--arm',
    'A',
    '--rounds',
    '160',
    '--attempt-id',
    aAttempt,
    '--prompt-template',
    promptPath,
    '--max-wall-clock-min',
    '10',
    '--out-root',
    runRoot
  ]);
  runNode([
    'dev/test-chatgpt-perf-ab-runner.js',
    '--run-id',
    runId,
    '--stage',
    'main',
    '--block-id',
    blockId,
    '--arm',
    'B',
    '--rounds',
    '160',
    '--attempt-id',
    bAttempt,
    '--prompt-template',
    promptPath,
    '--max-wall-clock-min',
    '10',
    '--out-root',
    runRoot
  ]);

  const roundsA = path.join(runRoot, 'raw', 'runner', blockId, 'A', aAttempt, 'rounds.ndjson');
  const roundsB = path.join(runRoot, 'raw', 'runner', blockId, 'B', bAttempt, 'rounds.ndjson');
  const replySrcA = path.join(tmpRoot, 'reply-a.json');
  const replySrcB = path.join(tmpRoot, 'reply-b.json');
  writeJson(replySrcA, toReplySource(roundsA));
  writeJson(replySrcB, toReplySource(roundsB));

  runNode([
    'dev/test-chatgpt-perf-extract-reply-timer.js',
    '--run-id',
    runId,
    '--block-id',
    blockId,
    '--arm',
    'A',
    '--attempt-id',
    aAttempt,
    '--source',
    'path',
    '--input',
    replySrcA,
    '--out-root',
    runRoot
  ]);
  runNode([
    'dev/test-chatgpt-perf-extract-reply-timer.js',
    '--run-id',
    runId,
    '--block-id',
    blockId,
    '--arm',
    'B',
    '--attempt-id',
    bAttempt,
    '--source',
    'path',
    '--input',
    replySrcB,
    '--out-root',
    runRoot
  ]);

  runNode([
    'dev/test-chatgpt-perf-functional-regression.js',
    '--run-id',
    runId,
    '--block-id',
    blockId,
    '--arm',
    'A',
    '--attempt-id',
    aAttempt,
    '--action-pack',
    'send,edit,branch,tree,quicknav',
    '--interval-rounds',
    '5',
    '--rounds',
    '160',
    '--out-root',
    runRoot
  ]);
  runNode([
    'dev/test-chatgpt-perf-functional-regression.js',
    '--run-id',
    runId,
    '--block-id',
    blockId,
    '--arm',
    'B',
    '--attempt-id',
    bAttempt,
    '--action-pack',
    'send,edit,branch,tree,quicknav',
    '--interval-rounds',
    '5',
    '--rounds',
    '160',
    '--out-root',
    runRoot
  ]);

  const benchLogA = path.join(tmpRoot, 'bench-a.log');
  const benchLogB = path.join(tmpRoot, 'bench-b.log');
  writeText(benchLogA, buildBenchLog(180, 'A'));
  writeText(benchLogB, buildBenchLog(180, 'B'));
  runNode([
    'dev/test-chatgpt-perf-extract-bench.js',
    '--run-id',
    runId,
    '--block-id',
    blockId,
    '--arm',
    'A',
    '--attempt-id',
    aAttempt,
    '--source',
    'logfile',
    '--input',
    benchLogA,
    '--out-root',
    runRoot
  ]);
  runNode([
    'dev/test-chatgpt-perf-extract-bench.js',
    '--run-id',
    runId,
    '--block-id',
    blockId,
    '--arm',
    'B',
    '--attempt-id',
    bAttempt,
    '--source',
    'logfile',
    '--input',
    benchLogB,
    '--out-root',
    runRoot
  ]);

  runNode([
    'dev/test-chatgpt-perf-aggregate-report.js',
    '--run-id',
    runId,
    '--run-root',
    runRoot,
    '--warmup-rounds',
    '3',
    '--warmup-seconds',
    '1',
    '--outlier-method',
    'iqr3',
    '--missing-threshold',
    '0.2',
    '--require-block-count',
    '1',
    '--gate-latency-p95-ratio',
    '0.85',
    '--gate-bench-dt-p95-abs',
    '22',
    '--gate-heap-slope-abs',
    '6',
    '--require-significance',
    'false',
    '--control-trigger-long-task-ms',
    '999',
    '--control-trigger-frame-dt-ms',
    '999',
    '--control-trigger-heap-slope',
    '999',
    '--bootstrap-resamples',
    '200',
    '--permutation-resamples',
    '200',
    '--alpha',
    '0.05'
  ], gateMode ? [0] : [0, 30, 40, 50]);

  runNode([
    'dev/test-chatgpt-perf-pipeline.js',
    '--run-id',
    runId,
    '--run-root',
    runRoot,
    '--stop-on-fail',
    gateMode ? 'true' : 'false'
  ]);

  const verdict = readJson(path.join(runRoot, 'index', 'evidence-index.json'));
  assert.ok(typeof verdict.verdict === 'string' && verdict.verdict.length > 0, 'verdict should exist');
  mustExist(path.join(runRoot, 'derived', 'ab-summary.csv'));
  mustExist(path.join(runRoot, 'derived', 'stats.json'));
  mustExist(path.join(runRoot, 'derived', 'quality.json'));
  mustExist(path.join(runRoot, 'derived', 'control-plane.json'));
  mustExist(path.join(runRoot, 'derived', 'rollback-drill.json'));
  mustExist(path.join(runRoot, 'derived', 'mvp-acceptance-report.json'));
  mustExist(path.join(runRoot, 'derived', 'verdict.md'));
  mustExist(path.join(runRoot, 'index', 'run-index.json'));
  mustExist(path.join(runRoot, 'index', 'evidence-index.jsonl'));
  mustExist(path.join(runRoot, 'SHA256SUMS'));
  assert.notStrictEqual(String(verdict.verdict || ''), 'NO_GAIN', 'NO_GAIN should not be used as pass-through verdict');
  if (gateMode) {
    const acceptance = readJson(path.join(runRoot, 'derived', 'mvp-acceptance-report.json'));
    assert.strictEqual(Boolean(acceptance.pass), true, 'gate mode requires acceptance pass');
  }

  console.log('PASS dev/test-chatgpt-perf-ab-tooling.js');
}

main();
