# Phase Router Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-page phase guards with a centralized PhaseRouter, add error boundaries, and harden end-to-end phase transitions.

**Architecture:** A single PhaseRouter component at `/match/:code` subscribes to the gateway, reads the current phase, and renders the matching page component. Pages no longer check their phase or redirect. A React ErrorBoundary wraps each page with `key={phase.kind}` for auto-reset on phase transitions.

**Tech Stack:** React 19, React Router, Zustand, TypeScript, Vite

**Spec:** `docs/superpowers/specs/2026-03-18-phase-router-hardening-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/PhaseErrorBoundary.tsx` | **Create** | React error boundary with fallback UI and key-based reset |
| `src/pages/PhaseRouter.tsx` | **Create** | Central phase→page routing, gateway subscription, loading states |
| `src/App.tsx` | **Modify** | Replace per-phase routes with PhaseRouter + catch-all |
| `src/pages/Draft.tsx` | **Modify** | Remove phase guards, forward-nav redirects |
| `src/pages/Forge.tsx` | **Modify** | Remove phase guards, forward-nav redirects |
| `src/pages/Duel.tsx` | **Modify** | Remove phase guards, handleContinue sub-route navigations |
| `src/pages/PostMatch.tsx` | **Modify** | Remove phase guard redirect |
| `src/pages/MatchEntry.tsx` | **Delete** | Logic absorbed into PhaseRouter + useMatchGateway |

---

## Chunk 1: ErrorBoundary and PhaseRouter

### Task 1: Create PhaseErrorBoundary

**Files:**
- Create: `packages/client/src/components/PhaseErrorBoundary.tsx`

- [ ] **Step 1: Create the error boundary component**

```tsx
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import { useForgeStore } from '@/stores/forgeStore';
import { useDraftStore } from '@/stores/draftStore';

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PhaseErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PhaseErrorBoundary] Render error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReturnToQueue = () => {
    useMatchStore.getState().reset();
    useForgeStore.getState().reset();
    useDraftStore.getState().reset();
    window.location.href = '/queue';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
          <h2
            className="text-2xl font-bold text-accent-400"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            Something went wrong
          </h2>
          <p className="max-w-md text-center text-sm text-surface-400">
            An error occurred during the match. You can try returning to the queue.
          </p>
          {this.state.error && (
            <pre className="max-w-md overflow-auto rounded bg-surface-800 p-3 text-xs text-red-400">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReturnToQueue}
            className="rounded-lg bg-accent-500 px-6 py-2 text-sm font-semibold text-surface-900 hover:bg-accent-400"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            Return to Queue
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/client && npx tsc --noEmit 2>&1 | grep PhaseErrorBoundary`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/PhaseErrorBoundary.tsx
git commit -m "feat: add PhaseErrorBoundary with fallback UI and key-based reset"
```

---

### Task 2: Create PhaseRouter

**Files:**
- Create: `packages/client/src/pages/PhaseRouter.tsx`
- Reference: `packages/client/src/pages/MatchEntry.tsx` (absorb AI match routing)
- Reference: `packages/client/src/gateway/index.ts` (useMatchGateway hook)

- [ ] **Step 1: Create the PhaseRouter component**

```tsx
import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useMatchGateway } from '@/gateway';
import { PhaseErrorBoundary } from '@/components/PhaseErrorBoundary';
import { Draft } from './Draft';
import { Forge } from './Forge';
import { Duel } from './Duel';
import { Adapt } from './Adapt';
import { PostMatch } from './PostMatch';

