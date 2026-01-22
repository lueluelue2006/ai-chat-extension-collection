# QuickNav-MV3 Scripts Inventory

说明：
- `作者/许可证/版本/脚本名/描述` 优先读取文件头部的 `==UserScript==` 元数据；若没有则尝试读取文件顶部注释（例如 `License:`/`Upstream:`）；仍没有就标注“未标注”。
- `站点/模块` 由 `background/sw.js` 的 `CONTENT_SCRIPT_DEFS` 推导（以及 `content/bootstrap.js` 为 manifest 固定注入）。

## 按文件（全量 .js）

| 文件 | 站点 | 模块 | 脚本名 | 作用/说明 | 作者 | 许可证 | 版本 | 上游/备注 |
|---|---|---|---|---|---|---|---|---|
| background/sw.js | （未注入/仅扩展内部） | （无） | MV3 Service Worker | 读取/保存设置；注册/注销动态 content scripts；必要时 reinject；并负责注入 MAIN-world scroll guard。 | （未标注） | （未标注） | （未标注） |  |
| content/bootstrap.js | ChatGPT, All Sites, DeepSeek, ERNIE, Gemini App, Gemini Busi… | bootstrap | Bootstrap | document_start 唤醒 service worker，让其完成动态脚本注册/重注入。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-cmdenter-send/main.js | ChatGPT, DeepSeek, ERNIE, Gemini App, Gemini Business, Gensp… | chatgpt_cmdenter_send | ⌘Enter Send (Enter Newline) | ⌘Enter/Ctrl+Enter 发送；Enter/Shift+Enter 固定为换行（多站点复用）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-download-file-fix/main.js | ChatGPT | chatgpt_download_file_fix | ChatGPT Download Fix | ChatGPT 下载修复：修复文件下载失败（sandbox_path 解码/编码问题）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-export-conversation/main.js | ChatGPT | chatgpt_export_conversation | ChatGPT对话导出（2025年7月新版UI） | 一键导出 ChatGPT 聊天记录为 HTML 或 Markdown（适配新版 UI） | Marx (updated by schweigen) | MIT | 0.4.0 |  |
| content/chatgpt-fetch-hub/main.js | ChatGPT | chatgpt_download_file_fix, chatgpt_image_message_edit, chatg… | ChatGPT Fetch Hub | 集中 patch fetch/SSE，给多个模块复用，避免多个脚本叠加 patch。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-hide-feedback-buttons/main.js | ChatGPT | chatgpt_hide_feedback_buttons | ChatGPT Hide Feedback | 隐藏回复下方反馈按钮（👍/👎）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-image-message-edit/main.js | ChatGPT | chatgpt_image_message_edit | ChatGPT Image Message Edit | 给用户消息增加 “QuickNav edit” 分叉编辑按钮（可加图/文件）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-message-tree/main.js | ChatGPT | chatgpt_message_tree | ChatGPT Message Tree | 显示当前对话的完整消息树/分支结构（右侧面板，只读）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-perf/content.js | ChatGPT | chatgpt_perf | ChatGPT Perf | ChatGPT 性能优化：离屏虚拟化 + CSS contain/动画优化（可在设置页细调）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-quick-deep-search/main.js | ChatGPT | chatgpt_quick_deep_search | Quick Deep Search | 快捷深度搜索（译/搜/思）：一键插入前缀并发送（ChatGPT/Gemini/Genspark 部分页面）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-quicknav.js | ChatGPT | quicknav | ChatGPT 对话导航 | 紧凑导航 + 实时定位；修复边界误判；底部纯箭头按钮；回到顶部/到底部单击即用；禁用面板内双击选中；快捷键 Cmd+↑/↓（Mac）或 Alt+↑/↓（Wind… | schweigen, loongphy(在3.0版本帮忙加入暗色模式，在4.1版… | MIT | 4.6.6 | https://raw.githubusercontent.com/lueluelue2006/ChatGPT-Quic… |
| content/chatgpt-readaloud-speed-controller/main.js | ChatGPT | chatgpt_readaloud_speed_controller | Read Aloud Speed Controller | 控制 ChatGPT 朗读音频播放速度（默认 1.8x，可在设置页改）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-reply-timer/main.js | ChatGPT | chatgpt_reply_timer | Reply Timer | 统计从发送到回复完成的耗时（右下角极简数字）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-strong-highlight-lite/main.js | ChatGPT | chatgpt_strong_highlight_lite | Strong Highlight Lite | 高亮粗体并隐藏免责声明（Lite）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-tex-copy-quote/main.js | ChatGPT | chatgpt_tex_copy_quote | ChatGPT TeX Copy & Quote | 复制/引用含 KaTeX 的选区时优先还原 LaTeX；集成悬停提示/双击复制。 | （未标注；见 Upstream 注释） | GPL-3.0-or-later | （未标注） | https://github.com/lueluelue2006/ChatGPT-Better-TeX-Quote |
| content/chatgpt-thinking-toggle/main.js | ChatGPT | chatgpt_thinking_toggle | Thinking Toggle | 推理强度快捷切换（⌘O）/ 模型切换（⌘J）（依赖 fetch hub）。 | （未标注） | （未标注） | （未标注） |  |
| content/chatgpt-usage-monitor/main.js | ChatGPT | chatgpt_usage_monitor | ChatGPT用量统计 | 优雅的 ChatGPT 模型调用量实时统计，界面简洁清爽（中文版），支持导入导出、一周分析报告、快捷键切换最小化（Ctrl/Cmd+I） | tizee (original), schweigen (modified) | MIT | 4.0.0 | https://raw.githubusercontent.com/lueluelue2006/ChatGPT-Usag… |
| content/common-hide-disclaimer/main.js | All Sites | hide_disclaimer | Hide Disclaimer | 隐藏免责声明/提示条：自动隐藏“AI 可能会犯错/数据使用”等提示条。 | （未标注） | （未标注） | （未标注） |  |
| content/deepseek-quicknav.js | DeepSeek | quicknav | ChatGPT 对话导航 | 紧凑导航 + 实时定位；修复边界误判；底部纯箭头按钮；回到顶部/到底部单击即用；禁用面板内双击选中；快捷键 Cmd+↑/↓（Mac）或 Alt+↑/↓（Wind… | schweigen, loongphy(在3.0版本帮忙加入暗色模式，在4.1版… | MIT | 4.6.6 | https://raw.githubusercontent.com/lueluelue2006/ChatGPT-Quic… |
| content/ernie-quicknav.js | ERNIE | quicknav | 文心一言（ERNIE）对话导航（QuickNav） | 紧凑导航 + 实时定位；修复边界误判；底部纯箭头按钮；回到顶部/到底部单击即用；禁用面板内双击选中；快捷键 Cmd+↑/↓（Mac）或 Alt+↑/↓（Wind… | schweigen, loongphy(在3.0版本帮忙加入暗色模式，在4.1版… | MIT | 4.6.6 | https://raw.githubusercontent.com/lueluelue2006/ChatGPT-Quic… |
| content/gemini-app-quicknav.js | Gemini App | quicknav | Gemini（gemini.google.com/app）对话导航（QuickN… | Gemini（gemini.google.com/app）版 QuickNav：紧凑导航 + 实时定位 + 📌标记点 + 收藏夹 + 防自动滚动 + 快捷键 C… | schweigen | MIT | 1.0.1 |  |
| content/gemini-enterprise-auto-gemini-3-pro/main.js | Gemini Business | gemini_auto_3_pro | Gemini Enterprise - Auto Gemini 3 Pro | Automatically switch Gemini Enterprise model selector to Gemini 3 Pro when avail… | schweigen | MIT | 0.1.0 |  |
| content/gemini-enterprise-math-fix/main.js | Gemini Business | gemini_math_fix | Gemini Enterprise Inline Math Fix | Render inline and block math that appears as raw delimiters in Gemini Enterprise… | schweigen | MIT | 1.2.2 |  |
| content/gemini-quicknav.js | Gemini Business | quicknav | Gemini Enterprise 对话导航（QuickNav） | Gemini Enterprise 版 QuickNav：紧凑导航 + 实时定位 + 📌标记点 + 收藏夹 + 防自动滚动 + 快捷键 Cmd/Alt+↑↓ 等… | schweigen | MIT | 1.0.1 | https://raw.githubusercontent.com/lueluelue2006/Gemini_Enter… |
| content/genspark-codeblock-fold/main.js | Genspark | genspark_codeblock_fold | Genspark Codeblock Fold | Genspark 长代码块折叠：自动折叠长代码块并提供 展开/收起 按钮（仅 AI Chat 页）。 | （未标注） | （未标注） | （未标注） |  |
| content/genspark-credit-balance/main.js | Genspark | genspark_credit_balance | Genspark Credit Balance | Genspark 积分余量：悬停小蓝点显示积分信息（可刷新/折叠/拖动）。 | LinuxDo 悟空（原作者；见 options 文案） | （未标注） | （未标注） |  |
| content/genspark-inline-upload-fix/main.js | Genspark | genspark_inline_upload_fix | Genspark Inline Upload Fix | Fix attachment upload in Genspark inline message edit (pencil): Cmd+V paste imag… | schweigen | MIT | 0.2.1 |  |
| content/genspark-moa-image-autosettings/main.js | Genspark | genspark_moa_image_autosettings | Genspark MOA Image Auto Settings | Genspark 绘图默认设置：进入绘图页自动打开 Setting 并选择 2K 画质。 | （未标注） | （未标注） | （未标注） |  |
| content/genspark-quicknav.js | Genspark | quicknav | Genspark Conversation Navigation | 紧凑导航 + 实时定位；修复边界误判；底部纯箭头按钮；回到顶部/到底部单击即用；禁用面板内双击选中；快捷键 Cmd+↑/↓（Mac）或 Alt+↑/↓（Wind… | schweigen, loongphy(在3.0版本帮忙加入暗色模式，在4.1版… | MIT | 4.6.6 |  |
| content/gm-menu-polyfill.js | ChatGPT, DeepSeek, ERNIE, Gemini App, Gemini Business, Gensp… | chatgpt_export_conversation, quicknav | GM Menu Polyfill | GM_registerMenuCommand 兼容层：收集油猴菜单命令，供扩展 popup 显示/执行；并顺带请求安装 scroll guard。 | （未标注） | （未标注） | （未标注） |  |
| content/grok-fast-unlock/main.js | Grok | grok_fast_unlock | Grok 4 Fast Unlock | 使 Grok 免费账号使用 Grok 4 Fast | MUTED64 | （未标注） | 3.3 |  |
| content/grok-quicknav.js | Grok | quicknav | Grok 对话导航（QuickNav） | Grok 版 QuickNav：紧凑导航 + 实时定位 + 📌标记点 + 收藏夹 + 防自动滚动 + 快捷键 Cmd/Alt+↑↓ 等。 | schweigen, loongphy(在3.0版本帮忙加入暗色模式，在4.1版… | MIT | 4.6.6 |  |
| content/grok-rate-limit-display/main.js | Grok | grok_rate_limit_display | Grok Rate Limit Display | Displays remaining queries on grok.com | Blankspeaker, Originally ported from Cur… | MIT | 5.2.27 | https://update.greasyfork.org/scripts/533963/Grok%20Rate%20L… |
| content/qwen-quicknav.js | Qwen | quicknav | ChatGPT 对话导航 | 紧凑导航 + 实时定位；修复边界误判；底部纯箭头按钮；回到顶部/到底部单击即用；禁用面板内双击选中；快捷键 Cmd+↑/↓（Mac）或 Alt+↑/↓（Wind… | schweigen, loongphy(在3.0版本帮忙加入暗色模式，在4.1版… | MIT | 4.6.6 | https://raw.githubusercontent.com/lueluelue2006/ChatGPT-Quic… |
| content/scroll-guard-main.js | （未注入/仅扩展内部） | （无） | Main-World Scroll Guard | MAIN world 防自动滚动护栏：拦截 scrollTo/scrollBy/scrollIntoView 等并按 🔐 状态阻止页面脚本自动滚动。 | （未标注） | （未标注） | （未标注） |  |
| content/zai-quicknav.js | Z.ai | quicknav | ChatGPT 对话导航 | 紧凑导航 + 实时定位；修复边界误判；底部纯箭头按钮；回到顶部/到底部单击即用；禁用面板内双击选中；快捷键 Cmd+↑/↓（Mac）或 Alt+↑/↓（Wind… | schweigen, loongphy(在3.0版本帮忙加入暗色模式，在4.1版… | MIT | 4.6.6 | https://raw.githubusercontent.com/lueluelue2006/ChatGPT-Quic… |
| options/options.js | （未注入/仅扩展内部） | （无） | Options Page | 扩展设置页脚本：站点/模块开关、默认 🔐、部分模块的额外配置。 | （未标注） | （未标注） | （未标注） |  |
| popup/popup.js | （未注入/仅扩展内部） | （无） | Popup | 扩展弹窗脚本：显示版本/作者；对当前站点模块开关；展示并执行 GM 菜单命令。 | （未标注） | （未标注） | （未标注） |  |

## 按站点（注入清单，来自 background/sw.js）

### ChatGPT (`chatgpt`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| chatgpt_cmdenter_send | content/chatgpt-cmdenter-send/main.js | document_start | ISOLATED | false |
| chatgpt_download_file_fix | content/chatgpt-fetch-hub/main.js, content/chatgpt-download-file-fix/main.js | document_start | MAIN | false |
| chatgpt_export_conversation | content/gm-menu-polyfill.js, content/chatgpt-export-conversation/main.js | document_end | ISOLATED | false |
| chatgpt_hide_feedback_buttons | content/chatgpt-hide-feedback-buttons/main.js | document_start | ISOLATED | false |
| chatgpt_image_message_edit | content/chatgpt-fetch-hub/main.js, content/chatgpt-image-message-edit/main.js | document_start | MAIN | false |
| chatgpt_message_tree | content/chatgpt-fetch-hub/main.js, content/chatgpt-message-tree/main.js | document_start | MAIN | false |
| chatgpt_perf | content/chatgpt-perf/content.js, content/chatgpt-perf/content.css | document_idle | ISOLATED | false |
| chatgpt_quick_deep_search | content/chatgpt-fetch-hub/main.js, content/chatgpt-quick-deep-search/main.js | document_start | MAIN | false |
| chatgpt_readaloud_speed_controller | content/chatgpt-readaloud-speed-controller/main.js | document_start | ISOLATED | false |
| chatgpt_reply_timer | content/chatgpt-fetch-hub/main.js, content/chatgpt-reply-timer/main.js | document_start | MAIN | false |
| chatgpt_strong_highlight_lite | content/chatgpt-strong-highlight-lite/main.js | document_start | ISOLATED | false |
| chatgpt_tex_copy_quote | content/chatgpt-tex-copy-quote/main.js | document_start | MAIN | false |
| chatgpt_thinking_toggle | content/chatgpt-fetch-hub/main.js, content/chatgpt-thinking-toggle/main.js | document_idle | MAIN | false |
| chatgpt_usage_monitor | content/chatgpt-fetch-hub/main.js, content/chatgpt-usage-monitor/main.js | document_start | MAIN | false |
| quicknav | content/gm-menu-polyfill.js, content/chatgpt-quicknav.js | document_start | ISOLATED | false |

### All Sites (`common`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| hide_disclaimer | content/common-hide-disclaimer/main.js | document_start | ISOLATED | false |

### DeepSeek (`deepseek`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| chatgpt_cmdenter_send | content/chatgpt-cmdenter-send/main.js | document_start | ISOLATED | false |
| quicknav | content/gm-menu-polyfill.js, content/deepseek-quicknav.js | document_end | ISOLATED | false |

### ERNIE (`ernie`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| chatgpt_cmdenter_send | content/chatgpt-cmdenter-send/main.js | document_start | ISOLATED | false |
| quicknav | content/gm-menu-polyfill.js, content/ernie-quicknav.js | document_end | ISOLATED | false |

### Gemini App (`gemini_app`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| chatgpt_cmdenter_send | content/chatgpt-cmdenter-send/main.js | document_start | ISOLATED | false |
| quicknav | content/gm-menu-polyfill.js, content/gemini-app-quicknav.js | document_end | ISOLATED | false |

### Gemini Business (`gemini_business`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| chatgpt_cmdenter_send | content/chatgpt-cmdenter-send/main.js | document_start | ISOLATED | false |
| gemini_auto_3_pro | content/gemini-enterprise-auto-gemini-3-pro/main.js | document_end | ISOLATED | false |
| gemini_math_fix | content/gemini-enterprise-math-fix/main.js | document_start | MAIN | false |
| quicknav | content/gm-menu-polyfill.js, content/gemini-quicknav.js | document_end | ISOLATED | false |

### Genspark (`genspark`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| chatgpt_cmdenter_send | content/chatgpt-cmdenter-send/main.js | document_start | ISOLATED | false |
| genspark_codeblock_fold | content/genspark-codeblock-fold/main.js | document_end | ISOLATED | false |
| genspark_credit_balance | content/genspark-credit-balance/main.js | document_end | ISOLATED | false |
| genspark_inline_upload_fix | content/genspark-inline-upload-fix/main.js | document_idle | MAIN | false |
| genspark_moa_image_autosettings | content/genspark-moa-image-autosettings/main.js | document_start | ISOLATED | true |
| quicknav | content/gm-menu-polyfill.js, content/genspark-quicknav.js | document_end | ISOLATED | false |

### Grok (`grok`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| chatgpt_cmdenter_send | content/chatgpt-cmdenter-send/main.js | document_start | ISOLATED | false |
| grok_fast_unlock | content/grok-fast-unlock/main.js | document_start | MAIN | false |
| grok_rate_limit_display | content/grok-rate-limit-display/main.js | document_end | MAIN | false |
| quicknav | content/gm-menu-polyfill.js, content/grok-quicknav.js | document_end | ISOLATED | false |

### Qwen (`qwen`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| chatgpt_cmdenter_send | content/chatgpt-cmdenter-send/main.js | document_start | ISOLATED | false |
| quicknav | content/gm-menu-polyfill.js, content/qwen-quicknav.js | document_end | ISOLATED | false |

### Z.ai (`zai`)

| 模块 | 注入文件（js/css） | runAt | world | allFrames |
|---|---|---|---|---|
| chatgpt_cmdenter_send | content/chatgpt-cmdenter-send/main.js | document_start | ISOLATED | false |
| quicknav | content/gm-menu-polyfill.js, content/zai-quicknav.js | document_end | ISOLATED | false |

