# Gem Description Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify gem descriptions into a single source of truth (JSON data files) with three fields per gem: `description`, `weaponFlavorText`, `armorFlavorText`. Delete generated descriptions from the tool. Surface descriptions in an inspect panel and encyclopedia in the client.

**Architecture:** Engine types and Zod schemas are updated first, then all 33 affixes.json + 29 combinations.json entries are populated with the three description fields in an atomic commit. The tool deletes its generator functions and reads from engine data directly. The client gets a new `GemInspectPanel` (long-press overlay) and `GemEncyclopedia` page (`/gems` route).

**Tech Stack:** TypeScript, Zod 3, React 19, React Router 7, Zustand 5, Vitest, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-04-13-gem-description-unification-design.md`

---

## Chunk 1: Engine Types, Schemas, and Data Files

> **ATOMIC COMMIT WARNING:** Tasks 1–3 MUST land in a single commit. The schema requires fields that don't exist in the JSON until Task 3 completes. Running `loadAndValidateData()` between Tasks 2 and 3 will throw. Do NOT commit Tasks 1 or 2 independently.

### Task 1: Add description fields to engine types

**Files:**
- Modify: `packages/engine/src/types/affix.ts:17-24`
- Modify: `packages/engine/src/types/combination.ts:3-12`

- [ ] **Step 1: Add fields to `AffixDef`**

In `packages/engine/src/types/affix.ts`, add `weaponFlavorText` and `armorFlavorText` after the existing `description` field:

```ts
export interface AffixDef {
  id: string;
  name: string;
  description: string;
  weaponFlavorText: string;   // NEW
  armorFlavorText: string;    // NEW
  category: AffixCategory;
  tags: AffixTag[];
  tiers: Record<AffixTier, AffixTierData>;
}
```

- [ ] **Step 2: Add fields to `CompoundAffixDef`**

In `packages/engine/src/types/combination.ts`, add `description`, `weaponFlavorText`, and `armorFlavorText`:

```ts
export interface CompoundAffixDef {
  id: string;
  name: string;
  description: string;        // NEW
  weaponFlavorText: string;   // NEW
  armorFlavorText: string;    // NEW
  components: [string, string];
  fluxCost: number;
  slotCost: number;
  weaponEffect: StatModifier[];
  armorEffect: StatModifier[];
  tags: AffixTag[];
}
```

---

### Task 2: Update Zod schemas

**Files:**
- Modify: `packages/engine/src/data/schemas.ts:19-25` (AffixDefSchema)
- Modify: `packages/engine/src/data/schemas.ts:31-40` (CompoundAffixDefSchema)

- [ ] **Step 1: Add fields to `AffixDefSchema`**

In `packages/engine/src/data/schemas.ts`, the `AffixDefSchema` (line 19) currently has `id`, `name`, `category`, `tags`, `tiers`. It is missing `description` (which exists in the JSON and type but was never added to the schema). **This is a bug fix:** because Zod's default `.parse()` uses strip mode, the `description` field is currently silently dropped from parsed output. The `as unknown as AffixDef[]` cast in `loader.ts` hides this — TypeScript thinks `description` is present, but at runtime it is `undefined`. Adding `description: z.string()` here fixes this runtime bug. Add all three fields:

```ts
const AffixDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),           // NEW — was missing from schema
  weaponFlavorText: z.string(),      // NEW
  armorFlavorText: z.string(),       // NEW
  category: z.enum(['offensive', 'defensive', 'sustain', 'utility', 'trigger']),
  tags: z.array(z.string()),
  tiers: z.record(z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])), AffixTierDataSchema),
});
```

- [ ] **Step 2: Add fields to `CompoundAffixDefSchema`**

In the same file, the `CompoundAffixDefSchema` (line 31) needs `description`, `weaponFlavorText`, and `armorFlavorText`:

```ts
const CompoundAffixDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),           // NEW
  weaponFlavorText: z.string(),      // NEW
  armorFlavorText: z.string(),       // NEW
  components: z.tuple([z.string(), z.string()]),
  fluxCost: z.number().int().positive(),
  slotCost: z.number().int().positive(),
  weaponEffect: z.array(StatModifierSchema),
  armorEffect: z.array(StatModifierSchema),
  tags: z.array(z.string()),
});
```

---

### Task 3: Populate data files with description content

**Files:**
- Modify: `packages/engine/src/data/affixes.json` (33 entries)
- Modify: `packages/engine/src/data/combinations.json` (29 entries)

**Content source:** Migrate text from `packages/tools/src/utils/data-loader.ts` functions `generateBaseAffixDescription()` (lines 41–111) and `generateCompoundDescription()` (lines 116–182). Strip emoji headers and bold formatting. Split the `WEAPON:` and `ARMOR:` sections into the two separate fields. Rewrite `description` to cover both axes using the pattern `"[weapon effect]; [armor effect]."`.

**One-sided gems rule:** If a gem has no weapon effect (empty `weaponEffect` array in all tiers), set `weaponFlavorText` to `""`. Same for armor. The 4 one-sided affixes are: `armor_rating`, `dodge_chance`, `damage_reduction`, `fortify` (all armor-only, empty weapon effects).

- [ ] **Step 1: Add `weaponFlavorText` and `armorFlavorText` to each of the 33 entries in `affixes.json`**

Each entry already has a `description` field. Rewrite the existing `description` to follow the dual-axis pattern, then add the two new flavor text fields. Place the new fields immediately after `description` in each entry.

**Example for `flat_physical`** (first entry in the file):

```json
{
  "id": "flat_physical",
  "name": "Flat Physical Damage",
  "description": "Adds raw physical damage to weapons; reinforces armor on defense.",
  "weaponFlavorText": "Pure brute force without apology. Your blade becomes heavier, sharper, more devastating. This is the foundation — damage in its most honest form.",
  "armorFlavorText": "You're built different. Denser muscle, thicker bone, heavier frame. Taking hits becomes a matter of sheer physical mass. Enemies swing, you absorb, they regret.",
  "category": "offensive",
  ...
}
```

**Example for `armor_rating`** (one-sided, no weapon effect):

```json
{
  "id": "armor_rating",
  "name": "Armor",
  "description": "Reduces incoming physical damage when socketed in armor.",
  "weaponFlavorText": "",
  "armorFlavorText": "Reduces incoming physical damage as a flat percentage. Enemies swing. You shrug. The number goes down. That's the whole thing, and it's perfectly effective.",
  "category": "defensive",
  ...
}
```

Repeat for all 33 entries. Content comes from `generateBaseAffixDescription()` in `data-loader.ts` lines 42–108 — split each entry's `WEAPON:` block into `weaponFlavorText` and `ARMOR:` block into `armorFlavorText`. Strip emoji prefixes and `**WEAPON**:`/`**ARMOR**:` headers.

- [ ] **Step 2: Add `description`, `weaponFlavorText`, and `armorFlavorText` to each of the 29 entries in `combinations.json`**

Combinations currently have NO `description` field. Add all three fields. Content comes from `generateCompoundDescription()` in `data-loader.ts` lines 121–179. The brief `description` must be written fresh (one sentence, dual-axis pattern). Strip emoji headers and bold formatting from flavor text.

**Example for `ignite`** (first entry in the file):

```json
{
  "id": "ignite",
  "name": "Ignite",
  "description": "Stacks cascading burn damage on weapon hits; absorbs enemy fire magic on armor.",
  "weaponFlavorText": "Each attack stacks independent ignite effects. One ignite is persistent damage. Two ignites amplify each other. Three? It's exponential. The longer you keep hitting the same target, the more the burns cascade. Eventually, the fire becomes self-sustaining and they just burn.",
  "armorFlavorText": "Enemy fire magic doesn't hurt you — it fuels you. Incoming fire damage is absorbed and converted into passive defensive shields. Standing in the flames makes you stronger. They burn, you get tougher.",
  "components": ["chance_on_hit", "fire_damage"],
  ...
}
```

Repeat for all 29 entries.

- [ ] **Step 3: Run engine tests to verify data loads successfully**

Run: `cd packages/engine && npx vitest run tests/data.test.ts`

Expected: All tests pass. `loadAndValidateData()` parses both files with the updated schemas. The existing count checks (`>= 33` affixes, `>= 29` combinations) still hold.

- [ ] **Step 4: Add a test for the new description fields**

In `packages/engine/tests/data.test.ts`, add tests inside the existing `DataRegistry` > `Affix Lookups` describe block:

```ts
it('should have description fields on all affixes', () => {
  for (const affix of registry.getAllAffixes()) {
    expect(typeof affix.description).toBe('string');
    expect(affix.description.length).toBeGreaterThan(0);
    expect(typeof affix.weaponFlavorText).toBe('string');
    expect(typeof affix.armorFlavorText).toBe('string');
    // At least one flavor text must be non-empty
    expect(
      affix.weaponFlavorText.length > 0 || affix.armorFlavorText.length > 0,
      `Affix "${affix.id}" has no flavor text on either side`
    ).toBe(true);
  }
});
```

And inside the `Combination Lookups` describe block:

```ts
it('should have description fields on all combinations', () => {
  for (const combo of registry.getAllCombinations()) {
    expect(typeof combo.description).toBe('string');
    expect(combo.description.length).toBeGreaterThan(0);
    expect(typeof combo.weaponFlavorText).toBe('string');
    expect(typeof combo.armorFlavorText).toBe('string');
    // At least one flavor text must be non-empty (same pattern as affix test)
    expect(
      combo.weaponFlavorText.length > 0 || combo.armorFlavorText.length > 0,
      `Combination "${combo.id}" has no flavor text on either side`
    ).toBe(true);
  }
});
```

- [ ] **Step 5: Run the new tests**

Run: `cd packages/engine && npx vitest run tests/data.test.ts`

Expected: All tests pass including the new description field checks.

- [ ] **Step 6: Commit (ATOMIC — types + schemas + data + test)**

```bash
git add packages/engine/src/types/affix.ts packages/engine/src/types/combination.ts packages/engine/src/data/schemas.ts packages/engine/src/data/affixes.json packages/engine/src/data/combinations.json packages/engine/tests/data.test.ts
git commit -m "feat(engine): add weaponFlavorText and armorFlavorText to all gem data

