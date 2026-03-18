// DEPRECATED: Elo updates now happen inside the forge-submit Edge Function.
// This function is kept as a placeholder. Returns 410 Gone.

import { corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();
  return errorResponse('match-complete is deprecated. Elo updates happen in forge-submit.', 410);
});
