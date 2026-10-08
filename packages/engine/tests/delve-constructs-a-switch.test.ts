import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { openSkill, openSkillPrice, forge } from '../src/delve/crafting.js';
import { startDive } from '../src/delve/dive.js';
import { draftRefusal, moveAll, applyDraft } from '../src/delve/constructs.js';
import { addSlot, movesetEditPrice, setChain, setChains, slotPrice } from '../src/delve/moveset.js';
import { chooseStartingMana } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  mintUid,
  parseDelveProfile,
  salvageItems,
  upgradeGear,
} from '../src/delve/profile.js';
import { draftPrice, openSocket } from '../src/delve/runes.js';
import { generateItem } from '../src/loot/item-generator.js';
import { withMaterial } from '../src/loot/materials.js';
import {
  defaultMoveset,
  heroChains,
  moveAllPreview,
  movesetOf,
  rollSocketedRunes,
  weaponParts,
} from '../src/loot/moveset.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { Chain, Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import { RARITY_ORDER, type GearItem, type Rarity } from '../src/types/gear.js';
import { chainsOf, withChains } from './fixtures/arena.js';

// The switch (the constructs spec §3): the slot table in play, constructs with uids, pricing by
// uid, class gating, Open a skill, bought-slot Links, the pull rule 'pay', MAX_SOCKETS on every
// weapon, a drop's socketed rune, Detonate's row, dormancy in heroChains and the Move all preview.

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const weapon = (rarity: Rarity, baseId: string, uid = `w-${baseId}-${rarity}`, seed = 3): GearItem =>
  generateItem(
    registry,
    { uid, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'fire' },
    new SeededRNG(seed).fork(uid),
  );
const uids = (p: DelveProfile) =>
  Object.values(movesetOf(registry, p.equipped.weapon!).chains).flatMap((c) =>
    Array.isArray(c) ? c.map((b) => b.uid) : c.moves.map((m) => m.uid),
  );

describe("a new save's sword", () => {
  it('holds its string and two Strike constructs, each with a uid, nothing bought', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const m = movesetOf(registry, p.equipped.weapon!);
    expect(m.slots).toEqual({ basic: 3, primary: 2 });
    expect(m.bought).toEqual({});
    expect(m.chains.primary!.moves.map((x) => [x.kind, x.form, x.elements])).toEqual([
      ['medium', 'strike', ['fire']],
      ['medium', 'strike', ['fire']],
    ]);
    const ids = uids(p);
    expect(ids.every((u) => typeof u === 'string' && u.startsWith('c'))).toBe(true);
    expect(new Set(ids).size).toBe(5);
    expect(p.nextConstructUid).toBeGreaterThanOrEqual(5);
    expect(p.nextUid).toBe(2); // the items' counter never moves for a construct
    expect([p.constructs, p.autoSalvagePlain]).toEqual([[], true]);
    // The choice of mana minted the sword's constructs afresh in the primary.
    expect(chainsOf(p).primary!.moves.every((x) => x.elements[0] === 'fire')).toBe(true);
    // Before the choice too (the Anvil asks): every construct has a uid.
    expect(uids(createDelveProfile(registry, 3)).every((u) => !!u)).toBe(true);
  });

  it("the slot table rules every rarity's defaults, the Basic's start its string", () => {
    const slots = (r: Rarity, base = 'sword') =>
      defaultMoveset(registry, { baseId: base, rarity: r }, 'fire').slots;
    expect(slots('common')).toEqual({ basic: 3, primary: 2 });
    expect(slots('uncommon')).toEqual({ basic: 3, primary: 2, defensive: 1 });
    expect(slots('rare')).toEqual({ basic: 3, primary: 3, defensive: 2, ultimate: 1 });
    expect(slots('legendary', 'maul')).toEqual({ basic: 2, primary: 4, defensive: 3, ultimate: 2 });
    expect(slots('epic', 'bow')).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 1 });
    expect(defaultMoveset(registry, { baseId: 'bow', rarity: 'epic' }, 'storm').chains.primary!.moves[0].form).toBe('bolt');
  });
});

