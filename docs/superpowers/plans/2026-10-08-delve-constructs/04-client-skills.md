# Delve constructs · C1: the Skills tab — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Skills tab edits constructs (the constructs spec §3.3, §6). Each `ChainLane` shows its filled slots, its empty slots and the chain's ceiling; a dormant construct is greyed with its reason; X on a card **unsockets** it into the draft's bag. A **bag pane** under the lane lists the bag's constructs of the chosen skill: A places one into the next empty slot (or the chosen slot, whose construct goes to the bag), X salvages it at once (Undo for `UNDO_MS`). The form picker offers only the weapon class's forms. The store's draft carries the bag, and Apply commits the chains and the bag in one op (`applyDraft`), priced by uid, with the Apply sheet listing the free moves (to and from the bag, reorders) apart from the priced edits.

**Architecture:** Three layers, each already in place. (1) `useChainEditor` (the builder's model, shared with the Training dock and the stop) gains `bag`, `slots`, `ceiling`, `dormantWhy`, `unsocket` and `place`; its `onChange` loses the origins `map` and gains the bag. (2) The store's `chainDraft` is `{ uid, pair, chains, bag }`; `draftOf` turns it into the engine's `ConstructDraft`; `draftApply` reads `draftRefusal` (the rules), prices by a dry run of `applyDraft` on a copy that can pay anything, and keeps the real dry run for Apply's reason; `applyDraft` commits through the engine's `applyDraft`. (3) `useAnvilChains` binds the model to the store, reading the weapon's own chains (`movesetOf`, every construct) as the saved side, the slot table (`slotRange`, `ceilingOf`), class dormancy (`formAllowed`) and `MAX_SOCKETS`. New view: `ConstructBag.tsx`. The rest are edits: `ChainLane`, `SkillsTab`, `MoveRows`, `MoveInspector`, `FormPicker`, `ApplySheet`, `draft-lines`.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, Vitest 3 + Testing Library (jsdom), Playwright (D2 runs it).

**Spec:** `docs/superpowers/specs/2026-10-07-delve-weapon-identity-and-constructs-design.md` §3.1–3.4 (the model and the operations), §6 (the Skills tab). Overview and contract: `00-overview.md`.

---

## Base

- **Starts from:** `constructs/main` with Phase A merged, in the worktree `C:/Projects/alloy-constructs-c1` on branch `constructs/c1`, made with the junction script (the overview's Shared conventions):

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/mkwt.ps1 -Name alloy-constructs-c1 -Branch constructs/c1 -Base constructs/main
```

  Every path below is relative to that worktree's root (`/c/Projects/alloy-constructs-c1` in Git Bash). Remove it only with `rmdir /s /q` then `git worktree prune`; never `git stash` in it.
- **Before Task 1:** build the engine (the client reads its bundle) and run the Skills tests as A left them:

```bash
cd /c/Projects/alloy-constructs-c1
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/skills src/features/delve/chains src/stores/delveStore.test.ts --reporter=dot)
```

  Expected: no type errors (A's mechanical edits compile). Some Skills tests fail on A's engine (every construct op refuses "Not yet"; the slot table changed what a new save's sword holds): Task 9 settles each one.
- **No engine change** here, so no engine suite, pacing or fingerprint.

## What this plan assumes Phase A left (the overview's contract)

- `@alloy/engine` exports `Construct`, `ConstructDraft`, `applyDraft(registry, profile, draft, opts?)`, `draftRefusal(registry, profile, draft): string | null`, `placeConstruct`, `unsocketConstruct`, `salvageConstruct(registry, profile, uid, opts?)`, `constructSkill(registry, c)`, `formAllowed(registry, baseId, form)`, `slotRange(registry, owner, skill)`, `ceilingOf(registry, owner, skill)`, `MAX_SOCKETS`, and still `movesetOf`, `movesOf`, `socketsOf`, `sameChain`, `withMove`, `addSlot`, `slotPrice`, `socketPrice`, `unsocketMode`, `heroChains`, `profileStats`, `resolveChain`, `chainCycle`, `manaSupport`, `runeTargetOf`. `DraftPrice` keeps its shape (`dust`, `links`, `scrap`, `refundLinks`, `destroys`, `returns`, `pouch`). `SetChainsOptions` is `{ unsocket?: UnsocketMode }`.
- In A every op in `delve/constructs.ts` refuses "Not yet" (B2 fills them). `draftRefusal` runs the rules (a wrong skill or class, a uid in two places, a rune the pouch lacks, past the slots); if A's returns "Not yet" too, every draft reads refused until B2 and the same tests wait (Task 9's skips).
- `Move.uid` and `Blow.uid` are optional in the type and required in a save; `profile.constructs` is the bag; `DelveProfile.autoSalvagePlain`.
- A's mechanical edit of `features/delve/chains/useChainEditor.ts` and `stores/delveStore.ts` removed origins (`ChainOrigins`, `originsFor`, `applyOpts`'s `origins`, the builder's `map`) with the smallest compiling change, and the store's `transfer` calls `moveAll`, `awaken` calls `openSkill`. Tasks 1 and 2 **replace those regions whole** (the hook file, and the store's draft functions and actions by name), so A's exact edit doesn't matter; the anchors named are `2f3871b2`'s.
- `delve.json`'s weapon strings: dagger 4, maul 2, the rest 3. `balance.json → delve.movesets.slots` is the spec's table; `slotLinks` `[1, 2, 3, 4]`, `slotScrap` `[20, 40, 60, 80]` (a slot's price by its index); `editDust` 5, `elementDust` 15; `delve.runes.unsocket` ships `'pay'`, `pullScrap` `[15, 30, 50, 80, 120]`.
- A's `defaultForm`: the Primary's default form is Strike on a melee weapon. The tests below build their Primary chains by hand (Strikes on the sword), so A's fill rule for a longer chain is never assumed.
- The pinned selectors (the overview's Selectors and events): the bag pane `data-testid="construct-bag"`, its rows `data-construct={uid}`; a chain card `data-construct={uid}` and `data-dormant` when dormant; the ceiling `data-testid="chain-ceiling"`.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/chains/useChainEditor.ts` | the model: `bag`, `slots`, `ceiling`, `dormantWhy`, `weaponBaseId`, `unsocket`, `place`; `onChange(skill, chain, bag?)` (Task 1) |
| `packages/client/src/features/delve/chains/chain-text.ts` | `constructText`, `lessRunes` (Task 1) |
| `packages/client/src/features/delve/chains/__tests__/useChainEditor.test.tsx`, `ChainEditor.test.tsx` | the map tests rewritten; unsocket, place, the ceiling (Task 1) |
| `packages/client/src/stores/delveStore.ts` | `ChainDraft.bag`, `draftOf`, `priceFromDry`, `draftApply`, `editDraft`, `applyDraft`, `addSlot`, `salvageConstruct` (Task 2) |
| `packages/client/src/stores/delveStore.test.ts` | the draft block rewritten (Task 2) |
| `packages/client/src/features/delve/hub/skills/useAnvilChains.ts` | rewritten: the slot table, `MAX_SOCKETS`, `cantExpress`, `absentText`, `draftRefusal`, the bag (Task 3) |
| `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`, `draft-equipped.test.ts` | the stub's new fields; `stamped` (Task 3) |
| `packages/client/src/features/delve/hub/skills/ChainLane.tsx`, `__tests__/ChainLane.test.tsx` | empty slots, the ceiling, `data-construct`, dormant cards, the live cycle (Task 4) |
| `packages/client/src/features/delve/hub/skills/ConstructBag.tsx` (new), `__tests__/ConstructBag.test.tsx` (new) | the bag pane (Task 5) |
| `packages/client/src/features/delve/hub/skills/SkillsTab.tsx`, `__tests__/SkillsTab.test.tsx` | the bag under the lane; prompts by focus; X unsockets (Task 6) |
| `packages/client/src/features/delve/hub/skills/FormPicker.tsx`, `MoveRows.tsx`, `MoveInspector.tsx`, `__tests__/MoveRows.test.tsx` | class gating; Unsocket; the dormant note; an empty chain (Task 7) |
| `packages/client/src/features/delve/hub/skills/draft-lines.ts`, `ApplySheet.tsx`, `__tests__/draft-lines.test.ts`, `__tests__/ApplySheet.test.tsx` | the free moves apart from the priced edits (Task 8) |
| `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`, `SkillStrip.test.tsx`, `ApplyBar.test.tsx`, `SkillsTab.trail.test.tsx` | the slot table's numbers; the engine-dependent tests skipped until B2 (Task 9) |

## Where the spec left room

1. **The bag's place:** the spec says "beside the move pane". The tab's grid is the lane (1fr) beside the move pane (500 px); a third column would crowd the lane's cards. The bag goes **under the lane** in the left column (a kit plate, its own pad group), filtered to the chosen skill, so it stays short and D-pad down from a card reaches it. The right column stays the move pane.
2. **Place's target:** A on a bag row places into the **next empty slot** while the chain has one; with every slot filled it goes into the **chosen slot** and the construct there goes to the bag (spec §3.3 "in a full chain the construct it replaces goes to the bag"). A wrong-class construct is marked on its row ("A sword can't express Bolt", `bag-cant`), its A disabled, and `place` refuses it too (the keys).
3. **Dormancy's text** is the client's: `cantExpress(registry, weapon, c)` reads `formAllowed` and words it as the engine's refusal does ("A bow can't express Strike"). The contract's `dormantUids` is the same rule for moves (a blow is never in that set); the view reads `formAllowed` so a bag construct, which is on no weapon, gets the same mark.
4. **The price without an engine `draftPrice`:** the contract gives `draftRefusal` and `applyDraft` and no bag-aware price. The store prices a draft by **applying it, dry, to a copy of the profile holding `RICH` Mana Dust, Links and scrap** and reading what it spent (`priceFromDry`): dust, net Links (refunds beyond the spend read as `refundLinks`), scrap, the pouch it leaves, and the runes pulled (the runes held on the weapon and in the bag before, less after) as `destroys` or `returns` by the pull rule. `applyDraft` is pure, so the dry run costs one call. Marked `// ponytail:` in the store; if B2 ships a `draftPrice(registry, profile, draft, opts)`, swap it in (Open questions).
5. **"n unapplied changes"** counts the chains that differ, as today: the bag only changes with a chain (an unsocket or a place changes the chain it touches), so it adds no count of its own.
6. **Unsocket's floor:** the Basic keeps at least one blow (the engine refuses an empty Basic); an ability chain may empty (an empty chain plays as an uncarried skill). The sandbox's `remove` keeps "never the last" (its chains are not constructs).
7. **An unaffordable Add slot's draft rule:** the lane holds Add slot off while its chain has a change ("Apply or revert this chain first", as today), so the store's own guard after a successful `addSlot` simply drops the draft when it held that chain.
8. **Salvage from the bag** is committed at once (spec §3.3) and refused while the draft has unapplied changes: the engine can't see the draft, so the store's `salvageConstruct` refuses with `SALVAGE_WAITS` on `draftChanges` (as `startDive` does), and the pane disables its Salvage with that reason as its title, and the store's `salvageConstruct` offers Undo for `UNDO_MS` like the Loadout's salvage. C2 lists the same store action: see Needs routed.
9. **The absent skill's line** (`absentText`, in place of `carriedByText`): unarmed "Equip a weapon to build your moves."; a skill whose ceiling is 0 at this rarity "No Defensive slot on a common weapon"; else "No Defensive slot yet: Open a skill on the Forge's Temper bench".

## Conventions

The overview's. One commit a task on `constructs/c1`, staged by path, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; don't push or merge. Keep each file's line endings (new files LF); Prettier only as `npx prettier --end-of-line auto`. "Replace: … with: …" is one Edit; within a file apply edits top to bottom. Expected outputs below are expectations: this plan was drafted without running the result.

**Commands** (from the worktree root):

| What | Command |
|---|---|
| Typecheck and some client tests | `(cd packages/client && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot)` |

---

## Chunk 1: the model

## Task 1: The builder's model takes the bag

**Files:** replace `features/delve/chains/useChainEditor.ts`; modify `chains/chain-text.ts`, `chains/__tests__/useChainEditor.test.tsx`, `chains/__tests__/ChainEditor.test.tsx`.

- [ ] **Step 1: The failing tests.** In `packages/client/src/features/delve/chains/__tests__/useChainEditor.test.tsx`:

Replace:
```tsx
import { getDelveRegistry } from '../../registry';
import { useChainEditor, type ChainEditorProps } from '../useChainEditor';

const registry = getDelveRegistry();
const stats = computeHeroStats({}, registry);
const bolt = (kind: Move['kind']): Move => ({ kind, form: 'bolt', elements: ['fire'] });
```
with:
```tsx
import { createDelveProfile, formAllowed, type Blow, type Construct } from '@alloy/engine';
import { armed } from '../../__tests__/armed';
import { getDelveRegistry } from '../../registry';
import { useChainEditor, type ChainEditorProps } from '../useChainEditor';

const registry = getDelveRegistry();
const stats = computeHeroStats({}, registry);
const bolt = (kind: Move['kind'], uid?: string): Move => ({
  uid,
  kind,
  form: 'bolt',
  elements: ['fire'],
});
```

Replace the whole test `'reports each edit with where its moves came from'` (from its `it(` to its closing `});`) with:
```tsx
  it('reports each edit as the chain alone: a shift, a remove, an add, a payment', () => {
    const { result, onChange } = setup();
    act(() => result.current.shift(0, 1));
    expect(onChange).toHaveBeenLastCalledWith('primary', {
      moves: [bolt('medium'), bolt('light'), bolt('heavy')],
      payment: 'mana',
    });
    expect(result.current.index).toBe(1); // the selection follows the move
    act(() => result.current.remove(2));
    expect(onChange.mock.lastCall![1].moves).toHaveLength(2);
    act(() => result.current.add());
    expect(onChange.mock.lastCall![1].moves).toHaveLength(4);
    expect(onChange.mock.lastCall![1].moves[3]).toEqual(bolt('heavy')); // a copy, no uid
    act(() => result.current.setPayment('charge'));
    expect(onChange.mock.lastCall![1].payment).toBe('charge');
    // No bag: no edit reports one.
    expect(onChange.mock.calls.every((c) => c[2] === undefined)).toBe(true);
  });

  it('the slots and the ceiling: the caps, and the ceilings when given', () => {
    const { result } = setup({ caps: { ...caps, primary: 3 } });
    expect(result.current).toMatchObject({ slots: 3, ceiling: 3 });
    const roomy = setup({ caps: { ...caps, primary: 3 }, ceilings: { primary: 5 } });
    expect(roomy.result.current).toMatchObject({ slots: 3, ceiling: 5 });
    expect(roomy.result.current.weaponBaseId).toBe(stats.weapon.baseId);
  });

  describe('with a bag (the Anvil)', () => {
    const primary = {
      moves: [bolt('light', 'c1'), bolt('medium', 'c2'), bolt('heavy', 'c3')],
      payment: 'mana' as const,
    };
    const spare = bolt('hold', 'c9');
    const blow: Blow = { uid: 'b1', kind: 'heavy', element: 'fire' };
    const bag: Construct[] = [spare, blow];
    const withBag = (over: Partial<ChainEditorProps> = {}) =>
      setup({ chains: { ...chains, primary }, caps: { ...caps, primary: 3 }, bag, ...over });

    it('lists the bag of the chosen skill: the Primary sees its moves, the Basic its blows', () => {
      const { result } = withBag();
      expect(result.current.bag).toEqual(bag);
      expect(result.current.bagHere).toEqual([spare]);
      act(() => result.current.pick('basic'));
      expect(result.current.bagHere).toEqual([blow]);
    });

    it('unsocket sends the construct to the bag and closes the chain up; the selection and the focus stay near', () => {
      const { result, onChange } = withBag();
      act(() => result.current.select(2));
      act(() => result.current.unsocket(1));
      expect(onChange).toHaveBeenLastCalledWith(
        'primary',
        { moves: [bolt('light', 'c1'), bolt('heavy', 'c3')], payment: 'mana' },
        [...bag, bolt('medium', 'c2')],
      );
      expect(result.current.index).toBe(1);
    });

    it('an ability chain may empty; the Basic keeps one blow', () => {
      const one = withBag({ chains: { ...chains, primary: { ...primary, moves: [primary.moves[0]] } } });
      act(() => one.result.current.unsocket(0));
      expect(one.onChange).toHaveBeenLastCalledWith('primary', { moves: [], payment: 'mana' }, [
        ...bag,
        bolt('light', 'c1'),
      ]);
      const basic = withBag({ chains: { ...chains, basic: [{ uid: 'b0', kind: 'light', element: 'fire' }] } });
      act(() => basic.result.current.pick('basic'));
      act(() => basic.result.current.unsocket(0));
      expect(basic.onChange).not.toHaveBeenCalled();
    });

    it('place fills the next empty slot, or the chosen slot in a full chain, its construct to the bag', () => {
      const room = withBag({ caps: { ...caps, primary: 4 } });
      expect(room.result.current.place('c9')).toBeNull();
      expect(room.onChange).toHaveBeenLastCalledWith(
        'primary',
        { moves: [...primary.moves, spare], payment: 'mana' },
        [blow],
      );
      expect(room.result.current.index).toBe(3); // the placed construct is chosen
      const full = withBag();
      act(() => full.result.current.select(1));
      expect(full.result.current.place('c9')).toBeNull();
      expect(full.onChange).toHaveBeenLastCalledWith(
        'primary',
        { moves: [bolt('light', 'c1'), spare, bolt('heavy', 'c3')], payment: 'mana' },
        [blow, bolt('medium', 'c2')],
      );
    });

    it("place refuses another skill's construct, a dormant one and a stranger, and does nothing locked", () => {
      const { result, onChange } = withBag({ dormantText: (c) => ('form' in c ? "A sword can't express Bolt" : null) });
      expect(result.current.place('b1')).toMatch(/Basic/);
      expect(result.current.place('c9')).toBe("A sword can't express Bolt");
      expect(result.current.place('nope')).toMatch(/bag/);
      expect(result.current.dormantWhy(0)).toBe("A sword can't express Bolt");
      expect(onChange).not.toHaveBeenCalled();
      const locked = withBag({ locked: true });
      expect(locked.result.current.place('c9')).not.toBeNull();
      act(() => locked.result.current.unsocket(0));
      expect(locked.onChange).not.toHaveBeenCalled();
    });

    it('without a bag, unsocket removes outright (the sandbox)', () => {
      const { result, onChange } = setup();
      act(() => result.current.unsocket(1));
      expect(onChange.mock.lastCall![1].moves).toHaveLength(2);
      expect(onChange.mock.lastCall![2]).toBeUndefined();
    });

    it("add on an empty chain with an empty bag makes a light move of the first form the weapon's class can express", () => {
      const sword = armed(createDelveProfile(registry, 1234, { primary: 'fire' })).equipped;
      const { result, onChange } = setup({
        stats: computeHeroStats(sword, registry),
        chains: { ...chains, primary: { moves: [], payment: 'mana' } },
        bag: [],
      });
      act(() => result.current.add());
      const [made] = onChange.mock.lastCall![1].moves as Move[];
      expect(made).toMatchObject({ kind: 'light', elements: ['fire'] });
      expect(made.uid).toBeUndefined();
      expect(formAllowed(registry, 'sword', made.form)).toBe(true);
      // The sandbox names its own weapon: a bow's class gates instead.
      const bow = setup({ weaponBaseId: 'bow' });
      expect(bow.result.current.weaponBaseId).toBe('bow');
    });
  });
```

In `packages/client/src/features/delve/chains/__tests__/ChainEditor.test.tsx`, replace the whole test `'reports where each move came from: ◂ ▸ move it, × drops it, + is new, an edit keeps it'` with:
```tsx
  it('◂ ▸ move a move, × drops it, + adds a copy with no sockets and no uid, an edit keeps the rest', () => {
    const onChange = vi.fn();
    const [m] = given.primary.moves;
    const three = {
      ...given,
      primary: {
        ...given.primary,
        moves: [
          { ...m, uid: 'c1' },
          { ...m, uid: 'c2', kind: 'medium' as const },
          { ...m, uid: 'c3', kind: 'heavy' as const, runes: [split] },
        ],
      },
    };
    render(
      <ChainEditor chains={three} caps={caps} stats={stats} locked={false} onChange={onChange} />,
    );
    const last = () => onChange.mock.lastCall!;
    fireEvent.click(screen.getByTestId('move-right-0'));
    expect(last()[1].moves.map((x: Move) => x.uid)).toEqual(['c2', 'c1', 'c3']);
    fireEvent.click(screen.getByTestId('move-remove-1'));
    expect(last()[1].moves.map((x: Move) => x.uid)).toEqual(['c2', 'c3']);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('move-add')); // a copy of the heavy, with no sockets
    expect(last()[1].moves[3]).toEqual({ kind: 'heavy', form: m.form, elements: m.elements });
    fireEvent.click(screen.getByTestId('kind-light'));
    expect(last()[1].moves).toHaveLength(4);
    expect(last()[2]).toBeUndefined(); // no bag in the one-column builder
  });
```
(If the file's `Move` type isn't imported yet, add `type Move` to its `@alloy/engine` import.)

- [ ] **Step 2: Run them.** `(cd packages/client && npx vitest run src/features/delve/chains --reporter=dot)` → FAIL (`bag`, `bagHere`, `unsocket`, `place`, `slots`, `ceiling`, `weaponBaseId` are not on the model; `onChange` still takes a map if A left it).

- [ ] **Step 3: The text helpers.** In `packages/client/src/features/delve/chains/chain-text.ts`:

Replace:
```ts
/** "a", "a and b", "a, b and c". */
```
with:
```ts
/**
 * A construct's name as the bag and the Apply sheet say it, unresolved: "light Fire Bolt",
 * "medium Fire+Nature Burst", "heavy Storm blow".
 */
export function constructText(registry: DataRegistry, c: Move | Blow): string {
  if ('element' in c) return blowText(registry, c);
  const els = c.elements.map((m) => manaStyle(registry, m).name).join('+');
  return `${KIND_LABEL[c.kind]} ${els} ${registry.getForm(c.form).name}`;
}

/** `a` less `b`, rune by rune (id and tier): what left, or what came. */
export function lessRunes(a: readonly RuneRef[], b: readonly RuneRef[]): RuneRef[] {
  const left = [...b];
  return a.filter((r) => {
    const i = left.findIndex((x) => x.id === r.id && x.tier === r.tier);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

/** "a", "a and b", "a, b and c". */
```
and add `type Blow,` and `type Move,` to the file's `@alloy/engine` type imports (keep the list sorted as it is).

- [ ] **Step 4: Replace the hook.** Write `packages/client/src/features/delve/chains/useChainEditor.ts` whole:

```ts
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  MANA_TYPES,
  chainCycle,
  constructSkill,
  formAllowed,
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
  type Construct,
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
import { SKILL_NAME, blowText, markIdle, moveText, runeCandidates } from './chain-text';

export interface ChainEditorProps {
  /** Each skill's chain; a skill without one (no slot on the weapon) shows locked. */
  chains: Partial<Chains>;
  /** Each skill's slots (the Delve: the weapon's; absent or 0, the skill has no chain). */
  caps: Partial<Record<ChainSkill, number>>;
  /** Each skill's ceiling, the most slots it can buy (the Anvil); `caps` when absent. */
  ceilings?: Partial<Record<ChainSkill, number>>;
  /**
   * The move bag as the draft sees it (the Anvil): × unsockets a construct into it and A places one
   * from it. Without it × removes a move outright (the Training Grounds, the stop).
   */
  bag?: readonly Construct[];
  /** Why a construct is dormant on this weapon ("A sword can't express Bolt"), or null (the Anvil). */
  dormantText?: (c: Construct) => string | null;
  /**
   * The weapon whose class gates the form picker (the sandbox's `sandboxWeapon`, C2); the hero's
   * `stats.weapon.baseId` when absent. Null: unarmed, no form allowed.
   */
  weaponBaseId?: string | null;
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
  /** A change to one chain, with the bag when the change moved a construct into or out of it. */
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S], bag?: Construct[]) => void;
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
  /** Most sockets a move may open (`MAX_SOCKETS`, whatever weapon holds it). */
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
 * A new construct like `m`, in `allowed` elements only (its own where allowed, else the first
 * allowed), with no sockets and no uid: a new construct starts at none (Apply mints its uid).
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
  /** The weapon has no slot for the chosen skill: no chain. */
  absent: boolean;
  /** The chosen skill's slots and its ceiling. */
  slots: number;
  ceiling: number;
  /** The chosen skill's moves (its blows for the basic chain); fewer than its slots when some are empty. */
  entries: (Move | Blow)[];
  resolved: ResolvedChain | null;
  /** Each move's name: "light Fire Bolt", "heavy Fire blow". */
  names: string[];
  /** The elements the chosen skill's moves can take. */
  allowed: readonly ManaType[];
  /** A mana or cast chain's spend against the build's refill; null for charge and the basic chain. */
  support: ManaSupport | null;
  /** The weapon's name (the basic chain's cards), and its base (the form picker's class). */
  weapon: string;
  weaponBaseId: string | null;
  pool: number;
  move: Move | Blow | undefined;
  /** The chosen move's sockets, the next one's price (undefined at the cap, null when free), and why it can't open. */
  sockets: (RuneRef | null)[];
  nextSocket: { links: number; scrap: number } | null | undefined;
  openWhy: string | null;
  /** Socket indexes of move `i` whose rune does nothing there now. */
  dormant: (i: number) => number[];
  /** Why move `i` is dormant on this weapon (its class can't express it), or null. */
  dormantWhy: (i: number) => string | null;
  /** The chosen move's socket whose rune picker is open. */
  socket: number | null;
  openPicker: (move: number, socket: number) => void;
  /** The open picker's props (none closed). */
  picker: RunePickerProps | null;
  /** The chosen move replaced, the chain's payment, and the cards' edits. */
  edit: (next: Move | Blow) => void;
  setPayment: (payment: AbilityPayment) => void;
  /**
   * Move `i` by `by` places (◂ ▸, a drag, the pad's carry); the selection and the focus follow it.
   * `focus` false: the focus stays where it is (the editor's Position row).
   */
  shift: (i: number, by: number, focus?: boolean) => void;
  /** Drop move `i` outright (never a chain's last): the sandbox's ×. */
  remove: (i: number) => void;
  /**
   * Move `i` to the bag, its chain closing up (the Basic keeps one blow; an ability chain may
   * empty). Without a bag, `remove`.
   */
  unsocket: (i: number) => void;
  /**
   * Place bag construct `uid` into the next empty slot, or, with every slot filled, into the chosen
   * one, whose construct goes to the bag. Null when done; else why not (the wrong skill, a form the
   * weapon can't express, no such construct, locked).
   */
  place: (uid: string) => string | null;
  add: () => void;
  openSocket: () => void;
  /** The whole bag as the draft sees it, and its constructs of the chosen skill. */
  bag: Construct[];
  bagHere: Construct[];
  /** The chosen ability chain's damage a second (`chainCycle`: a full cycle's damage over its seconds); null for the basic chain. */
  dps: number | null;
  /** `dps` with the chosen move replaced by `next` (what an option in the editor's grids would do); null for the basic chain. */
  dpsWith: (next: Move) => number | null;
  /** The cards' container: after an add, a remove or a reorder the focus stays with the move. */
  cardsRef: RefObject<HTMLDivElement | null>;
}

/**
 * The chain builder's state and edits, from today's ChainEditor props: the chosen skill and
 * move, the chain resolved against the hero, its names and mana support, the chosen move's
 * sockets and the rune picker's, the bag's constructs of the skill, and every edit (each
 * reported through `onChange`, with the bag when it moved a construct). See the moves and chains
 * spec, the runes spec and the constructs spec.
 */
export function useChainEditor({
  chains,
  caps,
  ceilings,
  bag: bagProp,
  dormantText,
  weaponBaseId: baseIdProp,
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
  const index = entries.length > 0 ? Math.min(picked, entries.length - 1) : 0;
  const slots = caps[skill] ?? 0;
  const ceiling = ceilings?.[skill] ?? slots;
  const bag: Construct[] = bagProp ? [...bagProp] : [];
  const bagHere = bag.filter((c) => constructSkill(registry, c) === skill);
  const resolved = chain && slot ? resolveChain(registry, stats, slot, chain) : null;
  const names = resolved
    ? resolved.moves.map(moveText)
    : entries.map((b) => blowText(registry, b as Blow));
  const allowed = slot ? elements : blowElements;
  // A mana or cast chain's spend a second at its cadence against what the build brings back
  // (the engine's estimate, which Power shares).
  const support =
    resolved && resolved.payment !== 'charge' ? manaSupport(registry, stats, resolved) : null;
  const weaponBaseId = baseIdProp === undefined ? stats.weapon.baseId : baseIdProp;
  const weapon = weaponBaseId ? registry.getGearBase(weaponBaseId).name : 'Fist';
  /** A light move of the first form of the slot the weapon can express, or null (the Basic can't be empty). */
  const plain = (): Move | null => {
    if (!slot) return null;
    const form = registry
      .getArpgData()
      .forms.find((f) => f.slot === slot && formAllowed(registry, weaponBaseId, f.id));
    return form ? { kind: 'light', form: form.id, elements: [allowed[0]] } : null;
  };

  const commit = (next: (Move | Blow)[], payment = chain?.payment, nextBag?: Construct[]) => {
    if (locked) return;
    playSound('buttonClick');
    if (skill === 'basic') onChange('basic', next as Blow[], nextBag);
    else onChange(skill, { moves: next as Move[], payment: payment! } as Chain, nextBag);
  };
  // The sockets of move `i` whose rune does nothing there now: socketed, but missing from the
  // runes the engine resolved it with.
  const dormant = (i: number): number[] => {
    const on = (resolved ? resolved.moves[i]?.runes : stats.weapon.blows[i]?.runes) ?? [];
    return socketsOf(entries[i]).flatMap((r, s) =>
      r && !on.some((a) => a.id === r.id) ? [s] : [],
    );
  };
  const dormantWhy = (i: number): string | null =>
    entries[i] ? (dormantText?.(entries[i]) ?? null) : null;
  const move: Move | Blow | undefined = entries[index];
  const sockets = move ? socketsOf(move) : [];
  const nextSocket =
    runes && move && sockets.length < runes.socketCap ? runes.socketPrice(sockets.length) : undefined;
  const openWhy =
    runes && nextSocket !== undefined && !locked ? (runes.openWhy?.(skill, index) ?? null) : null;
  const current = socket === null ? null : (sockets[socket] ?? null);
  /** A chain's damage a second, by the engine's cycle. */
  const dpsOf = (c: Chain | null): number | null => {
    if (!c || !slot || c.moves.length === 0) return null;
    const cycle = chainCycle(registry, stats, resolveChain(registry, stats, slot, c));
    return cycle.seconds > 0 ? cycle.damage / cycle.seconds : null;
  };
  const setSockets = (next: (RuneRef | null)[]) =>
    commit(entries.map((e, j) => (j === index ? { ...e, runes: next } : e)));
  /** The selection after move `i` goes: the one before it, or the same place. */
  const after = (i: number) => Math.max(0, i === index ? i - 1 : index > i ? index - 1 : index);
  const remove = (i: number) => {
    if (locked || entries.length <= 1) return;
    const next = after(i);
    commit(entries.filter((_, j) => j !== i));
    setPicked(next);
    setSocket(null);
    setFocusOn([cardAt(next)]);
  };

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
    slots,
    ceiling,
    entries,
    resolved,
    names,
    allowed,
    support,
    weapon,
    weaponBaseId,
    pool,
    move,
    sockets,
    nextSocket,
    openWhy,
    dormant,
    dormantWhy,
    socket,
    openPicker: (i, s) => {
      setPicked(i);
      setSocket(s);
    },
    picker,
    edit: (next) => commit(entries.map((e, i) => (i === index ? next : e))),
    setPayment: (payment) => chain && commit(chain.moves, payment),
    shift: (i, by, focus = true) => {
      const to = i + by;
      if (locked || by === 0 || to < 0 || to >= entries.length) return;
      commit(moved(entries, i, to));
      setPicked(to);
      if (focus) setFocusOn([`[data-${by < 0 ? 'earlier' : 'later'}="${to}"]`, cardAt(to)]);
    },
    remove,
    unsocket: (i) => {
      if (!bagProp) return remove(i);
      if (locked || !entries[i] || (skill === 'basic' && entries.length <= 1)) return;
      const next = after(i);
      commit(
        entries.filter((_, j) => j !== i),
        undefined,
        [...bag, entries[i]],
      );
      setPicked(next);
      setSocket(null);
      setFocusOn([cardAt(next), '[data-testid="move-add"]']);
    },
    place: (uid) => {
      if (locked) return lockedText;
      const c = bag.find((b) => b.uid === uid);
      if (!c) return 'Not in your bag';
      const of = constructSkill(registry, c);
      if (of !== skill) return `A ${SKILL_NAME[of]} construct: it goes in the ${SKILL_NAME[of]} chain`;
      const why = dormantText?.(c) ?? null;
      if (why) return why;
      if (slots === 0) return 'No slot for it';
      const rest = bag.filter((b) => b.uid !== uid);
      if (entries.length < slots) {
        commit([...entries, c], undefined, rest);
        setPicked(entries.length);
        setFocusOn([cardAt(entries.length)]);
      } else {
        commit(
          entries.map((e, j) => (j === index ? c : e)),
          undefined,
          [...rest, entries[index]],
        );
        setFocusOn([cardAt(index)]);
      }
      setSocket(null);
      return null;
    },
    add: () => {
      if (locked || entries.length >= slots) return;
      // A copy of the chosen construct (in the allowed elements, no sockets); on an empty chain,
      // of the bag's first of the skill, else a light move of the first form the weapon can express.
      const like = entries[index] ?? bagHere[0] ?? plain();
      if (!like) return;
      commit([...entries, fitted(like, allowed)]);
      setPicked(entries.length);
      setFocusOn([cardAt(entries.length)]);
    },
    openSocket: () => setSockets([...sockets, null]),
    bag,
    bagHere,
    dps: dpsOf(chain),
    dpsWith: (next) =>
      dpsOf(chain && { ...chain, moves: chain.moves.map((m, j) => (j === index ? next : m)) }),
    cardsRef,
  };
}
```

Notes on what changed against `2f3871b2`: `order`/`map` are gone from `commit`, `shift`, `remove` and `add`; `add` on an empty chain copies the bag's first construct of the skill, else makes a light move of the first form the weapon's class can express (`plain`), so an emptied chain can always take a new construct; `weaponBaseId` is a prop the sandbox may set (C2's class gating) and otherwise the hero's; `index` is 0 on an empty chain; `dpsOf` guards an empty chain.

- [ ] **Step 5: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/chains/useChainEditor.ts src/features/delve/chains/chain-text.ts src/features/delve/chains/__tests__/useChainEditor.test.tsx src/features/delve/chains/__tests__/ChainEditor.test.tsx && npx vitest run src/features/delve/chains --reporter=dot)` → the chains tests PASS. Expect type errors elsewhere until Task 3 (`useAnvilChains.ts` passes `map` to `editDraft`; the harness's `AnvilChains` stub): Task 2 and 3 clear them; the typecheck is green at the end of Task 3.

- [ ] **Step 6: Commit.**

```bash
cd /c/Projects/alloy-constructs-c1
git add packages/client/src/features/delve/chains/useChainEditor.ts packages/client/src/features/delve/chains/chain-text.ts packages/client/src/features/delve/chains/__tests__/useChainEditor.test.tsx packages/client/src/features/delve/chains/__tests__/ChainEditor.test.tsx
git commit -m "feat(client): the chain builder's model takes the bag: unsocket, place, slots and ceiling" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 2: the store and the Anvil hook

## Task 2: The store's draft carries the bag; Apply goes through `applyDraft`

**Files:** modify `stores/delveStore.ts`, `stores/delveStore.test.ts`.

- [ ] **Step 1: The failing tests.** In `packages/client/src/stores/delveStore.test.ts`, replace the whole `describe('delveStore: runes in the draft', …)` block (from its `describe(` to the `});` before `const quick = …`) with:

```ts
describe('delveStore: the draft and its bag', () => {
  beforeEach(() => {
    localStorage.clear();
    s().resetProfile(1234, 'fire');
    s().setProfile(stampedUids(armed(s().profile))); // an uncommon sword: two Primary slots
    useDelveStore.setState({ unsocket: null });
  });

  /** Every construct on the worn weapon with a uid (`t<n>` where it has none), as a save holds them. */
  function stampedUids(p: DelveProfile): DelveProfile {
    let n = 0;
    const weapon = p.equipped.weapon!;
    const moveset = movesetOf(registry, weapon);
    const stamp = <T extends { uid?: string }>(c: T): T => ({ ...c, uid: c.uid ?? `t${++n}` });
    const chains = Object.fromEntries(
      Object.entries(moveset.chains).map(([k, c]) => [
        k,
        Array.isArray(c) ? c.map(stamp) : { ...c, moves: c.moves.map(stamp) },
      ]),
    );
    return { ...p, equipped: { ...p.equipped, weapon: { ...weapon, moveset: { ...moveset, chains } } } };
  }
  /**
   * The sword's two Primary Strikes, each one's sockets as given (none open when missing), the
   * bag `bag`, and the profile's `over`.
   */
  function strikes(
    runes: ((RuneRef | null)[] | undefined)[],
    over: Partial<DelveProfile> = {},
    bag: Construct[] = [],
  ) {
    const p = s().profile;
    const sword = p.equipped.weapon!;
    const moveset = movesetOf(registry, sword);
    const primary = moveset.chains.primary!;
    const moves = primary.moves.map((m, i) => (runes[i] ? { ...m, runes: runes[i] } : m));
    const weapon = {
      ...sword,
      moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
    };
    s().setProfile({ ...p, ...over, constructs: bag, equipped: { ...p.equipped, weapon } });
  }
  const view = () => draftApply(registry, s().profile, s().chainDraft, s().unsocket);
  const saved = () => movesetOf(registry, s().profile.equipped.weapon!).chains as Chains;

  it('with nothing pending, Apply has no total', () => {
    expect(view()).toMatchObject({ draft: null, changes: {}, price: null, dry: null });
    expect(applyLabel(registry, null)).toBe('Apply');
  });

  it("words Apply's total without emoji, as its Price draws it", () => {
    const price: DraftPrice = {
      dust: 15,
      links: 2,
      scrap: 40,
      refundLinks: 0,
      destroys: [{ id: 'split', tier: 3 }],
      returns: [],
      pouch: {},
    };
    expect(applyLabel(registry, price)).toBe(
      'Apply · 15 Mana Dust · 2 Links · 40 scrap · destroys Split III',
    );
    expect(applyLabel(registry, { ...price, links: 1, refundLinks: 2, destroys: [] })).toBe(
      'Apply · 15 Mana Dust · +1 Link · 40 scrap',
    );
  });

  it("an unsocket moves the construct to the draft's bag; placed back, nothing is pending", () => {
    strikes([]);
    const primary = saved().primary;
    const [a, b] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [b] }, [a]);
    expect(view().draft).toEqual({ chains: { primary: { ...primary, moves: [b] } }, bag: [a] });
    expect(Object.keys(view().changes)).toEqual(['primary']);
    expect(s().startDive(1)).toBe(false);
    // Back where it was: the chain and the bag read as the save's.
    s().editDraft('primary', { ...primary, moves: [a, b] }, []);
    expect(view().draft).toBeNull();
    expect(s().chainDraft?.chains).toEqual({});
  });

  it('a construct in the same place under another uid is a change (a place is free, but a change)', () => {
    const spare = { ...saved().primary.moves[0], uid: 'spare' };
    strikes([], {}, [spare]);
    const primary = saved().primary;
    s().editDraft('primary', { ...primary, moves: [spare, primary.moves[1]] }, [primary.moves[0]]);
    expect(Object.keys(view().changes)).toEqual(['primary']);
  });

  it("the draft's bag starts as the save's bag, and an edit without one keeps the draft's", () => {
    const spare = { ...saved().primary.moves[0], uid: 'spare' };
    strikes([], {}, [spare]);
    const primary = saved().primary;
    s().editDraft('primary', { ...primary, payment: 'charge' });
    expect(s().chainDraft?.bag).toEqual([spare]);
    s().editDraft('primary', { ...primary, moves: [primary.moves[1]] }, [spare, primary.moves[0]]);
    s().editDraft('primary', { ...primary, moves: [primary.moves[1]], payment: 'charge' });
    expect(s().chainDraft?.bag).toEqual([spare, primary.moves[0]]);
  });

  it('a commit with nothing pending drops the draft; one with a change pending keeps it', () => {
    strikes([]);
    const primary = saved().primary;
    s().editDraft('primary', { ...primary, moves: [primary.moves[0], primary.moves[1]] }); // no change
    s().setProfile({ ...s().profile, scrap: 1 });
    expect(s().chainDraft).toBeNull();
    s().editDraft('primary', { ...primary, payment: 'charge' });
    s().setProfile({ ...s().profile, scrap: 2 });
    expect(s().chainDraft?.chains.primary?.payment).toBe('charge');
  });

  // D2 un-skips: B2's applyDraft prices and commits the draft (A's refuses "Not yet").
  it.skip('socketing a pouch rune is free: Apply takes it from the pouch', () => {
    strikes([[null]], { runes: { split: [1, 0, 0, 0, 0] } });
    const primary = saved().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [split] }, second] });
    expect(view().price).toMatchObject({ dust: 0, links: 0, scrap: 0, refundLinks: 0 });
    expect(pouchCount(view().pouch, split)).toBe(0); // what the picker has left to offer
    expect(applyLabel(registry, view().price)).toBe('Apply');
    expect(s().applyDraft().ok).toBe(true);
    expect(saved().primary.moves[0].runes).toEqual([split]);
    expect(pouchCount(s().profile.runes, split)).toBe(0);
  });

  // D2 un-skips.
  it.skip('Apply sets the chains and the bag together: an unsocketed construct lands in the bag', () => {
    strikes([]);
    const primary = saved().primary;
    const [a, b] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [b] }, [a]);
    expect(view().price).toMatchObject({ dust: 0, links: 0, scrap: 0 });
    expect(s().applyDraft().ok).toBe(true);
    expect(saved().primary.moves).toEqual([b]);
    expect(s().profile.constructs).toEqual([a]);
    expect(s().chainDraft).toBeNull();
  });

  // D2 un-skips.
  it.skip('a new socket costs Links and scrap by its index, and Apply needs them', () => {
    strikes([], { links: 0, scrap: 20 });
    const primary = saved().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [null] }, second] });
    expect(view().price).toMatchObject({ links: 1, scrap: 20 });
    expect(applyLabel(registry, view().price)).toBe('Apply · 1 Link · 20 scrap');
    expect(view().dry).toMatchObject({ ok: false, reason: expect.stringMatching(/Links/) });
    s().setProfile({ ...s().profile, links: 1 });
    expect(s().applyDraft().ok).toBe(true);
    expect(s().profile).toMatchObject({ links: 0, scrap: 0 });
  });

  // D2 un-skips (needs a real `draftRefusal`).
  it.skip("when the engine won't price the draft, says why, and the pouch stays as it is", () => {
    strikes([[null]], { runes: {} });
    const primary = saved().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [split] }, second] });
    expect(view()).toMatchObject({ price: null, refused: 'Not enough runes in your pouch' });
    expect(view().pouch).toEqual({});
  });

  it('is one memoised result for the store until the profile, the draft or the pull rule changes', () => {
    strikes([]);
    const primary = saved().primary;
    s().editDraft('primary', { ...primary, moves: [primary.moves[1], primary.moves[0]] });
    const first = selectDraftApply(s());
    expect(first.draft).not.toBeNull();
    expect(selectDraftApply(s())).toBe(first);
    s().setUnsocket('pay');
    const paying = selectDraftApply(s());
    expect(paying).not.toBe(first);
    expect(selectDraftApply(s())).toBe(paying);
  });

  // D2 un-skips.
  it.skip('the pull rule: paying (as shipped), a pull costs scrap and the rune comes back; destroying, it is gone', () => {
    strikes([[split]], { scrap: 100 });
    const primary = saved().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [null] }, second] });
    expect(view().price).toMatchObject({ scrap: 15, destroys: [], returns: [split] });
    expect(applyLabel(registry, view().price)).toBe('Apply · 15 scrap');
    expect(pouchCount(view().pouch, split)).toBe(1); // free to socket elsewhere in this Apply
    s().setUnsocket('destroy');
    expect(view().price).toMatchObject({ scrap: 0, destroys: [split], returns: [] });
    s().setUnsocket('pay');
    expect(s().applyDraft().ok).toBe(true);
    expect(s().profile.scrap).toBe(85);
    expect(pouchCount(s().profile.runes, split)).toBe(1);
  });

  it('a salvage waits while the draft holds changes, whatever the engine says', () => {
    const spare = { ...saved().primary.moves[0], uid: 'spare' };
    strikes([], {}, [spare]);
    const primary = saved().primary;
    s().editDraft('primary', { ...primary, payment: 'charge' });
    expect(s().salvageConstruct('spare')).toMatchObject({ ok: false, reason: SALVAGE_WAITS });
    expect(s().profile.constructs).toEqual([spare]);
  });

  // D2 un-skips: B2's salvageConstruct.
  it.skip('salvaging a bag construct commits at once and offers Undo for UNDO_MS', () => {
    vi.useFakeTimers();
    const spare = { ...saved().primary.moves[0], uid: 'spare', runes: [split] };
    strikes([], { scrap: 100 }, [spare]);
    const before = s().profile;
    const res = s().salvageConstruct('spare');
    expect(res.ok).toBe(true);
    expect(s().profile.constructs).toEqual([]);
    expect(pouchCount(s().profile.runes, split)).toBe(1);
    expect(s().profile.scrap).toBe(85);
    expect(s().undo?.before).toBe(before);
    expect(s().undoSalvage()).toBe(true);
    expect(s().profile.constructs).toEqual([spare]);
    vi.advanceTimersByTime(UNDO_MS + 1);
    vi.useRealTimers();
  });

  it('reads the override back on this device, in dev builds only', async () => {
    localStorage.setItem(UNSOCKET_KEY, 'pay');
    expect(await freshUnsocket()).toBe('pay');
    localStorage.setItem(UNSOCKET_KEY, 'free'); // not a rule
    expect(await freshUnsocket()).toBeNull();
    const dev = import.meta.env.DEV;
    import.meta.env.DEV = false as unknown as boolean;
    try {
      localStorage.setItem(UNSOCKET_KEY, 'pay');
      expect(await freshUnsocket()).toBeNull();
    } finally {
      import.meta.env.DEV = dev;
    }
  });
});
```

Adjust the file's imports: add `movesetOf` and `type Construct` to the `@alloy/engine` import, `UNDO_MS` and `SALVAGE_WAITS` to the `./delveStore` import if they aren't there, and drop `defaultMoveset` and `heroChains` if nothing else in the file uses them (the file's `chains()` helper at the top reads `heroChains`: leave it if other blocks use it). `freshUnsocket`, `split`, `armed`, `applyLabel`, `draftApply`, `selectDraftApply`, `pouchCount`, `UNSOCKET_KEY` and `DraftPrice` are already imported by the old block.

- [ ] **Step 2: Run it.** `(cd packages/client && npx vitest run src/stores/delveStore.test.ts --reporter=dot)` → FAIL (`editDraft`'s third argument is a map or gone; `view().draft` is undefined; `salvageConstruct` is not a function).

- [ ] **Step 3: The store.** In `packages/client/src/stores/delveStore.ts`:

Replace the `@alloy/engine` import's lines:
```ts
  setChains as engineSetChains,
  addSlot as engineAddSlot,
  draftPrice,
  movesOf,
```
with:
```ts
  setChains as engineSetChains,
  addSlot as engineAddSlot,
  applyDraft as engineApplyDraft,
  draftRefusal,
  salvageConstruct as engineSalvageConstruct,
  unsocketMode,
  movesOf,
  movesetOf,
  socketsOf,
```
(A's edit may have already removed `draftPrice`; add what is missing.) In the same import, replace `  type ChainOrigins,` (if A left it) with nothing, and add `  type Construct,` and `  type ConstructDraft,` beside `type Chains,`. Drop `heroChains,` from it once Step 3 is done if nothing else in the file reads it (search; `transferMoveset` is A's `moveAll` by now).

Replace:
```ts
import { SKILL_NAME, listed } from '@/features/delve/chains/chain-text';
```
with:
```ts
import { SKILL_NAME, lessRunes, listed } from '@/features/delve/chains/chain-text';
```

Replace the region from `/** The Anvil builder's unapplied edits (session only): one weapon's, under one pair. */` through the end of `function applyOpts(…) { … }` (as `2f3871b2` has it: `ChainDraft`, `originsFor`, `draftChanges`, `applyOpts`; A may have shrunk it) with:

```ts
/**
 * The Anvil builder's unapplied edits (session only): one weapon's, under one pair, with the
 * move bag as the draft sees it (a construct unsocketed joins it, one placed leaves it).
 */
export interface ChainDraft {
  uid: string;
  pair: ManaPair;
  chains: Partial<Chains>;
  bag: Construct[];
}

/** Whether two chains hold the same constructs (by uid, as Apply prices them) the same way. */
function sameConstructs(
  a: Chains[ChainSkill] | undefined,
  b: Chains[ChainSkill] | undefined,
): boolean {
  return sameChain(a, b) && movesOf(a).every((m, i) => m.uid === movesOf(b)[i]?.uid);
}

/** A bag's uids as a key: its order is no change. */
const bagKey = (bag: readonly Construct[]) =>
  bag
    .map((c) => c.uid ?? '')
    .sort()
    .join();

/** The draft is this weapon's, under this pair (equipping another, a bind or a realign drops it). */
function draftFits(profile: DelveProfile, draft: ChainDraft | null): draft is ChainDraft {
  const weapon = profile.equipped.weapon;
  const { primary, secondary } = profile.pair;
  return (
    !!draft &&
    !!weapon &&
    draft.uid === weapon.uid &&
    draft.pair.primary === primary &&
    draft.pair.secondary === secondary
  );
}

/**
 * The draft's chains that still differ from the equipped weapon's own (every construct, a dormant
 * one too: the uid diff's saved side); none when the draft belongs to another weapon or pair.
 */
export function draftChanges(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ChainDraft | null,
): Partial<Chains> {
  if (!draftFits(profile, draft)) return {};
  const saved = movesetOf(registry, profile.equipped.weapon!).chains;
  return Object.fromEntries(
    CHAIN_SKILLS.filter((s) => draft.chains[s] && !sameConstructs(draft.chains[s], saved[s])).map(
      (s) => [s, draft.chains[s]],
    ),
  );
}

/** What Apply would set: the chains that differ and the draft's bag; null with nothing pending. */
export function draftOf(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ChainDraft | null,
): ConstructDraft | null {
  if (!draftFits(profile, draft)) return null;
  const chains = draftChanges(registry, profile, draft);
  if (Object.keys(chains).length === 0 && bagKey(draft.bag) === bagKey(profile.constructs))
    return null;
  return { chains, bag: draft.bag };
}

/** Why a bag construct can't be salvaged while the draft holds changes (the constructs spec, 3.3). */
export const SALVAGE_WAITS = 'Apply or discard your Skills changes first';

/** More than any draft can spend: the copy Apply is priced on. */
const RICH = 1_000_000_000;

/** The runes held on the worn weapon and in the bag. */
function heldRunes(registry: DataRegistry, p: DelveProfile): RuneRef[] {
  const weapon = p.equipped.weapon;
  const onWeapon = weapon
    ? CHAIN_SKILLS.flatMap((s) => movesOf(movesetOf(registry, weapon).chains[s]))
    : [];
  return [...onWeapon, ...p.constructs].flatMap((c) =>
    socketsOf(c).filter((r): r is RuneRef => r !== null),
  );
}

/**
 * The draft's price from a dry run of Apply on a copy of `before` that holds RICH of everything:
 * what it spent in Mana Dust, Links (net; a refund beyond the spend is `refundLinks`) and scrap,
 * the pouch it leaves, and the runes it pulled off the weapon and the bag, destroyed or returned
 * by the pull rule.
 */
// ponytail: priced by a rich dry run; swap in an engine draftPrice(registry, profile, draft, opts) if B2 adds one.
// Its multiset diff reads a rune pulled from one construct and socketed on another in the same
// Apply as no pull (the pouch and scrap still say what Apply spent); an engine price would name it.
export function priceFromDry(
  registry: DataRegistry,
  before: DelveProfile,
  after: DelveProfile,
  pay: boolean,
): DraftPrice {
  const net = RICH - after.links;
  const pulled = lessRunes(heldRunes(registry, before), heldRunes(registry, after));
  return {
    dust: RICH - after.manaDust,
    links: Math.max(0, net),
    refundLinks: Math.max(0, -net),
    scrap: RICH - after.scrap,
    destroys: pay ? [] : pulled,
    returns: pay ? pulled : [],
    pouch: after.runes,
  };
}
```

Replace the `DraftApply` interface and `draftApply` (from `/** What Apply would do with the draft: … */` through the end of `function draftApply(…) { … }`) with:

```ts
/** What Apply would do with the draft: the Anvil's builder and its Delve button both show it. */
export interface DraftApply {
  /** The engine's draft: the chains that differ and the bag; null with nothing pending. */
  draft: ConstructDraft | null;
  /** The chains it would set: the draft's that differ from the weapon's. */
  changes: Partial<Chains>;
  opts: SetChainsOptions;
  /** The total; null with nothing pending, or when the engine refuses the draft. */
  price: DraftPrice | null;
  /** Why the engine won't price the draft (`draftRefusal`: the rules); null when it prices it. */
  refused: string | null;
  /** The engine's `applyDraft` as a dry run: whether Apply goes through, and why not. */
  dry: ProfileActionResult | null;
  /** The pouch once Apply has taken what it sockets (and, paying, given back what it pulls). */
  pouch: RunePouch;
}

export function draftApply(
  registry: DataRegistry,
  profile: DelveProfile,
  chainDraft: ChainDraft | null,
  unsocket: UnsocketMode | null,
): DraftApply {
  const draft = draftOf(registry, profile, chainDraft);
  const opts: SetChainsOptions = { unsocket: unsocket ?? undefined };
  if (!draft)
    return { draft, changes: {}, opts, price: null, refused: null, dry: null, pouch: profile.runes };
  // The rules first (a wrong class, a rune the pouch lacks, a uid in two places), then the price
  // on a copy that can pay anything, then the op itself (what Apply can't afford).
  const refused = draftRefusal(registry, profile, draft);
  if (refused)
    return {
      draft,
      changes: draft.chains,
      opts,
      price: null,
      refused,
      dry: { ok: false, profile, reason: refused },
      pouch: profile.runes,
    };
  const rich = engineApplyDraft(
    registry,
    { ...profile, manaDust: RICH, links: RICH, scrap: RICH },
    draft,
    opts,
  );
  const price = rich.ok
    ? priceFromDry(registry, profile, rich.profile, unsocketMode(registry, unsocket) === 'pay')
    : null;
  return {
    draft,
    changes: draft.chains,
    opts,
    price,
    refused: rich.ok ? null : (rich.reason ?? 'Cannot apply'),
    dry: engineApplyDraft(registry, profile, draft, opts),
    // Refused, the picker shows the pouch as it is.
    pouch: price?.pouch ?? profile.runes,
  };
}
```

In the `DelveStore` interface, replace:
```ts
  /**
   * Put a chain into the builder's draft (a chain back as it was leaves it). `map`: for each of
   * its moves, the index in the chain the builder showed (null: a new move); missing, each move
   * stays where it was.
   */
  editDraft: <S extends ChainSkill>(skill: S, chain: Chains[S], map?: (number | null)[]) => void;
  /** Pay for the draft's changes and set them (`setChains`); a refusal keeps the draft. */
  applyDraft: () => ProfileActionResult;
```
with:
```ts
  /**
   * Put a chain into the builder's draft (a chain back as it was leaves it), with the bag as the
   * edit leaves it (an unsocket, a place); without `bag` the draft's bag stays (the save's at first).
   */
  editDraft: <S extends ChainSkill>(skill: S, chain: Chains[S], bag?: Construct[]) => void;
  /** Pay for the draft and set its chains and bag together (`applyDraft`); a refusal keeps the draft. */
  applyDraft: () => ProfileActionResult;
  /**
   * Melt bag construct `uid` at once (the constructs spec, 3.3): its runes to the pouch at the pull
   * price; refused while the draft has unapplied changes. Undo for `UNDO_MS`, as a salvage
   * (`undoSalvage` takes it back). C2's action: its thin body here keeps this branch typechecking
   * (the bag pane calls it); at merge C2's body wins (see Needs routed).
   */
  salvageConstruct: (uid: string) => ProfileActionResult & { runes?: RuneRef[] };
```
(A may have already changed `editDraft`'s comment and type; the replacement above is the target.)

In `commit`, replace:
```ts
    // The chain draft belongs to one weapon: equipping another (or a transfer) drops it.
    const draft = prev?.chainDraft;
    const kept = !draft || profile.equipped.weapon?.uid === draft.uid;
```
with:
```ts
    // The chain draft belongs to one weapon and one bag: equipping another (or Move all) drops
    // it, as does any save that changed the bag (a Loadout salvage's constructs; Apply nulls the
    // draft itself) or one made while it holds no change (its bag would go stale).
    const draft = prev?.chainDraft;
    const kept =
      !draft ||
      (profile.equipped.weapon?.uid === draft.uid &&
        profile.constructs === prev.profile.constructs &&
        Object.keys(draft.chains).length > 0);
```

Replace the `editDraft`, `applyDraft`, `revertDraft`, `fuseRunes` and `addSlot` members (from `    editDraft: (skill, chain, map) => {` through the end of `    addSlot: … },`) with:

```ts
    editDraft: (skill, chain, bag) => {
      const { profile, chainDraft } = get();
      const weapon = profile.equipped.weapon;
      if (!weapon) return;
      const live = draftFits(profile, chainDraft) ? chainDraft : null;
      const next: ChainDraft = {
        uid: weapon.uid,
        pair: profile.pair,
        chains: { ...draftChanges(registry(), profile, chainDraft), [skill]: chain },
        bag: bag ?? live?.bag ?? profile.constructs,
      };
      // Only what differs from the weapon is kept: an edit undone by hand leaves nothing.
      set({ chainDraft: { ...next, chains: draftChanges(registry(), profile, next) } });
    },

    applyDraft: () => {
      const { profile, chainDraft } = get();
      const draft = draftOf(registry(), profile, chainDraft) ?? {
        chains: {},
        bag: profile.constructs,
      };
      const res = applyResult(engineApplyDraft(registry(), profile, draft, pull()));
      if (res.ok) set({ chainDraft: null });
      return res;
    },

    revertDraft: () => set({ chainDraft: null }),

    fuseRunes: (ref) => applyResult(engineFuseRunes(registry(), get().profile, ref)),

    addSlot: (skill) => {
      const res = applyResult(engineAddSlot(registry(), get().profile, skill));
      // A chain's draft was made on fewer slots: the draft goes (the lane holds Add slot off while
      // that chain has a change, so this is the store's own guard).
      if (res.ok && get().chainDraft?.chains[skill]) set({ chainDraft: null });
      return res;
    },

    salvageConstruct: (uid) => {
      const before = get().profile;
      // The engine can't see the draft: a salvage waits while it holds changes, as a dive does
      // (the pane's Salvage is off then too, but the keys reach here).
      if (Object.keys(draftChanges(registry(), before, get().chainDraft)).length > 0)
        return { ok: false, profile: before, reason: SALVAGE_WAITS };
      const res = applyResult(engineSalvageConstruct(registry(), before, uid, pull()));
      if (res.ok) {
        // Something melted: Undo may take it back for UNDO_MS.
        const undo: SalvageUndo = { before, after: res.profile, newUids: {} };
        set({ undo });
        setTimeout(() => {
          if (get().undo === undo) set({ undo: null });
        }, UNDO_MS);
      }
      return res;
    },
```

Replace the `setChains` member's comment if it still says Mana Dust alone: fine as is (`engineSetChains` stays, by uid).

- [ ] **Step 4: Run it.** `(cd packages/client && npx tsc --noEmit -p . 2>&1 | head -40; npx prettier --end-of-line auto --write src/stores/delveStore.ts src/stores/delveStore.test.ts && npx vitest run src/stores/delveStore.test.ts --reporter=dot)` → the store tests PASS with 6 skipped. The typecheck still names `useAnvilChains.ts` (`map`) and the harness; Task 3 clears them.

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-constructs-c1
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts
git commit -m "feat(client): the chain draft carries the bag; Apply goes through the engine's applyDraft" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 3: The Anvil hook: the slot table, class dormancy, the bag

**Files:** replace `hub/skills/useAnvilChains.ts`; modify `hub/skills/__tests__/harness.tsx`, `hub/skills/__tests__/draft-equipped.test.ts`.

- [ ] **Step 1: The failing test.** In `packages/client/src/features/delve/hub/skills/__tests__/draft-equipped.test.ts`, append inside its `describe` (before its closing `});`):

```ts
  it("merges the draft's chains over the weapon's own, the rest of the moveset kept", () => {
    const p = armed(createDelveProfile(registry, 1234, { primary: 'fire' }));
    const weapon = p.equipped.weapon!;
    const own = movesetOf(registry, weapon);
    const primary = { ...own.chains.primary!, payment: 'charge' as const };
    const out = draftEquipped(registry, p.equipped, { primary }).weapon!;
    expect(out.moveset!.chains.primary).toEqual(primary);
    expect(out.moveset!.chains.basic).toEqual(own.chains.basic);
    expect(out.moveset!.slots).toEqual(own.slots);
  });

  it('cantExpress names the form a weapon of another class holds; absentText the slot it lacks', () => {
    const p = armed(createDelveProfile(registry, 1234, { primary: 'fire' })); // an uncommon sword
    const sword = p.equipped.weapon!;
    expect(cantExpress(registry, sword, { kind: 'light', form: 'bolt', elements: ['fire'] })).toBe(
      "A sword can't express Bolt",
    );
    expect(cantExpress(registry, sword, { kind: 'light', form: 'lance', elements: ['fire'] })).toBeNull();
    expect(cantExpress(registry, sword, { kind: 'light', element: 'fire' })).toBeNull();
    expect(absentText(registry, null, 'primary')).toBe('Equip a weapon to build your moves.');
    expect(absentText(registry, sword, 'ultimate')).toBe(
      "No Ultimate slot yet: Open a skill on the Forge's Temper bench",
    );
    expect(absentText(registry, { ...sword, rarity: 'common' }, 'ultimate')).toBe(
      'No Ultimate slot on a common weapon',
    );
  });
```
and add `movesetOf` to its `@alloy/engine` import and `absentText, cantExpress` to its `../useAnvilChains` import.

- [ ] **Step 2: Run it.** `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/draft-equipped.test.ts --reporter=dot)` → FAIL (`cantExpress` and `absentText` aren't exported).

- [ ] **Step 3: Replace the hook.** Write `packages/client/src/features/delve/hub/skills/useAnvilChains.ts` whole:

```ts
import { useMemo } from 'react';
import { create } from 'zustand';
import {
  CHAIN_SKILLS,
  MAX_SOCKETS,
  addSlot,
  applyDraft as engineApplyDraft,
  ceilingOf,
  draftRefusal,
  formAllowed,
  heroChains,
  isDiveActive,
  movesOf,
  movesetOf,
  pairElements,
  profileStats,
  slotPrice,
  slotRange,
  socketPrice,
  socketsOf,
  unsocketMode,
  withMove,
  type ChainSkill,
  type Chains,
  type Construct,
  type DataRegistry,
  type EquippedGear,
  type GearItem,
} from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { RARITY_LABEL } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME } from '../../chains/chain-text';
import type { ChainEditorProps, ChainRunes } from '../../chains/ChainEditor';

/** The last refused Apply, Add slot or Place, in the engine's words (the lane's message line); null once one goes through. */
export const useChainMessage = create<{ text: string | null }>(() => ({ text: null }));

/** Say a builder op's refusal on the lane, or clear it when the op went through. */
export function sayRefusal(res: { ok: boolean; reason?: string }, fallback: string): void {
  useChainMessage.setState({ text: res.ok ? null : (res.reason ?? fallback) });
}

/**
 * The worn gear with the weapon holding `chains` over its own (the builder's: the draft's chains
 * over the saved ones): what the builder's stats resolve against, and what Try in Training loads
 * into the sandbox. Unarmed, the gear as worn.
 */
export function draftEquipped(
  registry: DataRegistry,
  equipped: EquippedGear,
  chains: Partial<Chains>,
): EquippedGear {
  const weapon = equipped.weapon;
  if (!weapon) return equipped;
  const moveset = movesetOf(registry, weapon);
  return {
    ...equipped,
    weapon: { ...weapon, moveset: { ...moveset, chains: { ...moveset.chains, ...chains } } },
  };
}

/**
 * Why construct `c` is dormant on `weapon` (the constructs spec, 3.1): its form is outside the
 * weapon's class, worded as the engine refuses a place ("A bow can't express Strike"); null when
 * it plays. A blow always plays (its runes may not: the socket marks say so).
 */
export function cantExpress(registry: DataRegistry, weapon: GearItem, c: Construct): string | null {
  if (!('form' in c) || formAllowed(registry, weapon.baseId, c.form)) return null;
  const name = registry.getGearBase(weapon.baseId).name.toLowerCase();
  return `A ${name} can't express ${registry.getForm(c.form).name}`;
}

/** The line a skill with no chain shows: unarmed, no slot at this rarity, or Open a skill. */
export function absentText(registry: DataRegistry, weapon: GearItem | null, s: ChainSkill): string {
  if (!weapon) return 'Equip a weapon to build your moves.';
  if (ceilingOf(registry, weapon, s) === 0)
    return `No ${SKILL_NAME[s]} slot on a ${RARITY_LABEL[weapon.rarity].toLowerCase()} weapon`;
  return `No ${SKILL_NAME[s]} slot yet: Open a skill on the Forge's Temper bench`;
}

/** The Anvil's chain builder: its props, and the slots the equipped weapon sells. */
export interface AnvilChains {
  /** `useChainEditor`'s props, bound to the store's draft of the weapon's moveset and the bag. */
  editor: ChainEditorProps;
  weapon: GearItem | null;
  /** The weapon's own chains, every construct (the uid diff's saved side); unarmed, the default. */
  saved: Partial<Chains>;
  /** The skills the draft changes. */
  changed: Partial<Chains>;
  /** The bag as the draft sees it (the save's with nothing pending). */
  bag: Construct[];
  /** A chain's next slot: its price (null: none to buy), and why it can't be bought now. */
  slotOffer: (skill: ChainSkill) => {
    price: { links: number; scrap: number } | null;
    why: string | null;
  };
  buySlot: (skill: ChainSkill) => void;
}

/**
 * The Anvil's workshop: the equipped weapon's chains and the move bag, edited as a draft (kept
 * in the store, so it outlives the tab) that Apply pays for, all or nothing, or Revert drops;
 * each chain's slots against its ceiling, with the next slot's price; each construct's sockets
 * and runes, which the draft carries too. Read-only while a dive is under way, and unarmed (the
 * unarmed default shows).
 */
export function useAnvilChains(): AnvilChains {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const unsocket = useDelveStore((s) => s.unsocket);
  const { equipped, pair } = profile;
  const weapon = equipped.weapon;
  // The weapon's own chains, dormant constructs included; unarmed the bare hands' default.
  const saved = useMemo(
    () => (weapon ? movesetOf(registry, weapon).chains : heroChains(registry, equipped, pair)),
    [registry, weapon, equipped, pair],
  );
  // The draft against the weapon: the skills it changes, its bag, Apply's options, the engine's
  // dry run and the pouch it leaves; and the chains shown.
  const view = useDelveStore(selectDraftApply);
  const changed = view.changes;
  const bag = view.draft?.bag ?? profile.constructs;
  const chains = useMemo(() => ({ ...saved, ...changed }), [saved, changed]);
  // Each skill's slots and ceiling: the weapon's, or unarmed the bare hands' (the basic string, no ability slot).
  const slots = Object.fromEntries(
    CHAIN_SKILLS.map((s) => [
      s,
      weapon ? (movesetOf(registry, weapon).slots[s] ?? 0) : slotRange(registry, null, s)[0],
    ]),
  ) as Partial<Record<ChainSkill, number>>;
  const ceilings = Object.fromEntries(
    CHAIN_SKILLS.map((s) => [s, ceilingOf(registry, weapon ?? null, s)]),
  ) as Partial<Record<ChainSkill, number>>;
  const stats = useMemo(
    () =>
      profileStats(registry, { pair, equipped: draftEquipped(registry, equipped, chains) }),
    [registry, equipped, pair, chains],
  );
  const elements = pairElements(pair);
  const mode = unsocketMode(registry, unsocket);
  const pullScrap = registry.getDelveBalance().runes.pullScrap;
  // The weapon's sockets: the pouch the draft leaves, the cap (every construct's), the price by
  // index, the pull rule's text, and the engine's dry run with one more socket on a move: why
  // "+ socket" is off (a draft already refused says so itself).
  const runes: ChainRunes | undefined = weapon
    ? {
        pouch: view.pouch,
        socketCap: MAX_SOCKETS,
        socketPrice: (open) => socketPrice(registry, open),
        weaponBaseId: weapon.baseId,
        pullText: (r) =>
          mode === 'destroy'
            ? 'Pull · destroys it'
            : `Pull · ${pullScrap[r.tier - 1]} scrap, back to your pouch`,
        openWhy: (skill, index) => {
          const chain = chains[skill];
          if (!chain || view.refused) return null;
          const m = movesOf(chain)[index];
          if (!m) return null;
          const next = withMove(chain, index, { ...m, runes: [...socketsOf(m), null] });
          const draft = { chains: { ...changed, [skill]: next }, bag };
          // The rules first; then the op itself, which alone knows the price ("Not enough Links").
          // Until B2 merges, A's `applyDraft` refuses "Not yet", so every Open a socket row reads
          // off on `constructs/main`; Task 7's `socket-open` assertion (`toBeInTheDocument`) still holds.
          // ponytail: computed on each render of the editor; memoise per (skill, index) on
          // `draft` if the editor feels slow once B2's op is real.
          const rule = draftRefusal(registry, profile, draft);
          if (rule) return rule;
          const dry = engineApplyDraft(registry, profile, draft, view.opts);
          return dry.ok ? null : (dry.reason ?? null);
        },
      }
    : undefined;

  return {
    editor: {
      chains,
      caps: slots,
      ceilings,
      bag,
      dormantText: weapon ? (c) => cantExpress(registry, weapon, c) : undefined,
      stats,
      locked: isDiveActive(profile) || !weapon,
      lockedText: weapon ? undefined : 'Equip a weapon to build your moves.',
      absentText: (s) => absentText(registry, weapon ?? null, s),
      onChange: (skill, chain, next) => useDelveStore.getState().editDraft(skill, chain, next),
      elements: elements.length > 0 ? elements : undefined,
      runes,
    },
    weapon: weapon ?? null,
    saved,
    changed,
    bag,
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
      sayRefusal(res, 'Cannot add a slot');
    },
  };
}
```

`RARITY_LABEL` is `features/delve/format.ts`'s (the Loadout's `BagPane` imports it); if its values are already lower case, drop the `.toLowerCase()`.

- [ ] **Step 4: The harness.** In `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`:

Replace:
```tsx
  const anvil: AnvilChains = {
    editor: props,
    weapon: null,
    changed: {},
    slotOffer: () => ({ price: null, why: null }),
    buySlot: () => {},
  };
```
with:
```tsx
  const anvil: AnvilChains = {
    editor: props,
    weapon: null,
    saved: props.chains,
    changed: {},
    bag: props.bag ? [...props.bag] : [],
    slotOffer: () => ({ price: null, why: null }),
    buySlot: () => {},
  };
```

Append at the end of the file:
```tsx
/**
 * `p` with every construct on its worn weapon given a uid where it has none (`t<n>`), as a save
 * holds them: Apply's uid diff and the bag need them (`armed` and `defaultMoveset` mint none).
 */
export function stamped(p: DelveProfile): DelveProfile {
  let n = 0;
  const weapon = p.equipped.weapon;
  if (!weapon) return p;
  const moveset = movesetOf(getDelveRegistry(), weapon);
  const stamp = <T extends { uid?: string }>(c: T): T => ({ ...c, uid: c.uid ?? `t${++n}` });
  const chains = Object.fromEntries(
    Object.entries(moveset.chains).map(([k, c]) => [
      k,
      Array.isArray(c) ? c.map(stamp) : { ...c, moves: c.moves.map(stamp) },
    ]),
  );
  return { ...p, equipped: { ...p.equipped, weapon: { ...weapon, moveset: { ...moveset, chains } } } };
}

/** A Strike chain of `kinds`, each move with a uid (`p<n>`), in Fire, paid with mana. */
export function strikes(kinds: readonly MoveKind[]): Chain {
  return {
    moves: kinds.map((kind, i) => ({ uid: `p${i + 1}`, kind, form: 'strike', elements: ['fire'] })),
    payment: 'mana',
  };
}

/**
 * The store's worn sword made epic (every skill has slots), each chain at its ceiling (or
 * `slots`), the Primary four Strikes (light, medium, medium, heavy) with uids `p1`–`p4`, the rest
 * the epic's defaults, `over` on top; every construct with a uid.
 */
export function roomy(
  over: Partial<Chains> = {},
  slots: Partial<Record<ChainSkill, number>> = {},
): void {
  const registry = getDelveRegistry();
  const store = useDelveStore.getState();
  const p = store.profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const base = defaultMoveset(registry, weapon, 'fire');
  const all = Object.fromEntries(
    CHAIN_SKILLS.map((s) => [s, slots[s] ?? ceilingOf(registry, weapon, s)]),
  ) as Record<ChainSkill, number>;
  const chains = { ...base.chains, primary: strikes(['light', 'medium', 'medium', 'heavy']), ...over };
  store.setProfile(
    stamped({
      ...p,
      equipped: { ...p.equipped, weapon: { ...weapon, moveset: { ...base, chains, slots: all } } },
    }),
  );
}
```
and add to its imports:
```tsx
import {
  CHAIN_SKILLS,
  ceilingOf,
  defaultMoveset,
  movesetOf,
  type Chain,
  type Chains,
  type ChainSkill,
  type DelveProfile,
  type MoveKind,
} from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
```
(`defaultMoveset(registry, owner, element, slots?)` is the contract's; `roomy` passes no `slots`, so each default chain sits at the epic's start, and `all` lifts the weapon's `slots` to the ceilings. A chain in `over` longer than its slot count is the caller's mistake.)

- [ ] **Step 5: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/hub/skills/useAnvilChains.ts src/features/delve/hub/skills/__tests__/harness.tsx src/features/delve/hub/skills/__tests__/draft-equipped.test.ts && npx vitest run src/features/delve/hub/skills/__tests__/draft-equipped.test.ts src/features/delve/chains src/stores/delveStore.test.ts --reporter=dot)` → no type errors (the first green typecheck of the branch); PASS. The other Skills tests still fail where A's engine refuses or the slot table moved the numbers: Tasks 4–9.

- [ ] **Step 6: Commit.**

```bash
cd /c/Projects/alloy-constructs-c1
git add packages/client/src/features/delve/hub/skills/useAnvilChains.ts packages/client/src/features/delve/hub/skills/__tests__/harness.tsx packages/client/src/features/delve/hub/skills/__tests__/draft-equipped.test.ts
git commit -m "feat(client): the Anvil's builder reads the slot table, class dormancy and the bag" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 3: the lane, the bag pane, the tab

## Task 4: The lane shows every slot, the ceiling and the dormant constructs

**Files:** modify `hub/skills/ChainLane.tsx`, `hub/skills/__tests__/ChainLane.test.tsx`.

- [ ] **Step 1: The failing tests.** In `packages/client/src/features/delve/hub/skills/__tests__/ChainLane.test.tsx`:

Replace:
```tsx
import { dropIndex } from '../ChainLane';
import { Panes } from './harness';
```
with:
```tsx
import { EMPTY_CHAIN, dropIndex } from '../ChainLane';
import { Panes } from './harness';
```

Append inside `describe('ChainLane', …)`, before its closing `});`:
```tsx
  it('shows the filled slots, "+ Move" in the first empty slot, a well for each other, and the ceiling', () => {
    render(<Panes chains={chains} caps={{ ...caps, primary: 5 }} stats={stats} locked={false} onChange={vi.fn()} />);
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(2);
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 5 slots');
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(screen.getAllByTestId('slot-empty')).toHaveLength(2); // 5 slots: 2 cards, + Move, 2 wells
    expect(screen.getByTestId('chain-ceiling')).toHaveTextContent('at its ceiling');
    expect(screen.getByTestId('chain-ceiling')).toHaveAttribute('data-ceiling', '5');
  });

  it('says "up to n" while the chain is under its ceiling', () => {
    render(
      <Panes chains={chains} caps={{ ...caps, primary: 2 }} ceilings={{ primary: 4 }} stats={stats} locked={false} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 2 slots');
    expect(screen.getByTestId('chain-ceiling')).toHaveTextContent('up to 4');
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.queryByTestId('slot-empty')).toBeNull();
  });

  it("each card carries its construct's uid; a dormant one is greyed with its reason, and the stats skip it", () => {
    const withUids: Chains = {
      ...chains,
      primary: {
        moves: [bolt({ kind: 'light', uid: 'c1' }), bolt({ kind: 'hold', uid: 'c2' })],
        payment: 'mana',
      },
    };
    render(
      <Panes
        chains={withUids}
        caps={caps}
        stats={stats}
        locked={false}
        onChange={vi.fn()}
        dormantText={(c) => ('form' in c && c.kind === 'hold' ? "A sword can't express Bolt" : null)}
      />,
    );
    expect(screen.getByTestId('move-0')).toHaveAttribute('data-construct', 'c1');
    expect(screen.getByTestId('move-0')).not.toHaveAttribute('data-dormant');
    expect(screen.getByTestId('move-1')).toHaveAttribute('data-construct', 'c2');
    expect(screen.getByTestId('move-1')).toHaveAttribute('data-dormant');
    expect(screen.getByTestId('move-1')).toHaveAccessibleName('held Fire Bolt, dormant');
    expect(screen.getByTestId('card-dormant')).toHaveTextContent("Dormant: A sword can't express Bolt");
    // The cycle is the chain's as it plays: the light Bolt alone.
    const alone = { moves: [withUids.primary.moves[0]], payment: 'mana' as const };
    const cycle = chainCycle(registry, stats, resolveChain(registry, stats, 'primary', alone));
    expect(screen.getByTestId('stat-damage')).toHaveTextContent(formatNumber(cycle.damage));
  });

  it('an empty chain says so, with "+ Move" and no stats', () => {
    const empty: Chains = { ...chains, primary: { moves: [], payment: 'mana' } };
    render(<Panes chains={empty} caps={caps} stats={stats} locked={false} onChange={vi.fn()} />);
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(EMPTY_CHAIN);
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('0 of 5 slots');
    expect(screen.queryByTestId(/^move-\d$/)).toBeNull();
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(screen.queryByTestId('chain-stats')).toBeNull();
  });
```

- [ ] **Step 2: Run them.** `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/ChainLane.test.tsx --reporter=dot)` → FAIL (`EMPTY_CHAIN` isn't exported; no `chain-ceiling`, `slot-empty`, `data-construct`).

- [ ] **Step 3: Implement.** In `packages/client/src/features/delve/hub/skills/ChainLane.tsx`:

Replace:
```tsx
import {
  chainCycle,
  socketsOf,
  type AbilityPayment,
```
with:
```tsx
import {
  chainCycle,
  resolveChain,
  socketsOf,
  type AbilityPayment,
```

Replace:
```tsx
/** A card the mouse is dragging: its place, where the press began, and a place's width. */
```
with:
```tsx
/** The summary of a chain with no construct in it. */
export const EMPTY_CHAIN = 'No construct in this chain: place one from your bag, or add a move.';

/** A card the mouse is dragging: its place, where the press began, and a place's width. */
```

Replace:
```tsx
  const { skill, entries, index, names, locked, absent, chain, resolved } = ed;
  const { caps, stats, runes, absentText } = anvil.editor;
  const slots = caps[skill] ?? 0;
```
with:
```tsx
  const { skill, slot, entries, index, names, locked, absent, chain, resolved, slots, ceiling } =
    ed;
  const { stats, runes, absentText } = anvil.editor;
```

Replace:
```tsx
  const cycle = resolved ? chainCycle(registry, stats, resolved) : null;
```
with:
```tsx
  // The cycle of the chain as it plays: a dormant construct (one the weapon's class can't
  // express) is skipped, as `heroChains` skips it.
  const playing =
    chain && slot && entries.some((_, i) => ed.dormantWhy(i))
      ? resolveChain(registry, stats, slot, {
          ...chain,
          moves: chain.moves.filter((_, i) => !ed.dormantWhy(i)),
        })
      : resolved;
  const cycle = playing && playing.moves.length > 0 ? chainCycle(registry, stats, playing) : null;
```

Replace:
```tsx
            <span data-testid="chain-slots">
              {entries.length} of {slots} slots
            </span>
            {chain
```
with:
```tsx
            <span data-testid="chain-slots">
              {entries.length} of {slots} slots
            </span>
            {' · '}
            <span data-testid="chain-ceiling" data-ceiling={ceiling}>
              {slots < ceiling ? `up to ${ceiling}` : 'at its ceiling'}
            </span>
            {chain
```

Replace:
```tsx
        {absent ? absentText?.(skill) : chainText(names)}
```
with:
```tsx
        {absent ? absentText?.(skill) : entries.length === 0 ? EMPTY_CHAIN : chainText(names)}
```

Replace:
```tsx
          const off = offPair(e, ed.allowed);
          const moving = drag?.i === i;
```
with:
```tsx
          const off = offPair(e, ed.allowed);
          const why = ed.dormantWhy(i);
          const moving = drag?.i === i;
```

Replace:
```tsx
                  background: on ? 'var(--k-wood-0)' : undefined,
                  transform: moving ? `translateX(${drag.dx}px)` : undefined,
```
with:
```tsx
                  background: on ? 'var(--k-wood-0)' : undefined,
                  opacity: why ? 0.6 : undefined,
                  transform: moving ? `translateX(${drag.dx}px)` : undefined,
```

Replace:
```tsx
                  data-card={i}
                  className="flex flex-col gap-3 bg-transparent p-0 text-left"
                  aria-pressed={on}
                  aria-label={off ? `${names[i]}, off-pair` : names[i]}
```
with:
```tsx
                  data-card={i}
                  data-construct={e.uid}
                  data-dormant={why ? '' : undefined}
                  className="flex flex-col gap-3 bg-transparent p-0 text-left"
                  aria-pressed={on}
                  aria-label={[names[i], off && 'off-pair', why && 'dormant']
                    .filter(Boolean)
                    .join(', ')}
```

Replace:
```tsx
                  {off && (
                    <span className="text-[16px] text-[var(--k-hot)]" data-testid="card-off-pair">
                      off-pair
                    </span>
                  )}
                </button>
```
with:
```tsx
                  {off && (
                    <span className="text-[16px] text-[var(--k-hot)]" data-testid="card-off-pair">
                      off-pair
                    </span>
                  )}
                  {why && (
                    <span className="text-[16px] text-[var(--k-hot)]" data-testid="card-dormant">
                      Dormant: {why}
                    </span>
                  )}
                </button>
```

Replace (the end of the "+ Move" button, before "+ Slot"):
```tsx
            <span className="k-disp text-[18px] text-[var(--k-text-2)]">+ Move</span>
            free slot
          </button>
        )}
        {!absent && offer.price && (
```
with:
```tsx
            <span className="k-disp text-[18px] text-[var(--k-text-2)]">+ Move</span>
            free slot
          </button>
        )}
        {/* The slots past "+ Move", empty: marks, not stops. */}
        {!absent &&
          Array.from({ length: Math.max(0, slots - entries.length - 1) }, (_, k) => (
            <span
              key={k}
              aria-hidden
              className="flex flex-[0_0_150px] items-center justify-center border-2 border-dashed border-[var(--k-steel-1)] text-[16px] text-[var(--k-text-3)]"
              data-testid="slot-empty"
            >
              empty slot
            </span>
          ))}
        {!absent && offer.price && (
```

Update the component's doc comment: replace `"+ Move" while a slot is free and "+ Slot"` with `"+ Move" in the first empty slot, a dashed well for each other empty slot, the ceiling in the header ("up to 4"), a dormant card greyed with its reason (`data-dormant`), and "+ Slot"`.

- [ ] **Step 4: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/hub/skills/ChainLane.tsx src/features/delve/hub/skills/__tests__/ChainLane.test.tsx && npx vitest run src/features/delve/hub/skills/__tests__/ChainLane.test.tsx --reporter=dot)` → no type errors; PASS (10 tests). The old "the basic chain shows its blows" test reads "3 of 5 slots": `caps.basic` is 5 in the fixture, unchanged.

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-constructs-c1
git add packages/client/src/features/delve/hub/skills/ChainLane.tsx packages/client/src/features/delve/hub/skills/__tests__/ChainLane.test.tsx
git commit -m "feat(client): the chain lane shows empty slots, the ceiling and dormant constructs" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 5: The bag pane

**Files:** create `hub/skills/ConstructBag.tsx`, `hub/skills/__tests__/ConstructBag.test.tsx`; modify `hub/skills/__tests__/harness.tsx`.

- [ ] **Step 1: The harness draws the bag.** In `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`:

Replace:
```tsx
import { ChainLane } from '../ChainLane';
import { MoveInspector } from '../MoveInspector';
```
with:
```tsx
import { ChainLane } from '../ChainLane';
import { ConstructBag } from '../ConstructBag';
import { MoveInspector } from '../MoveInspector';
```

Replace:
```tsx
/** The Skills panes over any chains (no store draft, nothing to buy), as the Anvil draws them. */
export function Panes(props: ChainEditorProps) {
  const ed = useChainEditor(props);
```
with:
```tsx
/**
 * The Skills panes over any chains (no store draft, nothing to buy), as the Anvil draws them;
 * `changed` names the skills the stand-in draft changes (the bag's Salvage waits on them).
 */
export function Panes({ changed = {}, ...props }: ChainEditorProps & { changed?: Partial<Chains> }) {
  const ed = useChainEditor(props);
```

Replace:
```tsx
    saved: props.chains,
    changed: {},
```
with:
```tsx
    saved: props.chains,
    changed,
```

Replace:
```tsx
      <ChainLane ed={ed} anvil={anvil} onEdit={onEdit} />
      <MoveInspector
```
with:
```tsx
      <ChainLane ed={ed} anvil={anvil} onEdit={onEdit} />
      <ConstructBag ed={ed} anvil={anvil} />
      <MoveInspector
```
and add `type Chains` to the harness's `@alloy/engine` import.

- [ ] **Step 2: The failing tests.** Create `packages/client/src/features/delve/hub/skills/__tests__/ConstructBag.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  computeHeroStats,
  defaultChains,
  type Blow,
  type Chains,
  type Construct,
  type Move,
  type ProfileActionResult,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../../registry';
import { SALVAGE_WAITS } from '../ConstructBag';
import { Panes } from './harness';

// The constructs spec, 6: the bag pane, filtered to the chosen skill; A places, X salvages.

const registry = getDelveRegistry();
const stats = computeHeroStats({}, registry, { attunement: { fire: 5 } });
const bolt = (kind: Move['kind'], uid: string, over: Partial<Move> = {}): Move => ({
  uid,
  kind,
  form: 'bolt',
  elements: ['fire'],
  ...over,
});
const primary = { moves: [bolt('light', 'c1'), bolt('medium', 'c2')], payment: 'mana' as const };
const chains: Chains = { ...defaultChains(registry, 'fire', null), primary };
const caps = { basic: 5, primary: 3, defensive: 5, ultimate: 5 };
const spare = bolt('hold', 'c9', { runes: [{ id: 'quick', tier: 2 }] });
const blow: Blow = { uid: 'b1', kind: 'heavy', element: 'storm' };
const bag: Construct[] = [spare, blow];
const realSalvage = useDelveStore.getState().salvageConstruct;

describe('the bag pane', () => {
  afterEach(() => useDelveStore.setState({ salvageConstruct: realSalvage }));

  it("lists the bag's constructs of the chosen skill, each its name, sockets and uid, and the count", () => {
    render(<Panes chains={chains} caps={caps} stats={stats} locked={false} onChange={vi.fn()} bag={bag} />);
    const pane = screen.getByTestId('construct-bag');
    expect(pane).toHaveAttribute('data-pad-group');
    expect(pane).toHaveTextContent('Bag · Primary');
    expect(within(pane).getByTestId('bag-count')).toHaveTextContent('1 construct');
    const rows = within(pane).getAllByTestId('bag-construct');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-construct', 'c9');
    expect(rows[0]).toHaveTextContent('held Fire Bolt');
    expect(within(rows[0]).getByTestId('socket-0')).toHaveAttribute('data-rune', 'quick:2');
    expect(within(rows[0]).queryAllByRole('button')).toEqual([]); // the sockets are marks
    // The Basic sees the blow.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(within(pane).getAllByTestId('bag-construct')[0]).toHaveTextContent('heavy Storm blow');
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    expect(within(pane).getByTestId('bag-empty')).toBeInTheDocument();
  });

  it('a click (A) on a row places it into the next empty slot: the chain gains it and the bag loses it', () => {
    const onChange = vi.fn();
    render(<Panes chains={chains} caps={caps} stats={stats} locked={false} onChange={onChange} bag={bag} />);
    fireEvent.click(screen.getByTestId('bag-construct'));
    expect(onChange).toHaveBeenCalledWith(
      'primary',
      { moves: [...primary.moves, spare], payment: 'mana' },
      [blow],
    );
    expect(screen.queryByTestId('chain-message')).toBeNull();
  });

  it("a construct the weapon can't express is marked with why, its row off", () => {
    const onChange = vi.fn();
    render(
      <Panes
        chains={chains}
        caps={caps}
        stats={stats}
        locked={false}
        onChange={onChange}
        bag={bag}
        dormantText={(c) => ('form' in c ? "A sword can't express Bolt" : null)}
      />,
    );
    const row = screen.getByTestId('bag-construct');
    expect(row).toBeDisabled();
    expect(within(row).getByTestId('bag-cant')).toHaveTextContent("A sword can't express Bolt");
    expect(row).toHaveAccessibleName("held Fire Bolt, A sword can't express Bolt");
  });

  it("Salvage is the mouse's, off the D-pad; it melts through the store, and waits while the draft has changes", () => {
    const salvage = vi.fn(
      (): ProfileActionResult & { runes?: never } => ({ ok: true, profile: useDelveStore.getState().profile }),
    );
    useDelveStore.setState({ salvageConstruct: salvage });
    const { unmount } = render(
      <Panes chains={chains} caps={caps} stats={stats} locked={false} onChange={vi.fn()} bag={bag} />,
    );
    const button = screen.getByTestId('bag-salvage');
    expect(button).toHaveAttribute('data-pad-skip');
    expect(button).toHaveAccessibleName('Salvage held Fire Bolt');
    fireEvent.click(button);
    expect(salvage).toHaveBeenCalledWith('c9');
    unmount();
    render(
      <Panes chains={chains} caps={caps} stats={stats} locked={false} onChange={vi.fn()} bag={bag} changed={{ primary }} />,
    );
    expect(screen.getByTestId('bag-salvage')).toBeDisabled();
    expect(screen.getByTestId('bag-salvage')).toHaveAttribute('title', SALVAGE_WAITS);
  });

  it('locked (a dive), the rows are off and nothing melts', () => {
    render(<Panes chains={chains} caps={caps} stats={stats} locked onChange={vi.fn()} bag={bag} />);
    expect(screen.getByTestId('bag-construct')).toBeDisabled();
    expect(screen.getByTestId('bag-salvage')).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run it.** `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/ConstructBag.test.tsx --reporter=dot)` → FAIL (cannot resolve `../ConstructBag`).

- [ ] **Step 4: Implement.** Create `packages/client/src/features/delve/hub/skills/ConstructBag.tsx`:

```tsx
import { MAX_SOCKETS, socketsOf } from '@alloy/engine';
import { SALVAGE_WAITS, partsText, useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { Button, Glyph, Panel } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SocketRow } from '../../runes/SocketRow';
import { SKILL_NAME, constructText } from '../../chains/chain-text';
import type { ChainEditorModel } from '../../chains/useChainEditor';
import { useChainMessage, type AnvilChains } from './useAnvilChains';

/** The store's refusal while the draft holds changes, for the pane's title and its tests. */
export { SALVAGE_WAITS };

/**
 * Place bag construct `uid` into the chosen chain (A, or a click on its row): the model's rule,
 * its refusal said on the lane's message line. True when placed.
 */
export function placeFromBag(ed: ChainEditorModel, uid: string): boolean {
  const why = ed.place(uid);
  playSound(why ? 'combineFail' : 'orbPlace');
  useChainMessage.setState({ text: why });
  return why === null;
}

/**
 * Salvage bag construct `uid` at once (X; the constructs spec, 3.3): its runes back to the pouch
 * at the pull price, the store offering Undo for `UNDO_MS`. True when it melted.
 */
export function salvageFromBag(uid: string): boolean {
  const res = useDelveStore.getState().salvageConstruct(uid);
  playSound(res.ok ? 'orbRemove' : 'combineFail');
  if (!res.ok) showToast(res.reason ?? 'Cannot salvage it');
  else showToast(partsText(getDelveRegistry(), res.runes ?? []) ?? 'Construct salvaged');
  return res.ok;
}

/**
 * The Skills tab's bag pane (the constructs spec, 6): the move bag's constructs of the chosen
 * skill, a row each (its kind, form and elements, its sockets as marks, and, when the weapon's
 * class can't express it, why, its row off), in a kit plate (a pad group). A click or A places a
 * row (`placeFromBag`); Salvage beside it is the mouse's (X under the pad), off while the draft
 * holds changes (the engine refuses a salvage then). Locked (a dive), every row is off.
 */
export function ConstructBag({ ed, anvil }: { ed: ChainEditorModel; anvil: AnvilChains }) {
  const registry = getDelveRegistry();
  const { skill, locked, bagHere } = ed;
  const pending = Object.keys(anvil.changed).length > 0;
  return (
    <Panel as="section" aria-label="Move bag" testId="construct-bag">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="k-section m-0">Bag · {SKILL_NAME[skill]}</h2>
        <span className="k-caption text-[var(--k-text-3)]" data-testid="bag-count">
          {bagHere.length} construct{bagHere.length === 1 ? '' : 's'}
        </span>
      </div>
      {bagHere.length === 0 ? (
        <p className="k-note m-0" data-testid="bag-empty">
          Nothing for this skill. Unsocket a move to keep it here, free, with its sockets.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {bagHere.map((c) => {
            const why = anvil.editor.dormantText?.(c) ?? null;
            const el = 'element' in c ? c.element : c.elements[0];
            const color = manaStyle(registry, el).color;
            const name = constructText(registry, c);
            return (
              <li key={c.uid} className="flex items-center gap-2">
                <button
                  type="button"
                  className="k-well flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left disabled:opacity-60"
                  disabled={locked || !!why}
                  aria-label={why ? `${name}, ${why}` : `${name}: place it`}
                  onClick={() => placeFromBag(ed, c.uid!)}
                  data-construct={c.uid}
                  data-testid="bag-construct"
                >
                  <span
                    className="k-socket inline-flex h-[40px] w-[40px] flex-none items-center justify-center"
                    style={{ borderColor: color }}
                  >
                    <Glyph id={'form' in c ? c.form : 'attack'} size={22} color={color} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="k-disp truncate text-[18px]">{name}</span>
                    {why ? (
                      <span className="text-[16px] text-[var(--k-hot)]" data-testid="bag-cant">
                        {why}
                      </span>
                    ) : (
                      <SocketRow runes={socketsOf(c)} cap={MAX_SOCKETS} nextPrice={null} locked />
                    )}
                  </span>
                </button>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={locked || pending}
                  title={pending ? SALVAGE_WAITS : undefined}
                  aria-label={`Salvage ${name}`}
                  onClick={() => salvageFromBag(c.uid!)}
                  data-pad-skip
                  testId="bag-salvage"
                >
                  Salvage
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
```

`SocketRow` with `locked` and no `onOpenSocket` draws the pips as marks (`role="img"`, `data-rune`), none a stop; with no socket it draws nothing. If the kit's `Button` doesn't spread `title`, pass it through `aria-describedby` to a hidden span instead; the test reads `title`.

- [ ] **Step 5: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/hub/skills/ConstructBag.tsx src/features/delve/hub/skills/__tests__/ConstructBag.test.tsx src/features/delve/hub/skills/__tests__/harness.tsx && npx vitest run src/features/delve/hub/skills/__tests__/ConstructBag.test.tsx src/features/delve/hub/skills/__tests__/ChainLane.test.tsx --reporter=dot)` → no type errors; PASS.

- [ ] **Step 6: Commit.**

```bash
cd /c/Projects/alloy-constructs-c1
git add packages/client/src/features/delve/hub/skills/ConstructBag.tsx packages/client/src/features/delve/hub/skills/__tests__/ConstructBag.test.tsx packages/client/src/features/delve/hub/skills/__tests__/harness.tsx
git commit -m "feat(client): the Skills tab's bag pane: place a construct, salvage one" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 6: The tab: the bag under the lane, prompts by focus, X unsockets

**Files:** modify `hub/skills/SkillsTab.tsx`, `hub/skills/__tests__/SkillsTab.test.tsx`.

The prompts follow the focus: on a bag row A is Place and X Salvage; on the home row A is Edit move and X Unsocket; Undo salvage (B, Ctrl+Z) rides either while the store offers it. The tab learns where the focus is from one `focusin` listener on its root (a row inside `construct-bag`, or not).

- [ ] **Step 1: The failing tests.** In `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx`:

Replace:
```tsx
import {
  defaultMoveset,
  heroChains,
  type Chains,
  type ChainSkill,
  type MoveKind,
} from '@alloy/engine';
```
with:
```tsx
import {
  heroChains,
  type Chains,
  type Construct,
  type MoveKind,
  type ProfileActionResult,
} from '@alloy/engine';
```

Replace:
```tsx
import { renderSkills } from './harness';
```
with:
```tsx
import { renderSkills, roomy } from './harness';
```

Replace the local `roomy` (from `/** The starting sword made epic (all four skills), every chain at five slots, its default moves. */` through its closing `}`) with nothing (the harness's `roomy` builds the Primary as four Strikes: light, medium, medium, heavy, with uids).

Replace:
```tsx
const kinds = (...k: MoveKind[]) => k.map((kind) => `${kind} Fire Bolt`).join(' · ');
```
with:
```tsx
const kinds = (...k: MoveKind[]) => k.map((kind) => `${kind} Fire Strike`).join(' · ');
```

In the test `'keys: ] and [ step the skills, Alt+arrows move the chosen move, Del removes it, Ctrl+Enter opens the Apply sheet'`, rename it `'keys: ] and [ step the skills, Alt+arrows move the chosen move, Del unsockets it, Ctrl+Enter opens the Apply sheet'` and replace its last two lines:
```tsx
    press('Enter', { ctrlKey: true });
    fireEvent.click(screen.getByTestId('apply-sheet-confirm'));
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'medium', 'medium']);
```
with:
```tsx
    press('Enter', { ctrlKey: true });
    expect(screen.getByTestId('apply-sheet')).toBeInTheDocument();
    // The unsocketed construct waits in the draft's bag (Apply is B2's; D2 un-skips its test).
    expect(store().chainDraft?.bag.map((c) => c.kind)).toEqual(['heavy']);
    expect(chains().primary.moves).toHaveLength(4); // the save, until Apply
```

Replace the two X tests:
```tsx
  it('on the home row X removes the chosen move, never the last', () => {
    roomy();
    renderSkills();
    act(() => screen.getByTestId('move-1').focus());
    padTap('x');
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'heavy'));
    expect(chains().primary.moves).toHaveLength(4); // a draft
  });

  it('in the editor X removes its move and closes it; Del too', () => {
    roomy();
    renderSkills();
    fireEvent.click(screen.getByTestId('move-0'));
    padTap('x');
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(summary()).toHaveTextContent(kinds('medium', 'medium', 'heavy'));
    fireEvent.click(screen.getByTestId('move-0'));
    press('Delete');
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(summary()).toHaveTextContent(kinds('medium', 'heavy'));
  });
```
with:
```tsx
  it('on the home row X unsockets the chosen move into the bag; the Basic keeps its last blow', () => {
    roomy();
    renderSkills();
    act(() => screen.getByTestId('move-1').focus());
    padTap('x');
    expect(summary()).toHaveTextContent(kinds('light', 'medium', 'heavy'));
    expect(chains().primary.moves).toHaveLength(4); // a draft
    expect(screen.getByTestId('bag-construct')).toHaveTextContent('medium Fire Strike');
    expect(store().chainDraft?.bag.map((c) => c.uid)).toEqual(['p2']);
    // The Basic: three blows go down to one, never none.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    for (let i = 0; i < 3; i++) {
      act(() => screen.getByTestId('move-0').focus());
      padTap('x');
    }
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(1);
  });

  it('in the editor X unsockets its move and closes it; Del too', () => {
    roomy();
    renderSkills();
    fireEvent.click(screen.getByTestId('move-0'));
    padTap('x');
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(summary()).toHaveTextContent(kinds('medium', 'medium', 'heavy'));
    fireEvent.click(screen.getByTestId('move-0'));
    press('Delete');
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(summary()).toHaveTextContent(kinds('medium', 'heavy'));
    expect(store().chainDraft?.bag).toHaveLength(2);
  });

  it('on a bag row A places and X salvages (the store), B undoes a salvage while it is offered', () => {
    roomy({ primary: { moves: [], payment: 'mana' } }, { primary: 2 });
    const spare: Construct = { uid: 'spare', kind: 'light', form: 'strike', elements: ['fire'] };
    store().setProfile({ ...store().profile, constructs: [spare] });
    renderSkills();
    expect(summary()).toHaveTextContent(/No construct in this chain/);
    const row = screen.getByTestId('bag-construct');
    act(() => row.focus());
    // The footer's prompts follow the focus.
    const labels = () => [...document.querySelectorAll('.k-prompt')].map((p) => p.textContent);
    expect(labels().join(' ')).toMatch(/Place/);
    expect(labels().join(' ')).toMatch(/Salvage/);
    fireEvent.click(row); // A presses the focused row (fireEvent wraps act, so the state flushes before the next expect)
    expect(summary()).toHaveTextContent('light Fire Strike');
    expect(store().chainDraft?.bag).toEqual([]);
    expect(screen.getByTestId('bag-empty')).toBeInTheDocument();
    // A salvage goes through the store (B2's engine; here stubbed) and offers Undo on B.
    act(() => store().revertDraft());
    const after = { ...store().profile, constructs: [] };
    useDelveStore.setState({
      salvageConstruct: (): ProfileActionResult => {
        useDelveStore.setState({ undo: { before: store().profile, after, newUids: {} } });
        store().setProfile(after);
        return { ok: true, profile: after };
      },
    });
    act(() => screen.getByTestId('bag-construct').focus());
    padTap('x');
    expect(store().profile.constructs).toEqual([]);
    expect(labels().join(' ')).toMatch(/Undo salvage/);
    padTap('b');
    expect(store().profile.constructs).toEqual([spare]);
  });
```
(`padTap` and `press` are the file's helpers. If the footer's prompt elements carry another class than `.k-prompt`, read them as `within(screen.getByTestId('hub-footer')).getAllByText(/Place|Salvage|Undo salvage/)`.) In the test `'Y opens the Apply sheet from the home row and from the editor; A applies; …'`, replace:
```tsx
    fireEvent.click(screen.getByTestId('apply-sheet-confirm'));
    expect(chains().primary.moves[0].kind).toBe('medium');
    expect(screen.queryByTestId('apply-sheet')).toBeNull();
```
with:
```tsx
    // Its Apply is B2's engine (D2 un-skips the apply tests); Back closes it.
    fireEvent.click(within(screen.getByTestId('apply-sheet')).getByRole('button', { name: /Back/ }));
    expect(screen.queryByTestId('apply-sheet')).toBeNull();
```
and rename it `'Y opens the Apply sheet from the home row and from the editor; with nothing changed Y opens nothing'`. In `"draws its prompts in the hub's footer"`, replace every `Remove` it expects among the home row's prompts with `Unsocket` (Task 6 renames the prompt). Add a `useDelveStore.setState({ salvageConstruct: realSalvage })` to the file's `afterEach` with `const realSalvage = useDelveStore.getState().salvageConstruct;` beside `store`.

- [ ] **Step 2: Run them.** `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx --reporter=dot)` → FAIL (no `bag-construct` in the tab; X removes outright).

- [ ] **Step 3: Implement.** In `packages/client/src/features/delve/hub/skills/SkillsTab.tsx`:

Replace:
```tsx
import { ChainLane } from './ChainLane';
import { MoveInspector } from './MoveInspector';
```
with:
```tsx
import { ChainLane } from './ChainLane';
import { ConstructBag, SALVAGE_WAITS, salvageFromBag } from './ConstructBag';
import { MoveInspector } from './MoveInspector';
```
and add `import { showToast } from '@/components/Toast';` and `import { playSound } from '@/shared/utils/sound-manager';` beside the store import.

Replace:
```tsx
  const changes = useDelveStore((s) => Object.keys(selectDraftApply(s).changes).length);
  const root = useRef<HTMLDivElement>(null);
```
with:
```tsx
  const changes = useDelveStore((s) => Object.keys(selectDraftApply(s).changes).length);
  // Salvage's Undo, while the store still offers it.
  const undoLive = useDelveStore((s) => !!s.undo && s.profile === s.undo.after);
  const root = useRef<HTMLDivElement>(null);
  // The bag row the focus is on (its uid), or null on the lane: A and X follow it.
  const [bagFocus, setBagFocus] = useState<string | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const on = (e: FocusEvent) => {
      const row = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-testid="construct-bag"] [data-construct]',
      );
      setBagFocus(row?.dataset.construct ?? null);
    };
    // A row gone under the focus (placed, salvaged): nothing takes it, so the keys leave the bag.
    const off = (e: FocusEvent) => {
      if (e.relatedTarget === null) setBagFocus(null);
    };
    el.addEventListener('focusin', on);
    el.addEventListener('focusout', off);
    return () => {
      el.removeEventListener('focusin', on);
      el.removeEventListener('focusout', off);
    };
  }, []);
