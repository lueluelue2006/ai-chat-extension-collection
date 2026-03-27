(() => {
  'use strict';

  const API_KEY = 'AISHORTCUTS_I18N';
  const VERSION = 1;
  const LOCALE_MODE_AUTO = 'auto';
  const LOCALE_MODE_ZH_CN = 'zh_cn';
  const LOCALE_MODE_EN = 'en';
  const RESOLVED_LOCALE_ZH = 'zh-CN';
  const RESOLVED_LOCALE_EN = 'en';
  const TEXT_KEYWORD_REPLACEMENTS = [
    [/Ctrl\+S \/ T \/ Y \/ Z/g, 'Ctrl+S / T / Y / Z'],
    [/⌘/g, '⌘']
  ];

  const EXACT_TEXT_MAP = Object.freeze({
    'AI捷径 设置': 'AI Shortcuts Settings',
    '脚本菜单': 'Script menu',
    '作者': 'Author',
    '版本': 'Version',
    '检查更新': 'Check for updates',
    '检查中…': 'Checking…',
    'Releases 下载': 'Download release',
    '配置': 'Settings',
    'OpenAI 新模型提示': 'OpenAI model alert',
    '打开配置': 'Open settings',
    '知道了': 'Dismiss',
    '当前页面': 'Current page',
    '未检测': 'Not detected',
    '未支持站点': 'Unsupported site',
    '总开关': 'Master switch',
    '启用扩展（所有模块）': 'Enable extension (all modules)',
    '按网站管理脚本': 'Manage scripts by site',
    '按网站管理脚本、查看模块状态，并编辑每个模块的细项设置。': 'Manage scripts by site, inspect module status, and edit detailed settings for each module.',
    '键盘能力': 'Keyboard capability',
    '界面语言': 'Interface language',
    '语言与界面文案': 'Language and interface copy',
    '简体中文': 'Simplified Chinese',
    '自动': 'Auto',
    '我有 Meta 键': 'I have a Meta key',
    '我没有 Meta 键': 'I do not have a Meta key',
    '键盘能力与快捷键策略': 'Keyboard capability and hotkey policy',
    '快捷操作': 'Quick actions',
    '当前页面脚本': 'Scripts on this page',
    '主题切换': 'Theme switcher',
    '亮色': 'Light',
    '暗色': 'Dark',
    '当前：亮色': 'Current: Light',
    '切换为亮色': 'Switch to light',
    '当前：暗色': 'Current: Dark',
    '切换为暗色': 'Switch to dark',
    '网站': 'Sites',
    '页面': 'Pages',
    '脚本': 'Scripts',
    '设置': 'Settings',
    '脚本设置': 'Script settings',
    '页面、脚本与脚本设置': 'Pages, scripts, and script settings',
    '正在配置': 'Editing',
    '未选择脚本': 'No script selected',
    '选择中间脚本后加载对应设置面板。': 'Select a script in the middle column to load its settings.',
    '搜索页面…': 'Search pages…',
    '搜索脚本…': 'Search scripts…',
    '查看模块信息': 'View module info',
    'OpenAI 新模型监控': 'OpenAI model monitor',
    'OpenAI 新模型监控（可配置）': 'OpenAI new model monitor (configurable)',
    '清除角标（不停止提醒）': 'Clear badge only',
    '保存列表': 'Save list',
    '查看状态': 'View status',
    '立即检测': 'Run now',
    '（未检测）': '(not checked)',
    '恢复默认': 'Restore defaults',
    '恢复出厂（清空所有数据）': 'Factory reset (clear all data)',
    '重新注入已打开页面': 'Reinject open pages',
    '仓库链接': 'Repository',
    '已读取监控状态': 'Loaded monitor status',
    '就绪': 'Ready',
    '正在加载设置…': 'Loading settings…',
    '检测中': 'Detecting',
    '检测中…': 'Detecting…',
    '保存后会自动生效到已打开页面；若要彻底移除已注入内容，仍需手动刷新对应页面。': 'Changes take effect on already-open pages automatically. Refresh the page if you need to fully remove injected content.',
    '安装路径必须是 dist/ 目录；如果误加载源码根目录，可能出现“注入失败 / Receiving end does not exist”。': 'The install path must be the dist/ directory. Loading the repository root by mistake can cause injection failures or “Receiving end does not exist”.',
    '安装路径必须是': 'The install path must be',
    '安装路径必须是 ': 'The install path must be ',
    ' 目录；如果误加载源码根目录，可能出现“注入失败 / Receiving end does not exist”。': ' directory. Loading the repository root by mistake can cause injection failures or “Receiving end does not exist”.',
    '目录；如果误加载源码根目录，可能出现“注入失败 / Receiving end does not exist”。': 'directory. Loading the repository root by mistake can cause injection failures or “Receiving end does not exist”.',
    '先选网站，再选脚本并编辑细项设置。页面内所有变更都会直接写回当前配置。': 'Select a site first, then choose a script and edit its detailed settings. All changes on this page are written back immediately.',
    '自动检测当前键盘能力。': 'Automatically detect the current keyboard capability.',
    '自动按浏览器语言选择中文或英文。': 'Automatically choose Chinese or English from the browser language.',
    '当前按浏览器语言自动使用简体中文。': 'Simplified Chinese is currently selected automatically from your browser language.',
    '你已手动指定为简体中文。': 'You manually set the interface language to Simplified Chinese.',
    '所有扩展页面和支持双语的脚本 UI 都会优先显示中文。': 'Extension pages and supported in-page script UIs will prefer Chinese.',
    '自动模式下，仅浏览器为简体中文时使用中文版；其他语言或无法判断时默认英文。': 'In Auto mode, Simplified Chinese is used only when the browser language is Simplified Chinese. English is the default for every other language or when detection is unavailable.',
    '无 Meta 键时，依赖 ⌘ 的快捷键会默认停用；Ctrl+S / T / Y / Z 这类冲突型快捷键也会默认停用。': 'Without a Meta key, ⌘-based hotkeys are disabled by default. Conflicting Ctrl+S / T / Y / Z hotkeys are also disabled by default.',
    '按站点切换。': 'Switch by site.',
    '当前站点脚本清单': 'Current site script list',
    '通用 · 全部站点': 'Common · All supported sites',
    '通用（全部站点）': 'Common (all supported sites)',
    '启用 通用': 'Enable Common',
    '选择网站后查看该站点脚本。': 'Choose a site to view its scripts.',
    '右侧面板显示模块说明、开关和额外操作。': 'The right panel shows module info, toggles, and extra actions.',
    '提示：设置变更会自动生效；关闭某个模块后，已打开页面一般仍需刷新才会完全停用。': 'Tip: setting changes apply automatically. If you disable a module, already-open pages usually still need a refresh to fully stop it.',
    '提示：关闭模块后，已打开页面一般需要刷新才会完全停用。': 'Tip: after disabling a module, already-open pages usually need a refresh to fully stop it.',
    '默认每 1 小时请求一次下方每个 URL（目前仅支持 developers.openai.com/images/api/models/icons/...）；只要检测到可用资源（非 404）就会提醒你（系统通知 + 扩展角标 + ChatGPT 页内横幅）。要停止提醒，请删除全部 URL 并保存（空列表会停用检测/提醒；横幅不会被点击关闭）。': 'Checks each URL below once per hour (currently only developers.openai.com/images/api/models/icons/...). As soon as a resource becomes available (non-404), you are notified through system notifications, badge updates, and an in-page ChatGPT banner. To stop alerts, delete all URLs and save. An empty list disables checks and alerts; the banner itself cannot be dismissed by clicking.',
    '说明：URL 列表请在下方“OpenAI 新模型监控”卡片维护；清空并保存空列表会停止检测/提醒。': 'Keep the URL list in the “OpenAI new model monitor” card below. Save an empty list to stop checks and alerts.',
    '说明：仅在 Google 搜索页显示“问 GPT”按钮；点击后会新开 ChatGPT，并自动用 5.4 Thinking 发起联网搜索提问。': 'Only shows the “Ask GPT” button on Google Search pages. Clicking it opens ChatGPT and automatically sends a 5.4 Thinking web-search prompt.',
    '说明：仅在页面出现 Writing/Canvas 卡片时才会读取对话 mapping，用于在左上角显示 Canvas ID。': 'Only reads the conversation mapping when a Writing/Canvas card is present, so the Canvas ID can be shown in the top-left corner.',
    '说明：在 Genspark AI Chat 中将 Sonnet 4.5 自动改为 thinking 版本，并在回复区内联显示“可展开思考块（默认仅最后 5 行）”。': 'In Genspark AI Chat, automatically switch Sonnet 4.5 to the thinking version and show collapsible thinking blocks inline in replies (last 5 lines by default).',
    '打开配置（清空 URL 列表可停止提醒）': 'Open settings (clear the URL list to stop alerts)',
    '打开配置（定位到该脚本）': 'Open settings (jump to this script)',
    '更新当前已安装实例：请去 Releases 下载最新 dist.zip，覆盖原目录后再到 chrome://extensions 点“重新加载”。': 'To update the current installed instance, download the latest dist.zip from Releases, replace the files in your existing folder, then click “Reload” in chrome://extensions.',
    '如果 Releases 里暂时还没有这个版本，说明 main 分支已经更新，但发布包还没同步。': 'If Releases does not contain this version yet, main has been updated but the release package has not been published yet.',
    '不要再次使用“加载未打包的扩展程序”去装另一份目录副本，否则会出现两个同名扩展。': 'Do not use “Load unpacked” again with another folder copy, or you will end up with two extensions of the same name.',
    '脚本注册表缺失：shared/registry.js 未加载（请刷新扩展或重装）': 'Script registry missing: shared/registry.js was not loaded. Reload or reinstall the extension.',
    '就绪\n非开发者用户请优先去 Releases 下载 dist.zip；检查更新只比对仓库 main 分支版本，可能会早于 Releases 发布，不会自动更新。': 'Ready\nIf you are not a developer, download dist.zip from Releases first. Update checks only compare against the version on main, which can appear before a Release is published. It does not auto-update the extension.',
    '通用': 'Common',
    '全部站点': 'All supported sites',
    'Google 搜索': 'Google Search',
    'google.com 搜索页': 'google.com search results',
    '文心一言': 'ERNIE',
    '隐藏免责声明/提示条': 'Hide disclaimers / notice bars',
    '自动隐藏“AI 可能会犯错/数据使用”等提示条': 'Automatically hide “AI may make mistakes / data usage” banners.',
    '对话导航 / 📌 标记 / 收藏 / 防自动滚动': 'Conversation navigation / 📌 pins / favorites / anti-auto-scroll',
    '重置问题栏位置': 'Reset panel position',
    '清理过期检查点（30天）': 'Clean expired checkpoints (30 days)',
    '清理无效收藏': 'Clean invalid favorites',
    'ChatGPT 性能优化': 'ChatGPT Performance Optimization',
    '离屏虚拟化 + CSS contain': 'Offscreen virtualization + CSS contain',
    'OpenAI 新模型横幅提示': 'OpenAI New Model Banner',
    '监控到资源可访问时，在网页内显示大横幅（避免系统通知被屏蔽）': 'Show a large in-page banner when a monitored resource becomes available.',
    'ChatGPT 推理强度/模型 快捷切换': 'ChatGPT Reasoning / Model Hotkeys',
    '⌘O 推理强度 / ⌘J 模型切换': '⌘O reasoning effort / ⌘J model switch',
    '⌘Enter 发送（Enter 换行）': '⌘Enter send (Enter inserts newline)',
    'Enter/Shift+Enter 换行（强制）': 'Force Enter / Shift+Enter to insert new lines',
    'Qwen 模型/推理 快捷切换': 'Qwen model / reasoning hotkeys',
    '⌘O Thinking/Fast / ⌘J 模型切换': '⌘O Thinking/Fast / ⌘J model switch',
    'Grok 剩余额度显示': 'Grok remaining quota',
    '仅显示 all 积分余量（发送后更新）': 'Show only the “all” quota bucket (updates after send)',
    'Grok 废纸篓一键清空': 'Grok trash cleanup',
    '在 deleted-conversations 页面右上角提供“清空废纸篓”按钮（不可恢复）': 'Adds a “Clear trash” button to the deleted-conversations page (irreversible).',
    'ChatGPT 朗读速度控制器': 'ChatGPT Read-aloud Speed Controller',
    '控制 ChatGPT 朗读音频播放速度（0.01–100x）': 'Control ChatGPT read-aloud playback speed (0.01–100x).',
    'ChatGPT 用量统计': 'ChatGPT Usage Monitor',
    '用量统计': 'Usage monitor',
    '仅记录用量（不在页面注入悬浮窗）；Deep/Legacy Research 不计入；在配置页查看/导入/导出/清空，并支持旧版月度 HTML 报告': 'Usage logging only (no in-page floating widget). Deep / Legacy Research is excluded. View/import/export/clear it from Options, with legacy monthly HTML reports supported.',
    'ChatGPT 回复计时器': 'ChatGPT Reply Timer',
    '回复计时器': 'Reply timer',
    '统计从发送到回复完成的耗时（右下角极简数字）': 'Shows the time from send to completion as a small number at the bottom-right.',
    'ChatGPT 下载修复': 'ChatGPT Download Fix',
    '下载修复': 'Download fix',
    '修复文件下载失败（sandbox_path 解码）': 'Fix file download failures by decoding sandbox_path.',
    'ChatGPT 回复粗体高亮（Lite）': 'ChatGPT Bold Highlight (Lite)',
    '回复粗体高亮（Lite）': 'Bold highlight (Lite)',
    '高亮粗体 + 隐藏免责声明': 'Highlight bold text + hide disclaimer',
    '推理强度/模型 快捷切换': 'Reasoning / model hotkeys',
    '快捷深度搜索（译/搜/思）': 'Deep search hotkeys (translate/search/think)',
    '仅快捷键：Ctrl+S（搜）/ Ctrl+T（思）/ Ctrl+Y|Ctrl+Z（译）': 'Hotkeys only: Ctrl+S (search) / Ctrl+T (think) / Ctrl+Y|Ctrl+Z (translate)',
    'ChatGPT Tab 队列发送': 'ChatGPT Tab queue send',
    'Tab 队列发送': 'Tab queue send',
    'Tab 排队发送 / ⌥↑ 取回最近一条 / Ctrl+C 清空输入框（仅有 Meta 键时）': 'Queue with Tab / restore latest with ⌥↑ / clear input with Ctrl+C (Meta keyboards only)',
    'Ctrl+C 清空输入框': 'Ctrl+C clear input',
    'ChatGPT 隐藏点赞/点踩': 'Hide ChatGPT feedback buttons',
    '隐藏点赞/点踩': 'Hide feedback buttons',
    '隐藏回复下方反馈按钮（👍/👎）': 'Hide the feedback buttons under assistant replies (👍/👎).',
    '复制/引用含 KaTeX 的选区时优先还原 LaTeX，并支持悬停提示/双击复制': 'When copying or quoting a KaTeX selection, restore LaTeX first and support hover hints / double-click copy.',
    'ChatGPT 对话导出（新版 UI）': 'ChatGPT Conversation Export (new UI)',
    '对话导出（新版 UI）': 'Conversation export (new UI)',
    '按页面当前可见分支导出（会话 mapping，含图片链接）；不可判定时回退 current_node，再兜底当前可见导出': 'Export the currently visible branch (conversation mapping, including image links). Falls back to current_node, then to the visible branch when needed.',
    '导出为 Markdown': 'Export as Markdown',
    '导出为 HTML': 'Export as HTML',
    'ChatGPT 消息分叉编辑（可加图）': 'ChatGPT Fork Edit (with images)',
    '消息分叉编辑（可加图）': 'Fork edit (with images)',
    '给用户消息增加“分叉编辑”按钮：在输入框里编辑并可补图/文件；与原生编辑共存': 'Adds a “fork edit” button to user messages so you can edit in the composer and attach images/files.',
    'Canvas Enhancements': 'Canvas Enhancements',
    '在 Writing/Canvas 卡片左上角显示 Canvas ID（512xx）/ textdoc Canvas 短编号（5位），不覆盖原生行为': 'Show Canvas IDs in the top-left corner of Writing/Canvas cards without overriding native behavior.',
    'ChatGPT 消息树': 'ChatGPT Message Tree',
    '消息树': 'Message tree',
    '显示当前对话的完整消息树/分支结构（右侧面板），并支持导出完整树 JSON': 'Show the full message tree / branch structure for the current conversation in a right-side panel, with JSON export.',
    '导出完整树为 JSON': 'Export full tree as JSON',
    'ChatGPT 顶部按钮布局修复': 'ChatGPT Top-bar Layout Fix',
    '顶部按钮布局修复': 'Top-bar layout fix',
    '修复侧边栏顶部按钮交换；并将右上角群聊/临时聊天按钮移到模型选择器右侧': 'Fix swapped sidebar top buttons and move the group/temporary chat buttons beside the model selector.',
    '朗读速度控制器': 'Read-aloud speed controller',
    '性能优化': 'Performance optimization',
    '只控制该模块内部逻辑；若关闭“启用该模块注入”，这里不会生效。': 'This only controls the module’s internal logic. It has no effect when “Enable this module injection” is turned off.',
    '核心优化：将离屏消息变为 content-visibility:auto，减少长对话滚动/渲染压力。': 'Core optimization: turns offscreen messages into content-visibility:auto to reduce scrolling and rendering pressure in long chats.',
    '对 pre/table/公式/段落块等高开销内容使用 contain/content-visibility，减少长回复卡顿。': 'Uses contain/content-visibility on expensive content such as pre/table/formulas/markdown blocks to reduce long-response jank.',
    '将对话线程范围内的动画/过渡 duration 置 0，减少合成与重绘开销；避免误伤整个站点页面。': 'Sets animation/transition durations to 0 inside the conversation thread to reduce composition and repaint costs without hitting the whole site UI.',
    '在输入/编辑/发送等交互期间临时收紧预加载边距，优先保证点击/发送流畅。': 'Temporarily tightens the preload margin while typing, editing, or sending so clicks and sends stay responsive.',
    '使用查找时临时关闭虚拟化，确保能搜到远处内容（之后自动恢复）。': 'Temporarily disables virtualization while using Find so distant content remains searchable, then restores it automatically.',
    '开启后在页面左下角显示“性能”按钮，可随时切换开关并测量一次交互卡顿。': 'Shows a “Perf” button in the bottom-left corner so you can toggle settings and measure the next interaction lag at any time.',
    '已读取当前页面状态': 'Read the current page state.',
    '（读取失败）': '(read failed)',
    '已恢复模块默认设置': 'Restored the module defaults.',
    '在 chatgpt.com：⌘O 切换推理强度（Light/Heavy 或 Standard/Extended）；⌘J 在当前 GPT 5.x thinking ↔ pro 之间切换。': 'On chatgpt.com, use ⌘O to switch the reasoning effort (Light/Heavy or Standard/Extended) and ⌘J to switch between the current GPT 5.x Thinking and Pro variants.',
    '控制 ChatGPT “朗读/Read aloud”音频播放速度（HTMLAudioElement.playbackRate）。': 'Control the playback speed of ChatGPT “Read aloud” audio via HTMLAudioElement.playbackRate.',
    '仅快捷键：Ctrl+S（搜）/ Ctrl+T（思）/ Ctrl+Y|Ctrl+Z（译）（不注入按钮，更稳）。': 'Hotkeys only: Ctrl+S (search) / Ctrl+T (think) / Ctrl+Y|Ctrl+Z (translate). No extra buttons are injected, which keeps the module more stable.',
    'Google 搜索问 GPT': 'Ask GPT from Google Search',
    '在 Google 搜索框旁加“问 GPT”：跳到 ChatGPT 5.4 Thinking 并自动发起联网搜索提问': 'Adds an “Ask GPT” button next to the Google search box, opens ChatGPT 5.4 Thinking, and sends a web-search prompt automatically.',
    'Genspark 绘图默认设置': 'Genspark image defaults',
    '进入绘图页自动打开 Setting，并选择 2K 画质': 'Open Settings automatically on image pages and switch to 2K quality.',
    'Genspark 积分余量': 'Genspark credit balance',
    '悬停小蓝点显示积分信息（可刷新/折叠/拖动）': 'Hover the blue dot to view credits (refreshable, collapsible, draggable).',
    'Genspark 长代码块折叠': 'Genspark long code fold',
    '自动折叠长代码块并提供 展开/收起 按钮（仅 AI Chat 页）': 'Auto-collapse long code blocks and show expand/collapse buttons (AI Chat pages only).',
    'Genspark 消息编辑上传修复': 'Genspark edit-upload fix',
    '修复消息编辑（铅笔）里的附件上传：Cmd+V 粘贴图片/文件；📎打开文件选择器': 'Fix attachment uploads inside message edit (pencil): Cmd+V paste for images/files and 📎 to open the file picker.',
    'Genspark Claude Thinking 强制切换': 'Genspark Claude Thinking force switch',
    '仅对 Sonnet 4.5 启用 thinking 强制切换，并显示可折叠思考块': 'Force thinking mode only for Sonnet 4.5 and show collapsible thinking blocks.',
    '回到顶部': 'Back to top',
    '回到底部': 'Back to bottom',
    '对话项': 'Conversation items',
    '上一条（Cmd+↑ / Alt+↑）': 'Previous item (Cmd+↑ / Alt+↑)',
    '下一条（Cmd+↓ / Alt+↓）': 'Next item (Cmd+↓ / Alt+↓)',
    '刷新对话列表': 'Refresh conversation list',
    'Option+点击=强制刷新': 'Option+click = force refresh',
    '收起/展开': 'Collapse / expand',
    '阻止新回复自动滚动': 'Prevent auto-scroll on new replies',
    '仅显示收藏': 'Favorites only',
    '暂无收藏': 'No favorites yet',
    '暂无对话': 'No conversations yet',
    'Option+单击删除📌': 'Option+click to remove 📌',
    '收藏/取消收藏': 'Favorite / unfavorite',
    '分支 / 对话树': 'Branches / conversation tree',
    '树': '🌳',
    '简洁': 'Simple',
    '彩线': 'Guides',
    '刷新': 'Refresh',
    '关闭': 'Close',
    '悬停预览': 'Hover preview',
    '当前': 'Current',
    '打开树': 'Open tree',
    '显示全部（当前仅收藏）': 'Show all (favorites only)',
    '刷新对话列表 (Shift+点击 或 右键 = 强制重新扫描)': 'Refresh conversation list (Shift+click or right-click to force rescan)',
    '已锁定自动滚动（点击关闭）': 'Auto-scroll locked (click to disable)',
    'Tab 排队 · ⌥↑ / Alt+↑ 取回最近一条': 'Tab queue · ⌥↑ / Alt+↑ restores the latest item',
    '删除这条排队消息': 'Delete this queued message',
    '删除': 'Delete',
    '展开': 'Expand',
    '收起': 'Collapse',
    '性能': 'Performance',
    'ChatGPT 性能菜单': 'ChatGPT performance menu',
    '性能：开': 'Performance: on',
    '性能：关': 'Performance: off',
    '离屏虚拟化：开': 'Offscreen virtualization: on',
    '离屏虚拟化：关': 'Offscreen virtualization: off',
    '重内容优化：开': 'Heavy content optimization: on',
    '重内容优化：关': 'Heavy content optimization: off',
    '动画：开': 'Animations: on',
    '动画：关': 'Animations: off',
    '交互加速：开': 'Interaction boost: on',
    '交互加速：关': 'Interaction boost: off',
    '预加载边距': 'Preload margin',
    '选项…': 'Options…',
    '测量下一次交互卡顿': 'Measure next interaction lag',
    '保存': 'Save',
    '删除': 'Delete',
    '已启用': 'Enabled',
    '启用该模块注入': 'Enable this module injection',
    '套餐设置': 'Plan settings',
    '当前套餐:': 'Current plan:',
    '用量': 'Usage',
    '查看': 'View',
    '导入': 'Import',
    '导出': 'Export',
    '清空': 'Clear',
    '模型名称': 'Model',
    '最后使用': 'Last used',
    '使用量': 'Usage',
    '进度': 'Progress',
    '名义无限': 'Nominal unlimited',
    '不可用': 'Unavailable',
    '关闭': 'Off',
    '关闭（扩展总开关已关闭）': 'Off (extension master switch is off)',
    '关闭（URL 列表为空）': 'Off (URL list is empty)',
    '监控：': 'Monitor:',
    '开启（每 1 小时）': 'On (every 1 hour)',
    '下次：': 'Next:',
    '上次：': 'Last:',
    '上次': 'Last',
    '（URL 列表为空）': '(URL list is empty)',
    '（未启用）': '(disabled)',
    '（未知）': '(unknown)',
    '资源': 'Resource',
    '状态': 'Status',
    '结果': 'Result',
    '总计': 'Total',
    '日期': 'Date',
    '星期': 'Weekday',
    '总请求数': 'Total requests',
    '每日使用趋势': 'Daily usage trend',
    '模型使用分布': 'Model usage distribution',
    '详细数据表': 'Detailed table',
    '一个月用量分析报告': 'Monthly usage report',
    '一周用量分析报告': 'Weekly usage report',
    '没有匹配的网站': 'No matching sites',
    '调整搜索词，或清空搜索后查看全部网站。': 'Adjust the search term, or clear it to view all sites.',
    '当前没有可展示的网站。': 'No sites are currently available to display.',
    '没有匹配的脚本': 'No matching scripts',
    '调整搜索词，或切换到其他网站继续查看。': 'Adjust the search term, or switch to another site.',
    '当前网站没有可展示的脚本。': 'No scripts are currently available for this site.',
    '当前站点脚本清单': 'Scripts on this site',
    '编辑该模块的详细配置。': 'Edit the detailed settings for this module.',
    '菜单操作': 'Menu actions',
    '直接在配置页执行（会在已打开的目标站点页面中运行）。': 'Run directly from Options (executes in an already-open target site tab).',
    '许可': 'License',
    '上游': 'Upstream',
    '许可证未声明': 'License not declared',
    'MIT（上游脚本声明）': 'MIT (declared by upstream script)',
    '启用 QuickNav 模块': 'Enable QuickNav',
    '默认 🔐（防自动滚动）': 'Default 🔐 (anti auto-scroll)',
    '“默认 🔐”仅在该网站从未保存过 🔐 状态时生效（例如第一次使用，或清除该网站数据后）。': '“Default 🔐” only applies when this site has never saved a 🔐 state, such as first use or after clearing site data.',
    '当前页面开关已关闭：该站点不会注入任何模块。': 'The page-level switch is off, so this site will not inject any modules.',
    '该模块负责对话导航面板、📌标记点、收藏夹、防自动滚动与快捷键。': 'This module powers the conversation panel, 📌 checkpoints, favorites, anti-auto-scroll, and related hotkeys.',
    '离屏虚拟化与 CSS contain，减少长对话卡顿（设置写入 storage.sync）。': 'Offscreen virtualization plus CSS contain to reduce lag in long conversations (settings are stored in storage.sync).',
    '提示：该模块会在页面主世界（MAIN world）监听 ⌘O/⌘J（可分别关闭）；并在发送成功后右下角弹窗显示实际使用的 thinking_effort（以及 model）。关闭模块后已打开页面可能需要刷新才会完全停用。若你把键盘能力设为“无 Meta 键”，这里只会保留模块注入，快捷键默认停用。': 'This module listens for ⌘O / ⌘J in the page MAIN world (each can be disabled separately) and shows the actual thinking_effort and model in a bottom-right toast after a successful send. If you disable the module, already-open pages may need a refresh to fully stop it. If keyboard capability is set to “no Meta key”, the injection stays but the hotkeys are disabled by default.',
    '在 Qwen 中用 ⌘O / ⌘J 切换推理模式与模型。': 'Use ⌘O / ⌘J in Qwen to switch reasoning mode and model.',
    '把 Enter/Shift+Enter 变为换行，⌘/Ctrl+Enter 才发送消息。': 'Make Enter / Shift+Enter insert new lines and only send with ⌘/Ctrl+Enter.',
    '统计从你发送消息到 GPT 回复完成的耗时（右下角极简数字，覆盖最底层）。': 'Measure the time from your send action to GPT reply completion (a tiny number at the bottom-right).',
    '说明：该模块在页面主世界（MAIN world）拦截 fetch，并读取对话 SSE（/backend-api/(f/)conversation）来判断开始/结束；右下角仅显示一个小数字（秒），并使用极高 z-index 覆盖其它悬浮物。': 'This module intercepts fetch in the page MAIN world and reads conversation SSE (/backend-api/(f/)conversation) to detect the start and end of a reply. It shows only a tiny number (seconds) at the bottom-right and uses a very high z-index so it stays above other floating UI.',
    '修复 chatgpt.com 下载文件失败：自动解码 download URL 的 sandbox_path。': 'Fix failed file downloads on chatgpt.com by decoding sandbox_path in the download URL automatically.',
    '高亮 ChatGPT 回复中的粗体文字，并隐藏底部免责声明提示。': 'Highlight bold text in ChatGPT replies and hide the bottom disclaimer notice.',
    '说明：该模块会监听 audio 的 play/ratechange，并保持你设置的倍速；修改后无需刷新，正在播放的音频会自动更新。': 'This module listens to the audio play/ratechange events and keeps the playback speed at the value you configured. Changes apply without a refresh, and currently playing audio is updated automatically.',
    'Tab 把草稿排队，等当前轮真正结束后再按 FIFO 自动发出下一条。': 'Use Tab to queue drafts and send the next one automatically with FIFO after the current turn truly finishes.',
    '隐藏 ChatGPT 回复下方的反馈按钮（点赞 / 点踩）。': 'Hide the feedback buttons under ChatGPT replies (thumbs up / thumbs down).',
    '增强 ChatGPT 的复制/引用：优先复制 KaTeX 的原始 LaTeX。': 'Improve ChatGPT copy/quote behavior by preferring the original LaTeX from KaTeX.',
    '说明：该模块通过 CSS 隐藏 button[data-testid="good-response-turn-action-button"] 和 button[data-testid="bad-response-turn-action-button"]。若关闭模块，已打开页面可能需要刷新才会完全停用。': 'This module hides button[data-testid="good-response-turn-action-button"] and button[data-testid="bad-response-turn-action-button"] with CSS. If you disable it, already-open pages may need a refresh to fully stop it.',
    '说明：该模块在页面主世界（MAIN world）通过事件驱动处理复制/引用：复制时仅在选区含 .katex 时改写剪贴板为原始 LaTeX；点击原生 Quote 时仅对该次引用做补丁替换（不再全局重载 Range/Selection）。交互：悬停公式 0.8s 显示 LaTeX 提示，双击公式复制 LaTeX 并弹出提示。关闭模块后已打开页面可能需要刷新才会完全停用。': 'This module handles copy/quote in the page MAIN world through events. When the selection contains .katex, it rewrites the clipboard to the original LaTeX. Clicking the native Quote action patches only that quote operation instead of globally overriding Range/Selection. Interactions: hover over a formula for 0.8s to show the LaTeX tooltip, and double-click a formula to copy the LaTeX with a toast. If you disable it, already-open pages may need a refresh to fully stop it.',
    '按 mapping 导出当前分支（Markdown / HTML）；失败时自动回退当前可见导出。': 'Export the current branch by mapping (Markdown / HTML), and automatically fall back to visible-export mode when needed.',
    '说明：导出为纯前端下载（Blob），无需额外权限；图片默认导出为原始链接（不做 base64 内嵌）。完整树 JSON 请使用“ChatGPT 消息树”模块菜单导出。': 'Exports use a pure front-end Blob download and need no extra permissions. Images are exported as original links by default instead of base64 embedding. For a full-tree JSON export, use the “ChatGPT Message Tree” module menu.',
    '为用户消息增加一个“分叉编辑”按钮（可与原生编辑共存）。': 'Add a “fork edit” button to user messages, while still coexisting with native edit.',
    '使用方式：在用户消息下面会多出一个 QuickNav 铅笔按钮（在 ChatGPT 原生“编辑”左侧）；点击后会把原文（以及原图，如有）填入输入框。此时你可以继续编辑，并可新增/粘贴图片（Cmd+V）或用“添加文件/图片”上传，然后直接发送。发送时会自动改写 parent_message_id，实现真正的“分叉编辑”；若对方还在回复，点一次发送会自动结束当前回复并继续分叉发送。若想恢复正常发送，点提示条里的“取消”。': 'Usage: a QuickNav pencil button appears below each user message (to the left of ChatGPT’s native Edit button). Clicking it fills the composer with the original text and image, if present. You can keep editing, paste or add more images (Cmd+V), or upload via “Add files/photos”, then send directly. Sending rewrites parent_message_id so this becomes a true fork edit. If the assistant is still replying, sending once stops the current reply and continues with the fork send. To go back to normal sending, click “Cancel” in the notice bar.',
    '显示当前对话的完整消息树/分支结构（不切换主界面分支），并支持导出完整树 JSON。': 'Show the full message tree / branch structure for the current conversation without switching the main-thread branch, and support full-tree JSON export.',
    '使用方式：在右下角会出现 “Tree” 按钮。点开后显示当前对话的消息树（包含所有分支）并高亮当前分支路径；默认开启“简洁”（隐藏 system/tool/thoughts 等内部节点）和“彩线”（类似 VSCode 的缩进对齐竖线），可在面板顶部一键切换。该模块不会驱动主聊天区切换分支/定位消息；只用于查看结构。若要导出完整树，请在扩展菜单中执行“导出完整树为 JSON”。': 'Usage: a “Tree” button appears at the bottom-right. Open it to see the current conversation tree (including all branches) with the current path highlighted. “Simple” (hide system/tool/thoughts nodes) and “Guides” (VSCode-like guide lines) are enabled by default and can be toggled in the panel header. This module does not switch branches or focus messages in the main chat area; it is only for inspecting the structure. To export the full tree, use “Export full tree as JSON” from the extension menu.',
    '仅在绘图页面生效：进入页面自动打开 Setting，并自动选择 2K 画质。': 'Only active on image-generation pages: open Settings automatically and switch to 2K quality.',
    '说明：该模块只在 https://www.genspark.ai/agents?type=moa_generate_image 生效；会尽量通过按钮文本/aria-label/弹窗选项等启发式方式打开设置并选择 2K。若关闭模块，已打开页面可能需要刷新才会完全停用。': 'This module is active only on https://www.genspark.ai/agents?type=moa_generate_image. It tries to open the settings dialog and select 2K through button text, aria-labels, and other heuristics. If you disable it, already-open pages may need a refresh to fully stop it.',
    '悬停页面上的小蓝点显示积分余量信息；支持折叠/展开、强制刷新、每分钟自动刷新。': 'Hover the blue dot to view remaining credits; supports collapse/expand, force refresh, and automatic refresh every minute.',
    '说明：该模块在 https://www.genspark.ai/* 生效；右上角会出现一个可拖动的小蓝点，鼠标悬停时展示积分信息窗口；窗口位置会跟随蓝点。': 'This module is active on https://www.genspark.ai/*. A draggable blue dot appears in the top-right corner. Hover over it to show the credit window, and the window position follows the dot.',
    '修复消息编辑（铅笔）里的附件上传：Cmd+V 粘贴图片/文件；📎打开文件选择器。': 'Fix attachment uploads inside message edit (pencil): Cmd+V pastes images/files and 📎 opens the file picker.',
    '使用方式：先点击消息右侧的铅笔进入编辑，然后点击编辑框，再 Cmd+V 粘贴图片/文件；点击编辑器里的📎会弹出文件选择器。': 'Usage: click the pencil icon on the right side of a message to enter edit mode, then click the editor and use Cmd+V to paste images/files. Clicking the 📎 icon inside the editor opens the file picker.',
    '说明：该模块仅在 Grok 对话页（/c/...）请求 https://grok.com/rest/rate-limits，在最右下角显示常驻极简卡片（仅 all 积分，例如 400/400）。2026-02-25 发现 4.2 与 4.2 heavy 次数接口失效，已不再展示这两项。': 'This module requests https://grok.com/rest/rate-limits only on Grok conversation pages (/c/...) and shows a persistent compact card in the bottom-right with only the “all” quota bucket (for example, 400/400). On 2026-02-25, the 4.2 and 4.2 heavy counters stopped working, so those two are no longer shown.',
    '提示：模块本身仍会保留页面逻辑；当键盘能力按“无 Meta 键”处理时，⌘O / ⌘J 默认停用，但你仍可手动强制保留。': 'The module logic itself still remains on the page. When keyboard capability is treated as “no Meta key”, ⌘O / ⌘J is disabled by default, but you can still force-enable it manually.',
    '注意：开启后会拦截输入框 Enter 行为（只允许 ⌘/Ctrl+Enter 发送）。若你习惯 Enter 直接发送，请不要开启。': 'When enabled, Enter is intercepted in the composer so only ⌘/Ctrl+Enter sends. Leave this off if you prefer plain Enter to send.',
    '启用 Ctrl+S / T / Y / Z 快捷键': 'Enable Ctrl+S / T / Y / Z hotkeys',
    '无 Meta 键时仍强制启用这组 Ctrl 快捷键': 'Force-enable this Ctrl hotkey group without a Meta key',
    '说明：触发快捷键后，会把对应前缀插入到输入框开头并自动发送；并通过共享 fetch hub 让“这一次发送”强制使用 gpt-5（仅生效一次）。当键盘能力按“无 Meta 键”处理时，这组 Ctrl 快捷键默认停用，避免与浏览器或系统快捷键冲突。': 'When triggered, the hotkey inserts the matching prefix at the start of the composer and sends automatically. It also uses the shared fetch hub to force this one send to use gpt-5 once. When keyboard capability is treated as “no Meta key”, this Ctrl hotkey group is disabled by default to avoid browser or system conflicts.',
    '启用 Tab 队列发送 / ⌥↑ / Alt+↑ 取回最近一条': 'Enable Tab queue send / restore the latest item with ⌥↑ / Alt+↑',
    '启用 Ctrl+C 清空输入框（仅有 Meta 键时生效）': 'Enable Ctrl+C to clear the composer (only when a Meta key is available)',
    '为 QuickNav 中由队列发出的用户消息保留橙色标记': 'Keep the orange QuickNav mark on messages sent from the queue',
    '说明：当前只支持纯文本队列；Tab 会拦截原生焦点切换并把当前草稿排进队列，Shift+Tab 仅负责阻止浏览器切焦点，不附带额外语义，⌥↑ / Alt+↑ 取回最近一条已排队草稿。排队预览里每条末尾都可以直接删除。自动发送下一条时，主判定来自 conversation stream 的 [DONE]，不会只看发送按钮是否高亮；Ctrl+C 清空走浏览器编辑命令，尽量保留 Cmd+Z 撤销链；QuickNav 橙色标记会在点击对应消息后清掉。': 'Only plain-text queue items are currently supported. Tab intercepts the native focus jump and queues the current draft. Shift+Tab only prevents the browser focus change and adds no extra behavior. ⌥↑ / Alt+↑ restores the latest queued draft. Every queued item can be deleted directly from the preview. Auto-sending the next item is mainly gated by conversation stream [DONE] rather than only the highlighted send button. Ctrl+C clears the composer through the browser editing command to preserve the Cmd+Z undo chain as much as possible. The orange QuickNav mark is cleared after you click the corresponding message.',
    '正在加载设置': 'Loading settings',
    '等待后台返回当前配置。': 'Waiting for the background script to return the current settings.',
    '正在加载模块设置面板': 'Loading the module settings panel',
    '根据当前模块选择对应的设置渲染器。': 'Selecting the matching settings renderer for the current module.',
    '未知模块：仅提供注入开关；如需额外设置请补充模块设置面板。': 'Unknown module: only the injection toggle is available. Add a dedicated settings panel if more controls are needed.',
    '模块设置加载失败：已回退到基础注入开关。': 'Failed to load the module settings panel. Fell back to the basic injection toggle.',
    '读取当前页面状态': 'Read current page state',
    '恢复该模块默认设置': 'Restore this module defaults',
    '模块设置已保存': 'Module settings saved',
    '正在保存模块设置…': 'Saving module settings…',
    '正在恢复模块默认…': 'Restoring module defaults…',
    '正在恢复默认…': 'Restoring defaults…',
    '已恢复默认': 'Defaults restored',
    '恢复默认速度（1.8x）': 'Restore default speed (1.8x)',
    '已恢复默认速度': 'Default speed restored',
    '朗读速度倍速（0.01–100）': 'Read-aloud speed multiplier (0.01–100)',
    '模块内部总开关（默认开）': 'Module internal master switch (default on)',
    '离屏虚拟化（默认开）': 'Offscreen virtualization (default on)',
    '重内容优化（默认开）': 'Heavy content optimization (default on)',
    '禁用动画/过渡（默认开）': 'Disable animations / transitions (default on)',
    '输入/交互加速（默认开）': 'Input / interaction boost (default on)',
    'Ctrl/Cmd+F 临时解冻（默认开）': 'Temporary unfreeze on Ctrl/Cmd+F (default on)',
    '显示页面内性能菜单（默认关）': 'Show in-page performance menu (default off)',
    'rootMarginPx（越大越不激进）': 'rootMarginPx (larger = less aggressive)',
    '状态检测': 'State probe',
    '从已打开的 ChatGPT 页面读取 <html data-cgptperf*> 属性，确认设置是否已应用。': 'Read <html data-cgptperf*> attributes from an open ChatGPT page to confirm the settings were applied.',
    '注意：这里的设置是模块内部逻辑的开关；“启用该模块注入”则决定脚本是否注入到页面。': 'These toggles control the module internals; “Enable this module injection” decides whether the script is injected at all.',
    '每日请求数': 'Daily requests',
    '总请求数:': 'Total requests:',
    '活跃模型数': 'Active models',
    '有使用记录': 'Has usage records',
    '日均使用': 'Daily average',
    '使用高峰日': 'Peak day',
    '最近7天': 'Last 7 days',
    '最近30天': 'Last 30 days',
    '活跃天数平均': 'Average over active days',
    '今天': 'Today',
    '生成时间': 'Generated at',
    '分析时间段': 'Analysis period',
    '此报告由 ChatGPT 用量统计脚本自动生成': 'This report was generated automatically by ChatGPT Usage Monitor.',
    '每行一个：https://developers.openai.com/images/api/models/icons/...': 'One URL per line: https://developers.openai.com/images/api/models/icons/...',
    '其它菜单': 'Other menu',
    '作者': 'Author',
    '许可': 'License',
    '上游': 'Upstream',
    '筛出 0 个网站。': '0 sites matched.',
    '筛出 1 个网站。': '1 site matched.',
    '筛出 2 个网站。': '2 sites matched.',
    '筛出 3 个网站。': '3 sites matched.',
    '筛出 4 个网站。': '4 sites matched.',
    '筛出 5 个网站。': '5 sites matched.',
    '筛出 6 个网站。': '6 sites matched.',
    '筛出 7 个网站。': '7 sites matched.',
    '筛出 8 个网站。': '8 sites matched.',
    '筛出 9 个网站。': '9 sites matched.',
    '启用该模块注入': 'Enable this module injection',
    '启用该模块': 'Enable this module',
    '已停用': 'Disabled',
    '未知': 'Unknown',
    '（无响应）': '(no response)',
    '（未知）': '(unknown)',
    '（未启用）': '(disabled)',
    '（URL 列表为空）': '(URL list is empty)',
    '可用': 'Reachable',
    '不可用': 'Unavailable',
    '监控': 'Monitor',
    '下次': 'Next',
    '已清除 OpenAI 新模型提示': 'Cleared the OpenAI model alert',
    '初始化失败': 'Initialization failed',
    '正在保存…': 'Saving…',
    '已保存': 'Saved',
    '读取当前页面状态': 'Read current page state',
    '恢复该模块默认设置': 'Restore this module defaults',
    '恢复该模块默认': 'Restore this module defaults',
    '模块设置已保存': 'Module settings saved',
    '正在保存模块设置…': 'Saving module settings…',
    '状态检测': 'State probe',
    '注意：这里的设置是模块内部逻辑的开关；“启用该模块注入”则决定脚本是否注入到页面。': 'These toggles control the module internals; “Enable this module injection” decides whether the script is injected at all.',
    '启用 ⌘O（切换推理强度）': 'Enable ⌘O (switch reasoning effort)',
    '启用 ⌘J（切换模型）': 'Enable ⌘J (switch model)',
    '启用 ⌘O / ⌘J 快捷键': 'Enable ⌘O / ⌘J hotkeys',
    '无 Meta 键时仍强制启用 ⌘O / ⌘J': 'Force-enable ⌘O / ⌘J without a Meta key',
    '⌘Enter 发送（通用）': '⌘Enter send (shared)',
    'Google 搜索问 GPT': 'Ask GPT from Google Search',
    '许可证未声明': 'License not declared',
    'MIT（上游脚本声明）': 'MIT (upstream declaration)',
    'lueluelue2006（原始脚本 / MV3 扩展封装/改造）': 'lueluelue2006 (original script / MV3 extension packaging and adaptation)',
    'loongphy（暗色模式+回弹补丁）': 'loongphy (dark-mode + rebound patch)',
    'lueluelue2006（原始脚本 / MV3 集成）': 'lueluelue2006 (original script / MV3 integration)',
    '浅色': 'Light',
    '深色': 'Dark'
  });

  const REGEX_REPLACEMENTS = [
    [/^已清理 (\d+) 条过期检查点（>30天）$/, 'Cleared $1 expired checkpoints (>30 days)'],
    [/^无过期检查点需要清理$/, 'No expired checkpoints to clean'],
    [/^已清理 (\d+) 个无效收藏$/, 'Cleared $1 invalid favorites'],
    [/^无无效收藏需要清理$/, 'No invalid favorites to clean'],
    [/^分支 (\d+)$/, 'Branch $1'],
    [/^还有 (\d+) 条分支，打开树查看$/, '$1 more branches — open the tree to view'],
    [/^分支：(\d+)$/, 'Branches: $1'],
    [/^(\d+) 行$/, '$1 lines'],
    [/^已排队 (\d+) 条$/, '$1 queued'],
    [/^还有 (\d+) 条待发送$/, '$1 more queued items'],
    [/^队列已暂停：上一条排队消息仍在发出。$/, 'Queue paused: the previous queued message is still being sent.'],
    [/^队列已暂停：请回到原对话后继续自动发送。$/, 'Queue paused: return to the original conversation to resume auto-send.'],
    [/^队列已暂停：当前不在原对话里。$/, 'Queue paused: you are not in the original conversation.'],
    [/^队列已暂停：输入框里有未排队附件。$/, 'Queue paused: the composer contains attachments that are not queued.'],
    [/^队列已暂停：输入框里有手动草稿。$/, 'Queue paused: the composer contains a manual draft.'],
    [/^队列已暂停：上一条回复仍在收尾。$/, 'Queue paused: the previous reply is still wrapping up.'],
    [/^显示全部（当前仅收藏）$/, 'Show all (favorites only)'],
    [/^显示全部（当前仅收藏）（(\d+)）$/, 'Show all (favorites only) ($1)'],
    [/^仅显示收藏（(\d+)）$/, 'Favorites only ($1)'],
    [/^分支 \/ 对话树（仅对话页可用）$/, 'Branches / conversation tree (conversation pages only)'],
    [/^分支 \/ 对话树（加载中…，(.+)）$/, 'Branches / conversation tree (loading…, $1)'],
    [/^分支 \/ 对话树（点击加载，(.+)）$/, 'Branches / conversation tree (click to load, $1)'],
    [/^分支 \/ 对话树（分支点：(\d+)，(.+)）$/, 'Branches / conversation tree (branch points: $1, $2)'],
    [/^分支 \/ 对话树（当前对话无分支，(.+)）$/, 'Branches / conversation tree (no branches in the current conversation, $1)'],
    [/^自动检测基于当前设备环境：(.+?)。无 Meta 键时，依赖 ⌘ 的快捷键会默认停用；Ctrl\+S \/ T \/ Y \/ Z 这类冲突型快捷键也会默认停用。$/, 'Automatic detection uses the current device environment: $1. Without a Meta key, ⌘-based hotkeys are disabled by default; Ctrl+S / T / Y / Z conflict-prone hotkeys are also disabled.'],
    [/^(\d+)s 前$/, '$1s ago'],
    [/^自动 · 有 Meta 键$/, 'Auto · Meta key'],
    [/^自动 · 无 Meta 键$/, 'Auto · No Meta key'],
    [/^Auto · 简体中文$/, 'Auto · Simplified Chinese'],
    [/^当前按“有 Meta 键”处理快捷键。$/, 'Hotkeys are currently handled as if a Meta key is available.'],
    [/^当前按“无 Meta 键”处理快捷键。$/, 'Hotkeys are currently handled as if no Meta key is available.'],
    [/^你已手动指定为“有 Meta 键”。$/, 'You manually set this device as having a Meta key.'],
    [/^你已手动指定为“无 Meta 键”。$/, 'You manually set this device as not having a Meta key.'],
    [/^共 (\d+) 个模型，(\d+) 条请求记录$/, '$1 models, $2 request records'],
    [/^(Free|Go|K12|Plus|Team|Edu|Enterprise|Pro)高级共用池$/, '$1 premium shared pool'],
    [/^(Free|Go|K12|Plus|Team|Edu|Enterprise|Pro)思考共用池$/, '$1 thinking shared pool'],
    [/^(Free|Go|K12|Plus|Team|Edu|Enterprise|Pro)即时共用池$/, '$1 instant shared pool'],
    [/^筛出 (\d+) 个网站。$/, '$1 sites matched.'],
    [/^检测到 (\d+) 条资源可访问（每次检测都会提醒）：(.+)$/, '$1 monitored resources are reachable: $2'],
    [/^已拦截不安全链接：(.+)$/, 'Blocked an unsafe link: $1'],
    [/^打开配置失败$/, 'Failed to open settings'],
    [/^远端 dist\/manifest\.json 没有 version 字段$/, 'Remote dist/manifest.json is missing a version field'],
    [/^检查失败：(.+)$/, 'Update check failed: $1'],
    [/^初始化菜单失败：(.+)$/, 'Failed to initialize the menu: $1'],
    [/^保存失败：(.+)$/, 'Save failed: $1'],
    [/^执行失败：(.+)$/, 'Execution failed: $1'],
    [/^已执行：(.+)$/, 'Executed: $1'],
    [/^正在执行：(.+)…$/, 'Running: $1…'],
    [/^启用 (.+)$/, 'Enable $1'],
    [/^正在保存模块设置…$/, 'Saving module settings…'],
    [/^模块设置保存失败：(.+)$/, 'Failed to save module settings: $1'],
    [/^读取模块设置失败：(.+)$/, 'Failed to read module settings: $1'],
    [/^正在恢复模块默认…$/, 'Restoring module defaults…'],
    [/^恢复失败：(.+)$/, 'Restore failed: $1'],
    [/^恢复默认失败：(.+)$/, 'Restore defaults failed: $1'],
    [/^恢复出厂失败：(.+)$/, 'Factory reset failed: $1'],
    [/^重新注入失败：(.+)$/, 'Reinject failed: $1'],
    [/^清除提示失败：(.+)$/, 'Failed to clear the alert: $1'],
    [/^OpenAI 监控操作失败：(.+)$/, 'OpenAI monitor action failed: $1'],
    [/^读取失败：(.+)$/, 'Read failed: $1'],
    [/^加载失败：(.+)$/, 'Load failed: $1'],
    [/^加载模块设置失败：(.+)$/, 'Failed to load the module settings panel: $1'],
    [/^查找标签页 超时$/, 'Timed out while locating the tab'],
    [/^读取页面状态 超时$/, 'Timed out while reading page state'],
    [/^未找到已打开的 ChatGPT 标签页（请先打开 chatgpt\.com）$/, 'No open ChatGPT tab was found. Open chatgpt.com first.'],
    [/^无响应（可能未注入或页面未刷新）$/, 'No response (the script may not be injected yet, or the page needs a refresh).'],
    [/^未找到已打开的 (.+) 页面：请先打开该站点任意页面再执行。$/, 'No open $1 page was found. Open any page on that site first and try again.'],
    [/^未能连接到页面菜单：(.+)（可能需要刷新该页面）$/, 'Could not connect to the page menu: $1 (the page may need a refresh).'],
    [/^未能获取页面菜单：请确认该站点已启用并刷新页面后再试。$/, 'Could not read the page menu. Make sure the site is enabled and refresh the page first.'],
    [/^未找到对应菜单项：(.+)（请确认该模块已注入到页面）$/, 'Could not find the matching menu item: $1 (make sure the module has been injected into the page).'],
    [/^当前按“有 Meta 键”处理快捷键。$/, 'Hotkeys are currently handled as if a Meta key is available.'],
    [/^当前按“无 Meta 键”处理快捷键。$/, 'Hotkeys are currently handled as if no Meta key is available.'],
    [/^当前按浏览器语言自动使用简体中文。$/, 'The interface is automatically using Simplified Chinese based on your browser language.'],
    [/^当前按浏览器语言自动使用英文。$/, 'The interface is automatically using English based on your browser language.'],
    [/^你已手动指定为简体中文。$/, 'You manually set the interface to Simplified Chinese.'],
    [/^你已手动指定为英文。$/, 'You manually set the interface to English.'],
    [/^开启（每 (.+)）$/, 'On (every $1)'],
    [/^关闭（扩展总开关已关闭）$/, 'Off (extension disabled)'],
    [/^关闭（URL 列表为空）$/, 'Off (URL list is empty)'],
    [/^关闭$/, 'Off'],
    [/^（(.+) 前）$/, '($1 ago)'],
    [/^(.+) 前$/, '$1 ago'],
    [/^当前配置按“无 Meta 键”处理。强制开启后，若你的键盘没有可用的 Meta 键或映射，⌘O \/ ⌘J 仍可能无法使用。\n\n确定继续强制开启吗？$/, 'The current configuration treats this keyboard as having no Meta key. If you force-enable it, ⌘O / ⌘J may still fail if your keyboard has no usable Meta mapping.\n\nContinue anyway?'],
    [/^当前配置按“无 Meta 键”处理。强制开启后，Ctrl\+S \/ Ctrl\+T \/ Ctrl\+Y \/ Ctrl\+Z 可能与浏览器或系统快捷键冲突。\n\n确定继续强制开启吗？$/, 'The current configuration treats this keyboard as having no Meta key. If you force-enable it, Ctrl+S / Ctrl+T / Ctrl+Y / Ctrl+Z may conflict with browser or system shortcuts.\n\nContinue anyway?'],
    [/^当前扩展 ID：(.+)$/, 'Current extension ID: $1'],
    [/^已是最新版本：v(.+)$/, 'Already up to date: v$1'],
    [/^发现新版本：v(.+)$/, 'New version available: v$1'],
    [/^远端版本：v(.+)$/, 'Remote version: v$1'],
    [/^当前版本：v(.+)$/, 'Current version: v$1'],
    [/^已重新注入：当前没有已打开的匹配页面（0 个）；后续打开页面会自动注入。$/, 'Reinjection finished: there are currently no matching open pages (0). Future matching pages will inject automatically.'],
    [/^已重新注入：已打开的匹配页面（(\d+) 个）会立即生效；关闭功能需刷新页面。$/, 'Reinjection finished: the $1 matching open page(s) will update immediately; refresh the page to fully disable a feature.'],
    [/^已重新注入（已打开的匹配页面会立即生效；关闭功能需刷新页面）$/, 'Reinjection finished: matching open pages update immediately; refresh the page to fully disable a feature.'],
    [/^已触发恢复出厂：扩展即将重新加载。完成后请刷新已打开的页面。$/, 'Factory reset triggered: the extension is about to reload. Refresh any already-open pages afterwards.'],
    [/^正在清空所有数据（恢复出厂）…$/, 'Clearing all data (factory reset)…'],
    [/^正在重新注入…$/, 'Reinjecting…'],
    [/^正在读取…$/, 'Loading…'],
    [/^正在检测…$/, 'Checking…'],
    [/^已完成检测$/, 'Check complete'],
    [/^已保存监控列表$/, 'Monitor list saved'],
    [/^（失败）(.+)$/, '(failed) $1']
  ];

  function normalizeLocaleMode(input, fallback = LOCALE_MODE_AUTO) {
    const value = String(input || '').trim().toLowerCase();
    if (value === LOCALE_MODE_AUTO || value === LOCALE_MODE_ZH_CN || value === LOCALE_MODE_EN) return value;
    return fallback;
  }

  function normalizeLocaleTag(input) {
    return String(input || '').trim().toLowerCase().replace(/_/g, '-');
  }

  function isSimplifiedChineseTag(input) {
    const tag = normalizeLocaleTag(input);
    if (!tag) return false;
    if (tag === 'zh-cn' || tag === 'zh-sg') return true;
    if (tag === 'zh-hans' || tag.startsWith('zh-hans-')) return true;
    if (tag.startsWith('zh-cn-') || tag.startsWith('zh-sg-')) return true;
    return false;
  }

  function detectLocale(nav = globalThis.navigator) {
    const candidates = [];
    try {
      if (Array.isArray(nav?.languages)) candidates.push(...nav.languages);
    } catch {}
    try {
      if (nav?.language) candidates.push(nav.language);
    } catch {}
    try {
      if (nav?.userLanguage) candidates.push(nav.userLanguage);
    } catch {}
    try {
      if (nav?.browserLanguage) candidates.push(nav.browserLanguage);
    } catch {}
    for (const candidate of candidates) {
      if (isSimplifiedChineseTag(candidate)) return RESOLVED_LOCALE_ZH;
    }
    return RESOLVED_LOCALE_EN;
  }

  function resolveLocale(mode, nav = globalThis.navigator) {
    const normalized = normalizeLocaleMode(mode, LOCALE_MODE_AUTO);
    if (normalized === LOCALE_MODE_ZH_CN) return RESOLVED_LOCALE_ZH;
    if (normalized === LOCALE_MODE_EN) return RESOLVED_LOCALE_EN;
    return detectLocale(nav);
  }

  function isChineseLocale(locale) {
    return normalizeLocaleTag(locale).startsWith('zh');
  }

  function formatTemplate(template, vars) {
    let out = String(template || '');
    if (!vars || typeof vars !== 'object') return out;
    for (const [key, value] of Object.entries(vars)) {
      out = out.replaceAll(`{${key}}`, String(value ?? ''));
    }
    return out;
  }

  function translateText(text, locale, vars) {
    const raw = String(text ?? '');
    if (!raw || isChineseLocale(locale)) return formatTemplate(raw, vars);
    let out = raw;
    if (Object.prototype.hasOwnProperty.call(EXACT_TEXT_MAP, out)) {
      out = EXACT_TEXT_MAP[out];
    } else {
      for (const [pattern, replacement] of REGEX_REPLACEMENTS) {
        if (pattern.test(out)) {
          out = out.replace(pattern, replacement);
          break;
        }
      }
    }
    for (const [pattern, replacement] of TEXT_KEYWORD_REPLACEMENTS) {
      out = out.replace(pattern, replacement);
    }
    return formatTemplate(out, vars);
  }

  function translate(messages, locale, key, vars) {
    const def = messages && typeof messages === 'object' ? messages[key] : null;
    if (!def) return formatTemplate(String(key || ''), vars);
    if (typeof def === 'string') return translateText(def, locale, vars);
    const localized = isChineseLocale(locale) ? def.zh ?? def.en : def.en ?? def.zh;
    return formatTemplate(String(localized || ''), vars);
  }

  function localizeTree(root, locale) {
    if (!root || isChineseLocale(locale)) return;
    const seen = new Set();

    function visitNode(target) {
      if (!target || seen.has(target)) return;
      seen.add(target);
      if (target instanceof ShadowRoot || target instanceof DocumentFragment || target instanceof Element || target instanceof Document) {
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          const next = textNode;
          const value = String(next.nodeValue || '');
          const trimmed = value.trim();
          if (trimmed) {
            const translated = translateText(trimmed, locale);
            if (translated && translated !== trimmed) {
              next.nodeValue = value.replace(trimmed, translated);
            }
          }
          textNode = walker.nextNode();
        }
      }
      if (!(target instanceof Element || target instanceof Document || target instanceof ShadowRoot)) return;
      const elements = target instanceof Element ? [target, ...target.querySelectorAll('*')] : Array.from(target.querySelectorAll ? target.querySelectorAll('*') : []);
      for (const el of elements) {
        if (!(el instanceof Element)) continue;
        for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
          const value = el.getAttribute(attr);
          if (!value) continue;
          const translated = translateText(value, locale);
          if (translated !== value) el.setAttribute(attr, translated);
        }
        if (el.shadowRoot) visitNode(el.shadowRoot);
      }
    }

    visitNode(root);
  }

  const API = Object.freeze({
    version: VERSION,
    LOCALE_MODE_AUTO,
    LOCALE_MODE_ZH_CN,
    LOCALE_MODE_EN,
    RESOLVED_LOCALE_ZH,
    RESOLVED_LOCALE_EN,
    normalizeLocaleMode,
    detectLocale,
    resolveLocale,
    isChineseLocale,
    translateText,
    translate,
    localizeTree
  });

  try {
    const prev = globalThis[API_KEY];
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= VERSION) return;
  } catch {}

  try {
    Object.defineProperty(globalThis, API_KEY, {
      value: API,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[API_KEY] = API;
    } catch {}
  }
})();
