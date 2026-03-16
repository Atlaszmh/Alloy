# Alloy — Technical Implementation Design

**Date:** 2026-03-14
**Status:** Approved
**Author:** Claude (from GDD v2.0 by Zach)

---

## Context

Alloy is a competitive mobile-friendly auto-battler where two rival blacksmiths draft crafting orbs from a shared pool, then privately forge a weapon and armor, and their gladiators auto-duel. The game targets quick sessions (<2 min casual, 4-6 min ranked) with enormous skill ceiling and zero pay-to-win.

This document specifies the complete technical architecture for building Alloy as a web-first application, starting with a headless game engine and layering UI on top. It incorporates all GDD inline decisions: flux locking/swap mechanics, tier upgrades via forge, no empty slot penalty, marked stockpile display, and minimal social features.

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Project Structure](#2-project-structure)
3. [Game Engine Architecture](#3-game-engine-architecture)
4. [Type System](#4-type-system)
5. [Data Registry & Config-Driven Balance](#5-data-registry--config-driven-balance)
6. [Pool Generation System](#6-pool-generation-system)
7. [Draft System](#7-draft-system)
8. [Forge System](#8-forge-system)
9. [Stat Calculator](#9-stat-calculator)
10. [Duel Simulation Engine](#10-duel-simulation-engine)
11. [AI System](#11-ai-system)
12. [Frontend Architecture](#12-frontend-architecture)
13. [Zustand Store Architecture](#13-zustand-store-architecture)
14. [PixiJS Duel Renderer](#14-pixijs-duel-renderer)
15. [Supabase Backend](#15-supabase-backend)
16. [Real-time Multiplayer Protocol](#16-real-time-multiplayer-protocol)
17. [API / Edge Function Endpoints](#17-api--edge-function-endpoints)
18. [Testing Strategy](#18-testing-strategy)
19. [Development Sequence](#19-development-sequence)
20. [Verification Plan](#20-verification-plan)

---

## 1. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | TypeScript (strict mode) | Type safety, shared engine between client/server |
| Package Manager | pnpm | Workspace support, fast, disk efficient |
| Monorepo | pnpm workspaces | Simple, no extra tooling (no Nx/Turborepo needed at this scale) |
| Engine Build | tsup | Fast TS library bundling, ESM + CJS dual output |
| Client Framework | React 19 + Vite | Fast HMR, optimized builds, modern tooling |
| State Management | Zustand (with immer middleware) | Lightweight, proven, minimal boilerplate |
| Duel Rendering | PixiJS 8 | Hardware-accelerated 2D, particle system, sprite animations |
| Styling | Tailwind CSS 4 | Utility-first, rapid prototyping, mobile-responsive |
| Backend | Supabase (Postgres + Realtime + Edge Functions + Auth) | Full-stack BaaS, real-time subscriptions, row-level security |
| Testing | Vitest + fast-check | Fast, ESM-native, property-based testing support |
| Schema Validation | Zod | Runtime validation of config JSON, API payloads |
| Routing | React Router 7 | File-based routing, lazy loading |
| Drag & Drop | Custom pointer events | Mobile-friendly, no HTML5 drag API limitations |
| Linting | ESLint + Prettier | Consistent code style |

---

## 2. Project Structure

```
alloy/
├── packages/
│   ├── engine/                          # Pure TS game engine (zero UI deps)
│   │   ├── package.json                 # name: @alloy/engine
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                 # Public API barrel export
│   │   │   ├── types/
│   │   │   │   ├── index.ts             # Re-exports all types
│   │   │   │   ├── base-stats.ts        # BaseStat, BaseStatAllocation
│   │   │   │   ├── derived-stats.ts     # DerivedStats, Element
│   │   │   │   ├── affix.ts             # AffixDef, AffixTier, StatModifier, AffixTag
│   │   │   │   ├── orb.ts              # OrbInstance (affix + tier + unique ID)
│   │   │   │   ├── item.ts             # ForgedItem, EquippedSlot, Loadout, BaseItemDef
│   │   │   │   ├── combination.ts      # CompoundAffixDef
│   │   │   │   ├── synergy.ts          # SynergyDef, ActiveSynergy
│   │   │   │   ├── combat.ts           # TickEvent (discriminated union), CombatLog, GladiatorRuntime
│   │   │   │   ├── match.ts            # MatchState, MatchPhase, RoundState, DuelResult
│   │   │   │   ├── player.ts           # PlayerState, Stockpile
│   │   │   │   ├── forge-action.ts     # ForgeAction (discriminated union)
│   │   │   │   ├── game-action.ts      # GameAction (draft pick, forge, advance phase)
│   │   │   │   └── ai.ts              # AITier, AIConfig
│   │   │   ├── data/
│   │   │   │   ├── registry.ts          # DataRegistry class (read-only singleton)
│   │   │   │   ├── schemas.ts           # Zod schemas for all JSON data files
│   │   │   │   ├── loader.ts            # Load + validate JSON files into registry
│   │   │   │   ├── affixes.json         # All affix definitions with per-tier values
│   │   │   │   ├── combinations.json    # Compound affix recipes
│   │   │   │   ├── synergies.json       # Synergy definitions
│   │   │   │   ├── base-items.json      # Weapon + armor base types
│   │   │   │   └── balance.json         # Global tuning knobs
│   │   │   ├── rng/
│   │   │   │   └── seeded-rng.ts        # Seedable PRNG with fork() for subsystem isolation
│   │   │   ├── pool/
│   │   │   │   ├── pool-generator.ts    # Deterministic pool generation from seed
│   │   │   │   └── archetype-validator.ts # Verify pool supports 3-4 viable archetypes
│   │   │   ├── draft/
│   │   │   │   ├── draft-state.ts       # Draft state machine + reducer
│   │   │   │   └── draft-actions.ts     # Pick validation, turn logic
│   │   │   ├── forge/
│   │   │   │   ├── forge-state.ts       # Forge state machine + reducer
│   │   │   │   ├── forge-actions.ts     # Assign, combine, upgrade tier, swap, set base stats
│   │   │   │   ├── flux-tracker.ts      # Flux budget enforcement per round
│   │   │   │   └── stat-calculator.ts   # Derive final stats from loadout + registry
│   │   │   ├── duel/
│   │   │   │   ├── duel-engine.ts       # Core tick loop orchestrator
│   │   │   │   ├── damage-calc.ts       # Physical, elemental, DOT damage formulas
│   │   │   │   ├── trigger-system.ts    # Proc chance-on-X affixes (data-driven)
│   │   │   │   ├── gladiator.ts         # Runtime gladiator state during combat
│   │   │   │   └── combat-log.ts        # Structured event recording
│   │   │   ├── ai/
│   │   │   │   ├── ai-controller.ts     # Dispatches to tier-specific strategies
│   │   │   │   ├── strategies/
│   │   │   │   │   ├── draft-strategy.ts  # Interface + per-tier implementations
│   │   │   │   │   ├── forge-strategy.ts  # Interface + per-tier implementations
│   │   │   │   │   └── adapt-strategy.ts  # Between-round adaptation per tier
│   │   │   │   └── evaluation.ts        # Heuristic scoring (orb value, build quality)
│   │   │   └── match/
│   │   │       ├── match-controller.ts  # Full match lifecycle orchestration
│   │   │       └── phase-machine.ts     # State machine: POOL_GEN → DRAFT → FORGE → DUEL → repeat/END
│   │   └── tests/
│   │       ├── rng.test.ts
│   │       ├── pool.test.ts
│   │       ├── draft.test.ts
│   │       ├── forge.test.ts
│   │       ├── duel.test.ts
│   │       ├── stat-calc.test.ts
│   │       ├── trigger.test.ts
│   │       ├── combinations.test.ts
│   │       ├── synergies.test.ts
│   │       ├── ai.test.ts
│   │       ├── match-integration.test.ts
│   │       ├── determinism.test.ts
│   │       └── fixtures/
│   │           ├── sample-pool.json
│   │           ├── sample-loadouts.json
│   │           └── sample-duel-log.json
│   │
│   ├── client/                          # React + Vite frontend
│   │   ├── package.json                 # name: @alloy/client
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── index.html
│   │   ├── public/
│   │   │   └── assets/
│   │   │       ├── sprites/             # Gladiator spritesheets (512x512 atlas)
│   │   │       ├── orbs/               # Orb icons (SVG for crisp scaling)
│   │   │       ├── vfx/                # Particle textures
│   │   │       ├── ui/                 # UI elements, frames, backgrounds
│   │   │       └── audio/              # SFX + music
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── app/
│   │       │   ├── App.tsx
│   │       │   ├── Router.tsx
│   │       │   └── providers.tsx        # Supabase, QueryClient wrappers
│   │       ├── pages/
│   │       │   ├── MainMenuPage.tsx
│   │       │   ├── MatchmakingPage.tsx
│   │       │   ├── DraftPage.tsx
│   │       │   ├── ForgePage.tsx
│   │       │   ├── DuelPage.tsx
│   │       │   ├── AdaptPage.tsx        # Re-forge between rounds (reuses Forge components)
│   │       │   ├── PostMatchPage.tsx
│   │       │   ├── ProfilePage.tsx
│   │       │   ├── RecipeBookPage.tsx
│   │       │   ├── CollectionPage.tsx
│   │       │   ├── LeaderboardPage.tsx
│   │       │   └── SettingsPage.tsx
│   │       ├── features/
│   │       │   ├── draft/
│   │       │   │   ├── components/
│   │       │   │   │   ├── OrbPool.tsx         # Tappable grid of shared orbs
│   │       │   │   │   ├── OrbCard.tsx         # Single orb: icon, element badge, tier glow
│   │       │   │   │   ├── StockpilePanel.tsx  # Player's collected orbs (collapsible)
│   │       │   │   │   ├── TurnIndicator.tsx   # "YOUR PICK" / "OPPONENT PICKING"
│   │       │   │   │   ├── DraftTimer.tsx      # 8s countdown
│   │       │   │   │   └── PickPreview.tsx     # Two-tap confirm overlay
│   │       │   │   └── hooks/
│   │       │   │       ├── useDraftSync.ts     # Supabase Realtime subscription
│   │       │   │       └── useDraftActions.ts  # Pick orb, confirm pick
│   │       │   ├── forge/
│   │       │   │   ├── components/
│   │       │   │   │   ├── ItemSlots.tsx       # Weapon/Armor with affix slots (drop targets)
│   │       │   │   │   ├── OrbTray.tsx         # Bottom scrollable orb inventory
│   │       │   │   │   ├── CombinationZone.tsx # Drag-merge area with preview
│   │       │   │   │   ├── BaseStatSelector.tsx # STR/INT/DEX/VIT cycle buttons (R1 only)
│   │       │   │   │   ├── FluxCounter.tsx     # Remaining flux display
│   │       │   │   │   ├── SynergyTracker.tsx  # Active/near synergies panel
│   │       │   │   │   ├── OpponentStockpile.tsx # Viewable enemy orbs (used ones marked)
│   │       │   │   │   └── ForgeTimer.tsx
│   │       │   │   └── hooks/
│   │       │   │       ├── useForgeState.ts    # Local forge manipulation
│   │       │   │       ├── useDragOrb.ts       # Pointer event-based drag handling
│   │       │   │       └── useForgeSubmit.ts   # Submit build to server
│   │       │   ├── duel/
│   │       │   │   ├── components/
│   │       │   │   │   ├── DuelCanvas.tsx      # PixiJS mount point
│   │       │   │   │   ├── DuelHUD.tsx         # React overlay: HP bars, callouts
│   │       │   │   │   └── PostDuelBreakdown.tsx # Stat comparison, turning points
│   │       │   │   ├── pixi/
│   │       │   │   │   ├── DuelScene.ts        # Main Pixi scene orchestrator
│   │       │   │   │   ├── GladiatorSprite.ts  # Animated sprite with state machine
│   │       │   │   │   ├── VFXManager.ts       # Particle effect controller
│   │       │   │   │   ├── DamageNumbers.ts    # Floating damage text
│   │       │   │   │   ├── StatusIcons.ts      # Buff/debuff icon display
│   │       │   │   │   └── effects/
│   │       │   │   │       ├── BaseEffect.ts   # Abstract VFX base class
│   │       │   │   │       ├── FireEffect.ts
│   │       │   │   │       ├── IceEffect.ts
│   │       │   │   │       ├── LightningEffect.ts
│   │       │   │   │       ├── PoisonEffect.ts
│   │       │   │   │       ├── ShadowEffect.ts
│   │       │   │   │       ├── ChaosEffect.ts
│   │       │   │   │       └── CritEffect.ts
│   │       │   │   └── hooks/
│   │       │   │       ├── useDuelPlayback.ts  # Event log → timed animation
│   │       │   │       └── usePixiApp.ts       # PixiJS lifecycle management
│   │       │   ├── matchmaking/
│   │       │   │   ├── components/
│   │       │   │   │   ├── QueueButton.tsx
│   │       │   │   │   ├── QueueStatus.tsx
│   │       │   │   │   └── MatchFound.tsx
│   │       │   │   └── hooks/
│   │       │   │       └── useMatchmaking.ts
│   │       │   └── meta/
│   │       │       ├── components/
│   │       │       │   ├── ProfileCard.tsx
│   │       │       │   ├── RankBadge.tsx
│   │       │       │   ├── MasteryTrack.tsx
│   │       │       │   ├── RecipeEntry.tsx
│   │       │       │   └── LeaderboardRow.tsx
│   │       │       └── hooks/
│   │       │           ├── useProfile.ts
│   │       │           └── useLeaderboard.ts
│   │       ├── stores/
│   │       │   ├── authStore.ts         # User session (persisted to localStorage)
│   │       │   ├── matchStore.ts        # Current match state
│   │       │   ├── draftStore.ts        # Draft-phase state
│   │       │   ├── forgeStore.ts        # Forge-phase state (immer middleware)
│   │       │   ├── duelStore.ts         # Duel event log + playback position
│   │       │   ├── uiStore.ts           # Modals, toasts, settings (persisted)
│   │       │   └── profileStore.ts      # Profile, rank, progression
│   │       ├── shared/
│   │       │   ├── components/
│   │       │   │   ├── Timer.tsx
│   │       │   │   ├── OrbIcon.tsx      # Colorblind-safe orb rendering (icon + shape)
│   │       │   │   ├── StatIcon.tsx
│   │       │   │   ├── Tooltip.tsx
│   │       │   │   ├── Modal.tsx
│   │       │   │   ├── ScreenTransition.tsx
│   │       │   │   └── HapticButton.tsx # Button with vibration feedback
│   │       │   ├── hooks/
│   │       │   │   ├── useHaptic.ts
│   │       │   │   ├── useCountdown.ts
│   │       │   │   └── useOrientation.ts # Portrait lock / warning
│   │       │   └── utils/
│   │       │       ├── supabase.ts      # Supabase client singleton
│   │       │       ├── accessibility.ts # Colorblind helpers
│   │       │       └── haptics.ts       # Vibration API wrapper
│   │       └── styles/
│   │           ├── global.css
│   │           ├── tokens.css           # Design tokens (colors, spacing)
│   │           └── animations.css
│   │
│   └── supabase/                        # Supabase project config
│       ├── config.toml
│       ├── seed.sql
│       ├── migrations/
│       │   ├── 001_users_profiles.sql
│       │   ├── 002_matches.sql
│       │   ├── 003_progression.sql
│       │   ├── 004_leaderboards.sql
│       │   └── 005_rls_policies.sql
│       └── functions/
│           ├── matchmaking/index.ts
│           ├── match-create/index.ts
│           ├── draft-pick/index.ts
│           ├── forge-submit/index.ts       # Also runs duel sim when both builds submitted
│           ├── match-complete/index.ts
│           ├── match-state/index.ts         # GET handler with visibility filtering
│           ├── ai-match-create/index.ts
│           └── forfeit/index.ts
│
├── package.json                         # Workspace root
├── pnpm-workspace.yaml                  # packages: ['packages/*']
├── tsconfig.base.json                   # Shared compiler options
├── .eslintrc.cjs
├── .prettierrc
└── .gitignore
```

---

## 3. Game Engine Architecture

### Core Principle: Immutable State + Action Reducer

The entire engine operates as a pure state machine:

```typescript
function applyAction(state: MatchState, action: GameAction, rng: SeededRNG): ActionResult;

type ActionResult =
  | { ok: true; state: MatchState }
  | { ok: false; error: string };
```

Given the same seed and action sequence, the output is always identical. This enables:
- **Server authority:** Server replays actions to validate client claims
- **Deterministic duels:** Same inputs = same combat log
- **Replay system:** Store seed + action list, replay by reducing from initial state
- **Testability:** Every test is "given state X, apply action Y, assert state Z"

### Seeded RNG

```typescript
class SeededRNG {
  constructor(seed: number);
  next(): number;                    // 0-1 float
  nextInt(min: number, max: number): number;
  nextBool(chance: number): boolean; // chance 0-1
  fork(label: string): SeededRNG;    // Derive deterministic sub-RNG
  getState(): number;                // For serialization
}
```

The `fork()` method is critical: `rng.fork('pool')` produces a child RNG seeded deterministically from the parent. This isolates subsystem randomness — modifying pool gen's random calls won't change duel outcomes.

Algorithm: xoshiro128** (fast, well-distributed, seedable, small state).

### Module Dependency Graph

```
                    types/
                      │
                    data/
                   registry
                   /  |  \
                  /   |   \
               pool/ draft/ forge/
                |      |      |
                └──────┼──────┘
                       |
                    match/
                   controller
                       |
                    duel/
                    engine
                       |
                     ai/
                  controller
```

All modules depend on `types/` and `data/registry`. No circular dependencies. The `match/controller` orchestrates the lifecycle and calls into `pool`, `draft`, `forge`, and `duel` modules.

---

## 4. Type System

### Enums and Primitives

```typescript
type BaseStat = 'STR' | 'INT' | 'DEX' | 'VIT';
type Element = 'fire' | 'cold' | 'lightning' | 'poison' | 'shadow' | 'chaos';
type AffixTier = 1 | 2 | 3 | 4;
type AffixTarget = 'weapon' | 'armor';
type AffixTag = string; // 'physical' | 'elemental' | 'fire' | 'defensive' | 'crit' | etc.

interface BaseStatAllocation {
  stat1: BaseStat;
  stat2: BaseStat;
}
```

### Stat Modifiers

```typescript
interface StatModifier {
  stat: string;       // Key into DerivedStats or special trigger key
  op: 'flat' | 'percent' | 'override';
  value: number;
}
```

### Derived Stats

```typescript
interface DerivedStats {
  maxHP: number;
  physicalDamage: number;
  elementalDamage: Record<Element, number>;
  attackInterval: number;    // In ticks (minimum capped)
  armor: number;             // Physical damage reduction %
  resistances: Record<Element, number>;
  critChance: number;        // 0-1
  critMultiplier: number;    // Default 1.5
  critAvoidance: number;     // 0-1
  lifestealPercent: number;
  blockChance: number;       // 0-1
  blockBreakChance: number;  // 0-1
  dodgeChance: number;       // 0-1
  thornsDamage: number;
  barrierAmount: number;
  hpRegen: number;           // Per tick
  armorPenetration: number;  // 0-1
  elementalPenetration: number; // 0-1
  stunChance: number;        // 0-1
  slowPercent: number;       // 0-1
  dotMultiplier: number;     // 1 = no bonus
  initiative: number;        // % faster at duel start
}
```

### Affix Definitions

```typescript
interface AffixDef {
  id: string;                 // e.g., 'fire_damage'
  name: string;               // e.g., 'Fire Damage'
  category: 'offensive' | 'defensive' | 'sustain' | 'trigger';
  tags: AffixTag[];
  tiers: Record<AffixTier, {
    weaponEffect: StatModifier[];
    armorEffect: StatModifier[];
    valueRange: [number, number]; // For display: "10-20 fire damage"
  }>;
}
```

### Orbs

```typescript
interface OrbInstance {
  uid: string;       // Unique instance ID (UUID, generated during pool creation)
  affixId: string;   // References AffixDef.id
  tier: AffixTier;
}
```

### Items

```typescript
type EquippedSlot =
  | { kind: 'single'; orb: OrbInstance }
  | { kind: 'compound'; orbs: [OrbInstance, OrbInstance]; compoundId: string }
  | { kind: 'upgraded'; orb: OrbInstance; originalTier: AffixTier; upgradedTier: AffixTier }; // Tier-merged orb

// Note: OrbInstance is immutable. The `upgradedTier` on the slot tracks the result
// of merging. The orb's own `tier` field remains its original pool-generation tier.
// Stat calculator reads `upgradedTier` from the slot, not `tier` from the orb.

interface ForgedItem {
  baseItemId: string;
  baseStats: BaseStatAllocation | null; // null = not yet set (pre-Round 1)
  slots: (EquippedSlot | null)[];       // length 6, null = empty
}

interface Loadout {
  weapon: ForgedItem;
  armor: ForgedItem;
}

interface BaseItemDef {
  id: string;
  type: 'weapon' | 'armor';
  name: string;
  inherentBonuses: StatModifier[];
  unlockLevel: number;
}
```

### Combinations

```typescript
interface CompoundAffixDef {
  id: string;                   // e.g., 'ignite'
  name: string;                 // e.g., 'Ignite'
  components: [string, string]; // Two affixIds (order-independent)
  fluxCost: number;             // Default: 2
  slotCost: number;             // Default: 2 (occupies 2 affix slots)
  weaponEffect: StatModifier[];
  armorEffect: StatModifier[];
  tags: AffixTag[];
}
```

### Synergies

```typescript
interface SynergyDef {
  id: string;
  name: string;
  requiredAffixes: string[];    // AffixIds or tags required across weapon + armor
  bonusEffects: StatModifier[];
  description: string;
}

interface ActiveSynergy {
  synergyId: string;
  isActive: boolean;
  missingCount: number;        // 0 = active, 1 = one away, etc.
}
```

### Gladiator Runtime State

```typescript
interface GladiatorRuntime {
  playerId: 0 | 1;
  currentHP: number;
  maxHP: number;
  barrier: number;
  stats: DerivedStats;
  activeDOTs: ActiveDOT[];
  activeBuffs: ActiveBuff[];
  cooldowns: Map<string, number>;  // triggerId -> ticks until available
  attackTimer: number;             // Ticks until next attack
  stunTimer: number;               // Ticks remaining stunned (0 = not stunned)
  isLowHP: boolean;                // Cached: currentHP / maxHP < 0.3
}

interface ActiveDOT {
  element: Element;
  damagePerTick: number;
  remainingTicks: number;
  sourceAffixId: string;
  stacks: number;                  // For stackable DOTs like Poison
}

interface ActiveBuff {
  stat: keyof DerivedStats;
  value: number;
  remainingTicks: number;
  sourceId: string;
}
```

### Combat Events

```typescript
type TickEvent =
  | { type: 'attack'; attacker: 0 | 1; damage: number; damageType: 'physical' | Element; isCrit: boolean }
  | { type: 'block'; blocker: 0 | 1; blockedDamage: number }
  | { type: 'dodge'; dodger: 0 | 1 }
  | { type: 'dot_apply'; target: 0 | 1; element: Element; dps: number; durationTicks: number }
  | { type: 'dot_tick'; target: 0 | 1; element: Element; damage: number }
  | { type: 'lifesteal'; player: 0 | 1; healed: number }
  | { type: 'thorns'; reflector: 0 | 1; damage: number }
  | { type: 'barrier_absorb'; player: 0 | 1; absorbed: number; remaining: number }
  | { type: 'trigger_proc'; player: 0 | 1; triggerId: string; effectDescription: string }
  | { type: 'synergy_proc'; player: 0 | 1; synergyId: string; effectDescription: string }
  | { type: 'stun'; target: 0 | 1; durationTicks: number }
  | { type: 'hp_change'; player: 0 | 1; oldHP: number; newHP: number; maxHP: number }
  | { type: 'death'; player: 0 | 1 };

interface CombatLog {
  seed: number;
  ticks: { tick: number; events: TickEvent[] }[];
  result: DuelResult;
}

interface DuelResult {
  round: number;
  winner: 0 | 1;             // Individual duels always have a winner (RNG tiebreak if needed)
  finalHP: [number, number];
  tickCount: number;
  duration: number;           // In seconds (tickCount / ticksPerSecond)
  wasTiebreak: boolean;       // True if winner was decided by HP% comparison or RNG after max ticks
}
```

> **Design note:** Individual duel rounds always produce a winner. If both gladiators die on the same tick, the one with higher remaining HP% wins. If truly identical (e.g., mirror match with simultaneous death at 0%), a seeded RNG coin flip decides. There is no round-level draw. The match-level `'draw'` exists only as a theoretical fallback (e.g., server error, mutual forfeit) and should be extremely rare.

### Match State

```typescript
type MatchPhase =
  | { kind: 'draft'; pickIndex: number; activePlayer: 0 | 1 }
  | { kind: 'forge'; round: 1 | 2 | 3 }
  | { kind: 'duel'; round: 1 | 2 | 3 }
  | { kind: 'adapt'; round: 2 | 3 }   // Re-forge between rounds (distinct from initial forge)
  | { kind: 'complete'; winner: 0 | 1 | 'draw'; scores: [number, number] };

interface MatchState {
  matchId: string;
  seed: number;
  mode: 'quick' | 'unranked' | 'ranked';
  baseWeaponId: string;
  baseArmorId: string;
  phase: MatchPhase;
  pool: OrbInstance[];
  players: [PlayerState, PlayerState];
  roundResults: DuelResult[];
  duelLogs: CombatLog[];
  fluxPerRound: [number, number, number]; // From balance.json: [8, 4, 2]
}

interface PlayerState {
  id: string;
  stockpile: OrbInstance[];  // All drafted orbs (used ones marked via loadout tracking)
  loadout: Loadout;
}
```

### Forge Actions

```typescript
type ForgeAction =
  | { kind: 'assign_orb'; orbUid: string; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'combine'; orbUid1: string; orbUid2: string; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'upgrade_tier'; orbUid1: string; orbUid2: string; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'swap_orb'; target: 'weapon' | 'armor'; slotIndex: number; newOrbUid: string }
  | { kind: 'remove_orb'; target: 'weapon' | 'armor'; slotIndex: number }
  | { kind: 'set_base_stats'; target: 'weapon' | 'armor'; stat1: BaseStat; stat2: BaseStat };

type GameAction =
  | { kind: 'draft_pick'; player: 0 | 1; orbUid: string }
  | { kind: 'forge_action'; player: 0 | 1; action: ForgeAction }
  | { kind: 'forge_complete'; player: 0 | 1 }
  | { kind: 'advance_phase' };
```

---

## 5. Data Registry & Config-Driven Balance

### Registry Class

```typescript
class DataRegistry {
  constructor(
    affixes: AffixDef[],
    combinations: CompoundAffixDef[],
    synergies: SynergyDef[],
    baseItems: BaseItemDef[],
    balance: BalanceConfig,
  );

  // Lookups (O(1) via internal Maps)
  getAffix(id: string): AffixDef;
  getAllAffixes(): AffixDef[];
  getAffixesByTag(tag: AffixTag): AffixDef[];
  getCombination(affixId1: string, affixId2: string): CompoundAffixDef | null;
  getAllCombinations(): CompoundAffixDef[];
  getSynergy(id: string): SynergyDef;
  getAllSynergies(): SynergyDef[];
  getBaseItem(id: string): BaseItemDef;
  getBaseItemsByType(type: 'weapon' | 'armor'): BaseItemDef[];
  getBalance(): BalanceConfig;
}
```

### Balance Config Shape

```typescript
interface BalanceConfig {
  baseHP: number;                    // 200
  ticksPerSecond: number;            // 30
  maxDuelTicks: number;              // 3000 (100 seconds)
  baseCritMultiplier: number;        // 1.5
  minAttackInterval: number;         // 9 ticks (0.3s)

  fluxPerRound: [number, number, number]; // [8, 4, 2]
  fluxCosts: {
    assignOrb: number;               // 1
    combineOrbs: number;             // 2
    upgradeTier: number;             // 1
    swapOrb: number;                 // 1
    removeOrb: number;               // 1
  };
  quickMatchFlux: number;            // 14 (effectively fills all 12 slots + 2 combines)

  draftPoolSize: { min: number; max: number }; // { min: 30, max: 36 }
  draftPoolSizeQuick: { min: number; max: number }; // { min: 20, max: 24 }
  tierDistribution: Record<AffixTier, number>;  // { 1: 0.50, 2: 0.30, 3: 0.15, 4: 0.05 }
  draftTimerSeconds: number;          // 8
  forgeTimerSeconds: { round1: number; subsequent: number }; // { round1: 45, subsequent: 25 }
  archetypeMinOrbs: number;           // 4

  baseStatScaling: Record<BaseStat, {
    // What each point of this base stat multiplies on weapon vs armor
    weapon: Record<string, number>;
    armor: Record<string, number>;
  }>;
}
```

### JSON Data Files

All affix definitions, combination recipes, synergy rules, and base item stats live in JSON files. Every value that affects game balance is in these files — zero hardcoded numbers in logic code.

**Validation:** All JSON files are validated at load time against Zod schemas (`data/schemas.ts`). Invalid data throws immediately at startup rather than producing subtle runtime bugs.

**Combination lookup:** Combinations are stored with sorted component IDs as the key, making lookup order-independent: `getCombination('fire', 'chance_on_hit')` and `getCombination('chance_on_hit', 'fire')` return the same result.

---

## 6. Pool Generation System

### Algorithm

```
Input: seed, mode ('quick' | 'ranked'), registry
Output: OrbInstance[]

1. Create sub-RNG: rng.fork('pool')
2. Determine pool size from balance config based on mode
3. Generate tier distribution targets (e.g., 15 T1, 9 T2, 5 T3, 1 T4 for 30 orbs)
4. For each tier, select random affixes from the registry weighted by category:
   - ~40% offensive, ~30% defensive, ~20% sustain/utility, ~10% trigger
5. Assign unique UIDs to each orb
6. Run archetype validation:
   - Check that at least 3 distinct archetype tag clusters have >= archetypeMinOrbs orbs
   - Archetypes: 'physical_burst', 'elemental_fire', 'elemental_cold', 'dot_poison',
     'crit_assassin', 'tank_fortress', 'sustain_leech', 'shadow_control'
   - If validation fails, re-roll with next seed value (rare, <5% of pools)
7. Guarantee at least 2 trigger orbs (to enable combinations)
8. Return OrbInstance[]
```

### Archetype Viability

An archetype is "viable" if the pool contains enough orbs to build a coherent version of it. This doesn't guarantee optimality — just that a player who commits to that path has enough tools to work with.

---

## 7. Draft System

### State Machine

```
States: WAITING_FOR_PICK → PICK_MADE → (loop) → DRAFT_COMPLETE

Per pick:
1. Validate: correct player's turn, orb exists in pool, timer not expired
2. Remove orb from pool
3. Add orb to active player's stockpile
4. Advance pickIndex, switch activePlayer
5. If pool exhausted or pick count reached → DRAFT_COMPLETE
```

### Pick Count

- Quick Match: 10-12 picks per player (pool of 20-24)
- Ranked/Unranked: 15-18 picks per player (pool of 30-36)

### Timer Enforcement

- 8 seconds per pick
- On timeout: auto-pick a random remaining orb
- Timer is server-authoritative; client shows countdown synced via broadcast

---

## 8. Forge System

### Flux Rules

| Round | Flux | Rules |
|-------|------|-------|
| 1 (Molten) | 8 | Place orbs into empty slots (1 flux each). Set base stats (free). Combine orbs (2 flux). Upgrade tier (1 flux). All placed orbs lock. |
| 2 (Tempered) | 4 | Place new orbs into empty slots (1 flux). Swap a locked orb out (1 flux) — swapped orb returns to stockpile, new orb locks. Combine/upgrade still available. |
| 3 (Set) | 2 | Same rules as Round 2. Everything finalizes after this round. |

**Quick Match:** Flux set to maximum (effectively unlimited) — all 12 slots fillable in one round.

### Forge Actions Detail

**assign_orb:** Place an orb from stockpile into an empty slot on weapon or armor. Costs 1 flux. Orb locks.

**combine:** Merge two compatible orbs into a compound affix. Both orbs must be in the player's stockpile (not yet placed). Costs 2 flux. Occupies 2 consecutive affix slots on the target item. Result is looked up from `combinations.json`.

**upgrade_tier:** Merge two orbs with the same `affixId` into one orb of the next tier. Costs 1 flux. Occupies 1 slot. The merged orb's tier = min(source tier + 1, 4). Both source orbs are consumed.

**swap_orb:** Remove a locked orb from a slot and replace it with a new orb from stockpile. Available in Rounds 2+. Costs 1 flux. The removed orb returns to the player's stockpile (available for future use). The new orb locks.

**remove_orb:** Remove a locked orb from a slot without replacing it. Available in Rounds 2+. Costs 1 flux. The orb returns to stockpile. (Distinct from swap — leaves slot empty.)

**set_base_stats:** Choose two base stats (STR/INT/DEX/VIT) for a weapon or armor. Free (0 flux). Only available in Round 1. Permanent for the match. Players can double up (DEX/DEX) or split (STR/DEX).

### Forge Validation

The forge reducer validates every action:
- Sufficient flux remaining
- Orb exists in player's stockpile (for assign/combine/upgrade)
- Slot is valid (empty for assign, occupied for swap, indices in range)
- Combination is valid (components exist in `combinations.json`)
- Upgrade is valid (both orbs share the same affixId, neither is already T4)
- Base stats can only be set in Round 1
- Round-appropriate actions (no swaps in Round 1 — nothing to swap yet)

### Empty Slots

No penalty for empty affix slots. A player who leaves slots empty simply has fewer stats. This is a valid strategic choice (e.g., concentrating flux on powerful combinations rather than filling every slot).

---

## 9. Stat Calculator

### Calculation Pipeline

```
Input: Loadout (weapon + armor), DataRegistry
Output: DerivedStats

Pipeline:
1. Start with base values: { maxHP: balance.baseHP, all others: 0 }
2. Apply base item inherent bonuses (e.g., Sword: +5% crit, +5% AS)
3. Apply base stat scaling:
   - For each base stat on weapon: apply weapon scaling multipliers from `balance.json`
   - For each base stat on armor: apply armor scaling multipliers from `balance.json`
   - **Doubling:** If a player picks the same stat twice (e.g., DEX/DEX), each allocation applies independently at full value. DEX/DEX = 2x the DEX scaling bonus. This is intentionally powerful but narrow — you gain maximum specialization at the cost of zero secondary stat benefit.
4. Iterate all equipped slots on weapon:
   - For single orbs: look up affixDef, apply weaponEffect modifiers
   - For compounds: look up compoundDef, apply weaponEffect modifiers
   - For upgraded orbs: look up affixDef at upgraded tier, apply weaponEffect
5. Iterate all equipped slots on armor:
   - Same as above but apply armorEffect modifiers
6. Detect active synergies:
   - Collect all affix tags across both items
   - Check each synergy's requiredAffixes against collected tags/affixIds
   - Apply bonus effects for active synergies
7. Apply modifier ordering:
   - All 'flat' modifiers first
   - Then all 'percent' modifiers (multiplicative on the flat total)
   - Then 'override' modifiers (rare, used for special synergy effects)
8. Apply caps/floors:
   - critChance: [0, 0.95]
   - dodgeChance: [0, 0.75]
   - blockChance: [0, 0.75]
   - attackInterval: [minAttackInterval, ∞]
   - All resistances: [0, 0.90]
9. Return frozen DerivedStats
```

### Base Stat Scaling

| Base Stat | Weapon Scaling | Armor Scaling |
|-----------|---------------|---------------|
| STR | Physical damage +X per point, flat damage effectiveness | Armor value, damage reduction |
| INT | Elemental damage +X per point, DOT damage | Elemental resistances, barrier strength |
| DEX | Crit chance, attack speed, penetration | Dodge chance, crit avoidance |
| VIT | Lifesteal effectiveness, HP bonus | Max HP, HP regen, sustain effects |

The specific per-point values live in `balance.json.baseStatScaling`.

---

## 10. Duel Simulation Engine

### Architecture

The duel engine is the most complex single module. It is a deterministic tick-based simulation.

```typescript
function simulate(
  stats: [DerivedStats, DerivedStats],
  loadouts: [Loadout, Loadout],
  registry: DataRegistry,
  rng: SeededRNG,
): CombatLog;
```

### Tick Loop

```
Initialize:
  - Create GladiatorRuntime for each player from DerivedStats
  - Apply initiative: faster player's first attack comes sooner
  - Set barrier amounts

Per tick (0 to maxDuelTicks):
  1. Process DOT ticks for both gladiators
     - Each active DOT deals damagePerTick
     - Reduce remainingTicks; remove expired DOTs
     - Apply DOT multiplier and resistance

  2. Process HP regeneration for both gladiators

  3. For each gladiator (ordered by initiative on tick 0, then alternating):
     a. Decrement attackTimer
     b. If attackTimer <= 0:
        - Check if stunned → skip attack, decrement stun
        - Roll dodge (defender's dodgeChance): if dodged → emit dodge event, skip
        - Roll block (defender's blockChance - attacker's blockBreakChance):
          if blocked → emit block event, trigger on-block effects, skip damage
        - Calculate raw damage:
          physical = physicalDamage * (1 - armor * (1 - armorPenetration))
          elemental per type = elementalDamage[type] * (1 - resistance[type] * (1 - elementalPenetration))
        - Roll crit (critChance - defender critAvoidance):
          if crit → multiply by critMultiplier → emit crit event
        - Apply barrier absorption first (reduce barrier, remainder hits HP)
        - Apply damage to HP
        - Process on-hit triggers (attacker side):
          Check each trigger affix: roll chance, apply effect if proc'd
        - Process on-taking-damage triggers (defender side)
        - Apply lifesteal (% of total damage dealt, healed to attacker)
        - Apply thorns (flat damage from defender to attacker)
        - Check on-low-HP triggers (if either gladiator below 30%)
        - Reset attackTimer = attackInterval (adjusted by slows)

  4. Check death: if either HP <= 0 → emit death event, end simulation
     - If both die same tick: higher remaining HP% wins (or RNG tiebreak)

  5. Record all events for this tick in CombatLog

Post-simulation:
  - If maxDuelTicks reached: higher HP% wins (or RNG tiebreak)
  - Return CombatLog with result
```

### Trigger System (Data-Driven)

Triggers are NOT hardcoded if/else chains. Each trigger affix resolves to a `TriggerDef`:

```typescript
interface TriggerDef {
  affixId: string;
  condition: 'on_hit' | 'on_crit' | 'on_block' | 'on_taking_damage' | 'on_low_hp' | 'on_kill';
  chance: number;           // 0-1
  cooldownTicks: number;    // 0 = no cooldown
  effect: TriggerEffect;
}

type TriggerEffect =
  | { kind: 'apply_dot'; element: Element; dps: number; durationTicks: number }
  | { kind: 'bonus_damage'; amount: number; damageType: 'physical' | Element }
  | { kind: 'heal'; amount: number; isPercent: boolean }
  | { kind: 'gain_barrier'; amount: number }
  | { kind: 'stun'; durationTicks: number }
  | { kind: 'stat_buff'; stat: keyof DerivedStats; value: number; durationTicks: number }
  | { kind: 'reflect_damage'; multiplier: number; durationTicks: number };
```

The trigger system iterates over all equipped triggers, checks their condition against the current combat event, rolls the chance, and applies the effect. Cooldowns are tracked per-trigger in the `GladiatorRuntime`.

### Compound Affix Effects

Compound affixes from combinations have their effects defined in `combinations.json`. Many compounds include embedded triggers (e.g., Ignite = "on hit, X% chance to apply enhanced Burn"). These are resolved into `TriggerDef` entries during stat calculation and fed into the trigger system.

---

## 11. AI System

### Strategy Pattern

```typescript
interface DraftStrategy {
  pickOrb(
    pool: OrbInstance[],
    myStockpile: OrbInstance[],
    opponentStockpile: OrbInstance[],
    registry: DataRegistry,
    rng: SeededRNG,
  ): string; // Returns orbUid to pick
}

interface ForgeStrategy {
  plan(
    stockpile: OrbInstance[],
    loadout: Loadout,
    fluxRemaining: number,
    round: 1 | 2 | 3,
    opponentStockpile: OrbInstance[],  // Visible to all tiers; higher tiers use it for counter-building
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[];
}

interface AdaptStrategy {
  adapt(
    previousDuelLog: CombatLog,
    opponentLoadout: Loadout,
    myLoadout: Loadout,
    myStockpile: OrbInstance[],
    fluxRemaining: number,
    registry: DataRegistry,
    rng: SeededRNG,
  ): ForgeAction[];
}
```

### Tier Behaviors

| Tier | Draft | Forge | Adapt |
|------|-------|-------|-------|
| 1 (Apprentice) | Pick highest tier orb | Random weapon/armor split | None |
| 2 (Journeyman) | Greedy single archetype (picks orbs matching first chosen tag) | Basic synergy awareness, prefers matching tags | None |
| 3 (Artisan) | Synergy-aware; mild denial (avoids giving opponent obvious combos) | Sensible combinations; balanced offense/defense split | Swaps 1-2 orbs toward counter |
| 4 (Master) | Multi-path evaluation; weighs deny vs. build value per pick | Optimal combinations; reads opponent stockpile for counter-building | Significant adaptation; reads patterns across rounds |
| 5 (Alloy) | Full scoring with lookahead; evaluates every pick's impact on own build + denial value | Near-optimal forging; exhaustive combination search; exploits matchup knowledge | Complete rebuild if needed; predicts opponent adaptation |

### Evaluation Heuristics

Shared primitives used by all tiers at different depths:

- **Orb value score:** Base stat value × tier multiplier × synergy potential (how many synergies this orb contributes to)
- **Denial value:** How much the opponent's best possible build improves with this orb (estimated from their stockpile)
- **Build coherence:** How well the current stockpile supports a focused archetype vs. being scattered
- **Combination potential:** Bonus score for orbs that enable high-value combinations

Higher tiers use these with more depth (Tier 5 evaluates all orbs; Tier 1 just picks the biggest number).

### AI "Thinking" Time

Higher-tier AI adds artificial delay (2-3s per pick) to create perceived intelligence and make the experience feel more competitive. This is cosmetic only.

### Post-Match AI Explanation

After each duel, AI can generate a text explanation of its reasoning:
- "I picked Cold because you had Fire + Chance on Hit — I expected Ignite and stacked Cold Resistance"
- This uses the decision logs from the strategy functions

---

## 12. Frontend Architecture

### Route Map

```
/                     → MainMenuPage
/queue                → MatchmakingPage
/match/:id/draft      → DraftPage
/match/:id/forge      → ForgePage
/match/:id/duel       → DuelPage
/match/:id/adapt      → AdaptPage
/match/:id/result     → PostMatchPage
/profile              → ProfilePage
/profile/:id          → ProfilePage (view other player)
/recipes              → RecipeBookPage
/collection           → CollectionPage
/leaderboard          → LeaderboardPage
/settings             → SettingsPage
```

### Screen Layouts

**DraftPage (most interaction-dense):**
```
┌──────────────────────────────────────┐
│     Timer  │  ROUND 1  │  Pick 5/15 │  ← Top bar
├──────────────────────────────────────┤
│ ▼ Opponent Stockpile (collapsible)   │  ← Shows their picks
├──────────────────────────────────────┤
│                                      │
│          Shared Orb Pool             │  ← Tappable grid, center stage
│        (tap to preview, tap          │
│         again to confirm)            │
│                                      │
├──────────────────────────────────────┤
│ ▲ Your Stockpile (expandable)        │  ← Shows your picks
└──────────────────────────────────────┘
```

**ForgePage (highest layout complexity):**
```
┌──────────────────────────────────────┐
│  Timer  │  FORGE  │  Flux: 5/8       │
├──────────────────────────────────────┤
│  Synergy Tracker (badges/pills)      │
├────────────────┬─────────────────────┤
│    WEAPON      │      ARMOR          │
│ [Base: STR/DEX]│ [Base: VIT/INT]     │
│ ┌──┐ ┌──┐ ┌──┐│ ┌──┐ ┌──┐ ┌──┐    │
│ │S1│ │S2│ │S3││ │S1│ │S2│ │S3│    │  ← Drop targets
│ └──┘ └──┘ └──┘│ └──┘ └──┘ └──┘    │
│ ┌──┐ ┌──┐ ┌──┐│ ┌──┐ ┌──┐ ┌──┐    │
│ │S4│ │S5│ │S6││ │S4│ │S5│ │S6│    │
│ └──┘ └──┘ └──┘│ └──┘ └──┘ └──┘    │
├────────────────┴─────────────────────┤
│  [Combination Zone: drag 2 here]     │
├──────────────────────────────────────┤
│ ◀ Your Orbs (scrollable tray) ▶     │  ← Draggable orbs
├──────────────────────────────────────┤
│ ▼ Opponent Stockpile (collapsible)   │
└──────────────────────────────────────┘
```

**DuelPage (hybrid React + PixiJS):**
```
┌──────────────────────────────────────┐
│  HP [████████░░] vs [██████████]  HP │  ← React overlay (HP bars)
│  Status: 🔥🧊   Status: ⚡💀       │  ← React overlay (status icons)
├──────────────────────────────────────┤
│                                      │
│         PixiJS Canvas                │
│     ⚔️ Gladiator vs Gladiator ⚔️    │  ← Sprite animations + VFX
│         (10-15 seconds)              │
│                                      │
├──────────────────────────────────────┤
│  [Synergy Callout: "ASSASSIN!" ]     │  ← React overlay (procs)
├──────────────────────────────────────┤
│  Post-Duel Breakdown (slides up)     │
│  • Stat Comparison bars              │
│  • Synergy contributions             │
│  • Key moments timeline              │
└──────────────────────────────────────┘
```

### Key UX Patterns

**Two-tap pick system:** OrbCard has states: `idle` → `previewing` (enlarged, info tooltip, CONFIRM button) → `taken` (greyed out). First tap previews; second tap (or confirm button) dispatches pick. Tapping elsewhere cancels. Prevents mobile misclicks.

**Pointer event drag (not HTML5 drag API):** `useDragOrb` tracks `pointerdown`/`pointermove`/`pointerup`, renders a floating clone at touch position, hit-tests against slot bounding rects on release. Works on all mobile browsers.

**Haptic feedback:** `useHaptic` hook wraps the Vibration API. Triggers on: orb pick, forge slot placement, synergy activation, duel hits, crit strikes, match result.

**Colorblind accessibility:** Every element/stat uses BOTH color AND shape. Fire = orange + flame icon, Cold = blue + snowflake, Lightning = yellow + bolt, Poison = green + skull, Shadow = purple + void circle. Orb tier uses glow intensity + border style (solid/dashed/double/triple).

**Portrait orientation:** All screens designed for portrait. `useOrientation` hook shows a gentle warning on landscape. No hard lock (CSS handles layout, not JS orientation lock).

**Collapsible panels:** Stockpile panels use swipe-to-expand on mobile. Default: collapsed showing count + last few orbs. Expanded: full scrollable list.

---

## 13. Zustand Store Architecture

### Store Principles

- **No cross-store imports.** Stores don't reference each other directly. Cross-store coordination happens in page-level hooks.
- **`immer` middleware** on `forgeStore` and `draftStore` for ergonomic nested state updates.
- **`persist` middleware** on `authStore` and `uiStore` only (localStorage). Match state is ephemeral.
- **`subscribeWithSelector`** for PixiJS integration — duel scene subscribes to `duelStore.playbackIndex`.

### Store Definitions

```typescript
// authStore.ts — persisted
interface AuthStore {
  user: User | null;
  session: Session | null;
  signIn(provider: 'google' | 'discord' | 'apple'): Promise<void>;
  signOut(): Promise<void>;
}

// matchStore.ts — ephemeral
interface MatchStore {
  matchId: string | null;
  mode: 'quick' | 'unranked' | 'ranked';
  phase: 'draft' | 'forge' | 'duel' | 'adapt' | 'complete';
  round: 1 | 2 | 3;
  scores: [number, number];
  isAiMatch: boolean;
  opponentId: string | null;
  baseWeaponId: string;
  baseArmorId: string;
  setMatch(data: MatchData): void;
  advancePhase(phase: string): void;
  setScores(s: [number, number]): void;
  reset(): void;
}

// draftStore.ts — immer middleware
interface DraftStore {
  pool: OrbInstance[];
  myStockpile: OrbInstance[];
  opponentStockpile: OrbInstance[];
  currentTurn: 'self' | 'opponent';
  pickCount: number;
  timerEnd: number;              // Unix timestamp
  previewedOrb: OrbInstance | null;
  previewOrb(orb: OrbInstance): void;
  confirmPick(): Promise<void>;  // Sends to server, optimistic update
  applyOpponentPick(orbUid: string): void;
  cancelPreview(): void;
  setPool(pool: OrbInstance[]): void;
  handleTimeout(): void;         // Auto-pick random
}

// forgeStore.ts — immer middleware
interface ForgeStore {
  availableOrbs: OrbInstance[];  // Stockpile minus already-placed orbs
  weapon: ForgedItem;
  armor: ForgedItem;
  fluxRemaining: number;
  fluxMax: number;
  round: 1 | 2 | 3;
  synergies: ActiveSynergy[];
  timerEnd: number;
  assignOrb(orbUid: string, target: 'weapon' | 'armor', slotIndex: number): void;
  combineOrbs(uid1: string, uid2: string, target: 'weapon' | 'armor', slotIndex: number): void;
  upgradeTier(uid1: string, uid2: string, target: 'weapon' | 'armor', slotIndex: number): void;
  swapOrb(target: 'weapon' | 'armor', slotIndex: number, newOrbUid: string): void;
  removeOrb(target: 'weapon' | 'armor', slotIndex: number): void;
  setBaseStats(target: 'weapon' | 'armor', stat1: BaseStat, stat2: BaseStat): void;
  recalcSynergies(): void;
  submitBuild(): Promise<void>;
}

// duelStore.ts
interface DuelStore {
  combatLog: CombatLog | null;
  playbackIndex: number;         // Current tick being animated
  isPlaying: boolean;
  playbackSpeed: number;         // 1x, 2x
  playerStats: DerivedStats | null;
  opponentStats: DerivedStats | null;
  playerLoadout: Loadout | null;
  opponentLoadout: Loadout | null;
  breakdown: DuelBreakdown | null;
  loadDuel(log: CombatLog, loadouts: [Loadout, Loadout], stats: [DerivedStats, DerivedStats]): void;
  advancePlayback(): void;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  setBreakdown(b: DuelBreakdown): void;
}

// uiStore.ts — persisted
interface UIStore {
  activeModal: string | null;
  toasts: Toast[];
  colorblindMode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
  hapticEnabled: boolean;
  showModal(type: string): void;
  dismissModal(): void;
  pushToast(t: Toast): void;
  setColorblindMode(m: string): void;
  setHaptic(enabled: boolean): void;
}

// profileStore.ts
interface ProfileStore {
  profile: PlayerProfile | null;
  rank: string;
  elo: number;
  level: number;
  masteryTracks: MasteryProgress[];
  matchHistory: MatchSummary[];
  fetchProfile(): Promise<void>;
  fetchMatchHistory(cursor?: string): Promise<void>;
}
```

---

## 14. PixiJS Duel Renderer

### Mounting

```typescript
// usePixiApp.ts
function usePixiApp(containerRef: RefObject<HTMLDivElement>) {
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    let cancelled = false;
    const app = new Application();

    (async () => {
      await app.init({
        resizeTo: containerRef.current!,
        backgroundAlpha: 0,
        antialias: true,
      });
      if (cancelled) { app.destroy(true); return; }
      containerRef.current!.appendChild(app.canvas);
      appRef.current = app;
    })();

    return () => { cancelled = true; app.destroy(true); };
  }, []);

  return appRef;
}
```

PixiJS is loaded via dynamic `import()` — only downloaded when entering a duel. Not in the main bundle.

### Scene Graph

```
Stage
├── BackgroundSprite         # Arena backdrop
├── GladiatorContainer[0]    # Player
│   ├── GladiatorSprite      # AnimatedSprite (idle/attack/hit/death states)
│   └── ShadowSprite         # Ground shadow
├── GladiatorContainer[1]    # Opponent
│   ├── GladiatorSprite
│   └── ShadowSprite
├── VFXLayer                 # ParticleContainer for all effects
│   └── [Effect instances spawned dynamically]
└── DamageNumberLayer        # Floating text (BitmapText for performance)
```

### Playback Pipeline

1. Server returns `CombatLog` with tick-by-tick events
2. `useDuelPlayback` sets up a `requestAnimationFrame` loop synced to Pixi `app.ticker`
3. Each frame, check if `elapsedTicks >= nextEvent.tick`
4. When an event fires, dispatch to scene:
   - `attack` → Play attack animation, spawn damage number, shake on crit
   - `block` → Shield flash sprite, "BLOCKED" text
   - `dodge` → Blur/sidestep animation, "DODGED" text
   - `dot_apply` → Start looping particle effect on target
   - `dot_tick` → Small damage number in element color
   - `lifesteal` → Green healing particles from target to attacker
   - `thorns` → Red spark on attacker
   - `trigger_proc` → Unique VFX per compound (Ignite = flame spiral, etc.)
   - `synergy_proc` → Golden burst + synergy name (emitted to React HUD)
   - `death` → Death animation, fight end sequence
5. React HUD subscribes to `duelStore` for HP values, status effects

### VFX System

```typescript
abstract class BaseEffect extends Container {
  abstract play(origin: Point, target: Point): Promise<void>;
  abstract stop(): void;
}

// Each element has a distinct effect class
class FireEffect extends BaseEffect { /* Ember particles, flame trail */ }
class IceEffect extends BaseEffect { /* Frost crystals, blue tint */ }
class LightningEffect extends BaseEffect { /* Electric arcs, white flash */ }
class PoisonEffect extends BaseEffect { /* Green cloud, stacking opacity */ }
class ShadowEffect extends BaseEffect { /* Dark tendrils, purple glow */ }
class ChaosEffect extends BaseEffect { /* Multicolor distortion, reality-tear particles */ }
class CritEffect extends BaseEffect { /* Screen shake, gold enlarged number */ }
```

### Performance Budget

- Target 60fps on mid-range phones (2020-era)
- Max 200 active particles at once
- Gladiator spritesheets: 512x512 atlas, 8-12 frames per state
- Canvas resolution = CSS size (no supersampling on mobile)
- Particle textures: 32x32 or 64x64 max

---

## 15. Supabase Backend

### Database Schema

```sql
-- profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  elo INTEGER NOT NULL DEFAULT 1000,
  rank_tier TEXT NOT NULL DEFAULT 'copper',
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  matches_played INTEGER NOT NULL DEFAULT 0,
  matches_won INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- seasons
CREATE TABLE seasons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false
);

-- matches
CREATE TYPE match_phase AS ENUM ('draft', 'forge', 'duel', 'adapt', 'complete');
CREATE TYPE match_result AS ENUM ('player1_win', 'player2_win', 'draw', 'forfeit');

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL REFERENCES profiles(id),
  player2_id UUID REFERENCES profiles(id),        -- NULL for AI matches
  is_ai_match BOOLEAN NOT NULL DEFAULT false,
  ai_difficulty INTEGER,                           -- 1-5
  mode TEXT NOT NULL DEFAULT 'quick',              -- 'quick', 'unranked', 'ranked'
  season_id INTEGER REFERENCES seasons(id),
  phase match_phase NOT NULL DEFAULT 'draft',
  round INTEGER NOT NULL DEFAULT 1,
  scores JSONB NOT NULL DEFAULT '[0, 0]',
  pool_seed BIGINT NOT NULL,                       -- Deterministic seed
  base_weapon_id TEXT NOT NULL,
  base_armor_id TEXT NOT NULL,
  result match_result,
  elo_delta INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- match_rounds (per-round state)
CREATE TABLE match_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  draft_picks JSONB,                               -- [{player: 0|1, orbUid, order}]
  player1_build JSONB,                             -- Forge result (hidden until duel)
  player2_build JSONB,
  duel_event_log JSONB,                            -- CombatLog
  duel_winner INTEGER,                             -- 0, 1, or null
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, round),
  CHECK (round BETWEEN 1 AND 3)
);

-- mastery_tracks
CREATE TABLE mastery_tracks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  max_level INTEGER NOT NULL DEFAULT 10
);

-- player_mastery
CREATE TABLE player_mastery (
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES mastery_tracks(id),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, track_id)
);

-- unlocks
CREATE TABLE unlocks (
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  unlock_type TEXT NOT NULL,
  unlock_key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, unlock_type, unlock_key)
);

-- matchmaking_queue
CREATE TABLE matchmaking_queue (
  player_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  elo INTEGER NOT NULL,
  rank_tier TEXT NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- leaderboard (materialized view, refreshed every 5 minutes via pg_cron)
CREATE MATERIALIZED VIEW leaderboard AS
  SELECT id, display_name, elo, rank_tier,
         ROW_NUMBER() OVER (ORDER BY elo DESC) AS position
  FROM profiles
  WHERE matches_played >= 10
  ORDER BY elo DESC
  LIMIT 500;

-- Refresh schedule (add to pg_cron setup)
-- SELECT cron.schedule('refresh-leaderboard', '*/5 * * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard');

-- Season-scoped leaderboard can be added as a function:
-- Pass season_id to filter matches within the season's date range

-- Indexes
CREATE INDEX idx_matches_player1 ON matches(player1_id);
CREATE INDEX idx_matches_player2 ON matches(player2_id);
CREATE INDEX idx_match_rounds_match ON match_rounds(match_id);
CREATE INDEX idx_matchmaking_elo ON matchmaking_queue(elo);
```

### Row Level Security

```sql
-- Profiles: read any, update own
CREATE POLICY profiles_read ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);

-- Matches: read own matches
CREATE POLICY matches_read ON matches FOR SELECT
  USING (player1_id = auth.uid() OR player2_id = auth.uid());

-- Match rounds: read own (opponent build hidden via API, not RLS)
CREATE POLICY rounds_read ON match_rounds FOR SELECT
  USING (match_id IN (
    SELECT id FROM matches WHERE player1_id = auth.uid() OR player2_id = auth.uid()
  ));

-- Mastery/unlocks: own only
CREATE POLICY mastery_read ON player_mastery FOR SELECT USING (player_id = auth.uid());
CREATE POLICY unlocks_read ON unlocks FOR SELECT USING (player_id = auth.uid());

-- Queue: insert/delete own
CREATE POLICY queue_insert ON matchmaking_queue FOR INSERT WITH CHECK (player_id = auth.uid());
CREATE POLICY queue_delete ON matchmaking_queue FOR DELETE USING (player_id = auth.uid());

-- All inserts/updates to matches and match_rounds via Edge Functions (service role key)
```

### Opponent Build Privacy

During the forge phase, the opponent's build must not be visible. RLS alone can't handle column-level visibility that changes by phase. Solution: Edge Functions return match state with opponent build fields nullified until the duel phase begins. The client never directly queries `match_rounds` — it goes through the `match-state` Edge Function which applies visibility rules.

---

## 16. Real-time Multiplayer Protocol

### Channel Architecture

Each match uses a Supabase Realtime **Broadcast channel**: `match:{matchId}`.

Broadcast (not Postgres Changes) is used because:
- Lower latency (no DB polling)
- Ephemeral pub/sub matches the draft's real-time needs
- Match state is persisted separately via Edge Functions

### Draft Phase Protocol

```
Player taps orb → previewOrb() [local only, no network]
Player confirms → confirmPick():
  1. Optimistic update: move orb from pool to myStockpile
  2. Call Edge Function: POST /draft-pick { matchId, orbUid }
  3. Edge Function validates:
     a. Correct player's turn
     b. Orb still available (check draft_picks in DB)
     c. Timer not expired
  4. If valid:
     - Append to draft_picks in match_rounds
     - Broadcast: { event: 'draft:pick', player, orbUid, pickOrder }
     - Broadcast: { event: 'draft:timer_sync', timerEnd }
  5. If invalid:
     - Return error → client rolls back optimistic update
  6. On timeout (server-side):
     - Auto-pick random orb → broadcast pick event
```

### Forge Phase Protocol

Minimal sync — builds are private:
```
- Phase start: server broadcasts { event: 'phase:forge', round, timerEnd }
- Players forge locally, NO broadcasts
- Submit: POST /forge-submit { matchId, round, build }
- When both submitted (or timer expires):
  - Server runs duel simulation
  - Broadcasts { event: 'phase:duel', combatLog, builds }
```

### Duel Phase Protocol

No real-time sync. Both clients receive identical `CombatLog` and play it back locally. Deterministic engine ensures identical visuals.

### Adapt Phase Protocol

Same as forge phase but with reduced flux. Server broadcasts phase change with new flux allocation. The Adapt phase is functionally identical to Forge but:
- Uses `MatchPhase { kind: 'adapt'; round: 2 | 3 }` to distinguish in UI (different header text, shows opponent's previous build)
- Flux comes from `fluxPerRound[round - 1]` (4 for round 2, 2 for round 3)
- Existing locked orbs can be swapped (1 flux each) or new orbs placed in empty slots

### Disconnect / Forfeit Handling

**Disconnect detection:** Supabase Realtime presence tracks online status. If a player's presence drops:
- **During draft:** Server waits 15 seconds for reconnect. If not reconnected, auto-picks random orbs for all remaining turns.
- **During forge:** Server waits until forge timer expires, then auto-submits whatever build the player has (even if incomplete).
- **During duel:** No action needed — duel is pre-computed. Both clients play back independently.
- **Between rounds:** Same as forge — timer-based auto-submit with empty forge actions.

**Reconnection:** A player can rejoin by calling `GET /match-state` which returns the full current state. The client rehydrates all stores and resumes from the current phase. No special reconnection endpoint needed.

**Forfeit:** A player can explicitly forfeit via `POST /functions/v1/forfeit { matchId }`. The match is immediately marked `result: 'forfeit'` with the forfeiting player as the loser. ELO is adjusted as a normal loss. Opponent receives a win notification.

### Duel Phase Auto-Advance

After the forge-submit Edge Function runs the duel simulation and broadcasts the `CombatLog`, the server automatically schedules a phase advance after `duelPlaybackDuration + 3 seconds` buffer. This eliminates the race condition of both players calling `duel-complete`. The server auto-advances to the next phase (adapt or complete) on a timer. Clients can call `duel-complete` early to acknowledge, but the server does not wait for both.

---

## 17. API / Edge Function Endpoints

All Edge Functions import `@alloy/engine` for validation and simulation. The engine is bundled into each function.

### Endpoints

**POST /functions/v1/matchmaking**
```
Body: { action: 'join' | 'leave' }
Auth: Bearer token
Join: Insert into matchmaking_queue, trigger ELO-based matching
Leave: Remove from queue
Returns: { status: 'queued' } | { status: 'matched', matchId }
```

### Matchmaking Algorithm

ELO-based matching with expanding search window:
- **Initial window:** ±50 ELO for the first 5 seconds
- **Expansion:** Window grows by ±25 ELO every 5 seconds, up to ±200 max
- **Rank tier constraint:** Players can only match within ±1 rank tier (e.g., Steel can match Iron or Mythril, not Copper)
- **Edge cases:** If queue has only 1 player after 60 seconds, offer AI match option via client notification
- **Implementation:** A Supabase `pg_cron` job runs every 3 seconds, queries the queue ordered by `queued_at`, and attempts to pair players within ELO range. On successful pairing, it calls `match-create` internally and removes both from queue.

**POST /functions/v1/match-create**
```
Body: { player1Id, player2Id, mode, seasonId? }
Auth: Service role (called by matchmaking)
- Generate pool seed (crypto.getRandomValues)
- Select base weapon/armor type (random from unlocked set)
- Create matches row + match_rounds row for round 1
- Generate pool from seed using engine, validate archetypes
- Broadcast match start to both players
Returns: { matchId, poolSeed, baseWeaponId, baseArmorId }
```

**POST /functions/v1/draft-pick**
```
Body: { matchId, orbUid }
Auth: Bearer token
- Validate turn, orb availability, timer
- Update draft_picks in match_rounds
- Broadcast pick to channel
- If all picks done → transition to forge
Returns: { success: true, pickOrder } | { error }
```

**POST /functions/v1/forge-submit**
```
Body: { matchId, round, build: { weapon: ForgedItem, armor: ForgedItem } }
Auth: Bearer token
- Validate build using engine (flux limits, valid combinations, orbs owned, slots valid)
- Store in match_rounds
- If both submitted (or timer expired with auto-submit):
  1. Calculate DerivedStats for both players
  2. Run duel simulation using engine
  3. Store CombatLog in match_rounds
  4. Determine round winner
  5. Update match scores
  6. Broadcast { event: 'phase:duel', combatLog, revealedBuilds }
Returns: { success: true }
```

**POST /functions/v1/duel-complete**
```
Body: { matchId, round }
Auth: Bearer token
- If more rounds needed:
  - Advance to next round (forge/adapt phase)
  - Broadcast phase change
- If match decided (player has 2 wins, or round 3 complete):
  - Calculate ELO delta (standard ELO formula, K=32)
  - Update profiles (elo, rank_tier, xp, matches_played, matches_won)
  - Update mastery tracks based on affixes used
  - Check for level-up unlocks
  - Record final result
  - Broadcast { event: 'match:complete', result, stats }
Returns: { matchResult, eloDelta, xpGained, masteryProgress[], levelUp?, unlocks[] }
```

**GET /functions/v1/match-state?matchId={id}**
```
Auth: Bearer token
- Returns current match state with visibility filtering:
  - During forge: opponent build = null
  - During/after duel: opponent build revealed
  - Stockpile: all drafted orbs shown, used ones marked
  - **Used-orb marking algorithm:** An orb is "used" if its `uid` appears in any slot of either the weapon or armor `ForgedItem`. The Edge Function cross-references the player's stockpile against their loadout slots (including compound slot members) and returns each orb with a `usedIn: 'weapon' | 'armor' | null` field. For the opponent's stockpile (after duel reveal), the same algorithm runs against the opponent's revealed loadout.
Returns: { match, currentRound, pool, myStockpile, opponentStockpile, builds, combatLog? }
```

**POST /functions/v1/ai-match-create**
```
Body: { difficulty: 1-5, mode: 'quick' | 'unranked' }
Auth: Bearer token
- Creates match with is_ai_match=true
- Pool seed generated server-side
- Match runs entirely client-side (offline capable)
- Results posted back for stat tracking
Returns: { matchId, poolSeed, baseWeaponId, baseArmorId }
```

### Network Error Recovery

Mobile-first means network unreliability is expected. Standard patterns:

- **Optimistic updates with rollback:** Draft picks and forge actions apply locally immediately. If the server rejects (network error or validation failure), the client rolls back to the last confirmed state.
- **Retry with exponential backoff:** Failed Edge Function calls retry up to 3 times with 1s, 2s, 4s delays. After 3 failures, show a "Connection lost" banner with manual retry button.
- **Reconnection flow:** On disconnect, the client polls `match-state` every 5 seconds. On reconnect, it rehydrates all stores from the server response. The match continues from wherever it is — the server never waits for a disconnected client beyond the phase timer.
- **Graceful degradation:** If the Realtime channel drops during draft, fall back to polling `match-state` every 2 seconds until the channel reconnects. Picks may feel slightly delayed but the match continues.

### Edge Function Directory (Complete)

The `supabase/functions/` directory contains:
```
matchmaking/index.ts
match-create/index.ts
draft-pick/index.ts
forge-submit/index.ts
match-complete/index.ts    # Handles ELO update, progression, duel-complete acknowledgment
match-state/index.ts       # GET handler for match state with visibility filtering
ai-match-create/index.ts   # Creates AI match with server-generated seed
forfeit/index.ts           # Handles explicit forfeit
```

Note: Duel simulation runs inside `forge-submit` (triggered when both builds are received), not as a separate function. The `match-complete` function handles the post-duel ELO/progression logic.

---

## 18. Testing Strategy

### Engine Tests (Vitest)

**Unit tests per module:**

| Module | Key Test Cases |
|--------|---------------|
| `seeded-rng` | Determinism (same seed = same sequence), fork isolation, distribution uniformity |
| `pool-generator` | Tier distribution within tolerance, archetype viability, determinism, edge cases (tiny pool) |
| `draft-state` | Valid pick removes from pool/adds to stockpile, invalid pick errors, turn alternation, timeout auto-pick |
| `forge-state` | Assign costs flux, combine costs 2 flux + 2 slots, upgrade costs 1 flux, swap returns orb to stockpile, base stats lock after R1, flux budget enforcement |
| `stat-calculator` | Empty loadout = base stats, single affix correct, compound resolves correctly, synergy detection, modifier ordering (flat → percent), cap enforcement |
| `duel-engine` | Mirror match determinism, one-shot death, DOT kills, block/dodge rates match over N runs, trigger procs apply effects, tiebreaker logic, max tick limit |
| `trigger-system` | Each trigger condition fires correctly, cooldowns respected, effects apply (DOT, heal, barrier, stun) |
| `combinations` | All 28+ combinations produce valid compounds, invalid pairs return null |
| `synergies` | Tag matching logic, partial synergy detection (1 away), multi-item cross-synergy |
| `ai` | Each tier produces valid picks/builds, higher tiers beat lower tiers (>65% over N matches) |

**Integration tests:**

- **Full match simulation:** Generate pool → draft (two AIs) → forge → duel → 3 rounds. Run with 100 seeds, verify no crashes.
- **Determinism test:** Run same match (same seed, same AI tier) twice, verify byte-identical CombatLog.
- **Regression tests:** Store known-good match outputs as fixtures. Re-run and compare.

**Property-based tests (fast-check):**

- ForgeAction reducer never crashes regardless of random action sequence
- DuelEngine always terminates within maxTicks
- StatCalculator output: HP > 0, attackInterval >= minAttackInterval
- Pool generator always produces valid archetype distribution

### Frontend Tests

- **Component tests (Vitest + React Testing Library):** Key interaction flows (two-tap pick, drag-to-slot, combination preview)
- **Store tests:** Zustand stores tested in isolation with mock data
- **E2E tests (Playwright, future):** Full match flow from queue to post-match

### Balance Testing (Automated)

- Batch AI-vs-AI simulations (1000+ matches per config change)
- Track: synergy win rates, affix pick rates, combination usage, offense/defense distribution
- Flag: synergies with >55% win rate, affix pick rates <5%, unused combinations
- Run as CI job on data file changes

---

## 19. Development Sequence

### Phase 1: Engine Foundation (Weeks 1-3)

**Step 1.1:** Project scaffolding
- pnpm workspace, tsconfig, Vitest, tsup
- Engine package structure with barrel exports

**Step 1.2:** Types + Data Registry
- All type definitions
- JSON data files (affixes, combinations, synergies, base items, balance)
- Zod schemas + validation
- DataRegistry class with lookups

**Step 1.3:** Seeded RNG + Pool Generator
- xoshiro128** implementation with fork()
- Pool generation algorithm
- Archetype validation

**Step 1.4:** Draft System
- Draft state machine + reducer
- Pick validation, turn logic

**Step 1.5:** Forge System
- Forge state machine + reducer
- All forge actions (assign, combine, upgrade, swap, remove, set base stats)
- Flux tracker

**Step 1.6:** Stat Calculator
- Full calculation pipeline
- Base stat scaling, affix resolution, synergy detection
- Modifier ordering and caps

**Step 1.7:** Duel Engine
- Tick-based simulation loop
- Damage calculation (physical, elemental, DOT)
- Trigger system (data-driven)
- Combat log generation

**Step 1.8:** Match Controller
- Phase machine orchestration
- Full match lifecycle (pool → draft → forge → duel × 3 rounds)

### Phase 2: AI + Balance (Weeks 4-5)

**Step 2.1:** AI System
- Strategy interfaces
- Tier 1-3 implementations (sufficient for playtesting)
- Tier 4-5 (advanced, can be iterative)

**Step 2.2:** Automated Balance Testing
- Batch simulation runner
- Metrics collection (win rates, pick rates, etc.)
- Balance pass on data files

### Phase 3: Frontend Foundation (Weeks 6-8)

**Step 3.1:** Project setup
- Vite + React + Tailwind + Zustand
- Supabase client setup
- Router + page shells

**Step 3.2:** Draft Screen
- OrbPool, OrbCard, StockpilePanel
- Two-tap pick system
- Timer, turn indicator

**Step 3.3:** Forge Screen
- ItemSlots, OrbTray, drag-and-drop
- CombinationZone, BaseStatSelector
- FluxCounter, SynergyTracker

**Step 3.4:** Duel Screen
- PixiJS integration (DuelCanvas, usePixiApp)
- GladiatorSprite with animation states
- DuelHUD (React overlay: HP bars, status)
- PostDuelBreakdown

### Phase 4: Backend + Multiplayer (Weeks 9-11)

**Step 4.1:** Supabase setup
- Database migrations
- RLS policies
- Auth configuration

**Step 4.2:** Edge Functions
- match-create, draft-pick, forge-submit, duel-simulate, match-complete, match-state

**Step 4.3:** Real-time multiplayer
- Broadcast channel setup
- Draft sync (useDraftSync)
- Phase transition broadcasts

**Step 4.4:** Matchmaking
- Queue system
- ELO matching logic

### Phase 5: Polish + Meta (Weeks 12-14)

**Step 5.1:** VFX system
- Element-specific particle effects
- Damage numbers, status icons
- Synergy proc callouts

**Step 5.2:** Meta screens
- Profile, ranked ladder, mastery tracks
- Recipe book, collection
- Settings (colorblind, haptics)

**Step 5.3:** Progression
- XP + level system
- Mastery track XP
- Unlock flow (new weapons/armor at level thresholds)

**Step 5.4:** AI match mode
- Offline AI matches (client-side)
- 5 difficulty tiers
- Post-match AI reasoning

### Phase 6: Launch Prep (Weeks 15-16)

- Onboarding tutorial (5-match guided sequence)
- Ranked season system
- "Another!" rematch flow
- Performance optimization (mobile)
- Accessibility audit
- Analytics integration

---

## 20. Verification Plan

### Engine Verification

```bash
# Run all engine tests
cd packages/engine && pnpm test

# Run determinism verification (same seed = same output)
pnpm test -- --grep "determinism"

# Run balance simulation (1000 AI matches)
pnpm run simulate --matches=1000 --tiers=3v3

# Verify all data files validate against schemas
pnpm run validate-data
```

### Frontend Verification

```bash
# Run component tests
cd packages/client && pnpm test

# Dev server with hot reload
pnpm dev

# Build check (no TS errors, bundle size)
pnpm build
```

### Backend Verification

```bash
# Apply migrations locally
cd packages/supabase && supabase db reset

# Test Edge Functions locally
supabase functions serve

# Test matchmaking flow
curl -X POST http://localhost:54321/functions/v1/matchmaking \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action": "join"}'
```

### End-to-End Verification

1. Start Supabase locally (`supabase start`)
2. Start client dev server (`pnpm dev`)
3. Open two browser windows
4. Queue both → match found → draft → forge → duel → verify all phases work
5. Test AI match in offline mode (disconnect network after match starts)

### Balance Verification

After any data file change:
1. Run schema validation
2. Run 1000+ AI-vs-AI matches
3. Check no synergy > 55% win rate
4. Check no affix < 5% pick rate
5. Check all combinations are used at least 1% of eligible matches
6. Verify Quick Match produces "full" items (all 12 slots fillable)

---

## Key Architecture Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State model | Immutable state + action reducer | Determinism, replay, server authority, testability |
| RNG | Seeded xoshiro128** with fork() | Subsystem isolation, reproducibility |
| Data format | JSON + Zod validation | Balance changes without code changes, fail-fast on bad data |
| Stat resolution | Computed on demand, not stored | Single source of truth, no stale data |
| Duel engine | Tick-based loop (not event-based) | Simpler DOT/timer logic, deterministic ordering |
| AI architecture | Strategy pattern per tier | Clean separation, easy to add tiers |
| Package structure | pnpm monorepo (engine + client + supabase) | Engine testable in isolation, shared between client/server |
| Platform | React + Vite (web-first) | Fastest iteration, easy sharing, future mobile wrap |
| Duel rendering | PixiJS canvas + React HUD overlay | Accessible UI, performant sprites, clean separation |
| State management | Zustand (7 independent stores) | Lightweight, no boilerplate, decoupled stores |
| Backend | Supabase (Postgres + Realtime + Edge Functions) | Full BaaS, real-time draft sync, server authority |
| Real-time sync | Broadcast channels (not DB subscriptions) | Lower latency for draft picks |
| Build privacy | Edge Function filters (not RLS) | Column-level visibility that changes by phase |
| Testing | Vitest + fast-check + fixture regression | Unit + property-based + integration coverage |
