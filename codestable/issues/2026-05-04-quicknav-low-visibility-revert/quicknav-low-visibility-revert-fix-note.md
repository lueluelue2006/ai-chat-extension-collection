---
doc_type: issue-fix-note
issue: quicknav-low-visibility-revert
date: 2026-05-04
status: fixed
tags: [chatgpt, quicknav, rollback]
---

# QuickNav Low Visibility Revert Fix Note

## 问题

4.0.32 的 QuickNav 低可见性实验改变了面板事件隔离和 turn 标记路径，用户反馈需要退回原来的 QuickNav 行为。

## 修复

- `content/chatgpt-quicknav.js` 恢复到 4.0.31 的 QuickNav 实现。
- `scripts/verify.js` 移除 4.0.32 专门要求低可见性实验存在的断言。
- 版本提升到 4.1.0，并在 README / Release 中说明这是对 4.0.32 QuickNav 实验的回退。

## 验证

`npm run verify` 与 `npm run package:dist` 均通过，生成 `release/ai-shortcuts-dist-v4.1.0.zip`。
随后在 Chrome 重新加载扩展并做 ChatGPT QuickNav 冒烟测试。
