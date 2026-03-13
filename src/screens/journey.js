// SafeRoute – Start Safe Journey Screen
import { el, qs, showToast, formatDistance, formatETA } from '../utils.js';
import { ORS_API_KEY, ORS_BASE } from '../config.js';
import * as gpsService from '../services/gps.js';
import * as riskService from '../services/risk.js';
import * as sosService from '../services/sos.js';
import { getSupabase } from '../supabase.js';

let map = null;
let routeLayer = null;
let posMarker = null;
let currentRouteData = null;
let selectedMode = 'walking';
let fetchedSafePlaces = false;

export async function render() {
    const root = el('div', { class: 'screen flex-col', style: 'padding-bottom: 0;' },
        el('div', { class: 'screen-header' },
            el('h2', { class: 'screen-title' }, 'Plan Journey')
        ),

        // Stepped Layout Container
        el('div', { class: 'flex-1 scroll-y', style: 'padding: 0 16px 120px 16px;' },
            // Step 1: Mode
            el('p', { class: 'section-label' }, '1. Choose Travel Mode'),
            el('div', { class: 'mode-grid' },
                createModeBtn('walking', '🚶', 'Walking'),
                createModeBtn('bus', '🚌', 'Bus'),
                createModeBtn('train', '🚆', 'Train'),
                createModeBtn('bike_cab', '🚖', 'Bike / Cab')
            ),

            // Step 2: Destination
            el('p', { class: 'section-label mt-md' }, '2. Where are you going?'),
            el('div', { class: 'form-group' },
                el('div', { class: 'flex justify-between items-center mb-xs' },
                    el('div', { id: 'search-status', class: 'text-xs', style: 'color: var(--clr-primary); font-weight: 500;' }, '🛰️ Getting precise location...'),
                    el('button', { 
                        id: 'bypass-gps', 
                        class: 'text-xs', 
                        style: 'background:none; border:none; color:var(--clr-primary-light); text-decoration:underline; cursor:pointer;',
                        onclick: bypassLocationLock
                    }, 'Manual Bypass')
                ),
                el('input', { 
                    type: 'text', 
                    id: 'dest-input', 
                    placeholder: 'Wait for location lock...',
                    disabled: true,
                    oninput: debounce(handleSearch, 600)
                })
            ),
            el('div', { id: 'search-results', class: 'search-results-overlay' }),

            // Step 3: Map Preview
            el('div', { id: 'journey-map', class: 'card mt-md', style: 'height: 200px; padding:0; overflow:hidden; border: 1px solid var(--border);' })
        ),

        // Persistent Action Bar (Always visible once route found)
        el('div', { id: 'route-info', class: 'hidden action-bar-pop' },
            el('div', { class: 'flex justify-between items-center mb-sm' },
                el('div', { class: 'flex-col' },
                    el('span', { class: 'text-xs text-muted' }, 'Distance'),
                    el('h4', { id: 'route-distance', style: 'margin:0;' }, '0.0 km')
                ),
                el('div', { class: 'flex-col', style: 'text-align: right;' },
                    el('span', { class: 'text-xs text-muted' }, 'Est. Time'),
                    el('h4', { id: 'route-eta', style: 'margin:0; color: var(--clr-primary-light);' }, '0 min')
                )
            ),
            el('button', { 
                class: 'btn-primary btn-full',
                style: 'height: 56px; font-size: 1.1rem;',
                onclick: startJourney
            }, 'Start Safe Journey 🛡️')
        ),

        // Initial placeholder if no route
        el('div', { id: 'route-placeholder', class: 'action-bar-placeholder' },
            el('p', { style: 'margin:0; opacity: 0.6; font-size: 0.9rem;' }, 'Select mode & destination to begin'),
            // Developer Bypass
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.isSecureContext) ? 
                el('button', { 
                    class: 'btn-secondary mt-sm', 
                    style: 'padding: 8px 16px; font-size: 0.8rem; border-style: dashed;',
                    onclick: useSimulatedLocation
                }, 'Dev: Simulate My Location 🧪') : null
        )
    );

    return root;
}