describe('class gating and dormancy', () => {
  it("refuses a form the weapon's class can't express on a new or changed construct", () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const primary = chainsOf(p).primary!;
    const bolt = { ...primary, moves: primary.moves.map((m) => ({ ...m, form: 'bolt' as const })) };
    expect(setChain(registry, p, 'primary', bolt).reason).toBe("A sword can't express Bolt");
    const lance = { ...primary, moves: primary.moves.map((m) => ({ ...m, form: 'lance' as const })) };
    expect(setChain(registry, p, 'primary', lance).ok).toBe(true);
    const staff = { ...p, equipped: { ...p.equipped, weapon: weapon('common', 'staff') } };
    const strike: Chain = { moves: [{ kind: 'medium', form: 'strike', elements: ['fire'] }], payment: 'mana' };
    expect(setChain(registry, staff, 'primary', strike).reason).toBe("A staff can't express Strike");
  });

  it('a kept dormant construct may stay; heroChains skips it, and drops a chain left empty', () => {
    const bow = weapon('rare', 'bow');
    const m = movesetOf(registry, bow);
    const dormant: Move = { uid: 'c-d', kind: 'medium', form: 'strike', elements: ['fire'] };
    const live = { ...m.chains.primary!.moves[0], uid: 'c-l' };
    const held = {
      ...bow,
      moveset: {
        ...m,
        chains: {
          ...m.chains,
          primary: { ...m.chains.primary!, moves: [dormant, live] },
          ultimate: { moves: [{ uid: 'c-o', kind: 'medium', form: 'onslaught', elements: ['fire'] }], payment: 'charge' as const },
        },
      },
    };
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const p = { ...p0, equipped: { ...p0.equipped, weapon: held } };
    const chains = heroChains(registry, p.equipped, p.pair);
    expect(chains.primary!.moves.map((x) => x.uid)).toEqual(['c-l']);
    expect(chains.ultimate).toBeUndefined();
    expect(chains.defensive).toBeDefined();
    // Kept in place through an Apply that changes something else.
    const reordered = { ...held.moveset.chains.primary, moves: [live, dormant] };
    const res = setChain(registry, p, 'primary', reordered);
    expect(res.ok).toBe(true);
    expect(chainsOf(res.profile).primary!.moves.map((x) => x.uid)).toEqual(['c-l']);
    expect(movesetOf(registry, res.profile.equipped.weapon!).chains.primary!.moves.map((x) => x.uid)).toEqual(['c-l', 'c-d']);
    // A changed form on it is refused.
    const changed = { ...reordered, moves: [live, { ...dormant, form: 'whirl' as const }] };
    expect(setChain(registry, p, 'primary', changed).reason).toBe("A bow can't express Whirl");
  });
});

