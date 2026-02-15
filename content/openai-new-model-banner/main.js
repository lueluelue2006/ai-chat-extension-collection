(() => {
  'use strict';

  const STATE_KEY = '__aichat_openai_new_model_banner_state_v1__';
  const ALERTS_KEY = 'quicknav_gpt53_probe_alerts_v1';

  const isTopFrame = (() => {
    try {
      return window.self === window.top;
    } catch {
      return false;
    }
  })();
  if (!isTopFrame) return;

  const prev = (() => {
    try {
      return window[STATE_KEY];
    } catch {
      return null;
    }
  })();
  try {
    prev?.destroy?.();
  } catch {}

  const state = {
    host: null,
    shadow: null,
    wrapper: null,
    titleEl: null,
    msgEl: null,
    metaEl: null,
    btnOptions: null,
    onMsg: null,
    onStorage: null
  };

  function safeNow() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function ensureUi() {
    if (state.wrapper && state.shadow) return;

    const host = document.createElement('div');
    host.id = 'aichat-openai-new-model-banner-host';
    host.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"; }

      .wrap {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        width: min(980px, calc(100vw - 24px));
        display: none;
        pointer-events: none;
      }
      .wrap[data-open='1'] { display: block; }

      .card {
        position: relative;
        border-radius: 18px;
        background: rgba(15, 23, 42, 0.96);
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 22px 80px rgba(0,0,0,0.45);
        padding: 18px 18px 14px;
        pointer-events: auto;
        color: #e5e7eb;
      }

      .title {
        font-size: 22px;
        font-weight: 900;
        letter-spacing: 0.2px;
        color: #7dd3fc;
      }
      .msg {
        margin-top: 10px;
        font-size: 16px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .meta {
        margin-top: 10px;
        font-size: 12px;
        opacity: 0.75;
      }
      .actions {
        margin-top: 14px;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      button {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 14px;
        padding: 10px 14px;
        background: rgba(255,255,255,0.08);
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      }
      button:hover { background: rgba(255,255,255,0.12); }
      button:active { transform: translateY(1px); }

      button.primary {
        border-color: transparent;
        background: linear-gradient(135deg, #34d399 0%, #22c55e 55%, #06b6d4 100%);
        color: #08131f;
      }
      button.primary:hover { filter: brightness(1.05); }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'OpenAI 新模型提示';

    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.textContent = '';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = '';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const btnOptions = document.createElement('button');
    btnOptions.className = 'primary';
    btnOptions.type = 'button';
    btnOptions.textContent = '打开配置（删除该 URL 才会停止提醒）';
    actions.appendChild(btnOptions);

    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(meta);
    card.appendChild(actions);

    wrap.appendChild(card);

    shadow.appendChild(style);
    shadow.appendChild(wrap);

    state.host = host;
    state.shadow = shadow;
    state.wrapper = wrap;
    state.titleEl = title;
    state.msgEl = msg;
    state.metaEl = meta;
    state.btnOptions = btnOptions;

    try {
      (document.documentElement || document.body || document).appendChild(host);
    } catch {
      try {
        document.body?.appendChild(host);
      } catch {}
    }

    btnOptions.addEventListener(
      'click',
      () => {
        try {
          const url = chrome?.runtime?.getURL ? chrome.runtime.getURL('options/options.html') : '';
          if (!url) return;
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch {}
      },
      true
    );
  }

  function show({ title, message, checkedAt } = {}) {
    ensureUi();
    if (!state.wrapper) return;
    try {
      if (state.titleEl) state.titleEl.textContent = String(title || 'OpenAI 新模型提示');
    } catch {}
    try {
      if (state.msgEl) state.msgEl.textContent = String(message || '').trim();
    } catch {}
    try {
      const ts = Number(checkedAt) || 0;
      if (state.metaEl) {
        state.metaEl.textContent = ts ? `检测时间：${new Date(ts).toLocaleString()}` : '';
      }
    } catch {}
    try {
      state.wrapper.dataset.open = '1';
    } catch {}
  }

  function hide() {
    try {
      if (state.wrapper) delete state.wrapper.dataset.open;
    } catch {}
  }

  function normalizeAlerts(raw) {
    try {
      if (!raw || typeof raw !== 'object') return { unread: 0, events: [] };
      const unread = Math.max(0, Math.min(99, Number(raw.unread) || 0));
      const rawEvents = Array.isArray(raw.events) ? raw.events : [];
      const events = rawEvents
        .filter((x) => x && typeof x === 'object')
        .map((e) => ({
          at: Number(e.at) || 0,
          url: String(e.url || ''),
          status: Number(e.status) || 0
        }))
        .filter((e) => e.at && e.url);
      return { unread, events };
    } catch {
      return { unread: 0, events: [] };
    }
  }

  function formatAlertLine(ev) {
    try {
      const url = String(ev?.url || '');
      const status = Number(ev?.status) || 0;
      const u = new URL(url);
      const name = String(u.pathname || '').split('/').filter(Boolean).slice(-1)[0] || u.hostname;
      return status ? `${name}（${status}）` : name;
    } catch {
      const status = Number(ev?.status) || 0;
      return status ? `（${status}）` : '';
    }
  }

  function buildAlertMessage(alerts) {
    try {
      const events = Array.isArray(alerts?.events) ? alerts.events : [];
      if (!events.length) return '';
      const last = events.slice(-3);
      const parts = last.map((x) => formatAlertLine(x)).filter(Boolean);
      const more = events.length > 3 ? `…+${events.length - 3}` : '';
      return parts.length ? `${parts.join('，')}${more}` : '';
    } catch {
      return '';
    }
  }

  function readStoredAlerts() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get({ [ALERTS_KEY]: null }, (items) => {
          void chrome.runtime.lastError;
          resolve(items?.[ALERTS_KEY] || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function renderFromAlerts(raw, checkedAt) {
    const alerts = normalizeAlerts(raw);
    const msg = buildAlertMessage(alerts);
    const count = Math.max(Number(alerts.unread) || 0, Array.isArray(alerts.events) ? alerts.events.length : 0);
    if (!count || !msg) return hide();
    const lastAt = (() => {
      try {
        const ev = Array.isArray(alerts.events) && alerts.events.length ? alerts.events[alerts.events.length - 1] : null;
        return Number(ev?.at) || 0;
      } catch {
        return 0;
      }
    })();
    show({
      title: 'OpenAI 新模型提示',
      message: `检测到 ${count} 条资源可访问（每次检测都会提醒）：${msg}\n\n要关闭此提示：打开配置并删除对应 URL。`,
      checkedAt: lastAt || Number(checkedAt) || safeNow()
    });
  }

  async function maybeShowFromStorage() {
    const raw = await readStoredAlerts();
    renderFromAlerts(raw, safeNow());
  }

  function onRuntimeMessage(msg) {
    try {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type !== 'QUICKNAV_GPT53_ALERT') return;
      void maybeShowFromStorage();
    } catch {}
  }

  try {
    state.onMsg = onRuntimeMessage;
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
  } catch {}

  try {
    state.onStorage = (changes, areaName) => {
      try {
        if (areaName !== 'local') return;
        const change = changes?.[ALERTS_KEY];
        if (!change || typeof change !== 'object') return;
        renderFromAlerts(change.newValue, safeNow());
      } catch {}
    };
    chrome.storage.onChanged.addListener(state.onStorage);
  } catch {}

  try {
    maybeShowFromStorage();
  } catch {}

  state.destroy = () => {
    try {
      if (typeof state.onMsg === 'function') chrome.runtime.onMessage.removeListener(state.onMsg);
    } catch {}
    try {
      if (typeof state.onStorage === 'function') chrome.storage.onChanged.removeListener(state.onStorage);
    } catch {}
    try {
      state.host?.remove?.();
    } catch {}
  };

  try {
    Object.defineProperty(window, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[STATE_KEY] = state;
    } catch {}
  }
})();
