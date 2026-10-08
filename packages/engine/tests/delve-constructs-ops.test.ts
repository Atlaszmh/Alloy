import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { addHaul, addMaterial, emptyHaul } from '../src/loot/materials.js';
import { dormantUids, isPlain, movesetOf, weaponParts } from '../src/loot/moveset.js';
import { socketsOf } from '../src/loot/runes.js';
import { salvageYield } from '../src/loot/salvage-yield.js';
import {
  applyDraft,
  draftRefusal,
  intoBag,
  mintMoveset,
  moveAll,
  placeConstruct,
  salvageConstruct,
  unsocketConstruct,
  type ConstructDraft,
} from '../src/delve/constructs.js';
import { beginFloor, completeFloor, settleDive, startDive } from '../src/delve/dive.js';
import { addSlot, movesOf } from '../src/delve/moveset.js';
import { bindSecondary, chooseStartingMana, realign } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  salvageItems,
  unequipSlot,
} from '../src/delve/profile.js';
import { openSocket, socketRune } from '../src/delve/runes.js';
import { stopKinds, takeStop } from '../src/delve/stops.js';
import type { Buff } from '../src/types/boon.js';
import { CHAIN_SKILLS, type Blow, type Construct, type Move } from '../src/types/ability.js';
import type { DelveProfile, DiveStop } from '../src/types/delve.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import { bal, registry } from './fixtures/arena.js';

// The constructs spec §3.3–3.5: the move bag's ops and the economy round them.

/** A Fire hero at the Anvil after one dive (edits priced), rich enough for every op, every plain construct kept. */
function hero(over: Partial<DelveProfile> = {}): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'fire' });
  return {
    ...p,
    stats: { ...p.stats, dives: 1 },
    scrap: 2000,
    manaDust: 500,
    links: 20,
    runes: { quick: [3, 0, 0, 0, 0], chain: [2, 0, 0, 0, 0] },
    autoSalvagePlain: false,
    ...over,
  };
}

/** A Fire weapon drop (its constructs without uids until it banks). */
const weapon = (uid: string, baseId: string, rarity: Rarity, seed = 1): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 3, rarity, slot: 'weapon', baseId, mana: 'fire' },
    new SeededRNG(seed),
  );

const ring = (uid: string): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 2, rarity: 'common', slot: 'ring', mana: 'fire' },
    new SeededRNG(1),
  );

/** `p` with `item` banked into the bag at the Anvil (its constructs minted). */
const banked = (p: DelveProfile, item: GearItem): DelveProfile =>
  addLootToBag(registry, p, [item]).profile;

const worn = (p: DelveProfile) => movesetOf(registry, p.equipped.weapon!);
const primary = (p: DelveProfile): Move[] => worn(p).chains.primary!.moves;
const basic = (p: DelveProfile): Blow[] => worn(p).chains.basic!;
const uids = (cs: readonly Construct[]) => cs.map((c) => c.uid!);

/** Every construct uid `p` holds: the worn weapon's, the bag weapons', the bag's, and an open dive's haul and banked (a settled dive's banked are in the bag already). */
function uidsOf(p: DelveProfile): string[] {
  const weapons = [p.equipped.weapon, ...p.bag].filter((i): i is GearItem => i?.slot === 'weapon');
  const held = weapons.flatMap((w) =>
    CHAIN_SKILLS.flatMap((s) => movesOf(movesetOf(registry, w).chains[s])),
  );
  const dive = p.dive && !p.dive.settled ? [...p.dive.haul.constructs, ...p.dive.banked.constructs] : [];
  return uids([...held, ...p.constructs, ...dive]);
}

/** The draft that is the save as it stands: the worn weapon's chains and the bag. */
const asIs = (p: DelveProfile): ConstructDraft => ({
  chains: { ...worn(p).chains },
  bag: [...p.constructs],
});

const strike = (uid: string): Move => ({ uid, kind: 'medium', form: 'strike', elements: ['fire'] });

describe('the haul carries constructs (materials.ts, constructs.ts)', () => {
  it("addHaul sums two hauls' constructs; emptyHaul holds none", () => {
    expect(emptyHaul().constructs).toEqual([]);
    const a = { ...emptyHaul(), constructs: [strike('c1')] };
    const b = { ...emptyHaul(), scrap: 3, constructs: [strike('c2'), strike('c3')] };
    expect(addHaul(a, b)).toMatchObject({ scrap: 3, constructs: [strike('c1'), strike('c2'), strike('c3')] });
    expect(addMaterial(a, { kind: 'dust' }, 2).constructs).toEqual([strike('c1')]);
  });

  it('intoBag appends to the bag; under autoSalvagePlain a plain construct is dropped', () => {
    const socketed = { ...strike('c2'), runes: [null] };
    const p = hero();
    expect(intoBag(p, [strike('c1'), socketed]).constructs).toEqual([strike('c1'), socketed]);
    expect(intoBag({ ...p, autoSalvagePlain: true }, [strike('c1'), socketed]).constructs).toEqual([socketed]);
    expect(intoBag(p, []).constructs).toEqual([]);
    expect(isPlain(socketed)).toBe(false);
  });

  it('mintMoveset mints a uid for each construct lacking one, in chain order, moving nextConstructUid', () => {
    const p = hero();
    const moveset = {
      chains: {
        basic: [{ kind: 'light', element: 'fire' }, { uid: 'keep', kind: 'heavy', element: 'fire' }],
        primary: { moves: [{ kind: 'medium', form: 'strike', elements: ['fire'] }], payment: 'mana' },
      },
      slots: { basic: 2, primary: 1 },
      bought: {},
    } as const;
    const [minted, q] = mintMoveset(p, moveset);
    expect(q.nextConstructUid).toBe(p.nextConstructUid + 2);
    expect(uids(minted.chains.basic!)).toEqual([`c${p.nextConstructUid}`, 'keep']);
    expect(uids(minted.chains.primary!.moves)).toEqual([`c${p.nextConstructUid + 1}`]);
    expect(minted.slots).toEqual(moveset.slots);
  });
});
