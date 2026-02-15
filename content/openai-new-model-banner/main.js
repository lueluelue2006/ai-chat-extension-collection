(() => {
  'use strict';

  const STATE_KEY = '__aichat_openai_new_model_banner_state_v1__';
  const ALERTS_KEY = 'quicknav_gpt53_probe_alerts_v1';
  const MSG_MARK_READ = Object.freeze({ type: 'QUICKNAV_GPT53_MARK_READ' });

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
    btnDismiss: null,
    btnOptions: null,
    onMsg: null
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
        inset: 0;
        display: none;
        pointer-events: none;
      }
      .wrap[data-open='1'] { display: block; }

      .backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.42);
        pointer-events: auto;
      }

      .card {
        position: absolute;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        width: min(980px, calc(100vw - 24px));
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

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';

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

    const btnDismiss = document.createElement('button');
    btnDismiss.className = 'primary';
    btnDismiss.type = 'button';
    btnDismiss.textContent = '知道了（清除角标）';

    const btnOptions = document.createElement('button');
    btnOptions.type = 'button';
    btnOptions.textContent = '打开配置';

    actions.appendChild(btnDismiss);
    actions.appendChild(btnOptions);

    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(meta);
    card.appendChild(actions);

    wrap.appendChild(backdrop);
    wrap.appendChild(card);

    shadow.appendChild(style);
    shadow.appendChild(wrap);

    state.host = host;
    state.shadow = shadow;
    state.wrapper = wrap;
    state.titleEl = title;
    state.msgEl = msg;
    state.metaEl = meta;
    state.btnDismiss = btnDismiss;
    state.btnOptions = btnOptions;

    try {
      (document.documentElement || document.body || document).appendChild(host);
    } catch {
      try {
        document.body?.appendChild(host);
      } catch {}
    }

    const close = () => hide();

    backdrop.addEventListener('click', close, true);

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

    btnDismiss.addEventListener(
      'click',
      async () => {
        // Clear badge + alerts (best-effort).
        try {
          await new Promise((resolve) => {
            chrome.runtime.sendMessage(MSG_MARK_READ, () => {
              void chrome.runtime.lastError;
              resolve();
            });
          });
        } catch {}
        close();
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

  async function maybeShowFromStorage() {
    const raw = await readStoredAlerts();
    if (!raw || typeof raw !== 'object') return;
    const unread = Number(raw.unread) || 0;
    const msg = buildAlertMessage(raw);
    if (!unread || !msg) return;
    show({
      title: 'OpenAI 新模型提示',
      message: `检测到 ${unread} 条资源可访问（每次检测都会提醒）：${msg}`,
      checkedAt: safeNow()
    });
  }

  function onRuntimeMessage(msg) {
    try {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type !== 'QUICKNAV_GPT53_ALERT') return;
      const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
      const title = typeof payload.title === 'string' && payload.title ? payload.title : 'OpenAI 新模型提示';
      const message = typeof payload.message === 'string' ? payload.message : '';
      const unread = Number(payload.unread) || 0;
      const checkedAt = Number(payload.checkedAt) || 0;
      if (!unread || !message) return;
      show({
        title,
        message: `检测到 ${unread} 条资源可访问（每次检测都会提醒）：${message}`,
        checkedAt
      });
    } catch {}
  }

  try {
    state.onMsg = onRuntimeMessage;
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
  } catch {}

  try {
    maybeShowFromStorage();
  } catch {}

  state.destroy = () => {
    try {
      if (typeof state.onMsg === 'function') chrome.runtime.onMessage.removeListener(state.onMsg);
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
