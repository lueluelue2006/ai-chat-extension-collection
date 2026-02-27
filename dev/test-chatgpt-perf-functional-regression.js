#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const EXIT = Object.freeze({
  OK: 0,
  USAGE: 10,
  REQUIRED: 11,
  NO_SESSION: 20,
  INPUT_READ: 21,
  INPUT_PARSE: 22,
  OUTPUT_WRITE: 30,
  VALIDATION: 40,
  TIMEOUT: 50,
  INTERNAL: 99
});

class CliError extends Error {
  constructor(exitCode, message) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

function usage() {
  return [
    'Usage:',
    '  node dev/test-chatgpt-perf-functional-regression.js \\',
    '    --action-package <name> \\',
    '    [--source synthetic|path] \\',
    '    [--input <json-file>] \\',
    '    [--out-root <dir>] \\',
    '    [--out-csv functional.csv]',
    '',
    'Notes:',
    '  - source=path: read real action result JSON from --input',
    '  - source=synthetic: generate synthetic result rows',
    '',
    'Exit codes: 0/10/11/20/21/22/30/40/50/99'
  ].join('\n');
}

function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new CliError(EXIT.USAGE, `Unexpected positional argument: ${arg}`);
    }
    const eq = arg.indexOf('=');
    let key = '';
    let value = '';
    if (eq >= 0) {
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      const next = argv[i + 1];
      if (next != null && !String(next).startsWith('--')) {
        value = String(next);
        i += 1;
      } else {
        value = 'true';
      }
    }
    out[key] = value;
  }

  const known = new Set(['help', 'action-package', 'source', 'input', 'out-root', 'out-csv']);
  for (const key of Object.keys(out)) {
    if (!known.has(key)) throw new CliError(EXIT.USAGE, `Unknown argument: --${key}`);
  }
  return out;
}

function mustString(opts, key) {
  const text = String(opts[key] || '').trim();
  if (!text) throw new CliError(EXIT.REQUIRED, `Missing required argument: --${key}`);
  return text;
}

function readFileUtf8(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new CliError(EXIT.INPUT_READ, `Failed to read file: ${file} (${error.message})`);
  }
}

function readJson(file) {
  const text = readFileUtf8(file);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(EXIT.INPUT_PARSE, `Invalid JSON: ${file} (${error.message})`);
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    throw new CliError(EXIT.OUTPUT_WRITE, `Failed to create directory: ${dir} (${error.message})`);
  }
}

function writeFileUtf8(file, content) {
  try {
    fs.writeFileSync(file, content, 'utf8');
  } catch (error) {
    throw new CliError(EXIT.OUTPUT_WRITE, `Failed to write file: ${file} (${error.message})`);
  }
}

function escapeCsv(value) {
  const text = String(value == null ? '' : value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizeStatus(status, errorText) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'pass' || s === 'ok') return 'pass';
  if (s === 'fail' || s === 'error') return 'fail';
  return errorText ? 'fail' : 'pass';
}

function pickActionsFromJson(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    if (Array.isArray(input.actions)) return input.actions;
    if (Array.isArray(input.results)) return input.results;
    if (Array.isArray(input.data)) return input.data;
  }
  throw new CliError(EXIT.INPUT_PARSE, 'Input JSON must be an array or include actions/results/data array');
}

function normalizeRows(actionPackage, actions, synthetic) {
  const rows = [];
  for (let i = 0; i < actions.length; i += 1) {
    const item = actions[i];
    if (!item || typeof item !== 'object') continue;

    const errorText = String(item.error || item.err || '').trim();
    rows.push({
      actionPackage,
      actionId: String(item.actionId || item.id || `action_${i + 1}`),
      step: String(item.step || item.name || `step_${i + 1}`),
      status: normalizeStatus(item.status, errorText),
      expected: String(item.expected || ''),
      actual: String(item.actual || ''),
      latencyMs: Number.isFinite(Number(item.latencyMs)) ? Math.max(0, Number(item.latencyMs)) : '',
      synthetic: synthetic || item.synthetic === true ? 'true' : 'false',
      error: errorText,
      timestamp: String(item.timestamp || item.ts || new Date().toISOString())
    });
  }
  return rows;
}

function buildSyntheticRows(actionPackage) {
  const now = Date.now();
  const syntheticActions = [
    { actionId: 'open_chat', step: 'open chat page', latencyMs: 180 },
    { actionId: 'switch_model', step: 'switch model preset', latencyMs: 220 },
    { actionId: 'paste_prompt', step: 'paste prompt text', latencyMs: 95 },
    { actionId: 'send_prompt', step: 'send prompt', latencyMs: 140 },
    { actionId: 'receive_reply', step: 'receive first token', latencyMs: 820 }
  ];
  return syntheticActions.map((item, idx) => ({
    actionPackage,
    actionId: item.actionId,
    step: item.step,
    status: 'pass',
    expected: 'action succeeds',
    actual: 'synthetic baseline',
    latencyMs: item.latencyMs,
    synthetic: 'true',
    error: '',
    timestamp: new Date(now + idx * 1000).toISOString()
  }));
}

function toCsv(rows) {
  const header = [
    'action_package',
    'action_id',
    'step',
    'status',
    'expected',
    'actual',
    'latency_ms',
    'synthetic',
    'error',
    'timestamp'
  ];

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.actionPackage,
        row.actionId,
        row.step,
        row.status,
        row.expected,
        row.actual,
        row.latencyMs,
        row.synthetic,
        row.error,
        row.timestamp
      ]
        .map(escapeCsv)
        .join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const opts = parseArgv(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return EXIT.OK;
  }

  const actionPackage = mustString(opts, 'action-package');
  const source = String(opts.source || 'synthetic').trim().toLowerCase();
  if (source !== 'synthetic' && source !== 'path') {
    throw new CliError(EXIT.VALIDATION, `Unsupported --source: ${source}`);
  }

  let rows = [];
  if (source === 'synthetic') {
    rows = buildSyntheticRows(actionPackage);
  } else {
    const inputPath = path.resolve(mustString(opts, 'input'));
    const json = readJson(inputPath);
    const actions = pickActionsFromJson(json);
    rows = normalizeRows(actionPackage, actions, false);
  }

  if (!rows.length) {
    throw new CliError(EXIT.VALIDATION, 'No action rows available for functional.csv');
  }

  const outRoot = path.resolve(String(opts['out-root'] || process.cwd()));
  const outName = String(opts['out-csv'] || 'functional.csv').trim();
  if (!outName) {
    throw new CliError(EXIT.REQUIRED, 'Argument --out-csv cannot be empty');
  }

  const outCsv = path.isAbsolute(outName) ? outName : path.join(outRoot, outName);
  ensureDir(path.dirname(outCsv));
  writeFileUtf8(outCsv, toCsv(rows));

  console.log(
    JSON.stringify({
      ok: true,
      code: EXIT.OK,
      source,
      rows: rows.length,
      output: outCsv
    })
  );
  return EXIT.OK;
}

try {
  const code = main();
  process.exitCode = Number.isInteger(code) ? code : EXIT.OK;
} catch (error) {
  const exitCode =
    error instanceof CliError && Number.isInteger(error.exitCode)
      ? error.exitCode
      : EXIT.INTERNAL;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FAIL] ${message}`);
  process.exitCode = exitCode;
}
