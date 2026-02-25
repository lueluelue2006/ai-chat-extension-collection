(() => {
  'use strict';

  const STYLE_ID = 'aichat-strong-highlight-lite-style';
  const cssText = `
    .markdown strong {
      color: springgreen !important;
    }

    .light .markdown strong {
      color: darkviolet !important;
    }

    /* 隐藏 "ChatGPT can make mistakes..." 免责声明 */
    div.text-token-text-secondary.min-h-8.text-xs[class*="md:px-"] {
      display: none !important;
    }

    /* 新版/企业空间：底部免责声明（包含 vt-disclaimer） */
    #thread-bottom-container [class*="vt-disclaimer"] {
      display: none !important;
    }
  `;

  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    existing.textContent = cssText;
    return;
  }

  const styleSheet = document.createElement('style');
  styleSheet.id = STYLE_ID;
  styleSheet.textContent = cssText;

  (document.head
    ? Promise.resolve(document.head)
    : new Promise((resolve) => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => resolve(document.head), { once: true });
        } else {
          resolve(document.head);
        }
      })
  ).then((head) => {
    (head || document.documentElement).appendChild(styleSheet);
  });
})();
