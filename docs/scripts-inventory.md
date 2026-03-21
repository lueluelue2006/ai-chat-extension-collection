# Scripts Inventory (MV3)

- Name: AI捷径 (AI Shortcuts)
- Version: 3.0.7
- Generated: 2026-03-21 03:53
- Source of truth: `shared/registry.ts` (metadata) + `shared/injections.ts` (injection defs)
- Runtime output: mirror build transpiles them to `dist/shared/registry.js` + `dist/shared/injections.js`

## Popup “菜单按钮/选项按钮” 来自哪里？

扩展弹窗里显示的“菜单按钮/选项按钮”，来自页面里调用 `window.__quicknavRegisterMenuCommand(name, fn)` 注册的命令。

当前 registry 标注了菜单预览（menuPreview）的模块：

- `quicknav`: QuickNav（“重置问题栏位置” / “清理过期检查点（30天）” / “清理无效收藏”）
- `chatgpt_export_conversation`: ChatGPT 对话导出（新版 UI）（“导出为 Markdown” / “导出为 HTML”）
- `chatgpt_message_tree`: ChatGPT 消息树（“导出完整树为 JSON”）

## Sites

### 通用 (全部站点)

- `hide_disclaimer`: 隐藏免责声明/提示条 — 自动隐藏“AI 可能会犯错/数据使用”等提示条
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/common-hide-disclaimer/main.js`

### ChatGPT (chatgpt.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/aishortcuts-kernel/runtime-guards.js`, `content/aishortcuts-kernel/route-watch.js`, `content/aishortcuts-kernel/scrolllock-bridge.js`, `content/aishortcuts-kernel/observer-refresh.js`, `content/chatgpt-quicknav.js`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/scroll-guard-main.js`
- `chatgpt_tab_queue`: ChatGPT Tab 队列发送 — Tab 排队发送 / ⌥↑ 取回最近一条 / Ctrl+C 清空输入框（仅有 Meta 键时）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-tab-queue/config-bridge.js`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-fetch-hub/consumer-base.js`, `content/chatgpt-tab-queue/main.js`
- `openai_new_model_banner`: OpenAI 新模型横幅提示 — 监控到资源可访问时，在网页内显示大横幅（避免系统通知被屏蔽）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/openai-new-model-banner/main.js`
- `chatgpt_perf`: ChatGPT 性能优化 — 离屏虚拟化 + CSS contain
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_idle / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-perf/content.js`, `content/chatgpt-perf/content.css`
- `chatgpt_thinking_toggle`: ChatGPT 推理强度/模型 快捷切换 — ⌘O 推理强度 / ⌘J 模型切换
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-thinking-toggle/config-bridge.js`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-fetch-hub/consumer-base.js`, `content/chatgpt-thinking-toggle/main.js`
- `cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-cmdenter-send/main.js`
- `chatgpt_readaloud_speed_controller`: ChatGPT 朗读速度控制器 — 控制 ChatGPT 朗读音频播放速度（0.01–100x）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-readaloud-speed-controller/main.js`
- `chatgpt_usage_monitor`: ChatGPT 用量统计 — 仅记录用量（不在页面注入悬浮窗）；Deep/Legacy Research 不计入；在配置页查看/导入/导出/清空，并支持旧版月度 HTML 报告
  - 作者: GitHub tizee
  - 许可证: MIT
  - 上游: `https://github.com/tizee-tampermonkey-scripts/tampermonkey-chatgpt-model-usage-monitor`
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-usage-monitor/bridge.js`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-fetch-hub/consumer-base.js`, `content/chatgpt-usage-monitor/main.js`
- `chatgpt_reply_timer`: ChatGPT 回复计时器 — 统计从发送到回复完成的耗时（右下角极简数字）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-fetch-hub/consumer-base.js`, `content/chatgpt-reply-timer/main.js`
- `chatgpt_download_file_fix`: ChatGPT 下载修复 — 修复文件下载失败（sandbox_path 解码）
  - 作者: pengzhile(linux.do)
  - 许可证: 许可证未声明
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-fetch-hub/consumer-base.js`, `content/chatgpt-download-file-fix/main.js`
- `chatgpt_strong_highlight_lite`: ChatGPT 回复粗体高亮（Lite） — 高亮粗体 + 隐藏免责声明
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-strong-highlight-lite/main.js`
- `chatgpt_quick_deep_search`: 快捷深度搜索（译/搜/思） — 仅快捷键：Ctrl+S（搜）/ Ctrl+T（思）/ Ctrl+Y|Ctrl+Z（译）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-quick-deep-search/config-bridge.js`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-fetch-hub/consumer-base.js`, `content/chatgpt-quick-deep-search/main.js`
- `chatgpt_hide_feedback_buttons`: ChatGPT 隐藏点赞/点踩 — 隐藏回复下方反馈按钮（👍/👎）
  - 作者: zhong_little(linux.do)
  - 许可证: 许可证未声明
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-hide-feedback-buttons/main.js`
- `chatgpt_tex_copy_quote`: ChatGPT TeX Copy & Quote — 复制/引用含 KaTeX 的选区时优先还原 LaTeX，并支持悬停提示/双击复制
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 上游: `https://github.com/lueluelue2006/ChatGPT-Better-TeX-Quote`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-tex-copy-quote/main.js`
- `chatgpt_export_conversation`: ChatGPT 对话导出（新版 UI） — 按页面当前可见分支导出（会话 mapping，含图片链接）；不可判定时回退 current_node，再兜底当前可见导出
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-conversation-graph.js`, `content/chatgpt-mapping-client/main.js`, `content/menu-bridge.js`, `content/chatgpt-export-conversation/main.js`
- `chatgpt_image_message_edit`: ChatGPT 消息分叉编辑（可加图） — 给用户消息增加“分叉编辑”按钮：在输入框里编辑并可补图/文件；与原生编辑共存
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-fetch-hub/consumer-base.js`, `content/chatgpt-image-message-edit/main.js`
- `chatgpt_canvas_enhancements`: Canvas Enhancements — 在 Writing/Canvas 卡片左上角显示 Canvas ID（512xx）/ textdoc Canvas 短编号（5位），不覆盖原生行为
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-mapping-client/main.js`, `content/chatgpt-canvas-enhancements/main.js`
- `chatgpt_message_tree`: ChatGPT 消息树 — 显示当前对话的完整消息树/分支结构（右侧面板），并支持导出完整树 JSON
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-conversation-graph.js`, `content/chatgpt-mapping-client/main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-message-tree/main.js`
- `chatgpt_sidebar_header_fix`: ChatGPT 顶部按钮布局修复 — 修复侧边栏顶部按钮交换；并将右上角群聊/临时聊天按钮移到模型选择器右侧
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-sidebar-header-fix/main.js`

