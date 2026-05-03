---
doc_type: feature-ff-note
feature: quicknav-low-visibility
date: 2026-05-03
requirement:
tags: [chatgpt, quicknav, privacy, telemetry]
---

## 做了什么

降低 ChatGPT QuickNav 面板被站点前端事件链路观察到的概率，同时保持 QuickNav 本体无后台网络请求。

## 改了哪些

- `content/chatgpt-quicknav.js` — 增加面板事件隔离，面板内部点击、滚轮、键盘等事件在根部停止冒泡。
- `content/chatgpt-quicknav.js` — 不再给 ChatGPT 原生 turn 写入 `data-cgpt-turn`，改用原生 turn selector 与 core 快照定位。
- `scripts/verify.js` — 增加低可见性和禁止写 `data-cgpt-turn` 的回归检查。

## 怎么验证的

运行 `npm run verify` 与 `npm run package:dist` 均通过，生成 `release/ai-shortcuts-dist-v4.0.32.zip`。
在当前 Chrome profile 重新加载扩展后，新开 ChatGPT 对话发送测试 prompt，QuickNav 正常识别用户/助手两条 turn；面板事件 bubble 计数为 0，页面 `data-cgpt-turn` 计数为 0。
