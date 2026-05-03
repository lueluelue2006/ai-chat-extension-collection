---
doc_type: learning
track: pitfall
date: 2026-04-30
slug: chatgpt-composer-dom-text
component: chatgpt-composer
severity: high
tags: [chatgpt, composer, prosemirror, newlines, memory]
---

# ChatGPT Composer DOM Text Pitfall

## Problem

Reading the live ChatGPT composer with `innerText` can duplicate line breaks when the ProseMirror editor represents user text as multiple paragraph nodes.

## Symptoms

- A prompt with single line breaks may be sent with extra blank lines.
- Prompts containing blank lines can expand into visually much larger text.
- Scripts that edit the composer before sending, such as Tab Queue and Quick Deep Search, can accidentally change the user's prompt.

## Ineffective Approach

Treating `innerText` as the canonical plain text representation is not safe for ChatGPT's current composer DOM. Browser layout semantics add paragraph spacing that does not match user intent.

## Solution

Use a semantic composer reader that understands the editor structure and reconstructs user-intended text. Shared ChatGPT send/edit paths should use that reader instead of ad hoc `innerText`.

## Why It Works

It separates user text semantics from browser rendering text. The script no longer copies layout-induced paragraph gaps into the outgoing prompt.

## Prevention

- Do not add new ChatGPT composer reads without checking the shared adapter first.
- Add regression fixtures for multi-`<p>` and single-`<p>` newline-restored composer shapes.
- For long text paths, avoid full-response or full-composer repeated copies in tight loops.

## Related Documentation

- `.codex-tasks/20260430-chatgpt-newline-duplication/PROGRESS.md`
- `content/chatgpt-dom-adapter.js`
