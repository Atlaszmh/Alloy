# State of the Game Remediation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical, important, and high-priority issues identified in the April 2026 "State of the Game" review — spanning failing tests, security holes, dead engine systems, client rendering duplication, and code hygiene.

**Architecture:** Work proceeds in 8 chunks ordered by priority: (1) quick housekeeping fixes, (2) failing test fixes, (3) security hardening, (4) engine core systems activation, (5) duel renderer consolidation, (6) client misc fixes, (7) test gap coverage, (8) code hygiene. Each chunk produces a working, committable state.

**Tech Stack:** TypeScript 5.7+, Vitest 3.x, Playwright, React 19, Zustand 5, PixiJS 8, Supabase (PostgreSQL + Deno Edge Functions), pnpm monorepo.

---

## Chunk 1: Quick Fixes & Housekeeping

### Task 1: Fix .gitignore — add dist-types/ and screenshots/

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add missing entries to .gitignore**

Append these lines to `.gitignore`:

```
# Engine type declaration output
dist-types/

# Screenshots (local test artifacts)
packages/screenshots/
```

- [ ] **Step 2: Verify dist-types/ is no longer shown in git status**

Run: `git status --short | grep dist-types`
Expected: No output (dist-types/ is now ignored)

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore dist-types/ and screenshots/"
```

---

### Task 2: Fix matchmaking queue insert — add missing rank_tier

**Files:**
- Modify: `packages/supabase/functions/matchmaking/index.ts:58-63`

The `matchmaking_queue` table has `rank_tier TEXT NOT NULL` (migration 003, line 30), but the insert omits it. Every queue insert fails with a NOT NULL constraint violation, making ranked matchmaking completely broken.

- [ ] **Step 1: Read the current insert code**

Read: `packages/supabase/functions/matchmaking/index.ts`

- [ ] **Step 2: Add rank_tier to the queue insert**

The profile is already loaded at line 47-51. The select currently only fetches `elo` — update it to also fetch `rank_tier`:

```typescript
// Update the profile select (around line 49):
const { data: profile } = await client
  .from('profiles')
  .select('elo, rank_tier')
  .eq('id', userId)
  .single();
```

Then include `rank_tier` in the insert:

```typescript
const { error: insertError } = await client
  .from('matchmaking_queue')
  .insert({
    player_id: userId,
    elo: profile.elo,
    rank_tier: profile.rank_tier,
  });
```

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/matchmaking/index.ts
git commit -m "fix: include rank_tier in matchmaking queue insert"
```

---

### Task 3: Delete deprecated ai-match-create edge function

**Files:**
- Delete: `packages/supabase/functions/ai-match-create/` (entire directory)

This function returns 410 Gone and has a comment "Remove the folder when cleaning up."

- [ ] **Step 1: Delete the directory**

```bash
rm -rf packages/supabase/functions/ai-match-create
```

- [ ] **Step 2: Verify no references to ai-match-create remain**

Run: `grep -r "ai-match-create" packages/ --include="*.ts" --include="*.tsx"`
Expected: No matches (or only documentation references)

- [ ] **Step 3: Commit**

```bash
git add -A packages/supabase/functions/ai-match-create
git commit -m "chore: remove deprecated ai-match-create edge function"
```

---

### Task 4: Add HTTP method validation to edge functions

**Files:**
- Modify: `packages/supabase/functions/match-create/index.ts`
- Modify: `packages/supabase/functions/match-join/index.ts`
- Modify: `packages/supabase/functions/draft-pick/index.ts`
- Modify: `packages/supabase/functions/forge-submit/index.ts`
- Modify: `packages/supabase/functions/matchmaking/index.ts`
- Modify: `packages/supabase/functions/forfeit/index.ts`
- Modify: `packages/supabase/functions/match-state/index.ts`

Currently only `match-complete` validates the HTTP method. All others (including `match-join`) accept any method.

- [ ] **Step 1: Read each function's entry point to understand the pattern**

Read each file's first 20 lines to see how they handle the request.

- [ ] **Step 2: Add method validation after the OPTIONS/CORS check**

In each function, after the existing `if (req.method === 'OPTIONS')` block, add:

```typescript
if (req.method !== 'POST') {
  return errorResponse('Method not allowed', 405);
}
```

For `match-state` (which is a GET endpoint), use:
```typescript
if (req.method !== 'GET') {
  return errorResponse('Method not allowed', 405);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/*/index.ts
git commit -m "fix: add HTTP method validation to all edge functions"
```

---

### Task 5: Sanitize error messages in edge functions

**Files:**
- Modify: `packages/supabase/functions/match-create/index.ts`
- Modify: `packages/supabase/functions/matchmaking/index.ts`
- Modify: Any other function that returns `error.message` to the client

Error messages currently leak Supabase internals (table names, constraints).

- [ ] **Step 1: Grep for error message patterns**

Run: `grep -rn 'error\.message\|insertError\.message\|updateError\.message' packages/supabase/functions/ --include="*.ts"`

- [ ] **Step 2: Replace leaked error details with generic messages**

For each match, replace the response with a generic message and add a `console.error` for server-side logging:

```typescript
// Before:
return errorResponse(`Failed to create match: ${insertError?.message ?? 'unknown'}`);

// After:
console.error('match-create insert failed:', insertError);
return errorResponse('Failed to create match', 500);
```

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/*/index.ts
git commit -m "fix: sanitize error messages in edge functions"
```

---

## Chunk 2: Fix Failing Engine Tests

### Task 6: Update stat-calculator test expectations to match current data

**Files:**
- Modify: `packages/engine/tests/stat-calculator.test.ts:236-328`

Four tests have hardcoded expected values from pre-rebalance data. The data was rebalanced but the test expectations were not updated. Current actual values from `affixes.json` and `base-items.json`:

| Item/Affix | Old Value | Current Value |
|-----------|-----------|--------------|
| axe.physicalDamage | 60 | 15 |
| sword.physicalDamage | 40 | 10 |
| staff.allElementalDamage | 10 | 3 |
| flat_physical T1 weaponEffect | +15 | +4 |
| flat_physical T2 weaponEffect | +23 | +6 |
| fire_damage T1 weaponEffect | +12 | +3 |
| fire_damage T2 weaponEffect | +19 | +5 |

- [ ] **Step 1: Read the current test file and data files to confirm values**

Read: `packages/engine/tests/stat-calculator.test.ts` (lines 236-340)
Read: `packages/engine/src/data/affixes.json` (grep for flat_physical, fire_damage tier values)
Read: `packages/engine/src/data/base-items.json` (grep for sword, axe, staff)

- [ ] **Step 2: Fix Test 9 — "applies flat modifiers before percent modifiers" (line 236-245)**

```typescript
// physicalDamage: 15 (axe base) + 4 (flat_physical T1 flat) = 19
expect(stats.physicalDamage).toBe(19);
```

- [ ] **Step 3: Fix Test 11a — "multiple affixes stack correctly" (line 284-293)**

```typescript
// fire_damage T1 weaponEffect: elementalDamage.fire +3 flat
// fire_damage T2 weaponEffect: elementalDamage.fire +5 flat
// Total: 3 + 5 = 8
expect(stats.elementalDamage.fire).toBe(8);
```

- [ ] **Step 4: Fix Test 11b — "multiple flat_physical affixes stack on weapon" (line 296-306)**

```typescript
// flat_physical T1: physicalDamage +4 flat
// flat_physical T2: physicalDamage +6 flat
// Sword base: 10
// Total: 10 + 4 + 6 = 20
expect(stats.physicalDamage).toBe(20);
```

- [ ] **Step 5: Fix staff test — "staff allElementalDamage bonus expands to all elements" (line 317-328)**

```typescript
// fire: 3 (staff allElementalDamage) + 3 (fire_damage T1) = 6 flat, no percent
expect(stats.elementalDamage.fire).toBe(6);
// other elements: 3 flat from allElementalDamage
expect(stats.elementalDamage.cold).toBe(3);
```

- [ ] **Step 6: Run all engine tests to verify**

Run: `pnpm --filter @alloy/engine test`
Expected: All tests pass (0 failures)

- [ ] **Step 7: Commit**

```bash
git add packages/engine/tests/stat-calculator.test.ts
git commit -m "fix: update stat-calculator test expectations for rebalanced data"
```

---

## Chunk 3: Security Hardening

### Task 7: Enable RLS on unprotected tables

**Files:**
- Create: `packages/supabase/migrations/008_rls_reporting.sql`

Seven tables have no RLS enabled: `game_configs`, `simulation_runs`, `match_results`, `match_player_stats`, `match_round_details` (migration 007), `seasons` (migration 002), and `join_attempts` (migration 006). Any authenticated user can read/write these via PostgREST.

- [ ] **Step 1: Write the migration**

```sql
-- Enable RLS on reporting/analytics tables (migration 007)
ALTER TABLE game_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_round_details ENABLE ROW LEVEL SECURITY;

-- Enable RLS on previously missed tables
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_attempts ENABLE ROW LEVEL SECURITY;

-- Reporting tables: service role only (edge functions use service role client)
-- No anon/authenticated policies = deny all direct access

-- Seasons: read-only for all authenticated users
CREATE POLICY "seasons_read" ON seasons
  FOR SELECT TO authenticated
  USING (true);

-- Join attempts: users can only see their own
CREATE POLICY "join_attempts_own" ON join_attempts
  FOR SELECT TO authenticated
  USING (auth.uid() = player_id);

CREATE POLICY "join_attempts_insert_own" ON join_attempts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);
```

- [ ] **Step 2: Commit**

```bash
git add packages/supabase/migrations/008_rls_reporting.sql
git commit -m "fix: enable RLS on 7 unprotected tables"
```

---

### Task 8: Add authentication to match-complete

**Files:**
- Modify: `packages/supabase/functions/match-complete/index.ts`

Currently uses a local `tryGetUserId()` function (defined at lines 11-32 of `match-complete/index.ts` — NOT in `_shared/supabase.ts`) which returns `null` instead of throwing on auth failure. Any unauthenticated client can POST fabricated match results.

**Important context:** The comment on `tryGetUserId` says "Returns null rather than throwing so live matches without auth still work." Investigate whether local/AI match results are submitted via this endpoint. If so, the fix should require auth for PvP results only, or the client should be updated to include auth headers for all submissions.

- [ ] **Step 1: Read the current implementation and understand the auth flow**

Read: `packages/supabase/functions/match-complete/index.ts`
Determine: Is this endpoint called for local/AI matches? If so, those calls need auth headers too.

- [ ] **Step 2: Replace local tryGetUserId with imported getUserId**

Delete the local `tryGetUserId` function (lines 11-32) and import `getUserId` from `_shared/supabase.ts`:

```typescript
import { getServiceClient, getUserId } from '../_shared/supabase.ts';

// In the handler:
const userId = await getUserId(req);
```

- [ ] **Step 3: Update the client to include auth headers when submitting results**

If the client calls this endpoint for local/AI matches without auth, update those calls to include the auth token.

- [ ] **Step 4: Commit**

```bash
git add packages/supabase/functions/match-complete/index.ts
git commit -m "fix: require authentication for match-complete endpoint"
```

---

### Task 9: Validate loadout in forge-submit

**Files:**
- Modify: `packages/supabase/functions/forge-submit/index.ts`
- Possibly create: `packages/engine/src/forge/loadout-validator.ts`

This is the most exploitable security hole: `forge-submit` accepts a raw client-provided loadout and writes it directly to game state without validation. A cheating client can send fabricated orbs.

- [ ] **Step 1: Read the current forge-submit flow**

Read: `packages/supabase/functions/forge-submit/index.ts` (full file)
Read: `packages/engine/src/types/item.ts` (Loadout type)

- [ ] **Step 2: Design the validation approach**

The server must validate that every orb in the submitted loadout:
1. Exists in the player's stockpile (from draft phase)
2. Has a valid affixId that exists in the data registry
3. Has a tier that is achievable (not exceeding max tier or tier beyond what upgrades allow)
4. Is not used more than once across all slots
5. Combinations reference valid component affixes that are present

- [ ] **Step 3: Write failing tests for loadout validation**

Create: `packages/engine/tests/loadout-validator.test.ts`

Test cases:
- Valid loadout passes
- Loadout with unknown affixId fails
- Loadout with duplicate orb UIDs fails
- Loadout with orb not in stockpile fails
- Empty loadout passes (player chose not to equip)

- [ ] **Step 4: Implement the validator in the engine**

Create: `packages/engine/src/forge/loadout-validator.ts`

```typescript
export function validateLoadout(
  loadout: Loadout,
  stockpile: OrbInstance[],
  registry: DataRegistry,
): { valid: boolean; error?: string }
```

- [ ] **Step 5: Run tests to verify**

Run: `pnpm --filter @alloy/engine test`
Expected: All pass

- [ ] **Step 6: Wire the validator into forge-submit**

In `forge-submit/index.ts`, after parsing the loadout from the request body, call the validator before writing to game state:

```typescript
const validation = validateLoadout(loadout, gameState.players[playerIndex].stockpile, registry);
if (!validation.valid) {
  return errorResponse(`Invalid loadout: ${validation.error}`, 400);
}
```

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/forge/loadout-validator.ts packages/engine/tests/loadout-validator.test.ts packages/supabase/functions/forge-submit/index.ts
git commit -m "fix: validate loadout server-side in forge-submit"
```

---

### Task 10: Make Elo updates atomic

**Files:**
- Modify: `packages/supabase/functions/forge-submit/index.ts:188-239`
- Create: `packages/supabase/migrations/009_atomic_elo.sql`

The current read-compute-write Elo pattern has a race condition. Use an incremental SQL update instead.

**Context:** The Elo update logic lives in `forge-submit` (not a dedicated match-complete function) because `forge-submit` doubles as the match-completion endpoint for PvP: when both players submit their loadouts, it runs the duel simulation and updates Elo. This is architecturally surprising — the agent should not look for Elo logic elsewhere.

- [ ] **Step 1: Create a PostgreSQL function for atomic Elo updates**

Create migration `009_atomic_elo.sql`:

```sql
CREATE OR REPLACE FUNCTION update_elo(
  p_player_id UUID,
  p_elo_delta INT,
  p_won BOOLEAN
) RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET
    elo = GREATEST(0, elo + p_elo_delta),
    matches_played = matches_played + 1,
    matches_won = matches_won + CASE WHEN p_won THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Update forge-submit to use RPC instead of read-then-write**

Replace the profile read + update block with:

```typescript
await client.rpc('update_elo', {
  p_player_id: player1Id,
  p_elo_delta: p1Delta,
  p_won: winner === 0,
});
await client.rpc('update_elo', {
  p_player_id: player2Id,
  p_elo_delta: p2Delta,
  p_won: winner === 1,
});
```

The Elo calculation (`calculateEloDelta`) can still happen in the edge function — it just reads the current Elo from the match's game state (which is already loaded) rather than re-fetching profiles.

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/migrations/009_atomic_elo.sql packages/supabase/functions/forge-submit/index.ts
git commit -m "fix: atomic Elo updates via PostgreSQL function"
```

---

### Task 11: Add rate limiting infrastructure

**Files:**
- Modify: `packages/supabase/functions/_shared/supabase.ts`
- Modify: All edge functions that lack rate limiting

Currently only `match-join` has rate limiting. All other endpoints are unprotected.

- [ ] **Step 1: Create a shared database-backed rate limiter**

**Important:** Supabase Edge Functions run on Deno Deploy where each request may hit a different isolate. An in-memory `Map` provides no meaningful rate limiting in production. Follow the existing `match-join` pattern which uses the `join_attempts` database table.

Create `_shared/rate-limit.ts`:

```typescript
import { getServiceClient } from './supabase.ts';

export async function checkRateLimit(
  userId: string,
  action: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  const client = getServiceClient();
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const { count } = await client
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= maxRequests) return false;

  await client.from('rate_limits').insert({ user_id: userId, action });
  return true;
}
```

Also add a migration for the `rate_limits` table (can be included in the RLS migration or separate):

```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rate_limits_lookup ON rate_limits (user_id, action, created_at);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- Cleanup: delete entries older than 5 minutes periodically
```

- [ ] **Step 2: Apply rate limiting to each function**

Use user ID (from `getUserId()`) as the rate limit key. Suggested limits:

| Function | Limit | Window |
|----------|-------|--------|
| match-create | 5 | 1 min |
| draft-pick | 30 | 1 min |
| forge-submit | 10 | 1 min |
| match-complete | 10 | 1 min |
| matchmaking | 10 | 1 min |
| forfeit | 5 | 1 min |
| match-state | 60 | 1 min |

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/
git commit -m "feat: add rate limiting to all edge functions"
```

---

### Task 12: Restrict CORS to known origins

**Files:**
- Modify: `packages/supabase/functions/_shared/cors.ts`

Currently `Access-Control-Allow-Origin: *`. In production this enables CSRF-like attacks.

- [ ] **Step 1: Update CORS helper to use environment variable**

```typescript
const ALLOWED_ORIGIN = Deno.env.get('CORS_ORIGIN') ?? '*';

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

This keeps `*` for local development but allows production to set `CORS_ORIGIN=https://your-domain.com`.

- [ ] **Step 2: Commit**

```bash
git add packages/supabase/functions/_shared/cors.ts
git commit -m "fix: restrict CORS origin via environment variable"
```

---

## Chunk 4: Engine — Activate Triggers, Compounds, and Synergies

This is the largest chunk. It activates three dormant gameplay systems that are architecturally ready but never fire. The duel engine already has `fireTriggers`, `evaluateTrigger`, and `applyTriggerEffect` infrastructure. The stat calculator already processes affixes. The missing pieces are: (a) `extractTriggers()` returning real data, (b) compound effect handling in the duel engine, and (c) synergy effect handling in the duel engine.

### Task 13: Implement extractTriggers() — make trigger affixes functional

**Files:**
- Modify: `packages/engine/src/duel/trigger-system.ts:11-15`
- Modify: `packages/engine/src/types/combat.ts` (if TriggerEffect needs new fields)
- Test: `packages/engine/tests/trigger-system.test.ts` (create)

The 6 trigger-category affixes (`chance_on_hit`, `chance_on_taking_damage`, `chance_on_crit`, `chance_on_block`, `chance_on_kill`, `chance_on_low_hp`) each have `procDamage` or `procHeal` stat keys with `valueRange` fields. The mapping is:

| Affix ID | Condition | Weapon Effect | Armor Effect |
|----------|-----------|--------------|-------------|
| chance_on_hit | on_hit | bonus_damage (procDamage) | bonus_damage (procDamage) |
| chance_on_taking_damage | on_taking_damage | heal (procHeal) | heal (procHeal) |
| chance_on_crit | on_crit | bonus_damage (procDamage) | bonus_damage (procDamage) |
| chance_on_block | on_block | bonus_damage (procDamage) | heal (procHeal) |
| chance_on_kill | on_kill | heal (procHeal) | heal (procHeal) |
| chance_on_low_hp | on_low_hp | heal (procHeal) | heal (procHeal) |

The `valueRange` field on each tier represents `[chance_percent, cooldown_ticks]` — but verify this by reading the data carefully. The `value` on the stat modifier is the effect magnitude.

- [ ] **Step 1: Write failing tests for extractTriggers**

Create `packages/engine/tests/trigger-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractTriggers } from '../src/duel/trigger-system.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { createEmptyLoadout } from '../src/types/item.js';

const data = loadAndValidateData();
const registry = new DataRegistry(data);

describe('extractTriggers', () => {
  it('returns empty array for loadout with no trigger affixes', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = {
      uid: 'test-1',
      affixId: 'flat_physical',
      tier: 1,
      locked: false,
    };
    const triggers = extractTriggers(loadout, registry);
    expect(triggers).toEqual([]);
  });

  it('extracts trigger from chance_on_hit affix on weapon', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.weapon.slots[0] = {
      uid: 'trigger-1',
      affixId: 'chance_on_hit',
      tier: 1,
      locked: false,
    };
    const triggers = extractTriggers(loadout, registry);
    expect(triggers.length).toBe(1);
    expect(triggers[0].condition).toBe('on_hit');
    expect(triggers[0].affixId).toBe('chance_on_hit');
    expect(triggers[0].chance).toBeGreaterThan(0);
    expect(triggers[0].chance).toBeLessThanOrEqual(1);
    expect(triggers[0].effect.kind).toBe('bonus_damage');
  });

  it('extracts trigger from chance_on_taking_damage on armor', () => {
    const loadout = createEmptyLoadout('sword', 'chainmail');
    loadout.armor.slots[0] = {
      uid: 'trigger-2',
      affixId: 'chance_on_taking_damage',
      tier: 1,
      locked: false,
    };
    const triggers = extractTriggers(loadout, registry);
    expect(triggers.length).toBe(1);
    expect(triggers[0].condition).toBe('on_taking_damage');
    expect(triggers[0].effect.kind).toBe('heal');
  });

  it('higher tier increases effect magnitude', () => {
    const loadout1 = createEmptyLoadout('sword', 'chainmail');
    loadout1.weapon.slots[0] = { uid: 't1', affixId: 'chance_on_hit', tier: 1, locked: false };
    const loadout2 = createEmptyLoadout('sword', 'chainmail');
    loadout2.weapon.slots[0] = { uid: 't2', affixId: 'chance_on_hit', tier: 2, locked: false };

    const t1 = extractTriggers(loadout1, registry);
    const t2 = extractTriggers(loadout2, registry);

    // T2 should have higher proc damage than T1
    expect((t2[0].effect as any).value).toBeGreaterThan((t1[0].effect as any).value);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @alloy/engine test -- trigger-system`
Expected: FAIL — extractTriggers returns empty array

- [ ] **Step 3: Implement extractTriggers**

In `packages/engine/src/duel/trigger-system.ts`, replace the stub:

```typescript
const CONDITION_MAP: Record<string, TriggerCondition> = {
  chance_on_hit: 'on_hit',
  chance_on_taking_damage: 'on_taking_damage',
  chance_on_crit: 'on_crit',
  chance_on_block: 'on_block',
  chance_on_kill: 'on_kill',
  chance_on_low_hp: 'on_low_hp',
};

function buildTriggerEffect(statKey: string, value: number): TriggerEffect | null {
  if (statKey === 'procDamage') return { kind: 'bonus_damage', value };
  if (statKey === 'procHeal') return { kind: 'heal', value };
  return null;
}

export function extractTriggers(loadout: Loadout, registry: DataRegistry): TriggerDef[] {
  const triggers: TriggerDef[] = [];

  for (const target of [loadout.weapon, loadout.armor] as const) {
    const isWeapon = target === loadout.weapon;
    for (const slot of target.slots) {
      if (!slot) continue;
      const affix = registry.getAffix(slot.affixId);
      if (!affix || affix.category !== 'trigger') continue;

      const condition = CONDITION_MAP[affix.id];
      if (!condition) continue;

      const tierData = affix.tiers[slot.tier];
      if (!tierData) continue;

      const effects = isWeapon ? tierData.weaponEffect : tierData.armorEffect;
      for (const mod of effects) {
        const effect = buildTriggerEffect(mod.stat, mod.value);
        if (!effect) continue;

        const [chancePct, cooldown] = tierData.valueRange ?? [20, 0];
        triggers.push({
          affixId: affix.id,
          condition,
          chance: chancePct / 100,
          cooldown,
          effect,
        });
      }
    }
  }

  return triggers;
}
```

**Note:** The `valueRange` interpretation as `[chance_percent, cooldown]` is an assumption based on the data shape. Verify by reading the balance design doc or inspecting `valueRange` values across tiers. If `valueRange` means something else, adjust accordingly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @alloy/engine test -- trigger-system`
Expected: All pass

- [ ] **Step 5: Write an integration test — trigger fires in a real duel**

Add to `packages/engine/tests/trigger-system.test.ts`:

```typescript
import { simulateDuel } from '../src/duel/duel-engine.js';

it('trigger_proc event appears in combat log when trigger affix equipped', () => {
  // Set up a loadout with chance_on_hit at 100% chance for determinism
  // This may require a mock or a special seed
  const loadout = createEmptyLoadout('sword', 'chainmail');
  loadout.weapon.slots[0] = { uid: 'proc-test', affixId: 'chance_on_hit', tier: 4, locked: false };
  // Use tier 4 for highest proc chance

  // Run multiple duels to find one where trigger fires
  // (or mock the RNG for determinism)
  // Check that at least one 'trigger_proc' event appears in the log
});
```

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/duel/trigger-system.ts packages/engine/tests/trigger-system.test.ts
git commit -m "feat: implement extractTriggers — trigger affixes now fire in combat"
```

---

### Task 14: Add compound combination effect handling

> **Multi-session task.** This task outlines the architecture and first compound (ignite). Each additional compound effect (frostbite, envenom, concussion, etc.) should be implemented as a follow-up sub-task using the same pattern. The full 29 compounds may warrant their own dedicated plan with per-effect breakdowns.

**Files:**
- Create: `packages/engine/src/duel/compound-effects.ts`
- Modify: `packages/engine/src/duel/duel-engine.ts`
- Modify: `packages/engine/src/forge/stat-calculator.ts:28` (remove compound.* skip)
- Test: `packages/engine/tests/compound-effects.test.ts` (create)

The 29 combinations in `combinations.json` use `compound.*` stat keys (e.g., `compound.ignite.chance`, `compound.frostbite.slowMultiplier`). These are currently skipped by `shouldSkipKey()`. Each compound effect is a unique combat mechanic.

**Design approach:** Rather than adding all `compound.*` keys to DerivedStats, create a separate `CompoundEffects` structure that the duel engine reads. The stat calculator collects compound modifiers into a separate bucket, and the duel engine uses them to trigger special mechanics.

- [ ] **Step 1: Define CompoundEffects type**

Create `packages/engine/src/types/compound-effects.ts`:

```typescript
export interface CompoundEffects {
  ignite?: { chance: number; dotMultiplier: number; duration: number };
  frostbite?: { chance: number; slowMultiplier: number; coldDot: number };
  staticDischarge?: { chance: number; chainDamage: number };
  envenom?: { chance: number; stackMultiplier: number };
  soulRend?: { chance: number; currentHpDamage: number };
  concussion?: { chance: number; stunDuration: number };
  // ... add all compound types from combinations.json
}
```

- [ ] **Step 2: Write failing tests for compound effect extraction**

Create `packages/engine/tests/compound-effects.test.ts` with tests that:
- Extract compound effects from a loadout with ignite combination
- Verify chance and magnitude are correct for the tier
- Verify empty loadout returns empty compound effects

- [ ] **Step 3: Implement compound effect extraction in stat-calculator**

Modify `calculateStats()` to collect `compound.*` keys into a `CompoundEffects` object instead of skipping them. Return it alongside or attached to DerivedStats.

- [ ] **Step 4: Implement compound effect application in duel-engine**

In the duel engine's attack processing, after applying damage, check compound effects:
- `ignite`: on hit, roll chance → apply fire DOT
- `frostbite`: on hit, roll chance → apply slow + cold DOT
- `staticDischarge`: on hit, roll chance → deal chain lightning damage
- `envenom`: on hit, roll chance → apply poison DOT with stacking
- `soulRend`: on hit, roll chance → deal % current HP damage
- `concussion`: on hit, roll chance → apply stun

- [ ] **Step 5: Run all engine tests**

Run: `pnpm --filter @alloy/engine test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/types/compound-effects.ts packages/engine/src/duel/compound-effects.ts packages/engine/tests/compound-effects.test.ts packages/engine/src/forge/stat-calculator.ts packages/engine/src/duel/duel-engine.ts
git commit -m "feat: compound combination effects now apply in combat"
```

---

### Task 15: Add synergy runtime effect handling

> **Multi-session task.** Like Task 14, this outlines the architecture and first synergy (Assassin's firstHitCrit). Each additional synergy effect should be a follow-up sub-task. The full 14 synergies may warrant their own dedicated plan.

**Files:**
- Create: `packages/engine/src/duel/synergy-effects.ts`
- Modify: `packages/engine/src/duel/duel-engine.ts`
- Modify: `packages/engine/src/forge/stat-calculator.ts:29` (remove synergy.* skip)
- Test: `packages/engine/tests/synergy-effects.test.ts` (create)

Similar to compounds, synergy bonusEffects use `synergy.*` keys that are skipped. Each synergy effect is a unique combat mechanic:

| Synergy | Effect Key | Mechanic |
|---------|-----------|----------|
| Assassin | synergy.assassin.firstHitCrit | First hit always crits |
| Berserker | synergy.berserker.critHealDouble | Crits heal double |
| Fortress | synergy.fortress.damageReductionAbove80 | DR when above 80% HP |
| Vengeance | synergy.vengeance.thornsMissingHpScale | Thorns scale with missing HP |
| PlagueBearer | synergy.plagueBearer.poisonStackRate | Faster poison stacking |
| BloodMirror | synergy.bloodMirror.reflectHeal | Reflected damage heals |
| StormConduit | synergy.stormConduit.chainToPhantom | Chain lightning to phantom target |
| FrozenBlade | synergy.frozenBlade.freezeOnCrit | Crits can freeze |

- [ ] **Step 1: Define SynergyEffects type**

Similar to CompoundEffects — a flat structure of optional synergy mechanic configs.

- [ ] **Step 2: Write failing tests**

Test that synergy effects are extracted when a synergy is active, and that they influence duel outcomes.

- [ ] **Step 3: Implement synergy effect extraction**

Modify the stat calculator to collect `synergy.*` keys into a `SynergyEffects` object.

- [ ] **Step 4: Implement synergy effect application in duel-engine**

Hook into the appropriate combat phases:
- `firstHitCrit`: Before first attack, force crit
- `critHealDouble`: In lifesteal calculation, double heal on crit
- `damageReductionAbove80`: In damage mitigation, apply DR when HP > 80%
- etc.

- [ ] **Step 5: Run all engine tests**

Run: `pnpm --filter @alloy/engine test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/duel/synergy-effects.ts packages/engine/tests/synergy-effects.test.ts packages/engine/src/forge/stat-calculator.ts packages/engine/src/duel/duel-engine.ts
git commit -m "feat: synergy runtime effects now apply in combat"
```

---

### Task 16: Fix double-death tiebreak logic

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts:414-428`
- Test: `packages/engine/tests/duel.test.ts`

When both gladiators die simultaneously, the HP% tiebreak compares `currentHP / maxHP` — but both are 0 (dead), so it always falls to coinflip. The fix: compare "overkill" (how far below 0 they went before clamping) or use the last pre-death HP values.

- [ ] **Step 1: Write a failing test that proves the tiebreak is broken**

```typescript
it('simultaneous death tiebreak favors gladiator with less overkill', () => {
  // P0: 50 HP, takes 60 damage (overkill -10)
  // P1: 50 HP, takes 100 damage (overkill -50)
  // P0 should win because they were "less dead"
  // Currently this always coinflips
});
```

- [ ] **Step 2: Stop clamping currentHP to 0 during damage application**

The simplest fix: don't clamp `currentHP` to 0 when damage is applied. Let it go negative. Then `checkDeath` can use the actual `currentHP` values for the tiebreak (more negative = more overkill = loser). Only clamp to 0 when displaying HP to the user or in combat log events.

Find where `currentHP` is clamped after damage (look for `Math.max(0, ...)` around HP subtraction in the attack processing code) and remove the clamp:

```typescript
// Before:
gladiator.currentHP = Math.max(0, gladiator.currentHP - damage);

// After:
gladiator.currentHP = gladiator.currentHP - damage;
```

Then in `checkDeath`, the existing comparison works correctly:

```typescript
if (dead0 && dead1) {
  // currentHP is now negative for dead gladiators
  // Less negative = less overkill = winner
  if (gladiators[0].currentHP > gladiators[1].currentHP) return 0;
  if (gladiators[1].currentHP > gladiators[0].currentHP) return 1;
  return rng.nextBool(0.5) ? 0 : 1;
}
```

**Important:** Ensure HP is clamped to 0 in combat log events (for UI display) but not in the runtime state used for death checks.

- [ ] **Step 3: Run tests to verify**

Run: `pnpm --filter @alloy/engine test -- duel`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/duel/duel-engine.ts packages/engine/tests/duel.test.ts
git commit -m "fix: double-death tiebreak uses overkill comparison instead of coinflip"
```

---

### Task 17: Wire stunChance and slowPercent into duel engine

**Files:**
- Modify: `packages/engine/src/duel/duel-engine.ts`
- Test: `packages/engine/tests/duel.test.ts`

`stunChance` and `slowPercent` exist on DerivedStats but are never read by the duel engine.

- [ ] **Step 1: Write failing tests**

```typescript
it('gladiator with stunChance sometimes stuns opponent', () => {
  const stats = [
    mockStats({ stunChance: 50, physicalDamage: 10, attackSpeed: 1 }),
    mockStats({ physicalDamage: 10, attackSpeed: 1 }),
  ];
  // Run duel, check for stun events in combat log
});

it('gladiator with slowPercent reduces opponent attack speed', () => {
  const stats = [
    mockStats({ slowPercent: 30, physicalDamage: 10, attackSpeed: 1 }),
    mockStats({ physicalDamage: 10, attackSpeed: 1 }),
  ];
  // P1 should attack less frequently due to slow
});
```

- [ ] **Step 2: Implement stunChance — roll on each hit**

In the attack processing, after damage is applied:
```typescript
if (rng.nextBool(attackerStats.stunChance / 100)) {
  defender.stunTimer = STUN_DURATION; // e.g., 1 second
  events.push({ type: 'stun', time, target: defenderIndex, duration: STUN_DURATION });
}
```

- [ ] **Step 3: Implement slowPercent — modify effective attack speed**

When calculating next attack time for a gladiator, apply the opponent's slow:
```typescript
const effectiveAttackSpeed = baseAttackSpeed * (1 + opponentStats.slowPercent / 100);
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @alloy/engine test -- duel`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/duel/duel-engine.ts packages/engine/tests/duel.test.ts
git commit -m "feat: stunChance and slowPercent now affect combat"
```

---

## Chunk 5: Client — Consolidate Duel Renderer

### Task 18: Wire Duel.tsx to use DuelScene + useDuelPlayback

**Files:**
- Modify: `packages/client/src/pages/Duel.tsx`
- Modify: `packages/client/src/features/duel/hooks/useDuelPlayback.ts` (if needed)
- Modify: `packages/client/src/features/duel/hooks/usePixiApp.ts` (if needed)

Currently `Duel.tsx` imports `DuelRenderer` (a 499-line monolithic component). The modular `DuelScene` + `useDuelPlayback` + `usePixiApp` system is superior (idle bobbing, weapon swing, elemental VFX, status icons) but unused.

- [ ] **Step 1: Read the current Duel.tsx to understand the integration points**

Read: `packages/client/src/pages/Duel.tsx` (full file)
Read: `packages/client/src/features/duel/hooks/useDuelPlayback.ts`
Read: `packages/client/src/features/duel/hooks/usePixiApp.ts`
Read: `packages/client/src/features/duel/pixi/DuelScene.ts`

- [ ] **Step 2: Replace DuelRenderer import with DuelScene hooks**

Replace the manual animation loop and DuelRenderer with:
```typescript
import { usePixiApp } from '@/features/duel/hooks/usePixiApp';
import { useDuelPlayback } from '@/features/duel/hooks/useDuelPlayback';
```

The `useDuelPlayback` hook already provides `currentTime`, `isPlaying`, `play`, `pause`, `skip`, `setSpeed`, `speed`, `maxTime`, `progress` — everything Duel.tsx needs for playback controls.

- [ ] **Step 3: Wire up the canvas container**

The `usePixiApp` hook creates the PixiJS Application and returns a ref. The canvas attaches to a container div via ref.

- [ ] **Step 4: Connect DuelScene to playback**

Initialize `DuelScene` with the app and stats, then use `useDuelPlayback` to drive event processing.

- [ ] **Step 5: Verify Duel screen works end-to-end**

Run: `pnpm --filter client dev` and play through a match
Expected: Duel renders correctly with animations

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/Duel.tsx
git commit -m "refactor: wire Duel.tsx to modular DuelScene + useDuelPlayback"
```

---

### Task 19: Delete DuelRenderer.tsx

**Files:**
- Delete: `packages/client/src/components/DuelRenderer.tsx`

- [ ] **Step 1: Verify DuelRenderer is no longer imported anywhere**

Run: `grep -r "DuelRenderer" packages/client/src/ --include="*.ts" --include="*.tsx"`
Expected: No imports (only the file itself, which we're deleting)

- [ ] **Step 2: Delete the file**

```bash
rm packages/client/src/components/DuelRenderer.tsx
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/DuelRenderer.tsx
git commit -m "chore: delete deprecated DuelRenderer.tsx (replaced by DuelScene)"
```

---

### Task 20: Fix DuelScene setTimeout leaks

**Files:**
- Modify: `packages/client/src/features/duel/pixi/DuelScene.ts`

`processEvent` uses `setTimeout` for status icon removal (trigger_proc, synergy_proc, stun). These aren't tracked or cleared in `destroy()`.

- [ ] **Step 1: Add a timeout tracking Set to DuelScene**

```typescript
private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
```

- [ ] **Step 2: Wrap all setTimeout calls**

```typescript
// Before:
setTimeout(() => { ... }, 2000);

// After:
const id = setTimeout(() => {
  this.pendingTimeouts.delete(id);
  // ... existing callback
}, 2000);
this.pendingTimeouts.add(id);
```

- [ ] **Step 3: Clear all timeouts in destroy() and reset()**

```typescript
destroy() {
  for (const id of this.pendingTimeouts) clearTimeout(id);
  this.pendingTimeouts.clear();
  // ... existing destroy logic
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/duel/pixi/DuelScene.ts
git commit -m "fix: track and clear setTimeout handles in DuelScene"
```

---

## Chunk 6: Client — Misc Fixes

### Task 21: Fix RemoteGateway StrictMode issue

**Files:**
- Modify: `packages/client/src/gateway/remote-gateway.ts`
- Modify: `packages/client/src/gateway/use-match-gateway.ts` (if gateway creation is here)

The `destroyed` flag on RemoteGateway breaks under React 19 StrictMode double-mount.

- [ ] **Step 1: Read the hook that creates the gateway**

Read: `packages/client/src/gateway/use-match-gateway.ts`

- [ ] **Step 2: Move gateway creation into useEffect**

If the gateway is created during render (outside useEffect), move it into the effect so StrictMode's cleanup/re-creation cycle works correctly:

```typescript
useEffect(() => {
  const gw = isLocal ? new LocalGateway(code) : new RemoteGateway(code);
  gatewayRef.current = gw;
  return () => gw.destroy();
}, [code, isLocal]);
```

- [ ] **Step 3: Verify with React StrictMode enabled**

Run: `pnpm --filter client dev` (StrictMode should be on by default in development)
Expected: Remote gateway connects and functions correctly

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/gateway/
git commit -m "fix: create RemoteGateway in useEffect for StrictMode safety"
```

---

### Task 22: Fix hardcoded base items in matchStore

**Files:**
- Modify: `packages/client/src/stores/matchStore.ts:39-40,54-55`

`startLocalMatch` and `startDebugMatch` hardcode `'sword'` and `'chainmail'`.

- [ ] **Step 1: Read the matchStore and forgeStore to understand the flow**

Read: `packages/client/src/stores/matchStore.ts`
Read: `packages/client/src/stores/forgeStore.ts` (for selectedWeaponId/selectedArmorId)

- [ ] **Step 2: Accept base item parameters**

Update `startLocalMatch` and `startDebugMatch` to accept optional weapon/armor IDs with `'sword'`/`'chainmail'` as defaults:

```typescript
startLocalMatch: (mode, seed, weaponId = 'sword', armorId = 'chainmail') => {
  const state = createMatch(
    `local_${Date.now()}`, seed, mode, ['player', 'ai'],
    weaponId, armorId, reg,
  );
  // ...
},
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/stores/matchStore.ts
git commit -m "fix: accept base item selection in startLocalMatch/startDebugMatch"
```

---

### Task 23: Clean up dead client code

**Files:**
- Delete: `packages/client/src/features/onboarding/components/TutorialOverlay.tsx`
- Delete: `packages/client/src/features/matchmaking/components/QueueStatus.tsx`
- Delete: `packages/client/src/shared/utils/analytics.ts`

All three are never imported by any file.

- [ ] **Step 1: Verify each file has zero imports**

```bash
grep -r "TutorialOverlay" packages/client/src/ --include="*.ts" --include="*.tsx" -l
grep -r "QueueStatus" packages/client/src/ --include="*.ts" --include="*.tsx" -l
grep -r "analytics" packages/client/src/ --include="*.ts" --include="*.tsx" -l
```

Expected: Only the files themselves (no consumers)

- [ ] **Step 2: Delete the files**

```bash
rm packages/client/src/features/onboarding/components/TutorialOverlay.tsx
rm packages/client/src/features/matchmaking/components/QueueStatus.tsx
rm packages/client/src/shared/utils/analytics.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A packages/client/src/features/onboarding/ packages/client/src/features/matchmaking/components/QueueStatus.tsx packages/client/src/shared/utils/analytics.ts
git commit -m "chore: remove dead client code (TutorialOverlay, QueueStatus, analytics)"
```

---

### Task 24: Fix PixiJS anchor `as any` casts

**Files:**
- Modify: `packages/client/src/features/duel/pixi/GladiatorSprite.ts:82`
- Modify: `packages/client/src/features/duel/pixi/CooldownRing.ts:44`
- Modify: `packages/client/src/features/duel/pixi/DamageNumbers.ts:81,166,207,238,269`
- Modify: `packages/client/src/features/duel/pixi/StatusIcons.ts:176`

All 9 instances follow the pattern `text.anchor = { x: ..., y: ... } as any`. PixiJS 8 uses `ObservablePoint`.

**Important:** Not all instances use `{ x: 0.5, y: 0.5 }`. Some use `y: 0` (e.g., `GladiatorSprite.ts:82` and `CooldownRing.ts:44` for name/cooldown labels). You MUST preserve the original x and y values — changing `y: 0` to `y: 0.5` would break label positioning.

- [ ] **Step 1: Replace all instances with the correct API, preserving original values**

For each instance, read the original x/y values and use `anchor.set()`:

```typescript
// If original was { x: 0.5, y: 0.5 }:
text.anchor.set(0.5, 0.5);

// If original was { x: 0.5, y: 0 }:
text.anchor.set(0.5, 0);
```

- [ ] **Step 2: Verify no `as any` casts remain in pixi/ directory**

Run: `grep -rn "as any" packages/client/src/features/duel/pixi/`
Expected: No matches

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/features/duel/pixi/
git commit -m "fix: replace PixiJS anchor 'as any' casts with anchor.set()"
```

---

## Chunk 7: Testing — Duel E2E + Missing Tests

### Task 25: Add Duel screen Playwright e2e tests

**Files:**
- Create: `packages/client/e2e/duel-acceptance.spec.ts`
- Modify: `packages/client/e2e/fixtures/match.ts` (if new helpers needed)

The Duel screen has zero dedicated e2e tests. Only `skipDuel()` is called in other specs.

- [ ] **Step 1: Read the existing fixtures and match-flow spec for patterns**

Read: `packages/client/e2e/fixtures/match.ts`
Read: `packages/client/e2e/match-flow.spec.ts` (first 50 lines)

- [ ] **Step 2: Write duel acceptance spec**

Create `packages/client/e2e/duel-acceptance.spec.ts`:

```typescript
import { test, expect } from './fixtures/match';

test.describe('Duel Acceptance Criteria', () => {
  test.beforeEach(async ({ page, startMatch, completeDraft, completeForge }) => {
    await startMatch(page);
    await completeDraft(page);
    await completeForge(page);
    // Now on duel screen
  });

  test('DU01: canvas renders with two gladiators', async ({ page }) => {
    await expect(page.locator('canvas')).toBeVisible();
    // Verify the duel UI elements are present
  });

  test('DU02: playback controls are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /play|pause/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /skip/i })).toBeVisible();
  });

  test('DU03: skip button advances to result', async ({ page, skipDuel }) => {
    await skipDuel(page);
    // Should show post-duel breakdown or continue button
    await expect(page.getByText(/continue|see results/i)).toBeVisible({ timeout: 10000 });
  });

  test('DU04: combat log displays events', async ({ page }) => {
    // Use condition-based waiting instead of arbitrary timeout
    const logEntries = page.locator('[data-testid="combat-log"] >> text=/damage|heal|block|dodge/i');
    await expect(logEntries.first()).toBeVisible({ timeout: 15000 });
  });

  test('DU05: no console errors during duel playback', async ({ page, skipDuel }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    // Wait for duel to finish naturally via skip instead of arbitrary sleep
    await skipDuel(page);
    await expect(page.getByText(/continue|see results/i)).toBeVisible({ timeout: 10000 });
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `pnpm --filter client exec playwright test e2e/duel-acceptance.spec.ts`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e/duel-acceptance.spec.ts
git commit -m "test: add Duel screen e2e acceptance tests (DU01-DU05)"
```

---

### Task 26: Add stun mechanic engine tests

**Files:**
- Modify: `packages/engine/tests/duel.test.ts`

Stun mechanics exist in `duel-engine.ts` but have zero behavioral tests.

- [ ] **Step 1: Write stun tests**

Add to `packages/engine/tests/duel.test.ts`:

```typescript
describe('stun mechanics', () => {
  it('stunned gladiator skips attacks for stun duration', () => {
    const stats = [
      mockStats({ physicalDamage: 10, attackSpeed: 1.0, maxHP: 200 }),
      mockStats({ physicalDamage: 10, attackSpeed: 1.0, maxHP: 200 }),
    ];
    // Manually inject stun on P1
    // Verify P1 produces fewer attack events than P0
  });

  it('stun expires and gladiator resumes attacking', () => {
    // Verify attacks resume after stun timer expires
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @alloy/engine test -- duel`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/duel.test.ts
git commit -m "test: add stun mechanic behavioral tests"
```

---

### Task 27: Add DOT integration test

**Files:**
- Modify: `packages/engine/tests/duel.test.ts`

DOT breakdown is tested in isolation (`damage-calc.test.ts`) but not end-to-end in a duel.

- [ ] **Step 1: Write DOT integration test**

```typescript
it('DOT ticks appear in combat log and deal damage over time', () => {
  // Set up gladiator with DOT-applying trigger or compound
  // Verify dot_tick events appear in the log
  // Verify total DOT damage matches expected calculation
});
```

- [ ] **Step 2: Run and commit**

```bash
git add packages/engine/tests/duel.test.ts
git commit -m "test: add DOT end-to-end integration test"
```

---

### Task 28: Fix fragile data.test.ts count assertions

**Files:**
- Modify: `packages/engine/tests/data.test.ts:12,17,22,29,30,81,118,134`

Hardcoded exact counts (33 affixes, 29 combinations, etc.) break every time content is added.

- [ ] **Step 1: Replace exact counts with minimum thresholds**

```typescript
// Before:
expect(data.affixes.length).toBe(33);

// After:
expect(data.affixes.length).toBeGreaterThanOrEqual(33);
```

Apply to all count assertions. The referential integrity tests (which verify IDs resolve correctly) are the real data safety net — exact counts are unnecessary.

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @alloy/engine test -- data`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add packages/engine/tests/data.test.ts
git commit -m "test: relax data count assertions to minimum thresholds"
```

---

## Chunk 8: Code Hygiene

### Task 29: Re-enable noUnusedLocals/noUnusedParameters in client tsconfig

**Files:**
- Modify: `packages/client/tsconfig.json:7-8`

The base config enables these, but the client overrides both to `false`, allowing dead variables to accumulate.

- [ ] **Step 1: Remove the overrides**

Delete lines 7-8 from `packages/client/tsconfig.json`:
```json
"noUnusedLocals": false,
"noUnusedParameters": false,
```

- [ ] **Step 2: Fix resulting TypeScript errors**

Run: `pnpm --filter client exec tsc --noEmit 2>&1 | head -50`

For each unused variable/parameter:
- If genuinely unused: remove it
- If used later in the same function: prefix with `_`

- [ ] **Step 3: Commit**

```bash
git add packages/client/
git commit -m "chore: re-enable noUnusedLocals/noUnusedParameters in client"
```

---

### Task 30: Align tools/useSimulation with engine's runSimulation

**Files:**
- Modify: `packages/tools/src/hooks/useSimulation.ts`
- Modify: `packages/tools/src/types.ts` (align SimulationConfig)

The tools package re-implements the full match simulation loop (270 lines) instead of calling the engine's `runSimulation()`. This will silently diverge.

- [ ] **Step 1: Read both implementations**

Read: `packages/tools/src/hooks/useSimulation.ts`
Read: `packages/engine/src/balance/simulation-runner.ts`

- [ ] **Step 2: Refactor to wrap engine's runSimulation**

Replace the manual match loop in `useSimulation` with a call to the engine's `runSimulation()`, adding only the React-specific batching and progress reporting.

- [ ] **Step 3: Align types**

Update `packages/tools/src/types.ts` `SimulationConfig` to either import from engine or match its shape.

- [ ] **Step 4: Run tools tests**

Run: `pnpm --filter tools test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/tools/
git commit -m "refactor: tools useSimulation now wraps engine's runSimulation"
```

---

### Task 31: Remove deprecated TickEvent type alias

**Files:**
- Modify: `packages/engine/src/types/combat.ts:116`
- Modify: `packages/engine/src/types/index.ts` (remove re-export if present)

- [ ] **Step 1: Verify TickEvent is unused**

Run: `grep -r "TickEvent" packages/ --include="*.ts" --include="*.tsx" -l`
Expected: Only the definition and barrel export

- [ ] **Step 2: Remove the alias and any re-exports**

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types/
git commit -m "chore: remove deprecated TickEvent type alias"
```

---

### Task 32: Move @types/howler to devDependencies

**Files:**
- Modify: `packages/client/package.json`

- [ ] **Step 1: Move the dependency**

```bash
cd packages/client && pnpm remove @types/howler && pnpm add -D @types/howler
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/package.json pnpm-lock.yaml
git commit -m "chore: move @types/howler to devDependencies"
```

---

## Summary

| Chunk | Tasks | Estimated Effort | Priority |
|-------|-------|-----------------|----------|
| 1. Quick Fixes | 1-5 | Small | P0 |
| 2. Failing Tests | 6 | Small | P0 |
| 3. Security | 7-12 | Medium | P0 |
| 4. Engine Core | 13-17 | Large | P1 |
| 5. Duel Renderer | 18-20 | Medium | P1 |
| 6. Client Fixes | 21-24 | Medium | P2 |
| 7. Testing | 25-28 | Medium | P2 |
| 8. Code Hygiene | 29-32 | Medium | P3 |

**Total:** 32 tasks across 8 chunks.

**Note on Chunk 4 (Engine Core):** Tasks 14 and 15 (compound and synergy effects) are the most complex items in this plan. Each compound effect is a unique combat mechanic requiring its own implementation and testing. The plan above outlines the architecture and first implementation pass, but the full set of 29 compound combinations and 14 synergy effects may warrant their own dedicated sub-plans with per-effect task breakdowns.
