import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials } from '../src/loot/materials.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
import {
  defaultChain,
  defaultMoveset,
  heroChains,
  moveAllPreview,
  slotRange,
  weaponParts,
} from '../src/loot/moveset.js';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { betweenDives } from '../src/delve/autopilot.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import {
  OPEN_SKILL_TEXT,
  addSlot,
  movesetEditPrice,
  movesOf,
  sameChain,
  setChain,
  setChains,
  slotPrice,
} from '../src/delve/moveset.js';
import { moveAll } from '../src/delve/constructs.js';
import { bindSecondary, chooseStartingMana, reattuneItem } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
  mintMoveset,
  equipBest,
  equipItem,
  parseDelveProfile,
  profilePower,
  reforgeGear,
  salvageCandidates,
  salvageItems,
  setAutoSalvage,
  unequipSlot,
  upgradeGear,
} from '../src/delve/profile.js';
import {
  abilityReady,
  nextMove,
  pressIndex,
  pressMove,
  pressStep,
} from '../src/arpg/abilities/cast.js';
import { gainCharge } from '../src/arpg/abilities/defend.js';
import { botInput } from '../src/arpg/bot.js';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { fillCharge, setSandboxToggles } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { compareItem, computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import {
  CHAIN_SKILLS,
  type Blow,
  type Chain,
  type Chains,
  type ChainSkill,
  type Construct,
  type Move,
} from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';
import { RARITY_ORDER } from '../src/types/gear.js';
import {
  DEFAULT_CHAINS,
  STEP,
  arena,
  bal,
  chainsOf,
  dummy,
  gear,
  press,
  pressOnly,
  registry,
  run,
  withChains,
  withUids,
} from './fixtures/arena.js';
import { armed } from './fixtures/carries.js';

// See the weapon movesets spec, as the constructs spec §3 rewrites it: the weapon is a frame
// with slots by rarity, holding constructs with uids.

const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
  generateItem(
    registry,
    { uid: `w${seed}`, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'storm' },
    new SeededRNG(seed),
  );

/** A chain's constructs without their uids. */
const bare = <C extends Chains[ChainSkill] | undefined>(c: C): C =>
  JSON.parse(
    JSON.stringify(c, (k, v) =>
      k === 'uid' && typeof v === 'string' && v.startsWith('c') ? undefined : v,
    ),
  );

describe('data: movesets', () => {
  it('loads the slot table, the extra slots, Open a skill and the prices', () => {
    const m = bal.movesets;
    expect(m.slots.common).toEqual({ basic: [0, 3], primary: [2, 3], defensive: [0, 1], ultimate: [0, 0] });
    expect(m.slots.legendary).toEqual({ basic: [0, 5], primary: [4, 5], defensive: [3, 5], ultimate: [2, 5] });
    expect(m.extraSlots).toEqual({
      common: [0, 0],
      uncommon: [0, 0],
      magic: [0, 1],
      rare: [1, 2],
      epic: [2, 3],
      legendary: [3, 4],
    });
    expect(m.slotLinks).toEqual([1, 2, 3, 4]);
    expect(m.slotScrap).toEqual([20, 40, 60, 80]);
    expect([m.editDust, m.elementDust, m.salvageDust]).toEqual([5, 15, 0]);
    expect(m.openSkill.common).toEqual({ flux: { uncommon: 2 }, links: 1, scrap: 40 });
    expect(m).not.toHaveProperty('carries');
    expect(m).not.toHaveProperty('transferScrap');
  });

  it('refuses extra slots that fall, and a slot row short of a skill', () => {
    const withMovesets = (movesets: object) => ({
      ...balanceData,
      delve: { ...balanceData.delve, movesets: { ...balanceData.delve.movesets, ...movesets } },
    });
    const extraSlots = { ...balanceData.delve.movesets.extraSlots, rare: [2, 1] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ extraSlots })).success).toBe(false);
    const { ultimate: _u, ...short } = balanceData.delve.movesets.slots.rare;
    const slots = { ...balanceData.delve.movesets.slots, rare: short };
    expect(BalanceConfigSchema.safeParse(withMovesets({ slots })).success).toBe(false);
  });
});

describe('slot ranges', () => {
  it("gives the basic chain its weapon's string as its start (unarmed, the hero's), the rest the table's", () => {
    expect(slotRange(registry, { baseId: 'sword', rarity: 'common' }, 'basic')).toEqual([3, 3]);
    expect(slotRange(registry, { baseId: 'maul', rarity: 'epic' }, 'basic')).toEqual([2, 5]);
    expect(slotRange(registry, { baseId: 'dagger', rarity: 'common' }, 'basic')).toEqual([4, 4]);
    expect(slotRange(registry, { baseId: null, rarity: null }, 'basic')).toEqual([3, 3]);
    for (const skill of ['primary', 'defensive', 'ultimate'] as const) {
      expect(slotRange(registry, { baseId: 'sword', rarity: 'rare' }, skill)).toEqual(
        bal.movesets.slots.rare[skill],
      );
      expect(slotRange(registry, { baseId: null, rarity: null }, skill)).toEqual([0, 0]);
    }
  });
});

describe('default moves', () => {
  it("fills a moveset at its starts: the weapon's string, and each skill's class default form", () => {
    const m = defaultMoveset(registry, { baseId: 'sword', rarity: 'uncommon' }, 'frost');
    expect(m.slots).toEqual({ basic: 3, primary: 2, defensive: 1 });
    expect(m.bought).toEqual({});
    expect(m.chains).toEqual({
      basic: [
        { kind: 'light', element: 'frost' },
        { kind: 'light', element: 'frost' },
        { kind: 'heavy', element: 'frost' },
      ],
      primary: {
        moves: [
          { kind: 'medium', form: 'strike', elements: ['frost'] },
          { kind: 'medium', form: 'strike', elements: ['frost'] },
        ],
        payment: 'mana',
      },
      defensive: { moves: [{ kind: 'medium', form: 'ward', elements: ['frost'] }], payment: 'mana' },
    });
    const epic = defaultMoveset(registry, { baseId: 'bow', rarity: 'epic' }, 'fire');
    expect(epic.slots).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 1 });
    expect(epic.chains.primary!.moves.map((x) => [x.kind, x.form])).toEqual([
      ['light', 'bolt'],
      ['medium', 'bolt'],
      ['medium', 'bolt'],
      ['heavy', 'bolt'],
    ]);
    expect(epic.chains.ultimate).toEqual({
      moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }],
      payment: 'charge',
    });
  });

  it("plays the class default form's chain in order, then medium past its end", () => {
    const kinds = (c: Chain) => c.moves.map((m) => m.kind);
    expect(kinds(defaultChain(registry, 'primary', 'sword', 'fire', 5))).toEqual([
      'medium',
      'medium',
      'heavy',
      'heavy',
      'medium',
    ]);
    expect(kinds(defaultChain(registry, 'primary', 'bow', 'fire', 5))).toEqual([
      'light',
      'medium',
      'medium',
      'heavy',
      'medium',
    ]);
    expect(kinds(defaultChain(registry, 'ultimate', 'sword', 'fire', 2))).toEqual([
      'medium',
      'medium',
    ]);
    const blows = (b: Blow[]) => b.map((x) => x.kind);
    expect(blows(defaultChain(registry, 'basic', 'maul', 'fire', 4))).toEqual([
      'medium',
      'heavy',
      'medium',
      'medium',
    ]);
  });

  it('gives unarmed its default moveset in the element asked for', () => {
    const m = defaultMoveset(registry, { baseId: null, rarity: null }, 'nature');
    expect(m.slots).toEqual({ basic: 3 });
    expect(m.chains.basic).toEqual(
      bal.hero.defaultChain.map((kind) => ({ kind, element: 'nature' })),
    );
  });
});

