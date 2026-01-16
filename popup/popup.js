(() => {
  'use strict';

  const REPO = 'lueluelue2006/AIChat_Quick_Nav';
  const AUTHOR = 'lueluelue2006';
  const REPO_URL = `https://github.com/${REPO}`;
  const RAW_MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/manifest.json`;

  const elAuthor = document.getElementById('author');
  const elVersion = document.getElementById('version');
  const elStatus = document.getElementById('status');
  const btnCheck = document.getElementById('checkUpdate');
  const btnOpen = document.getElementById('openRepo');
  const btnOptions = document.getElementById('openOptions');

  function setStatus(text, kind = '') {
    elStatus.textContent = text || '';
    elStatus.classList.remove('ok', 'warn', 'err');
    if (kind) elStatus.classList.add(kind);
  }

  function parseSemver(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    const core = s.split('-')[0].split('+')[0];
    const parts = core.split('.').map((p) => {
      const m = String(p).match(/^\d+/);
      return m ? Number(m[0]) : 0;
    });
    if (!parts.length) return null;
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
  }

  function cmpSemver(a, b) {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    if (!pa || !pb) return 0;
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  function openUrl(url) {
    try {
      chrome.tabs.create({ url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function openOptions() {
    try {
      if (chrome?.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        return;
      }
      const url = chrome?.runtime?.getURL?.('options/options.html') || 'options/options.html';
      openUrl(url);
    } catch {
      setStatus('打开配置失败', 'err');
    }
  }

  async function fetchRemoteManifestVersion() {
    const url = `${RAW_MANIFEST_URL}?t=${Date.now()}`;
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return String(json?.version || '').trim();
  }

  async function checkUpdate() {
    const localVersion = chrome?.runtime?.getManifest?.()?.version || '';
    setStatus('正在检查更新…');
    btnCheck.disabled = true;
    try {
      const remoteVersion = await fetchRemoteManifestVersion();
      if (!remoteVersion) throw new Error('远端 manifest.json 没有 version 字段');

      const cmp = cmpSemver(remoteVersion, localVersion);
      if (cmp > 0) {
        setStatus(`发现新版本：v${remoteVersion}\n当前版本：v${localVersion}\n\n打开仓库链接获取最新代码后，在 chrome://extensions 里点“重新加载”。`, 'warn');
        return;
      }
      if (cmp < 0) {
        setStatus(`远端版本：v${remoteVersion}\n当前版本：v${localVersion}\n\n当前版本比远端新（可能在本地开发中）。`, 'ok');
        return;
      }
      setStatus(`已是最新版本：v${localVersion}`, 'ok');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`检查失败：${msg}\n\n你可以直接打开仓库链接手动查看更新。`, 'err');
    } finally {
      btnCheck.disabled = false;
    }
  }

  // init
  try {
    elAuthor.textContent = AUTHOR;
    elVersion.textContent = chrome?.runtime?.getManifest?.()?.version || 'unknown';
    setStatus('就绪');
  } catch {
    setStatus('初始化失败', 'err');
  }

  btnOpen?.addEventListener('click', () => openUrl(REPO_URL));
  btnCheck?.addEventListener('click', checkUpdate);
  btnOptions?.addEventListener('click', openOptions);
})();
