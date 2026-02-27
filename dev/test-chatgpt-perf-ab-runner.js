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
    '  node dev/test-chatgpt-perf-ab-runner.js \\',
    '    --run-id <id> \\',
    '    --stage <name> \\',
    '    --block-id <id> \\',
    '    --arm <A|B|...> \\',
    '    --rounds <n> \\',
    '    --attempt-id <id> \\',
    '    --prompt-template <file> \\',
    '    --max-wall-clock-min <minutes> \\',
    '    --out-root <dir> \\',
    '    [--resume-from <attempt-meta-or-dir>] \\',
    '    [--mode synthetic]',
    '',
    'Exit codes:',
    '  0  success',
    ' 10  usage error / unknown argument',
    ' 11  missing required argument / invalid required value',
    ' 20  browser session unavailable (reserved)',
    ' 21  input file read error',
    ' 22  input file parse error',
    ' 30  output write error',
    ' 40  validation error',
    ' 50  max wall clock reached',
    ' 99  internal error'
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

    let key = '';
    let value = '';
    const eq = arg.indexOf('=');
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

  const known = new Set([
    'help',
    'run-id',
    'stage',
    'block-id',
    'arm',
    'rounds',
    'attempt-id',
    'prompt-template',
    'max-wall-clock-min',
    'resume-from',
    'out-root',
    'mode'
  ]);

  for (const key of Object.keys(out)) {
    if (!known.has(key)) {
      throw new CliError(EXIT.USAGE, `Unknown argument: --${key}`);
    }
  }
  return out;
}

function mustString(opts, key) {
  const text = String(opts[key] || '').trim();
  if (!text) {
    throw new CliError(EXIT.REQUIRED, `Missing required argument: --${key}`);
  }
  return text;
}

function mustPositiveInt(opts, key) {
  const raw = mustString(opts, key);
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CliError(EXIT.REQUIRED, `Argument --${key} must be a positive integer`);
  }
  return value;
}

function mustPositiveNumber(opts, key) {
  const raw = mustString(opts, key);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new CliError(EXIT.REQUIRED, `Argument --${key} must be a positive number`);
  }
  return value;
}

function safeSegment(input) {
  const text = String(input || '').trim();
  const sanitized = text.replace(/[^0-9A-Za-z._-]/g, '_');
  if (!sanitized) {
    throw new CliError(EXIT.VALIDATION, `Invalid path segment: "${text}"`);
  }
  return sanitized;
}

function readFileUtf8(file, errorCode = EXIT.INPUT_READ) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new CliError(errorCode, `Failed to read file: ${file} (${error.message})`);
  }
}

