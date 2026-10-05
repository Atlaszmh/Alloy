# The Forge bench in rows, and its Power range Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Forge bench is rows, not chip fields: Flux, Metal and Element (and, with epic flux, Essence) are steppers over what the save holds, each with one line saying where what it lacks drops; each Line is a row that opens the shard picker; Forge closes the column. Beside it, a preview pane with no stops shows the item the forge would make, and its Power against what is worn as a range. The bench remembers its pattern.

**Architecture:** one engine helper, `forgePowerRange(registry, profile, req)`, builds the preview's item at the bottom and at the top of its bands (the chosen lines, the implicits, a legendary's power, the attunement floor applied; random lines left out) and values each against what is worn with `compareItem`, as the bag values a tile. The client could not compose it without building a `GearItem` (game logic), so the engine does. `ForgeBench` keeps its request state and renders three columns: `PatternList`, the rows (kit `Stepper`s from plan 04), and the preview (`forge-preview`, `[data-pad-scroll]`). `ForgeTab` holds the chosen pattern in the hub's memory.

**Tech Stack:** TypeScript (engine), React 19, Zustand, Vitest, Playwright.

Read `00-overview.md` first. Plans 01 to 04 are done (the `Stepper`, `PAD_STEP`, `DROPS_FROM`, the free third column). Spec: section 4, "Forge", with the overview's edits 10 and 11.

