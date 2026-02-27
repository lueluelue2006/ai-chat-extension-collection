#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  EXIT_CODES,
  ExitError,
  asExitCode,
  parseArgs,
  formatHelp,
  writeNdjson,
  safeExit
} = require('./perf-ab/common');

function normalizeArm(raw) {
  const arm = String(raw || '').trim().toUpperCase();
  if (arm !== 'A' && arm !== 'B') throw new ExitError(EXIT_CODES.ARG_ERROR, `Invalid --arm: ${raw}`);
  return arm;
}

function firstJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function toFiniteOrNaN(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function extractFromLog({ runId, blockId, arm, attemptId, inputPath }) {
  const text = fs.readFileSync(inputPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const rows = [];
  let ord = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf('[cgptperf] bench');
    if (idx < 0) continue;
    const jsonRaw = firstJsonObject(line.slice(idx + '[cgptperf] bench'.length));
    if (!jsonRaw) continue;
    let obj;
    try {
      obj = JSON.parse(jsonRaw);
    } catch {
      continue;
    }
    ord += 1;
    rows.push({
      run_id: runId,
      block_id: blockId,
      arm,
      attempt_id: attemptId,
      ts: new Date().toISOString(),
      round_id: String(obj.round_id || `r${String(ord).padStart(4, '0')}`),
      dt_ms: toFiniteOrNaN(obj.dt ?? obj.dt_ms),
      long_task_total_ms: toFiniteOrNaN(obj.longTaskTotal ?? obj.long_task_total_ms),
      long_task_count: toFiniteOrNaN(obj.longTaskCount ?? obj.long_task_count),
      heap_mb: toFiniteOrNaN(obj.heapMb ?? obj.heap_mb),
      dom_nodes: toFiniteOrNaN(obj.domNodes ?? obj.dom_nodes),
      iframes: toFiniteOrNaN(obj.iframes),
      source_line: i + 1
    });
  }
  return rows.filter((row) => Number.isFinite(row.dt_ms) || Number.isFinite(row.long_task_total_ms));
}

function main() {
  const spec = {
    'run-id': { type: 'string', required: true, description: 'Run id' },
    'block-id': { type: 'string', required: true, description: 'Block id' },
    arm: { type: 'string', required: true, choices: ['A', 'B'], description: 'AB arm' },
    'attempt-id': { type: 'string', required: true, description: 'Attempt id' },
    source: { type: 'string', required: true, choices: ['logfile', 'console'], description: 'Data source' },
    input: { type: 'string', default: '', description: 'Input logfile path when source=logfile' },
    out: { type: 'string', default: '', description: 'Output ndjson path (optional)' },
    'out-root': { type: 'string', default: '', description: 'Run root path (optional)' }
  };
  const { help, args } = parseArgs(process.argv.slice(2), spec);
  if (help) {
    process.stdout.write(
      formatHelp(
        {
          usage:
            'node dev/test-chatgpt-perf-extract-bench.js --run-id <id> --block-id <id> --arm <A|B> --attempt-id <id> --source logfile --input <console.log> [--out <ndjson>] [--out-root <run-root>]',
          description:
            'Extract [cgptperf] bench console log lines to NDJSON schema (run_id, block_id, arm, attempt_id, ts, round_id, dt_ms, long_task_total_ms, long_task_count, heap_mb, dom_nodes, iframes). source=console returns code 20.',
          examples: [
            'node dev/test-chatgpt-perf-extract-bench.js --run-id run-20260227T120000Z-abcd123 --block-id b01-AthenB --arm A --attempt-id att-001 --source logfile --input ./tmp/console.log --out ./.omx/logs/.../raw/bench/b01-AthenB/A/att-001/cgptperf-bench.ndjson'
          ]
        },
        spec
      )
    );
    return;
  }

  const runId = String(args.runId).trim();
  const blockId = String(args.blockId).trim();
  const arm = normalizeArm(args.arm);
  const attemptId = String(args.attemptId).trim();
  const source = String(args.source).trim().toLowerCase();
  if (!runId || !blockId || !attemptId) throw new ExitError(EXIT_CODES.ARG_ERROR, 'run-id/block-id/attempt-id cannot be empty');

  if (source === 'console') {
    throw new ExitError(EXIT_CODES.ENV_UNAVAILABLE, 'source=console not available without browser attachment');
  }
  const inputPath = path.resolve(String(args.input || '').trim());
  if (!inputPath || !fs.existsSync(inputPath)) throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, `input not found: ${inputPath}`);

  const rows = extractFromLog({ runId, blockId, arm, attemptId, inputPath });
  if (!rows.length) throw new ExitError(EXIT_CODES.DATA_QUALITY_FAILED, 'no [cgptperf] bench rows extracted');

  const outPath =
    String(args.out || '').trim()
      ? path.resolve(String(args.out).trim())
      : path.join(
          String(args.outRoot || '').trim() ? path.resolve(String(args.outRoot).trim()) : process.cwd(),
          'raw',
          'bench',
          blockId,
          arm,
          attemptId,
          'cgptperf-bench.ndjson'
        );

  writeNdjson(outPath, rows, { append: false });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        run_id: runId,
        block_id: blockId,
        arm,
        attempt_id: attemptId,
        rows: rows.length,
        output: outPath
      },
      null,
      2
    )}\n`
  );
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
