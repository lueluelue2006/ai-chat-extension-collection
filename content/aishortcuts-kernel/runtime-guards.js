(function () {
  'use strict';

  const KERNEL_KEY = '__aichat_quicknav_kernel_v1__';

  function getKernelRoot() {
    let root = null;
    try {
      root = globalThis[KERNEL_KEY];
    } catch {}
    if (root && typeof root === 'object') return root;
    root = {};
    try {
      Object.defineProperty(globalThis, KERNEL_KEY, {
        value: root,
        configurable: true,
        enumerable: false,
        writable: true
      });
      return root;
    } catch {}
    try {
      globalThis[KERNEL_KEY] = root;
    } catch {}
    return root;
  }

  const kernel = getKernelRoot();
  if (kernel && kernel.runtimeGuards && Number(kernel.runtimeGuards.version || 0) >= 1) return;

  function readCompatBoolFlag(primaryKey, legacyKey, target = globalThis) {
    const primary = String(primaryKey || '');
    const legacy = String(legacyKey || '');
    if (!primary && !legacy) return false;
    try {
      return !!((primary ? target[primary] : false) || (legacy ? target[legacy] : false));
    } catch {
      return false;
    }
  }

  function writeCompatBoolFlag(primaryKey, legacyKey, value, target = globalThis) {
    const primary = String(primaryKey || '');
    const legacy = String(legacyKey || '');
    const normalized = !!value;
    try {
      if (primary) target[primary] = normalized;
    } catch {}
    try {
      if (legacy) target[legacy] = normalized;
    } catch {}
    return normalized;
  }

  function ensureSentinel(primaryKey, legacyKey, target = globalThis) {
    if (readCompatBoolFlag(primaryKey, legacyKey, target)) return false;
    writeCompatBoolFlag(primaryKey, legacyKey, true, target);
    return true;
  }

  const api = Object.freeze({
    version: 1,
    readCompatBoolFlag,
    writeCompatBoolFlag,
    ensureSentinel
  });

  try {
    kernel.runtimeGuards = api;
  } catch {}
})();
