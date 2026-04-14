# Gem Tier & Rarity UI Clarity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make gem tier and rarity visually clear and mechanically understandable — stat labels show effective values (base x rarity multiplier), cards animate progressively by rarity, inspect panel shows a stat breakdown table, encyclopedia gets rarity selector tabs.

**Architecture:** Four independent changes to the client package. `getStatLabel()` applies the rarity multiplier so all stat labels update globally. GemCard gets CSS keyframe animations per rarity. GemInspectPanel adds a base-vs-effective table with the current tier highlighted. GemEncyclopedia adds rarity tabs that recalculate displayed values at render time.

**Tech Stack:** React 19, TypeScript, CSS keyframes, Vitest

**Spec:** `docs/superpowers/specs/2026-04-14-gem-tier-rarity-ui-clarity-design.md`

---

## Chunk 1: Effective Stat Values + Progressive Card Animations

### Task 1: Apply rarity multiplier in getStatLabel

**Files:**
- Modify: `packages/client/src/shared/utils/stat-label.ts:37-49`
- Modify: `packages/client/src/shared/utils/stat-label.test.ts`

- [ ] **Step 1: Write failing tests for getStatLabel with rarity multiplication**

In `packages/client/src/shared/utils/stat-label.test.ts`, add a new describe block after the existing `getStatAbbreviation` tests. The tests need mock `AffixDef` and `GemInstance` objects:

```ts
import { getStatAbbreviation, getStatLabel } from './stat-label';
import type { AffixDef, GemInstance } from '@alloy/engine';

// After the existing getStatAbbreviation describe block, add:

const mockAffix: AffixDef = {
  id: 'fire_damage',
  name: 'Fire Damage',
  description: 'test',
  weaponFlavorText: '',
  armorFlavorText: '',
  category: 'offensive',
  tags: ['fire'],
  tiers: {
    1: { weaponEffect: [{ stat: 'elementalDamage.fire', op: 'flat', value: 3 }], armorEffect: [{ stat: 'resistances.fire', op: 'flat', value: 8 }], valueRange: [0, 0] },
    2: { weaponEffect: [{ stat: 'elementalDamage.fire', op: 'flat', value: 5 }], armorEffect: [{ stat: 'resistances.fire', op: 'flat', value: 14 }], valueRange: [0, 0] },
    3: { weaponEffect: [{ stat: 'elementalDamage.fire', op: 'flat', value: 7 }], armorEffect: [{ stat: 'resistances.fire', op: 'flat', value: 20 }], valueRange: [0, 0] },
    4: { weaponEffect: [{ stat: 'elementalDamage.fire', op: 'flat', value: 9 }], armorEffect: [{ stat: 'resistances.fire', op: 'flat', value: 26 }], valueRange: [0, 0] },
  },
};

const mockPercentAffix: AffixDef = {
  id: 'crit_chance',
  name: 'Critical Strike Chance',
  description: 'test',
  weaponFlavorText: '',
  armorFlavorText: '',
  category: 'offensive',
  tags: ['crit'],
  tiers: {
    1: { weaponEffect: [{ stat: 'critChance', op: 'percent', value: 0.03 }], armorEffect: [], valueRange: [0, 0] },
    2: { weaponEffect: [{ stat: 'critChance', op: 'percent', value: 0.05 }], armorEffect: [], valueRange: [0, 0] },
    3: { weaponEffect: [{ stat: 'critChance', op: 'percent', value: 0.07 }], armorEffect: [], valueRange: [0, 0] },
    4: { weaponEffect: [{ stat: 'critChance', op: 'percent', value: 0.09 }], armorEffect: [], valueRange: [0, 0] },
  },
};

function makeGem(tier: 1 | 2 | 3 | 4, rarity: 'common' | 'magic' | 'rare' | 'epic' | 'legendary'): GemInstance {
  return { uid: 'test', affixId: 'fire_damage', tier, rarity, recipeDepth: 0, combinable: true, tags: [] };
}

describe('getStatLabel', () => {
  it('returns effective value for common rarity (1x, integer)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'common'))).toBe('+5');
  });

  it('returns effective value for magic rarity (1.25x, fractional)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'magic'))).toBe('+6.3');
  });

  it('returns effective value for rare rarity (1.5x)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'rare'))).toBe('+7.5');
  });

  it('returns effective value for epic rarity (2x, integer)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'epic'))).toBe('+10');
  });

  it('returns effective value for legendary rarity (3x, integer)', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'legendary'))).toBe('+15');
  });

  it('formats percent stats with rarity applied', () => {
    // 0.05 * 1.5 = 0.075 → Math.round(0.075 * 100) = 8%
    expect(getStatLabel(mockPercentAffix, makeGem(2, 'rare'), 'weapon')).toBe('8%');
  });

  it('returns armor stat when target is armor', () => {
    expect(getStatLabel(mockAffix, makeGem(2, 'common'), 'armor')).toBe('+14');
  });

  it('returns empty string when no effects exist', () => {
    // crit_chance has no armor effects
    expect(getStatLabel(mockPercentAffix, makeGem(2, 'common'), 'armor')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/shared/utils/stat-label.test.ts`

