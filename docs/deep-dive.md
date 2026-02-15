# AI捷径 (AI Shortcuts) MV3 架构与模块深读

> 本文是本仓库唯一需要**手工维护**的架构文档（canonical）。  
> - 站点/模块/注入清单：`docs/scripts-inventory.md`（自动生成，勿手改；跑 `node dev/gen-scripts-inventory.js` 更新）  
> - 站点行为研究：`docs/chatgpt-site-research.md`（偏研究/经验，不追求完整性）
>
> 重点文件入口（建议从这里开始读）：  
> - `manifest.json`（MV3 入口：静态只挂 bootstrap）  
> - `content/bootstrap.js`（document_start 唤醒后台 SW + 兜底注入）  
> - `background/sw.js`（动态注册 content scripts + 设置读写 + reinject）  
> - `shared/registry.js`（站点/模块元数据；Popup/Options 的“单一真相”）  
> - `shared/injections.js`（注入定义；SW 的“单一真相”）

本文以 `manifest.json` 当前内容为准，假设读者了解 Chrome Extension MV3（Service Worker / content scripts / MAIN vs ISOLATED world）。

## TL;DR（一句话）

这是一个 **MV3 多站点脚本平台**（不是“单脚本扩展”）：核心是 **注册表驱动 + 动态注入 + 跨 world 桥接 + 可视化配置（Popup/Options）**。

## 规模与热点（可复现）

当前规模（由 `shared/registry.js` + `shared/injections.js` 实际计算得到；可跑 `node dev/stats.js` 复现）：

- 站点：11（含 `common`）
- 模块：27
- 注入定义：57（MAIN 23 / ISOLATED 34）

代码热点（`wc -l` 口径，仅用于“哪里复杂/容易出问题”，会随提交变化）：

- `content/chatgpt-quicknav.js`（约 5231 行）
- `content/chatgpt-usage-monitor/main.js`（约 4681 行）
- `content/chatgpt-message-tree/main.js`（约 2218 行）
- `background/sw.js`（约 1612 行）
- `options/options.js`（约 3316 行）

---

## 1) 项目定位：一个 MV3 多站点脚本平台

这不是“单一脚本 + 一个站点”的扩展，而是一个“脚本平台”：

- **多站点**：ChatGPT / Gemini / DeepSeek / Qwen / Z.ai / Grok / Genspark / 文心一言等。
- **多模块**：每个站点有一组模块（QuickNav、用量统计、导出对话、UI 修复、快捷键等），并能在 Popup/Options 里配置启用/禁用。
- **工程化目标**：尽量减少静态注入与重复 patch（尤其是 fetch、MutationObserver、滚动相关），通过“单一真相 + 桥接层 + 动态注入”把复杂度收敛到少数核心文件。

---

## 2) 单一真相：`shared/registry.js` + `shared/injections.js`

### `shared/registry.js`（站点/模块元数据：给 UI/文档/维护脚本）

- `SITES`：每个站点 `{id, name, sub, matchPatterns, quicknavPatterns?, modules[]}`
  - `matchPatterns`：站点总体可注入的 URL patterns
  - `quicknavPatterns`（可选）：QuickNav 只在子路径启用（例如只在某些 path 下启用）
- `MODULES`：每个模块的元数据：`name/sub/authors/license/upstream/hotkeys/menuPreview/defaultEnabled`

这份表是 Popup/Options 的“展示与默认值来源”，也是 `docs/scripts-inventory.md` 的生成来源。

### `shared/injections.js`（注入定义：给后台 SW 动态注册 content scripts）

核心导出：`globalThis.QUICKNAV_INJECTIONS`：

- `buildDefaultSettings(registry)`：统一生成默认 Settings 结构
- `buildContentScriptDefs(registry)`：生成“内容脚本注册定义”（每条定义包含 `id/siteId/moduleId/matches/js/css/runAt/world/allFrames`）
- 关键常量：
  - `MAIN_GUARD_FILE = 'content/scroll-guard-main.js'`（MAIN world 滚动拦截器）
  - `EXTRA_HOST_PERMISSIONS`（后台任务额外需要的 host 权限）
  - `EXTRA_SITE_MODULE_FLAGS`（不是模块但要进入 `settings.siteModules` 的布尔开关）

