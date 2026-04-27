<p align="center">
  <img src="./icons/logo.svg" alt="AI Shortcuts Logo" width="220" />
</p>

<h1 align="center">AI捷径 (AI Shortcuts)</h1>

<p align="center">
  A ChatGPT-first Chrome MV3 productivity suite for long conversations, heavy model workflows, and repeated AI-site operations.
</p>

<p align="center">
  <a href="https://github.com/lueluelue2006/ai-chat-extension-collection/releases/latest">
    <img src="https://img.shields.io/github/v/release/lueluelue2006/ai-chat-extension-collection?display_name=tag&label=release" alt="Release">
  </a>
  <img src="https://img.shields.io/badge/current-4.0.5-74c0fc" alt="Current version 4.0.5">
  <img src="https://img.shields.io/badge/focus-chatgpt.com-8ce99a" alt="ChatGPT first">
  <img src="https://img.shields.io/badge/platform-Chrome%20MV3-ffd43b" alt="Chrome MV3">
  <img src="https://img.shields.io/badge/targets-11%20sites%20%2B%20common-b197fc" alt="Targets">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-GPL--3.0--or--later-8ac926" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://github.com/lueluelue2006/ai-chat-extension-collection/releases">Download dist.zip</a>
  ·
  <a href="#中文说明">中文</a>
  ·
  <a href="#english">English</a>
  ·
  <a href="./docs/scripts-inventory.md">Scripts Inventory</a>
  ·
  <a href="./CREDITS.md">Credits</a>
</p>

> End users should install the packaged `dist.zip` from GitHub Releases. Unzip it first, then load the extracted `AI-Shortcuts-dist` folder in Chrome. Do not load the repository source directory directly.

## 中文说明

### 项目定位

AI捷径现在的战略重心已经明确转向 `chatgpt.com`。

这个扩展优先服务重度 ChatGPT 用户：长对话、复杂公式、长代码、Thinking / Pro 工作流、重复发送、分支查看、引用整理、用量统计和模型切换。其他 AI 站点仍然维护，但定位是把已经稳定的导航与输入能力复用过去，而不是把每个网站都做成同等深度的主战场。

### 4.0.5 补丁

这个补丁修复临时对话和已打开页面里 QuickNav 滚动锁仍可能守错滚动容器的问题。

| 方向 | 更新 |
| --- | --- |
| QuickNav 滚动锁 | MAIN-world scroll guard 升级到 v11，已打开页面也能热升级到新的拦截逻辑 |
| QuickNav 滚动锁 | ChatGPT 场景优先使用 core 返回的真实 `DIV` 滚动容器，避免临时对话首条消息后仍标记 `HTML` |
| 验证 | 真实临时对话和普通 `/c/...` 对话中，锁定到中段后用真实 `Tab` 入队自动发送，生成完成后 `scrollTop` 保持在锁定基线 |

### 4.0.4 补丁

这个补丁继续修复临时对话里的 QuickNav 滚动锁基线问题。

| 方向 | 更新 |
| --- | --- |
| QuickNav 滚动锁 | 临时对话首条消息后如果滚动容器重建，会重新确认当前容器，避免锁还绑定在旧容器上 |
| QuickNav 滚动锁 | 对输入框聚焦、键盘滚动、系统辅助滚动等没有 `wheel` 信号的可见滚动，非生成/非突变窗口内会同步为新的锁定基线 |
| Tab Queue | Tab Queue 自动发送仍保留发送期保护，不会把发送触发的原生跳底部误认为用户滚动 |

### 4.0.3 补丁

这个补丁继续加固 QuickNav 滚动锁和 Tab Queue 自动发送池之间的边界。

| 方向 | 更新 |
| --- | --- |
| QuickNav 滚动锁 | Tab 入队后、composer 被清空前就同步通知 QuickNav 保护锁定基线，避免 queued message 发送时仍触发 ChatGPT 原生跳底部 |
| Tab Queue | 保护信号改为同步 `dispatchEvent` + 异步 `postMessage` 双通道，覆盖入队、写回 composer、程序化点击发送和确认发送阶段 |
| 验证 | 在真实 ChatGPT 对话中锁定到中段位置后用真实 `Tab` 入队并等待自动发送完成：队列清空、锁定开启、`scrollTop=2800`、baseline=2800 |

