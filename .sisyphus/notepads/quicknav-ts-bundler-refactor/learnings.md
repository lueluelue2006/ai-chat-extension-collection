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

- [2026-02-16][task-13-dev-gate-self-tests]
  - `dev/check.js` now runs `dev/test-usage-monitor-utils.js` and `dev/test-usage-monitor-bridge.js` after registry consistency checks.
  - Any self-test failure reports the failing script and exits with a non-zero code.


- [2026-02-16][task-6-dynamic-reconciliation-validation]
  - Exact plan item: `- [ ] Validate plan task 6: Dynamic content script reconciliation removes stale QuickNav registered IDs safely.`
  - Namespace prefix source: `background/sw/storage.ts` defines `QUICKNAV_CONTENT_SCRIPT_ID_PREFIX = 'quicknav_'` and exposes `getQuicknavContentScriptIdPrefix()`.
  - Discovery path: `background/sw/registration.ts::getRegisteredQuickNavContentScripts()` calls `ns.chrome.scriptingGetRegisteredContentScripts()` and then keeps every script whose `id` starts with the prefix. Discovery starts from the full registered list (not allowlist-only).
  - Reconciliation path: `background/sw/registration.ts::applyContentScriptRegistration(settings)` builds `desired` from enabled defs and `registered` from discovered QuickNav-prefixed IDs; stale QuickNav IDs (`registered - desired`) are collected into `unregisterIds`.
  - Safety scope: unregister uses `ns.chrome.scriptingUnregisterContentScripts({ ids: Array.from(unregisterIds) })`; because `unregisterIds` is derived from QuickNav-prefixed discovery, non-QuickNav registered scripts are not targeted.
  - Verification commands run:
    - `rg -n "getRegisteredQuickNavContentScripts|applyContentScriptRegistration|getQuicknavContentScriptIdPrefix|scriptingUnregisterContentScripts" background/sw/registration.ts background/sw/storage.ts background/sw/chrome.ts`
    - `node dev/check.js` (expected: `Registry consistency: OK`, `Dev self-tests: OK`)
    - Inline mocked runtime check via `node` + `esbuild` evaluating `background/sw/registration.ts`: with registered IDs `quicknav_keep`, `quicknav_stale`, `unrelated_id` and desired IDs `quicknav_keep`, `quicknav_new`, the observed result unregistered only `quicknav_stale`, registered `quicknav_new`, and left `unrelated_id` untouched.


