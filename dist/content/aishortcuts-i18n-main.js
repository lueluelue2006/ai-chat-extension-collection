(() => {
  'use strict';

  const STATE_KEY = '__aichat_i18n_main_v1__';
  const prev = (() => {
    try {
      return globalThis[STATE_KEY] || null;
    } catch {
      return null;
    }
  })();
  try {
    prev?.dispose?.();
  } catch {}

  const I18N = (() => {
    try {
      return globalThis.AISHORTCUTS_I18N || null;
    } catch {
      return null;
    }
  })();
  if (!I18N) return;

  const originalAlert = globalThis.alert;
  const originalConfirm = globalThis.confirm;
  const originalPrompt = globalThis.prompt;

  function getLocale() {
    try {
      return String(document.documentElement?.dataset?.aichatLocale || 'en').trim() || 'en';
    } catch {
      return 'en';
    }
  }

  function translate(message) {
    try {
      return I18N.translateText(String(message ?? ''), getLocale());
    } catch {
      return String(message ?? '');
    }
  }

  try {
    globalThis.alert = (message) => originalAlert.call(globalThis, translate(message));
  } catch {}
  try {
    globalThis.confirm = (message) => originalConfirm.call(globalThis, translate(message));
  } catch {}
  try {
    globalThis.prompt = (message, defaultValue) => originalPrompt.call(globalThis, translate(message), defaultValue);
  } catch {}

  function dispose() {
    try {
      globalThis.alert = originalAlert;
    } catch {}
    try {
      globalThis.confirm = originalConfirm;
    } catch {}
    try {
      globalThis.prompt = originalPrompt;
    } catch {}
  }

  try {
    Object.defineProperty(globalThis, STATE_KEY, {
      value: Object.freeze({ dispose, getLocale, translate }),
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[STATE_KEY] = { dispose, getLocale, translate };
    } catch {}
  }
})();
