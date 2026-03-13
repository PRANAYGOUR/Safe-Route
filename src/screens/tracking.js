// SafeRoute – Live Journey Tracking Screen
import { el, qs, events, formatDistance, formatETA, getSetting, haversine, showToast } from '../utils.js';
import { getRiskLevel } from '../config.js';
import * as sim from '../services/simulation.js';
import { haltState } from '../services/halt.js';

let map = null;
let posMarker = null;
let routeLayer = null;

export async function render() {
    let journey = window._currentJourney || getSetting('active_journey', null);
    if (journey && !window._currentJourney) window._currentJourney = journey;

    if (!journey) {
        return el('div', { class: 'screen flex-col items-center justify-center', style: 'text-align:center; padding: 40px;' },
            el('div', { style: 'font-size: 4rem; margin-bottom: 20px;' }, '🧭'),
            el('h2', {}, 'No Active Journey'),
            el('p', { style: 'margin: 10px 0 24px;' }, 'Plan a route to start live monitoring.'),
            el('button', { class: 'btn-primary', onclick: () => window.location.hash = '#journey' }, 'Plan Journey 🛡️')
        );
    }

    const root = el('div', { class: 'screen flex-col', style: 'padding: 40px 0 0 0; overflow:hidden; height:100vh; position: relative;' },
        // Top Risk HUD - Fixed
        el('div', { class: 'tracking-hud-static', style: 'flex-shrink:0; padding:12px; border-bottom:1px solid var(--border); background:var(--bg-surface); z-index: 10;' },
            el('div', { class: 'card', style: 'padding:12px; background:rgba(124,58,237,0.05);' },
                el('div', { class: 'flex items-center justify-between' },
                    el('div', { class: 'risk-gauge-ring', style: 'width:70px; height:70px; position:relative;' },
                        el('svg', { class: 'risk-gauge-svg', viewBox: '0 0 100 100', style: 'width:70px; height:70px; transform: rotate(-90deg); position:absolute; top:0; left:0;' },
                            el('circle', { class: 'risk-gauge-track', cx: '50', cy: '50', r: '42', stroke: 'rgba(124,58,237,0.2)', 'stroke-width': '8', fill: 'none' }),
                            el('circle', { id: 'risk-fill', class: 'risk-gauge-fill', cx: '50', cy: '50', r: '42', stroke: '#27AE60', 'stroke-width': '8', fill: 'none', 'stroke-dasharray': '264', 'stroke-dashoffset': '264', style: 'transition: stroke-dashoffset 0.8s ease, stroke 0.5s ease;' })
                        ),
                        el('div', { class: 'risk-gauge-center', style: 'position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;' },
                            el('span', { id: 'risk-value', class: 'risk-score-num', style: 'font-size:1.4rem; font-weight:800; line-height:1; color:var(--text);' }, '0'),
                            el('span', { class: 'risk-score-label', style: 'font-size:0.6rem; opacity:0.8; color:var(--text);' }, 'Score')
                        )
                    ),
                    el('div', { class: 'flex-col', style: 'flex:1; margin-left:16px;' },
                        el('div', { id: 'risk-tier-badge', class: 'risk-level-badge risk-safe', style: 'align-self:flex-start; margin-bottom:4px; font-size:0.6rem;' }, 'Safe'),
                        el('h4', { style: 'font-size:0.8rem;' }, 'Safety Status'),
                        el('p', { id: 'ai-explanation-text', class: 'text-xs', style: 'line-height:1.2; margin-top:2px; opacity:0.8;' }, 'Monitoring journey...')
                    )
                )

            ),
            // Halt Alert
            el('div', { id: 'halt-banner', class: 'card hidden mt-xs', style: 'background:rgba(245,158,11,0.9); padding:8px;' },
                el('div', { class: 'flex items-center gap-sm justify-between', style: 'width: 100%' },
                    el('div', { class: 'flex items-center gap-sm' },
                        el('span', {}, '🛑'),
                        el('div', {},
                            el('h4', { style: 'color:white; font-size:0.75rem;' }, 'Prolonged Halt Detected'),
                            el('p', { id: 'halt-timer', style: 'color:rgba(255,255,255,0.9); font-size:0.7rem;' }, 'Calculating...')
                        )
                    ),
                    el('button', { style: 'padding: 6px 12px; font-size: 0.75rem; border-radius: 6px; border: none; font-weight: bold; background: #27AE60; color: white; cursor: pointer;', onclick: () => {
                        window._safeRoute?.halt?.resolveHalt();
                        window._safeRoute?.risk?.boostRisk(-15);
                        sim.startSimulation(); // auto-resumes sim if we were halted via sim
                    } }, "I'm Safe")
                )
            ),
            // Recording HUD
            el('div', { id: 'recording-hud', class: 'recording-badge hidden mt-xs' },
                el('span', { class: 'rec-dot' }),
                el('span', {}, 'Emergency Audio Active')
            )
        ),

        // Middle Content (Map occupying main screen space)
        el('div', { id: 'tracking-map', style: 'flex: 1; min-height: 250px; width:100%; background:#1a1433; z-index: 1;' }),

        // Secure warning overlay on map
        (!window.isSecureContext && window.location.hostname !== 'localhost') ?
            el('div', { id: 'secure-warning', class: 'card', style: 'position: absolute; top: 120px; left: 16px; right: 16px; z-index: 400; background:rgba(224,59,59,0.9); padding:10px; border:none;' },
                el('div', { class: 'flex items-center justify-between' },
                    el('p', { class: 'text-xs', style: 'color:white; font-weight:700;' }, '⚠ GPS Restricted. Use Sim Mode!'),
                    el('button', { style: 'background:none; border:none; color:white; font-size:1.2rem;', onclick: () => qs('#secure-warning').remove() }, '✕')
                )
            ) : null,

        // Bottom Section (Journey Controls) stays fixed above bottom edge
        el('div', { class: 'bottom-panel', style: 'flex-shrink:0; background:var(--bg-card); border-top:1px solid var(--border); border-top-left-radius: 24px; border-top-right-radius: 24px; z-index: 10; padding:16px 16px 20px;' },
            
            // Stats Header
            el('div', { class: 'tracking-stats', style: 'margin-bottom: 16px;' },
                el('div', { class: 'stat-item' },
                    el('div', { id: 'stat-dist', class: 'stat-value', style: 'font-size: 1.25rem;' }, '0.0 km'),
                    el('div', { class: 'stat-label' }, 'Remaining')
                ),
                el('div', { class: 'stat-item' },
                    el('div', { id: 'stat-eta', class: 'stat-value', style: 'font-size: 1.25rem;' }, '-- min'),
                    el('div', { class: 'stat-label' }, 'Arrival')
                ),
                el('div', { class: 'stat-item' },
                    el('div', { class: 'stat-value', style: 'text-transform: capitalize; font-size: 1rem; margin-top:4px;' }, journey.mode.replace('_', ' ')),
                    el('div', { class: 'stat-label' }, 'Mode')
                )
            ),
            
            // Actions
            el('div', { class: 'flex justify-between items-center mb-sm' },
                el('div', { class: 'live-badge', style: 'margin: 0;' }, 
                    el('span', { class: 'live-dot' }),
                    'Live Monitoring'
                ),
                el('div', { class: 'flex gap-sm' },
                    el('button', { class: 'btn-secondary', style: 'padding: 8px 12px; font-size: 0.75rem; border-radius:12px;', onclick: toggleStealthMode }, '🔒'),
                    el('button', { class: 'btn-danger', style: 'padding: 8px 16px; font-size: 0.8rem; border-radius:12px;', onclick: () => sim.completeJourney() }, 'End Voyage')
                )
            ),

            // Collapsible Simulation Controls
            el('div', { id: 'sim-container', class: `mt-sm px-xs ${(getSetting('sim_enabled', false) || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.isSecureContext) ? '' : 'hidden'}` },
                el('div', { class: 'sim-panel card', style: 'border:1px dashed var(--clr-primary); padding: 8px;' },
                    el('div', { class: 'sim-header', onclick: toggleSimGrid, style: 'padding:4px; font-size: 0.8rem; cursor: pointer;' },
                        el('span', { class: 'sim-badge' }, 'Simulation Controls (Demo)'),
                        el('span', { id: 'sim-arrow', style: 'margin-left:auto;' }, '▼')
                    ),
                    el('div', { id: 'sim-grid', class: 'sim-grid hidden mt-sm', style: 'grid-template-columns: repeat(3, 1fr); gap:6px;' },
                        el('button', { class: 'sim-btn', style: 'padding:6px; font-size:0.7rem;', onclick: () => sim.startSimulation(journey.routeCoords) }, '▶ Start'),
                        el('button', { class: 'sim-btn', style: 'padding:6px; font-size:0.7rem;', onclick: sim.simulateHalt }, '🛑 Halt'),
                        el('button', { class: 'sim-btn', style: 'padding:6px; font-size:0.7rem;', onclick: sim.simulateDeviation }, '↩ Deviate'),
                        el('button', { class: 'sim-btn', style: 'padding:6px; font-size:0.7rem;', onclick: sim.increaseRiskScore }, '📈 Risk Spike'),
                        el('button', { class: 'sim-btn', style: 'padding:6px; font-size:0.7rem;', onclick: triggerFakeCall }, '📞 Fake Call'),
                        el('button', { class: 'sim-btn sim-sos', style: 'padding:6px; font-size:0.7rem;', onclick: sim.triggerSimSOS }, '🚨 SOS Now')
                    )
                )
            )
        ),

        // Stealth Overlay
        el('div', { id: 'stealth-overlay', class: 'stealth-overlay hidden', onclick: toggleStealthMode },
            el('div', { class: 'stealth-header' },
                el('div', { class: 'stealth-time' }, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })),
                el('div', { class: 'stealth-date' }, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))
            ),
            el('div', { class: 'stealth-weather' },
                el('span', { style: 'font-size: 3rem;' }, '⛅'),
                el('h2', { style: 'font-size: 2rem; margin: 10px 0;' }, '24°C'),
                el('p', { style: 'opacity: 0.7;' }, 'Partly Cloudy · H:26° L:18°')
            ),
            el('div', { style: 'margin-top: auto; padding: 40px; text-align: center; opacity: 0.3; font-size: 0.8rem;' }, 'Swipe up to unlock')
        ),

        // Fake Call Overlay
        el('div', { id: 'fake-call-overlay', class: 'fake-call-overlay hidden' },
            el('div', { class: 'caller-info' },
                el('div', { class: 'caller-name' }, 'Mom ❤️'),
                el('div', { class: 'caller-status' }, 'Incoming Call...')
            ),
            el('div', { class: 'call-actions' },
                el('div', { class: 'call-btn btn-decline', onclick: closeFakeCall }, '✕'),
                el('div', { class: 'call-btn btn-accept', onclick: closeFakeCall }, '📞')
            )
        )
    );

    return root;
}

