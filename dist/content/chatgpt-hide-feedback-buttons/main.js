(() => {
  'use strict';

  const STYLE_ID = '__aichat_chatgpt_hide_feedback_buttons_style_v1__';
  if (document.getElementById(STYLE_ID)) return;

  const styleSheet = document.createElement('style');
  styleSheet.id = STYLE_ID;
  styleSheet.textContent = `
    button[data-testid="good-response-turn-action-button"],
    button[data-testid="bad-response-turn-action-button"] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;

  const root = document.head || document.documentElement;
  if (!root) return;
  root.appendChild(styleSheet);
})();
