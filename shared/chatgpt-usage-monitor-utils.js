/* Shared ChatGPT usage monitor helpers
 * - Used by Options UI for import/export/merge
 * - Exposed as a global for extension pages
 * - Also exportable via CommonJS for dev/unit tests
 */
(() => {
  'use strict';

  const API_KEY = '__aichatChatGPTUsageMonitorUtilsV1__';

  try {
    const existing = globalThis[API_KEY];
    if (existing && typeof existing === 'object') {
      if (typeof module === 'object' && module && module.exports) module.exports = existing;
      return;
    }
  } catch {}

  const TIME_WINDOWS = Object.freeze({
    hour3: 3 * 60 * 60 * 1000,
    hour5: 5 * 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000
  });

  function tsOf(req) {
    if (typeof req === 'number') return req;
    if (req && typeof req.t === 'number') return req.t;
    if (req && typeof req.timestamp === 'number') return req.timestamp;
    return NaN;
  }

  function validateImportedData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!('models' in data) || !data.models || typeof data.models !== 'object') return false;
    for (const [modelKey, model] of Object.entries(data.models)) {
      if (!modelKey) return false;
      if (!model || typeof model !== 'object') return false;
      if (!Array.isArray(model.requests)) return false;
      if (typeof model.quota !== 'number' && typeof model.sharedGroup !== 'string') return false;
      if (model.windowType && !TIME_WINDOWS[String(model.windowType)]) return false;
    }
    return true;
  }

  function summarizeImport(importedData) {
    const models = importedData && importedData.models && typeof importedData.models === 'object' ? importedData.models : {};
    const entries = Object.entries(models);
    const modelCount = entries.length;
    let totalRequests = 0;
    const detail = [];
    for (const [k, m] of entries) {
      const c = Array.isArray(m?.requests) ? m.requests.length : 0;
      totalRequests += c;
      if (c > 0) detail.push(`${k}: ${c}条`);
    }
    const head = `共 ${modelCount} 个模型，${totalRequests} 条请求记录`;
    if (detail.length <= 8) return `${head}\n\n模型详情:\n${detail.join('\n')}`;
    return head;
  }

  function mergeUsageData(currentData, importedData, { now = Date.now() } = {}) {
    const base = currentData && typeof currentData === 'object' ? currentData : {};
    const result = JSON.parse(JSON.stringify(base));
    result.models = result.models && typeof result.models === 'object' ? result.models : {};

    const importedModels = importedData?.models && typeof importedData.models === 'object' ? importedData.models : {};
    for (const [modelKey, importedModel] of Object.entries(importedModels)) {
      if (!result.models[modelKey]) {
        result.models[modelKey] = {
          requests: [],
          quota: typeof importedModel.quota === 'number' ? importedModel.quota : 50,
          windowType: importedModel.windowType || 'daily'
        };
        if (importedModel.sharedGroup) result.models[modelKey].sharedGroup = importedModel.sharedGroup;
      }

      const currentRequests = Array.isArray(result.models[modelKey].requests) ? result.models[modelKey].requests : [];
      const windowType = String(result.models[modelKey].windowType || 'daily');
      const windowDuration = TIME_WINDOWS[windowType] || TIME_WINDOWS.daily;
      const oldestRelevantTime = Number(now) - windowDuration;

      const relevantImportedRequests = (Array.isArray(importedModel.requests) ? importedModel.requests : [])
        .map((req) => tsOf(req))
        .filter((ts) => Number.isFinite(ts) && ts > oldestRelevantTime);

      const existingTimeMap = new Map();
      for (const req of currentRequests) {
        const t = tsOf(req);
        if (!Number.isFinite(t)) continue;
        const rounded = Math.floor(t / 1000) * 1000;
        existingTimeMap.set(rounded, true);
      }

      const newRequests = [];
      for (const ts of relevantImportedRequests) {
        const rounded = Math.floor(ts / 1000) * 1000;
        if (existingTimeMap.has(rounded)) continue;
        existingTimeMap.set(rounded, true);
        newRequests.push(ts);
      }

      result.models[modelKey].requests = [...currentRequests.map(tsOf), ...newRequests]
        .filter((ts) => Number.isFinite(ts))
        .sort((a, b) => b - a);
    }

    return result;
  }

  const api = Object.freeze({
    TIME_WINDOWS,
    tsOf,
    validateImportedData,
    summarizeImport,
    mergeUsageData
  });

  try {
    Object.defineProperty(globalThis, API_KEY, { value: api, configurable: false, enumerable: false, writable: false });
  } catch {
    try {
      globalThis[API_KEY] = api;
    } catch {}
  }

  if (typeof module === 'object' && module && module.exports) module.exports = api;
})();

