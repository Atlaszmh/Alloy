import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { baseSlots, carriedSkills, defaultMoveset } from '../src/loot/moveset.js';
import { sameChain, setChains, transferMoveset } from '../src/delve/moveset.js';
import { bankWorld, beginFloor, failFloor, startDive } from '../src/delve/dive.js';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { setSandboxToggles } from '../src/arpg/sandbox.js';
import { STOP_KINDS, rollStop, stopKinds, takeStop } from '../src/delve/stops.js';
import { chooseStartingMana } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  equipItem,
  parseDelveProfile,
  salvageCandidates,
  salvageItems,
  setAutoSalvage,
  unequipSlot,
} from '../src/delve/profile.js';
import {
  draftPrice,
  fusePrice,
  fuseRunes,
  openSocket,
  socketRune,
  unsocketMode,
} from '../src/delve/runes.js';
import {
  rollRuneDrop,
  rollSockets,
  runeFits,
  runeTierAt,
  socketsOf,
  weaponParts,
} from '../src/loot/runes.js';
import { CHAIN_SKILLS, type Blow, type Chain, type Move } from '../src/types/ability.js';
import type { ArpgWorld, Drop, DropKind, MonsterKind } from '../src/types/arpg.js';
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import type { DelveProfile, StopKind } from '../src/types/delve.js';
import type { RunePouch, RuneRef } from '../src/types/rune.js';
import { arena, bal, chainsOf, dummy, registry, run } from './fixtures/arena.js';

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

  it("drops at its kind's chance × the door's `runes` (at most 1); a boss always drops one", () => {
    const rate = (kind: MonsterKind, runes: number) => {
      const rng = new SeededRNG(11);
      let got = 0;
      for (let i = 0; i < 20000; i++)
        if (rollRuneDrop(registry, { depth: 5, kind, runes }, rng)) got++;
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
      const r = rollRuneDrop(registry, { depth: 13, kind: 'boss', runes: 1 }, rng)!;
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

  it('Salvage junk never picks a weapon holding runes, though a better one replaced it', () => {
    const better = generateItem(
      registry,
      { uid: 'b', ilvl: 30, rarity: 'epic', slot: 'weapon', baseId: 'sword', mana: 'storm' },
      new SeededRNG(7),
    );
    const start = hero();
    const wield = (w: GearItem) =>
      equipItem(
        registry,
        { ...start, equipped: { ...start.equipped, weapon: w }, bag: [better] },
        'b',
      );
    const p = wield(socketedSword());
    expect(p.bag.map((i) => i.uid)).toEqual(['w']);
    expect(salvageCandidates(registry, p, 'epic')).toEqual([]);
    // The same weapon without runes is junk.
    const plain = { ...socketedSword(), moveset: undefined };
    expect(salvageCandidates(registry, wield(plain), 'epic')).toEqual(['w']);
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

const QUICK_II: RuneRef = { id: 'quick', tier: 2 };
const CHAIN_I: RuneRef = { id: 'chain', tier: 1 };

/** `c` with move `i`'s sockets set to `runes`. */
function withRunes(c: Chain, i: number, runes: (RuneRef | null)[]): Chain {
  return { ...c, moves: c.moves.map((m, j) => (j === i ? { ...m, runes } : m)) };
}

/**
 * A Storm hero past its first dive with 10 Links, 500 scrap and 100 Mana Dust,
 * wielding an epic bow (3 sockets a move) whose Primary is three Bolts: the
 * first holds Split I and an empty socket, the second Quick II, the third
 * none. Its pouch: two Split I, a Chain I and an Echo I.
 */
function ready(): DelveProfile {
  const p = createDelveProfile(registry, 3, { primary: 'storm' });
  const slots = { basic: 3, primary: 3, defensive: 1, ultimate: 1 };
  const bow = slotted({ ...weapon('epic', 6, 'bow'), uid: 'bow' }, slots);
  const primary = bow.moveset!.chains.primary!;
  primary.moves[0] = { ...primary.moves[0], runes: [SPLIT_I, null] };
  primary.moves[1] = { ...primary.moves[1], runes: [QUICK_II] };
  return {
    ...p,
    equipped: { ...p.equipped, weapon: bow },
    links: 10,
    scrap: 500,
    manaDust: 100,
    stats: { ...p.stats, dives: 1 },
    runes: { split: [2, 0, 0, 0, 0], chain: [1, 0, 0, 0, 0], echo: [1, 0, 0, 0, 0] },
  };
}

/** The hero's Primary chain. */
const primaryOf = (q: DelveProfile) => chainsOf(q).primary!;

describe('the draft: sockets and runes through setChains', () => {
  const E = bal.movesets.editDust;
  const PAY = { unsocket: 'pay' as const };

  it('opens sockets for Links and scrap by their index; socketing is free, out of the pouch', () => {
    const p = ready();
    // Move 2's first socket, Chain I in it; move 1's second socket, left empty.
    const c = withRunes(withRunes(primaryOf(p), 2, [CHAIN_I]), 1, [QUICK_II, null]);
    expect(draftPrice(registry, p, { primary: c })).toEqual({
      dust: 0,
      links: 1 + 2,
      scrap: 20 + 40,
      refundLinks: 0,
      destroys: [],
      returns: [],
      pouch: setChains(registry, p, { primary: c }).profile.runes,
    });
    const res = setChains(registry, p, { primary: c });
    expect(res).toMatchObject({ ok: true, runes: [], destroyed: [] });
    expect(res.profile).toMatchObject({ links: 7, scrap: 440, manaDust: 100 });
    expect(res.profile.runes.chain).toEqual([0, 0, 0, 0, 0]);
    expect(primaryOf(res.profile).moves.map((m) => m.runes)).toEqual([
      [SPLIT_I, null],
      [QUICK_II, null],
      [CHAIN_I],
    ]);
    expect(R.socketLinks).toEqual([1, 2, 3]);
    expect(R.socketScrap).toEqual([20, 40, 60]);
  });

  it('a pull follows the mode: destroy is free and the rune is gone; pay costs its tier and returns it', () => {
    const p = ready();
    const c = withRunes(primaryOf(p), 1, [null]);
    expect(draftPrice(registry, p, { primary: c })).toMatchObject({
      scrap: 0,
      destroys: [QUICK_II],
      returns: [],
    });
    const gone = setChains(registry, p, { primary: c });
    expect(gone).toMatchObject({ ok: true, runes: [], destroyed: [QUICK_II] });
    expect(gone.profile.scrap).toBe(500);
    expect(gone.profile.runes).toEqual(p.runes);
    expect(R.pullScrap).toEqual([15, 30, 50, 80, 120]);
    expect(draftPrice(registry, p, { primary: c }, PAY)).toMatchObject({
      scrap: 30,
      destroys: [],
      returns: [QUICK_II],
    });
    const paid = setChains(registry, p, { primary: c }, PAY);
    expect(paid).toMatchObject({ ok: true, runes: [QUICK_II], destroyed: [] });
    expect(paid.profile.scrap).toBe(470);
    expect(paid.profile.runes.quick).toEqual([0, 1, 0, 0, 0]);
    expect(draftPrice(registry, p, { primary: c }, PAY)).toMatchObject({
      pouch: paid.profile.runes,
    });
    // Overwriting is a pull and a socket: Quick II out, Echo I in from the pouch.
    const over = setChains(registry, p, { primary: withRunes(primaryOf(p), 1, [ECHO_I]) });
    expect(over).toMatchObject({ ok: true, destroyed: [QUICK_II] });
    expect(over.profile.runes.echo).toEqual([0, 0, 0, 0, 0]);
  });

  it('reordering carries the runes; a removed move gives its sockets back, netted against those opened', () => {
    const p = ready();
    const [m0, m1, m2] = primaryOf(p).moves;
    const swapped = { ...primaryOf(p), moves: [m1, m0, m2] };
    const moved = setChains(registry, p, { primary: swapped }, { origins: { primary: [1, 0, 2] } });
    expect(moved).toMatchObject({ ok: true, destroyed: [] });
    expect(moved.profile).toMatchObject({ links: 10, scrap: 500, manaDust: 100 - E });
    expect(primaryOf(moved.profile).moves.map((m) => m.runes)).toEqual([
      [QUICK_II],
      [SPLIT_I, null],
      undefined,
    ]);
    // Read in place, the same chain would close move 0's second socket.
    expect(draftPrice(registry, p, { primary: swapped })).toEqual({
      refused: "Sockets can't be closed",
    });
    // Move 0 removed (2 sockets back, Split I pulled), move 2's first socket opened.
    const removed = { ...primaryOf(p), moves: [m1, { ...m2, runes: [null] }] };
    const origins = { primary: [1, 2] };
    expect(draftPrice(registry, p, { primary: removed }, { origins })).toEqual({
      dust: E,
      links: 1,
      scrap: 20,
      refundLinks: 2,
      destroys: [SPLIT_I],
      returns: [],
      pouch: p.runes,
    });
    const res = setChains(registry, p, { primary: removed }, { origins });
    expect(res.profile).toMatchObject({ links: 10 - 1 + 2, scrap: 480, manaDust: 100 - E });
    // The refund pays for the socket: a hero with no Links can still do it.
    expect(setChains(registry, { ...p, links: 0 }, { primary: removed }, { origins }).ok).toBe(
      true,
    );
  });

  it('a rune that changes moves is a pull plus a socket: destroy needs another in the pouch, pay can re-socket it', () => {
    const p = ready();
    const [m0, m1, m2] = primaryOf(p).moves;
    const c = {
      ...primaryOf(p),
      moves: [{ ...m0, runes: [null, null] }, m1, { ...m2, runes: [SPLIT_I] }],
    };
    expect(draftPrice(registry, p, { primary: c })).toEqual({
      dust: 0,
      links: 1,
      scrap: 20,
      refundLinks: 0,
      destroys: [SPLIT_I],
      returns: [],
      pouch: setChains(registry, p, { primary: c }).profile.runes,
    });
    const res = setChains(registry, p, { primary: c });
    expect(res.profile.runes.split).toEqual([1, 0, 0, 0, 0]);
    const empty = { ...p, runes: {} };
    expect(setChains(registry, empty, { primary: c })).toMatchObject({
      ok: false,
      profile: empty,
      reason: 'Not enough runes in your pouch',
    });
    const paid = setChains(registry, empty, { primary: c }, PAY);
    expect(paid).toMatchObject({ ok: true, runes: [SPLIT_I] });
    expect(paid.profile).toMatchObject({ scrap: 500 - 20 - 15, runes: { split: [0, 0, 0, 0, 0] } });
  });

  it('refuses past the cap, a closed socket, a rune twice, one that does not fit or is unknown, and bad origins', () => {
    const p = ready();
    const c = primaryOf(p);
    const reason = (next: Chain, opts = {}) => {
      const res = setChains(registry, p, { primary: next }, opts);
      expect(res.profile).toBe(p);
      return res.reason;
    };
    expect(reason(withRunes(c, 2, [null, null, null, null]))).toBe(
      "This weapon's moves hold at most 3 sockets",
    );
    expect(reason(withRunes(c, 0, [SPLIT_I]))).toBe("Sockets can't be closed");
    expect(reason(withRunes(c, 0, [SPLIT_I, { id: 'split', tier: 2 }]))).toBe(
      'A move takes one Split',
    );
    expect(reason(withRunes(c, 2, [{ id: 'widen', tier: 1 }]))).toBe("Widen doesn't fit a Bolt");
    expect(reason(withRunes(c, 2, [{ id: 'nope', tier: 1 }]))).toBe('Unknown rune nope');
    expect(reason(c, { origins: { primary: [0, 0, 1] } })).toBe('Bad origins');
    // A form change is refused while a socketed rune wouldn't fit it.
    const lance = {
      ...c,
      moves: c.moves.map((m, i) => (i === 0 ? { ...m, form: 'lance' as const } : m)),
    };
    expect(reason(lance)).toBe("Split doesn't fit a Lance");
    // A kind or element change keeps the runes.
    const heavy = {
      ...c,
      moves: c.moves.map((m, i) => (i === 0 ? { ...m, kind: 'heavy' as const } : m)),
    };
    expect(setChains(registry, p, { primary: heavy }).ok).toBe(true);
    // Blows: a rune must fit the weapon's.
    const blows = chainsOf(p).basic!;
    const widened = blows.map((b, i) =>
      i === 0 ? { ...b, runes: [{ id: 'widen', tier: 1 as const }] } : b,
    );
    expect(setChains(registry, p, { basic: widened }).reason).toBe("Widen doesn't fit Bow blows");
    // All or nothing: a good Primary and a bad basic chain change nothing.
    const good = withRunes(c, 2, [CHAIN_I]);
    expect(setChains(registry, p, { primary: good, basic: widened })).toMatchObject({
      ok: false,
      profile: p,
    });
    // Short of Links or scrap.
    expect(setChains(registry, { ...p, links: 0 }, { primary: good }).reason).toBe(
      'Not enough Links',
    );
    expect(setChains(registry, { ...p, scrap: 19 }, { primary: good }).reason).toBe(
      'Not enough scrap',
    );
  });

  it('sameChain sees the sockets: a rune-only change is a change', () => {
    const c = primaryOf(ready());
    expect(sameChain(c, withRunes(c, 2, []))).toBe(true);
    expect(sameChain(c, withRunes(c, 2, [null]))).toBe(false);
    expect(sameChain(c, withRunes(c, 1, [{ id: 'quick', tier: 3 }]))).toBe(false);
    expect(sameChain(c, withRunes(c, 1, [QUICK_II]))).toBe(true);
  });

  it('nets Links: a batch is never dearer than its edits one Apply at a time, and the same when it removes no move (random edits, origins composed)', () => {
    const rng = new SeededRNG(21);
    const fits = registry.getRunes().filter((d) => runeFits(d, { form: 'bolt' }));
    const pouch = Object.fromEntries(registry.getRunes().map((d) => [d.id, [50, 50, 50, 50, 50]]));
    /** One edit as the builder makes it: the new chain, and each new move's index in `c` (null: new). */
    const randomEdit = (c: Chain, remove: boolean): { next: Chain; map: (number | null)[] } => {
      const moves = c.moves.map((m) => ({ ...m }));
      const map: (number | null)[] = moves.map((_, i) => i);
      const i = rng.nextInt(0, moves.length - 1);
      const sockets = [...socketsOf(moves[i])];
      switch (rng.nextInt(0, 5)) {
        case 0:
          if (remove && moves.length > 1) [moves, map].forEach((xs) => xs.splice(i, 1));
          break;
        case 1:
          if (i + 1 < moves.length) {
            [moves[i], moves[i + 1]] = [moves[i + 1], moves[i]];
            [map[i], map[i + 1]] = [map[i + 1], map[i]];
          }
          break;
        case 2:
          if (moves.length < 3) {
            moves.push({ kind: 'light', form: 'bolt', elements: ['storm'] });
            map.push(null);
          }
          break;
        case 3:
          if (sockets.length < 3) moves[i].runes = [...sockets, null];
          break;
        case 4: {
          const def = fits[rng.nextInt(0, fits.length - 1)];
          const at = sockets.indexOf(null);
          if (at >= 0 && !sockets.some((r) => r?.id === def.id)) {
            sockets[at] = { id: def.id, tier: rng.nextInt(1, 5) as RuneRef['tier'] };
            moves[i].runes = sockets;
          }
          break;
        }
        case 5: {
          const at = sockets.findIndex((r) => r !== null);
          if (at >= 0) {
            sockets[at] = null;
            moves[i].runes = sockets;
          }
          break;
        }
      }
      return { next: { ...c, moves }, map };
    };
    for (let n = 0; n < 300; n++) {
      const unsocket = n % 2 === 0 ? 'destroy' : 'pay';
      // A removed move refunds one Link a socket, so a socket opened past the first and removed
      // in the same batch costs the batch nothing but the steps a Link or two: never dearer.
      const remove = n % 4 < 2;
      const start = { ...ready(), links: 999, scrap: 99999, manaDust: 9999, runes: pouch };
      let step = start;
      let chain = primaryOf(start);
      let origins: (number | null)[] = chain.moves.map((_, i) => i);
      for (let k = 0; k < 8; k++) {
        const { next, map } = randomEdit(chain, remove);
        const opts = { origins: { primary: map }, unsocket };
        const res = setChains(registry, step, { primary: next }, opts);
        expect(res.ok).toBe(true);
        step = res.profile;
        chain = next;
        origins = map.map((o) => (o === null ? null : origins[o]));
      }
      const opts = { origins: { primary: origins }, unsocket };
      const batch = setChains(registry, start, { primary: chain }, opts);
      expect(batch.ok).toBe(true);
      if (remove) expect(batch.profile.links).toBeGreaterThanOrEqual(step.links);
      else expect(batch.profile.links).toBe(step.links);
      expect(primaryOf(batch.profile)).toEqual(primaryOf(step));
    }
  });
});

describe('opening a socket, socketing a rune, fusing', () => {
  it("opens a move's next socket for Links and scrap by its index, up to the rarity's cap", () => {
    const p = ready();
    const one = openSocket(registry, p, 'primary', 2);
    expect(one.ok).toBe(true);
    expect(one.profile).toMatchObject({ links: 9, scrap: 480, manaDust: 100 });
    expect(primaryOf(one.profile).moves[2].runes).toEqual([null]);
    // Move 0 has two: its third costs 3 Links and 60 scrap, and then it has every socket.
    const three = openSocket(registry, one.profile, 'primary', 0);
    expect(three.profile).toMatchObject({ links: 6, scrap: 420 });
    expect(openSocket(registry, three.profile, 'primary', 0).reason).toBe(
      'This move has every socket',
    );
    // A blow takes them too.
    expect(chainsOf(openSocket(registry, p, 'basic', 1).profile).basic![1].runes).toEqual([null]);
    expect(openSocket(registry, { ...p, links: 0 }, 'primary', 2).reason).toBe('Not enough Links');
    expect(openSocket(registry, { ...p, scrap: 0 }, 'primary', 2).reason).toBe('Not enough scrap');
    expect(openSocket(registry, p, 'primary', 3).reason).toBe('Pick a move the chain holds');
    // A common weapon: one socket a move, and no Defensive.
    const fresh = { ...createDelveProfile(registry, 3, { primary: 'fire' }), links: 9, scrap: 999 };
    const opened = openSocket(registry, fresh, 'primary', 0).profile;
    expect(openSocket(registry, opened, 'primary', 0).reason).toBe('This move has every socket');
    expect(openSocket(registry, fresh, 'defensive', 0).reason).toBe(
      'Carried by magic weapons and better',
    );
    expect(openSocket(registry, unequipSlot(registry, fresh, 'weapon'), 'primary', 0).reason).toBe(
      'Equip a weapon to build your moves',
    );
  });

  it('sockets a pouch rune into an open socket; over a filled one it pulls by the mode', () => {
    const p = ready();
    const res = socketRune(registry, p, 'primary', 0, 1, CHAIN_I);
    expect(res.ok).toBe(true);
    expect(primaryOf(res.profile).moves[0].runes).toEqual([SPLIT_I, CHAIN_I]);
    expect(res.profile).toMatchObject({ links: 10, scrap: 500, manaDust: 100 });
    expect(res.profile.runes.chain).toEqual([0, 0, 0, 0, 0]);
    expect(socketRune(registry, p, 'primary', 1, 0, ECHO_I)).toMatchObject({
      ok: true,
      destroyed: [QUICK_II],
    });
    const paid = socketRune(registry, p, 'primary', 1, 0, ECHO_I, { unsocket: 'pay' });
    expect(paid).toMatchObject({ ok: true, runes: [QUICK_II], destroyed: [] });
    expect(paid.profile.scrap).toBe(470);
    expect(socketRune(registry, p, 'primary', 2, 0, CHAIN_I).reason).toBe('Open this socket first');
    expect(socketRune(registry, p, 'primary', 0, 1, { id: 'split', tier: 2 }).reason).toBe(
      'A move takes one Split',
    );
    expect(socketRune(registry, p, 'primary', 0, 1, { id: 'widen', tier: 1 }).reason).toBe(
      "Widen doesn't fit a Bolt",
    );
    expect(socketRune(registry, p, 'primary', 0, 1, { id: 'chain', tier: 3 }).reason).toBe(
      'Not enough runes in your pouch',
    );
  });

  it('fuses three of one rune and tier into one of the next, for scrap; tier V does not fuse', () => {
    expect(R.fuseCount).toBe(3);
    const tiers = [1, 2, 3, 4, 5] as const;
    expect(tiers.map((tier) => fusePrice(registry, { id: 'split', tier }))).toEqual([
      20,
      40,
      80,
      160,
      null,
    ]);
    const p = { ...ready(), runes: { split: [4, 0, 0, 3, 0] } };
    const res = fuseRunes(registry, p, SPLIT_I);
    expect(res).toMatchObject({ ok: true, runes: [{ id: 'split', tier: 2 }] });
    expect(res.profile).toMatchObject({ scrap: 480, runes: { split: [1, 1, 0, 3, 0] } });
    expect(fuseRunes(registry, res.profile, SPLIT_I).reason).toBe('Fuse 3 of one rune and tier');
    const four = fuseRunes(registry, p, { id: 'split', tier: 4 });
    expect(four.profile).toMatchObject({ scrap: 340, runes: { split: [4, 0, 0, 0, 1] } });
    const fives = { ...p, runes: { split: [0, 0, 0, 0, 3] } };
    expect(fuseRunes(registry, fives, { id: 'split', tier: 5 }).reason).toBe(
      "Tier V runes don't fuse",
    );
    expect(fuseRunes(registry, { ...p, scrap: 19 }, SPLIT_I).reason).toBe('Not enough scrap');
    expect(fuseRunes(registry, p, { id: 'nope', tier: 1 }).reason).toBe('Unknown rune nope');
  });

  it('every op on sockets and runes waits for the dive to end, the door screen included', () => {
    const p = ready();
    const fighting = startDive(registry, p, 1);
    const choosing = { ...fighting, dive: { ...fighting.dive!, phase: 'choosing' as const } };
    const moves = 'Chains can only change between dives';
    const forge = 'Forge at the Anvil, between dives';
    for (const q of [fighting, choosing]) {
      expect(openSocket(registry, q, 'primary', 2)).toMatchObject({
        ok: false,
        profile: q,
        reason: moves,
      });
      expect(socketRune(registry, q, 'primary', 0, 1, CHAIN_I).reason).toBe(moves);
      const draft = { primary: withRunes(primaryOf(q), 2, [null]) };
      expect(setChains(registry, q, draft).reason).toBe(moves);
      expect(fuseRunes(registry, { ...q, runes: { split: [3, 0, 0, 0, 0] } }, SPLIT_I).reason).toBe(
        forge,
      );
      const bag = { ...q, bag: ['a', 'b', 'c'].map((uid) => socketedSword(uid)) };
      expect(transferMoveset(registry, bag, 'a').reason).toBe(
        'Transfer your moveset between dives',
      );
      expect(salvageItems(registry, bag, ['a'])).toMatchObject({ count: 0, destroyed: [] });
    }
    // The choice of mana stays open (a migrated save may be diving).
    const unchosen = startDive(registry, createDelveProfile(registry, 3), 1);
    expect(chooseStartingMana(registry, unchosen, 'frost').ok).toBe(true);
  });
});

describe('rune drops in the world', () => {
  /** A fresh dive's first floor, and a context to kill its foes in. */
  const floor = () => {
    const p = startDive(registry, createDelveProfile(registry, 3, { primary: 'fire' }), 1);
    const w = beginFloor(registry, p);
    return { p, w, ctx: makeCtx(registry, w, []) };
  };
  /** A world's drops but runes, without their ids (a rune drop renumbers later spawns). */
  const others = (w: ArpgWorld) =>
    w.drops.filter((d) => d.kind !== 'rune').map(({ id: _id, ...d }) => d);

  it('a slain foe drops a rune from its own stream: every other drop comes out as without it', () => {
    const a = floor();
    const b = floor();
    b.w.runeRng = { next: () => 1 } as unknown as SeededRNG; // never a rune
    for (const { w, ctx } of [a, b])
      for (const [i, m] of [...w.monsters].entries()) {
        if (i === 0) m.kind = 'boss';
        killMonster(ctx, m);
      }
    const runes = a.w.drops.filter((d) => d.kind === 'rune');
    expect(runes.length).toBeGreaterThanOrEqual(1);
    expect(b.w.drops.some((d) => d.kind === 'rune')).toBe(false);
    expect(others(a.w)).toEqual(others(b.w));
    const [first] = runes;
    expect(registry.findRune(first.rune!.id)).toBeDefined();
    expect(first.rune!.tier).toBeLessThanOrEqual(2); // depth 1: tier I, or II a fifth of the time
    expect(a.ctx.events).toContainEqual({
      kind: 'drop',
      dropId: first.id,
      x: first.x,
      y: first.y,
      dropKind: 'rune',
    });
  });

  it('the Training Grounds drop none', () => {
    const w = arena([{ kind: 'boss' }, {}, {}]);
    setSandboxToggles(w, { infiniteMana: false, noCooldowns: false, invulnerable: false });
    const ctx = makeCtx(registry, w, []);
    for (const m of [...w.monsters]) killMonster(ctx, m);
    expect(w.drops).toEqual([]);
  });

  it('a rune on the floor is walked over, never pulled by the magnet, and comes in when the floor clears', () => {
    const w = arena([dummy(13, 5)], { noBasic: true });
    const { x, y } = w.hero;
    const drop = (id: number, kind: DropKind, dx: number, rune?: RuneRef): Drop => ({
      id,
      kind,
      x: x + dx,
      y,
      rune,
      amount: 1,
      born: -1,
      vacuum: false,
      dead: false,
    });
    // Inside the magnet's reach, outside the pickup's: the mote flies in, the rune stays.
    w.drops.push(drop(1, 'rune', 2.4, SPLIT_I), drop(2, 'mote', -2.4), drop(3, 'rune', 0, CHAIN_I));
    const events = run(w, 0.5);
    expect(w.drops.map((d) => [d.id, d.x])).toEqual([[1, x + 2.4]]);
    expect(w.pending.runes).toEqual([CHAIN_I]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'pickup', dropId: 3, dropKind: 'rune', rune: CHAIN_I }),
    );
    // The floor clears, and everything left comes in.
    w.monsters = [];
    run(w, 1);
    expect(w.pending.runes).toEqual([CHAIN_I, SPLIT_I]);
  });

  it("banking puts the runes picked up in the floor's haul, counts them for the dive, and reports them", () => {
    const { p, w } = floor();
    w.pending.runes = [SPLIT_I, SPLIT_I, CHAIN_II];
    const res = bankWorld(registry, p, w);
    expect(res.runes).toEqual([SPLIT_I, SPLIT_I, CHAIN_II]);
    expect(res.profile.runes).toEqual(p.runes);
    const { runes } = res.profile.dive!.haul;
    expect(runes).toEqual({ split: [2, 0, 0, 0, 0], chain: [0, 1, 0, 0, 0] });
    expect(res.profile.dive!.runesEarned).toBe(3);
    expect(w.pending.runes).toEqual([]);
    const again = bankWorld(registry, res.profile, w);
    expect(again.runes).toEqual([]);
    expect(again.profile.dive!.runesEarned).toBe(3);
  });

  it("banking settles an auto-salvaged weapon's runes by the pull mode it is given, and so does a floor's end", () => {
    const { p, w } = floor();
    const auto = setAutoSalvage(p, 'rare', true);
    w.pending.items = [socketedSword()];
    expect(bankWorld(registry, auto, w, { unsocket: 'pay' }).profile.runes).toEqual({
      chain: [0, 1, 0, 0, 0],
      split: [1, 0, 0, 0, 0],
    });
    w.pending.items = [socketedSword()];
    expect(failFloor(registry, auto, w, { unsocket: 'pay' }).profile.runes).toEqual({
      chain: [0, 1, 0, 0, 0],
      split: [1, 0, 0, 0, 0],
    });
    w.pending.items = [socketedSword()];
    expect(bankWorld(registry, auto, w).profile.runes).toEqual({});
  });
});

describe("the stop's fifth kind: socket a rune", () => {
  /** `p` diving, on the door screen after depth 1, its stop offering `offers`. */
  const atStop = (p: DelveProfile, offers: StopKind[] = [...STOP_KINDS]): DelveProfile => {
    const diving = startDive(registry, p, 1);
    const stop = { offers, taken: false };
    const dive = { ...diving.dive!, phase: 'choosing' as const, depthsCleared: 1, stop };
    return { ...diving, dive: { ...dive, doorChoices: ['winding'] } };
  };

  it('applies with an empty socket and a pouch rune that fits its move and is not on it', () => {
    expect(STOP_KINDS).toEqual(['equip', 'slot', 'move', 'upgrade', 'rune']);
    const p = ready(); // the first Bolt: Split I and an empty socket; Chain I in the pouch
    expect(stopKinds(registry, p)).toContain('rune');
    expect(stopKinds(registry, { ...p, runes: {} })).not.toContain('rune');
    // Only Split: it is on that move already. Only Widen: it fits no Bolt and no bow blow.
    expect(stopKinds(registry, { ...p, runes: { split: [2, 0, 0, 0, 0] } })).not.toContain('rune');
    expect(stopKinds(registry, { ...p, runes: { widen: [1, 0, 0, 0, 0] } })).not.toContain('rune');
    expect(stopKinds(registry, { ...p, runes: { chain: [0, 0, 0, 0, 0] } })).not.toContain('rune');
    // No empty socket left: none.
    const full = setChains(registry, p, {
      primary: withRunes(primaryOf(p), 0, [SPLIT_I, CHAIN_I]),
    }).profile;
    expect(stopKinds(registry, { ...full, runes: p.runes })).not.toContain('rune');
    // A blow's empty socket counts too.
    const blow = openSocket(registry, full, 'basic', 0).profile;
    expect(stopKinds(registry, { ...blow, runes: p.runes })).toContain('rune');
  });

  it('sockets the rune for free with the lock lifted, and marks the stop taken', () => {
    const p = atStop(ready());
    const res = takeStop(registry, p, {
      kind: 'rune',
      skill: 'primary',
      index: 0,
      socket: 1,
      rune: CHAIN_I,
    });
    expect(res.ok).toBe(true);
    expect(primaryOf(res.profile).moves[0].runes).toEqual([SPLIT_I, CHAIN_I]);
    expect(res.profile).toMatchObject({ links: 10, scrap: 500, manaDust: 100 });
    expect(res.profile.runes.chain).toEqual([0, 0, 0, 0, 0]);
    expect(res.profile.dive!.stop!.taken).toBe(true);
  });

  it('refuses a filled socket, one not yet open, and what socketing refuses; the stop stays open', () => {
    const p = atStop(ready());
    const take = (index: number, socket: number, rune: RuneRef) =>
      takeStop(registry, p, { kind: 'rune', skill: 'primary', index, socket, rune });
    expect(take(0, 0, CHAIN_I)).toMatchObject({
      ok: false,
      profile: p,
      reason: 'Socket a rune into an empty socket',
    });
    expect(take(2, 0, CHAIN_I).reason).toBe('Socket a rune into an empty socket');
    expect(take(0, 0.5, CHAIN_I).reason).toBe('Socket a rune into an empty socket');
    expect(take(5, 0, CHAIN_I).reason).toBe('Socket a rune into a move the chain holds');
    expect(take(0, 1, { id: 'widen', tier: 1 }).reason).toBe("Widen doesn't fit a Bolt");
    expect(take(0, 1, { id: 'split', tier: 1 }).reason).toBe('A move takes one Split');
    expect(take(0, 1, { id: 'chain', tier: 2 }).reason).toBe('Not enough runes in your pouch');
    const elsewhere = atStop(ready(), ['equip', 'move']);
    const action = { kind: 'rune', skill: 'primary', index: 0, socket: 1, rune: CHAIN_I } as const;
    expect(takeStop(registry, elsewhere, action).reason).toBe('Not offered at this stop');
  });

  it("the 'move' stop keeps the saved move's runes, whatever the client sends", () => {
    const p = atStop(ready());
    const bolt = primaryOf(p).moves[0];
    const sent = { ...bolt, kind: 'heavy' as const, runes: [CHAIN_I, ECHO_I] };
    const res = takeStop(registry, p, { kind: 'move', skill: 'primary', index: 0, move: sent });
    expect(res.ok).toBe(true);
    expect(primaryOf(res.profile).moves[0]).toEqual({ ...bolt, kind: 'heavy' });
    expect(res.profile.runes).toEqual(p.runes);
    // Its form change is still refused while a rune wouldn't fit.
    const lance = { ...bolt, form: 'lance' as const };
    const formed = takeStop(registry, p, { kind: 'move', skill: 'primary', index: 0, move: lance });
    expect(formed.reason).toBe("Split doesn't fit a Lance");
    // A move without sockets stays without.
    const plain = primaryOf(p).moves[2];
    const third = takeStop(registry, p, {
      kind: 'move',
      skill: 'primary',
      index: 2,
      move: { ...plain, kind: 'heavy', runes: [null] },
    });
    expect(primaryOf(third.profile).moves[2]).toEqual({ ...plain, kind: 'heavy' });
  });

  it('rolls every stop as it did when the rune kind does not apply', () => {
    const ring = generateItem(
      registry,
      { uid: 'r1', ilvl: 2, rarity: 'magic', slot: 'ring', mana: 'fire' },
      new SeededRNG(1),
    );
    const p = { ...createDelveProfile(registry, 3, { primary: 'fire' }), bag: [ring] };
    const q = { ...p, links: 5, scrap: 1000 };
    const offers = Array.from({ length: 40 }, (_, i) => {
      const stop = rollStop(registry, q, { ...startDive(registry, q, 1).dive!, seed: i + 1 })!;
      return stop.offers.map((k) => k[0]).join('');
    });
    // v0.50.0's stops for these forty seeds.
    expect(offers.join(' ')).toBe(
      'smu em mu esu esm mu esm es smu emu emu mu su es mu esu su su mu es eu su emu sm esu emu emu su es mu em smu smu esm esu su mu sm es es',
    );
  });
});

describe('sockets on weapon drops', () => {
  it("opens the rarity's sockets, empty, over the moves it carries, never past a move's cap", () => {
    expect(R.socketDrops).toEqual({
      common: [0, 0],
      uncommon: [0, 0],
      magic: [0, 1],
      rare: [0, 1],
      epic: [1, 2],
      legendary: [2, 3],
    });
    for (const rarity of RARITY_ORDER) {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 80; seed++) {
        const m = weapon(rarity, seed).moveset!;
        seen.add(openSockets(m));
        for (const x of allMoves(m)) {
          expect(socketsOf(x).length).toBeLessThanOrEqual(R.socketCap[rarity]);
          expect(socketsOf(x).every((r) => r === null)).toBe(true);
        }
      }
      expect(Math.min(...seen)).toBe(R.socketDrops[rarity][0]);
      expect(Math.max(...seen)).toBe(R.socketDrops[rarity][1]);
    }
  });

  it('spreads them over every chain a weapon carries, basic blows included', () => {
    const got = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const m = weapon('legendary', seed).moveset!;
      for (const skill of CHAIN_SKILLS)
        if (openSockets({ chains: { [skill]: m.chains[skill] }, slots: {} }) > 0) got.add(skill);
    }
    expect([...got].sort()).toEqual(['basic', 'defensive', 'primary', 'ultimate']);
  });

  it('rolls from its own stream: the same seed gives the same sockets, and the moveset under them is as before', () => {
    expect(weapon('epic', 9).moveset).toEqual(weapon('epic', 9).moveset);
    for (let seed = 1; seed <= 20; seed++) {
      const w = weapon('legendary', seed);
      expect(bare(w.moveset!)).toEqual(defaultMoveset(registry, w, 'storm', w.moveset!.slots));
    }
  });
});
