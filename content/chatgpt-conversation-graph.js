(() => {
  'use strict';

  const API_KEY = '__aichat_chatgpt_conversation_graph_v1__';
  const API_VERSION = 1;

  try {
    const prev = globalThis[API_KEY];
    if (prev && typeof prev === 'object' && Number(prev.version || 0) >= API_VERSION) return;
  } catch {}

  function getRootNodeId(mapping) {
    if (mapping && typeof mapping === 'object') {
      if (mapping['client-created-root']) return 'client-created-root';
      for (const [k, v] of Object.entries(mapping)) {
        if (v && v.parent == null) return k;
      }
    }
    return '';
  }

  function buildMessageIdNodeIdIndex(mapping) {
    const idx = new Map();
    if (!mapping || typeof mapping !== 'object') return idx;
    try {
      for (const [nodeId, node] of Object.entries(mapping)) {
        const mid = typeof node?.message?.id === 'string' ? node.message.id : '';
        if (!mid || idx.has(mid)) continue;
        idx.set(mid, nodeId);
      }
    } catch {}
    return idx;
  }

  function resolveNodeIdForMessageId(mapping, messageId, lookupState) {
    const id = String(messageId || '').trim();
    if (!id || !mapping || typeof mapping !== 'object') return '';
    try {
      if (Object.prototype.hasOwnProperty.call(mapping, id)) return id;
    } catch {}
    const state = lookupState && typeof lookupState === 'object' ? lookupState : null;
    const quickIdx = state?.messageIdToNodeId instanceof Map ? state.messageIdToNodeId : null;
    if (quickIdx) return String(quickIdx.get(id) || '');
    try {
      const next = buildMessageIdNodeIdIndex(mapping);
      if (state) state.messageIdToNodeId = next;
      return String(next.get(id) || '');
    } catch {
      return '';
    }
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

  function getCurrentBranchNodeIds(mapping, rootNodeId, currentNodeId) {
    const rootId = String(rootNodeId || '');
    const currentId = String(currentNodeId || '');
    const fallbackId = currentId || rootId;
    if (!fallbackId || !mapping || typeof mapping !== 'object') return [];

    const seen = new Set();
    const path = [];
    let cur = fallbackId;
    let guard = 0;

    while (cur && guard < 4096 && !seen.has(cur)) {
      guard += 1;
      seen.add(cur);
      path.unshift(cur);
      if (cur === rootId) break;
      const node = mapping?.[cur] || null;
      const parent = typeof node?.parent === 'string' ? node.parent : '';
      if (!parent || !mapping?.[parent]) break;
      cur = parent;
    }

    if (rootId && mapping?.[rootId] && path[0] !== rootId) path.unshift(rootId);
    return path.filter((id, idx, arr) => id && arr.indexOf(id) === idx);
  }

  function resolveVisibleCurrentNodeId(mapping, fallbackCurrentNodeId, options = {}) {
    const fallback = String(fallbackCurrentNodeId || '');
    try {
      const getVisibleMessageIds =
        options && typeof options === 'object' && typeof options.getVisibleMessageIds === 'function'
          ? options.getVisibleMessageIds
          : null;
      if (!getVisibleMessageIds) return fallback;
      const turns = getVisibleMessageIds();
      if (!Array.isArray(turns) || !turns.length) return fallback;
      const seen = new Set();
      const lookupState = { messageIdToNodeId: null };
      for (let i = turns.length - 1; i >= 0; i -= 1) {
        const messageId = String(turns[i] || '').trim();
        if (!messageId || seen.has(messageId)) continue;
        seen.add(messageId);
        const nodeId = resolveNodeIdForMessageId(mapping, messageId, lookupState);
        if (nodeId) return nodeId;
      }
    } catch {}
    return fallback;
  }

  function createDisplayGraph(mapping, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const rootNodeId = String(opts.rootId || getRootNodeId(mapping) || '');
    const requestedCurrentNodeId = String(opts.currentId || '');
    const extractText = typeof opts.extractText === 'function' ? opts.extractText : () => '';
    const formatSnippet = typeof opts.formatSnippet === 'function' ? opts.formatSnippet : (text) => String(text || '');
    const isNodeHidden = typeof opts.isNodeHidden === 'function' ? opts.isNodeHidden : () => false;

    function unwrapVisibleNodes(nodeId, localSeen, guard) {
      const id = String(nodeId || '');
      if (!id) return [];
      if (localSeen.has(id)) return [];
      if ((guard || 0) > 4096) return [];
      localSeen.add(id);

      const node = mapping?.[id] || null;
      if (!node) return [];

      if (isNodeHidden(id, node)) {
        const children = Array.isArray(node?.children) ? node.children : [];
        let out = [];
        for (const c of children) out = out.concat(unwrapVisibleNodes(c, localSeen, (guard || 0) + 1));
        return out;
      }

      return [id];
    }

    function getDisplayChildren(nodeId) {
      const node = mapping?.[nodeId] || null;
      const children = Array.isArray(node?.children) ? node.children : [];
      const localSeen = new Set();
      let out = [];
      for (const childId of children) out = out.concat(unwrapVisibleNodes(childId, localSeen, 0));
      return [...new Set(out)];
    }

    function getEffectiveCurrentNodeId(currentId) {
      try {
        let cur = String(currentId || '');
        let guard = 0;
        while (cur && guard++ < 4096) {
          const node = mapping?.[cur];
          if (!isNodeHidden(cur, node)) return cur;
          cur = node && typeof node.parent === 'string' ? node.parent : '';
        }
      } catch {}
      return String(currentId || '');
    }

    function computeVisiblePathNodeIds(currentId) {
      const ordered = [];
      const seen = new Set();
      try {
        let cur = String(currentId || '');
        let guard = 0;
        while (cur && guard++ < 4096) {
          const node = mapping?.[cur];
          if (!isNodeHidden(cur, node) && !seen.has(cur)) {
            ordered.unshift(cur);
            seen.add(cur);
          }
          cur = node && typeof node.parent === 'string' ? node.parent : '';
        }
      } catch {}
      return ordered;
    }

    const effectiveCurrentNodeId = getEffectiveCurrentNodeId(requestedCurrentNodeId);
    const pathNodeIds = computeVisiblePathNodeIds(requestedCurrentNodeId);
    const pathNodeSet = new Set(pathNodeIds);
    const depthCache = new Map();
    const visited = new Set();
    const nodesByNodeId = {};
    const nodesByMessageId = {};
    let nodeCount = 0;
    let msgCount = 0;
    let branchCount = 0;
    let leafCount = 0;
    let maxDepth = 0;

    function walk(nodeId, guard) {
      const id = String(nodeId || '');
      if (!id || visited.has(id) || (guard || 0) > 4096) return;
      visited.add(id);

      const node = mapping?.[id] || null;
      const msg = node?.message || null;
      const msgId = typeof msg?.id === 'string' ? msg.id : id;
      const role = msg?.author?.role ? String(msg.author.role) : id === 'client-created-root' ? 'root' : '';
      const text = msg ? extractText(msg) : id === 'client-created-root' ? 'root' : '';
      const snippet = formatSnippet(text);
      const parentNodeId = typeof node?.parent === 'string' ? node.parent : '';
      const parentMsgId = parentNodeId
        ? typeof mapping?.[parentNodeId]?.message?.id === 'string'
          ? mapping[parentNodeId].message.id
          : parentNodeId
        : '';
      const childNodeIds = getDisplayChildren(id);
      const childMsgIds = childNodeIds.map((cid) => {
        const childNode = mapping?.[cid];
        return typeof childNode?.message?.id === 'string' ? childNode.message.id : String(cid || '');
      });
      const depth = computeDepthByParent(id, mapping, depthCache);

      nodeCount += 1;
      if (msg) msgCount += 1;
      if (childNodeIds.length > 1) branchCount += 1;
      if (childNodeIds.length === 0) leafCount += 1;
      maxDepth = Math.max(maxDepth, depth);

      const entry = {
        nodeId: id,
        msgId,
        parentNodeId,
        parentMsgId,
        role,
        snippet,
        depth,
        isCurrent: id === effectiveCurrentNodeId,
        isOnPath: pathNodeSet.has(id),
        childrenNodeIds: childNodeIds,
        childrenMsgIds: childMsgIds,
        childrenCount: childNodeIds.length
      };
      nodesByNodeId[id] = entry;
      nodesByMessageId[msgId] = entry;

      for (const childId of childNodeIds) walk(childId, (guard || 0) + 1);
    }

    if (rootNodeId) walk(rootNodeId, 0);

    const rootMsgId = rootNodeId
      ? typeof mapping?.[rootNodeId]?.message?.id === 'string'
        ? mapping[rootNodeId].message.id
        : rootNodeId
      : '';
    const currentMsgId = effectiveCurrentNodeId
      ? typeof mapping?.[effectiveCurrentNodeId]?.message?.id === 'string'
        ? mapping[effectiveCurrentNodeId].message.id
        : effectiveCurrentNodeId
      : '';
    const pathMsgIds = pathNodeIds.map((id) => {
      const node = mapping?.[id];
      return typeof node?.message?.id === 'string' ? node.message.id : String(id || '');
    });

    return {
      rootNodeId,
      effectiveCurrentNodeId,
      rootMsgId,
      currentMsgId,
      pathNodeIds,
      pathMsgIds,
      pathNodeSet,
      stats: { nodeCount, msgCount, branchCount, leafCount, maxDepth },
      nodesByNodeId,
      nodesByMessageId,
      getDisplayChildren
    };
  }

  const api = Object.freeze({
    version: API_VERSION,
    getRootNodeId,
    buildMessageIdNodeIdIndex,
    resolveNodeIdForMessageId,
    buildNodeVisitOrder,
    computeDepthByParent,
    getCurrentBranchNodeIds,
    resolveVisibleCurrentNodeId,
    createDisplayGraph
  });

  try {
    Object.defineProperty(globalThis, API_KEY, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }
})();
