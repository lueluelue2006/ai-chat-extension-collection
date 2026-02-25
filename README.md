# AI捷径 (AI Shortcuts)

多 AI 站点脚本合集（Chrome Manifest V3 扩展）。

## 你会得到什么

- 一个扩展主体，按站点启用多模块脚本
- 统一的弹窗开关 / 配置页管理
- 多站点快捷键与体验增强（QuickNav、⌘Enter、配额/计时/导出等）
- 可持续维护的模块注册表与注入清单

## 快速安装（新手必看，无需构建）

> **只加载 `dist/` 目录。不要加载源码根目录。**

仓库根目录故意不提供可加载的 `manifest.json`，就是为了避免误加载。

1) 下载仓库 ZIP 并解压  
2) 打开 `chrome://extensions`  
3) 开启「开发者模式」  
4) 点击「加载已解压的扩展程序」  
5) 选择：`ai-chat-extension-collection-main/dist/`

如果你解压后没看到 `dist/`，说明拿到的是不完整包：  
- 重新下载本仓库最新版 ZIP；或  
- 自己构建一次（见下方开发工作流）。

`dist/` 仅包含用户可用运行文件，不包含开发测试页面。

## 开发者工作流（可选）

仅在你需要改代码时使用：

```bash
npm ci
npm run build
```

构建后再去 `chrome://extensions` 加载 `dist/`。

## 开发工作流

- 修改源码后执行：`npm run build`
- 本地质量检查：`npm run check`
- 类型检查：`npm run typecheck`
- 在 `chrome://extensions` 点击该扩展「重新加载」

## 功能与站点

当前支持并持续维护的站点包括：

- ChatGPT
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
