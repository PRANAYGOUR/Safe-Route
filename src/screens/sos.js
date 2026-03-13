// SafeRoute – Emergency SOS Screen
import { el, events, qs } from '../utils.js';
import * as sosService from '../services/sos.js';

export async function render() {
    const root = el('div', { class: 'screen flex-col items-center justify-between', style: 'padding-bottom: 40px; padding-top: 60px;' },
        el('div', { class: 'text-center' },
            el('h1', { style: 'color: var(--clr-danger);' }, 'SOS Active'),
            el('p', { class: 'mt-sm' }, 'Trusted contacts are being notified.')
        ),

        // Big SOS Button
        el('div', { class: 'sos-big-btn' },
            el('span', { class: 'sos-big-label' }, 'SOS'),
            el('span', { class: 'sos-big-sub' }, 'Emergency')
        ),

        // Info Card
        el('div', { class: 'card w-full mt-xl' },
            el('div', { class: 'flex-col gap-md' },
                el('div', { class: 'flex items-center gap-sm' },
                    el('span', {}, '📍'),
                    el('div', {},
                        el('h4', {}, 'Live Location Sent'),
                        el('p', { id: 'sos-coords', class: 'text-xs' }, 'Updating...')
                    )
                ),
                el('div', { class: 'flex items-center gap-sm' },
                    el('span', {}, '📞'),
                    el('div', { class: 'w-full' },
                        el('h4', {}, 'Contacts Notified'),
                        el('p', { id: 'sos-contacts-count', class: 'text-xs' }, 'Fetching contacts...'),
                        el('div', { id: 'sos-contacts-list', class: 'flex-col gap-sm mt-sm w-full' })
                    )
                ),
                el('div', { class: 'flex items-center gap-sm' },
                    el('span', {}, '🎙'),
                    el('div', {},
                        el('h4', {}, 'Audio Recording'),
                        el('p', { class: 'text-xs' }, 'Capturing ambient audio...')
                    )
                ),
                el('div', { id: 'police-dispatch-card', class: 'flex items-center gap-sm mt-sm', style: 'padding: 12px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; transition: all 0.3s ease;' },
                    el('span', { id: 'police-icon', style: 'font-size: 1.5rem;' }, '📡'),
                    el('div', {},
                        el('h4', { id: 'police-status-title', style: 'color: #3b82f6;' }, 'Police HQ Connection'),
                        el('p', { id: 'police-status-text', class: 'text-xs font-bold' }, 'Initializing secure connection...')
                    )
                )
            )
        ),

        el('button', { 
            class: 'btn-safe btn-full',
            style: 'margin-top: 32px;',
            onclick: sosService.cancelSOS
        }, 'I Code Safe - Cancel SOS')
    );

    return root;
}

export function init() {
    const pos = window._safeRoute?.gps?.gpsState?.current;
    if (pos) {
        qs('#sos-coords').textContent = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
    }

    events.on('sos-activated', ({ contacts, lat, lng }) => {
        const countEl = qs('#sos-contacts-count');
        if (countEl) countEl.textContent = `${contacts.length} recipients identified.`;
        
        const listEl = qs('#sos-contacts-list');
        if (listEl) {
            listEl.innerHTML = '';
            const locationUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=17`;
            const m = encodeURIComponent(`🚨 EMERGENCY! I need help immediately. \nMy live location: ${locationUrl}\nThe app is currently recording ambient audio and uploading it to authorities.`);
            
            contacts.forEach(c => {
                let p = c.phone.replace(/[^0-9]/g, '');
                if (p.length === 10) p = '91' + p;
                
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center rounded';
                item.style = 'padding: 8px; background: rgba(0,0,0,0.05); margin-top: 4px;';
                item.innerHTML = `
                    <span class="text-sm font-medium" style="color:var(--text);">${c.name}</span>
                    <div class="flex gap-xs">
                        <button class="btn-wa" data-phone="${p}" style="padding:6px 12px; font-size:0.8rem; background:#25D366; color:white; border-radius:4px; font-weight:bold; border:none; cursor:pointer;">WhatsApp</button>
                        <a href="tel:${c.phone}" style="padding:6px 12px; text-decoration:none; font-size:0.8rem; background:#3b82f6; color:white; border-radius:4px; font-weight:bold;">Call</a>
                    </div>
                `;
                listEl.appendChild(item);
            });
            
            listEl.querySelectorAll('.btn-wa').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const phone = e.target.dataset.phone;
                    const waUrl = `whatsapp://send?phone=${phone}&text=${m}`;
                    window.location.href = waUrl;
                });
            });
        }

        const coordEl = qs('#sos-coords');
        if (coordEl) coordEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    });

    events.on('police-dispatch-status', ({ status, message }) => {
        const textEl = qs('#police-status-text');
        const titleEl = qs('#police-status-title');
        const iconEl = qs('#police-icon');
        const cardEl = qs('#police-dispatch-card');
        if (!textEl) return;
        
        textEl.textContent = message;
        
        if (status === 'locating') {
            iconEl.textContent = '📡';
        } else if (status === 'notifying') {
            iconEl.textContent = '🚨';
            cardEl.style.background = 'rgba(245, 158, 11, 0.1)';
            cardEl.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            titleEl.style.color = '#F59E0B';
            textEl.style.color = '#F59E0B';
        } else if (status === 'dispatched') {
            iconEl.textContent = '🚓';
            cardEl.style.background = 'rgba(39, 174, 96, 0.1)';
            cardEl.style.borderColor = 'rgba(39, 174, 96, 0.3)';
            titleEl.style.color = '#27AE60';
            textEl.style.color = '#27AE60';
        }
    });
}
