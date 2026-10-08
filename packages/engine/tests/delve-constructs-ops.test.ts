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

describe('the settle (dive.ts)', () => {
  const loss = bal.crafting.deathLoss;
  /** Diving at depth 1 with `n` constructs banked (the first two socketed) and two in the floor's haul. */
  function holding(n = 20, over: Partial<DelveProfile> = {}): DelveProfile {
    const p = startDive(registry, hero(over), 1);
    const cs = Array.from({ length: n }, (_, i) => strike(`b${i}`));
    cs[0] = { ...cs[0], runes: [{ id: 'quick', tier: 1 }] };
    cs[1] = { ...cs[1], runes: [null] };
    const dive = p.dive!;
    return {
      ...p,
      dive: {
        ...dive,
        banked: { ...dive.banked, scrap: 100, constructs: cs },
        haul: { ...dive.haul, constructs: [strike('h0'), strike('h1')] },
      },
    };
  }

  it('an extract puts every banked construct in the bag, once; the haul is already banked by then', () => {
    const p = holding();
    const out = settleDive(registry, p, 'extract');
    expect(uids(out.constructs)).toEqual(uids(p.dive!.banked.constructs));
    expect(out.dive).toMatchObject({ settled: true, lost: null });
    expect(uids(out.dive!.banked.constructs)).toEqual(uids(p.dive!.banked.constructs));
    expect(settleDive(registry, out, 'death')).toBe(out);
    // Settled, they sit on `banked` (the summary's) and in the bag until closeDive: the save reads back as it is.
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(out)))).toEqual({ profile: out });
  });

  it("a death loses the haul's outright and each banked one at deathLoss, drawn after the counts, recorded in lost", () => {
    const p = holding();
    const out = settleDive(registry, p, 'death');
    const { banked: kept, lost } = out.dive!;
    expect(settleDive(registry, p, 'death')).toEqual(out);
    expect(uids(lost!.constructs).slice(0, 2)).toEqual(['h0', 'h1']);
    const gone = uids(lost!.constructs).slice(2);
    expect(gone.length).toBeGreaterThan(2);
    expect(gone.length).toBeLessThan(18);
    expect([...uids(kept.constructs), ...gone].sort()).toEqual(uids(p.dive!.banked.constructs).sort());
    expect(uids(out.constructs)).toEqual(uids(kept.constructs));
    // Today's draws come first: the scrap share is what the same settle gives with no construct banked.
    const bare = { ...p, dive: { ...p.dive!, banked: { ...p.dive!.banked, constructs: [] }, haul: emptyHaul() } };
    expect(kept.scrap).toBe(settleDive(registry, bare, 'death').dive!.banked.scrap);
    expect(100 - kept.scrap === Math.floor(100 * loss) || 100 - kept.scrap === Math.ceil(100 * loss)).toBe(true);
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(out)))).toEqual({ profile: out });
  });

  it('Insurance takes its points off the constructs too; at a loss of 0 every one is kept', () => {
    const insured: Buff = { boon: 'insurance', tier: 3, effect: { deathLoss: loss } };
    const p = holding();
    const out = settleDive(registry, { ...p, dive: { ...p.dive!, diveBuffs: [insured] } }, 'death');
    expect(uids(out.dive!.banked.constructs)).toEqual(uids(p.dive!.banked.constructs));
    expect(uids(out.dive!.lost!.constructs)).toEqual(['h0', 'h1']);
  });

  it('under autoSalvagePlain the plain banked constructs are dropped at the settle, the socketed kept', () => {
    const out = settleDive(registry, holding(20, { autoSalvagePlain: true }), 'extract');
    expect(uids(out.constructs)).toEqual(['b0', 'b1']);
    const dead = settleDive(registry, holding(20, { autoSalvagePlain: true }), 'death');
    expect(dead.constructs.every((c) => !isPlain(c))).toBe(true);
    expect(dead.constructs.length + dead.dive!.lost!.constructs.filter((c) => !isPlain(c)).length).toBe(2);
    // What was lost is recorded lost, plain or not: the drop is only on what reaches the bag.
    const lost = dead.dive!.lost!.constructs;
    expect(uids(lost).slice(0, 2)).toEqual(['h0', 'h1']);
    expect(lost.filter(isPlain).length).toBeGreaterThan(2);
  });
});

