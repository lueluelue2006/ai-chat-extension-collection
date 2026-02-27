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
  readJson,
  writeCsv,
  safeExit
} = require('./perf-ab/common');

function normalizeArm(raw) {
  const arm = String(raw || '').trim().toUpperCase();
  if (arm !== 'A' && arm !== 'B') throw new ExitError(EXIT_CODES.ARG_ERROR, `Invalid --arm: ${raw}`);
  return arm;
}

function toEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value || '').trim();
  if (!text) return Number.NaN;
  const num = Number(text);
  if (Number.isFinite(num)) return num;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toIso(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function normalizeRows({ runId, blockId, arm, attemptId, records }) {
  if (!Array.isArray(records)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'source JSON must be array');
  const rows = [];
  for (let i = 0; i < records.length; i += 1) {
    const row = records[i];
    if (!row || typeof row !== 'object') continue;
    const roundOrd = Number.isFinite(Number(row.round_ord))
      ? Number(row.round_ord)
      : Number.isFinite(Number(row.round))
        ? Number(row.round)
        : i + 1;
    const sendMs = toEpochMs(row.send_ts ?? row.sendTs ?? row.sendAt ?? row.send_at);
    const doneMs = toEpochMs(row.done_ts ?? row.doneTs ?? row.doneAt ?? row.done_at);
    const latencyFromRow = Number(row.latency_ms ?? row.latencyMs);
    const latencyMs = Number.isFinite(latencyFromRow)
      ? Math.max(0, Math.round(latencyFromRow))
      : Number.isFinite(sendMs) && Number.isFinite(doneMs)
        ? Math.max(0, Math.round(doneMs - sendMs))
        : Number.NaN;
    const success =
      typeof row.success === 'boolean'
        ? row.success
        : ['1', 'true', 'ok', 'success', 'yes'].includes(String(row.success || '').trim().toLowerCase());

    if (!Number.isFinite(latencyMs)) continue;
    rows.push({
      run_id: runId,
      block_id: blockId,
      arm,
      attempt_id: attemptId,
      round_id: String(row.round_id || `r${String(roundOrd).padStart(4, '0')}`),
      send_ts: toIso(sendMs),
      done_ts: toIso(doneMs),
      latency_ms: latencyMs,
      success
    });
  }
  return rows;
}

function main() {
  const spec = {
    'run-id': { type: 'string', required: true, description: 'Run id' },
    'block-id': { type: 'string', required: true, description: 'Block id' },
    arm: { type: 'string', required: true, choices: ['A', 'B'], description: 'AB arm' },
    'attempt-id': { type: 'string', required: true, description: 'Attempt id' },
    source: { type: 'string', required: true, choices: ['path', 'session'], description: 'Data source' },
    input: { type: 'string', default: '', description: 'Input JSON file when source=path' },
    out: { type: 'string', default: '', description: 'Output CSV path (optional)' },
    'out-root': { type: 'string', default: '', description: 'Run root path (optional)' }
  };
  const { help, args } = parseArgs(process.argv.slice(2), spec);
  if (help) {
    process.stdout.write(
      formatHelp(
        {
          usage:
            'node dev/test-chatgpt-perf-extract-reply-timer.js --run-id <id> --block-id <id> --arm <A|B> --attempt-id <id> --source path --input <json> [--out <csv>] [--out-root <run-root>]',
          description:
            'Extract reply-timer records to CSV schema (run_id, block_id, arm, attempt_id, round_id, send_ts, done_ts, latency_ms, success). source=session returns code 20.',
          examples: [
            'node dev/test-chatgpt-perf-extract-reply-timer.js --run-id run-20260227T120000Z-abcd123 --block-id b01-AthenB --arm A --attempt-id att-001 --source path --input ./tmp/reply-timer.json --out ./.omx/logs/.../raw/reply-timer/b01-AthenB/A/att-001/reply-timer.csv'
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

  if (source === 'session') {
    throw new ExitError(EXIT_CODES.ENV_UNAVAILABLE, 'source=session not available without browser attachment');
  }
  const inputPath = path.resolve(String(args.input || '').trim());
  if (!inputPath || !fs.existsSync(inputPath)) throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, `input not found: ${inputPath}`);

  const rows = normalizeRows({
    runId,
    blockId,
    arm,
    attemptId,
    records: readJson(inputPath)
  });
  if (!rows.length) throw new ExitError(EXIT_CODES.DATA_QUALITY_FAILED, 'no valid rows extracted from reply timer source');

  const outPath =
    String(args.out || '').trim()
      ? path.resolve(String(args.out).trim())
      : path.join(
          String(args.outRoot || '').trim() ? path.resolve(String(args.outRoot).trim()) : process.cwd(),
          'raw',
          'reply-timer',
          blockId,
          arm,
          attemptId,
          'reply-timer.csv'
        );
  writeCsv(outPath, rows, ['run_id', 'block_id', 'arm', 'attempt_id', 'round_id', 'send_ts', 'done_ts', 'latency_ms', 'success']);

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
