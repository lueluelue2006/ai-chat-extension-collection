# AI捷径 (AI Shortcuts) MV3 架构与模块深读

> 本文是本仓库唯一需要**手工维护**的架构文档（canonical）。  
> - 站点/模块/注入清单：`docs/scripts-inventory.md`（自动生成，勿手改；跑 `node scripts/gen-scripts-inventory.js` 更新）  
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

这是一个 **MV3 脚本平台（当前范围 ChatGPT + Google 搜索 + Qwen + Kimi + DeepSeek + Gemini App + 文心一言 + Z.ai + Grok + Genspark）**：核心是 **注册表驱动 + 动态注入 + 跨 world 桥接 + 可视化配置（Popup/Options）**。

## 规模与热点（可复现）

请以 `node scripts/stats.js` 的当次输出为准。2026-03-08 这次审计时的输出是：

- 站点：11（含 `common`）
- 模块：29
- 注入定义：59（MAIN 22 / ISOLATED 37）

代码热点（`wc -l` 口径，仅用于“哪里复杂/容易出问题”；请以本地现跑结果为准。2026-03-05 审计时示例输出如下）：

- `content/chatgpt-quicknav.js`（6642 行）
- `content/chatgpt-usage-monitor/main.js`（5536 行）
- `content/chatgpt-message-tree/main.js`（2671 行）
- `options/options.js`（约 3900 行）
- `background/sw/router.ts`（211 行）

---

## 1) 项目定位：ChatGPT + Google 搜索 + Qwen + Kimi + DeepSeek + Gemini App + 文心一言 + Z.ai + Grok + Genspark 的 MV3 脚本平台

当前交付策略是“ChatGPT 主线 + 多站点统一内核能力 + 可扩展骨架保留”的脚本平台：

- **当前范围**：生产支持 `chatgpt.com`、`www.google.com`（Google 搜索页问 GPT 入口）、`chat.qwen.ai`、`kimi.com`/`www.kimi.com`、`chat.deepseek.com`、`gemini.google.com`（QuickNav 仅 `/app*`）、`ernie.baidu.com`、`chat.z.ai`、`grok.com` 与 `www.genspark.ai`（Genspark QuickNav 仅在 `/agents*`）。
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
  - `MAIN_BRIDGE_FILES = ['shared/i18n.js', 'content/aishortcuts-scope-main.js', 'content/aishortcuts-bridge-main.js', 'content/aishortcuts-i18n-main.js']`
  - `QUICKNAV_KERNEL_FILES = ['runtime-guards.js', 'route-watch.js', 'scrolllock-bridge.js', 'observer-refresh.js']`
  - `CHATGPT_FETCH_HUB_CONSUMER_FILES = ['chatgpt-fetch-hub/main.js', 'chatgpt-fetch-hub/consumer-base.js']`
  - `MAIN_GUARD_FILE = 'content/scroll-guard-main.js'`（MAIN world 滚动拦截器）
- `EXTRA_HOST_PERMISSIONS`（后台任务额外需要的 host 权限）
- `EXTRA_SITE_MODULE_FLAGS`（不是模块但要进入 `settings.siteModules` 的布尔开关）
- 顶层快捷键能力：`settings.metaKeyMode = auto | has_meta | no_meta`
  - `auto`：按当前设备环境推断是否有 Meta 键（当前实现把 macOS 视为有 Meta 键，Windows/Linux 视为无 Meta 键）
  - `has_meta` / `no_meta`：允许用户在 Options 页手动覆盖
  - 受影响模块目前有 `chatgpt_thinking_toggle`、`qwen_thinking_toggle`、`chatgpt_quick_deep_search`、`chatgpt_tab_queue`（仅 `Ctrl+C` 清空输入框受 Meta 能力约束）
- 顶层界面语言：`settings.localeMode = auto | zh_cn | en`
  - `auto`：仅浏览器明确为简体中文时使用中文；其他语言或无法判断时默认英文
  - `zh_cn` / `en`：允许用户在 Options 页手动覆盖

QuickNav 当前注入顺序（核心口径）：

- ISOLATED：`aishortcuts-scope.js` -> `aishortcuts-bridge.js` ->（站点前置文件）-> `aishortcuts-kernel/*` -> 站点 `*-quicknav.js`
- MAIN（scroll guard）：`shared/i18n.js` -> `aishortcuts-scope-main.js` -> `aishortcuts-bridge-main.js` -> `aishortcuts-i18n-main.js` -> `scroll-guard-main.js`

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
2) `background/sw.js` 再按顺序加载 `./sw/chrome.js`、`storage.js`、`registration.js`、`monitors.js`、`reset.js`、`diag.js`、`router-handlers/{bootstrap,settings,gpt53,admin}.js`、`router.js`
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
从 2026-03-05 的安全收口开始，这条桥不再只看 `group + handlerKeyPrefix`；注册侧还会校验扩展脚本来源，执行侧也只接受由 `content/menu-bridge.js` 触发的 run 事件，避免页面脚本伪造同名 `CustomEvent` 混入弹窗菜单。
- 2026-03-12 起，MAIN world 注册事件会显式携带 `moduleId + source`，桥接层优先用显式来源做白名单判断，只把调用栈探测当 fallback，避免消息树/用量统计在英文模式或异步回调下丢失菜单命令。

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

### 5.6 Google 搜索 -> ChatGPT handoff（2026-03）

这次新增的 `google_ask_gpt` 不是简单把搜索词拼到外链里，而是拆成两端脚本：

- **Google 搜索侧（ISOLATED）**：`content/google-ask-gpt/main.js`
  - 仅在 `www.google.com` 的 `/` 与 `/search` 页工作
  - 复用当前搜索框 `q`，在原生 Search 按钮后插入 `G 问 GPT`
  - 点击后新开 `https://chatgpt.com/?aichat_google_ask=1&prompt=...`
  - sender 直接写入完整 prompt，不依赖 hash，也不抄第三方脚本提示词

- **ChatGPT 接收侧（MAIN）**：`content/chatgpt-google-ask/main.js`
  - 通过同一个模块开关受控，但实际注入到 `chatgpt.com`
  - 读取 `aichat_google_ask=1&prompt=...` 后等待原生 `?prompt=` 预填完成
  - 强制把本次首发 payload 设为：
    - `model = gpt-5-4-thinking`
    - `thinking_effort = min`
  - 然后直接走原生发送按钮，不靠二次改写 DOM 文本来“伪造发送”

设计取舍：

- **sender 挂在 Google 站点，receiver 挂在 ChatGPT 站点**，但两者共用同一个 `google_ask_gpt` 模块开关；这样用户只需要在 Google 搜索页开关一次，不必在 ChatGPT 再额外暴露一组配置。
- receiver 运行在 MAIN world，是为了复用 ChatGPT fetch hub consumer，在最终 `conversation` 请求发出前稳定覆写 `model/thinking_effort`。
- handoff 只做“把搜索词交给 ChatGPT 并自动发出”，不接管后续会话生命周期，也不改写其他 ChatGPT 搜索相关模块。
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
- 与 Tab 队列协作：
  - turn DOM 上的 `data-aichat-tab-queued*` 属性用于给用户消息打“队列已发送”标记
  - bridge 消息：`AISHORTCUTS_CHATGPT_TAB_QUEUE_MARKS_CHANGED` / `AISHORTCUTS_CHATGPT_TAB_QUEUE_ACK_HIGHLIGHT`
  - QuickNav 行项会把这类用户消息渲染成橙色；用户点击后立即发 ACK，让 MAIN world 清掉该标记

Turn 筛选策略（维护重点）：

- 统一占位常量：`PREVIEW_PLACEHOLDER = '...'`，避免各处魔法字符串。
- 统一判定函数：`isAssistantTransientPlaceholderTurn()` 负责识别“思考/整理/Finalizing/Answer now”等临时节点。
- 缓存策略：只缓存真实 preview，不缓存占位符，降低旧占位残留导致的错误复用。
- 渲染策略：临时思考节点不进入列表，不占编号；仅稳定消息进入 QuickNav。

面板与存储（用户态数据都在页面 localStorage）：

- 面板 DOM：`#cgpt-compact-nav`（样式：`#cgpt-compact-nav-style`）
- 存储命名空间：`cgpt-quicknav:*`  
  - `cgpt-quicknav:nav-width` / `cgpt-quicknav:nav-pos`  
    - `nav-pos` 仅持久化用户手动拖拽后的面板坐标；“重置问题栏位置”会清掉该键，并恢复到视口右上角默认位（`top=1px`, `right=1px`）
  - `cgpt-quicknav:scroll-lock`  
  - `cgpt-quicknav:cp:${location.pathname}`（📌检查点）  
  - `cgpt-quicknav:fav:${location.pathname}` / `cgpt-quicknav:fav-filter:${location.pathname}`（收藏与过滤）
- 语言同步：
  - QuickNav 会额外读取扩展设置 `aichat_ai_shortcuts_settings_v1.localeMode`，在 ISOLATED world 里直接刷新自身文案，避免路由切换或页面晚挂载时遗漏英文状态。
  - 英文模式下，紧凑树按钮使用 `🌳`，空态使用 `No conversations yet`。
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

- 回复计时器策略：优先订阅 `onConversationStart` / `onConversationDone` 做事件化计时；仅在 fetch-hub 不可用时回退 DOM（stop-button）检测，减少长对话下误判与额外开销。`GPT` 的 `Pro` 族模型默认不计时，避免把 `Pro thinking` 这类长时交互阶段也算进右下角计时器。

### 6.2A Tab queue（`content/chatgpt-tab-queue/main.js` + `content/chatgpt-tab-queue/config-bridge.js`）

