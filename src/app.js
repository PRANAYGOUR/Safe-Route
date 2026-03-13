// SafeRoute – Main Application Entry & Router
import { events, qs, showToast, getSetting, sendNotification } from './utils.js';
import { onAuthStateChange, getSession, signIn, signUp } from './auth.js';
import * as gps from './services/gps.js';
import * as halt from './services/halt.js';
import * as risk from './services/risk.js';
import * as escalation from './services/escalation.js';
import * as sos from './services/sos.js';
import * as voice from './services/voice.js';
import * as groq from './services/groq.js';
import { initPowerButtonTrigger } from './services/powerButton.js';

// Screens (Dynamically loaded)
const screens = {
    home:      () => import('./screens/home.js'),
    journey:   () => import('./screens/journey.js'),
    tracking:  () => import('./screens/tracking.js'),
    sos:       () => import('./screens/sos.js'),
    contacts:  () => import('./screens/contacts.js'),
    safezones: () => import('./screens/safezones.js'),
    history:   () => import('./screens/history.js'),
    settings:  () => import('./screens/settings.js')
};

class App {
    constructor() {
        this.currentScreen = null;
        this.user = null;
        
        // Expose for debugging/sim
        window._safeRoute = { gps, halt, risk, escalation, sos, voice };
    }

    async init() {
        console.log('[App] Initializing SafeRoute...');
        
        // 1. Initial Auth Check
        const session = await getSession();
        this.updateUser(session?.user || null);

        // 2. Listen for Auth Changes
        onAuthStateChange((_event, session) => {
            this.updateUser(session?.user || null);
        });

        // 3. Request Location Early
        gps.requestLocationAccess();

        // 4. Initialize Router
        window.addEventListener('hashchange', () => this.route());
        this.route();

        // 4. Initialize Global Hardware Hooks
        initPowerButtonTrigger();
        voice.startVoiceDetection();

        // 5. Setup Nav Clicks
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const screen = btn.dataset.screen;
                if (screen) window.location.hash = `#${screen}`;
            });
        });

        // 6. Setup Global Monitoring & Notifications
        events.on('risk-updated', ({ score, level }) => {
            if (score > 70 && getSetting('auto_audio', true)) {
                voice.startRecording?.();
            }
            if (score > 50) {
                sendNotification(`Safety Alert: ${level.label}`, { 
                    body: `Your risk score is ${score}. Please check in.`,
                    tag: 'risk-alert'
                });
            }
        });

        events.on('sos-trigger', ({ reason }) => {
            sendNotification('🚨 SOS TRIGGERED', { 
                body: `Reason: ${reason}. emergency contacts are being notified immediately.`,
                requireInteraction: true,
                tag: 'sos-alert'
            });
        });

        events.on('halt-detected', () => {
            sendNotification('Halt Detected', { body: 'You have been stationary for a while. Are you safe?' });
        });

        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        // 7. Initialize Auth Modal UI
        this.initAuthUI();

        // 8. Remove Splash
        setTimeout(() => {
            const splash = qs('#splash-screen');
            splash.classList.add('exit');
            qs('#main-app').classList.remove('hidden');
            splash.addEventListener('transitionend', () => splash.remove());
        }, 1500);
    }


    initAuthUI() {
        const tabSignin = qs('#tab-signin');
        const tabSignup = qs('#tab-signup');
        const nameField = qs('#signup-name-field');
        const authForm  = qs('#auth-form');
        const authSubmit = qs('#auth-submit');
        const authError = qs('#auth-error');
        
        let isSignUp = false;

        tabSignin?.addEventListener('click', () => {
            isSignUp = false;
            tabSignin.classList.add('active');
            tabSignup?.classList.remove('active');
            nameField?.classList.add('hidden');
            authSubmit.textContent = 'Sign In';
            authError?.classList.add('hidden');
        });

        tabSignup?.addEventListener('click', () => {
            isSignUp = true;
            tabSignup.classList.add('active');
            tabSignin?.classList.remove('active');
            nameField?.classList.remove('hidden');
            authSubmit.textContent = 'Create Account';
            authError?.classList.add('hidden');
        });

        authForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            authSubmit.disabled = true;
            authSubmit.textContent = isSignUp ? 'Creating Account...' : 'Signing In...';
            authError?.classList.add('hidden');

            const email = qs('#auth-email').value;
            const password = qs('#auth-password').value;
            const name = qs('#auth-name')?.value;

            try {
                const { data, error } = isSignUp 
                    ? await signUp(email, password, name)
                    : await signIn(email, password);

                if (error) {
                    authError.textContent = error.message;
                    authError.classList.remove('hidden');
                } else {
                    showToast(isSignUp ? 'Account created! Please check your email.' : 'Welcome back!', 'success');
                }
            } catch (err) {
                authError.textContent = 'An unexpected error occurred.';
                authError.classList.remove('hidden');
            } finally {
                authSubmit.disabled = false;
                authSubmit.textContent = isSignUp ? 'Create Account' : 'Sign In';
            }
        });
    }

    async updateUser(user) {
        this.user = user;
        const authModal = qs('#auth-modal');
        
        if (!user) {
            authModal.classList.remove('hidden');
        } else {
            authModal.classList.add('hidden');
            
            // Onboarding check: If user has no contacts, redirect to #contacts
            const sb = import('./supabase.js').then(m => m.getSupabase());
            const supabase = await sb;
            if (supabase) {
                const { data: contacts } = await supabase.from('trusted_contacts').select('id').eq('user_id', user.id).limit(1);
                if (!contacts || contacts.length === 0) {
                    if (window.location.hash !== '#contacts') {
                        showToast('Please add an emergency contact to get started.', 'info');
                        window.location.hash = '#contacts';
                        return;
                    }
                }
            }

            if (!this.currentScreen || this.currentScreen === 'auth') {
                window.location.hash = '#home';
            }
        }
    }

    async route() {
        const hash = window.location.hash.slice(1) || 'home';
        
        // Update Nav UI
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.screen === hash);
        });

        if (this.currentScreen === hash) return;

        const container = qs('#screen-container');
        
        // Add transition out if needed
        if (container.firstChild) {
            container.firstChild.style.opacity = '0';
            container.firstChild.style.transform = 'translateY(-10px)';
        }

        try {
            const module = await (screens[hash] || screens.home)();
            const screenInstance = await module.render();
            
            container.innerHTML = '';
            container.appendChild(screenInstance);
            
            this.currentScreen = hash;
            
            // Re-run any screen-specific logic
            if (module.init) module.init();

        } catch (err) {
            console.error(`[Router] Failed to load screen "${hash}":`, err);
            showToast('Navigation error', 'error');
        }
    }
}

// Global App Instance
const app = new App();

function startApp() {
    if (window._appInitialized) return;
    window._appInitialized = true;
    app.init().catch(err => {
        console.error('[App] Critical Init Error:', err);
        // Ensure main app still shows if splash is stuck
        const splash = document.getElementById('splash-screen');
        if (splash) splash.remove();
        document.getElementById('main-app')?.classList.remove('hidden');
    });
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
