(() => {
  'use strict';

  // Tiny bootstrap that loads the heavy split-iframe runtime only inside the split iframe.
  // (Split view must be ~0 cost when disabled/closed.)

  const FLAG = '__qnSplitIframeRuntimeBootstrapV1__';
  try {
    if (globalThis[FLAG]) return;
    Object.defineProperty(globalThis, FLAG, { value: true, configurable: true });
  } catch {
    try {
      if (globalThis[FLAG]) return;
      globalThis[FLAG] = true;
    } catch {}
  }

  function isSplitViewIframe() {
    try {
      const fe = window.frameElement;
      if (!fe || fe.nodeType !== 1) return false;
      return String(fe.id || '') === 'qn-split-iframe';
    } catch {
      return false;
    }
  }

  if (!isSplitViewIframe()) return;

  const url = (() => {
    try {
      return chrome.runtime.getURL('content/chatgpt-split-view/iframe-runtime.mjs');
    } catch {
      return '';
    }
  })();
  if (!url) return;

  import(url)
    .then((mod) => {
      try {
        if (typeof mod?.initSplitIframeRuntime === 'function') mod.initSplitIframeRuntime();
      } catch {}
    })
    .catch(() => void 0);
})();