function readJson(file) {
  const text = readFileUtf8(file, EXIT.INPUT_READ);
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

function writeText(file, content) {
  try {
    fs.writeFileSync(file, content, 'utf8');
  } catch (error) {
    throw new CliError(EXIT.OUTPUT_WRITE, `Failed to write file: ${file} (${error.message})`);
  }
}

function writeJson(file, value) {
  writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

function countNdjsonLines(file) {
  if (!fs.existsSync(file)) return 0;
  const text = readFileUtf8(file, EXIT.INPUT_READ);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function parseResume(resumeFromRaw) {
  if (!resumeFromRaw) return null;
  const inputPath = path.resolve(resumeFromRaw);
  if (!fs.existsSync(inputPath)) {
    throw new CliError(EXIT.INPUT_READ, `--resume-from not found: ${inputPath}`);
  }

  const stat = fs.statSync(inputPath);
  const metaPath = stat.isDirectory() ? path.join(inputPath, 'attempt.meta.json') : inputPath;
  if (!fs.existsSync(metaPath)) {
    throw new CliError(EXIT.INPUT_READ, `Resume metadata not found: ${metaPath}`);
  }
  const meta = readJson(metaPath);
  const previousAttemptDir = path.dirname(metaPath);
  const roundsPath = path.join(previousAttemptDir, 'rounds.ndjson');
  const previousRounds = countNdjsonLines(roundsPath);

  return {
    inputPath,
    metaPath,
    previousAttemptDir,
    previousAttemptId: String(meta.attemptId || '').trim() || '',
    previousRounds
  };
}

function main() {
  const opts = parseArgv(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return EXIT.OK;
  }

  const mode = String(opts.mode || 'synthetic').trim().toLowerCase();
  if (mode !== 'synthetic') {
    throw new CliError(EXIT.VALIDATION, `Unsupported mode: ${mode}. Only synthetic is available right now.`);
  }

  const runId = mustString(opts, 'run-id');
  const stage = mustString(opts, 'stage');
  const blockId = mustString(opts, 'block-id');
  const arm = mustString(opts, 'arm');
  const roundsTarget = mustPositiveInt(opts, 'rounds');
  const attemptId = mustString(opts, 'attempt-id');
  const promptTemplate = path.resolve(mustString(opts, 'prompt-template'));
  const maxWallClockMin = mustPositiveNumber(opts, 'max-wall-clock-min');
  const outRoot = path.resolve(mustString(opts, 'out-root'));
  const resumeInfo = parseResume(String(opts['resume-from'] || '').trim());

  if (!fs.existsSync(promptTemplate)) {
    throw new CliError(EXIT.INPUT_READ, `Prompt template not found: ${promptTemplate}`);
  }
  const promptText = readFileUtf8(promptTemplate, EXIT.INPUT_READ);
  if (!promptText.trim()) {
    throw new CliError(EXIT.VALIDATION, `Prompt template is empty: ${promptTemplate}`);
  }

  const previousRounds = resumeInfo ? resumeInfo.previousRounds : 0;
  if (previousRounds > roundsTarget) {
    throw new CliError(
      EXIT.VALIDATION,
      `Resume rounds (${previousRounds}) exceed requested rounds (${roundsTarget})`
    );
  }

  const attemptDir = path.join(
    outRoot,
    safeSegment(runId),
    safeSegment(stage),
    safeSegment(blockId),
    safeSegment(arm),
    safeSegment(attemptId)
  );
  const attemptMetaPath = path.join(attemptDir, 'attempt.meta.json');
  const roundsPath = path.join(attemptDir, 'rounds.ndjson');
  const eventsPath = path.join(attemptDir, 'events.ndjson');

  if (fs.existsSync(attemptMetaPath) || fs.existsSync(roundsPath) || fs.existsSync(eventsPath)) {
    throw new CliError(EXIT.VALIDATION, `Attempt output already exists, use a new --attempt-id: ${attemptDir}`);
  }
  ensureDir(attemptDir);

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const maxWallClockMs = maxWallClockMin * 60 * 1000;

  const roundsRows = [];
  const eventRows = [];
  const synthetic = true;
  let producedRounds = 0;
  let status = 'done';

  eventRows.push(
    JSON.stringify({
      event: 'attempt_start',
      ts: startedAt,
      runId,
      stage,
      blockId,
      arm,
      attemptId,
      roundsTarget,
      synthetic,
      resumeFrom: resumeInfo ? resumeInfo.inputPath : null,
      previousRounds
    })
  );

  for (let round = previousRounds + 1; round <= roundsTarget; round += 1) {
    const elapsed = Date.now() - startMs;
    if (elapsed > maxWallClockMs) {
      status = 'timeout';
      break;
    }

    const sendMs = Date.now();
    const latencyMs = 700 + ((round * 37 + arm.length * 11) % 900);
    const doneMs = sendMs + latencyMs;
    const sendAt = new Date(sendMs).toISOString();
    const doneAt = new Date(doneMs).toISOString();
    const localRound = producedRounds + 1;

    roundsRows.push(
      JSON.stringify({
        round,
        localRound,
        status: 'done',
        sendAt,
        doneAt,
        latencyMs,
        synthetic,
        runId,
        stage,
        blockId,
        arm,
        attemptId,
        mode
      })
    );

    eventRows.push(
      JSON.stringify({
        event: 'round_send',
        ts: sendAt,
        round,
        localRound,
        synthetic
      })
    );
    eventRows.push(
      JSON.stringify({
        event: 'round_done',
        ts: doneAt,
        round,
        localRound,
        latencyMs,
        synthetic
      })
    );

    producedRounds += 1;
  }

  const finishedAt = new Date().toISOString();
  eventRows.push(
    JSON.stringify({
      event: status === 'timeout' ? 'attempt_timeout' : 'attempt_done',
      ts: finishedAt,
      roundsCompleted: previousRounds + producedRounds,
      roundsProducedThisAttempt: producedRounds,
      synthetic
    })
  );

  writeText(roundsPath, roundsRows.length ? `${roundsRows.join('\n')}\n` : '');
  writeText(eventsPath, eventRows.length ? `${eventRows.join('\n')}\n` : '');

  const meta = {
    schemaVersion: 1,
    tool: 'test-chatgpt-perf-ab-runner',
    synthetic,
    mode,
    status,
    startedAt,
    finishedAt,
    runId,
    stage,
    blockId,
    arm,
    attemptId,
    roundsTarget,
    roundsCompleted: previousRounds + producedRounds,
    roundsProducedThisAttempt: producedRounds,
    promptTemplate: {
      path: promptTemplate,
      bytes: Buffer.byteLength(promptText, 'utf8')
    },
    maxWallClockMin,
    resume: resumeInfo
      ? {
          enabled: true,
          from: resumeInfo.inputPath,
          fromMetaPath: resumeInfo.metaPath,
          fromAttemptId: resumeInfo.previousAttemptId || null,
          previousRounds
        }
      : {
          enabled: false
        },
    files: {
      attemptMetaJson: 'attempt.meta.json',
      roundsNdjson: 'rounds.ndjson',
      eventsNdjson: 'events.ndjson'
    }
  };
  writeJson(attemptMetaPath, meta);

  console.log(
    JSON.stringify({
      ok: status === 'done',
      code: status === 'done' ? EXIT.OK : EXIT.TIMEOUT,
      attemptDir,
      roundsProducedThisAttempt: producedRounds,
      roundsCompleted: meta.roundsCompleted,
      synthetic
    })
  );

  return status === 'done' ? EXIT.OK : EXIT.TIMEOUT;
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
