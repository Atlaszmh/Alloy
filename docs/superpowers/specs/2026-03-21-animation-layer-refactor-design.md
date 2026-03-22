# Animation Layer Refactor — Design Spec

## Problem

Draft.tsx has grown to 892 lines with 15 refs and 7 state variables. Most of this complexity is animation plumbing — position caching, pool snapshots, frozen sizing refs, DOM manipulation hacks to prevent blinks, manual `heldPhase` delays in PhaseRouter, and hand-rolled animation orchestration via `setTimeout` chains and `.finished` promises.

This makes animations fragile (timing bugs, stale closures, blink artifacts), hard to modify (every tweak requires understanding the full ref dependency graph), and impossible to extend (adding similar animations to Forge or Duel would duplicate all this complexity).

## Goal

Replace the hand-rolled animation plumbing with Framer Motion. Draft.tsx returns to being a game logic component (~300 lines) that declares *what* animates, not *how*. Future phases follow the same pattern with minimal effort.

## Architecture

### Layer 1: PhaseTransition (PhaseRouter level)

**Replaces:** `heldPhase`, `slideState`, `displayPhase`, `DRAFT_END_HOLD_MS`, `SLIDE_OUT_MS`, `SLIDE_GAP_MS`, `SLIDE_IN_MS`, manual timers, `slide-out-left`/`slide-in-right` CSS keyframes.

**How:** Wrap `renderPhase()` in `<AnimatePresence mode="wait">`. Each phase component gets `<motion.div>` with `initial`, `animate`, and `exit` props. AnimatePresence automatically:
- Keeps the old component mounted during its exit animation
- Waits for exit to complete before mounting the new component
- Handles the enter animation on the new component

```tsx
// PhaseRouter.tsx — simplified
<AnimatePresence mode="wait">
  <motion.div
    key={phase.kind + (phase.round ?? '')}
    initial={{ x: '100%', opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    exit={{ x: '-100%', opacity: 0 }}
    transition={{ duration: 0.4, ease: 'easeInOut' }}
  >
    {renderPhase()}
  </motion.div>
</AnimatePresence>
```

For the Draft→Forge transition specifically, Draft's exit animation includes the forge slam sequence. This is achieved by the draft component controlling its own exit timing via `onExitComplete` or by using a custom exit animation that encompasses the slam.

**Custom exit for Draft:** Instead of a simple slide-out, Draft's exit triggers the forge card slam + gem scatter. We can use `motion`'s `onAnimationComplete` or a custom `variants` approach where the exit variant plays the full slam sequence before resolving.

### Layer 2: Animation Hooks (extracted from Draft.tsx)

**`useGemPositionTracker(pool: OrbInstance[])`**
- Replaces: `gemPositionsRef`, `useLayoutEffect` position cache, merge logic
- Returns: `{ getPosition(uid: string): {x,y} | null, ref: (el) => void }`
- Internally uses a Map ref that tracks gem DOM positions
- Alternative: use Framer Motion's `layoutId` on gems so position transitions are automatic (gems slide to new positions instead of teleporting). This would eliminate the need for manual position tracking entirely for the swoop animation.

**`useOpponentPickAnimation(pool, player1Stockpile, isPlayerTurn, opponentZoneRef)`**
- Replaces: `prevPoolRef`, `flyingOrb` state, `startSwoopAnimation`, opponent pick detection `useEffect`, the flying gem JSX block
- Returns: `{ flyingGemElement: ReactNode | null }`
- Internally detects opponent picks by diffing pool, computes source/target positions, renders the flying `motion.div` with spring physics
- Uses Framer Motion `animate` for the swoop arc instead of Web Animations API

**`useDraftEndSequence(pool, gemSizing, draftRound)`**
- Replaces: `draftEndGems` state, `lastDraftPoolRef`, `draftEndTriggeredRef`, `startDraftEndAnimation`, the `useLayoutEffect` forge detection, the entire forge slam JSX overlay, `initialPoolCountRef` freeze logic
- Returns: `{ overlayElement: ReactNode | null, isActive: boolean }`
- Internally: snapshots pool, renders the forge card + scattering gems as `motion.div` elements with spring physics for scatter
- The `isActive` flag can be used to hide the pool grid

### Layer 3: Motion Components

