# Issues

- LSP diagnostics currently unavailable: `typescript-language-server` is not installed. Short-term: rely on `node dev/check.js` + `tsc --noEmit` once TS is added.

## 2026-02-16 — Task 10 (ChatGPT usage monitor) investigation

- sharedQuotaGroups.requests wipe path A (unintentional): `content/chatgpt-usage-monitor/main.js:1037-1050` in `Storage.get()`. Code maps `group.requests` then immediately does `group.requests = []`, so every read destroys the array by replacement assignment (not filtering/push).
- Persistence amplification: `Storage.get()` always persists normalized data via `this.set(data)` at `content/chatgpt-usage-monitor/main.js:1056`; `Storage.set()` -> `GM_setValue()` (`:1060`, `:200-220`) writes localStorage and queues chrome.storage.local sync + rev bump, so the wiped arrays become durable and can propagate.
- sharedQuotaGroups.requests wipe path B (structure rebuild): `content/chatgpt-usage-monitor/main.js:1925-1934` in `applyPlanConfig()`. It resets `data.sharedQuotaGroups = {}` and recreates each group with `requests: []`, dropping prior group arrays whenever plan reapply runs.
- Forced silent mode bootstrap gap: `content/chatgpt-usage-monitor/main.js:4385-4388` installs `installTextScrambler()` + `injectStyles()` under `UI_ENABLED` without checking `isSilent()`/`FORCE_SILENT_MODE`.
- Forced silent mode interval/bootstrap gap: after `if (!UI_ENABLED) return;` (`content/chatgpt-usage-monitor/main.js:4573`), code still schedules UI bootstrap/watchers in silent mode: `scheduleInitialize(0)` (`:4578-4582`), route fallback `setInterval` (`:4608-4615`), and ensure timers (`:4650-4672`).
- Expected from plan: forced silent should short-circuit UI installs (styles/scrambler) and timer/observer bootstrap; current flow only blocks actual panel creation later in `initialize()` (`:4521-4525`).

## 2026-02-16 — MAIN-world global secret/token surface scan

- Scope: MV3 extension scripts under `content/`, `background/`, `shared/`, `options/`, `popup/`; MAIN-world paths prioritized from `shared/injections.ts` `world: 'MAIN'` entries.
- Sensitive finding count: **0** (no token/secret value stored on `window.*`, `document.dataset.*token`, or `localStorage/sessionStorage.*token` in MAIN-world scripts).
- Known hotspot status: `content/chatgpt-message-tree/main.js` now keeps auth data in module-local `authCache` (`:158`, `:297`) rather than in `window.__aichat_chatgpt_message_tree_state__` (`:200`), so bearer token is not globally readable.
- Non-secret global values (informational):
  - `document.documentElement.dataset.quicknavBridgeNonceV1` at `content/quicknav-bridge-main.js:39` and `content/chatgpt-message-tree/main.js:47` (nonce only, expected bridge hardening marker; not a secret).
  - `window.__aichat_cf_challenge_until_v1__` via `window[CF_CHALLENGE_UNTIL_KEY]` at `content/chatgpt-fetch-hub/main.js:191` (Cloudflare cooldown timestamp; not a secret).
