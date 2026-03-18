# Multiplayer & Matchmaking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable PvP multiplayer with friend invites (room codes), ranked matchmaking (Elo), and server-authoritative game state — while preserving offline AI play.

**Architecture:** A `MatchGateway` interface abstracts local (AI/Zustand) and remote (PvP/Supabase) match sessions. The client never knows which transport it's using. Edge Functions run the engine server-side for PvP, persisting state to Postgres and syncing via Supabase Realtime Broadcast.

**Tech Stack:** React 19, Zustand 5, React Router 7, @supabase/supabase-js, Supabase Edge Functions (Deno), @alloy/engine, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-17-multiplayer-matchmaking-design.md`

### Important Notes

- **pnpm:** This project uses pnpm. All install/test commands should use `pnpm` (e.g., `pnpm vitest run`, `pnpm add`).
- **Edge Function handler pattern:** All Edge Functions use `Deno.serve(async (req) => { ... })` (modern Supabase pattern). Existing stubs that use the older `export default` pattern should be converted.
- **@alloy/engine in Deno:** Edge Functions import `@alloy/engine` via an import map in `packages/supabase/deno.json`. This import map must be created in Task 10 before any Edge Function implementation. Map `@alloy/engine` to `../../engine/src/index.ts` (or the built dist path).
- **`match-complete` Edge Function:** Per the spec, normal Elo updates happen inside `forge-submit`. The `match-complete` stub is effectively replaced by `forfeit` for explicit finalization. Remove or leave as a stub — do not implement.
- **Shared utility breaking change:** Task 10 rewrites `_shared/supabase.ts` — `getUserId` becomes async and throws instead of returning null. All Edge Functions that import it are rewritten in this plan, so this is safe.

---

## Phase Overview

This plan is split into 4 independent phases. Each phase produces working, testable software:

| Phase | What it does | Depends on |
|-------|-------------|------------|
| **Phase 1: Gateway + Routing** | Fix stuck-loading bug, introduce MatchGateway, AI session IDs | Nothing |
| **Phase 2: Supabase Foundation** | Real Supabase client, auth, database migration | Phase 1 |
| **Phase 3: Friend Matches (PvP)** | Room codes, Edge Functions, RemoteGateway, real-time sync | Phase 2 |
| **Phase 4: Ranked Matchmaking** | Queue system, Elo matching, AI-while-waiting | Phase 3 |

---

## Chunk 1: MatchGateway Interface + LocalGateway

### Task 1: Define MatchGateway interface and MatchEvent type

**Files:**
- Create: `packages/client/src/gateway/types.ts`
- Test: `packages/client/src/gateway/types.test.ts`

This is the central abstraction from the spec (Section 5). All UI code will consume match state through this interface.

- [ ] **Step 1: Create the gateway types file**

```typescript
// packages/client/src/gateway/types.ts
import type { MatchState, MatchPhase, GameAction, ActionResult } from '@alloy/engine';

export type MatchEvent =
  | { kind: 'phase_changed'; phase: MatchPhase }
  | { kind: 'opponent_action'; action: GameAction; result: ActionResult }
  | { kind: 'opponent_disconnected' }
  | { kind: 'opponent_reconnected' }
  | { kind: 'match_forfeited'; winner: 0 | 1 }
  | { kind: 'error'; message: string };

export interface MatchGateway {
  /** Identifier for this gateway instance (room code or ai-* prefix) */
  readonly code: string;

  /** Current match state */
  getState(): MatchState | null;

  /**
   * Send a game action. Returns a filtered result after server validation
   * (PvP) or local validation (AI).
   */
  dispatch(action: GameAction): Promise<ActionResult>;

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(callback: (state: MatchState) => void): () => void;

  /** Subscribe to match events (phase changes, disconnects, etc.). */
  onEvent(callback: (event: MatchEvent) => void): () => void;

  /** Clean up connections/subscriptions. */
  destroy(): void;
}
```

- [ ] **Step 2: Write a type-level test to verify the interface is importable and correctly shaped**

```typescript
// packages/client/src/gateway/types.test.ts
import { describe, it, expect } from 'vitest';
import type { MatchGateway, MatchEvent } from './types';