describe('pricing by uid', () => {
  const E = bal.movesets.editDust;
  const X = bal.movesets.elementDust;
  const mv = (uid: string | undefined, kind: Move['kind'], ...elements: Move['elements']): Move => ({
    ...(uid && { uid }),
    kind,
    form: 'strike',
    elements,
  });
  const chain = (...moves: Move[]): Chain => ({ moves, payment: 'mana' });
  const price = (old: Chain, next: Chain) =>
    movesetEditPrice(registry, { primary: old }, { primary: next });
  const A = mv('a', 'light', 'fire');
  const B = mv('b', 'medium', 'fire');
  const C = mv('c', 'heavy', 'storm');

  it('a reorder is free; a removal, a new construct and a changed shape or set each pay', () => {
    expect(price(chain(A, B, C), chain(A, B, C))).toBe(0);
    expect(price(chain(A, B, C), chain(C, A, B))).toBe(0);
    expect(price(chain(A, B, C), chain(A, C))).toBe(E);
    expect(price(chain(A, C), chain(A, mv(undefined, 'medium', 'fire'), C))).toBe(E);
    expect(price(chain(A, C), chain(A, mv('zz', 'medium', 'fire'), C))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, kind: 'heavy' }))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, form: 'lance' }))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, elements: ['storm'] }))).toBe(X);
    expect(price(chain(A, B), chain(A, { ...B, kind: 'heavy', elements: ['storm', 'fire'] }))).toBe(E + X);
    // Removed and a new one alike: two edits.
    expect(price(chain(A, B), chain(A, mv(undefined, 'medium', 'fire')))).toBe(2 * E);
    expect(price(chain(A), { moves: [A], payment: 'cast' })).toBe(E);
    // A new element set once per Apply; one a saved construct has, never.
    expect(price(chain(A, B), chain({ ...A, elements: ['nature'] }, { ...B, elements: ['nature'] }, mv(undefined, 'light', 'nature')))).toBe(X + E);
    expect(price(chain(A, C), chain(A, C, mv(undefined, 'light', 'storm')))).toBe(E);
  });

  it('setChains mints a uid for each new construct and keeps the rest; sameChain reads a reorder', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const p = { ...p0, manaDust: 99, stats: { ...p0.stats, dives: 1 } };
    const [a, b] = chainsOf(p).primary!.moves;
    const next = { ...chainsOf(p).primary!, moves: [b, a] };
    const moved = setChain(registry, p, 'primary', next);
    expect(moved.profile.manaDust).toBe(99);
    expect(chainsOf(moved.profile).primary!.moves.map((m) => m.uid)).toEqual([b.uid, a.uid]);
    const added = setChains(registry, { ...withChains(p, { primary: { ...next, moves: [a] } }), manaDust: 99 }, {
      primary: { ...next, moves: [a, { kind: 'heavy', form: 'strike', elements: ['fire'] }] },
    });
    expect(added.profile.manaDust).toBe(99 - E);
    const ids = chainsOf(added.profile).primary!.moves.map((m) => m.uid);
    expect(ids[0]).toBe(a.uid);
    expect(ids[1]).toMatch(/^c\d+$/);
    expect(ids[1]).not.toBe(b.uid);
  });
});