Expected: FAIL — the rarity-multiplied tests fail because `getStatLabel` currently returns raw values.

- [ ] **Step 3: Implement rarity multiplication in getStatLabel**

In `packages/client/src/shared/utils/stat-label.ts`, add the `RARITY_MULTIPLIERS` import and apply the multiplier:

```ts
import type { AffixDef, AffixTier, GemInstance } from '@alloy/engine';
import { RARITY_MULTIPLIERS } from '@alloy/engine';

// ... getStatAbbreviation stays unchanged ...

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/shared/utils/stat-label.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shared/utils/stat-label.ts packages/client/src/shared/utils/stat-label.test.ts
git commit -m "feat(client): apply rarity multiplier in getStatLabel

Stat labels now show effective values (base × rarity multiplier)
everywhere: gem cards, forge tray, socket view, detail panel.
Integer results display as +15, fractional as +7.5."
```

---

### Task 2: Add progressive rarity animations to GemCard

**Files:**
- Modify: `packages/client/src/index.css` (add keyframes after existing animations, around line 220)
- Modify: `packages/client/src/components/GemCard.tsx:100-114`

- [ ] **Step 1: Add CSS keyframes and reduced-motion query to index.css**

At the end of the existing `@keyframes` block in `packages/client/src/index.css` (after the last keyframe around line 220), add:

```css
/* Rarity glow animations — progressive intensity */
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

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0s !important; }
}
```

- [ ] **Step 2: Update GemCard.tsx to use rarity animations**

In `packages/client/src/components/GemCard.tsx`, add the animation map after `rarityLabel` (line 82):

```ts
const rarityAnimation: Record<string, string | undefined> = {
  common: undefined,
  magic: 'shimmer-magic 3s ease-in-out infinite',
  rare: 'shimmer-rare 2.5s ease-in-out infinite',
  epic: 'pulse-epic 2s ease-in-out infinite',
  legendary: 'legendary-aura 2.5s ease-in-out infinite',
};
```

Then modify the gem shape `<div>` style object (lines 100-114). Replace the current `boxShadow` logic:

```ts
// Current (lines 111-113):
boxShadow: rarityColor && rarity !== 'common'
  ? `0 0 ${6 + (rarity === 'legendary' ? 10 : rarity === 'epic' ? 8 : rarity === 'rare' ? 6 : 4)}px ${rarityColor}`
  : tier >= 3 ? `0 0 ${4 + tier * 2}px ${tierColor}` : undefined,
```

Replace with:

```ts
border: rarity === 'legendary'
  ? `3px solid ${rarityColor}`
  : rarityColor
    ? `2.5px solid ${rarityColor}`
    : `2.5px solid ${colors.border}`,
boxShadow: rarity && rarity !== 'common'
  ? undefined  // animation controls box-shadow
  : tier >= 3 ? `0 0 ${4 + tier * 2}px ${tierColor}` : undefined,
animation: rarity ? rarityAnimation[rarity] : undefined,
```

Key logic: when rarity is non-common, `animation` drives the glow and `boxShadow` is removed (the animation sets it). For common gems or when rarity is absent, the existing tier-based static glow is preserved.

- [ ] **Step 3: Verify the app builds**

Run: `cd packages/client && npx vitest run`

Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/index.css packages/client/src/components/GemCard.tsx
git commit -m "feat(client): add progressive rarity animations to GemCard

