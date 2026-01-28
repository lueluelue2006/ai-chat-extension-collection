#!/usr/bin/env node
'use strict';

// Generates docs/scripts-inventory.md from:
// - shared/registry.js (user-facing module metadata, incl. authors/license)
// - shared/injections.js (MV3 injection defs: matches/js/css/runAt/world)
//
// This keeps the inventory in sync without relying on legacy userscript headers.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function writeText(relPath, text) {
  fs.writeFileSync(path.join(ROOT, relPath), text, 'utf8');
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
  if (typeof inj.buildContentScriptDefs !== 'function') throw new Error('QUICKNAV_INJECTIONS.buildContentScriptDefs is missing');
  return inj;
}

function loadManifest() {
  const raw = readText('manifest.json');
  return JSON.parse(raw);
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = String(v || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function fmtOneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function fmtModuleMeta(def) {
  const authors = Array.isArray(def?.authors) ? def.authors.map((v) => fmtOneLine(v)).filter(Boolean) : [];
  const license = typeof def?.license === 'string' ? fmtOneLine(def.license) : '';
  const upstream = typeof def?.upstream === 'string' ? fmtOneLine(def.upstream) : '';
  return { authors, license, upstream };
}

function fmtDefLine(d) {
  const runAt = String(d?.runAt || '');
  const world = String(d?.world || 'ISOLATED');
  const allFrames = d?.allFrames ? ' (allFrames)' : '';
  const files = uniq([...(d?.js || []), ...(d?.css || [])]);
  const fileText = files.length ? files.map((f) => `\`${f}\``).join(', ') : '(none)';
  return `${runAt} / ${world}${allFrames}: ${fileText}`;
}

function main() {
  const manifest = loadManifest();
  const reg = loadRegistry();
  const injections = loadInjections();
  const defs = injections.buildContentScriptDefs(reg);

  const sites = Array.isArray(reg?.sites) ? reg.sites : [];
  const modules = reg?.modules && typeof reg.modules === 'object' ? reg.modules : {};

  const defsBySiteModule = new Map(); // `${siteId}\n${moduleId}` -> defs[]
  for (const d of defs) {
    if (!d || typeof d !== 'object') continue;
    const siteId = typeof d.siteId === 'string' ? d.siteId : '';
    const moduleId = typeof d.moduleId === 'string' ? d.moduleId : '';
    if (!siteId || !moduleId) continue;
    const key = `${siteId}\n${moduleId}`;
    if (!defsBySiteModule.has(key)) defsBySiteModule.set(key, []);
    defsBySiteModule.get(key).push(d);
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let out = '';
  out += `# Scripts Inventory (MV3)\n\n`;
  out += `- Name: ${fmtOneLine(manifest?.name)}\n`;
  out += `- Version: ${fmtOneLine(manifest?.version)}\n`;
  out += `- Generated: ${stamp}\n`;
  out += `- Source of truth: \`shared/registry.js\` (metadata) + \`shared/injections.js\` (injection defs)\n\n`;
  out += `## Popup “菜单按钮/选项按钮” 来自哪里？\n\n`;
  out += `扩展弹窗里显示的“菜单按钮/选项按钮”，来自页面里调用 \`window.__quicknavRegisterMenuCommand(name, fn)\` 注册的命令。\n\n`;
  out += `当前 registry 标注了菜单预览（menuPreview）的模块：\n\n`;
  for (const [moduleId, m] of Object.entries(modules)) {
    const preview = Array.isArray(m?.menuPreview) ? m.menuPreview.map((x) => fmtOneLine(x)).filter(Boolean) : [];
    if (!preview.length) continue;
    out += `- \`${moduleId}\`: ${fmtOneLine(m?.name || moduleId)}（${preview.map((p) => `“${p}”`).join(' / ')}）\n`;
  }
  out += `\n`;

  out += `## Sites\n\n`;
  for (const s of sites) {
    const siteId = String(s?.id || '').trim();
    if (!siteId) continue;
    const siteName = fmtOneLine(s?.name || siteId);
    const siteSub = fmtOneLine(s?.sub || '');
    out += `### ${siteName}${siteSub ? ` (${siteSub})` : ''}\n\n`;

    const modIds = Array.isArray(s?.modules) ? s.modules : [];
    for (const moduleId of modIds) {
      const m = modules[moduleId] || null;
      const mName = fmtOneLine(m?.name || moduleId);
      const mSub = fmtOneLine(m?.sub || '');
      const { authors, license, upstream } = fmtModuleMeta(m);

      out += `- \`${moduleId}\`: ${mName}${mSub ? ` — ${mSub}` : ''}\n`;
      if (authors.length) out += `  - 作者: ${authors.join(' / ')}\n`;
      if (license) out += `  - 许可证: ${license}\n`;
      if (upstream) out += `  - 上游: \`${upstream}\`\n`;

      const key = `${siteId}\n${moduleId}`;
      const list = defsBySiteModule.get(key) || [];
      // Stable order for readability: document_start -> end -> idle, MAIN after ISOLATED.
      const orderRunAt = { document_start: 0, document_end: 1, document_idle: 2 };
      list.sort((a, b) => {
        const ra = orderRunAt[String(a?.runAt || '')] ?? 9;
        const rb = orderRunAt[String(b?.runAt || '')] ?? 9;
        if (ra !== rb) return ra - rb;
        const wa = String(a?.world || 'ISOLATED');
        const wb = String(b?.world || 'ISOLATED');
        if (wa !== wb) return wa === 'ISOLATED' ? -1 : 1;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });
      if (list.length) {
        for (const d of list) out += `  - 注入: ${fmtDefLine(d)}\n`;
      } else {
        out += `  - 注入: (not found in background/sw.js)\n`;
      }
    }

    out += `\n`;
  }

  writeText('docs/scripts-inventory.md', out);
  process.stdout.write('Wrote docs/scripts-inventory.md\n');
}

main();