describe('slots: bought, the ceiling, Open a skill', () => {
  const rich = () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return { ...p, links: 99, scrap: 9999 };
  };

  it('addSlot counts as bought up to the ceiling; the basic chain at its ceiling has none to buy', () => {
    const p = rich();
    const sword = p.equipped.weapon!;
    expect(slotPrice(registry, sword, 'primary')).toEqual({ links: 2, scrap: 40 });
    expect(slotPrice(registry, sword, 'basic')).toBeNull(); // a common's string of 3 is its ceiling
    expect(slotPrice(registry, sword, 'defensive')).toBeNull(); // 0 slots: Open a skill's
    const one = addSlot(registry, p, 'primary');
    expect(one.ok).toBe(true);
    const m = movesetOf(registry, one.profile.equipped.weapon!);
    expect([m.slots.primary, m.bought.primary]).toEqual([3, 1]);
    expect(m.chains.primary!.moves[2]).toMatchObject({ kind: 'heavy', form: 'strike', elements: ['fire'] });
    expect(m.chains.primary!.moves[2].uid).toMatch(/^c\d+$/);
    expect(addSlot(registry, one.profile, 'primary').reason).toBe('This chain has every slot');
    expect(addSlot(registry, p, 'defensive').reason).toBe('Open this skill on the Temper bench');
  });

  it("Open a skill: a common sword's Defensive for the rarity's price, bought, plain-filled; the Ultimate's ceiling is 0", () => {
    const p0 = rich();
    const p = { ...p0, materials: withMaterial(p0.materials, { kind: 'flux', grade: 'uncommon' }, 5) };
    const sword = p.equipped.weapon!;
    const price = openSkillPrice(registry, sword);
    expect(price).toEqual({ flux: { uncommon: 2 }, links: 1, scrap: 40 });
    const res = openSkill(registry, p, sword.uid, 'defensive');
    expect(res.ok, res.reason).toBe(true);
    const m = movesetOf(registry, res.item!);
    expect([m.slots.defensive, m.bought.defensive]).toEqual([1, 1]);
    expect(m.chains.defensive).toEqual({
      moves: [{ uid: expect.stringMatching(/^c\d+$/), kind: 'medium', form: 'ward', elements: ['fire'] }],
      payment: 'mana',
    });
    expect(res.profile.materials.flux.uncommon).toBe(p.materials.flux.uncommon - 2);
    expect(res.profile).toMatchObject({ links: 98, scrap: 9999 - 40 });
    expect(res.profile.tutorial).toBeNull();
    expect(openSkill(registry, res.profile, sword.uid, 'defensive').reason).toBe('This skill is open already');
    expect(openSkill(registry, p, sword.uid, 'ultimate').reason).toBe("A common weapon can't open its ultimate");
    expect(openSkill(registry, p, p.equipped.chest!.uid, 'defensive').reason).toBe('Only a weapon opens a skill');
    expect(openSkill(registry, { ...p, links: 0 }, sword.uid, 'defensive').reason).toBe('Not enough Links');
    const noFlux = { ...p, materials: withMaterial(p.materials, { kind: 'flux', grade: 'uncommon' }, -p.materials.flux.uncommon) };
    expect(openSkill(registry, noFlux, sword.uid, 'defensive').reason).toBe('Not enough uncommon flux');
    expect(openSkill(registry, startDive(registry, p, 1), sword.uid, 'defensive').reason).toBe('Forge at the Anvil, between dives');
    // On a bag weapon too, and the rare's price is the rare row's.
    const rare = weapon('rare', 'axe', 'ax');
    const withRare = { ...p, bag: [rare], materials: withMaterial(p.materials, { kind: 'flux', grade: 'rare' }, 1) };
    expect(openSkillPrice(registry, rare).flux).toEqual({ rare: 1 });
    // A rare axe's Ultimate starts open (1); its Primary, Defensive too: nothing to open.
    expect(openSkill(registry, withRare, 'ax', 'ultimate').reason).toBe('This skill is open already');
  });

  it('salvage gives one Link per bought slot: a forged or found weapon, none', () => {
    const p = rich();
    const bought = addSlot(registry, p, 'primary').profile;
    const sword = bought.equipped.weapon!;
    expect(weaponParts(registry, sword).links).toBe(1);
    const inBag = { ...bought, equipped: { ...bought.equipped, weapon: weapon('rare', 'sword', 'other') }, bag: [sword] };
    expect(salvageItems(registry, inBag, [sword.uid]).links).toBe(1);
    for (const r of RARITY_ORDER) expect(weaponParts(registry, weapon(r, 'bow')).links).toBe(0);
  });

  it('an upgrade keeps the weapon as it is when every skill is at its start', () => {
    const p = rich();
    const res = upgradeGear(registry, p, p.equipped.weapon!.uid);
    expect(res.ok).toBe(true);
    expect(movesetOf(registry, res.item!)).toEqual(movesetOf(registry, p.equipped.weapon!));
  });
});

describe('sockets and runes', () => {
  it("every weapon's constructs take up to MAX_SOCKETS; the pull rule ships 'pay'", () => {
    expect(bal.runes.unsocket).toBe('pay');
    expect(bal.runes).not.toHaveProperty('socketCap');
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    let p = { ...p0, links: 99, scrap: 9999 };
    for (let i = 0; i < 3; i++) {
      const res = openSocket(registry, p, 'primary', 0);
      expect(res.ok, res.reason).toBe(true);
      p = res.profile;
    }
    expect(chainsOf(p).primary!.moves[0].runes).toEqual([null, null, null]);
    expect(openSocket(registry, p, 'primary', 0).reason).toBe('This move has every socket');
  });

  it("a drop's open socket may hold a rune, by rarity, on its own fork; the Detonate row fits the contact forms", () => {
    const det = registry.getRune('detonate');
    expect(det.fits).toEqual({ forms: ['strike', 'whirl', 'volley', 'lance', 'onslaught'], weapons: [] });
    expect(det.tiers.map((t) => t.detonate)).toEqual([0.25, 0.3, 0.35, 0.4, 0.45]);
    expect(det.load).toEqual([0.3, 0.35, 0.4, 0.45, 0.5]);
    let socketed = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const w = weapon('legendary', 'sword', 'l', seed);
      const runes = Object.values(movesetOf(registry, w).chains).flatMap((c) =>
        (Array.isArray(c) ? c : c.moves).flatMap((m) => m.runes ?? []),
      );
      if (runes.some((r) => r !== null)) socketed++;
      expect(runes.filter((r) => r !== null).length).toBeLessThanOrEqual(1);
    }
    expect(socketed).toBeGreaterThan(30);
    expect(socketed).toBeLessThan(120);
    for (let seed = 1; seed <= 50; seed++) {
      const w = weapon('uncommon', 'sword', 'u', seed);
      const m = movesetOf(registry, w);
      expect(rollSocketedRunes(registry, w, m, new SeededRNG(seed))).toBe(m);
    }
  });
});

