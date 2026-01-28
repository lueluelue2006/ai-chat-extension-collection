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

function loadInjections() {
  const code = readText('shared/injections.js');
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'shared/injections.js' });
  const inj = sandbox.globalThis.QUICKNAV_INJECTIONS;
  if (!inj || typeof inj !== 'object') throw new Error('QUICKNAV_INJECTIONS not found after evaluating shared/injections.js');
  if (typeof inj.buildDefaultSettings !== 'function') throw new Error('QUICKNAV_INJECTIONS.buildDefaultSettings is missing');
  if (typeof inj.buildContentScriptDefs !== 'function') throw new Error('QUICKNAV_INJECTIONS.buildContentScriptDefs is missing');
  return inj;
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

function normalizePatterns(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .sort();
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const s = String(v || '');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function registryAllMatchPatterns(reg) {
  const sites = Array.isArray(reg?.sites) ? reg.sites : [];
  const out = [];
  for (const s of sites) {
    const siteId = typeof s?.id === 'string' ? s.id : '';
    if (!siteId || siteId === 'common') continue;
    out.push(...(Array.isArray(s?.matchPatterns) ? s.matchPatterns : []));
  }
  return uniq(out);
}

function findBootstrapMatches(manifest) {
  const items = Array.isArray(manifest?.content_scripts) ? manifest.content_scripts : [];
  for (const cs of items) {
    const js = Array.isArray(cs?.js) ? cs.js : [];
    if (js.includes('content/bootstrap.js')) return Array.isArray(cs?.matches) ? cs.matches : [];
  }
  return [];
}

function verifyRegistryAgainstInjections(reg, injections, manifest) {
  const errors = [];
  const warnings = [];

  const regSites = Array.isArray(reg.sites) ? reg.sites : [];
  const regModules = reg.modules && typeof reg.modules === 'object' ? reg.modules : {};

  const defaults = injections.buildDefaultSettings(reg);
  const defs = injections.buildContentScriptDefs(reg);

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
  const extraHostPerms = normalizePatterns(injections?.EXTRA_HOST_PERMISSIONS || []);
  const expectedHostPerms = normalizePatterns([...registryAllMatchPatterns(reg), ...extraHostPerms]);
  const actualHostPerms = normalizePatterns(hostPerms);
  if (expectedHostPerms.join('\n') !== actualHostPerms.join('\n')) {
    errors.push(
      `manifest.json host_permissions mismatch (run: node dev/sync-manifest.js)\nexpected:\n- ${expectedHostPerms.join('\n- ')}\nactual:\n- ${actualHostPerms.join('\n- ')}`
    );
  }

  const bootstrapMatches = normalizePatterns(findBootstrapMatches(manifest));
  const expectedBootstrapMatches = normalizePatterns(registryAllMatchPatterns(reg));
  if (expectedBootstrapMatches.join('\n') !== bootstrapMatches.join('\n')) {
    errors.push(
      `manifest.json bootstrap matches mismatch (run: node dev/sync-manifest.js)\nexpected:\n- ${expectedBootstrapMatches.join('\n- ')}\nactual:\n- ${bootstrapMatches.join('\n- ')}`
    );
  }

  for (const m of Array.from(matchPatterns.values()).filter(Boolean)) {
    const ok = hostPerms.some((p) => coversHostPermission(p, m));
    if (!ok) errors.push(`manifest.json host_permissions does not cover match pattern used by injections: ${m}`);
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

  let injections;
  try {
    injections = loadInjections();
  } catch (e) {
    console.error(`injections load: FAIL (${e instanceof Error ? e.message : String(e)})`);
    process.exitCode = 1;
    return;
  }
  console.log(`injections load: OK (v${injections.version || 0})`);

  const res = verifyRegistryAgainstInjections(reg, injections, manifest);
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
