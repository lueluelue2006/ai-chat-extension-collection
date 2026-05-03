---
doc_type: feature-ff-note
feature: warm-light-theme
date: 2026-05-03
requirement:
tags: [options, theme, ui]
---

## 做了什么

把配置页浅色主题从冷蓝灰调回 v2.6.0 到 v3.2.0 时期的暖白/米色气质，同时保留 4.x 的紧凑设置页结构。

## 改了哪些

- options/options.css:1 — 调整浅色主题 token：暖纸色背景、奶白面板、柔和边框、茶青 accent。
- options/options.css:1345 — 修正主按钮在浅色主题下的黑底青字问题，改为茶青底和浅色文字。
- README.md:15 — 版本号更新到 4.0.31，并补充浅色主题 release notes。

## 怎么验证的

已运行 `gtimeout 60s npm run verify` 和 `npm run package:dist`，并通过 CDP 重新加载扩展，在真实配置页检查浅色/深色切换和浅色按钮显示。
