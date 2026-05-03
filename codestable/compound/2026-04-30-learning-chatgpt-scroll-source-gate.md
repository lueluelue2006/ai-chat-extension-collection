---
doc_type: learning
track: knowledge
date: 2026-04-30
slug: chatgpt-scroll-source-gate
component: chatgpt-quicknav
tags: [chatgpt, quicknav, scroll-lock, source-gate]
---

# ChatGPT Scroll Source Gate

## Background

QuickNav scroll lock originally relied heavily on restoring `scrollTop` after ChatGPT moved the viewport. That can work functionally but feels like a visual twitch: the page jumps and then gets pulled back.

## Guidance

Prefer source-level interception for known programmatic scroll origins:

- `scrollIntoView(... block: "end")`
- `window` / element `scrollTo` and `scrollBy`
- direct `scrollTop` writes on the real ChatGPT chat scroller

When ChatGPT creates a new real scroller after send, source gate code must be willing to adopt that scroller immediately instead of trusting an early cached `HTML` scroller.

## Why It Matters

Blocking the harmful programmatic write before a scroll event is emitted is smoother and safer than restoring afterward. It also makes failures easier to diagnose because the blocked source can be logged.

## Applicability

This pattern is appropriate during explicit send/generation protection windows. It should not block user wheel/trackpad/keyboard scroll or user-triggered "go to bottom" behavior.

## Remaining Gap

Some jumps are layout shifts rather than native scroll API calls. Those likely need an anchor-based fallback that preserves the visible turn and viewport offset.

## Related Documentation

- `.codex-tasks/20260430-chatgpt-native-scroll-intercept/PROGRESS.md`
- `content/scroll-guard-main.js`
- `content/chatgpt-dom-adapter.js`
