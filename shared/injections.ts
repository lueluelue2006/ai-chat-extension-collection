(() => {
  'use strict';

  // Data-only injection definitions shared by:
  // - background (service worker) for dynamic content script registration
  // - dev scripts for consistency checks
  //
  // No chrome APIs here.

  const INJECTIONS_VERSION = 1;
  type RegistryLike = { sites?: unknown; modules?: unknown } | null | undefined;
  type RegistryEntry = Record<string, unknown>;
  type DefaultSettings = {
    enabled: boolean;
    metaKeyMode: string;
    localeMode: string;
    sites: Record<string, boolean>;
    scrollLockDefaults: Record<string, boolean>;
    siteModules: Record<string, Record<string, boolean>>;
  };
  type ContentScriptDef = {
    id: string;
    siteId: string;
    moduleId: string;
    matches: string[];
    js: string[];
    css?: string[];
    runAt: string;
    world?: string;
    allFrames?: boolean;
  };

  const ISOLATED_BRIDGE_FILE = 'content/aishortcuts-bridge.js';
  const ISOLATED_LOCALE_BRIDGE_FILE = 'content/aishortcuts-locale-bridge.js';
  const MAIN_BRIDGE_FILE = 'content/aishortcuts-bridge-main.js';
  const MAIN_I18N_FILE = 'content/aishortcuts-i18n-main.js';
  const ISOLATED_SCOPE_FILE = 'content/aishortcuts-scope.js';
  const MAIN_SCOPE_FILE = 'content/aishortcuts-scope-main.js';
  const ISOLATED_BRIDGE_FILES = ['shared/i18n.js', ISOLATED_LOCALE_BRIDGE_FILE, ISOLATED_SCOPE_FILE, ISOLATED_BRIDGE_FILE] as const;
  const MAIN_BRIDGE_FILES = ['shared/i18n.js', MAIN_SCOPE_FILE, MAIN_BRIDGE_FILE, MAIN_I18N_FILE] as const;
  const QUICKNAV_KERNEL_FILES = [
    'content/aishortcuts-kernel/runtime-guards.js',
    'content/aishortcuts-kernel/route-watch.js',
    'content/aishortcuts-kernel/scrolllock-bridge.js',
    'content/aishortcuts-kernel/observer-refresh.js'
  ] as const;
  const CHATGPT_CORE_FILE = 'content/chatgpt-core.js';
  const CHATGPT_CORE_MAIN_FILE = 'content/chatgpt-core-main.js';
  const CHATGPT_CONVERSATION_GRAPH_FILE = 'content/chatgpt-conversation-graph.js';
  const CHATGPT_MAPPING_CLIENT_FILE = 'content/chatgpt-mapping-client/main.js';
  const CHATGPT_FETCH_HUB_FILE = 'content/chatgpt-fetch-hub/main.js';
  const CHATGPT_FETCH_HUB_CONSUMER_BASE_FILE = 'content/chatgpt-fetch-hub/consumer-base.js';
  const CHATGPT_FETCH_HUB_CONSUMER_FILES = [CHATGPT_FETCH_HUB_FILE, CHATGPT_FETCH_HUB_CONSUMER_BASE_FILE] as const;
  const MAIN_GUARD_FILE = 'content/scroll-guard-main.js';
  const GROK_DELETED_CONVERSATIONS_MATCHES = Object.freeze(['https://grok.com/deleted-conversations*']);
  const LEGACY_CONTENT_SCRIPT_IDS: string[] = [];
  // Extra host permissions needed by background tasks (not tied to content scripts).
  const EXTRA_HOST_PERMISSIONS = Object.freeze(['https://developers.openai.com/*']);

  // Extra boolean flags stored under `settings.siteModules[siteId]` that are NOT "modules"
  // (i.e. no separate content script injection), but need defaults and should be patchable.
  const EXTRA_SITE_MODULE_FLAGS: Readonly<Record<string, Readonly<Record<string, boolean>>>> = Object.freeze({
    chatgpt: Object.freeze({
      chatgpt_thinking_toggle_hotkey_effort: true,
      chatgpt_thinking_toggle_hotkey_model: true,
      chatgpt_thinking_toggle_hotkeys_force: false,
      chatgpt_quick_deep_search_hotkeys: true,
      chatgpt_quick_deep_search_hotkeys_force: false,
      chatgpt_tab_queue_queue_shortcut: true,
      chatgpt_tab_queue_ctrl_c_clear: true,
      chatgpt_tab_queue_quicknav_mark: true,
      chatgpt_quicknav_hide_native_outline: true
    }),
    qwen: Object.freeze({
      qwen_thinking_toggle_hotkeys: true,
      qwen_thinking_toggle_hotkeys_force: false
    })
  });

  function normalizeStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input.map((x) => String(x || '').trim()).filter(Boolean);
  }

  function uniq(arr: unknown[] | null | undefined): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of arr || []) {
      const s = String(v || '');
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  function getRegistrySites(registry: RegistryLike): RegistryEntry[] {
    const sites = registry && typeof registry === 'object' ? registry.sites : null;
    return Array.isArray(sites) ? (sites as RegistryEntry[]) : [];
  }

  function getRegistryModules(registry: RegistryLike): Record<string, RegistryEntry> {
    const mods = registry && typeof registry === 'object' ? registry.modules : null;
    return mods && typeof mods === 'object' ? (mods as Record<string, RegistryEntry>) : {};
  }

  function findSite(registry: RegistryLike, siteId: unknown): RegistryEntry | null {
    const id = String(siteId || '');
    if (!id) return null;
    return getRegistrySites(registry).find((s) => s && typeof s === 'object' && s.id === id) || null;
  }

  function siteMatchPatterns(registry: RegistryLike, siteId: unknown): string[] {
    const site = findSite(registry, siteId);
    return normalizeStringArray(site?.matchPatterns);
  }

  function siteQuickNavPatterns(registry: RegistryLike, siteId: unknown): string[] {
    const site = findSite(registry, siteId);
    const q = normalizeStringArray(site?.quicknavPatterns);
    if (q.length) return q;
    return siteMatchPatterns(registry, siteId);
  }

  function allNonCommonMatchPatterns(registry: RegistryLike): string[] {
    const patterns: string[] = [];
    for (const s of getRegistrySites(registry)) {
      const siteId = String(s?.id || '');
      if (!siteId || siteId === 'common') continue;
      patterns.push(...siteMatchPatterns(registry, siteId));
    }
    return uniq(patterns);
  }

  function moduleDefaultEnabled(registry: RegistryLike, moduleId: string): boolean {
    const mods = getRegistryModules(registry);
    const def = mods?.[moduleId];
    if (def && typeof def === 'object' && typeof def.defaultEnabled === 'boolean') return def.defaultEnabled;
    return true;
  }

  function buildDefaultSettings(registry: RegistryLike): DefaultSettings {
    const sites: Record<string, boolean> = {};
    const scrollLockDefaults: Record<string, boolean> = {};
    const siteModules: Record<string, Record<string, boolean>> = {};

    for (const s of getRegistrySites(registry)) {
      const siteId = String(s?.id || '');
      if (!siteId) continue;
      sites[siteId] = true;
      scrollLockDefaults[siteId] = true;
      siteModules[siteId] = {};

      const modules = Array.isArray(s?.modules) ? s.modules : [];
      for (const moduleId of modules) {
        const mid = String(moduleId || '');
        if (!mid) continue;
        siteModules[siteId][mid] = moduleDefaultEnabled(registry, mid);
      }

      const extra = EXTRA_SITE_MODULE_FLAGS?.[siteId];
      if (extra && typeof extra === 'object') {
        for (const [k, v] of Object.entries(extra)) {
          if (typeof v === 'boolean') siteModules[siteId][k] = v;
        }
      }
    }

    return {
      enabled: true,
      metaKeyMode: 'auto',
      localeMode: 'auto',
      sites,
      scrollLockDefaults,
      siteModules
    };
  }

  function buildContentScriptDefs(registry: RegistryLike): ContentScriptDef[] {
    const defs: ContentScriptDef[] = [];

    const allPatterns = allNonCommonMatchPatterns(registry);

    // Common modules (run on all supported sites).
    defs.push({
      id: 'quicknav_common_hide_disclaimer',
      siteId: 'common',
      moduleId: 'hide_disclaimer',
      matches: allPatterns,
      js: [...ISOLATED_BRIDGE_FILES, 'content/common-hide-disclaimer/main.js'],
      runAt: 'document_start'
    });

    // === QuickNav per site ===
    const QUICKNAV_SITES: Array<{ siteId: string; js: string; runAt: string; matches: (r: RegistryLike) => string[] }> = [
      { siteId: 'chatgpt', js: 'content/chatgpt-quicknav.js', runAt: 'document_start', matches: (r) => siteQuickNavPatterns(r, 'chatgpt') },
      { siteId: 'qwen', js: 'content/qwen-quicknav.js', runAt: 'document_end', matches: (r) => siteQuickNavPatterns(r, 'qwen') },
      { siteId: 'kimi', js: 'content/kimi-quicknav.js', runAt: 'document_end', matches: (r) => siteQuickNavPatterns(r, 'kimi') },
      { siteId: 'deepseek', js: 'content/deepseek-quicknav.js', runAt: 'document_end', matches: (r) => siteQuickNavPatterns(r, 'deepseek') },
      { siteId: 'gemini_app', js: 'content/gemini-app-quicknav.js', runAt: 'document_end', matches: (r) => siteQuickNavPatterns(r, 'gemini_app') },
      { siteId: 'ernie', js: 'content/ernie-quicknav.js', runAt: 'document_end', matches: (r) => siteQuickNavPatterns(r, 'ernie') },
      { siteId: 'zai', js: 'content/zai-quicknav.js', runAt: 'document_end', matches: (r) => siteQuickNavPatterns(r, 'zai') },
      { siteId: 'genspark', js: 'content/genspark-quicknav.js', runAt: 'document_end', matches: (r) => siteQuickNavPatterns(r, 'genspark') },
      { siteId: 'grok', js: 'content/grok-quicknav.js', runAt: 'document_end', matches: (r) => siteMatchPatterns(r, 'grok') }
    ];

    for (const s of QUICKNAV_SITES) {
      const siteId = s.siteId;
      const matches = uniq(s.matches(registry));

      defs.push({
        id: `quicknav_${siteId}`,
        siteId,
        moduleId: 'quicknav',
        matches,
        js:
          siteId === 'chatgpt'
            ? [
                ...ISOLATED_BRIDGE_FILES,
                CHATGPT_CORE_FILE,
                'content/ui-pos-drag.js',
                'content/menu-bridge.js',
                ...QUICKNAV_KERNEL_FILES,
                s.js
              ]
            : siteId === 'qwen'
              ? [
                  ...ISOLATED_BRIDGE_FILES,
                  'content/ui-pos-drag.js',
                  'content/menu-bridge.js',
                  'content/qwen-quicknav-active-lock.js',
                  'content/qwen-quicknav-route-gate.js',
                  ...QUICKNAV_KERNEL_FILES,
                  s.js
                ]
              : [...ISOLATED_BRIDGE_FILES, 'content/ui-pos-drag.js', 'content/menu-bridge.js', ...QUICKNAV_KERNEL_FILES, s.js],
        runAt: s.runAt
      });

      defs.push({
        id: `quicknav_scroll_guard_${siteId}`,
        siteId,
        moduleId: 'quicknav',
        matches,
        js: [...MAIN_BRIDGE_FILES, MAIN_GUARD_FILE],
        runAt: 'document_start',
        world: 'MAIN'
      });
    }

    // === Genspark extras ===
    const gensparkAll = uniq(siteMatchPatterns(registry, 'genspark'));
    const gensparkChat = uniq(siteQuickNavPatterns(registry, 'genspark'));

    if (gensparkAll.length) {
      defs.push({
        id: 'quicknav_genspark_moa_image_autosettings',
        siteId: 'genspark',
        moduleId: 'genspark_moa_image_autosettings',
        matches: gensparkAll,
        js: [...ISOLATED_BRIDGE_FILES, 'content/genspark-moa-image-autosettings/main.js'],
        runAt: 'document_start',
        allFrames: true
      });

      defs.push({
        id: 'quicknav_genspark_credit_balance',
        siteId: 'genspark',
        moduleId: 'genspark_credit_balance',
        matches: gensparkAll,
        js: [...ISOLATED_BRIDGE_FILES, 'content/genspark-credit-balance/main.js'],
        runAt: 'document_end'
      });
    }

    if (gensparkChat.length) {
      defs.push({
        id: 'quicknav_genspark_codeblock_fold',
        siteId: 'genspark',
        moduleId: 'genspark_codeblock_fold',
        matches: gensparkChat,
        js: [...ISOLATED_BRIDGE_FILES, 'content/genspark-codeblock-fold/main.js'],
        runAt: 'document_end'
      });

      defs.push({
        id: 'quicknav_genspark_inline_upload_fix',
        siteId: 'genspark',
        moduleId: 'genspark_inline_upload_fix',
        matches: gensparkChat,
        js: [...MAIN_BRIDGE_FILES, 'content/genspark-inline-upload-fix/main.js'],
        runAt: 'document_idle',
        world: 'MAIN'
      });

      defs.push({
        id: 'quicknav_genspark_force_sonnet45_thinking',
        siteId: 'genspark',
        moduleId: 'genspark_force_sonnet45_thinking',
        matches: gensparkChat,
        js: [...MAIN_BRIDGE_FILES, 'content/genspark-force-sonnet45-thinking/main.js'],
        runAt: 'document_start',
        world: 'MAIN'
      });
    }

    // === ChatGPT extras ===
    const chatgpt = siteMatchPatterns(registry, 'chatgpt');

    defs.push({
      id: 'quicknav_chatgpt_perf',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_perf',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-perf/content.js'],
      css: ['content/chatgpt-perf/content.css'],
      runAt: 'document_start'
    });

    defs.push({
      id: 'quicknav_chatgpt_openai_new_model_banner',
      siteId: 'chatgpt',
      moduleId: 'openai_new_model_banner',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, 'content/openai-new-model-banner/main.js'],
      runAt: 'document_end'
    });

    defs.push({
      id: 'quicknav_chatgpt_thinking_toggle_config',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_thinking_toggle',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-thinking-toggle/config-bridge.js'],
      runAt: 'document_start'
    });

    defs.push({
      id: 'quicknav_chatgpt_thinking_toggle',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_thinking_toggle',
      matches: chatgpt,
      js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, ...CHATGPT_FETCH_HUB_CONSUMER_FILES, 'content/chatgpt-thinking-toggle/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    });

    defs.push({
      id: 'quicknav_chatgpt_tab_queue_config',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_tab_queue',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-tab-queue/config-bridge.js'],
      runAt: 'document_start'
    });

    defs.push({
      id: 'quicknav_chatgpt_tab_queue',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_tab_queue',
      matches: chatgpt,
      js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, ...CHATGPT_FETCH_HUB_CONSUMER_FILES, 'content/chatgpt-tab-queue/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    });

    defs.push({
      id: 'quicknav_chatgpt_cmdenter_send',
      siteId: 'chatgpt',
      moduleId: 'cmdenter_send',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-cmdenter-send/main.js'],
      runAt: 'document_start'
    });

    defs.push({
      id: 'quicknav_chatgpt_sidebar_header_fix',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_sidebar_header_fix',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-sidebar-header-fix/main.js'],
      runAt: 'document_start'
    });

    const googleSearch = uniq(siteMatchPatterns(registry, 'google_search'));
    if (googleSearch.length) {
      defs.push({
        id: 'quicknav_google_search_ask_gpt_trigger',
        siteId: 'google_search',
        moduleId: 'google_ask_gpt',
        matches: googleSearch,
        js: [...ISOLATED_BRIDGE_FILES, 'content/google-ask-gpt/main.js'],
        runAt: 'document_end'
      });

      // This receiver is enabled by the Google-site toggle on purpose: the feature is a
      // cross-site handoff, but users should only need one switch in Options.
      defs.push({
        id: 'quicknav_google_search_ask_gpt_receiver',
        siteId: 'google_search',
        moduleId: 'google_ask_gpt',
        matches: chatgpt,
        js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, ...CHATGPT_FETCH_HUB_CONSUMER_FILES, 'content/chatgpt-google-ask/main.js'],
        runAt: 'document_start',
        world: 'MAIN'
      });
    }

    // Cmd+Enter send (multi-site)
    const CMDENTER_SITES: Array<{ siteId: string; id: string; matches: (r: RegistryLike) => string[] }> = [
      { siteId: 'qwen', id: 'quicknav_qwen_cmdenter_send', matches: (r) => siteMatchPatterns(r, 'qwen') },
      { siteId: 'kimi', id: 'quicknav_kimi_cmdenter_send', matches: (r) => siteMatchPatterns(r, 'kimi') },
      { siteId: 'deepseek', id: 'quicknav_deepseek_cmdenter_send', matches: (r) => siteMatchPatterns(r, 'deepseek') },
      { siteId: 'gemini_app', id: 'quicknav_gemini_app_cmdenter_send', matches: (r) => siteMatchPatterns(r, 'gemini_app') },
      { siteId: 'ernie', id: 'quicknav_ernie_cmdenter_send', matches: (r) => siteMatchPatterns(r, 'ernie') },
      { siteId: 'zai', id: 'quicknav_zai_cmdenter_send', matches: (r) => siteMatchPatterns(r, 'zai') },
      { siteId: 'genspark', id: 'quicknav_genspark_cmdenter_send', matches: (r) => siteQuickNavPatterns(r, 'genspark') },
      { siteId: 'grok', id: 'quicknav_grok_cmdenter_send', matches: (r) => siteMatchPatterns(r, 'grok') }
    ];

    for (const s of CMDENTER_SITES) {
      defs.push({
        id: s.id,
        siteId: s.siteId,
        moduleId: 'cmdenter_send',
        matches: uniq(s.matches(registry)),
        js: [...ISOLATED_BRIDGE_FILES, 'content/chatgpt-cmdenter-send/main.js'],
        runAt: 'document_start'
      });
    }

    const qwen = uniq(siteMatchPatterns(registry, 'qwen'));
    if (qwen.length) {
      defs.push({
        id: 'quicknav_qwen_thinking_toggle',
        siteId: 'qwen',
        moduleId: 'qwen_thinking_toggle',
        matches: qwen,
        js: [...ISOLATED_BRIDGE_FILES, 'content/qwen-thinking-toggle/main.js'],
        runAt: 'document_start'
      });
    }

    const grokAll = uniq(siteMatchPatterns(registry, 'grok'));
    const grokConversation = uniq(siteQuickNavPatterns(registry, 'grok'));
    if (grokAll.length) {
      const grokRateLimitMatches = grokConversation.length ? grokConversation : grokAll;
      defs.push({
        id: 'quicknav_grok_rate_limit_display',
        siteId: 'grok',
        moduleId: 'grok_rate_limit_display',
        matches: grokRateLimitMatches,
        js: [...ISOLATED_BRIDGE_FILES, 'content/grok-rate-limit-display/main.js'],
        runAt: 'document_end'
      });

      defs.push({
        id: 'quicknav_grok_trash_cleanup',
        siteId: 'grok',
        moduleId: 'grok_trash_cleanup',
        matches: [...GROK_DELETED_CONVERSATIONS_MATCHES],
        js: [...ISOLATED_BRIDGE_FILES, 'content/grok-trash-cleanup/main.js'],
        runAt: 'document_end'
      });
    }

    // ChatGPT readaloud
    defs.push({
      id: 'quicknav_chatgpt_readaloud_speed_controller',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_readaloud_speed_controller',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-readaloud-speed-controller/main.js'],
      runAt: 'document_start'
    });

    // ChatGPT reply timer
    defs.push({
      id: 'quicknav_chatgpt_reply_timer',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_reply_timer',
      matches: chatgpt,
      js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, ...CHATGPT_FETCH_HUB_CONSUMER_FILES, 'content/chatgpt-reply-timer/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    });

    // ChatGPT usage monitor bridges
    defs.push({
      id: 'quicknav_chatgpt_usage_monitor_bridge',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_usage_monitor',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-usage-monitor/bridge.js'],
      runAt: 'document_start'
    });

    defs.push({
      id: 'quicknav_chatgpt_usage_monitor',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_usage_monitor',
      matches: chatgpt,
      js: [
        ...MAIN_BRIDGE_FILES,
        CHATGPT_CORE_MAIN_FILE,
        ...CHATGPT_FETCH_HUB_CONSUMER_FILES,
        'content/chatgpt-usage-monitor/main.js'
      ],
      runAt: 'document_start',
      world: 'MAIN'
    });

    defs.push({
      id: 'quicknav_chatgpt_download_file_fix',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_download_file_fix',
      matches: chatgpt,
      js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, ...CHATGPT_FETCH_HUB_CONSUMER_FILES, 'content/chatgpt-download-file-fix/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    });

    defs.push({
      id: 'quicknav_chatgpt_strong_highlight_lite',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_strong_highlight_lite',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-strong-highlight-lite/main.js'],
      runAt: 'document_start'
    });

    defs.push({
      id: 'quicknav_chatgpt_quick_deep_search_config',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_quick_deep_search',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-quick-deep-search/config-bridge.js'],
      runAt: 'document_start'
    });

    defs.push({
      id: 'quicknav_chatgpt_quick_deep_search',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_quick_deep_search',
      matches: chatgpt,
      js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, ...CHATGPT_FETCH_HUB_CONSUMER_FILES, 'content/chatgpt-quick-deep-search/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    });

    defs.push({
      id: 'quicknav_chatgpt_hide_feedback_buttons',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_hide_feedback_buttons',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, 'content/chatgpt-hide-feedback-buttons/main.js'],
      runAt: 'document_start'
    });

    defs.push({
      id: 'quicknav_chatgpt_tex_copy_quote',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_tex_copy_quote',
      matches: chatgpt,
      js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, 'content/chatgpt-tex-copy-quote/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    });

    defs.push({
      id: 'quicknav_chatgpt_export_conversation',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_export_conversation',
      matches: chatgpt,
      js: [...ISOLATED_BRIDGE_FILES, CHATGPT_CORE_FILE, CHATGPT_CONVERSATION_GRAPH_FILE, CHATGPT_MAPPING_CLIENT_FILE, 'content/menu-bridge.js', 'content/chatgpt-export-conversation/main.js'],
      runAt: 'document_end'
    });

    defs.push({
      id: 'quicknav_chatgpt_image_message_edit',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_image_message_edit',
      matches: chatgpt,
      js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, ...CHATGPT_FETCH_HUB_CONSUMER_FILES, 'content/chatgpt-image-message-edit/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    });

    defs.push({
      id: 'quicknav_chatgpt_message_tree',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_message_tree',
      matches: chatgpt,
      js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, CHATGPT_CONVERSATION_GRAPH_FILE, CHATGPT_MAPPING_CLIENT_FILE, 'content/chatgpt-fetch-hub/main.js', 'content/chatgpt-message-tree/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    });

    defs.push({
      id: 'quicknav_chatgpt_canvas_enhancements',
      siteId: 'chatgpt',
      moduleId: 'chatgpt_canvas_enhancements',
      matches: chatgpt,
      js: [...MAIN_BRIDGE_FILES, CHATGPT_CORE_MAIN_FILE, CHATGPT_MAPPING_CLIENT_FILE, 'content/chatgpt-canvas-enhancements/main.js'],
      runAt: 'document_start',
      world: 'MAIN'
    });

    return defs;
  }

  const API = Object.freeze({
    version: INJECTIONS_VERSION,
    MAIN_GUARD_FILE,
    LEGACY_CONTENT_SCRIPT_IDS: Object.freeze([...LEGACY_CONTENT_SCRIPT_IDS]),
    EXTRA_HOST_PERMISSIONS,
    EXTRA_SITE_MODULE_FLAGS,
    buildDefaultSettings,
    buildContentScriptDefs
  });

  try {
    const prev = (globalThis as typeof globalThis & {
      AISHORTCUTS_INJECTIONS?: { version?: unknown };
    }).AISHORTCUTS_INJECTIONS;
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= INJECTIONS_VERSION) return;
  } catch {}

  try {
    Object.defineProperty(globalThis, 'AISHORTCUTS_INJECTIONS', {
      value: API,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      (globalThis as typeof globalThis & { AISHORTCUTS_INJECTIONS?: unknown }).AISHORTCUTS_INJECTIONS = API;
    } catch {}
  }
})();
