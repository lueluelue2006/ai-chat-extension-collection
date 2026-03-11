(() => {
  'use strict';

  const API_KEY = '__quicknavQwenActiveLock';

  try {
    const existing = globalThis[API_KEY];
    if (existing && typeof existing === 'object') {
      if (typeof module === 'object' && module && module.exports) module.exports = existing;
      return;
    }
  } catch {}

  const DEFAULT_CONFIG = Object.freeze({
    STREAM_END_STABLE_MS: 220,
    UNLOCK_GRACE_MS: 280,
    MAX_LOCK_MS: 15_000
  });

  function asMs(value, fallback) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
    return fallback;
  }

  function asNowMs(nowMs) {
    const n = Number(nowMs);
    if (Number.isFinite(n)) return n;
    return 0;
  }

  function asId(value) {
    return String(value == null ? '' : value).trim();
  }

  function createQwenQuicknavActiveLockController(options = {}) {
    const config = Object.freeze({
      STREAM_END_STABLE_MS: asMs(options.STREAM_END_STABLE_MS, DEFAULT_CONFIG.STREAM_END_STABLE_MS),
      UNLOCK_GRACE_MS: asMs(options.UNLOCK_GRACE_MS, DEFAULT_CONFIG.UNLOCK_GRACE_MS),
      MAX_LOCK_MS: asMs(options.MAX_LOCK_MS, DEFAULT_CONFIG.MAX_LOCK_MS)
    });

    const state = {
      lockedId: '',
      lockedAtMs: -1,
      isStreaming: false,
      streamingStoppedAtMs: -1
    };

    function clearLock() {
      state.lockedId = '';
      state.lockedAtMs = -1;
      state.streamingStoppedAtMs = -1;
    }

    function maybeUnlock(nowMs) {
      if (!state.lockedId) return false;

      if (state.lockedAtMs >= 0 && nowMs - state.lockedAtMs >= config.MAX_LOCK_MS) {
        clearLock();
        return true;
      }

      if (!state.isStreaming && state.streamingStoppedAtMs >= 0) {
        const unlockAtMs = state.streamingStoppedAtMs + config.STREAM_END_STABLE_MS + config.UNLOCK_GRACE_MS;
        if (nowMs >= unlockAtMs) {
          clearLock();
          return true;
        }
      }

      return false;
    }

    function lock(turnId, nowMs) {
      const id = asId(turnId);
      if (!id) return '';

      const t = asNowMs(nowMs);
      state.lockedId = id;
      state.lockedAtMs = t;
      state.streamingStoppedAtMs = state.isStreaming ? -1 : t;
      return state.lockedId;
    }

    function onStreaming(isStreaming, nowMs) {
      const t = asNowMs(nowMs);
      state.isStreaming = !!isStreaming;

      if (state.isStreaming) {
        state.streamingStoppedAtMs = -1;
      } else if (state.lockedId && state.streamingStoppedAtMs < 0) {
        state.streamingStoppedAtMs = t;
      }

      maybeUnlock(t);
      return !!state.lockedId;
    }

    function onRouteChange(nowMs) {
      asNowMs(nowMs);
      clearLock();
      return false;
    }

    function onLockedIdResolved(exists, nowMs) {
      const t = asNowMs(nowMs);
      if (!exists) {
        clearLock();
        return false;
      }
      maybeUnlock(t);
      return !!state.lockedId;
    }

    function getLockedId(nowMs) {
      const t = asNowMs(nowMs);
      maybeUnlock(t);
      return state.lockedId;
    }

    function isLocked(nowMs) {
      return !!getLockedId(nowMs);
    }

    function shouldAllowAutoActiveUpdate(nowMs) {
      return !isLocked(nowMs);
    }

    return Object.freeze({
      config,
      lock,
      onStreaming,
      onRouteChange,
      onLockedIdResolved,
      getLockedId,
      isLocked,
      shouldAllowAutoActiveUpdate
    });
  }

  const api = Object.freeze({
    DEFAULT_CONFIG,
    createQwenQuicknavActiveLockController
  });

  try {
    Object.defineProperty(globalThis, API_KEY, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }

  if (typeof module === 'object' && module && module.exports) module.exports = api;
})();
