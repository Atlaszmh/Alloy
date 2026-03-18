// DEPRECATED: AI matches run entirely client-side and do not need a server endpoint.
// This function is kept as a placeholder. Remove the folder when cleaning up.

import { corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();
  return errorResponse('ai-match-create is deprecated. AI matches run client-side.', 410);
});
