import { describe, it, expect } from 'vitest';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { generateItem } from '../src/loot/item-generator.js';
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
  fuseGear,
  parseDelveProfile,
  profilePower,
  reforgeGear,
  salvageCandidates,
  salvageItems,
  setAutoSalvage,
  unequipSlot,
  upgradeGear,
} from '../src/delve/profile.js';
import V5 from './fixtures/delve-v5-saves.json';
import { abilityReady, nextMove, pressMove, pressStep } from '../src/arpg/abilities/cast.js';
import { gainCharge } from '../src/arpg/abilities/defend.js';
import { botInput } from '../src/arpg/bot.js';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { fillCharge, setSandboxToggles } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { compareItem, computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import { CHAIN_SKILLS, type Blow, type Chain, type Move } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { GearItem, Moveset, Rarity } from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import {
  DEFAULT_CHAINS,
  OLD_BUILDS,
  STEP,
  arena,
  asV4,
  bal,
  chainsOf,
  dummy,
  gear,
  press,
  registry,
  run,
  withChains,
} from './fixtures/arena.js';

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
    expect(m.carries.common).toEqual(['basic', 'primary']);
    expect(m.carries.uncommon).toEqual(['basic', 'primary']);
    expect(m.carries.magic).toEqual(['basic', 'primary', 'defensive']);
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
    const shrinks = { ...balanceData.delve.movesets.carries, rare: ['basic', 'primary'] };
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

  it('carries chains by rarity; unarmed carries the basic chain and the Primary', () => {
    for (const r of RARITY_ORDER)
      expect(carriedSkills(registry, r)).toEqual(bal.movesets.carries[r]);
    expect(carriedSkills(registry, null)).toEqual(['basic', 'primary']);
    expect(carriedFrom(registry, 'basic')).toBeNull();
    expect(carriedFrom(registry, 'primary')).toBeNull();
    expect(carriedFrom(registry, 'defensive')).toBe('magic');
    expect(carriedFrom(registry, 'ultimate')).toBe('epic');
  });
});

