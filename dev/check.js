#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const TS_LOADERS = new Map([
  ['.ts', 'ts'],
  ['.tsx', 'tsx'],
  ['.mts', 'ts'],
  ['.cts', 'ts']
]);
const CHECK_EXTENSIONS = new Set(['.js', ...TS_LOADERS.keys()]);
const DEV_SELF_TESTS = Object.freeze([
  'dev/test-usage-monitor-utils.js',
  'dev/test-usage-monitor-bridge.js',
  'dev/test-quicknav-bridge-nonce.js',
  'dev/test-quicknav-runtime-naming.js',
  'dev/test-qwen-quicknav-active-lock.js',
  'dev/test-chatgpt-cmdenter-send.js',
  'dev/test-chatgpt-scroll-lock-send-guard.js',
  'dev/test-chatgpt-perf-defaults.js',
  'dev/test-chatgpt-thinking-toggle-effort-cycle.js',
  'dev/test-chatgpt-tree-quicknav-autocollapse.js',
  'dev/test-qwen-thinking-toggle.js',
  'dev/test-qwen-quicknav-route-watcher.js',
  'dev/test-qwen-quicknav-route-gate.js',
  'dev/test-kimi-cmdenter-policy.js',
  'dev/test-kimi-injection-routing.js',
  'dev/test-kimi-scroll-lock-bridge.js',
  'dev/test-deepseek-injection-routing.js',
  'dev/test-deepseek-scroll-lock-bridge.js',
  'dev/test-ernie-preview-regression.js',
  'dev/test-ernie-scroll-lock-bridge.js',
  'dev/test-zai-scroll-lock-bridge.js',
  'dev/test-gemini-app-quicknav-kernel.js',
  'dev/test-genspark-injection-routing.js',
  'dev/test-genspark-scroll-lock-bridge.js',
  'dev/test-genspark-preview-filter.js',
  'dev/test-genspark-thinking-model-map.js',
  'dev/test-genspark-thinking-compat-payload.js',
  'dev/test-grok-injection-routing.js',
  'dev/test-mcp-smoke-injection-ordering.js',
  'dev/test-grok-rate-limit-display-ui.js',
  'dev/test-grok-rate-limit-display-heavy-access.js',
  'dev/test-grok-scroll-lock-bridge.js',
  'dev/test-grok-quicknav-event-lifecycle.js',
  'dev/test-grok-trash-cleanup-module.js',
  'dev/test-module-id-alias-compat.js',
  'dev/test-grok-quicknav-visibility-safety.js',
  'dev/test-multi-site-injection-routing.js'
]);

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readScriptsInventoryVersion() {
  const doc = readText('docs/scripts-inventory.md');
  const m = doc.match(/^- Version:\s*(\S+)\s*$/m);
  if (!m) {
    throw new Error('docs/scripts-inventory.md is missing "- Version: <version>" (run: node dev/gen-scripts-inventory.js)');
  }
  return String(m[1] || '').trim();
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

function runDevSelfTests() {
  console.log(`Dev self-tests: START (${DEV_SELF_TESTS.length} scripts)`);
  for (const scriptRel of DEV_SELF_TESTS) {
    const absPath = path.join(ROOT, scriptRel);
    const run = spawnSync(process.execPath, [absPath], { stdio: 'inherit' });
    if (run.error) {
      return {
        ok: false,
        script: scriptRel,
        exitCode: 1,
        error: run.error
      };
    }
    if (typeof run.status === 'number' && run.status !== 0) {
      return {
        ok: false,
        script: scriptRel,
        exitCode: run.status
      };
    }
    if (run.signal) {
      return {
        ok: false,
        script: scriptRel,
        exitCode: 1,
        signal: run.signal
      };
    }
  }
  return { ok: true };
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
    manifest = JSON.parse(readText('manifest.json'));
  } catch (e) {
    console.error(`manifest.json parse: FAIL (${e instanceof Error ? e.message : String(e)})`);
    process.exitCode = 1;
    return;
  }
  console.log('manifest.json parse: OK');

  const manifestVersion = String(manifest?.version || '').trim();
  if (!manifestVersion) {
    console.error('manifest.json version check: FAIL (manifest.json version is missing)');
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
    console.error(`- manifest.json version: ${manifestVersion}`);
    console.error(`- docs/scripts-inventory.md version: ${inventoryVersion}`);
    console.error('- Run: node dev/gen-scripts-inventory.js');
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
  for (const w of res.warnings) console.warn(`WARN: ${w}`);
  if (res.errors.length) {
    console.error('Registry consistency: FAIL');
    for (const err of res.errors) console.error(`- ${err}`);
    process.exitCode = 1;
    return;
  }
  console.log('Registry consistency: OK');

  const selfTests = runDevSelfTests();
  if (!selfTests.ok) {
    console.error(`Dev self-tests: FAIL (${selfTests.script})`);
    if (selfTests.error) {
      console.error(`- ${selfTests.error instanceof Error ? selfTests.error.message : String(selfTests.error)}`);
    }
    if (selfTests.signal) {
      console.error(`- terminated by signal: ${selfTests.signal}`);
    }
    process.exitCode = selfTests.exitCode || 1;
    return;
  }
  console.log(`Dev self-tests: OK (${DEV_SELF_TESTS.length} scripts)`);
}

main();