```

Replace:
```tsx
  const live = useRef({ ed, mana, changes });
  const hub = useRef({ setPrompts, setFooterAction, onDelve });
  useLayoutEffect(() => {
    live.current = { ed, mana, changes };
```
with:
```tsx
  const live = useRef({ ed, mana, changes, bagFocus });
  const hub = useRef({ setPrompts, setFooterAction, onDelve });
  useLayoutEffect(() => {
    live.current = { ed, mana, changes, bagFocus };
```

Replace:
```tsx
  /** X or Del on the home row: the chosen move goes (never a chain's last). */
  const removeChosen = () => {
    const { ed: now } = live.current;
    if (!now.locked && !now.absent && !now.fixedShape && now.entries.length > 1)
      now.remove(now.index);
  };
```
with:
```tsx
  /** X or Del on the home row: the chosen construct goes to the bag (the Basic keeps one blow). */
  const unsocketChosen = () => {
    const { ed: now } = live.current;
    if (!now.locked && !now.absent && !now.fixedShape) now.unsocket(now.index);
  };
  /** The focused bag row's X (its A presses the row, which places). */
  const salvageFocused = () => {
    const { bagFocus: uid, changes: pending } = live.current;
    if (!uid) return;
    if (pending > 0) return showToast(SALVAGE_WAITS);
    salvageFromBag(uid);
  };
  const undoPrompt: Prompt = {
    id: 'undo',
    label: 'Undo salvage',
    binding: { key: 'KeyZ', ctrl: true, pad: 'b' },
    onPress: () => {
      if (!useDelveStore.getState().undoSalvage()) return;
      playSound('orbPlace');
      showToast('Salvage undone');
    },
  };
```

Replace the `prompts` memo (from `  const prompts: Prompt[] = useMemo(` through `    [mana, editing, canEdit, entries.length, hint],\n  );`) with:
```tsx
  const canUnsocket = canEdit && entries.length > (ed.skill === 'basic' ? 1 : 0);
  const prompts: Prompt[] = useMemo(
    () =>
      mana
        ? [{ id: 'back', label: 'Back', binding: { key: 'Escape', pad: 'b' } }]
        : editing
          ? // Drawn only: the editor binds its own.
            [
              { id: 'change', label: 'Change', binding: { pad: 'a' } },
              { id: 'unsocket', label: 'Unsocket', binding: { key: 'Delete', pad: 'x' } },
              { id: 'back', label: 'Back', binding: { key: 'Escape', pad: 'b' } },
            ]
          : bagFocus
            ? [
                // Drawn only: A presses the focused row itself (A is never a prompt's).
                { id: 'place', label: 'Place', binding: { mouse: 'click', pad: 'a' } },
                {
                  id: 'salvage',
                  label: 'Salvage',
                  binding: { key: 'Delete', pad: 'x' },
                  onPress: salvageFocused,
                  disabled: locked || changes > 0,
                },
                ...(undoLive ? [undoPrompt] : []),
                { id: 'skill', label: 'Next skill', binding: { key: 'BracketRight', pad: 'rt' } },
              ]
            : [
                { id: 'edit', label: 'Edit move', binding: { mouse: 'click', pad: 'a' }, hint },
                {
                  id: 'unsocket',
                  label: 'Unsocket',
                  binding: { key: 'Delete', pad: 'x' },
                  onPress: unsocketChosen,
                  disabled: !canUnsocket,
                },
                ...(undoLive ? [undoPrompt] : []),
                { id: 'skill', label: 'Next skill', binding: { key: 'BracketRight', pad: 'rt' } },
              ],
    // The handlers read `live`: only what the prompts show re-makes them.
    [mana, editing, canEdit, canUnsocket, locked, changes, bagFocus, undoLive, hint],
  );
```
(A is never a prompt's: `use-gamepad-nav` presses the focused control before `padPrompts` sees it, so the `place` prompt is drawn only, as `Edit move` is, and A on a row clicks it.)

Replace the tab's grid:
```tsx
        <ChainLane ed={ed} anvil={anvil} onEdit={onEdit} />
        {mana ? (
```
with:
```tsx
        <div className="flex min-h-0 flex-col gap-6">
          <ChainLane ed={ed} anvil={anvil} onEdit={onEdit} />
          <ConstructBag ed={ed} anvil={anvil} />
        </div>
        {mana ? (
```

Update the component's doc comment: `Del or X removes the chosen move` → `Del or X unsockets the chosen construct into the bag (under the lane: its rows A places and X salvages, with Undo on B or Ctrl+Z)`.

- [ ] **Step 4: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/hub/skills/SkillsTab.tsx src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx && npx vitest run src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx --reporter=dot)` → no type errors; PASS. (If `'sets the Apply bar as its footer…'` or the onboarding test read the Primary's Bolt names, they now read Strikes through `kinds`.)

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-constructs-c1
git add packages/client/src/features/delve/hub/skills/SkillsTab.tsx packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx
git commit -m "feat(client): the Skills tab holds the bag under the lane; X unsockets, A places, X salvages" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 4: the move pane and the Apply sheet

## Task 7: The form picker by class; Unsocket in the editor; the dormant note and the empty chain

**Files:** modify `hub/skills/FormPicker.tsx`, `hub/skills/MoveRows.tsx`, `hub/skills/MoveInspector.tsx`, `hub/skills/__tests__/MoveRows.test.tsx`.

- [ ] **Step 1: The failing tests.** In `packages/client/src/features/delve/hub/skills/__tests__/MoveRows.test.tsx`:

Replace:
```tsx
import { defaultMoveset, heroChains, type Chains, type ChainSkill } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { edit, renderSkills, stepTo, valuesOf } from './harness';
```
with:
```tsx
import { movesetOf, type Chains } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { edit, renderSkills, roomy, stepTo, strikes, valuesOf } from './harness';
```

Replace:
```tsx
const saved = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
```
with:
```tsx
const saved = () => movesetOf(registry, store().profile.equipped.weapon!).chains as Chains;
```

Replace the local `roomy` (from `/** The starting sword made epic, every chain at five slots, the Primary its four default Bolts. */` through its closing `}`) with nothing, and in the `beforeEach` replace `    roomy();` with:
```tsx
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'nature' } });
```

Replace every `Fire Bolt` in the file's expectations with `Fire Strike` (three: the Kind test's summary, the Position test's summary; the Form test's `form-bolt` becomes `form-strike`, below).

In the Form test, replace:
```tsx
    expect(within(grid).getByTestId('form-bolt')).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid).getByTestId('form-damage-lance')).toHaveTextContent(
      /chain damage a second/,
    );
    // A defensive form is no Primary's.
    expect(within(grid).queryByTestId('form-ward')).toBeNull();
```
with:
```tsx
    expect(within(grid).getByTestId('form-strike')).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid).getByTestId('form-damage-lance')).toHaveTextContent(
      /chain damage a second/,
    );
    // Only the sword's class (the constructs spec, 2.1): Strike, Whirl, Lance and Burst; never a
    // ranged form, nor a Defensive one.
    expect(within(grid).getByTestId('form-whirl')).toBeInTheDocument();
    expect(within(grid).queryByTestId('form-bolt')).toBeNull();
    expect(within(grid).queryByTestId('form-volley')).toBeNull();
    expect(within(grid).queryByTestId('form-ward')).toBeNull();
```

In the Position test, replace:
```tsx
    // The draft's origins follow the move: Apply's price sees a reorder, not two new moves.
    expect(store().chainDraft!.origins.primary).toEqual([1, 0, 2, 3]);
```
with:
```tsx
    // The constructs keep their uids: Apply's price sees a reorder (free), not two new moves.
    expect(draft()!.moves.map((m) => m.uid)).toEqual(['p2', 'p1', 'p3', 'p4']);
```

Replace the whole test `'Remove (the mouse’s; X in plan 03) drops the move and closes the editor onto the next card'` with:
```tsx
  it("Unsocket (the mouse's; X) sends the move to the bag and closes the editor onto the next card", () => {
    renderSkills();
    edit(1);
    fireEvent.click(screen.getByTestId('move-unsocket'));
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(draft()!.moves.map((m) => m.kind)).toEqual(['light', 'medium', 'heavy']);
    expect(store().chainDraft!.bag.map((c) => c.uid)).toEqual(['p2']);
    expect(document.activeElement).toBe(screen.getByTestId('move-0'));
    expect(screen.getByTestId('bag-construct')).toHaveAttribute('data-construct', 'p2');
  });

  it("a dormant construct's detail and editor say why; an empty chain's pane says what to do", () => {
    // A Bolt on the sword: its class can't express it.
    roomy({
      primary: {
        moves: [{ uid: 'p1', kind: 'light', form: 'bolt', elements: ['fire'] }, ...strikes(['medium']).moves.map((m) => ({ ...m, uid: 'p2' }))],
        payment: 'mana',
      },
    });
    renderSkills();
    expect(screen.getByTestId('move-0')).toHaveAttribute('data-dormant');
    expect(screen.getByTestId('dormant-note')).toHaveTextContent("A sword can't express Bolt");
    edit(0);
    expect(within(screen.getByTestId('move-editor')).getByTestId('dormant-note')).toBeInTheDocument();
    // Its form grid offers the sword's forms: picking one wakes it.
    fireEvent.click(screen.getByTestId('move-form'));
    fireEvent.click(screen.getByTestId('form-strike'));
    expect(screen.queryByTestId('dormant-note')).toBeNull();
    expect(screen.getByTestId('move-0')).not.toHaveAttribute('data-dormant');
    // Every construct unsocketed: the pane says so, with no control.
    fireEvent.click(screen.getByTestId('move-unsocket'));
    edit(0);
    fireEvent.click(screen.getByTestId('move-unsocket'));
    expect(screen.getByTestId('inspector-empty')).toHaveTextContent(/No construct in this chain/);
    expect(within(screen.getByTestId('ability-readout')).queryAllByRole('button')).toEqual([]);
  });

  it('the sockets count against MAX_SOCKETS whatever the weapon, and Open a socket shows while under it', () => {
    renderSkills();
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets · 0 of 3');
    edit(0);
    expect(screen.getByTestId('socket-open')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them.** `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/MoveRows.test.tsx --reporter=dot)` → FAIL (`form-bolt` still offered; `move-unsocket`, `dormant-note`, `inspector-empty` missing).

- [ ] **Step 3: The form picker.** In `packages/client/src/features/delve/hub/skills/FormPicker.tsx`:

Replace:
```tsx
import type { Move } from '@alloy/engine';
```
with:
```tsx
import { formAllowed, type Move } from '@alloy/engine';
```

Replace:
```tsx
          .forms.filter((f) => f.slot === ed.slot)
```
with:
```tsx
          // The slot's forms the weapon's class can express (the constructs spec, 2.1).
          .forms.filter((f) => f.slot === ed.slot && formAllowed(registry, ed.weaponBaseId, f.id))
```
and in its doc comment, `every form of the move's slot` → `every form of the move's slot the weapon's class can express`.

- [ ] **Step 4: The editor's Unsocket and its dormant note.** In `packages/client/src/features/delve/hub/skills/MoveRows.tsx`:

Replace:
```tsx
  /** X, Del or Remove: the move goes and the editor closes. */
  const remove = () => {
    onClose();
    ed.remove(index);
  };
  usePrompts(
    [
      {
        id: 'remove',
        label: 'Remove move',
        binding: { key: 'Delete', pad: 'x' },
        onPress: remove,
        disabled: !shape || entries.length < 2,
      },
```
with:
```tsx
  /** X, Del or Unsocket: the construct goes to the bag and the editor closes. */
  const unsocket = () => {
    onClose();
    ed.unsocket(index);
  };
  // An ability chain may empty; the Basic keeps one blow.
  const canUnsocket = shape && entries.length > (ed.skill === 'basic' ? 1 : 0);
  usePrompts(
    [
      {
        id: 'unsocket',
        label: 'Unsocket',
        binding: { key: 'Delete', pad: 'x' },
        onPress: unsocket,
        disabled: !canUnsocket,
      },
```

Replace:
```tsx
          <Button
            variant="quiet"
            size="sm"
            disabled={!shape || entries.length < 2}
            onClick={remove}
            binding={{ key: 'Delete', pad: 'x' }}
            aria-label={`Remove ${ed.names[index]}`}
            data-pad-skip
            testId="move-remove"
          >
            Remove
          </Button>
```
with:
```tsx
          <Button
            variant="quiet"
            size="sm"
            disabled={!canUnsocket}
            onClick={unsocket}
            binding={{ key: 'Delete', pad: 'x' }}
            aria-label={`Unsocket ${ed.names[index]}`}
            data-pad-skip
            testId="move-unsocket"
          >
            Unsocket
          </Button>
```

Replace:
```tsx
      {off.length > 0 && (
        <span className="text-[18px] text-[var(--k-hot)]" data-testid="off-pair-note">
          {off.map(name).join(' and ')} off-pair: no attunement. Keep it, or pick from your two
          elements.
        </span>
      )}
      {runes &&
```
with:
```tsx
      {off.length > 0 && (
        <span className="text-[18px] text-[var(--k-hot)]" data-testid="off-pair-note">
          {off.map(name).join(' and ')} off-pair: no attunement. Keep it, or pick from your two
          elements.
        </span>
      )}
      {ed.dormantWhy(index) && (
        <span className="text-[18px] text-[var(--k-hot)]" data-testid="dormant-note">
          Dormant: {ed.dormantWhy(index)}. It keeps its slot and plays on a weapon of its class;
          pick a form this weapon can express, or unsocket it.
        </span>
      )}
      {runes &&
```

Update the doc comment: `Back (B, Esc) and Remove (X, Del)` → `Back (B, Esc) and Unsocket (X, Del)`.

- [ ] **Step 5: The inspector.** In `packages/client/src/features/delve/hub/skills/MoveInspector.tsx`:

Replace:
```tsx
import { MoveRows } from './MoveRows';
import type { AnvilChains } from './useAnvilChains';
```
with:
```tsx
import { EMPTY_CHAIN } from './ChainLane';
import { MoveRows } from './MoveRows';
import type { AnvilChains } from './useAnvilChains';
```

Replace:
```tsx
  if (ed.absent || !move)
    return (
      <Panel as="aside" aria-label="Move inspector">
        <p className="m-0 text-[18px] text-[var(--k-text-3)]">
          This weapon doesn't carry this skill.
        </p>
      </Panel>
    );
```
with:
```tsx
  if (ed.absent || !move)
    return (
      <Panel as="aside" aria-label="Move inspector" testId="ability-readout">
        <p className="m-0 text-[18px] text-[var(--k-text-3)]" data-testid="inspector-empty">
          {ed.absent ? anvil.editor.absentText?.(ed.skill) : EMPTY_CHAIN}
        </p>
      </Panel>
    );
```

Replace:
```tsx
            {off.length > 0 && (
              <span className="text-[var(--k-hot)]" data-testid="off-pair-note">
                {off.map(name).join(' and ')} off-pair: no attunement. Keep it, or pick from your
                two elements.
              </span>
            )}
            {runes && runes.socketCap > 0 && (
```
with:
```tsx
            {off.length > 0 && (
              <span className="text-[var(--k-hot)]" data-testid="off-pair-note">
                {off.map(name).join(' and ')} off-pair: no attunement. Keep it, or pick from your
                two elements.
              </span>
            )}
            {ed.dormantWhy(index) && (
              <span className="text-[var(--k-hot)]" data-testid="dormant-note">
                Dormant: {ed.dormantWhy(index)}. It keeps its slot and plays on a weapon of its
                class.
              </span>
            )}
            {runes && runes.socketCap > 0 && (
```

Update its doc comment: `its element's effect (off-pair marked)` → `its element's effect (off-pair marked), why it is dormant when it is`.

- [ ] **Step 6: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/hub/skills/FormPicker.tsx src/features/delve/hub/skills/MoveRows.tsx src/features/delve/hub/skills/MoveInspector.tsx src/features/delve/hub/skills/__tests__/MoveRows.test.tsx && npx vitest run src/features/delve/hub/skills/__tests__/MoveRows.test.tsx src/features/delve/hub/skills/__tests__/ChainLane.test.tsx src/features/delve/hub/skills/__tests__/ConstructBag.test.tsx --reporter=dot)` → no type errors; PASS.

- [ ] **Step 7: Commit.**

```bash
cd /c/Projects/alloy-constructs-c1
git add packages/client/src/features/delve/hub/skills/FormPicker.tsx packages/client/src/features/delve/hub/skills/MoveRows.tsx packages/client/src/features/delve/hub/skills/MoveInspector.tsx packages/client/src/features/delve/hub/skills/__tests__/MoveRows.test.tsx
git commit -m "feat(client): the form picker offers the weapon class's forms; the editor unsockets; dormant and empty notes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 8: The Apply sheet lists the free moves apart from the priced edits

**Files:** modify `hub/skills/draft-lines.ts`, `hub/skills/ApplySheet.tsx`, `hub/skills/__tests__/draft-lines.test.ts`, `hub/skills/__tests__/ApplySheet.test.tsx`.

- [ ] **Step 1: The failing tests.** Write `packages/client/src/features/delve/hub/skills/__tests__/draft-lines.test.ts` whole:

```ts
import { describe, it, expect } from 'vitest';
import {
  createDelveProfile,
  movesetOf,
  profileStats,
  type Chains,
  type Construct,
  type Move,
} from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { armed } from '../../../__tests__/armed';
import { draftLines } from '../draft-lines';
import { stamped } from './harness';

const registry = getDelveRegistry();
const profile = stamped(armed(createDelveProfile(registry, 1234, { primary: 'fire' })));
const stats = profileStats(registry, profile);
// The weapon's own chains, every construct with its uid (the uid diff's saved side).
const saved = movesetOf(registry, profile.equipped.weapon!).chains as Chains;
const [first, second] = saved.primary.moves;
const name = (m: Move) => `${m.kind} Fire ${registry.getForm(m.form).name}`;

describe('draftLines', () => {
  it("one line a changed skill, in the chains' order: its chain before and after, a changed construct noted", () => {
    const heavy: Move = { ...first, kind: 'heavy' };
    const lines = draftLines(registry, stats, saved, {
      primary: { ...saved.primary, moves: [heavy, second] },
      basic: saved.basic.map((b, i) => (i === 0 ? { ...b, kind: 'medium' as const } : b)),
    });
    expect(lines.map((l) => l.skill)).toEqual(['basic', 'primary']);
    expect(lines[1].before).toMatch(new RegExp(`^${name(first)} · `));
    expect(lines[1].after).toMatch(new RegExp(`^${name(heavy)} · `));
    expect(lines[1].notes).toEqual([`Changed: ${name(first)} → ${name(heavy)}`]);
    expect(lines[1].free).toEqual([]);
    expect(lines[0].notes).toEqual(['Changed: light Fire blow → medium Fire blow']);
  });

  it('notes a payment change, the sockets opened, the runes socketed and pulled, and a new construct', () => {
    const withRune: Move = { ...first, runes: [{ id: 'quick', tier: 3 }] };
    const fresh: Move = { kind: 'light', form: 'lance', elements: ['fire'] }; // no uid: new
    const [line] = draftLines(registry, stats, saved, {
      primary: { moves: [withRune, fresh], payment: 'charge' },
    });
    expect(line.notes).toEqual([
      'Pays with charge (was mana)',
      'Socket Quick III',
      'Opens 1 socket',
      'New: light Fire Lance',
    ]);
    const savedRuned = { ...saved, primary: { ...saved.primary, moves: [withRune, second] } };
    const [back] = draftLines(registry, stats, savedRuned, {
      primary: { ...saved.primary, moves: [{ ...first, runes: [null] }, second] },
    });
    expect(back.notes).toEqual(['Pull Quick III']);
  });

  it('the free moves apart: to the bag, from the bag, and a reorder', () => {
    const spare: Construct = { uid: 'spare', kind: 'hold', form: 'burst', elements: ['fire'] };
    const [line] = draftLines(
      registry,
      stats,
      saved,
      { primary: { ...saved.primary, moves: [spare, first] } },
      [second],
      [spare],
    );
    expect(line.free).toEqual([`To the bag: ${name(second)}`, 'From the bag: held Fire Burst']);
    expect(line.notes).toEqual([]);
    const [swapped] = draftLines(registry, stats, saved, {
      primary: { ...saved.primary, moves: [second, first] },
    });
    expect(swapped.free).toEqual(['Reordered']);
    expect(swapped.notes).toEqual([]);
  });
});
```

In `packages/client/src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx`:

Replace:
```tsx
import { heroChains, type Chains } from '@alloy/engine';
```
with:
```tsx
import { movesetOf, type Chains, type Construct } from '@alloy/engine';
```

Replace:
```tsx
import { ApplySheet } from '../ApplySheet';
```
with:
```tsx
import { ApplySheet } from '../ApplySheet';
import { stamped } from './harness';
```

Replace:
```tsx
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
```
with:
```tsx
const chains = () => movesetOf(registry, store().profile.equipped.weapon!).chains as Chains;
```

Replace:
```tsx
    store().setProfile(armed(store().profile));
    useDelveStore.setState({ unsocket: null });
```
with:
```tsx
    store().setProfile(stamped(armed(store().profile)));
    useDelveStore.setState({ unsocket: null });
```

Prefix these tests with `// D2 un-skips: B2's applyDraft prices and commits (A's refuses "Not yet").` and make them `it.skip(`: `'lists each change, the price and nothing destroyed; Apply is the first focus'`, `'A (its Apply) applies the draft and closes it'`, `'a draft the engine refuses: Apply is off, the reason beside it, and the first focus leaves it'`, `'names what Apply destroys'`. In the last one, `heroChains` is gone: it already reads `chains()`.

Append inside the describe, before its closing `});`:
```tsx
  it('lists the free moves apart from the priced edits: an unsocket, a place, a reorder', () => {
    const spare: Construct = { uid: 'spare', kind: 'hold', form: 'burst', elements: ['fire'] };
    store().setProfile({ ...store().profile, constructs: [spare] });
    const primary = chains().primary;
    const [first, second] = primary.moves;
    act(() => store().editDraft('primary', { ...primary, moves: [spare, second] }, [first]));
    renderSheet();
    const line = within(screen.getByTestId('apply-sheet')).getByTestId('apply-line-primary');
    const free = within(line).getAllByTestId('apply-free').map((e) => e.textContent);
    expect(free).toEqual([expect.stringMatching(/^To the bag: .* · free$/), 'From the bag: held Fire Burst · free']);
    expect(within(line).queryByText(/^New:/)).toBeNull();
  });
```

- [ ] **Step 2: Run them.** `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/draft-lines.test.ts src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx --reporter=dot)` → FAIL (`free` is undefined; no `apply-free`).

- [ ] **Step 3: The lines.** In `packages/client/src/features/delve/hub/skills/draft-lines.ts`:

Replace:
```ts
import {
  CHAIN_SKILLS,
  movesOf,
  resolveChain,
  socketsOf,
  type AbilitySlot,
  type Chain,
  type Chains,
  type ChainSkill,
  type DataRegistry,
  type HeroStats,
  type RuneRef,
} from '@alloy/engine';
import { blowText, chainText, listed, moveText } from '../../chains/chain-text';
import { runeName } from '../../runes/rune-style';

/** One skill the draft changes, as the Apply sheet lists it. */
export interface DraftLine {
  skill: ChainSkill;
  /** The chain as the weapon holds it, and as the draft makes it ("light Fire Bolt · heavy Fire Bolt"). */
  before: string;
  after: string;
  /** "Pays with charge (was mana)", "Socket Quick III", "Pull Split I", "Opens 2 sockets". */
  notes: string[];
}

/** `a` less `b`, rune by rune (id and tier). */
function less(a: RuneRef[], b: RuneRef[]): RuneRef[] {
  const left = [...b];
  return a.filter((r) => {
    const i = left.findIndex((x) => x.id === r.id && x.tier === r.tier);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

/**
 * What the draft changes, a line a skill in the chains' order: each chain's moves before and
 * after, and its notes (a payment change, the runes it sockets and pulls across the chain, the
 * sockets it opens). Words only: the price and what Apply destroys are the engine's (`draftPrice`).
 */
export function draftLines(
  registry: DataRegistry,
  stats: HeroStats,
  saved: Partial<Chains>,
  changes: Partial<Chains>,
): DraftLine[] {
```
with:
```ts
import {
  CHAIN_SKILLS,
  movesOf,
  resolveChain,
  socketsOf,
  type AbilitySlot,
  type Chain,
  type Chains,
  type ChainSkill,
  type Construct,
  type DataRegistry,
  type HeroStats,
  type RuneRef,
} from '@alloy/engine';
import { blowText, chainText, constructText, lessRunes, listed, moveText } from '../../chains/chain-text';
import { runeName } from '../../runes/rune-style';

/** One skill the draft changes, as the Apply sheet lists it. */
export interface DraftLine {
  skill: ChainSkill;
  /** The chain as the weapon holds it, and as the draft makes it ("light Fire Bolt · heavy Fire Bolt"). */
  before: string;
  after: string;
  /**
   * The priced edits: "Pays with charge (was mana)", "Socket Quick III", "Pull Split I", "Opens 2
   * sockets", "New: heavy Fire Lance", "Changed: light Fire Bolt → light Fire Lance".
   */
  notes: string[];
  /** The free moves (the constructs spec, 3.3): "To the bag: …", "From the bag: …", "Reordered". */
  free: string[];
}

const less = lessRunes;

/**
 * What the draft changes, a line a skill in the chains' order: each chain's moves before and
 * after, its priced notes (a payment change, the runes it sockets and pulls across the chain, the
 * sockets it opens, a new construct, a kept one changed) and its free moves (a construct to the
 * bag, `bag`, or from it, `savedBag`; a reorder). Words only: the price and what Apply destroys
 * are the engine's.
 */
export function draftLines(
  registry: DataRegistry,
  stats: HeroStats,
  saved: Partial<Chains>,
  changes: Partial<Chains>,
  bag: readonly Construct[] = [],
  savedBag: readonly Construct[] = [],
): DraftLine[] {
```

Replace:
```ts
    const opened = sockets(now) - sockets(was);
    if (opened > 0) notes.push(`Opens ${opened} socket${opened === 1 ? '' : 's'}`);
    return [{ skill: s, before: was ? names(was) : '', after: names(now), notes }];
```
with:
```ts
    const opened = sockets(now) - sockets(was);
    if (opened > 0) notes.push(`Opens ${opened} socket${opened === 1 ? '' : 's'}`);
    // By uid: what came from the bag or went to it is free, as is a reorder; a construct with no
    // uid, or from nowhere, is new; a kept one whose kind, form or elements changed is changed.
    const wasMoves = movesOf(was);
    const nowMoves = movesOf(now);
    const wasUids = wasMoves.map((m) => m.uid);
    const nowUids = nowMoves.map((m) => m.uid);
    const inBag = (uid?: string) => !!uid && bag.some((c) => c.uid === uid);
    const wasInBag = (uid?: string) => !!uid && savedBag.some((c) => c.uid === uid);
    const text = (m: Construct) => constructText(registry, m);
    const free: string[] = [];
    for (const m of wasMoves)
      if (!nowUids.includes(m.uid) && inBag(m.uid)) free.push(`To the bag: ${text(m)}`);
    for (const m of nowMoves)
      if (!wasUids.includes(m.uid) && wasInBag(m.uid)) free.push(`From the bag: ${text(m)}`);
    const keptWas = wasUids.filter((u) => u && nowUids.includes(u));
    const keptNow = nowUids.filter((u) => u && wasUids.includes(u));
    if (keptWas.some((u, i) => u !== keptNow[i])) free.push('Reordered');
    for (const m of nowMoves)
      if (!m.uid || (!wasUids.includes(m.uid) && !wasInBag(m.uid))) notes.push(`New: ${text(m)}`);
    for (const m of wasMoves) {
      const n = nowMoves.find((x) => x.uid && x.uid === m.uid);
      if (n && text(n) !== text(m)) notes.push(`Changed: ${text(m)} → ${text(n)}`);
    }
    return [{ skill: s, before: was ? names(was) : '', after: names(now), notes, free }];
```

- [ ] **Step 4: The sheet.** In `packages/client/src/features/delve/hub/skills/ApplySheet.tsx`:

Replace:
```tsx
import { heroChains, type ChainSkill } from '@alloy/engine';
```
with:
```tsx
import type { ChainSkill } from '@alloy/engine';
```

Replace:
```tsx
  const { editor } = useAnvilChains();
  const id = useId();
  const saved = heroChains(registry, profile.equipped, profile.pair);
  const lines = draftLines(registry, editor.stats, saved, view.changes);
```
with:
```tsx
  const { editor, saved, bag } = useAnvilChains();
  const id = useId();
  const lines = draftLines(registry, editor.stats, saved, view.changes, bag, profile.constructs);
```

Replace:
```tsx
              <span>{l.after}</span>
              {l.notes.map((n) => (
```
with:
```tsx
              <span>{l.after}</span>
              {l.free.map((n) => (
                <span key={n} className="text-[18px] text-[var(--k-text-3)]" data-testid="apply-free">
                  {n} · free
                </span>
              ))}
              {l.notes.map((n) => (
```

Update its doc comment: `its chain before and after and its notes` → `its chain before and after, its free moves (to and from the bag, reorders) and its priced notes`.

- [ ] **Step 5: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/hub/skills/draft-lines.ts src/features/delve/hub/skills/ApplySheet.tsx src/features/delve/hub/skills/__tests__/draft-lines.test.ts src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx && npx vitest run src/features/delve/hub/skills/__tests__/draft-lines.test.ts src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx --reporter=dot)` → no type errors; PASS with 4 skipped.

- [ ] **Step 6: Commit.**

```bash
cd /c/Projects/alloy-constructs-c1
git add packages/client/src/features/delve/hub/skills/draft-lines.ts packages/client/src/features/delve/hub/skills/ApplySheet.tsx packages/client/src/features/delve/hub/skills/__tests__/draft-lines.test.ts packages/client/src/features/delve/hub/skills/__tests__/ApplySheet.test.tsx
git commit -m "feat(client): the Apply sheet lists the free moves apart from the priced edits" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Chunk 5: the tab's tests on the slot table, the close

## Task 9: The Skills tests on the slot table; the engine-dependent ones wait for B2

**Files:** modify `hub/skills/__tests__/SkillsTab.chains.test.tsx`, `SkillStrip.test.tsx`, `ApplyBar.test.tsx`, `SkillsTab.trail.test.tsx`.

Each test here is **kept**, **rewritten** (its code below) or **skipped** (`it.skip(` under a `// D2 un-skips: …` comment: it applies through B2's engine, reads a price, or needs a real `draftRefusal`). A kept test may still need `Bolt` → `Strike` in its names (the sword's Primary is Strikes now) and the harness's `roomy`.

- [ ] **Step 1: `SkillsTab.chains.test.tsx`'s head.** Replace everything from the file's first line through the end of the `roomy` function (its closing `}` before `describe('SkillsTab', …)`) with:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, fireEvent, within } from '@testing-library/react';
import {
  movesetOf,
  pouchCount,
  socketsOf,
  type Blow,
  type Chains,
  type Move,
  type MoveKind,
  type RuneRef,
  type RunePouch,
} from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { edit, pickForm, renderSkills, roomy, stamped, stepTo, strikes, valuesOf } from './harness';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
/** The worn weapon's own chains, every construct (the save; a draft never shows here). */
const chains = () => movesetOf(registry, store().profile.equipped.weapon!).chains as Chains;
/** The draft's chains. */
const draft = () => store().chainDraft?.chains ?? {};
/** The footer's Apply opens the Apply sheet, whose Apply applies the draft (when it can). */
const apply = () => {
  fireEvent.click(screen.getByTestId('chain-apply'));
  const confirm = screen.queryByTestId('apply-sheet-confirm');
  if (confirm) fireEvent.click(confirm);
};
/** The Apply sheet, opened by the footer's Apply. */
const openSheet = () => {
  fireEvent.click(screen.getByTestId('chain-apply'));
  return screen.getByTestId('apply-sheet');
};
/** Back out of the Apply sheet, the draft as it was. */
const closeSheet = () =>
  fireEvent.click(within(screen.getByTestId('apply-sheet')).getByRole('button', { name: /Back/ }));
/** The Apply bar's line: "No changes", or "n unapplied changes · price". */
const priceLine = () => screen.getByTestId('chain-price');
const strike = (kind: MoveKind, uid?: string): Move => ({ uid, kind, form: 'strike', elements: ['fire'] });
```

and replace the first describe's `beforeEach`:
```tsx
    store().setProfile(armed(store().profile)); // an uncommon sword: it carries the Primary
```
with:
```tsx
    store().setProfile(stamped(armed(store().profile))); // an uncommon sword: two Primary slots, one Defensive
```
(the same line in the second describe too).

- [ ] **Step 2: The first describe, test by test.**

| Test | Action |
|---|---|
| lists the four skills, Basic first, and names the chosen skill's chain | rewrite (below) |
| a new hero's common sword carries Basic alone; the others show locked, saying what carries them | rewrite (below) |
| unarmed, the default chains show at their base slots: the basic chain alone | rewrite (below) |
| edits a draft: Apply commits it, free before the first dive, and Revert drops it | skip |
| keeps the draft when the tab closes; a dive starts only once it is discarded | keep; its last line reads `.form).toBe('strike')` |
| Apply is off while the engine would refuse the draft, and says why; the draft stays | skip |
| Add slot waits while its chain has a change pending; an edit undone by hand leaves none | rewrite (below) |
| equipping another weapon, or a realign, drops the draft | split: rewrite (below) |
| after the first dive the draft shows its price in Mana Dust, and Apply pays it | skip |
| edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap | rewrite (below) |
| sets a move's kind, and the chain's one payment with its wind-up | rewrite: replace its last three lines (`apply()` and the two `chains()` expectations) with `expect(draft().primary!.payment).toBe('charge'); expect(draft().primary!.moves[0].kind).toBe('heavy');` |
| says each move's beat, and a hold's full-charge time and beat, by the weapon's tempo | keep (`roomy()`; its comment's "a light Bolt" → "a light Strike") |
| adds, reorders and removes moves within the slots, never below one | rewrite (below) |
| Position moves a card; the selection follows it | keep; `roomy(5, { primary: … })` → `roomy({ primary: { moves: [strike('light'), strike('medium'), strike('heavy')], payment: 'mana' } })`; `Fire Bolt` → `Fire Strike` |
| two steps of Position move a card two places, the selection with it and the focus kept | keep, the same `roomy` form; its last two lines → `expect(draft().primary!.moves.map((m) => m.kind)).toEqual(['heavy', 'light', 'medium']);` |
| shows each chain's slots, and Add slot's price in Links and scrap | rewrite (below) |
| offers + Slot beside + Move while the chain is under five slots, and none at five | rewrite (below) |
| a refused Add slot or Apply says the engine's reason on the lane's message line | skip |
| marks a move outside the pair off-pair, and never offers its element to another | rewrite (below) |
| each ability offers only its own forms; a blow picks from the pair | rewrite (below) |
| warns when a mana cost is bigger than the pool | keep |
| warns when a hold move's full charge costs more than the pool | keep |
| is read-only while a dive is under way | keep |
| mid-dive every move can still be picked and read, but not moved, removed or added | keep (`medium Fire Bolt` → `medium Fire Strike`) |
| unarmed, it shows the default chains read-only | keep |

The rewritten tests:

```tsx
  it("lists the four skills, Basic first, and names the chosen skill's chain", () => {
    roomy();
    renderSkills();
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('data-testid'))).toEqual([
      'chain-skill-basic',
      'chain-skill-primary',
      'chain-skill-defensive',
      'chain-skill-ultimate',
    ]);
    expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire Strike · medium Fire Strike · medium Fire Strike · heavy Fire Strike',
    );
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(4);
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire blow · light Fire blow · heavy Fire blow',
    );
    edit(0);
    expect(screen.queryByTestId('move-form')).toBeNull(); // a blow has no form
    expect(screen.queryByText('Quick and cheap.')).toBeNull(); // nor a cost
  });

  it("a new save's common sword holds two Primary constructs; the skills it has no slot for say so", () => {
    store().resetProfile(1234, 'fire'); // the common sword, as a new save has it
    renderSkills();
    expect(screen.getByTestId('mana-pair')).toHaveTextContent('Fire · 2');
    expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('2 of 2');
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(2);
    expect(screen.getByTestId('chain-ceiling')).toHaveTextContent('up to 3');
    for (const [skill, text] of [
      ['defensive', "No Defensive slot yet: Open a skill on the Forge's Temper bench"],
      ['ultimate', 'No Ultimate slot on a common weapon'],
    ] as const) {
      // The tab's own line says why.
      expect(screen.getByTestId(`chain-skill-${skill}`)).toHaveTextContent(text);
      fireEvent.click(screen.getByTestId(`chain-skill-${skill}`));
      expect(screen.getByTestId('abilities-summary')).toHaveTextContent(text);
      expect(screen.queryByTestId('move-0')).toBeNull();
      expect(screen.queryByTestId('move-add')).toBeNull();
      expect(screen.queryByTestId('add-slot')).toBeNull();
    }
  });

  it("unarmed, the default chains show at the bare hands' slots: the basic chain alone", () => {
    store().unequip('weapon');
    renderSkills();
    expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
    for (const s of ['primary', 'defensive'] as const)
      expect(screen.getByTestId(`chain-skill-${s}`)).toHaveTextContent(
        'Equip a weapon to build your moves.',
      );
  });

  it('Add slot waits while its chain has a change pending; an edit undone by hand leaves none', () => {
    roomy({ primary: strikes(['light', 'medium', 'heavy']) }, { primary: 3 });
    store().setProfile({ ...store().profile, links: 3, scrap: 60 });
    renderSkills();
    edit(0);
    pickForm('lance');
    expect(screen.getByTestId('add-slot')).toBeDisabled();
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent(
      'Apply or revert this chain first',
    );
    pickForm('strike'); // back as it was
    expect(priceLine()).toHaveTextContent('No changes');
    expect(store().chainDraft?.chains.primary).toBeUndefined();
    fireEvent.click(screen.getByTestId('add-slot'));
    // The new slot comes plain-filled.
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('4 of 4 slots');
    expect(priceLine()).toHaveTextContent('No changes');
    // A chain's draft made on fewer slots goes when a slot is added to it (the store's own guard).
    act(() => {
      store().setProfile({ ...store().profile, links: 4, scrap: 80 });
      store().editDraft('primary', { ...chains().primary, payment: 'charge' });
      expect(store().addSlot('primary').ok).toBe(true);
    });
    expect(store().chainDraft).toBeNull();
  });

  it('equipping another weapon drops the draft', () => {
    roomy();
    const p = store().profile;
    const sword = p.equipped.weapon!;
    store().setProfile({ ...p, bag: [{ ...sword, uid: 'spare' }] });
    renderSkills();
    edit(0);
    pickForm('lance');
    act(() => store().equip('spare'));
    expect(priceLine()).toHaveTextContent('No changes');
    act(() => store().equip(sword.uid));
    expect(priceLine()).toHaveTextContent('No changes'); // gone, not waiting on the sword
  });

  // D2 un-skips: B2's realign maps the worn weapon's constructs by role.
  it.skip('a realign re-maps the moves the draft was made on, and drops it', () => {
    roomy();
    act(() => {
      store().bindSecondary('storm');
      store().setProfile({ ...store().profile, manaDust: 500, scrap: 500 });
    });
    renderSkills();
    edit(0);
    pickForm('lance');
    expect(priceLine()).toHaveTextContent('1 unapplied change');
    act(() => {
      expect(store().realign({ primary: 'frost' }).ok).toBe(true);
    });
    expect(priceLine()).toHaveTextContent('No changes');
    expect(chains().primary.moves[0]).toMatchObject({ form: 'strike', elements: ['frost'] });
  });

  it('edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap', () => {
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'nature' } });
    renderSkills();
    edit(1);
    pickForm('burst');
    stepTo('move-elements', 'Fire + Nature');
    expect(draft().primary!.moves[1]).toMatchObject({
      kind: 'medium',
      form: 'burst',
      elements: ['fire', 'nature'],
    });
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('medium Wildfire Burst');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire Strike · medium Wildfire Burst',
    );
    expect(screen.getByTestId('element-effect')).toHaveTextContent('Wildfire');
    stepTo('move-elements', 'Nature + Fire'); // the swap is a set of its own
    expect(draft().primary!.moves[1].elements).toEqual(['nature', 'fire']);
    stepTo('move-elements', 'Nature');
    expect(draft().primary!.moves[1].elements).toEqual(['nature']);
  });

  it('adds, reorders and unsockets moves within the slots; the Basic never below one blow', () => {
    roomy({ primary: strikes(['light']) });
    renderSkills();
    edit(0);
    expect(screen.getByTestId('move-unsocket')).toBeEnabled(); // an ability chain may empty
    expect(screen.getByTestId('move-unsocket')).toHaveAccessibleName('Unsocket light Fire Strike');
    fireEvent.click(screen.getByTestId('move-editor-back'));
    fireEvent.click(screen.getByTestId('move-add'));
    expect(document.activeElement).toBe(screen.getByTestId('move-1')); // the new card
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('move-add'));
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(5);
    expect(screen.queryByTestId('move-add')).toBeNull(); // every slot used
    expect(document.activeElement).toBe(screen.getByTestId('move-4'));
    // The new move is picked: make it heavy, then bring it forward.
    edit(4);
    stepTo('move-kind', 'Heavy');
    stepTo('move-position', 'Position 4 of 5');
    expect(screen.getByTestId('move-3')).toHaveAttribute('aria-pressed', 'true'); // the heavy
    edit(0);
    fireEvent.click(screen.getByTestId('move-unsocket'));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('move-0'));
    expect(draft().primary!.moves.map((m) => m.kind)).toEqual(['light', 'light', 'heavy', 'light']);
    expect(store().chainDraft?.bag.map((c) => c.uid)).toEqual(['p1']);
    // The Basic keeps one blow.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    for (let i = 0; i < 2; i++) {
      edit(0);
      fireEvent.click(screen.getByTestId('move-unsocket'));
    }
    edit(0);
    expect(screen.getByTestId('move-unsocket')).toBeDisabled();
  });

  it("shows each chain's slots against its ceiling, and Add slot's price in Links and scrap", () => {
    renderSkills();
    // The uncommon sword's Primary: two slots of three.
    expect(screen.queryByTestId('move-add')).toBeNull(); // both slots used
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 2 slots');
    expect(screen.getByTestId('chain-ceiling')).toHaveTextContent('up to 3');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Slot2 Links · 40 scrap');
    expect(screen.getByTestId('add-slot')).toBeDisabled(); // no Links yet
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough Links');
    expect(screen.getByTestId('add-slot')).toHaveAttribute(
      'aria-describedby',
      screen.getByTestId('add-slot-why').id,
    );
    act(() => store().setProfile({ ...store().profile, links: 2, scrap: 0 }));
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough scrap');
    act(() => store().setProfile({ ...store().profile, links: 2, scrap: 45 }));
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(store().profile).toMatchObject({ links: 0, scrap: 5 });
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 3 slots');
    expect(screen.getByTestId('chain-ceiling')).toHaveTextContent('at its ceiling');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('3 of 3');
    expect(screen.queryByTestId('add-slot')).toBeNull(); // the ceiling
    // The uncommon Defensive: one slot of two, its second at the first price.
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('1 of 1 slots');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('1 Link · 20 scrap');
    // The sword's basic chain starts at its string's 3 slots, the uncommon ceiling: nothing to buy.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 3 slots');
    expect(screen.queryByTestId('add-slot')).toBeNull();
  });

  it('offers + Slot beside + Move while the chain is under its ceiling, and none at it', () => {
    roomy({ primary: strikes(['light']) }, { primary: 3 });
    renderSkills();
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Slot');
    act(() => roomy({ primary: strikes(['light']) }));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(screen.queryByTestId('add-slot')).toBeNull();
  });

  it('marks a move outside the pair off-pair, and never offers its element to another', () => {
    const storm: Move = { uid: 'p1', kind: 'medium', form: 'strike', elements: ['storm'] };
    const fire: Move = { uid: 'p2', kind: 'medium', form: 'strike', elements: ['fire'] };
    roomy({ primary: { moves: [storm, fire], payment: 'mana' } });
    renderSkills();
    expect(screen.getAllByTestId('card-off-pair')).toHaveLength(1);
    expect(screen.getByTestId('move-0')).toHaveAccessibleName('medium Storm Strike, off-pair');
    edit(0);
    expect(screen.getByTestId('move-elements')).toHaveAttribute(
      'aria-valuetext',
      'Storm · off-pair',
    );
    // It keeps Storm, but takes no new off-pair set (Apply would refuse it): Fire, then Storm.
    expect(screen.getByTestId('move-elements')).toHaveAttribute('aria-valuemax', '1');
    fireEvent.keyDown(screen.getByTestId('move-elements'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('move-elements')).toHaveAttribute('aria-valuetext', 'Fire');
    act(() => store().revertDraft());
    expect(screen.getByTestId('off-pair-note')).toHaveTextContent('Storm off-pair: no attunement');
    edit(1);
    expect(valuesOf('move-elements').some((t) => t.includes('Storm'))).toBe(false);
    // A copy of the off-pair move takes the pair's element instead.
    edit(0);
    fireEvent.click(screen.getByTestId('move-add'));
    expect(draft().primary!.moves[2].elements).toEqual(['fire']);
  });

  it("each ability offers only its class's forms of its slot; a blow picks from the pair", () => {
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    renderSkills();
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    edit(0);
    fireEvent.click(screen.getByTestId('move-form'));
    expect(screen.getByTestId('form-ward')).toBeInTheDocument();
    expect(screen.getByTestId('form-armor')).toBeInTheDocument(); // melee
    expect(screen.queryByTestId('form-repel')).toBeNull(); // ranged
    expect(screen.queryByTestId('form-bolt')).toBeNull(); // a Primary's
    fireEvent.click(screen.getByTestId('form-armor'));
    expect(draft().defensive!.moves[0].form).toBe('armor');
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    edit(0);
    fireEvent.click(screen.getByTestId('move-form'));
    expect(screen.getByTestId('form-maelstrom')).toBeInTheDocument();
    expect(screen.getByTestId('form-onslaught')).toBeInTheDocument(); // melee
    expect(screen.queryByTestId('form-barrage')).toBeNull(); // ranged
    fireEvent.click(screen.getByTestId('form-picker-back'));
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    edit(2);
    expect(valuesOf('move-elements')).toEqual(['Fire', 'Storm']);
    stepTo('move-elements', 'Storm');
    expect(draft().basic![2]).toMatchObject({ kind: 'heavy', element: 'storm' } satisfies Partial<Blow>);
  });
```

- [ ] **Step 3: The sockets describe.** Replace its `socketed` helper (from `  /**\n   * The starting sword (common: one socket a move): …` through the function's closing `}`) with:

```tsx
  /**
   * The worn sword's Primary Strikes with sockets `strike` (none open when null), its blows'
   * sockets `blows`, and the pouch `pouch`; every construct keeps its uid.
   */
  function socketed(
    strike: (RuneRef | null)[] | null,
    pouch: RunePouch = {},
    blows: ((RuneRef | null)[] | null)[] = [],
  ) {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const moveset = movesetOf(registry, sword);
    const primary = moveset.chains.primary!;
    const chains = {
      ...moveset.chains,
      basic: moveset.chains.basic!.map((b, i) => (blows[i] ? { ...b, runes: blows[i] } : b)),
      primary: {
        ...primary,
        moves: primary.moves.map((m) => (strike ? { ...m, runes: strike } : m)),
      },
    };
    store().setProfile({
      ...p,
      runes: pouch,
      equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...moveset, chains } } },
    });
  }
