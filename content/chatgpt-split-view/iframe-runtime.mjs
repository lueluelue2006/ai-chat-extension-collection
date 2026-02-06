export function initSplitIframeRuntime() {
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

  const RPC_REQ_TYPE = '__qn_split_iframe_rpc_v1__';
  const RPC_RESP_TYPE = '__qn_split_iframe_rpc_resp_v1__';
  const READY_TYPE = '__qn_split_iframe_ready_v1__';
  const STYLE_ID = 'qn-split-iframe-tweaks';

  const sessionId = (() => {
    try {
      const fe = window.frameElement;
      const v = String(fe?.dataset?.qnSplitSessionId || '').trim();
      return v;
    } catch {
      return '';
    }
  })();

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function safePostToParent(payload) {
    try {
      window.parent.postMessage(payload, location.origin);
    } catch {}
  }

  function sendReady() {
    safePostToParent({ type: READY_TYPE, sessionId });
  }

  function normalizeText(input) {
    return String(input || '').trim();
  }

  function findPrompt(doc) {
    try {
      // ChatGPT composer (2025/2026): ProseMirror is the real editor.
      return (
        doc.querySelector('.ProseMirror[contenteditable="true"]') ||
        doc.querySelector('#prompt-textarea.ProseMirror[contenteditable="true"]') ||
        doc.querySelector('#prompt-textarea[contenteditable="true"]') ||
        doc.querySelector('#prompt-textarea .ProseMirror[contenteditable="true"]') ||
        doc.querySelector('textarea#prompt-textarea') ||
        doc.querySelector('textarea[name="prompt-textarea"]') ||
        null
      );
    } catch {
      return null;
    }
  }

  async function prefillPrompt(text) {
    const msg = `${normalizeText(text)}\n\n`;
    if (!msg.trim()) return false;

    const timeoutMs = 9000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const doc = document;
      const prompt = findPrompt(doc);
      if (!prompt) {
        await sleep(180);
        continue;
      }

      try {
        prompt.focus?.();
      } catch {}

      if (prompt instanceof HTMLTextAreaElement) {
        try {
          prompt.value = msg;
        } catch {}
        try {
          prompt.dispatchEvent(new InputEvent('input', { bubbles: true }));
        } catch {
          try {
            prompt.dispatchEvent(new Event('input', { bubbles: true }));
          } catch {}
        }
        return true;
      }

      // Prefer execCommand to preserve newlines for contenteditable prompts.
      let ok = false;
      try {
        if (typeof doc.execCommand === 'function') {
          try {
            const win = window;
            const sel = win.getSelection?.();
            if (sel && typeof sel.removeAllRanges === 'function' && typeof doc.createRange === 'function') {
              const range = doc.createRange();
              range.selectNodeContents(prompt);
              sel.removeAllRanges();
              sel.addRange(range);
            } else {
              doc.execCommand('selectAll', false);
            }
          } catch {}
          ok = !!doc.execCommand('insertText', false, msg);
        }
      } catch {}

      if (!ok) {
        try {
          prompt.textContent = msg;
        } catch {}
      }

      try {
        prompt.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } catch {
        try {
          prompt.dispatchEvent(new Event('input', { bubbles: true }));
        } catch {}
      }

      return true;
    }

    return false;
  }

  function applyTweaks() {
    try {
      const css = `
        #thread-bottom-container [class*="vt-disclaimer"],
        div.text-token-text-secondary.min-h-8.text-xs[class*="md:px-"] {
          display: none !important;
        }
      `;
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = css;
      return true;
    } catch {
      return false;
    }
  }

  function reply(requestId, ok, result, error) {
    safePostToParent({ type: RPC_RESP_TYPE, sessionId, requestId, ok: !!ok, result, error: error ? String(error) : '' });
  }

  window.addEventListener(
    'message',
    async (event) => {
      try {
        if (!event || event.origin !== location.origin) return;
        const data = event.data;
        if (!data || data.type !== RPC_REQ_TYPE) return;
        if (sessionId && String(data.sessionId || '') !== sessionId) return;

        const requestId = Number(data.requestId) || 0;
        const action = String(data.action || '');

        if (!requestId || !action) return;

        if (action === 'prefill') {
          const ok = await prefillPrompt(data.text);
          reply(requestId, ok, ok, ok ? '' : 'prefill_failed');
          return;
        }

        if (action === 'applyTweaks') {
          const ok = applyTweaks();
          reply(requestId, ok, ok, ok ? '' : 'tweaks_failed');
          return;
        }

        if (action === 'getHref') {
          reply(requestId, true, String(location.href || ''), '');
          return;
        }

        reply(requestId, false, null, `unknown_action:${action}`);
      } catch (e) {
        try {
          const requestId = Number(event?.data?.requestId) || 0;
          if (requestId) reply(requestId, false, null, e instanceof Error ? e.message : String(e));
        } catch {}
      }
    },
    true
  );

  // Best-effort ready signal (parent may choose to ignore).
  try {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      sendReady();
    } else {
      document.addEventListener('DOMContentLoaded', sendReady, { once: true, capture: true });
      setTimeout(sendReady, 1200);
    }
  } catch {
    sendReady();
  }
}

