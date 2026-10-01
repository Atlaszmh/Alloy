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
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import V5 from './fixtures/delve-v5-saves.json';
import { abilityReady, nextMove, pressMove, pressStep } from '../src/arpg/abilities/cast.js';
import { gainCharge } from '../src/arpg/abilities/defend.js';
import { botInput } from '../src/arpg/bot.js';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { fillCharge, setSandboxToggles } from '../src/arpg/sandbox.js';
import { stepWorld } from '../src/arpg/step.js';
import { refreshWorldHero } from '../src/arpg/world.js';
import { computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import { CHAIN_SKILLS, type Blow, type Chain } from '../src/types/ability.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { GearItem, Rarity } from '../src/types/gear.js';
import { RARITY_ORDER } from '../src/types/gem.js';
import {
  DEFAULT_CHAINS,
  OLD_BUILDS,
  STEP,
  arena,
  asV4,
  bal,
  dummy,
  gear,
  press,
  registry,
  run,
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

  it('refuses a rarity that carries no basic chain or less than the rarity below, or extra slots that fall', () => {
    const withMovesets = (movesets: object) => ({
      ...balanceData,
      delve: { ...balanceData.delve, movesets: { ...balanceData.delve.movesets, ...movesets } },
    });
    const carries = { ...balanceData.delve.movesets.carries, common: ['primary'] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ carries })).success).toBe(false);
    const shrinks = { ...balanceData.delve.movesets.carries, rare: ['basic', 'primary'] };
    expect(BalanceConfigSchema.safeParse(withMovesets({ carries: shrinks })).success).toBe(false);
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
    expect(profile).toMatchObject({ version: 6, links: 0 });
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
    expect(profile.dive).toEqual({ ...V5.magic.dive, linksEarned: 0 });
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

  it('round-trips every migrated save as version 6', () => {
    for (const save of Object.values(V5)) {
      const { profile } = migrate(save);
      expect(parseDelveProfile(registry, json(profile))).toEqual({
        profile,
        fixed: [],
        dropped: [],
        movesetReset: false,
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
          slots: { ...moveset.slots, defensive: 1 },
        },
      }, // a chain its rarity doesn't carry
      {
        ...rare,
        moveset: {
          chains: { basic: [one, two], primary: rare.moveset!.chains.primary },
          slots: { basic: 2, primary: rare.moveset!.slots.primary },
        },
      }, // a Defensive to add, a basic slot count to raise
    ];
    const fitted = parseDelveProfile(registry, json({ ...p, bag }))!.profile.bag;
    expect(fitted[0].moveset).toEqual(defaultMoveset(registry, bare, 'storm'));
    expect(fitted[1].moveset).toEqual(moveset);
    expect(fitted[2].moveset!.chains.defensive).toEqual(
      defaultMoveset(registry, rare, 'storm').chains.defensive,
    );
    expect(fitted[2].moveset!.slots.defensive).toBe(1);
    expect(fitted[2].moveset!.slots.basic).toBe(3);
    expect(fitted[2].moveset!.chains.basic).toEqual([one, two]);
  });
});