export function PhaseRouter() {
  const { code } = useParams<{ code: string }>();
  const [, forceUpdate] = useState(0);

  if (!code) {
    return <Navigate to="/queue" replace />;
  }

  const gateway = useMatchGateway(code);

  useEffect(() => {
    return gateway.subscribe(() => forceUpdate((n) => n + 1));
  }, [gateway]);

  const matchState = gateway.getState();

  // Loading: gateway not ready yet
  if (!matchState) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2
          className="text-2xl font-bold text-accent-400"
          style={{ fontFamily: 'var(--font-family-display)' }}
        >
          Loading Match...
        </h2>
        <p className="animate-pulse text-sm text-surface-400">Please wait</p>
      </div>
    );
  }

  const phase = matchState.phase;

  function renderPhase() {
    switch (phase.kind) {
      case 'draft':
        return <Draft />;
      case 'forge':
        return <Forge />;
      case 'duel':
        return <Duel />;
      case 'adapt':
        return <Adapt />;
      case 'complete':
        return <PostMatch />;
      default:
        console.warn('[PhaseRouter] Unknown phase:', phase);
        return <Navigate to="/queue" replace />;
    }
  }

  return (
    <PhaseErrorBoundary resetKey={phase.kind}>
      {renderPhase()}
    </PhaseErrorBoundary>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/client && npx tsc --noEmit 2>&1 | grep PhaseRouter`
Expected: No errors (page components still have their guards, which is fine — we remove them in Chunk 2)

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/PhaseRouter.tsx
git commit -m "feat: add PhaseRouter — centralized phase-to-page routing with error boundary"
```

---

### Task 3: Update App.tsx routing

**Files:**
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Replace route configuration**

Replace the entire file contents with:

```tsx
import { Routes, Route, Navigate } from 'react-router';
import { MainMenu } from './pages/MainMenu';
import { Matchmaking } from './pages/Matchmaking';
import { PhaseRouter } from './pages/PhaseRouter';
import { Profile } from './pages/Profile';
import { RecipeBook } from './pages/RecipeBook';
import { Collection } from './pages/Collection';
import { Leaderboard } from './pages/Leaderboard';
import { Settings } from './pages/Settings';
import { useAudioUnlock } from './hooks/useAudioUnlock';
import { useRouteSound } from './hooks/useRouteSound';

export function App() {
  useAudioUnlock();
  useRouteSound();

  return (
    <div className="app-shell">
      <div className="app-frame">
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/queue" element={<Matchmaking />} />
          <Route path="/match/:code" element={<PhaseRouter />} />
          <Route path="/match/:code/*" element={<MatchRedirect />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/recipes" element={<RecipeBook />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </div>
  );
}

/** Catch-all: redirect old sub-route URLs to PhaseRouter */
function MatchRedirect() {
  const { code } = require('react-router').useParams<{ code: string }>();
  return <Navigate to={`/match/${code}`} replace />;
}
```

Wait — using `require` is wrong for ESM. Fix `MatchRedirect`:

```tsx
import { Routes, Route, Navigate, useParams } from 'react-router';
// ... other imports ...

function MatchRedirect() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/match/${code}`} replace />;
}
```

The full file:

```tsx
import { Routes, Route, Navigate, useParams } from 'react-router';
import { MainMenu } from './pages/MainMenu';
import { Matchmaking } from './pages/Matchmaking';
import { PhaseRouter } from './pages/PhaseRouter';
import { Profile } from './pages/Profile';
import { RecipeBook } from './pages/RecipeBook';
import { Collection } from './pages/Collection';
import { Leaderboard } from './pages/Leaderboard';
import { Settings } from './pages/Settings';
import { useAudioUnlock } from './hooks/useAudioUnlock';
import { useRouteSound } from './hooks/useRouteSound';

function MatchRedirect() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/match/${code}`} replace />;
}

export function App() {
  useAudioUnlock();
  useRouteSound();

  return (
    <div className="app-shell">
      <div className="app-frame">
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/queue" element={<Matchmaking />} />
          <Route path="/match/:code" element={<PhaseRouter />} />
          <Route path="/match/:code/*" element={<MatchRedirect />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/recipes" element={<RecipeBook />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/client && npx tsc --noEmit 2>&1 | grep App.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/App.tsx
git commit -m "feat: replace per-phase routes with PhaseRouter + catch-all redirect"
```

---

## Chunk 2: Strip Phase Guards from Pages

### Task 4: Strip guards from Draft.tsx

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx`

- [ ] **Step 1: Remove phase-checking code**

Remove these lines (around lines 252-259):
```tsx
  // ── Phase transitions (must be after all hooks) ──
  if (phase?.kind === 'forge') {
    return <Navigate to={`/match/${code}/forge`} replace />;
  }

  if (!matchState || phase?.kind !== 'draft') {
    return <Navigate to="/queue" replace />;
  }
```

Also remove `useNavigate` import and `const navigate = useNavigate();` (line 143) if `navigate` is no longer used anywhere in Draft. Check for other `navigate()` calls first.

Remove `Navigate` from the react-router import if no longer used.

- [ ] **Step 2: Verify it compiles and runs**

Run: `cd packages/client && npx tsc --noEmit 2>&1 | grep Draft.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "refactor: remove phase guards from Draft — PhaseRouter handles routing"
```

---

### Task 5: Strip guards from Forge.tsx

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

- [ ] **Step 1: Remove phase-checking code**

Remove these lines (around lines 942-950):
```tsx
  // ── Phase transitions (must be after all hooks) ──
  if (phase?.kind === 'duel') {
    return <Navigate to={`/match/${code}/duel`} replace />;
  }

  // ── Render guard ──
  if (!matchState || phase?.kind !== 'forge' || !player) {
    return <Navigate to="/queue" replace />;
  }