function createModeBtn(id, icon, label) {
    const active = selectedMode === id ? 'selected' : '';
    return el('button', { 
        class: `mode-btn ${active}`, 
        'data-mode': id,
        onclick: (e) => selectMode(id, e.currentTarget)
    },
        el('span', { class: 'mode-icon' }, icon),
        el('span', {}, label)
    );
}

function selectMode(id, btn) {
    selectedMode = id;
    qs('.mode-btn.selected')?.classList.remove('selected');
    btn.classList.add('selected');
    if (currentRouteData) calculateRoute(currentRouteData.point);
}

function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function handleSearch(e) {
    const query = e.target.value;
    if (query.length < 3) return;

    // Use latest GPS for accurate focus
    const currentLoc = gpsService.gpsState.current;
    if (!currentLoc) {
        showToast('Waiting for accurate GPS lock...', 'info');
        return;
    }

    if (!ORS_API_KEY) {
        showToast('OpenRouteService API key missing', 'warning');
        return;
    }

    try {
        const startPos = gpsService.gpsState.current;
        let proximity = '';
        if (startPos) {
            proximity = `&focus.point.lat=${startPos.lat}&focus.point.lon=${startPos.lng}`;
        }

        const res = await fetch(`${ORS_BASE}/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}&size=10${proximity}`);
        const data = await res.json();
        renderSearchResults(data.features);
    } catch (err) {
        console.error('Search error:', err);
    }
}

function renderSearchResults(features) {
    const list = qs('#search-results');
    list.innerHTML = '';
    
    features.forEach(f => {
        const item = el('div', { 
            class: 'card mt-sm', 
            style: 'padding: 12px; cursor: pointer;',
            onclick: () => selectDestination(f)
        }, f.properties.label);
        list.appendChild(item);
    });
}

async function selectDestination(feature) {
    qs('#search-results').innerHTML = '';
    qs('#dest-input').value = feature.properties.label;
    
    const [lng, lat] = feature.geometry.coordinates;
    currentRouteData = { label: feature.properties.label, point: [lat, lng] };
    
    calculateRoute([lat, lng]);
}

async function calculateRoute(destPoint) {
    const startPos = gpsService.gpsState.current || await getCurrentGPS();
    if (!startPos) {
        showToast('Location access needed', 'error');
        return;
    }

    const modeMap = {
        walking: 'foot-walking',
        bus: 'driving-car', // Approximation
        train: 'driving-car',
        bike_cab: 'cycling-regular'
    };

    const profile = modeMap[selectedMode] || 'foot-walking';

    try {
        const url = `${ORS_BASE}/v2/directions/${profile}?api_key=${ORS_API_KEY}&start=${startPos.lng},${startPos.lat}&end=${destPoint[1]},${destPoint[0]}`;
        const res = await fetch(url);
        const data = await res.json();
        
        const route = data.features[0];
        displayRoute(route);
        updateRouteUI(route.properties.summary);
        updatePosMarker(startPos);
        
        currentRouteData.coords = route.geometry.coordinates; // [[lng, lat]]
    } catch (err) {
        console.error('Route error:', err);
        showToast('Could not calculate route', 'error');
    }
}

async function useSimulatedLocation() {
    if (!currentRouteData && !gpsService.gpsState.current) {
        // Just mock a general area if nothing exists
        gpsService.injectSimulatedPosition(13.0827, 80.2707); // Default to Chennai
        showToast('Using simulated location (Chennai/Local)', 'info');
    } else if (currentRouteData) {
        showToast('Simulating location near your destination...', 'info');
        const mockStart = { 
            lat: currentRouteData.point[0] - 0.015, // ~2km away
            lng: currentRouteData.point[1] - 0.015 
        };
        gpsService.injectSimulatedPosition(mockStart.lat, mockStart.lng);
        calculateRoute(currentRouteData.point);
    }
    unlockSearchUI();
}

