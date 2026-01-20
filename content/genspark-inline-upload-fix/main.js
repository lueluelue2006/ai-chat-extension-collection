// ==UserScript==
// @name         Genspark Inline Upload Fix
// @namespace    https://github.com/lueluelue2006
// @version      0.2.0
// @description  Fix attachment upload in Genspark inline message edit (pencil): Cmd+V paste image/file, paperclip opens file chooser.
// @match        https://www.genspark.ai/agents*
// @run-at       document-idle
// @author       schweigen
// @license      MIT
// @grant        none
// ==/UserScript==
(() => {
  'use strict';

  const VERSION = '0.2.0';
  const GLOBAL_KEY = '__gensparkInlineUploadFix';
  const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';

  const now = () => Date.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const LOG_PREFIX = '[Genspark Inline Upload Fix]';
  const log = (...args) => console.log(LOG_PREFIX, ...args);
  const warn = (...args) => console.warn(LOG_PREFIX, ...args);
  const error = (...args) => console.error(LOG_PREFIX, ...args);

  const uninstallPrev = () => {
    const prev = window[GLOBAL_KEY];
    if (prev && typeof prev.uninstall === 'function') {
      try {
        prev.uninstall();
      } catch {}
    }
    // Best-effort cleanup for older GUI-based variants.
    const legacyBadge = document.getElementById('codex-genspark-upload-badge');
    if (legacyBadge) legacyBadge.remove();
    const legacyPasteBadge = document.getElementById('codex-paste-upload-badge');
    if (legacyPasteBadge) legacyPasteBadge.remove();
  };

  uninstallPrev();

  const state = {
    installed: true,
    version: VERSION,
    installedAt: now(),
    lastPasteAt: null,
    lastPasteNonce: null,
    lastAttachClickAt: null,
    lastUploadAt: null,
    lastStatus: null,
    lastError: null,
    lastClipboard: null,
    listeners: [],
    uploadChain: Promise.resolve(),
    chooserOpen: false,
    recentUploads: new Map(),
  };

  const formatBytes = (n) => {
    if (!Number.isFinite(n)) return String(n);
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    const rounded = i === 0 ? String(v) : v.toFixed(v >= 10 ? 1 : 2);
    return `${rounded} ${units[i]}`;
  };

  const setStatus = (msg, kind = 'info') => {
    state.lastStatus = msg;
    if (kind === 'error') state.lastError = msg;
    if (kind === 'error') error(msg);
    else if (kind === 'warn') warn(msg);
    else log(msg);
  };

  const appendLog = (line) => {
    log(line);
  };

  const isElementVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  };

  const getActiveMessageEditor = () => {
    const ae = document.activeElement;
    if (ae && ae.closest) {
      const modal = ae.closest('.message-editor');
      if (modal && isElementVisible(modal)) return modal;
    }

    const modals = Array.from(document.querySelectorAll('.message-editor'))
      .filter(isElementVisible)
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      });

    return modals[0] || null;
  };

  const findAttachButtonInModal = (modal) => {
    if (!modal) return null;

    // Prefer known paperclip path head (may change with site updates).
    const byPath = (() => {
      const svg = Array.from(modal.querySelectorAll('svg')).find((s) => {
        const d = s.querySelector('path')?.getAttribute('d') || '';
        return d.startsWith('M8.3335 5.23777') || (d.includes('13.1743') && d.includes('15.158'));
      });
      return svg?.closest('button,[role="button"],div') || null;
    })();
    if (byPath) return byPath;

    // Fallback: choose the left-most clickable svg button in the top area of the modal.
    const modalRect = modal.getBoundingClientRect();
    const candidates = Array.from(modal.querySelectorAll('button,[role="button"],div'))
      .filter((el) => {
        if (!el.querySelector) return false;
        if (!el.querySelector('svg')) return false;
        const txt = (el.textContent || '').trim();
        if (txt === 'Save' || txt === 'Cancel') return false;
        const r = el.getBoundingClientRect();
        if (r.top > modalRect.top + 120) return false;
        const cs = window.getComputedStyle(el);
        return cs.cursor === 'pointer' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
      })
      .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

    return candidates[0] || null;
  };

  const captureUploaderInput = async (attachBtn) => {
    if (!attachBtn) return null;

    const before = new Set(Array.from(document.querySelectorAll('input[type=file]')));
    let captured = null;

    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function (...args) {
      if (this && this.type === 'file') {
        captured = this;
        return;
      }
      return origClick.apply(this, args);
    };

    try {
      attachBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } finally {
      HTMLInputElement.prototype.click = origClick;
    }

    await sleep(50);

    if (captured) return captured;

    const after = Array.from(document.querySelectorAll('input[type=file]'));
    const added = after.filter((i) => !before.has(i));
    const best = added.reverse().find((i) => (i.accept || '').includes('image') || i.multiple === true);
    return best || added[0] || null;
  };

  const dispatchFilesToInput = (input, files) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const dedupeFiles = (files) => {
    const nowTs = now();
    const uniq = [];
    for (const f of files) {
      const sig = `${f.type || ''}|${f.size}|${f.name || ''}`;
      const last = state.recentUploads.get(sig);
      if (last && nowTs - last < 1500) continue;
      state.recentUploads.set(sig, nowTs);
      uniq.push(f);
    }
    for (const [sig, ts] of Array.from(state.recentUploads.entries())) {
      if (nowTs - ts > 10_000) state.recentUploads.delete(sig);
    }
    return uniq;
  };

  const queueUpload = (files, source) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    state.uploadChain = state.uploadChain
      .then(async () => {
        state.lastUploadAt = now();
        const modal = getActiveMessageEditor();
        if (!modal) {
          setStatus('No active message editor found. Click the pencil edit first.', 'error');
          appendLog(`[${new Date().toLocaleTimeString()}] no modal`);
          return;
        }

        const attachBtn = findAttachButtonInModal(modal);
        if (!attachBtn) {
          setStatus('Attach (paperclip) button not found in editor.', 'error');
          appendLog(`[${new Date().toLocaleTimeString()}] no attach button`);
          return;
        }

        setStatus(`Uploading via ${source}… (${list.length} file(s))`);
        appendLog(
          `[${new Date().toLocaleTimeString()}] ${source}: ${list
            .map((f) => `${f.name || '(no name)'} (${f.type || 'unknown'}, ${formatBytes(f.size)})`)
            .join(', ')}`
        );

        const input = await captureUploaderInput(attachBtn);
        if (!input) {
          setStatus('Could not capture Genspark uploader input.', 'error');
          appendLog(`[${new Date().toLocaleTimeString()}] no uploader input`);
          return;
        }

        dispatchFilesToInput(input, list);
        setStatus(`Sent ${list.length} file(s) to Genspark`);
      })
      .catch((e) => {
        const msg = e?.message ? String(e.message) : String(e);
        setStatus(`Upload failed: ${msg}`, 'error');
        appendLog(`[${new Date().toLocaleTimeString()}] error: ${msg}`);
      });
  };

  const onPasteCapture = (e) => {
    const modal = getActiveMessageEditor();
    if (!modal) return;
    if (e.defaultPrevented) return;

    const dt = e.clipboardData;
    if (!dt) return;

    const files = Array.from(dt.items || [])
      .filter((it) => it && it.kind === 'file')
      .map((it) => it.getAsFile())
      .filter(Boolean);

    if (!files.length) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

    const nonce = `${Math.round(e.timeStamp)}:${files.length}:${files.map((f) => f.size).join(',')}`;
    const ts = now();
    if (state.lastPasteNonce === nonce && state.lastPasteAt && ts - state.lastPasteAt < 300) {
      setStatus('Skipped duplicate paste event');
      return;
    }

    state.lastPasteAt = ts;
    state.lastPasteNonce = nonce;
    state.lastClipboard = {
      types: Array.from(dt.types || []),
      files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    };

    const uniqueFiles = dedupeFiles(files);
    if (!uniqueFiles.length) {
      setStatus('Skipped duplicate file(s)');
      return;
    }

    queueUpload(uniqueFiles, 'paste');
  };

  const uploadClipboardImage = async () => {
    state.lastClipboard = null;
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      setStatus('navigator.clipboard.read() not available in this browser.', 'error');
      return;
    }

    setStatus('Reading clipboard…');

    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        const imgType = (item.types || []).find((t) => t.startsWith('image/'));
        if (!imgType) continue;
        const blob = await item.getType(imgType);
        const ext = imgType.split('/')[1] || 'png';
        files.push(new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imgType }));
      }

      if (!files.length) {
        setStatus('No image found in clipboard.', 'error');
        return;
      }

      state.lastClipboard = {
        types: items.flatMap((i) => i.types || []),
        files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      };
      queueUpload(dedupeFiles(files), 'clipboard.read');
    } catch (e) {
      const msg = e?.message ? String(e.message) : String(e);
      setStatus(`Clipboard read failed: ${msg}. (Allow clipboard permission in Chrome)`, 'error');
    }
  };

  const uploadFileChooser = async () => {
    if (state.chooserOpen) return;
    state.chooserOpen = true;

    try {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = ACCEPT;
      picker.multiple = true;
      picker.style.position = 'fixed';
      picker.style.left = '-9999px';
      picker.style.top = '-9999px';
      document.body.appendChild(picker);

      picker.addEventListener(
        'change',
        () => {
          const files = Array.from(picker.files || []);
          picker.remove();
          state.chooserOpen = false;
          if (!files.length) return;
          queueUpload(dedupeFiles(files), 'file picker');
        },
        { once: true }
      );

      picker.click();
    } catch (e) {
      state.chooserOpen = false;
      const msg = e?.message ? String(e.message) : String(e);
      setStatus(`File picker failed: ${msg}`, 'error');
    }
  };

  const onClickCapture = (e) => {
    if (!e.isTrusted) return;
    const modal = getActiveMessageEditor();
    if (!modal) return;

    const attachBtn = findAttachButtonInModal(modal);
    if (!attachBtn) return;

    if (attachBtn.contains(e.target)) {
      state.lastAttachClickAt = now();
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      uploadFileChooser();
    }
  };

  const addListener = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    state.listeners.push({ target, type, fn, options });
  };

  const uninstall = () => {
    for (const l of state.listeners) {
      try {
        l.target.removeEventListener(l.type, l.fn, l.options);
      } catch {}
    }
    state.listeners = [];
    state.installed = false;
    try {
      delete window[GLOBAL_KEY];
    } catch {
      window[GLOBAL_KEY] = undefined;
    }
    // eslint-disable-next-line no-console
    log('Uninstalled');
  };

  const diag = () => ({
    version: VERSION,
    url: location.href,
    lastStatus: state.lastStatus,
    lastError: state.lastError,
    lastPasteAt: state.lastPasteAt,
    lastAttachClickAt: state.lastAttachClickAt,
    lastUploadAt: state.lastUploadAt,
    lastClipboard: state.lastClipboard,
    userActivation: {
      isActive: !!(navigator.userActivation && navigator.userActivation.isActive),
      hasBeenActive: !!(navigator.userActivation && navigator.userActivation.hasBeenActive),
    },
    hasMessageEditor: !!getActiveMessageEditor(),
  });

  const api = {
    installed: true,
    version: VERSION,
    installedAt: state.installedAt,
    uninstall,
    diag,
    uploadClipboardImage,
    uploadFileChooser,
    get lastStatus() {
      return state.lastStatus;
    },
    get lastError() {
      return state.lastError;
    },
  };

  // Window capture runs before document-level listeners, helping avoid duplicate uploads.
  addListener(window, 'paste', onPasteCapture, true);
  addListener(window, 'click', onClickCapture, true);

  setStatus('Installed. Use: pencil → click edit box → Cmd+V. Paperclip opens file chooser.');
  log('Ready.');

  window[GLOBAL_KEY] = api;

  // Optional console helper
  try {
    window.__gensparkInlineUploadFixDiag = () => api.diag();
  } catch {}
})();
