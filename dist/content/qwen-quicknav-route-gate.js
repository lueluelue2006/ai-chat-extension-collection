(() => {
  'use strict';

  const API_KEY = '__quicknavQwenRouteGate';

  try {
    const existing = globalThis[API_KEY];
    if (existing && typeof existing === 'object') {
      if (typeof module === 'object' && module && module.exports) module.exports = existing;
      return;
    }
  } catch {}

  const DEFAULT_CONFIG = Object.freeze({
    STABLE_MS: 220,
    MIN_STABLE_SAMPLES: 2,
    HARD_TIMEOUT_MS: 5_000
  });

  function asMs(value, fallback) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
    return fallback;
  }

  function asNowMs(value) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    return 0;
  }

  function asText(value) {
    return String(value == null ? '' : value).trim();
  }

  function createQwenQuicknavRouteGateController(options = {}) {
    const config = Object.freeze({
      STABLE_MS: asMs(options.STABLE_MS, DEFAULT_CONFIG.STABLE_MS),
      MIN_STABLE_SAMPLES: Math.max(1, Math.floor(asMs(options.MIN_STABLE_SAMPLES, DEFAULT_CONFIG.MIN_STABLE_SAMPLES))),
      HARD_TIMEOUT_MS: asMs(options.HARD_TIMEOUT_MS, DEFAULT_CONFIG.HARD_TIMEOUT_MS)
    });

    const state = {
      routeVersion: 0,
      href: '',
      reason: '',
      pending: false,
      ready: true,
      startedAtMs: -1,
      timeoutAtMs: -1,
      readyReason: 'initial',
      readyAtMs: 0,
      candidateFingerprint: '',
      candidateSinceMs: -1,
      candidateSamples: 0
    };

    function resetCandidate() {
      state.candidateFingerprint = '';
      state.candidateSinceMs = -1;
      state.candidateSamples = 0;
    }

    function markReady(reason, nowMs) {
      state.pending = false;
      state.ready = true;
      state.readyReason = asText(reason) || 'ready';
      state.readyAtMs = nowMs;
      resetCandidate();
    }

    function maybeTimeout(nowMs) {
      if (!state.pending) return false;
      if (state.timeoutAtMs >= 0 && nowMs >= state.timeoutAtMs) {
        markReady('timeout', nowMs);
        return true;
      }
      return false;
    }

    function onRouteChange(payload = {}) {
      const href = asText(payload.href);
      const reason = asText(payload.reason);
      const nowMs = asNowMs(payload.nowMs);

      state.routeVersion += 1;
      state.href = href;
      state.reason = reason;
      state.pending = true;
      state.ready = false;
      state.startedAtMs = nowMs;
      state.timeoutAtMs = nowMs + config.HARD_TIMEOUT_MS;
      state.readyReason = '';
      state.readyAtMs = -1;
      resetCandidate();

      return state.routeVersion;
    }

    function onFingerprintSample(payload = {}) {
      const nowMs = asNowMs(payload.nowMs);
      const routeVersion = Number(payload.routeVersion);

      if (!state.pending) return state.ready;
      if (Number.isFinite(routeVersion) && routeVersion !== state.routeVersion) return state.ready;
      if (maybeTimeout(nowMs)) return state.ready;

      const fingerprint = asText(payload.fingerprint);
      if (!fingerprint) {
        resetCandidate();
        return state.ready;
      }

      if (fingerprint !== state.candidateFingerprint) {
        state.candidateFingerprint = fingerprint;
        state.candidateSinceMs = nowMs;
        state.candidateSamples = 1;
        return state.ready;
      }

      state.candidateSamples += 1;
      const stableMs = nowMs - state.candidateSinceMs;
      if (state.candidateSamples >= config.MIN_STABLE_SAMPLES && stableMs >= config.STABLE_MS) {
        markReady('stable-fingerprint', nowMs);
      }

      return state.ready;
    }

    function shouldKeepOld(nowMs) {
      maybeTimeout(asNowMs(nowMs));
      return state.pending;
    }

    function isPending(nowMs) {
      if (arguments.length > 0) maybeTimeout(asNowMs(nowMs));
      return state.pending;
    }

    function isReady(nowMs) {
      if (arguments.length > 0) maybeTimeout(asNowMs(nowMs));
      return state.ready;
    }

    function getState(nowMs) {
      if (arguments.length > 0) maybeTimeout(asNowMs(nowMs));
      return Object.freeze({
        routeVersion: state.routeVersion,
        href: state.href,
        reason: state.reason,
        pending: state.pending,
        ready: state.ready,
        startedAtMs: state.startedAtMs,
        timeoutAtMs: state.timeoutAtMs,
        readyReason: state.readyReason,
        readyAtMs: state.readyAtMs,
        candidateFingerprint: state.candidateFingerprint,
        candidateSinceMs: state.candidateSinceMs,
        candidateSamples: state.candidateSamples
      });
    }

    return Object.freeze({
      config,
      onRouteChange,
      onFingerprintSample,
      shouldKeepOld,
      isPending,
      isReady,
      getState
    });
  }

  const api = Object.freeze({
    DEFAULT_CONFIG,
    createQwenQuicknavRouteGateController
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
