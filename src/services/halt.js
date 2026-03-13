// SafeRoute – Halt Detection Service
import { events } from '../utils.js';
import { HALT_THRESHOLD_MS, HALT_SPEED_KMH } from '../config.js';

let _haltTimer    = null;
let _haltStart    = null;
let _isHalted     = false;
let _haltDurationMs = 0;

export const haltState = {
  isHalted: false,
  durationMs: 0,
  lastCheckTime: 0
};

let _journeyId = null;

export function startHaltDetection(journeyId = null) {
  _journeyId = journeyId;
  events.on('gps-update', onGpsUpdate);
}

export function stopHaltDetection() {
  events.off('gps-update', onGpsUpdate);
  _journeyId = null;
  haltState.isHalted = false;
  haltState.durationMs = 0;
  _haltStart = null;
  _isHalted = false;
}

function onGpsUpdate() {
  const { gpsState } = window._safeRoute.gps;
  if (!gpsState || gpsState.history.length < 3) return;

  const p1 = gpsState.history[0];
  const p3 = gpsState.history[gpsState.history.length - 1];
  
  const dist = haversineSimple(p1.lat, p1.lng, p3.lat, p3.lng);
  
  if (dist < 10) {
    if (!_isHalted) {
      _isHalted = true;
      _haltStart = Date.now();
      haltState.isHalted = true;
    }
    
    haltState.durationMs = Date.now() - _haltStart;

    // Trigger alert if threshold reached (5 mins)
    if (haltState.durationMs >= 5 * 60 * 1000 && (Date.now() - haltState.lastCheckTime > 30000)) {
        haltState.lastCheckTime = Date.now();
        triggerHaltEvent();
    }
  } else {
    if (_isHalted) {
      _isHalted = false;
      haltState.isHalted = false;
      haltState.durationMs = 0;
      _haltStart = null;
      events.emit('halt-resolved');
    }
  }
}

async function triggerHaltEvent() {
    events.emit('halt-detected', { durationMs: haltState.durationMs });

    if (_journeyId) {
        import('../supabase.js').then(async ({ getSupabase }) => {
            const sb = getSupabase();
            if (!sb) return;
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;
            const { gpsState } = window._safeRoute.gps;
            await sb.from('risk_events').insert({
                journey_id: _journeyId,
                user_id: user.id,
                risk_score: 15, 
                reason: 'Halt detected: User stationary for > 5 mins',
                latitude: gpsState?.current?.lat,
                longitude: gpsState?.current?.lng
            });
        });
    }
}

function haversineSimple(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function getHaltDurationMs() {
  return haltState.durationMs;
}

export function forceHaltDetection(journeyId) {
    if (journeyId) _journeyId = journeyId;
    _isHalted = true;
    _haltStart = Date.now() - (6 * 60 * 1000); // 6 minutes ago
    haltState.isHalted = true;
    haltState.durationMs = Date.now() - _haltStart;
    triggerHaltEvent();
}

export function resolveHalt() {
    _isHalted = false;
    haltState.isHalted = false;
    haltState.durationMs = 0;
    _haltStart = null;
    haltState.lastCheckTime = Date.now();
    events.emit('halt-resolved');
}
