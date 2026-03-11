(() => {
  'use strict';

  const HOST_OK = (() => {
    try {
      return window.self === window.top && String(location.hostname || '').toLowerCase() === 'www.google.com';
    } catch {
      return false;
    }
  })();
  if (!HOST_OK) return;

  const PATH_OK = (() => {
    try {
      const path = String(location.pathname || '');
      return path === '/' || path === '/search';
    } catch {
      return false;
    }
  })();
  if (!PATH_OK) return;

  const GUARD_KEY = '__aichat_google_ask_gpt_v1__';
  try {
    if (window[GUARD_KEY]) return;
    Object.defineProperty(window, GUARD_KEY, { value: true, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      if (window[GUARD_KEY]) return;
      window[GUARD_KEY] = true;
    } catch {}
  }

  const STYLE_ID = '__aichat_google_ask_gpt_style_v1__';
  const BUTTON_ATTR = 'data-aichat-google-ask-gpt';
  const HANDOFF_FLAG = 'aichat_google_ask';
  const HANDOFF_PROMPT = 'prompt';
  const PROMPT_PREFIX = 'web search:\n';
  let observer = null;
  let ensureTimer = 0;

  function getUiLocale() {
    try {
      return String(document.documentElement?.dataset?.aichatLocale || 'en').trim() || 'en';
    } catch {
      return 'en';
    }
  }

  function isChineseLocale() {
    return /^zh/i.test(getUiLocale());
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
button[${BUTTON_ATTR}] {
  appearance: none;
  border: 0;
  outline: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 72px;
  height: 40px;
  margin-inline-start: 8px;
  padding: 0 14px;
  border-radius: 999px;
  background: linear-gradient(135deg, #0f766e 0%, #2563eb 100%);
  color: #fff;
  font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.22);
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
}
button[${BUTTON_ATTR}]:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(15, 118, 110, 0.26);
}
button[${BUTTON_ATTR}]:active {
  transform: translateY(0);
}
button[${BUTTON_ATTR}][disabled] {
  opacity: .45;
  cursor: default;
  box-shadow: none;
  transform: none;
}
button[${BUTTON_ATTR}] .__aichatGoogleAskIcon {
  font-size: 15px;
  line-height: 1;
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function getQueryInput() {
    const selectors = ['textarea[name="q"]', 'input[name="q"]'];
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el;
      } catch {}
    }
    return null;
  }

  function readCurrentQuery() {
    const input = getQueryInput();
    const inputValue = input ? String(input.value || '').trim() : '';
    if (inputValue) return inputValue;
    try {
      const url = new URL(String(location.href || ''));
      return String(url.searchParams.get('q') || '').trim();
    } catch {
      return '';
    }
  }

  function buildChatGptUrl(query) {
    const url = new URL('https://chatgpt.com/');
    url.searchParams.set(HANDOFF_FLAG, '1');
    url.searchParams.set(HANDOFF_PROMPT, `${PROMPT_PREFIX}${String(query || '').trim()}`);
    return url.toString();
  }

  function openChatGpt(query) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return;
    const target = buildChatGptUrl(cleanQuery);
    const opened = window.open(target, '_blank', 'noopener,noreferrer');
    if (!opened) {
      try {
        location.href = target;
      } catch {}
    }
  }

  function findAnchorButton() {
    const root =
      document.querySelector('[role="search"]') ||
      document.querySelector('form[action="/search"]') ||
      document.querySelector('form[role="search"]');
    if (!(root instanceof HTMLElement)) return null;

    const selectors = [
      'button[aria-label="Search"]',
      'button[aria-label*="Google Search" i]',
      'button[aria-label*="Search" i]'
    ];
    for (const selector of selectors) {
      try {
        const button = root.querySelector(selector);
        if (button instanceof HTMLButtonElement) return button;
      } catch {}
    }
    return null;
  }

  function updateButtonState(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    const query = readCurrentQuery();
    const disabled = !query;
    button.disabled = disabled;
    button.title = disabled
      ? (isChineseLocale() ? '先在 Google 搜索框里输入问题' : 'Enter a query in Google first')
      : (isChineseLocale() ? '用 ChatGPT 5.4 Thinking 继续问这个搜索词' : 'Continue this search in ChatGPT 5.4 Thinking');
  }

  function bindInputSync(button) {
    const input = getQueryInput();
    if (!(input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement)) return;
    if (input.dataset.aichatGoogleAskBound === '1') return;
    input.dataset.aichatGoogleAskBound = '1';

    const sync = () => updateButtonState(button);
    input.addEventListener('input', sync, true);
    input.addEventListener('change', sync, true);
  }

  function createButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(BUTTON_ATTR, '1');
    button.innerHTML = `<span class="__aichatGoogleAskIcon">G</span><span>${isChineseLocale() ? '问 GPT' : 'Ask GPT'}</span>`;
    button.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        openChatGpt(readCurrentQuery());
      },
      true
    );
    updateButtonState(button);
    return button;
  }

  function ensureButton() {
    ensureTimer = 0;
    ensureStyle();

    let button = document.querySelector(`button[${BUTTON_ATTR}]`);
    if (!(button instanceof HTMLButtonElement)) {
      const anchor = findAnchorButton();
      if (!(anchor instanceof HTMLButtonElement)) return;
      button = createButton();
      anchor.insertAdjacentElement('afterend', button);
    }

    updateButtonState(button);
    bindInputSync(button);
  }

  function scheduleEnsure() {
    if (ensureTimer) return;
    ensureTimer = window.setTimeout(ensureButton, 80);
  }

  scheduleEnsure();
  window.addEventListener('pageshow', scheduleEnsure, true);
  window.addEventListener('popstate', scheduleEnsure, true);
  document.addEventListener('readystatechange', scheduleEnsure, true);

  observer = new MutationObserver(() => scheduleEnsure());
  try {
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch {}
})();
