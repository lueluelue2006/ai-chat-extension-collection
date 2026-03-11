(() => {
  'use strict';

  // Avoid patching downloads in iframes.
  const ALLOWED_FRAME = (() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    return !inIframe;
  })();
  if (!ALLOWED_FRAME) return;

  const GUARD_KEY = '__tm_chatgpt_download_urldecode_fix_v1__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  const PATH_MARKER_1 = '/backend-api/conversation/';
  const PATH_MARKER_2 = '/interpreter/download';
  const SANDBOX_PARAM = 'sandbox_path';
  const MAX_DECODE_TIMES = 10;

  function isString(v) {
    return typeof v === 'string' || v instanceof String;
  }

  function toUrlString(input) {
    if (isString(input)) return String(input);
    if (input && typeof input === 'object') {
      if (typeof input.href === 'string') return input.href;
      if (typeof input.url === 'string') return input.url;
    }
    return null;
  }

  function deepDecodeOnceStable(value) {
    let current = value;
    for (let i = 0; i < MAX_DECODE_TIMES; i++) {
      let next;
      try {
        next = decodeURIComponent(current);
      } catch {
        return current;
      }
      if (next === current) return current;
      current = next;
    }
    return current;
  }

  function shouldInspectUrl(urlStr) {
    if (!urlStr) return false;
    if (urlStr.indexOf(PATH_MARKER_1) === -1) return false;
    if (urlStr.indexOf(PATH_MARKER_2) === -1) return false;
    if (urlStr.indexOf(SANDBOX_PARAM) === -1) return false;
    return true;
  }

  function isTargetPath(pathname) {
    if (!pathname) return false;
    if (!pathname.endsWith(PATH_MARKER_2)) return false;
    if (pathname.indexOf(PATH_MARKER_1) !== 0) return false;
    return true;
  }

  function fixDownloadUrl(urlStr) {
    if (!shouldInspectUrl(urlStr)) return null;

    let u;
    try {
      u = new URL(urlStr, location.origin);
    } catch {
      return null;
    }

    if (!isTargetPath(u.pathname)) return null;

    const raw = u.searchParams.get(SANDBOX_PARAM);
    if (!raw) return null;
    if (raw.indexOf('%') === -1) return null;

    const decoded = deepDecodeOnceStable(raw);
    if (decoded === raw) return null;

    u.searchParams.set(SANDBOX_PARAM, decoded);
    return u.toString();
  }

  function methodIsGet(input, init) {
    const m = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';
    return String(m).toUpperCase() === 'GET';
  }

  function normalizeHeaders(headers) {
    try {
      if (!headers) return undefined;
      if (headers instanceof Headers) return headers;
      return new Headers(headers);
    } catch {
      return undefined;
    }
  }

  function buildInitFromRequest(req, init) {
    const out = init ? { ...init } : {};
    if (out.method == null && req && req.method) out.method = req.method;
    if (out.headers == null && req && req.headers) out.headers = req.headers;
    if (out.credentials == null && req && req.credentials) out.credentials = req.credentials;
    if (out.mode == null && req && req.mode) out.mode = req.mode;
    if (out.cache == null && req && req.cache) out.cache = req.cache;
    if (out.redirect == null && req && req.redirect) out.redirect = req.redirect;
    if (out.referrer == null && req && req.referrer) out.referrer = req.referrer;
    if (out.referrerPolicy == null && req && req.referrerPolicy) out.referrerPolicy = req.referrerPolicy;
    if (out.integrity == null && req && req.integrity) out.integrity = req.integrity;
    if (out.keepalive === undefined && req && typeof req.keepalive === 'boolean') out.keepalive = req.keepalive;
    if (out.signal == null && req && req.signal) out.signal = req.signal;

    if (out.headers != null) out.headers = normalizeHeaders(out.headers) || out.headers;
    return out;
  }

  // Use the shared fetch hub to avoid stacked fetch patches.
  try {
    const consumerBase = window.__aichat_chatgpt_fetch_consumer_base_v1__;
    const hub = window.__aichat_chatgpt_fetch_hub_v1__;
    const registerConsumer =
      consumerBase && typeof consumerBase.registerConsumer === 'function'
        ? (key, handlers) => consumerBase.registerConsumer(key, handlers)
        : hub && typeof hub.register === 'function'
          ? (_key, handlers) => hub.register(handlers)
          : null;
    if (registerConsumer) {
      registerConsumer('chatgpt-download-file-fix', {
        priority: 10,
        beforeFetch: (ctx) => {
          try {
            const urlStr = toUrlString(ctx?.input) || toUrlString(ctx?.url) || '';
            if (!urlStr) return;
            if (String(ctx?.method || '').toUpperCase() !== 'GET') return;
            const fixed = fixDownloadUrl(urlStr);
            if (!fixed) return;

            const input = ctx?.input;
            const init = ctx?.init;
            if (isString(input) || (input && typeof input === 'object' && typeof input.href === 'string')) {
              return { input: fixed, init };
            }
            if (input instanceof Request) {
              const mergedInit = buildInitFromRequest(input, init);
              return { input: fixed, init: mergedInit };
            }
            return { input: fixed, init };
          } catch {}
        }
      });
    }
  } catch {}

  const XHROpen = XMLHttpRequest && XMLHttpRequest.prototype && XMLHttpRequest.prototype.open;
  if (typeof XHROpen === 'function') {
    XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
      const urlStr = toUrlString(url);
      if (urlStr && String(method).toUpperCase() === 'GET') {
        const fixed = fixDownloadUrl(urlStr);
        if (fixed) return XHROpen.call(this, method, fixed, async, user, password);
      }
      return XHROpen.call(this, method, url, async, user, password);
    };
  }
})();