describe('drops: extra slots by rarity', () => {
  /** A drop's slots past its starts, over the skills it has. */
  const extra = (w: GearItem) =>
    CHAIN_SKILLS.reduce(
      (n, s) => n + Math.max(0, (w.moveset!.slots[s] ?? 0) - slotRange(registry, w, s)[0]),
      0,
    );

  it("rolls the rarity's extra slots over the skills it starts with, never a skill at 0, every slot a plain construct in its mana, none bought", () => {
    for (const rarity of RARITY_ORDER) {
      const seen = new Set<number>();
      const starts = Object.keys(defaultMoveset(registry, { baseId: 'sword', rarity }, 'storm').chains);
      for (let seed = 1; seed <= 60; seed++) {
        const w = weapon(rarity, seed, 'sword');
        const m = w.moveset!;
        expect(Object.keys(m.chains).sort()).toEqual([...starts].sort());
        expect(m.bought).toEqual({});
        seen.add(extra(w));
        for (const s of CHAIN_SKILLS)
          if (m.slots[s]) expect(m.slots[s]).toBeLessThanOrEqual(slotRange(registry, w, s)[1]);
        expect(unsocketed(m)).toEqual(defaultMoveset(registry, w, 'storm', m.slots));
      }
      const [least, most] = bal.movesets.extraSlots[rarity];
      expect(Math.min(...seen)).toBe(least);
      expect(Math.max(...seen)).toBe(most);
    }
  });

  it('spreads extra slots over every skill a weapon starts with', () => {
    const got = new Set<ChainSkill>();
    for (let seed = 1; seed <= 60; seed++) {
      const w = weapon('legendary', seed, 'sword');
      for (const s of CHAIN_SKILLS)
        if ((w.moveset!.slots[s] ?? 0) > slotRange(registry, w, s)[0]) got.add(s);
    }
    expect([...got].sort()).toEqual(['basic', 'defensive', 'primary', 'ultimate']);
  });

  it('never grows a skill past its ceiling: a common dagger basic string of 4 stays at 4', () => {
    for (let seed = 1; seed <= 20; seed++)
      expect(weapon('common', seed, 'dagger').moveset!.slots.basic).toBe(4);
  });

  it('gives no moveset to gear other than weapons', () => {
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 2, rarity: 'legendary', slot: 'chest' },
      new SeededRNG(1),
    );
    expect(chest.moveset).toBeUndefined();
  });
});

