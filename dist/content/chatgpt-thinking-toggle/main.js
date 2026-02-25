(() => {
  'use strict';

  // Prevent duplicate installs on MV3 reinject / extension reload.
  // This module registers global hotkeys and DOM listeners; running twice can cause double-trigger.
  const GUARD_KEY = '__aichat_chatgpt_thinking_toggle_v1__';
  try {
    if (globalThis[GUARD_KEY]) return;
    Object.defineProperty(globalThis, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });
  } catch {
    try {
      if (globalThis[GUARD_KEY]) return;
      globalThis[GUARD_KEY] = true;
    } catch {}
  }

  const DEBUG = false;
  const LOG_PREFIX = '[AIChat][ThinkingToggle]';
  const HOTKEY_QUEUE_MAX = 12;
  const FETCH_SNIFF_FLAG = '__tm_thinking_toggle_fetch_sniffed__';
  const CF_CHALLENGE_UNTIL_KEY = '__aichat_cf_challenge_until_v1__';
  const MODEL_PREF_KEY = '__aichat_chatgpt_model_pref_v1__';
  const HOTKEY_EFFORT_ENABLED_KEY = '__aichat_chatgpt_thinking_toggle_hotkey_effort_v1__';
  const HOTKEY_MODEL_ENABLED_KEY = '__aichat_chatgpt_thinking_toggle_hotkey_model_v1__';
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
  let hotkeyDrainRunning = false;
  let lastCfToastAt = 0;
  /** @type {('toggle_effort'|'toggle_model')[]} */
  let hotkeyQueue = [];
  let preferredModelMode = null; // 'thinking' | 'pro' | null
  let lastModelByMode = { thinking: '', pro: '' };
  let lastEffortByMode = { thinking: '', pro: '' };
  let pendingModelOverride = null; // 'thinking' | 'pro' | null (one-shot fallback)
  /** @type {HTMLButtonElement|null} */
  let cachedEffortPill = null;
  /** @type {HTMLButtonElement|null} */
  let cachedModelPill = null;
  /** @type {HTMLElement|null} */
  let cachedThinkingProTrigger = null;

  function loadPreferredModelMode() {
    try {
      const v = localStorage.getItem(MODEL_PREF_KEY);
      if (v === 'thinking' || v === 'pro') return v;
      return null;
    } catch {
      return null;
    }
  }

  function savePreferredModelMode(mode) {
    try {
      if (mode === 'thinking' || mode === 'pro') localStorage.setItem(MODEL_PREF_KEY, mode);
      else localStorage.removeItem(MODEL_PREF_KEY);
    } catch {}
  }

  preferredModelMode = loadPreferredModelMode();

  function log(...args) {
    if (!DEBUG) return;
    // eslint-disable-next-line no-console
    console.debug(LOG_PREFIX, ...args);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForValue(read, timeoutMs = 260, intervalMs = 16) {
    const startAt = Date.now();
    while (Date.now() - startAt <= timeoutMs) {
      const value = read();
      if (value) return value;
      await sleep(intervalMs);
    }
    return read();
  }

  async function waitForTruthy(check, timeoutMs = 260, intervalMs = 16) {
    const startAt = Date.now();
    while (Date.now() - startAt <= timeoutMs) {
      if (check()) return true;
      await sleep(intervalMs);
    }
    return !!check();
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

  function isCfChallengeActive() {
    try {
      const until = Number(window[CF_CHALLENGE_UNTIL_KEY] || 0) || 0;
      return until > Date.now();
    } catch {
      return false;
    }
  }

  function toastCfChallengeOnce() {
    // Avoid spamming while the user is retrying hotkeys.
    const nowMs = Date.now();
    if (nowMs - lastCfToastAt < 2000) return;
    lastCfToastAt = nowMs;
    showToast('Cloudflare 验证中：已暂时停用快捷键切换，请稍后再试');
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
    return /\/backend-api\/(?:f\/)?conversation(?:\?|$)/.test(url);
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isHighEffort(effort) {
    const e = normalizeText(effort);
    return e === 'max' || e === 'heavy' || e === 'extended';
  }

  function effortForMode(mode, high) {
    if (mode === 'thinking') return high ? 'max' : 'min';
    if (mode === 'pro') return high ? 'extended' : 'standard';
    return '';
  }

  function guessModeFromEffort(effort) {
    const e = normalizeText(effort);
    if (e === 'min' || e === 'max') return 'thinking';
    if (e === 'standard' || e === 'extended') return 'pro';
    return null;
  }

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

  function inferModelForMode(targetMode, currentModel) {
    const known = lastModelByMode[targetMode];
    if (known) return known;

    const cur = typeof currentModel === 'string' ? currentModel : '';
    const otherMode = targetMode === 'thinking' ? 'pro' : 'thinking';
    const otherKnown = lastModelByMode[otherMode];

    const from = cur || otherKnown || '';
    if (!from) return '';

    if (targetMode === 'pro') {
      if (/\bpro\b/i.test(from)) return from;
      if (/\bthinking\b/i.test(from)) return from.replace(/\bthinking\b/gi, 'pro');
      return '';
    }

    if (/\bthinking\b/i.test(from)) return from;
    if (/\bpro\b/i.test(from)) return from.replace(/\bpro\b/gi, 'thinking');
    return '';
  }

  function mapEffortAcrossModes(targetMode, currentEffort) {
    const high = isHighEffort(currentEffort);
    const target = effortForMode(targetMode, high);
    return target || (targetMode === 'pro' ? 'standard' : 'min');
  }

  function applyModelOverrideToPayload(payload, targetMode) {
    if (!payload || typeof payload !== 'object') return { applied: false, reason: 'bad_payload' };
    if (targetMode !== 'thinking' && targetMode !== 'pro') return { applied: false, reason: 'bad_mode' };

    const currentModel = typeof payload.model === 'string' ? payload.model : '';
    const currentEffort = typeof payload.thinking_effort === 'string' ? payload.thinking_effort : '';

    const nextEffort = mapEffortAcrossModes(targetMode, currentEffort || lastEffortByMode[targetMode] || '');
    if (nextEffort) payload.thinking_effort = nextEffort;

    const nextModel = inferModelForMode(targetMode, currentModel);
    if (nextModel) payload.model = nextModel;

    return { applied: true, model: payload.model || '', effort: payload.thinking_effort || '' };
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

  function readBoolLS(key, fallback) {
    try {
      const raw = localStorage.getItem(String(key || ''));
      if (raw == null) return fallback;
      return raw === '1';
    } catch {
      return fallback;
    }
  }

  const DS_EFFORT_KEY = 'aichatHotkeyEffortEnabled';
  const DS_MODEL_KEY = 'aichatHotkeyModelEnabled';

  function readBoolDataset(key, fallback) {
    try {
      const v = document.documentElement?.dataset?.[String(key || '')];
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
    } catch {}
    return fallback;
  }

  function isHotkeyEnabled(action) {
    if (action === 'toggle_effort') return readBoolDataset(DS_EFFORT_KEY, readBoolLS(HOTKEY_EFFORT_ENABLED_KEY, true));
    if (action === 'toggle_model') return readBoolDataset(DS_MODEL_KEY, readBoolLS(HOTKEY_MODEL_ENABLED_KEY, true));
    return true;
  }

  function getHotkeyAction(event) {
    if (!event.metaKey) return null;
    if (event.ctrlKey || event.altKey || event.shiftKey) return null;

    const code = typeof event.code === 'string' ? event.code : '';
    const key = typeof event.key === 'string' ? event.key : '';
    const k = key.toLowerCase();

    const action = (() => {
      if (code === 'KeyO' || k === 'o') return 'toggle_effort';
      if (code === 'KeyJ' || k === 'j') return 'toggle_model';
      return null;
    })();
    if (!action) return null;
    if (!isHotkeyEnabled(action)) return null;
    return action;
  }

  function installFetchSniffer() {
    if (window[FETCH_SNIFF_FLAG]) return;
    window[FETCH_SNIFF_FLAG] = true;

    const consumerBase = window.__aichat_chatgpt_fetch_consumer_base_v1__;
    const hub = window.__aichat_chatgpt_fetch_hub_v1__;
    const registerConsumer =
      consumerBase && typeof consumerBase.registerConsumer === 'function'
        ? (key, handlers) => consumerBase.registerConsumer(key, handlers)
        : hub && typeof hub.register === 'function'
          ? (_key, handlers) => hub.register(handlers)
          : null;
    if (!registerConsumer) return;

    registerConsumer('chatgpt-thinking-toggle', {
      priority: 110,
      onConversationPayload: (payload, ctx) => {
        /** @type {{mode:string,model:string,effort:string}|null} */
        let effortInfo = null;
        try {
          if (payload && pendingModelOverride) {
            const target = pendingModelOverride;
            const override = applyModelOverrideToPayload(payload, target);
            if (override.applied) pendingModelOverride = null;
          }

          effortInfo = sniffEffortInfo(payload);
          if (effortInfo && (effortInfo.mode === 'thinking' || effortInfo.mode === 'pro')) {
            if (effortInfo.model) lastModelByMode[effortInfo.mode] = effortInfo.model;
            if (effortInfo.effort) lastEffortByMode[effortInfo.mode] = effortInfo.effort;
            if (preferredModelMode !== effortInfo.mode) {
              preferredModelMode = effortInfo.mode;
              savePreferredModelMode(preferredModelMode);
            }
          }
        } catch (e) {
          log(e);
        }

        try {
          if (ctx && typeof ctx === 'object') ctx.__aichatThinkingToggleEffortInfo = effortInfo;
        } catch {}

        return payload;
      },
      onConversationResponse: (ctx) => {
        try {
          const effortInfo = ctx && ctx.__aichatThinkingToggleEffortInfo;
          const respOk = !!ctx?.response?.ok;
          if (!effortInfo || !respOk) return;

          const suffix = effortInfo.model ? ` (${effortInfo.model})` : '';
          if (effortInfo.mode === 'thinking') showToast(`发送成功：thinking ${effortInfo.effort}${suffix}`);
          else if (effortInfo.mode === 'pro') showToast(`发送成功：pro ${effortInfo.effort}${suffix}`);
          else showToast(`发送成功：thinking_effort=${effortInfo.effort}${suffix}`);
        } catch {
          // ignore
        }
      }
    });
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
    try {
      const core = window.__aichat_chatgpt_core_main_v1__;
      if (core && typeof core.getEditorEl === 'function' && typeof core.getComposerForm === 'function') {
        const editor = core.getEditorEl();
        const form = core.getComposerForm(editor);
        if (form) return form;
      }
    } catch {}
    return document.querySelector('#thread-bottom-container') || document.body;
  }

  function listComposerPills() {
    const root = getComposerRoot();
    return Array.from(
      root.querySelectorAll("button.__composer-pill[aria-haspopup='menu'],button.__composer-pill")
    ).filter((el) => el instanceof HTMLButtonElement);
  }

  function getEffortItems(menu) {
    const items = Array.from(menu.querySelectorAll("[role='menuitemradio']")).filter((el) => el instanceof Element);
    /** @type {Element|null} */
    let light = null;
    /** @type {Element|null} */
    let standard = null;
    /** @type {Element|null} */
    let extended = null;
    /** @type {Element|null} */
    let heavy = null;

    // Prefer semantic detection when labels are stable (e.g. light/standard/extended/heavy),
    // then gracefully fallback to structure/order for i18n UIs.
    for (const item of items) {
      const t = normalizeText(item.textContent || item.getAttribute('aria-label') || '');
      if (!light && /\blight\b/.test(t)) light = item;
      if (!standard && /\bstandard\b/.test(t)) standard = item;
      if (!extended && /\bextended\b/.test(t)) extended = item;
      if (!heavy && /\bheavy\b/.test(t)) heavy = item;
    }

    /** @type {Element|null} */
    let low = light;
    /** @type {Element|null} */
    let high = heavy;
    /** @type {Element|null} */
    let proLow = standard;
    /** @type {Element|null} */
    let proHigh = extended;

    if ((!low || !high) && items.length >= 2) {
      low = items[0];
      high = items[items.length - 1];
    }

    if ((!proLow || !proHigh) && items.length >= 4) {
      proLow = items[1];
      proHigh = items[items.length - 2];
    }

    let checkedIndex = items.findIndex((item) => item.getAttribute('aria-checked') === 'true');
    if (checkedIndex < 0 && items.length) checkedIndex = 0;

    return { items, checkedIndex, light, standard, extended, heavy, low, high, proLow, proHigh };
  }

  function getMenuItemLabel(item, fallback = '') {
    if (!(item instanceof Element)) return fallback;
    const text = String(item.textContent || item.getAttribute('aria-label') || '').trim();
    return text || fallback;
  }

  function getThinkingProModeItems(menu) {
    const items = Array.from(menu.querySelectorAll("[role='menuitemradio'],[role='menuitem']"));
    /** @type {Element|null} */
    let thinking = null;
    /** @type {Element|null} */
    let pro = null;

    for (const item of items) {
      const testId = String(item.getAttribute('data-testid') || '').toLowerCase();
      const t = normalizeText(item.textContent || item.getAttribute('aria-label') || '');

      // ChatGPT often concatenates label+description with no spaces in textContent (e.g. "ThinkingThinks...").
      if (
        !thinking &&
        (testId.endsWith('thinking') || t === 'thinking' || t.startsWith('thinking') || t.startsWith('思考') || t.startsWith('推理'))
      ) {
        thinking = item;
      }
      if (!pro && (testId.endsWith('-pro') || t === 'pro' || t.startsWith('pro') || t.startsWith('专业'))) {
        pro = item;
      }
      if (thinking && pro) break;
    }

    return { thinking, pro };
  }

  function menuHasThinkingProMode(menu) {
    if (!(menu instanceof Element)) return false;
    const { thinking, pro } = getThinkingProModeItems(menu);
    return !!thinking && !!pro;
  }

  function menuHasEffortOptions(menu) {
    if (!(menu instanceof Element)) return false;
    if (menuHasThinkingProMode(menu)) return false;
    const { items, low, high } = getEffortItems(menu);
    if (items.length < 2 || items.length > 4) return false;
    return !!(low && high);
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

  function findMenuForTrigger(trigger) {
    if (!(trigger instanceof HTMLElement)) return null;

    const controls = trigger.getAttribute('aria-controls');
    if (controls) {
      const byId = document.getElementById(controls);
      if (byId instanceof HTMLElement && byId.getAttribute('role') === 'menu') return byId;
    }

    const triggerId = trigger.id;
    if (triggerId) {
      try {
        const byLabel = document.querySelector(`[role='menu'][aria-labelledby='${CSS.escape(triggerId)}']`);
        if (byLabel instanceof HTMLElement) return byLabel;
      } catch (_) {
        // ignore
      }
    }
    return null;
  }

  function isTriggerMenuOpen(trigger) {
    if (!(trigger instanceof HTMLElement)) return false;
    return trigger.getAttribute('aria-expanded') === 'true' || trigger.getAttribute('data-state') === 'open';
  }

  function forceCloseMenuDom(trigger, getMenu) {
    /** @type {HTMLElement[]} */
    const targets = [];
    try {
      const byGetter = typeof getMenu === 'function' ? getMenu() : null;
      if (byGetter instanceof HTMLElement) targets.push(byGetter);
    } catch (_) {
      // ignore
    }

    const byTrigger = findMenuForTrigger(trigger);
    if (byTrigger instanceof HTMLElement && !targets.includes(byTrigger)) targets.push(byTrigger);

    if (trigger instanceof HTMLElement) {
      const triggerId = String(trigger.id || '');
      if (triggerId) {
        try {
          const byLabel = Array.from(
            document.querySelectorAll(`[role='menu'][aria-labelledby='${CSS.escape(triggerId)}']`)
          ).filter((el) => el instanceof HTMLElement);
          for (const menu of byLabel) {
            if (!targets.includes(menu)) targets.push(menu);
          }
        } catch (_) {
          // ignore
        }
      }
    }

    for (const menu of targets) {
      try {
        menu.remove();
      } catch (_) {
        // ignore
      }
    }

    if (trigger instanceof HTMLElement) {
      try {
        trigger.setAttribute('aria-expanded', 'false');
      } catch (_) {
        // ignore
      }
      try {
        trigger.setAttribute('data-state', 'closed');
      } catch (_) {
        // ignore
      }
    }

    return targets.length;
  }

  function isModelLikeMenuItemText(text) {
    const t = normalizeText(text);
    if (!t) return false;
    if (t.includes('5.2')) return true;
    if (t.includes('gpt')) return true;
    if (/\bgpt[-\s]?\d/.test(t)) return true;
    if (/\b\d(?:\.\d)+\b/.test(t)) return true;
    return false;
  }

  function scoreModelItem(text, mode) {
    const t = normalizeText(text);
    if (!t) return -999;
    if (!isModelLikeMenuItemText(t)) return -999;

    const wantsThinking = mode === 'thinking';
    const wantsPro = mode === 'pro';

    const hasThinking = /\bthinking\b/.test(t) || /思考|推理/.test(t);
    const hasPro = /\bpro\b/.test(t) || /专业/.test(t);

    if (wantsThinking && !hasThinking) return -999;
    if (wantsPro && !hasPro) return -999;

    let score = 0;
    if (t.includes('5.2')) score += 6;
    if (/\bgpt\b/.test(t)) score += 2;
    if (/\bgpt[-\s]?5\b/.test(t)) score += 2;
    if (hasThinking) score += wantsThinking ? 6 : -4;
    if (hasPro) score += wantsPro ? 6 : -4;
    return score;
  }

  function findBestModelMenuItem(menu, mode) {
    if (!(menu instanceof Element)) return null;
    const items = Array.from(menu.querySelectorAll("[role='menuitemradio'],[role='menuitem']"));
    let best = null;
    let bestScore = -999;
    for (const item of items) {
      const score = scoreModelItem(item.textContent || '', mode);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return bestScore > 0 ? best : null;
  }

  async function findModelPill() {
    const pills = listComposerPills();
    if (!pills.length) return null;

    /** @type {HTMLButtonElement[]} */
    const ordered = [];
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && active.matches('button.__composer-pill')) ordered.push(active);
    for (const p of pills) if (!ordered.includes(p)) ordered.push(p);

    for (const pill of ordered) {
      const opened = await openThinkingMenu(pill);
      if (!opened) continue;

      /** @type {Element|null} */
      const menu = await waitForValue(() => findMenuForPill(pill), 260, 20);
      const hasThinking = !!findBestModelMenuItem(menu, 'thinking');
      const hasPro = !!findBestModelMenuItem(menu, 'pro');
      if (hasThinking && hasPro) return pill;

      // 不是模型菜单：关掉再继续试下一个
      clickLikeUser(pill);
      await sleep(60);
    }

    return null;
  }

  function isVisibleElement(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (!document.contains(el)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  function listVisibleMenus() {
    return Array.from(document.querySelectorAll("[role='menu']")).filter(isVisibleElement);
  }

  function findVisibleThinkingProMenu() {
    const thinkingItem = findVisibleByTestId('model-switcher-gpt-5-2-thinking');
    const proItem = findVisibleByTestId('model-switcher-gpt-5-2-pro');
    const any = thinkingItem || proItem;
    if (!any) return null;
    return any.closest("[role='menu']") || null;
  }

  function findVisibleThinkingProMenuByContent() {
    const menus = listVisibleMenus();
    for (const menu of menus) {
      if (menuHasThinkingProMode(menu)) return menu;
    }
    return null;
  }

  function findVisibleByTestId(testId) {
    try {
      const nodes = Array.from(document.querySelectorAll(`[data-testid="${CSS.escape(testId)}"]`));
      for (const el of nodes) {
        if (el instanceof HTMLElement && isVisibleElement(el)) return el;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function findVisibleThinkingProItem(mode) {
    if (mode !== 'thinking' && mode !== 'pro') return null;
    const menus = listVisibleMenus();
    for (const menu of menus) {
      if (!menuHasThinkingProMode(menu)) continue;
      const items = getThinkingProModeItems(menu);
      const item = mode === 'thinking' ? items.thinking : items.pro;
      if (item instanceof HTMLElement && isVisibleElement(item)) return item;
    }
    return null;
  }

  function findGPT52ModelSelectorTrigger() {
    const byTestIdAll = Array.from(document.querySelectorAll("button[data-testid='model-switcher-dropdown-button']"));
    const byTestIdVisible = byTestIdAll.find((el) => el instanceof HTMLElement && isVisibleElement(el));
    if (byTestIdVisible instanceof HTMLElement) return byTestIdVisible;
    const byTestIdFirst = byTestIdAll.find((el) => el instanceof HTMLElement);
    if (byTestIdFirst instanceof HTMLElement) return byTestIdFirst;

    const byAria = Array.from(document.querySelectorAll('button[aria-label],[role="button"][aria-label]')).find(
      (el) => normalizeText(el.getAttribute('aria-label') || '').startsWith('model selector') && isVisibleElement(el)
    );
    return byAria instanceof HTMLElement ? byAria : null;
  }

  function listMaybeThinkingProTriggers() {
    const primaryNodes = Array.from(
      document.querySelectorAll(
        "button[aria-haspopup='menu'],button[aria-expanded],button[data-state],[role='button'][aria-haspopup='menu'],[role='button'][aria-expanded],[role='button'][data-state]"
      )
    ).filter((el) => el instanceof HTMLElement);

    function filterCandidates(nodes) {
      /** @type {HTMLElement[]} */
      const out = [];
      for (const el of nodes) {
        const t = normalizeText(el.textContent || '');
        if (!t.includes('5.2')) continue;
        if (!t.includes('chatgpt') && !t.includes('gpt') && !t.includes('thinking') && !t.includes('pro')) continue;
        if (!isVisibleElement(el)) continue;
        out.push(el);
      }
      return out;
    }

    let candidates = filterCandidates(primaryNodes);
    if (!candidates.length) {
      const fallbackNodes = Array.from(document.querySelectorAll('button,[role="button"]')).filter(
        (el) => el instanceof HTMLElement
      );
      candidates = filterCandidates(fallbackNodes);
    }
    return candidates.slice(0, 40);
  }

  async function findThinkingProTrigger() {
    // 优先：已经有菜单打开
    const existingMenu = findVisibleThinkingProMenu();
    if (existingMenu) return null;

    const candidates = listMaybeThinkingProTriggers();
    for (const el of candidates) {
      // 尝试一次点击打开
      clickLikeUser(el);
      for (let i = 0; i < 10; i++) {
        const menu = findVisibleThinkingProMenu();
        if (menu) return el;
        await sleep(40);
      }

      // 有些按钮第一次不生效：再点一次
      clickLikeUser(el);
      for (let i = 0; i < 10; i++) {
        const menu = findVisibleThinkingProMenu();
        if (menu) return el;
        await sleep(40);
      }
    }
    return null;
  }

  function menuSelectedIsHigh(menu) {
    if (!(menu instanceof Element)) return null;
    const checked = menu.querySelector("[role='menuitemradio'][aria-checked='true']");
    if (!checked) return null;
    const t = normalizeText(checked.textContent || '');
    if (t.includes('heavy') || t.includes('extended')) return true;
    if (t.includes('light') || t.includes('standard')) return false;
    return null;
  }

  function menuSelectedMode(menu) {
    if (!(menu instanceof Element)) return null;
    const checked = menu.querySelector("[role='menuitemradio'][aria-checked='true']");
    if (!checked) return null;
    const t = normalizeText(checked.textContent || '');
    if (t.includes('light') || t.includes('heavy')) return 'thinking';
    if (t.includes('standard') || t.includes('extended')) return 'pro';
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
      const menu = await waitForValue(() => findMenuForPill(pill), 260, 20);

      if (menu && menuHasEffortOptions(menu)) return pill;

      // 不是推理强度菜单：关掉再继续试下一个
      clickLikeUser(pill);
      await sleep(60);
    }

    return ordered[0] || null;
  }

  async function openThinkingMenu(pill) {
    const isOpened = () => {
      if (!(pill instanceof HTMLButtonElement)) return false;
      if (pill.getAttribute('aria-expanded') === 'true') return true;
      if (pill.getAttribute('data-state') === 'open') return true;
      const menu = findMenuForPill(pill);
      return menu instanceof HTMLElement && isVisibleElement(menu);
    };

    clickLikeUser(pill);
    if (await waitForTruthy(isOpened, 220, 16)) return true;

    clickLikeUser(pill);
    return waitForTruthy(isOpened, 380, 20);
  }

  function dispatchSyntheticEscape(target) {
    const evtInit = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    /** @type {(EventTarget|null|undefined)[]} */
    const targets = [];
    if (target instanceof HTMLElement) targets.push(target);
    if (document.activeElement instanceof HTMLElement) targets.push(document.activeElement);
    targets.push(document.body, document, window);

    for (const t of targets) {
      if (!t || typeof t.dispatchEvent !== 'function') continue;
      try {
        t.dispatchEvent(new KeyboardEvent('keydown', evtInit));
        t.dispatchEvent(new KeyboardEvent('keyup', evtInit));
      } catch (_) {
        // ignore
      }
    }
  }

  async function ensureMenuCollapsed(trigger, getMenu) {
    const isMenuVisible = () => {
      const menuFromGetter = typeof getMenu === 'function' ? getMenu() : null;
      const menu = menuFromGetter || findMenuForTrigger(trigger);
      return menu instanceof HTMLElement && isVisibleElement(menu);
    };
    const isStillOpen = () => isMenuVisible() || isTriggerMenuOpen(trigger);

    const waitForMenuHidden = (timeoutMs) => waitForTruthy(() => !isStillOpen(), timeoutMs, 20);

    // Keep the grace window short: mode text can switch instantly, so menu close must feel immediate.
    if (await waitForMenuHidden(32)) return true;

    // Known Radix stuck state: trigger already reports closed, but menu DOM is still visible.
    if (!isTriggerMenuOpen(trigger) && isMenuVisible()) {
      forceCloseMenuDom(trigger, getMenu);
      if (await waitForMenuHidden(40)) return true;
    }

    // Soft close first.
    dispatchSyntheticEscape(trigger);
    if (await waitForMenuHidden(80)) return true;

    // If still open, hard-close immediately instead of waiting hundreds of ms.
    forceCloseMenuDom(trigger, getMenu);
    if (await waitForMenuHidden(40)) return true;

    // Final belt-and-suspenders cleanup.
    dispatchSyntheticEscape();
    forceCloseMenuDom(trigger, getMenu);
    return !isStillOpen();
  }

  async function waitForIdle(timeoutMs = 1200) {
    const startAt = Date.now();
    while (busy && Date.now() - startAt <= timeoutMs) {
      await sleep(16);
    }
    return !busy;
  }

  function enqueueHotkeyAction(action) {
    if (action !== 'toggle_effort' && action !== 'toggle_model') return;
    if (hotkeyQueue.length >= HOTKEY_QUEUE_MAX) hotkeyQueue.shift();
    hotkeyQueue.push(action);
    void drainHotkeyQueue();
  }

  async function drainHotkeyQueue() {
    if (hotkeyDrainRunning) return;
    hotkeyDrainRunning = true;
    try {
      while (hotkeyQueue.length) {
        if (isCfChallengeActive()) {
          hotkeyQueue.length = 0;
          toastCfChallengeOnce();
          return;
        }
        const action = hotkeyQueue.shift();
        if (!action) continue;
        await waitForIdle(1200);
        if (action === 'toggle_effort') await toggleThinkingTime();
        else if (action === 'toggle_model') await toggleModelType();
        await sleep(12);
      }
    } finally {
      hotkeyDrainRunning = false;
      if (hotkeyQueue.length) void drainHotkeyQueue();
    }
  }

  async function toggleThinkingTime() {
    if (busy) return;
    busy = true;

    try {
      const pill =
        cachedEffortPill instanceof HTMLButtonElement && document.contains(cachedEffortPill)
          ? cachedEffortPill
          : await findEffortPill();
      cachedEffortPill = pill;
      if (!pill) {
        warn('没找到推理强度选择器（可能当前模型/页面不支持）');
        return;
      }

      const opened = await openThinkingMenu(pill);
      if (!opened) {
        warn('打开推理强度菜单失败');
        return;
      }

      try {
        /** @type {Element|null} */
        const menu = await waitForValue(() => {
          const candidate = findMenuForPill(pill);
          if (candidate && menuHasEffortOptions(candidate)) return candidate;
          return null;
        }, 520, 20);
        if (!menu) {
          warn('没找到推理强度菜单');
          return;
        }

        const effort = getEffortItems(menu);
        const items = effort.items;
        if (!items.length) {
          warn('推理强度菜单里没有可切换项');
          return;
        }

        const checkedIndex = effort.checkedIndex >= 0 ? effort.checkedIndex : 0;
        const lowIdx = items.indexOf(effort.low);
        const highIdx = items.indexOf(effort.high);
        const proLowIdx = items.indexOf(effort.proLow);
        const proHighIdx = items.indexOf(effort.proHigh);

        let targetIdx = -1;
        let route = 'generic';

        if (lowIdx >= 0 && highIdx >= 0) {
          targetIdx = checkedIndex === highIdx ? lowIdx : highIdx;
          route = items.length >= 4 ? 'extreme-pair-4lvl' : 'extreme-pair';
        } else if (proLowIdx >= 0 && proHighIdx >= 0 && (checkedIndex === proLowIdx || checkedIndex === proHighIdx)) {
          targetIdx = checkedIndex === proHighIdx ? proLowIdx : proHighIdx;
          route = 'mid-pair';
        } else if (proLowIdx >= 0 && proHighIdx >= 0) {
          targetIdx = proHighIdx;
          route = 'mid-fallback';
        } else if (items.length >= 2) {
          const first = 0;
          const last = items.length - 1;
          targetIdx = checkedIndex === last ? first : last;
          route = 'edge-fallback';
        }

        const target = targetIdx >= 0 ? items[targetIdx] : null;
        if (!(target instanceof Element)) {
          warn('无法确定推理强度目标项');
          return;
        }

        clickLikeUser(target);
        const label = getMenuItemLabel(target, `L${targetIdx + 1}`);
        const isHigh = targetIdx === highIdx || targetIdx === proHighIdx || targetIdx === items.length - 1;
        info(`推理强度切换成功（${route} -> ${label}）`);
        try {
          pill.title = label;
        } catch (_) {
          // ignore
        }
        schedulePulse(pill, isHigh, label);
      } finally {
        // Always collapse on failures as well (missing items / transient menus / CF mitigation)
        await ensureMenuCollapsed(pill, () => findMenuForPill(pill));
      }
    } catch (err) {
      log(err);
      error('切换失败', err);
    } finally {
      busy = false;
    }
  }

  async function toggleModelType() {
    if (busy) return false;
    busy = true;

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const trigger = findGPT52ModelSelectorTrigger();
        cachedThinkingProTrigger = trigger;
        if (!trigger) {
          await sleep(80);
          continue;
        }

        const triggerLabel = normalizeText(trigger.textContent || trigger.getAttribute('aria-label') || '');
        const targetMode = triggerLabel.includes('thinking') ? 'pro' : 'thinking';
        const targetTestId = targetMode === 'pro' ? 'model-switcher-gpt-5-2-pro' : 'model-switcher-gpt-5-2-thinking';
        const findTargetItem = () => findVisibleByTestId(targetTestId) || findVisibleThinkingProItem(targetMode);
        const getMenu = () => findVisibleThinkingProMenu() || findVisibleThinkingProMenuByContent() || findMenuForTrigger(trigger);

        // 如果菜单已打开，直接点；否则打开菜单再点
        let targetItem = findTargetItem();
        if (!targetItem) {
          clickLikeUser(trigger);
          targetItem = await waitForValue(findTargetItem, 260 + attempt * 120, 16);
        }

        if (!targetItem) {
          // 可能第一次 click 没弹出：再试一次
          clickLikeUser(trigger);
          targetItem = await waitForValue(findTargetItem, 340 + attempt * 120, 16);
        }

        if (!targetItem) {
          // Keep UI tidy even when the menu isn't fully populated yet.
          await ensureMenuCollapsed(trigger, getMenu);
          await sleep(70);
          continue;
        }

        clickLikeUser(targetItem);
        await ensureMenuCollapsed(trigger, getMenu);

        const switched = await waitForTruthy(() => {
          const activeTrigger = findGPT52ModelSelectorTrigger();
          if (!(activeTrigger instanceof HTMLElement)) return false;
          const nextLabel = normalizeText(activeTrigger.textContent || activeTrigger.getAttribute('aria-label') || '');
          return targetMode === 'pro' ? nextLabel.includes('pro') : nextLabel.includes('thinking');
        }, 240, 20);

        if (!switched && attempt < 2) {
          await sleep(80);
          continue;
        }

        preferredModelMode = targetMode;
        savePreferredModelMode(preferredModelMode);
        const pulseTarget = findGPT52ModelSelectorTrigger();
        if (pulseTarget) schedulePulse(pulseTarget, targetMode === 'pro', targetMode === 'pro' ? 'Pro' : 'Thinking');
        return true;
      }

      if (cachedThinkingProTrigger instanceof HTMLElement) {
        await ensureMenuCollapsed(cachedThinkingProTrigger, () => {
          return (
            findVisibleThinkingProMenu() ||
            findVisibleThinkingProMenuByContent() ||
            findMenuForTrigger(cachedThinkingProTrigger)
          );
        });
      }
      info('模型菜单选项未就绪，忽略本次切换');
      return false;
    } catch (err) {
      log(err);
      error('切换模型失败', err);
      return false;
    } finally {
      busy = false;
    }
  }

  // 以 fetch-sniffer 作为“已安装”标记，避免在 reinject / 与 Tampermonkey 共存时重复绑定快捷键
  if (!window[FETCH_SNIFF_FLAG]) {
    window.addEventListener(
      'keydown',
      (event) => {
        const action = getHotkeyAction(event);
        if (!action) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (event.repeat) return;
        if (isCfChallengeActive()) {
          toastCfChallengeOnce();
          hotkeyQueue.length = 0;
          return;
        }
        enqueueHotkeyAction(action);
      },
      true
    );
  }

  installFetchSniffer();
})();
