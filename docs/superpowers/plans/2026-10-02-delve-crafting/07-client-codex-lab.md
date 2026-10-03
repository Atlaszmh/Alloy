# Delve component crafting (stage 4c) · C3: Codex, Loadout and the Economy view — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The client's three read-outs of the materials economy: the Codex gains **Patterns** (every base, learned or not, with where an unknown one comes from) and **Essences** (every legendary's essence, seen or not, from `profile.essencesSeen`, with how many are held); the Loadout's compare pane shows what **Salvage** gives from the engine's `salvageYield` (scrap, Links, Mana Dust, the shard of one of its lines, its pattern, its essence); and the DPS Lab gains a dev-only **Economy** view that runs `economySim(registry, seed, dives)` for chosen seeds in a worker and charts, dive by dive, a material's income, spending and death loss, the items forged by rarity, the deepest depth and the deaths, over a table of every dive.

**Architecture:** `hub/codex/CodexTab.tsx` takes its `Section` type from `HubLink` (Phase A gave the link the five sections), drops Phase A's guard, and draws the two new grids and details with one small `EntryCard`. `hub/loadout/ComparePane.tsx` calls `salvageYield(registry, profile, item)` for a bag item between dives and renders only its values (the button's `Price`, a `salvage-yield` line under it); its own salvage arithmetic (`salvageValue`, `salvageDust`, `weaponParts`) goes. The Economy view is `features/delve/lab/EconomyView.tsx` (controls, an SVG chart with a hover read-out, the table) over pure helpers in `lab/economy-model.ts` (each material's count in a `Haul`, the per-dive mean over the seeds, the chart's lines) and a fresh `lab/economy-worker.ts` per Run, as the Lab's grid has; `pages/DelveLab.tsx` adds the Economy tab and keeps both views mounted, hiding the other (`hidden`), so neither loses its run on a tab switch.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-02-delve-component-crafting-design.md` (authoritative): "The client" (Codex, Loadout), "Tuning: every number in data" (the Economy view), "Salvage", "Phases and parallel areas" (the C3 row). The contract is `01-contract.md` (Phase A) in this folder; the overview is `00-overview.md`.

---

## Base