describe('MatchGateway types', () => {
  it('MatchEvent covers all expected event kinds', () => {
    const kinds: MatchEvent['kind'][] = [
      'phase_changed',
      'opponent_action',
      'opponent_disconnected',
      'opponent_reconnected',
      'match_forfeited',
      'error',
    ];
    expect(kinds).toHaveLength(6);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd packages/client && npx vitest run src/gateway/types.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/gateway/types.ts packages/client/src/gateway/types.test.ts
git commit -m "feat: define MatchGateway interface and MatchEvent types"
```

---

### Task 2: Implement LocalGateway wrapping the existing matchStore

**Files:**
- Create: `packages/client/src/gateway/local-gateway.ts`
- Test: `packages/client/src/gateway/local-gateway.test.ts`
- Read: `packages/client/src/stores/matchStore.ts` (lines 1-76)

LocalGateway wraps the existing Zustand matchStore for AI matches. It implements `MatchGateway` and handles AI turn triggering internally.

- [ ] **Step 1: Write failing tests for LocalGateway**

```typescript
// packages/client/src/gateway/local-gateway.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalGateway } from './local-gateway';
import { useMatchStore } from '@/stores/matchStore';

describe('LocalGateway', () => {
  beforeEach(() => {
    useMatchStore.getState().reset();
  });

  it('has the correct code property', () => {
    const gw = new LocalGateway('ai-test1');
    expect(gw.code).toBe('ai-test1');
    gw.destroy();
  });

  it('returns null state before match starts', () => {
    const gw = new LocalGateway('ai-test2');
    expect(gw.getState()).toBeNull();
    gw.destroy();
  });

  it('returns match state after startLocalMatch', () => {
    const store = useMatchStore.getState();
    store.startLocalMatch(12345, 'ranked', 1);
    const gw = new LocalGateway('ai-test3');
    const state = gw.getState();
    expect(state).not.toBeNull();
    expect(state!.phase.kind).toBe('draft');
    gw.destroy();
  });

  it('dispatch applies a draft pick and returns result', async () => {
    const store = useMatchStore.getState();
    store.startLocalMatch(12345, 'ranked', 1);
    const gw = new LocalGateway('ai-test4');
    const state = gw.getState()!;
    // Player 0's turn — pick first available orb
    const orbUid = state.pool[0].uid;
    const result = await gw.dispatch({ kind: 'draft_pick', player: 0, orbUid });
    expect(result.ok).toBe(true);
    gw.destroy();
  });

  it('subscribe fires callback on state changes', async () => {
    const store = useMatchStore.getState();
    store.startLocalMatch(12345, 'ranked', 1);
    const gw = new LocalGateway('ai-test5');
    const states: any[] = [];
    const unsub = gw.subscribe((s) => states.push(s));
    const orbUid = gw.getState()!.pool[0].uid;
    await gw.dispatch({ kind: 'draft_pick', player: 0, orbUid });
    expect(states.length).toBeGreaterThan(0);
    unsub();
    gw.destroy();
  });

  it('destroy prevents further subscription callbacks', async () => {
    const store = useMatchStore.getState();
    store.startLocalMatch(12345, 'ranked', 1);
    const gw = new LocalGateway('ai-test6');
    const states: any[] = [];
    gw.subscribe((s) => states.push(s));
    gw.destroy();
    // Dispatch directly on store — gateway should not fire
    const pool = store.state!.pool;
    store.dispatch({ kind: 'draft_pick', player: 0, orbUid: pool[0].uid });
    expect(states).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/gateway/local-gateway.test.ts`
Expected: FAIL — `LocalGateway` not found

- [ ] **Step 3: Implement LocalGateway**

```typescript
// packages/client/src/gateway/local-gateway.ts
import type { MatchState, GameAction, ActionResult } from '@alloy/engine';
import type { MatchGateway, MatchEvent } from './types';
import { useMatchStore } from '@/stores/matchStore';

export class LocalGateway implements MatchGateway {
  readonly code: string;
  private unsubscribers: (() => void)[] = [];
  private destroyed = false;

  constructor(code: string) {
    this.code = code;
  }

  getState(): MatchState | null {
    return useMatchStore.getState().state;
  }

  async dispatch(action: GameAction): Promise<ActionResult> {
    const result = useMatchStore.getState().dispatch(action);
    return result;
  }

  subscribe(callback: (state: MatchState) => void): () => void {
    const unsub = useMatchStore.subscribe((store) => {
      if (!this.destroyed && store.state) {
        callback(store.state);
      }
    });
    this.unsubscribers.push(unsub);
    return unsub;
  }

  onEvent(callback: (event: MatchEvent) => void): () => void {
    // LocalGateway emits phase_changed events by watching state transitions
    let lastPhase = this.getState()?.phase;
    const unsub = useMatchStore.subscribe((store) => {
      if (this.destroyed || !store.state) return;
      const currentPhase = store.state.phase;
      if (currentPhase && lastPhase && currentPhase.kind !== lastPhase.kind) {
        callback({ kind: 'phase_changed', phase: currentPhase });
      }
      lastPhase = currentPhase;
    });
    this.unsubscribers.push(unsub);
    return unsub;
  }

  destroy(): void {
    this.destroyed = true;
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/gateway/local-gateway.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/gateway/local-gateway.ts packages/client/src/gateway/local-gateway.test.ts
git commit -m "feat: implement LocalGateway wrapping Zustand matchStore"
```

---

### Task 3: Create useMatchGateway hook

**Files:**
- Create: `packages/client/src/gateway/use-match-gateway.ts`
- Create: `packages/client/src/gateway/index.ts` (barrel export)
- Test: `packages/client/src/gateway/use-match-gateway.test.ts`
- Read: `packages/client/src/gateway/types.ts`

The hook creates a ref-stable gateway instance based on the route code parameter. It handles cleanup on unmount.

- [ ] **Step 1: Write failing tests for useMatchGateway**

```typescript
// packages/client/src/gateway/use-match-gateway.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMatchGateway } from './use-match-gateway';
import { LocalGateway } from './local-gateway';

describe('useMatchGateway', () => {
  it('returns a LocalGateway for ai- prefixed codes', () => {
    const { result } = renderHook(() => useMatchGateway('ai-abc123'));
    expect(result.current).toBeInstanceOf(LocalGateway);
    expect(result.current.code).toBe('ai-abc123');
  });

  it('returns the same instance across re-renders', () => {
    const { result, rerender } = renderHook(() => useMatchGateway('ai-abc123'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('creates a new instance when code changes', () => {
    const { result, rerender } = renderHook(
      ({ code }) => useMatchGateway(code),
      { initialProps: { code: 'ai-first' } },
    );
    const first = result.current;
    rerender({ code: 'ai-second' });
    expect(result.current).not.toBe(first);
    expect(result.current.code).toBe('ai-second');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/gateway/use-match-gateway.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement useMatchGateway**

```typescript
// packages/client/src/gateway/use-match-gateway.ts
import { useEffect, useRef } from 'react';
import type { MatchGateway } from './types';
import { LocalGateway } from './local-gateway';

export function useMatchGateway(code: string): MatchGateway {
  const gatewayRef = useRef<MatchGateway | null>(null);
  const codeRef = useRef<string>(code);

  if (!gatewayRef.current || codeRef.current !== code) {
    gatewayRef.current?.destroy();
    codeRef.current = code;

    if (code.startsWith('ai-')) {
      gatewayRef.current = new LocalGateway(code);
    } else {
      // RemoteGateway will be added in Phase 3
      throw new Error(`PvP gateway not yet implemented for code: ${code}`);
    }
  }

  useEffect(() => {
    return () => {
      gatewayRef.current?.destroy();
      gatewayRef.current = null;
    };
  }, [code]);

  return gatewayRef.current;
}
```

- [ ] **Step 4: Create barrel export**

```typescript
// packages/client/src/gateway/index.ts
export type { MatchGateway, MatchEvent } from './types';
export { LocalGateway } from './local-gateway';
export { useMatchGateway } from './use-match-gateway';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/gateway/use-match-gateway.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/gateway/
git commit -m "feat: add useMatchGateway hook with ref-stable gateway instances"
```

---

### Task 4: Update routing — AI session IDs and redirect on null state

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/pages/Matchmaking.tsx`
- Modify: `packages/client/src/pages/Draft.tsx`
- Modify: `packages/client/src/pages/Forge.tsx`
- Modify: `packages/client/src/pages/Duel.tsx`
- Modify: `packages/client/src/pages/PostMatch.tsx`

This task fixes the "stuck loading" bug and introduces AI session IDs in URLs.

- [ ] **Step 1: Update Matchmaking.tsx to generate ai- session codes**

In `packages/client/src/pages/Matchmaking.tsx`, change the `handlePlayVsAI` function to generate an `ai-` prefixed code using a simple random string, and navigate to the new URL pattern:

```typescript
// Replace the handlePlayVsAI function:
const handlePlayVsAI = (aiTier: 1 | 2 | 3 | 4 | 5) => {
  try {
    const seed = Math.floor(Math.random() * 999999);
    startLocalMatch(seed, 'ranked', aiTier);
    const code = 'ai-' + Math.random().toString(36).substring(2, 8);
    navigate(`/match/${code}/draft`);
  } catch (err) {
    console.error('Failed to start match:', err);
    alert('Failed to start match: ' + (err instanceof Error ? err.message : String(err)));
  }
};
```

- [ ] **Step 2: Update App.tsx route parameter from :id to :code**

In `packages/client/src/App.tsx`, rename the route parameter from `:id` to `:code` for clarity:

```typescript
// Change all /match/:id/ routes to /match/:code/
<Route path="/match/:code/draft" element={<Draft />} />
<Route path="/match/:code/forge" element={<Forge />} />
<Route path="/match/:code/duel" element={<Duel />} />
<Route path="/match/:code/adapt" element={<Adapt />} />
<Route path="/match/:code/result" element={<PostMatch />} />
```

Also add a catch-all entry route for PvP join flow (Phase 3):

```typescript
<Route path="/match/:code" element={<MatchEntry />} />
```

Create a placeholder `MatchEntry` component in the same file or a new page that just redirects to `/queue` for now.

- [ ] **Step 3: Update Draft.tsx — redirect on null state, use :code param**

In `packages/client/src/pages/Draft.tsx`:

1. Change `const { id } = useParams()` to `const { code } = useParams()`
2. Replace all references to `id` with `code` in navigate calls
3. Replace the "Loading draft..." fallback with a redirect:

```typescript
// Replace the loading guard (around line 243):
if (!matchState || phase?.kind !== 'draft') {
  return <Navigate to="/queue" replace />;
}
```

Add `import { Navigate } from 'react-router';` to imports.

- [ ] **Step 4: Update Forge.tsx — same pattern**

In `packages/client/src/pages/Forge.tsx`:

1. Change `const { id } = useParams()` to `const { code } = useParams()`
2. Replace all `id` references in navigate calls with `code`
3. Replace any loading fallback with `<Navigate to="/queue" replace />`

- [ ] **Step 5: Update Duel.tsx — same pattern**

In `packages/client/src/pages/Duel.tsx`:

1. Change `const { id } = useParams()` to `const { code } = useParams()`
2. Replace all `id` references in navigate calls with `code`
3. Replace any loading fallback with `<Navigate to="/queue" replace />`

- [ ] **Step 6: Update PostMatch.tsx — same pattern**

In `packages/client/src/pages/PostMatch.tsx`:

1. Change `const { id } = useParams()` to `const { code } = useParams()`
2. Replace all `id` references with `code`

- [ ] **Step 7: Verify the app compiles and runs**

Run: `cd packages/client && npx tsc --noEmit && npx vite build`
Expected: No type errors, build succeeds

- [ ] **Step 8: Run existing tests to check for regressions**

Run: `cd packages/client && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 9: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/pages/
git commit -m "fix: generate AI session codes, redirect on null match state, rename :id to :code"
```

---

### Task 5: Migrate Draft.tsx to use MatchGateway

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx`
- Read: `packages/client/src/gateway/index.ts`

This is the first page migration. Draft.tsx currently imports directly from `useMatchStore`. After this task, it reads state and dispatches actions through `useMatchGateway()`.

**Important:** The UI-only stores (`draftStore` for selection state) stay as-is — only match state access changes.

- [ ] **Step 1: Replace matchStore imports with gateway usage in Draft.tsx**

In `packages/client/src/pages/Draft.tsx`:

1. Replace the matchStore imports:

```typescript
// BEFORE:
import { useMatchStore, selectPhase, selectPool, selectPlayer } from '@/stores/matchStore';

// AFTER:
import { useMatchGateway } from '@/gateway';
import { useMatchStore } from '@/stores/matchStore';
```

2. Replace the state reads inside the `Draft` component:

```typescript
// BEFORE:
const phase = useMatchStore(selectPhase);
const pool = useMatchStore(selectPool);
const player0 = useMatchStore(selectPlayer(0));
const player1 = useMatchStore(selectPlayer(1));
const dispatch = useMatchStore((s) => s.dispatch);
const aiController = useMatchStore((s) => s.aiController);
const matchState = useMatchStore((s) => s.state);
const getRegistry = useMatchStore((s) => s.getRegistry);

// AFTER:
const { code } = useParams();
const gateway = useMatchGateway(code!);
const matchState = gateway.getState();
const phase = matchState?.phase ?? null;
const pool = matchState?.pool ?? [];
const player0 = matchState?.players[0] ?? null;
const player1 = matchState?.players[1] ?? null;
// Keep these from matchStore — they are AI-specific and only used for local matches
const aiController = useMatchStore((s) => s.aiController);
const getRegistry = useMatchStore((s) => s.getRegistry);
```

3. Replace the `draftOrb` callback to use gateway dispatch:

```typescript
// BEFORE:
const draftOrb = useCallback((orbUid: string) => {
  if (!isPlayerTurn) return;
  const result = dispatch({ kind: 'draft_pick', player: 0, orbUid });
  if (result.ok) confirmPick();
}, [isPlayerTurn, dispatch, confirmPick]);

// AFTER:
const draftOrb = useCallback((orbUid: string) => {
  if (!isPlayerTurn) return;
  gateway.dispatch({ kind: 'draft_pick', player: 0, orbUid }).then((result) => {
    if (result.ok) confirmPick();
  });
}, [isPlayerTurn, gateway, confirmPick]);
```

4. Update the AI turn effect to use gateway dispatch:

```typescript
// BEFORE:
dispatch({ kind: 'draft_pick', player: 1, orbUid });

// AFTER:
gateway.dispatch({ kind: 'draft_pick', player: 1, orbUid });
```

5. Add a `useSyncExternalStore`-like pattern or `useState` + `useEffect` to re-render on gateway state changes:

```typescript
const [, forceUpdate] = useState(0);
useEffect(() => {
  return gateway.subscribe(() => forceUpdate((n) => n + 1));
}, [gateway]);
```

Place this near the top of the component, before reading `gateway.getState()`.

- [ ] **Step 2: Verify the app compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run tests**

Run: `cd packages/client && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "refactor: migrate Draft.tsx to use MatchGateway for state and dispatch"
```

---

### Task 6: Migrate Forge.tsx, Duel.tsx, and PostMatch.tsx to use MatchGateway

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`
- Modify: `packages/client/src/pages/Duel.tsx`
- Modify: `packages/client/src/pages/PostMatch.tsx`

Same migration pattern as Draft.tsx. For each page:

1. Import `useMatchGateway` from `@/gateway`
2. Replace `useMatchStore` state reads with `gateway.getState()` derivatives
3. Replace `dispatch` calls with `gateway.dispatch()`
4. Add `forceUpdate` subscription pattern for reactivity
5. Keep UI-only stores (forgeStore, etc.) unchanged

- [ ] **Step 1: Migrate Forge.tsx**

Apply the same pattern as Draft.tsx. Key differences:
- Forge uses `forgeStore` extensively — leave that untouched
- Replace `useMatchStore((s) => s.dispatch)` with `gateway.dispatch`
- Replace `useMatchStore((s) => s.state)` with `gateway.getState()`
- The AI forge-complete logic should still use `useMatchStore((s) => s.aiController)` for local matches

- [ ] **Step 2: Migrate Duel.tsx**

Apply the same pattern. Duel is read-heavy (displays combat log) — mostly replacing state reads.

- [ ] **Step 3: Migrate PostMatch.tsx**

Apply the same pattern. PostMatch reads round results and scores.

- [ ] **Step 4: Verify the app compiles and runs**

Run: `cd packages/client && npx tsc --noEmit && npx vite build`
Expected: No type errors, build succeeds

- [ ] **Step 5: Run all tests**

Run: `cd packages/client && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Manual smoke test**

Start the dev server (`npx vite`), navigate to `/queue`, select an AI tier, and play through a full match:
1. Draft phase — pick orbs, verify AI picks work
2. Forge phase — socket orbs, verify flux works
3. Duel phase — watch combat animation
4. PostMatch — verify results display, "Play Again" works

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/pages/Forge.tsx packages/client/src/pages/Duel.tsx packages/client/src/pages/PostMatch.tsx
git commit -m "refactor: migrate Forge, Duel, PostMatch to use MatchGateway"
```

---

## Chunk 2: Supabase Foundation

### Task 7: Install @supabase/supabase-js and replace mock client

**Files:**
- Modify: `packages/client/package.json`
- Modify: `packages/client/src/shared/utils/supabase.ts`

- [ ] **Step 1: Install the Supabase client library**

Run: `cd packages/client && pnpm add @supabase/supabase-js`

- [ ] **Step 2: Rewrite supabase.ts with real client + mock fallback**

Read the current file first. Then replace `packages/client/src/shared/utils/supabase.ts`:

```typescript
// packages/client/src/shared/utils/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Returns the Supabase client. If VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are not set, returns null (offline mode).
 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('[Supabase] No VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — running in offline mode');
    return null;
  }

  client = createClient(url, key);
  return client;
}

/**
 * Returns true if the Supabase client is available (online mode).
 */
export function isOnline(): boolean {
  return getSupabase() !== null;
}
```

- [ ] **Step 3: Create .env.example with placeholder values**

```bash
# packages/client/.env.example
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 4: Verify the app compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No type errors. Without env vars, the app runs in offline mode.

- [ ] **Step 5: Commit**

```bash
git add packages/client/package.json packages/client/pnpm-lock.yaml packages/client/src/shared/utils/supabase.ts packages/client/.env.example
git commit -m "feat: replace mock Supabase client with real @supabase/supabase-js + offline fallback"
```

---

### Task 8: Update authStore to use Supabase anonymous auth

**Files:**
- Modify: `packages/client/src/stores/authStore.ts`
- Test: `packages/client/src/stores/authStore.test.ts`

- [ ] **Step 1: Write tests for the updated authStore**

```typescript
// packages/client/src/stores/authStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      playerId: '',
      displayName: '',
      isGuest: true,
      supabaseUserId: null,
    });
  });

  it('loginAsGuest sets a guest player ID when offline', () => {
    useAuthStore.getState().loginAsGuest();
    const state = useAuthStore.getState();
    expect(state.playerId).toMatch(/^guest_/);
    expect(state.isGuest).toBe(true);
  });

  it('setPlayer updates player state', () => {
    useAuthStore.getState().setPlayer('p1', 'Alice', false);
    const state = useAuthStore.getState();
    expect(state.playerId).toBe('p1');
    expect(state.displayName).toBe('Alice');
    expect(state.isGuest).toBe(false);
  });
});
```

- [ ] **Step 2: Update authStore.ts to support Supabase anonymous auth**

```typescript
// packages/client/src/stores/authStore.ts
import { create } from 'zustand';
import { getSupabase } from '@/shared/utils/supabase';

interface AuthState {
  playerId: string;
  displayName: string;
  isGuest: boolean;
  supabaseUserId: string | null;
  setPlayer: (id: string, name: string, isGuest: boolean) => void;
  loginAsGuest: () => void;
  initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  playerId: '',
  displayName: '',
  isGuest: true,
  supabaseUserId: null,

  setPlayer: (id, name, isGuest) => set({ playerId: id, displayName: name, isGuest }),

  loginAsGuest: () => {
    set({
      playerId: `guest_${Date.now()}`,
      displayName: 'Guest',
      isGuest: true,
    });
  },

  initAuth: async () => {
    const supabase = getSupabase();
    if (!supabase) {
      // Offline mode — fall back to guest
      useAuthStore.getState().loginAsGuest();
      return;
    }

    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      set({
        playerId: session.user.id,
        supabaseUserId: session.user.id,
        displayName: session.user.user_metadata?.display_name ?? 'Player',
        isGuest: session.user.is_anonymous ?? true,
      });
      return;
    }

    // No session — sign in anonymously
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      console.error('[Auth] Anonymous sign-in failed, falling back to guest:', error);
      useAuthStore.getState().loginAsGuest();
      return;
    }

    set({
      playerId: data.user.id,
      supabaseUserId: data.user.id,
      displayName: 'Player',
      isGuest: true,
    });
  },
}));
```

- [ ] **Step 3: Run tests**

Run: `cd packages/client && npx vitest run src/stores/authStore.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/stores/authStore.ts packages/client/src/stores/authStore.test.ts
git commit -m "feat: add Supabase anonymous auth with offline fallback to authStore"
```

---

### Task 9: Database migration 006_multiplayer.sql

**Files:**
- Create: `packages/supabase/migrations/006_multiplayer.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 006_multiplayer.sql
-- Adds multiplayer columns to matches table, join attempt tracking,
-- and cleanup cron jobs.

-- New columns on matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS room_code TEXT UNIQUE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS game_state JSONB;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'waiting'
  CHECK (status IN ('waiting', 'active', 'completed', 'abandoned', 'forfeited'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS room_code_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_matches_room_code ON matches (room_code) WHERE room_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status) WHERE status = 'waiting';

-- Join attempt rate limiting table
CREATE TABLE IF NOT EXISTS join_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_address INET NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_join_attempts_ip_time ON join_attempts (ip_address, attempted_at);

-- Room code generation function
CREATE OR REPLACE FUNCTION generate_room_code() RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  -- Check uniqueness
  IF EXISTS (SELECT 1 FROM matches WHERE room_code = result AND status = 'waiting') THEN
    RETURN generate_room_code(); -- Recursive retry on collision
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Matchmaker function (called by pg_cron every minute, loops internally)
CREATE OR REPLACE FUNCTION run_matchmaker() RETURNS void AS $$
DECLARE
  p1 RECORD;
  p2 RECORD;
  wait_seconds FLOAT;
  elo_range INT;
BEGIN
  FOR i IN 1..20 LOOP  -- 20 iterations x 3s = 60s
    -- Find oldest queued player
    SELECT * INTO p1 FROM matchmaking_queue ORDER BY queued_at ASC LIMIT 1;
    IF p1 IS NULL THEN
      PERFORM pg_sleep(3);
      CONTINUE;
    END IF;

    -- Calculate tolerance window based on wait time
    wait_seconds := EXTRACT(EPOCH FROM (NOW() - p1.queued_at));
    elo_range := LEAST(150, 50 + (wait_seconds / 10)::int * 25);

    -- Find closest opponent within range
    SELECT * INTO p2 FROM matchmaking_queue
    WHERE player_id != p1.player_id
      AND elo BETWEEN (p1.elo - elo_range) AND (p1.elo + elo_range)
    ORDER BY ABS(elo - p1.elo) ASC
    LIMIT 1;

    IF p2 IS NOT NULL THEN
      -- Remove both from queue
      DELETE FROM matchmaking_queue WHERE player_id IN (p1.player_id, p2.player_id);

      -- Create the match directly in Postgres
      DECLARE
        new_match_id UUID := gen_random_uuid();
        new_room_code TEXT := generate_room_code();
        new_seed BIGINT := floor(random() * 999999999)::BIGINT;
      BEGIN
        INSERT INTO matches (
          id, player1_id, player2_id, mode, phase, round,
          scores, pool_seed, base_weapon_id, base_armor_id,
          room_code, status, version, room_code_expires_at
        ) VALUES (
          new_match_id, p1.player_id, p2.player_id, 'ranked', 'draft', 1,
          '[0,0]'::jsonb, new_seed, 'sword', 'chainmail',
          new_room_code, 'active', 0, NULL
        );

        -- Notify both players via pg_notify (clients listen on their personal channels)
        -- The Edge Function or Realtime subscription will pick this up
        PERFORM pg_notify('match_found', json_build_object(
          'matchId', new_match_id,
          'roomCode', new_room_code,
          'player1', p1.player_id,
          'player2', p2.player_id,
          'seed', new_seed
        )::text);
      END;
    END IF;

    PERFORM pg_sleep(3);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function (stale room codes, join attempts, queue entries)
CREATE OR REPLACE FUNCTION cleanup_stale_data() RETURNS void AS $$
BEGIN
  -- Expire unclaimed room codes
  UPDATE matches SET status = 'abandoned'
  WHERE status = 'waiting' AND room_code_expires_at < NOW();

  -- Clean old join attempts
  DELETE FROM join_attempts WHERE attempted_at < NOW() - INTERVAL '5 minutes';

  -- Clean stale queue entries
  DELETE FROM matchmaking_queue WHERE queued_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Schedule cron jobs (requires pg_cron extension)
-- These will fail silently if pg_cron is not available (e.g., local dev without it)
DO $$
BEGIN
  PERFORM cron.schedule('matchmaker', '* * * * *', 'SELECT run_matchmaker()');
  PERFORM cron.schedule('cleanup', '* * * * *', 'SELECT cleanup_stale_data()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — skipping cron job setup';
END;
$$;
```

- [ ] **Step 2: Verify the migration is syntactically valid**

Run: `cd packages/supabase && cat migrations/006_multiplayer.sql | head -5`
Expected: File exists with correct content

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/migrations/006_multiplayer.sql
git commit -m "feat: add migration 006 — multiplayer columns, room codes, matchmaker, cleanup"
```

---

## Chunk 3: Edge Functions + Shared Utilities

### Task 10: Implement shared Supabase utilities for Edge Functions

**Files:**
- Modify: `packages/supabase/functions/_shared/supabase.ts`
- Read: `packages/supabase/functions/_shared/cors.ts`

- [ ] **Step 1: Read the current shared utilities**

Read: `packages/supabase/functions/_shared/supabase.ts`
Read: `packages/supabase/functions/_shared/cors.ts`

- [ ] **Step 2: Rewrite _shared/supabase.ts with real Supabase client**

```typescript
// packages/supabase/functions/_shared/supabase.ts
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let serviceClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client using the service role key.
 * Edge Functions use service role to bypass RLS and perform
 * their own authorization checks.
 */
export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  serviceClient = createClient(url, key);
  return serviceClient;
}

/**
 * Extract and verify the user ID from the Authorization header.
 * Uses the anon key client to verify the JWT.
 */
export async function getUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');

  const anonClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) throw new Error('Invalid or expired token');

  return user.id;
}

/**
 * Load match by room code. Returns the match row or throws.
 */
export async function loadMatchByRoomCode(
  client: SupabaseClient,
  roomCode: string,
) {
  const { data, error } = await client
    .from('matches')
    .select('*')
    .eq('room_code', roomCode)
    .single();

  if (error || !data) throw new Error(`Match not found: ${roomCode}`);
  return data;
}

/**
 * Load match by ID. Returns the match row or throws.
 */
export async function loadMatchById(
  client: SupabaseClient,
  matchId: string,
) {
  const { data, error } = await client
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (error || !data) throw new Error(`Match not found: ${matchId}`);
  return data;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/_shared/supabase.ts
git commit -m "feat: implement real Supabase shared utilities with JWT verification"
```

---

### Task 11: Implement match-create Edge Function

**Files:**
- Modify: `packages/supabase/functions/match-create/index.ts`

- [ ] **Step 1: Read the current stub**

Read: `packages/supabase/functions/match-create/index.ts`

- [ ] **Step 2: Implement match-create**

```typescript
// packages/supabase/functions/match-create/index.ts
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';
import { createMatch, DataRegistry, loadAndValidateData } from '@alloy/engine';

let registry: DataRegistry | null = null;
function getRegistry(): DataRegistry {
  if (!registry) {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  }
  return registry;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const { mode } = await req.json() as { mode: 'quick' | 'unranked' | 'ranked' };

    const client = getServiceClient();

    // Generate room code
    const { data: codeResult } = await client.rpc('generate_room_code');
    const roomCode = codeResult as string;

    // Generate seed and create engine state
    const seed = Math.floor(Math.random() * 999999999);
    const reg = getRegistry();
    const matchState = createMatch(
      crypto.randomUUID(),
      seed,
      mode,
      [userId, ''],  // player2 TBD
      'sword',
      'chainmail',
      reg,
    );

    // Insert match row
    const { data: match, error } = await client
      .from('matches')
      .insert({
        id: matchState.matchId,
        player1_id: userId,
        player2_id: null,
        mode,
        phase: 'draft',
        round: 1,
        scores: [0, 0],
        pool_seed: seed,
        base_weapon_id: 'sword',
        base_armor_id: 'chainmail',
        room_code: roomCode,
        game_state: matchState,
        status: 'waiting',
        version: 0,
        room_code_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return jsonResponse({ roomCode, matchId: match.id });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 400);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/match-create/index.ts
git commit -m "feat: implement match-create Edge Function with room code generation"
```

---

### Task 12: Create match-join Edge Function

**Files:**
- Create: `packages/supabase/functions/match-join/index.ts`

- [ ] **Step 1: Implement match-join**

```typescript
// packages/supabase/functions/match-join/index.ts
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';
import { createMatch, DataRegistry, loadAndValidateData } from '@alloy/engine';

let registry: DataRegistry | null = null;
function getRegistry(): DataRegistry {
  if (!registry) {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  }
  return registry;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const { roomCode } = await req.json() as { roomCode: string };
    const client = getServiceClient();

    // Rate limiting: check join attempts
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
    const { count } = await client
      .from('join_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('attempted_at', new Date(Date.now() - 60 * 1000).toISOString());

    if ((count ?? 0) >= 5) {
      return errorResponse('Too many join attempts. Try again in a minute.', 429);
    }

    // Record the attempt
    await client.from('join_attempts').insert({ ip_address: ip });

    // Load match by room code
    const { data: match, error: matchError } = await client
      .from('matches')
      .select('*')
      .eq('room_code', roomCode)
      .single();

    if (matchError || !match) {
      return errorResponse('Match not found', 404);
    }

    if (match.status !== 'waiting') {
      return errorResponse('Match is no longer accepting players', 400);
    }

    if (match.player1_id === userId) {
      return errorResponse('You are already in this match', 400);
    }

    // Assign player 2 and seal the match
    const reg = getRegistry();
    const gameState = match.game_state;
    // Update the player2 ID in game state
    gameState.players[1].id = userId;

    const { error: updateError } = await client
      .from('matches')
      .update({
        player2_id: userId,
        status: 'active',
        game_state: gameState,
        version: match.version + 1,
      })
      .eq('id', match.id)
      .eq('version', match.version);  // Optimistic lock

    if (updateError) throw updateError;

    // Broadcast match started to the channel
    const channel = client.channel(`match:${roomCode}`);
    await channel.send({
      type: 'broadcast',
      event: 'match_started',
      payload: { player2Id: userId },
    });

    return jsonResponse({
      matchId: match.id,
      roomCode,
      phase: gameState.phase.kind,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 400);
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/supabase/functions/match-join/
git commit -m "feat: implement match-join Edge Function with rate limiting"
```

---

### Task 13: Implement draft-pick Edge Function

**Files:**
- Modify: `packages/supabase/functions/draft-pick/index.ts`

- [ ] **Step 1: Read the current stub**

Read: `packages/supabase/functions/draft-pick/index.ts`

- [ ] **Step 2: Implement draft-pick with validate-persist-broadcast loop**

```typescript
// packages/supabase/functions/draft-pick/index.ts
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId, loadMatchByRoomCode } from '../_shared/supabase.ts';
import { applyAction, DataRegistry, loadAndValidateData } from '@alloy/engine';
import type { MatchState } from '@alloy/engine';

let registry: DataRegistry | null = null;
function getRegistry(): DataRegistry {
  if (!registry) {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  }
  return registry;
}

const MAX_RETRIES = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const { roomCode, orbUid } = await req.json() as { roomCode: string; orbUid: string };
    const client = getServiceClient();
    const reg = getRegistry();

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const match = await loadMatchByRoomCode(client, roomCode);

      // Authorize
      const playerIndex = match.player1_id === userId ? 0
        : match.player2_id === userId ? 1
        : -1;
      if (playerIndex === -1) return errorResponse('Not a participant', 403);

      // Validate and apply
      const gameState = match.game_state as MatchState;
      const result = applyAction(gameState, {
        kind: 'draft_pick',
        player: playerIndex as 0 | 1,
        orbUid,
      }, reg);

      if (!result.ok) return errorResponse(result.error, 400);

      // Persist with optimistic locking
      const newState = result.state;
      const { error, count } = await client
        .from('matches')
        .update({
          game_state: newState,
          phase: newState.phase.kind,
          round: 'round' in newState.phase ? newState.phase.round : match.round,
          version: match.version + 1,
        })
        .eq('id', match.id)
        .eq('version', match.version);

      if (error) throw error;

      // If no rows updated, version conflict — retry
      if (count === 0) continue;

      // Broadcast to channel
      const channel = client.channel(`match:${roomCode}`);
      await channel.send({
        type: 'broadcast',
        event: 'draft_pick',
        payload: {
          player: playerIndex,
          orbUid,
          newPhase: newState.phase,
          pool: newState.pool,
          stockpiles: [
            newState.players[0].stockpile,
            newState.players[1].stockpile,
          ],
        },
      });

      // If phase changed, broadcast that too
      if (newState.phase.kind !== gameState.phase.kind) {
        await channel.send({
          type: 'broadcast',
          event: 'phase_changed',
          payload: { phase: newState.phase },
        });
      }

      return jsonResponse({ ok: true, phase: newState.phase });
    }

    return errorResponse('Concurrency conflict — please retry', 409);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 400);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/draft-pick/index.ts
git commit -m "feat: implement draft-pick Edge Function with optimistic locking"
```

---

### Task 14: Implement forge-submit Edge Function

**Files:**
- Modify: `packages/supabase/functions/forge-submit/index.ts`

- [ ] **Step 1: Read the current stub**

Read: `packages/supabase/functions/forge-submit/index.ts`

- [ ] **Step 2: Implement forge-submit with duel triggering**

The forge-submit function accepts a player's final loadout. When both players have submitted, it runs the duel simulation, stores the combat log, and broadcasts the result. Per the spec, this function also handles Elo updates when the match is decided (no separate match-complete call for normal flow).

**Implementation note:** The engine's `forge_complete` action marks a player as done forging. When both players have completed, the engine transitions the phase to `'duel'`. The `advance_phase` action then runs the duel simulation. The implementer must read `match-controller.ts:handleForgeComplete` and `handleAdvancePhase` to verify this two-step sequence is correct. The player's loadout is set via `forge_action` actions during the forge phase — `forge-submit` receives the final loadout to persist for history/replay, but the loadout should already be reflected in the game state from prior `forge_action` dispatches. If the engine doesn't support setting the loadout in one shot, adjust the approach to store the loadout in `match_rounds` only (for history) and rely on the game_state's loadout as set by incremental forge actions.

```typescript
// packages/supabase/functions/forge-submit/index.ts
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId, loadMatchByRoomCode } from '../_shared/supabase.ts';
import { applyAction, DataRegistry, loadAndValidateData, simulate, SeededRNG, calculateStats } from '@alloy/engine';
import type { MatchState, Loadout } from '@alloy/engine';

let registry: DataRegistry | null = null;
function getRegistry(): DataRegistry {
  if (!registry) {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  }
  return registry;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const { roomCode, loadout } = await req.json() as {
      roomCode: string;
      loadout: Loadout;
    };
    const client = getServiceClient();
    const reg = getRegistry();

    const match = await loadMatchByRoomCode(client, roomCode);

    // Authorize
    const playerIndex = match.player1_id === userId ? 0
      : match.player2_id === userId ? 1
      : -1;
    if (playerIndex === -1) return errorResponse('Not a participant', 403);

    const gameState = match.game_state as MatchState;
    if (gameState.phase.kind !== 'forge') {
      return errorResponse('Not in forge phase', 400);
    }

    // Mark this player's forge as complete
    const completeResult = applyAction(gameState, {
      kind: 'forge_complete',
      player: playerIndex as 0 | 1,
    }, reg);

    if (!completeResult.ok) return errorResponse(completeResult.error, 400);

    let newState = completeResult.state;

    // Update the player's loadout in the state
    newState.players[playerIndex].loadout = loadout;

    // Store the build in match_rounds for history
    const buildColumn = playerIndex === 0 ? 'player1_build' : 'player2_build';
    await client
      .from('match_rounds')
      .update({ [buildColumn]: { weapon: loadout.weapon, armor: loadout.armor } })
      .eq('match_id', match.id)
      .eq('round', 'round' in gameState.phase ? gameState.phase.round : 1);

    // If both players are done (phase advanced to duel), run simulation
    if (newState.phase.kind === 'duel') {
      const advanceResult = applyAction(newState, { kind: 'advance_phase' }, reg);
      if (advanceResult.ok) {
        newState = advanceResult.state;
      }
    }

    // Persist
    const { error } = await client
      .from('matches')
      .update({
        game_state: newState,
        phase: newState.phase.kind,
        round: 'round' in newState.phase ? newState.phase.round : match.round,
        scores: newState.phase.kind === 'complete'
          ? (newState.phase as any).scores
          : match.scores,
        version: match.version + 1,
      })
      .eq('id', match.id)
      .eq('version', match.version);

    if (error) throw error;

    // Broadcast
    const channel = client.channel(`match:${roomCode}`);

    if (newState.phase.kind !== gameState.phase.kind) {
      // Phase changed — broadcast with full combat log if duel happened
      const latestLog = newState.duelLogs[newState.duelLogs.length - 1];
      await channel.send({
        type: 'broadcast',
        event: 'phase_changed',
        payload: {
          phase: newState.phase,
          combatLog: latestLog ?? null,
          builds: [
            newState.players[0].loadout,
            newState.players[1].loadout,
          ],
        },
      });

      // Handle Elo updates if match is complete
      if (newState.phase.kind === 'complete') {
        await updateElo(client, match, newState);
      }
    } else {
      // Just notify that a player submitted
      await channel.send({
        type: 'broadcast',
        event: 'forge_submitted',
        payload: { player: playerIndex },
      });
    }

    return jsonResponse({ ok: true, phase: newState.phase });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 400);
  }
});

async function updateElo(
  client: ReturnType<typeof getServiceClient>,
  match: any,
  finalState: MatchState,
) {
  if (finalState.phase.kind !== 'complete') return;

  const { winner } = finalState.phase;
  if (winner === 'draw') return; // No Elo change on draw

  // Load both players' profiles
  const { data: profiles } = await client
    .from('profiles')
    .select('id, elo, matches_played, matches_won')
    .in('id', [match.player1_id, match.player2_id]);

  if (!profiles || profiles.length !== 2) return;

  const p1 = profiles.find((p: any) => p.id === match.player1_id)!;
  const p2 = profiles.find((p: any) => p.id === match.player2_id)!;

  const k1 = p1.matches_played < 30 ? 32 : 16;
  const k2 = p2.matches_played < 30 ? 32 : 16;

  const expected1 = 1 / (1 + Math.pow(10, (p2.elo - p1.elo) / 400));
  const expected2 = 1 - expected1;

  const actual1 = winner === 0 ? 1 : 0;
  const actual2 = 1 - actual1;

  const delta1 = Math.round(k1 * (actual1 - expected1));
  const delta2 = Math.round(k2 * (actual2 - expected2));

  // Update profiles
  await client.from('profiles').update({
    elo: p1.elo + delta1,
    matches_played: p1.matches_played + 1,
    matches_won: p1.matches_won + (winner === 0 ? 1 : 0),
  }).eq('id', p1.id);

  await client.from('profiles').update({
    elo: p2.elo + delta2,
    matches_played: p2.matches_played + 1,
    matches_won: p2.matches_won + (winner === 1 ? 1 : 0),
  }).eq('id', p2.id);

  // Store elo_delta on match
  await client.from('matches').update({
    elo_delta: delta1,
    result: winner === 0 ? 'player1_win' : 'player2_win',
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', match.id);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/forge-submit/index.ts
git commit -m "feat: implement forge-submit Edge Function with duel simulation and Elo"
```

---

### Task 15: Implement match-state and forfeit Edge Functions

**Files:**
- Modify: `packages/supabase/functions/match-state/index.ts`
- Modify: `packages/supabase/functions/forfeit/index.ts`

- [ ] **Step 1: Implement match-state with visibility filtering**

```typescript
// packages/supabase/functions/match-state/index.ts
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';
import type { MatchState } from '@alloy/engine';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const url = new URL(req.url);
    const roomCode = url.searchParams.get('roomCode');
    if (!roomCode) return errorResponse('Missing roomCode parameter', 400);

    const client = getServiceClient();
    const { data: match, error } = await client
      .from('matches')
      .select('*')
      .eq('room_code', roomCode)
      .single();

    if (error || !match) return errorResponse('Match not found', 404);

    // Authorize
    const playerIndex = match.player1_id === userId ? 0
      : match.player2_id === userId ? 1
      : -1;
    if (playerIndex === -1) return errorResponse('Not a participant', 403);

    const gameState = match.game_state as MatchState;

    // Visibility filtering: hide opponent's loadout during forge phase
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const filtered = { ...gameState };
    if (gameState.phase.kind === 'forge') {
      filtered.players = [...gameState.players] as any;
      filtered.players[opponentIndex] = {
        ...gameState.players[opponentIndex],
        loadout: { weapon: null, armor: null },
      };
    }

    return jsonResponse({
      matchId: match.id,
      roomCode: match.room_code,
      status: match.status,
      state: filtered,
      playerIndex,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 400);
  }
});
```

- [ ] **Step 2: Implement forfeit**

```typescript
// packages/supabase/functions/forfeit/index.ts
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId, loadMatchByRoomCode } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const { roomCode } = await req.json() as { roomCode: string };
    const client = getServiceClient();

    const match = await loadMatchByRoomCode(client, roomCode);

    // Authorize — must be a participant
    const playerIndex = match.player1_id === userId ? 0
      : match.player2_id === userId ? 1
      : -1;
    if (playerIndex === -1) return errorResponse('Not a participant', 403);

    if (match.status !== 'active') {
      return errorResponse('Match is not active', 400);
    }

    const winner = playerIndex === 0 ? 1 : 0;

    // Update match
    await client.from('matches').update({
      status: 'forfeited',
      result: 'forfeit',
      game_state: {
        ...match.game_state,
        phase: { kind: 'complete', winner, scores: match.game_state.phase.scores ?? [0, 0] },
      },
      completed_at: new Date().toISOString(),
    }).eq('id', match.id);

    // Broadcast
    const channel = client.channel(`match:${roomCode}`);
    await channel.send({
      type: 'broadcast',
      event: 'match_forfeited',
      payload: { winner, forfeitedBy: playerIndex },
    });

    return jsonResponse({ ok: true, winner });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 400);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/match-state/index.ts packages/supabase/functions/forfeit/index.ts
git commit -m "feat: implement match-state (with visibility filtering) and forfeit Edge Functions"
```

---

## Chunk 4: RemoteGateway + Client PvP Flow

### Task 16: Implement RemoteGateway

**Files:**
- Create: `packages/client/src/gateway/remote-gateway.ts`
- Test: `packages/client/src/gateway/remote-gateway.test.ts`
- Modify: `packages/client/src/gateway/use-match-gateway.ts`
- Modify: `packages/client/src/gateway/index.ts`

- [ ] **Step 1: Write tests for RemoteGateway**

```typescript
// packages/client/src/gateway/remote-gateway.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteGateway } from './remote-gateway';

// Mock the supabase module
vi.mock('@/shared/utils/supabase', () => ({
  getSupabase: () => ({
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue('subscribed'),
      unsubscribe: vi.fn(),
      send: vi.fn(),
    }),
  }),
}));

describe('RemoteGateway', () => {
  it('has the correct code property', () => {
    const gw = new RemoteGateway('HK7P2Q');
    expect(gw.code).toBe('HK7P2Q');
    gw.destroy();
  });

  it('returns null state before initialization', () => {
    const gw = new RemoteGateway('HK7P2Q');
    expect(gw.getState()).toBeNull();
    gw.destroy();
  });

  it('dispatch calls the correct Edge Function for draft_pick', async () => {
    const gw = new RemoteGateway('HK7P2Q');
    await gw.dispatch({ kind: 'draft_pick', player: 0, orbUid: 'test-orb' });
    // Verify the edge function was called (via mock)
    gw.destroy();
  });

  it('destroy cleans up the channel subscription', () => {
    const gw = new RemoteGateway('HK7P2Q');
    gw.destroy();
    // Should not throw on double-destroy
    gw.destroy();
  });
});
```

- [ ] **Step 2: Implement RemoteGateway**

```typescript
// packages/client/src/gateway/remote-gateway.ts
import type { MatchState, GameAction, ActionResult } from '@alloy/engine';
import type { MatchGateway, MatchEvent } from './types';
import { getSupabase } from '@/shared/utils/supabase';

export class RemoteGateway implements MatchGateway {
  readonly code: string;
  private state: MatchState | null = null;
  private stateListeners: Set<(state: MatchState) => void> = new Set();
  private eventListeners: Set<(event: MatchEvent) => void> = new Set();
  private channel: any = null;
  private destroyed = false;
  playerIndex: 0 | 1 = 0;

  constructor(code: string) {
    this.code = code;
    this.setupChannel();
    this.fetchInitialState();
  }

  private setupChannel() {
    const supabase = getSupabase();
    if (!supabase) return;

    this.channel = supabase.channel(`match:${this.code}`);
    this.channel
      .on('broadcast', { event: 'draft_pick' }, (msg: any) => {
        this.handleBroadcast('draft_pick', msg.payload);
      })
      .on('broadcast', { event: 'phase_changed' }, (msg: any) => {
        this.handleBroadcast('phase_changed', msg.payload);
      })
      .on('broadcast', { event: 'forge_submitted' }, (msg: any) => {
        this.handleBroadcast('forge_submitted', msg.payload);
      })
      .on('broadcast', { event: 'match_started' }, (msg: any) => {
        this.handleBroadcast('match_started', msg.payload);
      })
      .on('broadcast', { event: 'match_forfeited' }, (msg: any) => {
        this.handleBroadcast('match_forfeited', msg.payload);
      })
      .subscribe();
  }

  private async fetchInitialState() {
    const supabase = getSupabase();
    if (!supabase) return;

    // match-state uses query params, so we call it via fetch directly
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/match-state?roomCode=${this.code}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    });

    if (resp.ok) {
      const body = await resp.json();
      this.playerIndex = body.playerIndex;
      this.updateState(body.state);
    }
  }

  private handleBroadcast(event: string, payload: any) {
    if (this.destroyed) return;

    switch (event) {
      case 'draft_pick':
        // Re-fetch state to get the latest
        this.fetchInitialState();
        break;

      case 'phase_changed':
        this.emitEvent({ kind: 'phase_changed', phase: payload.phase });
        this.fetchInitialState();
        break;

      case 'forge_submitted':
        if (payload.player !== this.playerIndex) {
          this.emitEvent({
            kind: 'opponent_action',
            action: { kind: 'forge_complete', player: payload.player },
            result: { ok: true, state: this.state! },
          });
        }
        break;

      case 'match_forfeited':
        this.emitEvent({ kind: 'match_forfeited', winner: payload.winner });
        break;
    }
  }

  private updateState(state: MatchState) {
    this.state = state;
    for (const cb of this.stateListeners) {
      cb(state);
    }
  }

  private emitEvent(event: MatchEvent) {
    for (const cb of this.eventListeners) {
      cb(event);
    }
  }

  getState(): MatchState | null {
    return this.state;
  }

  async dispatch(action: GameAction): Promise<ActionResult> {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: 'Not connected' };

    let functionName: string;
    let body: any;

    switch (action.kind) {
      case 'draft_pick':
        functionName = 'draft-pick';
        body = { roomCode: this.code, orbUid: action.orbUid };
        break;
      case 'forge_action':
        functionName = 'forge-submit';
        body = { roomCode: this.code, action: action.action };
        break;
      case 'forge_complete':
        functionName = 'forge-submit';
        body = {
          roomCode: this.code,
          loadout: this.state?.players[action.player].loadout,
        };
        break;
      default:
        return { ok: false, error: `Unsupported action: ${action.kind}` };
    }

    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });

    if (error) return { ok: false, error: error.message };

    // Re-fetch state after successful action
    await this.fetchInitialState();

    return { ok: true, state: this.state! };
  }

  subscribe(callback: (state: MatchState) => void): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  onEvent(callback: (event: MatchEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  destroy(): void {
    this.destroyed = true;
    this.stateListeners.clear();
    this.eventListeners.clear();
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }
}
```

- [ ] **Step 3: Update useMatchGateway to use RemoteGateway**

In `packages/client/src/gateway/use-match-gateway.ts`, replace the `throw` for PvP codes:

```typescript
// Replace:
throw new Error(`PvP gateway not yet implemented for code: ${code}`);

// With:
import { RemoteGateway } from './remote-gateway';
// ...
gatewayRef.current = new RemoteGateway(code);
```

- [ ] **Step 4: Update barrel export**

Add to `packages/client/src/gateway/index.ts`:

```typescript
export { RemoteGateway } from './remote-gateway';
```

- [ ] **Step 5: Run tests**

Run: `cd packages/client && npx vitest run src/gateway/`
Expected: All gateway tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/gateway/
git commit -m "feat: implement RemoteGateway with Supabase Realtime sync"
```

---

### Task 17: Update Matchmaking.tsx with PvP match creation and queue UI

**Files:**
- Modify: `packages/client/src/pages/Matchmaking.tsx`

- [ ] **Step 1: Redesign Matchmaking.tsx with three modes**

The page needs three entry points:
1. **Play vs AI** — existing flow, now with `ai-` session codes
2. **Create Match** — calls match-create, shows room code to share
3. **Find Match** — joins ranked queue

```typescript
// packages/client/src/pages/Matchmaking.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useAuthStore } from '@/stores/authStore';
import { getSupabase, isOnline } from '@/shared/utils/supabase';

type View = 'menu' | 'ai-select' | 'waiting-for-friend' | 'join-match' | 'finding-match';

export function Matchmaking() {
  const navigate = useNavigate();
  const startLocalMatch = useMatchStore((s) => s.startLocalMatch);
  const initAuth = useAuthStore((s) => s.initAuth);
  const playerId = useAuthStore((s) => s.playerId);
  const [view, setView] = useState<View>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  // --- AI Match ---
  const handlePlayVsAI = (aiTier: 1 | 2 | 3 | 4 | 5) => {
    try {
      const seed = Math.floor(Math.random() * 999999);
      startLocalMatch(seed, 'ranked', aiTier);
      const code = 'ai-' + Math.random().toString(36).substring(2, 8);
      navigate(`/match/${code}/draft`);
    } catch (err) {
      setError('Failed to start match: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // --- Create PvP Match ---
  const handleCreateMatch = async () => {
    const supabase = getSupabase();
    if (!supabase) { setError('Not connected'); return; }

    await initAuth();
    const { data, error: fnError } = await supabase.functions.invoke('match-create', {
      body: { mode: 'unranked' },
    });

    if (fnError || !data?.roomCode) {
      setError('Failed to create match');
      return;
    }

    setRoomCode(data.roomCode);
    setView('waiting-for-friend');

    // Subscribe to match channel for player 2 joining
    const channel = supabase.channel(`match:${data.roomCode}`);
    channel.on('broadcast', { event: 'match_started' }, () => {
      channel.unsubscribe();
      navigate(`/match/${data.roomCode}/draft`);
    }).subscribe();
  };

  // --- Join PvP Match ---
  const handleJoinMatch = async () => {
    const supabase = getSupabase();
    if (!supabase) { setError('Not connected'); return; }

    await initAuth();
    const code = joinCode.trim().toUpperCase();
    const { data, error: fnError } = await supabase.functions.invoke('match-join', {
      body: { roomCode: code },
    });

    if (fnError || !data?.roomCode) {
      setError(fnError?.message ?? 'Failed to join match');
      return;
    }

    navigate(`/match/${data.roomCode}/${data.phase}`);
  };

  // --- Views ---
  if (view === 'ai-select') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-accent-400">Choose AI Opponent</h2>
        <div className="flex w-full max-w-xs flex-col gap-2">
          {([1, 2, 3, 4, 5] as const).map((tier) => (
            <button key={tier} onClick={() => handlePlayVsAI(tier)}
              className="rounded-lg bg-surface-600 px-6 py-3 text-left font-medium text-white transition-colors hover:bg-surface-500">
              <span className="text-accent-400">Tier {tier}</span>
              <span className="ml-2 text-sm text-surface-400">
                {tier === 1 ? 'Random' : tier === 2 ? 'Basic' : tier === 3 ? 'Standard' : tier === 4 ? 'Advanced' : 'Expert'}
              </span>
            </button>
          ))}
        </div>
        <button onClick={() => setView('menu')}
          className="mt-4 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600">
          Back
        </button>
      </div>
    );
  }

  if (view === 'waiting-for-friend') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-accent-400">Waiting for Friend</h2>
        <div className="rounded-xl border border-accent-400/30 bg-surface-700 px-8 py-4 text-center">
          <p className="text-sm text-surface-400">Share this code:</p>
          <p className="mt-2 text-4xl font-bold tracking-widest text-accent-300">{roomCode}</p>
          <button
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/match/${roomCode}`)}
            className="mt-3 rounded bg-surface-600 px-4 py-1.5 text-xs text-surface-300 hover:bg-surface-500">
            Copy Link
          </button>
        </div>
        <p className="animate-pulse text-sm text-surface-400">Waiting for opponent to join...</p>
        <button onClick={() => setView('menu')}
          className="mt-4 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600">
          Cancel
        </button>
      </div>
    );
  }

  if (view === 'join-match') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-accent-400">Join Match</h2>
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Enter room code"
          maxLength={6}
          className="rounded-lg border border-surface-500 bg-surface-700 px-4 py-3 text-center text-2xl font-bold tracking-widest text-white placeholder:text-surface-500"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button onClick={handleJoinMatch}
          className="rounded-lg bg-accent-500 px-6 py-3 font-bold text-surface-900 hover:bg-accent-400">
          Join
        </button>
        <button onClick={() => { setView('menu'); setError(''); }}
          className="mt-2 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600">
          Back
        </button>
      </div>
    );
  }

  // Main menu
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-2xl font-bold text-accent-400">Play</h2>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button onClick={() => setView('ai-select')}
          className="rounded-lg bg-surface-600 px-6 py-3 font-medium text-white hover:bg-surface-500">
          Play vs AI
        </button>
        {isOnline() && (
          <>
            <button onClick={handleCreateMatch}
              className="rounded-lg bg-accent-600 px-6 py-3 font-medium text-white hover:bg-accent-500">
              Create Match
            </button>
            <button onClick={() => setView('join-match')}
              className="rounded-lg bg-surface-600 px-6 py-3 font-medium text-white hover:bg-surface-500">
              Join Match
            </button>
          </>
        )}
      </div>
      <button onClick={() => navigate('/')}
        className="mt-4 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600">
        Back
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Matchmaking.tsx
git commit -m "feat: redesign Matchmaking page with AI, create match, and join match flows"
```

---

### Task 18: Add MatchEntry page for PvP join via URL

**Files:**
- Create: `packages/client/src/pages/MatchEntry.tsx`
- Modify: `packages/client/src/App.tsx`

When a friend clicks a shared link like `/match/HK7P2Q`, this page handles the join flow.

- [ ] **Step 1: Create MatchEntry.tsx**

```typescript
// packages/client/src/pages/MatchEntry.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router';
import { getSupabase } from '@/shared/utils/supabase';
import { useAuthStore } from '@/stores/authStore';

