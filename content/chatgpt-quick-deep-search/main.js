(() => {
  'use strict';

  // Avoid running inside internal ChatGPT iframes when split-view enables `allFrames` injection.
  const ALLOWED_FRAME = (() => {
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
  if (!ALLOWED_FRAME) return;

  const GUARD_KEY = '__aichat_chatgpt_quick_deep_search_v1__';
  if (globalThis[GUARD_KEY]) return;
  Object.defineProperty(globalThis, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  const SITE = (() => {
    try {
      const host = String(location.hostname || '').toLowerCase();
      const path = String(location.pathname || '');
      if (host === 'chatgpt.com') return 'chatgpt';
      if (host === 'gemini.google.com' && path.startsWith('/app')) return 'gemini_app';
      if (host === 'business.gemini.google') return 'gemini_business';
      if (host === 'www.genspark.ai') return 'genspark';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  })();

  // genspark: only AI Chat page (agents). The "moa_chat" entry currently redirects to ai_chat, allow both.
  try {
    if (SITE === 'genspark') {
      const u = new URL(location.href);
      const type = String(u.searchParams.get('type') || '').toLowerCase();
      const okType = type === 'moa_chat' || type === 'ai_chat';
      const okPath = String(u.pathname || '').startsWith('/agents');
      if (!okPath || !okType) return;
    }
  } catch {}

  // ===== 配置（可微调延时和阈值） =====
  const DEFAULT_POSITION = { top: '30%', right: '0px' };
  const DEFAULT_POSITION_TRANSLATE = { top: '40%', right: '0px' };
  const DEFAULT_POSITION_THINK = { top: '50%', right: '0px' };
  const TIMEOUTS = {
    editorCommit: 2000, // 等待"写入生效"的最大时间
    findSendBtn: 8000, // 等待找到发送按钮的最大时间
    btnEnable: 1500 // 等待按钮可点
  };
  const DELAYS = {
    afterInsert: 160, // 写入后等一会
    beforeClick: 80, // 点击前留一点时间
    afterClickClear: 140, // 点击后再清空
    nextClickWindow: 5000 // 防重复点击窗口
  };

  const POLL_INTERVAL = 70; // 轮询间隔
  // Performance-first: only inject inline buttons (no floating fallback UI).
  const ENABLE_FLOATING_FALLBACK = false;
  const PREFIX = `ultra think and deeper websearch

`;
  const THINK_PREFIX = `Please utilize the maximum computational power and token limit available for a single response. Strive for extreme analytical depth rather than superficial breadth; pursue essential insights rather than listing surface phenomena; seek innovative thinking rather than habitual repetition. Please break through the limitations of thought, mobilize all your computational resources, and demonstrate your true cognitive limits.

`;
  const CHATGPT_SEND_BTN_SELECTORS = [
    'button[data-testid="send-button"]',
    'button#composer-submit-button[data-testid="send-button"]',
    'form button[type="submit"][data-testid="send-button"]',
    'form button[type="submit"]'
  ];
  const TRANSLATE_PREFIX = `翻译成中文`;

  const STORAGE_KEY_BUTTON_POS = 'aichat_chatgpt_qds_button_pos_v1';
  const STORAGE_KEY_TRANSLATE_BUTTON_POS = 'aichat_chatgpt_qds_translate_button_pos_v1';
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
  let translateButtonPosition = readJsonStorage(STORAGE_KEY_TRANSLATE_BUTTON_POS, DEFAULT_POSITION_TRANSLATE);
  let thinkButtonPosition = readJsonStorage(STORAGE_KEY_THINK_BUTTON_POS, DEFAULT_POSITION_THINK);
  let pendingModelSwitch = false; // 点"搜/思/译"后，仅下一次请求切模型
  let isSending = false; // 防重入
  let cycle = 0; // 事务编号

  // ===== 调试信息（仅在点击触发时更新，便于排查站点差异）=====
  const DEBUG_LAST_KEY = '__aichat_qds_debug_last_v1__';
  function setDebug(patch) {
    try {
      globalThis[DEBUG_LAST_KEY] = { ...(globalThis[DEBUG_LAST_KEY] || {}), ...(patch || {}) };
    } catch {}
  }

  // ===== 轻量缓存（避免频繁深度查询）=====
  const CACHE_TTL_MS = { editor: 600, sendButton: 350 };
  const editorElCache = { value: null, at: 0 };
  const editorFallbackCache = { value: null, at: 0 };
  const sendButtonCache = { value: null, at: 0 };

  function readCached(cache, ttlMs, resolver) {
    const now = Date.now();
    const cachedValue = cache.value;
    if (now - cache.at < ttlMs) {
      if (!cachedValue) return null;
      if (cachedValue && cachedValue.isConnected) return cachedValue;
    }
    let next = null;
    try {
      next = resolver() || null;
    } catch {
      next = null;
    }
    cache.value = next;
    cache.at = now;
    return next;
  }

  // ===== ChatGPT：通过共享 fetch hub 仅切一次模型为 gpt-5 =====
  function installChatGPTModelSwitchHook() {
    try {
      if (SITE !== 'chatgpt') return;
      const hub = window.__aichat_chatgpt_fetch_hub_v1__;
      if (!hub || typeof hub.register !== 'function') return;
      hub.register({
        priority: 120,
        onConversationPayload: (payload) => {
          try {
            if (!pendingModelSwitch) return;
            if (!payload || typeof payload !== 'object') return;
            pendingModelSwitch = false; // 只改一次
            payload.model = 'gpt-5';
            return payload;
          } catch {}
        }
      });
    } catch {}
  }
  installChatGPTModelSwitchHook();

  // ===== 小工具 =====
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function walkOpenShadows(start, visit) {
    const stack = [start];
    const seen = new Set();
    while (stack.length) {
      const root = stack.pop();
      if (!root || seen.has(root)) continue;
      seen.add(root);
      try { visit(root); } catch {}
      if (!root.querySelectorAll) continue;
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el && el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
  }

  function deepQueryFirst(start, selector) {
    let found = null;
    walkOpenShadows(start, (root) => {
      if (found || !root.querySelector) return;
      const hit = root.querySelector(selector);
      if (hit) found = hit;
    });
    return found;
  }

  function deepQueryAll(start, selector) {
    const out = [];
    walkOpenShadows(start, (root) => {
      if (!root.querySelectorAll) return;
      out.push(...root.querySelectorAll(selector));
    });
    return out;
  }

  function getSiteRoot() {
    if (SITE === 'gemini_business') {
      try {
        return document.querySelector('ucs-standalone-app')?.shadowRoot || null;
      } catch {
        return null;
      }
    }
    if (SITE === 'gemini_app') {
      return document.querySelector('chat-app#app-root') || document.documentElement;
    }
    return document.documentElement;
  }

  function pickBottomMostVisible(candidates) {
    const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    let best = null;
    let bestScore = -Infinity;
    for (const el of list) {
      try {
        if (!el || !el.getBoundingClientRect) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        // Prefer elements closer to the bottom (composer)
        const score = r.bottom;
        if (score > bestScore) { bestScore = score; best = el; }
      } catch {}
    }
    return best;
  }

  function editorEl() {
    return readCached(editorElCache, CACHE_TTL_MS.editor, editorElRaw);
  }
  function editorElRaw() {
    if (SITE === 'chatgpt') {
      // ChatGPT has changed composer DOM multiple times; keep this permissive and prefer the visible editor.
      return (
        document.querySelector('#prompt-textarea.ProseMirror') ||
        document.querySelector('#prompt-textarea[contenteditable="true"]') ||
        document.querySelector('#prompt-textarea .ProseMirror[contenteditable="true"]') ||
        document.querySelector('.ProseMirror[contenteditable="true"]')
      );
    }
    if (SITE === 'gemini_app') {
      const root = getSiteRoot() || document.documentElement;
      const direct = root.querySelector?.('div.ql-editor[contenteditable="true"][role="textbox"]') || null;
      if (direct) return direct;
      return pickBottomMostVisible(Array.from(root.querySelectorAll?.('[role="textbox"][contenteditable="true"]') || []));
    }
    if (SITE === 'gemini_business') {
      const root = getSiteRoot();
      if (!root) return null;
      const direct =
        deepQueryFirst(root, 'div[contenteditable="true"][role="textbox"][aria-label]') ||
        deepQueryFirst(root, 'div[contenteditable="true"][role="textbox"]') ||
        deepQueryFirst(root, 'div[contenteditable="true"][aria-label]') ||
        null;
      if (direct) return direct;
      return pickBottomMostVisible(deepQueryAll(root, '[role="textbox"][contenteditable="true"], div[contenteditable="true"]'));
    }
    return null;
  }
  function editorFallback() {
    return readCached(editorFallbackCache, CACHE_TTL_MS.editor, editorFallbackRaw);
  }
  function editorFallbackRaw() {
    if (SITE === 'chatgpt') {
      const candidates = Array.from(document.querySelectorAll('textarea#prompt-textarea, textarea[name="prompt-textarea"]'));
      return pickBottomMostVisible(candidates);
    }
    if (SITE === 'genspark') {
      return (
        document.querySelector('textarea.search-input.j-search-input') ||
        Array.from(document.querySelectorAll('textarea')).find((t) => String(t.getAttribute('placeholder') || '').toLowerCase().includes('ask anything')) ||
        null
      );
    }
    // Gemini sometimes uses textarea in fallback UIs.
    const root = getSiteRoot() || document.documentElement;
    const tas = Array.from(root.querySelectorAll?.('textarea') || []);
    return pickBottomMostVisible(tas);
  }
  function readContentEditableText(el) {
    try {
      if (!el) return '';
      const text = typeof el.innerText === 'string' ? (el.innerText || '').trim() : '';
      if (!text) return '';
      const placeholderEl = el.querySelector?.('.placeholder.ProseMirror-widget, .placeholder');
      const placeholderText = placeholderEl ? String(placeholderEl.textContent || '').trim() : '';
      if (placeholderText && text === placeholderText) return '';
      return text;
    } catch {
      return '';
    }
  }
  function editorText() {
    const el = editorEl();
    if (el) {
      const t = readContentEditableText(el);
      if (t) return t;
      // When the real editor exists, ignore the hidden textarea mirror (it can be stale).
      return '';
    }
    const fb = editorFallback();
    return fb && typeof fb.value === 'string' ? fb.value.trim() : '';
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
  function clearEditorSafely() {
    const pm = editorEl();
    if (pm) {
      pm.focus();
      document.execCommand('selectAll', false, null);
      try {
        pm.dispatchEvent(
          new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward', data: '' })
        );
      } catch {}
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

  // ===== Draft guard (ChatGPT): best-effort protect user pasted text from composer re-mount wipes =====
  const DRAFT_GUARD_ENABLED = SITE === 'chatgpt';
  const DRAFT_GUARD_SESSION_KEY = '__aichat_chatgpt_draft_guard_v1__';
  const DRAFT_GUARD_TTL_MS = 30_000;
  const DRAFT_GUARD_RESTORE_WINDOW_MS = 3500;
  const DRAFT_GUARD_MAX_CHARS = 50_000;
  const DRAFT_GUARD_MAX_RESTORES = 2;
  let dgSavedText = '';
  let dgSavedAt = 0;
  let dgLastUserInputAt = 0;
  let dgLastSubmitAt = 0;
  let dgLastRestoreAt = 0;
  let dgRestoreCount = 0;
  let dgCaptureTimer = 0;
  let dgIgnoreUntil = 0;
  let dgSuppressUntil = 0;

  function dgNow() {
    return Date.now();
  }

  function dgIsComposerTarget(t) {
    try {
      if (!t) return false;
      const el = /** @type {Element} */ (t.nodeType === 1 ? t : t.parentElement);
      if (!el || typeof el.closest !== 'function') return false;
      return !!(el.closest('#prompt-textarea') || el.closest('textarea[name="prompt-textarea"]'));
    } catch {
      return false;
    }
  }

  function dgIsGenerating() {
    try {
      return !!document.querySelector('[data-testid="stop-button"]');
    } catch {
      return false;
    }
  }

  function dgLoad() {
    try {
      const raw = sessionStorage.getItem(DRAFT_GUARD_SESSION_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const t = Number(data?.t || 0);
      const text = typeof data?.text === 'string' ? data.text : '';
      if (!t || !text) return;
      if (dgNow() - t > DRAFT_GUARD_TTL_MS) return;
      dgSavedText = text;
      dgSavedAt = t;
      dgLastUserInputAt = t;
    } catch {
      // ignore
    }
  }

  function dgPersist() {
    try {
      if (!dgSavedText) {
        sessionStorage.removeItem(DRAFT_GUARD_SESSION_KEY);
        return;
      }
      sessionStorage.setItem(
        DRAFT_GUARD_SESSION_KEY,
        JSON.stringify({
          t: dgSavedAt,
          text: dgSavedText
        })
      );
    } catch {
      // ignore
    }
  }

  function dgSaveText(text) {
    const t = String(text || '').trimEnd();
    dgSavedText = t.length > DRAFT_GUARD_MAX_CHARS ? t.slice(0, DRAFT_GUARD_MAX_CHARS) : t;
    dgSavedAt = dgNow();
    dgPersist();
  }

  function dgClearSaved() {
    dgSavedText = '';
    dgSavedAt = 0;
    try {
      sessionStorage.removeItem(DRAFT_GUARD_SESSION_KEY);
    } catch {}
  }

  function dgWriteEditorText(finalText) {
    const pm = editorEl();
    const fb = editorFallback();
    const text = String(finalText || '');

    if (pm) {
      try {
        pm.focus();
        document.execCommand('selectAll', false, null);
        try {
          pm.dispatchEvent(
            new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text })
          );
        } catch {}
        const ok = document.execCommand('insertText', false, text);
        try {
          pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
        } catch {}
        pm.blur();
        pm.focus();
        return !!ok;
      } catch {
        return false;
      }
    }

    if (fb) {
      try {
        fb.focus();
        fb.value = text;
        fb.dispatchEvent(new InputEvent('input', { bubbles: true }));
        fb.blur();
        fb.focus();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  function dgShouldSuppressRestore() {
    const now = dgNow();
    if (now < dgSuppressUntil || now < dgIgnoreUntil) return true;
    try {
      const until = Number(globalThis.__aichatDraftGuardSuppressUntil || 0);
      if (until && now < until) return true;
    } catch {}
    if (isSending) return true;
    if (dgIsGenerating()) return true;
    if (dgLastSubmitAt && now - dgLastSubmitAt < 3500) return true;
    return false;
  }

  function dgMaybeRestore() {
    if (!DRAFT_GUARD_ENABLED) return;
    const now = dgNow();
    if (!dgSavedText) return;
    if (dgShouldSuppressRestore()) return;
    if (now - dgSavedAt > DRAFT_GUARD_TTL_MS) return;
    if (dgLastUserInputAt && now - dgLastUserInputAt > DRAFT_GUARD_RESTORE_WINDOW_MS) return;
    if (dgRestoreCount >= DRAFT_GUARD_MAX_RESTORES && now - dgLastRestoreAt < 15_000) return;

    const cur = editorText();
    if (cur) return;

    // Only restore when the composer exists; avoids noisy retries on pages without composer.
    if (!editorEl() && !editorFallback()) return;

    const ok = dgWriteEditorText(dgSavedText);
    if (!ok) return;
    dgRestoreCount += 1;
    dgLastRestoreAt = now;
    // After restoring, capture the new state to avoid re-restoring due to mirror lag.
    dgSaveText(dgSavedText);
  }

  function dgScheduleCapture() {
    if (!DRAFT_GUARD_ENABLED) return;
    if (dgCaptureTimer) return;
    dgCaptureTimer = setTimeout(() => {
      dgCaptureTimer = 0;
      if (dgNow() < dgIgnoreUntil) return;
      const t = editorText();
      if (!t) return dgClearSaved();
      dgSaveText(t);
    }, 120);
  }

  function dgSuppress(ms = 2500) {
    const until = dgNow() + Math.max(0, Number(ms) || 0);
    dgSuppressUntil = Math.max(dgSuppressUntil, until);
    try {
      globalThis.__aichatDraftGuardSuppressUntil = Math.max(Number(globalThis.__aichatDraftGuardSuppressUntil || 0), until);
    } catch {}
  }

  (function installDraftGuard() {
    if (!DRAFT_GUARD_ENABLED) return;
    try {
      if (globalThis.__aichatDraftGuardInstalledV1) return;
      Object.defineProperty(globalThis, '__aichatDraftGuardInstalledV1', { value: true, configurable: false });
    } catch {}

    dgLoad();

    // Track user input/paste to keep a recent draft snapshot.
    try {
      document.addEventListener(
        'beforeinput',
        (e) => {
          try {
            if (!dgIsComposerTarget(e?.target)) return;
            dgLastUserInputAt = dgNow();
            dgScheduleCapture();
          } catch {}
        },
        true
      );
      document.addEventListener(
        'input',
        (e) => {
          try {
            if (!dgIsComposerTarget(e?.target)) return;
            dgLastUserInputAt = dgNow();
            dgScheduleCapture();
          } catch {}
        },
        true
      );
      document.addEventListener(
        'paste',
        (e) => {
          try {
            if (!dgIsComposerTarget(e?.target)) return;
            dgLastUserInputAt = dgNow();
            dgScheduleCapture();
          } catch {}
        },
        true
      );
      document.addEventListener(
        'submit',
        (e) => {
          try {
            const form = e?.target;
            if (!form || typeof form.querySelector !== 'function') return;
            if (!(form.querySelector('#prompt-textarea') || form.querySelector('textarea[name=\"prompt-textarea\"]'))) return;
            dgLastSubmitAt = dgNow();
            dgSuppress(4000);
            dgClearSaved();
          } catch {}
        },
        true
      );
    } catch {}

    // Periodic presence check: if the composer gets wiped shortly after user paste/typing, restore it.
    try {
      setInterval(() => {
        try {
          if (document.hidden) return;
          dgMaybeRestore();
        } catch {}
      }, 450);
    } catch {}

    // Also run a couple of early checks (covers the initial hydration window).
    try {
      setTimeout(dgMaybeRestore, 350);
      setTimeout(dgMaybeRestore, 1200);
    } catch {}
  })();

  // ===== 主流程：严格分步 + 确认 + 延时 =====
  function editorStartsWith(prefixText) {
    const prefix = String(prefixText || '').trimEnd();
    if (!prefix) return true;
    const el = editorEl();
    if (el) {
      const t = readContentEditableText(el);
      if (t.startsWith(prefix)) return true;
    }
    const fb = editorFallback();
    if (fb && typeof fb.value === 'string') {
      const t = fb.value.trim();
      if (t.startsWith(prefix)) return true;
    }
    return false;
  }

  async function runPrefixThenSend(prefixText) {
    if (isSending) return;
    isSending = true;
    const myCycle = ++cycle;
    const draftBefore = editorText();
    const draftSig = (() => {
      try {
        const t = String(draftBefore || '').trim();
        if (!t) return '';
        // Use a short signature so we can detect accidental “replace” without doing heavy comparisons.
        return t.slice(0, Math.min(120, t.length));
      } catch {
        return '';
      }
    })();

    try {
      // Our automation will intentionally clear the composer; prevent the draft guard from restoring it.
      dgIgnoreUntil = dgNow() + 10_000;
      dgSuppress(10_000);
      setDebug({ t: Date.now(), site: SITE, step: 'start', prefix: String(prefixText || '').slice(0, 60) });
      // 第 1 步：写前缀
      insertPrefixAtBeginning(prefixText);
      await sleep(DELAYS.afterInsert);
      await waitUntil(() => editorStartsWith(prefixText), TIMEOUTS.editorCommit, POLL_INTERVAL);
      setDebug({ step: 'editorCommitted', editorPreview: editorText().slice(0, 120) });
      // Safety net: if the prefix insertion accidentally replaced the user's draft (reported by users),
      // rebuild the full text by explicitly writing "prefix + originalDraft".
      try {
        if (draftSig) {
          const after = editorText();
          if (after && !String(after).includes(draftSig)) {
            const merged = String(prefixText || '') + String(draftBefore || '');
            setDebug({ step: 'draftRepair', reason: 'signature_missing', mergedPreview: merged.slice(0, 120) });
            dgSuppress(8000);
            dgIgnoreUntil = dgNow() + 8000;
            dgWriteEditorText(merged);
            await sleep(DELAYS.afterInsert);
            await waitUntil(() => editorStartsWith(prefixText), TIMEOUTS.editorCommit, POLL_INTERVAL);
          }
        }
      } catch {}

      // 第 2 步：等待发送按钮 → 锁 → 切模型 → 点击
      await waitUntil(findSendButton, TIMEOUTS.findSendBtn, POLL_INTERVAL);
      const btn = await waitUntil(() => {
        const b = findSendButton();
        if (!b) return null;
        if (isDisabled(b)) return null;
        return b;
      }, TIMEOUTS.btnEnable, POLL_INTERVAL);
      setDebug({ step: 'btnReady', btnFound: !!btn, btnDisabled: btn ? isDisabled(btn) : null });
      pendingModelSwitch = SITE === 'chatgpt';
      await sleep(DELAYS.beforeClick);
      realClick(btn);
      setDebug({ step: 'clicked' });

      // 清空编辑器，避免草稿回放再次发送
      await sleep(DELAYS.afterClickClear);
      dgSuppress(8000);
      clearEditorSafely();
      setDebug({ step: 'cleared' });

    } catch (e) {
      // eslint-disable-next-line no-console
      setDebug({ step: 'error', error: e instanceof Error ? e.message : String(e) });
      console.warn('[AIChat][QuickDeepSearch] pipeline error:', e);
    } finally {
      setTimeout(() => {
        if (cycle === myCycle) isSending = false;
      }, DELAYS.nextClickWindow);
    }
  }

  function insertPrefixAtBeginning(prefixText) {
    const prefix = String(prefixText || '');
    if (!prefix) return;
    if (editorStartsWith(prefixText)) return;

    const pm = editorEl();
    const fallback = editorFallback();

    // Prefer inserting into the contenteditable without reconstructing the full text.
    // This avoids edge cases where reading the current draft fails (and would otherwise "replace" user input).
    if (pm) {
      let ok = false;
      try {
        pm.focus();
        try {
          const sel = window.getSelection && window.getSelection();
          if (sel && typeof document.createRange === 'function') {
            const range = document.createRange();
            range.selectNodeContents(pm);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch {}
        try {
          pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: prefix }));
        } catch {}
        ok = !!document.execCommand('insertText', false, prefix);
        try {
          pm.dispatchEvent(new InputEvent('input', { bubbles: true }));
        } catch {}
        try {
          pm.blur();
          pm.focus();
        } catch {}
      } finally {
        setDebug({ step: 'insert', mode: 'insert_at_start', execOk: !!ok, editorPreview: readContentEditableText(pm).slice(0, 120) });
      }
      return;
    }

    if (fallback) {
      try {
        fallback.focus();
        const cur = typeof fallback.value === 'string' ? fallback.value : '';
        const next = cur ? prefix + cur : prefix;
        fallback.value = next;
        fallback.dispatchEvent(new InputEvent('input', { bubbles: true }));
        fallback.blur();
        fallback.focus();
      } catch {}
    }
  }

  function findSendButton() {
    return readCached(sendButtonCache, CACHE_TTL_MS.sendButton, findSendButtonRaw);
  }
  function findSendButtonRaw() {
    if (SITE === 'chatgpt') {
      for (const sel of CHATGPT_SEND_BTN_SELECTORS) {
        const btn = document.querySelector(sel);
        if (btn) return btn;
      }
      return null;
    }

    if (SITE === 'gemini_app') {
      const root = getSiteRoot() || document.documentElement;
      const direct =
        root.querySelector?.('button.send-button, button[aria-label="Send message"], button[aria-label*="Send"], button[title*="Send"]') || null;
      if (direct) return direct;
      const btns = Array.from(root.querySelectorAll?.('button[aria-label], button[title], button[type=\"submit\"]') || []);
      const hits = btns.filter((b) => {
        const label = (b.getAttribute('aria-label') || '').trim();
        const title = (b.getAttribute('title') || '').trim();
        const text = (b.textContent || '').trim();
        const hay = `${label} ${title} ${text}`.trim();
        return /\bsend\b/i.test(hay) || /\bsubmit\b/i.test(hay) || /发送|提交/.test(hay);
      });
      return pickBottomMostVisible(hits);
    }

    if (SITE === 'gemini_business') {
      const root = getSiteRoot();
      if (!root) return null;
      const direct =
        deepQueryFirst(root, 'button[aria-label="Send message"]') ||
        deepQueryFirst(root, 'button[aria-label*="Send"]') ||
        deepQueryFirst(root, 'button[title*="Send"]') ||
        null;
      if (direct) return direct;
      const btns = deepQueryAll(root, 'button[aria-label], button[title], button[type="submit"]');
      const hits = btns.filter((b) => {
        const label = (b.getAttribute('aria-label') || '').trim();
        const title = (b.getAttribute('title') || '').trim();
        const text = (b.textContent || '').trim();
        const hay = `${label} ${title} ${text}`.trim();
        return /\bsend\b/i.test(hay) || /\bsubmit\b/i.test(hay) || /发送|提交/.test(hay);
      });
      return pickBottomMostVisible(hits);
    }

    if (SITE === 'genspark') {
      const ta = editorFallback();
      const parent = ta?.parentElement || null;
      const group = parent?.querySelector?.('.icon-group') || document.querySelector('.icon-group') || null;
      const candidates = [
        group?.querySelector?.('.enter-icon-wrapper'),
        group?.querySelector?.('.enter-icon'),
        parent?.querySelector?.('.enter-icon-wrapper'),
        parent?.querySelector?.('.enter-icon')
      ].filter(Boolean);
      const best = pickBottomMostVisible(candidates);
      if (best) return best;
      // fallback: try any obvious clickable in the icon group
      const clickables = group ? Array.from(group.querySelectorAll('[role="button"], button, .cursor-pointer')) : [];
      return pickBottomMostVisible(clickables);
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
  function addTranslateButton() {
    if (document.getElementById('o4-translate-button')) return;

    const btn = document.createElement('div');
    btn.id = 'o4-translate-button';
    btn.style.cssText = `
      position: fixed;
      top: ${translateButtonPosition.top};
      right: ${translateButtonPosition.right};
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: linear-gradient(140.91deg, #3498db 12.61%, #2980b9 76.89%);
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
    btn.textContent = '译';

    makeDraggable(btn, ({ top, right }) => {
      translateButtonPosition = { top, right };
      writeJsonStorage(STORAGE_KEY_TRANSLATE_BUTTON_POS, translateButtonPosition);
      notify('"译"按钮位置已保存');
    });

    btn.addEventListener('click', function () {
      if (this._suppressNextClick) {
        this._suppressNextClick = false;
        return;
      }
      runPrefixThenSend(TRANSLATE_PREFIX);
      this.style.background = 'linear-gradient(140.91deg, #2ecc71 12.61%, #27ae60 76.89%)';
      setTimeout(() => {
        this.style.background = 'linear-gradient(140.91deg, #3498db 12.61%, #2980b9 76.89%)';
      }, 2000);
      notify('"译"已激活：1)写前缀→2)发送（逐步确认+延时）');
    });

    document.body.appendChild(btn);
  }

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
  // ChatGPT uses React + hydration; mutating the composer subtree during hydration can cause
  // recoverable errors and visible remount “flashing”. To avoid this, render the inline
  // buttons as a BODY-level overlay positioned next to the send/stop button.
  const CHATGPT_OVERLAY_GAP_PX = 6;
  const CHATGPT_OVERLAY_BTN_SIZE_PX = 32;
  let chatgptOverlayRaf = 0;
  let chatgptOverlayHasPosition = false;

  function findChatgptOverlayAnchor() {
    return (
      findSendButton() ||
      document.querySelector('[data-testid="stop-button"]') ||
      document.querySelector('div[data-testid="composer-trailing-actions"]') ||
      document.querySelector('#thread-bottom button[type="submit"]') ||
      null
    );
  }

  function scheduleChatgptOverlayUpdate() {
    if (SITE !== 'chatgpt') return;
    if (chatgptOverlayRaf) return;
    chatgptOverlayRaf = requestAnimationFrame(() => {
      chatgptOverlayRaf = 0;
      try {
        const wrap = document.getElementById('o4-inline-btn-wrap');
        if (!wrap || !wrap.isConnected) return;

        const anchor = findChatgptOverlayAnchor();
        if (!anchor || !anchor.isConnected || typeof anchor.getBoundingClientRect !== 'function') {
          if (!chatgptOverlayHasPosition) wrap.style.display = 'none';
          return;
        }

        const r = anchor.getBoundingClientRect();
        if (!Number.isFinite(r.left) || !Number.isFinite(r.top)) return;

        const top = Math.max(
          0,
          Math.min(
            window.innerHeight - CHATGPT_OVERLAY_BTN_SIZE_PX,
            r.top + (r.height - CHATGPT_OVERLAY_BTN_SIZE_PX) / 2
          )
        );
        const left = Math.max(0, Math.min(window.innerWidth, r.left));

        wrap.style.display = 'flex';
        wrap.style.left = `${Math.round(left)}px`;
        wrap.style.top = `${Math.round(top)}px`;
        wrap.style.transform = `translateX(calc(-100% - ${CHATGPT_OVERLAY_GAP_PX}px))`;

        chatgptOverlayHasPosition = true;
      } catch {}
    });
  }
  function addInlineButtons() {
    try {
      const existing = document.getElementById('o4-inline-btn-wrap');
      if (existing && existing.isConnected) {
        if (SITE === 'chatgpt') {
          if (existing.parentElement !== document.body && document.body) {
            existing.remove();
          } else {
            scheduleChatgptOverlayUpdate();
            return true;
          }
        } else {
          return true;
        }
      }
    } catch {}

    if (SITE === 'chatgpt') {
      const anchor = findChatgptOverlayAnchor();
      if (!anchor) return false;
    }

    let container = null;
    let insertBefore = null;

    if (SITE === 'chatgpt') {
      container = document.body;
    } else if (SITE === 'gemini_app') {
      const sendBtn = findSendButton();
      container = sendBtn?.parentElement || null;
      insertBefore = sendBtn && sendBtn.parentElement === container ? sendBtn : null;
    } else if (SITE === 'gemini_business') {
      const sendBtn = findSendButton();
      container = sendBtn?.parentElement || sendBtn?.parentNode || null;
      insertBefore = sendBtn && sendBtn.parentNode === container ? sendBtn : null;
    } else if (SITE === 'genspark') {
      const ta = editorFallback();
      const parent = ta?.parentElement || null;
      const group = parent?.querySelector?.('.icon-group') || document.querySelector('.icon-group') || null;
      container = group?.querySelector?.('.right-icon-group') || group || null;
      const sendEl = group?.querySelector?.('.enter-icon') || group?.querySelector?.('.enter-icon-wrapper') || null;
      insertBefore = sendEl && sendEl.parentElement === container ? sendEl : null;
    }

    if (!container) return false;
    try {
      const root = typeof container.getRootNode === 'function' ? container.getRootNode() : document;
      const q = root && typeof root.querySelector === 'function' ? root.querySelector.bind(root) : document.querySelector.bind(document);
      if (
        q('#o4-inline-btn-wrap') ||
        q('#o4-translate-inline-btn') ||
        q('#o4-mini-inline-btn') ||
        q('#o4-think-inline-btn')
      )
        return true;
    } catch {}

    const wrap = document.createElement('div');
    wrap.id = 'o4-inline-btn-wrap';
    wrap.style.cssText =
      SITE === 'chatgpt'
        ? 'position:fixed; z-index:2147483647; display:none; align-items:center; gap:6px; flex-shrink:0; pointer-events:auto;'
        : 'display:flex; align-items:center; gap:6px; flex-shrink:0;';

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
    try {
      if (insertBefore && insertBefore.parentNode === container && typeof container.insertBefore === 'function') {
        container.insertBefore(wrap, insertBefore);
      } else {
        container.appendChild(wrap);
      }
      if (SITE === 'chatgpt') scheduleChatgptOverlayUpdate();
    } catch {
      return false;
    }
    return true;
  }

  function removeFloatingButtonsIfAny() {
    document.getElementById('o4-translate-button')?.remove();
    document.getElementById('o4-mini-button')?.remove();
    document.getElementById('o4-think-button')?.remove();
  }

  function boot() {
    // Avoid touching React-managed DOM before hydration completes (can cause recoverable hydration errors
    // and a “flash / remount” that wipes pasted drafts). Keyboard shortcuts remain active immediately.
    if (document.readyState === 'loading') return;
    if (!document.body) return;
    // Remove legacy floating UI immediately (some older versions injected fixed right-side buttons).
    removeFloatingButtonsIfAny();
    if (SITE !== 'chatgpt') {
      try {
        if (document.getElementById('o4-inline-btn-wrap')) return;
      } catch {}
    }
    const inlineOk = addInlineButtons();
    if (inlineOk) {
      return;
    }
    if (!ENABLE_FLOATING_FALLBACK) {
      return;
    }
    addTranslateButton();
    addQuickSearchButton();
    addThinkButton();
  }

  setupKeyboardShortcuts();

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // Reduce constant polling: schedule boot on DOM changes with rate limiting.
    (function setupBootWatcher() {
      const BOOT_MIN_INTERVAL_MS = SITE === 'chatgpt' ? 120 : 1500;
      const BOOT_FALLBACK_INTERVAL_MS = SITE === 'chatgpt' ? 20000 : 15000;

    let lastBootAt = 0;
    let timer = 0;
    /** @type {MutationObserver|null} */
    let rootMo = null;
    /** @type {MutationObserver|null} */
    let hostMo = null;

    function scheduleBoot(delayMs = 0) {
      if (timer) return;
      const now = Date.now();
      const earliest = lastBootAt + BOOT_MIN_INTERVAL_MS;
      const wait = Math.max(delayMs, earliest - now, 0);
      timer = setTimeout(() => {
        timer = 0;
        boot();
        // Do not "consume" the min-interval before body exists, otherwise we can delay first paint.
        // This keeps the first visible buttons (floating fallback) near-instant on ChatGPT.
        if (document.body) lastBootAt = Date.now();
        // Once inline buttons exist, switch to a narrow observer and drop the global subtree watcher.
        try {
          if (hasInlineButtons()) {
            ensureHostObserver();
            // ChatGPT frequently re-creates the composer; keep the global watcher so we can re-inject instantly.
            if (SITE !== 'chatgpt') disconnectRootObserver();
          }
        } catch {}
      }, wait);
    }

    function hasInlineButtons() {
      try {
        const wrap = document.getElementById('o4-inline-btn-wrap');
        return !!(wrap && wrap.isConnected);
      } catch {
        return false;
      }
    }

    function getInlineHost() {
      try {
        const wrap = document.getElementById('o4-inline-btn-wrap');
        const host = wrap?.parentElement || null;
        return host && host.isConnected ? host : null;
      } catch {
        return null;
      }
    }

      function disconnectRootObserver() {
        if (!rootMo) return;
        try { rootMo.disconnect(); } catch {}
        rootMo = null;
      }

      function findObserveRoot() {
        if (SITE !== 'chatgpt') return document.documentElement;
        try {
          return (
            document.getElementById('thread-bottom') ||
            document.getElementById('thread-bottom-container') ||
            document.body ||
            document.documentElement
          );
        } catch {
          return document.documentElement;
        }
      }

      function ensureRootObserver() {
        try {
          const root = findObserveRoot();
          if (!root || typeof MutationObserver !== 'function') return;
          // If the observed root changes (ChatGPT can re-create the composer subtree),
          // reattach to keep the observer “local” (avoid global subtree watching).
          // @ts-ignore: attach marker
          if (rootMo && rootMo.__aichatRoot === root) return;
          try { rootMo?.disconnect(); } catch {}
          rootMo = new MutationObserver(() => {
            if (hasInlineButtons()) {
              scheduleChatgptOverlayUpdate();
              return;
            }
            scheduleBoot(0);
          });
          // @ts-ignore: attach root marker for cheap reuse checks.
          rootMo.__aichatRoot = root;
          rootMo.observe(root, { childList: true, subtree: true });
        } catch {
          disconnectRootObserver();
        }
      }

    function ensureHostObserver() {
      if (SITE === 'chatgpt') return;
      const host = getInlineHost();
      if (!host || typeof MutationObserver !== 'function') return;
      try {
        if (hostMo && hostMo.__aichatHost === host) return;
      } catch {}
      try { hostMo?.disconnect(); } catch {}

      try {
        hostMo = new MutationObserver(() => {
          if (hasInlineButtons()) return;
          // Inline buttons were removed/re-rendered: re-enable the global watcher briefly and reboot.
          try { hostMo?.disconnect(); } catch {}
          hostMo = null;
          ensureRootObserver();
          scheduleBoot(0);
        });
        // @ts-ignore: attach host marker for cheap reuse checks.
        hostMo.__aichatHost = host;
        hostMo.observe(host, { childList: true, subtree: false });
      } catch {
        try { hostMo?.disconnect(); } catch {}
        hostMo = null;
      }
    }

    scheduleBoot(0);

    try {
      ensureRootObserver();
    } catch {}

    // Fallback: only wake up when inline buttons are missing.
    setInterval(() => {
      try {
        if (hasInlineButtons()) {
          // keep host observer attached (in case the host changes)
          ensureHostObserver();
          scheduleChatgptOverlayUpdate();
          return;
        }
      } catch {}
      ensureRootObserver();
      scheduleBoot(0);
    }, BOOT_FALLBACK_INTERVAL_MS);

    // Keep ChatGPT overlay aligned on scroll/resize.
    if (SITE === 'chatgpt') {
      try {
        window.addEventListener('resize', () => scheduleChatgptOverlayUpdate(), { passive: true });
        window.addEventListener('scroll', () => scheduleChatgptOverlayUpdate(), { passive: true, capture: true });
      } catch {}
    }
  })();
})();
