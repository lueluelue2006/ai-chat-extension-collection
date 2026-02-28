# AI捷径 (AI Shortcuts) MV3 架构与模块深读

> 本文是本仓库唯一需要**手工维护**的架构文档（canonical）。  
> - 站点/模块/注入清单：`docs/scripts-inventory.md`（自动生成，勿手改；跑 `node dev/gen-scripts-inventory.js` 更新）  
> - 站点行为研究：`docs/chatgpt-site-research.md`（偏研究/经验，不追求完整性）
> - Grok QuickNav 锁协议对齐：`docs/grok-scroll-lock-parity.md`
>
> 重点文件入口（建议从这里开始读）：  
> - `manifest.source.json`（源码侧 Manifest 模板，build 后输出到 `dist/manifest.json`）  
> - `content/bootstrap.js`（document_start 唤醒后台 SW + 兜底注入）  
> - `background/sw.js` + `background/sw/*.ts`（`sw.js` 只做装配；模块负责注册/设置/监控/重置/路由）  
> - `shared/registry.ts`（站点/模块元数据；Popup/Options 的“单一真相”）  
> - `shared/injections.ts`（注入定义；SW 的“单一真相”）

本文以 `manifest.source.json`（以及构建产物 `dist/manifest.json`）当前内容为准，假设读者了解 Chrome Extension MV3（Service Worker / content scripts / MAIN vs ISOLATED world）。

## TL;DR（一句话）

这是一个 **MV3 脚本平台（当前范围 ChatGPT + Qwen + Kimi + DeepSeek + Gemini App + 文心一言 + Z.ai + Grok + Genspark）**：核心是 **注册表驱动 + 动态注入 + 跨 world 桥接 + 可视化配置（Popup/Options）**。

## 规模与热点（可复现）

当前规模（由 `shared/registry.ts` + `shared/injections.ts` 实际计算得到；可跑 `node dev/stats.js` 复现）：

- 站点：10（含 `common`）
- 模块：26
- 注入定义：53（MAIN 19 / ISOLATED 34）

代码热点（`wc -l` 口径，仅用于“哪里复杂/容易出问题”，会随提交变化）：

- `content/chatgpt-quicknav.js`（约 5886 行）
- `content/chatgpt-usage-monitor/main.js`（约 5226 行）
- `content/chatgpt-message-tree/main.js`（约 2430 行）
- `options/options.js`（约 3325 行）
- `background/sw/router.ts`（约 191 行）

---

## 1) 项目定位：ChatGPT + Qwen + Kimi + DeepSeek + Gemini App + 文心一言 + Z.ai + Grok + Genspark 的 MV3 脚本平台

当前交付策略是“ChatGPT 主线 + 多站点统一内核能力 + 可扩展骨架保留”的脚本平台：

- **当前范围**：生产支持 `chatgpt.com`、`chat.qwen.ai`、`kimi.com`/`www.kimi.com`、`chat.deepseek.com`、`gemini.google.com`（QuickNav 仅 `/app*`）、`ernie.baidu.com`、`chat.z.ai`、`grok.com` 与 `www.genspark.ai`（Genspark QuickNav 仅在 `/agents*`）。
- **多模块**：模块仍以 ChatGPT 为主；Qwen/Kimi/DeepSeek/Gemini App/文心一言/Z.ai/Grok 已纳入 QuickNav + Cmd/Ctrl+Enter 一致行为面，并补齐首屏模型预设（Qwen 首次进站优先 Thinking、Gemini App 首次进站优先 Pro、Ernie 首次进站优先 ERNIE 5.0）；Genspark 已恢复 QuickNav + Cmd/Ctrl+Enter 与 5 个站点特化模块（绘图默认设置、积分余量、长代码块折叠、消息编辑上传修复、Sonnet 4.5 Thinking）。
- **工程化目标**：尽量减少静态注入与重复 patch（尤其是 fetch、MutationObserver、滚动相关），通过“单一真相 + 桥接层 + 动态注入”把复杂度收敛到少数核心文件。

---

## 2) 单一真相：`shared/registry.ts` + `shared/injections.ts`

运行时仍加载 `dist/shared/registry.js` 与 `dist/shared/injections.js`；两者由 mirror build 从上述 TS 源一对一转译得到。

### `shared/registry.ts`（站点/模块元数据：给 UI/文档/维护脚本）

- `SITES`：每个站点 `{id, name, sub, matchPatterns, quicknavPatterns?, modules[]}`
  - `matchPatterns`：站点总体可注入的 URL patterns
  - `quicknavPatterns`（可选）：QuickNav 只在子路径启用（例如只在某些 path 下启用）
- `MODULES`：每个模块的元数据：`name/sub/authors/license/upstream/hotkeys/menuPreview/defaultEnabled`

这份表是 Popup/Options 的“展示与默认值来源”，也是 `docs/scripts-inventory.md` 的生成来源。

### `shared/injections.ts`（注入定义：给后台 SW 动态注册 content scripts）

核心导出：`globalThis.AISHORTCUTS_INJECTIONS`：

- `buildDefaultSettings(registry)`：统一生成默认 Settings 结构
- `buildContentScriptDefs(registry)`：生成“内容脚本注册定义”（每条定义包含 `id/siteId/moduleId/matches/js/css/runAt/world/allFrames`）
- 关键常量：
  - `ISOLATED_BRIDGE_FILES = ['content/aishortcuts-scope.js', 'content/aishortcuts-bridge.js']`
  - `MAIN_BRIDGE_FILES = ['content/aishortcuts-scope-main.js', 'content/aishortcuts-bridge-main.js']`
  - `QUICKNAV_KERNEL_FILES = ['runtime-guards.js', 'route-watch.js', 'scrolllock-bridge.js', 'observer-refresh.js']`
  - `CHATGPT_FETCH_HUB_CONSUMER_FILES = ['chatgpt-fetch-hub/main.js', 'chatgpt-fetch-hub/consumer-base.js']`
  - `MAIN_GUARD_FILE = 'content/scroll-guard-main.js'`（MAIN world 滚动拦截器）
  - `EXTRA_HOST_PERMISSIONS`（后台任务额外需要的 host 权限）
  - `EXTRA_SITE_MODULE_FLAGS`（不是模块但要进入 `settings.siteModules` 的布尔开关）

QuickNav 当前注入顺序（核心口径）：

- ISOLATED：`aishortcuts-scope.js` -> `aishortcuts-bridge.js` ->（站点前置文件）-> `aishortcuts-kernel/*` -> 站点 `*-quicknav.js`
- MAIN（scroll guard）：`aishortcuts-scope-main.js` -> `aishortcuts-bridge-main.js` -> `scroll-guard-main.js`

结论：**新增/改站点或模块**，大概率只需要改 `shared/registry.ts` + `shared/injections.ts`，再跑维护脚本同步 `manifest.source.json` 与文档（见第 9 节）。

---

## 3) 启动与注入主链路（MV3）

### 3.1 静态入口极简：`manifest.source.json`（构建后为 `dist/manifest.json`）→ `content/bootstrap.js`

设计目标：让 Manifest 的 `content_scripts` 只负责“叫醒 SW + 兜底”，把所有真实功能都交给 SW 动态注册，降低静态注入成本与维护成本。

`content/bootstrap.js` 的职责有两条线：

- **PING**：`QUICKNAV_BOOTSTRAP_PING`（失败会重试 3 次）  
  - 目的：唤醒 SW，并让 SW 做一次“保持注册最新”（但避免每次都 reinject）
  - 优化点：`PING` 成功后也会立即补一轮 `ENSURE`，减少“已注册但当前 tab 未及时生效”的窗口期
- **ENSURE（兜底注入）**：`QUICKNAV_BOOTSTRAP_ENSURE`（快速 + 延迟多轮触发）  
  - 目的：处理 MV3 边缘情况（SW 重启、tab restore 等）导致“已注册脚本没跑起来”的场景  
  - 判断依据：默认仍以 `__aichat_quicknav_bridge_v1__` 为“已有脚本在跑”的哨兵；但在 **SPA 路由变化且 QuickNav 面板缺失** 时，会强制触发 ENSURE（用于覆盖 Grok 等站点从 `/` 进入 `/c/...` 的子路由注入场景）
  - 路由判定：按 `origin + pathname` 去抖（忽略 query 变化，避免 Grok `?rid=` 频繁变化导致重复 reinject）
  - 触发源：定时补偿 + `pageshow/popstate/hashchange/visibilitychange` + 慢轮询兜底

### 3.2 SW 负责动态注册/差异更新：`background/sw.js` + `background/sw/*.ts`

启动时（或每次 SW 被唤醒时）：

1) `background/sw.js` 读入两份“真相表”（运行时读取 dist 里的 JS 产物）：`importScripts('../shared/registry.js', '../shared/injections.js')`
2) `background/sw.js` 再按顺序加载 `./sw/chrome.js`、`storage.js`、`registration.js`、`monitors.js`、`reset.js`、`diag.js`、`router-handlers/{bootstrap,settings,gpt53,admin,memtest}.js`、`router.js`
3) 由 `storage.initConfig(...)` 完成默认设置/注入定义初始化，再由 `router.init()` 注册消息与生命周期监听器

动态注册仍是“差异更新”（diff update）而不是全量重灌（实现在 `background/sw/registration.ts`）：

- `applyContentScriptRegistration(settings)` 会把“已注册内容脚本”与“当前启用的 defs”做比较：  
  - 不再需要的：`unregisterContentScripts({ids})`  
  - 新增/配置变化的：`registerContentScripts([...])`
- 关键点：对 `matches/js/css/runAt/world/allFrames` 做标准化比较，避免因为顺序差异造成无意义的重注册

安装/启动策略分流（避免双重注入）：

- `onInstalled`：注册 + reinject（便于开发时点“重新加载扩展”立刻对已打开页面生效）
- `onStartup`：只保持注册，不强行 reinject（避免 session restore 双重注入）
- `QUICKNAV_BOOTSTRAP_PING`：优先 `applySettingsAndRegister`，只在必要时对 sender tab 做最小量注入（避免每次唤醒都 double-run）
- `QUICKNAV_BOOTSTRAP_ENSURE`：对 sender tab 注入“当前启用且 matches 命中”的 defs（兜底）

---

## 4) 配置与状态模型（核心）