async function bypassLocationLock() {
    showToast('Locating your exact city via Network...', 'warning');
    const bypassBtn = qs('#bypass-gps');
    if (bypassBtn) bypassBtn.remove();
    
    if (!gpsService.gpsState.current) {
        try {
            const res = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            if (data && data.latitude && data.longitude) {
                gpsService.injectSimulatedPosition(data.latitude, data.longitude);
                showToast(`Location Locked: ${data.city}, ${data.region}`, 'success', 4000);
            } else {
                throw new Error('No GPS data in IP payload');
            }
        } catch(e) {
            console.warn('IP Location failed, falling back to Chennai.', e);
            gpsService.injectSimulatedPosition(13.0827, 80.2707); // Chennai
            showToast('Using fallback secure location (Chennai)', 'info');
        }
    }
    unlockSearchUI();
}


function unlockSearchUI() {
    const status = qs('#search-status');
    const input = qs('#dest-input');
    if (status) {
        status.style.color = 'var(--clr-safe)';
        status.textContent = '📍 Location Active (Manual/Simulated)';
    }
    if (input) {
        input.disabled = false;
        input.placeholder = 'Search destinations...';
    }
}

function displayRoute(route) {
    if (typeof L === 'undefined') {
        console.warn('[Journey] Leaflet not ready for displayRoute, retrying...');
        setTimeout(() => displayRoute(route), 500);
        return;
    }
    if (!map) initMap();
    
    if (routeLayer) map.removeLayer(routeLayer);
    
    const geojson = {
        type: "Feature",
        geometry: route.geometry
    };

    routeLayer = L.geoJSON(geojson, {
        style: { color: '#7C3AED', weight: 5, opacity: 0.8 }
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
}

function updateRouteUI(summary) {
    const info = qs('#route-info');
    const placeholder = qs('#route-placeholder');
    
    if (info) {
        qs('#route-distance').textContent = formatDistance(summary.distance);
        qs('#route-eta').textContent = formatETA(summary.duration);
        info.classList.remove('hidden');
    }
    
    if (placeholder) {
        placeholder.classList.add('hidden');
    }
}

function initMap() {
    if (map) return;
    if (typeof L === 'undefined') {
        console.warn('[Journey] Leaflet (L) not ready, retrying...');
        setTimeout(initMap, 500);
        return;
    }
    // Start with a generic view; will update on GPS lock
    map = L.map('journey-map', { zoomControl: false, attributionControl: false }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    posMarker = L.circleMarker([0, 0], {

        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#7C3AED',
        fillOpacity: 1
    }).addTo(map);
}

function updatePosMarker(pos) {
    if (!map || !posMarker || !pos) return;
    const isInitial = (posMarker.getLatLng().lat === 0);
    posMarker.setLatLng([pos.lat, pos.lng]);
    
    // Auto-center map if we haven't drawn a route yet and this is the first lock
    if (isInitial && !routeLayer) {
        map.setView([pos.lat, pos.lng], 15);
    }
}

async function fetchSafePlaces(lat, lng) {
    if (fetchedSafePlaces) return;
    fetchedSafePlaces = true;
    showToast('Locating nearby safe zones...', 'info');

    const query = `
        [out:json];
        (
          node["amenity"="police"](around:1000,${lat},${lng});
          node["amenity"="hospital"](around:1000,${lat},${lng});
          node["public_transport"="station"](around:1000,${lat},${lng});
        );
        out body;
    `;
    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await res.json();
        let count = 0;
        data.elements.forEach(el => {
            if (!el.lat || !el.lon) return;
            count++;
            let icon = '🏥';
            if (el.tags.amenity === 'police') icon = '🚓';
            if (el.tags.public_transport) icon = '🚇';
            
            const divIcon = L.divIcon({
                html: `<div style="font-size:16px; background:white; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3); border:1px solid #ddd;">${icon}</div>`,
                className: 'safe-place-icon',
                iconSize: [24, 24]
            });
            L.marker([el.lat, el.lon], { icon: divIcon }).addTo(map).bindPopup(el.tags.name || 'Safe Place');
        });
        if (count > 0) showToast(`Found ${count} nearby safe places.`, 'success');
    } catch(e) {
        console.warn('Overpass API error:', e);
        fetchedSafePlaces = false; // allow retry
    }
}

async function getCurrentGPS() {
    const granted = await gpsService.requestLocationAccess();
    if (granted) {
        return gpsService.gpsState.current;
    }
    return null;
}

async function startJourney() {
    if (!currentRouteData) return;
    
    const sb = getSupabase();
    if (!sb) {
        showToast('Supabase not connected', 'error');
        return;
    }

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        showToast('Please sign in to start a journey.', 'warning');
        return;
    }

    // Safety check: Ensure user has trusted contacts
    const { data: contacts } = await sb.from('trusted_contacts').select('id').eq('user_id', user.id);
    if (!contacts || contacts.length === 0) {
        showToast('Please add at least one trusted contact before starting.', 'warning');
        setTimeout(() => window.location.hash = '#contacts', 1500);
        return;
    }
    
    try {
        const startPos = gpsService.gpsState.current;
        if (!startPos) throw new Error('GPS not ready');

        // 1. Create Journey in Supabase
        const { data: journey, error } = await sb.from('journeys').insert({
            user_id: user.id,
            mode: selectedMode,
            start_lat: startPos.lat,
            start_lng: startPos.lng,
            dest_lat: currentRouteData.point[0],
            dest_lng: currentRouteData.point[1],
            dest_name: currentRouteData.label,
            status: 'active'
        }).select().single();

        if (error) throw error;

        // 2. Setup monitoring
        riskService.setRoute(currentRouteData.coords);
        
        // Explicitly request mic permission now while user is interacting
        if (window._safeRoute && window._safeRoute.voice) {
            window._safeRoute.voice.requestMicrophoneAccess();
        }
        
        // Start GPS with journey ID for automated logging
        sosService.setJourneyId(journey.id);
        gpsService.startGPS(journey.id);
        riskService.startRiskEngine(journey.id);
        
        // Save to globals for tracking screen
        const journeyData = {
            id: journey.id,
            mode: selectedMode,
            destination: currentRouteData.label,
            destCoords: currentRouteData.point,
            routeCoords: currentRouteData.coords
        };
        
        window._currentJourney = journeyData;
        import('../utils.js').then(u => u.setSetting('active_journey', journeyData));

        showToast('Journey started! Safe travels.', 'success');
        window.location.hash = '#tracking';

    } catch (err) {
        console.error('[Journey] Start failed:', err);
        showToast('Failed to start journey: ' + err.message, 'error');
    }
}

export function init() {
    initMap();
    
    // Auto-lock location on entry
    const status = qs('#search-status');
    const input = qs('#dest-input');

    // Check if we ALREADY have a location before requesting
    if (gpsService.gpsState.current) {
        unlockSearchUI();
    }

    gpsService.requestLocationAccess().then(granted => {
        if (granted || gpsService.gpsState.current) {
            unlockSearchUI();
            
            const pos = gpsService.gpsState.current;
            if (pos && !fetchedSafePlaces) {
                if (map) map.setView([pos.lat, pos.lng], 15);
                fetchSafePlaces(pos.lat, pos.lng);
            }

            import('../utils.js').then(({ events }) => {
                events.on('gps-update', (updatedPos) => {
                    updatePosMarker(updatedPos);

                    // Update status label if it wasn't already manually bypassed
                    if (status && !status.textContent.includes('Manual')) {
                        status.style.color = 'var(--clr-safe)';
                        status.textContent = '📍 Location locked (High Accuracy)';
                    }
                });
            });
        } else {
            if (status) {
                status.style.color = 'var(--clr-danger)';
                status.textContent = '❌ Location access denied (Use Manual)';
            }
        }
    });

    import('../utils.js').then(({ events }) => {
        events.on('gps-update', (pos) => updatePosMarker(pos));
    });
}
