import { describe, it, expect, afterEach } from 'vitest';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyHaul } from '../src/loot/materials.js';
import { formAllowed, isPlain, movesetOf, weaponParts } from '../src/loot/moveset.js';
import { socketsOf } from '../src/loot/runes.js';
import {
  applyDraft,
  moveAll,
  placeConstruct,
  salvageConstruct,
  unsocketConstruct,
} from '../src/delve/constructs.js';
import { forge, openSkill } from '../src/delve/crafting.js';
import { closeDive, settleDive, startDive } from '../src/delve/dive.js';
import { addSlot, movesOf } from '../src/delve/moveset.js';
import { bindSecondary } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  salvageItems,
  upgradeGear,
} from '../src/delve/profile.js';
import { openSocket, socketRune } from '../src/delve/runes.js';
import { ABILITY_SLOTS, CHAIN_SKILLS, type ChainSkill, type Construct, type Move } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gear.js';
import { registry } from './fixtures/arena.js';

// The constructs spec §8's invariant test: thousands of random operations. Constructs appear
// only from a drop, a forge, a new construct, a bought, opened or upgraded slot, or a plain
// refill, and disappear only through a salvage, a plain delete or a dive's death loss; runes
// are never made and leave only by a pull, a salvage at the pull price or a death; Links are
// minted only by a weapon's bought slots on salvage, never more than were paid.

afterEach(() => new Promise((r) => setTimeout(r)));

const RUNES = ['quick', 'chain', 'widen', 'echo', 'detonate'];
const WEAPONS = ['sword', 'axe', 'dagger', 'bow', 'staff', 'wand'];

/**
 * Every construct the save holds, by uid: the worn weapon's, the bag weapons', the bag's, and an
 * open dive's haul and banked (a settled dive's banked are in the bag already, kept for the summary:
 * A's `fitMovesets` skips them the same way).
 */
function held(p: DelveProfile): Map<string, Construct> {
  const weapons = [p.equipped.weapon, ...p.bag].filter((i): i is GearItem => i?.slot === 'weapon');
  const all = [
    ...weapons.flatMap((w) => CHAIN_SKILLS.flatMap((s) => movesOf(movesetOf(registry, w).chains[s]))),
    ...p.constructs,
    ...(p.dive && !p.dive.settled ? [...p.dive.haul.constructs, ...p.dive.banked.constructs] : []),
  ];
  const map = new Map<string, Construct>();
  for (const c of all) {
    expect(c.uid, 'a construct without a uid').toBeTruthy();
    expect(map.has(c.uid!), `uid ${c.uid} twice`).toBe(false);
    map.set(c.uid!, c);
  }
  return map;
}

/** Every rune the save holds, socketed anywhere or loose (the pouch, the haul's, the banked), as "id:tier" counts. */
function runes(p: DelveProfile, cs = held(p)): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string, tier: number, n = 1) => out.set(`${id}:${tier}`, (out.get(`${id}:${tier}`) ?? 0) + n);
  for (const c of cs.values()) for (const r of socketsOf(c)) if (r) add(r.id, r.tier);
  const pouches = [p.runes, ...(p.dive ? [p.dive.haul.runes, p.dive.banked.runes] : [])];
  for (const pouch of pouches)
    for (const [id, counts] of Object.entries(pouch)) counts.forEach((n, i) => n && add(id, i + 1, n));
  return out;
}

const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const links = (p: DelveProfile) => p.links + (p.dive ? p.dive.haul.links + p.dive.banked.links : 0);

const drop = (uid: string, rng: SeededRNG): GearItem =>
  generateItem(
    registry,
    {
      uid,
      ilvl: 5,
      rarity: RARITY_ORDER[rng.nextInt(0, 4)] as Rarity,
      slot: 'weapon',
      baseId: WEAPONS[rng.nextInt(0, WEAPONS.length - 1)],
      mana: rng.next() < 0.7 ? 'fire' : 'storm',
    },
    rng.fork(uid),
  );