### 4.0.2 补丁

这个补丁修复 QuickNav 滚动锁与 Tab Queue 自动发送池之间的协作缺口。

| 方向 | 更新 |
| --- | --- |
| QuickNav 滚动锁 | Tab Queue 自动发送前会通知 QuickNav 保护当前锁定基线，避免 queued message 发送时把视口拉到底部 |
| Tab Queue | 自动发送生命周期新增 `prepare` / `before-click` / `confirmed` 保护信号，覆盖写回 composer 和程序化点击发送两段风险窗口 |
| 验证 | 在真实 ChatGPT 对话中用 `Tab` 入队并等待自动发送完成：队列清空、回复出现、锁定开启、`scrollTop=0`、baseline=0 |

### 4.0.1 补丁

这个补丁把 4.0.0 发布后继续验证出的最终状态同步到 GitHub。

| 方向 | 更新 |
| --- | --- |
| QuickNav 滚动锁 | 加固锁定时的基线恢复，覆盖 `scrollTop`、`scrollTo`、`scrollIntoView` 和真实流式回复期间的自动跳底部 |
| Tab Queue | 清空队列后同步清理隐藏预览 DOM，避免旧队列文本继续留在页面内存里；同时补强可视队列 overflow 行标记 |
| 诊断包 | 复核诊断包脱敏行为：ChatGPT 对话 URL 折叠为 `/c/:id`，不导出原始队列文本、输入框文本或对话正文 |
| 设置页 | 复核全局搜索、快捷键过滤、Tab Queue 跳转、无结果状态和 `Cmd+K` 聚焦路径 |

### 4.0.0 重点

这版不是一次普通 selector 维护，而是围绕新版 ChatGPT UI 做了一轮系统性重构和回归修复。

| 方向 | 更新 |
| --- | --- |
| ChatGPT UI 适配 | 新增共享 DOM adapter / core 恢复链，适配新版会话结构、composer、send button、model switcher、SPA 切换与刷新后的延迟加载 |
| 长对话性能 | 重写 `chatgpt_perf` 为低风险性能协调器：公式/长代码压力探测、热路径降载、composer 输入减载、隐藏页/空闲释放缓存 |
| 内存控制 | Tab Queue、Quote、Perf、Core、QuickNav、Tree 都补了缓存裁剪和 release path，减少长会话里 DOM、文本快照和调试状态的长期保留 |
| Tab Queue | 修复多条 `Tab` 队列抢发、Thinking 中连续排队、`Option/Alt + ↑` 取回后再 `Tab` 误触发强制发送等问题 |
| QuickNav / Tree | 修复刷新后加载不及时、placeholder 省略号、锁定状态仍跳到底部、可见 fork 切换、树面板按钮和 `Lines` 状态显示 |
| Quote / TeX | 重构为 ask-multi 风格：选中回复文本后用轻量 Quote 按钮追加 Markdown `>` 引用，同时保留 KaTeX/LaTeX 还原和可配置双击复制 |
| 模型与推理操作 | 加固 `⌘O / ⌘J`，减少模型菜单抽搐；新增默认开启的禁用 `⌘P` 选项，同时保留 `⌘⇧P` / `⌘⌥P` Pro send |
| 用量与模型探测 | 加入 GPT 5.5 Thinking / Pro 用量池映射，移除 GPT 5 Thinking Mini；OpenAI 资源探测改为只有 HTTP 2xx 才算可用 |
| 跨站维护 | 重新测试和修复 DeepSeek、Google Search、Qwen、Kimi、Gemini、Grok、Genspark、Z.ai、Meta AI 等站点的关键路径 |

### ChatGPT 核心能力

