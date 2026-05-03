---
doc_type: decision
category: architecture
date: 2026-04-30
slug: chatgpt-event-gated-sending
status: active
area: chatgpt-tab-queue
tags: [chatgpt, tab-queue, fetch-hub, send-gate]
---

# ChatGPT Event-Gated Sending

## Background

Tab Queue must send the next queued message only after the previous ChatGPT reply is actually safe to follow up. Network completion alone is too early for Pro / Thinking paths, while DOM polling alone is noisy and fragile.

## Decision

Tab Queue uses an event-gated send model:

- observe existing `/backend-api/f/conversation` lifecycle through Fetch Hub;
- maintain a pending send gate for queued messages;
- require transport completion or equivalent local completion evidence;
- require DOM/render stability before releasing the next queued send;
- keep watchdogs local only, without backend status polling.

## Rationale

- This matches the user action model: Tab while idle is direct send; Tab while a reply is active is queueing.
- It avoids both premature follow-up sends and hidden backend polling.
- It gives QuickNav and other scripts a more meaningful signal about why a message was sent.

## Consequences

- Pro `Finalizing answer` states must be treated as still active until visual completion evidence is strong enough.
- Queue highlights should apply only to true queued auto-sends, not direct idle Tab sends.
- Memory-sensitive render-settle checks must avoid reading full long responses.

## Related Documentation

- `.codex-tasks/20260429-chatgpt-event-gate-research/PROGRESS.md`
- `.codex-tasks/20260430-tab-queue-scroll-lock/PROGRESS.md`
- `.codex-tasks/20260430-chatgpt-newline-duplication/PROGRESS.md`