function initMap() {
    if (map) return;
    if (typeof L === 'undefined') {
        console.warn('[Tracking] Leaflet not ready, retrying...');
        setTimeout(initMap, 500);
        return;
    }

    const journey = window._currentJourney;
    if (!journey) return;
    
    const mapEl = qs('#tracking-map');
    if (!mapEl) return;

    map = L.map('tracking-map', { zoomControl: false, attributionControl: false }).setView(journey.destCoords, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // Route polyline
    routeLayer = L.geoJSON({
        type: "Feature",
        geometry: { type: "LineString", coordinates: journey.routeCoords }
    }, {
        style: { color: '#7C3AED', weight: 4, opacity: 0.6 }
    }).addTo(map);

    // Destination marker
    L.marker(journey.destCoords).addTo(map).bindPopup('Destination').openPopup();

    // User position marker
    posMarker = L.circleMarker([0, 0], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#7C3AED',
        fillOpacity: 1
    }).addTo(map);

    // Force Leaflet to recognize container size
    setTimeout(() => {
        if(map) map.invalidateSize();
    }, 500);
}

function updateUI({ score, level, factors }) {
    const fill = qs('#risk-fill');
    const val  = qs('#risk-value');
    const badge = qs('#risk-tier-badge');

    if (!fill) return;

    // Update gauge (Circumference of r=42 is ~264)
    const offset = 264 - (score / 100) * 264;
    fill.style.strokeDashoffset = offset;
    
    // Choose color
    const colors = { Safe: '#27AE60', 'Medium Risk': '#F59E0B', 'High Risk': '#E03B3B' };
    fill.style.stroke = colors[level.label] || '#27AE60';

    val.textContent = score;
    badge.textContent = level.label;
    badge.className = `risk-level-badge ${level.cls}`;

    // Update remaining distance (approx)
    if (factors.deviationMetres !== undefined) {
        // This is just a UI update, normally we'd re-calc ORS but let's keep it simple
    }
}

