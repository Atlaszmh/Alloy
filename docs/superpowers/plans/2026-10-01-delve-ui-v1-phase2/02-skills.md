# Delve UI v1 · Phase 2 · 2B: Skills — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Anvil's Skills tab as its three panes in the forge kit, composed by `SkillsTab(props: HubTabProps)`: `SkillList` (the four skills as a sub tab list, each with its input glyph, payment, slot dots and chain, then the mana pair box with "Realign ›"), `ChainLane` (the chain's header and payment, its move cards with their sockets and the chosen card's ◂ ▸ × toolbar, "+ Slot" with its price, the mouse drag and the pad's carry; for an ability chain `ChainStats` and `RhythmStrip`) and `MoveInspector` (kind, form and element segments, socket rows that open the rune picker inline, the move's numbers), or the Mana view in its place. The Apply bar is the footer's right-hand group. `ChainEditor` splits into `useChainEditor` and its one-column view (Training and the stop keep it), `RunePicker` gains an inline variant, `applyLabel` and the prices lose their emoji, and the engine adds `expectedHit` and `chainCycle`. `AbilitiesPanel.tsx` goes.

**Architecture:** `chains/useChainEditor.ts` holds the builder's state and edits (today's `ChainEditor` props, unchanged) and returns a `ChainEditorModel`; `ChainEditor` (one column) and the Skills panes are two views of it. `hub/skills/useAnvilChains.ts` is the old panel's binding to the store's draft, as those props plus the next slot's offer. `SkillsTab` composes `SkillList`, `ChainLane` and `MoveInspector` (or `ManaPanel`, the right pane's own pad scope) over one `useChainEditor`, sets `ApplyBar` through `setFooterAction` and its prompts through `setPrompts`, and binds `[` `]` and Alt+← → itself. The rules stay the engine's (`resolveChain`, `manaSupport`, `moveNumbers`, `moveBeat`, `setChains`, `addSlot`, `runeText`, and the new `chainCycle`). The store changes only `applyLabel`'s words.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, TailwindCSS v4, Vitest 3 (jsdom, Testing Library), Playwright; the engine's tsup bundle.

**Spec:** `docs/superpowers/specs/2026-10-01-delve-ui-v1-design.md`: "Phase 2: The Anvil hub" → the shared contract and **2B · Skills** (with its engine contract), decided items 15, 19, 25, 27, 32, 33, 34, 37 and 39, "The input map" (Skills' rows), "Accessibility". The overview is `00-overview.md` in this folder (its "Carried from the Phase 1 review": the sheet portals into `uiLayer()`). Mockup: `Anvil-Skills.dc.html`.

---

## Base

- **Starts from:** `ui/p2` at `807b324` (2·0 `3f8ef0e..2d6273a` and the Phase 1 review fixes). Worktree `C:/Projects/alloy-ui-2b`, branch `ui/p2-2b` (`git worktree add ../alloy-ui-2b -b ui/p2-2b ui/p2`), with the overview's junctions (the client's `@alloy/engine` to this worktree's `packages/engine`). Every path is relative to the worktree root, `/c/Projects/alloy-ui-2b` in Git Bash.
- **Tasks 1–10** run in that worktree. **Task 11** (deleting `AbilitiesPanel.tsx` and moving its tests onto the tab) runs on `ui/p2` once the integrator has merged 2B and wired `SkillsTab` into `AnvilHub` (X1), as 2A's and 2C's deletions do.
- **What 2B relies on** (all at the base): 2·0's `hub/types.ts` (`HubTabProps`, `HubLink`), `items/AttunementBars.tsx` and the kit `Chip` in `ChainEditor`, `MoveEditor`, `ManaPanel`; the kit (`Panel` passes `data-pad-scope` through, `Button` and `Chip` spread their props, `Segmented` draws `role="radio"` with each option's `testId`, `Price` reads as its label, `usePrompts`, `captureNav`, `padPrompts`, `navCapture`, `uiLayer`, `layerZoom`); `prompts.ts` as fixed by the review (a prompt whose screen went away never fires on its release).
- **Before Task 1:** build the engine for the junction and measure the client:

```bash
cd /c/Projects/alloy-ui-2b
(cd packages/engine && npx tsup)
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
(cd packages/engine && npx vitest run)
```

  Expected: "Build success"; the client passes 1004 tests in 123 files and the typecheck prints nothing; the engine passes 1645 | 5 skipped in 83 files + 1 skipped. This area ends (after Task 10) at 1028 tests in 127 files and the engine at 1651; Task 11 on `ui/p2` moves the old panel's 36 tests onto the tab (1029 in 128 files on the scratch copy).

## Files

| File | Change |
|---|---|
| `packages/engine/src/delve/hero-stats.ts` | `expectedHit`, `ChainCycle`, `chainCycle`; `estimateCombat` calls `expectedHit` (its numbers unchanged) |
| `packages/engine/src/index.ts` | exports `expectedHit`, `chainCycle`, `ChainCycle` |
| `packages/engine/tests/delve-chain-cycle.test.ts` (new) | the engine contract's tests |
| `packages/client/src/stores/delveStore.ts` | `applyLabel` in words ("Apply · 5 Mana Dust · 1 Link · 20 scrap") |
| `packages/client/src/stores/delveStore.test.ts` | its label tests |
| `packages/client/src/pages/__tests__/DelveCamp.test.tsx` | two label assertions (X2) |
| `packages/client/src/features/delve/chains/useChainEditor.ts` (new) | the builder's props, model and hook |
| `packages/client/src/features/delve/chains/ChainEditor.tsx` | overwritten: the one-column view over the hook |
| `packages/client/src/features/delve/chains/MoveEditor.tsx` | overwritten: the numbers table and the shared pieces (`KIND_HINT`, `moveRows`, `blowRows`, `NumberTable`, `MoveNumbers`, `moveChoices`) |
| `packages/client/src/features/delve/chains/chain-text.ts` | `KIND_NAME` |
| `packages/client/src/features/delve/chains/__tests__/useChainEditor.test.tsx` (new) | the hook |
| `packages/client/src/features/delve/chains/__tests__/ChainEditor.test.tsx` (new, Task 11) | the old test file's `ChainEditor` block |
| `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx` | moved to `hub/skills/__tests__/` (Task 8) |
| `packages/client/src/features/delve/runes/RunePicker.tsx` | `variant: 'sheet' \| 'inline'`; the sheet in `uiLayer()`; 14 px text |
| `packages/client/src/features/delve/runes/SocketRow.tsx` | "+ socket" priced with `Price`; `whyId` |
| `packages/client/src/features/delve/runes/__tests__/{RunePicker,SocketRow}.test.tsx` | the variant, the layer; the price, `whyId` |
| `packages/client/src/features/delve/ManaPanel.tsx` | overwritten: the Mana view as a kit `Panel` pane (its own scope, Back), glyphs and `Price` |
| `packages/client/src/features/delve/__tests__/ManaPanel.test.tsx` | moved to `hub/skills/__tests__/ManaView.test.tsx` (Task 10) |
| `packages/client/src/features/delve/AbilitiesPanel.tsx` | drops the Mana view (Task 10); deleted (Task 11) |
| `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx` | label, price and number assertions (Tasks 2, 3, 6); moved to `hub/skills/__tests__/SkillsTab.chains.test.tsx` (Task 11) |
| `packages/client/src/features/delve/hub/skills/useAnvilChains.ts` (new) | the Anvil's binding to the draft |
| `packages/client/src/features/delve/hub/skills/SkillList.tsx` (new) | `SkillList`, `skillBinding`, the mana pair box |
| `packages/client/src/features/delve/hub/skills/ChainLane.tsx` (new) | `ChainLane`, `dropIndex`, `ChainStats`, `RhythmStrip` |
| `packages/client/src/features/delve/hub/skills/MoveInspector.tsx` (new) | `MoveInspector` |
| `packages/client/src/features/delve/hub/skills/ApplyBar.tsx` (new) | `ApplyBar`, `APPLY_BINDING`, `applyChains` |
| `packages/client/src/features/delve/hub/skills/SkillsTab.tsx` (new) | `SkillsTab` |
| `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx` (new) | `Panes` and `renderSkills` for the tests |
| `packages/client/src/features/delve/hub/skills/__tests__/{ChainLane,ApplyBar,SkillsTab}.test.tsx` (new) | the lane, the bar, the tab |

Nothing else: `TrainingPanel.tsx` and `StopPanel.tsx` keep `ChainEditor` and the sheet `RunePicker` unchanged (their tests pass untouched), `HubFooter.tsx` and `AnvilHub.tsx` are the integrator's.

## Cross-area needs

