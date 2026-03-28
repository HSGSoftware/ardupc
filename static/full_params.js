// ─────────────────────────────────────────────────────────────
// FULL PARAMETER EDITOR ENGINE
// ─────────────────────────────────────────────────────────────

const FULL_PARAMS_STATE = {
    drones: {}, // droneId -> { paramName: value }
    modified: {}, // droneId -> Set(paramNames)
    fetchStats: {} // droneId -> { count: 0, total: 1100, loading: false, lastUpdate: 0 }
};

const ESTIMATED_TOTAL_PARAMS = 1100;

// Initialize Styles for Full Params
(function initFullParamsStyles() {
    if (document.getElementById('full-params-styles')) return;
    const style = document.createElement('style');
    style.id = 'full-params-styles';
    style.textContent = `
        .full-params-container * { box-sizing: border-box; }
        .full-params-container { font-family: 'IBM Plex Sans', sans-serif; color: #f0f6ff; padding: 15px; display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .params-toolbar { display: flex; gap: 10px; margin-bottom: 15px; align-items: center; flex-wrap: wrap; flex-shrink: 0; }
        .params-search-input { flex: 1; min-width: 200px; background: #0f172a; border: 1px solid #334155; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 13px; outline: none; }
        .params-search-input:focus { border-color: #38bdf8; }
        
        .params-list-container { flex: 1; overflow-y: auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; }
        .params-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .params-table th { position: sticky; top: 0; background: #1e293b; text-align: left; padding: 10px; z-index: 1; border-bottom: 2px solid #0f172a; }
        .params-table td { padding: 8px 10px; border-bottom: 1px solid #1e293b; font-family: 'IBM Plex Mono', monospace; }
        .params-table tr:hover { background: rgba(255,255,255,0.02); }
        
        .param-input { background: #020917; border: 1px solid #334155; color: #38bdf8; padding: 4px 8px; border-radius: 4px; width: 100px; outline: none; text-align: right; }
        .param-input:focus { border-color: #38bdf8; background: #0a1628; }
        .param-name { color: #94a3b8; font-weight: 600; }
        
        .params-actions { display: flex; gap: 8px; margin-top: 15px; flex-shrink: 0; }
        .p-btn { padding: 8px 15px; border-radius: 6px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        .p-btn-primary { background: #38bdf8; color: #020917; }
        .p-btn-primary:hover { background: #0ea5e9; }
        .p-btn-secondary { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
        .p-btn-secondary:hover { border-color: #475569; color: #cbd5e1; }
        
        .params-loader { display: flex; align-items: center; gap: 10px; color: #38bdf8; font-size: 11px; margin-left: 10px; }
        
        /* Blocking Overlay */
        .params-blocking-overlay { 
            position: fixed; top: 40px; left: 0; width: 100%; height: calc(100% - 40px); 
            background: rgba(2, 9, 23, 0.85); backdrop-filter: blur(4px); 
            display: none; flex-direction: column; align-items: center; justify-content: center; 
            z-index: 1000; pointer-events: all;
        }
        .progress-container { width: 300px; height: 6px; background: #1e293b; border-radius: 3px; overflow: hidden; margin-top: 15px; }
        .progress-bar { width: 0%; height: 100%; background: #38bdf8; transition: width 0.1s; }
        .progress-text { font-family: 'IBM Plex Mono', monospace; font-size: 14px; color: #38bdf8; margin-top: 10px; font-weight: 700; }
        .progress-label { color: #94a3b8; font-size: 11px; margin-top: 5px; }
    `;
    document.head.appendChild(style);
})();

function getDroneParams(droneId) {
    if (!FULL_PARAMS_STATE.drones[droneId]) {
        FULL_PARAMS_STATE.drones[droneId] = {};
    }
    return FULL_PARAMS_STATE.drones[droneId];
}

let fullParamsPopupRef = null;

