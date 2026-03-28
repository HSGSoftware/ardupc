// ==================== GLOBALS ====================

const socket = io();

const appState = {
    drones: {}, // id -> info
    activeView: 'dashboard',
    terminalOutputs: {} // id -> string
};
window.appState = appState;

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    initSplitView();
    // Socket events
    socket.on('connect', () => {
        showToast('Sunucuya bağlanıldı', 'success');
        document.getElementById('connectionStatus').innerHTML = '<span class="status-dot online"></span> SİMÜLATÖR BAĞLI';
    });

    socket.on('disconnect', () => {
        showToast('Sunucu bağlantısı koptu', 'error');
        document.getElementById('connectionStatus').innerHTML = '<span class="status-dot offline"></span> BAĞLANTI YOK';
    });

    socket.on('container_status', (data) => {
        updateContainerUI(data);
    });

    socket.on('drone_output', (data) => {
        appendTerminalOutput(data.drone_id, data.data);

        // Parse SIM Params
        if (data.data) {
            const lines = data.data.split('\n');
            lines.forEach(line => {
                // Regex: Look for ANY ArduPilot Param (Alpha prefix + Alphanumeric/Underscore)
                // ArduPilot params start with letters. We look for a pattern like "PARAM_NAME 123.45"
                const paramMatch = line.match(/([A-Z][A-Z0-9_]+)[\s:=]+([-+]?[0-9]*\.?[0-9]+)/i);
                if (paramMatch) {
                    const param = paramMatch[1].toUpperCase();
                    const val = parseFloat(paramMatch[2]);

                    // 1. Update Full Params State (always)
                    if (window.updateFullParamFromSocket) {
                        window.updateFullParamFromSocket(data.drone_id, param, val);
                    }

                    // 2. Sim Panel Specific (only for SIM_ params)
                    if (param.startsWith('SIM_')) {
                        const idsToTry = [`sim-p-val-${data.drone_id}-${param}`, `sim-p-val-all-${param}`];
                        idsToTry.forEach(id => {
                            const el = document.getElementById(id);
                            if (el) {
                                el.textContent = val;
                                el.style.transition = 'color 0.2s';
                                el.style.color = '#4ade80'; // Green flash
                                setTimeout(() => el.style.color = '', 500);
                            }
                        });

                        if (window.updateSimStateFromParam) {
                            window.updateSimStateFromParam(data.drone_id, param, val);
                        }
                    }
                }

                // 3. Live GPS Position Update
                // Look for patterns like: "GPS: -35.3626 149.1652" or similar
                const gpsMatch = line.match(/GPS:?\s+([-+]?[0-9]*\.?[0-9]+)\s+([-+]?[0-9]*\.?[0-9]+)/i);
                if (gpsMatch) {
                    const lat = parseFloat(gpsMatch[1]);
                    const lng = parseFloat(gpsMatch[2]);
                    if (appState.drones[data.drone_id]) {
                        appState.drones[data.drone_id].lat = lat;
                        appState.drones[data.drone_id].lng = lng;
                        // Fast UI Update
                        updateDroneLiveMarker(data.drone_id, lat, lng);
                    }
                }
            });
        }
    });

    socket.on('terminal_output', (data) => {
        appendTerminalOutput(data.drone_id, data.output);
    });

    socket.on('drone_status_update', (data) => {
        if (appState.drones[data.drone_id]) {
            appState.drones[data.drone_id].status = data.status;
            renderAllDronesStatusTable();
        }
    });

    socket.on('drone_removed', (data) => {
        if (appState.drones[data.drone_id]) {
            delete appState.drones[data.drone_id];
            renderAllDronesStatusTable();
            // Eğer o drone'un ekranındaysak dashboard'a dön
            if (appState.activeView === data.drone_id) {
                selectView('dashboard');
            }
        }
        updateDroneCount();
    });

    socket.on('all_drones_removed', () => {
        appState.drones = {};
        renderAllDronesStatusTable();
        if (appState.activeView === '__all__') {
            const container = document.getElementById('rightPanelContent');
            if (container) renderAllDronesControls(container);
        } else {
            selectView('dashboard');
        }
        updateDroneCount();
    });

    // Periyodik güncelleme
    setInterval(fetchDrones, 1000);
    loadSavedLocations();
    loadScenarios();
    fetchContainerStatus();

    // Default IPs
    // Default IPs
    addIpRow('127.0.0.1');
    addIpRow('192.168.1.1');

    // Listeners for Next Drone Info
    const bp = document.getElementById('basePort');
    const ps = document.getElementById('portStep');
    if (bp) bp.addEventListener('input', updateNextDroneInfo);
    if (ps) ps.addEventListener('input', updateNextDroneInfo);

    setTimeout(updateNextDroneInfo, 1000);
});

function initSplitView() {
    if (window.innerWidth <= 900 || typeof Split === 'undefined') {
        return;
    }
    Split(['.split-left', '.split-right'], {
        sizes: [25, 75],
        minSize: [200, 300],
        gutterSize: 5,
        cursor: 'col-resize'
    });

    Split(['.right-top-panel', '.right-bottom-panel'], {
        sizes: [65, 35],
        minSize: [150, 100],
        gutterSize: 5,
        direction: 'vertical',
        cursor: 'row-resize'
    });
}

function updateContainerUI(data) {
    const isRunning = data.status === 'running';
    const runtimeLabel = data.runtime_label || (data.runtime_mode === 'host' ? 'Yerel (Termux/Host)' : 'Docker');
    const isDockerMode = (data.runtime_mode || 'docker') === 'docker';

    // Header Elements
    const badge = document.getElementById('containerStatusBadge');
    const text = document.getElementById('containerStatusText');

    if (badge) {
        const dot = badge.querySelector('.dot');
        if (dot) dot.style.background = isRunning ? 'var(--green)' : 'var(--red)';

        badge.style.borderColor = isRunning ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.3)';
        badge.style.background = isRunning ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
        badge.style.color = isRunning ? 'var(--green)' : 'var(--red)';
    }
    if (text) {
        text.textContent = isRunning ? `${runtimeLabel} AKTİF` : `${runtimeLabel} PASİF`;
        text.style.color = isRunning ? 'var(--green)' : 'var(--red)';
        text.style.fontWeight = '700';
    }

    // Sidebar Elements
    const val = document.getElementById('containerStatusValue');
    const idVal = document.getElementById('containerIdValue');
    const cpuVal = document.getElementById('containerCpuValue');
    const memVal = document.getElementById('containerMemValue');

    if (val) {
        val.textContent = isRunning ? 'Çalışıyor' : 'Durduruldu';
        val.className = 'value ' + (isRunning ? 'running' : 'stopped');
        val.style.color = isRunning ? 'var(--green)' : 'var(--red)';
    }
    if (idVal) idVal.textContent = data.container_id ? data.container_id.substring(0, 12) : '-';
    if (cpuVal) cpuVal.textContent = data.cpu || '0%';
    if (memVal) memVal.textContent = data.memory || '-';

    // Buttons
    const btnStart = document.getElementById('btnContainerStart');
    const btnStop = document.getElementById('btnContainerStop');
    if (btnStart) btnStart.disabled = isRunning;
    if (btnStop) btnStop.disabled = !isRunning;

    const runtimeInput = document.getElementById('runtimeModeLabel');
    if (runtimeInput) runtimeInput.value = runtimeLabel;

    const dockerImage = document.getElementById('dockerImage');
    if (dockerImage) {
        dockerImage.disabled = !isDockerMode;
        dockerImage.title = isDockerMode ? '' : 'Yerel modda Docker image kullanılmaz';
    }

    const runtimeTitle = document.getElementById('runtimeSectionTitle');
    if (runtimeTitle) {
        runtimeTitle.textContent = isDockerMode ? '🐳 Çalışma Ortamı (Docker)' : '📱 Çalışma Ortamı (Yerel)';
    }
}

