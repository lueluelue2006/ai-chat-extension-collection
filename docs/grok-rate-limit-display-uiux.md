# Grok 剩余额度组件 UI/UX 说明

更新时间：2026-02-25

## 目标

`grok_rate_limit_display` 在 Grok 对话页（`/c/...`）提供右下角常驻额度面板，仅展示：

- `all` 积分余量（示例：`400/400`）

> 说明：2026-02-25 发现 `4.2` 与 `4.2 heavy` 次数接口不可用，已移除对应显示。

## 交互模型

实现文件：`content/grok-rate-limit-display/main.js`

### 1) 常驻极简面板

- 卡片常驻显示，不提供展开/收起、拖拽、下拉菜单。
- 文案只显示一个数值（`remaining/total`），不再显示 `Q / heavy / 4.2` 标签。
- 默认占位值：`--/--`，失败回退值：`—/—`。

### 2) 固定停靠

- 面板固定停靠在**最右下角**（`right: 0; bottom: 0`）。
- `resize` / `visualViewport resize|scroll` 时自动重新锚定。

### 3) 历史状态与旧 DOM 兼容策略

本地存储 key：`aichat_grok_quota_position_v1`

- 启动后会清理历史位置 key，避免旧版本拖拽坐标污染当前布局。
- 当检测到历史遗留额度面板 DOM 时，不复用旧节点，而是销毁并重建，避免双层 UI。

### 4) 刷新策略

- 请求接口：`POST https://grok.com/rest/rate-limits`
- 请求模型：仅 `grok-4`（all 积分池）
- 触发时机：发送后延迟刷新（`Cmd/Ctrl+Enter`、提交、发送按钮点击）
- 不做常驻轮询

### 5) 路由与性能保护

- 路由守卫：仅在 `^/c(?:/|$)` 对话路径启用
- DOM 监听去抖：`MutationObserver` 回调通过 `requestAnimationFrame` 合并

## 验证建议

### 代码级

- `npm run check`
- `npm run typecheck`
- `npm run build`

### 浏览器级

1. 刷新 Grok 对话页，确认右下角只显示一个计数值（例如 `400/400`）。
2. 页面路由切换（同站对话）后，确认只保留一个卡片实例（不叠层）。
3. 发送一条消息后，确认计数会按延迟策略更新。

## 维护要点

- 若调整显示样式或刷新逻辑，需同步更新：
  - 本文档
- 若调整注入或模块元信息，需检查：
  - `shared/injections.ts`
  - `shared/registry.ts`
  - `options/options.js`