/** A rich Fire+Frost hero at the Anvil after one dive, every pattern known, the bag never filling. */
function rich(seed: number, autoSalvagePlain: boolean): DelveProfile {
  let p = createDelveProfile(registry, seed, { primary: 'fire' });
  p = bindSecondary(registry, p, 'frost').profile;
  const materials = { ...p.materials, metals: { ...p.materials.metals, rusty: 999 }, flux: { uncommon: 99, magic: 99, rare: 99, epic: 99 } };
  return {
    ...p,
    stats: { ...p.stats, dives: 1 },
    scrap: 1e7,
    manaDust: 1e6,
    links: 30,
    runes: Object.fromEntries(RUNES.map((id) => [id, [20, 10, 5, 0, 0]])),
    materials,
    patterns: registry.getDelveData().bases.filter((b) => b.slot === 'weapon').map((b) => b.id),
    autoSalvagePlain,
  };
}

/**
 * What one op may do: `born` new uids; `gone` the uids a death lost (none otherwise), and `plain`
 * whether plain constructs may go too (the auto-salvage); `runesBorn` runes it may bring (a drop's
 * or a forge's socketed rune, `runeChance`); the Links it paid for slots (`addSlot`, `openSkill`)
 * and got back (a weapon's salvage).
 */
interface Allowed {
  born: boolean;
  gone: Set<string>;
  plain: boolean;
  runesBorn: boolean;
  paid: number;
  back: number;
}

const pick = <T>(xs: readonly T[], rng: SeededRNG): T | undefined => (xs.length ? xs[rng.nextInt(0, xs.length - 1)] : undefined);