describe('determinism', () => {
  it('rolls the same moveset from the same seed', () => {
    expect(weapon('epic', 9).moveset).toEqual(weapon('epic', 9).moveset);
  });

  it('leaves every other item stat as v0.48.0 rolled them, and the drop tables roll the same gear', () => {
    const items: GearItem[] = [];
    for (let seed = 1; seed <= 30; seed++)
      for (const rarity of RARITY_ORDER)
        items.push(
          generateItem(
            registry,
            { uid: `g${seed}`, ilvl: seed, rarity, biomeMana: 'frost', pair: ['fire', 'storm'] },
            new SeededRNG(seed),
          ),
        );
    const rng = new SeededRNG(7);
    let ctx = {
      depth: 5,
      gear: 1,
      nextUid: 1,
      biomeMana: 'earth' as const,
      pair: ['fire' as const],
    };
    for (let i = 0; i < 40; i++) {
      const kind = i % 3 ? ('elite' as const) : ('boss' as const);
      const r = rollEncounterDrops(registry, { ...ctx, kind }, rng);
      items.push(...r.items);
      ctx = { ...ctx, nextUid: r.nextUid };
    }
    // `hones` (0 on every item) is new since: the rolls are as they were.
    const strip = items.map(({ moveset: _m, hones: _h, ...rest }) => rest);
    let h = 0x811c9dc5;
    for (const c of JSON.stringify(strip)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    // v0.48.0's 180 generated items, then stage 4c's drop-table gear (B1), hashed the same way;
    // since the guided start, a depth-5 legendary rolls as an epic (`essenceAllowed`).
    expect([items.length, h.toString(16)]).toEqual([204, '3b6bac46']);
  });
});

describe('save schema: a weapon moveset', () => {
  // A saved construct carries its uid (save v14): the drop's moveset minted first.
  const sword = (() => {
    const w = weapon('uncommon', 1, 'sword');
    const [moveset] = mintMoveset(createDelveProfile(registry, 1), w.moveset!);
    return { ...w, moveset };
  })();

  it('reads an item with a moveset, and one without; `bought` defaults to none', () => {
    expect(GearItemSchema.safeParse(sword).success).toBe(true);
    const { moveset: _m, ...old } = sword;
    expect(GearItemSchema.safeParse(old).success).toBe(true);
    const { bought: _b, ...noBought } = sword.moveset!;
    expect(GearItemSchema.parse({ ...sword, moveset: noBought }).moveset!.bought).toEqual({});
  });

  it('refuses a chain longer than its slots, a chain without slots, slots without a chain, and a Basic with no blow; an empty ability chain is fine', () => {
    const m = sword.moveset!;
    const bad = (moveset: object) => GearItemSchema.safeParse({ ...sword, moveset }).success;
    expect(bad({ ...m, slots: { ...m.slots, basic: 2 } })).toBe(false);
    expect(bad({ ...m, slots: { basic: 3 } })).toBe(false);
    expect(bad({ ...m, slots: { ...m.slots, ultimate: 1 } })).toBe(false);
    expect(bad({ ...m, slots: { ...m.slots, primary: 5 } })).toBe(true);
    expect(bad({ ...m, chains: { ...m.chains, basic: [] } })).toBe(false);
    expect(bad({ ...m, chains: { ...m.chains, primary: { moves: [], payment: 'mana' } } })).toBe(
      true,
    );
  });
});

describe('an absent skill (a null chain)', () => {
  const PRIMARY_ONLY = { primary: DEFAULT_CHAINS.primary };
  const casts = (events: ArpgEvent[]) =>
    events.filter((e) => e.kind === 'windup' || e.kind === 'cast').map((e) => e.slot);

  it('sets the hero up with no chain for a skill left out, every slot keeping its place', () => {
    const w = arena([dummy(13, 30)], { chains: PRIMARY_ONLY, noBasic: true });
    expect(w.hero.chains.map((c) => c && c.moves[0].form.id)).toEqual(['bolt', null, null]);
    expect(w.hero.cooldowns).toEqual([[0], [], []]);
  });

  it('refuses a press or a hold of it, and names no move for it', () => {
    const w = arena([dummy(13, 30)], { chains: PRIMARY_ONLY, noBasic: true });
    const ctx = makeCtx(registry, w, []);
    expect([0, 1, 2].map((s) => abilityReady(ctx, s))).toEqual([true, false, false]);
    expect(casts([...press(w, 1), ...press(w, 2)])).toEqual([]);
    for (let i = 0; i < 10; i++) stepWorld(registry, w, { move: { x: 0, y: 0 }, holding: 2 }, STEP);
    expect(w.hero.hold).toBeNull();
    expect(pressStep(w.hero, 2, w.t, 1)).toBe(0);
    expect(nextMove(w.hero, 1, w.t, 1)).toBeNull();
    expect(pressMove(w.hero, 2, w.t, 1)).toBeNull();
    expect(casts(press(w, 0))).toEqual([0, 0]);
  });

  it("names the move a press now casts: during the slot's wind-up, the one after it (pressIndex)", () => {
    const heavy = { kind: 'heavy' as const, form: 'bolt' as const, elements: ['fire' as const] };
    const chains = { primary: { moves: [heavy, heavy], payment: 'mana' as const } };
    const w = arena([dummy(13, 30)], { chains, noBasic: true });
    pressOnly(w, 0);
    expect(w.hero.windup?.step).toBe(0);
    expect(pressIndex(w.hero, 0, w.t, 1)).toBe(1);
    expect(pressMove(w.hero, 0, w.t, 1)).toBe(w.hero.chains[0]!.moves[1]);
    expect(pressIndex(w.hero, 2, w.t, 1)).toBe(0);
  });

  it("fills no charge meter for it, nor do the Training Grounds' top-ups", () => {
    const primary = { ...DEFAULT_CHAINS.primary, payment: 'charge' as const };
    const w = arena([dummy(13, 30)], { chains: { primary }, noBasic: true });
    gainCharge(makeCtx(registry, w, []), 1e9);
    expect(w.hero.charge[0]).toBeGreaterThan(0);
    expect(w.hero.charge.slice(1)).toEqual([0, 0]);
    setSandboxToggles(w, { infiniteMana: false, noCooldowns: true, invulnerable: false });
    fillCharge(w);
    run(w, 0.2);
    expect(w.hero.charge.slice(1)).toEqual([0, 0]);
  });

  it('Galvanize and Nightstalker pass over it', () => {
    const w = arena([dummy(13, 30), dummy(15, 30)], { chains: PRIMARY_ONLY, noBasic: true });
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const h = w.hero;
    h.cooldowns[0] = [w.t + 2];
    applyStatus(ctx, w.monsters[0], 'shock', 0);
    hitMonster(ctx, w.monsters[0], 10, 'nature', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction' && e.reaction === 'galvanize')).toBe(true);
    expect(h.cooldowns).toEqual([[w.t + 2 - bal.reactions.galvanizeSeconds], [], []]);
    h.stats.legendaries.nightstalker = 30;
    killMonster(ctx, w.monsters[1]);
    expect(h.cooldowns[1]).toEqual([]);
    expect(h.charge).toEqual([0, 0, 0]);
  });

  it('the bot never reaches for it', () => {
    const foes = [dummy(13, 34), dummy(14, 34), dummy(12, 34), dummy(13, 33)];
    const w = arena(foes, { chains: PRIMARY_ONLY });
    w.hero.hp = w.hero.stats.maxHp / 2; // it would guard, and the crowd calls for the Ultimate
    const events: ArpgEvent[] = [];
    for (let i = 0; i < 3 / STEP; i++)
      events.push(...stepWorld(registry, w, botInput(registry, w), STEP));
    expect(new Set(casts(events))).toEqual(new Set([0]));
  });

  it('a chain swapped out mid-floor ends its effect; swapped back in, it is ready', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    press(w, 1);
    expect(w.hero.defend).not.toBeNull();
    refreshWorldHero(registry, w, w.hero.stats, PRIMARY_ONLY);
    expect(w.hero.chains.map((c) => c !== null)).toEqual([true, false, false]);
    expect([w.hero.defend, w.hero.ward]).toEqual([null, null]);
    expect(w.hero.cooldowns.slice(1)).toEqual([[], []]);
    refreshWorldHero(registry, w, w.hero.stats, DEFAULT_CHAINS);
    expect(w.hero.cooldowns[1]).toEqual([0]);
    expect(casts(press(w, 1))).toEqual([1, 1]);
  });

  it('counts nothing toward Power: no Defensive means no guard and no mitigation', () => {
    const stats = computeHeroStats({ weapon: gear('fire') }, registry);
    const est = (chains: Parameters<typeof estimateCombat>[3]) =>
      estimateCombat(stats, registry, 5, chains);
    const none = est({});
    const primary = est(PRIMARY_ONLY);
    expect(primary.dps).toBeGreaterThan(none.dps);
    expect(primary.ehp).toBe(none.ehp);
    const armor = {
      moves: [{ kind: 'medium' as const, form: 'armor' as const, elements: ['earth' as const] }],
      payment: 'mana' as const,
    };
    expect(est({ ...PRIMARY_ONLY, defensive: armor }).ehp).toBeGreaterThan(primary.ehp);
    expect(est({ ...PRIMARY_ONLY, ultimate: DEFAULT_CHAINS.ultimate }).dps).toBeGreaterThan(
      primary.dps,
    );
  });
});

describe('a save: fitting its weapons to the data at load', () => {
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));

  it("gives a weapon without a moveset its defaults, minted; keeps a kept chain's slots; a missing uid is refused (save v14)", () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const { moveset: _m, ...bare } = weapon('magic', 6, 'bow');
    const [rareMoveset, p] = mintMoveset(p0, weapon('rare', 5, 'axe').moveset!);
    const rare = { ...weapon('rare', 5, 'axe'), moveset: rareMoveset };
    const [one, two] = rare.moveset!.chains.basic!;
    const bag = [
      bare, // no moveset: its defaults, minted
      {
        ...rare,
        moveset: {
          chains: { basic: [one, two], primary: rare.moveset!.chains.primary },
          slots: { basic: 2, primary: rare.moveset!.slots.primary },
          bought: {},
        },
      }, // two skills left out and a short basic string: kept as they are
    ];
    // Unminted, the rare's constructs refuse the save.
    expect(parseDelveProfile(registry, json({ ...p, bag: [weapon('rare', 5, 'axe')] }))).toBeNull();
    const loaded = parseDelveProfile(registry, json({ ...p, bag }))!;
    expect('profile' in loaded).toBe(true);
    const fitted = (loaded as { profile: DelveProfile }).profile.bag;
    expect(JSON.parse(JSON.stringify(fitted[0].moveset, (k, v) => (k === 'uid' ? undefined : v)))).toEqual(
      JSON.parse(JSON.stringify(defaultMoveset(registry, bare, 'storm'))),
    );
    expect(fitted[1].moveset!.slots).toEqual({ basic: 2, primary: rare.moveset!.slots.primary });
    expect(fitted[1].moveset!.chains.defensive).toBeUndefined();
    const ids = [fitted[0], fitted[1]].flatMap((w) =>
      CHAIN_SKILLS.flatMap((s) => movesOf(w.moveset!.chains[s]).map((c) => c.uid)),
    );
    expect(ids.every((u) => /^c\d+$/.test(u!))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the edit price (movesetEditPrice): by uid', () => {
  const E = bal.movesets.editDust;
  const X = bal.movesets.elementDust;
  const strike = (uid: string | null, kind: Move['kind'], ...elements: ManaType[]): Move => ({
    ...(uid && { uid }),
    kind,
    form: 'strike',
    elements,
  });
  const chain = (...moves: Move[]): Chain => ({ moves, payment: 'mana' });
  const price = (old: Chain, next: Chain) =>
    movesetEditPrice(registry, { primary: old }, { primary: next });
  const A = strike('a', 'light', 'fire');
  const B = strike('b', 'medium', 'fire');
  const C = strike('c', 'heavy', 'storm');

  it('a construct kept is free wherever it sits; one removed or new costs editDust', () => {
    expect(price(chain(A, B, C), chain(A, B, C))).toBe(0);
    expect(price(chain(A, B, C), chain(C, B, A))).toBe(0);
    expect(price(chain(A, B, C), chain(A, C))).toBe(E);
    expect(price(chain(A, B, C), chain(B, C))).toBe(E);
    expect(price(chain(A, C), chain(A, strike(null, 'medium', 'fire'), C))).toBe(E); // Fire is a saved construct's element
    expect(price(chain(A, C), chain(A, strike('new', 'medium', 'fire'), C))).toBe(E);
    // A removed construct and a new one alike: a removal and a new move.
    expect(price(chain(A, B), chain(A, strike(null, 'medium', 'fire')))).toBe(2 * E);
  });

  it("a kept construct's changed kind or form costs editDust, its changed elements elementDust", () => {
    expect(price(chain(A, B), chain(A, { ...B, kind: 'heavy' }))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, form: 'lance' }))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, elements: ['storm'] }))).toBe(X);
    expect(price(chain(A, B), chain(A, { ...B, elements: ['fire', 'storm'] }))).toBe(X);
    expect(price(chain(A, B), chain(A, { ...B, kind: 'heavy', elements: ['storm', 'fire'] }))).toBe(
      E + X,
    );
  });

  it('a new element set is charged once per Apply, however many constructs take it', () => {
    const fire: Blow = { uid: 'f', kind: 'light', element: 'fire' };
    const storm: Blow = { uid: 's', kind: 'light', element: 'storm' };
    const blows = (old: Blow[], next: Blow[]) =>
      movesetEditPrice(registry, { basic: old }, { basic: next });
    expect(blows([fire], [fire, { ...storm, uid: undefined }])).toBe(E + X);
    expect(blows([fire, storm], [fire, storm, { ...storm, uid: undefined }])).toBe(E);
    expect(blows([fire], [fire, { kind: 'light', element: 'storm' }, { kind: 'heavy', element: 'storm' }])).toBe(2 * E + X);
    // Two constructs re-coloured to one new set, and a new one in it: Storm charged once.
    expect(
      price(chain(A, B), chain({ ...A, elements: ['storm'] }, { ...B, elements: ['storm'] }, { ...C, uid: undefined })),
    ).toBe(X + E);
  });

  it('is 0 only for the same constructs, in any order (random chains)', () => {
    const rng = new SeededRNG(7);
    const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(0, xs.length - 1)];
    const kinds: Move['kind'][] = ['light', 'heavy', 'hold'];
    const sets: ManaType[][] = [['fire'], ['storm'], ['frost'], ['fire', 'storm'], ['storm', 'fire']];
    const forms = ['strike', 'lance'] as const;
    /** A random chain over the uids `pool`, each at most once (a construct without a uid is new by contract: none here). */
    const randomChain = (pool: string[]): Chain => {
      const free = [...pool];
      return {
        moves: Array.from({ length: rng.nextInt(1, 5) }, () => ({
          uid: free.splice(rng.nextInt(0, free.length - 1), 1)[0],
          kind: pick(kinds),
          form: pick(forms),
          elements: pick(sets),
        })),
        payment: pick(['mana', 'cast'] as const),
      };
    };
    const same = (a: Chain, b: Chain) =>
      a.moves.length === b.moves.length &&
      a.payment === b.payment &&
      a.moves.every((m, i) => JSON.stringify(m) === JSON.stringify(b.moves[i]));
    let bad = 0;
    for (let n = 0; n < 4000; n++) {
      const pool = ['p', 'q', 'r', 's', 't'];
      const [a, b] = [randomChain(pool), randomChain(pool)];
      const p = (x: Chain, y: Chain) => movesetEditPrice(registry, { primary: x }, { primary: y });
      if (p(a, b) < 0) bad++;
      if (p(a, a) !== 0) bad++;
      const reordered = { ...a, moves: [...a.moves].reverse() };
      if (p(a, reordered) !== 0) bad++;
      if (p(a, b) === 0 && !same(a, { ...b, moves: a.moves.map((m) => b.moves.find((x) => x.uid === m.uid)!) })) bad++;
    }
    expect(bad).toBe(0);
  });

  it('a changed payment costs editDust; blows price the same way; chains left out cost nothing', () => {
    expect(price(chain(A), { moves: [A], payment: 'cast' })).toBe(E);
    const fire: Blow = { uid: 'f', kind: 'light', element: 'fire' };
    const heavy: Blow = { uid: 'h', kind: 'heavy', element: 'fire' };
    const blows = (old: Blow[], next: Blow[]) =>
      movesetEditPrice(registry, { basic: old }, { basic: next });
    expect(blows([fire, { ...fire, uid: 'f2' }, heavy], [fire, heavy])).toBe(E);
    expect(blows([fire, heavy], [fire, { ...heavy, element: 'frost' }])).toBe(X);
    const old = { basic: [fire], primary: chain(A) };
    expect(movesetEditPrice(registry, old, { primary: chain(B) })).toBe(2 * E);
    expect(movesetEditPrice(registry, old, { basic: [heavy], primary: chain(A) })).toBe(2 * E);
  });

  it('a rune is no part of the Dust: a socket or a rune alone costs none', () => {
    const socketed: Move = { ...A, runes: [{ id: 'quick', tier: 1 }, null] };
    expect(price(chain(A), chain(socketed))).toBe(0);
  });
});