| 能力 | 说明 |
| --- | --- |
| QuickNav | 对话级导航、跳转、收藏、图钉、锁定滚动、防自动跳底部 |
| Conversation Tree | 显示当前对话的消息树、分支和可见路径，并支持导出完整树 JSON |
| Tab Queue | 用 `Tab` 把输入排进队列，按顺序串行发送；`Option/Alt + ↑` 可取回最近排队草稿并重新排队 |
| Cmd+Enter | `⌘Enter / Ctrl+Enter` 发送，普通 Enter / Shift+Enter 保持换行策略 |
| Cmd+O / Cmd+J | `⌘O` 切换推理强度，`⌘J` 切换 Thinking / Pro，并提供顶部模型族 badge / toggle |
| Performance Coordinator | 针对长公式、长代码、长上下文和输入热路径做降载；默认启用极致性能模式 |
| TeX Copy & Quote | 选区 Quote、多段引用、KaTeX LaTeX 还原、悬停提示、双击复制开关 |
| Export / Fork Edit | 按当前可见分支导出 Markdown / HTML；用户消息可进行分叉编辑并补图/文件 |
| Usage / Timer / Status | ChatGPT 用量记录、回复计时器、OpenAI 新模型监控横幅 |
| UI Fixes | 顶栏按钮布局修复、文件下载修复、反馈按钮隐藏、粗体高亮、Canvas ID 辅助显示 |

### 支持站点

#### 主战场

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| ChatGPT (`chatgpt.com`) | QuickNav、Tree、Tab Queue、性能协调器、Quote / TeX、导出、分叉编辑、`⌘O / ⌘J`、用量统计、下载修复、顶栏修复 | 最高优先级 |
| Google 搜索 | 搜索页一键问 GPT，并跳到 ChatGPT 继续联网搜索工作流 | 最高优先级 |

#### 维护覆盖

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| Genspark | QuickNav、`⌘Enter`、绘图默认 2K、积分余量、长代码折叠、编辑上传修复、Sonnet thinking 兼容 | 持续维护 |
| Grok | QuickNav、`⌘Enter`、额度显示、废纸篓一键清空 | 持续维护 |
| Gemini App | QuickNav、`⌘Enter` | 持续维护 |
| Kimi | QuickNav、`⌘Enter` | 持续维护 |
| Qwen | QuickNav、`⌘Enter`、`⌘O / ⌘J` 模型/推理切换 | 持续维护 |
| DeepSeek | QuickNav、`⌘Enter` | 持续维护 |
| 文心一言 | QuickNav、`⌘Enter` | 持续维护 |
| Meta AI | Prompt 页 QuickNav、`⌘Enter`，并覆盖 Create / Muse 输入场景 | 持续维护 |
| GLM (`z.ai`) | QuickNav、`⌘Enter` | 持续维护 |

完整脚本、注入时机、作者和上游来源请看 [Scripts Inventory](./docs/scripts-inventory.md) 与 [Credits](./CREDITS.md)。

### 安装

