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
  writeJson,
  sha256,
  deepClone,
  safeExit
} = require('./perf-ab/common');

const DIFF_ALLOWLIST = Object.freeze([
  'enabled',
  'virtualizeOffscreen',
  'optimizeHeavyBlocks',
  'disableAnimations',
  'boostDuringInput',
  'unfreezeOnFind',
  'showOverlay',
  'rootMarginPx'
]);

const PERF_SWITCH_KEYS = Object.freeze([
  'enabled',
  'virtualizeOffscreen',
  'optimizeHeavyBlocks',
  'disableAnimations',
  'boostDuringInput',
  'unfreezeOnFind',
  'showOverlay',
  'rootMarginPx'
]);

function nowIso() {
  return new Date().toISOString();
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractBlockIdFromSnapshotPath(snapshotPath) {
  const parts = path.resolve(snapshotPath).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] !== 'settings') continue;
    const prev = parts[i - 1];
    const block = parts[i + 1];
    if (prev === 'raw' && block) return block;
  }
  return 'unknown-block';
}

function deriveRunRootFromSnapshotPath(snapshotPath) {
  const abs = path.resolve(snapshotPath);
  const parts = abs.split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] !== 'settings') continue;
    if (parts[i - 1] !== 'raw') continue;
    const rootParts = parts.slice(0, i - 1);
    if (!rootParts.length) return path.sep;
    return `${path.sep}${rootParts.join(path.sep)}`;
  }
  return '';
}

function findPerfContainer(fullSettings) {
  if (!isObject(fullSettings)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'full_settings must be an object');
  const candidates = [
    { key: 'full_settings', value: fullSettings },
    { key: 'full_settings.cgpt_perf', value: fullSettings.cgpt_perf },
    { key: 'full_settings.chatgpt_perf', value: fullSettings.chatgpt_perf }
  ];
  for (const item of candidates) {
    if (!isObject(item.value)) continue;
    const hit = PERF_SWITCH_KEYS.some((k) => Object.prototype.hasOwnProperty.call(item.value, k));
    if (hit) return item;
  }
  fullSettings.cgpt_perf = {};
  return { key: 'full_settings.cgpt_perf', value: fullSettings.cgpt_perf };
}

function normalizePerfSettings(raw) {
  const s = isObject(raw) ? raw : {};
  const out = {};
  out.enabled = typeof s.enabled === 'boolean' ? s.enabled : true;
  out.virtualizeOffscreen = typeof s.virtualizeOffscreen === 'boolean' ? s.virtualizeOffscreen : true;
  out.optimizeHeavyBlocks = typeof s.optimizeHeavyBlocks === 'boolean' ? s.optimizeHeavyBlocks : true;
  out.disableAnimations = typeof s.disableAnimations === 'boolean' ? s.disableAnimations : true;
  out.boostDuringInput = typeof s.boostDuringInput === 'boolean' ? s.boostDuringInput : true;
  out.unfreezeOnFind = typeof s.unfreezeOnFind === 'boolean' ? s.unfreezeOnFind : true;
  out.showOverlay = typeof s.showOverlay === 'boolean' ? s.showOverlay : false;
  const margin = Number(s.rootMarginPx);
  out.rootMarginPx = Number.isFinite(margin) ? Math.max(0, margin) : 1200;
  return out;
}

function applyArmToPerf(perf, arm) {
  const isArmB = arm === 'B';
  perf.enabled = true;
  perf.virtualizeOffscreen = isArmB;
  perf.optimizeHeavyBlocks = isArmB;
  perf.disableAnimations = isArmB;
  perf.boostDuringInput = isArmB;
  perf.unfreezeOnFind = isArmB;
  perf.showOverlay = false;
  if (!Number.isFinite(Number(perf.rootMarginPx))) perf.rootMarginPx = 1200;
}

function forceDisableNonPerfModules(fullSettings) {
  if (!isObject(fullSettings) || !isObject(fullSettings.siteModules)) return 0;
  let changed = 0;
  for (const siteId of Object.keys(fullSettings.siteModules)) {
    const modules = fullSettings.siteModules[siteId];
    if (!isObject(modules)) continue;
    for (const moduleId of Object.keys(modules)) {
      if (moduleId === 'chatgpt_perf') continue;
      if (modules[moduleId] === true) {
        modules[moduleId] = false;
        changed += 1;
      }
    }
  }
  return changed;
}

function changedDiffKeys(beforePerf, afterPerf) {
  const changed = [];
  for (const key of DIFF_ALLOWLIST) {
    if (!Object.is(beforePerf[key], afterPerf[key])) changed.push(key);
  }
  return changed;
}