### Google 搜索 (google.com 搜索页)

- `google_ask_gpt`: Google 搜索问 GPT — 在 Google 搜索框旁加“问 GPT”：跳到 ChatGPT 5.4 Thinking 并自动发起联网搜索提问
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-fetch-hub/consumer-base.js`, `content/chatgpt-google-ask/main.js`
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/google-ask-gpt/main.js`

### Genspark (genspark.ai/agents)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/aishortcuts-kernel/runtime-guards.js`, `content/aishortcuts-kernel/route-watch.js`, `content/aishortcuts-kernel/scrolllock-bridge.js`, `content/aishortcuts-kernel/observer-refresh.js`, `content/genspark-quicknav.js`
- `cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-cmdenter-send/main.js`
- `genspark_moa_image_autosettings`: Genspark 绘图默认设置 — 进入绘图页自动打开 Setting，并选择 2K 画质
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED (allFrames): `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/genspark-moa-image-autosettings/main.js`
- `genspark_credit_balance`: Genspark 积分余量 — 悬停小蓝点显示积分信息（可刷新/折叠/拖动）
  - 作者: 悟空(linux.do)
  - 许可证: 许可证未声明
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/genspark-credit-balance/main.js`
- `genspark_codeblock_fold`: Genspark 长代码块折叠 — 自动折叠长代码块并提供 展开/收起 按钮（仅 AI Chat 页）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/genspark-codeblock-fold/main.js`
- `genspark_inline_upload_fix`: Genspark 消息编辑上传修复 — 修复消息编辑（铅笔）里的附件上传：Cmd+V 粘贴图片/文件；📎打开文件选择器
  - 作者: lueluelue2006（原始脚本 / MV3 集成）
  - 许可证: GPL-3.0-or-later
  - 注入: document_idle / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/genspark-inline-upload-fix/main.js`
- `genspark_force_sonnet45_thinking`: Genspark Claude Thinking 强制切换 — 仅对 Sonnet 4.5 启用 thinking 强制切换，并显示可折叠思考块
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/genspark-force-sonnet45-thinking/main.js`

