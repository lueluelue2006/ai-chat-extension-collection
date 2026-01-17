(() => {
  'use strict';

  const STYLE_ID = 'aichat-strong-highlight-lite-style';
  if (document.getElementById(STYLE_ID)) return;

  const styleSheet = document.createElement('style');
  styleSheet.id = STYLE_ID;
  styleSheet.textContent = `
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
  `;

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
