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
  ensureDir,
  readJson,
  readNdjson,
  writeJson,
  writeNdjson,
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

function parseResume(resumeFrom) {
  if (!resumeFrom) return null;
  const p = path.resolve(String(resumeFrom));
  if (!fs.existsSync(p)) throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, `resume-from not found: ${p}`);
  const stat = fs.statSync(p);
  const metaPath = stat.isDirectory() ? path.join(p, 'attempt.meta.json') : p;
  if (!fs.existsSync(metaPath)) throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, `resume meta not found: ${metaPath}`);
  const meta = readJson(metaPath);
  const roundsPath = path.join(path.dirname(metaPath), 'rounds.ndjson');
  const previousRounds = fs.existsSync(roundsPath) ? readNdjson(roundsPath).length : 0;
  return {
    metaPath,
    previousAttemptId: String(meta.attempt_id || ''),
    previousRounds
  };
}

function buildSyntheticRound({ runId, blockId, arm, attemptId, stage, absRound, localRound, baseMs }) {
  const sendTsMs = baseMs + (absRound - 1) * 1400 + ((absRound * 17) % 97);
  const latencyMs = 650 + ((absRound * 37 + (arm === 'B' ? 13 : 29)) % 920);
  const doneTsMs = sendTsMs + latencyMs;
  return {
    run_id: runId,
    block_id: blockId,
    arm,
    attempt_id: attemptId,
    stage,
    round_id: roundId(absRound),
    round_ord: absRound,
    local_round_ord: localRound,
    send_ts: new Date(sendTsMs).toISOString(),
    done_ts: new Date(doneTsMs).toISOString(),
    latency_ms: latencyMs,
    success: true,
    synthetic: true
  };
}

