// SafeRoute – Authentication
import { getSupabase } from './supabase.js';
import { showToast } from './utils.js';

export function getCurrentUser() {
  const sb = getSupabase();
  if (!sb) return null;
  return sb.auth.getUser().then(({ data }) => data?.user || null);
}

export async function signUp(email, password, name) {
  const sb = getSupabase();
  if (!sb) return { error: new Error('Supabase not configured') };
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });
  return { data, error };
}

export async function signIn(email, password) {
  const sb = getSupabase();
  if (!sb) return { error: new Error('Supabase not configured') };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

export function onAuthStateChange(callback) {
  const sb = getSupabase();
  if (!sb) return { data: { subscription: { unsubscribe: () => {} } } };
  return sb.auth.onAuthStateChange(callback);
}
