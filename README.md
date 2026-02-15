# AI捷径 (AI Shortcuts)

# 🚨 测试阶段（重要）

## ChatGPT 网站当前存在严重内存泄露，暂未测出具体根因，求大佬们 PR。

## 文档（建议先看）

- 架构/核心链路（手工维护）：`docs/deep-dive.md`
- 站点/模块/注入清单（自动生成）：`docs/scripts-inventory.md`
- ChatGPT 站点研究/备忘：`docs/chatgpt-site-research.md`

## 按网站分组：脚本与作者

### 通用（common）

- 隐藏免责声明/提示条（`hide_disclaimer`）— 作者：`lueluelue2006`

### ChatGPT（chatgpt）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ChatGPT 性能优化（`chatgpt_perf`）— 作者：`lueluelue2006`
- ChatGPT 推理强度/模型 快捷切换（`chatgpt_thinking_toggle`）— 作者：`lueluelue2006`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`
- ChatGPT 朗读速度控制器（`chatgpt_readaloud_speed_controller`）— 作者：`lueluelue2006`
- ChatGPT 用量统计（`chatgpt_usage_monitor`）— 作者：`lueluelue2006（基于 tizee@Github 的实现移植）`
- ChatGPT 回复计时器（`chatgpt_reply_timer`）— 作者：`lueluelue2006`
- ChatGPT 下载修复（`chatgpt_download_file_fix`）— 作者：`Marx@linux.do`
- ChatGPT 回复粗体高亮（Lite）（`chatgpt_strong_highlight_lite`）— 作者：`lueluelue2006`
- 快捷深度搜索（译/搜/思）（`chatgpt_quick_deep_search`）— 作者：`lueluelue2006`
- ChatGPT 隐藏点赞/点踩（`chatgpt_hide_feedback_buttons`）— 作者：`lueluelue2006`
- ChatGPT TeX Copy & Quote（`chatgpt_tex_copy_quote`）— 作者：`lueluelue2006`
- ChatGPT 对话导出（新版 UI）（`chatgpt_export_conversation`）— 作者：`马老师@Linux.do（原始脚本）`、`lueluelue2006（在原脚本基础上改造）`
- ChatGPT 消息分叉编辑（可加图）（`chatgpt_image_message_edit`）— 作者：`lueluelue2006`
- ChatGPT 消息树（只读）（`chatgpt_message_tree`）— 作者：`lueluelue2006`
- ChatGPT 侧边栏顶部按钮修复（`chatgpt_sidebar_header_fix`）— 作者：`lueluelue2006`

### Kimi（kimi）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`

### Gemini Business（gemini_business）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`
- Gemini Business 数学修复（`gemini_math_fix`）— 作者：`lueluelue2006`
- Gemini Business 自动切换 3 Pro（`gemini_auto_3_pro`）— 作者：`lueluelue2006`

### Gemini App（gemini_app）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`

### Genspark（genspark）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`
- Genspark 绘图默认设置（`genspark_moa_image_autosettings`）— 作者：`lueluelue2006`
- Genspark 积分余量（`genspark_credit_balance`）— 作者：`LinuxDo 悟空（原始脚本）`、`lueluelue2006（MV3 集成）`
- Genspark 长代码块折叠（`genspark_codeblock_fold`）— 作者：`lueluelue2006`
- Genspark 消息编辑上传修复（`genspark_inline_upload_fix`）— 作者：`lueluelue2006（原始脚本 / MV3 集成）`
- Genspark Sonnet 4.5 Thinking（`genspark_force_sonnet45_thinking`）— 作者：`lueluelue2006`

### Grok（grok）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`
- Grok 4 Fast 菜单项（`grok_fast_unlock`）— 作者：`MUTED64（原始脚本）`、`lueluelue2006（MV3 集成）`
- Grok 剩余次数显示（`grok_rate_limit_display`）— 作者：`Blankspeaker（原始脚本；移植自 CursedAtom 的 chrome 扩展）`、`lueluelue2006（MV3 集成）`

### DeepSeek（deepseek）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`

### GLM（zai）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`

### 文心一言（ernie）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`

### Qwen（qwen）

- QuickNav（`quicknav`）— 作者：`lueluelue2006（原始脚本 / MV3 扩展封装/改造）`、`loongphy（暗色模式+回弹补丁）`
- ⌘Enter 发送（Enter 换行）（`chatgpt_cmdenter_send`）— 作者：`lueluelue2006`