定位：给 ChatGPT composer 增加“像 Codex CLI 一样排队发送”的轻量消息队列。

- 主交互：
  - `Tab`：把当前草稿加入队列；若当前轮已空闲，则立即发出队首
  - `⌥↑ / Alt+↑`：取回最近一条 queued draft（LIFO 取回）
  - `Ctrl+C`：清空当前输入框；仅在“有 Meta 键”配置下生效，目标是尽量保留 `Cmd+Z` 撤销链
  - `Shift+Tab`：只拦浏览器原生焦点切换，不承载额外业务语义
- 队列模型：
  - 自动发送顺序是 FIFO；每次只在当前轮真正结束后发下一条
  - 排队预览里的每条 queued draft 末尾都有单独的删除按钮，方便直接丢掉中间某一条
  - 当队列被清空时，会把 route 绑定、pending gate、awaitingConversationStart 和 stream 状态一起清掉；后续新排的消息会重新绑定当前对话，不要求用户刷新页面
  - 模型门禁现在只会拦 `Extended Pro`；`5.2 Pro Standard` 和 `5.4 Pro Standard` 这类普通 Pro 会进入同一套队列与续发链路
  - “真正结束”不是只看 send/stop 按钮，也不是只看 fetch hub 的 `onConversationDone`；当前实现会同时观察 transport handoff、composer 生成态，以及 `GET /backend-api/conversation/:id/stream_status`
  - 手动点发送后的那段“请求尚未真正起飞”的短空窗，会先挂一个 `manualSendInterlock`；这时新的 `Tab` 草稿只允许进队列，不允许立刻抢发，直到真实 `/backend-api/f/conversation` 或 `/backend-api/f/steer_turn` 起飞、生成态出现，或超时自清
  - `queue_tab` 现在会优先吃掉按键触发瞬间看到的草稿快照，而不是事后再去重新抓 live composer；这样在 ChatGPT 手动发送后 composer 重建的短窗口里，第一次 `Tab` 不会再因为读到“新输入框是空的”而把草稿吞掉
  - queued 消息只有在 fetch hub 确认真实的 conversation request 已开始后才会出队；像“首页建会话时只插入用户气泡、但没真正发出请求”这种假发送，不会再被误判成成功
  - 预览修复循环除了重绘排队条，也会在“当前又回到了原对话”时主动补一次续发检查；这样即使 ChatGPT 的 SPA route 信号偶发漏掉，队列也会在下一轮修复 tick 自愈恢复
  - 为了减少输入时的额外开销，预览修复循环不再每 1.2 秒强制整块重绘；只有队列卡住一段时间或预览节点被 SPA 挪丢时，才会做自愈修复
  - 首页首发时，如果当前 composer 本来就已经是这条 queued 草稿，会优先走同步按钮快路径，不再先经过一轮异步 queue 调度；这样能避开首页首次建会话时额外的几秒空等
  - 仅支持纯文本队列；检测到附件时不会把草稿入队
  - 如果某条消息已经进了队列，而用户在它等待期间又往当前 composer 里追加了图片/文件，队列也会在真正发送前再次检查附件状态；只要检测到未排队附件，就暂停续发，避免把“后来加的附件”夹带到早先那条 queued 消息里。附件被移除后，composer 结构变化会立刻触发预览刷新与续发重试，队列不会卡死在旧的“有附件”暂停态。
- 配置桥：
  - `config-bridge.js` 把 `chatgpt_tab_queue_queue_shortcut`、`chatgpt_tab_queue_ctrl_c_clear`、`chatgpt_tab_queue_quicknav_mark` 同步到 dataset
  - `chatgpt_tab_queue_ctrl_c_clear` 会再经过 Meta 能力策略裁剪，Windows/Linux 默认不启用
- QuickNav 联动：
  - 队列发出的用户消息会在 turn DOM 上写入 `data-aichat-tab-queued*` 属性
  - `content/chatgpt-quicknav.js` 在索引阶段读取这些属性，把对应行渲染成橙色，并在用户点中后回发 ACK 清标记

### 6.3 message tree（`content/chatgpt-message-tree/main.js`，MAIN）

定位：对话“完整消息树/分支结构”的侧边面板，并与 QuickNav 协作导航到某个分支节点。

- 对话拉取：`GET /backend-api/conversation/:id`
- 共享能力：优先复用 `content/chatgpt-mapping-client/main.js`（统一 URL 解析、auth/session 缓存、6MB 上限流式 JSON 读取），模块内保留兼容 fallback。
- 大对话内存保护：设置 JSON 上限（6MB 解压后），超限直接拒载以保稳定性
- QuickNav 桥协议：`AISHORTCUTS_CHATGPT_TREE_*`（summary/toggle/open/close/refresh/navigate）
- 缓存回收：关闭时主动丢弃大 mapping（避免常驻占用）
- 凭据边界：auth/session 缓存放在闭包内 `authCache`，`window.__aichat_chatgpt_message_tree_state__` 不再暴露 `token/accountId/deviceId`
- 导出：在面板头部提供 `Export JSON`，并保留主菜单命令“导出完整树为 JSON”（整棵 mapping + 统计）
  - `menu-bridge` 的 MAIN-world 白名单现在按 `moduleId + handlerKeyPrefix + sourceIncludes` 验证，不再把本地化后的 `group` 文案当成唯一准入条件，避免英文模式下消息树导出命令被桥接层误拦截。

### 6.4 thinking toggle（`content/chatgpt-thinking-toggle/main.js` + `content/chatgpt-thinking-toggle/config-bridge.js`）

定位：推理强度/模型快捷键模块（MAIN world 执行 DOM 操作；ISOLATED 用 config-bridge 把开关写到 dataset 供 MAIN 读取）。

- 入口 guard：模块会避免“重复安装”造成热键 double-trigger
- 热键队列：`enqueueHotkeyAction()` + `drainHotkeyQueue()`（串行执行）
- 配置桥：`config-bridge.js` 把扩展设置同步到 `document.documentElement.dataset`（MAIN world 可读）
- 快捷键能力策略：当 `metaKeyMode=no_meta`（或 `auto` 推断为无 Meta 键）时，`⌘O / ⌘J` 默认停用；若用户显式开启 `chatgpt_thinking_toggle_hotkeys_force`，则仍继续把有效开关写入 dataset，但 Options 列表仍保留警告提示
- 推理强度识别：`⌘O` 优先按菜单结构（`menuitemradio` 顺序 + `aria-checked`）判定切换对，不依赖具体界面语言；英文关键词仅作为可选增强。
- 焦点收尾：`⌘O / ⌘J` 成功切换后都会主动把焦点与光标恢复到当前 composer 末尾，减少切换后继续输入时的断流感。

### 6.4A 快捷键能力策略（Meta 键抽象）

定位：把“当前是什么系统”收敛成“当前按有/无 Meta 键处理”，并把限制下沉到快捷键层，而不是整模块层。

- 顶层设置：`settings.metaKeyMode`
  - `auto`：按当前环境推断
  - `has_meta`：手动指定“我有 Meta 键”
  - `no_meta`：手动指定“我没有 Meta 键”
- 受影响模块：
  - `chatgpt_thinking_toggle` / `qwen_thinking_toggle`：依赖 Meta 键，`no_meta` 下默认停用快捷键，但保留模块注入与页面逻辑
  - `chatgpt_quick_deep_search`：`Ctrl+S / T / Y / Z` 在 `no_meta` 设备上默认停用，避免与浏览器/系统快捷键冲突；需要时可用 force flag 强制保留
- 设计原则：**只禁快捷键，不禁模块注入**。这样不会误伤非快捷键逻辑，也避免跨设备同步时把整模块直接关掉。
- UI 反馈：Options 页模块列表会对受影响模块显示悬停警告；详情页允许 force-enable，但会在开启时弹出风险确认。

### 6.5 usage monitor（`content/chatgpt-usage-monitor/main.js` + `content/chatgpt-usage-monitor/bridge.js`）

定位：ChatGPT 用量统计（更偏“记录/配置/导入导出”，UI 与数据结构都比较复杂）。

- fetch 统计优先走 fetch hub：注册 `hub.register(...)` 监听标准 `conversation` 发送；对 `Pro/Thinking` 生成中追发的 `steer_turn` 额外走 `beforeFetch` 计数，避免漏统插话式续问
- `steer_turn` 的模型归因现在优先读真实请求体，再退回 fetch hub 快照和 `oai-last-model-config` cookie。原因是 fetch hub 的 `ctx.conversation.payload.model` 在部分临时对话追发路径里会短暂滞后，曾把 `gpt-5.2-thinking` 的插话误记到 `gpt-5.3-instant`
- 套餐结构应用：`applyPlanConfig(planType)`（不同 plan 的窗口/配额结构）
- 共享组配额：`sharedQuotaGroups`（多模型共享配额统计）
- 模型矩阵：显示顺序为 `pro -> 4.5 -> thinking -> instant -> other`；`gpt-5.4/5.2/5.1-pro`、`gpt-5.4/5.2/5.1-thinking`、`gpt-5.3/5.2/5.1-instant` 仍按具体模型逐行显示，但同家族成员通过 `sharedQuotaGroups` 联动用量与配额；旧 `gpt-5-pro / gpt-5-thinking / gpt-5-1 / gpt-5` 等历史键会在读取时归并到当前具体模型键
- 配额语义：旧版 `nominalUnlimited` 已做兼容迁移，统一折算为 `3 小时 / 10000 次` 的真实配额；面板与导出不再显示“名义无限”
- 旧版 HTML 月报：Options 页重新接回早期 `exportMonthlyAnalysis()` 风格的深色月报导出，沿用 Chart.js + 折线图/饼图/宽表格的旧样式，而不是新设计稿
- SPA 导航重建与自愈：订阅 bridge `routeChange`，并有低频自愈逻辑避免 React 重挂导致失效
- options 同步桥：`bridge.js` 负责 localStorage ↔ `chrome.storage.local` 双向同步（含版本号/修订号）
- options-only 模式：主链路做 headless 统计与同步，不注入页面悬浮 UI；主要查看/导入/导出入口在 Options

