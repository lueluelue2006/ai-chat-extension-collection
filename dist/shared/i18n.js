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
    '简体中文': 'Simplified Chinese',
    '自动': 'Auto',
    '我有 Meta 键': 'I have a Meta key',
    '我没有 Meta 键': 'I do not have a Meta key',
    '主题切换': 'Theme switcher',
    '亮色': 'Light',
    '暗色': 'Dark',
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
    '保存后会自动生效到已打开页面；若要彻底移除已注入内容，仍需手动刷新对应页面。': 'Changes take effect on already-open pages automatically. Refresh the page if you need to fully remove injected content.',
    '安装路径必须是 dist/ 目录；如果误加载源码根目录，可能出现“注入失败 / Receiving end does not exist”。': 'The install path must be the dist/ directory. Loading the repository root by mistake can cause injection failures or “Receiving end does not exist”.',
    '安装路径必须是': 'The install path must be',
    '安装路径必须是 ': 'The install path must be ',
    ' 目录；如果误加载源码根目录，可能出现“注入失败 / Receiving end does not exist”。': ' directory. Loading the repository root by mistake can cause injection failures or “Receiving end does not exist”.',
    '目录；如果误加载源码根目录，可能出现“注入失败 / Receiving end does not exist”。': 'directory. Loading the repository root by mistake can cause injection failures or “Receiving end does not exist”.',
    '先选网站，再选脚本并编辑细项设置。页面内所有变更都会直接写回当前配置。': 'Select a site first, then choose a script and edit its detailed settings. All changes on this page are written back immediately.',
    '自动检测当前键盘能力。': 'Automatically detect the current keyboard capability.',
    '无 Meta 键时，依赖 ⌘ 的快捷键会默认停用；Ctrl+S / T / Y / Z 这类冲突型快捷键也会默认停用。': 'Without a Meta key, ⌘-based hotkeys are disabled by default. Conflicting Ctrl+S / T / Y / Z hotkeys are also disabled by default.',
    '按站点切换。': 'Switch by site.',
    '通用 · 全部站点': 'Common · All supported sites',
    '通用（全部站点）': 'Common (all supported sites)',
    '启用 通用': 'Enable Common',
    '选择网站后查看该站点脚本。': 'Choose a site to view its scripts.',
    '右侧面板显示模块说明、开关和额外操作。': 'The right panel shows module info, toggles, and extra actions.',
    '提示：设置变更会自动生效；关闭某个模块后，已打开页面一般仍需刷新才会完全停用。': 'Tip: setting changes apply automatically. If you disable a module, already-open pages usually still need a refresh to fully stop it.',
    '提示：关闭模块后，已打开页面一般需要刷新才会完全停用。': 'Tip: after disabling a module, already-open pages usually need a refresh to fully stop it.',
    '默认每 1 小时请求一次下方每个 URL（目前仅支持 developers.openai.com/images/api/models/icons/...）；只要检测到可用资源（非 404）就会提醒你（系统通知 + 扩展角标 + ChatGPT 页内横幅）。要停止提醒，请删除全部 URL 并保存（空列表会停用检测/提醒；横幅不会被点击关闭）。': 'Checks each URL below once per hour (currently only developers.openai.com/images/api/models/icons/...). As soon as a resource becomes available (non-404), you are notified through system notifications, badge updates, and an in-page ChatGPT banner. To stop alerts, delete all URLs and save. An empty list disables checks and alerts; the banner itself cannot be dismissed by clicking.',
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
    'ChatGPT 性能优化': 'ChatGPT performance optimization',
    '离屏虚拟化 + CSS contain': 'Offscreen virtualization + CSS contain',
    'OpenAI 新模型横幅提示': 'OpenAI new model banner',
    '监控到资源可访问时，在网页内显示大横幅（避免系统通知被屏蔽）': 'Show a large in-page banner when a monitored resource becomes available.',
    'ChatGPT 推理强度/模型 快捷切换': 'ChatGPT reasoning / model hotkeys',
    '⌘O 推理强度 / ⌘J 模型切换': '⌘O reasoning effort / ⌘J model switch',
    '⌘Enter 发送（Enter 换行）': '⌘Enter send (Enter inserts newline)',
    'Enter/Shift+Enter 换行（强制）': 'Force Enter / Shift+Enter to insert new lines',
    'Qwen 模型/推理 快捷切换': 'Qwen model / reasoning hotkeys',
    '⌘O Thinking/Fast / ⌘J 模型切换': '⌘O Thinking/Fast / ⌘J model switch',
    'Grok 剩余额度显示': 'Grok remaining quota',
    '仅显示 all 积分余量（发送后更新）': 'Show only the “all” quota bucket (updates after send)',
    'Grok 废纸篓一键清空': 'Grok trash cleanup',
    '在 deleted-conversations 页面右上角提供“清空废纸篓”按钮（不可恢复）': 'Adds a “Clear trash” button to the deleted-conversations page (irreversible).',
    'ChatGPT 朗读速度控制器': 'ChatGPT read-aloud speed controller',
    '控制 ChatGPT 朗读音频播放速度（0.01–100x）': 'Control ChatGPT read-aloud playback speed (0.01–100x).',
    'ChatGPT 用量统计': 'ChatGPT usage monitor',
    '仅记录用量（不在页面注入悬浮窗）；Deep/Legacy Research 不计入；在配置页查看/导入/导出/清空，并支持旧版月度 HTML 报告': 'Usage logging only (no in-page floating widget). Deep / Legacy Research is excluded. View/import/export/clear it from Options, with legacy monthly HTML reports supported.',
    'ChatGPT 回复计时器': 'ChatGPT reply timer',
    '统计从发送到回复完成的耗时（右下角极简数字）': 'Shows the time from send to completion as a small number at the bottom-right.',
    'ChatGPT 下载修复': 'ChatGPT download fix',
    '修复文件下载失败（sandbox_path 解码）': 'Fix file download failures by decoding sandbox_path.',
    'ChatGPT 回复粗体高亮（Lite）': 'ChatGPT bold highlight (Lite)',
    '高亮粗体 + 隐藏免责声明': 'Highlight bold text + hide disclaimer',
    '快捷深度搜索（译/搜/思）': 'Deep search hotkeys (translate/search/think)',
    '仅快捷键：Ctrl+S（搜）/ Ctrl+T（思）/ Ctrl+Y|Ctrl+Z（译）': 'Hotkeys only: Ctrl+S (search) / Ctrl+T (think) / Ctrl+Y|Ctrl+Z (translate)',
    'ChatGPT Tab 队列发送': 'ChatGPT Tab queue send',
    'Tab 排队发送 / ⌥↑ 取回最近一条 / Ctrl+C 清空输入框（仅有 Meta 键时）': 'Queue with Tab / restore latest with ⌥↑ / clear input with Ctrl+C (Meta keyboards only)',
    'Ctrl+C 清空输入框': 'Ctrl+C clear input',
    'ChatGPT 隐藏点赞/点踩': 'Hide ChatGPT feedback buttons',
    '隐藏回复下方反馈按钮（👍/👎）': 'Hide the feedback buttons under assistant replies (👍/👎).',
    '复制/引用含 KaTeX 的选区时优先还原 LaTeX，并支持悬停提示/双击复制': 'When copying or quoting a KaTeX selection, restore LaTeX first and support hover hints / double-click copy.',
    'ChatGPT 对话导出（新版 UI）': 'ChatGPT conversation export (new UI)',
    '按页面当前可见分支导出（会话 mapping，含图片链接）；不可判定时回退 current_node，再兜底当前可见导出': 'Export the currently visible branch (conversation mapping, including image links). Falls back to current_node, then to the visible branch when needed.',
    '导出为 Markdown': 'Export as Markdown',
    '导出为 HTML': 'Export as HTML',
    'ChatGPT 消息分叉编辑（可加图）': 'ChatGPT fork edit (with images)',
    '给用户消息增加“分叉编辑”按钮：在输入框里编辑并可补图/文件；与原生编辑共存': 'Adds a “fork edit” button to user messages so you can edit in the composer and attach images/files.',
    'Canvas Enhancements': 'Canvas Enhancements',
    '在 Writing/Canvas 卡片左上角显示 Canvas ID（512xx）/ textdoc Canvas 短编号（5位），不覆盖原生行为': 'Show Canvas IDs in the top-left corner of Writing/Canvas cards without overriding native behavior.',
    'ChatGPT 消息树': 'ChatGPT message tree',
    '显示当前对话的完整消息树/分支结构（右侧面板），并支持导出完整树 JSON': 'Show the full message tree / branch structure for the current conversation in a right-side panel, with JSON export.',
    '导出完整树为 JSON': 'Export full tree as JSON',
    'ChatGPT 顶部按钮布局修复': 'ChatGPT top-bar layout fix',
    '修复侧边栏顶部按钮交换；并将右上角群聊/临时聊天按钮移到模型选择器右侧': 'Fix swapped sidebar top buttons and move the group/temporary chat buttons beside the model selector.',
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
    '监控：': 'Monitor:',
    '开启（每 1 小时）': 'On (every 1 hour)',
    '下次：': 'Next:',
    '上次：': 'Last:',
    '上次': 'Last',
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
    [/^队列已暂停：当前处于 Extended Pro。$/, 'Queue paused: Extended Pro is currently active.'],
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
    [/^当前按“有 Meta 键”处理快捷键。$/, 'Hotkeys are currently handled as if a Meta key is available.'],
    [/^当前按“无 Meta 键”处理快捷键。$/, 'Hotkeys are currently handled as if no Meta key is available.'],
    [/^你已手动指定为“有 Meta 键”。$/, 'You manually set this device as having a Meta key.'],
    [/^你已手动指定为“无 Meta 键”。$/, 'You manually set this device as not having a Meta key.'],
    [/^共 (\d+) 个模型，(\d+) 条请求记录$/, '$1 models, $2 request records'],
    [/^已是最新版本：v(.+)$/, 'Already up to date: v$1'],
    [/^发现新版本：v(.+)$/, 'New version available: v$1'],
    [/^远端版本：v(.+)$/, 'Remote version: v$1'],
    [/^当前版本：v(.+)$/, 'Current version: v$1']
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
