// Edge Function: POST /functions/v1/run-state
// Returns the full current state of a run, including round history and discoveries.

import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

interface RunStateRequest {
  runId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const userId = await getUserId(req);
    const client = getServiceClient();

    const rateLimited = await checkRateLimit(client, userId, 'run-state');
    if (rateLimited) return rateLimited;

    const body: RunStateRequest = await req.json();

    if (!body.runId) {
      return errorResponse('runId is required', 400);
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

    // Load round history (most recent first, limited to last 5 for efficiency)
    const { data: rounds, error: roundsError } = await client
      .from('run_rounds')
      .select('*')
      .eq('run_id', body.runId)
      .order('round_number', { ascending: false })
      .limit(5);

    if (roundsError) {
      console.error('Failed to load rounds:', roundsError.message);
      // Non-fatal: return run without round history
    }

    // Load discoveries for this run
    const { data: discoveries, error: discoveriesError } = await client
      .from('discoveries')
      .select('*')
      .eq('run_id', body.runId)
      .order('round_discovered', { ascending: true });

    if (discoveriesError) {
      console.error('Failed to load discoveries:', discoveriesError.message);
      // Non-fatal: return run without discoveries
    }

    return jsonResponse({
      runId: run.id,
      round: run.round,
      lives: run.lives,
      startingLives: run.starting_lives,
      status: run.status,
      totalWins: run.total_wins,
      totalLosses: run.total_losses,
      consecutiveWins: run.consecutive_wins,
      goalRound: run.goal_round,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      recentRounds: (rounds ?? []).map((r: Record<string, unknown>) => ({
        roundNumber: r.round_number,
        payloadJson: r.payload_json,
        opponentPayloadJson: r.opponent_payload_json,
        duelResult: r.duel_result,
        livesAfter: r.lives_after,
      })),
      discoveries: (discoveries ?? []).map((d: Record<string, unknown>) => ({
        recipeId: d.recipe_id,
        roundDiscovered: d.round_discovered,
      })),
    });
  } catch (err) {
    console.error('run-state error:', err);
    const message = err instanceof Error ? err.message : '';
    const isAuth = message.includes('Authorization') || message.includes('token');
    return errorResponse(isAuth ? 'Unauthorized' : 'Internal server error', isAuth ? 401 : 500);
  }
});