**`MotionGemCard`** — GemCard wrapped in `motion.div`:
- Accepts `layoutId={orb.uid}` for automatic layout animations
- When a gem is removed from the pool, `AnimatePresence` plays its exit animation (fade out + scale down) instead of just disappearing
- When a gem appears in the stockpile with the same `layoutId`, Framer Motion automatically animates it from pool position to stockpile position — this could replace the entire swoop animation with zero custom code

**Pool grid with `AnimatePresence`:**
```tsx
<AnimatePresence>
  {pool.map((orb) => (
    <motion.div
      key={orb.uid}
      layoutId={orb.uid}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.5, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <GemCard ... />
    </motion.div>
  ))}
</AnimatePresence>
```

### What Gets Deleted from Draft.tsx

| Current code | Replaced by |
|---|---|
| `gemPositionsRef` + `useLayoutEffect` position cache | `layoutId` or `useGemPositionTracker` |
| `prevPoolRef` + `flyingOrb` state + swoop detection | `useOpponentPickAnimation` or `layoutId` |
| `lastDraftPoolRef` + pool snapshot logic | `useDraftEndSequence` |
| `draftEndGems` state + forge slam JSX (100+ lines) | `useDraftEndSequence` |
| `draftEndTriggeredRef` + `useLayoutEffect` forge detection | `useDraftEndSequence` |
| `initialPoolCountRef` + `prevRoundRef` + sizing freeze | `useDraftEndSequence` snapshots sizing |
| `gemGridSlotRef` + grid slot pinning | `layout` prop on `motion.div` (no reflow) |
| `animatedRoundRef` + `shouldAnimate` + entrance stagger | `AnimatePresence` initial animation |
| Flying gem JSX block (30+ lines) | `useOpponentPickAnimation` return |
| Forge slam overlay JSX (100+ lines) | `useDraftEndSequence` return |

**PhaseRouter cleanup:**
| Current code | Replaced by |
|---|---|
| `heldPhase` state + `DRAFT_END_HOLD_MS` | `AnimatePresence mode="wait"` |
| `slideState` + slide timers | `exit` prop on `motion.div` |
| `displayPhase` logic | Removed (AnimatePresence handles it) |
| `transitionLabel` overlay | Keep for non-draft transitions, or unify with `motion` |

### File Structure

```
packages/client/src/
├── animation/
│   ├── MotionGemCard.tsx       # GemCard + motion.div wrapper
│   ├── PhaseTransitionWrapper.tsx  # AnimatePresence wrapper for PhaseRouter
│   └── hooks/
│       ├── useGemPositionTracker.ts
│       ├── useOpponentPickAnimation.tsx  # returns ReactNode
│       └── useDraftEndSequence.tsx       # returns ReactNode
├── pages/
│   ├── Draft.tsx               # ~300 lines, game logic only
│   └── PhaseRouter.tsx         # simplified, uses PhaseTransitionWrapper
```

### Migration Strategy

1. Install Framer Motion
2. Add `PhaseTransitionWrapper` with `AnimatePresence` — replace PhaseRouter's manual transition logic
3. Extract `useDraftEndSequence` — move forge slam out of Draft.tsx
4. Extract `useOpponentPickAnimation` — move swoop out of Draft.tsx
5. Convert pool grid to use `AnimatePresence` + `motion.div` for gem entrance/exit
6. Remove dead code from Draft.tsx (all the refs, snapshots, freezes)
7. Verify all animations work, run E2E tests

### Extensibility for Future Phases

- **Forge:** entrance animation via `AnimatePresence`, gem placement could use `layoutId` to animate gems from stockpile into item slots
- **Duel:** entrance animation, combat effects via `motion.div` with spring physics, health bar animations
- **Particles:** Framer Motion's `useAnimation` controls can drive particle systems, or we add a lightweight particle layer (canvas-based) alongside the motion components
- **Ambient:** `motion.div` with `animate` + `repeat: Infinity` for idle pulsing, floating gems, etc.

### Dependencies

- `framer-motion` (npm package, ~40KB gzipped)
- No other new dependencies

### Risks

- **Bundle size:** Framer Motion adds ~40KB gzipped. For a game client this is negligible.
- **Learning curve:** Framer's API is well-documented but has depth. The hooks abstraction keeps complexity contained.
- **Layout animations + portals:** The forge slam overlay uses `fixed` positioning. Framer's `layoutId` works across portals but needs care with z-indexing.
- **Exit animation timing:** The Draft→Forge exit (forge slam) is ~4 seconds. AnimatePresence handles this natively but we need to make sure the exit animation duration is correct.
