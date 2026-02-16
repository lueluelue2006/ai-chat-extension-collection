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
  - Exact plan item (historical unchecked text): "Validate plan task 6: Dynamic content script reconciliation removes stale QuickNav registered IDs safely."
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

- [2026-02-16][task-14-qa-contract-checklist-update]
  - Updated `.sisyphus/qa/chatgpt-feature-contract.md` with QA-run checked/unchecked status based on captured evidence and observed checks.
  - QA session stamp: `2026-02-16 09:11:34 +0100`; extension version from `manifest.json` is `1.3.76`.
  - Verified in this pass: reload protocol, QuickNav visible/no duplicate in SPA switching, `chatgpt_cmdenter_send` key behavior, `chatgpt_thinking_toggle` (`Cmd+O`/`Cmd+J`), message-tree panel visibility, and section-6 duplicate-init smoke checks.
  - Evidence set used: `qa-chatgpt-post-reload-ui.png`, `qa-chatgpt-quicknav-present-after-reload.png`, `qa-chatgpt-quicknav-ui-after-reload.png`, `qa-chatgpt-cmd-o.png`, `qa-chatgpt-cmd-j.png`, `qa-chatgpt-cmd-o-cmd-j-after-reload.png`, `qa-chatgpt-message-tree-open-after-reload.png`, `qa-chatgpt-message-tree-after-reload.png`, `qa-options-modules-list-after-reload.png`, `qa-options-openai-new-model-banner-route.png`, `qa-options-sidebar-header-fix-route.png`, `qa-options-usage-monitor-panel.png`, `qa-extensions-reload-sw-surface.png`, `qa-extensions-sw-link-valid-no-error-count.png`.
  - Console/SW: no console errors observed on ChatGPT/options/popup pages; extensions SW surface showed no visible error count.
  - Blocker: memory protocol could not be completed because `chrome://taskmanager` and `chrome://task-manager` both returned `net::ERR_INVALID_URL` via `chrome-devtools-attached`.

- [2026-02-16][task-14-qa-contract-checklist-update-pass-2]
  - Added second QA pass updates for `chatgpt_message_tree` and `chatgpt_sidebar_header_fix` runtime checks: message-tree node click jump works and tree panel remains read-only; sidebar collapse/expand action stays correct across SPA chat switch.
  - Usage monitor partial E2E completed: sent `qa-usage-monitor-e2e-1` prompt on `chatgpt.com`, options counters updated, and JSON export confirmed in `chrome://downloads`.
  - QuickNav persistence issue repro added: favorite-only entry visible before reload but missing after reload in one chat despite retained `localStorage` favorite key.
  - Evidence files: `qa-chatgpt-quicknav-favorites-before-reload.png`, `qa-chatgpt-quicknav-favorite-only-before-reload-2.png`, `qa-chatgpt-quicknav-favorite-missing-after-reload.png`, `qa-chatgpt-message-tree-node-jump-readonly.png`, `qa-chatgpt-sidebar-header-fix-runtime-spa.png`, `qa-chatgpt-usage-monitor-prompt-sent.png`, `qa-options-usage-monitor-export-downloads-confirmed.png`.
  - Blockers: (1) `chrome://taskmanager`/`chrome://task-manager` still not accessible via devtools-attached; (2) after usage-monitor import trigger, `chrome-devtools-attached` started timing out, blocking import verification and remaining browser checks in this pass.

- [2026-02-16][task-14-qa-contract-checklist-update-pass-3]
  - Usage-monitor import path is now reproducibly verifiable: importing exported JSON shows confirm dialog (`17` models, `50` request records) and then success toast `已导入并合并用量数据（下次打开 chatgpt.com 会自动同步）`; evidence `qa-options-usage-monitor-import-merged-success.png`.
  - Task-manager URLs remain inaccessible via `chrome-devtools-attached` (`chrome://taskmanager` and `chrome://task-manager` both return `net::ERR_INVALID_URL`), so section-7 memory validation used fallback `performance.memory` JS-heap readings.
  - Fallback memory data captured: baseline `usedJSHeapSize=78048009`, stress-loop samples roughly `93MB`, `145MB`, `162MB`, `168MB`, `110MB`, `132MB`.
  - Final 2 to 3 minute post-stress idle re-check timed out in MCP, so section 7 remains intentionally incomplete and documented as such.

