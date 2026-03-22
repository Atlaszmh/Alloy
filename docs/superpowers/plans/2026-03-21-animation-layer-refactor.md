# Animation Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-rolled animation plumbing in Draft.tsx (892 lines, 15 refs) with Framer Motion, extracting animation logic into reusable hooks and reducing Draft.tsx to ~300 lines of game logic.

**Architecture:** Install Framer Motion, wrap PhaseRouter in AnimatePresence for automatic phase transitions, extract Draft's animation concerns into three hooks (gem positions, opponent pick swoop, draft-end forge slam), and convert the pool grid to use motion components for entrance/exit animations.

**Tech Stack:** Framer Motion (`motion`, `AnimatePresence`, `useAnimate`), React, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-21-animation-layer-refactor-design.md`

---

## File Structure

```
packages/client/src/
├── animation/
│   ├── MotionGemCard.tsx              # GemCard wrapped in motion.div
│   ├── PhaseTransitionWrapper.tsx      # AnimatePresence wrapper for PhaseRouter
│   ├── DraftExitAnimation.tsx          # Forge slam overlay component
│   └── hooks/
│       ├── useOpponentPickAnimation.tsx  # Swoop animation hook
│       └── useDraftEndSequence.tsx       # Forge slam sequence hook
├── pages/
│   ├── Draft.tsx                       # Simplified (~300 lines)
│   └── PhaseRouter.tsx                 # Simplified with AnimatePresence
```

---

## Chunk 1: Install Framer Motion + PhaseRouter Refactor

### Task 1: Install Framer Motion

- [ ] **Step 1: Install the package**

```bash
cd packages/client && pnpm add framer-motion
```

- [ ] **Step 2: Verify it imports**

Create a quick smoke test:
```bash
cd packages/client && node -e "import('framer-motion').then(m => console.log('OK:', Object.keys(m).slice(0,5)))"
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/package.json packages/client/pnpm-lock.yaml
git commit -m "chore: install framer-motion"
```

### Task 2: Create PhaseTransitionWrapper

Replace the entire `heldPhase` / `slideState` / timer system in PhaseRouter with Framer Motion's `AnimatePresence`.

**Files:**
- Create: `packages/client/src/animation/PhaseTransitionWrapper.tsx`

- [ ] **Step 1: Create the wrapper component**

```tsx
// packages/client/src/animation/PhaseTransitionWrapper.tsx
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PhaseTransitionWrapperProps {
  /** Unique key for the current phase — changes trigger exit/enter animations */
  phaseKey: string;
  /** Custom exit animation for specific phase transitions */
  exitVariant?: 'slideLeft' | 'default';
  children: ReactNode;
}

const variants = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exitDefault: { x: '-100%', opacity: 0 },
  exitSlideLeft: { x: '-100%', opacity: 0.3 },
};