describe('edits: setChain and setChains', () => {
  /** A Fire hero past its first dive, with 20 Mana Dust and an uncommon sword. */
  const veteran = (): DelveProfile => {
    const p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
    return { ...p, manaDust: 20, stats: { ...p.stats, dives: 1 } };
  };

  it('edits the equipped weapon for its price; nothing before the first dive, nothing unchanged', () => {
    const fresh = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
    const heavier = (p: DelveProfile): Chain => {
      const c = chainsOf(p).primary!;
      return { ...c, moves: c.moves.map((m, i) => (i === 0 ? { ...m, kind: 'heavy' } : m)) };
    };
    const free = setChain(registry, fresh, 'primary', heavier(fresh));
    expect(free.ok).toBe(true);
    expect(chainsOf(free.profile).primary).toEqual(heavier(fresh));
    expect(free.profile.manaDust).toBe(0);
    const paid = setChain(registry, veteran(), 'primary', heavier(veteran()));
    expect(paid.profile.manaDust).toBe(20 - bal.movesets.editDust);
    const same = setChain(registry, veteran(), 'primary', chainsOf(veteran()).primary!);
    expect(same.profile.manaDust).toBe(20);
    const poor = { ...veteran(), manaDust: bal.movesets.editDust - 1 };
    expect(setChain(registry, poor, 'primary', heavier(poor))).toEqual({
      ok: false,
      profile: poor,
      reason: 'Not enough Mana Dust',
    });
  });

  it('refuses mid-dive, unarmed, a skill with no slot, and more moves than slots', () => {
    const p = veteran();
    const one: Chain = { moves: [{ kind: 'light', form: 'lance', elements: ['fire'] }], payment: 'mana' };
    const reason = (q: DelveProfile, skill: 'primary' | 'defensive' | 'ultimate', c = one) =>
      setChain(registry, q, skill, c).reason;
    expect(reason(startDive(registry, p, 1), 'primary')).toBe(
      'Chains can only change between dives',
    );
    expect(reason(unequipSlot(registry, p, 'weapon'), 'primary')).toBe(
      'Equip a weapon to build your moves',
    );
    const nova = { moves: [{ ...one.moves[0], form: 'nova' as const }], payment: 'charge' as const };
    expect(reason(p, 'ultimate', nova)).toBe(OPEN_SKILL_TEXT);
    const three = { ...one, moves: [one.moves[0], one.moves[0], one.moves[0]] };
    expect(reason(p, 'primary', three)).toBe('A chain holds 0 to 2 moves');
  });

  it('keeps, moves and removes off-pair constructs, but never adds, copies or re-colours one', () => {
    const p0 = bindSecondary(registry, veteran(), 'storm').profile;
    const lance = (uid: string, ...elements: ManaType[]): Move => ({ uid, kind: 'light', form: 'lance', elements });
    const [F, N, NF] = [lance('F', 'fire'), lance('N', 'nature'), lance('NF', 'nature', 'fire')];
    const F2 = { ...F, uid: 'F2' };
    const p = {
      ...withChains(p0, { primary: { moves: [F, N, NF, F2], payment: 'mana' } }),
      manaDust: 999,
    };
    const ok = (...moves: Move[]) => setChain(registry, p, 'primary', { moves, payment: 'mana' });
    expect(ok(F, N, NF, F2).ok).toBe(true); // kept
    expect(ok(N, F, F2, NF).ok).toBe(true); // moved
    expect(ok(F, NF).ok).toBe(true); // removed
    expect(ok(F, N, NF, { ...N, uid: 'N2', kind: 'heavy' }).reason).toBe('Pick from your two elements'); // copied
    expect(ok(F, N, NF, { ...lance('x', 'frost'), uid: undefined }).reason).toBe('Pick from your two elements'); // added
    expect(ok(F, { ...N, elements: ['frost'] }, NF, F2).reason).toBe('Pick from your two elements'); // re-coloured
    expect(ok(F, { ...N, kind: 'heavy' }, NF, F2).ok).toBe(true); // its kind changed
    expect(ok(F, N, { ...NF, elements: ['fire', 'nature'] }, F2).ok).toBe(true); // its elements' order: the same set
    const blows: Blow[] = [
      { uid: 'b1', kind: 'light', element: 'fire' },
      { uid: 'b2', kind: 'heavy', element: 'nature' },
    ];
    const b = { ...withChains(p0, { basic: blows }), manaDust: 999 };
    expect(setChain(registry, b, 'basic', [...blows].reverse()).ok).toBe(true);
    expect(setChain(registry, b, 'basic', [blows[1], { ...blows[1], uid: 'b3' }]).reason).toBe(
      'Pick from your two elements',
    );
  });

  it('setChains applies every chain or none, for their total', () => {
    const p = veteran();
    const [, , heavy] = chainsOf(p).basic!;
    const basic: Blow[] = [heavy];
    const primary = chainsOf(p).primary!;
    const heavier: Chain = { ...primary, moves: primary.moves.map((m, i) => (i === 0 ? { ...m, kind: 'heavy' } : m)) };
    // Two blows removed and a kind changed: 3 × editDust.
    const both = setChains(registry, p, { basic, primary: heavier });
    expect(both.ok).toBe(true);
    expect(chainsOf(both.profile)).toEqual({ basic, primary: heavier, defensive: chainsOf(p).defensive });
    expect(both.profile.manaDust).toBe(20 - 3 * bal.movesets.editDust);
    const poor = { ...p, manaDust: 3 * bal.movesets.editDust - 1 };
    expect(setChains(registry, poor, { basic, primary: heavier })).toMatchObject({
      ok: false,
      profile: poor,
      reason: 'Not enough Mana Dust',
    });
    const nova = {
      moves: [{ kind: 'medium' as const, form: 'nova' as const, elements: ['fire' as const] }],
      payment: 'charge' as const,
    };
    expect(setChains(registry, p, { primary: heavier, ultimate: nova })).toMatchObject({
      ok: false,
      profile: p,
    });
  });

  it('sameChain reads a reorder as a change, and the same constructs in order as none', () => {
    const p = veteran();
    const c = chainsOf(p).primary!;
    const [a, b] = c.moves;
    expect(sameChain(c, { ...c, moves: [a, b] })).toBe(true);
    expect(sameChain(c, { ...c, moves: [b, a] })).toBe(false);
    expect(sameChain(c, { ...c, moves: [{ ...a, uid: undefined }, b] })).toBe(true); // no uid: by what it is
  });
});

