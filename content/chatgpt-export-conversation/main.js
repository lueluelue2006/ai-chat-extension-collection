// ==UserScript==
// @name         ChatGPT对话导出（2025年7月新版UI）
// @namespace    https://github.com/lueluelue2006
// @version      0.4.0
// @description  一键导出 ChatGPT 聊天记录为 HTML 或 Markdown（适配新版 UI）
// @author       Marx (updated by schweigen)
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  'use strict';

  const GUARD_KEY = '__aichat_chatgpt_export_conversation_v1__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  const TURN_SELECTOR = 'article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"]';

  function escapeHtml(input) {
    return String(input ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) {
    const x = Math.max(0, Number(n) || 0);
    return x < 10 ? `0${x}` : String(x);
  }

  function formatDate(d) {
    const dt = d instanceof Date ? d : new Date();
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function getConversationIdFromUrl() {
    try {
      const u = new URL(location.href);
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('c');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      // /share/xxx
      const sidx = parts.indexOf('share');
      if (sidx >= 0 && parts[sidx + 1]) return parts[sidx + 1];
      return '';
    } catch {
      return '';
    }
  }

  function getTurns() {
    return Array.from(document.querySelectorAll(TURN_SELECTOR));
  }

  function findUserContent(turn) {
    const host = turn.querySelector('[data-message-author-role="user"]');
    if (!host) return null;
    return host.querySelector('.whitespace-pre-wrap') || host;
  }

  function findAssistantContent(turn) {
    const host = turn.querySelector('[data-message-author-role="assistant"]');
    if (!host) return null;
    // Prefer markdown/prose container, fallback to host itself.
    return host.querySelector('.markdown') || host.querySelector('.prose') || host;
  }

  function normalizeText(text) {
    return String(text ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function getCodeFenceLang(pre) {
    try {
      const code = pre.querySelector('code');
      if (!code) return '';
      const cls = String(code.className || '');
      const m = cls.match(/language-([a-zA-Z0-9_+-]+)/);
      return m ? m[1] : '';
    } catch {
      return '';
    }
  }

  function mdEscapeInline(text) {
    // Keep it minimal: avoid breaking backticks
    const s = String(text ?? '');
    return s.replace(/`/g, '\\`');
  }

  function ensureBlankLine(text) {
    const s = String(text ?? '').trimEnd();
    return s ? `${s}\n\n` : '';
  }

  function nodeToMarkdown(node, ctx) {
    const context = ctx || { listDepth: 0, ordered: false, index: 1, quoteDepth: 0 };

    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return mdEscapeInline(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = /** @type {Element} */ (node);
    const tag = (el.tagName || '').toLowerCase();

    if (tag === 'br') return '\n';

    if (tag === 'pre') {
      const lang = getCodeFenceLang(el);
      const codeText = normalizeText(el.textContent || '');
      const fence = '```';
      return `\n${fence}${lang}\n${codeText}\n${fence}\n\n`;
    }

    if (tag === 'code') {
      // Inline code only (block code handled by <pre>)
      const parentTag = (el.parentElement?.tagName || '').toLowerCase();
      if (parentTag === 'pre') return '';
      const t = normalizeText(el.textContent || '');
      return t ? `\`${mdEscapeInline(t)}\`` : '';
    }

    if (tag === 'strong' || tag === 'b') {
      const inner = childrenToMarkdown(el, context).trim();
      return inner ? `**${inner}**` : '';
    }

    if (tag === 'em' || tag === 'i') {
      const inner = childrenToMarkdown(el, context).trim();
      return inner ? `*${inner}*` : '';
    }

    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      const text = childrenToMarkdown(el, context).trim() || href;
      if (!href) return text;
      return `[${text}](${href})`;
    }

    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      if (!src) return '';
      const alt = el.getAttribute('alt') || '';
      return `![${mdEscapeInline(alt)}](${src})`;
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1)) || 2;
      const inner = normalizeText(childrenToMarkdown(el, context));
      return ensureBlankLine(`${'#'.repeat(Math.max(1, Math.min(6, level)))} ${inner}`);
    }

    if (tag === 'p') {
      const inner = normalizeText(childrenToMarkdown(el, context));
      return ensureBlankLine(inner);
    }

    if (tag === 'blockquote') {
      const inner = normalizeText(childrenToMarkdown(el, { ...context, quoteDepth: (context.quoteDepth || 0) + 1 }));
      if (!inner) return '';
      const prefix = `${'>'.repeat(Math.max(1, Math.min(6, (context.quoteDepth || 0) + 1)))} `;
      const lines = inner.split('\n').map((l) => (l ? `${prefix}${l}` : prefix.trimEnd()));
      return ensureBlankLine(lines.join('\n'));
    }

    if (tag === 'ul' || tag === 'ol') {
      const nextCtx = { ...context, listDepth: (context.listDepth || 0) + 1, ordered: tag === 'ol', index: 1 };
      let out = '';
      for (const li of Array.from(el.children)) {
        if ((li.tagName || '').toLowerCase() !== 'li') continue;
        out += nodeToMarkdown(li, nextCtx);
        nextCtx.index += 1;
      }
      return ensureBlankLine(out.trimEnd());
    }

    if (tag === 'li') {
      const depth = Math.max(1, Math.min(10, context.listDepth || 1));
      const indent = '  '.repeat(depth - 1);
      const bullet = context.ordered ? `${context.index || 1}. ` : '- ';
      const inner = normalizeText(childrenToMarkdown(el, { ...context, listDepth: depth }));
      const lines = inner.split('\n');
      const first = `${indent}${bullet}${lines.shift() || ''}`;
      const rest = lines.map((l) => `${indent}  ${l}`);
      return `${[first, ...rest].join('\n')}\n`;
    }

    if (tag === 'hr') return '\n---\n\n';

    // Default: flatten children
    return childrenToMarkdown(el, context);
  }

  function childrenToMarkdown(el, ctx) {
    let out = '';
    for (const child of Array.from(el.childNodes)) out += nodeToMarkdown(child, ctx);
    return out;
  }

  function messageToMarkdown(el) {
    if (!el) return '';
    return normalizeText(childrenToMarkdown(el, { listDepth: 0, ordered: false, index: 1, quoteDepth: 0 }));
  }

  function downloadText(text, fileName, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function buildMessages() {
    const turns = getTurns();
    if (!turns.length) return { ok: false, error: '未找到任何对话内容。请确认当前页面有对话。' };

    /** @type {Array<{role: 'user'|'assistant', el: Element}>} */
    const messages = [];
    for (const turn of turns) {
      const user = findUserContent(turn);
      if (user) messages.push({ role: 'user', el: user });
      const assistant = findAssistantContent(turn);
      if (assistant) messages.push({ role: 'assistant', el: assistant });
    }

    if (!messages.length) return { ok: false, error: '未找到可导出的消息内容。' };
    return { ok: true, messages };
  }

  async function exportChatAsMarkdown() {
    const res = buildMessages();
    if (!res.ok) {
      alert(res.error);
      return;
    }

    const date = formatDate(new Date());
    const convoId = getConversationIdFromUrl();
    const fileName = convoId ? `chatgpt-${convoId}-${date}.md` : `chatgpt-${date}.md`;

    let out = `# ${date} ChatGPT对话记录\n\n`;
    let userIndex = 1;
    let assistantIndex = 1;

    for (const msg of res.messages) {
      if (msg.role === 'user') {
        out += `## User ${userIndex}\n\n`;
        out += `${messageToMarkdown(msg.el)}\n\n`;
        userIndex += 1;
        continue;
      }
      out += `## Assistant ${assistantIndex}\n\n`;
      out += `${messageToMarkdown(msg.el)}\n\n`;
      assistantIndex += 1;
    }

    downloadText(out.trimEnd() + '\n', fileName, 'text/markdown;charset=utf-8');
  }

  async function exportChatAsHTML() {
    const res = buildMessages();
    if (!res.ok) {
      alert(res.error);
      return;
    }

    const date = formatDate(new Date());
    const convoId = getConversationIdFromUrl();
    const fileName = convoId ? `chatgpt-${convoId}-${date}.html` : `chatgpt-${date}.html`;

    let body = '';
    let userIndex = 1;
    let assistantIndex = 1;

    for (const msg of res.messages) {
      if (msg.role === 'user') {
        body += `<section class="msg user"><h2>User ${userIndex}</h2><div class="content">${msg.el.innerHTML}</div></section>`;
        userIndex += 1;
        continue;
      }
      body += `<section class="msg assistant"><h2>Assistant ${assistantIndex}</h2><div class="content">${msg.el.innerHTML}</div></section>`;
      assistantIndex += 1;
    }

    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>ChatGPT Export ${escapeHtml(date)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; line-height: 1.55; max-width: 920px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 22px; margin: 0 0 16px; }
    h2 { font-size: 16px; margin: 0 0 10px; opacity: .85; }
    .msg { padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(0,0,0,.10); margin: 12px 0; background: rgba(0,0,0,.03); }
    @media (prefers-color-scheme: dark) { .msg { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.06); } }
    .msg.user { border-left: 4px solid rgba(59,130,246,.8); }
    .msg.assistant { border-left: 4px solid rgba(168,85,247,.8); }
    pre { overflow: auto; padding: 12px; border-radius: 10px; background: rgba(0,0,0,.06); }
    @media (prefers-color-scheme: dark) { pre { background: rgba(255,255,255,.10); } }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <h1>${escapeHtml(date)} ChatGPT对话记录</h1>
  ${body}
</body>
</html>`;

    downloadText(html, fileName, 'text/html;charset=utf-8');
  }

  function registerCommands() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand('导出为 Markdown', exportChatAsMarkdown);
    GM_registerMenuCommand('导出为 HTML', exportChatAsHTML);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerCommands, { once: true });
  } else {
    registerCommands();
  }
})();