- **Starts from:** `craft/main` after Phase A merges (`craft/a`'s head), in this area's worktree `C:/Projects/alloy-craft-c3` on branch `craft/c3`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-craft-c3 -Branch craft/c3 -Base craft/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-craft-c3` in Git Bash.
- **Chunk 2 (Tasks 3–5) needs B3's pinned report shape**, which B3 adds to Phase A's stub in `delve/economy.ts`: `economySim(registry, seed, dives, opts?: Pick<AutopilotOptions, 'primary' | 'secondary'>)`, `EconomyReport.profile` (the final `DelveProfile`) and `EconomyDive.lost: Haul | null` (what a death or an abandon lost). Run Chunk 2 on `craft/main` after B3 merges, or on any base whose `delve/economy.ts` carries those types (the tests build their reports by hand and never call `economySim`). Chunk 1 needs only Phase A.
- **What it reads from Phase A:** `HubLink`'s Codex sections `'patterns' | 'essences'` (`hub/types.ts`) and `CodexTab`'s `SECTIONS` guard (Task 10); `DelveProfile.patterns`, `essencesSeen`, `materials` (Task 7); the types `SalvageYield`, `ShardRef`, `Haul`, `EconomyDive`, `EconomyReport`, `FLUX_GRADES`, `emptyHaul`, `registry.getCraftingData()`; the stubs `salvageYield` (B2) and `economySim` (B3).
- **Needs no B code to pass its tests:** the compare pane's tests mock `salvageYield` (`vi.mock('@alloy/engine', …)`, and the Loadout's test stands it in), and the Economy view's tests answer the worker themselves; `economySim` runs only in the worker. **Merge order (X1):** Chunk 1 after B2 (the app's Loadout calls `salvageYield`), Chunk 2 after B3 (its types).
- **Before Task 1:** build the engine once for the client's junction, and measure the client:

```bash
cd /c/Projects/alloy-craft-c3
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the client suite passes (Phase A's gate reads **1169 tests in 146 files** at the base's counts). Call the measured counts **M tests in G files**.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/hub/codex/CodexTab.tsx` | `Section` from `HubLink` (Phase A's `SECTIONS` guard goes); the Patterns (n/13) and Essences (n/12) section tabs, grids (`EntryCard`) and details (`PatternDetail`, `EssenceDetail`) |
| `packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx` | the two sections; a link opens each (Phase A's "ignored" lines replaced) |
| `packages/client/src/features/delve/hub/loadout/ComparePane.tsx` | Salvage from `salvageYield`: the button's price and the `salvage-yield` line (the shard of one of its lines and the chance of a second, the pattern, the essence); `salvageValue`, `salvageDust`, `weaponParts` no longer imported |
| `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx` | `salvageYield` mocked (each test says what it gives); the yield shown; none asked mid-dive |
| `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx` | `salvageYield` stood in by what salvage gave before (outside the spec's C3 row, but the Loadout renders the compare pane and no other area edits this test; see X1) |
| `packages/client/src/features/delve/lab/economy-model.ts` (new) | `EconomyRequest`, `EconomyMaterial`, `MATERIAL_TOTALS`, `economyMaterials`, `perDive`, `EconomyLine`, `economyLines`, `parseSeeds`, `formatAmount` |
| `packages/client/src/features/delve/lab/__tests__/economy-model.test.ts` (new) | the counts, the means, the lines, the seeds |
| `packages/client/src/features/delve/lab/economy-worker.ts` (new) | `economySim` for each seed of a request, one report a message |
| `packages/client/src/features/delve/lab/EconomyView.tsx` (new) | the controls (Seeds, Dives, Run, Chart), the progress, `EconomyChart` (SVG, a legend, a hover read-out) and the table |
| `packages/client/src/features/delve/lab/__tests__/EconomyView.test.tsx` (new) | Run, the worker, the progress, the rows, the chart choices, a second Run |
| `packages/client/src/features/delve/lab/LabChart.tsx` | `niceCeil` exported (the Economy chart's y top) |
| `packages/client/src/pages/DelveLab.tsx` | the Economy tab; both views mounted, the other `hidden` (hand-edited: not Prettier-clean at the base) |
| `packages/client/src/pages/__tests__/DelveLab.test.tsx` | the Economy tab |

## Cross-area needs

**X1 · The integrator: merge order, and a test stand-in.** `ComparePane` calls `salvageYield` for every bag item shown between dives. Merge Chunk 1 after B2; before B2 the app's Loadout throws "salvageYield: not implemented" on showing any bag item. The tests don't wait: `ComparePane.test.tsx` mocks `salvageYield` per test, and `LoadoutTab.test.tsx` (which renders the pane; no area owns it in Phase C, so Task 2 edits it) stands it in by what salvage gave before (`salvageValue`, `salvageDust`, `weaponParts`), so its salvage tests keep their numbers. Once B2 has merged, that stand-in may go if B2's yields keep those tests' numbers (the spec keeps salvage's scrap, Dust and Links "as today"). Chunk 2 merges after B3 (its types; see Base); before B3 fills `economySim` the view's Run only logs `Economy worker … economySim: not implemented` from the worker.

**X2 · B3 (`delve/economy.ts`): the pinned shape, nothing more.** The view reads `EconomyReport.dives` (each dive's `income`, `spent`, `lost`, `forged`, `depth`, `died`) and nothing of `profile` or `opts` (it runs the default pair). What it assumes of the values, for B3 to keep:
1. `dives` has exactly `dives` entries, in order (`dive` = 1, 2, …): the view averages entry `i` over the seeds.
2. `income` is what the dive brought into the stockpile (after any loss), `spent` what the Anvil spent between that dive and the next (forging, honing, imprinting, refining, buying, Links on slots and sockets), and `lost` what a death or an abandon took (the floor's haul plus the death share; null when nothing was lost, which the view counts 0): all three per material in the same units, so one chart holds them.
3. `forged` counts every rarity key (`RARITY_ORDER`), 0 where none.
4. The report is plain data (it crosses the worker boundary by structured clone; `profile` too).

**X3 · Unowned: the salvage toasts.** `hub/loadout/LoadoutTab.tsx` (one item) and `hub/loadout/BagPane.tsx` (Salvage junk) word what a salvage gave from the store's `salvage` result, which now carries `shards`, `patterns` and `essences` (Phase A's store), but no area owns those files in Phase C, so the toasts don't mention them. Proposed for Phase D (or the integrator), in `LoadoutTab.tsx`'s salvage action:

```ts
      const { links, runes, destroyed, shards, patterns, essences } = s.salvage([uid]);
      // …after the parts toast:
      const found = [
        ...shards.map((r) => `${shardName(registry, r)} shard`), // C2's materials-text.ts (X4)
        ...patterns.map((id) => `the ${registry.getGearBase(id).name} pattern`),
        ...essences.map((id) => `the ${registry.getLegendary(id).name} essence`),
      ];
      if (found.length > 0) showToast(`+ ${found.join(' · ')}`);
```

and the same `found` appended to `BagPane.tsx`'s "Salvaged N items" toast.

**X4 · C2: shard names.** The compare pane names a shard inline (the affix's label and `TIER_NUMERAL`: "Damage II"). C2's plan creates `hub/forge/materials-text.ts` with `shardName(registry, ref)`, whose `affixLabel` also tells a flat affix from a percent one sharing its label ("Damage %"). After both merge, the integrator swaps the inline helper for it so the Loadout and the Forge name shards alike: in `ComparePane.tsx`, delete the `const shard = (s: ShardRef) => …` lines (and the `RuneTier`, `ShardRef` and `TIER_NUMERAL` imports), import `{ shardName } from '../forge/materials-text'`, and write `yields.shards.map((s) => shardName(registry, s))`; the yield test's expected text then reads C2's labels. X3's toasts would use `shardName` too.

## Where the spec left room

1. **What an unknown pattern says.** Patterns aren't secrets (the Forge bench lists the unknown ones greyed), so the Codex names every base; an unknown one is greyed with "Salvage one, or find its pattern on an elite or a boss" (the spec's two sources: salvage teaches a new base, `patternChance` on elites and bosses).
2. **What an essence shows.** An unseen essence is "???" with the slots its legendary forges onto (as the Legendaries section shows the slots one drops on); a seen one its name, how many are held (`materials.essences`), and in the detail the power's text with its range, "Held ×N · Forges onto: …" and "Bosses drop essences; salvaging a legendary extracts its essence".
3. **The salvage line.** Under the Salvage button, only when there is something besides currency: "Shard: Damage II or Armor IV · 25% for a second" (one of the listed shards at random; the second's chance only with two or more lines), "Teaches the Axe pattern", "Extracts the Nightstalker essence". The button's price is `salvageYield`'s scrap, Links and Mana Dust (as before, Links and Dust only when above 0); "Press again to melt" names `salvageYield`'s runes by the pull rule. The yield is asked only for a bag item between dives (the only time Salvage shows).
4. **The Economy view's numbers.** Each dive's value is the mean over the seeds that reached it; deaths are a count ("of the seeds"). The chart shows one choice at a time, so one axis holds one unit: a material's income, spending and death loss (three lines, in the Lab's validated palette's first three colours), the items forged (one line per rarity, in its rarity's colour), the deepest depth, or the deaths. The materials are the currencies, each kind's total (bars, flux, shards, essences, runes) and each metal and flux grade alone; the table shows the totals, "in / spent / lost". Seeds default to "1, 2, 3", dives to 12 (the spec's 12-dive target), at most 50. A run starts only on **Run** (each run of 12 dives × 3 seeds plays the autopilot 36 times), and the results stay until the next Run, not across sessions. `economySim`'s `opts` (a forced pair) isn't offered: the spec's view picks seeds and dives only.
5. **The Lab's tabs.** Economy is a fourth top tab beside Basics, Abilities and Runes; the DPS grid still runs on load as before. The header's subtitle reads "The autopilot, dive by dive" on it.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `craft/c3`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-craft-c3`.
- **Line endings:** every file this plan edits is CRLF in the working tree (`core.autocrlf` is on); keep each file's own (the Edit tool does). New files are LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** the commit blocks format only files a task creates or files that pass `prettier --check --end-of-line auto` at the base. `packages/client/src/pages/DelveLab.tsx` does not, and is **only hand-edited, never formatted**.
- **How the edits read** (the 4a plan's language): "Replace: A with: B" is one Edit (old A, new B). "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every anchor is unique in its file at that point.
- **No engine edits:** the client runs on the bundle built in Base; no task rebuilds it. Every task runs the whole client suite and its typecheck (Vitest doesn't type-check).
- **UI rules:** the kit (`features/delve/kit/`), text at 14 design px or more, no emoji (the Codex's icons are `ItemIcon`s). The Codex's new sections are `Tabs` entries (`level="sub"`, LT/RT on the pad) and its cards are buttons, so the pad reaches them as it reaches the Legendaries; the Lab is dev-only and keeps its own controls.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |

---

## Chunk 1: The Codex and the Loadout

### Task 1: The Codex's Patterns and Essences

**Files:**
- Modify: `packages/client/src/features/delve/hub/codex/CodexTab.tsx`
- Modify (test): `packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx`:

Replace:

```tsx
  it('a link opens its section', () => {
```

with:

```tsx
  it('the patterns: every base, learned ones with their slot, the rest greyed with where they come from', () => {
    store().setProfile({ ...store().profile, patterns: ['sword', 'cuirass', 'dagger', 'bow'] });
    render(<CodexTab {...props({ link: { tab: 'codex', section: 'patterns' } })} />);
    const tab = screen.getByTestId('codex-section-patterns');
    expect(tab).toHaveTextContent('Patterns 4/13');
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('pattern-learned').map((c) => c.textContent)).toEqual([
      'DaggerWeapon',
      'SwordWeapon',
      'BowWeapon',
      'CuirassChest',
    ]);
    const unknown = screen.getAllByTestId('pattern-unknown');
    expect(unknown).toHaveLength(9);
    expect(unknown[0]).toHaveTextContent(
      'AxeSalvage one, or find its pattern on an elite or a boss',
    );
    // The detail shows the first base until one is hovered or focused.
    const detail = screen.getByTestId('codex-detail');
    expect(detail).toHaveTextContent('DaggerWeapon · Learned');
    fireEvent.focus(unknown[0]);
    expect(unknown[0]).toHaveAttribute('aria-pressed', 'true');
    expect(detail).toHaveTextContent(
      'AxeWeapon · Not learnedSalvage one, or find its pattern on an elite or a boss',
    );
  });

  it('the essences: seen ones by name with how many are held, the rest as ???; a seen one details its power', () => {
    const [first, second] = registry.getDelveData().legendaries;
    const p = store().profile;
    store().setProfile({
      ...p,
      essencesSeen: [second.id],
      materials: { ...p.materials, essences: { [second.id]: 2 } },
    });
    render(<CodexTab {...props()} />);
    fireEvent.click(screen.getByTestId('codex-section-essences'));
    expect(screen.getByTestId('codex-section-essences')).toHaveTextContent('Essences 1/12');
    expect(screen.getAllByTestId('essence-unknown')).toHaveLength(11);
    expect(screen.getByTestId('essence-seen')).toHaveTextContent(`${second.name}Held ×2`);
    const forgesOnto = (slots: readonly (keyof typeof SLOT_LABEL)[]) =>
      `Forges onto: ${slots.map((s) => SLOT_LABEL[s]).join(', ')}`;
    const detail = screen.getByTestId('codex-detail');
    expect(detail).toHaveTextContent('???');
    expect(detail).toHaveTextContent(forgesOnto(first.slots));
    expect(detail).toHaveTextContent(
      'Bosses drop essences; salvaging a legendary extracts its essence',
    );
    fireEvent.focus(screen.getByTestId('essence-seen'));
    expect(detail).toHaveTextContent(`${second.name} essence`);
    expect(detail).toHaveTextContent(second.text.replace('{v}', `${second.min}–${second.max}`));
    expect(detail).toHaveTextContent(`Held ×2 · ${forgesOnto(second.slots)}`);
  });

  it('a link opens its section', () => {
```

Replace:

```tsx
    // Patterns and Essences arrive with stage 4c's C3: until then a link to one is ignored.
    rerender(<CodexTab {...props({ link: { tab: 'codex', section: 'essences' } })} />);
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(15);
```

with:

```tsx
    rerender(<CodexTab {...props({ link: { tab: 'codex', section: 'essences' } })} />);
    expect(screen.getAllByTestId('essence-unknown')).toHaveLength(12);
    // A new save knows three patterns: the sword's, the cuirass's and the dagger's.
    rerender(<CodexTab {...props({ link: { tab: 'codex', section: 'patterns' } })} />);
    expect(screen.getAllByTestId('pattern-unknown')).toHaveLength(10);
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/codex/__tests__/CodexTab.test.tsx)`
Expected: FAIL, 3 failed | 3 passed: `Unable to find an element by: [data-testid="codex-section-patterns"]`, the same for `codex-section-essences`, and `Unable to find an element by: [data-testid="essence-unknown"]` (the link is still ignored).

- [ ] **Step 3: The two sections**

In `packages/client/src/features/delve/hub/codex/CodexTab.tsx`:

Replace:

```tsx
import { useEffect, useState } from 'react';
import type { LegendaryDef, ManaType, Rarity } from '@alloy/engine';
```

with:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import type { GearBaseDef, LegendaryDef, ManaType, Rarity } from '@alloy/engine';
```

Replace:

```tsx
type Section = 'legendaries' | 'reactions' | 'records';
// ponytail: Patterns and Essences come with stage 4c's C3; until then a link to one is ignored.
const SECTIONS: readonly Section[] = ['legendaries', 'reactions', 'records'];
```

with:

```tsx
type Section = NonNullable<Extract<HubLink, { tab: 'codex' }>['section']>;
```

Replace:

```tsx
const FOUND: Rarity[] = ['uncommon', 'magic', 'rare', 'epic', 'legendary'];
```

with:

```tsx
const FOUND: Rarity[] = ['uncommon', 'magic', 'rare', 'epic', 'legendary'];

/** Where an unknown pattern comes from (see the crafting spec's drops and salvage). */
const PATTERN_SOURCE = 'Salvage one, or find its pattern on an elite or a boss';
/** Where essences come from. */
const ESSENCE_SOURCE = 'Bosses drop essences; salvaging a legendary extracts its essence';
```

Replace:

```tsx
 * The Codex tab: the sections (Legendaries n/12, Reactions n/15, Records), the
```

with:

```tsx
 * The Codex tab: the sections (Legendaries n/12, Reactions n/15, Patterns n/13,
 * Essences n/12, Records), the
```

Replace:

```tsx
  const bestDepth = useDelveStore((s) => s.profile.bestDepth);
  const linked = (l?: HubLink) =>
    l?.tab === 'codex' ? SECTIONS.find((s) => s === l.section) : undefined;
```

with:

```tsx
  const bestDepth = useDelveStore((s) => s.profile.bestDepth);
  const patterns = useDelveStore((s) => s.profile.patterns);
  const essencesSeen = useDelveStore((s) => s.profile.essencesSeen);
  const essencesHeld = useDelveStore((s) => s.profile.materials.essences);
  const linked = (l?: HubLink) => (l?.tab === 'codex' ? l.section : undefined);
```

Replace:

```tsx
  const found = legendaries.filter((l) => codex[l.id]).length;
  const progress = {
    legendaries: [found, legendaries.length],
    reactions: [seenReactions.length, reactions.length],
  } as const;
  const legendary = legendaries.find((l) => l.id === active) ?? legendaries[0];
  const reaction = reactions.find((r) => r.id === active) ?? reactions[0];
```

with:

```tsx
  const bases = registry.getDelveData().bases;
  const found = legendaries.filter((l) => codex[l.id]).length;
  const learned = bases.filter((b) => patterns.includes(b.id)).length;
  const seenEssences = legendaries.filter((l) => essencesSeen.includes(l.id)).length;
  const progress = {
    legendaries: [found, legendaries.length],
    reactions: [seenReactions.length, reactions.length],
    patterns: [learned, bases.length],
    essences: [seenEssences, legendaries.length],
  } as const;
  // An essence's id is its legendary's (see the crafting spec's S6): one lookup serves both sections.
  const legendary = legendaries.find((l) => l.id === active) ?? legendaries[0];
  const reaction = reactions.find((r) => r.id === active) ?? reactions[0];
  const base = bases.find((b) => b.id === active) ?? bases[0];
```

Replace:

```tsx
              { id: 'records', label: 'Records', testId: 'codex-section-records' },
```

with:

```tsx
              {
                id: 'patterns',
                label: 'Patterns',
                badge: `${learned}/${bases.length}`,
                testId: 'codex-section-patterns',
              },
              {
                id: 'essences',
                label: 'Essences',
                badge: `${seenEssences}/${legendaries.length}`,
                testId: 'codex-section-essences',
              },
              { id: 'records', label: 'Records', testId: 'codex-section-records' },
```

Replace:

```tsx
          <ReactionsGrid reactionsSeen={seenReactions} active={active} onActive={setActive} />
        )}
```

with:

```tsx
          <ReactionsGrid reactionsSeen={seenReactions} active={active} onActive={setActive} />
        )}
        {section === 'patterns' && (
          <section className="flex flex-col gap-4" aria-label="Patterns">
            <div className="flex items-baseline justify-between">
              <span className="k-section">Patterns</span>
              <span className="k-caption">
                {learned}/{bases.length} learned
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {bases.map((b) => {
                const known = patterns.includes(b.id);
                return (
                  <EntryCard
                    key={b.id}
                    active={active === b.id}
                    onActive={() => setActive(b.id)}
                    icon={<ItemIcon baseId={b.id} rarity="common" ghost={!known} />}
                    name={b.name}
                    color={known ? 'var(--k-text)' : 'var(--k-text-3)'}
                    caption={known ? SLOT_LABEL[b.slot] : PATTERN_SOURCE}
                    testId={known ? 'pattern-learned' : 'pattern-unknown'}
                  />
                );
              })}
            </div>
          </section>
        )}
        {section === 'essences' && (
          <section className="flex flex-col gap-4" aria-label="Essences">
            <div className="flex items-baseline justify-between">
              <span className="k-section">Essences</span>
              <span className="k-caption">
                {seenEssences}/{legendaries.length} seen
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {legendaries.map((l) => {
                const seen = essencesSeen.includes(l.id);
                return (
                  <EntryCard
                    key={l.id}
                    active={active === l.id}
                    onActive={() => setActive(l.id)}
                    icon={
                      <ItemIcon baseId={SLOT_BASE[l.slots[0]]} rarity="legendary" ghost={!seen} />
                    }
                    name={seen ? l.name : '???'}
                    color={seen ? RARITY_TEXT.legendary : 'var(--k-text-3)'}
                    caption={seen ? `Held ×${essencesHeld[l.id] ?? 0}` : forgesOnto(l)}
                    testId={seen ? 'essence-seen' : 'essence-unknown'}
                  />
                );
              })}
            </div>
          </section>
        )}