### 6.6 ChatGPT Perf（`content/chatgpt-perf/content.js` + `content/chatgpt-perf/content.css`）

定位：渲染性能调优层（离屏虚拟化 + 重内容优化 + 交互加速）。

- 核心策略：默认开启离屏虚拟化/重内容优化/禁用动画/交互加速/查找解冻；仅“页面内性能菜单”默认关闭（避免常驻浮层干扰）。
- 性能策略：离屏虚拟化窗口已改为“预算自适应”——按 `DOM 节点数 + 公式节点数 + turn 数量` 动态收紧 `padItems`，长对话下优先保证交互流畅与内存稳定。
- 性能策略：`scheduleReconcile` 频率同样按预算等级动态降频（高压力时降低全量 reconcile 频次），减少长对话中的重复样式切换与主线程抖动。
- AB 测量链路（`自动化回归`）已改为**强约束输入源**：reply 仅 `source=path`、bench 仅 `source=logfile`；移除 `session/console` 伪入口，避免“命令可跑但不可取证”。
- AB 样本主键统一：`sample_id = run:block:arm:attempt:round:channel:action_seq`，用于跨 reply/bench/functional 去重与证据追溯。
- 聚合闸门升级：`自动化回归` 现在输出 `derived/quality.json`，并执行硬门槛（`latency_p95_ratio` / `bench_dt_p95_abs` / `heap_slope_abs` + 可选显著性）；`NO_GAIN` 不再作为成功结果。
- 控制面评估：同一聚合脚本会输出 `derived/control-plane.json`，按 30s 窗口评估触发/退出阈值、冷却窗口与 10 分钟切换频率上限，作为发布前稳定性信号。
- 一键收口：`自动化回归` 会基于已有聚合产物补齐 `index/run-index.json`、`index/evidence-index.jsonl`、`SHA256SUMS`、`derived/rollback-drill.json` 与 `derived/mvp-acceptance-report.json`，用于灰度/回滚演练与放行凭证。
- 工具链回归：`自动化回归` 默认走 `gate` 模式（要求 aggregate=PASS + pipeline acceptance=PASS）；可用 `--mode smoke` 仅验证工件链路是否可跑通。
- 功能变更：已移除“禁用毛玻璃（`disableBackdropFilters`）”独立开关
- 功能变更：已移除“极限轻量（`extremeLite`）”开关与对应样式分支，统一由主性能项负责优化策略。
- 功能变更：已移除“Markdown 分段虚拟化（`virtualizeMarkdownBlocks`）”子策略与对应样式/配置项，避免对块级节点做二次虚拟化。
- 维护原则：涉及全局样式开关时，优先“窄选择器 + 可回滚默认值”，避免在长对话中触发大范围样式失效与内存压力。
- Deep Research 兼容白名单（最小范围）：仅对“包含 Deep Research iframe 的 turn article”放行，解除 `contain/layout paint` 与 `content-visibility` 约束，避免 fullscreen overlay 被父级 article 裁切导致黑屏；其他消息仍走原虚拟化与包含策略。

### 6.7 ChatGPT 对话导出（`content/chatgpt-export-conversation/main.js`，ISOLATED）

定位：导出模块以会话 `mapping` 为优先数据源，导出“当前分支”Markdown / HTML，并保留 DOM 线性导出作为兜底。

- 主链路：`GET /backend-api/conversation/:id`（与消息树同源），不再只依赖当前页面可见 turn
- 共享能力：优先复用 `content/chatgpt-mapping-client/main.js` 拉取 mapping 与 auth 上下文，减少与消息树之间的重复实现
- 分支策略：优先按“页面当前可见分支”解析当前节点并导出 `current -> root` 路径；仅在可见分支无法判定时回退 `current_node`
- 性能策略：可见分支解析走“懒加载 messageId→nodeId 索引”——命中场景保持低开销；仅在首次未命中时构建索引，避免大对话下反复全表扫描
- 图片策略：优先导出现成 URL；遇到 `file-service://` 资源会尝试解析 download URL；解析失败保留 unresolved id 提示
- 容灾：mapping 拉取失败时自动回退“当前可见导出”，避免完全不可用
- 内存保护：沿用 6MB JSON 上限，防止超大对话导出时触发内存峰值

### 6.8 ChatGPT TeX Copy & Quote（`content/chatgpt-tex-copy-quote/main.js`，MAIN）

定位：对含 KaTeX 的复制/引用做“最小作用域修正”，保留原生交互路径，不做全局原型补丁。

- 风险收敛：取消 `Range/Selection` 原型重载，改为事件驱动（`copy` + `pointerdown/click`）
- 交互性能：公式悬停提示改为 `pointermove` 节流（80ms）+ 延迟展示，减少超长公式对话里的 hover 事件风暴
- 复制策略：仅在选区命中 `.katex` 时改写剪贴板；`text/plain` 输出原始 LaTeX，`text/html` 使用变换后的片段
- 引用策略：仅在命中原生 Quote 触发器时进入短窗口补丁，按“原生引用文本 -> LaTeX 引用文本”做一次性替换
- 可维护性：将“选区快照 / 引用变体构造 / 文本替换 / 触发器识别”拆为独立函数，便于单测与回归
- 交互保持：继续支持“悬停 0.8s 提示 LaTeX + 双击公式复制”

---

## 7) Popup / Options 交互层

### Popup（`popup/popup.js`）

- 读取/修改设置：`AISHORTCUTS_GET_SETTINGS`、`AISHORTCUTS_PATCH_SETTINGS`
- 菜单发现/执行：向当前 tab 发 `AISHORTCUTS_GET_MENU`、`AISHORTCUTS_RUN_MENU`
- 更新检查：拉取远端 `dist/manifest.json` version 做对比（仅提示，不自动更新）
- 面向普通用户的下载入口已切到 GitHub Releases：弹窗次按钮直接打开 Releases 页面；更新结果放在弹窗上半区的状态栏里，并明确提示用户下载 `dist.zip`、覆盖原目录、再对当前实例点“重新加载”，不要再次加载另一份未打包目录，否则 Chrome 会把它当成第二个扩展实例。

### Options（`options/options.js`）

- 主入口：编辑型三栏布局（站点/模块/设置）+ 模块设置面板路由（`renderModuleSettings(...)`）
- 设置操作：`AISHORTCUTS_GET_SETTINGS`、`AISHORTCUTS_PATCH_SETTINGS`、`AISHORTCUTS_RESET_DEFAULTS`
- 语言：新增 `localeMode` 顶层设置，支持 `auto / zh_cn / en`；Options 会按该设置对静态壳层、注册表展示文本和异步渲染的模块面板文案做统一本地化
  - 站点页的动态脚本链也会先经过隔离世界 locale bridge，把解析后的 locale 同步到 DOM，并对扩展自有 UI 根节点做本地化；MAIN world 文案则通过 `shared/i18n.js + aishortcuts-i18n-main` 覆盖系统对话框
  - 英文模式目前已实机验证覆盖：`options` 主界面、全部模块设置面板可见文案、`Usage Monitor` 详情面板与监控卡片、`popup` 主界面与更新状态、ChatGPT `QuickNav / Tab queue` 预览、Google 搜索页 `G Ask GPT` 按钮，以及 `chatgpt-usage-monitor` 的 `Export JSON / Export HTML` 与旧版月报标题；其中最新一轮导出的 JSON 共享组名也已经是英文（例如 `Team instant shared pool`）
  - `chatgpt-perf` 当前已把悬浮菜单、按钮状态、测速 toast 与测量来源标签全部接入英文路径；配置页里的 `Performance Optimization` 面板和 `showOverlay=true` 的页内 `Perf` 浮层都已在真实浏览器里验证为全英文
  - `chatgpt-core` 的内存保护/预警通知标题也已跟随界面语言切换，不再在英文模式下发出中文系统通知
  - 非 Genspark 的 QuickNav 克隆页当前已实机验证覆盖：`Qwen`、`GLM (chat.z.ai)`、`DeepSeek`、`Gemini`、`Kimi`、`Grok`；这些页面里可见扩展节点的按钮/描述文案均为英文或 emoji
  - `chatgpt-message-tree` 现已接入独立英文文案：树面板标题、`Simple / Guides / Refresh / Close` 按钮、加载/导出/错误状态与 `Export full tree as JSON` 菜单命令都会随英文模式切换
- OpenAI 资源监控：通过 `AISHORTCUTS_GPT53_*` 与 SW 交互（探测/通知/标记已读）；当前仅接受 `https://developers.openai.com/images/api/models/icons/...` 资源地址，默认每小时轮询一组内置模型图标 URL。当资源可访问时会在 `chatgpt.com` 显示页内横幅。若需停止提醒，清空 URL 列表并保存即可（`MARK_READ` 只清未读标记）
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
- `content/chatgpt-usage-monitor/main.js:1770`：补记 `steer_turn`：`beforeFetch(ctx)`
- `content/chatgpt-usage-monitor/main.js:1917`：套餐结构应用 `applyPlanConfig(planType)`
- `content/chatgpt-usage-monitor/main.js:4604`：订阅 bridge `routeChange`（SPA 导航重建）
- `content/chatgpt-usage-monitor/bridge.js:29`：`SYNC_REV_KEY`（同步修订号）
- `content/chatgpt-usage-monitor/bridge.js:143`：localStorage ↔ `chrome.storage.local` 双向同步入口

