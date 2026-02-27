#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXIT_CODES = Object.freeze({
  OK: 0,
  ARG_ERROR: 10,
  PRECONDITION_FAILED: 11,
  ENV_UNAVAILABLE: 20,
  WRITE_FAILED: 21,
  SCHEMA_INVALID: 22,
  DATA_QUALITY_FAILED: 30,
  ASSERTION_FAILED: 40,
  TIMEOUT: 50,
  FATAL: 99
});

class ExitError extends Error {
  constructor(exitCode, message, details) {
    super(message);
    this.name = 'ExitError';
    this.exitCode = Number.isInteger(exitCode) ? exitCode : EXIT_CODES.FATAL;
    this.details = details;
  }
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((x) => stableStringify(x)).join(',')}]`;
  const keys = Object.keys(value).sort();
  const body = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',');
  return `{${body}}`;
}

function sha256(input) {
  const payload = typeof input === 'string' || Buffer.isBuffer(input) ? input : stableStringify(input);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function ensureDir(dirPath) {
  const abs = path.resolve(String(dirPath));
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value, options = {}) {
  ensureDir(path.dirname(filePath));
  const spaces = Number.isInteger(options.spaces) ? options.spaces : 2;
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, spaces)}\n`, 'utf8');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      continue;
    }
    if (ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''));
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const row = {};
    const cells = parseCsvLine(lines[i]);
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cells[j] !== undefined ? cells[j] : '';
    }
    rows.push(row);
  }
  return rows;
}

