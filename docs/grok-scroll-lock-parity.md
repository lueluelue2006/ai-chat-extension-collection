# Grok QuickNav 原生锁对齐（与 ChatGPT/Qwen/Kimi 同口径）

## 1. 范围与目标

本次改动只覆盖 **grok.com 的 QuickNav + scroll-lock 协议**：

- 接入统一注入链路（registry/injections/manifest/bootstrap）
- 对齐 scroll-lock 的 bridge 协议（`channel/v/nonce`）
- 对齐 `QUICKNAV_SCROLL_GUARD_READY` 握手校验路径
- 对齐 route watcher 风格（优先 bridge routeChange，保留慢速轮询兜底）

明确不在范围：

- `content/grok-rate-limit-display/**`
- `content/grok-trash-cleanup/**`

## 2. 对齐前后差异（核心）

| 维度 | 对齐前 | 对齐后 |
| --- | --- | --- |
| Grok 站点注册 | registry/injections 未纳入 Grok QuickNav | `shared/registry.ts` + `shared/injections.ts` 纳入 `grok` QuickNav |
| lock state 消息 | 裸 `postMessage({__quicknav,type,...})` | `postBridgeMessage`（含 `channel=quicknav`,`v=1`,`nonce`） |
| READY 握手 | 仅检查 `__quicknav + type` | `readBridgeMessage(e, SCROLL_GUARD_READY_TYPES)` 严格校验 |
| route watcher | 每脚本自 patch history | 优先共享 bridge `routeChange`，失败后 1.2s 轮询 |
| 全局事件绑定 | 路由后可能重复绑定 | `watchSendEvents` + 键盘导航改为单次绑定，运行时按当前 UI 解析 |
| 非会话页行为 | 可能长期挂 observer | 非 `/c/...` 路径直接跳过 observer 初始化 |
| 调试/运行时命名 | 仍混用 `chatGpt/__cgpt*` | canonical `grokQuicknav*` + legacy alias 兼容 |

## 3. 关键改动文件

- `content/grok-quicknav.js`
  - 新增 bridge 常量与 `getOrCreateBridgeNonce/postBridgeMessage/readBridgeMessage`
  - `STATE/BASELINE/ALLOW` 全量走 bridge envelope
  - `QUICKNAV_SCROLL_GUARD_READY` 握手改为 nonce 校验
  - route watcher 改为 bridge 优先 + poll 兜底
  - 发送链路与键盘导航事件改为 singleton 绑定，避免会话切换后的重复触发
  - 调试对象与运行时哨兵改为 `grokQuicknav*` canonical，并同步写入 legacy `chatGpt/__cgpt*` 兼容键
  - 非会话页（非 `/c/...`）不挂长期 observer
- `shared/registry.ts`
  - 新增 `grok` 站点（`https://grok.com/*`，仅 `quicknav`）
  - 不额外收窄 `quicknavPatterns`：保持脚本常驻，配合站内路由切换时可继续接管
- `shared/injections.ts`
  - 新增 `quicknav_grok` 与 `quicknav_scroll_guard_grok`
- 回归测试
  - 已补齐注入路由与 scroll-lock bridge 的自动化回归覆盖

## 4. 验证与回归

### 4.1 静态回归（仓库内）

- `npm run check`
  - 覆盖 registry/injection 一致性、manifest 对齐、脚本语法与自动化静态回归

### 4.2 浏览器烟测（Grok 页面）

在 `https://grok.com/c/...` 通过 Chrome DevTools MCP 做真实页面验证，重点确认：

1. lock 按钮状态与 dataset 一致
2. `QUICKNAV_SCROLLLOCK_STATE` 能按 `channel/v/nonce` 捕获
3. 锁开启时程序下滚被拦截
4. （best-effort）切会话后锁状态保持

## 5. 维护备注

- Grok QuickNav 现已接入统一动态注入体系；后续如扩展 Grok 其他模块，需单独评估并补充注入定义与回归测试。
- 该文档与 `docs/scripts-inventory.md` 配套维护：前者说明行为契约，后者说明注入清单与版本对齐。