function assertSnapshotSchema(snapshot, label) {
  if (!isObject(snapshot)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `${label} must be an object`);
  if (typeof snapshot.run_id !== 'string' || !snapshot.run_id.trim()) {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `${label}.run_id must be non-empty string`);
  }
  if (typeof snapshot.block_id !== 'string' || !snapshot.block_id.trim()) {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `${label}.block_id must be non-empty string`);
  }
  if (snapshot.arm !== 'A' && snapshot.arm !== 'B') {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `${label}.arm must be A or B`);
  }
  if (!isObject(snapshot.full_settings)) {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `${label}.full_settings must be object`);
  }
  if (typeof snapshot.sha256 !== 'string' || snapshot.sha256.length < 32) {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `${label}.sha256 invalid`);
  }
}

function assertDiffSchema(diff) {
  if (!isObject(diff)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'settings.diff must be object');
  if (!Array.isArray(diff.changed_keys)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'settings.diff.changed_keys must be array');
  if (!Array.isArray(diff.disallowed_keys)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'settings.diff.disallowed_keys must be array');
}

function assertArmStateSchema(armState) {
  if (!isObject(armState)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'arm-state must be object');
  if (!isObject(armState.six_switches)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'arm-state.six_switches must be object');
  const keys = ['enabled', 'virtualizeOffscreen', 'optimizeHeavyBlocks', 'disableAnimations', 'boostDuringInput', 'unfreezeOnFind'];
  for (const key of keys) {
    if (typeof armState.six_switches[key] !== 'boolean') {
      throw new ExitError(EXIT_CODES.SCHEMA_INVALID, `arm-state.six_switches.${key} must be boolean`);
    }
  }
  if (typeof armState.showOverlay !== 'boolean') throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'arm-state.showOverlay must be boolean');
  if (!Number.isFinite(Number(armState.rootMarginPx))) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'arm-state.rootMarginPx must be finite');
}

function assertPreflightSchema(preflight) {
  if (!isObject(preflight)) throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'preflight must be object');
  if (typeof preflight.non_perf_modules_forced_off !== 'boolean') {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'preflight.non_perf_modules_forced_off must be boolean');
  }
  if (typeof preflight.status !== 'string' || !preflight.status) {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'preflight.status must be string');
  }
}

