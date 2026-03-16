// Shared Supabase client for edge functions
// In production, use createClient from @supabase/supabase-js
// For now, this provides the interface that functions expect

export interface SupabaseClient {
  from: (table: string) => QueryBuilder;
  auth: {
    getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  channel: (name: string) => BroadcastChannel;
}

interface QueryBuilder {
  select: (columns?: string) => QueryBuilder;
  insert: (data: Record<string, unknown> | Record<string, unknown>[]) => QueryBuilder;
  update: (data: Record<string, unknown>) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: (resolve: (result: { data: unknown; error: unknown }) => void) => void;
}

interface BroadcastChannel {
  send: (payload: { type: string; event: string; payload: unknown }) => Promise<void>;
}

export function getSupabaseClient(_req: Request): SupabaseClient {
  // In production: createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // This is a placeholder that shows the expected interface
  throw new Error('Supabase client not configured. Set up SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

export function getUserId(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  // In production: verify JWT and extract user ID
  // For local dev: the token IS the user ID
  return authHeader.slice(7);
}
