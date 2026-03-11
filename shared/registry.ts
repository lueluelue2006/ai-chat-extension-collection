(() => {
  'use strict';

  // Single source of truth for site/module metadata used by Options + Popup UI.
  // Keep this data-only (no chrome APIs) so it can also be loaded by dev scripts.
  const REGISTRY_VERSION = 1;

  const SITES = [
    { id: 'common', name: '通用', sub: '全部站点', matchPatterns: [], modules: ['hide_disclaimer'] },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      sub: 'chatgpt.com',
      matchPatterns: ['https://chatgpt.com/*'],
      modules: [
        'quicknav',
        'chatgpt_tab_queue',
        'openai_new_model_banner',
        'chatgpt_perf',
        'chatgpt_thinking_toggle',
        'cmdenter_send',
        'chatgpt_readaloud_speed_controller',
        'chatgpt_usage_monitor',
        'chatgpt_reply_timer',
        'chatgpt_download_file_fix',
        'chatgpt_strong_highlight_lite',
        'chatgpt_quick_deep_search',
        'chatgpt_hide_feedback_buttons',
        'chatgpt_tex_copy_quote',
        'chatgpt_export_conversation',
        'chatgpt_image_message_edit',
        'chatgpt_canvas_enhancements',
        'chatgpt_message_tree',
        'chatgpt_sidebar_header_fix'
      ]
    },
    {
      id: 'google_search',
      name: 'Google 搜索',
      sub: 'google.com 搜索页',
      matchPatterns: ['https://www.google.com/*'],
      modules: ['google_ask_gpt']
    },
    {
      id: 'genspark',
      name: 'Genspark',
      sub: 'genspark.ai/agents',
      matchPatterns: ['https://www.genspark.ai/*'],
      quicknavPatterns: ['https://www.genspark.ai/agents*'],
      modules: [
        'quicknav',
        'cmdenter_send',
        'genspark_moa_image_autosettings',
        'genspark_credit_balance',
        'genspark_codeblock_fold',
        'genspark_inline_upload_fix',
        'genspark_force_sonnet45_thinking'
      ]
    },
    {
      id: 'grok',
      name: 'Grok',
      sub: 'grok.com',
      matchPatterns: ['https://grok.com/*'],
      quicknavPatterns: ['https://grok.com/c/*'],
      modules: ['quicknav', 'cmdenter_send', 'grok_rate_limit_display', 'grok_trash_cleanup']
    },
    {
      id: 'gemini_app',
      name: 'Gemini App',
      sub: 'gemini.google.com/app',
      matchPatterns: ['https://gemini.google.com/*'],
      quicknavPatterns: ['https://gemini.google.com/app*'],
      modules: ['quicknav', 'cmdenter_send']
    },
    {
      id: 'kimi',
      name: 'Kimi',
      sub: 'kimi.com',
      matchPatterns: ['https://kimi.com/*', 'https://www.kimi.com/*'],
      modules: ['quicknav', 'cmdenter_send']
    },
    {
      id: 'qwen',
      name: 'Qwen',
      sub: 'chat.qwen.ai',
      matchPatterns: ['https://chat.qwen.ai/*'],
      modules: ['quicknav', 'cmdenter_send', 'qwen_thinking_toggle']
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      sub: 'chat.deepseek.com',
      matchPatterns: ['https://chat.deepseek.com/*'],
      modules: ['quicknav', 'cmdenter_send']
    },
    {
      id: 'ernie',
      name: '文心一言',
      sub: 'ernie.baidu.com',
      matchPatterns: ['https://ernie.baidu.com/*'],
      modules: ['quicknav', 'cmdenter_send']
    },
    {
      id: 'zai',
      name: 'GLM',
      sub: 'chat.z.ai',
      matchPatterns: ['https://chat.z.ai/*'],
      modules: ['quicknav', 'cmdenter_send']
    }
  ];

  const MODULES = {
    hide_disclaimer: {
      id: 'hide_disclaimer',
      name: '隐藏免责声明/提示条',
      sub: '自动隐藏“AI 可能会犯错/数据使用”等提示条',
      defaultEnabled: true,
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
	    quicknav: {
	      id: 'quicknav',
	      name: 'QuickNav',
	      sub: '对话导航 / 📌 标记 / 收藏 / 防自动滚动',
	      defaultEnabled: true,
	      hotkeys: ['⌘↑/⌘↓', '⌥↑/⌥↓', '⌥/'],
	      menuPreview: ['重置问题栏位置', '清理过期检查点（30天）', '清理无效收藏'],
	      authors: ['lueluelue2006（原始脚本 / MV3 扩展封装/改造）', 'loongphy（暗色模式+回弹补丁）'],
	      license: 'MIT（上游脚本声明）',
	      upstream: 'https://github.com/lueluelue2006/ChatGPT-QuickNav'
	    },
    chatgpt_perf: {
      id: 'chatgpt_perf',
      name: 'ChatGPT 性能优化',
      sub: '离屏虚拟化 + CSS contain',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    openai_new_model_banner: {
      id: 'openai_new_model_banner',
      name: 'OpenAI 新模型横幅提示',
      sub: '监控到资源可访问时，在网页内显示大横幅（避免系统通知被屏蔽）',
      defaultEnabled: true,
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_thinking_toggle: {
      id: 'chatgpt_thinking_toggle',
      name: 'ChatGPT 推理强度/模型 快捷切换',
      sub: '⌘O 推理强度 / ⌘J 模型切换',
      defaultEnabled: true,
      hotkeys: ['⌘O', '⌘J'],
      hotkeyControls: [
        { key: 'chatgpt_thinking_toggle_hotkey_effort', label: '⌘O' },
        { key: 'chatgpt_thinking_toggle_hotkey_model', label: '⌘J' }
      ],
      hotkeyPolicy: {
        profile: 'requires_meta_key',
        forceKey: 'chatgpt_thinking_toggle_hotkeys_force'
      },
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    cmdenter_send: {
      id: 'cmdenter_send',
      name: '⌘Enter 发送（Enter 换行）',
      sub: 'Enter/Shift+Enter 换行（强制）',
      defaultEnabled: true,
      hotkeys: ['⌘Enter', 'Ctrl+Enter'],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    qwen_thinking_toggle: {
      id: 'qwen_thinking_toggle',
      name: 'Qwen 模型/推理 快捷切换',
      sub: '⌘O Thinking/Fast / ⌘J 模型切换',
      defaultEnabled: true,
      hotkeys: ['⌘O', '⌘J'],
      hotkeyControls: [{ key: 'qwen_thinking_toggle_hotkeys', label: '⌘O / ⌘J' }],
      hotkeyPolicy: {
        profile: 'requires_meta_key',
        forceKey: 'qwen_thinking_toggle_hotkeys_force'
      },
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    grok_rate_limit_display: {
      id: 'grok_rate_limit_display',
      name: 'Grok 剩余额度显示',
      sub: '仅显示 all 积分余量（发送后更新）',
      hotkeys: [],
      authors: ['Blankspeaker'],
      license: '许可证未声明'
    },
    grok_trash_cleanup: {
      id: 'grok_trash_cleanup',
      name: 'Grok 废纸篓一键清空',
      sub: '在 deleted-conversations 页面右上角提供“清空废纸篓”按钮（不可恢复）',
      defaultEnabled: true,
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_readaloud_speed_controller: {
      id: 'chatgpt_readaloud_speed_controller',
      name: 'ChatGPT 朗读速度控制器',
      sub: '控制 ChatGPT 朗读音频播放速度（0.01–100x）',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_usage_monitor: {
      id: 'chatgpt_usage_monitor',
      name: 'ChatGPT 用量统计',
      sub: '仅记录用量（不在页面注入悬浮窗）；Deep/Legacy Research 不计入；在配置页查看/导入/导出/清空，并支持旧版月度 HTML 报告',
      hotkeys: [],
      authors: ['GitHub tizee'],
      license: 'MIT',
      upstream: 'https://github.com/tizee-tampermonkey-scripts/tampermonkey-chatgpt-model-usage-monitor'
    },
    chatgpt_reply_timer: {
      id: 'chatgpt_reply_timer',
      name: 'ChatGPT 回复计时器',
      sub: '统计从发送到回复完成的耗时（右下角极简数字）',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_download_file_fix: {
      id: 'chatgpt_download_file_fix',
      name: 'ChatGPT 下载修复',
      sub: '修复文件下载失败（sandbox_path 解码）',
      hotkeys: [],
      authors: ['pengzhile(linux.do)'],
      license: '许可证未声明'
    },
    chatgpt_strong_highlight_lite: {
      id: 'chatgpt_strong_highlight_lite',
      name: 'ChatGPT 回复粗体高亮（Lite）',
      sub: '高亮粗体 + 隐藏免责声明',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_quick_deep_search: {
      id: 'chatgpt_quick_deep_search',
      name: '快捷深度搜索（译/搜/思）',
      sub: '仅快捷键：Ctrl+S（搜）/ Ctrl+T（思）/ Ctrl+Y|Ctrl+Z（译）',
      defaultEnabled: true,
      hotkeys: ['Ctrl+S', 'Ctrl+T', 'Ctrl+Y', 'Ctrl+Z'],
      hotkeyControls: [{ key: 'chatgpt_quick_deep_search_hotkeys', label: 'Ctrl+S / Ctrl+T / Ctrl+Y / Ctrl+Z' }],
      hotkeyPolicy: {
        profile: 'prefer_meta_key',
        forceKey: 'chatgpt_quick_deep_search_hotkeys_force'
      },
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_tab_queue: {
      id: 'chatgpt_tab_queue',
      name: 'ChatGPT Tab 队列发送',
      sub: 'Tab 排队发送 / ⌥↑ 取回最近一条 / Ctrl+C 清空输入框（仅有 Meta 键时）',
      defaultEnabled: true,
      hotkeys: ['Tab', '⌥↑', 'Ctrl+C'],
      hotkeyControls: [
        { key: 'chatgpt_tab_queue_ctrl_c_clear', label: 'Ctrl+C 清空输入框' }
      ],
      hotkeyPolicy: {
        profile: 'requires_meta_key'
      },
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_hide_feedback_buttons: {
      id: 'chatgpt_hide_feedback_buttons',
      name: 'ChatGPT 隐藏点赞/点踩',
      sub: '隐藏回复下方反馈按钮（👍/👎）',
      hotkeys: [],
      authors: ['zhong_little(linux.do)'],
      license: '许可证未声明'
    },
    chatgpt_tex_copy_quote: {
      id: 'chatgpt_tex_copy_quote',
      name: 'ChatGPT TeX Copy & Quote',
      sub: '复制/引用含 KaTeX 的选区时优先还原 LaTeX，并支持悬停提示/双击复制',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later',
      upstream: 'https://github.com/lueluelue2006/ChatGPT-Better-TeX-Quote'
    },
    chatgpt_export_conversation: {
      id: 'chatgpt_export_conversation',
      name: 'ChatGPT 对话导出（新版 UI）',
      sub: '按页面当前可见分支导出（会话 mapping，含图片链接）；不可判定时回退 current_node，再兜底当前可见导出',
      hotkeys: [],
      menuPreview: ['导出为 Markdown', '导出为 HTML'],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_image_message_edit: {
      id: 'chatgpt_image_message_edit',
      name: 'ChatGPT 消息分叉编辑（可加图）',
      sub: '给用户消息增加“分叉编辑”按钮：在输入框里编辑并可补图/文件；与原生编辑共存',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_canvas_enhancements: {
      id: 'chatgpt_canvas_enhancements',
      name: 'Canvas Enhancements',
      sub: '在 Writing/Canvas 卡片左上角显示 Canvas ID（512xx）/ textdoc Canvas 短编号（5位），不覆盖原生行为',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_message_tree: {
      id: 'chatgpt_message_tree',
      name: 'ChatGPT 消息树',
      sub: '显示当前对话的完整消息树/分支结构（右侧面板），并支持导出完整树 JSON',
      hotkeys: [],
      menuPreview: ['导出完整树为 JSON'],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    chatgpt_sidebar_header_fix: {
      id: 'chatgpt_sidebar_header_fix',
      name: 'ChatGPT 顶部按钮布局修复',
      sub: '修复侧边栏顶部按钮交换；并将右上角群聊/临时聊天按钮移到模型选择器右侧',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    google_ask_gpt: {
      id: 'google_ask_gpt',
      name: 'Google 搜索问 GPT',
      sub: '在 Google 搜索框旁加“问 GPT”：跳到 ChatGPT 5.4 Thinking 并自动发起联网搜索提问',
      defaultEnabled: true,
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    genspark_moa_image_autosettings: {
      id: 'genspark_moa_image_autosettings',
      name: 'Genspark 绘图默认设置',
      sub: '进入绘图页自动打开 Setting，并选择 2K 画质',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    genspark_credit_balance: {
      id: 'genspark_credit_balance',
      name: 'Genspark 积分余量',
      sub: '悬停小蓝点显示积分信息（可刷新/折叠/拖动）',
      hotkeys: [],
      authors: ['悟空(linux.do)'],
      license: '许可证未声明'
    },
    genspark_codeblock_fold: {
      id: 'genspark_codeblock_fold',
      name: 'Genspark 长代码块折叠',
      sub: '自动折叠长代码块并提供 展开/收起 按钮（仅 AI Chat 页）',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    },
    genspark_inline_upload_fix: {
      id: 'genspark_inline_upload_fix',
      name: 'Genspark 消息编辑上传修复',
      sub: '修复消息编辑（铅笔）里的附件上传：Cmd+V 粘贴图片/文件；📎打开文件选择器',
      hotkeys: [],
      authors: ['lueluelue2006（原始脚本 / MV3 集成）'],
      license: 'GPL-3.0-or-later'
    },
    genspark_force_sonnet45_thinking: {
      id: 'genspark_force_sonnet45_thinking',
      name: 'Genspark Claude Thinking 强制切换',
      sub: '仅对 Sonnet 4.5 启用 thinking 强制切换，并显示可折叠思考块',
      defaultEnabled: true,
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: 'GPL-3.0-or-later'
    }
  };

  const MODULE_ID_ALIASES = Object.freeze({
    chatgpt_cmdenter_send: 'cmdenter_send'
  });

  const freezeArrayShallow = (arr: unknown): ReadonlyArray<unknown> => {
    if (!Array.isArray(arr)) return Object.freeze([]);
    for (const v of arr) {
      const item = v as Record<string, unknown>;
      try {
        if (item && typeof item === 'object' && Array.isArray(item.modules)) Object.freeze(item.modules);
      } catch {}
      try {
        if (item && typeof item === 'object' && Array.isArray(item.matchPatterns)) Object.freeze(item.matchPatterns);
      } catch {}
      try {
        if (item && typeof item === 'object' && Array.isArray(item.quicknavPatterns)) Object.freeze(item.quicknavPatterns);
      } catch {}
      try { Object.freeze(v); } catch {}
    }
    return Object.freeze(arr);
  };

  const freezeRecordShallow = (obj: unknown): Readonly<Record<string, unknown>> => {
    if (!obj || typeof obj !== 'object') return Object.freeze({});
    const record = obj as Record<string, unknown>;
    for (const k of Object.keys(record)) {
      const v = record[k] as Record<string, unknown> | undefined;
      try {
        if (v && typeof v === 'object') {
          if (Array.isArray(v.hotkeys)) Object.freeze(v.hotkeys);
          if (Array.isArray(v.hotkeyControls)) {
            for (const control of v.hotkeyControls) {
              try { Object.freeze(control); } catch {}
            }
            Object.freeze(v.hotkeyControls);
          }
          if (Array.isArray(v.menuPreview)) Object.freeze(v.menuPreview);
          if (Array.isArray(v.authors)) Object.freeze(v.authors);
          if (v.hotkeyPolicy && typeof v.hotkeyPolicy === 'object') Object.freeze(v.hotkeyPolicy);
        }
      } catch {}
      try { Object.freeze(v); } catch {}
    }
    return Object.freeze(record);
  };

  const REGISTRY = Object.freeze({
    version: REGISTRY_VERSION,
    sites: freezeArrayShallow(SITES),
    modules: freezeRecordShallow(MODULES),
    moduleAliases: MODULE_ID_ALIASES
  });

  try {
    const prev = (globalThis as typeof globalThis & {
      AISHORTCUTS_REGISTRY?: { version?: unknown };
    }).AISHORTCUTS_REGISTRY;
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= REGISTRY_VERSION) return;
  } catch {}

  try {
    Object.defineProperty(globalThis, 'AISHORTCUTS_REGISTRY', {
      value: REGISTRY,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      (globalThis as typeof globalThis & { AISHORTCUTS_REGISTRY?: unknown }).AISHORTCUTS_REGISTRY = REGISTRY;
    } catch {}
  }
})();
