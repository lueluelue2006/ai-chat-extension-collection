# QuickNav TS + Bundler Refactor (ChatGPT-First)

## TL;DR

> **Quick Summary**: Re-architecture this MV3 extension into a TypeScript + bundler project with a `dist/` load root, while hardening cross-world messaging, fixing error-swallowing paths, reducing duplicated site logic, and improving long-session stability (memory/perf) on ChatGPT.
>
> **Deliverables**:
> - `dist/` becomes the Unpacked load root (contains `dist/manifest.json` + built JS/assets)
> - A TS-first source tree (`src/`) + deterministic multi-entry build (no code-splitting initially)
> - Modularized service worker with strict Chrome API error handling + safer message routing
> - Hardened `postMessage` bridges with nonce handshake; no secrets stored on `window`
> - One scroll-guard layer (MAIN world) and fewer global prototype patches
> - ChatGPT modules refactored for lifecycle hygiene (AbortController cleanup, SPA-safe)
> - Dev checks upgraded to prevent docs/version drift and to run existing self-tests
> - Docs synced and kept consistent with runtime behavior
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES (after build foundation)
> **Critical Path**: Build to `dist/` -> load/reload workflow -> SW modularization -> ChatGPT bridges/security -> scroll/perf stabilization -> docs + QA

---

## Context

### Original Request
- Major refactor for robustness, extensibility, maintainability, and performance.
- Connect to the user's existing Chrome session for hands-on QA.
- Focus primarily on ChatGPT; other sites are secondary.
- Migrate to TypeScript + bundler.
- Breaking changes are acceptable; rollback via git to current 1.3.64.

### Confirmed Scope Decisions (User)
- **Primary target**: ChatGPT only (keep *all* existing ChatGPT modules working).
- **Hostname in scope**: `chatgpt.com` only.
- **No config migration**: treat the `dist/`-loaded extension as the new baseline.
- **Other sites**: can be removed for now (no support/guarantee).
- **Core “portable” modules to keep & make extensible**:
  - `quicknav` (conversation navigation / scroll-lock)
  - `chatgpt_cmdenter_send` (Cmd+Enter to send)
  - `hide_disclaimer` (generic banner/disclaimer hide)
- **Secondary QA convenience site**: `https://chat.qwen.ai` is used only as a no-login smoke-test surface for the portable modules (not a product target).

### Current Architecture (Evidence-Based)
- Entry points:
  - `manifest.json` -> `background/sw.js`
  - `manifest.json` -> `content/bootstrap.js`
- Single sources of truth:
  - `shared/registry.js` (sites/modules metadata used by UI)
  - `shared/injections.js` (injection definitions; MAIN/ISOLATED world selection)
- Key problem hotspots:
  - `background/sw.js` does a lot (settings, registration, monitor, reset)
  - Large content scripts: `content/chatgpt-quicknav.js`, `content/chatgpt-usage-monitor/main.js`

### Health Findings To Fix (Evidence-Based)
- Docs/version drift exists: `docs/scripts-inventory.md:4` differs from `manifest.json:5`.
- Storage operations often ignore `chrome.runtime.lastError` (false “success”):
  - `background/sw.js:198` (`getSettings()` read)
  - `background/sw.js:223` (`setSettings()` write)
  - `background/sw.js:288` (`clearStorageArea()`)
- Dynamic content script cleanup can miss stale IDs due to allowlist filtering:
  - `background/sw.js:612` (`getRegisteredQuickNavContentScripts()` filters IDs)
  - `background/sw.js:716` (`applyContentScriptRegistration()` only sees filtered set)
- MAIN-world bridges accept marker-only `window.postMessage` commands:
  - `content/chatgpt-message-tree/main.js:1293`
  - `content/chatgpt-quicknav.js:385`
  - `content/scroll-guard-main.js:218`
- ChatGPT message tree caches auth token in `window` state:
  - `content/chatgpt-message-tree/main.js:115` + `content/chatgpt-message-tree/main.js:226`
- Scroll guards patch global scroll APIs in both MAIN and isolated layers:
  - MAIN: `content/scroll-guard-main.js:602`
  - isolated: `content/chatgpt-quicknav.js:4459`
- Options routing incomplete for some registry modules:
  - registry defines: `shared/registry.js:117` (`openai_new_model_banner`)
  - options falls back: `options/options.js:3126`
