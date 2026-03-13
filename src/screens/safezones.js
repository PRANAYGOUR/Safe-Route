// SafeRoute – Safe Zone Finder Screen
import { el, qs, showToast, formatDistance } from '../utils.js';
import { OVERPASS } from '../config.js';
import { gpsState } from '../services/gps.js';

let map = null;
let markers = [];

export async function render() {
    const root = el('div', { class: 'screen flex-col' },
        el('div', { class: 'screen-header' },
            el('h2', { class: 'screen-title' }, 'Safe Zones')
        ),
        
        // Map Container
        el('div', { id: 'safezone-map', class: 'card', style: 'height: 200px; padding:0; overflow:hidden; margin-bottom: 24px;' }),

        el('p', { class: 'section-label' }, 'Nearby Places'),
        el('div', { id: 'safezone-list', class: 'scroll-list' },
            el('p', { class: 'text-center text-muted' }, 'Searching for safe places...')
        )
    );

    return root;
}

async function findSafeZones() {
    const pos = gpsState.current;
    if (!pos) {
        qs('#safezone-list').innerHTML = '<p class="text-center">Location required to find safe zones.</p>';
        return;
    }

    if (!map) initMap(pos);

    // Overpass query for police, hospital, metro, townhall (crowded)
    const query = `
        [out:json][timeout:25];
        (
          node["amenity"="police"](around:3000, ${pos.lat}, ${pos.lng});
          node["amenity"="hospital"](around:3000, ${pos.lat}, ${pos.lng});
          node["railway"="station"](around:3000, ${pos.lat}, ${pos.lng});
          node["amenity"="townhall"](around:3000, ${pos.lat}, ${pos.lng});
        );
        out body;
    `;

    try {
        const res = await fetch(OVERPASS, {
            method: 'POST',
            body: query
        });
        const data = await res.json();
        renderZones(data.elements, pos);
    } catch (err) {
        console.error('Overpass error:', err);
        qs('#safezone-list').innerHTML = '<p class="text-center text-danger">Error fetching safe zones.</p>';
    }
}

function renderZones(elements, userPos) {
    const list = qs('#safezone-list');
    list.innerHTML = '';
    
    // Clear old markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    if (elements.length === 0) {
        list.innerHTML = '<p class="text-center">No safe zones found nearby.</p>';
        return;
    }

    // Sort by distance
    const zones = elements.map(e => {
        const dist = haversine(userPos.lat, userPos.lng, e.lat, e.lon);
        return { ...e, dist };
    }).sort((a, b) => a.dist - b.dist);

    zones.forEach(zone => {
        const type = zone.tags.amenity || (zone.tags.railway ? 'metro' : 'public');
        const iconMap = { police: '👮', hospital: '🏥', metro: '🚇', public: '🏛' };
        const clsMap = { police: 'sz-police', hospital: 'sz-hospital', metro: 'sz-metro', public: 'sz-public' };

        const item = el('div', { class: 'safe-zone-card mt-sm' },
            el('div', { class: `sz-icon ${clsMap[type] || 'sz-public'}` }, iconMap[type] || '📍'),
            el('div', { class: 'sz-info' },
                el('div', { class: 'sz-name' }, zone.tags.name || `Nearby ${type}`),
                el('div', { class: 'sz-dist' }, `${formatDistance(zone.dist)} away`)
            ),
            el('button', { class: 'btn-secondary', style: 'padding: 6px 12px; font-size: 0.7rem;', onclick: () => focusZone(zone) }, 'Show')
        );
        list.appendChild(item);

        // Add to map
        const m = L.marker([zone.lat, zone.lon]).addTo(map)
            .bindPopup(`<b>${zone.tags.name || type}</b><br>${formatDistance(zone.dist)} away`);
        markers.push(m);
    });
}

function focusZone(zone) {
    map.setView([zone.lat, zone.lon], 16);
    markers.find(m => m.getLatLng().lat === zone.lat && m.getLatLng().lng === zone.lon)?.openPopup();
}

function initMap(pos) {
    map = L.map('safezone-map', { zoomControl: false, attributionControl: false }).setView([pos.lat, pos.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.circleMarker([pos.lat, pos.lng], { radius: 6, color: '#fff', fillColor: '#7C3AED', fillOpacity: 1 }).addTo(map);
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function init() {
    findSafeZones();
}