describe('applyDraft (constructs.ts)', () => {
  const { editDust, elementDust } = bal.movesets;

  it('the save as it stands applies for nothing and changes nothing but the Apply events', () => {
    const p = hero();
    const res = applyDraft(registry, p, asIs(p));
    expect(res.ok).toBe(true);
    expect([res.profile.manaDust, res.profile.links, res.profile.scrap]).toEqual([500, 20, 2000]);
    expect(worn(res.profile)).toEqual(worn(p));
    expect(res.profile.constructs).toEqual([]);
    expect(draftRefusal(registry, p, asIs(p))).toBeNull();
  });

  it('unsocketing is free: the construct goes to the bag as it was, the chain closes up', () => {
    const p = hero();
    const [a, b] = primary(p);
    const res = applyDraft(registry, p, {
      chains: { primary: { moves: [b], payment: 'mana' } },
      bag: [a],
    });
    expect(res.ok).toBe(true);
    expect(uids(primary(res.profile))).toEqual([b.uid]);
    expect(res.profile.constructs).toEqual([a]);
    expect(res.profile.manaDust).toBe(500);
    expect(res.profile.nextConstructUid).toBe(p.nextConstructUid);
  });

  it('placing from the bag is free, a reorder free; both together still free', () => {
    const p = hero();
    const [a, b] = primary(p);
    const out = applyDraft(registry, p, { chains: { primary: { moves: [b], payment: 'mana' } }, bag: [a] }).profile;
    const back = applyDraft(registry, out, { chains: { primary: { moves: [a, b], payment: 'mana' } }, bag: [] });
    expect(back.ok).toBe(true);
    expect(uids(primary(back.profile))).toEqual([a.uid, b.uid]);
    expect(back.profile.constructs).toEqual([]);
    expect(back.profile.manaDust).toBe(500);
    const swapped = applyDraft(registry, p, { chains: { primary: { moves: [b, a], payment: 'mana' } }, bag: [] });
    expect(uids(primary(swapped.profile))).toEqual([b.uid, a.uid]);
    expect(swapped.profile.manaDust).toBe(500);
  });

  it('a placed construct keeps its runes; its edits in the same Apply are priced as a kept construct', () => {
    let p = hero();
    p = openSocket(registry, p, 'primary', 0).profile;
    p = socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
    const [a, b] = primary(p);
    const out = applyDraft(registry, p, { chains: { primary: { moves: [b], payment: 'mana' } }, bag: [a] }).profile;
    expect(socketsOf(out.constructs[0])).toEqual([{ id: 'quick', tier: 1 }]);
    const heavy = { ...a, kind: 'heavy' as const };
    const back = applyDraft(registry, out, { chains: { primary: { moves: [b, heavy], payment: 'mana' } }, bag: [] });
    expect(back.ok).toBe(true);
    expect(primary(back.profile)[1]).toEqual(heavy);
    expect(back.profile.manaDust).toBe(out.manaDust - editDust);
    expect(back.profile.runes).toEqual(out.runes);
  });

  it("a new construct (no uid) is minted and priced; a changed element set elementDust; the bag's are unchanged", () => {
    const p = hero();
    const [a, b] = primary(p);
    const fresh: Move = { kind: 'light', form: 'strike', elements: ['fire'] };
    const res = applyDraft(registry, p, {
      chains: { primary: { moves: [a, b, fresh], payment: 'mana' } },
      bag: [],
    });
    expect(res.ok).toBe(false); // the common sword's Primary has 2 slots
    const roomy = addSlot(registry, p, 'primary').profile;
    const made = applyDraft(registry, roomy, {
      chains: { primary: { moves: [a, b, fresh], payment: 'mana' } },
      bag: [],
    });
    expect(made.ok).toBe(true);
    expect(primary(made.profile)[2]).toEqual({ ...fresh, uid: `c${roomy.nextConstructUid}` });
    expect(made.profile.manaDust).toBe(roomy.manaDust - editDust);
    const bound = bindSecondary(registry, made.profile, 'frost').profile;
    const frost = applyDraft(registry, bound, {
      chains: { primary: { moves: [{ ...a, elements: ['frost'] }, b, primary(bound)[2]], payment: 'mana' } },
      bag: [],
    });
    expect(frost.profile.manaDust).toBe(bound.manaDust - elementDust);
  });

  it('refuses a uid in two places, an unknown uid, a construct of another skill, and a class the weapon cannot express', () => {
    const p = hero();
    const [a, b] = primary(p);
    const blow = basic(p)[0];
    expect(draftRefusal(registry, p, { chains: { primary: { moves: [a, b], payment: 'mana' } }, bag: [a] })).toBe('A construct is in one place');
    expect(draftRefusal(registry, p, { chains: { primary: { moves: [a, { ...b, uid: 'c999' }], payment: 'mana' } }, bag: [] })).toBe('Unknown construct c999');
    expect(draftRefusal(registry, p, { chains: { primary: { moves: [a, b], payment: 'mana' } }, bag: [{ kind: 'light', element: 'fire' }] })).toBe('Nothing new is made in the bag');
    const bagged = { ...p, constructs: [{ uid: 'cb', kind: 'medium', form: 'bolt', elements: ['fire'] } as Move, { ...blow, uid: 'cw' }] };
    expect(draftRefusal(registry, bagged, { chains: { primary: { moves: [a, { ...blow, uid: 'cw' } as unknown as Move], payment: 'mana' } }, bag: [b, bagged.constructs[0]] })).toBe('Not a primary construct');
    expect(draftRefusal(registry, bagged, { chains: { primary: { moves: [a, bagged.constructs[0]], payment: 'mana' } }, bag: [b, bagged.constructs[1]] })).toBe("A sword can't express Bolt");
  });

  it('a dropped construct must be plain; under autoSalvagePlain a displaced plain one is deleted at Apply, a socketed one kept', () => {
    let p = hero();
    const [a, b] = primary(p);
    const dropped = applyDraft(registry, p, { chains: { primary: { moves: [b], payment: 'mana' } }, bag: [] });
    expect(dropped.ok).toBe(true);
    expect(dropped.profile.constructs).toEqual([]);
    p = openSocket(registry, p, 'primary', 0).profile;
    const socketed = primary(p)[0];
    expect(socketed.uid).toBe(a.uid);
    expect(draftRefusal(registry, p, { chains: { primary: { moves: [b], payment: 'mana' } }, bag: [] })).toBe('Every construct is kept: unsocket it to the bag');
    const auto = { ...p, autoSalvagePlain: true };
    const out = applyDraft(registry, auto, { chains: { primary: { moves: [], payment: 'mana' } }, bag: [socketed, b] });
    expect(out.ok).toBe(true);
    expect(out.profile.constructs).toEqual([socketed]);
    expect(primary(out.profile)).toEqual([]);
    // Already in the bag, a plain construct stays through an Apply that doesn't touch it.
    const again = applyDraft(registry, { ...out.profile, constructs: [socketed, b] }, asIs({ ...out.profile, constructs: [socketed, b] }));
    expect(again.profile.constructs).toEqual([socketed, b]);
  });

  it('a chain the draft leaves out is unchanged; a bag entry still sitting in it is a uid in two places; the Basic keeps one blow', () => {
    const p = hero();
    const [a] = primary(p);
    expect(draftRefusal(registry, p, { chains: {}, bag: [a] })).toBe('A construct is in one place');
    expect(draftRefusal(registry, p, { chains: { basic: [] }, bag: basic(p) })).toBe('A chain holds 1 to 3 moves');
    expect(applyDraft(registry, startDive(registry, p, 1), asIs(p)).reason).toBe('Chains can only change between dives');
  });
});

