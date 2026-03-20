<p align="center">
  <img src="./icons/logo.svg" alt="AI捷径 Logo" width="220" />
</p>

<h1 align="center">AI捷径 (AI Shortcuts)</h1>

<p align="center">
  一个以 ChatGPT / GPT 工作流为核心、并向其他主流 AI 站点扩展的 Chrome Manifest V3 增强套件。
</p>

<p align="center">
  <a href="https://github.com/lueluelue2006/ai-chat-extension-collection/releases/latest">
    <img src="https://img.shields.io/github/v/release/lueluelue2006/ai-chat-extension-collection?display_name=tag&label=release" alt="Release">
  </a>
  <a href="#支持站点">
    <img src="https://img.shields.io/badge/sites-10-4cc9f0" alt="Sites">
  </a>
  <a href="./docs/scripts-inventory.md">
    <img src="https://img.shields.io/badge/modules-29-72efdd" alt="Modules">
  </a>
  <a href="./docs/scripts-inventory.md">
    <img src="https://img.shields.io/badge/content%20defs-59-90be6d" alt="Content defs">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-GPL--3.0--or--later-8ac926" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://github.com/lueluelue2006/ai-chat-extension-collection/releases">下载 dist.zip</a>
  ·
  <a href="#快速安装非开发者">快速安装</a>
  ·
  <a href="#gpt-核心能力">GPT 核心能力</a>
  ·
  <a href="#支持站点">支持站点</a>
  ·
  <a href="./docs/scripts-inventory.md">脚本清单</a>
  ·
  <a href="./CREDITS.md">致谢</a>
  ·
  <a href="./docs/deep-dive.md">架构文档</a>
</p>

> 非开发者用户请直接去 **GitHub Releases** 下载 `dist.zip`，**先解压** 再安装。不要下载源码 ZIP，也不要加载源码仓库目录。

## 项目概览

AI捷径首先服务的是 **ChatGPT / GPT 重度用户**。
核心设计目标不是“尽量兼容更多站”，而是先把 ChatGPT 的高频效率流做深做稳，再把成熟能力扩展到其他主流 AI 站点。

| 方向 | 内容 |
| --- | --- |
| GPT 优先 | ChatGPT 是主战场：QuickNav、消息树 / 对话导出 / 分叉编辑、Tab queue、用量统计、模型 / 推理切换、下载修复、搜索联动都先围绕 GPT 工作流设计 |
| 核心效率流 | QuickNav 导航、结构化对话工具、Tab queue 队列化交互、集中配置管理构成最核心的日常工作流 |
| 多站点补充覆盖 | 在 Google 搜索、Genspark、Grok、Gemini、Kimi、Qwen、DeepSeek、文心一言、GLM 上复用成熟输入增强与导航能力 |
| 公开分发方式 | 面向非开发者只发布 `dist.zip`，公开仓库保留源码与维护脚本 |

## GPT 核心能力

| 能力 | 说明 |
| --- | --- |
| QuickNav | 对话级导航、标记、跳转和阅读效率增强，属于最核心的 GPT 工作流层 |
| 对话结构工具 | 对话导出、消息树、分叉编辑、下载修复、引用与复制增强 |
| Tab queue | 面向 ChatGPT 的队列化消息流，支持多条排队、回收、删除、暂停与恢复 |
| 用量统计 | 按模型与共享配额追踪 GPT 使用情况，支持导出 / 导入与本地保留 |
| 模型 / 推理切换 | `⌘O / ⌘J`、Meta 能力控制、Thinking / Pro / Instant 相关交互优化 |
| Google 搜索联动 | 在 Google 搜索结果页一键跳到 ChatGPT，并以 `web search:` 形式直接发问 |

## 支持站点

### GPT 主战场

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| ChatGPT | QuickNav、消息树 / 对话导出 / 分叉编辑、Tab queue、用量统计、`⌘O / ⌘J`、下载修复 | 最高优先级维护 |
| Google 搜索 | 搜索页一键问 GPT，直接跳到 ChatGPT Thinking 工作流 | 最高优先级维护 |

### 其他站点补充覆盖

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| Genspark | QuickNav、绘图默认设置、积分余量、长代码块折叠 | 持续维护 |
| Grok | QuickNav、额度显示、废纸篓一键清空 | 持续维护 |
| Gemini App | QuickNav、`⌘/Ctrl+Enter` | 持续维护 |
| Kimi | QuickNav、`⌘/Ctrl+Enter` | 持续维护 |
| Qwen | QuickNav、模型/推理切换 | 持续维护 |
| DeepSeek | QuickNav、`⌘/Ctrl+Enter` | 持续维护 |
| 文心一言 | QuickNav、`⌘/Ctrl+Enter` | 持续维护 |
| GLM（z.ai） | QuickNav、`⌘/Ctrl+Enter` | 持续维护 |

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

