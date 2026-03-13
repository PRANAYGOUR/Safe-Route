import { events, showToast } from '../utils.js';
import { gpsState, injectSimulatedPosition } from './gps.js';
import { boostRisk } from './risk.js';

let _simInterval = null;
let _currentIdx = 0;
let _simRoute = [];

export function startSimulation(routeCoords) {
    if (_simInterval) {
        clearInterval(_simInterval);
        _simInterval = null;
        showToast('Simulation paused.', 'info');
        events.emit('simulation-stopped');
        return;
    }
    
    if (routeCoords && routeCoords.length) {
        _simRoute = routeCoords;
    }

    if (_currentIdx >= _simRoute.length) {
        _currentIdx = 0; // reset if at end
    }
    
    _simInterval = setInterval(() => {
        if (_currentIdx >= _simRoute.length) {
            clearInterval(_simInterval);
            _simInterval = null;
            showToast('🎉 Destination Reached!', 'success', 5000);
            completeJourney();
            return;
        }
        
        const [lng, lat] = _simRoute[_currentIdx];
        injectSimulatedPosition(lat, lng, 15);
        _currentIdx++;
    }, 1000); // 1 point per second for smooth testing
    
    showToast('Journey simulation playing.', 'info');
    events.emit('simulation-started');
}

export function completeJourney() {
    stopSimulation();
    const journeyId = window._currentJourney?.id;
    if (journeyId) {
        import('../supabase.js').then(async ({ getSupabase }) => {
            const sb = getSupabase();
            if (sb) {
                await sb.from('journeys').update({ 
                    status: 'completed', 
                    end_time: new Date().toISOString() 
                }).eq('id', journeyId);
            }
        });
    }

    import('./halt.js').then(h => h.stopHaltDetection());
    import('./risk.js').then(r => r.stopRiskEngine());

    window._currentJourney = null;
    import('../utils.js').then(u => u.setSetting('active_journey', null));
    showToast('Voyage Ended. Returning home...', 'success', 3000);
    setTimeout(() => { window.location.hash = '#home'; }, 1000);
}


export function stopSimulation() {
    clearInterval(_simInterval);
    _simInterval = null;
    showToast('Simulation stopped.', 'warning');
    events.emit('simulation-stopped');
}

export function simulateHalt() {
    clearInterval(_simInterval);
    const pos = window._safeRoute?.gps?.gpsState?.current;
    if (pos) {
        injectSimulatedPosition(pos.lat, pos.lng, 0);
        showToast('Vehicle halted...', 'info');
        // Simulate waiting 5 minutes
        setTimeout(() => {
            window._safeRoute?.halt?.forceHaltDetection(window._currentJourney?.id);
            showToast('5m simulated halt -> Alert Triggered!', 'error');
        }, 2000);
    }
}

export function simulateDeviation() {
    if (_simInterval) {
        clearInterval(_simInterval);
        _simInterval = null;
        showToast('Simulation paused for deviation...', 'info');
        events.emit('simulation-stopped');
    }
    const pos = window._safeRoute?.gps?.gpsState?.current;
    if (pos) {
        showToast('Deviating from route...', 'warning');
        injectSimulatedPosition(pos.lat + 0.005, pos.lng + 0.005, 12);
        
        setTimeout(() => {
            boostRisk(45);
            showToast('Deviation Detected! Risk Spiked.', 'error');
        }, 1500);
    }
}

export function increaseRiskScore() {
    boostRisk(30);
    showToast('Manual Risk Spike (+30)', 'warning');
}

export function triggerSimSOS() {
    showToast('SOS trigger simulated!', 'error');
    events.emit('sos-trigger', { reason: 'simulation' });
}

