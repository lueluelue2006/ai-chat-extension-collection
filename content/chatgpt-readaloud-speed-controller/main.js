(() => {
  'use strict';

  const GUARD_KEY = '__aichat_chatgpt_readaloud_speed_controller_v1__';
  if (globalThis[GUARD_KEY]) return;
  Object.defineProperty(globalThis, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  const STORAGE_KEY = 'aichat_chatgpt_readaloud_speed_v1';
  const DEFAULT_SPEED = 1.8;
  const MIN_SPEED = 0.01;
  const MAX_SPEED = 100;

  const state = {
    speed: DEFAULT_SPEED,
    storageArea: null,
    storageAreaName: 'sync',
    playingAudio: new Set()
  };

  function clampSpeed(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_SPEED;
    return Math.max(MIN_SPEED, Math.min(MAX_SPEED, n));
  }

  function setPreservePitch(audio) {
    try {
      audio.preservesPitch = true;
    } catch {}
    try {
      audio.mozPreservesPitch = true;
    } catch {}
    try {
      audio.webkitPreservesPitch = true;
    } catch {}
  }

  function applySpeedToAudio(audio) {
    if (!(audio instanceof HTMLAudioElement)) return;
    try {
      audio.playbackRate = state.speed;
    } catch {}
    setPreservePitch(audio);
  }

  function applySpeedToAllAudios() {
    try {
      for (const audio of document.querySelectorAll('audio')) applySpeedToAudio(audio);
    } catch {
      // ignore
    }
  }

  function applySpeedToPlaying() {
    for (const audio of Array.from(state.playingAudio)) {
      if (!(audio instanceof HTMLAudioElement)) {
        state.playingAudio.delete(audio);
        continue;
      }
      if (audio.paused) continue;
      applySpeedToAudio(audio);
    }
  }

  function setupAudioListeners() {
    document.addEventListener(
      'play',
      (e) => {
        const audio = e.target;
        if (!(audio instanceof HTMLAudioElement)) return;
        applySpeedToAudio(audio);
        state.playingAudio.add(audio);
        const cleanup = () => state.playingAudio.delete(audio);
        audio.addEventListener('pause', cleanup, { once: true });
        audio.addEventListener('ended', cleanup, { once: true });
      },
      true
    );

    document.addEventListener(
      'ratechange',
      (e) => {
        const audio = e.target;
        if (!(audio instanceof HTMLAudioElement)) return;
        if (Math.abs((audio.playbackRate || 1) - state.speed) <= 0.01) return;
        applySpeedToAudio(audio);
      },
      true
    );
  }

  function setupAudioObserver() {
    // Avoid a global subtree MutationObserver (very noisy on ChatGPT).
    // `play`/`ratechange` listeners already cover the hot path; keep a tiny poller as fallback.
    try {
      if (document.querySelector('audio')) return;
    } catch {}

    let tries = 0;
    const MAX_TRIES = 30; // ~60s
    const INTERVAL_MS = 2000;
    const timer = setInterval(() => {
      tries += 1;
      try {
        if (document.querySelector('audio')) {
          applySpeedToAllAudios();
          clearInterval(timer);
          return;
        }
      } catch {}
      if (tries >= MAX_TRIES) {
        try { clearInterval(timer); } catch {}
      }
    }, INTERVAL_MS);
  }

  function initStorage() {
    const storage = chrome?.storage;
    const canUse = (area) => !!(area && typeof area.get === 'function' && typeof area.set === 'function');
    const preferSync = canUse(storage?.sync);
    state.storageArea = preferSync ? storage.sync : canUse(storage?.local) ? storage.local : null;
    state.storageAreaName = preferSync ? 'sync' : 'local';
  }

  function loadSpeed() {
    return new Promise((resolve) => {
      const area = state.storageArea;
      if (!area) return resolve(DEFAULT_SPEED);
      try {
        area.get({ [STORAGE_KEY]: DEFAULT_SPEED }, (res) => {
          resolve(clampSpeed(res?.[STORAGE_KEY]));
        });
      } catch {
        resolve(DEFAULT_SPEED);
      }
    });
  }

  function applySpeed(value) {
    state.speed = clampSpeed(value);
    applySpeedToPlaying();
    applySpeedToAllAudios();
  }

  async function init() {
    initStorage();
    setupAudioListeners();
    setupAudioObserver();

    applySpeed(await loadSpeed());

    try {
      chrome?.storage?.onChanged?.addListener?.((changes, areaName) => {
        if (areaName !== state.storageAreaName) return;
        if (!changes?.[STORAGE_KEY]) return;
        applySpeed(changes[STORAGE_KEY].newValue);
      });
    } catch {
      // ignore
    }
  }

  init();
})();
