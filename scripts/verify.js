#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_MANIFEST_PATH = 'manifest.source.json';
const TS_LOADERS = new Map([
  ['.ts', 'ts'],
  ['.tsx', 'tsx'],
  ['.mts', 'ts'],
  ['.cts', 'ts']
]);
const CHECK_EXTENSIONS = new Set(['.js', ...TS_LOADERS.keys()]);
const CONTENT_RUNTIME_EXTENSIONS = new Set(['.css', '.js', ...TS_LOADERS.keys()]);
function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readScriptsInventoryVersion() {
  const doc = readText('docs/scripts-inventory.md');
  const m = doc.match(/^- Version:\s*(\S+)\s*$/m);
  if (!m) {
    throw new Error('docs/scripts-inventory.md is missing "- Version: <version>" (run: node scripts/gen-scripts-inventory.js)');
  }
  return String(m[1] || '').trim();
}

function readDeepDiveStatsSnapshot() {
  const doc = readText('docs/deep-dive.md');
  const siteMatch = doc.match(/^- 站点：(\d+)/m);
  const moduleMatch = doc.match(/^- 模块：(\d+)/m);
  const defsMatch = doc.match(/^- 注入定义：(\d+)（MAIN\s+(\d+)\s+\/\s+ISOLATED\s+(\d+)）/m);
  if (!siteMatch || !moduleMatch || !defsMatch) {
    throw new Error('docs/deep-dive.md is missing the 规模与热点 stats block (run: node scripts/stats.js and update docs/deep-dive.md)');
  }
  return {
    siteCount: Number(siteMatch[1]) || 0,
    moduleCount: Number(moduleMatch[1]) || 0,
    defCount: Number(defsMatch[1]) || 0,
    mainCount: Number(defsMatch[2]) || 0,
    isolatedCount: Number(defsMatch[3]) || 0
  };
}

function listSourceFiles(dirRel) {
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
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (CHECK_EXTENSIONS.has(ext)) out.push(p);
    }
  }
  out.sort();
  return out;
}

function rel(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/');
}

function transpileScriptForVm(source, filename, loader) {
  return transformSync(source, {
    loader,
    target: 'chrome96',
    format: 'esm',
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    sourcefile: filename
  }).code;
}

function readScriptForVm(absPath) {
  const filename = rel(absPath);
  const source = fs.readFileSync(absPath, 'utf8');
  const ext = path.extname(absPath).toLowerCase();
  const loader = TS_LOADERS.get(ext);
  if (!loader) return { code: source, filename };
  return { code: transpileScriptForVm(source, filename, loader), filename };
}

