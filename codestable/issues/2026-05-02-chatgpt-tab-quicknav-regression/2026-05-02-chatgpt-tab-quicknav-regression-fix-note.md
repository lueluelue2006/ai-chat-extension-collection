---
doc_type: issue-fix-note
issue: 2026-05-02-chatgpt-tab-quicknav-regression
status: complete
fix_type: targeted
related:
  - 2026-05-02-chatgpt-tab-quicknav-regression-report.md
  - 2026-05-02-chatgpt-tab-quicknav-regression-analysis.md
tags: [chatgpt, quicknav, scroll-lock, release-4.0.23, release-4.0.24]
---

# ChatGPT Tab / QuickNav Regression Fix Note

## 修复内容

- `content/chatgpt-quicknav.js`
  - 新增用户发起发送保护原因识别。
  - `Tab`、`Cmd+Enter`、发送按钮、手动入队等用户触发路径改用当前视口作为 scroll lock 基线。
  - anchor fallback 恢复时以当前锁定基线为下限，避免恢复到基线以上。
- `content/chatgpt-tab-queue/main.js`
  - 空闲 `Tab` 直发从短确认改为完整发送确认窗口。
  - 只有看到 conversation 请求、生成态或输入框清空等本地证据才算直发成功。
  - 未确认时清理手动发送 interlock 并回退到队列路径，避免快捷键吞掉用户输入。
- `scripts/verify.js`
  - 更新 QuickNav scroll-lock reliability guard，使验证覆盖新的 `reasonText` 保护路径。
- 版本推进到 `4.0.23`，并更新 README / manifest / inventory / dist。

## 2026-05-03 追补

- 版本推进到 `4.0.24`。
- `content/chatgpt-cmdenter-send/main.js`
  - Cmd+Enter 预锁定桥接消息增加 `userRequested: true`，避免真实用户快捷键被 QuickNav 当成普通程序化发送并复用旧基线。
- `content/chatgpt-quicknav.js`
  - `armProgrammaticSendScrollLockGuard()` 支持来自桥接 payload 的用户触发标记，用户触发发送统一使用当前视口作为保护基线。
  - route / 非聊天页面清理时临时关闭 MAIN-world scroll guard、清掉 route 级滚动期望和旧 anchor，但不写回用户的锁定偏好；新聊天路由初始化时仍按 localStorage / 默认设置恢复。
- `scripts/verify.js`
  - 增加 Cmd+Enter 用户触发标记与 route cleanup guard 的静态回归检查。

## 验证

- `gtimeout 90s npm run verify`：通过。
- `npm run package:dist`：通过，生成 `release/ai-shortcuts-dist-v4.0.23.zip`。
- `gtimeout 60s npm run check`：通过（2026-05-03 追补）。
- `gtimeout 60s npm run build`：通过（2026-05-03 追补）。
- `gtimeout 90s npm run verify`：通过（v4.0.24）。
- `npm run package:dist`：通过，生成 `release/ai-shortcuts-dist-v4.0.24.zip`。
- Chrome 扩展页重载后显示 `AI捷径 4.0.24`。
- 真实 ChatGPT 新普通对话验证（v4.0.24）：
  - CDP 原生滚动探针确认：ChatGPT 发送后会对新回复 `SECTION[data-testid=conversation-turn-*]` 调用 `scrollIntoView({ behavior: "smooth", block: "end" })`。
  - 长对话中段 `scrollTop≈1325.45` 时用 `Cmd+Enter` 发送短消息，8 秒采样内 `scrollTop` 稳定保持 `≈1325.45`，未被原生 smooth scroll 拉到底。
  - 同一长对话中段用空闲 `Tab` 直发短消息，8 秒采样内 `scrollTop` 稳定保持 `≈1325.45`，队列状态为清空 / 无 pending gate。
  - 静态扫描确认内容脚本没有 `fetch()` 调用 `stream_status`；CDP 观察到的单次 `stream_status` 请求来自页面自身链路，不是 Tab Queue 轮询恢复。
- Chrome 扩展页重载后显示 `AI捷径 4.0.23`。
- 真实 ChatGPT 新普通对话验证：
  - 空闲 `Tab` 直发成功，回复 `OK`。
  - 双 `Tab` 压测对话最终 `conversationStartSeq=2`，队列清空。
  - 长对话中段 `scrollTop≈1001` 时 `Tab` 发送，11 秒采样内 `scrollTop` 稳定保持 `≈1001`，未向上或向下跳。
  - 采样窗口未看到扩展引入的额外 `stream_status` 请求。

## 残余风险

用户报告的 `Tab` 偶发不自动发送在本轮真实测试中没有稳定复现。当前证据显示 Tab Queue 的空闲直发与普通自动续发路径可用；若后续仍复现，需要截取当时 `__aichat_chatgpt_tab_queue_debug_v1__.getState()` 的 `pendingSendGate`、`lastQueueAttempt` 和 `activeRequestIds`。
