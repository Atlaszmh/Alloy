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

describe("a weapon's salvage (salvage-yield.ts, profile.ts)", () => {
  /**
   * A Fire hero with an uncommon sword in the bag, built up first: a bought
   * Primary slot, Quick I in a socket on its first Primary construct and
   * Chain I on its first blow. 7 constructs: 3 blows, 3 Strikes, a Ward.
   */
  function built(): DelveProfile {
    let p = equipItem(registry, banked(hero(), weapon('w1', 'sword', 'uncommon')), 'w1');
    p = addSlot(registry, p, 'primary').profile;
    p = openSocket(registry, p, 'primary', 0).profile;
    p = socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
    p = openSocket(registry, p, 'basic', 0).profile;
    p = socketRune(registry, p, 'basic', 0, 0, { id: 'chain', tier: 1 }).profile;
    expect(primary(p)).toHaveLength(3);
    expect(socketsOf(primary(p)[0])).toEqual([{ id: 'quick', tier: 1 }]);
    return unequipSlot(registry, p, 'weapon');
  }

  it('its constructs go to the bag with their runes; one Link per bought slot; the pouch is untouched', () => {
    const p = built();
    const w = p.bag.find((i) => i.uid === 'w1')!;
    const y = salvageYield(registry, p, w);
    expect(y.constructs).toHaveLength(7);
    expect(y.links).toBe(1);
    expect(y.runes).toEqual([{ id: 'chain', tier: 1 }, { id: 'quick', tier: 1 }]);
    const res = salvageItems(registry, p, ['w1']);
    expect([res.count, res.links, res.runes, res.destroyed]).toEqual([1, 1, [], []]);
    expect(uids(res.constructs).sort()).toEqual(uids(y.constructs).sort());
    expect(res.profile.links).toBe(p.links + 1);
    expect(res.profile.runes).toEqual(p.runes);
    expect(uids(res.profile.constructs).sort()).toEqual(uids(y.constructs).sort());
    const socketed = res.profile.constructs.filter((c) => socketsOf(c).some((r) => r));
    expect(socketed.map((c) => socketsOf(c)[0]!.id).sort()).toEqual(['chain', 'quick']);
    expect(res.profile.bag.some((i) => i.uid === 'w1')).toBe(false);
    expect(res.profile.forgeCount).toBe(p.forgeCount + 1);
  });

  it('under autoSalvagePlain only the socketed constructs reach the bag', () => {
    const res = salvageItems(registry, { ...built(), autoSalvagePlain: true }, ['w1']);
    expect(res.constructs).toHaveLength(7);
    expect(res.profile.constructs).toHaveLength(2);
  });

  it("mid-dive (a full bag) they ride the floor's haul with uids, runes and all, and reach no bag", () => {
    const p = startDive(registry, hero(), 1);
    const full = { ...p, bag: Array.from({ length: bal.loot.bagSize }, (_, i) => ring(`r${i}`)) };
    const res = addLootToBag(registry, full, [weapon('w9', 'bow', 'magic')]);
    expect(res.bagFull).toBe(true);
    expect(res.constructs.length).toBeGreaterThanOrEqual(5);
    expect(res.constructs.every((c) => !!c.uid)).toBe(true);
    expect(res.profile.dive!.haul.constructs).toEqual(res.constructs);
    expect(res.profile.constructs).toEqual([]);
    expect(res.profile.nextConstructUid).toBeGreaterThan(full.nextConstructUid);
  });

  it("a completed floor moves them to banked; banking reports them (BankResult.constructs)", () => {
    const p = startDive(registry, hero(), 1);
    const full = { ...p, bag: Array.from({ length: bal.loot.bagSize }, (_, i) => ring(`r${i}`)) };
    // A world's first bank starts the haul afresh, so the drop melts in the floor's own bank.
    const world = beginFloor(registry, full);
    world.pending.items.push(weapon('w9', 'bow', 'magic'));
    const done = completeFloor(registry, full, world);
    expect(done.bagFull).toBe(true);
    expect(done.constructs.length).toBeGreaterThanOrEqual(5);
    expect(done.profile.dive!.haul.constructs).toEqual([]);
    expect(uids(done.profile.dive!.banked.constructs)).toEqual(uids(done.constructs));
  });
});
