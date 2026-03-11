(() => {
  const registry = globalThis.__aiShortcutsOptionsModuleSettingsRegistryV1__;
  if (!registry || typeof registry !== 'object' || typeof registry.register !== 'function') return;

  registry.register([
    { moduleId: 'genspark_moa_image_autosettings', renderer: 'gensparkMoaImageAutosettings' },
    { moduleId: 'genspark_credit_balance', renderer: 'gensparkCreditBalance' },
    { moduleId: 'genspark_inline_upload_fix', renderer: 'gensparkInlineUploadFix' },
    { moduleId: 'grok_rate_limit_display', renderer: 'grokRateLimitDisplay' }
  ]);
})();