Common: static. Magic: shimmer (3s). Rare: pulse (2.5s).
Epic: strong pulse (2s). Legendary: breathing aura (2.5s, 3px border).
Includes prefers-reduced-motion fallback."
```

---

## Chunk 2: Inspect Panel Stat Breakdown + Encyclopedia Rarity Tabs

### Task 3: Add stat breakdown table to GemInspectPanel

**Files:**
- Modify: `packages/client/src/components/GemInspectPanel.tsx`
- Modify: `packages/client/src/pages/Forge.tsx:654-666`

- [ ] **Step 1: Add `rarity` to GemInspectPanel prop interface**

In `packages/client/src/components/GemInspectPanel.tsx`, add the import and prop:

```ts
import type { GemRarity, StatModifier } from '@alloy/engine';
import { RARITY_MULTIPLIERS } from '@alloy/engine';
```

Update the `gem` interface inside `GemInspectPanelProps` (line 6-17) to add `rarity`:

```ts
gem: {
  name: string;
  description: string;
  weaponFlavorText: string;
  armorFlavorText: string;
  category?: string;
  tags: string[];
  tier?: number;
  rarity?: GemRarity;          // NEW
  weaponEffect?: StatModifier[];
  armorEffect?: StatModifier[];
  tiers?: Record<string, { weaponEffect: StatModifier[]; armorEffect: StatModifier[] }>;
};
```

- [ ] **Step 2: Add the stat breakdown table component**

In the same file, replace the existing tier effects sections (lines 79-122) with a new breakdown table that shows base values alongside rarity-multiplied effective values. The table should:

- Have two columns: "Base" and "{RarityName} ({mult}x)"
- Highlight the current tier row with a tinted background
- Show a footer with the math: `"Base: +5 × Rare (1.5x) = +7.5"`
- Handle both tiered affixes (T1-T4 rows) and compound flat effects (single row)
- Omit a section entirely if the effects array is empty (one-sided gems)
- Use the `context` prop to show weapon, armor, or both

Add a helper function inside the component (above the return):

```tsx
const mult = gem.rarity ? RARITY_MULTIPLIERS[gem.rarity] : 1;
const rarityName = gem.rarity ? gem.rarity.charAt(0).toUpperCase() + gem.rarity.slice(1) : 'Common';
const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af', magic: '#3b82f6', rare: '#eab308', epic: '#a855f7', legendary: '#f59e0b',
};
const rarityColor = gem.rarity ? RARITY_COLORS[gem.rarity] ?? '#9ca3af' : '#9ca3af';