```

Replace:

```tsx
            seen={seenReactions.includes(reaction.id)}
          />
        )}
```

with:

```tsx
            seen={seenReactions.includes(reaction.id)}
          />
        )}
        {section === 'patterns' && <PatternDetail def={base} known={patterns.includes(base.id)} />}
        {section === 'essences' && (
          <EssenceDetail
            def={legendary}
            seen={essencesSeen.includes(legendary.id)}
            held={essencesHeld[legendary.id] ?? 0}
          />
        )}
```

Append at the end of the file:

```tsx
/** One card of a section's grid; hovered or focused, it is the detail's. */
function EntryCard({
  active,
  onActive,
  icon,
  name,
  color,
  caption,
  testId,
}: {
  active: boolean;
  onActive: () => void;
  icon: ReactNode;
  name: string;
  color: string;
  caption: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="k-socket flex items-center gap-3 p-3 text-left"
      style={{ borderColor: active ? 'var(--k-hot)' : undefined }}
      aria-pressed={active}
      onMouseEnter={onActive}
      onFocus={onActive}
      data-testid={testId}
    >
      <span className="h-10 w-10 flex-none">{icon}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="k-disp truncate text-[20px]" style={{ color }}>
          {name}
        </span>
        <span className="k-caption">{caption}</span>
      </span>
    </button>
  );
}

function PatternDetail({ def, known }: { def: GearBaseDef; known: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="h-24 w-24">
        <ItemIcon baseId={def.id} rarity="common" ghost={!known} />
      </span>
      <span className="k-heading" style={{ color: known ? 'var(--k-text)' : 'var(--k-text-3)' }}>
        {def.name}
      </span>
      <p className="text-[18px]">
        {SLOT_LABEL[def.slot]} · {known ? 'Learned' : 'Not learned'}
      </p>
      <p className="k-caption">{known ? 'Forge it at the Forge bench' : PATTERN_SOURCE}</p>
    </div>
  );
}