```
and replace `const split = { id: 'split', tier: 1 } as const;` (above the describe) with `const widen = { id: 'widen', tier: 1 } as const;` (Split fits a Bolt, never a Strike; Widen fits a Strike).

| Test | Action |
|---|---|
| + socket opens one on the chosen move at its price; Apply pays the Links and scrap | skip |
| a draft the engine won't price says why in place of a price, once | skip |
| + socket is off without the Links, saying why in the engine's words | skip (B2's `applyDraft` names the Links; the hook already falls back to its reason, so it un-skips as written) |
| an empty socket offers the pouch runes that fit the move; picking one sockets it, free | rewrite (below) |
| a filled socket offers Pull: destroyed by the rule, or for scrap and back to the pouch | rewrite (below) |
| a rune that does nothing on its move is dimmed, with why: Linger on a light blow | keep; its last two lines → `expect(draft().basic![0]).toMatchObject({ kind: 'heavy', runes: [linger] });` |
| a form a socketed rune doesn't fit is off; the kind stays free | rewrite (below) |
| a reorder carries the runes with their move | rewrite (below) |
| the editor's socket rows open the rune grid under the rows, as a scope | keep; `split: [1, 0, 0, 0, 0]` → `widen: [1, 0, 0, 0, 0]`, `rune-pick-split` → `rune-pick-widen` |
| the readout's beat counts a Quick rune | keep |

```tsx
  it('an empty socket offers the pouch runes that fit the move; picking one sockets it, free', () => {
    socketed([null], { split: [1, 0, 0, 0, 0], quick: [0, 0, 2, 0, 0], widen: [1, 0, 0, 0, 0] });
    renderSkills();
    tapSocket(0, 'Socket 1: empty');
    expect(picker().getByRole('button', { name: 'Quick III ×2' })).toBeInTheDocument();
    // Split fits a Bolt, a Volley or a Barrage, never a Strike; Widen fits a Strike.
    expect(picker().queryByRole('button', { name: /^Split/ })).toBeNull();
    fireEvent.click(picker().getByRole('button', { name: 'Widen I ×1' }));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: Widen I' }),
    ).toBeInTheDocument();
    expect(draft().primary!.moves[0].runes).toEqual([widen]);
    expect(draft().primary!.moves[0].uid).toBe(chains().primary.moves[0].uid); // the same construct
  });

  it('a filled socket offers Pull: for scrap and back to the pouch (the shipped rule), or destroyed under the dev chip', () => {
    socketed([widen]);
    renderSkills();
    tapSocket(0, 'Socket 1: Widen I');
    expect(picker().getByTestId('rune-pull')).toHaveTextContent('Pull · 15 scrap, back to your pouch');
    fireEvent.click(picker().getByTestId('rune-pull'));
    expect(draft().primary!.moves[0].runes).toEqual([null]);
    expect(priceLine()).toHaveTextContent('1 unapplied change');
    fireEvent.click(screen.getByTestId('chain-revert'));
    act(() => store().setUnsocket('destroy'));
    tapSocket(0, 'Socket 1: Widen I');
    expect(picker().getByTestId('rune-pull')).toHaveTextContent('Pull · destroys it');
  });

  it("a form a socketed rune doesn't fit is off; the kind stays free", () => {
    socketed([widen]);
    renderSkills();
    edit(0);
    fireEvent.click(screen.getByTestId('move-form'));
    // Widen fits a Strike, a Whirl and a Burst; never a Lance.
    expect(screen.getByTestId('form-burst')).toBeEnabled();
    expect(screen.getByTestId('form-lance')).toBeDisabled();
    expect(screen.getByTestId('form-lance')).toHaveTextContent("Widen doesn't fit a Lance");
    fireEvent.click(screen.getByTestId('form-picker-back'));
    stepTo('move-kind', 'Heavy');
    expect(draft().primary!.moves[0]).toMatchObject({ kind: 'heavy', runes: [widen] });
  });

  it('a reorder carries the runes with their move', () => {
    roomy({
      primary: {
        moves: [
          { ...strike('light', 'p1'), runes: [widen] },
          strike('heavy', 'p2'),
        ],
        payment: 'mana',
      },
    });
    renderSkills();
    edit(0);
    stepTo('move-position', 'Position 2 of 2');
    expect(draft().primary!.moves.map((m) => m.kind)).toEqual(['heavy', 'light']);
    expect(draft().primary!.moves[1].runes).toEqual([widen]);
    expect(socketsOf(draft().primary!.moves[0])).toEqual([]);
  });
