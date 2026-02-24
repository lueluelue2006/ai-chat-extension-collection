#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Keep this explicit to avoid copying dev/tooling artifacts into dist.
const RUNTIME_ROOT_ENTRIES = [
  'manifest.json',
  'background',
  'content',
  'options',
  'popup',
  'shared',
  'rules',
  'icons',
  'third_party'
];

// Dev-only artifacts explicitly shipped for extension-page diagnostics.
const RUNTIME_EXTRA_FILES = ['dev/memtest.html', 'dev/memtest.js'];

const IGNORE_NAMES = new Set(['.DS_Store']);
const TS_LOADERS = new Map([
  ['.ts', 'ts'],
  ['.tsx', 'tsx'],
  ['.mts', 'ts'],
  ['.cts', 'ts']
]);

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

async function exists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureCleanDist() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });
}

async function copyRuntimeEntry(relPath) {
  const srcAbs = path.join(ROOT, relPath);
  const dstAbs = path.join(DIST, relPath);
  const stat = await fs.lstat(srcAbs);

  if (stat.isDirectory()) {
    await copyDirectory(srcAbs, dstAbs);
    return;
  }

  await copyFile(srcAbs, dstAbs);
}

async function copyDirectory(srcDir, dstDir) {
  await fs.mkdir(dstDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (IGNORE_NAMES.has(entry.name)) continue;
    const srcAbs = path.join(srcDir, entry.name);
    const dstAbs = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcAbs, dstAbs);
      continue;
    }
    if (!entry.isFile()) continue;

    await copyFile(srcAbs, dstAbs);
  }
}

async function copyFile(srcAbs, dstAbs) {
  const baseName = path.basename(srcAbs);
  if (IGNORE_NAMES.has(baseName)) return;

  const srcRel = toPosix(path.relative(ROOT, srcAbs));
  if (srcRel.endsWith('.d.ts')) return;

  const ext = path.extname(srcAbs).toLowerCase();
  const loader = TS_LOADERS.get(ext);
  if (loader) {
    const jsDstAbs = dstAbs.replace(/\.(cts|mts|tsx|ts)$/i, '.js');
    await transpileTypeScript(srcAbs, jsDstAbs, loader);
    return;
  }

  await fs.mkdir(path.dirname(dstAbs), { recursive: true });
  await fs.copyFile(srcAbs, dstAbs);
}

async function transpileTypeScript(srcAbs, dstAbs, loader) {
  const source = await fs.readFile(srcAbs, 'utf8');
  const result = await transform(source, {
    loader,
    target: 'chrome96',
    format: 'esm',
    sourcemap: false,
    minify: false,
    legalComments: 'none'
  });

  await fs.mkdir(path.dirname(dstAbs), { recursive: true });
  await fs.writeFile(dstAbs, result.code, 'utf8');
}

async function buildMirrorDist() {
  await ensureCleanDist();

  for (const relPath of RUNTIME_ROOT_ENTRIES) {
    const srcAbs = path.join(ROOT, relPath);
    if (!(await exists(srcAbs))) {
      console.warn(`[build] Skipped missing runtime entry: ${relPath}`);
      continue;
    }
    await copyRuntimeEntry(relPath);
  }

  for (const relPath of RUNTIME_EXTRA_FILES) {
    const srcAbs = path.join(ROOT, relPath);
    if (!(await exists(srcAbs))) {
      console.warn(`[build] Skipped missing runtime file: ${relPath}`);
      continue;
    }
    await copyRuntimeEntry(relPath);
  }

  const distManifest = path.join(DIST, 'manifest.json');
  if (!(await exists(distManifest))) {
    throw new Error('dist/manifest.json was not generated.');
  }
}

async function main() {
  try {
    await buildMirrorDist();
    console.log('[build] Mirror build complete: dist is ready to load unpacked.');
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(`[build] Failed: ${message}`);
    process.exitCode = 1;
  }
}

await main();
