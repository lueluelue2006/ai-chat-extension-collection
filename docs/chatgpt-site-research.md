# ChatGPT 官网（chatgpt.com）脚本接入点研究报告（MCP 实测）

生成时间：2026-01-29  
数据来源：Chrome DevTools MCP 在已登录的 `chatgpt.com` 页面实测（仅收集结构/选择器/端点形态，不记录对话内容）。

---

## 1) 站点形态总览（对扩展脚本最重要的部分）

### SPA 路由（核心）

ChatGPT 是典型 SPA：页面内 `history.pushState/replaceState` 切换路由，DOM 会被整段替换或重水合。

常见路径形态（只写 pattern）：

- `/`：Home / New chat
- `/c/<conversation_id>`：对话页（QuickNav 主要目标）
- `/share/<share_id>`：分享页（只读）
- `/gpts` / `/gpts/<...>` / `/apps` / `/library` / `/codex`：侧栏入口（是否需要注入取决于模块）

对扩展而言，“路由变化”比 `DOMContentLoaded` 更关键：脚本需要在 route change 后重新发现容器、重绑 observer、重建索引。

### 关键 UI 区域（DOM anchor）

1) **左侧 Chat history sidebar**  
   - 可用锚点：`nav[aria-label="Chat history"]`，以及常见的 sidebar 容器 `#stage-slideover-sidebar`（会随 UI 版本变化）
2) **顶部 header / Model selector**  
   - 实测存在：`button[data-testid="model-switcher-dropdown-button"]`  
   - `aria-label` 里包含“Model selector, current model is …”
3) **对话内容（turns/messages）**  
   - 实测 turn 节点：`article[data-testid^="conversation-turn-"]`  
   - 实测 role：`data-turn="user"|"assistant"`  
   - 还有稳定的 id 类属性：`data-turn-id`，以及某些节点/后代上存在 `data-message-id`
4) **输入框/编辑器（composer）**
   - 实测同时存在：
     - `textarea[name="prompt-textarea"]`（通常是隐藏/辅助层）
     - `.ProseMirror[contenteditable="true"]`（实际编辑器，React/ProseMirror）
   - **发送按钮并非一直存在**：在编辑器为空时可能不渲染；当插入文本后出现：  
     - `button[data-testid="send-button"]`，且实测同时拥有 `id="composer-submit-button"` 与 `aria-label="Send prompt"`

---

## 2) 对扩展脚本的“稳定接入点”（优先级从高到低）

### A. Turn 结构：`article[data-testid^="conversation-turn-"]`

适用模块：QuickNav（索引/定位/高亮）、导出、消息树定位、性能虚拟化等。

建议策略：

- **首选** `article[data-testid^="conversation-turn-"]`（目前最稳）
- 只在极端情况下 fallback 到更宽的选择器（例如 `[data-message-id]` / `[data-message-author-role]`），并把 fallback 包装为“慢路径”

### B. Composer：ProseMirror + textarea 的双层结构

适用模块：Cmd+Enter、快捷前缀插入、编辑/分叉、上传修复等。

建议策略：

- **写入/插入文本**：优先对 `.ProseMirror[contenteditable=true]` 操作（`execCommand('insertText')` 或触发 input/beforeinput）
- **找 form/按钮**：从 ProseMirror `closest('form')` 回溯，再找 `send/stop` 按钮
- **重要**：send/stop 按钮是“状态型渲染”，需要以“存在性”判断流式/可发送状态

### C. 路由变化：避免每个脚本各自 setInterval 轮询

适用模块：几乎所有 ChatGPT 注入脚本。

推荐接入：

- 如果 `content/scroll-guard-main.js` 在 MAIN world 存在，它会广播：  
  - `window.postMessage({ __quicknav:1, type:'QUICKNAV_ROUTE_CHANGE', href, reason })`
- 以此为基础，建立扩展内的统一“routeChange 事件源”（避免每个模块都 `setInterval(()=>location.href!==lastHref)`）。

---

## 3) 网络与接口（只写端点“形态”，不记录 token/参数）

从 MCP 网络面板实测（页面加载/进入对话时）可见的关键端点类型：

- `/backend-api/me`、`/backend-api/settings/user`：用户/设置
- `/backend-api/sentinel/chat-requirements/prepare`：发送前的约束/准备
- `/backend-api/conversation/<conversation_id>/...`：对话相关数据（某些功能会用到 textdocs 等子资源）
- `realtime.chatgpt.com/...`：实时/状态（与语音、在线状态、推送等有关）

对扩展的含义：

- **用量统计/抓模型**：优先通过拦截 `POST /backend-api/(f/)?conversation` 的 payload（本仓库已有 `chatgpt-fetch-hub`）
- **导出/消息树**：需要对话结构数据时，通常要 fetch `/backend-api/conversation/<id>`（要考虑 auth header/cookie）

---

## 4) 本仓库在 ChatGPT 上的现状（MCP 观测）

在 `chatgpt.com` 页面中已确认扩展 UI 出现（QuickNav 面板存在），并且在对话页能够扫描出 turn 列表（`.compact-item` 数量与 `article[data-testid^=conversation-turn-]` 数量一致）。

另外，已实测：

- 插入文本后出现发送按钮：`button[data-testid="send-button"]#composer-submit-button[aria-label="Send prompt"]`
- Model selector 存在：`button[data-testid="model-switcher-dropdown-button"]`

---

## 5) 深度整合建议（下一步代码改造方向）

用户侧事实：你说“用户几乎只用 ChatGPT”，所以收益最大的是把 ChatGPT 的共性问题做成“可复用内核”，让脚本从“拼盘”变成“一个系统”。

建议分层：

1) **QuickNav Bridge（全站通用）**：统一事件总线 + routeChange（已在仓库实现：`content/quicknav-bridge.js` / `content/quicknav-bridge-main.js`）  
2) **ChatGPT Core（站点专用）**：统一 selector/容器发现/route 生命周期/常用动作（已在仓库实现：`content/chatgpt-core.js` / `content/chatgpt-core-main.js`）  
3) 各模块逐步迁移到 core：减少重复轮询、减少脆弱选择器、减少跨 world “各自实现一套”

补充：为控制对 ChatGPT 页面的额外负担，建议用 MCP 验证时尽量避免对长对话页面做全量 DOM snapshot（代价很高），优先用小范围 `evaluate_script` + 短生命周期新标签页做 smoke test。
