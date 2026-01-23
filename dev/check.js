#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function listJsFiles(dirRel) {
  const out = [];
  const stack = [path.join(ROOT, dirRel)];
  while (stack.length) {
    const abs = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent) continue;
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const p = path.join(abs, ent.name);
      if (ent.isDirectory()) {
        stack.push(p);
        continue;
      }
      if (ent.isFile() && ent.name.endsWith('.js')) out.push(p);
    }
  }
  out.sort();
  return out;
}

function rel(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/');
}

function checkJsSyntax() {
  const roots = ['background', 'content', 'options', 'popup', 'shared'];
  const files = roots.flatMap((d) => listJsFiles(d));
  const failures = [];
  for (const abs of files) {
    const src = fs.readFileSync(abs, 'utf8');
    try {
      // vm.Script parses in "script" mode and throws on syntax errors.
      // This catches typos without needing a full bundler/linter.
      new vm.Script(src, { filename: rel(abs) });
    } catch (e) {
      failures.push({ file: rel(abs), error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { files: files.map(rel), failures };
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

function extractBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  if (start < 0) return null;
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) return null;
  return src.slice(start + startNeedle.length, end);
}

function loadBackgroundDefs() {
  const sw = readText('background/sw.js');

  const defaultsSrc = extractBetween(sw, 'const DEFAULT_SETTINGS = ', '\n\n  const MAIN_GUARD_FILE');
  if (!defaultsSrc) throw new Error('Failed to extract DEFAULT_SETTINGS from background/sw.js');
  const defaultsSandbox = {};
  vm.createContext(defaultsSandbox);
  vm.runInContext(`result = ${defaultsSrc};`, defaultsSandbox, { filename: 'background/sw.js:DEFAULT_SETTINGS' });
  const defaults = defaultsSandbox.result;

  const mainGuardMatch = sw.match(/const MAIN_GUARD_FILE = '([^']+)';/);
  const mainGuardFile = mainGuardMatch ? mainGuardMatch[1] : 'content/scroll-guard-main.js';

  const defsSrc = extractBetween(sw, 'const CONTENT_SCRIPT_DEFS = ', '\n\n  const LEGACY_CONTENT_SCRIPT_IDS');
  if (!defsSrc) throw new Error('Failed to extract CONTENT_SCRIPT_DEFS from background/sw.js');
  const defsSandbox = { MAIN_GUARD_FILE: mainGuardFile };
  vm.createContext(defsSandbox);
  vm.runInContext(`result = ${defsSrc};`, defsSandbox, { filename: 'background/sw.js:CONTENT_SCRIPT_DEFS' });
  const defs = defsSandbox.result;

  if (!Array.isArray(defs)) throw new Error('CONTENT_SCRIPT_DEFS did not evaluate to an array');
  return { defaults, defs };
}

function coversHostPermission(hostPerm, matchPattern) {
  const p = String(hostPerm || '');
  const m = String(matchPattern || '');
  if (!p || !m) return false;
  if (p === '<all_urls>') return true;
  const star = p.indexOf('*');
  if (star < 0) return p === m;
  const prefix = p.slice(0, star);
  return m.startsWith(prefix);
}

function verifyRegistryAgainstBackground(reg, bg, manifest) {
  const errors = [];
  const warnings = [];

  const regSites = Array.isArray(reg.sites) ? reg.sites : [];
  const regModules = reg.modules && typeof reg.modules === 'object' ? reg.modules : {};

  const defaults = bg.defaults && typeof bg.defaults === 'object' ? bg.defaults : {};
  const defs = Array.isArray(bg.defs) ? bg.defs : [];

  const defSites = defaults.sites && typeof defaults.sites === 'object' ? defaults.sites : {};
  const defSiteModules = defaults.siteModules && typeof defaults.siteModules === 'object' ? defaults.siteModules : {};

  const injectedBySite = new Map();
  const injectedModules = new Set();
  const matchPatterns = new Set();
  for (const d of defs) {
    if (!d || typeof d !== 'object') continue;
    const siteId = typeof d.siteId === 'string' ? d.siteId : '';
    const moduleId = typeof d.moduleId === 'string' ? d.moduleId : '';
    if (siteId && moduleId) {
      if (!injectedBySite.has(siteId)) injectedBySite.set(siteId, new Set());
      injectedBySite.get(siteId).add(moduleId);
      injectedModules.add(moduleId);
    }
    if (Array.isArray(d.matches)) {
      for (const m of d.matches) matchPatterns.add(String(m || ''));
    }
  }

  const hostPerms = Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [];
  for (const m of Array.from(matchPatterns.values()).filter(Boolean)) {
    const ok = hostPerms.some((p) => coversHostPermission(p, m));
    if (!ok) errors.push(`manifest.json host_permissions does not cover match pattern: ${m}`);
  }

  for (const s of regSites) {
    const siteId = typeof s?.id === 'string' ? s.id : '';
    if (!siteId) continue;
    if (!Object.prototype.hasOwnProperty.call(defSites, siteId)) {
      errors.push(`DEFAULT_SETTINGS.sites is missing site: ${siteId}`);
    }
    if (!Object.prototype.hasOwnProperty.call(defSiteModules, siteId)) {
      errors.push(`DEFAULT_SETTINGS.siteModules is missing site: ${siteId}`);
    }

    const modules = Array.isArray(s?.modules) ? s.modules : [];
    const enabledMap = defSiteModules?.[siteId] && typeof defSiteModules[siteId] === 'object' ? defSiteModules[siteId] : {};
    const injected = injectedBySite.get(siteId) || new Set();

    for (const moduleId of modules) {
      if (typeof moduleId !== 'string' || !moduleId) continue;
      if (!Object.prototype.hasOwnProperty.call(regModules, moduleId)) {
        errors.push(`Registry modules missing moduleId referenced by site(${siteId}): ${moduleId}`);
      }
      if (!Object.prototype.hasOwnProperty.call(enabledMap, moduleId)) {
        errors.push(`DEFAULT_SETTINGS.siteModules[${siteId}] missing moduleId: ${moduleId}`);
      }
      if (!injected.has(moduleId)) {
        errors.push(`CONTENT_SCRIPT_DEFS missing injection for site(${siteId}) moduleId: ${moduleId}`);
      }
    }
  }

  for (const moduleId of injectedModules) {
    if (!Object.prototype.hasOwnProperty.call(regModules, moduleId)) {
      warnings.push(`Injected moduleId not present in registry: ${moduleId}`);
    }
  }

  return { errors, warnings };
}

function main() {
  const syntax = checkJsSyntax();
  if (syntax.failures.length) {
    console.error('JS syntax check: FAIL');
    for (const f of syntax.failures) console.error(`- ${f.file}: ${f.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`JS syntax check: OK (${syntax.files.length} files)`);

  let manifest;
  try {
    manifest = JSON.parse(readText('manifest.json'));
  } catch (e) {
    console.error(`manifest.json parse: FAIL (${e instanceof Error ? e.message : String(e)})`);
    process.exitCode = 1;
    return;
  }
  console.log('manifest.json parse: OK');

  let reg;
  try {
    reg = loadRegistry();
  } catch (e) {
    console.error(`registry load: FAIL (${e instanceof Error ? e.message : String(e)})`);
    process.exitCode = 1;
    return;
  }
  console.log(`registry load: OK (v${reg.version || 0})`);

  let bg;
  try {
    bg = loadBackgroundDefs();
  } catch (e) {
    console.error(`background defs load: FAIL (${e instanceof Error ? e.message : String(e)})`);
    process.exitCode = 1;
    return;
  }
  console.log('background defs load: OK');

  const res = verifyRegistryAgainstBackground(reg, bg, manifest);
  for (const w of res.warnings) console.warn(`WARN: ${w}`);
  if (res.errors.length) {
    console.error('Registry consistency: FAIL');
    for (const err of res.errors) console.error(`- ${err}`);
    process.exitCode = 1;
    return;
  }
  console.log('Registry consistency: OK');
}

main();