describe('the bag, the haul and the load', () => {
  it('a banked weapon takes uids as it enters the bag; a drop has none', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const drop = weapon('rare', 'axe', 'drop');
    expect(movesetOf(registry, drop).chains.basic![0].uid).toBeUndefined();
    const res = addLootToBag(registry, p, [drop]);
    const banked = res.profile.bag.find((i) => i.uid === 'drop')!;
    const ids = Object.values(movesetOf(registry, banked).chains).flatMap((c) =>
      Array.isArray(c) ? c.map((b) => b.uid) : c.moves.map((m) => m.uid),
    );
    expect(ids.every((u) => /^c\d+$/.test(u!))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.profile.nextConstructUid).toBe(p.nextConstructUid + ids.length);
    expect(res.profile.nextUid).toBe(p.nextUid);
    // The next drop's uids follow: never the same.
    const again = addLootToBag(registry, res.profile, [{ ...drop, uid: 'drop2' }]);
    const twice = again.profile.bag.flatMap((i) =>
      Object.values(movesetOf(registry, i).chains).flatMap((c) =>
        Array.isArray(c) ? c.map((b) => b.uid) : c.moves.map((m) => m.uid),
      ),
    );
    expect(new Set(twice).size).toBe(twice.length);
  });

  it('a save round-trips with its constructs and bag; a uid twice or slots bought past the slots resets, a chain past its slots is refused', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const [uid, p1] = mintUid(p0);
    const p = { ...p1, constructs: [{ uid, kind: 'medium' as const, form: 'bolt' as const, elements: ['fire' as const], runes: [null] }] };
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
    const sword = p.equipped.weapon!;
    const m = sword.moveset!;
    const dup = { ...p, constructs: [{ ...p.constructs[0], uid: m.chains.basic![0].uid! }] };
    expect(parseDelveProfile(registry, json(dup))).toEqual({ reset: true });
    const overBought = { ...p, equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...m, bought: { primary: 5 } } } } };
    expect(parseDelveProfile(registry, json(overBought))).toEqual({ reset: true });
    const past = { ...p, equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...m, slots: { ...m.slots, primary: 1 } } } } };
    expect(parseDelveProfile(registry, json(past))).toBeNull(); // the schema itself: a chain past its slots
    // A saved construct without its uid is refused (save v14).
    const bare = json(p);
    for (const b of bare.equipped.weapon.moveset.chains.basic) delete b.uid;
    expect(parseDelveProfile(registry, bare)).toBeNull();
  });

  it('the choice of mana replaces the constructs with plain ones in the primary, minted', () => {
    const p = createDelveProfile(registry, 5);
    const before = uids(p);
    const chosen = chooseStartingMana(registry, p, 'frost').profile;
    expect(chosen.pair.primary).toBe('frost');
    expect(uids(chosen).some((u) => before.includes(u))).toBe(false);
    expect(chainsOf(chosen).primary!.moves.every((m) => m.elements[0] === 'frost')).toBe(true);
  });

  it('a forged weapon takes its constructs uids, its free extras not bought', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const p = { ...p0, scrap: 9999, patterns: ['sword'], materials: withMaterial(withMaterial(p0.materials, { kind: 'metal', metal: 'iron' }, 1), { kind: 'flux', grade: 'rare' }, 1) };
    const res = forge(registry, p, { baseId: 'sword', metal: 'iron', flux: 'rare', element: 'fire', shards: [] });
    expect(res.ok, res.reason).toBe(true);
    const m = movesetOf(registry, res.item!);
    expect(m.slots).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 1 });
    expect(m.bought).toEqual({});
    const ids = Object.values(m.chains).flatMap((c) => (Array.isArray(c) ? c.map((b) => b.uid) : c.moves.map((x) => x.uid)));
    expect(ids.every((u) => /^c\d+$/.test(u!))).toBe(true);
    expect(res.item!.uid).toBe(`g${p.nextUid}`);
  });
});