## 9) Dev 脚本与维护流程（建议照做）

项目自带的维护脚本（Node 直接运行，无需打包器）：

1) `node scripts/sync-manifest.js`  
   - 从 `registry/injections` 同步 `manifest.source.json` 的 `host_permissions` 与 bootstrap 的 `matches`
2) `node scripts/gen-scripts-inventory.js`  
   - 根据 `registry/injections` 生成 `docs/scripts-inventory.md`（站点/模块/注入细节清单）
3) `npm run check`  
   - JS 语法检查 + manifest/registry/injections 一致性校验
4) `node scripts/stats.js`  
   - 打印站点/模块/注入规模统计（用于更新本文的“规模与热点”）

推荐改动后顺序（尤其是改了 `shared/registry.ts` / `shared/injections.ts` 时）：

- 日常本地回归：`npm test`
- 提交前完整校验：`npm run verify`
- `npm run verify` 会串起 `node scripts/sync-manifest.js` → `node scripts/gen-scripts-inventory.js` → `npm test` → `npm run build`
- 仓库内置 GitHub Actions CI 会在 push / pull_request 上执行同一条主验证链，并检查 `manifest.source.json`、`docs/scripts-inventory.md`、`dist/` 是否存在未提交生成差异

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

### 9.2 恢复出厂（全量清空扩展数据）

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

- **2026-03-09：修复 ChatGPT 图片-only 场景下 Cmd+Enter 不发送**
  - 现象：
    - 在 ChatGPT 新会话里只上传一张图片、不输入任何文本时，原生 `Send prompt` 按钮会在图片处理完成后恢复可点。
    - 旧版 `cmdenter_send` 仍然会把这类 composer 判成“空输入”，因此 `Cmd+Enter` 什么也不做；但手动点原生发送按钮可以正常发出。
  - 修复：
    - `content/chatgpt-cmdenter-send/main.js`：新增 ChatGPT 附件-only 发送判定。只要当前 composer 已出现附件预览、且原生发送按钮本身已启用，就允许 `Cmd+Enter` 直接走原生发送按钮。
    - `content/chatgpt-cmdenter-send/main.js`：保持“空白消息不发送”的旧保护不变；如果原生发送按钮仍是灰的（例如某些不支持的普通文件），热键不会越权硬发。
    - `自动化回归`：新增“有附件预览 + 发送按钮启用”与“发送按钮禁用时仍不得发送”两组回归断言。

- **2026-03-08：修复 ChatGPT Tab queue 在 Thinking 流中的 steer_turn 漏判**
  - 现象：
    - 在 `GPT-5.4 Thinking` 这类“回复还在进行、但已经允许继续输入”的对话里，`stop button` 会短暂消失，旧逻辑把这当成可以继续放行队列。
    - 这时第二次 `Tab` 发送并不会走新的 `/backend-api/f/conversation`，而是被 ChatGPT 接成 `/backend-api/f/steer_turn`。页面会立刻插入新的 user turn，但队列脚本因为没认出这条请求，仍把同一草稿留在队列里，后续就可能表现成重复发送、串发，或者与手动草稿互相干扰。
  - 修复：
    - `content/chatgpt-tab-queue/main.js`：`maybeProcessQueue()` 在真正放行前新增当前会话 `stream_status` 检查，把“流仍活跃但视觉上像是停了”的窗口统一视为 busy，避免队列误把插话窗口当成正常完成。
    - `content/chatgpt-tab-queue/main.js`：通过 fetch hub `beforeFetch` 识别 `/backend-api/f/steer_turn`，把它记作真实发送起点；一旦真的落进该路径，也不会再把同一草稿继续留在队列里。
    - `content/chatgpt-tab-queue/main.js`：当一次 queued 发送被识别为 `steer_turn` 时，会立即把当前会话的 stream cache 标成 `IS_STREAMING`，防止下一条 queued 在同一活跃流里继续滑过去。
    - `自动化回归`：补充 `steer_turn` URL 识别与 queued send start 判定覆盖，避免再次回归到“真实发了但脚本判定没发”的状态。

- **2026-03-08：修复 ChatGPT Tab queue 的首页假发送与周期性空转**
  - 现象：
    - 在 `chatgpt.com` 首页，`Tab queue` 有时会把“用户气泡已经插入、但真实 `/backend-api/conversation` 请求并未发出”的假发送误判成成功，表现为界面像发出去了，但对面 AI 根本不回复。
    - 队列非空时，预览修复循环每 `1.2s` 都会整块重绘并尝试补偿续发，长时间挂着队列时会带来额外 DOM 扫描和体感卡顿。
  - 修复：
    - `content/chatgpt-tab-queue/main.js`：发送确认改成只认 fetch hub 的真实 conversation request 起始，不再把“输入框变空 / user turn 增加 / 首页 route 抖动”当成发送成功证据。
    - `content/chatgpt-tab-queue/main.js`：发送按钮激活链改回更接近人工点击的策略，优先走 ChatGPT 现有 `button.click()` / pointer click / React click，不再把 `form.requestSubmit()` 当主路径，避免首页只走到 conversation init 的半发送状态。
    - `content/chatgpt-tab-queue/main.js`：修复 `getTurnArticles()` 的重复全量调用，并把预览 repair loop 改成“仅在 idle 超时或节点丢失时自愈”，不再每个 tick 都重绘整个队列条。
    - `自动化回归`：更新 queued send start 判定测试，只允许真实 request start 触发出队；同时补强 repair idle 判定覆盖。

- **2026-03-08：修复 ChatGPT Tab queue 的手动草稿抢发与下一条串发**
  - 现象：
    - 在 GPT-5.4 Thinking 这类可插话模型里，上一条 queued 消息刚发出后，`pendingSendGate` 会在某些短暂的“非 generating”窗口里过早释放。
    - 这会导致两个坏结果：用户刚开始手动输入的新草稿，可能被后续的队列推进覆盖或直接抢发；如果原队列里还有下一条消息，还可能被提前串发，甚至出现同一条 queued 消息被重复发送。
  - 修复：
    - `content/chatgpt-tab-queue/main.js`：`pendingSendGate` 增加“停止生成后的非生成冷却期”，不再因为 stop button 短暂消失或发送按钮暂时恢复就立刻放行下一条 queued 消息。
    - `content/chatgpt-tab-queue/main.js`：增加“foreign composer draft”保护。只要输入框里已有非空草稿且内容不等于当前队列头，队列就会暂停，不会覆盖也不会自动发送这份草稿。
    - `content/chatgpt-tab-queue/main.js`：新增 composer `input` 监听，让用户一开始手动输入时就立即刷新暂停状态和排队条，不再等下一轮 repair tick 才识别。
    - `content/chatgpt-tab-queue/main.js`：`Tab queue` 的模型门禁改成 Pro 黑名单；`GPT-5.2 Thinking`、`GPT-5.3 Instant`、`GPT-4.5`、`o3` 这类非 Pro 模型仍会接管 `Tab`，只有名字里带 `Pro` 的模型会被队列脚本跳过。
    - `自动化回归`：补充非生成冷却期与手动草稿暂停规则的单测，避免再次回归到“用户一打字，队列继续抢发”的竞态。

- **2026-03-08：让 ChatGPT Tab queue 支持普通 Pro，并继续拦截 Extended Pro**
  - 现象：
    - 用户希望 `5.2 Pro`、`5.4 Pro` 也能用 `Tab` 排队，但不希望把速度更慢、交互链更重的 `Extended Pro` 一起放开。
    - 实测发现 `5.2 Pro Standard` 和 `5.4 Pro Standard` 都仍然走 `POST /backend-api/f/conversation` 主链；差异在于 `5.2 Pro Standard` 后面还会拉 `tasks/promode.../stream`，`5.4 Pro Standard` 主要依赖 `stream_status` 和 DOM 渲染收尾。
  - 修复：
    - `content/chatgpt-tab-queue/main.js`：模型门禁从“只要命中 Pro 就禁用”收窄为“只要命中 Extended Pro 才禁用”，普通 Pro 会接管 `Tab`。
    - `content/chatgpt-tab-queue/main.js`：队列暂停文案同步改成 `当前处于 Extended Pro`，避免把所有 Pro 都误报成禁用态。
    - `content/chatgpt-tab-queue/main.js`：`pendingSendGate` 新增零延迟状态的自愈轮询；即使 Pro 页漏掉 stop-button 过渡事件，也会在后续短轮询里自动释放门闩，不再出现“两条都发完了但门闩还挂着”的残留态。
    - `content/chatgpt-tab-queue/main.js`：`replyRender` 采样循环在门闩存在时会主动补触发 `maybeReleasePendingSendGate()`；这样就算 MutationObserver 漏掉最后一次生成态切换，采样器也会把门闩收尾清干净。
    - `自动化回归`：新增 `5.4 Pro`、`5.2 Pro`、`Extended Pro` 的门禁断言，防止以后回归成整类 Pro 黑名单。

