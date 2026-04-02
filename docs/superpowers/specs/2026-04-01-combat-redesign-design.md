# Combat Phase Redesign — Design Spec

**Date:** 2026-04-01
**Status:** Draft
**Approach:** Layered Refactor — Engine First, UI Second

## Problem

The current combat phase is hard to read. Events stream as a flat list, damage math is hidden, and there's no clear visual rhythm to attacks. Players can't tell when the next swing happens, what type of damage was dealt, or how much was mitigated. The stat model uses internal fractions (0–1.0) that don't map to intuitive player-facing numbers.

## Goals

1. Replace fractional stat model with integer point-based stats players can reason about
2. Add base weapon/armor selection with distinct stat profiles
3. Make attack intervals visually clear with cooldown indicators + animations
4. Color-code all damage types in floating combat text and combat log
5. Restructure combat log from flat event stream to per-swing grouped breakdowns
6. Ensure game engine and playtest tool share identical code — zero divergence

## Non-Goals

- Full cinematic animations (future phase)
- New gem types or mechanics (future — system designed to support them)
- Balance tuning (placeholder values; real balance requires playtesting)

---

## Architectural Constraint: Single Source of Truth

The engine package (`packages/engine`) is the **only** place combat math, stat calculation, and item data lives. The playtest tool (`packages/tools`) imports and calls the exact same functions — it never reimplements formulas.

- `damage-calc.ts` — one implementation, used by both game and playtester
- `stat-calculator.ts` — one pipeline, used by both
- `duel-engine.ts` — one simulation loop, used by both
- `base-items.json`, `affixes.json`, `balance.json` — one set of data files
- The playtest tool provides UI for configuring inputs and visualization of outputs — never recalculates anything itself
- Any divergent logic in `packages/tools/useSimulation.ts` must be killed and replaced with engine imports

---

## Phase 1: Engine Stat Model Rework

### 1.1 Point-Based Stats

All player-facing stats are integers or clean decimals. No 0–1.0 fractions in the UI.

**Armor (physical mitigation):**
- Integer points (e.g., 10, 25, 50)
- Formula: `effectiveArmor = armorPoints × (1 - armorPenetration/100)`; `reduction% = effectiveArmor`, capped at 90%
- Armor penetration is also integer points (e.g., 15 = reduces effective armor by 15%)
- Gems add flat points: "adds 5 armor"

**Resistances (elemental mitigation):**
- Same model — integer points, 1 point = 1% reduction, capped at 90%
- One resistance value per element (fire, cold, lightning, poison, shadow, chaos)
- Elemental penetration works the same as armor penetration: reduces effective resistance
- Base armor provides innate resistances based on type
- **Migration note:** Existing `balance.json` uses "ice" — normalize to "cold" to match the `Element` type in `derived-stats.ts`. Add missing shadow/chaos resistance caps.

**Attack Interval (weapon speed):**
- Displayed in seconds (e.g., "2.0s", "1.2s", "3.5s")
- Stored internally as ticks (seconds × 30)
- Speed gems modify by flat tick reduction or percentage

**Physical Damage:**
- Each weapon has a base physical damage value
- Slow weapons hit harder (DPS slightly favors slow weapons for risk/reward)

**HP:**
- Base 200 from balance config
- Armor type can modify (+HP for heavy, -HP for light)

**Other existing stats — conversion to integer scale:**
- `critChance`: integer percentage (e.g., 15 = 15% crit chance), capped at 75%
- `dodgeChance`: integer percentage (e.g., 10 = 10% dodge), capped at 50%
- `blockChance`: integer percentage, capped at 50%
- `lifestealPercent`: integer percentage (e.g., 20 = 20% lifesteal)
- `dotMultiplier`: integer percentage bonus (e.g., 25 = 25% more DOT damage, stored as 125 internally)
- `armorPenetration`: integer points (reduces effective armor %)
- `elementalPenetration`: integer points (reduces effective resistance %)
- `stunChance`, `thornsDamage`: kept as integer values, same pattern
- `blockAmount`: integer flat damage absorbed when a block triggers (e.g., 15 = absorb 15 damage on block)

All stats follow the same convention: **integer values representing percentages or flat amounts**. No stat uses 0–1.0 fractions.

**Extensibility:** Stats are stored as `Record<string, number>` — adding a new stat is adding a key, not a type change.

### 1.2 Base Item System

**7 Weapons:**

