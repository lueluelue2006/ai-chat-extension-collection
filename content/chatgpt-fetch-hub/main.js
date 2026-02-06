(() => {
  'use strict';

  const HUB_KEY = '__aichat_chatgpt_fetch_hub_v1__';
  const FETCH_PATCH_FLAG = '__aichatChatGPTFetchHubPatchedV1__';

  // Some deployments may inject this hub with `allFrames: true`.
  // Avoid patching fetch in every internal ChatGPT iframe: only allow top-frame
  // (normal usage) and our split-view iframe.
  const isAllowedFrame = (() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    if (!inIframe) return true;

    try {
      const fe = window.frameElement;
      return !!(fe && fe.nodeType === 1 && String(fe.id || '') === 'qn-split-iframe');
    } catch {
      return false;
    }
  })();

  if (!isAllowedFrame) return;

  try {
    const existing = window[HUB_KEY];
    if (existing && typeof existing === 'object' && existing.__installed) {
      // fetch can be overwritten by other scripts/extensions after we install.
      // Re-install is idempotent and keeps the hub functional.
      try {
        existing.install?.();
      } catch {}
      return;
    }
  } catch {}

  const now = () => Date.now();

  function getStableNativeFetch() {
    // Fast path: use the page's `fetch` when it looks native.
    // This avoids creating an extra hidden iframe (which costs memory).
    // Fallback to iframe-based fetch if `fetch` is wrapped by the site or other extensions.
    try {
      if (
        typeof window.fetch === 'function' &&
        Function.prototype.toString.call(window.fetch).includes('[native code]')
      ) {
        return window.fetch;
      }
    } catch {}

    // Prefer getting `fetch` from a clean realm (iframe) to avoid sites/extensions
    // that wrap `window.fetch` (sometimes with spoofed `Function#toString`).
    try {
      const IFRAME_ID = '__aichat_chatgpt_fetch_hub_native_iframe_v1__';
      let iframe = document.getElementById(IFRAME_ID);
      if (!iframe || iframe.tagName !== 'IFRAME') {
        iframe = document.createElement('iframe');
        iframe.id = IFRAME_ID;
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        iframe.style.cssText =
          'display:none !important; width:0 !important; height:0 !important; border:0 !important; position:absolute !important; left:-9999px !important; top:-9999px !important;';
        iframe.src = 'about:blank';

        const host = document.documentElement || document.head || document.body;
        host?.appendChild(iframe);
      }

      const f = iframe.contentWindow?.fetch;
      if (typeof f === 'function') return f;
    } catch {}

    return typeof window.fetch === 'function' ? window.fetch : null;
  }

  function safeCall(fn, ...args) {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  }

  function toUrlString(input) {
    try {
      if (typeof input === 'string') return input;
      if (input instanceof Request) return input.url || '';
      if (input && typeof input === 'object') {
        if (typeof input.url === 'string') return input.url;
        if (typeof input.href === 'string') return input.href;
      }
    } catch {}
    return '';
  }

  function getMethod(input, init) {
    try {
      const m = (init && typeof init.method === 'string' && init.method) || (input instanceof Request ? input.method : '') || 'GET';
      return String(m || 'GET').toUpperCase();
    } catch {
      return 'GET';
    }
  }

  function isConversationSendUrl(url) {
    if (!url) return false;
    return /\/backend-api\/(?:f\/)?conversation(?:\?|$)/.test(String(url));
  }

  function isUserLastUsedModelConfigUrl(url) {
    if (!url) return false;
    return String(url).includes('/backend-api/settings/user_last_used_model_config');
  }

  function buildInitFromRequest(req, init) {
    const out = init ? { ...init } : {};
    try {
      if (out.method == null && req?.method) out.method = req.method;
      if (out.headers == null && req?.headers) out.headers = req.headers;
      if (out.credentials == null && req?.credentials) out.credentials = req.credentials;
      if (out.mode == null && req?.mode) out.mode = req.mode;
      if (out.cache == null && req?.cache) out.cache = req.cache;
      if (out.redirect == null && req?.redirect) out.redirect = req.redirect;
      if (out.referrer == null && req?.referrer) out.referrer = req.referrer;
      if (out.referrerPolicy == null && req?.referrerPolicy) out.referrerPolicy = req.referrerPolicy;
      if (out.integrity == null && req?.integrity) out.integrity = req.integrity;
      if (out.keepalive === undefined && typeof req?.keepalive === 'boolean') out.keepalive = req.keepalive;
      if (out.signal == null && req?.signal) out.signal = req.signal;
    } catch {}
    return out;
  }

  async function readRequestBodyText(input, init) {
    try {
      if (init && typeof init.body === 'string') return init.body;
      if (input instanceof Request) {
        try {
          return await input.clone().text();
        } catch {
          return null;
        }
      }
    } catch {}
    return null;
  }

  function responseLooksLikeSse(response) {
    try {
      const ct = response?.headers?.get?.('content-type') || '';
      return /\btext\/event-stream\b/i.test(ct);
    } catch {
      return false;
    }
  }

  function createHub() {
    const nativeFetch = getStableNativeFetch();
    const currentFetch = typeof window.fetch === 'function' ? window.fetch : null;
    const state = {
      __installed: true,
      nativeFetch,
      originalFetch: currentFetch || nativeFetch,
      installedFetch: null,
      hooks: {
        beforeFetch: [],
        conversationPayload: [],
        conversationStart: [],
        conversationResponse: [],
        conversationSseJson: [],
        conversationSseText: [],
        conversationDone: []
      }
    };

    // Guard against wrappers that call window.fetch synchronously, which can cause recursion.
    let inOriginalFetchCall = false;

    function addHook(list, fn, priority = 0) {
      if (typeof fn !== 'function') return () => void 0;
      const entry = { fn, priority: Number(priority) || 0 };
      list.push(entry);
      list.sort((a, b) => (a.priority || 0) - (b.priority || 0));
      return () => {
        const idx = list.indexOf(entry);
        if (idx >= 0) list.splice(idx, 1);
      };
    }

    function register(hooks) {
      const unsub = [];
      const h = hooks && typeof hooks === 'object' ? hooks : {};
      if (h.beforeFetch) unsub.push(addHook(state.hooks.beforeFetch, h.beforeFetch, h.priority));
      if (h.onConversationPayload) unsub.push(addHook(state.hooks.conversationPayload, h.onConversationPayload, h.priority));
      if (h.onConversationStart) unsub.push(addHook(state.hooks.conversationStart, h.onConversationStart, h.priority));
      if (h.onConversationResponse) unsub.push(addHook(state.hooks.conversationResponse, h.onConversationResponse, h.priority));
      if (h.onConversationSseJson) unsub.push(addHook(state.hooks.conversationSseJson, h.onConversationSseJson, h.priority));
      if (h.onConversationSseText) unsub.push(addHook(state.hooks.conversationSseText, h.onConversationSseText, h.priority));
      if (h.onConversationDone) unsub.push(addHook(state.hooks.conversationDone, h.onConversationDone, h.priority));
      return () => {
        for (const u of unsub) safeCall(u);
      };
    }

    function shouldParseConversationStream() {
      return (
        state.hooks.conversationSseJson.length > 0 ||
        state.hooks.conversationSseText.length > 0 ||
        state.hooks.conversationDone.length > 0
      );
    }

    function shouldParseConversationStreamFully() {
      return state.hooks.conversationSseJson.length > 0 || state.hooks.conversationSseText.length > 0;
    }

    async function parseConversationSseStream(response, ctx) {
      if (!responseLooksLikeSse(response)) {
        ctx.stream = { ...ctx.stream, doneAt: now(), sawDone: false, error: null, contentType: 'non-sse' };
        for (const h of state.hooks.conversationDone) safeCall(h.fn, ctx);
        return;
      }

      const body = response?.body;
      if (!body || typeof body.getReader !== 'function') {
        ctx.stream = { ...ctx.stream, doneAt: now(), sawDone: false, error: null, contentType: 'no-body' };
        for (const h of state.hooks.conversationDone) safeCall(h.fn, ctx);
        return;
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      /** @type {string[]} */
      let dataLines = [];
      // Safety caps: guard against malformed SSE streams (no '\n', no blank line, no [DONE]) which would
      // otherwise cause unbounded string growth and potentially OOM the renderer.
      const MAX_BUFFER_CHARS = 1024 * 1024; // keep this conservative; strings are UTF-16 in JS
      const MAX_EVENT_CHARS = 2 * 1024 * 1024;
      let eventChars = 0;
      let sawDone = false;
      let firstByteAt = null;
      let streamError = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!firstByteAt) firstByteAt = now();
          let chunk = decoder.decode(value, { stream: true });
          if (chunk.includes('\r')) chunk = chunk.replace(/\r/g, '');
          buffer += chunk;
          if (buffer.length > MAX_BUFFER_CHARS) {
            // Keep only the tail. If the stream still has no newline, abort parsing to avoid OOM.
            buffer = buffer.slice(-MAX_BUFFER_CHARS);
            if (buffer.indexOf('\n') === -1) {
              streamError = new Error('SSE parse aborted: line too long (missing newline)');
              try {
                await reader.cancel();
              } catch {}
              break;
            }
          }

          let idx;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);

            if (line.startsWith('data:')) {
              const part = line.slice(5).trimStart();
              eventChars += part.length;
              if (eventChars > MAX_EVENT_CHARS) {
                streamError = new Error('SSE parse aborted: event too large');
                try {
                  await reader.cancel();
                } catch {}
                sawDone = false;
                break;
              }
              dataLines.push(part);
              continue;
            }

            if (line.trim() === '') {
              if (!dataLines.length) continue;
              const data = dataLines.join('\n');
              dataLines = [];
              eventChars = 0;

              if (!data) continue;
              if (data === '[DONE]') {
                sawDone = true;
                try {
                  await reader.cancel();
                } catch {}
                break;
              }

              for (const h of state.hooks.conversationSseText) safeCall(h.fn, data, ctx);
              if (state.hooks.conversationSseJson.length) {
                let json = null;
                try {
                  json = JSON.parse(data);
                } catch {
                  json = null;
                }
                if (json) {
                  for (const h of state.hooks.conversationSseJson) safeCall(h.fn, json, ctx);
                }
              }
            }
          }

          if (streamError) break;
          if (sawDone) break;
        }
      } catch (e) {
        streamError = e instanceof Error ? e : new Error(String(e));
      }

      ctx.stream = {
        ...ctx.stream,
        firstByteAt: ctx.stream.firstByteAt || firstByteAt,
        doneAt: now(),
        sawDone,
        error: streamError
      };
      for (const h of state.hooks.conversationDone) safeCall(h.fn, ctx);
    }

    const SSE_DONE_RE = /(?:^|\n)data:\s*\[DONE\]\s*(?:\n|$)/;

    async function drainConversationSseStream(response, ctx) {
      if (!responseLooksLikeSse(response)) {
        ctx.stream = { ...ctx.stream, doneAt: now(), sawDone: false, error: null, contentType: 'non-sse' };
        for (const h of state.hooks.conversationDone) safeCall(h.fn, ctx);
        return;
      }

      const body = response?.body;
      if (!body || typeof body.getReader !== 'function') {
        ctx.stream = { ...ctx.stream, doneAt: now(), sawDone: false, error: null, contentType: 'no-body' };
        for (const h of state.hooks.conversationDone) safeCall(h.fn, ctx);
        return;
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let firstByteAt = null;
      let sawDone = false;
      let streamError = null;
      let tail = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!firstByteAt) firstByteAt = now();
          if (value) {
            let chunk = decoder.decode(value, { stream: true });
            if (chunk.includes('\r')) chunk = chunk.replace(/\r/g, '');
            tail += chunk;
            if (tail.length > 4096) tail = tail.slice(-4096);
            if (SSE_DONE_RE.test(tail)) {
              sawDone = true;
              try {
                await reader.cancel();
              } catch {}
              break;
            }
          }
        }
      } catch (e) {
        streamError = e instanceof Error ? e : new Error(String(e));
      }

      ctx.stream = {
        ...ctx.stream,
        firstByteAt: ctx.stream.firstByteAt || firstByteAt,
        doneAt: now(),
        sawDone,
        error: streamError
      };
      for (const h of state.hooks.conversationDone) safeCall(h.fn, ctx);
    }

    async function wrappedFetch(input, init) {
      if (inOriginalFetchCall) {
        const fallbackFetch = state.nativeFetch || state.originalFetch;
        if (typeof fallbackFetch !== 'function') throw new Error('fetch is not a function');
        return fallbackFetch.call(this, input, init);
      }

      const originalFetch = state.originalFetch;
      if (typeof originalFetch !== 'function') throw new Error('fetch is not a function');

      let nextInput = input;
      let nextInit = init;
      let url = toUrlString(nextInput);
      let method = getMethod(nextInput, nextInit);

      const ctx = {
        id: `fh:${now().toString(16)}:${Math.random().toString(16).slice(2)}`,
        startedAt: now(),
        url,
        method,
        input: nextInput,
        init: nextInit,
        conversation: null,
        stream: { firstByteAt: null, doneAt: null, sawDone: false, error: null },
        response: null
      };

      // Generic beforeFetch hooks (e.g. URL rewrites)
      for (const h of state.hooks.beforeFetch) {
        const out = safeCall(h.fn, ctx);
        if (out && typeof out === 'object') {
          if (out.input !== undefined) nextInput = out.input;
          if (out.init !== undefined) nextInit = out.init;
        }
        url = toUrlString(nextInput);
        method = getMethod(nextInput, nextInit);
        ctx.url = url;
        ctx.method = method;
        ctx.input = nextInput;
        ctx.init = nextInit;
      }

      // Conversation payload hooks (only when needed)
      const isConversation = isConversationSendUrl(url) && method === 'POST';
      const shouldReadConversationBody = isConversation && (state.hooks.conversationPayload.length > 0 || state.hooks.conversationStart.length > 0);
      if (shouldReadConversationBody) {
        let bodyText = await readRequestBodyText(nextInput, nextInit);
        if (bodyText) {
          let payload = null;
          try {
            payload = JSON.parse(bodyText);
          } catch {
            payload = null;
          }
          if (payload && typeof payload === 'object') {
            ctx.conversation = { payload };
            if (state.hooks.conversationPayload.length) {
              for (const h of state.hooks.conversationPayload) {
                const outPayload = safeCall(h.fn, payload, ctx);
                if (outPayload && typeof outPayload === 'object') payload = outPayload;
              }
              const nextBodyText = JSON.stringify(payload);
              if (nextBodyText !== bodyText) {
                const reqForInit = nextInput instanceof Request ? nextInput : input instanceof Request ? input : null;
                if (reqForInit && !(nextInit && typeof nextInit.body === 'string')) {
                  nextInput = url;
                  nextInit = buildInitFromRequest(reqForInit, nextInit);
                  nextInit.body = nextBodyText;
                } else {
                  nextInit = nextInit ? { ...nextInit, body: nextBodyText } : { method: 'POST', body: nextBodyText };
                }
                ctx.input = nextInput;
                ctx.init = nextInit;
                ctx.conversation = { payload };
              }
            }
          } else {
            ctx.conversation = { payload: null };
          }
        } else {
          ctx.conversation = { payload: null };
        }
      } else if (isConversation) {
        ctx.conversation = { payload: null };
      }

      // Notify conversation start (before actual request)
      if (isConversation && state.hooks.conversationStart.length) {
        for (const h of state.hooks.conversationStart) safeCall(h.fn, ctx);
      }

      // Special-case: some hooks need to read these URLs, but don't want to parse bodies
      // Expose it via ctx (cheap).
      if (isUserLastUsedModelConfigUrl(url)) {
        ctx.isUserLastUsedModelConfig = true;
      }

      let response;
      let responsePromise;
      inOriginalFetchCall = true;
      try {
        responsePromise = originalFetch.call(this, nextInput, nextInit);
      } catch (e) {
        // Some wrappers call `window.fetch` internally; if that creates recursion and throws,
        // fall back to a stable native fetch.
        const fallbackFetch = state.nativeFetch;
        if (typeof fallbackFetch === 'function' && fallbackFetch !== originalFetch) {
          responsePromise = fallbackFetch.call(this, nextInput, nextInit);
        } else {
          throw e;
        }
      } finally {
        inOriginalFetchCall = false;
      }
      response = await responsePromise;
      ctx.response = response;

      if (isConversation && state.hooks.conversationResponse.length) {
        for (const h of state.hooks.conversationResponse) safeCall(h.fn, ctx);
      }

      // Parse SSE in background (do NOT block page fetch)
      if (isConversation && shouldParseConversationStream()) {
        try {
          const clone = response?.clone?.();
          if (clone) {
            void (shouldParseConversationStreamFully() ? parseConversationSseStream(clone, ctx) : drainConversationSseStream(clone, ctx));
          } else {
            ctx.stream = { ...ctx.stream, doneAt: now(), sawDone: false, error: null, contentType: 'no-clone' };
            for (const h of state.hooks.conversationDone) safeCall(h.fn, ctx);
          }
        } catch (e) {
          ctx.stream = { ...ctx.stream, doneAt: now(), sawDone: false, error: e instanceof Error ? e : new Error(String(e)) };
          for (const h of state.hooks.conversationDone) safeCall(h.fn, ctx);
        }
      }

      return response;
    }

    function install() {
      const currentFetch = typeof window.fetch === 'function' ? window.fetch : null;
      if (currentFetch && currentFetch[FETCH_PATCH_FLAG]) {
        state.installedFetch = currentFetch;
        return;
      }
      if (typeof state.originalFetch !== 'function') {
        const safeCurrent = currentFetch && !currentFetch[FETCH_PATCH_FLAG] ? currentFetch : null;
        state.originalFetch = state.nativeFetch || safeCurrent;
      }
      if (typeof state.originalFetch !== 'function') return;
      const fn = function (input, init) {
        return wrappedFetch.call(this, input, init);
      };
      try {
        Object.defineProperty(fn, FETCH_PATCH_FLAG, { value: true, enumerable: false });
      } catch {
        try {
          fn[FETCH_PATCH_FLAG] = true;
        } catch {}
      }
      window.fetch = fn;
      state.installedFetch = fn;
    }

    return Object.freeze({
      __installed: true,
      register,
      install,
      getOriginalFetch: () => state.originalFetch
    });
  }

  // Only enable on ChatGPT hosts (safety if accidentally injected elsewhere).
  try {
    const host = String(location.hostname || '').toLowerCase();
    if (host !== 'chatgpt.com') return;
  } catch {}

  const hub = createHub();
  try {
    Object.defineProperty(window, HUB_KEY, { value: hub, configurable: false, enumerable: false, writable: false });
  } catch {
    try {
      window[HUB_KEY] = hub;
    } catch {}
  }
  try {
    hub.install();
    const reinstall = () => {
      try {
        hub.install();
      } catch {}
    };
    setTimeout(reinstall, 0);
    setTimeout(reinstall, 250);
    setTimeout(reinstall, 1200);
    setTimeout(reinstall, 5000);
    window.addEventListener('load', reinstall, { once: true });
  } catch {}
})();