Add description, weaponFlavorText, and armorFlavorText fields to
AffixDef and CompoundAffixDef types, Zod schemas, and all 62 JSON
entries. Content migrated from tool generator functions. Brief
descriptions rewritten to cover both weapon and armor axes.

Atomic commit: schema + data must land together or loadAndValidateData
will throw on the new required fields."
```

---

## Chunk 2: Tool Changes

### Task 4: Update tool `Affix` type

**Files:**
- Modify: `packages/tools/src/store/types.ts:14-25`

- [ ] **Step 1: Replace `flavorText` with the two new fields**

In `packages/tools/src/store/types.ts`, replace the `flavorText?: string` field (line 22) with:

```ts
export interface Affix {
  id: string
  name: string
  rarity: 'common' | 'rare' | 'unique' | 'exotic'
  tier: 1 | 2 | 3 | 4 | 5
  categories: string[]
  icon: string
  description: string
  weaponFlavorText?: string   // REPLACES flavorText
  armorFlavorText?: string    // NEW
  tags: string[]
  tierEffects?: Record<string, TierEffects>
}
```

> `flavorText` has zero consumers — confirmed never set in `data-loader.ts` and never read in any component. Safe to remove.

---

### Task 5: Delete generator functions and wire new fields in data-loader

**Files:**
- Modify: `packages/tools/src/utils/data-loader.ts`

- [ ] **Step 1: Delete `generateBaseAffixDescription()` (lines 38–111)**

Remove the entire function including its JSDoc comment (lines 38–111).

- [ ] **Step 2: Delete `generateCompoundDescription()` (lines 113–182)**

Remove the entire function including its JSDoc comment (lines 113–182, will be renumbered after Step 1).

- [ ] **Step 3: Update base affix mapping to read from engine data**

In the `loadDataFromJSON()` function, the base affix mapping (around line 194 after deletions) currently calls `generateBaseAffixDescription()`. Replace the `description` line and add the new fields:

```ts
// Before:
description: generateBaseAffixDescription(engineAffix.id, engineAffix.name, engineAffix.category),

