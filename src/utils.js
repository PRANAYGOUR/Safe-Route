// SafeRoute – Utilities & Shared Helpers

/* ---- TOAST NOTIFICATIONS ---- */
export function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('exit');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 350);
  }, duration);
}

/* ---- SYSTEM NOTIFICATIONS ---- */
export async function sendNotification(title, options = {}) {
  if (!("Notification" in window)) {
    showToast(title, 'info');
    return;
  }

  // Fallback to Service Worker for background notifications
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title: title,
      body: options.body || '',
      data: options.data || {}
    });
  }

  if (Notification.permission === "granted") {
    new Notification(title, { icon: 'icons/icon-192.png', ...options });
  } else if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(title, { icon: 'icons/icon-192.png', ...options });
    } else {
      showToast(title, 'info');
    }
  } else {
    showToast(title, 'info');
  }
}

/* ---- EVENT BUS ---- */
const _listeners = {};

export const events = {
  on(name, fn) {
    if (!_listeners[name]) _listeners[name] = [];
    _listeners[name].push(fn);
  },
  off(name, fn) {
    if (!_listeners[name]) return;
    _listeners[name] = _listeners[name].filter(f => f !== fn);
  },
  emit(name, data) {
    (_listeners[name] || []).forEach(fn => {
      try { fn(data); } catch(e) { console.error(`[events] Error in "${name}" handler:`, e); }
    });
  },
  once(name, fn) {
    const wrapper = (data) => { fn(data); this.off(name, wrapper); };
    this.on(name, wrapper);
  }
};

/* ---- GEOLOCATION HELPERS ---- */
/**
 * Haversine distance between two lat/lng points in meters.
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Speed km/h between two positions.
 * @param {{ lat, lng, time: Date }} p1
 * @param {{ lat, lng, time: Date }} p2
 */
export function calcSpeed(p1, p2) {
  const dist = haversine(p1.lat, p1.lng, p2.lat, p2.lng); // metres
  const dt   = (p2.time - p1.time) / 1000;                // seconds
  if (dt <= 0) return 0;
  return (dist / dt) * 3.6; // km/h
}

/* ---- FORMAT HELPERS ---- */
export function formatETA(seconds) {
  if (!seconds || seconds <= 0) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function formatDistance(metres) {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

export function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ---- DOM HELPERS ---- */
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  children.forEach(c => {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c instanceof Node) e.appendChild(c);
  });
  return e;
}

/* ---- MISC ---- */
export function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

export function isNightTime() {
  const h = new Date().getHours();
  return h >= 21 || h < 6;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---- SETTINGS / PERSISTENCE ---- */
export function getSetting(key, defaultVal) {
  const v = localStorage.getItem(`sr_${key}`);
  if (v === null) return defaultVal;
  try { return JSON.parse(v); } catch(e) { return v; }
}

export function setSetting(key, val) {
  localStorage.setItem(`sr_${key}`, JSON.stringify(val));
}