- Dev checks don’t gate docs drift; dev self-tests are not part of a unified gate:
  - `dev/check.js:45` only scans runtime roots
  - `dev/check.js:223` ends without docs/self-test gating

### Metis Review (Guardrails Incorporated)
- Define and enforce a ChatGPT “Feature Contract” checklist to prevent accidental regressions.
- Hostnames in scope must be explicit (current registry uses `https://chatgpt.com/*`).
- Decide and document settings/data migration strategy (preserve if feasible; provide reset).
- Maintain stable permissions footprint unless explicitly justified.
- Do not enable code-splitting/dynamic imports in the first pass.
- Add negative tests for bridges (spoofed messages rejected).

### Defaults Applied (No Further Decisions Needed)
- **Hostnames in scope**: confirmed `chatgpt.com` only; keep match scope as-is (`https://chatgpt.com/*`) to avoid permission expansion.
- **Permissions**: keep `permissions` / `host_permissions` stable unless a change is explicitly justified and reviewed.
- **Bundler choice**: use **esbuild** first (fast, simple multi-entry); avoid code-splitting/dynamic imports initially.
- **SW format**: target MV3 module service worker (bundle output remains deterministic).
- **Settings/data**: preserve existing `chrome.storage.*` keys where feasible; if a breaking migration is required, provide a schema version + migration + reset path.
- **dist in git**: treat `dist/` as generated build output (do not commit) unless the user later requests a “pull-and-reload without building” workflow.

---

## Work Objectives

### Core Objective
Deliver a TS + bundler-based MV3 extension that loads from `dist/`, is safer across MAIN/ISOLATED boundaries, and is substantially easier to maintain/extend (especially for ChatGPT).

### Concrete Deliverables
- `package.json` + `tsconfig.json` + build scripts producing a complete `dist/` extension.
- New source layout under `src/` with clear module boundaries.
- Updated `dist/manifest.json` generated deterministically.
- Hardened bridge protocol with nonce handshake for MAIN-world helpers.
- Reduced duplication across site quicknav scripts (ChatGPT-first, others best-effort).
- Updated docs under `docs/` to match behavior; inventory regenerated.

### Definition of Done
- [x] `npm run build` produces a self-contained `dist/` folder with `dist/manifest.json`.
- [x] Extension can be loaded unpacked from `dist/` and reloaded repeatedly.
- [x] Manual QA checklist passes on ChatGPT (core modules) without console errors.
- [x] No secrets (auth tokens) are stored on `window` in MAIN-world code.
- [x] `node dev/check.js` passes and includes docs/version drift gating.
- [x] Version bumped (patch) and docs updated per repo policy.

### Must Have
- ChatGPT core features remain usable (QuickNav UI, scroll-lock, tree, etc.)
- Strong error handling in background Chrome API wrappers (no swallowed lastError on critical paths)
- Robust, idempotent injection registration/unregistration (stale scripts removed)
- Clear lifecycle cleanup to reduce memory leak risk (AbortController-based)
- The 3 portable modules (`quicknav`, `chatgpt_cmdenter_send`, `hide_disclaimer`) are refactored into an explicit “core modules” layer designed for future site adaptation.

### Must NOT Have (Guardrails)
- No new permissions/host_permissions unless explicitly justified and reviewed.
- Reducing/removing permissions is allowed (and expected) if we remove non-ChatGPT sites.
- No secrets stored in a globally readable `window.*` object.
- No code-splitting / dynamic imports in the first migration pass.
- No “docs say X, code does Y” drift at the end (drift must be gated).

---

## Verification Strategy (Manual QA, Agent-Executed)

### Test Decision
- **Automated unit/E2E frameworks**: None (per user preference)
- **Type safety gate**: YES (`tsc --noEmit`)
- **Existing dev checks**: YES (`node dev/check.js`)
- **Existing dev self-tests**: YES (usage monitor bridge/utils self-tests)

### Agent-Executed QA Tooling
- Primary: `chrome-devtools-attached` (reuse the user’s existing Chrome session)
- Secondary: `interactive_bash` (for terminal commands/builds)

