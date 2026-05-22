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
  <img src="https://img.shields.io/badge/current-4.1.2-74c0fc" alt="Current version 4.1.2">
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

### 当前版本

当前最新版本：`4.1.2`。

这是目前发布给用户安装的稳定版本。README 只介绍当前版本、安装方式和开发入口；历史更新记录请以 GitHub Releases 为准。

### 项目定位

AI捷径现在的战略重心已经明确转向 `chatgpt.com`。

这个扩展优先服务重度 ChatGPT 用户：长对话、复杂公式、长代码、Thinking / Pro 工作流、重复发送、分支查看、引用整理、用量统计和模型切换。其他 AI 站点仍然维护，但定位是把已经稳定的导航与输入能力复用过去，而不是把每个网站都做成同等深度的主战场。

### ChatGPT 能力

| 能力 | 说明 |
| --- | --- |
| QuickNav | 对话导航、跳转、收藏、图钉、滚动锁和防自动滚动 |
| Conversation Tree | 当前对话树、分支路径显示、完整树 JSON 导出 |
| Tab Queue | 用 `Tab` 排队发送草稿，串行发送，并用 `Option/Alt + Up` 取回最近一条 |
| Cmd+Enter | `⌘Enter / Ctrl+Enter` 发送，同时保留正常换行行为 |
| Cmd+O / Cmd+J | `⌘O` 在 Medium / High 间切换，`⌘J` 在 High / Pro 间切换，可选 High→max 请求改写 |
| Performance Coordinator | 面向长公式、长代码、长上下文和输入框热路径的性能协调 |
| TeX Copy & Quote | 多引用、选中文本 Markdown 引用、KaTeX/LaTeX 恢复、悬停提示、双击复制选项 |
| Export / Fork Edit | 当前可见分支导出 Markdown / HTML，编辑用户消息并可附带图片/文件 |
| Usage / Timer / Status | ChatGPT 用量统计、回复计时、OpenAI 模型观察横幅 |
| UI Fixes | 顶栏布局修复、文件下载修复、反馈按钮隐藏、加粗高亮、Canvas ID 辅助 |

### 支持站点

#### 重点站点

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| ChatGPT (`chatgpt.com`) | QuickNav、Tree、Tab Queue、性能协调、Quote / TeX、导出、fork edit、`⌘O / ⌘J`、用量统计、下载修复、顶栏修复 | 最高优先级 |
| Google Search | 从 Google 搜索结果转发到 ChatGPT 并继续网页搜索工作流 | 最高优先级 |

#### 持续维护

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| Genspark | QuickNav、`⌘Enter`、GPT Image 2 / 4K / Medium 绘图默认设置、积分余量、长代码折叠、编辑上传修复、Sonnet thinking 兼容 | 持续维护 |
| Grok | QuickNav、`⌘Enter`、额度显示、废纸篓一键清空 | 持续维护 |
| Gemini App | QuickNav、`⌘Enter` | 持续维护 |
| Kimi | QuickNav、`⌘Enter` | 持续维护 |
| Qwen | QuickNav、`⌘Enter`、`⌘O / ⌘J` 模型/推理切换 | 持续维护 |
| DeepSeek | QuickNav、`⌘Enter` | 持续维护 |
| ERNIE Bot | QuickNav、`⌘Enter` | 持续维护 |
| Meta AI | Prompt 页面 QuickNav 与 `⌘Enter`，覆盖 Create / Muse 输入区域 | 持续维护 |
| GLM (`z.ai`) | QuickNav、`⌘Enter` | 持续维护 |

完整注入细节、作者、上游来源和许可说明见 [Scripts Inventory](./docs/scripts-inventory.md) 与 [Credits](./CREDITS.md)。

### 安装

