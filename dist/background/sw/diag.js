(() => {
  "use strict";
  const root = globalThis;
  if (!root.__aiShortcutsSw || typeof root.__aiShortcutsSw !== "object") root.__aiShortcutsSw = {};
  const ns = root.__aiShortcutsSw;
  const MAX_EVENTS = 500;
  const MAX_TEXT_LEN = 512;
  const DUP_BURST_WINDOW_MS = 15e3;
  const DUP_BURST_ALLOW = 5;
  const DUP_MSG_TRACK_MAX = 128;
  const ring = new Array(MAX_EVENTS);
  let head = 0;
  let size = 0;
  let droppedDuplicateMsgCount = 0;
  const duplicateMsgState = /* @__PURE__ */ new Map();
  function clipText(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.length <= MAX_TEXT_LEN ? trimmed : trimmed.slice(0, MAX_TEXT_LEN);
  }
  function normalizeTimestamp(value) {
    if (Number.isFinite(value)) {
      const ts = Math.floor(value);
      if (ts > 0) return ts;
    }
    return Date.now();
  }
  function normalizeType(value) {
    const text = clipText(value);
    return text || "event";
  }
  function redactUrl(input) {
    const text = clipText(input);
    if (!text) return "";
    try {
      const parsed = new URL(text);
      const pathname = typeof parsed.pathname === "string" && parsed.pathname ? parsed.pathname : "/";
      return `${parsed.origin}${pathname}`;
    } catch {
      return "";
    }
  }
  function normalizeTabId(value) {
    if (!Number.isFinite(value)) return null;
    const tabId = Math.trunc(value);
    return Number.isFinite(tabId) ? tabId : null;
  }
  function normalizeEvent(input) {
    const event = {
      ts: normalizeTimestamp(input?.ts),
      type: normalizeType(input?.type)
    };
    const siteId = clipText(input?.siteId);
    if (siteId) event.siteId = siteId;
    const moduleId = clipText(input?.moduleId);
    if (moduleId) event.moduleId = moduleId;
    const world = clipText(input?.world);
    if (world) event.world = world;
    const tabId = normalizeTabId(input?.tabId);
    if (tabId !== null) event.tabId = tabId;
    const msg = clipText(input?.msg);
    if (msg) event.msg = msg;
    const url = redactUrl(input?.url);
    if (url) event.url = url;
    return event;
  }
  function trimDuplicateStateMap() {
    while (duplicateMsgState.size > DUP_MSG_TRACK_MAX) {
      const first = duplicateMsgState.keys().next();
      if (first.done) return;
      duplicateMsgState.delete(first.value);
    }
  }
  function shouldDropDueToDuplicateMsg(event) {
    const msg = event.msg;
    if (!msg) return false;
    const type = event.type.toLowerCase();
    if (!type.includes("error") && !msg.toLowerCase().includes("error")) return false;
    const now = event.ts;
    const state = duplicateMsgState.get(msg);
    if (!state || now - state.windowStart > DUP_BURST_WINDOW_MS) {
      duplicateMsgState.set(msg, { windowStart: now, count: 1 });
      trimDuplicateStateMap();
      return false;
    }
    state.count += 1;
    if (state.count <= DUP_BURST_ALLOW) return false;
    droppedDuplicateMsgCount += 1;
    return true;
  }
  function pushEvent(event) {
    ring[head] = event;
    head = (head + 1) % MAX_EVENTS;
    if (size < MAX_EVENTS) size += 1;
  }
  function getEventsSnapshot() {
    if (!size) return [];
    if (size < MAX_EVENTS) return ring.slice(0, size);
    return ring.slice(head).concat(ring.slice(0, head));
  }
  function log(input) {
    const event = normalizeEvent(input);
    if (shouldDropDueToDuplicateMsg(event)) return;
    pushEvent(event);
  }
  function dump(options) {
    const events = getEventsSnapshot();
    const tailRaw = options?.tail;
    const hasTail = Number.isFinite(tailRaw);
    const tail = hasTail ? Math.max(0, Math.floor(tailRaw)) : 0;
    const clippedTail = tail > MAX_EVENTS ? MAX_EVENTS : tail;
    return {
      max: MAX_EVENTS,
      size,
      droppedDuplicateMsgCount,
      events: hasTail ? clippedTail > 0 ? events.slice(-clippedTail) : [] : events
    };
  }
  function clear() {
    head = 0;
    size = 0;
    droppedDuplicateMsgCount = 0;
    duplicateMsgState.clear();
  }
  ns.diag = Object.assign({}, ns.diag || {}, {
    MAX_EVENTS,
    redactUrl,
    log,
    dump,
    clear
  });
})();
