---
doc_type: issue-fix
status: fixed
severity: medium
tags:
  - options
  - i18n
  - chrome-extension
fixed_version: 4.0.30
---

# Options i18n Chinese / English Mix Fix

## Problem

When the Options page was set to Chinese, parts of the interface could remain in English after the user had previously switched the page to English. Visible examples included the page title, master switch card, search filters, script control headings, and the OpenAI model monitor card.

## Root Cause

The shared i18n helper translated Chinese source DOM into English in place, then skipped localization entirely for Chinese locales. That made language switching one-way for static DOM: once a text node had become English, switching back to Chinese did not restore the original Chinese copy.

The Options HTML also still used a few hard-coded English source labels for visual eyebrow text.

## Fix

- Added reverse exact and regex localization in `shared/i18n.js` so English UI text can be restored to Chinese.
- Made `localizeTree()` run for Chinese locales as well, instead of returning early.
- Changed Options HTML source language and the main source labels to Chinese.
- Normalized locale-toggle titles and small split text fragments such as the install-path note.
- Added verify coverage to keep reverse localization present.
- Bumped the extension to `4.0.30`.

## Verification

- `gtimeout 60s npm run verify`: pass.
- `npm run package:dist`: pass, generated `release/ai-shortcuts-dist-v4.0.30.zip`.
- Reloaded the unpacked extension in `chrome://extensions/`.
- Opened the real Options page through CDP.
- Confirmed Chinese mode renders Chinese text for the main page, search controls, script lists, and OpenAI model monitor.
- Confirmed switching EN then ZH restores Chinese instead of leaving English text behind.