export function PhaseTransitionWrapper({
  phaseKey,
  exitVariant = 'default',
  children,
}: PhaseTransitionWrapperProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phaseKey}
        initial="initial"
        animate="animate"
        exit={exitVariant === 'slideLeft' ? 'exitSlideLeft' : 'exitDefault'}
        variants={variants}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        style={{ height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/animation/PhaseTransitionWrapper.tsx
git commit -m "feat(animation): create PhaseTransitionWrapper with AnimatePresence"
```

### Task 3: Refactor PhaseRouter to use PhaseTransitionWrapper

**Files:**
- Modify: `packages/client/src/pages/PhaseRouter.tsx`

- [ ] **Step 1: Rewrite PhaseRouter**

Replace the entire PhaseRouter with a simplified version. Remove: `heldPhase`, `slideState`, `displayPhase`, `DRAFT_END_HOLD_MS`, `SLIDE_OUT_MS`, `SLIDE_IN_MS`, `SLIDE_GAP_MS`, all the timer logic, the `transitionLabel` overlay, and the slide animation div.

The key insight: `AnimatePresence mode="wait"` handles everything — it keeps the old component mounted during its exit animation, waits for it to finish, then mounts the new component with its enter animation.

For the draft→forge transition, Draft's exit animation will include the forge slam sequence (handled by Draft itself via its own exit animation duration). We signal this by making the `motion.div` exit transition longer when leaving draft.

```tsx
// packages/client/src/pages/PhaseRouter.tsx
import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useMatchGateway, GatewayProvider } from '@/gateway';
import { PhaseErrorBoundary } from '@/components/PhaseErrorBoundary';
import { PhaseTransitionWrapper } from '@/animation/PhaseTransitionWrapper';
import { Draft } from './Draft';
import { Forge } from './Forge';
import { Duel } from './Duel';
import { Adapt } from './Adapt';
import { PostMatch } from './PostMatch';

export function PhaseRouter() {
  const { code } = useParams<{ code: string }>();
  const [, forceUpdate] = useState(0);

  const gateway = useMatchGateway(code ?? '');

  useEffect(() => {
    return gateway.subscribe(() => forceUpdate((n) => n + 1));
  }, [gateway]);

  if (!code) {
    return <Navigate to="/queue" replace />;
  }

  const matchState = gateway.getState();

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
  // Use phase kind + round as key so round transitions also animate
  const phaseKey = phase.kind + ('round' in phase ? `-r${phase.round}` : '');

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
    <GatewayProvider value={gateway}>
      <PhaseErrorBoundary resetKey={phase.kind}>
        <PhaseTransitionWrapper phaseKey={phaseKey}>
          {renderPhase()}
        </PhaseTransitionWrapper>
      </PhaseErrorBoundary>
    </GatewayProvider>
  );
}
```

**IMPORTANT:** At this point, the Draft exit animation will be a simple slide-left (default). The forge slam sequence will be re-added in Task 5 as a proper Framer Motion exit animation. This task just establishes the AnimatePresence foundation.

- [ ] **Step 2: Remove old CSS keyframes that are no longer needed**

In `packages/client/src/index.css`, remove `slide-out-left`, `slide-in-right`, and `fadeInOut` keyframes (if not used elsewhere). Keep `gem-enter` and `phase-scale-in` for now.

- [ ] **Step 3: Verify phase transitions work in browser**

Start a match, play through draft→forge→duel transitions. Each phase should slide in from the right and slide out to the left.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/PhaseRouter.tsx packages/client/src/index.css
git commit -m "refactor(phase-router): replace manual transition logic with AnimatePresence"
```

---

## Chunk 2: Extract Draft Animation Hooks

### Task 4: Create useOpponentPickAnimation hook

Extract the opponent pick swoop animation from Draft.tsx into a reusable hook.

**Files:**
- Create: `packages/client/src/animation/hooks/useOpponentPickAnimation.tsx`

- [ ] **Step 1: Create the hook**

This hook:
- Tracks gem positions via a merged cache (same pattern as current `gemPositionsRef`)
- Detects opponent picks by diffing pool
- Returns a `flyingGemElement` ReactNode to render, and a `startSwoopAnimation` function for the last-pick pre-animation

