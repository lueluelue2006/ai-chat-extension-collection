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
  } catch {}
})();