describe('slots: addSlot', () => {
  /** A Fire hero with an uncommon sword and plenty of Links and scrap. */
  const rich = (
    p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' })),
  ): DelveProfile => ({
    ...p,
    links: 99,
    scrap: 9999,
  });

  it("prices a slot by its position: an uncommon sword's 3rd Primary slot 2 Links; its Basic at its ceiling and its Ultimate at 0 slots have none", () => {
    const sword = rich().equipped.weapon!;
    expect(slotPrice(registry, sword, 'primary')).toEqual({ links: 2, scrap: 40 });
    expect(slotPrice(registry, sword, 'basic')).toBeNull();
    expect(slotPrice(registry, sword, 'defensive')).toEqual({ links: 1, scrap: 20 });
    expect(slotPrice(registry, sword, 'ultimate')).toBeNull();
    const res = addSlot(registry, rich(), 'primary');
    expect(res.profile).toMatchObject({ links: 97, scrap: 9959 });
    expect(slotPrice(registry, res.profile.equipped.weapon!, 'primary')).toBeNull(); // the ceiling, 3
    expect(movesOf(chainsOf(res.profile).primary).map((m) => m.uid).every((u) => /^c\d+$/.test(u!))).toBe(true);
    expect(res.profile.equipped.weapon!.moveset!.bought).toEqual({ primary: 1 });
  });

  it("appends the default kind at the chain's end, in the last move's form and in-pair elements, minted", () => {
    const p = rich();
    const primary = addSlot(registry, p, 'primary').profile;
    expect(bare(chainsOf(primary).primary!.moves)).toEqual([
      { kind: 'medium', form: 'strike', elements: ['fire'] },
      { kind: 'medium', form: 'strike', elements: ['fire'] },
      { kind: 'heavy', form: 'strike', elements: ['fire'] },
    ]);
    expect(primary.equipped.weapon!.moveset!.slots.primary).toBe(3);
    // A Lance's default chain, [medium, medium, heavy], at the new move's place.
    const lance: Chain = {
      moves: [{ kind: 'heavy', form: 'lance', elements: ['fire', 'storm'] }],
      payment: 'cast',
    };
    const bound = rich(withChains(bindSecondary(registry, p, 'storm').profile, { primary: lance }));
    expect(bare(chainsOf(addSlot(registry, bound, 'primary').profile).primary!.moves[1])).toEqual({
      kind: 'medium',
      form: 'lance',
      elements: ['fire', 'storm'],
    });
    // A blow past a legendary sword's string of three: medium.
    const legendary = rich({ ...p, equipped: { ...p.equipped, weapon: withUids({ ...p, equipped: { ...p.equipped, weapon: weapon('legendary', 3, 'sword') } }).equipped.weapon! } });
    const blows = chainsOf(addSlot(registry, legendary, 'basic').profile).basic!;
    // The sword's Storm blows are off the Fire hero's pair: the new blow takes the primary.
    expect(bare(blows[blows.length - 1])).toEqual({ kind: 'medium', element: 'fire' });
  });

  it("gives the new move the pair's primary when the last move is off-pair", () => {
    const nature: Chain = {
      moves: [{ kind: 'light', form: 'lance', elements: ['nature', 'fire'] }],
      payment: 'mana',
    };
    const p = rich(withChains(armed(registry, createDelveProfile(registry, 3, { primary: 'fire' })), { primary: nature }));
    expect(chainsOf(addSlot(registry, p, 'primary').profile).primary!.moves[1].elements).toEqual([
      'fire',
    ]);
  });

  it('never touches a slot the chain is not using', () => {
    const dagger = withUids({
      ...rich(),
      equipped: { ...rich().equipped, weapon: weapon('rare', 3, 'dagger') },
    });
    const three = setChain(registry, dagger, 'basic', chainsOf(dagger).basic!.slice(0, 3)).profile;
    expect(three.equipped.weapon!.moveset!.slots.basic).toBe(4);
    const four = setChain(registry, three, 'basic', [...chainsOf(three).basic!, { kind: 'light', element: 'fire' }]).profile;
    expect(four.equipped.weapon!.moveset!.slots.basic).toBe(4);
    expect(chainsOf(four).basic).toHaveLength(4);
  });

  it('refuses mid-dive, unarmed, a skill with no slot, at the ceiling, and without the Links or the scrap', () => {
    const p = rich();
    const reason = (q: DelveProfile, skill: ChainSkill = 'primary') => addSlot(registry, q, skill).reason;
    expect(reason(startDive(registry, p, 1))).toBe('Chains can only change between dives');
    expect(reason(unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
    expect(reason(p, 'ultimate')).toBe(OPEN_SKILL_TEXT);
    const full = addSlot(registry, p, 'primary').profile;
    expect(full.equipped.weapon!.moveset!.slots.primary).toBe(3);
    expect(full).toMatchObject({ links: 97, scrap: 9959 });
    expect(reason(full)).toBe('This chain has every slot');
    expect(reason({ ...p, links: 0 })).toBe('Not enough Links');
    expect(reason({ ...p, scrap: 19 })).toBe('Not enough scrap');
  });
});

/** `w` with a moveset of these slots, every move its default in `w`'s mana. */
function slotted(w: GearItem, slots: Moveset['slots'], bought: Moveset['bought'] = {}): GearItem {
  return { ...w, moveset: { ...defaultMoveset(registry, w, w.mana, slots), bought } };
}

describe('Links: salvage and banking', () => {
  // A rare sword with two bought slots.
  const rare = slotted(weapon('rare', 1, 'sword'), { basic: 4, primary: 4, defensive: 2, ultimate: 1 }, { basic: 1, primary: 1 });
  const hero = () => createDelveProfile(registry, 3, { primary: 'storm' });
  const links = 2;

  it('salvaging a weapon gives a Link for each bought slot; other gear none; a drop none', () => {
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 2, rarity: 'rare', slot: 'chest' },
      new SeededRNG(2),
    );
    const res = salvageItems(registry, { ...hero(), bag: [rare, chest] }, [rare.uid, chest.uid]);
    expect(res.links).toBe(links);
    expect(res.profile.links).toBe(links);
    expect(weaponParts(registry, weapon('legendary', 2, 'sword')).links).toBe(0);
  });

  it("auto-salvage and a full bag give them too, into the floor's haul, and banking reports them for the dive", () => {
    const p = startDive(registry, setAutoSalvage(hero(), 'rare', true), 1);
    expect(addLootToBag(registry, p, [rare]).profile.dive!.haul.links).toBe(links);
    const w = beginFloor(registry, p);
    w.pending.items = [rare];
    const res = bankWorld(registry, p, w);
    expect(res.links).toBe(links);
    expect(res.profile.links).toBe(0); // in the haul until the dive settles (see the crafting spec)
    expect(res.profile.dive!.linksEarned).toBe(links);

    const full = { ...startDive(registry, hero(), 1), bag: Array(bal.loot.bagSize).fill(rare) };
    const w2 = beginFloor(registry, full);
    w2.pending.items = [rare];
    expect(bankWorld(registry, full, w2)).toMatchObject({ bagFull: true, links });
  });
});

