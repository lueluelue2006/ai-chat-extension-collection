# QuickNav MV3 深读（仓库：QuickNav-MV3_副本）

本文基于 `manifest.json` 显示的扩展版本 `1.2.8`，并以 **Chrome Extension MV3** 的运行模型为前提整理（生成时间：2026-01-29）。

> 重点文件入口（建议从这里开始读）：  
> - `manifest.json`（MV3 入口）  
> - `content/bootstrap.js`（document_start 唤醒后台 SW）  
> - `background/sw.js`（动态注册 content scripts + 设置读写 + reinject）  
> - `shared/registry.js`（站点/模块元数据；Options/Popup 的“单一真相”）  
> - `shared/injections.js`（每个模块的注入定义；SW 的“单一真相”）

---

## 1) 项目是什么

这是一个“AI Chat 扩展合集”，对多个站点（ChatGPT/Gemini/DeepSeek/Qwen/Z.ai/Grok/Genspark/文心一言）注入一组脚本，核心是 **QuickNav**（紧凑导航 + 实时定位 + 📌标记点 + 收藏夹 + 防自动滚动 + 快捷键），并集成了若干站点增强模块（性能优化、用量统计、导出对话、Split View、各种 UI 修复等）。

它的工程化特点是：

- **不用打包器**（纯 JS 文件），通过 MV3 的 `chrome.scripting.registerContentScripts()` 动态注册/更新注入规则。
- **“注册表 + 注入表”双表驱动**：`shared/registry.js` 管“有什么模块/给 UI 用”；`shared/injections.js` 管“怎么注入/给 SW 用”。

---

## 2) 源数据：`shared/registry.js` + `shared/injections.js`

### `shared/registry.js`（给 UI/文档/开发脚本）

- `REGISTRY.sites[]`：每个站点：`{id, name, sub, matchPatterns, quicknavPatterns?, modules[]}`  
  - `matchPatterns` 是“站点总体可注入”的 URL patterns  
  - `quicknavPatterns`（可选）用于 **QuickNav 只在子路径启用**（例如 Genspark 只在 `/agents*`）
- `REGISTRY.modules{}`：每个模块的元数据：`name/sub/authors/license/upstream/hotkeys/menuPreview/defaultEnabled`

### `shared/injections.js`（给后台 SW 动态注册 content scripts）

核心导出是 `globalThis.QUICKNAV_INJECTIONS`：

- `buildDefaultSettings(registry)`：根据 registry 生成默认设置结构（见下一节）。
- `buildContentScriptDefs(registry)`：生成**每个模块对应的注册项**：  
  - `id/siteId/moduleId/matches/js/css/runAt/world/allFrames`
- 一些全局常量：
  - `MAIN_GUARD_FILE = 'content/scroll-guard-main.js'`（MAIN world 滚动拦截器）
  - `EXTRA_HOST_PERMISSIONS = ['https://cdn.openai.com/*']`（后台任务额外需要的 host 权限）
  - `EXTRA_SITE_MODULE_FLAGS`（“不是模块但要进 settings.siteModules” 的布尔开关；例如 ChatGPT thinking-toggle 的两个热键开关）

> 结论：想“新增/改站点或模块”，大概率只需要改 `shared/registry.js` + `shared/injections.js`，然后跑 dev 脚本同步 `manifest.json` 和文档（第 9 节）。

---

## 3) 设置模型（Settings）

后台 SW 把设置存储在 `chrome.storage.local` 的 `quicknav_settings` 下（键名在 `background/sw.js` 的 `SETTINGS_KEY`）。

设置对象结构（由 `buildDefaultSettings()` 决定）：

- `enabled: boolean`：总开关（所有模块）
- `sites: Record<siteId, boolean>`：站点级开关
- `scrollLockDefaults: Record<siteId, boolean>`：各站点默认的 scroll-lock 策略（主要在 Options 里管理）
- `siteModules: Record<siteId, Record<moduleIdOrExtraFlag, boolean>>`：模块/额外 flag 开关