// After:
description: engineAffix.description,
weaponFlavorText: engineAffix.weaponFlavorText,
armorFlavorText: engineAffix.armorFlavorText,
```

- [ ] **Step 4: Update compound affix mapping to read from engine data**

The compound mapping (around line 214 after deletions) currently calls `generateCompoundDescription()`. Replace:

```ts
// Before:
description: generateCompoundDescription(
  compound.id,
  compound.name || compound.id,
  compound.components,
  baseAffixes
),

// After:
description: compound.description,
weaponFlavorText: compound.weaponFlavorText,
armorFlavorText: compound.armorFlavorText,
```

- [ ] **Step 5: Run the full tool test suite**

Run: `cd packages/tools && npx vitest run`

Expected: All tests pass. The store tests in `packages/tools/src/store/__tests__/gem-blueprint-store.test.ts` exercise `loadDataFromJSON()` indirectly.

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/store/types.ts packages/tools/src/utils/data-loader.ts
git commit -m "feat(tools): delete description generators, read from engine data

Remove generateBaseAffixDescription() and generateCompoundDescription()
from data-loader.ts. Tool now reads description, weaponFlavorText, and
armorFlavorText directly from engine data. Replace flavorText with
weaponFlavorText/armorFlavorText on Affix tool type."
```

---

### Task 6: Restructure workbench editor to per-axis layout

**Files:**
- Modify: `packages/tools/src/components/workbench-editor.tsx:75-193`

The Affixes tab currently shows:
1. A combined description box (lines 78–93)
2. Properties grid (lines 95–134)
3. Per-tier effects table (lines 136–193) — each tier shows weapon + armor together