function onGPS(pos) {
    if (!map || !posMarker) return;
    posMarker.setLatLng([pos.lat, pos.lng]);
    map.panTo([pos.lat, pos.lng]);
    updateMetrics(pos);
}

function updateMetrics(pos) {
    const journey = window._currentJourney;
    if (!journey || !journey.routeCoords.length) return;

    // 1. Find nearest point on route
    let minIdx = 0;
    let minDist = Infinity;
    journey.routeCoords.forEach((coord, idx) => {
        const d = haversine(pos.lat, pos.lng, coord[1], coord[0]);
        if (d < minDist) {
            minDist = d;
            minIdx = idx;
        }
    });

    // 2. Sum remaining distance along route
    let remainingMeters = minDist;
    for (let i = minIdx; i < journey.routeCoords.length - 1; i++) {
        const p1 = journey.routeCoords[i];
        const p2 = journey.routeCoords[i+1];
        remainingMeters += haversine(p1[1], p1[0], p2[1], p2[0]);
    }

    // 3. Update UI
    const distEl = qs('#stat-dist');
    const etaEl = qs('#stat-eta');
    
    if (distEl) distEl.textContent = formatDistance(remainingMeters);
    
    if (etaEl) {
        // More realistic speeds for India/City traffic
        const speeds = { walking: 1.2, bike_cab: 8.0, bus: 6.0, train: 15.0 }; // m/s (approx: walk 4kmh, bike 28kmh, bus 21kmh, train 54kmh)
        const currentSpeedMs = speeds[journey.mode] || 1.4;
        const timeSeconds = remainingMeters / currentSpeedMs;
        etaEl.textContent = formatETA(timeSeconds);
    }
}

