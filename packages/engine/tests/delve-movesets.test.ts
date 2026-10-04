import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
import { emptyMaterials } from '../src/loot/materials.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
import {
  baseSlots,
  carriedFrom,
  carriedSkills,
  defaultChain,
  defaultMoveset,
  extraSlots,
  heroChains,
} from '../src/loot/moveset.js';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { betweenDives } from '../src/delve/autopilot.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import {
  addSlot,
  movesetEditPrice,
  movesOf,
  setChain,
  setChains,
  slotPrice,
  transferMoveset,
} from '../src/delve/moveset.js';
import { bindSecondary, chooseStartingMana, reattuneItem } from '../src/delve/pair.js';
import {
  addLootToBag,
  createDelveProfile,
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
} from './fixtures/arena.js';
import { armed } from './fixtures/carries.js';

// See the weapon movesets spec.

const weapon = (rarity: Rarity, seed: number, baseId?: string): GearItem =>
  generateItem(
    registry,
    { uid: `w${seed}`, ilvl: 5, rarity, slot: 'weapon', baseId, mana: 'storm' },
    new SeededRNG(seed),
  );

describe('data: movesets', () => {
  it('loads the chains each rarity carries, the extra slots and the prices', () => {
    const m = bal.movesets;
    expect(m.carries.common).toEqual(['basic']);
    expect(m.carries.uncommon).toEqual(['basic', 'primary']);
    expect(m.carries.magic).toEqual(['basic', 'primary']);
    expect(m.carries.rare).toEqual(['basic', 'primary', 'defensive']);
    expect(m.carries.epic).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
    expect(m.carries.legendary).toEqual(['basic', 'primary', 'defensive', 'ultimate']);
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
    expect([m.editDust, m.elementDust, m.transferScrap]).toEqual([5, 15, 30]);
    expect(bal.chains.cap).toEqual({ basic: 5, primary: 5, defensive: 5, ultimate: 5 });
  });

  it('refuses a rarity that carries no basic chain or less than the rarity below, a legendary short of all four, or extra slots that fall', () => {
    const withMovesets = (movesets: object) => ({
      ...balanceData,
      delve: { ...balanceData.delve, movesets: { ...balanceData.delve.movesets, ...movesets } },
    });
    const carries = { ...balanceData.delve.movesets.carries, common: ['primary'] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ carries })).success).toBe(false);
    const shrinks = { ...balanceData.delve.movesets.carries, rare: ['basic'] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ carries: shrinks })).success).toBe(false);
    const noUltimate = Object.fromEntries(
      Object.entries(balanceData.delve.movesets.carries).map(([r, s]) => [
        r,
        s.filter((skill) => skill !== 'ultimate'),
      ]),
    );
    expect(BalanceConfigSchema.safeParse(withMovesets({ carries: noUltimate })).success).toBe(
      false,
    );
    const extraSlots = { ...balanceData.delve.movesets.extraSlots, rare: [2, 1] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ extraSlots })).success).toBe(false);
    expect(BalanceConfigSchema.safeParse(balanceData).success).toBe(true);
  });
});

describe('base slots and carried chains', () => {
  it("gives the basic chain its weapon's string length (unarmed, the hero's), every other chain 1", () => {
    expect(baseSlots(registry, 'sword', 'basic')).toBe(3);
    expect(baseSlots(registry, 'maul', 'basic')).toBe(2);
    expect(baseSlots(registry, 'dagger', 'basic')).toBe(4);
    expect(baseSlots(registry, null, 'basic')).toBe(3);
    for (const skill of ['primary', 'defensive', 'ultimate'] as const) {
      expect(baseSlots(registry, 'sword', skill)).toBe(1);
      expect(baseSlots(registry, null, skill)).toBe(1);
    }
  });

  it('carries chains by rarity; unarmed carries the basic chain alone', () => {
    for (const r of RARITY_ORDER)
      expect(carriedSkills(registry, { rarity: r })).toEqual(bal.movesets.carries[r]);
    expect(carriedSkills(registry, null)).toEqual(['basic']);
    expect(carriedFrom(registry, 'basic')).toBeNull();
    expect(carriedFrom(registry, 'primary')).toBe('uncommon');
    expect(carriedFrom(registry, 'defensive')).toBe('rare');
    expect(carriedFrom(registry, 'ultimate')).toBe('epic');
  });
});

