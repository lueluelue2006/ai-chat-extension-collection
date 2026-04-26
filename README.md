<p align="center">
  <img src="./icons/logo.svg" alt="AI Shortcuts Logo" width="220" />
</p>

<h1 align="center">AI捷径 (AI Shortcuts)</h1>

<p align="center">
  A Chrome Manifest V3 productivity suite built primarily for ChatGPT power users, with reusable navigation and input enhancements extended to other major AI sites.
</p>

<p align="center">
  <a href="https://github.com/lueluelue2006/ai-chat-extension-collection/releases/latest">
    <img src="https://img.shields.io/github/v/release/lueluelue2006/ai-chat-extension-collection?display_name=tag&label=release" alt="Release">
  </a>
  <img src="https://img.shields.io/badge/focus-ChatGPT-74c0fc" alt="ChatGPT First">
  <img src="https://img.shields.io/badge/platform-Chrome%20MV3-8ce99a" alt="Chrome MV3">
  <img src="https://img.shields.io/badge/targets-10%20sites%20%2B%20common-ffd43b" alt="Targets">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-GPL--3.0--or--later-8ac926" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://github.com/lueluelue2006/ai-chat-extension-collection/releases">Download dist.zip</a>
  ·
  <a href="#english">English</a>
  ·
  <a href="#中文说明">中文</a>
  ·
  <a href="./docs/scripts-inventory.md">Scripts Inventory</a>
  ·
  <a href="./CREDITS.md">Credits</a>
</p>

> Non-developers should install the packaged `dist.zip` from GitHub Releases. Unzip it first. Do not load the repository source directory directly.

## English

### What This Project Is

AI Shortcuts focuses on high-frequency workflows for heavy ChatGPT and GPT users:

- conversation navigation, jumping, favorites, and structural browsing
- sending, editing, model / reasoning switching, and queue-based drafting
- long-thread recovery, header patches, performance and stability hardening
- reusing mature navigation and input enhancements on other AI sites

This project is not trying to be a giant compatibility layer for everything. The goal is to go deep on ChatGPT first, then extend the proven parts elsewhere.

### What's New In 3.2.0

| Area | Summary |
| --- | --- |
| ChatGPT long-thread hardening | Further work on recovery, long-distance navigation, performance controls, and low-memory behavior for long conversations |
| Pro workflow support | Tab queue is no longer blocked by old Pro-only gating and now works in current ChatGPT Pro flows |
| Current UI adaptation | Continued fixes for header layout, model-family actions, options opening, and runtime behavior on the current ChatGPT UI |
| Safer runtime behavior | More lazy initialization and fewer always-on listeners in costly paths |

### Core Capabilities

| Capability | Summary |
| --- | --- |
| QuickNav | Conversation-level navigation, jump, favorites, pins, and anti-auto-scroll control |
| Conversation structure tools | ChatGPT tree view, export, fork edit, TeX copy/reference helpers, and download fixes |
| Tab queue | Queue drafts with `Tab`, send them serially, and restore the latest queued draft |
| Model / reasoning controls | ChatGPT `⌘O / ⌘J`, model-family badge / toggle, and Qwen model / reasoning switching |
| Long-session optimization | ChatGPT long-thread performance work, header recovery, SPA recovery, and code-block interaction cost reduction |
| Input enhancements | Multi-site `⌘Enter / Ctrl+Enter` sending and consistent Enter / Shift+Enter behavior |
| Central settings and menus | One options page for site/module settings, plus a popup for page-scoped actions |
| Usage / status surfaces | ChatGPT usage display, Grok quota display, and OpenAI model watch banners |

### Supported Sites

#### Primary Focus

| Site | Representative capabilities | Status |
| --- | --- | --- |
| ChatGPT | QuickNav, tree/export/fork-edit tools, Tab queue, performance controls, `⌘O / ⌘J`, model-family badge / toggle, download fixes, usage display | Highest priority |
| Google Search | Ask GPT directly from search results and continue the flow in ChatGPT | Highest priority |

