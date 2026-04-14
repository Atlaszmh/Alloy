# Gem Tier & Rarity UI Clarity Design

**Date:** 2026-04-14
**Status:** Approved
**Scope:** Client (GemCard, GemInspectPanel, GemEncyclopedia, stat-label utility)

---

## Problem

Gem rarity is a 1x–3x stat multiplier that fundamentally changes a gem's power, but the UI hides this:

1. **Stat labels show raw base values.** `getStatLabel()` in `stat-label.ts` returns the tier's base value from `affixes.json` without applying `RARITY_MULTIPLIERS`. A Legendary Tier 2 Fire Damage gem displays `+5` on the card, but the game engine applies `+15` (5 × 3.0). Players see identical numbers for Common and Legendary gems of the same tier.
2. **Rarity visual treatment is flat.** Common gems have a gray border. Non-common gems get a colored border + label. There's no progressive visual intensity — a Magic gem (1.25x) and a Legendary gem (3.0x) differ only in border color, not in visual weight.
3. **No breakdown exists anywhere.** Neither the inspect panel nor the encyclopedia shows how tier and rarity combine to produce effective values. Players have no way to learn the multiplier system.

---

## Goals

- Stat labels everywhere show **effective values** (base × rarity multiplier)
- Card visual intensity **scales progressively** with rarity — players feel the power difference at a glance
- Inspect panel shows a **contextual stat breakdown** table (base vs effective at the gem's rarity)
- Encyclopedia lets players **explore rarity impact** via interactive rarity selector tabs

---

## Changes

### 1. Effective Stat Values

**File:** `packages/client/src/shared/utils/stat-label.ts`

`getStatLabel()` currently returns raw tier values:

```ts
const stat = effects?.[0];
return stat.op === 'percent'
  ? `${Math.round(stat.value * 100)}%`
  : `+${stat.value}`;
```

Change to multiply by rarity:

```ts
import { RARITY_MULTIPLIERS, type GemRarity } from '@alloy/engine';

export function getStatLabel(
  affix: AffixDef,
  orb: GemInstance,
  target: 'weapon' | 'armor' = 'weapon',
): string {
  const tierData = affix.tiers[orb.tier as AffixTier];
  const effects = target === 'weapon' ? tierData?.weaponEffect : tierData?.armorEffect;
  const stat = effects?.[0];
  if (!stat) return '';
  const mult = RARITY_MULTIPLIERS[orb.rarity];
  const effective = stat.value * mult;
  return stat.op === 'percent'
    ? `${Math.round(effective * 100)}%`
    : `+${Number.isInteger(effective) ? effective : effective.toFixed(1)}`;
}
```

This single change flows effective values to all consumers: GemCard stat label, ForgeGemTray, ItemSocketView equipped list, and GemDetailPanel tooltip.

**Tests:** `stat-label.test.ts` currently only tests `getStatAbbreviation`. Add unit tests for `getStatLabel` covering: common rarity (1x, integer result), magic rarity (1.25x, fractional result with `toFixed(1)`), and percent stat formatting with rarity applied.

**Formatting rule:** Integer results show as `+15`, fractional results as `+7.5`. Use `toFixed(1)` for one decimal place when not an integer.

### 2. Progressive Card Animations

**File:** `packages/client/src/components/GemCard.tsx`

Add rarity-driven `box-shadow` animations that escalate in intensity. Common stays static. Each higher rarity gets a more prominent, faster-cycling glow pulse.

**Animation definitions** (add to `index.css` or as a `<style>` block in the component):

| Rarity | Animation | Duration | Effect |
|---|---|---|---|
| Common | none | — | Static, no glow beyond existing tier glow |
| Magic | `shimmer-magic` | 3s | Subtle blue glow pulse (6px → 14px) |
| Rare | `shimmer-rare` | 2.5s | Moderate yellow glow pulse (10px → 18px) |
| Epic | `pulse-epic` | 2s | Strong purple glow pulse (14px → 24px) |
| Legendary | `legendary-aura` | 2.5s | Multi-phase amber aura with outer halo (18px → 28px, double-layer) |

```css
@keyframes shimmer-magic {
  0%, 100% { box-shadow: 0 0 6px rgba(59, 130, 246, 0.3); }
  50% { box-shadow: 0 0 14px rgba(59, 130, 246, 0.6); }
}
@keyframes shimmer-rare {
  0%, 100% { box-shadow: 0 0 10px rgba(234, 179, 8, 0.3); }
  50% { box-shadow: 0 0 18px rgba(234, 179, 8, 0.6); }
}
@keyframes pulse-epic {
  0%, 100% { box-shadow: 0 0 14px rgba(168, 85, 247, 0.4); }
  50% { box-shadow: 0 0 24px rgba(168, 85, 247, 0.7); }
}
@keyframes legendary-aura {
  0% { box-shadow: 0 0 18px rgba(245, 158, 11, 0.5), 0 0 36px rgba(245, 158, 11, 0.15); }
  33% { box-shadow: 0 0 28px rgba(245, 158, 11, 0.7), 0 0 48px rgba(245, 158, 11, 0.25); }
  66% { box-shadow: 0 0 22px rgba(251, 191, 36, 0.6), 0 0 42px rgba(245, 158, 11, 0.2); }
  100% { box-shadow: 0 0 18px rgba(245, 158, 11, 0.5), 0 0 36px rgba(245, 158, 11, 0.15); }
}
```

**Accessibility:** Add a `prefers-reduced-motion` media query so users who disable animations see static glow fallbacks instead of pulsing:

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0s !important; }
}
```

**Border thickness ramp:** The current code uses `2.5px` for all gems. Keep `2.5px` for common through epic. Increase legendary to `3px`.

**Application in GemCard.tsx:** The card wrapper `<div>` currently sets `boxShadow` based on rarity/tier. Replace the static `boxShadow` assignment with the animation when rarity is non-common. The `animation` CSS property is applied inline via the existing style object:

```ts
const rarityAnimation: Record<GemRarity, string | undefined> = {
  common: undefined,
  magic: 'shimmer-magic 3s ease-in-out infinite',
  rare: 'shimmer-rare 2.5s ease-in-out infinite',
  epic: 'pulse-epic 2s ease-in-out infinite',
  legendary: 'legendary-aura 2.5s ease-in-out infinite',
};
```

When `rarity` is provided and not `'common'`, set `animation` on the card style and remove the static `boxShadow` (the animation controls it). When `rarity` is `'common'` or absent, fall back to the existing tier-based static glow.

### 3. Inspect Panel — Stat Breakdown Table

**File:** `packages/client/src/components/GemInspectPanel.tsx`

Add a stat breakdown table below the existing flavor text sections and above the tags. The table shows base tier values alongside effective values at the gem's actual rarity.

**Layout:**

```
┌─────────────────────────────┐
│  Base     │  Rare (1.5x)    │
├─────────────────────────────┤
│ T1  +3    │  +4.5           │
│ T2  +5    │  +7.5    ◄ current
│ T3  +7    │  +10.5          │
│ T4  +9    │  +13.5          │
├─────────────────────────────┤
│ Base: +5 × Rare (1.5x) = +7.5
└─────────────────────────────┘
```

**Behavior:**
- Column 1: "Base" — raw tier values from `affixes.json`, dim color (`#64748b`)
- Column 2: Rarity name + multiplier in header (e.g. `"Rare (1.5x)"`), colored with rarity color. Effective values = base × multiplier, rarity-colored text.
- Current tier row: highlighted with subtle rarity-tinted background (`rgba(rarityColor, 0.08)`) and a `◄` marker
- Footer: `"Base: +5 × Rare (1.5x) = +7.5"` — plain text summary of the math for the current tier
- Shows weapon OR armor effects based on the existing `context` prop:
  - `'weapon'` context → weapon effects table only
  - `'armor'` context → armor effects table only
  - `'both'` context → weapon table, then armor table, each with "On Weapon" / "On Armor" label
