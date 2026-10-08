# Delve constructs — Phase C2: the Loadout, the Forge, the item header, the arena's look, the Training Grounds and Help

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Loadout shows a weapon as a frame (class, style, slots against the ceiling) and offers Move all in Transfer's place; the Forge's Temper bench opens a skill where it awakened, and its preview says each skill's starting slots and ceiling; the item header names the class and style; a weapon's moveset lists slots, ceilings and dormant constructs; the stop's power-ups read the new model; the arena draws one look motif per weapon; the Training Grounds follow the class rules and Load my build loads constructs; Help tells the constructs frame. Spec §3.2–3.3, §4.2 (look), §6 (the Loadout, the Forge, the item header, the arena, the Training Grounds, Help); the lore of §1.

**Base:** Phase A merged (`constructs/main`). Worktree: `C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/1d6bb288-c64f-43d2-9587-234f3b95983f/scratchpad/mkwt.ps1 -Name alloy-constructs-c2 -Branch constructs/c2 -Base constructs/main`.

**Owns:** `features/delve/hub/loadout/` (`ComparePane.tsx`, `TakeSheet.tsx`, `EquippedPane.tsx`, `LoadoutTab.tsx`'s equip guard; `BagPane.tsx` needs no edit: its ◇ comes from `compareItem`'s `'home'` value, which A moved onto `moveAllPreview`), `features/delve/items/` (`ItemHeader.tsx`, `MovesetView.tsx`, `LegendaryBox.tsx`, and the new `weapon-frame.ts`), `hub/forge/Temper.tsx`, `hub/forge/ForgeBench.tsx`'s preview line, `features/delve/StopPanel.tsx`, `arena/fx/` (the new `looks.ts`, `mana-fx.ts`'s look carriers), `arena/ArenaRenderer.ts` and its two tests (`__tests__/arena-renderer.test.ts`, `arena/fx/__tests__/mana-fx.test.ts`; the overview's C2 row lists the renderer and its tests under C2), `arena/hud/` (a test only: it reads `heroChains`), `features/delve/training/useTrainingArena.ts`, `stores/sandboxStore.ts`, `hub/help/help-topics.tsx`, `kit/glyph-art.ts`'s three new form glyphs, and the store's `moveAll`, `salvageConstruct` and `openSkill` actions in `stores/delveStore.ts` (one block of their own: C1 edits the same file for the draft; see Needs routed), with their tests.

**Not here:** the Skills tab, its bag pane, `ChainEditor` and the draft (C1); the Lab's `'style'` view (B1); the autopilot and tutorial (D1); the version bump, CLAUDE.md and E2E runs (D2).

All paths below are under `packages/client/src/features/delve/` unless they start with `packages/`, `stores/` or `e2e/`.

## What A leaves (assumed, from the overview's contract)

- `@alloy/engine` exports `weaponClass`, `formAllowed`, `slotRange`, `ceilingOf`, `dormantUids`, `moveAllPreview`, `openSkill`, `openSkillPrice`, `MAX_SOCKETS`, `movesetOf`, `heroChains`, `defaultChains` (class-aware: a melee weapon's Primary is Strike, a ranged one's Bolt), the types `WeaponClass`, `CastStyle`, `StyleLook`, `Construct`, `Moveset`, and from the stubbed `delve/constructs.ts` `moveAll` and `salvageConstruct` (refusing "Not yet" until B2 merges).
- `GearBaseDef.class` and `.style` on every weapon base (`registry.getGearBase(baseId)`); `GearItem.awakened` is gone; `Moveset` is `{ chains, slots, bought }`.
- `ForgePreview.weapon` is `{ class, slots: Record<ChainSkill, [slots, ceiling]>, sockets }`.
- The events `cast`, `hit`, `beam`, `slash`, `explode` and `dash` carry `look?: StyleLook` (A sets it on `cast` alone; B1 on the rest: until B1 merges only casts draw a motif, which the renderer's tests don't mind).
- A's mechanical pass left `ComparePane.tsx`, `TakeSheet.tsx`, `Temper.tsx`, `StopPanel.tsx`, `LegendaryBox.tsx`, `sandboxStore.ts` and `delveStore.ts` compiling with the smallest edit (the transfer action calling `moveAll`, Awaken's calling `openSkill`). Every task below replaces those edits wholesale: where a step's anchor names today's code (`2f3871b2`) and A changed it, replace A's version of the same spot.
- `GLYPH_ART` in `kit/glyph-art.ts` is a `Record<GlyphId, …>` and `GlyphId` includes `FormId`, so A's typecheck pass must have added rows for `whirl`, `repel` and `onslaught` (placeholders or real); Task 12 draws them.
- Before every client check: `cd packages/engine && npx tsup` once (the client reads the bundle).

## Words used throughout

