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

function verifyChatgptDomAdapterContract(runtimeDefs) {
  const failures = [];
  const adapterFile = 'content/chatgpt-dom-adapter.js';
  const adapterSource = readText(adapterFile);

  for (const required of [
    '__aichat_chatgpt_dom_adapter_v1__',
    'getTurnsRoot',
    'getTurnArticles',
    'getTurnsSnapshot',
    'getEditorEl',
    'getComposerForm',
    'findSendButton',
    'findStopButton',
    'getModelSwitcherButton',
    'readComposerModeLabel',
    'getVisibleTurnWindow'
  ]) {
    if (!adapterSource.includes(required)) failures.push(`${adapterFile} is missing ${required}`);
  }

  const chatDefs = Array.isArray(runtimeDefs) ? runtimeDefs.filter((def) => def?.siteId === 'chatgpt') : [];
  for (const def of chatDefs) {
    const js = Array.isArray(def?.js) ? def.js : [];
    const adapterIdx = js.indexOf(adapterFile);
    const isolatedCoreIdx = js.indexOf('content/chatgpt-core.js');
    const mainCoreIdx = js.indexOf('content/chatgpt-core-main.js');
    for (const coreIdx of [isolatedCoreIdx, mainCoreIdx]) {
      if (coreIdx < 0) continue;
      if (adapterIdx < 0) failures.push(`${def.id} includes a ChatGPT core without ${adapterFile}`);
      else if (adapterIdx > coreIdx) failures.push(`${def.id} loads ${adapterFile} after a ChatGPT core`);
    }
  }

  const coreMainSource = readText('content/chatgpt-core-main.js');
  const coreSource = readText('content/chatgpt-core.js');
  for (const [relPath, source] of [
    ['content/chatgpt-core-main.js', coreMainSource],
    ['content/chatgpt-core.js', coreSource]
  ]) {
    if (!source.includes('getDomAdapter')) failures.push(`${relPath} is not wired to the DOM adapter`);
    if (!source.includes('__aichat_chatgpt_dom_adapter_v1__')) failures.push(`${relPath} is missing the DOM adapter key`);
  }
  if (
    !coreMainSource.includes('ownAdapterFallbackApi') ||
    !coreMainSource.includes('api === ownAdapterFallbackApi') ||
    !coreMainSource.includes('Object.defineProperty(window, DOM_ADAPTER_KEY')
  ) {
    failures.push('content/chatgpt-core-main.js is missing the non-recursive MAIN-world DOM adapter fallback');
  }
  if (
    !coreSource.includes('const liveTurns = getTurnsSnapshot(false)') ||
    !coreSource.includes('liveTurns.turns.length === 0')
  ) {
    failures.push('content/chatgpt-core.js is missing stale-empty turn-record cache recovery');
  }

  class FakeElement {
    constructor(tagName, { attrs = {}, className = '', text = '', rect = null } = {}) {
      this.tagName = String(tagName || '').toUpperCase();
      this.nodeType = 1;
      this._attrs = { ...attrs };
      this.className = className || String(attrs.class || '');
      this.textContent = text;
      this.innerText = text;
      this.children = [];
      this.parentElement = null;
      this.isConnected = true;
      this.scrollHeight = 1200;
      this.clientHeight = 800;
      this._rect = rect || { top: 0, bottom: 40, width: 120, height: 40 };
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
      return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
    }

    setAttribute(name, value) {
      this._attrs[name] = String(value);
    }

    matches(selector) {
      return selectorMatches(this, selector);
    }

    closest(selector) {
      let node = this;
      while (node) {
        if (selectorMatches(node, selector)) return node;
        node = node.parentElement || null;
      }
      return null;
    }

    contains(other) {
      if (other === this) return true;
      for (const child of this.children || []) {
        if (child === other || child.contains?.(other)) return true;
      }
      return false;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const selectors = splitSelectors(selector);
      const out = [];
      const walk = (node) => {
        for (const child of node.children || []) {
          if (selectors.some((sel) => selectorMatches(child, sel))) out.push(child);
          walk(child);
        }
      };
      walk(this);
      return out;
    }

    getBoundingClientRect() {
      return this._rect;
    }

    click() {
      this.clicked = true;
    }
  }

  class FakeDocument extends FakeElement {
    constructor() {
      super('#document');
      this.documentElement = new FakeElement('html');
      this.body = new FakeElement('body');
      this.documentElement.append(this.body);
      this.append(this.documentElement);
      this.scrollingElement = this.documentElement;
    }

    getElementById(id) {
      const all = this.querySelectorAll('*');
      return all.find((el) => el.getAttribute?.('id') === id) || null;
    }
  }

  function splitSelectors(selector) {
    return String(selector || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function attrMatches(node, attrExpression) {
    const m = String(attrExpression || '').match(/^([a-zA-Z0-9_-]+)([$^*]?=)?(?:"([^"]*)"|'([^']*)'|([^\]]+))?(?:\s+i)?$/);
    if (!m) return false;
    const name = m[1];
    const op = m[2] || '';
    const expected = String(m[3] ?? m[4] ?? m[5] ?? '').trim();
    const actualRaw = node.getAttribute?.(name);
    if (!op) return actualRaw !== null && actualRaw !== undefined;
    const actual = String(actualRaw || '');
    if (op === '=') return actual === expected;
    if (op === '^=') return actual.startsWith(expected);
    if (op === '*=') return actual.toLowerCase().includes(expected.toLowerCase());
    return false;
  }

  function selectorMatches(node, selector) {
    const sel = String(selector || '').trim();
    if (!sel) return false;
    if (sel === '*') return true;
    if (sel.includes(' ')) {
      const parts = sel.split(/\s+/).filter(Boolean);
      let current = node;
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const part = parts[i];
        if (i === parts.length - 1) {
          if (!selectorMatches(current, part)) return false;
          current = current.parentElement;
          continue;
        }
        while (current && !selectorMatches(current, part)) current = current.parentElement;
        if (!current) return false;
        current = current.parentElement;
      }
      return true;
    }

    let rest = sel;
    let tag = '';
    const tagMatch = rest.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
    if (tagMatch) {
      tag = tagMatch[0].toUpperCase();
      rest = rest.slice(tagMatch[0].length);
      if (node.tagName !== tag) return false;
    }

    const idMatches = Array.from(rest.matchAll(/#([a-zA-Z0-9_-]+)/g));
    for (const match of idMatches) {
      if (node.getAttribute?.('id') !== match[1]) return false;
    }

    const classMatches = Array.from(rest.matchAll(/\.([a-zA-Z0-9_-]+)/g));
    const className = String(node.className || '');
    for (const match of classMatches) {
      if (!new RegExp(`(^|\\s)${match[1]}(\\s|$)`).test(className)) return false;
    }

    const attrMatchesList = Array.from(rest.matchAll(/\[([^\]]+)\]/g));
    for (const match of attrMatchesList) {
      if (!attrMatches(node, match[1])) return false;
    }

    return true;
  }

  try {
    const document = new FakeDocument();
    const main = new FakeElement('main', { attrs: { id: 'main' }, rect: { top: 0, bottom: 800, width: 900, height: 800 } });
    const thread = new FakeElement('div', { attrs: { id: 'thread' }, rect: { top: 10, bottom: 760, width: 900, height: 750 } });
    document.body.append(main);
    main.append(thread);

    const roles = ['user', 'assistant', 'user', 'assistant'];
    for (let i = 0; i < roles.length; i += 1) {
      const wrap = new FakeElement('div', { rect: { top: 30 + i * 120, bottom: 110 + i * 120, width: 800, height: 80 } });
      const turn = new FakeElement('section', {
        attrs: {
          'data-testid': `conversation-turn-${i + 1}`,
          'data-turn': roles[i]
        },
        rect: { top: 30 + i * 120, bottom: 110 + i * 120, width: 800, height: 80 }
      });
      const msg = new FakeElement('div', {
        attrs: {
          'data-message-author-role': roles[i],
          'data-message-id': `msg-${i + 1}`
        },
        text: `message ${i + 1}`
      });
      turn.append(msg);
      wrap.append(turn);
      thread.append(wrap);
    }

    const form = new FakeElement('form');
    const editor = new FakeElement('div', {
      attrs: { id: 'prompt-textarea', contenteditable: 'true' },
      className: 'ProseMirror',
      text: ''
    });
    const mode = new FakeElement('button', { attrs: { 'aria-haspopup': 'menu' }, text: 'Heavy' });
    const send = new FakeElement('button', { attrs: { id: 'composer-submit-button', 'data-testid': 'send-button' }, text: 'Send prompt' });
    form.append(editor, mode, send);
    document.body.append(form);

    const model = new FakeElement('button', {
      attrs: { 'data-testid': 'model-switcher-dropdown-button', 'aria-label': 'Model selector' },
      text: 'ChatGPT'
    });
    document.body.append(model);

    const sandbox = {
      console,
      Date,
      URL,
      window: null,
      document,
      location: {
        href: 'https://chatgpt.com/c/test-conversation',
        pathname: '/c/test-conversation'
      },
      innerHeight: 900,
      Element: FakeElement,
      HTMLElement: FakeElement,
      HTMLButtonElement: FakeElement,
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', overflowY: 'auto' })
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(adapterSource, sandbox, { filename: adapterFile });
    const api = sandbox.__aichat_chatgpt_dom_adapter_v1__;
    if (!api || typeof api !== 'object') failures.push('adapter API did not install in VM');
    else {
      const root = api.getTurnsRoot();
      const turns = api.getTurnArticles(root, { forceFresh: true });
      const snapshot = api.getTurnsSnapshot(true);
      const visible = api.getVisibleTurnWindow(true, 900);
      const actualRoles = turns.map((turn) => api.getTurnRole(turn));
      const ids = turns.map((turn) => api.getMessageId(turn));
      if (root !== thread) failures.push('adapter did not choose the smallest ancestor containing all current ChatGPT turns');
      if (turns.length !== 4) failures.push(`adapter returned ${turns.length} turns instead of 4`);
      if (snapshot.turns.length !== 4) failures.push(`adapter snapshot returned ${snapshot.turns.length} turns instead of 4`);
      if (visible.visibleTurns.length !== 4) failures.push(`adapter visible window returned ${visible.visibleTurns.length} turns instead of 4`);
      if (actualRoles.join('/') !== 'user/assistant/user/assistant') failures.push(`adapter role extraction failed: ${actualRoles.join('/')}`);
      if (ids.join('/') !== 'msg-1/msg-2/msg-3/msg-4') failures.push(`adapter message id extraction failed: ${ids.join('/')}`);
      if (api.getEditorEl() !== editor) failures.push('adapter did not find the ProseMirror editor');
      if (api.getComposerForm(editor) !== form) failures.push('adapter did not find the composer form');
      if (api.findSendButton(editor) !== send) failures.push('adapter did not find the send button');
      if (api.getModelSwitcherButton() !== model) failures.push('adapter did not find the model switcher');
      if (api.readCurrentModelLabel() !== 'ChatGPT') failures.push('adapter did not read model label');
      if (api.readComposerModeLabel(editor) !== 'Heavy') failures.push('adapter did not read standalone composer mode label');
      if (api.getConversationIdFromUrl() !== 'test-conversation') failures.push('adapter did not parse conversation id');
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
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
  const tabQueueSource = readText('content/chatgpt-tab-queue/main.js');
  for (const staleLiteral of ['model-switcher-gpt-5-2-thinking', 'model-switcher-gpt-5-2-pro']) {
    if (thinkingToggleSource.includes(staleLiteral)) {
      failures.push(`content/chatgpt-thinking-toggle/main.js still hard-codes ${staleLiteral}`);
    }
  }
  for (const staleLiteral of ['extendedProPaused', 'isExtendedProLabel', 'isTabQueueModelAllowed', 'isTabQueueModelActive']) {
    if (tabQueueSource.includes(staleLiteral)) {
      failures.push(`content/chatgpt-tab-queue/main.js still hard-codes ${staleLiteral}`);
    }
  }
  for (const required of ['extractGptVersionPriority', 'findGptModelSelectorTrigger']) {
    if (!thinkingToggleSource.includes(required)) {
      failures.push(`content/chatgpt-thinking-toggle/main.js is missing ${required}`);
    }
  }
  for (const required of [
    'el instanceof HTMLButtonElement && isVisibleElement(el)',
    'button instanceof HTMLElement && isVisibleElement(button)',
    'cachedEffortPill instanceof HTMLButtonElement && document.contains(cachedEffortPill) && isVisibleElement(cachedEffortPill)'
  ]) {
    if (!thinkingToggleSource.includes(required)) {
      failures.push(`content/chatgpt-thinking-toggle/main.js is missing visible-control hardening: ${required}`);
    }
  }
  if (thinkingToggleSource.includes('byTestIdFirst')) {
    failures.push('content/chatgpt-thinking-toggle/main.js can still fall back to a hidden model switcher button');
  }
  if (!thinkingToggleSource.includes('el instanceof HTMLElement && isVisibleElement(el)')) {
    failures.push('content/chatgpt-thinking-toggle/main.js is missing visible menu-item filtering');
  }

  const settingsSources = [
    'options/options.js',
    'shared/i18n.js'
  ];
  for (const relPath of settingsSources) {
    const source = readText(relPath);
    if (source.includes('GPT 5.2 thinking') || source.includes('GPT 5.2 pro')) {
      failures.push(`${relPath} still contains stale GPT 5.2 thinking/pro copy`);
    }
    if (!source.includes('当前 GPT 5.x thinking ↔ pro') && !source.includes('current GPT 5.x Thinking and Pro variants')) {
      failures.push(`${relPath} is missing the GPT 5.x thinking/pro wording`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptThinkingToggleCmdPBlocker() {
  const mainSource = readText('content/chatgpt-thinking-toggle/main.js');
  const bridgeSource = readText('content/chatgpt-thinking-toggle/config-bridge.js');
  const optionsSource = readText('options/options.js');
  const registrySource = readText('shared/registry.ts');
  const i18nSource = readText('shared/i18n.js');
  const inventorySource = readText('docs/scripts-inventory.md');
  const failures = [];

  for (const required of [
    "const DS_DISABLE_CMD_P_KEY = 'aichatHotkeyDisableCmdPEnabled'",
    "if (action === 'block_cmd_p') return readBoolDataset(DS_DISABLE_CMD_P_KEY, true)",
    "return 'block_cmd_p'",
    "if (action === 'block_cmd_p') return;"
  ]) {
    if (!mainSource.includes(required)) {
      failures.push(`content/chatgpt-thinking-toggle/main.js is missing Cmd+P blocker support: ${required}`);
    }
  }

  const idxLight = mainSource.indexOf("return 'send_light_pro'");
  const idxMax = mainSource.indexOf("return 'send_max_pro'");
  const idxBlock = mainSource.indexOf("return 'block_cmd_p'");
  if (!(idxLight >= 0 && idxMax >= 0 && idxBlock >= 0 && idxLight < idxBlock && idxMax < idxBlock)) {
    failures.push('content/chatgpt-thinking-toggle/main.js must keep Cmd+Shift+P/Cmd+Option+P send actions ahead of plain Cmd+P blocking');
  }

  for (const required of [
    "const DS_DISABLE_CMD_P_KEY = 'aichatHotkeyDisableCmdPEnabled'",
    'disableCmdP: true',
    'pending.disableCmdP = !!disableCmdPSetting',
    'chatgpt_thinking_toggle_disable_cmd_p',
    'data-aichat-hotkey-disable-cmd-p-enabled'
  ]) {
    if (!bridgeSource.includes(required)) {
      failures.push(`content/chatgpt-thinking-toggle/config-bridge.js is missing Cmd+P option bridging: ${required}`);
    }
  }

  for (const required of [
    '禁用 ⌘P（阻止浏览器打印）',
    "getSiteModuleSetting(siteId, 'chatgpt_thinking_toggle_disable_cmd_p', true)",
    'chatgpt_thinking_toggle_disable_cmd_p = checked'
  ]) {
    if (!optionsSource.includes(required)) {
      failures.push(`options/options.js is missing Cmd+P settings UI support: ${required}`);
    }
  }

  for (const required of [
    "hotkeys: ['⌘O', '⌘J', '⌘P', '⌘⇧P', '⌘⌥P']",
    "{ key: 'chatgpt_thinking_toggle_disable_cmd_p', label: '禁用 ⌘P' }",
    '禁用 ⌘P / ⌘⇧P Light Pro 发送'
  ]) {
    if (!registrySource.includes(required)) {
      failures.push(`shared/registry.ts is missing Cmd+P option metadata: ${required}`);
    }
  }

  if (!inventorySource.includes('禁用 ⌘P / ⌘⇧P Light Pro 发送')) {
    failures.push('docs/scripts-inventory.md is missing the Cmd+P blocker inventory text');
  }
  if (!i18nSource.includes("'禁用 ⌘P（阻止浏览器打印）': 'Disable ⌘P (prevent browser print)'")) {
    failures.push('shared/i18n.js is missing Cmd+P blocker translation');
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptTabQueueRestoreRequeueGuard() {
  const tabQueuePath = path.join(ROOT, 'content/chatgpt-tab-queue/main.js');
  const tabQueueSource = readText('content/chatgpt-tab-queue/main.js');
  const failures = [];

  for (const required of [
    'restoredQueuedDraft',
    'rememberRestoredQueuedDraft(item)',
    'shouldSuppressImmediateSendForRestoredDraft',
    'shouldHoldRestoredDraftInQueuePool',
    'buildRestoredDraftQueuePoolHold',
    'queuePoolHold',
    'const suppressImmediateSend = shouldSuppressImmediateSendForRestoredDraft',
    'resetQueueSessionState({ preserveActiveResponseState: true, clearRestoredQueuedDraft: false })',
    'resetQueueSessionState({ preserveActiveResponseState: true })'
  ]) {
    if (!tabQueueSource.includes(required)) {
      failures.push(`content/chatgpt-tab-queue/main.js is missing restore/requeue guard: ${required}`);
    }
  }

  let tabQueue = null;
  try {
    delete require.cache[require.resolve(tabQueuePath)];
    tabQueue = require(tabQueuePath);
  } catch (error) {
    failures.push(`failed to load content/chatgpt-tab-queue/main.js in test mode: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!tabQueue || typeof tabQueue.shouldSuppressImmediateSendForRestoredDraft !== 'function') {
    failures.push('content/chatgpt-tab-queue/main.js must export shouldSuppressImmediateSendForRestoredDraft');
  } else {
    const suppress = tabQueue.shouldSuppressImmediateSendForRestoredDraft;
    if (!suppress({ restoredQueuedDraftActive: true, queueLength: 1 })) {
      failures.push('restore guard should suppress immediate send for the first requeued restored draft');
    }
    if (!suppress({ restoredQueuedDraftActive: true, queueLength: 2 })) {
      failures.push('restore guard should suppress immediate send for restored drafts even inside a larger queue pool');
    }
    if (suppress({ restoredQueuedDraftActive: false, queueLength: 1 })) {
      failures.push('restore guard should not suppress immediate send without a restored draft');
    }
  }

  if (!tabQueue || typeof tabQueue.shouldHoldRestoredDraftInQueuePool !== 'function') {
    failures.push('content/chatgpt-tab-queue/main.js must export shouldHoldRestoredDraftInQueuePool');
  } else {
    const hold = tabQueue.shouldHoldRestoredDraftInQueuePool;
    if (!hold({ restoredQueuedDraftActive: true, activeResponseAtRestore: true, currentActiveResponse: false })) {
      failures.push('restored drafts taken during an active response should return to the queue pool hold');
    }
    if (!hold({ restoredQueuedDraftActive: true, activeResponseAtRestore: false, currentActiveResponse: true })) {
      failures.push('restored drafts requeued while a response is active should return to the queue pool hold');
    }
    if (hold({ restoredQueuedDraftActive: true, activeResponseAtRestore: false, currentActiveResponse: false })) {
      failures.push('idle restored drafts should not create a response-settle pool hold');
    }
    if (hold({ restoredQueuedDraftActive: false, activeResponseAtRestore: true, currentActiveResponse: true })) {
      failures.push('non-restored drafts should not create a restored-draft pool hold');
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyOpenaiNewModelBannerRuntimeGuard() {
  const relPath = 'content/openai-new-model-banner/main.js';
  const source = readText(relPath);
  const failures = [];

  if (/\b(?:const|let|var)\s+msg\s*=/.test(source)) {
    failures.push(`${relPath} shadows the msg() i18n helper with a local variable`);
  }
  for (const required of [
    'function msg(',
    'const messageEl = document.createElement',
    'const alertMessage = buildAlertMessage(alerts)',
    "message: msg('notification', { count, msg: alertMessage })"
  ]) {
    if (!source.includes(required)) failures.push(`${relPath} is missing ${required}`);
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyOpenaiModelProbeStatusSemantics() {
  const monitorPath = 'background/sw/monitors.ts';
  const monitorSource = readText(monitorPath);
  const optionSources = [
    ['options/options.html', readText('options/options.html')],
    ['options/options.js', readText('options/options.js')],
    ['popup/popup.js', readText('popup/popup.js')],
    ['shared/registry.ts', readText('shared/registry.ts')],
    ['shared/i18n.js', readText('shared/i18n.js')],
    ['content/openai-new-model-banner/main.js', readText('content/openai-new-model-banner/main.js')]
  ];
  const failures = [];

  if (!monitorSource.includes('defaultUrls: Object.freeze([])')) {
    failures.push(`${monitorPath} must not ship built-in OpenAI model probe URLs`);
  }
  for (const stale of ['GPT53_DEFAULT_MODEL_ICONS', 'GPT53_DEFAULT_ICON_BASE', 'status !== 404']) {
    if (monitorSource.includes(stale)) failures.push(`${monitorPath} still contains stale probe logic: ${stale}`);
  }
  if (!monitorSource.includes('function isGpt53AvailableStatus')) {
    failures.push(`${monitorPath} is missing an explicit availability-status helper`);
  }
  if (!monitorSource.includes('n >= 200 && n < 300')) {
    failures.push(`${monitorPath} must treat only HTTP 2xx responses as available`);
  }
  if (!monitorSource.includes("available: false, status: 0") || monitorSource.includes('if (prevAvailable) availableNow.push')) {
    failures.push(`${monitorPath} must not carry previous availability through fetch failures`);
  }

  for (const [relPath, source] of optionSources) {
    if (source.includes('非 404') || source.includes('non-404') || source.includes('reachable')) {
      failures.push(`${relPath} still describes the probe as non-404/reachable`);
    }
  }
  const optionsCopy = optionSources[0][1];
  if (!optionsCopy.includes('只有 HTTP 2xx 成功响应才会提醒你') || !optionsCopy.includes('403、404、5xx 和请求失败都视为不可用')) {
    failures.push('options/options.html is missing the 2xx/403 unavailable user-facing explanation');
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyGoogleAskGptHandoff(runtimeDefs) {
  const googleSource = readText('content/google-ask-gpt/main.js');
  const receiverSource = readText('content/chatgpt-google-ask/main.js');
  const registrySource = readText('shared/registry.ts');
  const i18nSource = readText('shared/i18n.js');
  const moduleSettingsSource = readText('options/module-settings/core.js');
  const inventorySource = readText('docs/scripts-inventory.md');
  const failures = [];

  for (const [relPath, source] of [
    ['content/google-ask-gpt/main.js', googleSource],
    ['content/chatgpt-google-ask/main.js', receiverSource],
    ['shared/registry.ts', registrySource],
    ['shared/i18n.js', i18nSource],
    ['options/module-settings/core.js', moduleSettingsSource],
    ['docs/scripts-inventory.md', inventorySource]
  ]) {
    for (const stale of ['gpt-5-4-thinking', 'TARGET_MODEL', 'TARGET_EFFORT', 'ChatGPT 5.4', '5.4 Thinking']) {
      if (source.includes(stale)) failures.push(`${relPath} still contains stale Google Ask handoff text/model: ${stale}`);
    }
  }

  for (const stale of ['payload.model', 'payload.thinking_effort', 'pendingPayloadOverride', 'chatgpt-google-ask']) {
    if (receiverSource.includes(stale)) {
      failures.push(`content/chatgpt-google-ask/main.js must not force a ChatGPT model for Google Ask handoff (${stale})`);
    }
  }

  for (const required of ['function findSearchRoot', 'function findAnchorElement', 'button[type="submit"]', 'input[type="submit"]']) {
    if (!googleSource.includes(required)) {
      failures.push(`content/google-ask-gpt/main.js is missing structural Google search anchor support: ${required}`);
    }
  }
  if (googleSource.includes("window.open(target, '_blank', 'noopener,noreferrer')")) {
    failures.push('content/google-ask-gpt/main.js must not combine noopener window.open with fallback navigation; Chrome returns null and can create duplicate handoffs');
  }
  if (!googleSource.includes('opened.opener = null')) {
    failures.push('content/google-ask-gpt/main.js must detach the opened ChatGPT tab opener after a successful window.open');
  }

  const receiverDef = Array.isArray(runtimeDefs)
    ? runtimeDefs.find((def) => def && def.id === 'quicknav_google_search_ask_gpt_receiver')
    : null;
  const receiverJs = Array.isArray(receiverDef?.js) ? receiverDef.js : [];
  for (const staleDependency of ['content/chatgpt-fetch-hub/main.js', 'content/chatgpt-fetch-hub/consumer-base.js']) {
    if (receiverJs.includes(staleDependency)) {
      failures.push(`quicknav_google_search_ask_gpt_receiver no longer needs fetch override dependency ${staleDependency}`);
    }
  }

  for (const required of [
    'SEARCH_PROMPT',
    'clearHandledParams',
    'writeEditorText',
    'sendViaButton',
    "document.execCommand('selectAll'",
    'clickSendButton'
  ]) {
    if (!receiverSource.includes(required)) {
      failures.push(`content/chatgpt-google-ask/main.js is missing handoff workflow guard ${required}`);
    }
  }
  if (receiverSource.includes('selectNodeContents(editor)')) {
    failures.push('content/chatgpt-google-ask/main.js must not use Range.selectNodeContents(editor) for ProseMirror replacement');
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyQwenThinkingToggleHardening() {
  const source = readText('content/qwen-thinking-toggle/main.js');
  const failures = [];

  for (const required of [
    'function readModelNameFromText',
    'function getModelItemName',
    'function dedupeModelNames',
    'function pickNameByPattern',
    'function pickModelToggleTarget(current, availableNames)',
    'const match = value.match(/Qwen[\\w.-]+/i);',
  ]) {
    if (!source.includes(required)) {
      failures.push(`content/qwen-thinking-toggle/main.js is missing Qwen model-list driven toggle support: ${required}`);
    }
  }

  if (!source.includes('/Qwen[\\w.-]+/i')) {
    failures.push('content/qwen-thinking-toggle/main.js must parse current Qwen model names generically instead of only Qwen3.5 labels');
  }
  if (!source.includes('/max|preview/i') || !source.includes('/plus/i')) {
    failures.push('content/qwen-thinking-toggle/main.js must prefer current menu Plus/Max/Preview model pairs');
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyGensparkSonnetThinkingCompatibility() {
  const registrySource = readText('shared/registry.ts');
  const i18nSource = readText('shared/i18n.js');
  const moduleSettingsSource = readText('options/module-settings/core.js');
  const inventorySource = readText('docs/scripts-inventory.md');
  const forceSource = readText('content/genspark-force-sonnet45-thinking/main.js');
  const failures = [];

  if (!/genspark_force_sonnet45_thinking:\s*{[\s\S]*?defaultEnabled:\s*false[\s\S]*?}/.test(registrySource)) {
    failures.push('genspark_force_sonnet45_thinking must be off by default because current Genspark AI Chat defaults to Opus 4.6');
  }

  for (const [relPath, source] of [
    ['shared/registry.ts', registrySource],
    ['shared/i18n.js', i18nSource],
    ['options/module-settings/core.js', moduleSettingsSource],
    ['docs/scripts-inventory.md', inventorySource]
  ]) {
    if (!source.includes('Sonnet 4.5') || !source.includes('默认关闭')) {
      failures.push(`${relPath} must describe the Genspark Sonnet 4.5 thinking rewrite as legacy/off-by-default compatibility`);
    }
  }

  for (const required of [
    "TARGET_MODELS = new Set(['claude-sonnet-4-5', 'claude-sonnet-4-5-20250929'])",
    "THINKING_MODEL = 'claude-sonnet-4-5-thinking'",
    'return TARGET_MODELS.has(v) ? THINKING_MODEL : v;',
    'function shouldHandleThinkingModel(inputModel)',
    'let shouldTapThinkingStream = false;',
    'if (shouldTapThinkingStream && ASK_API_RE.test(reqUrl) && isAiChatPage())'
  ]) {
    if (!forceSource.includes(required)) {
      failures.push(`content/genspark-force-sonnet45-thinking/main.js must stay limited to known Sonnet 4.5 model ids: ${required}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyMetaAiCmdEnterSupport(runtimeDefs) {
  const registrySource = readText('shared/registry.ts');
  const metaCmdenterSource = readText('content/meta-ai-cmdenter-main.js');
  const metaQuicknavSource = readText('content/meta-ai-quicknav.js');
  const failures = [];

  const def = Array.isArray(runtimeDefs)
    ? runtimeDefs.find((item) => item && item.id === 'quicknav_meta_ai_cmdenter_send')
    : null;
  const quicknavDef = Array.isArray(runtimeDefs)
    ? runtimeDefs.find((item) => item && item.id === 'quicknav_meta_ai')
    : null;
  if (!def) {
    failures.push('shared/injections.ts is missing quicknav_meta_ai_cmdenter_send');
  } else {
    const matches = normalizePatterns(def.matches || []);
    const js = Array.isArray(def.js) ? def.js : [];
    for (const requiredMatch of ['https://www.meta.ai/*', 'https://meta.ai/*']) {
      if (!matches.includes(requiredMatch)) failures.push(`Meta AI Cmd+Enter injection is missing match: ${requiredMatch}`);
    }
    if (!js.includes('content/meta-ai-cmdenter-main.js')) {
      failures.push('Meta AI Cmd+Enter injection must include content/meta-ai-cmdenter-main.js');
    }
    if (def.world !== 'MAIN') {
      failures.push('Meta AI Cmd+Enter injection must run in MAIN world');
    }
  }

  if (!quicknavDef) {
    failures.push('shared/injections.ts is missing quicknav_meta_ai');
  } else {
    const matches = normalizePatterns(quicknavDef.matches || []);
    const js = Array.isArray(quicknavDef.js) ? quicknavDef.js : [];
    for (const requiredMatch of ['https://www.meta.ai/prompt/*', 'https://meta.ai/prompt/*']) {
      if (!matches.includes(requiredMatch)) failures.push(`Meta AI QuickNav injection is missing match: ${requiredMatch}`);
    }
    if (!js.includes('content/meta-ai-quicknav.js')) {
      failures.push('Meta AI QuickNav injection must include content/meta-ai-quicknav.js');
    }
    if (quicknavDef.runAt !== 'document_end') {
      failures.push('Meta AI QuickNav injection must run at document_end');
    }
  }

  for (const required of [
    "id: 'meta_ai'",
    "name: 'Meta AI'",
    "quicknavPatterns: ['https://www.meta.ai/prompt/*', 'https://meta.ai/prompt/*']",
    "modules: ['quicknav', 'cmdenter_send']",
    "https://www.meta.ai/*",
    "https://meta.ai/*"
  ]) {
    if (!registrySource.includes(required)) {
      failures.push(`shared/registry.ts is missing Meta AI registry support: ${required}`);
    }
  }

  for (const required of [
    "host === 'www.meta.ai' || host === 'meta.ai'",
    'function getComposerScope',
    'function getPromptFrom',
    'function getSendButton',
    'function clickSendButton',
    'function hasSubmittedUserMessage',
    'function clearPrompt',
    'function scheduleClear',
    'function scheduleSend',
    'function handleShortcut',
    'textarea[placeholder*="Ask Meta AI" i]',
    'textarea[placeholder*="Describe an image or video" i]',
    '[role="textbox"]',
    'button[aria-label="Send"]',
    '[class*="group/user-message"]',
    "event.metaKey || event.ctrlKey",
    "on(window, 'keydown', handleShortcut, true)",
    "on(window, 'keyup', handleShortcut, true)"
  ]) {
    if (!metaCmdenterSource.includes(required)) {
      failures.push(`content/meta-ai-cmdenter-main.js is missing Meta AI Cmd+Enter support: ${required}`);
    }
  }

  for (const required of [
    "const QUICKNAV_SITE_ID = 'meta_ai'",
    "function getMetaAiConversationRoot",
    "function isMetaAiTurnElement",
    "function isMetaAiPlaceholderPreview",
    '[class*="group/user-message"]',
    '[data-testid="assistant-message"]',
    '.markdown-content .ur-markdown',
    'textarea[placeholder*="Ask Meta AI" i]',
    'button[aria-label="Send"]',
    "__quicknavMetaAiSendEventsBoundV1"
  ]) {
    if (!metaQuicknavSource.includes(required)) {
      failures.push(`content/meta-ai-quicknav.js is missing Meta AI QuickNav support: ${required}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyCleanupResourceHardening() {
  const failures = [];
  const quicknavFiles = [
    'content/chatgpt-quicknav.js',
    'content/deepseek-quicknav.js',
    'content/ernie-quicknav.js',
    'content/gemini-app-quicknav.js',
    'content/genspark-quicknav.js',
    'content/grok-quicknav.js',
    'content/kimi-quicknav.js',
    'content/meta-ai-quicknav.js',
    'content/qwen-quicknav.js',
    'content/zai-quicknav.js'
  ];
  const favoriteGcFiles = [
    'content/deepseek-quicknav.js',
    'content/ernie-quicknav.js',
    'content/genspark-quicknav.js',
    'content/grok-quicknav.js',
    'content/kimi-quicknav.js',
    'content/meta-ai-quicknav.js',
    'content/qwen-quicknav.js',
    'content/zai-quicknav.js'
  ];

  const dragSource = readText('content/ui-pos-drag.js');
  for (const required of [
    'function cleanup()',
    'return cleanup;',
    "target.removeEventListener(type, listener, eventOpts)",
    "const offDown = bind(dragHandle, 'mousedown', onMouseDown)",
    "const offMove = bind(document, 'mousemove', onMouseMove)",
    "const offUp = bind(document, 'mouseup', onMouseUp)"
  ]) {
    if (!dragSource.includes(required)) failures.push(`content/ui-pos-drag.js is missing drag listener cleanup: ${required}`);
  }

  for (const file of quicknavFiles) {
    const source = readText(file);
    if (!source.includes('const off = api.enableRightTopDrag(nav, header, opts || {})')) {
      failures.push(`${file} must retain and own the shared drag cleanup function`);
    }
    if (!source.includes("if (typeof off === 'function') nav._dragCleanup = off")) {
      failures.push(`${file} must store nav._dragCleanup from shared drag helper`);
    }
  }

  for (const file of quicknavFiles.filter((file) => file !== 'content/qwen-quicknav.js')) {
    const source = readText(file);
    if (!source.includes("if (typeof oldNav._dragCleanup === 'function') oldNav._dragCleanup()") && !source.includes("if (typeof panel._dragCleanup === 'function') panel._dragCleanup()")) {
      failures.push(`${file} must call drag cleanup before removing/replacing the QuickNav panel`);
    }
  }

  for (const file of favoriteGcFiles) {
    const source = readText(file);
    if (source.includes('runFavoritesGC(false, validKeys)')) {
      failures.push(`${file} must not run invalid-favorite GC without persisting the cleanup`);
    }
    if (!source.includes('const favRemoved = validKeys.size > 0 ? runFavoritesGC(true, validKeys) : 0')) {
      failures.push(`${file} must only persist invalid-favorite GC after a non-empty valid key set is available`);
    }
    if (!source.includes('const shouldRemoveInvalid = validKeys instanceof Set && validKeys.size > 0')) {
      failures.push(`${file} must guard invalid-favorite deletion against empty hydration lists`);
    }
  }

  const ernieSource = readText('content/ernie-quicknav.js');
  if (!ernieSource.includes('__quicknavErnieManualRouteWatcherV1')) {
    failures.push('content/ernie-quicknav.js must guard manual route watcher fallback against repeat history wrapping');
  }
  const zaiSource = readText('content/zai-quicknav.js');
  if (!zaiSource.includes('__quicknavZaiManualRouteWatcherV1')) {
    failures.push('content/zai-quicknav.js must guard manual route watcher fallback against repeat history wrapping');
  }

  const disposableContentFiles = [
    {
      file: 'content/genspark-credit-balance/main.js',
      required: ['disposeRuntime()', 'window.clearInterval(id)', 'target.removeEventListener(type, listener, options)', 'document.getElementById(id)?.remove?.()']
    },
    {
      file: 'content/genspark-moa-image-autosettings/main.js',
      required: ['disposeRuntime()', 'window.clearInterval(id)', "removeAttribute?.('data-aichat-genspark-moa-image-autosettings')"]
    },
    {
      file: 'content/genspark-codeblock-fold/main.js',
      required: ['disposeRuntime()', 'state.observer?.disconnect?.()', 'window.clearInterval(state.watchTimer)', 'state.fullScanTimer = 0', 'target.removeEventListener(type, listener, options)', 'pre.removeAttribute(ATTR_PROCESSED)', 'parent.insertBefore(wrap.firstChild, wrap)']
    },
    {
      file: 'content/genspark-force-sonnet45-thinking/main.js',
      required: ['disposeRuntime()', 'window.fetch = state.originalFetch', 'target.removeEventListener(type, listener, options)', 'document.getElementById(STYLE_ID)?.remove?.()']
    },
    {
      file: 'content/google-ask-gpt/main.js',
      required: ['disposeRuntime()', 'observer?.disconnect?.()', 'window.clearTimeout(ensureTimer)', 'target.removeEventListener(type, listener, options)', 'delete input.dataset.aichatGoogleAskBound']
    },
    {
      file: 'content/meta-ai-cmdenter-main.js',
      required: ['disposeRuntime()', 'target.removeEventListener(type, listener, options)', 'window.clearTimeout(id)']
    },
    {
      file: 'content/chatgpt-cmdenter-send/main.js',
      required: ['disposeRuntime()', 'target.removeEventListener(type, listener, options)', 'RUNTIME_STATE_KEY']
    },
    {
      file: 'content/qwen-thinking-toggle/main.js',
      required: ['disposeRuntime()', 'target.removeEventListener(type, listener, options)', 'chrome.storage.onChanged.removeListener(storageChangeHandler)', 'if (runtimeState.disposed) return']
    },
    {
      file: 'content/common-hide-disclaimer/main.js',
      required: ['hydrationTimer', 'readyHandler', "document.removeEventListener('DOMContentLoaded', prev.readyHandler, false)"]
    }
  ];

  for (const { file, required } of disposableContentFiles) {
    const source = readText(file);
    for (const needle of required) {
      if (!source.includes(needle)) {
        failures.push(`${file} is missing disposable cleanup guard: ${needle}`);
      }
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
    'resolveTopbarModelBadgeLabel',
    'topbarLastModelBadgeLabel',
    'topbarMenuSelectionBadgeUntil',
    'TOPBAR_MODEL_BADGE_SESSION_KEY',
    'readStoredTopbarBadgeLabel',
    'rememberTopbarModelSelectionFromEvent',
    'syncTopbarModelBadge',
    'syncTopbarModelBadgeButton',
    'handleTopbarModelBadgeToggle',
    'TOPBAR_MODEL_BADGE_EVENT',
    'gpt[-.]5[-.]3',
    'Instant',
    'Thinking',
    'Pro',
    'characterData: true'
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
  for (const required of [
    'PUBLIC_API_KEY',
    'TOPBAR_TOGGLE_EVENT',
    '__aichat_chatgpt_topbar_model_toggle_v2__',
    'STATE_KEY',
    'disposeRuntime',
    'addTrackedListener',
    'fetchConsumerUnsub',
    'MODEL_TOGGLE_LOCK_KEY',
    'acquireModelToggleLock',
    'waitForModelSwitcherTarget',
    'isModelSwitcherMenuOpen',
    'function setModelType(',
    'toggleModelType,',
    'setModelType,',
    'detectCurrentModelMode',
    'installTopbarToggleBridge',
    'data-value',
    '\\bthinking\\b',
    '\\bpro\\b'
  ]) {
    if (!thinkingToggleSource.includes(required)) {
      failures.push(`content/chatgpt-thinking-toggle/main.js is missing ${required}`);
    }
  }
  const setModelTypeMatch = thinkingToggleSource.match(/async function setModelType\([\s\S]*?\n  async function toggleModelType/);
  if (setModelTypeMatch && setModelTypeMatch[0].includes('clickLikeUser(trigger)')) {
    failures.push('content/chatgpt-thinking-toggle/main.js setModelType() still clicks the model selector trigger directly');
  }
  const guessModeMatch = thinkingToggleSource.match(/function guessModeFromEffort\([\s\S]*?\n  function isString/);
  if (guessModeMatch && /standard['"]\s*\|\|\s*e\s*===\s*['"]extended[\s\S]*return\s+['"]pro['"]/.test(guessModeMatch[0])) {
    failures.push('content/chatgpt-thinking-toggle/main.js still treats standalone standard/extended effort labels as Pro model mode');
  }
  if (source.includes('cursor: progress !important')) {
    failures.push('content/chatgpt-sidebar-header-fix/main.js topbar model badge still forces a progress cursor');
  }
  if (source.includes('}, 1200);') && source.includes('topbarModelToggleBusy = false')) {
    failures.push('content/chatgpt-sidebar-header-fix/main.js topbar model badge still keeps fixed 1200ms busy state');
  }
  if (!source.includes('function isTopbarModelFamilyLabel')) {
    failures.push('content/chatgpt-sidebar-header-fix/main.js is missing topbar model-family label filtering');
  }
  if (/\\b\\(standard\\|extended\\)\\(\\?:\\\\s\\+pro\\)\\?/.test(source)) {
    failures.push('content/chatgpt-sidebar-header-fix/main.js still maps standalone standard/extended labels to Pro');
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptBootstrapRouteEnsureHardening() {
  const source = readText('content/bootstrap.js');
  const failures = [];

  for (const required of ['hasQuicknavRuntimeBridge', 'hasBootstrapRuntimeReadyHint', 'allowStartupReadyHints', 'startupHandshakeConfirmed', 'startupHintPollTimer', 'armStartupHandshakeMonitor', 'Force ensure only when the shared runtime bridge is genuinely absent']) {
    if (!source.includes(required)) failures.push(`content/bootstrap.js is missing ${required}`);
  }
  if (source.includes('const force = !hasQuicknavUi();')) {
    failures.push('content/bootstrap.js still forces route reinjects based on hasQuicknavUi()');
  }
  if (!source.includes("scheduleEnsureRetry(false, 'bootstrap:retry1', 1200, { allowStartupReadyHints: true })")) {
    failures.push('content/bootstrap.js is missing startup-ready hint gating for bootstrap retry1');
  }
  if (!source.includes("scheduleEnsureRetry(false, 'bootstrap:retry2', 3200, { allowStartupReadyHints: true })")) {
    failures.push('content/bootstrap.js is missing startup-ready hint gating for bootstrap retry2');
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
    const cases = [
      {
        reason: 'reply_timer_should_skip_extended_pro_when_model_button_only_reports_chatgpt',
        input: { payloadModel: '', modelLabel: 'ChatGPT', composerModeLabel: 'Extended Pro' }
      },
      {
        reason: 'reply_timer_should_skip_standard_pro_when_model_button_only_reports_chatgpt',
        input: { payloadModel: '', modelLabel: 'ChatGPT', composerModeLabel: 'Standard Pro' }
      },
      {
        reason: 'reply_timer_should_skip_gpt54_pro_payload_model',
        input: { payloadModel: 'gpt-5.4-pro', modelLabel: '', composerModeLabel: 'Standard' }
      },
      {
        reason: 'reply_timer_should_skip_gpt54_pro_model_label',
        input: { payloadModel: '', modelLabel: 'GPT 5.4 Pro', composerModeLabel: 'Standard' }
      }
    ];
    for (const testCase of cases) {
      const shouldTrack = api.shouldTrackReplyTimer(testCase.input);
      if (shouldTrack !== false) return { ok: false, reason: testCase.reason };
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
  const registrySource = readText('shared/registry.ts');
  const failures = [];

  if (!/chatgpt_perf:\s*{[\s\S]*?defaultEnabled:\s*false[\s\S]*?}/.test(registrySource)) {
    failures.push('shared/registry.ts must keep chatgpt_perf disabled by default until the live ChatGPT perf path is revalidated');
  }

  for (const required of ['__aichat_chatgpt_core_v1__', 'getTurnsSnapshot', 'data-testid^="conversation-turn-"']) {
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
  if (!jsSource.includes('cleanupLegacyTurnMarks')) {
    failures.push('content/chatgpt-perf/content.js is missing legacy turn-mark cleanup');
  }
  if (!coreSource.includes('getChatScrollContainer')) {
    failures.push('content/chatgpt-core.js is missing shared chat scroll-container service');
  }
  if (!coreSource.includes('getVisibleTurnWindow')) {
    failures.push('content/chatgpt-core.js is missing shared visible-turn window service');
  }
  if (!coreSource.includes('getTurnRecordsSnapshot') || !coreSource.includes('onTurnRecordsChange')) {
    failures.push('content/chatgpt-core.js is missing shared turn-records service');
  }
  if (!jsSource.includes('ROOT_HOT_ATTR') || !jsSource.includes('syncTailTurnMetrics')) {
    failures.push('content/chatgpt-perf/content.js is missing active-tail hot-path coordination');
  }
  for (const required of ['SCAN_COMPOSER_INPUT_MS', 'isComposerInteractionTarget', "'composer-input'"]) {
    if (!jsSource.includes(required)) {
      failures.push(`content/chatgpt-perf/content.js is missing composer input scan throttle: ${required}`);
    }
  }
  if (!jsSource.includes('destructiveHeavyOptimizationsEnabled') || !jsSource.includes('EXPERIMENTAL_DOM_REWRITES_ENABLED = false')) {
    failures.push('content/chatgpt-perf/content.js is missing the destructive-optimization safety gate');
  }
  if (!quicknavSource.includes('getChatScrollContainer?.()')) {
    failures.push('content/chatgpt-quicknav.js is not reusing chatgpt-core scroll-container service');
  }
  if (!quicknavSource.includes('getVisibleTurnWindow')) {
    failures.push('content/chatgpt-quicknav.js is not using shared visible-turn window service');
  }
  if (!quicknavSource.includes('getTurnRecordsSnapshot')) {
    failures.push('content/chatgpt-quicknav.js is not using shared turn-records service');
  }
  if (!quicknavSource.includes('cgptperfHot')) {
    failures.push('content/chatgpt-quicknav.js is missing cgptperf hot-path throttling');
  }
  if (!scrollGuardSource.includes('getChatScrollContainer')) {
    failures.push('content/scroll-guard-main.js is not reusing chatgpt-core-main scroll-container service');
  }
  if (!scrollGuardSource.includes('readPerfHotFromDataset') || !scrollGuardSource.includes('isChatgptHeavyStreaming')) {
    failures.push('content/scroll-guard-main.js is missing perf hot-path / heavy-streaming coordination helpers');
  }
  if (scrollGuardSource.includes('if (readPerfHotFromDataset(ts)) return true;')) {
    failures.push('content/scroll-guard-main.js still disables scroll-lock whenever ChatGPT is perf-hot');
  }
  if (scrollGuardSource.includes('if (isChatgptHeavyStreaming()) return false;')) {
    failures.push('content/scroll-guard-main.js still bypasses scrollIntoView blocking during heavy ChatGPT streaming');
  }
  if (!scrollGuardSource.includes('shouldBypassNestedCodeScroll') || !scrollGuardSource.includes('shouldBypassCodeIntoView')) {
    failures.push('content/scroll-guard-main.js is missing nested code-block scroll bypass');
  }
  if (!quicknavSource.includes('isCodeBlockInteraction') || !quicknavSource.includes('syncScrollLockBaselineToCurrentPos(')) {
    failures.push('content/chatgpt-quicknav.js is missing code-block interaction baseline sync');
  }
  if (scrollGuardSource.includes('quicknavCodeIntentUntil')) {
    failures.push('content/scroll-guard-main.js is still treating code-block intent as a global scroll allow');
  }
  if (quicknavSource.includes('setScrollPos(sc, scrollLockStablePos)') || quicknavSource.includes('scrollLockRestoring')) {
    failures.push('content/chatgpt-quicknav.js still contains local scroll rebound execution');
  }
  const sidebarHeaderSource = readText('content/chatgpt-sidebar-header-fix/main.js');
  if (!sidebarHeaderSource.includes('topbarNeedsRepair')) {
    failures.push('content/chatgpt-sidebar-header-fix/main.js is missing topbar repair detection');
  }
  if (!cssSource.includes('data-testid^="conversation-turn-"')) {
    failures.push('content/chatgpt-perf/content.css is missing direct conversation-turn selectors');
  }

  for (const staleLiteral of [":scope > article", "tagName !== 'ARTICLE'", "querySelectorAll('main article')"]) {
    if (jsSource.includes(staleLiteral)) {
      failures.push(`content/chatgpt-perf/content.js still hard-codes ${staleLiteral}`);
    }
  }

  if (cssSource.includes('main article')) {
    failures.push('content/chatgpt-perf/content.css still hard-codes main article selectors');
  }
  for (const staleCost of ["scopeRoot?.getElementsByTagName?.('*')?.length", "document.getElementsByTagName('*').length", "turnEl.getElementsByTagName('*').length"]) {
    if (jsSource.includes(staleCost)) {
      failures.push(`content/chatgpt-perf/content.js still uses conversation-wide DOM counting via ${staleCost}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptQuicknavScrollLockReliability() {
  const quicknavSource = readText('content/chatgpt-quicknav.js');
  const scrollGuardSource = readText('content/scroll-guard-main.js');
  const failures = [];

  for (const required of [
    'function shouldRestoreScrollLockPosition',
    'function restoreScrollLockPosition',
    'function scheduleScrollLockRestore',
    'function markNavProgrammaticScroll',
    'function isExpectedNavProgrammaticPosition',
    'scrollLockNavIntentUntil',
    'scrollLockNavProgrammaticUntil',
    'scrollLockNavExpectedTop',
    'scrollLockLastExplicitUserScrollTs',
    'quicknavNavExpectedTop',
    'SCROLL_LOCK_NAV_TARGET_TOLERANCE',
    "scheduleScrollLockRestore('nav-allow-expired'",
    "scheduleScrollLockRestore('nav-unexpected-programmatic'",
    "scheduleScrollLockRestore('scroll-event'",
    "scheduleScrollLockRestore('mutation'",
    "scheduleScrollLockRestore(reason, [0, 40, 100, 220, 420, 800, 1500",
    "60000])",
    'postScrollLockBaselineToMainWorld(scrollLockStablePos, true)',
    'TAB_QUEUE_BRIDGE_SEND_PROTECT',
    'function armProgrammaticSendScrollLockGuard',
    'function handleTabQueueSendScrollProtect',
    'current > previousStable + SCROLL_LOCK_DRIFT'
  ]) {
    if (!quicknavSource.includes(required)) {
      failures.push(`content/chatgpt-quicknav.js is missing scroll-lock reliability guard: ${required}`);
    }
  }

  if (quicknavSource.includes('postScrollLockBaselineToMainWorld(getScrollPos(scroller), true)')) {
    failures.push('content/chatgpt-quicknav.js must not promote the current mutation-time scroll position to the locked baseline');
  }
  if (!quicknavSource.includes('cancelScrollLockRestoreSchedule()')) {
    failures.push('content/chatgpt-quicknav.js must cancel pending scroll-lock restore timers on route cleanup/disable');
  }
  if (!quicknavSource.includes('isNavAllowScroll() && (!hasActiveNavExpectedTop(now) || isExpectedNavProgrammaticPosition(current, now))') || !quicknavSource.includes('hasRecentCodeBlockIntent(now)')) {
    failures.push('content/chatgpt-quicknav.js scroll-lock restore must keep nav and code-block scroll intents allowed');
  }
  for (const required of [
    'const GUARD_VERSION = 11',
    'function getCoreChatScroller',
    'function readNavExpectedFromDataset',
    'function isExpectedAllowedTarget',
    'isAllowed(ts, targetTop)',
    'quicknavNavExpectedUntil'
  ]) {
    if (!scrollGuardSource.includes(required)) {
      failures.push(`content/scroll-guard-main.js is missing target-aware nav allow guard: ${required}`);
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

  for (const required of ['isExtensionOwnedTurnCandidate', 'clearSyntheticTurnMarkers', 'cacheBaseIndex.length', "TURN_SELECTOR = null", 'bindCoreTurnsWatcher', 'core.onTurnsChange', '__cgptCoreTurnsUnsub', 'armRouteRecovery', 'armEmptyHydrationWatch', 'getRawConversationTurnCount', 'getQuicknavEmptyLabel', 'shouldCacheTurnSelector', 'currentRouteEnteredAt = Date.now()', 'lastRenderedRouteKey', 'refresh-route-drift', 'getTurnAppendMarker', 'pendingPreviousRouteTurnMarkers', 'cachedTurnAppendMarkers', 'matchesPendingPreviousRouteTurns', '检测中…', 'installSecondaryRoutePoll', 'scopeOn(runtimeScope, window, \'popstate\', detectUrlChange)', 'scopeOn(runtimeScope, window, \'hashchange\', detectUrlChange)', 'liveTurns.length > turns.length', 'document.querySelectorAll(CHATGPT_TURN_HOST_SELECTOR)']) {
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
  if (!quicknavSource.includes('scheduleEnsure(16)')) {
    failures.push('content/chatgpt-quicknav.js is missing fast body-wipe nav self-heal');
  }
  if (!quicknavSource.includes('chatgpt_quicknav_hide_native_outline') || !quicknavSource.includes('installNativeOutlineVisibilityWatcher') || !quicknavSource.includes('syncNativeOutlineVisibility') || !quicknavSource.includes('findNativeOutlineRootFromElement') || !quicknavSource.includes('scheduleNativeOutlineVisibilityBurst')) {
    failures.push('content/chatgpt-quicknav.js is missing ChatGPT native outline hide rollout');
  }
  if (!quicknavSource.includes('h-[2px]') || !quicknavSource.includes('w-[18px]') || !quicknavSource.includes('NATIVE_OUTLINE_HIDDEN_ATTR') || !quicknavSource.includes('NATIVE_OUTLINE_HIDE_ENABLED_ATTR') || !quicknavSource.includes('ensureNativeOutlineHideStyle')) {
    failures.push('content/chatgpt-quicknav.js is missing native outline button/root heuristics');
  }
  if (!quicknavSource.includes('armStableInitialMount') || !quicknavSource.includes('INITIAL_BODY_QUIET_MS')) {
    failures.push('content/chatgpt-quicknav.js is missing startup body-stability mount barrier');
  }
  if (!quicknavSource.includes('isPlaceholderPreview') || !quicknavSource.includes('hasPlaceholderPreviews') || !quicknavSource.includes('readFreshTurnPreview')) {
    failures.push('content/chatgpt-quicknav.js is missing stale placeholder preview recovery');
  }
  if (!quicknavSource.includes('forceTurnRecordRefresh') || !quicknavSource.includes('!!force || hasCachedPlaceholders') || !quicknavSource.includes('!deferForceRecords')) {
    failures.push('content/chatgpt-quicknav.js must force turn-record refresh while placeholder previews are visible unless perf pressure defers it');
  }
  if (!quicknavSource.includes('getDirectConversationTurns') || !quicknavSource.includes('useDirectTurns') || !quicknavSource.includes('directTurns.length > Math.max')) {
    failures.push('content/chatgpt-quicknav.js is missing real-DOM override when core turn-record snapshots lag behind');
  }
  if (!quicknavSource.includes('armInitialIndexCatchup') || !quicknavSource.includes('stopInitialIndexCatchup') || !quicknavSource.includes('rawCount > (Array.isArray(cacheBaseIndex)')) {
    failures.push('content/chatgpt-quicknav.js is missing initial/reload catchup when turns exist but the QuickNav index is empty or short');
  }
  if (!quicknavSource.includes('renderedHasPlaceholder') || !quicknavSource.includes("list.querySelectorAll('.compact-text, .pin-label')")) {
    failures.push('content/chatgpt-quicknav.js must full-rebuild rendered placeholder rows instead of only tail-patching');
  }
  if (
      !quicknavSource.includes('function schedulePinStateRefresh') ||
      !quicknavSource.includes('scheduleRefresh(ui, { delay: 0, force: true, soft: false })') ||
      !quicknavSource.includes('function pruneStoredFavorites') ||
      !quicknavSource.includes('window.localStorage.setItem(getFavKeys(), JSON.stringify(obj))') ||
      !quicknavSource.includes('runFavoritesGC(true, validKeys)') ||
      quicknavSource.includes('runFavoritesGC(false, validKeys)')
    ) {
      failures.push('content/chatgpt-quicknav.js must force-refresh pin state changes and persist invalid-favorite GC');
    }
  const coreSource = readText('content/chatgpt-core.js');
  if (!coreSource.includes('isPlaceholderPreview') || !coreSource.includes('hasPlaceholder')) {
    failures.push('content/chatgpt-core.js is missing placeholder preview cache invalidation');
  }
  if (!coreSource.includes('forcePreview') || !coreSource.includes('turns.length - 2')) {
    failures.push('content/chatgpt-core.js must refresh tail previews after streaming instead of reusing partial preview cache');
  }
  if (!quicknavSource.includes('shouldFreshTail') || !quicknavSource.includes('TAIL_RECALC_TURNS')) {
    failures.push('content/chatgpt-quicknav.js must reread tail previews from DOM so streaming partial text is finalized');
  }
  if (!coreSource.includes('API_VERSION = 11') || !coreSource.includes('isLikelyConversationTurnElement') || !coreSource.includes('!isLikelyConversationTurnElement(turn)')) {
    failures.push('content/chatgpt-core.js must reject empty ChatGPT conversation-turn shells and bump the core API version');
  }
  if (
    !quicknavSource.includes('const direct = getDirectConversationTurns().length') ||
    !quicknavSource.includes('return isLikelyConversationTurnNode(el)') ||
    !quicknavSource.includes('return !isPlaceholderPreview(text)')
  ) {
    failures.push('content/chatgpt-quicknav.js must reject empty ChatGPT conversation-turn shells before counting or indexing turns');
  }
  if (
    !quicknavSource.includes('HYDRATION_INDEX_KEY_PREFIX') ||
    !quicknavSource.includes('saveHydrationIndex(base)') ||
    !quicknavSource.includes('loadHydrationIndex()') ||
    !quicknavSource.includes('data-hydration-cache') ||
    !quicknavSource.includes('wasHydrationCacheActive') ||
    !quicknavSource.includes('liveStillShort') ||
    !quicknavSource.includes('liveHasPlaceholders') ||
    !quicknavSource.includes('mergeHydrationPreviewFallback') ||
    !quicknavSource.includes('mergeCachedPlaceholderPreviewFallback') ||
    !quicknavSource.includes('findRecordTurnElement') ||
    !quicknavSource.includes('conversation-turn-${n + 1}') ||
    !quicknavSource.includes("String(row.dataset?.msgId || '') !== String(next[i].msgId || '')")
  ) {
    failures.push('content/chatgpt-quicknav.js is missing reload hydration cache support for slow ChatGPT route hydration');
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptComposerWorkflowHardening() {
  const injectionsSource = readText('shared/injections.ts');
  const tabQueueSource = readText('content/chatgpt-tab-queue/main.js');
  const imageEditSource = readText('content/chatgpt-image-message-edit/main.js');
  const failures = [];

  for (const required of [
    'quicknav_chatgpt_tab_queue',
    'quicknav_chatgpt_image_message_edit',
    '...CHATGPT_CORE_MAIN_FILES',
    'content/chatgpt-tab-queue/main.js',
    'content/chatgpt-image-message-edit/main.js'
  ]) {
    if (!injectionsSource.includes(required)) {
      failures.push(`shared/injections.ts is missing composer workflow injection guard ${required}`);
    }
  }

  for (const required of [
    '__aichat_chatgpt_core_main_v1__',
    'getEditorEl',
    'getComposerForm',
    'findSendButton',
    'clickSendButton',
    'onTurnsChange',
    'onRouteChange',
    'getHotkeyAction',
    'resolveComposerEditorFromTarget',
    'isLikelyComposerSendButton',
    'hasLikelyComposerAttachments',
    'isComposerSyncedTo',
    'syncComposerMirrorValue',
    'readComposerTextForInputCache',
    'shouldUseFullComposerInputPath',
    'shouldUseFullComposerInputPathForState',
    'if (!shouldUseFullComposerInputPathForState())',
    'if (!action && !interlockActive) return',
    'if (!interlockActive) return',
    'queuePreviewMaxItems: 10',
    'restoreLatestQueuedDraftFromPreview',
    'clearQueuedDrafts',
    'clearPreviewContents',
    'aichatTabQueueToolbar',
    'aichatTabQueueRestoreLatest',
    'aichatTabQueueClearAll',
    'aichatTabQueueMore',
    'BRIDGE_TAB_QUEUE_SEND_PROTECT',
    'function dispatchBridgeMessageSync',
    'function postQueuedSendProtectBridge',
    "postQueuedSendProtectBridge(item, 'queued'",
    "postQueuedSendProtectBridge(head, 'prepare'",
    "postQueuedSendProtectBridge(head, 'before-click'",
    "postQueuedSendProtectBridge(head, 'confirmed'"
  ]) {
    if (!tabQueueSource.includes(required)) {
      failures.push(`content/chatgpt-tab-queue/main.js is missing ${required}`);
    }
  }

  const popupSource = readText('popup/popup.js');
  const popupHtmlSource = readText('popup/popup.html');
  const popupCssSource = readText('popup/popup.css');
  for (const required of [
    'exportDiagnostics',
    'collectActivePageDiagnostics',
    'AISHORTCUTS_DIAG_GET_DUMP',
    'executePageDiagnosticScript',
    'rawConversationText: false',
    'rawComposerText: false',
    'chrome.scripting.executeScript',
    'summarizeSettingsForDiagnostics'
  ]) {
    if (!popupSource.includes(required)) {
      failures.push(`popup/popup.js is missing diagnostics support ${required}`);
    }
  }
  if (!popupHtmlSource.includes('id="exportDiagnostics"')) {
    failures.push('popup/popup.html is missing the diagnostics export button');
  }
  if (!popupCssSource.includes('.btnDiagnostics')) {
    failures.push('popup/popup.css is missing diagnostics button styling');
  }

  for (const required of [
    '__aichat_chatgpt_core_main_v1__',
    'getTurnsSnapshot',
    'getVisibleTurnWindow',
    'getComposerForm',
    'clickSendButton',
    'clickStopButton',
    'installPayloadRewriter',
    'registerConsumer',
    'onConversationPayload',
    'parent_message_id',
    'installSendIntentCapture',
    'button[data-aichat-img-edit="1"]',
    'shouldUseWindowedEditButtons'
  ]) {
    if (!imageEditSource.includes(required)) {
      failures.push(`content/chatgpt-image-message-edit/main.js is missing ${required}`);
    }
  }

  if (!imageEditSource.includes('EDIT_BUTTON_VISIBLE_MARGIN_PX') || !imageEditSource.includes('EDIT_BUTTON_RECENT_USER_TURNS')) {
    failures.push('content/chatgpt-image-message-edit/main.js is missing bounded edit-button scan constants');
  }
  if (tabQueueSource.includes("document.querySelector('.ProseMirror") || tabQueueSource.includes('document.querySelector("#prompt-textarea')) {
    failures.push('content/chatgpt-tab-queue/main.js should go through chatgpt-core for composer discovery instead of local composer selectors');
  }

  const tabQueuePath = path.join(ROOT, 'content/chatgpt-tab-queue/main.js');
  let tabQueue = null;
  try {
    delete require.cache[require.resolve(tabQueuePath)];
    tabQueue = require(tabQueuePath);
  } catch (error) {
    failures.push(`failed to load content/chatgpt-tab-queue/main.js for input fast-path tests: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!tabQueue || typeof tabQueue.shouldUseFullComposerInputPath !== 'function') {
    failures.push('content/chatgpt-tab-queue/main.js must export shouldUseFullComposerInputPath');
  } else {
    const fullPath = tabQueue.shouldUseFullComposerInputPath;
    if (fullPath({ queueLength: 0 })) {
      failures.push('empty idle composer input should stay on the light input path');
    }
    if (!fullPath({ queueLength: 1 })) {
      failures.push('queued composer input should use the full input path');
    }
    if (fullPath({ queueLength: 0, previewRepairActive: true })) {
      failures.push('empty preview repair timer should not force normal typing onto the full input path');
    }
    if (!fullPath({ hasPendingSendGate: true })) {
      failures.push('pending send gate should keep the full input path active');
    }
    if (!fullPath({ restoredQueuedDraftActive: true })) {
      failures.push('restored queued drafts should keep the full input path active');
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptTreeExportHardening() {
  const injectionsSource = readText('shared/injections.ts');
  const treeSource = readText('content/chatgpt-message-tree/main.js');
  const exportSource = readText('content/chatgpt-export-conversation/main.js');
  const graphSource = readText('content/chatgpt-conversation-graph.js');
  const mappingClientSource = readText('content/chatgpt-mapping-client/main.js');
  const registrySource = readText('shared/registry.ts');
  const failures = [];

  for (const required of [
    'quicknav_chatgpt_message_tree',
    'quicknav_chatgpt_export_conversation',
    'CHATGPT_CONVERSATION_GRAPH_FILE',
    'CHATGPT_MAPPING_CLIENT_FILE',
    'content/chatgpt-message-tree/main.js',
    'content/chatgpt-export-conversation/main.js'
  ]) {
    if (!injectionsSource.includes(required)) {
      failures.push(`shared/injections.ts is missing tree/export injection guard ${required}`);
    }
  }
  if (!/chatgpt_message_tree:\s*{[\s\S]*?defaultEnabled:\s*false[\s\S]*?}/.test(registrySource)) {
    failures.push('shared/registry.ts must keep chatgpt_message_tree explicitly default-disabled because it is an on-demand heavy mapping panel');
  }

  for (const required of [
    '__aichat_chatgpt_core_main_v1__',
    '__aichat_chatgpt_mapping_client_v1__',
    '__aichat_chatgpt_conversation_graph_v1__',
    'fetchConversationMapping',
    'createDisplayGraph',
    'getChatScrollContainer',
    'scrollToMessageId',
    'ensureNodePathVisible',
    'resolveVisibleCurrentNodeId',
    'getVisibleMessageIds',
    'installBranchSwitcherWatcher',
    'onTurnsChange',
    'onRouteChange',
    'MAX_MAPPING_JSON_BYTES'
  ]) {
    if (!treeSource.includes(required)) {
      failures.push(`content/chatgpt-message-tree/main.js is missing ${required}`);
    }
  }

  for (const required of [
    '__aichat_chatgpt_core_v1__',
    '__aichat_chatgpt_mapping_client_v1__',
    '__aichat_chatgpt_conversation_graph_v1__',
    'fetchConversationMapping',
    'resolveVisibleCurrentNodeId',
    'getVisibleMessageIds',
    'getTurnArticles',
    'sanitizeExportHtmlFromElement',
    'exportDomAsMarkdown',
    'exportDomAsHtml',
    'buildBranchExportPayload',
    'registerCommands',
    'MAX_TREE_JSON_BYTES'
  ]) {
    if (!exportSource.includes(required)) {
      failures.push(`content/chatgpt-export-conversation/main.js is missing ${required}`);
    }
  }

  for (const required of [
    'resolveVisibleCurrentNodeId',
    'createDisplayGraph',
    'getCurrentBranchNodeIds',
    'buildNodeVisitOrder',
    'computeDepthByParent'
  ]) {
    if (!graphSource.includes(required)) {
      failures.push(`content/chatgpt-conversation-graph.js is missing ${required}`);
    }
  }
  for (const required of ['fetchConversationMapping', 'getAuthContext', 'maxJsonBytes', 'readJsonWithLimit']) {
    if (!mappingClientSource.includes(required)) {
      failures.push(`content/chatgpt-mapping-client/main.js is missing ${required}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptUsageMonitorHardening() {
  const injectionsSource = readText('shared/injections.ts');
  const mainSource = readText('content/chatgpt-usage-monitor/main.js');
  const optionsSource = readText('options/options.js');
  const bridgeSource = readText('content/chatgpt-usage-monitor/bridge.js');
  const failures = [];

  for (const required of [
    'quicknav_chatgpt_usage_monitor_bridge',
    'quicknav_chatgpt_usage_monitor',
    'content/chatgpt-usage-monitor/bridge.js',
    'content/chatgpt-usage-monitor/main.js',
    '...CHATGPT_CORE_MAIN_FILES',
    '...CHATGPT_FETCH_HUB_CONSUMER_FILES'
  ]) {
    if (!injectionsSource.includes(required)) {
      failures.push(`shared/injections.ts is missing usage monitor injection guard ${required}`);
    }
  }

  for (const required of [
    'IN_PAGE_MONITOR_UI_ENABLED = false',
    '__aichat_chatgpt_usage_monitor_v1__',
    '__aichat_chatgpt_usage_monitor_fetch_patch_v1__',
    '__aichat_chatgpt_fetch_consumer_base_v1__',
    '__aichat_chatgpt_fetch_hub_v1__',
    'registerConsumer',
    'chatgpt-usage-monitor',
    'onConversationStart',
    '__aichatResolveUsageModelKey',
    'getUsageModelKeyFromCookieOrBody',
    'recordModelUsageByModelId',
    '__aichatShouldSkipUsageCounting',
    'research',
    '__aichatDisposeUsageMonitorRuntime',
    'scopeOn(__aichatRuntimeScope',
    'core.onRouteChange'
  ]) {
    if (!mainSource.includes(required)) {
      failures.push(`content/chatgpt-usage-monitor/main.js is missing ${required}`);
    }
  }

  for (const required of [
    '__aichat_chatgpt_usage_monitor_bridge_state_v2__',
    'chrome.storage.onChanged.addListener',
    'cgpt_usage_monitor_plan_type_v1',
    '__aichat_gm_chatgpt_usage_monitor__:usageData',
    '__aichat_gm_chatgpt_usage_monitor__:planType',
    'chatgpt-usage-monitor:data-changed',
    'chrome.storage.local.set',
    'chrome.storage.local.get',
    'core.onRouteChange',
    'disposeBridge'
  ]) {
    if (!bridgeSource.includes(required)) {
      failures.push(`content/chatgpt-usage-monitor/bridge.js is missing ${required}`);
    }
  }

  if (mainSource.includes('IN_PAGE_MONITOR_UI_ENABLED = true')) {
    failures.push('content/chatgpt-usage-monitor/main.js must remain headless on chatgpt.com unless the UI is revalidated');
  }
  for (const [label, source] of [
    ['content/chatgpt-usage-monitor/main.js', mainSource],
    ['options/options.js', optionsSource]
  ]) {
    for (const required of [
      'gpt-5-5-pro',
      'gpt-5-5-thinking',
      'gpt-5.5-pro',
      'gpt-5.5-thinking',
      'DEPRECATED_USAGE_MODEL_KEYS'
    ]) {
      if (!source.includes(required)) {
        failures.push(`${label} is missing GPT 5.5 usage monitor mapping ${required}`);
      }
    }
  }
  if (!mainSource.includes('"gpt-5-pro": "gpt-5-5-pro"') || !mainSource.includes('"gpt-5-thinking": "gpt-5-5-thinking"')) {
    failures.push('content/chatgpt-usage-monitor/main.js does not alias generic GPT 5 Pro/Thinking to GPT 5.5');
  }
  if (!optionsSource.includes("'gpt-5-pro': 'gpt-5-5-pro'") || !optionsSource.includes("'gpt-5-thinking': 'gpt-5-5-thinking'")) {
    failures.push('options/options.js does not alias generic GPT 5 Pro/Thinking to GPT 5.5');
  }
  for (const [label, source] of [
    ['content/chatgpt-usage-monitor/main.js', mainSource],
    ['options/options.js', optionsSource]
  ]) {
    if (
      source.includes('"gpt-5-t-mini": {') ||
      source.includes("'gpt-5-t-mini': {") ||
      source.includes('"gpt-5-t-mini": "gpt-5-t-mini"') ||
      source.includes("'gpt-5-t-mini': 'gpt-5-t-mini'") ||
      source.includes('"gpt-5-t-mini",') ||
      source.includes("'gpt-5-t-mini',")
    ) {
      failures.push(`${label} still exposes GPT 5 Thinking Mini as an active usage model`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyChatgptSmallFeatureHardening(runtimeDefs) {
  const injectionsSource = readText('shared/injections.ts');
  const cmdenterSource = readText('content/chatgpt-cmdenter-send/main.js');
  const thinkingToggleSource = readText('content/chatgpt-thinking-toggle/main.js');
  const quickDeepSearchSource = readText('content/chatgpt-quick-deep-search/main.js');
  const quickDeepSearchConfigSource = readText('content/chatgpt-quick-deep-search/config-bridge.js');
  const replyTimerSource = readText('content/chatgpt-reply-timer/main.js');
  const sidebarHeaderSource = readText('content/chatgpt-sidebar-header-fix/main.js');
  const readaloudSource = readText('content/chatgpt-readaloud-speed-controller/main.js');
  const downloadFileFixSource = readText('content/chatgpt-download-file-fix/main.js');
  const texCopyQuoteConfigSource = readText('content/chatgpt-tex-copy-quote/config-bridge.js');
  const texCopyQuoteSource = readText('content/chatgpt-tex-copy-quote/main.js');
  const storageSource = readText('background/sw/storage.ts');
  const hideFeedbackSource = readText('content/chatgpt-hide-feedback-buttons/main.js');
  const strongHighlightSource = readText('content/chatgpt-strong-highlight-lite/main.js');
  const canvasEnhancementsSource = readText('content/chatgpt-canvas-enhancements/main.js');
  const optionsSource = readText('options/options.js');
  const i18nSource = readText('shared/i18n.js');
  const inventorySource = readText('docs/scripts-inventory.md');
  const failures = [];

  const defs = Array.isArray(runtimeDefs) ? runtimeDefs : [];
  const byId = new Map(defs.map((def) => [String(def?.id || ''), def]));
  const expectDef = (id, { world = '', js = [], css = [] } = {}) => {
    const def = byId.get(id);
    if (!def) {
      failures.push(`CONTENT_SCRIPT_DEFS is missing ${id}`);
      return;
    }
    const defWorld = String(def.world || '').toUpperCase();
    if (world && defWorld !== String(world).toUpperCase()) {
      failures.push(`${id} must run in ${world}, actual ${defWorld || 'ISOLATED'}`);
    }
    const defJs = Array.isArray(def.js) ? def.js : [];
    for (const relPath of js) {
      if (!defJs.includes(relPath)) failures.push(`${id} is missing JS dependency ${relPath}`);
    }
    const defCss = Array.isArray(def.css) ? def.css : [];
    for (const relPath of css) {
      if (!defCss.includes(relPath)) failures.push(`${id} is missing CSS dependency ${relPath}`);
    }
  };

  for (const required of [
    'quicknav_chatgpt_cmdenter_send',
    'quicknav_chatgpt_sidebar_header_fix',
    'quicknav_chatgpt_readaloud_speed_controller',
    'quicknav_chatgpt_reply_timer',
    'quicknav_chatgpt_download_file_fix',
    'quicknav_chatgpt_strong_highlight_lite',
    'quicknav_chatgpt_quick_deep_search_config',
    'quicknav_chatgpt_quick_deep_search',
    'quicknav_chatgpt_hide_feedback_buttons',
    'quicknav_chatgpt_tex_copy_quote_config',
    'quicknav_chatgpt_tex_copy_quote',
    'quicknav_chatgpt_canvas_enhancements'
  ]) {
    if (!injectionsSource.includes(required)) {
      failures.push(`shared/injections.ts is missing small-feature injection guard ${required}`);
    }
  }

  expectDef('quicknav_chatgpt_cmdenter_send', {
    js: ['content/chatgpt-dom-adapter.js', 'content/chatgpt-core.js', 'content/chatgpt-cmdenter-send/main.js']
  });
  expectDef('quicknav_chatgpt_sidebar_header_fix', {
    js: ['content/chatgpt-dom-adapter.js', 'content/chatgpt-core.js', 'content/chatgpt-sidebar-header-fix/main.js']
  });
  expectDef('quicknav_chatgpt_readaloud_speed_controller', {
    js: ['content/chatgpt-dom-adapter.js', 'content/chatgpt-core.js', 'content/chatgpt-readaloud-speed-controller/main.js']
  });
  expectDef('quicknav_chatgpt_reply_timer', {
    world: 'MAIN',
    js: [
      'content/chatgpt-dom-adapter.js',
      'content/chatgpt-core-main.js',
      'content/chatgpt-fetch-hub/main.js',
      'content/chatgpt-fetch-hub/consumer-base.js',
      'content/chatgpt-reply-timer/main.js'
    ]
  });
  expectDef('quicknav_chatgpt_download_file_fix', {
    world: 'MAIN',
    js: [
      'content/chatgpt-dom-adapter.js',
      'content/chatgpt-core-main.js',
      'content/chatgpt-fetch-hub/main.js',
      'content/chatgpt-fetch-hub/consumer-base.js',
      'content/chatgpt-download-file-fix/main.js'
    ]
  });
  expectDef('quicknav_chatgpt_quick_deep_search', {
    world: 'MAIN',
    js: [
      'content/chatgpt-dom-adapter.js',
      'content/chatgpt-core-main.js',
      'content/chatgpt-quick-deep-search/main.js'
    ]
  });
  expectDef('quicknav_chatgpt_tex_copy_quote', {
    world: 'MAIN',
    js: ['content/chatgpt-dom-adapter.js', 'content/chatgpt-core-main.js', 'content/chatgpt-tex-copy-quote/main.js']
  });
  expectDef('quicknav_chatgpt_tex_copy_quote_config', {
    js: ['content/chatgpt-dom-adapter.js', 'content/chatgpt-core.js', 'content/chatgpt-tex-copy-quote/config-bridge.js']
  });
  expectDef('quicknav_chatgpt_canvas_enhancements', {
    world: 'MAIN',
    js: [
      'content/chatgpt-dom-adapter.js',
      'content/chatgpt-core-main.js',
      'content/chatgpt-mapping-client/main.js',
      'content/chatgpt-canvas-enhancements/main.js'
    ]
  });

  for (const required of [
    '__aichat_chatgpt_core_v1__',
    'getChatGPTPromptElementFrom',
    'core.getEditorEl',
    'core.getComposerForm',
    'isStopButton',
    'getChatgptSendButtonNear',
    'clickSendButtonForSite',
    'core.clickSendButton',
    'lastShortcutSendAt',
    'function handleKeyUp',
    "runtimeOn(window, 'keyup', handleKeyUp, true)",
    'hasChatgptAttachmentPreview',
    'canSendWithoutTextForSite',
    'sendMessageForTest'
  ]) {
    if (!cmdenterSource.includes(required)) {
      failures.push(`content/chatgpt-cmdenter-send/main.js is missing ${required}`);
    }
  }
  for (const stale of ['conversation-turns', 'main article']) {
    if (cmdenterSource.includes(stale)) {
      failures.push(`content/chatgpt-cmdenter-send/main.js still contains stale ChatGPT selector ${stale}`);
    }
  }
  if (
    !cmdenterSource.includes("if (SITE !== 'kimi' && SITE !== 'ernie') return;") ||
    !cmdenterSource.includes('dispatchUserClick(button)')
  ) {
    failures.push('content/chatgpt-cmdenter-send/main.js is missing Kimi/Ernie keyup and Kimi click hardening');
  }

  for (const required of [
    '__aichat_chatgpt_core_main_v1__',
    '__aichat_chatgpt_fetch_consumer_base_v1__',
    '__aichat_chatgpt_fetch_hub_v1__',
    'DS_SEND_LIGHT_PRO_KEY',
    'DS_SEND_MAX_PRO_KEY',
    'readBoolDataset',
    'isComposerEventContext',
    'core.clickSendButton',
    'core.findSendButton',
    'core.isGenerating',
    'PUBLIC_API_KEY',
    'TOPBAR_TOGGLE_EVENT',
    'installTopbarToggleBridge'
  ]) {
    if (!thinkingToggleSource.includes(required)) {
      failures.push(`content/chatgpt-thinking-toggle/main.js is missing ${required}`);
    }
  }

  for (const required of [
    'DS_HOTKEYS_KEY',
    'DS_SEARCH_HOTKEY_KEY',
    'DS_SEARCH_PROMPT_KEY',
    'DEFAULT_SEARCH_HOTKEY',
    'DEFAULT_SEARCH_PROMPT',
    'areHotkeysEnabled',
    'getConfiguredSearchHotkey',
    'getConfiguredSearchPrompt',
    'buildFinalSearchText',
    '__aichat_chatgpt_core_main_v1__',
    'removeLegacyQdsButtons',
    'findSendButton',
    'isStopButton',
    'editorEl',
    'disposeRuntime',
    'clickSendButton',
    ".replace(/\\s+/g, ' ')"
  ]) {
    if (!quickDeepSearchSource.includes(required)) {
      failures.push(`content/chatgpt-quick-deep-search/main.js is missing ${required}`);
    }
  }
  for (const required of [
    'DS_SEARCH_HOTKEY_KEY',
    'DS_SEARCH_PROMPT_KEY',
    'DEFAULT_SEARCH_HOTKEY',
    'DEFAULT_SEARCH_PROMPT',
    'chatgpt_quick_deep_search_search_hotkey',
    'chatgpt_quick_deep_search_search_prompt',
    'normalizeSearchHotkey',
    'writeStringDataset',
    'data-aichat-quick-deep-search-search-hotkey',
    'data-aichat-quick-deep-search-search-prompt'
  ]) {
    if (!quickDeepSearchConfigSource.includes(required)) {
      failures.push(`content/chatgpt-quick-deep-search/config-bridge.js is missing configurable QDS support: ${required}`);
    }
  }
  for (const required of [
    'EXTRA_SITE_MODULE_STRING_SETTINGS',
    "chatgpt_quick_deep_search_search_hotkey: 'S'",
    "chatgpt_quick_deep_search_search_prompt: 'ultra think and deeper websearch\\n\\n'"
  ]) {
    if (!injectionsSource.includes(required)) {
      failures.push(`shared/injections.ts is missing QDS string default support: ${required}`);
    }
  }
  for (const required of [
    'QDS_DEFAULT_SEARCH_HOTKEY',
    'QDS_DEFAULT_SEARCH_PROMPT',
    'getSiteModuleStringSetting',
    'normalizeQdsSearchHotkey',
    '搜索快捷键字母',
    '搜索时插入的文本',
    'chatgpt_quick_deep_search_search_hotkey = value',
    'chatgpt_quick_deep_search_search_prompt = value',
    '自定义文本中可写 {input}'
  ]) {
    if (!optionsSource.includes(required)) {
      failures.push(`options/options.js is missing configurable QDS settings UI: ${required}`);
    }
  }
  for (const required of [
    'typeof rawMods[modId] === typeof defaultValue',
    'typeof rawMods[legacyId] === typeof defaultValue',
    'typeof rawMods[modId] !== typeof expectedMods[modId]',
    'typeof op.value === typeof expected'
  ]) {
    if (!storageSource.includes(required)) {
      failures.push(`background/sw/storage.ts is missing string site-module settings support: ${required}`);
    }
  }
  for (const stale of ['payload.model', 'payload.thinking_effort', 'pendingModelSwitch', '强制使用 gpt-5', 'force this one send to use gpt-5']) {
    if (quickDeepSearchSource.includes(stale)) {
      failures.push(`content/chatgpt-quick-deep-search/main.js must not force ChatGPT model payloads (${stale})`);
    }
  }
  for (const [relPath, source] of [
    ['shared/i18n.js', i18nSource],
    ['options/options.js', optionsSource],
    ['docs/scripts-inventory.md', inventorySource]
  ]) {
    for (const stale of ['强制使用 gpt-5', 'force this one send to use gpt-5']) {
      if (source.includes(stale)) {
        failures.push(`${relPath} still describes quick deep search as forcing stale gpt-5 (${stale})`);
      }
    }
  }
  if (thinkingToggleSource.includes("const LIGHT_PRO_MODEL_FALLBACK = 'gpt-5-4-pro'")) {
    failures.push('content/chatgpt-thinking-toggle/main.js must not hardcode gpt-5-4-pro as a Pro-send fallback');
  }
  for (const staleId of ['o4-mini-button', 'o4-think-button', 'o4-translate-inline-btn']) {
    if (!quickDeepSearchSource.includes(staleId)) {
      failures.push(`content/chatgpt-quick-deep-search/main.js no longer cleans legacy button ${staleId}`);
    }
  }

  for (const required of [
    '__aichat_chatgpt_core_main_v1__',
    '__aichat_chatgpt_fetch_consumer_base_v1__',
    '__aichat_chatgpt_fetch_hub_v1__',
    'shouldTrackReplyTimer',
    'isSteerTurnUrl',
    'readCurrentModelLabel',
    'readComposerModeLabel',
    'core.isGenerating',
    'core.onRouteChange',
    'ensureGeneratingObserver'
  ]) {
    if (!replyTimerSource.includes(required)) {
      failures.push(`content/chatgpt-reply-timer/main.js is missing ${required}`);
    }
  }

  for (const required of [
    '__aichat_chatgpt_core_v1__',
    '__aichat_chatgpt_core_main_v1__',
    'TOPBAR_MODEL_META_ATTR',
    'readTopbarModelBadgeLabel',
    'syncTopbarModelBadge',
    'topbarNeedsRepair',
    'onRouteChange',
    'MutationObserver',
    'disposeRuntime'
  ]) {
    if (!sidebarHeaderSource.includes(required)) {
      failures.push(`content/chatgpt-sidebar-header-fix/main.js is missing ${required}`);
    }
  }

  for (const required of ['HTMLAudioElement', 'playbackRate', 'preservesPitch', 'ratechange', 'Avoid a global subtree MutationObserver']) {
    if (!readaloudSource.includes(required)) {
      failures.push(`content/chatgpt-readaloud-speed-controller/main.js is missing ${required}`);
    }
  }
  if (readaloudSource.includes('new MutationObserver')) {
    failures.push('content/chatgpt-readaloud-speed-controller/main.js should not attach a global MutationObserver on ChatGPT');
  }

  for (const required of [
    '__aichat_chatgpt_fetch_consumer_base_v1__',
    '__aichat_chatgpt_fetch_hub_v1__',
    'chatgpt-download-file-fix',
    'MAX_DECODE_TIMES',
    'XMLHttpRequest.prototype.open',
    'sandbox_path'
  ]) {
    if (!downloadFileFixSource.includes(required)) {
      failures.push(`content/chatgpt-download-file-fix/main.js is missing ${required}`);
    }
  }

  for (const required of [
    '__aichat_chatgpt_core_main_v1__',
    'CONFIG_DATASET_KEYS',
    'isFeatureEnabled',
    'ensureConfigObserver',
    'snapshotActiveSelection',
    'transformFragment',
    'annotation[encoding="application/x-tex"]',
    'scheduleQuotePatch',
    'applyPendingQuotePatch',
    'snapshotSelectionForMultiQuote',
    'appendQuoteToComposer',
    'buildMarkdownBlockquote',
    'hideNativeQuoteControlsNear',
    'btq-multi-quote-button',
    'getComposerEl',
    'writeComposerText',
    'isComposerOrInside',
    'shouldSkipSelectionQuoteRefreshForTyping'
  ]) {
    if (!texCopyQuoteSource.includes(required)) {
      failures.push(`content/chatgpt-tex-copy-quote/main.js is missing ${required}`);
    }
  }
  for (const required of [
    'chatgpt_tex_copy_quote_multi_quote',
    'chatgpt_tex_copy_quote_hide_native_quote',
    'chatgpt_tex_copy_quote_native_quote_patch',
    'chatgpt_tex_copy_quote_copy_latex',
    'chatgpt_tex_copy_quote_hover_tooltip',
    'chatgpt_tex_copy_quote_double_click_copy',
    'chatgpt_tex_copy_quote_double_click_copy: true',
    'MIGRATION_CHATGPT_TEX_DOUBLE_CLICK_DEFAULT_ON',
    'DATASET_KEYS',
    'chrome.storage.onChanged.addListener',
    'aichatTexQuoteDoubleClickCopyEnabled'
  ]) {
    if (
      !injectionsSource.includes(required) &&
      !optionsSource.includes(required) &&
      !texCopyQuoteConfigSource.includes(required) &&
      !storageSource.includes(required)
    ) {
      failures.push(`ChatGPT TeX Copy & Quote configurable option support is missing ${required}`);
    }
  }

  if (!/readBool\(mods\?\.chatgpt_tex_copy_quote_double_click_copy,\s*true\)/.test(texCopyQuoteConfigSource)) {
    failures.push('ChatGPT TeX Copy & Quote double-click copy must fall back to enabled when storage is missing');
  }

  for (const required of [
    '__aichat_chatgpt_hide_feedback_buttons_style_v1__',
    'good-response-turn-action-button',
    'bad-response-turn-action-button'
  ]) {
    if (!hideFeedbackSource.includes(required)) {
      failures.push(`content/chatgpt-hide-feedback-buttons/main.js is missing ${required}`);
    }
  }
  for (const required of ['aichat-strong-highlight-lite-style', '.markdown strong', 'vt-disclaimer']) {
    if (!strongHighlightSource.includes(required)) {
      failures.push(`content/chatgpt-strong-highlight-lite/main.js is missing ${required}`);
    }
  }

  for (const required of [
    '__aichat_chatgpt_canvas_enhancements_state_v1__',
    '__aichat_chatgpt_core_main_v1__',
    '__aichat_chatgpt_mapping_client_v1__',
    'fetchConversationMapping',
    'MAX_MAPPING_JSON_BYTES',
    'BLOCK_SELECTOR',
    'TEXTDOC_CARD_SELECTOR',
    'core.onRouteChange',
    'MutationObserver',
    'cleanup'
  ]) {
    if (!canvasEnhancementsSource.includes(required)) {
      failures.push(`content/chatgpt-canvas-enhancements/main.js is missing ${required}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyGrokQuicknavHardening(runtimeDefs) {
  const quicknavSource = readText('content/grok-quicknav.js');
  const cmdenterSource = readText('content/chatgpt-cmdenter-send/main.js');
  const failures = [];

  for (const required of ['healObserverIfNeeded', '_observerHealTimer', 'force-refresh-tick', 'health-check']) {
    if (!quicknavSource.includes(required)) {
      failures.push(`content/grok-quicknav.js is missing ${required}`);
    }
  }

  const grokQuicknavDef = Array.isArray(runtimeDefs)
    ? runtimeDefs.find((def) => def && def.id === 'quicknav_grok')
    : null;
  const grokMatches = Array.isArray(grokQuicknavDef?.matches) ? grokQuicknavDef.matches : [];
  if (!grokMatches.includes('https://grok.com/*')) {
    failures.push('quicknav_grok is not injected on https://grok.com/*');
  }

  for (const required of ['getGrokEditScopeFromPrompt', 'resolveGrokEditSaveButton']) {
    if (!cmdenterSource.includes(required)) {
      failures.push(`content/chatgpt-cmdenter-send/main.js is missing ${required}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.join('; ')
  };
}

function verifyOptionsSearchRedesign() {
  const optionsHtml = readText('options/options.html');
  const optionsCss = readText('options/options.css');
  const optionsSource = readText('options/options.js');
  const i18nSource = readText('shared/i18n.js');
  const failures = [];

  for (const required of [
    'id="globalSettingsSearch"',
    'id="globalSettingsSearchClear"',
    'id="globalSearchSummary"',
    'class="filterPill active"',
    'class="quickJumpBtn"',
    'data-module="chatgpt_tab_queue"',
    'data-module="chatgpt_tex_copy_quote"'
  ]) {
    if (!optionsHtml.includes(required)) {
      failures.push(`options/options.html is missing options search UI support: ${required}`);
    }
  }

  for (const required of [
    'globalSearchText',
    'activeSearchFilter',
    'MODULE_SEARCH_KEYWORDS',
    'modulePassesActiveFilter',
    'renderSearchControls',
    'jumpToModule',
    "key === 'k'",
    "key === '/'"
  ]) {
    if (!optionsSource.includes(required)) {
      failures.push(`options/options.js is missing options search behavior: ${required}`);
    }
  }

  for (const required of [
    '.overviewGrid',
    '.globalSearch',
    '.filterPill',
    '.quickJumpBtn',
    '--card-radius: 8px'
  ]) {
    if (!optionsCss.includes(required)) {
      failures.push(`options/options.css is missing options search styling: ${required}`);
    }
  }

  for (const required of [
    "'查找设置': 'Find settings'",
    "'搜索全部设置、脚本、快捷键…': 'Search all settings, scripts, hotkeys…'",
    "'没有匹配结果': 'No matching results'"
  ]) {
    if (!i18nSource.includes(required)) {
      failures.push(`shared/i18n.js is missing options search translation: ${required}`);
    }
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

  const domAdapterContract = verifyChatgptDomAdapterContract(runtimeDefs);
  if (!domAdapterContract.ok) {
    console.error(`ChatGPT DOM adapter contract: FAIL (${domAdapterContract.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT DOM adapter contract: OK');

  const modelDetectionHardening = verifyChatgptModelDetectionHardening();
  if (!modelDetectionHardening.ok) {
    console.error(`ChatGPT model detection hardening: FAIL (${modelDetectionHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT model detection hardening: OK');

  const thinkingToggleCmdPBlocker = verifyChatgptThinkingToggleCmdPBlocker();
  if (!thinkingToggleCmdPBlocker.ok) {
    console.error(`ChatGPT thinking toggle Cmd+P blocker: FAIL (${thinkingToggleCmdPBlocker.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT thinking toggle Cmd+P blocker: OK');

  const tabQueueRestoreGuard = verifyChatgptTabQueueRestoreRequeueGuard();
  if (!tabQueueRestoreGuard.ok) {
    console.error(`ChatGPT Tab Queue restore/requeue guard: FAIL (${tabQueueRestoreGuard.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT Tab Queue restore/requeue guard: OK');

  const openaiNewModelBannerRuntimeGuard = verifyOpenaiNewModelBannerRuntimeGuard();
  if (!openaiNewModelBannerRuntimeGuard.ok) {
    console.error(`OpenAI new model banner runtime guard: FAIL (${openaiNewModelBannerRuntimeGuard.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('OpenAI new model banner runtime guard: OK');

  const openaiModelProbeStatusSemantics = verifyOpenaiModelProbeStatusSemantics();
  if (!openaiModelProbeStatusSemantics.ok) {
    console.error(`OpenAI model probe status semantics: FAIL (${openaiModelProbeStatusSemantics.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('OpenAI model probe status semantics: OK');

  const googleAskHandoff = verifyGoogleAskGptHandoff(runtimeDefs);
  if (!googleAskHandoff.ok) {
    console.error(`Google Ask GPT handoff: FAIL (${googleAskHandoff.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('Google Ask GPT handoff: OK');

  const qwenThinkingToggle = verifyQwenThinkingToggleHardening();
  if (!qwenThinkingToggle.ok) {
    console.error(`Qwen thinking/model toggle hardening: FAIL (${qwenThinkingToggle.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('Qwen thinking/model toggle hardening: OK');

  const metaAiCmdEnterSupport = verifyMetaAiCmdEnterSupport(runtimeDefs);
  if (!metaAiCmdEnterSupport.ok) {
    console.error(`Meta AI Cmd+Enter support: FAIL (${metaAiCmdEnterSupport.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('Meta AI Cmd+Enter support: OK');

  const cleanupResourceHardening = verifyCleanupResourceHardening();
  if (!cleanupResourceHardening.ok) {
    console.error(`Cleanup/resource hardening: FAIL (${cleanupResourceHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('Cleanup/resource hardening: OK');

  const gensparkSonnetThinkingCompatibility = verifyGensparkSonnetThinkingCompatibility();
  if (!gensparkSonnetThinkingCompatibility.ok) {
    console.error(`Genspark Sonnet thinking compatibility: FAIL (${gensparkSonnetThinkingCompatibility.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('Genspark Sonnet thinking compatibility: OK');

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

  const quicknavScrollLockReliability = verifyChatgptQuicknavScrollLockReliability();
  if (!quicknavScrollLockReliability.ok) {
    console.error(`ChatGPT QuickNav scroll-lock reliability: FAIL (${quicknavScrollLockReliability.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT QuickNav scroll-lock reliability: OK');

  const quicknavTurnCandidateHardening = verifyChatgptQuicknavTurnCandidateHardening();
  if (!quicknavTurnCandidateHardening.ok) {
    console.error(`ChatGPT QuickNav turn candidate hardening: FAIL (${quicknavTurnCandidateHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT QuickNav turn candidate hardening: OK');

  const composerWorkflowHardening = verifyChatgptComposerWorkflowHardening();
  if (!composerWorkflowHardening.ok) {
    console.error(`ChatGPT composer workflow hardening: FAIL (${composerWorkflowHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT composer workflow hardening: OK');

  const treeExportHardening = verifyChatgptTreeExportHardening();
  if (!treeExportHardening.ok) {
    console.error(`ChatGPT tree/export hardening: FAIL (${treeExportHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT tree/export hardening: OK');

  const usageMonitorHardening = verifyChatgptUsageMonitorHardening();
  if (!usageMonitorHardening.ok) {
    console.error(`ChatGPT usage monitor hardening: FAIL (${usageMonitorHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT usage monitor hardening: OK');

  const smallFeatureHardening = verifyChatgptSmallFeatureHardening(runtimeDefs);
  if (!smallFeatureHardening.ok) {
    console.error(`ChatGPT small feature hardening: FAIL (${smallFeatureHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('ChatGPT small feature hardening: OK');

  const optionsSearchRedesign = verifyOptionsSearchRedesign();
  if (!optionsSearchRedesign.ok) {
    console.error(`Options search redesign: FAIL (${optionsSearchRedesign.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('Options search redesign: OK');

  const grokQuicknavHardening = verifyGrokQuicknavHardening(runtimeDefs);
  if (!grokQuicknavHardening.ok) {
    console.error(`Grok QuickNav/Cmd+Enter hardening: FAIL (${grokQuicknavHardening.reason})`);
    process.exitCode = 1;
    return;
  }
  console.log('Grok QuickNav/Cmd+Enter hardening: OK');

  console.log('Integrated repo checks: OK');
}

main();