结论：**新增/改站点或模块**，大概率只需要改 `shared/registry.js` + `shared/injections.js`，再跑维护脚本同步 `manifest.json` 与文档（见第 9 节）。

---

## 3) 启动与注入主链路（MV3）

### 3.1 静态入口极简：`manifest.json` → `content/bootstrap.js`

设计目标：让 `manifest.json` 的 `content_scripts` 只负责“叫醒 SW + 兜底”，把所有真实功能都交给 SW 动态注册，降低静态注入成本与维护成本。

`content/bootstrap.js` 的职责有两条线：

- **PING**：`QUICKNAV_BOOTSTRAP_PING`（失败会重试 3 次）  
  - 目的：唤醒 SW，并让 SW 做一次“保持注册最新”（但避免每次都 reinject）
  - 优化点：`PING` 成功后也会立即补一轮 `ENSURE`，减少“已注册但当前 tab 未及时生效”的窗口期
- **ENSURE（兜底注入）**：`QUICKNAV_BOOTSTRAP_ENSURE`（快速 + 延迟多轮触发）  
  - 目的：处理 MV3 边缘情况（SW 重启、tab restore 等）导致“已注册脚本没跑起来”的场景  
  - 判断依据：如果页面里没出现 `__aichat_quicknav_bridge_v1__`（桥不存在），就让 SW 对当前 tab 做一次 best-effort 注入
  - 触发源：定时补偿 + `pageshow` + `visibilitychange`

### 3.2 SW 负责动态注册/差异更新：`background/sw.js`

启动时（或每次 SW 被唤醒时）：

1) 读入两份“真相表”：`importScripts('../shared/registry.js', '../shared/injections.js')`
2) 由注入表推导默认设置：`INJECTIONS.buildDefaultSettings(REGISTRY)`
3) 由注入表生成注册定义：`INJECTIONS.buildContentScriptDefs(REGISTRY)`

动态注册是“差异更新”（diff update）而不是全量重灌：

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

Settings 存储在 `chrome.storage.local` 的 `quicknav_settings`（键名在 `background/sw.js` 的 `SETTINGS_KEY`）。

### 4.1 默认设置结构：由 `buildDefaultSettings()` 统一生成

- `enabled: boolean`：总开关（所有模块）
- `sites: Record<siteId, boolean>`：站点级开关
- `scrollLockDefaults: Record<siteId, boolean>`：各站点默认 scroll-lock 策略
- `siteModules: Record<siteId, Record<moduleIdOrExtraFlag, boolean>>`：模块/额外 flag 开关

> `EXTRA_SITE_MODULE_FLAGS` 的开关虽然不是“模块”，但会进入 `siteModules`，供 Options 管理/供 MAIN world 读取。

### 4.2 Patch 模型：Popup/Options 走增量，不做整包覆盖

Popup/Options 常用 `QUICKNAV_PATCH_SETTINGS`（增量）：

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

- `content/quicknav-bridge.js`（ISOLATED）：
  - 小型事件总线：`on/off/emit`
  - `getSettings()`：通过 `QUICKNAV_GET_SETTINGS` 从 SW 拉取（带短缓存）
  - `routeChange`：优先消费 MAIN scroll guard 的 `postMessage(QUICKNAV_ROUTE_CHANGE)`，否则约 1s 级轮询兜底
- `content/quicknav-bridge-main.js`（MAIN）：
  - 小型事件总线：`on/off/emit`
  - `routeChange`：消费 `QUICKNAV_ROUTE_CHANGE` + 约 1.2s 轮询兜底

### 5.2 ChatGPT Core：站点内核（统一 selector/动作/route 生命周期）

为减少 ChatGPT 相关脚本重复（composer/turns/send/stop/route），仓库提供轻量 core：

- `content/chatgpt-core.js`（ISOLATED）
- `content/chatgpt-core-main.js`（MAIN）

