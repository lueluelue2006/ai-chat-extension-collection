#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_MANIFEST_PATH = 'manifest.source.json';

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function transpileTypeScript(source, filename) {
  return transformSync(source, {
    loader: 'ts',
    target: 'chrome96',
    format: 'esm',
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    sourcefile: filename
  }).code;
}

function readSharedConfigScript(tsPath, jsFallbackPath) {
  const tsAbs = path.join(ROOT, tsPath);
  if (fs.existsSync(tsAbs)) {
    return {
      code: transpileTypeScript(readText(tsPath), tsPath),
      filename: tsPath
    };
  }

  const jsAbs = path.join(ROOT, jsFallbackPath);
  if (fs.existsSync(jsAbs)) {
    return {
      code: readText(jsFallbackPath),
      filename: jsFallbackPath
    };
  }

  throw new Error(`Missing shared config source: ${tsPath} (fallback: ${jsFallbackPath})`);
}

function loadRegistry() {
  const script = readSharedConfigScript('shared/registry.ts', 'shared/registry.js');
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(script.code, sandbox, { filename: script.filename });
  const reg = sandbox.globalThis.AISHORTCUTS_REGISTRY;
  if (!reg || typeof reg !== 'object') {
    throw new Error(`AISHORTCUTS_REGISTRY not found after evaluating ${script.filename}`);
  }
  return reg;
}

function loadInjections() {
  const script = readSharedConfigScript('shared/injections.ts', 'shared/injections.js');
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(script.code, sandbox, { filename: script.filename });
  const inj = sandbox.globalThis.AISHORTCUTS_INJECTIONS;
  if (!inj || typeof inj !== 'object') {
    throw new Error(`AISHORTCUTS_INJECTIONS not found after evaluating ${script.filename}`);
  }
  if (typeof inj.buildContentScriptDefs !== 'function') throw new Error('AISHORTCUTS_INJECTIONS.buildContentScriptDefs is missing');
  return inj;
}

function normalizeWorld(input) {
  const w = String(input || '').toUpperCase();
  return w === 'MAIN' ? 'MAIN' : 'ISOLATED';
}

function inc(obj, key) {
  // eslint-disable-next-line no-param-reassign
  obj[key] = (obj[key] || 0) + 1;
}

function fmtSiteId(siteId) {
  const id = String(siteId || '').trim();
  return id || '(unknown)';
}

function main() {
  const manifest = readJson(SOURCE_MANIFEST_PATH);
  const reg = loadRegistry();
  const inj = loadInjections();

  const sites = Array.isArray(reg?.sites) ? reg.sites : [];
  const modules = reg?.modules && typeof reg.modules === 'object' ? reg.modules : {};
  const defs = inj.buildContentScriptDefs(reg);

  const defsByWorld = { MAIN: 0, ISOLATED: 0 };
  const defsBySite = new Map(); // siteId -> { total, MAIN, ISOLATED }
  for (const d of defs) {
    const siteId = fmtSiteId(d?.siteId);
    const world = normalizeWorld(d?.world);
    inc(defsByWorld, world);

    const s = defsBySite.get(siteId) || { total: 0, MAIN: 0, ISOLATED: 0 };
    s.total += 1;
    s[world] += 1;
    defsBySite.set(siteId, s);
  }

  const moduleCountBySite = new Map(); // siteId -> count
  for (const s of sites) {
    const siteId = fmtSiteId(s?.id);
    const modIds = Array.isArray(s?.modules) ? s.modules : [];
    moduleCountBySite.set(siteId, modIds.length);
  }

  process.stdout.write('AI Shortcuts MV3 stats\n');
  process.stdout.write(
    `- Manifest: ${String(manifest?.name || '').trim() || '(name unknown)'} v${String(manifest?.version || '').trim() || '(version unknown)'}\n`,
  );
  process.stdout.write(`- Sites: ${sites.length}\n`);
  process.stdout.write(`- Modules: ${Object.keys(modules).length}\n`);
  process.stdout.write(`- Content script defs: ${defs.length} (MAIN ${defsByWorld.MAIN} / ISOLATED ${defsByWorld.ISOLATED})\n`);
  process.stdout.write('\n');

  process.stdout.write('Defs by site\n');
  for (const s of sites) {
    const siteId = fmtSiteId(s?.id);
    const d = defsBySite.get(siteId) || { total: 0, MAIN: 0, ISOLATED: 0 };
    const modCount = moduleCountBySite.get(siteId) || 0;
    process.stdout.write(`- ${siteId}: defs ${d.total} (MAIN ${d.MAIN} / ISOLATED ${d.ISOLATED}), modules ${modCount}\n`);
  }
}

try {
  main();
} catch (e) {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
