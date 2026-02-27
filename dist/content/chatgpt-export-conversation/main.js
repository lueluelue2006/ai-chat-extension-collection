(() => {
  'use strict';

  const GUARD_KEY = '__aichat_chatgpt_export_conversation_v2__';
  if (window[GUARD_KEY]) return;
  Object.defineProperty(window, GUARD_KEY, { value: true, configurable: false, enumerable: false, writable: false });

  const DOM_TURN_SELECTOR = 'article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"]';
  const MAX_TREE_JSON_BYTES = 6 * 1024 * 1024;
  const FILE_SERVICE_PREFIX = 'file-service://';
  const URL_RE = /https?:\/\/[^\s"')<>]+/gi;
  const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)(?:$|[?#])/i;

  function getCore() {
    try {
      return globalThis.__aichat_chatgpt_core_v1__ || null;
    } catch {
      return null;
    }
  }

  function escapeHtml(input) {
    return String(input ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeExportHtmlFromElement(el) {
    try {
      if (!el || !(el instanceof Element)) return '';
      const clone = el.cloneNode(true);

      const banned = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META']);
      const sanitizeEl = (node) => {
        if (!node || !(node instanceof Element)) return;
        if (banned.has(node.tagName)) {
          try { node.remove(); } catch {}
          return;
        }

        const attrs = Array.from(node.attributes || []);
        for (const a of attrs) {
          const name = String(a?.name || '');
          const value = String(a?.value || '');
          if (!name) continue;
          if (/^on/i.test(name)) {
            try { node.removeAttribute(name); } catch {}
            continue;
          }
          if (name === 'srcdoc') {
            try { node.removeAttribute(name); } catch {}
            continue;
          }
          if (name === 'href' || name === 'src' || name === 'xlink:href') {
            if (/^\s*javascript:/i.test(value)) {
              try { node.removeAttribute(name); } catch {}
            }
          }
        }
      };

      sanitizeEl(clone);
      for (const node of Array.from(clone.querySelectorAll('*'))) sanitizeEl(node);
      return clone.innerHTML || '';
    } catch {
      try {
        return escapeHtml(el?.textContent || '');
      } catch {
        return '';
      }
    }
  }

  function pad2(n) {
    const x = Math.max(0, Number(n) || 0);
    return x < 10 ? `0${x}` : String(x);
  }

  function formatDate(d) {
    const dt = d instanceof Date ? d : new Date();
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function normalizeText(text) {
    return String(text ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function isAbortError(err) {
    try {
      if (!err || typeof err !== 'object') return false;
      const name = typeof err.name === 'string' ? err.name : '';
      if (name === 'AbortError') return true;
      const msg = typeof err.message === 'string' ? err.message : '';
      return /aborted|aborterror/i.test(msg);
    } catch {
      return false;
    }
  }

  function getConversationIdFromUrl() {
    try {
      const core = getCore();
      if (core && typeof core.getConversationIdFromUrl === 'function') {
        const id = core.getConversationIdFromUrl(location.href);
        if (id) return id;
      }
    } catch {}
    try {
      const u = new URL(location.href);
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('c');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      const sidx = parts.indexOf('share');
      if (sidx >= 0 && parts[sidx + 1]) return parts[sidx + 1];
      return '';
    } catch {
      return '';
    }
  }

  function getCookie(name) {
    try {
      const n = String(name || '');
      if (!n) return '';
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
      return m ? decodeURIComponent(m[1] || '') : '';
    } catch {
      return '';
    }
  }

  function createEmptyAuthCache() {
    return {
      fetchedAt: 0,
      token: '',
      accountId: '',
      deviceId: ''
    };
  }

  let authCache = createEmptyAuthCache();
  const fileDownloadUrlCache = new Map();

  async function getAuthContext(signal) {
    const age = Date.now() - (Number(authCache.fetchedAt) || 0);
    if (authCache.token && authCache.accountId && authCache.deviceId && age < 5 * 60 * 1000) return authCache;

    let token = '';
    let accountId = '';

    try {
      const req = { credentials: 'include' };
      if (signal) req.signal = signal;
      const resp = await fetch('/api/auth/session', req);
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        token = typeof data?.accessToken === 'string' ? data.accessToken : '';
        accountId = typeof data?.account?.id === 'string' ? data.account.id : '';
      }
    } catch (e) {
      if (isAbortError(e)) throw e;
    }

    const deviceId = getCookie('oai-did');

    authCache = {
      fetchedAt: Date.now(),
      token,
      accountId,
      deviceId
    };

    return authCache;
  }

  function buildChatGptHeaders(auth) {
    return {
      accept: 'application/json',
      authorization: auth?.token ? `Bearer ${auth.token}` : '',
      'chatgpt-account-id': auth?.accountId || '',
      'oai-device-id': auth?.deviceId || '',
      'oai-language': navigator.language || 'en-US'
    };
  }

  async function fetchConversationData(conversationId, signal) {
    const auth = await getAuthContext(signal);
    const headers = buildChatGptHeaders(auth);
    const request = { credentials: 'include', headers };
    if (signal) request.signal = signal;

    const url = `/backend-api/conversation/${encodeURIComponent(conversationId)}`;
    const resp = await fetch(url, request);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${text ? `(${text.slice(0, 120)})` : ''}`.trim());
    }

    try {
      const lenHeader = resp.headers?.get?.('content-length') || '';
      const len = Number(lenHeader);
      if (Number.isFinite(len) && len > MAX_TREE_JSON_BYTES) {
        throw new Error(`对话树数据过大（>${Math.round(MAX_TREE_JSON_BYTES / 1024 / 1024)}MB），已停止导出`);
      }
    } catch {}

    try {
      const body = resp.body;
      if (!body || typeof body.getReader !== 'function') return await resp.json();

      const reader = body.getReader();
      const decoder = new TextDecoder();
      const parts = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength || 0;
        if (received > MAX_TREE_JSON_BYTES) {
          try { await reader.cancel(); } catch {}
          throw new Error(`对话树数据过大（>${Math.round(MAX_TREE_JSON_BYTES / 1024 / 1024)}MB），已停止导出`);
        }
        parts.push(decoder.decode(value, { stream: true }));
      }

      parts.push(decoder.decode());
      const text = parts.join('');
      return JSON.parse(text);
    } catch (e) {
      if (isAbortError(e)) throw e;
      if (e instanceof Error && /对话树数据过大/.test(e.message)) throw e;
      return await resp.json();
    }
  }

  function getRootNodeId(mapping) {
    if (!mapping || typeof mapping !== 'object') return '';
    if (mapping['client-created-root']) return 'client-created-root';
    for (const [k, v] of Object.entries(mapping)) {
      if (!v) continue;
      const parent = v.parent;
      if (!parent || !Object.prototype.hasOwnProperty.call(mapping, parent)) return k;
    }
    return Object.keys(mapping)[0] || '';
  }

  function normalizeRole(role, nodeId) {
    const r = String(role || '').toLowerCase();
    if (r === 'user' || r === 'assistant' || r === 'system' || r === 'tool') return r;
    if (nodeId === 'client-created-root') return 'root';
    return r || 'unknown';
  }

  function isLikelyImageUrl(url, keyHint = '') {
    const raw = String(url || '').trim();
    if (!raw) return false;
    if (/^data:image\//i.test(raw)) return true;
    let parsed = null;
    try {
      parsed = new URL(raw, location.href);
    } catch {
      return false;
    }

    const path = `${parsed.pathname || ''}${parsed.search || ''}`;
    if (IMAGE_EXT_RE.test(path)) return true;

    const hint = String(keyHint || '').toLowerCase();
    if (hint && /(image|img|thumbnail|thumb|preview|photo|picture)/i.test(hint)) {
      if (/^https?:/i.test(parsed.protocol)) return true;
    }

    if (/\b(format|fm|mime|content_type)=image\b/i.test(parsed.search)) return true;
    if (/\/images?\//i.test(parsed.pathname)) return true;

    return false;
  }

  function extractUrlsFromString(text) {
    const out = [];
    const s = String(text || '');
    if (!s) return out;
    const matches = s.match(URL_RE) || [];
    for (const m of matches) out.push(m);
    return out;
  }

  function collectImageUrls(value, out, options = {}) {
    const depth = Number(options.depth || 0);
    const keyHint = String(options.keyHint || '');
    const seen = options.seen || new WeakSet();

    if (!value || depth > 8) return;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (/^data:image\//i.test(trimmed)) {
        out.add(trimmed);
        return;
      }
      const urls = extractUrlsFromString(trimmed);
      for (const u of urls) {
        if (isLikelyImageUrl(u, keyHint)) out.add(u);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) collectImageUrls(item, out, { depth: depth + 1, keyHint, seen });
      return;
    }

    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    for (const [k, v] of Object.entries(value)) {
      const nextHint = `${keyHint} ${k}`.trim();
      collectImageUrls(v, out, { depth: depth + 1, keyHint: nextHint, seen });
    }
  }

  function collectFileServiceIds(value, out, options = {}) {
    const depth = Number(options.depth || 0);
    const seen = options.seen || new WeakSet();
    if (!value || depth > 8) return;

    if (typeof value === 'string') {
      const s = value.trim();
      if (!s) return;
      const idx = s.indexOf(FILE_SERVICE_PREFIX);
      if (idx >= 0) {
        const raw = s.slice(idx + FILE_SERVICE_PREFIX.length);
        const fileId = raw.split(/[/?#\s]/)[0] || '';
        if (fileId) out.add(fileId);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) collectFileServiceIds(item, out, { depth: depth + 1, seen });
      return;
    }

    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    for (const v of Object.values(value)) collectFileServiceIds(v, out, { depth: depth + 1, seen });
  }

  function collectTextParts(value, out, options = {}) {
    const depth = Number(options.depth || 0);
    const seen = options.seen || new WeakSet();
    if (!value || depth > 6) return;

    if (typeof value === 'string') {
      const t = normalizeText(value);
      if (t) out.push(t);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) collectTextParts(item, out, { depth: depth + 1, seen });
      return;
    }

    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    const contentType = String(value.content_type || '').toLowerCase();
    if (contentType.includes('image')) return;

    const preferredKeys = ['text', 'caption', 'title', 'alt', 'description'];
    for (const k of preferredKeys) {
      if (typeof value[k] === 'string') {
        const t = normalizeText(value[k]);
        if (t) out.push(t);
      }
    }

    if (Array.isArray(value.parts)) {
      for (const p of value.parts) collectTextParts(p, out, { depth: depth + 1, seen });
    }
  }

  function dedupeTextChunks(chunks) {
    const seen = new Set();
    const out = [];
    for (const item of chunks || []) {
      const t = normalizeText(item);
      if (!t) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }

  function extractMessageText(message) {
    try {
      const chunks = [];
      const content = message?.content;
      if (Array.isArray(content?.parts)) {
        for (const part of content.parts) collectTextParts(part, chunks);
      }

      if (!chunks.length && content && typeof content === 'object' && content.text) {
        collectTextParts(content.text, chunks);
      }

      if (!chunks.length && message?.metadata && typeof message.metadata === 'object') {
        collectTextParts(message.metadata?.summary, chunks);
      }

      const final = dedupeTextChunks(chunks).join('\n\n').trim();
      if (final) return final;

      const ct = String(content?.content_type || '').trim();
      if (ct) return `<${ct}>`;
      return '';
    } catch {
      return '';
    }
  }

  function extractMessageImageRefs(message) {
    const directUrls = new Set();
    const fileIds = new Set();

    try {
      if (message && typeof message === 'object') {
        collectImageUrls(message?.content, directUrls);
        collectImageUrls(message?.metadata, directUrls);
        collectFileServiceIds(message?.content, fileIds);
        collectFileServiceIds(message?.metadata, fileIds);
      }
    } catch {}

    return {
      directUrls: Array.from(directUrls),
      fileIds: Array.from(fileIds)
    };
  }

  function tryExtractDownloadUrlFromJson(data) {
    try {
      if (!data || typeof data !== 'object') return '';
      const direct = [
        data.download_url,
        data.url,
        data.href,
        data.signed_url,
        data.presigned_url,
        data.link
      ];
      for (const x of direct) {
        if (typeof x === 'string' && /^https?:\/\//i.test(x.trim())) return x.trim();
      }

      const asStrings = new Set();
      collectImageUrls(data, asStrings, { keyHint: 'download image url' });
      for (const u of asStrings.values()) {
        if (/^https?:\/\//i.test(String(u || ''))) return String(u);
      }

      return '';
    } catch {
      return '';
    }
  }

  async function resolveFileServiceDownloadUrl(fileId, auth, signal) {
    const id = String(fileId || '').trim();
    if (!id) return '';
    if (fileDownloadUrlCache.has(id)) return fileDownloadUrlCache.get(id) || '';

    const headers = buildChatGptHeaders(auth || {});
    const request = {
      credentials: 'include',
      headers
    };
    if (signal) request.signal = signal;

    const endpoints = [
      `/backend-api/files/${encodeURIComponent(id)}/download`,
      `/backend-api/files/${encodeURIComponent(id)}`
    ];

    let resolved = '';

    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep, request);
        if (!resp.ok) continue;

        const contentType = String(resp.headers?.get?.('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
          const data = await resp.json().catch(() => null);
          resolved = tryExtractDownloadUrlFromJson(data);
          if (resolved) break;
          continue;
        }

        const text = await resp.text().catch(() => '');
        if (/^https?:\/\//i.test(String(text || '').trim())) {
          resolved = String(text || '').trim();
          break;
        }
      } catch (e) {
        if (isAbortError(e)) throw e;
      }
    }

    fileDownloadUrlCache.set(id, resolved || '');
    return resolved || '';
  }

  async function resolveImageUrlsForMessage(message, auth, signal) {
    const refs = extractMessageImageRefs(message);
    const urls = new Set();

    for (const u of refs.directUrls) {
      const s = String(u || '').trim();
      if (s) urls.add(s);
    }

    for (const fileId of refs.fileIds) {
      try {
        const resolved = await resolveFileServiceDownloadUrl(fileId, auth, signal);
        if (resolved) urls.add(resolved);
      } catch (e) {
        if (isAbortError(e)) throw e;
      }
    }

    return {
      imageUrls: Array.from(urls),
      unresolvedFileIds: refs.fileIds.filter((id) => {
        const cached = fileDownloadUrlCache.get(id);
        return !cached;
      })
    };
  }

  function buildNodeVisitOrder(mapping, rootId) {
    const out = [];
    const seen = new Set();

    const walk = (nodeId, depth = 0) => {
      const id = String(nodeId || '');
      if (!id || seen.has(id) || depth > 6000) return;
      seen.add(id);
      out.push(id);
      const node = mapping?.[id] || null;
      const children = Array.isArray(node?.children) ? node.children : [];
      for (const childId of children) walk(childId, depth + 1);
    };

    if (rootId) walk(rootId, 0);

    for (const id of Object.keys(mapping || {})) {
      if (!seen.has(id)) walk(id, 0);
    }

    return out;
  }

  function computeDepthByParent(nodeId, mapping, cache = new Map()) {
    const id = String(nodeId || '');
    if (!id) return 0;
    if (cache.has(id)) return cache.get(id);

    let depth = 0;
    const local = new Set([id]);
    let cur = id;
    let guard = 0;

    while (guard < 4096) {
      guard += 1;
      const node = mapping?.[cur] || null;
      const parent = typeof node?.parent === 'string' ? node.parent : '';
      if (!parent || local.has(parent)) break;
      local.add(parent);
      depth += 1;
      cur = parent;
    }

    cache.set(id, depth);
    return depth;
  }

  async function buildTreeExportPayload() {
    const conversationId = getConversationIdFromUrl();
    if (!conversationId) return { ok: false, error: '未检测到会话 ID（请打开具体对话再导出）' };

    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => {
      try { abortCtrl.abort(); } catch {}
    }, 35000);

    try {
      const [auth, data] = await Promise.all([
        getAuthContext(abortCtrl.signal),
        fetchConversationData(conversationId, abortCtrl.signal)
      ]);

      const mapping = data?.mapping && typeof data.mapping === 'object' ? data.mapping : null;
      if (!mapping) return { ok: false, error: '未拿到会话树数据（mapping 为空）' };

      const rootNodeId = getRootNodeId(mapping) || String(data?.current_node || '');
      const currentNodeId = typeof data?.current_node === 'string' ? data.current_node : '';
      const orderedNodeIds = buildNodeVisitOrder(mapping, rootNodeId);
      const depthCache = new Map();
      const nodes = [];
      const warnings = [];

      for (const nodeId of orderedNodeIds) {
        const node = mapping?.[nodeId] || null;
        if (!node) continue;

        const message = node?.message || null;
        const messageId = typeof message?.id === 'string' ? message.id : '';
        const role = normalizeRole(message?.author?.role, nodeId);
        const parentNodeId = typeof node?.parent === 'string' ? node.parent : '';
        const children = Array.isArray(node?.children) ? node.children.map((x) => String(x || '')).filter(Boolean) : [];
        const depth = computeDepthByParent(nodeId, mapping, depthCache);
        const contentType = String(message?.content?.content_type || '');
        const text = extractMessageText(message);

        let imageResult = { imageUrls: [], unresolvedFileIds: [] };
        try {
          imageResult = await resolveImageUrlsForMessage(message, auth, abortCtrl.signal);
        } catch (e) {
          if (isAbortError(e)) throw e;
          imageResult = { imageUrls: [], unresolvedFileIds: [] };
        }

        if (imageResult.unresolvedFileIds.length) {
          warnings.push(`节点 ${nodeId} 存在未解析图片资源：${imageResult.unresolvedFileIds.join(', ')}`);
        }

        nodes.push({
          nodeId,
          messageId,
          role,
          parentNodeId,
          children,
          depth,
          contentType,
          text,
          imageUrls: imageResult.imageUrls,
          unresolvedFileIds: imageResult.unresolvedFileIds
        });
      }

      return {
        ok: true,
        data: {
          version: 1,
          exportedAt: new Date().toISOString(),
          conversationId,
          rootNodeId,
          currentNodeId,
          nodeCount: nodes.length,
          nodes,
          warnings
        }
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { ok: false, error };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function roleLabel(role) {
    const r = String(role || '').toLowerCase();
    if (r === 'user') return 'User';
    if (r === 'assistant') return 'Assistant';
    if (r === 'system') return 'System';
    if (r === 'tool') return 'Tool';
    if (r === 'root') return 'Root';
    return r || 'Unknown';
  }

  function mdEscapeInline(text) {
    return String(text ?? '').replace(/`/g, '\\`');
  }

  function mdEscapeBlock(text) {
    return String(text ?? '').replace(/```/g, '``\\`');
  }

  function sanitizeFilePart(input) {
    return String(input || '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
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

  function buildTreeMarkdown(exportData) {
    const date = formatDate(new Date());
    let out = '';
    out += `# ${date} ChatGPT 对话树导出\n\n`;
    out += `- 会话 ID: \`${mdEscapeInline(exportData.conversationId || '')}\`\n`;
    out += `- 根节点: \`${mdEscapeInline(exportData.rootNodeId || '')}\`\n`;
    out += `- 当前节点: \`${mdEscapeInline(exportData.currentNodeId || '')}\`\n`;
    out += `- 节点总数: ${Number(exportData.nodeCount) || 0}\n\n`;

    if (Array.isArray(exportData.warnings) && exportData.warnings.length) {
      out += '## 警告\n\n';
      for (const w of exportData.warnings) out += `- ${mdEscapeInline(w)}\n`;
      out += '\n';
    }

    const nodes = Array.isArray(exportData.nodes) ? exportData.nodes : [];
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      out += `## 节点 ${i + 1} · ${roleLabel(n.role)}\n\n`;
      out += `- nodeId: \`${mdEscapeInline(n.nodeId)}\`\n`;
      out += `- messageId: \`${mdEscapeInline(n.messageId || '')}\`\n`;
      out += `- parent: \`${mdEscapeInline(n.parentNodeId || '')}\`\n`;
      out += `- children: ${Array.isArray(n.children) ? n.children.length : 0}\n`;
      out += `- depth: ${Math.max(0, Number(n.depth) || 0)}\n`;
      out += `- content_type: \`${mdEscapeInline(n.contentType || '')}\`\n\n`;

      if (Array.isArray(n.imageUrls) && n.imageUrls.length) {
        out += '### 图片\n\n';
        n.imageUrls.forEach((url, idx) => {
          const safe = String(url || '').trim();
          if (!safe) return;
          out += `![node-${i + 1}-img-${idx + 1}](${safe})\n\n`;
          out += `链接：${safe}\n\n`;
        });
      }

      if (Array.isArray(n.unresolvedFileIds) && n.unresolvedFileIds.length) {
        out += `> 未解析图片资源 ID：${n.unresolvedFileIds.map((x) => `\`${mdEscapeInline(x)}\``).join(', ')}\n\n`;
      }

      if (n.text) {
        out += '### 内容\n\n';
        out += '```text\n';
        out += `${mdEscapeBlock(n.text)}\n`;
        out += '```\n\n';
      }
    }

    return out.trimEnd() + '\n';
  }

  function buildTreeHtml(exportData) {
    const date = formatDate(new Date());
    const nodes = Array.isArray(exportData.nodes) ? exportData.nodes : [];

    let body = '';
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const images = (Array.isArray(n.imageUrls) ? n.imageUrls : [])
        .map((url, idx) => {
          const safe = String(url || '').trim();
          if (!safe) return '';
          return `<figure class="img"><img src="${escapeHtml(safe)}" alt="node-${i + 1}-img-${idx + 1}" loading="lazy" referrerpolicy="no-referrer" /><figcaption><a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(safe)}</a></figcaption></figure>`;
        })
        .join('');

      const unresolved = Array.isArray(n.unresolvedFileIds) && n.unresolvedFileIds.length
        ? `<p class="warn">未解析图片资源 ID：${escapeHtml(n.unresolvedFileIds.join(', '))}</p>`
        : '';

      body += `<section class="node">
  <h2>节点 ${i + 1} · ${escapeHtml(roleLabel(n.role))}</h2>
  <ul class="meta">
    <li><strong>nodeId</strong> <code>${escapeHtml(n.nodeId || '')}</code></li>
    <li><strong>messageId</strong> <code>${escapeHtml(n.messageId || '')}</code></li>
    <li><strong>parent</strong> <code>${escapeHtml(n.parentNodeId || '')}</code></li>
    <li><strong>children</strong> ${Array.isArray(n.children) ? n.children.length : 0}</li>
    <li><strong>depth</strong> ${Math.max(0, Number(n.depth) || 0)}</li>
    <li><strong>content_type</strong> <code>${escapeHtml(n.contentType || '')}</code></li>
  </ul>
  ${images ? `<div class="images">${images}</div>` : ''}
  ${unresolved}
  ${n.text ? `<pre>${escapeHtml(n.text)}</pre>` : ''}
</section>`;
    }

    const warnings = Array.isArray(exportData.warnings) && exportData.warnings.length
      ? `<section class="warnbox"><h2>警告</h2><ul>${exportData.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></section>`
      : '';

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>ChatGPT Tree Export ${escapeHtml(date)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; line-height: 1.55; max-width: 1040px; margin: 0 auto; padding: 22px; }
    h1 { font-size: 24px; margin: 0 0 16px; }
    h2 { font-size: 16px; margin: 0 0 10px; }
    .meta { margin: 0 0 12px 16px; padding: 0; }
    .node { border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 14px 16px; margin: 12px 0; background: rgba(0,0,0,.03); }
    @media (prefers-color-scheme: dark) { .node { border-color: rgba(255,255,255,.16); background: rgba(255,255,255,.06); } }
    pre { overflow: auto; padding: 12px; border-radius: 10px; background: rgba(0,0,0,.06); }
    @media (prefers-color-scheme: dark) { pre { background: rgba(255,255,255,.10); } }
    .images { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin: 8px 0 12px; }
    figure.img { margin: 0; border: 1px solid rgba(0,0,0,.12); border-radius: 10px; padding: 8px; background: rgba(0,0,0,.02); }
    @media (prefers-color-scheme: dark) { figure.img { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.04); } }
    figure.img img { width: 100%; height: auto; border-radius: 8px; display: block; }
    figure.img figcaption { margin-top: 6px; font-size: 12px; word-break: break-all; }
    .warn { color: #b45309; }
    .warnbox { border: 1px dashed rgba(180,83,9,.5); padding: 10px 12px; border-radius: 10px; margin: 12px 0 18px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(date)} ChatGPT 对话树导出</h1>
  <ul>
    <li>会话 ID: <code>${escapeHtml(exportData.conversationId || '')}</code></li>
    <li>根节点: <code>${escapeHtml(exportData.rootNodeId || '')}</code></li>
    <li>当前节点: <code>${escapeHtml(exportData.currentNodeId || '')}</code></li>
    <li>节点总数: ${Math.max(0, Number(exportData.nodeCount) || 0)}</li>
  </ul>
  ${warnings}
  ${body}
</body>
</html>`;
  }

  function getTurns() {
    try {
      const core = getCore();
      if (core && typeof core.getTurnArticles === 'function') {
        const root = typeof core.getTurnsRoot === 'function' ? core.getTurnsRoot() : document;
        const turns = core.getTurnArticles(root);
        if (Array.isArray(turns) && turns.length) return turns;
      }
    } catch {}
    return Array.from(document.querySelectorAll(DOM_TURN_SELECTOR));
  }

  function findUserContent(turn) {
    const host = turn.querySelector('[data-message-author-role="user"]');
    if (!host) return null;
    return host.querySelector('.whitespace-pre-wrap') || host;
  }

  function findAssistantContent(turn) {
    const host = turn.querySelector('[data-message-author-role="assistant"]');
    if (!host) return null;
    return host.querySelector('.markdown') || host.querySelector('.prose') || host;
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

  function ensureBlankLine(text) {
    const s = String(text ?? '').trimEnd();
    return s ? `${s}\n\n` : '';
  }

  function nodeToMarkdown(node, ctx) {
    const context = ctx || { listDepth: 0, ordered: false, index: 1, quoteDepth: 0 };

    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return mdEscapeInline(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node;
    const tag = (el.tagName || '').toLowerCase();

    if (tag === 'br') return '\n';

    if (tag === 'pre') {
      const lang = getCodeFenceLang(el);
      const codeText = normalizeText(el.textContent || '');
      const fence = '```';
      return `\n${fence}${lang}\n${codeText}\n${fence}\n\n`;
    }

    if (tag === 'code') {
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

  function buildDomMessages() {
    const turns = getTurns();
    if (!turns.length) return { ok: false, error: '未找到任何对话内容。请确认当前页面有对话。' };

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

  function exportDomAsMarkdown(date, convoId) {
    const res = buildDomMessages();
    if (!res.ok) {
      alert(res.error);
      return;
    }

    const fileName = convoId ? `chatgpt-${sanitizeFilePart(convoId)}-${date}.md` : `chatgpt-${date}.md`;
    let out = `# ${date} ChatGPT对话记录（当前可见）\n\n`;
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

  function exportDomAsHtml(date, convoId) {
    const res = buildDomMessages();
    if (!res.ok) {
      alert(res.error);
      return;
    }

    const fileName = convoId ? `chatgpt-${sanitizeFilePart(convoId)}-${date}.html` : `chatgpt-${date}.html`;
    let body = '';
    let userIndex = 1;
    let assistantIndex = 1;

    for (const msg of res.messages) {
      if (msg.role === 'user') {
        body += `<section class="msg user"><h2>User ${userIndex}</h2><div class="content">${sanitizeExportHtmlFromElement(msg.el)}</div></section>`;
        userIndex += 1;
        continue;
      }
      body += `<section class="msg assistant"><h2>Assistant ${assistantIndex}</h2><div class="content">${sanitizeExportHtmlFromElement(msg.el)}</div></section>`;
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
  <h1>${escapeHtml(date)} ChatGPT对话记录（当前可见）</h1>
  ${body}
</body>
</html>`;

    downloadText(html, fileName, 'text/html;charset=utf-8');
  }

  async function exportTreeAsMarkdown() {
    const date = formatDate(new Date());
    const convoId = getConversationIdFromUrl();
    const treeRes = await buildTreeExportPayload();

    if (treeRes.ok && treeRes.data) {
      const fileName = convoId ? `chatgpt-tree-${sanitizeFilePart(convoId)}-${date}.md` : `chatgpt-tree-${date}.md`;
      const text = buildTreeMarkdown(treeRes.data);
      downloadText(text, fileName, 'text/markdown;charset=utf-8');
      return;
    }

    console.warn('[chatgpt-export-conversation] 树导出失败，回退到当前可见导出：', treeRes.error || 'unknown');
    exportDomAsMarkdown(date, convoId);
  }

  async function exportTreeAsHtml() {
    const date = formatDate(new Date());
    const convoId = getConversationIdFromUrl();
    const treeRes = await buildTreeExportPayload();

    if (treeRes.ok && treeRes.data) {
      const fileName = convoId ? `chatgpt-tree-${sanitizeFilePart(convoId)}-${date}.html` : `chatgpt-tree-${date}.html`;
      const html = buildTreeHtml(treeRes.data);
      downloadText(html, fileName, 'text/html;charset=utf-8');
      return;
    }

    console.warn('[chatgpt-export-conversation] 树导出失败，回退到当前可见导出：', treeRes.error || 'unknown');
    exportDomAsHtml(date, convoId);
  }

  async function exportTreeAsJson() {
    const date = formatDate(new Date());
    const convoId = getConversationIdFromUrl();
    const treeRes = await buildTreeExportPayload();

    if (!treeRes.ok || !treeRes.data) {
      alert(`导出失败：${treeRes.error || '未知错误'}`);
      return;
    }

    const fileName = convoId ? `chatgpt-tree-${sanitizeFilePart(convoId)}-${date}.json` : `chatgpt-tree-${date}.json`;
    const json = JSON.stringify(treeRes.data, null, 2);
    downloadText(json, fileName, 'application/json;charset=utf-8');
  }

  function registerCommands() {
    let reg = null;
    try {
      reg = window.__quicknavRegisterMenuCommand;
    } catch {
      reg = null;
    }
    if (typeof reg !== 'function') return;

    reg('导出为 Markdown', exportTreeAsMarkdown, { moduleId: 'chatgpt_export_conversation' });
    reg('导出为 HTML', exportTreeAsHtml, { moduleId: 'chatgpt_export_conversation' });
    reg('导出为 JSON（整棵树）', exportTreeAsJson, { moduleId: 'chatgpt_export_conversation' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerCommands, { once: true });
  } else {
    registerCommands();
  }
})();