**The guided start, checked against `tutorial.json`:** `l1-forge`'s trail is `["forge.pattern:cuirass", "forge.bar:rusty", "forge.flux:uncommon", "forge.shard", "forge.go"]`. The bar and the flux were one option each of a segmented field (`forge.bar:<metal>`, `forge.flux:<grade>`, done by `aria-checked`); a stepper is one control whatever its value, so it can't carry the key of the value the step wants. The trail becomes `["forge.pattern:cuirass", "forge.bar", "forge.flux", "forge.shard", "forge.go"]` (both unkeyed names are already in `TUTORIAL_TARGETS`: the old fields' wrappers carried them), and each stepper says it is done from the bench's state:

| Target | Done when (`data-tutorial-done`) | Why |
|---|---|---|
| `forge.bar` (the Metal stepper) | a held bar is chosen (`metals[metal] > 0`) | as before: the bench's own first pick is a held bar (a new save's Rusty), so the walk passes on, as TU01 says today ("The Rusty bar is the bench's own first pick, done already") |
| `forge.flux` (the Flux stepper) | a flux is chosen (`flux !== null`) | the bench starts at None; one step right on a new save is its uncommon kit flux, the step's rarity. A guided save holding magic flux too could step past it: the step's trigger (`forge` with `rarity: uncommon`) still wants uncommon, and the marker stays on Forge's refusal-free path only while the player picks it. Accepted: the lesson's line names "uncommon flux" |
| `forge.pattern:<base>` | the row's `aria-pressed` | unchanged |
| `forge.shard`, `forge.go` | unchanged (`linesDone`; Forge's own state) | unchanged |

`TUTORIAL_KEYED_TARGETS` keeps `forge.bar` and `forge.flux`'s keys (the data may still key them; the schema tests list them): no data does now. `tutorial-targets.test.tsx` checks every trail entry is placed in the source: `'forge.bar'` and `'forge.flux'` are, as the steppers' `tutorial` props.

---

### Task 1: the engine's `forgePowerRange`

**Files:**
- Modify: `packages/engine/src/delve/crafting.ts`
- Create: `packages/engine/tests/delve-forge-power.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import type { SeededRNG } from '../src/rng/seeded-rng.js';
import { forgeItem, previewForge } from '../src/loot/forge.js';
import { withMaterial } from '../src/loot/materials.js';
import { forgePowerRange } from '../src/delve/crafting.js';
import { compareItem } from '../src/delve/hero-stats.js';
import { createDelveProfile, referenceDepth } from '../src/delve/profile.js';
import type { ForgeRequest } from '../src/types/crafting.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';

// See the pad-first spec, 4: the forge preview's Power against what is worn, as a range.

const registry = createDefaultRegistry();
/** A Fire hero at the Anvil with the kit, plus one Max Life shard and the scrap to forge. */
function hero(): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  return {
    ...p,
    scrap: 1000,
    materials: withMaterial(p.materials, { kind: 'shard', stat: 'maxHp', tier: 1 }, 1),
  };
}
/** A draw that always gives `u`: `forgeItem` at the bottom (0) or the top (just under 1) of every band. */
const always = (u: number) => ({ next: () => u }) as unknown as SeededRNG;
const power = (p: DelveProfile, item: GearItem) =>
  compareItem(p.equipped, item, registry, referenceDepth(p), p.pair).powerPct;

const CUIRASS: ForgeRequest = {
  baseId: 'cuirass',
  metal: 'rusty',
  flux: 'uncommon',
  element: 'fire',
  shards: [{ stat: 'maxHp', tier: 1 }],
};

describe('forgePowerRange', () => {
  it("spans what the forge can roll: its low is the item at every band's floor, its high at every top", () => {
    const p = hero();
    expect(previewForge(registry, p, CUIRASS).refused).toBeNull();
    const r = forgePowerRange(registry, p, CUIRASS);
    expect(r.random).toBe(0); // the uncommon's one line is the shard's
    expect(r.low).toBeLessThanOrEqual(r.high);
    expect(r.low).toBeCloseTo(power(p, forgeItem(registry, p, CUIRASS, always(0))), 6);
    expect(r.high).toBeCloseTo(power(p, forgeItem(registry, p, CUIRASS, always(1 - 1e-9))), 4);
  });

  it('leaves random lines out of both ends, and counts them', () => {
    const p = hero();
    const r = forgePowerRange(registry, p, { ...CUIRASS, shards: [] });
    expect(r.random).toBe(1);
    // Without the shard's line the item is weaker at the top than with it.
    expect(r.high).toBeLessThan(forgePowerRange(registry, p, CUIRASS).high);
  });

  it("values a weapon as a home for your moveset, as the bag's tiles are valued", () => {
    const p = hero();
    const req: ForgeRequest = { baseId: 'sword', metal: 'rusty', flux: 'uncommon', element: 'fire', shards: [] };
    const r = forgePowerRange(registry, p, req);
    // The forged sword at its top, its random line taken off (the range leaves it out).
    const top = { ...forgeItem(registry, p, req, always(1 - 1e-9)), affixes: [] };
    // compareItem's default ('home') moves the worn weapon's moveset onto it: the range's value.
    expect(r.high).toBeCloseTo(power(p, top), 4);
    const asIs = compareItem(p.equipped, top, registry, referenceDepth(p), p.pair, 'asIs').powerPct;
    // Only checked to differ where the two valuations do (the worn sword's chains against the kit's).
    if (Math.abs(asIs - power(p, top)) > 1e-6) expect(r.high).not.toBeCloseTo(asIs, 6);
  });

  it('asks nothing of the purse: a request the forge refuses still has its range', () => {
    const p = { ...hero(), scrap: 0 };
    expect(previewForge(registry, p, CUIRASS).refused).not.toBeNull();
    const r = forgePowerRange(registry, p, CUIRASS);
    expect(Number.isFinite(r.low) && Number.isFinite(r.high)).toBe(true);
  });
});
```

  If `forgeItem` with `always(1 - 1e-9)` draws something other than `next()` (a rare's name generator: not on an uncommon), the high check holds anyway; if the uncommon sword's random line makes `forgeItem` call `weightedPick` (it does: a random line), the third test strips the line (`affixes: []`) before comparing, as written. If the scrap check in the fourth test isn't the first refusal (`forgeRefusal`'s order: materials before scrap), `refused` is still non-null.

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-forge-power.test.ts)`
Expected: FAIL (`forgePowerRange` is not exported).

- [ ] **Step 3: Implement.** In `src/delve/crafting.ts` (imports: `forgedMoveset` from `../loot/forge.js`, `implicitValue` from `../loot/item-generator.js` beside `scrapLevelFactor`, `compareItem` from `./hero-stats.js`, `referenceDepth` from `./profile.js`):

```ts
/**
 * The Power a forge would change by against what is worn (the pad-first spec, 4): `low` the
 * item with every chosen line, implicit and legendary power at the bottom of its band (the
 * attunement floor applied), `high` at the top; a weapon valued as a home for your moveset
 * (`compareItem`'s default), as the bag values a tile. Random lines are left out of both ends:
 * `random` counts them. The purse and the materials don't matter (a refused request has a range).
 */
