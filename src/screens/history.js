// SafeRoute – Journey History Screen
import { el, qs, showToast, formatDistance, formatTime } from '../utils.js';
import { getSupabase } from '../supabase.js';

export async function render() {
    const root = el('div', { class: 'screen' },
        el('div', { class: 'screen-header' },
            el('h2', { class: 'screen-title' }, 'Journey History')
        ),
        el('p', { class: 'text-sm mb-lg', style: 'opacity:0.7;' }, 'Detailed logs of your past trips and safety scores.'),

        el('div', { id: 'history-list', class: 'flex-col gap-md' },
            el('div', { class: 'text-center py-xl' }, 
                el('div', { class: 'spinner', style: 'margin: 0 auto 12px;' }),
                'Loading history...'
            )
        )
    );

    return root;
}

async function loadHistory() {
    const list = qs('#history-list');
    if (!list) return;

    try {
        const sb = getSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;

        const { data, error } = await sb.from('journeys')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        list.innerHTML = '';
        if (!data || data.length === 0) {
            list.innerHTML = `
                <div class="card text-center" style="padding: 40px 20px;">
                    <span style="font-size: 3rem;">📂</span>
                    <h3 class="mt-sm">No History Yet</h3>
                    <p class="text-sm text-muted">Your completed journeys will appear here.</p>
                </div>
            `;
            return;
        }

        data.forEach(j => {
            const date = new Date(j.created_at).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            let statusColor = 'var(--clr-safe)';
            let badgeClass  = 'risk-safe';
            
            if (j.status === 'emergency') { statusColor = 'var(--clr-danger)'; badgeClass = 'risk-high'; }
            else if (j.status === 'active') { statusColor = 'var(--clr-warning)'; badgeClass = 'text-warning'; }
            else if (j.status === 'cancelled') { statusColor = '#888'; badgeClass = 'risk-safe'; }

            const card = el('div', { class: 'card history-card', style: 'padding: 16px; border-left: 4px solid ' + statusColor },
                el('div', { class: 'flex justify-between items-start mb-xs' },
                    el('div', {},
                        el('div', { style: 'font-weight:700; font-size: 0.95rem;' }, j.dest_name || 'Generic Trip'),
                        el('div', { style: 'font-size: 0.75rem; opacity: 0.6;' }, date)
                    ),
                    el('div', { class: 'risk-level-badge ' + badgeClass, style: 'font-size: 0.6rem;' }, j.status.toUpperCase())
                ),
                el('div', { class: 'flex gap-md mt-sm' },
                    el('div', { class: 'stat-item' },
                        el('div', { style: 'font-size: 0.85rem; font-weight:700;' }, j.mode),
                        el('div', { class: 'stat-label', style: 'font-size: 0.6rem;' }, 'MODE')
                    ),
                    el('div', { class: 'stat-item' },
                        el('div', { style: 'font-size: 0.85rem; font-weight:700;' }, j.risk_score_max || '0'),
                        el('div', { class: 'stat-label', style: 'font-size: 0.6rem;' }, 'MAX RISK')
                    )
                )
            );
            list.appendChild(card);
        });

    } catch (err) {
        console.error('History load failed:', err);
        list.innerHTML = '<p class="text-center text-danger">Error loading history.</p>';
    }
}

export function init() {
    loadHistory();
}
