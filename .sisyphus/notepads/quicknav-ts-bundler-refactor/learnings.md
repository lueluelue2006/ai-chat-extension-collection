# Learnings

- (none yet)

- Pruning to ChatGPT + Qwen must keep ChatGPT's full module injection set intact; only non-ChatGPT site loops/extras in `shared/injections.js` should be removed.
- `manifest.json` is validated against `shared/registry.js` + `shared/injections.js` by `dev/check.js`, so `host_permissions` must equal (registry non-common patterns + `EXTRA_HOST_PERMISSIONS`) and bootstrap matches must equal registry non-common patterns.
- Keep `https://cdn.openai.com/*` in host permissions for the ChatGPT new-model banner probe; this permission is sourced from `EXTRA_HOST_PERMISSIONS`.

- Mirror build should use an explicit runtime-root allowlist so tooling/dev folders never leak into `dist/`.
- Runtime `.ts/.tsx/.mts/.cts` files are transpiled one-by-one to `.js` without bundling or hashing, which keeps extension load paths deterministic.

- `npm install -D esbuild typescript` produces an npm v3 text lockfile; `esbuild` adds platform-specific optional packages in `package-lock.json` while direct devDependencies remain only `esbuild` and `typescript`.

- Dynamic content-script reconciliation should discover registered QuickNav scripts by ID namespace prefix (`quicknav_`) via `chrome.scripting.getRegisteredContentScripts`; filtering discovery by current allowlist misses stale IDs and blocks cleanup.

- Scope docs must track `node dev/stats.js` output after each registry/injection prune; current ChatGPT-first baseline is sites=3 (includes `common`), modules=27, defs=24, with `qwen` explicitly documented as smoke-test only.

- Config consumer map: runtime consumes `QUICKNAV_REGISTRY`/`QUICKNAV_INJECTIONS` via `importScripts('../shared/registry.js', '../shared/injections.js')` and classic `<script src="../shared/registry.js">`; dev tools consume TS sources through `vm.runInContext` and require `buildDefaultSettings` / `buildContentScriptDefs` / `EXTRA_HOST_PERMISSIONS`.
- Bridge inventory note: current `window.postMessage` bridges are marker-only (no nonce/channel), and the highest-risk MAIN-world sinks are `content/chatgpt-message-tree/main.js` and `content/scroll-guard-main.js`.
- SW can be modularized for MV3 classic runtime by keeping `background/sw.js` as a thin `importScripts('./sw/*.js')` entry and exposing script-safe module APIs on `globalThis.__quicknavSw`.
- To avoid degraded-mode persistence drift, auto-normalization writes for `quicknav_settings` should run only when shared config (`registry/injections`) is loaded successfully.
- Side-effect messages should reuse one sender gate helper; `QUICKNAV_NOTIFY` now follows the same extension-page restriction as other mutating handlers.

- Cross-world `postMessage` bridges must enforce the full protocol (`__quicknav` + `channel` + `v` + per-page `nonce`) and a receiver-side type allowlist; marker-only checks are spoofable.
- Keep the shared bridge nonce in `document.documentElement.dataset.quicknavBridgeNonceV1` so MAIN/ISOLATED worlds read the same value without using `window.*` globals.

- `chatgpt_message_tree` now keeps auth/session cache in closure scope (`authCache`) and clears it in `cleanup()`, so `window.__aichat_chatgpt_message_tree_state__` no longer carries `token`/`accountId`/`deviceId`.
- DevTools verification: open Console and inspect `window.__aichat_chatgpt_message_tree_state__` (confirm no auth fields), then trigger tree summary/navigate and check Network still requests `/backend-api/conversation/:id` successfully.