function openFullParamsPopup(droneId) {
    if (fullParamsPopupRef && !fullParamsPopupRef.closed) {
        fullParamsPopupRef.focus();
        return;
    }

    const width = 900;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    fullParamsPopupRef = window.open('', 'FullParamsPopup',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    if (!fullParamsPopupRef) {
        alert("Popup engellendi! Lütfen izin verin.");
        return;
    }

    const doc = fullParamsPopupRef.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="UTF-8">
            <title>ArduPilot Tüm Parametreler</title>
            <style>
                body { background-color: #020917; margin: 0; padding: 0; color: #f0f6ff; font-family: 'IBM Plex Sans', sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
                .p-tabs { display: flex; background: #0a1628; border-bottom: 1px solid #1e293b; flex-shrink: 0; padding: 0 10px; }
                .p-tab { padding: 12px 20px; color: #94a3b8; font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; }
                .p-tab.active { color: #38bdf8; border-bottom-color: #38bdf8; background: rgba(56, 189, 248, 0.05); }
                #p-container { flex: 1; overflow: hidden; }
            </style>
        </head>
        <body>
            <div id="p-tabs" class="p-tabs"></div>
            <div id="p-container"></div>
            <script>
                window.opener = window.opener;
                
                function switchTab(id) {
                    const tabs = document.querySelectorAll('.p-tab');
                    tabs.forEach(t => t.classList.remove('active'));
                    const activeTab = Array.from(tabs).find(t => t.innerText.includes(id === 'all' ? 'Tümü' : id));
                    if (activeTab) activeTab.classList.add('active');
                    
                    if (window.opener && window.opener.renderFullParams) {
                        window.opener.renderFullParams(document.getElementById('p-container'), id, document);
                    }
                }

                function initTabs() {
                    const tabsEl = document.getElementById('p-tabs');
                    if (!window.opener || !window.opener.appState) return;
                    const drones = window.opener.appState.drones || {};
                    
                    let html = '<div class="p-tab active" onclick="switchTab(\\'all\\')">Tümü (All)</div>';
                    Object.keys(drones).forEach(id => {
                        html += \`<div class="p-tab" onclick="switchTab('\${id}')">\${id}</div>\`;
                    });
                    tabsEl.innerHTML = html;
                }
                
                initTabs();
                switchTab('${droneId || 'all'}');
            </script>
            <div id="p-overlay" class="params-blocking-overlay">
                <div class="spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
                <div class="progress-container"><div id="p-bar" class="progress-bar"></div></div>
                <div id="p-percent" class="progress-text">0%</div>
                <div class="progress-label">Parametreler ArduPilot'tan çekiliyor...</div>
                <div style="font-size:10px; color:#666; margin-top:10px;">Lütfen bekleyin, binden fazla parametre yükleniyor.</div>
            </div>
        </body>
        </html>
    `);
    doc.close();

    // Inject Styles to Popup
    const popupStyle = doc.createElement('style');
    const mainStyle = document.getElementById('full-params-styles');
    if (mainStyle) popupStyle.textContent = mainStyle.textContent;
    doc.head.appendChild(popupStyle);
}

function renderFullParams(container, droneId, contextDoc = document) {
    if (!container) return;
    const uniqueId = droneId || 'all';
    container.innerHTML = '';

    const wrapper = contextDoc.createElement('div');
    wrapper.className = 'full-params-container';

    // Toolbar
    const toolbar = contextDoc.createElement('div');
    toolbar.className = 'params-toolbar';

    const searchInput = contextDoc.createElement('input');
    searchInput.className = 'params-search-input';
    searchInput.placeholder = 'Parametre ara... (Örn: BATT_MONITOR, SIM_WIND)';
    searchInput.id = 'p-search';

    const refreshBtn = contextDoc.createElement('button');
    refreshBtn.className = 'p-btn p-btn-secondary';
    refreshBtn.innerHTML = '🔄 Yenile';
    refreshBtn.onclick = () => refreshAllParams(uniqueId, contextDoc);

    const exportBtn = contextDoc.createElement('button');
    exportBtn.className = 'p-btn p-btn-secondary';
    exportBtn.innerHTML = '📤 Export';
    exportBtn.onclick = () => exportParams(uniqueId);

    const importBtn = contextDoc.createElement('button');
    importBtn.className = 'p-btn p-btn-secondary';
    importBtn.innerHTML = '📥 Import';
    importBtn.onclick = () => {
        const input = contextDoc.createElement('input');
        input.type = 'file';
        input.accept = '.param,.txt';
        input.onchange = (e) => importParams(uniqueId, e.target.files[0], contextDoc);
        input.click();
    };

    const loaderDiv = contextDoc.createElement('div');
    loaderDiv.id = 'p-loader';
    loaderDiv.className = 'params-loader';
    loaderDiv.style.display = 'none';
    loaderDiv.innerHTML = '<div class="spinner"></div><span>Yükleniyor...</span>';

    toolbar.appendChild(searchInput);
    toolbar.appendChild(refreshBtn);
    toolbar.appendChild(exportBtn);
    toolbar.appendChild(importBtn);
    toolbar.appendChild(loaderDiv);

    // List
    const listContainer = contextDoc.createElement('div');
    listContainer.className = 'params-list-container';
    listContainer.id = 'p-list';

    const table = contextDoc.createElement('table');
    table.className = 'params-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th width="40%">Parametre</th>
                <th width="60%">Değer</th>
            </tr>
        </thead>
        <tbody id="p-tbody"></tbody>
    `;
    listContainer.appendChild(table);

    // Footer Actions
    const footer = contextDoc.createElement('div');
    footer.className = 'params-actions';

    const applyBtn = contextDoc.createElement('button');
    applyBtn.className = 'p-btn p-btn-primary';
    applyBtn.innerHTML = '✅ Değişiklikleri Uygula';
    applyBtn.onclick = () => applyModifiedFullParams(uniqueId, contextDoc);

    footer.appendChild(applyBtn);

    wrapper.appendChild(toolbar);
    wrapper.appendChild(listContainer);
    wrapper.appendChild(footer);

    container.appendChild(wrapper);

    // Initial render of data
    updateParamsTable(uniqueId, contextDoc);

    // Search Logic
    searchInput.oninput = () => updateParamsTable(uniqueId, contextDoc, searchInput.value);
}

function updateParamsTable(droneId, contextDoc, filter = '') {
    const tbody = contextDoc.getElementById('p-tbody');
    if (!tbody) return;

    const params = getDroneParams(droneId);
    const sortedKeys = Object.keys(params).sort();
    const filteredKeys = sortedKeys.filter(k => k.toLowerCase().includes(filter.toLowerCase()));

    let html = '';
    filteredKeys.forEach(k => {
        html += `
            <tr>
                <td class="param-name">${k}</td>
                <td>
                    <input type="text" class="param-input" value="${params[k]}" 
                        data-key="${k}" 
                        onchange="window.opener.updateParamInState('${droneId}', '${k}', this.value)">
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html || '<tr><td colspan="2" style="text-align:center; color:#666;">Parametre bulunamadı</td></tr>';
}

window.updateParamInState = function (droneId, key, val) {
    const params = getDroneParams(droneId);
    params[key] = val;

    if (!FULL_PARAMS_STATE.modified[droneId]) {
        FULL_PARAMS_STATE.modified[droneId] = new Set();
    }
    FULL_PARAMS_STATE.modified[droneId].add(key);
};

function refreshAllParams(droneId, contextDoc) {
    let targetId = droneId;
    if (droneId === 'all') {
        const appState = window.appState || (window.opener && window.opener.appState);
        if (appState && appState.drones) {
            targetId = Object.keys(appState.drones)[0];
        }
    }
    if (!targetId) return;

    // Reset Stats
    FULL_PARAMS_STATE.fetchStats[targetId] = {
        count: 0,
        total: ESTIMATED_TOTAL_PARAMS,
        loading: true,
        lastUpdate: Date.now()
    };

    // Show Overlay in Popup
    if (fullParamsPopupRef && !fullParamsPopupRef.closed) {
        const doc = fullParamsPopupRef.document;
        const overlay = doc.getElementById('p-overlay');
        const bar = doc.getElementById('p-bar');
        const percent = doc.getElementById('p-percent');
        if (overlay) overlay.style.display = 'flex';
        if (bar) bar.style.width = '0%';
        if (percent) percent.textContent = '0%';
    }

    const cmd = 'param show *';
    if (window.sendDroneCmd) window.sendDroneCmd(targetId, cmd, false);
    else if (window.opener && window.opener.sendDroneCmd) window.opener.sendDroneCmd(targetId, cmd, false);

    // Auto-hide fallback if something hangs
    setTimeout(() => {
        checkParamFetchTimeout(targetId);
    }, 2000);
}

function checkParamFetchTimeout(droneId) {
    const stats = FULL_PARAMS_STATE.fetchStats[droneId];
    if (!stats || !stats.loading) return;

    const idleTime = Date.now() - stats.lastUpdate;
    // If no new param for 2 seconds and we have some data, assume done
    if (idleTime > 2000 && stats.count > 10) {
        finishParamFetch(droneId);
    } else {
        // Check again in 1s
        setTimeout(() => checkParamFetchTimeout(droneId), 1000);
    }
}

function finishParamFetch(droneId) {
    const stats = FULL_PARAMS_STATE.fetchStats[droneId];
    if (stats) stats.loading = false;

    if (fullParamsPopupRef && !fullParamsPopupRef.closed) {
        const doc = fullParamsPopupRef.document;
        const overlay = doc.getElementById('p-overlay');
        if (overlay) overlay.style.display = 'none';

        // Final refresh of table
        const search = doc.getElementById('p-search')?.value || '';
        const currentActiveId = doc.querySelector('.p-tab.active')?.innerText.includes('Tümü') ? 'all' :
            doc.querySelector('.p-tab.active')?.innerText.trim();
        renderFullParams(doc.getElementById('p-container'), currentActiveId, doc);
    }
}

window.updateFullParamFromSocket = function (droneId, param, val) {
    const params = getDroneParams(droneId);
    params[param] = val;

    const allParams = getDroneParams('all');
    allParams[param] = val;

    // Update Stats
    if (!FULL_PARAMS_STATE.fetchStats[droneId]) {
        FULL_PARAMS_STATE.fetchStats[droneId] = { count: 0, total: ESTIMATED_TOTAL_PARAMS, loading: false, lastUpdate: 0 };
    }
    const stats = FULL_PARAMS_STATE.fetchStats[droneId];
    stats.count++;
    stats.lastUpdate = Date.now();

    // Update UI if popup is open
    if (fullParamsPopupRef && !fullParamsPopupRef.closed) {
        const doc = fullParamsPopupRef.document;

        // Update Progress Bar
        if (stats.loading) {
            const bar = doc.getElementById('p-bar');
            const percentEl = doc.getElementById('p-percent');
            const progress = Math.min(99, Math.floor((stats.count / stats.total) * 100));
            if (bar) bar.style.width = progress + '%';
            if (percentEl) percentEl.textContent = progress + '%';
        }

        // Only update table if NOT loading (too heavy) or update occasionally
        if (!stats.loading) {
            const search = doc.getElementById('p-search')?.value || '';
            const currentActiveId = doc.querySelector('.p-tab.active')?.innerText.includes('Tümü') ? 'all' :
                doc.querySelector('.p-tab.active')?.innerText.trim();

            if (currentActiveId === 'all' || currentActiveId === droneId) {
                updateParamsTable(currentActiveId, doc, search);
            }
        }
    }
};

function applyModifiedFullParams(droneId, contextDoc) {
    const params = getDroneParams(droneId);
    const modifiedKeys = FULL_PARAMS_STATE.modified[droneId];

    if (!modifiedKeys || modifiedKeys.size === 0) {
        const msg = "Değişiklik saptanmadı.";
        if (window.showToast) window.showToast(msg, 'info');
        else if (window.opener && window.opener.showToast) window.opener.showToast(msg, 'info');
        return;
    }

    const msg = `${modifiedKeys.size} parametre ArduPilot'a gönderiliyor...`;
    if (window.showToast) window.showToast(msg, 'info');
    else if (window.opener && window.opener.showToast) window.opener.showToast(msg, 'info');

    modifiedKeys.forEach(k => {
        const v = params[k];
        const cmd = `param set ${k} ${v}`;
        if (droneId === 'all') {
            if (window.sendAllDronesCmd) window.sendAllDronesCmd(cmd, false);
            else if (window.opener && window.opener.sendAllDronesCmd) window.opener.sendAllDronesCmd(cmd, false);
        } else {
            if (window.sendDroneCmd) window.sendDroneCmd(droneId, cmd, false);
            else if (window.opener && window.opener.sendDroneCmd) window.opener.sendDroneCmd(droneId, cmd, false);
        }
    });

    // Clear modified after apply
    modifiedKeys.clear();
}

function exportParams(droneId) {
    const params = getDroneParams(droneId);
    let content = "# ArduPilot Parameter Export\n";
    Object.keys(params).sort().forEach(k => {
        content += `${k},${params[k]}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drone_${droneId}_params.param`;
    a.click();
    URL.revokeObjectURL(url);
}

function importParams(droneId, file, contextDoc) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const lines = e.target.result.split('\n');
        const params = getDroneParams(droneId);
        lines.forEach(line => {
            const parts = line.split(/[,\s:=]+/);
            if (parts.length >= 2) {
                const k = parts[0].trim().toUpperCase();
                const v = parts[1].trim();
                if (k && !isNaN(parseFloat(v))) {
                    params[k] = parseFloat(v);
                }
            }
        });
        updateParamsTable(droneId, contextDoc);
        if (window.showToast) window.showToast("Parametreler yüklendi, uygulamak için butona basın.", "success");
        else if (window.opener && window.opener.showToast) window.opener.showToast("Parametreler yüklendi, uygulamak için butona basın.", "success");
    };
    reader.readAsText(file);
}
