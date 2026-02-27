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
    '  node dev/test-chatgpt-perf-extract-reply-timer.js --source path --input <json-array-file> [--out-root <dir>] [--out-csv reply-timer.csv]',
    '  node dev/test-chatgpt-perf-extract-reply-timer.js --source session   # returns code=20 (no browser session attached)',
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

  const known = new Set(['help', 'source', 'input', 'out-root', 'out-csv']);
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

function readJsonArray(file) {
  const text = readFileUtf8(file);
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new CliError(EXIT.INPUT_PARSE, `Invalid JSON: ${file} (${error.message})`);
  }
  if (!Array.isArray(data)) {
    throw new CliError(EXIT.INPUT_PARSE, 'Input JSON must be an array');
  }
  return data;
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    throw new CliError(EXIT.OUTPUT_WRITE, `Failed to create directory: ${dir} (${error.message})`);
  }
}

function writeText(file, content) {
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

function toEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value || '').trim();
  if (!text) return NaN;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) return asNumber;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toIso(valueMs) {
  if (!Number.isFinite(valueMs)) return '';
  return new Date(valueMs).toISOString();
}

function extractRows(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || typeof item !== 'object') continue;

    const sendMs = toEpochMs(item.sendAt ?? item.send_at ?? item.sendTs ?? item.send_ts_ms);
    const doneMs = toEpochMs(item.doneAt ?? item.done_at ?? item.replyDoneAt ?? item.doneTs ?? item.done_ts_ms);
    const latencyRaw = Number(item.latencyMs ?? item.latency_ms);
    const hasLatency = Number.isFinite(latencyRaw);
    const derivedLatency = Number.isFinite(sendMs) && Number.isFinite(doneMs) ? doneMs - sendMs : NaN;
    const latencyMs = hasLatency ? latencyRaw : derivedLatency;

    if (!Number.isFinite(sendMs) && !Number.isFinite(doneMs) && !Number.isFinite(latencyMs)) {
      continue;
    }

    rows.push({
      index: i + 1,
      round: Number.isFinite(Number(item.round)) ? Number(item.round) : i + 1,
      sendAt: toIso(sendMs),
      doneAt: toIso(doneMs),
      latencyMs: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : '',
      synthetic: item.synthetic === true ? 'true' : 'false',
      rawIndex: i
    });
  }
  return rows;
}

function toCsv(rows) {
  const header = ['index', 'round', 'send_at', 'done_at', 'latency_ms', 'synthetic', 'raw_index'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [row.index, row.round, row.sendAt, row.doneAt, row.latencyMs, row.synthetic, row.rawIndex]
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

  const source = String(opts.source || '').trim().toLowerCase();
  if (!source) throw new CliError(EXIT.REQUIRED, 'Missing required argument: --source');

  if (source === 'session') {
    throw new CliError(EXIT.NO_SESSION, 'source=session is not available: no browser session connected');
  }
  if (source !== 'path') {
    throw new CliError(EXIT.VALIDATION, `Unsupported --source: ${source}`);
  }

  const inputPath = path.resolve(mustString(opts, 'input'));
  const rows = extractRows(readJsonArray(inputPath));
  if (!rows.length) {
    throw new CliError(EXIT.VALIDATION, 'No valid reply timer rows found in input JSON array');
  }

  const outRoot = path.resolve(String(opts['out-root'] || process.cwd()));
  const outName = String(opts['out-csv'] || 'reply-timer.csv').trim();
  if (!outName) throw new CliError(EXIT.REQUIRED, '--out-csv cannot be empty');
  const outCsv = path.isAbsolute(outName) ? outName : path.join(outRoot, outName);

  ensureDir(path.dirname(outCsv));
  writeText(outCsv, toCsv(rows));

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