Settings 存储在 `chrome.storage.local` 的 `quicknav_settings`（键名在 `background/sw/storage.ts` 的 `SETTINGS_KEY`）。

### 4.1 默认设置结构：由 `buildDefaultSettings()` 统一生成

- `enabled: boolean`：总开关（所有模块）
- `sites: Record<siteId, boolean>`：站点级开关
- `scrollLockDefaults: Record<siteId, boolean>`：各站点默认 scroll-lock 策略
- `siteModules: Record<siteId, Record<moduleIdOrExtraFlag, boolean>>`：模块/额外 flag 开关

> `EXTRA_SITE_MODULE_FLAGS` 的开关虽然不是“模块”，但会进入 `siteModules`，供 Options 管理/供 MAIN world 读取。

### 4.2 Patch 模型：Popup/Options 走增量，不做整包覆盖

Popup/Options 常用 `AISHORTCUTS_PATCH_SETTINGS`（增量）：

- patch 是数组，元素形如：`{ op:'set', path:[...], value:boolean }`
- SW 端 `applySettingsPatchOps(current, patch)` 做路径白名单校验，防止越权写入
- 写入串行化：`runSettingsMutation(fn)` 把设置读改写串行化，避免 popup/options 并发覆盖

### 4.3 安全边界：谁能改设置

- 对 `SET/PATCH/RESET/REINJECT` 等写操作，SW 强制 `sender.url` 必须来自扩展页面（Popup/Options）
- 普通网页内容脚本 **不能直接改设置**

---

## 5) 跨 world 基础设施（关键设计）

MV3 的 content scripts 会落在两个世界：

- **ISOLATED world**：扩展隔离世界（适合 DOM 读写、消息、与 SW 通信）
- **MAIN world**：页面脚本世界（适合 patch fetch / scroll API 等“必须在页面世界”的能力）

项目通过“桥接层”把跨模块的基础能力集中起来，避免每个模块都重复造轮子。

### 5.1 QuickNav Bridge：跨模块事件总线 + routeChange + settings

- `content/aishortcuts-bridge.js`（ISOLATED）：
  - 小型事件总线：`on/off/emit`
  - `getSettings()`：通过 `AISHORTCUTS_GET_SETTINGS` 从 SW 拉取（带短缓存）
  - `routeChange`：优先消费 MAIN scroll guard 的 `postMessage(QUICKNAV_ROUTE_CHANGE)`，否则约 1s 级轮询兜底
- `content/aishortcuts-bridge-main.js`（MAIN）：
  - 小型事件总线：`on/off/emit`
  - `routeChange`：消费 `QUICKNAV_ROUTE_CHANGE` + 约 1.2s 轮询兜底

### 5.2 注入顺序与 ChatGPT Core：站点内核（统一 selector/动作/route 生命周期）

QuickNav 注入顺序（实现细节）已经收敛到 `shared/injections.ts`，并按“scope -> bridge -> kernel -> site script”固定展开：

- 站点 QuickNav（ISOLATED）：`aishortcuts-scope.js` -> `aishortcuts-bridge.js` -> `ui-pos-drag/menu-bridge`（Qwen 额外含 `active-lock/route-gate`）-> `aishortcuts-kernel/*` -> 站点脚本（如 `content/kimi-quicknav.js`）
- scroll guard（MAIN）：`aishortcuts-scope-main.js` -> `aishortcuts-bridge-main.js` -> `scroll-guard-main.js`
- ChatGPT fetch hub 消费者（MAIN）：`aishortcuts-scope-main.js` -> `aishortcuts-bridge-main.js` -> `chatgpt-core-main.js` -> `chatgpt-fetch-hub/main.js`（部分模块会再串 `consumer-base.js`）-> 具体模块脚本

为减少 ChatGPT 相关脚本重复（composer/turns/send/stop/route），仓库提供轻量 core：

- `content/chatgpt-core.js`（ISOLATED）
- `content/chatgpt-core-main.js`（MAIN）

提供能力（两边语义尽量一致）：

- route：`getRoute()`、`getConversationIdFromUrl(url)`、`onRouteChange(cb)`（优先桥，否则轮询）
- composer：`getEditorEl()` / `findSendButton()` / `findStopButton()` / `isGenerating()` / `clickSendButton()` / `clickStopButton()`
- turns：`getTurnsRoot()` / `getTurnArticles(root?)` + turns root 观察与健康检查（MAIN 侧有低频 health check）

注入顺序（重要）：在 `shared/injections.ts` 的 ChatGPT 相关 defs 中，`chatgpt-core*.js` 会排在各模块脚本之前，保证“后来的脚本可以直接用 core”。

### 5.3 Menu Bridge：把 GM 菜单变成 Popup 按钮

项目把“用户脚本的 GM 菜单”做成了扩展 Popup 的按钮列表：

- 页面侧注册：`window.__quicknavRegisterMenuCommand(name, fn)`（`content/menu-bridge.js`）
- Popup 读取/执行：向当前 tab 发消息：  
  - `AISHORTCUTS_GET_MENU` → 返回 `{href, commands[]}`
  - `AISHORTCUTS_RUN_MENU` → 执行某个 `id`

MAIN world 菜单桥（关键）：MAIN world 不能把函数引用交给 ISOLATED，所以 `menu-bridge.js` 通过 `CustomEvent` 做“注册 key / 执行 key”的单向桥接。

### 5.4 Scroll Guard：MAIN world 防自动滚动 + 路由广播

`content/scroll-guard-main.js` 运行在 MAIN world：

- patch `scrollIntoView/scrollTo/scrollBy/scrollTop setter` 等，结合 dataset 的 allow-window 做拦截（防 autoscroll）
- 当前 scroll API patch 仅在 MAIN world 生效；ISOLATED 侧（`chatgpt-quicknav.js`）只发布 dataset/postMessage 状态，不再 monkey patch 滚动 API
- hook `history.pushState/replaceState + popstate/hashchange` 广播 SPA 路由变化：`postMessage({type:'QUICKNAV_ROUTE_CHANGE'})`
- ready 信号：`postMessage({type:'QUICKNAV_SCROLL_GUARD_READY'})`

2026-02 补充（ERNIE + Z.ai）：

- ERNIE 的消息流式更新主要发生在 `.dialogue_card_item / #card_list_id / #DIALOGUE_CONTAINER_ID` 等节点；QuickNav 观察器与 `mutationTouchesConversation` 需要显式覆盖这些选择器，否则会出现“发送后过一会儿才刷新/跳转”的延迟感。
- Z.ai 已对齐为 **channel/v/nonce** 桥协议（`postBridgeMessage/readBridgeMessage`），并同步 `document.documentElement.dataset.quicknavScrollLockEnabled`；不再使用裸 `window.postMessage({__quicknav,type,...})` 载荷。

### 5.5 命名与调试 API 一致性约定（2026-02）

为降低跨站脚本维护成本，QuickNav 的调试对象与运行时标志采用“站点语义优先、旧名兼容保留”策略：

- **ChatGPT**：canonical 调试对象为 `window.chatgptNavDebug`（保留旧别名 `window.chatGptNavDebug`）。
- **Qwen**：canonical 调试对象为 `window.qwenQuicknavDebug`（并提供 `window.qwenNavDebug` 与旧别名 `window.chatGptNavDebug`）。
- **Kimi**：canonical 调试对象为 `window.kimiQuicknavDebug`（并提供 `window.kimiNavDebug` 与旧别名 `window.chatGptNavDebug`）。
- **Grok**：canonical 调试对象为 `window.grokQuicknavDebug`（并提供 `window.grokNavDebug` 与旧别名 `window.chatGptNavDebug`）。
- **Gemini**：canonical 调试对象为 `window.geminiNavDebug`（保留旧别名 `window.chatGptNavDebug`）。

运行时布尔哨兵同样遵循该策略：优先写入站点语义 key（如 `__qwenQuicknav*` / `__quicknavKimi*` / `__quicknavGrok*` / `__gemini*`），并同步维护历史 `__cgpt*` 兼容 key，避免已有控制台脚本或用户习惯失效。

实现约束（已完成 bridge-first 命名/路由对齐：Qwen/Kimi/DeepSeek/Gemini App/Grok/Genspark）：

- 禁止在业务路径中直接写 `window.__cgpt* = ...`；应统一通过兼容 helper 一次性写入 canonical + legacy。
- 路由监听优先复用 bridge `routeChange`，仅保留慢速轮询兜底；避免每脚本重复 monkey patch `history.pushState/replaceState`。
- 全局输入事件（如快捷键发送/键盘导航）必须“单次绑定 + 运行时 UI 懒解析”；禁止在路由切换后重复 addEventListener 叠加触发。

维护约束：

1. 新增站点能力时，禁止继续扩散 `cgpt/chatGpt` 语义命名。
2. 需要改名时，必须提供向后兼容别名，并在同次变更里更新文档说明。
3. 命名清理不得引入业务行为变化（仅限可观察命名/调试接口层）。

---

## 6) ChatGPT 核心模块细节

### 6.1 QuickNav（`content/chatgpt-quicknav.js`，ISOLATED）

职责：对话导航 / 📌检查点 / 收藏 / 防自动滚动（与 MAIN guard 协作）/ 快捷键 / 与消息树联动。

快速锚点（建议用 `rg -n` 搜索关键字快速跳转）：

- 入口：`function init()`（初始化 UI/事件/观察者）
- route：`'ChatGPT Navigation: route changed'`（路由变化处理）
  - watcher 采用“共享 route 事件 + 原生事件（`popstate/hashchange/pageshow/visibilitychange`）+ 1.2s 轮询”并行兜底，降低偶发漏信号导致的延迟隐藏
- 菜单命令注册：`registerMenuCommand("重置问题栏位置" ...)`（Popup 可见）
- 防滚动握手：
  - 请求注入 MAIN guard：`AISHORTCUTS_ENSURE_SCROLL_GUARD`
  - dataset：`document.documentElement.dataset.quicknavScrollLockEnabled/AllowScrollUntil/Baseline`
  - postMessage：`AISHORTCUTS_SCROLLLOCK_STATE/BASELINE/ALLOW`
- 与消息树交互：`AISHORTCUTS_CHATGPT_TREE_*`（summary / open / close / navigate 等）

Turn 筛选策略（维护重点）：

