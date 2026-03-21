<p align="center">
  <img src="./icons/logo.svg" alt="AI捷径 Logo" width="220" />
</p>

<h1 align="center">AI捷径 (AI Shortcuts)</h1>

<p align="center">
  一个以 ChatGPT 为主战场的 Chrome Manifest V3 效率增强套件，并把成熟能力扩展到其他主流 AI 站点。
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
  <a href="https://github.com/lueluelue2006/ai-chat-extension-collection/releases">下载 dist.zip</a>
  ·
  <a href="#快速安装非开发者">快速安装</a>
  ·
  <a href="#30x-当前重点">3.0.x 当前重点</a>
  ·
  <a href="#支持站点">支持站点</a>
  ·
  <a href="./docs/scripts-inventory.md">脚本清单</a>
  ·
  <a href="./CREDITS.md">致谢</a>
</p>

> 非开发者用户请直接去 **GitHub Releases** 下载 `dist.zip`，**先解压** 再安装。不要下载源码 ZIP，也不要加载源码仓库目录。

## 这个项目现在是什么

AI捷径优先解决 **ChatGPT / GPT 重度用户** 的高频问题：

- 长对话导航、跳转、收藏与结构化查看
- 发送、编辑、模型 / 推理切换等高频操作提效
- 长会话下的恢复链、顶栏补丁、性能与稳定性增强
- 把已经成熟的导航与输入增强能力复用到其他主流 AI 站点

它不是“尽量兼容一切”的大杂烩，而是先把 ChatGPT 做深做稳，再把可复用能力扩展出去。

## 3.0.x 当前重点

| 方向 | 说明 |
| --- | --- |
| ChatGPT 新 UI 适配 | QuickNav、顶栏按钮布局、模型族标签 / 切换、消息树 / 导出、Tab queue、性能优化都围绕新版 ChatGPT 页面持续校正 |
| 长对话稳定性 | 针对 ChatGPT 长线程做了 QuickNav 恢复链、性能优化、代码块交互减载和 SPA 进入恢复 |
| 高频操作提效 | `⌘Enter / Ctrl+Enter`、`⌘O / ⌘J`、Google 搜索一键问 GPT、Tab queue 构成核心工作流 |
| 多站点复用 | Grok、Genspark、Gemini、Kimi、Qwen、DeepSeek、文心一言、GLM 共享 QuickNav / 输入增强等成熟能力 |

## 核心能力

| 能力 | 说明 |
| --- | --- |
| QuickNav | 对话级导航、跳转、收藏、📌 标记、防自动滚动，属于项目最核心的交互层 |
| 对话结构工具 | ChatGPT 消息树、对话导出、分叉编辑、TeX 复制与引用增强、下载修复 |
| Tab queue | 面向 ChatGPT 的队列化消息流：Tab 排队、自动串行发送、最近一条取回 |
| 模型 / 推理操作 | ChatGPT `⌘O / ⌘J`、顶栏模型族 badge / toggle，Qwen Thinking/Fast / 模型切换 |
| 长会话优化 | ChatGPT 长线程性能优化、顶栏恢复、页面进入恢复、代码块交互减载 |
| 站点输入增强 | 多站点 `⌘Enter / Ctrl+Enter` 发送、Enter/Shift+Enter 换行统一 |
| 集中配置与菜单 | 配置页按站点/模块统一管理，弹窗按当前页面快速开关与执行部分菜单动作 |
| 用量 / 状态显示 | ChatGPT 用量统计、Grok 剩余额度显示、OpenAI 新模型横幅提示 |

## 支持站点

### GPT 主战场

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| ChatGPT | QuickNav、消息树 / 导出 / 分叉编辑、Tab queue、性能优化、`⌘O / ⌘J`、顶栏模型 badge / toggle、下载修复、用量统计 | 最高优先级维护 |
| Google 搜索 | 搜索页一键问 GPT，直接跳到 ChatGPT 继续工作流 | 最高优先级维护 |

### 其他站点补充覆盖

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| Genspark | QuickNav、`⌘Enter`、绘图默认设置、积分余量、长代码块折叠、编辑上传修复 | 持续维护 |
| Grok | QuickNav、`⌘Enter`、额度显示、废纸篓一键清空 | 持续维护 |
| Gemini App | QuickNav、`⌘Enter` | 持续维护 |
| Kimi | QuickNav、`⌘Enter` | 持续维护 |
| Qwen | QuickNav、`⌘Enter`、模型 / 推理快捷切换 | 持续维护 |
| DeepSeek | QuickNav、`⌘Enter` | 持续维护 |
| 文心一言 | QuickNav、`⌘Enter` | 持续维护 |
| GLM（z.ai） | QuickNav、`⌘Enter` | 持续维护 |

