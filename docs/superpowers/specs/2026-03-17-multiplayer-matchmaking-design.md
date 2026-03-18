# Multiplayer & Matchmaking Architecture

**Date:** 2026-03-17
**Status:** Approved design
**Approach:** Supabase-only (Approach A), with abstraction layer to allow migration to a dedicated game server (Approach B) later

## Overview

This spec defines how Alloy transitions from a local-only single-player game to supporting:

1. **Friend matches** via shareable room codes
2. **Ranked matchmaking** with Elo-based skill matching
3. **Server-authoritative PvP** with real-time sync via Supabase
4. **Offline AI matches** preserved as a fully client-side experience

The core architectural decision is a `MatchGateway` abstraction that decouples all UI code from the transport layer, allowing the same components to drive both local AI matches (Zustand) and server-validated PvP matches (Supabase Edge Functions + Realtime).

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Friend join UX | Room codes (not friend list) | Zero infrastructure, works over Discord/text, proven pattern (Jackbox, Among Us) |
| URL structure | `/match/:code/:phase` with room code | Human-readable, shareable, replaces hardcoded `"local"` |
| Room code security | Short-lived codes + JWT auth on all actions | Code expires on join or after 5 min; post-join security is per-user JWT, not code knowledge |
| AI match architecture | Fully client-side (offline capable) | Preserves offline play; no server dependency for single-player |
| Disconnect handling | 60-second reconnect window | Forgiving for genuine connection issues, doesn't leave opponent hanging |
| Matchmaking queue timeout | Offer AI after 60s | Tight Elo matching (+/-50 expanding to +/-150) without wait frustration |
| Spectating | Not included | Can layer on later without architectural changes |
| State authority | Server-authoritative for PvP | Prevents cheating; turn-based latency (~200ms) is imperceptible |

---

## Section 1: Session & Routing Model

### Two Session Types

**Local (AI) sessions:**

- Session ID generated client-side: `ai-{nanoid(6)}` (e.g., `ai-X7Kp2Q`)
- URL pattern: `/match/ai-X7Kp2Q/draft` → `/match/ai-X7Kp2Q/forge` → etc.
- State lives in Zustand, same as the current implementation
- If `matchState` is null when landing on the URL (e.g., after a page refresh), redirect to `/queue` instead of showing "Loading draft..." forever
- No server involvement — works fully offline

**PvP sessions:**