- 统一占位常量：`PREVIEW_PLACEHOLDER = '...'`，避免各处魔法字符串。
- 统一判定函数：`isAssistantTransientPlaceholderTurn()` 负责识别“思考/整理/Finalizing/Answer now”等临时节点。
- 缓存策略：只缓存真实 preview，不缓存占位符，降低旧占位残留导致的错误复用。
- 渲染策略：临时思考节点不进入列表，不占编号；仅稳定消息进入 QuickNav。

面板与存储（用户态数据都在页面 localStorage）：

- 面板 DOM：`#cgpt-compact-nav`（样式：`#cgpt-compact-nav-style`）
- 存储命名空间：`cgpt-quicknav:*`  
  - `cgpt-quicknav:nav-width` / `cgpt-quicknav:nav-pos`  
  - `cgpt-quicknav:scroll-lock`  
  - `cgpt-quicknav:cp:${location.pathname}`（📌检查点）  
  - `cgpt-quicknav:fav:${location.pathname}` / `cgpt-quicknav:fav-filter:${location.pathname}`（收藏与过滤）
- 📌检查点定位策略（稳定性与体积平衡）：
  - 主锚点：段级上下文 `ctx = { p, s, y }`
    - `p`：节点路径（相对当前 turn）
    - `s`：段落文本前缀（短签名，用于路径失效时回找）
    - `y`：段内纵向相对位置
  - 兜底锚点：`rel/frac`（消息容器内相对坐标）
    - `rel` 读档会做数值归一（兼容字符串数值）并允许单轴恢复，避免历史数据缺轴时直接退化到中心点。
  - 兼容用户与助手消息，避免仅对 assistant markdown 生效。

### 6.2 fetch hub（`content/chatgpt-fetch-hub/main.js`，MAIN）

定位：**全局 fetch 能力中枢**。多个模块都需要拦截 ChatGPT 的对话请求与 SSE 流，因此用 hub 统一 patch，避免重复 patch fetch。

- hub 注册：`hub.register({ beforeFetch, onConversationStart, onConversationSseJson, priority })`
- SSE 解析与安全上限：对 buffer/event 设 cap，避免异常流撑爆内存
- Cloudflare 兼容：检测挑战页/turnstile，必要时延迟/跳过 patch，保持原生 fetch

常见依赖模块（ChatGPT 站点）：用量统计 / 回复计时器 / 下载修复 / thinking toggle 等。

### 6.3 message tree（`content/chatgpt-message-tree/main.js`，MAIN）

定位：对话“完整消息树/分支结构”的侧边面板，并与 QuickNav 协作导航到某个分支节点。

- 对话拉取：`GET /backend-api/conversation/:id`
- 大对话内存保护：设置 JSON 上限（6MB 解压后），超限直接拒载以保稳定性
- QuickNav 桥协议：`AISHORTCUTS_CHATGPT_TREE_*`（summary/toggle/open/close/refresh/navigate）
- 缓存回收：关闭时主动丢弃大 mapping（避免常驻占用）
- 凭据边界：auth/session 缓存放在闭包内 `authCache`，`window.__aichat_chatgpt_message_tree_state__` 不再暴露 `token/accountId/deviceId`
- 菜单导出：提供“导出完整树为 JSON”（整棵 mapping + 统计）

### 6.4 thinking toggle（`content/chatgpt-thinking-toggle/main.js` + `content/chatgpt-thinking-toggle/config-bridge.js`）

定位：推理强度/模型快捷键模块（MAIN world 执行 DOM 操作；ISOLATED 用 config-bridge 把开关写到 dataset 供 MAIN 读取）。

- 入口 guard：模块会避免“重复安装”造成热键 double-trigger
- 热键队列：`enqueueHotkeyAction()` + `drainHotkeyQueue()`（串行执行）
- 配置桥：`config-bridge.js` 把扩展设置同步到 `document.documentElement.dataset`（MAIN world 可读）
- 推理强度识别：`⌘O` 优先按菜单结构（`menuitemradio` 顺序 + `aria-checked`）判定切换对，不依赖具体界面语言；英文关键词仅作为可选增强。

### 6.5 usage monitor（`content/chatgpt-usage-monitor/main.js` + `content/chatgpt-usage-monitor/bridge.js`）

定位：ChatGPT 用量统计（更偏“记录/配置/导入导出”，UI 与数据结构都比较复杂）。

- fetch 统计优先走 fetch hub：注册 `hub.register(...)` 监听对话请求与 SSE 信息
- 套餐结构应用：`applyPlanConfig(planType)`（不同 plan 的窗口/配额结构）
- 共享组配额：`sharedQuotaGroups`（多模型共享配额统计）
- SPA 导航重建与自愈：订阅 bridge `routeChange`，并有低频自愈逻辑避免 React 重挂导致失效
- options 同步桥：`bridge.js` 负责 localStorage ↔ `chrome.storage.local` 双向同步（含版本号/修订号）
- options-only 模式：主链路做 headless 统计与同步，不注入页面悬浮 UI；主要查看/导入/导出入口在 Options

### 6.6 ChatGPT Perf（`content/chatgpt-perf/content.js` + `content/chatgpt-perf/content.css`）

定位：渲染性能调优层（离屏虚拟化 + 重内容优化 + 交互加速）。

- 核心策略：默认开启离屏虚拟化/重内容优化/禁用动画/交互加速/查找解冻；仅“页面内性能菜单”默认关闭（避免常驻浮层干扰）。
- 性能策略：离屏虚拟化窗口已改为“预算自适应”——按 `DOM 节点数 + 公式节点数 + turn 数量` 动态收紧 `padItems`，长对话下优先保证交互流畅与内存稳定。
- 性能策略：`scheduleReconcile` 频率同样按预算等级动态降频（高压力时降低全量 reconcile 频次），减少长对话中的重复样式切换与主线程抖动。
- 功能变更：已移除“禁用毛玻璃（`disableBackdropFilters`）”独立开关
- 功能变更：已移除“极限轻量（`extremeLite`）”开关与对应样式分支，统一由主性能项负责优化策略。
- 功能变更：已移除“Markdown 分段虚拟化（`virtualizeMarkdownBlocks`）”子策略与对应样式/配置项，避免对块级节点做二次虚拟化。
- 维护原则：涉及全局样式开关时，优先“窄选择器 + 可回滚默认值”，避免在长对话中触发大范围样式失效与内存压力。

### 6.7 ChatGPT 对话导出（`content/chatgpt-export-conversation/main.js`，ISOLATED）

定位：导出模块以会话 `mapping` 为优先数据源，导出“当前分支”Markdown / HTML，并保留 DOM 线性导出作为兜底。

- 主链路：`GET /backend-api/conversation/:id`（与消息树同源），不再只依赖当前页面可见 turn
- 分支策略：优先按“页面当前可见分支”解析当前节点并导出 `current -> root` 路径；仅在可见分支无法判定时回退 `current_node`
- 性能策略：可见分支解析走“懒加载 messageId→nodeId 索引”——命中场景保持低开销；仅在首次未命中时构建索引，避免大对话下反复全表扫描
- 图片策略：优先导出现成 URL；遇到 `file-service://` 资源会尝试解析 download URL；解析失败保留 unresolved id 提示
- 容灾：mapping 拉取失败时自动回退“当前可见导出”，避免完全不可用
- 内存保护：沿用 6MB JSON 上限，防止超大对话导出时触发内存峰值

---

## 7) Popup / Options 交互层

### Popup（`popup/popup.js`）

- 读取/修改设置：`AISHORTCUTS_GET_SETTINGS`、`AISHORTCUTS_PATCH_SETTINGS`
- 菜单发现/执行：向当前 tab 发 `AISHORTCUTS_GET_MENU`、`AISHORTCUTS_RUN_MENU`
- 更新检查：拉取远端 `dist/manifest.json` version 做对比（仅提示，不自动更新）

### Options（`options/options.js`）

- 主入口：三栏布局（站点/模块/设置）+ 模块设置面板路由（`renderModuleSettings(...)`）
- 设置操作：`AISHORTCUTS_GET_SETTINGS`、`AISHORTCUTS_PATCH_SETTINGS`、`AISHORTCUTS_RESET_DEFAULTS`
- OpenAI 资源监控：通过 `AISHORTCUTS_GPT53_*` 与 SW 交互（探测/通知/标记已读）；当资源可访问时会在 `chatgpt.com` 显示页内横幅。若需停止提醒，清空 URL 列表并保存即可（`MARK_READ` 只清未读标记）
- 横幅“打开配置”动作：内容脚本通过 `AISHORTCUTS_OPEN_OPTIONS_PAGE` 交给 SW 调扩展 API 打开配置页（优先 `chrome.tabs.create(optionsUrl)`，失败再 fallback `chrome.runtime.openOptionsPage()`）；该消息为低风险动作，SW 端不再对 sender 做额外拦截，避免不同实例字段差异导致误判。

---

## 8) 后台消息协议（快速索引）

面向“系统链路”的核心消息（建议把这些当作内部 API）：

- 启动类（bootstrap → SW）：`QUICKNAV_BOOTSTRAP_PING`、`QUICKNAV_BOOTSTRAP_ENSURE`
- 设置类（Popup/Options → SW）：`AISHORTCUTS_GET_SETTINGS`、`AISHORTCUTS_SET_SETTINGS`、`AISHORTCUTS_PATCH_SETTINGS`、`AISHORTCUTS_RESET_DEFAULTS`
- 注入类（Popup/内容脚本 → SW）：`AISHORTCUTS_REINJECT_NOW`、`AISHORTCUTS_ENSURE_SCROLL_GUARD`
- 菜单类（Popup ↔ 内容脚本）：`AISHORTCUTS_GET_MENU`、`AISHORTCUTS_RUN_MENU`
- 监控类（Options ↔ SW）：`AISHORTCUTS_GPT53_GET_STATUS` / `SET_URLS` / `RUN` / `MARK_READ` / `ALERT`
- 诊断类（扩展页 → SW）：`AISHORTCUTS_DIAG_GET_DUMP`、`AISHORTCUTS_DIAG_CLEAR`
- memtest 类（dev 页面 ↔ SW）：`AISHORTCUTS_MEMTEST_STATUS`、`AISHORTCUTS_MEMTEST_GUARD`、`AISHORTCUTS_MEMTEST_ABORT`、`AISHORTCUTS_MEMTEST_GUARD_EVENT`
- 横幅跳转类（Banner 内容脚本 → SW）：`AISHORTCUTS_OPEN_OPTIONS_PAGE`

