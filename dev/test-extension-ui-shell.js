#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ensureContains(source, needle, label) {
  assert(source.includes(needle), `${label} is missing: ${needle}`);
}

function main() {
  assert(fs.existsSync(path.join(ROOT, 'shared/ui-shell.css')), 'shared/ui-shell.css should exist');

  const popupHtml = read('popup/popup.html');
  ensureContains(popupHtml, '../shared/ui-shell.css', 'popup shared shell link');
  ensureContains(popupHtml, 'id="globalStateLabel"', 'popup global state');
  ensureContains(popupHtml, 'id="activeModuleCount"', 'popup module count');
  ensureContains(popupHtml, 'id="activeMenuCount"', 'popup menu count');
  ensureContains(popupHtml, 'id="siteContextLabel"', 'popup site context');
  ensureContains(popupHtml, 'id="workspaceSummary"', 'popup workspace summary');

  const optionsHtml = read('options/options.html');
  ensureContains(optionsHtml, '../shared/ui-shell.css', 'options shared shell link');
  ensureContains(optionsHtml, 'id="overviewEnabled"', 'options overview enabled');
  ensureContains(optionsHtml, 'id="overviewSiteCount"', 'options overview site count');
  ensureContains(optionsHtml, 'id="overviewModuleCount"', 'options overview module count');
  ensureContains(optionsHtml, 'id="overviewMonitorState"', 'options overview monitor');
  ensureContains(optionsHtml, 'id="selectionSummary"', 'options selection summary');
  ensureContains(optionsHtml, 'id="siteCountBadge"', 'options site badge');
  ensureContains(optionsHtml, 'id="moduleCountBadge"', 'options module badge');
  ensureContains(optionsHtml, 'id="inspectorTitle"', 'options inspector title');
  ensureContains(optionsHtml, 'id="inspectorSub"', 'options inspector subtitle');

  const popupJs = read('popup/popup.js');
  ensureContains(popupJs, 'renderHeroSummary', 'popup hero summary renderer');

  const optionsJs = read('options/options.js');
  ensureContains(optionsJs, 'updateWorkspaceOverview', 'options workspace overview updater');
  ensureContains(optionsJs, 'updateMonitorOverview', 'options monitor overview updater');

  console.log('ok');
}

main();
