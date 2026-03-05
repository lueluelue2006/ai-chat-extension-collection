#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'content', 'chatgpt-export-conversation', 'main.js'), 'utf8');

function testSanitizerHardening() {
  assert.ok(
    SOURCE.includes("const banned = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM']);"),
    'export sanitizer should strip style/form-like executable elements'
  );
  assert.ok(SOURCE.includes("lowerName === 'style'"), 'export sanitizer should remove inline style attributes');
  assert.ok(SOURCE.includes("lowerName === 'srcset'"), 'export sanitizer should remove srcset attributes');
  assert.ok(SOURCE.includes("lowerName === 'poster'"), 'export sanitizer should remove poster attributes');
  assert.ok(SOURCE.includes("lowerName === 'action'"), 'export sanitizer should remove form action attributes');
  assert.ok(SOURCE.includes("lowerName === 'formaction'"), 'export sanitizer should remove button form actions');
  assert.ok(SOURCE.includes("lowerName === 'background'"), 'export sanitizer should remove background URL attributes');
  assert.ok(SOURCE.includes("lowerName === 'cite'"), 'export sanitizer should remove cite URL attributes');
  assert.ok(SOURCE.includes("lowerName.startsWith('data-')"), 'export sanitizer should drop data-* attributes');
  assert.ok(SOURCE.includes("lowerName.startsWith('aria-')"), 'export sanitizer should drop aria-* attributes');
  assert.ok(SOURCE.includes('function sanitizeExportLinkUrl(rawValue)'), 'export sanitizer should sanitize anchor URLs');
  assert.ok(SOURCE.includes('function sanitizeExportImageUrl(rawValue)'), 'export sanitizer should sanitize image URLs');
  assert.ok(
    SOURCE.includes("node.setAttribute('rel', 'noopener noreferrer nofollow');") &&
      SOURCE.includes("node.setAttribute('target', '_blank');"),
    'sanitized export links should be rewritten with safe rel/target attributes'
  );
}

function main() {
  testSanitizerHardening();
  console.log('PASS dev/test-chatgpt-export-conversation-sanitizer.js');
}

main();