### Universal QA Rules
- After every major build/change, reload extension from `chrome://extensions`.
- Ensure only ONE instance of this extension is enabled at a time (if both “root-loaded” and `dist/`-loaded copies exist, disable the other) to avoid double injection and false memory/perf signals.
- If a tab becomes unresponsive / repeated timeouts occur, treat it as a potential memory leak:
  - Open `chrome://taskmanager` and check the tab’s memory.
  - Close that tab; reopen a fresh tab; continue QA.
  - Capture evidence notes/screenshots in `.sisyphus/evidence/`.

### dist/ Bootstrapping Note (Why It Currently Looks Like a Copy)
- The current `dist/` folder was intentionally created as a **mirror copy** so Chrome could load the extension from `dist/` immediately (stable folder path + stable extension ID).
- After the TS+bundler build pipeline lands, `dist/` becomes **generated output** (cleaned and rebuilt on each build). The mirror-copy step is temporary.

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Foundation)
- Build system + dist load root
- Baseline QA checklist and evidence capture conventions

Wave 2 (Core refactor)
- Background SW modularization + error handling
- Shared typed config + manifest generation

Wave 3 (ChatGPT-first)
- Bridge hardening + token/state cleanup
- Scroll guard consolidation

Wave 4 (Polish + drift prevention)
- Options routing completeness
- Docs sync + dev gating
- Full manual QA sweep

---

## TODOs

> Notes:
> - This is a large refactor; prefer “strangler” steps with rollback checkpoints.
> - Repo policy requires commits and patch version bumps; plan commits at milestones.

### 1) Baseline snapshot + refactor branch

**What to do**:
- Create a new git branch for the refactor (keep history).
- Record current version (1.3.64) and key storage keys/settings surfaces.
- Write an explicit ChatGPT “Feature Contract” checklist used for QA.

**Must NOT do**:
- Do not change runtime behavior yet.

**Recommended Agent Profile**:
- Category: `unspecified-high`
- Skills: `git-master` (for safe branching + rollback checkpoints)

**References**:
- `manifest.json` (version baseline)
- `shared/registry.js` (ChatGPT module list)
- `background/sw.js` (settings keys, message types)

**Acceptance Criteria**:
- [x] New branch exists
- [x] Feature contract checklist exists in `.sisyphus/` (planning/QA artifact)

**Agent-Executed QA Scenarios**:
- Scenario: Verify current extension behavior baseline
  - Tool: chrome-devtools-attached
  - Steps: Open ChatGPT, confirm QuickNav UI present, confirm no fatal console errors
  - Evidence: `.sisyphus/evidence/baseline-chatgpt-ui.png`

### 1.5) Prune non-ChatGPT surfaces (ChatGPT + Qwen only)

**What to do**:
- Reduce scope in registry/injections and permissions:
  - Keep ChatGPT site + all ChatGPT modules.
  - Keep Qwen site only as a smoke-test target (portable modules only).
  - Remove/disable other sites/modules for now (no guarantees).
  - Reduce `host_permissions` accordingly (no new permissions).

**Must NOT do**:
- Do not accidentally drop any ChatGPT module.

**References**:
- `shared/registry.js` (sites/modules list; currently contains many sites)
- `shared/injections.js` (matches/defs; remove non-ChatGPT/Qwen defs)
- `manifest.json` / generated manifest (host_permissions)

**Acceptance Criteria**:
- [x] Extension only injects on `chatgpt.com` and `chat.qwen.ai`.
- [x] All ChatGPT modules still appear in Options and can be toggled.
- [x] No new permissions were added; non-ChatGPT host permissions were removed.

### 2) Introduce TS + esbuild build system (no code-splitting)

**What to do**:
- Add Node tooling (`package.json`) and a deterministic multi-entry build.
- Create `src/` and a `public/` (static assets) + generate `dist/` as the extension root.
- Initially prefer a “mirror build”: copy existing JS/HTML/assets into `dist/` to enable early `dist/` loading.

**Must NOT do**:
- No behavior refactors yet; the goal is build parity and a stable reload workflow.

**Recommended Agent Profile**:
- Category: `deep`
- Skills: `frontend-ui-ux` (only if options/popup HTML wiring needs touch), omit otherwise

**References**:
- `background/sw.js`, `content/bootstrap.js`, `shared/*.js`, `options/*`, `popup/*`

**Acceptance Criteria**:
- [x] `npm run build` produces `dist/manifest.json`
- [x] Filenames in `dist/` are deterministic (no hashes)
- [x] Extension can be loaded unpacked from `dist/`