提供能力（两边语义尽量一致）：

- route：`getRoute()`、`getConversationIdFromUrl(url)`、`onRouteChange(cb)`（优先桥，否则轮询）
- composer：`getEditorEl()` / `findSendButton()` / `findStopButton()` / `isGenerating()` / `clickSendButton()` / `clickStopButton()`
- turns：`getTurnsRoot()` / `getTurnArticles(root?)` + turns root 观察与健康检查（MAIN 侧有低频 health check）

注入顺序（重要）：在 `shared/injections.js` 的 ChatGPT 相关 defs 中，`chatgpt-core*.js` 会排在各模块脚本之前，保证“后来的脚本可以直接用 core”。

### 5.3 Menu Bridge：把 GM 菜单变成 Popup 按钮

项目把“用户脚本的 GM 菜单”做成了扩展 Popup 的按钮列表：

- 页面侧注册：`window.__quicknavRegisterMenuCommand(name, fn)`（`content/menu-bridge.js`）
- Popup 读取/执行：向当前 tab 发消息：  
  - `QUICKNAV_GET_MENU` → 返回 `{href, commands[]}`  
  - `QUICKNAV_RUN_MENU` → 执行某个 `id`

MAIN world 菜单桥（关键）：MAIN world 不能把函数引用交给 ISOLATED，所以 `menu-bridge.js` 通过 `CustomEvent` 做“注册 key / 执行 key”的单向桥接。

### 5.4 Scroll Guard：MAIN world 防自动滚动 + 路由广播

`content/scroll-guard-main.js` 运行在 MAIN world：

- patch `scrollIntoView/scrollTo/scrollBy/scrollTop setter` 等，结合 dataset 的 allow-window 做拦截（防 autoscroll）
- hook `history.pushState/replaceState + popstate/hashchange` 广播 SPA 路由变化：`postMessage({type:'QUICKNAV_ROUTE_CHANGE'})`
- ready 信号：`postMessage({type:'QUICKNAV_SCROLL_GUARD_READY'})`

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
  - 请求注入 MAIN guard：`QUICKNAV_ENSURE_SCROLL_GUARD`
  - dataset：`document.documentElement.dataset.quicknavScrollLockEnabled/AllowScrollUntil/Baseline`
  - postMessage：`QUICKNAV_SCROLLLOCK_STATE/BASELINE/ALLOW`
- 与消息树交互：`QUICKNAV_CHATGPT_TREE_*`（summary / open / close / navigate 等）

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

### 6.2 fetch hub（`content/chatgpt-fetch-hub/main.js`，MAIN）

定位：**全局 fetch 能力中枢**。多个模块都需要拦截 ChatGPT 的对话请求与 SSE 流，因此用 hub 统一 patch，避免重复 patch fetch。

- hub 注册：`hub.register({ beforeFetch, onConversationStart, onConversationSseJson, priority })`
- SSE 解析与安全上限：对 buffer/event 设 cap，避免异常流撑爆内存
- Cloudflare 兼容：检测挑战页/turnstile，必要时延迟/跳过 patch，保持原生 fetch

常见依赖模块（ChatGPT 站点）：用量统计 / 回复计时器 / 下载修复 / thinking toggle 等。

### 6.3 message tree（`content/chatgpt-message-tree/main.js`，MAIN）

定位：对话“完整消息树/分支结构”的侧边面板（只读），并与 QuickNav 协作导航到某个分支节点。

- 对话拉取：`GET /backend-api/conversation/:id`
- 大对话内存保护：设置 JSON 上限（6MB 解压后），超限直接拒载以保稳定性
- QuickNav 桥协议：`QUICKNAV_CHATGPT_TREE_*`（summary/toggle/open/close/refresh/navigate）
- 缓存回收：关闭时主动丢弃大 mapping（避免常驻占用）

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

### 6.6 ChatGPT Perf（`content/chatgpt-perf/content.js` + `content/chatgpt-perf/content.css`）

定位：渲染性能调优层（离屏虚拟化 + 重内容优化 + 可选视觉降级）。