describe('default moves', () => {
  it("fills a moveset at its base slots: the weapon's string, and each slot's default form's first move", () => {
    const m = defaultMoveset(registry, { baseId: 'sword', rarity: 'uncommon' }, 'frost');
    expect(m.slots).toEqual({ basic: 3, primary: 1 });
    expect(m.chains).toEqual({
      basic: [
        { kind: 'light', element: 'frost' },
        { kind: 'light', element: 'frost' },
        { kind: 'heavy', element: 'frost' },
      ],
      primary: { moves: [{ kind: 'light', form: 'bolt', elements: ['frost'] }], payment: 'mana' },
    });
    const epic = defaultMoveset(registry, { baseId: 'maul', rarity: 'epic' }, 'fire');
    expect(epic.slots).toEqual({ basic: 2, primary: 1, defensive: 1, ultimate: 1 });
    expect(epic.chains.defensive).toEqual({
      moves: [{ kind: 'medium', form: 'ward', elements: ['fire'] }],
      payment: 'mana',
    });
    expect(epic.chains.ultimate).toEqual({
      moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }],
      payment: 'charge',
    });
  });

  it('plays the default chain in order, then medium past its end', () => {
    const kinds = (c: Chain) => c.moves.map((m) => m.kind);
    expect(kinds(defaultChain(registry, 'primary', 'sword', 'fire', 5))).toEqual([
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
  const EXTRA: Record<Rarity, [number, number]> = {
    common: [0, 0],
    uncommon: [0, 0],
    magic: [0, 1],
    rare: [1, 2],
    epic: [2, 3],
    legendary: [3, 4],
  };

  it("rolls the rarity's extra slots over the chains it carries, every slot a default move in its mana", () => {
    for (const rarity of RARITY_ORDER) {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 60; seed++) {
        const w = weapon(rarity, seed);
        const m = w.moveset!;
        expect(Object.keys(m.chains).sort()).toEqual([...bal.movesets.carries[rarity]].sort());
        expect(Object.keys(m.slots).sort()).toEqual([...bal.movesets.carries[rarity]].sort());
        const extra = extraSlots(registry, w);
        seen.add(extra);
        expect(unsocketed(m)).toEqual(defaultMoveset(registry, w, 'storm', m.slots));
        for (const skill of CHAIN_SKILLS) expect(m.slots[skill] ?? 0).toBeLessThanOrEqual(5);
      }
      expect(Math.min(...seen)).toBe(EXTRA[rarity][0]);
      expect(Math.max(...seen)).toBe(EXTRA[rarity][1]);
    }
  });

  it('spreads extra slots over every chain a weapon carries', () => {
    const got = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const w = weapon('rare', seed);
      for (const skill of CHAIN_SKILLS)
        if ((w.moveset!.slots[skill] ?? 0) > baseSlots(registry, w.baseId, skill)) got.add(skill);
    }
    expect([...got].sort()).toEqual(['basic', 'defensive', 'primary']);
  });

  it('never grows a chain past 5: a dagger basic string of 4 takes at most one extra', () => {
    for (let seed = 1; seed <= 60; seed++)
      expect(weapon('legendary', seed, 'dagger').moveset!.slots.basic).toBeLessThanOrEqual(5);
  });

  it('gives no moveset to gear other than weapons', () => {
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 5, rarity: 'legendary', slot: 'chest' },
      new SeededRNG(3),
    );
    expect(chest.moveset).toBeUndefined();
    expect(extraSlots(registry, chest)).toBe(0);
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
  const sword = weapon('uncommon', 1, 'sword');

  it('reads an item with a moveset, and one without (a version 5 save)', () => {
    expect(GearItemSchema.safeParse(sword).success).toBe(true);
    const { moveset: _m, ...old } = sword;
    expect(GearItemSchema.safeParse(old).success).toBe(true);
  });

  it('refuses a chain longer than its slots, a chain without slots, and slots without a chain', () => {
    const m = sword.moveset!;
    const bad = (moveset: object) => GearItemSchema.safeParse({ ...sword, moveset }).success;
    expect(bad({ ...m, slots: { ...m.slots, basic: 2 } })).toBe(false);
    expect(bad({ ...m, slots: { basic: 3 } })).toBe(false);
    expect(bad({ ...m, slots: { ...m.slots, defensive: 1 } })).toBe(false);
    expect(bad({ ...m, slots: { ...m.slots, primary: 5 } })).toBe(true);
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

  it("fits a save's weapons to the data at load", () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const common = weapon('common', 4, 'sword');
    const rare = weapon('rare', 5, 'axe');
    const { moveset: _m, ...bare } = weapon('magic', 6, 'bow');
    const moveset = common.moveset!;
    const [one, two] = rare.moveset!.chains.basic!;
    const bag = [
      bare, // no moveset: its base defaults
      {
        ...common,
        moveset: {
          chains: { ...moveset.chains, defensive: rare.moveset!.chains.defensive },
          slots: { ...moveset.slots, defensive: 3 },
        },
      }, // a chain its rarity doesn't carry, with 2 extra slots
      {
        ...rare,
        moveset: {
          chains: { basic: [one, two], primary: rare.moveset!.chains.primary },
          slots: { basic: 2, primary: rare.moveset!.slots.primary },
        },
      }, // a Defensive to add, a basic slot count to raise
    ];
    const loaded = parseDelveProfile(registry, json({ ...p, bag }))!.profile;
    const fitted = loaded.bag;
    expect(fitted[0].moveset).toEqual(defaultMoveset(registry, bare, 'storm'));
    expect(fitted[1].moveset).toEqual(moveset);
    // The dropped Defensive's extra slots come back as Links, as salvaging would give.
    expect(loaded.links).toBe(p.links + 2);
    expect(fitted[2].moveset!.chains.defensive).toEqual(
      defaultMoveset(registry, rare, 'storm').chains.defensive,
    );
    expect(fitted[2].moveset!.slots.defensive).toBe(1);
    expect(fitted[2].moveset!.slots.basic).toBe(3);
    expect(fitted[2].moveset!.chains.basic).toEqual([one, two]);
  });
});

describe('the edit price (movesetEditPrice): by origin', () => {
  const E = bal.movesets.editDust;
  const X = bal.movesets.elementDust;
  const bolt = (kind: Move['kind'], ...elements: ManaType[]): Move => ({
    kind,
    form: 'bolt',
    elements,
  });
  const chain = (...moves: Move[]): Chain => ({ moves, payment: 'mana' });
  const price = (old: Chain, next: Chain, origins?: (number | null)[]) =>
    movesetEditPrice(
      registry,
      { primary: old },
      { primary: next },
      origins && { primary: origins },
    );
  const A = bolt('light', 'fire');
  const B = bolt('medium', 'fire');
  const C = bolt('heavy', 'storm');

  it('prices what the builder did: removing or inserting a move costs only that move', () => {
    expect(price(chain(A, B, C), chain(A, B, C))).toBe(0);
    expect(price(chain(A, B, C), chain(A, C), [0, 2])).toBe(E);
    expect(price(chain(A, B, C), chain(B, C), [1, 2])).toBe(E);
    expect(price(chain(A, C), chain(A, B, C), [0, null, 1])).toBe(E); // Fire is an old move's element
  });

  it('without origins, move j came from saved move j: an edit in place', () => {
    // B edited into C (its kind and elements), and the saved C removed.
    expect(price(chain(A, B, C), chain(A, C))).toBe(E + X + E);
    expect(price(chain(A, B), chain(A, bolt('heavy', 'fire')))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, form: 'lance' }))).toBe(E);
    expect(price(chain(A, B), chain(A, bolt('medium', 'storm')))).toBe(X);
    expect(price(chain(A, B), chain(A, bolt('medium', 'fire', 'storm')))).toBe(X);
    expect(price(chain(A, B), chain(A, bolt('heavy', 'storm', 'fire')))).toBe(E + X);
  });

  it('a card that moved costs editDust, even one edited back: the longest rising run stays free', () => {
    expect(price(chain(A, B, C), chain(B, C, A), [1, 2, 0])).toBe(E);
    expect(price(chain(A, B), chain(B, A), [1, 0])).toBe(E);
    // Two cards alike swapped: still a move.
    expect(price(chain(A, A), chain(A, A), [1, 0])).toBe(E);
    // A card removed and one alike added: a removal and a new move.
    expect(price(chain(A, B), chain(A, B), [0, null])).toBe(2 * E);
  });

  it('a new element set is charged once per Apply, however many moves take it', () => {
    const fire: Blow = { kind: 'light', element: 'fire' };
    const storm: Blow = { kind: 'light', element: 'storm' };
    const blows = (old: Blow[], next: Blow[]) =>
      movesetEditPrice(registry, { basic: old }, { basic: next });
    expect(blows([fire], [fire, storm])).toBe(E + X);
    expect(blows([fire, storm], [fire, storm, storm])).toBe(E);
    expect(blows([fire], [fire, storm, storm])).toBe(2 * E + X);
    // Two moves re-coloured to one new set, and a new move in it: Storm charged once.
    expect(price(chain(A, B), chain(bolt('light', 'storm'), bolt('medium', 'storm'), C))).toBe(
      X + E,
    );
  });

  it('is 0 only for the same chain in place, and never beats doing it in two Applies (random triples, origins composed)', () => {
    const rng = new SeededRNG(7);
    const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(0, xs.length - 1)];
    const kinds: Move['kind'][] = ['light', 'heavy', 'hold'];
    const sets: ManaType[][] = [
      ['fire'],
      ['storm'],
      ['frost'],
      ['fire', 'storm'],
      ['storm', 'fire'],
    ];
    const forms = ['bolt', 'lance'] as const;
    const randomChain = (): Chain => ({
      moves: Array.from({ length: rng.nextInt(1, 5) }, () => ({
        kind: pick(kinds),
        form: pick(forms),
        elements: pick(sets),
      })),
      payment: pick(['mana', 'cast'] as const),
    });
    const randomBlows = (): Blow[] =>
      Array.from({ length: rng.nextInt(1, 5) }, () => ({
        kind: pick(kinds),
        element: pick(['fire', 'storm', 'frost'] as const),
      }));
    /** Random origins from `from` moves to `to`: each new move a fresh saved index, or null. */
    const randomOrigins = (from: number, to: number): (number | null)[] => {
      const free = Array.from({ length: from }, (_, i) => i);
      return Array.from({ length: to }, () =>
        free.length === 0 || rng.next() < 0.3
          ? null
          : free.splice(rng.nextInt(0, free.length - 1), 1)[0],
      );
    };
    const length = (x: Partial<Chains>) => movesOf(x.basic ?? x.primary).length;
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    let bad = 0;
    for (let n = 0; n < 4000; n++) {
      const basic = n % 2 === 0;
      const skill = basic ? 'basic' : 'primary';
      const [a, b, c] = basic
        ? [randomBlows(), randomBlows(), randomBlows()].map((x) => ({ basic: x }))
        : [randomChain(), randomChain(), randomChain()].map((x) => ({ primary: x }));
      const ab = randomOrigins(length(a), length(b));
      const bc = randomOrigins(length(b), length(c));
      const ac = bc.map((o) => (o === null ? null : ab[o]));
      const p = (x: Partial<Chains>, y: Partial<Chains>, o?: (number | null)[]) =>
        movesetEditPrice(registry, x, y, o && { [skill]: o });
      if (p(a, c, ac) > p(a, b, ab) + p(b, c, bc)) bad++;
      if ((p(a, b) === 0) !== same(a, b)) bad++;
    }
    expect(bad).toBe(0);
  });

  it('a move left over: a new one costs editDust and, with elements no old move has, elementDust; a removal editDust', () => {
    expect(price(chain(A), chain(A, bolt('medium', 'nature')))).toBe(E + X);
    expect(price(chain(A, C), chain(A, C, bolt('light', 'storm')))).toBe(E);
    expect(price(chain(A, B, C), chain(A))).toBe(2 * E);
  });

  it('a changed payment costs editDust; blows price the same way; chains left out cost nothing, nor do their origins', () => {
    expect(price(chain(A), { moves: [A], payment: 'cast' })).toBe(E);
    const fire: Blow = { kind: 'light', element: 'fire' };
    const heavy: Blow = { kind: 'heavy', element: 'fire' };
    const blows = (old: Blow[], next: Blow[], origins?: (number | null)[]) =>
      movesetEditPrice(registry, { basic: old }, { basic: next }, origins && { basic: origins });
    expect(blows([fire, fire, heavy], [fire, heavy], [0, 2])).toBe(E);
    expect(blows([fire, fire, heavy], [fire, fire, { ...heavy, element: 'frost' }])).toBe(X);
    const old = { basic: [fire], primary: chain(A) };
    expect(movesetEditPrice(registry, old, { primary: chain(B) })).toBe(E);
    expect(movesetEditPrice(registry, old, { basic: [heavy], primary: chain(B) })).toBe(2 * E);
    expect(movesetEditPrice(registry, old, { primary: chain(B) }, { basic: [null] })).toBe(E);
  });

  it('a rune is no part of the Dust: a socket or a rune alone costs none', () => {
    const socketed: Move = { ...A, runes: [{ id: 'quick', tier: 1 }, null] };
    expect(price(chain(A), chain(socketed))).toBe(0);
  });
});

