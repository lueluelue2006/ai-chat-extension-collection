# Scripts Inventory (MV3)

- Name: ai chat 扩展合集
- Version: 1.3.26
- Generated: 2026-02-06 08:26
- Source of truth: `shared/registry.js` (metadata) + `shared/injections.js` (injection defs)

## Popup “菜单按钮/选项按钮” 来自哪里？

扩展弹窗里显示的“菜单按钮/选项按钮”，来自页面里调用 `window.__quicknavRegisterMenuCommand(name, fn)` 注册的命令。

当前 registry 标注了菜单预览（menuPreview）的模块：

- `quicknav`: QuickNav（“重置问题栏位置” / “清理过期检查点（30天）” / “清理无效收藏”）
- `chatgpt_export_conversation`: ChatGPT 对话导出（新版 UI）（“导出为 Markdown” / “导出为 HTML”）

## Sites

### 通用 (全部站点)

- `hide_disclaimer`: 隐藏免责声明/提示条 — 自动隐藏“AI 可能会犯错/数据使用”等提示条
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/common-hide-disclaimer/main.js`

### ChatGPT (chatgpt.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/chatgpt-quicknav.js`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
- `chatgpt_perf`: ChatGPT 性能优化 — 离屏虚拟化 + CSS contain
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_idle / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-perf/content.js`, `content/chatgpt-perf/content.css`
- `chatgpt_thinking_toggle`: ChatGPT 推理强度/模型 快捷切换 — ⌘O 推理强度 / ⌘J 模型切换
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-thinking-toggle/config-bridge.js`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-thinking-toggle/main.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-cmdenter-send/main.js`
- `chatgpt_readaloud_speed_controller`: ChatGPT 朗读速度控制器 — 控制 ChatGPT 朗读音频播放速度（0.01–100x）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-readaloud-speed-controller/main.js`
- `chatgpt_usage_monitor`: ChatGPT 用量统计 — 仅记录用量（不在页面注入悬浮窗）；在配置页查看/导入/导出/清空
  - 作者: lueluelue2006（基于 tizee@Github 的实现移植）
  - 许可证: MIT
  - 上游: `https://github.com/tizee-tampermonkey-scripts/tampermonkey-chatgpt-model-usage-monitor`
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-usage-monitor/bridge.js`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-usage-monitor/main.js`
- `chatgpt_reply_timer`: ChatGPT 回复计时器 — 统计从发送到回复完成的耗时（右下角极简数字）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-reply-timer/main.js`
- `chatgpt_download_file_fix`: ChatGPT 下载修复 — 修复文件下载失败（sandbox_path 解码）
  - 作者: Marx@linux.do
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-download-file-fix/main.js`
- `chatgpt_strong_highlight_lite`: ChatGPT 回复粗体高亮（Lite） — 高亮粗体 + 隐藏免责声明
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-strong-highlight-lite/main.js`
- `chatgpt_quick_deep_search`: 快捷深度搜索（译/搜/思） — 仅快捷键：Ctrl+S（搜）/ Ctrl+T（思）/ Ctrl+Y|Ctrl+Z（译）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-quick-deep-search/main.js`
- `chatgpt_hide_feedback_buttons`: ChatGPT 隐藏点赞/点踩 — 隐藏回复下方反馈按钮（👍/👎）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-hide-feedback-buttons/main.js`
- `chatgpt_tex_copy_quote`: ChatGPT TeX Copy & Quote — 复制/引用含 KaTeX 的选区时优先还原 LaTeX，并支持悬停提示/双击复制
  - 作者: lueluelue2006
  - 许可证: GPL-3.0-or-later
  - 上游: `https://github.com/lueluelue2006/ChatGPT-Better-TeX-Quote`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-tex-copy-quote/main.js`
- `chatgpt_export_conversation`: ChatGPT 对话导出（新版 UI） — 一键导出当前对话为 Markdown / HTML（在扩展菜单里执行）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/menu-bridge.js`, `content/chatgpt-export-conversation/main.js`
- `chatgpt_image_message_edit`: ChatGPT 消息分叉编辑（可加图） — 给用户消息增加“分叉编辑”按钮：在输入框里编辑并可补图/文件；与原生编辑共存
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-image-message-edit/main.js`
- `chatgpt_message_tree`: ChatGPT 消息树（只读） — 显示当前对话的完整消息树/分支结构（右侧面板）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/chatgpt-core-main.js`, `content/chatgpt-fetch-hub/main.js`, `content/chatgpt-message-tree/main.js`
- `chatgpt_sidebar_header_fix`: ChatGPT 侧边栏顶部按钮修复 — 左上角永远是展开/收起侧边栏；展开时交换「收起侧边栏」与「Home/新建对话」的位置
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-core.js`, `content/chatgpt-sidebar-header-fix/main.js`

