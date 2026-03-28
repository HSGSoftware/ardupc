// Uçuş Kontrol Merkezi - Modüler Arayüz v2
const socket = io();

const state = {
    drones: {},
    markers: {},
    trails: {},
    waypointMarkers: [],
    waypointTarget: null,
    waypointList: [],
    droneTargets: {},
    map: null,
    selectedDroneId: null,
    expandedDroneId: null
};

const FLIGHT_MODES = ['GUIDED', 'LOITER', 'STABILIZE', 'ALT_HOLD', 'AUTO', 'RTL', 'LAND', 'POSHOLD'];
const FLTMODE_MAP = {
    0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED', 5: 'LOITER',
    6: 'RTL', 7: 'CIRCLE', 8: 'LAND', 9: 'DRIFT', 10: 'SPORT', 11: 'FLIP', 12: 'POSHOLD',
    13: 'BRAKE', 14: 'THROW', 15: 'MANUAL', 17: 'SMART_RTL'
};

// Akıcı marker hareketi: interpolasyon + hız vektörü ile extrapolasyon
const motion = {}; // droneId -> MotionEntry
let motionLoopStarted = false;

// Extrapolasyon süresi: veri gelmese bile bu kadar ms daha kayar
const EXTRAP_LIMIT_MS = 3000;
// Extrapolasyon decay: hız her ms'de bu oranda azalır (duraksamayı doğallaştırır)
const EXTRAP_DECAY = 0.9985;

function setMotionTarget(droneId, lat, lng) {
    if (!state.map || lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    const now = performance.now();
    const m = motion[droneId];

    if (!m) {
        // İlk veri noktası
        motion[droneId] = {
            pos: [lat, lng],
            vel: [0, 0],
            target: [lat, lng],
            lastUpdate: now,
            interval: 500,
            phase: 'idle'
        };
        return;
    }

    const dt = now - m.lastUpdate;
    if (dt < 10) return; // Çok hızlı gelen duplicate'ler

    // Hız vektörünü hesapla (derece/ms)
    const vLat = (lat - m.target[0]) / dt;
    const vLng = (lng - m.target[1]) / dt;

    // EMA ile hız yumuşatma (ani sapmaları emer)
    const alpha = 0.4;
    m.vel = [
        m.vel[0] * (1 - alpha) + vLat * alpha,
        m.vel[1] * (1 - alpha) + vLng * alpha
    ];

    // Güncelleme aralığını takip et (dinamik interpolasyon süresi)
    m.interval = m.interval * 0.6 + dt * 0.4;

    m.from = m.pos.slice();
    m.target = [lat, lng];
    m.lastUpdate = now;
    m.interpStart = now;
    m.phase = 'interp';
}

function startMotionLoop() {
    if (motionLoopStarted) return;
    motionLoopStarted = true;

    function step() {
        const now = performance.now();

        Object.entries(motion).forEach(([id, m]) => {
            const d = state.drones[id];
            if (!d) return;

            const sinceLast = now - m.lastUpdate;

            if (m.phase === 'interp') {
                // Faz 1: Bilinen iki nokta arası interpolasyon
                const dur = Math.max(m.interval * 0.9, 150);
                const elapsed = now - m.interpStart;
                const rawT = Math.min(elapsed / dur, 1);
                // smoothstep
                const t = rawT * rawT * (3 - 2 * rawT);
                m.pos[0] = m.from[0] + (m.target[0] - m.from[0]) * t;
                m.pos[1] = m.from[1] + (m.target[1] - m.from[1]) * t;

                if (rawT >= 1) {
                    m.phase = 'extrap';
                    m.extrapStart = now;
                }
            } else if (m.phase === 'extrap') {
                // Faz 2: Hız vektörü ile extrapolasyon (yavaşça azalarak)
                const extrapAge = now - m.extrapStart;
                if (extrapAge < EXTRAP_LIMIT_MS && (Math.abs(m.vel[0]) > 1e-12 || Math.abs(m.vel[1]) > 1e-12)) {
                    const decay = Math.pow(EXTRAP_DECAY, extrapAge);
                    // Frame delta (yaklaşık 16ms)
                    const frameDt = 16;
                    m.pos[0] += m.vel[0] * frameDt * decay;
                    m.pos[1] += m.vel[1] * frameDt * decay;
                }
                // else: idle — son pozisyonda dur
            }

            updateMarkerVisual(id, m.pos[0], m.pos[1], d.name);
        });

        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ==================== TOAST ====================

function showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
}

// ==================== UI ====================

function togglePanel(panelId) {
    document.getElementById(panelId)?.classList.toggle('collapsed');
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1))?.classList.add('active');
        });
    });
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = document.querySelector('.tab-content.active')?.id;
            const mode = btn.dataset.mode;
            if (tab === 'tabBatch') sendCmdBatch(`mode ${mode}`);
            else sendCmdToDrone(state.selectedDroneId, `mode ${mode}`);
        });
    });
});