export interface ForgePowerRange {
  low: number;
  high: number;
  random: number;
}

export function forgePowerRange(
  registry: DataRegistry,
  profile: DelveProfile,
  req: ForgeRequest,
): ForgePowerRange {
  const p = previewForge(registry, profile, req);
  const base = registry.getGearBase(p.baseId);
  /** A band's roll at its bottom once the floor lifts it (0), or at its top (1). */
  const rollAt = ([b0, b1]: readonly [number, number], end: 0 | 1) =>
    end ? b1 : b0 + (b1 - b0) * p.floor;
  const at = (end: 0 | 1): GearItem => ({
    uid: 'forge-preview',
    slot: p.slot,
    baseId: p.baseId,
    rarity: p.rarity,
    mana: p.element,
    ilvl: p.ilvl,
    name: '',
    implicits: base.implicits.map((t) => ({
      stat: t.stat,
      value: implicitValue(registry, t, p.ilvl, p.rarity, end),
      roll: end,
    })),
    affixes: p.lines.flatMap((l) =>
      l.shard && l.range
        ? [{ stat: l.shard.stat, value: l.range[end], roll: rollAt(l.band, end), band: [l.band[0], l.band[1]] as [number, number] }]
        : [],
    ),
    upgrade: 0,
    reforges: 0,
    hones: 0,
    locked: false,
    ...(p.legendary && {
      legendary: { id: p.legendary.id, value: p.legendary.range[end], roll: rollAt(p.legendary.band, end) },
    }),
    ...(p.slot === 'weapon' && {
      moveset: forgedMoveset(registry, { baseId: p.baseId, rarity: p.rarity, mana: p.element }),
    }),
  });
  const depth = referenceDepth(profile);
  const power = (item: GearItem) =>
    compareItem(profile.equipped, item, registry, depth, profile.pair).powerPct;
  return { low: power(at(0)), high: power(at(1)), random: p.lines.filter((l) => !l.shard).length };
}
```

  `src/index.ts` re-exports `delve/crafting.js` whole: nothing to add there. If `crafting.ts` importing `hero-stats.ts` makes an import cycle the build complains about, put the function in `src/delve/profile.ts` beside `salvageCandidates` (which already imports `compareItem`) and import it in the test from there.

- [ ] **Step 4: Run it, the engine's types, and rebuild**

Run: `(cd packages/engine && npx vitest run tests/delve-forge-power.test.ts tests/delve-forge.test.ts && npx tsc --noEmit -p . && npx tsup)`
Expected: PASS; clean; the bundle rebuilt.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/delve/crafting.ts packages/engine/tests/delve-forge-power.test.ts
git commit -m "feat(engine): forgePowerRange, a forge's Power against what is worn from the bottom of its bands to the top"
```

---

### Task 2: `l1-forge`'s trail names the steppers

**Files:**
- Modify: `packages/engine/src/data/tutorial.json`

- [ ] **Step 1: Edit the data.** `l1-forge`'s `trail` becomes `["forge.pattern:cuirass", "forge.bar", "forge.flux", "forge.shard", "forge.go"]`. Nothing else in the step changes.