---

## 附录 A) 关键锚点（file:line）

> 行号会随提交漂移；优先用 `rg -n "关键字" 文件` 重新定位。这里的目的是“给宏观链路一个可快速跳转的入口”。

### 启动与注入

- `manifest.source.json`（构建到 `dist/manifest.json`）：静态只注入 `content/bootstrap.js`（其余脚本由 SW 动态注册）
- `content/bootstrap.js:24`：`ensureInjected(reason)`（兜底注入入口）
- `content/bootstrap.js:41`：发送 `QUICKNAV_BOOTSTRAP_ENSURE`
- `content/bootstrap.js:54`：发送 `QUICKNAV_BOOTSTRAP_PING`
- `content/bootstrap.js:69`：快速/延迟多轮 `scheduleEnsure(...)`
- `background/sw.js:9`：`importScripts('../shared/registry.js', '../shared/injections.js')`（运行时读取 dist 产物）
- `background/sw.js:20`：加载 SW 模块脚本（`./sw/*.js`）
- `background/sw/storage.ts:117`：配置初始化入口 `initConfig(...)`
- `background/sw/registration.ts:271`：动态注册“差异更新”主函数 `applyContentScriptRegistration(settings)`
- `background/sw/router.ts:97`：处理 `QUICKNAV_BOOTSTRAP_PING`
- `background/sw/router.ts:133`：处理 `QUICKNAV_BOOTSTRAP_ENSURE`
- `background/sw/router.ts:372`：`onInstalled` → 注册 + reinject
- `background/sw/router.ts:381`：`onStartup` → 仅保持注册（避免 session restore 双重注入）

### 配置与状态

- `shared/registry.ts:11`：站点表 `SITES`
- `shared/registry.ts:41`：模块表 `MODULES`
- `shared/injections.ts:114`：`buildDefaultSettings(registry)`
- `shared/injections.ts:149`：`buildContentScriptDefs(registry)`
- `background/sw/storage.ts:176`：SW 端 patch 白名单校验 `applySettingsPatchOps(current, patch)`
- `background/sw/storage.ts:227`：设置写入串行化 `runSettingsMutation(fn)`
- `popup/popup.js:205`：读取设置 `AISHORTCUTS_GET_SETTINGS`
- `popup/popup.js:217`：增量 patch `AISHORTCUTS_PATCH_SETTINGS`
- `options/options.js:472`：读取设置 `AISHORTCUTS_GET_SETTINGS`
- `options/options.js:484`：增量 patch `AISHORTCUTS_PATCH_SETTINGS`
- `options/options.js:490`：恢复默认 `AISHORTCUTS_RESET_DEFAULTS`
- `options/options.js:3083`：模块设置面板路由 `renderModuleSettings(...)`

### 桥接层（跨模块/跨 world 基础设施）

- `content/menu-bridge.js:10`：`window.__quicknavRegisterMenuCommand`（菜单注册入口）
- `content/menu-bridge.js:236`：处理 `AISHORTCUTS_GET_MENU`
- `content/menu-bridge.js:256`：处理 `AISHORTCUTS_RUN_MENU`
- `content/scroll-guard-main.js:591`：scrollTop setter patch（ChatGPT/Qwen/Kimi/DeepSeek/Gemini App/文心一言/Z.ai/Grok/Genspark autoscroll 关键路径）
- `content/scroll-guard-main.js:95`：广播 `QUICKNAV_ROUTE_CHANGE`
- `content/scroll-guard-main.js:699`：广播 `QUICKNAV_SCROLL_GUARD_READY`
- `content/chatgpt-core.js:87`：`getRoute()`
- `content/chatgpt-core.js:212`：`getTurnsRoot()`
- `content/chatgpt-core.js:242`：`getTurnArticles(root)`
- `content/chatgpt-core.js:508`：`onRouteChange(cb)`
- `content/chatgpt-core-main.js:392`：turns observer health check（React 重挂自愈）

### ChatGPT：核心模块锚点

- `content/chatgpt-quicknav.js:616`：入口 `init()`
- `content/chatgpt-quicknav.js:783`：`installRouteWatcher()`（多信号并行兜底）
- `content/chatgpt-quicknav.js:233`：菜单命令注册（重置位置/清理 checkpoint/清理收藏/紧急清理）
- `content/chatgpt-quicknav.js:2509`：`applySavedPosition()`（位置恢复裁剪，避免面板跑出可视区）
- `content/chatgpt-quicknav.js:3824`：turn 列表/索引刷新用的 `MutationObserver`
- `content/chatgpt-quicknav.js:3917`：scroll-lock 状态写入 dataset（供 MAIN guard 读取）
- `content/chatgpt-quicknav.js:4919`：请求注入 MAIN guard：`AISHORTCUTS_ENSURE_SCROLL_GUARD`
- `content/chatgpt-fetch-hub/main.js:6`：`CF_CHALLENGE_UNTIL_KEY`（Cloudflare 兼容）
- `content/chatgpt-fetch-hub/main.js:276`：SSE 安全上限 `MAX_BUFFER_CHARS` / `MAX_EVENT_CHARS`
- `content/chatgpt-fetch-hub/main.js:620`：`isCloudflareInterstitial()`（决定是否安装 fetch patch）
- `content/chatgpt-message-tree/main.js:245`：`/backend-api/conversation/:id` 拉取入口
- `content/chatgpt-message-tree/main.js:254`：大对话内存保护 `MAX_JSON_BYTES = 6MB`
- `content/chatgpt-message-tree/main.js:1194`：关闭回收 `dropLastDataIfClosed()`
- `content/chatgpt-thinking-toggle/main.js:1052`：热键队列入队 `enqueueHotkeyAction()`
- `content/chatgpt-thinking-toggle/main.js:1059`：串行 drain `drainHotkeyQueue()`
- `content/chatgpt-usage-monitor/main.js:1768`：接入 fetch hub：`hub.register({ ... })`
- `content/chatgpt-usage-monitor/main.js:1917`：套餐结构应用 `applyPlanConfig(planType)`
- `content/chatgpt-usage-monitor/main.js:4604`：订阅 bridge `routeChange`（SPA 导航重建）
- `content/chatgpt-usage-monitor/bridge.js:29`：`SYNC_REV_KEY`（同步修订号）
- `content/chatgpt-usage-monitor/bridge.js:143`：localStorage ↔ `chrome.storage.local` 双向同步入口

## 9) Dev 脚本与维护流程（建议照做）

项目自带的维护脚本（Node 直接运行，无需打包器）：

1) `node dev/sync-manifest.js`  
   - 从 `registry/injections` 同步 `manifest.source.json` 的 `host_permissions` 与 bootstrap 的 `matches`
2) `node dev/gen-scripts-inventory.js`  
   - 根据 `registry/injections` 生成 `docs/scripts-inventory.md`（站点/模块/注入细节清单）
3) `node dev/check.js`  
   - JS 语法检查 + manifest/registry/injections 一致性校验
4) `node dev/stats.js`  
   - 打印站点/模块/注入规模统计（用于更新本文的“规模与热点”）

推荐改动后顺序（尤其是改了 `shared/registry.ts` / `shared/injections.ts` 时）：

- 跑 `node dev/sync-manifest.js` → `node dev/gen-scripts-inventory.js` → `node dev/check.js`

### 9.1 Dev-only MCP smoke probe（ChatGPT + Grok）

在 Chrome DevTools MCP 的 `evaluate_script` 里可直接执行下面片段，统一检查三项核心信号：

- `navCount`：QuickNav 面板实例数（是否重复注入）
- `scrollLockEnabled`：页面 dataset 当前锁状态
- `mainGuardVersion`：MAIN world guard 版本

```js
() => {
  const ds = document.documentElement && document.documentElement.dataset ? document.documentElement.dataset : {};
  return {
    href: location.href,
    navCount: document.querySelectorAll('#cgpt-compact-nav').length,
    scrollLockEnabled: ds.quicknavScrollLockEnabled ?? null,
    mainGuardVersion: Number(window.__quicknavMainScrollGuardVersion || 0),
    mainGuardInstalled: Boolean(window.__quicknavMainScrollGuardInstalled)
  };
}
```

判读口径（烟测）：

- 会话页（ChatGPT conversation / Grok conversation）应为 `navCount === 1`
- 非会话页允许 `navCount === 0`
- `mainGuardVersion >= 1` 且 `mainGuardInstalled === true`
- `scrollLockEnabled` 来自 dataset，常见值是 `'1'` / `'0'`（字符串），以站点 UI 当前开关状态为准

### 9.2 Dev-only：memtest + SW diagnostics endpoints

以下入口用于开发与排障，消息网关默认只允许扩展页 sender（`background/sw/chrome.ts` 的 `senderGate`）：

- Memtest 页面（仅源码开发态）：`dev/memtest.html` + `dev/memtest.js`，**不会打包到 `dist/` 给普通用户**
- Memtest 入口（仅开发态可用）：`chrome-extension://<EXTENSION_ID>/dev/memtest.html`
- Memtest 调试面：`window.__qnMemtestDev`（`getState()`、`getReport()`、`start()`、`stop()`、`save()`、`discardTestTab()`）
- URL 开关：`?autorun=1`（自动启动）、`?memguard=1`（请求后台仅关闭当前测试 tab）、`?memguard_abort=1`（请求后台中止矩阵并关闭 tab）
- Memtest 页面 -> SW：`AISHORTCUTS_MEMTEST_STATUS`（状态心跳）、`AISHORTCUTS_MEMTEST_GUARD`（仅关测试 tab）、`AISHORTCUTS_MEMTEST_ABORT`（广播中止 + 关测试 tab）
- SW -> Memtest 页面：`AISHORTCUTS_MEMTEST_GUARD_EVENT`、`AISHORTCUTS_MEMTEST_ABORT`（都携带 `reason/caseId/modules`）
- 诊断 dump 端点：`AISHORTCUTS_DIAG_GET_DUMP`（可带 `tail:number`，返回 `{ ok:true, dump:{ max,size,droppedDuplicateMsgCount,events[] } }`）
- 诊断清空端点：`AISHORTCUTS_DIAG_CLEAR`（清空 ring buffer，并记录 `diag_clear`）
- 诊断实现细节：`background/sw/diag.ts` 的 ring buffer 上限 `MAX_EVENTS=500`，URL 会归一化为 `origin + pathname`，错误消息有突发去重限流

