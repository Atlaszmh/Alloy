import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { baseSlots, carriedSkills, defaultMoveset } from '../src/loot/moveset.js';
import { transferMoveset } from '../src/delve/moveset.js';
import { startDive } from '../src/delve/dive.js';
import { chooseStartingMana } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  fuseGear,
  parseDelveProfile,
  salvageItems,
  setAutoSalvage,
} from '../src/delve/profile.js';
import { unsocketMode } from '../src/delve/runes.js';
import {
  rollRuneDrop,
  rollSockets,
  runeFits,
  runeTierAt,
  socketsOf,
  weaponParts,
} from '../src/loot/runes.js';
import { CHAIN_SKILLS, type Blow, type Move } from '../src/types/ability.js';
import type { MonsterKind } from '../src/types/arpg.js';
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { RunePouch, RuneRef } from '../src/types/rune.js';
import { bal, registry } from './fixtures/arena.js';

// See the runes spec: sockets, the pouch, the draft's price, fusing, drops and the stop.

const R = bal.runes;

/** Every move and blow of a moveset, chain by chain. */
function allMoves(m: Moveset): (Move | Blow)[] {
  return CHAIN_SKILLS.flatMap((skill) => {
    const chain = m.chains[skill];
    if (!chain) return [];
    return Array.isArray(chain) ? chain : chain.moves;
  });
}

/** A moveset's open sockets, over every chain. */
function openSockets(m: Moveset): number {
  return allMoves(m).reduce((n, x) => n + socketsOf(x).length, 0);
}

/** A moveset without its sockets: what it was before any was rolled. */
function bare(m: Moveset): Moveset {
  const strip = <X extends Move | Blow>({ runes: _r, ...x }: X) => x;
  const chains = Object.fromEntries(
    Object.entries(m.chains).map(([skill, c]) => [
      skill,
      Array.isArray(c) ? c.map(strip) : { ...c, moves: c!.moves.map(strip) },
    ]),
  );
  return { chains, slots: m.slots };
}

const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
  generateItem(
    registry,
    { uid: `w${seed}`, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'storm' },
    new SeededRNG(seed),
  );

describe('rune drops: tiers and chances', () => {
  it('gives the highest tier whose depth is reached, one higher a fifth of the time, at most V', () => {
    const tiers = (depth: number) => {
      const rng = new SeededRNG(depth);
      const seen = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 4000; i++) seen[runeTierAt(registry, depth, rng)]++;
      return seen;
    };
    const cases: [number, number][] = [
      [1, 1],
      [6, 1],
      [7, 2],
      [12, 2],
      [13, 3],
      [20, 3],
      [21, 4],
      [30, 4],
    ];
    for (const [depth, tier] of cases) {
      const seen = tiers(depth);
      seen.forEach((n, t) => {
        if (t !== tier && t !== tier + 1) expect(n).toBe(0);
      });
      expect(seen[tier + 1] / 4000).toBeCloseTo(R.tierUp, 1);
    }
    expect(tiers(31)[5]).toBe(4000);
    expect(tiers(90)[5]).toBe(4000);
  });

  it("drops at its kind's chance × the door's multiplier (at most 1); a boss always drops one", () => {
    const rate = (kind: MonsterKind, dropMult: number) => {
      const rng = new SeededRNG(11);
      let got = 0;
      for (let i = 0; i < 20000; i++)
        if (rollRuneDrop(registry, { depth: 5, kind, dropMult }, rng)) got++;
      return got / 20000;
    };
    expect(R.dropChance).toEqual({ normal: 0.03, elite: 0.15, boss: 1 });
    expect(rate('normal', 1)).toBeCloseTo(0.03, 2);
    expect(rate('elite', 1)).toBeCloseTo(0.15, 1);
    expect(rate('elite', 2)).toBeCloseTo(0.3, 1);
    expect(rate('normal', 50)).toBe(1);
    expect(rate('boss', 1)).toBe(1);
    expect(rate('boss', 0.5)).toBe(1);
  });

  it('picks every rune uniformly, at the tier its depth gives', () => {
    const rng = new SeededRNG(5);
    const counts = new Map<string, number>();
    const tiers = new Set<number>();
    for (let i = 0; i < 14000; i++) {
      const r = rollRuneDrop(registry, { depth: 13, kind: 'boss', dropMult: 1 }, rng)!;
      counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
      tiers.add(r.tier);
    }
    expect([...counts.keys()].sort()).toEqual(
      registry
        .getRunes()
        .map((r) => r.id)
        .sort(),
    );
    for (const n of counts.values()) expect(Math.abs(n / 14000 - 1 / 14)).toBeLessThan(0.015);
    expect([...tiers].sort()).toEqual([3, 4]);
  });
});