// ==================== KOMUT ====================

function getTargetDrones() {
    return state.selectedDroneId ? [state.selectedDroneId] : Object.keys(state.drones);
}

function sendCmd(command, verbose = true) {
    const ids = getTargetDrones();
    if (ids.length === 0) { showToast('Drone seçin', 'error'); return; }
    ids.forEach(id => socket.emit('drone_command', { drone_id: id, command }));
    if (verbose) showToast(`Komut: ${command}`, 'info');
}

function sendCmdToDrone(droneId, command, verbose = true) {
    if (!droneId) { showToast('Drone seçin', 'error'); return; }
    socket.emit('drone_command', { drone_id: droneId, command });
    if (verbose) showToast(`Komut: ${command}`, 'info');
}

function sendCmdBatch(command) {
    const ids = Object.keys(state.drones);
    if (ids.length === 0) { showToast('Aktif drone yok', 'error'); return; }
    ids.forEach(id => socket.emit('drone_command', { drone_id: id, command }));
    showToast(`Tümüne: ${command}`, 'info');
}

function sendTakeoff() {
    const alt = document.getElementById('takeoffAlt')?.value || '20';
    sendCmd(`takeoff ${alt}`);
}

function sendTakeoffBatch() {
    const alt = document.getElementById('takeoffAltBatch')?.value || '20';
    sendCmdBatch(`takeoff ${alt}`);
}

function sendGotoToTarget() {
    const t = state.waypointTarget;
    if (!t) { showToast('Önce haritada hedef tıklayın', 'error'); return; }
    const alt = document.getElementById('gotoAlt')?.value || '30';
    const ids = getTargetDrones();
    if (ids.length === 0) { showToast('Drone seçin', 'error'); return; }
    ids.forEach(id => socket.emit('drone_command', { drone_id: id, command: `guided ${t.lat} ${t.lng} ${alt}` }));
    showToast(`GOTO: ${t.lat.toFixed(5)}, ${t.lng.toFixed(5)} @ ${alt}m`, 'success');
}

function assignTargetToDrone(droneId) {
    const t = state.waypointTarget;
    if (!t) { showToast('Önce haritada hedef tıklayın', 'error'); return; }
    const alt = document.getElementById('gotoAlt')?.value || '30';
    state.droneTargets[droneId] = { lat: t.lat, lng: t.lng, alt: parseFloat(alt) };
    renderDroneAssignments();
    updateAssignmentMarkers();
    showToast(`${state.drones[droneId]?.name || droneId} için hedef atandı`, 'info');
}

function removeDroneTarget(droneId) {
    delete state.droneTargets[droneId];
    renderDroneAssignments();
    updateAssignmentMarkers();
}

function sendGotoToAssigned(droneId) {
    const t = state.droneTargets[droneId];
    if (!t) { showToast('Bu drone için hedef atanmamış', 'error'); return; }
    socket.emit('drone_command', { drone_id: droneId, command: `guided ${t.lat} ${t.lng} ${t.alt}` });
    showToast(`${state.drones[droneId]?.name || droneId} → GOTO`, 'success');
}

function sendGotoAllAssigned() {
    const entries = Object.entries(state.droneTargets);
    if (entries.length === 0) { showToast('Hiç drone için hedef atanmamış', 'error'); return; }
    entries.forEach(([id, t]) => socket.emit('drone_command', { drone_id: id, command: `guided ${t.lat} ${t.lng} ${t.alt}` }));
    showToast(`${entries.length} drone ayrı hedeflere gönderildi`, 'success');
}

function addWaypointToList() {
    const t = state.waypointTarget;
    if (!t) { showToast('Önce haritada hedef tıklayın', 'error'); return; }
    const alt = document.getElementById('gotoAlt')?.value || '30';
    state.waypointList.push({ lat: t.lat, lng: t.lng, alt: parseFloat(alt) });
    renderWaypointList();
    updateWaypointMarkers();
    showToast('Waypoint eklendi', 'info');
}

function clearWaypointList() {
    state.waypointList = [];
    clearWaypointMarkers();
    renderWaypointList();
}