- [2026-02-16][plan-4-14-current-state-audit]
  - Scope: audited plan tasks 4-14 against current repo state (static code/doc evidence + command checks).
  - Command evidence actually executed:
    - `node dev/check.js` => `Script syntax check: OK`, `docs/scripts-inventory.md version check: OK (v1.3.75)`, `Registry consistency: OK`, `Dev self-tests: OK (2 scripts)`.
    - `npm run -s typecheck && node -e "console.log('typecheck OK')"` => `typecheck OK`.
  - Task 4 (`shared/registry` + `shared/injections` TS migration):
    - `"UI still lists modules/sites correctly"` => DONE (static evidence).
      - Evidence: `shared/registry.ts` defines typed canonical `SITES`/`MODULES`; `options/options.js` reads `globalThis.QUICKNAV_REGISTRY` (`REGISTRY`/`SITES`/`MODULES`) for rendering.
    - `"Injection defs build and register without errors"` => DONE (static + gate evidence).
      - Evidence: `shared/injections.ts` exports `buildContentScriptDefs`; `background/sw/storage.ts` `initConfig()` consumes shared builders; `background/sw/registration.ts` `applyContentScriptRegistration()` does deterministic register/unregister diff.
  - Task 5 (SW modularization + error-aware wrappers + sender gating):
    - `"Settings read/write failures propagate {ok:false, error} to callers"` => DONE.
      - Evidence: `background/sw/chrome.ts` `callbackToPromise()` rejects on `chrome.runtime.lastError`; `background/sw/router.ts` central `respondError()` and per-message `.catch(...sendResponse({ok:false,error}))` for settings mutations.
    - `"QUICKNAV_NOTIFY is sender-gated like other mutating messages"` => DONE.
      - Evidence: `background/sw/router.ts` `QUICKNAV_NOTIFY` path calls `requireAllowedSender(..., { allowTabSender: true })`; `background/sw/chrome.ts` `senderGate()` enforces sender policy.
  - Task 6 (dynamic content script reconciliation):
    - `"After rebuild + reload, only current QuickNav scripts remain registered"` => PARTIAL.
      - Evidence (implemented part): `background/sw/registration.ts` reads all registered scripts via `scriptingGetRegisteredContentScripts()` and removes stale `quicknav_` IDs not in desired set.
      - Evidence (missing part): `shared/injections.ts` exposes `LEGACY_CONTENT_SCRIPT_IDS`, but current codebase has no consumer of this list (no migration-specific cleanup path wired).
  - Task 7 (cross-world bridge hardening):
    - `"Spoofed window.postMessage({__quicknav:1,...}) without nonce does nothing"` => DONE for runtime guard, PARTIAL for explicit negative-test artifact.
      - Evidence (runtime guard): `content/quicknav-bridge.js`, `content/quicknav-bridge-main.js`, `content/scroll-guard-main.js`, `content/chatgpt-message-tree/main.js`, `content/chatgpt-quicknav.js` all enforce `__quicknav + channel + v + nonce` plus type allowlists.
      - Evidence (gap): no `dev/` automated negative test for spoofed bridge messages found.
  - Task 8 (message tree token isolation):
    - `"window.__aichat_chatgpt_message_tree_state__ does not contain token values"` => DONE.
      - Evidence: `content/chatgpt-message-tree/main.js` keeps token in closure `authCache`; window state object fields do not include token/account/device cache.
    - `"Tree summary/navigate still works"` => DONE (code-path + evidence artifact).
      - Evidence: `content/chatgpt-message-tree/main.js` bridge handlers for summary/navigate (`BRIDGE_REQ_SUMMARY`, `BRIDGE_NAVIGATE_TO`); screenshots under `.sisyphus/evidence/qa-chatgpt-message-tree-open.png` and `.sisyphus/evidence/qa-chatgpt-message-tree-after-reload.png`.
  - Task 9 (scroll guard consolidation):
    - `"Only one layer patches scroll APIs"` => DONE.
      - Evidence: `content/scroll-guard-main.js` owns prototype patching; `content/chatgpt-quicknav.js` comment says no global prototype patch and `installScrollGuards()` is now no-op.
    - `"Scroll-lock works on ChatGPT without regressions"` => PARTIAL (implementation present; no fresh full regression run logged in this audit).
  - Task 10 (usage monitor data + forced-silent behavior):
    - `"No unintended clearing of shared quota request arrays"` => DONE.
      - Evidence: `content/chatgpt-usage-monitor/main.js` preserves `existingGroupRequestsById` during `applyPlanConfig()` rebuild; `Storage.get()` keeps normalized `group.requests` instead of wiping.
    - `"In forced silent mode, UI bootstrap does not run"` => DONE.
      - Evidence: `main()` only installs scrambler/styles when `!startsSilent`; silent early-return path exits before UI scheduling/bootstrapping.
  - Task 11 (options routing + GPT53 semantics):
    - `"No registry module falls into “unknown module” panel"` => DONE for current in-scope modules.
      - Evidence: `options/options.js` has explicit branches for `openai_new_model_banner` and `chatgpt_sidebar_header_fix`; fallback remains only as generic safeguard for future unknown IDs.
    - `"GPT53 monitor stop semantics are consistent and documented"` => DONE.
      - Evidence: `options/options.html` copy explicitly says empty saved URL list stops detection/reminders; `background/sw/monitors.ts` stores explicit empty list (`[]`) and probe loop then has no URLs to alert on.
  - Task 12 (docs + inventory + drift gate):
    - `"Docs inventory version equals manifest version"` => DONE.
      - Evidence: `manifest.json` version `1.3.75` equals `docs/scripts-inventory.md` version `1.3.75`.
    - `"Drift check fails on mismatch"` => DONE.
      - Evidence: `dev/check.js` hard-fails when inventory version differs from manifest version and instructs regeneration via `node dev/gen-scripts-inventory.js`.
  - Task 13 (dev tooling gate improvements):
    - `"node dev/check.js fails when docs/version drift exists"` => DONE (implemented and observable in checker logic).
      - Evidence: `dev/check.js` version mismatch branch sets non-zero exit and prints FAIL diagnostics.
    - `"node dev/check.js runs the dev self-tests and fails on error"` => DONE.
      - Evidence: `DEV_SELF_TESTS` list + `runDevSelfTests()` in `dev/check.js`; command run shows `Dev self-tests: OK (2 scripts)`.
  - Task 14 (full manual QA sweep + memory protocol):
    - `"No fatal console errors in SW and in ChatGPT page"` => MISSING evidence in current audit.
    - `"Feature contract checks all pass"` => NOT DONE (`.sisyphus/qa/chatgpt-feature-contract.md` checkboxes remain unchecked).
    - `"Evidence screenshots/notes captured under .sisyphus/evidence/"` => DONE (multiple screenshots already present).
  - Task 4-14 summary:
    - DONE: 4, 5, 8, 10, 11, 12, 13.
    - PARTIAL: 6, 7, 9.
    - NOT DONE: 14.
  - Quick reproduce commands (for future re-check):
    - `node dev/check.js`
    - `npm run -s typecheck`
    - `rg -n "LEGACY_CONTENT_SCRIPT_IDS|getRegisteredQuickNavContentScripts|applyContentScriptRegistration" shared/injections.ts background/sw/registration.ts`
    - `rg -n "readBridgeMessage|msg\.nonce|ALLOWED_" content/quicknav-bridge.js content/quicknav-bridge-main.js content/scroll-guard-main.js content/chatgpt-message-tree/main.js content/chatgpt-quicknav.js`
    - `rg -n "sharedQuotaGroups|existingGroupRequestsById|startsSilent|isSilent\(\)" content/chatgpt-usage-monitor/main.js`
    - `rg -n "openai_new_model_banner|chatgpt_sidebar_header_fix|unknown module|empty.*URL|停用检测" options/options.js options/options.html background/sw/monitors.ts`