## 运行要求

- Chrome / Chromium 内核浏览器，Manifest V3
- 当前 manifest 最低版本要求：Chrome 96

## 快速安装（非开发者）

1. 打开 [GitHub Releases](https://github.com/lueluelue2006/ai-chat-extension-collection/releases) 并下载最新的 `dist.zip`。
2. **先解压**，得到固定文件夹 `AI-Shortcuts-dist`。
3. 打开 `chrome://extensions`。
4. 开启「开发者模式」。
5. 点击「加载未打包的扩展程序」。
6. 选择解压后的 `AI-Shortcuts-dist` 目录。

> 仓库根目录故意不提供可加载的 `manifest.json`，就是为了避免误加载源码目录。

## 更新现有安装（作者推荐方法）

> 不要在 Chrome 里“移除扩展”。这样原来的设置和使用记录通常会继续保留。

1. 去 Releases 下载新的 `dist.zip`。
2. **先解压**。
3. 保持原来的 `AI-Shortcuts-dist` 路径不变。
4. 清空这个目录里的旧文件，再把新版解压后的内容放进去。
5. 打开 `chrome://extensions`。
6. 对当前这个实例点一次「重新加载」。

> 不要再次点击「加载未打包的扩展程序」去选另一份新目录，否则 Chrome 会把它当成第二个扩展。

## 文档

- [脚本清单与注入定义](./docs/scripts-inventory.md)
- [致谢与外部来源](./CREDITS.md)

完整模块列表与注入明细请看 `docs/scripts-inventory.md`，README 只保留面向用户和开发者的最小必要说明。

## 弹窗与设置页

- **弹窗 (`popup/`)**：识别当前页面站点、快速开关当前站点模块、执行部分模块菜单动作、检查更新。
- **设置页 (`options/`)**：按站点/模块统一管理开关，集中配置键盘策略、主题/语言、OpenAI 新模型监控、数据导入导出与恢复出厂。
- **检查更新说明**：弹窗里的“检查更新”比对的是仓库 `main` 分支版本，不保证和 GitHub Releases 完全同步；Release 仍以 Releases 页面里的 `dist.zip` 为准。

## OpenAI 新模型监控

这是一个可配置能力，不是固定写死某个 GPT 版本的横幅。

- 在设置页里维护待探测的 OpenAI 资源 URL 列表
- 后台按周期探测资源是否可访问
- 命中后通过系统通知、扩展角标和 ChatGPT 页内横幅提示

## 开发者工作流

仅在你需要改代码时使用：

```bash
npm ci
npm run verify
npm run package:dist
```

常用命令：

- `npm run build`：生成 `dist/`
- `npm run check`：运行内建静态校验
- `npm run typecheck`：运行 TypeScript 校验
- `npm run verify`：同步 manifest / 重生成脚本清单 / 校验 / 构建
- `npm run package:dist`：基于 `dist/` 生成发布包

### 源码真相源与生成物

- `manifest.source.json`：源 manifest
- `shared/registry.ts` + `shared/injections.ts`：模块与注入定义真相源
- `dist/`：镜像构建产物，供非开发者加载与发布使用
- `release/`：本地打包输出目录；`npm run package:dist` 默认生成 `ai-shortcuts-dist-v<version>.zip`，GitHub Releases 对外资产名可单独维护为 `dist.zip`

公开仓库保留的维护脚本位于 `scripts/`：

- `scripts/verify.js`：仓库内建验证链入口
- `scripts/sync-manifest.js`：同步 `manifest.source.json` 的权限与 bootstrap `matches`
- `scripts/gen-scripts-inventory.js`：重生成 `docs/scripts-inventory.md`
- `scripts/stats.js`：打印站点、模块与注入定义统计
- `scripts/package-dist.mjs`：从 `dist/` 打包发布用压缩包

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `background/` | Service Worker 与后台逻辑 |
| `content/` | 各站点模块、站点内核与页面桥接 |
| `options/` | 配置页 |
| `popup/` | 扩展弹窗 |
| `shared/` | 注册表、注入定义与共享工具 |
| `dist/` | 面向非开发者的可加载运行目录 |
| `docs/` | 最小必要公开文档（当前只保留脚本清单） |
| `icons/` | 图标资源 |
| `third_party/` | 第三方静态资源 |
| `release/` | 本地打包输出目录（默认被忽略，不开源） |
| `scripts/` | 公开维护脚本 |

## 反馈

欢迎提交 Issue / PR。  
Bug 报告请尽量附带：站点、触发步骤、预期结果、实际结果、浏览器版本。
