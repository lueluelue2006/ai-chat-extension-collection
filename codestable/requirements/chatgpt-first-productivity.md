---
doc_type: requirement
status: current
updated: 2026-04-30
slug: chatgpt-first-productivity
tags: [chatgpt, productivity, chrome-extension]
---

# ChatGPT-First Productivity

## Why This Exists

The extension serves heavy AI-site users, with ChatGPT as the primary battlefield. The target user keeps long conversations open, uses Thinking / Pro models, queues repeated prompts, studies formulas and code, and needs the browser page to remain controllable under heavy rendering load.

## Current Capability

- Navigate long ChatGPT conversations with QuickNav, pins, favorites, and message-tree support.
- Send with Tab Queue and Cmd+Enter while preserving normal multiline editing.
- Switch ChatGPT model / reasoning mode with keyboard shortcuts.
- Quote selected ChatGPT text and copy TeX more reliably.
- Track usage without introducing hidden backend request loops.
- Protect the current reading position from ChatGPT's automatic scroll-to-bottom behavior.
- Keep common productivity features working across other AI sites where practical.

## Boundaries

- ChatGPT receives deeper compatibility work than other sites.
- Other sites should reuse stable shared patterns, but not at the expense of ChatGPT performance or memory safety.
- Extension scripts must not create regular backend polling that could look like automated probing.
- User settings must remain respected; default-on behavior should not override manual disable choices.

## Verification Expectations

- ChatGPT behavior changes need real Chrome testing in normal conversations.
- Temporary chat requires separate validation because its routing and scroller lifecycle differ.
- Long formula/code paths should be tested with bounded memory in mind.
- Request safety should be checked both statically and with Network sampling when risk is plausible.
