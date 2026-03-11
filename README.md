# AI捷径 (AI Shortcuts)

> 非开发者用户请直接去 **GitHub Releases** 下载 `dist.zip`，**先解压**，再安装。不要下载源码 ZIP 安装。  
> 作者推荐更新方法：**不要在 Chrome 里“移除扩展”**。保持原来的 `AI-Shortcuts-dist` 路径不变，先清空这个目录里的旧文件，再把新版 `dist.zip` 解压进去，最后去 `chrome://extensions` 对当前实例点一次「重新加载」。  
> Releases: `https://github.com/lueluelue2006/ai-chat-extension-collection/releases`

<p align="center">
  <img src="./icons/logo.svg" alt="AI捷径 Logo" width="280" />
</p>

多 AI 站点脚本合集（Chrome Manifest V3 扩展）。

## 你会得到什么

- 一个扩展主体，按站点启用多模块脚本
- 统一的弹窗开关 / 配置页管理
- 多站点快捷键与体验增强（QuickNav、⌘Enter、配额/计时/导出等）
- Google 搜索侧入口增强：可从搜索结果页一键跳到 ChatGPT 5.4 Thinking 发起联网提问
- 可持续维护的模块注册表与注入清单

## 快速安装（非开发者，无需构建）

> **请先去 GitHub Releases 下载 `dist.zip`，并先解压。不要下载源码 ZIP 安装。**
>
> **只加载解压后的 `AI-Shortcuts-dist` 目录。不要加载源码根目录，也不要直接加载 zip。**
>
> **更新现有安装时，不要再次“加载已解压的扩展程序”去选另一份新目录，也不要在 Chrome 里先“移除扩展”。**
> 作者推荐做法是：保持你已经加载的那份 `AI-Shortcuts-dist` 路径不变，清空旧文件后解压新版，再在 `chrome://extensions` 对当前实例点一次「重新加载」。

仓库根目录故意不提供可加载的 `manifest.json`，就是为了避免误加载。

1) 打开 Releases 页面并下载最新 `dist.zip`  
2) 先解压，得到一个固定文件夹 `AI-Shortcuts-dist`（后续更新继续覆盖这个同一个文件夹）  
3) 打开 `chrome://extensions`  
4) 开启「开发者模式」  
5) 在 `chrome://extensions` 页面点「加载未打包的扩展程序」  
6) 选择解压后的 `AI-Shortcuts-dist` 目录

如果 Releases 里还没有你需要的版本，或下载内容不完整：  
- 等待新的 `dist.zip` 发布；或  
- 自己构建一次（见下方开发工作流）。

`dist/` 仅包含用户可用运行文件，不包含开发测试页面。

## 更新现有安装（非开发者）

> **作者推荐更新法：不要在 Chrome 里“移除扩展”。这样原来的设置和使用记录通常会继续保留。**

1) 去 Releases 下载新的 `dist.zip`  
2) 先解压  
3) 保持原来那个固定文件夹 `AI-Shortcuts-dist` 路径不变  
4) 清空这个目录里的旧文件，再把新版解压后的内容放进去  
5) 打开 `chrome://extensions`  
6) 对当前这个实例点一次「重新加载」

不要再次点「加载已解压的扩展程序」去选另一份新目录，否则 Chrome 会把它当成第二个扩展。

## 开发者工作流（可选）

仅在你需要改代码时使用：

```bash
npm ci
npm run build
npm run package:dist
```

构建后再去 `chrome://extensions` 加载 `dist/`。
如果之前已经装过这个扩展，请直接对原有实例点「重新加载」，不要把新的构建目录再额外加载成第二个扩展。

## 开发工作流

- 修改源码后执行：`npm run build`
- 本地质量检查：`npm test`（等价于 `npm run check && npm run typecheck`）
- 提交前完整校验：`npm run verify`（同步 manifest / 生成清单 / 测试 / 构建）
- 在 `chrome://extensions` 点击该扩展「重新加载」

当前公开仓库保留的维护脚本都在 `scripts/`：

- `scripts/verify.js`：仓库内建验证链入口（语法、manifest/registry/injections 一致性、架构文档规模快照、运行时文件覆盖）
- `scripts/sync-manifest.js`：同步 `manifest.source.json` 的 `host_permissions` 和 bootstrap `matches`
- `scripts/gen-scripts-inventory.js`：重生成 `docs/scripts-inventory.md`
- `scripts/stats.js`：打印站点、模块、注入定义规模统计
- `scripts/package-dist.mjs`：从 `dist/` 打包发布用 `dist.zip`

## 功能与站点

当前支持并持续维护的站点包括：

- ChatGPT
- Google 搜索
- Genspark
- Grok
- Gemini App
- Kimi
- Qwen
- DeepSeek
- 文心一言
- GLM（z.ai）

## 配置页命名与排序（ChatGPT）

- 仅调整显示文案：配置页里去掉重复的 `ChatGPT` 前缀（例如“ChatGPT 回复计时器”→“回复计时器”）。
- 不改内部模块 ID：保持现有 `chatgpt_*` 等键名不变，避免破坏已有配置。
- ChatGPT 模块列表按功能分组重排：导航/输入 → 效率 → 阅读/复制 → 编辑/结构 → 修复/清理 → 其他。

完整模块清单、注入时机、作者与上游信息请看：

- `docs/scripts-inventory.md`（自动生成，推荐作为功能清单真相源）

## 文档导航

- 架构与核心链路：`docs/deep-dive.md`
- 脚本清单与注入定义：`docs/scripts-inventory.md`
- ChatGPT 站点研究：`docs/chatgpt-site-research.md`

## 目录结构（简版）

- `background/`：Service Worker 与路由处理
- `content/`：各站点模块与内核桥接
- `options/`：配置页
- `popup/`：扩展弹窗
- `shared/`：模块注册表与注入定义（source of truth）
- `scripts/build.mjs`：镜像构建到 `dist/`

## 反馈与贡献

欢迎 Issue / PR：

- Bug 报告请附：站点、触发步骤、预期结果、实际结果、浏览器版本

## 站点脚本树（仅名称）

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
|    |____ Genspark Claude Thinking 强制切换（只对sonnet 4.5 有效）
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