Restructure to:
1. Properties grid (keep as-is)
2. **Weapon section**: `weaponFlavorText` prose block + weapon effects tier table
3. **Armor section**: `armorFlavorText` prose block + armor effects tier table

Omit either section entirely if the gem has no effects on that side (check if all tiers have empty `weaponEffect`/`armorEffect` arrays).

- [ ] **Step 1: Remove the old description box (lines 78–93)**

Delete the entire `<div>` block that renders `selectedAffix.description` with the indigo left border.

- [ ] **Step 2: Add helper to check if an affix has effects on a given axis**

Add inside the component function body, after `selectedAffix` is defined (line 11) but before the `return` statement. These must be outside JSX since they are `const` declarations:

```tsx
// After line 11 (const selectedAffix = ...), before return:
const hasWeaponEffects = selectedAffix?.tierEffects
  ? Object.values(selectedAffix.tierEffects).some(t => t.weaponEffect.length > 0)
  : false;
const hasArmorEffects = selectedAffix?.tierEffects
  ? Object.values(selectedAffix.tierEffects).some(t => t.armorEffect.length > 0)
  : false;
```

- [ ] **Step 3: Replace the per-tier effects section with per-axis layout**

Remove the old "Effects by Tier" section (lines 136–193) and replace with:

```tsx
{/* Weapon Section */}
{hasWeaponEffects && (
  <div style={{ marginBottom: '1.5rem' }}>
    <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.75rem' }}>
      Weapon
    </h3>
    {selectedAffix.weaponFlavorText && (
      <div style={{
        backgroundColor: '#334155',
        padding: '1rem',
        borderRadius: '0.375rem',
        marginBottom: '1rem',
        borderLeft: '3px solid #fbbf24',
      }}>
        <p style={{ color: '#e2e8f0', fontSize: '0.875rem', lineHeight: '1.6', margin: 0 }}>
          {selectedAffix.weaponFlavorText}
        </p>
      </div>
    )}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {selectedAffix.tierEffects && Object.entries(selectedAffix.tierEffects).map(([tierKey, effects]) =>
        effects.weaponEffect.length > 0 ? (
          <div key={tierKey} style={{
            backgroundColor: '#334155',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, minWidth: '3rem' }}>
              T{tierKey}
            </span>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {effects.weaponEffect.map((effect, idx) => (
                <span key={idx} style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                  <span style={{ color: '#94a3b8' }}>{effect.stat}</span>:{' '}
                  <span style={{ color: '#fbbf24' }}>
                    {effect.op === 'flat' ? '+' : ''}{effect.value}{effect.op === 'percent' ? '%' : ''}
                  </span>
                </span>
              ))}
              {effects.valueRange && effects.valueRange[0] !== 0 && effects.valueRange[1] !== 0 && (
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Range: {effects.valueRange[0]}–{effects.valueRange[1]}
                </span>
              )}
            </div>
          </div>
        ) : null
      )}
    </div>
  </div>
)}

{/* Armor Section */}
{hasArmorEffects && (
  <div style={{ marginBottom: '1.5rem' }}>
    <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.75rem' }}>
      Armor
    </h3>
    {selectedAffix.armorFlavorText && (
      <div style={{
        backgroundColor: '#334155',
        padding: '1rem',
        borderRadius: '0.375rem',
        marginBottom: '1rem',
        borderLeft: '3px solid #34d399',
      }}>
        <p style={{ color: '#e2e8f0', fontSize: '0.875rem', lineHeight: '1.6', margin: 0 }}>
          {selectedAffix.armorFlavorText}
        </p>
      </div>
    )}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {selectedAffix.tierEffects && Object.entries(selectedAffix.tierEffects).map(([tierKey, effects]) =>
        effects.armorEffect.length > 0 ? (
          <div key={tierKey} style={{
            backgroundColor: '#334155',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, minWidth: '3rem' }}>
              T{tierKey}
            </span>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {effects.armorEffect.map((effect, idx) => (
                <span key={idx} style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                  <span style={{ color: '#94a3b8' }}>{effect.stat}</span>:{' '}
                  <span style={{ color: '#34d399' }}>
                    {effect.op === 'flat' ? '+' : ''}{effect.value}{effect.op === 'percent' ? '%' : ''}
                  </span>
                </span>
              ))}
              {effects.valueRange && effects.valueRange[0] !== 0 && effects.valueRange[1] !== 0 && (
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Range: {effects.valueRange[0]}–{effects.valueRange[1]}
                </span>
              )}
            </div>
          </div>
        ) : null
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify the tool builds and renders**

Run: `cd packages/tools && npx vitest run`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/components/workbench-editor.tsx
git commit -m "feat(tools): restructure workbench editor to per-axis layout

Remove combined description box. Replace per-tier effects grouping
with per-axis layout: weapon section (flavor text + tier table) then
armor section (flavor text + tier table). Omit section entirely if
gem has no effects on that axis."
```

