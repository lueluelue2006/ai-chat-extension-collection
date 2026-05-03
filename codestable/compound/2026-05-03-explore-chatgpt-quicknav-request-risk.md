---
doc_type: explore
type: question
status: active
date: 2026-05-03
tags: [chatgpt, quicknav, network, request-safety]
---

# ChatGPT QuickNav Request Risk

## 速答

ChatGPT QuickNav 本体不会主动发 `fetch` / `XMLHttpRequest` / `sendBeacon`，也不请求 `/backend-api`。面板里出现 “检测中…” 是路由/DOM hydration 恢复状态，来自本地 DOM 扫描与计时器，不是网络请求。

另一个不同层面的风险是被 ChatGPT 自己的前端 telemetry 看到“页面上存在一个扩展 UI”。QuickNav 当前把面板作为普通 DOM 插入 `document.body`，且公开 id/class 较直白（例如 `#cgpt-compact-nav`）。因此如果站点前端遥测采集全局 click target、DOM mutation、DOM path 或错误上下文，理论上可能看到这些节点。当前抽检的官方 telemetry body 未观察到 QuickNav 标识，但这只能说明本次样本未命中，不能证明未来或所有事件都不会采集。

需要区分的边界是 Conversation Tree：QuickNav 的 🌳 按钮会通过 `postMessage` 和 Tree 脚本通信。只有用户激活过树摘要/树面板后，Tree 脚本可能为了构建或刷新树数据请求 `/api/auth/session` 与 `/backend-api/conversation/:id`。这不是 QuickNav 的 “Detecting” 文案来源，但属于 QuickNav 面板上的树入口间接触达的功能。

## 关键证据

- `content/chatgpt-quicknav.js:1801` — “检测中…” 只在 `isRouteRecoveryActive()` 时作为空列表文案显示。
- `content/chatgpt-quicknav.js:2751` — route recovery 用本地 `setInterval` 观察 DOM hydration，间隔为 `CHAT_ROUTE_LOADING_POLL_MS`，没有网络调用。
- `content/chatgpt-quicknav.js:2559` — QuickNav 刷新是 `refreshIndex()` 本地重建索引，受性能压力降频。
- `content/chatgpt-quicknav.js:7605` — scroll guard 通过扩展 runtime / main-world bridge 注入与同步，属于扩展内部消息，不是站点网络请求。
- `content/chatgpt-quicknav.js:2326` — QuickNav 请求 tree summary 时只发 `postBridgeMessage()`，自身不 fetch。
- `content/chatgpt-quicknav.js:4392` — QuickNav 面板以普通 DOM `div#cgpt-compact-nav` 注入 `document.body`，站点脚本理论上可观察到 host 节点。
- `content/chatgpt-quicknav.js:7017` — 多个 QuickNav 控件 click handler 没有统一在面板根部做 capture/bubble 隔离，站点已有的全局捕获监听理论上可能先看到 click 事件。
- `content/chatgpt-message-tree/main.js:2066` — Tree 收到 summary 请求且缓存不可用时会 `refreshConversation('bridge')`。
- `content/chatgpt-message-tree/main.js:2667` — Tree 的 `refreshConversation()` 会调用 `fetchConversation(conversationId)`。
- `scripts/verify.js:1207` — verify 明确禁止 Tab Queue 重新引入 `/stream_status` 主动轮询，项目已有请求风险防线。

## 实测观察

CDP 在当前 ChatGPT 会话页查看 XHR/fetch，请求主要是 ChatGPT 自身的 `ces/v1/*` telemetry、`backend-api/sentinel/*` ping/heartbeat、正常 conversation/prepare 等。等待约 12 秒后新增请求仍为这些 ChatGPT 官方路径；未观察到 QuickNav 自身产生的独立后台轮询请求。

额外抽检一次 QuickNav toggle 点击后的官方 telemetry 请求体，样本中未看到 `quicknav`、`cgpt-compact-nav` 或 `compact-*` 这类标识；但该会话当时仍在生成/收尾，官方 telemetry 噪声较大，因此该结论只作为“未观察到明显泄露”的低强度证据。

## 结论

当前 “Detecting/检测中” 不代表请求。QuickNav 网络风控风险低；真正要留意的是 Tree/Export/Mapping 这类需要读取完整会话 JSON 的功能，它们应继续保持用户触发、缓存复用、生成中延迟刷新。

如果要继续降低 telemetry 可见性，优先方向不是减少请求，而是做 UI 隔离：把 QuickNav 面板迁到 closed Shadow DOM / 中性 host，统一拦截面板内部 pointer/click 事件，减少公开 id/class 和事件路径暴露。