#### Additional Coverage

| Site | Representative capabilities | Status |
| --- | --- | --- |
| Genspark | QuickNav, `⌘Enter`, drawing defaults, credits display, long-code folding, edit/upload fixes | Maintained |
| Grok | QuickNav, `⌘Enter`, quota display, one-click trash cleanup | Maintained |
| Gemini App | QuickNav, `⌘Enter` | Maintained |
| Kimi | QuickNav, `⌘Enter` | Maintained |
| Qwen | QuickNav, `⌘Enter`, fast model / reasoning switching | Maintained |
| DeepSeek | QuickNav, `⌘Enter` | Maintained |
| ERNIE Bot | QuickNav, `⌘Enter` | Maintained |
| GLM (`z.ai`) | QuickNav, `⌘Enter` | Maintained |

### Requirements

- Chrome / Chromium-based browser
- Manifest V3
- Minimum supported Chrome version: 96

### Quick Install For End Users

1. Download the latest `dist.zip` from [GitHub Releases](https://github.com/lueluelue2006/ai-chat-extension-collection/releases).
2. Unzip it first so you get a fixed folder named `AI-Shortcuts-dist`.
3. Open `chrome://extensions`.
4. Turn on Developer Mode.
5. Click Load unpacked.
6. Select the unzipped `AI-Shortcuts-dist` directory.

> The repository root intentionally does not ship a loadable `manifest.json`. This prevents accidentally loading the source tree.

### Update An Existing Install

> Do not remove the extension in Chrome. Existing settings and local state are usually preserved.

1. Download the new `dist.zip` from Releases.
2. Unzip it first.
3. Keep the original `AI-Shortcuts-dist` path unchanged.
4. Replace the old files inside that folder with the new release files.
5. Open `chrome://extensions`.
6. Click Reload on the current extension instance.

> Do not click Load unpacked again on a second folder, or Chrome will treat it as another extension instance.

### Docs

- [Scripts inventory and injection definitions](./docs/scripts-inventory.md)
- [Credits and external sources](./CREDITS.md)

The README stays intentionally compact. Full module and injection details live in `docs/scripts-inventory.md`.

### Popup And Settings

- **Popup (`popup/`)**: detects the current site, toggles page-relevant modules, runs a subset of menu actions, and checks for updates.
- **Options page (`options/`)**: manages site/module settings, keyboard behavior, theme/language, OpenAI model watch, import/export, and factory reset.
- **Update check note**: the popup compares against the repository `main` branch version. GitHub Releases remains the source of truth for `dist.zip`.

### OpenAI Model Watch

This is a configurable feature, not a hard-coded banner for one fixed GPT version.

- maintain a list of OpenAI resource URLs in settings
- probe them periodically in the background
- surface hits through notifications, the extension badge, and ChatGPT in-page banners

### Developer Workflow

Use this only when you are changing code:

```bash
npm ci
npm run verify
npm run package:dist
```

Common commands:

- `npm run build`: generate `dist/`
- `npm run check`: run repository static checks
- `npm run typecheck`: run TypeScript checking
- `npm run verify`: sync manifest, regenerate scripts inventory, run checks, and build
- `npm run package:dist`: package a release zip from `dist/`

#### Source Of Truth And Generated Outputs

- `manifest.source.json`: source manifest
- `shared/registry.ts` + `shared/injections.ts`: source of truth for modules and injections
- `dist/`: mirrored runtime output for end users and releases
- `release/`: local packaging output; `npm run package:dist` creates `ai-shortcuts-dist-v<version>.zip` by default

Public maintenance scripts in `scripts/`:

- `scripts/verify.js`: repository validation entry point
- `scripts/sync-manifest.js`: sync permissions and bootstrap matches from `manifest.source.json`
- `scripts/gen-scripts-inventory.js`: regenerate `docs/scripts-inventory.md`
- `scripts/stats.js`: print site / module / injection statistics
- `scripts/package-dist.mjs`: package the release zip from `dist/`

### Directory Layout

| Path | Purpose |
| --- | --- |
| `background/` | Service Worker and background logic |
| `content/` | Site modules, site cores, and page bridges |
| `options/` | Options page |
| `popup/` | Extension popup |
| `shared/` | Registry, injection definitions, and shared utilities |
| `dist/` | End-user loadable runtime directory |
| `docs/` | Minimal public docs |
| `icons/` | Icon assets |
| `third_party/` | Third-party static assets |
| `release/` | Local packaging output directory |
| `scripts/` | Public maintenance scripts |

### Feedback

Issues and PRs are welcome.  
For bug reports, please include the site, reproduction steps, expected result, actual result, and browser version.

## 中文说明

### 这个项目是什么

AI捷径优先解决重度 ChatGPT / GPT 用户的高频问题：

- 长对话导航、跳转、收藏与结构化查看
- 发送、编辑、模型 / 推理切换和队列化草稿处理
- 长线程恢复链、顶栏补丁、性能与稳定性增强
- 把成熟的导航与输入增强能力复用到其他主流 AI 站点

它不是“尽量兼容一切”的大杂烩，而是先把 ChatGPT 做深做稳，再把验证过的能力扩展出去。

### 3.2.0 重点

| 方向 | 说明 |
| --- | --- |
| ChatGPT 长线程加固 | 继续围绕长对话恢复、长距离跳转、性能控制和低内存行为做强化 |
| Pro 工作流支持 | Tab queue 不再受旧的 Pro 门控影响，当前 ChatGPT Pro 流程可用 |
| 新版 UI 适配 | 顶栏布局、模型族动作、设置页打开方式和运行时行为继续跟随当前 ChatGPT UI 校正 |
| 更稳的运行时 | 减少高成本路径中的常驻监听与过早初始化 |

### 核心能力

| 能力 | 说明 |
| --- | --- |
| QuickNav | 对话级导航、跳转、收藏、📌 标记、防自动滚动 |
| 对话结构工具 | ChatGPT 消息树、导出、分叉编辑、TeX 复制 / 引用增强（多段 Quote 交互参考 `chatgpt-ask-multi`）、下载修复 |
| Tab queue | `Tab` 排队、自动串行发送、最近一条取回 |
| 模型 / 推理操作 | ChatGPT `⌘O / ⌘J`、模型族 badge / toggle、Qwen 模型 / 推理切换 |
| 长会话优化 | ChatGPT 长线程性能优化、顶栏恢复、SPA 恢复、代码块交互减载 |
| 输入增强 | 多站点 `⌘Enter / Ctrl+Enter` 发送与一致的 Enter / Shift+Enter 行为 |
| 集中配置与菜单 | 统一设置页加页面弹窗动作 |
| 用量 / 状态显示 | ChatGPT 用量、Grok 额度、OpenAI 新模型监控横幅 |

### 支持站点

#### 主战场

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| ChatGPT | QuickNav、消息树 / 导出 / 分叉编辑、Tab queue、性能优化、`⌘O / ⌘J`、顶栏模型族 badge / toggle、下载修复、用量统计 | 最高优先级维护 |
| Google 搜索 | 搜索页一键问 GPT，直接跳到 ChatGPT 继续工作流 | 最高优先级维护 |

#### 其他站点

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| Genspark | QuickNav、`⌘Enter`、绘图默认设置、积分余量、长代码块折叠、编辑上传修复 | 持续维护 |
| Grok | QuickNav、`⌘Enter`、额度显示、废纸篓一键清空 | 持续维护 |
| Gemini App | QuickNav、`⌘Enter` | 持续维护 |
| Kimi | QuickNav、`⌘Enter` | 持续维护 |
| Qwen | QuickNav、`⌘Enter`、模型 / 推理快捷切换 | 持续维护 |
| DeepSeek | QuickNav、`⌘Enter` | 持续维护 |
| 文心一言 | QuickNav、`⌘Enter` | 持续维护 |
| GLM（`z.ai`） | QuickNav、`⌘Enter` | 持续维护 |

### 运行要求

- Chrome / Chromium 内核浏览器
- Manifest V3
- 最低支持 Chrome 96

### 非开发者快速安装

1. 打开 [GitHub Releases](https://github.com/lueluelue2006/ai-chat-extension-collection/releases) 下载最新 `dist.zip`。
2. 先解压，得到固定目录 `AI-Shortcuts-dist`。
3. 打开 `chrome://extensions`。
4. 开启开发者模式。
5. 点击“加载未打包的扩展程序”。
6. 选择解压后的 `AI-Shortcuts-dist`。

> 仓库根目录故意不提供可直接加载的 `manifest.json`，就是为了避免误加载源码目录。

### 更新已有安装

> 不要在 Chrome 里移除扩展。原有设置和本地状态通常会保留。

1. 从 Releases 下载新的 `dist.zip`。
2. 先解压。
3. 保持原来的 `AI-Shortcuts-dist` 路径不变。
4. 用新版本文件替换这个目录里的旧文件。
5. 打开 `chrome://extensions`。
6. 对当前实例点一次“重新加载”。

> 不要再次对另一份目录点“加载未打包的扩展程序”，否则 Chrome 会把它当成第二个实例。

### 文档

- [脚本清单与注入定义](./docs/scripts-inventory.md)
- [致谢与外部来源](./CREDITS.md)

README 只保留最小必要说明；完整模块和注入明细请看 `docs/scripts-inventory.md`。

### 弹窗与设置页

- **弹窗 (`popup/`)**：识别当前站点、快速开关模块、执行部分菜单动作、检查更新。
- **设置页 (`options/`)**：集中管理站点 / 模块开关、键盘策略、主题 / 语言、OpenAI 新模型监控、导入导出与恢复出厂。
- **检查更新说明**：弹窗里的“检查更新”对比的是仓库 `main` 分支版本；真正面向用户的发布以 Releases 里的 `dist.zip` 为准。

### OpenAI 新模型监控

这是一个可配置能力，不是写死某个固定 GPT 版本的横幅。

- 在设置页里维护待探测的 OpenAI 资源 URL 列表
- 后台按周期探测资源是否可访问
- 命中后通过系统通知、扩展角标和 ChatGPT 页内横幅提示

### 开发者工作流

仅在需要改代码时使用：

```bash
npm ci
npm run verify
npm run package:dist
```

常用命令：

- `npm run build`：生成 `dist/`
- `npm run check`：运行仓库内建静态校验
- `npm run typecheck`：运行 TypeScript 校验
- `npm run verify`：同步 manifest、重生成脚本清单、校验并构建
- `npm run package:dist`：基于 `dist/` 打包发布包

#### 真相源与生成物

- `manifest.source.json`：源 manifest
- `shared/registry.ts` + `shared/injections.ts`：模块与注入定义真相源
- `dist/`：面向终端用户和发布的镜像产物
- `release/`：本地打包输出目录，默认生成 `ai-shortcuts-dist-v<version>.zip`

公开维护脚本位于 `scripts/`：

- `scripts/verify.js`
- `scripts/sync-manifest.js`
- `scripts/gen-scripts-inventory.js`
- `scripts/stats.js`
- `scripts/package-dist.mjs`

### 目录结构

| 路径 | 说明 |
| --- | --- |
| `background/` | Service Worker 与后台逻辑 |
| `content/` | 各站点模块、站点内核与页面桥接 |
| `options/` | 设置页 |
| `popup/` | 扩展弹窗 |
| `shared/` | 注册表、注入定义与共享工具 |
| `dist/` | 面向非开发者的可加载运行目录 |
| `docs/` | 最小必要公开文档 |
| `icons/` | 图标资源 |
| `third_party/` | 第三方静态资源 |
| `release/` | 本地打包输出目录 |
| `scripts/` | 公开维护脚本 |

### 反馈

欢迎提交 Issue / PR。  
Bug 报告请尽量附带：站点、触发步骤、预期结果、实际结果和浏览器版本。