function main() {
  const spec = {
    'run-id': { type: 'string', required: true, description: 'Run id.' },
    arm: { type: 'string', required: true, choices: ['A', 'B'], description: 'AB arm.' },
    'settings-file': { type: 'path', required: true, description: 'Input JSON file with full_settings.' },
    'snapshot-before': { type: 'path', required: true, description: 'Output before snapshot path.' },
    'snapshot-after': { type: 'path', required: true, description: 'Output after snapshot path.' },
    'diff-out': { type: 'path', required: true, description: 'Output diff path.' },
    'force-disable-non-perf': { type: 'boolean', default: true, description: 'Force disable non-perf modules.' },
    'schema-version': { type: 'string', default: 'v2', description: 'Output schema version.' }
  };

  const { help, args } = parseArgs(process.argv.slice(2), spec);
  if (help) {
    process.stdout.write(formatHelp(
      {
        usage: 'node dev/test-chatgpt-perf-ab-config-smoke.js --run-id <id> --arm <A|B> --settings-file <path> --snapshot-before <path> --snapshot-after <path> --diff-out <path>',
        description: 'ChatGPT perf AB config smoke: snapshot before/after settings, validate diff allowlist, output arm-state and preflight.',
        examples: [
          'node dev/test-chatgpt-perf-ab-config-smoke.js --run-id run-20260227T120000Z-abcd123 --arm A --settings-file ./tmp/settings.json --snapshot-before ./tmp/before.settings.json --snapshot-after ./tmp/after.settings.json --diff-out ./tmp/settings.diff.json',
          'node dev/test-chatgpt-perf-ab-config-smoke.js --run-id run-20260227T120000Z-abcd123 --arm B --settings-file ./tmp/settings.json --snapshot-before ./tmp/before.settings.json --snapshot-after ./tmp/after.settings.json --diff-out ./tmp/settings.diff.json --force-disable-non-perf true'
        ]
      },
      spec
    ));
    return;
  }

  const runId = String(args.runId).trim();
  const arm = String(args.arm).trim().toUpperCase();
  const settingsFile = path.resolve(String(args.settingsFile));
  const snapshotBeforePath = path.resolve(String(args.snapshotBefore));
  const snapshotAfterPath = path.resolve(String(args.snapshotAfter));
  const diffOutPath = path.resolve(String(args.diffOut));
  const forceDisableNonPerf = Boolean(args.forceDisableNonPerf);
  const schemaVersion = String(args.schemaVersion || 'v2').trim() || 'v2';

  if (!fs.existsSync(settingsFile)) {
    throw new ExitError(EXIT_CODES.PRECONDITION_FAILED, `settings-file not found: ${settingsFile}`);
  }

  const input = readJson(settingsFile);
  if (!isObject(input) || !isObject(input.full_settings)) {
    throw new ExitError(EXIT_CODES.SCHEMA_INVALID, 'settings-file must include full_settings(object)');
  }

  const blockId = extractBlockIdFromSnapshotPath(snapshotBeforePath);
  const runRoot = deriveRunRootFromSnapshotPath(snapshotBeforePath);

  const beforeSettings = isObject(input.before_full_settings) ? deepClone(input.before_full_settings) : deepClone(input.full_settings);
  const afterSettings = deepClone(beforeSettings);

  const beforePerfContainer = findPerfContainer(beforeSettings);
  const afterPerfContainer = findPerfContainer(afterSettings);

  const normalizedBeforePerf = normalizePerfSettings(beforePerfContainer.value);
  Object.assign(beforePerfContainer.value, normalizedBeforePerf);

  const normalizedAfterPerf = normalizePerfSettings(afterPerfContainer.value);
  Object.assign(afterPerfContainer.value, normalizedAfterPerf);
  applyArmToPerf(afterPerfContainer.value, arm);

  let forcedModules = 0;
  if (forceDisableNonPerf) {
    forcedModules = forceDisableNonPerfModules(afterSettings);
  }

  const beforePerf = normalizePerfSettings(beforePerfContainer.value);
  const afterPerf = normalizePerfSettings(afterPerfContainer.value);
  const changedKeys = changedDiffKeys(beforePerf, afterPerf);
  const disallowedKeys = changedKeys.filter((k) => !DIFF_ALLOWLIST.includes(k));

  const beforeSnapshot = {
    run_id: runId,
    block_id: blockId,
    arm,
    ts: nowIso(),
    schema_version: schemaVersion,
    full_settings: beforeSettings,
    sha256: sha256(beforeSettings)
  };
  const afterSnapshot = {
    run_id: runId,
    block_id: blockId,
    arm,
    ts: nowIso(),
    schema_version: schemaVersion,
    full_settings: afterSettings,
    sha256: sha256(afterSettings)
  };
  const diff = {
    run_id: runId,
    block_id: blockId,
    arm,
    ts: nowIso(),
    schema_version: schemaVersion,
    allowlist_keys: DIFF_ALLOWLIST.slice(),
    changed_keys: changedKeys,
    disallowed_keys: disallowedKeys
  };

  const armState = {
    run_id: runId,
    arm,
    schema_version: schemaVersion,
    six_switches: {
      enabled: afterPerf.enabled,
      virtualizeOffscreen: afterPerf.virtualizeOffscreen,
      optimizeHeavyBlocks: afterPerf.optimizeHeavyBlocks,
      disableAnimations: afterPerf.disableAnimations,
      boostDuringInput: afterPerf.boostDuringInput,
      unfreezeOnFind: afterPerf.unfreezeOnFind
    },
    rootMarginPx: afterPerf.rootMarginPx,
    showOverlay: afterPerf.showOverlay
  };
  const preflight = {
    run_id: runId,
    arm,
    schema_version: schemaVersion,
    non_perf_modules_forced_off: forceDisableNonPerf,
    forced_modules_count: forcedModules,
    status: disallowedKeys.length ? 'INVALID_DIFF' : 'OK'
  };

  assertSnapshotSchema(beforeSnapshot, 'before.settings');
  assertSnapshotSchema(afterSnapshot, 'after.settings');
  assertDiffSchema(diff);
  assertArmStateSchema(armState);
  assertPreflightSchema(preflight);

  if (disallowedKeys.length) {
    throw new ExitError(EXIT_CODES.ASSERTION_FAILED, `settings diff contains disallowed keys: ${disallowedKeys.join(',')}`, { diff });
  }

  const armConfigDir = runRoot
    ? path.join(runRoot, 'raw', 'config', arm)
    : path.join(path.dirname(snapshotAfterPath), `${arm.toLowerCase()}-config`);
  const armStatePath = path.join(armConfigDir, 'arm-state.json');
  const preflightPath = path.join(armConfigDir, 'preflight.json');

  try {
    writeJson(snapshotBeforePath, beforeSnapshot);
    writeJson(snapshotAfterPath, afterSnapshot);
    writeJson(diffOutPath, diff);
    writeJson(armStatePath, armState);
    writeJson(preflightPath, preflight);
  } catch (error) {
    throw new ExitError(EXIT_CODES.WRITE_FAILED, `Failed to write outputs: ${error instanceof Error ? error.message : String(error)}`);
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      run_id: runId,
      arm,
      schema_version: schemaVersion,
      outputs: {
        snapshot_before: snapshotBeforePath,
        snapshot_after: snapshotAfterPath,
        diff_out: diffOutPath,
        arm_state: armStatePath,
        preflight: preflightPath
      }
    }, null, 2)}\n`
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
