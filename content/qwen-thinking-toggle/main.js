(() => {
  'use strict';

  const GUARD_KEY = '__aichat_qwen_thinking_toggle_v1__';
  try {
    if (globalThis[GUARD_KEY]) return;
    Object.defineProperty(globalThis, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });
  } catch (_) {
    try {
      if (globalThis[GUARD_KEY]) return;
      globalThis[GUARD_KEY] = true;
    } catch (_) {
      void _;
    }
  }

  const HOST = String((typeof location === 'object' && location && location.hostname) || '').toLowerCase();
  const IS_TEST_ENV = typeof module === 'object' && module && module.exports;
  const IS_QWEN_HOST = HOST === 'chat.qwen.ai';
  if (!IS_QWEN_HOST && !IS_TEST_ENV) return;

  const TOAST_STYLE_ID = '__aichat_qwen_thinking_toggle_toast_style_v1__';
  const TOAST_CONTAINER_ID = '__aichat_qwen_thinking_toggle_toast_container_v1__';
  const TOAST_CLASS = '__aichatQwenThinkingToggleToastV1';
  const SETTINGS_KEY = 'aichat_ai_shortcuts_settings_v1';

  let busy = false;
  let initialThinkingBootstrapStarted = false;
  let hotkeysEnabled = true;

  function normalizeMetaKeyMode(mode) {
    const value = String(mode || '').trim().toLowerCase();
    if (value === 'auto' || value === 'has_meta' || value === 'no_meta') return value;
    return 'auto';
  }

  function detectHasMetaKeyCapability() {
    try {
      const platform = String(navigator?.userAgentData?.platform || navigator?.platform || navigator?.userAgent || '').toLowerCase();
      return platform.includes('mac');
    } catch {
      return false;
    }
  }

  function resolveHasMetaKey(settings) {
    const mode = normalizeMetaKeyMode(settings?.metaKeyMode);
    if (mode === 'has_meta') return true;
    if (mode === 'no_meta') return false;
    return detectHasMetaKeyCapability();
  }

  function resolveHotkeysEnabledFromSettings(settings) {
    try {
      const mods = settings?.siteModules?.qwen;
      const hotkeys = typeof mods?.qwen_thinking_toggle_hotkeys === 'boolean' ? mods.qwen_thinking_toggle_hotkeys : true;
      const force = typeof mods?.qwen_thinking_toggle_hotkeys_force === 'boolean' ? mods.qwen_thinking_toggle_hotkeys_force : false;
      return !!hotkeys && (!!resolveHasMetaKey(settings) || !!force);
    } catch {
      return true;
    }
  }

  function applyHotkeyPolicyFromSettings(settings) {
    hotkeysEnabled = resolveHotkeysEnabledFromSettings(settings);
    return hotkeysEnabled;
  }

  function syncHotkeyPolicyFromStorage() {
    if (IS_TEST_ENV || typeof chrome === 'undefined' || !chrome?.storage?.local) return;
    applyHotkeyPolicyFromSettings(null);
    try {
      chrome.storage.local.get({ [SETTINGS_KEY]: null }, (items) => {
        void chrome.runtime?.lastError;
        applyHotkeyPolicyFromSettings(items?.[SETTINGS_KEY]);
      });
    } catch {}
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        try {
          if (areaName !== 'local') return;
          const next = changes?.[SETTINGS_KEY]?.newValue;
          if (!next) return;
          applyHotkeyPolicyFromSettings(next);
        } catch {}
      });
    } catch {}
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForValue(read, timeoutMs = 800, intervalMs = 16) {
    const startAt = Date.now();
    while (Date.now() - startAt <= timeoutMs) {
      const v = read();
      if (v) return v;
      await sleep(intervalMs);
    }
    return read();
  }

  function normText(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getDeepActiveElement(rootDoc) {
    const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    try {
      let active = doc.activeElement;
      while (active && active.shadowRoot && active.shadowRoot.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      return active;
    } catch {
      return doc.activeElement || null;
    }
  }

  function isQwenPromptTextarea(el) {
    if (!(el instanceof HTMLTextAreaElement)) return false;
    try {
      if (!el.matches('textarea.message-input-textarea')) return false;
    } catch {
      return false;
    }
    try {
      if (el.matches('[readonly]') || el.readOnly) return false;
    } catch {}
    return true;
  }

  function queryQwenPromptTextarea() {
    const deepActive = getDeepActiveElement();
    if (isQwenPromptTextarea(deepActive)) return deepActive;

    const active = document.activeElement;
    if (isQwenPromptTextarea(active)) return active;

    const byMain = document.querySelector('textarea.message-input-textarea:not([readonly])');
    if (isQwenPromptTextarea(byMain)) return byMain;

    const byFallback =
      document.querySelector('textarea#chat-input:not([readonly]), textarea[name="chat-input"]:not([readonly])') || null;
    if (byFallback instanceof HTMLTextAreaElement) return byFallback;
    return null;
  }

  function placeCaretToEnd(el) {
    if (!(el instanceof Element)) return false;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      try {
        const value = String(el.value || '');
        const end = value.length;
        el.focus({ preventScroll: true });
        if (typeof el.setSelectionRange === 'function') el.setSelectionRange(end, end);
        return true;
      } catch {
        return false;
      }
    }

    if (el.isContentEditable) {
      try {
        el.focus({ preventScroll: true });
      } catch {}
      try {
        const selection = window.getSelection?.();
        if (!selection) return false;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async function focusQwenComposerToEnd() {
    const prompt = await waitForValue(() => queryQwenPromptTextarea(), 800, 24);
    if (!prompt) return false;
    return placeCaretToEnd(prompt);
  }

  function ensureToastStyle() {
    if (document.getElementById(TOAST_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TOAST_STYLE_ID;
    style.textContent = `
@keyframes __aichatQwenThinkingToggleToastInOut {
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
#${TOAST_CONTAINER_ID} .${TOAST_CLASS} {
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
  animation: __aichatQwenThinkingToggleToastInOut 1800ms ease-in-out 0s 1;
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
      toast.className = TOAST_CLASS;
      toast.textContent = String(text || '');
      container.appendChild(toast);
      window.setTimeout(() => toast.remove(), 2000);
    } catch (_) {
      void _;
    }
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    let cs;
    try {
      cs = getComputedStyle(el);
    } catch {
      return false;
    }
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (cs.opacity === '0') return false;
    return true;
  }

  function getHeaderModelText() {
    const el =
      document.querySelector('#qwen-chat-header-left [class*="model-selector-text"]') ||
      document.querySelector('#qwen-chat-header-left .index-module__model-selector-text___XvWe0') ||
      document.querySelector('#qwen-chat-header-left') ||
      document.querySelector('#qwen-chat-header-content') ||
      null;
    return normText(el ? el.textContent : '');
  }

  async function openModelPopup() {
    const trigger = document.querySelector('#qwen-chat-header-left .ant-dropdown-trigger') || document.querySelector('#qwen-chat-header-left');
    if (!trigger) return null;

    try {
      trigger.click();
    } catch {
      return null;
    }

    const popup = await waitForValue(() => {
      const candidates = Array.from(
        document.querySelectorAll('[class*="model-selector-popup"], .index-module__model-selector-popup___TGWn8, .ant-dropdown')
      );
      return (
        candidates.find(
          (el) =>
            isVisible(el) &&
            (el.querySelector('.index-module__model-item___MkLlj') || el.querySelector('[class*="model-item"]'))
        ) || null
      );
    });

    return popup;
  }

  function pickModelToggleTarget(current) {
    const cur = String(current || '');
    if (/397/i.test(cur) || /a17b/i.test(cur)) return { want: 'Qwen3.5-Plus', alt: 'Qwen3.5-397B-A17B' };
    if (/plus/i.test(cur)) return { want: 'Qwen3.5-397B-A17B', alt: 'Qwen3.5-Plus' };
    return { want: 'Qwen3.5-397B-A17B', alt: 'Qwen3.5-Plus' };
  }

  async function toggleModel() {
    const before = getHeaderModelText();
    const target = pickModelToggleTarget(before);

    const popup = await openModelPopup();
    if (!popup) {
      showToast('Qwen: 找不到模型菜单');
      return;
    }

    const items = Array.from(popup.querySelectorAll('.index-module__model-item___MkLlj, [class*="model-item"]')).filter(
      isVisible
    );
    const pick =
      items.find((el) => normText(el.textContent).includes(target.want)) ||
      items.find((el) => normText(el.textContent).includes(target.alt)) ||
      null;

    if (!pick) {
      showToast('Qwen: 未找到目标模型');
      return;
    }

    try {
      pick.click();
    } catch {
      showToast('Qwen: 切换模型失败');
      return;
    }

    const after = await waitForValue(() => {
      const t = getHeaderModelText();
      if (t && t !== before) return t;
      return '';
    }, 1200, 30);

    showToast(`Qwen: 模型 → ${after || target.want}`);
  }

  function getModeSelectRoot() {
    const root = document.querySelector('.qwen-thinking-selector .ant-select') || document.querySelector('.qwen-thinking-selector');
    if (root && isVisible(root)) return root;
    const candidates = Array.from(document.querySelectorAll('.qwen-select-thinking, .ant-select'));
    return candidates.find((el) => isVisible(el) && /Auto|Thinking|Fast|自动|思考|推理|快速|极速/.test(normText(el.textContent))) || null;
  }

  function getCurrentModeText(root) {
    if (!root) return '';
    const label =
      root.querySelector('.ant-select-selection-item') || root.querySelector('.qwen-select-option-selected-label') || root;
    return normText(label ? label.textContent : '');
  }

  function dispatchUserClick(el) {
    if (!(el instanceof Element)) return false;

    try {
      el.focus?.();
    } catch (_) {
      void _;
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
      void _;
    }

    try {
      el.dispatchEvent(new MouseEvent('mousedown', base));
      el.dispatchEvent(new MouseEvent('mouseup', base));
      el.dispatchEvent(new MouseEvent('click', base));
      return true;
    } catch {
      try {
        el.click();
        return true;
      } catch {
        return false;
      }
    }
  }

  function getModeOpenTarget(root) {
    if (!(root instanceof Element)) return null;

    const selector = root.matches('.ant-select-selector') ? root : root.querySelector('.ant-select-selector');
    if (selector && isVisible(selector)) return selector;

    const combobox = root.matches('input[role="combobox"]') ? root : root.querySelector('input[role="combobox"]');
    if (combobox && isVisible(combobox)) return combobox;

    return isVisible(root) ? root : null;
  }

  function classifyMode(text) {
    const t = String(text || '');
    if (/\bthinking\b/i.test(t) || /思考|推理/.test(t)) return 'thinking';
    if (/\bfast\b/i.test(t) || /快速|极速/.test(t)) return 'fast';
    if (/\bauto\b/i.test(t) || /自动/.test(t)) return 'auto';
    return 'unknown';
  }

  function matchesMode(text, want) {
    return classifyMode(text) === want;
  }

  function modeLabel(mode) {
    if (mode === 'thinking') return 'Thinking';
    if (mode === 'fast') return 'Fast';
    if (mode === 'auto') return 'Auto';
    return '';
  }

  function getOptionText(el) {
    if (!(el instanceof Element)) return '';
    return normText(el.textContent || el.getAttribute('aria-label') || '');
  }

  function isSelectedOption(el) {
    if (!(el instanceof Element)) return false;
    if (el.getAttribute('aria-selected') === 'true') return true;
    return el.classList.contains('ant-select-item-option-selected');
  }

  function listVisibleModePopups() {
    const dropdowns = Array.from(document.querySelectorAll('.ant-select-dropdown')).filter(
      (el) => isVisible(el) && el.querySelector('.ant-select-item-option, [role="option"]')
    );
    if (dropdowns.length) return dropdowns;
    return Array.from(document.querySelectorAll('[role="listbox"]')).filter(
      (el) => isVisible(el) && el.querySelector('.ant-select-item-option, [role="option"]')
    );
  }

  function collectModePopupIds(root) {
    const ids = new Set();
    if (!(root instanceof Element)) return ids;
    const nodes = [root, ...root.querySelectorAll('[aria-controls], [aria-owns]')];
    const active = document.activeElement;
    if (active instanceof Element && root.contains(active)) nodes.push(active);

    for (const node of nodes) {
      for (const attr of ['aria-controls', 'aria-owns']) {
        const raw = String(node.getAttribute(attr) || '').trim();
        if (!raw) continue;
        for (const id of raw.split(/\s+/)) {
          if (id) ids.add(id);
        }
      }
    }

    return ids;
  }

  function toModePopupContainer(el) {
    if (!(el instanceof Element)) return null;
    const popup = el.matches('.ant-select-dropdown, [role="listbox"]')
      ? el
      : el.closest('.ant-select-dropdown, [role="listbox"]');
    if (!(popup instanceof Element)) return null;
    if (!isVisible(popup)) return null;
    if (!popup.querySelector('.ant-select-item-option, [role="option"]')) return null;
    return popup;
  }

  function findModePopupForRoot(root, openedBefore) {
    for (const id of collectModePopupIds(root)) {
      const popup = toModePopupContainer(document.getElementById(id));
      if (popup) return popup;
    }

    const visible = listVisibleModePopups();
    const fresh = visible.find((el) => !(openedBefore instanceof Set) || !openedBefore.has(el));
    if (fresh) return fresh;
    if (visible.length === 1) return visible[0];
    return (
      visible.find((el) => /Auto|Thinking|Fast|自动|思考|推理|快速|极速/.test(normText(el.textContent || ''))) || null
    );
  }

  function listModeOptions(scopeEl) {
    if (!(scopeEl instanceof Element)) return [];
    const out = [];
    const seen = new Set();
    for (const el of Array.from(scopeEl.querySelectorAll('.ant-select-item-option, [role="option"]')).filter(isVisible)) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  }

  function isToggleCounterpart(currentMode, candidateMode) {
    if (currentMode === 'thinking') return candidateMode === 'fast' || candidateMode === 'auto';
    if (currentMode === 'fast' || currentMode === 'auto') return candidateMode === 'thinking';
    return false;
  }

  function pickFallbackToggleOption(options, beforeText) {
    if (!Array.isArray(options) || options.length < 2 || options.length > 3) return null;

    const beforeMode = classifyMode(beforeText);
    const beforeNorm = normText(beforeText);
    const selected = options.find((el) => isSelectedOption(el)) || null;

    let candidates = options.filter((el) => el !== selected);
    if (beforeNorm) {
      const notBefore = candidates.filter((el) => getOptionText(el) !== beforeNorm);
      if (notBefore.length) candidates = notBefore;
    }
    if (!candidates.length) return null;

    if (beforeMode !== 'unknown') {
      const targeted = candidates.filter((el) => isToggleCounterpart(beforeMode, classifyMode(getOptionText(el))));
      if (targeted.length === 1) return targeted[0];
      if (targeted.length > 1) {
        const fast = targeted.find((el) => classifyMode(getOptionText(el)) === 'fast');
        return fast || targeted[0];
      }
    }

    if (candidates.length === 1) return candidates[0];
    if (options.length === 2) return candidates[0] || null;
    return null;
  }

  function pickModeOption(options, beforeText) {
    if (!Array.isArray(options) || !options.length) return { option: null, want: 'thinking' };

    const beforeMode = classifyMode(beforeText);
    const hasFast = options.some((el) => classifyMode(getOptionText(el)) === 'fast');
    const priority =
      beforeMode === 'thinking'
        ? hasFast
          ? ['fast', 'auto']
          : ['auto', 'fast']
        : beforeMode === 'fast' || beforeMode === 'auto'
          ? ['thinking']
          : hasFast
            ? ['thinking', 'fast', 'auto']
            : ['thinking', 'auto', 'fast'];

    for (const want of priority) {
      const found = options.find((el) => matchesMode(getOptionText(el), want));
      if (found) return { option: found, want };
    }

    const fallback = pickFallbackToggleOption(options, beforeText);
    if (fallback) {
      const mode = classifyMode(getOptionText(fallback));
      return { option: fallback, want: mode === 'unknown' ? priority[0] : mode };
    }

    return { option: null, want: priority[0] || 'thinking' };
  }

  function pickSpecificModeOption(options, want) {
    if (!Array.isArray(options) || !options.length) return null;
    const desired = String(want || '').trim().toLowerCase();
    if (!desired) return null;
    return options.find((el) => classifyMode(getOptionText(el)) === desired) || null;
  }

  async function openModePopupAndListOptions(root) {
    const openedBefore = new Set(listVisibleModePopups());
    const openTarget = getModeOpenTarget(root);
    if (!openTarget || !dispatchUserClick(openTarget)) return { popup: null, options: [] };

    const popup = await waitForValue(() => findModePopupForRoot(root, openedBefore), 900, 24);
    if (!popup) return { popup: null, options: [] };

    const options =
      (await waitForValue(() => {
        const opts = listModeOptions(popup);
        return opts.length ? opts : null;
      }, 900, 24)) || [];

    return { popup, options };
  }

  async function applyModeChange(root, option, beforeText, fallbackWant, toastPrefix = 'Qwen: 模式 → ') {
    if (!(root instanceof Element) || !(option instanceof Element)) return false;

    try {
      option.click();
    } catch {
      return false;
    }

    const after = await waitForValue(() => {
      const t = getCurrentModeText(root);
      if (t && t !== beforeText) return t;
      return '';
    }, 800, 30);

    const fallbackLabel = getOptionText(option) || modeLabel(fallbackWant) || '目标模式';
    if (toastPrefix) showToast(`${toastPrefix}${after || fallbackLabel}`);
    return true;
  }

  async function ensureThinkingModeOnInitialLoad() {
    if (initialThinkingBootstrapStarted) return;
    initialThinkingBootstrapStarted = true;

    const root = await waitForValue(() => getModeSelectRoot(), 12000, 80);
    if (!root) return;

    const before = getCurrentModeText(root);
    if (matchesMode(before, 'thinking')) return;

    const { options } = await openModePopupAndListOptions(root);
    if (!options.length) return;

    const option = pickSpecificModeOption(options, 'thinking');
    if (!option) return;

    await applyModeChange(root, option, before, 'thinking', '');
  }

  async function toggleThinkingFast() {
    const root = getModeSelectRoot();
    if (!root) {
      showToast('Qwen: 找不到模式选择器');
      return;
    }

    const before = getCurrentModeText(root);
    const { options } = await openModePopupAndListOptions(root);
    if (!options.length) {
      showToast('Qwen: 打开模式菜单失败');
      return;
    }

    const { option, want } = pickModeOption(options, before);

    if (!option) {
      showToast('Qwen: 未找到可切换模式');
      return;
    }

    const switched = await applyModeChange(root, option, before, want);
    if (!switched) {
      showToast('Qwen: 切换模式失败');
      return;
    }
    await focusQwenComposerToEnd();
  }

  function getActionFromKeydown(e) {
    if (!e || typeof e !== 'object') return null;
    if (!hotkeysEnabled) return null;
    if (!e.metaKey) return null;
    if (e.ctrlKey || e.altKey || e.shiftKey) return null;

    const code = typeof e.code === 'string' ? e.code : '';
    const key = typeof e.key === 'string' ? e.key : '';
    const k = key.toLowerCase();

    if (code === 'KeyO' || k === 'o') return 'toggle_mode';
    if (code === 'KeyJ' || k === 'j') return 'toggle_model';
    return null;
  }

  function handleKeyDown(e) {
    const action = getActionFromKeydown(e);
    if (!action) return;

    try {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    } catch (_) {
      void _;
    }

    if (e && e.repeat) return;

    if (busy) return;
    busy = true;

    void (async () => {
      try {
        if (action === 'toggle_mode') await toggleThinkingFast();
        else if (action === 'toggle_model') await toggleModel();
      } catch (err) {
        const detail = err && typeof err.message === 'string' ? err.message : '';
        showToast(`Qwen: 操作失败${detail ? `（${detail}）` : ''}`);
      } finally {
        busy = false;
      }
    })();
  }

  function boot() {
    if (!IS_QWEN_HOST) return;
    syncHotkeyPolicyFromStorage();
    void ensureThinkingModeOnInitialLoad();
    try {
      window.addEventListener('keydown', handleKeyDown, true);
    } catch (_) {
      void _;
    }
  }

  const testApi = Object.freeze({
    classifyMode,
    getActionFromKeydown,
    modeLabel,
    pickFallbackToggleOption,
    pickModeOption,
    pickSpecificModeOption,
    resolveHotkeysEnabledFromSettings,
    setHotkeysEnabledForTest(value) {
      hotkeysEnabled = value !== false;
    }
  });
  if (IS_TEST_ENV) module.exports = testApi;

  boot();
})();
