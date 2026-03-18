import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type { SupabaseClient };

let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  serviceClient = createClient(url, key);
  return serviceClient;
}

export async function getUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  const token = authHeader.replace('Bearer ', '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  const anonClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) throw new Error('Invalid or expired token');
  return user.id;
}

export async function loadMatchByRoomCode(client: SupabaseClient, roomCode: string) {
  const { data, error } = await client
    .from('matches')
    .select('*')
    .eq('room_code', roomCode)
    .single();
  if (error || !data) throw new Error(`Match not found: ${roomCode}`);
  return data;
}