**Agent-Executed QA Scenarios**:
- Scenario: Reload extension from dist without errors
  - Tool: chrome-devtools-attached
  - Steps: Navigate `chrome://extensions` -> reload extension -> open ChatGPT -> verify QuickNav UI still appears

### 3) Manifest generation + single version source of truth

**What to do**:
- Introduce a base manifest template (permissions remain stable).
- Generate `dist/manifest.json` during build.
- Define “single source of truth” for version (recommended: manifest version) and propagate to docs generation.

**Must NOT do**:
- Do not expand `permissions`/`host_permissions` without explicit justification.

**Recommended Agent Profile**:
- Category: `unspecified-high`

**References**:
- `manifest.json`
- `dev/sync-manifest.js` (current drift tooling)
- `dev/check.js` (current validation)

**Acceptance Criteria**:
- [x] `dist/manifest.json` version equals repo version
- [x] Build fails if manifest generation fails

### 4) Shared config migration: `shared/registry` + `shared/injections` -> typed TS

**What to do**:
- Convert config into typed TS modules (no chrome APIs inside).
- Keep schema stable initially; later allow controlled evolution.
- Ensure both background and UI read from the same built config.

**Must NOT do**:
- No match-pattern behavior changes yet (ChatGPT currently: `https://chatgpt.com/*`).

**Recommended Agent Profile**:
- Category: `deep`

**References**:
- `shared/registry.js` (current schema and module list)
- `shared/injections.js` (defs, world/runAt)

**Acceptance Criteria**:
- [x] UI still lists modules/sites correctly
- [x] Injection defs build and register without errors

### 5) Background SW refactor: modularize + error-aware Chrome API wrappers

**What to do**:
- Split `background/sw.js` into modules: storage, message router, injection registration, monitors, reset.
- Wrap Chrome APIs and *always* check `chrome.runtime.lastError` on critical ops.
- Harden message routing: sender gating for side-effect commands (e.g., notifications).

**Must NOT do**:
- Don’t silently fall back to empty registry/injections and persist normalized settings in degraded mode.

**Recommended Agent Profile**:
- Category: `deep`

**References**:
- `background/sw.js` (settings + message types + registration)

**Acceptance Criteria**:
- [x] Settings read/write failures propagate `{ok:false, error}` to callers
- [x] `QUICKNAV_NOTIFY` is sender-gated like other mutating messages

**Agent-Executed QA Scenarios**:
- Scenario: Toggle module enable -> registration updates
  - Tool: chrome-devtools-attached
  - Steps: Open options -> disable a ChatGPT module -> reload ChatGPT tab -> verify module stops running

### 6) Dynamic content script reconciliation: remove stale registered IDs

**What to do**:
- Replace allowlist-only discovery with robust reconciliation:
  - Discover *all* registered content scripts and remove those matching the QuickNav namespace/prefix.
  - Keep explicit legacy IDs list for migrations.

**Must NOT do**:
- Do not unregister unrelated extensions’ scripts.

**References**:
- `background/sw.js` registration logic
- `shared/injections.js` content script IDs

**Acceptance Criteria**:
- [x] After rebuild + reload, only current QuickNav scripts remain registered

### 7) Cross-world bridge hardening (MAIN <-> ISOLATED)

**What to do**:
- Implement a nonce handshake protocol:
  - Content script generates nonce, passes to MAIN script at init.
  - MAIN only accepts messages with matching `{channel, v, nonce}`.
- Strict schema validation + allowlist message types.
- Add negative test: spoofed messages are ignored.

**Must NOT do**:
- No secrets/tokens in `window` state.

**References**:
- `content/chatgpt-quicknav.js` tree bridge client
- `content/chatgpt-message-tree/main.js` bridge server
- `content/scroll-guard-main.js` message sink

**Acceptance Criteria**:
- [x] Spoofed `window.postMessage({__quicknav:1,...})` without nonce does nothing

### 8) ChatGPT message tree: remove auth token from `window` state

**What to do**:
- Ensure auth tokens are stored only in closure / extension context.
- If caching needed, keep it non-exported and ephemeral.
- Ensure the tree bridge remains functional.

