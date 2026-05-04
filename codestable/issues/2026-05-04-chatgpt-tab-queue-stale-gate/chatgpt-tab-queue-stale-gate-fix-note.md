---
doc_type: issue-fix
issue: 2026-05-04-chatgpt-tab-queue-stale-gate
status: fixed
root_cause_type: stale-state
tags: [chatgpt, tab-queue, send-gate, performance]
---

# ChatGPT Tab Queue Stale Gate Fix Note

## Problem

When a draft was queued while ChatGPT was still answering, the queue preview could remain in the "waiting for current reply" state after the visible reply had already finished. In that state, the queue head stayed blocked by `pendingSendGate`, and the preview's "force send" action also failed because it still used the same blocked queue path.

## Root Cause

`content/chatgpt-tab-queue/main.js` correctly avoids sending queued drafts while a reply is active, but it relied on the pending send gate being released by fetch/DOM completion signals. If ChatGPT finished visually but one of those signals was missed or arrived in an unexpected order, the stale gate kept blocking both automatic queue draining and manual force-send.

## Fix

- Added an explicit stop-button fallback for `aria-label*="Stop"` / Chinese stop labels.
- Added `canReleaseStalePendingGateFromVisualReady()` and a local visual-ready release path.
- The stale gate release only fires when the page is locally safe: no explicit generating signal, send button is ready, an assistant turn exists, reply rendering is settled, and the gate has aged past the local watchdog window.
- The "force send" button now first attempts this stale-gate release before re-entering queue processing.
- Added verify coverage for the stale-gate release predicate.

## Verification

- `node --check content/chatgpt-tab-queue/main.js`
- `gtimeout 60s npm run verify`
- Reloaded the unpacked extension from `dist`.
- In a new ChatGPT conversation, sent a long first prompt, queued a second prompt with real `Tab` while the first reply was still active, and confirmed:
  - queue state entered `queueLength=1` with `isGenerating=true`;
  - after the first reply completed, the queued draft was sent automatically;
  - final debug state had `queue=[]`, `pendingSendGate=null`, `activeRequestIds=[]`;
  - the conversation contained the queued user turn and the follow-up assistant answer.

## Notes

This fix does not add polling or any extra ChatGPT network request. It uses only existing passive fetch-hub events and local DOM/visual readiness signals.