function forgesOnto(l: LegendaryDef): string {
  return `Forges onto: ${l.slots.map((s) => SLOT_LABEL[s]).join(', ')}`;
}

function EssenceDetail({ def, seen, held }: { def: LegendaryDef; seen: boolean; held: number }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="h-24 w-24">
        <ItemIcon baseId={SLOT_BASE[def.slots[0]]} rarity="legendary" ghost={!seen} />
      </span>
      <span
        className="k-heading"
        style={{ color: seen ? RARITY_TEXT.legendary : 'var(--k-text-3)' }}
      >
        {seen ? `${def.name} essence` : '???'}
      </span>
      {seen && <p className="text-[18px]">{def.text.replace('{v}', `${def.min}–${def.max}`)}</p>}
      <p className="k-caption">{seen ? `Held ×${held} · ${forgesOnto(def)}` : forgesOnto(def)}</p>
      <p className="k-caption">{ESSENCE_SOURCE}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run them to see them pass, then the client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/codex/__tests__/CodexTab.test.tsx)`
Expected: PASS, 6 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 2 tests in G files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c3
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/codex/CodexTab.tsx src/features/delve/hub/codex/__tests__/CodexTab.test.tsx)
git add packages/client/src/features/delve/hub/codex/CodexTab.tsx packages/client/src/features/delve/hub/codex/__tests__/CodexTab.test.tsx
git commit -m "feat(client): the Codex's Patterns and Essences" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The compare pane's Salvage shows the engine's yield

**Files:**
- Modify: `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`
- Modify (tests): `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx`, `hub/loadout/__tests__/LoadoutTab.test.tsx` (its stand-in for `salvageYield`; without it, Step 3 fails 8 of its tests with "salvageYield: not implemented")

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx`:

Replace:

```tsx
  referenceDepth,
  SeededRNG,
  type GearItem,
  type ManaType,
  type RuneRef,
} from '@alloy/engine';
```

with:

```tsx
  referenceDepth,
  salvageYield,
  SeededRNG,
  type GearItem,
  type ManaType,
  type RuneRef,
  type SalvageYield,
} from '@alloy/engine';
```

Replace:

```tsx
const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
```

with:

```tsx
// The engine's salvage preview (stage 4c's B2): each test says what it gives.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  salvageYield: vi.fn(),
}));
/** A salvage that gives scrap alone. */
const SCRAP_ONLY: SalvageYield = {
  scrap: 12,
  dust: 0,
  links: 0,
  shards: [],
  extraShard: 0,
  pattern: null,
  essence: null,
  runes: [],
};

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
```

Replace:

```tsx
    useDelveStore.setState({ unsocket: null, bindDeclined: [] });
  });
```

with:

```tsx
    useDelveStore.setState({ unsocket: null, bindDeclined: [] });
    vi.mocked(salvageYield).mockReset().mockReturnValue(SCRAP_ONLY);
  });
```

Replace:

```tsx
  it('greys attunement outside the pair, and shows the scrap and Mana Dust salvage gives', () => {
```

with:

```tsx
  it('greys attunement outside the pair, and shows the scrap and Mana Dust salvage gives (the engine says)', () => {
```

Replace:

```tsx
    store().declineBind('frost');
    show('h1');
```

with:

```tsx
    store().declineBind('frost');
    vi.mocked(salvageYield).mockReturnValue({ ...SCRAP_ONLY, dust: pal.salvageDust.magic });
    show('h1');
```

Replace:

```tsx
      new RegExp(`^Salvage · \\+\\d+ scrap · \\+${pal.salvageDust.magic} Mana Dust`),
    );
  });
```

with:

```tsx
      new RegExp(`^Salvage · \\+12 scrap · \\+${pal.salvageDust.magic} Mana Dust`),
    );
  });

  it("Salvage shows the engine's yield: Links, a shard of one of its lines, its pattern and its essence", () => {
    const essence = registry.getDelveData().legendaries[0];
    vi.mocked(salvageYield).mockReturnValue({
      scrap: 40,
      dust: 5,
      links: 2,
      shards: [
        { stat: 'damage', tier: 2 },
        { stat: 'armor', tier: 4 },
      ],
      extraShard: 0.25,
      pattern: 'axe',
      essence: essence.id,
      runes: [],
    });
    put(helm('fire'));
    show('h1');
    const p = store().profile;
    expect(salvageYield).toHaveBeenLastCalledWith(registry, p, p.bag[0]);
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      /^Salvage · \+2 Links · \+40 scrap · \+5 Mana Dust/,
    );
    const label = (stat: 'damage' | 'armor') => registry.getGearAffix(stat)!.label;
    expect(screen.getByTestId('salvage-yield')).toHaveTextContent(
      `Shard: ${label('damage')} II or ${label('armor')} IV · 25% for a second` +
        'Teaches the Axe pattern' +
        `Extracts the ${essence.name} essence`,
    );
  });
```

Replace:

```tsx
    const { props } = show('h1');
```

with:

```tsx
    const { props } = show('h1');
    // Scrap alone: no yield line.
    expect(screen.queryByTestId('salvage-yield')).toBeNull();
```

Replace:

```tsx
    const view = show('h1', { locked: true });
```

with:

```tsx
    const view = show('h1', { locked: true });
    // Nothing salvages mid-dive, so the engine isn't asked.
    expect(salvageYield).not.toHaveBeenCalled();
```

The Loadout renders the compare pane, so its test needs the same stand-in until B2 (see Files).

In `packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx`:

Replace:

```tsx
import { getDelveRegistry } from '../../../registry';

const registry = getDelveRegistry();
```

with:

```tsx
import { getDelveRegistry } from '../../../registry';

// The compare pane asks the engine's salvage preview, a stub until stage 4c's B2: here it gives
// what salvage gave before (scrap, Mana Dust off the pair, a weapon's Links and runes).
vi.mock('@alloy/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@alloy/engine')>();
  return {
    ...engine,
    salvageYield: (...[registry, profile, item]: Parameters<typeof engine.salvageYield>) => {
      const parts = engine.weaponParts(registry, item);
      return {
        scrap: engine.salvageValue(registry, item),
        dust: engine.salvageDust(registry, item, profile.pair),
        links: parts.links,
        shards: [],
        extraShard: 0,
        pattern: null,
        essence: null,
        runes: parts.runes,
      };
    },
  };
});

const registry = getDelveRegistry();
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx)`
Expected: FAIL, 2 failed | 27 passed: `greys attunement outside the pair…` (`expect(element).toHaveTextContent()`: the button still shows the old scrap) and `Salvage shows the engine's yield…` (`expected last "spy" call to have been called with [ DataRegistry{ …(16) }, …(2) ]`: the pane never asks). The Loadout's 11 pass (nothing calls its stand-in yet).

- [ ] **Step 3: The yield**

In `packages/client/src/features/delve/hub/loadout/ComparePane.tsx`:

Replace:

```tsx
  profileStats,
  salvageDust,
  salvageValue,
  unsocketMode,
  weaponParts,
  type ManaType,
} from '@alloy/engine';
```

with:

```tsx
  profileStats,
  salvageYield,
  unsocketMode,
  type ManaType,
  type RuneTier,
  type ShardRef,
} from '@alloy/engine';
```

Replace:

```tsx
import { SKILL_NAME } from '../../chains/chain-text';
```

with:

```tsx
import { SKILL_NAME } from '../../chains/chain-text';
import { TIER_NUMERAL } from '../../runes/rune-style';
```

Replace:

```tsx
 * Transfer, and Equip, Salvage and Lock with their gains; "Forge it ›" opens the Forge with it.
```

with:

```tsx
 * Transfer, and Equip, Salvage (what the engine's `salvageYield` says it gives: currency, a
 * shard, its pattern, its essence) and Lock with their gains; "Forge it ›" opens the Forge with it.
```

Replace:

```tsx
  const parts = weaponParts(registry, item);
  const melts = pullText(registry, parts.runes, pull);
  const dust = salvageDust(registry, item, pair);
```

with:

```tsx
  // What salvage gives, as the engine reckons it: only a bag item salvages, and only between dives.
  const yields = inBag && !locked ? salvageYield(registry, profile, item) : null;
  const melts = yields ? pullText(registry, yields.runes, pull) : '';
  const shard = (s: ShardRef) =>
    `${registry.getGearAffix(s.stat)?.label ?? s.stat} ${TIER_NUMERAL[s.tier as RuneTier]}`;
```

Replace:

```tsx
            {inBag && (
              <Button
                variant="danger"
```

with:

```tsx
            {yields && (
              <Button
                variant="danger"
```

Replace:

```tsx
                    <Price
                      scrap={salvageValue(registry, item)}
                      links={parts.links > 0 ? parts.links : undefined}
                      dust={dust > 0 ? dust : undefined}
                      signed
                    />
                  </>
                )}
              </Button>
            )}
```

with:

```tsx
                    <Price
                      scrap={yields.scrap}
                      links={yields.links > 0 ? yields.links : undefined}
                      dust={yields.dust > 0 ? yields.dust : undefined}
                      signed
                    />
                  </>
                )}
              </Button>
            )}
            {yields && (yields.shards.length > 0 || yields.pattern || yields.essence) && (
              <span
                className="flex flex-col text-[14px] text-[var(--k-text-2)]"
                data-testid="salvage-yield"
              >
                {yields.shards.length > 0 && (
                  <span>
                    Shard: {yields.shards.map(shard).join(' or ')}
                    {yields.shards.length > 1 &&
                      yields.extraShard > 0 &&
                      ` · ${Math.round(yields.extraShard * 100)}% for a second`}
                  </span>
                )}
                {yields.pattern && (
                  <span>Teaches the {registry.getGearBase(yields.pattern).name} pattern</span>
                )}
                {yields.essence && (
                  <span>Extracts the {registry.getLegendary(yields.essence).name} essence</span>
                )}
              </span>
            )}
```

- [ ] **Step 4: Run them to see them pass, then the client**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx)`
Expected: PASS, 29 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 3 tests in G files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c3
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/hub/loadout/ComparePane.tsx src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx)
git add packages/client/src/features/delve/hub/loadout/ComparePane.tsx packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx
git commit -m "feat(client): the compare pane's Salvage shows the engine's yield: a shard, the pattern, the essence" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The Economy view

### Task 3: The Economy view's model

**Files:**
- Create: `packages/client/src/features/delve/lab/economy-model.ts`
- Create (test): `packages/client/src/features/delve/lab/__tests__/economy-model.test.ts`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/lab/__tests__/economy-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createDelveProfile,
  emptyHaul,
  type EconomyDive,
  type EconomyReport,
  type Haul,
} from '@alloy/engine';
import { RARITY_COLOR } from '../../format';
import { getDelveRegistry } from '../../registry';
import {
  MATERIAL_TOTALS,
  economyLines,
  economyMaterials,
  formatAmount,
  parseSeeds,
  perDive,
} from '../economy-model';

const NONE = { common: 0, uncommon: 0, magic: 0, rare: 0, epic: 0, legendary: 0 };
/** A report's final save: the view never reads it. */
const PROFILE = createDelveProfile(getDelveRegistry(), 1);
const haul = (over: Partial<Haul> = {}): Haul => ({ ...emptyHaul(), ...over });
function dive(n: number, over: Partial<EconomyDive> = {}): EconomyDive {
  return {
    dive: n,
    income: haul(),
    spent: haul(),
    forged: NONE,
    depth: n,
    died: false,
    lost: null,
    ...over,
  };
}

describe('the Economy view model', () => {
  it("counts each material a haul holds: the currencies, each kind's total, each metal and flux grade", () => {
    const empty = emptyHaul();
    const h = haul({
      scrap: 120,
      dust: 4,
      links: 1,
      metals: { ...empty.metals, rusty: 3, iron: 2 },
      flux: { ...empty.flux, magic: 1 },
      shards: { damage: [2, 1], armor: [0, 0, 1] },
      essences: { anything: 1 },
      runes: { split: [1, 0, 2] } as Haul['runes'],
    });
    const of = Object.fromEntries(economyMaterials().map((m) => [m.id, m.of(h)]));
    expect(of).toMatchObject({
      scrap: 120,
      dust: 4,
      links: 1,
      bars: 5,
      flux: 1,
      shards: 4,
      essences: 1,
      runes: 3,
      'metal:rusty': 3,
      'metal:iron': 2,
      'metal:voidforged': 0,
      'flux:magic': 1,
      'flux:epic': 0,
    });
    expect(MATERIAL_TOTALS.map((m) => m.id)).toEqual([
      'scrap',
      'dust',
      'links',
      'bars',
      'flux',
      'shards',
      'essences',
      'runes',
    ]);
    const labels = economyMaterials().map((m) => m.label);
    expect(labels).toContain('Rusty bars');
    expect(labels).toContain('Magic flux');
  });

  it("takes each dive's mean over the seeds, or a sum for deaths", () => {
    const a: EconomyReport = {
      seed: 1,
      dives: [dive(1, { depth: 3 }), dive(2, { depth: 5, died: true })],
      profile: PROFILE,
    };
    const b: EconomyReport = {
      seed: 2,
      dives: [dive(1, { depth: 4 }), dive(2, { depth: 8, died: true })],
      profile: PROFILE,
    };
    expect(perDive([a, b], (d) => d.depth)).toEqual([3.5, 6.5]);
    expect(perDive([a, b], (d) => (d.died ? 1 : 0), true)).toEqual([0, 2]);
    expect(perDive([], (d) => d.depth)).toEqual([]);
  });

  it("draws a material's income, spending and death loss, the items forged by rarity, the depth or the deaths", () => {
    const r: EconomyReport = {
      seed: 1,
      dives: [
        dive(1, {
          income: haul({ scrap: 50 }),
          spent: haul({ scrap: 20 }),
          forged: { ...NONE, magic: 1 },
          died: true,
          lost: haul({ scrap: 8 }),
        }),
        dive(2),
      ],
      profile: PROFILE,
    };
    // A dive that lost nothing (`lost: null`) counts 0.
    expect(economyLines([r], 'scrap').map((l) => [l.label, l.values])).toEqual([
      ['Scrap in', [50, 0]],
      ['Scrap spent', [20, 0]],
      ['Scrap lost', [8, 0]],
    ]);
    const forged = economyLines([r], 'forged');
    expect(forged.map((l) => l.label)).toEqual([
      'Common',
      'Uncommon',
      'Magic',
      'Rare',
      'Epic',
      'Legendary',
    ]);
    expect(forged[2]).toMatchObject({ color: RARITY_COLOR.magic, values: [1, 0] });
    expect(economyLines([r], 'depth')).toMatchObject([{ label: 'Deepest depth', values: [1, 2] }]);
    expect(economyLines([r], 'deaths')).toMatchObject([{ label: 'Deaths', values: [1, 0] }]);
  });

  it('reads the seeds as whole numbers, each once, and writes amounts short', () => {
    expect(parseSeeds('1, 2,3  2 x -4 5.5')).toEqual([1, 2, 3]);
    expect(parseSeeds('')).toEqual([]);
    expect([3, 2.5, 1234].map(formatAmount)).toEqual(['3', '2.5', '1.2k']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/lab/__tests__/economy-model.test.ts)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../economy-model" from "src/features/delve/lab/__tests__/economy-model.test.ts". Does the file exist?`

- [ ] **Step 3: The model**

Create `packages/client/src/features/delve/lab/economy-model.ts`:

```ts
import {
  FLUX_GRADES,
  RARITY_ORDER,
  type EconomyDive,
  type EconomyReport,
  type Haul,
} from '@alloy/engine';
import { RARITY_COLOR, RARITY_LABEL, formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { PALETTE } from './lab-model';

/**
 * The DPS Lab's Economy view's pure helpers (see the crafting spec's "Economy
 * view"): how much of each material a haul holds, each dive's mean over the
 * seeds, and the lines a chart choice draws.
 */

/** What the view asks its worker for: the economy sim of each seed, `dives` dives each. */
export interface EconomyRequest {
  seeds: number[];
  dives: number;
}

/** A material the view counts: its id, its label and how much of it a haul holds. */
export interface EconomyMaterial {
  id: string;
  label: string;
  of: (h: Haul) => number;
}

const total = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0);

/** The table's materials: the currencies, then each kind's total. */
export const MATERIAL_TOTALS: EconomyMaterial[] = [
  { id: 'scrap', label: 'Scrap', of: (h) => h.scrap },
  { id: 'dust', label: 'Mana Dust', of: (h) => h.dust },
  { id: 'links', label: 'Links', of: (h) => h.links },
  { id: 'bars', label: 'Bars', of: (h) => total(Object.values(h.metals)) },
  { id: 'flux', label: 'Flux', of: (h) => total(Object.values(h.flux)) },
  {
    id: 'shards',
    label: 'Shards',
    of: (h) => total(Object.values(h.shards).flatMap((tiers) => tiers ?? [])),
  },
  { id: 'essences', label: 'Essences', of: (h) => total(Object.values(h.essences)) },
  { id: 'runes', label: 'Runes', of: (h) => total(Object.values(h.runes).flat()) },
];

/** Every material the chart can show: the totals, then each metal and each flux grade alone. */
export function economyMaterials(): EconomyMaterial[] {
  const { metals } = getDelveRegistry().getCraftingData();
  return [
    ...MATERIAL_TOTALS,
    ...metals.map((m) => ({
      id: `metal:${m.id}`,
      label: `${m.name} bars`,
      of: (h: Haul) => h.metals[m.id] ?? 0,
    })),
    ...FLUX_GRADES.map((g) => ({
      id: `flux:${g}`,
      label: `${RARITY_LABEL[g]} flux`,
      of: (h: Haul) => h.flux[g] ?? 0,
    })),
  ];
}

/** Each dive's mean over the reports that reached it of `value` (its sum with `sum`). */
export function perDive(
  reports: readonly EconomyReport[],
  value: (d: EconomyDive) => number,
  sum = false,
): number[] {
  const n = Math.max(0, ...reports.map((r) => r.dives.length));
  return Array.from({ length: n }, (_, i) => {
    const at = reports.flatMap((r) => (r.dives[i] ? [value(r.dives[i])] : []));
    return sum || at.length === 0 ? total(at) : total(at) / at.length;
  });
}

/** One charted line: a value a dive. */
export interface EconomyLine {
  key: string;
  label: string;
  color: string;
  values: number[];
}

/**
 * The chart's lines for a choice: a material's income, spending and death loss
 * (its id; `lost` null counts 0), the items forged by rarity (`'forged'`), the
 * deepest depth (`'depth'`) or the deaths (`'deaths'`, a count). One choice at a
 * time, so one axis holds one unit.
 */
export function economyLines(reports: readonly EconomyReport[], show: string): EconomyLine[] {
  if (show === 'forged')
    return RARITY_ORDER.map((r) => ({
      key: `forged:${r}`,
      label: RARITY_LABEL[r],
      color: RARITY_COLOR[r],
      values: perDive(reports, (d) => d.forged[r] ?? 0),
    }));
  if (show === 'depth')
    return [
      {
        key: 'depth',
        label: 'Deepest depth',
        color: PALETTE[0],
        values: perDive(reports, (d) => d.depth),
      },
    ];
  if (show === 'deaths')
    return [
      {
        key: 'deaths',
        label: 'Deaths',
        color: PALETTE[1],
        values: perDive(reports, (d) => (d.died ? 1 : 0), true),
      },
    ];
  const m = economyMaterials().find((x) => x.id === show) ?? MATERIAL_TOTALS[0];
  return [
    {
      key: `income:${m.id}`,
      label: `${m.label} in`,
      color: PALETTE[0],
      values: perDive(reports, (d) => m.of(d.income)),
    },
    {
      key: `spent:${m.id}`,
      label: `${m.label} spent`,
      color: PALETTE[1],
      values: perDive(reports, (d) => m.of(d.spent)),
    },
    {
      key: `lost:${m.id}`,
      label: `${m.label} lost`,
      color: PALETTE[2],
      values: perDive(reports, (d) => (d.lost ? m.of(d.lost) : 0)),
    },
  ];
}

/** The seeds typed in ("1, 2, 3"): whole numbers from 0, each once, in order. */
export function parseSeeds(text: string): number[] {
  const seeds = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);
  return [...new Set(seeds)];
}

/** A dive's value: whole as it is, a mean to one place, thousands short (1.2k). */
export function formatAmount(n: number): string {
  if (n >= 1000) return formatNumber(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
```

- [ ] **Step 4: Run it to see it pass, then the client**

Run: `(cd packages/client && npx vitest run src/features/delve/lab/__tests__/economy-model.test.ts)`
Expected: PASS, 4 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 7 tests in G + 1 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c3
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/lab/economy-model.ts src/features/delve/lab/__tests__/economy-model.test.ts)
git add packages/client/src/features/delve/lab/economy-model.ts packages/client/src/features/delve/lab/__tests__/economy-model.test.ts
git commit -m "feat(client): the Economy view's model: materials in a haul, means per dive, the chart's lines" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The Economy view: its worker, chart and table

**Files:**
- Create: `packages/client/src/features/delve/lab/economy-worker.ts`, `packages/client/src/features/delve/lab/EconomyView.tsx`
- Create (test): `packages/client/src/features/delve/lab/__tests__/EconomyView.test.tsx`
- Modify: `packages/client/src/features/delve/lab/LabChart.tsx`

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/lab/__tests__/EconomyView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createDelveProfile, emptyHaul, type EconomyReport } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { EconomyView } from '../EconomyView';

/** Stands in for the view's worker: the test answers each run itself. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<EconomyReport>) => void) | null = null;
  requests: unknown[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: unknown) {
    this.requests.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  /** Post a seed's report back, as the worker does. */
  reply(report: EconomyReport) {
    act(() => this.onmessage?.({ data: report } as MessageEvent<EconomyReport>));
  }
}
const latest = () => FakeWorker.all[FakeWorker.all.length - 1];

const NONE = { common: 0, uncommon: 0, magic: 0, rare: 0, epic: 0, legendary: 0 };
const PROFILE = createDelveProfile(getDelveRegistry(), 1);
/**
 * Seed `seed`'s dives at these depths: 100 × seed scrap in and 10 spent a dive, `seed` rares
 * forged, the last a death that loses 30 scrap.
 */
