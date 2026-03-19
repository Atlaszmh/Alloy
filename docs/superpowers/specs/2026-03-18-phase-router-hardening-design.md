# Phase Router Hardening Design

**Date:** 2026-03-18
**Status:** Approved
**Goal:** Replace per-page phase guards with a centralized PhaseRouter, add error boundaries, and harden end-to-end phase transitions (draft → forge → duel → complete).

## Problem

Phase transition logic is duplicated across Draft.tsx, Forge.tsx, and Duel.tsx. Each page independently checks if it's on the correct phase, redirects forward if the phase has advanced, and redirects to `/queue` if state is invalid. This creates:

1. **Hooks violations** — React hooks called after conditional early returns cause "Rendered more/fewer hooks" crashes, especially on phase boundaries.
2. **No error recovery** — Any render error during a transition crashes the entire app with no fallback.
3. **Fragile extensibility** — Adding a new phase (e.g., adapt, shop) requires modifying every existing page's guard logic.

## Solution: Centralized PhaseRouter

### Architecture

A single `PhaseRouter` component replaces the current per-page route structure. It reads the current phase from the gateway/store and renders the matching page component.

**Current routing:**
```
/match/:code        → MatchEntry (fetches state, redirects to phase sub-route)
/match/:code/draft  → Draft.tsx (checks phase, redirects if wrong)
/match/:code/forge  → Forge.tsx (checks phase, redirects if wrong)
/match/:code/duel   → Duel.tsx (checks phase, redirects if wrong)
```

**New routing:**
```
/match/:code        → PhaseRouter (initializes gateway, subscribes, renders correct page)
/match/:code/*      → Redirect to /match/:code (handles refreshes on old sub-route URLs)
```

All phase sub-routes (`/draft`, `/forge`, `/duel`, `/adapt`, `/result`) are removed from App.tsx. The catch-all redirect ensures bookmarks and browser refreshes on old URLs still work.

### PhaseRouter Component

Location: `packages/client/src/pages/PhaseRouter.tsx`

Responsibilities:
1. Get match code from URL params
2. Initialize gateway via `useMatchGateway(code)` — this handles both AI and PvP cases
3. Subscribe to gateway state changes (same pattern as current pages)
4. Read `phase.kind` from match state
5. Render the matching page component in a switch
6. Wrap rendered page in a React ErrorBoundary
7. Handle loading/error states before any page renders

```
PhaseRouter
  ├─ Loading state     (matchState === null, gateway initializing)
  ├─ ErrorBoundary (key={phase.kind} — resets on phase change)
  │   ├─ Draft         (phase.kind === 'draft')
  │   ├─ Forge         (phase.kind === 'forge')
  │   ├─ Duel          (phase.kind === 'duel')
  │   ├─ Adapt         (phase.kind === 'adapt')
  │   └─ PostMatch     (phase.kind === 'complete')
  └─ Fallback          (unknown phase → redirect to /queue)
```

### MatchEntry Absorption

MatchEntry.tsx currently does two things:
1. **AI matches** (`ai-` prefix): Initializes local gateway and redirects to phase sub-route
2. **PvP matches**: Calls `match-join` via Supabase auth, fetches state, redirects

Under the new design:
- **AI matches**: `useMatchGateway(code)` already handles local gateway creation. PhaseRouter replaces MatchEntry entirely.
- **PvP matches**: The join/auth flow from MatchEntry must be preserved. `useMatchGateway(code)` for remote matches must handle the join step internally (or PhaseRouter must call it before gateway init). Since PvP is not yet implemented end-to-end, the current RemoteGateway initialization path is kept as-is — PhaseRouter calls `useMatchGateway(code)` which handles both cases.

MatchEntry.tsx is removed. Its AI-match logic is already in `useMatchGateway`. When PvP is implemented, the join flow will live in the RemoteGateway initialization.

### Page Component Contract

Pages are simplified by removing all phase-checking logic:

**Remove from each page:**
- Phase-forward navigation (e.g., `if (phase?.kind === 'duel') return <Navigate>`)
- Phase-mismatch guards (e.g., `if (phase?.kind !== 'forge') return <Navigate to="/queue">`)
- Match state null checks that redirect
- Explicit navigation calls to phase sub-routes (e.g., Duel's `handleContinue` navigating to `/match/:code/draft`)

**Keep in each page:**
- Async initialization guards (e.g., `if (!plan) return null` in Forge) — these are loading states, not phase logic
- All hooks called unconditionally at the top

**Contract:** If a page component mounts, the phase is guaranteed correct. Pages never need to verify their phase.

### Duel's handleContinue

Duel.tsx's `handleContinue` currently navigates to phase sub-routes (`/draft`, `/forge`, `/result`) based on the next phase. Under the new model, PhaseRouter re-renders automatically when the phase changes. `handleContinue` only needs to dispatch the phase-advancing action (if any); the navigation happens automatically. The explicit `navigate()` calls to sub-routes are removed.

### ErrorBoundary

Location: `packages/client/src/components/PhaseErrorBoundary.tsx`

Implementation: React class component with `getDerivedStateFromError` and `componentDidCatch`.

**Reset mechanism:** PhaseRouter passes `phase.kind` as the `key` prop to the ErrorBoundary. When the phase changes, React unmounts and remounts the ErrorBoundary, clearing any error state. This allows recovery without a full page reload — e.g., if Forge crashes but the phase advances to Duel, the error clears automatically.

On crash:
- Renders fallback UI: error message + "Return to Queue" button
- Logs error details to console for debugging
- "Return to Queue" button resets match/forge/draft stores and navigates to `/queue`

### Loading States

PhaseRouter handles two pre-render scenarios:

1. **No match state** — Gateway hasn't initialized yet → render a loading spinner/skeleton
2. **Unknown phase kind** — Defensive fallback → redirect to `/queue` with console warning

Page-level loading (Forge waiting for plan, Duel waiting for combat logs) stays in the page components as `return null` guards.

### Adapt Phase

Adapt.tsx is currently a stub with no gateway subscription. It is listed in PhaseRouter's render tree for forward compatibility. The stub is compatible with PhaseRouter today. When Adapt is implemented, it will need to receive gateway access via `useMatchGateway(code)` or equivalent — same as other pages.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/PhaseRouter.tsx` | **New** — Central phase routing component |
| `src/components/PhaseErrorBoundary.tsx` | **New** — Error boundary with fallback UI |
| `src/pages/Draft.tsx` | Remove phase guards, forward-nav redirects, and match-state null redirects |
| `src/pages/Forge.tsx` | Remove phase guards, forward-nav redirects, and match-state null redirects |
| `src/pages/Duel.tsx` | Remove phase guards, forward-nav redirects, `handleContinue` sub-route navigations |
| `src/App.tsx` | Replace all `/match/:code/*` sub-routes with PhaseRouter + catch-all redirect |
| `src/pages/MatchEntry.tsx` | **Remove** — logic absorbed into PhaseRouter + useMatchGateway |

## Testing

- Verify draft→forge transition doesn't crash (the original bug)
- Verify forge→duel transition works
- Verify duel→draft (round 2) and duel→complete transitions
- Verify browser refresh on `/match/:code` renders correct phase
- Verify browser refresh on `/match/:code/forge` redirects to `/match/:code` and renders correct phase
- Verify ErrorBoundary catches render errors and shows fallback
- Verify ErrorBoundary resets when phase changes (key-based reset)
- Verify "Return to Queue" from error fallback resets stores and navigates
- Verify Duel auto-advances without explicit navigation calls
