(() => {
  'use strict';

  const checks = {};
  const nowIso = new Date().toISOString();

  const host = String((location && location.hostname) || '').toLowerCase();
  const hostAllowed = host === 'kimi.com' || host === 'www.kimi.com';
  checks.hostScope = {
    status: hostAllowed ? 'pass' : 'fail',
    details: { host, expected: ['kimi.com', 'www.kimi.com'] }
  };

  const bridge = (() => {
    try {
      return window.__aichat_quicknav_bridge_v1__ || null;
    } catch {
      return null;
    }
  })();
  checks.quicknavBridgeReady = {
    status: bridge && typeof bridge.ensureRouteListener === 'function' && typeof bridge.on === 'function' ? 'pass' : 'fail',
    details: {
      hasBridge: !!bridge,
      hasEnsureRouteListener: !!(bridge && typeof bridge.ensureRouteListener === 'function'),
      hasOn: !!(bridge && typeof bridge.on === 'function')
    }
  };

  let routeMode = 'none';
  let routeValue = null;
  try {
    if (typeof window.__quicknavKimiRouteUnsubV1 === 'function') {
      routeMode = 'bridge-event';
      routeValue = 'function';
    } else if (window.__quicknavKimiRoutePollV1) {
      routeMode = 'poll-fallback';
      routeValue = String(window.__quicknavKimiRoutePollV1);
    }
  } catch {}
  checks.routeWatcherInstalled = {
    status: routeMode === 'none' ? 'fail' : 'pass',
    details: { routeMode, routeValue }
  };

  const panel = document.querySelector('#cgpt-compact-nav');
  checks.quicknavPanelPresent = {
    status: panel ? 'pass' : 'fail',
    details: { selector: '#cgpt-compact-nav' }
  };

  const composer = document.querySelector('.chat-input-editor[contenteditable="true"][role="textbox"]');
  checks.kimiComposerPresent = {
    status: composer ? 'pass' : 'fail',
    details: { selector: '.chat-input-editor[contenteditable="true"][role="textbox"]' }
  };

  let cmdenterInstalled = false;
  try {
    cmdenterInstalled = !!window.__aichat_cmdenter_send_installed__;
  } catch {
    cmdenterInstalled = false;
  }
  checks.cmdenterInstalled = {
    status: cmdenterInstalled ? 'pass' : 'fail',
    details: { key: '__aichat_cmdenter_send_installed__', value: cmdenterInstalled }
  };

  const passAll = Object.values(checks).every((check) => check.status === 'pass');

  console.log({
    passAll,
    checkedAt: nowIso,
    url: String(location && location.href ? location.href : ''),
    checks
  });
})();