```
(If A's Widen row doesn't list `whirl`, the Whirl form reads off in the form test; the assertion names Burst and Lance only.)

- [ ] **Step 4: `SkillStrip.test.tsx`.** Replace:
```tsx
import { carriedByText, defaultMoveset, type ChainSkill } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { renderSkills } from './harness';
```
with:
```tsx
import type { ChainSkill } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { renderSkills, roomy } from './harness';
```
Delete the file's local `roomy` (from `/** The starting sword made epic (all four skills), its chains at five slots. */` through its closing `}`) and the now-unused `registry` and `armed` lines if any remain. Replace the whole test `'an uncarried skill is a dimmed tab whose line says what carries it; it can still be chosen'` with:
```tsx
  it('a skill the weapon has no slot for is a dimmed tab whose line says why; it can still be chosen', () => {
    renderSkills(); // the new save's common sword: no Defensive or Ultimate slot
    for (const [s, text] of [
      ['defensive', "No Defensive slot yet: Open a skill on the Forge's Temper bench"],
      ['ultimate', 'No Ultimate slot on a common weapon'],
    ] as const) {
      const line = within(tab(s)).getByText(text);
      expect(line).toHaveAttribute('data-absent');
      expect(tab(s)).toBeEnabled();
      fireEvent.click(tab(s));
      expect(tab(s)).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('abilities-summary')).toHaveTextContent(text);
    }
  });