- [2026-02-16][task-6-legacy-script-cleanup-scope]
  - `background/sw/storage.ts` now snapshots `QUICKNAV_INJECTIONS.LEGACY_CONTENT_SCRIPT_IDS` during `initConfig()` and exposes `getQuicknavLegacyContentScriptIds()`.
  - `background/sw/registration.ts::getRegisteredQuickNavContentScripts()` now treats IDs as QuickNav-managed when `(id startsWith 'quicknav_') OR (id in legacy list)`; prefix discovery behavior is preserved.
  - Cleanup safety tightened: `applyContentScriptRegistration()` computes `safeUnregisterIds = unregisterIds ∩ currentlyRegisteredManagedIds` before calling `scriptingUnregisterContentScripts`, preventing unregister calls for non-registered IDs.
  - Verify by running `node dev/check.js`, then in SW console run a snippet that seeds one stale legacy ID + one unrelated ID and confirms only the stale legacy ID is removed.

- [2026-02-16][task-7-bridge-nonce-guard-test]
  - Added `dev/test-quicknav-bridge-nonce.js` to lock bridge behavior: spoofed `window.postMessage` payloads with marker/channel/version but missing or wrong nonce must not emit `routeChange`.
  - The same test asserts that a valid envelope (`__quicknav + channel + v + nonce`) emits exactly one `routeChange` with the expected `href`.
  - `dev/check.js` now includes this self-test in `DEV_SELF_TESTS` so nonce-regression breaks the gate.