- Room code generated server-side: 6 characters from charset `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (30 chars, no ambiguous 0/O/1/I/L — ~729M combinations). Note: the `ai-` prefix is safe against collision because the charset contains only uppercase letters and digits.
- URL pattern: `/match/HK7P2Q/draft` → `/match/HK7P2Q/forge` → etc.
- State lives in Postgres (`matches.game_state` JSONB column), rehydrated on page load
- Room code stored in `matches.room_code` (unique, indexed)
- All Edge Functions receive the `room_code` from the client (extracted from the URL). The Edge Function resolves the room code to the match UUID internally via `SELECT id FROM matches WHERE room_code = $1`. Clients never need to know or send the UUID.

### Route Resolution

When the client navigates to `/match/:code/*`:

1. Does the code start with `ai-`? → Use `LocalGateway` (Zustand store)
2. Otherwise → Use `RemoteGateway` (fetch state from `match-state` Edge Function, subscribe to Realtime channel)

### Friend Match Join Flow

1. **Host** clicks "Create Match" → `match-create` Edge Function generates room code, inserts match row with `status: 'waiting'`, returns code
2. **Host** sees a "Share" screen with the code and a copyable URL (e.g., `alloy.gg/match/HK7P2Q`)
3. **Friend** opens the link → hits `/match/HK7P2Q` route
4. Client calls `match-join` Edge Function → server validates: match exists, status is `waiting`, user is authenticated
5. If valid → server sets `player2_id`, updates `status: 'active'`, invalidates the room code for future joins, broadcasts `match_started` to the channel
6. Both clients navigate to `/match/HK7P2Q/draft`
7. If invalid (match full, expired, not found) → client shows an error and redirects to main menu

### Room Code Lifecycle

- **Created** when host creates a PvP match
- **Active** for up to 5 minutes or until Player 2 joins (whichever comes first)
- **Expired** after 5 minutes with no join — match row is cleaned up (or marked `abandoned`)
- **Sealed** once Player 2 joins — code remains in the URL for readability but cannot be used to join again
- **Rate limited** — join endpoint allows max 5 attempts per IP per minute to prevent brute-force enumeration. Implementation: a `join_attempts` table with `(ip_address, attempted_at)` rows; the Edge Function checks `SELECT COUNT(*) FROM join_attempts WHERE ip_address = $1 AND attempted_at > NOW() - INTERVAL '1 minute'` before processing. Rows older than 5 minutes are cleaned up by the same pg_cron job that handles room code expiry.

---

## Section 2: Server-Authoritative Action Flow (PvP)

Every PvP game action follows a validate-persist-broadcast loop:

```
Client                    Edge Function                  Postgres              Realtime Channel
  │                            │                            │                       │
  ├── POST /draft-pick ───────→│                            │                       │
  │   { matchId, orbUid }      │                            │                       │
  │                            ├── SELECT game_state ──────→│                       │
  │                            │←── current state ──────────┤                       │
  │                            │                            │                       │
  │                            │  engine.applyAction(       │                       │
  │                            │    state, action            │                       │
  │                            │  )                          │                       │
  │                            │                            │                       │
  │                            │  if (!result.ok)            │                       │
  │                            │    return 400 + error       │                       │
  │                            │                            │                       │
  │                            ├── UPDATE game_state ──────→│                       │
  │                            │                            │                       │
  │                            ├── broadcast(action_result) ─────────────────────────→│
  │                            │                            │                       │
  │←── 200 OK ─────────────────┤                            │                       │
  │                            │                            │                       │
  │←──────────────── broadcast: action_result ──────────────────────────────────────│
  │  (both clients receive)    │                            │                       │
```

### Edge Functions (PvP Actions)

All PvP Edge Functions use the **service role key** (not the user's JWT) for database operations. This bypasses RLS, which is intentional — the Edge Function performs its own authorization checks (step 3 below). RLS policies remain in place as a defense-in-depth layer for any direct client-to-DB access.

All PvP Edge Functions follow this pattern:

1. **Authenticate** — verify JWT via `supabase.auth.getUser()`, extract `userId`
2. **Load** — resolve `room_code` to match UUID, fetch `matches` row, deserialize `game_state`
3. **Authorize** — confirm `userId` is `player1_id` or `player2_id`
4. **Load registry** — obtain the `DataRegistry` (see "DataRegistry in Edge Functions" below)
5. **Validate & apply** — run the action through `@alloy/engine.applyAction(state, action, registry)`
6. **Persist** — write the new `game_state` and increment `version` on the `matches` row
7. **Broadcast** — push a **filtered** result to the `match:{roomCode}` Realtime channel (visibility filtering applies — see Section 4)
8. **Return** — send the filtered result back to the calling client

### DataRegistry in Edge Functions

The `@alloy/engine`'s `applyAction()` requires a `DataRegistry` instance (affixes, combinations, synergies, base items, balance). Strategy:

- Game data JSON files are **bundled into the Edge Function deploy** as static imports. The engine's `loadAndValidateData()` function returns the data, and `new DataRegistry(...)` constructs the registry.
- The registry is constructed once per Edge Function invocation and cached in module scope (Deno Edge Functions reuse the module between warm invocations).
- This avoids database lookups for game data and keeps cold-start overhead minimal (~50ms for JSON parsing).
- When game data changes (balance patches, new affixes), Edge Functions must be redeployed. This is acceptable since data changes are infrequent and deliberate.

### Phase Transitions

Phase transitions are **server-driven** in PvP:

- When `applyAction()` returns a state where the phase has changed (e.g., draft complete → forge), the Edge Function broadcasts a `phase_changed` event
- Both clients receive the event and navigate to the new phase URL
- The client **never** decides when to change phases in PvP — it reacts to server broadcasts

### Duel Resolution

1. Both players submit builds via `forge-submit` Edge Function
2. When the second build arrives, the Edge Function:
   - Runs `simulate()` from `@alloy/engine` with both loadouts
   - Stores the combat log in `match_rounds`
   - Determines the next phase via `getNextPhase()` and updates `game_state`
   - Broadcasts `phase_changed: duel` with the combat log payload
3. Both clients receive the log and replay the duel animation locally
4. **Phase advancement after duel:** The `forge-submit` Edge Function that ran the simulation also handles Elo updates and match completion logic inline (when the match is decided). There is no separate `match-complete` call from the client for phase advancement — this prevents the ambiguity of "which client triggers it." The `match-complete` Edge Function is reserved for explicit match finalization (forfeit, abandon) rather than normal flow.

### Turn Timers (PvP)

Each phase has a server-enforced time limit:

- **Draft pick:** 15 seconds per pick. The Edge Function records `turn_deadline` in the match state. If no pick arrives by the deadline, the next action from either player triggers an auto-pick (random available orb) for the timed-out player before processing the new action.
- **Forge phase:** 90 seconds total. Same server-side deadline enforcement. If a player hasn't submitted when the deadline passes, their current loadout is submitted as-is.
- **No client-side timer authority** — clients display timers for UX but the server is the source of truth on expiry.

### Optimistic Updates

The `MatchGateway` interface supports optional optimistic updates:

- The acting client can run `applyAction()` locally for instant UI feedback
- If the server rejects the action, the gateway rolls back to the last confirmed state
- For a turn-based game with ~200ms round-trips this is rarely perceptible, but the architecture supports it

### Concurrency Control

To prevent race conditions (e.g., two draft picks arriving simultaneously):

- The `matches` table has a top-level `version` column (integer, incremented on every write). This is a database column, not part of the engine's `MatchState` type — the engine has no concept of versioning.
- Edge Functions use optimistic locking: `UPDATE matches SET game_state = $new, version = version + 1 WHERE id = $id AND version = $expected`
- If the version doesn't match (0 rows updated), the Edge Function re-reads the current state, **re-validates the action from scratch** against the new state (including re-checking that the orb is still available, it's still the player's turn, etc.), and retries (max 3 attempts before returning a 409 Conflict)

---

## Section 3: Matchmaking Queue

### Friend Matches

No queue involved. Host creates a match → gets room code → shares → friend joins directly.

### Ranked Matchmaking

**Queue join:**

1. Player clicks "Find Match" → client calls `matchmaking` Edge Function with `{ action: 'join' }`
2. Edge Function inserts into `matchmaking_queue`: `{ player_id, elo, queued_at }`
3. Client subscribes to personal channel `user:{playerId}` for match notifications
4. Client shows queue timer UI

**Matching (pg_cron job, every minute, with internal loop):**

Supabase pg_cron has a minimum granularity of 1 minute. To achieve near-real-time matching, the cron job calls a Postgres function that performs multiple scan iterations within a single invocation:

```sql
-- pg_cron runs this every minute
SELECT cron.schedule('matchmaker', '* * * * *', $$SELECT run_matchmaker()$$);

-- The function loops internally with pg_sleep
CREATE FUNCTION run_matchmaker() RETURNS void AS $$
BEGIN
  FOR i IN 1..20 LOOP  -- 20 iterations × 3s = 60s
    PERFORM match_one_pair();
    PERFORM pg_sleep(3);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

Each iteration:

1. Scan `matchmaking_queue` ordered by `queued_at` (oldest first)
2. For each player, find the best available opponent within their tolerance window:
   - 0-10 seconds: ±50 Elo
   - 10-20 seconds: ±75 Elo
   - 20-30 seconds: ±100 Elo
   - 30-40 seconds: ±125 Elo
   - 40+ seconds: ±150 Elo (cap)
3. When a pair is found:
   - Remove both from queue
   - Call `match-create` to generate the match
   - Broadcast `match_found` with the room code to both players' personal channels
4. Both clients receive the notification and navigate to `/match/:code/draft`

**AI fallback after 60 seconds:**

- After 60 seconds in queue with no match, broadcast `offer_ai` to the player's personal channel
- Client shows: "No opponents found yet. Play vs AI while you wait?"
- If accepted: player starts a local AI match but **stays in the queue**
- When a PvP match is found: client shows a modal "Match found! Accept?" with a 15-second timer
- If accepted: AI match is abandoned, player navigates to the PvP match
- If declined or timed out: player is removed from queue, continues AI match

**Queue leave:**

- Player clicks "Cancel" → client calls `matchmaking` Edge Function with `{ action: 'leave' }`
- Edge Function deletes the player's row from `matchmaking_queue`

**Stale queue cleanup:**

- Players who close the browser without clicking "Cancel" leave orphaned queue entries
- The matchmaker function also cleans stale entries: `DELETE FROM matchmaking_queue WHERE queued_at < NOW() - INTERVAL '5 minutes'`
- Additionally, the client sends a heartbeat every 30 seconds via the `user:{playerId}` Presence channel. If Presence drops and the player doesn't reconnect within 30 seconds, a database trigger or the next matchmaker scan removes their queue entry

### Elo Calculation

- **Formula:** standard Elo with `expectedScore = 1 / (1 + 10^((opponentElo - playerElo) / 400))`
- **K-factor:** 32 for players with <30 matches, 16 after
- **Starting Elo:** 1000
- **Calculated in:** `match-complete` Edge Function, after the final duel result
- **Stored in:** `profiles.elo` column (already exists in schema)

---

## Section 4: Reconnection & Persistence

### PvP Match Recovery

PvP match state is fully persisted in Postgres. Recovery is automatic:

1. Player refreshes page or loses connection
2. Browser navigates to `/match/HK7P2Q/draft` (URL is still in the address bar)
3. `RemoteGateway` calls `match-state` Edge Function with the room code
4. Server returns current `game_state` with **visibility filtering:**
   - During forge phase: opponent's build data is null
   - During/after duel: both builds are revealed
   - Opponent's stockpile is always visible (draft picks are public)
5. Client rehydrates local state and resubscribes to Realtime channel
6. Game continues from exactly where it left off

### Disconnect Detection

- Supabase Realtime **Presence** tracks who is online in each match channel
- When a player's presence drops, the opponent's client starts a 60-second countdown: "Waiting for opponent to reconnect..."
- If the disconnected player resubscribes within 60 seconds, the countdown is cancelled and play resumes
- If the timer expires, the **remaining (connected) client** calls the `forfeit` Edge Function with `{ roomCode, disconnectedPlayer }`. The Edge Function verifies via Presence that the reported player is genuinely offline before applying the forfeit. This prevents a malicious client from forfeiting on behalf of the opponent — the server independently confirms the disconnect via the Presence API.

### AI Match Non-Persistence

AI matches are ephemeral by design:

- State lives only in the client-side Zustand store
- Page refresh loses the match — client redirects to `/queue`
- This is acceptable for low-stakes AI practice and preserves the offline capability
- Post-match results (win/loss, stats) can optionally be posted to the server for tracking when online

---

## Section 5: MatchGateway Abstraction

The central architectural abstraction that keeps the door open for Approach B (dedicated game server).

### Interface

```typescript
interface MatchGateway {
  /** Current match state (reactive — triggers re-renders) */
  getState(): MatchState | null;

  /** Send a game action. Returns a filtered result after server validation (PvP) or local validation (AI).
   *  For PvP, the returned ActionResult contains a visibility-filtered MatchState
   *  (e.g., opponent forge build hidden during forge phase). */
  dispatch(action: GameAction): Promise<ActionResult>;

  /** Subscribe to state changes (broadcasts in PvP, Zustand updates in AI). Returns unsubscribe function. */
  subscribe(callback: (state: MatchState) => void): () => void;

  /** Subscribe to match events (phase changes, opponent actions, errors). */
  onEvent(callback: (event: MatchEvent) => void): () => void;

  /** Clean up connections/subscriptions. */
  destroy(): void;
}

