(() => {
  const registry = globalThis.__aiShortcutsOptionsModuleSettingsRegistryV1__;
  if (!registry || typeof registry !== 'object' || typeof registry.register !== 'function') return;

  registry.register([
    { moduleId: 'chatgpt_tab_queue', renderer: 'chatgptTabQueue' },
    { moduleId: 'chatgpt_perf', renderer: 'chatgptPerf' },
    { moduleId: 'chatgpt_thinking_toggle', renderer: 'chatgptThinkingToggle' },
    { moduleId: 'chatgpt_readaloud_speed_controller', renderer: 'chatgptReadaloudSpeedController' },
    { moduleId: 'chatgpt_usage_monitor', renderer: 'chatgptUsageMonitor' },
    { moduleId: 'chatgpt_reply_timer', renderer: 'chatgptReplyTimer' },
    { moduleId: 'chatgpt_download_file_fix', renderer: 'chatgptDownloadFileFix' },
    { moduleId: 'chatgpt_strong_highlight_lite', renderer: 'chatgptStrongHighlightLite' },
    { moduleId: 'chatgpt_quick_deep_search', renderer: 'chatgptQuickDeepSearch' },
    { moduleId: 'chatgpt_hide_feedback_buttons', renderer: 'chatgptHideFeedbackButtons' },
    { moduleId: 'chatgpt_tex_copy_quote', renderer: 'chatgptTexCopyQuote' },
    { moduleId: 'chatgpt_export_conversation', renderer: 'chatgptExportConversation' },
    { moduleId: 'chatgpt_image_message_edit', renderer: 'chatgptImageMessageEdit' },
    { moduleId: 'chatgpt_message_tree', renderer: 'chatgptMessageTree' }
  ]);
})();