- [ ] **Step 2: The tutorial's data and play**

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-data.test.ts tests/delve-tutorial-contract.test.ts tests/delve-tutorial-review.test.ts && npx tsup)`
Expected: PASS (`forge.bar` and `forge.flux` are known targets; the review test, if it snapshots trails, takes the new one: read its failure, and update a snapshot only where it is this trail). Then in the background:

Run: `(cd packages/engine && npx vitest run tests/delve-tutorial-bot.test.ts)`
Expected: PASS, as before: the bot plays lessons by their ops (`lessonOp`), never by trails.

- [ ] **Step 3: Commit** (after the bot's PASS)

```bash
git add packages/engine/src/data/tutorial.json
git commit -m "feat(engine): l1-forge's trail names the bench's Metal and Flux rows"
```

---

### Task 3: the bench's rows

**Files:**
- Modify: `packages/client/src/features/delve/hub/forge/ForgeBench.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/ForgeTab.tsx` (the pattern in the hub's memory)
- Modify: `packages/client/src/features/delve/hub/forge/PatternList.tsx` (`data-pad-first`)
- Test: `packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx`, `ForgeTab.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `ForgeBench.test.tsx` (its render helper passes `baseId` and `onBase` now: give it a `useState` harness, `function Bench(props) { const [b, setB] = useState<string | null>(null); return <ForgeBench locked={false} setPrompts={…} baseId={b} onBase={setB} {...props} />; }`):