describe('Move all (the preview; B2 commits it)', () => {
  /** A Fire hero wielding `w`, with `bag` in the bag, every construct minted. */
  const holding = (w: GearItem, ...bag: GearItem[]): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return withUids({ ...p, equipped: { ...p.equipped, weapon: w }, bag, scrap: 1000 });
  };
  const built = (w: GearItem, chains: Moveset['chains'], slots: Moveset['slots']): GearItem => {
    const m = slotted(w, slots).moveset!;
    return { ...w, moveset: { chains: { ...m.chains, ...chains }, slots: m.slots, bought: {} } };
  };
  const lance: Chain = {
    moves: [
      { kind: 'heavy', form: 'lance', elements: ['fire'] },
      { kind: 'light', form: 'lance', elements: ['fire'] },
    ],
    payment: 'cast',
  };
  const uids = (c: Chains[ChainSkill] | undefined) => movesOf(c).map((m) => m.uid);

  it("moves each chain's constructs slot for slot into the target's slots, its payment with them; the target's replaced constructs go to the bag", () => {
    const sword = built(weapon('rare', 1, 'sword'), { primary: lance }, { basic: 4, primary: 3, defensive: 2, ultimate: 1 });
    const axe = slotted({ ...weapon('rare', 2, 'axe'), uid: 'axe' }, { basic: 3, primary: 3, defensive: 2, ultimate: 1 });
    const p = holding(sword, axe);
    const worn = p.equipped.weapon!;
    const target = p.bag[0];
    const prev = moveAllPreview(registry, worn, target);
    expect(prev.moveset.slots).toEqual(target.moveset!.slots);
    expect(uids(prev.moveset.chains.primary)).toEqual(uids(worn.moveset!.chains.primary));
    expect(prev.moveset.chains.primary!.payment).toBe('cast');
    // The sword's 4-blow string onto a 3-slot Basic: the fourth blow to the bag with the axe's own three.
    expect(uids(prev.moveset.chains.basic)).toEqual(uids(worn.moveset!.chains.basic).slice(0, 3));
    const bagged = prev.toBag.map((c) => c.uid);
    expect(bagged).toContain(uids(worn.moveset!.chains.basic)[3]);
    for (const u of CHAIN_SKILLS.flatMap((s) => uids(target.moveset!.chains[s]))) expect(bagged).toContain(u);
    expect(prev.dormant).toEqual([]);
    // The old sword: refilled plain to its starts, no uids, its slots kept.
    expect(prev.old.slots).toEqual(worn.moveset!.slots);
    expect(movesOf(prev.old.chains.basic).every((c) => !c.uid)).toBe(true);
    expect(prev.old.chains.primary!.moves).toHaveLength(3);
    expect(prev.old.chains.primary!.payment).toBe('mana');
  });

  it("a target skill the worn weapon moves nothing into keeps the target's own constructs; a chain the target has no slots for goes whole to the bag", () => {
    const common = slotted(weapon('common', 9, 'sword'), { basic: 3, primary: 2 });
    const epic = slotted({ ...weapon('epic', 10, 'axe'), uid: 'axe' }, { basic: 3, primary: 4, defensive: 2, ultimate: 2 });
    const p = holding(common, epic);
    const prev = moveAllPreview(registry, p.equipped.weapon!, p.bag[0]);
    expect(prev.moveset.chains.ultimate).toEqual(p.bag[0].moveset!.chains.ultimate);
    expect(prev.moveset.chains.defensive).toEqual(p.bag[0].moveset!.chains.defensive);
    expect(prev.moveset.slots).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 2 });
    // The other way: the epic's Ultimate and Defensive have no slot on the common sword.
    const back = holding(epic, { ...common, uid: 'common' });
    const onto = moveAllPreview(registry, back.equipped.weapon!, back.bag[0]);
    expect(Object.keys(onto.moveset.chains)).toEqual(['basic', 'primary']);
    const gone = CHAIN_SKILLS.flatMap((s) => (s === 'defensive' || s === 'ultimate' ? uids(back.equipped.weapon!.moveset!.chains[s]) : []));
    for (const u of gone) expect(onto.toBag.map((c) => c.uid)).toContain(u);
  });

  it("constructs the target's class can't express sit in their slots, dormant", () => {
    const sword = holding(weapon('rare', 11, 'sword'), { ...weapon('rare', 12, 'bow'), uid: 'bow' });
    const prev = moveAllPreview(registry, sword.equipped.weapon!, sword.bag[0]);
    const strikes = uids(sword.equipped.weapon!.moveset!.chains.primary);
    expect(uids(prev.moveset.chains.primary)).toEqual(strikes.slice(0, prev.moveset.slots.primary));
    expect(prev.dormant.sort()).toEqual(strikes.slice(0, prev.moveset.slots.primary).sort());
  });

  it("the op commits the preview: the bag weapon worn with the moveset, the old one to the bag refilled plain with new uids", () => {
    const p = holding(weapon('rare', 11, 'sword'), { ...weapon('rare', 12, 'axe'), uid: 'axe' });
    const prev = moveAllPreview(registry, p.equipped.weapon!, p.bag[0]);
    const res = moveAll(registry, p, 'axe');
    expect(res.ok).toBe(true);
    const worn = res.profile.equipped.weapon!;
    expect(worn.uid).toBe('axe');
    expect(worn.moveset).toEqual(prev.moveset);
    expect(uids(worn.moveset!.chains.primary)).toEqual(uids(p.equipped.weapon!.moveset!.chains.primary));
    const old = res.profile.bag.find((i) => i.uid === p.equipped.weapon!.uid)!;
    const oldUids = uids(old.moveset!.chains.primary);
    expect(oldUids.every((u) => !!u && !uids(worn.moveset!.chains.primary).includes(u))).toBe(true);
    expect(res.profile.bag.some((i) => i.uid === 'axe')).toBe(false);
    expect(moveAll(registry, p, 'nope')).toMatchObject({ ok: false, profile: p, reason: 'Move onto a weapon in your bag' });
  });
});

