---
doc_type: issue-report
issue: 2026-05-02-chatgpt-tab-quicknav-regression
status: confirmed
severity: P1
summary: ChatGPT Tab occasionally fails to send and QuickNav scroll lock can drift upward after recent hardening.
tags: [chatgpt, tab-queue, quicknav, scroll-lock]
---

# ChatGPT Tab / QuickNav Regression Issue Report

## 1. 问题现象

用户观察到两个 ChatGPT 回归：

1. `Tab` 作为发送 / 排队入口时，有时没有自动发送。
2. QuickNav 滚动锁有时会在用户滑动后，甚至未明显滑动时，让页面自动往上跑。

## 2. 复现步骤

当前复现频率：概率性，待本轮真实 ChatGPT 新对话验证。

已知测试入口：

1. 打开新的普通 ChatGPT 对话。
2. 输入提示词并用 `Tab` 发送。
3. 观察是否发出用户消息，或是否被吞掉。
4. 在长对话中开启 QuickNav 锁，停在中段或手动滑动后观察滚动位置。
5. 观察页面是否无意上移。

## 3. 期望 vs 实际

**期望行为**：空闲时 `Tab` 等价于可靠发送；回复中 `Tab` 只入队，等安全完成后自动发送。QuickNav 锁只阻止 ChatGPT 自动把用户拉走，不应主动改变用户正在看的位置。

**实际行为**：用户报告 `Tab` 偶发不自动发送；QuickNav 锁偶发把页面往上带。

## 4. 环境信息

- 涉及模块 / 功能：ChatGPT Tab Queue、QuickNav scroll lock、Fetch Hub、scroll guard。
- 相关文件 / 函数：`content/chatgpt-tab-queue/main.js`、`content/chatgpt-quicknav.js`、`content/scroll-guard-main.js`。
- 运行环境：本地 Chrome profile，扩展版本基线 `4.0.22`。
- 其他上下文：4.0.22 引入了 idle `Tab` 直发路径和 QuickNav anchor fallback，二者是本轮重点检查对象。

## 5. 严重程度

**P1** — ChatGPT 是 4.x 主工作流，`Tab` 发送可靠性和滚动锁稳定性都属于核心路径。

## 备注

本轮开始前已创建本地 git checkpoint：`db8279b`。