**X1 · Integrator (`hub/AnvilHub.tsx`).** What `SkillsTab` needs from the hub:
1. Render `<SkillsTab mode setPrompts setFooterAction go link />` straight in the screen's main (no interim column, zoom undo, padding or scroll): the tab draws its own grid (24 px padding top and bottom, 32 px at the sides, a 24 px gap, `340px minmax(0, 1fr) 500px`) and its panes scroll inside themselves. The root keeps `data-testid="abilities-panel"` (`AnvilHub.test.tsx` and D04 read it).
2. `setFooterAction(node)`: while set, the footer draws `node` in place of its right-hand group (Training, the start depths, the Delve button and the draft block); `null` restores it. `node` is `<ApplyBar />`, which carries its own `delve-button` (`data-pad-menu`, Enter / Start): the hub must not draw a second one meanwhile. `SkillsTab` sets it once on mount (not in the pause) and clears it on unmount; it reads the setters through a ref, so they need not be stable.
3. `setPrompts(prompts)`: the footer draws the tab's prompts (Select move, Reorder, Remove, Next skill, Apply; Back in the Mana view; Move, Drop, Put back while the pad carries a card) before the hub's Menu, and the hub binds the same array with its `usePrompts` in the main's scope. The tab's "Select move" replaces the hub's own "Select". The tab clears them (`[]`) on unmount.
4. `go({ tab: 'skills', view: 'mana' })` (the Loadout's `mana-strip`) opens the Mana view; `{ tab: 'skills', skill }` picks the skill. The tab reacts to each new `link` object.
5. The Skills tab's `draft-count` badge stays the hub's. The interim `<AbilitiesPanel />` line and its import go (Task 11 deletes the file). The scratch check stood in for this wiring with the minimal edit below, before Task 11; the integrator's own wiring supersedes it:

```tsx
// AnvilHub.tsx: the import of AbilitiesPanel goes, SkillsTab's comes in after SystemMenu's, and
            {tab === 'skills' && (
              <SkillsTab
                mode={mode}
                setPrompts={() => {}}
                setFooterAction={() => {}}
                go={() => {}}
              />
            )}
```

**X2 · `pages/__tests__/DelveCamp.test.tsx` (no area owns it in Phase 2).** Task 2 changes its two `applyLabel` assertions (the footer's `draft-apply` reads the same function): `/Apply · \d+ Mana Dust/` and `'Apply · 1 Link · 20 scrap'`. If the integrator drops `HubFooter`'s draft block, those tests go with it.

**X3 · Integrator (E2E).** Ids the Skills tab keeps: `abilities-panel`, `chain-skill-<s>` (role `tab`, `aria-selected`), `abilities-summary` (the chosen skill's row), `chain-cards`, `move-<i>` (`aria-pressed`), `move-left-<i>` / `move-right-<i>` / `move-remove-<i>` (the chosen card only), `move-add`, `add-slot`, `add-slot-why`, `chain-slots`, `sockets-<i>`, `socket-<i>` (the card pips; `data-rune`), `socket-open` (the chosen card), `socket-open-why`, `ability-readout` (the inspector), `kind-<k>`, `form-<id>`, `element-<m>`, `infusion-<m>`, `swap-elements`, `payment-<p>`, `socket-count`, `rune-ease`, `cost-warning`, `mana-support`, `chain-draft`, `chain-price`, `chain-revert`, `chain-apply`, `chain-apply-why`, `delve-button`, `rune-picker`, `rune-picker-close`, `rune-current`, `rune-pull`, `rune-tier-<t>`, `rune-pick-<id>`, `mana-view` and its ids. New: `chain-lane`, `chain-stats`, `stat-damage|cycle|mana|support`, `rhythm-strip`, `rhythm-step|echo|beat-<i>`, `inspect-socket-<i>`, `num-<id>`, `move-edited`, `mana-pair`, `mana-realign`, `mana-back`. The spec's updates:
- **D04:** `chain-draft` is always shown: after Apply, `expect(page.getByTestId('chain-price')).toHaveText('No changes')` in place of `toHaveCount(0)`; `chain-slots` reads `'1 of 1 slots'`, then `'2 of 2 slots'`. The rest holds (`form-burst`, `infusion-nature`, `ability-readout` contains "light Wildfire Burst", `add-slot`, `move-add` × 0).
- **R01:** Apply's label: `toContainText('1 Link')` and `toContainText('20 scrap')`; after Apply, `chain-price` reads "No changes". `cards.getByTestId('socket-open')`, `socket-0` and the picker's ids hold (the picker is inline in the inspector).
- **R05, R06:** unchanged (`ability-readout` holds the `num-cost` row with "`n` mana (runes: …)", `rune-ease` and `cost-warning`; `mana-support` keeps its exact text).
- **G06:** the skill list is a vertical column in the left pane. Step it with LT / RT (the spec), or walk it up and down; from a row, the cards lie to the right. The kind chips are radios with the same ids.
- **G07:** unchanged path (`socket-0` on the card; A opens the inline picker, whose Back has the focus; B backs out of its scope and the focus returns to `socket-0`).
- **D08:** unchanged.

## Where the spec left room

- **`chainCycle.mana` for a cast chain.** The spec's contract says 0 for charge and cast; `resolveAbility` charges a cast chain mana (`castManaMult`, half) and `manaSupport` counts it, so `mana` sums each valued move's `cost` (0 only for charge, whose cost is 0). If the literal contract is wanted, it is one `payment === 'cast' ? 0 :` and one test. `steps[i].cast` is `castTime` (conjure plus channel); a hold's is `max(holdFull, castTime)`.
- **The inspector's numbers** are a two-column table (`num-<id>`): the mockup's Hit, Radius, Cost and Beat after, plus today's Wind-up, Cooldown, Stacks and a hold's Full charge, so nothing the readout says is lost; a Ward, Armor, Surge, Blink, Barrage or Maelstrom names its effect rows. The one-column `ChainEditor` draws the same table.
- **`rune-ease`** stays the "Attunement eases rune cost by n%" line (R05); each socket row shows its rune's own price with no id. The card pips keep `socket-<i>`; the inspector's rows are `inspect-socket-<i>`, so `socket-0` stays unique for G07.
- **The payment** has a place nowhere in the spec's panes; the lane's header carries it as a `Segmented` (`payment-<p>`, each option's meaning as its title).
- **"+ Slot":** one dashed card: "+ Move" (`move-add`, free) while the chain has an unused slot, else "+ Slot" (`add-slot`) with its `Price`, off with `add-slot-why` when it can't be bought.
- **The skill list** is a hand-built vertical `role="tablist"` with `data-pad-tabs="sub"` (the stepping contract of a sub `Tabs`): the kit `Tabs` draws a horizontal row of text tabs, and the rows are plates with a glyph, dots and the chain. `abilities-summary` marks the chosen row's chain.
- **Prompts:** "Next skill" draws `]` / RT but binds no pad button (the nav's sub-tab step owns RT, decided item 15); the tab binds `[` `]` and Alt+← → without drawing them. While the pad carries a card, the prompts are display only (`captureNav` takes the D-pad and A/B/X).
- **The compact Delve** delves at the deepest start depth, the footer's default (the start chips aren't on Skills), and reads "Delve" or "Resume".
- **The Apply bar's line** is "n unapplied change(s) · " and the price (a `Price`, a refund as "+1 Link", "destroys Split I"), "free until your first dive", "free" or the engine's refusal; or "No changes". The old "you have …" amounts go (the purse is in the header).
- **The Mana view** is today's content in a kit `Panel` (`mana-view`, `data-pad-scope`, Back `mana-back` with `data-pad-back`), with element glyphs and `Price` for the emoji; Realign's chips are named by their element. `AttunementBars` (2·0's file) keeps its own look.
- **Text sizes:** the picker, the socket pips and the panes are at 14 px or more (decided item 33); `ChainEditor`'s one-column markup keeps its legacy sizes for Training and the stop until 3b.
- **The drag** is the mouse's (pointer events, the left button); a place is the distance between the first two cards in design px (`layerZoom`, decided item 32); a drag that moved swallows its click.
- **Read-only:** mid-dive or unarmed, the cards stay selectable; the inspector's segments and socket rows sit in a disabled `fieldset`, the toolbar, "+ Move" and the payment are off.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `ui/p2-2b` (Task 11 on `ui/p2`), staged by path, never `git add -A`; the trailer is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell; each commit block starts with `cd /c/Projects/alloy-ui-2b` (Task 11: the `ui/p2` worktree, `/c/Projects/alloy-ui-p2`).
- **Line endings:** a fresh worktree checks out CRLF; the Edit tool keeps them, a moved file (`git mv`) keeps them, and `sed -i` leaves them. New and overwritten files are written LF (git stores LF either way).
- **Prettier:** every file this plan edits passed `npx prettier --check --end-of-line auto` at the base, and the code below is already formatted (checked on the scratch copy), so each commit block's `--write` changes nothing typed as written.
- **How the edits read:** "In `f`, replace: A with: B" is one Edit (A is unique in `f` at that point; apply each file's edits top to bottom). "Create `f`:" and "Overwrite `f`:" are Writes. A `bash` block is run as written from the worktree root.
- **Checked on a scratch copy:** `ui/p2` at `807b324` (`git archive`), with this plan's ops applied task by task by a script that checked every anchor once in its file; every FAIL and PASS below was run there, the typecheck, the engine suite and the client build were clean, and every file ends as the tree the code was developed and screenshotted in (1920×1080: the lane, the inline picker and the Mana view).

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| Engine suite and typecheck | `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client suite and typecheck | `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)` |
| Client build | `(cd packages/client && npx tsc -b && npx vite build)` |

---

## Chunk 1: The engine and Apply's label

### Task 1: The engine: `expectedHit` and `chainCycle`

The Skills tab's stat tiles and rhythm strip need one full cycle of an ability chain, and the client may not compute it (decided item 25). `expectedHit` is the hit `estimateCombat` already computes, extracted so both share it; `chainCycle` composes `damagePerUse`, `useInterval`, `valuedMove`, `holdFull` and `moveBeat`.

**Files:**
- Create: `packages/engine/tests/delve-chain-cycle.test.ts`: the contract: expectedHit, and chainCycle's damage, seconds, mana, steps and restart
- Modify: `packages/engine/src/delve/hero-stats.ts`: `expectedHit`, `ChainCycle`, `chainCycle`; `estimateCombat` calls `expectedHit`
- Modify: `packages/engine/src/index.ts`: exports `expectedHit`, `chainCycle` and the `ChainCycle` type

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-chain-cycle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { holdFull, moveBeat, resolveChain } from '../src/arpg/abilities/resolve.js';
import {
  chainCycle,
  computeHeroStats,
  damagePerUse,
  expectedHit,
  useInterval,
} from '../src/delve/hero-stats.js';
import * as engine from '../src/index.js';
import type { Chain, Move } from '../src/types/ability.js';
import { bal, gear, registry } from './fixtures/arena.js';

/**
 * The Skills tab's chain stats and rhythm strip (Delve UI v1, Phase 2B): one full cycle of an
 * ability chain as Power values it, from the engine's own pieces.
 */

const hero = computeHeroStats({ weapon: gear('fire') }, registry, {
  pair: { primary: 'fire', secondary: null },
});
const bolt = (over: Partial<Move> = {}): Move => ({
  kind: 'medium',
  form: 'bolt',
  elements: ['fire'],
  ...over,
});
const resolved = (chain: Chain) => resolveChain(registry, hero, 'primary', chain);

describe('expectedHit', () => {
  it('is weapon damage × damage multiplier × the crit factor', () => {
    const crit = 1 + hero.critChance * (hero.critMultiplier - 1);
    expect(expectedHit(hero)).toBeCloseTo(hero.weaponDamage * hero.damageMult * crit, 9);
  });
});

describe('chainCycle', () => {
  it("is one full cycle's damage, seconds and mana, from damagePerUse and useInterval", () => {
    const chain = resolved({ payment: 'mana', moves: [bolt({ kind: 'light' }), bolt()] });
    const cycle = chainCycle(registry, hero, chain);
    expect(cycle.damage).toBeCloseTo(damagePerUse(chain, expectedHit(hero), hero, bal) * 2, 9);
    expect(cycle.seconds).toBeCloseTo(
      useInterval(bal, chain, hero.tempo, Infinity, Infinity) * 2,
      9,
    );
    expect(cycle.mana).toBeCloseTo(chain.moves[0].cost + chain.moves[1].cost, 9);
    expect(cycle.restart).toBe(bal.abilities.comboWindow);
    expect(cycle.steps).toEqual(
      chain.moves.map((ab) => ({
        cast: ab.castTime,
        beat: moveBeat(bal, ab, hero.tempo),
        kind: ab.kind,
        elements: ['fire'],
        hold: false,
        echo: false,
      })),
    );
  });

  it('values a hold at full charge: its charge time, its full beat and its full cost', () => {
    const chain = resolved({ payment: 'mana', moves: [bolt({ kind: 'hold' })] });
    const full = chain.hold[0]![2];
    const [step] = chainCycle(registry, hero, chain).steps;
    expect(step).toMatchObject({ kind: 'hold', hold: true });
    expect(step.cast).toBe(Math.max(holdFull(bal, hero.tempo), full.castTime));
    expect(step.beat).toBe(moveBeat(bal, full, hero.tempo));
    expect(chainCycle(registry, hero, chain).mana).toBeCloseTo(full.cost, 9);
  });

  it('spends no mana paid with charge, and marks a move its runes repeat', () => {
    const echo = bolt({ runes: [{ id: 'echo', tier: 3 }] });
    const charged = chainCycle(registry, hero, resolved({ payment: 'charge', moves: [echo] }));
    expect(charged.mana).toBe(0);
    expect(charged.steps[0].echo).toBe(true);
    expect(charged.damage).toBeGreaterThan(0);
  });

  it("counts a cast chain's mana: its half cost, and the channel in its cast time", () => {
    const chain = resolved({ payment: 'cast', moves: [bolt()] });
    const cycle = chainCycle(registry, hero, chain);
    expect(cycle.mana).toBeCloseTo(chain.moves[0].cost, 9);
    expect(cycle.mana).toBeGreaterThan(0);
    expect(cycle.steps[0].cast).toBe(chain.moves[0].conjure + chain.moves[0].channel);
  });

  it('is exported from the engine', () => {
    expect(engine.chainCycle).toBeTypeOf('function');
    expect(engine.chainCycle).toBe(chainCycle);
    expect(engine.expectedHit).toBe(expectedHit);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-cycle.test.ts)`
Expected: FAIL: 6 failed (6): `expectedHit is not a function`, `chainCycle is not a function`, and the export check `expected undefined to be type of function`.

- [ ] **Step 3: The implementation**

In `packages/engine/src/delve/hero-stats.ts`, replace:

```ts
  type Chains,
  type ResolvedAbility,
```

with:

```ts
  type Chains,
  type MoveKind,
  type ResolvedAbility,
```

In `packages/engine/src/delve/hero-stats.ts`, replace:

```ts
/**
 * Heuristic DPS / effective-HP estimate against the reference monster, used
```

with:

```ts
/** The expected hit before a move's power: weapon damage × damage multiplier × the crit factor. */
export function expectedHit(stats: HeroStats): number {
  const critFactor = 1 + stats.critChance * (stats.critMultiplier - 1);
  return stats.weaponDamage * stats.damageMult * critFactor;
}

/** One full cycle of an ability chain, as Power values it (the Skills tab's stats and rhythm). */
export interface ChainCycle {
  /** One full cycle's damage: `damagePerUse` at `expectedHit` × moves. */
  damage: number;
  /** One full cycle's seconds: the unbounded `useInterval` × moves. */
  seconds: number;
  /** Mana spent in one cycle: each move's valued cost (0 paid with charge). */
  mana: number;
  /** Each move as valued (a hold at full charge). */
  steps: {
    /** Its wind-up (conjure and channel); a hold's max(holdFull, castTime). */
    cast: number;
    /** `moveBeat` at the hero's tempo. */
    beat: number;
    kind: MoveKind;
    elements: ManaType[];
    hold: boolean;
    /** Its runes repeat it (Echo). */
    echo: boolean;
  }[];
  /** `comboWindow`: the pause after the last beat that starts the chain over. */
  restart: number;
}

/** An ability chain's cycle (never the basic chain's): `chain` is the resolved draft. */
export function chainCycle(
  registry: DataRegistry,
  stats: HeroStats,
  chain: ResolvedChain,
): ChainCycle {
  const bal = registry.getDelveBalance();
  const n = chain.moves.length;
  const moves = chain.moves.map((_, i) => valuedMove(chain, i));
  return {
    damage: damagePerUse(chain, expectedHit(stats), stats, bal) * n,
    seconds: useInterval(bal, chain, stats.tempo, Infinity, Infinity) * n,
    mana: moves.reduce((sum, ab) => sum + ab.cost, 0),
    steps: moves.map((ab) => {
      const hold = ab.kind === 'hold';
      return {
        cast: hold ? Math.max(holdFull(bal, stats.tempo), ab.castTime) : ab.castTime,
        beat: moveBeat(bal, ab, stats.tempo),
        kind: ab.kind,
        elements: ab.elements,
        hold,
        echo: ab.knobs.echo > 0,
      };
    }),
    restart: bal.abilities.comboWindow,
  };
}

/**
 * Heuristic DPS / effective-HP estimate against the reference monster, used
```

In `packages/engine/src/delve/hero-stats.ts`, replace:

```ts
  const critFactor = 1 + stats.critChance * (stats.critMultiplier - 1);
  const hit = stats.weaponDamage * stats.damageMult * critFactor;
  const melee = stats.weapon.kind === 'melee';
```

with:

```ts
  const hit = expectedHit(stats);
  const melee = stats.weapon.kind === 'melee';
```

In `packages/engine/src/index.ts`, replace:

```ts
  basicIncome,
  manaSupport,
} from './delve/hero-stats.js';
```

with:

```ts
  basicIncome,
  manaSupport,
  expectedHit,
  chainCycle,
} from './delve/hero-stats.js';
```

In `packages/engine/src/index.ts`, replace:

```ts
  ManaSupport,
} from './delve/hero-stats.js';
```

with:

```ts
  ManaSupport,
  ChainCycle,
} from './delve/hero-stats.js';
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-cycle.test.ts)`
Expected: PASS (6 tests).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: the typecheck prints nothing; the whole suite passes, 1651 passed | 5 skipped in 84 files + 1 skipped (1645 before). `estimateCombat` is unchanged: its golden numbers (`delve-rune-costs.test.ts`, "v0.51.0's numbers") and the pacing rails (`delve-pacing.test.ts`) still pass.

Run: `(cd packages/engine && npx tsup)`
Expected: "Build success" (the client's bundle now exports `chainCycle`).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: unchanged: 1004 tests in 123 files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/engine/tests/delve-chain-cycle.test.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/index.ts
git add packages/engine/tests/delve-chain-cycle.test.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/index.ts
git commit -m "feat(engine): chainCycle (one full cycle of an ability chain) and expectedHit for the Skills tab" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: `applyLabel` without emoji

Apply's label reads as its `Price` draws it (decided item 27: prices and the Apply label are 2B's): "Apply · 5 Mana Dust · 1 Link · 20 scrap". The Skills Apply bar uses it as Apply's accessible name. `HubFooter`'s draft block shows it too, so `DelveCamp.test.tsx`'s two label assertions follow (see Cross-area needs).

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts`: `applyLabel` in words, numbers as `Price` writes them; `formatNumber` import dropped
- Modify: `packages/client/src/stores/delveStore.test.ts`: the new words, and a test with Mana Dust, Links and a thousands separator
- Modify: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`: the old panel's three label assertions (the panel goes in Task 10)
- Modify: `packages/client/src/pages/__tests__/DelveCamp.test.tsx`: the hub footer's two label assertions

- [ ] **Step 1: The failing test**

In `packages/client/src/stores/delveStore.test.ts`, replace:

```ts
  type DelveProfile,
  type GearItem,
```

with:

```ts
  type DelveProfile,
  type DraftPrice,
  type GearItem,
```

In `packages/client/src/stores/delveStore.test.ts`, replace:

```ts
    expect(applyLabel(registry, null)).toBe('Apply');
  });
```

with:

```ts
    expect(applyLabel(registry, null)).toBe('Apply');
  });

  it("words Apply's total without emoji, as its Price draws it", () => {
    const price: DraftPrice = {
      dust: 5,
      links: 2,
      refundLinks: 0,
      scrap: 1200,
      destroys: [],
      returns: [],
      pouch: {},
    };
    expect(applyLabel(registry, price)).toBe('Apply · 5 Mana Dust · 2 Links · 1,200 scrap');
  });
```

In `packages/client/src/stores/delveStore.test.ts`, replace:

```ts
    expect(applyLabel(registry, view().price)).toBe('Apply · 🔗 +1 · destroys Split I');
```

with:

```ts
    expect(applyLabel(registry, view().price)).toBe('Apply · +1 Link · destroys Split I');
```

In `packages/client/src/stores/delveStore.test.ts`, replace:

```ts
    expect(applyLabel(registry, view().price)).toBe('Apply · 🔗 1 · ⚙ 20');
```

with:

```ts
    expect(applyLabel(registry, view().price)).toBe('Apply · 1 Link · 20 scrap');
```

In `packages/client/src/stores/delveStore.test.ts`, replace:

```ts
    expect(applyLabel(registry, view().price)).toBe('Apply · ⚙ 15');
```

with:

```ts
    expect(applyLabel(registry, view().price)).toBe('Apply · 15 scrap');
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · ✦ 5');
```

with:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · 5 Mana Dust');
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · 🔗 1 · ⚙ 20');
```

with:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · 1 Link · 20 scrap');
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · ⚙ 15');
```

with:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · 15 scrap');
```

In `packages/client/src/pages/__tests__/DelveCamp.test.tsx`, replace:

```tsx
    expect(apply).toHaveTextContent(/Apply · ✦ \d+/);
```

with:

```tsx
    expect(apply).toHaveTextContent(/Apply · \d+ Mana Dust/);
```

In `packages/client/src/pages/__tests__/DelveCamp.test.tsx`, replace:

```tsx
    expect(apply).toHaveTextContent('Apply · 🔗 1 · ⚙ 20');
```

with:

```tsx
    expect(apply).toHaveTextContent('Apply · 1 Link · 20 scrap');
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts src/features/delve/__tests__/AbilitiesPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: FAIL: 9 failed: the store's four label tests (`expected 'Apply · 🔗 1 · ⚙ 20' to be 'Apply · 1 Link · 20 scrap'`…) and the panel's and footer's label assertions.

- [ ] **Step 3: The implementation**

In `packages/client/src/stores/delveStore.ts`, delete the line(s):

```ts
import { formatNumber } from '@/features/delve/format';
```

In `packages/client/src/stores/delveStore.ts`, replace:

```ts
/**
 * Apply's label with the draft's total: "Apply · ✦ 15 · 🔗 2 · ⚙ 40 · destroys Split III". Links
 * are netted (the sockets of moves removed pay for those opened): a refund beyond them reads
 * "🔗 +1".
 */
export function applyLabel(registry: DataRegistry, price: DraftPrice | null): string {
  if (!price) return 'Apply';
  const links = price.links - price.refundLinks;
  return [
    'Apply',
    price.dust > 0 ? `✦ ${price.dust}` : null,
    links !== 0 ? `🔗 ${links > 0 ? links : `+${-links}`}` : null,
    price.scrap > 0 ? `⚙ ${formatNumber(price.scrap)}` : null,
```

with:

```ts
/**
 * Apply's label with the draft's total, in the words its Price draws: "Apply · 15 Mana Dust ·
 * 2 Links · 40 scrap · destroys Split III". Links are netted (the sockets of moves removed pay
 * for those opened): a refund beyond them reads "+1 Link".
 */
export function applyLabel(registry: DataRegistry, price: DraftPrice | null): string {
  if (!price) return 'Apply';
  const links = price.links - price.refundLinks;
  const n = (x: number) => x.toLocaleString('en-US');
  const linkText = (x: number) => `${n(x)} Link${x === 1 ? '' : 's'}`;
  return [
    'Apply',
    price.dust > 0 ? `${n(price.dust)} Mana Dust` : null,
    links !== 0 ? (links > 0 ? linkText(links) : `+${linkText(-links)}`) : null,
    price.scrap > 0 ? `${n(price.scrap)} scrap` : null,
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts src/features/delve/__tests__/AbilitiesPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: PASS (3 files, 85 tests).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1005 tests in 123 files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): Apply's label in words, as its Price draws it (no emoji)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 2: The builder's split

### Task 3: Split `ChainEditor` into `useChainEditor` and its view

The builder's state and every edit move into `useChainEditor(props: ChainEditorProps)` (the same props), returning a `ChainEditorModel` that any view draws: the one-column `ChainEditor` (Training, the stop) and, from Task 7, the Skills panes. `shift` takes any distance (◂ ▸, the mouse drag, the pad's carry) and every edit refuses while locked. `ChainEditor` keeps its markup; its "+ socket" price becomes a `Price` (the old panel's test follows).

**Files:**
- Create: `packages/client/src/features/delve/chains/useChainEditor.ts`: `ChainEditorProps`, `ChainRunes`, `PAYMENTS`, `offPair`, `cardAt`, `ChainEditorModel`, `useChainEditor`
- Create: `packages/client/src/features/delve/chains/__tests__/useChainEditor.test.tsx`: the hook: the chosen skill and move, each edit's map, the guards, the picker
- Overwrite: `packages/client/src/features/delve/chains/ChainEditor.tsx`: the one-column view over `useChainEditor` (re-exports the prop types)
- Modify: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`: "+ socket" priced in words

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/chains/__tests__/useChainEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { computeHeroStats, defaultChains, type Chains, type Move } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { useChainEditor, type ChainEditorProps } from '../useChainEditor';

const registry = getDelveRegistry();
const stats = computeHeroStats({}, registry);
const bolt = (kind: Move['kind']): Move => ({ kind, form: 'bolt', elements: ['fire'] });
const chains: Chains = {
  ...defaultChains(registry, 'fire', null),
  primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
};
const caps = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };

/** The hook over `chains`, controlled: each change is applied to the props it reads. */
function setup(over: Partial<ChainEditorProps> = {}) {
  const onChange = vi.fn();
  const props: ChainEditorProps = { chains, caps, stats, locked: false, onChange, ...over };
  const hook = renderHook((p: ChainEditorProps) => useChainEditor(p), { initialProps: props });
  return { ...hook, onChange };
}

describe('useChainEditor', () => {
  it('starts on the Primary, its first move, resolved and named', () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ skill: 'primary', slot: 'primary', index: 0 });
    expect(result.current.names).toEqual([
      'light Fire Bolt',
      'medium Fire Bolt',
      'heavy Fire Bolt',
    ]);
    expect(result.current.resolved?.moves).toHaveLength(3);
    expect(result.current.support).not.toBeNull();
    act(() => result.current.pick('basic'));
    expect(result.current).toMatchObject({ skill: 'basic', slot: null, resolved: null });
    expect(result.current.support).toBeNull();
  });

  it('reports each edit with where its moves came from', () => {
    const { result, onChange } = setup();
    act(() => result.current.shift(0, 1));
    expect(onChange).toHaveBeenLastCalledWith(
      'primary',
      { moves: [bolt('medium'), bolt('light'), bolt('heavy')], payment: 'mana' },
      [1, 0, 2],
    );
    expect(result.current.index).toBe(1); // the selection follows the move
    act(() => result.current.remove(2));
    expect(onChange.mock.lastCall![2]).toEqual([0, 1]);
    act(() => result.current.add());
    expect(onChange.mock.lastCall![2]).toEqual([0, 1, 2, null]);
    act(() => result.current.setPayment('charge'));
    expect(onChange.mock.lastCall![1].payment).toBe('charge');
  });

  it('never moves past the ends, removes the last move or edits while locked', () => {
    const { result, onChange } = setup();
    act(() => result.current.shift(0, -1));
    expect(onChange).not.toHaveBeenCalled();
    const locked = setup({ locked: true });
    act(() => {
      locked.result.current.shift(0, 1);
      locked.result.current.remove(0);
      locked.result.current.add();
      locked.result.current.edit(bolt('hold'));
    });
    expect(locked.onChange).not.toHaveBeenCalled();
    expect(locked.result.current.index).toBe(0);
    const one = setup({
      chains: { ...chains, primary: { moves: [bolt('light')], payment: 'mana' } },
    });
    act(() => one.result.current.remove(0));
    expect(one.onChange).not.toHaveBeenCalled();
  });

  it("opens a socket's picker on its move, and choosing another move closes it", () => {
    const runed: Chains = {
      ...chains,
      primary: { moves: [{ ...bolt('light'), runes: [null] }, bolt('medium')], payment: 'mana' },
    };
    const runes = {
      pouch: 'any' as const,
      socketCap: 3,
      socketPrice: () => null,
      weaponBaseId: 'sword',
      pullText: () => 'Pull',
    };
    const { result } = setup({ chains: runed, runes });
    expect(result.current.picker).toBeNull();
    act(() => result.current.openPicker(0, 0));
    expect(result.current.socket).toBe(0);
    expect(result.current.picker).toMatchObject({ tierChoice: true, current: null });
    act(() => result.current.select(1));
    expect(result.current.picker).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/chains/__tests__/useChainEditor.test.tsx)`
Expected: FAIL: `Failed to resolve import "../useChainEditor"`.

- [ ] **Step 3: The implementation**

Create `packages/client/src/features/delve/chains/useChainEditor.ts`:

```ts
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  MANA_TYPES,
  manaPool,
  manaSupport,
  resolveChain,
  runeTargetOf,
  socketsOf,
  type AbilityPayment,
  type AbilitySlot,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type HeroStats,
  type ManaSupport,
  type ManaType,
  type Move,
  type ResolvedChain,
  type RunePouch,
  type RuneRef,
} from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { getDelveRegistry } from '../registry';
import type { RunePickerProps } from '../runes/RunePicker';
import { blowText, markIdle, moveText, runeCandidates } from './chain-text';

export interface ChainEditorProps {
  /** Each skill's chain; a skill without one (the weapon doesn't carry it) shows locked. */
  chains: Partial<Chains>;
  /** Most moves each skill's chain may hold (the Delve: the weapon's slots). */
  caps: Partial<Record<ChainSkill, number>>;
  /** The hero the chains resolve against: legendaries, cooldowns, damage, life, attunement, pool. */
  stats: HeroStats;
  /** Read-only (a dive is under way). */
  locked: boolean;
  /** Why it is read-only; the dive's text when absent. */
  lockedText?: string;
  /** Why a skill has no chain (the text its locked tab shows). */
  absentText?: (skill: ChainSkill) => string;
  /** Each chain keeps its moves and payment, only changing them (a stop's one move): no reordering, adding, removing, payment or attunement. */
  fixedShape?: boolean;
  /** Shown under the chosen skill's cards (the Anvil's Add slot). */
  footer?: (skill: ChainSkill) => ReactNode;
  /**
   * A change to one chain, with `map`: for each of its moves, the index in the chain handed in
   * that it came from (◂ ▸ move it, × drops it, + gives null, an edit keeps it).
   */
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S], map: (number | null)[]) => void;
  /** The sockets and runes on each move (the Anvil, the Training Grounds); none without it. */
  runes?: ChainRunes;
  /** The elements an ability's move can take (the Delve: your pair); all six when absent. */
  elements?: readonly ManaType[];
  /** The elements a basic blow can take (your pair); `elements` when absent. */
  blowElements?: readonly ManaType[];
  /** Shown in place of the attunement bars (the Anvil's Mana view). */
  mana?: ReactNode;
}

/** The runes a chain builder offers (see the runes spec, "The client"). */
export interface ChainRunes {
  /** Pouch counts, or 'any' (Training Grounds: every rune, every tier). */
  pouch: RunePouch | 'any';
  /** Most sockets a move may open (the weapon's rarity's; 3 in the Training Grounds). */
  socketCap: number;
  /** The next socket's price when a move has `open`; null: free. */
  socketPrice: (open: number) => { links: number; scrap: number } | null;
  /** The weapon whose blows the basic chain's runes must fit. */
  weaponBaseId: string | null;
  pullText: (rune: RuneRef) => string;
  /** Why "+ socket" on move `index` of `skill` is off (the engine's dry run), or null. */
  openWhy?: (skill: ChainSkill, index: number) => string | null;
}

/** A chain's payments: the label and what it means. */
export const PAYMENTS: [AbilityPayment, string, string][] = [
  ['mana', 'Mana', 'Pay mana, then wait the cooldown.'],
  ['charge', 'Charge', 'No mana: fill a meter by dealing damage (and in lulls), then unleash it.'],
  ['cast', 'Cast', 'Half the mana and 20% more power, but you stand still while it winds up.'],
];

/** Move `from` of `list` to `to` (the others keep their order). */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Whether a move holds an element outside `allowed` (off-pair, in the Delve). */
export function offPair(m: Move | Blow, allowed: readonly ManaType[]): boolean {
  return ('element' in m ? [m.element] : m.elements).some((e) => !allowed.includes(e));
}

/**
 * A new move like `m`, in `allowed` elements only (its own where allowed, else the first
 * allowed), with no sockets: a new move starts at none.
 */
function fitted(m: Move | Blow, allowed: readonly ManaType[]): Move | Blow {
  if ('element' in m)
    return { kind: m.kind, element: allowed.includes(m.element) ? m.element : allowed[0] };
  const kept = m.elements.filter((e) => allowed.includes(e));
  return { kind: m.kind, form: m.form, elements: kept.length > 0 ? kept : [allowed[0]] };
}

/** A selector for move card `n` (its `data-card`). */
export const cardAt = (n: number) => `[data-card="${n}"]`;

/** The chain builder's state and edits, which its views (the one-column editor, the Anvil's panes) draw. */
export interface ChainEditorModel {
  /** The props, with their defaults. */
  locked: boolean;
  lockedText: string;
  fixedShape: boolean;
  /** The chosen skill, and choosing one (its first move picked). */
  skill: ChainSkill;
  pick: (skill: ChainSkill) => void;
  /** The chosen move, and choosing one (only the view changes). */
  index: number;
  select: (i: number) => void;
  slot: AbilitySlot | null;
  chain: Chain | null;
  /** The weapon doesn't carry the chosen skill: no moves. */
  absent: boolean;
  /** The chosen skill's moves (its blows for the basic chain). */
  entries: (Move | Blow)[];
  resolved: ResolvedChain | null;
  /** Each move's name: "light Fire Bolt", "heavy Fire blow". */
  names: string[];
  /** The elements the chosen skill's moves can take. */
  allowed: readonly ManaType[];
  /** A mana or cast chain's spend against the build's refill; null for charge and the basic chain. */
  support: ManaSupport | null;
  /** The weapon's name (the basic chain's cards). */
  weapon: string;
  pool: number;
  move: Move | Blow | undefined;
  /** The chosen move's sockets, the next one's price (undefined at the cap, null when free), and why it can't open. */
  sockets: (RuneRef | null)[];
  nextSocket: { links: number; scrap: number } | null | undefined;
  openWhy: string | null;
  /** Socket indexes of move `i` whose rune does nothing there now. */
  dormant: (i: number) => number[];
  /** The chosen move's socket whose rune picker is open. */
  socket: number | null;
  openPicker: (move: number, socket: number) => void;
  /** The open picker's props (none closed). */
  picker: RunePickerProps | null;
  /** The chosen move replaced, the chain's payment, and the cards' edits. */
  edit: (next: Move | Blow) => void;
  setPayment: (payment: AbilityPayment) => void;
  /** Move `i` by `by` places (◂ ▸, a drag, the pad's carry); the selection and the focus follow it. */
  shift: (i: number, by: number) => void;
  remove: (i: number) => void;
  add: () => void;
  openSocket: () => void;
  /** The cards' container: after an add, a remove or a reorder the focus stays with the move. */
  cardsRef: RefObject<HTMLDivElement | null>;
}

/**
 * The chain builder's state and edits, from today's ChainEditor props: the chosen skill and
 * move, the chain resolved against the hero, its names and mana support, the chosen move's
 * sockets and the rune picker's, and every edit (each reported through `onChange` with the map
 * of where each move came from). See the moves and chains spec, and the runes spec.
 */
export function useChainEditor({
  chains,
  stats,
  locked,
  lockedText = 'A dive is under way: your chains can change once you extract or fall.',
  fixedShape = false,
  onChange,
  elements = MANA_TYPES,
  blowElements = elements,
  runes,
}: ChainEditorProps): ChainEditorModel {
  const registry = getDelveRegistry();
  const [skill, setSkill] = useState<ChainSkill>('primary');
  const [picked, setPicked] = useState(0);
  const cardsRef = useRef<HTMLDivElement>(null);
  // After an add, a remove or a reorder, the focus stays with the move (a controller keeps its
  // place): the first of these selectors that finds an enabled control.
  const [focusOn, setFocusOn] = useState<string[] | null>(null);
  const [socket, setSocket] = useState<number | null>(null);
  const pool = manaPool(stats, registry).max;
  const slot = skill === 'basic' ? null : skill;
  const chain = slot ? (chains[slot] ?? null) : null;
  const absent = !chains[skill];
  const entries: (Move | Blow)[] = chain ? chain.moves : absent ? [] : chains.basic!;
  const index = Math.min(picked, entries.length - 1);
  const resolved = chain && slot ? resolveChain(registry, stats, slot, chain) : null;
  const names = resolved
    ? resolved.moves.map(moveText)
    : entries.map((b) => blowText(registry, b as Blow));
  const allowed = slot ? elements : blowElements;
  // A mana or cast chain's spend a second at its cadence against what the build brings back
  // (the engine's estimate, which Power shares).
  const support =
    resolved && resolved.payment !== 'charge' ? manaSupport(registry, stats, resolved) : null;
  const weapon = stats.weapon.baseId ? registry.getGearBase(stats.weapon.baseId).name : 'Fist';

  // Each move's index in the chain handed in: the map a change reports (an edit keeps them all).
  const order: (number | null)[] = entries.map((_, j) => j);
  const commit = (next: (Move | Blow)[], payment = chain?.payment, map = order) => {
    if (locked) return;
    playSound('buttonClick');
    if (skill === 'basic') onChange('basic', next as Blow[], map);
    else onChange(skill, { moves: next as Move[], payment: payment! } as Chain, map);
  };
  // The sockets of move `i` whose rune does nothing there now: socketed, but missing from the
  // runes the engine resolved it with.
  const dormant = (i: number): number[] => {
    const on = (resolved ? resolved.moves[i]?.runes : stats.weapon.blows[i]?.runes) ?? [];
    return socketsOf(entries[i]).flatMap((r, s) =>
      r && !on.some((a) => a.id === r.id) ? [s] : [],
    );
  };
  const move: Move | Blow | undefined = entries[index];
  const sockets = move ? socketsOf(move) : [];
  const nextSocket =
    runes && sockets.length < runes.socketCap ? runes.socketPrice(sockets.length) : undefined;
  const openWhy =
    runes && nextSocket !== undefined && !locked ? (runes.openWhy?.(skill, index) ?? null) : null;
  const current = socket === null ? null : (sockets[socket] ?? null);
  const setSockets = (next: (RuneRef | null)[]) =>
    commit(entries.map((e, j) => (j === index ? { ...e, runes: next } : e)));

  useEffect(() => {
    const el = focusOn
      ?.map((sel) => cardsRef.current?.querySelector<HTMLButtonElement>(sel))
      .find((e) => e && !e.disabled);
    if (el) {
      el.focus();
      setFocusOn(null);
    }
  }, [focusOn, entries]);

  const picker: RunePickerProps | null =
    runes && move && socket !== null
      ? {
          candidates: markIdle(
            registry,
            stats,
            slot && chain ? { slot, chain, index, socket } : null,
            runeCandidates(
              registry,
              runeTargetOf(runes.weaponBaseId, move),
              sockets.filter((_, k) => k !== socket),
              runes.pouch,
            ),
          ),
          current,
          pullText: current ? runes.pullText(current) : undefined,
          tierChoice: runes.pouch === 'any',
          on: runeTargetOf(runes.weaponBaseId, move),
          dormant: dormant(index).includes(socket),
          payment: chain?.payment,
          ease: resolved?.moves[index]?.ease,
          onPick: (rune) => setSockets(sockets.map((r, k) => (k === socket ? rune : r))),
          onPull: current
            ? () => setSockets(sockets.map((r, k) => (k === socket ? null : r)))
            : undefined,
          onClose: () => setSocket(null),
        }
      : null;

  return {
    locked,
    lockedText,
    fixedShape,
    skill,
    pick: (s) => {
      setSkill(s);
      setPicked(0);
      setSocket(null);
    },
    index,
    select: (i) => {
      if (i !== index) setSocket(null);
      setPicked(i);
    },
    slot,
    chain,
    absent,
    entries,
    resolved,
    names,
    allowed,
    support,
    weapon,
    pool,
    move,
    sockets,
    nextSocket,
    openWhy,
    dormant,
    socket,
    openPicker: (i, s) => {
      setPicked(i);
      setSocket(s);
    },
    picker,
    edit: (next) => commit(entries.map((e, i) => (i === index ? next : e))),
    setPayment: (payment) => chain && commit(chain.moves, payment),
    shift: (i, by) => {
      const to = i + by;
      if (locked || by === 0 || to < 0 || to >= entries.length) return;
      commit(moved(entries, i, to), undefined, moved(order, i, to));
      setPicked(to);
      setFocusOn([`[data-${by < 0 ? 'earlier' : 'later'}="${to}"]`, cardAt(to)]);
    },
    remove: (i) => {
      if (locked || entries.length <= 1) return;
      const next = Math.max(0, i === index ? i - 1 : index > i ? index - 1 : index);
      commit(
        entries.filter((_, j) => j !== i),
        undefined,
        order.filter((j) => j !== i),
      );
      setPicked(next);
      setSocket(null);
      setFocusOn([cardAt(next)]);
    },
    add: () => {
      if (locked) return;
      commit([...entries, fitted(entries[index], allowed)], undefined, [...order, null]);
      setPicked(entries.length);
      setFocusOn([cardAt(entries.length)]);
    },
    openSocket: () => setSockets([...sockets, null]),
    cardsRef,
  };
}
```

Overwrite `packages/client/src/features/delve/chains/ChainEditor.tsx`:

```tsx
import { useId } from 'react';
import { CHAIN_SKILLS, socketsOf, type ChainSkill } from '@alloy/engine';
import { Chip, Price } from '@/features/delve/kit';
import { AttunementBars } from '../items/AttunementBars';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { RunePicker } from '../runes/RunePicker';
import { SocketRow } from '../runes/SocketRow';
import { KIND_ICON, SKILL_NAME, chainText } from './chain-text';
import { MoveEditor } from './MoveEditor';
import { PAYMENTS, offPair, useChainEditor, type ChainEditorProps } from './useChainEditor';

export type { ChainEditorProps, ChainRunes } from './useChainEditor';

const SKILL_KEY: Record<ChainSkill, string | null> = {
  basic: null,
  primary: 'Q',
  defensive: 'E',
  ultimate: 'R',
};

/**
 * The chain builder in one column (the Training Grounds' dock and the stop's "Adjust a move";
 * the Anvil draws the same `useChainEditor` as its Skills panes): each skill (the basic attack,
 * then the Primary, Defensive and Ultimate) is a row of move cards, up to its cap; a skill
 * without a chain shows locked. A card opens its move below: its kind, its form and its
 * elements. ◂ ▸ reorder, × removes (never the last), + adds a copy of the chosen move (in the
 * allowed elements). A move outside them is marked off-pair. With `runes`, each card shows its
 * sockets: a tap opens the rune picker (socket, pull or replace), and "+ socket" opens one on
 * the chosen move. See the moves and chains spec, and the runes spec.
 */
export function ChainEditor(props: ChainEditorProps) {
  const { chains, caps, stats, absentText, footer, mana, runes } = props;
  const ed = useChainEditor(props);
  const { skill, index, entries, names, locked, fixedShape, absent, chain, move, support } = ed;
  const registry = getDelveRegistry();
  const id = useId();
  const spends = Math.round(support?.spend ?? 0);
  const refills = Math.round(support?.refill ?? 0);

  return (
    <div className="flex flex-col gap-3" data-testid="abilities-panel">
      <div className="flex gap-1.5" role="tablist">
        {CHAIN_SKILLS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={skill === s}
            className="delve-panel flex flex-1 flex-col items-center gap-0.5 p-2"
            style={{ borderColor: skill === s ? '#fcd34d' : undefined }}
            onClick={() => ed.pick(s)}
            data-testid={`chain-skill-${s}`}
          >
            <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-stone-400">
              {SKILL_NAME[s]}
              {SKILL_KEY[s] && <span className="hidden sm:inline"> · {SKILL_KEY[s]}</span>}
            </span>
            <span className="text-lg leading-none">
              {s === 'basic'
                ? '⚔️'
                : chains[s]
                  ? registry.getForm(chains[s].moves[0].form).icon
                  : '🔒'}
            </span>
            <span className="text-[11px] font-semibold text-stone-200">
              {chains[s]
                ? `${(s === 'basic' ? chains.basic! : chains[s].moves).length} of ${caps[s]}`
                : 'Locked'}
            </span>
          </button>
        ))}
      </div>

      <div className="text-xs text-stone-400" data-testid="abilities-summary">
        {absent ? `🔒 ${absentText?.(skill) ?? ''}` : chainText(names)}
      </div>

      {locked && !absent && (
        <div
          className="delve-panel p-2 text-center text-xs text-amber-200"
          data-testid="abilities-locked"
        >
          {ed.lockedText}
        </div>
      )}
      {/* Picking a card only changes the view: the cards stay open while the chain is locked. */}
      <div
        ref={ed.cardsRef}
        className="flex flex-wrap items-stretch gap-1.5"
        data-testid="chain-cards"
      >
        {entries.map((e, i) => {
          const els = 'element' in e ? [e.element] : e.elements;
          const off = offPair(e, ed.allowed);
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <button
                type="button"
                data-card={i}
                className="delve-panel flex w-20 flex-col items-center gap-0.5 p-1.5"
                style={{ borderColor: i === index ? '#fcd34d' : undefined }}
                aria-pressed={i === index}
                aria-label={off ? `${names[i]}, off-pair` : names[i]}
                onClick={() => ed.select(i)}
                data-testid={`move-${i}`}
              >
                <span className="text-sm font-bold leading-none text-amber-200/90">
                  {KIND_ICON[e.kind]}
                </span>
                <span className="text-lg leading-none">
                  {'form' in e ? registry.getForm(e.form).icon : '⚔️'}
                </span>
                <span className="text-center text-[10px] font-semibold leading-tight text-stone-200">
                  {'form' in e ? registry.getForm(e.form).name : ed.weapon}
                </span>
                <span className="text-xs leading-none">
                  {els.map((m) => manaStyle(registry, m).icon).join('')}
                </span>
                {off && (
                  <span
                    className="text-[9px] leading-none text-amber-300/80"
                    data-testid="card-off-pair"
                  >
                    off-pair
                  </span>
                )}
              </button>
              <span className="flex gap-0.5" hidden={fixedShape}>
                <button
                  type="button"
                  className="delve-chip px-1.5"
                  disabled={locked || i === 0}
                  aria-label={`Move ${names[i]} earlier`}
                  onClick={() => ed.shift(i, -1)}
                  data-earlier={i}
                  data-testid={`move-left-${i}`}
                >
                  ◂
                </button>
                <button
                  type="button"
                  className="delve-chip px-1.5"
                  disabled={locked || i === entries.length - 1}
                  aria-label={`Move ${names[i]} later`}
                  onClick={() => ed.shift(i, 1)}
                  data-later={i}
                  data-testid={`move-right-${i}`}
                >
                  ▸
                </button>
                <button
                  type="button"
                  className="delve-chip px-1.5"
                  disabled={locked || entries.length === 1}
                  aria-label={`Remove ${names[i]}`}
                  onClick={() => ed.remove(i)}
                  data-testid={`move-remove-${i}`}
                >
                  ×
                </button>
              </span>
              {runes && (
                <div data-testid={`sockets-${i}`}>
                  <SocketRow
                    runes={socketsOf(e)}
                    cap={runes.socketCap}
                    nextPrice={null}
                    dormant={ed.dormant(i)}
                    locked={locked}
                    onSocketTap={(s) => ed.openPicker(i, s)}
                  />
                </div>
              )}
            </div>
          );
        })}
        {!fixedShape && !absent && entries.length < (caps[skill] ?? 0) && (
          <button
            type="button"
            className="delve-panel flex w-20 items-center justify-center p-1.5 text-2xl text-stone-400"
            style={{ opacity: locked ? 0.55 : 1 }}
            disabled={locked}
            aria-label="Add a move"
            onClick={ed.add}
            data-testid="move-add"
          >
            +
          </button>
        )}
        {runes && runes.socketCap > 0 && move && (
          <div
            className="flex w-full flex-wrap items-center gap-2 text-xs text-stone-400"
            data-testid="socket-bar"
          >
            <span data-testid="socket-count">
              Sockets {ed.sockets.length}/{runes.socketCap}
            </span>
            {ed.nextSocket !== undefined && (
              <button
                type="button"
                className="delve-chip"
                disabled={locked || !!ed.openWhy}
                onClick={ed.openSocket}
                aria-describedby={ed.openWhy ? `${id}-socket` : undefined}
                data-testid="socket-open"
              >
                + socket
                {ed.nextSocket && (
                  <>
                    {' · '}
                    <Price links={ed.nextSocket.links} scrap={ed.nextSocket.scrap} />
                  </>
                )}
              </button>
            )}
            {ed.openWhy && (
              <span id={`${id}-socket`} className="text-amber-200/80" data-testid="socket-open-why">
                {ed.openWhy}
              </span>
            )}
          </div>
        )}
      </div>
      {support && (
        <div
          className={`text-xs ${spends > refills ? 'text-amber-200/90' : 'text-stone-400'}`}
          data-testid="mana-support"
        >
          Spends {spends}/s · your build refills {refills}/s
        </div>
      )}
      {!absent && footer?.(skill)}

      <fieldset
        hidden={absent}
        disabled={locked}
        className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
        style={{ opacity: locked ? 0.55 : 1 }}
      >
        {!absent && (
          <MoveEditor
            slot={ed.slot}
            move={entries[index]}
            resolved={ed.resolved?.moves[index] ?? null}
            full={ed.resolved?.hold[index]?.[2] ?? null}
            blow={ed.slot ? null : stats.weapon.blows[index]}
            stats={stats}
            pool={ed.pool}
            elements={ed.allowed}
            onChange={ed.edit}
          />
        )}

        {chain && !fixedShape && (
          <section className="flex flex-col gap-1.5">
            <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
              Pay with
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENTS.map(([p, label]) => (
                <Chip
                  key={p}
                  pressed={chain.payment === p}
                  onClick={() => ed.setPayment(p)}
                  testId={`payment-${p}`}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <div className="text-[11px] text-stone-500">
              {PAYMENTS.find(([p]) => p === chain.payment)![2]} One payment for every move.
            </div>
          </section>
        )}
      </fieldset>

      {!fixedShape &&
        (mana ?? (
          <section className="flex flex-col gap-1.5">
            <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
              Attunement
            </div>
            <AttunementBars stats={stats} />
          </section>
        ))}

      {ed.picker && <RunePicker {...ed.picker} />}
    </div>
  );
}
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, replace:

```tsx
    expect(open).toHaveTextContent('+ socket · 🔗 1 · ⚙ 20');
```

with:

```tsx
    expect(open).toHaveTextContent('+ socket · 1 Link · 20 scrap');
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/client && npx vitest run src/features/delve/chains/__tests__/useChainEditor.test.tsx)`
Expected: PASS (4 tests).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1009 tests in 124 files pass (the old panel's, the Training panel's and the stop's builder tests unchanged); the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/client/src/features/delve/chains/useChainEditor.ts packages/client/src/features/delve/chains/__tests__/useChainEditor.test.tsx packages/client/src/features/delve/chains/ChainEditor.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx
git add packages/client/src/features/delve/chains/useChainEditor.ts packages/client/src/features/delve/chains/__tests__/useChainEditor.test.tsx packages/client/src/features/delve/chains/ChainEditor.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx
git commit -m "refactor(client): useChainEditor holds the chain builder; ChainEditor is its one-column view" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 3: The rune picker and the sockets

### Task 4: `RunePicker` gains `variant: 'sheet' | 'inline'`

The Skills inspector draws the picker inline, in place of the move's numbers, as its own pad scope with a Back (decided item 39); the sheet stays the default for Training and the stop until 3b, and now portals into the kit's `uiLayer()` (the coordinator's Phase 1 note: the topmost scope is decided by DOM order, and the dialog layer sits after the screen). Its text goes to 14 px at the least, since both now sit under the UI zoom.

**Files:**
- Overwrite: `packages/client/src/features/delve/runes/RunePicker.tsx`: `variant`; one body for both; the sheet in `uiLayer()`; text at 14 px and up
- Modify: `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx`: the sheet in the UI layer; the inline variant in place, its own scope

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx`, replace:

```tsx
  it('a filled socket shows its rune with Pull, dormant with its reason, then the runes to replace it', () => {
```

with:

```tsx
  it("the sheet sits in the kit's UI layer, over the screen", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Socket 1' }));
    expect(screen.getByTestId('rune-picker').parentElement).toBe(
      document.getElementById('delve-ui-layer'),
    );
  });

  it('inline, it is drawn in place as its own pad scope: Back has the focus, Escape closes it', () => {
    const onClose = vi.fn();
    const { container } = render(
      <RunePicker
        variant="inline"
        candidates={[{ rune: { id: 'split', tier: 1 }, count: 2 }]}
        onPick={() => {}}
        onClose={onClose}
      />,
    );
    const picker = screen.getByTestId('rune-picker');
    expect(container).toContainElement(picker);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Socket a rune' })).toBe(picker);
    expect(picker).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Split I ×2' })).toBeInTheDocument();
    fireEvent.keyDown(picker, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('a filled socket shows its rune with Pull, dormant with its reason, then the runes to replace it', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/RunePicker.test.tsx)`
Expected: FAIL: 2 failed: the sheet's parent is `<body>`, not `#delve-ui-layer`; the inline picker is a dialog in a portal, so the container doesn't contain it.

- [ ] **Step 3: The implementation**

Overwrite `packages/client/src/features/delve/runes/RunePicker.tsx`:

```tsx
import { useId, useLayoutEffect, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  runeText,
  type AbilityPayment,
  type RunePriceTerms,
  type RuneRef,
  type RuneTarget,
  type RuneTier,
} from '@alloy/engine';
import { uiLayer } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { RuneGlyph } from './RuneGlyph';
import { TIERS, TIER_NUMERAL, dormantText, runeName } from './rune-style';

export interface RunePickerProps {
  /**
   * Runes that fit the move and aren't on it; count null = unlimited (Training Grounds);
   * dormant: it would do nothing in this socket (dimmed, with no price).
   */
  candidates: readonly { rune: RuneRef; count: number | null; dormant?: boolean }[];
  /** A filled socket's rune, shown with Pull. */
  current?: RuneRef | null;
  /** "Pull · destroys it", or "Pull · ⚙ 50, back to your pouch". */
  pullText?: string;
  /** Training Grounds: pick the tier in the picker (I–V chips). */
  tierChoice?: boolean;
  /** The move the socket is on: the texts follow its rules (Multi-shot's cut on a Volley). */
  on?: RuneTarget;
  /** The current rune does nothing on this move now: dimmed, with its reason. */
  dormant?: boolean;
  /** The chain's payment: each price in its words (the basic chain has none). */
  payment?: AbilityPayment;
  /** The move's `ResolvedAbility.ease`: each price eased by it. */
  ease?: number;
  /** A pick, then `onClose`. */
  onPick: (rune: RuneRef) => void;
  /** A pull, then `onClose`. */
  onPull?: () => void;
  onClose: () => void;
  /**
   * 'sheet' (the default: Training and the stop until 3b): a modal over the screen, in the kit's
   * UI layer. 'inline' (the Skills inspector): drawn in place, its own pad scope.
   */
  variant?: 'sheet' | 'inline';
}

// How many pickers are open: an arena under one pauses (`useRunePickerOpen`).
let openPickers = 0;
const pickerListeners = new Set<() => void>();
function countPicker(by: number) {
  openPickers += by;
  pickerListeners.forEach((l) => l());
}
function onPickers(l: () => void) {
  pickerListeners.add(l);
  return () => void pickerListeners.delete(l);
}

/** Whether any rune picker is open (the Training Grounds pause the arena under one). */
export function useRunePickerOpen(): boolean {
  return useSyncExternalStore(onPickers, () => openPickers > 0);
}

/**
 * A rune's effect, its trade-off and its price, as the engine words them at its tier (and on
 * its move, in its chain's payment, eased by the move's ease). A dimmed rune shows no price,
 * and `why` (a dormant candidate's reason) after its words.
 */
function RuneEffect({
  rune,
  on,
  terms,
  dimmed = false,
  why,
  id,
}: {
  rune: RuneRef;
  on?: RuneTarget;
  terms: RunePriceTerms;
  dimmed?: boolean;
  why?: string;
  id?: string;
}) {
  const { effect, tradeoff, cost } = runeText(getDelveRegistry(), rune, on, terms);
  const price = dimmed ? null : cost;
  return (
    <span id={id} className="text-[14px] leading-snug text-stone-400">
      {effect}
      {tradeoff && ' · '}
      {tradeoff && <span className="text-amber-200/80">{tradeoff}</span>}
      {price && ' · '}
      {price && <span className="text-amber-200/80">{price}</span>}
      {why && ' · '}
      {why && <span className="text-amber-200/90">{why}</span>}
    </span>
  );
}

/**
 * A socket's picker: a filled socket's rune with Pull, then the runes that fit
 * the move and aren't on it, each with its effect, trade-off and price at its
 * tier and its count (a rune that would do nothing there dimmed, with no
 * price). The Training Grounds pick the tier here (I–V chips). Its own pad
 * scope either way: Back has the focus and is the pad's back, Escape closes
 * it, and closing it (a pick, a pull or Back) returns the focus to the control
 * that opened it. The sheet is a modal dialog in the kit's UI layer, which its
 * backdrop closes too; inline, it is drawn in place (the Skills inspector).
 */
export function RunePicker({
  candidates,
  current = null,
  pullText,
  tierChoice = false,
  on,
  dormant = false,
  payment,
  ease,
  onPick,
  onPull,
  onClose,
  variant = 'sheet',
}: RunePickerProps) {
  const registry = getDelveRegistry();
  const id = useId();
  // The control that had the focus as the picker first rendered: its opener.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const [tier, setTier] = useState<RuneTier>(1);
  const terms: RunePriceTerms = { payment, ease };
  useLayoutEffect(() => {
    countPicker(1);
    return () => countPicker(-1);
  }, []);
  const close = () => {
    onClose();
    opener?.focus();
  };
  // With a tier choice, one row per rune, at the chosen tier.
  const rows = tierChoice
    ? candidates
        .filter((c, i) => candidates.findIndex((d) => d.rune.id === c.rune.id) === i)
        .map((c) => ({ rune: { id: c.rune.id, tier }, count: c.count, dormant: c.dormant }))
    : candidates;
  const title = current ? runeName(registry, current) : 'Socket a rune';
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="delve-display text-lg font-bold text-amber-200">{title}</span>
        <button
          type="button"
          className="delve-btn px-3 py-1 text-[16px]"
          onClick={close}
          autoFocus
          data-pad-back
          data-testid="rune-picker-close"
        >
          Back
        </button>
      </div>
      {current && (
        <div className="delve-panel flex flex-col gap-1.5 p-2" data-testid="rune-current">
          <div className="flex items-center gap-2">
            <RuneGlyph rune={current} dormant={dormant} />
            <RuneEffect rune={current} on={on} terms={terms} dimmed={dormant} />
          </div>
          {dormant && (
            <span className="text-[14px] text-amber-200/90" data-testid="rune-dormant">
              {dormantText(registry.getRune(current.id))}
            </span>
          )}
          {onPull && (
            <button
              type="button"
              className="delve-btn delve-btn-danger text-[16px]"
              onClick={() => {
                onPull();
                close();
              }}
              data-testid="rune-pull"
            >
              {pullText ?? 'Pull'}
            </button>
          )}
        </div>
      )}
      {tierChoice && (
        <div className="flex flex-wrap gap-1.5">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              className="delve-chip"
              aria-pressed={tier === t}
              aria-label={`Tier ${TIER_NUMERAL[t]}`}
              onClick={() => setTier(t)}
              data-testid={`rune-tier-${t}`}
            >
              {TIER_NUMERAL[t]}
            </button>
          ))}
        </div>
      )}
      {current && rows.length > 0 && (
        <div className="delve-display text-[14px] font-bold uppercase tracking-widest text-amber-300/80">
          Replace with
        </div>
      )}
      {rows.length === 0 && (
        <div className="text-[14px] text-stone-400" data-testid="rune-none">
          {tierChoice ? 'No rune fits this move.' : 'No rune in your pouch fits this move.'}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {rows.map(({ rune, count, dormant: idle }) => {
          const key = `${rune.id}-${rune.tier}`;
          return (
            <button
              key={key}
              type="button"
              className="delve-btn flex flex-col gap-0.5 text-left text-[16px]"
              onClick={() => {
                onPick(rune);
                close();
              }}
              aria-label={`${runeName(registry, rune)}${count === null ? '' : ` ×${count}`}${idle ? ', dormant' : ''}`}
              aria-describedby={`${id}-${key}`}
              data-testid={`rune-pick-${rune.id}`}
            >
              <span className="flex items-center gap-2">
                <RuneGlyph rune={rune} dormant={idle} />
                <span className="flex-1">{runeName(registry, rune)}</span>
                {count !== null && <span className="text-[14px] text-stone-400">×{count}</span>}
              </span>
              <RuneEffect
                rune={rune}
                on={on}
                terms={terms}
                dimmed={idle}
                why={idle ? dormantText(registry.getRune(rune.id)) : undefined}
                id={`${id}-${key}`}
              />
            </button>
          );
        })}
      </div>
    </>
  );
  if (variant === 'inline')
    return (
      <div
        className="flex flex-col gap-3"
        role="group"
        aria-label={title}
        onKeyDown={onKeyDown}
        data-testid="rune-picker"
        data-pad-scope
      >
        {body}
      </div>
    );
  return createPortal(
    <div
      className="delve-sheet-backdrop fixed inset-0 select-none text-white"
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
      data-testid="rune-picker"
      data-pad-scope
    >
      <div
        className="delve-sheet flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {body}
      </div>
    </div>,
    uiLayer(),
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/RunePicker.test.tsx src/pages/__tests__/DelveTraining.test.tsx src/features/delve/__tests__/StopPanel.test.tsx src/features/delve/__tests__/TrainingPanel.test.tsx)`
Expected: PASS (4 files, 39 tests).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1011 tests in 124 files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/client/src/features/delve/runes/RunePicker.tsx packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx
git add packages/client/src/features/delve/runes/RunePicker.tsx packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx
git commit -m "feat(client): RunePicker's inline variant; the sheet portals into the UI layer" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: `SocketRow`: the price as a `Price`, and a reason for an off "+ socket"

"+ socket" draws its price with the kit's `Price` (no emoji), wrapping inside a narrow move card, and takes `whyId`: while set, the button is off and described by that text (the lane shows the engine's reason under the cards). Pips and the button go to 14 px.

**Files:**
- Modify: `packages/client/src/features/delve/runes/SocketRow.tsx`: `Price`, `whyId`, 14 px
- Modify: `packages/client/src/features/delve/runes/__tests__/SocketRow.test.tsx`: the price in words; `whyId`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/runes/__tests__/SocketRow.test.tsx`, replace:

```tsx
toHaveTextContent('+ socket · 🔗 3 · ⚙ 60');
```

with:

```tsx
toHaveTextContent('+ socket · 3 Links · 60 scrap');
```

In `packages/client/src/features/delve/runes/__tests__/SocketRow.test.tsx`, replace:

```tsx
  it('a dormant rune is dimmed and says why', () => {
```

with:

```tsx
  it('"+ socket" is off while `whyId` names the text that says why', () => {
    render(
      <>
        <span id="why">Not enough Links</span>
        <SocketRow runes={[]} cap={1} nextPrice={{ links: 1, scrap: 20 }} whyId="why" />
      </>,
    );
    expect(screen.getByTestId('socket-open')).toBeDisabled();
    expect(screen.getByTestId('socket-open')).toHaveAccessibleDescription('Not enough Links');
  });

  it('a dormant rune is dimmed and says why', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/SocketRow.test.tsx)`
Expected: FAIL: 2 failed: the price reads `🔗 3 · ⚙ 60`, and "+ socket" stays enabled.

- [ ] **Step 3: The implementation**

In `packages/client/src/features/delve/runes/SocketRow.tsx`, replace:

```tsx
import type { RuneRef } from '@alloy/engine';
import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
```

with:

```tsx
import type { RuneRef } from '@alloy/engine';
import { Price } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
```

In `packages/client/src/features/delve/runes/SocketRow.tsx`, replace:

```tsx
  onOpenSocket?: () => void;
  onSocketTap?: (socket: number) => void;
}
```

with:

```tsx
  onOpenSocket?: () => void;
  onSocketTap?: (socket: number) => void;
  /** Why "+ socket" is off: the id of the text that says so (it is disabled while set). */
  whyId?: string;
}
```

In `packages/client/src/features/delve/runes/SocketRow.tsx`, replace:

```tsx
 * "+ socket" with the next one's price while the move is below its cap.
```

with:

```tsx
 * "+ socket" with the next one's price while the move is below its cap (off,
 * and described by it, while `whyId` names a reason).
```

In `packages/client/src/features/delve/runes/SocketRow.tsx`, replace:

```tsx
  onOpenSocket,
  onSocketTap,
}: SocketRowProps) {
```

with:

```tsx
  onOpenSocket,
  onSocketTap,
  whyId,
}: SocketRowProps) {
```

In `packages/client/src/features/delve/runes/SocketRow.tsx`, replace:

```tsx
          <span className="px-1 text-[11px] leading-none text-stone-500">◇</span>
```

with:

```tsx
          <span className="px-1 text-[14px] leading-none text-stone-500">◇</span>
```

In `packages/client/src/features/delve/runes/SocketRow.tsx`, replace:

```tsx
        <button
          type="button"
          className="delve-chip px-1.5 py-0 text-[10px]"
          onClick={onOpenSocket}
          data-testid="socket-open"
        >
          + socket
          {open.links > 0 && ` · 🔗 ${open.links}`}
          {open.scrap > 0 && ` · ⚙ ${formatNumber(open.scrap)}`}
        </button>
```

with:

```tsx
        <button
          type="button"
          className="delve-chip inline-flex flex-wrap items-center justify-center gap-x-1 px-1.5 py-0 text-[14px] [&_.k-price]:flex-wrap"
          disabled={!!whyId}
          aria-describedby={whyId}
          onClick={onOpenSocket}
          data-testid="socket-open"
        >
          + socket
          {(open.links > 0 || open.scrap > 0) && (
            <>
              {' · '}
              <Price
                links={open.links > 0 ? open.links : undefined}
                scrap={open.scrap > 0 ? open.scrap : undefined}
              />
            </>
          )}
        </button>
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/SocketRow.test.tsx)`
Expected: PASS (7 tests).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1012 tests in 124 files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/client/src/features/delve/runes/SocketRow.tsx packages/client/src/features/delve/runes/__tests__/SocketRow.test.tsx
git add packages/client/src/features/delve/runes/SocketRow.tsx packages/client/src/features/delve/runes/__tests__/SocketRow.test.tsx
git commit -m "feat(client): SocketRow prices + socket with Price and says why it is off" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 4: The move's numbers

### Task 6: The move's numbers as a table, and the move's choices shared

The Skills inspector shows a move's numbers as a two-column table (the mockup's Hit, radius, Cost, Beat after; plus today's wind-up, cooldown, stacks and a hold's full charge, so nothing the readout says is lost), each value `num-<id>`. `MoveEditor` exports the pieces both views use: `KIND_HINT`, `moveRows`/`blowRows`, `NumberTable`, `MoveNumbers` (the table, `rune-ease` and `cost-warning`) and `moveChoices` (the off-pair and rune-fit rules). The one-column readout draws the same table, so its tests read the rows.

**Files:**
- Overwrite: `packages/client/src/features/delve/chains/MoveEditor.tsx`: the shared pieces; `Readout` and `BlowReadout` draw `NumberTable`
- Modify: `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`: the pay line is the `num-cost` row
- Modify: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`: the beats, wind-ups and full charges from their rows

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`, replace:

```tsx
  const payLine = () => within(readout()).getByText(/runes:/);
```

with:

```tsx
  const payLine = () => within(readout()).getByTestId('num-cost');
```

In `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`, replace:

```tsx
    expect(payLine()).toHaveTextContent(/^17 mana · [\d.]+s wind-up \(runes: \+107% cost\) · /);
```

with:

```tsx
    expect(payLine()).toHaveTextContent(/^17 mana \(runes: \+107% cost\)$/);
    expect(screen.getByTestId('num-windup')).toHaveTextContent(/^[\d.]+s$/);
```

In `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`, replace:

```tsx
    expect(payLine()).toHaveTextContent(
      /^Charge 6 · [\d.]+s wind-up \(runes: \+107% charge\) · no cooldown/,
    );
```

with:

```tsx
    expect(payLine()).toHaveTextContent(/^Charge 6 \(runes: \+107% charge\)$/);
    expect(screen.getByTestId('num-cooldown')).toHaveTextContent('none');
```

In `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx`, replace:

```tsx
    expect(payLine()).toHaveTextContent(
      /^8 mana · [\d.]+s wind-up \(runes: \+107% cast wind-up, \+107% cost\) · /,
    );
```

with:

```tsx
    expect(payLine()).toHaveTextContent(/^8 mana \(runes: \+107% cast wind-up, \+107% cost\)$/);
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('ability-readout')).toHaveTextContent(/Fully charged .+ \d+ mana/);
    fireEvent.click(screen.getByTestId('payment-charge'));
    expect(screen.getByTestId('ability-readout')).toHaveTextContent(/Fully charged .+ Charge \d+/);
