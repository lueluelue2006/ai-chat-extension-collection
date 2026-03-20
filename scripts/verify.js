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

function verifyChatgptNativeEditCmdEnterFallback() {
  const abs = path.join(ROOT, 'content/chatgpt-cmdenter-send/main.js');
  const priorGlobals = {
    Element: global.Element,
    HTMLButtonElement: global.HTMLButtonElement,
    window: global.window,
    document: global.document
  };

  class FakeElement {
    constructor(tagName, { attrs = {}, className = '', text = '', disabled = false } = {}) {
      this.tagName = String(tagName || '').toUpperCase();
      this.nodeType = 1;
      this._attrs = { ...attrs };
      this.className = className || String(attrs.class || '');
      this.textContent = text;
      this.innerText = text;
      this.disabled = !!disabled;
      this.children = [];
      this.parentElement = null;
      this.isContentEditable = false;
    }

    append(...children) {
      for (const child of children) {
        if (!child) continue;
        child.parentElement = this;
        this.children.push(child);
      }
      return this;
    }

    getAttribute(name) {
      return this._attrs?.[name] ?? null;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const selectors = String(selector || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const out = [];
      const walk = (node) => {
        for (const child of node.children || []) {
          if (selectors.some((sel) => matchesSelector(child, sel))) out.push(child);
          walk(child);
        }
      };
      walk(this);
      return out;
    }

    closest(selector) {
      let node = this;
      while (node) {
        if (matchesSelector(node, selector)) return node;
        node = node.parentElement || null;
      }
      return null;
    }
  }

  function matchesSelector(node, selector) {
    const sel = String(selector || '').trim();
    if (!sel) return false;
    if (sel === 'article') return node.tagName === 'ARTICLE';
    if (sel === 'form') return node.tagName === 'FORM';
    if (sel === 'button') return node.tagName === 'BUTTON';
    if (sel === 'textarea') return node.tagName === 'TEXTAREA';
    if (sel === 'textarea[name="prompt-textarea"]') return node.tagName === 'TEXTAREA' && node.getAttribute('name') === 'prompt-textarea';
    if (sel === '#prompt-textarea') return node.getAttribute('id') === 'prompt-textarea';
    if (sel === '.ProseMirror[contenteditable="true"]') {
      return /\bProseMirror\b/.test(String(node.className || '')) && node.getAttribute('contenteditable') === 'true';
    }
    if (sel === 'button[data-testid="send-button"]') {
      return node.tagName === 'BUTTON' && node.getAttribute('data-testid') === 'send-button';
    }
    if (sel === 'button#composer-submit-button') {
      return node.tagName === 'BUTTON' && node.getAttribute('id') === 'composer-submit-button';
    }
    return false;
  }

  try {
    global.Element = FakeElement;
    global.HTMLButtonElement = FakeElement;
    global.window = undefined;
    global.document = {};
    delete global.__aichat_cmdenter_send_installed__;
    delete require.cache[require.resolve(abs)];
    const api = require(abs);

    const article = new FakeElement('article');
    const textarea = new FakeElement('textarea', { text: 'edited text' });
    textarea.value = 'edited text';
    const cancel = new FakeElement('button', { text: 'Cancel' });
    const send = new FakeElement('button', { text: 'Send' });
    article.append(textarea, cancel, send);

    const prompt = api.getChatGPTPromptElementFrom(textarea);
    if (prompt !== textarea) {
      return { ok: false, reason: 'native_edit_prompt_not_detected' };
    }

    const sendButton = api.getChatgptSendButtonNear(textarea);
    if (sendButton !== send) {
      return { ok: false, reason: 'native_edit_send_button_not_found' };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  } finally {
    delete require.cache[require.resolve(abs)];
    delete global.__aichat_cmdenter_send_installed__;
    global.Element = priorGlobals.Element;
    global.HTMLButtonElement = priorGlobals.HTMLButtonElement;
    global.window = priorGlobals.window;
    global.document = priorGlobals.document;
  }
}

function verifyChatgptTurnHostHardening() {
  const coreFiles = ['content/chatgpt-core.js', 'content/chatgpt-core-main.js'];
  const requiredTurnSelector = 'section[data-testid^="conversation-turn-"]';
  const requiredModelSelector = 'button[data-testid="model-switcher-dropdown-button"]';
  const failures = [];

  for (const relPath of coreFiles) {
    const source = readText(relPath);
    if (!source.includes(requiredTurnSelector)) {
      failures.push(`${relPath} is missing ${requiredTurnSelector}`);
    }
    if (!source.includes(requiredModelSelector)) {
      failures.push(`${relPath} is missing ${requiredModelSelector}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptModelDetectionHardening() {
  const checks = [
    {
      relPath: 'content/chatgpt-reply-timer/main.js',
      patterns: ['model-switcher-dropdown-button', 'Model selector']
    },
    {
      relPath: 'content/chatgpt-tab-queue/main.js',
      patterns: ['model-switcher-dropdown-button', 'Model selector']
    }
  ];
  const failures = [];

  for (const check of checks) {
    const source = readText(check.relPath);
    for (const pattern of check.patterns) {
      if (!source.includes(pattern)) {
        failures.push(`${check.relPath} is missing ${pattern}`);
      }
    }
  }

  const thinkingToggleSource = readText('content/chatgpt-thinking-toggle/main.js');
  for (const staleLiteral of ['model-switcher-gpt-5-2-thinking', 'model-switcher-gpt-5-2-pro']) {
    if (thinkingToggleSource.includes(staleLiteral)) {
      failures.push(`content/chatgpt-thinking-toggle/main.js still hard-codes ${staleLiteral}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptTopbarModelBadge() {
  const source = readText('content/chatgpt-sidebar-header-fix/main.js');
  const coreMainSource = readText('content/chatgpt-core-main.js');
  const thinkingToggleSource = readText('content/chatgpt-thinking-toggle/main.js');
  const failures = [];

  for (const required of [
    'TOPBAR_MODEL_BADGE_ATTR',
    'TOPBAR_MODEL_BADGE_BUTTON_ATTR',
    'TOPBAR_MODEL_BADGE_BUTTON_CLASS',
    'TOPBAR_MODEL_META_ATTR',
    'TOPBAR_ROUTE_RECOVERY_MS',
    'TOPBAR_STARTUP_DELAYS_MS',
    'readModelButtonReactLabel',
    'readTopbarModelBadgeLabel',
    'syncTopbarModelBadge',
    'syncTopbarModelBadgeButton',
    'handleTopbarModelBadgeToggle',
    'TOPBAR_MODEL_BADGE_EVENT',
    'gpt-5-3',
    'Thinking',
    'Pro'
  ]) {
    if (!source.includes(required)) {
      failures.push(`content/chatgpt-sidebar-header-fix/main.js is missing ${required}`);
    }
  }

  if (!source.includes('modelButton[propsKey]') && !source.includes("__reactProps$")) {
    failures.push('content/chatgpt-sidebar-header-fix/main.js is not reading React props for model selector metadata');
  }
  if (!source.includes('getChatGptCoreMain') || !source.includes('readCurrentModelMetaLabel')) {
    failures.push('content/chatgpt-sidebar-header-fix/main.js is not consuming chatgpt-core-main model metadata');
  }
  if (
    !coreMainSource.includes('function readCurrentModelMetaLabel()') ||
    !coreMainSource.includes('readCurrentModelMetaLabel,') ||
    !coreMainSource.includes('data-qn-chatgpt-model-meta-label')
  ) {
    failures.push('content/chatgpt-core-main.js is missing exported readCurrentModelMetaLabel()');
  }
  for (const required of ['PUBLIC_API_KEY', 'TOPBAR_TOGGLE_EVENT', 'function setModelType(', 'toggleModelType,', 'setModelType,', 'detectCurrentModelMode', 'installTopbarToggleBridge']) {
    if (!thinkingToggleSource.includes(required)) {
      failures.push(`content/chatgpt-thinking-toggle/main.js is missing ${required}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptBootstrapRouteEnsureHardening() {
  const source = readText('content/bootstrap.js');
  const failures = [];

  for (const required of ['hasQuicknavRuntimeBridge', 'Force ensure only when the shared runtime bridge is genuinely absent']) {
    if (!source.includes(required)) failures.push(`content/bootstrap.js is missing ${required}`);
  }
  if (source.includes('const force = !hasQuicknavUi();')) {
    failures.push('content/bootstrap.js still forces route reinjects based on hasQuicknavUi()');
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptReplyTimerExtendedProGate() {
  const abs = path.join(ROOT, 'content/chatgpt-reply-timer/main.js');
  const priorGlobals = {
    window: global.window,
    document: global.document
  };

  try {
    global.window = undefined;
    global.document = undefined;
    delete require.cache[require.resolve(abs)];
    const api = require(abs);
    if (!api || typeof api.shouldTrackReplyTimer !== 'function') {
      return { ok: false, reason: 'reply_timer_test_api_missing' };
    }
    const shouldTrack = api.shouldTrackReplyTimer({
      payloadModel: '',
      modelLabel: 'ChatGPT',
      composerModeLabel: 'Extended Pro'
    });
    if (shouldTrack !== false) {
      return { ok: false, reason: 'reply_timer_should_skip_extended_pro_when_model_button_only_reports_chatgpt' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  } finally {
    delete require.cache[require.resolve(abs)];
    global.window = priorGlobals.window;
    global.document = priorGlobals.document;
  }
}

function verifyChatgptPerfStructureHardening() {
  const jsSource = readText('content/chatgpt-perf/content.js');
  const cssSource = readText('content/chatgpt-perf/content.css');
  const coreSource = readText('content/chatgpt-core.js');
  const quicknavSource = readText('content/chatgpt-quicknav.js');
  const scrollGuardSource = readText('content/scroll-guard-main.js');
  const failures = [];

  for (const required of ['__aichat_chatgpt_core_v1__', 'getTurnsSnapshot', 'cgptperf-turn']) {
    if (!jsSource.includes(required) && !cssSource.includes(required)) {
      failures.push(`chatgpt-perf is missing ${required}`);
    }
  }

  if (!jsSource.includes('__aichat_chatgpt_core_v1__')) {
    failures.push('content/chatgpt-perf/content.js is not wired to chatgpt-core');
  }
  if (!jsSource.includes('getTurnsSnapshot')) {
    failures.push('content/chatgpt-perf/content.js is missing chatgpt-core turn snapshot usage');
  }
  if (!jsSource.includes('cgptperf-turn')) {
    failures.push('content/chatgpt-perf/content.js is missing cgptperf-turn class management');
  }
  if (!coreSource.includes('getChatScrollContainer')) {
    failures.push('content/chatgpt-core.js is missing shared chat scroll-container service');
  }
  if (!coreSource.includes('getVisibleTurnWindow')) {
    failures.push('content/chatgpt-core.js is missing shared visible-turn window service');
  }
  if (!jsSource.includes('ROOT_HOT_ATTR') || !jsSource.includes('syncTailTurnMetrics')) {
    failures.push('content/chatgpt-perf/content.js is missing active-tail hot-path coordination');
  }
  if (!jsSource.includes('startFallbackTurnsWatch') || !jsSource.includes('currentRouteKey')) {
    failures.push('content/chatgpt-perf/content.js is missing SPA fallback route/turn watches');
  }
  if (!jsSource.includes('containsTurnRoot(')) {
    failures.push('content/chatgpt-perf/content.js is missing wrapper-aware turn fallback detection');
  }
  if (!jsSource.includes('preferLiveDom')) {
    failures.push('content/chatgpt-perf/content.js is missing live-DOM fallback turn refresh');
  }
  if (!quicknavSource.includes('getChatScrollContainer?.()')) {
    failures.push('content/chatgpt-quicknav.js is not reusing chatgpt-core scroll-container service');
  }
  if (!quicknavSource.includes('getVisibleTurnWindow')) {
    failures.push('content/chatgpt-quicknav.js is not using shared visible-turn window service');
  }
  if (!quicknavSource.includes('cgptperfHot')) {
    failures.push('content/chatgpt-quicknav.js is missing cgptperf hot-path throttling');
  }
  if (!scrollGuardSource.includes('getChatScrollContainer')) {
    failures.push('content/scroll-guard-main.js is not reusing chatgpt-core-main scroll-container service');
  }
  if (!scrollGuardSource.includes('readPerfHotFromDataset') || !scrollGuardSource.includes('isChatgptHeavyStreaming')) {
    failures.push('content/scroll-guard-main.js is missing perf hot-path / heavy-streaming bypass');
  }
  if (!scrollGuardSource.includes('shouldBypassNestedCodeScroll') || !scrollGuardSource.includes('shouldBypassCodeIntoView')) {
    failures.push('content/scroll-guard-main.js is missing nested code-block scroll bypass');
  }
  if (!quicknavSource.includes('isCodeBlockInteraction') || !quicknavSource.includes('allowNavScrollFor(1400)')) {
    failures.push('content/chatgpt-quicknav.js is missing code-block interaction scroll-lock backoff');
  }
  const sidebarHeaderSource = readText('content/chatgpt-sidebar-header-fix/main.js');
  if (!sidebarHeaderSource.includes('topbarNeedsRepair') || !sidebarHeaderSource.includes('topbarRoutePollTimer')) {
    failures.push('content/chatgpt-sidebar-header-fix/main.js is missing SPA topbar self-healing polling');
  }
  if (!cssSource.includes('.cgptperf-turn')) {
    failures.push('content/chatgpt-perf/content.css is missing .cgptperf-turn selectors');
  }

  for (const staleLiteral of [":scope > article", "tagName !== 'ARTICLE'", "querySelectorAll('main article')"]) {
    if (jsSource.includes(staleLiteral)) {
      failures.push(`content/chatgpt-perf/content.js still hard-codes ${staleLiteral}`);
    }
  }

  if (cssSource.includes('main article')) {
    failures.push('content/chatgpt-perf/content.css still hard-codes main article selectors');
  }
  for (const staleCost of ["scopeRoot?.getElementsByTagName?.('*')?.length", "document.getElementsByTagName('*').length"]) {
    if (jsSource.includes(staleCost)) {
      failures.push(`content/chatgpt-perf/content.js still uses conversation-wide DOM counting via ${staleCost}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptQuicknavTurnCandidateHardening() {
  const quicknavSource = readText('content/chatgpt-quicknav.js');
  const failures = [];

  for (const required of ['isExtensionOwnedTurnCandidate', 'clearSyntheticTurnMarkers', 'cacheBaseIndex.length', "TURN_SELECTOR = null", 'bindCoreTurnsWatcher', 'core.onTurnsChange', '__cgptCoreTurnsUnsub', 'armRouteRecovery', 'getRawConversationTurnCount', 'getQuicknavEmptyLabel', 'shouldCacheTurnSelector', 'currentRouteEnteredAt = Date.now()', 'lastRenderedRouteKey', 'refresh-route-drift', 'getTurnAppendMarker', 'pendingPreviousRouteTurnMarkers', 'cachedTurnAppendMarkers', 'matchesPendingPreviousRouteTurns', '检测中…', 'installSecondaryRoutePoll', 'scopeOn(runtimeScope, window, \'popstate\', detectUrlChange)', 'scopeOn(runtimeScope, window, \'hashchange\', detectUrlChange)']) {
    if (!quicknavSource.includes(required)) {
      failures.push(`content/chatgpt-quicknav.js is missing ${required}`);
    }
  }

  if (!quicknavSource.includes("el.closest?.('[role=\"banner\"")) {
    failures.push('content/chatgpt-quicknav.js is missing banner/header exclusion in turn fallback');
  }

  if (quicknavSource.includes("el.querySelector('p,li,pre,code,blockquote')")) {
    failures.push('content/chatgpt-quicknav.js still uses generic text-node fallback for turn candidate detection');
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
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

  const nativeEditCheck = verifyChatgptNativeEditCmdEnterFallback();
  if (!nativeEditCheck.ok) {
    console.error(`ChatGPT native edit Cmd+Enter support: FAIL (${nativeEditCheck.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT native edit Cmd+Enter support: OK');

  const turnHostHardening = verifyChatgptTurnHostHardening();
  if (!turnHostHardening.ok) {
    console.error(`ChatGPT turn host hardening: FAIL (${turnHostHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT turn host hardening: OK');

  const modelDetectionHardening = verifyChatgptModelDetectionHardening();
  if (!modelDetectionHardening.ok) {
    console.error(`ChatGPT model detection hardening: FAIL (${modelDetectionHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT model detection hardening: OK');

  const topbarModelBadge = verifyChatgptTopbarModelBadge();
  if (!topbarModelBadge.ok) {
    console.error(`ChatGPT topbar model badge: FAIL (${topbarModelBadge.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT topbar model badge: OK');

  const bootstrapRouteEnsureHardening = verifyChatgptBootstrapRouteEnsureHardening();
  if (!bootstrapRouteEnsureHardening.ok) {
    console.error(`ChatGPT bootstrap route ensure hardening: FAIL (${bootstrapRouteEnsureHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT bootstrap route ensure hardening: OK');

  const replyTimerGate = verifyChatgptReplyTimerExtendedProGate();
  if (!replyTimerGate.ok) {
    console.error(`ChatGPT reply timer Extended Pro gate: FAIL (${replyTimerGate.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT reply timer Extended Pro gate: OK');

  const perfStructureHardening = verifyChatgptPerfStructureHardening();
  if (!perfStructureHardening.ok) {
    console.error(`ChatGPT perf structure hardening: FAIL (${perfStructureHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT perf structure hardening: OK');

  const quicknavTurnCandidateHardening = verifyChatgptQuicknavTurnCandidateHardening();
  if (!quicknavTurnCandidateHardening.ok) {
    console.error(`ChatGPT QuickNav turn candidate hardening: FAIL (${quicknavTurnCandidateHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT QuickNav turn candidate hardening: OK');

  console.log('Integrated repo checks: OK');
}

main();