function main() {
  const spec = {
    'run-id': { type: 'string', required: true, description: 'Run id' },
    stage: { type: 'string', required: true, description: 'Stage (smoke|pilot|main)' },
    'block-id': { type: 'string', required: true, description: 'Block id' },
    arm: { type: 'string', required: true, choices: ['A', 'B'], description: 'AB arm' },
    rounds: { type: 'int', required: true, validate: (v) => v > 0, description: 'Total rounds for this block-arm' },
    'attempt-id': { type: 'string', default: '', description: 'Attempt id (optional)' },
    'prompt-template': { type: 'string', required: true, description: 'Prompt template path' },
    'max-wall-clock-min': { type: 'number', required: true, validate: (v) => v > 0, description: 'Max wall clock minutes' },
    'resume-from': { type: 'string', default: '', description: 'Previous attempt meta path/dir' },
    'out-root': { type: 'string', required: true, description: 'Run root directory' },
    mode: { type: 'string', default: 'synthetic', choices: ['synthetic'], description: 'Runner mode' },
    seed: { type: 'int', default: 0, description: 'Optional seed placeholder' }
  };

  const { help, args } = parseArgs(process.argv.slice(2), spec);
  if (help) {
    process.stdout.write(
      formatHelp(
        {
          usage:
            'node dev/test-chatgpt-perf-ab-runner.js --run-id <id> --stage <smoke|pilot|main> --block-id <id> --arm <A|B> --rounds <n> --prompt-template <file> --max-wall-clock-min <n> --out-root <run-root> [--attempt-id <id>] [--resume-from <path>]',
          description:
            'AB runner (file-driven): emits attempt.meta.json + rounds.ndjson + events.ndjson. Current implementation supports synthetic mode only.',
          examples: [
            'node dev/test-chatgpt-perf-ab-runner.js --run-id run-20260227T120000Z-abcd123 --stage smoke --block-id b01-AthenB --arm A --rounds 20 --attempt-id att-001 --prompt-template dev/prompts/math-long.txt --max-wall-clock-min 45 --out-root .omx/logs/chatgpt-perf-ab/run-20260227T120000Z-abcd123',
            'node dev/test-chatgpt-perf-ab-runner.js --run-id run-20260227T120000Z-abcd123 --stage pilot --block-id b02-BthenA --arm B --rounds 100 --attempt-id att-002 --prompt-template dev/prompts/math-long.txt --max-wall-clock-min 120 --resume-from .omx/logs/chatgpt-perf-ab/run-20260227T120000Z-abcd123/raw/runner/b02-BthenA/B/att-001 --out-root .omx/logs/chatgpt-perf-ab/run-20260227T120000Z-abcd123'
          ]
        },
        spec
      )
    );
    return;
  }

  const runId = String(args.runId).trim();
  const stage = String(args.stage).trim();
  const blockId = String(args.blockId).trim();
  const arm = normalizeArm(args.arm);
  const roundsTarget = Number(args.rounds);
  const promptTemplatePath = path.resolve(String(args.promptTemplate));
  const maxWallClockMin = Number(args.maxWallClockMin);
  const outRoot = path.resolve(String(args.outRoot));
  const attemptId = String(args.attemptId || '').trim() || `att-${Date.now().toString(36)}`;
  const resume = parseResume(String(args.resumeFrom || '').trim());
  const mode = String(args.mode || 'synthetic').trim().toLowerCase();

  if (mode !== 'synthetic') throw new ExitError(EXIT_CODES.ASSERTION_FAILED, `Unsupported mode: ${mode}`);
  if (!runId) throw new ExitError(EXIT_CODES.ARG_ERROR, 'run-id is empty');
  if (!stage) throw new ExitError(EXIT_CODES.ARG_ERROR, 'stage is empty');
  if (!blockId) throw new ExitError(EXIT_CODES.ARG_ERROR, 'block-id is empty');
  if (!Number.isInteger(roundsTarget) || roundsTarget <= 0) throw new ExitError(EXIT_CODES.ARG_ERROR, 'rounds must be > 0');
  if (!Number.isFinite(maxWallClockMin) || maxWallClockMin <= 0) {
    throw new ExitError(EXIT_CODES.ARG_ERROR, 'max-wall-clock-min must be > 0');
  }
  if (!fs.existsSync(promptTemplatePath)) {
    throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, `prompt-template not found: ${promptTemplatePath}`);
  }
  const promptTemplate = fs.readFileSync(promptTemplatePath, 'utf8');
  if (!promptTemplate.trim()) throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, 'prompt-template is empty');

  const attemptDir = path.join(outRoot, 'raw', 'runner', blockId, arm, attemptId);
  const attemptMetaPath = path.join(attemptDir, 'attempt.meta.json');
  const roundsPath = path.join(attemptDir, 'rounds.ndjson');
  const eventsPath = path.join(attemptDir, 'events.ndjson');
  if (fs.existsSync(attemptDir)) throw new ExitError(EXIT_CODES.ASSERTION_FAILED, `attempt already exists: ${attemptDir}`);
  ensureDir(attemptDir);

  const previousRounds = resume ? Number(resume.previousRounds || 0) : 0;
  if (previousRounds > roundsTarget) {
    throw new ExitError(EXIT_CODES.ASSERTION_FAILED, `resume rounds (${previousRounds}) > target rounds (${roundsTarget})`);
  }

  const startedAt = nowIso();
  const startMs = Date.now();
  const maxWallMs = maxWallClockMin * 60 * 1000;
  const rounds = [];
  const events = [];
  events.push({
    run_id: runId,
    block_id: blockId,
    arm,
    attempt_id: attemptId,
    event: 'attempt_start',
    ts: startedAt,
    detail: {
      stage,
      mode,
      rounds_target: roundsTarget,
      resume_from: resume ? resume.metaPath : null,
      previous_rounds: previousRounds
    }
  });

  const baseMs = Date.now();
  let status = 'SUCCESS';
  let localRound = 0;
  for (let absRound = previousRounds + 1; absRound <= roundsTarget; absRound += 1) {
    if (Date.now() - startMs > maxWallMs) {
      status = 'TIMEOUT';
      events.push({
        run_id: runId,
        block_id: blockId,
        arm,
        attempt_id: attemptId,
        event: 'attempt_timeout',
        ts: nowIso(),
        detail: { max_wall_clock_min: maxWallClockMin, rounds_completed: previousRounds + localRound }
      });
      break;
    }
    localRound += 1;
    const rec = buildSyntheticRound({
      runId,
      blockId,
      arm,
      attemptId,
      stage,
      absRound,
      localRound,
      baseMs
    });
    rounds.push(rec);
    events.push({
      run_id: runId,
      block_id: blockId,
      arm,
      attempt_id: attemptId,
      event: 'round_done',
      ts: rec.done_ts,
      detail: {
        round_id: rec.round_id,
        round_ord: rec.round_ord,
        latency_ms: rec.latency_ms,
        success: rec.success
      }
    });
  }

  const endedAt = nowIso();
  const roundsCompleted = previousRounds + rounds.length;
  events.push({
    run_id: runId,
    block_id: blockId,
    arm,
    attempt_id: attemptId,
    event: 'attempt_end',
    ts: endedAt,
    detail: {
      status,
      rounds_completed: roundsCompleted,
      rounds_target: roundsTarget
    }
  });

  const meta = {
    run_id: runId,
    block_id: blockId,
    arm,
    attempt_id: attemptId,
    stage,
    started_at: startedAt,
    ended_at: endedAt,
    status,
    mode,
    synthetic: true,
    rounds_target: roundsTarget,
    rounds_completed: roundsCompleted,
    previous_rounds: previousRounds,
    resume_from: resume ? resume.metaPath : null,
    prompt_template: {
      path: promptTemplatePath,
      bytes: Buffer.byteLength(promptTemplate, 'utf8')
    },
    max_wall_clock_min: maxWallClockMin
  };

  writeNdjson(roundsPath, rounds, { append: false });
  writeNdjson(eventsPath, events, { append: false });
  writeJson(attemptMetaPath, meta);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: status === 'SUCCESS',
        run_id: runId,
        block_id: blockId,
        arm,
        attempt_id: attemptId,
        status,
        rounds_completed: roundsCompleted,
        outputs: {
          attempt_meta: attemptMetaPath,
          rounds_ndjson: roundsPath,
          events_ndjson: eventsPath
        }
      },
      null,
      2
    )}\n`
  );

  if (status === 'TIMEOUT') throw new ExitError(EXIT_CODES.TIMEOUT, `Runner timeout: ${attemptId}`);
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