describe('the socket roll', () => {
  it('rolls on top of the moveset: never changes the one it is given, nor anything but sockets', () => {
    const slots = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
    const m = defaultMoveset(registry, { baseId: 'bow', rarity: 'legendary' }, 'fire', slots);
    const before = JSON.stringify(m);
    for (let seed = 1; seed <= 30; seed++) {
      const out = rollSockets(registry, { rarity: 'legendary' }, m, new SeededRNG(seed));
      expect(JSON.stringify(m)).toBe(before);
      expect(bare(out)).toEqual(m);
      expect(openSockets(out)).toBeGreaterThanOrEqual(2);
    }
    // Nothing to open: the moveset itself, untouched.
    expect(rollSockets(registry, { rarity: 'uncommon' }, m, new SeededRNG(1))).toBe(m);
  });
});

describe("a weapon's parts", () => {
  it('a Link for each extra slot and each open socket, and the runes in them; other gear none', () => {
    const w = weapon('rare', 1, 'sword');
    const moveset = defaultMoveset(registry, w, 'storm', { basic: 4, primary: 2, defensive: 1 });
    const [first] = moveset.chains.basic!;
    moveset.chains.basic![0] = { ...first, runes: [{ id: 'chain', tier: 2 }, null] };
    const primary = moveset.chains.primary!;
    primary.moves[1] = { ...primary.moves[1], runes: [{ id: 'quick', tier: 1 }] };
    expect(weaponParts(registry, { ...w, moveset })).toEqual({
      links: 2 + 3,
      runes: [
        { id: 'chain', tier: 2 },
        { id: 'quick', tier: 1 },
      ],
    });
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 2, rarity: 'rare', slot: 'chest' },
      new SeededRNG(2),
    );
    expect(weaponParts(registry, chest)).toEqual({ links: 0, runes: [] });
  });
});

const CHAIN_II: RuneRef = { id: 'chain', tier: 2 };
const SPLIT_I: RuneRef = { id: 'split', tier: 1 };

/**
 * A rare sword (`uid`) with one extra basic slot and three open sockets: its
 * first blow holds Chain II and an empty socket, its Bolt holds Split I.
 * Its parts: 4 Links, and the two runes.
 */
function socketedSword(uid = 'w'): GearItem {
  const w = { ...weapon('rare', 1, 'sword'), uid };
  const moveset = defaultMoveset(registry, w, 'storm', { basic: 4, primary: 1, defensive: 1 });
  moveset.chains.basic![0] = { ...moveset.chains.basic![0], runes: [CHAIN_II, null] };
  const primary = moveset.chains.primary!;
  primary.moves[0] = { ...primary.moves[0], runes: [SPLIT_I] };
  return { ...w, moveset };
}