- [2026-02-16][task-14-qa-contract-checklist-update-pass-4]
  - Follow-up fallback idle retry succeeded: immediate sample `usedJSHeapSize=98996864`, then `95333505` after about 130 seconds idle.
  - Result stayed above baseline (`78048009`), so memory protocol near-baseline criterion remains unmet and section 7 stays open.

- [2026-02-16][task-14-quicknav-favorite-persistence-retest]
  - After extension reload from `chrome://extensions`, `4.1 quicknav` persistence retest on `https://chatgpt.com/c/6992a878-db08-8393-b3df-18ed4d3ae41c` passed: one favorite remained visible in favorites-only mode after hard reload.
  - Evidence files: `qa-chatgpt-quicknav-favorite-persist-before-reload-pass4.png`, `qa-chatgpt-quicknav-favorite-persist-after-reload-pass4.png`.

- [2026-02-16][task-14-quicknav-favorite-persistence-retest-pass-5]
  - Continuation retest on the same ChatGPT conversation passed again: added one more favorite in all-items view (`1` -> `2`), then favorites-only still showed `2` items after hard reload.
  - Evidence files: `qa-chatgpt-quicknav-favorite-persist-before-reload-pass5.png`, `qa-chatgpt-quicknav-favorite-persist-after-reload-pass5.png`.

- [2026-02-16][task-14-qa-contract-checklist-writeback-pass-6]
  - Attempted: writeback of the latest QA evidence set into `.sisyphus/qa/chatgpt-feature-contract.md` focused on `5.4 chatgpt_readaloud_speed_controller`, `5.6 chatgpt_reply_timer`, and `5.7 chatgpt_download_file_fix`.
  - Proven: read-aloud menu/control is available before and after reload; options panel can set read-aloud speed to `1.5x` and `0.75x`; downloads history shows at least two successful files from `chatgpt.com`.
  - Still missing: deterministic runtime speed verification (for example `audio.playbackRate` during active playback), timer counting/reset sequence proof (only one timer screenshot), and file-open integrity or explicit cross-chat repeat proof for download fix.
  - Checklist decisions: kept section-2 module inventory checkboxes unchanged; checked only justified bullets in sections `5.4` and `5.7`; kept unproven bullets in `5.4`/`5.6`/`5.7` unchecked.

- [2026-02-16][task-14-readaloud-playbackrate-deterministic-pass-1]
  - Deterministic read-aloud speed verification completed on ChatGPT by sampling active `audio` state while menu showed `Stop`.
  - Measured values while active playback was running:
    - `1.5x`: `playbackRate=1.5`, `paused=false`, `deltaCurrentTime=1.796` (`2026-02-16T10:54:27.770Z`)
    - `0.75x`: `playbackRate=0.75`, `paused=false`, `deltaCurrentTime=0.903` (`2026-02-16T10:55:02.593Z`)
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-readaloud-playbackrate-pass1.md`.
  - Active-state screenshots: `qa-chatgpt-readaloud-active-stop-long-pass1.png`, `qa-chatgpt-readaloud-active-stop-pass1.png`.

- [2026-02-16][task-14-reply-timer-deterministic-pass-1]
  - Reply-timer proof must include multi-sample running increments, completion stop-state, and second-prompt reset; one screenshot is not enough.
  - Run 1 (prompt B): running `25.9 -> 29.1` in about `3.2s` with `count=1`; completion `text=37.0`, `status=done`, `hasStopControl=false`.
  - Run 2 (prompt C reset): previous done value `37.0`, then second-run values `7.9` and `21.5` with `count=1`, proving reset without duplicate widget.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-reply-timer-pass1.md`.
  - Screenshots: `qa-chatgpt-reply-timer-running-pass1.png`, `qa-chatgpt-reply-timer-complete-pass1.png`, `qa-chatgpt-reply-timer-second-reset-pass1.png`.