```tsx
// packages/client/src/animation/hooks/useOpponentPickAnimation.tsx
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { OrbInstance, AffixDef } from '@alloy/engine';
import { GemCard } from '@/components/GemCard';
import { getStatLabel } from '@/shared/utils/stat-label';
import { playSound } from '@/shared/utils/sound-manager';
import type { GemSizeConfig } from '@/hooks/useGemSize';

interface UseOpponentPickAnimationOptions {
  pool: OrbInstance[];
  opponentStockpile: OrbInstance[];
  isPlayerTurn: boolean;
  affixMap: Map<string, AffixDef>;
  gemSizing: GemSizeConfig;
  opponentZoneRef: React.RefObject<HTMLDivElement | null>;
}

export function useOpponentPickAnimation({
  pool,
  opponentStockpile,
  isPlayerTurn,
  affixMap,
  gemSizing,
  opponentZoneRef,
}: UseOpponentPickAnimationOptions) {
  // Merged position cache — positions persist across pool changes
  const gemPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useLayoutEffect(() => {
    for (const orb of pool) {
      const el = document.querySelector(`[data-gem-uid="${orb.uid}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        gemPositionsRef.current.set(orb.uid, {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
    }
  }, [pool]);

  const prevPoolRef = useRef<OrbInstance[]>(pool);
  const [flyingOrb, setFlyingOrb] = useState<{
    orb: OrbInstance;
    startPos: { x: number; y: number };
    endPos: { x: number; y: number };
  } | null>(null);

  // Start swoop for a specific orb — returns Promise that resolves when done
  const startSwoopAnimation = useCallback((orb: OrbInstance): Promise<void> => {
    const cachedPos = gemPositionsRef.current.get(orb.uid);
    const opRect = opponentZoneRef.current?.getBoundingClientRect();
    if (!cachedPos || !opRect) return Promise.resolve();

    const endPos = { x: opRect.left + opRect.width / 2, y: opRect.top + opRect.height / 2 };
    setFlyingOrb({ orb, startPos: cachedPos, endPos });
    playSound('orbPickOpponent');

    return new Promise((resolve) => {
      setTimeout(() => {
        playSound('dropSuccess');
        setFlyingOrb(null);
        resolve();
      }, 950);
    });
  }, [opponentZoneRef]);

  // Auto-detect opponent picks
  useEffect(() => {
    const prevPool = prevPoolRef.current;
    prevPoolRef.current = pool;

    if (prevPool.length > 0 && pool.length < prevPool.length) {
      const removedOrb = prevPool.find((o) => !pool.some((p) => p.uid === o.uid));
      const inOpponentStockpile = removedOrb && opponentStockpile.some((o) => o.uid === removedOrb.uid);
      if (removedOrb && inOpponentStockpile) {
        startSwoopAnimation(removedOrb);
      }
    }
  }, [pool, isPlayerTurn, opponentStockpile, startSwoopAnimation]);

  // Build the flying gem ReactNode
  let flyingGemElement: React.ReactNode = null;
  if (flyingOrb) {
    const affix = affixMap.get(flyingOrb.orb.affixId);
    if (affix) {
      const halfGem = gemSizing.gemSize / 2;
      const dx = flyingOrb.endPos.x - flyingOrb.startPos.x;
      const dy = flyingOrb.endPos.y - flyingOrb.startPos.y;
      const arc = 100;
      flyingGemElement = (
        <div
          className="pointer-events-none fixed z-50"
          ref={(el) => {
            if (!el) return;
            el.animate([
              { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
              { transform: `translate3d(${dx * 0.1 + arc * 0.6}px, ${dy * 0.15}px, 0) scale(0.9)`, opacity: 1 },
              { transform: `translate3d(${dx * 0.3 + arc}px, ${dy * 0.4}px, 0) scale(0.7)`, opacity: 1 },
              { transform: `translate3d(${dx * 0.6 + arc * 0.7}px, ${dy * 0.65}px, 0) scale(0.5)`, opacity: 0.95 },
              { transform: `translate3d(${dx * 0.85 + arc * 0.3}px, ${dy * 0.85}px, 0) scale(0.35)`, opacity: 0.8 },
              { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.3)`, opacity: 0 },
            ], {
              duration: 900,
              easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
              fill: 'forwards',
            });
          }}
          style={{
            left: flyingOrb.startPos.x - halfGem,
            top: flyingOrb.startPos.y - halfGem,
            willChange: 'transform, opacity',
          }}
        >
          <GemCard
            affixId={flyingOrb.orb.affixId}
            affixName={affix.name}
            tier={flyingOrb.orb.tier}
            category={affix.category}
            tags={affix.tags}
            statLabel={getStatLabel(affix, flyingOrb.orb)}
            gemSize={gemSizing.gemSize}
            emojiSize={gemSizing.emojiSize}
            statSize={gemSizing.statSize}
            nameSize={gemSizing.nameSize}
            catSize={gemSizing.catSize}
            selected
          />
        </div>
      );
    }
  }

  // Filter flying orb from opponent stockpile display
  const filteredOpponentStockpile = flyingOrb
    ? opponentStockpile.filter((o) => o.uid !== flyingOrb.orb.uid)
    : opponentStockpile;

  return {
    flyingGemElement,
    startSwoopAnimation,
    filteredOpponentStockpile,
    gemPositionsRef,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/animation/hooks/useOpponentPickAnimation.tsx
git commit -m "feat(animation): extract useOpponentPickAnimation hook from Draft.tsx"
```

### Task 5: Create useDraftEndSequence hook

Extract the forge slam animation (forge card drop + gem scatter + screen shake) into a hook.

**Files:**
- Create: `packages/client/src/animation/hooks/useDraftEndSequence.tsx`

- [ ] **Step 1: Create the hook**

This hook:
- Snapshots the pool while in draft phase
- Detects draft completion (phase changes to forge)
- Returns an overlay ReactNode with the forge card slam + gem scatter animation
- Returns `isActive` flag to hide the pool grid

```tsx
// packages/client/src/animation/hooks/useDraftEndSequence.tsx
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { OrbInstance, AffixDef } from '@alloy/engine';
import { GemCard } from '@/components/GemCard';
import { getStatLabel } from '@/shared/utils/stat-label';
import { playSound } from '@/shared/utils/sound-manager';
import type { GemSizeConfig } from '@/hooks/useGemSize';

interface ScatterGem {
  orb: OrbInstance;
  pos: { x: number; y: number };
  vx: number;
  vy: number;
  rotation: number;
  delay: number;
}

interface UseDraftEndSequenceOptions {
  pool: OrbInstance[];
  phase: { kind: string } | null;
  gemSizing: GemSizeConfig;
  draftRound: number;
  affixMap: Map<string, AffixDef>;
  gemPositionsRef: React.RefObject<Map<string, { x: number; y: number }>>;
  poolContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useDraftEndSequence({
  pool,
  phase,
  gemSizing,
  draftRound,
  affixMap,
  gemPositionsRef,
  poolContainerRef,
}: UseDraftEndSequenceOptions) {
  const [scatterGems, setScatterGems] = useState<ScatterGem[] | null>(null);
  const triggeredRef = useRef(false);
  const lastDraftPoolRef = useRef<OrbInstance[]>([]);
  const frozenGemSizingRef = useRef<GemSizeConfig | null>(null);

  // Snapshot pool while in draft phase
  if (pool.length > 0 && !triggeredRef.current) {
    lastDraftPoolRef.current = pool;
    frozenGemSizingRef.current = gemSizing;
  }

  const triggerAnimation = useCallback(() => {
    const sizing = frozenGemSizingRef.current ?? gemSizing;
    const remaining = lastDraftPoolRef.current
      .map((orb) => {
        const pos = gemPositionsRef.current.get(orb.uid);
        if (!pos) return null;
        const angle = (Math.random() - 0.5) * Math.PI * 1.5;
        const speed = 600 + Math.random() * 800;
        return {
          orb,
          pos,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 300,
          rotation: (Math.random() - 0.5) * 1080,
          delay: Math.random() * 150,
        };
      })
      .filter(Boolean) as ScatterGem[];

    if (remaining.length === 0) return;
    setScatterGems(remaining);
  }, [gemSizing, gemPositionsRef]);

  // Detect forge phase and trigger — use useLayoutEffect to hide grid before paint
  useLayoutEffect(() => {
    const currentPhase = phase;
    if (currentPhase?.kind === 'forge' && !triggeredRef.current) {
      triggeredRef.current = true;
      if (poolContainerRef.current) {
        poolContainerRef.current.style.visibility = 'hidden';
      }
      triggerAnimation();
    }
  });

  const isActive = scatterGems !== null;
  const sizing = frozenGemSizingRef.current ?? gemSizing;

  // Build the overlay ReactNode
  let overlayElement: React.ReactNode = null;
  if (scatterGems) {
    overlayElement = (
      <div
        className="fixed inset-0 z-[60] overflow-hidden pointer-events-none"
        data-draft-end-container
        ref={(container) => {
          if (!container) return;
          const cardEl = container.querySelector('[data-forge-card]') as HTMLElement;
          const gemEls = container.querySelectorAll('[data-scatter-gem]') as NodeListOf<HTMLElement>;
          if (!cardEl) return;

          // Phase 0: Card peeks from top
          const peekAnim = cardEl.animate([
            { transform: 'translateY(-200vh) scale(1.2)', opacity: 0 },
            { transform: 'translateY(-88vh) scale(1.15)', opacity: 0.6 },
          ], { duration: 400, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'forwards' });

          peekAnim.finished.then(() => {
            playSound('forgeCreak');
            // Phase 0b: Card trembles
            const shakeAnim = cardEl.animate([
              { transform: 'translateY(-88vh) rotate(0deg) scale(1.15)' },
              { transform: 'translateY(-87.5vh) rotate(-0.8deg) scale(1.15)', offset: 0.15 },
              { transform: 'translateY(-88.5vh) rotate(0.6deg) scale(1.15)', offset: 0.3 },
              { transform: 'translateY(-87vh) rotate(-1deg) scale(1.15)', offset: 0.5 },
              { transform: 'translateY(-88vh) rotate(0.8deg) scale(1.16)', offset: 0.7 },
              { transform: 'translateY(-86.5vh) rotate(-0.5deg) scale(1.17)', offset: 0.85 },
              { transform: 'translateY(-86vh) rotate(0deg) scale(1.18)' },
            ], { duration: 800, easing: 'linear', fill: 'forwards' });

            return shakeAnim.finished;
          }).then(() => {
            // Phase 1: Card drops
            const dropAnim = cardEl.animate([
              { transform: 'translateY(-86vh) scale(1.18)', opacity: 0.8 },
              { transform: 'translateY(0%) scale(1.08)', opacity: 1 },
            ], { duration: 500, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' });

            return dropAnim.finished;
          }).then(() => {
            // IMPACT
            playSound('forgeSlam');
            playSound('dropSuccess');
            setTimeout(() => playSound('dropSuccess'), 120);

            // Bounce settle
            cardEl.animate([
              { transform: 'translateY(0%) scale(1.08)' },
              { transform: 'translateY(-5%) scale(0.95)', offset: 0.2 },
              { transform: 'translateY(2%) scale(1.03)', offset: 0.45 },
              { transform: 'translateY(-1%) scale(0.99)', offset: 0.65 },
              { transform: 'translateY(0%) scale(1)', offset: 0.85 },
              { transform: 'translateY(0%) scale(1)' },
            ], { duration: 800, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'forwards' });

            // Screen shake
            container.animate([
              { transform: 'translate(0, 0)' },
              { transform: 'translate(-6px, 4px)', offset: 0.08 },
              { transform: 'translate(7px, -3px)', offset: 0.18 },
              { transform: 'translate(-5px, 5px)', offset: 0.28 },
              { transform: 'translate(4px, -4px)', offset: 0.4 },
              { transform: 'translate(-2px, 2px)', offset: 0.55 },
              { transform: 'translate(1px, -1px)', offset: 0.7 },
              { transform: 'translate(0, 0)' },
            ], { duration: 500, easing: 'linear' });

            // Gem scatter
            gemEls.forEach((el, i) => {
              const gem = scatterGems[i];
              if (!gem) return;
              el.animate([
                { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', opacity: 1 },
                { transform: `translate3d(${gem.vx * 0.5}px, ${gem.vy * 0.3 + 60}px, 0) rotate(${gem.rotation * 0.4}deg) scale(0.7)`, opacity: 0.85, offset: 0.45 },
                { transform: `translate3d(${gem.vx}px, ${gem.vy + 400}px, 0) rotate(${gem.rotation}deg) scale(0.2)`, opacity: 0 },
              ], { duration: 1000, delay: gem.delay, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'forwards' });
            });
          });
        }}
      >
        {/* Scatter gems */}
        {scatterGems.map((gem) => {
          const affix = affixMap.get(gem.orb.affixId);
          if (!affix) return null;
          return (
            <div
              key={gem.orb.uid}
              data-scatter-gem
              className="fixed"
              style={{
                left: gem.pos.x - sizing.gemSize / 2,
                top: gem.pos.y - sizing.gemSize / 2,
                willChange: 'transform, opacity',
              }}
            >
              <GemCard
                affixId={gem.orb.affixId}
                affixName={affix.name}
                tier={gem.orb.tier}
                category={affix.category}
                tags={affix.tags}
                statLabel={getStatLabel(affix, gem.orb)}
                gemSize={sizing.gemSize}
                emojiSize={sizing.emojiSize}
                statSize={sizing.statSize}
                nameSize={sizing.nameSize}
                catSize={sizing.catSize}
              />
            </div>
          );
        })}

        {/* Forge card */}
        <div
          data-forge-card
          className="fixed inset-0 flex items-center justify-center"
          style={{ transform: 'translateY(-200vh)', willChange: 'transform, opacity' }}
        >
          <div
            className="rounded-2xl border-2 border-accent-400 bg-surface-900/95 px-14 py-10 shadow-2xl"
            style={{ boxShadow: '0 0 80px rgba(212, 168, 52, 0.5), 0 25px 50px rgba(0,0,0,0.6)' }}
          >
            <h1
              className="text-6xl font-black text-accent-400"
              style={{
                fontFamily: 'var(--font-family-display)',
                textShadow: '0 0 40px rgba(212, 168, 52, 0.7)',
                letterSpacing: '0.12em',
              }}
            >
              FORGE
            </h1>
            <p
              className="mt-3 text-center text-base font-bold text-surface-300"
              style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.15em' }}
            >
              ROUND {draftRound}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return { overlayElement, isActive, triggerAnimation };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/animation/hooks/useDraftEndSequence.tsx
git commit -m "feat(animation): extract useDraftEndSequence hook from Draft.tsx"
```

---

## Chunk 3: Rewrite Draft.tsx

### Task 6: Rewrite Draft.tsx using the new hooks

Strip out all animation plumbing from Draft.tsx and replace with hook calls. The component should be ~300 lines of game logic + hook calls + JSX.

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx`

- [ ] **Step 1: Rewrite Draft.tsx**

Remove from Draft.tsx:
- `gemPositionsRef` and position cache `useLayoutEffect`
- `prevPoolRef`, `flyingOrb` state, `startSwoopAnimation`, opponent pick detection `useEffect`
- `lastDraftPoolRef`, `draftEndTriggeredRef`, `draftEndGems` state, `startDraftEndAnimation`
- `initialPoolCountRef`, `prevRoundRef`, sizing freeze logic
- `gemGridSlotRef` and grid slot pinning (keep this — it's game layout, not animation)
- All the forge slam JSX (100+ lines)
- All the flying gem JSX (30+ lines)
- The `useLayoutEffect` forge detection

Add:
- `useOpponentPickAnimation` hook call
- `useDraftEndSequence` hook call
- Render `flyingGemElement` and `overlayElement` from the hooks

The pointer interaction model (handlePointerDown, handleUp, drag logic), AI turn logic, timer, stockpile zones, and pool grid rendering STAY in Draft.tsx — these are game logic.

Key changes to the component:
```tsx
import { useOpponentPickAnimation } from '@/animation/hooks/useOpponentPickAnimation';
import { useDraftEndSequence } from '@/animation/hooks/useDraftEndSequence';

// In the component body:
const opponentZoneRef = useRef<HTMLDivElement>(null);
const poolContainerRef = useRef<HTMLDivElement>(null);

const {
  flyingGemElement,
  startSwoopAnimation,
  filteredOpponentStockpile,
  gemPositionsRef,
} = useOpponentPickAnimation({
  pool,
  opponentStockpile: player1?.stockpile ?? [],
  isPlayerTurn,
  affixMap,
  gemSizing,
  opponentZoneRef,
});

const { overlayElement, isActive: isDraftEnding } = useDraftEndSequence({
  pool,
  phase,
  gemSizing,
  draftRound,
  affixMap,
  gemPositionsRef,
  poolContainerRef,
});

// In JSX:
{flyingGemElement}
{overlayElement}

// Opponent stockpile uses filtered list:
<StockpileZone orbs={filteredOpponentStockpile} ... />

// Pool grid uses isDraftEnding for visibility:
<div ref={poolContainerRef} style={{ visibility: isDraftEnding ? 'hidden' : undefined }}>
```

- [ ] **Step 2: Verify line count**

```bash
wc -l packages/client/src/pages/Draft.tsx
```

Target: ~350 lines or less (down from 892).

- [ ] **Step 3: Run existing tests**

```bash
cd packages/client && npx vitest run
```

- [ ] **Step 4: Run Playwright tests**

```bash
cd packages/client && npx playwright test e2e/draft-acceptance.spec.ts --project=desktop
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "refactor(draft): extract animation logic into hooks — Draft.tsx now ~300 lines of game logic"
```

---

## Chunk 4: Pool Grid Motion Components

### Task 7: Add AnimatePresence to the pool grid for gem entrance/exit

Replace the manual `shouldAnimate` / `animatedRoundRef` / `gem-enter` keyframe system with Framer Motion's built-in AnimatePresence for the pool grid. Gems enter with a staggered spring animation and exit with a scale-down when picked.

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx` (pool grid section)

- [ ] **Step 1: Wrap pool grid items with motion.div + AnimatePresence**

```tsx
import { AnimatePresence, motion } from 'framer-motion';

// In the pool grid:
<AnimatePresence>
  {pool.map((orb, index) => {
    const affix = affixMap.get(orb.affixId);
    if (!affix) return null;
    const slot = gemGridSlotRef.current.get(orb.uid) ?? index;
    const col = (slot % gemSizing.columns) + 1;
    const row = Math.floor(slot / gemSizing.columns) + 1;
    return (
      <motion.div
        key={orb.uid}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 25,
          delay: index * 0.025, // stagger entrance
        }}
        style={{ gridColumn: col, gridRow: row }}
      >
        <GemCard ... />
      </motion.div>
    );
  })}
</AnimatePresence>
```

This replaces: `animatedRoundRef`, `shouldAnimate`, the `gem-enter` CSS keyframe, and the manual animation delay wrapper div.

- [ ] **Step 2: Remove the gem-enter CSS keyframe from index.css** (no longer needed)

- [ ] **Step 3: Verify in browser**

Pool gems should spring in on draft start and fade out when picked.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Draft.tsx packages/client/src/index.css
git commit -m "feat(draft): use Framer Motion AnimatePresence for pool gem entrance/exit animations"
```

---

## Chunk 5: Final Cleanup + Verification

### Task 8: Clean up dead code and run full test suite

- [ ] **Step 1: Remove unused imports and dead CSS**

Check Draft.tsx for unused imports (useLayoutEffect if no longer needed, etc.). Check index.css for orphaned keyframes.

- [ ] **Step 2: Run all unit tests**

```bash
cd packages/engine && npx vitest run
cd packages/client && npx vitest run
```

- [ ] **Step 3: Run Playwright E2E tests**

```bash
cd packages/client && npx playwright test e2e/draft-acceptance.spec.ts --project=desktop
```

- [ ] **Step 4: Browser play-test checklist**

| Feature | What to check |
|---|---|
| Phase transitions | Slide in/out between all phases |
| Gem entrance | Pool gems spring in with stagger on draft start |
| Gem exit (player pick) | Gem scales down and fades when picked |
| Opponent swoop | AI picks animate from pool to opponent stockpile |
| Last AI pick | Swoop completes before forge slam starts |
| Forge slam | Card peeks, creaks, drops, impact sound + scatter |
| Gem scatter | Remaining gems fly outward from their actual positions |
| Slide transition | Draft+forge card slides out left, forge slides in right |
| Timer | Still works, auto-pick on expiry |
| Disconnect overlay | Still shows for multiplayer |

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: clean up dead animation code after Framer Motion refactor"
```

- [ ] **Step 6: Final line count**

```bash
echo "Draft.tsx:" && wc -l packages/client/src/pages/Draft.tsx
echo "PhaseRouter.tsx:" && wc -l packages/client/src/pages/PhaseRouter.tsx
echo "useOpponentPickAnimation.tsx:" && wc -l packages/client/src/animation/hooks/useOpponentPickAnimation.tsx
echo "useDraftEndSequence.tsx:" && wc -l packages/client/src/animation/hooks/useDraftEndSequence.tsx
echo "PhaseTransitionWrapper.tsx:" && wc -l packages/client/src/animation/PhaseTransitionWrapper.tsx
```

Target: Draft.tsx ~300 lines, total animation code well-organized across focused files.
