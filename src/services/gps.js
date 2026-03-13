// SafeRoute – GPS Service
import { events, calcSpeed } from '../utils.js';
import { GPS_INTERVAL_MS } from '../config.js';

let watchId  = null;
let lastPos  = null;
let _interval= null;

export const gpsState = {
  current: null,   // { lat, lng, accuracy, time }
  speed: 0,        // km/h
  active: false,
  ready: false,
  isRequesting: false,
  journeyId: null,
  history: [] // Last 3 points for halt detection
};

// Check if we are in a secure context (required for Geolocation)
const isSecureContext = window.isSecureContext || window.location.hostname === 'localhost';

export async function requestLocationAccess() {
  if (gpsState.isRequesting) return false;
  
  if (!navigator.geolocation) {
    console.warn('[GPS] Geolocation not supported');
    return false;
  }

  if (!isSecureContext) {
    console.warn('[GPS] Running in insecure context. Geolocation might be blocked by the browser.');
  }

  gpsState.isRequesting = true;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        gpsState.current = { 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude, 
          accuracy: pos.coords.accuracy, 
          time: new Date() 
        };
        gpsState.ready = true;
        gpsState.isRequesting = false;
        resolve(true);
      },
      (err) => {
        console.warn('[GPS] Access denied:', err.message);
        gpsState.isRequesting = false;
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export function startGPS(id = null) {
  if (!navigator.geolocation) {
    console.warn('[GPS] Geolocation not supported');
    return;
  }

  gpsState.active = true;
  gpsState.journeyId = id;
  gpsState.history = [];

  const onSuccess = async (pos) => {
    const newPos = {
      lat:      pos.coords.latitude,
      lng:      pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      time:     new Date()
    };

    if (lastPos) {
      gpsState.speed = calcSpeed(lastPos, newPos);
    }

    lastPos        = newPos;
    gpsState.current = newPos;

    // Buffer for halt detection (last 3 points)
    gpsState.history.push({ ...newPos });
    if (gpsState.history.length > 3) gpsState.history.shift();

    events.emit('gps-update', { ...newPos, speed: gpsState.speed });
  };

  const onError = (err) => {
    console.warn('[GPS] Error:', err.message);
    events.emit('gps-error', err);
  };

  watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });

  // Automated Supabase Logging & Internal Tick
  _interval = setInterval(async () => {
    if (gpsState.current) {
        // 1. Emit tick for UI
        events.emit('gps-tick', { ...gpsState.current, speed: gpsState.speed });

        // 2. Persist to Supabase if journey is active
        if (gpsState.journeyId) {
            import('../supabase.js').then(async ({ getSupabase }) => {
                const sb = getSupabase();
                if (!sb) return;

                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;

                await sb.from('journey_locations').insert({
                    journey_id: gpsState.journeyId,
                    user_id: user.id,
                    latitude: gpsState.current.lat,
                    longitude: gpsState.current.lng,
                    speed: gpsState.speed,
                    accuracy: gpsState.current.accuracy,
                    risk_score: window._safeRoute?.risk?.riskState?.score || 0
                });
            });
        }
    }
  }, GPS_INTERVAL_MS);
}

export function stopGPS() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  clearInterval(_interval);
  gpsState.active  = false;
  gpsState.current = null;
  gpsState.speed   = 0;
  lastPos          = null;
}

export function injectSimulatedPosition(lat, lng, speed = 5) {
  const pos = { lat, lng, accuracy: 10, time: new Date() };
  gpsState.current = pos;
  gpsState.speed   = speed;
  events.emit('gps-update', { ...pos, speed });
  events.emit('gps-tick',   { ...pos, speed });
}
