(() => {
  'use strict';

  const GUARD_KEY = '__aichat_chatgpt_quick_deep_search_v1__';
  if (globalThis[GUARD_KEY]) return;
  Object.defineProperty(globalThis, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  // ===== 配置（可微调延时和阈值） =====
  const DEFAULT_POSITION = { top: '30%', right: '0px' };
  const DEFAULT_POSITION_THINK = { top: '50%', right: '0px' };
  const LONG_CONTENT_THRESHOLD = 5000; // 超过此字符数视为长内容，使用优化处理
  const TIMEOUTS = {
    editorCommit: 2000, // 等待"写入生效"的最大时间
    findSendBtn: 8000, // 等待找到发送按钮的最大时间
    btnEnable: 1500 // 等待按钮可点
  };
  const DELAYS = {
    afterInsert: 160, // 写入后等一会
    beforeClick: 80, // 点击前留一点时间
    afterClickClear: 140, // 点击后再清空
    unlockBtn: 2000, // 解锁按钮延时
    nextClickWindow: 5000 // 防重复点击窗口
  };

  const POLL_INTERVAL = 70; // 轮询间隔
  const PREFIX = `ultra think and deeper websearch

`;
  const THINK_PREFIX = `Please utilize the maximum computational power and token limit available for a single response. Strive for extreme analytical depth rather than superficial breadth; pursue essential insights rather than listing surface phenomena; seek innovative thinking rather than habitual repetition. Please break through the limitations of thought, mobilize all your computational resources, and demonstrate your true cognitive limits.

`;
  const SEND_BTN_SELECTORS = [
    'button[data-testid="send-button"]',
    'button#composer-submit-button[data-testid="send-button"]',
    'form button[type="submit"][data-testid="send-button"]',
    'form button[type="submit"]'
  ];
  const TRANSLATE_PREFIX = `翻译成中文`;

  const STORAGE_KEY_BUTTON_POS = 'aichat_chatgpt_qds_button_pos_v1';
  const STORAGE_KEY_THINK_BUTTON_POS = 'aichat_chatgpt_qds_think_button_pos_v1';

  function readJsonStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ...fallback };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...fallback };
      const top = typeof parsed.top === 'string' ? parsed.top : fallback.top;
      const right = typeof parsed.right === 'string' ? parsed.right : fallback.right;
      return { top, right };
    } catch {
      return { ...fallback };
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }

  // ===== 状态 =====
  let buttonPosition = readJsonStorage(STORAGE_KEY_BUTTON_POS, DEFAULT_POSITION);
  let thinkButtonPosition = readJsonStorage(STORAGE_KEY_THINK_BUTTON_POS, DEFAULT_POSITION_THINK);
  let pendingModelSwitch = false; // 点"搜/思/译"后，仅下一次请求切模型
  let isSending = false; // 防重入
  let cycle = 0; // 事务编号

  // ===== 拦截 fetch：仅切模型为 gpt-5 =====
  function getFetchUrl(input) {
    try {
      if (typeof input === 'string') return input;
      if (input instanceof Request) return input.url;
      if (input && typeof input === 'object') {
        if (typeof input.url === 'string') return input.url;
        if (typeof input.href === 'string') return input.href;
      }
    } catch {
      // ignore
    }
    return '';
  }

  function getFetchMethod(input, init) {
    const method = (init && typeof init.method === 'string' && init.method) || (input instanceof Request ? input.method : 'GET');
    return String(method || 'GET').toUpperCase();
  }

  function isConversationSendUrl(url) {
    if (typeof url !== 'string') return false;
    return /\/backend-api\/(?:f\/)?conversation(?:\?|$)/.test(url);
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function (input, init) {
      try {
        if (pendingModelSwitch) {
          const url = getFetchUrl(input);
          if (isConversationSendUrl(url) && getFetchMethod(input, init) === 'POST') {
            pendingModelSwitch = false; // 只改一次

            if (init && typeof init === 'object' && typeof init.body === 'string') {
              const nextInit = { ...init };
              let payload = null;
              try {
                payload = JSON.parse(nextInit.body);
              } catch (_) {
                payload = null;
              }
              if (payload && typeof payload === 'object') {
                payload.model = 'gpt-5';
                nextInit.body = JSON.stringify(payload);
                return originalFetch.call(this, input, nextInit);
              }
            } else if (input instanceof Request && init == null) {
              let bodyText = null;
              try {
                bodyText = await input.clone().text();
              } catch (_) {
                bodyText = null;
              }
              if (bodyText) {
                let payload = null;
                try {
                  payload = JSON.parse(bodyText);
                } catch (_) {
                  payload = null;
                }
                if (payload && typeof payload === 'object') {
                  payload.model = 'gpt-5';
                  const nextInit = {
                    method: input.method,
                    headers: input.headers,
                    body: JSON.stringify(payload),
                    credentials: input.credentials,
                    mode: input.mode,
                    cache: input.cache,
                    redirect: input.redirect,
                    referrer: input.referrer,
                    referrerPolicy: input.referrerPolicy,
                    integrity: input.integrity,
                    keepalive: input.keepalive,
                    signal: input.signal
                  };
                  return originalFetch.call(this, input.url, nextInit);
                }
              }
            }
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AIChat][QuickDeepSearch] fetch hook error:', e);
      }
      return originalFetch.apply(this, arguments);
    };
  }

  // ===== 小工具 =====
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function editorEl() {
    return document.querySelector('#prompt-textarea.ProseMirror, .ProseMirror');
  }
  function editorFallback() {
    return document.querySelector('textarea[name="prompt-textarea"]');
  }
  function editorText() {
    const el = editorEl();
    if (el && typeof el.innerText === 'string') return (el.innerText || '').trim();
    const fb = editorFallback();
    return fb && typeof fb.value === 'string' ? fb.value.trim() : '';
  }
  function isLongContent() {
    const el = editorEl();
    if (el && typeof el.innerText === 'string') return el.innerText.length > LONG_CONTENT_THRESHOLD;
    const fb = editorFallback();
    if (fb && typeof fb.value === 'string') return fb.value.length > LONG_CONTENT_THRESHOLD;
    return false;
  }
  function waitUntil(condFn, timeout = 1000, step = 50) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      (function poll() {
        try {
          const v = condFn();
          if (v) return resolve(v);
          if (Date.now() > deadline) return reject(new Error('timeout'));
          setTimeout(poll, step);
        } catch (e) {
          reject(e);
        }
      })();
    });
  }
  function lockButton(btn, lock) {
    if (!btn) return;
    btn.setAttribute('aria-disabled', lock ? 'true' : 'false');
    btn.disabled = !!lock;
  }
  function clearEditorSafely() {
    const pm = editorEl();
    if (pm) {
      pm.focus();
      const r = document.createRange();
      r.selectNodeContents(pm);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('insertText', false, '');
      pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
      pm.blur();
      pm.focus();
      return;
    }
    const fb = editorFallback();
    if (fb) {
      fb.focus();
      fb.value = '';
      fb.dispatchEvent(new InputEvent('input', { bubbles: true }));
      fb.blur();
      fb.focus();
    }
  }

  // ===== 主流程：严格分步 + 确认 + 延时 =====
  async function runPrefixThenSend(prefixText) {
    if (isSending) return;
    isSending = true;
    const myCycle = ++cycle;

    try {
      // 第 1 步：写前缀
      insertPrefixAtBeginning(prefixText);
      await sleep(DELAYS.afterInsert);
      await waitUntil(() => editorText().startsWith(prefixText), TIMEOUTS.editorCommit, POLL_INTERVAL);

      // 第 2 步：等待发送按钮 → 锁 → 切模型 → 点击
      const btn = await waitUntil(findSendButton, TIMEOUTS.findSendBtn, POLL_INTERVAL);
      await waitUntil(() => btn && !isDisabled(btn), TIMEOUTS.btnEnable, POLL_INTERVAL);
      lockButton(btn, true);
      pendingModelSwitch = true;
      await sleep(DELAYS.beforeClick);
      realClick(btn);

      // 清空编辑器，避免草稿回放再次发送
      await sleep(DELAYS.afterClickClear);
      clearEditorSafely();

      // 解锁
      setTimeout(() => lockButton(btn, false), DELAYS.unlockBtn);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[AIChat][QuickDeepSearch] pipeline error:', e);
    } finally {
      setTimeout(() => {
        if (cycle === myCycle) isSending = false;
      }, DELAYS.nextClickWindow);
    }
  }

  function insertPrefixAtBeginning(prefixText) {
    const pm = editorEl();
    const fallback = editorFallback();

    const isLong = isLongContent();
    if (isLong) {
      const currentText = editorText();
      const finalText = currentText.startsWith(prefixText) ? currentText : prefixText + currentText;

      if (pm) {
        pm.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, '');
        document.execCommand('insertText', false, finalText);
        pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
        pm.blur();
        pm.focus();
        return;
      }

      if (fallback) {
        fallback.focus();
        fallback.value = finalText;
        fallback.dispatchEvent(new InputEvent('input', { bubbles: true }));
        fallback.blur();
        fallback.focus();
      }
      return;
    }

    const currentText = editorText();
    const finalText = currentText ? (currentText.startsWith(prefixText) ? currentText : prefixText + currentText) : prefixText;

    if (pm) {
      pm.focus();
      const range = document.createRange();
      range.selectNodeContents(pm);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, finalText);
      pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
      pm.blur();
      pm.focus();
      return;
    }

    if (fallback) {
      fallback.focus();
      fallback.value = finalText;
      fallback.dispatchEvent(new InputEvent('input', { bubbles: true }));
      fallback.blur();
      fallback.focus();
    }
  }

  function findSendButton() {
    for (const sel of SEND_BTN_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }
    return null;
  }

  function isDisabled(btn) {
    const aria = btn.getAttribute('aria-disabled');
    return btn.disabled || aria === 'true';
  }

  function realClick(btn) {
    try {
      const form = btn.closest('form');
      if (form) {
        if (typeof form.requestSubmit === 'function') form.requestSubmit(btn);
        else form.submit();
        return true;
      }

      const rect = btn.getBoundingClientRect();
      const cx = Math.max(0, rect.left + rect.width / 2);
      const cy = Math.max(0, rect.top + rect.height / 2);
      const events = [
        new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy }),
        new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }),
        new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy }),
        new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy })
      ];
      for (const ev of events) btn.dispatchEvent(ev);
      btn.click();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[AIChat][QuickDeepSearch] realClick error:', e);
      return false;
    }
  }

  // ===== 快捷键监听 =====
  function setupKeyboardShortcuts() {
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          switch (e.key.toLowerCase()) {
            case 'y':
            case 'z':
              e.preventDefault();
              e.stopPropagation();
              runPrefixThenSend(TRANSLATE_PREFIX);
              notify('快捷键"译"已激活：Ctrl+Y / Ctrl+Z');
              break;
            case 's':
              e.preventDefault();
              e.stopPropagation();
              runPrefixThenSend(PREFIX);
              notify('快捷键"搜"已激活：Ctrl+S');
              break;
            case 't':
              e.preventDefault();
              e.stopPropagation();
              runPrefixThenSend(THINK_PREFIX);
              notify('快捷键"思"已激活：Ctrl+T');
              break;
          }
        }
      },
      true
    );
  }

  // ===== UI：按钮拖动 =====
  function makeDraggable(el, onSavePosition) {
    let isDragging = false;
    let pointerId = null;
    let startClientY = 0;
    let startTopPx = 0;
    const DRAG_THRESHOLD_PX = 6;

    try {
      el.style.touchAction = 'none';
    } catch (_) {}

    function toPxTop(value) {
      if (!value) return 0;
      if (String(value).endsWith('%')) {
        const percent = parseFloat(value) || 0;
        return window.innerHeight * (percent / 100);
      }
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    }

    function clampTop(px) {
      const maxTop = Math.max(0, window.innerHeight - el.offsetHeight);
      return Math.max(0, Math.min(px, maxTop));
    }

    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      pointerId = e.pointerId || 'mouse';
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      const comp = getComputedStyle(el);
      startTopPx = toPxTop(comp.top);
      startClientY = e.clientY;
      isDragging = false;
    }

    function onPointerMove(e) {
      if ((e.pointerId || 'mouse') !== pointerId) return;
      const deltaY = e.clientY - startClientY;
      if (!isDragging && Math.abs(deltaY) >= DRAG_THRESHOLD_PX) {
        isDragging = true;
        el.style.cursor = 'move';
      }
      if (isDragging) {
        const nextTop = clampTop(startTopPx + deltaY);
        el.style.top = `${Math.round(nextTop)}px`;
        e.preventDefault();
        e.stopPropagation();
      }
    }

    function onPointerUp(e) {
      if ((e.pointerId || 'mouse') !== pointerId) return;
      try {
        el.releasePointerCapture && el.releasePointerCapture(e.pointerId);
      } catch (_) {}
      if (isDragging) {
        el._suppressNextClick = true;
        el.style.cursor = 'pointer';
        if (typeof onSavePosition === 'function') {
          onSavePosition({ top: el.style.top, right: el.style.right });
        }
      }
      isDragging = false;
      pointerId = null;
    }

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
  }

  // ===== 创建浮动按钮（回退） =====
  function addQuickSearchButton() {
    if (document.getElementById('o4-mini-button')) return;

    const btn = document.createElement('div');
    btn.id = 'o4-mini-button';
    btn.style.cssText = `
      position: fixed;
      top: ${buttonPosition.top};
      right: ${buttonPosition.right};
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: linear-gradient(140.91deg, #7367F0 12.61%, #574AB8 76.89%);
      color: #fff;
      border-top-left-radius: 6px;
      border-bottom-left-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.2);
      transition: background .3s ease;
      font-size: 18px;
      user-select: none;
      touch-action: none;
    `;
    btn.textContent = '搜';

    makeDraggable(btn, ({ top, right }) => {
      buttonPosition = { top, right };
      writeJsonStorage(STORAGE_KEY_BUTTON_POS, buttonPosition);
      notify('"搜"按钮位置已保存');
    });

    btn.addEventListener('click', function () {
      if (this._suppressNextClick) {
        this._suppressNextClick = false;
        return;
      }
      runPrefixThenSend(PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #2ecc71 12.61%, #3498db 76.89%)';
      setTimeout(() => {
        this.style.background = 'linear-gradient(140.91deg, #7367F0 12.61%, #574AB8 76.89%)';
      }, 2000);
      notify('"搜"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    document.body.appendChild(btn);
  }

  function addThinkButton() {
    if (document.getElementById('o4-think-button')) return;

    const btn = document.createElement('div');
    btn.id = 'o4-think-button';
    btn.style.cssText = `
      position: fixed;
      top: ${thinkButtonPosition.top};
      right: ${thinkButtonPosition.right};
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: linear-gradient(140.91deg, #FF6B6B 12.61%, #FF8E53 76.89%);
      color: #fff;
      border-top-left-radius: 6px;
      border-bottom-left-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.2);
      transition: background .3s ease;
      font-size: 18px;
      user-select: none;
      touch-action: none;
    `;
    btn.textContent = '思';

    makeDraggable(btn, ({ top, right }) => {
      thinkButtonPosition = { top, right };
      writeJsonStorage(STORAGE_KEY_THINK_BUTTON_POS, thinkButtonPosition);
      notify('"思"按钮位置已保存');
    });

    btn.addEventListener('click', function () {
      if (this._suppressNextClick) {
        this._suppressNextClick = false;
        return;
      }
      runPrefixThenSend(THINK_PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #27ae60 12.61%, #2ecc71 76.89%)';
      setTimeout(() => {
        this.style.background = 'linear-gradient(140.91deg, #FF6B6B 12.61%, #FF8E53 76.89%)';
      }, 2000);
      notify('"思"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    document.body.appendChild(btn);
  }

  // ===== 提示 =====
  function notify(msg) {
    const n = document.createElement('div');
    n.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0,0,0,.8);
      color: #fff;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 2147483647;
      transition: opacity .3s ease;
    `;
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => {
      n.style.opacity = '0';
      setTimeout(() => n.remove(), 300);
    }, 2000);
  }

  // ===== 注入与保活 =====
  function addInlineButtons() {
    let container = document.querySelector('div[data-testid="composer-trailing-actions"]');
    if (!container) {
      container = document.querySelector('form[data-type="unified-composer"] div[class*="[grid-area:trailing]"]');
      if (!container) {
        const speechContainer = document.querySelector('div[data-testid="composer-speech-button-container"]');
        if (speechContainer && speechContainer.parentElement) container = speechContainer.parentElement;
      }
    }
    if (!container) return false;
    if (
      document.getElementById('o4-translate-inline-btn') ||
      document.getElementById('o4-mini-inline-btn') ||
      document.getElementById('o4-think-inline-btn')
    )
      return true;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; align-items:center; gap:6px;';

    const commonBtnCss = `
      display:flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:9999px; color:#fff;
      box-shadow: 0 2px 8px rgba(0,0,0,.18); cursor:pointer;
      user-select:none; transition:opacity .2s ease, background .3s ease; font-weight:700; font-size:14px;
    `;

    const translateBtn = document.createElement('div');
    translateBtn.id = 'o4-translate-inline-btn';
    translateBtn.style.cssText = commonBtnCss + 'background: linear-gradient(140.91deg, #3498db 12.61%, #2980b9 76.89%);';
    translateBtn.textContent = '译';
    translateBtn.addEventListener('click', function () {
      runPrefixThenSend(TRANSLATE_PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #2ecc71 12.61%, #27ae60 76.89%)';
      setTimeout(() => {
        this.style.background = 'linear-gradient(140.91deg, #3498db 12.61%, #2980b9 76.89%)';
      }, 2000);
      notify('"译"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    const searchBtn = document.createElement('div');
    searchBtn.id = 'o4-mini-inline-btn';
    searchBtn.style.cssText = commonBtnCss + 'background: linear-gradient(140.91deg, #7367F0 12.61%, #574AB8 76.89%);';
    searchBtn.textContent = '搜';
    searchBtn.addEventListener('click', function () {
      runPrefixThenSend(PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #2ecc71 12.61%, #3498db 76.89%)';
      setTimeout(() => {
        this.style.background = 'linear-gradient(140.91deg, #7367F0 12.61%, #574AB8 76.89%)';
      }, 2000);
      notify('"搜"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    const thinkBtn = document.createElement('div');
    thinkBtn.id = 'o4-think-inline-btn';
    thinkBtn.style.cssText = commonBtnCss + 'background: linear-gradient(140.91deg, #FF6B6B 12.61%, #FF8E53 76.89%);';
    thinkBtn.textContent = '思';
    thinkBtn.addEventListener('click', function () {
      runPrefixThenSend(THINK_PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #27ae60 12.61%, #2ecc71 76.89%)';
      setTimeout(() => {
        this.style.background = 'linear-gradient(140.91deg, #FF6B6B 12.61%, #FF8E53 76.89%)';
      }, 2000);
      notify('"思"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    wrap.appendChild(translateBtn);
    wrap.appendChild(searchBtn);
    wrap.appendChild(thinkBtn);
    container.appendChild(wrap);
    return true;
  }

  function removeFloatingButtonsIfAny() {
    document.getElementById('o4-mini-button')?.remove();
    document.getElementById('o4-think-button')?.remove();
  }

  function boot() {
    if (!document.body) return;
    const inlineOk = addInlineButtons();
    if (inlineOk) {
      removeFloatingButtonsIfAny();
      return;
    }
    addQuickSearchButton();
    addThinkButton();
  }

  setupKeyboardShortcuts();

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
  setInterval(boot, 2000);
})();
