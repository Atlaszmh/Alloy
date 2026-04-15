# Gem Library Consolidation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate GemEncyclopedia, RecipeBook, and Collection into a single Gem Library page with a GemCard grid and slide-out GemInspectPanel.

**Architecture:** Rewrite `GemEncyclopedia.tsx` as a responsive GemCard grid. Extend `GemInspectPanel` with rarity selector tabs and recipe ingredients for compounds. Extract compound stat utilities to a shared file. Delete Collection, RecipeBook, RecipeEntry, and their routes.

**Tech Stack:** React 19, React Router 7, Zustand 5, TailwindCSS v4, Vitest (jsdom), Playwright

**Spec:** `docs/superpowers/specs/2026-04-14-gem-library-consolidation-design.md`

---

## Chunk 1: Extract utilities & extend GemInspectPanel

### Task 1: Extract compound stat utilities

**Files:**
- Create: `packages/client/src/shared/utils/compound-stats.ts`
- Create: `packages/client/src/shared/utils/compound-stats.test.ts`

- [ ] **Step 1: Write failing tests for formatCompoundStat and getStatColorClass**

```ts
// packages/client/src/shared/utils/compound-stats.test.ts
import { describe, it, expect } from 'vitest';
import { formatCompoundStat, getStatColorClass } from './compound-stats';

describe('formatCompoundStat', () => {
  it('formats chance suffix', () => {
    expect(formatCompoundStat('compound.ignite.chance', 15)).toBe('15% proc chance');
  });

  it('formats dotMultiplier suffix', () => {
    expect(formatCompoundStat('compound.ignite.dotMultiplier', 2)).toBe('2x DOT multiplier');
  });

  it('formats duration suffix', () => {
    expect(formatCompoundStat('compound.freeze.duration', 3)).toBe('3s duration');
  });

  it('formats chainDamage suffix', () => {
    expect(formatCompoundStat('compound.shock.chainDamage', 120)).toBe('+120 chain damage');
  });

  it('falls back for unknown compound suffix', () => {
    expect(formatCompoundStat('compound.fire.unknown', 5)).toBe('+5 unknown');
  });

  it('handles non-compound keys', () => {
    expect(formatCompoundStat('fireDamage', 10)).toBe('+10 fireDamage');
  });
});

describe('getStatColorClass', () => {
  it('returns fire color for ignite', () => {
    expect(getStatColorClass('compound.ignite.chance')).toBe('text-fire');
  });

  it('returns cold color for freeze', () => {
    expect(getStatColorClass('compound.freeze.duration')).toBe('text-cold');
  });

  it('returns default for unknown element', () => {
    expect(getStatColorClass('compound.unknown.chance')).toBe('text-surface-300');
  });

  it('returns default for non-compound key', () => {
    expect(getStatColorClass('fireDamage')).toBe('text-surface-300');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/shared/utils/compound-stats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement compound-stats.ts**

```ts
// packages/client/src/shared/utils/compound-stats.ts

/** Map element names to Tailwind text color classes */
const ELEMENT_COLOR_CLASS: Record<string, string> = {
  ignite: 'text-fire',
  burn: 'text-fire',
  fire: 'text-fire',
  chill: 'text-cold',
  freeze: 'text-cold',
  cold: 'text-cold',
  shock: 'text-lightning',
  lightning: 'text-lightning',
  electrocute: 'text-lightning',
  poison: 'text-poison',
  venom: 'text-poison',
  blight: 'text-poison',
  shadow: 'text-shadow',
  curse: 'text-shadow',
  wither: 'text-shadow',
  chaos: 'text-chaos',
};

/**
 * Translates raw compound stat keys into human-readable descriptions.
 * Examples:
 *   "compound.ignite.chance" + 15    → "15% proc chance"
 *   "compound.ignite.dotMultiplier" + 2 → "2x DOT multiplier"
 */
export function formatCompoundStat(key: string, value: number): string {
  const parts = key.split('.');

  if (parts.length === 3 && parts[0] === 'compound') {
    const suffix = parts[2];

    switch (suffix) {
      case 'chance':
        return `${value}% proc chance`;
      case 'dotMultiplier':
        return `${value}x DOT multiplier`;
      case 'duration':
        return `${value}s duration`;
      case 'chainDamage':
        return `+${value} chain damage`;
      case 'damageMultiplier':
        return `${value}x damage multiplier`;
      case 'radius':
        return `${value} radius`;
      case 'stacks':
        return `${value} max stacks`;
      case 'penetration':
        return `${value}% penetration`;
      case 'slowAmount':
        return `${value}% slow`;
      case 'healAmount':
        return `+${value} heal`;
      case 'drainPercent':
        return `${value}% drain`;
      default:
        return `${value >= 0 ? '+' : ''}${value} ${suffix}`;
    }
  }

  return `${value >= 0 ? '+' : ''}${value} ${key}`;
}