describe('valuing a weapon: as it is, and as a home', () => {
  /** A Fire hero whose uncommon sword holds a 3-slot Primary, and `bag` in the bag. */
  const hero = (...bag: GearItem[]): DelveProfile => {
    const p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
    const sword = slotted(p.equipped.weapon!, { basic: 3, primary: 3, defensive: 1 });
    return withUids({ ...p, equipped: { ...p.equipped, weapon: sword }, bag, scrap: 1000 });
  };
  /** The same sword as the hero's, one upgrade better, its 3-slot Primary holding one construct. */
  const spare = (p: DelveProfile): GearItem => {
    const m = defaultMoveset(registry, p.equipped.weapon!, 'fire', { basic: 3, primary: 3, defensive: 1 });
    const primary = { ...m.chains.primary!, moves: m.chains.primary!.moves.slice(0, 1) };
    return { ...p.equipped.weapon!, uid: 'spare', upgrade: 1, moveset: { ...m, chains: { ...m.chains, primary } } };
  };

  it('as it is: its own moveset; as a home: the equipped constructs moved onto it (the default)', () => {
    const p0 = hero();
    const p = withUids({ ...p0, bag: [spare(p0)] });
    const cmp = (value?: 'home' | 'asIs') =>
      compareItem(p.equipped, p.bag[0], registry, 1, p.pair, value);
    expect(cmp('asIs').newPower).toBe(profilePower(registry, equipItem(registry, p, 'spare')));
    const moved = { ...p, equipped: { ...p.equipped, weapon: { ...p.bag[0], moveset: moveAllPreview(registry, p.equipped.weapon!, p.bag[0]).moveset } } };
    expect(cmp('home').newPower).toBe(profilePower(registry, moved));
    expect(cmp()).toEqual(cmp('home'));
    // A better base with a shorter Primary: more as a home than as it is.
    expect(cmp('home').powerPct).toBeGreaterThan(cmp('asIs').powerPct);
    expect(cmp('home').powerPct).toBeGreaterThan(0);
    // The equipped weapon itself, and unarmed (nothing to move), value as they are.
    const worn = p.equipped.weapon!;
    expect(compareItem(p.equipped, worn, registry, 1, p.pair)).toEqual(
      compareItem(p.equipped, worn, registry, 1, p.pair, 'asIs'),
    );
    const bare = unequipSlot(registry, p, 'weapon');
    const axe = weapon('rare', 1, 'axe');
    expect(compareItem(bare.equipped, axe, registry, 1, bare.pair)).toEqual(
      compareItem(bare.equipped, axe, registry, 1, bare.pair, 'asIs'),
    );
  });

  it('salvage never marks a good base as junk; Equip best leaves the weapon alone', () => {
    const p0 = hero();
    const p = withUids({ ...p0, bag: [spare(p0)] });
    expect(salvageCandidates(registry, p, 'legendary')).toEqual([]);
    expect(equipBest(registry, p).equipped).toEqual([]);
  });
});