type MatchEvent =
  | { kind: 'phase_changed'; phase: MatchPhase }
  | { kind: 'opponent_action'; action: GameAction; result: ActionResult }
  | { kind: 'opponent_disconnected' }
  | { kind: 'opponent_reconnected' }
  | { kind: 'match_forfeited'; winner: 0 | 1 }
  | { kind: 'error'; message: string };
```

### Implementations

**`LocalGateway`** (AI matches):

- Wraps the existing Zustand `matchStore`
- `dispatch()` calls `applyAction()` synchronously, then triggers AI turn
- `subscribe()` maps to Zustand's `subscribe()`
- No network calls, no cleanup needed
- Works offline

**`RemoteGateway`** (PvP matches):

- Holds a Supabase Realtime channel subscription and a local state cache
- `dispatch()` calls the appropriate Edge Function, returns the server's response
- `subscribe()` delivers Realtime Broadcast events as state updates
- `onEvent()` delivers phase changes, opponent disconnects, etc.
- `destroy()` unsubscribes from the Realtime channel

### Gateway Selection

A `useMatchGateway(code: string)` hook determines which gateway to use:

```typescript
function useMatchGateway(code: string): MatchGateway {
  // Gateway is created once per code and cached in a ref.
  // Cleanup happens via useEffect return to avoid leaking subscriptions.
  const gatewayRef = useRef<MatchGateway | null>(null);

  if (!gatewayRef.current || gatewayRef.current.code !== code) {
    gatewayRef.current?.destroy();
    gatewayRef.current = code.startsWith('ai-')
      ? new LocalGateway(useMatchStore)
      : new RemoteGateway(code, supabaseClient);
  }

  useEffect(() => {
    return () => gatewayRef.current?.destroy();
  }, [code]);

  return gatewayRef.current;
}
```

The gateway instance is **ref-stable** — it is not recreated on every render. `RemoteGateway` establishes its Realtime subscription in the constructor and tears it down in `destroy()`.

### Migration Path to Approach B

If Alloy outgrows Supabase Edge Functions:

1. Build a WebSocket game server that implements the same action validation loop
2. Create a `WebSocketGateway` implementing `MatchGateway`
3. Swap `RemoteGateway` for `WebSocketGateway` in `useMatchGateway`
4. **No UI code changes required** — all pages/components interact through the same `MatchGateway` interface

---

## Section 6: Client Architecture Changes

### Routing Changes

**Current:**
```
/match/:id/draft    (where :id is always "local")
/match/:id/forge
/match/:id/duel
/match/:id/result
```

**New:**
```
/match/:code              Entry point — join flow for PvP, redirect for AI
/match/:code/draft        Draft phase
/match/:code/forge        Forge phase
/match/:code/duel         Duel phase
/match/:code/adapt        Adapt phase (between rounds)
/match/:code/result       Post-match results
```

The `:code` parameter is either an `ai-*` prefix (local) or a 6-char room code (PvP).

### State Management Changes

**Current:** Pages directly import from `useMatchStore` (Zustand).

**New:** Pages consume state through `useMatchGateway()`:

```
// Before (tightly coupled to Zustand)
const matchState = useMatchStore((s) => s.state);
const dispatch = useMatchStore((s) => s.dispatch);