describe('the parts rule', () => {
  const hero = () => createDelveProfile(registry, 3, { primary: 'storm' });

  it('reads the pull mode from the balance unless overridden', () => {
    expect(R.unsocket).toBe('destroy');
    expect(unsocketMode(registry)).toBe('destroy');
    expect(unsocketMode(registry, null)).toBe('destroy');
    expect(unsocketMode(registry, 'pay')).toBe('pay');
    expect(unsocketMode(registry, 'destroy')).toBe('destroy');
  });

  it('salvage: a Link for each extra slot and open socket; the runes destroyed, or back to the pouch in pay mode', () => {
    const p = { ...hero(), bag: [socketedSword()] };
    const gone = salvageItems(registry, p, ['w']);
    expect(gone).toMatchObject({ links: 4, count: 1, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
    expect(gone.profile.links).toBe(4);
    expect(gone.profile.runes).toEqual({});
    const paid = salvageItems(registry, p, ['w'], { unsocket: 'pay' });
    expect(paid).toMatchObject({ links: 4, runes: [CHAIN_II, SPLIT_I], destroyed: [] });
    expect(paid.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
    // Nothing melts mid-dive, so nothing comes back.
    const diving = startDive(registry, p, 1);
    expect(salvageItems(registry, diving, ['w'])).toMatchObject({
      count: 0,
      links: 0,
      runes: [],
      destroyed: [],
    });
  });

  it('auto-salvage and a full bag melt a socketed weapon the same way', () => {
    const auto = setAutoSalvage(hero(), 'rare', true);
    const melted = addLootToBag(registry, auto, [socketedSword()]);
    expect(melted).toMatchObject({ links: 4, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
    const paid = addLootToBag(registry, auto, [socketedSword()], { unsocket: 'pay' });
    expect(paid).toMatchObject({ links: 4, runes: [CHAIN_II, SPLIT_I], destroyed: [] });
    expect(paid.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
    const full = { ...hero(), bag: Array(bal.loot.bagSize).fill(socketedSword('x')) };
    expect(addLootToBag(registry, full, [socketedSword()])).toMatchObject({
      bagFull: true,
      links: 4,
      destroyed: [CHAIN_II, SPLIT_I],
    });
    // Kept loot gives nothing back.
    expect(addLootToBag(registry, hero(), [socketedSword()])).toMatchObject({
      links: 0,
      runes: [],
      destroyed: [],
    });
  });

  it("fusing gives the inputs' parts back by the rule; the fused weapon rolls its own", () => {
    const three = ['a', 'b', 'c'].map((uid) => socketedSword(uid));
    const p = { ...hero(), scrap: 9999, bag: three };
    const res = fuseGear(registry, p, ['a', 'b', 'c']);
    expect(res).toMatchObject({ ok: true, links: 12, runes: [] });
    expect(res.destroyed).toHaveLength(6);
    expect(res.profile.links).toBe(12);
    expect(res.item!.rarity).toBe('epic');
    const paid = fuseGear(registry, p, ['a', 'b', 'c'], { unsocket: 'pay' });
    expect(paid).toMatchObject({ ok: true, links: 12, destroyed: [] });
    expect(paid.profile.runes).toEqual({ chain: [0, 3, 0, 0, 0], split: [3, 0, 0, 0, 0] });
  });

  it('the choice of mana rebuilds the weapon: its sockets back as Links, its runes by the rule', () => {
    const unchosen = createDelveProfile(registry, 3);
    const p = { ...unchosen, equipped: { ...unchosen.equipped, weapon: socketedSword() } };
    const res = chooseStartingMana(registry, p, 'fire');
    expect(res).toMatchObject({ ok: true, links: 3, runes: [], destroyed: [CHAIN_II, SPLIT_I] });
    expect(res.profile.links).toBe(3); // the open sockets; the extra slot, as before, is not refunded
    const sword = res.profile.equipped.weapon!;
    expect(sword.moveset).toEqual(defaultMoveset(registry, sword, 'fire'));
    const paid = chooseStartingMana(registry, p, 'fire', { unsocket: 'pay' });
    expect(paid.profile.runes).toEqual({ chain: [0, 1, 0, 0, 0], split: [1, 0, 0, 0, 0] });
    // A fresh hero has no parts: a new save is unchanged.
    const fresh = createDelveProfile(registry, 3, { primary: 'fire' });
    expect([fresh.links, fresh.runes]).toEqual([0, {}]);
  });
});

const QUICK_I: RuneRef = { id: 'quick', tier: 1 };
const ECHO_I: RuneRef = { id: 'echo', tier: 1 };
const GUARD_I: RuneRef = { id: 'guard', tier: 1 };

/** Every rune in a pouch, counted. */
function pouchSize(pouch: RunePouch): number {
  return Object.values(pouch).reduce((n, counts) => n + counts.reduce((a, b) => a + b, 0), 0);
}

/** `w` with a moveset of these slots, every move its default in `w`'s mana. */
function slotted(w: GearItem, slots: Moveset['slots']): GearItem {
  return { ...w, moveset: defaultMoveset(registry, w, w.mana, slots) };
}

describe('transfer: sockets move with their moves', () => {
  const T = bal.movesets.transferScrap;
  /** A Storm hero wielding `w`, with scrap to spare, and `bag` in the bag. */
  const holding = (w: GearItem, ...bag: GearItem[]): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'storm' });
    return { ...p, equipped: { ...p.equipped, weapon: w }, bag, scrap: 1000 };
  };

  it("moves each kept move's sockets and runes, priced per open socket; the target's replaced ones come back", () => {
    // The target: a rare axe whose own Bolt holds Quick I.
    const axe = slotted(
      { ...weapon('rare', 2, 'axe'), uid: 'axe' },
      { basic: 3, primary: 1, defensive: 1 },
    );
    const bolt = axe.moveset!.chains.primary!;
    bolt.moves[0] = { ...bolt.moves[0], runes: [QUICK_I] };
    const res = transferMoveset(registry, holding(socketedSword(), axe), 'axe');
    expect(res.ok).toBe(true);
    const moved = res.profile.equipped.weapon!.moveset!;
    expect(moved.chains.basic![0].runes).toEqual([CHAIN_II, null]);
    expect(moved.chains.primary!.moves[0].runes).toEqual([SPLIT_I]);
    // The sword's extra slot and its three open sockets move; the axe's socket comes back.
    expect(res.profile.scrap).toBe(1000 - 4 * T);
    expect(res).toMatchObject({ links: 1, runes: [], destroyed: [QUICK_I] });
    expect(res.profile.links).toBe(1);
    const paid = transferMoveset(registry, holding(socketedSword(), axe), 'axe', {
      unsocket: 'pay',
    });
    expect(paid).toMatchObject({ links: 1, runes: [QUICK_I], destroyed: [] });
    expect(paid.profile.runes).toEqual({ quick: [1, 0, 0, 0, 0] });
  });

  it("a blow's rune that doesn't fit the target leaves, its socket open; past the cap and on a chain left behind, they come back", () => {
    // A legendary bow: its first blow holds Split II, Chain I and an empty socket; its Ward Guard I.
    const bow = slotted(weapon('legendary', 3, 'bow'), {
      basic: 3,
      primary: 1,
      defensive: 1,
      ultimate: 1,
    });
    const blows = bow.moveset!.chains.basic!;
    blows[0] = { ...blows[0], runes: [{ id: 'split', tier: 2 }, { id: 'chain', tier: 1 }, null] };
    const ward = bow.moveset!.chains.defensive!;
    ward.moves[0] = { ...ward.moves[0], runes: [GUARD_I] };
    // Onto a common sword: one socket a move, no Defensive.
    const sword = { ...weapon('common', 4, 'sword'), uid: 'sword' };
    const res = transferMoveset(registry, holding(bow, sword), 'sword');
    expect(res.profile.equipped.weapon!.moveset!.chains.basic![0].runes).toEqual([null]);
    // Back: the two sockets past the cap and the Ward's; Split doesn't fit a sword's blows.
    expect(res).toMatchObject({
      links: 3,
      destroyed: [{ id: 'chain', tier: 1 }, { id: 'split', tier: 2 }, GUARD_I],
    });
    expect(res.profile.scrap).toBe(1000 - T); // the one socket that moved
  });

  it('a move the transfer drops takes its sockets with it, back as Links', () => {
    // A dagger's full string (4 + 1 extra) onto a maul (2): 3 slots, the last two blows gone.
    const dagger = slotted(weapon('magic', 3, 'dagger'), { basic: 5, primary: 1, defensive: 1 });
    const blows = dagger.moveset!.chains.basic!;
    blows[4] = { ...blows[4], runes: [ECHO_I] };
    const maul = { ...weapon('common', 4, 'maul'), uid: 'maul' };
    const res = transferMoveset(registry, holding(dagger, maul), 'maul');
    expect(res).toMatchObject({ links: 1, destroyed: [ECHO_I] });
    expect(res.profile.scrap).toBe(1000 - T); // the extra slot; the dropped socket isn't priced
  });

  it('conserves Links and runes over random transfers and salvages, in both modes, and reads back', () => {
    const rng = new SeededRNG(77);
    const bases = ['sword', 'axe', 'dagger', 'maul', 'staff', 'wand', 'bow'];
    /** A random weapon at random slots, each move with random sockets holding random fitting runes. */
    const randomWeapon = (uid: string): GearItem => {
      const rarity = RARITY_ORDER[rng.nextInt(0, RARITY_ORDER.length - 1)];
      const baseId = bases[rng.nextInt(0, bases.length - 1)];
      const w = generateItem(
        registry,
        { uid, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'fire' },
        rng.fork(uid),
      );
      const slots: Moveset['slots'] = {};
      for (const s of carriedSkills(registry, rarity))
        slots[s] = rng.nextInt(baseSlots(registry, baseId, s), bal.chains.cap[s]);
      const moveset = defaultMoveset(registry, w, 'fire', slots);
      for (const m of allMoves(moveset)) {
        const on = 'form' in m ? { form: m.form } : { weapon: baseId, kind: m.kind };
        const fit = registry.getRunes().filter((d) => runeFits(d, on));
        const runes: (RuneRef | null)[] = [];
        for (let i = rng.nextInt(0, R.socketCap[rarity]); i > 0; i--) {
          const def = fit[rng.nextInt(0, fit.length - 1)];
          const empty = rng.next() < 0.3 || runes.some((r) => r?.id === def.id);
          runes.push(empty ? null : { id: def.id, tier: rng.nextInt(1, 5) as RuneRef['tier'] });
        }
        if (runes.length > 0) m.runes = runes;
      }
      return { ...w, moveset };
    };
    const totals = (q: DelveProfile, destroyed: RuneRef[]) => {
      const weapons = [q.equipped.weapon!, ...q.bag].map((i) => weaponParts(registry, i));
      return {
        links: q.links + weapons.reduce((n, p) => n + p.links, 0),
        runes:
          pouchSize(q.runes) + weapons.reduce((n, p) => n + p.runes.length, 0) + destroyed.length,
      };
    };
    for (let n = 0; n < 400; n++) {
      const unsocket = n % 2 === 0 ? 'destroy' : 'pay';
      const a = randomWeapon(`a${n}`);
      const b = randomWeapon(`b${n}`);
      const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
      const p = { ...p0, equipped: { ...p0.equipped, weapon: a }, bag: [b], scrap: 1e6 };
      const before = totals(p, []);
      const t = transferMoveset(registry, p, b.uid, { unsocket });
      expect(t.ok).toBe(true);
      expect(totals(t.profile, t.destroyed!)).toEqual(before);
      const saved = JSON.parse(JSON.stringify(t.profile));
      expect(parseDelveProfile(registry, saved)!.profile).toEqual(t.profile);
      const s = salvageItems(registry, t.profile, [a.uid], { unsocket });
      expect(s.count).toBe(1);
      expect(totals(s.profile, [...t.destroyed!, ...s.destroyed])).toEqual(before);
    }
  });
});