**References**:
- `content/chatgpt-message-tree/main.js` (`authCache`, fetch session)
- `shared/injections.js` (this module runs in MAIN world)

**Acceptance Criteria**:
- [x] `window.__aichat_chatgpt_message_tree_state__` does not contain token values
- [x] Tree summary/navigate still works

### 9) Scroll guard consolidation: one patch layer

**What to do**:
- Decide a single authoritative guard (recommended: MAIN world only).
- Remove/disable isolated-world global prototype patching in ChatGPT QuickNav.
- Keep dataset sync and allow-window logic, but enforce bridge nonce.

**References**:
- `content/scroll-guard-main.js` (MAIN world patch)
- `content/chatgpt-quicknav.js` (isolated patch + handshake)

**Acceptance Criteria**:
- [x] Only one layer patches scroll APIs
- [x] Scroll-lock works on ChatGPT without regressions

### 10) ChatGPT usage monitor: fix data mutation + skip UI work in forced silent mode

**What to do**:
- Fix the `sharedQuotaGroups.requests` load path (avoid wiping data).
- When forced silent mode is on, do not install styles/scrambler/intervals.

**References**:
- `content/chatgpt-usage-monitor/main.js` (forced silent mode + UI enabled)

**Acceptance Criteria**:
- [x] No unintended clearing of shared quota request arrays
- [x] In forced silent mode, UI bootstrap does not run

### 11) Options/popup: complete module routing + fix misleading copy

**What to do**:
- Ensure every module in registry has a reachable settings panel (even if it’s basic toggle).
- Fix the GPT53 monitor “delete URL stops alerts” inconsistency by aligning behavior and copy.

**References**:
- `options/options.js` module routing switch
- `options/options.html` GPT53 monitor copy
- `background/sw.js` GPT53 monitor URL normalization

**Acceptance Criteria**:
- [x] No registry module falls into “unknown module” panel
- [x] GPT53 monitor stop semantics are consistent and documented

### 12) Docs + inventory regeneration (drift-free)

**What to do**:
- Regenerate `docs/scripts-inventory.md` from the canonical registry.
- Update `docs/deep-dive.md` where behavior changed.
- Add/upgrade a drift check that fails if docs version != manifest version.

**References**:
- `dev/gen-scripts-inventory.js`
- `docs/scripts-inventory.md`
- `docs/deep-dive.md`

**Acceptance Criteria**:
- [x] Docs inventory version equals manifest version
- [x] Drift check fails on mismatch

### 13) Dev tooling gate improvements

**What to do**:
- Extend `dev/check.js` to:
  - include docs drift validation
  - run existing dev self-tests
  - optionally include `dev/` script syntax checks

**References**:
- `dev/check.js`
- `dev/test-usage-monitor-utils.js`
- `dev/test-usage-monitor-bridge.js`

**Acceptance Criteria**:
- [x] `node dev/check.js` fails when docs/version drift exists
- [x] `node dev/check.js` runs the dev self-tests and fails on error

### 14) Full manual QA sweep (ChatGPT-first) + memory leak protocol

**What to do**:
- Execute the Feature Contract checklist against ChatGPT:
  - QuickNav UI appears once; no duplication after SPA navigation
  - Scroll-lock blocks autoscroll correctly
  - Tree bridge open/summary/navigate works
  - Options toggles persist and affect runtime
- Run a long-session smoke: navigate between chats repeatedly and watch for slowdown.
- If a page becomes unresponsive: open `chrome://taskmanager`, confirm memory suspicion, close tab, reopen, continue.

**Acceptance Criteria**:
- [x] No fatal console errors in SW and in ChatGPT page
- [x] Feature contract checks all pass
- [x] Evidence screenshots/notes captured under `.sisyphus/evidence/`

---

## Commit Strategy

- Use a dedicated branch.
- Prefer milestone commits (build foundation, SW modularization, bridge hardening, ChatGPT core stabilization, docs gating).
- Each milestone commit includes:
  - patch version bump
  - docs updates if behavior/config changed
  - `node dev/check.js` passing

---

## Success Criteria

### Verification Commands
```bash
npm run build
node dev/check.js
```

### Final Checklist
- [x] Extension loads unpacked from `dist/` and reload works
- [x] ChatGPT primary features stable
- [x] Bridges hardened; secrets not exposed on `window`
- [x] No drift between docs and manifest version