function toggleSimGrid() {
    qs('#sim-grid').classList.toggle('hidden');
    qs('#sim-arrow').textContent = qs('#sim-grid').classList.contains('hidden') ? '▲' : '▼';
}

function toggleStealthMode() {
    qs('#stealth-overlay').classList.toggle('hidden');
}

function triggerFakeCall() {
    showToast('Incoming call in 5 seconds...', 'info');
    setTimeout(() => {
        qs('#fake-call-overlay').classList.remove('hidden');
        // Simple ring sound if possible, or just vibrate
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
    }, 5000);
}

function closeFakeCall() {
    qs('#fake-call-overlay').classList.add('hidden');
}

export function init() {
    initMap();
    events.on('risk-updated', updateUI);
    events.on('gps-update', onGPS);
    events.on('gps-tick', () => {
        if (haltState.isHalted) {
            const el = qs('#halt-timer');
            if (el) {
                const remaining = Math.max(0, (5 * 60 * 1000) - haltState.durationMs);
                const mins = Math.floor(remaining / 60000);
                const secs = Math.floor((remaining % 60000) / 1000);
                el.textContent = `Stationary detected. Auto-SOS triggers in ${mins}m ${secs.toString().padStart(2, '0')}s`;
            }
        }
    });

    events.on('ai-explanation', ({ text }) => {
        const el = qs('#ai-explanation-text');
        if (el) el.textContent = text;
    });
    
    events.on('halt-detected', () => qs('#halt-banner')?.classList.remove('hidden'));
    events.on('halt-resolved', () => qs('#halt-banner')?.classList.add('hidden'));

    events.on('recording-started', () => qs('#recording-hud')?.classList.remove('hidden'));
    events.on('recording-stopped', () => qs('#recording-hud')?.classList.add('hidden'));
}