describe('default moves', () => {
  it("fills a moveset at its base slots: the weapon's string, and each slot's default form's first move", () => {
    const m = defaultMoveset(registry, { baseId: 'sword', rarity: 'common' }, 'frost');
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
    expect(m.slots).toEqual({ basic: 3, primary: 1 });
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
        expect(m).toEqual(defaultMoveset(registry, w, 'storm', m.slots));
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

  it('leaves every other item stat, and every later drop, as v0.48.0 rolled them', () => {
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
      kind: 'boss' as const,
      magicFind: 40,
      pity: 0,
      dropMult: 1,
      legendaryBoost: 1,
      forceLegendary: true,
      nextUid: 1,
      biomeMana: 'earth' as const,
      pair: ['fire' as const],
    };
    for (let i = 0; i < 40; i++) {
      const kind = i % 3 ? ('elite' as const) : ('boss' as const);
      const r = rollEncounterDrops(registry, { ...ctx, kind, forceLegendary: i === 0 }, rng);
      items.push(...r.items);
      ctx = { ...ctx, pity: r.pity, nextUid: r.nextUid };
    }
    const strip = items.map(({ moveset: _m, ...rest }) => rest);
    let h = 0x811c9dc5;
    for (const c of JSON.stringify(strip)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    // v0.48.0's 291 items, hashed the same way (the plan's scratchpad `items-hash.mjs`).
    expect([items.length, h.toString(16)]).toEqual([291, '49e20fb6']);
  });
});

describe('save schema: a weapon moveset', () => {
  const sword = weapon('common', 1, 'sword');

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

describe('save v6: the migration from version 5', () => {
  // Real version 5 saves from the v0.48.0 engine (see the fixture): a new hero, a bound
  // Fire+Storm hero with a rare axe in the bag, an unarmed hero with a built Primary, a magic
  // dagger mid-dive with a two-move Ultimate, and an epic maul with a one-blow basic chain.
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));
  const migrate = (save: object) => parseDelveProfile(registry, json(save))!;

  it("gives the equipped weapon the profile's chains it can carry, at slots of their length", () => {
    const { profile, fixed, dropped, movesetReset } = migrate(V5.fresh);
    expect(profile).toMatchObject({ version: 7, links: 0 });
    expect('chains' in profile || 'chainCaps' in profile).toBe(false);
    const sword = profile.equipped.weapon!;
    expect(sword.moveset).toEqual({
      chains: { basic: V5.fresh.chains.basic, primary: V5.fresh.chains.primary },
      slots: { basic: 3, primary: 4 },
    });
    // A common sword carries no Defensive or Ultimate: both go (one move each, so no Links).
    expect([fixed, dropped, movesetReset]).toEqual([[], ['defensive', 'ultimate'], false]);
    expect(profile.equipped.chest).toEqual(V5.fresh.equipped.chest);
    const { chains: _c, chainCaps: _k, version: _v, equipped: _e, ...rest } = V5.fresh;
    expect(profile).toMatchObject(rest);
  });

  it('keeps built chains and gives every other weapon its base defaults in its own mana', () => {
    const { profile } = migrate(V5.bound);
    expect(heroChains(registry, profile.equipped, profile.pair)).toEqual({
      basic: V5.bound.chains.basic,
      primary: V5.bound.chains.primary,
    });
    expect(profile.equipped.weapon!.moveset!.slots).toEqual({ basic: 3, primary: 2 });
    const axe = profile.bag[0];
    expect(axe.moveset).toEqual(defaultMoveset(registry, axe, 'frost'));
    expect(axe.moveset!.slots).toEqual({ basic: 3, primary: 1, defensive: 1 });
  });

  it("drops the chains a weapon can't carry, their moves past one slot back as Links; a dive stays", () => {
    const { profile, dropped } = migrate(V5.magic);
    expect(dropped).toEqual(['ultimate']);
    expect(profile.links).toBe(1);
    const dagger = profile.equipped.weapon!.moveset!;
    expect(Object.keys(dagger.chains)).toEqual(['basic', 'primary', 'defensive']);
    // Its basic slots rise to the dagger's string of 4; the sword's three blows stay.
    expect(dagger.slots).toEqual({ basic: 4, primary: 4, defensive: 1 });
    expect(dagger.chains.basic).toEqual(V5.magic.chains.basic);
    expect(profile.dive).toEqual({ ...V5.magic.dive, linksEarned: 0, runesEarned: 0, stop: null });
  });

  it("keeps all four on an epic weapon, and raises a short basic chain's slots to its base", () => {
    const { profile, dropped } = migrate(V5.epic);
    expect(dropped).toEqual([]);
    const maul = profile.equipped.weapon!.moveset!;
    expect(maul.chains).toEqual(V5.epic.chains);
    expect(maul.slots).toEqual({ basic: 2, primary: 4, defensive: 1, ultimate: 1 });
  });

  it("resets an unarmed save's built chains to the unarmed defaults, and says so", () => {
    const res = migrate(V5.unarmed);
    expect(res.movesetReset).toBe(true);
    expect(res.dropped).toEqual([]);
    expect(heroChains(registry, res.profile.equipped, res.profile.pair)).toEqual(
      defaultMoveset(registry, { baseId: null, rarity: null }, 'fire').chains,
    );
    // An unarmed save on the unarmed defaults loses nothing.
    const plain = { ...V5.unarmed, chains: V5.fresh.chains };
    expect(migrate(plain).movesetReset).toBe(false);
  });

  it("drops a version 4 save's uncarried chains before fixing the rest to the pair", () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' }); // a common sword
    const frost = (b: (typeof OLD_BUILDS)['primary']) => ({ ...b, elements: ['frost' as const] });
    const builds = {
      ...OLD_BUILDS,
      primary: frost(OLD_BUILDS.primary),
      defensive: frost(OLD_BUILDS.defensive),
    };
    const res = migrate(asV4(p, builds));
    expect(res.dropped).toEqual(['defensive', 'ultimate']);
    // The Bolt's four moves are fixed to Fire; the Frost Ward went with the Defensive.
    expect(res.fixed.map((f) => [f.skill, f.index])).toEqual([
      ['primary', 0],
      ['primary', 1],
      ['primary', 2],
      ['primary', 3],
    ]);
  });

  it('round-trips every migrated save as version 7', () => {
    for (const save of Object.values(V5)) {
      const { profile } = migrate(save);
      expect(parseDelveProfile(registry, json(profile))).toEqual({
        profile,
        fixed: [],
        dropped: [],
        movesetReset: false,
        runesLost: [],
      });
    }
  });

  it("fits a version 6 save's weapons to the data at load", () => {
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

describe('the edit price (movesetEditPrice)', () => {
  const E = bal.movesets.editDust;
  const X = bal.movesets.elementDust;
  const bolt = (kind: Move['kind'], ...elements: ManaType[]): Move => ({
    kind,
    form: 'bolt',
    elements,
  });
  const chain = (...moves: Move[]): Chain => ({ moves, payment: 'mana' });
  const price = (old: Chain, next: Chain) =>
    movesetEditPrice(registry, { primary: old }, { primary: next });
  const A = bolt('light', 'fire');
  const B = bolt('medium', 'fire');
  const C = bolt('heavy', 'storm');

  it('the run the chains share is free: removing or inserting a move costs only that move', () => {
    expect(price(chain(A, B, C), chain(A, B, C))).toBe(0);
    expect(price(chain(A, B, C), chain(A, C))).toBe(E);
    expect(price(chain(A, B, C), chain(B, C))).toBe(E);
    expect(price(chain(A, C), chain(A, B, C))).toBe(E); // Fire is an old move's element
  });

  it('a move that only moved costs editDust; a ◂▸ swap moves one', () => {
    expect(price(chain(A, B, C), chain(B, C, A))).toBe(E);
    expect(price(chain(A, B), chain(B, A))).toBe(E);
  });

  it('the rest pair up in order: a changed kind or form, changed elements, or both', () => {
    expect(price(chain(A, B), chain(A, bolt('heavy', 'fire')))).toBe(E);
    expect(price(chain(A, B), chain(A, { ...B, form: 'lance' }))).toBe(E);
    expect(price(chain(A, B), chain(A, bolt('medium', 'storm')))).toBe(X);
    expect(price(chain(A, B), chain(A, bolt('medium', 'fire', 'storm')))).toBe(X);
    expect(price(chain(A, B), chain(A, bolt('heavy', 'storm', 'fire')))).toBe(E + X);
  });

  it('the rest pair up at the least total price, not by position', () => {
    // Remove the light Fire Bolt and make the heavy Storm Bolt light: E + E (in order, 15 + 5).
    expect(price(chain(A, C), chain(bolt('light', 'storm')))).toBe(2 * E);
    // Make the heavy Fire Bolt Storm and add a light Storm Bolt: X + E, Storm charged once (in order, 20 + 20).
    expect(price(chain(bolt('heavy', 'fire')), chain(bolt('light', 'storm'), C))).toBe(E + X);
    // Leaving a pair unmatched when that's cheaper: remove the heavy Storm Bolt, add a heavy Fire one (Fire is known).
    expect(price(chain(A, C), chain(A, bolt('heavy', 'fire')))).toBe(2 * E);
  });

  it('a new element set is charged once per Apply, so a batch never costs more than its edits one by one', () => {
    const fire: Blow = { kind: 'light', element: 'fire' };
    const storm: Blow = { kind: 'light', element: 'storm' };
    const blows = (old: Blow[], next: Blow[]) =>
      movesetEditPrice(registry, { basic: old }, { basic: next });
    expect(blows([fire], [fire, storm])).toBe(E + X);
    expect(blows([fire, storm], [fire, storm, storm])).toBe(E);
    expect(blows([fire], [fire, storm, storm])).toBe(2 * E + X);
    // Two moves changed to one new element: Storm charged once, the second removed and re-added.
    expect(price(chain(A, B), chain(bolt('light', 'storm'), bolt('medium', 'storm')))).toBe(
      X + 2 * E,
    );
  });

  it('is 0 only for the same chain and never beats doing it in two Applies (random triples)', () => {
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
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    let bad = 0;
    for (let n = 0; n < 4000; n++) {
      const basic = n % 2 === 0;
      const [a, b, c] = basic
        ? [randomBlows(), randomBlows(), randomBlows()].map((x) => ({ basic: x }))
        : [randomChain(), randomChain(), randomChain()].map((x) => ({ primary: x }));
      const p = (x: typeof a, y: typeof a) => movesetEditPrice(registry, x, y);
      if (p(a, c) > p(a, b) + p(b, c)) bad++;
      if ((p(a, b) === 0) !== same(a, b)) bad++;
    }
    expect(bad).toBe(0);
  });

  it('a move left over: a new one costs editDust and, with elements no old move has, elementDust; a removal editDust', () => {
    expect(price(chain(A), chain(A, bolt('medium', 'nature')))).toBe(E + X);
    expect(price(chain(A, C), chain(A, C, bolt('light', 'storm')))).toBe(E);
    expect(price(chain(A, B, C), chain(A))).toBe(2 * E);
  });

  it('a changed payment costs editDust; blows price the same way; chains left out cost nothing', () => {
    expect(price(chain(A), { moves: [A], payment: 'cast' })).toBe(E);
    const fire: Blow = { kind: 'light', element: 'fire' };
    const heavy: Blow = { kind: 'heavy', element: 'fire' };
    const blows = (old: Blow[], next: Blow[]) =>
      movesetEditPrice(registry, { basic: old }, { basic: next });
    expect(blows([fire, fire, heavy], [fire, heavy])).toBe(E);
    expect(blows([fire, fire, heavy], [fire, fire, { ...heavy, element: 'frost' }])).toBe(X);
    const old = { basic: [fire], primary: chain(A) };
    expect(movesetEditPrice(registry, old, { primary: chain(B) })).toBe(E);
    expect(movesetEditPrice(registry, old, { basic: [heavy], primary: chain(B) })).toBe(2 * E);
  });
});

describe('edits: setChain and setChains', () => {
  const light = (...elements: ManaType[]): Move => ({ kind: 'light', form: 'bolt', elements });
  /** A Fire hero past its first dive, with 20 Mana Dust. */
  const veteran = (): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return { ...p, manaDust: 20, stats: { ...p.stats, dives: 1 } };
  };

  it('edits the equipped weapon for its price; nothing before the first dive, nothing unchanged', () => {
    const next: Chain = {
      moves: [{ kind: 'heavy', form: 'bolt', elements: ['fire'] }],
      payment: 'mana',
    };
    const fresh = createDelveProfile(registry, 3, { primary: 'fire' });
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
    expect(reason(p, 'defensive', ward)).toBe('Carried by magic weapons and better');
    const magic = {
      ...p,
      equipped: { ...p.equipped, weapon: weapon('magic', 2, 'sword') },
    };
    const nova = { moves: [{ ...light('fire'), form: 'nova' as const }], payment: 'mana' as const };
    expect(reason(magic, 'ultimate', nova)).toBe('Carried by epic weapons and better');
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
    const both = setChains(registry, p, { basic, primary });
    expect(both.ok).toBe(true);
    expect(chainsOf(both.profile)).toEqual({ basic, primary });
    // Two blows removed and a kind changed: 3 × editDust.
    expect(both.profile.manaDust).toBe(20 - 3 * bal.movesets.editDust);
    const poor = { ...p, manaDust: 3 * bal.movesets.editDust - 1 };
    expect(setChains(registry, poor, { basic, primary })).toMatchObject({
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

describe('slots: addSlot', () => {
  /** A Fire hero with plenty of Links and scrap. */
  const rich = (p = createDelveProfile(registry, 3, { primary: 'fire' })): DelveProfile => ({
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
    expect(reason(p, 'defensive')).toBe('Carried by magic weapons and better');
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

describe('Links: salvage, fusing and banking', () => {
  const rare = slotted(weapon('rare', 1, 'sword'), { basic: 4, primary: 3, defensive: 1 }); // 3 extra
  const hero = () => createDelveProfile(registry, 3, { primary: 'storm' });

  it('salvaging a weapon gives a Link for each extra slot; other gear none', () => {
    const chest = generateItem(
      registry,
      { uid: 'c', ilvl: 2, rarity: 'rare', slot: 'chest' },
      new SeededRNG(2),
    );
    const res = salvageItems(registry, { ...hero(), bag: [rare, chest] }, [rare.uid, chest.uid]);
    expect(res.links).toBe(3);
    expect(res.profile.links).toBe(3);
  });

  it('auto-salvage and a full bag give them too, and banking reports them for the dive', () => {
    const p = startDive(registry, setAutoSalvage(hero(), 'rare', true), 1);
    const w = beginFloor(registry, p);
    w.pending.items = [rare];
    const res = bankWorld(registry, p, w);
    expect(res.links).toBe(3);
    expect(res.profile.links).toBe(3);
    expect(res.profile.dive!.linksEarned).toBe(3);

    const full = { ...startDive(registry, hero(), 1), bag: Array(bal.loot.bagSize).fill(rare) };
    const w2 = beginFloor(registry, full);
    w2.pending.items = [rare];
    expect(bankWorld(registry, full, w2)).toMatchObject({ bagFull: true, links: 3 });
  });

  it('fusing three weapons refunds their extra slots as Links; the fused weapon rolls its own', () => {
    const magic = (uid: string, primary: number) => ({
      ...slotted(weapon('magic', 4, 'axe'), { basic: 3, primary, defensive: 1 }),
      uid,
    });
    const p = { ...hero(), scrap: 9999, bag: [magic('a', 2), magic('b', 1), magic('c', 2)] };
    const res = fuseGear(registry, p, ['a', 'b', 'c']);
    expect(res.ok).toBe(true);
    expect(res.links).toBe(2);
    expect(res.profile.links).toBe(2);
    expect(res.item!.rarity).toBe('rare');
    expect(extraSlots(registry, res.item!)).toBeGreaterThanOrEqual(1); // a rare's own 1–2
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
    const common = { ...weapon('common', 8, 'axe'), uid: 'axe' };
    const res = transferMoveset(registry, holding(epic, common), 'axe');
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
  /** A Fire hero whose sword holds a 4-slot Primary, and `bag` in the bag. */
  const hero = (...bag: GearItem[]): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
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
    const triple = { ...diving, bag: [0, 1, 2].map((i) => ({ ...helm, uid: `f${i}` })) };
    expect(fuseGear(registry, triple, ['f0', 'f1', 'f2'])).toMatchObject({
      ok: false,
      reason: forge,
    });
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
  /** A Fire hero after its first dive, wielding `w` (the starter sword by default). */
  const veteran = (w?: GearItem): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const weapon = w ?? p.equipped.weapon!;
    return { ...p, equipped: { ...p.equipped, weapon }, stats: { ...p.stats, dives: 1 } };
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

  it('spends Links in the order Primary, basic chain, Ultimate, Defensive, each as far as it can pay', () => {
    const epic = weapon('epic', 1, 'sword');
    const base = {
      ...veteran(slotted(epic, { basic: 3, primary: 1, defensive: 1, ultimate: 1 })),
      scrap: 9999,
    };
    const slots = (links: number) =>
      betweenDives(registry, { ...base, links }).equipped.weapon!.moveset!.slots;
    expect(slots(1)).toEqual({ basic: 3, primary: 2, defensive: 1, ultimate: 1 });
    // 1 + 2 + 3 + 4 for the Primary's four, then 3 for the sword's 4th basic slot.
    expect(slots(13)).toEqual({ basic: 4, primary: 5, defensive: 1, ultimate: 1 });
    // 10 for the Primary; the basic chain's 3 can't be paid, so the last 2 buy the Ultimate's and the Defensive's.
    expect(slots(12)).toEqual({ basic: 3, primary: 5, defensive: 2, ultimate: 2 });
  });

  it('changes nothing on a dive still open: every op refuses, and it never loops', () => {
    const p = startDive(registry, { ...veteran(), links: 5, scrap: 1000, manaDust: 99 }, 1);
    const after = betweenDives(registry, p);
    expect(after.equipped).toEqual(p.equipped);
    expect(after).toMatchObject({ links: 5, scrap: 1000, manaDust: 99 });
  });

  it('pays for its fused Primary, and skips the edit when it cannot', () => {
    const helm = generateItem(
      registry,
      { uid: 'h', ilvl: 2, rarity: 'common', slot: 'helm', mana: 'storm' },
      new SeededRNG(3),
    );
    const p = { ...veteran(), bag: [helm] };
    const primary = (q: DelveProfile) => chainsOf(q).primary!.moves.map((m) => m.elements);
    const poor = betweenDives(registry, p);
    expect(poor.pair.secondary).toBe('storm');
    expect(primary(poor)).toEqual([['fire']]);
    const paid = betweenDives(registry, { ...p, manaDust: bal.movesets.elementDust });
    expect(primary(paid)).toEqual([['fire', 'storm']]);
    expect(paid.manaDust).toBe(0);
  });
});
