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
    { moduleId: 'qwen_thinking_toggle', renderer: 'basicToggle' },
    { moduleId: 'chatgpt_sidebar_header_fix', renderer: 'basicToggle' },
    { moduleId: 'genspark_codeblock_fold', renderer: 'basicToggle' },
    {
      moduleId: 'genspark_force_sonnet45_thinking',
      renderer: 'basicToggle',
      hintText: '说明：在 Genspark AI Chat 中将 Sonnet 4.5 自动改为 thinking 版本，并在回复区内联显示“可展开思考块（默认仅最后 5 行）”。'
    }
  ]);
})();
