/* QuickNav MV3 bootstrap content script
 * - Runs from manifest (not dynamically registered)
 * - Wakes up the MV3 service worker so it can (re)register dynamic scripts and reinject when needed
 */
(() => {
  'use strict';

  try {
    if (window.__quicknavBootstrapV1) return;
    Object.defineProperty(window, '__quicknavBootstrapV1', { value: true, configurable: true });
  } catch {
    try {
      if (window.__quicknavBootstrapV1) return;
      window.__quicknavBootstrapV1 = true;
    } catch {}
  }

  try {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
    let attempt = 0;
    let ensureAttempt = 0;

    const ensureInjected = () => {
      try {
        // If the shared bridge exists, at least one dynamic script is already running in this tab.
        if (globalThis.__aichat_quicknav_bridge_v1__) return;
      } catch {}

      ensureAttempt += 1;
      if (ensureAttempt > 2) return;
      try {
        chrome.runtime.sendMessage({ type: 'QUICKNAV_BOOTSTRAP_ENSURE', href: location.href }, () => void chrome.runtime.lastError);
      } catch {}
    };

    const ping = () => {
      attempt++;
      chrome.runtime.sendMessage({ type: 'QUICKNAV_BOOTSTRAP_PING', href: location.href }, (res) => {
        const err = chrome.runtime.lastError;
        if (!err && res && res.ok) return;
        if (attempt >= 3) return;
        setTimeout(ping, 200 * attempt);
      });
    };
    ping();

    // Safety net: on some Chrome/MV3 edge cases the registered scripts may not run on first load.
    // Re-check shortly after start and ask SW to inject missing modules into *this* tab.
    setTimeout(ensureInjected, 1200);
    setTimeout(ensureInjected, 3200);
  } catch {}
})();
