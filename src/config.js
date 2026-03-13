// SafeRoute – Configuration
// Reads API keys and URLs from Vite environment variables

export const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL     || '';
export const SUPABASE_ANON_KEY= import.meta.env.VITE_SUPABASE_ANON_KEY|| '';
export const GROQ_API_KEY     = import.meta.env.VITE_GROQ_API_KEY     || '';
export const ORS_API_KEY      = import.meta.env.VITE_ORS_API_KEY      || '';

export const GROQ_MODEL = 'llama3-8b-8192';

export const ORS_BASE  = 'https://api.openrouteservice.org';
export const OVERPASS  = 'https://overpass-api.de/api/interpreter';

/** Halt detection before alert fires (ms) — 5 minutes */
export const HALT_THRESHOLD_MS = 5 * 60 * 1000;

/** GPS update interval (ms) — 15 seconds */
export const GPS_INTERVAL_MS = 15 * 1000;

/** Escalation alert count before auto SOS */
export const MAX_ALERTS = 5;

/** Seconds between escalation alerts */
export const ESCALATION_INTERVAL_S = 30;

/** Route deviation threshold (meters) */
export const DEVIATION_THRESHOLD_M = 80;

/** Minimum speed below which halt is considered (km/h) */
export const HALT_SPEED_KMH = 0.5;

/** Halt distance threshold for 3-point logic (meters) */
export const HALT_DISTANCE_THRESHOLD_M = 10;

/** Risk tier thresholds */
export const RISK_LEVELS = {
  SAFE:   { max: 30,  label: 'Safe',        cls: 'risk-safe'   },
  MEDIUM: { max: 60,  label: 'Medium Risk', cls: 'risk-medium' },
  HIGH:   { max: 100, label: 'High Risk',   cls: 'risk-high'   }
};

export function getRiskLevel(score) {
  if (score <= 30) return RISK_LEVELS.SAFE;
  if (score <= 60) return RISK_LEVELS.MEDIUM;
  return RISK_LEVELS.HIGH;
}