function renderWaypointList() {
    const ul = document.getElementById('waypointList');
    if (!ul) return;
    ul.innerHTML = state.waypointList.map((wp, i) =>
        `<li><span class="wp-num">${i + 1}</span> ${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)} @ ${wp.alt}m
         <button class="btn-remove-wp" onclick="removeWaypoint(${i})">×</button></li>`
    ).join('');
}

function removeWaypoint(index) {
    state.waypointList.splice(index, 1);
    renderWaypointList();
    updateWaypointMarkers();
}

function sendMissionGoto() {
    if (state.waypointList.length === 0) { showToast('Waypoint listesi boş', 'error'); return; }
    const ids = getTargetDrones();
    if (ids.length === 0) { showToast('Drone seçin', 'error'); return; }
    const cmds = ['wp clear', ...state.waypointList.map(wp => `wp add ${wp.lat} ${wp.lng} ${wp.alt}`), 'wp set 0', 'mode AUTO'];
    ids.forEach(id => cmds.forEach((cmd, i) => setTimeout(() => socket.emit('drone_command', { drone_id: id, command: cmd }), i * 150)));
    showToast('Mission gönderildi', 'success');
}

// ==================== MAP ====================

// ==================== MAP LAYERS ====================

const MAP_LAYERS = {
    osm: { name: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap' },
    satellite: { name: 'Uydu', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri' },
    topo: { name: 'Topografik', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenTopoMap' },
    dark: { name: 'Karanlık', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '© CartoDB' }
};
let currentLayerKey = 'osm';
let currentTileLayer = null;

function cycleMapLayer() {
    const keys = Object.keys(MAP_LAYERS);
    const idx = (keys.indexOf(currentLayerKey) + 1) % keys.length;
    currentLayerKey = keys[idx];
    const layer = MAP_LAYERS[currentLayerKey];
    if (currentTileLayer) state.map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(layer.url, { attribution: layer.attr, maxZoom: 19 }).addTo(state.map);
    showToast(`Harita: ${layer.name}`, 'info');
}

function initMap() {
    state.map = L.map('flightMap').setView([-35.363261, 149.165230], 15);
    const layer = MAP_LAYERS[currentLayerKey];
    currentTileLayer = L.tileLayer(layer.url, { attribution: layer.attr, maxZoom: 19 }).addTo(state.map);
    state.map.on('click', (e) => {
        state.waypointTarget = { lat: e.latlng.lat, lng: e.latlng.lng };
        updateWaypointPreview();
        updateTargetMarker();
    });
}

function updateTargetMarker() {
    clearTargetMarker();
    if (!state.waypointTarget || !state.map) return;
    const icon = L.divIcon({
        className: 'target-marker',
        html: '<div style="width:24px;height:24px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(239,68,68,0.6);"></div>',
        iconSize: [24, 24], iconAnchor: [12, 12]
    });
    state.targetMarker = L.marker([state.waypointTarget.lat, state.waypointTarget.lng], { icon }).addTo(state.map);
    state.targetMarker.bindPopup(`Hedef<br>${state.waypointTarget.lat.toFixed(6)}, ${state.waypointTarget.lng.toFixed(6)}`);
}

function clearTargetMarker() {
    if (state.targetMarker) { state.map.removeLayer(state.targetMarker); state.targetMarker = null; }
}

function updateWaypointMarkers() {
    clearWaypointMarkers();
    if (!state.map) return;
    state.waypointList.forEach((wp, i) => {
        const icon = L.divIcon({
            className: 'wp-marker',
            html: `<div style="width:16px;height:16px;background:#f59e0b;border:2px solid #fff;border-radius:50%;font-size:9px;display:flex;align-items:center;justify-content:center;">${i + 1}</div>`,
            iconSize: [16, 16], iconAnchor: [8, 8]
        });
        const m = L.marker([wp.lat, wp.lng], { icon }).addTo(state.map);
        m.bindPopup(`WP${i + 1}: ${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)} @ ${wp.alt}m`);
        state.waypointMarkers.push(m);
    });
}

function clearWaypointMarkers() {
    state.waypointMarkers.forEach(m => state.map?.removeLayer(m));
    state.waypointMarkers = [];
}

let assignmentMarkers = {};
function updateAssignmentMarkers() {
    Object.values(assignmentMarkers).forEach(m => state.map?.removeLayer(m));
    assignmentMarkers = {};
    if (!state.map) return;
    Object.entries(state.droneTargets).forEach(([droneId, t]) => {
        const name = state.drones[droneId]?.name || droneId;
        const icon = L.divIcon({
            className: 'assignment-marker',
            html: `<div style="width:18px;height:18px;background:#8b5cf6;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(139,92,246,0.6);"></div>`,
            iconSize: [18, 18], iconAnchor: [9, 9]
        });
        const m = L.marker([t.lat, t.lng], { icon }).addTo(state.map);
        m.bindPopup(`${name}<br>${t.lat.toFixed(5)}, ${t.lng.toFixed(5)} @ ${t.alt}m`);
        assignmentMarkers[droneId] = m;
    });
}

function renderAssignDroneButtons() {
    const container = document.getElementById('assignDroneButtons');
    if (!container) return;
    const list = Object.values(state.drones);
    if (list.length === 0) { container.innerHTML = '<span class="muted">Drone yok</span>'; return; }
    container.innerHTML = list.map(d =>
        `<button class="btn-assign" onclick="assignTargetToDrone('${d.drone_id}')" title="${d.name || d.drone_id}">${d.name || d.drone_id}</button>`
    ).join('');
}

function renderDroneAssignments() {
    const container = document.getElementById('droneAssignments');
    if (!container) return;
    const entries = Object.entries(state.droneTargets);
    if (entries.length === 0) {
        container.innerHTML = '<p class="hint-small">Haritada tıkla → Drone\'a ata</p>';
        return;
    }
    container.innerHTML = entries.map(([id, t]) => {
        const name = state.drones[id]?.name || id;
        return `<div class="assignment-item">
            <span class="assignment-name">${name}</span>
            <span class="assignment-coord mono">${t.lat.toFixed(5)}, ${t.lng.toFixed(5)} @ ${t.alt}m</span>
            <div class="assignment-actions">
                <button class="btn-sm" onclick="sendGotoToAssigned('${id}')">GOTO</button>
                <button class="btn-sm btn-remove" onclick="removeDroneTarget('${id}')">×</button>
            </div>
        </div>`;
    }).join('');
}

function updateWaypointPreview() {
    const el = document.getElementById('waypointPreview');
    if (!el) return;
    const t = state.waypointTarget;
    el.innerHTML = t ? `<span class="coord">${t.lat.toFixed(6)}, ${t.lng.toFixed(6)}</span>` : '<span class="muted">Hedef yok</span>';
}

function fitAllDrones() {
    const list = Object.values(state.drones).filter(d => _lat(d) != null);
    if (list.length === 0) { showToast('Drone yok', 'error'); return; }
    state.map.fitBounds(L.latLngBounds(list.map(d => [_lat(d), _lng(d)])), { padding: [50, 50], maxZoom: 17 });
}

function focusDroneOnMap(droneId) {
    const d = state.drones[droneId];
    if (_lat(d) != null) state.map.setView([_lat(d), _lng(d)], 17);
}

function _lat(d) { return d?.lat ?? d?.home_lat; }
function _lng(d) { return d?.lng ?? d?.home_lng; }

// ==================== DRONE CARDS ====================

function selectDrone(droneId) {
    state.selectedDroneId = droneId;
    renderDroneCards();
}

function toggleDroneCard(droneId) {
    state.expandedDroneId = state.expandedDroneId === droneId ? null : droneId;
    renderDroneCards();
}

function makeDroneSVG(color, vehicleType) {
    const isPlane = vehicleType === 'ArduPlane';
    const isRover = vehicleType === 'APMrover2';
    if (isPlane) {
        return `<svg viewBox="0 0 40 40" width="32" height="32"><g fill="${color}" stroke="#fff" stroke-width="1.5"><path d="M20 4 L26 18 L36 22 L26 24 L24 36 L20 30 L16 36 L14 24 L4 22 L14 18 Z"/></g></svg>`;
    }
    if (isRover) {
        return `<svg viewBox="0 0 40 40" width="28" height="28"><rect x="10" y="8" width="20" height="24" rx="4" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="14" cy="12" r="3" fill="#fff" opacity="0.5"/><circle cx="26" cy="12" r="3" fill="#fff" opacity="0.5"/><path d="M16 28 L20 34 L24 28" fill="#fff" opacity="0.6"/></svg>`;
    }
    return `<svg viewBox="0 0 40 40" width="32" height="32"><g fill="${color}" stroke="#fff" stroke-width="1.2"><circle cx="20" cy="20" r="7"/><line x1="20" y1="6" x2="20" y2="14" stroke="${color}" stroke-width="3"/><line x1="20" y1="26" x2="20" y2="34" stroke="${color}" stroke-width="3"/><line x1="6" y1="20" x2="14" y2="20" stroke="${color}" stroke-width="3"/><line x1="26" y1="20" x2="34" y2="20" stroke="${color}" stroke-width="3"/><circle cx="20" cy="6" r="4" /><circle cx="20" cy="34" r="4" /><circle cx="6" cy="20" r="4" /><circle cx="34" cy="20" r="4" /><path d="M17 13 L20 6 L23 13" fill="#fff" opacity="0.8"/></g></svg>`;
}

function updateMarkerVisual(droneId, lat, lng, name) {
    if (!state.map || lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    const d = state.drones[droneId];
    const armed = d?.armed === true;
    const color = armed ? '#22c55e' : '#06b6d4';
    const heading = d?.heading || 0;
    const vType = d?.vehicle_type || 'ArduCopter';

    if (!state.markers[droneId]) {
        const icon = L.divIcon({
            className: 'drone-svg-marker',
            html: `<div class="drone-svg-wrap" style="transform:rotate(${heading}deg)">${makeDroneSVG(color, vType)}</div>
                   <div class="drone-marker-label">${name || droneId}</div>`,
            iconSize: [36, 36], iconAnchor: [18, 18]
        });
        const m = L.marker([lat, lng], { icon }).addTo(state.map);
        m.on('click', () => { selectDrone(droneId); focusDroneOnMap(droneId); });
        state.markers[droneId] = m;
    } else {
        state.markers[droneId].setLatLng([lat, lng]);
        const el = state.markers[droneId]?.getElement();
        if (el) {
            const wrap = el.querySelector('.drone-svg-wrap');
            if (wrap) {
                wrap.style.transform = `rotate(${heading}deg)`;
                wrap.innerHTML = makeDroneSVG(color, vType);
            }
        }
    }
}

function addTrailPoint(droneId, lat, lng) {
    if (!state.map || lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    const d = state.drones[droneId];
    const armed = d?.armed === true;
    const color = armed ? '#22c55e' : '#06b6d4';

    // Trail
    if (!state.trails[droneId]) {
        state.trails[droneId] = L.polyline([], { color, weight: 2, opacity: 0.5 }).addTo(state.map);
    }
    const trail = state.trails[droneId];
    const pts = trail.getLatLngs();
    if (pts.length === 0 || pts[pts.length - 1].distanceTo(L.latLng(lat, lng)) > 0.5) {
        trail.addLatLng([lat, lng]);
        if (pts.length > 500) trail.setLatLngs(pts.slice(-300));
    }
}

// Eski API ile uyumluluk için: hem marker hem trail günceller
function updateDroneMarker(droneId, lat, lng, name) {
    updateMarkerVisual(droneId, lat, lng, name);
    addTrailPoint(droneId, lat, lng);
}

function removeDroneMarker(droneId) {
    if (state.markers[droneId]) { state.map.removeLayer(state.markers[droneId]); delete state.markers[droneId]; }
    if (state.trails[droneId]) { state.map.removeLayer(state.trails[droneId]); delete state.trails[droneId]; }
}

function renderDroneCards() {
    const container = document.getElementById('droneCards');
    if (!container) return;
    const list = Object.values(state.drones);
    if (list.length === 0) { container.innerHTML = '<p class="hint">Henüz drone yok</p>'; return; }

    container.innerHTML = list.map(d => {
        const id = d.drone_id;
        const name = d.name || `Drone I${d.instance_id}`;
        const lat = _lat(d);
        const lng = _lng(d);
        const isSelected = state.selectedDroneId === id;
        const isExpanded = state.expandedDroneId === id;
        const mode = d.mode || '—';
        const armed = d.armed === true;
        const alt = d.rel_alt ?? d.abs_alt;

        return `<div class="drone-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}" data-drone="${id}">
            <div class="drone-card-header" onclick="selectDrone('${id}')">
                <span class="drone-status-dot ${d.status}"></span>
                <span class="drone-name">${name}</span>
                <span class="drone-card-badges">
                    <span class="badge badge-mode">${mode}</span>
                    <span class="badge ${armed ? 'badge-armed' : 'badge-disarmed'}">${armed ? 'ARM' : 'DISARM'}</span>
                </span>
                <button class="btn-icon-sm" onclick="event.stopPropagation(); toggleDroneCard('${id}')">${isExpanded ? '▾' : '▸'}</button>
            </div>
            <div class="drone-card-body">
                <div class="drone-mini-stats">
                    <span title="Yükseklik">${alt != null ? alt.toFixed(1) + 'm' : '—'}</span>
                    <span title="Hız">${d.speed != null ? d.speed.toFixed(1) + 'm/s' : '—'}</span>
                    <span title="Yön">${d.heading != null ? d.heading.toFixed(0) + '°' : '—'}</span>
                    <span title="Batarya">${d.bat_pct != null ? d.bat_pct + '%' : '—'}</span>
                </div>
                <div class="drone-info-row mono small">${lat != null ? lat.toFixed(6) : '—'}, ${lng != null ? lng.toFixed(6) : '—'}</div>
                <button class="btn-focus" onclick="focusDroneOnMap('${id}')">Haritada göster</button>
            </div>
            <div class="drone-card-expanded">
                <div class="mode-mini">
                    ${FLIGHT_MODES.slice(0, 6).map(m => `<button class="mode-btn-sm${m === mode ? ' active' : ''}" onclick="sendCmdToDrone('${id}','mode ${m}',false)">${m}</button>`).join('')}
                </div>
                <div class="btn-row">
                    <button class="ctrl-btn arm" onclick="sendCmdToDrone('${id}','arm throttle')">ARM</button>
                    <button class="ctrl-btn disarm" onclick="sendCmdToDrone('${id}','disarm')">DISARM</button>
                    <button class="ctrl-btn" onclick="sendCmdToDrone('${id}','mode LAND')">LAND</button>
                    <button class="ctrl-btn" onclick="sendCmdToDrone('${id}','mode RTL')">RTL</button>
                </div>
                <div class="input-row compact">
                    <input type="number" id="takeoffAlt-${id}" value="20" placeholder="Alt" style="width:60px">
                    <button class="ctrl-btn" onclick="sendCmdToDrone('${id}','takeoff '+document.getElementById('takeoffAlt-${id}').value)">Takeoff</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ==================== DATA ====================

async function fetchDrones() {
    try {
        const res = await fetch('/api/drones');
        const data = await res.json();
        if (data.success) {
            data.drones.forEach(d => {
                const prev = state.drones[d.drone_id];
                state.drones[d.drone_id] = { ...prev, ...d };
                const lat = _lat(state.drones[d.drone_id]);
                const lng = _lng(state.drones[d.drone_id]);
                if (lat != null && lng != null) {
                    // İlk yüklemede marker'ı direkt konuma koy, trail başlat
                    updateDroneMarker(d.drone_id, lat, lng, d.name);
                    setMotionTarget(d.drone_id, lat, lng);
                }
            });
            Object.keys(state.markers).forEach(id => { if (!state.drones[id]) removeDroneMarker(id); });
            renderDroneCards();
            renderAssignDroneButtons();
            renderDroneAssignments();
            updateAssignmentMarkers();
            updateDroneCount();
        }
    } catch (e) {
        console.error('Fetch drones error:', e);
    }
}

function updateDroneCount() {
    const el = document.getElementById('droneCount');
    if (el) el.textContent = `${Object.keys(state.drones).length} drone`;
}

// ==================== SOCKET ====================

socket.on('connect', () => {
    document.getElementById('connectionDot').className = 'status-dot connected';
    document.getElementById('connectionText').textContent = 'Bağlı';
});

socket.on('disconnect', () => {
    document.getElementById('connectionDot').className = 'status-dot disconnected';
    document.getElementById('connectionText').textContent = 'Bağlantı yok';
});

socket.on('drone_position_update', (data) => {
    const d = state.drones[data.drone_id];
    if (d) {
        d.lat = data.lat;
        d.lng = data.lng;
        // Gerçek nokta: trail'e ekle
        addTrailPoint(data.drone_id, data.lat, data.lng);
        // Marker hareketini akıcı yapmak için hedefe ayarla
        setMotionTarget(data.drone_id, data.lat, data.lng);
    }
    renderDroneCards();
});

socket.on('drone_telemetry_update', (data) => {
    const id = data.drone_id;
    const d = state.drones[id];
    if (!d) return;

    const fields = ['mode', 'armed', 'rel_alt', 'abs_alt', 'heading', 'speed',
                     'climb', 'throttle', 'airspeed', 'bat_volt', 'bat_curr',
                     'bat_pct', 'gps_fix', 'gps_sats', 'gps_hdop'];
    fields.forEach(key => { if (data[key] != null) d[key] = data[key]; });
    if (data.lat != null && data.lng != null) {
        d.lat = data.lat;
        d.lng = data.lng;
        addTrailPoint(id, data.lat, data.lng);
        setMotionTarget(id, data.lat, data.lng);
    }

    renderDroneCards();
});

socket.on('drone_output', () => {});

socket.on('drone_removed', (data) => {
    delete state.drones[data.drone_id];
    delete state.droneTargets[data.drone_id];
    removeDroneMarker(data.drone_id);
    if (state.selectedDroneId === data.drone_id) state.selectedDroneId = null;
    if (state.expandedDroneId === data.drone_id) state.expandedDroneId = null;
    renderDroneCards();
    renderAssignDroneButtons();
    renderDroneAssignments();
    updateAssignmentMarkers();
    updateDroneCount();
});

socket.on('all_drones_removed', () => {
    state.drones = {};
    state.droneTargets = {};
    state.selectedDroneId = null;
    state.expandedDroneId = null;
    Object.keys(state.markers).forEach(id => removeDroneMarker(id));
    renderDroneCards();
    renderAssignDroneButtons();
    renderDroneAssignments();
    updateAssignmentMarkers();
    updateDroneCount();
});

// ==================== INIT ====================

// ==================== TELEMETRY CHARTS ====================

const chartHistory = {};
const MAX_CHART_POINTS = 60;
let altChartInstance = null, speedChartInstance = null, batteryChartInstance = null;

function initCharts() {
    if (typeof Chart === 'undefined') return;
    const baseOpts = {
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: { x: { display: false }, y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } } },
        plugins: { legend: { display: false } }, elements: { point: { radius: 0 }, line: { borderWidth: 2, tension: 0.3 } }
    };
    altChartInstance = new Chart(document.getElementById('altChart'), {
        type: 'line', data: { labels: [], datasets: [{ label: 'İrtifa (m)', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true }] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, title: { display: true, text: 'İrtifa (m)', color: '#94a3b8', font: { size: 11 } } } }
    });
    speedChartInstance = new Chart(document.getElementById('speedChart'), {
        type: 'line', data: { labels: [], datasets: [{ label: 'Hız (m/s)', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, title: { display: true, text: 'Hız (m/s)', color: '#94a3b8', font: { size: 11 } } } }
    });
    batteryChartInstance = new Chart(document.getElementById('batteryChart'), {
        type: 'line', data: { labels: [], datasets: [{ label: 'Batarya %', data: [], borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true }] },
        options: { ...baseOpts, scales: { ...baseOpts.scales, y: { ...baseOpts.scales.y, min: 0, max: 100 } }, plugins: { ...baseOpts.plugins, title: { display: true, text: 'Batarya %', color: '#94a3b8', font: { size: 11 } } } }
    });
}

function recordChartData(droneId, d) {
    if (!chartHistory[droneId]) chartHistory[droneId] = { alt: [], speed: [], bat: [], labels: [] };
    const h = chartHistory[droneId];
    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    h.labels.push(now);
    h.alt.push(d.rel_alt ?? d.abs_alt ?? null);
    h.speed.push(d.speed ?? null);
    h.bat.push(d.bat_pct ?? null);
    if (h.labels.length > MAX_CHART_POINTS) {
        h.labels.shift(); h.alt.shift(); h.speed.shift(); h.bat.shift();
    }
}

function updateCharts() {
    const sel = document.getElementById('chartDroneSelect');
    if (!sel) return;
    const id = sel.value;
    const h = chartHistory[id];
    if (!h || !altChartInstance) return;

    altChartInstance.data.labels = h.labels;
    altChartInstance.data.datasets[0].data = h.alt;
    altChartInstance.update();

    speedChartInstance.data.labels = h.labels;
    speedChartInstance.data.datasets[0].data = h.speed;
    speedChartInstance.update();

    batteryChartInstance.data.labels = h.labels;
    batteryChartInstance.data.datasets[0].data = h.bat;
    batteryChartInstance.update();
}

function refreshChartDroneSelect() {
    const sel = document.getElementById('chartDroneSelect');
    if (!sel) return;
    const prev = sel.value;
    const ids = Object.keys(state.drones);
    sel.innerHTML = ids.map(id => `<option value="${id}">${state.drones[id].name || id}</option>`).join('');
    if (ids.includes(prev)) sel.value = prev;
    else if (ids.length > 0) sel.value = ids[0];
    const section = document.getElementById('chartSection');
    if (section) section.style.display = ids.length > 0 ? 'block' : 'none';
}

// ==================== MISSION PLANNER ====================

const missionSteps = [];

function addMissionStep() {
    const type = document.getElementById('missionCmdType').value;
    const alt = parseFloat(document.getElementById('missionAlt')?.value || 30);
    const step = { type, alt };

    if (type === 'waypoint') {
        const t = state.waypointTarget;
        if (!t) { showToast('Önce haritada bir nokta seçin', 'error'); return; }
        step.lat = t.lat;
        step.lng = t.lng;
    }
    if (type === 'loiter') {
        step.duration = parseInt(document.getElementById('missionLoiterTime')?.value || 10);
    }
    if (type === 'mode') {
        step.mode = document.getElementById('missionModeSelect')?.value || 'GUIDED';
    }

    missionSteps.push(step);
    renderMissionSteps();
    showToast('Görev adımı eklendi', 'info');
}

function renderMissionSteps() {
    const container = document.getElementById('missionSteps');
    if (!container) return;
    if (missionSteps.length === 0) {
        container.innerHTML = '<p class="hint-small muted">Henüz adım yok</p>';
        return;
    }
    container.innerHTML = missionSteps.map((s, i) => {
        let desc = '';
        if (s.type === 'takeoff') desc = `Takeoff ${s.alt}m`;
        else if (s.type === 'waypoint') desc = `WP ${s.lat?.toFixed(5)},${s.lng?.toFixed(5)} @${s.alt}m`;
        else if (s.type === 'loiter') desc = `Loiter ${s.duration}s`;
        else if (s.type === 'rtl') desc = 'RTL';
        else if (s.type === 'land') desc = 'Land';
        else if (s.type === 'mode') desc = `Mod: ${s.mode}`;
        return `<div class="mission-step"><span class="step-num">${i + 1}</span><span class="step-desc">${desc}</span><button class="btn-remove-wp" onclick="removeMissionStep(${i})">×</button></div>`;
    }).join('');
}

function removeMissionStep(index) {
    missionSteps.splice(index, 1);
    renderMissionSteps();
}

function clearMission() {
    missionSteps.length = 0;
    renderMissionSteps();
}

function executeMission() {
    if (missionSteps.length === 0) { showToast('Görev listesi boş', 'error'); return; }
    const ids = getTargetDrones();
    if (ids.length === 0) { showToast('Drone seçin', 'error'); return; }

    let delay = 0;
    const cmds = [];
    missionSteps.forEach(step => {
        if (step.type === 'takeoff') {
            cmds.push({ cmd: 'arm throttle', delay });
            delay += 500;
            cmds.push({ cmd: 'mode GUIDED', delay });
            delay += 300;
            cmds.push({ cmd: `takeoff ${step.alt}`, delay });
            delay += 3000;
        } else if (step.type === 'waypoint') {
            cmds.push({ cmd: `guided ${step.lat} ${step.lng} ${step.alt}`, delay });
            delay += 5000;
        } else if (step.type === 'loiter') {
            cmds.push({ cmd: 'mode LOITER', delay });
            delay += (step.duration || 10) * 1000;
            cmds.push({ cmd: 'mode GUIDED', delay });
            delay += 300;
        } else if (step.type === 'rtl') {
            cmds.push({ cmd: 'mode RTL', delay });
            delay += 1000;
        } else if (step.type === 'land') {
            cmds.push({ cmd: 'mode LAND', delay });
            delay += 1000;
        } else if (step.type === 'mode') {
            cmds.push({ cmd: `mode ${step.mode}`, delay });
            delay += 500;
        }
    });

    ids.forEach(id => {
        cmds.forEach(c => {
            setTimeout(() => socket.emit('drone_command', { drone_id: id, command: c.cmd }), c.delay);
        });
    });

    showToast(`Görev başlatıldı: ${missionSteps.length} adım, ${ids.length} drone`, 'success');
}

document.getElementById('missionCmdType')?.addEventListener('change', function() {
    const v = this.value;
    const loiterRow = document.getElementById('missionLoiterRow');
    const modeRow = document.getElementById('missionModeRow');
    if (loiterRow) loiterRow.style.display = v === 'loiter' ? 'flex' : 'none';
    if (modeRow) modeRow.style.display = v === 'mode' ? 'flex' : 'none';
});

// ==================== KEYBOARD SHORTCUTS (MAP) ====================

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key.toUpperCase();
    if (key === 'G') sendCmdBatch('mode GUIDED');
    else if (key === 'R') sendCmdBatch('mode RTL');
    else if (key === 'L') sendCmdBatch('mode LAND');
    else if (key === 'T') sendTakeoffBatch();
    else if (key === ' ') { e.preventDefault(); sendCmdBatch(Object.values(state.drones).some(d => d.armed) ? 'disarm' : 'arm throttle'); }
    else if (key === 'F') fitAllDrones();
    else if (key >= '1' && key <= '9') {
        const ids = Object.keys(state.drones);
        const idx = parseInt(key) - 1;
        if (idx < ids.length) selectDrone(ids[idx]);
    }
});

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    startMotionLoop();
    initCharts();
    fetchDrones();
    setInterval(() => {
        fetchDrones();
        Object.entries(state.drones).forEach(([id, d]) => recordChartData(id, d));
        refreshChartDroneSelect();
        updateCharts();
    }, 3000);
});