- **2026-03-08：修复 ChatGPT Tab queue 的 composer 状态脱节与过早完成判定**
  - 现象：
    - `Tab` 队列把文本写回可见 ProseMirror 编辑区后，没有同步隐藏的 `textarea[name="prompt-textarea"]` mirror，导致页面上看起来有字、甚至还能点到残留发送按钮，但 ChatGPT 的真实 composer 状态仍是空，表现为用户气泡插入后没有真正的 `/backend-api/f/conversation` 请求。
    - 在 GPT-5.4/5.5 这类“思考中也允许继续发消息”的模型上，队列还会把 `/backend-api/f/conversation` 的 handoff 结束误判成整条回复已经完成，导致下一条 queued 消息过早尝试发送。最坏情况下，消息会从队列里消失、残留在输入框里，上一条回复则卡在 `Thinking / Quick answer` 半成品状态。
    - 进一步实测发现，`Tab queue` 发送按钮触发顺序如果优先走 React `onClick`，会比 `Ctrl+T` 那条快捷脚本明显更慢；在部分对话里，按钮已经被点下，但真正的 `/backend-api/f/conversation` 要到数秒后才开始。
  - 修复：
    - `content/chatgpt-tab-queue/main.js`：`setComposerText()` 现在会同时同步可见编辑器和隐藏 textarea mirror，并在发送前确认两边文本一致，避免点中与真实状态脱节的残留发送按钮。
  - `content/chatgpt-tab-queue/main.js`：在原有基于 composer `stop-button` 的真实生成状态观察器之上，再额外查询 `stream_status`；同时增加“视觉稳定释放”兜底：当 transport 已结束、发送按钮已恢复、turn DOM 持续稳定一小段时间后，就允许放行下一条 queued 消息，避免 GPT-5.4/5.5 的尾段 `stream_status` 长时间滞后时，队列白等几秒才继续。
    - `content/chatgpt-tab-queue/main.js`：queued 消息点击发送后，会先观察“请求已开始/输入框已清/新用户 turn 已出现”等确认信号，再决定是否出队；如果只是把草稿写进输入框但并未真正发出，就继续留在队列里等待重试。
    - `content/chatgpt-tab-queue/main.js`：新增“首条即时发送”快路径；当队列里只有当前这条草稿、而且 composer 本来就已经是它时，不再先清空再写回，而是直接复用当前输入框去发，避免首页首条消息因为按钮重渲染和重新启用多等数秒。
    - `content/chatgpt-tab-queue/main.js`：`sendConfirmTimeoutMs` 放宽，避免首页新建对话时把“实际已经开始创建会话但首个 fetch 稍晚出现”的正常发送误判成失败重试。
    - `自动化回归`：补充 queued send start 判定与 `stream_status` 归一化测试，并继续保护 pending send gate 的 `wait_generating / wait_transport_done / wait_generation_grace / release` 四类状态，避免后续回归到“只看 handoff done”。

- **2026-03-08：ChatGPT 新增 Tab 队列发送 / Ctrl+C 清空 / QuickNav 橙色标记**
  - 目标：把 Codex CLI 的排队发送体验移植到 ChatGPT 网页，同时保留撤销链和 QuickNav 可见性。
  - 变更：
    - `shared/registry.ts` / `shared/injections.ts`：新增 `chatgpt_tab_queue` 模块元数据、默认设置项与 `config + MAIN` 注入定义，并把 ChatGPT 注入统计更新到 24 条 defs / 19 个模块。
    - `content/chatgpt-tab-queue/config-bridge.js`：把队列热键、`Ctrl+C` 清空和 QuickNav 标记开关同步到 MAIN world dataset；`Ctrl+C` 再叠加 Meta 键能力策略，只在“有 Meta 键”时生效。
    - `content/chatgpt-tab-queue/main.js`：实现 FIFO queue、`Tab` 排队、`⌥↑ / Alt+↑` 取回最近 queued draft、`Ctrl+C` 清空输入框，以及基于 fetch hub `onConversationDone` 的自动发送判定；输入框写回与清空优先走 `execCommand('insertText')`，尽量保留 `Cmd+Z` 撤销。

- **2026-03-08：给 ChatGPT Tab queue 预览条补删除按钮与 Alt 文案**
  - 现象：
    - 队列预览只能看，不能直接删除中间某条 queued draft；用户一旦排错，只能反复 `⌥↑` 取回到输入框里再处理。
    - 页面和设置面板里只写了 `⌥↑`，但用户实际也会把这个键位理解成 `Alt+↑`。
  - 修复：
    - `content/chatgpt-tab-queue/main.js`：给每条排队消息末尾加 `删除` 按钮，并补了真正操作队列数组的删除逻辑；删掉队首后如果后面还有可发送项，会立即补跑一次续发检查。
    - `content/chatgpt-tab-queue/main.js`：队列提示文案更新成 `⌥↑ / Alt+↑`。
    - `content/chatgpt-tab-queue/main.js`：只要队列被清空，就会主动 reset 会话绑定和等待态，不再继承上一个原对话的 route 约束。
    - `options/options.js` / `docs/deep-dive.md`：设置页说明与深度文档同步更新，明确可用删除按钮和 `Alt+↑` 文案。
    - `content/chatgpt-quicknav.js`：读取 `data-aichat-tab-queued*` 标记，把队列发出的用户消息渲染成橙色，并在点击对应 QuickNav 行时回发 ACK 立即清掉标记。
    - `options/options.js`：新增 `chatgpt_tab_queue` 模块设置面板，允许分别控制 Tab 队列、`Ctrl+C` 清空与 QuickNav 标记，并在“无 Meta 键”下沿用现有警告卡逻辑提示 `Ctrl+C` 不会生效。
    - `自动化回归`：新增 Tab queue 热键路由测试，并补上默认设置与注入顺序校验。

- **2026-03-08：修复 GPT-5.4 Pro 手动发送后的队列抢发空窗**
  - 现象：
    - 在普通 Pro 尤其是 `GPT-5.4 Pro` 下，用户手动点发送后，到真实 conversation request 起飞前有一个很短的 idle 窗口。
    - 如果这时再用 `Tab` 排第二条，旧逻辑会把页面误判成“当前完全空闲”，从而让第二条 queued draft 立刻抢发。
  - 修复：
    - `content/chatgpt-tab-queue/main.js`：新增 `manualSendInterlock`，在真实手动发送按钮点击或 composer submit 时先挂门闩；只要门闩还在，队列只允许入队，不允许即刻发送。
    - `content/chatgpt-tab-queue/main.js`：fetch hub `beforeFetch` 现在同时识别 `/backend-api/f/conversation` 与 `/backend-api/f/steer_turn`，一旦真实请求起飞就立即清门闩并恢复正常队列推进。
    - `content/chatgpt-tab-queue/main.js`：生成态启动和 `onConversationStart` 也会补清门闩，避免 Pro 页面偶发漏掉单一路径时留下脏状态。
    - `自动化回归`：补上 `conversation` URL 识别和 `manualSendInterlockActive` 门禁断言，避免以后又退回“手动发送空窗里误放行”的状态。

- **2026-03-09：修复 Pro 模型里第一次 Tab 排队消息被吞**
  - 现象：
    - 在 `GPT-5.4 Pro` / `GPT-5.2 Pro` 下，手动发送第一条后，紧接着连续按两次 `Tab` 排第二、第三条消息时，第一条排队消息会消失，预览里只剩第二次 `Tab` 的那条。
    - 这个问题发生在 ChatGPT 刚开始发送时 composer 节点重建的短窗口里；热键事件已经被脚本接管，但脚本重新读取 live composer 时拿到的是“新输入框为空”，于是把第一次 `Tab` 白白吞掉了。
  - 修复：
    - `content/chatgpt-tab-queue/main.js`：新增 `resolveComposerEditorFromTarget()`，优先解析触发热键时的原始编辑器节点。
    - `content/chatgpt-tab-queue/main.js`：新增 `resolveQueueDraftText()`，让队列逻辑优先使用按键瞬间捕获的草稿快照，而不是事后再读 live composer。
    - `content/chatgpt-tab-queue/main.js`：`handleKeyDown()` 现在会把 `event.target` 对应的编辑器和文本快照传给 `queueCurrentComposerDraft()`，把“事件已拦截但草稿丢失”的窗口补上。
    - `content/chatgpt-tab-queue/main.js`：清空失败时不再只看单个旧 editor；现在会检查所有仍连着的 composer 节点。如果旧 editor 已断开、而 live composer 已经不是那条草稿，就保留队列项而不是误回滚。
    - `content/chatgpt-tab-queue/main.js`：手动点击发送后，不再只靠短时 `manualSendInterlock` 定时器硬挡。真实 `conversation/steer_turn` 一旦起飞，就会把手动发送提升成和 queued 发送同一类 `pendingSendGate`，直到回复真正稳定后才放行下一条队列。
    - `自动化回归`：补充草稿快照优先级、composer target 解析，以及“旧 editor 断开但 live composer 已清空时仍保留 queue”的测试，防止以后再回归到“第一次 Tab 丢消息”的状态。

- **2026-03-09：修复 Pro thinking 阶段被误判为空闲导致的 queue 抢发**
  - 现象：
    - 在 `GPT-5.4 Pro` / `GPT-5.2 Pro Standard` 下，上一条回复仍处于 `Pro thinking` 时，composer 里的发送按钮已经恢复可点；旧逻辑只盯 `stop-button`，会把这段状态误判成“已空闲”，于是第一次 `Tab` 会直接走 `immediateSend + steer_turn`，而不是进入队列。
  - 修复：
    - `content/chatgpt-tab-queue/main.js`：把生成态判定从“只看 stop 按钮”扩成“stop 按钮 + aria-live 里的 generating 文案 + 最新 assistant turn 的 thinking 指示器（且尚未出现 Copy 动作）”。
    - `content/chatgpt-tab-queue/main.js`：`shouldUseImmediateComposerSend()` 和 `canSendQueueHead()` 继续复用统一的 `isGeneratingNow()`，所以 `Pro thinking` 期间不会再放行 `immediateSend`。
    - `自动化回归`：补上 `thinking indicator / generating live announcement` 的纯函数测试，避免以后再次退回“只看 stop-button”的旧判定。