- For compound affixes (no tiers): single-row table, base vs effective

**One-sided gems:** If a gem has no effects on one axis (e.g. `armor_rating` has empty `weaponEffect`), omit that axis's table entirely — matching existing inspect panel behavior for flavor text sections.

**Data source:** The panel's `gem` prop object already has optional `tier`, `tiers`, `weaponEffect`, and `armorEffect` fields. Add `rarity: GemRarity` inside the existing `gem` prop (not as a top-level prop):

```ts
gem: {
  // existing fields...
  rarity?: GemRarity;  // NEW — needed for multiplier + column header
};
```

**Callers must be updated to pass `rarity` and `tiers`:**
- `Forge.tsx`: The current caller (lines 656–662) builds the `gem` object without `tier`, `tiers`, or `rarity`. Update to include all three from `inspectGem.gem` (the `GemInstance`) and `inspectGem.affixDef` (the `AffixDef`):
  ```tsx
  gem={{
    name: inspectGem.affixDef.name,
    description: inspectGem.affixDef.description,
    weaponFlavorText: inspectGem.affixDef.weaponFlavorText,
    armorFlavorText: inspectGem.affixDef.armorFlavorText,
    tags: inspectGem.affixDef.tags,
    rarity: inspectGem.gem.rarity,           // NEW
    tier: inspectGem.gem.tier,               // NEW
    tiers: 'tiers' in inspectGem.affixDef    // NEW — base affixes only
      ? (inspectGem.affixDef as AffixDef).tiers
      : undefined,
    weaponEffect: 'weaponEffect' in inspectGem.affixDef  // compounds
      ? inspectGem.affixDef.weaponEffect
      : undefined,
    armorEffect: 'armorEffect' in inspectGem.affixDef
      ? inspectGem.affixDef.armorEffect
      : undefined,
  }}
  ```