- 核心策略：默认开启离屏虚拟化/重内容优化等主性能项；分段虚拟化与极限轻量默认关闭（稳定性优先）
- 功能变更：已移除“禁用毛玻璃（`disableBackdropFilters`）”独立开关
- 极限轻量：当前仅保留对 filter/阴影/动画/过渡的降级，不再覆盖 backdrop-filter
- 维护原则：涉及全局样式开关时，优先“窄选择器 + 可回滚默认值”，避免在长对话中触发大范围样式失效与内存压力。

---

## 7) Popup / Options 交互层

### Popup（`popup/popup.js`）

- 读取/修改设置：`QUICKNAV_GET_SETTINGS`、`QUICKNAV_PATCH_SETTINGS`
- 菜单发现/执行：向当前 tab 发 `QUICKNAV_GET_MENU`、`QUICKNAV_RUN_MENU`
- 更新检查：拉取远端 `manifest.json` version 做对比（仅提示，不自动更新）

### Options（`options/options.js`）

- 主入口：三栏布局（站点/模块/设置）+ 模块设置面板路由（`renderModuleSettings(...)`）
- 设置操作：`QUICKNAV_GET_SETTINGS`、`QUICKNAV_PATCH_SETTINGS`、`QUICKNAV_RESET_DEFAULTS`
- OpenAI 资源监控：通过 `QUICKNAV_GPT53_*` 与 SW 交互（探测/通知/标记已读）；当资源可访问时会在 `chatgpt.com` 显示页内横幅（不可点击关闭，需删除 URL 才会停止提醒）
- 横幅“打开配置”动作：内容脚本通过 `QUICKNAV_OPEN_OPTIONS_PAGE` 交给 SW 调扩展 API 打开配置页（优先 `chrome.tabs.create(optionsUrl)`，失败再 fallback `chrome.runtime.openOptionsPage()`），不再 fallback 到页面侧 `chrome-extension://` 跳转，规避 `ERR_BLOCKED_BY_CLIENT` 拦截。

---

## 8) 后台消息协议（快速索引）

面向“系统链路”的核心消息（建议把这些当作内部 API）：

- 启动类（bootstrap → SW）：`QUICKNAV_BOOTSTRAP_PING`、`QUICKNAV_BOOTSTRAP_ENSURE`
- 设置类（Popup/Options → SW）：`QUICKNAV_GET_SETTINGS`、`QUICKNAV_SET_SETTINGS`、`QUICKNAV_PATCH_SETTINGS`、`QUICKNAV_RESET_DEFAULTS`
- 注入类（Popup/内容脚本 → SW）：`QUICKNAV_REINJECT_NOW`、`QUICKNAV_ENSURE_SCROLL_GUARD`
- 菜单类（Popup ↔ 内容脚本）：`QUICKNAV_GET_MENU`、`QUICKNAV_RUN_MENU`
- 监控类（Options ↔ SW）：`QUICKNAV_GPT53_GET_STATUS` / `SET_URLS` / `RUN` / `MARK_READ` / `ALERT`
- 横幅跳转类（Banner 内容脚本 → SW）：`QUICKNAV_OPEN_OPTIONS_PAGE`

---

## 附录 A) 关键锚点（file:line）

> 行号会随提交漂移；优先用 `rg -n "关键字" 文件` 重新定位。这里的目的是“给宏观链路一个可快速跳转的入口”。

### 启动与注入

- `manifest.json`：静态只注入 `content/bootstrap.js`（其余脚本由 SW 动态注册）
- `content/bootstrap.js:24`：`ensureInjected(reason)`（兜底注入入口）
- `content/bootstrap.js:41`：发送 `QUICKNAV_BOOTSTRAP_ENSURE`
- `content/bootstrap.js:54`：发送 `QUICKNAV_BOOTSTRAP_PING`
- `content/bootstrap.js:69`：快速/延迟多轮 `scheduleEnsure(...)`
- `background/sw.js:10`：`importScripts('../shared/registry.js', '../shared/injections.js')`
- `background/sw.js:17`：默认设置由注入表推导（`buildDefaultSettings`）
- `background/sw.js:28`：注入定义由注入表生成（`buildContentScriptDefs`）
- `background/sw.js:592`：动态注册“差异更新”主函数 `applyContentScriptRegistration(settings)`
- `background/sw.js:1315`：处理 `QUICKNAV_BOOTSTRAP_PING`
- `background/sw.js:1355`：处理 `QUICKNAV_BOOTSTRAP_ENSURE`
- `background/sw.js:1596`：`onInstalled` → 注册 + reinject
- `background/sw.js:1601`：`onStartup` → 仅保持注册（避免 session restore 双重注入）