- **2026-03-09：ChatGPT 回复计时器默认跳过 GPT Pro 系列**
  - 目标：
    - 避免 `GPT-5.4 Pro`、`GPT-5.2 Pro` 这类 `Pro` 家族模型把长时间的 `Pro thinking` 过程显示成右下角回复计时，影响普通模型的读数参考价值。
  - 变更：
    - `content/chatgpt-reply-timer/main.js`：新增 `normalizeModelToken()`、`isGptProModelIdentifier()`、`shouldTrackReplyTimer()`，优先基于 fetch-hub 的 `payload.model`，并用页面当前模型标签兜底，只要识别到 `GPT` 的 `Pro` 家族模型就直接跳过计时。
    - `content/chatgpt-reply-timer/main.js`：Hub 路径和 DOM fallback 共用同一套门禁；命中黑名单时会清空当前/上一次计时结果并隐藏右下角数字，避免切到 `Pro` 后残留旧读数。
    - `自动化回归`：补充 `GPT Pro` 黑名单和 `o3 Pro / Thinking / Instant` 白名单测试，防止以后把非 GPT Pro 也误伤。

- **2026-03-09：修复 Pro 手动发送后的首条 Tab 误走 immediate send**
  - 目标：
    - 修掉 `GPT-5.4 Pro` 和 `GPT-5.2 Pro Standard` 下“手动发送第一条后，第一次 `Tab` 仍会被当成立即发送”的短窗口竞态，确保第一次 `Tab` 只能入队，不能抢发。
  - 变更：
    - `content/chatgpt-tab-queue/main.js`：新增 `manualSendWarmup` 预热门闩，并接入 `canSendQueueHead()` 与 `canUseImmediateComposerSend()`；人工发送后的极短窗口里，即使 `activeRequests` / `pendingSendGate` / `generatingNow` 尚未完全立起来，第一条 `Tab` 也不会再走 `queued_and_immediate_send`。
    - `content/chatgpt-tab-queue/main.js`：新增 `isLikelyComposerSendButton()`，把 `pointerdown` / `click` / `submit` 的人工发送识别从“必须精确等于 `findSendButton()` 返回节点”放宽成“属于当前 composer 且自身长得像发送按钮”，避免 Pro 页面因为按钮节点差异漏掉门闩。
    - `自动化回归`：补充 `manualSendWarmupActive` 的 immediate-send 断言，以及 composer 发送按钮启发式测试。

- **2026-03-08：OpenAI 新模型监控默认切到小时级轮询并补充模型图标**
  - 目标：降低默认探测频率，避免过于频繁地请求图标地址，同时把常用新模型图标一并放进默认监控列表。
  - 变更：
    - `background/sw/monitors.ts`：默认探测周期从 5 分钟改为 60 分钟，默认地址从单个 `gpt-5.5.png` 扩展为 `gpt-5.5`、`gpt-5.4-codex`、`gpt-5.4-codex-max`、`gpt-5.4-max`、`gpt-5.5-codex`、`gpt-5.5-pro`、`gpt-image-2` 共 7 个 developers 图标 URL。
    - `options/options.html` / `options/options.js`：监控说明改为“默认每 1 小时”，状态面板按小时显示周期，同时把 URL 输入框高度调到更适合多条默认地址的尺寸。
    - `自动化回归`：同步校验新的默认 URL 列表和 60 分钟报警周期。

- **2026-03-07：配置页“按网站管理脚本”区域重构为编辑型工具界面**
  - 目标：只重做按网站配置脚本页面的视觉层与信息架构，降低玻璃感/模板感，保留现有设置与模块渲染逻辑。
  - 变更：
    - `options/options.html`：配置区改为更克制的单列说明 + 三栏主体，去掉顶部三块概览摘要卡和右上角“当前网站 / 当前脚本”栏，只保留列表计数与右侧设置壳层；
    - `options/options.css`：整体改为中性色哑光风格，减少浮夸渐变/位移动效，并把主字体栈切回更克制的系统字体，收细设置面板和模块标题字重，同时让站点/脚本行卡片的整块外框都表现为可点击区域；右侧设置头部新增延迟 1 秒显示的 `i` 信息提示；清理底部操作区遗留的重复 `.btn/.actions/.status` 样式覆盖，避免 OpenAI 监控卡片下方按钮与状态条错位；并把深色主题按钮配色收拢成“强调主按钮 + 中性次按钮 + 危险红按钮”的统一层级。
    - `background/sw/monitors.ts` / `shared/injections.ts` / `manifest.source.json`：OpenAI 新模型监控从旧的 `cdn.openai.com` 图标地址迁移到新的 `developers.openai.com/images/api/models/icons/...` 地址格式，并同步 host permission、默认探测链接与配置页文案。
    - `options/options.js`：新增配置区空状态渲染、列表计数展示与模块设置加载占位，不改动底层设置读写协议，并补上列表整行点击切换逻辑；右侧设置壳层统一承接模块简介、站点/状态/快捷键摘要与作者/许可证/上游信息，正文只保留实际配置项与操作。

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
    - 引入基于 macOS `qlmanage` 的 SVG 栅格化链路，再做边界背景透明化与多尺寸输出；
    - 同脚本增加“按可见 alpha 边界裁切 + 留白回填”步骤，避免图标主体在 16/32px 下过小只剩蓝点；
    - `icons/logo.svg` 移除背景底色矩形，避免图标白底观感；
    - 重新生成并替换 `icons/icon16.png`、`icon32.png`、`icon48.png`、`icon128.png`（构建后同步到 `dist/icons/*`）。

- **2026-03-08：新增“Meta 键能力”快捷键策略**
  - 目标：不再用“整模块开关”粗暴处理系统差异，而是把差异收敛到“当前按有 / 无 Meta 键处理”。
  - 修复：
    - `background/sw/storage.ts`：设置结构新增顶层 `metaKeyMode`（`auto | has_meta | no_meta`），并纳入 normalize / patch / reset 默认值链路。
    - `shared/injections.ts`：为 `chatgpt_thinking_toggle`、`qwen_thinking_toggle`、`chatgpt_quick_deep_search` 增加快捷键子开关 / force flag 默认值；`chatgpt_quick_deep_search` 新增独立 config bridge 注入定义。
    - `options/options.html` + `options/options.css` + `options/options.js`：配置页新增“键盘能力”卡片；脚本列表对受影响模块显示悬停警告；详情页允许 force-enable，并在强制开启时弹出确认。
    - `content/chatgpt-thinking-toggle/config-bridge.js`：把 `metaKeyMode + force flag` 映射为 MAIN world 可读 dataset，真正做到“只停热键、不停模块注入”。
    - `content/qwen-thinking-toggle/main.js`：新增设置同步与热键策略计算，`⌘O / ⌘J` 在无 Meta 键配置下默认停用。
    - `content/chatgpt-quick-deep-search/config-bridge.js` + `content/chatgpt-quick-deep-search/main.js`：新增 dataset 配置桥与热键守卫，`Ctrl+S / T / Y / Z` 在无 Meta 键配置下默认停用，避免与浏览器/系统快捷键冲突。
  - 回归保护：新增 `自动化回归`，并扩展 `自动化回归`。

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
    - `scripts/verify.js` 新增“content runtime 文件覆盖校验”：若 `content/` 下存在未被 `manifest.source.json` 或 `shared/injections.ts` 引用的运行时文件，直接让检查失败，阻断类似残留再次进入主分支。

- **2026-02-26：ChatGPT QuickNav 图钉“跨对话继承”修复（会话绑定 + 旧弱锚点清理）**
  - 现象：部分用户在未手动加图钉时，进入新对话后仍出现旧图钉，表现为“像继承了之前对话”。
  - 根因：
    1. 图钉内存态在路由切换期间可能短暂沿用旧会话数据；
    2. 历史图钉若仅依赖弱 `msgKey`（如 `conversation-turn-*`）且缺少段落上下文，恢复时容易误映射到当前对话。
  - 修复：
    - `content/chatgpt-quicknav.js`：新增 `cpConvKey` 会话绑定校验，渲染前若会话 key 变化则强制重载图钉存储，阻断旧内存态串用。
    - 图钉元数据新增 `convKey/msgId`，恢复优先走 `msgId` 精确定位；当 `msgId` 不匹配时拒绝回退到弱匹配。
    - 对“弱 key + 无上下文 + 无 msgId”的历史遗留图钉做自动清理，避免幽灵图钉持续复现。
    - 回归保护：`自动化回归` 增加会话绑定与弱锚点治理断言。

- **2026-02-22：ChatGPT scroll-lock 发送瞬间“残留一跳”补丁（baseline 缓存竞态）**
  - 现象：在 🔒 已开启且发送后快速进入流式阶段时，极少数场景仍会出现一次很短的下跳（随后被回弹拉回）。
  - 根因：`content/scroll-guard-main.js` 对 `quicknavScrollLockBaseline` 的 dataset 读取有短时缓存；当 send guard 刚写入新 baseline 时，MAIN guard 仍可能短暂读取到旧缓存值，造成一次放行。
  - 修复：
    - `content/scroll-guard-main.js`：处理 `AISHORTCUTS_SCROLLLOCK_BASELINE` bridge 消息时，立即同步刷新 `__baselineDatasetCached/__baselineDatasetCachedAt`，让 MAIN guard 同步使用最新 baseline，消除发送窗口竞态。
    - guard 版本提升：`GUARD_VERSION = 7`。
    - 回归保护：`自动化回归` 增加“baseline bridge 到达即刷新缓存”断言。

