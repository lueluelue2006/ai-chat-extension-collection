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
  <img src="https://img.shields.io/badge/current-4.0.0-74c0fc" alt="Current version 4.0.0">
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