### 9.3 恢复出厂（全量清空扩展数据）

当出现“升级后行为异常 / 老版本缓存冲突 / 注入表注册状态异常”等问题时，优先做一次恢复出厂，让扩展回到“新浏览器刚加载”的状态，再继续排查。

- 入口：`options/options.html` 底部按钮 **恢复出厂（清空所有数据）**
- 行为（后台 `AISHORTCUTS_FACTORY_RESET`）：
  - 清空 `chrome.storage`：`local/sync/session`
  - 注销所有已注册的 content scripts（`chrome.scripting.unregisterContentScripts({})`）
  - 清空 DNR `dynamic/session rules`（如有）
  - best-effort 清空 extension origin 的 `caches` / `indexedDB`
  - 清空 `chrome.alarms`，并 `chrome.runtime.reload()` 重新加载扩展
- 做完后：**刷新**已打开的目标网站标签页（例如 `chatgpt.com`），让内容脚本重新按最新定义注入

## 10) 近期维护记录（手工更新）

- **2026-02-26：弹窗左上角品牌位切换为正式 Logo**
  - 需求：popup 左上角不再使用 `QN` 文本方块，统一改为扩展 logo。
  - 变更：
    - `popup/popup.html`：品牌位改为 `<img class="brandLogo" src="../icons/icon48.png">`；
    - `popup/popup.css`：新增 `brandLogo` 样式（保留 32px 尺寸与圆角，移除旧文字徽标样式）。

- **2026-02-26：README 增加居中 Logo 头图**
  - 需求：README 采用更标准的开源项目视觉呈现，在标题下方增加居中大 logo。
  - 变更：`README.md` 新增居中 logo 区块（`./icons/logo.svg`）。

- **2026-02-26：配置页标题 Logo 视觉微调（放大）**
  - 需求：配置页左上角 logo 再放大一点，避免在高分屏下观感过小。
  - 变更：`options/options.css` 将 `titleLogo` 从 `30px` 调整到 `34px`（移动端从 `26px` 调整到 `30px`），其余布局保持不变。

- **2026-02-26：配置页（AI捷径 设置）左上角加入 Logo**
  - 目标：提升配置页品牌识别，和扩展图标保持一致。
  - 变更：
    - `options/options.html`：标题区新增 `titleRow`，在“AI捷径 设置”左侧展示 logo；
    - `options/options.css`：新增 `titleRow/titleLogo` 样式，并补充移动端尺寸适配。

- **2026-02-26：修复扩展图标在 Extensions/UI 菜单显示空白方块**
  - 现象：扩展详情页与工具栏菜单中图标显示为纯白方块。
  - 根因：直接使用 ImageMagick 从 SVG 栅格化时，目标 SVG 在该链路下出现“仅背景被渲染、主体路径丢失”，导致生成的 `icon16/32/48/128.png` 全白。
  - 修复：
    - 新增 `dev/render-logo-icons.py`：使用 macOS `qlmanage` 栅格化 SVG，再做边界背景透明化与多尺寸输出；
    - 同脚本增加“按可见 alpha 边界裁切 + 留白回填”步骤，避免图标主体在 16/32px 下过小只剩蓝点；
    - `icons/logo.svg` 移除背景底色矩形，避免图标白底观感；
    - 重新生成并替换 `icons/icon16.png`、`icon32.png`、`icon48.png`、`icon128.png`（构建后同步到 `dist/icons/*`）。

- **2026-02-26：统一扩展 Logo 资产（SVG 源文件 + manifest 图标声明）**
  - 目标：消除旧品牌残留观感，统一扩展图标来源。
  - 变更：
    - 新增 `icons/logo.svg` 作为当前 logo 源文件；
    - 由该 SVG 重新生成 `icons/icon16.png`、`icon32.png`、`icon48.png`、`icon128.png`（构建后同步到 `dist/icons/*`）；
    - `manifest.source.json` 增加 `icons` 与 `action.default_icon` 声明，确保扩展管理页/工具栏/通知使用同一套图标资产。

- **2026-02-26：清理 Gemini Enterprise 历史残留脚本 + 新增 orphan 防回归检查**
  - 现象：仓库中残留 `content/gemini-quicknav.js`（历史文件），当前注入链路已全面切到 `content/gemini-app-quicknav.js`，旧文件不再被 manifest/injections 引用，容易造成“项目遗产未清理”的认知负担。
  - 修复：
    - 删除 `content/gemini-quicknav.js`（及构建产物）；
    - `content/menu-bridge.js` 移除 `Gemini Enterprise QuickNav` 分组推断分支；
    - `dev/check.js` 新增“content runtime 文件覆盖校验”：若 `content/` 下存在未被 `manifest.source.json` 或 `shared/injections.ts` 引用的运行时文件，直接让检查失败，阻断类似残留再次进入主分支。

- **2026-02-26：ChatGPT QuickNav 图钉“跨对话继承”修复（会话绑定 + 旧弱锚点清理）**
  - 现象：部分用户在未手动加图钉时，进入新对话后仍出现旧图钉，表现为“像继承了之前对话”。
  - 根因：
    1. 图钉内存态在路由切换期间可能短暂沿用旧会话数据；
    2. 历史图钉若仅依赖弱 `msgKey`（如 `conversation-turn-*`）且缺少段落上下文，恢复时容易误映射到当前对话。
  - 修复：
    - `content/chatgpt-quicknav.js`：新增 `cpConvKey` 会话绑定校验，渲染前若会话 key 变化则强制重载图钉存储，阻断旧内存态串用。
    - 图钉元数据新增 `convKey/msgId`，恢复优先走 `msgId` 精确定位；当 `msgId` 不匹配时拒绝回退到弱匹配。
    - 对“弱 key + 无上下文 + 无 msgId”的历史遗留图钉做自动清理，避免幽灵图钉持续复现。
    - 回归保护：`dev/test-chatgpt-tree-quicknav-autocollapse.js` 增加会话绑定与弱锚点治理断言。

- **2026-02-22：ChatGPT scroll-lock 发送瞬间“残留一跳”补丁（baseline 缓存竞态）**
  - 现象：在 🔒 已开启且发送后快速进入流式阶段时，极少数场景仍会出现一次很短的下跳（随后被回弹拉回）。
  - 根因：`content/scroll-guard-main.js` 对 `quicknavScrollLockBaseline` 的 dataset 读取有短时缓存；当 send guard 刚写入新 baseline 时，MAIN guard 仍可能短暂读取到旧缓存值，造成一次放行。
  - 修复：
    - `content/scroll-guard-main.js`：处理 `AISHORTCUTS_SCROLLLOCK_BASELINE` bridge 消息时，立即同步刷新 `__baselineDatasetCached/__baselineDatasetCachedAt`，让 MAIN guard 同步使用最新 baseline，消除发送窗口竞态。
    - guard 版本提升：`GUARD_VERSION = 7`。
    - 回归保护：`dev/test-chatgpt-scroll-lock-send-guard.js` 增加“baseline bridge 到达即刷新缓存”断言。

- **2026-02-22：ChatGPT scroll-lock 发送后“跳一下”修复（锁定窗口内快速回弹）**
  - 现象：在 ChatGPT 打开 🔒 后，发送消息瞬间仍可能出现一次可见下跳，再被回弹拉回。
  - 根因：
    1. `content/chatgpt-quicknav.js` 的 mutation 回弹走固定 `140ms` 延迟，导致“先跳后拉回”的可见窗口。
    2. `content/scroll-guard-main.js` 的统一漂移阈值对 ChatGPT 场景偏宽，发送瞬间仍可能放过一个小步下移。
  - 修复：
    - `content/chatgpt-quicknav.js`：新增“guard 窗口快速回弹”策略（`16ms` 快速延迟 / `140ms` 常规延迟），并在 guard 窗口内放宽 idle 限制，优先消除发送瞬间的可见下跳。
    - `content/scroll-guard-main.js`：为 `chatgpt.com` 启用更严格的下滚阈值（`DRIFT=8`），其他站点保持 `16`，避免跨站点副作用。
    - 回归保护：新增 `dev/test-chatgpt-scroll-lock-send-guard.js` 并纳入 `dev/check.js` self-tests；`dev/scroll-tests/chatgpt-scroll-lock-smoke.js` 的发送抖动阈值收紧到 `8px`。

- **2026-02-22：修复 Genspark QuickNav 把 toolcall/thinking 中间态写进导航列表**
  - 现象：Genspark 在工具调用链路中会持续产出 `Using Tool | ...` / `Thinking...` 中间文本，QuickNav 把这些中间态当作独立助手消息写入导航，导致一轮回复里出现多条“伪导航项”。
  - 根因：`content/genspark-quicknav.js` 的助手预览抽取没有区分 transient（工具调用/思考中）与 final（最终回答），并且会把 transient 预览写入 `previewCache`。
  - 修复：
    - `content/genspark-quicknav.js`：新增 Genspark 助手预览解析链路（候选文本收集 + transient 前缀剥离 + inline toolcall 尾段裁剪 + transient 判定），assistant 预览改为 `{text, transient}`。
    - `content/genspark-quicknav.js`：在 `buildIndex()` 中禁止缓存 transient assistant 预览，并在构建导航列表时直接跳过 transient 条目，仅保留最终回答对应的导航项。
    - 新增回归测试：`dev/test-genspark-preview-filter.js`，并纳入 `dev/check.js` self-tests。

