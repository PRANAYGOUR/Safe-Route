// SafeRoute – Settings Screen
import { el, qs, showToast, getSetting, setSetting } from '../utils.js';
import { signOut, getCurrentUser } from '../auth.js';
import { SUPABASE_URL, GROQ_API_KEY, ORS_API_KEY } from '../config.js';

export async function render() {
    const user = await getCurrentUser();
    
    const root = el('div', { class: 'screen' },
        el('div', { class: 'screen-header' },
            el('h2', { class: 'screen-title' }, 'Settings')
        ),

        // Profile Section
        el('div', { class: 'card mb-lg', style: 'margin-bottom: 24px;' },
            el('div', { class: 'flex items-center gap-md' },
                el('div', { class: 'contact-avatar', style: 'width: 56px; height: 56px; font-size: 1.5rem;' }, (user?.user_metadata?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()),
                el('div', { class: 'flex-col' },
                    el('h3', {}, user?.user_metadata?.full_name || 'Traveler'),
                    el('p', { class: 'text-xs' }, user?.email)
                )
            )
        ),

        el('p', { class: 'section-label' }, 'Connection Status'),
        el('div', { class: 'card mb-lg', style: 'margin-bottom: 24px;' },
            statusRow('Supabase Backend', !!SUPABASE_URL),
            statusRow('Groq AI Engine', !!GROQ_API_KEY),
            statusRow('Route Service', !!ORS_API_KEY)
        ),

        el('p', { class: 'section-label' }, 'App Preferences'),
        el('div', { class: 'card mb-lg', style: 'margin-bottom: 24px;' },
            toggleRow('Developer: Simulation Mode', 'sim_enabled', false),
            el('div', { class: 'divider' }),
            toggleRow('Auto-Audio Recording (High Risk)', 'auto_audio', true),
            el('div', { class: 'divider' }),
            toggleRow('Enable Stealth Mode UI', 'stealth_enabled', true),
            el('div', { class: 'divider' }),

            el('div', { class: 'toggle-wrap' },
                el('span', { class: 'toggle-label' }, 'High Accuracy GPS'),
                el('label', { class: 'toggle' },
                    el('input', { type: 'checkbox', checked: true }),
                    el('span', { class: 'toggle-slider' })
                )
            ),
            el('div', { class: 'divider' }),
            el('div', { class: 'toggle-wrap' },
                el('span', { class: 'toggle-label' }, 'Continuous Voice SOS'),
                el('label', { class: 'toggle' },
                    el('input', { type: 'checkbox', checked: true }),
                    el('span', { class: 'toggle-slider' })
                )
            ),
            el('div', { class: 'divider' }),
            el('div', { class: 'toggle-wrap' },
                el('span', { class: 'toggle-label' }, 'Dark Mode'),
                el('label', { class: 'toggle' },
                    el('input', { type: 'checkbox', checked: true, disabled: true }),
                    el('span', { class: 'toggle-slider' })
                )
            )
        ),

        el('button', { 
            class: 'btn-secondary btn-full',
            style: 'color: var(--clr-danger); border-color: rgba(224,59,59,0.2);',
            onclick: handleLogout
        }, 'Sign Out')
    );

    return root;
}

function statusRow(label, connected) {
    return el('div', { class: 'flex items-center justify-between', style: 'padding: 8px 0;' },
        el('span', { class: 'text-sm' }, label),
        el('div', { class: 'flex items-center gap-sm' },
            el('span', { class: `status-dot ${connected ? 'connected' : 'disconnected'}` }),
            el('span', { class: 'text-xs', style: 'font-weight:600;' }, connected ? 'Connected' : 'Missing Env')
        )
    );
}

async function handleLogout() {
    if (confirm('Are you sure you want to sign out?')) {
        await signOut();
        window.location.reload();
    }
}

function toggleRow(label, settingKey, defaultVal) {
    const isChecked = getSetting(settingKey, defaultVal);
    
    const input = el('input', { 
        type: 'checkbox', 
        checked: isChecked, 
        onchange: (e) => {
            setSetting(settingKey, e.target.checked);
            showToast(`${label} ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
        }
    });

    return el('div', { class: 'toggle-wrap' },
        el('span', { class: 'toggle-label' }, label),
        el('label', { class: 'toggle' },
            input,
            el('span', { class: 'toggle-slider' })
        )
    );
}

export function init() {
    console.log('[Settings] Screen loaded');
}