```tsx
  const flux = () => screen.getByTestId('forge-flux');
  const metal = () => screen.getByTestId('forge-metal');
  const element = () => screen.getByTestId('forge-element');
  const right = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'ArrowRight' });

  it('the bench is rows: Flux, Metal and Element steppers over what the save holds, then the Lines, then Forge', () => {
    renderBench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const bench = screen.getByTestId('forge-bench');
    const order = [...bench.querySelectorAll<HTMLElement>('[data-testid]')]
      .map((e) => e.dataset.testid)
      .filter((id) => /^(forge-(flux|metal|element|button)|shard-slot-\d)$/.test(id!));
    expect(order).toEqual(['forge-flux', 'forge-metal', 'forge-element', 'forge-button']); // common: no lines
    // The kit: 5 Rusty bars, 5 uncommon flux. The metal holds Rusty only; the flux None and Uncommon.
    expect(metal()).toHaveAttribute('aria-valuetext', 'Rusty bar ×5');
    expect(Number(metal().getAttribute('aria-valuemax'))).toBe(0);
    expect(flux()).toHaveAttribute('aria-valuetext', 'None');
    right(flux());
    expect(flux()).toHaveAttribute('aria-valuetext', 'Uncommon ×5');
    expect(screen.getByTestId('forge-title')).toHaveTextContent('Uncommon Cuirass');
    expect(screen.getByTestId('shard-slot-0')).toBeInTheDocument();
    // The element: the pair first, the others with their Mana Dust.
    expect(element()).toHaveAttribute('aria-valuetext', 'Fire');
    right(element());
    expect(element().getAttribute('aria-valuetext')).toMatch(/· \d+ Mana Dust$/);
  });

  it('what the save lacks is one line under its row, saying where it drops', () => {
    renderBench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.getByTestId('forge-bench')).toHaveTextContent(DROPS_FROM.metal);
    expect(screen.getByTestId('forge-bench')).toHaveTextContent(DROPS_FROM.flux);
    // No bars at all: the Metal row is that line alone, and the forge says why it can't.
    store().setProfile({ ...store().profile, materials: { ...store().profile.materials, metals: emptyMaterials().metals } });
    expect(screen.queryByTestId('forge-metal')).toBeNull();
    expect(screen.getByTestId('forge-refused')).toHaveTextContent('Missing materials');
  });

  it("carries the guided start's trail: the bar and flux rows say they are done from the bench's state", () => {
    renderBench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(screen.getByTestId('pattern-cuirass')).toHaveAttribute('data-tutorial', 'forge.pattern:cuirass');
    expect(metal()).toHaveAttribute('data-tutorial', 'forge.bar');
    expect(metal()).toHaveAttribute('data-tutorial-done', 'true'); // a held bar is chosen
    expect(flux()).toHaveAttribute('data-tutorial', 'forge.flux');
    expect(flux()).toHaveAttribute('data-tutorial-done', 'false'); // None
    right(flux());
    expect(flux()).toHaveAttribute('data-tutorial-done', 'true');
    // The Lines field: done once a line holds a shard, or at once when no shard held fits (as before).
    expect(screen.getByTestId('forge-bench').querySelector('[data-tutorial="forge.shard"]')).toHaveAttribute('data-tutorial-done', 'true');
  });

  it('a pattern picked moves the focus to the Flux row; a shard picked moves it to Forge', () => {
    putShard('maxHp', 1); // the file's helper for a held shard
    renderBench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    expect(flux()).toHaveFocus();
    right(flux());
    expect(flux()).toHaveFocus(); // a step never moves the focus
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-maxHp-1'));
    expect(screen.getByTestId('forge-button')).toHaveFocus();
  });
```

  `emptyMaterials` from `@alloy/engine`, `DROPS_FROM` from `../materials-text`. The existing tests follow the rows:
  - "carries the guided start's trail: a keyed pattern, bar and flux…" is replaced by the trail test above; "the Lines field is done at once when no shard held fits the item" keeps its point.
  - "flux sets the rarity; a line takes a shard…", "a lower flux keeps only the shards its lines can hold", "forges a magic item through the engine…", "epic flux and an essence forge a legendary…" step the flux (`right(flux())` until `aria-valuetext` reads the grade; a helper `stepFluxTo(grade)`), and the essence through `forge-essence`.
  - "an element outside the pair costs Mana Dust…" steps `forge-element`.
  - "the metal follows the stock…" and "the flux follows the stock…" read `aria-valuetext` where they read a pressed option.
  - "a pick moves the focus to Forge, so Enter forges next; a refused forge leaves it where it was" becomes the focus test above plus its refused half (a refused shard pick leaves the focus on the Lines row).
  - "lists the learned patterns…" adds: the first learned row carries `data-pad-first` while none is picked, the picked one after.

  `ForgeTab.test.tsx` adds: "comes back to its pattern from the hub's memory" (pick `pattern-cuirass`, unmount, render with the same `memory`: `pattern-cuirass` is pressed and `data-pad-first`, and the bench shows "Common Cuirass").

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge)`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `ForgeBench.tsx`:
  - Props: `{ locked, setPrompts, baseId, onBase }` (`baseId: string | null; onBase: (b: string | null) => void`); its own `baseId` state goes. `ForgeTab` holds `const [baseId, setBaseId] = useState<string | null>(kept?.baseId ?? null)` and writes it into `memory.forge` with the bench and the uid.
  - `Field` and the `Segmented` fields go. The rows:

```tsx
            <Stepper
              label="Flux"
              testId="forge-flux"
              tutorial="forge.flux"
              done={flux !== null}
              value={flux ?? 'none'}
              onChange={(f) => pickIngot(f === 'none' ? null : f, essence)}
              options={[
                { id: 'none' as const, label: 'None · common', text: 'None' },
                ...FLUX_GRADES.filter((g) => fluxHeld[g] > 0).map((g) => ({
                  id: g,
                  label: `${RARITY_LABEL[g]} ×${fluxHeld[g]}`,
                  text: `${RARITY_LABEL[g]} ×${fluxHeld[g]}`,
                })),
              ]}
              note={FLUX_GRADES.some((g) => fluxHeld[g] === 0) ? DROPS_FROM.flux : undefined}
            />
            {heldMetals.length > 0 ? (
              <Stepper
                label="Metal"
                testId="forge-metal"
                tutorial="forge.bar"
                done={metals[metal] > 0}
                value={metal}
                onChange={setMetal}
                options={heldMetals.map((m) => {
                  const text = `${materialLabel(registry, { kind: 'metal', metal: m })} ×${metals[m]}`;
                  return { id: m, label: text, text };
                })}
                note={heldMetals.length < METAL_IDS.length ? DROPS_FROM.metal : undefined}
              />
            ) : (
              <p className="k-caption" data-tutorial="forge.bar">Metal: none held. {DROPS_FROM.metal}</p>
            )}
            <Stepper
              label="Element"
              testId="forge-element"
              value={element}
              onChange={setElement}
              options={ELEMENT_ORDER.map((m) => {
                const name = manaStyle(registry, m).name;
                const text = inPair(profile, m) ? name : `${name} · ${offPairDust} Mana Dust`;
                return { id: m, label: inPair(profile, m) ? name : <span>{name} · <Price dust={offPairDust} /></span>, text };
              })}
            />
            {flux === 'epic' && (
              <Stepper
                label="Essence"
                testId="forge-essence"
                value={essence ?? 'none'}
                onChange={(e) => pickIngot('epic', e === 'none' ? null : e)}
                options={[
                  { id: 'none', label: 'None · epic', text: 'None' },
                  ...Object.entries(essences).filter(([, n]) => n > 0).map(([e, n]) => {
                    const text = `${registry.getLegendary(e).name} ×${n}`;
                    return { id: e, label: text, text };
                  }),
                ]}
                note={Object.values(essences).every((n) => !n) ? DROPS_FROM.essence : undefined}
              />
            )}
