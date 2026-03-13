// SafeRoute – Escalation Safety System
import { events, sleep } from '../utils.js';
import { MAX_ALERTS, ESCALATION_INTERVAL_S } from '../config.js';
import { incrementIgnoredAlerts } from './risk.js';

let _active   = false;
let _count    = 0;
let _abortCtl = null;

export function startEscalation() {
  if (_active) return;
  _active  = true;
  _count   = 0;
  _abortCtl = new AbortController();
  runEscalationLoop(_abortCtl.signal);
}

export function stopEscalation() {
  _active = false;
  _count  = 0;
  _abortCtl?.abort();
}

async function runEscalationLoop(signal) {
  const QUICK_ALERTS = 2; // For hackathon/real-world speed
  while (_active && _count < QUICK_ALERTS) {
    _count++;
    showAlert(_count, QUICK_ALERTS);

    // Wait for user response or timeout (15s for faster response in hackathon)
    const responded = await waitForResponse(15000, signal);

    if (!_active) break;

    if (!responded) {
      // User ignored → increase risk
      incrementIgnoredAlerts();

      if (_count >= QUICK_ALERTS) {
        // Auto-trigger SOS immediately
        events.emit('sos-trigger', { reason: 'escalation_ignored', alertCount: _count });
        _active = false;
        break;
      }
    } else {
      // User responded safe
      _active = false;
      break;
    }
  }
}

function showAlert(count, maxCount = 5) {
  const modal   = document.getElementById('safety-alert-modal');
  const title   = document.getElementById('alert-title');
  const message  = document.getElementById('alert-message');
  const counter = document.getElementById('alert-counter');

  if (!modal) return;

  title.textContent   = count === 1 ? "Stationary State Detected" : `Final Safety Check`;
  message.textContent = 'Are you safe? A safety alert will be sent to your contacts in 15 seconds if you do not respond.';

  if (count > 0) {
    counter.textContent = `⚠ ${maxCount - count + 1} checks remaining before SOS`;
    counter.classList.remove('hidden');
  } else {
    counter.classList.add('hidden');
  }

  modal.classList.remove('hidden');

  // Vibrate phone
  if (navigator.vibrate) {
    navigator.vibrate([400, 100, 400, 100, 400]);
  }
}

function waitForResponse(ms, signal) {
  return new Promise((resolve) => {
    const safeBtn = document.getElementById('btn-im-safe');
    const helpBtn = document.getElementById('btn-need-help');
    let resolved  = false;

    const done = (safe) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      hideAlert();
      if (!safe) {
        events.emit('sos-trigger', { reason: 'user-requested' });
        stopEscalation();
      }
      resolve(true);
    };

    const cleanup = () => {
      safeBtn?.removeEventListener('click', onSafe);
      helpBtn?.removeEventListener('click', onHelp);
      signal.removeEventListener('abort', onAbort);
    };

    const onSafe  = () => done(true);
    const onHelp  = () => done(false);
    const onAbort = () => { cleanup(); hideAlert(); resolve(false); };

    safeBtn?.addEventListener('click', onSafe);
    helpBtn?.addEventListener('click', onHelp);
    signal.addEventListener('abort', onAbort);

    setTimeout(() => {
      if (!resolved) { resolved = true; cleanup(); hideAlert(); resolve(false); }
    }, ms);
  });
}

function hideAlert() {
  const modal = document.getElementById('safety-alert-modal');
  modal?.classList.add('hidden');
}

// Listen for halt event to start escalation
events.on('halt-detected', () => startEscalation());
events.on('halt-resolved', () => stopEscalation());