/** Extract the element name from a compound stat key */
function getElementFromKey(key: string): string | null {
  const parts = key.split('.');
  if (parts.length >= 2 && parts[0] === 'compound') {
    return parts[1];
  }
  return null;
}

/** Get the Tailwind color class for a stat key based on its element */
export function getStatColorClass(key: string): string {
  const element = getElementFromKey(key);
  if (element && ELEMENT_COLOR_CLASS[element]) {
    return ELEMENT_COLOR_CLASS[element];
  }
  return 'text-surface-300';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/shared/utils/compound-stats.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shared/utils/compound-stats.ts packages/client/src/shared/utils/compound-stats.test.ts
git commit -m "feat(client): extract compound stat utilities to shared module"
```

---

### Task 2: Add rarity selector and recipe props to GemInspectPanel

**Files:**
- Modify: `packages/client/src/components/GemInspectPanel.tsx`

The current `GemInspectPanelProps` interface:
```ts
interface GemInspectPanelProps {
  gem: { name, description, weaponFlavorText, armorFlavorText, category?, tags, tier?, rarity?, weaponEffect?, armorEffect?, tiers? };
  context: InspectContext;
  onClose: () => void;
}
```

- [ ] **Step 1: Add new props to GemInspectPanelProps**

Add to the interface in `packages/client/src/components/GemInspectPanel.tsx`:

```ts
interface GemInspectPanelProps {
  gem: {
    name: string;
    description: string;
    weaponFlavorText: string;
    armorFlavorText: string;
    category?: string;
    tags: string[];
    tier?: number;
    rarity?: GemRarity;
    weaponEffect?: StatModifier[];
    armorEffect?: StatModifier[];
    tiers?: Record<string, { weaponEffect: StatModifier[]; armorEffect: StatModifier[] }>;
  };
  context: InspectContext;
  onClose: () => void;
  /** Recipe ingredients for compound gems */
  recipe?: { component1Name: string; component2Name: string };
  /** Currently selected rarity — parent owns this state */
  selectedRarity?: GemRarity;
  /** Callback when user switches rarity tab */
  onRarityChange?: (rarity: GemRarity) => void;
}
```

- [ ] **Step 2: Add rarity selector UI inside the panel**

First, update the import at the top of the file to add `RARITY_ORDER`:

```ts
// Change this line:
import { RARITY_MULTIPLIERS } from '@alloy/engine';
// To:
import { RARITY_MULTIPLIERS, RARITY_ORDER } from '@alloy/engine';
```

Then, replace the existing `mult`, `rarityName`, and `rarityColor` computations (lines 28-33 of current file) with:

```ts
const effectiveRarity = selectedRarity ?? gem.rarity ?? 'common';
const mult = RARITY_MULTIPLIERS[effectiveRarity];
const rarityName = effectiveRarity.charAt(0).toUpperCase() + effectiveRarity.slice(1);
const rarityColor = RARITY_COLORS[effectiveRarity] ?? '#9ca3af';
```

`RARITY_COLORS` is already defined as a local constant inside the component (line 30 of the current file) — it remains in scope for the new rarity selector tabs.

After the description `<p>` and before the weapon flavor text section, add rarity tabs:

```tsx
{/* Rarity selector tabs — shown when parent provides callbacks */}
{selectedRarity && onRarityChange && (
  <div className="flex gap-1">
    {RARITY_ORDER.map((r) => (
      <button
        key={r}
        onClick={() => onRarityChange(r)}
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
)}
```

- [ ] **Step 3: Add recipe section for compound gems**

After the description, before rarity tabs, add:

```tsx
{/* Recipe ingredients — compound gems only */}
{recipe && (
  <div className="rounded border border-surface-600 bg-surface-900/50 p-2">
    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
      Made from
    </h3>
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium text-white">{recipe.component1Name}</span>
      <span className="text-surface-400">+</span>
      <span className="font-medium text-white">{recipe.component2Name}</span>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify existing callers still work**

Existing callers of `GemInspectPanel` (if any in forge/duel screens) pass no `recipe`, `selectedRarity`, or `onRarityChange` — all new props are optional, so no breakage. Verify:

Run: `cd packages/client && npx vitest run`
Expected: All existing tests pass (no regressions)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/GemInspectPanel.tsx
git commit -m "feat(client): add rarity selector and recipe props to GemInspectPanel"
```

---

## Chunk 2: Rewrite GemEncyclopedia page

### Task 3: Rewrite GemEncyclopedia as card grid with inspect panel

**Files:**
- Modify: `packages/client/src/pages/GemEncyclopedia.tsx`

This is a full rewrite of the page. The current file (292 lines) renders a text sidebar + inline detail panel. The new version renders a GemCard grid + GemInspectPanel overlay.

**Dependency:** Chunk 1 (Tasks 1-2) must be completed first — this task uses `recipe`, `selectedRarity`, and `onRarityChange` props added to GemInspectPanel in Task 2.

- [ ] **Step 1: Rewrite GemEncyclopedia.tsx**

Replace the entire content of `packages/client/src/pages/GemEncyclopedia.tsx` with:

```tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { GemCard } from '@/components/GemCard';
import { GemInspectPanel } from '@/components/GemInspectPanel';
import type { AffixCategory, GemRarity } from '@alloy/engine';
import { RARITY_MULTIPLIERS } from '@alloy/engine';

type FilterTab = 'all' | AffixCategory | 'compound';

interface EncyclopediaEntry {
  id: string;
  name: string;
  description: string;
  weaponFlavorText: string;
  armorFlavorText: string;
  tags: string[];
  category: AffixCategory | 'combined';
  isCompound: boolean;
  weaponEffect?: Array<{ stat: string; op: string; value: number }>;
  armorEffect?: Array<{ stat: string; op: string; value: number }>;
  tiers?: Record<string, {
    weaponEffect: Array<{ stat: string; op: string; value: number }>;
    armorEffect: Array<{ stat: string; op: string; value: number }>;
  }>;
  /** Compound gems: input affix IDs */
  components?: [string, string];
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
  const getRegistry = useMatchStore((s) => s.getRegistry);
  const registry = getRegistry();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRarity, setSelectedRarity] = useState<GemRarity>('common');

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
      category: 'combined' as const,
      isCompound: true,
      weaponEffect: c.weaponEffect,
      armorEffect: c.armorEffect,
      components: c.components as [string, string],
    }));
    return [...base, ...compounds];
  }, [registry]);

  const filtered = useMemo(() => {
    let result = entries;

    // Category/compound filter
    if (activeTab === 'compound') {
      result = result.filter((e) => e.isCompound);
    } else if (activeTab !== 'all') {
      result = result.filter((e) => !e.isCompound && e.category === activeTab);
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, activeTab, search]);

  const selected = selectedId ? entries.find((e) => e.id === selectedId) ?? null : null;

  // Resolve recipe component names for compound gems
  const recipe = selected?.isCompound && selected.components
    ? {
        component1Name: registry.findAffix(selected.components[0])?.name ?? selected.components[0],
        component2Name: registry.findAffix(selected.components[1])?.name ?? selected.components[1],
      }
    : undefined;

  // Compute statLabel for a base affix at tier 1 common rarity (grid baseline)
  function getGridStatLabel(entry: EncyclopediaEntry): string {
    if (entry.isCompound || !entry.tiers) return '';
    const tier1 = entry.tiers['1'];
    if (!tier1) return '';
    const stat = tier1.weaponEffect[0];
    if (!stat) return '';
    return stat.op === 'percent'
      ? `${Math.round(stat.value * 100)}%`
      : `+${stat.value}`;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
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

      {/* Search bar */}
      <div className="border-b border-surface-600 px-4 py-2">
        <input
          type="text"
          placeholder="Search gems..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      {/* Gem card grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
          }}
        >
          {filtered.map((entry) => (
            <GemCard
              key={entry.id}
              affixId={entry.id}
              affixName={entry.name}
              tier={1}
              rarity="common"
              category={entry.isCompound ? 'combined' : entry.category}
              tags={entry.tags}
              statLabel={getGridStatLabel(entry)}
              description={entry.description}
              selected={selectedId === entry.id}
              onClick={() => setSelectedId(entry.id)}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-surface-500">No gems match your filters.</p>
        )}
      </div>

      {/* Inspect panel overlay */}
      {selected && (
        <GemInspectPanel
          gem={{
            name: selected.name,
            description: selected.description,
            weaponFlavorText: selected.weaponFlavorText,
            armorFlavorText: selected.armorFlavorText,
            category: selected.isCompound ? 'combined' : selected.category,
            tags: selected.tags,
            tier: selected.isCompound ? undefined : 1,
            rarity: selectedRarity,
            weaponEffect: selected.weaponEffect,
            armorEffect: selected.armorEffect,
            tiers: selected.tiers,
          }}
          context="both"
          onClose={() => setSelectedId(null)}
          recipe={recipe}
          selectedRarity={selectedRarity}
          onRarityChange={setSelectedRarity}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build and tests**

Run: `cd packages/client && npx vite build`
Expected: Build succeeds with no type errors

Run: `cd packages/client && npx vitest run`
Expected: All existing tests pass (no regressions)

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/GemEncyclopedia.tsx
git commit -m "feat(client): rewrite GemEncyclopedia as card grid with inspect panel"
```

---

## Chunk 3: Delete old pages, update routes, update E2E tests

### Task 4: Remove old routes and menu items

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/pages/MainMenu.tsx`

- [ ] **Step 1: Remove RecipeBook and Collection from App.tsx**

In `packages/client/src/App.tsx`:

Remove the two import lines:
```ts
import { RecipeBook } from './pages/RecipeBook';
import { Collection } from './pages/Collection';
```

Remove the two route elements:
```tsx
<Route path="/recipes" element={<RecipeBook />} />
<Route path="/collection" element={<Collection />} />
```

- [ ] **Step 2: Remove Recipe Book and Collection from MainMenu.tsx**

In `packages/client/src/pages/MainMenu.tsx`, change the nav button array (line 53-59) from:

```ts
{[
  { label: 'Recipe Book', path: '/recipes' },
  { label: 'Gems', path: '/gems' },
  { label: 'Collection', path: '/collection' },
  { label: 'Leaderboard', path: '/leaderboard' },
  { label: 'Profile', path: '/profile' },
].map(({ label, path }) => (
```

To:

```ts
{[
  { label: 'Gems', path: '/gems' },
  { label: 'Leaderboard', path: '/leaderboard' },
  { label: 'Profile', path: '/profile' },
].map(({ label, path }) => (
```

- [ ] **Step 3: Verify build**

Run: `cd packages/client && npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/pages/MainMenu.tsx
git commit -m "feat(client): remove Recipe Book and Collection routes and nav buttons"
```

---

### Task 5: Delete old page files and RecipeEntry component

**Files:**
- Delete: `packages/client/src/pages/Collection.tsx`
- Delete: `packages/client/src/pages/RecipeBook.tsx`
- Delete: `packages/client/src/features/meta/components/RecipeEntry.tsx`

- [ ] **Step 1: Verify no stale imports of deleted exports**

Run: `grep -r "formatCompoundStat\|getStatColorClass\|RecipeEntry\|from.*RecipeBook\|from.*Collection" packages/client/src --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: No matches (routes already removed in Task 4, utilities extracted in Task 1)

- [ ] **Step 2: Delete the files**

```bash
rm packages/client/src/pages/Collection.tsx
rm packages/client/src/pages/RecipeBook.tsx
rm packages/client/src/features/meta/components/RecipeEntry.tsx
```

- [ ] **Step 3: Verify build**

Run: `cd packages/client && npx vite build`
Expected: Build succeeds — no broken imports

- [ ] **Step 4: Commit**

```bash
git add -u packages/client/src/pages/Collection.tsx packages/client/src/pages/RecipeBook.tsx packages/client/src/features/meta/components/RecipeEntry.tsx
git commit -m "chore(client): delete Collection, RecipeBook, and RecipeEntry"
```

---

### Task 6: Update E2E tests for meta screens

**Files:**
- Modify: `packages/client/e2e/meta-screens.spec.ts`

The current E2E test file has tests for `recipe book` (navigates to `/recipes`) and `collection page` (navigates to `/collection`). These routes no longer exist.

- [ ] **Step 1: Replace recipe book and collection tests with gem library test**

In `packages/client/e2e/meta-screens.spec.ts`, inside the `test.describe('Meta Screens', ...)` block, remove the `recipe book` test (lines 13-27) and the `collection page` test (lines 29-43). In their place (between the `profile page` test and the `leaderboard page` test), insert:

```ts
test('gem library', async ({ page }, testInfo) => {
  const vp = getViewport(testInfo);

  await page.goto('/gems');
  await page.waitForLoadState('networkidle');
  await screenshotFlow(page, vp, 'meta', '02-gem-library');

  // Click first gem card if available
  const firstGem = page.locator('[data-gem]').first();
  if (await firstGem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstGem.click();
    await page.waitForTimeout(300);
  }
  await screenshotFlow(page, vp, 'meta', '03-gem-library-inspect');
});
```

Also renumber the remaining screenshots for clean ordering:
- `leaderboard page` test: change `'06-leaderboard'` → `'04-leaderboard'`
- `settings page` test: change `'07-settings'` → `'05-settings'`

Final screenshot numbering: 01-profile, 02-gem-library, 03-gem-library-inspect, 04-leaderboard, 05-settings.

- [ ] **Step 2: Run E2E tests to verify**

Run: `cd packages/client && npx playwright test e2e/meta-screens.spec.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/meta-screens.spec.ts
git commit -m "test(client): update E2E meta-screens for consolidated gem library"
```

---

### Task 7: Run full test suite and verify

- [ ] **Step 1: Run client unit tests**

Run: `cd packages/client && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run client build**

Run: `cd packages/client && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Run E2E tests**

Run: `cd packages/client && npx playwright test`
Expected: All tests pass

- [ ] **Step 4: Final commit if any fixups needed**

If any tests required fixups, commit them:
```bash
git add -A
git commit -m "fix(client): address test failures from gem library consolidation"
```
