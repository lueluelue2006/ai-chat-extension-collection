# Decisions

- Scope: ChatGPT only.
- Hostnames: `chatgpt.com` only.
- Other sites: removed/ignored for now.
- Qwen (`chat.qwen.ai`): smoke-test surface only (no product guarantees).
- Portable core modules to keep extensible: `quicknav`, `chatgpt_cmdenter_send`, `hide_disclaimer`.
- Config migration: not required (treat dist-loaded extension as baseline).
- Build direction: TypeScript + bundler; `dist/` is the Unpacked load root.