- Future callers (Draft): same pattern

### 4. Encyclopedia — Rarity Selector Tabs

**File:** `packages/client/src/pages/GemEncyclopedia.tsx`

Add a rarity tab bar above the existing stat tier list in the detail panel (right column).

**Tab bar:** `[Common] [Magic] [Rare] [Epic] [Legendary]`

- Default selection: `'common'` (1.0x — shows raw base values, matching JSON data)
- Each tab styled with its rarity color when active (background tint + text color), gray when inactive
- New state: `const [selectedRarity, setSelectedRarity] = useState<GemRarity>('common');`

**Stat display when a rarity is selected:**
- Each tier row shows the effective value prominently in rarity color
- Base value shown as dim annotation: `(base +5)`
- Footer below the tier list: `"Rare: 1.5x multiplier"`
- For compounds (single row, no tiers): same multiplication applied to the flat effects

**Implementation:** Multiply displayed values by `RARITY_MULTIPLIERS[selectedRarity]` at render time. No data model changes needed — the rarity tabs are purely a display-time calculation.

---

## Files Changed

| File | Change |
|---|---|
| `packages/client/src/shared/utils/stat-label.ts` | Apply rarity multiplier in `getStatLabel()` |
| `packages/client/src/shared/utils/stat-label.test.ts` | Add unit tests for `getStatLabel` with rarity multiplication |
| `packages/client/src/index.css` | Add 4 `@keyframes` for rarity glow animations + `prefers-reduced-motion` query |
| `packages/client/src/components/GemCard.tsx` | Apply rarity animation + border thickness ramp |
| `packages/client/src/components/GemInspectPanel.tsx` | Add stat breakdown table with base vs effective columns |
| `packages/client/src/pages/Forge.tsx` | Pass `rarity`, `tier`, and `tiers` to GemInspectPanel |
| `packages/client/src/pages/GemEncyclopedia.tsx` | Add rarity selector tabs + multiply displayed values |

---

## Build Order

1. **stat-label.ts** — effective values flow everywhere immediately
2. **index.css + GemCard.tsx** — progressive animations
3. **GemInspectPanel.tsx + Forge.tsx** — stat breakdown table
4. **GemEncyclopedia.tsx** — rarity selector tabs

Steps 1–2 are independent. Step 3 depends on the panel prop interface. Step 4 is independent of step 3.

---

## Out of Scope

- Changing gem art per rarity (same sprite, different border/glow treatment)
- Particle effects or WebGL shaders (CSS box-shadow only)
- Rarity display changes in the Duel/combat view (PixiJS scene — separate effort)
- Tooltip on hover (stat breakdown lives in the inspect panel only)
- Changes to the balance tool workbench (already shows raw engine data, appropriate for a design tool)