/** One random op on `p`: the profile after it and what it was allowed to do. */
function step(p: DelveProfile, rng: SeededRNG, n: number): { p: DelveProfile; may: Allowed } {
  const none: Allowed = { born: false, gone: new Set(), plain: false, runesBorn: false, paid: 0, back: 0 };
  const auto = p.autoSalvagePlain;
  const weapon = p.equipped.weapon;
  const set = weapon ? movesetOf(registry, weapon) : null;
  const skills = set ? CHAIN_SKILLS.filter((s) => set.chains[s]) : [];
  const bagWeapons = p.bag.filter((i) => i.slot === 'weapon');
  switch (rng.nextInt(0, 15)) {
    case 0: {
      // A drop banks (it may roll a socketed rune: `rollSocketedRunes`).
      return { p: addLootToBag(registry, p, [drop(`d${n}`, rng)]).profile, may: { ...none, born: true, runesBorn: true } };
    }
    case 1: {
      // A forge.
      const grade = pick(['uncommon', 'magic', 'rare', 'epic'] as const, rng)!;
      const res = forge(registry, p, {
        baseId: pick(WEAPONS, rng)!,
        metal: 'rusty',
        flux: rng.next() < 0.8 ? grade : undefined,
        element: 'fire',
        shards: [],
      });
      // A forge follows a drop's rolls (the spec's §3.5), so it may bring a rune too.
      return { p: res.profile, may: { ...none, born: res.ok, runesBorn: res.ok } };
    }
    case 2: {
      const target = pick(bagWeapons, rng);
      return { p: target ? equipItem(registry, p, target.uid) : p, may: none };
    }
    case 3: {
      // Place a bag construct.
      const c = pick(p.constructs, rng);
      if (!c || !set) return { p, may: none };
      const skill = 'element' in c ? 'basic' : registry.getForm(c.form).slot;
      const moves = movesOf(set.chains[skill]);
      const res = placeConstruct(registry, p, c.uid!, skill, rng.nextInt(0, moves.length));
      return { p: res.profile, may: { ...none, plain: res.ok && auto } };
    }
    case 4: {
      const skill = pick(skills, rng);
      if (!skill || !set) return { p, may: none };
      const res = unsocketConstruct(registry, p, skill, rng.nextInt(0, movesOf(set.chains[skill]).length));
      return { p: res.profile, may: { ...none, plain: res.ok && auto } };
    }
    case 5: {
      // A reorder.
      const skill = pick(skills, rng);
      if (!skill || !set) return { p, may: none };
      const moves = [...movesOf(set.chains[skill])];
      for (let i = moves.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i);
        [moves[i], moves[j]] = [moves[j], moves[i]];
      }
      const chain = set.chains[skill]!;
      const next = Array.isArray(chain) ? moves : { ...chain, moves: moves as Move[] };
      return { p: applyDraft(registry, p, { chains: { [skill]: next }, bag: p.constructs }).profile, may: none };
    }
    case 6: {
      // A new construct in a free slot.
      const skill = pick(skills.filter((s) => movesOf(set!.chains[s]).length < set!.slots[s]!), rng);
      if (!skill || !set || !weapon) return { p, may: none };
      const chain = set.chains[skill]!;
      const forms = registry.getArpgData().forms.filter((f) => f.slot === skill && formAllowed(registry, weapon.baseId, f.id));
      const fresh: Construct = Array.isArray(chain)
        ? { kind: 'medium', element: 'frost' }
        : { kind: 'medium', form: pick(forms, rng)!.id, elements: ['frost'] };
      const next = Array.isArray(chain) ? [...chain, fresh] : { ...chain, moves: [...chain.moves, fresh as Move] };
      const res = applyDraft(registry, p, { chains: { [skill]: next }, bag: p.constructs });
      return { p: res.profile, may: { ...none, born: res.ok } };
    }
    case 7: {
      const target = pick(bagWeapons, rng);
      const res = target ? moveAll(registry, p, target.uid) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, born: true, plain: auto } : none };
    }
    case 8: {
      const c = pick(p.constructs, rng);
      const res = c ? salvageConstruct(registry, p, c.uid!) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, gone: new Set([c!.uid!]) } : none };
    }
    case 9: {
      // A bag weapon's salvage: its constructs to the bag, its bought slots' Links back.
      const target = pick(bagWeapons, rng);
      if (!target) return { p, may: none };
      const bought = weaponParts(registry, target).links;
      const res = salvageItems(registry, p, [target.uid]);
      expect(res.links).toBe(bought);
      return { p: res.profile, may: { ...none, back: res.links, plain: auto } };
    }
    case 10: {
      const skill = pick(skills, rng);
      const res = skill ? addSlot(registry, p, skill) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, born: true, paid: p.links - res.profile.links } : none };
    }
    case 11: {
      // Open a skill on the worn or a bag weapon.
      const target = pick([weapon, ...bagWeapons].filter((i): i is GearItem => !!i), rng);
      const skill = pick(ABILITY_SLOTS, rng)!;
      const res = target ? openSkill(registry, p, target.uid, skill) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, born: true, paid: p.links - res.profile.links } : none };
    }
    case 12: {
      const target = pick([weapon, ...bagWeapons].filter((i): i is GearItem => !!i), rng);
      const res = target ? upgradeGear(registry, p, target.uid) : null;
      return { p: res?.profile ?? p, may: res?.ok ? { ...none, born: true } : none };
    }
    case 13: {
      // A socket opened, or a pouch rune socketed, on the worn weapon.
      const skill = pick(skills, rng);
      if (!skill || !set) return { p, may: none };
      const moves = movesOf(set.chains[skill]);
      const index = rng.nextInt(0, Math.max(0, moves.length - 1));
      if (!moves[index]) return { p, may: none };
      const sockets = socketsOf(moves[index]);
      const empty = sockets.findIndex((r) => r === null);
      if (empty < 0 || rng.next() < 0.3) return { p: openSocket(registry, p, skill, index).profile, may: none };
      const ref = { id: pick(RUNES, rng)!, tier: rng.nextInt(1, 3) };
      return { p: socketRune(registry, p, skill, index, empty, ref).profile, may: none };
    }
    default: {
      // A dive that banks some bag constructs, then settles (an extract, or a death that loses some).
      if (p.constructs.length < 2) return { p, may: none };
      const half = Math.floor(p.constructs.length / 2);
      const d = startDive(registry, p, 1);
      const diving: DelveProfile = {
        ...d,
        constructs: p.constructs.slice(half),
        dive: {
          ...d.dive!,
          banked: { ...emptyHaul(), constructs: p.constructs.slice(0, half) },
          haul: { ...emptyHaul(), constructs: [] },
        },
      };
      const outcome = rng.next() < 0.5 ? 'extract' : 'death';
      const settled = settleDive(registry, diving, outcome);
      // Settled, the kept constructs sit in the bag and on `banked` (the summary's) until closeDive: unique and loadable as such.
      held(settled);
      expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(settled)))).toEqual({ profile: settled });
      const lost = new Set((settled.dive!.lost?.constructs ?? []).map((c) => c.uid!));
      return { p: closeDive(registry, settled), may: { ...none, gone: lost, plain: auto } };
    }
  }
}

