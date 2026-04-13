// Edge Function: POST /functions/v1/run-submit-payload
// Submits a forged loadout for async matchmaking.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

interface RunSubmitPayloadRequest {
  runId: string;
  payload: Record<string, unknown>;
}

/**
 * Compute a simple power bracket from the payload.
 * This buckets payloads into coarse tiers for matchmaking so that
 * players face opponents of similar strength.
 */
function computePowerBracket(payload: Record<string, unknown>): number {
  // Sum up total affixes across all items as a rough proxy for power.
  // A more sophisticated formula can replace this later.
  let totalAffixes = 0;
  const items = payload.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item && typeof item === 'object' && Array.isArray((item as Record<string, unknown>).affixes)) {
        totalAffixes += ((item as Record<string, unknown>).affixes as unknown[]).length;
      }
    }
  }
  // Bracket: 0-3 affixes = 0, 4-7 = 1, 8-11 = 2, 12+ = 3
  return Math.min(3, Math.floor(totalAffixes / 4));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const userId = await getUserId(req);
    const client = getServiceClient();

    const rateLimited = await checkRateLimit(client, userId, 'run-submit-payload');
    if (rateLimited) return rateLimited;

    const body: RunSubmitPayloadRequest = await req.json();

    if (!body.runId || !body.payload) {
      return errorResponse('runId and payload are required', 400);
    }

    // Load the run and verify ownership
    const { data: run, error: runError } = await client
      .from('runs')
      .select('*')
      .eq('id', body.runId)
      .eq('player_id', userId)
      .single();

    if (runError || !run) {
      return errorResponse('Run not found or not owned by user', 404);
    }

    if (run.status !== 'active') {
      return errorResponse('Run is no longer active', 400);
    }

    const powerBracket = computePowerBracket(body.payload);

    // Insert into payload_queue for matchmaking
    const { error: queueError } = await client
      .from('payload_queue')
      .insert({
        run_id: body.runId,
        player_id: userId,
        payload_json: body.payload,
        run_round: run.round,
        power_bracket: powerBracket,
      });

    if (queueError) {
      console.error('Failed to insert payload queue:', queueError.message);
      return errorResponse('Failed to submit payload', 500);
    }

    // Insert into run_rounds to record this round's payload
    const { error: roundError } = await client
      .from('run_rounds')
      .insert({
        run_id: body.runId,
        round_number: run.round,
        payload_json: body.payload,
        lives_after: run.lives,
      });

    if (roundError) {
      // Duplicate round_number means they already submitted for this round
      if (roundError.code === '23505') {
        return errorResponse('Payload already submitted for this round', 409);
      }
      console.error('Failed to insert run_round:', roundError.message);
      return errorResponse('Failed to record round', 500);
    }

    return jsonResponse({
      submitted: true,
      runId: body.runId,
      round: run.round,
      powerBracket,
    });
  } catch (err) {
    console.error('run-submit-payload error:', err);
    const message = err instanceof Error ? err.message : '';
    const isAuth = message.includes('Authorization') || message.includes('token');
    return errorResponse(isAuth ? 'Unauthorized' : 'Internal server error', isAuth ? 401 : 500);
  }
});