```

with:

```tsx
    expect(screen.getByTestId('num-full')).toHaveTextContent(/\d+ mana/);
    fireEvent.click(screen.getByTestId('payment-charge'));
    expect(screen.getByTestId('num-full')).toHaveTextContent(/Charge \d+/);
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, replace:

```tsx
      expect(screen.getByTestId('ability-readout')).toHaveTextContent(/\d\.\d\ds wind-up/);
```

with:

```tsx
      expect(screen.getByTestId('num-windup')).toHaveTextContent(/^\d\.\d\ds$/);
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, replace:

```tsx
    const readout = () => screen.getByTestId('ability-readout');
    const { unmount } = render(<AbilitiesPanel />);
    // The Primary's first move, a light Bolt, on the starting sword (tempo 1).
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.25s beat/);
    fireEvent.click(screen.getByTestId('kind-hold'));
    // A tap plays as a medium; a full charge as a hold.
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.4s beat/);
    expect(readout()).toHaveTextContent(/Fully charged \(1s\): .+ mana, then a 0\.8s beat/);
```

with:

```tsx
    const num = (id: string) => screen.getByTestId(`num-${id}`);
    const { unmount } = render(<AbilitiesPanel />);
    // The Primary's first move, a light Bolt, on the starting sword (tempo 1).
    expect(num('beat')).toHaveTextContent(/^0\.25s$/);
    fireEvent.click(screen.getByTestId('kind-hold'));
    // A tap plays as a medium; a full charge as a hold.
    expect(num('beat')).toHaveTextContent(/^0\.4s$/);
    expect(num('full')).toHaveTextContent(/^1s: .+ mana, then a 0\.8s beat$/);
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, replace:

```tsx
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.33s beat/);
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.52s beat/);
    expect(readout()).toHaveTextContent(/Fully charged \(1\.3s\): .+ mana, then a 1\.04s beat/);
```

with:

```tsx
    expect(num('beat')).toHaveTextContent(/^0\.33s$/);
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(num('beat')).toHaveTextContent(/^0\.52s$/);
    expect(num('full')).toHaveTextContent(/^1\.3s: .+ mana, then a 1\.04s beat$/);
```

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, replace:

```tsx
    const beat = () =>
      Number(/then a ([\d.]+)s beat/.exec(screen.getByTestId('ability-readout').textContent!)![1]);
```

with:

```tsx
    const beat = () => parseFloat(screen.getByTestId('num-beat').textContent!);
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/chains/__tests__/rune-costs.test.tsx src/features/delve/__tests__/AbilitiesPanel.test.tsx)`
Expected: FAIL: 5 failed: `Unable to find an element by: [data-testid="num-cost"]` (and `num-full`, `num-beat`).

- [ ] **Step 3: The implementation**

Overwrite `packages/client/src/features/delve/chains/MoveEditor.tsx`:

```tsx
import {
  MOVE_KINDS,
  blowNumbers,
  holdFull,
  loadText,
  moveBeat,
  moveNumbers,
  takesElements,
  type AbilitySlot,
  type Blow,
  type HeroBlow,
  type HeroStats,
  type ManaType,
  type Move,
  type MoveKind,
  type ResolvedAbility,
  runeFits,
  socketsOf,
  type FormId,
} from '@alloy/engine';
import { Chip } from '@/features/delve/kit';
import { formatNumber, manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { KIND_ICON, KIND_LABEL, listed } from './chain-text';

/** What each kind means, under its choice. */
export const KIND_HINT: Record<MoveKind, string> = {
  light: 'Quick and cheap.',
  medium: 'Balanced.',
  heavy: 'Harder and bigger, but dearer and slower.',
  hold: 'Hold the button to charge it, then let go: a tap is a medium hit, a full charge beyond heavy.',
};

function Heading({ children }: { children: string }) {
  return (
    <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
      {children}
    </div>
  );
}

/** Seconds as the readout says them: 0.4s, 1.04s. */
const secs = (s: number) => `${+s.toFixed(2)}s`;

/** One line of a move's numbers: "Beat after · 0.25s". */
export interface NumberRow {
  id: string;
  label: string;
  value: string;
}

/**
 * A resolved move's numbers (at its place in the chain), from the engine's `moveNumbers` and
 * `moveBeat`: what it does, its price (with its runes' share, eased by the move's attunement,
 * which `ease` says), its wind-up, cooldown and beat, its stacks, and a hold's full charge.
 * `warning`: a mana cost the pool can't hold.
 */
export function moveRows(
  ab: ResolvedAbility,
  full: ResolvedAbility | null,
  stats: HeroStats,
  pool: number,
): { rows: NumberRow[]; ease: string | null; warning: string | null } {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance();
  // The engine's numbers: the hit it deals (a Ward's burst and an Armor's strike-back without
  // the step bonus), and the radius it uses.
  const { hit, radius } = moveNumbers(stats, bal, ab);
  const rows: NumberRow[] = [];
  const row = (id: string, label: string, value: string) => rows.push({ id, label, value });
  const f = ab.form.id;
  if (f === 'ward') {
    row('absorbs', 'Absorbs', `${formatNumber(stats.maxHp * ab.effect)} for ${ab.duration}s`);
    row('hit', 'Bursts for', formatNumber(hit));
  } else if (f === 'armor') {
    row(
      'reduction',
      'Less damage',
      `${Math.round(Math.min(0.75, ab.effect) * 100)}% for ${ab.duration}s`,
    );
    row('hit', 'Strikes back', formatNumber(hit));
  } else if (f === 'surge')
    row('speed', 'Attack speed', `+${Math.round(ab.effect * 100)}% for ${ab.duration}s`);
  else if (f === 'blink') {
    row('blink', 'Blink', `${ab.range} units, untouchable ${ab.effect.toFixed(2)}s`);
    row('hit', 'Trail hits for', formatNumber(hit));
  } else if (f === 'barrage') row('hit', 'Hit', `${ab.count} × ${formatNumber(hit)}`);
  else if (f === 'maelstrom')
    row('hit', 'Hit', `${formatNumber(hit)} every ${ab.tick}s for ${ab.duration}s`);
  else {
    row('hit', 'Hit', formatNumber(hit));
    if (radius > 0 && f !== 'strike') row('radius', 'Radius', radius.toFixed(1));
  }
  // The runes' share of the price, eased, in the payment's words (see the rune costs spec).
  const runed = ab.load > 0 ? ` (runes: ${loadText(registry, ab.load, ab.payment)})` : '';
  const charge = ab.payment === 'charge';
  row(
    'cost',
    'Cost',
    charge ? `Charge ${Math.round(ab.chargeNeed)}${runed}` : `${Math.round(ab.cost)} mana${runed}`,
  );
  if (ab.castTime > 0) row('windup', 'Wind-up', `${ab.castTime.toFixed(2)}s`);
  row('cooldown', 'Cooldown', charge ? 'none' : `${ab.cooldown.toFixed(ab.cooldown < 2 ? 2 : 0)}s`);
  row('beat', 'Beat after', secs(moveBeat(bal, ab, stats.tempo)));
  row('stacks', 'Stacks', `${ab.stacks} a hit`);
  if (full)
    row(
      'full',
      'Full charge',
      `${secs(holdFull(bal, stats.tempo))}: hits for ${formatNumber(moveNumbers(stats, bal, full).hit)}, ${full.payment === 'charge' ? `Charge ${Math.round(full.chargeNeed)}` : `${Math.round(full.cost)} mana`}, then a ${secs(moveBeat(bal, full, stats.tempo))} beat`,
    );
  // How much the move's attunement takes off its runes' load, and whether that is the cap.
  const ease =
    ab.load > 0 && ab.ease > 0
      ? `Attunement eases rune cost by ${Math.round(ab.ease * 100)}%${ab.ease >= bal.runes.load.easeCap ? ' (the most it can)' : ''}`
      : null;
  // A mana cost the pool can't hold: the move's, else a hold's full charge (the engine would
  // let go at the highest stage the pool pays).
  const holds = `your pool holds ${Math.round(pool)}.`;
  const warning =
    ab.cost > pool
      ? `Needs ${Math.round(ab.cost)} mana; ${holds}`
      : full && full.cost > pool
        ? `A full charge needs ${Math.round(full.cost)} mana; ${holds}`
        : null;
  return { rows, ease, warning };
}

/** A basic blow's numbers: its hit and its stacks (the engine's), and its time. */
export function blowRows(blow: HeroBlow, stats: HeroStats): NumberRow[] {
  const { hit, stacks } = blowNumbers(stats, getDelveRegistry().getDelveBalance(), blow);
  return [
    { id: 'hit', label: 'Hit', value: formatNumber(hit) },
    { id: 'time', label: 'Time', value: `${(stats.attackInterval * blow.time).toFixed(2)}s` },
    { id: 'stacks', label: 'Stacks', value: `${stacks} a hit` },
  ];
}

/** Numbers as a two-column table, each value `num-<id>`. */
export function NumberTable({ rows }: { rows: readonly NumberRow[] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
      {rows.map((r) => (
        <div key={r.id} className="contents">
          <dt className="text-[var(--k-text-3)]">{r.label}</dt>
          <dd className="m-0 text-right font-semibold" data-testid={`num-${r.id}`}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A resolved move's numbers table, the attunement's easing and the pool warning. */
export function MoveNumbers(props: {
  ab: ResolvedAbility;
  full: ResolvedAbility | null;
  stats: HeroStats;
  pool: number;
}) {
  const { rows, ease, warning } = moveRows(props.ab, props.full, props.stats, props.pool);
  return (
    <>
      <NumberTable rows={rows} />
      {ease && (
        <div className="text-[14px] text-[var(--k-text-2)]" data-testid="rune-ease">
          {ease}
        </div>
      )}
      {warning && (
        <div
          className="text-[14px] font-semibold text-[var(--k-bad-text)]"
          data-testid="cost-warning"
        >
          {warning}
        </div>
      )}
    </>
  );
}

/** The resolved move's name and numbers (the one-column builder's readout). */
function Readout(props: {
  ab: ResolvedAbility;
  full: ResolvedAbility | null;
  stats: HeroStats;
  pool: number;
}) {
  const registry = getDelveRegistry();
  const { ab } = props;
  return (
    <div className="delve-panel flex flex-col gap-1 p-3 text-sm" data-testid="ability-readout">
      <div
        className="delve-display text-lg font-bold"
        style={{ color: manaStyle(registry, ab.element).color }}
      >
        {ab.icon} {KIND_LABEL[ab.kind]} {ab.name}
      </div>
      <MoveNumbers {...props} />
    </div>
  );
}

/** A basic blow's name and numbers. */
function BlowReadout({ blow, stats }: { blow: HeroBlow; stats: HeroStats }) {
  const registry = getDelveRegistry();
  return (
    <div className="delve-panel flex flex-col gap-1 p-3 text-sm" data-testid="ability-readout">
      <div
        className="delve-display text-lg font-bold"
        style={{ color: manaStyle(registry, blow.element).color }}
      >
        {KIND_LABEL[blow.kind]} {manaStyle(registry, blow.element).name} blow
      </div>
      <NumberTable rows={blowRows(blow, stats)} />
    </div>
  );
}

/**
 * What a move may become: its own elements, those outside `elements` (off-pair: a drop's, kept,
 * which no other move can take), the elements to offer (the allowed, then its off-pair ones),
 * whether it may take an element set (never a new off-pair one: the engine refuses it), and the
 * socketed runes a form doesn't fit (the engine refuses that form: pull them to pick it).
 */
export function moveChoices(
  move: Move | Blow,
  slot: AbilitySlot | null,
  elements: readonly ManaType[],
): {
  own: ManaType[];
  off: ManaType[];
  shown: ManaType[];
  takes: (els: readonly ManaType[]) => boolean;
  misfits: (form: FormId) => string[];
  blocking: string[];
} {
  const registry = getDelveRegistry();
  const own = 'element' in move ? [move.element] : move.elements;
  const off = own.filter((m) => !elements.includes(m));
  const misfits = (form: FormId): string[] =>
    socketsOf(move).flatMap((r) => {
      const def = r ? registry.findRune(r.id) : undefined;
      return def && !runeFits(def, { form }) ? [def.name] : [];
    });
  return {
    own,
    off,
    shown: [...elements, ...off],
    takes: (els) => takesElements(elements, own, els),
    misfits,
    blocking: [
      ...new Set(
        registry
          .getArpgData()
          .forms.filter((f) => f.slot === slot)
          .flatMap((f) => misfits(f.id)),
      ),
    ],
  };
}

export interface MoveEditorProps {
  /** The ability slot the move belongs to, or null for a basic blow. */
  slot: AbilitySlot | null;
  move: Move | Blow;
  /** The move resolved at its place in the chain (a hold at stage 0), and a hold's full charge. */
  resolved: ResolvedAbility | null;
  full: ResolvedAbility | null;
  /** A blow as the hero swings it. */
  blow: HeroBlow | null;
  stats: HeroStats;
  pool: number;
  /** The elements it can take; one it holds outside them shows marked off-pair. */
  elements: readonly ManaType[];
  onChange: (next: Move | Blow) => void;
}

/** An element chip's label, marked when the element is off-pair. */
function ElementLabel({ mana, off }: { mana: ManaType; off: boolean }) {
  const st = manaStyle(getDelveRegistry(), mana);
  return (
    <>
      {st.icon} {st.name}
      {off && <span className="text-amber-300/80"> · off-pair</span>}
    </>
  );
}

/**
 * One move of a chain: its kind, its form (none for a blow), its element(s),
 * and its readout. An element it holds outside `elements` (a drop's, kept
 * from off the pair) shows as a marked chip: it still casts and reacts, but
 * draws no attunement, and no other move can take it.
 */
export function MoveEditor({
  slot,
  move,
  resolved,
  full,
  blow,
  stats,
  pool,
  elements,
  onChange,
}: MoveEditorProps) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const set = (next: Partial<Move>) => onChange({ ...move, ...next } as Move | Blow);
  const trait = (m: ManaType) => data.elementTraits[m];
  const { off, shown, takes, misfits, blocking } = moveChoices(move, slot, elements);

  return (
    <div className="flex flex-col gap-3" data-testid="move-editor">
      <section className="flex flex-col gap-1.5">
        <Heading>Kind</Heading>
        <div className="flex flex-wrap gap-1.5">
          {MOVE_KINDS.map((k) => (
            <Chip
              key={k}
              pressed={move.kind === k}
              onClick={() => set({ kind: k })}
              testId={`kind-${k}`}
            >
              <span aria-hidden>{KIND_ICON[k]}</span> {KIND_LABEL[k]}
            </Chip>
          ))}
        </div>
        <div className="text-[11px] text-stone-500">
          {'form' in move
            ? KIND_HINT[move.kind]
            : move.kind === 'hold' &&
              'Hold the attack to charge it; automatic attacks swing it slow and hard.'}
        </div>
      </section>

      {'element' in move ? (
        <section className="flex flex-col gap-1.5">
          <Heading>Element</Heading>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((m) => (
              <Chip
                key={m}
                pressed={move.element === m}
                onClick={() => onChange({ ...move, element: m })}
                testId={`element-${m}`}
                disabled={!takes([m])}
              >
                <ElementLabel mana={m} off={off.includes(m)} />
              </Chip>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-1.5">
            <Heading>Form</Heading>
            <div className="flex flex-wrap gap-1.5">
              {data.forms
                .filter((f) => f.slot === slot)
                .map((f) => {
                  const out = f.id === move.form ? [] : misfits(f.id);
                  return (
                    <Chip
                      key={f.id}
                      pressed={move.form === f.id}
                      onClick={() => set({ form: f.id })}
                      testId={`form-${f.id}`}
                      disabled={out.length > 0}
                      title={out.length > 0 ? `${listed(out)} doesn't fit a ${f.name}` : undefined}
                    >
                      {f.icon} {f.name}
                    </Chip>
                  );
                })}
            </div>
            {blocking.length > 0 && (
              <div className="text-[11px] text-amber-200/90" data-testid="form-rune-note">
                {listed(blocking)} {blocking.length > 1 ? "don't" : "doesn't"} fit every form: pull{' '}
                {blocking.length > 1 ? 'them' : 'it'} to pick another.
              </div>
            )}
            <div className="text-xs text-stone-400">{registry.getForm(move.form).text}</div>
          </section>

          <section className="flex flex-col gap-1.5">
            <Heading>Element</Heading>
            <div className="flex flex-wrap gap-1.5">
              {shown.map((m) => {
                const [main, infusion] = move.elements;
                const els = infusion && infusion !== m ? [m, infusion] : [m];
                return (
                  <Chip
                    key={m}
                    pressed={main === m}
                    onClick={() => set({ elements: els })}
                    testId={`element-${m}`}
                    title={trait(m).text}
                    disabled={!takes(els)}
                  >
                    <ElementLabel mana={m} off={off.includes(m)} />
                  </Chip>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-stone-500">Infuse with</span>
              <Chip
                pressed={move.elements.length === 1}
                onClick={() => set({ elements: [move.elements[0]] })}
                testId="infusion-none"
                disabled={!takes([move.elements[0]])}
              >
                None
              </Chip>
              {shown
                .filter((m) => m !== move.elements[0])
                .map((m) => (
                  <Chip
                    key={m}
                    pressed={move.elements[1] === m}
                    onClick={() => set({ elements: [move.elements[0], m] })}
                    testId={`infusion-${m}`}
                    disabled={!takes([move.elements[0], m])}
                  >
                    {manaStyle(registry, m).icon}
                  </Chip>
                ))}
              {move.elements.length > 1 && (
                <button
                  type="button"
                  className="delve-chip"
                  onClick={() => set({ elements: [move.elements[1], move.elements[0]] })}
                  aria-label="Swap the main element and the infusion"
                  data-testid="swap-elements"
                >
                  ⇄
                </button>
              )}
            </div>
            <div className="text-xs text-stone-400" data-testid="element-effect">
              {resolved?.fusion ? (
                <>
                  <b className="text-stone-200">
                    {resolved.fusion.icon} {resolved.fusion.name}:
                  </b>{' '}
                  {resolved.fusion.text} {manaStyle(registry, move.elements[0]).name} sets the
                  damage type.
                </>
              ) : slot === 'defensive' ? (
                trait(move.elements[0]).defensive
              ) : (
                trait(move.elements[0]).text
              )}
            </div>
          </section>
        </>
      )}

      {off.length > 0 && (
        <div className="text-[11px] text-amber-200/90" data-testid="off-pair-note">
          {off.map((m) => manaStyle(registry, m).name).join(' and ')} off-pair: no attunement. Keep
          it, or pick from your two elements.
        </div>
      )}
      {resolved && <Readout ab={resolved} full={full} stats={stats} pool={pool} />}
      {blow && <BlowReadout blow={blow} stats={stats} />}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/client && npx vitest run src/features/delve/chains/__tests__/rune-costs.test.tsx src/features/delve/__tests__/AbilitiesPanel.test.tsx)`
Expected: PASS (2 files, 46 tests).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1012 tests in 124 files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/client/src/features/delve/chains/MoveEditor.tsx packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx
git add packages/client/src/features/delve/chains/MoveEditor.tsx packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx
git commit -m "feat(client): a move's numbers as a table; MoveEditor shares its pieces" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 5: The skill list and the chain lane

### Task 7: The skill list and the chain lane

`useAnvilChains` is the old panel's binding to the store's draft (the chains shown, the slots, the hero's stats, the runes, the next slot's offer), as `useChainEditor`'s props. `SkillList` draws the four skills as a vertical sub tab list (`chain-skill-<s>`, `data-pad-tabs="sub"`, so the pad's LT RT step it) with the input glyph, payment, five slot dots and the chain's names (`abilities-summary` on the chosen row), then the mana pair box. `ChainLane` draws the chain: its header (`chain-slots`, the payment), the move cards (`move-<i>`, socket pips with "+ socket" on the chosen card, the chosen card's ◂ ▸ × toolbar, the mouse drag converted with `layerZoom`), "+ Move" (`move-add`) or "+ Slot" (`add-slot`) with its `Price`, and for an ability chain `ChainStats` and `RhythmStrip` from `chainCycle`.

**Files:**
- Modify: `packages/client/src/features/delve/chains/chain-text.ts`: `KIND_NAME` ("Light", "Hold")
- Create: `packages/client/src/features/delve/hub/skills/useAnvilChains.ts`: the Anvil's binding: `editor` props, `weapon`, `changed`, `slotOffer`, `buySlot`
- Create: `packages/client/src/features/delve/hub/skills/SkillList.tsx`: `SkillList`, `skillBinding`, the mana pair box
- Create: `packages/client/src/features/delve/hub/skills/ChainLane.tsx`: `ChainLane`, `dropIndex`, `ChainStats`, `RhythmStrip`
- Create: `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`: `Panes`: the panes over any chains, for the tests
- Create: `packages/client/src/features/delve/hub/skills/__tests__/ChainLane.test.tsx`: the stats and rhythm from `chainCycle`, the basic chain, the toolbar, the drag

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`:

```tsx
import { useChainEditor, type ChainEditorProps } from '../../../chains/useChainEditor';
import { ChainLane } from '../ChainLane';
import { SkillList } from '../SkillList';
import type { AnvilChains } from '../useAnvilChains';

/** The Skills panes over any chains (no store draft, nothing to buy), as the Anvil draws them. */
export function Panes(props: ChainEditorProps) {
  const ed = useChainEditor(props);
  const anvil: AnvilChains = {
    editor: props,
    weapon: null,
    changed: {},
    slotOffer: () => ({ price: null, why: null }),
    buySlot: () => {},
  };
  return (
    <>
      <SkillList ed={ed} anvil={anvil} onMana={() => {}} />
      <ChainLane ed={ed} anvil={anvil} carrying={false} />
    </>
  );
}
```

Create `packages/client/src/features/delve/hub/skills/__tests__/ChainLane.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  chainCycle,
  computeHeroStats,
  defaultChains,
  resolveChain,
  type Chains,
  type Move,
} from '@alloy/engine';
import { formatNumber } from '../../../format';
import { getDelveRegistry } from '../../../registry';
import { dropIndex } from '../ChainLane';
import { Panes } from './harness';

const registry = getDelveRegistry();
const stats = computeHeroStats({}, registry, { attunement: { fire: 5 } });
const bolt = (over: Partial<Move> = {}): Move => ({
  kind: 'medium',
  form: 'bolt',
  elements: ['fire'],
  ...over,
});
/** A light Bolt, then a held one its Echo repeats. */
const primary = {
  moves: [
    bolt({ kind: 'light' }),
    bolt({ kind: 'hold', runes: [{ id: 'echo', tier: 3 as const }] }),
  ],
  payment: 'mana' as const,
};
const chains: Chains = { ...defaultChains(registry, 'fire', null), primary };
const caps = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
const panes = (onChange = vi.fn()) =>
  render(<Panes chains={chains} caps={caps} stats={stats} locked={false} onChange={onChange} />);

describe('ChainLane', () => {
  it("shows the chain's cycle from chainCycle: damage, seconds, mana, and the support", () => {
    panes();
    const cycle = chainCycle(registry, stats, resolveChain(registry, stats, 'primary', primary));
    expect(screen.getByTestId('stat-damage')).toHaveTextContent(formatNumber(cycle.damage));
    expect(screen.getByTestId('stat-cycle')).toHaveTextContent(`${cycle.seconds.toFixed(1)} s`);
    expect(screen.getByTestId('stat-mana')).toHaveTextContent(String(Math.round(cycle.mana)));
    expect(screen.getByTestId('mana-support')).toHaveTextContent(
      /^Spends \d+\/s · your build refills \d+\/s$/,
    );
  });

  it('draws the rhythm: a block per move, a hold hatched, an echo ghost, a line per beat, the pause', () => {
    panes();
    const strip = within(screen.getByTestId('rhythm-strip'));
    expect(strip.getByTestId('rhythm-step-0')).not.toHaveAttribute('data-hold');
    expect(strip.getByTestId('rhythm-step-1')).toHaveAttribute('data-hold');
    expect(strip.queryByTestId('rhythm-echo-0')).toBeNull();
    expect(strip.getByTestId('rhythm-echo-1')).toBeInTheDocument();
    expect(strip.getAllByTestId(/^rhythm-beat-/)).toHaveLength(2);
    const restart = registry.getDelveBalance().abilities.comboWindow;
    expect(screen.getByTestId('rhythm-strip')).toHaveTextContent(
      `pause ${restart.toFixed(1)} s restarts`,
    );
  });

  it('the basic chain shows its blows, with no stats or rhythm', () => {
    panes();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(3);
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 5 slots');
    expect(screen.queryByTestId('chain-stats')).toBeNull();
    expect(screen.queryByTestId('rhythm-strip')).toBeNull();
  });

  it('the chosen card alone carries the ◂ ▸ × toolbar', () => {
    panes();
    expect(screen.getByTestId('move-right-0')).toBeEnabled();
    expect(screen.queryByTestId('move-right-1')).toBeNull();
    fireEvent.click(screen.getByTestId('move-1'));
    expect(screen.queryByTestId('move-right-0')).toBeNull();
    expect(screen.getByTestId('move-left-1')).toBeEnabled();
  });

  it('a mouse drag moves a card by its travel over the spacing of the cards', () => {
    const onChange = vi.fn();
    const three: Chains = {
      ...chains,
      primary: {
        moves: [bolt({ kind: 'light' }), bolt(), bolt({ kind: 'heavy' })],
        payment: 'mana',
      },
    };
    render(<Panes chains={three} caps={caps} stats={stats} locked={false} onChange={onChange} />);
    // Each card's column 100 px after the last.
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const n = Number(this.querySelector('[data-card]')?.getAttribute('data-card') ?? 0);
        return DOMRect.fromRect({ x: n * 100, y: 0, width: 90, height: 50 });
      });
    const card = screen.getByTestId('move-0');
    fireEvent.pointerDown(card, { pointerType: 'mouse', button: 0, clientX: 0 });
    fireEvent.pointerMove(card, { pointerType: 'mouse', clientX: 210 });
    fireEvent.pointerUp(card, { pointerType: 'mouse', clientX: 210 });
    fireEvent.click(card); // the click that ends a drag picks nothing
    box.mockRestore();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith('primary', expect.anything(), [1, 2, 0]);
  });

  it('a dragged card lands where it is let go, a place a card-and-gap apart', () => {
    expect(dropIndex(0, 210, 100, 4)).toBe(2);
    expect(dropIndex(1, 40, 100, 4)).toBe(1);
    expect(dropIndex(2, -1000, 100, 4)).toBe(0);
    expect(dropIndex(1, 1000, 100, 4)).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/ChainLane.test.tsx)`
Expected: FAIL: `Failed to resolve import "../ChainLane"`.

- [ ] **Step 3: The implementation**

In `packages/client/src/features/delve/chains/chain-text.ts`, replace:

```ts
/** A move's kind at a glance (the builder's cards, the HUD's buttons). */
```

with:

```ts
/** A move's kind as its choice says it: "Light", "Hold". */
export const KIND_NAME: Record<MoveKind, string> = {
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  hold: 'Hold',
};

/** A move's kind at a glance (the builder's cards, the HUD's buttons). */
```

Create `packages/client/src/features/delve/hub/skills/useAnvilChains.ts`:

```ts
import { useMemo } from 'react';
import {
  CHAIN_SKILLS,
  addSlot,
  baseSlots,
  carriedByText,
  heroChains,
  isDiveActive,
  movesOf,
  movesetOf,
  pairElements,
  profileStats,
  setChains,
  slotPrice,
  socketCap,
  socketPrice,
  socketsOf,
  unsocketMode,
  withMove,
  type ChainSkill,
  type Chains,
  type GearItem,
} from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { getDelveRegistry } from '../../registry';
import type { ChainEditorProps, ChainRunes } from '../../chains/ChainEditor';

/** The Anvil's chain builder: its props, and the slots the equipped weapon sells. */
export interface AnvilChains {
  /** `useChainEditor`'s props, bound to the store's draft of the weapon's moveset. */
  editor: ChainEditorProps;
  weapon: GearItem | null;
  /** The skills the draft changes. */
  changed: Partial<Chains>;
  /** A chain's next slot: its price (null: none to buy), and why it can't be bought now. */
  slotOffer: (skill: ChainSkill) => {
    price: { links: number; scrap: number } | null;
    why: string | null;
  };
  buySlot: (skill: ChainSkill) => void;
}

/**
 * The Anvil's workshop: the equipped weapon's chains, edited as a draft (kept
 * in the store, so it outlives the tab) that Apply pays for, all or nothing,
 * or Revert drops; each chain's slots, with the next slot's price; each move's
 * sockets and runes, which the draft carries too. Read-only while a dive is
 * under way, and unarmed (the unarmed default shows).
 */
export function useAnvilChains(): AnvilChains {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const unsocket = useDelveStore((s) => s.unsocket);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  const saved = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  // The draft against the weapon: the skills it changes, Apply's options, the engine's dry run
  // and the pouch it leaves; and the chains shown.
  const view = useDelveStore(selectDraftApply);
  const changed = view.changes;
  const chains = useMemo(() => ({ ...saved, ...changed }), [saved, changed]);
  // Unarmed, the default chains sit at their base slots (the bare hands' string for the basic one).
  const slots = weapon
    ? movesetOf(registry, weapon).slots
    : Object.fromEntries(
        CHAIN_SKILLS.filter((s) => chains[s]).map((s) => [s, baseSlots(registry, null, s)]),
      );
  const stats = useMemo(
    () =>
      profileStats(registry, {
        pair,
        equipped: weapon
          ? {
              ...equipped,
              weapon: { ...weapon, moveset: { ...movesetOf(registry, weapon), chains } },
            }
          : equipped,
      }),
    [registry, equipped, pair, weapon, chains],
  );
  const elements = pairElements(pair);
  const applying = view.dry;
  const mode = unsocketMode(registry, unsocket);
  const pullScrap = registry.getDelveBalance().runes.pullScrap;
  // The weapon's sockets: the pouch the draft leaves, the rarity's cap, the price by index, the
  // pull rule's text, and the engine's own op run dry with one more socket on a move: why
  // "+ socket" is off (a draft Apply already refuses says so itself).
  const runes: ChainRunes | undefined = weapon
    ? {
        pouch: view.pouch,
        socketCap: socketCap(registry, weapon.rarity),
        socketPrice: (open) => socketPrice(registry, open),
        weaponBaseId: weapon.baseId,
        pullText: (r) =>
          mode === 'destroy'
            ? 'Pull · destroys it'
            : `Pull · ${pullScrap[r.tier - 1]} scrap, back to your pouch`,
        openWhy: (skill, index) => {
          const chain = chains[skill];
          if (!chain || (applying && !applying.ok)) return null;
          const m = movesOf(chain)[index];
          const next = withMove(chain, index, { ...m, runes: [...socketsOf(m), null] });
          const res = setChains(registry, profile, { ...changed, [skill]: next }, view.opts);
          return res.ok ? null : (res.reason ?? null);
        },
      }
    : undefined;

  return {
    editor: {
      chains,
      caps: slots,
      stats,
      locked: isDiveActive(profile) || !weapon,
      lockedText: weapon ? undefined : 'Equip a weapon to build your moves.',
      absentText: (s) => carriedByText(registry, s),
      onChange: (skill, chain, map) => useDelveStore.getState().editDraft(skill, chain, map),
      elements: elements.length > 0 ? elements : undefined,
      runes,
    },
    weapon: weapon ?? null,
    changed,
    slotOffer: (skill) => {
      const price = weapon ? slotPrice(registry, weapon, skill) : null;
      // Why the slot can't be bought, in the engine's words (a dry run of its op). It adds to
      // the saved chain, so a chain with changes waits for them.
      const dry = price && !changed[skill] ? addSlot(registry, profile, skill) : null;
      const why = !price
        ? null
        : changed[skill]
          ? 'Apply or revert this chain first'
          : dry && !dry.ok
            ? (dry.reason ?? null)
            : null;
      return { price, why };
    },
    buySlot: (skill) => {
      const res = useDelveStore.getState().addSlot(skill);
      playSound(res.ok ? 'upgradeTier' : 'combineFail');
    },
  };
}
```

Create `packages/client/src/features/delve/hub/skills/SkillList.tsx`:

```tsx
import {
  CHAIN_SKILLS,
  movesOf,
  overtakeProgress,
  resolveChain,
  type Blow,
  type ChainSkill,
  type HeroStats,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import type { ControlsConfig } from '@/features/controls/controls';
import { Button, Glyph, InputGlyph, type Binding } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME, blowText, chainText, moveText } from '../../chains/chain-text';
import type { ChainEditorModel } from '../../chains/useChainEditor';
import type { AnvilChains } from './useAnvilChains';

/** The input a skill casts with, from the player's setup (the basic attack: the left button too). */
export function skillBinding(config: ControlsConfig, skill: ChainSkill): Binding {
  const action = skill === 'basic' ? 'attack' : skill;
  return {
    key: config.keys[action] ?? undefined,
    pad: config.pad[action] ?? undefined,
    mouse: skill === 'basic' ? 'lmb' : undefined,
  };
}

/**
 * The Skills tab's left pane: the four skills as a sub tab list (`[` `]`, LT RT), each with its
 * input's glyph, its payment, five slot dots (moves, open slots, slots to buy) and its chain's
 * names, then the mana pair box, whose Realign opens the Mana view.
 */
export function SkillList({
  ed,
  anvil,
  onMana,
}: {
  ed: ChainEditorModel;
  anvil: AnvilChains;
  onMana: () => void;
}) {
  const registry = getDelveRegistry();
  const config = useControlsStore((s) => s.config);
  const { chains, caps, stats, absentText } = anvil.editor;
  const cap = registry.getDelveBalance().chains.cap;
  const weapon = anvil.weapon ? registry.getGearBase(anvil.weapon.baseId).name : 'your fists';

  return (
    <aside className="flex min-h-0 flex-col gap-3" aria-label="Skills">
      <span className="k-label pl-1">Skills on {weapon}</span>
      <div
        role="tablist"
        aria-label="Skills"
        aria-orientation="vertical"
        data-pad-tabs="sub"
        className="flex flex-col gap-3"
      >
        {CHAIN_SKILLS.map((s) => {
          const chain = chains[s];
          const moves = chain ? movesOf(chain) : [];
          const on = ed.skill === s;
          const els = moves.map((m) => ('element' in m ? m.element : m.elements[0]));
          const color = els[0] ? manaStyle(registry, els[0]).color : 'var(--k-steel-3)';
          const summary = !chain
            ? (absentText?.(s) ?? '')
            : s === 'basic'
              ? chainText((moves as Blow[]).map((b) => blowText(registry, b)))
              : chainText(resolveChain(registry, stats, s, chains[s]!).moves.map(moveText));
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={on}
              className="k-panel k-plate text-left"
              style={{
                padding: '14px 16px',
                gap: 8,
                borderColor: on ? 'var(--k-hot)' : undefined,
                background: on ? 'var(--k-wood-0)' : undefined,
              }}
              onClick={() => ed.pick(s)}
              data-testid={`chain-skill-${s}`}
            >
              <span className="flex items-center gap-2.5">
                <InputGlyph binding={skillBinding(config, s)} size="sm" />
                <span className="k-disp text-[19px]">{SKILL_NAME[s]}</span>
                <span className="ml-auto text-[14px] text-[var(--k-text-3)]">
                  {!chain ? 'locked' : s === 'basic' ? 'free' : chains[s]!.payment}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {Array.from({ length: cap[s] }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="h-1.5 w-8"
                    style={{
                      background:
                        i < moves.length
                          ? color
                          : i < (caps[s] ?? 0)
                            ? 'var(--k-steel-1)'
                            : 'var(--k-well)',
                    }}
                  />
                ))}
                <span className="ml-auto text-[14px]">
                  {chain ? `${moves.length} of ${caps[s]}` : 'Locked'}
                </span>
              </span>
              <span
                className="text-[14px] text-[var(--k-text-3)]"
                data-testid={on ? 'abilities-summary' : undefined}
              >
                {summary}
              </span>
            </button>
          );
        })}
      </div>
      <ManaPair stats={stats} onMana={onMana} />
    </aside>
  );
}

/** The pair's attunement, the overtake line and their reaction, and the way to the Mana view. */
function ManaPair({ stats, onMana }: { stats: HeroStats; onMana: () => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { primary, secondary } = profile.pair;
  if (!primary) return null;
  const style = (m: typeof primary) => manaStyle(registry, m);
  const overtake = overtakeProgress(registry, profile);
  return (
    <div
      className="k-panel k-plate mt-auto"
      style={{ padding: 16, gap: 10 }}
      data-testid="mana-pair"
    >
      <div className="flex items-center justify-between">
        <span className="k-disp text-[17px]">Mana pair</span>
        <Button variant="quiet" size="sm" onClick={onMana} testId="mana-realign">
          {secondary ? 'Realign ›' : 'Bind ›'}
        </Button>
      </div>
      <div className="flex gap-2">
        {[primary, secondary].flatMap((m) =>
          m ? (
            <span
              key={m}
              className="k-well flex flex-1 items-center justify-center gap-2 p-2 font-semibold"
              style={{ color: style(m).color }}
            >
              <Glyph id={m} size={16} color={style(m).color} /> {style(m).name} ·{' '}
              {stats.attunement[m]}
            </span>
          ) : (
            []
          ),
        )}
      </div>
      <div className="text-[14px] text-[var(--k-text-3)]">
        {secondary
          ? `${style(secondary).name} overtakes ${style(primary).name} past ${+overtake.need.toFixed(1)} (now ${overtake.have}). Reaction: ${registry.getReactionFor(primary, secondary).name}.`
          : 'No second element yet: bind one in the Mana view.'}
      </div>
    </div>
  );
}
```

Create `packages/client/src/features/delve/hub/skills/ChainLane.tsx`:

```tsx
import { Fragment, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  chainCycle,
  socketsOf,
  type AbilityPayment,
  type ChainCycle,
  type ManaSupport,
} from '@alloy/engine';
import { Glyph, Panel, Price, Segmented, layerZoom } from '@/features/delve/kit';
import { formatNumber, manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SocketRow } from '../../runes/SocketRow';
import { KIND_NAME, SKILL_NAME } from '../../chains/chain-text';
import { PAYMENTS, offPair, type ChainEditorModel } from '../../chains/useChainEditor';
import type { AnvilChains } from './useAnvilChains';

/** Where a card dragged `dx` px (design px) from place `from` lands, `step` px a place apart. */
export function dropIndex(from: number, dx: number, step: number, count: number): number {
  return Math.min(count - 1, Math.max(0, from + Math.round(dx / step)));
}

/** A card the mouse is dragging: its place, where the press began, and a place's width. */
interface Drag {
  i: number;
  x: number;
  step: number;
  dx: number;
}

/**
 * The Skills tab's centre pane: the chosen chain's header (its slots, payment and rule), its
 * move cards in order (each its kind, element tile and form glyph, element or fusion, socket
 * pips and price; the chosen card's ◂ ▸ × toolbar), "+ Slot" with its price, and for an ability
 * chain its stats and rhythm. A card drags to a new place with the mouse (decided item 37).
 */
export function ChainLane({
  ed,
  anvil,
  carrying,
}: {
  ed: ChainEditorModel;
  anvil: AnvilChains;
  /** The pad has the chosen card picked up (X): it rides raised. */
  carrying: boolean;
}) {
  const registry = getDelveRegistry();
  const { skill, entries, index, names, locked, absent, chain, resolved } = ed;
  const { caps, stats, runes, absentText } = anvil.editor;
  const slots = caps[skill] ?? 0;
  const offer = anvil.slotOffer(skill);
  const id = useId();
  const [drag, setDrag] = useState<Drag | null>(null);
  // A drag that moved swallows the click that ends it.
  const dragged = useRef(false);
  const cycle = resolved ? chainCycle(registry, stats, resolved) : null;

  const onPointerDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || locked || entries.length < 2) return;
    // A place's width: from one card to the next, in design px (decided item 32).
    const [a, b] = [...ed.cardsRef.current!.querySelectorAll('[data-card]')].map(
      (c) => c.parentElement!.getBoundingClientRect().left,
    );
    const step = (b - a) / layerZoom(e.currentTarget) || 1;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragged.current = false;
    setDrag({ i, x: e.clientX, step, dx: 0 });
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / layerZoom(e.currentTarget);
    if (Math.abs(dx) > 4) dragged.current = true;
    setDrag({ ...drag, dx });
  };
  const onPointerUp = () => {
    if (!drag) return;
    setDrag(null);
    if (dragged.current)
      ed.shift(drag.i, dropIndex(drag.i, drag.dx, drag.step, entries.length) - drag.i);
  };

  return (
    <Panel as="section" aria-label={`${SKILL_NAME[skill]} chain`} testId="chain-lane">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <h2 className="k-heading m-0">{SKILL_NAME[skill]}</h2>
        {!absent && (
          <span className="text-[16px] text-[var(--k-text-3)]">
            <span data-testid="chain-slots">
              {entries.length} of {slots} slots
            </span>
            {chain
              ? ` · pays ${chain.payment} · each press casts the next move`
              : ' · free · each swing strikes the next blow'}
          </span>
        )}
        {chain && (
          <div className="ml-auto">
            <Segmented
              aria-label="Payment"
              value={chain.payment}
              onChange={(p: AbilityPayment) => ed.setPayment(p)}
              options={PAYMENTS.map(([p, label, text]) => ({
                id: p,
                label,
                title: text,
                disabled: locked,
                testId: `payment-${p}`,
              }))}
            />
          </div>
        )}
      </div>
      {absent && (
        <p className="m-0 flex items-center gap-2 text-[16px] text-[var(--k-text-2)]">
          <Glyph id="lock" size={16} /> {absentText?.(skill)}
        </p>
      )}
      {locked && !absent && (
        <div
          className="k-well p-3 text-center text-[16px] text-[var(--k-hot)]"
          data-testid="abilities-locked"
        >
          {ed.lockedText}
        </div>
      )}
      <div ref={ed.cardsRef} className="flex items-stretch gap-2.5" data-testid="chain-cards">
        {entries.map((e, i) => {
          const on = i === index;
          const el = 'element' in e ? e.element : e.elements[0];
          const color = manaStyle(registry, el).color;
          const ab = resolved?.moves[i];
          const off = offPair(e, ed.allowed);
          const moving = drag?.i === i;
          return (
            <Fragment key={i}>
              {i > 0 && (
                <span aria-hidden className="self-center text-[22px] text-[var(--k-steel-2)]">
                  ›
                </span>
              )}
              <div
                className="k-well flex min-w-0 flex-1 flex-col gap-3 p-4"
                data-carried={on && carrying ? '' : undefined}
                style={{
                  borderColor: on ? 'var(--k-hot-hi)' : undefined,
                  background: on ? 'var(--k-wood-0)' : undefined,
                  transform: moving
                    ? `translateX(${drag.dx}px)`
                    : on && carrying
                      ? 'translateY(-8px)'
                      : undefined,
                  zIndex: moving ? 1 : undefined,
                }}
              >
                <button
                  type="button"
                  data-card={i}
                  className="flex flex-col gap-3 bg-transparent p-0 text-left"
                  aria-pressed={on}
                  aria-label={off ? `${names[i]}, off-pair` : names[i]}
                  onClick={() => {
                    if (!dragged.current) ed.select(i);
                    dragged.current = false;
                  }}
                  onPointerDown={onPointerDown(i)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => setDrag(null)}
                  data-testid={`move-${i}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="k-label whitespace-nowrap">Move {i + 1}</span>
                    <span className="k-disp text-[16px]">{KIND_NAME[e.kind]}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className="k-socket inline-flex h-[52px] w-[52px] flex-none items-center justify-center"
                      style={{ borderColor: color }}
                    >
                      <Glyph id={'form' in e ? e.form : 'attack'} size={30} color={color} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="k-disp truncate text-[21px]">
                        {'form' in e ? registry.getForm(e.form).name : ed.weapon}
                      </span>
                      <span className="text-[14px]" style={{ color }}>
                        {ab?.fusion?.name ?? manaStyle(registry, el).name}
                      </span>
                    </span>
                  </span>
                  {off && (
                    <span className="text-[14px] text-[var(--k-hot)]" data-testid="card-off-pair">
                      off-pair
                    </span>
                  )}
                </button>
                <span className="flex flex-wrap items-center gap-2">
                  {runes && (
                    <span data-testid={`sockets-${i}`}>
                      <SocketRow
                        runes={socketsOf(e)}
                        cap={runes.socketCap}
                        nextPrice={
                          on && ed.nextSocket !== undefined
                            ? (ed.nextSocket ?? { links: 0, scrap: 0 })
                            : null
                        }
                        dormant={ed.dormant(i)}
                        locked={locked}
                        onSocketTap={(s) => ed.openPicker(i, s)}
                        onOpenSocket={ed.openSocket}
                        whyId={on && ed.openWhy ? `${id}-socket` : undefined}
                      />
                    </span>
                  )}
                  {ab && (
                    <span className="ml-auto whitespace-nowrap text-[14px] text-[var(--k-text-3)]">
                      {ab.payment === 'charge'
                        ? `Charge ${Math.round(ab.chargeNeed)}`
                        : `${Math.round(ab.cost)} mana`}
                    </span>
                  )}
                </span>
                {on && (
                  <span className="flex gap-1.5" role="group" aria-label="Reorder">
                    <button
                      type="button"
                      className="k-chip h-8 min-w-8 justify-center"
                      disabled={locked || i === 0}
                      aria-label={`Move ${names[i]} earlier`}
                      onClick={() => ed.shift(i, -1)}
                      data-earlier={i}
                      data-testid={`move-left-${i}`}
                    >
                      ◂
                    </button>
                    <button
                      type="button"
                      className="k-chip h-8 min-w-8 justify-center"
                      disabled={locked || i === entries.length - 1}
                      aria-label={`Move ${names[i]} later`}
                      onClick={() => ed.shift(i, 1)}
                      data-later={i}
                      data-testid={`move-right-${i}`}
                    >
                      ▸
                    </button>
                    <button
                      type="button"
                      className="k-chip h-8 min-w-8 justify-center"
                      disabled={locked || entries.length === 1}
                      aria-label={`Remove ${names[i]}`}
                      onClick={() => ed.remove(i)}
                      data-testid={`move-remove-${i}`}
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
        {!absent && entries.length < slots && (
          <button
            type="button"
            className="flex flex-[0_0_150px] flex-col items-center justify-center gap-1.5 border-2 border-dashed border-[var(--k-steel-2)] bg-transparent text-[14px] text-[var(--k-text-3)]"
            disabled={locked}
            aria-label="Add a move"
            onClick={ed.add}
            data-testid="move-add"
          >
            <span className="k-disp text-[18px] text-[var(--k-text-2)]">+ Move</span>
            free slot
          </button>
        )}
        {!absent && entries.length >= slots && offer.price && (
          <button
            type="button"
            className="flex flex-[0_0_150px] flex-col items-center justify-center gap-1.5 border-2 border-dashed border-[var(--k-steel-2)] bg-transparent text-[14px] text-[var(--k-text-3)]"
            disabled={locked || !!offer.why}
            aria-describedby={offer.why && !locked ? `${id}-slot` : undefined}
            onClick={() => anvil.buySlot(skill)}
            data-testid="add-slot"
          >
            <span className="k-disp text-[18px] text-[var(--k-text-2)]">+ Slot</span>
            <Price links={offer.price.links} scrap={offer.price.scrap} />
          </button>
        )}
      </div>
      {offer.why && !locked && entries.length >= slots && (
        <span
          id={`${id}-slot`}
          className="text-[14px] text-[var(--k-hot)]"
          data-testid="add-slot-why"
        >
          {offer.why}
        </span>
      )}
      {ed.openWhy && (
        <span
          id={`${id}-socket`}
          className="text-[14px] text-[var(--k-hot)]"
          data-testid="socket-open-why"
        >
          {ed.openWhy}
        </span>
      )}
      {cycle && chain && (
        <>
          <ChainStats cycle={cycle} support={ed.support} payment={chain.payment} />
          <RhythmStrip cycle={cycle} />
        </>
      )}
    </Panel>
  );
}

/** One stat tile: a label, a big number and a caption. */
function Tile({
  label,
  value,
  caption,
  testId,
  hot = false,
}: {
  label: string;
  value: string;
  caption: ReactNode;
  testId: string;
  hot?: boolean;
}) {
  return (
    <div
      className="k-well flex flex-col gap-1 px-4 py-3.5"
      style={hot ? { borderColor: 'var(--k-hot)' } : undefined}
      data-testid={testId}
    >
      <span className="k-label" style={hot ? { color: 'var(--k-hot-hi)' } : undefined}>
        {label}
      </span>
      <span className="k-disp text-[26px]" style={hot ? { color: 'var(--k-hot-hi)' } : undefined}>
        {value}
      </span>
      <span className="text-[14px]" style={{ color: hot ? 'var(--k-hot-hi)' : 'var(--k-text-3)' }}>
        {caption}
      </span>
    </div>
  );
}

/**
 * An ability chain's four tiles (`chainCycle` and `manaSupport`): its damage over a full cycle,
 * the cycle's seconds, the mana a cycle spends, and the spend against the build's refill, hot
 * when it spends more.
 */
export function ChainStats({
  cycle,
  support,
  payment,
}: {
  cycle: ChainCycle;
  support: ManaSupport | null;
  payment: AbilityPayment;
}) {
  const spends = Math.round(support?.spend ?? 0);
  const refills = Math.round(support?.refill ?? 0);
  const short = !!support && spends > refills;
  return (
    <div className="grid grid-cols-4 gap-3.5" data-testid="chain-stats">
      <Tile
        label="Chain damage"
        value={formatNumber(cycle.damage)}
        caption="per full cycle"
        testId="stat-damage"
      />
      <Tile
        label="Cycle"
        value={`${cycle.seconds.toFixed(1)} s`}
        caption="casts plus beats"
        testId="stat-cycle"
      />
      <Tile
        label="Mana per cycle"
        value={String(Math.round(cycle.mana))}
        caption={payment === 'charge' ? 'paid with charge' : 'spent each cycle'}
        testId="stat-mana"
      />
      <Tile
        label="Mana support"
        value={support ? `${spends} / ${refills}` : '—'}
        caption={
          support ? (
            <span data-testid="mana-support" data-short={short || undefined}>
              Spends {spends}/s · your build refills {refills}/s
            </span>
          ) : (
            'charge fills from damage'
          )
        }
        testId="stat-support"
        hot={short}
      />
    </div>
  );
}

/**
 * The chain's rhythm, from `chainCycle`: a block per move as wide as its wind-up (a hold's
 * hatched, an echoed one trailed by a ghost a quarter its width) in its first element's colour,
 * a line per beat, and the pause that starts the chain over.
 */
export function RhythmStrip({ cycle }: { cycle: ChainCycle }) {
  const registry = getDelveRegistry();
  const total =
    cycle.steps.reduce((t, s) => t + s.cast * (s.echo ? 1.25 : 1) + s.beat, 0) + cycle.restart;
  const width = (seconds: number) => `${(seconds / total) * 100}%`;
  return (
    <div className="k-well flex flex-col gap-2.5 p-[18px]" data-testid="rhythm-strip">
      <span className="k-label">Rhythm</span>
      <div className="flex h-11 items-center">
        {cycle.steps.map((s, i) => {
          const color = manaStyle(registry, s.elements[0]).color;
          return (
            <Fragment key={i}>
              <span
                className="h-[30px] min-w-1"
                style={{
                  width: width(s.cast),
                  background: s.hold
                    ? `repeating-linear-gradient(45deg, ${color} 0 4px, transparent 4px 8px)`
                    : color,
                }}
                data-testid={`rhythm-step-${i}`}
                data-hold={s.hold || undefined}
              />
              {s.echo && (
                <span
                  className="h-[30px] opacity-40"
                  style={{ width: width(s.cast / 4), background: color }}
                  data-testid={`rhythm-echo-${i}`}
                />
              )}
              <span
                className="h-1.5"
                style={{ width: width(s.beat), background: 'var(--k-steel-1)' }}
                data-testid={`rhythm-beat-${i}`}
              />
            </Fragment>
          );
        })}
        <span
          className="border-t-[3px] border-dashed border-[var(--k-steel-2)]"
          style={{ width: width(cycle.restart) }}
        />
        <span className="ml-2.5 whitespace-nowrap text-[14px] text-[var(--k-text-3)]">
          pause {cycle.restart.toFixed(1)} s restarts
        </span>
      </div>
      <span className="text-[14px] text-[var(--k-text-3)]">
        Each block is a cast, each line a beat.
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/ChainLane.test.tsx)`
Expected: PASS (6 tests).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1018 tests in 125 files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/client/src/features/delve/chains/chain-text.ts packages/client/src/features/delve/hub/skills/useAnvilChains.ts packages/client/src/features/delve/hub/skills/SkillList.tsx packages/client/src/features/delve/hub/skills/ChainLane.tsx packages/client/src/features/delve/hub/skills/__tests__/harness.tsx packages/client/src/features/delve/hub/skills/__tests__/ChainLane.test.tsx
git add packages/client/src/features/delve/chains/chain-text.ts packages/client/src/features/delve/hub/skills/useAnvilChains.ts packages/client/src/features/delve/hub/skills/SkillList.tsx packages/client/src/features/delve/hub/skills/ChainLane.tsx packages/client/src/features/delve/hub/skills/__tests__/harness.tsx packages/client/src/features/delve/hub/skills/__tests__/ChainLane.test.tsx
git commit -m "feat(client): the Skills tab's skill list and chain lane, with its stats and rhythm" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 6: The inspector and the Apply bar

### Task 8: The move inspector

`MoveInspector` (`ability-readout`): "Move n · name" and "edited" while its chain has unapplied changes; Kind and Form (five to a row) as `Segmented` radios (`kind-<k>`, `form-<id>`), Elements as the pair's singles (`element-<m>`) then the fusion (`infusion-<m>`: the main element infused with it) and ⇄ (`swap-elements`); the sockets as rows (`inspect-socket-<i>`, `socket-count`) that open `RunePicker variant="inline"` in place of the numbers; then `MoveNumbers`. A blow takes a kind and an element, and shows its own numbers. The rune-costs tests move here, onto the panes, with their assertions (the support line's amber is now `data-short`).

**Files:**
- Create: `packages/client/src/features/delve/hub/skills/MoveInspector.tsx`: the inspector
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`: `Panes` draws the inspector too
- Move: `packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx → packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`: onto the panes

- [ ] **Step 1: The failing test**

Move the rune-costs tests to the Skills panes:

```bash
git mv packages/client/src/features/delve/chains/__tests__/rune-costs.test.tsx packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx
```

In `packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`, replace:

```tsx
import { ChainEditor } from '../ChainEditor';
import { pricedRegistry } from '../../runes/__tests__/priced-registry';
import { dormantText } from '../../runes/rune-style';
```

with:

```tsx
import { pricedRegistry } from '../../../runes/__tests__/priced-registry';
import { dormantText } from '../../../runes/rune-style';
import { Panes } from './harness';
```

In `packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`, replace:

```tsx
/**
 * The builder over a Primary
```

with:

```tsx
/**
 * The Skills panes over a Primary
```

In `packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`, replace:

```tsx
    <ChainEditor
      chains={chains}
```

with:

```tsx
    <Panes
      chains={chains}
```

In `packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`, replace:

```tsx
describe("the builder's rune picker: prices", () => {
```

with:

```tsx
describe("the inspector's rune picker: prices", () => {
```

In `packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`, replace:

```tsx
describe("the readout's rune price", () => {
```

with:

```tsx
describe("the inspector's rune price", () => {
```

In `packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`, replace:

```tsx
describe('the mana support line', () => {
```

with:

```tsx
describe('the mana support tile', () => {
```

In `packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`, replace:

```tsx
    expect(line()).toHaveClass('text-amber-200/90');
```

with:

```tsx
    expect(line()).toHaveAttribute('data-short');
```

In `packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx`, replace:

```tsx
    expect(line()).not.toHaveClass('text-amber-200/90');
```

with:

```tsx
    expect(line()).not.toHaveAttribute('data-short');
```

In `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`, replace:

```tsx
import { ChainLane } from '../ChainLane';
import { SkillList } from '../SkillList';
```

with:

```tsx
import { ChainLane } from '../ChainLane';
import { MoveInspector } from '../MoveInspector';
import { SkillList } from '../SkillList';
```

In `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`, replace:

```tsx
      <ChainLane ed={ed} anvil={anvil} carrying={false} />
    </>
```

with:

```tsx
      <ChainLane ed={ed} anvil={anvil} carrying={false} />
      <MoveInspector ed={ed} anvil={anvil} />
    </>
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/rune-costs.test.tsx)`
Expected: FAIL: `Failed to resolve import "../MoveInspector"`.

- [ ] **Step 3: The implementation**

Create `packages/client/src/features/delve/hub/skills/MoveInspector.tsx`:

```tsx
import {
  MOVE_KINDS,
  runeTargetOf,
  runeText,
  type ManaType,
  type Move,
  type MoveKind,
  type FormId,
} from '@alloy/engine';
import { Button, Panel, Segmented } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { RuneGlyph } from '../../runes/RuneGlyph';
import { RunePicker } from '../../runes/RunePicker';
import { dormantText, runeName } from '../../runes/rune-style';
import { KIND_NAME, listed } from '../../chains/chain-text';
import {
  KIND_HINT,
  MoveNumbers,
  NumberTable,
  blowRows,
  moveChoices,
} from '../../chains/MoveEditor';
import type { ChainEditorModel } from '../../chains/useChainEditor';
import type { AnvilChains } from './useAnvilChains';

/**
 * The Skills tab's right pane (`ability-readout`): the chosen move, "edited" while its chain has
 * unapplied changes; its kind, form (five to a row) and elements (the pair, then the fusion,
 * off-pair marked); its sockets, each a row (rune, effect, price) that opens the rune picker
 * inline, in place of the numbers; and its numbers (`moveNumbers`, `moveBeat`). A basic blow
 * takes a kind and an element only.
 */
export function MoveInspector({ ed, anvil }: { ed: ChainEditorModel; anvil: AnvilChains }) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  const { move, slot, index, locked, resolved } = ed;
  const { stats, runes } = anvil.editor;
  if (ed.absent || !move)
    return (
      <Panel as="aside" aria-label="Move inspector">
        <p className="m-0 text-[16px] text-[var(--k-text-3)]">
          This weapon doesn't carry this skill.
        </p>
      </Panel>
    );
  const { off, shown, takes, misfits, blocking } = moveChoices(move, slot, ed.allowed);
  const set = (next: Partial<Move>) => ed.edit({ ...move, ...next } as typeof move);
  const ab = resolved?.moves[index] ?? null;
  const name = (m: ManaType) => manaStyle(registry, m).name;
  const offText = (m: ManaType) => (off.includes(m) ? ' · off-pair' : '');

  return (
    <Panel as="aside" aria-label={`Move ${index + 1} inspector`} testId="ability-readout">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="k-section m-0">
          Move {index + 1} · {ed.names[index]}
        </h2>
        {anvil.changed[ed.skill] && (
          <span className="text-[14px] text-[var(--k-text-3)]" data-testid="move-edited">
            edited
          </span>
        )}
      </div>
      <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <section className="flex flex-col gap-2">
          <span className="k-label">Kind</span>
          <Segmented
            aria-label="Kind"
            value={move.kind}
            onChange={(k: MoveKind) => set({ kind: k })}
            options={MOVE_KINDS.map((k) => ({ id: k, label: KIND_NAME[k], testId: `kind-${k}` }))}
          />
          <span className="text-[14px] text-[var(--k-text-3)]">
            {'form' in move
              ? KIND_HINT[move.kind]
              : move.kind === 'hold' &&
                'Hold the attack to charge it; automatic attacks swing it slow and hard.'}
          </span>
        </section>
        {'form' in move && (
          <section className="flex flex-col gap-2">
            <span className="k-label">Form</span>
            <Segmented
              aria-label="Form"
              columns={5}
              value={move.form}
              onChange={(f: FormId) => set({ form: f })}
              options={data.forms
                .filter((f) => f.slot === slot)
                .map((f) => {
                  const out = f.id === move.form ? [] : misfits(f.id);
                  return {
                    id: f.id,
                    label: f.name,
                    disabled: out.length > 0,
                    title: out.length > 0 ? `${listed(out)} doesn't fit a ${f.name}` : f.text,
                    testId: `form-${f.id}`,
                  };
                })}
            />
            {blocking.length > 0 && (
              <span className="text-[14px] text-[var(--k-hot)]" data-testid="form-rune-note">
                {listed(blocking)} {blocking.length > 1 ? "don't" : "doesn't"} fit every form: pull{' '}
                {blocking.length > 1 ? 'them' : 'it'} to pick another.
              </span>
            )}
            <span className="text-[14px] text-[var(--k-text-3)]">
              {registry.getForm(move.form).text}
            </span>
          </section>
        )}
        <section className="flex flex-col gap-2">
          <span className="k-label">{'form' in move ? 'Elements' : 'Element'}</span>
          {'element' in move ? (
            <Segmented
              aria-label="Element"
              value={move.element}
              onChange={(m: ManaType) => ed.edit({ ...move, element: m })}
              options={shown.map((m) => ({
                id: m,
                label: `${name(m)}${offText(m)}`,
                color: manaStyle(registry, m).color,
                disabled: !takes([m]),
                testId: `element-${m}`,
              }))}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Segmented
                aria-label="Elements"
                value={move.elements.join('+')}
                onChange={(id: string) => set({ elements: id.split('+') as ManaType[] })}
                options={[
                  ...shown.map((m) => ({
                    id: m,
                    label: `${name(m)}${offText(m)}`,
                    color: manaStyle(registry, m).color,
                    disabled: !takes([m]),
                    testId: `element-${m}`,
                  })),
                  // The fusion: the move's main element infused with each other one.
                  ...shown
                    .filter((m) => m !== move.elements[0])
                    .map((m) => ({
                      id: `${move.elements[0]}+${m}`,
                      label: `${name(move.elements[0])} + ${name(m)}`,
                      disabled: !takes([move.elements[0], m]),
                      testId: `infusion-${m}`,
                    })),
                ]}
              />
              {move.elements.length > 1 && (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => set({ elements: [move.elements[1], move.elements[0]] })}
                  aria-label="Swap the main element and the infusion"
                  testId="swap-elements"
                >
                  ⇄
                </Button>
              )}
            </div>
          )}
          {ab && (
            <span className="text-[14px] text-[var(--k-text-3)]" data-testid="element-effect">
              {ab.fusion
                ? `${ab.fusion.name}: ${ab.fusion.text} ${name(ab.element)} sets the damage type.`
                : slot === 'defensive'
                  ? data.elementTraits[ab.element].defensive
                  : data.elementTraits[ab.element].text}
            </span>
          )}
          {off.length > 0 && (
            <span className="text-[14px] text-[var(--k-hot)]" data-testid="off-pair-note">
              {off.map(name).join(' and ')} off-pair: no attunement. Keep it, or pick from your two
              elements.
            </span>
          )}
        </section>
        {runes && runes.socketCap > 0 && (
          <section className="flex flex-col gap-2">
            <span className="k-label" data-testid="socket-count">
              Sockets · {ed.sockets.length} of {runes.socketCap}
            </span>
            {ed.sockets.map((r, s) => {
              const idle = ed.dormant(index).includes(s);
              const text = r
                ? runeText(registry, r, runeTargetOf(runes.weaponBaseId, move), {
                    payment: ab?.payment,
                    ease: ab?.ease,
                  })
                : null;
              return (
                <button
                  key={s}
                  type="button"
                  className="k-well flex items-center gap-3 px-3 py-2.5 text-left"
                  style={{ borderColor: ed.socket === s ? 'var(--k-mana)' : undefined }}
                  onClick={() => ed.openPicker(index, s)}
                  data-testid={`inspect-socket-${s}`}
                >
                  {r ? (
                    <RuneGlyph rune={r} dormant={idle} />
                  ) : (
                    <span aria-hidden className="text-[14px] text-[var(--k-steel-3)]">
                      ◇
                    </span>
                  )}
                  <span className="font-semibold">
                    {r ? runeName(registry, r) : 'Empty socket'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--k-text-3)]">
                    {r
                      ? idle
                        ? dormantText(registry.getRune(r.id))
                        : text!.effect
                      : 'pick a rune'}
                  </span>
                  {text?.cost && !idle && (
                    <span className="text-[14px] text-[var(--k-hot-hi)]">{text.cost}</span>
                  )}
                </button>
              );
            })}
          </section>
        )}
      </fieldset>
      {ed.picker ? (
        <RunePicker variant="inline" {...ed.picker} />
      ) : ab ? (
        <div className="k-well flex flex-col gap-2 px-3.5 py-3">
          <MoveNumbers
            ab={ab}
            full={resolved?.hold[index]?.[2] ?? null}
            stats={stats}
            pool={ed.pool}
          />
        </div>
      ) : (
        <div className="k-well px-3.5 py-3">
          <NumberTable rows={blowRows(stats.weapon.blows[index], stats)} />
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/rune-costs.test.tsx src/features/delve/hub/skills/__tests__/ChainLane.test.tsx)`
Expected: PASS (2 files, 16 tests).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1018 tests in 125 files pass (the rune-costs file moved, not added); the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/client/src/features/delve/hub/skills/MoveInspector.tsx packages/client/src/features/delve/hub/skills/__tests__/harness.tsx packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx
git add packages/client/src/features/delve/hub/skills/MoveInspector.tsx packages/client/src/features/delve/hub/skills/__tests__/harness.tsx packages/client/src/features/delve/hub/skills/__tests__/rune-costs.test.tsx
git commit -m "feat(client): the Skills tab's move inspector, with the rune picker inline" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: The Apply bar

`ApplyBar` is the Skills tab's footer group (`chain-draft`, always shown): "n unapplied changes · price" (`chain-price`; "No changes" when none, "free until your first dive", the engine's refusal, the runes it destroys), Revert (`chain-revert`), Apply (`chain-apply`, its `Price`, Ctrl+Enter / hold Y drawn, `applyLabel` as its name, `chain-apply-why` when the engine refuses for another reason) and a compact Delve button (`delve-button`, `data-pad-menu`, Enter / Start), off while changes are unapplied. It delves at the deepest start depth, as the footer's default (the start chips show on the other tabs). `applyChains` is Apply's one path (the button and the prompt).

**Files:**
- Create: `packages/client/src/features/delve/hub/skills/ApplyBar.tsx`: `ApplyBar`, `APPLY_BINDING`, `applyChains`
- Create: `packages/client/src/features/delve/hub/skills/__tests__/ApplyBar.test.tsx`: no changes; counted with a price; Revert, Apply; the compact Delve

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/skills/__tests__/ApplyBar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { heroChains, type Chains } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../../registry';
import { ApplyBar } from '../ApplyBar';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const price = () => screen.getByTestId('chain-price');
const renderBar = () =>
  render(
    <MemoryRouter>
      <ApplyBar />
    </MemoryRouter>,
  );
/** The Primary's Bolt made a Lance: one unapplied change. */
const draftLance = () => {
  const primary = chains().primary;
  act(() =>
    store().editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], form: 'lance' }] }),
  );
};

describe('ApplyBar', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    mockNavigate.mockClear();
  });

  it('with nothing unapplied: "No changes", Revert and Apply off, the Delve button on', () => {
    renderBar();
    expect(price()).toHaveTextContent('No changes');
    expect(screen.getByTestId('chain-revert')).toBeDisabled();
    expect(screen.getByTestId('chain-apply')).toBeDisabled();
    expect(screen.getByTestId('delve-button')).toBeEnabled();
    expect(screen.getByTestId('delve-button')).toHaveAttribute('data-pad-menu');
  });

  it('counts the unapplied changes with their price; Revert drops them and Apply applies them', () => {
    renderBar();
    draftLance();
    expect(price()).toHaveTextContent('1 unapplied change · free until your first dive');
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply');
    fireEvent.click(screen.getByTestId('chain-revert'));
    expect(price()).toHaveTextContent('No changes');
    draftLance();
    fireEvent.click(screen.getByTestId('chain-apply'));
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(price()).toHaveTextContent('No changes');
  });

  it('the compact Delve waits while changes are unapplied, else starts the dive', () => {
    renderBar();
    draftLance();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toBeDisabled();
    expect(delve).toHaveAttribute('aria-describedby', price().id);
    fireEvent.click(screen.getByTestId('chain-revert'));
    fireEvent.click(screen.getByTestId('delve-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/delve/run');
    expect(store().profile.dive?.depth).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/ApplyBar.test.tsx)`
Expected: FAIL: `Failed to resolve import "../ApplyBar"`.

- [ ] **Step 3: The implementation**

Create `packages/client/src/features/delve/hub/skills/ApplyBar.tsx`:

```tsx
import { Fragment, useId } from 'react';
import { useNavigate } from 'react-router';
import { isDiveActive, startDepthOptions } from '@alloy/engine';
import { applyLabel, runeNames, selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { Button, Price, type Binding } from '@/features/delve/kit';
import { getDelveRegistry } from '../../registry';

/** Apply's inputs: Ctrl+Enter, or Y held on the pad. */
export const APPLY_BINDING: Binding = { key: 'Enter', ctrl: true, pad: 'y', padHold: 600 };

/** Apply the chain draft (all or nothing), with its sound. */
export function applyChains() {
  const res = useDelveStore.getState().applyDraft();
  playSound(res.ok ? 'upgradeTier' : 'combineFail');
  return res;
}

/**
 * The Skills tab's footer group (`chain-draft`, always shown): "n unapplied changes · price"
 * (or "No changes"), Revert, Apply with its price (off with the engine's reason while it would
 * be refused), and a compact Delve button, which waits while changes are unapplied.
 */
export function ApplyBar() {
  const registry = getDelveRegistry();
  const navigate = useNavigate();
  const profile = useDelveStore((s) => s.profile);
  const view = useDelveStore(selectDraftApply);
  const id = useId();
  const n = Object.keys(view.changes).length;
  const active = isDiveActive(profile);
  const { price, refused, dry } = view;
  const applyWhy = dry && !dry.ok ? dry.reason : null;
  // Unpriced, the price says why; Apply's own reason shows only when it says something else.
  const applyNote = applyWhy && applyWhy !== refused ? applyWhy : null;
  // What Apply spends (Links netted: the sockets of moves removed pay for those opened), a
  // refund beyond that, and the runes it destroys.
  const links = price ? price.links - price.refundLinks : 0;
  const parts = price
    ? [
        (price.dust > 0 || links > 0 || price.scrap > 0) && (
          <Price
            dust={price.dust > 0 ? price.dust : undefined}
            links={links > 0 ? links : undefined}
            scrap={price.scrap > 0 ? price.scrap : undefined}
          />
        ),
        links < 0 && <Price links={-links} signed />,
        price.destroys.length > 0 && `destroys ${runeNames(registry, price.destroys)}`,
      ].filter(Boolean)
    : [];
  const priced = parts.map((p, i) => (
    <Fragment key={i}>
      {i > 0 && ' · '}
      {p}
    </Fragment>
  ));
  const starts = startDepthOptions(registry, profile);
  const depth = starts[starts.length - 1] ?? 1;
  const onDelve = () => {
    if (!active && !useDelveStore.getState().startDive(depth)) return;
    playSound('phaseTransition');
    vibrate('medium');
    navigate('/delve/run');
  };

  return (
    <div className="flex items-center gap-4" data-testid="chain-draft">
      <span className="flex max-w-[420px] flex-col text-[16px] leading-tight">
        <span id={`${id}-price`} className="text-[var(--k-hot-hi)]" data-testid="chain-price">
          {n === 0 ? (
            'No changes'
          ) : (
            <>
              {n} unapplied change{n === 1 ? '' : 's'} ·{' '}
              {refused ? (
                <span>{refused}</span>
              ) : parts.length > 0 ? (
                priced
              ) : profile.stats.dives === 0 ? (
                'free until your first dive'
              ) : (
                'free'
              )}
            </>
          )}
        </span>
        {applyNote && (
          <span
            id={`${id}-apply`}
            className="text-[14px] text-[var(--k-bad-text)]"
            data-testid="chain-apply-why"
          >
            {applyNote}
          </span>
        )}
      </span>
      <Button
        size="sm"
        disabled={n === 0}
        onClick={() => useDelveStore.getState().revertDraft()}
        testId="chain-revert"
      >
        Revert
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={!dry?.ok}
        onClick={applyChains}
        binding={APPLY_BINDING}
        aria-label={applyLabel(registry, price)}
        aria-describedby={applyNote ? `${id}-apply` : applyWhy ? `${id}-price` : undefined}
        testId="chain-apply"
      >
        Apply
        {parts.length > 0 && <> · {priced}</>}
      </Button>
      <Button
        size="sm"
        onClick={onDelve}
        disabled={n > 0 && !active}
        aria-describedby={n > 0 && !active ? `${id}-price` : undefined}
        binding={{ key: 'Enter', pad: 'menu' }}
        data-pad-menu
        testId="delve-button"
      >
        {active ? 'Resume' : 'Delve'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/ApplyBar.test.tsx)`
Expected: PASS (3 tests).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1021 tests in 126 files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/client/src/features/delve/hub/skills/ApplyBar.tsx packages/client/src/features/delve/hub/skills/__tests__/ApplyBar.test.tsx
git add packages/client/src/features/delve/hub/skills/ApplyBar.tsx packages/client/src/features/delve/hub/skills/__tests__/ApplyBar.test.tsx
git commit -m "feat(client): the Skills tab's Apply bar, with a compact Delve button" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 7: The tab

### Task 10: The Skills tab: the panes, the Apply bar, the prompts and the Mana view

`SkillsTab(props: HubTabProps)` composes the panes on the `340px minmax(0,1fr) 500px` grid (with the hub's 24 / 32 px padding and 24 px gap; `abilities-panel` stays on its root), sets `ApplyBar` as the footer action (none in the pause), and the tab's prompts: Select move, Reorder (X picks the chosen card up; `captureNav` carries it: ← → move it, X drops, B puts it back), Remove (Del / tap Y), Next skill (`]` / RT, drawn: the pad's RT is the nav's sub-tab step), Apply (Ctrl+Enter / hold Y). It binds `[` `]` and Alt+← → itself. A link picks the skill or opens the Mana view. The Mana view (`ManaPanel`, `mana-view`) is the right pane's own pad scope with a Back (`mana-back`, decided item 39), in the kit, with glyphs and `Price` for the emoji; its tests move onto the tab. The old panel keeps rendering until the integrator wires the tab (it drops the Mana view and falls back to the attunement bars); Task 11 deletes it.

**Files:**
- Create: `packages/client/src/features/delve/hub/skills/SkillsTab.tsx`: the tab
- Create: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx`: the tab's footer (and none in the pause), prompts, link, keys and pad
- Overwrite: `packages/client/src/features/delve/ManaPanel.tsx`: the Mana view: a kit `Panel` (its own scope, Back), glyphs, `Price`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`: `renderSkills`: the tab in a stand-in hub that draws and binds its prompts and shows its footer
- Move: `packages/client/src/features/delve/__tests__/ManaPanel.test.tsx → packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx`: the Mana view, opened by a link; plus its Back and scope
- Modify: `packages/client/src/features/delve/AbilitiesPanel.tsx`: stops rendering the Mana view (until Task 11 deletes it)

- [ ] **Step 1: The failing test**

Create `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, fireEvent, within } from '@testing-library/react';
import {
  defaultMoveset,
  heroChains,
  type Chains,
  type ChainSkill,
  type MoveKind,
} from '@alloy/engine';
import { PAD_BUTTONS, type PadButton } from '@/features/gamepad/gamepad';
import { navCapture, padPrompts } from '@/features/delve/kit/prompts';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { renderSkills } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
/** The hero's chains, as its equipped weapon carries them. */
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;

/** The starting sword made epic (all four skills), every chain at five slots, its default moves. */
function roomy() {
  const p = store().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const lengths = { basic: 3, primary: 4, defensive: 1, ultimate: 1 };
  const moveset = defaultMoveset(registry, weapon, 'fire', lengths);
  const slots: Record<ChainSkill, number> = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
  store().setProfile({
    ...p,
    equipped: { ...p.equipped, weapon: { ...weapon, moveset: { chains: moveset.chains, slots } } },
  });
}
/** A key as the window hears it. */
const press = (code: string, mods: { altKey?: boolean; ctrlKey?: boolean } = {}) =>
  fireEvent.keyDown(document.body, { code, ...mods });
/** The pad's buttons, `on` held. */
const held = (...on: PadButton[]) =>
  Object.fromEntries(PAD_BUTTONS.map((b) => [b, on.includes(b)])) as Record<PadButton, boolean>;
const summary = () => screen.getByTestId('abilities-summary');
const kinds = (...k: MoveKind[]) => k.map((kind) => `${kind} Fire Bolt`).join(' · ');

describe('SkillsTab: the footer, the keys and the pad', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('sets the Apply bar as its footer, "No changes" when nothing is unapplied; the pause sets none', () => {
    const { unmount } = renderSkills();
    const footer = within(screen.getByTestId('hub-footer'));
    expect(footer.getByTestId('chain-price')).toHaveTextContent('No changes');
    expect(footer.getByTestId('chain-apply')).toBeDisabled();
    expect(footer.getByTestId('chain-revert')).toBeDisabled();
    unmount();
    renderSkills({ mode: 'pause' });
    expect(screen.queryByTestId('chain-draft')).toBeNull();
  });

  it("draws its prompts in the hub's footer", () => {
    renderSkills();
    const bar = screen.getByTestId('hub-footer');
    for (const label of ['Select move', 'Reorder', 'Remove', 'Next skill', 'Apply'])
      expect(bar).toHaveTextContent(label);
  });

  it('a link picks the skill', () => {
    roomy();
    renderSkills({ link: { tab: 'skills', skill: 'ultimate' } });
    expect(screen.getByTestId('chain-skill-ultimate')).toHaveAttribute('aria-selected', 'true');
  });

  it('keys: ] and [ step the skills, Alt+arrows move the chosen move, Del removes it, Ctrl+Enter applies', () => {
    roomy();
    renderSkills();
    press('BracketRight');
    expect(screen.getByTestId('chain-skill-defensive')).toHaveAttribute('aria-selected', 'true');
    press('BracketLeft');
    press('BracketLeft');
    expect(screen.getByTestId('chain-skill-basic')).toHaveAttribute('aria-selected', 'true');
    press('BracketRight');
    fireEvent.click(screen.getByTestId('move-3'));
    press('ArrowLeft', { altKey: true });
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'heavy', 'medium'));
    press('Delete');
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'medium'));
    press('Enter', { ctrlKey: true });
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'medium', 'medium']);
  });

  it('on the pad, X picks the chosen card up: the D-pad carries it, X drops it, B puts it back', () => {
    roomy();
    renderSkills();
    act(() => void padPrompts(new Set(['x']), held('x'), 0));
    act(() => navCapture()!('right'));
    act(() => navCapture()!('right'));
    expect(summary()).toHaveTextContent(kinds('medium', 'medium', 'light', 'heavy'));
    act(() => navCapture()!('b'));
    expect(navCapture()).toBeNull();
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'medium', 'heavy'));
    act(() => void padPrompts(new Set(['x']), held('x'), 1000));
    act(() => navCapture()!('right'));
    act(() => navCapture()!('x'));
    expect(navCapture()).toBeNull();
    expect(summary()).toHaveTextContent(kinds('medium', 'light', 'medium', 'heavy'));
  });

  it('on the pad, a tap of Y removes the chosen move and a held Y applies', () => {
    roomy();
    renderSkills();
    act(() => {
      padPrompts(new Set(['y']), held('y'), 0);
      padPrompts(new Set(), held(), 100);
    });
    expect(summary()).toHaveTextContent(kinds('medium', 'medium', 'heavy'));
    expect(chains().primary.moves).toHaveLength(4);
    act(() => {
      padPrompts(new Set(['y']), held('y'), 1000);
      padPrompts(new Set(), held('y'), 1700);
      padPrompts(new Set(), held(), 1800);
    });
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['medium', 'medium', 'heavy']);
  });
});
```

In `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`, replace:

```tsx
import { useChainEditor, type ChainEditorProps } from '../../../chains/useChainEditor';
```

with:

```tsx
import { useState, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PromptBar, usePrompts, type Prompt } from '@/features/delve/kit';
import { useChainEditor, type ChainEditorProps } from '../../../chains/useChainEditor';
import type { HubLink, HubMode } from '../../types';
```

In `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`, replace:

```tsx
import { SkillList } from '../SkillList';
```

with:

```tsx
import { SkillList } from '../SkillList';
import { SkillsTab } from '../SkillsTab';
```

In `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`, replace:

```tsx
/** The Skills panes over any chains (no store draft, nothing to buy), as the Anvil draws them. */
```

with:

```tsx
/** SkillsTab in a stand-in hub: it draws and binds the tab's prompts and shows its footer group. */
function Hub({ mode, link }: { mode: HubMode; link?: HubLink }) {
  const [footer, setFooter] = useState<ReactNode>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  usePrompts(prompts);
  return (
    <MemoryRouter>
      <SkillsTab
        mode={mode}
        setPrompts={setPrompts}
        setFooterAction={setFooter}
        go={() => {}}
        link={link}
      />
      <footer data-testid="hub-footer">
        <PromptBar prompts={prompts} />
        {footer}
      </footer>
    </MemoryRouter>
  );
}

export function renderSkills(opts: { mode?: HubMode; link?: HubLink } = {}): RenderResult {
  return render(<Hub mode={opts.mode ?? 'anvil'} link={opts.link} />);
}

/** The Skills panes over any chains (no store draft, nothing to buy), as the Anvil draws them. */
```

Move the Mana view tests onto the tab:

```bash
git mv packages/client/src/features/delve/__tests__/ManaPanel.test.tsx packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx
```

In `packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx`, replace:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { bindSecondary, generateItem, profilePower, SeededRNG, type ManaType } from '@alloy/engine';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { bindSecondary, generateItem, profilePower, SeededRNG, type ManaType } from '@alloy/engine';
import { formatNumber } from '../../../format';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { renderSkills } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});
```

In `packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx`, replace:

```tsx
describe('the Mana view (the Anvil, Abilities tab)', () => {
```

with:

```tsx
/** The Skills tab, its right pane on the Mana view (the Loadout's mana strip links there). */
const renderMana = () => renderSkills({ link: { tab: 'skills', view: 'mana' } });

describe('the Mana view (the Anvil, Skills tab)', () => {
```

In `packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx`, replace:

```tsx
  it('the element picker offers only the pair', () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    render(<AbilitiesPanel />);
```

with:

```tsx
  it('the element picker offers only the pair', () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    renderSkills();
```

Every other render opens the Mana view:

```bash
sed -i "s|render(<AbilitiesPanel />)|renderMana()|g" packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx
```

In `packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx`, replace:

```tsx
toHaveTextContent(`✦ ${realignDust} Mana Dust`)
```

with:

```tsx
toHaveTextContent(`${realignDust} Mana Dust`)
```

In `packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx`, replace:

```tsx
  it('binds a second element you own gear in, after a confirmation that shows the Power', () => {
```

with:

```tsx
  it("opens from the mana pair's Realign as its own pad scope; Back returns to the move", () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    renderSkills();
    expect(screen.getByTestId('mana-pair')).toHaveTextContent('Fire · 2');
    expect(screen.getByTestId('mana-pair')).toHaveTextContent('Reaction: Overload');
    fireEvent.click(screen.getByTestId('mana-realign'));
    expect(screen.getByTestId('mana-view')).toHaveAttribute('data-pad-scope');
    expect(screen.queryByTestId('ability-readout')).toBeNull();
    expect(screen.getByTestId('mana-back')).toHaveAttribute('data-pad-back');
    fireEvent.click(screen.getByTestId('mana-back'));
    expect(screen.queryByTestId('mana-view')).toBeNull();
    expect(screen.getByTestId('ability-readout')).toBeInTheDocument();
  });

  it('binds a second element you own gear in, after a confirmation that shows the Power', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx src/features/delve/hub/skills/__tests__/ManaView.test.tsx)`
Expected: FAIL: both files: `Failed to resolve import "../SkillsTab"`.

- [ ] **Step 3: The implementation**

Overwrite `packages/client/src/features/delve/ManaPanel.tsx`:

```tsx
import { useState } from 'react';
import {
  GEAR_SLOTS,
  MANA_TYPES,
  bindSecondary,
  isDiveActive,
  overtakeProgress,
  profilePower,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Chip, Glyph, Panel, Price } from '@/features/delve/kit';
import { AttunementBars } from './items/AttunementBars';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';

/**
 * The Mana view, in the Skills tab's right pane (its own pad scope: Back, Esc
 * or B return to the move): your primary and secondary with their attunement,
 * how near the secondary is to overtaking, your Mana Dust, and binding a
 * second element or realigning the pair (between dives only). The rules are
 * the engine's (`bindSecondary`, `realign`, `overtakeProgress`).
 */
export function ManaPanel({ stats, onBack }: { stats: HeroStats; onBack: () => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const [binding, setBinding] = useState<ManaType | null>(null);
  const [target, setTarget] = useState<{ primary?: ManaType; secondary?: ManaType }>({});
  const [message, setMessage] = useState<string | null>(null);
  const { primary, secondary } = profile.pair;
  const back = (
    <Button size="sm" onClick={onBack} data-pad-back testId="mana-back">
      Back
    </Button>
  );
  if (!primary)
    return (
      <Panel as="aside" title="Your mana" aside={back} data-pad-scope testId="mana-view">
        <AttunementBars stats={stats} />
      </Panel>
    );

  const cost = registry.getDelveBalance().pair;
  const locked = isDiveActive(profile);
  const style = (m: ManaType) => manaStyle(registry, m);
  const glyph = (m: ManaType) => <Glyph id={m} size={16} color={style(m).color} />;
  // The Power once `m` is bound: mid-dive too (binding refuses then), at the dive's depth.
  const boundPower = (m: ManaType) =>
    profilePower(registry, {
      ...bindSecondary(registry, { ...profile, dive: null }, m).profile,
      dive: profile.dive,
    });
  const owned = new Set<ManaType>([
    ...GEAR_SLOTS.flatMap((s) => profile.equipped[s]?.mana ?? []),
    ...profile.bag.map((i) => i.mana),
  ]);
  const candidates = MANA_TYPES.filter((m) => m !== primary && owned.has(m));
  const overtake = overtakeProgress(registry, profile);
  // Realign always sends both elements: the engine refuses a lone primary equal to the secondary.
  const next = secondary
    ? { primary: target.primary ?? primary, secondary: target.secondary ?? secondary }
    : null;
  const changed =
    !!next &&
    next.primary !== next.secondary &&
    (next.primary !== primary || next.secondary !== secondary);

  const onBind = (mana: ManaType) => {
    const res = useDelveStore.getState().bindSecondary(mana);
    setBinding(null);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot bind'));
  };
  const onRealign = () => {
    if (!next) return;
    const res = useDelveStore.getState().realign(next);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot realign'));
    if (res.ok) setTarget({});
  };

  return (
    <Panel as="aside" title="Your mana" aside={back} data-pad-scope testId="mana-view">
      <div className="flex flex-col gap-1 text-[16px]">
        <span
          className="flex items-center gap-2"
          data-testid="pair-primary"
          style={{ color: style(primary).color }}
        >
          {glyph(primary)} {style(primary).name} · primary: your blows and abilities use it, except
          where you pick your secondary
        </span>
        <span
          className="flex items-center gap-2"
          data-testid="pair-secondary"
          style={{ color: secondary ? style(secondary).color : 'var(--k-text-3)' }}
        >
          {secondary ? (
            <>
              {glyph(secondary)} {style(secondary).name} · secondary: your blows and abilities can
              use it
            </>
          ) : (
            'No second element yet'
          )}
        </span>
      </div>
      <AttunementBars stats={stats} elements={secondary ? [primary, secondary] : [primary]} />
      {secondary && (
        <div
          className="flex flex-col gap-1 text-[14px] text-[var(--k-text-3)]"
          data-testid="overtake"
        >
          <span>
            {style(secondary).name} {overtake.have} / {overtake.need.toFixed(1)} to overtake{' '}
            {style(primary).name} (checked when a dive ends)
          </span>
          <div className="k-well h-2 overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${overtake.ready ? 100 : overtake.need > 0 ? Math.min(0.99, overtake.have / overtake.need) * 100 : 0}%`,
                background: style(secondary).color,
              }}
              data-testid="overtake-bar"
            />
          </div>
        </div>
      )}
      <div className="text-[14px] text-[var(--k-text-2)]" data-testid="mana-dust">
        <Price dust={profile.manaDust} /> · from salvaging gear outside your pair
      </div>
      {locked && (
        <div
          className="k-well p-2 text-center text-[14px] text-[var(--k-hot)]"
          data-testid="pair-locked"
        >
          A dive is under way: bind and realign between dives.
        </div>
      )}
      {!secondary && (
        <div className="flex flex-col gap-2" data-testid="bind-section">
          <div className="text-[14px] text-[var(--k-text-3)]">
            Bind a second element: your moves and blows can use it, and your chains keep the ones
            they have (add the element in the chain builder). Power now{' '}
            {formatNumber(profilePower(registry, profile))}.
          </div>
          {candidates.length === 0 ? (
            <div className="text-[14px] text-[var(--k-text-3)]">
              Find gear of another element to bind it.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((m) => (
                <Chip
                  key={m}
                  pressed={binding === m}
                  disabled={locked}
                  onClick={() => setBinding(m)}
                  testId={`mana-bind-${m}`}
                >
                  {glyph(m)} {style(m).name} · Power {formatNumber(boundPower(m))}
                </Chip>
              ))}
            </div>
          )}
          {binding && !locked && (
            <div
              className="flex flex-wrap items-center gap-2 text-[14px]"
              data-testid="mana-bind-ask"
            >
              <span>Bind {style(binding).name}? After that, only a Realign changes it.</span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onBind(binding)}
                testId="mana-bind-confirm"
              >
                Bind
              </Button>
              <Button size="sm" onClick={() => setBinding(null)} testId="mana-bind-cancel">
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
      {next && (
        <div className="flex flex-col gap-2" data-testid="realign-section">
          <div className="text-[14px] text-[var(--k-text-3)]">
            Realign: change your pair for{' '}
            <Price dust={cost.realignDust} scrap={cost.realignScrap} />. Gear stays as it is; your
            equipped weapon's moves and blows follow the new pair.
          </div>
          {(['primary', 'secondary'] as const).map((role) => (
            <div key={role} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 text-[14px] text-[var(--k-text-3)]">
                {role === 'primary' ? 'Primary' : 'Secondary'}
              </span>
              {MANA_TYPES.map((m) => (
                <Chip
                  key={m}
                  pressed={next[role] === m}
                  disabled={locked}
                  onClick={() =>
                    setTarget(
                      role === 'primary' ? { ...next, primary: m } : { ...next, secondary: m },
                    )
                  }
                  aria-label={style(m).name}
                  title={style(m).name}
                  testId={`realign-${role}-${m}`}
                >
                  {glyph(m)}
                </Chip>
              ))}
            </div>
          ))}
          <Button
            variant="primary"
            disabled={locked || !changed}
            onClick={onRealign}
            testId="realign-button"
          >
            Realign · <Price dust={cost.realignDust} scrap={cost.realignScrap} />
          </Button>
        </div>
      )}
      {message && (
        <div className="text-[14px] font-semibold text-[var(--k-bad-text)]" role="status">
          {message}
        </div>
      )}
    </Panel>
  );
}
```

Create `packages/client/src/features/delve/hub/skills/SkillsTab.tsx`:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHAIN_SKILLS } from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { captureNav, usePrompts, type Prompt } from '@/features/delve/kit';
import { useChainEditor } from '../../chains/useChainEditor';
import { ManaPanel } from '../../ManaPanel';
import type { HubTabProps } from '../types';
import { ApplyBar, APPLY_BINDING, applyChains } from './ApplyBar';
import { ChainLane } from './ChainLane';
import { MoveInspector } from './MoveInspector';
import { SkillList } from './SkillList';
import { useAnvilChains } from './useAnvilChains';

/**
 * The Anvil's Skills tab: the skill list and the mana pair · the chosen chain's lane with its
 * stats and rhythm · the move inspector (or the Mana view, its own scope). Its footer is the
 * Apply bar (none in the pause, whose footer stays). Keys: `[` `]` step the skills (the pad's
 * LT RT step the list), Del or a tap of Y removes the chosen move, Alt+← → move it, X picks it
 * up on the pad (the D-pad carries it, X drops it, B puts it back), Ctrl+Enter or a held Y
 * applies.
 */
export function SkillsTab({ mode, setPrompts, setFooterAction, link }: HubTabProps) {
  const anvil = useAnvilChains();
  const ed = useChainEditor(anvil.editor);
  const [mana, setMana] = useState(false);
  // The pad's carry: where the card was picked up, to put it back.
  const [carry, setCarry] = useState<number | null>(null);
  const release = useRef<(() => void) | null>(null);
  const canApply = useDelveStore((s) => !!selectDraftApply(s).dry?.ok);
  const root = useRef<HTMLDivElement>(null);
  // The latest of what a handler reads (handlers are made once), and the hub's setters, which
  // need not be stable.
  const live = useRef({ ed, carry });
  const hub = useRef({ setPrompts, setFooterAction });
  useLayoutEffect(() => {
    live.current = { ed, carry };
    hub.current = { setPrompts, setFooterAction };
  });

  // A link picks the skill, or opens the Mana view.
  useEffect(() => {
    if (link?.tab !== 'skills') return;
    if (link.skill) live.current.ed.pick(link.skill);
    setMana(link.view === 'mana');
  }, [link]);

  // The footer's group: the Apply bar (the pause keeps its own footer).
  useEffect(() => {
    if (mode === 'pause') return;
    hub.current.setFooterAction(<ApplyBar />);
    return () => hub.current.setFooterAction(null);
  }, [mode]);

  const { locked, absent, entries, fixedShape } = ed;
  const canEdit = !locked && !absent && !fixedShape;
  const step = (by: number) => {
    const i = CHAIN_SKILLS.indexOf(live.current.ed.skill);
    live.current.ed.pick(CHAIN_SKILLS[(i + by + CHAIN_SKILLS.length) % CHAIN_SKILLS.length]);
  };
  const pickUp = () => {
    setCarry(live.current.ed.index);
    release.current = captureNav((input) => {
      const { ed: now, carry: from } = live.current;
      if (input === 'left') now.shift(now.index, -1);
      else if (input === 'right') now.shift(now.index, 1);
      else if (input === 'x' || input === 'b') {
        if (input === 'b' && from !== null) now.shift(now.index, from - now.index);
        release.current?.();
        setCarry(null);
      }
    });
  };
  // Leaving the tab mid-carry lets go.
  useEffect(() => () => release.current?.(), []);

  const prompts: Prompt[] = useMemo(
    () =>
      mana
        ? [{ id: 'back', label: 'Back', binding: { key: 'Escape', pad: 'b' } }]
        : carry !== null
          ? [
              { id: 'carry', label: 'Move', binding: { pad: 'left' } },
              { id: 'drop', label: 'Drop', binding: { pad: 'x' } },
              { id: 'put-back', label: 'Put back', binding: { pad: 'b' } },
            ]
          : [
              { id: 'select', label: 'Select move', binding: { mouse: 'click', pad: 'a' } },
              {
                id: 'reorder',
                label: 'Reorder',
                binding: { mouse: 'drag', pad: 'x' },
                onPress: pickUp,
                disabled: !canEdit || entries.length < 2,
              },
              {
                id: 'remove',
                label: 'Remove',
                binding: { key: 'Delete', pad: 'y' },
                onPress: () => live.current.ed.remove(live.current.ed.index),
                disabled: !canEdit || entries.length < 2,
              },
              { id: 'skill', label: 'Next skill', binding: { key: 'BracketRight', pad: 'rt' } },
              {
                id: 'apply',
                label: 'Apply',
                binding: APPLY_BINDING,
                onPress: applyChains,
                onHold: (held) => held && applyChains(),
                disabled: !canApply,
              },
            ],
    // The handlers read `live`: only what the prompts show re-makes them.
    [mana, carry, canEdit, entries.length, canApply],
  );
  useEffect(() => {
    if (mode === 'pause') return;
    hub.current.setPrompts(prompts);
  }, [mode, prompts]);
  useEffect(() => () => hub.current.setPrompts([]), []);
  // The keys the prompt bar doesn't draw: the skill list's and the keyboard's reorder.
  usePrompts(
    [
      {
        id: 'prev-skill',
        label: 'Previous skill',
        binding: { key: 'BracketLeft' },
        onPress: () => step(-1),
      },
      {
        id: 'next-skill',
        label: 'Next skill',
        binding: { key: 'BracketRight' },
        onPress: () => step(1),
      },
      {
        id: 'earlier',
        label: 'Move earlier',
        binding: { key: 'ArrowLeft', alt: true },
        onPress: () => live.current.ed.shift(live.current.ed.index, -1),
        disabled: mana || !canEdit,
      },
      {
        id: 'later',
        label: 'Move later',
        binding: { key: 'ArrowRight', alt: true },
        onPress: () => live.current.ed.shift(live.current.ed.index, 1),
        disabled: mana || !canEdit,
      },
    ],
    root,
  );

  return (
    <div
      ref={root}
      className="grid h-full min-h-0 gap-6 px-8 py-6"
      style={{ gridTemplateColumns: '340px minmax(0, 1fr) 500px' }}
      data-testid="abilities-panel"
    >
      <SkillList ed={ed} anvil={anvil} onMana={() => setMana(true)} />
      <ChainLane ed={ed} anvil={anvil} carrying={carry !== null} />
      {mana ? (
        <ManaPanel stats={anvil.editor.stats} onBack={() => setMana(false)} />
      ) : (
        <MoveInspector ed={ed} anvil={anvil} />
      )}
    </div>
  );
}
```

In `packages/client/src/features/delve/AbilitiesPanel.tsx`, delete the line(s):

```tsx
import { ManaPanel } from './ManaPanel';
```

In `packages/client/src/features/delve/AbilitiesPanel.tsx`, delete the line(s):

```tsx
        mana={<ManaPanel stats={stats} />}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx src/features/delve/hub/skills/__tests__/ManaView.test.tsx)`
Expected: PASS (2 files, 15 tests).

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1028 tests in 127 files pass; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-2b
npx prettier --end-of-line auto --write packages/client/src/features/delve/hub/skills/SkillsTab.tsx packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx packages/client/src/features/delve/ManaPanel.tsx packages/client/src/features/delve/hub/skills/__tests__/harness.tsx packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx packages/client/src/features/delve/AbilitiesPanel.tsx
git add packages/client/src/features/delve/hub/skills/SkillsTab.tsx packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx packages/client/src/features/delve/ManaPanel.tsx packages/client/src/features/delve/hub/skills/__tests__/harness.tsx packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx packages/client/src/features/delve/AbilitiesPanel.tsx
git commit -m "feat(client): the Skills tab in three panes, its Apply bar, prompts and Mana view" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 8: The old panel goes (on ui/p2)

### Task 11: The old panel goes (on `ui/p2`, after the integrator wires the tab)

Runs on `ui/p2` once the integrator has wired `SkillsTab` into `AnvilHub` (X1), as 2A's and 2C's deletions do. The old panel's tests move onto the tab with their assertions, adapted only where the behaviour changed (the Apply bar is always there and reads "No changes"; Apply's label is its accessible name; prices in words; the lane's "n of m slots"; the chosen card carries the toolbar; the inspector's segments are radios and the fusion's main element alone is its own segment; the attunement shows in the mana pair box), plus the inspector's inline picker; their `ChainEditor` block keeps its own file. Then `AbilitiesPanel.tsx` goes.

**Files:**
- Move: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx → packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`: the old panel's tests, on the tab (its `ChainEditor` block moves out), plus the inspector's inline picker
- Create: `packages/client/src/features/delve/chains/__tests__/ChainEditor.test.tsx`: the old test file's `ChainEditor` block, unchanged
- Delete: `packages/client/src/features/delve/AbilitiesPanel.tsx`: the old panel

**Precondition:** on `ui/p2`, 2B is merged and the integrator has wired `SkillsTab` into `AnvilHub` (X1), so nothing imports `AbilitiesPanel` but its own test file.

- [ ] **Step 1: The tests move onto the tab**

Move the old panel's tests onto the tab, apply the four mechanical renames (every `render(<AbilitiesPanel />)`; the always-shown Apply bar's line in place of the draft block's presence; its `priceLine()`), and cut the `ChainEditor` block (to its own file below) with the blank line before it:

```bash
git mv packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx
sed -i -e "s|render(<AbilitiesPanel />)|renderSkills()|g" -e "s|expect(screen.queryByTestId('chain-draft')).toBeNull();|expect(priceLine()).toHaveTextContent('No changes');|g" -e "s|expect(screen.getByTestId('chain-draft')).toBeInTheDocument();|expect(priceLine()).toHaveTextContent('1 unapplied change');|g" -e "s|expect(screen.getByTestId('chain-price'))|expect(priceLine())|g" packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx
sed -i '/^describe(.ChainEditor/,$d' packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx && sed -i '$d' packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import {
  computeHeroStats,
  defaultChains,
  defaultMoveset,
```

with:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, fireEvent, within } from '@testing-library/react';
import {
  defaultMoveset,
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
import { AbilitiesPanel } from '../AbilitiesPanel';
import { ChainEditor } from '../chains/ChainEditor';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { renderSkills } from './harness';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
const apply = () => fireEvent.click(screen.getByTestId('chain-apply'));
```

with:

```tsx
const apply = () => fireEvent.click(screen.getByTestId('chain-apply'));
/** The Apply bar's line: "No changes", or "n unapplied changes · price". */
const priceLine = () => screen.getByTestId('chain-price');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
describe('AbilitiesPanel', () => {
```

with:

```tsx
describe('SkillsTab', () => {
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
describe('AbilitiesPanel: sockets and runes', () => {
```

with:

```tsx
describe('SkillsTab: sockets and runes', () => {
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('attune-fire')).toHaveAttribute('data-value', '2');
```

with:

```tsx
    expect(screen.getByTestId('mana-pair')).toHaveTextContent('Fire · 2');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, delete the line(s):

```tsx
    expect(screen.getByTestId('chain-skill-defensive')).toHaveTextContent('🔒');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent(/^Apply$/); // free: no price
```

with:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply'); // free: no price
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent(/^Apply$/); // socketing is free
```

with:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply'); // socketing is free
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(priceLine()).toHaveTextContent('✦ 5 Mana Dust (you have ✦ 4)');
```

with:

```tsx
    expect(priceLine()).toHaveTextContent('1 unapplied change · 5 Mana Dust');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · 5 Mana Dust');
```

with:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · 5 Mana Dust');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · 1 Link · 20 scrap');
```

with:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · 1 Link · 20 scrap');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · destroys Split I');
    expect(priceLine()).toHaveTextContent('Changes cost Split I (destroyed)');
```

with:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · destroys Split I');
    expect(priceLine()).toHaveTextContent('1 unapplied change · destroys Split I');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · 15 scrap');
```

with:

```tsx
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · 15 scrap');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(picker().getByTestId('rune-pull')).toHaveTextContent('Pull · ⚙ 15, back to your pouch');
```

with:

```tsx
    expect(picker().getByTestId('rune-pull')).toHaveTextContent(
      'Pull · 15 scrap, back to your pouch',
    );
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(priceLine()).toHaveTextContent(
      'Changes cost 🔗 1 Link (you have 🔗 1) and ⚙ 20 scrap (you have ⚙ 20)',
    );
```

with:

```tsx
    expect(priceLine()).toHaveTextContent('1 unapplied change · 1 Link · 20 scrap');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 2/5');
    expect(priceLine()).toHaveTextContent('No changes');
```

with:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 2 slots');
    expect(priceLine()).toHaveTextContent('No changes');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 1/5');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Add slot · 🔗 1 · ⚙ 20');
```

with:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('1 of 1 slots');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Slot1 Link · 20 scrap');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 2/5');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('2 of 2');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('🔗 2 · ⚙ 40');
```

with:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 2 slots');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('2 of 2');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('2 Links · 40 scrap');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 3/5');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('🔗 3 · ⚙ 60');
```

with:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 3 slots');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('3 Links · 60 scrap');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 1/5');
    expect(screen.queryByTestId('add-slot')).toBeNull();
```

with:

```tsx
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('1 of 1 slots');
    expect(screen.queryByTestId('add-slot')).toBeNull();
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('element-storm')).toHaveAttribute('aria-pressed', 'true');
```

with:

```tsx
    expect(screen.getByTestId('element-storm')).toHaveAttribute('aria-checked', 'true');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    fireEvent.click(screen.getByTestId('infusion-none'));
```

with:

```tsx
    fireEvent.click(screen.getByTestId('element-nature'));
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    fireEvent.click(screen.getByTestId('kind-heavy'));
    fireEvent.click(screen.getByTestId('move-left-4'));
    fireEvent.click(screen.getByTestId('move-remove-0'));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('move-2')); // the heavy, still picked
```

with:

```tsx
    fireEvent.click(screen.getByTestId('kind-heavy'));
    fireEvent.click(screen.getByTestId('move-left-4'));
    expect(screen.getByTestId('move-3')).toHaveAttribute('aria-pressed', 'true'); // the heavy
    fireEvent.click(screen.getByTestId('move-0'));
    fireEvent.click(screen.getByTestId('move-remove-0'));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('move-0'));
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('move-left-0')).toBeDisabled();
    expect(screen.getByTestId('move-right-2')).toBeDisabled();
    fireEvent.click(screen.getByTestId('move-right-0'));
```

with:

```tsx
    expect(screen.getByTestId('move-left-0')).toBeDisabled();
    expect(screen.queryByTestId('move-right-2')).toBeNull(); // only the chosen card's toolbar
    fireEvent.click(screen.getByTestId('move-2'));
    expect(screen.getByTestId('move-right-2')).toBeDisabled();
    fireEvent.click(screen.getByTestId('move-0'));
    fireEvent.click(screen.getByTestId('move-right-0'));
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 0/1');
```

with:

```tsx
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets · 0 of 1');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 1/1');
```

with:

```tsx
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets · 1 of 1');
```

In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, replace:

```tsx
  it("the readout's beat counts a Quick rune", () => {
```

with:

```tsx
  it("the inspector's socket rows open the rune picker in place of the numbers, as a scope", () => {
    socketed([null], { split: [1, 0, 0, 0, 0] });
    renderSkills();
    const readout = within(screen.getByTestId('ability-readout'));
    expect(readout.getByTestId('socket-count')).toHaveTextContent('Sockets · 1 of 1');
    fireEvent.click(readout.getByTestId('inspect-socket-0'));
    expect(readout.getByTestId('rune-picker')).toHaveAttribute('data-pad-scope');
    expect(readout.queryByTestId('num-cost')).toBeNull();
    fireEvent.click(readout.getByTestId('rune-picker-close'));
    expect(readout.queryByTestId('rune-picker')).toBeNull();
    expect(readout.getByTestId('num-cost')).toBeInTheDocument();
  });

  it("the readout's beat counts a Quick rune", () => {
```

Create `packages/client/src/features/delve/chains/__tests__/ChainEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { computeHeroStats, defaultChains } from '@alloy/engine';
import { ChainEditor } from '../ChainEditor';
import { getDelveRegistry } from '../../registry';

const registry = getDelveRegistry();
const split = { id: 'split', tier: 1 } as const;

describe('ChainEditor', () => {
  const stats = computeHeroStats({}, registry);
  const given = defaultChains(registry, 'storm', null);
  const caps = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };

  it('edits the chains it is given through onChange', () => {
    const onChange = vi.fn();
    render(
      <ChainEditor chains={given} caps={caps} stats={stats} locked={false} onChange={onChange} />,
    );
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Storm Bolt');
    fireEvent.click(screen.getByTestId('form-lance'));
    const [first, ...rest] = given.primary.moves;
    expect(onChange).toHaveBeenCalledWith(
      'primary',
      { ...given.primary, moves: [{ ...first, form: 'lance' }, ...rest] },
      given.primary.moves.map((_, i) => i), // an edit keeps every move where it was
    );
    expect(screen.queryByTestId('reaction-unknown')).toBeNull(); // the reactions live on the Codex
    expect(screen.getAllByTestId(/^attune-/)).toHaveLength(6);
  });

  it('changes nothing while locked', () => {
    const onChange = vi.fn();
    render(<ChainEditor chains={given} caps={caps} stats={stats} locked onChange={onChange} />);
    fireEvent.click(screen.getByTestId('form-lance'));
    fireEvent.click(screen.getByTestId('move-add'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with a fixed shape, moves change but never move, go or come, and the payment stays', () => {
    render(
      <ChainEditor
        chains={given}
        caps={caps}
        stats={stats}
        locked={false}
        fixedShape
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('form-lance')).toBeEnabled();
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.getByTestId('move-left-1')).not.toBeVisible();
    expect(screen.queryByTestId('payment-mana')).toBeNull();
  });

  it('reports where each move came from: ◂ ▸ move it, × drops it, + is new, an edit keeps it', () => {
    const onChange = vi.fn();
    const [m] = given.primary.moves;
    const three = {
      ...given,
      primary: {
        ...given.primary,
        moves: [
          m,
          { ...m, kind: 'medium' as const },
          { ...m, kind: 'heavy' as const, runes: [split] },
        ],
      },
    };
    render(
      <ChainEditor chains={three} caps={caps} stats={stats} locked={false} onChange={onChange} />,
    );
    const last = () => onChange.mock.lastCall!;
    fireEvent.click(screen.getByTestId('move-right-0'));
    expect(last()[2]).toEqual([1, 0, 2]);
    fireEvent.click(screen.getByTestId('move-remove-1'));
    expect(last()[2]).toEqual([0, 2]);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('move-add')); // a copy of the heavy, with no sockets
    expect(last()[2]).toEqual([0, 1, 2, null]);
    expect(last()[1].moves[3]).toEqual({ kind: 'heavy', form: m.form, elements: m.elements });
    fireEvent.click(screen.getByTestId('kind-light'));
    expect(last()[2]).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2: Run them: the tab passes them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx src/features/delve/chains/__tests__/ChainEditor.test.tsx)`
Expected: PASS (2 files, 37 tests): the tab, wired by the integrator, passes the old panel's tests.

- [ ] **Step 3: Delete the old panel**

Delete the old panel:

```bash
git rm -q packages/client/src/features/delve/AbilitiesPanel.tsx
```

- [ ] **Step 4: Run the whole suite**

Run: `(cd packages/client && npx vitest run && npx tsc --noEmit -p .)`
Expected: 1029 tests in 128 files pass (the old file's 36 tests are now 33 on the tab and 4 in `ChainEditor.test.tsx`); the typecheck prints nothing.

Run: `(cd packages/client && npx tsc -b && npx vite build)`
Expected: the client builds.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-ui-p2
npx prettier --end-of-line auto --write packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx packages/client/src/features/delve/chains/__tests__/ChainEditor.test.tsx
git add packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx packages/client/src/features/delve/chains/__tests__/ChainEditor.test.tsx
git commit -m "refactor(client): the old AbilitiesPanel goes; its tests run on the Skills tab" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Verification

After Task 10, in the 2B worktree:

```bash
cd /c/Projects/alloy-ui-2b
(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)
(cd packages/engine && npx tsup)
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
(cd packages/client && npx tsc -b && npx vite build)
git log --oneline ui/p2..HEAD
```

Expected:
- **Engine:** the typecheck prints nothing; 1651 passed | 5 skipped (the base's 1645 plus `delve-chain-cycle.test.ts`'s 6). `estimateCombat` is unchanged: it only calls the extracted `expectedHit`, and its golden numbers (`delve-rune-costs.test.ts`'s v0.51.0 table, `toBeCloseTo(…, 9)` and exact Power) and the pacing rails (`delve-pacing.test.ts`, which loads with the suite) pass as before.
- **Client:** 1028 tests in 127 files pass; the typecheck prints nothing; the build succeeds.
- **Ten commits**, one a task.

After Task 11, on `ui/p2` (with X1 wired): the client suite, typecheck and build as above (1029 tests in 128 files on the scratch copy with the X1 stand-in; the integrator's own wiring and the other areas' merges change the totals), and `git grep AbilitiesPanel -- packages/client/src` finds only comments in the kit (`kit/controls.tsx`, `kit/types.ts`).

**E2E:** the integrator runs the Delve specs on `desktop` after wiring the tab and applying X3's updates (D04, R01, G06). The scratch check rendered the tab at 1920×1080 in a dev build (a temporary wiring of the footer and prompts, not part of this plan): the skill list with its glyphs, dots and the mana pair; the lane with four cards, the chosen card's sockets, "+ socket" with its price and toolbar, "+ Slot" with its price, the four tiles and the rhythm strip with a hatched hold and an echo ghost; the inspector's segments, socket rows and numbers; the inline picker in place of the numbers; and the Mana view with its Back.