1. 打开 [GitHub Releases](https://github.com/lueluelue2006/ai-chat-extension-collection/releases) 下载最新 `dist.zip`。
2. 先解压，得到固定目录 `AI-Shortcuts-dist`。
3. 打开 `chrome://extensions`。
4. 开启开发者模式。
5. 点击“加载未打包的扩展程序”。
6. 选择解压后的 `AI-Shortcuts-dist`。

仓库根目录故意不提供可直接加载的 `manifest.json`，避免误加载源码目录。

### 更新

不要在 Chrome 里移除扩展。原有设置和本地状态通常会保留。

1. 从 Releases 下载新的 `dist.zip`。
2. 先解压。
3. 保持原来的 `AI-Shortcuts-dist` 路径不变。
4. 用新版本文件替换这个目录里的旧文件。
5. 打开 `chrome://extensions`。
6. 对当前扩展实例点一次“重新加载”。

不要对另一份目录再次点击“加载未打包的扩展程序”，否则 Chrome 会把它当成第二个扩展实例。

### 设置页与弹窗

| 入口 | 作用 |
| --- | --- |
| Popup (`popup/`) | 识别当前站点、开关页面相关模块、执行部分菜单动作、检查更新 |
| Options (`options/`) | 管理站点/模块开关、键盘策略、主题/语言、OpenAI 新模型监控、导入导出、恢复出厂 |

OpenAI 新模型监控是可配置能力，不再内置默认探测 URL。只有 HTTP 2xx 会被判定为可用；403、404、5xx 和请求失败都不会触发可用提醒。

### 开发者工作流

仅在需要改代码或打包时使用：

```bash
npm ci
npm run verify
npm run package:dist
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 生成 `dist/` |
| `npm run check` | 运行仓库内建静态校验 |
| `npm run typecheck` | 运行 TypeScript 校验 |
| `npm run verify` | 同步 manifest、重生成脚本清单、校验并构建 |
| `npm run package:dist` | 基于 `dist/` 打包发布 zip |

真相源：

| 路径 | 说明 |
| --- | --- |
| `manifest.source.json` | 源 manifest |
| `shared/registry.ts` | 模块元数据 |
| `shared/injections.ts` | 注入定义 |
| `docs/scripts-inventory.md` | 由注册表和注入定义生成的公开脚本清单 |
| `dist/` | 面向最终用户的可加载运行目录 |
| `release/` | 本地发布包输出目录 |

### 目录结构

| 路径 | 说明 |
| --- | --- |
| `background/` | Service Worker 与后台逻辑 |
| `content/` | 各站点模块、站点内核与页面桥接 |
| `options/` | 设置页 |
| `popup/` | 扩展弹窗 |
| `shared/` | 注册表、注入定义与共享工具 |
| `dist/` | 面向非开发者的可加载运行目录 |
| `docs/` | 公开文档 |
| `icons/` | 图标资源 |
| `third_party/` | 第三方静态资源 |
| `release/` | 本地打包输出目录 |
| `scripts/` | 维护脚本 |

### 反馈

欢迎提交 Issue / PR。Bug 报告请尽量附带站点、复现步骤、预期结果、实际结果和浏览器版本。

## English

### Project Focus

AI Shortcuts is now explicitly ChatGPT-first.

The extension is designed for heavy ChatGPT usage: long conversations, complex math, long code blocks, Thinking / Pro workflows, repeated sending, branch inspection, quote collection, usage tracking, and model switching. Other AI sites remain supported, but they are maintained coverage for reusable navigation and input features rather than equal-depth primary targets.

### Release 4.0.5

This patch fixes a remaining QuickNav scroll-lock container mismatch in temporary chats and already-open pages.

| Area | Update |
| --- | --- |
| QuickNav scroll lock | Upgrades the MAIN-world scroll guard to v11 so open ChatGPT tabs can hot-upgrade the interceptor |
| QuickNav scroll lock | Prefers ChatGPT core's real `DIV` chat scroller over a stale `HTML` fallback after temporary-chat hydration |
| Verification | In real temporary and normal `/c/...` chats, real `Tab` queue sends preserved the locked mid-thread `scrollTop` through send and response completion |

### Release 4.0.4

This patch further fixes QuickNav scroll-lock baseline tracking in temporary chats.

| Area | Update |
| --- | --- |
| QuickNav scroll lock | Revalidates the active chat scroller after temporary-chat hydration replaces the initial scroll root |
| QuickNav scroll lock | Treats visible keyboard/accessibility scrolls as user baseline updates when ChatGPT is not generating and no recent conversation mutation is active |
| Tab Queue | Keeps the automatic-send guard active, so send-triggered native jump-to-bottom behavior is still restored instead of accepted as user intent |

### Release 4.0.3

This patch further hardens the boundary between QuickNav scroll lock and the Tab Queue automatic send pool.

| Area | Update |
| --- | --- |
| QuickNav scroll lock | Tab Queue now synchronously notifies QuickNav after queueing and before clearing the composer, preventing queued sends from triggering ChatGPT's native jump-to-bottom behavior |
| Tab Queue | Send-protection delivery now uses both synchronous `dispatchEvent` and asynchronous `postMessage`, covering queueing, composer write-back, programmatic send clicks, and send confirmation |
| Verification | Tested in a real ChatGPT conversation from a mid-thread locked position with real `Tab` queueing and automatic send completion: queue emptied, lock stayed enabled, `scrollTop=2800`, baseline=2800 |

### Release 4.0.2

This patch fixes the coordination gap between QuickNav scroll lock and the Tab Queue automatic send pool.

| Area | Update |
| --- | --- |
| QuickNav scroll lock | Tab Queue now notifies QuickNav before automatic sends so the locked baseline is preserved instead of jumping to the bottom |
| Tab Queue | Automatic send lifecycle now emits `prepare`, `before-click`, and `confirmed` protection signals for composer write-back and programmatic send clicks |
| Verification | Tested in a real ChatGPT conversation with real `Tab` queueing and automatic send completion: queue emptied, reply appeared, lock stayed enabled, `scrollTop=0`, baseline=0 |

### Release 4.0.1

This patch publishes the final verified state after the 4.0.0 release.

| Area | Update |
| --- | --- |
| QuickNav scroll lock | Hardened locked-position recovery across `scrollTop`, `scrollTo`, `scrollIntoView`, and real streaming replies |
| Tab Queue | Clears hidden preview DOM after queue clear so old queued text is not retained in page memory; also marks overflow rows explicitly |
| Diagnostics | Re-verified redaction: ChatGPT conversation URLs collapse to `/c/:id`, and raw queue text, composer text, and conversation text are not exported |
| Options | Re-verified global search, hotkey filtering, Tab Queue jump, no-results state, and `Cmd+K` search focus |

### Release 4.0.0

This release is a broad rebuild around the current ChatGPT UI, not a small selector patch.

| Area | Update |
| --- | --- |
| ChatGPT UI adaptation | Shared DOM adapter and core recovery paths for the current conversation structure, composer, send button, model switcher, SPA navigation, and delayed hydration |
| Long-thread performance | Reworked `chatgpt_perf` into a low-risk coordinator with math/code pressure detection, hot-path throttling, composer input relief, and hidden/idle memory release |
| Memory behavior | Cache trimming and release paths across Tab Queue, Quote, Perf, Core, QuickNav, and Tree |
| Tab Queue | Fixed multi-message queue races, Thinking-time stacking, and `Option/Alt + Up` restore-then-Tab premature sending |
| QuickNav / Tree | Fixed stale loading, placeholder rows, locked-scroll jump-to-bottom behavior, visible fork switching, and panel control readability |
| Quote / TeX | Rebuilt selected-text Quote into an ask-multi-style Markdown blockquote flow while keeping KaTeX/LaTeX restoration and configurable double-click copy |
| Model / reasoning controls | Hardened `⌘O / ⌘J`, reduced model menu flapping, and added a default-on plain `⌘P` blocker while preserving Pro-send shortcuts |
| Usage / model watch | Added GPT 5.5 Thinking / Pro usage mapping, removed GPT 5 Thinking Mini from active display, and changed model resource probing so only HTTP 2xx is available |
| Cross-site maintenance | Re-tested and adjusted key paths on DeepSeek, Google Search, Qwen, Kimi, Gemini, Grok, Genspark, Z.ai, and Meta AI |

### ChatGPT Capabilities

| Capability | Summary |
| --- | --- |
| QuickNav | Conversation navigation, jump, favorites, pins, scroll lock, and anti-auto-scroll |
| Conversation Tree | Current conversation tree, branch path display, and full tree JSON export |
| Tab Queue | Queue drafts with `Tab`, send them serially, and restore the latest queued draft with `Option/Alt + Up` |
| Cmd+Enter | `⌘Enter / Ctrl+Enter` sending while preserving newline behavior |
| Cmd+O / Cmd+J | `⌘O` reasoning effort switching, `⌘J` Thinking / Pro switching, and topbar model-family badge / toggle |
| Performance Coordinator | Default-on extreme mode for long math, long code, long context, and composer input hot paths |
| TeX Copy & Quote | Multi-quote, selected-text Markdown blockquotes, KaTeX LaTeX restoration, hover hint, and double-click copy option |
| Export / Fork Edit | Export the current visible branch to Markdown / HTML; fork-edit user messages with optional image/file attachment |
| Usage / Timer / Status | ChatGPT usage recording, reply timer, and OpenAI model-watch banner |
| UI Fixes | Header layout fix, file download fix, feedback-button hiding, bold highlight, and Canvas ID helpers |

### Supported Sites

#### Primary Targets

| Site | Representative capabilities | Status |
| --- | --- | --- |
| ChatGPT (`chatgpt.com`) | QuickNav, Tree, Tab Queue, performance coordinator, Quote / TeX, export, fork edit, `⌘O / ⌘J`, usage, download fix, header fix | Highest priority |
| Google Search | Ask GPT from Google results and continue the web-search workflow in ChatGPT | Highest priority |

#### Maintained Coverage

| Site | Representative capabilities | Status |
| --- | --- | --- |
| Genspark | QuickNav, `⌘Enter`, 2K image defaults, credit balance, long-code folding, edit upload fix, Sonnet thinking compatibility | Maintained |
| Grok | QuickNav, `⌘Enter`, quota display, one-click trash cleanup | Maintained |
| Gemini App | QuickNav, `⌘Enter` | Maintained |
| Kimi | QuickNav, `⌘Enter` | Maintained |
| Qwen | QuickNav, `⌘Enter`, `⌘O / ⌘J` model/reasoning switching | Maintained |
| DeepSeek | QuickNav, `⌘Enter` | Maintained |
| ERNIE Bot | QuickNav, `⌘Enter` | Maintained |
| Meta AI | Prompt-page QuickNav and `⌘Enter`, including Create / Muse input surfaces | Maintained |
| GLM (`z.ai`) | QuickNav, `⌘Enter` | Maintained |

See [Scripts Inventory](./docs/scripts-inventory.md) and [Credits](./CREDITS.md) for complete injection details, authorship, upstream sources, and license notes.

### Requirements

- Chrome / Chromium-based browser
- Manifest V3
- Minimum supported Chrome version: 96

### Install

1. Download the latest `dist.zip` from [GitHub Releases](https://github.com/lueluelue2006/ai-chat-extension-collection/releases).
2. Unzip it first so you get a fixed folder named `AI-Shortcuts-dist`.
3. Open `chrome://extensions`.
4. Turn on Developer Mode.
5. Click Load unpacked.
6. Select the unzipped `AI-Shortcuts-dist` directory.

The repository root intentionally does not ship a loadable `manifest.json`; this prevents accidentally loading the source tree.

### Update

Do not remove the extension in Chrome. Existing settings and local state are usually preserved.

1. Download the new `dist.zip` from Releases.
2. Unzip it first.
3. Keep the original `AI-Shortcuts-dist` path unchanged.
4. Replace the old files inside that folder with the new release files.
5. Open `chrome://extensions`.
6. Click Reload on the current extension instance.

Do not click Load unpacked again on a second folder, or Chrome will treat it as another extension instance.

### Popup And Settings

| Entry | Purpose |
| --- | --- |
| Popup (`popup/`) | Detects the current site, toggles page-relevant modules, runs selected menu actions, and checks for updates |
| Options (`options/`) | Manages site/module settings, keyboard behavior, theme/language, OpenAI model watch, import/export, and factory reset |

OpenAI model watch is configurable and no longer ships with default probe URLs. Only HTTP 2xx counts as available; 403, 404, 5xx, and fetch failures do not trigger availability alerts.

### Developer Workflow

Use this only when changing code or packaging a release:

```bash
npm ci
npm run verify
npm run package:dist
```

Common commands:

| Command | Purpose |
| --- | --- |
| `npm run build` | Generate `dist/` |
| `npm run check` | Run repository static checks |
| `npm run typecheck` | Run TypeScript checking |
| `npm run verify` | Sync manifest, regenerate scripts inventory, check, and build |
| `npm run package:dist` | Package a release zip from `dist/` |

Source of truth:

| Path | Purpose |
| --- | --- |
| `manifest.source.json` | Source manifest |
| `shared/registry.ts` | Module metadata |
| `shared/injections.ts` | Injection definitions |
| `docs/scripts-inventory.md` | Generated public script inventory |
| `dist/` | End-user loadable runtime directory |
| `release/` | Local release package output |

### Directory Layout

| Path | Purpose |
| --- | --- |
| `background/` | Service Worker and background logic |
| `content/` | Site modules, site cores, and page bridges |
| `options/` | Options page |
| `popup/` | Extension popup |
| `shared/` | Registry, injection definitions, and shared utilities |
| `dist/` | End-user loadable runtime directory |
| `docs/` | Public docs |
| `icons/` | Icon assets |
| `third_party/` | Third-party static assets |
| `release/` | Local packaging output directory |
| `scripts/` | Maintenance scripts |

### Feedback

Issues and PRs are welcome. For bug reports, please include the site, reproduction steps, expected result, actual result, and browser version.

---

README 由 GPT-5.5 重写；仓库作者尚未审阅。

README rewritten by GPT-5.5; the repository author has not reviewed it yet.