describe('placeConstruct and unsocketConstruct (constructs.ts)', () => {
  it('unsocket: to the bag, free; the chain closes up; the Basic keeps one blow', () => {
    const p = hero();
    const [a, b] = primary(p);
    const res = unsocketConstruct(registry, p, 'primary', 0);
    expect(res.ok).toBe(true);
    expect(uids(primary(res.profile))).toEqual([b.uid]);
    expect(res.profile.constructs).toEqual([a]);
    expect(res.profile.manaDust).toBe(500);
    expect(unsocketConstruct(registry, p, 'primary', 2).reason).toBe('Pick a move the chain holds');
    let one = p;
    one = unsocketConstruct(registry, one, 'basic', 2).profile;
    one = unsocketConstruct(registry, one, 'basic', 1).profile;
    expect(basic(one)).toHaveLength(1);
    expect(unsocketConstruct(registry, one, 'basic', 0).reason).toBe('The Basic keeps at least one blow');
    expect(one.constructs).toHaveLength(2);
  });

  it('place: into a free slot at its end, or over a construct, which goes to the bag; free; the wrong skill or class refused', () => {
    const p = hero();
    const [a, b] = primary(p);
    const out = unsocketConstruct(registry, p, 'primary', 0).profile;
    const over = placeConstruct(registry, out, a.uid!, 'primary', 0);
    expect(over.ok).toBe(true);
    expect(uids(primary(over.profile))).toEqual([a.uid]);
    expect(over.profile.constructs).toEqual([b]);
    const end = placeConstruct(registry, over.profile, b.uid!, 'primary', 1);
    expect(uids(primary(end.profile))).toEqual([a.uid, b.uid]);
    expect(end.profile.constructs).toEqual([]);
    expect(end.profile.manaDust).toBe(500);
    expect(placeConstruct(registry, out, a.uid!, 'primary', 2).reason).toBe('No slot there');
    expect(placeConstruct(registry, out, a.uid!, 'basic', 0).reason).toBe('Not a basic construct');
    expect(placeConstruct(registry, out, a.uid!, 'defensive', 0).reason).toBe('This weapon has no defensive slots');
    expect(placeConstruct(registry, out, 'c999', 'primary', 0).reason).toBe('Not in your bag');
    const bolt: Move = { uid: 'cb', kind: 'medium', form: 'bolt', elements: ['fire'] };
    expect(placeConstruct(registry, { ...out, constructs: [bolt] }, 'cb', 'primary', 1).reason).toBe("A sword can't express Bolt");
  });

  it('under autoSalvagePlain a plain construct placed over is deleted at once', () => {
    const p = hero();
    const [a] = primary(p);
    const out = { ...unsocketConstruct(registry, p, 'primary', 0).profile, autoSalvagePlain: true };
    expect(isPlain(primary(out)[0])).toBe(true);
    const over = placeConstruct(registry, out, a.uid!, 'primary', 0);
    expect(uids(primary(over.profile))).toEqual([a.uid]);
    expect(over.profile.constructs).toEqual([]);
  });

  it('a dormant construct placed by Move all may be reordered, never placed from the bag; place never checks the pair', () => {
    const p = hero();
    const frost: Move = { uid: 'cf', kind: 'medium', form: 'strike', elements: ['frost'] };
    const out = placeConstruct(registry, { ...p, constructs: [frost] }, 'cf', 'primary', 1);
    expect(out.ok).toBe(true);
    expect(primary(out.profile)[1]).toEqual(frost);
    expect(out.profile.manaDust).toBe(500);
  });
});

