// Edge Function: POST /functions/v1/matchmaking
// Handles queue join/leave. Actual pairing is done by pg_cron.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';

interface MatchmakingRequest {
  action: 'join' | 'leave';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const body: MatchmakingRequest = await req.json();

    if (!body.action || !['join', 'leave'].includes(body.action)) {
      return errorResponse('Invalid action. Must be join or leave.', 400);
    }

    const client = getServiceClient();

    if (body.action === 'leave') {
      await client
        .from('matchmaking_queue')
        .delete()
        .eq('player_id', userId);

      return jsonResponse({ status: 'left_queue' });
    }

    // action === 'join'

    // Check for duplicate queue entries
    const { data: existing } = await client
      .from('matchmaking_queue')
      .select('id')
      .eq('player_id', userId)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ status: 'already_queued' });
    }

    // Load profile for Elo
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('elo')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return errorResponse('Profile not found', 404);
    }

    // Insert into matchmaking queue
    const { error: insertError } = await client
      .from('matchmaking_queue')
      .insert({
        player_id: userId,
        elo: profile.elo,
      });

    if (insertError) {
      return errorResponse(`Failed to join queue: ${insertError.message}`, 500);
    }

    return jsonResponse({ status: 'queued' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message.includes('Unauthorized') || message.includes('token') ? 401 : 500;
    return errorResponse(message, status);
  }
});
