# Delve boons — Phase C2: the HUD and summaries

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The worn boons show on the HUD as one tile per distinct boon (shrines too), with their count and a tooltip of their tiers' lines; the pause's state block and `DiveSummary` list the dive's boons; Help says what a stop offers. Spec §6 "The HUD", "The pause", "DiveSummary", "Help"; §7 "Client".

**Base:** Phase A merged (`boons/main`). Worktree: `git worktree add ../alloy-boons-c2 -b boons/c2 boons/main`.

**Owns:** `features/delve/boons-text.ts` (new), `arena/hud/BuffRow.tsx`, `arena/useArenaCore.ts`'s `HudBuff` and `blessings`, `hub/PauseScreen.tsx`'s `PauseState`, `DiveSummary.tsx`, `hub/help/help-topics.tsx`'s banking topic, and their tests (`arena/hud/__tests__/BuffRow.test.tsx` (new), `arena/hud/__tests__/SkillDock.test.tsx`'s shrine test, `__tests__/arena-hud-snapshot.test.ts`'s blessings test, `hub/__tests__/PauseScreen.test.tsx`, `__tests__/DiveSummary.test.tsx`, `hub/help/__tests__/help-topics.test.tsx`, `__tests__/boons-text.test.ts` (new)); the E2E edit to `e2e/delve-type.spec.ts` TY02 (written here, run in Phase D).

**Not here:** the stop screen and `stop/boon-style.ts` (C1), hit-stop, sounds and fx (C3), the version bump (D).

All paths below are under `packages/client/src/features/delve/` unless they start with `packages/` or `e2e/`.

## What A leaves (assumed, from the overview's contract)