```

**Keep** the async plan guard (around line 952-954):
```tsx
  // Plan initializes asynchronously via useEffect — wait for it
  if (!plan) {
    return null;
  }
```

Remove `Navigate` from the react-router import if no longer used elsewhere.

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/client && npx tsc --noEmit 2>&1 | grep Forge.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "refactor: remove phase guards from Forge — PhaseRouter handles routing"
```

---

### Task 6: Strip guards from Duel.tsx

**Files:**
- Modify: `packages/client/src/pages/Duel.tsx`

- [ ] **Step 1: Remove phase guard and update handleContinue**

Remove the matchState null guard (around line 269-271):
```tsx
  if (!matchState) {
    return <Navigate to="/queue" replace />;
  }
```

**Keep** the async guard (around line 274-276):
```tsx
  if (!currentLog || !hpState) {
    return null;
  }
```

Update `handleContinue` (around line 247-258) — remove explicit sub-route navigation. The phase will change via gateway state, and PhaseRouter will re-render the correct page automatically. The function body becomes empty (or just dispatches an action if needed). If `handleContinue` no longer does anything, the "Continue" button can simply be removed or trigger no-op:

```tsx
  const handleContinue = () => {
    // PhaseRouter re-renders automatically when phase changes
    // No explicit navigation needed
  };
```

Remove `Navigate` from the react-router import. Remove `useNavigate` and `navigate` if no longer used.

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/client && npx tsc --noEmit 2>&1 | grep Duel.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Duel.tsx
git commit -m "refactor: remove phase guards and sub-route navigation from Duel"
```

---

### Task 7: Strip guard from PostMatch.tsx

**Files:**
- Modify: `packages/client/src/pages/PostMatch.tsx`

- [ ] **Step 1: Remove phase guard**

Remove (around line 87-89):
```tsx
  if (!matchState || phase?.kind !== 'complete') {
    return <Navigate to="/queue" replace />;
  }
```

Keep the `navigate('/queue')` and `navigate('/')` calls in `handlePlayAgain` and `handleMainMenu` — these are intentional user-triggered navigations away from the match, not phase guards.

Remove `Navigate` from the react-router import if no longer used.

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/client && npx tsc --noEmit 2>&1 | grep PostMatch.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/PostMatch.tsx
git commit -m "refactor: remove phase guard from PostMatch — PhaseRouter handles routing"
```

---

### Task 8: Delete MatchEntry.tsx

**Files:**
- Delete: `packages/client/src/pages/MatchEntry.tsx`

- [ ] **Step 1: Delete the file**

```bash
git rm packages/client/src/pages/MatchEntry.tsx
```

- [ ] **Step 2: Verify no remaining imports**

Run: `cd packages/client && grep -r "MatchEntry" src/`
Expected: No results (App.tsx already updated to not import it)

- [ ] **Step 3: Verify full build compiles**

Run: `cd packages/client && npx tsc --noEmit 2>&1 | grep -v "remote-gateway\|__tests__"`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: remove MatchEntry — logic absorbed into PhaseRouter"
```

---

## Chunk 3: Smoke Test End-to-End

### Task 9: Manual smoke test all transitions

- [ ] **Step 1: Start the dev server**

Run: `cd packages/client && npx vite --port 9099`

- [ ] **Step 2: Test draft→forge transition**

1. Navigate to `http://localhost:9099`
2. Start an AI match from the queue
3. Complete the draft phase (pick all orbs)
4. Verify: Forge screen loads without crash
5. Verify: Stats bar appears at top, combine workbench is enlarged, gems match draft sizing

- [ ] **Step 3: Test forge→duel transition**

1. From the Forge screen, click "Done Forging"
2. Confirm the modal
3. Verify: Duel screen loads without crash
4. Verify: Combat animation plays

- [ ] **Step 4: Test duel→next phase transition**

1. Wait for duel to complete (or skip)
2. Verify: Next phase loads (draft round 2, or PostMatch if quick match)
3. Verify: No console errors about hooks ordering

- [ ] **Step 5: Test error boundary**

1. Temporarily add `throw new Error('test')` to the top of Forge's render
2. Start a match, complete draft
3. Verify: Error boundary fallback appears (not a white screen crash)
4. Verify: "Return to Queue" button works
5. Remove the temporary throw

- [ ] **Step 6: Test URL catch-all**

1. Navigate directly to `http://localhost:9099/match/ai-test/forge`
2. Verify: Redirects to `http://localhost:9099/match/ai-test` and shows the correct phase

- [ ] **Step 7: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: address issues found during phase transition smoke testing"
```