- **2026-02-21：修复 Ernie QuickNav 回归（助手预览卡住 thinking 文本 + scroll-lock 信号失效）**
  - 现象：
    1. 助手卡片在“思考中 → 最终回答”同卡切换后，导航预览偶发长期停留在 `Thinking.../ThinkingUser...`。
    2. Ernie 端 UI 显示 scroll-lock 已开启，但页面脚本触发的自动下滚未被 MAIN world guard 接收。
  - 根因：
    - `content/ernie-quicknav.js` 里 assistant 预览缓存会写入早期 thinking 文本，后续同卡出现最终回答时不一定能刷新覆盖。
    - Ernie 仍发送旧版裸 `postMessage({__quicknav,type,...})`，而 `content/scroll-guard-main.js` 已收敛到 `channel/v/nonce` bridge envelope 校验。
  - 修复：
    - `content/ernie-quicknav.js`：新增 Ernie thinking/final 文本解析器与候选片段提取（完整容器优先，避免先命中中间思考段）；assistant 预览改为 `{text, transient}`，并在 `buildIndex()` 中禁止缓存 transient（thinking）预览，确保最终回答出现后可替换。
    - `content/ernie-quicknav.js`：对无 `Finished thinking` marker 且包含 `User\d+ / Thinking complete` 的文本增加 transient 识别，降低“把思考草稿当最终预览”的误判概率。
    - `content/ernie-quicknav.js`：scroll-lock 的 `STATE/BASELINE/ALLOW` 与 `QUICKNAV_SCROLL_GUARD_READY` 握手全部切到 `postBridgeMessage/readBridgeMessage`（`channel=quicknav`、`v=1`、`nonce=quicknavBridgeNonceV1`），并同步 `dataset.quicknavScrollLockEnabled`。
    - 新增回归测试：`dev/test-ernie-preview-regression.js`、`dev/test-ernie-scroll-lock-bridge.js`，并纳入 `dev/check.js` self-tests。

- **2026-02-21：新增 Gemini App / 文心一言 / Z.ai 到 QuickNav 主链路，并修复 Grok 回复可见性风险**
  - 目标：把“已实现但未接入”的站点脚本正式纳入 registry/injections/manifest 主链路，统一启用 QuickNav + Cmd/Ctrl+Enter；同时处理 Grok 在部分场景下“下一条回复可能消失”的高风险样式覆盖。
  - 修复：
    - `shared/registry.ts`：新增 `gemini_app`（`https://gemini.google.com/*`，QuickNav 限定 `https://gemini.google.com/app*`）、`ernie`（`https://ernie.baidu.com/*`）、`zai`（`https://chat.z.ai/*`）站点定义，并启用 `quicknav` + `cmdenter_send` 模块。
    - `shared/injections.ts`：新增 `quicknav_{gemini_app|ernie|zai}`、`quicknav_scroll_guard_{gemini_app|ernie|zai}`、`quicknav_{gemini_app|ernie|zai}_cmdenter_send` 注入定义。
    - `content/gemini-app-quicknav.js`：对齐最新 quicknav 内核约束（bridge envelope、canonical+legacy runtime flag helper、debug API 安装器、bridge routeChange + polling fallback），移除本地 `history.pushState/replaceState` monkey patch。
    - `content/grok-quicknav.js`：移除全局 `.thinking-container { display:none !important; }`，避免误伤真实回复内容。
    - 回归测试：新增 `dev/test-multi-site-injection-routing.js`、`dev/test-gemini-app-quicknav-kernel.js`、`dev/test-grok-quicknav-visibility-safety.js` 并纳入 `dev/check.js` self-tests。
    - 文档与清单：同步 `manifest.source.json`（host/matches + patch 版本）、`docs/scripts-inventory.md`。
  - 验证：`npm run check` / `npm test` / `npm run typecheck` / `npm run build` 全通过；浏览器侧确认扩展重载后 Gemini App `/app` 与 Grok 页面注入路径正常。

- **2026-02-14：修复 ChatGPT QuickNav 偶发慢显示 / 切页延迟隐藏**
  - 现象：有时需要过一会儿面板才出现，或切到非聊天页后未及时消失
  - 根因：
    - bootstrap 兜底注入触发偏晚，且 `PING` 成功后没有立即补 `ENSURE`
    - route watcher 早期路径存在单通道依赖，兜底轮询间隔过大（8s）
  - 修复：
    - `content/bootstrap.js`：提前并增加 `ENSURE` 触发点，`PING` 成功即补 `ENSURE`，并接入 `pageshow/visibilitychange`
    - `content/chatgpt-quicknav.js`：route 监听改为多信号并行兜底，轮询降到约 1.2s
    - `content/chatgpt-quicknav.js`：位置恢复增加裁剪，防止 UI 出现在视口外
  - 验证：`node dev/check.js` 通过；MCP 路由切换与扩展更新后场景复测通过

- **2026-02-17：Qwen QuickNav 流式点击高亮锁定**：为防止流式输出期间自动 active 跟踪覆盖手动选择，新增“manual active/highlight lock”；流式结束后按 debounce + grace 自动释放，并在 SPA route change 时重置。

- **2026-02-19：Kimi 接入 Cmd/Ctrl+Enter + QuickNav**
  - 站点接入：`manifest.source.json` / `shared/registry.ts` / `shared/injections.ts` 增加 `https://kimi.com/*` 与 `https://www.kimi.com/*`，并启用 `quicknav` + `cmdenter_send` 模块注入。
  - 键盘策略：Kimi 主输入框改为“Enter/Shift+Enter 仅换行，Cmd/Ctrl+Enter 发送”；并在 `isComposing`、`keyCode===229`、`event.repeat`、生成中（stop 态）路径做保护，避免误触发发送或停止。
  - 生成态判定收敛：stop/cancel 检测改为优先限制在 composer 作用域，并显式排除 `#cgpt-compact-nav` 内控件（如“收藏/取消收藏”按钮），避免把 QuickNav UI 误判为“正在生成”导致 Cmd/Ctrl+Enter 被吞掉。
  - QuickNav 协同：Kimi 复用 bridge + scroll guard 机制；发送触发后保留 QuickNav 的刷新链路，减少流式阶段目录状态漂移。

- **2026-02-19：Kimi scroll-lock 协议对齐（与 ChatGPT/Qwen 同口径）**
  - 现象：Kimi 锁按钮显示开启，但自动下滚仍可发生。
  - 根因（双因素）：
    1. `content/kimi-quicknav.js` 仍使用旧版 `window.postMessage({__quicknav,type,...})` 裸消息；而 `content/scroll-guard-main.js` 已要求 `channel/v/nonce` 协议字段，导致 guard 丢弃锁状态消息。
    2. Kimi 页面结构更新后，scroller 识别可能回退到 `documentElement`，使 guard 标记目标偏离真实消息容器（`chat-detail-main`）。
  - 修复：Kimi 补齐与 ChatGPT/Qwen 一致的 bridge envelope（`channel=quicknav`、`v=1`、`nonce=quicknavBridgeNonceV1`），并将 `STATE/BASELINE/ALLOW` 与 `READY handshake` 全量切到 `postBridgeMessage/readBridgeMessage`；同时在 `content/kimi-quicknav.js` 与 `content/scroll-guard-main.js` 都提升 `.chat-detail-main` 的识别优先级，保证 marker 落在真实消息 scroller。
  - 回归保护：新增 `dev/test-kimi-scroll-lock-bridge.js`（协议字段 + 握手路径静态回归）与 `dev/scroll-tests/kimi-scroll-lock-smoke.js`（浏览器烟测入口，覆盖 lock 信号一致性/scroller-marker 一致性/allow-window/路由切换保真）。

- **2026-02-19：Grok QuickNav 原生锁协议/注入链路对齐（与 ChatGPT/Qwen/Kimi 同口径）**
  - 现象：Grok QuickNav 的 scroll-lock 信号仍在发送裸 `postMessage`，且未纳入统一 registry/injections/manifest 链路。
  - 根因：
    1. `content/grok-quicknav.js` 使用旧消息格式（仅 `__quicknav + type`），与 `content/scroll-guard-main.js` 的 `channel/v/nonce` 校验不一致。
    2. Grok 站点未进入 `shared/registry.ts` + `shared/injections.ts` 的 QuickNav 主链路，导致 host/matches 清单和注入定义不完整。
  - 修复：
    - `content/grok-quicknav.js` 补齐 `postBridgeMessage/readBridgeMessage`，并将 `STATE/BASELINE/ALLOW` + `READY handshake` 统一到 bridge 契约，同时同步 `dataset.quicknavScrollLockEnabled`。
    - 路由监听改为优先使用 shared bridge route signal（保留 polling fallback），避免 Grok 脚本自行 patch history。
    - `shared/registry.ts` 增加 Grok 站点（`https://grok.com/*`，仅 `quicknav`），`shared/injections.ts` 增加 `quicknav_grok` + `quicknav_scroll_guard_grok`。
    - `manifest.source.json` 同步 `host_permissions` 与 bootstrap `matches`，并升级 patch 版本到 `1.3.89`。
  - 回归保护：新增 `dev/test-grok-scroll-lock-bridge.js` 与 `dev/test-grok-injection-routing.js`，并纳入 `dev/check.js` self-tests。

- **2026-02-20：Grok 接入 Cmd/Ctrl+Enter 模块（与 Kimi/Qwen/ChatGPT 对齐）**
  - 目标：将 Grok 的发送快捷键策略统一纳入 `cmdenter_send` 模块，不再只依赖 QuickNav 内部的“发送后刷新”监听。
  - 修复：
    - `shared/registry.ts`：`grok` 站点模块从 `['quicknav']` 扩展为 `['quicknav', 'cmdenter_send']`，确保在 Popup/Options 可独立开关。
    - `shared/injections.ts`：新增 `quicknav_grok_cmdenter_send`（`document_start` / ISOLATED），注入 `content/aishortcuts-bridge.js` + `content/chatgpt-cmdenter-send/main.js`，匹配 `https://grok.com/*`。
    - `dev/test-grok-injection-routing.js`：补充 registry/default-settings/content-script 路由断言，避免后续回归把 grok cmdenter 注入链路删掉。
  - 验证：`npm run check` / `npm test` / `npm run typecheck` / `npm run build` 全通过；浏览器侧确认 `quicknav_grok_cmdenter_send` 已注册并在 `grok.com/c/...` 页面生效。

- **2026-02-22：模块命名治理（cmdenter + 僵尸模块清理）**
  - 目标：消除“ChatGPT 前缀模块名覆盖全站能力”的命名误导，并清理未接入注入链路的历史模块条目。
  - 修复：
    - `shared/registry.ts`：模块 ID 从 `chatgpt_cmdenter_send` 统一迁移为 `cmdenter_send`，并新增 `moduleAliases.chatgpt_cmdenter_send -> cmdenter_send` 兼容映射。
    - `background/sw/storage.ts`：设置归一化阶段支持 module alias 迁移（读取旧键并回填新键），并在 patch 阶段把旧 module key 自动 canonicalize，避免历史设置丢失。
    - `background/sw/registration.ts`：模块开关判定时优先 canonical module id，兼容旧键兜底读取。
    - `shared/registry.ts` + `options/options.js` + `README.md`：移除 `grok_fast_unlock` / `gemini_math_fix` / `gemini_auto_3_pro` 的可配置入口与文档暴露，避免“可见但不会注入”的僵尸模块体验。
  - 验证：`npm run check` / `npm run typecheck` / `npm run build`；并确认历史 `siteModules.*.chatgpt_cmdenter_send` 设置可自动迁移到 `cmdenter_send`。

