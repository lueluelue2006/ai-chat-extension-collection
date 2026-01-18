// ==UserScript==
// @name         Gemini Enterprise - Auto Gemini 3 Pro
// @namespace    https://github.com/lueluelue2006
// @version      0.1.0
// @description  Automatically switch Gemini Enterprise model selector to Gemini 3 Pro when available.
// @author       schweigen
// @match        https://business.gemini.google/*
// @run-at       document-end
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  const STATE_KEY = '__aichat_gemini_auto_3_pro_state__';
  try {
    const prev = window[STATE_KEY];
    if (prev && typeof prev === 'object') {
      try {
        if (prev.autoTimer) clearTimeout(prev.autoTimer);
      } catch {}
      try {
        if (prev.disclaimerTimer) clearTimeout(prev.disclaimerTimer);
      } catch {}
      try {
        if (prev.interval) clearInterval(prev.interval);
      } catch {}
    }
  } catch {}

  const state = { autoTimer: 0, disclaimerTimer: 0, interval: 0, attempts: 0 };
  try {
    Object.defineProperty(window, STATE_KEY, { value: state, configurable: true, enumerable: false, writable: false });
  } catch {
    try {
      window[STATE_KEY] = state;
    } catch {}
  }

  const TARGET_LABEL = '3 Pro';
  const HOST_SELECTOR = 'ucs-standalone-app';
  const MODEL_SELECTOR = 'md-text-button.action-model-selector#model-selector-menu-anchor';
  const MENU_SELECTOR = 'md-menu.model-selector-menu';
  const DISCLAIMER_SELECTOR = 'div.disclaimer';

  const MAX_INITIAL_ATTEMPTS = 16;
  const RETRY_DELAYS_MS = [0, 250, 600, 1200, 2200, 4000, 7000, 12000, 20000];
  const DISCLAIMER_RETRY_DELAYS_MS = [400, 1500, 3500, 8000, 15000];

  function getGeminiRoot() {
    return document.querySelector(HOST_SELECTOR)?.shadowRoot || document;
  }

  function walkOpenShadows(start, visit) {
    const stack = [start];
    const seen = new Set();
    while (stack.length) {
      const root = stack.pop();
      if (!root || seen.has(root)) continue;
      seen.add(root);
      try {
        visit(root);
      } catch {}
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

  function findModelSelectorHost() {
    const root = getGeminiRoot();
    const candidates = deepQueryAll(root, MODEL_SELECTOR);
    if (!candidates.length) return null;

    const preferred = candidates.find((el) => {
      const text = (el.textContent || '').toLowerCase();
      return text.includes('auto') || text.includes('gemini');
    });

    return preferred || candidates[candidates.length - 1];
  }

  function findModelSelectorButton() {
    const host = findModelSelectorHost();
    if (!host) return null;
    const shadowButton = host.shadowRoot && host.shadowRoot.querySelector('button');
    return shadowButton || host;
  }

  function isAlreadyOnTarget() {
    const host = findModelSelectorHost();
    if (!host) return false;
    const labelText = (host.textContent || '').trim();
    return labelText.includes(TARGET_LABEL);
  }

  function getMenuEl() {
    const root = getGeminiRoot();
    return deepQueryFirst(root, MENU_SELECTOR);
  }

  function isMenuOpen(menuEl) {
    if (!menuEl) return false;
    const isHidden = menuEl.getAttribute('aria-hidden') === 'true';
    const hasOpenAttribute = menuEl.hasAttribute('open');
    return !isHidden && hasOpenAttribute;
  }

  function openModelMenuIfNeeded() {
    const menuEl = getMenuEl();
    if (isMenuOpen(menuEl)) return true;

    const button = findModelSelectorButton();
    if (!button) return false;
    try {
      button.click();
      return true;
    } catch {
      return false;
    }
  }

  function clickGemini3Pro() {
    const menuEl = getMenuEl();
    if (!menuEl) return false;

    const menuItems = Array.from(menuEl.querySelectorAll('md-menu-item'));
    if (!menuItems.length) return false;

    const targetItem = menuItems.find((item) => ((item.textContent || '').trim() || '').includes(TARGET_LABEL));
    if (!targetItem) return false;

    let interactive = targetItem;
    try {
      const li = targetItem.shadowRoot && targetItem.shadowRoot.querySelector('#item');
      if (li) interactive = li;
    } catch {}

    try {
      interactive.click();
      return true;
    } catch {
      return false;
    }
  }

  function trySelectGemini3ProOnce() {
    if (isAlreadyOnTarget()) return true;

    const opened = openModelMenuIfNeeded();
    if (!opened) return false;

    setTimeout(() => {
      clickGemini3Pro();
    }, 350);

    return true;
  }

  function hideDisclaimersOnce() {
    const root = getGeminiRoot();
    const items = deepQueryAll(root, DISCLAIMER_SELECTOR);
    if (!items.length) return false;
    for (const el of items) {
      try {
        el.style.setProperty('display', 'none', 'important');
      } catch {}
    }
    return true;
  }

  function scheduleAuto(fn, ms) {
    try {
      state.autoTimer = setTimeout(fn, ms);
    } catch {}
  }

  function scheduleDisclaimer(fn, ms) {
    try {
      state.disclaimerTimer = setTimeout(fn, ms);
    } catch {}
  }

  function bootstrapAutoSelect() {
    let i = 0;
    const step = () => {
      if (isAlreadyOnTarget()) return;
      if (state.attempts >= MAX_INITIAL_ATTEMPTS) return;
      state.attempts += 1;

      trySelectGemini3ProOnce();

      const delay = RETRY_DELAYS_MS[Math.min(i, RETRY_DELAYS_MS.length - 1)];
      i += 1;
      scheduleAuto(step, delay);
    };
    step();

    // SPA 场景：低频保活，避免模型被切回
    state.interval = setInterval(() => {
      if (!isAlreadyOnTarget()) trySelectGemini3ProOnce();
    }, 20000);
  }

  function bootstrapHideDisclaimers() {
    let i = 0;
    const sweep = () => {
      hideDisclaimersOnce();
      if (i >= DISCLAIMER_RETRY_DELAYS_MS.length - 1) return;
      const delay = DISCLAIMER_RETRY_DELAYS_MS[i];
      i += 1;
      scheduleDisclaimer(sweep, delay);
    };
    sweep();
  }

  function boot() {
    bootstrapAutoSelect();
    bootstrapHideDisclaimers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