| Weapon | Base Damage | Attack Speed | Identity |
|--------|------------|-------------|----------|
| Dagger | ~20 | 1.0s | Fast, crit-oriented |
| Sword | ~40 | 1.8s | Balanced all-rounder |
| Mace | ~50 | 2.2s | Armor penetration |
| Axe | ~60 | 2.5s | Raw physical power |
| Battleaxe | ~80 | 3.0s | Slow, devastating hits |
| Staff | ~25 | 2.0s | Elemental damage bonus |
| Wand | ~15 | 1.4s | Fast, elemental scaling |

**7 Armors:**

| Armor | Armor Pts | HP Mod | Identity |
|-------|----------|--------|----------|
| Cloth Robes | 5 | +0 | High elemental resist |
| Leather | 10 | +0 | Dodge chance |
| Studded Leather | 15 | +10 | Balanced light |
| Chainmail | 20 | +20 | Balanced |
| Scale Mail | 25 | +30 | Anti-elemental |
| Plate | 35 | +50 | Pure physical tank |
| Enchanted Robes | 8 | +0 | Highest spell bonuses |

**Migration from existing base-items.json:**
- The current schema uses `inherentBonuses: Array<{stat, op, value}>` and `unlockLevel`. This is a **wholesale replacement** — the new schema replaces `inherentBonuses` with `baseStats: Record<string, number>`.
- `unlockLevel` is removed — all items available from the start (progression gating is a future concern).
- Existing item IDs (e.g., `"dagger"`, `"sword"`) are reused where names overlap. New items get new IDs.
- The `stat-calculator.ts` pipeline is updated: instead of iterating `inherentBonuses` and applying `op` (add/multiply/set), it reads `baseStats` as flat initial values, then applies gem modifiers on top.
- Exact numeric values in the tables above are placeholders (indicated by `~`). Final values go in `base-items.json` and are tuned via the playtest tool. The relative relationships (dagger fast/weak, axe slow/strong) are the constraint.

**Selection UX:** First step of forge phase — pick weapon, then pick armor. Cards showing key stats. "Random" button for casual play (future: timed random-only event mode).

### 1.3 Rich Damage Breakdown Events

Every attack event carries a `DamageBreakdown`:

```typescript
interface DamageBreakdown {
  physical: {
    raw: number;
    armorPoints: number;
    armorPenetration: number;
    effectiveArmor: number;
    reductionPct: number;
    mitigated: number;
    net: number;
  };
  elemental: Record<Element, {
    raw: number;
    resistPoints: number;
    elementalPenetration: number;
    effectiveResist: number;
    reductionPct: number;
    mitigated: number;
    net: number;
  }>;
  blocked: number;          // damage absorbed by block (0 if no block)
  barrierAbsorbed: number;  // damage absorbed by barrier (0 if no barrier)
  totalRaw: number;
  totalMitigated: number;
  totalNet: number;         // after all mitigation, block, barrier
  isCrit: boolean;
  critMultiplier?: number;
  triggeredEffects?: Array<{ name: string; description: string }>; // procs that fired
}
```

DOT tick events (resistance applied using the same formula as per-swing damage, including elemental penetration):

```typescript
interface DotTickBreakdown {
  element: Element;
  damagePerTick: number;
  stacks: number;
  rawTotal: number;
  resistPoints: number;
  elementalPenetration: number;
  effectiveResist: number;
  reductionPct: number;
  netDamage: number;
}
```

Heal events:

```typescript
type HealSource = 'lifesteal' | 'regen' | 'hot' | 'burst';

interface HealBreakdown {
  source: HealSource;
  rawHeal: number;
  effectiveHeal: number;
  overheal: number;
}
```

When a new heal source is needed, add it to the `HealSource` union — this keeps the type strict and discoverable.

**Extensibility:** These are data structures, not class hierarchies. Adding a new damage type or mitigation layer means adding a field. The UI renders whatever fields are present by iterating over breakdown keys.

### 1.4 Damage Calculation Pipeline

`damage-calc.ts` refactored to:

1. Check dodge — if dodged, return early with zero-damage breakdown + `dodged: true`
2. Calculate raw physical damage (weapon base + gem bonuses)
3. Apply crit multiplier if crit triggers (roll against `critChance`)
4. Calculate raw elemental damage per element (gem sources, also critted)
5. Apply armor penetration: `effectiveArmor = max(0, armorPoints - armorPenetration)`
6. Apply armor mitigation to physical: `net = raw × (1 - min(effectiveArmor, 90)/100)`
7. Apply elemental penetration per element: `effectiveResist = max(0, resistPoints - elementalPenetration)`
8. Apply resistance mitigation per element: `net = raw × (1 - min(effectiveResist, 90)/100)`
9. Check block — if blocked, subtract `blockAmount` from total (can reduce to 0, not below)
10. Check barrier — if barrier active, subtract from remaining damage
11. Sum all net values for `totalNet`
12. Return full `DamageBreakdown` struct with every intermediate value populated