- **2026-02-22：Grok 模型选择增强（隐藏模型菜单恢复）**
  - 目标：在不改 QuickNav 主体的前提下，新增独立 Grok 模块，补齐前端未展示但后端可用的模型入口。
  - 修复：
    - `content/grok-model-selector/main.js`：新增独立脚本，增强原生模型菜单；在菜单中补齐 `Grok 4 Fast` / `Grok 4.1 Thinking` / `Grok 3 Mini Companion`，保持原生菜单样式，点击后写入本地选择状态。
    - `content/grok-model-selector/main.js`：仅在会话请求（`/rest/app-chat/conversations/new`、`/rest/app-chat/conversations/{id}/messages`）上按选择结果覆盖 `modelName/modelMode`，避免影响其它请求。
    - `shared/registry.ts` + `shared/injections.ts`：新增 `grok_model_selector` 模块与 `quicknav_grok_model_selector` 注入定义；`grok` 站点模块清单扩展；补充 alias `grok_fast_unlock -> grok_model_selector` 兼容历史设置键。
    - 回归覆盖：新增 `dev/test-grok-model-selector-module.js`；并扩展 `dev/test-grok-injection-routing.js`、`dev/test-module-id-alias-compat.js` 覆盖注入链路与 alias 迁移。

- **2026-02-22：Grok 模型选择增强（近原生渲染修正）**
  - 现象：隐藏模型可注入，但菜单选中态会错误打在前置图标（导致图标消失），并且自定义项可能落在 `Open Custom Instructions` 按钮之后，观感不原生。
  - 根因：
    1. `content/grok-model-selector/main.js` 旧逻辑通过“第一个 svg”推断勾选图标，命中了前置模型图标而不是尾部 checkmark。
    2. 自定义项直接 `appendChild` 到 menu 末尾，未考虑菜单尾部非 `menuitem` 控件（如 `Open Custom Instructions`）的插入锚点。
  - 修复：
    - 选中态改为只操作尾部勾选图标（`:scope > svg.ms-auto` 优先），不再修改前置图标透明度；
    - 新增 `insertMenuItemNearNative`，将自定义模型稳定插入到“菜单项区域尾部、功能按钮之前”；
    - 自定义描述文案改为近原生语气（移除 `Hidden preset` 字样），并按 `templateTitle` 选择更接近语义的原生模板项克隆；
    - 自定义模型激活时隐藏原生模型勾选，避免“双勾选”视觉冲突。
    - 修复“从自定义模型切回原生模型后，触发器标题偶发卡在自定义名称”的问题：新增 `restoreTriggerLabel` / `rememberTriggerOriginalLabel`，并在点击原生菜单项时使用点击项标题作为回退值，确保可恢复到原生文案。
  - 回归覆盖：`dev/test-grok-model-selector-module.js` 增加 near-native 断言（尾部 checkmark 选择器、插入锚点函数、勾选遮蔽函数）与 trigger 文案恢复断言。

- **2026-02-22：Grok 模型选择增强模块下线（回归原生模型菜单）**
  - 背景：Grok 端模型能力与账号权限变体较多，隐藏模型菜单长期维护成本高，且与额度展示/账号切换行为存在耦合风险。
  - 调整：
    - `shared/registry.ts`：从 `grok` 站点模块清单移除 `grok_model_selector`，并删除 `grok_fast_unlock -> grok_model_selector` alias。
    - `shared/injections.ts`：移除 `quicknav_grok_model_selector` 注入定义。
    - `content/grok-model-selector/main.js`、`dev/test-grok-model-selector-module.js`：下线脚本与专项测试。
    - `dev/test-grok-injection-routing.js`、`dev/test-module-id-alias-compat.js`：更新断言，确保当前 Grok 注入链路仅保留 `quicknav + cmdenter_send + grok_rate_limit_display + grok_trash_cleanup`。
  - 结果：模型选择完全回归 Grok 原生菜单；扩展侧只保留导航、快捷发送、额度展示和废纸篓清理模块。

- **2026-02-20：恢复 Genspark 全量脚本束（回归历史行为面）**
  - 目标：将 Genspark 从“未接入状态”恢复为历史可用形态：QuickNav + Cmd/Ctrl+Enter + 5 个站点特化脚本。
  - 修复：
    - `shared/registry.ts`：恢复 `genspark` 站点定义（`https://www.genspark.ai/*`；QuickNav 范围 `https://www.genspark.ai/agents*`），并恢复模块清单：
      `quicknav`、`cmdenter_send`、`genspark_moa_image_autosettings`、`genspark_credit_balance`、`genspark_codeblock_fold`、`genspark_inline_upload_fix`、`genspark_force_sonnet45_thinking`。
    - `shared/injections.ts`：恢复 `quicknav_genspark`、`quicknav_scroll_guard_genspark`、`quicknav_genspark_cmdenter_send` 以及上述 5 个 Genspark 专项脚本的注入定义（含 MAIN/ISOLATED、runAt、allFrames）。
    - `dev/test-genspark-injection-routing.js`：新增 Genspark 路由回归测试（registry/default-settings/content-script defs 全覆盖），并纳入 `dev/check.js` self-tests。
    - `manifest.source.json`：同步 host permissions 与 bootstrap matches，并升级 patch 版本到 `1.3.93`。
  - 验证：`npm run check` / `npm test` / `npm run typecheck` / `npm run build` 全通过；扩展重载后可见 Genspark 相关 content script 已注册。

- **2026-02-20：Genspark QuickNav 迁移到新风格（协议/路由/命名对齐）**
  - 目标：将 `content/genspark-quicknav.js` 从历史脚本风格迁移到与 ChatGPT/Qwen/Kimi/Grok 一致的 bridge-first 口径，保留 legacy 兼容能力。
  - 修复：
    - 协议层：补齐 `channel/v/nonce` bridge envelope 与 `postBridgeMessage/readBridgeMessage`；scroll-lock 的 `STATE/BASELINE/ALLOW` 改为桥接消息，并统一写入 `dataset.quicknavScrollLockEnabled`。
    - 路由监听：移除 per-script `history.pushState/replaceState` monkey patch，改为优先消费 bridge `routeChange`，保留 `1200ms` polling fallback。
    - 命名层：新增 `__quicknavGenspark*` canonical runtime flags，并与 `__cgpt*` legacy flags 双写兼容；`__cgptBooting` 更名为 `gensparkQuicknavBooting`。
    - 调试 API：新增 canonical `window.gensparkQuicknavDebug`，同时保留 `window.gensparkNavDebug` 与 legacy `window.chatGptNavDebug`。
  - 回归保护：
    - 新增 `dev/test-genspark-scroll-lock-bridge.js`（bridge 协议 + 握手 + route watcher 静态断言）；
    - 扩展 `dev/test-quicknav-runtime-naming.js` 覆盖 genspark 命名一致性；
    - 上述测试并入 `dev/check.js` self-tests。
  - 验证：`npm run check` / `npm test` / `npm run typecheck` / `npm run build` 全通过；扩展重载后 Genspark 站点设置与模块注入正常。

### 10.1 Qwen 行为备注（生产支持面）

- 站点范围：`https://chat.qwen.ai/*`。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块处理，在 `content/chatgpt-cmdenter-send/main.js` 的 `SITE === 'qwen'` 分支生效。开启后仅 Cmd/Ctrl+Enter 发送，Enter 仅插入换行；`isComposing` 或 `keyCode === 229` 时直接忽略，避免 IME 组合输入误发。
- 模型模式热键：由 `qwen_thinking_toggle` 模块处理；`⌘O` 切换 Thinking/Fast 后会自动把焦点与光标恢复到输入框末尾，减少模式切换后的手动补焦点操作。
- 首屏模型模式预设：`qwen_thinking_toggle` 在页面首次加载阶段会做一次“Thinking 优先”尝试（带上限重试，成功后停止；不会常驻轮询保活），刷新后可重新触发。
- Scroll lock：`content/qwen-quicknav.js` 会同步 `document.documentElement.dataset.quicknavScrollLockEnabled`，并请求注入 `content/scroll-guard-main.js`（MAIN world guard）。锁开启时，页面脚本触发的自动下滚会被拦截，覆盖发送后与流式阶段；用户手动滚动与 QuickNav 自身跳转（`quicknavAllowScrollUntil` allow window）仍可通过。
- 会话切换：`content/qwen-quicknav-route-gate.js` 把路由切换设为 pending，QuickNav 在 pending 期间保留旧列表；当新会话 fingerprint 达到稳定条件（`stable-fingerprint`）或命中超时后，才放行刷新并切换到新列表。
- 调试烟测脚本（DevTools Console）：`dev/scroll-tests/chatgpt-scroll-lock-smoke.js`、`dev/scroll-tests/qwen-scroll-lock-smoke.js`、`dev/scroll-tests/qwen-conversation-switch-smoke.js`。
- 回归覆盖：`dev/test-chatgpt-cmdenter-send.js`（Qwen 输入/发送策略共性）+ `dev/test-qwen-thinking-toggle.js`（Cmd+O/J 热键解析、Thinking/Fast 选项选择策略与首屏预设依赖函数）。

### 10.2 Kimi 行为备注（生产支持面）

