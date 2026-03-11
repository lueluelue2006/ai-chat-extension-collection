(() => {
  "use strict";
  const REGISTRY_VERSION = 1;
  const SITES = [
    { id: "common", name: "\u901A\u7528", sub: "\u5168\u90E8\u7AD9\u70B9", matchPatterns: [], modules: ["hide_disclaimer"] },
    {
      id: "chatgpt",
      name: "ChatGPT",
      sub: "chatgpt.com",
      matchPatterns: ["https://chatgpt.com/*"],
      modules: [
        "quicknav",
        "chatgpt_tab_queue",
        "openai_new_model_banner",
        "chatgpt_perf",
        "chatgpt_thinking_toggle",
        "cmdenter_send",
        "chatgpt_readaloud_speed_controller",
        "chatgpt_usage_monitor",
        "chatgpt_reply_timer",
        "chatgpt_download_file_fix",
        "chatgpt_strong_highlight_lite",
        "chatgpt_quick_deep_search",
        "chatgpt_hide_feedback_buttons",
        "chatgpt_tex_copy_quote",
        "chatgpt_export_conversation",
        "chatgpt_image_message_edit",
        "chatgpt_canvas_enhancements",
        "chatgpt_message_tree",
        "chatgpt_sidebar_header_fix"
      ]
    },
    {
      id: "google_search",
      name: "Google \u641C\u7D22",
      sub: "google.com \u641C\u7D22\u9875",
      matchPatterns: ["https://www.google.com/*"],
      modules: ["google_ask_gpt"]
    },
    {
      id: "genspark",
      name: "Genspark",
      sub: "genspark.ai/agents",
      matchPatterns: ["https://www.genspark.ai/*"],
      quicknavPatterns: ["https://www.genspark.ai/agents*"],
      modules: [
        "quicknav",
        "cmdenter_send",
        "genspark_moa_image_autosettings",
        "genspark_credit_balance",
        "genspark_codeblock_fold",
        "genspark_inline_upload_fix",
        "genspark_force_sonnet45_thinking"
      ]
    },
    {
      id: "grok",
      name: "Grok",
      sub: "grok.com",
      matchPatterns: ["https://grok.com/*"],
      quicknavPatterns: ["https://grok.com/c/*"],
      modules: ["quicknav", "cmdenter_send", "grok_rate_limit_display", "grok_trash_cleanup"]
    },
    {
      id: "gemini_app",
      name: "Gemini App",
      sub: "gemini.google.com/app",
      matchPatterns: ["https://gemini.google.com/*"],
      quicknavPatterns: ["https://gemini.google.com/app*"],
      modules: ["quicknav", "cmdenter_send"]
    },
    {
      id: "kimi",
      name: "Kimi",
      sub: "kimi.com",
      matchPatterns: ["https://kimi.com/*", "https://www.kimi.com/*"],
      modules: ["quicknav", "cmdenter_send"]
    },
    {
      id: "qwen",
      name: "Qwen",
      sub: "chat.qwen.ai",
      matchPatterns: ["https://chat.qwen.ai/*"],
      modules: ["quicknav", "cmdenter_send", "qwen_thinking_toggle"]
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      sub: "chat.deepseek.com",
      matchPatterns: ["https://chat.deepseek.com/*"],
      modules: ["quicknav", "cmdenter_send"]
    },
    {
      id: "ernie",
      name: "\u6587\u5FC3\u4E00\u8A00",
      sub: "ernie.baidu.com",
      matchPatterns: ["https://ernie.baidu.com/*"],
      modules: ["quicknav", "cmdenter_send"]
    },
    {
      id: "zai",
      name: "GLM",
      sub: "chat.z.ai",
      matchPatterns: ["https://chat.z.ai/*"],
      modules: ["quicknav", "cmdenter_send"]
    }
  ];
  const MODULES = {
    hide_disclaimer: {
      id: "hide_disclaimer",
      name: "\u9690\u85CF\u514D\u8D23\u58F0\u660E/\u63D0\u793A\u6761",
      sub: "\u81EA\u52A8\u9690\u85CF\u201CAI \u53EF\u80FD\u4F1A\u72AF\u9519/\u6570\u636E\u4F7F\u7528\u201D\u7B49\u63D0\u793A\u6761",
      defaultEnabled: true,
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    quicknav: {
      id: "quicknav",
      name: "QuickNav",
      sub: "\u5BF9\u8BDD\u5BFC\u822A / \u{1F4CC} \u6807\u8BB0 / \u6536\u85CF / \u9632\u81EA\u52A8\u6EDA\u52A8",
      defaultEnabled: true,
      hotkeys: ["\u2318\u2191/\u2318\u2193", "\u2325\u2191/\u2325\u2193", "\u2325/"],
      menuPreview: ["\u91CD\u7F6E\u95EE\u9898\u680F\u4F4D\u7F6E", "\u6E05\u7406\u8FC7\u671F\u68C0\u67E5\u70B9\uFF0830\u5929\uFF09", "\u6E05\u7406\u65E0\u6548\u6536\u85CF"],
      authors: ["lueluelue2006\uFF08\u539F\u59CB\u811A\u672C / MV3 \u6269\u5C55\u5C01\u88C5/\u6539\u9020\uFF09", "loongphy\uFF08\u6697\u8272\u6A21\u5F0F+\u56DE\u5F39\u8865\u4E01\uFF09"],
      license: "MIT\uFF08\u4E0A\u6E38\u811A\u672C\u58F0\u660E\uFF09",
      upstream: "https://github.com/lueluelue2006/ChatGPT-QuickNav"
    },
    chatgpt_perf: {
      id: "chatgpt_perf",
      name: "ChatGPT \u6027\u80FD\u4F18\u5316",
      sub: "\u79BB\u5C4F\u865A\u62DF\u5316 + CSS contain",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    openai_new_model_banner: {
      id: "openai_new_model_banner",
      name: "OpenAI \u65B0\u6A21\u578B\u6A2A\u5E45\u63D0\u793A",
      sub: "\u76D1\u63A7\u5230\u8D44\u6E90\u53EF\u8BBF\u95EE\u65F6\uFF0C\u5728\u7F51\u9875\u5185\u663E\u793A\u5927\u6A2A\u5E45\uFF08\u907F\u514D\u7CFB\u7EDF\u901A\u77E5\u88AB\u5C4F\u853D\uFF09",
      defaultEnabled: true,
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_thinking_toggle: {
      id: "chatgpt_thinking_toggle",
      name: "ChatGPT \u63A8\u7406\u5F3A\u5EA6/\u6A21\u578B \u5FEB\u6377\u5207\u6362",
      sub: "\u2318O \u63A8\u7406\u5F3A\u5EA6 / \u2318J \u6A21\u578B\u5207\u6362",
      defaultEnabled: true,
      hotkeys: ["\u2318O", "\u2318J"],
      hotkeyControls: [
        { key: "chatgpt_thinking_toggle_hotkey_effort", label: "\u2318O" },
        { key: "chatgpt_thinking_toggle_hotkey_model", label: "\u2318J" }
      ],
      hotkeyPolicy: {
        profile: "requires_meta_key",
        forceKey: "chatgpt_thinking_toggle_hotkeys_force"
      },
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    cmdenter_send: {
      id: "cmdenter_send",
      name: "\u2318Enter \u53D1\u9001\uFF08Enter \u6362\u884C\uFF09",
      sub: "Enter/Shift+Enter \u6362\u884C\uFF08\u5F3A\u5236\uFF09",
      defaultEnabled: true,
      hotkeys: ["\u2318Enter", "Ctrl+Enter"],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    qwen_thinking_toggle: {
      id: "qwen_thinking_toggle",
      name: "Qwen \u6A21\u578B/\u63A8\u7406 \u5FEB\u6377\u5207\u6362",
      sub: "\u2318O Thinking/Fast / \u2318J \u6A21\u578B\u5207\u6362",
      defaultEnabled: true,
      hotkeys: ["\u2318O", "\u2318J"],
      hotkeyControls: [{ key: "qwen_thinking_toggle_hotkeys", label: "\u2318O / \u2318J" }],
      hotkeyPolicy: {
        profile: "requires_meta_key",
        forceKey: "qwen_thinking_toggle_hotkeys_force"
      },
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    grok_rate_limit_display: {
      id: "grok_rate_limit_display",
      name: "Grok \u5269\u4F59\u989D\u5EA6\u663E\u793A",
      sub: "\u4EC5\u663E\u793A all \u79EF\u5206\u4F59\u91CF\uFF08\u53D1\u9001\u540E\u66F4\u65B0\uFF09",
      hotkeys: [],
      authors: ["Blankspeaker"],
      license: "\u8BB8\u53EF\u8BC1\u672A\u58F0\u660E"
    },
    grok_trash_cleanup: {
      id: "grok_trash_cleanup",
      name: "Grok \u5E9F\u7EB8\u7BD3\u4E00\u952E\u6E05\u7A7A",
      sub: "\u5728 deleted-conversations \u9875\u9762\u53F3\u4E0A\u89D2\u63D0\u4F9B\u201C\u6E05\u7A7A\u5E9F\u7EB8\u7BD3\u201D\u6309\u94AE\uFF08\u4E0D\u53EF\u6062\u590D\uFF09",
      defaultEnabled: true,
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_readaloud_speed_controller: {
      id: "chatgpt_readaloud_speed_controller",
      name: "ChatGPT \u6717\u8BFB\u901F\u5EA6\u63A7\u5236\u5668",
      sub: "\u63A7\u5236 ChatGPT \u6717\u8BFB\u97F3\u9891\u64AD\u653E\u901F\u5EA6\uFF080.01\u2013100x\uFF09",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_usage_monitor: {
      id: "chatgpt_usage_monitor",
      name: "ChatGPT \u7528\u91CF\u7EDF\u8BA1",
      sub: "\u4EC5\u8BB0\u5F55\u7528\u91CF\uFF08\u4E0D\u5728\u9875\u9762\u6CE8\u5165\u60AC\u6D6E\u7A97\uFF09\uFF1BDeep/Legacy Research \u4E0D\u8BA1\u5165\uFF1B\u5728\u914D\u7F6E\u9875\u67E5\u770B/\u5BFC\u5165/\u5BFC\u51FA/\u6E05\u7A7A\uFF0C\u5E76\u652F\u6301\u65E7\u7248\u6708\u5EA6 HTML \u62A5\u544A",
      hotkeys: [],
      authors: ["GitHub tizee"],
      license: "MIT",
      upstream: "https://github.com/tizee-tampermonkey-scripts/tampermonkey-chatgpt-model-usage-monitor"
    },
    chatgpt_reply_timer: {
      id: "chatgpt_reply_timer",
      name: "ChatGPT \u56DE\u590D\u8BA1\u65F6\u5668",
      sub: "\u7EDF\u8BA1\u4ECE\u53D1\u9001\u5230\u56DE\u590D\u5B8C\u6210\u7684\u8017\u65F6\uFF08\u53F3\u4E0B\u89D2\u6781\u7B80\u6570\u5B57\uFF09",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_download_file_fix: {
      id: "chatgpt_download_file_fix",
      name: "ChatGPT \u4E0B\u8F7D\u4FEE\u590D",
      sub: "\u4FEE\u590D\u6587\u4EF6\u4E0B\u8F7D\u5931\u8D25\uFF08sandbox_path \u89E3\u7801\uFF09",
      hotkeys: [],
      authors: ["pengzhile(linux.do)"],
      license: "\u8BB8\u53EF\u8BC1\u672A\u58F0\u660E"
    },
    chatgpt_strong_highlight_lite: {
      id: "chatgpt_strong_highlight_lite",
      name: "ChatGPT \u56DE\u590D\u7C97\u4F53\u9AD8\u4EAE\uFF08Lite\uFF09",
      sub: "\u9AD8\u4EAE\u7C97\u4F53 + \u9690\u85CF\u514D\u8D23\u58F0\u660E",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_quick_deep_search: {
      id: "chatgpt_quick_deep_search",
      name: "\u5FEB\u6377\u6DF1\u5EA6\u641C\u7D22\uFF08\u8BD1/\u641C/\u601D\uFF09",
      sub: "\u4EC5\u5FEB\u6377\u952E\uFF1ACtrl+S\uFF08\u641C\uFF09/ Ctrl+T\uFF08\u601D\uFF09/ Ctrl+Y|Ctrl+Z\uFF08\u8BD1\uFF09",
      defaultEnabled: true,
      hotkeys: ["Ctrl+S", "Ctrl+T", "Ctrl+Y", "Ctrl+Z"],
      hotkeyControls: [{ key: "chatgpt_quick_deep_search_hotkeys", label: "Ctrl+S / Ctrl+T / Ctrl+Y / Ctrl+Z" }],
      hotkeyPolicy: {
        profile: "prefer_meta_key",
        forceKey: "chatgpt_quick_deep_search_hotkeys_force"
      },
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_tab_queue: {
      id: "chatgpt_tab_queue",
      name: "ChatGPT Tab \u961F\u5217\u53D1\u9001",
      sub: "Tab \u6392\u961F\u53D1\u9001 / \u2325\u2191 \u53D6\u56DE\u6700\u8FD1\u4E00\u6761 / Ctrl+C \u6E05\u7A7A\u8F93\u5165\u6846\uFF08\u4EC5\u6709 Meta \u952E\u65F6\uFF09",
      defaultEnabled: true,
      hotkeys: ["Tab", "\u2325\u2191", "Ctrl+C"],
      hotkeyControls: [
        { key: "chatgpt_tab_queue_ctrl_c_clear", label: "Ctrl+C \u6E05\u7A7A\u8F93\u5165\u6846" }
      ],
      hotkeyPolicy: {
        profile: "requires_meta_key"
      },
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_hide_feedback_buttons: {
      id: "chatgpt_hide_feedback_buttons",
      name: "ChatGPT \u9690\u85CF\u70B9\u8D5E/\u70B9\u8E29",
      sub: "\u9690\u85CF\u56DE\u590D\u4E0B\u65B9\u53CD\u9988\u6309\u94AE\uFF08\u{1F44D}/\u{1F44E}\uFF09",
      hotkeys: [],
      authors: ["zhong_little(linux.do)"],
      license: "\u8BB8\u53EF\u8BC1\u672A\u58F0\u660E"
    },
    chatgpt_tex_copy_quote: {
      id: "chatgpt_tex_copy_quote",
      name: "ChatGPT TeX Copy & Quote",
      sub: "\u590D\u5236/\u5F15\u7528\u542B KaTeX \u7684\u9009\u533A\u65F6\u4F18\u5148\u8FD8\u539F LaTeX\uFF0C\u5E76\u652F\u6301\u60AC\u505C\u63D0\u793A/\u53CC\u51FB\u590D\u5236",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later",
      upstream: "https://github.com/lueluelue2006/ChatGPT-Better-TeX-Quote"
    },
    chatgpt_export_conversation: {
      id: "chatgpt_export_conversation",
      name: "ChatGPT \u5BF9\u8BDD\u5BFC\u51FA\uFF08\u65B0\u7248 UI\uFF09",
      sub: "\u6309\u9875\u9762\u5F53\u524D\u53EF\u89C1\u5206\u652F\u5BFC\u51FA\uFF08\u4F1A\u8BDD mapping\uFF0C\u542B\u56FE\u7247\u94FE\u63A5\uFF09\uFF1B\u4E0D\u53EF\u5224\u5B9A\u65F6\u56DE\u9000 current_node\uFF0C\u518D\u515C\u5E95\u5F53\u524D\u53EF\u89C1\u5BFC\u51FA",
      hotkeys: [],
      menuPreview: ["\u5BFC\u51FA\u4E3A Markdown", "\u5BFC\u51FA\u4E3A HTML"],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_image_message_edit: {
      id: "chatgpt_image_message_edit",
      name: "ChatGPT \u6D88\u606F\u5206\u53C9\u7F16\u8F91\uFF08\u53EF\u52A0\u56FE\uFF09",
      sub: "\u7ED9\u7528\u6237\u6D88\u606F\u589E\u52A0\u201C\u5206\u53C9\u7F16\u8F91\u201D\u6309\u94AE\uFF1A\u5728\u8F93\u5165\u6846\u91CC\u7F16\u8F91\u5E76\u53EF\u8865\u56FE/\u6587\u4EF6\uFF1B\u4E0E\u539F\u751F\u7F16\u8F91\u5171\u5B58",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_canvas_enhancements: {
      id: "chatgpt_canvas_enhancements",
      name: "Canvas Enhancements",
      sub: "\u5728 Writing/Canvas \u5361\u7247\u5DE6\u4E0A\u89D2\u663E\u793A Canvas ID\uFF08512xx\uFF09/ textdoc Canvas \u77ED\u7F16\u53F7\uFF085\u4F4D\uFF09\uFF0C\u4E0D\u8986\u76D6\u539F\u751F\u884C\u4E3A",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_message_tree: {
      id: "chatgpt_message_tree",
      name: "ChatGPT \u6D88\u606F\u6811",
      sub: "\u663E\u793A\u5F53\u524D\u5BF9\u8BDD\u7684\u5B8C\u6574\u6D88\u606F\u6811/\u5206\u652F\u7ED3\u6784\uFF08\u53F3\u4FA7\u9762\u677F\uFF09\uFF0C\u5E76\u652F\u6301\u5BFC\u51FA\u5B8C\u6574\u6811 JSON",
      hotkeys: [],
      menuPreview: ["\u5BFC\u51FA\u5B8C\u6574\u6811\u4E3A JSON"],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    chatgpt_sidebar_header_fix: {
      id: "chatgpt_sidebar_header_fix",
      name: "ChatGPT \u9876\u90E8\u6309\u94AE\u5E03\u5C40\u4FEE\u590D",
      sub: "\u4FEE\u590D\u4FA7\u8FB9\u680F\u9876\u90E8\u6309\u94AE\u4EA4\u6362\uFF1B\u5E76\u5C06\u53F3\u4E0A\u89D2\u7FA4\u804A/\u4E34\u65F6\u804A\u5929\u6309\u94AE\u79FB\u5230\u6A21\u578B\u9009\u62E9\u5668\u53F3\u4FA7",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    google_ask_gpt: {
      id: "google_ask_gpt",
      name: "Google \u641C\u7D22\u95EE GPT",
      sub: "\u5728 Google \u641C\u7D22\u6846\u65C1\u52A0\u201C\u95EE GPT\u201D\uFF1A\u8DF3\u5230 ChatGPT 5.4 Thinking \u5E76\u81EA\u52A8\u53D1\u8D77\u8054\u7F51\u641C\u7D22\u63D0\u95EE",
      defaultEnabled: true,
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    genspark_moa_image_autosettings: {
      id: "genspark_moa_image_autosettings",
      name: "Genspark \u7ED8\u56FE\u9ED8\u8BA4\u8BBE\u7F6E",
      sub: "\u8FDB\u5165\u7ED8\u56FE\u9875\u81EA\u52A8\u6253\u5F00 Setting\uFF0C\u5E76\u9009\u62E9 2K \u753B\u8D28",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    genspark_credit_balance: {
      id: "genspark_credit_balance",
      name: "Genspark \u79EF\u5206\u4F59\u91CF",
      sub: "\u60AC\u505C\u5C0F\u84DD\u70B9\u663E\u793A\u79EF\u5206\u4FE1\u606F\uFF08\u53EF\u5237\u65B0/\u6298\u53E0/\u62D6\u52A8\uFF09",
      hotkeys: [],
      authors: ["LinuxDo \u609F\u7A7A"],
      license: "\u8BB8\u53EF\u8BC1\u672A\u58F0\u660E"
    },
    genspark_codeblock_fold: {
      id: "genspark_codeblock_fold",
      name: "Genspark \u957F\u4EE3\u7801\u5757\u6298\u53E0",
      sub: "\u81EA\u52A8\u6298\u53E0\u957F\u4EE3\u7801\u5757\u5E76\u63D0\u4F9B \u5C55\u5F00/\u6536\u8D77 \u6309\u94AE\uFF08\u4EC5 AI Chat \u9875\uFF09",
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    },
    genspark_inline_upload_fix: {
      id: "genspark_inline_upload_fix",
      name: "Genspark \u6D88\u606F\u7F16\u8F91\u4E0A\u4F20\u4FEE\u590D",
      sub: "\u4FEE\u590D\u6D88\u606F\u7F16\u8F91\uFF08\u94C5\u7B14\uFF09\u91CC\u7684\u9644\u4EF6\u4E0A\u4F20\uFF1ACmd+V \u7C98\u8D34\u56FE\u7247/\u6587\u4EF6\uFF1B\u{1F4CE}\u6253\u5F00\u6587\u4EF6\u9009\u62E9\u5668",
      hotkeys: [],
      authors: ["lueluelue2006\uFF08\u539F\u59CB\u811A\u672C / MV3 \u96C6\u6210\uFF09"],
      license: "GPL-3.0-or-later"
    },
    genspark_force_sonnet45_thinking: {
      id: "genspark_force_sonnet45_thinking",
      name: "Genspark Claude Thinking \u5F3A\u5236\u5207\u6362",
      sub: "\u4EC5\u5BF9 Sonnet 4.5 \u542F\u7528 thinking \u5F3A\u5236\u5207\u6362\uFF0C\u5E76\u663E\u793A\u53EF\u6298\u53E0\u601D\u8003\u5757",
      defaultEnabled: true,
      hotkeys: [],
      authors: ["lueluelue2006"],
      license: "GPL-3.0-or-later"
    }
  };
  const MODULE_ID_ALIASES = Object.freeze({
    chatgpt_cmdenter_send: "cmdenter_send"
  });
  const freezeArrayShallow = (arr) => {
    if (!Array.isArray(arr)) return Object.freeze([]);
    for (const v of arr) {
      const item = v;
      try {
        if (item && typeof item === "object" && Array.isArray(item.modules)) Object.freeze(item.modules);
      } catch {
      }
      try {
        if (item && typeof item === "object" && Array.isArray(item.matchPatterns)) Object.freeze(item.matchPatterns);
      } catch {
      }
      try {
        if (item && typeof item === "object" && Array.isArray(item.quicknavPatterns)) Object.freeze(item.quicknavPatterns);
      } catch {
      }
      try {
        Object.freeze(v);
      } catch {
      }
    }
    return Object.freeze(arr);
  };
  const freezeRecordShallow = (obj) => {
    if (!obj || typeof obj !== "object") return Object.freeze({});
    const record = obj;
    for (const k of Object.keys(record)) {
      const v = record[k];
      try {
        if (v && typeof v === "object") {
          if (Array.isArray(v.hotkeys)) Object.freeze(v.hotkeys);
          if (Array.isArray(v.hotkeyControls)) {
            for (const control of v.hotkeyControls) {
              try {
                Object.freeze(control);
              } catch {
              }
            }
            Object.freeze(v.hotkeyControls);
          }
          if (Array.isArray(v.menuPreview)) Object.freeze(v.menuPreview);
          if (Array.isArray(v.authors)) Object.freeze(v.authors);
          if (v.hotkeyPolicy && typeof v.hotkeyPolicy === "object") Object.freeze(v.hotkeyPolicy);
        }
      } catch {
      }
      try {
        Object.freeze(v);
      } catch {
      }
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
    const prev = globalThis.AISHORTCUTS_REGISTRY;
    if (prev && typeof prev === "object" && Number(prev.version || 0) >= REGISTRY_VERSION) return;
  } catch {
  }
  try {
    Object.defineProperty(globalThis, "AISHORTCUTS_REGISTRY", {
      value: REGISTRY,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis.AISHORTCUTS_REGISTRY = REGISTRY;
    } catch {
    }
  }
})();