---

## Chunk 3: Client — Inspect Panel and Encyclopedia

### Task 7: Add `INSPECT_THRESHOLD` constant to draft-gestures

**Files:**
- Modify: `packages/client/src/pages/draft-gestures.ts:1-2`
- Modify: `packages/client/src/pages/__tests__/draft-gestures.test.ts`

- [ ] **Step 1: Write failing test for INSPECT_THRESHOLD export**

Add to `packages/client/src/pages/__tests__/draft-gestures.test.ts`:

```ts
import { classifyGesture, INSPECT_THRESHOLD } from '../draft-gestures';

// Add at the end of the describe block:
it('exports INSPECT_THRESHOLD as 500ms', () => {
  expect(INSPECT_THRESHOLD).toBe(500);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/client && npx vitest run src/pages/__tests__/draft-gestures.test.ts`

Expected: FAIL — `INSPECT_THRESHOLD` is not exported.

- [ ] **Step 3: Add INSPECT_THRESHOLD to draft-gestures.ts**

In `packages/client/src/pages/draft-gestures.ts`, add after line 2:

```ts
export const DRAG_THRESHOLD = 8;    // px
export const HOLD_THRESHOLD = 300;  // ms
export const INSPECT_THRESHOLD = 500;  // ms — long-press opens inspect panel
```

`classifyGesture()` is NOT changed. Callers check duration against `INSPECT_THRESHOLD` independently after receiving a `'hold'` result.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/pages/__tests__/draft-gestures.test.ts`

Expected: All tests pass (existing + new).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/draft-gestures.ts packages/client/src/pages/__tests__/draft-gestures.test.ts
git commit -m "feat(client): add INSPECT_THRESHOLD constant for gem inspect gesture"
```

---

### Task 8: Create GemInspectPanel component

**Files:**
- Create: `packages/client/src/components/GemInspectPanel.tsx`

The panel is an overlay triggered by long-press (>= 500ms) on a gem. It receives affix data and a `context` prop to determine which flavor text to show.

- [ ] **Step 1: Create `GemInspectPanel.tsx`**

```tsx
import type { AffixDef, CompoundAffixDef, StatModifier } from '@alloy/engine';

type InspectContext = 'weapon' | 'armor' | 'both';

interface GemInspectPanelProps {
  gem: {
    name: string;
    description: string;
    weaponFlavorText: string;
    armorFlavorText: string;
    category?: string;
    tags: string[];
    tier?: number;
    weaponEffect?: StatModifier[];
    armorEffect?: StatModifier[];
    // For base affixes with tiered effects:
    tiers?: Record<string, { weaponEffect: StatModifier[]; armorEffect: StatModifier[] }>;
  };
  context: InspectContext;
  onClose: () => void;
}

export function GemInspectPanel({ gem, context, onClose }: GemInspectPanelProps) {
  const showWeapon = context === 'weapon' || context === 'both';
  const showArmor = context === 'armor' || context === 'both';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60"
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col overflow-y-auto bg-surface-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-600 p-4">
          <h2
            className="text-lg font-bold"
            style={{ fontFamily: 'var(--font-family-display)', color: 'var(--color-accent-400)' }}
          >
            {gem.name}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-surface-400 hover:bg-surface-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {/* Brief description */}
          <p className="text-sm leading-relaxed text-surface-300">{gem.description}</p>

          {/* Weapon section */}
          {showWeapon && gem.weaponFlavorText.length > 0 && (
            <div>
              {context === 'both' && (
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                  On Weapon
                </h3>
              )}
              <p className="text-sm leading-relaxed text-surface-200">{gem.weaponFlavorText}</p>
            </div>
          )}

          {/* Armor section */}
          {showArmor && gem.armorFlavorText.length > 0 && (
            <div>
              {context === 'both' && (
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                  On Armor
                </h3>
              )}
              <p className="text-sm leading-relaxed text-surface-200">{gem.armorFlavorText}</p>
            </div>
          )}

          {/* Tier effects for current tier */}
          {showWeapon && gem.tiers && gem.tier && gem.tiers[String(gem.tier)] && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                Weapon Stats (Tier {gem.tier})
              </h3>
              <div className="flex flex-col gap-0.5">
                {gem.tiers[String(gem.tier)].weaponEffect.map((e, i) => (
                  <span key={i} className="text-xs text-surface-300">
                    {e.stat}: <span className="text-accent-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {showArmor && gem.tiers && gem.tier && gem.tiers[String(gem.tier)] && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                Armor Stats (Tier {gem.tier})
              </h3>
              <div className="flex flex-col gap-0.5">
                {gem.tiers[String(gem.tier)].armorEffect.map((e, i) => (
                  <span key={i} className="text-xs text-surface-300">
                    {e.stat}: <span className="text-emerald-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Compound single-row effects */}
          {showWeapon && !gem.tiers && gem.weaponEffect && gem.weaponEffect.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs text-surface-300">
              {gem.weaponEffect.map((e, i) => (
                <span key={i}>{e.stat}: <span className="text-accent-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span></span>
              ))}
            </div>
          )}
          {showArmor && !gem.tiers && gem.armorEffect && gem.armorEffect.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs text-surface-300">
              {gem.armorEffect.map((e, i) => (
                <span key={i}>{e.stat}: <span className="text-emerald-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span></span>
              ))}
            </div>
          )}

          {/* Tags */}
          {gem.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {gem.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-surface-700 px-2 py-0.5 text-xs text-surface-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/components/GemInspectPanel.tsx
git commit -m "feat(client): add GemInspectPanel overlay component

Side panel triggered by long-press showing gem description,
contextual weapon/armor flavor text, and tags. Context prop
controls which flavor text sections are shown."
```

