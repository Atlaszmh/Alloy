import type { SupabaseClient } from './supabase.ts';
import { errorResponse } from './cors.ts';

interface RateLimitOptions {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  maxRequests: 30,
  windowSeconds: 60,
};

/**
 * Database-backed rate limiting using the `rate_limits` table.
 * Returns null if within limits, or an error Response (429) if exceeded.
 *
 * Uses the service-role client so RLS is bypassed.
 * This is intentionally database-backed (not in-memory) because Deno Deploy
 * uses separate isolates with no shared state between invocations.
 */
export async function checkRateLimit(
  client: SupabaseClient,
  key: string,
  endpoint: string,
  options: Partial<RateLimitOptions> = {},
): Promise<Response | null> {
  const { maxRequests, windowSeconds } = { ...DEFAULT_OPTIONS, ...options };

  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

  // Count recent requests
  const { count, error: countError } = await client
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .eq('endpoint', endpoint)
    .gte('created_at', windowStart);

  if (countError) {
    // If rate limit check fails, log and allow the request through
    console.error('Rate limit check failed:', countError.message);
    return null;
  }

  if (count !== null && count >= maxRequests) {
    return errorResponse('Too many requests. Please try again later.', 429);
  }

  // Record this request
  const { error: insertError } = await client
    .from('rate_limits')
    .insert({ key, endpoint });

  if (insertError) {
    console.error('Rate limit insert failed:', insertError.message);
  }

  return null;
}
