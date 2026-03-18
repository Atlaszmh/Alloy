import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[Supabase] No VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — running in offline mode');
    return null;
  }
  client = createClient(url, key);
  return client;
}

export function isOnline(): boolean {
  return getSupabase() !== null;
}
