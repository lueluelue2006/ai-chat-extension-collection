(() => {
  const registry = globalThis.__aiShortcutsOptionsModuleSettingsRegistryV1__;
  if (!registry || typeof registry !== 'object' || typeof registry.register !== 'function') return;

  registry.register([
    { moduleId: 'quicknav', renderer: 'quicknav' },
    { moduleId: 'hide_disclaimer', renderer: 'basicToggle' },
    {
      moduleId: 'openai_new_model_banner',
      renderer: 'basicToggle',
      hintText: '说明：URL 列表请在下方“OpenAI 新模型监控”卡片维护；清空并保存空列表会停止检测/提醒。'
    },
    { moduleId: 'cmdenter_send', renderer: 'cmdEnterSend' },
    { moduleId: 'qwen_thinking_toggle', renderer: 'qwenThinkingToggle' },
    {
      moduleId: 'google_ask_gpt',
      renderer: 'basicToggle',
      hintText: '说明：仅在 Google 搜索页显示“问 GPT”按钮；点击后会新开 ChatGPT，并自动发起联网搜索提问。'
    },
    { moduleId: 'chatgpt_sidebar_header_fix', renderer: 'basicToggle' },
    {
      moduleId: 'chatgpt_canvas_enhancements',
      renderer: 'basicToggle',
      hintText: '说明：仅在页面出现 Writing/Canvas 卡片时才会读取对话 mapping，用于在左上角显示 Canvas ID。'
    },
    { moduleId: 'genspark_codeblock_fold', renderer: 'basicToggle' },
    {
      moduleId: 'genspark_force_sonnet45_thinking',
      renderer: 'basicToggle',
      hintText:
        '说明：兼容旧版 Genspark AI Chat 的 Sonnet 4.5 thinking 请求改写。该模块默认开启，但只会改写已知 Sonnet 4.5 模型，并在回复区内联显示“可展开思考块（默认仅最后 5 行）”。'
    }
  ]);
})();
