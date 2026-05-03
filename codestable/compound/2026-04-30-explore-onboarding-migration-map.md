---
doc_type: explore
type: module-overview
date: 2026-04-30
slug: onboarding-migration-map
status: current
area: codestable
tags: [onboarding, taskmaster, migration]
---

# Onboarding Migration Map

## Question

How should the existing project knowledge be organized after adding CodeStable?

## Findings

The repository had no `codestable/` or legacy `easysdd/` directory before onboarding. It already had normal project docs:

- `README.md`: product positioning and release notes.
- `docs/scripts-inventory.md`: generated module and injection inventory.
- `CREDITS.md`: attribution.

It also had many `.codex-tasks/` directories with concrete execution evidence. These should not be moved into CodeStable one by one. They are useful as raw task logs, not as the long-term system map.

## Mapping

| Source | CodeStable Role | Action |
| --- | --- | --- |
| `README.md` | Product positioning and release history | Keep in place; summarize stable facts into requirements/architecture |
| `docs/scripts-inventory.md` | Generated runtime inventory | Keep in place; reference from architecture |
| `.codex-tasks/*/PROGRESS.md` | Execution evidence | Keep in place; link from compound docs when useful |
| `.codex-tasks/*/raw/` | Browser/network/CDP evidence | Keep in place; use as proof trail |
| Future bug fixes | `codestable/issues/` plus taskmaster task dir | Use both |
| Future features | `codestable/features/` plus taskmaster task dir | Use both |
| Long-term constraints | `codestable/compound/*decision*.md` | Archive as decisions |
| Repeatable pitfalls | `codestable/compound/*learning*.md` | Archive as learnings |

## Recommended Operating Model

Use CodeStable as the long-term knowledge base and taskmaster as the per-task execution black box:

1. Start with a `cs-*` workflow to classify the work.
2. Use `$taskmaster` to execute, track TODO state, and preserve raw validation evidence.
3. At the end, write back stable conclusions to CodeStable architecture, requirements, decisions, or learnings.

## Related Taskmaster Evidence

- `.codex-tasks/20260429-chatgpt-tabqueue-no-stream-status/`
- `.codex-tasks/20260429-chatgpt-event-gate-research/`
- `.codex-tasks/20260430-chatgpt-newline-duplication/`
- `.codex-tasks/20260430-chatgpt-native-scroll-intercept/`