---

### Task 9: Wire inspect panel into Forge gem tray

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

The Forge page handles gestures via `pointerdown`/`pointerup` with ref-based tracking. A gesture classified as `'hold'` with duration >= `INSPECT_THRESHOLD` (500ms) should open the inspect panel instead of selecting the gem. Only gems in the tray (not socketed) trigger inspect.

- [ ] **Step 1: Add inspect state and imports**

At the top of `Forge.tsx`, add to the existing type import from `@alloy/engine`:

```tsx
import type { AffixDef, BaseStat, CompoundAffixDef, GemInstance } from '@alloy/engine';
```

Add new imports:

```tsx
import { GemInspectPanel } from '@/components/GemInspectPanel';
import { INSPECT_THRESHOLD } from './draft-gestures';
```

Inside the Forge component, add state:

```tsx
const [inspectGem, setInspectGem] = useState<{
  gem: GemInstance;
  affixDef: AffixDef | CompoundAffixDef;
} | null>(null);
```

- [ ] **Step 2: Update the pointerup handler for tray gems**

**IMPORTANT:** Forge does NOT use `classifyGesture()`. It has inline duration checks in the pointerup handler (around lines 328–339). The existing code checks `holdDuration < 300` and does nothing for holds >= 300ms (already a no-op). Add an `else if` for inspect:

Find the existing non-drag path in the pointerup handler (approximately):
```tsx
} else {
  // Not a drag — classify as tap or hold
  const holdDuration = Date.now() - start.time;
  if (holdDuration < 300) {
    if (selectedOrbUidRef.current === start.uid) {
      selectOrb(null);
    } else {
      selectOrb(start.uid);
      playSound('orbSelect');
    }
  }
}
```

Change it to:
```tsx
} else {
  // Not a drag — classify as tap, hold, or inspect
  const holdDuration = Date.now() - start.time;
  if (holdDuration >= INSPECT_THRESHOLD) {
    // Long-press (>=500ms): open inspect panel
    const gem = useForgeStore.getState().plan?.stockpile.find(g => g.uid === start.uid);
    if (gem) {
      const affixDef = registry.findAffix(gem.affixId)
        ?? registry.getCombinationById(gem.affixId);
      if (affixDef) {
        setInspectGem({ gem, affixDef });
      }
    }
  } else if (holdDuration < 300) {
    // Tap: select or deselect
    if (selectedOrbUidRef.current === start.uid) {
      selectOrb(null);
    } else {
      selectOrb(start.uid);
      playSound('orbSelect');
    }
  }
  // 300-499ms: no-op (existing behavior)
}
```

The key changes: (1) check `>= INSPECT_THRESHOLD` first, (2) resolve gem from stockpile via `useForgeStore.getState().plan?.stockpile`, (3) look up affix definition from registry.

- [ ] **Step 3: Render the inspect panel**

Add before the closing `</div>` of the Forge component:

```tsx
{inspectGem && (
  <GemInspectPanel
    gem={{
      name: inspectGem.affixDef.name,
      description: inspectGem.affixDef.description,
      weaponFlavorText: inspectGem.affixDef.weaponFlavorText,
      armorFlavorText: inspectGem.affixDef.armorFlavorText,
      tags: inspectGem.affixDef.tags,
    }}
    context="both"
    onClose={() => setInspectGem(null)}
  />
)}
```

Forge tray gems use `'both'` context since they are not yet socketed.

- [ ] **Step 4: Verify the app builds**