- [2026-02-16][plan-11-prep] Options routing + GPT53 monitor semantics audit (ChatGPT-first scope)
  - Repro rg queries:
    - `rg -n "openai_new_model_banner|chatgpt_sidebar_header_fix|modules: \[|id: 'chatgpt'|id: 'common'|id: 'qwen'" shared/registry.ts`
    - `rg -n "if \(moduleId === '|renderBasicToggleModuleSettings\(siteId, moduleId, '未知模块" options/options.js`
    - `rg -n "删除该 URL|不停止提醒|QUICKNAV_GPT53_MARK_READ|normalizeGpt53ProbeUrls|setGpt53Urls|defaultUrls" options/options.html options/options.js background/sw/monitors.ts content/openai-new-model-banner/main.js`
  - Active modules after pruning are from `common/chatgpt/qwen` only (`shared/registry.ts:9`, `shared/registry.ts:11`, `shared/registry.ts:35`).
  - Missing explicit settings-panel routes (fall through unknown-panel fallback at `options/options.js:3126`):
    - `openai_new_model_banner` (in site modules at `shared/registry.ts:17`, no dedicated `moduleId` branch in `options/options.js:3095` onward)
    - `chatgpt_sidebar_header_fix` (in site modules at `shared/registry.ts:32`, no dedicated `moduleId` branch in `options/options.js:3095` onward)
  - Router decision flow: selected site/module resolved via `effectiveSelectedSiteId` (`options/options.js:755`) + `effectiveSelectedModuleId` (`options/options.js:779`), then `renderAll` calls `renderModuleSettings` (`options/options.js:3139`), which uses an if-chain switch (`options/options.js:3095`) and unknown fallback (`options/options.js:3126`).
  - GPT53 stop/delete mismatch:
    - UI copy says “delete URL to stop reminders” in `options/options.html:53`, `content/openai-new-model-banner/main.js:165`, and `content/openai-new-model-banner/main.js:316`.
    - Actual save semantics normalize empty input back to default URL (`background/sw/monitors.ts:201`, `background/sw/monitors.ts:229`, `background/sw/monitors.ts:242`), so deleting all URLs does not actually stop monitoring; `MARK_READ` only clears unread badge (`background/sw/monitors.ts:159`, wired from `options/options.js:3298`).

- [2026-02-16][plan-9-scroll-layer-map] MAIN/ISOLATED scroll-guard layering map (for task 9 consolidation)
  - MAIN authoritative patch layer is `content/scroll-guard-main.js` (installed in MAIN world): patches `scrollTop` setter on `Element.prototype`/`HTMLElement.prototype` (`:652`), `Element.prototype.scrollIntoView` (`:674`), `window.scrollTo` (`:682`), `window.scroll` (`:692`), `window.scrollBy` (`:701`), `Element.prototype.scrollTo` (`:715`), `Element.prototype.scroll` (`:725`), `Element.prototype.scrollBy` (`:738`).
  - MAIN also monkey-patches `history.pushState`/`history.replaceState` (`:144`, `:151`) to broadcast `QUICKNAV_ROUTE_CHANGE` (`:134`) and emits `QUICKNAV_SCROLL_GUARD_READY` (`:749`).
  - ISOLATED legacy patch layer is `content/chatgpt-quicknav.js::installScrollGuards` (`:4513`): patches `Element.prototype.scrollIntoView` (`:4522`), `window.scrollTo` (`:4527`), `window.scrollBy` (`:4533`), `Element.prototype.scrollTo` (`:4543`), `Element.prototype.scrollBy` (`:4552`); installed from `initScrollLock` (`:4622`) and `setScrollLockEnabled` (`:4583`).
  - Cross-world coordination contract today: strict bridge envelope (`__quicknav + channel + v + nonce`) in both scripts (`content/scroll-guard-main.js:31-35`, `content/chatgpt-quicknav.js:96-100`) with strict receiver checks (`content/scroll-guard-main.js:269-274`, `content/chatgpt-quicknav.js:114-119`), nonce sourced from `document.documentElement.dataset.quicknavBridgeNonceV1`.
  - Dataset sync keys (ISOLATED -> MAIN): `quicknavScrollLockEnabled` (`content/chatgpt-quicknav.js:3974` -> read at `content/scroll-guard-main.js:200`), `quicknavScrollLockBaseline` (`content/chatgpt-quicknav.js:3988` -> read at `content/scroll-guard-main.js:238`), `quicknavAllowScrollUntil` (`content/chatgpt-quicknav.js:4219` -> read at `content/scroll-guard-main.js:229`). Message types: `QUICKNAV_SCROLLLOCK_STATE/BASELINE/ALLOW` (`content/chatgpt-quicknav.js:3975/3996/4002`), plus MAIN->ISOLATED `QUICKNAV_SCROLL_GUARD_READY` (`content/scroll-guard-main.js:749`, handled in `content/chatgpt-quicknav.js:4044`).
  - Injection chain: static MAIN registration (`shared/injections.ts:184-191`) + on-demand reinject (`background/sw/router.ts:353-360`, `background/sw/registration.ts:357-364`) requested by isolated (`content/chatgpt-quicknav.js:4017`).
  - Dual-layer risk if both remain active: duplicate-but-different block heuristics between MAIN and ISOLATED wrappers, divergent scroller detection paths, no uninstall path, and transient allow-window mismatch windows; consolidation should keep MAIN wrappers as sole authority and preserve strict bridge/dataset contract.

