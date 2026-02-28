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
  writeCsv,
  readJson,
  makeSampleId,
  safeExit
} = require('./perf-ab/common');

function nowIso() {
  return new Date().toISOString();
}

function roundId(n) {
  return `r${String(Math.max(1, Number(n) || 1)).padStart(4, '0')}`;
}

function normalizeArm(raw) {
  const arm = String(raw || '').trim().toUpperCase();
  if (arm !== 'A' && arm !== 'B') throw new ExitError(EXIT_CODES.ARG_ERROR, `Invalid --arm: ${raw}`);
  return arm;
}

function normalizeActionPack(raw) {
  const list = String(raw || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const allow = new Set(['send', 'edit', 'branch', 'tree', 'quicknav']);
  const out = [];
  for (const item of list) {
    if (!allow.has(item)) throw new ExitError(EXIT_CODES.ARG_ERROR, `Unsupported action in --action-pack: ${item}`);
    if (!out.includes(item)) out.push(item);
  }
  if (!out.length) throw new ExitError(EXIT_CODES.ARG_ERROR, '--action-pack is empty');
  return out;
}

function normalizeInputRows(input) {
  if (!Array.isArray(input)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'input must be JSON array');
  return input
    .map((row, idx) => {
      if (!row || typeof row !== 'object') return null;
      const action = String(row.action || '').trim().toLowerCase();
      if (!action) return null;
      const success =
        typeof row.success === 'boolean'
          ? row.success
          : ['1', 'true', 'ok', 'success', 'yes'].includes(String(row.success || '').trim().toLowerCase());
      const latency = Number(row.latency_ms ?? row.latencyMs);
      return {
        round_ord: Number.isFinite(Number(row.round_ord)) ? Number(row.round_ord) : idx + 1,
        action,
        action_seq: Number.isInteger(Number(row.action_seq)) ? Number(row.action_seq) : 0,
        success,
        latency_ms: Number.isFinite(latency) ? Math.max(0, Math.round(latency)) : '',
        error_code: String(row.error_code || ''),
        error_msg: String(row.error_msg || ''),
        ts: String(row.ts || nowIso())
      };
    })
    .filter(Boolean);
}

function buildSyntheticRows({ runId, blockId, arm, attemptId, actions, intervalRounds, roundsTotal }) {
  const rows = [];
  const baseTs = Date.now();
  const every = Math.max(1, Number(intervalRounds) || 1);
  for (let round = 1; round <= roundsTotal; round += 1) {
    if (round % every !== 0) continue;
    const roundLabel = roundId(round);
    let actionSeq = 0;
    for (const action of actions) {
      actionSeq += 1;
      const latency = 70 + ((round * 11 + action.length * 17) % 230);
      const failureNoise = (round + action.length + (arm === 'B' ? 1 : 0)) % 509 === 0;
      rows.push({
        sample_id: makeSampleId({
          run_id: runId,
          block_id: blockId,
          arm,
          attempt_id: attemptId,
          round_id: roundLabel,
          channel: 'functional',
          action_seq: actionSeq
        }),
        run_id: runId,
        block_id: blockId,
        arm,
        attempt_id: attemptId,
        round_id: roundLabel,
        action,
        action_seq: actionSeq,
        success: failureNoise ? false : true,
        latency_ms: latency,
        error_code: failureNoise ? 'SYNTH_FAIL' : '',
        error_msg: failureNoise ? `synthetic failure at ${action}` : '',
        ts: new Date(baseTs + round * 1200).toISOString()
      });
    }
  }
  return rows;
}

function main() {
  const spec = {
    'run-id': { type: 'string', required: true, description: 'Run id' },
    'block-id': { type: 'string', required: true, description: 'Block id' },
    arm: { type: 'string', required: true, choices: ['A', 'B'], description: 'AB arm' },
    'attempt-id': { type: 'string', required: true, description: 'Attempt id' },
    'action-pack': { type: 'string', required: true, description: 'Comma list: send,edit,branch,tree,quicknav' },
    'interval-rounds': { type: 'int', default: 5, validate: (v) => v > 0, description: 'Execute action-pack every N rounds' },
    rounds: { type: 'int', default: 20, validate: (v) => v > 0, description: 'Round count for synthetic generation' },
    source: { type: 'string', default: 'synthetic', choices: ['synthetic', 'path'], description: 'Data source' },
    input: { type: 'string', default: '', description: 'Input json path when source=path' },
    out: { type: 'string', default: '', description: 'Output csv path (optional)' },
    'out-root': { type: 'string', default: '', description: 'Run root path (optional)' }
  };

  const { help, args } = parseArgs(process.argv.slice(2), spec);
  if (help) {
    process.stdout.write(
      formatHelp(
        {
          usage:
            'node dev/test-chatgpt-perf-functional-regression.js --run-id <id> --block-id <id> --arm <A|B> --attempt-id <id> --action-pack send,edit,branch,tree,quicknav [--interval-rounds 5] [--rounds 20] [--source synthetic|path] [--input file] [--out path]',
          description:
            'Generate/collect functional regression action results and export functional.csv (run_id, block_id, arm, attempt_id, round_id, action, success, latency_ms, error_code, error_msg, ts).',
          examples: [
            'node dev/test-chatgpt-perf-functional-regression.js --run-id run-20260227T120000Z-abcd123 --block-id b01-AthenB --arm A --attempt-id att-001 --action-pack send,edit,branch,tree,quicknav --interval-rounds 5 --rounds 20',
            'node dev/test-chatgpt-perf-functional-regression.js --run-id run-20260227T120000Z-abcd123 --block-id b02-BthenA --arm B --attempt-id att-002 --action-pack send,edit,branch,tree,quicknav --source path --input ./tmp/functional-source.json --out ./.omx/logs/chatgpt-perf-ab/run-.../raw/functional/b02-BthenA/B/att-002/functional.csv'
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
  const actions = normalizeActionPack(args.actionPack);
  const intervalRounds = Number(args.intervalRounds);
  const roundsTotal = Number(args.rounds);
  const source = String(args.source || 'synthetic').trim().toLowerCase();
  const inputPath = String(args.input || '').trim() ? path.resolve(String(args.input).trim()) : '';
  const outRoot = String(args.outRoot || '').trim() ? path.resolve(String(args.outRoot).trim()) : '';

  if (!runId) throw new ExitError(EXIT_CODES.ARG_ERROR, 'run-id is empty');
  if (!blockId) throw new ExitError(EXIT_CODES.ARG_ERROR, 'block-id is empty');
  if (!attemptId) throw new ExitError(EXIT_CODES.ARG_ERROR, 'attempt-id is empty');

  let rows;
  if (source === 'path') {
    if (!inputPath) throw new ExitError(EXIT_CODES.ARG_ERROR, '--input is required when source=path');
    if (!fs.existsSync(inputPath)) throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, `input not found: ${inputPath}`);
    rows = normalizeInputRows(readJson(inputPath)).map((row) => ({
      sample_id: makeSampleId({
        run_id: runId,
        block_id: blockId,
        arm,
        attempt_id: attemptId,
        round_id: roundId(row.round_ord),
        channel: 'functional',
        action_seq: row.action_seq
      }),
      run_id: runId,
      block_id: blockId,
      arm,
      attempt_id: attemptId,
      round_id: roundId(row.round_ord),
      action: row.action,
      action_seq: row.action_seq,
      success: row.success,
      latency_ms: row.latency_ms,
      error_code: row.error_code,
      error_msg: row.error_msg,
      ts: row.ts
    }));
  } else {
    rows = buildSyntheticRows({
      runId,
      blockId,
      arm,
      attemptId,
      actions,
      intervalRounds,
      roundsTotal
    });
  }
  if (!rows.length) throw new ExitError(EXIT_CODES.DATA_QUALITY_FAILED, 'functional rows empty');

  const outPath =
    String(args.out || '').trim()
      ? path.resolve(String(args.out).trim())
      : path.join(outRoot || process.cwd(), 'raw', 'functional', blockId, arm, attemptId, 'functional.csv');

  writeCsv(outPath, rows, [
    'sample_id',
    'run_id',
    'block_id',
    'arm',
    'attempt_id',
    'round_id',
    'action',
    'action_seq',
    'success',
    'latency_ms',
    'error_code',
    'error_msg',
    'ts'
  ]);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        run_id: runId,
        block_id: blockId,
        arm,
        attempt_id: attemptId,
        source,
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
