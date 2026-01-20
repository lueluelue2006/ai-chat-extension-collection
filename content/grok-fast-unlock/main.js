// ==UserScript==
// @name         Grok 4 Fast Unlock
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  使 Grok 免费账号使用 Grok 4 Fast
// @author       MUTED64
// @match        https://grok.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';
    const GUARD_KEY = '__aichat_grok_fast_unlock_v1__';
    if (window[GUARD_KEY]) return;
    Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });
    if (window.top !== window) return;

    const TARGET_MODEL = 'grok-4-mini-thinking-tahoe';
    const TARGET_MODE = 'MODEL_MODE_GROK_4_MINI_THINKING';
    const DISPLAY_NAME = 'Grok 4 Fast';
    const STORAGE_KEY = 'aichat_grok_fast_unlock_enabled';

    function readEnabled() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw === null) return true; // 默认开启：Grok 4 Fast
            return raw === '1';
        } catch (_) {
            return true;
        }
    }

    function writeEnabled(enabled) {
        try {
            localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
        } catch (_) {}
    }

    let isMiniThinkingEnabled = readEnabled();
    let lastOfficialModelName = '';

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let [url, options] = args;
        const urlStr = (typeof url === 'string') ? url : (url?.url || '');
        if (isMiniThinkingEnabled && urlStr && (urlStr.includes('/conversations/new') || (urlStr.includes('/conversations/') && urlStr.includes('/messages')))) {
            if (options && options.body) {
                try {
                    const bodyData = JSON.parse(options.body);
                    if (bodyData.modelName) {
                        bodyData.modelName = TARGET_MODEL;
                        bodyData.modelMode = TARGET_MODE;
                        options.body = JSON.stringify(bodyData);
                        console.log('[Grok Enhanced] 拦截: 已使用 Grok 4 Fast');
                    }
                } catch (e) {}
            }
        }
        return originalFetch.apply(this, [url, options]);
    };

    function ensureMenuItem(menu) {
        if (menu.querySelector('#mini-thinking-option')) return;
        const template = menu.querySelector('[role="menuitem"]');
        if (!template) return;
        const newItem = template.cloneNode(true);
        newItem.id = 'mini-thinking-option';

        const title = newItem.querySelector('.font-semibold');
        if (title) title.textContent = DISPLAY_NAME;
        const desc = newItem.querySelector('.text-xs.text-secondary');
        if (desc) desc.textContent = 'Grok 4 Fast';
        menu.prepend(newItem);
    }

    function getTrigger() {
        return (
            document.querySelector('button[aria-label="Model select"]') ||
            document.querySelector('#model-select-trigger') ||
            document.querySelector('button[aria-haspopup="menu"]')
        );
    }

    function getTriggerLabelNode(trigger) {
        if (!trigger) return null;
        return (
            trigger.querySelector('.font-semibold') ||
            trigger.querySelector('div') ||
            trigger.querySelector('span') ||
            null
        );
    }

    function readTriggerLabel(trigger) {
        if (!trigger) return '';
        const labelNode = getTriggerLabelNode(trigger);
        const text = (labelNode ? labelNode.textContent : trigger.textContent) || '';
        return text.trim();
    }

    function writeTriggerLabel(trigger, text) {
        if (!trigger || !text) return;
        const labelNode = getTriggerLabelNode(trigger);
        if (!labelNode) return;
        if (labelNode.textContent !== text) labelNode.textContent = text;
    }

    function syncUI() {
        const menu = document.querySelector('[role="menu"]');
        const trigger = getTrigger();
        if (!lastOfficialModelName) {
            const initialLabel = readTriggerLabel(trigger);
            if (initialLabel && initialLabel !== DISPLAY_NAME) lastOfficialModelName = initialLabel;
        }
        if (menu) {
            ensureMenuItem(menu);
            const items = menu.querySelectorAll('[role="menuitem"]');

            items.forEach(item => {
                const check = item.querySelector('.lucide-check');
                if (!check) return;
                const itemName = item.innerText.split('\n')[0];

                if (item.id !== 'mini-thinking-option') {
                    const isCheckedByReact = check.classList.contains('opacity-100') || window.getComputedStyle(check).opacity === '1';
                    if (isCheckedByReact && !isMiniThinkingEnabled) {
                        lastOfficialModelName = itemName;
                    }
                    if (isCheckedByReact && isMiniThinkingEnabled) {

                        lastOfficialModelName = itemName;
                    }
                }

                if (isMiniThinkingEnabled) {
                    if (item.id === 'mini-thinking-option') {
                        check.style.opacity = '1';
                        check.classList.add('opacity-100');
                        check.classList.remove('opacity-0');
                    } else {
                        check.style.opacity = '0';
                        check.classList.add('opacity-0');
                        check.classList.remove('opacity-100');
                    }
                } else {
                    if (item.id === 'mini-thinking-option') {
                        check.style.opacity = '0';
                        check.classList.add('opacity-0');
                        check.classList.remove('opacity-100');
                    }
                }
            });
        }
        {
            const desiredText = isMiniThinkingEnabled ? DISPLAY_NAME : lastOfficialModelName;
            if (desiredText) writeTriggerLabel(trigger, desiredText);
        }
    }

    document.addEventListener('click', (e) => {
        const menuItem = e.target.closest('[role="menuitem"]');
        if (menuItem) {
            const itemName = menuItem.innerText.split('\n')[0];
            if (menuItem.id === 'mini-thinking-option') {
                isMiniThinkingEnabled = true;
                writeEnabled(true);
                setTimeout(() => {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }, 30);
            } else {
                isMiniThinkingEnabled = false;
                writeEnabled(false);
                lastOfficialModelName = itemName;
            }
            syncUI();
        }
    }, true);

    const observer = new MutationObserver(syncUI);
    observer.observe(document, { childList: true, subtree: true });
    console.log('[Grok Enhanced] 脚本加载成功。');
})();