- [2026-02-16][task-14-download-file-fix-deterministic-pass-2]
  - Closed remaining `5.7 chatgpt_download_file_fix` gaps by proving file-open integrity and cross-chat repeat in one pass.
  - Cross-chat runtime proof: downloaded files in chat `69925a78-4868-838a-9eb2-43b445d3c555` and separate chat `6992fe06-7754-8394-9206-03a66e080268`; `chrome://downloads` shows both successful entries from `chatgpt.com`.
  - File-integrity proof: local files are non-empty and content matches expected payloads (`download-fix-second-chat`, `download-fix-cross-chat`), including fresh duplicate `second-download-check (1).txt` created by re-download.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-download-file-fix-pass2.md`.
  - Screenshot: `qa-chatgpt-download-file-fix-downloads-pass2.png`.
- [2026-02-16][task-14-strong-highlight-lite-deterministic-pass-1]
  - Completed deterministic close-out for `5.8 chatgpt_strong_highlight_lite` on ChatGPT with extension reload + hard refresh at session start.
  - Prompted a structured markdown response with many bold phrases; probe confirmed highlight style applied (`styleTagCount=1`, `strongCount=14`, sample computed color `rgb(0, 255, 127)`).
  - Scroll persistence stayed stable in the same chat scroller (`scrollTop` changed and returned; highlight color stayed `rgb(0, 255, 127)` with no duplicate style injection).
  - Disclaimer hiding remained active (`#thread-bottom-container [class*="vt-disclaimer"]`: `total=1`, `visibleCount=0`, `display=none`), and SPA chat switch/return kept single style injection (`styleTagCount=1`).
  - Console health check during this module pass: `error/warn` list returned empty.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-strong-highlight-lite-pass1.md`.
  - Evidence files: `qa-chatgpt-strong-highlight-lite-bold-highlight-pass1.png`, `qa-chatgpt-strong-highlight-lite-scroll-persist-pass1.png`, `qa-chatgpt-strong-highlight-lite-disclaimer-hidden-pass1.png`, `qa-chatgpt-strong-highlight-lite-spa-return-pass1.png`.

- [2026-02-16][task-14-tex-copy-quote-deterministic-pass-1]
  - `5.11 chatgpt_tex_copy_quote` can be deterministically closed out by combining: (a) range-selection copy probe (`document.execCommand('copy')` + `selection.toString()`), and (b) module copy-affordance probe (double-click `.katex` + capture `navigator.clipboard.writeText` payload).
  - In MCP context, direct `navigator.clipboard.readText()` may time out when `clipboard-read` permission is `prompt`; fallback capture through module handler payload is stable and preserves exact copied LaTeX text.
  - Rendered formula verification should include KaTeX annotation extraction from the latest assistant turn (`annotation[encoding="application/x-tex"]`) to prove rendered math, not plain text only.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-tex-copy-quote-pass1.md`.
  - Evidence files: `qa-chatgpt-tex-copy-quote-rendered-math-pass1.png`, `qa-chatgpt-tex-copy-quote-dblclick-toast-pass1.png`.