- **2026-02-22：ChatGPT scroll-lock 发送后“跳一下”修复（锁定窗口内快速回弹）**
  - 现象：在 ChatGPT 打开 🔒 后，发送消息瞬间仍可能出现一次可见下跳，再被回弹拉回。
  - 根因：
    1. `content/chatgpt-quicknav.js` 的 mutation 回弹走固定 `140ms` 延迟，导致“先跳后拉回”的可见窗口。
    2. `content/scroll-guard-main.js` 的统一漂移阈值对 ChatGPT 场景偏宽，发送瞬间仍可能放过一个小步下移。
  - 修复：
    - `content/chatgpt-quicknav.js`：新增“guard 窗口快速回弹”策略（`16ms` 快速延迟 / `140ms` 常规延迟），并在 guard 窗口内放宽 idle 限制，优先消除发送瞬间的可见下跳。
    - `content/scroll-guard-main.js`：为 `chatgpt.com` 启用更严格的下滚阈值（`DRIFT=8`），其他站点保持 `16`，避免跨站点副作用。
    - 回归保护：新增 `自动化回归` 并纳入仓库验证链。

- **2026-02-22：修复 Genspark QuickNav 把 toolcall/thinking 中间态写进导航列表**
  - 现象：Genspark 在工具调用链路中会持续产出 `Using Tool | ...` / `Thinking...` 中间文本，QuickNav 把这些中间态当作独立助手消息写入导航，导致一轮回复里出现多条“伪导航项”。
  - 根因：`content/genspark-quicknav.js` 的助手预览抽取没有区分 transient（工具调用/思考中）与 final（最终回答），并且会把 transient 预览写入 `previewCache`。
  - 修复：
    - `content/genspark-quicknav.js`：新增 Genspark 助手预览解析链路（候选文本收集 + transient 前缀剥离 + inline toolcall 尾段裁剪 + transient 判定），assistant 预览改为 `{text, transient}`。
    - `content/genspark-quicknav.js`：在 `buildIndex()` 中禁止缓存 transient assistant 预览，并在构建导航列表时直接跳过 transient 条目，仅保留最终回答对应的导航项。
    - 新增回归测试：`自动化回归`，并纳入仓库验证链。

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
    - 新增回归测试：`自动化回归`、`自动化回归`，并纳入仓库验证链。

- **2026-02-21：新增 Gemini App / 文心一言 / Z.ai 到 QuickNav 主链路，并修复 Grok 回复可见性风险**
  - 目标：把“已实现但未接入”的站点脚本正式纳入 registry/injections/manifest 主链路，统一启用 QuickNav + Cmd/Ctrl+Enter；同时处理 Grok 在部分场景下“下一条回复可能消失”的高风险样式覆盖。
  - 修复：
    - `shared/registry.ts`：新增 `gemini_app`（`https://gemini.google.com/*`，QuickNav 限定 `https://gemini.google.com/app*`）、`ernie`（`https://ernie.baidu.com/*`）、`zai`（`https://chat.z.ai/*`）站点定义，并启用 `quicknav` + `cmdenter_send` 模块。
    - `shared/injections.ts`：新增 `quicknav_{gemini_app|ernie|zai}`、`quicknav_scroll_guard_{gemini_app|ernie|zai}`、`quicknav_{gemini_app|ernie|zai}_cmdenter_send` 注入定义。
    - `content/gemini-app-quicknav.js`：对齐最新 quicknav 内核约束（bridge envelope、canonical+legacy runtime flag helper、debug API 安装器、bridge routeChange + polling fallback），移除本地 `history.pushState/replaceState` monkey patch。
    - `content/grok-quicknav.js`：移除全局 `.thinking-container { display:none !important; }`，避免误伤真实回复内容。
    - 回归测试：新增 `自动化回归`、`自动化回归`、`自动化回归` 并纳入仓库验证链。
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
    - `content/chatgpt-quicknav.js`：默认位置固定为视口右上角（`1px` 内缩）；重置位置不再把绝对坐标写死进 `localStorage`
  - 验证：`npm run check` 通过；MCP 路由切换与扩展更新后场景复测通过

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
  - 回归保护：新增 `自动化回归`（协议字段 + 握手路径静态回归）。

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
  - 回归保护：新增 `自动化回归` 与 `自动化回归`，并纳入仓库验证链。

- **2026-02-20：Grok 接入 Cmd/Ctrl+Enter 模块（与 Kimi/Qwen/ChatGPT 对齐）**
  - 目标：将 Grok 的发送快捷键策略统一纳入 `cmdenter_send` 模块，不再只依赖 QuickNav 内部的“发送后刷新”监听。
  - 修复：
    - `shared/registry.ts`：`grok` 站点模块从 `['quicknav']` 扩展为 `['quicknav', 'cmdenter_send']`，确保在 Popup/Options 可独立开关。
    - `shared/injections.ts`：新增 `quicknav_grok_cmdenter_send`（`document_start` / ISOLATED），注入 `content/aishortcuts-bridge.js` + `content/chatgpt-cmdenter-send/main.js`，匹配 `https://grok.com/*`。
    - `自动化回归`：补充 registry/default-settings/content-script 路由断言，避免后续回归把 grok cmdenter 注入链路删掉。
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
    - 回归覆盖：新增 `自动化回归`；并扩展 `自动化回归`、`自动化回归` 覆盖注入链路与 alias 迁移。

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
  - 回归覆盖：`自动化回归` 增加 near-native 断言（尾部 checkmark 选择器、插入锚点函数、勾选遮蔽函数）与 trigger 文案恢复断言。

- **2026-02-22：Grok 模型选择增强模块下线（回归原生模型菜单）**
  - 背景：Grok 端模型能力与账号权限变体较多，隐藏模型菜单长期维护成本高，且与额度展示/账号切换行为存在耦合风险。
  - 调整：
    - `shared/registry.ts`：从 `grok` 站点模块清单移除 `grok_model_selector`，并删除 `grok_fast_unlock -> grok_model_selector` alias。
    - `shared/injections.ts`：移除 `quicknav_grok_model_selector` 注入定义。
    - `content/grok-model-selector/main.js`、`自动化回归`：下线脚本与专项测试。
    - `自动化回归`、`自动化回归`：更新断言，确保当前 Grok 注入链路仅保留 `quicknav + cmdenter_send + grok_rate_limit_display + grok_trash_cleanup`。
  - 结果：模型选择完全回归 Grok 原生菜单；扩展侧只保留导航、快捷发送、额度展示和废纸篓清理模块。

- **2026-02-20：恢复 Genspark 全量脚本束（回归历史行为面）**
  - 目标：将 Genspark 从“未接入状态”恢复为历史可用形态：QuickNav + Cmd/Ctrl+Enter + 5 个站点特化脚本。
  - 修复：
    - `shared/registry.ts`：恢复 `genspark` 站点定义（`https://www.genspark.ai/*`；QuickNav 范围 `https://www.genspark.ai/agents*`），并恢复模块清单：
      `quicknav`、`cmdenter_send`、`genspark_moa_image_autosettings`、`genspark_credit_balance`、`genspark_codeblock_fold`、`genspark_inline_upload_fix`、`genspark_force_sonnet45_thinking`。
    - `shared/injections.ts`：恢复 `quicknav_genspark`、`quicknav_scroll_guard_genspark`、`quicknav_genspark_cmdenter_send` 以及上述 5 个 Genspark 专项脚本的注入定义（含 MAIN/ISOLATED、runAt、allFrames）。
    - `自动化回归`：新增 Genspark 路由回归测试（registry/default-settings/content-script defs 全覆盖），并纳入仓库验证链。
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
    - 新增 `自动化回归`（bridge 协议 + 握手 + route watcher 静态断言）；
    - 扩展 `自动化回归` 覆盖 genspark 命名一致性；
    - 上述测试并入 `scripts/verify.js` self-tests。
  - 验证：`npm run check` / `npm test` / `npm run typecheck` / `npm run build` 全通过；扩展重载后 Genspark 站点设置与模块注入正常。

### 10.1 Qwen 行为备注（生产支持面）

- 站点范围：`https://chat.qwen.ai/*`。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块处理，在 `content/chatgpt-cmdenter-send/main.js` 的 `SITE === 'qwen'` 分支生效。开启后仅 Cmd/Ctrl+Enter 发送，Enter 仅插入换行；`isComposing` 或 `keyCode === 229` 时直接忽略，避免 IME 组合输入误发。
- 模型模式热键：由 `qwen_thinking_toggle` 模块处理；`⌘O` 切换 Thinking/Fast 后会自动把焦点与光标恢复到输入框末尾，减少模式切换后的手动补焦点操作。
- 首屏模型模式预设：`qwen_thinking_toggle` 在页面首次加载阶段会做一次“Thinking 优先”尝试（带上限重试，成功后停止；不会常驻轮询保活），刷新后可重新触发。
- Scroll lock：`content/qwen-quicknav.js` 会同步 `document.documentElement.dataset.quicknavScrollLockEnabled`，并请求注入 `content/scroll-guard-main.js`（MAIN world guard）。锁开启时，页面脚本触发的自动下滚会被拦截，覆盖发送后与流式阶段；用户手动滚动与 QuickNav 自身跳转（`quicknavAllowScrollUntil` allow window）仍可通过。
- 会话切换：`content/qwen-quicknav-route-gate.js` 把路由切换设为 pending，QuickNav 在 pending 期间保留旧列表；当新会话 fingerprint 达到稳定条件（`stable-fingerprint`）或命中超时后，才放行刷新并切换到新列表。
- 回归覆盖：`自动化回归`（Qwen 输入/发送策略共性）+ `自动化回归`（Cmd+O/J 热键解析、Thinking/Fast 选项选择策略与首屏预设依赖函数）。