### 配置与状态

- `shared/registry.js:8`：站点表 `SITES`
- `shared/registry.js:87`：模块表 `MODULES`
- `shared/injections.js:91`：`buildDefaultSettings(registry)`
- `shared/injections.js:126`：`buildContentScriptDefs(registry)`
- `background/sw.js:262`：SW 端 patch 白名单校验 `applySettingsPatchOps(current, patch)`
- `background/sw.js:668`：设置写入串行化 `runSettingsMutation(fn)`
- `popup/popup.js:191`：读取设置 `QUICKNAV_GET_SETTINGS`
- `popup/popup.js:203`：增量 patch `QUICKNAV_PATCH_SETTINGS`
- `options/options.js:449`：读取设置 `QUICKNAV_GET_SETTINGS`
- `options/options.js:461`：增量 patch `QUICKNAV_PATCH_SETTINGS`
- `options/options.js:467`：恢复默认 `QUICKNAV_RESET_DEFAULTS`
- `options/options.js:3083`：模块设置面板路由 `renderModuleSettings(...)`

### 桥接层（跨模块/跨 world 基础设施）

- `content/menu-bridge.js:10`：`window.__quicknavRegisterMenuCommand`（菜单注册入口）
- `content/menu-bridge.js:183`：处理 `QUICKNAV_GET_MENU`
- `content/menu-bridge.js:199`：处理 `QUICKNAV_RUN_MENU`
- `content/scroll-guard-main.js:591`：scrollTop setter patch（Gemini/ChatGPT autoscroll 关键路径）
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
- `content/chatgpt-quicknav.js:3960`：请求注入 MAIN guard：`QUICKNAV_ENSURE_SCROLL_GUARD`
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
   - 从 `registry/injections` 同步 `manifest.json.host_permissions` 与 bootstrap 的 `matches`
2) `node dev/gen-scripts-inventory.js`  
   - 根据 `registry/injections` 生成 `docs/scripts-inventory.md`（站点/模块/注入细节清单）
3) `node dev/check.js`  
   - JS 语法检查 + manifest/registry/injections 一致性校验
4) `node dev/stats.js`  
   - 打印站点/模块/注入规模统计（用于更新本文的“规模与热点”）

推荐改动后顺序（尤其是改了 `shared/registry.js` / `shared/injections.js` 时）：

- 跑 `node dev/sync-manifest.js` → `node dev/gen-scripts-inventory.js` → `node dev/check.js`

### 9.1 恢复出厂（全量清空扩展数据）

当出现“升级后行为异常 / 老版本缓存冲突 / 注入表注册状态异常”等问题时，优先做一次恢复出厂，让扩展回到“新浏览器刚加载”的状态，再继续排查。

- 入口：`options/options.html` 底部按钮 **恢复出厂（清空所有数据）**
- 行为（后台 `QUICKNAV_FACTORY_RESET`）：
  - 清空 `chrome.storage`：`local/sync/session`
  - 注销所有已注册的 content scripts（`chrome.scripting.unregisterContentScripts({})`）
  - 清空 DNR `dynamic/session rules`（如有）
  - best-effort 清空 extension origin 的 `caches` / `indexedDB`
  - 清空 `chrome.alarms`，并 `chrome.runtime.reload()` 重新加载扩展
- 做完后：**刷新**已打开的目标网站标签页（例如 `chatgpt.com`），让内容脚本重新按最新定义注入

## 10) 近期维护记录（手工更新）

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