function play(seed: number, ops: number, autoSalvagePlain: boolean): void {
  const rng = new SeededRNG(seed);
  let p = rich(seed, autoSalvagePlain);
  let before = held(p);
  let runesBefore = runes(p, before);
  let slotLinksPaid = 0;
  let linksBack = 0;
  for (let n = 0; n < ops; n++) {
    const { p: next, may } = step(p, rng, n);
    const after = held(next);
    // Uids: born only where allowed; gone only what a death lost, or a salvaged one, or a plain one under the auto-salvage.
    for (const uid of after.keys())
      if (!before.has(uid)) expect(may.born, `op ${n}: uid ${uid} appeared`).toBe(true);
    for (const [uid, c] of before)
      if (!after.has(uid))
        expect(may.gone.has(uid) || (may.plain && isPlain(c)), `op ${n}: ${uid} vanished`).toBe(true);
    // Runes: made only by a drop's or a forge's roll; otherwise the total falls only by what a death's lost constructs and pouches carried.
    const runesAfter = runes(next, after);
    if (!may.runesBorn)
      for (const [key, count] of runesAfter) expect(count, `op ${n}: ${key} grew`).toBeLessThanOrEqual(runesBefore.get(key) ?? 0);
    if (!may.runesBorn && may.gone.size === 0) expect(total(runesAfter), `op ${n}: runes lost`).toBe(total(runesBefore));
    // A drop's or a forge's roll may add runes, never take any: a melted drop's ride its constructs into the bag.
    if (may.runesBorn) expect(total(runesAfter), `op ${n}: runes lost on a roll`).toBeGreaterThanOrEqual(total(runesBefore));
    // Links: minted only by a weapon's bought slots on salvage, never more than were paid for slots.
    slotLinksPaid += may.paid;
    linksBack += may.back;
    expect(linksBack, `op ${n}: Links minted`).toBeLessThanOrEqual(slotLinksPaid);
    if (!may.back && !may.paid && may.gone.size === 0)
      expect(links(next), `op ${n}: Links changed`).toBeLessThanOrEqual(links(p));
    // The save reads back as it is: every construct in a slot of its skill, within the slots, the Basic never empty.
    if (n % 25 === 24) expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(next)))).toEqual({ profile: next });
    p = next;
    before = after;
    runesBefore = runesAfter;
  }
  expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))).toEqual({ profile: p });
}

describe('the constructs invariants (spec §8)', () => {
  it('seeds 1–3, 700 ops each, every plain construct kept', () => {
    for (const seed of [1, 2, 3]) play(seed, 700, false);
  }, 60_000);

  it('seeds 4–5, 700 ops each, plain constructs auto-salvaged', () => {
    for (const seed of [4, 5]) play(seed, 700, true);
  }, 60_000);
});
