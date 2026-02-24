# AI捷径 (AI Shortcuts)

多 AI 站点脚本合集（Chrome Manifest V3 扩展）。

> 当前仓库已开源维护。旧版 README 中“ChatGPT 严重内存泄露待排查”的测试阶段提示已移除。

## 你会得到什么

- 一个扩展主体，按站点启用多模块脚本
- 统一的弹窗开关 / 配置页管理
- 多站点快捷键与体验增强（QuickNav、⌘Enter、配额/计时/导出等）
- 可持续维护的模块注册表与注入清单

## 快速开始（本地运行）

### 1) 安装依赖

```bash
npm ci
```

### 2) 构建运行包

```bash
npm run build
```

### 3) 在 Chrome 加载扩展

打开 `chrome://extensions` → 开启「开发者模式」→ 「加载已解压的扩展程序」→ 选择：

```text
dist
```

> 说明：源码根目录用于开发；Chrome 实际加载目录是 `dist/`。

## 开发工作流

- 修改源码后执行：`npm run build`
- 本地质量检查：`npm run check`
- 类型检查：`npm run typecheck`
- 在 `chrome://extensions` 点击该扩展「重新加载」

## 功能与站点

当前支持并持续维护的站点包括：

- ChatGPT
- Grok
- Kimi
- Qwen
- Gemini App
- Genspark
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
- PR 请尽量保持单一目标，并附验证步骤