## 文档与清单

- [架构与核心链路](./docs/deep-dive.md)
- [脚本清单与注入定义](./docs/scripts-inventory.md)
- [致谢与外部来源](./CREDITS.md)

## 开发者工作流

仅在你需要改代码时使用：

```bash
npm ci
npm run build
npm run package:dist
```

常用验证链：

- `npm run build`
- `npm test`
- `npm run verify`

公开仓库保留的维护脚本位于 `scripts/`：

- `scripts/verify.js`：仓库内建验证链入口
- `scripts/sync-manifest.js`：同步 `manifest.source.json` 的权限与 bootstrap `matches`
- `scripts/gen-scripts-inventory.js`：重生成 `docs/scripts-inventory.md`
- `scripts/stats.js`：打印站点、模块与注入定义统计
- `scripts/package-dist.mjs`：从 `dist/` 打包发布用 `dist.zip`

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `background/` | Service Worker 与路由处理 |
| `content/` | 各站点模块与内核桥接 |
| `options/` | 配置页 |
| `popup/` | 扩展弹窗 |
| `shared/` | 模块注册表与注入定义真相源 |
| `dist/` | 面向非开发者的可加载运行目录 |
| `scripts/` | 公开维护脚本 |

## 反馈

欢迎提交 Issue / PR。  
Bug 报告请尽量附带：站点、触发步骤、预期结果、实际结果、浏览器版本。

<details>
<summary><strong>完整站点脚本树（点击展开）</strong></summary>

```text
AI捷径
|
|____ 通用
|    |____ 隐藏免责声明/提示条
|
|____ ChatGPT
|    |____ QuickNav
|    |____ ChatGPT 消息树
|    |____ ChatGPT 对话导出
|    |____ ChatGPT 消息分叉编辑（可加图）
|    |____ ChatGPT Tab 队列发送
|    |____ Canvas Enhancements
|    |____ ChatGPT 用量统计（仅在配置页面显示）
|    |____ ChatGPT 推理强度/模型 快捷切换（⌘O/⌘J）
|    |____ 快捷深度搜索（译/搜/思）
|    |____ OpenAI 新模型横幅提示（默认添加了 GPT-5.3）
|    |____ ChatGPT 性能优化（默认全启动）
|    |____ ChatGPT 下载修复（by @pengzhile）
|    |____ ChatGPT TeX Copy & Quote（公式复制+修复引用）
|    |____ ⌘Enter 发送（Enter 换行）
|    |____ ChatGPT 朗读速度控制器（默认 1.8x）
|    |____ ChatGPT 回复计时器（右下角极小的一个计时器）
|    |____ ChatGPT 回复粗体高亮（Lite）
|    |____ ChatGPT 隐藏点赞/点踩（by @zhong_little）
|    |____ ChatGPT 顶部按钮布局修复
|
|____ Google 搜索
|    |____ Google 搜索问 GPT
|
|____ Genspark
|    |____ QuickNav
|    |____ ⌘Enter 发送（Enter 换行）
|    |____ Genspark 绘图默认设置
|    |____ Genspark 积分余量（by @kill）
|    |____ Genspark 长代码块折叠
|    |____ Genspark 消息编辑上传修复
|    |____ Genspark Claude Thinking 强制切换（只对 sonnet 4.5 有效）
|
|____ Grok
|    |____ QuickNav
|    |____ ⌘Enter 发送（Enter 换行）
|    |____ Grok 剩余额度显示（对 Grok 4.20 和 heavy 无效）
|    |____ Grok 废纸篓一键清空
|
|____ Gemini App
|    |____ QuickNav
|    |____ ⌘Enter 发送（Enter 换行）
|
|____ Kimi
|    |____ QuickNav
|    |____ ⌘Enter 发送（Enter 换行）
|
|____ Qwen
|    |____ QuickNav
|    |____ ⌘Enter 发送（Enter 换行）
|    |____ Qwen 模型/推理 快捷切换
|
|____ DeepSeek
|    |____ QuickNav
|    |____ ⌘Enter 发送（Enter 换行）
|
|____ 文心一言
|    |____ QuickNav
|    |____ ⌘Enter 发送（Enter 换行）
|
|____ GLM（z.ai）
|    |____ QuickNav
|    |____ ⌘Enter 发送（Enter 换行）
```

</details>