### Grok (grok.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/aishortcuts-kernel/runtime-guards.js`, `content/aishortcuts-kernel/route-watch.js`, `content/aishortcuts-kernel/scrolllock-bridge.js`, `content/aishortcuts-kernel/observer-refresh.js`, `content/grok-quicknav.js`
- `cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-cmdenter-send/main.js`
- `grok_rate_limit_display`: Grok 剩余额度显示 — 仅显示 all 积分余量（发送后更新）
  - 作者: Blankspeaker
  - 许可证: 许可证未声明
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/grok-rate-limit-display/main.js`
- `grok_trash_cleanup`: Grok 废纸篓一键清空 — 在 deleted-conversations 页面右上角提供“清空废纸篓”按钮（不可恢复）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/grok-trash-cleanup/main.js`

### Gemini App (gemini.google.com/app)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/aishortcuts-kernel/runtime-guards.js`, `content/aishortcuts-kernel/route-watch.js`, `content/aishortcuts-kernel/scrolllock-bridge.js`, `content/aishortcuts-kernel/observer-refresh.js`, `content/gemini-app-quicknav.js`
- `cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

### Kimi (kimi.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/aishortcuts-kernel/runtime-guards.js`, `content/aishortcuts-kernel/route-watch.js`, `content/aishortcuts-kernel/scrolllock-bridge.js`, `content/aishortcuts-kernel/observer-refresh.js`, `content/kimi-quicknav.js`
- `cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

### Qwen (chat.qwen.ai)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/qwen-quicknav-active-lock.js`, `content/qwen-quicknav-route-gate.js`, `content/aishortcuts-kernel/runtime-guards.js`, `content/aishortcuts-kernel/route-watch.js`, `content/aishortcuts-kernel/scrolllock-bridge.js`, `content/aishortcuts-kernel/observer-refresh.js`, `content/qwen-quicknav.js`
- `cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-cmdenter-send/main.js`
- `qwen_thinking_toggle`: Qwen 模型/推理 快捷切换 — ⌘O Thinking/Fast / ⌘J 模型切换
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/qwen-thinking-toggle/main.js`

### DeepSeek (chat.deepseek.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/aishortcuts-kernel/runtime-guards.js`, `content/aishortcuts-kernel/route-watch.js`, `content/aishortcuts-kernel/scrolllock-bridge.js`, `content/aishortcuts-kernel/observer-refresh.js`, `content/deepseek-quicknav.js`
- `cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

### 文心一言 (ernie.baidu.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/aishortcuts-kernel/runtime-guards.js`, `content/aishortcuts-kernel/route-watch.js`, `content/aishortcuts-kernel/scrolllock-bridge.js`, `content/aishortcuts-kernel/observer-refresh.js`, `content/ernie-quicknav.js`
- `cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

### GLM (chat.z.ai)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `shared/i18n.js`, `content/aishortcuts-scope-main.js`, `content/aishortcuts-bridge-main.js`, `content/aishortcuts-i18n-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/aishortcuts-kernel/runtime-guards.js`, `content/aishortcuts-kernel/route-watch.js`, `content/aishortcuts-kernel/scrolllock-bridge.js`, `content/aishortcuts-kernel/observer-refresh.js`, `content/zai-quicknav.js`
- `cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 注入: document_start / ISOLATED: `shared/i18n.js`, `content/aishortcuts-locale-bridge.js`, `content/aishortcuts-scope.js`, `content/aishortcuts-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

