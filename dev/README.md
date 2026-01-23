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