- `@alloy/engine` exports `Buff` (`{ boon, tier, effect }`), `BoonFamily`, `BoonId`, `BoonDef` (from `types/boon.ts`, re-exported through the package index as every type is).
- `registry.getBoons()` returns every row; the six shrine rows exist (`vigor`, `renewal`, `clarity`, `fortune`, `mercy`, `devotion`, their names as today, "Shrine of Vigor"…, each tier's `text` set). This plan reads rows through `getBoons().find(...)`, so it doesn't depend on whether `getBoon` throws on an unknown id.
- `HeroEntity.diveBuffs` / `floorBuffs` and `DiveState.diveBuffs` are `Buff[]`.
- A migrated `useArenaCore.ts`'s `blessings` and `HudBuff` minimally (likely still `{ id: 'shrine'; shrine; name; dive }`, the name from `getBoons()`), and whatever tests it had to touch to compile. Task 2 replaces both wholesale; if A's version differs, replace it all the same.
- Before every client check: `cd packages/engine && npx tsup` once (the client reads the bundle).

## Glyph per family

Existing `GlyphId`s only (`kit/types.ts`), no new art:

| Family | Glyph | Why |
|---|---|---|
| offense | `attack` | the attack slot's |
| element | `rune-elemental` | the elemental rune family's |
| defense | `barrier` | Obsidian's (a timed Barrier tile shows its seconds, so the two read apart) |
| tempo | `rune-tempo` | not `quick`, which is a timed buff tile beside it |
| fortune | `chest` | loot |
| pact | `skull` | a price paid |
| floor | `door` | the floor's |

A shrine row draws its family's glyph like any boon (the spec: "a shrine is one too"); its name ("Shrine of Vigor") says what it is.

---

### Task 1: `wornBoons` and `boonsLine`

One pure helper the HUD, the pause and the summary share: a dive's or floor's entries grouped by boon, in first-taken order.

**Files:**
- Create: `packages/client/src/features/delve/boons-text.ts`
- Test: `packages/client/src/features/delve/__tests__/boons-text.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { Buff } from '@alloy/engine';
import { boonsLine, wornBoons } from '../boons-text';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const row = (id: string) => registry.getBoons().find((b) => b.id === id)!;
const entry = (boon: string, tier: 1 | 2 | 3 = 1): Buff => ({ boon, tier, effect: {} });

describe('wornBoons', () => {
  it('groups entries by boon in first-taken order, counting them and listing each tier line', () => {
    const worn = wornBoons(registry, [entry('devotion'), entry('vigor'), entry('devotion', 2)]);
    expect(worn).toEqual([
      {
        boon: 'devotion',
        name: row('devotion').name,
        family: row('devotion').family,
        count: 2,
        lines: [row('devotion').tiers[0].text, row('devotion').tiers[1].text],
      },
      {
        boon: 'vigor',
        name: row('vigor').name,
        family: row('vigor').family,
        count: 1,
        lines: [row('vigor').tiers[0].text],
      },
    ]);
  });

  it('passes over an id the data no longer has, and is empty for none', () => {
    expect(wornBoons(registry, [entry('no-such-boon')])).toEqual([]);
    expect(wornBoons(registry, [])).toEqual([]);
  });
});

describe('boonsLine', () => {
  it('names each boon, its count when above 1, joined by dots', () => {
    const worn = wornBoons(registry, [entry('devotion'), entry('vigor'), entry('devotion')]);
    expect(boonsLine(worn)).toBe(`${row('devotion').name} ×2 · ${row('vigor').name}`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/boons-text.test.ts --reporter=dot`
Expected: FAIL (cannot resolve `../boons-text`).

- [ ] **Step 3: Implement**

`packages/client/src/features/delve/boons-text.ts`:

```ts
import type { BoonFamily, BoonId, Buff, DataRegistry } from '@alloy/engine';

/** One boon worn: its entries counted, and each entry's tier line in the order taken. */
export interface WornBoon {
  boon: BoonId;
  name: string;
  family: BoonFamily;
  count: number;
  lines: string[];
}

/** A list of boon entries (a dive's or a floor's) grouped by boon, first taken first; unknown ids passed over. */
export function wornBoons(registry: DataRegistry, buffs: readonly Buff[]): WornBoon[] {
  const rows = registry.getBoons();
  const out = new Map<BoonId, WornBoon>();
  for (const b of buffs) {
    const def = rows.find((r) => r.id === b.boon);
    if (!def) continue;
    const line = def.tiers[b.tier - 1].text;
    const seen = out.get(b.boon);
    if (seen) {
      seen.count += 1;
      seen.lines.push(line);
    } else out.set(b.boon, { boon: b.boon, name: def.name, family: def.family, count: 1, lines: [line] });
  }
  return [...out.values()];
}

/** "Keen Edge ×2 · Shrine of Vigor": the pause's and the summary's line. */
export const boonsLine = (worn: readonly WornBoon[]): string =>
  worn.map((w) => (w.count > 1 ? `${w.name} ×${w.count}` : w.name)).join(' · ');
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/boons-text.test.ts --reporter=dot`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/boons-text.ts packages/client/src/features/delve/__tests__/boons-text.test.ts
git commit -m "feat(client): wornBoons groups a dive's boon entries for the HUD and summaries"
```

---

### Task 2: the snapshot carries boons

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (`HudBuff`, `blessings`)
- Test: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts` (the "lists the shrines' blessings" test)

- [ ] **Step 1: Rewrite the test**

Replace the test `"lists the shrines' blessings after them, the dive's then the floor's, by their shrine's name"` with:

```ts
  it("lists the worn boons after them, one per boon, the dive's then the floor's, with count and lines", () => {
    const w = sandbox();
    const row = (id: string) => registry.getBoons().find((b) => b.id === id)!;
    w.hero.diveBuffs = [
      { boon: 'devotion', tier: 1, effect: { damage: 0.1 } },
      { boon: 'devotion', tier: 1, effect: { damage: 0.1 } },
    ];
    w.hero.floorBuffs = [{ boon: 'vigor', tier: 1, effect: { damage: 0.2 } }];
    expect(snapshot(w, null).buffs).toEqual([
      {
        id: 'boon',
        boon: 'devotion',
        name: row('devotion').name,
        family: row('devotion').family,
        count: 2,
        dive: true,
        lines: [row('devotion').tiers[0].text, row('devotion').tiers[0].text],
      },
      {
        id: 'boon',
        boon: 'vigor',
        name: row('vigor').name,
        family: row('vigor').family,
        count: 1,
        dive: false,
        lines: [row('vigor').tiers[0].text],
      },
    ]);
  });
```

(`registry` is the file's existing `getDelveRegistry()`; if the file names it otherwise, use that.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts --reporter=dot`
Expected: FAIL (the snapshot still yields `id: 'shrine'` entries, one per entry).

- [ ] **Step 3: Implement**

In `arena/useArenaCore.ts`, replace the shrine member of `HudBuff`:

```ts
  /** A worn boon (a shrine's blessing is one too): one per boon, its entries counted, for this floor or the dive. */
  | {
      id: 'boon';
      boon: BoonId;
      name: string;
      family: BoonFamily;
      /** Its entries worn (stacks), 1 or more. */
      count: number;
      /** For the rest of the dive (gold), or this floor (cyan). */
      dive: boolean;
      /** Each entry's tier line, in the order taken: the tooltip's. */
      lines: string[];
    };
```

Add `type BoonFamily, type BoonId` to the file's `@alloy/engine` type import, and `import { wornBoons } from '../boons-text';`. Replace `blessings` (whatever A left) with:

```ts
/** The boons on the hero, one per boon, the dive's then the floor's. */
function blessings(h: ArpgWorld['hero']): HudBuff[] {
  const registry = getDelveRegistry();
  return [h.diveBuffs, h.floorBuffs].flatMap((list, i) =>
    wornBoons(registry, list).map((w) => ({ id: 'boon' as const, ...w, dive: i === 0 })),
  );
}
```

The `buffs: [...timed, ...blessings(h)]` call in `snapshot` is unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts --reporter=dot`
Expected: tsc FAILS in `arena/hud/BuffRow.tsx` (`'shrine'` no longer a `HudBuff['id']`) and `SkillDock.test.tsx`; the snapshot tests PASS. Task 3 fixes the compile; commit both together at Task 3's end (don't commit a red tsc).

---

### Task 3: the boon tile

**Files:**
- Modify: `packages/client/src/features/delve/arena/hud/BuffRow.tsx`
- Create: `packages/client/src/features/delve/arena/hud/__tests__/BuffRow.test.tsx`
- Modify: `packages/client/src/features/delve/arena/hud/__tests__/SkillDock.test.tsx` (its shrine test)

- [ ] **Step 1: Write the failing tests**

`arena/hud/__tests__/BuffRow.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BuffRow, type HudBuff } from '../BuffRow';

const boon = (over: Partial<Extract<HudBuff, { id: 'boon' }>> = {}): HudBuff => ({
  id: 'boon',
  boon: 'keen_edge',
  name: 'Keen Edge',
  family: 'offense',
  count: 1,
  dive: true,
  lines: ['+10% damage'],
  ...over,
});

describe('BuffRow', () => {
  it('draws a boon as a tile: its family glyph, gold for the dive, cyan for the floor, no countdown', () => {
    render(
      <BuffRow
        buffs={[
          boon(),
          boon({ boon: 'vigor', name: 'Shrine of Vigor', family: 'offense', dive: false }),
        ]}
      />,
    );
    const dive = screen.getByRole('img', { name: 'Keen Edge, this dive' });
    const floor = screen.getByRole('img', { name: 'Shrine of Vigor, this floor' });
    expect(dive).toHaveAttribute('data-buff', 'boon');
    expect(dive.querySelector('[data-glyph="attack"]')).not.toBeNull();
    expect(dive).toHaveStyle({ borderColor: '#feae34' });
    expect(floor).toHaveStyle({ borderColor: '#2ce8f5' });
    expect(floor).not.toHaveTextContent(/\ds/);
  });

  it('a shrine is a boon tile like any other', () => {
    render(
      <BuffRow
        buffs={[boon({ boon: 'renewal', name: 'Shrine of Renewal', family: 'defense', dive: false })]}
      />,
    );
    const tile = screen.getByRole('img', { name: 'Shrine of Renewal, this floor' });
    expect(tile).toHaveAttribute('data-boon', 'renewal');
    expect(tile.querySelector('[data-glyph="barrier"]')).not.toBeNull();
  });

  it('shows the count in the corner only above 1, at 16 design px', () => {
    render(<BuffRow buffs={[boon({ count: 3, lines: ['a', 'b', 'c'] }), boon({ boon: 'x', name: 'X' })]} />);
    const stacked = screen.getByRole('img', { name: 'Keen Edge ×3, this dive' });
    const count = stacked.querySelector('[data-count]')!;
    expect(count).toHaveTextContent('3');
    expect(count).toHaveClass('text-[16px]');
    expect(screen.getByRole('img', { name: 'X, this dive' }).querySelector('[data-count]')).toBeNull();
  });

  it("lists the taken tiers' lines in a tooltip on hover and on focus", () => {
    render(<BuffRow buffs={[boon({ count: 2, lines: ['+10% damage', '+20% damage'] })]} />);
    const tile = screen.getByRole('img', { name: 'Keen Edge ×2, this dive' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(tile);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Keen Edge');
    expect(tip).toHaveTextContent('This dive');
    expect(within(tip).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '+10% damage',
      '+20% damage',
    ]);
    fireEvent.mouseLeave(tile);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(tile);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('leaves the timed buffs as they were', () => {
    render(<BuffRow buffs={[{ id: 'riposte', left: 1.2, total: 2 }]} />);
    const tile = screen.getByRole('img', { name: 'Riposte, 2s left' });
    expect(tile).toHaveTextContent('2s');
    expect(tile.querySelector('[data-glyph="riposte"]')).not.toBeNull();
  });

  it("a floor-long barrier (Stone Skin's, left Infinity) shows no countdown", () => {
    render(<BuffRow buffs={[{ id: 'barrier', left: Infinity, total: null }]} />);
    const tile = screen.getByRole('img', { name: 'Barrier, this floor' });
    expect(tile).not.toHaveTextContent(/\ds|Infinity/);
  });
});
```

In `SkillDock.test.tsx`, replace the test `"shows a shrine's blessing as a tile with no countdown: for the floor or the dive"` with (the dock still places the row; BuffRow's own tests hold the tile):

```tsx
  it("puts the worn boons' tiles in the row", () => {
    render(
      dock({
        buffs: [
          {
            id: 'boon',
            boon: 'devotion',
            name: 'Shrine of Devotion',
            family: 'offense',
            count: 1,
            dive: true,
            lines: ['+10% damage this dive'],
          },
        ],
      }),
    );
    expect(screen.getByRole('img', { name: 'Shrine of Devotion, this dive' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/BuffRow.test.tsx src/features/delve/arena/hud/__tests__/SkillDock.test.tsx --reporter=dot`
Expected: FAIL (BuffRow still branches on `'shrine'`; a boon reaches `BUFF[b.id]` and throws).

- [ ] **Step 3: Implement**

Replace `arena/hud/BuffRow.tsx`:

```tsx
import type { BoonFamily } from '@alloy/engine';
import { Glyph, Tooltip, TooltipCard, type GlyphId } from '@/features/delve/kit';

import type { HudBuff } from '../useArenaCore';

export type { HudBuff };

type BoonBuff = Extract<HudBuff, { id: 'boon' }>;

const BUFF: Record<Exclude<HudBuff['id'], 'boon'>, { name: string; color: string }> = {
  riposte: { name: 'Riposte', color: '#fee761' },
  quick: { name: 'Quick', color: '#feae34' },
  barrier: { name: 'Barrier', color: '#ead4aa' },
};

/** A boon's border: for the floor, or the rest of the dive. */
const BLESSING = { floor: '#2ce8f5', dive: '#feae34' };

/** Each family's glyph on its tile (existing art; `quick` is left to the timed buff). */
const FAMILY_GLYPH: Record<BoonFamily, GlyphId> = {
  offense: 'attack',
  element: 'rune-elemental',
  defense: 'barrier',
  tempo: 'rune-tempo',
  fortune: 'chest',
  pact: 'skull',
  floor: 'door',
};

/** The dock's buff tiles: 38 px each, its glyph and its seconds left (a boon has none: its count instead). */
export function BuffRow({ buffs }: { buffs: readonly HudBuff[] }) {
  if (buffs.length === 0) return null;
  return (
    <div className="ml-3 flex gap-[6px]">
      {buffs.map((b) => {
        if (b.id === 'boon') return <BoonTile key={`boon-${b.dive ? 'dive' : 'floor'}-${b.boon}`} b={b} />;
        const { name, color } = BUFF[b.id];
        // Stone Skin's barrier lasts the floor: no countdown.
        const timed = Number.isFinite(b.left);
        const secs = Math.ceil(b.left);
        return (
          <span
            key={b.id}
            role="img"
            aria-label={timed ? `${name}, ${secs}s left` : `${name}, this floor`}
            data-buff={b.id}
            className="flex h-[38px] w-[38px] flex-col items-center justify-end bg-[var(--k-well)] pb-px"
            style={{ border: `2px solid ${color}`, color }}
          >
            <Glyph id={b.id} size={16} />
            {timed && <span className="k-disp text-[16px]">{secs}s</span>}
          </span>
        );
      })}
    </div>
  );
}

/** One worn boon: its family glyph, its count when stacked, and its tiers' lines on hover or focus. */
function BoonTile({ b }: { b: BoonBuff }) {
  const label = `${b.name}${b.count > 1 ? ` ×${b.count}` : ''}, ${b.dive ? 'this dive' : 'this floor'}`;
  return (
    <Tooltip
      placement="top"
      portal={false}
      content={() => (
        <TooltipCard title={b.name} subtitle={b.dive ? 'This dive' : 'This floor'} material="glass" width={340}>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {b.lines.map((line, i) => (
              <li key={i} className="k-body-2">
                {line}
              </li>
            ))}
          </ul>
        </TooltipCard>
      )}
    >
      <span
        role="img"
        tabIndex={0}
        aria-label={label}
        data-buff="boon"
        data-boon={b.boon}
        className="pointer-events-auto relative flex h-[38px] w-[38px] items-center justify-center bg-[var(--k-well)]"
        style={{ border: `2px solid ${b.dive ? BLESSING.dive : BLESSING.floor}` }}
      >
        <Glyph id={FAMILY_GLYPH[b.family]} size={20} />
        {b.count > 1 && (
          <span
            data-count
            className="k-disp absolute bottom-0 right-[2px] text-[16px] leading-none text-[var(--k-text)]"
          >
            {b.count}
          </span>
        )}
      </span>
    </Tooltip>
  );
}
```

(If the kit's `index.ts` doesn't export `GlyphId`, import it from `@/features/delve/kit/types`.)

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/arena/hud/__tests__/BuffRow.test.tsx src/features/delve/arena/hud/__tests__/SkillDock.test.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts --reporter=dot`
Expected: tsc clean; PASS. If tsc still names a `'shrine'` `HudBuff` elsewhere (grep `id: 'shrine'` under `src/features/delve/arena` and `src/features/delve/__tests__`; the `'shrine'` interactable and prop ids are unrelated and stay), move it to the boon shape.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/hud/BuffRow.tsx packages/client/src/features/delve/arena/hud/__tests__/BuffRow.test.tsx packages/client/src/features/delve/arena/hud/__tests__/SkillDock.test.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts
git commit -m "feat(client): the HUD's boon tiles: one per boon, its count and its tiers' lines"
```

---

### Task 4: the pause lists the dive's boons

**Files:**
- Modify: `packages/client/src/features/delve/hub/PauseScreen.tsx` (`PauseState`)
- Test: `packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the `describe` (beside "beside the list, the dive as it stands…"):

```tsx
  it("the state lists the dive's boons by name and count, and nothing when none", () => {
    renderPause();
    expect(screen.queryByTestId('dive-boons')).toBeNull();
    cleanup();
    const dive = store().profile.dive!;
    const row = (id: string) => registry.getBoons().find((b) => b.id === id)!;
    store().setProfile({
      ...store().profile,
      dive: {
        ...dive,
        diveBuffs: [
          { boon: 'devotion', tier: 1, effect: {} },
          { boon: 'vigor', tier: 1, effect: {} },
          { boon: 'devotion', tier: 1, effect: {} },
        ],
      },
    });
    renderPause();
    expect(within(screen.getByTestId('pause-state')).getByTestId('dive-boons')).toHaveTextContent(
      `Boons: ${row('devotion').name} ×2 · ${row('vigor').name}`,
    );
  });
```

Add `cleanup` to the file's `@testing-library/react` import.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/hub/__tests__/PauseScreen.test.tsx --reporter=dot`
Expected: FAIL (no `dive-boons`).

- [ ] **Step 3: Implement**

In `hub/PauseScreen.tsx`, `import { boonsLine, wornBoons } from '../boons-text';`. In `PauseState`, after `const goal = …`:

```tsx
  const boons = wornBoons(registry, dive.diveBuffs);
```

and after the death-loss `<span>`, before the quest:

```tsx
      {boons.length > 0 && <span data-testid="dive-boons">Boons: {boonsLine(boons)}</span>}
```

Update `PauseState`'s doc comment: "…the death-loss line, the dive's boons, and the first tracked quest's next objective."

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/__tests__/PauseScreen.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/PauseScreen.tsx packages/client/src/features/delve/hub/__tests__/PauseScreen.test.tsx
git commit -m "feat(client): the pause lists the dive's boons"
```

---

### Task 5: `DiveSummary` lists the dive's boons

`settleDive` leaves `dive.diveBuffs` (spec §4 "Settle"), so the summary reads them.

**Files:**
- Modify: `packages/client/src/features/delve/DiveSummary.tsx`
- Test: `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside `describe('DiveSummary', …)`:

```tsx
  it("lists the boons the dive wore by name and count, and nothing when it wore none", () => {
    summary();
    expect(screen.queryByTestId('dive-boons')).toBeNull();
    cleanup();
    const row = (id: string) => getDelveRegistry().getBoons().find((b) => b.id === id)!;
    summary({
      phase: 'dead',
      diveBuffs: [
        { boon: 'vigor', tier: 1, effect: {} },
        { boon: 'vigor', tier: 2, effect: {} },
      ],
    });
    expect(screen.getByTestId('dive-boons')).toHaveTextContent(`Boons: ${row('vigor').name} ×2`);
  });
```

Add `cleanup` to the file's `@testing-library/react` import.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/DiveSummary.test.tsx --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `DiveSummary.tsx`, `import { boonsLine, wornBoons } from './boons-text';`; after `const lost = …`:

```tsx
  const boons = wornBoons(registry, dive.diveBuffs);
```

and after the bounty block's closing `</div>` (before the Brought home / Lost row):

```tsx
      {boons.length > 0 && (
        <p className="k-body-2 m-0 max-w-[560px] text-center" data-testid="dive-boons">
          Boons: {boonsLine(boons)}
        </p>
      )}
```

Extend the component's doc comment: "…the bounty claimed or lost, the boons it wore, what it brought home…".

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/DiveSummary.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/DiveSummary.tsx packages/client/src/features/delve/__tests__/DiveSummary.test.tsx
git commit -m "feat(client): the dive summary lists the boons the dive wore"
```

---

### Task 6: Help names the boons

Help has no topic called "dive"; the stops between depths are the **banking** topic's ("Between depths, push deeper or extract…"), so the line goes there.

**Files:**
- Modify: `packages/client/src/features/delve/hub/help/help-topics.tsx` (the `banking` paragraph)
- Test: `packages/client/src/features/delve/hub/help/__tests__/help-topics.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside `describe('HelpPage', …)`:

```tsx
  it('says what a stop offers', () => {
    render(<HelpPage topic="banking" />);
    expect(screen.getByTestId('delve-howto')).toHaveTextContent(
      'Each stop offers three boons. Take one: it lasts the dive, and some stack.',
    );
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/hub/help/__tests__/help-topics.test.tsx --reporter=dot`
Expected: FAIL.

- [ ] **Step 3: Implement**

In the `banking` paragraph, after "…the gear and patterns you pick up are always yours.", add (inside the same `<p>`):

```tsx
          {' '}Each stop offers three boons. Take one: it lasts the dive, and some stack.
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/help/__tests__/help-topics.test.tsx src/features/delve/hub/help/__tests__/HelpDialog.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/help/help-topics.tsx packages/client/src/features/delve/hub/help/__tests__/help-topics.test.tsx
git commit -m "feat(client): Help says what a stop offers"
```

---

### Task 7: TY02 holds the tile's count at the type floor (written here, **run in Phase D**)

The bot's first dive takes no boon before the HUD is measured, so TY02 resumes a seeded dive already wearing two entries of one boon. `devotion` is used: a dive row in A's data (the HUD groups entries without reading `cap`, so two entries of a cap-1 row are fine for a measurement).

**Files:**
- Modify: `packages/client/e2e/delve-type.spec.ts`

- [ ] **Step 1: Write the edit**

Imports at the top:

```ts
import { createDefaultRegistry, createDelveProfile, startDive as beginDive } from '@alloy/engine';
import { ARENA_READY, armed, seedProfile, startDive, stepTo } from './fixtures/delve';
```

Replace TY02's first line (`await seedProfile(page); // the bot clears depth 1`) with:

```ts
    // A dive in progress wearing two Devotion entries: the HUD's boon tile shows its count.
    const registry = createDefaultRegistry();
    const fresh = armed(registry, createDelveProfile(registry, 4242, { primary: 'fire' }));
    const { dive } = beginDive(registry, fresh, 1);
    const devotion = { boon: 'devotion', tier: 1 as const, effect: registry.getBoons().find((b) => b.id === 'devotion')!.tiers[0].effect };
    await seedProfile(page, 4242, true, undefined, { dive: { ...dive!, diveBuffs: [devotion, devotion] } }); // the bot clears depth 1
```

and after `await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });`:

```ts
    await expect(page.locator('[data-buff="boon"][data-boon="devotion"] [data-count]')).toHaveText('2');
```

The existing `measure(page, 'hud')` then holds the count's 16 design px.

- [ ] **Step 2: Typecheck only**

Run: `cd packages/client && npx tsc --noEmit -p .` (and `npx tsc --noEmit -p e2e` if the E2E has its own tsconfig)
Expected: clean. **Do not run Playwright here**; Phase D runs `npx playwright test e2e/delve-type.spec.ts --project=desktop-1080`, expected PASS. If the Depart sheet doesn't resume a seeded `fighting` dive, D seeds the dive the way `delve-gamepad.spec.ts` or the resume specs do.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/delve-type.spec.ts
git commit -m "test(e2e): TY02 measures the boon tile's count (run in Phase D)"
```

---

### Task 8 (**after B2 merges**): the dodge readout counts the boons

B2 adds `dodgeMax(bal, boon)` and `dodgeRecharge(bal, boon)` (`arpg/dodge.ts`, exported from the engine index), since Third Wind and No Retreat change the charge count and Quickstep the recharge. The HUD snapshot still reads `bal.dodge`. Skip this task until B2 is on the branch (`grep -n "dodgeMax" packages/engine/src/index.ts` finds it), and rebuild the bundle first (`cd packages/engine && npx tsup`).

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (`snapshot`: `dodgeMax`, `dodgeRefill`, at today's lines 397–400)
- Test: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Add `buffSum` to the file's `@alloy/engine` import (A's, `delve/boons.ts`), then add beside the buffs tests:

```ts
  it("counts the worn boons in the dodge's charges and refill: Third Wind's third charge", () => {
    const w = sandbox();
    const bal = registry.getDelveBalance();
    // Third Wind's extra charge, plus a recharge bonus (Quickstep's field) to check the refill. Effects alone: no B1 row needed.
    w.hero.diveBuffs = [{ boon: 'third-wind', tier: 1, effect: { dodgeCharges: 1, dodgeRecharge: 0.5 } }];
    w.hero.boon = buffSum(w.hero.diveBuffs);
    w.hero.dodgeCharges = 2;
    w.hero.dodgeRechargeAt = w.t + bal.dodge.recharge * 0.25; // a quarter of the eased recharge left
    const hud = snapshot(w, null);
    expect(hud.dodgeMax).toBe(bal.dodge.charges + 1);
    expect(hud.dodgeMax).toBe(3);
    expect(hud.dodgeRefill).toBeCloseTo(0.5); // (recharge × 0.25) ÷ (recharge × 0.5) left
  });
```

(If the shipped `dodge.charges` isn't 2, drop the literal `toBe(3)`; the first expectation holds the rule.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts --reporter=dot`
Expected: FAIL (`dodgeMax` 2, `dodgeRefill` 0.75).

- [ ] **Step 3: Implement**

Add `dodgeMax, dodgeRecharge` to `useArenaCore.ts`'s `@alloy/engine` value import. In `snapshot`, replace

```ts
    dodgeMax: dodgeBal.charges,
    dodgeRefill:
      h.dodgeRechargeAt > 0 ? Math.max(0, 1 - (h.dodgeRechargeAt - t) / dodgeBal.recharge) : 1,
```

with

```ts
    dodgeMax: dodgeMax(bal, h.boon),
    dodgeRefill:
      h.dodgeRechargeAt > 0 ? Math.max(0, 1 - (h.dodgeRechargeAt - t) / dodgeRecharge(bal, h.boon)) : 1,
```

If `dodgeBal` (`const dodgeBal = bal.dodge;`, today's line 335) has no other reader left, delete it (`npx tsc` with `noUnusedLocals` will say).

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/arena/hud/__tests__/SkillDock.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts
git commit -m "feat(client): the HUD's dodge charges and refill count the worn boons"
```

---

### Task 9: area close

- [ ] Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve --reporter=dot`
Expected: PASS. Any failure naming `'shrine'` as a `HudBuff` id is a leftover from Task 3's grep.

## Needs routed

- **C1:** C1's `stop/boon-style.ts` exports `BOON_STYLE` (family colour and label). The tile's border is gold/cyan by duration, so C2 needs no family colour; if one is wanted later (the tooltip's accent), `import { BOON_STYLE } from '../../stop/boon-style'` once C1 merges, never a second map. If `boon-style.ts` grows a family → glyph map, BuffRow's `FAMILY_GLYPH` moves there. C1's BoonCard could reuse `wornBoons(...).count` for "Taken n of cap".
- **Integrator / B2:** Task 8 runs once B2 is merged (it needs `dodgeMax` / `dodgeRecharge` from the engine index); if C2 merges first, the integrator runs Task 8 after B2.
- **D:** the version bump; run TY02 (Task 7); CLAUDE.md's HUD line: "the `BuffRow`'s boon tiles (one per boon worn, shrines too; `wornBoons` in `boons-text.ts`), the pause and `DiveSummary` listing the dive's boons (`dive-boons`)".
- **A:** if `Buff`, `BoonFamily` or `BoonId` aren't exported from `@alloy/engine`'s index, export them.
