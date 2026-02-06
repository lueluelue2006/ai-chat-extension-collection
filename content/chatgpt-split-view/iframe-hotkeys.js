(() => {
  'use strict';

  // Tiny bootstrap that loads the heavy implementation only inside the split iframe.
  // (Split view must be ~0 cost when disabled/closed.)

  function isSplitViewIframe() {
    try {
      const fe = window.frameElement;
      if (!fe || fe.nodeType !== 1) return false;
      return String(fe.id || '').startsWith('qn-split-iframe');
    } catch {
      return false;
    }
  }

  // Only run inside the split-view iframe.
  if (!isSplitViewIframe()) return;

  const FLAG = '__qnSplitIframeHotkeysBootstrapV1__';
  try {
    if (globalThis[FLAG]) return;
    Object.defineProperty(globalThis, FLAG, { value: true, configurable: true });
  } catch {
    try {
      if (globalThis[FLAG]) return;
      globalThis[FLAG] = true;
    } catch {}
  }

  const url = (() => {
    try {
      return chrome.runtime.getURL('content/chatgpt-split-view/iframe-hotkeys-impl.mjs');
    } catch {
      return '';
    }
  })();

  if (!url) return;

  import(url)
    .then((mod) => {
      try {
        if (typeof mod?.initSplitIframeHotkeys === 'function') mod.initSplitIframeHotkeys();
      } catch {}
    })
    .catch(() => void 0);
})();