describe('the dive lock', () => {
  it('refuses every gear, moveset, forge and salvage op mid-dive, but the choice of mana; a dive that ended unlocks', () => {
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' });
    const axe = { ...weapon('rare', 2, 'axe'), uid: 'axe' };
    const helm = generateItem(
      registry,
      { uid: 'h', ilvl: 6, rarity: 'magic', slot: 'helm', mana: 'fire' },
      new SeededRNG(9),
    );
    const p = { ...p0, bag: [axe, helm], manaDust: 99, links: 99, scrap: 9999 };
    const diving = startDive(registry, p, 1);
    const anvil = 'Equip at the Anvil, between dives';
    expect(() => equipItem(registry, diving, 'axe')).toThrow(anvil);
    expect(() => unequipSlot(registry, diving, 'chest')).toThrow(anvil);
    expect(equipBest(registry, diving)).toEqual({ profile: diving, equipped: [] });
    const primary = chainsOf(diving).primary!;
    expect(setChain(registry, diving, 'primary', primary).ok).toBe(false);
    expect(addSlot(registry, diving, 'primary').ok).toBe(false);
    expect(reattuneItem(registry, diving, 'h', 'fire').reason).toBe('Re-attune between dives');
    // The forge and salvage too: the Anvil can be visited with a dive still open.
    const forge = 'Forge at the Anvil, between dives';
    expect(upgradeGear(registry, diving, 'h')).toMatchObject({ ok: false, reason: forge });
    expect(reforgeGear(registry, diving, 'h', 0)).toMatchObject({ ok: false, reason: forge });
    expect(salvageItems(registry, diving, ['h'])).toMatchObject({ profile: diving, count: 0 });
    // The door screen is still the dive: the same lock.
    const choosing = { ...diving, dive: { ...diving.dive!, phase: 'choosing' as const } };
    expect(() => equipItem(registry, choosing, 'axe')).toThrow(anvil);
    expect(equipBest(registry, choosing)).toEqual({ profile: choosing, equipped: [] });
    expect(setChain(registry, choosing, 'primary', primary).ok).toBe(false);
    expect(addSlot(registry, choosing, 'primary').ok).toBe(false);
    expect(upgradeGear(registry, choosing, 'h')).toMatchObject({ ok: false, reason: forge });
    expect(salvageItems(registry, choosing, ['h'])).toMatchObject({ count: 0 });
    // But auto-salvage of new loot still runs, so a full bag never blocks pickups.
    const auto = setAutoSalvage(diving, 'magic', true);
    expect(addLootToBag(registry, auto, [{ ...helm, uid: 'h2' }]).salvaged).toHaveLength(1);
    // The choice stays open mid-dive (a migrated save may be diving).
    const unchosen = startDive(registry, createDelveProfile(registry, 3), 1);
    expect(chooseStartingMana(registry, unchosen, 'frost').ok).toBe(true);
    // Death or extraction ends the lock.
    for (const phase of ['dead', 'extracted'] as const) {
      const over = { ...diving, dive: { ...diving.dive!, phase } };
      expect(equipItem(registry, over, 'axe').equipped.weapon!.uid).toBe('axe');
      expect(equipBest(registry, over).equipped.map((i) => i.uid)).toEqual(['h']);
      expect(upgradeGear(registry, over, 'h').ok).toBe(true);
    }
  });
});

describe('the autopilot between dives', () => {
  /** A Fire hero after its first dive, wielding `w` (an uncommon sword by default), with nothing to forge. */
  const veteran = (w?: GearItem): DelveProfile => {
    const p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
    const weapon = w ?? p.equipped.weapon!;
    return withUids({
      ...p,
      equipped: { ...p.equipped, weapon },
      materials: emptyMaterials(),
      stats: { ...p.stats, dives: 1 },
    });
  };

  it('wears the bag weapon that raises Power as it is, its old one to the bag (D1 rewires it to Move all, B2 fills the op)', () => {
    const p0 = veteran();
    const better = { ...p0.equipped.weapon!, uid: 'better', upgrade: 5 };
    const p = { ...p0, bag: [better], scrap: 1000 };
    // The old sword goes to the bag as it is, where the junk rule melts it (a plain common).
    const after = betweenDives(registry, p);
    expect(after.equipped.weapon!.uid).toBe('better');
    expect(after.bag.find((i) => i.uid === p0.equipped.weapon!.uid)).toBeUndefined();
  });

  it('spends Links in the order Primary, basic chain, Ultimate, Defensive: each to three slots, then (after sockets) the rest, up to each ceiling', () => {
    const epic = weapon('epic', 1, 'sword');
    const base = {
      ...veteran(slotted(epic, { basic: 3, primary: 4, defensive: 2, ultimate: 1 })),
      scrap: 9999,
    };
    const slots = (links: number) =>
      betweenDives(registry, { ...base, links }).equipped.weapon!.moveset!.slots;
    // The Primary is past three already; the Ultimate's 2nd slot costs 1.
    expect(slots(1)).toEqual({ basic: 3, primary: 4, defensive: 2, ultimate: 2 });
    // 1 + 2 for the Ultimate's 2nd and 3rd, 2 for the Defensive's 3rd (6), then the Primary's 5th (4): 10.
    expect(slots(10)).toEqual({ basic: 3, primary: 5, defensive: 3, ultimate: 3 });
    // 3 more for the basic chain's 4th, 4 more for its 5th: 17.
    expect(slots(13)).toEqual({ basic: 4, primary: 5, defensive: 3, ultimate: 3 });
    expect(slots(17)).toEqual({ basic: 5, primary: 5, defensive: 3, ultimate: 3 });
    expect(betweenDives(registry, { ...base, links: 17 }).equipped.weapon!.moveset!.bought).toEqual({ basic: 2, primary: 1, defensive: 1, ultimate: 2 });
  });

  it('changes nothing on a dive still open: every op refuses, and it never loops', () => {
    const p = startDive(registry, { ...veteran(), links: 5, scrap: 1000, manaDust: 99 }, 1);
    const after = betweenDives(registry, p);
    expect(after.equipped).toEqual(p.equipped);
    expect(after).toMatchObject({ links: 5, scrap: 1000, manaDust: 99 });
  });

  it('pays for its fused Primary, and skips the edit when it cannot', () => {
    const p = { ...veteran(), bestDepth: 3 }; // it has fought: it binds Frost
    const primary = (q: DelveProfile) => chainsOf(q).primary!.moves.map((m) => m.elements);
    const poor = betweenDives(registry, p);
    expect(poor.pair.secondary).toBe('frost');
    expect(primary(poor)).toEqual([['fire'], ['fire']]);
    const paid = betweenDives(registry, { ...p, manaDust: bal.movesets.elementDust });
    expect(primary(paid).some((e) => e.includes('frost'))).toBe(true);
    expect(paid.manaDust).toBe(0);
  });
});

/** A moveset without its sockets (see the runes spec: weapon drops roll some, empty) and runes. */
function unsocketed(m: Moveset): Moveset {
  const strip = <X extends Construct>({ runes: _r, ...x }: X) => x;
  const chains = Object.fromEntries(
    Object.entries(m.chains).map(([skill, c]) => [
      skill,
      Array.isArray(c) ? c.map(strip) : { ...c, moves: c!.moves.map(strip) },
    ]),
  );
  return { chains, slots: m.slots, bought: m.bought };
}