- [2026-02-16][task-14-export-conversation-contract-writeback-pass-2]
  - `5.12 chatgpt_export_conversation` close-out should record both Markdown and HTML outputs for at least two conversation IDs, with deterministic filename + byte-size facts.
  - Markdown acceptance checks should stay content-light but strict: files must be non-empty, include both `User` and `Assistant` markers, and record line counts for reproducibility (`167` and `38` in this pass).
  - Longer-thread proof is stronger when captured as the larger export pair from the same day (`6992a878-...`: `.md` `6519` bytes, `.html` `16247` bytes).
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-export-conversation-pass1.md`.
  - Evidence files: `qa-options-export-conversation-actions-pass1.png`, `qa-chatgpt-export-conversation-downloads-pass1.png`, `qa-chatgpt-export-conversation-html-render-pass1.png`.

- [2026-02-16][task-14-export-conversation-deterministic-pass-1]
  - `5.12 chatgpt_export_conversation` close-out should run from options-page `菜单操作` (`导出为 Markdown` / `导出为 HTML`) and then validate both outputs in `chrome://downloads`.
  - If repeated exports appear to succeed (`已执行`) but files do not land, check Chrome automatic-download policy and add `[*.]chatgpt.com` under `chrome://settings/content/automaticDownloads` allowlist.
  - Deterministic proof set for this module: file-size checks (`.md` + `.html` > 0), markdown user/assistant heading counts, and rendered exported-HTML probe (`title`, `h1`, `msgCount/userCount/assistantCount`).
  - Long-thread criterion can be evidenced with a fast post-export responsiveness probe (batched turn queries + measured duration) on the source ChatGPT tab.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-export-conversation-pass1.md`.
  - Evidence files: `qa-chatgpt-export-conversation-options-actions-pass1.png`, `qa-chatgpt-export-conversation-downloads-pass1.png`, `qa-chatgpt-export-conversation-html-render-long-thread-pass1.png`.

- [2026-02-16][task-14-image-message-edit-deterministic-pass-1]
  - `5.13 chatgpt_image_message_edit` is deterministically provable by combining message-level assertions with conversation-tree structure: edited branch user turn (`[img]` + edited text) and original baseline node must coexist.
  - Upload automation path is stable when clicking `Add files and more` first, then using `upload_file` on menu item `Add photos & files`; direct upload to the top-level add button is unreliable.
  - Branch-preservation acceptance should record tree-side facts (`U IMGE pass1 baseline`, `U [img] IMGE pass1 edited branch`, root `branches:2`) plus runtime turn render facts (image preview button + edited user text).
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-image-message-edit-pass1.md`.
  - Evidence files: `qa-chatgpt-image-message-edit-control-pass1.png`, `qa-chatgpt-image-message-edit-edited-branch-pass1.png`, `qa-chatgpt-image-message-edit-branch-preserved-pass1.png`.