function formatVal(value: number, op: string, multiplier: number): string {
  const eff = value * multiplier;
  if (op === 'percent') return `${Math.round(eff * 100)}%`;
  return `+${Number.isInteger(eff) ? eff : eff.toFixed(1)}`;
}
```

Then add the breakdown table JSX between the flavor text sections and the tags section. For each axis (weapon/armor, controlled by `showWeapon`/`showArmor`):

```tsx
{/* Stat Breakdown Table */}
{showWeapon && gem.tiers && (
  (() => {
    const tierEntries = Object.entries(gem.tiers).filter(([, d]) => d.weaponEffect.length > 0);
    if (tierEntries.length === 0) return null;
    const currentTierKey = gem.tier ? String(gem.tier) : null;
    const currentEffect = currentTierKey && gem.tiers[currentTierKey]?.weaponEffect[0];
    return (
      <div>
        {context === 'both' && (
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">Weapon Stats</h3>
        )}
        <div className="rounded border border-surface-600 overflow-hidden text-xs">
          {/* Header */}
          <div className="flex border-b border-surface-600 bg-surface-700/50">
            <span className="w-10 px-2 py-1 text-surface-500 font-semibold"></span>
            <span className="flex-1 px-2 py-1 text-surface-500 font-semibold">Base</span>
            <span className="flex-1 px-2 py-1 font-semibold" style={{ color: rarityColor }}>
              {rarityName} ({mult}x)
            </span>
          </div>
          {/* Rows */}
          {tierEntries.map(([tierKey, data]) => {
            const isCurrent = tierKey === currentTierKey;
            const e = data.weaponEffect[0];
            return (
              <div
                key={tierKey}
                className="flex border-b border-surface-700 last:border-0"
                style={isCurrent ? { backgroundColor: `${rarityColor}12` } : undefined}
              >
                <span className="w-10 px-2 py-1 text-surface-500 font-semibold">
                  T{tierKey}{isCurrent ? ' ◄' : ''}
                </span>
                <span className="flex-1 px-2 py-1 text-surface-500">{formatVal(e.value, e.op, 1)}</span>
                <span className="flex-1 px-2 py-1 font-semibold" style={{ color: rarityColor }}>
                  {formatVal(e.value, e.op, mult)}
                </span>
              </div>
            );
          })}
        </div>
        {/* Footer math */}
        {currentEffect && (
          <p className="mt-1 text-xs text-surface-500">
            Base: {formatVal(currentEffect.value, currentEffect.op, 1)} × {rarityName} ({mult}x) = <span style={{ color: rarityColor }}>{formatVal(currentEffect.value, currentEffect.op, mult)}</span>
          </p>
        )}
      </div>
    );
  })()
)}
```

Add the same pattern for armor (replace `weaponEffect` with `armorEffect`, change header to "Armor Stats", use `text-emerald-400` for the effective values color instead of `rarityColor` — or keep `rarityColor` for consistency).

For compound effects (no tiers), add a single-row version:

```tsx
{showWeapon && !gem.tiers && gem.weaponEffect && gem.weaponEffect.length > 0 && (
  <div className="rounded border border-surface-600 overflow-hidden text-xs">
    <div className="flex border-b border-surface-600 bg-surface-700/50">
      <span className="flex-1 px-2 py-1 text-surface-500 font-semibold">Base</span>
      <span className="flex-1 px-2 py-1 font-semibold" style={{ color: rarityColor }}>{rarityName} ({mult}x)</span>
    </div>
    {gem.weaponEffect.map((e, i) => (
      <div key={i} className="flex border-b border-surface-700 last:border-0">
        <span className="flex-1 px-2 py-1 text-surface-500">{e.stat}: {formatVal(e.value, e.op, 1)}</span>
        <span className="flex-1 px-2 py-1" style={{ color: rarityColor }}>{e.stat}: {formatVal(e.value, e.op, mult)}</span>
      </div>
    ))}
  </div>
)}
```

Same pattern for armor compound effects.

- [ ] **Step 3: Update Forge.tsx to pass rarity, tier, and tiers**

In `packages/client/src/pages/Forge.tsx`, find the `GemInspectPanel` render (lines 654-666) and update the `gem` prop:

Replace the current gem object (lines 656-661):
```tsx
gem={{
  name: inspectGem.affixDef.name,
  description: inspectGem.affixDef.description,
  weaponFlavorText: inspectGem.affixDef.weaponFlavorText,
  armorFlavorText: inspectGem.affixDef.armorFlavorText,
  tags: inspectGem.affixDef.tags,
}}
```

With:
```tsx
gem={{
  name: inspectGem.affixDef.name,
  description: inspectGem.affixDef.description,
  weaponFlavorText: inspectGem.affixDef.weaponFlavorText,
  armorFlavorText: inspectGem.affixDef.armorFlavorText,
  tags: inspectGem.affixDef.tags,
  rarity: inspectGem.gem.rarity,
  tier: inspectGem.gem.tier,
  tiers: 'tiers' in inspectGem.affixDef
    ? (inspectGem.affixDef as AffixDef).tiers
    : undefined,
  weaponEffect: 'weaponEffect' in inspectGem.affixDef
    ? inspectGem.affixDef.weaponEffect
    : undefined,
  armorEffect: 'armorEffect' in inspectGem.affixDef
    ? inspectGem.affixDef.armorEffect
    : undefined,
}}
```

The `AffixDef` type is already imported at line 18.

- [ ] **Step 4: Verify the app builds**

Run: `cd packages/client && npx vitest run`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/GemInspectPanel.tsx packages/client/src/pages/Forge.tsx
git commit -m "feat(client): add stat breakdown table to GemInspectPanel

Two-column table showing base values vs effective values at the
gem's rarity. Current tier highlighted. Footer shows the math.
Forge caller now passes rarity, tier, and tiers to the panel."
```

---

### Task 4: Add rarity selector tabs to GemEncyclopedia

**Files:**
- Modify: `packages/client/src/pages/GemEncyclopedia.tsx`

- [ ] **Step 1: Add rarity imports and state**

In `packages/client/src/pages/GemEncyclopedia.tsx`, update imports:

```ts
import type { AffixCategory, GemRarity } from '@alloy/engine';
import { RARITY_MULTIPLIERS, RARITY_ORDER } from '@alloy/engine';
```

