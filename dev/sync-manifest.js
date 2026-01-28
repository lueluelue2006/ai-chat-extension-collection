#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function writeJson(relPath, obj) {
  fs.writeFileSync(path.join(ROOT, relPath), JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const s = String(v || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function loadRegistry() {
  const code = readText('shared/registry.js');
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'shared/registry.js' });
  const reg = sandbox.globalThis.QUICKNAV_REGISTRY;
  if (!reg || typeof reg !== 'object') throw new Error('QUICKNAV_REGISTRY not found after evaluating shared/registry.js');
  return reg;
}

function loadInjections() {
  const code = readText('shared/injections.js');
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'shared/injections.js' });
  const inj = sandbox.globalThis.QUICKNAV_INJECTIONS;
  if (!inj || typeof inj !== 'object') throw new Error('QUICKNAV_INJECTIONS not found after evaluating shared/injections.js');
  return inj;
}

function registryAllMatchPatterns(reg) {
  const sites = Array.isArray(reg?.sites) ? reg.sites : [];
  const out = [];
  for (const s of sites) {
    const siteId = typeof s?.id === 'string' ? s.id : '';
    if (!siteId || siteId === 'common') continue;
    out.push(...(Array.isArray(s?.matchPatterns) ? s.matchPatterns : []));
  }
  return uniq(out).sort();
}

function main() {
  const reg = loadRegistry();
  const inj = loadInjections();
  const patterns = registryAllMatchPatterns(reg);
  const extraHostPerms = uniq(inj?.EXTRA_HOST_PERMISSIONS || []);
  if (!patterns.length) throw new Error('No matchPatterns found in registry sites');

  const manifest = readJson('manifest.json');
  manifest.host_permissions = uniq([...patterns, ...extraHostPerms]).sort();

  const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  let bootstrap = contentScripts.find((cs) => Array.isArray(cs?.js) && cs.js.includes('content/bootstrap.js')) || null;
  if (!bootstrap) {
    bootstrap = { matches: patterns, js: ['content/bootstrap.js'], run_at: 'document_start' };
    contentScripts.push(bootstrap);
    manifest.content_scripts = contentScripts;
  }
  bootstrap.matches = patterns;

  writeJson('manifest.json', manifest);
  // eslint-disable-next-line no-console
  console.log(`Updated manifest.json host_permissions + bootstrap matches (${patterns.length} patterns)`);
}

try {
  main();
} catch (e) {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
