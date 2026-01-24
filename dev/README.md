# Dev Notes (Internal)

This folder is for developer-only smoke tests and diagnostics.

Nothing here is referenced by `manifest.json` or injected as a content script.

## How to use

- Run quick local sanity checks (syntax + registry drift):
  - `node dev/check.js`
- Open the target site in Chrome.
- Open DevTools -> Console.
- Copy/paste the script from `dev/scroll-tests/*.js` into the console and run it.

Scripts print a small PASS/FAIL report and some numeric traces (scrollTop samples).

## Background smoke runner (opens tabs automatically)

1) Load the extension as unpacked.
2) Open `chrome://extensions` -> find this extension -> click "service worker" (Inspect).
3) In the DevTools console, run:
   - `__quicknavDevSmoke.run()` (auto-closes the tabs it opened)
   - Or: `chrome.runtime.sendMessage({ type: 'QUICKNAV_DEV_SMOKE_RUN', opts: { closeTabs: true } }, console.log)`
   - Filter targets: `__quicknavDevSmoke.run({ targets: ['chatgpt'] })` (ids: `chatgpt`, `gemini_app`, `gemini_business`, `grok`, `deepseek`, `zai`, `qwen`, `ernie`, `genspark`)
