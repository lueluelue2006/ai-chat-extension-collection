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
    chrome.runtime.sendMessage({ type: 'QUICKNAV_BOOTSTRAP_PING', href: location.href }, () => void chrome.runtime.lastError);
  } catch {}
})();