describe('moveAllPreview and the draft dry run', () => {
  it('moves the constructs slot for slot, the rest to the bag; the old weapon refills plain; dormant ones stay', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const worn = { ...p0.equipped.weapon!, moveset: { ...p0.equipped.weapon!.moveset!, bought: { primary: 1 } } };
    const bow = weapon('rare', 'bow', 'bow');
    const prev = moveAllPreview(registry, worn, bow);
    const own = movesetOf(registry, bow);
    // The sword's two Strikes sit in the bow's Primary (3 slots): dormant; the bow's own three go to the bag.
    expect(prev.moveset.chains.primary!.moves.map((m) => m.uid)).toEqual(worn.moveset.chains.primary!.moves.map((m) => m.uid));
    expect(prev.dormant.sort()).toEqual(worn.moveset.chains.primary!.moves.map((m) => m.uid).sort());
    expect(prev.toBag.filter((c) => 'form' in c && c.form === 'bolt')).toHaveLength(own.chains.primary!.moves.length);
    // The bow's Defensive and Ultimate keep their own constructs: nothing moved in.
    expect(prev.moveset.chains.defensive).toEqual(own.chains.defensive);
    expect(prev.moveset.chains.ultimate).toEqual(own.chains.ultimate);
    expect(prev.moveset.slots).toEqual(own.slots);
    // The old sword: its bought slot kept, plain-filled to its starts, no uids.
    expect(prev.old.slots).toEqual({ basic: 3, primary: 2 });
    expect(prev.old.bought).toEqual({ primary: 1 });
    expect(prev.old.chains.primary!.moves.every((m) => !m.uid && m.form === 'strike')).toBe(true);
    expect(prev.old.chains.basic).toHaveLength(3);
  });

  it("draftRefusal: a lost non-plain construct, a uid in two places, the wrong skill; the ops refuse 'Not yet'", () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const [uid, p1] = mintUid(p0);
    const socketed: Move = { uid, kind: 'medium', form: 'strike', elements: ['fire'], runes: [null] };
    const p = { ...p1, constructs: [socketed] };
    const chains = movesetOf(registry, p.equipped.weapon!).chains;
    expect(draftRefusal(registry, p, { chains: {}, bag: [socketed] })).toBeNull();
    expect(draftRefusal(registry, p, { chains: {}, bag: [] })).toBe(`${uid} would be lost`);
    expect(draftRefusal(registry, p, { chains: { primary: { ...chains.primary!, moves: [chains.primary!.moves[0], socketed] } }, bag: [socketed] })).toBe(`${uid} is in two places`);
    const ward = { ...socketed, form: 'ward' as const };
    expect(draftRefusal(registry, { ...p, constructs: [ward] }, { chains: { primary: { ...chains.primary!, moves: [chains.primary!.moves[0], ward] } }, bag: [] })).toBe(`${uid} is not a primary construct`);
    expect(draftRefusal(registry, p, { chains: { primary: { ...chains.primary!, moves: [] } }, bag: [socketed, ...chains.primary!.moves] })).toBeNull();
    expect(draftRefusal(registry, p, { chains: { basic: [] }, bag: [socketed, ...chains.basic!] })).toBe('A chain holds 1 to 3 moves');
    expect(moveAll(registry, p, 'x').reason).toBe('Not yet');
    expect(applyDraft(registry, p, { chains: {}, bag: [socketed] }).reason).toBe('Not yet');
    expect(draftPrice(registry, p, chains)).toMatchObject({ dust: 0, links: 0 });
    expect(equipItem(registry, { ...p, bag: [weapon('rare', 'bow', 'bow')] }, 'bow').equipped.weapon!.uid).toBe('bow');
  });
});
