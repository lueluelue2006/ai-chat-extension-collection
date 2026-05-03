---
doc_type: issue-analysis
issue: 2026-05-02-chatgpt-tab-quicknav-regression
status: confirmed
root_cause_type: state-pollution
related: [2026-05-02-chatgpt-tab-quicknav-regression-report.md]
tags: [chatgpt, quicknav, tab-queue, scroll-lock]
---

# ChatGPT Tab / QuickNav Regression 根因分析

## 1. 问题定位

| 关键位置 | 说明 |
|---|---|
| `content/chatgpt-tab-queue/main.js:3104` | 空闲 `Tab` 直发路径如果只以点击返回值作为成功，会在 ChatGPT 吞点击 / 未开始请求时把用户输入当作已处理。 |
| `content/chatgpt-quicknav.js:7998` | `restoreScrollLockAnchor()` 按锚点 delta 恢复时没有以当前锁定基线为下限，可能把视口恢复到基线以上。 |
| `content/chatgpt-quicknav.js:8458` | `armProgrammaticSendScrollLockGuard()` 在发送保护窗口里会复用旧 `scrollLockStablePos`；若用户当前视口已经在更下方但旧基线未及时更新，后续恢复队列会把页面往上拉。 |

## 2. 失败路径还原

**正常路径**：用户停在长对话中段 → 用 `Tab` / `Cmd+Enter` / 发送按钮触发发送 → scroll lock 以当前视口作为保护基线 → ChatGPT 的自动跳底被拦截，用户仍停在原处。

**失败路径**：用户当前视口已经移动到更下方 → 发送保护沿用旧 `stablePos` → `scheduleProgrammaticSendScrollLockRestore()` 在保护窗口内按旧基线恢复 → 页面表现为自动往上跑。

另一个 Tab 风险路径是：空闲 `Tab` 找到按钮并触发 click → ChatGPT 未开始 conversation 请求 → 如果仍返回成功，用户输入会被这次快捷键吞掉。

**分叉点**：`content/chatgpt-quicknav.js:8466` 与 `content/chatgpt-tab-queue/main.js:3132`。

## 3. 根因

**根因类型**：state-pollution / missing-guard

**根因描述**：QuickNav 的发送保护窗口是为了拦截 ChatGPT 自动跳底，但用户发起发送本身也是一个“当前视口应被保留”的明确意图。旧实现没有区分用户发起发送和程序化恢复阶段，导致旧 `stablePos` 在部分时序中污染新的保护基线。Tab Queue 侧还需要保证直发点击真的被 ChatGPT 接收，否则必须回退到队列发送路径。

**是否有多个根因**：是。主因是用户发起发送时复用旧基线；次因是 anchor fallback 没有基线下限；Tab 直发还需要显式确认 / 回退保护。

## 4. 影响面

- **影响范围**：ChatGPT QuickNav 自动滚动锁，尤其是长对话中段发送 / Tab Queue 发送保护窗口。
- **潜在受害模块**：Tab Queue、Cmd+Enter Send、QuickNav scroll guard。
- **数据完整性风险**：无，属于视口状态问题。
- **严重程度复核**：维持 P1，因为它影响 ChatGPT 主工作流的可用性和体感稳定性。

## 5. 修复方案

### 方案 A：用户发起发送时改用当前视口基线
- **做什么**：识别 `keydown`、send button click、direct Tab before-click、queue enqueue 等用户触发保护原因，基线使用当前 `scrollTop`。
- **优点**：改动小，直接修正状态污染源。
- **缺点 / 风险**：如果误把真正的程序化跳底识别成用户发起，可能少拦一次跳底。
- **影响面**：只动 QuickNav scroll lock。

### 方案 B：完全移除 anchor fallback
- **做什么**：只按绝对 `scrollTop` 基线恢复。
- **优点**：更简单，不会被锚点过度恢复。
- **缺点 / 风险**：长回复布局变化时更容易出现绝对位置漂移。
- **影响面**：降低 4.0.22 针对长对话漂移的保护。

### 推荐方案

**推荐方案 A**，同时给 anchor fallback 加基线下限。这样保留 4.0.22 的长对话锚点能力，但阻止它越过锁定基线向上恢复。