```

    with `const heldMetals = METAL_IDS.filter((m) => metals[m] > 0);` and `const ELEMENT_ORDER = [...pairElements(profile.pair), ...MANA_TYPES.filter((m) => !inPair(profile, m))];` (`pairElements` from `@alloy/engine`). The Metal row with nothing held still carries `forge.bar` (on the line) so the marker has a place; it is not done, and the forge's refusal says what is missing. Stepping no longer calls `pick()`: a step never moves the focus.
  - The Lines: the field's wrapper keeps `data-tutorial="forge.shard"` and `data-tutorial-done={linesDone}`; each line is the `shard-slot-<i>` row as today, its text "Line i · <shard> <range>" or "Line i · Random", its band on the right.
  - The focus: `pick()` stays for a shard pick (the focus goes to Forge, unless refused); a pattern pick sets a second ref, `toRows`, and the effect focuses `forge-flux` (`document.querySelector('[data-testid="forge-flux"]')`; scope it to the bench's panel ref) when it is set.
  - The preview moves out of the rows into a third panel (Task 4). The bench's panel keeps: the status line, the rows, Forge, and the refusal under it.

  `PatternList.tsx`: each learned row gets `data-pad-first={(selected ? b.id === selected : i === 0) || undefined}` (i over the learned rows).

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge)`
Expected: PASS but the preview's tests (Task 4) where they read what moved.

---

### Task 4: the preview pane and its Power range

**Files:**
- Modify: `packages/client/src/features/delve/hub/forge/ForgeBench.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/ForgeTab.tsx` (the third column)
- Test: `packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx`

- [ ] **Step 1: Write the failing tests.**

```tsx
  it("the preview beside the rows shows the item the forge would make, with no stops; it scrolls on the right stick", () => {
    renderBench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    const preview = screen.getByTestId('forge-preview');
    expect(within(preview).getByTestId('forge-title')).toHaveTextContent('Common Cuirass');
    expect(within(preview).getByTestId('forge-implicits')).toBeInTheDocument();
    expect(within(preview).getByTestId('forge-uses')).toHaveTextContent('Rusty bar');
    expect(preview.querySelectorAll('button, [tabindex="0"]')).toHaveLength(0);
    expect(preview.querySelector('[data-pad-scroll]') ?? preview.closest('[data-pad-scroll]')).not.toBeNull();
  });

  it("shows the item's Power against what is worn as a range, the engine's (forgePowerRange)", () => {
    putShard('maxHp', 1);
    renderBench();
    fireEvent.click(screen.getByTestId('pattern-cuirass'));
    stepFluxTo('uncommon');
    const p = store().profile;
    const req = { baseId: 'cuirass', metal: 'rusty' as const, flux: 'uncommon' as const, element: 'fire' as const, shards: [] };
    const random = forgePowerRange(registry, p, req);
    const power = screen.getByTestId('forge-power');
    expect(power).toHaveTextContent(`${formatDelta(random.low)} to ${formatDelta(random.high)} Power`);
    expect(power).toHaveTextContent('against your chest');
    expect(power).toHaveTextContent('before 1 random line');
    // A shard on the line: the range is the shard's, with no random line left.
    fireEvent.click(screen.getByTestId('shard-slot-0'));
    fireEvent.click(screen.getByTestId('shard-pick-maxHp-1'));
    const shard = forgePowerRange(registry, store().profile, { ...req, shards: [{ stat: 'maxHp', tier: 1 }] });
    expect(power).toHaveTextContent(`${formatDelta(shard.low)} to ${formatDelta(shard.high)} Power`);
    expect(power).not.toHaveTextContent('random');
  });

  it('a weapon\'s range says it is valued as a home for your moveset; one value when the ends meet', () => {
    renderBench();
    fireEvent.click(screen.getByTestId('pattern-sword'));
    expect(screen.getByTestId('forge-power')).toHaveTextContent('as a home for your moveset');
  });
```

  (`forgePowerRange` from `@alloy/engine`, `formatDelta` from `../../../format`, `within` from testing-library.) The tests that read `forge-implicits`, `forge-floor`, `forge-weapon`, `forge-legendary`, `forge-uses`, `forge-title` and `forge-purse` keep their ids: they now sit in `forge-preview`.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx)`
Expected: FAIL.

- [ ] **Step 3: Implement.** `ForgeBench` returns `PatternList`, the bench's panel and the preview's:

```tsx
      <Panel aria-label="The item" testId="forge-preview" scroll={false}>
        <div className="k-scroll flex min-h-0 flex-1 flex-col gap-4" data-pad-scroll>
          {!preview ? (
            <p className="k-body-2">The item you forge shows here.</p>
          ) : (
            <>
              {/* the title block, forge-purse, forge-floor, forge-implicits, forge-legendary,
                  forge-weapon and forge-uses, moved from the bench as they are */}
              <PowerRange range={range!} slot={preview.slot} />
            </>
          )}
        </div>
      </Panel>