// After (gateway-agnostic)
const gateway = useMatchGateway(code);
const matchState = useGatewayState(gateway);
const dispatch = gateway.dispatch;
```

### Supabase Client Changes

**Current:** `MockSupabaseClient` in `shared/utils/supabase.ts`.

**New:**
- Real `@supabase/supabase-js` client initialized with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Fallback to mock client when env vars are absent (offline/test mode)
- Auth: Supabase anonymous auth for guests (generates a real JWT, unlike the current `guest_{timestamp}` pattern)

### Auth Changes

**Current:** `guest_{timestamp}` stored in Zustand. No real authentication.

**New:**
- Supabase anonymous auth on first visit — generates a real user ID and JWT
- Profile row created automatically via the existing database trigger
- OAuth (Google/Discord) can be added later — the anonymous user can be "upgraded" to a full account via Supabase's `linkIdentity()` flow
- All Edge Function calls include the JWT in the Authorization header

### Component Impact

| Component | Change Required |
|-----------|----------------|
| `Draft.tsx` | Replace direct Zustand imports with `useMatchGateway()`. AI turn logic moves into `LocalGateway`. |
| `Forge.tsx` | Replace direct Zustand imports with `useMatchGateway()`. Build submission goes through `gateway.dispatch()`. |
| `Duel.tsx` | Replace direct Zustand imports with `useMatchGateway()`. Combat log comes from gateway state. |
| `Matchmaking.tsx` | Add "Create Match" (friend) and "Find Match" (ranked) buttons. Queue UI with timer. |
| `PostMatch.tsx` | Read results from gateway. Show Elo change for ranked PvP. |
| `GemCard`, `GemChip`, `Timer`, etc. | **No changes** — pure presentational components. |
| `matchStore.ts` | Kept as-is for AI matches. Wrapped by `LocalGateway`. |
| `draftStore.ts`, `forgeStore.ts` | **No changes** — UI-only state (selection, drag) stays in Zustand. |

---

## Section 7: Edge Function Inventory

All Edge Functions already exist as stubs. Changes needed:

| Function | Current State | Changes |
|----------|--------------|---------|
| `match-create` | Stub | Implement: generate room code, derive `player1_id` from JWT (not from request body), create match row, return code. Add auth. The existing stub accepts `player1Id` in the body — this must be replaced with server-side JWT extraction. |
| `matchmaking` | Stub | Implement: insert/remove from queue. Wire to pg_cron matcher. |
| `draft-pick` | Stub | Implement: validate-persist-broadcast loop. Fix payload nesting bug. |
| `forge-submit` | Stub | Implement: validate build, store, run duel when both submitted. |
| `match-complete` | Stub | Implement: Elo calculation, phase transition, mastery XP. |
| `match-state` | Stub | Implement: load state with visibility filtering. |
| `ai-match-create` | Stub | Remove or repurpose — AI matches don't go through the server. |
| `forfeit` | Stub | Implement: mark match complete, apply Elo penalty, broadcast. |
| **New: `match-join`** | Doesn't exist | Create: validate room code, assign Player 2, seal match, broadcast. |

### Shared Utilities Fixes

- `_shared/supabase.ts`: Replace stub `getUserId()` with real JWT verification via `supabase.auth.getUser()`
- `_shared/cors.ts`: No changes needed

---

## Section 8: Database Schema Changes

The existing schema (`migrations/001-005`) covers most needs. All changes below go in a single new migration: `006_multiplayer.sql`.

### Storage Model: game_state JSONB vs. Existing Per-Field Columns

The existing `matches` table has per-field columns: `phase` (enum), `round`, `scores`, `pool_seed`, etc. The existing `match_rounds` table stores per-round data (`draft_picks`, `player1_build`, `player2_build`, `duel_event_log`).

**Decision:** Add a `game_state` JSONB column that stores the full serialized engine `MatchState`. This is the **canonical state** used by Edge Functions for the validate-persist-broadcast loop. The existing per-field columns (`phase`, `round`, `scores`) are **kept and updated alongside** `game_state` for queryability (leaderboards, match history, admin queries). The `match_rounds` table continues to be written to for historical/replay purposes — it is populated by the Edge Function after each duel, but is not read during active gameplay.

```
┌─────────────────────────────────────────────────────┐
│ matches table                                       │
│                                                     │
│  game_state (JSONB)  ← canonical, used by engine    │
│  phase (enum)        ← denormalized, for queries    │
│  round (int)         ← denormalized, for queries    │
│  scores (JSONB)      ← denormalized, for queries    │
│  version (int)       ← optimistic locking (DB-only) │
│  room_code (text)    ← join/URL identifier          │
│  status (text)       ← match lifecycle              │
└─────────────────────────────────────────────────────┘
```

The `version` column is a **database-only concern** — it is not part of the engine's `MatchState` type. Edge Functions read it alongside `game_state` and use it for optimistic locking, but the engine never sees it.

### New Columns on `matches`

```sql
-- 006_multiplayer.sql