**Patch 模型**：Popup/Options 常用 `QUICKNAV_PATCH_SETTINGS`（增量）：

- patch 是一个数组，元素形如 `{ op:'set', path:[...], value:boolean }`
- SW 只接受白名单路径：`enabled` / `sites.<siteId>` / `scrollLockDefaults.<siteId>` / `siteModules.<siteId>.<moduleKey>`

安全边界（很关键）：

- SW 对 `SET/PATCH/RESET/REINJECT` 强制 `sender.url` 必须来自扩展页面（Options/Popup），普通网页内容脚本不能直接改设置。

---

## 4) 注入与启动流程（MV3）

### 静态注入：`manifest.json` → `content/bootstrap.js`

- `manifest.json` 的 `content_scripts` 只注入一个非常轻量的 `content/bootstrap.js`（`run_at: document_start`）。
- `content/bootstrap.js` 只做一件事：`chrome.runtime.sendMessage({type:'QUICKNAV_BOOTSTRAP_PING', href})`，重试 3 次。

### 动态注入：`background/sw.js` 负责注册/更新所有模块

`background/sw.js` 的职责：

1) `importScripts('../shared/registry.js', '../shared/injections.js')` 读入“单一真相”。  
2) 构造 `DEFAULT_SETTINGS` / `CONTENT_SCRIPT_DEFS`。  
3) 根据设置过滤出“启用的 defs”，然后用 `chrome.scripting.registerContentScripts()` 注册。  
4) 在以下场景做 reinject（主要用于开发时点“重新加载扩展”后立刻在已打开页面生效）：  
   - `chrome.runtime.onInstalled`：注册 + 重新注入匹配 tab  
   - Options 点击“重新注入已打开页面”  
5) 收到 `QUICKNAV_BOOTSTRAP_PING`：主要做“保持注册最新”，并只在必要时对当前 tab 做最小量注入（避免双重注入）。

一个重要的细节：

- ChatGPT 的 Split View 开启时，会把部分模块改成 `allFrames: true` 注入（只对一小部分模块启用），以便在 iframe 内也能工作。

---

## 5) 扩展 Popup 菜单（menu-bridge）

项目把“用户脚本的 GM 菜单”做成了扩展 popup 的按钮列表：

- `content/menu-bridge.js` 在页面侧暴露 `window.__quicknavRegisterMenuCommand(name, fn)`  
  - 内部会根据调用栈把命令分组（QuickNav / 用量统计 / Split View / 导出对话等）
- Popup 用 `chrome.tabs.sendMessage` 发：  
  - `QUICKNAV_GET_MENU`：拿到 `{href, commands[]}`  
  - `QUICKNAV_RUN_MENU`：执行某个 `id`

跨 world（MAIN world 模块）桥接：

- MAIN world 脚本无法直接共享 `fn` 引用给 isolated world，所以 `menu-bridge.js` 支持通过 `CustomEvent` 注册/执行 MAIN world handler。  
  - 为降低页面伪造风险，有严格 allowlist（目前主要给 “ChatGPT 用量统计”）。

---

## 6) “系统化桥接”：QuickNav Bridge（ISOLATED / MAIN）

为减少“每个脚本各自实现一套轮询/事件”的碎片化，本仓库增加了一个非常轻量的共享桥接层：

- `content/quicknav-bridge.js`：运行在 **ISOLATED world**（content script 默认 world），提供：
  - 小型事件总线 `on/emit`
  - route change 信号（优先消费 `content/scroll-guard-main.js` 发出的 `QUICKNAV_ROUTE_CHANGE`，否则低频轮询）
  - best-effort 的 `getSettings()`（通过 `QUICKNAV_GET_SETTINGS` 向 SW 读取并带短缓存）