function writeCsv(filePath, rows, headers) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeHeaders = Array.isArray(headers) && headers.length
    ? headers
    : Array.from(
      safeRows.reduce((set, row) => {
        if (isObject(row)) Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set())
    );
  const lines = [safeHeaders.join(',')];
  for (const row of safeRows) {
    lines.push(safeHeaders.map((k) => csvEscape(row ? row[k] : '')).join(','));
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function readNdjson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeNdjson(filePath, records, options = {}) {
  const safeRecords = Array.isArray(records) ? records : [];
  const payload = safeRecords.map((x) => JSON.stringify(x)).join('\n');
  ensureDir(path.dirname(filePath));
  if (options.append) fs.appendFileSync(filePath, payload ? `${payload}\n` : '', 'utf8');
  else fs.writeFileSync(filePath, payload ? `${payload}\n` : '', 'utf8');
}

function normalizeFiniteNumbers(values) {
  return (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
}

function quantile(values, q) {
  const nums = normalizeFiniteNumbers(values).sort((a, b) => a - b);
  if (!nums.length) return Number.NaN;
  const qq = Number(q);
  if (!Number.isFinite(qq)) return Number.NaN;
  if (qq <= 0) return nums[0];
  if (qq >= 1) return nums[nums.length - 1];
  const pos = (nums.length - 1) * qq;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return nums[lo];
  const w = pos - lo;
  return nums[lo] * (1 - w) + nums[hi] * w;
}

function mean(values) {
  const nums = normalizeFiniteNumbers(values);
  if (!nums.length) return Number.NaN;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function toSeed(raw) {
  if (Number.isInteger(raw) && raw >= 0) return raw >>> 0;
  return Number.parseInt(sha256(String(raw === undefined ? 'seed' : raw)).slice(0, 8), 16) >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function resample(values, rand) {
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    out[i] = values[Math.floor(rand() * values.length)];
  }
  return out;
}

function bootstrapDifference(sampleA, sampleB, options = {}) {
  const a = normalizeFiniteNumbers(sampleA);
  const b = normalizeFiniteNumbers(sampleB);
  if (!a.length || !b.length) {
    return { estimate: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN, resamples: 0 };
  }
  const statFn = typeof options.statFn === 'function' ? options.statFn : mean;
  const resamples = Math.max(100, Number.parseInt(options.resamples, 10) || 1000);
  const alpha = Number.isFinite(Number(options.alpha)) ? Number(options.alpha) : 0.05;
  const rand = mulberry32(toSeed(options.seed));
  const diffs = [];
  for (let i = 0; i < resamples; i += 1) {
    const sa = resample(a, rand);
    const sb = resample(b, rand);
    const diff = Number(statFn(sb)) - Number(statFn(sa));
    if (Number.isFinite(diff)) diffs.push(diff);
  }
  return {
    estimate: Number(statFn(b)) - Number(statFn(a)),
    ciLow: quantile(diffs, alpha / 2),
    ciHigh: quantile(diffs, 1 - alpha / 2),
    resamples: diffs.length
  };
}

function permutationTest(sampleA, sampleB, options = {}) {
  const a = normalizeFiniteNumbers(sampleA);
  const b = normalizeFiniteNumbers(sampleB);
  if (!a.length || !b.length) {
    return { observed: Number.NaN, pValue: Number.NaN, resamples: 0 };
  }
  const statFn = typeof options.statFn === 'function' ? options.statFn : mean;
  const resamples = Math.max(100, Number.parseInt(options.resamples, 10) || 1000);
  const rand = mulberry32(toSeed(options.seed));
  const tail = String(options.tail || 'two-sided');
  const observed = Number(statFn(b)) - Number(statFn(a));
  const pool = [...a, ...b];
  const sizeA = a.length;
  let hits = 0;
  for (let i = 0; i < resamples; i += 1) {
    const shuffled = pool.slice();
    for (let j = shuffled.length - 1; j > 0; j -= 1) {
      const k = Math.floor(rand() * (j + 1));
      const t = shuffled[j];
      shuffled[j] = shuffled[k];
      shuffled[k] = t;
    }
    const pa = shuffled.slice(0, sizeA);
    const pb = shuffled.slice(sizeA);
    const diff = Number(statFn(pb)) - Number(statFn(pa));
    if (!Number.isFinite(diff)) continue;
    if (tail === 'greater') {
      if (diff >= observed) hits += 1;
    } else if (tail === 'less') {
      if (diff <= observed) hits += 1;
    } else if (Math.abs(diff) >= Math.abs(observed)) {
      hits += 1;
    }
  }
  return { observed, pValue: (hits + 1) / (resamples + 1), resamples };
}

function iqrOutlierFilter(values, options = {}) {
  const multiplier = Number.isFinite(Number(options.multiplier)) ? Number(options.multiplier) : 3;
  const nums = normalizeFiniteNumbers(values);
  if (nums.length < 4) {
    return {
      lower: Number.NEGATIVE_INFINITY,
      upper: Number.POSITIVE_INFINITY,
      outlierIndices: [],
      keptIndices: values.map((_, idx) => idx)
    };
  }
  const q1 = quantile(nums, 0.25);
  const q3 = quantile(nums, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - multiplier * iqr;
  const upper = q3 + multiplier * iqr;
  const outlierIndices = [];
  const keptIndices = [];
  for (let i = 0; i < values.length; i += 1) {
    const n = Number(values[i]);
    if (!Number.isFinite(n)) continue;
    if (n < lower || n > upper) outlierIndices.push(i);
    else keptIndices.push(i);
  }
  return { lower, upper, outlierIndices, keptIndices };
}

function isMissingValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function computeMissingRate(rows, requiredFields) {
  const records = Array.isArray(rows) ? rows : [];
  const fields = Array.isArray(requiredFields) ? requiredFields : [];
  const missingByField = {};
  fields.forEach((field) => {
    missingByField[field] = 0;
  });
  let missingRows = 0;
  for (const row of records) {
    let rowMissing = false;
    for (const field of fields) {
      const missing = isMissingValue(row ? row[field] : undefined);
      if (missing) {
        missingByField[field] += 1;
        rowMissing = true;
      }
    }
    if (rowMissing) missingRows += 1;
  }
  const total = records.length;
  const missingRateByField = {};
  for (const field of fields) {
    missingRateByField[field] = total ? missingByField[field] / total : 0;
  }
  return {
    total,
    fields,
    missingRows,
    overallMissingRate: total ? missingRows / total : 0,
    missingByField,
    missingRateByField
  };
}

function toBool(raw, fieldName = 'value') {
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n' || s === 'off') return false;
  throw new ExitError(EXIT_CODES.ARG_ERROR, `Invalid boolean for --${fieldName}: ${raw}`);
}

function toNumber(raw, fieldName) {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new ExitError(EXIT_CODES.ARG_ERROR, `Invalid number for --${fieldName}: ${raw}`);
  return n;
}

function toInt(raw, fieldName) {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(n)) throw new ExitError(EXIT_CODES.ARG_ERROR, `Invalid integer for --${fieldName}: ${raw}`);
  return n;
}

function parseArgs(argv, spec = {}, options = {}) {
  const args = {};
  const positionals = [];
  const normalizedSpec = {};
  for (const [name, rawRule] of Object.entries(spec)) {
    const rule = isObject(rawRule) ? { ...rawRule } : { type: String(rawRule) };
    const dest = rule.dest || name.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    normalizedSpec[name] = { ...rule, dest };
    if (rule.default !== undefined) args[dest] = rule.default;
  }

  const tokens = Array.isArray(argv) ? argv.slice() : [];
  let help = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const eqIdx = token.indexOf('=');
    const key = eqIdx >= 0 ? token.slice(2, eqIdx) : token.slice(2);
    const rule = normalizedSpec[key];
    if (!rule) {
      if (options.allowUnknown) continue;
      throw new ExitError(EXIT_CODES.ARG_ERROR, `Unknown argument: --${key}`);
    }

    let rawValue = eqIdx >= 0 ? token.slice(eqIdx + 1) : undefined;
    if (rawValue === undefined) {
      if (rule.type === 'boolean') {
        const maybe = tokens[i + 1];
        if (maybe !== undefined && !maybe.startsWith('--')) {
          rawValue = maybe;
          i += 1;
        } else {
          rawValue = 'true';
        }
      } else {
        const next = tokens[i + 1];
        if (next === undefined || next.startsWith('--')) throw new ExitError(EXIT_CODES.ARG_ERROR, `Missing value for --${key}`);
        rawValue = next;
        i += 1;
      }
    }

    let parsed = rawValue;
    if (rule.type === 'boolean') parsed = toBool(rawValue, key);
    else if (rule.type === 'int') parsed = toInt(rawValue, key);
    else if (rule.type === 'number') parsed = toNumber(rawValue, key);
    else parsed = String(rawValue);

    if (Array.isArray(rule.choices) && rule.choices.length && !rule.choices.includes(parsed)) {
      throw new ExitError(EXIT_CODES.ARG_ERROR, `Invalid value for --${key}: ${parsed}`);
    }
    if (typeof rule.validate === 'function' && !rule.validate(parsed)) {
      throw new ExitError(EXIT_CODES.ARG_ERROR, `Validation failed for --${key}: ${parsed}`);
    }
    args[rule.dest] = parsed;
  }

  if (!help) {
    for (const [name, rule] of Object.entries(normalizedSpec)) {
      const value = args[rule.dest];
      if (rule.required && (value === undefined || value === null || value === '')) {
        throw new ExitError(EXIT_CODES.ARG_ERROR, `Missing required argument: --${name}`);
      }
    }
  }

  return { help, args, positionals, spec: normalizedSpec };
}

function formatHelp(meta = {}, spec = {}) {
  const lines = [];
  if (meta.usage) lines.push(`Usage: ${meta.usage}`);
  if (meta.description) lines.push(meta.description);
  if (Object.keys(spec).length) {
    lines.push('');
    lines.push('Options:');
    for (const [name, rawRule] of Object.entries(spec)) {
      const rule = isObject(rawRule) ? rawRule : { type: String(rawRule) };
      const type = rule.type || 'string';
      const req = rule.required ? 'required' : 'optional';
      const def = rule.default !== undefined ? ` default=${JSON.stringify(rule.default)}` : '';
      const choices = Array.isArray(rule.choices) && rule.choices.length ? ` choices=${rule.choices.join('|')}` : '';
      const desc = rule.description ? ` - ${rule.description}` : '';
      lines.push(`  --${name} <${type}> (${req}${def}${choices})${desc}`);
    }
  }
  if (Array.isArray(meta.examples) && meta.examples.length) {
    lines.push('');
    lines.push('Examples:');
    meta.examples.forEach((ex) => lines.push(`  ${ex}`));
  }
  return `${lines.join('\n')}\n`;
}

function asExitCode(error) {
  if (error instanceof ExitError && Number.isInteger(error.exitCode)) return error.exitCode;
  const code = String(error && error.code ? error.code : '').toUpperCase();
  if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return EXIT_CODES.PRECONDITION_FAILED;
  return EXIT_CODES.FATAL;
}

function safeExit(code, payload) {
  const exitCode = Number.isInteger(code) ? code : EXIT_CODES.FATAL;
  if (payload !== undefined && payload !== null) {
    if (typeof payload === 'string') {
      if (exitCode === EXIT_CODES.OK) process.stdout.write(`${payload}\n`);
      else process.stderr.write(`${payload}\n`);
    } else {
      const text = JSON.stringify(payload, null, 2);
      if (exitCode === EXIT_CODES.OK) process.stdout.write(`${text}\n`);
      else process.stderr.write(`${text}\n`);
    }
  }
  process.exit(exitCode);
}

module.exports = {
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
  writeNdjson,
  sha256,
  quantile,
  mean,
  bootstrapDifference,
  permutationTest,
  iqrOutlierFilter,
  computeMissingRate,
  deepClone,
  safeExit
};