```

  with `const range = req ? forgePowerRange(registry, profile, req) : null;` and

```tsx
/** The forge's Power against what is worn (the engine's `forgePowerRange`): "+3.1% to +8.4% Power against your chest". */
function PowerRange({ range, slot }: { range: ForgePowerRange; slot: GearSlot }) {
  const { low, high, random } = range;
  const span = Math.abs(high - low) < 0.0005 ? formatDelta(high) : `${formatDelta(low)} to ${formatDelta(high)}`;
  const up = low > UPGRADE_EPSILON;
  return (
    <p className="k-disp text-[22px]" style={{ color: up ? 'var(--k-ok)' : 'var(--k-text)' }} data-testid="forge-power">
      {span} Power against your {SLOT_LABEL[slot].toLowerCase()}
      {slot === 'weapon' && ', as a home for your moveset'}
      {random > 0 && (
        <span className="k-caption block">
          before {random} random line{random === 1 ? '' : 's'}
        </span>
      )}
    </p>
  );
}
```

  Read `formatDelta`'s output (`format.ts`) to make the test's expectation the same string (it may print "+3.1%"): the test builds its text with `formatDelta` too, so it agrees by construction. `ForgeTab` renders all three of `ForgeBench`'s panels in its grid (the empty third column from plan 04 goes). The bench's doc comment becomes: "The Forge bench, in three columns: the patterns; the rows (Flux, Metal and Element steppers over what the save holds, each with where what it lacks drops; with epic flux, Essence; a row a line, opening the shard picker; Forge, Enter or A); and the preview (no stops): the engine's `previewForge` (the lines' bands, the attunement floor, the implicits, a weapon's skills, slots and sockets, what it uses) and its Power against what is worn as a range (`forgePowerRange`). A legendary plays the fanfare."

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve)`
Expected: types clean; PASS.

- [ ] **Step 5: Commit** (Tasks 3 and 4)

```bash
git add packages/client/src/features/delve/hub/forge
git commit -m "feat(client): the Forge bench in rows (steppers over what the save holds) beside a preview with the item's Power range"
```

---

### Task 5: the E2E