function readSharedConfigScript(tsPath, jsFallbackPath) {
  const tsAbs = path.join(ROOT, tsPath);
  if (fs.existsSync(tsAbs)) {
    const tsSource = readText(tsPath);
    return {
      code: transpileScriptForVm(tsSource, tsPath, 'ts'),
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

function checkScriptSyntax() {
  const roots = ['background', 'content', 'options', 'popup', 'shared'];
  const files = roots.flatMap((d) => listSourceFiles(d));
  const failures = [];
  for (const abs of files) {
    try {
      // vm.Script parses in "script" mode and throws on syntax errors.
      const script = readScriptForVm(abs);
      new vm.Script(script.code, { filename: script.filename });
    } catch (e) {
      failures.push({ file: rel(abs), error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { files: files.map(rel), failures };
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
  if (typeof inj.buildDefaultSettings !== 'function') throw new Error('AISHORTCUTS_INJECTIONS.buildDefaultSettings is missing');
  if (typeof inj.buildContentScriptDefs !== 'function') throw new Error('AISHORTCUTS_INJECTIONS.buildContentScriptDefs is missing');
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
      `${SOURCE_MANIFEST_PATH} host_permissions mismatch (run: node scripts/sync-manifest.js)\nexpected:\n- ${expectedHostPerms.join('\n- ')}\nactual:\n- ${actualHostPerms.join('\n- ')}`
    );
  }

  const bootstrapMatches = normalizePatterns(findBootstrapMatches(manifest));
  const expectedBootstrapMatches = normalizePatterns(registryAllMatchPatterns(reg));
  if (expectedBootstrapMatches.join('\n') !== bootstrapMatches.join('\n')) {
    errors.push(
      `${SOURCE_MANIFEST_PATH} bootstrap matches mismatch (run: node scripts/sync-manifest.js)\nexpected:\n- ${expectedBootstrapMatches.join('\n- ')}\nactual:\n- ${bootstrapMatches.join('\n- ')}`
    );
  }

  for (const m of Array.from(matchPatterns.values()).filter(Boolean)) {
    const ok = hostPerms.some((p) => coversHostPermission(p, m));
    if (!ok) errors.push(`${SOURCE_MANIFEST_PATH} host_permissions does not cover match pattern used by injections: ${m}`);
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

function normalizeRuntimeContentPath(input) {
  const relPath = String(input || '').trim().replace(/\\/g, '/');
  if (!relPath.startsWith('content/')) return '';
  const ext = path.extname(relPath).toLowerCase();
  if (TS_LOADERS.has(ext)) return relPath.replace(/\.(cts|mts|tsx|ts)$/i, '.js');
  if (!CONTENT_RUNTIME_EXTENSIONS.has(ext)) return '';
  return relPath;
}

function listContentRuntimeFiles() {
  const out = [];
  const stack = [path.join(ROOT, 'content')];
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
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!CONTENT_RUNTIME_EXTENSIONS.has(ext)) continue;
      const runtimeRel = normalizeRuntimeContentPath(rel(p));
      if (!runtimeRel) continue;
      out.push(runtimeRel);
    }
  }
  out.sort();
  return out;
}

function collectReferencedContentRuntimeFiles(defs, manifest) {
  const refs = new Set();

  const appendRefs = (value) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      const normalized = normalizeRuntimeContentPath(item);
      if (normalized) refs.add(normalized);
    }
  };

  const manifestScripts = Array.isArray(manifest?.content_scripts) ? manifest.content_scripts : [];
  for (const scriptDef of manifestScripts) {
    appendRefs(scriptDef?.js);
    appendRefs(scriptDef?.css);
  }

  for (const def of Array.isArray(defs) ? defs : []) {
    appendRefs(def?.js);
    appendRefs(def?.css);
  }

  return refs;
}

function verifyNoOrphanContentRuntimeFiles(defs, manifest) {
  const sourceRuntimeFiles = listContentRuntimeFiles();
  const referencedRuntimeFiles = collectReferencedContentRuntimeFiles(defs, manifest);
  const orphans = sourceRuntimeFiles.filter((file) => !referencedRuntimeFiles.has(file));
  if (!orphans.length) return { ok: true, sourceCount: sourceRuntimeFiles.length, referencedCount: referencedRuntimeFiles.size };
  return {
    ok: false,
    sourceCount: sourceRuntimeFiles.length,
    referencedCount: referencedRuntimeFiles.size,
    orphans
  };
}

function summarizeInjectionStats(reg, defs) {
  const sites = Array.isArray(reg?.sites) ? reg.sites : [];
  const modules = reg?.modules && typeof reg.modules === 'object' ? reg.modules : {};
  let mainCount = 0;
  let isolatedCount = 0;
  for (const def of Array.isArray(defs) ? defs : []) {
    const world = String(def?.world || '').toUpperCase();
    if (world === 'MAIN') mainCount += 1;
    else isolatedCount += 1;
  }
  return {
    siteCount: sites.length,
    moduleCount: Object.keys(modules).length,
    defCount: Array.isArray(defs) ? defs.length : 0,
    mainCount,
    isolatedCount
  };
}

function main() {
  const syntax = checkScriptSyntax();
  if (syntax.failures.length) {
    console.error('Script syntax check: FAIL');
    for (const f of syntax.failures) console.error(`- ${f.file}: ${f.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Script syntax check: OK (${syntax.files.length} files)`);

  let manifest;
  try {
    manifest = JSON.parse(readText(SOURCE_MANIFEST_PATH));
  } catch (e) {
    console.error(`${SOURCE_MANIFEST_PATH} parse: FAIL (${e instanceof Error ? e.message : String(e)})`);
    process.exitCode = 1;
    return;
  }
  console.log(`${SOURCE_MANIFEST_PATH} parse: OK`);

  const manifestVersion = String(manifest?.version || '').trim();
  if (!manifestVersion) {
    console.error(`${SOURCE_MANIFEST_PATH} version check: FAIL (${SOURCE_MANIFEST_PATH} version is missing)`);
    process.exitCode = 1;
    return;
  }

  let inventoryVersion;
  try {
    inventoryVersion = readScriptsInventoryVersion();
  } catch (e) {
    console.error(`docs/scripts-inventory.md version check: FAIL (${e instanceof Error ? e.message : String(e)})`);
    process.exitCode = 1;
    return;
  }

  if (inventoryVersion !== manifestVersion) {
    console.error('docs/scripts-inventory.md version check: FAIL');
    console.error(`- ${SOURCE_MANIFEST_PATH} version: ${manifestVersion}`);
    console.error(`- docs/scripts-inventory.md version: ${inventoryVersion}`);
    console.error('- Run: node scripts/gen-scripts-inventory.js');
    process.exitCode = 1;
    return;
  }
  console.log(`docs/scripts-inventory.md version check: OK (v${inventoryVersion})`);

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
  const runtimeDefs = injections.buildContentScriptDefs(reg);
  for (const w of res.warnings) console.warn(`WARN: ${w}`);
  if (res.errors.length) {
    console.error('Registry consistency: FAIL');
    for (const err of res.errors) console.error(`- ${err}`);
    process.exitCode = 1;
    return;
  }
  console.log('Registry consistency: OK');

  let deepDiveStats;
  try {
    deepDiveStats = readDeepDiveStatsSnapshot();
  } catch (e) {
    console.error(`docs/deep-dive.md stats check: FAIL (${e instanceof Error ? e.message : String(e)})`);
    process.exitCode = 1;
    return;
  }

  const actualStats = summarizeInjectionStats(reg, runtimeDefs);
  const statsMismatch =
    deepDiveStats.siteCount !== actualStats.siteCount ||
    deepDiveStats.moduleCount !== actualStats.moduleCount ||
    deepDiveStats.defCount !== actualStats.defCount ||
    deepDiveStats.mainCount !== actualStats.mainCount ||
    deepDiveStats.isolatedCount !== actualStats.isolatedCount;
  if (statsMismatch) {
    console.error('docs/deep-dive.md stats check: FAIL');
    console.error(
      `- docs/deep-dive.md stats: sites ${deepDiveStats.siteCount}, modules ${deepDiveStats.moduleCount}, defs ${deepDiveStats.defCount} (MAIN ${deepDiveStats.mainCount} / ISOLATED ${deepDiveStats.isolatedCount})`
    );
    console.error(
      `- actual stats: sites ${actualStats.siteCount}, modules ${actualStats.moduleCount}, defs ${actualStats.defCount} (MAIN ${actualStats.mainCount} / ISOLATED ${actualStats.isolatedCount})`
    );
    console.error('- Run: node scripts/stats.js and update docs/deep-dive.md');
    process.exitCode = 1;
    return;
  }
  console.log(
    `docs/deep-dive.md stats check: OK (sites ${actualStats.siteCount}, modules ${actualStats.moduleCount}, defs ${actualStats.defCount})`
  );

  const orphanCheck = verifyNoOrphanContentRuntimeFiles(runtimeDefs, manifest);
  if (!orphanCheck.ok) {
    console.error('Content runtime file coverage: FAIL');
    for (const orphan of orphanCheck.orphans) {
      console.error(`- Orphan content runtime file (not referenced by manifest/injections): ${orphan}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Content runtime file coverage: OK (${orphanCheck.referencedCount}/${orphanCheck.sourceCount} referenced)`);

  console.log('Integrated repo checks: OK');
}

main();
