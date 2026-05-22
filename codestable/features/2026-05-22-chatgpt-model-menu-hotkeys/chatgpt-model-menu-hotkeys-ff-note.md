---
doc_type: feature-ff-note
feature: chatgpt-model-menu-hotkeys
date: 2026-05-22
requirement:
tags: [chatgpt, hotkeys, options, fetch-hub]
---

## 做了什么
适配 ChatGPT 新版 Instant / Medium / High / Pro 模型选择器，让 `Cmd+O` 在 Medium / High 间切换，`Cmd+J` 在 High / Pro 间切换。新增一个默认关闭的设置，可在 High 发送时把请求里的 `thinking_effort` 改写为 `max`。

## 改了哪些
- `content/chatgpt-thinking-toggle/main.js` — 增加新版菜单识别、热键目标选择，以及 High→max 请求改写。
- `content/chatgpt-thinking-toggle/config-bridge.js` / `shared/injections.ts` / `options/options.js` — 增加默认关闭的 High→max 设置并桥接到页面。
- `shared/registry.ts` / `shared/i18n.js` / `README.md` / `scripts/verify.js` — 同步模块说明和静态守卫。

## 怎么验证的
已运行 `npm run check`、`npm run typecheck`、`npm run build`、`git diff --check`，并用 Node 断言默认设置为 `false` 且关键钩子存在。浏览器实测按用户要求留给用户完成。
