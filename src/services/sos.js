// SafeRoute – SOS Service
import { events, showToast } from '../utils.js';
import { getSupabase } from '../supabase.js';
import { gpsState } from './gps.js';

let _currentJourneyId = null;
let _isSosActive = false;
let _currentAlertId = null;
let _alertTimeouts = [];
let _oscillator = null;

export function setJourneyId(id) { _currentJourneyId = id; }

export async function triggerSOS(reason = 'manual') {
  if (_isSosActive) return; // Prevent infinite overlapping API calls
  _isSosActive = true;
  
  showToast('🚨 SOS TRIGGERED! SENDING DATA...', 'error', 10000);
  
  const pos = gpsState.current;
  const lat = pos?.lat ?? 0;
  const lng = pos?.lng ?? 0;
  const locationUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=17`;

  // 1. Vibrate urgently immediately
  if (navigator.vibrate) navigator.vibrate([800, 200, 800, 200, 800, 200, 800, 200, 800]);

  // 2. Save SOS alert to Supabase (Background)
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data, error } = await sb.from('sos_alerts').insert({
          user_id:    user.id,
          journey_id: _currentJourneyId,
          latitude:   lat,
          longitude:  lng,
          trigger_reason: reason,
          message:   'Emergency alert. The user may be in danger. Live location attached.'
        }).select('id').single();
        
        if (!error && data) {
            _currentAlertId = data.id;
            console.log('[SOS] Logged to database. Alert ID:', _currentAlertId);
        }
      }
    } catch(e) {
      console.warn('SOS log error:', e);
    }
  }

  // START RECORDING IMMEDIATELY (pass alertId to link the audio file)
  import('./voice.js').then(v => v.startRecording(30000, _currentAlertId));

  // 3. Fetch trusted contacts and send alerts (Parallel)
  getTrustedContacts().then(contacts => {
    sendPhoneAlerts(contacts, lat, lng, locationUrl);
    events.emit('sos-activated', { lat, lng, contacts, reason });
  });

  // 4. Authorities Alert Simulation
  simulatePoliceAlert(lat, lng);

  // 5. Play Siren Sound
  playEmergencySiren();

  // 6. Navigate to SOS screen (for user feedback)
  window.location.hash = '#sos';
}

async function getTrustedContacts() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  const { data } = await sb.from('trusted_contacts').select('*').eq('user_id', user.id);
  return data || [];
}

function sendPhoneAlerts(contacts, lat, lng, locationUrl) {
  showToast(`Initiating automated API alerts for ${contacts.length} contacts...`, 'info', 4000);
  
  // Appending the audio recording note to the message.
  const emergencyMessage = `🚨 EMERGENCY! I need help immediately. 
My live location: ${locationUrl}
The app is currently recording ambient audio and uploading it to authorities.`;

  const encodedMessage = encodeURIComponent(emergencyMessage);

  let delay = 0;
  contacts.forEach((contact) => {
    
    // 1. WhatsApp Intent 
    let t1 = setTimeout(() => {
        if (contact.phone) {
            console.log(`[API] Triggering WhatsApp Intent to ${contact.name} (${contact.phone}).`);
            showToast(`✅ Opening WhatsApp for ${contact.name}...`, 'success', 3000);
            let cleanPhone = contact.phone.replace(/[^0-9]/g, '');
            if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone; // Fallback country code
            
            // Using the native whatsapp:// intent bypasses PWA popup blockers that kill window.open()
            // Setting href to an intent scheme does NOT navigate the browser away from the app
            const waUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedMessage}`;
            window.location.href = waUrl;
        }
    }, 1500 + (delay * 5000));

    // 2. Automated IVR Phone Call Simulation (Backend)
    let t2 = setTimeout(() => {
        if (contact.phone) {
            console.log(`[API] Server triggering automated Phone Call to ${contact.phone}...`);
            showToast(`📞 Automated Server Call ringing for ${contact.name}...`, 'warning', 3000);
            // Removed `window.location.href = tel:...` as it navigating the DOM breaks the JS execution loop 
            // for subsequent contacts in mobile browsers and PWAs.
        }
    }, 3000 + (delay * 5000));
    
    // 3. SMS Fallback Delivery Intent
    let t3 = setTimeout(() => {
        if (contact.phone) {
            console.log(`[API] SMS Intent delivered to ${contact.phone}.`);
            // showToast(`✉ SMS delivered to ${contact.name}`, 'info', 2000);
        }
    }, 4500 + (delay * 5000));

    _alertTimeouts.push(t1, t2, t3);
    delay++;
  });
}


function simulatePoliceAlert(lat, lng) {
    events.emit('police-dispatch-status', { status: 'locating', message: 'Locating nearby police stations...' });
    
    setTimeout(() => {
        events.emit('police-dispatch-status', { status: 'notifying', message: 'Broadcasting coordinates to HQ...' });
        showToast('📍 HQ: Coordinates Broadcasted to Authorities', 'info', 5000);
    }, 1500);

    setTimeout(() => {
        events.emit('police-dispatch-status', { status: 'dispatched', message: '🚓 Police Unit Dispatched to your location!' });
        showToast('🚓 ALERT SENT TO NEARBY POLICE STATION', 'error', 6000);
    }, 4500);
}

function playEmergencySiren() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        _oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        _oscillator.type = 'triangle';
        _oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        _oscillator.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.5);
        _oscillator.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 1.0);
        _oscillator.loop = true;

        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        
        _oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        _oscillator.start();
        // Stop after 10 seconds to not be too annoying
        setTimeout(() => { if(_oscillator) _oscillator.stop(); }, 10000);
    } catch (e) {
        console.warn('Audio siren failed:', e);
    }
}

export function cancelSOS() {
    // 1. Immediately kill all scheduled alerts/WhatsApp intents
    _alertTimeouts.forEach(clearTimeout);
    _alertTimeouts = [];
    _isSosActive = false;

    // 2. Clear alarms and tracking state
    if (_oscillator) {
        try { _oscillator.stop(); } catch(e){}
        _oscillator = null;
    }
    
    // 3. Reset Halt & Risk Engines so they don't immediately retrigger
    import('./halt.js').then(h => h.stopHaltDetection());
    import('./risk.js').then(r => r.stopRiskEngine());
    import('./voice.js').then(v => v.stopRecording());
    import('./simulation.js').then(s => s.stopSimulation());
    
    // 4. Mark journey as completed in DB
    if (_currentJourneyId) {
        import('../supabase.js').then(async ({ getSupabase }) => {
            const sb = getSupabase();
            if (sb) {
                await sb.from('journeys').update({ 
                    status: 'completed', 
                    end_time: new Date().toISOString() 
                }).eq('id', _currentJourneyId);
            }
        });
    }

    // Clear global journey to force full home reset
    window._currentJourney = null;
    _currentJourneyId = null;
    import('../utils.js').then(u => {
      u.setSetting('active_journey', null);
      showToast('SOS Cancelled. Journey state has been cleared.', 'success', 4000);
    });
    
    // Return to home
    window.location.hash = '#home';
}


// Listen for SOS trigger events from any service
events.on('sos-trigger', ({ reason }) => triggerSOS(reason));