- Reproducible `rg` queries used:
  - `rg -n --hidden --glob 'content/**' --glob 'background/**' --glob 'shared/**' --glob 'options/**' --glob 'popup/**' "accessToken"`
  - `rg -n --hidden --glob 'content/**' --glob 'background/**' --glob 'shared/**' --glob 'options/**' --glob 'popup/**' "Bearer"`
  - `rg -n --hidden --glob 'content/**' --glob 'background/**' --glob 'shared/**' --glob 'options/**' --glob 'popup/**' "authorization"`
  - `rg -n --hidden --glob 'content/**' --glob 'background/**' --glob 'shared/**' --glob 'options/**' --glob 'popup/**' "token:"`
  - `rg -n --hidden --glob 'content/**' --glob 'background/**' --glob 'shared/**' --glob 'options/**' --glob 'popup/**' "window\.__"`
  - `rg -n --hidden --glob 'content/**' --glob 'background/**' --glob 'shared/**' --glob 'options/**' --glob 'popup/**' "dataset.*token"`
  - `rg -n --hidden --glob 'content/**' --glob 'background/**' --glob 'shared/**' --glob 'options/**' --glob 'popup/**' "localStorage.*token"`
  - `rg -n --hidden --glob 'content/**/main.js' --glob 'content/*-main.js' "accessToken|Bearer|authorization|token\s*:|secret|api[_-]?key|refresh_token|id_token|sessionToken"`
  - `rg -n --hidden --glob 'content/**/main.js' --glob 'content/*-main.js' "Object\.defineProperty\(window|window\[[^\]]+\]\s*=|window\.[A-Za-z_$][A-Za-z0-9_$]*\s*=|document\.documentElement\.dataset\.[A-Za-z0-9_]+\s*=|localStorage\.setItem\("`
  - `rg -n "world:\s*'MAIN'|js:\s*\[" "shared/injections.ts"`

## 2026-02-16 — Plan scope + host permissions audit

- [x] Confirm plan scope: extension only targets `chatgpt.com` (plus `chat.qwen.ai` smoke-test) and permissions/host_permissions do not include unrelated sites.
- Compared `manifest.json` vs `dist/manifest.json`: both files have identical `host_permissions` and identical bootstrap `content_scripts[].matches`.
- Current `host_permissions` (root + dist):
  - `https://chatgpt.com/*` (primary target)
  - `https://chat.qwen.ai/*` (smoke-test target)
  - `https://cdn.openai.com/*` (extra non-chat host)
- Non-chat host assessment:
  - `https://cdn.openai.com/*` is defined in `shared/injections.ts` as `EXTRA_HOST_PERMISSIONS` and is intentionally used by the `openai_new_model_banner` probe path; justified.
  - No other unrelated host patterns found.
- Shared config scope confirmation:
  - `shared/registry.ts` site list contains only `common`, `chatgpt`, `qwen`.
  - `shared/injections.ts` `siteId` usage contains only `common`, `chatgpt`, `qwen`.
- Source-of-truth pointers:
  - `shared/registry.ts`: canonical site `matchPatterns`.
  - `shared/injections.ts`: `EXTRA_HOST_PERMISSIONS` and content-script defs.
  - `dev/sync-manifest.js`: builds `manifest.json.host_permissions = registry(non-common patterns) + EXTRA_HOST_PERMISSIONS`, and syncs bootstrap matches.
  - `scripts/build.mjs`: mirrors root `manifest.json` into `dist/manifest.json`.
  - `dev/check.js`: validates host_permissions/bootstrap matches against registry + injections.
- Quick validation commands:
  - `node dev/check.js`
  - `node -e "const fs=require('fs');const root=JSON.parse(fs.readFileSync('manifest.json','utf8'));const dist=JSON.parse(fs.readFileSync('dist/manifest.json','utf8'));const out={rootHost:root.host_permissions||[],distHost:dist.host_permissions||[],rootMatches:(root.content_scripts||[]).find(cs=>Array.isArray(cs.js)&&cs.js.includes('content/bootstrap.js'))?.matches||[],distMatches:(dist.content_scripts||[]).find(cs=>Array.isArray(cs.js)&&cs.js.includes('content/bootstrap.js'))?.matches||[]};console.log(JSON.stringify(out,null,2));console.log('host_permissions_equal='+ (JSON.stringify([...out.rootHost].sort())===JSON.stringify([...out.distHost].sort())));console.log('bootstrap_matches_equal='+ (JSON.stringify([...out.rootMatches].sort())===JSON.stringify([...out.distMatches].sort())));"`
  - `rg -n "EXTRA_HOST_PERMISSIONS|host_permissions|matchPatterns|siteId:\s*'" manifest.json dist/manifest.json shared/registry.ts shared/injections.ts dev/check.js dev/sync-manifest.js scripts/build.mjs`
- Validation output snapshot:
  - `host_permissions_equal=true`
  - `bootstrap_matches_equal=true`
  - `node dev/check.js` reports `Registry consistency: OK` and self-tests pass.