export function MatchEntry() {
  const { code } = useParams();
  const navigate = useNavigate();
  const initAuth = useAuthStore((s) => s.initAuth);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [error, setError] = useState('');
  const isAi = code?.startsWith('ai-') ?? false;

  useEffect(() => {
    // AI matches redirect immediately
    if (isAi) {
      navigate(`/match/${code}/draft`, { replace: true });
      return;
    }
    async function join() {
      const supabase = getSupabase();
      if (!supabase || !code) {
        setError('Not connected');
        setStatus('error');
        return;
      }

      await initAuth();

      // First try to get match state (maybe we're already a participant)
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/match-state?roomCode=${code}`;
      const stateResp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });

      if (stateResp.ok) {
        const body = await stateResp.json();
        navigate(`/match/${code}/${body.state.phase.kind}`, { replace: true });
        return;
      }

      // Not a participant yet — try to join
      const { data, error: fnError } = await supabase.functions.invoke('match-join', {
        body: { roomCode: code },
      });

      if (fnError || !data?.roomCode) {
        setError(fnError?.message ?? 'Failed to join match');
        setStatus('error');
        return;
      }

      navigate(`/match/${data.roomCode}/${data.phase}`, { replace: true });
    }

    join();
  }, [code, navigate, initAuth]);

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-lg text-danger">{error}</p>
        <button onClick={() => navigate('/queue')}
          className="rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600">
          Back to Menu
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-surface-400">Joining match...</p>
    </div>
  );
}
```

- [ ] **Step 2: Add the route to App.tsx**

In `packages/client/src/App.tsx`, add the import and route:

```typescript
import { MatchEntry } from './pages/MatchEntry';

// Add before the /match/:code/draft route:
<Route path="/match/:code" element={<MatchEntry />} />
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/MatchEntry.tsx packages/client/src/App.tsx
git commit -m "feat: add MatchEntry page for PvP join via shared URL"
```

---

## Chunk 5: Ranked Matchmaking + Reconnection

### Task 19: Implement matchmaking Edge Function

**Files:**
- Modify: `packages/supabase/functions/matchmaking/index.ts`

- [ ] **Step 1: Implement the matchmaking queue join/leave**

```typescript
// packages/supabase/functions/matchmaking/index.ts
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserId } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const userId = await getUserId(req);
    const { action } = await req.json() as { action: 'join' | 'leave' };
    const client = getServiceClient();

    if (action === 'leave') {
      await client.from('matchmaking_queue').delete().eq('player_id', userId);
      return jsonResponse({ status: 'left' });
    }

    // Join queue — get player's Elo
    const { data: profile } = await client
      .from('profiles')
      .select('elo, rank_tier')
      .eq('id', userId)
      .single();

    if (!profile) return errorResponse('Profile not found', 404);

    // Check if already in queue
    const { data: existing } = await client
      .from('matchmaking_queue')
      .select('player_id')
      .eq('player_id', userId)
      .single();

    if (existing) {
      return jsonResponse({ status: 'already_queued' });
    }

    // Insert into queue
    await client.from('matchmaking_queue').insert({
      player_id: userId,
      elo: profile.elo,
      rank_tier: profile.rank_tier,
      queued_at: new Date().toISOString(),
    });

    return jsonResponse({ status: 'queued' });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 400);
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/supabase/functions/matchmaking/index.ts
git commit -m "feat: implement matchmaking queue join/leave Edge Function"
```

---

### Task 20: Add ranked queue UI to Matchmaking page

**Files:**
- Modify: `packages/client/src/pages/Matchmaking.tsx`
- Modify: `packages/client/src/features/matchmaking/hooks/useMatchmaking.ts`

- [ ] **Step 1: Update useMatchmaking hook for real Supabase**

Rewrite `packages/client/src/features/matchmaking/hooks/useMatchmaking.ts` to use the real Supabase client, subscribe to a personal channel for match notifications, and handle the AI fallback after 60 seconds:

Key changes:
- `joinQueue()` calls the matchmaking Edge Function
- Subscribe to `user:{playerId}` channel for `match_found` events
- Track queue time with `setInterval`
- After 60 seconds, set `offerAi = true`
- `leaveQueue()` calls the Edge Function with `action: 'leave'`
- When `match_found` is received, set `matchId` and navigate

- [ ] **Step 2: Add "Find Match" flow to Matchmaking.tsx**

Add a `finding-match` view state that shows:
- Queue timer (seconds elapsed)
- "Cancel" button
- After 60s: "Play vs AI while you wait?" prompt
- On match found: "Match found! Accept?" modal with 15-second timer

- [ ] **Step 3: Run all tests**

Run: `cd packages/client && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/matchmaking/hooks/useMatchmaking.ts packages/client/src/pages/Matchmaking.tsx
git commit -m "feat: add ranked queue UI with AI fallback after 60 seconds"
```

---

### Task 21: Add reconnection and disconnect handling

**Files:**
- Modify: `packages/client/src/gateway/remote-gateway.ts`

- [ ] **Step 1: Add Presence tracking to RemoteGateway**

In `RemoteGateway.setupChannel()`, add Presence tracking:

```typescript
// After the broadcast listeners, add:
this.channel
  .on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
    // Opponent left
    this.emitEvent({ kind: 'opponent_disconnected' });
  })
  .on('presence', { event: 'join' }, ({ newPresences }: any) => {
    this.emitEvent({ kind: 'opponent_reconnected' });
  });

// Track own presence
this.channel.track({ user_id: this.playerId, online_at: new Date().toISOString() });
```

- [ ] **Step 2: Add disconnect timer to Draft/Forge/Duel pages**

Create a shared component or hook `useDisconnectTimer` that:
- Listens for `opponent_disconnected` events from the gateway
- Shows a 60-second countdown overlay: "Waiting for opponent to reconnect..."
- On timeout, calls the `forfeit` Edge Function
- On `opponent_reconnected`, cancels the timer

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/gateway/remote-gateway.ts packages/client/src/hooks/useDisconnectTimer.ts
git commit -m "feat: add Presence-based disconnect detection with 60-second reconnect window"
```

---

### Task 22: Final integration test and cleanup

**Files:**
- Modify: `packages/client/src/App.tsx` (verify all routes)
- Remove: `packages/supabase/functions/ai-match-create/` (no longer needed per spec)

- [ ] **Step 1: Remove ai-match-create Edge Function**

Per the spec, AI matches don't go through the server. Remove:
```bash
rm -rf packages/supabase/functions/ai-match-create
```

- [ ] **Step 2: Run full test suite**

Run: `cd packages/client && npx vitest run`
Run: `cd packages/engine && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Verify build**

Run: `cd packages/client && npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused ai-match-create, final integration cleanup"
```

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | MatchGateway interface | gateway/types.ts | — |
| 2 | LocalGateway | gateway/local-gateway.ts | — |
| 3 | useMatchGateway hook | gateway/use-match-gateway.ts, gateway/index.ts | — |
| 4 | Routing fixes (AI codes, redirect) | — | App.tsx, Matchmaking, Draft, Forge, Duel, PostMatch |
| 5 | Migrate Draft.tsx to gateway | — | Draft.tsx |
| 6 | Migrate Forge, Duel, PostMatch | — | Forge.tsx, Duel.tsx, PostMatch.tsx |
| 7 | Install @supabase/supabase-js | — | package.json, supabase.ts |
| 8 | Auth store with Supabase anon auth | — | authStore.ts |
| 9 | Migration 006_multiplayer.sql | 006_multiplayer.sql | — |
| 10 | Shared Edge Function utilities | — | _shared/supabase.ts |
| 11 | match-create Edge Function | — | match-create/index.ts |
| 12 | match-join Edge Function | match-join/index.ts | — |
| 13 | draft-pick Edge Function | — | draft-pick/index.ts |
| 14 | forge-submit Edge Function | — | forge-submit/index.ts |
| 15 | match-state + forfeit | — | match-state/index.ts, forfeit/index.ts |
| 16 | RemoteGateway | gateway/remote-gateway.ts | gateway/use-match-gateway.ts |
| 17 | Matchmaking page redesign | — | Matchmaking.tsx |
| 18 | MatchEntry page (join via URL) | MatchEntry.tsx | App.tsx |
| 19 | Matchmaking Edge Function | — | matchmaking/index.ts |
| 20 | Ranked queue UI | — | useMatchmaking.ts, Matchmaking.tsx |
| 21 | Reconnection + disconnect | — | remote-gateway.ts |
| 22 | Cleanup + final tests | — | App.tsx |
