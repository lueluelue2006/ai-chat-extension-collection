# Kimi Scroll-Lock Parity（与 ChatGPT/Qwen 同口径）

> 更新日期：2026-02-19
> 适用版本：v1.3.87

## 1. 目标与范围

- 仅修复 **Kimi** 的 scroll-lock 失效问题。
- 不改变 ChatGPT/Qwen 既有语义。
- 对齐目标：Kimi 的 scroll-lock 协议、握手、运行态行为与 ChatGPT/Qwen 一致。

## 2. 差异矩阵（修复前 -> 修复后）

| 项目 | ChatGPT/Qwen（基线） | Kimi 修复前 | Kimi 修复后 |
| --- | --- | --- | --- |
| postMessage 信封 | `__quicknav + channel + v + nonce + type` | 仅 `__quicknav + type` | 与基线一致 |
| nonce 来源 | `documentElement.dataset.quicknavBridgeNonceV1` | 无 | 与基线一致 |
| lock state 同步 | dataset + bridge message | bridge 裸消息（guard 可丢弃） | dataset + bridge message |
| baseline 同步 | bridge `QUICKNAV_SCROLLLOCK_BASELINE` | 裸消息 | bridge 信封 |
| allow-window 同步 | bridge `QUICKNAV_SCROLLLOCK_ALLOW` | 裸消息 | bridge 信封 |
| READY 握手 | `readBridgeMessage(..., READY_TYPES)` | 仅按 `type` 粗匹配 | 统一走 `readBridgeMessage` |
| Kimi 对话 scroller 识别 | 命中真实消息容器并标记 | 可能回退到 `documentElement`（误标记） | 优先命中 `.chat-detail-main` / 同类容器 |

## 3. 代码变更

- `content/kimi-quicknav.js`
  - 新增 bridge 契约：`BRIDGE_CHANNEL / BRIDGE_V / BRIDGE_NONCE`。
  - 新增 `postBridgeMessage` 与 `readBridgeMessage`。
  - `QUICKNAV_SCROLLLOCK_STATE/BASELINE/ALLOW` 改为带信封发送。
  - `bindMainWorldScrollGuardHandshake` 改为协议校验后再响应 READY。
  - `getChatScrollContainer` 与 `getScrollRoot` 增加 Kimi 新版容器优先级（`.chat-detail-main`）。
- `content/scroll-guard-main.js`
  - 在 `detectChatScrollerFallback` 增加 Kimi 专项 scroller 识别分支（优先命中 `.chat-detail-main`），避免 marker 回退到 `documentElement`。
- `dev/test-kimi-scroll-lock-bridge.js`
  - 新增 Kimi scroll-lock 协议回归测试（静态结构检查）。
- `dev/check.js`
  - 将 `dev/test-kimi-scroll-lock-bridge.js` 纳入 dev self-tests。
- `dev/scroll-tests/kimi-scroll-lock-smoke.js`
  - 新增 Kimi 专项浏览器烟测入口（lock 信号一致性、scroller-marker 一致性、allow-window、路由切换保真）。

## 4. 验证口径（必须项）

1. 终端校验：`node dev/check.js`、`npm test`、`npm run typecheck`、`npm run build`。
2. 浏览器实测（Chrome DevTools MCP）：
   - `https://kimi.com/*` 与 `https://www.kimi.com/*`
   - 锁开/锁关
   - 用户手动滚动放行
   - QuickNav 跳转 allow-window 放行 + 自动回收
   - 路由切换后锁状态一致
3. 回归：ChatGPT/Qwen scroll-lock 基线不退化。

## 5. 证据索引

- 协议回归测试：`dev/test-kimi-scroll-lock-bridge.js`
- Kimi 浏览器烟测脚本：`dev/scroll-tests/kimi-scroll-lock-smoke.js`
- 共性 guard 烟测脚本：`dev/scroll-tests/chatgpt-scroll-lock-smoke.js`
- Qwen 烟测脚本：`dev/scroll-tests/qwen-scroll-lock-smoke.js`

## 6. 本次实测结果（2026-02-19，Chrome DevTools MCP）

### 6.1 终端校验结果

- `node dev/check.js`：通过（含新增 `dev/test-kimi-scroll-lock-bridge.js`）
- `npm test`：通过
- `npm run typecheck`：通过
- `npm run build`：通过（`dist` 已镜像完成）

### 6.2 扩展重载与版本

- `chrome://extensions/?id=mcmanbmincmbgieimlngimndkbcdakbc`
  - 版本显示：`1.3.87`
  - 点击“重新加载”后出现提示：`已重新加载`

### 6.3 Kimi（www.kimi.com）主验证

- 协议握手严格性（READY 事件）：
  - 旧格式（仅 `__quicknav + type`）响应数：`0`
  - 新格式（`channel/v/nonce`）响应数：`2+`
- scroller marker：
  - `data-quicknav-scrolllock-scroller="1"` 命中 `div.chat-detail-main`（不再是 `html`）
  - 示例：`max scroll range = 1387`
- 锁行为（基线写入后）：
  - 锁开：`scrollTop/scrollTo/scrollBy` 向下尝试位移 `0`（被拦截）
  - 锁关：同样尝试可下移（示例下移 `832`）
- allow-window：
  - 点击 QuickNav “下一条”后 `quicknavAllowScrollUntil` 变为未来时间戳（打开成功）
  - 窗口内可下移（示例 `+83`）
  - 窗口结束后再次恢复拦截（位移 `0`）
- 路由切换：
  - `/chat/... -> /`（New Chat）后 `dataset.quicknavScrollLockEnabled` 保持 `1`

### 6.4 kimi.com 域名入口验证

- 直接访问 `https://kimi.com/chat/...` 会规范化到 `https://www.kimi.com/chat/...`（线上站点 canonical 行为）。
- 规范化后的页面复测结果与 6.3 一致（READY 严格握手：旧格式 `0`、新格式 `2+`）。
- 另有自动化配置覆盖：`dev/test-kimi-injection-routing.js` 已验证注入匹配同时包含 `https://kimi.com/*` 与 `https://www.kimi.com/*`。

### 6.5 ChatGPT/Qwen 回归

- ChatGPT（`https://chatgpt.com/`）：
  - READY 旧格式响应 `0`，新格式响应 `2`
- Qwen（`https://chat.qwen.ai/c/...`）：
  - READY 旧格式响应 `0`，新格式响应 `2`
- 结论：本次 Kimi 修复未引入 ChatGPT/Qwen scroll-lock 协议回退。