### Kimi (kimi.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/kimi-quicknav.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

### Gemini Business (business.gemini.google)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/gemini-quicknav.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-cmdenter-send/main.js`
- `gemini_math_fix`: Gemini Business 数学修复 — KaTeX / inline math 修复
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/gemini-enterprise-math-fix/main.js`
- `gemini_auto_3_pro`: Gemini Business 自动切换 3 Pro — 自动将模型切换为 Gemini 3 Pro（可用时）；并隐藏 Gemini Business 的 disclaimer
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/gemini-enterprise-auto-gemini-3-pro/main.js`

### Gemini App (gemini.google.com/app)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/gemini-app-quicknav.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

### Genspark (genspark.ai/agents)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/genspark-quicknav.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-cmdenter-send/main.js`
- `genspark_moa_image_autosettings`: Genspark 绘图默认设置 — 进入绘图页自动打开 Setting，并选择 2K 画质
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED (allFrames): `content/quicknav-bridge.js`, `content/genspark-moa-image-autosettings/main.js`
- `genspark_credit_balance`: Genspark 积分余量 — 悬停小蓝点显示积分信息（可刷新/折叠/拖动）
  - 作者: LinuxDo 悟空（原始脚本） / lueluelue2006（MV3 集成）
  - 许可证: 未标注（内部脚本）
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/genspark-credit-balance/main.js`
- `genspark_codeblock_fold`: Genspark 长代码块折叠 — 自动折叠长代码块并提供 展开/收起 按钮（仅 AI Chat 页）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/genspark-codeblock-fold/main.js`
- `genspark_inline_upload_fix`: Genspark 消息编辑上传修复 — 修复消息编辑（铅笔）里的附件上传：Cmd+V 粘贴图片/文件；📎打开文件选择器
  - 作者: lueluelue2006（原始脚本 / MV3 集成）
  - 许可证: 未标注（内部脚本）
  - 注入: document_idle / MAIN: `content/quicknav-bridge-main.js`, `content/genspark-inline-upload-fix/main.js`

### Grok (grok.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/grok-quicknav.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-cmdenter-send/main.js`
- `grok_fast_unlock`: Grok 4 Fast 菜单项 — 在模型菜单增加 “Grok 4 Fast”，并在发送时选用该模型
  - 作者: MUTED64（原始脚本） / lueluelue2006（MV3 集成）
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/grok-fast-unlock/main.js`
- `grok_rate_limit_display`: Grok 剩余次数显示 — 在输入框附近显示 rate limit（剩余次数/等待时间）
  - 作者: Blankspeaker（原始脚本；移植自 CursedAtom 的 chrome 扩展） / lueluelue2006（MV3 集成）
  - 许可证: 未标注（内部脚本）
  - 注入: document_end / MAIN: `content/quicknav-bridge-main.js`, `content/grok-rate-limit-display/main.js`

### DeepSeek (chat.deepseek.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/deepseek-quicknav.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

### GLM (chat.z.ai)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/zai-quicknav.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

### 文心一言 (ernie.baidu.com)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/ernie-quicknav.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

### Qwen (chat.qwen.ai)

- `quicknav`: QuickNav — 对话导航 / 📌 标记 / 收藏 / 防自动滚动
  - 作者: lueluelue2006（原始脚本 / MV3 扩展封装/改造） / loongphy（暗色模式+回弹补丁）
  - 许可证: MIT（上游脚本声明）
  - 上游: `https://github.com/lueluelue2006/ChatGPT-QuickNav`
  - 注入: document_start / MAIN: `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`
  - 注入: document_end / ISOLATED: `content/quicknav-bridge.js`, `content/ui-pos-drag.js`, `content/menu-bridge.js`, `content/qwen-quicknav.js`
- `chatgpt_cmdenter_send`: ⌘Enter 发送（Enter 换行） — Enter/Shift+Enter 换行（强制）
  - 作者: lueluelue2006
  - 许可证: 未标注（内部脚本）
  - 注入: document_start / ISOLATED: `content/quicknav-bridge.js`, `content/chatgpt-cmdenter-send/main.js`