All reduction caps enforced at 90%. The breakdown struct contains every intermediate value so the combat log can show the full pipeline.

---

## Phase 2: Base Item Selection UI

### 2.1 Forge Phase Integration

Base item selection is the **first step** of the forge phase, before gem socketing.

**Component: `BaseItemSelector`**
- Props: `itemType: 'weapon' | 'armor'`, `items: BaseItem[]`, `onSelect: (item: BaseItem) => void`
- Renders a grid of `BaseItemCard` components
- Each card shows: name, icon, 2-3 key stats (damage/speed for weapons, armor/HP for armors), identity tagline
- Selected card gets a highlight border; confirm button advances to next step
- "Random" button picks randomly with a brief shuffle animation

**Flow within forge:**
1. Forge phase begins → show weapon selector
2. Player picks weapon (or random) → show armor selector
3. Player picks armor (or random) → proceed to gem socketing (existing flow)
4. Selected base items stored in match state alongside the gladiator's gem loadout

**State:** `selectedWeapon` and `selectedArmor` added to the forge round state in `useMatchStore`. Base item stats are merged into the gladiator's computed stats by `stat-calculator.ts` before gem modifiers are applied.

### 2.2 AI Opponent Items

- AI selects items using a simple strategy function: `selectAIItems(difficulty: Difficulty, playerDraftedGems: Gem[], availableItems: BaseItem[]): { weapon: BaseItem, armor: BaseItem }`
- Easy: random. Medium: weighted toward balanced items. Hard: counter-picks based on player's **gem draft** (e.g., if player drafted fire gems, AI picks high fire-resist armor — the gem draft is already visible before forge begins)
- AI selections happen simultaneously with player's item selection and are revealed on the pre-fight screen

---

## Phase 3: Combat UI Redesign

### 3.1 Screen Layout

**Space allocation:**
- Arena (animated battle scene): ~50% of viewport
- Combat log (per-swing breakdowns): ~40% of viewport
- Top bar (round pips + enemy HP): ~5% — single compact row
- Bottom bar (player HP): ~5% — single compact row

HP bars, round indicators, and time displays are compressed to minimal chrome. The arena and log are the primary focus.

### 3.2 Arena — Cooldown Indicators

**Implementation:** PixiJS `Graphics` objects drawn as arcs around each `GladiatorSprite`, updated each frame.

Each character has:
- **Circular cooldown ring** — a `PIXI.Graphics` arc drawn around the sprite container, filled proportionally to `(currentTick % attackInterval) / attackInterval`
- Ring color matches player identity (blue `#3b82f6` for player, red `#ef4444` for enemy)
- Background ring at 20% opacity shows the full circle; foreground arc fills clockwise
- **Weapon label** — a `PIXI.Text` below the character: speed + weapon name (e.g., "1.8s sword")
- When the ring completes (fill = 100%), the character attacks — ring resets to 0
- A brief "pulse" effect on the ring at attack moment (scale 1.0 → 1.15 → 1.0 over 6 frames)
- Ring fill rate directly reflects attack speed stat — faster weapons visibly fill faster

### 3.3 Arena — Floating Combat Text

Damage numbers appear near the target character and float upward with fade:

| Event | Size | Color | Style | Duration |
|-------|------|-------|-------|----------|
| Physical damage | 14-16px | White/Silver (#e2e8f0) | Normal | 60 frames |
| Fire damage | 14-16px | Orange (#f97316) | Normal | 60 frames |
| Cold damage | 14-16px | Cyan (#22d3ee) | Normal | 60 frames |
| Lightning damage | 14-16px | Yellow (#facc15) | Normal | 60 frames |
| Poison damage | 14-16px | Green (#4ade80) | Normal | 60 frames |
| Shadow damage | 14-16px | Purple (#a855f7) | Normal | 60 frames |
| Chaos damage | 14-16px | Magenta (#ec4899) | Normal | 60 frames |
| Critical hit | 28px | Gold (#fbbf24) | Bold, glow, text-shadow | 75 frames |
| Healing | 14px | Bright green (#34d399) | Bold, floats faster | 60 frames |
| Overheal | 14px | Dimmed green | Normal, subtle | 50 frames |
| Blocked | 12px | Grey (#94a3b8) | Monospace | 50 frames |
| Dodged | 12px | Blue (#60a5fa) | Monospace | 50 frames |

Multiple damage types from a single swing cascade — largest/most important on top, smaller hits trail below with decreasing opacity.

### 3.4 Combat Log — Per-Swing Groups

The log is a scrollable panel below the arena. Events grouped by "swing":

**Attack swing group:**
```
[8.4s] ⚔ You attack — Sword (1.8s)
    38 physical → -6 armor (15%) → 32
    18 fire     → -1 resist (5%) → 17
    +8 lifesteal (20% of phys)
    ★ CRIT | 47 total | Enemy: 124 HP
```

**DOT tick group:**
```
[8.0s] 🔥 Burn ×2 → 10 fire → -1 resist → 9 dealt | Enemy: 171
```

**Heal group:**
```
[6.0s] ♥ HP Regen → +3 HP | You: 200 HP (1 overheal)
```

**Color coding in log:**
- Each damage type's numbers use its element color
- Player attacks: neutral background
- Enemy attacks: subtle red tint
- DOT ticks: subtle element-colored tint
- Heal events: subtle green tint
- Arrow separators and labels in muted grey

**Newest events at top**, auto-scrolls as events arrive. Players can scroll back to review.

**Timestamps:** Engine events carry tick numbers. The log converts to seconds for display: `seconds = tick / 30`. Both values available in the event data.

### 3.5 Status Effects

Small icons near character sprites for active DOTs, buffs, debuffs. Element-colored borders. Pulse animation while active.

### 3.6 Future Animation Hooks

The architecture supports adding:
- Character idle/attack/hit/death sprite animations
- Weapon-specific swing animations
- Projectile effects for ranged weapons (staff, wand)
- Screen shake on big hits
- Post-fight replay controls

These are not in scope for this phase but the cooldown ring + event system is designed so animations slot in without refactoring.

---

## Damage Type Color Palette

| Type | Hex | Usage |
|------|-----|-------|
| Physical | #e2e8f0 | Default, neutral |
| Fire | #f97316 | Orange-red |
| Cold | #22d3ee | Ice blue |
| Lightning | #facc15 | Yellow/gold |
| Poison | #4ade80 | Green |
| Shadow | #a855f7 | Purple |
| Chaos | #ec4899 | Magenta/pink |
| Healing | #34d399 | Bright green |
| Crit | #fbbf24 | Gold, bold + glow |
| Blocked | #94a3b8 | Grey |
| Dodged | #60a5fa | Blue |

---

## Testing Strategy

- **Unit tests** for `damage-calc.ts` — verify breakdown math for every damage type, mitigation cap, crit multiplier, armor/elemental penetration, block, barrier, dodge, edge cases (0 armor, 90% cap, multi-element attacks, penetration exceeding armor)
- **Unit tests** for stat calculation pipeline — base item stats + gem modifiers = expected final stats
- **Unit tests** for `HealBreakdown` — lifesteal amounts, regen ticks, overheal capping at maxHP
- **Integration tests** for duel engine — run full simulations, verify event breakdowns sum correctly, HP deltas match
- **Playtest tool parity tests** — verify playtest tool produces identical results to game engine for same inputs
- **Component tests** for `BaseItemSelector` — renders all items, selection state, random button, flow progression
- **Component tests** for combat log grouping logic — verify swing groups are correctly assembled from event stream, color coding applied
- **Visual regression** — snapshot tests for combat log rendering (optional, lower priority)

---

## Implementation Order

**Phase 1: Engine (no UI changes)**
1. Define base item data structures and JSON
2. Refactor stat model to point-based integers
3. Refactor `damage-calc.ts` to output `DamageBreakdown`
4. Add `HealBreakdown` and `DotTickBreakdown` to event model
5. Update duel engine to emit rich events
6. Kill divergent logic in playtest tool, wire to engine
7. Unit + integration tests

**Phase 2: Forge UI**
8. Base item selection component
9. Wire into forge phase flow
10. AI item selection

**Phase 3: Combat UI**
11. Refactor duel screen layout (50/40/5/5 split)
12. New combat log panel with per-swing grouping
13. Updated floating combat text with color palette
14. Cooldown ring indicators
15. Status effect icons
16. Polish and visual testing
