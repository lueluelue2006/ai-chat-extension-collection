#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'dev', 'rename-boundary-allowlist.json');

function normalizeRelPath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .trim();
}

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.mustRename) || !Array.isArray(parsed.mustKeep)) {
    throw new Error('Invalid allowlist: mustRename and mustKeep must both be arrays.');
  }

  return parsed;
}

function listRepoFiles() {
  try {
    const out = cp.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    return out
      .split(/\r?\n/)
      .map((line) => normalizeRelPath(line))
      .filter(Boolean)
      .sort();
  } catch {
    return listFilesRecursive(ROOT)
      .map((abs) => normalizeRelPath(path.relative(ROOT, abs)))
      .sort();
  }
}

function listFilesRecursive(rootDir) {
  const out = [];
  const stack = [rootDir];
  const skip = new Set(['.git', 'node_modules']);

  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }

  return out;
}

function compileRule(rawRule, kind, index) {
  const id = String(rawRule?.id || `${kind}-${index + 1}`);
  const reason = String(rawRule?.reason || '').trim();

  let pathMatcher = null;
  if (rawRule && typeof rawRule.path === 'string' && rawRule.path.trim()) {
    const expected = normalizeRelPath(rawRule.path);
    pathMatcher = (relPath) => relPath === expected;
  } else if (rawRule && typeof rawRule.pathRegex === 'string' && rawRule.pathRegex.trim()) {
    const pathRegex = new RegExp(rawRule.pathRegex);
    pathMatcher = (relPath) => pathRegex.test(relPath);
  } else {
    throw new Error(`Invalid ${kind} rule ${id}: path or pathRegex is required.`);
  }

  let lineMatcher = null;
  if (rawRule && typeof rawRule.lineRegex === 'string' && rawRule.lineRegex.trim()) {
    const lineRegex = new RegExp(rawRule.lineRegex);
    lineMatcher = (line) => lineRegex.test(line);
  }

  return {
    id,
    kind,
    reason,
    hasLineMatcher: !!lineMatcher,
    matches(relPath, line) {
      if (!pathMatcher(relPath)) return false;
      if (!lineMatcher) return true;
      return lineMatcher(line);
    },
    matchesPath(relPath) {
      return pathMatcher(relPath);
    }
  };
}

function readLines(relPath) {
  const absPath = path.join(ROOT, relPath);
  const text = fs.readFileSync(absPath, 'utf8');
  return text.split(/\r?\n/);
}

function findFirstMatchingRule(rules, relPath, line) {
  for (const rule of rules) {
    if (rule.matches(relPath, line)) return rule;
  }
  return null;
}

function ensureRuleAnchors(rules, files) {
  const hits = new Map();
  for (const rule of rules) hits.set(rule.id, []);

  const lineCache = new Map();

  for (const relPath of files) {
    for (const rule of rules) {
      if (!rule.matchesPath(relPath)) continue;

      if (!rule.hasLineMatcher) {
        hits.get(rule.id).push({ file: relPath, line: 0, text: '(path anchor)' });
        continue;
      }

      if (!lineCache.has(relPath)) {
        try {
          lineCache.set(relPath, readLines(relPath));
        } catch {
          lineCache.set(relPath, null);
        }
      }
      const lines = lineCache.get(relPath);
      if (!Array.isArray(lines)) continue;

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (rule.matches(relPath, line)) {
          hits.get(rule.id).push({ file: relPath, line: i + 1, text: line });
        }
      }
    }
  }

  const missing = [];
  for (const rule of rules) {
    const matched = hits.get(rule.id);
    if (!matched || matched.length === 0) {
      missing.push(rule);
    }
  }

  return { hits, missing };
}

function buildProductSignalMatchers(config) {
  const signals = Array.isArray(config.productSignals) ? config.productSignals : [];
  if (!signals.length) {
    return [
      /<title>\s*QuickNav\b/,
      /<h[1-6][^>]*>\s*QuickNav\b/,
      /\bQuickNav\s+Dev\b/,
      /\bQuickNav\s+MV3\b/,
      /\bQuickNav\s+UI\b/
    ];
  }
  return signals.map((source) => new RegExp(String(source)));
}

function isProductSignal(line, signalRegexes) {
  for (const re of signalRegexes) {
    if (re.test(line)) return true;
  }
  return false;
}