function report(seed: number, depths: number[]): EconomyReport {
  return {
    seed,
    dives: depths.map((depth, i) => {
      const died = i === depths.length - 1;
      return {
        dive: i + 1,
        income: { ...emptyHaul(), scrap: 100 * seed },
        spent: { ...emptyHaul(), scrap: 10 },
        forged: { ...NONE, rare: seed },
        depth,
        died,
        lost: died ? { ...emptyHaul(), scrap: 30 } : null,
      };
    }),
    profile: PROFILE,
  };
}
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('EconomyView', () => {
  beforeEach(() => {
    FakeWorker.all = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('runs the economy sim for the seeds and dives on Run, in a worker, then tables each dive', () => {
    render(<EconomyView />);
    expect(screen.getByTestId('economy-seeds')).toHaveValue('1, 2, 3');
    expect(screen.getByTestId('economy-dives')).toHaveValue(12);
    expect(screen.getByTestId('economy-results')).toHaveTextContent(
      'Pick seeds and dives, then Run',
    );
    expect(FakeWorker.all).toHaveLength(0);
    fireEvent.change(screen.getByTestId('economy-seeds'), { target: { value: '7, 8' } });
    fireEvent.change(screen.getByTestId('economy-dives'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('economy-run'));
    expect(latest().requests).toEqual([{ seeds: [7, 8], dives: 3 }]);
    expect(screen.getByTestId('economy-progress')).toBeInTheDocument();
    latest().reply(report(7, [2, 3, 4]));
    expect(screen.getByTestId('economy-progress')).toBeInTheDocument();
    latest().reply(report(8, [4, 5, 6]));
    expect(screen.queryByTestId('economy-progress')).toBeNull();
    const rows = screen.getAllByTestId('economy-row');
    expect(rows).toHaveLength(3);
    // Dive, depth, deaths, forged by rarity, then each total "in / spent / lost": means over the
    // seeds, deaths a count.
    expect(cells(rows[0]).slice(0, 5)).toEqual([
      '1',
      '3',
      '0',
      '0 · 0 · 0 · 7.5 · 0 · 0',
      '750 / 10 / 0',
    ]);
    expect(cells(rows[2]).slice(0, 5)).toEqual([
      '3',
      '5',
      '2',
      '0 · 0 · 0 · 7.5 · 0 · 0',
      '750 / 10 / 30',
    ]);
  });

  it("charts a material's income, spending and death loss, the items forged by rarity, the depth or the deaths", () => {
    render(<EconomyView />);
    fireEvent.click(screen.getByTestId('economy-run'));
    for (const seed of [1, 2, 3]) latest().reply(report(seed, [1, 2]));
    const show = screen.getByTestId('economy-show');
    expect(show).toHaveValue('scrap');
    expect(screen.getAllByTestId('economy-line')).toHaveLength(3);
    for (const label of ['Scrap in', 'Scrap spent', 'Scrap lost'])
      expect(screen.getByTestId('economy-legend')).toHaveTextContent(label);
    fireEvent.change(show, { target: { value: 'forged' } });
    expect(screen.getAllByTestId('economy-line')).toHaveLength(6);
    fireEvent.change(show, { target: { value: 'deaths' } });
    expect(screen.getAllByTestId('economy-line')).toHaveLength(1);
    // The read-out is the last dive's until the pointer picks one: all three seeds died on dive 2.
    expect(screen.getByTestId('economy-legend')).toHaveTextContent('Dive 23Deaths');
  });

  it('a new Run ends the last worker and starts afresh; no seeds, no Run', () => {
    render(<EconomyView />);
    const run = screen.getByTestId('economy-run');
    fireEvent.click(run);
    const first = latest();
    first.reply(report(1, [2]));
    expect(screen.getAllByTestId('economy-row')).toHaveLength(1);
    fireEvent.click(run);
    expect(first.terminated).toBe(true);
    expect(FakeWorker.all).toHaveLength(2);
    expect(screen.queryAllByTestId('economy-row')).toHaveLength(0);
    fireEvent.change(screen.getByTestId('economy-seeds'), { target: { value: 'none' } });
    expect(run).toBeDisabled();
    fireEvent.change(screen.getByTestId('economy-seeds'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('economy-dives'), { target: { value: '0' } });
    expect(run).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/lab/__tests__/EconomyView.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../EconomyView" from "src/features/delve/lab/__tests__/EconomyView.test.tsx". Does the file exist?`

- [ ] **Step 3: The worker, the view and its chart**

In `packages/client/src/features/delve/lab/LabChart.tsx`:

Replace:

```tsx
function niceCeil(v: number): number {
```

with:

```tsx
export function niceCeil(v: number): number {
```

Create `packages/client/src/features/delve/lab/economy-worker.ts`:

```ts
/// <reference lib="webworker" />
import { createDefaultRegistry, economySim, type EconomyReport } from '@alloy/engine';
import type { EconomyRequest } from './economy-model';

/**
 * Runs the Economy view's request: the economy sim of each seed in turn,
 * posting each report as it finishes. The view starts a fresh worker per Run.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<EconomyRequest>) => {
  const registry = createDefaultRegistry();
  for (const seed of e.data.seeds)
    scope.postMessage(economySim(registry, seed, e.data.dives) satisfies EconomyReport);
};
```

Create `packages/client/src/features/delve/lab/EconomyView.tsx`:

```tsx
import { useEffect, useState, type PointerEvent } from 'react';
import { RARITY_ORDER, type EconomyReport } from '@alloy/engine';
import { Button, Panel } from '../kit';
import { niceCeil } from './LabChart';
import {
  MATERIAL_TOTALS,
  economyLines,
  economyMaterials,
  formatAmount,
  parseSeeds,
  perDive,
  type EconomyLine,
  type EconomyRequest,
} from './economy-model';

/** The most dives a run takes. */
const MAX_DIVES = 50;
const FIELD = 'k-well px-2 py-1.5 text-[14px] text-[var(--k-text)]';
const LABEL = 'flex items-center gap-2 text-[16px] text-[var(--k-text-2)]';
const HEAD = 'px-1 py-1 text-left font-normal text-stone-500';
/** What the chart shows besides a material. */
const OTHER_CHARTS = [
  { id: 'forged', label: 'Items forged' },
  { id: 'depth', label: 'Deepest depth' },
  { id: 'deaths', label: 'Deaths' },
];

/**
 * The DPS Lab's Economy view (dev builds only; see the crafting spec): the
 * engine's economy sim (the autopilot over N dives from a new save) for the
 * chosen seeds, run in a worker on Run, charted dive by dive (a material's
 * income, spending and death loss, the items forged by rarity, the deepest
 * depth or the deaths) over a table of every dive. Each value is the mean over the seeds;
 * deaths are a count. The page keeps it mounted, `hidden` under the other views.
 */
export function EconomyView({ hidden = false }: { hidden?: boolean }) {
  const [seedsText, setSeedsText] = useState('1, 2, 3');
  const [dives, setDives] = useState(12);
  const [show, setShow] = useState('scrap');
  const [run, setRun] = useState<EconomyRequest | null>(null);
  const [reports, setReports] = useState<EconomyReport[]>([]);
  const seeds = parseSeeds(seedsText);
  const valid = seeds.length > 0 && Number.isInteger(dives) && dives >= 1 && dives <= MAX_DIVES;
  const running = run !== null && reports.length < run.seeds.length;

  // Each Run gets a fresh worker; a new Run, or leaving the page, ends the last.
  useEffect(() => {
    if (!run) return;
    const worker = new Worker(new URL('./economy-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<EconomyReport>) => setReports((prev) => [...prev, e.data]);
    // A throw inside the sim would otherwise leave the progress bar stuck in silence.
    worker.onerror = (e) => console.error('Economy worker', e.message);
    worker.postMessage(run);
    return () => {
      worker.onmessage = null;
      worker.terminate();
    };
  }, [run]);

  const onRun = () => {
    setReports([]);
    setRun({ seeds, dives });
  };

  const depth = perDive(reports, (d) => d.depth);
  const deaths = perDive(reports, (d) => (d.died ? 1 : 0), true);
  const forged = RARITY_ORDER.map((r) => perDive(reports, (d) => d.forged[r] ?? 0));
  const materials = MATERIAL_TOTALS.map((m) => [
    perDive(reports, (d) => m.of(d.income)),
    perDive(reports, (d) => m.of(d.spent)),
    perDive(reports, (d) => (d.lost ? m.of(d.lost) : 0)),
  ]);

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 px-8 py-5"
      hidden={hidden}
      data-testid="economy-view"
    >
      <Panel material="well" scroll={false} className="shrink-0">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className={LABEL}>
            Seeds
            <input
              type="text"
              className={FIELD}
              value={seedsText}
              onChange={(e) => setSeedsText(e.target.value)}
              data-testid="economy-seeds"
            />
          </label>
          <label className={LABEL}>
            Dives
            <input
              type="number"
              className={`${FIELD} w-20`}
              min={1}
              max={MAX_DIVES}
              value={dives}
              onChange={(e) => setDives(Number(e.target.value))}
              data-testid="economy-dives"
            />
          </label>
          <Button variant="go" disabled={!valid} onClick={onRun} testId="economy-run">
            Run
          </Button>
          <label className={LABEL}>
            Chart
            <select
              className={FIELD}
              value={show}
              onChange={(e) => setShow(e.target.value)}
              data-testid="economy-show"
            >
              {[...economyMaterials(), ...OTHER_CHARTS].map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <span className="k-caption">Each dive: the mean over the seeds; deaths a count</span>
        </div>
        {running && (
          <div className="h-1.5 overflow-hidden bg-white/10" data-testid="economy-progress">
            <div
              className="h-full bg-[var(--k-hot)]"
              style={{ width: `${(reports.length / run.seeds.length) * 100}%` }}
            />
          </div>
        )}
      </Panel>
      <Panel className="min-h-0 flex-1" testId="economy-results">
        {reports.length === 0 ? (
          <p className="k-body-2">
            {running ? 'Running the autopilot…' : 'Pick seeds and dives, then Run.'}
          </p>
        ) : (
          <>
            <EconomyChart lines={economyLines(reports, show)} />
            <table className="w-full text-[14px] text-stone-200" data-testid="economy-table">
              <thead>
                <tr>
                  <th className={HEAD}>Dive</th>
                  <th className={HEAD}>Depth</th>
                  <th className={HEAD}>Deaths</th>
                  <th className={HEAD}>Forged (common to legendary)</th>
                  {MATERIAL_TOTALS.map((m) => (
                    <th key={m.id} className={HEAD}>
                      {m.label} in / spent / lost
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {depth.map((_, i) => (
                  <tr key={i} className="tabular-nums" data-testid="economy-row">
                    <td className="px-1">{i + 1}</td>
                    <td className="px-1">{formatAmount(depth[i])}</td>
                    <td className="px-1">{deaths[i]}</td>
                    <td className="px-1">{forged.map((f) => formatAmount(f[i])).join(' · ')}</td>
                    {materials.map(([inc, out, lost], j) => (
                      <td key={MATERIAL_TOTALS[j].id} className="px-1">
                        {formatAmount(inc[i])} / {formatAmount(out[i])} / {formatAmount(lost[i])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>
    </div>
  );
}

const W = 960;
const H = 260;
const LEFT = 56;
const RIGHT = 16;
const TOP = 12;
const BOTTOM = 28;

/**
 * The chosen lines over the dives, in plain SVG: y from 0 to a tidy top, the
 * dive numbers below, and a legend that reads out each line's value at the
 * dive under the pointer (the last dive until then).
 */
function EconomyChart({ lines }: { lines: readonly EconomyLine[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(0, ...lines.map((l) => l.values.length));
  const top = niceCeil(Math.max(0, ...lines.flatMap((l) => l.values)));
  const x = (i: number) => LEFT + (n > 1 ? i / (n - 1) : 0.5) * (W - LEFT - RIGHT);
  const y = (v: number) => TOP + (1 - v / top) * (H - TOP - BOTTOM);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || n === 0) return;
    const f = (((e.clientX - r.left) / r.width) * W - LEFT) / (W - LEFT - RIGHT);
    setHover(Math.min(n - 1, Math.max(0, Math.round(f * (n - 1)))));
  };
  const at = Math.min(hover ?? n - 1, n - 1);

  return (
    <div className="k-well mb-2 p-2" data-testid="economy-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Per dive"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(top * f)} y2={y(top * f)} stroke="#ffffff1a" />
            <text
              x={LEFT - 6}
              y={y(top * f)}
              dy="0.32em"
              textAnchor="end"
              fontSize={14}
              fill="#a8a29e"
            >
              {formatAmount(top * f)}
            </text>
          </g>
        ))}
        {Array.from({ length: n }, (_, i) =>
          n <= 20 || (i + 1) % 5 === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={14} fill="#a8a29e">
              {i + 1}
            </text>
          ) : null,
        )}
        {hover !== null && (
          <line
            x1={x(at)}
            x2={x(at)}
            y1={TOP}
            y2={H - BOTTOM}
            stroke="#e7e5e4"
            strokeOpacity={0.5}
          />
        )}
        {lines.map((l) => (
          <path
            key={l.key}
            d={l.values
              .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
              .join('')}
            fill="none"
            stroke={l.color}
            strokeWidth={2}
            strokeLinejoin="round"
            data-testid="economy-line"
          />
        ))}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[14px]" data-testid="economy-legend">
        <li className="text-stone-500">Dive {at + 1}</li>
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2">
            <span className="h-0.5 w-4 shrink-0" style={{ background: l.color }} />
            <b className="tabular-nums text-stone-100">{formatAmount(l.values[at] ?? 0)}</b>
            <span className="text-stone-400">{l.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the client**

Run: `(cd packages/client && npx vitest run src/features/delve/lab/__tests__/EconomyView.test.tsx)`
Expected: PASS, 3 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 10 tests in G + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c3
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/lab/economy-worker.ts src/features/delve/lab/EconomyView.tsx src/features/delve/lab/__tests__/EconomyView.test.tsx src/features/delve/lab/LabChart.tsx)
git add packages/client/src/features/delve/lab/economy-worker.ts packages/client/src/features/delve/lab/EconomyView.tsx packages/client/src/features/delve/lab/__tests__/EconomyView.test.tsx packages/client/src/features/delve/lab/LabChart.tsx
git commit -m "feat(client): the Economy view: the economy sim in a worker, charted and tabled dive by dive" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: The DPS Lab's Economy tab

**Files:**
- Modify: `packages/client/src/pages/DelveLab.tsx` (hand-edited, never formatted)
- Modify (test): `packages/client/src/pages/__tests__/DelveLab.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/pages/__tests__/DelveLab.test.tsx`:

Replace:

```tsx
  it('moving focus off the slider commits the depth too (a controller only nudges it)', () => {
```

with:

```tsx
  it('the Economy tab shows the Economy view in place of the grid; its Run starts its own worker', () => {
    renderLab();
    const grid = latest();
    expect(screen.getByTestId('economy-view')).not.toBeVisible();
    fireEvent.click(screen.getByTestId('lab-tab-economy'));
    expect(screen.getByTestId('economy-view')).toBeVisible();
    expect(screen.getByTestId('lab-results')).not.toBeVisible();
    expect(screen.getByTestId('delve-lab').querySelector('header')).toHaveTextContent(
      'The autopilot, dive by dive',
    );
    fireEvent.click(screen.getByTestId('economy-run'));
    expect(FakeWorker.all).toHaveLength(2);
    expect(latest().requests).toEqual([{ seeds: [1, 2, 3], dives: 12 }]);
    expect(grid.terminated).toBe(false);
    // Back to a DPS view: the economy run is kept, hidden.
    fireEvent.click(screen.getByTestId('lab-tab-basic'));
    expect(screen.getByTestId('lab-results')).toBeVisible();
    expect(screen.getByTestId('economy-progress')).not.toBeVisible();
  });

  it('moving focus off the slider commits the depth too (a controller only nudges it)', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveLab.test.tsx)`
Expected: FAIL, 1 failed | 9 passed: `Unable to find an element by: [data-testid="economy-view"]`.

- [ ] **Step 3: The tab**

In `packages/client/src/pages/DelveLab.tsx`:

Replace:

```tsx
import { LabTable } from '@/features/delve/lab/LabTable';
```

with:

```tsx
import { LabTable } from '@/features/delve/lab/LabTable';
import { EconomyView } from '@/features/delve/lab/EconomyView';
```

Replace:

```tsx
type View = DpsSetup['view'];
```

with:

```tsx
/** The DPS views, and the Economy view (see the crafting spec). */
type View = DpsSetup['view'] | 'economy';
```

Replace:

```tsx
  ['rune', 'Runes'],
];
```

with:

```tsx
  ['rune', 'Runes'],
  ['economy', 'Economy'],
];
```

Replace:

```tsx
 * to its baseline ("× none"). See the DPS Lab and runes specs.
```

with:

```tsx
 * to its baseline ("× none"). See the DPS Lab and runes specs. The Economy view
 * runs the economy sim instead (see the crafting spec); both stay mounted, the
 * one not shown `hidden`, so neither loses its run.
```

Replace:

```tsx
            subtitle="30 s on the dummies"
```

with:

```tsx
            subtitle={view === 'economy' ? 'The autopilot, dive by dive' : '30 s on the dummies'}
```

Replace:

```tsx
        <div className="flex h-full min-h-0 flex-col gap-4 px-8 py-5">
```

with:

```tsx
        <EconomyView hidden={view !== 'economy'} />
        <div className="flex h-full min-h-0 flex-col gap-4 px-8 py-5" hidden={view === 'economy'}>
```

- [ ] **Step 4: Run it to see it pass, then the client and its build**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveLab.test.tsx)`
Expected: PASS, 10 tests.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; M + 11 tests in G + 2 files pass.

Run: `(pnpm -F @alloy/client build)`
Expected: `tsc -b` silent, then Vite's `✓ built in …`; the Lab, its views and both workers stay out of the production chunks (`DEV_LAB` is null there).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-craft-c3
(cd packages/client && npx prettier --write --end-of-line auto src/pages/__tests__/DelveLab.test.tsx)
git add packages/client/src/pages/DelveLab.tsx packages/client/src/pages/__tests__/DelveLab.test.tsx
git commit -m "feat(client): the DPS Lab's Economy tab" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

After Task 5, from the worktree root:

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
(pnpm -F @alloy/client build)
```

Expected: no type errors; **M + 11 tests in G + 2 files** pass; the build succeeds.

**Once B2 and B3 have merged** (the integrator, or Phase D), against real data on a dev server:
1. The Anvil → Codex: Patterns reads 3/13 on a new save (sword, cuirass, dagger); salvaging a bag item of a new base teaches it (4/13); Essences fills as essences are picked up.
2. The Loadout: hover a magic or better bag item: the Salvage button's price and the line under it match a `salvageYield` call on the same item (one of its lines' shards, the second's chance, the pattern when new, a legendary's essence); salvage it and the stockpile gains them.
3. `/delve/lab` → Economy → Run with the defaults: three reports arrive (the progress bar fills), twelve rows, no `Economy worker` error in the console; each chart choice draws its lines (a material's "lost" line rises on the dives that died), and the pacing targets the spec names (a magic item after dive 1, a first epic by about dive 5, the first boss's legendary) show in Items forged.

No E2E is added: the spec's E2E list (materials at the stop, forging at the Anvil, death loss) is C1's, C2's and D's; the Codex and the compare pane are covered by the unit tests above.
