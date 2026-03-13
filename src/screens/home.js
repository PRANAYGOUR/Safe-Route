// SafeRoute – Home Screen
import { el, events, qs } from '../utils.js';
import { getCurrentUser } from '../auth.js';

export async function render() {
    const user = await getCurrentUser();
    const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Traveler';

    const root = el('div', { class: 'screen' },
        el('div', { class: 'screen-header' },
            el('div', { class: 'flex-col' },
                el('h2', { class: 'screen-title' }, `Hi, ${userName}`),
                el('p', { class: 'screen-subtitle' }, 'Your AI safety companion is active.')
            )
        ),

        // Hero Section - Enhanced
        el('div', { class: 'home-hero', style: 'background: linear-gradient(135deg, rgba(124,58,237,0.1), rgba(232,121,249,0.1)); border: 1px solid rgba(255,255,255,0.05); padding: 32px 20px;' },
            el('div', { class: 'home-shield' },
                el('svg', { viewBox: '0 0 64 64', fill: 'none' },
                    el('path', { d: 'M32 4C20.954 4 12 12.954 12 24C12 36 32 60 32 60C32 60 52 36 52 24C52 12.954 43.046 4 32 4Z', fill: 'url(#heroGrad)' }),
                    el('path', { d: 'M24 24L29 29L40 18', stroke: 'white', 'stroke-width': '3.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
                    el('defs', {}, 
                        el('linearGradient', { id: 'heroGrad', x1: '12', y1: '4', x2: '52', y2: '60', gradientUnits: 'userSpaceOnUse' },
                            el('stop', { 'stop-color': '#E879F9' }),
                            el('stop', { offset: '1', 'stop-color': '#7C3AED' })
                        )
                    )
                )
            ),
            el('h1', { style: 'font-size: 1.8rem; line-height: 1.2;' }, 'Secure Your Commute'),
            el('p', { class: 'mt-sm', style: 'color: rgba(255,255,255,0.8); font-size: 0.95rem; max-width: 250px; margin-left: auto; margin-right: auto;' }, 'Let AI monitor your route and alert loved ones if things don\'t go as planned.'),
            el('button', { 
                class: 'btn-primary mt-lg', 
                id: 'btn-start-journey',
                style: 'margin: 32px auto 0; padding: 18px 40px; font-size: 1.1rem; box-shadow: 0 10px 20px rgba(124,58,237,0.3); border-radius: 50px; width: 85%;',
                onclick: () => window.location.hash = '#journey'
            }, 'Start Safe Journey 🛡️')
        ),

        // Help Card for new users
        el('div', { class: 'card mt-lg', style: 'background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1);' },
            el('h4', { style: 'color: var(--clr-primary); margin-bottom: 8px;' }, 'How it works'),
            el('ol', { style: 'padding-left: 20px; font-size: 0.85rem; color: rgba(255,255,255,0.6);' },
                el('li', { style: 'margin-bottom: 4px;' }, 'Set your destination and travel mode.'),
                el('li', { style: 'margin-bottom: 4px;' }, 'We\'ll monitor your GPS and detect unsafe stops.'),
                el('li', {}, 'Emergency SOS will trigger if a check-in is missed.')
            )
        ),

        // Quick Actions
        el('p', { class: 'section-label mt-lg' }, 'Quick Actions'),
        el('div', { class: 'quick-grid' },
            el('button', { class: 'quick-action', onclick: () => window.location.hash = '#sos' },
                el('div', { class: 'quick-action-icon' }, '🆘'),
                el('div', { class: 'quick-action-label' }, 'Instant SOS')
            ),
            el('button', { class: 'quick-action', onclick: () => window.location.hash = '#safezones' },
                el('div', { class: 'quick-action-icon' }, '📍'),
                el('div', { class: 'quick-action-label' }, 'Safe Zones')
            ),
            el('button', { class: 'quick-action', onclick: () => window.location.hash = '#contacts' },
                el('div', { class: 'quick-action-icon' }, '👥'),
                el('div', { class: 'quick-action-label' }, 'Contacts')
            ),
            el('button', { class: 'quick-action', onclick: () => window.location.hash = '#history' },
                el('div', { class: 'quick-action-icon' }, '📜'),
                el('div', { class: 'quick-action-label' }, 'History')
            )
        )
    );

    return root;
}

export function init() {
    console.log('[Home] Screen loaded');
}