ALTER TABLE matches ADD COLUMN room_code TEXT UNIQUE;
ALTER TABLE matches ADD COLUMN game_state JSONB;
ALTER TABLE matches ADD COLUMN status TEXT DEFAULT 'waiting'
  CHECK (status IN ('waiting', 'active', 'completed', 'abandoned', 'forfeited'));
ALTER TABLE matches ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE matches ADD COLUMN room_code_expires_at TIMESTAMPTZ;

CREATE INDEX idx_matches_room_code ON matches (room_code) WHERE room_code IS NOT NULL;
CREATE INDEX idx_matches_status ON matches (status) WHERE status = 'waiting';
```

### New Table: join_attempts (Rate Limiting)

```sql
CREATE TABLE join_attempts (
  ip_address INET NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_join_attempts_ip_time ON join_attempts (ip_address, attempted_at);
```

### Room Code Cleanup & Stale Data (pg_cron)

```sql
-- Run every minute: expire unclaimed matches and clean up stale data
SELECT cron.schedule('cleanup_stale_data', '* * * * *', $$
  -- Expire unclaimed room codes
  UPDATE matches
  SET status = 'abandoned'
  WHERE status = 'waiting'
    AND room_code_expires_at < NOW();

  -- Clean up old join attempt records
  DELETE FROM join_attempts
  WHERE attempted_at < NOW() - INTERVAL '5 minutes';

  -- Clean up stale matchmaking queue entries
  DELETE FROM matchmaking_queue
  WHERE queued_at < NOW() - INTERVAL '5 minutes';
$$);
```

### RLS Notes

Edge Functions use the **service role key** and bypass RLS. RLS policies exist as defense-in-depth for any direct client-to-DB access (which should not happen in normal operation but protects against misconfiguration):

```sql
-- Existing RLS policies from migration 005 remain in place
-- No new client-facing RLS policies needed since all
-- match mutations go through Edge Functions (service role)
```

---

## Section 9: Security Considerations

### Authentication

- All PvP Edge Functions require a valid Supabase JWT
- `getUserId()` must verify the JWT via `supabase.auth.getUser()`, not trust the raw Bearer token (current security issue)
- AI matches require no authentication (offline capable)

### Anti-Cheat

- **Server-authoritative:** the engine runs in Edge Functions for PvP. Clients send intents, not state.
- **Deterministic verification:** the same seed + actions must produce the same state. The server can detect discrepancies.
- **Visibility filtering:** opponent's forge build is hidden server-side during the forge phase. The client never receives data it shouldn't see.

### Room Code Security

- 6 chars from a 30-char alphabet = ~729M combinations
- Codes are valid for max 5 minutes
- Join endpoint rate-limited to 5 attempts per IP per minute
- Brute-force probability in the worst case: `(5 attempts × 5 minutes) / 729M ≈ 0.000003%`
- After match starts, the room code is decorative — all actions are authorized by JWT

### Rate Limiting

- Edge Functions should enforce per-user rate limits on game actions (e.g., max 1 action per second per match)
- Matchmaking queue: max 1 active queue entry per user

---

## Out of Scope

The following are explicitly excluded from this design:

- **Spectating** — can be added later by introducing a `spectator` role on the Realtime channel with read-only access and forge-phase visibility filtering
- **Friend list / social graph** — room codes are the invitation mechanism for now
- **Chat** — in-match communication can use the existing Realtime channel but is not designed here
- **Replays** — match_rounds already stores enough data for replays, but the UI is not designed here
- **Tournament/bracket systems** — future feature, no architectural impact
- **AI match persistence** — AI matches remain ephemeral to preserve offline capability