Run: `cd packages/client && npx vite build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "feat(client): wire GemInspectPanel into Forge tray long-press

Long-press (>=500ms) on a tray gem opens the inspect panel.
300-499ms hold continues to select/toggle. Socket slot behavior
unchanged."
```

---

### Task 10: Create GemEncyclopedia page

**Files:**
- Create: `packages/client/src/pages/GemEncyclopedia.tsx`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/pages/MainMenu.tsx`

- [ ] **Step 1: Create `GemEncyclopedia.tsx`**

The encyclopedia merges `registry.getAllAffixes()` and `registry.getAllCombinations()` into a single list. Filter tabs map to `AffixCategory` values for base affixes; `Compound` maps to entries from `getAllCombinations()`. Left column = gem list; right column = detail panel.

```tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import type { AffixCategory } from '@alloy/engine';

type FilterTab = 'all' | AffixCategory | 'compound';

interface EncyclopediaEntry {
  id: string;
  name: string;
  description: string;
  weaponFlavorText: string;
  armorFlavorText: string;
  tags: string[];
  category?: AffixCategory;
  isCompound: boolean;
  weaponEffect?: Array<{ stat: string; op: string; value: number }>;
  armorEffect?: Array<{ stat: string; op: string; value: number }>;
  tiers?: Record<string, {
    weaponEffect: Array<{ stat: string; op: string; value: number }>;
    armorEffect: Array<{ stat: string; op: string; value: number }>;
  }>;
}

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'offensive', label: 'Offensive' },
  { key: 'defensive', label: 'Defensive' },
  { key: 'sustain', label: 'Sustain' },
  { key: 'utility', label: 'Utility' },
  { key: 'trigger', label: 'Trigger' },
  { key: 'compound', label: 'Compound' },
];

export function GemEncyclopedia() {
  const navigate = useNavigate();
  // matchStore exposes getRegistry as a function, not a plain field
  const getRegistry = useMatchStore((s) => s.getRegistry);
  const registry = getRegistry();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries = useMemo<EncyclopediaEntry[]>(() => {
    const base: EncyclopediaEntry[] = registry.getAllAffixes().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      weaponFlavorText: a.weaponFlavorText,
      armorFlavorText: a.armorFlavorText,
      tags: a.tags,
      category: a.category,
      isCompound: false,
      tiers: a.tiers as EncyclopediaEntry['tiers'],
    }));
    const compounds: EncyclopediaEntry[] = registry.getAllCombinations().map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      weaponFlavorText: c.weaponFlavorText,
      armorFlavorText: c.armorFlavorText,
      tags: c.tags,
      isCompound: true,
      weaponEffect: c.weaponEffect,
      armorEffect: c.armorEffect,
    }));
    return [...base, ...compounds];
  }, [registry]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return entries;
    if (activeTab === 'compound') return entries.filter((e) => e.isCompound);
    return entries.filter((e) => !e.isCompound && e.category === activeTab);
  }, [entries, activeTab]);

  const selected = selectedId ? entries.find((e) => e.id === selectedId) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header with back button */}
      <div className="flex items-center gap-3 border-b border-surface-600 p-4">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-surface-400 hover:text-white"
        >
          ← Back
        </button>
        <h1
          className="text-xl font-bold"
          style={{ fontFamily: 'var(--font-family-display)', color: 'var(--color-accent-400)' }}
        >
          Gem Library
        </h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-surface-600 px-4 py-2">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === key
                ? 'bg-accent-500/20 text-accent-400'
                : 'text-surface-400 hover:bg-surface-700 hover:text-surface-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content: list + detail */}
      <div className="flex min-h-0 flex-1">
        {/* Gem list */}
        <div className="w-48 overflow-y-auto border-r border-surface-600">
          {filtered.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                selectedId === entry.id
                  ? 'bg-surface-700 text-white'
                  : 'text-surface-300 hover:bg-surface-700/50'
              }`}
            >
              {entry.name}
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto p-4">
          {selected ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-bold text-white">{selected.name}</h2>
              <p className="text-sm text-surface-300">{selected.description}</p>

              {/* Weapon section */}
              {selected.weaponFlavorText.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                    Weapon
                  </h3>
                  <p className="mb-2 text-sm leading-relaxed text-surface-200">
                    {selected.weaponFlavorText}
                  </p>
                  {/* Stat table — tiered for base, single-row for compounds */}
                  {selected.tiers ? (
                    <div className="flex flex-col gap-1">
                      {Object.entries(selected.tiers).map(([tier, data]) =>
                        data.weaponEffect.length > 0 ? (
                          <div key={tier} className="flex gap-2 text-xs text-surface-300">
                            <span className="w-8 font-semibold text-surface-500">T{tier}</span>
                            {data.weaponEffect.map((e, i) => (
                              <span key={i}>
                                {e.stat}: <span className="text-accent-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span>
                              </span>
                            ))}
                          </div>
                        ) : null
                      )}
                    </div>
                  ) : selected.weaponEffect && selected.weaponEffect.length > 0 ? (
                    <div className="flex flex-wrap gap-2 text-xs text-surface-300">
                      {selected.weaponEffect.map((e, i) => (
                        <span key={i}>
                          {e.stat}: <span className="text-accent-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Armor section */}
              {selected.armorFlavorText.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                    Armor
                  </h3>
                  <p className="mb-2 text-sm leading-relaxed text-surface-200">
                    {selected.armorFlavorText}
                  </p>
                  {selected.tiers ? (
                    <div className="flex flex-col gap-1">
                      {Object.entries(selected.tiers).map(([tier, data]) =>
                        data.armorEffect.length > 0 ? (
                          <div key={tier} className="flex gap-2 text-xs text-surface-300">
                            <span className="w-8 font-semibold text-surface-500">T{tier}</span>
                            {data.armorEffect.map((e, i) => (
                              <span key={i}>
                                {e.stat}: <span className="text-emerald-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span>
                              </span>
                            ))}
                          </div>
                        ) : null
                      )}
                    </div>
                  ) : selected.armorEffect && selected.armorEffect.length > 0 ? (
                    <div className="flex flex-wrap gap-2 text-xs text-surface-300">
                      {selected.armorEffect.map((e, i) => (
                        <span key={i}>
                          {e.stat}: <span className="text-emerald-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Tags */}
              {selected.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selected.tags.map((tag) => (
                    <span key={tag} className="rounded bg-surface-700 px-2 py-0.5 text-xs text-surface-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-surface-500">Select a gem to view details</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route to `App.tsx`**

In `packages/client/src/App.tsx`, add the import and route:

```tsx
import { GemEncyclopedia } from './pages/GemEncyclopedia';

