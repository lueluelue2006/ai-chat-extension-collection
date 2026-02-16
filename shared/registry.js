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
        'openai_new_model_banner',
        'chatgpt_perf',
        'chatgpt_thinking_toggle',
        'chatgpt_cmdenter_send',
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
        'chatgpt_message_tree',
        'chatgpt_sidebar_header_fix'
      ]
    },
    { id: 'qwen', name: 'Qwen', sub: 'chat.qwen.ai', matchPatterns: ['https://chat.qwen.ai/*'], modules: ['quicknav', 'chatgpt_cmdenter_send'] }
  ];

  const MODULES = {
    hide_disclaimer: {
      id: 'hide_disclaimer',
      name: '隐藏免责声明/提示条',
      sub: '自动隐藏“AI 可能会犯错/数据使用”等提示条',
      defaultEnabled: true,
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
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
      license: '未标注（内部脚本）'
    },
    openai_new_model_banner: {
      id: 'openai_new_model_banner',
      name: 'OpenAI 新模型横幅提示',
      sub: '监控到资源可访问时，在网页内显示大横幅（避免系统通知被屏蔽）',
      defaultEnabled: true,
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    chatgpt_thinking_toggle: {
      id: 'chatgpt_thinking_toggle',
      name: 'ChatGPT 推理强度/模型 快捷切换',
      sub: '⌘O 推理强度 / ⌘J 模型切换',
      defaultEnabled: true,
      hotkeys: ['⌘O', '⌘J'],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    chatgpt_cmdenter_send: {
      id: 'chatgpt_cmdenter_send',
      name: '⌘Enter 发送（Enter 换行）',
      sub: 'Enter/Shift+Enter 换行（强制）',
      defaultEnabled: true,
      hotkeys: ['⌘Enter', 'Ctrl+Enter'],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    grok_fast_unlock: {
      id: 'grok_fast_unlock',
      name: 'Grok 4 Fast 菜单项',
      sub: '在模型菜单增加 “Grok 4 Fast”，并在发送时选用该模型',
      hotkeys: [],
      authors: ['MUTED64（原始脚本）', 'lueluelue2006（MV3 集成）'],
      license: '未标注（内部脚本）'
    },
    grok_rate_limit_display: {
      id: 'grok_rate_limit_display',
      name: 'Grok 剩余次数显示',
      sub: '在输入框附近显示 rate limit（剩余次数/等待时间）',
      hotkeys: [],
      authors: ["Blankspeaker（原始脚本；移植自 CursedAtom 的 chrome 扩展）", 'lueluelue2006（MV3 集成）'],
      license: '未标注（内部脚本）'
    },
    chatgpt_readaloud_speed_controller: {
      id: 'chatgpt_readaloud_speed_controller',
      name: 'ChatGPT 朗读速度控制器',
      sub: '控制 ChatGPT 朗读音频播放速度（0.01–100x）',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    chatgpt_usage_monitor: {
      id: 'chatgpt_usage_monitor',
      name: 'ChatGPT 用量统计',
      sub: '仅记录用量（不在页面注入悬浮窗）；在配置页查看/导入/导出/清空',
      hotkeys: [],
      authors: ['lueluelue2006（基于 tizee@Github 的实现移植）'],
      license: 'MIT',
      upstream: 'https://github.com/tizee-tampermonkey-scripts/tampermonkey-chatgpt-model-usage-monitor'
    },
    chatgpt_reply_timer: {
      id: 'chatgpt_reply_timer',
      name: 'ChatGPT 回复计时器',
      sub: '统计从发送到回复完成的耗时（右下角极简数字）',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    chatgpt_download_file_fix: {
      id: 'chatgpt_download_file_fix',
      name: 'ChatGPT 下载修复',
      sub: '修复文件下载失败（sandbox_path 解码）',
      hotkeys: [],
      authors: ['Marx@linux.do'],
      license: '未标注（内部脚本）'
    },
    chatgpt_strong_highlight_lite: {
      id: 'chatgpt_strong_highlight_lite',
      name: 'ChatGPT 回复粗体高亮（Lite）',
      sub: '高亮粗体 + 隐藏免责声明',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    chatgpt_quick_deep_search: {
      id: 'chatgpt_quick_deep_search',
      name: '快捷深度搜索（译/搜/思）',
      sub: '仅快捷键：Ctrl+S（搜）/ Ctrl+T（思）/ Ctrl+Y|Ctrl+Z（译）',
      defaultEnabled: true,
      hotkeys: ['Ctrl+S', 'Ctrl+T', 'Ctrl+Y', 'Ctrl+Z'],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    chatgpt_hide_feedback_buttons: {
      id: 'chatgpt_hide_feedback_buttons',
      name: 'ChatGPT 隐藏点赞/点踩',
      sub: '隐藏回复下方反馈按钮（👍/👎）',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
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
      sub: '一键导出当前对话为 Markdown / HTML（在扩展菜单里执行）',
      hotkeys: [],
      menuPreview: ['导出为 Markdown', '导出为 HTML'],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    chatgpt_image_message_edit: {
      id: 'chatgpt_image_message_edit',
      name: 'ChatGPT 消息分叉编辑（可加图）',
      sub: '给用户消息增加“分叉编辑”按钮：在输入框里编辑并可补图/文件；与原生编辑共存',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    chatgpt_message_tree: {
      id: 'chatgpt_message_tree',
      name: 'ChatGPT 消息树（只读）',
      sub: '显示当前对话的完整消息树/分支结构（右侧面板）',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    chatgpt_sidebar_header_fix: {
      id: 'chatgpt_sidebar_header_fix',
      name: 'ChatGPT 侧边栏顶部按钮修复',
      sub: '左上角永远是展开/收起侧边栏；展开时交换「收起侧边栏」与「Home/新建对话」的位置',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    gemini_math_fix: {
      id: 'gemini_math_fix',
      name: 'Gemini Business 数学修复',
      sub: 'KaTeX / inline math 修复',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    gemini_auto_3_pro: {
      id: 'gemini_auto_3_pro',
      name: 'Gemini Business 自动切换 3 Pro',
      sub: '自动将模型切换为 Gemini 3 Pro（可用时）；并隐藏 Gemini Business 的 disclaimer',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    genspark_moa_image_autosettings: {
      id: 'genspark_moa_image_autosettings',
      name: 'Genspark 绘图默认设置',
      sub: '进入绘图页自动打开 Setting，并选择 2K 画质',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    genspark_credit_balance: {
      id: 'genspark_credit_balance',
      name: 'Genspark 积分余量',
      sub: '悬停小蓝点显示积分信息（可刷新/折叠/拖动）',
      hotkeys: [],
      authors: ['LinuxDo 悟空（原始脚本）', 'lueluelue2006（MV3 集成）'],
      license: '未标注（内部脚本）'
    },
    genspark_codeblock_fold: {
      id: 'genspark_codeblock_fold',
      name: 'Genspark 长代码块折叠',
      sub: '自动折叠长代码块并提供 展开/收起 按钮（仅 AI Chat 页）',
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    },
    genspark_inline_upload_fix: {
      id: 'genspark_inline_upload_fix',
      name: 'Genspark 消息编辑上传修复',
      sub: '修复消息编辑（铅笔）里的附件上传：Cmd+V 粘贴图片/文件；📎打开文件选择器',
      hotkeys: [],
      authors: ['lueluelue2006（原始脚本 / MV3 集成）'],
      license: '未标注（内部脚本）'
    },
    genspark_force_sonnet45_thinking: {
      id: 'genspark_force_sonnet45_thinking',
      name: 'Genspark Sonnet 4.5 Thinking',
      sub: '自动将 claude-sonnet-4-5 改为 claude-sonnet-4-5-thinking，并显示可折叠思考块',
      defaultEnabled: true,
      hotkeys: [],
      authors: ['lueluelue2006'],
      license: '未标注（内部脚本）'
    }
  };

  const freezeArrayShallow = (arr) => {
    if (!Array.isArray(arr)) return Object.freeze([]);
    for (const v of arr) {
      try {
        if (v && typeof v === 'object' && Array.isArray(v.modules)) Object.freeze(v.modules);
      } catch {}
      try {
        if (v && typeof v === 'object' && Array.isArray(v.matchPatterns)) Object.freeze(v.matchPatterns);
      } catch {}
      try {
        if (v && typeof v === 'object' && Array.isArray(v.quicknavPatterns)) Object.freeze(v.quicknavPatterns);
      } catch {}
      try { Object.freeze(v); } catch {}
    }
    return Object.freeze(arr);
  };

  const freezeRecordShallow = (obj) => {
    if (!obj || typeof obj !== 'object') return Object.freeze({});
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      try {
        if (v && typeof v === 'object') {
          if (Array.isArray(v.hotkeys)) Object.freeze(v.hotkeys);
          if (Array.isArray(v.menuPreview)) Object.freeze(v.menuPreview);
          if (Array.isArray(v.authors)) Object.freeze(v.authors);
        }
      } catch {}
      try { Object.freeze(v); } catch {}
    }
    return Object.freeze(obj);
  };

  const REGISTRY = Object.freeze({
    version: REGISTRY_VERSION,
    sites: freezeArrayShallow(SITES),
    modules: freezeRecordShallow(MODULES)
  });

  try {
    const prev = globalThis.QUICKNAV_REGISTRY;
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= REGISTRY_VERSION) return;
  } catch {}

  try {
    Object.defineProperty(globalThis, 'QUICKNAV_REGISTRY', {
      value: REGISTRY,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis.QUICKNAV_REGISTRY = REGISTRY;
    } catch {}
  }
})();