describe('moveAll (constructs.ts)', () => {
  /** A hero whose sword holds a bought third Primary slot and Quick I on its first Strike, a magic bow in the bag. */
  function ready(): DelveProfile {
    let p = banked(hero(), weapon('bow1', 'bow', 'magic', 7));
    p = addSlot(registry, p, 'primary').profile;
    p = openSocket(registry, p, 'primary', 0).profile;
    return socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
  }

  it("every construct goes onto the target slot for slot, the target's own to the bag, its class-blind ones dormant; the old weapon refills plain, minted; no scrap", () => {
    const p = ready();
    const bow = p.bag.find((i) => i.uid === 'bow1')!;
    const bowSet = movesetOf(registry, bow);
    // The sword moves into the Basic and the Primary alone: the bow's own constructs there are displaced;
    // a chain the sword moves nothing into (its Defensive, the Ward) keeps the bow's own.
    const moved = CHAIN_SKILLS.filter((s) => worn(p).chains[s]);
    const bowOwn = uids(moved.flatMap((s) => movesOf(bowSet.chains[s])));
    const swordUids = uids(CHAIN_SKILLS.flatMap((s) => movesOf(worn(p).chains[s])));
    const res = moveAll(registry, p, 'bow1');
    expect(res.ok).toBe(true);
    const q = res.profile;
    expect(q.equipped.weapon!.uid).toBe('bow1');
    expect(res.item).toBe(q.equipped.weapon);
    // Slot for slot: the bow's Primary slots hold the sword's first Strikes (dormant: a bow can't express Strike), its Basic the sword's blows.
    const onBow = CHAIN_SKILLS.flatMap((s) => movesOf(worn(q).chains[s]));
    const dormant = dormantUids(registry, q.equipped.weapon!);
    expect(uids(primary(q)).every((u) => swordUids.includes(u) && dormant.has(u))).toBe(true);
    expect(uids(basic(q)).every((u) => swordUids.includes(u))).toBe(true);
    expect(socketsOf(primary(q)[0])).toEqual([{ id: 'quick', tier: 1 }]);
    // Past the bow's slots and the bow's own: in the bag (every plain construct kept here).
    const bagUids = uids(q.constructs);
    for (const u of bowOwn) expect(bagUids).toContain(u);
    for (const u of swordUids) expect(bagUids.includes(u) || onBow.some((c) => c.uid === u)).toBe(true);
    expect(moved).toEqual(['basic', 'primary']);
    expect(worn(q).chains.defensive).toEqual(bowSet.chains.defensive);
    expect(new Set(uidsOf(q)).size).toBe(uidsOf(q).length);
    // The old sword: in the bag, its slots kept (the bought one too), each refilled plain with a fresh uid.
    const old = q.bag.find((i) => i.uid === p.equipped.weapon!.uid)!;
    const oldSet = movesetOf(registry, old);
    expect(oldSet.slots).toEqual(worn(p).slots);
    expect(oldSet.bought).toEqual(worn(p).bought);
    const refill = CHAIN_SKILLS.flatMap((s) => movesOf(oldSet.chains[s]));
    expect(refill.every((c) => isPlain(c) && !!c.uid && !swordUids.includes(c.uid))).toBe(true);
    expect(q.nextConstructUid).toBe(p.nextConstructUid + refill.length);
    expect([q.scrap, q.links, q.manaDust, q.runes]).toEqual([p.scrap, p.links, p.manaDust, p.runes]);
  });

  it('under autoSalvagePlain the displaced plain constructs are deleted, the socketed kept', () => {
    const p = { ...ready(), autoSalvagePlain: true };
    const q = moveAll(registry, p, 'bow1').profile;
    expect(q.constructs.every((c) => !isPlain(c))).toBe(true);
  });

  it('refuses mid-dive, unarmed and anything but a bag weapon', () => {
    const p = ready();
    expect(moveAll(registry, startDive(registry, p, 1), 'bow1').reason).toBe('Move your constructs between dives');
    expect(moveAll(registry, unequipSlot(registry, p, 'weapon'), 'bow1').reason).toBe('Equip a weapon to build your moves');
    expect(moveAll(registry, p, 'nope').reason).toBe('Move onto a weapon in your bag');
    expect(moveAll(registry, { ...p, bag: [...p.bag, ring('r1')] }, 'r1').reason).toBe('Move onto a weapon in your bag');
  });
});