```
Its first test reads `Primary 4 of 5 · mana` and `Basic 3 of 5 · free`: the harness's `roomy` gives the epic's ceilings (5 and 5), unchanged.

- [ ] **Step 5: `ApplyBar.test.tsx`.** Its `draftLance` reads `heroChains`: replace the import `import { heroChains, type Chains } from '@alloy/engine';` with `import { movesetOf, type Chains } from '@alloy/engine';` and `const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;` with `const chains = () => movesetOf(registry, store().profile.equipped.weapon!).chains as Chains;`; `store().setProfile(armed(store().profile))` → `store().setProfile(stamped(armed(store().profile)))` with `import { stamped } from './harness';`. In `'counts the unapplied changes with their price; Revert drops them and Apply opens the sheet'`, replace:
```tsx
    expect(price()).toHaveTextContent('1 unapplied change · free until your first dive');
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply');
```
with:
```tsx
    // Its price is B2's engine (D2 reads "free until your first dive" here); the count is the bar's.
    expect(price()).toHaveTextContent('1 unapplied change');
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName(/^Apply/);
```
and its last line `expect(chains().primary.moves[0].form).toBe('bolt');` → `.toBe('strike')`.

- [ ] **Step 6: `SkillsTab.trail.test.tsx`.** D1 rewrites Hesta's lesson for the bag (the slot, the secondary, the socket, the rune, Apply), and its `lesson()` builds the Primary from `defaultMoveset` without uids. Prefix the two walking tests (`'leads through the editor in order: …'` and `"the editor's lesson targets sit on the Primary's moves only: …"`) with `// D1 rewrites the lesson's trail for the bag; D2 un-skips.` and make them `it.skip(`. `'the trail is the one this walk follows'` stays (it reads the script).