- 站点范围：`https://kimi.com/*` 与 `https://www.kimi.com/*`，输入框目标为 `.chat-input-editor[contenteditable="true"][role="textbox"]`。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块的 `SITE === 'kimi'` 分支处理；仅在输入非空且未处于生成中时触发发送，避免把快捷键映射为 stop/cancel。
- 生成态检测边界：只将 composer 域内 stop/cancel 控件视为“生成中”；QuickNav 面板按钮（例如 `收藏/取消收藏`）不会再参与生成态判断，避免误阻断发送快捷键。
- Enter/Shift+Enter：在 Kimi 路径下不执行发送，维持换行语义；组合输入（IME）期间直接忽略，防止候选阶段误发。
- QuickNav 注入：`content/kimi-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作，覆盖目录导航与滚动防抖场景。
- Scroll-lock 协议：Kimi 与 ChatGPT/Qwen 一致使用 `channel/v/nonce` bridge 契约；`AISHORTCUTS_SCROLLLOCK_STATE/BASELINE/ALLOW` 与 `QUICKNAV_SCROLL_GUARD_READY` 握手都要求同 nonce。
- 调试烟测脚本（DevTools Console）：`dev/scroll-tests/kimi-scroll-lock-smoke.js`（Kimi 专项）与 `dev/scroll-tests/chatgpt-scroll-lock-smoke.js`（guard 共性检查）。

### 10.3 Grok 行为备注（生产支持面）

- 站点范围：`https://grok.com/*`（当前纳入 `quicknav` + `cmdenter_send` + `grok_rate_limit_display` + `grok_trash_cleanup`）。
- QuickNav 注入：`content/grok-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- 废纸篓清理模块：`grok_trash_cleanup` 独立注入 `content/grok-trash-cleanup/main.js`，仅在 `https://grok.com/deleted-conversations` 页将“**一键清空废纸篓**”挂在 `Deleted Conversations` 标题右侧（避免顶栏遮挡）；点击后通过 `GET /rest/app-chat/conversations/deleted` 拉取列表并逐条执行 `DELETE /rest/app-chat/conversations/{conversationId}`。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块的 `SITE === 'grok'` 分支处理；默认语义为 Enter/Shift+Enter 换行、Cmd/Ctrl+Enter 发送，并保留发送前“空输入/生成中”保护。
- 剩余额度面板：`grok_rate_limit_display` 采用**右下角常驻极简卡片**（固定 `right:0/bottom:0`，无展开/收起、无菜单、不可拖拽），仅显示 `all` 积分值（例如 `400/400`）。2026-02-25 起移除 `4.2 / 4.2 heavy` 展示（对应接口失效）。刷新策略为“发送后延迟刷新”（不做常驻轮询）；检测到历史版额度面板 DOM 时会直接重建新卡片，避免遗留节点导致双层 UI。
- Scroll-lock 协议：与 ChatGPT/Qwen/Kimi 保持一致，统一使用 `channel/v/nonce` bridge 信封；`AISHORTCUTS_SCROLLLOCK_STATE/BASELINE/ALLOW` 与 `QUICKNAV_SCROLL_GUARD_READY` 均做同 nonce 校验。
- 路由监听：优先复用 shared bridge（`__aichat_quicknav_bridge_v1__`）的 `routeChange` 信号；保留 polling fallback 兜底，不再本地 patch `history.pushState/replaceState`。
- 调试烟测脚本（DevTools Console）：`dev/scroll-tests/grok-scroll-lock-smoke.js`。

### 10.4 Genspark 行为备注（生产支持面）

- 站点范围：`https://www.genspark.ai/*`；QuickNav 与 Cmd/Ctrl+Enter 仅在 `https://www.genspark.ai/agents*` 生效，其它 Genspark 专项模块按模块定义覆盖全站或 agents 子路径。
- QuickNav 注入：`content/genspark-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作，行为口径与 ChatGPT/Qwen/Kimi/Grok 一致。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块注入 `quicknav_genspark_cmdenter_send`，沿用统一发送策略（Enter/Shift+Enter 换行，Cmd/Ctrl+Enter 发送）。
- Genspark 专项模块：
  - `genspark_moa_image_autosettings`：全站注入，绘图场景自动展开设置并设置默认画质；
  - `genspark_credit_balance`：全站注入，展示积分余量浮层；
  - `genspark_codeblock_fold`：agents 路径注入，长代码块折叠/展开；
  - `genspark_inline_upload_fix`：agents 路径注入（MAIN world），修复消息编辑态附件上传；
  - `genspark_force_sonnet45_thinking`：agents 路径注入（MAIN world），仅对 `claude-sonnet-4-5`（含日期后缀）强制切到 `claude-sonnet-4-5-thinking`，并展示可折叠思考块。
- 回归覆盖：`dev/test-genspark-injection-routing.js`（注入路由） + `dev/test-genspark-scroll-lock-bridge.js`（协议/握手/路由监听） + `dev/test-genspark-preview-filter.js`（toolcall/thinking transient 过滤 + 缓存策略） + `dev/test-genspark-thinking-model-map.js`（仅 Sonnet 4.5 映射） + `dev/test-genspark-thinking-compat-payload.js`（禁止跨版本模型/全局 thinking payload 改写） + `dev/test-quicknav-runtime-naming.js`（命名兼容）共同覆盖，防止误删或风格回退。

### 10.5 DeepSeek 行为备注（生产支持面）

- 站点范围：`https://chat.deepseek.com/*`（当前纳入 `quicknav` + `cmdenter_send`）。
- QuickNav 注入：`content/deepseek-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块的 `SITE === 'deepseek'` 分支处理，发送前仍保留“空输入/生成中”保护。
- Scroll-lock 协议：与 ChatGPT/Qwen/Kimi/Grok 一致，统一使用 `channel/v/nonce` bridge 信封；`AISHORTCUTS_SCROLLLOCK_STATE/BASELINE/ALLOW` 与 `QUICKNAV_SCROLL_GUARD_READY` 均做同 nonce 校验。
- 路由监听：优先复用 shared bridge（`__aichat_quicknav_bridge_v1__`）的 `routeChange` 信号；保留 `1200ms` polling fallback 兜底，不再本地 patch `history.pushState/replaceState`。
- 运行时命名：新增 `__deepseekQuicknav*` 站点语义 flag，并保留 `__cgpt*` 旧名兼容；调试入口统一到 `window.deepseekQuicknavDebug` / `window.deepseekNavDebug`（保留 `window.chatGptNavDebug` 别名）。
- 回归覆盖：`dev/test-deepseek-injection-routing.js`（注入路由） + `dev/test-deepseek-scroll-lock-bridge.js`（协议/握手/路由监听）共同覆盖，防止路由与桥接协议回退。

### 10.6 Gemini App 行为备注（生产支持面）

- 站点范围：`https://gemini.google.com/*`；QuickNav 仅在 `https://gemini.google.com/app*` 生效（`gemini enterprise` 不在本轮支持范围）。
- QuickNav 注入：`content/gemini-app-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块注入 `quicknav_gemini_app_cmdenter_send`，沿用统一发送策略（Enter/Shift+Enter 换行，Cmd/Ctrl+Enter 发送）。
- 首屏模型预设：Gemini App 首次加载时会在有限重试窗口内检查模式按钮；当当前模式不是 `Pro/Thinking` 时，会通过 mode picker 尝试自动切到 `Pro`（兼容 `Flash/Fast` 文案与延迟渲染场景）。切换结束后会把焦点与光标恢复到输入框末尾。若账号无 `Pro` 选项则立即停止，不做常驻 keepalive（仅刷新/新加载时重新触发）。
- 协议与路由：已切到 `channel/v/nonce` bridge 契约；路由监听优先消费 shared bridge `routeChange`，保留 polling fallback，不再 patch `history.pushState/replaceState`。
- 运行时命名：canonical 调试入口 `window.geminiNavDebug`（保留 `window.chatGptNavDebug`）；运行时 flag 采用 `__quicknavGeminiApp*` + `__cgpt*` 兼容双写。
- 流式回复稳定性：新增“手动选择冻结窗口”（`manualSelectionHoldUntil`），在流式中点击导航项/键盘跳转后短暂抑制 `updateActiveFromAnchor()` 自动抢焦点，并在 `renderList()` 重渲染后按 `currentActiveId` 立即恢复 active 样式，降低“点击时导航项被快速刷新抢回/抖动”风险。
- 预览文案净化：`user-query` 预览优先提取 `.query-text-line`，并对历史缓存统一净化 `You said / Gemini said` 前缀，避免导航项反复显示系统标签而非用户真实输入。
- 回归覆盖：`dev/test-gemini-app-quicknav-kernel.js`（桥接、命名、路由监听 + 手动选择冻结窗口 + rerender active 恢复约束） + `dev/test-multi-site-injection-routing.js`（注入链路）。

### 10.7 文心一言（Ernie）行为备注（生产支持面）

- 站点范围：`https://ernie.baidu.com/*`。
- QuickNav 注入：`content/ernie-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块注入 `quicknav_ernie_cmdenter_send`，保持统一发送语义。
- Cmd/Ctrl+Enter 稳定性：Ernie 输入框识别改为“`[contenteditable][role=textbox]` + 发送控件邻域”双重判定；发送控件解析采用“`sendInner/sendBtnLottie` 内层节点优先、`send__/sendBtn` 外层容器回退”顺序，并补发 `mousedown/mouseup/click` 事件序列，兼容 AB 变体与 React 委托点击路径。
- 首屏模型预设：Ernie 首次加载时会在有限重试窗口内自动尝试切换到 `ERNIE 5.0`；命中后停止重试，不做长驻轮询。
- 助手预览抽取：针对 Ernie “thinking 与最终回答同卡”结构，QuickNav 预览解析以完整容器为第一候选并优先提取最终回答片段；thinking 预览标记为 transient，不写入 `previewCache`。对无 marker 且含 `User\d+ / Thinking complete` 的片段按 transient 处理，避免后续长期卡在 `Thinking.../ThinkingUser...`。
- Scroll-lock 协议：Ernie 已对齐 `channel/v/nonce` bridge 契约；`AISHORTCUTS_SCROLLLOCK_STATE/BASELINE/ALLOW` 及 `QUICKNAV_SCROLL_GUARD_READY` 握手均要求同 nonce。
- 回归覆盖：`dev/test-multi-site-injection-routing.js`（注入链路）+ `dev/test-ernie-preview-regression.js`（thinking→final 预览 + 缓存策略）+ `dev/test-ernie-scroll-lock-bridge.js`（scroll-lock bridge 协议 + 握手）。

### 10.8 Z.ai（GLM）行为备注（生产支持面）

- 站点范围：`https://chat.z.ai/*`。
- QuickNav 注入：`content/zai-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块注入 `quicknav_zai_cmdenter_send`，保持统一发送语义。
- 回归覆盖：`dev/test-multi-site-injection-routing.js`（registry/default-settings/content-script defs）。