- A weapon is a **frame**: "Melee · Balanced" (its class and its style's name).
- Slots read "Primary 2 / 3" (held / ceiling); a skill at its ceiling 0 reads "Ultimate —"; one at 0 slots with a ceiling reads "Defensive 0 / 1".
- A construct the weapon's class can't express is **dormant**: "(dormant)" after its name, greyed.
- Transfer is **Move all**: "Move all here", free; "n to your bag" for what doesn't fit, "n dormant" for what the class can't express.
- The draft guard: "Apply or discard your Skills changes first" (`DRAFT_PENDING`).

---

## Chunk 1: the Loadout and the store

### Task 1: `weapon-frame.ts`, the one formatter for a frame

One pure helper the compare pane, the moveset view, the paper doll and the forge preview share, so "Primary 2 / 3" reads the same everywhere.

**Files:**
- Create: `items/weapon-frame.ts`
- Test: `items/__tests__/weapon-frame.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { CHAIN_SKILLS, generateItem, SeededRNG, slotRange } from '@alloy/engine';
import { classText, frameText, slotPairs, slotsText } from '../weapon-frame';
import { getDelveRegistry } from '../../registry';

const registry = getDelveRegistry();
const weapon = (baseId: string, rarity: 'common' | 'rare') =>
  generateItem(
    registry,
    { uid: 'w1', ilvl: 3, rarity, slot: 'weapon', baseId, mana: 'fire' },
    new SeededRNG(4),
  );

describe('weapon-frame', () => {
  it("names a weapon's class and its style: the frame line", () => {
    expect(frameText(registry, weapon('sword', 'common'))).toBe('Melee · Balanced');
    expect(frameText(registry, weapon('bow', 'rare'))).toBe('Ranged · Marksman');
    expect(classText('melee')).toBe('Melee');
    expect(classText(null)).toBe('Unarmed');
  });

  it("lists each skill's slots held against its ceiling, in skill order", () => {
    const w = weapon('sword', 'common');
    const pairs = slotPairs(registry, w);
    expect(pairs.map(([s]) => s)).toEqual(CHAIN_SKILLS);
    for (const [s, held, ceiling] of pairs) {
      expect(held).toBe(w.moveset!.slots[s] ?? 0);
      expect(ceiling).toBe(slotRange(registry, w, s)[1]);
    }
    // A common sword: the Basic's string, two Primary, no Defensive yet, no Ultimate ever.
    expect(slotsText(pairs)).toBe('Basic 3 / 3 · Primary 2 / 3 · Defensive 0 / 1 · Ultimate —');
  });

  it('formats pairs from anywhere (the forge preview hands its own)', () => {
    expect(
      slotsText([
        ['basic', 3, 4],
        ['primary', 3, 4],
        ['defensive', 2, 3],
        ['ultimate', 1, 2],
      ]),
    ).toBe('Basic 3 / 4 · Primary 3 / 4 · Defensive 2 / 3 · Ultimate 1 / 2');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/items/__tests__/weapon-frame.test.ts --reporter=dot`
Expected: FAIL (cannot resolve `../weapon-frame`).

- [ ] **Step 3: Implement**

`items/weapon-frame.ts`:

```ts
import {
  CHAIN_SKILLS,
  movesetOf,
  slotRange,
  weaponClass,
  type ChainSkill,
  type DataRegistry,
  type GearItem,
  type WeaponClass,
} from '@alloy/engine';
import { SKILL_NAME } from '../chains/chain-text';

/** A skill, the slots a weapon holds of it, and its ceiling. */
export type SlotPair = [skill: ChainSkill, held: number, ceiling: number];

/** "Melee", "Ranged"; "Unarmed" for no weapon. */
export function classText(cls: WeaponClass | null): string {
  return cls === 'melee' ? 'Melee' : cls === 'ranged' ? 'Ranged' : 'Unarmed';
}

/** "Melee · Balanced": a weapon's class and the name of its cast style (spec §4.1). */
export function frameText(registry: DataRegistry, item: Pick<GearItem, 'baseId'>): string {
  const base = registry.getGearBase(item.baseId);
  const cls = classText(weaponClass(registry, item.baseId));
  return base.style ? `${cls} · ${base.style.name}` : cls;
}

/** Each skill's slots held of its ceiling, in `CHAIN_SKILLS` order (spec §3.2). */
export function slotPairs(registry: DataRegistry, item: GearItem): SlotPair[] {
  const { slots } = movesetOf(registry, item);
  return CHAIN_SKILLS.map((s) => [s, slots[s] ?? 0, slotRange(registry, item, s)[1]]);
}

/** "Basic 3 / 3 · Primary 2 / 3 · Defensive 0 / 1 · Ultimate —" (a 0 ceiling reads —). */
export function slotsText(pairs: readonly SlotPair[]): string {
  return pairs
    .map(([s, held, ceiling]) =>
      ceiling === 0 ? `${SKILL_NAME[s]} —` : `${SKILL_NAME[s]} ${held} / ${ceiling}`,
    )
    .join(' · ');
}
```

If `registry.getGearBase` isn't the base lookup's name, use what `ItemHeader.tsx` uses today (`registry.getDelveData().bases.find((b) => b.id === item.baseId)`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/items/__tests__/weapon-frame.test.ts --reporter=dot`
Expected: PASS (3 tests). The Basic's string is 3 on a sword; if A's `slotRange` gives the common Basic another ceiling, read the expected line from `slotRange` instead of the literal.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/items/weapon-frame.ts packages/client/src/features/delve/items/__tests__/weapon-frame.test.ts
git commit -m "feat(client): weapon-frame formats a weapon's class, style and slots against the ceiling

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: the store's `moveAll`, `salvageConstruct` and `openSkill`

One block of their own at the end of the store, after `takeStop`, so the integrator can merge C1's draft edits round it. `transfer` and `awaken` go.

**Files:**
- Modify: `stores/delveStore.ts`
- Test: `stores/delveStore.test.ts` (a new `describe` at the end)

- [ ] **Step 1: Write the failing tests**

Append to `stores/delveStore.test.ts`:

```ts
describe('constructs: Move all, salvaging a construct, Open a skill', () => {
  const s = () => useDelveStore.getState();
  const registry = getDelveRegistry();
  const rareSword = (uid: string): GearItem =>
    generateItem(
      registry,
      { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
  beforeEach(() => {
    localStorage.clear();
    s().resetProfile(1234, 'fire');
    s().setProfile({ ...s().profile, bag: [rareSword('w1')], scrap: 500, links: 5 });
  });
  afterEach(() => vi.useRealTimers());

  it('Move all is refused while the Skills draft holds changes, before the engine is asked', () => {
    const chains = heroChains(registry, s().profile.equipped, s().profile.pair);
    const primary = chains.primary!;
    useDelveStore.setState({
      chainDraft: {
        uid: s().profile.equipped.weapon!.uid,
        pair: s().profile.pair,
        chains: { primary: { ...primary, moves: primary.moves.slice(0, 1) } },
      } as ChainDraft,
    });
    const res = s().moveAll('w1');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(DRAFT_PENDING);
    expect(s().profile.equipped.weapon!.uid).not.toBe('w1');
  });

  // D2 un-skips: B2's moveAll.
  it.skip('Move all wears the bag weapon with your constructs on it, and clears its NEW mark', () => {
    s().markNew(['w1']);
    const mine = movesetOf(registry, s().profile.equipped.weapon!).chains.primary!;
    const res = s().moveAll('w1');
    expect(res.ok).toBe(true);
    const worn = s().profile.equipped.weapon!;
    expect(worn.uid).toBe('w1');
    expect(movesetOf(registry, worn).chains.primary!.moves.map((m) => m.uid)).toEqual(
      mine.moves.map((m) => m.uid),
    );
    expect(s().newUids.w1).toBeUndefined();
  });

  // D2 un-skips: B2's salvageConstruct.
  it.skip('salvaging a bag construct offers Undo for UNDO_MS, like a salvage', () => {
    vi.useFakeTimers();
    const [c] = movesetOf(registry, s().profile.bag[0]).chains.primary!.moves;
    // One construct in the bag: unsocketed from the bag weapon by B2's op, stood here by hand.
    s().setProfile({ ...s().profile, constructs: [c] });
    const before = s().profile;
    const res = s().salvageConstruct(c.uid!);
    expect(res.ok).toBe(true);
    expect(s().profile.constructs).toHaveLength(0);
    expect(s().undo).toMatchObject({ before, after: s().profile });
    expect(s().undoSalvage()).toBe(true);
    expect(s().profile).toBe(before);
    s().salvageConstruct(c.uid!);
    vi.advanceTimersByTime(UNDO_MS);
    expect(s().undo).toBeNull();
  });

  it('salvaging a construct is refused while the Skills draft holds changes', () => {
    const chains = heroChains(registry, s().profile.equipped, s().profile.pair);
    const primary = chains.primary!;
    useDelveStore.setState({
      chainDraft: {
        uid: s().profile.equipped.weapon!.uid,
        pair: s().profile.pair,
        chains: { primary: { ...primary, moves: primary.moves.slice(0, 1) } },
      } as ChainDraft,
    });
    expect(s().salvageConstruct('c1')).toMatchObject({ ok: false, reason: DRAFT_PENDING });
  });

  it('Equip is refused with the notice while the Skills draft holds changes (any item: the bind choice too)', () => {
    const chains = heroChains(registry, s().profile.equipped, s().profile.pair);
    const primary = chains.primary!;
    useDelveStore.setState({
      chainDraft: {
        uid: s().profile.equipped.weapon!.uid,
        pair: s().profile.pair,
        chains: { primary: { ...primary, moves: primary.moves.slice(0, 1) } },
      } as ChainDraft,
    });
    expect(s().equip('w1')).toBe(false);
    expect(s().profile.equipped.weapon!.uid).not.toBe('w1');
    expect(s().takeNotices()).toContain(DRAFT_PENDING);
    useDelveStore.setState({ chainDraft: null });
    expect(s().equip('w1')).toBe(true);
    expect(s().profile.equipped.weapon!.uid).toBe('w1');
  });

  it("Open a skill opens a weapon's skill at 0 slots through the engine, for its price", () => {
    const common = s().profile.equipped.weapon!;
    const price = openSkillPrice(registry, common);
    s().setProfile({
      ...s().profile,
      scrap: price.scrap,
      links: price.links,
      materials: { ...s().profile.materials, flux: { ...s().profile.materials.flux, ...price.flux } },
    });
    const res = s().openSkill(common.uid, 'defensive');
    expect(res.ok).toBe(true);
    expect(movesetOf(registry, s().profile.equipped.weapon!).slots.defensive).toBe(1);
    expect(s().profile.scrap).toBe(0);
  });
});
```

Add to the file's imports what it lacks: `heroChains`, `movesetOf`, `openSkillPrice`, `generateItem`, `SeededRNG`, `type GearItem` from `@alloy/engine`; `DRAFT_PENDING`, `UNDO_MS`, `type ChainDraft` from `./delveStore`; `afterEach`, `vi` from vitest; `getDelveRegistry` from `@/features/delve/registry`. The `as ChainDraft` casts let the test compile whatever fields C1 adds to the draft; if C1's `draftChanges` needs a bag field, add `bag: []`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/stores/delveStore.test.ts --reporter=dot`
Expected: FAIL (`DRAFT_PENDING` not exported; `moveAll`, `salvageConstruct`, `openSkill` are not store actions).

- [ ] **Step 3: Implement**

In `stores/delveStore.ts`:

1. Imports: remove `transferMoveset` and `awaken as engineAwaken` (A may have replaced them already); add `moveAll as engineMoveAll, salvageConstruct as engineSalvageConstruct, openSkill as engineOpenSkill` and `type AbilitySlot`.

2. After `export const UNDO_MS = 5000;` add:

```ts
/** Why Move all, a construct's salvage and any Equip wait: the Skills draft (spec §3.3). */
export const DRAFT_PENDING = 'Apply or discard your Skills changes first';

/** The Skills draft holds changes the save doesn't (the ops that commit at once wait on it). */
export function draftPending(s: Pick<DelveStore, 'profile' | 'chainDraft'>): boolean {
  return Object.keys(draftChanges(getDelveRegistry(), s.profile, s.chainDraft)).length > 0;
}
```

(`draftChanges` is C1's; if C1 renames it, point `draftPending` at the new name: it is the one reader outside the draft.)

3. In the `DelveStore` interface, replace the `transfer` entry with nothing, the `awaken` entry with nothing, make `equip` `(uid: string) => boolean` with the comment "Wear a bag item; false, with the `DRAFT_PENDING` notice, while the Skills draft holds changes (spec §3.3: any equip waits, the bind choice's too)", and add at the end (after `setUnsocket`):

```ts
  /**
   * Move every construct of the worn weapon onto bag weapon `uid`, slot for slot, and wear it
   * (spec §3.3 Move all): free; refused while the Skills draft holds changes.
   */
  moveAll: (uid: string) => ProfileActionResult;
  /**
   * Melt a bag construct: its runes back to the pouch at the pull price. Undo for `UNDO_MS`, as a
   * salvage; refused while the Skills draft holds changes.
   */
  salvageConstruct: (uid: string) => ProfileActionResult;
  /** Open `skill` on weapon `uid` (its first slot), for flux, Links and scrap (Awaken generalised). */
  openSkill: (uid: string, skill: AbilitySlot) => ProfileActionResult;
```

4. In `salvage`, lift the Undo offer into a helper above the returned object (beside `applyResult`):

```ts
  /** Something melted: Undo may take it back for UNDO_MS (`cleared`: the NEW marks it took). */
  const offerUndo = (before: DelveProfile, cleared: Record<string, true> = {}) => {
    const undo: SalvageUndo = { before, after: get().profile, newUids: cleared };
    set({ undo });
    setTimeout(() => {
      if (get().undo === undo) set({ undo: null });
    }, UNDO_MS);
  };
```

and in `salvage` replace the block from `if (res.profile.bag.length < before.bag.length) {` to its closing `}` with:

```ts
      if (res.profile.bag.length < before.bag.length)
        offerUndo(
          before,
          Object.fromEntries(uids.filter((u) => newUids[u]).map((u) => [u, true as const])),
        );
```

5. Delete the `transfer:` and `awaken:` actions. The `equip` action becomes the one guard for every equip (the Loadout's, the take sheet's, the bind choice's):

```ts
    equip: (uid) => {
      // A dive locks the chains and so does an unapplied draft: Apply or discard it first.
      if (draftPending(get())) {
        notify(DRAFT_PENDING);
        return false;
      }
      commit(equipItem(registry(), get().profile, uid));
      set({ newUids: withoutUids(get().newUids, [uid]) });
      // The Loadout's onboarding hint is done, by whichever control equipped (features/delve/onboarding.ts).
      useUIStore.getState().markSeen('loadout');
      return true;
    },
```

After `takeStop`, add the block:

```ts
    // ── Constructs (the constructs spec §3.3): the ops that commit at once. C1 owns the draft above. ──

    moveAll: (uid) => {
      const { profile } = get();
      if (draftPending(get())) return { ok: false, profile, reason: DRAFT_PENDING };
      const res = applyResult(engineMoveAll(registry(), profile, uid));
      if (res.ok) {
        set({ newUids: withoutUids(get().newUids, [uid]) });
        useUIStore.getState().markSeen('loadout');
      }
      return res;
    },

    salvageConstruct: (uid) => {
      const { profile: before } = get();
      if (draftPending(get())) return { ok: false, profile: before, reason: DRAFT_PENDING };
      const res = applyResult(engineSalvageConstruct(registry(), before, uid, pull()));
      if (res.ok) offerUndo(before);
      return res;
    },

    openSkill: (uid, skill) => applyResult(engineOpenSkill(registry(), get().profile, uid, skill)),
```

If `ProfileActionResult`'s refusal shape has another field name than `reason`, use the engine's `refuse` helper's shape (grep `reason` in `delve/profile.ts`).

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/stores/delveStore.test.ts --reporter=dot`
Expected: tsc names `ComparePane.tsx` and `TakeSheet.tsx` (`transfer` gone) and `Temper.tsx` (`awaken` gone); the store's tests PASS (3 run, 2 skipped). Tasks 3 and 7 fix the compile; commit the store with Task 3.

---

### Task 3: `ComparePane`: the frame, Move all and the equip guard

**Files:**
- Modify: `hub/loadout/ComparePane.tsx`
- Modify: `hub/loadout/LoadoutTab.tsx` (its `equip` action reads the store's refusal before its sound)
- Test: `hub/loadout/__tests__/ComparePane.test.tsx`

- [ ] **Step 1: Rewrite the tests**

In `ComparePane.test.tsx`, replace the four Transfer tests (`'a bag weapon is valued as it is and with your moveset; Transfer moves…'`, `'each valuation shows its own delta…'`, `'Transfer onto a weapon that carries less…'`, `'a transfer counts the sockets it moves…'`) with:

```tsx
  it('shows a bag weapon as a frame: its class and style, and its slots against the ceiling', () => {
    put(rareSword('w1'));
    show('w1');
    expect(screen.getByTestId('weapon-frame')).toHaveTextContent('Melee · Balanced');
    expect(screen.getByTestId('weapon-frame')).toHaveTextContent(
      slotsText(slotPairs(registry, store().profile.bag[0])),
    );
  });

  it('a bag weapon is valued as it is and after Move all; Move all is free and moves every construct onto it', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    store().setProfile({ ...p, bag: [rareSword('w1')], scrap: 0 });
    show('w1');
    // The actions sit below the scrolling details, always in view.
    for (const id of ['move-all-button', 'equip-button', 'salvage-button', 'lock-button'])
      expect(screen.getByTestId(id).closest('.k-scroll'), id).toBeNull();
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent('Power');
    expect(screen.getByTestId('item-compare')).toHaveTextContent('After Move all');
    expect(screen.getByTestId('compare-home')).toHaveTextContent('Power');
    expect(screen.getByTestId('move-all-button')).toHaveTextContent(/^Move all here$/);
    expect(screen.queryByTestId('move-all-bag')).toBeNull(); // a rare sword holds all of a common's
    expect(screen.queryByTestId('move-all-dormant')).toBeNull();
    fireEvent.click(screen.getByTestId('move-all-button'));
    // D2 un-skips the rest of this test: B2's moveAll (A's stub refuses "Not yet").
    if (store().profile.equipped.weapon!.uid !== 'w1') return;
    const now = store().profile;
    expect(movesetOf(registry, now.equipped.weapon!).chains.primary!.moves.map((m) => m.uid)).toEqual(
      movesetOf(registry, sword).chains.primary!.moves.map((m) => m.uid),
    );
    expect(screen.getByText(/Your constructs moved onto /)).toBeInTheDocument();
  });

  it('each valuation shows its own delta: Equip is marked as it is, Move all as a home', () => {
    const { p, plain, equipped } = putHomeOnlyWeapon();
    const depth = referenceDepth(store().profile);
    const asIs = compareItem(equipped, plain, registry, depth, p.pair, 'asIs').powerPct;
    const home = compareItem(equipped, plain, registry, depth, p.pair).powerPct;
    expect(asIs).toBeLessThan(-UPGRADE_EPSILON);
    expect(home).toBeGreaterThan(UPGRADE_EPSILON);
    show('w2');
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent(`Power▼ ${formatDelta(asIs)}`);
    expect(screen.getByTestId('compare-home')).toHaveTextContent(`Power▲ ${formatDelta(home)}`);
    expect(screen.getByTestId('equip-button')).toHaveTextContent(
      `Equip · ${formatDelta(asIs)} Power`,
    );
    expect(screen.getByTestId('equip-button')).not.toHaveClass('k-go');
    expect(screen.getByTestId('move-all-button')).toHaveTextContent(/^▲ Move all here$/);
    expect(screen.getByTestId('move-all-button')).toHaveClass('k-go');
  });

  it('Move all onto a weapon with fewer slots says how many constructs go to your bag', () => {
    const { plain } = putHomeOnlyWeapon(); // five Primary and five basic constructs onto an uncommon
    show('w2');
    const preview = moveAllPreview(registry, store().profile.equipped.weapon!, plain);
    expect(preview.toBag.length).toBeGreaterThan(0);
    expect(screen.getByTestId('move-all-bag')).toHaveTextContent(
      `${preview.toBag.length} to your bag`,
    );
  });

  it("Move all onto the other class says which constructs sleep: a bow can't express Strike", () => {
    const p = store().profile;
    const bow = generateItem(
      registry,
      { uid: 'w3', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'bow', mana: 'fire' },
      new SeededRNG(4),
    );
    store().setProfile({ ...p, bag: [bow] });
    show('w3');
    // A new save's sword holds Strike constructs (the melee default): dormant on a bow.
    expect(screen.getByTestId('weapon-frame')).toHaveTextContent('Ranged · Marksman');
    expect(screen.getByTestId('move-all-dormant')).toHaveTextContent(/\d+ dormant: a bow can't express Strike/);
  });

  it('Move all waits on the Skills draft (Equip does too, in the store: see delveStore.test.ts)', () => {
    put(rareSword('w1'));
    const chains = heroChains(registry, store().profile.equipped, store().profile.pair);
    const primary = chains.primary!;
    useDelveStore.setState({
      chainDraft: {
        uid: store().profile.equipped.weapon!.uid,
        pair: store().profile.pair,
        chains: { primary: { ...primary, moves: primary.moves.slice(0, 1) } },
      } as ChainDraft,
    });
    show('w1');
    fireEvent.click(screen.getByTestId('move-all-button'));
    expect(screen.getByText(DRAFT_PENDING)).toBeInTheDocument();
    expect(store().profile.equipped.weapon!.uid).not.toBe('w1');
  });
```

Keep the `'a legendary whose power rides a skill the weapon lacks…'` test but read its expectation from Task 10 ("your weapon has no Defensive chain"). In the `'locked, Equip, Salvage, Lock, the bind choice, Transfer and Forge it give way to a note'` test, rename `transfer-button` to `move-all-button`. In `putHomeOnlyWeapon`, the moveset still comes from `defaultMoveset(registry, sword, 'fire', { primary: 5, basic: 5 })` (A's signature keeps `slots`); if A's `defaultMoveset` takes an owner rather than an item, pass `{ baseId: sword.baseId, rarity: sword.rarity }`. Add to the imports: `moveAllPreview`, `movesetOf`, `heroChains`, `generateItem`, `SeededRNG`; `DRAFT_PENDING`, `type ChainDraft` from `@/stores/delveStore`; `slotPairs`, `slotsText` from `../../../items/weapon-frame`. Drop `withRunes`, `split` and `quick` if nothing reads them.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx --reporter=dot`
Expected: FAIL (compile: `transfer` is gone; no `weapon-frame`).

- [ ] **Step 3: Implement**

In `ComparePane.tsx`:

1. Imports: replace `carriedSkills, movesetTransfer, unsocketMode` with `moveAllPreview, weaponClass, type WeaponClass`; `partsText, pullText, runeNames, useDelveStore` becomes `pullText, useDelveStore` (keep `unsocketMode` for `melts`; the draft guard is the store's); add `import { frameText, slotPairs, slotsText } from '../../items/weapon-frame';` and `type FormId` to the engine types.

2. Replace `transferOnto` and `TransferNotes` with:

```tsx
/** "a bow can't express Strike": the class that can't, and the first dormant construct's form. */
function dormantReason(registry: ReturnType<typeof getDelveRegistry>, item: GearItem, form: FormId): string {
  const cls = weaponClass(registry, item.baseId);
  return `a ${registry.getGearBase(item.baseId).name.toLowerCase()} can't express ${registry.getForm(form).name}`;
}

/**
 * Move every construct of the worn weapon onto the bag weapon `item` (the store's `moveAll`), with
 * its sound and its toast, or say why not. True when they moved.
 */
export function moveAllOnto(item: GearItem): boolean {
  const registry = getDelveRegistry();
  const s = useDelveStore.getState();
  const worn = s.profile.equipped.weapon;
  const preview = worn ? moveAllPreview(registry, worn, item) : null;
  const res = s.moveAll(item.uid);
  if (!res.ok) {
    playSound('combineFail');
    showToast(res.reason ?? 'Cannot move them');
    return false;
  }
  playSound('combineMerge');
  vibrate('success');
  const bag = preview && preview.toBag.length > 0 ? ` · ${preview.toBag.length} to your bag` : '';
  const dormant = preview && preview.dormant.length > 0 ? ` · ${preview.dormant.length} dormant` : '';
  showToast(`Your constructs moved onto ${item.name}${bag}${dormant}`);
  return true;
}

/**
 * What Move all onto `item` leaves (spec §3.3): the constructs past its slots and its own, which
 * go to your bag, and those its class can't express, which sleep in their slots. The compare
 * pane's Move all and the pad's take sheet both show it.
 */
export function MoveAllNotes({ worn, item }: { worn: GearItem; item: GearItem }): ReactElement {
  const registry = getDelveRegistry();
  const preview = moveAllPreview(registry, worn, item);
  const moves = movesetOf(registry, worn).chains;
  const first = preview.dormant[0];
  const form = first
    ? CHAIN_SKILLS.flatMap((s) => movesOf(moves[s])).find((m) => m.uid === first)
    : undefined;
  return (
    <>
      {preview.toBag.length > 0 && (
        <span className="text-[18px] text-[var(--k-text-2)]" data-testid="move-all-bag">
          {preview.toBag.length} to your bag: no slot for {preview.toBag.length === 1 ? 'it' : 'them'} there
        </span>
      )}
      {preview.dormant.length > 0 && form && 'form' in form && (
        <span className="text-[18px] text-[var(--k-hot)]" data-testid="move-all-dormant">
          {preview.dormant.length} dormant: {dormantReason(registry, item, form.form)}
        </span>
      )}
    </>
  );
}
```

Add `CHAIN_SKILLS, movesOf, movesetOf` to the engine import. Drop the unused `cls` line in `dormantReason` if `noUnusedLocals` complains (it reads the base's name alone).

3. In `ComparePane`: delete `const transfer = …` and `homeUpgrade`; add

```ts
  const twoWays = inBag && item.slot === 'weapon' && !!worn && !!asIs;
  const homeUpgrade = twoWays && !!cmp && cmp.powerPct > UPGRADE_EPSILON;
  const onMoveAll = () => moveAllOnto(item);
```

and delete `const onTransfer = …`.

4. Under the header's tile (`<ItemHeader item={item} size="lg" />`'s wrapper), add the frame line for a weapon:

```tsx
        {item.slot === 'weapon' && (
          <p className="k-body-2 m-0" data-testid="weapon-frame">
            {frameText(registry, item)} · {slotsText(slotPairs(registry, item))}
          </p>
        )}
```

5. In the comparison block, `{asIs && transfer ? (` becomes `{twoWays ? (`, and the "With your moveset · … to move it" label becomes:

```tsx
                <span className="k-label">After Move all</span>
```

6. In the actions, the Transfer block becomes:

```tsx
        {twoWays && !locked && (
          <div className="flex flex-col gap-1.5">
            <Button
              variant={homeUpgrade ? 'go' : 'secondary'}
              onClick={onMoveAll}
              className="flex-wrap whitespace-normal"
              data-tutorial="loadout.transfer"
              testId="move-all-button"
            >
              {homeUpgrade ? '▲ ' : ''}Move all here
            </Button>
            {worn && <MoveAllNotes worn={worn} item={item} />}
          </div>
        )}
```

(The tutorial target keeps its id `loadout.transfer` until D1 renames it; see Needs routed.)

7. Update the component's doc comment: "…a weapon's **Move all** (free: every construct onto it, what doesn't fit to your bag)…" and the pane's `Transfer` mention in `LoadoutActions`' comment if any.

In `LoadoutTab.tsx`'s `actions.equip`, the store's refusal (Task 2: the draft guard lives there, one place) keeps the sound quiet: `s.equip(uid);` becomes `if (!s.equip(uid)) return;` (the notice reaches the page through `useDelveNotices`). Its doc comment gains "any Equip waits on the Skills draft (the store refuses)". `BindChoice.tsx`'s Bind-then-equip path (line 62) calls the same store action but plays `orbPlace` unconditionally: make it `if (!store.equip(item.uid)) return;` too, so a refused equip stays quiet (the bind itself still commits).

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx --reporter=dot`
Expected: tsc still names `TakeSheet.tsx` (Task 4); ComparePane PASS. If `LoadoutTab.test.tsx` asserts the transfer prompt's label ("Equip or transfer"), change it to "Equip or move all" there and in `LoadoutTab.tsx`'s prompt (line 155 today).

- [ ] **Step 5: Commit** (with Task 2's store)

```bash
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/hub/loadout/ComparePane.tsx packages/client/src/features/delve/hub/loadout/LoadoutTab.tsx packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx packages/client/src/features/delve/hub/loadout/__tests__/LoadoutTab.test.tsx
git commit -m "feat(client): the Loadout shows a weapon as a frame and moves all constructs onto it; the store's moveAll, salvageConstruct and openSkill

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `TakeSheet`: Equip as it is, or Move all here

**Files:**
- Modify: `hub/loadout/TakeSheet.tsx`
- Test: `hub/loadout/__tests__/TakeSheet.test.tsx`

- [ ] **Step 1: Rewrite the tests**

Replace the first two tests with:

```tsx
  it('offers Equip as it is and Move all here with their Power; Move all carries the guided-start target', () => {
    render(<TakeSheet uid="w1" onClose={vi.fn()} />);
    expect(screen.getByTestId('take-equip')).toHaveTextContent(/Equip as it is · [+−±]\d/);
    expect(screen.getByTestId('take-move-all')).toHaveTextContent(/^Move all here · [+−±]\d.* Power$/);
    expect(screen.getByTestId('take-move-all')).toHaveAttribute('data-tutorial', 'loadout.transfer');
  });

  // D2 un-skips: B2's moveAll.
  it.skip('Move all moves your constructs onto it and wears it; each closes the sheet', () => {
    const onClose = vi.fn();
    const before = movesetOf(registry, store().profile.equipped.weapon!).chains.primary!;
    render(<TakeSheet uid="w1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('take-move-all'));
    expect(store().profile.equipped.weapon?.uid).toBe('w1');
    expect(movesetOf(registry, store().profile.equipped.weapon!).chains.primary!.moves.map((m) => m.uid)).toEqual(
      before.moves.map((m) => m.uid),
    );
    expect(onClose).toHaveBeenCalled();
  });
```

Add `movesetOf` to the engine import. The `rareSword` fixture keeps `defaultMoveset(registry, w, 'fire', slots)` (as Task 3's note).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/TakeSheet.test.tsx --reporter=dot`
Expected: FAIL (compile).

- [ ] **Step 3: Implement**

In `TakeSheet.tsx`: the engine import loses `movesetTransfer`; `Price` leaves the kit import; `import { MoveAllNotes, moveAllOnto } from './ComparePane';`. Delete `const transfer = …`. The `equip` handler becomes (the store refuses under a pending draft, Task 2):

```ts
  const equip = () => {
    if (!useDelveStore.getState().equip(uid)) return;
    playSound('orbPlace');
    vibrate('medium');
    onClose();
  };
  const move = () => {
    if (moveAllOnto(item)) onClose();
  };
```

The second button becomes:

```tsx
        <Button
          variant={homeFirst ? 'go' : 'secondary'}
          className="flex-wrap whitespace-normal"
          onClick={move}
          data-pad-first={homeFirst ? '' : undefined}
          data-tutorial="loadout.transfer"
          testId="take-move-all"
        >
          Move all here · {formatDelta(cmp.powerPct)} Power
        </Button>
        <MoveAllNotes worn={worn} item={item} />
```

Doc comment: "…Equip as it is, or Move all here (free; what a Move all leaves)…".

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/loadout/__tests__/TakeSheet.test.tsx --reporter=dot`
Expected: tsc names only `Temper.tsx` now; TakeSheet PASS (3 run, 1 skipped).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/loadout/TakeSheet.tsx packages/client/src/features/delve/hub/loadout/__tests__/TakeSheet.test.tsx
git commit -m "feat(client): the take sheet offers Equip as it is or Move all here

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `EquippedPane`'s moveset box reads the slot table

**Files:**
- Modify: `hub/loadout/EquippedPane.tsx`
- Test: `hub/loadout/__tests__/EquippedPane.test.tsx`

- [ ] **Step 1: Rewrite the test**

Replace `"counts the weapon's slots of each skill's cap, and opens Skills"` with:

```tsx
  it("counts the weapon's slots of each skill's ceiling, a skill it can't hold as —, and opens Skills", () => {
    const props = open();
    const box = screen.getByTestId('loadout-moveset');
    expect(box).toHaveTextContent(`Moveset · ${store().profile.equipped.weapon!.name}`);
    // A new save's common sword: the Basic's string, two Primary constructs, a Defensive to open.
    expect(screen.getByTestId('loadout-moveset-basic')).toHaveTextContent('Basic 3 / 3');
    expect(screen.getByTestId('loadout-moveset-primary')).toHaveTextContent('Primary 2 / 3');
    expect(screen.getByTestId('loadout-moveset-defensive')).toHaveTextContent('Defensive 0 / 1');
    expect(screen.getByTestId('loadout-moveset-ultimate')).toHaveTextContent('Ultimate —');
    fireEvent.click(within(box).getByRole('button', { name: 'Skills ›' }));
    expect(props.go).toHaveBeenCalledWith({ tab: 'skills' });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx --reporter=dot`
Expected: FAIL ("Primary 1/5").

- [ ] **Step 3: Implement**

In `EquippedPane.tsx`: drop `carriedSkills` and `movesetOf` from the engine import and `CHAIN_SKILLS` if nothing else reads it; `import { slotPairs, slotsText, type SlotPair } from '../../items/weapon-frame';`. Replace

```ts
  const cap = registry.getDelveBalance().chains.cap;
  const slots = weapon ? movesetOf(registry, weapon).slots : null;
  const carried = weapon ? carriedSkills(registry, weapon) : [];
```

with

```ts
  const pairs = weapon ? slotPairs(registry, weapon) : null;
```

and the box's grid (`{weapon && slots && (` … `)}`) with:

```tsx
      {weapon && pairs && (
        <div className="k-well mt-auto flex flex-col gap-1 p-3" data-testid="loadout-moveset">
          <div className="flex items-baseline justify-between gap-3">
            <span className="k-disp truncate text-[18px]">Moveset · {weapon.name}</span>
            <button
              type="button"
              className="k-caption -my-1.5 inline-flex min-h-8 items-center"
              onClick={() => go({ tab: 'skills' })}
              data-pad-skip
            >
              Skills ›
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 whitespace-nowrap text-[16px] text-[var(--k-text-2)]">
            {pairs.map((pair: SlotPair) => (
              <span key={pair[0]} data-testid={`loadout-moveset-${pair[0]}`}>
                {slotsText([pair])}
              </span>
            ))}
          </div>
        </div>
      )}
```

Doc comment: "…the weapon's moveset (slots held of each skill's ceiling)…".

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/loadout/EquippedPane.tsx packages/client/src/features/delve/hub/loadout/__tests__/EquippedPane.test.tsx
git commit -m "feat(client): the paper doll's moveset box reads slots against the ceiling

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 2: the Forge, the item header, the moveset view, the legendary box and the stop

### Task 6: Temper's Awaken becomes Open a skill

One row per skill the weapon holds at 0 slots with a ceiling of 1 or more (the shipped table gives at most one a rarity: a common's Defensive, an uncommon's and a magic's Ultimate); with none, one row saying why. The engine's `openSkill` dry run enables it, `openSkillPrice` prices it.

**Files:**
- Modify: `hub/forge/Temper.tsx`
- Test: `hub/forge/__tests__/Temper.test.tsx`

- [ ] **Step 1: Rewrite the tests**

In `Temper.test.tsx`: the mock becomes

```ts
// Open a skill's price and dry run: each test says what they give.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  openSkill: vi.fn(),
  openSkillPrice: vi.fn(),
}));
```

with `openSkill, openSkillPrice` in place of `awaken, awakenPrice` in the import and the `beforeEach` resets. In the "lists the six operations" test, `'temper-op-awaken'` becomes `'temper-open-skill'`, `why('awaken')` → the row's description `'Only a weapon holds skills'` (that test's item is a helm), and a `const PRICE = { flux: { uncommon: 2 }, links: 1, scrap: 40 };` with `vi.mocked(openSkillPrice).mockReturnValue(PRICE)` in `beforeEach`. Replace the two Awaken tests with:

```tsx
  it("opens a skill at 0 slots at the engine's price, as its dry run allows, and says why not", () => {
    // The engine's rule stands in: 40 scrap opens the common sword's Defensive.
    vi.mocked(openSkill).mockImplementation((_registry, p, uid, skill) =>
      p.scrap >= 40
        ? {
            ok: true,
            profile: {
              ...p,
              scrap: p.scrap - 40,
              bag: p.bag.map((i) =>
                i.uid === uid
                  ? { ...i, moveset: { ...i.moveset!, slots: { ...i.moveset!.slots, [skill]: 1 } } }
                  : i,
              ),
            },
          }
        : { ok: false, profile: p, reason: 'Not enough scrap' },
    );
    bench(sword('common'), { scrap: 40 });
    expect(openSkillPrice).toHaveBeenCalledWith(registry, expect.objectContaining({ uid: 'w1' }));
    const button = screen.getByTestId('temper-open-skill');
    expect(button).toHaveTextContent('Open Defensive');
    expect(button).toHaveTextContent('2 Uncommon flux · 1 Link · 40 scrap');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(openSkill).toHaveBeenLastCalledWith(
      registry,
      expect.objectContaining({ scrap: 40 }),
      'w1',
      'defensive',
    );
    expect(store().profile.scrap).toBe(0);
    expect(screen.getByRole('status')).toHaveTextContent('Defensive opened!');
    // Opened: the weapon holds every skill it can; the row says so.
    expect(screen.getByTestId('temper-open-skill')).toBeDisabled();
    expect(screen.getByTestId('temper-open-skill')).toHaveAccessibleDescription(
      'Every skill this weapon can hold is open',
    );
  });

  it("Open a skill is enabled only as the dry run allows; a weapon with nothing to open says so", () => {
    vi.mocked(openSkill).mockReturnValue({ ok: false, profile: store().profile, reason: 'Needs 2 Uncommon flux' });
    bench(sword('common'));
    expect(screen.getByTestId('temper-open-skill')).toBeDisabled();
    expect(screen.getByTestId('temper-open-skill')).toHaveAccessibleDescription('Needs 2 Uncommon flux');
    cleanup();
    // A rare sword starts with every skill it can hold.
    bench(sword('rare'));
    expect(screen.getByTestId('temper-open-skill')).toBeDisabled();
    expect(screen.getByTestId('temper-open-skill')).toHaveAccessibleDescription(
      'Every skill this weapon can hold is open',
    );
  });
```

Add `cleanup` to the testing-library import. The mocked `openSkill`'s result shape follows `ProfileActionResult` (`{ ok, profile, reason? }`).

`'upgrades the item for scrap, priced against the purse'` is unchanged: `upgradeGear` raises the item's upgrade level, never its rarity (A's deviation 3; the spec's "Upgrade shows the new ceiling" had assumed a rarity rise), so the Upgrade row has no ceilings to show.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/Temper.test.tsx --reporter=dot`
Expected: FAIL (compile: `awaken` gone; no `temper-open-skill`).

- [ ] **Step 3: Implement**

In `Temper.tsx`:

1. Imports: `awaken, awakenPrice` → `openSkill, openSkillPrice, slotRange, movesetOf, ABILITY_SLOTS` (if the engine exports no `ABILITY_SLOTS`, use `CHAIN_SKILLS.filter((s) => s !== 'basic')`), plus `type AbilitySlot, type FluxGrade`. `Op` gains `testId?: string`.

2. Replace the Awaken block (from `// Awaken, on a rare weapon…` to the `awakenTry` memo) with:

```ts
  // Open a skill (spec §3.2): each ability skill the weapon holds at 0 slots with a ceiling, and
  // the engine's dry run for each. An item that isn't a weapon, or holds all it can, gets one row.
  const openable: AbilitySlot[] =
    item.slot === 'weapon'
      ? ABILITY_SLOTS.filter(
          (s) => (movesetOf(registry, item).slots[s] ?? 0) === 0 && slotRange(registry, item, s)[1] > 0,
        )
      : [];
  const openCost = item.slot === 'weapon' ? openSkillPrice(registry, item) : null;
  const openTries = useMemo(
    () => new Map(openable.map((s) => [s, openSkill(registry, profile, item.uid, s)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openable.join(), registry, profile, item.uid],
  );
```

3. Replace `onAwaken` with:

```ts
  const onOpenSkill = (skill: AbilitySlot) => {
    const res = store().openSkill(item.uid, skill);
    if (res.ok) playSound('upgradeTier');
    done(res.ok, `${SKILL_NAME[skill]} opened!`, res.reason, 'Cannot open it');
  };
```

importing `SKILL_NAME` from `'../../chains/chain-text'`.

4. Replace the `awaken` Op with:

```ts
    ...(openable.length > 0
      ? openable.map(
          (s, i): Op => ({
            id: `open-${s}`,
            testId: i === 0 ? 'temper-open-skill' : `temper-open-skill-${s}`,
            label: `Open ${SKILL_NAME[s]}`,
            price: openCost && <OpenPrice price={openCost} />,
            why: openTries.get(s)?.ok ? null : (openTries.get(s)?.reason ?? 'Cannot open it'),
            run: () => onOpenSkill(s),
          }),
        )
      : [
          {
            id: 'open-skill',
            testId: 'temper-open-skill',
            label: 'Open a skill',
            price: null,
            why:
              item.slot === 'weapon' ? 'Every skill this weapon can hold is open' : 'Only a weapon holds skills',
            run: () => {},
          },
        ]),
```

and above the component:

```tsx
/** "2 Uncommon flux · 1 Link · 40 scrap": Open a skill's price (`openSkillPrice`). */
function OpenPrice({ price }: { price: ReturnType<typeof openSkillPrice> }) {
  const registry = getDelveRegistry();
  const flux = (Object.entries(price.flux) as [FluxGrade, number][]).filter(([, n]) => n > 0);
  return (
    <>
      {flux.map(([grade, n]) => `${n} ${materialLabel(registry, { kind: 'flux', grade })}`).join(' · ')}
      {flux.length > 0 && ' · '}
      <Price links={price.links} scrap={price.scrap} />
    </>
  );
}
```

(`materialLabel(registry, { kind: 'flux', grade: 'uncommon' })` reads "Uncommon flux" today, as Awaken's row showed "Epic flux"; if it reads otherwise, the test's literal follows it.)

5. The row's button: `testId={o.testId ?? \`temper-op-${o.id}\`}`.

6. The Upgrade row is unchanged: `upgradeGear` raises the upgrade level, never the rarity (A's deviation 3), so there are no new ceilings to show; `Op.label` stays a string.

6. In the detail panel delete the `item.awakened` note. Update the doc comment: "…Re-attune to the pair's other element, Open a skill the weapon holds none of (its first slot, for flux, Links and scrap)…".

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/forge/__tests__/Temper.test.tsx src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx --reporter=dot`
Expected: tsc clean (the last compile error from Task 2 is gone); PASS. If `ForgeTab.test.tsx` names `temper-op-awaken`, rename it there.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/forge/Temper.tsx packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx packages/client/src/features/delve/hub/forge/__tests__/ForgeTab.test.tsx
git commit -m "feat(client): Temper opens a skill where it awakened a rare

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: the forge preview says the starting slots and ceilings

**Files:**
- Modify: `hub/forge/ForgeBench.tsx` (the `extras` lines and the `forge-weapon` note)
- Test: `hub/forge/__tests__/ForgeBench.test.tsx` (the `forge-weapon` expectations, today's lines 224–226)

- [ ] **Step 1: Rewrite the test lines**

Replace

```ts
    // A common weapon carries the basic chain alone.
    expect(screen.getByTestId('forge-weapon')).toHaveTextContent('Carries Basic');
    expect(screen.getByTestId('forge-weapon')).not.toHaveTextContent('Primary');
```

with

```ts
    // A common sword: its class, and each skill's starting slots against the ceiling.
    expect(screen.getByTestId('forge-weapon')).toHaveTextContent('Melee · Basic 3 / 3 · Primary 2 / 3 · Defensive 0 / 1 · Ultimate —');
```

and wherever else the file reads `Carries ` or `extra slots:` (grep), the same shape from `prev.weapon.slots`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx --reporter=dot`
Expected: FAIL (compile on `preview.weapon.carries`, or the text).

- [ ] **Step 3: Implement**

In `ForgeBench.tsx`: delete the `extras` block (today's lines 256–260); `import { classText, slotsText, type SlotPair } from '../../items/weapon-frame';` (the annotation keeps the tuple from widening to `(string | number)[]`) and `CHAIN_SKILLS` from the engine if not imported. The note becomes:

```tsx
              {preview.weapon && (
                <p className="k-note" data-testid="forge-weapon">
                  {classText(preview.weapon.class)} ·{' '}
                  {slotsText(CHAIN_SKILLS.map((s): SlotPair => [s, ...preview.weapon!.slots[s]]))}
                  {preview.weapon.sockets > 0 &&
                    ` · ${preview.weapon.sockets} open socket${preview.weapon.sockets === 1 ? '' : 's'}`}
                </p>
              )}
```

Drop `SKILL_NAME` from the imports if the extras were its last reader. The doc comment's "a weapon's skills, slots and sockets" becomes "a weapon's class, its slots against the ceiling and its sockets".

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/forge/ForgeBench.tsx packages/client/src/features/delve/hub/forge/__tests__/ForgeBench.test.tsx
git commit -m "feat(client): the forge preview says a weapon's class and its slots against the ceiling

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: the item header names the class and style

`CastStyle` carries no trait text in A's contract (B1 fills the traits as knobs), so the header shows "Melee · Balanced"; the spec's "Marksman: pierces one foe" wording waits on a `text` field (see Open questions).

**Files:**
- Modify: `items/ItemHeader.tsx`
- Test: `items/__tests__/ItemHeader.test.tsx`

- [ ] **Step 1: Rewrite the test lines**

In the first test, replace the two `item-attack` lines with:

```ts
    expect(screen.getByTestId('item-attack')).toHaveTextContent(/^Ranged · Marksman$/);
    expect(screen.getByTestId('item-attack').querySelector('[data-glyph="bolt"]')).not.toBeNull();
```

and in the second with `/^Melee · Balanced$/` and `[data-glyph="attack"]`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/items/__tests__/ItemHeader.test.tsx --reporter=dot`
Expected: FAIL ("Ranged").

- [ ] **Step 3: Implement**

In `ItemHeader.tsx`: `import { weaponClass } from '@alloy/engine'` (beside the others) and `import { frameText } from './weapon-frame';`. Replace `const attack = base?.attack;` with `const cls = item.slot === 'weapon' ? weaponClass(registry, item.baseId) : null;` and the `{attack && (…)}` tag with:

```tsx
          {cls && (
            <span
              className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5"
              data-testid="item-attack"
            >
              <Glyph id={cls === 'ranged' ? 'bolt' : 'attack'} size={14} />
              {frameText(registry, item)}
            </span>
          )}
```

Doc comment: "…its class and cast style ("Melee · Balanced"), a weapon's tempo…". If `base` has no other reader than `tempo`, keep it for that.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/items/__tests__/ItemHeader.test.tsx src/features/delve/items/__tests__/ItemTooltip.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/items/ItemHeader.tsx packages/client/src/features/delve/items/__tests__/ItemHeader.test.tsx
git commit -m "feat(client): the item header names a weapon's class and cast style

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `MovesetView` lists slots, ceilings and dormant constructs

**Files:**
- Modify: `items/MovesetView.tsx`
- Test: `items/__tests__/MovesetView.test.tsx`

- [ ] **Step 1: Rewrite the tests**

```tsx
  it("lists each chain with its slots against the ceiling and its constructs, and a skill it can't hold", () => {
    render(<MovesetView item={store().profile.equipped.weapon!} />);
    expect(screen.getByTestId('item-moveset')).toHaveTextContent(/^Moveset/);
    expect(screen.getByTestId('moveset-basic')).toHaveTextContent(
      'Basic 3 / 3 · light Fire blow · light Fire blow · heavy Fire blow',
    );
    // A new save's common sword: two Primary constructs (the melee default, Strike).
    expect(screen.getByTestId('moveset-primary')).toHaveTextContent(/^Primary 2 \/ 3 · .*Strike/);
    expect(screen.getByTestId('moveset-defensive')).toHaveTextContent(
      'Defensive 0 / 1 · open it on the Temper bench',
    );
    expect(screen.getByTestId('moveset-ultimate')).toHaveTextContent('Ultimate — · not on a common weapon');
    expect(screen.getByTestId('item-sockets')).toHaveTextContent(`Sockets · up to ${MAX_SOCKETS} a move`);
    expect(screen.getByTestId('item-moveset').outerHTML).not.toMatch(/text-(\[(\d|1[0-3])px\]|xs\b)/);
  });

  it("marks a construct the weapon's class can't express dormant", () => {
    const bow = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'bow', mana: 'fire' },
      new SeededRNG(4),
    );
    // The sword's Strike constructs on a bow: dormant there.
    const sword = store().profile.equipped.weapon!;
    const item = { ...bow, moveset: { ...movesetOf(registry, bow), chains: { ...movesetOf(registry, bow).chains, primary: movesetOf(registry, sword).chains.primary! } } };
    render(<MovesetView item={item} />);
    const row = screen.getByTestId('moveset-primary');
    expect(row).toHaveTextContent(/Strike \(dormant\)/);
    expect(row.querySelector('[data-dormant]')).not.toBeNull();
  });
```

Add `MAX_SOCKETS`, `movesetOf` to the engine import.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/items/__tests__/MovesetView.test.tsx --reporter=dot`
Expected: FAIL (compile: `carriedByText`, `carriedSkills`, `socketCap` gone).

- [ ] **Step 3: Implement**

Replace `items/MovesetView.tsx`:

```tsx
import { useMemo, type ReactElement } from 'react';
import {
  CHAIN_SKILLS,
  MAX_SOCKETS,
  dormantUids,
  movesOf,
  movesetOf,
  profileStats,
  resolveChain,
  slotRange,
  type AbilitySlot,
  type Blow,
  type GearItem,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { SKILL_NAME, blowText, moveText } from '../chains/chain-text';
import { RARITY_LABEL } from '../format';
import { ItemSockets } from '../runes/ItemSockets';
import { slotsText } from './weapon-frame';

/**
 * A weapon's moveset (the constructs spec §3): each skill's slots against its ceiling
 * ("Primary 2 / 3") and the constructs in them, named as the chain builder names them ("medium
 * Wildfire Burst"), a dormant one (its form of the other class) marked; a skill at 0 slots says
 * where it opens, one the rarity never holds says so.
 */
export function MovesetView({ item }: { item: GearItem }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  // Only the moves' names are read: the hero's stats resolve them as well as any.
  const stats = useMemo(() => profileStats(registry, profile), [registry, profile]);
  const { chains, slots } = movesetOf(registry, item);
  const dormant = dormantUids(registry, item);
  return (
    <div
      className="delve-panel mt-3 flex flex-col gap-1 px-3 py-2 text-[16px]"
      data-testid="item-moveset"
    >
      <div className="k-label">Moveset</div>
      {CHAIN_SKILLS.map((s) => {
        const held = slots[s] ?? 0;
        const ceiling = slotRange(registry, item, s)[1];
        const head = slotsText([[s, held, ceiling]]);
        const chain = chains[s];
        if (held === 0 || !chain)
          return (
            <div key={s} className="text-stone-500" data-testid={`moveset-${s}`}>
              {head} ·{' '}
              {ceiling === 0
                ? `not on ${/^[aeiou]/i.test(RARITY_LABEL[item.rarity]) ? 'an' : 'a'} ${RARITY_LABEL[item.rarity].toLowerCase()} weapon`
                : 'open it on the Temper bench'}
            </div>
          );
        const names = Array.isArray(chain)
          ? chain.map((b: Blow) => blowText(registry, b))
          : resolveChain(registry, stats, s as AbilitySlot, chain).moves.map(moveText);
        return (
          <div key={s} className="text-stone-300" data-testid={`moveset-${s}`}>
            <b className="text-stone-100">{head}</b>
            {movesOf(chain).map((m, i) => {
              const sleeps = !!m.uid && dormant.has(m.uid);
              return (
                <span key={m.uid ?? i} data-dormant={sleeps || undefined} className={sleeps ? 'text-stone-500' : undefined}>
                  {' · '}
                  {names[i]}
                  {sleeps && ' (dormant)'}
                </span>
              );
            })}
            {movesOf(chain).length === 0 && ' · empty'}
          </div>
        );
      })}
      <ItemSockets chains={chains} cap={MAX_SOCKETS} />
    </div>
  );
}
```

(`RARITY_LABEL` lives in `../format`; if `resolveChain` throws on a dormant form, name the move from its form instead: `registry.getForm(m.form).name` with its kind, through `moveText({ kind, name })`.)

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/items/__tests__/MovesetView.test.tsx src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/items/MovesetView.tsx packages/client/src/features/delve/items/__tests__/MovesetView.test.tsx
git commit -m "feat(client): a weapon's moveset lists slots against the ceiling and marks dormant constructs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `LegendaryBox` reads the chain the weapon plays

**Files:**
- Modify: `items/LegendaryBox.tsx`
- Test: `hub/loadout/__tests__/ComparePane.test.tsx` (`'a legendary whose power rides a skill the weapon lacks says it needs it'`)

- [ ] **Step 1: Update the test**

Its expectation on `legendary-dead` becomes `"Needs a Defensive: your weapon has no Defensive chain."` (the test's worn weapon is a new save's common sword, whose Defensive is at 0 slots).

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx -t "legendary whose power" --reporter=dot`
Expected: FAIL (compile: `carriedSkills`).

- [ ] **Step 3: Implement**

In `LegendaryBox.tsx`: `carriedSkills` → `heroChains` in the import; read `const pair = useDelveStore((s) => s.profile.pair);` and `const equipped = useDelveStore((s) => s.profile.equipped);` in place of `weapon`; then

```ts
  // The chain as it plays (`heroChains`: a chain of dormant constructs alone is dropped too).
  const dead = !!needs && !heroChains(registry, equipped, pair)[needs];
```

and the note reads `{NEEDS_TEXT[needs]}: your weapon has no {SKILL_NAME[needs]} chain.` (`SKILL_NAME` from `'../chains/chain-text'`). Doc comment: "…the skill it rides when the equipped weapon plays no chain of it."

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/items/LegendaryBox.tsx packages/client/src/features/delve/hub/loadout/__tests__/ComparePane.test.tsx
git commit -m "feat(client): the legendary box reads whether the weapon plays the skill its power rides

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: the stop's power-ups in the new model

The slot pick offers each skill the weapon holds slots of, against its ceiling (a skill at 0 slots can't open at a stop: it isn't listed); the move pick's absent text and the rune pick's cap read the model.

**Files:**
- Modify: `features/delve/StopPanel.tsx`
- Test: `features/delve/__tests__/StopPanel.test.tsx`

- [ ] **Step 1: Rewrite the test lines**

In `"adds a slot to a chain at its price; one it can't pay for is off"`: the armed (uncommon) sword holds two Primary slots of three; replace

```ts
    expect(screen.getByTestId('stop-slot-primary')).toHaveTextContent(
      'Primary 1/5 · + a slot · 1 Link · 20 scrap',
    );
```

with `'Primary 2 / 3 · + a slot · '` followed by the engine's price (`slotPrice(registry, weapon, 'primary')`: read it, don't guess). Add a test that the pickers show a dormant construct: wear a bow holding the sword's Strike constructs on its Primary (the fixture of Task 9's second test), open the `move` card and expect `screen.getByTestId('abilities-summary')` (or the Primary's card) to name Strike, and open the `rune` card on a Strike construct with an open socket and expect its row `stop-rune-move-primary-0` present (B2's refusals aside: the dry run may say why, the row still shows). Then `expect(screen.queryByTestId('stop-slot-ultimate')).toBeNull(); // 0 slots: opens at the Anvil` in place of the `defensive` line (an uncommon holds one Defensive slot, so its row shows). After the click, `chains().primary.moves` has 3. In `"adjusts one move…"`, the fixture's `slots: { ...moveset.slots, primary: 2 }` is already the start on an uncommon: make it `primary: 3` so a slot stays empty, and the Bolt expectations (`form-lance`, `'light Fire Lance'`) hold on a melee sword since Lance is shared; `expect(chains().basic[0].kind).toBe('light')` stays. Replace `socketCap` reads, if the file asserts "up to 1 a move", with `MAX_SOCKETS`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx --reporter=dot`
Expected: FAIL (compile: `carriedByText`, `socketCap`).

- [ ] **Step 3: Implement**

In `StopPanel.tsx`:

1. Imports: `carriedByText`, `socketCap` → `MAX_SOCKETS`, `slotRange`; `import { slotsText } from './items/weapon-frame';`.
2. `SlotPick`: delete `const cap = …`; the filter becomes `.filter((s) => (slots[s] ?? 0) > 0)` and the label `{slotsText([[s, slots[s]!, slotRange(registry, weapon, s)[1]]])}`.
3. `MovePick`: `absentText={(s) => \`No ${SKILL_NAME[s]} slot on this weapon: open it at the Anvil\`}`.
4. `RunePick`: `cap={MAX_SOCKETS}`.
5. `STOP_TEXT.slot.text`: 'One more slot on a chain, up to its ceiling.'
6. `MovePick`'s `saved` memo (today's line 380) and `RunePick`'s `chains` memo (line 512) read every construct, dormant ones too: `heroChains(registry, equipped, pair)` drops a dormant construct, which would offset the pick's index against the saved chain and make `editPrice` (by uid) price it as removed plus new. Both become

```ts
  const saved = useMemo(() => (weapon ? movesetOf(registry, weapon).chains : {}), [registry, weapon]);
```

(`RunePick`'s under its name `chains`; `heroChains` leaves the import if nothing else reads it). A dormant move then shows in the stop's editor greyed, as at the Anvil, not hidden: the greying is C1's `ChainEditor` reading the weapon's class (see Needs routed); `MovePick` hands it the weapon the way C1 settles on.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx src/features/delve/__tests__/FloorDialogs.test.tsx --reporter=dot`
Expected: PASS. (`FloorDialogs.test.tsx` renders the alcove's `StopPanel`.)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/__tests__/StopPanel.test.tsx
git commit -m "feat(client): the stop's power-ups read the slot table and the construct socket cap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 3: the arena's look, the HUD, the Training Grounds and Help

### Task 12: glyphs for Whirl, Repel and Onslaught

`GlyphId` includes every `FormId`, so the HUD's `SkillSlot` (`<Glyph id={ab.form} />`) and C1's form picker need art for the three new forms. 7×7 pixel rows, as the other forms'.

**Files:**
- Modify: `kit/glyph-art.ts` (the `// ── forms ──` block; replace A's placeholder rows if it left any)
- Test: `kit/__tests__/glyphs.test.tsx` (if the kit has one that walks `GLYPH_ART`; else `items/__tests__/weapon-frame.test.ts` gains the check below)

- [ ] **Step 1: Write the failing test**

```tsx
  it('has art for every form, the new three too, 7 px wide at least', () => {
    for (const id of ['whirl', 'repel', 'onslaught'] as const) {
      const art = GLYPH_ART[id];
      expect(art.rows.length).toBeGreaterThanOrEqual(7);
      expect(art.rows.join('')).toMatch(/#/);
      expect(new Set(art.rows.map((r) => r.length)).size).toBe(1);
    }
  });
```

(`GLYPH_ART` from `'../glyph-art'` or `'../../kit/glyph-art'`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/kit --reporter=dot`
Expected: FAIL (no rows, or a placeholder with no `#`). If A drew real art already, the test passes: keep it and skip to Step 5 with the test alone.

- [ ] **Step 3: Implement**

After `maelstrom`'s row in `GLYPH_ART`:

```ts
  // A spin: a ring with a break and a trailing edge (the hero turning).
  whirl: {
    rows: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..#.#..'],
  },
  // A pulse pushing out: a centre and two arcs flung outward.
  repel: {
    rows: ['#..#..#', '.#...#.', '..###..', '#.#.#.#', '..###..', '.#...#.', '#..#..#'],
  },
  // Darts between foes: three strikes joined by a zigzag.
  onslaught: {
    rows: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/kit src/features/delve/arena/hud/__tests__/SkillDock.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/kit/glyph-art.ts packages/client/src/features/delve/kit/__tests__
git commit -m "feat(client): glyphs for Whirl, Repel and Onslaught

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: the look motif, one per weapon

Spec §4.2: a look is client-only, one motif per weapon (blade, crescent, hatchet, stone, orb, spark, arrow) drawn on its casts' carriers as the infusion motifs are: mana pixels on the sprites' grid, hashed from a seed and the clock (no `Math.random`), within the per-frame infusion budget, drawn last in the whole pass: the renderer runs `this.fx.draw` (the transient carriers) and then `drawInfusions` (the persistent ones: the aura, projectiles, lobs, zones) on one budget, so the looks get their own call, `ManaFx.drawLooks`, after `drawInfusions`. The vocabulary of `fx/mana-pixels.ts` only (`px`, `manaLine`, `manaArc`, `hash`, `PX`).

Carriers: a `cast` rings the hand (a ring), a `beam` and a `dash` are a path, a `slash` the path of its arc, an `explode` a ring of its radius. A `hit`'s look is left out (its budget is the hit moments'; see Open questions).

**Files:**
- Create: `arena/fx/looks.ts`
- Modify: `arena/fx/mana-fx.ts` (`look()`, the `looks` list aged in `draw()`, `drawLooks()`; export `arcPoints`)
- Modify: `arena/ArenaRenderer.ts` (the `cast`, `beam`, `slash`, `explode` and `dash` cases; `drawLooks` after `drawInfusions`)
- Tests: `arena/fx/__tests__/looks.test.ts` (new), `arena/fx/__tests__/mana-fx.test.ts`, `__tests__/arena-renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

`arena/fx/__tests__/looks.test.ts` (the recorder is `infusion.test.ts`'s; copy it, or export it from there into a `__tests__/recorder.ts` both read):

```ts
import { describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import { LOOKS, drawLook, lookCount } from '../looks';
import type { InfusionBudget, InfusionShape } from '../infusion';

interface Rect { x: number; y: number; w: number; h: number; color: number; alpha: number }
function recorder() {
  const rects: Rect[] = [];
  let at = { x: 0, y: 0, w: 0, h: 0 };
  const g = {
    rects,
    rect: (x: number, y: number, w: number, h: number) => ((at = { x, y, w, h }), g),
    fill: (f: { color: number; alpha: number }) => (rects.push({ ...at, color: f.color, alpha: f.alpha }), g),
  };
  return g as unknown as Graphics & { rects: Rect[] };
}

const ORB: InfusionShape = { kind: 'orb', x: 5, y: 5, r: 0.3, vx: 8, vy: -3 };
const PATH: InfusionShape = {
  kind: 'path',
  points: [{ x: 2, y: 8 }, { x: 5, y: 6 }, { x: 8, y: 7 }],
  width: 0.4,
  progress: 1,
};
const RING: InfusionShape = { kind: 'ring', x: 5, y: 5, r: 2 };
const SHAPES = [ORB, PATH, RING];
const budget = (left = 1000): InfusionBudget => ({ left });

describe('drawLook', () => {
  it('draws every look on every carrier shape, in mana pixels', () => {
    for (const look of LOOKS)
      for (const shape of SHAPES) {
        const g = recorder();
        drawLook({ air: g }, look, 0xff8844, shape, 1.5, 7, 1, budget());
        expect(g.rects.length, `${look} on ${shape.kind}`).toBeGreaterThan(0);
        // On the sprites' grid: every pixel a whole number of 0.1 units wide.
        for (const r of g.rects) expect(Math.round(r.w * 10) / 10).toBe(r.w);
      }
  });

  it('is stable: the same seed and clock draw the same pixels', () => {
    const a = recorder();
    const b = recorder();
    drawLook({ air: a }, 'spark', 0xff8844, RING, 2, 11, 1, budget());
    drawLook({ air: b }, 'spark', 0xff8844, RING, 2, 11, 1, budget());
    expect(a.rects).toEqual(b.rects);
  });

  it('spends one budget element per motif element and draws nothing past the budget', () => {
    const n = lookCount('arrow', PATH);
    expect(n).toBeGreaterThan(1);
    const spent = budget(1000);
    drawLook({ air: recorder() }, 'arrow', 0xff8844, PATH, 0, 3, 1, spent);
    expect(spent.left).toBe(1000 - n);
    const none = recorder();
    drawLook({ air: none }, 'arrow', 0xff8844, PATH, 0, 3, 1, budget(0));
    expect(none.rects).toHaveLength(0);
  });

  it('fades with strength and draws nothing at 0', () => {
    const full = recorder();
    const dim = recorder();
    drawLook({ air: full }, 'orb', 0xff8844, ORB, 0, 5, 1, budget());
    drawLook({ air: dim }, 'orb', 0xff8844, ORB, 0, 5, 0.4, budget());
    expect(Math.max(...dim.rects.map((r) => r.alpha))).toBeLessThan(
      Math.max(...full.rects.map((r) => r.alpha)),
    );
    const gone = recorder();
    drawLook({ air: gone }, 'orb', 0xff8844, ORB, 0, 5, 0, budget());
    expect(gone.rects).toHaveLength(0);
  });
});
```

In `mana-fx.test.ts`, beside its infusion tests, with the file's own fixtures (`fakeGraphics` counts rects as a number; `L()` both layers, `B()` a full budget):

```ts
  it('a look carrier is drawn by drawLooks (after the whole infusion pass), not by draw, and dies with its life', () => {
    const fx = new ManaFx();
    fx.look('crescent', 0xff8844, { kind: 'ring', x: 3, y: 3, r: 1 });
    const during = L();
    fx.draw(during, 1 / 60, 0.1, B());
    expect(during.air.rects).toBe(0); // draw() ages it; the renderer draws it after drawInfusions
    const looks = L();
    fx.drawLooks(looks, 0.1, B());
    expect(looks.air.rects).toBeGreaterThan(0);
    const spent = B();
    fx.drawLooks(L(), 0.1, spent);
    expect(spent.left).toBeLessThan(INFUSION_BUDGET);
    fx.draw(L(), 2, 2.1, B()); // past its life
    const later = L();
    fx.drawLooks(later, 2.1, B());
    expect(later.air.rects).toBe(0);
  });
```

In `arena-renderer.test.ts`, beside the slash/explode tests (the file's `stage()` helper gives `r`):

```ts
  it("draws the casting weapon's look motif on a cast, a beam, a slash, a blast and a dash", () => {
    const { r } = stage(1920, 1080);
    const fx = (r as unknown as { fx: ManaFx }).fx;
    const look = vi.spyOn(fx, 'look');
    r.handleEvents([
      { kind: 'cast', slot: 0, step: 0, aimed: false, name: 'Bolt', form: 'bolt', element: 'fire', x: 1, y: 1, tx: 3, ty: 1, heft: 0.3, look: 'arrow' },
      { kind: 'beam', x: 1, y: 1, tx: 5, ty: 1, width: 0.4, element: 'fire', infusion: null, look: 'spark' },
      { kind: 'slash', x: 1, y: 1, dir: { x: 1, y: 0 }, range: 2, arc: 90, element: 'fire', heft: 0.5, infusion: null, look: 'crescent' },
      { kind: 'explode', x: 2, y: 2, radius: 1.5, element: 'fire', infusion: null, look: 'stone' },
      { kind: 'dash', fromX: 0, fromY: 0, toX: 3, toY: 0, infusion: null, look: 'blade' },
    ]);
    expect(look.mock.calls.map(([l]) => l)).toEqual(['arrow', 'spark', 'crescent', 'stone', 'blade']);
    expect(look.mock.calls.map(([, , s]) => s.kind)).toEqual(['ring', 'path', 'path', 'ring', 'path']);
    look.mockClear();
    r.handleEvents([{ kind: 'explode', x: 2, y: 2, radius: 1.5, element: 'fire', infusion: null }]);
    expect(look).not.toHaveBeenCalled();
  });
```

(`dash`'s other fields follow the event's type: fill in what tsc asks for. If `fx` is `private`, the cast through `unknown` reads it all the same.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/looks.test.ts src/features/delve/arena/fx/__tests__/mana-fx.test.ts src/features/delve/__tests__/arena-renderer.test.ts --reporter=dot`
Expected: FAIL (no `../looks`; `fx.look` is not a function).

- [ ] **Step 3: Implement**

`arena/fx/looks.ts`:

```ts
import type { Graphics } from 'pixi.js';
import type { StyleLook } from '@alloy/engine';
import { PX, hash, manaArc, manaLine, px } from './mana-pixels';
import type { InfusionBudget, InfusionLayers, InfusionShape } from './infusion';

/**
 * Look motifs (the constructs spec §4.2): one per weapon, drawn on its casts' carriers (a cast's
 * ring at the hand, a beam's or a dash's path, a slash's arc, a blast's rim) as the infusion motifs
 * are: mana pixels on the sprites' grid, each element placed by a hash of the carrier's seed and
 * the clock (so a motif streams along its carrier and never shimmers), one budget element each.
 * A look is colour-neutral: steel and stone keep their tones, the rest take the cast's element.
 */

export const LOOKS: readonly StyleLook[] = [
  'blade', 'crescent', 'hatchet', 'stone', 'orb', 'spark', 'arrow',
];

const GOLDEN = 0.618034;
const TAU = Math.PI * 2;
const STEEL = 0xe8e4de;
const STEEL_DIM = 0xa8a29e;
const STONE = 0xe8d8b4;
const STONE_DIM = 0xbfa47c;

/** Elements per carrier: an orb's count, per unit along a path, per unit of rim round a ring. */
const DENSITY: Record<StyleLook, Record<InfusionShape['kind'], number>> = {
  blade: { orb: 3, path: 1.2, ring: 0.9 },
  crescent: { orb: 2, path: 0.8, ring: 0.6 },
  hatchet: { orb: 2, path: 0.7, ring: 0.5 },
  stone: { orb: 4, path: 1.4, ring: 1.2 },
  orb: { orb: 3, path: 1, ring: 0.8 },
  spark: { orb: 5, path: 2, ring: 1.4 },
  arrow: { orb: 2, path: 0.9, ring: 0.6 },
};

/** How many elements `look` draws on `shape` (the budget it spends when it has it). */
export function lookCount(look: StyleLook, shape: InfusionShape): number {
  const d = DENSITY[look][shape.kind];
  if (shape.kind === 'orb') return d;
  if (shape.kind === 'ring') return Math.max(2, Math.round(TAU * shape.r * d));
  return Math.max(1, Math.round(pathLength(shape.points) * d));
}

/** One motif element's place: a point, its unit tangent and a per-element random in [0, 1). */
interface Slot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  r: number;
}

function pathLength(points: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++)
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

/** The point a fraction `f` of the way along a polyline, with its tangent. */
function alongPath(points: { x: number; y: number }[], f: number): Slot {
  let want = f * pathLength(points);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (want <= seg || i === points.length - 1) {
      const t = seg > 0 ? Math.min(1, want / seg) : 0;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        tx: seg > 0 ? (b.x - a.x) / seg : 1,
        ty: seg > 0 ? (b.y - a.y) / seg : 0,
        r: 0,
      };
    }
    want -= seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, tx: 1, ty: 0, r: 0 };
}

/** Element `i`: golden-ratio spaced and streaming with the clock, so every prefix spreads evenly. */
function slotAt(shape: InfusionShape, i: number, seed: number, time: number): Slot {
  const f = (i * GOLDEN + hash(seed, i) + time * 0.6) % 1;
  const r = hash(seed + 13, i);
  if (shape.kind === 'ring') {
    const a = f * TAU;
    return {
      x: shape.x + Math.cos(a) * shape.r,
      y: shape.y + Math.sin(a) * shape.r,
      tx: -Math.sin(a),
      ty: Math.cos(a),
      r,
    };
  }
  if (shape.kind === 'orb') {
    const a = f * TAU;
    const v = Math.hypot(shape.vx, shape.vy);
    return {
      x: shape.x + Math.cos(a) * shape.r,
      y: shape.y + Math.sin(a) * shape.r,
      tx: v > 0 ? shape.vx / v : 1,
      ty: v > 0 ? shape.vy / v : 0,
      r,
    };
  }
  // A path draws only as far as its carrier has grown.
  return { ...alongPath(shape.points, f * Math.max(0.05, shape.progress)), r };
}

type Motif = (g: Graphics, s: Slot, color: number, alpha: number) => void;

/** Each look's one element. Steel and stone keep their tones; the rest take the cast's colour. */
const MOTIF: Record<StyleLook, Motif> = {
  // A steel sliver along the carrier, white at its tip.
  blade: (g, s, _c, a) => {
    manaLine(g, s.x - s.tx * PX, s.y - s.ty * PX, s.x + s.tx * 2 * PX, s.y + s.ty * 2 * PX, STEEL, a, {
      thickness: 1,
    });
    px(g, s.x + s.tx * 2 * PX, s.y + s.ty * 2 * PX, 0xffffff, a);
  },
  // A short arc bowed across the carrier.
  crescent: (g, s, c, a) => {
    const at = Math.atan2(s.ty, s.tx) + Math.PI / 2;
    manaArc(g, s.x, s.y, 0.25, at - 1.1, at + 1.1, c, a, 1);
  },
  // A haft along the carrier and a wide head across its end.
  hatchet: (g, s, _c, a) => {
    const hx = s.x + s.tx * PX;
    const hy = s.y + s.ty * PX;
    manaLine(g, s.x - s.tx * 2 * PX, s.y - s.ty * 2 * PX, hx, hy, STEEL_DIM, a, { thickness: 1 });
    manaLine(g, hx + s.ty * PX, hy - s.tx * PX, hx - s.ty * 2 * PX, hy + s.tx * 2 * PX, STEEL, a, {
      thickness: 2,
    });
  },
  // Pebbles and dust in stone tones, a bigger one now and then.
  stone: (g, s, _c, a) => {
    px(g, s.x, s.y, s.r < 0.5 ? STONE : STONE_DIM, a, s.r < 0.3 ? 2 : 1);
    px(g, s.x + PX, s.y - PX, STONE_DIM, a * 0.6);
  },
  // A small orb: a white heart ringed by four pixels of the element.
  orb: (g, s, c, a) => {
    px(g, s.x, s.y, 0xffffff, a);
    px(g, s.x + PX, s.y, c, a * 0.8);
    px(g, s.x - PX, s.y, c, a * 0.8);
    px(g, s.x, s.y + PX, c, a * 0.8);
    px(g, s.x, s.y - PX, c, a * 0.8);
  },
  // A white spark with a short trail of the element behind it.
  spark: (g, s, c, a) => {
    px(g, s.x, s.y, 0xffffff, a);
    manaLine(g, s.x - s.tx * 3 * PX, s.y - s.ty * 3 * PX, s.x - s.tx * PX, s.y - s.ty * PX, c, a * 0.7, {
      thickness: 1,
    });
  },
  // A streak along the carrier with a chevron head.
  arrow: (g, s, c, a) => {
    manaLine(g, s.x - s.tx * 4 * PX, s.y - s.ty * 4 * PX, s.x, s.y, c, a, { thickness: 1 });
    px(g, s.x - s.tx * PX - s.ty * PX, s.y - s.ty * PX + s.tx * PX, 0xffffff, a);
    px(g, s.x - s.tx * PX + s.ty * PX, s.y - s.ty * PX - s.tx * PX, 0xffffff, a);
    px(g, s.x, s.y, 0xffffff, a);
  },
};

/**
 * Draw `look` on `shape` in `color` (the cast's element): `strength` 0–1 its alpha, `seed` the
 * carrier's, `time` the clock; each element spends one of `budget.left`, and none is drawn past it.
 */
export function drawLook(
  layers: InfusionLayers,
  look: StyleLook,
  color: number,
  shape: InfusionShape,
  time: number,
  seed: number,
  strength: number,
  budget: InfusionBudget,
): void {
  if (strength <= 0) return;
  const n = lookCount(look, shape);
  const alpha = Math.min(1, 0.9 * strength);
  for (let i = 0; i < n; i++) {
    if (budget.left <= 0) return;
    budget.left -= 1;
    MOTIF[look](layers.air, slotAt(shape, i, seed, time), color, alpha);
  }
}
```

(`hash` returns a fraction in [0, 1) as `infusion.ts` uses it; if it returns an integer, divide by its range there. `px`'s last argument is a whole pixel count, as `mana-fx.ts`'s glyph pass calls it.)

In `arena/fx/mana-fx.ts`:

1. `import { drawLook } from './looks';` and `type StyleLook` from the engine.
2. A carrier type beside `Infused`:

```ts
/** A look motif's carrier (fx/looks.ts): a cast's ring, a beam's or dash's path, a slash's arc, a blast's rim. */
interface Looked {
  look: StyleLook;
  color: number;
  shape: InfusionShape;
  seed: number;
  age: number;
  life: number;
}
/** A look carrier's life by shape: a ring at the hand or a rim, a path, an orb. */
const LOOK_LIFE: Record<InfusionShape['kind'], number> = { ring: 0.4, path: 0.35, orb: 0.25 };
```

3. The field `private looks: Looked[] = [];`, reset where `this.infusions = []` is reset (today's line 213), and after `infuse()`:

```ts
  /**
   * The casting weapon's look motif on a carrier (the constructs spec §4.2): aged by `draw`,
   * drawn by `drawLooks` after the whole infusion pass, fading over its shape's life. Seeded from
   * where and when it was made.
   */
  look(look: StyleLook, color: number, shape: InfusionShape): void {
    const at = shape.kind === 'path' ? shape.points[0] : shape;
    this.looks.push({
      look,
      color,
      shape,
      seed: eventSeed(at.x, at.y, this.now),
      age: 0,
      life: LOOK_LIFE[shape.kind],
    });
  }
```

4. In `draw()`, beside `for (const f of this.infusions) f.age += dt;`, age the looks too (`for (const l of this.looks) l.age += dt;`) and, with the infusions' filter at the end, `this.looks = this.looks.filter((l) => l.age < l.life);`. `draw()` draws none of them. After `draw()`, a method of its own:

```ts
  /**
   * The weapons' look motifs (fx/looks.ts), drawn after the whole infusion pass (`draw`'s
   * transient carriers, then the renderer's `drawInfusions`) on the same budget, so every
   * infusion motif has it first. A ring grows like a blast's rim, a path runs with its age.
   */
  drawLooks(layers: InfusionLayers, time: number, budget: InfusionBudget): void {
    for (const l of this.looks) {
      const p = Math.min(1, l.age / l.life);
      const shape: InfusionShape =
        l.shape.kind === 'ring'
          ? { ...l.shape, r: 0.1 + (l.shape.r - 0.1) * (1 - Math.pow(1 - p, 3)) }
          : l.shape.kind === 'path'
            ? { ...l.shape, progress: p }
            : l.shape;
      drawLook(layers, l.look, l.color, shape, time, l.seed, 1 - p, budget);
    }
  }
```

5. Export `arcPoints` (`export function arcPoints(…)`) and extend the `draw` doc comment: "…then blink trails (the weapons' look motifs wait for `drawLooks`)."

In `arena/ArenaRenderer.ts`, `import { ManaFx, arcPoints, finisherRing, hitFxPicks } from './fx/mana-fx';`; in the frame's draw (today's lines 846–851), after `drawInfusions(layers, w, this.time, this.budget);` add `this.fx.drawLooks(layers, this.time, this.budget);` and extend the comment above: "…then the hero's aura, projectiles, lobs and zones, then the weapons' look motifs." Then in the five event cases:

- `cast`, after the `fling`/`burst` branch: `if (e.look) this.fx.look(e.look, color, { kind: 'ring', x: e.x, y: e.y, r: 0.9 });`
- `beam`, after the burst: `if (e.look) this.fx.look(e.look, MANA_HEX[e.element], { kind: 'path', points: [{ x: e.x, y: e.y }, { x: e.tx, y: e.ty }], width: e.width, progress: 0 });`
- `slash`, after the shake:

```ts
          if (e.look) {
            const angle = Math.atan2(e.dir.y, e.dir.x);
            const arc = Math.min(360, e.arc) * (Math.PI / 180);
            this.fx.look(e.look, MANA_HEX[e.element], {
              kind: 'path',
              points: arcPoints(e.x, e.y, e.range, angle - arc / 2, angle + arc / 2),
              width: 0.3,
              progress: 0,
            });
          }
```

- `explode`, after the infusion: `if (e.look) this.fx.look(e.look, elemColor(e.element), { kind: 'ring', x: e.x, y: e.y, r: e.radius });`
- `dash`, after the infusion: `if (e.look) this.fx.look(e.look, this.guardColor(w), { kind: 'path', points: [{ x: e.fromX, y: e.fromY }, { x: e.toX, y: e.toY }], width: 0.4, progress: 0 });`

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/arena/fx/__tests__/looks.test.ts src/features/delve/arena/fx/__tests__/mana-fx.test.ts src/features/delve/arena/fx/__tests__/infusion.test.ts src/features/delve/__tests__/arena-renderer.test.ts --reporter=dot`
Expected: PASS. If tsc says an event has no `look` (B1 not merged on `beam`/`slash`/`explode`/`dash`), A's contract adds the field to all six on the type: check `types/arpg.ts` on the branch, and if A left it off one, add `look?: StyleLook` there and list it under Needs routed.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/fx/looks.ts packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/fx/__tests__/looks.test.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts
git commit -m "feat(client): one look motif per weapon on its casts, beams, slashes, blasts and dashes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: the HUD skips dormant constructs (a test)

The HUD reads `HeroEntity.chains`, which `beginFloor` builds through `heroChains` (the one place dormancy is decided), so no HUD code changes: this task pins it.

**Files:**
- Test: `__tests__/arena-hud-snapshot.test.ts`

- [ ] **Step 1: Write the test**

```ts
  it('a chain of dormant constructs alone has no HUD slot (heroChains decides)', () => {
    // A bow wearing the sword's Strike constructs: its Primary chain is all dormant.
    const p0 = createDelveProfile(registry, 4242, { primary: 'fire' });
    const sword = p0.equipped.weapon!;
    const bow = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'bow', mana: 'fire' },
      new SeededRNG(4),
    );
    const bowSet = movesetOf(registry, bow);
    const worn = {
      ...bow,
      moveset: {
        ...bowSet,
        chains: { ...bowSet.chains, primary: movesetOf(registry, sword).chains.primary! },
      },
    };
    const p1 = startDive(registry, { ...p0, equipped: { ...p0.equipped, weapon: worn } }, 1);
    const w = beginFloor(registry, p1);
    expect(w.hero.chains[0]).toBeNull();
    const hud = snapshot(w, null);
    expect(hud.abilities[0]).toBeNull();
    expect(hud.abilities[1]).not.toBeNull(); // the bow's own Defensive plays
  });
```

Add `generateItem`, `movesetOf` and `SeededRNG` to the engine import (`beginFloor`, `createDelveProfile` and `startDive` are already imported there). If the snapshot reports an absent chain otherwise than `null` (read `abilities:` in `useArenaCore.ts`'s `snapshot`), assert that shape.

- [ ] **Step 2: Run it**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts --reporter=dot`
Expected: PASS at once (A's `heroChains` filters dormant constructs; the sword's Primary is Strike on A's class-aware default). If the sword's constructs aren't melee-only on the branch (`movesetOf(sword).chains.primary.moves[0].form` isn't `strike`), make the chain by hand: `{ payment: 'mana', moves: [{ uid: 'cX', kind: 'light', form: 'strike', elements: ['fire'] }] }`.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts
git commit -m "test(client): the HUD shows no slot for a chain of dormant constructs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: the Training Grounds: class rules, Load my build loads constructs

Spec §6: the sandbox's own chains are not constructs (no uids, no bag). Load my build copies every construct of the worn weapon (uids stripped, dormant ones too, so the dock shows the weapon as the Anvil does); the chains the arena plays drop what the weapon's class can't express (`sandboxLiveChains`, the sandbox's one place, as `heroChains` is the Delve's); the default Primary follows the weapon's class as the default basic chain follows the weapon (`followBasic`). The form picker's class gating and the dock's dormant marks are C1's `ChainEditor` (Needs routed).

**Files:**
- Modify: `stores/sandboxStore.ts`
- Modify: `training/useTrainingArena.ts`
- Test: `stores/sandboxStore.test.ts`

- [ ] **Step 1: Write the failing tests**

In `sandboxStore.test.ts`: in `'starts from the defaults…'`, if it names the Primary's form, a sword's is now Strike. Replace `"Load my build keeps the sandbox's chains for the skills the weapon doesn't carry"` with:

```ts
  it("Load my build copies every construct of the weapon, uids stripped, and keeps the sandbox's chains for the skills it has no slots of", () => {
    const profile = createDelveProfile(registry, 7, { primary: 'frost' });
    const before = store().chains;
    store().loadMyBuild(profile); // a common sword: Basic and two Primary constructs, no Defensive slot
    const sword = movesetOf(registry, profile.equipped.weapon!).chains;
    const strip = <T extends { uid?: string }>(m: T) => {
      const { uid: _uid, ...rest } = m;
      return rest;
    };
    expect(store().chains).toEqual({
      basic: sword.basic!.map(strip),
      primary: { ...sword.primary!, moves: sword.primary!.moves.map(strip) },
      defensive: before.defensive,
      ultimate: before.ultimate,
    });
    expect(JSON.stringify(store().chains)).not.toContain('"uid"');
  });

  it("the default Primary follows the weapon's class: a sword's Strike becomes a bow's Bolt; a built one stays", () => {
    store().reset();
    expect(store().chains.primary.moves[0].form).toBe('strike');
    store().setWeapon({ baseId: 'bow', mana: 'fire', rarity: 'rare' });
    expect(store().chains.primary.moves[0].form).toBe('bolt');
    store().setChain('primary', {
      payment: 'mana',
      moves: [{ kind: 'heavy', form: 'lance', elements: ['fire'] }],
    });
    store().setWeapon({ baseId: 'sword', mana: 'fire', rarity: 'rare' });
    expect(store().chains.primary.moves[0].form).toBe('lance');
  });

  it("sandboxLiveChains drops the moves the weapon's class can't express and a chain that empties, keeping the basic", () => {
    store().reset(); // a sword: its Primary is Strike
    const chains = store().chains;
    const live = sandboxLiveChains(registry, 'bow', chains);
    expect(live.basic).toBe(chains.basic);
    expect(live.primary).toBeUndefined();
    expect(live.defensive).toEqual(chains.defensive); // Ward is shared
    expect(sandboxLiveChains(registry, 'sword', chains).primary).toEqual(chains.primary);
    expect(sandboxLiveChains(registry, null, chains).primary).toBeUndefined(); // unarmed expresses no form
  });
```

Add `movesetOf` to the engine import and `sandboxLiveChains` to the store's.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/stores/sandboxStore.test.ts --reporter=dot`
Expected: FAIL (`sandboxLiveChains` missing; Load my build copies `heroChains`; the Primary doesn't follow).

- [ ] **Step 3: Implement**

In `stores/sandboxStore.ts`:

1. Imports: `heroChains` → `movesetOf`, plus `formAllowed` and `type Move`.

2. Above `useSandboxStore`:

```ts
/** A construct without its uid: the sandbox's chains are not constructs (the constructs spec §6). */
function stripUid<T extends { uid?: string }>(m: T): T {
  const { uid: _uid, ...rest } = m;
  return rest as T;
}

/** The Primary chain the sandbox starts with on `weaponBaseId` in `primary`: its class's default form. */
function defaultPrimary(registry: DataRegistry, primary: ManaType, weaponBaseId: string | null): Chain {
  return defaultChains(registry, primary, weaponBaseId).primary;
}

/** `chain` is the default Primary on `on` (its moves' kinds, forms and elements; runes aside). */
function isDefaultPrimary(registry: DataRegistry, chain: Chain, on: Loadout): boolean {
  const def = defaultPrimary(registry, on.primary, on.weapon?.baseId ?? null);
  return (
    def.moves.length === chain.moves.length &&
    def.moves.every(
      (m, i) =>
        m.kind === chain.moves[i].kind &&
        m.form === chain.moves[i].form &&
        m.elements.join() === chain.moves[i].elements.join(),
    )
  );
}

/**
 * The chains the sandbox arena plays: a move whose form the weapon's class can't express is
 * dormant and dropped, an ability chain that empties with it; the basic chain is never (its
 * blows have no form). The sandbox's one place for dormancy, as `heroChains` is the Delve's.
 */
export function sandboxLiveChains(
  registry: DataRegistry,
  weaponBaseId: string | null,
  chains: Chains,
): Partial<Chains> {
  const live = (c: Chain): Chain | undefined => {
    const moves = c.moves.filter((m: Move) => formAllowed(registry, weaponBaseId, m.form));
    return moves.length > 0 ? { ...c, moves } : undefined;
  };
  const out: Partial<Chains> = { basic: chains.basic };
  for (const s of ['primary', 'defensive', 'ultimate'] as const) {
    const c = live(chains[s]);
    if (c) out[s] = c;
  }
  return out;
}
```

(`Loadout` is the file's existing `Pick<SandboxLoadout, 'weapon' | 'primary' | 'secondary'>`; move its declaration above these if it sits below.)

3. In the store's `follow`, after `const basic = …`:

```ts
    const to = { ...s, ...next };
    const primary = isDefaultPrimary(getDelveRegistry(), s.chains.primary, s)
      ? defaultPrimary(getDelveRegistry(), to.primary, to.weapon?.baseId ?? null)
      : s.chains.primary;
    return { ...s.chains, basic, primary };
```

Its doc comment: "The chains with the basic one following the weapon and pair, and a default Primary following the weapon's class, to `next`."

4. In `loadMyBuild`, replace the `chains:` entry with:

```ts
        // Every construct on the weapon, dormant ones too, as the Anvil shows it; no uids here.
        chains: {
          ...get().chains,
          ...(weapon
            ? Object.fromEntries(
                Object.entries(movesetOf(getDelveRegistry(), weapon).chains).map(([s, c]) => [
                  s,
                  Array.isArray(c) ? c.map(stripUid) : { ...c, moves: c.moves.map(stripUid) },
                ]),
              )
            : {}),
        },
```

and its interface comment: "Copy the save's gear, its weapon's constructs (uids stripped: the sandbox's chains are not constructs) and its pair in…; a skill the weapon has no slots of keeps the sandbox's chain."

5. `SANDBOX_DEFAULTS.chains` stays `defaultChains(getDelveRegistry(), 'fire', 'sword')` (class-aware under A: Strike). The `parseSandbox` fallback keeps `defaultChains(registry, primary, weaponBaseId)`.

In `training/useTrainingArena.ts`, where `const chains = useSandboxStore((s) => s.chains);` feeds `loadout` (today's lines 45–51):

```ts
  const chains = useSandboxStore((s) => s.chains);
  const baseId = useSandboxStore((s) => s.weapon?.baseId ?? null);
  // What the arena plays: a dormant move (the other class's form) is skipped, as on the Delve.
  const live = useMemo(() => sandboxLiveChains(getDelveRegistry(), baseId, chains), [baseId, chains]);
  const loadout = useMemo(() => ({ stats, chains: live }), [stats, live]);
```

importing `sandboxLiveChains` from `@/stores/sandboxStore` and `getDelveRegistry` from `'../registry'` if not imported. `TrainingPanel.test.tsx` may assert the Abilities tab's chains on a bow: run it.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/stores/sandboxStore.test.ts src/features/delve/__tests__/TrainingPanel.test.tsx src/features/delve/__tests__/TrainingBar.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/sandboxStore.ts packages/client/src/stores/sandboxStore.test.ts packages/client/src/features/delve/training/useTrainingArena.ts
git commit -m "feat(client): the Training Grounds follow the class rules; Load my build loads constructs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Help tells the constructs frame

The weapons topic (spec §1's lore, §6 Help): a move is a construct, the weapon decides how it's expressed; the classes; slots by rarity (one number from the balance); Open a skill; Move all and the bag. The skills topic names the bag.

**Files:**
- Modify: `hub/help/help-topics.tsx`
- Test: `hub/help/__tests__/help-topics.test.tsx`

- [ ] **Step 1: Rewrite the tests**

Replace `"names what a weapon carries in the engine's words, and where a rare awakens"` with:

```tsx
  it('tells the constructs frame: what a construct is, the classes, the slots by rarity, Open a skill and Move all', () => {
    render(<HelpPage topic="weapons" />);
    const page = screen.getByTestId('howto-constructs');
    expect(page).toHaveTextContent(
      "A move is a construct: a pattern that channels your mana. Your weapon decides how it's expressed.",
    );
    expect(page).toHaveTextContent(
      'Daggers, swords, axes and mauls are melee and staves, wands and bows ranged',
    );
    const common = registry.getDelveBalance().movesets.slots.common.primary[0];
    expect(page).toHaveTextContent(`a common one holds ${common} for your Primary Q`);
    expect(page).toHaveTextContent("a skill with no slot opens on the Forge's Temper bench");
    expect(page).toHaveTextContent('Move all moves every construct onto it');
    expect(page).not.toHaveTextContent('Awaken');
    expect(page).not.toHaveTextContent('carries');
  });

  it('the skills topic names the move bag', () => {
    render(<HelpPage topic="skills" />);
    expect(screen.getByTestId('delve-howto')).toHaveTextContent('waits in your move bag');
  });
```

Drop `CHAIN_SKILLS, carriedByText, carriedFrom, carriedSkills` and `SKILL_NAME` from the test's imports if nothing else reads them.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/hub/help/__tests__/help-topics.test.tsx --reporter=dot`
Expected: FAIL (compile: the carries imports).

- [ ] **Step 3: Implement**

In `help-topics.tsx`: drop `CHAIN_SKILLS, carriedByText, carriedFrom, carriedSkills` from the engine import (and `SKILL_NAME` if unused). Replace `const always = …` and `const firstFlux = …` with:

```ts
  // What a common weapon holds for your Primary: the slot table's first row (spec §3.2).
  const commonPrimary = registry.getDelveBalance().movesets.slots.common.primary[0];
```

Replace the `weapons` block with:

```tsx
      {topic === 'weapons' && (
        <div data-testid="howto-constructs" className="flex flex-col gap-2">
          <p>
            A move is a <b className="text-[var(--k-text)]">construct</b>: a pattern that channels
            your mana. Your weapon decides how it's expressed. Daggers, swords, axes and mauls are{' '}
            <b className="text-[var(--k-text)]">melee</b> and staves, wands and bows{' '}
            <b className="text-[var(--k-text)]">ranged</b>: each class has forms of its own (a
            Strike, a Volley) and shares the rest, and each weapon casts in its own style (a
            sword's Balanced, a bow's Marksman).
          </p>
          <p>
            A weapon holds constructs in slots, more by rarity: a common one holds {commonPrimary}{' '}
            for your Primary {g('primary')} and none yet for your Defensive. Links buy slots up to
            its ceiling; a skill with no slot opens on the Forge's Temper bench, for flux.
          </p>
          <p>
            Taking a new weapon, <b className="text-[var(--k-text)]">Move all</b> moves every
            construct onto it, free: what doesn't fit goes to your move bag on the Skills tab, and a
            construct its class can't express sleeps in its slot until a weapon that can holds it.
          </p>
        </div>
      )}
```

In the `skills` paragraph, after "Links buy more slots.", add: `{' '}A construct out of a slot waits in your move bag: place it in any slot of its skill, on any weapon, with its sockets and runes.`

Doc comment: "…what a construct is and how a weapon expresses it (the classes, the slots, Move all)…".

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/hub/help/__tests__/help-topics.test.tsx src/features/delve/hub/help/__tests__/HelpDialog.test.tsx --reporter=dot`
Expected: PASS. The type-floor check (`not.toMatch(/text-(\[(\d|1[0-3])px\]|xs\b)/)`) holds: nothing new under 18 px.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/help/help-topics.tsx packages/client/src/features/delve/hub/help/__tests__/help-topics.test.tsx
git commit -m "feat(client): Help tells the constructs frame

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: area close

- [ ] Run: `cd packages/engine && npx tsup && cd ../client && npx tsc --noEmit -p . && npx vitest run src/features/delve src/stores --reporter=dot`
Expected: PASS, with the `it.skip`s marked `// D2 un-skips` (Task 2's two, Task 4's one) skipped. Any failure naming `transferMoveset`, `carriedSkills`, `carriedByText`, `socketCap`, `awaken` or `awakened` is a reader this plan missed: grep `packages/client/src` for each (the Skills tab's are C1's: leave them) and move it to the model (`moveAllPreview`, `slotRange`, `MAX_SOCKETS`, `openSkill`).
- [ ] `grep -rn "transfer-button\|take-transfer\|temper-op-awaken\|Carries " packages/client/e2e` and list every hit under Needs routed for D2 (this plan runs no Playwright).

## Needs routed

- **Integrator (the store):** `stores/delveStore.ts` is edited by C1 (the draft, `applyDraft`) and C2 (Task 2: the `DRAFT_PENDING` / `draftPending` exports after `UNDO_MS`, the `offerUndo` helper beside `applyResult`, and the `moveAll` / `salvageConstruct` / `openSkill` block after `takeStop`; `transfer` and `awaken` deleted). `draftPending` is the one reader of C1's `draftChanges` outside the draft: if C1 renames or reshapes it, point `draftPending` at the new name. `stores/delveStore.test.ts`: Task 2's `describe` goes at the end; its two `chainDraft` casts (`as ChainDraft`) take whatever fields C1 adds (a `bag: []`).
- **C1:** the bag pane's X-salvage of a construct uses Task 2's `salvageConstruct` and the existing `undoSalvage` (the Loadout's Undo prompt pattern in `LoadoutTab.tsx`, `undoLive`); its refusal reason is the engine's or `DRAFT_PENDING`. The class rules in the editor (spec §6: the form picker offers only the class's forms and a move of the other class shows greyed "(dormant)", as the Anvil does) need the weapon's base id. `TrainingPanel.tsx` already hands it in `ChainRunes.weaponBaseId` (line 341), so for the Training Grounds C1 can read `runes.weaponBaseId` and no new prop is needed; the stop's `MovePick` (Task 11) passes no `runes`, so C1 either adds a top-level `ChainEditorProps.weaponBaseId?: string | null` (then `MovePick` passes `weaponBaseId={weapon.baseId}` and `TrainingAbilities` `weaponBaseId={baseId}`: one line each, C2's files, added at merge) or `MovePick` passes a `runes` object. C1 decides; C2's one-liners follow.
- **A / integrator:** if `GLYPH_ART` lacks `whirl`, `repel` and `onslaught` after A, Task 12 adds them (the `Record<GlyphId, …>` would not typecheck without them, so A most likely did). `registry.getGearBase(baseId)` is assumed; if the lookup is named otherwise, `weapon-frame.ts` and `Temper.tsx` use that name. If A left `look` off any of `beam`, `slash`, `explode` or `dash` on the event type, Task 13 adds `look?: StyleLook` there (A's file).
- **B1:** sets `look` on `beam`, `slash`, `explode` and `dash` (the contract): until then only casts draw a motif; nothing in C2 waits on it.
- **B2 / D2:** un-skip after B2 merges: `delveStore.test.ts` "Move all wears the bag weapon…" and "salvaging a bag construct offers Undo…", `TakeSheet.test.tsx` "Move all moves your constructs onto it…", and the tail of `ComparePane.test.tsx`'s "a bag weapon is valued as it is and after Move all…" (its early `return` past the click).
- **D1:** the tutorial target `loadout.transfer` is kept as the id on `move-all-button`, `take-move-all` and `LoadoutTab.tsx`'s A prompt; when D1 renames it (`loadout.moveAll`), those three `data-tutorial` values follow (and `TUTORIAL_TARGETS` in `types/tutorial.ts`).
- **D2 (E2E and docs):** selectors changed: `transfer-button` → `move-all-button`, `take-transfer` → `take-move-all`, `temper-op-awaken` → `temper-open-skill`, the `forge-weapon` note ("Melee · Basic 3 / 3 · …"), the paper doll's "Primary 2 / 3", the moveset view's "(dormant)" and `data-dormant`; `e2e/delve-tutorial.spec.ts`'s Transfer step and any spec reading "Carries" (Task 17's grep lists them). CLAUDE.md's Client section: the compare pane's frame line (`weapon-frame`, `items/weapon-frame.ts`), Move all in Transfer's place (`moveAllOnto`, `MoveAllNotes`; the store's `equip`, `moveAll` and `salvageConstruct` refuse under `draftPending` with `DRAFT_PENDING`), Temper's Open a skill (`temper-open-skill`), the look motifs (`arena/fx/looks.ts`, `ManaFx.look` / `drawLooks`, drawn after `drawInfusions` on the same budget), the sandbox's `sandboxLiveChains` and its Primary following the class, Help's constructs topic (`howto-constructs`).

## Open questions for the integrator

1. **The header's trait words.** Spec §6 shows "Ranged · Marksman: pierces one foe", but A's `CastStyle` carries no text (its trait is a knob partial B1 fills). Task 8 shows "Ranged · Marksman". If the words are wanted, B1 (or D2) adds `text` to `CastStyle` and `delve.json`'s style rows, and `frameText` appends `: ${style.text}`; `ItemHeader.test.tsx`'s two regexes then take the suffix.
2. **A `hit`'s look.** The contract puts `look` on `hit` too; Task 13 draws none there (a Strike's contact hits ride its `slash`, a Bolt's its `explode`, and the hit moments have their own budget, `HIT_FX_BUDGET`). If a flash at each contact hit is wanted, it is one more `this.fx.look(e.look, color, { kind: 'orb', x: e.x, y: e.y, r: 0.3, vx: 0, vy: 0 })` in the `hit` case, for `source === 'skill' && !e.echo`.
3. **The equip guard's reach (decided).** The guard lives in the store, one place: `equip` returns `false` with the `DRAFT_PENDING` notice while `draftPending` (Task 2), for any item, so the Loadout's A, the take sheet's Equip and the bind choice's Bind-then-equip are all covered; the Loadout and the take sheet read the return before their sound (Tasks 3 and 4). No client-side guard.
4. **The sandbox schema and uids.** A says the sandbox's own schema stays without `uid`; Task 15 strips uids on Load my build regardless (spec §6: the sandbox's chains are not constructs), so whatever A's `BlowSchema` / `MoveSchema` do with the field, the saved loadout never holds one.
5. **The moveset view's words for a 0 ceiling.** "Ultimate — · not on a common weapon" (Task 9) and the stop's "No Ultimate slot on this weapon: open it at the Anvil" (Task 11, which can't tell a 0 ceiling from 0 slots without `slotRange`; trivial to split if wanted).
