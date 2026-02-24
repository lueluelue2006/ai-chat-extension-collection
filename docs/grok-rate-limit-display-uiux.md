# Grok 剩余额度组件 UI/UX 说明

更新时间：2026-02-24

## 目标

`grok_rate_limit_display` 在 Grok 对话页（`/c/...`）提供右下角常驻额度面板，用于展示：

- 积分余量（主指标）
- Grok 4 Heavy 剩余次数（按能力自动过滤）
- Grok 4.20 剩余次数

## 交互模型

实现文件：`content/grok-rate-limit-display/main.js`

### 1) 常驻面板（无折叠态）

- 卡片常驻显示，不再提供展开/收起切换。
- 微型卡片宽度 `90px`，最小高度 `44px`。
- 标题和行文案均用极简短标签（`Q / all / heavy / 4.2`）。

### 2) 固定停靠与操作菜单

- 面板固定停靠在**最右下角**（`right: 0; bottom: 0`）。
- 不再支持拖拽。
- 通过一个下拉菜单集中操作：
  - 立即刷新
  - 贴右下角（重新锚定）

### 3) 历史状态与旧 DOM 兼容策略

本地存储 key：`aichat_grok_quota_position_v1`

- 当前策略为“右下角常驻优先”，启动和窗口变化时都会强制回到右下角。
- 保留位置 key 仅用于清理历史状态（remove），避免老版本坐标干扰新版常驻布局。
- 当检测到历史遗留额度面板 DOM 时，不复用旧节点，而是销毁并重建当前版本微卡片，避免旧折叠态/旧按钮造成双层或不可收起异常。

### 4) 视口变化行为

- `resize` / `visualViewport resize|scroll` 触发时，直接重新锚定右下角。
- 优先保证常驻稳定，不做自由布局重算。

### 5) 路由与性能保护

- 路由守卫：仅在 `^/c(?:/|$)` 对话路径启用面板逻辑，避免在首页/其它路由做无效监听
- DOM 监听去抖：`MutationObserver` 回调通过 `requestAnimationFrame` 合并，减少高频变更页面的主线程压力

## 验证建议

### 代码级

- `node dev/test-grok-rate-limit-display-ui.js`
- `node dev/test-grok-rate-limit-display-heavy-access.js`
- `node dev/test-grok-injection-routing.js`

### 浏览器级

1. 刷新 Grok 对话页，确认额度卡片默认在最右下角。
2. 页面路由切换（同站对话）后，确认只有一个卡片实例（不叠层）。
3. 点开菜单并执行“贴右下角”，确认位置立即纠正且不闪烁。
4. 与右侧 QuickNav 同时存在时，确认可点击、可读、无遮挡冲突。

## 维护要点

- 若调整常驻布局或菜单项，需同步更新：
  - `dev/test-grok-rate-limit-display-ui.js`
  - 本文档“交互模型”章节
- 若调整注入或模块元信息，需检查：
  - `shared/injections.ts`
  - `shared/registry.ts`
  - `options/options.js`
