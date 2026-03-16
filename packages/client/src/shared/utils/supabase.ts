// Supabase client singleton
// In production: import { createClient } from '@supabase/supabase-js'
// For now: local-only mode with mock client

export interface SupabaseClient {
  auth: {
    getSession: () => Promise<{ data: { session: { user: { id: string } } | null } }>;
    signInWithOAuth: (options: { provider: string }) => Promise<void>;
    signOut: () => Promise<void>;
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => { data: { subscription: { unsubscribe: () => void } } };
  };
  channel: (name: string) => BroadcastChannel;
  functions: {
    invoke: (name: string, options?: { body?: unknown }) => Promise<{ data: unknown; error: unknown }>;
  };
  from: (table: string) => unknown;
}

interface BroadcastChannel {
  on: (event: string, filter: Record<string, unknown>, callback: (payload: unknown) => void) => BroadcastChannel;
  subscribe: (callback?: (status: string) => void) => BroadcastChannel;
  unsubscribe: () => void;
  send: (payload: { type: string; event: string; payload: unknown }) => Promise<void>;
}

// Local-only mock client
class MockSupabaseClient implements SupabaseClient {
  private channels = new Map<string, MockChannel>();

  auth = {
    getSession: async () => ({ data: { session: null } }),
    signInWithOAuth: async () => {},
    signOut: async () => {},
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  };

  functions = {
    invoke: async (name: string, options?: { body?: unknown }) => {
      console.log(`[Mock] Edge function call: ${name}`, options?.body);
      return { data: { success: true }, error: null };
    },
  };

  channel(name: string): BroadcastChannel {
    if (!this.channels.has(name)) {
      this.channels.set(name, new MockChannel(name));
    }
    return this.channels.get(name)!;
  }

  from(_table: string) {
    console.log(`[Mock] DB query on table: ${_table}`);
    return {};
  }
}

class MockChannel implements BroadcastChannel {
  private listeners = new Map<string, ((payload: unknown) => void)[]>();

  constructor(private name: string) {}

  on(event: string, _filter: Record<string, unknown>, callback: (payload: unknown) => void) {
    const existing = this.listeners.get(event) ?? [];
    existing.push(callback);
    this.listeners.set(event, existing);
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    callback?.('SUBSCRIBED');
    return this;
  }

  unsubscribe() {
    this.listeners.clear();
  }

  async send(payload: { type: string; event: string; payload: unknown }) {
    // In local mode, echo to own listeners
    const listeners = this.listeners.get(payload.event) ?? [];
    for (const listener of listeners) {
      listener(payload.payload);
    }
  }
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    // In production: createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
    client = new MockSupabaseClient();
  }
  return client;
}
