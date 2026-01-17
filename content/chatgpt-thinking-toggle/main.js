(() => {
  'use strict';

  const DEBUG = false;
  const LOG_PREFIX = '[AIChat][ThinkingToggle]';
  const HOTKEY_COOLDOWN_MS = 500;
  const FETCH_SNIFF_FLAG = '__tm_thinking_toggle_fetch_sniffed__';
  const TOAST_STYLE_ID = '__tm_thinking_toggle_toast_style';
  const TOAST_CONTAINER_ID = '__tm_thinking_toggle_toast_container';
  const PULSE_STYLE_ID = '__tm_thinking_toggle_pulse_style';
  const PULSE_CLASS = '__tm_thinking_toggle_pulse';
  const HINT_CLASS = '__tm_thinking_toggle_hint';
  const HINT_ATTR = 'data-tm-thinking-toggle-hint';
  const PULSE_RGB_VAR = '--__tmThinkingTogglePulseRGB';
  const PULSE_RGB_LOW = '56,189,248'; // blue
  const PULSE_RGB_HIGH = '239,68,68'; // red

  let busy = false;
  let lastHotkeyAt = 0;

  function log(...args) {
    if (!DEBUG) return;
    // eslint-disable-next-line no-console
    console.debug(LOG_PREFIX, ...args);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function ensurePulseStyle() {
    if (document.getElementById(PULSE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PULSE_STYLE_ID;
    style.textContent = `
@keyframes __tmThinkingTogglePulse {
  0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(var(${PULSE_RGB_VAR}, ${PULSE_RGB_LOW}), 0);    filter: brightness(1); }
  45%  { transform: scale(1.06); box-shadow: 0 0 0 6px rgba(var(${PULSE_RGB_VAR}, ${PULSE_RGB_LOW}), .35); filter: brightness(1.18); }
  100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(var(${PULSE_RGB_VAR}, ${PULSE_RGB_LOW}), 0);    filter: brightness(1); }
}
button.${PULSE_CLASS} {
  animation: __tmThinkingTogglePulse 650ms ease-in-out 0s 1;
  will-change: transform, box-shadow, filter;
}

@keyframes __tmThinkingToggleHintFade {
  0%   { opacity: 0; transform: translate(-50%, -120%) scale(.98); }
  12%  { opacity: 1; transform: translate(-50%, -130%) scale(1); }
  78%  { opacity: 1; transform: translate(-50%, -130%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -140%) scale(.99); }
}
button.${HINT_CLASS} { position: relative; }
button.${HINT_CLASS}::after {
  content: attr(${HINT_ATTR});
  position: absolute;
  left: 50%;
  top: 0;
  transform: translate(-50%, -130%);
  pointer-events: none;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  color: rgba(255, 255, 255, .94);
  background: rgba(0, 0, 0, .72);
  border: 1px solid rgba(var(${PULSE_RGB_VAR}, ${PULSE_RGB_LOW}), .55);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .22);
  animation: __tmThinkingToggleHintFade 900ms ease-in-out 0s 1;
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureToastStyle() {
    if (document.getElementById(TOAST_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TOAST_STYLE_ID;
    style.textContent = `
@keyframes __tmThinkingToggleToastInOut {
  0% { opacity: 0; transform: translateY(8px); }
  12% { opacity: 1; transform: translateY(0); }
  86% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(8px); }
}
#${TOAST_CONTAINER_ID} {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  pointer-events: none;
}
#${TOAST_CONTAINER_ID} .__tmThinkingToggleToast {
  pointer-events: none;
  max-width: min(520px, 76vw);
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.35;
  color: rgba(255,255,255,.95);
  background: rgba(0,0,0,.75);
  border: 1px solid rgba(255,255,255,.14);
  box-shadow: 0 10px 26px rgba(0,0,0,.25);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: __tmThinkingToggleToastInOut 2200ms ease-in-out 0s 1;
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (container) return container;
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    (document.body || document.documentElement).appendChild(container);
    return container;
  }

  function showToast(text) {
    try {
      ensureToastStyle();
      const container = ensureToastContainer();
      const toast = document.createElement('div');
      toast.className = '__tmThinkingToggleToast';
      toast.textContent = text;
      container.appendChild(toast);
      window.setTimeout(() => toast.remove(), 2400);
    } catch (_) {
      // ignore
    }
  }

  function pulseOnce(el, rgb) {
    if (!(el instanceof HTMLElement)) return;
    ensurePulseStyle();
    try {
      el.style.setProperty(PULSE_RGB_VAR, rgb);
      el.classList.remove(PULSE_CLASS);
      // 强制 reflow 以便重复触发动画
      void el.offsetWidth;
      el.classList.add(PULSE_CLASS);
    } catch (_) {
      // ignore
    }
  }

  function hintOnce(el, text, rgb) {
    if (!(el instanceof HTMLElement)) return;
    ensurePulseStyle();
    try {
      el.style.setProperty(PULSE_RGB_VAR, rgb);
      el.setAttribute(HINT_ATTR, text);
      el.classList.remove(HINT_CLASS);
      void el.offsetWidth;
      el.classList.add(HINT_CLASS);
    } catch (_) {
      // ignore
    }
  }

  function schedulePulse(pill, isHigh, hintText) {
    const rgb = isHigh ? PULSE_RGB_HIGH : PULSE_RGB_LOW;
    window.setTimeout(() => {
      let target = pill;
      if (!(target instanceof HTMLElement) || !document.contains(target)) {
        const root = getComposerRoot();
        const pills = Array.from(root.querySelectorAll('button.__composer-pill'));
        target = pills.find((p) => /thinking|pro/i.test((p.textContent || '').trim())) || pills[0] || null;
      }
      if (!target) return;
      pulseOnce(target, rgb);
      if (hintText) hintOnce(target, hintText, rgb);
    }, 80);
  }

  function info(message) {
    // eslint-disable-next-line no-console
    console.log(LOG_PREFIX, message);
  }

  function warn(message) {
    // eslint-disable-next-line no-console
    console.warn(LOG_PREFIX, message);
  }

  function error(message, err) {
    // eslint-disable-next-line no-console
    if (typeof err === 'undefined') console.error(LOG_PREFIX, message);
    else console.error(LOG_PREFIX, message, err);
  }

  function isConversationSendUrl(url) {
    if (typeof url !== 'string') return false;
    return /\/backend-api\/f\/conversation(?:\?|$)/.test(url);
  }

  function sniffEffortInfo(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const model = typeof payload.model === 'string' ? payload.model : '';
    const effort = typeof payload.thinking_effort === 'string' ? payload.thinking_effort : '';
    if (!effort) return null;

    let mode = 'unknown';
    if (/\bpro\b/i.test(model)) mode = 'pro';
    else if (/\bthinking\b/i.test(model)) mode = 'thinking';
    else if (effort === 'min' || effort === 'max') mode = 'thinking';
    else if (effort === 'standard' || effort === 'extended') mode = 'pro';

    return { mode, model, effort };
  }

  function installFetchSniffer() {
    if (window[FETCH_SNIFF_FLAG]) return;
    window[FETCH_SNIFF_FLAG] = true;

    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') return;

    window.fetch = async function (input, init) {
      /** @type {{mode:string,model:string,effort:string}|null} */
      let effortInfo = null;

      try {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : typeof input?.url === 'string'
                ? input.url
                : '';

        const method =
          (init && typeof init.method === 'string' && init.method) || (input instanceof Request ? input.method : 'GET');

        if (isConversationSendUrl(url) && String(method).toUpperCase() === 'POST') {
          let bodyText = null;
          if (init && typeof init.body === 'string') {
            bodyText = init.body;
          } else if (input instanceof Request) {
            try {
              bodyText = await input.clone().text();
            } catch (_) {
              bodyText = null;
            }
          }

          if (bodyText) {
            let payload = null;
            try {
              payload = JSON.parse(bodyText);
            } catch (_) {
              payload = null;
            }
            effortInfo = sniffEffortInfo(payload);
          }
        }
      } catch (e) {
        log(e);
      }

      const response = await originalFetch.apply(this, arguments);

      try {
        if (effortInfo && response && response.ok) {
          const suffix = effortInfo.model ? ` (${effortInfo.model})` : '';
          if (effortInfo.mode === 'thinking') showToast(`发送成功：thinking ${effortInfo.effort}${suffix}`);
          else if (effortInfo.mode === 'pro') showToast(`发送成功：pro ${effortInfo.effort}${suffix}`);
          else showToast(`发送成功：thinking_effort=${effortInfo.effort}${suffix}`);
        }
      } catch (_) {
        // ignore
      }

      return response;
    };
  }

  function isHotkey(event) {
    if (!event.metaKey) return false;
    if (event.ctrlKey || event.altKey || event.shiftKey) return false;

    const code = typeof event.code === 'string' ? event.code : '';
    const key = typeof event.key === 'string' ? event.key : '';
    return code === 'KeyO' || key.toLowerCase() === 'o';
  }

  function clickLikeUser(el) {
    if (!(el instanceof Element)) return false;
    try {
      el.focus?.();
    } catch (_) {
      // ignore
    }

    const base = { bubbles: true, cancelable: true };

    try {
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          ...base,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true
        })
      );
      el.dispatchEvent(
        new PointerEvent('pointerup', {
          ...base,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true
        })
      );
    } catch (_) {
      // ignore
    }

    el.dispatchEvent(new MouseEvent('mousedown', base));
    el.dispatchEvent(new MouseEvent('mouseup', base));
    el.dispatchEvent(new MouseEvent('click', base));
    return true;
  }

  function getComposerRoot() {
    return document.querySelector('#thread-bottom-container') || document.body;
  }

  function listComposerPills() {
    const root = getComposerRoot();
    return Array.from(
      root.querySelectorAll("button.__composer-pill[aria-haspopup='menu'],button.__composer-pill")
    ).filter((el) => el instanceof HTMLButtonElement);
  }

  function getEffortItems(menu) {
    const items = Array.from(menu.querySelectorAll("[role='menuitemradio']"));
    /** @type {Element|null} */
    let light = null;
    /** @type {Element|null} */
    let standard = null;
    /** @type {Element|null} */
    let extended = null;
    /** @type {Element|null} */
    let heavy = null;

    for (const item of items) {
      const t = (item.textContent || '').trim().toLowerCase();
      if (!light && /\blight\b/.test(t)) light = item;
      if (!standard && /\bstandard\b/.test(t)) standard = item;
      if (!extended && /\bextended\b/.test(t)) extended = item;
      if (!heavy && /\bheavy\b/.test(t)) heavy = item;
    }

    return { light, standard, extended, heavy };
  }

  function menuHasEffortOptions(menu) {
    const { light, standard, extended, heavy } = getEffortItems(menu);
    const hasTwo = !!standard && !!extended;
    const hasFourExtremes = !!light && !!heavy;
    return hasTwo || hasFourExtremes;
  }

  function findMenuForPill(pill) {
    if (!(pill instanceof Element)) return null;
    const labelId = typeof pill.id === 'string' ? pill.id : '';
    if (!labelId) return null;

    const menus = Array.from(document.querySelectorAll("[role='menu']"));
    for (const menu of menus) {
      if (menu.getAttribute('aria-labelledby') === labelId) return menu;
    }
    return null;
  }

  async function findEffortPill() {
    const pills = listComposerPills();
    if (!pills.length) return null;
    if (pills.length === 1) return pills[0];

    /** @type {HTMLButtonElement[]} */
    const ordered = [];

    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && active.matches('button.__composer-pill')) {
      ordered.push(active);
    }

    const likely = pills.filter((p) => /thinking|pro/i.test((p.textContent || '').trim()));
    for (const p of likely) if (!ordered.includes(p)) ordered.push(p);
    for (const p of pills) if (!ordered.includes(p)) ordered.push(p);

    for (const pill of ordered) {
      const opened = await openThinkingMenu(pill);
      if (!opened) continue;

      /** @type {Element|null} */
      let menu = null;
      for (let i = 0; i < 8; i++) {
        menu = findMenuForPill(pill);
        if (menu) break;
        await sleep(40);
      }

      if (menu && menuHasEffortOptions(menu)) return pill;

      // 不是推理强度菜单：关掉再继续试下一个
      clickLikeUser(pill);
      await sleep(60);
    }

    return ordered[0] || null;
  }

  async function openThinkingMenu(pill) {
    clickLikeUser(pill);
    await sleep(60);
    if (pill.getAttribute('aria-expanded') === 'true') return true;
    if (pill.getAttribute('data-state') === 'open') return true;

    clickLikeUser(pill);
    await sleep(120);
    return pill.getAttribute('aria-expanded') === 'true' || pill.getAttribute('data-state') === 'open';
  }

  async function toggleThinkingTime() {
    if (busy) return;
    busy = true;

    try {
      const pill = await findEffortPill();
      if (!pill) {
        warn('没找到推理强度选择器（可能当前模型/页面不支持）');
        return;
      }

      const opened = await openThinkingMenu(pill);
      if (!opened) {
        warn('打开推理强度菜单失败');
        return;
      }

      /** @type {Element|null} */
      let menu = null;
      for (let i = 0; i < 10; i++) {
        menu = findMenuForPill(pill);
        if (menu && menuHasEffortOptions(menu)) break;
        await sleep(50);
      }
      if (!menu) {
        warn('没找到推理强度菜单');
        return;
      }

      const { light, standard, extended, heavy } = getEffortItems(menu);

      if (light && heavy) {
        const heavyChecked = heavy.getAttribute('aria-checked') === 'true';
        const target = heavyChecked ? light : heavy;
        clickLikeUser(target);
        const label = heavyChecked ? 'Light' : 'Heavy';
        info(`检测到thinking模式，切换到${label} thinking`);
        try {
          pill.title = label;
        } catch (_) {
          // ignore
        }
        schedulePulse(pill, !heavyChecked, label);
        return;
      }

      if (!standard || !extended) {
        warn('菜单里没看到 Standard/Extended');
        return;
      }

      const extendedChecked = extended.getAttribute('aria-checked') === 'true';
      const target = extendedChecked ? standard : extended;
      clickLikeUser(target);
      const label = extendedChecked ? 'Standard' : 'Extended';
      info(`检测到pro模式，切换到${label} thinking`);
      try {
        pill.title = label;
      } catch (_) {
        // ignore
      }
      schedulePulse(pill, !extendedChecked, label);
    } catch (err) {
      log(err);
      error('切换失败', err);
    } finally {
      busy = false;
    }
  }

  // 以 fetch-sniffer 作为“已安装”标记，避免在 reinject / 与 Tampermonkey 共存时重复绑定快捷键
  if (!window[FETCH_SNIFF_FLAG]) {
    window.addEventListener(
      'keydown',
      (event) => {
        if (!isHotkey(event)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (event.repeat) return;
        if (busy) return;

        const now = Date.now();
        if (now - lastHotkeyAt < HOTKEY_COOLDOWN_MS) return;
        lastHotkeyAt = now;

        toggleThinkingTime();
      },
      true
    );
  }

  installFetchSniffer();
})();

