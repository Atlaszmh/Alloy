// Edge Function: POST /functions/v1/run-create
// Creates a new run for the authenticated user.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

interface RunCreateRequest {
  startingLives?: number;
  goalRound?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const userId = await getUserId(req);
    const client = getServiceClient();

    const rateLimited = await checkRateLimit(client, userId, 'run-create');
    if (rateLimited) return rateLimited;

    const body: RunCreateRequest = await req.json();

    const startingLives = body.startingLives ?? 3;
    const goalRound = body.goalRound ?? 10;

    if (startingLives < 1 || startingLives > 10) {
      return errorResponse('startingLives must be between 1 and 10', 400);
    }
    if (goalRound < 3 || goalRound > 30) {
      return errorResponse('goalRound must be between 3 and 30', 400);
    }

    const { data: run, error: insertError } = await client
      .from('runs')
      .insert({
        player_id: userId,
        lives: startingLives,
        starting_lives: startingLives,
        goal_round: goalRound,
      })
      .select()
      .single();

    if (insertError || !run) {
      console.error('Failed to create run:', insertError?.message ?? 'unknown');
      return errorResponse('Failed to create run', 500);
    }

    return jsonResponse({
      runId: run.id,
      round: run.round,
      lives: run.lives,
      startingLives: run.starting_lives,
      status: run.status,
      goalRound: run.goal_round,
    });
  } catch (err) {
    console.error('run-create error:', err);
    const message = err instanceof Error ? err.message : '';
    const isAuth = message.includes('Authorization') || message.includes('token');
    return errorResponse(isAuth ? 'Unauthorized' : 'Internal server error', isAuth ? 401 : 500);
  }
});
