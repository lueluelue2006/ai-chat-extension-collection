/* Shared ChatGPT usage monitor helpers
 * - Used by Options UI for import/export/merge
 * - Exposed as a global for extension pages
 * - Also exportable via CommonJS for internal verification
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
  const LEGACY_NOMINAL_UNLIMITED_QUOTA = 10000;
  const LEGACY_NOMINAL_UNLIMITED_WINDOW_TYPE = 'hour3';

  function tsOf(req) {
    if (typeof req === 'number') return req;
    if (req && typeof req.t === 'number') return req.t;
    if (req && typeof req.timestamp === 'number') return req.timestamp;
    return NaN;
  }

  function upgradeLegacyNominalUnlimitedEntry(entry) {
    if (!entry || typeof entry !== 'object' || entry.nominalUnlimited !== true) return false;
    entry.quota = LEGACY_NOMINAL_UNLIMITED_QUOTA;
    entry.windowType = LEGACY_NOMINAL_UNLIMITED_WINDOW_TYPE;
    try {
      delete entry.nominalUnlimited;
    } catch {
      entry.nominalUnlimited = false;
    }
    return true;
  }

  function validateImportedData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!('models' in data) || !data.models || typeof data.models !== 'object') return false;
    for (const [modelKey, model] of Object.entries(data.models)) {
      if (!modelKey) return false;
      if (!model || typeof model !== 'object') return false;
      if (!Array.isArray(model.requests)) return false;
      if (typeof model.quota !== 'number' && typeof model.sharedGroup !== 'string') return false;
      if ('nominalUnlimited' in model && typeof model.nominalUnlimited !== 'boolean') return false;
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
    Object.values(result.models).forEach((model) => {
      upgradeLegacyNominalUnlimitedEntry(model);
    });

    const importedModels = importedData?.models && typeof importedData.models === 'object' ? importedData.models : {};
    for (const [modelKey, importedModel] of Object.entries(importedModels)) {
      if (!result.models[modelKey]) {
        const importedQuota = importedModel.nominalUnlimited === true
          ? LEGACY_NOMINAL_UNLIMITED_QUOTA
          : typeof importedModel.quota === 'number'
            ? importedModel.quota
            : 50;
        const importedWindowType = importedModel.nominalUnlimited === true
          ? LEGACY_NOMINAL_UNLIMITED_WINDOW_TYPE
          : importedModel.windowType || 'daily';
        result.models[modelKey] = {
          requests: [],
          quota: importedQuota,
          windowType: importedWindowType
        };
        if (importedModel.sharedGroup) result.models[modelKey].sharedGroup = importedModel.sharedGroup;
      }
      upgradeLegacyNominalUnlimitedEntry(result.models[modelKey]);

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
      if (importedModel.nominalUnlimited === true) upgradeLegacyNominalUnlimitedEntry(result.models[modelKey]);
    }

    return result;
  }

  function formatTimestampForFilename(date = new Date()) {
    return new Date(date).toISOString().replace(/[:.]/g, '-');
  }

  function buildLegacyMonthlyReport(
    usageData,
    {
      now = new Date(),
      preferredOrder = [],
      knownModelKeys = [],
      unknownMergeTarget = 'gpt-5-3-instant'
    } = {}
  ) {
    const current = now instanceof Date ? now : new Date(now);
    const todayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
    const thirtyDaysAgoStart = todayStart - 29 * TIME_WINDOWS.daily;
    const report = {
      totalRequests: 0,
      modelBreakdown: {},
      dailyData: [],
      peakDay: '',
      averageDaily: 0,
      generatedAt: new Date().toISOString()
    };
    for (let i = 0; i < 30; i += 1) {
      const dayStart = todayStart - (29 - i) * TIME_WINDOWS.daily;
      const date = new Date(dayStart);
      report.dailyData.push({
        date: date.toLocaleDateString('zh-CN'),
        dayOfWeek: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
        models: {},
        total: 0,
        dayStart,
        dayEnd: dayStart + TIME_WINDOWS.daily - 1
      });
    }

    const models = usageData?.models && typeof usageData.models === 'object' ? usageData.models : {};
    const sortedModelEntries = [];
    for (const modelKey of preferredOrder) {
      if (models[modelKey]) sortedModelEntries.push([modelKey, models[modelKey]]);
    }
    for (const [modelKey, model] of Object.entries(models)) {
      if (!preferredOrder.includes(modelKey)) sortedModelEntries.push([modelKey, model]);
    }

    sortedModelEntries.forEach(([modelKey, model]) => {
      const validRequests = (Array.isArray(model?.requests) ? model.requests : [])
        .map((req) => tsOf(req))
        .filter((ts) => Number.isFinite(ts) && ts >= thirtyDaysAgoStart && ts < todayStart + TIME_WINDOWS.daily);
      if (validRequests.length <= 0) return;
      if (!report.modelBreakdown[modelKey]) report.modelBreakdown[modelKey] = 0;
      validRequests.forEach((ts) => {
        const dayData = report.dailyData.find((day) => ts >= day.dayStart && ts <= day.dayEnd);
        if (!dayData) return;
        dayData.total += 1;
        dayData.models[modelKey] = (dayData.models[modelKey] || 0) + 1;
        report.modelBreakdown[modelKey] += 1;
        report.totalRequests += 1;
      });
    });

    const activeDays = report.dailyData.filter((d) => d.total > 0).length || 1;
    report.averageDaily = Math.round(report.totalRequests / activeDays);
    const maxDayUsage = Math.max(...report.dailyData.map((d) => d.total), 0);
    const peakDayData = report.dailyData.find((d) => d.total === maxDayUsage);
    if (peakDayData) report.peakDay = `${peakDayData.date} ${peakDayData.dayOfWeek}`;

    try {
      const known = new Set([...(Array.isArray(knownModelKeys) ? knownModelKeys : []), unknownMergeTarget, 'alpha']);
      if (!report.modelBreakdown[unknownMergeTarget]) report.modelBreakdown[unknownMergeTarget] = 0;
      const unknownKeys = Object.keys(report.modelBreakdown).filter((key) => !known.has(key));
      for (const key of unknownKeys) {
        report.modelBreakdown[unknownMergeTarget] += report.modelBreakdown[key] || 0;
        delete report.modelBreakdown[key];
      }
      for (const day of report.dailyData) {
        let add = 0;
        for (const key of unknownKeys) {
          if (day.models[key]) {
            add += day.models[key];
            delete day.models[key];
          }
        }
        if (add > 0) day.models[unknownMergeTarget] = (day.models[unknownMergeTarget] || 0) + add;
      }
    } catch {}

    return report;
  }

  function createLegacyMonthlyUsageReportHtml(
    usageData,
    {
      now = Date.now(),
      preferredOrder = [],
      knownModelKeys = []
    } = {}
  ) {
    const report = buildLegacyMonthlyReport(usageData, {
      now,
      preferredOrder,
      knownModelKeys,
      unknownMergeTarget: 'gpt-5-3-instant'
    });
    const sortedModelKeys = preferredOrder
      .filter((modelKey) => report.modelBreakdown[modelKey])
      .concat(Object.keys(report.modelBreakdown).filter((key) => !preferredOrder.includes(key)));
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ChatGPT 一个月用量分析报告 - ${new Date(now).toLocaleDateString('zh-CN')}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: #1a1b1e;
        color: #e5e7eb;
        padding: 20px;
        margin: 0;
    }
    .container {
        max-width: 1200px;
        margin: 0 auto;
    }
    h1, h2 {
        color: #f59e0b;
    }
    .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 40px;
    }
    .card {
        background: #2a2b2e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #363636;
    }
    .card h3 {
        margin-top: 0;
        color: #9ca3af;
        font-size: 14px;
    }
    .card .value {
        font-size: 28px;
        font-weight: bold;
        color: #f59e0b;
    }
    .card .subtext {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 4px;
    }
    .chart-container {
        background: #2a2b2e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #363636;
        margin-bottom: 20px;
        position: relative;
    }
    .chart-container.daily {
        height: 500px;
    }
    .chart-container.pie {
        height: 350px;
    }
    .table-container {
        background: #2a2b2e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #363636;
        overflow-x: auto;
        max-height: 600px;
        overflow-y: auto;
    }
    table {
        width: 100%;
        border-collapse: collapse;
    }
    th, td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid #363636;
        font-size: 12px;
    }
    th {
        background: #1a1b1e;
        color: #f59e0b;
        font-weight: 600;
        position: sticky;
        top: 0;
        z-index: 1;
    }
    .highlight {
        color: #f59e0b;
        font-weight: bold;
    }
    .footer {
        text-align: center;
        margin-top: 40px;
        color: #9ca3af;
        font-size: 12px;
    }
    .info-text {
        color: #9ca3af;
        font-size: 14px;
        margin: 10px 0;
    }
    .week-separator {
        border-top: 2px solid #f59e0b;
        background: rgba(245, 158, 11, 0.1);
    }
</style>
</head>
<body>
<div class="container">
    <h1>ChatGPT 一个月用量分析报告</h1>
    <p class="info-text">分析时间段: ${report.dailyData[0].date} 至 ${report.dailyData[29].date}</p>
    <p class="info-text">生成时间: ${new Date(now).toLocaleString('zh-CN')}</p>

    <div class="summary-cards">
        <div class="card">
            <h3>总请求数</h3>
            <div class="value">${report.totalRequests}</div>
            <div class="subtext">最近30天</div>
        </div>
        <div class="card">
            <h3>日均使用</h3>
            <div class="value">${report.averageDaily}</div>
            <div class="subtext">活跃天数平均</div>
        </div>
        <div class="card">
            <h3>使用高峰日</h3>
            <div class="value" style="font-size: 20px;">${report.peakDay || 'N/A'}</div>
        </div>
        <div class="card">
            <h3>活跃模型数</h3>
            <div class="value">${sortedModelKeys.length}</div>
            <div class="subtext">有使用记录</div>
        </div>
    </div>

    <h2>每日使用趋势</h2>
    <div class="chart-container daily">
        <canvas id="dailyChart"></canvas>
    </div>

    <h2>模型使用分布</h2>
    <div class="chart-container pie">
        <canvas id="modelChart"></canvas>
    </div>

    <h2>详细数据表</h2>
    <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th>日期</th>
                    <th>星期</th>
                    <th>总请求数</th>
                    ${sortedModelKeys.map((model) => `<th>${model}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${report.dailyData.map((day, index) => {
                  const isToday = index === 29;
                  const isWeekStart = new Date(day.dayStart).getDay() === 1;
                  return `
                    <tr ${isToday ? 'style="background: rgba(245, 158, 11, 0.1);"' : ''} ${isWeekStart && !isToday ? 'class="week-separator"' : ''}>
                        <td>${day.date} ${isToday ? '<span style="color: #f59e0b;">(今天)</span>' : ''}</td>
                        <td>${day.dayOfWeek}</td>
                        <td class="highlight">${day.total}</td>
                        ${sortedModelKeys.map((model) => `<td>${day.models[model] || 0}</td>`).join('')}
                    </tr>
                `;
                }).join('')}
            </tbody>
            <tfoot>
                <tr style="background: #1a1b1e; font-weight: bold;">
                    <td colspan="2">总计</td>
                    <td class="highlight">${report.totalRequests}</td>
                    ${sortedModelKeys.map((model) => `<td>${report.modelBreakdown[model] || 0}</td>`).join('')}
                </tr>
            </tfoot>
        </table>
    </div>

    <div class="footer">
        <p>此报告由 ChatGPT 用量统计脚本自动生成</p>
    </div>
</div>

<script>
    Chart.defaults.color = '#9ca3af';
    Chart.defaults.borderColor = '#363636';

    const dailyCtx = document.getElementById('dailyChart').getContext('2d');
    new Chart(dailyCtx, {
        type: 'line',
        data: {
            labels: ${JSON.stringify(report.dailyData.map((d, i) => i === 29 ? d.date + ' (今天)' : d.date))},
            datasets: [{
                label: '每日请求数',
                data: ${JSON.stringify(report.dailyData.map((d) => d.total))},
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: '#f59e0b',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            const dayData = ${JSON.stringify(report.dailyData.map((d) => d.dayOfWeek))};
                            return dayData[index];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#363636'
                    },
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    grid: {
                        color: '#363636'
                    },
                    ticks: {
                        maxTicksLimit: 15,
                        callback: function(value, index) {
                            const date = new Date(${JSON.stringify(report.dailyData.map((d) => d.dayStart))}[index]);
                            if (index === 0 || index === 14 || index === 29 || date.getDate() === 1 || date.getDay() === 1) {
                                return this.getLabelForValue(value);
                            }
                            return '';
                        }
                    }
                }
            }
        }
    });

    const modelCtx = document.getElementById('modelChart').getContext('2d');
    new Chart(modelCtx, {
        type: 'doughnut',
        data: {
            labels: ${JSON.stringify(sortedModelKeys)},
            datasets: [{
                data: ${JSON.stringify(sortedModelKeys.map((key) => report.modelBreakdown[key] || 0))},
                backgroundColor: [
                    '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
                    '#9333ea', '#ec4899', '#14b8a6', '#f97316',
                    '#06b6d4', '#84cc16', '#f43f5e', '#8b5cf6'
                ],
                borderWidth: 2,
                borderColor: '#1a1b1e'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(2);
                            return label + ': ' + value + ' (' + percentage + '%)';
                        }
                    }
                }
            }
        }
    });
<\/script>
</body>
</html>`;
    return {
      report,
      html,
      filename: `chatgpt-monthly-analysis-${formatTimestampForFilename(now)}.html`
    };
  }

  const api = Object.freeze({
    TIME_WINDOWS,
    tsOf,
    validateImportedData,
    summarizeImport,
    mergeUsageData,
    createLegacyMonthlyUsageReportHtml
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
