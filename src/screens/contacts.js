// SafeRoute – Trusted Contacts Screen
import { el, qs, showToast } from '../utils.js';
import { getSupabase } from '../supabase.js';

export async function render() {
    const root = el('div', { class: 'screen' },
        el('div', { class: 'screen-header' },
            el('h2', { class: 'screen-title' }, 'Trusted Contacts')
        ),
        el('p', { class: 'text-sm mb-md', style: 'margin-bottom: 24px;' }, 'People who will be notified instantly when an emergency is triggered.'),

        el('div', { id: 'contacts-list', class: 'scroll-list' },
            el('p', { class: 'text-center text-muted' }, 'Loading contacts...')
        ),

        el('button', { 
            class: 'fab', 
            onclick: showAddModal 
        }, '+')
    );

    return root;
}

async function loadContacts() {
    const sb = getSupabase();
    const list = qs('#contacts-list');
    if (!list) return;

    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            list.innerHTML = '<p class="text-center mt-md text-muted">Please sign in to view contacts.</p>';
            return;
        }

        const { data, error } = await sb.from('trusted_contacts').select('*').eq('user_id', user.id);
        
        if (error) throw error;
        
        list.innerHTML = '';
        if (data.length === 0) {
            list.innerHTML = `<div class="card text-center" style="padding: 40px 20px;">
                <span style="font-size: 2rem;">👥</span>
                <p class="mt-sm">No contacts added yet.</p>
            </div>`;
            return;
        }

        data.forEach(contact => {
            const card = el('div', { class: 'contact-card' },
                el('div', { class: 'contact-avatar' }, contact.name[0].toUpperCase()),
                el('div', { class: 'contact-info' },
                    el('div', { class: 'contact-name' }, contact.name),
                    el('div', { class: 'contact-detail flex items-center gap-xs' }, 
                        el('span', { style: 'font-size: 0.8rem;' }, '📞'),
                        contact.phone || 'No number'
                    )
                ),
                el('button', { 
                    class: 'contact-del-btn',
                    onclick: () => deleteContact(contact.id)
                }, '✕')
            );
            list.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to load contacts:', err);
        list.innerHTML = '<p class="text-center text-danger">Failed to load contacts.</p>';
    }
}

async function deleteContact(id) {
    if (!confirm('Remove this contact?')) return;
    const sb = getSupabase();
    const { error } = await sb.from('trusted_contacts').delete().eq('id', id);
    if (!error) {
        showToast('Contact removed');
        loadContacts();
    }
}

function showAddModal() {
    const modal = el('div', { class: 'modal-overlay center' },
        el('div', { class: 'modal-sheet', style: 'border-radius: 20px; max-width: 340px;' },
            el('h3', { class: 'text-center mb-md' }, 'Add Contact'),
            el('form', { onsubmit: handleAdd },
                el('div', { class: 'form-group' },
                    el('label', { for: 'c-name' }, 'Name'),
                    el('input', { id: 'c-name', required: true, placeholder: 'E.g. Mom' })
                ),
                el('div', { class: 'form-group' },
                    el('label', { for: 'c-phone' }, 'Phone Number'),
                    el('input', { id: 'c-phone', type: 'tel', required: true, placeholder: '+91 XXXXX XXXXX' })
                ),
                el('button', { class: 'btn-primary btn-full mt-md', type: 'submit' }, 'Save Contact'),
                el('button', { 
                    class: 'btn-secondary btn-full mt-sm', 
                    type: 'button',
                    onclick: (e) => e.target.closest('.modal-overlay').remove()
                }, 'Cancel')
            )
        )
    );
    document.body.appendChild(modal);
}

async function handleAdd(e) {
    e.preventDefault();
    const name = qs('#c-name').value;
    const phone = qs('#c-phone').value;
    
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    
    if (!user) {
        showToast('Please sign in first', 'warning');
        return;
    }

    const { error } = await sb.from('trusted_contacts').insert({
        user_id: user.id,
        name,
        phone
    });

    if (error) {
        showToast('Failed to add contact', 'error');
    } else {
        showToast('Contact added!', 'success');
        e.target.closest('.modal-overlay').remove();
        
        // If this was the first contact, redirect to home to start journey
        const { data: contacts } = await sb.from('trusted_contacts').select('id').eq('user_id', user.id);
        if (contacts && contacts.length === 1) {
            window.location.hash = '#home';
        } else {
            loadContacts();
        }
    }
}

export function init() {
    loadContacts();
}