### 10.2 Kimi 行为备注（生产支持面）

- 站点范围：`https://kimi.com/*` 与 `https://www.kimi.com/*`，输入框目标为 `.chat-input-editor[contenteditable="true"][role="textbox"]`。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块的 `SITE === 'kimi'` 分支处理；仅在输入非空且未处于生成中时触发发送，避免把快捷键映射为 stop/cancel。
- 生成态检测边界：只将 composer 域内 stop/cancel 控件视为“生成中”；QuickNav 面板按钮（例如 `收藏/取消收藏`）不会再参与生成态判断，避免误阻断发送快捷键。
- Enter/Shift+Enter：在 Kimi 路径下不执行发送，维持换行语义；组合输入（IME）期间直接忽略，防止候选阶段误发。
- QuickNav 注入：`content/kimi-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作，覆盖目录导航与滚动防抖场景。
- Scroll-lock 协议：Kimi 与 ChatGPT/Qwen 一致使用 `channel/v/nonce` bridge 契约；`AISHORTCUTS_SCROLLLOCK_STATE/BASELINE/ALLOW` 与 `QUICKNAV_SCROLL_GUARD_READY` 握手都要求同 nonce。

### 10.3 Grok 行为备注（生产支持面）

- 站点范围：`https://grok.com/*`（当前纳入 `quicknav` + `cmdenter_send` + `grok_rate_limit_display` + `grok_trash_cleanup`）。
- QuickNav 注入：`content/grok-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- 废纸篓清理模块：`grok_trash_cleanup` 独立注入 `content/grok-trash-cleanup/main.js`，仅在 `https://grok.com/deleted-conversations` 页将“**一键清空废纸篓**”挂在 `Deleted Conversations` 标题右侧（避免顶栏遮挡）；点击后通过 `GET /rest/app-chat/conversations/deleted` 拉取列表并逐条执行 `DELETE /rest/app-chat/conversations/{conversationId}`。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块的 `SITE === 'grok'` 分支处理；默认语义为 Enter/Shift+Enter 换行、Cmd/Ctrl+Enter 发送，并保留发送前“空输入/生成中”保护。
- 剩余额度面板：`grok_rate_limit_display` 采用**右下角常驻极简卡片**（固定 `right:0/bottom:0`，无展开/收起、无菜单、不可拖拽），仅显示 `all` 积分值（例如 `400/400`）。2026-02-25 起移除 `4.2 / 4.2 heavy` 展示（对应接口失效）。刷新策略为“发送后延迟刷新”（不做常驻轮询）；检测到历史版额度面板 DOM 时会直接重建新卡片，避免遗留节点导致双层 UI。
- Scroll-lock 协议：与 ChatGPT/Qwen/Kimi 保持一致，统一使用 `channel/v/nonce` bridge 信封；`AISHORTCUTS_SCROLLLOCK_STATE/BASELINE/ALLOW` 与 `QUICKNAV_SCROLL_GUARD_READY` 均做同 nonce 校验。
- 路由监听：优先复用 shared bridge（`__aichat_quicknav_bridge_v1__`）的 `routeChange` 信号；保留 polling fallback 兜底，不再本地 patch `history.pushState/replaceState`。

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
- 回归覆盖：`自动化回归`（注入路由） + `自动化回归`（协议/握手/路由监听） + `自动化回归`（toolcall/thinking transient 过滤 + 缓存策略） + `自动化回归`（仅 Sonnet 4.5 映射） + `自动化回归`（禁止跨版本模型/全局 thinking payload 改写） + `自动化回归`（命名兼容）共同覆盖，防止误删或风格回退。

### 10.5 DeepSeek 行为备注（生产支持面）

- 站点范围：`https://chat.deepseek.com/*`（当前纳入 `quicknav` + `cmdenter_send`）。
- QuickNav 注入：`content/deepseek-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块的 `SITE === 'deepseek'` 分支处理，发送前仍保留“空输入/生成中”保护。
- Scroll-lock 协议：与 ChatGPT/Qwen/Kimi/Grok 一致，统一使用 `channel/v/nonce` bridge 信封；`AISHORTCUTS_SCROLLLOCK_STATE/BASELINE/ALLOW` 与 `QUICKNAV_SCROLL_GUARD_READY` 均做同 nonce 校验。
- 路由监听：优先复用 shared bridge（`__aichat_quicknav_bridge_v1__`）的 `routeChange` 信号；保留 `1200ms` polling fallback 兜底，不再本地 patch `history.pushState/replaceState`。
- 运行时命名：新增 `__deepseekQuicknav*` 站点语义 flag，并保留 `__cgpt*` 旧名兼容；调试入口统一到 `window.deepseekQuicknavDebug` / `window.deepseekNavDebug`（保留 `window.chatGptNavDebug` 别名）。
- 回归覆盖：`自动化回归`（注入路由） + `自动化回归`（协议/握手/路由监听）共同覆盖，防止路由与桥接协议回退。

### 10.6 Gemini App 行为备注（生产支持面）

- 站点范围：`https://gemini.google.com/*`；QuickNav 仅在 `https://gemini.google.com/app*` 生效（`gemini enterprise` 不在本轮支持范围）。
- QuickNav 注入：`content/gemini-app-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块注入 `quicknav_gemini_app_cmdenter_send`，沿用统一发送策略（Enter/Shift+Enter 换行，Cmd/Ctrl+Enter 发送）。
- 首屏模型预设：Gemini App 首次加载时会在有限重试窗口内检查模式按钮；当当前模式不是 `Pro/Thinking` 时，会通过 mode picker 尝试自动切到 `Pro`（兼容 `Flash/Fast` 文案与延迟渲染场景）。切换结束后会把焦点与光标恢复到输入框末尾。若账号无 `Pro` 选项则立即停止，不做常驻 keepalive（仅刷新/新加载时重新触发）。
- 协议与路由：已切到 `channel/v/nonce` bridge 契约；路由监听优先消费 shared bridge `routeChange`，保留 polling fallback，不再 patch `history.pushState/replaceState`。
- 运行时命名：canonical 调试入口 `window.geminiNavDebug`（保留 `window.chatGptNavDebug`）；运行时 flag 采用 `__quicknavGeminiApp*` + `__cgpt*` 兼容双写。
- 流式回复稳定性：新增“手动选择冻结窗口”（`manualSelectionHoldUntil`），在流式中点击导航项/键盘跳转后短暂抑制 `updateActiveFromAnchor()` 自动抢焦点，并在 `renderList()` 重渲染后按 `currentActiveId` 立即恢复 active 样式，降低“点击时导航项被快速刷新抢回/抖动”风险。
- 预览文案净化：`user-query` 预览优先提取 `.query-text-line`，并对历史缓存统一净化 `You said / Gemini said` 前缀，避免导航项反复显示系统标签而非用户真实输入。
- 回归覆盖：`自动化回归`（桥接、命名、路由监听 + 手动选择冻结窗口 + rerender active 恢复约束） + `自动化回归`（注入链路）。

### 10.7 文心一言（Ernie）行为备注（生产支持面）

- 站点范围：`https://ernie.baidu.com/*`。
- QuickNav 注入：`content/ernie-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块注入 `quicknav_ernie_cmdenter_send`，保持统一发送语义。
- Cmd/Ctrl+Enter 稳定性：Ernie 输入框识别改为“`[contenteditable][role=textbox]` + 发送控件邻域”双重判定；发送控件解析采用“`sendInner/sendBtnLottie` 内层节点优先、`send__/sendBtn` 外层容器回退”顺序，并补发 `mousedown/mouseup/click` 事件序列，兼容 AB 变体与 React 委托点击路径。
- 首屏模型预设：Ernie 首次加载时会在有限重试窗口内自动尝试切换到 `ERNIE 5.0`；命中后停止重试，不做长驻轮询。
- 助手预览抽取：针对 Ernie “thinking 与最终回答同卡”结构，QuickNav 预览解析以完整容器为第一候选并优先提取最终回答片段；thinking 预览标记为 transient，不写入 `previewCache`。对无 marker 且含 `User\d+ / Thinking complete` 的片段按 transient 处理，避免后续长期卡在 `Thinking.../ThinkingUser...`。
- Scroll-lock 协议：Ernie 已对齐 `channel/v/nonce` bridge 契约；`AISHORTCUTS_SCROLLLOCK_STATE/BASELINE/ALLOW` 及 `QUICKNAV_SCROLL_GUARD_READY` 握手均要求同 nonce。
- 回归覆盖：`自动化回归`（注入链路）+ `自动化回归`（thinking→final 预览 + 缓存策略）+ `自动化回归`（scroll-lock bridge 协议 + 握手）。

### 10.8 Z.ai（GLM）行为备注（生产支持面）

- 站点范围：`https://chat.z.ai/*`。
- QuickNav 注入：`content/zai-quicknav.js`（ISOLATED, document_end）+ `content/scroll-guard-main.js`（MAIN, document_start）协作。
- Cmd/Ctrl+Enter：由 `cmdenter_send` 模块注入 `quicknav_zai_cmdenter_send`，保持统一发送语义。
- 回归覆盖：`自动化回归`（registry/default-settings/content-script defs）。
