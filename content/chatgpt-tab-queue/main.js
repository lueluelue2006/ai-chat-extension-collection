(() => {
  'use strict';

  const IS_TEST_ENV = typeof module === 'object' && module && module.exports;
  const HOST = String((typeof location === 'object' && location && location.hostname) || '').toLowerCase();
  if (!IS_TEST_ENV && HOST !== 'chatgpt.com') return;

  const GLOBAL_KEY = '__aichat_chatgpt_tab_queue_v1__';
  const DEBUG_KEY = '__aichat_chatgpt_tab_queue_debug_v1__';
  const BRIDGE_CHANNEL = 'quicknav';
  const BRIDGE_V = 1;
  const BRIDGE_NONCE_DATASET_KEY = 'quicknavBridgeNonceV1';

  const DS_QUEUE_ENABLED = 'aichatTabQueueEnabled';
  const DS_CLEAR_ENABLED = 'aichatTabQueueCtrlCClearEnabled';
  const DS_QUICKNAV_MARK_ENABLED = 'aichatTabQueueQuicknavMarkEnabled';

  const TAB_QUEUE_ATTR = 'data-aichat-tab-queued';
  const TAB_QUEUE_MSG_ID_ATTR = 'data-aichat-tab-queued-msg-id';
  const TAB_QUEUE_KEY_ATTR = 'data-aichat-tab-queued-key';

  const BRIDGE_TAB_QUEUE_MARKS_CHANGED = 'AISHORTCUTS_CHATGPT_TAB_QUEUE_MARKS_CHANGED';
  const BRIDGE_TAB_QUEUE_ACK_HIGHLIGHT = 'AISHORTCUTS_CHATGPT_TAB_QUEUE_ACK_HIGHLIGHT';
  const BRIDGE_TAB_QUEUE_SEND_PROTECT = 'AISHORTCUTS_CHATGPT_TAB_QUEUE_SEND_PROTECT';

  const CONSUMER_KEY = 'chatgpt-tab-queue';
  const STYLE_ID = '__aichat_chatgpt_tab_queue_style_v1__';
  const PREVIEW_ID = '__aichat_chatgpt_tab_queue_preview_v1__';
  const TOAST_WRAP_ID = '__aichat_chatgpt_tab_queue_toast_wrap_v1__';
  const CONFIG = Object.freeze({
    queuePreviewMaxItems: 10,
    queuePreviewTextMaxChars: 112,
    highlightResolveTimeoutMs: 6000,
    sendReadyTimeoutMs: 5000,
    sendConfirmTimeoutMs: 2600,
    sendStrategyConfirmMs: 260,
    previewRepairIntervalMs: 1200,
    previewRepairIdleMs: 2200,
    sendCooldownMs: 80,
    composerSettleMs: 48,
    sendArmDelayMs: 24,
    manualSendWarmupMs: 1600,
    generationStartGraceMs: 900,
    postStopVisualSettleMs: 1200,
    postStopNonGeneratingMs: 900,
    generatingBootstrapMaxAttempts: 40,
    generatingBootstrapStepMs: 600,
    localResponseRetryMs: 700,
    composerInterlockToastCooldownMs: 1200,
    replyRenderPollMs: 180,
    replyRenderSettleMs: 900,
    composerMirrorSyncDelayMs: 24,
    queueDraftTextSettleMs: 140,
    queueDraftTextSettleStepMs: 24,
    composerTextCacheMaxAgeMs: 1600,
    debugTextMaxChars: 160,
    highlightSetMaxEntries: 240,
    pendingHighlightMaxEntries: 32
  });
  const MESSAGES = Object.freeze({
    composerInterlockToast: { zh: '排队消息正在发出，请稍候再输入。', en: 'A queued message is being sent. Wait a moment before typing.' },
    manualSendPaused: { zh: '队列已暂停：上一条手动消息仍在发出。', en: 'Queue paused: the previous manual message is still being sent.' },
    queueSendPaused: { zh: '队列已暂停：上一条排队消息仍在发出。', en: 'Queue paused: the previous queued message is still being sent.' },
    returnToConversationPaused: { zh: '队列已暂停：请回到原对话后继续自动发送。', en: 'Queue paused: return to the original conversation to continue sending automatically.' },
    notInConversationPaused: { zh: '队列已暂停：当前不在原对话里。', en: 'Queue paused: you are no longer in the original conversation.' },
    draftPaused: { zh: '队列已暂停：输入框里有未排队草稿。', en: 'Queue paused: the composer still has an unqueued draft.' },
    attachmentsPaused: { zh: '队列已暂停：输入框里有未排队附件。', en: 'Queue paused: the composer still has unqueued attachments.' },
    responseRunningPaused: { zh: '队列已暂停：当前回复仍在进行中。', en: 'Queue paused: the current reply is still running.' },
    responseSettlingPaused: { zh: '队列已暂停：上一条回复仍在收尾。', en: 'Queue paused: the previous reply is still settling.' },
    queuedCount: { zh: '已排队 {count} 条', en: '{count} queued' },
    queueHint: { zh: 'Tab 排队 · ⌥↑ / Alt+↑ 取回最近一条', en: 'Queue with Tab · restore the latest item with ⌥↑ / Alt+↑' },
    queueStatusSending: { zh: '正在等待当前回复完成后继续发送', en: 'Waiting for the current reply before continuing' },
    restoreLatest: { zh: '取回最新', en: 'Restore latest' },
    restoreLatestAria: { zh: '取回最近一条排队消息到输入框', en: 'Restore the latest queued message to the composer' },
    clearAll: { zh: '清空队列', en: 'Clear queue' },
    clearAllAria: { zh: '删除所有排队消息', en: 'Remove all queued messages' },
    clearedQueue: { zh: '已清空队列。', en: 'Cleared the queue.' },
    forceSend: { zh: '强发', en: 'Send now' },
    forceSendAria: { zh: '强制立即发送这条排队消息', en: 'Force-send this queued message immediately' },
    forceSendBlocked: {
      zh: '当前还不能强制发送：发送按钮尚未就绪或仍在回复中。',
      en: 'Cannot force-send yet: the send button is not ready or a reply is still running.'
    },
    forceSendQueued: {
      zh: '已请求强制发送这条排队消息。',
      en: 'Requested an immediate force-send for this queued item.'
    },
    remove: { zh: '删除', en: 'Remove' },
    removeAria: { zh: '删除这条排队消息', en: 'Remove this queued message' },
    moreQueued: { zh: '还有 {count} 条待发送', en: '{count} more queued item(s) waiting to send' },
    removedQueued: { zh: '已删除第 {index} 条排队消息。', en: 'Removed queued item #{index}.' },
    writeBackFailed: { zh: '排队消息写回输入框失败。', en: 'Failed to restore the queued message into the composer.' },
    missingSendButton: { zh: '排队消息发送失败：未找到可点击的发送按钮。', en: 'Failed to send the queued message: no clickable send button was found.' },
    sendUnconfirmed: { zh: '排队消息未拿到真实发送确认，已保留在队列里。', en: 'The queued message was not confirmed as truly sent, so it stayed in the queue.' },
    restoredLatest: { zh: '已取回最近一条排队消息。', en: 'Restored the latest queued message.' },
    attachmentsNotSupported: { zh: '当前仅支持纯文本排队。检测到附件时不会加入队列。', en: 'Tab queue currently supports text only. Attachments will not be queued.' },
    clearFailed: { zh: '加入队列失败：清空输入框未成功。', en: 'Failed to queue the draft because the composer could not be cleared.' },
    queuedAdded: { zh: '已加入队列：第 {count} 条', en: 'Added to queue: item #{count}' },
    clearedComposer: { zh: '已清空输入框，可用 Cmd+Z 撤销。', en: 'The composer was cleared. Use Cmd+Z to undo.' }
  });

  const prevState = (() => {
    try {
      return globalThis[GLOBAL_KEY] || null;
    } catch {
      return null;
    }
  })();

  try {
    prevState?.dispose?.('reinject');
  } catch {}

  function getBridgeNonce() {
    const fallback = 'quicknav-bridge-fallback';
    try {
      const docEl = document.documentElement;
      if (!docEl) return fallback;
      const existing = String(docEl.dataset?.[BRIDGE_NONCE_DATASET_KEY] || '').trim();
      if (existing) return existing;
      return fallback;
    } catch {
      return fallback;
    }
  }

  const BRIDGE_NONCE = getBridgeNonce();

  function buildBridgeMessage(type, payload = null) {
    try {
      const msg = Object.assign(
        {
          __quicknav: 1,
          channel: BRIDGE_CHANNEL,
          v: BRIDGE_V,
          nonce: BRIDGE_NONCE
        },
        payload && typeof payload === 'object' ? payload : {}
      );
      msg.type = String(type || '');
      if (!msg.type) return null;
      return msg;
    } catch {}
    return null;
  }

  function postBridgeMessage(type, payload = null) {
    try {
      const msg = buildBridgeMessage(type, payload);
      if (!msg) return;
      window.postMessage(msg, '*');
    } catch {}
  }

  function dispatchBridgeMessageSync(type, payload = null) {
    try {
      const msg = buildBridgeMessage(type, payload);
      if (!msg) return false;
      window.dispatchEvent(
        new MessageEvent('message', {
          data: msg,
          origin: location.origin,
          source: window
        })
      );
      return true;
    } catch {}
    return false;
  }

  function postQueuedSendProtectBridge(item, phase, extra = null) {
    try {
      const payload = Object.assign(
        {
          phase: String(phase || ''),
          itemId: item?.id || '',
          conversationId: item?.conversationId || ''
        },
        extra && typeof extra === 'object' ? extra : {}
      );
      dispatchBridgeMessageSync(BRIDGE_TAB_QUEUE_SEND_PROTECT, payload);
      postBridgeMessage(BRIDGE_TAB_QUEUE_SEND_PROTECT, payload);
    } catch {}
  }

  function readBridgeMessage(event, allowedTypes) {
    try {
      if (!event || event.source !== window) return null;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return null;
      if (msg.__quicknav !== 1) return null;
      if (msg.channel !== BRIDGE_CHANNEL) return null;
      if (msg.v !== BRIDGE_V) return null;
      if (msg.nonce !== BRIDGE_NONCE) return null;
      if (typeof msg.type !== 'string' || !msg.type) return null;
      if (allowedTypes && !allowedTypes.has(msg.type)) return null;
      return msg;
    } catch {
      return null;
    }
  }

  function now() {
    return Date.now();
  }

  function getCore() {
    try {
      return window.__aichat_chatgpt_core_main_v1__ || null;
    } catch {
      return null;
    }
  }

  function safeCall(fn, ...args) {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  }

  function getUiLocale() {
    try {
      return String(document.documentElement?.dataset?.aichatLocale || 'en').trim() || 'en';
    } catch {
      return 'en';
    }
  }

  function isChineseLocale(locale = getUiLocale()) {
    return /^zh/i.test(String(locale || ''));
  }

  function formatTemplate(template, vars) {
    let out = String(template || '');
    if (!vars || typeof vars !== 'object') return out;
    for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value ?? ''));
    return out;
  }

  function t(key, vars) {
    const entry = MESSAGES[key];
    if (!entry) return formatTemplate(String(key || ''), vars);
    return formatTemplate(isChineseLocale() ? entry.zh : entry.en, vars);
  }

  function readBoolDataset(key, fallback = false) {
    try {
      const value = document.documentElement?.dataset?.[String(key || '')];
      if (value === '1' || value === 'true') return true;
      if (value === '0' || value === 'false') return false;
    } catch {}
    return fallback;
  }

  function readSettings() {
    return {
      queueEnabled: readBoolDataset(DS_QUEUE_ENABLED, true),
      clearEnabled: readBoolDataset(DS_CLEAR_ENABLED, true),
      quicknavMarkEnabled: readBoolDataset(DS_QUICKNAV_MARK_ENABLED, true)
    };
  }

  function normalizePreviewText(input) {
    const text = String(input || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    if (text.length <= CONFIG.queuePreviewTextMaxChars) return text;
    return `${text.slice(0, CONFIG.queuePreviewTextMaxChars - 1)}…`;
  }

  function hasText(value) {
    return String(value || '').trim().length > 0;
  }

  function clampToCharBoundary(text, index) {
    const source = String(text || '');
    let next = Math.max(0, Math.min(source.length, Number(index) || 0));
    while (next > 0 && (source.charCodeAt(next) & 0xfc00) === 0xdc00) next -= 1;
    return next;
  }

  function getEditorEl() {
    const core = getCore();
    return core && typeof core.getEditorEl === 'function' ? core.getEditorEl() : null;
  }

  function getComposerForm(editorEl = null) {
    const core = getCore();
    if (core && typeof core.getComposerForm === 'function') return core.getComposerForm(editorEl || getEditorEl());
    return editorEl?.closest?.('form') || null;
  }

  function getComposerMirrorTextarea(editorEl = null) {
    const form = getComposerForm(editorEl || getEditorEl());
    try {
      const inForm = form?.querySelector?.('textarea[name="prompt-textarea"]');
      if (inForm) return inForm;
    } catch {}
    try {
      return document.querySelector('textarea[name="prompt-textarea"]');
    } catch {
      return null;
    }
  }

  function getRoute() {
    const core = getCore();
    if (core && typeof core.getRoute === 'function') {
      const route = safeCall(core.getRoute);
      if (route && typeof route === 'object') return route;
    }
    return {
      href: String(location?.href || ''),
      conversationId: '',
      isConversation: false
    };
  }

  function getConversationBindingId() {
    const route = getRoute();
    const conversationId = String(route?.conversationId || '').trim();
    return conversationId || '';
  }

  function getTurnArticles() {
    const core = getCore();
    if (!core || typeof core.getTurnsRoot !== 'function' || typeof core.getTurnArticles !== 'function') return [];
    const root = core.getTurnsRoot();
    const turns = core.getTurnArticles(root);
    return Array.isArray(turns) ? turns : [];
  }

  function getTurnRole(turnEl) {
    const core = getCore();
    if (core && typeof core.getTurnRole === 'function') return String(core.getTurnRole(turnEl) || '').trim();
    return '';
  }

  function getTurnMessageId(turnEl) {
    const core = getCore();
    if (core && typeof core.getMessageId === 'function') return String(core.getMessageId(turnEl) || '').trim();
    return '';
  }

  function getTurnKey(turnEl) {
    try {
      return (
        String(turnEl?.getAttribute?.('data-message-id') || '').trim() ||
        String(turnEl?.getAttribute?.('data-testid') || '').trim() ||
        String(turnEl?.id || '').trim()
      );
    } catch {
      return '';
    }
  }

  function collectUserTurns() {
    const out = [];
    for (const turn of getTurnArticles()) {
      if (!turn) continue;
      if (getTurnRole(turn) !== 'user') continue;
      out.push({
        turn,
        key: getTurnKey(turn),
        msgId: getTurnMessageId(turn)
      });
    }
    return out;
  }

  function collectAssistantTurns() {
    const out = [];
    for (const turn of getTurnArticles()) {
      if (!turn) continue;
      if (getTurnRole(turn) !== 'assistant') continue;
      out.push(turn);
    }
    return out;
  }

  function getLatestAssistantTurn() {
    const turns = collectAssistantTurns();
    return turns.length ? turns[turns.length - 1] : null;
  }

  function buildAssistantRenderSignature(turnEl) {
    if (!turnEl) return '';
    const key = getTurnMessageId(turnEl) || getTurnKey(turnEl);
    let text = '';
    try {
      text = String(turnEl.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {}
    const tail = text.length > 160 ? text.slice(-160) : text;
    return `${key}|${text.length}|${tail}`;
  }

  function getUserTurnSnapshot() {
    const turns = collectUserTurns();
    const last = turns.length ? turns[turns.length - 1] : null;
    return {
      count: turns.length,
      lastKey: String(last?.key || ''),
      lastMsgId: String(last?.msgId || '')
    };
  }

  function isTextareaLike(el) {
    if (!el || typeof el !== 'object') return false;
    try {
      if (typeof HTMLTextAreaElement === 'function' && el instanceof HTMLTextAreaElement) return true;
    } catch {}
    try {
      return String(el.tagName || '').toUpperCase() === 'TEXTAREA';
    } catch {
      return false;
    }
  }

  function readComposerMirrorText(editorEl = null) {
    const mirror = getComposerMirrorTextarea(editorEl || getEditorEl());
    if (!mirror || mirror === editorEl) return '';
    try {
      return String(mirror.value || '').replace(/\r/g, '');
    } catch {
      return '';
    }
  }

  function pickBestComposerReadVariant(primaryText, mirrorText) {
    const primary = String(primaryText || '').replace(/\r/g, '');
    const mirror = String(mirrorText || '').replace(/\r/g, '');
    if (!hasText(primary)) return primary;
    if (!hasText(mirror)) return primary;
    if (primary === mirror) return primary;
    if (mirror.length > primary.length && mirror.includes(primary)) return mirror;
    if (primary.length > mirror.length && primary.includes(mirror)) return primary;
    return primary;
  }

  function readContentEditableText(el) {
    try {
      if (!el) return '';
      const text = typeof el.innerText === 'string' ? String(el.innerText || '') : '';
      const textContent = typeof el.textContent === 'string' ? String(el.textContent || '') : '';
      const placeholderEl = el.querySelector?.('.placeholder.ProseMirror-widget, .placeholder');
      const placeholderText = placeholderEl ? String(placeholderEl.textContent || '').trim() : '';
      const normalized = pickBestComposerReadVariant(text, textContent);
      if (placeholderText && normalized.trim() === placeholderText) return '';
      return normalized;
    } catch {
      return '';
    }
  }

  function readComposerText(editorEl = null) {
    const editor = editorEl || getEditorEl();
    if (!editor) return '';
    if (isTextareaLike(editor)) {
      try {
        return String(editor.value || '');
      } catch {
        return '';
      }
    }
    try {
      if (editor.isContentEditable) {
        return pickBestComposerReadVariant(readContentEditableText(editor), readComposerMirrorText(editor));
      }
    } catch {}
    return '';
  }

  function readComposerTextForInputCache(editorEl = null) {
    const editor = editorEl || null;
    if (!editor) return '';
    if (isTextareaLike(editor)) {
      try {
        return String(editor.value || '').replace(/\r/g, '');
      } catch {
        return '';
      }
    }
    try {
      if (!editor.isContentEditable) return '';
      const text = typeof editor.textContent === 'string' ? String(editor.textContent || '').replace(/\r/g, '') : '';
      if (!text.trim()) return '';
      const placeholderEl = editor.querySelector?.('.placeholder.ProseMirror-widget, .placeholder');
      const placeholderText = placeholderEl ? String(placeholderEl.textContent || '').trim() : '';
      if (placeholderText && text.trim() === placeholderText) return '';
      return text;
    } catch {
      return '';
    }
  }

  function resolveComposerEditorFromTarget(eventTarget) {
    const target = eventTarget && typeof eventTarget === 'object' ? eventTarget : null;
    if (!target) return null;
    try {
      if (isTextareaLike(target)) return target;
    } catch {}
    try {
      if (target.isContentEditable) return target;
    } catch {}
    try {
      const editor = target.closest?.('[contenteditable="true"], textarea[name="prompt-textarea"], textarea');
      return editor || null;
    } catch {
      return null;
    }
  }

  function areComposerEditorsRelated(editorA = null, editorB = null) {
    if (!editorA || !editorB) return false;
    if (editorA === editorB) return true;
    try {
      if (getComposerMirrorTextarea(editorA) === editorB || getComposerMirrorTextarea(editorB) === editorA) return true;
    } catch {}
    try {
      const formA = getComposerForm(editorA);
      const formB = getComposerForm(editorB);
      if (formA && formB && formA === formB) return true;
    } catch {}
    return false;
  }

  function updateComposerTextCache(editorEl = null, text = '') {
    const editor = editorEl || getEditorEl();
    state.composerTextCache = {
      text: String(text || '').replace(/\r/g, ''),
      editor: editor || null,
      updatedAt: now()
    };
    armComposerTextCacheExpiry();
  }

  function clearComposerTextCache() {
    try {
      if (state.composerTextCacheClearTimer) clearTimeout(state.composerTextCacheClearTimer);
    } catch {}
    state.composerTextCacheClearTimer = 0;
    state.composerTextCache = {
      text: '',
      editor: null,
      updatedAt: 0
    };
  }

  function armComposerTextCacheExpiry() {
    try {
      if (state.composerTextCacheClearTimer) clearTimeout(state.composerTextCacheClearTimer);
    } catch {}
    const delay = Math.max(250, Number(CONFIG.composerTextCacheMaxAgeMs || 0) + 120);
    state.composerTextCacheClearTimer = setTimeout(() => {
      state.composerTextCacheClearTimer = 0;
      clearComposerTextCache();
    }, delay);
  }

  function readCachedComposerText(editorEl = null, options = {}) {
    const cache = state.composerTextCache || null;
    if (!cache || !cache.updatedAt) return '';
    if (now() - Number(cache.updatedAt || 0) > CONFIG.composerTextCacheMaxAgeMs) {
      clearComposerTextCache();
      return '';
    }
    const editor = editorEl || null;
    if (cache.editor && cache.editor.isConnected === false) {
      clearComposerTextCache();
      return '';
    }
    if (editor && cache.editor && !areComposerEditorsRelated(editor, cache.editor)) return '';
    const text = String(cache.text || '');
    const baseText = String(options.baseText || '');
    if (hasText(baseText) && !areComposerTextVersionsCompatible(baseText, text)) return '';
    return text;
  }

  function resolveQueueDraftText(options = {}) {
    const sourceEditor = resolveComposerEditorFromTarget(options.sourceEditor || null);
    const editor = options.editor || getEditorEl();
    const sourceText = String(options.sourceText || '');
    const liveText = String(options.liveText || '');
    const baseText = pickBestComposerText([sourceText, liveText]);
    const cachedText = pickBestComposerText(
      [
        readCachedComposerText(sourceEditor, { baseText }),
        readCachedComposerText(editor, { baseText })
      ],
      baseText
    );
    return pickBestComposerText([sourceText, liveText, cachedText], baseText || cachedText);
  }

  function areComposerTextVersionsCompatible(baseText, nextText) {
    const base = String(baseText || '');
    const next = String(nextText || '');
    if (!hasText(base)) return hasText(next);
    if (!hasText(next)) return false;
    return next === base || next.startsWith(base) || base.startsWith(next);
  }

  function pickBestComposerText(values = [], baseText = '') {
    let best = '';
    for (const value of values) {
      const text = String(value || '');
      if (!hasText(text)) continue;
      if (hasText(baseText) && !areComposerTextVersionsCompatible(baseText, text)) continue;
      if (text.length > best.length) best = text;
    }
    return best;
  }

  async function readSettledQueueDraftText(options = {}) {
    const sourceEditor = options.sourceEditor || null;
    const editor = options.editor || getEditorEl();
    const startedAt = now();
    const baseText = resolveQueueDraftText(options);
    let best = pickBestComposerText(
      [
        options.sourceText,
        options.liveText,
        readCachedComposerText(sourceEditor, { baseText }),
        readCachedComposerText(editor, { baseText }),
        readComposerText(sourceEditor),
        readComposerText(editor)
      ],
      baseText
    );
    let lastObserved = best;
    let stableSince = now();

    while (now() - startedAt < CONFIG.queueDraftTextSettleMs) {
      await sleep(CONFIG.queueDraftTextSettleStepMs);
      const next = pickBestComposerText(
        [
          readCachedComposerText(sourceEditor, { baseText: best || baseText }),
          readCachedComposerText(editor, { baseText: best || baseText }),
          readComposerText(sourceEditor),
          readComposerText(editor),
          best
        ],
        best || baseText
      );
      if (next.length > best.length) best = next;
      if (next === lastObserved) {
        if (now() - stableSince >= CONFIG.queueDraftTextSettleStepMs * 2) break;
      } else {
        lastObserved = next;
        stableSince = now();
      }
    }

    return best;
  }

  function collectConnectedComposerTexts(options = {}) {
    const editors = [options.primaryEditor, options.liveEditor, options.sourceEditor];
    const seen = new Set();
    const texts = [];
    for (const candidate of editors) {
      const editor = candidate && typeof candidate === 'object' ? candidate : null;
      if (!editor || seen.has(editor)) continue;
      seen.add(editor);
      if (editor.isConnected === false) continue;
      const text = String(readComposerText(editor) || '');
      texts.push(text);
    }
    return texts;
  }

  function canPreserveQueuedDraftOnClearFailure(options = {}) {
    const sourceText = String(options.sourceText || '');
    const queuedText = String(options.queuedText || '');
    if (!hasText(sourceText) || !hasText(queuedText)) return false;
    const connectedComposerTexts = Array.isArray(options.connectedComposerTexts)
      ? options.connectedComposerTexts.map((value) => String(value || ''))
      : [String(options.currentComposerText || '')];
    if (connectedComposerTexts.length > 0) {
      return connectedComposerTexts.every((value) => value !== queuedText);
    }
    return options.sourceDisconnected === true;
  }

  function focusEditor(editorEl = null) {
    const editor = editorEl || getEditorEl();
    if (!editor) return null;
    try {
      editor.focus({ preventScroll: true });
    } catch {
      try {
        editor.focus();
      } catch {}
    }
    return editor;
  }

  function dispatchInputEvent(editor, options = {}) {
    const inputType = String(options.inputType || 'insertText');
    const data = options.data === undefined ? null : options.data;
    try {
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }));
      return;
    } catch {}
    try {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {}
  }

  function setNativeInputValue(inputEl, next) {
    if (!inputEl) return false;
    const value = String(next || '');
    const ownDesc = Object.getOwnPropertyDescriptor(inputEl, 'value');
    if (ownDesc && typeof ownDesc.set === 'function') {
      try {
        ownDesc.set.call(inputEl, value);
        return true;
      } catch {}
    }

    let proto = Object.getPrototypeOf(inputEl);
    while (proto) {
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && typeof desc.set === 'function') {
        try {
          desc.set.call(inputEl, value);
          return true;
        } catch {
          break;
        }
      }
      proto = Object.getPrototypeOf(proto);
    }

    try {
      inputEl.value = value;
      return true;
    } catch {
      return false;
    }
  }

  function syncComposerMirrorValue(text, editorEl = null) {
    const mirror = getComposerMirrorTextarea(editorEl || getEditorEl());
    if (!mirror || mirror === editorEl) return true;
    const next = String(text || '');
    let prev = '';
    try {
      prev = String(mirror.value || '');
    } catch {}
    if (!setNativeInputValue(mirror, next)) return false;
    try {
      mirror._valueTracker?.setValue?.(prev);
    } catch {}
    dispatchInputEvent(mirror, {
      inputType: next ? 'insertText' : 'deleteContentBackward',
      data: next || null
    });
    return true;
  }

  function runProgrammaticComposerMutation(fn) {
    state.programmaticComposerDepth += 1;
    try {
      return fn();
    } finally {
      state.programmaticComposerDepth = Math.max(0, Number(state.programmaticComposerDepth || 0) - 1);
    }
  }

  function isProgrammaticComposerMutationActive() {
    return Number(state.programmaticComposerDepth || 0) > 0;
  }

  function isComposerSyncedTo(text, editorEl = null) {
    const editor = editorEl || getEditorEl();
    const next = String(text || '');
    if (readComposerText(editor) !== next) return false;
    const mirror = getComposerMirrorTextarea(editor);
    if (!mirror || mirror === editor) return true;
    try {
      return String(mirror.value || '') === next;
    } catch {
      return false;
    }
  }

  function selectAllEditorContent(editor) {
    if (!editor) return false;
    if (isTextareaLike(editor)) {
      try {
        editor.focus({ preventScroll: true });
      } catch {}
      try {
        if (typeof editor.select === 'function') {
          editor.select();
          return true;
        }
      } catch {}
      try {
        const value = String(editor.value || '');
        if (typeof editor.setSelectionRange === 'function') {
          editor.setSelectionRange(0, value.length);
          return true;
        }
      } catch {}
      return false;
    }

    try {
      if (!editor.isContentEditable) return false;
      const selection = window.getSelection?.();
      if (!selection) return false;
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch {
      return false;
    }
  }

  function setComposerText(text, editorEl = null) {
    return runProgrammaticComposerMutation(() => {
      const editor = focusEditor(editorEl);
      if (!editor) return false;
      const next = String(text || '');
      const inputType = next ? 'insertText' : 'deleteContentBackward';

      let editorSynced = false;
      try {
        if (selectAllEditorContent(editor) && typeof document.execCommand === 'function') {
          const ok = document.execCommand('insertText', false, next);
          if (ok) {
            dispatchInputEvent(editor, { inputType, data: next || null });
            editorSynced = true;
          }
        }
      } catch {}

      if (!editorSynced && isTextareaLike(editor)) {
        try {
          editor.value = next;
          dispatchInputEvent(editor, { inputType, data: next || null });
          editorSynced = true;
        } catch {}
      }

      if (!editorSynced) {
        try {
          if (editor.isContentEditable) {
            editor.textContent = next;
            dispatchInputEvent(editor, { inputType, data: next || null });
            editorSynced = true;
          }
        } catch {}
      }

      if (!editorSynced) return false;
      if (!syncComposerMirrorValue(next, editor)) {
        try {
          console.warn('[AI Shortcuts][TabQueue] failed to sync composer mirror textarea');
        } catch {}
        return false;
      }
      updateComposerTextCache(editor, next);
      try {
        if (editor.isContentEditable) {
          const selection = window.getSelection?.();
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      } catch {}
      try {
        editor.blur?.();
        editor.focus?.({ preventScroll: true });
      } catch {
        try {
          editor.focus?.();
        } catch {}
      }
      return true;
    });
  }

  function syncComposerMirrorFromVisibleEditor(editorEl = null) {
    const editor = editorEl || getEditorEl();
    if (!editor || isTextareaLike(editor)) return false;
    const mirror = getComposerMirrorTextarea(editor);
    if (!mirror || mirror === editor) return false;
    const visibleText = readComposerText(editor);
    let mirrorText = '';
    try {
      mirrorText = String(mirror.value || '');
    } catch {}
    if (visibleText === mirrorText) return false;
    return runProgrammaticComposerMutation(() => syncComposerMirrorValue(visibleText, editor));
  }

  function waitUntil(condFn, timeoutMs = 1000, intervalMs = 24) {
    return new Promise((resolve, reject) => {
      const startedAt = now();
      const poll = () => {
        let result = null;
        try {
          result = condFn();
        } catch (error) {
          reject(error);
          return;
        }
        if (result) {
          resolve(result);
          return;
        }
        if (now() - startedAt >= timeoutMs) {
          reject(new Error('timeout'));
          return;
        }
        setTimeout(poll, intervalMs);
      };
      poll();
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function normalizeConversationStreamStatus(value) {
    return String(value || '').trim().toUpperCase();
  }

  function isConversationStreamActiveStatus(status) {
    return normalizeConversationStreamStatus(status) === 'IS_STREAMING';
  }

  function isSteerTurnUrl(url) {
    if (!url) return false;
    return /\/backend-api\/f\/steer_turn(?:\?|$)/.test(String(url));
  }

  function isConversationRequestUrl(url) {
    if (!url) return false;
    return /\/backend-api\/f\/conversation(?:\?|$)/.test(String(url));
  }

  function didQueuedSendStart(beforeSnapshot, afterSnapshot, options = {}) {
    void beforeSnapshot;
    void afterSnapshot;
    const activeRequestCount = Math.max(0, Number(options.activeRequestCount) || 0);
    if (activeRequestCount > 0) return true;

    const conversationStartSeqDelta = Math.max(0, Number(options.conversationStartSeqDelta) || 0);
    if (conversationStartSeqDelta > 0) return true;

    const steerTurnStartSeqDelta = Math.max(0, Number(options.steerTurnStartSeqDelta) || 0);
    if (steerTurnStartSeqDelta > 0) return true;

    return false;
  }

  function shouldPauseQueueForComposerDraft(options = {}) {
    const composerText = String(options.composerText || '').trim();
    if (!composerText) return false;
    const headText = String(options.headText || '').trim();
    return composerText !== headText;
  }

  function getReplyRenderSettleWaitMs(options = {}) {
    if (options.hasAssistantTurn !== true) return 0;
    const requiredSettleMs = Math.max(0, Number(options.requiredSettleMs) || 0);
    if (requiredSettleMs <= 0) return 0;
    const replyChangeAgeMs = Math.max(0, Number(options.replyChangeAgeMs) || 0);
    return Math.max(0, requiredSettleMs - replyChangeAgeMs);
  }

  function isComposerMutationInputType(inputType) {
    const normalized = String(inputType || '').trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith('insert')) return true;
    if (normalized.startsWith('delete')) return true;
    if (normalized.startsWith('history')) return true;
    if (normalized === 'formatbackcolor' || normalized === 'formatbold' || normalized === 'formatitalic') return true;
    return false;
  }

  function shouldBlockComposerBeforeInput(options = {}) {
    if (options.interlockActive !== true) return false;
    if (options.isEditableTarget !== true) return false;
    return isComposerMutationInputType(options.inputType);
  }

  function shouldBlockComposerKeydownDuringInterlock(options = {}) {
    if (options.interlockActive !== true) return false;
    if (options.isEditableTarget !== true) return false;
    if (hasText(options.hotkeyAction || '')) return true;

    const key = String(options.key || '');
    const code = String(options.code || '');
    if (key === 'Tab' || code === 'Tab') return true;
    if (key === 'Enter' || code === 'Enter' || code === 'NumpadEnter') return true;
    return false;
  }

  function shouldUseFullComposerInputPath(options = {}) {
    if ((Number(options.queueLength) || 0) > 0) return true;
    if (options.processQueueBusy === true) return true;
    if (options.hasPendingSendGate === true) return true;
    if ((Number(options.activeRequestCount) || 0) > 0) return true;
    if (options.awaitingConversationStart === true) return true;
    if (options.composerInterlockActive === true) return true;
    if (options.restoredQueuedDraftActive === true) return true;
    if (options.manualSendInterlockActive === true) return true;
    if (options.manualSendWarmupActive === true) return true;
    if (options.previewRepairActive === true && (Number(options.queueLength) || 0) > 0) return true;
    if (options.replyRenderTimerActive === true) return true;
    return false;
  }

  function shouldUseFullComposerInputPathForState() {
    return shouldUseFullComposerInputPath({
      queueLength: state.queue.length,
      processQueueBusy: state.processQueueBusy,
      hasPendingSendGate: !!state.pendingSendGate,
      activeRequestCount: state.activeRequests.size,
      awaitingConversationStart: state.awaitingConversationStart,
      composerInterlockActive: !!state.composerInterlock,
      restoredQueuedDraftActive: !!state.restoredQueuedDraft,
      manualSendInterlockActive: !!state.manualSendInterlock,
      manualSendWarmupActive: Number(state.manualSendWarmupUntil || 0) > now(),
      previewRepairActive: !!state.previewRepairTimer,
      replyRenderTimerActive: !!state.replyRender.timer
    });
  }

  function findSendButton(editorEl = null) {
    const core = getCore();
    if (core && typeof core.findSendButton === 'function') return core.findSendButton(editorEl || getEditorEl());
    return null;
  }

  function clickSendButton(editorEl = null) {
    const core = getCore();
    if (core && typeof core.clickSendButton === 'function') return !!core.clickSendButton(editorEl || getEditorEl());
    return false;
  }

  function isDisabledButton(btn) {
    if (!btn) return true;
    try {
      if (typeof HTMLButtonElement === 'function' && btn instanceof HTMLButtonElement) return !!btn.disabled;
    } catch {}
    try {
      const aria = String(btn.getAttribute?.('aria-disabled') || '').trim();
      if (aria && aria !== 'false') return true;
    } catch {}
    return false;
  }

  function dispatchMouseClickSequence(btn) {
    try {
      if (!(btn instanceof HTMLElement)) return false;
      btn.focus?.({ preventScroll: true });
      const rect = btn.getBoundingClientRect();
      const clientX = Math.max(0, rect.left + rect.width / 2);
      const clientY = Math.max(0, rect.top + rect.height / 2);
      const events = [
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX, clientY }),
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY }),
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX, clientY }),
        new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY })
      ];
      for (const event of events) btn.dispatchEvent(event);
      btn.click();
      return true;
    } catch {}
    return false;
  }

  function invokeReactClick(btn) {
    try {
      if (!(btn instanceof HTMLElement)) return false;
      const propKey = Object.keys(btn).find((key) => key.startsWith('__reactProps$'));
      const handler = propKey ? btn[propKey]?.onClick : null;
      if (typeof handler !== 'function') return false;
      const nativeEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      handler({
        type: 'click',
        target: btn,
        currentTarget: btn,
        nativeEvent,
        preventDefault() {},
        stopPropagation() {},
        isDefaultPrevented() {
          return false;
        },
        isPropagationStopped() {
          return false;
        },
        persist() {}
      });
      return true;
    } catch {}
    return false;
  }

  function clickSendButtonRobust(editorEl = null, buttonEl = null, strategy = 'core_click') {
    const button = buttonEl || findSendButton(editorEl);
    if (!button || isDisabledButton(button)) return false;
    if (strategy === 'core_click') return clickSendButton(editorEl) || dispatchMouseClickSequence(button);
    if (strategy === 'pointer_click') return dispatchMouseClickSequence(button);
    if (strategy === 'react_click') return invokeReactClick(button);
    return false;
  }

  function isReadySendButton(buttonEl = null, editorEl = null) {
    const button = buttonEl || findSendButton(editorEl);
    if (!button || isDisabledButton(button)) return false;
    try {
      const testId = String(button.getAttribute?.('data-testid') || '').trim();
      if (testId && /stop/i.test(testId)) return false;
    } catch {}
    try {
      const aria = String(button.getAttribute?.('aria-label') || '').trim();
      if (aria && /stop/i.test(aria)) return false;
    } catch {}
    return true;
  }

  function normalizeUiStatusText(input) {
    return String(input || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isThinkingIndicatorText(text) {
    const normalized = normalizeUiStatusText(text);
    if (!normalized) return false;
    if (/(thought for|reasoned for|已思考|已推理)/i.test(normalized)) return false;
    return /(^thinking$|pro thinking|still thinking|generating a response|正在思考|仍在思考|还在思考|正在生成|仍在生成|还在生成|思考中|推理中)/i.test(
      normalized
    );
  }

  function isGeneratingLiveAnnouncementText(text) {
    const normalized = normalizeUiStatusText(text);
    if (!normalized) return false;
    return /(still generating|still thinking|generating a response|正在生成|仍在生成|还在生成|正在思考|仍在思考|还在思考)/i.test(
      normalized
    );
  }

  function shouldTreatAssistantThinkingAsGenerating(options = {}) {
    if (options.hasCopyAction === true) return false;
    return options.hasThinkingIndicator === true;
  }

  function hasGeneratingLiveAnnouncement() {
    try {
      const liveNodes = Array.from(document.querySelectorAll('[aria-live]'));
      return liveNodes.some((node) => isGeneratingLiveAnnouncementText(node?.innerText || node?.textContent || ''));
    } catch {
      return false;
    }
  }

  function getElementLabelText(el) {
    if (!el || typeof el !== 'object') return '';
    try {
      const aria = String(el.getAttribute?.('aria-label') || '').trim();
      if (aria) return aria;
    } catch {}
    try {
      const text = String(el.innerText || el.textContent || '').trim();
      if (text) return text;
    } catch {}
    return '';
  }

  function hasActiveAssistantThinkingTurn() {
    const latestAssistantTurn = getLatestAssistantTurn();
    if (!latestAssistantTurn) return false;
    try {
      const buttons = Array.from(latestAssistantTurn.querySelectorAll('button'));
      const labels = buttons.map((button) => getElementLabelText(button));
      const hasCopyAction = labels.some((label) => /(copy|复制)/i.test(label));
      const hasThinkingIndicator = labels.some((label) => isThinkingIndicatorText(label));
      return shouldTreatAssistantThinkingAsGenerating({
        hasCopyAction,
        hasThinkingIndicator,
        sendButtonReady: isReadySendButton(null, getEditorEl())
      });
    } catch {
      return false;
    }
  }

  function isGeneratingNow() {
    try {
      const core = getCore();
      if (core && typeof core.isGenerating === 'function' && core.isGenerating(getEditorEl())) return true;
    } catch {}
    try {
      if (document.querySelector('button[data-testid="stop-button"]')) return true;
    } catch {}
    if (hasGeneratingLiveAnnouncement()) return true;
    if (hasActiveAssistantThinkingTurn()) return true;
    return false;
  }

  function isEditableInComposer(eventTarget) {
    const editor = getEditorEl();
    const form = getComposerForm(editor);
    if (!editor || !form) return false;
    const target = eventTarget && typeof eventTarget === 'object' ? eventTarget : document.activeElement;
    if (!target || typeof target !== 'object') return false;
    try {
      if (target === editor || editor.contains?.(target)) return true;
    } catch {}
    try {
      return !!target.closest?.('form') && target.closest('form') === form;
    } catch {
      return false;
    }
  }

  function hasLikelyComposerAttachments(form = null) {
    const root = form || getComposerForm(getEditorEl());
    if (!root || typeof root.querySelector !== 'function') return false;
    const selectors = [
      'button[aria-label*="Remove file" i]',
      'button[aria-label*="Remove image" i]',
      '[data-testid*="attachment" i]',
      '[data-testid*="composer-file" i]',
      '[data-testid*="composer-image" i]',
      '[data-testid*="upload" i] img',
      '[class*="attachment" i] img',
      '[class*="upload" i] img'
    ];
    try {
      return selectors.some((selector) => !!root.querySelector(selector));
    } catch {
      return false;
    }
  }

  function getComposerBlockingState(options = {}) {
    return {
      hasDraft: shouldPauseQueueForComposerDraft({
        composerText: String(options.composerText || ''),
        headText: String(options.headText || '')
      }),
      hasAttachments: options.hasAttachments === true
    };
  }

  const state = {
    queue: [],
    queueSeq: 0,
    activeRequests: new Map(),
    steerTurnStartSeq: 0,
    pendingHighlightCandidates: [],
    highlightedMsgIds: new Set(),
    highlightedKeys: new Set(),
    awaitingConversationStart: false,
    awaitingConversationStartTimer: 0,
    processQueueBusy: false,
    processQueueTimer: 0,
    sendGateTimer: 0,
    pendingSendGate: null,
    manualSendInterlock: null,
    manualSendInterlockTimer: 0,
    manualSendWarmupUntil: 0,
    manualSendWarmupTimer: 0,
    composerInterlock: null,
    restoredQueuedDraft: null,
    programmaticComposerDepth: 0,
    composerMirrorSyncTimer: 0,
    composerTextCache: {
      text: '',
      editor: null,
      updatedAt: 0
    },
    composerTextCacheClearTimer: 0,
    lastGenerating: false,
    lastGeneratingChangeAt: now(),
    lastTurnsChangeAt: now(),
    lastQueueActivityAt: now(),
    replyRender: {
      key: '',
      signature: '',
      changedAt: now(),
      timer: 0
    },
    conversationStartSeq: 0,
    streamStatus: {
      conversationId: '',
      value: '',
      checkedAt: 0,
      source: ''
    },
    turnsUnsub: null,
    routeUnsub: null,
    hubUnsub: null,
    previewRepairTimer: 0,
    messageListener: null,
    keydownListener: null,
    pointerdownListener: null,
    clickListener: null,
    submitListener: null,
    beforeInputListener: null,
    inputListener: null,
    disposed: false,
    gen: {
      mo: null,
      root: null,
      bootstrapTimer: 0,
      bootstrapAttempts: 0
    },
    ui: {
      previewEl: null,
      previewHost: null,
      toastWrap: null,
      previewSignature: ''
    },
    debug: {
      lastHotkey: null,
      lastQueueAttempt: null
    }
  };

  function markQueueActivity() {
    state.lastQueueActivityAt = now();
  }

  function setLastHotkeyDebug(payload = null) {
    state.debug.lastHotkey = payload && typeof payload === 'object' ? Object.assign({ at: now() }, payload) : null;
  }

  function compactDebugText(value) {
    const text = String(value || '');
    const max = Math.max(24, Number(CONFIG.debugTextMaxChars) || 160);
    if (text.length <= max) return text;
    return `${text.slice(0, max)}… [${text.length} chars]`;
  }

  function sanitizeDebugPayload(payload = null) {
    if (!payload || typeof payload !== 'object') return null;
    const out = Array.isArray(payload) ? [] : {};
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string' && /text/i.test(String(key || ''))) {
        out[key] = compactDebugText(value);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = sanitizeDebugPayload(value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  function setLastQueueAttemptDebug(payload = null) {
    state.debug.lastQueueAttempt = payload && typeof payload === 'object' ? Object.assign({ at: now() }, sanitizeDebugPayload(payload)) : null;
  }

  function clearComposerMirrorSyncTimer() {
    if (!state.composerMirrorSyncTimer) return;
    try {
      clearTimeout(state.composerMirrorSyncTimer);
    } catch {}
    state.composerMirrorSyncTimer = 0;
  }

  function scheduleComposerMirrorSync(delayMs = CONFIG.composerMirrorSyncDelayMs) {
    clearComposerMirrorSyncTimer();
    state.composerMirrorSyncTimer = setTimeout(() => {
      state.composerMirrorSyncTimer = 0;
      syncComposerMirrorFromVisibleEditor(getEditorEl());
    }, Math.max(0, Number(delayMs) || 0));
  }

  function clearProcessQueueTimer() {
    if (!state.processQueueTimer) return;
    try {
      clearTimeout(state.processQueueTimer);
    } catch {}
    state.processQueueTimer = 0;
  }

  function scheduleMaybeProcessQueue(delayMs = CONFIG.sendCooldownMs) {
    clearProcessQueueTimer();
    state.processQueueTimer = setTimeout(() => {
      state.processQueueTimer = 0;
      void maybeProcessQueue();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function clearSendGateTimer() {
    if (!state.sendGateTimer) return;
    try {
      clearTimeout(state.sendGateTimer);
    } catch {}
    state.sendGateTimer = 0;
  }

  function clearManualSendInterlockTimer() {
    if (!state.manualSendInterlockTimer) return;
    try {
      clearTimeout(state.manualSendInterlockTimer);
    } catch {}
    state.manualSendInterlockTimer = 0;
  }

  function clearManualSendWarmupTimer() {
    if (!state.manualSendWarmupTimer) return;
    try {
      clearTimeout(state.manualSendWarmupTimer);
    } catch {}
    state.manualSendWarmupTimer = 0;
  }

  function clearManualSendWarmup(options = {}) {
    clearManualSendWarmupTimer();
    if (!(Number(state.manualSendWarmupUntil) > 0)) return false;
    state.manualSendWarmupUntil = 0;
    if (options.scheduleQueue !== false) scheduleMaybeProcessQueue(0);
    markQueueActivity();
    refreshPreview();
    return true;
  }

  function armManualSendWarmup(durationMs = CONFIG.manualSendWarmupMs) {
    const waitMs = Math.max(0, Number(durationMs) || 0);
    if (!waitMs) return false;
    clearManualSendWarmup({ scheduleQueue: false });
    state.manualSendWarmupUntil = now() + waitMs;
    clearManualSendWarmupTimer();
    state.manualSendWarmupTimer = setTimeout(() => {
      state.manualSendWarmupTimer = 0;
      clearManualSendWarmup();
    }, waitMs);
    markQueueActivity();
    refreshPreview();
    return true;
  }

  function isManualSendWarmupActive() {
    if (Number(state.manualSendWarmupUntil) <= 0) return false;
    if (now() < Number(state.manualSendWarmupUntil)) return true;
    clearManualSendWarmup();
    return false;
  }

  function clearManualSendInterlock(options = {}) {
    clearManualSendInterlockTimer();
    if (!state.manualSendInterlock) return false;
    state.manualSendInterlock = null;
    if (options.scheduleQueue !== false) scheduleMaybeProcessQueue(0);
    markQueueActivity();
    refreshPreview();
    return true;
  }

  function armManualSendInterlock(options = {}) {
    const composerText = String(options.composerText || '').trim();
    if (!composerText) return false;
    clearManualSendInterlock({ scheduleQueue: false });
    state.manualSendInterlock = {
      armedAt: now(),
      composerText,
      beforeAssistantCount: collectAssistantTurns().length
    };
    clearManualSendInterlockTimer();
    state.manualSendInterlockTimer = setTimeout(() => {
      state.manualSendInterlockTimer = 0;
      clearManualSendInterlock();
    }, 2500);
    markQueueActivity();
    refreshPreview();
    return true;
  }

  function isManualSendInterlockActive() {
    return !!state.manualSendInterlock;
  }

  function shouldArmManualSendInterlock(options = {}) {
    if (options.isProgrammaticMutation === true) return false;
    if (options.composerInterlockActive === true) return false;
    if (options.processQueueBusy === true) return false;
    if (options.sendButtonReady !== true) return false;
    return hasText(options.composerText || '');
  }

  function schedulePendingSendGateCheck(delayMs) {
    clearSendGateTimer();
    state.sendGateTimer = setTimeout(() => {
      state.sendGateTimer = 0;
      void maybeReleasePendingSendGate();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function getPendingSendGateState(gate, options = {}) {
    if (!gate || typeof gate !== 'object') return { status: 'idle', waitMs: 0 };
    const generatingNow = options.generatingNow === true;
    const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : 0;
    const generationStartGraceMs = Math.max(0, Number(options.generationStartGraceMs) || 0);
    const nonGeneratingForMs = Math.max(0, Number(options.nonGeneratingForMs) || 0);
    const requiredNonGeneratingMs = Math.max(0, Number(options.requiredNonGeneratingMs) || 0);
    const beforeAssistantCount = Math.max(0, Number(gate.beforeAssistantCount) || 0);
    const assistantTurnCount = Math.max(0, Number(options.assistantTurnCount) || 0);
    const replyRenderWaitMs = Math.max(0, Number(options.replyRenderWaitMs) || 0);

    if (generatingNow) return { status: 'wait_generating', waitMs: 0 };
    if (assistantTurnCount <= beforeAssistantCount) return { status: 'wait_assistant_turn', waitMs: 0 };
    if (gate.sawGenerating) {
      if (!gate.transportDone) return { status: 'wait_transport_done', waitMs: 0 };
      if (requiredNonGeneratingMs > 0 && nonGeneratingForMs < requiredNonGeneratingMs) {
        return {
          status: 'wait_non_generating_cooldown',
          waitMs: Math.max(0, requiredNonGeneratingMs - nonGeneratingForMs)
        };
      }
      if (replyRenderWaitMs > 0) return { status: 'wait_reply_render_settle', waitMs: replyRenderWaitMs };
      return { status: 'release', waitMs: 0 };
    }
    if (!gate.transportDone) return { status: 'wait_transport_done', waitMs: 0 };

    const sentAt = Number.isFinite(gate.sentAt) ? Number(gate.sentAt) : 0;
    const waitMs = Math.max(0, sentAt + generationStartGraceMs - nowMs);
    if (waitMs > 0) return { status: 'wait_generation_grace', waitMs };
    if (replyRenderWaitMs > 0) return { status: 'wait_reply_render_settle', waitMs: replyRenderWaitMs };
    return { status: 'release', waitMs: 0 };
  }

  function getPendingSendGateRetryDelay(decision, fallbackMs = CONFIG.localResponseRetryMs) {
    const status = String(decision?.status || '').trim();
    const waitMs = Math.max(0, Number(decision?.waitMs) || 0);
    if (!status || status === 'idle' || status === 'release') return 0;
    if (waitMs > 0) return waitMs;
    if (status === 'wait_generating' || status === 'wait_transport_done' || status === 'wait_assistant_turn') {
      return Math.max(0, Number(fallbackMs) || 0);
    }
    return 0;
  }

  function syncReplyRenderState() {
    const latestAssistantTurn = getLatestAssistantTurn();
    const nextKey = latestAssistantTurn ? getTurnMessageId(latestAssistantTurn) || getTurnKey(latestAssistantTurn) : '';
    const nextSignature = latestAssistantTurn ? buildAssistantRenderSignature(latestAssistantTurn) : '';
    if (state.replyRender.key === nextKey && state.replyRender.signature === nextSignature) return false;
    state.replyRender.key = nextKey;
    state.replyRender.signature = nextSignature;
    state.replyRender.changedAt = now();
    state.lastTurnsChangeAt = state.replyRender.changedAt;
    markQueueActivity();
    return true;
  }

  function shouldSampleReplyRender() {
    return !!state.pendingSendGate || state.activeRequests.size > 0 || state.awaitingConversationStart || state.queue.length > 0;
  }

  function clearReplyRenderTimer() {
    if (!state.replyRender.timer) return;
    try {
      clearInterval(state.replyRender.timer);
    } catch {}
    state.replyRender.timer = 0;
  }

  function refreshReplyRenderSampling() {
    syncReplyRenderState();
    if (!shouldSampleReplyRender()) {
      clearReplyRenderTimer();
      return;
    }
    if (state.replyRender.timer) return;
    state.replyRender.timer = setInterval(() => {
      if (state.disposed) return;
      syncReplyRenderState();
      if (state.pendingSendGate && !state.sendGateTimer) void maybeReleasePendingSendGate();
      if (!shouldSampleReplyRender()) clearReplyRenderTimer();
    }, CONFIG.replyRenderPollMs);
  }

  function getLiveReplyRenderWaitMs(settleMs = CONFIG.replyRenderSettleMs) {
    syncReplyRenderState();
    return getReplyRenderSettleWaitMs({
      hasAssistantTurn: hasText(state.replyRender.signature),
      replyChangeAgeMs: Math.max(0, now() - (Number(state.replyRender.changedAt) || 0)),
      requiredSettleMs: settleMs
    });
  }

  function clearPendingSendGate() {
    state.pendingSendGate = null;
    clearSendGateTimer();
    refreshReplyRenderSampling();
    markQueueActivity();
  }

  function armComposerInterlock(item = null) {
    state.composerInterlock = {
      queuedId: String(item?.id || ''),
      queuedText: String(item?.text || ''),
      armedAt: now(),
      noticeShownAt: 0
    };
    markQueueActivity();
  }

  function clearComposerInterlock() {
    state.composerInterlock = null;
    markQueueActivity();
  }

  function isComposerInterlockActive() {
    return !!state.composerInterlock;
  }

  function rememberRestoredQueuedDraft(item = null) {
    if (!item) return false;
    state.restoredQueuedDraft = {
      id: String(item?.id || ''),
      text: String(item?.text || ''),
      conversationId: String(item?.conversationId || ''),
      restoredAt: now(),
      activeResponseAtRestore:
        !!state.pendingSendGate ||
        state.activeRequests.size > 0 ||
        state.awaitingConversationStart ||
        isManualSendInterlockActive() ||
        isManualSendWarmupActive() ||
        isGeneratingNow() ||
        getLiveReplyRenderWaitMs() > 0
    };
    markQueueActivity();
    return true;
  }

  function clearRestoredQueuedDraft() {
    if (!state.restoredQueuedDraft) return false;
    state.restoredQueuedDraft = null;
    markQueueActivity();
    return true;
  }

  function isRestoredQueuedDraftActive() {
    return !!state.restoredQueuedDraft;
  }

  function shouldSuppressImmediateSendForRestoredDraft(options = {}) {
    return options.restoredQueuedDraftActive === true;
  }

  function shouldHoldRestoredDraftInQueuePool(options = {}) {
    if (options.restoredQueuedDraftActive !== true) return false;
    return options.activeResponseAtRestore === true || options.currentActiveResponse === true;
  }

  function buildRestoredDraftQueuePoolHold(restoredDraft = null) {
    if (!restoredDraft) return null;
    if (
      !shouldHoldRestoredDraftInQueuePool({
        restoredQueuedDraftActive: true,
        activeResponseAtRestore: restoredDraft.activeResponseAtRestore === true,
        currentActiveResponse:
          !!state.pendingSendGate ||
          state.activeRequests.size > 0 ||
          state.awaitingConversationStart ||
          isManualSendInterlockActive() ||
          isManualSendWarmupActive() ||
          isGeneratingNow() ||
          getLiveReplyRenderWaitMs() > 0
      })
    ) {
      return null;
    }
    return {
      reason: 'restored_queued_draft',
      restoredFromId: String(restoredDraft.id || ''),
      restoredAt: Number(restoredDraft.restoredAt) || now(),
      armedAt: now()
    };
  }

  function getQueuePoolHoldRetryDelay(item = null) {
    const hold = item?.queuePoolHold || null;
    if (!hold) return 0;
    const holdStart = Number(hold.armedAt || hold.restoredAt || 0) || now();
    const minHoldRemainingMs = Math.max(0, holdStart + CONFIG.postStopVisualSettleMs - now());
    if (minHoldRemainingMs > 0) return minHoldRemainingMs;
    if (
      !!state.pendingSendGate ||
      state.activeRequests.size > 0 ||
      state.awaitingConversationStart ||
      isManualSendInterlockActive() ||
      isManualSendWarmupActive() ||
      isGeneratingNow() ||
      isCachedCurrentConversationStreamActive()
    ) {
      return CONFIG.localResponseRetryMs;
    }
    const replyRenderWaitMs = getLiveReplyRenderWaitMs();
    if (replyRenderWaitMs > 0) return replyRenderWaitMs;
    return 0;
  }

  function isQueuePoolHoldActive(item = null) {
    return getQueuePoolHoldRetryDelay(item) > 0;
  }

  function maybeWarnComposerInterlock() {
    const interlock = state.composerInterlock;
    if (!interlock) return;
    if (now() - (Number(interlock.noticeShownAt) || 0) < CONFIG.composerInterlockToastCooldownMs) return;
    interlock.noticeShownAt = now();
    showToast(t('composerInterlockToast'));
  }

  function clearConversationStreamStatusCache() {
    state.streamStatus.conversationId = '';
    state.streamStatus.value = '';
    state.streamStatus.checkedAt = 0;
    state.streamStatus.source = '';
  }

  function markConversationStreamStatus(conversationId, value, source = '') {
    const id = String(conversationId || '').trim();
    if (!id) return false;
    state.streamStatus.conversationId = id;
    state.streamStatus.value = normalizeConversationStreamStatus(value);
    state.streamStatus.checkedAt = now();
    state.streamStatus.source = String(source || '').trim();
    return true;
  }

  function markCurrentConversationStreamStatus(value, source = '') {
    const conversationId = getConversationBindingId();
    if (!conversationId) return false;
    return markConversationStreamStatus(conversationId, value, source);
  }

  function isCachedCurrentConversationStreamActive(conversationId = getConversationBindingId()) {
    const id = String(conversationId || '').trim();
    if (!id) return false;
    if (state.streamStatus.conversationId !== id) return false;
    return isConversationStreamActiveStatus(state.streamStatus.value);
  }

  function getManualSendInterlockReason() {
    if (!isManualSendInterlockActive() && !isManualSendWarmupActive()) return '';
    return t('manualSendPaused');
  }

  function armPendingSendGate(itemId = '', options = {}) {
    clearPendingSendGate();
    const beforeAssistantCount = Number.isFinite(options.beforeAssistantCount)
      ? Math.max(0, Number(options.beforeAssistantCount) || 0)
      : collectAssistantTurns().length;
    state.pendingSendGate = {
      queuedId: String(itemId || ''),
      sentAt: now(),
      transportDone: false,
      sawGenerating: options.sawGenerating === true || isGeneratingNow(),
      beforeAssistantCount
    };
    refreshReplyRenderSampling();
    markQueueActivity();
  }

  function promoteManualSendInterlockToPendingGate(options = {}) {
    const interlock = state.manualSendInterlock;
    if (!interlock) return false;
    if (!state.pendingSendGate) {
      armPendingSendGate('manual-send', {
        beforeAssistantCount: interlock.beforeAssistantCount,
        sawGenerating: options.sawGenerating === true
      });
    } else if (options.sawGenerating === true) {
      state.pendingSendGate.sawGenerating = true;
      markQueueActivity();
    }
    clearManualSendInterlock({ scheduleQueue: false });
    if (options.transportDone === true && state.pendingSendGate) {
      state.pendingSendGate.transportDone = true;
      void maybeReleasePendingSendGate();
    }
    return true;
  }

  function isLikelyComposerSendButton(buttonEl = null, editorEl = null) {
    const button = buttonEl;
    if (!button || typeof button !== 'object') return false;
    const editor = editorEl || getEditorEl();
    const form = getComposerForm(editor);
    if (form && !form.contains?.(button)) return false;
    if (!isReadySendButton(button, editor)) return false;

    try {
      const canonical = findSendButton(editor);
      if (canonical && button === canonical) return true;
    } catch {}

    const haystack = [
      String(button.getAttribute?.('data-testid') || ''),
      String(button.getAttribute?.('aria-label') || ''),
      String(button.getAttribute?.('title') || ''),
      String(button.textContent || '')
    ]
      .join(' ')
      .trim();
    if (/\bstop\b/i.test(haystack)) return false;
    if (/\b(send|submit)\b/i.test(haystack)) return true;

    try {
      return String(button.getAttribute?.('type') || '').trim().toLowerCase() === 'submit';
    } catch {
      return false;
    }
  }

  // GPT-5.4+ can expose an interactive "quick answer" phase where the transport handoff
  // is done, the stop button is gone, but the conversation stream is still active.
  function canReleasePendingGateOnVisualSettle(options = {}) {
    const settleMs = Math.max(0, Number(options.settleMs) || 0);
    if (options.generatingNow === true) return false;
    if (options.sendButtonReady !== true) return false;
    return Math.max(0, Number(options.idleForMs) || 0) >= settleMs;
  }

  function isPendingGateVisuallySettled(options = {}) {
    return canReleasePendingGateOnVisualSettle({
      generatingNow: isGeneratingNow(),
      sendButtonReady: isReadySendButton(null, getEditorEl()),
      idleForMs: now() - (Number(state.lastTurnsChangeAt) || 0),
      settleMs: Math.max(0, Number(options.settleMs) || CONFIG.postStopVisualSettleMs)
    });
  }

  async function maybeReleasePendingSendGate() {
    clearSendGateTimer();
    const gate = state.pendingSendGate;
    if (!gate) return false;
    refreshReplyRenderSampling();
    const generatingNow = isGeneratingNow();
    if (gate.queuedId === 'manual-send' && !gate.transportDone && !generatingNow) {
      gate.transportDone = true;
    }
    const nonGeneratingForMs = generatingNow ? 0 : Math.max(0, now() - (Number(state.lastGeneratingChangeAt) || 0));
    const replyRenderWaitMs = getLiveReplyRenderWaitMs();

    const decision = getPendingSendGateState(gate, {
      generatingNow,
      nowMs: now(),
      generationStartGraceMs: CONFIG.generationStartGraceMs,
      nonGeneratingForMs,
      requiredNonGeneratingMs: CONFIG.postStopNonGeneratingMs,
      assistantTurnCount: collectAssistantTurns().length,
      replyRenderWaitMs
    });

    const retryDelayMs = getPendingSendGateRetryDelay(decision);
    if (retryDelayMs > 0) {
      schedulePendingSendGateCheck(retryDelayMs);
      return false;
    }
    if (decision.status !== 'release') return false;

    if (isPendingGateVisuallySettled()) {
      gate.streamStatus = 'VISUALLY_SETTLED';
      gate.streamStatusCheckedAt = now();
      clearPendingSendGate();
      scheduleMaybeProcessQueue();
      return true;
    }

    if (isCachedCurrentConversationStreamActive()) {
      gate.streamStatus = 'IS_STREAMING';
      gate.streamStatusCheckedAt = now();
      schedulePendingSendGateCheck(CONFIG.localResponseRetryMs);
      return false;
    }

    gate.streamStatus = normalizeConversationStreamStatus(state.streamStatus.value);
    gate.streamStatusCheckedAt = now();

    clearPendingSendGate();
    scheduleMaybeProcessQueue();
    return true;
  }

  function getComposerFormForGeneratingWatch() {
    try {
      const editor = getEditorEl();
      const form = getComposerForm(editor);
      if (form) return form;
      return editor?.closest?.('form') || null;
    } catch {
      return null;
    }
  }

  function detachGeneratingObserver() {
    try {
      state.gen.mo?.disconnect?.();
    } catch {}
    state.gen.mo = null;
    state.gen.root = null;
    try {
      if (state.gen.bootstrapTimer) clearInterval(state.gen.bootstrapTimer);
    } catch {}
    state.gen.bootstrapTimer = 0;
    state.gen.bootstrapAttempts = 0;
  }

  function checkGeneratingTransition() {
    const generating = isGeneratingNow();
    const prev = !!state.lastGenerating;
    if (prev !== generating) state.lastGeneratingChangeAt = now();
    state.lastGenerating = generating;

    if (generating && isManualSendInterlockActive()) {
      promoteManualSendInterlockToPendingGate({ sawGenerating: true });
    }

    if (state.pendingSendGate && generating) {
      state.pendingSendGate.sawGenerating = true;
    }

    if (state.pendingSendGate && !generating) {
      void maybeReleasePendingSendGate();
    }

    if (prev && !generating) {
      resolvePendingHighlights();
      if (!state.pendingSendGate) scheduleMaybeProcessQueue();
    }
  }

  function handleComposerDomMutation() {
    markQueueActivity();
    refreshPreview();
    if (state.queue.length > 0 && !state.processQueueBusy) scheduleMaybeProcessQueue(0);
  }

  function ensureGeneratingObserver() {
    try {
      const form = getComposerFormForGeneratingWatch();
      if (!form) return false;
      if (state.gen.mo && state.gen.root === form) {
        checkGeneratingTransition();
        return true;
      }

      try {
        state.gen.mo?.disconnect?.();
      } catch {}
      state.gen.mo = null;
      state.gen.root = form;

      if (typeof MutationObserver === 'function') {
        const mo = new MutationObserver(() => {
          checkGeneratingTransition();
          handleComposerDomMutation();
        });
        mo.observe(form, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-testid', 'aria-label', 'class', 'disabled', 'aria-disabled']
        });
        state.gen.mo = mo;
      }

      if (state.gen.bootstrapTimer) {
        try {
          clearInterval(state.gen.bootstrapTimer);
        } catch {}
        state.gen.bootstrapTimer = 0;
      }
      state.gen.bootstrapAttempts = 0;
      checkGeneratingTransition();
      return true;
    } catch {
      return false;
    }
  }

  function ensureGeneratingBootstrap() {
    if (ensureGeneratingObserver()) return;
    if (state.gen.bootstrapTimer) return;
    state.gen.bootstrapAttempts = 0;
    state.gen.bootstrapTimer = setInterval(() => {
      if (state.disposed) return;
      state.gen.bootstrapAttempts += 1;
      if (ensureGeneratingObserver()) return;
      if (state.gen.bootstrapAttempts >= CONFIG.generatingBootstrapMaxAttempts) {
        try {
          clearInterval(state.gen.bootstrapTimer);
        } catch {}
        state.gen.bootstrapTimer = 0;
      }
    }, CONFIG.generatingBootstrapStepMs);
  }

  function nextQueueId() {
    state.queueSeq += 1;
    return `queue-${now().toString(36)}-${state.queueSeq.toString(36)}`;
  }

  function ensureStyle() {
    try {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${PREVIEW_ID} {
          margin: 0 0 10px;
          padding: 10px 12px;
          border: 1px solid rgba(245, 158, 11, 0.32);
          border-radius: 16px;
          background: rgba(17, 24, 39, 0.9);
          color: rgba(255, 247, 237, 0.96);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        #${PREVIEW_ID}[hidden] {
          display: none !important;
        }
        #${PREVIEW_ID} .aichatTabQueueHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font: 600 12px/1.4 ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
          letter-spacing: 0.02em;
        }
        #${PREVIEW_ID} .aichatTabQueueCount {
          color: rgba(251, 191, 36, 0.98);
        }
        #${PREVIEW_ID} .aichatTabQueueHint {
          color: rgba(255, 255, 255, 0.74);
          text-align: right;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        #${PREVIEW_ID} .aichatTabQueueToolbar {
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        #${PREVIEW_ID} .aichatTabQueueStatus {
          min-width: 0;
          color: rgba(209, 213, 219, 0.88);
          font-size: 12px;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }
        #${PREVIEW_ID} .aichatTabQueueToolbarActions {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        #${PREVIEW_ID} .aichatTabQueuePaused {
          margin-top: 6px;
          color: rgba(253, 186, 116, 0.98);
          font-size: 12px;
          line-height: 1.55;
        }
        #${PREVIEW_ID} .aichatTabQueueList {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        #${PREVIEW_ID} .aichatTabQueueItem {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 7px 9px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.92);
          font-size: 12px;
          line-height: 1.5;
        }
        #${PREVIEW_ID} .aichatTabQueueItemNum {
          flex: 0 0 auto;
          color: rgba(251, 191, 36, 0.98);
          font: 700 11px/1.4 ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
        }
        #${PREVIEW_ID} .aichatTabQueueItemText {
          flex: 1 1 auto;
          min-width: 0;
          word-break: break-word;
        }
        #${PREVIEW_ID} .aichatTabQueueItemActions {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
        }
        #${PREVIEW_ID} .aichatTabQueueItemForce,
        #${PREVIEW_ID} .aichatTabQueueItemRemove,
        #${PREVIEW_ID} .aichatTabQueueRestoreLatest,
        #${PREVIEW_ID} .aichatTabQueueClearAll {
          flex: 0 0 auto;
          padding: 2px 8px;
          border: 1px solid rgba(251, 191, 36, 0.2);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 245, 230, 0.9);
          font: 600 11px/1.4 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          cursor: pointer;
        }
        #${PREVIEW_ID} .aichatTabQueueItemForce {
          border-color: rgba(56, 189, 248, 0.28);
          background: rgba(56, 189, 248, 0.12);
          color: rgba(224, 242, 254, 0.96);
        }
        #${PREVIEW_ID} .aichatTabQueueRestoreLatest {
          border-color: rgba(168, 85, 247, 0.34);
          background: rgba(168, 85, 247, 0.14);
          color: rgba(245, 243, 255, 0.96);
        }
        #${PREVIEW_ID} .aichatTabQueueClearAll {
          border-color: rgba(248, 113, 113, 0.28);
          background: rgba(248, 113, 113, 0.12);
          color: rgba(254, 226, 226, 0.96);
        }
        #${PREVIEW_ID} .aichatTabQueueItemForce:hover {
          background: rgba(56, 189, 248, 0.2);
          border-color: rgba(56, 189, 248, 0.42);
          color: rgba(240, 249, 255, 0.98);
        }
        #${PREVIEW_ID} .aichatTabQueueRestoreLatest:hover {
          background: rgba(168, 85, 247, 0.22);
          border-color: rgba(168, 85, 247, 0.46);
          color: rgba(250, 245, 255, 0.98);
        }
        #${PREVIEW_ID} .aichatTabQueueItemRemove:hover,
        #${PREVIEW_ID} .aichatTabQueueClearAll:hover {
          background: rgba(251, 191, 36, 0.16);
          border-color: rgba(251, 191, 36, 0.34);
          color: rgba(255, 251, 235, 0.98);
        }
        @media (max-width: 520px) {
          #${PREVIEW_ID} .aichatTabQueueToolbar,
          #${PREVIEW_ID} .aichatTabQueueHead {
            align-items: stretch;
            flex-direction: column;
          }
          #${PREVIEW_ID} .aichatTabQueueToolbarActions,
          #${PREVIEW_ID} .aichatTabQueueItemActions {
            flex-wrap: wrap;
          }
        }
        #${TOAST_WRAP_ID} {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
          pointer-events: none;
        }
        #${TOAST_WRAP_ID} .aichatTabQueueToast {
          max-width: min(420px, 80vw);
          padding: 9px 12px;
          border-radius: 12px;
          background: rgba(17, 24, 39, 0.88);
          border: 1px solid rgba(245, 158, 11, 0.26);
          color: rgba(255, 247, 237, 0.96);
          font-size: 12px;
          line-height: 1.5;
          box-shadow: 0 14px 32px rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          opacity: 0;
          transform: translateY(4px);
          animation: aichatTabQueueToastInOut 2200ms ease-in-out forwards;
        }
        @keyframes aichatTabQueueToastInOut {
          0% { opacity: 0; transform: translateY(6px); }
          12% { opacity: 1; transform: translateY(0); }
          88% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(6px); }
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    } catch {}
  }

  function ensureToastWrap() {
    ensureStyle();
    try {
      let wrap = document.getElementById(TOAST_WRAP_ID);
      if (wrap) {
        state.ui.toastWrap = wrap;
        return wrap;
      }
      wrap = document.createElement('div');
      wrap.id = TOAST_WRAP_ID;
      (document.body || document.documentElement).appendChild(wrap);
      state.ui.toastWrap = wrap;
      return wrap;
    } catch {
      return null;
    }
  }

  function showToast(message) {
    const wrap = ensureToastWrap();
    if (!wrap) return;
    try {
      const toast = document.createElement('div');
      toast.className = 'aichatTabQueueToast';
      toast.textContent = String(message || '').trim();
      wrap.appendChild(toast);
      setTimeout(() => {
        try {
          toast.remove();
        } catch {}
      }, 2400);
    } catch {}
  }

  function getPreviewPausedReason() {
    const head = state.queue[0] || null;
    if (!head) return '';
    const manualReason = getManualSendInterlockReason();
    if (manualReason) return manualReason;
    if (isComposerInterlockActive()) {
      return t('queueSendPaused');
    }
    const currentConversationId = getConversationBindingId();
    if (head.conversationId && currentConversationId && head.conversationId !== currentConversationId) {
      return t('returnToConversationPaused');
    }
    if (head.conversationId && !currentConversationId) {
      return t('notInConversationPaused');
    }
    const composerState = getComposerBlockingState({
      composerText: readComposerText(getEditorEl()),
      headText: head.text,
      hasAttachments: hasLikelyComposerAttachments(getComposerForm(getEditorEl()))
    });
    if (composerState.hasDraft) {
      return t('draftPaused');
    }
    if (composerState.hasAttachments) {
      return t('attachmentsPaused');
    }
    if (isCachedCurrentConversationStreamActive(currentConversationId)) {
      return t('responseRunningPaused');
    }
    if (getLiveReplyRenderWaitMs() > 0) {
      return t('responseSettlingPaused');
    }
    return '';
  }

  function hasForeignComposerDraft(headText = '', editorEl = null) {
    return shouldPauseQueueForComposerDraft({
      composerText: readComposerText(editorEl || getEditorEl()),
      headText
    });
  }

  function ensurePreviewEl() {
    ensureStyle();
    const form = getComposerForm(getEditorEl());
    if (!form || !form.parentElement) return null;

    let preview = state.ui.previewEl;
    if (!preview || !preview.isConnected) preview = document.getElementById(PREVIEW_ID);
    if (!preview) {
      preview = document.createElement('div');
      preview.id = PREVIEW_ID;
      preview.hidden = true;
      preview.innerHTML = `
        <div class="aichatTabQueueHead">
          <div class="aichatTabQueueCount">${t('queuedCount', { count: 0 })}</div>
          <div class="aichatTabQueueHint">${t('queueHint')}</div>
        </div>
        <div class="aichatTabQueueToolbar">
          <div class="aichatTabQueueStatus"></div>
          <div class="aichatTabQueueToolbarActions">
            <button class="aichatTabQueueRestoreLatest" type="button">${t('restoreLatest')}</button>
            <button class="aichatTabQueueClearAll" type="button">${t('clearAll')}</button>
          </div>
        </div>
        <div class="aichatTabQueuePaused" hidden></div>
        <div class="aichatTabQueueList"></div>
      `;
    }

    if (preview.parentElement !== form.parentElement || preview.nextSibling !== form) {
      try {
        form.parentElement.insertBefore(preview, form);
      } catch {}
    }

    state.ui.previewEl = preview;
    state.ui.previewHost = form.parentElement;
    return preview;
  }

  function buildPreviewSignature(queueEnabled, pausedReason) {
    const visibleItems = state.queue.slice(0, CONFIG.queuePreviewMaxItems).map((item) => ({
      id: item.id,
      text: normalizePreviewText(item.text)
    }));
    return JSON.stringify({
      queueEnabled,
      pausedReason,
      count: state.queue.length,
      visibleItems
    });
  }

  function renderPreview(options = {}) {
    const preview = ensurePreviewEl();
    if (!preview) return;

    const queueEnabled = readSettings().queueEnabled;
    if (!queueEnabled || !state.queue.length) {
      clearPreviewContents(preview);
      preview.hidden = true;
      state.ui.previewSignature = '';
      return;
    }

    const pausedReason = getPreviewPausedReason();
    const nextSignature = buildPreviewSignature(queueEnabled, pausedReason);
    if (options.force !== true && state.ui.previewSignature === nextSignature && preview.hidden === false) return;

    const countEl = preview.querySelector('.aichatTabQueueCount');
    const pausedEl = preview.querySelector('.aichatTabQueuePaused');
    const listEl = preview.querySelector('.aichatTabQueueList');
    const statusEl = preview.querySelector('.aichatTabQueueStatus');
    const restoreLatestBtn = preview.querySelector('.aichatTabQueueRestoreLatest');
    const clearAllBtn = preview.querySelector('.aichatTabQueueClearAll');
    if (!countEl || !pausedEl || !listEl) return;

    countEl.textContent = t('queuedCount', { count: state.queue.length });
    if (statusEl) {
      statusEl.textContent = pausedReason || (state.processQueueBusy || state.pendingSendGate || state.activeRequests.size ? t('queueStatusSending') : t('queueHint'));
    }
    pausedEl.textContent = pausedReason;
    pausedEl.hidden = !pausedReason;
    if (restoreLatestBtn) {
      restoreLatestBtn.textContent = t('restoreLatest');
      restoreLatestBtn.setAttribute('aria-label', t('restoreLatestAria'));
      if (restoreLatestBtn.dataset.bound !== '1') {
        restoreLatestBtn.dataset.bound = '1';
        restoreLatestBtn.addEventListener('click', (event) => {
          try {
            event.preventDefault();
            event.stopPropagation();
          } catch {}
          restoreLatestQueuedDraftFromPreview();
        });
      }
    }
    if (clearAllBtn) {
      clearAllBtn.textContent = t('clearAll');
      clearAllBtn.setAttribute('aria-label', t('clearAllAria'));
      if (clearAllBtn.dataset.bound !== '1') {
        clearAllBtn.dataset.bound = '1';
        clearAllBtn.addEventListener('click', (event) => {
          try {
            event.preventDefault();
            event.stopPropagation();
          } catch {}
          clearQueuedDrafts();
        });
      }
    }

    listEl.textContent = '';
    const visibleItems = state.queue.slice(0, CONFIG.queuePreviewMaxItems);
    for (let i = 0; i < visibleItems.length; i += 1) {
      const item = visibleItems[i];
      const row = document.createElement('div');
      row.className = 'aichatTabQueueItem';

      const num = document.createElement('div');
      num.className = 'aichatTabQueueItemNum';
      num.textContent = `${i + 1}.`;

      const text = document.createElement('div');
      text.className = 'aichatTabQueueItemText';
      text.textContent = normalizePreviewText(item.text);

      const actions = document.createElement('div');
      actions.className = 'aichatTabQueueItemActions';

      const force = document.createElement('button');
      force.type = 'button';
      force.className = 'aichatTabQueueItemForce';
      force.textContent = t('forceSend');
      force.setAttribute('aria-label', t('forceSendAria'));
      force.addEventListener('click', (event) => {
        try {
          event.preventDefault();
          event.stopPropagation();
        } catch {}
        forceSendQueuedDraftById(item.id);
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'aichatTabQueueItemRemove';
      remove.textContent = t('remove');
      remove.setAttribute('aria-label', t('removeAria'));
      remove.addEventListener('click', (event) => {
        try {
          event.preventDefault();
          event.stopPropagation();
        } catch {}
        removeQueuedDraftById(item.id);
      });

      actions.appendChild(force);
      actions.appendChild(remove);
      row.appendChild(num);
      row.appendChild(text);
      row.appendChild(actions);
      listEl.appendChild(row);
    }

    if (state.queue.length > CONFIG.queuePreviewMaxItems) {
      const more = document.createElement('div');
      more.className = 'aichatTabQueueItem aichatTabQueueMore';
      more.textContent = t('moreQueued', { count: state.queue.length - CONFIG.queuePreviewMaxItems });
      listEl.appendChild(more);
    }

    preview.hidden = false;
    state.ui.previewSignature = nextSignature;
  }

  function clearPreviewContents(preview = state.ui.previewEl) {
    if (!preview) return;
    try {
      const countEl = preview.querySelector('.aichatTabQueueCount');
      const pausedEl = preview.querySelector('.aichatTabQueuePaused');
      const listEl = preview.querySelector('.aichatTabQueueList');
      const statusEl = preview.querySelector('.aichatTabQueueStatus');
      if (countEl) countEl.textContent = t('queuedCount', { count: 0 });
      if (statusEl) statusEl.textContent = '';
      if (pausedEl) {
        pausedEl.textContent = '';
        pausedEl.hidden = true;
      }
      if (listEl) listEl.textContent = '';
    } catch {}
  }

  function shouldRepairPreviewAttachment() {
    if (!state.queue.length || !readSettings().queueEnabled) return false;
    const form = getComposerForm(getEditorEl());
    const preview = state.ui.previewEl;
    if (!form || !form.parentElement) return false;
    if (!preview || !preview.isConnected) return true;
    if (preview.parentElement !== form.parentElement) return true;
    if (preview.nextSibling !== form) return true;
    return false;
  }

  function startPreviewRepairLoop() {
    if (!state.queue.length) {
      stopPreviewRepairLoop();
      return;
    }
    if (state.previewRepairTimer) return;
    state.previewRepairTimer = setInterval(() => {
      if (state.disposed) return;
      if (!state.queue.length) {
        stopPreviewRepairLoop();
        return;
      }
      if (shouldRepairPreviewAttachment()) renderPreview({ force: true });
      repairQueueProgressFromPreviewTick();
    }, CONFIG.previewRepairIntervalMs);
  }

  function stopPreviewRepairLoop() {
    if (!state.previewRepairTimer) return;
    try {
      clearInterval(state.previewRepairTimer);
    } catch {}
    state.previewRepairTimer = 0;
  }

  function refreshPreview() {
    renderPreview({ force: true });
    if (state.queue.length) startPreviewRepairLoop();
    else stopPreviewRepairLoop();
  }

  function shouldRepairQueueProgress(options = {}) {
    if ((Number(options.queueLength) || 0) <= 0) return false;
    if (hasText(options.pausedReason || '')) return false;
    if (options.processQueueBusy === true) return false;
    if (options.awaitingConversationStart === true) return false;
    if (options.hasPendingSendGate === true) return false;
    if (options.generatingNow === true) return false;
    if ((Number(options.activeRequestCount) || 0) > 0) return false;
    if ((Number(options.replyRenderWaitMs) || 0) > 0) return false;
    return Math.max(0, Number(options.idleForMs) || 0) >= Math.max(0, Number(options.minIdleMs) || 0);
  }

  function repairQueueProgressFromPreviewTick() {
    if (!state.queue.length) return false;
    refreshReplyRenderSampling();
    void maybeReleasePendingSendGate();
    if (
      !shouldRepairQueueProgress({
        queueLength: state.queue.length,
        pausedReason: getPreviewPausedReason(),
        processQueueBusy: state.processQueueBusy,
        awaitingConversationStart: state.awaitingConversationStart,
        hasPendingSendGate: !!state.pendingSendGate,
        activeRequestCount: state.activeRequests.size,
        generatingNow: isGeneratingNow(),
        replyRenderWaitMs: getLiveReplyRenderWaitMs(),
        idleForMs: now() - (Number(state.lastQueueActivityAt) || 0),
        minIdleMs: CONFIG.previewRepairIdleMs
      })
    ) {
      return false;
    }
    scheduleMaybeProcessQueue(0);
    return true;
  }

  function enqueueDraft(text, options = {}) {
    const item = {
      id: nextQueueId(),
      text: String(text || ''),
      createdAt: now(),
      conversationId: getConversationBindingId(),
      queuePoolHold: options.queuePoolHold || null
    };
    state.queue.push(item);
    markQueueActivity();
    refreshPreview();
    refreshReplyRenderSampling();
    return item;
  }

  function popLastQueuedDraft() {
    if (!state.queue.length) return null;
    const item = state.queue.pop() || null;
    if (!state.queue.length) resetQueueSessionState({ preserveActiveResponseState: true, clearRestoredQueuedDraft: false });
    markQueueActivity();
    refreshPreview();
    refreshReplyRenderSampling();
    return item;
  }

  function restoreLatestQueuedDraftFromPreview() {
    const item = popLastQueuedDraft();
    if (!item) return false;
    return restoreQueuedDraftToComposer(item);
  }

  function clearQueuedDrafts() {
    if (!state.queue.length) return false;
    state.queue = [];
    resetQueueSessionState({ preserveActiveResponseState: true });
    markQueueActivity();
    refreshPreview();
    refreshReplyRenderSampling();
    showToast(t('clearedQueue'));
    return true;
  }

  function removeQueuedDraftFromList(queue, itemId) {
    const source = Array.isArray(queue) ? queue.slice() : [];
    const nextId = String(itemId || '').trim();
    if (!nextId) return { nextQueue: source, removedItem: null, removedIndex: -1 };
    const removedIndex = source.findIndex((item) => String(item?.id || '').trim() === nextId);
    if (removedIndex < 0) return { nextQueue: source, removedItem: null, removedIndex: -1 };
    const [removedItem] = source.splice(removedIndex, 1);
    return { nextQueue: source, removedItem: removedItem || null, removedIndex };
  }

  function removeQueuedDraftById(itemId) {
    const result = removeQueuedDraftFromList(state.queue, itemId);
    if (!result.removedItem) return false;
    state.queue = result.nextQueue;
    if (!state.queue.length) resetQueueSessionState({ preserveActiveResponseState: true });
    markQueueActivity();
    refreshPreview();
    refreshReplyRenderSampling();
    if (state.queue.length > 0 && !state.processQueueBusy) scheduleMaybeProcessQueue(0);
    showToast(t('removedQueued', { index: result.removedIndex + 1 }));
    return true;
  }

  function moveQueuedDraftToFront(itemId) {
    const nextId = String(itemId || '').trim();
    if (!nextId || state.queue.length <= 1) return false;
    const index = state.queue.findIndex((item) => String(item?.id || '').trim() === nextId);
    if (index <= 0) return index === 0;
    const [item] = state.queue.splice(index, 1);
    if (!item) return false;
    state.queue.unshift(item);
    markQueueActivity();
    refreshPreview();
    return true;
  }

  function resetQueueSessionState(options = {}) {
    if (state.queue.length > 0) return false;
    if (options.preserveActiveResponseState !== true) {
      clearPendingSendGate();
      clearAwaitingConversationStart();
      clearConversationStreamStatusCache();
    }
    clearComposerInterlock();
    if (options.clearRestoredQueuedDraft !== false) clearRestoredQueuedDraft();
    markQueueActivity();
    refreshReplyRenderSampling();
    return true;
  }

  function clearAwaitingConversationStart() {
    state.awaitingConversationStart = false;
    if (state.awaitingConversationStartTimer) {
      try {
        clearTimeout(state.awaitingConversationStartTimer);
      } catch {}
      state.awaitingConversationStartTimer = 0;
    }
    refreshReplyRenderSampling();
    markQueueActivity();
  }

  function armAwaitingConversationStart() {
    clearAwaitingConversationStart();
    state.awaitingConversationStart = true;
    refreshReplyRenderSampling();
    markQueueActivity();
    state.awaitingConversationStartTimer = setTimeout(() => {
      state.awaitingConversationStart = false;
      state.awaitingConversationStartTimer = 0;
      refreshReplyRenderSampling();
      markQueueActivity();
      void maybeProcessQueue();
    }, 2500);
  }

  function clearQueuedHighlightsByRef({ msgId = '', key = '' } = {}) {
    const nextMsgId = String(msgId || '').trim();
    const nextKey = String(key || '').trim();
    if (nextMsgId) state.highlightedMsgIds.delete(nextMsgId);
    if (nextKey) state.highlightedKeys.delete(nextKey);

    state.pendingHighlightCandidates = state.pendingHighlightCandidates.filter((candidate) => {
      if (nextMsgId && candidate.resolvedMsgId === nextMsgId) return false;
      if (nextKey && candidate.resolvedKey === nextKey) return false;
      return true;
    });

    syncHighlightedTurnsToDom();
    postBridgeMessage(BRIDGE_TAB_QUEUE_MARKS_CHANGED, { msgId: nextMsgId, key: nextKey });
  }

  function buildPendingHighlightCandidate(item, beforeSnapshot) {
    return {
      queuedId: item.id,
      beforeCount: Number(beforeSnapshot?.count) || 0,
      beforeLastKey: String(beforeSnapshot?.lastKey || ''),
      beforeLastMsgId: String(beforeSnapshot?.lastMsgId || ''),
      createdAt: now(),
      resolvedMsgId: '',
      resolvedKey: ''
    };
  }

  function trimSetToLimit(set, limit) {
    if (!set || typeof set.size !== 'number') return;
    const max = Math.max(1, Number(limit) || 1);
    while (set.size > max) {
      const first = set.values().next();
      if (!first || first.done) break;
      set.delete(first.value);
    }
  }

  function pruneHighlightTracking(turns = null) {
    try {
      const turnList = Array.isArray(turns) ? turns : collectUserTurns();
      if (turnList.length) {
        const liveMsgIds = new Set();
        const liveKeys = new Set();
        for (const turn of turnList) {
          const msgId = String(turn?.msgId || '');
          const key = String(turn?.key || '');
          if (msgId) liveMsgIds.add(msgId);
          if (key) liveKeys.add(key);
        }
        for (const msgId of Array.from(state.highlightedMsgIds)) {
          if (!liveMsgIds.has(msgId)) state.highlightedMsgIds.delete(msgId);
        }
        for (const key of Array.from(state.highlightedKeys)) {
          if (!liveKeys.has(key)) state.highlightedKeys.delete(key);
        }
      }
      trimSetToLimit(state.highlightedMsgIds, CONFIG.highlightSetMaxEntries);
      trimSetToLimit(state.highlightedKeys, CONFIG.highlightSetMaxEntries);
      if (state.pendingHighlightCandidates.length > CONFIG.pendingHighlightMaxEntries) {
        state.pendingHighlightCandidates.splice(0, state.pendingHighlightCandidates.length - CONFIG.pendingHighlightMaxEntries);
      }
    } catch {}
  }

  function syncHighlightedTurnsToDom() {
    const quicknavMarkEnabled = readSettings().quicknavMarkEnabled;
    for (const entry of collectUserTurns()) {
      const msgId = String(entry.msgId || '');
      const key = String(entry.key || '');
      const isQueued = quicknavMarkEnabled && ((msgId && state.highlightedMsgIds.has(msgId)) || (key && state.highlightedKeys.has(key)));
      try {
        if (isQueued) {
          entry.turn.setAttribute(TAB_QUEUE_ATTR, '1');
          if (msgId) entry.turn.setAttribute(TAB_QUEUE_MSG_ID_ATTR, msgId);
          else entry.turn.removeAttribute(TAB_QUEUE_MSG_ID_ATTR);
          if (key) entry.turn.setAttribute(TAB_QUEUE_KEY_ATTR, key);
          else entry.turn.removeAttribute(TAB_QUEUE_KEY_ATTR);
        } else {
          entry.turn.removeAttribute(TAB_QUEUE_ATTR);
          entry.turn.removeAttribute(TAB_QUEUE_MSG_ID_ATTR);
          entry.turn.removeAttribute(TAB_QUEUE_KEY_ATTR);
        }
      } catch {}
    }

    if (!quicknavMarkEnabled) {
      try {
        for (const turn of getTurnArticles()) {
          turn?.removeAttribute?.(TAB_QUEUE_ATTR);
          turn?.removeAttribute?.(TAB_QUEUE_MSG_ID_ATTR);
          turn?.removeAttribute?.(TAB_QUEUE_KEY_ATTR);
        }
      } catch {}
    }
  }

  function resolvePendingHighlights() {
    if (!state.pendingHighlightCandidates.length) return false;
    const turns = collectUserTurns();
    const last = turns.length ? turns[turns.length - 1] : null;
    let changed = false;

    while (state.pendingHighlightCandidates.length) {
      const candidate = state.pendingHighlightCandidates[0];
      if (!candidate) break;

      let resolved = null;
      if (last) {
        const lastKey = String(last.key || '');
        const lastMsgId = String(last.msgId || '');
        if (turns.length > candidate.beforeCount) resolved = last;
        else if (lastKey && lastKey !== candidate.beforeLastKey) resolved = last;
        else if (lastMsgId && lastMsgId !== candidate.beforeLastMsgId) resolved = last;
        else if (now() - candidate.createdAt > CONFIG.highlightResolveTimeoutMs) resolved = last;
      }

      if (!resolved) break;

      candidate.resolvedMsgId = String(resolved.msgId || '');
      candidate.resolvedKey = String(resolved.key || '');
      if (candidate.resolvedMsgId) state.highlightedMsgIds.add(candidate.resolvedMsgId);
      if (candidate.resolvedKey) state.highlightedKeys.add(candidate.resolvedKey);
      state.pendingHighlightCandidates.shift();
      changed = true;
    }

    if (changed) {
      pruneHighlightTracking(turns);
      syncHighlightedTurnsToDom();
      postBridgeMessage(BRIDGE_TAB_QUEUE_MARKS_CHANGED);
    }
    return changed;
  }

  function handleTurnsChange() {
    syncReplyRenderState();
    state.lastTurnsChangeAt = now();
    markQueueActivity();
    resolvePendingHighlights();
    syncHighlightedTurnsToDom();
    refreshPreview();
    refreshReplyRenderSampling();
    void maybeReleasePendingSendGate();
  }

  function canSendQueueHead(options = {}) {
    const force = options.force === true;
    if (!state.queue.length) return false;
    if (isManualSendWarmupActive()) return false;
    if (isManualSendInterlockActive()) return false;
    if (state.activeRequests.size > 0) return false;
    if (state.awaitingConversationStart) return false;
    if (state.pendingSendGate) return false;
    if (state.composerInterlock) return false;
    if (!force && isGeneratingNow()) return false;
    if (!force && isCachedCurrentConversationStreamActive()) return false;
    if (!force && getLiveReplyRenderWaitMs() > 0) return false;
    const head = state.queue[0];
    if (!head) return false;
    if (!force && isQueuePoolHoldActive(head)) return false;
    const composerState = getComposerBlockingState({
      composerText: readComposerText(getEditorEl()),
      headText: head.text,
      hasAttachments: hasLikelyComposerAttachments(getComposerForm(getEditorEl()))
    });
    if (!force && (composerState.hasDraft || composerState.hasAttachments)) return false;
    const currentConversationId = getConversationBindingId();
    if (!force && head.conversationId && currentConversationId && head.conversationId !== currentConversationId) return false;
    if (!force && head.conversationId && !currentConversationId) return false;
    return true;
  }

  function getQueueRetryDelay(options = {}) {
    const force = options.force === true;
    if (!state.queue.length) return 0;
    if (isManualSendWarmupActive()) {
      return Math.max(0, Number(state.manualSendWarmupUntil || 0) - now()) || CONFIG.sendCooldownMs;
    }
    if (isManualSendInterlockActive()) return CONFIG.sendCooldownMs;
    if (state.activeRequests.size > 0) return CONFIG.localResponseRetryMs;
    if (state.awaitingConversationStart) return CONFIG.sendCooldownMs;
    if (state.pendingSendGate) return CONFIG.localResponseRetryMs;
    if (state.composerInterlock) return CONFIG.sendCooldownMs;
    const holdRetryDelayMs = getQueuePoolHoldRetryDelay(state.queue[0]);
    if (!force && holdRetryDelayMs > 0) return holdRetryDelayMs;
    if (!force && isGeneratingNow()) return CONFIG.localResponseRetryMs;
    if (!force) {
      const replyRenderWaitMs = getLiveReplyRenderWaitMs();
      if (replyRenderWaitMs > 0) return replyRenderWaitMs;
    }
    return 0;
  }

  function forceSendQueuedDraftById(itemId) {
    const nextId = String(itemId || '').trim();
    if (!nextId) return false;
    const editor = getEditorEl();
    const sendButton = findSendButton(editor);
    if (!isReadySendButton(sendButton, editor)) {
      showToast(t('forceSendBlocked'));
      return false;
    }
    moveQueuedDraftToFront(nextId);
    markQueueActivity();
    refreshPreview();
    showToast(t('forceSendQueued'));
    void maybeProcessQueue({ force: true, allowSyncImmediate: true });
    return true;
  }

  function canUseImmediateComposerSend(options = {}) {
    if ((Number(options.queueLength) || 0) !== 1) return false;
    if (options.manualSendWarmupActive === true) return false;
    if (options.manualSendInterlockActive === true) return false;
    if ((Number(options.activeRequestCount) || 0) > 0) return false;
    if (options.awaitingConversationStart === true) return false;
    if (options.hasPendingSendGate === true) return false;
    if (options.generatingNow === true) return false;
    if ((Number(options.replyRenderWaitMs) || 0) > 0) return false;
    if (options.composerSynced !== true) return false;

    const itemConversationId = String(options.itemConversationId || '').trim();
    const currentConversationId = String(options.currentConversationId || '').trim();
    if (itemConversationId && currentConversationId && itemConversationId !== currentConversationId) return false;
    if (itemConversationId && !currentConversationId) return false;
    return true;
  }

  function shouldUseImmediateComposerSend(item, editorEl = null) {
    const editor = editorEl || getEditorEl();
    return canUseImmediateComposerSend({
      queueLength: state.queue.length,
      manualSendWarmupActive: isManualSendWarmupActive(),
      manualSendInterlockActive: isManualSendInterlockActive(),
      activeRequestCount: state.activeRequests.size,
      awaitingConversationStart: state.awaitingConversationStart,
      hasPendingSendGate: !!state.pendingSendGate,
      generatingNow: isGeneratingNow(),
      replyRenderWaitMs: getLiveReplyRenderWaitMs(),
      composerSynced: isComposerSyncedTo(item?.text || '', editor),
      itemConversationId: item?.conversationId || '',
      currentConversationId: getConversationBindingId()
    });
  }

  function canUseHomeImmediateButtonSubmit(options = {}) {
    if (options.immediateComposerSend !== true) return false;
    if (options.composerReady !== true) return false;
    return !hasText(options.currentConversationId) && !hasText(options.headConversationId);
  }

  async function waitForConversationRequestStart(
    beforeConversationStartSeq,
    beforeSteerTurnStartSeq,
    timeoutMs = CONFIG.sendStrategyConfirmMs
  ) {
    try {
      return !!(await waitUntil(() => {
        return didQueuedSendStart(null, null, {
          activeRequestCount: state.activeRequests.size,
          conversationStartSeqDelta: state.conversationStartSeq - beforeConversationStartSeq,
          steerTurnStartSeqDelta: state.steerTurnStartSeq - beforeSteerTurnStartSeq
        });
      }, timeoutMs, 20));
    } catch {
      return false;
    }
  }

  async function trySendButtonStrategies(
    getActiveEditor,
    getSendButton,
    beforeConversationStartSeq,
    beforeSteerTurnStartSeq
  ) {
    const strategies = ['core_click', 'pointer_click', 'react_click'];
    for (const strategy of strategies) {
      const button = getSendButton();
      if (!isReadySendButton(button, getActiveEditor())) continue;
      if (!clickSendButtonRobust(getActiveEditor(), button, strategy)) continue;
      if (
        await waitForConversationRequestStart(
          beforeConversationStartSeq,
          beforeSteerTurnStartSeq,
          CONFIG.sendStrategyConfirmMs
        )
      ) {
        return true;
      }
    }
    return false;
  }

  async function sendQueuedHead(options = {}) {
    const force = options.force === true;
    if (!canSendQueueHead({ force })) return false;
    const head = state.queue[0];
    const initialEditor = getEditorEl();
    const initialForm = getComposerForm(initialEditor);
    const getActiveEditor = () => {
      const live = getEditorEl();
      if (live && live.isConnected) return live;
      return initialEditor;
    };
    const getActiveForm = () => {
      const liveEditor = getActiveEditor();
      const liveForm = getComposerForm(liveEditor);
      if (liveForm && liveForm.isConnected) return liveForm;
      return initialForm;
    };
    const editor = getActiveEditor();
    const form = getActiveForm();
    if (!editor || !form) return false;

    const currentConversationId = getConversationBindingId();
    const composerReady = isComposerSyncedTo(head.text, getActiveEditor());
    const immediateHomeSubmit = canUseHomeImmediateButtonSubmit({
      immediateComposerSend: options.allowSyncImmediate === true,
      composerReady,
      currentConversationId,
      headConversationId: head?.conversationId || ''
    });
    markQueueActivity();

    const beforeSnapshot = getUserTurnSnapshot();
    const beforeAssistantCount = collectAssistantTurns().length;
    const beforeConversationStartSeq = state.conversationStartSeq;
    const beforeSteerTurnStartSeq = state.steerTurnStartSeq;
    if (!force && hasForeignComposerDraft(head.text, getActiveEditor())) {
      refreshPreview();
      return false;
    }

    postQueuedSendProtectBridge(head, 'prepare', {
      composerReady,
      immediateHomeSubmit
    });

    if (!composerReady && !setComposerText(head.text, getActiveEditor())) {
      showToast(t('writeBackFailed'));
      return false;
    }

    if (!composerReady) {
      try {
        await waitUntil(() => {
          const activeEditor = getActiveEditor();
          const currentText = readComposerText(activeEditor);
          return clampToCharBoundary(currentText, currentText.length) >= 0 && isComposerSyncedTo(head.text, activeEditor);
        }, 800, 24);
      } catch {}

      await sleep(CONFIG.composerSettleMs);
    }

    const getSendButton = () => findSendButton(getActiveEditor()) || findSendButton();

    let sendButton = null;
    try {
      if (immediateHomeSubmit) {
        const fastButton = getSendButton();
        if (isReadySendButton(fastButton, getActiveEditor())) sendButton = fastButton;
      }
      if (!sendButton) {
        sendButton = await waitUntil(() => {
          const btn = getSendButton();
          if (!btn) return null;
          const disabled = String(btn.getAttribute?.('aria-disabled') || '');
          if (btn.disabled || (disabled && disabled !== 'false')) return null;
          return btn;
        }, CONFIG.sendReadyTimeoutMs, 40);
      }
    } catch {
      sendButton = getSendButton();
    }

    if (!composerReady) {
      await sleep(CONFIG.sendArmDelayMs);
    }

    if (!sendButton) {
      showToast(t('missingSendButton'));
      return false;
    }

    armComposerInterlock(head);
    postQueuedSendProtectBridge(head, 'before-click', {
      composerReady,
      immediateHomeSubmit
    });

    let sendConfirmed = await trySendButtonStrategies(
      getActiveEditor,
      getSendButton,
      beforeConversationStartSeq,
      beforeSteerTurnStartSeq
    );
    if (!sendConfirmed) {
      try {
        sendConfirmed = !!(await waitUntil(() => {
          const afterSnapshot = getUserTurnSnapshot();
          return didQueuedSendStart(beforeSnapshot, afterSnapshot, {
            activeRequestCount: state.activeRequests.size,
            conversationStartSeqDelta: state.conversationStartSeq - beforeConversationStartSeq,
            steerTurnStartSeqDelta: state.steerTurnStartSeq - beforeSteerTurnStartSeq
          });
        }, CONFIG.sendConfirmTimeoutMs, 20));
      } catch {
        sendConfirmed = false;
      }
    }

    if (!sendConfirmed) {
      postQueuedSendProtectBridge(head, 'failed');
      clearComposerInterlock();
      const activeEditor = getActiveEditor();
      if (readComposerText(activeEditor) === head.text) {
        setComposerText('', activeEditor);
      }
      showToast(t('sendUnconfirmed'));
      scheduleMaybeProcessQueue(CONFIG.previewRepairIntervalMs);
      return false;
    }

    const steerTurnConfirmed = state.steerTurnStartSeq - beforeSteerTurnStartSeq > 0;
    postQueuedSendProtectBridge(head, 'confirmed', { steerTurnConfirmed });
    clearComposerInterlock();
    updateComposerTextCache(getActiveEditor(), '');
    state.queue.shift();
    markQueueActivity();
    if (readSettings().quicknavMarkEnabled) {
      state.pendingHighlightCandidates.push(buildPendingHighlightCandidate(head, beforeSnapshot));
      pruneHighlightTracking();
      resolvePendingHighlights();
    }
    armPendingSendGate(head.id, {
      beforeAssistantCount,
      sawGenerating: isGeneratingNow()
    });
    if (steerTurnConfirmed && state.pendingSendGate) {
      state.pendingSendGate.transportDone = true;
    }

    if (steerTurnConfirmed) {
      markCurrentConversationStreamStatus('IS_STREAMING', 'steer-turn-confirmed');
      clearAwaitingConversationStart();
    } else {
      armAwaitingConversationStart();
    }
    if (!state.queue.length) resetQueueSessionState({ preserveActiveResponseState: true });
    refreshPreview();
    return true;
  }

  async function maybeProcessQueue(options = {}) {
    if (state.disposed) return false;
    if (!readSettings().queueEnabled) return false;
    if (state.processQueueBusy) return false;
    state.processQueueBusy = true;
    if (!canSendQueueHead({ force: options.force === true })) {
      const retryDelayMs = getQueueRetryDelay({ force: options.force === true });
      if (retryDelayMs > 0) scheduleMaybeProcessQueue(retryDelayMs);
      state.processQueueBusy = false;
      refreshPreview();
      return false;
    }
    try {
      return await sendQueuedHead(options);
    } finally {
      state.processQueueBusy = false;
      refreshPreview();
    }
  }

  function restoreQueuedDraftToComposer(item) {
    if (!item) return false;
    const editor = getEditorEl();
    if (!editor) return false;
    const ok = setComposerText(item.text, editor);
    if (ok) {
      rememberRestoredQueuedDraft(item);
      showToast(t('restoredLatest'));
    }
    return ok;
  }

  async function queueCurrentComposerDraft(options = {}) {
    const settings = readSettings();
    if (!settings.queueEnabled) {
      setLastQueueAttemptDebug({ ok: false, reason: 'queue_disabled' });
      return false;
    }
    const sourceEditor = resolveComposerEditorFromTarget(options.sourceEditor || null);
    const liveEditor = getEditorEl();
    const editor = liveEditor || sourceEditor;
    const form = getComposerForm(editor) || getComposerForm(sourceEditor);
    const sourceText = String(options.sourceText || '');
    const sourceReadText = readComposerText(sourceEditor || editor);
    const liveText = pickBestComposerText(
      [
        sourceReadText,
        readComposerText(liveEditor),
        readCachedComposerText(sourceEditor || editor, { baseText: sourceText || sourceReadText })
      ],
      sourceText || sourceReadText
    );
    if (!editor || !form) {
      setLastQueueAttemptDebug({
        ok: false,
        reason: 'missing_editor_or_form',
        sourceTag: String(sourceEditor?.tagName || ''),
        editorTag: String(editor?.tagName || ''),
        hasForm: !!form,
        sourceText,
        liveText
      });
      return false;
    }

    if (hasLikelyComposerAttachments(form)) {
      setLastQueueAttemptDebug({
        ok: false,
        reason: 'attachments_detected',
        sourceTag: String(sourceEditor?.tagName || ''),
        editorTag: String(editor?.tagName || ''),
        sourceText,
        liveText
      });
      showToast(t('attachmentsNotSupported'));
      return false;
    }

    const resolvedSourceText = resolveQueueDraftText({
      sourceEditor,
      editor,
      sourceText,
      liveText
    });
    const text = hasText(sourceText)
      ? resolvedSourceText
      : await readSettledQueueDraftText({
          sourceEditor,
          editor,
          sourceText: resolvedSourceText,
          liveText
        });
    if (!hasText(text)) {
      setLastQueueAttemptDebug({
        ok: false,
        reason: 'empty_text',
        sourceTag: String(sourceEditor?.tagName || ''),
        editorTag: String(editor?.tagName || ''),
        sourceText,
        liveText
      });
      return false;
    }

    const restoredQueuedDraft = state.restoredQueuedDraft
      ? {
          id: state.restoredQueuedDraft.id,
          text: state.restoredQueuedDraft.text,
          conversationId: state.restoredQueuedDraft.conversationId,
          restoredAt: state.restoredQueuedDraft.restoredAt,
          activeResponseAtRestore: state.restoredQueuedDraft.activeResponseAtRestore
        }
      : null;
    const queuePoolHold = buildRestoredDraftQueuePoolHold(restoredQueuedDraft);
    const item = enqueueDraft(text, { queuePoolHold });
    postQueuedSendProtectBridge(item, 'queued', {
      source: 'queue-current-draft'
    });
    const suppressImmediateSend = shouldSuppressImmediateSendForRestoredDraft({
      restoredQueuedDraftActive: !!restoredQueuedDraft,
      queueLength: state.queue.length
    });
    const immediateSend = !suppressImmediateSend && shouldUseImmediateComposerSend(item, editor);
    if (!immediateSend) {
      const clearEditor = liveEditor || sourceEditor || editor;
      const cleared =
        !!clearEditor &&
        (setComposerText('', clearEditor) ||
          (sourceEditor && sourceEditor !== clearEditor ? setComposerText('', sourceEditor) : false));
      if (!cleared) {
        const connectedComposerTexts = collectConnectedComposerTexts({
          primaryEditor: clearEditor,
          liveEditor: getEditorEl(),
          sourceEditor
        });
        const sourceDisconnected = !!sourceEditor && sourceEditor.isConnected === false;
        if (
          !canPreserveQueuedDraftOnClearFailure({
            sourceText,
            queuedText: text,
            connectedComposerTexts,
            sourceDisconnected
          })
        ) {
          state.queue.pop();
          if (!state.queue.length) resetQueueSessionState({ preserveActiveResponseState: true, clearRestoredQueuedDraft: false });
          refreshPreview();
          setLastQueueAttemptDebug({
            ok: false,
            reason: 'clear_failed_and_reverted',
            sourceTag: String(sourceEditor?.tagName || ''),
            editorTag: String(editor?.tagName || ''),
            sourceText,
            liveText,
            queuedText: text,
            connectedComposerTexts,
            sourceDisconnected,
            queuedId: item.id
          });
          showToast(t('clearFailed'));
          return false;
        }
      }
    }
    setLastQueueAttemptDebug({
      ok: true,
      reason: immediateSend ? 'queued_and_immediate_send' : 'queued',
      sourceTag: String(sourceEditor?.tagName || ''),
      editorTag: String(editor?.tagName || ''),
      sourceText,
      liveText,
      queuedText: text,
      queuedId: item.id,
      queueLength: state.queue.length,
      immediateSend,
      suppressImmediateSend,
      queuePoolHold,
      queuePoolHoldActive: isQueuePoolHoldActive(item)
    });
    clearRestoredQueuedDraft();
    showToast(t('queuedAdded', { count: state.queue.length }));
    void maybeProcessQueue({ allowSyncImmediate: immediateSend });
    return !!item;
  }

  function clearComposerByShortcut() {
    const settings = readSettings();
    if (!settings.clearEnabled) return false;
    const editor = getEditorEl();
    if (!editor) return false;
    const text = readComposerText(editor);
    if (!hasText(text)) return false;
    const ok = setComposerText('', editor);
    if (ok) {
      clearRestoredQueuedDraft();
      showToast(t('clearedComposer'));
    }
    return ok;
  }

  function handleComposerInput(event) {
    if (!isEditableInComposer(event?.target)) return;
    const eventEditor = resolveComposerEditorFromTarget(event?.target) || getEditorEl();
    if (!shouldUseFullComposerInputPathForState()) {
      updateComposerTextCache(eventEditor, readComposerTextForInputCache(eventEditor));
      return;
    }

    const eventText = pickBestComposerText(
      [
        readComposerText(eventEditor),
        readComposerMirrorText(eventEditor)
      ],
      readComposerText(eventEditor)
    );
    updateComposerTextCache(eventEditor, eventText);
    if (!hasText(eventText)) clearRestoredQueuedDraft();
    if (!isProgrammaticComposerMutationActive() && !isTextareaLike(event?.target)) {
      scheduleComposerMirrorSync(0);
    }
    markQueueActivity();
    refreshReplyRenderSampling();
    refreshPreview();
    if (state.queue.length > 0 && !state.processQueueBusy) {
      const head = state.queue[0];
      const composerState = getComposerBlockingState({
        composerText: eventText,
        headText: head?.text || '',
        hasAttachments: hasLikelyComposerAttachments(getComposerForm(eventEditor))
      });
      if (!composerState.hasDraft && !composerState.hasAttachments) {
        scheduleMaybeProcessQueue(CONFIG.composerSettleMs);
      }
    }
  }

  function handleComposerBeforeInput(event) {
    const interlockActive = isComposerInterlockActive();
    if (!interlockActive) return;
    if (!isComposerMutationInputType(event?.inputType)) return;
    if (
      !shouldBlockComposerBeforeInput({
        interlockActive,
        isEditableTarget: isEditableInComposer(event?.target),
        inputType: event?.inputType
      })
    ) {
      return;
    }
    swallowEvent(event);
    markQueueActivity();
    maybeWarnComposerInterlock();
    refreshPreview();
  }

  function handleManualSendPointerDown(event) {
    const target = event?.target;
    if (!target || typeof target !== 'object') return;
    const editor = getEditorEl();
    const button = target?.closest?.('button');
    if (!button || !isLikelyComposerSendButton(button, editor)) return;
    if (
      !shouldArmManualSendInterlock({
        composerText: readComposerText(editor),
        sendButtonReady: true,
        isProgrammaticMutation: isProgrammaticComposerMutationActive(),
        composerInterlockActive: isComposerInterlockActive(),
        processQueueBusy: state.processQueueBusy
      })
    ) {
      return;
    }
    armManualSendWarmup();
    clearRestoredQueuedDraft();
  }

  function handleManualSendClick(event) {
    const target = event?.target;
    if (!target || typeof target !== 'object') return;
    const editor = getEditorEl();
    const button = target?.closest?.('button');
    if (!button || !isLikelyComposerSendButton(button, editor)) return;
    if (
      !shouldArmManualSendInterlock({
        composerText: readComposerText(editor),
        sendButtonReady: true,
        isProgrammaticMutation: isProgrammaticComposerMutationActive(),
        composerInterlockActive: isComposerInterlockActive(),
        processQueueBusy: state.processQueueBusy
      })
    ) {
      return;
    }
    armManualSendWarmup();
    clearRestoredQueuedDraft();
    armManualSendInterlock({ composerText: readComposerText(editor) });
  }

  function handleManualSendSubmit(event) {
    const editor = getEditorEl();
    const form = getComposerForm(editor);
    if (!form || event?.target !== form) return;
    if (
      !shouldArmManualSendInterlock({
        composerText: readComposerText(editor),
        sendButtonReady: true,
        isProgrammaticMutation: isProgrammaticComposerMutationActive(),
        composerInterlockActive: isComposerInterlockActive(),
        processQueueBusy: state.processQueueBusy
      })
    ) {
      return;
    }
    armManualSendWarmup();
    clearRestoredQueuedDraft();
    armManualSendInterlock({ composerText: readComposerText(editor) });
  }

  function getHotkeyAction(event, queueLength = state.queue.length, settings = null) {
    if (!event || typeof event !== 'object') return null;
    if (event.isComposing || event.keyCode === 229) return null;

    const key = typeof event.key === 'string' ? event.key : '';
    const code = typeof event.code === 'string' ? event.code : '';
    const lowerKey = key.toLowerCase();

    if (code === 'Tab' || key === 'Tab') {
      if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) return 'suppress_shift_tab';
      const hotkeySettings = settings || readSettings();
      if (!event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && hotkeySettings.queueEnabled) return 'queue_tab';
      return null;
    }

    if ((code === 'ArrowUp' || lowerKey === 'arrowup') && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const hotkeySettings = settings || readSettings();
      return queueLength > 0 && hotkeySettings.queueEnabled ? 'edit_last_queued' : null;
    }

    if ((code === 'KeyC' || lowerKey === 'c') && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      const hotkeySettings = settings || readSettings();
      return hotkeySettings.clearEnabled ? 'clear_ctrl_c' : null;
    }

    return null;
  }

  function swallowEvent(event) {
    try {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    } catch {}
  }

  function handleKeyDown(event) {
    const action = getHotkeyAction(event);
    const interlockActive = isComposerInterlockActive();
    if (!action && !interlockActive) return;

    const editableTarget = isEditableInComposer(event?.target);
    if (!editableTarget) return;
    const sourceEditor = action ? resolveComposerEditorFromTarget(event?.target) : null;
    const sourceDomText = action === 'queue_tab' ? readComposerText(sourceEditor) : '';
    const sourceText =
      action === 'queue_tab'
        ? pickBestComposerText(
            [
              sourceDomText,
              readCachedComposerText(sourceEditor, { baseText: sourceDomText })
            ],
            sourceDomText
          )
        : '';
    setLastHotkeyDebug({
      key: String(event?.key || ''),
      code: String(event?.code || ''),
      action: String(action || ''),
      editableTarget,
      targetTag: String(event?.target?.tagName || ''),
      sourceTag: String(sourceEditor?.tagName || ''),
      sourceText
    });
    if (
      shouldBlockComposerKeydownDuringInterlock({
        interlockActive,
        isEditableTarget: editableTarget,
        hotkeyAction: action,
        key: event?.key,
        code: event?.code
      })
    ) {
      swallowEvent(event);
      markQueueActivity();
      maybeWarnComposerInterlock();
      refreshPreview();
      return;
    }
    if (!action) return;

    swallowEvent(event);

    if (action === 'queue_tab') {
      void queueCurrentComposerDraft({
        sourceEditor,
        sourceText
      });
      return;
    }
    if (action === 'edit_last_queued') {
      const item = popLastQueuedDraft();
      if (item) restoreQueuedDraftToComposer(item);
      return;
    }
    if (action === 'clear_ctrl_c') {
      void clearComposerByShortcut();
      return;
    }
    if (action === 'suppress_shift_tab') {
      return;
    }
  }

  function handleBridgeEvents(event) {
    const msg = readBridgeMessage(event, new Set([BRIDGE_TAB_QUEUE_ACK_HIGHLIGHT]));
    if (!msg) return;
    clearQueuedHighlightsByRef({
      msgId: String(msg.msgId || '').trim(),
      key: String(msg.key || '').trim()
    });
  }

  function installHubConsumer() {
    const consumerBase = window.__aichat_chatgpt_fetch_consumer_base_v1__;
    const hub = window.__aichat_chatgpt_fetch_hub_v1__;
    const registerConsumer =
      consumerBase && typeof consumerBase.registerConsumer === 'function'
        ? (key, handlers) => consumerBase.registerConsumer(key, handlers)
        : hub && typeof hub.register === 'function'
          ? (_key, handlers) => hub.register(handlers)
          : null;
    if (!registerConsumer) return false;

    const handle = registerConsumer(CONSUMER_KEY, {
      priority: 260,
      beforeFetch: (ctx) => {
        try {
          const url = String(ctx?.url || '');
          const method = String(ctx?.method || '').toUpperCase();
          if (method !== 'POST') return;
          const isSteerTurn = isSteerTurnUrl(url);
          const isConversationRequest = isConversationRequestUrl(url);
          if (!isSteerTurn && !isConversationRequest) return;
          if (isManualSendInterlockActive()) {
            promoteManualSendInterlockToPendingGate({
              sawGenerating: isGeneratingNow()
            });
          }
          if (isSteerTurn) state.steerTurnStartSeq += 1;
          markCurrentConversationStreamStatus('IS_STREAMING', isSteerTurn ? 'fetch-hub-steer-turn' : 'fetch-hub-conversation');
          refreshReplyRenderSampling();
          markQueueActivity();
        } catch {}
      },
      onConversationStart: (ctx) => {
        try {
          const id = String(ctx?.id || '');
          if (!id) return;
          if (isManualSendInterlockActive()) {
            promoteManualSendInterlockToPendingGate({
              sawGenerating: isGeneratingNow()
            });
          }
          state.conversationStartSeq += 1;
          state.activeRequests.set(id, {
            id,
            startedAt: Number(ctx?.startedAt) || now()
          });
          refreshReplyRenderSampling();
          markQueueActivity();
          clearAwaitingConversationStart();
        } catch {}
      },
      onConversationDone: (ctx) => {
        try {
          const id = String(ctx?.id || '');
          if (id) state.activeRequests.delete(id);
          if (state.activeRequests.size <= 0) {
            markCurrentConversationStreamStatus('DONE', 'fetch-hub-conversation-done');
          }
          if (isManualSendInterlockActive()) {
            promoteManualSendInterlockToPendingGate({
              sawGenerating: isGeneratingNow(),
              transportDone: true
            });
          }
          refreshReplyRenderSampling();
          markQueueActivity();
          clearAwaitingConversationStart();
          setTimeout(() => {
            resolvePendingHighlights();
            if (state.pendingSendGate) {
              state.pendingSendGate.transportDone = true;
              void maybeReleasePendingSendGate();
              return;
            }
            scheduleMaybeProcessQueue();
          }, CONFIG.sendCooldownMs);
        } catch {}
      }
    });

    if (typeof handle === 'function') {
      state.hubUnsub = handle;
      return true;
    }
    if (handle && typeof handle.dispose === 'function') {
      state.hubUnsub = () => {
        try {
          handle.dispose();
        } catch {}
      };
      return true;
    }
    return false;
  }

  function installRouteAndTurnWatchers() {
    const core = getCore();
    if (!core) return;
    if (typeof core.onTurnsChange === 'function') {
      state.turnsUnsub = core.onTurnsChange(() => {
        handleTurnsChange();
      });
    }
    if (typeof core.onRouteChange === 'function') {
      state.routeUnsub = core.onRouteChange(() => {
        setTimeout(() => {
          clearConversationStreamStatusCache();
          ensureGeneratingBootstrap();
          handleTurnsChange();
          void maybeReleasePendingSendGate();
          scheduleMaybeProcessQueue(0);
        }, 120);
      });
    }
  }

  function ensureUi() {
    refreshPreview();
    syncHighlightedTurnsToDom();
    ensureGeneratingBootstrap();
    refreshReplyRenderSampling();
  }

  function dispose(reason = 'dispose') {
    void reason;
    if (state.disposed) return;
    state.disposed = true;
    clearAwaitingConversationStart();
    stopPreviewRepairLoop();
    clearProcessQueueTimer();
    clearComposerMirrorSyncTimer();
    clearComposerTextCache();
    clearPendingSendGate();
    clearManualSendWarmup({ scheduleQueue: false });
    clearManualSendInterlock({ scheduleQueue: false });
    clearComposerInterlock();
    clearConversationStreamStatusCache();
    clearReplyRenderTimer();
    detachGeneratingObserver();
    try {
      state.turnsUnsub?.();
    } catch {}
    try {
      state.routeUnsub?.();
    } catch {}
    try {
      state.hubUnsub?.();
    } catch {}
    try {
      window.removeEventListener('keydown', handleKeyDown, true);
    } catch {}
    try {
      window.removeEventListener('pointerdown', handleManualSendPointerDown, true);
    } catch {}
    try {
      window.removeEventListener('click', handleManualSendClick, true);
    } catch {}
    try {
      window.removeEventListener('submit', handleManualSendSubmit, true);
    } catch {}
    try {
      window.removeEventListener('beforeinput', handleComposerBeforeInput, true);
    } catch {}
    try {
      window.removeEventListener('input', handleComposerInput, true);
    } catch {}
    if (state.messageListener) {
      try {
        window.removeEventListener('message', state.messageListener, true);
      } catch {}
    }
    try {
      for (const turn of getTurnArticles()) {
        turn?.removeAttribute?.(TAB_QUEUE_ATTR);
        turn?.removeAttribute?.(TAB_QUEUE_MSG_ID_ATTR);
        turn?.removeAttribute?.(TAB_QUEUE_KEY_ATTR);
      }
    } catch {}
    try {
      state.ui.previewEl?.remove?.();
    } catch {}
    try {
      state.ui.toastWrap?.remove?.();
    } catch {}
  }

  function install() {
    if (!installHubConsumer()) return false;
    installRouteAndTurnWatchers();
    state.messageListener = handleBridgeEvents;
    state.keydownListener = handleKeyDown;
    state.pointerdownListener = handleManualSendPointerDown;
    state.clickListener = handleManualSendClick;
    state.submitListener = handleManualSendSubmit;
    state.beforeInputListener = handleComposerBeforeInput;
    state.inputListener = handleComposerInput;
    window.addEventListener('message', handleBridgeEvents, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('pointerdown', handleManualSendPointerDown, true);
    window.addEventListener('click', handleManualSendClick, true);
    window.addEventListener('submit', handleManualSendSubmit, true);
    window.addEventListener('beforeinput', handleComposerBeforeInput, true);
    window.addEventListener('input', handleComposerInput, true);
    ensureUi();
    return true;
  }

  const debugApi = Object.freeze({
    getState() {
      return {
        queue: state.queue.map((item) => ({
          id: item.id,
          text: item.text,
          conversationId: item.conversationId,
          createdAt: item.createdAt,
          queuePoolHold: item.queuePoolHold
            ? {
                reason: item.queuePoolHold.reason,
                restoredFromId: item.queuePoolHold.restoredFromId,
                restoredAt: item.queuePoolHold.restoredAt,
                armedAt: item.queuePoolHold.armedAt,
                active: isQueuePoolHoldActive(item),
                retryDelayMs: getQueuePoolHoldRetryDelay(item)
              }
            : null
        })),
        activeRequestIds: Array.from(state.activeRequests.keys()),
        pendingHighlightCandidates: state.pendingHighlightCandidates.map((item) => ({
          queuedId: item.queuedId,
          beforeCount: item.beforeCount,
          beforeLastKey: item.beforeLastKey,
          resolvedMsgId: item.resolvedMsgId,
          resolvedKey: item.resolvedKey
        })),
        highlightedMsgIds: Array.from(state.highlightedMsgIds),
        highlightedKeys: Array.from(state.highlightedKeys),
        settings: readSettings(),
        conversationId: getConversationBindingId(),
        conversationStartSeq: state.conversationStartSeq,
        steerTurnStartSeq: state.steerTurnStartSeq,
        awaitingConversationStart: state.awaitingConversationStart,
        manualSendWarmup: isManualSendWarmupActive()
          ? {
              until: state.manualSendWarmupUntil,
              remainingMs: Math.max(0, Number(state.manualSendWarmupUntil || 0) - now())
            }
          : null,
        manualSendInterlock: state.manualSendInterlock
          ? {
              armedAt: state.manualSendInterlock.armedAt,
              composerText: state.manualSendInterlock.composerText
            }
          : null,
        restoredQueuedDraft: state.restoredQueuedDraft
          ? {
              id: state.restoredQueuedDraft.id,
              text: state.restoredQueuedDraft.text,
              conversationId: state.restoredQueuedDraft.conversationId,
              restoredAt: state.restoredQueuedDraft.restoredAt,
              activeResponseAtRestore: state.restoredQueuedDraft.activeResponseAtRestore
            }
          : null,
        isGenerating: isGeneratingNow(),
        processQueueBusy: state.processQueueBusy,
        composerInterlock: state.composerInterlock
          ? {
              queuedId: state.composerInterlock.queuedId,
              queuedText: state.composerInterlock.queuedText,
              armedAt: state.composerInterlock.armedAt
            }
          : null,
        replyRender: {
          key: state.replyRender.key,
          changedAt: state.replyRender.changedAt,
          waitMs: getLiveReplyRenderWaitMs()
        },
        streamStatus: {
          conversationId: state.streamStatus.conversationId,
          value: state.streamStatus.value,
          checkedAt: state.streamStatus.checkedAt,
          source: state.streamStatus.source,
          pending: false
        },
        composerTextCache: {
          text: state.composerTextCache.text,
          updatedAt: state.composerTextCache.updatedAt,
          ageMs: state.composerTextCache.updatedAt ? Math.max(0, now() - state.composerTextCache.updatedAt) : 0,
          hasEditor: !!state.composerTextCache.editor,
          editorConnected: state.composerTextCache.editor ? state.composerTextCache.editor.isConnected !== false : false
        },
        lastHotkey: state.debug.lastHotkey,
        lastQueueAttempt: state.debug.lastQueueAttempt,
        pendingSendGate: state.pendingSendGate
          ? {
              queuedId: state.pendingSendGate.queuedId,
              sentAt: state.pendingSendGate.sentAt,
              transportDone: state.pendingSendGate.transportDone,
              sawGenerating: state.pendingSendGate.sawGenerating,
              beforeAssistantCount: state.pendingSendGate.beforeAssistantCount || 0,
              streamStatus: state.pendingSendGate.streamStatus || '',
              streamStatusCheckedAt: state.pendingSendGate.streamStatusCheckedAt || 0
            }
          : null
      };
    },
    queueDraft(text) {
      const item = enqueueDraft(String(text || ''));
      void maybeProcessQueue();
      return item?.id || '';
    },
    maybeProcessQueue,
    clearHighlight(ref) {
      clearQueuedHighlightsByRef(ref || {});
    },
    resolvePendingHighlights
  });

  try {
    Object.defineProperty(window, DEBUG_KEY, {
      value: debugApi,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      window[DEBUG_KEY] = debugApi;
    } catch {}
  }

  const api = Object.freeze({
    version: 1,
    dispose,
    ensureUi,
    debug: debugApi
  });

  try {
    Object.defineProperty(globalThis, GLOBAL_KEY, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[GLOBAL_KEY] = api;
    } catch {}
  }

  if (IS_TEST_ENV) {
    module.exports = {
      canUseImmediateComposerSend,
      canUseHomeImmediateButtonSubmit,
      canReleasePendingGateOnVisualSettle,
      didQueuedSendStart,
      getHotkeyAction,
      getPendingSendGateRetryDelay,
      getPendingSendGateState,
      getReplyRenderSettleWaitMs,
      handleManualSendPointerDown,
      handleManualSendClick,
      handleManualSendSubmit,
      isPendingGateVisuallySettled,
      isComposerMutationInputType,
      isConversationRequestUrl,
      isConversationStreamActiveStatus,
      isLikelyComposerSendButton,
      isManualSendInterlockActive,
      isManualSendWarmupActive,
      isSteerTurnUrl,
      normalizeConversationStreamStatus,
      normalizePreviewText,
      canPreserveQueuedDraftOnClearFailure,
      collectConnectedComposerTexts,
      getElementLabelText,
      hasGeneratingLiveAnnouncement,
      hasActiveAssistantThinkingTurn,
      isGeneratingLiveAnnouncementText,
      isThinkingIndicatorText,
      hasLikelyComposerAttachments,
      getComposerBlockingState,
      resolveComposerEditorFromTarget,
      resolveQueueDraftText,
      removeQueuedDraftFromList,
      shouldSuppressImmediateSendForRestoredDraft,
      shouldHoldRestoredDraftInQueuePool,
      shouldArmManualSendInterlock,
      shouldTreatAssistantThinkingAsGenerating,
      hasText,
      shouldBlockComposerBeforeInput,
      shouldBlockComposerKeydownDuringInterlock,
      shouldUseFullComposerInputPath,
      shouldPauseQueueForComposerDraft,
      shouldRepairQueueProgress
    };
    return;
  }

  if (!install()) {
    try {
      globalThis[GLOBAL_KEY] = Object.freeze({
        version: 1,
        dispose,
        ensureUi
      });
    } catch {}
  }
})();