- [2026-02-16][task-14-image-message-edit-contract-writeback-pass-2]
  - Close-out writeback for checklist `5.13` should reference artifact-only facts: baseline `IMGE pass1 baseline`, edited branch `[img] IMGE pass1 edited branch`, and preserved sibling branches under one root.
  - When URL is not captured in the selected artifact set, record `URL not captured` explicitly instead of inferring context from unrelated notes.
  - Attachment evidence can be anchored by a run marker file (`qa-chatgpt-image-message-edit-attachment-pass1.txt`, `IMG-EDIT-ATTACH-PASS1`) even when filename text is not visible in screenshots.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-image-message-edit-pass1.md`.
  - Evidence files: `qa-chatgpt-image-message-edit-control-pass1.png`, `qa-chatgpt-image-message-edit-edited-branch-pass1.png`, `qa-chatgpt-image-message-edit-branch-preserved-pass1.png`, `qa-chatgpt-image-message-edit-attachment-pass1.txt`.

- [2026-02-16][task-14-openai-new-model-banner-deterministic-pass-2]
  - For deterministic `5.1 openai_new_model_banner` verification, set monitor URL to `https://cdn.openai.com/API/docs/images/model-page/model-icons/gpt-5.png` and save; this URL returned `200` and reliably produced banner alert state.
  - Banner "dismiss" behavior is config-driven (not direct close): click banner action `打开配置（清空 URL 列表可停止提醒）`, clear URL list in options, and save to stop reminders/hide open banner (`openCount=0`).
  - Duplicate-check should use structural counters across SPA hop/return: `hostCount` stays `1` and `openCount` stays `0` after dismissal; this is stronger than visual-only checks.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-openai-new-model-banner-pass2.md`.
  - Evidence files: `qa-chatgpt-openai-new-model-banner-visible-pass2.png`, `qa-chatgpt-openai-new-model-banner-dismissed-pass2.png`, `qa-chatgpt-openai-new-model-banner-no-duplicate-after-spa-pass2.png`, `qa-options-openai-new-model-monitor-clear-pass2.png`.

- [2026-02-16][task-14-spa-duplicate-init-mini-pass-7]
  - For a fast section-6 sanity pass, use two stable chat URLs and verify SPA switch-return by checking `performance.timeOrigin` stays constant across baseline, switch, and return probes.
  - Minimal deterministic duplicate-init probe set is enough for this mini-pass: `#cgpt-compact-nav`, `#__aichat_chatgpt_message_tree_toggle_v1__`, and `#__aichat_chatgpt_message_tree_panel_v1__` should all remain `1`.
  - Pair singleton checks with hidden-state guards (`#thread-bottom-container [class*="vt-disclaimer"]` and feedback buttons visible count) to detect unintended re-exposure side effects during SPA navigation.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-spa-duplicate-init-mini-pass7.md`.

- [2026-02-16][task-14-spa-duplicate-init-five-chat-pass-8]
  - For section-6 full-sweep closure, run reload subset first (`chrome://extensions` reload + one hard refresh), then do sidebar-only SPA route order `A -> B -> C -> D -> E -> A` to prove behavior across at least five chats.
  - Keep one deterministic probe schema across all hops (`href`, `title`, `timeOrigin`, singleton guards, disclaimer visibility, feedback visibility) so cross-chat diffs are direct and machine-comparable.
  - Use `performance.timeOrigin` as the no-full-reload invariant and pair it with singleton guard counts to separate real duplicate-init from cosmetic DOM variance on long threads.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-spa-duplicate-init-five-chat-pass8.md`.

- [2026-02-16][task-14-spa-keypress-reconciliation-pass-9]
  - Section-6 keypress clause can be strengthened without runtime edits by reconciling existing runtime artifacts with static hotkey-guard checks in the three hotkey-heavy modules (`chatgpt_cmdenter_send`, `chatgpt_thinking_toggle`, `chatgpt_quick_deep_search`).
  - For quick-search shortcuts, keep both views in one evidence note: (a) raw ordered toast/log sequence from the runtime probe, and (b) screenshot-level counts/cues, so one-action behavior is auditable even when direct key-event hooks are unavailable.
  - Treat `Cmd+O`/`Cmd+J` screenshots as structural non-duplication evidence (single panel/list instance), and explicitly mark them as non-event logs to avoid over-claiming.
  - Evidence note: `.sisyphus/evidence/qa-chatgpt-spa-keypress-reconciliation-pass9.md`.

- [2026-02-16][task-worktree-hygiene-docs-meta-commit]
  - Prepared docs/meta-only commit by staging plan/QA/notepad markdown files for the ts-bundler refactor stream.
  - Added `.gitignore` ignores for local/generated artifacts: `.sisyphus/evidence/`, `.sisyphus/tmp/`, `.sisyphus/boulder.json`, and `bun.lock`.
  - Explicitly kept local artifact outputs out of commit scope (evidence screenshots/notes, tmp JSON, and machine-local boulder state).

- [2026-02-16][task-qwen-quicknav-turn-selector-hardening]
  - `content/qwen-quicknav.js::qsTurns()` now hard-prefers `.qwen-chat-message` when present and rewrites `TURN_SELECTOR` to that selector, so early broad cache picks cannot stick.
  - Added selector-quality gating via `getTurnSelectorQuality()`: cached/probed selectors with low turn-like signal are rejected and trigger automatic re-selection.
  - Added an early-boot marker probe (`conversation-turn` / `data-message-id` / `data-message-author-role`) to avoid caching broad fallbacks while Qwen is still hydrating.

- [2026-02-16][task-qwen-thinking-toggle-auto-fast-fallback]
  - Cmd+O mode matching now treats `Auto|自动` as the non-thinking counterpart for `Thinking|思考|推理`, while still preferring real `Fast|快速|极速` when that option exists.
  - Mode-option lookup now scopes to the popup/listbox opened by the active mode select (`aria-controls/aria-owns` first, then newly opened popup fallback) and only uses a safe 2-3 option "other" fallback when direct label matching fails.
  - Hotkey async execution is wrapped in `catch` + toast so failures surface to the user without `Uncaught (in promise)`.

- [2026-02-16][task-qwen-thinking-toggle-antd-open-click]
  - Qwen AntD mode dropdown does not open from `.ant-select` root `.click()`; dispatching pointerdown/up plus mouse down/up/click on `.ant-select-selector` (combobox fallback) opens the popup reliably for Cmd+O mode toggles.
