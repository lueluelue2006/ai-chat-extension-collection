(() => {
  'use strict';

  let registry = null;
  let injections = null;
  let sharedConfigLoaded = false;

  try {
    importScripts('../shared/registry.js', '../shared/injections.js');
    registry = globalThis.QUICKNAV_REGISTRY || null;
    injections = globalThis.QUICKNAV_INJECTIONS || null;
    sharedConfigLoaded =
      !!registry &&
      !!injections &&
      typeof injections.buildDefaultSettings === 'function' &&
      typeof injections.buildContentScriptDefs === 'function';
  } catch {}

  try {
    importScripts(
      './sw/chrome.js',
      './sw/storage.js',
      './sw/registration.js',
      './sw/monitors.js',
      './sw/reset.js',
      './sw/router.js'
    );
  } catch {}

  try {
    const ns = globalThis.__quicknavSw;
    if (!ns || !ns.storage || !ns.router) return;

    ns.storage.initConfig({ registry, injections, sharedConfigLoaded });
    ns.router.init();
  } catch {}
})();