- [2026-02-16][task-9-scroll-guard-consolidation] Disabled ISOLATED monkey-patch installation by turning `content/chatgpt-quicknav.js::installScrollGuards` into a no-op, so only MAIN `content/scroll-guard-main.js` patches scroll APIs.
  - Kept the cross-world publisher contract unchanged: dataset keys `quicknavScrollLockEnabled` / `quicknavScrollLockBaseline` / `quicknavAllowScrollUntil`, message types `QUICKNAV_SCROLLLOCK_STATE` / `QUICKNAV_SCROLLLOCK_BASELINE` / `QUICKNAV_SCROLLLOCK_ALLOW`, and ensure/ready handshake `QUICKNAV_ENSURE_SCROLL_GUARD` + `QUICKNAV_SCROLL_GUARD_READY`.
  - Manual QA later (plan task 14): verify ChatGPT scroll-lock still blocks reply-driven autoscroll without regressions for user/nav-initiated jumps, and remains stable across SPA route changes + hot reinject.

- [2026-02-16][task-10-usage-monitor-silent-preserve]
  - `Storage.get()` was normalizing `sharedQuotaGroups[*].requests` and then immediately replacing each array with `[]`, so every read could durably wipe shared group history via the normalization writeback.
  - `applyPlanConfig()` rebuilt `data.sharedQuotaGroups` with `requests: []`, which dropped existing per-group usage arrays whenever plan structure reapplied.
  - Fixes: keep normalized group requests in `Storage.get()` and preserve existing `sharedQuotaGroups[groupId].requests` when rebuilding plan groups.
  - Silent-mode gating: `main()` now performs headless setup first, skips text scrambler/style install when silent, and returns before route-fallback interval + ensure timers/observers are installed; external plan sync listener still applies plan/cleanup and only schedules UI init when not silent.
  - Browser sanity-check later: import usage JSON from Options, refresh, and export again to confirm shared group request arrays persist; in forced silent mode confirm no `#chatUsageMonitor` floating UI is injected.

- [2026-02-16][task-11-options-routing-gpt53-stop-semantics]
  - Added explicit Options module routes for `openai_new_model_banner` and `chatgpt_sidebar_header_fix`; both now render deterministic settings panels instead of falling into the unknown-module fallback.
  - GPT53 URL normalization now treats `null`/`undefined` as “use defaults”, but preserves explicit empty user input as `[]`; an empty saved list means no probe URLs and therefore stops probe/reminder behavior.

- [2026-02-16][task-12-docs-inventory-drift-gate]
  - `dev/check.js` now compares `manifest.json` version with the `- Version:` line in `docs/scripts-inventory.md` and fails fast on mismatch.
  - Drift fix path is explicit in output: run `node dev/gen-scripts-inventory.js`; patch bumps must regenerate inventory in the same change.