**Files:**
- Modify: `packages/client/e2e/fixtures/delve.ts` (`stepTo`)
- Modify: `packages/client/e2e/delve.spec.ts` (D10), `delve-tutorial.spec.ts` (TU01's forge), `e2e/responsive/specs/delve-anvil.spec.ts` (the forge-preview probe), `delve-pad-nav.spec.ts` (PN04)

- [ ] **Step 1: The fixture.**

```ts
/** Step a kit Stepper (`role="spinbutton"`) with the arrow keys until its value reads `value`. */
export async function stepTo(page: Page, testId: string, value: RegExp): Promise<void> {
  const el = page.getByTestId(testId);
  for (let i = 0; i < 12; i++) {
    if (value.test((await el.getAttribute('aria-valuetext')) ?? '')) return;
    await el.press('ArrowRight');
  }
  await expect(el).toHaveAttribute('aria-valuetext', value);
}
```

- [ ] **Step 2: D10, the responsive probe, TU01.** In D10 and the responsive Anvil spec's `forge-preview` branch, `await page.getByTestId('flux-uncommon').click();` becomes `await stepTo(page, 'forge-flux', /^Uncommon/);`. In TU01:

```ts
    await marked('forge.pattern:cuirass');
    await page.getByTestId('pattern-cuirass').click();
    // The Rusty bar is the bench's own first pick, done already: on to the flux row.
    await marked('forge.flux');
    await stepTo(page, 'forge-flux', /^Uncommon/);
    await marked('forge.shard');
```

  (the rest as it is). D10's last check (plan 04 put it after `bench-materials`) may read the Metal row instead: `await expect(page.getByTestId('forge-metal')).toHaveAttribute('aria-valuetext', 'Rusty bar ×4');` — take whichever is shorter; one of them.

- [ ] **Step 3: PN04.** The bench's first row is a stepper, whose left/right step it: the walk changes.

```ts
  test('PN04: Forge by the pad: A on a pattern lands on the Flux row, right steps it, down reaches Forge and left the patterns; RT goes to Temper, then Materials', async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await click(page, 'tab-forge');
    await page.getByTestId('pattern-cuirass').focus();
    await tap(page, BUTTON.up); // the pad takes the input lock (and moves within the list)
    await page.getByTestId('pattern-cuirass').focus();
    await mark(page, 'pattern');
    await tap(page, BUTTON.a);
    expect((await where(page)).id).toBe('forge-flux');
    const flux = page.getByTestId('forge-flux');
    const before = await flux.getAttribute('aria-valuetext');
    await tap(page, BUTTON.right);
    expect((await where(page)).id).toBe('forge-flux'); // a step never moves the focus
    // A save holding any flux steps off None.
    if (before === 'None' && (await flux.getAttribute('aria-valuemax')) !== '0')
      expect(await flux.getAttribute('aria-valuetext')).not.toBe('None');
    // Down the rows to Forge, then left: back to the pattern it came from.
    let presses = 0;
    while ((await where(page)).id !== 'forge-button' && presses++ < 8) await tap(page, BUTTON.down);
    expect((await where(page)).id).toBe('forge-button');
    await back(page, 'left', 'pattern');
    // RT steps to Temper: the focus lands on its gear list, then on to Materials.
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('bench-temper')).toHaveAttribute('aria-selected', 'true');
    expect((await where(page)).id).toBe('temper-row');
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('bench-materials')).toHaveAttribute('aria-selected', 'true');
    const at = await where(page);
    expect(at.tab).toBe(false);
    expect(at.foot).toBe(false);
  });
```

  If the seeded save holds no flux (the step right does nothing), the value check is moot: read the audit save's `materials.flux` once (`economySim(registry, 1, 3).profile.materials.flux`) and keep the check only if a grade is held. If `back(page, 'left', 'pattern')` reaches the patterns at another row than the one marked (the straight-back rule keys on the crossing, and this left crossing starts from Forge, not from the flux row), assert the group instead: `expect((await where(page)).group).toBe('pattern-list')`.

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-tutorial.spec.ts e2e/delve-pad-nav.spec.ts --project=desktop && npx playwright test --project=responsive e2e/responsive/specs/delve-anvil.spec.ts)`
Expected: PASS but PN01's allowances for `forge`, `forge-pattern` and `temper`, which plan 07 re-measures: read the report (`NAV_REPORT=1`) now, and lower what went down.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): the Forge bench's E2E by its steppers; PN04 walks the rows"
```
