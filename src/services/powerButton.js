// SafeRoute – Power Button Emergency Trigger
// Since we cannot directly access the physical power button in a web app,
// we simulate it by detecting rapid visibility changes (Lock/Unlock)
import { events } from '../utils.js';

let _lastChange = 0;
let _counts = 0;
const TAP_WINDOW_MS = 2000; // 3 taps within 2 seconds
const REQUIRED_TAPS = 3;

export function initPowerButtonTrigger() {
    document.addEventListener('visibilitychange', () => {
        // We only care about the event where user potentially locked/unlocked
        // This is the best PWA-equivalent for power button detection
        const now = Date.now();
        
        if (now - _lastChange < TAP_WINDOW_MS) {
            _counts++;
        } else {
            _counts = 1;
        }
        
        _lastChange = now;
        
        if (_counts >= REQUIRED_TAPS) {
            console.log('[Power] Rapid visibility change detected! Triggering SOS.');
            events.emit('sos-trigger', { reason: 'power-button' });
            _counts = 0; // Reset
        }
    });
}
