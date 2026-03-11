<p align="center">
  <img src="./icons/logo.svg" alt="AI捷径 Logo" width="220" />
</p>

<h1 align="center">AI捷径 (AI Shortcuts)</h1>

<p align="center">
  一个面向多 AI 站点的 Chrome Manifest V3 扩展：把常用增强脚本收进同一套可维护的模块系统。
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/lueluelue2006/ai-chat-extension-collection?display_name=tag&label=release" alt="Release">
  <img src="https://img.shields.io/badge/sites-10-4cc9f0" alt="Sites">
  <img src="https://img.shields.io/badge/modules-29-72efdd" alt="Modules">
  <img src="https://img.shields.io/badge/content%20defs-59-90be6d" alt="Content defs">
  <img src="https://img.shields.io/badge/license-GPL--3.0--or--later-8ac926" alt="License">
</p>

<p align="center">
  <a href="https://github.com/lueluelue2006/ai-chat-extension-collection/releases">下载 dist.zip</a>
  ·
  <a href="#快速安装非开发者">快速安装</a>
  ·
  <a href="#支持站点">支持站点</a>
  ·
  <a href="./docs/scripts-inventory.md">脚本清单</a>
  ·
  <a href="./docs/deep-dive.md">架构文档</a>
</p>

> 非开发者用户请直接去 **GitHub Releases** 下载 `dist.zip`，**先解压** 再安装。不要下载源码 ZIP，也不要加载源码仓库目录。

## 项目概览

| 方向 | 内容 |
| --- | --- |
| 多站点统一增强 | 一个扩展主体，统一承载 ChatGPT、Google 搜索、Genspark、Grok、Gemini、Kimi、Qwen、DeepSeek、文心一言、GLM 等站点脚本 |
| 高频效率流 | QuickNav、`⌘/Ctrl+Enter`、模型/推理切换、问 GPT 跳转、导出、计时、用量统计 |
| 配置与维护 | 弹窗快速开关、配置页集中管理、模块注册表与注入定义统一维护 |
| 公开分发方式 | 面向非开发者只发布 `dist.zip`，公开仓库保留源码与维护脚本 |

## 核心能力

- **ChatGPT 工具集**：QuickNav、模型/推理切换、问 GPT 跳转、用量统计、对话导出、消息树、分叉编辑、下载修复。
- **跨站点输入增强**：多站点统一支持 `⌘/Ctrl+Enter`、队列化交互和阅读效率增强。
- **Google 搜索联动**：在搜索结果页一键跳到 ChatGPT 5.4 Thinking，直接发起 `web search:` 提问。
- **可维护架构**：`shared/` 作为模块注册与注入定义真相源，`docs/scripts-inventory.md` 自动生成。

## 支持站点

| 站点 | 代表能力 | 状态 |
| --- | --- | --- |
| ChatGPT | QuickNav、`⌘O / ⌘J`、用量统计、导出、消息树 | 持续维护 |
| Google 搜索 | 搜索页一键问 GPT | 持续维护 |
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
- [ChatGPT 站点研究](./docs/chatgpt-site-research.md)

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
|    |____ OpenAI 新模型横幅提示（默认添加了 GPT-5.3）
|    |____ ChatGPT 性能优化（默认全启动）
|    |____ ChatGPT 推理强度/模型 快捷切换（⌘O/⌘J）
|    |____ ⌘Enter 发送（Enter 换行）
|    |____ ChatGPT 朗读速度控制器（默认 1.8x）
|    |____ ChatGPT 用量统计（仅在配置页面显示）
|    |____ ChatGPT 回复计时器（右下角极小的一个计时器）
|    |____ ChatGPT 下载修复（by @pengzhile）
|    |____ ChatGPT 回复粗体高亮（Lite）
|    |____ 快捷深度搜索（译/搜/思）
|    |____ ChatGPT 隐藏点赞/点踩（by @zhong_little）
|    |____ ChatGPT TeX Copy & Quote（公式复制+修复引用）
|    |____ ChatGPT 对话导出
|    |____ ChatGPT 消息分叉编辑（可加图）
|    |____ ChatGPT 消息树
|    |____ ChatGPT 侧边栏顶部按钮修复
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