- [ ] **Step 7: Run the whole area.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write "src/features/delve/hub/skills/__tests__/*.tsx" && npx vitest run src/features/delve/hub/skills src/features/delve/chains src/stores/delveStore.test.ts --reporter=dot)` → no type errors; every test passes or is skipped. A failure left is one of two kinds, settled by one rule: a name that assumed a Bolt on the sword (`rune-costs.test.tsx`, `ManaView.test.tsx`, `SkillsTab.test.tsx`'s prompt list: rename to the Strike, or build the chain by hand with `strikes`), or an engine refusal (`Not yet`, a price, an Apply: `it.skip` it under `// D2 un-skips: …`). Never loosen an assertion to pass.

- [ ] **Step 8: Commit.**

```bash
cd /c/Projects/alloy-constructs-c1
git add packages/client/src/features/delve/hub/skills/__tests__
git commit -m "test(client): the Skills tab on the slot table; the engine-dependent tests wait for B2" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Client tests outside the Skills tab that the draft touches

Searched the client for `chainDraft`, `editDraft`, `applyDraft`, `selectDraftApply`, `draftChanges` and `origins`:
- `hub/__tests__/DepartSheet.test.tsx` (if it drafts a change to see `draft-block`): it reads `draft-warning`, `draft-apply` and `draft-apply-why`; the warning and the disabled Apply hold (A's engine refuses with "Not yet", shown as `draft-apply-why`). A test that expects a *specific* reason or an Apply that goes through: `it.skip` with the D2 note.
- `pages/__tests__/DelveCamp.test.tsx` and `hub/__tests__/AnvilHub.test.tsx`: if one drafts and applies, the same rule.
- `stores/delveStore.test.ts`: Task 2.
- `features/delve/__tests__/StopPanel.test.tsx` and `training/__tests__`: they pass `onChange={(skill, chain) => …}` and ignore the third argument; C2's files, untouched here.

## Area close

- [ ] `(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)` → no type errors; the whole client suite passes with the skips listed under Needs routed (D2).
- [ ] `(pnpm -F @alloy/client build)` → builds.
- [ ] `git log --oneline constructs/main..constructs/c1` → nine commits, each ending with the trailer.

## Needs routed

- **C2 (the store):** `salvageConstruct` and `undoSalvage` are C2's actions, as the overview and C2's draft say; the bag pane calls them by name (`salvageFromBag`, Task 5; the tab's Undo prompt, Task 6). So that this branch typechecks, Task 2 declares the `DelveStore` member with a thin body (the engine's `salvageConstruct` under the pull rule, plus the same Undo bookkeeping as `salvage`); at merge **C2's body wins** (drop C1's; keep the member's doc comment if C2 has none). `undoSalvage` is untouched here. C2's `moveAll` action is C2's alone (A's mechanical `transfer → moveAll` is in this file; C1 doesn't touch it). `partsText` is reused as is.
- **C2 (the Loadout, Help, Training):** `ChainEditorProps.weaponBaseId` (Task 1) is the prop C2 asked for: the sandbox's `ChainEditor` passes `sandboxWeapon`'s base so the form picker gates by its class and `dormantWhy` can mark its class-only moves (pass `dormantText` with `cantExpress` over a stand-in `GearItem`, or a one-line `formAllowed` check); with the prop absent the hero's `stats.weapon.baseId` is read, as the Anvil does. `cantExpress(registry, weapon, c)` and `absentText(registry, weapon, skill)` are exported from `hub/skills/useAnvilChains.ts` for a dormant mark in `MovesetView`, the compare pane's frame line and the Training dock: import them rather than word the class rule twice. The Training dock's `ChainEditor` keeps `remove` (× never the last) and passes no `bag`; if C2 wants its form chips class-gated, `moveChoices` (in `chains/MoveEditor.tsx`, C2's) filters as `FormPicker` does: `formAllowed(registry, ed.weaponBaseId, f.id)`.
- **D1 (the tutorial, TU01's lesson 1):** every selector and target D1 named survives unchanged: `add-slot` (`skills.addSlot`), `move-0` / `move-2` (`skills.card:first` / `:last`), `move-elements` (`skills.elements`), `move-editor-back`, `socket-open` (`skills.socket`), `inspect-socket-0` (`skills.rune` on the row), `rune-picker` and `rune-pick-*` (the grid, `skills.rune`), `chain-apply` (`skills.apply`) and `apply-sheet-confirm` (`skills.apply`); the new slot a lesson buys arrives plain-filled, so `move-2` exists as soon as Add slot goes through. The one rename is the editor's Remove → Unsocket (`move-remove` → `move-unsocket`), which the lesson never targets; the lesson's "remove a move" line, if any, reads unsocket. `SkillsTab.trail.test.tsx`'s two walking tests are skipped here (Task 9 Step 6) for D1 to rewrite with the bag and un-skip.
- **D2 (un-skips, once B2 is merged):** `stores/delveStore.test.ts`: "socketing a pouch rune is free", "Apply sets the chains and the bag together", "a new socket costs Links and scrap", "when the engine won't price the draft", "the pull rule: paying (as shipped)…", "salvaging a bag construct commits at once…"; `SkillsTab.chains.test.tsx`: the seven marked in Task 9 (edits a draft; Apply is off while refused; after the first dive; a refused Add slot or Apply; + socket opens one at its price; a draft the engine won't price; + socket is off without the Links) and the realign one; `ApplySheet.test.tsx`: the four marked in Task 8; `SkillsTab.test.tsx`'s Ctrl+Enter and Y tests may take their Apply assertions back. Then re-read `ApplyBar.test.tsx`'s price line ("free until your first dive").
- **D2 (the pad audits):** `e2e/delve-pad-nav.spec.ts`'s `CEILING.skills` (5) counts the strip's Realign, the Primary's cards and Delve: the bag pane adds one stop a construct of the chosen skill in the audit save's bag (its rows; Salvage is `data-pad-skip`), and a chain under its slots adds "+ Move" (the empty wells are marks). Raise it by what the audit save holds and say so in its comment. PN03's "down to the footer" from a card now crosses the bag pane (a plate, a pad group): the `back(page, 'up', 'card')` reversal holds as long as the pane's rows sit between; with an empty bag the pane holds no stop and the walk is as before. PN07's element budget is unchanged (card → A → Elements). New selectors for the E2E: `construct-bag`, `bag-construct` (`data-construct`), `bag-salvage`, `bag-cant`, `bag-empty`, `bag-count`, `chain-ceiling` (`data-ceiling`), `slot-empty`, `card-dormant`, `dormant-note`, `inspector-empty`, `move-unsocket` (was `move-remove`), `apply-free`. The responsive text probe: the bag's labels are 16 design px (`k-caption`), its names 18.
- **D2 (docs):** CLAUDE.md's Client paragraph, the Skills tab: the bag pane under the lane (`ConstructBag`, its rows A places and X salvages with Undo on B, filtered to the chosen skill); the lane's empty slots and ceiling (`chain-ceiling`), dormant cards greyed with their reason (`data-dormant`, `cantExpress`), `EMPTY_CHAIN`; X unsockets (`unsocket` on the model, the Basic keeping one blow, an ability chain free to empty); the draft `{ uid, pair, chains, bag }` with `draftOf`, `draftApply` reading `draftRefusal` and a rich dry run of `applyDraft` (`priceFromDry`), `applyDraft` committing both; `draftLines`' free moves; `absentText` in `carriedByText`'s place; the form picker by `formAllowed`.
- **Shared file, additive:** `features/delve/chains/chain-text.ts` gains `constructText` and `lessRunes` (Task 1, exports only); if C2 edits it too, merge both.
- **A / B2 (the contract):** see Open questions 1–4; nothing to change unless an answer differs from the assumption.

## Open questions for the integrator

1. **A partial `ConstructDraft.chains`:** the store passes only the chains that differ (as `setChains` takes them) and the whole bag. The contract's uid rule ("every uid in the saved chains and bag must be in the draft's chains or bag") must read a skill absent from `draft.chains` as unchanged, else an unchanged chain's uids read as gone. If B2's `applyDraft` wants every chain, `draftOf` sends `{ ...movesetOf(weapon).chains, ...changes }` instead (one line in `draftOf`).
2. **A's `draftRefusal`:** does A's run the rules, or return "Not yet" like the ops? The store treats any non-null as the refusal either way, but the "+ socket is off without the Links" test and the Depart sheet's reason wait on a real one (listed as D2 skips).
3. **An engine `draftPrice(registry, profile, draft: ConstructDraft, opts)`:** the store prices by a rich dry run (`priceFromDry`, marked `ponytail:`). If B2 ships one, `draftApply` calls it in place of the rich run and `priceFromDry` goes; `DraftPrice`'s shape is assumed unchanged.
4. **`sameChain` after A:** the store wraps it in `sameConstructs` (uid for uid), so it doesn't matter whether A's compares uids; if it does, `sameConstructs` can collapse to `sameChain`.
5. **`MovesetOwner`:** `slotRange(registry, null, s)` for unarmed and `ceilingOf(registry, weapon /* a GearItem */, s)` are assumed to typecheck as `armed()`'s `defaultMoveset(registry, { baseId, rarity }, mana)` does today; if the owner type is narrower, pass `{ baseId: weapon.baseId, rarity: weapon.rarity }`.
6. **`constructSkill` for a blow** is assumed to be `'basic'` and for a move its form's slot (the contract's words); the bag filter and `place` rely on it.
7. **The audit save's bag** (`e2e/delve-pad-nav.spec.ts`): after A, does the seeded save hold any construct in `constructs`? That sets `CEILING.skills`.
8. **`RARITY_LABEL`'s casing** (`features/delve/format.ts`): `absentText` lower-cases it ("a common weapon"); if the labels are already lower case, the call is harmless.