describe('salvageConstruct (constructs.ts)', () => {
  const { pullScrap } = bal.runes;
  /** A hero with its first Strike (Quick I socketed) and a plain blow in the bag. */
  function bagged(): DelveProfile {
    let p = hero();
    p = openSocket(registry, p, 'primary', 0).profile;
    p = socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
    p = unsocketConstruct(registry, p, 'primary', 0).profile;
    return unsocketConstruct(registry, p, 'basic', 2).profile;
  }

  it("a bag construct: its runes to the pouch at the pull price, salvageDust Dust, nothing else; refused short of the scrap", () => {
    const p = bagged();
    const [socketed, blow] = p.constructs;
    const res = salvageConstruct(registry, p, socketed.uid!, { unsocket: 'pay' });
    expect(res.ok).toBe(true);
    expect(res.runes).toEqual([{ id: 'quick', tier: 1 }]);
    expect(res.profile.runes.quick).toEqual([p.runes.quick[0] + 1, 0, 0, 0, 0]);
    expect(res.profile.scrap).toBe(p.scrap - pullScrap[0]);
    expect(res.profile.manaDust).toBe(p.manaDust + bal.movesets.salvageDust);
    expect(res.profile.links).toBe(p.links);
    expect(res.profile.constructs).toEqual([blow]);
    const plain = salvageConstruct(registry, res.profile, blow.uid!, { unsocket: 'pay' });
    expect([plain.ok, plain.runes, plain.profile.scrap, plain.profile.constructs]).toEqual([true, [], res.profile.scrap, []]);
    expect(salvageConstruct(registry, { ...p, scrap: pullScrap[0] - 1 }, socketed.uid!, { unsocket: 'pay' }).reason).toBe('Not enough scrap to pull its runes');
  });

  it("in 'destroy' (the dev chip) the runes are destroyed for nothing", () => {
    const p = bagged();
    const res = salvageConstruct(registry, p, p.constructs[0].uid!, { unsocket: 'destroy' });
    expect([res.runes, res.destroyed, res.profile.scrap]).toEqual([[], [{ id: 'quick', tier: 1 }], p.scrap]);
    expect(res.profile.runes).toEqual(p.runes);
  });

  it("the balance's mode is the default (ships 'pay'); refused mid-dive and for a uid not in the bag", () => {
    const p = bagged();
    expect(bal.runes.unsocket).toBe('pay');
    expect(salvageConstruct(registry, p, p.constructs[0].uid!).profile.scrap).toBe(p.scrap - pullScrap[0]);
    expect(salvageConstruct(registry, startDive(registry, p, 1), p.constructs[0].uid!).reason).toBe('Salvage between dives');
    expect(salvageConstruct(registry, p, primary(p)[0].uid!).reason).toBe('Not in your bag');
  });
});