Inside the `GemEncyclopedia` component, add state after `selectedId` (line 40):

```ts
const [selectedRarity, setSelectedRarity] = useState<GemRarity>('common');
```

Add the rarity color map and a format helper:

```ts
const RARITY_COLORS: Record<GemRarity, string> = {
  common: '#9ca3af', magic: '#3b82f6', rare: '#eab308', epic: '#a855f7', legendary: '#f59e0b',
};

const mult = RARITY_MULTIPLIERS[selectedRarity];

function fmtVal(value: number, op: string): string {
  const eff = value * mult;
  if (op === 'percent') return `${Math.round(eff * 100)}%`;
  return `+${Number.isInteger(eff) ? eff : eff.toFixed(1)}`;
}

function fmtBase(value: number, op: string): string {
  if (op === 'percent') return `${Math.round(value * 100)}%`;
  return `+${value}`;
}
```

- [ ] **Step 2: Add rarity tab bar to the detail panel**

In the detail panel (right column), add the rarity tab bar between the description and the weapon/armor sections. Find the line `<p className="text-sm text-surface-300">{selected.description}</p>` (line 135) and add after it:

```tsx
{/* Rarity selector tabs */}
<div className="flex gap-1">
  {RARITY_ORDER.map((r) => (
    <button
      key={r}
      onClick={() => setSelectedRarity(r)}
      className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
        selectedRarity === r
          ? 'text-white'
          : 'text-surface-500 hover:text-surface-300'
      }`}
      style={selectedRarity === r ? {
        backgroundColor: `${RARITY_COLORS[r]}20`,
        color: RARITY_COLORS[r],
        border: `1px solid ${RARITY_COLORS[r]}40`,
      } : undefined}
    >
      {r.charAt(0).toUpperCase() + r.slice(1)}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Update tier stat display to show effective values**

Replace the existing weapon tier stat rendering (lines 146-160, the `Object.entries(selected.tiers).map(...)` block) with:

```tsx
{Object.entries(selected.tiers).map(([tier, data]) =>
  data.weaponEffect.length > 0 ? (
    <div key={tier} className="flex gap-2 text-xs text-surface-300">
      <span className="w-8 font-semibold text-surface-500">T{tier}</span>
      {data.weaponEffect.map((e, i) => (
        <span key={i}>
          {e.stat}:{' '}
          <span style={{ color: RARITY_COLORS[selectedRarity] }}>{fmtVal(e.value, e.op)}</span>
          {selectedRarity !== 'common' && (
            <span className="text-surface-600 ml-1">(base {fmtBase(e.value, e.op)})</span>
          )}
        </span>
      ))}
    </div>
  ) : null
)}
```

Apply the same pattern to:
- Armor tier stats (lines 184-195)
- Compound weapon effects (lines 161-169)
- Compound armor effects (lines 197-204)

For compound effects, multiply the flat values the same way:

```tsx
{selected.weaponEffect.map((e, i) => (
  <span key={i}>
    {e.stat}:{' '}
    <span style={{ color: RARITY_COLORS[selectedRarity] }}>{fmtVal(e.value, e.op)}</span>
    {selectedRarity !== 'common' && (
      <span className="text-surface-600 ml-1">(base {fmtBase(e.value, e.op)})</span>
    )}
  </span>
))}
```

- [ ] **Step 4: Add rarity multiplier footer**

After the last stat section (before the tags section at line 210), add:

```tsx
{selectedRarity !== 'common' && (
  <p className="text-xs" style={{ color: RARITY_COLORS[selectedRarity] }}>
    {selectedRarity.charAt(0).toUpperCase() + selectedRarity.slice(1)}: {mult}x multiplier
  </p>
)}
```

- [ ] **Step 5: Verify the app builds**

Run: `cd packages/client && npx vitest run`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/GemEncyclopedia.tsx
git commit -m "feat(client): add rarity selector tabs to Gem Encyclopedia

Tab bar lets players toggle between Common/Magic/Rare/Epic/Legendary
to see effective stat values at each rarity level. Base values shown
as dim annotations when rarity > common. Multiplier footer displayed."
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full client test suite**

Run: `cd packages/client && npx vitest run`

Expected: All tests pass.

- [ ] **Step 2: Run client build**

Run: `cd packages/client && npx vite build`

Expected: Build succeeds with no TypeScript errors.