// Inside <Route element={<AppShell />}>, add after the /settings route:
<Route path="/gems" element={<GemEncyclopedia />} />
```

- [ ] **Step 3: Add "Gems" button to `MainMenu.tsx`**

In `packages/client/src/pages/MainMenu.tsx`, add `'Gems'` to the button array (line 53):

```tsx
{[
  { label: 'Recipe Book', path: '/recipes' },
  { label: 'Gems', path: '/gems' },           // NEW
  { label: 'Collection', path: '/collection' },
  { label: 'Leaderboard', path: '/leaderboard' },
  { label: 'Profile', path: '/profile' },
].map(({ label, path }) => (
```

- [ ] **Step 4: Verify the app builds**

Run: `cd packages/client && npx vite build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/GemEncyclopedia.tsx packages/client/src/App.tsx packages/client/src/pages/MainMenu.tsx
git commit -m "feat(client): add Gem Encyclopedia page with /gems route

Full-screen gem library with filter tabs (All, Offensive, Defensive,
Sustain, Utility, Trigger, Compound), gem list, and detail panel
showing description, weapon/armor flavor text, and stat tables.
Added Gems button to main menu."
```

---

### Task 11: Add "Gem Library" shortcut to Forge header

**Files:**
- Modify: `packages/client/src/components/ForgeHeader.tsx`

- [ ] **Step 1: Add a small link in the Forge header**

In `packages/client/src/components/ForgeHeader.tsx`, in Row 1 (the header row with "FORGE PHASE" label, round pill, timer, and DONE button), add a small text link right-aligned alongside the DONE button.

> **Note:** Navigating to `/gems` leaves the Forge screen, but match state persists in Zustand stores (matchStore, forgeStore). The user can navigate back and resume. The forge timer continues ticking in the background — this is the same behavior as any other route navigation during a match.

```tsx
import { useNavigate } from 'react-router';

// Inside the component:
const navigate = useNavigate();

// In the header row, alongside the DONE button:
<button
  onClick={() => navigate('/gems')}
  className="text-xs text-surface-400 hover:text-accent-400"
  style={{ fontFamily: 'var(--font-family-body)' }}
>
  Gem Library
</button>
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/components/ForgeHeader.tsx
git commit -m "feat(client): add Gem Library shortcut to Forge header"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run full engine test suite**

Run: `cd packages/engine && npx vitest run`

Expected: All tests pass.

- [ ] **Step 2: Run full tool test suite**

Run: `cd packages/tools && npx vitest run`

Expected: All tests pass.

- [ ] **Step 3: Run full client test suite**

Run: `cd packages/client && npx vitest run`

Expected: All tests pass.

- [ ] **Step 4: Run client build**

Run: `cd packages/client && npx vite build`

Expected: Build succeeds with no TypeScript errors.
