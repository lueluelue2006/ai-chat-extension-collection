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
    '  node dev/test-chatgpt-perf-extract-bench.js --source logfile --input <console.log> [--out-root <dir>] [--out-ndjson bench.ndjson]',
    '  node dev/test-chatgpt-perf-extract-bench.js --source console   # returns code=20 (no attached browser console)',
    '',
    'Extracts lines containing "[cgptperf] bench" and parses first JSON object per matching line.',
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

  const known = new Set(['help', 'source', 'input', 'out-root', 'out-ndjson']);
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

function writeText(file, content) {
  try {
    fs.writeFileSync(file, content, 'utf8');
  } catch (error) {
    throw new CliError(EXIT.OUTPUT_WRITE, `Failed to write file: ${file} (${error.message})`);
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    throw new CliError(EXIT.OUTPUT_WRITE, `Failed to create directory: ${dir} (${error.message})`);
  }
}

function findFirstJsonObject(text) {
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
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return '';
}

function extractBenchRecords(logText) {
  const marker = '[cgptperf] bench';
  const lines = logText.split(/\r?\n/);
  const records = [];
  let parseErrors = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const markerIndex = line.indexOf(marker);
    if (markerIndex < 0) continue;

    const tail = line.slice(markerIndex + marker.length);
    const jsonText = findFirstJsonObject(tail);
    if (!jsonText) {
      parseErrors += 1;
      continue;
    }

    try {
      const payload = JSON.parse(jsonText);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        parseErrors += 1;
        continue;
      }
      records.push({
        ...payload,
        _line: i + 1,
        _marker: marker
      });
    } catch {
      parseErrors += 1;
    }
  }
  return { records, parseErrors };
}

function toNdjson(records) {
  return records.map((row) => JSON.stringify(row)).join('\n') + (records.length ? '\n' : '');
}

function main() {
  const opts = parseArgv(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return EXIT.OK;
  }

  const source = String(opts.source || '').trim().toLowerCase();
  if (!source) throw new CliError(EXIT.REQUIRED, 'Missing required argument: --source');

  if (source === 'console') {
    throw new CliError(EXIT.NO_SESSION, 'source=console is not available: no browser console session connected');
  }
  if (source !== 'logfile') {
    throw new CliError(EXIT.VALIDATION, `Unsupported --source: ${source}`);
  }

  const inputPath = path.resolve(mustString(opts, 'input'));
  const logText = readFileUtf8(inputPath);
  const { records, parseErrors } = extractBenchRecords(logText);
  if (!records.length) {
    throw new CliError(EXIT.VALIDATION, 'No [cgptperf] bench JSON records found in logfile');
  }

  const outRoot = path.resolve(String(opts['out-root'] || process.cwd()));
  const outName = String(opts['out-ndjson'] || 'bench.ndjson').trim();
  if (!outName) throw new CliError(EXIT.REQUIRED, '--out-ndjson cannot be empty');
  const outNdjson = path.isAbsolute(outName) ? outName : path.join(outRoot, outName);

  ensureDir(path.dirname(outNdjson));
  writeText(outNdjson, toNdjson(records));

  console.log(
    JSON.stringify({
      ok: true,
      code: EXIT.OK,
      source,
      records: records.length,
      parseErrors,
      output: outNdjson
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
