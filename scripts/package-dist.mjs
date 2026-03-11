#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE_DIR = path.join(ROOT, 'release');
const STAGE_NAME = 'AI-Shortcuts-dist';

function fail(message) {
  console.error(`[package:dist] ${message}`);
  process.exit(1);
}

async function exists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(srcDir, dstDir) {
  await fs.mkdir(dstDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const srcAbs = path.join(srcDir, entry.name);
    const dstAbs = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcAbs, dstAbs);
      continue;
    }
    if (!entry.isFile()) continue;
    await fs.mkdir(path.dirname(dstAbs), { recursive: true });
    await fs.copyFile(srcAbs, dstAbs);
  }
}

function runPack(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit'
  });
  if (result.error) return false;
  if (typeof result.status === 'number' && result.status !== 0) {
    fail(`${command} exited with code ${result.status}`);
  }
  return true;
}

function runPythonZip(sourceDirName, zipAbs, cwd) {
  const code = [
    'import os, sys, zipfile',
    'src = sys.argv[1]',
    'dst = sys.argv[2]',
    'root = os.path.abspath(src)',
    'with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zf:',
    '    for cur, dirs, files in os.walk(root):',
    '        dirs[:] = [d for d in dirs if d != ".DS_Store"]',
    '        for name in files:',
    '            if name == ".DS_Store":',
    '                continue',
    '            abs_path = os.path.join(cur, name)',
    '            rel_path = os.path.relpath(abs_path, os.path.dirname(root))',
    '            zf.write(abs_path, rel_path)'
  ].join('; ');
  const result = spawnSync('python3', ['-c', code, sourceDirName, zipAbs], {
    cwd,
    stdio: 'inherit'
  });
  if (result.error) return false;
  if (typeof result.status === 'number' && result.status !== 0) {
    fail(`python3 exited with code ${result.status}`);
  }
  return true;
}

async function main() {
  if (!(await exists(path.join(DIST, 'manifest.json')))) {
    fail('缺少 dist/manifest.json。请先运行 npm run build。');
  }

  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const version = String(pkg?.version || '').trim();
  if (!version) fail('package.json 缺少 version。');

  await fs.mkdir(RELEASE_DIR, { recursive: true });
  const zipName = `ai-shortcuts-dist-v${version}.zip`;
  const zipAbs = path.join(RELEASE_DIR, zipName);
  await fs.rm(zipAbs, { force: true });

  const stageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-shortcuts-release-'));
  const stageDir = path.join(stageRoot, STAGE_NAME);

  try {
    await copyDir(DIST, stageDir);

    if (await exists(path.join(ROOT, 'LICENSE'))) {
      await fs.copyFile(path.join(ROOT, 'LICENSE'), path.join(stageDir, 'LICENSE'));
    }

    if (runPack('zip', ['-qry', zipAbs, STAGE_NAME], stageRoot)) {
      console.log(`[package:dist] Wrote ${path.relative(ROOT, zipAbs)}`);
      return;
    }

    if (runPythonZip(STAGE_NAME, zipAbs, stageRoot)) {
      console.log(`[package:dist] Wrote ${path.relative(ROOT, zipAbs)}`);
      return;
    }

    fail('未找到可用的 zip 打包器（zip / python3）。');
  } finally {
    await fs.rm(stageRoot, { recursive: true, force: true });
  }
}

await main();