async function fetchContainerStatus() {
    try {
        const res = await fetch('/api/container/status');
        const data = await res.json();
        updateContainerUI(data);
    } catch (e) {
        console.error("Status fetch error", e);
    }
}

async function startContainer() {
    showToast('Simülatör başlatılıyor...', 'info');
    try {
        const res = await fetch('/api/container/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            setTimeout(fetchContainerStatus, 2000);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('Başlatma hatası: ' + e.message, 'error');
    }
}

async function stopContainer() {
    if (!confirm('Simülatör durdurulsun mu?')) return;
    try {
        const res = await fetch('/api/container/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'warning');
            setTimeout(fetchContainerStatus, 1000);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('Durdurma hatası', 'error');
    }
}

// ==================== DATA FETCHING ====================

async function fetchDrones() {
    try {
        const res = await fetch('/api/drones');
        const data = await res.json();
        if (data.success) {
            updateDronesState(data.drones);
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

function updateDronesState(dronesList) {
    const newDrones = {};
    dronesList.forEach(d => {
        // Mevcut state'i koru (özellikle process referansı backend'de ama burada lat/lng önemli)
        if (appState.drones[d.drone_id]) {
            newDrones[d.drone_id] = { ...appState.drones[d.drone_id], ...d };
        } else {
            newDrones[d.drone_id] = d;
        }
    });

    // Silinenleri temizle (gerçi socket temizliyor ama senkron olsun)
    // appState.drones = newDrones; // Direkt atama yaparsak anlık UI titremesi olabilir, merge daha iyi

    // Basit update
    appState.drones = newDrones;

    renderAllDronesStatusTable();
    updateDroneCount();
    updateNextDroneInfo();

    // Haritaları güncelle
    if (mapInstance) updateStartMapMarkers();
    if (gotoMapInstance) updateGotoMapDrones();
}

// ==================== UI RENDERING ====================

// Sol Panel: Sadece Durum Tablosu
function renderAllDronesStatusTable() {
    const statusTable = document.getElementById('allDronesStatusTable');
    if (!statusTable) return;
    const droneList = Object.values(appState.drones);

    if (droneList.length === 0) {
        statusTable.innerHTML = '<div class="empty-list">Henüz drone yok</div>';
        return;
    }

    let tableHtml = `<table class="all-drones-table">
        <thead><tr><th>İsim</th><th>Araç</th><th>IP</th><th>Durum</th></tr></thead>
        <tbody>`;

    droneList.forEach(d => {
        const color = d.status === 'running' ? 'var(--green)' : 'var(--red)';
        const text = d.status === 'running' ? 'Çalışıyor' : 'Durdu';
        const name = d.name || `Drone I${d.instance_id}`;

        // Aktif satır kontrolü
        const isActive = appState.activeView === d.drone_id;
        const activeClass = isActive ? 'active-row' : '';
        const activeStyle = isActive ? 'background:rgba(59, 130, 246, 0.15);' : '';

        tableHtml += `<tr class="clickable-row ${activeClass}" style="${activeStyle}" onclick="selectView('${d.drone_id}')">
            <td><strong>${name}</strong></td>
            <td>${d.vehicle_type}</td>
            <td>${d.ip_addresses.join(', ')}</td>
            <td style="color:${color}">${text}</td>
        </tr>`;
    });
    tableHtml += '</tbody></table>';
    statusTable.innerHTML = tableHtml;
}

function updateDroneCount() {
    const count = Object.keys(appState.drones).length;
    const badge = document.getElementById('droneCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
}

// Görünüm Seçimi (Sağ Panel Değişimi)
function selectView(viewId) {
    appState.activeView = viewId;
    renderAllDronesStatusTable(); // Highlight güncelle

    const rightContent = document.getElementById('rightPanelContent');
    const headerTitle = document.querySelector('#rightPanelHeader span');

    // Terminal başlığını güncelle
    const terminalHeader = document.querySelector('.right-bottom-panel .panel-header span');
    const terminalContent = document.getElementById('rightTerminalContent');

    if (viewId === 'dashboard') {
        // Hoşgeldin ekranı falan olabilir, şimdilik boş
        rightContent.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">Drone seçiniz veya "Tümü" ile işlem yapınız.</div>';
        headerTitle.textContent = 'Kontrol Paneli';
        if (terminalContent) terminalContent.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">Drone seçiniz</div>';
        return;
    }

    if (viewId === '__all__') {
        headerTitle.innerHTML = '⚡ Toplu Kontrol <button class="btn btn-danger btn-sm" onclick="deleteAllDrones()" style="margin-left:10px; padding:2px 8px; font-size:12px;">🗑️ Tümünü Kapat</button>';
        renderAllDronesControls(rightContent);
        if (terminalContent) terminalContent.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">Toplu modda terminal kapalı</div>';
        return;
    }

    // Tekil Drone
    const drone = appState.drones[viewId];
    if (drone) {
        const name = drone.name || `Drone I${drone.instance_id}`;
        headerTitle.textContent = `🎮 ${name} Kontrolü`;
        renderDroneControls(drone, rightContent);

        // Terminal render
        renderTerminal(viewId, terminalContent);
    }
}

function renderTerminal(droneId, container) {
    const drone = appState.drones[droneId];
    const name = drone.name || droneId;

    // Terminal Toolbar (Clear/Remove Buttons)
    let html = `
    <div class="terminal-toolbar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; padding-bottom:5px; border-bottom:1px solid #333;">
        <div class="terminal-info">
            <span>🚁 ${name}</span>
            <span style="font-size:10px; color:#aaa; margin-left:5px;">${drone.vehicle_type}</span>
        </div>
        <div style="display:flex; gap:4px;">
            <button class="btn btn-outline btn-sm" onclick="clearTerminal('${droneId}')" style="font-size:11px; padding:2px 6px;">🗑️ Temizle</button>
            <button class="btn btn-danger btn-sm" onclick="removeDrone('${droneId}')" style="font-size:11px; padding:2px 6px;">🗑️ Sil (Kapat)</button>
        </div>
    </div>
    <div id="output-${droneId}" style="flex:1; overflow-y:auto; white-space:pre-wrap; font-family:'JetBrains Mono',monospace; font-size:12px; margin-bottom:5px;">${appState.terminalOutputs[droneId] || ''}</div>
    <div style="display:flex; gap:5px;">
        <input type="text" id="input-${droneId}" class="terminal-input" placeholder="Komut girin..." onkeydown="if(event.key==='Enter') sendCommand('${droneId}')" style="flex:1; background:#222; border:1px solid #444; color:#ddd; padding:4px;">
        <button class="btn btn-primary btn-sm" onclick="sendCommand('${droneId}')">Gönder</button>
    </div>
    `;
    container.innerHTML = html;

    // Scroll to bottom
    const out = document.getElementById(`output-${droneId}`);
    if (out) out.scrollTop = out.scrollHeight;
}

// Tekil Drone Kontrol Paneli
function renderDroneControls(drone, container) {
    const id = drone.drone_id;
    container.innerHTML = `
        <div class="control-panel">
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="toggleSection(this)">✈️ Temel Uçuş <span class="accordion-icon">▾</span></div>
                <div class="ctrl-body open">
                    <div class="ctrl-buttons">
                        <button class="ctrl-btn ctrl-arm" onclick="sendDroneCmd('${id}','arm throttle')">🔓 ARM</button>
                        <button class="ctrl-btn ctrl-disarm" onclick="sendDroneCmd('${id}','disarm')">🔒 DISARM</button>
                        <div style="display:flex; gap:4px; align-items:center;">
                            <input type="number" class="ctrl-input" id="takeoff-alt-${id}" value="10" min="1" max="100" style="width:55px;">
                            <button class="ctrl-btn ctrl-takeoff" onclick="sendDroneCmd('${id}','takeoff ' + document.getElementById('takeoff-alt-${id}').value)">🛫 Takeoff</button>
                        </div>
                        <button class="ctrl-btn ctrl-land" onclick="sendDroneCmd('${id}','mode LAND')">🛬 Land</button>
                    </div>
                </div>
            </div>
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="toggleSection(this)">🎛️ Uçuş Modu <span class="accordion-icon">▸</span></div>
                <div class="ctrl-body">
                    <div class="ctrl-buttons">
                        <button class="ctrl-btn ctrl-mode" onclick="sendDroneCmd('${id}','mode GUIDED')">GUIDED</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendDroneCmd('${id}','mode LOITER')">LOITER</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendDroneCmd('${id}','mode RTL')">RTL</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendDroneCmd('${id}','mode STABILIZE')">STABILIZE</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendDroneCmd('${id}','mode AUTO')">AUTO</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendDroneCmd('${id}','mode POSHOLD')">POSHOLD</button>
                    </div>
                </div>
            </div>
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="toggleSection(this)">📍 Konum Gönder <span class="accordion-icon">▸</span></div>
                <div class="ctrl-body">
                    <button class="goto-map-btn" onclick="openGotoMapModal('${id}')">🗺️ Haritadan Hedef Seç</button>
                    <div class="ctrl-row">
                        <input type="text" class="ctrl-input" id="goto-lat-${id}" placeholder="Enlem" style="flex:1;">
                        <input type="text" class="ctrl-input" id="goto-lng-${id}" placeholder="Boylam" style="flex:1;">
                        <input type="number" class="ctrl-input" id="goto-alt-${id}" placeholder="Alt" value="20" style="width:55px;">
                        <button class="ctrl-btn ctrl-goto" onclick="sendGoto('${id}')">🎯 Git</button>
                    </div>
                </div>
            </div>
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="openSimPopup('${id}')">🌦️ Simülasyon (Popup) <span class="accordion-icon">⧉</span></div>
            </div>
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="openFullParamsPopup('${id}')">⚙️ Tüm Parametreler <span class="accordion-icon">⧉</span></div>
            </div>
            <!-- Gelişmiş Parametreler Accordion Kaldırıldı (Popup'a taşındı) -->
        </div>
    `;

    // Render Params Async - No longer needed here as it opens in popup
    // But we might want to pre-load or something? No.
}


// Toplu Kontrol Paneli
function renderAllDronesControls(container) {
    const droneCount = Object.keys(appState.drones).length;

    if (droneCount === 0) {
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); opacity:0.7;">
                <div style="font-size:48px; margin-bottom:10px;">🛸</div>
                <div style="font-size:16px;">Henüz hiç drone yok</div>
                <div style="font-size:13px; margin-top:5px;">Soldaki menüden yeni drone oluşturabilirsiniz.</div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="control-panel">
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="toggleSection(this)">✈️ Toplu Uçuş <span class="accordion-icon">▾</span></div>
                <div class="ctrl-body open">
                    <div class="ctrl-buttons">
                        <button class="ctrl-btn ctrl-arm" onclick="sendAllDronesCmd('arm throttle')">🔓 ARM</button>
                        <button class="ctrl-btn ctrl-disarm" onclick="sendAllDronesCmd('disarm')">🔒 DISARM</button>
                        <div style="display:flex; gap:4px; align-items:center;">
                            <input type="number" class="ctrl-input" id="all-takeoff-alt" value="10" min="1" max="100" style="width:55px;">
                            <button class="ctrl-btn ctrl-takeoff" onclick="sendAllDronesCmd('takeoff ' + document.getElementById('all-takeoff-alt').value)">🛫 Takeoff</button>
                        </div>
                        <button class="ctrl-btn ctrl-land" onclick="sendAllDronesCmd('mode LAND')">🛬 Land</button>
                    </div>
                </div>
            </div>
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="toggleSection(this)">🎛️ Toplu Mod <span class="accordion-icon">▸</span></div>
                <div class="ctrl-body">
                    <div class="ctrl-buttons">
                        <button class="ctrl-btn ctrl-mode" onclick="sendAllDronesCmd('mode GUIDED')">GUIDED</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendAllDronesCmd('mode LOITER')">LOITER</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendAllDronesCmd('mode RTL')">RTL</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendAllDronesCmd('mode STABILIZE')">STABILIZE</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendAllDronesCmd('mode AUTO')">AUTO</button>
                        <button class="ctrl-btn ctrl-mode" onclick="sendAllDronesCmd('mode POSHOLD')">POSHOLD</button>
                    </div>
                </div>
            </div>
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="toggleSection(this)">📍 Toplu Konum <span class="accordion-icon">▸</span></div>
                <div class="ctrl-body">
                    <button class="goto-map-btn" onclick="openGotoMapModal('__all__')">🗺️ Haritadan Hedef Seç (Tümü)</button>
                    <div class="ctrl-row">
                        <input type="text" class="ctrl-input" id="all-goto-lat" placeholder="Enlem" style="flex:1;">
                        <input type="text" class="ctrl-input" id="all-goto-lng" placeholder="Boylam" style="flex:1;">
                        <input type="number" class="ctrl-input" id="all-goto-alt" placeholder="Alt" value="20" style="width:55px;">
                        <button class="ctrl-btn ctrl-goto" onclick="sendAllGoto()">🎯 Gönder</button>
                    </div>
                </div>
            </div>
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="openSimPopup('all')">🌦️ Simülasyon (Popup / Tümü) <span class="accordion-icon">⧉</span></div>
            </div>
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="openFullParamsPopup('all')">⚙️ Tüm Parametreler (Tümü) <span class="accordion-icon">⧉</span></div>
            </div>
            <div class="ctrl-section">
                <div class="ctrl-title" onclick="toggleSection(this)">💬 Toplu Komut <span class="accordion-icon">▸</span></div>
                <div class="ctrl-body">
                    <div class="ctrl-row">
                        <input type="text" class="ctrl-input" id="all-custom-cmd" placeholder="MAVProxy komutu..." style="flex:1;">
                        <button class="ctrl-btn ctrl-goto" onclick="sendAllDronesCmd(document.getElementById('all-custom-cmd').value)">📤</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Render Params Async - No longer needed
}

// ==================== DRONE ACTIONS ====================


function getNextInstanceId() {
    const usedIds = new Set();
    Object.values(appState.drones).forEach(d => {
        if (d.instance_id !== undefined) usedIds.add(d.instance_id);
    });
    let nextId = 0;
    while (usedIds.has(nextId)) nextId++;
    return nextId;
}

function updateNextDroneInfo() {
    const el = document.getElementById('nextDroneInfo');
    if (!el) return;

    const nextId = getNextInstanceId();
    const basePort = parseInt(document.getElementById('basePort')?.value || 14550);
    const step = parseInt(document.getElementById('portStep')?.value || 10);
    const nextPort = basePort + (nextId * step);

    el.textContent = `I${nextId} → port ${nextPort}`;
}

async function stopDrone(droneId) {
    // stopDrone artık sadece çağrılıyor, ama backend'de process kill + remove yapmak istiyoruz
    // Kullanıcıya "Sil (Kapat)" diye sunduk. Bu da removeDrone oluyor aslında.
    removeDrone(droneId);
}

async function removeDrone(droneId) {
    try {
        const res = await fetch(`/api/drone/${droneId}/remove`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('Hata: ' + e.message, 'error');
    }
}

async function startDrone() {
    // Input okuma ve validation
    const type = document.getElementById('vehicleType').value;
    const name = document.getElementById('droneName').value;
    const basePortInput = document.getElementById('basePort').value;
    const portStepInput = document.getElementById('portStep').value;
    const startAlt = document.getElementById('startAlt').value;
    const startHeading = document.getElementById('startHeading').value;
    const startLat = document.getElementById('startLat').value;
    const startLng = document.getElementById('startLng').value;

    // Instance ID Calculation
    const nextId = getNextInstanceId();
    const basePortVal = parseInt(basePortInput || 14550);
    const portStepVal = parseInt(portStepInput || 10);
    const calculatedPort = basePortVal + (nextId * portStepVal);

    // IP listesini topla
    // IP listesini topla (Port yoksa calculatedPort ekle)
    const ipRows = document.querySelectorAll('#ipList .ip-row input');
    const ips = Array.from(ipRows).map(input => {
        let val = input.value.trim();
        if (val && !val.includes(':')) {
            val += ':' + calculatedPort;
        }
        return val;
    }).filter(v => v);

    // Custom location
    let customLoc = null;
    if (startLat && startLng) {
        customLoc = {
            lat: parseFloat(startLat),
            lng: parseFloat(startLng),
            alt: startAlt,
            heading: startHeading
        };
    }

    try {
        const res = await fetch('/api/drone/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instance_id: nextId,
                vehicle_type: type,
                drone_name: name,
                ip_addresses: ips, // Eğer boşsa backend default veya loopback atar
                custom_location: customLoc
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            // Formu resetleyebiliriz ama ardışık ekleme için tutmak iyi olabilir
            setTimeout(updateNextDroneInfo, 500);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('Başlatma hatası: ' + e.message, 'error');
    }
}


// ==================== TERMINAL / HELPER ====================

function appendTerminalOutput(droneId, text) {
    if (appState.terminalOutputs[droneId] === undefined) appState.terminalOutputs[droneId] = '';
    appState.terminalOutputs[droneId] += text;
    const out = document.getElementById(`output-${droneId}`);
    if (out) {
        out.textContent = appState.terminalOutputs[droneId];
        out.scrollTop = out.scrollHeight;
    }
}

function clearTerminal(droneId) {
    appState.terminalOutputs[droneId] = '';
    const out = document.getElementById(`output-${droneId}`);
    if (out) out.textContent = '';
}

function sendCommand(droneId) {
    const input = document.getElementById(`input-${droneId}`);
    const cmd = input.value.trim();
    if (!cmd) return;
    appendTerminalOutput(droneId, `\n> ${cmd}\n`);
    socket.emit('drone_command', { drone_id: droneId, command: cmd });
    input.value = '';
}

function addIpRow(value = '') {
    const list = document.getElementById('ipList');
    const row = document.createElement('div');
    row.className = 'ip-row';
    row.innerHTML = `<input type="text" class="form-input" value="${value}" placeholder="192.168.1.x veya ip:port"><button class="btn-remove-ip" onclick="this.parentElement.remove()">×</button>`;
    list.appendChild(row);
}

function addExtraPortRow() {
    const ipRows = document.querySelectorAll('#ipList .ip-row input');
    if (ipRows.length === 0) return showToast('Önce en az bir IP ekleyin', 'error');

    const basePort = parseInt(document.getElementById('basePort')?.value || 14550);
    const step = parseInt(document.getElementById('portStep')?.value || 10);
    const nextId = getNextInstanceId();
    const calculatedPort = basePort + (nextId * step);

    const baseHosts = [];
    Array.from(ipRows).forEach(input => {
        const v = input.value.trim();
        if (!v) return;
        const host = v.includes(':') ? v.split(':')[0] : v;
        if (!baseHosts.includes(host)) baseHosts.push(host);
    });
    if (baseHosts.length === 0) return showToast('Geçerli IP girin', 'error');

    let maxPort = calculatedPort;
    Array.from(ipRows).forEach(input => {
        const v = input.value.trim();
        if (v.includes(':')) {
            const p = parseInt(v.split(':')[1]);
            if (!isNaN(p)) maxPort = Math.max(maxPort, p);
        }
    });
    const newPort = maxPort + 1;

    baseHosts.forEach(host => addIpRow(host + ':' + newPort));
    updateNextDroneInfo();
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== DRONE COMMANDS ====================

function sendDroneCmd(droneId, command, verbose = true) {
    socket.emit('drone_command', { drone_id: droneId, command: command });
    if (verbose) showToast(`Komut gönderildi: ${command}`, 'info');
}

function sendGoto(droneId) {
    const lat = document.getElementById(`goto-lat-${droneId}`).value;
    const lng = document.getElementById(`goto-lng-${droneId}`).value;
    const alt = document.getElementById(`goto-alt-${droneId}`).value || '20';
    if (!lat || !lng) { showToast('Koordinat gerekli', 'error'); return; }
    sendDroneCmd(droneId, `guided ${lat} ${lng} ${alt}`);
}

function sendAllDronesCmd(command, verbose = true) {
    const droneIds = Object.keys(appState.drones);
    if (droneIds.length === 0) { showToast('Aktif drone yok', 'error'); return; }
    droneIds.forEach(id => socket.emit('drone_command', { drone_id: id, command: command }));
    if (verbose) showToast(`Tümüne: ${command}`, 'info');
}

function sendAllGoto() {
    const lat = document.getElementById('all-goto-lat').value;
    const lng = document.getElementById('all-goto-lng').value;
    const alt = document.getElementById('all-goto-alt').value || '20';
    if (!lat || !lng) { showToast('Koordinat gerekli', 'error'); return; }
    sendAllDronesCmd(`guided ${lat} ${lng} ${alt}`);
}

function toggleSection(el) {
    const body = el.nextElementSibling;
    body.classList.toggle('open');
    const icon = el.querySelector('.accordion-icon');
    if (icon) icon.textContent = body.classList.contains('open') ? '▾' : '▸';
}

// ==================== START LOCATION MAP MODAL ====================

let mapInstance = null;
let mapNewMarker = null;
let mapTempLat = null;
let mapTempLng = null;
let mapDroneMarkers = {}; // droneId -> { live: Marker, home: Marker }

function openMapModal() {
    const overlay = document.getElementById('mapModalOverlay');
    overlay.classList.add('active');

    // Referans Drone Listesini Doldur
    const refSelect = document.getElementById('refDroneSelect');
    if (refSelect) {
        refSelect.innerHTML = '<option value="">Drone\'dan Kopyala</option>';
        Object.values(appState.drones).forEach(d => {
            const name = d.name || `Drone I${d.instance_id}`;
            refSelect.innerHTML += `<option value="${d.drone_id}">${name}</option>`;
        });
    }

    if (!mapInstance) {
        mapInstance = L.map('mapContainer').setView([-35.363261, 149.165230], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapInstance);
        mapInstance.on('click', (e) => {
            mapTempLat = e.latlng.lat;
            mapTempLng = e.latlng.lng;
            updateMapNewMarker();
        });
    }

    setTimeout(() => mapInstance.invalidateSize(), 200);
    updateStartMapMarkers();
}

function updateStartMapMarkers() {
    if (!mapInstance) return;

    // 1. Sync Drones
    Object.values(appState.drones).forEach(d => {
        if (!mapDroneMarkers[d.drone_id]) {
            mapDroneMarkers[d.drone_id] = { live: null, home: null };
        }
        const markers = mapDroneMarkers[d.drone_id];

        // Live Position Marker
        if (d.lat != null && !isNaN(d.lat)) {
            if (markers.live) {
                markers.live.setLatLng([d.lat, d.lng]);
                markers.live.setTooltipContent(d.name || d.drone_id);
            } else {
                const m = L.marker([d.lat, d.lng], {
                    icon: L.divIcon({ className: 'existing-drone-marker', html: '<div class="drone-marker-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
                }).addTo(mapInstance);
                m.bindTooltip(d.name || d.drone_id, { direction: 'top', offset: [0, -12] });
                markers.live = m;
            }
        } else if (markers.live) {
            mapInstance.removeLayer(markers.live);
            markers.live = null;
        }

        // Home Point Marker
        if (d.home_lat != null && !isNaN(d.home_lat)) {
            if (!markers.home) { // Home usually doesn't move
                const hm = L.marker([d.home_lat, d.home_lng], {
                    icon: L.divIcon({
                        className: 'home-marker',
                        html: '<div style="background:var(--red); width:100%; height:100%; border-radius:50%; border:2px solid #fff; box-shadow:0 0 5px #000;"></div>',
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    })
                }).addTo(mapInstance);
                hm.bindTooltip(`🏠 ${d.name || d.drone_id} Home`, { direction: 'bottom', offset: [0, 8] });
                markers.home = hm;
            }
        }
    });

    // 2. Cleanup Removed Drones
    Object.keys(mapDroneMarkers).forEach(id => {
        if (!appState.drones[id]) {
            const m = mapDroneMarkers[id];
            if (m.live) mapInstance.removeLayer(m.live);
            if (m.home) mapInstance.removeLayer(m.home);
            delete mapDroneMarkers[id];
        }
    });
}

function updateMapNewMarker() {
    if (!mapInstance) return;
    if (mapNewMarker) mapInstance.removeLayer(mapNewMarker);
    if (mapTempLat != null) {
        mapNewMarker = L.marker([mapTempLat, mapTempLng], { icon: L.divIcon({ className: 'new-location-marker', html: '<div class="new-marker-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(mapInstance);
        document.getElementById('mapCoordDisplay').textContent = `${mapTempLat.toFixed(6)}, ${mapTempLng.toFixed(6)}`;
    }
}

function confirmMapLocation() {
    if (mapTempLat == null) return showToast('Konum seçiniz', 'error');
    document.getElementById('startLat').value = mapTempLat;
    document.getElementById('startLng').value = mapTempLng;
    document.getElementById('coordText').textContent = `${mapTempLat.toFixed(6)}, ${mapTempLng.toFixed(6)}`;
    closeMapModal();
}

function closeMapModal() {
    document.getElementById('mapModalOverlay').classList.remove('active');
}

// ==================== GOTO MAP MODAL ====================

let gotoMapInstance = null;
let gotoAssignments = {};
let gotoTargetMarkers = [];
let gotoDroneMarkers = {}; // droneId -> { live: Marker, home: Marker }

function openGotoMapModal(droneId) {
    const overlay = document.getElementById('gotoMapOverlay');
    overlay.classList.add('active');

    gotoAssignments = {}; // Reset assignments

    const select = document.getElementById('gotoTargetSelect');
    select.innerHTML = '<option value="__all__">📡 Tümüne Gönder</option>';
    Object.values(appState.drones).forEach(d => {
        select.innerHTML += `<option value="${d.drone_id}">🚁 ${d.name || d.drone_id}</option>`;
    });

    select.value = appState.drones[droneId] ? droneId : '__all__';

    if (!gotoMapInstance) {
        gotoMapInstance = L.map('gotoMapContainer').setView([-35.363261, 149.165230], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(gotoMapInstance);
        gotoMapInstance.on('click', (e) => handleGotoMapClick(e.latlng.lat, e.latlng.lng));
    }

    setTimeout(() => gotoMapInstance.invalidateSize(), 200);
    updateGotoMapDrones();
    clearGotoTargetMarkers();
    document.getElementById('gotoCoordDisplay').textContent = 'Hedef seçilmedi';
}

function handleGotoMapClick(lat, lng) {
    const targetId = document.getElementById('gotoTargetSelect').value;

    if (targetId === '__all__') {
        Object.keys(appState.drones).forEach(id => gotoAssignments[id] = { lat, lng });
        showToast('Tüm Dronelar için hedef belirlendi', 'info');
    } else {
        gotoAssignments[targetId] = { lat, lng };
        const name = appState.drones[targetId]?.name || targetId;
        showToast(`${name} için hedef belirlendi`, 'info');
    }

    updateGotoTargetMarkers();
}

function updateGotoMapDrones() {
    if (!gotoMapInstance) return;

    // 1. Sync Drones
    Object.values(appState.drones).forEach(d => {
        if (!gotoDroneMarkers[d.drone_id]) {
            gotoDroneMarkers[d.drone_id] = { live: null, home: null };
        }
        const markers = gotoDroneMarkers[d.drone_id];

        // Live Position
        if (d.lat != null && !isNaN(d.lat)) {
            if (markers.live) {
                markers.live.setLatLng([d.lat, d.lng]);
                markers.live.setTooltipContent(d.name || d.drone_id);
            } else {
                const m = L.marker([d.lat, d.lng], {
                    icon: L.divIcon({ className: 'existing-drone-marker', html: '<div class="drone-marker-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
                }).addTo(gotoMapInstance);
                m.bindTooltip(d.name || d.drone_id, { direction: 'top', offset: [0, -12] });
                markers.live = m;
            }
        } else if (markers.live) {
            gotoMapInstance.removeLayer(markers.live);
            markers.live = null;
        }

        // Home Point
        if (d.home_lat != null && !isNaN(d.home_lat)) {
            if (!markers.home) {
                const hm = L.marker([d.home_lat, d.home_lng], {
                    icon: L.divIcon({
                        className: 'home-marker',
                        html: '<div style="background:var(--red); width:100%; height:100%; border-radius:50%; border:2px solid #fff;"></div>',
                        iconSize: [10, 10],
                        iconAnchor: [5, 5]
                    })
                }).addTo(gotoMapInstance);
                hm.bindTooltip(`🏠 Home`, { direction: 'bottom', offset: [0, 6] });
                markers.home = hm;
            }
        }
    });

    // 2. Cleanup
    Object.keys(gotoDroneMarkers).forEach(id => {
        if (!appState.drones[id]) {
            const m = gotoDroneMarkers[id];
            if (m.live) gotoMapInstance.removeLayer(m.live);
            if (m.home) gotoMapInstance.removeLayer(m.home);
            delete gotoDroneMarkers[id];
        }
    });
}

function updateDroneLiveMarker(droneId, lat, lng) {
    // 1. Main Map
    if (mapDroneMarkers[droneId] && mapDroneMarkers[droneId].live) {
        mapDroneMarkers[droneId].live.setLatLng([lat, lng]);
    }
    // 2. Goto Map
    if (gotoDroneMarkers[droneId] && gotoDroneMarkers[droneId].live) {
        gotoDroneMarkers[droneId].live.setLatLng([lat, lng]);
    }
}

function clearGotoTargetMarkers() {
    gotoTargetMarkers.forEach(m => gotoMapInstance.removeLayer(m));
    gotoTargetMarkers = [];
}

function updateGotoTargetMarkers() {
    clearGotoTargetMarkers();

    const groups = {};
    const totalDrones = Object.keys(appState.drones).length;

    Object.entries(gotoAssignments).forEach(([droneId, coord]) => {
        const key = `${coord.lat.toFixed(5)},${coord.lng.toFixed(5)}`;
        if (!groups[key]) groups[key] = { lat: coord.lat, lng: coord.lng, names: [] };

        const drone = appState.drones[droneId];
        const name = drone ? (drone.name || `I${drone.instance_id}`) : droneId;
        groups[key].names.push(name);
    });

    Object.values(groups).forEach(group => {
        let label = group.names.join(', ');
        if (group.names.length === totalDrones && totalDrones > 1) {
            label = "Tümü";
        } else if (group.names.length > 2) {
            label = `${group.names[0]}, ${group.names[1]} +${group.names.length - 2}`;
        }

        const marker = L.marker([group.lat, group.lng], {
            icon: L.divIcon({
                className: 'target-marker',
                html: `<span class="target-crosshair" style="font-size:16px;">🎯<span style="font-size:10px; position:absolute; top:-15px; left:-10px; background:rgba(0,0,0,0.7); color:white; padding:2px 4px; border-radius:4px; white-space:nowrap; z-index:100;">${label}</span></span>`,
                iconSize: [22, 22], iconAnchor: [11, 11]
            })
        }).addTo(gotoMapInstance);

        if (group.names.length > 1) {
            marker.bindTooltip(group.names.join('<br>'), { direction: 'top' });
        }
        gotoTargetMarkers.push(marker);

        // Info update (last selected)
        const targetId = document.getElementById('gotoTargetSelect').value;
        if (targetId === '__all__' || group.names.includes(appState.drones[targetId]?.name)) {
            document.getElementById('gotoCoordDisplay').textContent = `${group.lat.toFixed(6)}, ${group.lng.toFixed(6)}`;
        }
    });
}

function confirmGotoLocation() {
    const assignments = Object.entries(gotoAssignments);
    if (assignments.length === 0) { showToast('Henüz hedef seçilmedi', 'error'); return; }

    // Varsayılan yükseklik 20
    const defAlt = '20';

    assignments.forEach(([droneId, coord]) => {
        // Tekil panel inputlarını güncelle
        const latInput = document.getElementById(`goto-lat-${droneId}`);
        const lngInput = document.getElementById(`goto-lng-${droneId}`);
        const altInput = document.getElementById(`goto-alt-${droneId}`);
        if (latInput) latInput.value = coord.lat.toFixed(6);
        if (lngInput) lngInput.value = coord.lng.toFixed(6);

        const alt = altInput ? altInput.value : defAlt;
        socket.emit('drone_command', { drone_id: droneId, command: `guided ${coord.lat} ${coord.lng} ${alt}` });
    });

    // All Inputs
    if (Object.keys(gotoAssignments).length > 1) {
        const first = Object.values(gotoAssignments)[0];
        document.getElementById('all-goto-lat').value = first.lat.toFixed(6);
        document.getElementById('all-goto-lng').value = first.lng.toFixed(6);
    }

    showToast(`${assignments.length} drone gönderiliyor`, 'success');
    closeGotoMapModal();
}

function closeGotoMapModal() {
    document.getElementById('gotoMapOverlay').classList.remove('active');
}

// ==================== NUDGE & UTILS ====================

function calculateNewCoord(lat, lng, heading, dist) {
    const R = 6378137;
    const rad = Math.PI / 180;
    const dn = dist * Math.cos(heading * rad);
    const de = dist * Math.sin(heading * rad);
    const dLat = dn / R;
    const dLng = de / (R * Math.cos(lat * rad));
    return {
        lat: lat + dLat / rad,
        lng: lng + dLng / rad
    };
}

function nudgeStartMap(heading) {
    const distInput = document.getElementById('nudgeDistStart');
    const dist = parseFloat(distInput ? distInput.value : 1) || 1;

    if (mapTempLat == null || mapTempLng == null) {
        showToast('Önce haritada bir nokta seçin', 'error');
        return;
    }

    const newCoord = calculateNewCoord(mapTempLat, mapTempLng, heading, dist);
    mapTempLat = newCoord.lat;
    mapTempLng = newCoord.lng;

    updateMapNewMarker();
}

function useRefDroneLocation() {
    const select = document.getElementById('refDroneSelect');
    const droneId = select.value;
    if (!droneId) return;

    const drone = appState.drones[droneId];
    if (drone && drone.lat != null) {
        mapTempLat = drone.lat;
        mapTempLng = drone.lng;
        updateMapNewMarker();
        if (mapInstance) mapInstance.setView([drone.lat, drone.lng], mapInstance.getZoom());
        showToast('Konum kopyalandı', 'info');
    } else {
        showToast('Drone konumu yok', 'error');
    }
}

function nudgeGotoMap(heading) {
    const distInput = document.getElementById('nudgeDistGoto');
    const dist = parseFloat(distInput ? distInput.value : 1) || 1;
    const targetId = document.getElementById('gotoTargetSelect').value;

    // Neyi öteleyeceğiz? gotoAssignments içindekileri.
    // Eğer __all__ ise hepsini mi? Ya da sadece seçili olanları mı?
    // Kullanıcı mantığı: Haritada bir hedef var (veya birden çok).
    // Eğer henüz hedef seçilmediyse bir şey yapamayız.

    const idsToNudge = [];
    if (targetId === '__all__') {
        Object.keys(gotoAssignments).forEach(id => idsToNudge.push(id));
    } else {
        if (gotoAssignments[targetId]) idsToNudge.push(targetId);
    }

    if (idsToNudge.length === 0) {
        showToast('Önce haritaya tıklayarak hedef belirleyin', 'error');
        return;
    }

    idsToNudge.forEach(id => {
        const coord = gotoAssignments[id];
        const newCoord = calculateNewCoord(coord.lat, coord.lng, heading, dist);
        gotoAssignments[id] = newCoord;
    });

    updateGotoTargetMarkers();
}


// ==================== LOCATION & SCENARIO SAVING ====================

let savedLocations = [];

async function loadSavedLocations() {
    try {
        const res = await fetch('/api/locations');
        const data = await res.json();
        if (data.success) {
            savedLocations = data.locations;
            populateLocationSelects();
        }
    } catch (e) {
        console.error('Kayıtlı konumlar yüklenemedi:', e);
    }
}

function populateLocationSelects() {
    const selects = ['savedLocSelect', 'gotoSavedLocSelect'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">📌 Kayıtlı Konumlar</option>';
        savedLocations.forEach((loc, i) => {
            select.innerHTML += `<option value="${i}">${loc.name}</option>`;
        });
        select.value = currentVal;
    });
}

function applySavedLocation(index, type) {
    if (index === '' || index === null) return;
    const loc = savedLocations[parseInt(index)];
    if (!loc) return;

    if (type === 'start') {
        mapTempLat = loc.lat;
        mapTempLng = loc.lng;
        updateMapNewMarker();
        if (mapInstance) mapInstance.setView([loc.lat, loc.lng], 16);
    } else if (type === 'goto') {
        // Goto için nereye atayacağız? Seçili drone veya all
        handleGotoMapClick(loc.lat, loc.lng);
        if (gotoMapInstance) gotoMapInstance.setView([loc.lat, loc.lng], 16);
    }
}

async function saveCurrentLocation(type) {
    let lat, lng;
    if (type === 'start') {
        lat = mapTempLat;
        lng = mapTempLng;
    } else {
        // Goto için son seçilen koordinatı bulmak zor olabilir çünkü multi-target.
        // Basitlik için ilk assignment'ı alalım.
        const vals = Object.values(gotoAssignments);
        if (vals.length > 0) { lat = vals[0].lat; lng = vals[0].lng; }
    }

    if (lat == null || lng == null) {
        showToast('Önce haritada konum seçin', 'error');
        return;
    }

    const name = prompt('Konum adı:');
    if (!name) return;

    try {
        const res = await fetch('/api/locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, lat, lng })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Kaydedildi', 'success');
            loadSavedLocations();
        }
    } catch (e) { }
}

async function deleteSelectedLocation(selectId) {
    const select = document.getElementById(selectId);
    if (!select.value) return;
    if (!confirm('Silinsin mi?')) return;
    try {
        await fetch(`/api/locations/${select.value}`, { method: 'DELETE' });
        loadSavedLocations();
    } catch (e) { }
}

async function loadScenarios() {
    try {
        const res = await fetch('/api/scenarios');
        const data = await res.json();
        if (data.success) renderScenarioList(data.scenarios);
    } catch (e) { }
}

function renderScenarioList(scenarios) {
    const list = document.getElementById('scenarioList');
    if (!list) return;
    list.innerHTML = '';
    list.className = 'scenario-list';

    Object.keys(scenarios).forEach(name => {
        const item = document.createElement('div');
        item.className = 'scenario-item';

        item.innerHTML = `
            <div class="scenario-name" onclick="loadScenarioOnServer('${name}')" title="${name}">${name}</div>
            <div class="scenario-actions">
                <button class="btn btn-outline btn-sm" onclick="loadScenarioOnServer('${name}')" title="Yükle">▶</button>
                <button class="btn btn-outline btn-sm" onclick="duplicateScenario('${name}')" title="Çoğalt">📄</button>
                <button class="btn btn-outline btn-sm" onclick="renameScenario('${name}')" title="İsim Değiştir">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteScenario('${name}')" title="Sil">🗑</button>
            </div>
        `;
        list.appendChild(item);
    });
}

async function saveScenario() {
    const input = document.getElementById('scenarioNameInput');
    const name = input.value.trim();
    if (!name) return showToast('İsim girin', 'error');

    try {
        const res = await fetch('/api/scenarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Senaryo kaydedildi', 'success');
            input.value = '';
            loadScenarios();
        }
    } catch (e) { showToast('Hata', 'error'); }
}

async function duplicateScenario(name) {
    try {
        const res = await fetch('/api/scenarios/duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            loadScenarios();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('Kopyalama hatası', 'error');
    }
}

async function renameScenario(oldName) {
    const newName = prompt('Yeni senaryo adı:', oldName);
    if (!newName || newName === oldName) return;

    try {
        const res = await fetch('/api/scenarios/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_name: oldName, new_name: newName })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            loadScenarios();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('İsim değiştirme hatası', 'error');
    }
}

async function deleteScenario(name) {
    if (!confirm('Silinsin mi?')) return;
    try {
        await fetch(`/api/scenarios/${encodeURIComponent(name)}`, { method: 'DELETE' });
        loadScenarios();
    } catch (e) { }
}

async function loadScenarioOnServer(name) {
    if (!confirm('Mevcut dronelar silinecek. Yüklensin mi?')) return;
    showToast('Yükleniyor...', 'info');
    try {
        const res = await fetch('/api/scenarios/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            setTimeout(() => location.reload(), 2000);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('Hata', 'error'); }
}

async function deleteAllDrones() {
    if (!confirm('DİKKAT: Tüm aktif dronelar kapatılacak. Onaylıyor musunuz?')) return;
    try {
        const res = await fetch('/api/drones/all', { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            // Listeyi temizlemek socket ile olacak ama gerekirse reload
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('İşlem hatası', 'error');
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}

function toggleSidebarSection(header) {
    const parent = header.parentElement;
    const body = parent.querySelector('.sidebar-section-body');
    const icon = header.querySelector('.sidebar-toggle');
    const isOpen = body.classList.contains('open');

    // Docker bölümü ise diğerlerini kapatmasın, 
    // Diğer bölümler de Docker'ı kapatmasın.
    const isDocker = header.textContent.includes('Docker') || header.textContent.includes('Çalışma Ortamı');

    if (!isDocker) {
        // Sadece Docker OLMAYAN diğer bölümleri kapat (Drone ve Senaryolar arası accordion)
        const allHeaders = document.querySelectorAll('.sidebar-section-header');
        allHeaders.forEach(h => {
            if (h === header) return;
            if (h.textContent.includes('Docker')) return; // Docker'a dokunma

            const p = h.parentElement;
            const b = p.querySelector('.sidebar-section-body');
            const i = h.querySelector('.sidebar-toggle');

            if (b) b.classList.remove('open');
            if (i) i.style.transform = 'rotate(0deg)';
        });
    }

    // Tıklananı toggle et
    if (isOpen) {
        body.classList.remove('open');
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        body.classList.add('open');
        if (icon) icon.style.transform = 'rotate(180deg)';
    }
}

window.sendAllDronesCmd = function (cmd, verbose = true) {
    if (!appState || !appState.drones) return;
    Object.keys(appState.drones).forEach(id => {
        if (window.sendDroneCmd) window.sendDroneCmd(id, cmd, verbose);
    });
    if (verbose) {
        showToast('Toplu komut gönderildi', 'info');
    }
};

// ==================== MINI MAP ====================

let miniMap = null;
let miniMapMarkers = {};

function initMiniMap() {
    const container = document.getElementById('miniMapContainer');
    if (!container || miniMap) return;
    miniMap = L.map(container, { zoomControl: false, attributionControl: false }).setView([-35.363261, 149.165230], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(miniMap);
    setTimeout(() => miniMap.invalidateSize(), 300);
}

function updateMiniMap() {
    if (!miniMap) return;
    Object.values(appState.drones).forEach(d => {
        if (d.lat == null || isNaN(d.lat)) return;
        const armed = d.armed === true;
        const color = armed ? '#22c55e' : '#06b6d4';
        if (miniMapMarkers[d.drone_id]) {
            miniMapMarkers[d.drone_id].setLatLng([d.lat, d.lng]);
            const el = miniMapMarkers[d.drone_id].getElement();
            if (el) { const dot = el.querySelector('.mm-dot'); if (dot) dot.style.background = color; }
        } else {
            const icon = L.divIcon({ className: 'mini-map-marker', html: `<div class="mm-dot" style="background:${color};width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
            miniMapMarkers[d.drone_id] = L.marker([d.lat, d.lng], { icon }).addTo(miniMap);
            miniMapMarkers[d.drone_id].bindTooltip(d.name || d.drone_id, { direction: 'top', offset: [0, -8] });
        }
    });
    Object.keys(miniMapMarkers).forEach(id => {
        if (!appState.drones[id]) { miniMap.removeLayer(miniMapMarkers[id]); delete miniMapMarkers[id]; }
    });
    const pts = Object.values(appState.drones).filter(d => d.lat != null && !isNaN(d.lat)).map(d => [d.lat, d.lng]);
    if (pts.length > 0) miniMap.fitBounds(L.latLngBounds(pts), { padding: [20, 20], maxZoom: 16 });
}

// ==================== XTERM TERMINAL ====================

const xtermInstances = {};

function renderTerminal(droneId, container) {
    const drone = appState.drones[droneId];
    const name = drone ? (drone.name || droneId) : droneId;

    container.innerHTML = `
    <div class="terminal-toolbar" style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; border-bottom:1px solid #333;">
        <div class="terminal-info">
            <span>🚁 ${name}</span>
            <span style="font-size:10px; color:#aaa; margin-left:5px;">${drone?.vehicle_type || ''}</span>
        </div>
        <div style="display:flex; gap:4px;">
            <button class="btn btn-outline btn-sm" onclick="clearXterm('${droneId}')" style="font-size:11px; padding:2px 6px;">🗑️ Temizle</button>
            <button class="btn btn-danger btn-sm" onclick="removeDrone('${droneId}')" style="font-size:11px; padding:2px 6px;">🗑️ Sil</button>
        </div>
    </div>
    <div id="xterm-${droneId}" style="flex:1; overflow:hidden;"></div>
    <div style="display:flex; gap:5px; padding:4px;">
        <input type="text" id="input-${droneId}" class="terminal-input" placeholder="Komut girin..." onkeydown="if(event.key==='Enter') sendCommand('${droneId}')" style="flex:1; background:#222; border:1px solid #444; color:#ddd; padding:4px; font-family:'JetBrains Mono',monospace; font-size:12px;">
        <button class="btn btn-primary btn-sm" onclick="sendCommand('${droneId}')">Gönder</button>
    </div>`;

    if (typeof Terminal !== 'undefined') {
        try {
            const term = new Terminal({ theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff' }, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", scrollback: 5000, convertEol: true, disableStdin: true });
            const fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);
            const el = document.getElementById(`xterm-${droneId}`);
            if (el) {
                term.open(el);
                setTimeout(() => fitAddon.fit(), 100);
                if (appState.terminalOutputs[droneId]) term.write(appState.terminalOutputs[droneId]);
                xtermInstances[droneId] = { term, fitAddon };
            }
        } catch (e) {
            renderTerminalFallback(droneId, container);
        }
    } else {
        renderTerminalFallback(droneId, container);
    }
}

function renderTerminalFallback(droneId, container) {
    const el = document.getElementById(`xterm-${droneId}`);
    if (el) {
        el.style.overflowY = 'auto';
        el.style.whiteSpace = 'pre-wrap';
        el.style.fontFamily = "'JetBrains Mono', monospace";
        el.style.fontSize = '12px';
        el.style.padding = '8px';
        el.style.color = '#ddd';
        el.id = `output-${droneId}`;
        el.textContent = appState.terminalOutputs[droneId] || '';
        el.scrollTop = el.scrollHeight;
    }
}

function clearXterm(droneId) {
    appState.terminalOutputs[droneId] = '';
    const inst = xtermInstances[droneId];
    if (inst) { inst.term.clear(); return; }
    const out = document.getElementById(`output-${droneId}`);
    if (out) out.textContent = '';
}

const _origAppendTerminal = appendTerminalOutput;
appendTerminalOutput = function(droneId, text) {
    if (appState.terminalOutputs[droneId] === undefined) appState.terminalOutputs[droneId] = '';
    appState.terminalOutputs[droneId] += text;
    const inst = xtermInstances[droneId];
    if (inst) { inst.term.write(text); return; }
    const out = document.getElementById(`output-${droneId}`);
    if (out) { out.textContent = appState.terminalOutputs[droneId]; out.scrollTop = out.scrollHeight; }
};

// ==================== KEYBOARD SHORTCUTS (DASHBOARD) ====================

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key;

    if (key === '?') {
        document.getElementById('shortcutsModalOverlay')?.classList.add('active');
        return;
    }
    if (e.ctrlKey && key.toLowerCase() === 's') {
        e.preventDefault();
        saveScenario();
        return;
    }

    const K = key.toUpperCase();
    if (K === 'G') sendAllDronesCmd('mode GUIDED');
    else if (K === 'R') sendAllDronesCmd('mode RTL');
    else if (K === 'L') sendAllDronesCmd('mode LAND');
    else if (K === 'T') sendAllDronesCmd('takeoff 10');
    else if (K === ' ') {
        e.preventDefault();
        const anyArmed = Object.values(appState.drones).some(d => d.armed);
        sendAllDronesCmd(anyArmed ? 'disarm' : 'arm throttle');
    }
    else if (K >= '1' && K <= '9') {
        const ids = Object.keys(appState.drones);
        const idx = parseInt(K) - 1;
        if (idx < ids.length) selectView(ids[idx]);
    }
});

// ==================== LOADING STATES ====================

function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.dataset.origText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-sm"></span> ' + (btn.dataset.origText || '');
        btn.disabled = true;
        btn.classList.add('btn-loading');
    } else {
        if (btn.dataset.origText) btn.innerHTML = btn.dataset.origText;
        btn.disabled = false;
        btn.classList.remove('btn-loading');
    }
}

const _origStartContainer = startContainer;
startContainer = async function() {
    const btn = document.getElementById('btnContainerStart');
    setButtonLoading(btn, true);
    showToast('Simülatör başlatılıyor...', 'info');
    try {
        const res = await fetch('/api/container/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) { showToast(data.message, 'success'); setTimeout(fetchContainerStatus, 2000); }
        else showToast(data.message, 'error');
    } catch (e) { showToast('Başlatma hatası: ' + e.message, 'error'); }
    finally { setButtonLoading(btn, false); }
};

const _origStartDrone = startDrone;
startDrone = async function() {
    const btn = document.getElementById('btnStartDrone');
    setButtonLoading(btn, true);
    try { await _origStartDrone(); }
    catch (e) { showToast('Hata: ' + e.message, 'error'); }
    finally { setButtonLoading(btn, false); }
};

// ==================== EXPORT / IMPORT ====================

function exportScenarios() {
    window.open('/api/export/scenarios', '_blank');
    showToast('Senaryolar dışa aktarılıyor...', 'info');
}

function importScenarios(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const res = await fetch('/api/import/scenarios', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
            const result = await res.json();
            showToast(result.message, result.success ? 'success' : 'error');
            if (result.success) loadScenarios();
        } catch (err) { showToast('İçe aktarma hatası: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
    input.value = '';
}

// ==================== INIT ENHANCEMENTS ====================

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initMiniMap, 500);
    setInterval(updateMiniMap, 3000);
});