describe("the stops' power-ups (stops.ts)", () => {
  const ALL: DiveStop = { kind: 'powerups', offers: ['equip', 'slot', 'move', 'upgrade', 'rune'], taken: false };
  /** `p` on the door screen after depth 1, holding every power-up. */
  function atStop(p: DelveProfile): DelveProfile {
    const d = startDive(registry, p, 1);
    return { ...d, dive: { ...d.dive!, phase: 'choosing', depthsCleared: 1, doorChoices: ['winding'], stop: ALL } };
  }

  it("'move' adjusts a construct in place: its uid, sockets and runes stay, one editDust, no uid minted", () => {
    let p = hero();
    p = openSocket(registry, p, 'primary', 0).profile;
    p = socketRune(registry, p, 'primary', 0, 0, { id: 'quick', tier: 1 }).profile;
    const at = atStop(p);
    const was = primary(at)[0];
    const res = takeStop(registry, at, {
      kind: 'move',
      skill: 'primary',
      index: 0,
      move: { kind: 'heavy', form: 'strike', elements: ['fire'], uid: 'stale', runes: [] } as Move,
    });
    expect(res.ok).toBe(true);
    const now = primary(res.profile)[0];
    expect(now).toEqual({ ...was, kind: 'heavy' });
    expect(res.profile.nextConstructUid).toBe(at.nextConstructUid);
    expect(res.profile.manaDust).toBe(at.manaDust - bal.movesets.editDust);
    expect(res.profile.dive!.stop!.taken).toBe(true);
  });

  it("'slot' adds a bought slot under the ceiling, plain-filled; it never opens a skill", () => {
    const at = atStop(hero());
    const slot = takeStop(registry, at, { kind: 'slot', skill: 'primary' });
    expect(slot.ok).toBe(true);
    expect(worn(slot.profile).slots.primary).toBe(3);
    expect(worn(slot.profile).bought?.primary).toBe(1);
    expect(isPlain(primary(slot.profile)[2])).toBe(true);
    expect(primary(slot.profile)[2].uid).toBe(`c${at.nextConstructUid}`);
    const open = takeStop(registry, at, { kind: 'slot', skill: 'defensive' });
    expect(open.ok).toBe(false);
    expect(stopKinds(registry, { ...hero(), links: 0 })).not.toContain('slot');
  });

  it("'equip' equips a bag weapon with its own constructs; the old one keeps its own", () => {
    const p = banked(hero(), weapon('bow1', 'bow', 'uncommon'));
    const at = atStop(p);
    const res = takeStop(registry, at, { kind: 'equip', uid: 'bow1' });
    expect(res.ok).toBe(true);
    expect(res.profile.equipped.weapon!.uid).toBe('bow1');
    expect(primary(res.profile).every((m) => m.form === 'bolt' && !!m.uid)).toBe(true);
    expect(res.profile.constructs).toEqual([]);
    expect(new Set(uidsOf(res.profile)).size).toBe(uidsOf(res.profile).length);
  });

  it("'rune' sockets a pouch rune into an empty socket, as before", () => {
    const at = atStop(openSocket(registry, hero(), 'primary', 1).profile);
    const res = takeStop(registry, at, { kind: 'rune', skill: 'primary', index: 1, socket: 0, rune: { id: 'chain', tier: 1 } });
    expect(res.ok).toBe(true);
    expect(socketsOf(primary(res.profile)[1])).toEqual([{ id: 'chain', tier: 1 }]);
    expect(primary(res.profile)[1].uid).toBe(primary(at)[1].uid);
  });
});