describe('edits: setChain and setChains', () => {
  const light = (...elements: ManaType[]): Move => ({ kind: 'light', form: 'bolt', elements });
  /** A Fire hero past its first dive, with 20 Mana Dust and an uncommon sword. */
  const veteran = (): DelveProfile => {
    const p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
    return { ...p, manaDust: 20, stats: { ...p.stats, dives: 1 } };
  };

  it('edits the equipped weapon for its price; nothing before the first dive, nothing unchanged', () => {
    const next: Chain = {
      moves: [{ kind: 'heavy', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    };
    const fresh = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
    const free = setChain(registry, fresh, 'primary', next);
    expect(free.ok).toBe(true);
    expect(chainsOf(free.profile).primary).toEqual(next);
    expect(free.profile.manaDust).toBe(0);
    const paid = setChain(registry, veteran(), 'primary', next);
    expect(paid.profile.manaDust).toBe(20 - bal.movesets.editDust);
    const same = setChain(registry, veteran(), 'primary', chainsOf(veteran()).primary!);
    expect(same.profile.manaDust).toBe(20);
    const poor = { ...veteran(), manaDust: bal.movesets.editDust - 1 };
    expect(setChain(registry, poor, 'primary', next)).toEqual({
      ok: false,
      profile: poor,
      reason: 'Not enough Mana Dust',
    });
  });

  it("refuses mid-dive, unarmed, a skill the weapon doesn't carry, and more moves than slots", () => {
    const p = veteran();
    const one: Chain = { moves: [light('fire')], payment: 'mana' };
    const reason = (q: DelveProfile, skill: 'primary' | 'defensive' | 'ultimate', c = one) =>
      setChain(registry, q, skill, c).reason;
    expect(reason(startDive(registry, p, 1), 'primary')).toBe(
      'Chains can only change between dives',
    );
    expect(reason(unequipSlot(registry, p, 'weapon'), 'primary')).toBe(
      'Equip a weapon to build your moves',
    );
    const ward = { moves: [{ ...light('fire'), form: 'ward' as const }], payment: 'mana' as const };
    expect(reason(p, 'defensive', ward)).toBe('Carried by rare weapons and better');
    const rare = {
      ...p,
      equipped: { ...p.equipped, weapon: weapon('rare', 2, 'sword') },
    };
    const nova = { moves: [{ ...light('fire'), form: 'nova' as const }], payment: 'mana' as const };
    expect(reason(rare, 'ultimate', nova)).toBe(
      'Carried by epic weapons and better, or an awakened rare',
    );
    expect(reason(p, 'primary', { ...one, moves: [light('fire'), light('fire')] })).toBe(
      'A chain holds 1 to 1 moves',
    );
  });

  it('keeps, moves and removes off-pair moves, but never adds, copies or re-colours one', () => {
    const p0 = bindSecondary(registry, veteran(), 'storm').profile;
    const [F, N, NF] = [light('fire'), light('nature'), light('nature', 'fire')];
    const p = {
      ...withChains(p0, { primary: { moves: [F, N, NF, F], payment: 'mana' } }),
      manaDust: 999,
    };
    const ok = (...moves: Move[]) => setChain(registry, p, 'primary', { moves, payment: 'mana' });
    expect(ok(F, N, NF, F).ok).toBe(true); // kept
    expect(ok(N, F, F, NF).ok).toBe(true); // moved
    expect(ok(F, NF).ok).toBe(true); // removed
    expect(ok(F, N, NF, { ...N, kind: 'heavy' }).reason).toBe('Pick from your two elements'); // copied
    expect(ok(F, N, NF, light('frost')).reason).toBe('Pick from your two elements'); // added
    expect(ok(F, light('frost'), NF, F).reason).toBe('Pick from your two elements'); // re-coloured
    expect(ok(F, { ...N, kind: 'heavy' }, NF, F).ok).toBe(true); // its kind changed
    expect(ok(F, N, light('fire', 'nature'), F).ok).toBe(true); // its elements' order: the same set
    const blows: Blow[] = [
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'nature' },
    ];
    const b = { ...withChains(p0, { basic: blows }), manaDust: 999 };
    expect(setChain(registry, b, 'basic', [...blows].reverse()).ok).toBe(true);
    expect(setChain(registry, b, 'basic', [blows[1], blows[1]]).reason).toBe(
      'Pick from your two elements',
    );
  });

  it('setChains applies every chain or none, for their total', () => {
    const p = veteran();
    const basic: Blow[] = [{ kind: 'heavy', element: 'fire' }];
    const primary: Chain = {
      moves: [{ kind: 'heavy', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    };
    // The basic chain keeps its heavy blow (the builder's origins); the Primary edits in place.
    const origins = { basic: [2] };
    const both = setChains(registry, p, { basic, primary }, { origins });
    expect(both.ok).toBe(true);
    expect(chainsOf(both.profile)).toEqual({ basic, primary });
    // Two blows removed and a kind changed: 3 × editDust.
    expect(both.profile.manaDust).toBe(20 - 3 * bal.movesets.editDust);
    const poor = { ...p, manaDust: 3 * bal.movesets.editDust - 1 };
    expect(setChains(registry, poor, { basic, primary }, { origins })).toMatchObject({
      ok: false,
      profile: poor,
      reason: 'Not enough Mana Dust',
    });
    const ward = {
      moves: [{ kind: 'medium' as const, form: 'ward' as const, elements: ['fire' as const] }],
      payment: 'mana' as const,
    };
    expect(setChains(registry, p, { primary, defensive: ward })).toMatchObject({
      ok: false,
      profile: p,
    });
  });
});

describe('edits by origin', () => {
  const E = bal.movesets.editDust;
  /** A Fire hero past its first dive, with Mana Dust to spare. */
  const veteran = (): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return { ...p, manaDust: 99, stats: { ...p.stats, dives: 1 } };
  };

  it('setChains prices by the origins it is given, and refuses bad ones', () => {
    const p = veteran();
    const blows = chainsOf(p).basic!; // the sword's light, light, heavy
    const swapped = [blows[2], blows[0], blows[1]];
    // The heavy moved to the front: one move.
    const moved = setChains(registry, p, { basic: swapped }, { origins: { basic: [2, 0, 1] } });
    expect(moved.profile.manaDust).toBe(99 - E);
    expect(chainsOf(moved.profile).basic).toEqual(swapped);
    // Without origins, in place: the first light became heavy, and the heavy light.
    expect(setChains(registry, p, { basic: swapped }).profile.manaDust).toBe(99 - 2 * E);
    for (const basic of [
      [0, 0, 1],
      [0, 1],
      [0, 1, 3],
      [0, 1, -1],
      [0.5, 1, 2],
    ])
      expect(setChains(registry, p, { basic: swapped }, { origins: { basic } })).toMatchObject({
        ok: false,
        profile: p,
        reason: 'Bad origins',
      });
    // Origins for a skill the edit leaves out are ignored.
    const origins = { basic: [2, 0, 1], primary: [7] };
    expect(setChains(registry, p, { basic: swapped }, { origins }).ok).toBe(true);
  });

  it('the first dive is still free, whatever moved', () => {
    const fresh = createDelveProfile(registry, 3, { primary: 'fire' });
    const blows = chainsOf(fresh).basic!;
    const res = setChains(registry, fresh, { basic: [blows[2]] }, { origins: { basic: [2] } });
    expect(res.profile.manaDust).toBe(0);
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

  it("prices a slot by its position: the 2nd 1 Link, a sword's 4th basic slot 3", () => {
    const sword = rich().equipped.weapon!;
    expect(slotPrice(registry, sword, 'primary')).toEqual({ links: 1, scrap: 20 });
    expect(slotPrice(registry, sword, 'basic')).toEqual({ links: 3, scrap: 60 });
    expect(slotPrice(registry, sword, 'defensive')).toBeNull();
    const res = addSlot(registry, rich(), 'primary');
    expect(res.profile).toMatchObject({ links: 98, scrap: 9979 });
    expect(slotPrice(registry, res.profile.equipped.weapon!, 'primary')).toEqual({
      links: 2,
      scrap: 40,
    });
  });

  it("appends the default kind at the chain's end, in the last move's form and in-pair elements", () => {
    const p = rich();
    const primary = addSlot(registry, p, 'primary').profile;
    expect(chainsOf(primary).primary!.moves).toEqual([
      { kind: 'light', form: 'bolt', elements: ['fire'] },
      { kind: 'medium', form: 'bolt', elements: ['fire'] },
    ]);
    expect(primary.equipped.weapon!.moveset!.slots.primary).toBe(2);
    // A Lance's default chain, [medium, medium, heavy], at the new move's place.
    const lance: Chain = {
      moves: [{ kind: 'heavy', form: 'lance', elements: ['fire', 'storm'] }],
      payment: 'cast',
    };
    const bound = rich(withChains(bindSecondary(registry, p, 'storm').profile, { primary: lance }));
    expect(chainsOf(addSlot(registry, bound, 'primary').profile).primary!.moves[1]).toEqual({
      kind: 'medium',
      form: 'lance',
      elements: ['fire', 'storm'],
    });
    // A blow past the sword's string of three: medium.
    expect(chainsOf(addSlot(registry, p, 'basic').profile).basic![3]).toEqual({
      kind: 'medium',
      element: 'fire',
    });
  });

  it("gives the new move the pair's primary when the last move is off-pair", () => {
    const nature: Chain = {
      moves: [{ kind: 'light', form: 'bolt', elements: ['nature', 'fire'] }],
      payment: 'mana',
    };
    const p = rich(
      withChains(createDelveProfile(registry, 3, { primary: 'fire' }), { primary: nature }),
    );
    expect(chainsOf(addSlot(registry, p, 'primary').profile).primary!.moves[1].elements).toEqual([
      'fire',
    ]);
  });

  it('never touches a slot the chain is not using', () => {
    const dagger = {
      ...rich(),
      equipped: { ...rich().equipped, weapon: weapon('common', 3, 'dagger') },
    };
    const three = setChain(registry, dagger, 'basic', chainsOf(dagger).basic!.slice(0, 3)).profile;
    expect(three.equipped.weapon!.moveset!.slots.basic).toBe(4);
    const added = addSlot(registry, three, 'basic').profile;
    expect(added.equipped.weapon!.moveset!.slots.basic).toBe(5);
    // The dagger's string at the fourth place: heavy.
    expect(chainsOf(added).basic!.map((b) => b.kind)).toEqual([
      'light',
      'light',
      'medium',
      'heavy',
    ]);
  });

  it("refuses mid-dive, unarmed, a skill the weapon doesn't carry, at 5 slots, and without the Links or the scrap", () => {
    const p = rich();
    const reason = (q: DelveProfile, skill: 'basic' | 'primary' | 'defensive' = 'primary') =>
      addSlot(registry, q, skill).reason;
    expect(reason(startDive(registry, p, 1))).toBe('Chains can only change between dives');
    expect(reason(unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
    expect(reason(p, 'defensive')).toBe('Carried by rare weapons and better');
    let full = p;
    for (let i = 0; i < 4; i++) full = addSlot(registry, full, 'primary').profile;
    expect(full.equipped.weapon!.moveset!.slots.primary).toBe(5);
    // The 2nd to 5th slots: 1 + 2 + 3 + 4 Links and 20 + 40 + 60 + 80 scrap.
    expect(full).toMatchObject({ links: 89, scrap: 9799 });
    expect(reason(full)).toBe('This chain has every slot');
    expect(reason({ ...p, links: 0 })).toBe('Not enough Links');
    expect(reason({ ...p, scrap: 19 })).toBe('Not enough scrap');
  });
});

/** `w` with a moveset of these slots, every move its default in `w`'s mana. */
function slotted(w: GearItem, slots: Moveset['slots']): GearItem {
  return { ...w, moveset: defaultMoveset(registry, w, w.mana, slots) };
}

describe('Links: salvage and banking', () => {
  const rare = slotted(weapon('rare', 1, 'sword'), { basic: 4, primary: 3, defensive: 1 }); // 3 extra
  const hero = () => createDelveProfile(registry, 3, { primary: 'storm' });
  /** Its Links: the extra slots past the ones a rare forge grants free. */
  const links = 3 - bal.crafting.weaponExtras.rare.slots;

  it('salvaging a weapon gives a Link for each extra slot past the forged ones; other gear none', () => {
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 2, rarity: 'rare', slot: 'chest' },
      new SeededRNG(2),
    );
    const res = salvageItems(registry, { ...hero(), bag: [rare, chest] }, [rare.uid, chest.uid]);
    expect(res.links).toBe(links);
    expect(res.profile.links).toBe(links);
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

describe('transfer', () => {
  const T = bal.movesets.transferScrap;
  /** A Fire hero wielding `w`, with scrap to spare, and `bag` in the bag. */
  const holding = (w: GearItem, ...bag: GearItem[]): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return { ...p, equipped: { ...p.equipped, weapon: w }, bag, scrap: 1000 };
  };
  const built = (w: GearItem, chains: Moveset['chains'], slots: Moveset['slots']): GearItem => {
    const m = slotted(w, slots).moveset!;
    return { ...w, moveset: { chains: { ...m.chains, ...chains }, slots: m.slots } };
  };
  const lance: Chain = {
    moves: [
      { kind: 'heavy', form: 'lance', elements: ['fire'] },
      { kind: 'light', form: 'lance', elements: ['fire'] },
    ],
    payment: 'cast',
  };

  it("moves each chain with its extra slots onto the target's base, for scrap; the target's replaced extras come back as Links", () => {
    // A rare sword: a 4-slot string (1 extra), a 3-slot Primary (2), a 2-slot Defensive (1).
    const sword = built(
      weapon('rare', 1, 'sword'),
      { primary: lance },
      { basic: 4, primary: 3, defensive: 2 },
    );
    // A rare axe with its own extra Primary slot.
    const axe = slotted(
      { ...weapon('rare', 2, 'axe'), uid: 'axe' },
      { basic: 3, primary: 2, defensive: 1 },
    );
    const res = transferMoveset(registry, holding(sword, axe), 'axe');
    expect(res.ok).toBe(true);
    const moved = res.profile.equipped.weapon!;
    expect(moved.uid).toBe('axe');
    expect(moved.moveset!.slots).toEqual({ basic: 4, primary: 3, defensive: 2 });
    expect(moved.moveset!.chains).toEqual(sword.moveset!.chains);
    expect(res.links).toBe(1);
    expect(res.profile.links).toBe(1);
    expect(res.profile.scrap).toBe(1000 - 4 * T);
    // The sword goes back to the bag at its base slots, its moves the defaults in its own mana.
    expect(res.profile.bag).toEqual([
      { ...sword, moveset: defaultMoveset(registry, sword, sword.mana) },
    ]);
  });

  it('a basic chain onto a shorter string drops moves from the end; past the cap its extras come back as Links', () => {
    // A dagger's full string (4 + 1 extra) onto a maul (2): 3 slots, the last two blows gone.
    const dagger = slotted(weapon('magic', 3, 'dagger'), { basic: 5, primary: 1, defensive: 1 });
    const maul = { ...weapon('common', 4, 'maul'), uid: 'maul' };
    const res = transferMoveset(registry, holding(dagger, maul), 'maul');
    const basic = res.profile.equipped.weapon!.moveset!;
    expect(basic.slots.basic).toBe(3);
    expect(basic.chains.basic).toEqual(dagger.moveset!.chains.basic!.slice(0, 3));
    expect(res.profile.scrap).toBe(1000 - T);
    // A sword's 5-slot string (2 extra) onto a dagger (4): 5 slots, 1 Link back.
    const sword = slotted(weapon('rare', 5, 'sword'), { basic: 5, primary: 1, defensive: 1 });
    const onto = { ...weapon('common', 6, 'dagger'), uid: 'd' };
    const over = transferMoveset(registry, holding(sword, onto), 'd');
    expect(over.profile.equipped.weapon!.moveset!.slots.basic).toBe(5);
    expect(over.links).toBe(1);
    expect(over.profile.scrap).toBe(1000 - T);
  });

  it("leaves chains the target can't carry behind, their extras back as Links, and prices only what moves", () => {
    const epic = slotted(weapon('epic', 7, 'sword'), {
      basic: 3,
      primary: 2,
      defensive: 1,
      ultimate: 3,
    });
    const uncommon = { ...weapon('uncommon', 8, 'axe'), uid: 'axe' };
    const res = transferMoveset(registry, holding(epic, uncommon), 'axe');
    const m = res.profile.equipped.weapon!.moveset!;
    expect(Object.keys(m.chains)).toEqual(['basic', 'primary']);
    expect(m.slots).toEqual({ basic: 3, primary: 2 });
    expect(res.links).toBe(2); // the Ultimate's two extras
    expect(res.profile.scrap).toBe(1000 - T); // the Primary's one extra moved
  });

  it("keeps the target's own chain for a skill only it carries", () => {
    const common = weapon('common', 9, 'sword');
    const epic = slotted(
      { ...weapon('epic', 10, 'axe'), uid: 'axe' },
      { basic: 3, primary: 1, defensive: 1, ultimate: 2 },
    );
    const res = transferMoveset(registry, holding(common, epic), 'axe');
    const m = res.profile.equipped.weapon!.moveset!;
    expect(m.chains.ultimate).toEqual(epic.moveset!.chains.ultimate);
    expect(m.slots).toEqual({ basic: 3, primary: 1, defensive: 1, ultimate: 2 });
    expect([res.links, res.profile.scrap]).toEqual([0, 1000]);
  });

  it('refuses mid-dive, unarmed, anything but a bag weapon, and without the scrap', () => {
    const sword = slotted(weapon('rare', 11, 'sword'), { basic: 3, primary: 3, defensive: 1 });
    const axe = { ...weapon('rare', 12, 'axe'), uid: 'axe' };
    const helm = generateItem(
      registry,
      { uid: 'helm', ilvl: 2, rarity: 'rare', slot: 'helm' },
      new SeededRNG(4),
    );
    const p = holding(sword, axe, helm);
    const reason = (q: DelveProfile, uid = 'axe') => transferMoveset(registry, q, uid).reason;
    expect(reason(startDive(registry, p, 1))).toBe('Transfer your moveset between dives');
    expect(reason(unequipSlot(registry, p, 'weapon'))).toBe('Equip a weapon to build your moves');
    expect(reason(p, p.equipped.chest!.uid)).toBe('Transfer onto a weapon in your bag');
    expect(reason(p, 'helm')).toBe('Transfer onto a weapon in your bag');
    expect(reason(p, 'nope')).toBe('Transfer onto a weapon in your bag');
    expect(reason({ ...p, scrap: 2 * bal.movesets.transferScrap - 1 })).toBe('Not enough scrap');
  });
});

describe('valuing a weapon: as it is, and as a home', () => {
  /** A Fire hero whose uncommon sword holds a 4-slot Primary, and `bag` in the bag. */
  const hero = (...bag: GearItem[]): DelveProfile => {
    const p = armed(registry, createDelveProfile(registry, 3, { primary: 'fire' }));
    const sword = slotted(p.equipped.weapon!, { basic: 3, primary: 4 });
    return { ...p, equipped: { ...p.equipped, weapon: sword }, bag, scrap: 1000 };
  };
  /** The same sword as the hero's, one upgrade better, with its base moveset. */
  const spare = (p: DelveProfile): GearItem => ({
    ...p.equipped.weapon!,
    uid: 'spare',
    upgrade: 1,
    moveset: defaultMoveset(registry, p.equipped.weapon!, 'fire'),
  });

  it('as it is: its own moveset; as a home: the equipped moveset moved onto it (the default)', () => {
    const p0 = hero();
    const p = { ...p0, bag: [spare(p0)] };
    const cmp = (value?: 'home' | 'asIs') =>
      compareItem(p.equipped, p.bag[0], registry, 1, p.pair, value);
    expect(cmp('asIs').newPower).toBe(profilePower(registry, equipItem(registry, p, 'spare')));
    const moved = transferMoveset(registry, p, 'spare').profile;
    expect(cmp('home').newPower).toBe(profilePower(registry, moved));
    expect(cmp()).toEqual(cmp('home'));
    // A better base with fewer slots: junk as it is, an upgrade as a home.
    expect(cmp('asIs').powerPct).toBeLessThanOrEqual(0);
    expect(cmp('home').powerPct).toBeGreaterThan(0);
    // The equipped weapon itself, and unarmed (no moveset to move), value as they are.
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
    const p = { ...p0, bag: [spare(p0)] };
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
    expect(transferMoveset(registry, diving, 'axe').ok).toBe(false);
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
    expect(transferMoveset(registry, choosing, 'axe').ok).toBe(false);
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
    return {
      ...p,
      equipped: { ...p.equipped, weapon },
      materials: emptyMaterials(),
      stats: { ...p.stats, dives: 1 },
    };
  };

  it('moves its moveset onto the bag weapon that makes the best home, when it can pay', () => {
    const p0 = veteran();
    const sword = slotted(p0.equipped.weapon!, { basic: 3, primary: 2 }); // 1 extra: 30 scrap
    const better = { ...p0.equipped.weapon!, uid: 'better', upgrade: 5 };
    const p = { ...veteran(sword), bag: [better] };
    const after = betweenDives(registry, { ...p, scrap: 1000 });
    expect(after.equipped.weapon!.uid).toBe('better');
    expect(after.equipped.weapon!.moveset!.chains).toEqual(sword.moveset!.chains);
    expect(betweenDives(registry, { ...p, scrap: 0 }).equipped.weapon!.uid).toBe(sword.uid);
  });

  it('spends Links in the order Primary, basic chain, Ultimate, Defensive: each to three slots, then (after sockets) the rest', () => {
    const epic = weapon('epic', 1, 'sword');
    const base = {
      ...veteran(slotted(epic, { basic: 3, primary: 1, defensive: 1, ultimate: 1 })),
      scrap: 9999,
    };
    const slots = (links: number) =>
      betweenDives(registry, { ...base, links }).equipped.weapon!.moveset!.slots;
    expect(slots(1)).toEqual({ basic: 3, primary: 2, defensive: 1, ultimate: 1 });
    // 1 + 2 each for the Primary's, the Ultimate's and the Defensive's 2nd and 3rd slots (9), then
    // 3 for the Primary's 4th; its 5th (4) can't be paid, nor the basic chain's 4th (3).
    expect(slots(13)).toEqual({ basic: 3, primary: 4, defensive: 3, ultimate: 3 });
    // 9 + 3 + 4 brings the Primary to five; 3 more, the basic chain's 4th.
    expect(slots(16)).toEqual({ basic: 3, primary: 5, defensive: 3, ultimate: 3 });
    expect(slots(19)).toEqual({ basic: 4, primary: 5, defensive: 3, ultimate: 3 });
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
    expect(primary(poor)).toEqual([['fire']]);
    const paid = betweenDives(registry, { ...p, manaDust: bal.movesets.elementDust });
    expect(primary(paid)).toEqual([['fire', 'frost']]);
    expect(paid.manaDust).toBe(0);
  });
});

/** A moveset without its sockets (see the runes spec: weapon drops roll some, empty). */
function unsocketed(m: Moveset): Moveset {
  const strip = <X extends Move | Blow>({ runes: _r, ...x }: X) => x;
  const chains = Object.fromEntries(
    Object.entries(m.chains).map(([skill, c]) => [
      skill,
      Array.isArray(c) ? c.map(strip) : { ...c, moves: c!.moves.map(strip) },
    ]),
  );
  return { chains, slots: m.slots };
}