- `content/quicknav-bridge-main.js`：运行在 **MAIN world**，提供：
  - 小型事件总线 `on/emit`
  - route change 信号（消费 `QUICKNAV_ROUTE_CHANGE` + 低频轮询兜底）

当前已开始迁移的模块示例：

- `content/chatgpt-message-tree/main.js`：优先订阅 MAIN bridge 的 `routeChange`，替代自身的 800ms href 轮询（bridge 不可用时保持原逻辑）。
- `content/chatgpt-perf/content.js`：订阅 ISOLATED bridge 的 `routeChange`，在 SPA 导航后更快重挂载虚拟化；同时保留一个更慢的轮询兜底。

---

## 6.5) ChatGPT Core（站点内核：统一 selector/动作/route 生命周期）

为进一步减少 ChatGPT 相关脚本的重复（composer/turns/send/stop/route），仓库增加了一个 ChatGPT 专用的轻量 core：

- `content/chatgpt-core.js`：运行在 **ISOLATED world**
- `content/chatgpt-core-main.js`：运行在 **MAIN world**

两者 API 语义一致（按 world 分离，避免互相污染），当前提供：

- `getRoute()`：获取 `{href, pathname, conversationId, isConversation/isShare/isHome}`
- `getConversationIdFromUrl(url)`：支持 `/c/<id>` 与 `/share/<id>`
- composer：
  - `getEditorEl()`：优先返回 `.ProseMirror[contenteditable=true]`（兼容 textarea fallback）
  - `getComposerForm(editorEl)`：从 editor 回溯 form
  - `findSendButton(editorEl)` / `findStopButton(editorEl)`
  - `isGenerating(editorEl)` / `clickSendButton(editorEl)` / `clickStopButton(editorEl)`
- turns：
  - `getTurnsRoot()`：优先返回 `[data-testid="conversation-turns"]`
  - `getTurnArticles(root?)`：返回 `article[data-testid^="conversation-turn-"]`
- `onRouteChange(cb)`：优先订阅 QuickNav Bridge 的 `routeChange`，否则低频轮询兜底

注入顺序（很重要）：

- 在 `shared/injections.js` 中对 `siteId === 'chatgpt'` 的模块，已把 `chatgpt-core*.js` 放在各模块脚本之前，保证“后来的脚本可以直接用 core”。

---

## 7) 防自动滚动：isolated + MAIN world 双层拦截

这一块是整个项目“工程化程度最高”的部分之一。

### isolated world（例如 `content/chatgpt-quicknav.js`）

QuickNav 自己维护“用户视角的基准 scrollTop”（`scrollLockStablePos`），并在检测到 drift 后把滚动拉回。

为了能拦截“页面脚本驱动的 autoscroll”（MAIN world）：

- 通过 `chrome.runtime.sendMessage({type:'QUICKNAV_ENSURE_SCROLL_GUARD'})` 请求 SW 在 MAIN world 注入 `content/scroll-guard-main.js`。

并通过两条通道把状态同步给 MAIN guard：

- `document.documentElement.dataset`（同步可读、低延迟）：  
  - `dataset.quicknavScrollLockEnabled`  
  - `dataset.quicknavAllowScrollUntil`（短窗口放行 programmatic scroll；例如点击导航跳转时）  
  - `dataset.quicknavScrollLockBaseline`
- `window.postMessage`（用于“状态变更通知”）：  
  - `QUICKNAV_SCROLLLOCK_STATE / BASELINE / ALLOW`

### MAIN world：`content/scroll-guard-main.js`

它会 patch `scrollIntoView/scrollTo/scrollBy/scrollTop setter` 等，并结合 dataset 的 allow window 做拦截；另外还做了一个副产物：

- 通过 hook `history.pushState/replaceState + popstate/hashchange` 广播 SPA 路由变化：`postMessage({type:'QUICKNAV_ROUTE_CHANGE'})`，让 isolated 脚本不用紧密轮询也能感知换路由。

---

## 8) 核心模块：ChatGPT QuickNav（`content/chatgpt-quicknav.js`）

