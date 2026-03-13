// SafeRoute – AI Risk Scoring Engine
import { events, isNightTime, clamp } from '../utils.js';
import { getRiskLevel, DEVIATION_THRESHOLD_M, GPS_INTERVAL_MS } from '../config.js';
import { haltState, getHaltDurationMs } from './halt.js';

export const riskState = {
  score: 0,
  level: null,
  factors: {},
  alertsIgnored: 0,
  lastSupabaseSync: 0
};

let _journeyId = null;

let _interval  = null;
let _routeCoords = [];  // Array of [lng, lat] from ORS route

export function setRoute(coords) {
  _routeCoords = coords; // [[lng, lat], ...]
}

export function incrementIgnoredAlerts() {
  riskState.alertsIgnored = Math.min(riskState.alertsIgnored + 1, 3);
  recalculate();
}

export function resetIgnoredAlerts() {
  riskState.alertsIgnored = 0;
}

export function startRiskEngine(journeyId = null) {
  _journeyId = journeyId;
  recalculate();
  _interval = setInterval(recalculate, GPS_INTERVAL_MS);
  events.on('gps-update', onGpsForDeviation);
}

export function stopRiskEngine() {
  clearInterval(_interval);
  events.off('gps-update', onGpsForDeviation);
  _journeyId = null;
  riskState.score = 0;
  riskState.alertsIgnored = 0;
  riskState.factors = {};
}

function onGpsForDeviation({ lat, lng }) {
  if (!_routeCoords.length) return;
  const dev = minDistanceToRoute(lat, lng, _routeCoords);
  riskState.factors.deviation = dev > DEVIATION_THRESHOLD_M ? 25 : 0;
  riskState.factors.deviationMetres = Math.round(dev);
}

function recalculate() {
  const f = riskState.factors;

  // 1. Night travel (+20)
  f.night = isNightTime() ? 20 : 0;

  // 2. Route deviation (+25) (updated in onGpsForDeviation)
  if (f.deviation === undefined) f.deviation = 0;

  // 3. Halt duration (+15)
  const haltMs = getHaltDurationMs();
  f.halt = haltMs > 5 * 60 * 1000 ? 15 : 0;

  // 4. Low speed (+10)
  const { gpsState } = window._safeRoute.gps;
  f.speed = (gpsState?.speed < 1 && haltState.isHalted) ? 10 : 0;

  // 5. Alerts ignored (+30)
  f.alerts = riskState.alertsIgnored * 30;

  // 6. Manual/Simulation Boosts
  if (f.manual_boost === undefined) f.manual_boost = 0;

  const raw = (f.night || 0) + (f.deviation || 0) + (f.halt || 0) + (f.speed || 0) + (f.alerts || 0) + (f.manual_boost || 0);
  riskState.score = clamp(raw, 0, 100);
  riskState.level = getRiskLevel(riskState.score);

  events.emit('risk-updated', {

    score: riskState.score,
    level: riskState.level,
    factors: { ...f }
  });

  // Auto-SOS Check
  if (riskState.score > 60 && riskState.alertsIgnored >= 1) {
      events.emit('sos-trigger', { reason: 'high_risk_ignored' });
  }

  // Periodic Supabase Sync for significant risk
  if (_journeyId && riskState.score > 30 && (Date.now() - riskState.lastSupabaseSync > 60000)) {
      riskState.lastSupabaseSync = Date.now();
      logRiskToSupabase();
  }
}

async function logRiskToSupabase() {
    import('../supabase.js').then(async ({ getSupabase }) => {
        const sb = getSupabase();
        if (!sb) return;
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const { gpsState } = window._safeRoute.gps;
        await sb.from('risk_events').insert({
            journey_id: _journeyId,
            user_id: user.id,
            risk_score: riskState.score,
            reason: `Risk score updated: ${riskState.level.label}`,
            factors: riskState.factors,
            latitude: gpsState?.current?.lat,
            longitude: gpsState?.current?.lng
        });
    });
}

/** Minimum Haversine distance (metres) from a point to any segment of route. */
function minDistanceToRoute(lat, lng, coords) {
  if (!coords.length) return 0;
  let minDist = Infinity;
  for (const [cLng, cLat] of coords) {
    const d = haversineSimple(lat, lng, cLat, cLng);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function haversineSimple(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function boostRisk(amount = 20) {
  riskState.factors.manual_boost = (riskState.factors.manual_boost || 0) + amount;
  recalculate();
}