function formatRule(rule) {
  const reason = rule.reason ? ` (${rule.reason})` : '';
  return `${rule.id}${reason}`;
}

function formatHit(hit) {
  const lineLabel = hit.line > 0 ? `${hit.file}:${hit.line}` : hit.file;
  const suffix = hit.ruleId ? ` [${hit.ruleId}]` : '';
  return `${lineLabel}${suffix} -> ${hit.text}`;
}

function main() {
  const config = loadConfig();
  const legacyBrand = String(config.legacyBrand || 'QuickNav');
  const files = listRepoFiles();

  const mustRenameRules = config.mustRename.map((rule, i) => compileRule(rule, 'mustRename', i));
  const mustKeepRules = config.mustKeep.map((rule, i) => compileRule(rule, 'mustKeep', i));
  const productSignalRegexes = buildProductSignalMatchers(config);
  const auditPathRegex =
    typeof config.auditPathRegex === 'string' && config.auditPathRegex.trim() ? new RegExp(config.auditPathRegex) : null;
  const auditExcludes = Array.isArray(config.auditExcludes)
    ? config.auditExcludes.map((source) => new RegExp(String(source)))
    : [];

  const renameAnchors = ensureRuleAnchors(mustRenameRules, files);
  const keepAnchors = ensureRuleAnchors(mustKeepRules, files);

  const allowedRenameHits = [];
  const allowedKeepHits = [];
  const violations = [];
  let unmatchedLegacyCount = 0;

  for (const relPath of files) {
    if (auditPathRegex && !auditPathRegex.test(relPath)) continue;
    if (auditExcludes.some((re) => re.test(relPath))) continue;

    let lines;
    try {
      lines = readLines(relPath);
    } catch {
      continue;
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.includes(legacyBrand)) continue;

      const renameRule = findFirstMatchingRule(mustRenameRules, relPath, line);
      if (renameRule) {
        allowedRenameHits.push({ file: relPath, line: i + 1, text: line.trim(), ruleId: renameRule.id });
        continue;
      }

      const keepRule = findFirstMatchingRule(mustKeepRules, relPath, line);
      if (keepRule) {
        allowedKeepHits.push({ file: relPath, line: i + 1, text: line.trim(), ruleId: keepRule.id });
        continue;
      }

      if (isProductSignal(line, productSignalRegexes)) {
        violations.push({ file: relPath, line: i + 1, text: line.trim() });
      } else {
        unmatchedLegacyCount += 1;
      }
    }
  }

  const hasFailure = renameAnchors.missing.length > 0 || keepAnchors.missing.length > 0 || violations.length > 0;

  if (hasFailure) {
    console.error('[FAIL] Brand boundary audit failed.');

    if (renameAnchors.missing.length > 0) {
      console.error(`- Missing mustRename anchors (${renameAnchors.missing.length}):`);
      for (const rule of renameAnchors.missing) console.error(`  - ${formatRule(rule)}`);
    }

    if (keepAnchors.missing.length > 0) {
      console.error(`- Missing mustKeep anchors (${keepAnchors.missing.length}):`);
      for (const rule of keepAnchors.missing) console.error(`  - ${formatRule(rule)}`);
    }

    if (violations.length > 0) {
      console.error(`- Forbidden product-level ${legacyBrand} hits (${violations.length}):`);
      for (const hit of violations) console.error(`  - ${formatHit(hit)}`);
    }

    process.exitCode = 1;
    return;
  }

  const renameRuleCount = mustRenameRules.length;
  const keepRuleCount = mustKeepRules.length;
  console.log('[PASS] Brand boundary audit passed.');
  console.log(`- mustRename anchors matched: ${renameRuleCount}/${renameRuleCount}`);
  console.log(`- mustKeep anchors matched: ${keepRuleCount}/${keepRuleCount}`);
  console.log(`- Allowed mustRename occurrences: ${allowedRenameHits.length}`);
  console.log(`- Allowed mustKeep occurrences: ${allowedKeepHits.length}`);
  console.log(`- Forbidden product-level ${legacyBrand} hits: 0`);
  console.log(`- Unmatched ${legacyBrand} occurrences (non-signal/module-context): ${unmatchedLegacyCount}`);
}

try {
  main();
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[FAIL] Brand boundary audit crashed: ${msg}`);
  process.exitCode = 1;
}