1. 打开 [GitHub Releases](https://github.com/lueluelue2006/ai-chat-extension-collection/releases) 下载最新 `dist.zip`。
2. 先解压，得到固定目录 `AI-Shortcuts-dist`。
3. 打开 `chrome://extensions`。
4. 开启 Developer Mode。
5. 点击 Load unpacked。
6. 选择解压后的 `AI-Shortcuts-dist` 目录。

仓库根目录故意不提供可直接加载的 `manifest.json`，避免误把源码目录当成扩展加载。

### 更新

不要在 Chrome 里删除扩展。保留同一个 `AI-Shortcuts-dist` 路径并替换目录内容，通常可以保留已有设置和本地状态。

1. 从 Releases 下载新的 `dist.zip`。
2. 解压新包。
3. 保持原 `AI-Shortcuts-dist` 路径不变。
4. 用新文件替换旧目录里的文件。
5. 打开 `chrome://extensions`。
6. 点击当前扩展实例的 Reload。

不要对第二个目录再次点击 Load unpacked，否则 Chrome 会把它当成另一个扩展实例。

### 配置页

| 入口 | 作用 |
| --- | --- |
| Popup (`popup/`) | 检测当前站点，切换当前页面相关模块，执行菜单动作，检查更新 |
| Options (`options/`) | 管理站点/模块设置、键盘行为、主题/语言、OpenAI 模型观察、导入导出和恢复出厂 |

OpenAI 模型观察是可配置能力，默认不内置探测 URL。只有 HTTP 2xx 视为可用；403、404、5xx 和请求失败都不会触发可用提醒。

### 开发

```bash
npm ci
npm run verify
npm run package:dist
```

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 生成 `dist/` |
| `npm run check` | 运行仓库静态检查 |
| `npm run typecheck` | 运行 TypeScript 检查 |
| `npm run verify` | 同步 manifest、生成脚本清单、检查并构建 |
| `npm run package:dist` | 基于 `dist/` 打包发布 zip |

| 路径 | 作用 |
| --- | --- |
| `manifest.source.json` | 源 manifest |
| `shared/registry.ts` | 模块元数据 |
| `shared/injections.ts` | 注入定义 |
| `docs/scripts-inventory.md` | 生成的公开脚本清单 |
| `dist/` | 用户可加载的运行时目录 |
| `release/` | 本地发布包输出目录 |

### 反馈

欢迎提交 Issue / PR。Bug 报告请尽量附带站点、复现步骤、预期结果、实际结果和浏览器版本。

## English

### Latest Version

Current latest version: `4.1.2`.

This is the stable build users should install from GitHub Releases. The README only describes the current version, installation path, and developer entry points; historical release notes live in GitHub Releases.

### Project Focus

AI Shortcuts is now explicitly ChatGPT-first.

The extension is designed for heavy ChatGPT usage: long conversations, complex math, long code blocks, Thinking / Pro workflows, repeated sending, branch inspection, quote collection, usage tracking, and model switching. Other AI sites remain supported as maintained coverage for reusable navigation and input features.

### ChatGPT Capabilities

| Capability | Summary |
| --- | --- |
| QuickNav | Conversation navigation, jump, favorites, pins, scroll lock, and anti-auto-scroll |
| Conversation Tree | Current conversation tree, branch path display, and full tree JSON export |
| Tab Queue | Queue drafts with `Tab`, send them serially, and restore the latest queued draft with `Option/Alt + Up` |
| Cmd+Enter | `⌘Enter / Ctrl+Enter` sending while preserving newline behavior |
| Cmd+O / Cmd+J | `⌘O` switches Medium / High, `⌘J` switches High / Pro, with optional High→max request rewrite |
| Performance Coordinator | Coordination for long math, long code, long context, and composer input hot paths |
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
| Genspark | QuickNav, `⌘Enter`, GPT Image 2 / 4K / Medium image defaults, credit balance, long-code folding, edit upload fix, Sonnet thinking compatibility | Maintained |
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

| Command | Purpose |
| --- | --- |
| `npm run build` | Generate `dist/` |
| `npm run check` | Run repository static checks |
| `npm run typecheck` | Run TypeScript checking |
| `npm run verify` | Sync manifest, regenerate scripts inventory, check, and build |
| `npm run package:dist` | Package a release zip from `dist/` |

| Path | Purpose |
| --- | --- |
| `manifest.source.json` | Source manifest |
| `shared/registry.ts` | Module metadata |
| `shared/injections.ts` | Injection definitions |
| `docs/scripts-inventory.md` | Generated public script inventory |
| `dist/` | End-user loadable runtime directory |
| `release/` | Local release package output |

### Feedback

Issues and PRs are welcome. For bug reports, please include the site, reproduction steps, expected result, actual result, and browser version.
