(() => {
  'use strict';

  // ChatGPT usage counter (lite)
  // Goals:
  // - Extremely low overhead (no subtree MutationObserver)
  // - Count sends by observing POST /backend-api/conversation via the shared fetch hub
  // - Small optional overlay; updates only on sends / day changes

  const FLAG = '__aichat_chatgpt_usage_counter_lite_v1__';
  try {
    if (globalThis[FLAG]) return;
    Object.defineProperty(globalThis, FLAG, { value: true, configurable: true });
  } catch {
    try {
      if (globalThis[FLAG]) return;
      globalThis[FLAG] = true;
    } catch {}
  }

  // Only run in top frame (avoid split-view iframe double counting).
  try {
    if (window.self !== window.top) return;
  } catch {
    return;
  }

  const STORE_KEY = '__qn_chatgpt_usage_counter_lite_v1__';
  const OVERLAY_ID = '__qn_chatgpt_usage_counter_lite_overlay_v1__';
  const MAX_DAYS = 62;

  function dayKey(ts = Date.now()) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const data = raw ? safeJsonParse(raw, null) : null;
      if (!data || typeof data !== 'object') return { v: 1, days: {}, updatedAt: 0 };
      if (!data.days || typeof data.days !== 'object') data.days = {};
      if (typeof data.updatedAt !== 'number') data.updatedAt = 0;
      data.v = 1;
      return data;
    } catch {
      return { v: 1, days: {}, updatedAt: 0 };
    }
  }

  function saveStore(data) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch {}
  }

  function pruneDays(data) {
    try {
      const keys = Object.keys(data.days || {}).sort();
      if (keys.length <= MAX_DAYS) return;
      const remove = keys.slice(0, Math.max(0, keys.length - MAX_DAYS));
      for (const k of remove) {
        try {
          delete data.days[k];
        } catch {}
      }
    } catch {}
  }

  function inc(modelId) {
    const model = String(modelId || '').trim();
    if (!model) return;

    const data = loadStore();
    const dk = dayKey();
    if (!data.days[dk] || typeof data.days[dk] !== 'object') data.days[dk] = {};
    if (typeof data.days[dk][model] !== 'number') data.days[dk][model] = 0;
    data.days[dk][model] += 1;
    data.updatedAt = Date.now();
    pruneDays(data);
    saveStore(data);
    renderOverlay(data);
  }

  function resetToday() {
    try {
      const data = loadStore();
      const dk = dayKey();
      if (data.days && data.days[dk]) delete data.days[dk];
      data.updatedAt = Date.now();
      saveStore(data);
      renderOverlay(data);
    } catch {}
  }

  function formatTodayLine(data) {
    const dk = dayKey();
    const day = (data && data.days && data.days[dk]) || {};
    const entries = Object.entries(day).filter(([, v]) => typeof v === 'number' && v > 0);
    entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const total = entries.reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
    const top = entries[0] ? `${entries[0][0]} ${entries[0][1]}` : '—';
    return `用量(Lite) 今日 ${total} | ${top}`;
  }

  function formatDetail(data) {
    const dk = dayKey();
    const day = (data && data.days && data.days[dk]) || {};
    const entries = Object.entries(day).filter(([, v]) => typeof v === 'number' && v > 0);
    entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const lines = [];
    lines.push(formatTodayLine(data));
    lines.push('');
    if (!entries.length) {
      lines.push('（暂无记录）');
      lines.push('');
      lines.push('点击：展开/收起');
      lines.push('Shift+点击：清空今日');
      return lines.join('\n');
    }
    for (const [k, v] of entries.slice(0, 14)) lines.push(`${k}: ${v}`);
    if (entries.length > 14) lines.push(`… +${entries.length - 14}`);
    lines.push('');
    lines.push('点击：展开/收起');
    lines.push('Shift+点击：清空今日');
    return lines.join('\n');
  }

  function ensureOverlayEl() {
    try {
      const existing = document.getElementById(OVERLAY_ID);
      if (existing) return existing;
    } catch {}

    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.dataset.open = '0';
    el.style.cssText = [
      'position:fixed',
      'right:10px',
      'bottom:10px',
      'z-index:2147483606',
      'font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
      'color:#0f172a',
      'background:rgba(255,255,255,0.86)',
      'border:1px solid rgba(148,163,184,0.65)',
      'border-radius:10px',
      'padding:6px 8px',
      'box-shadow:0 10px 26px rgba(0,0,0,0.12)',
      'backdrop-filter:blur(10px)',
      'white-space:pre',
      'max-width:52vw',
      'user-select:none',
      'cursor:pointer'
    ].join(';');

    el.addEventListener(
      'click',
      (e) => {
        try {
          if (e && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            resetToday();
            return;
          }
          const open = el.dataset.open === '1';
          el.dataset.open = open ? '0' : '1';
          renderOverlay(loadStore());
          e.preventDefault();
          e.stopPropagation();
        } catch {}
      },
      true
    );

    (document.documentElement || document.body).appendChild(el);
    return el;
  }

  function renderOverlay(data = null) {
    const d = data && typeof data === 'object' ? data : loadStore();
    const el = ensureOverlayEl();
    if (!el) return;
    const open = el.dataset.open === '1';
    el.textContent = open ? formatDetail(d) : formatTodayLine(d);
  }

  // Refresh overlay at next local day boundary (in case page stays open overnight).
  let dayTimer = 0;
  function scheduleNextDayRefresh() {
    if (dayTimer) {
      try {
        clearTimeout(dayTimer);
      } catch {}
      dayTimer = 0;
    }
    try {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 3, 0);
      const ms = Math.max(1000, next.getTime() - now.getTime());
      dayTimer = setTimeout(() => {
        dayTimer = 0;
        renderOverlay(loadStore());
        scheduleNextDayRefresh();
      }, ms);
    } catch {}
  }

  function installViaHub() {
    try {
      const hub = window.__aichat_chatgpt_fetch_hub_v1__ || null;
      if (!hub || typeof hub.register !== 'function') return false;
      hub.register({
        priority: 20,
        onConversationStart: (ctx) => {
          try {
            const payload = ctx?.conversation?.payload;
            const model = payload && typeof payload === 'object' ? payload.model : null;
            if (typeof model === 'string' && model) inc(model);
          } catch {}
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  function installFallbackFetchPatch() {
    try {
      const originalFetch = window.fetch;
      if (typeof originalFetch !== 'function') return false;
      if (originalFetch.__qnUsageLitePatched) return true;
      const wrapped = new Proxy(originalFetch, {
        apply: async (target, thisArg, args) => {
          try {
            const [input, init] = args || [];
            const url = typeof input === 'string' ? input : input?.url || input?.href || '';
            const method = (init?.method || input?.method || 'GET').toUpperCase();
            if (method === 'POST' && /\/backend-api\/(?:f\/)?conversation(?:\?|$)/.test(String(url || ''))) {
              let bodyText = null;
              try {
                if (init && typeof init.body === 'string') bodyText = init.body;
                else if (input instanceof Request) bodyText = await input.clone().text();
              } catch {}
              if (bodyText) {
                const obj = safeJsonParse(bodyText, null);
                const model = obj && typeof obj === 'object' ? obj.model : null;
                if (typeof model === 'string' && model) inc(model);
              }
            }
          } catch {}
          return target.apply(thisArg, args);
        }
      });
      wrapped.__qnUsageLitePatched = true;
      window.fetch = wrapped;
      return true;
    } catch {
      return false;
    }
  }

  // Boot
  renderOverlay(loadStore());
  scheduleNextDayRefresh();

  if (!installViaHub()) {
    installFallbackFetchPatch();
  }

  // Dev-only hook (safe): allow manual increment from console.
  try {
    if (!window.__qnUsageLiteDebugInc) {
      window.__qnUsageLiteDebugInc = (model = 'debug') => inc(model);
    }
  } catch {}
})();
