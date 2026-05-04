---
doc_type: feature-ff-note
feature: genspark-image-defaults
date: 2026-05-04
requirement:
tags: [genspark, image-generation, defaults]
---

## 做了什么

Genspark AI Image 新入口进入后自动切到用户常用绘图配置：GPT Image 2、4K、Medium，并关闭 Auto Prompt。

## 改了哪些

- content/genspark-moa-image-autosettings/main.js:1 — 支持新版 `image_generation_agent` 入口；优先使用 Genspark 页面主世界里的 Pinia store 设置模型、尺寸、质量和 Auto Prompt 状态，DOM 点击只作为兜底。
- shared/injections.ts:277 — 将该模块改为 MAIN world 注入，让脚本能访问 Genspark 的页面运行时状态。
- shared/registry.ts:365、options/options.js:4456、shared/i18n.js:233、README.md:15 — 同步用户可见描述，从旧的“绘图默认 2K”更新为“GPT Image 2 / 4K / Medium / 关闭 Auto Prompt”。

## 怎么验证的

已运行 `node --check content/genspark-moa-image-autosettings/main.js` 和 `gtimeout 60s npm run verify`，均通过。

真实 Chrome 验证：先把 Genspark 页面状态重置为 `Nano Banana 2 / Auto / Auto / Auto Prompt active`，重新加载扩展并刷新 `https://www.genspark.ai/agents?type=image_generation_agent&action=chat_now` 后，页面自动变为 `GPT Image 2`；Pinia store 显示 `modelsSelected=gpt-image-2`、`selectedImageSize=4k`、`selectedImageQuality=medium`、`reflectionEnabled=false`，按钮 class 不再包含 `active`。