这是一份非常大的单文件脚本（来自 userscript 上游再做 MV3 适配）。你可以用这些“锚点”快速理解：

- 面板 DOM：`#cgpt-compact-nav`（样式：`#cgpt-compact-nav-style`）
- 存储命名空间：`cgpt-quicknav:*`  
  - `cgpt-quicknav:nav-width` / `cgpt-quicknav:nav-pos`  
  - `cgpt-quicknav:scroll-lock`  
  - `cgpt-quicknav:cp:${location.pathname}`（📌检查点）  
  - `cgpt-quicknav:fav:${location.pathname}` / `cgpt-quicknav:fav-filter:${location.pathname}`（收藏与过滤）
- 菜单命令（Popup 可见）：  
  - “重置问题栏位置 / 清理过期检查点 / 清理无效收藏”
- 热键：`⌘↑/⌘↓`、`⌥↑/⌥↓`、`⌥/` 等（绑定在 `document keydown`）
- 与“消息树模块”交互：`QUICKNAV_CHATGPT_TREE_*`（通过 `postMessage` 走桥接）
- 📌交互：`Alt/Option + click` 在消息附近打 pin，并默认加入收藏

---

## 9) Split View（ChatGPT 拆分视图）

模块文件：

- `content/chatgpt-split-view/main.js`（主页面 UI + iframe 管理）
- `content/chatgpt-split-view/iframe-hotkeys.js`（注入到 iframe 内；处理 Esc×3 与部分拦截热键）

核心点：

- 右侧 iframe id 固定：`qn-split-iframe`
- 右侧宽度：CSS 变量 `--qn-split-right-width`；`html` 上 class `qn-split-open` 表示开启
- 存储在 **chatgpt.com 的 localStorage**（非 chrome.storage）：  
  - `chatgpt-split-view:open` / `chatgpt-split-view:rightWidthPx` / `chatgpt-split-view:src` 等
- 与 QuickNav 的配合：`content/ui-pos-drag.js` 有 `splitAware` 逻辑，避免拖拽位置在分屏开关时“坐标漂移”

---

## 10) 用量统计（ChatGPT usage monitor）

模块文件：

- `content/chatgpt-usage-monitor/main.js`（MAIN world：抓取/面板/UI）
- `content/chatgpt-usage-monitor/bridge.js`（isolated：把菜单/设置桥接进来）
- 依赖：`content/chatgpt-fetch-hub/main.js`（统一 fetch hook，避免多个模块重复 patch）

它的做法：

- 通过 fetch-hub（优先）拦截 `POST /backend-api/(f/)?conversation`，从最终 payload / cookie 推断 model，并用“时间戳列表”来统计窗口内用量。
- 导入/导出是 JSON 下载/上传。
- 菜单命令通过 `bridge.js` 注册（Popup 可见），执行时用 `CustomEvent` 通知 MAIN world 执行对应动作。
- 重要存储：localStorage 前缀 `__aichat_gm_chatgpt_usage_monitor__:`（主数据在 `...:usageData`）。

---

## 11) Dev 脚本与维护流程

项目自带 3 个维护脚本（Node 直接运行，无需打包器）：

1) `node dev/sync-manifest.js`  
   - 从 `registry/injections` 同步 `manifest.json.host_permissions` 与 `content/bootstrap.js` 那条 content_scripts 的 `matches`。
2) `node dev/gen-scripts-inventory.js`  
   - 根据 `registry/injections` 生成 `docs/scripts-inventory.md`（站点/模块/注入细节清单）。
3) `node dev/check.js`  
   - 语法检查 + 一致性校验；若发现 manifest mismatch 会提示跑 `dev/sync-manifest.js`。

推荐改动后顺序：

- 改 `shared/registry.js` / `shared/injections.js`  
- 跑 `node dev/sync-manifest.js` → `node dev/gen-scripts-inventory.js` → `node dev/check.js`