describe('the pair on constructs (pair.ts)', () => {
  it("chooseStartingMana replaces the starting weapon's constructs with plain ones in the primary, every slot refilled, minted; its runes by the parts rule; no Links", () => {
    const fresh = createDelveProfile(registry, 3);
    expect(fresh.pair.primary).toBeNull();
    // Give its sword a bought slot, a socket and a rune first, as a hand-edited save might.
    const sword = fresh.equipped.weapon!;
    const set = movesetOf(registry, sword);
    const [a, ...rest] = set.chains.primary!.moves;
    const tricked: DelveProfile = {
      ...fresh,
      equipped: {
        ...fresh.equipped,
        weapon: {
          ...sword,
          moveset: {
            ...set,
            chains: { ...set.chains, primary: { ...set.chains.primary!, moves: [{ ...a, kind: 'heavy', runes: [{ id: 'quick', tier: 2 }] }, ...rest] } },
            slots: { ...set.slots, primary: (set.slots.primary ?? 2) + 1 },
            bought: { ...set.bought, primary: 1 },
          },
        },
      },
    };
    const res = chooseStartingMana(registry, tricked, 'frost', { unsocket: 'pay' });
    expect(res.ok).toBe(true);
    const q = res.profile;
    const after = worn(q);
    expect(after.slots).toEqual(tricked.equipped.weapon!.moveset!.slots);
    expect(after.bought).toEqual({ ...set.bought, primary: 1 });
    const all = CHAIN_SKILLS.flatMap((s) => movesOf(after.chains[s]));
    expect(all).toHaveLength(3 + 3);
    expect(all.every((c) => isPlain(c) && !!c.uid)).toBe(true);
    expect(primary(q).every((m) => m.elements.join() === 'frost' && m.form === 'strike')).toBe(true);
    expect(basic(q).every((b) => b.element === 'frost')).toBe(true);
    expect(q.nextConstructUid).toBe(tricked.nextConstructUid + 6);
    expect(res.runes).toEqual([{ id: 'quick', tier: 2 }]);
    expect(q.runes.quick).toEqual([0, 1, 0, 0, 0]);
    expect([q.links, res.links, q.constructs]).toEqual([tricked.links, undefined, []]);
    expect(chooseStartingMana(registry, q, 'fire').reason).toBe('Your mana is already chosen');
  });

  it('a new save after the choice holds its slots plain-filled in the primary, each with a uid; the save round-trips', () => {
    const p = createDelveProfile(registry, 3, { primary: 'storm' });
    const all = CHAIN_SKILLS.flatMap((s) => movesOf(worn(p).chains[s]));
    expect(all.map((c) => ('element' in c ? c.element : c.elements.join()))).toEqual(Array(all.length).fill('storm'));
    expect(new Set(uids(all)).size).toBe(all.length);
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))).toEqual({ profile: p });
  });

  it("realign maps only the worn weapon's constructs; the bag's and a bag weapon's keep their elements", () => {
    let p = bindSecondary(registry, banked(hero(), weapon('bow1', 'bow', 'uncommon')), 'frost').profile;
    p = unsocketConstruct(registry, p, 'primary', 1).profile;
    const bagWas = p.constructs;
    const bowWas = movesetOf(registry, p.bag.find((i) => i.uid === 'bow1')!);
    const res = realign(registry, { ...p, manaDust: 999, scrap: 9999 }, { primary: 'storm' });
    expect(res.ok).toBe(true);
    expect(primary(res.profile).every((m) => m.elements.join() === 'storm')).toBe(true);
    expect(res.profile.constructs).toEqual(bagWas);
    expect(movesetOf(registry, res.profile.bag.find((i) => i.uid === 'bow1')!)).toEqual(bowWas);
    expect(res.fixed!.length).toBe(1 + basic(p).length);
  });
});
