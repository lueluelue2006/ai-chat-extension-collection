---
doc_type: architecture
status: current
updated: 2026-04-30
project: ai-shortcuts
tags: [chrome-extension, mv3, chatgpt, userscripts]
---

# AI Shortcuts Architecture

> This is the CodeStable architecture entry point. It records the current system shape, not future plans.

## Project Summary

AI Shortcuts is a Chrome MV3 extension that packages many AI-site productivity scripts. Since the 4.x series, the product focus is ChatGPT-first: long ChatGPT conversations, heavy Thinking / Pro workflows, repeated sending, conversation navigation, quoting, usage tracking, and browser-side performance stability.

Other AI sites still receive shared productivity capabilities such as QuickNav and Cmd+Enter send, but ChatGPT is the deepest integration surface and the highest-risk compatibility target.

## Runtime Shape

- `manifest.source.json` is the editable MV3 manifest source.
- `shared/registry.ts` and `shared/injections.ts` are the source of truth for module metadata and dynamic content-script injection definitions.
- `scripts/build.mjs` transpiles TypeScript/shared source and mirrors runtime files into `dist/`.
- `scripts/verify.js` is the main regression guard for selectors, forbidden request paths, injection invariants, and high-risk ChatGPT behavior.
- `scripts/package-dist.mjs` builds the release zip from the generated `dist/` folder.

## Major Runtime Boundaries

- `content/chatgpt-core*.js`: shared ChatGPT DOM and action helpers for isolated/main worlds.
- `content/chatgpt-fetch-hub/`: passive observation of ChatGPT's existing conversation fetch/SSE lifecycle. This should not add backend requests.
- `content/chatgpt-tab-queue/`: Tab-based send queue. Queue progress is event-gated and must not actively poll backend stream status.
- `content/chatgpt-quicknav.js` plus `content/scroll-guard-main.js`: navigation, pin/favorite UI, and scroll-lock/source-gate protection.
- `content/chatgpt-dom-adapter.js`: shared DOM adapter, including real chat scroller and composer text handling.
- `content/chatgpt-quick-deep-search/`, `chatgpt-thinking-toggle/`, `chatgpt-tex-copy-quote/`, `chatgpt-message-tree/`, `chatgpt-export-conversation/`: ChatGPT-specific workflows built on the shared core.
- Site-specific QuickNav files reuse the common QuickNav kernel where possible.
- `options/` and shared config bridges expose per-module settings.

## Verification Contract

For code changes:

- Run `npm run verify` for static/build regression coverage.
- Run `npm run package:dist` before release packaging.
- Browser-facing ChatGPT changes require real Chrome validation, usually with a new normal ChatGPT conversation unless the issue is explicitly about temporary chat.
- Network-risk changes must prove they do not add active polling or hidden backend requests.
- Memory-risk changes must avoid full-response text copies and unbounded observers/listeners.

## Key Architecture Decisions

- [ChatGPT request safety](../compound/2026-04-30-decision-chatgpt-request-safety.md)
- [Event-gated Tab sending](../compound/2026-04-30-decision-chatgpt-event-gated-sending.md)

## Known High-Risk Areas

- ChatGPT UI selectors and composer structure change frequently.
- Pro / Thinking replies can have long `Finalizing answer` phases where the composer is usable before the previous answer is truly settled.
- Scroll locking must prefer source-level interception, but layout shifts may still need anchor-based fallback.
- Reading ChatGPT composer text with `innerText` is unsafe for multi-paragraph ProseMirror DOM.
- Long formula/code responses can turn innocent-looking text extraction into a large memory allocation problem.

## Current Evidence Sources

- `README.md` for product positioning and release notes.
- `docs/scripts-inventory.md` for generated module inventory.
- `.codex-tasks/*/PROGRESS.md` and `.codex-tasks/*/raw/` for execution evidence.
