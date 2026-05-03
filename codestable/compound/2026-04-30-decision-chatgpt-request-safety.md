---
doc_type: decision
category: constraint
date: 2026-04-30
slug: chatgpt-request-safety
status: active
area: chatgpt-runtime
tags: [chatgpt, network, tab-queue, stream-status]
---

# ChatGPT Request Safety

## Background

The Tab Queue implementation previously used ChatGPT's `/backend-api/conversation/:id/stream_status` endpoint to check whether a response was still active. Even if this did not create a high-volume request storm in every case, regular hidden status probing is unacceptable for user trust and account-risk reasons.

## Decision

ChatGPT scripts must not actively poll backend response-status endpoints to drive UI automation. In particular, Tab Queue must not request `/stream_status`.

## Rationale

- Queue progression can be driven by existing ChatGPT conversation fetch/SSE events plus local UI state.
- Hidden regular backend probing is hard for users to reason about and may look automated.
- Static verification can reliably prevent accidental reintroduction of forbidden endpoint strings.

## Consequences

- Tab Queue uses passive Fetch Hub state and local render/visual gates.
- `scripts/verify.js` must keep guarding against `/stream_status` and old polling helpers in Tab Queue.
- ChatGPT's own frontend may still make its own backend requests; this decision only constrains extension-originated behavior.

## Related Documentation

- `.codex-tasks/20260429-chatgpt-tabqueue-no-stream-status/PROGRESS.md`
- `content/chatgpt-tab-queue/main.js`
- `scripts/verify.js`
