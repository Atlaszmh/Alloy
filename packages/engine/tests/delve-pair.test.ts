import { describe, it, expect } from 'vitest';
import {
  defaultBasic,
  defaultChains,
  followBasic,
  isDefaultBasic,
} from '../src/arpg/abilities/resolve.js';
import { UNARMED, defaultMoveset } from '../src/loot/moveset.js';
import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
import { bankWorld, beginFloor, heroMaxHp, startDive } from '../src/delve/dive.js';
import {
  bindSecondary,
  chooseStartingMana,
  fixChainsToPair,
  overtakeProgress,
  profileStats,
  realign,
  reattuneCost,
  reattuneItem,
  resolveOvertake,
  salvageDust,
} from '../src/delve/pair.js';
import {
  createDelveProfile,
  equipBest,
  equipItem,
  parseDelveProfile,
  profilePower,
  salvageCandidates,
  salvageItems,
  setAutoSalvage,
  unequipSlot,
} from '../src/delve/profile.js';
import { setChain } from '../src/delve/moveset.js';
import {
  ABILITY_SLOTS,
  type Blow,
  type Chain,
  type Chains,
  type Move,
} from '../src/types/ability.js';
import {
  compareItem,
  computeAttunement,
  computeHeroStats,
  estimateCombat,
  heroPower,
  type HeroStatsExtra,
} from '../src/delve/hero-stats.js';
import { generateItem } from '../src/loot/item-generator.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { DelveProfile, ManaPair } from '../src/types/delve.js';
import {
  GEAR_SLOTS,
  type GearItem,
  type GearSlot,
  type HeroStatKey,
  type Rarity,
} from '../src/types/gear.js';
import type { ManaMap, ManaType } from '../src/types/mana.js';
import {
  OLD_BUILDS,
  asV4,
  bal,
  chainsOf,
  dummy,
  firstBlow,
  gear,
  registry,
  run,
  strikeWorld,
  withChains,
} from './fixtures/arena.js';

/** A plain item of `mana`: no implicits, and only the lines given (as affixes). */
function item(
  mana: ManaType,
  slot: GearSlot = 'ring',
  lines: [HeroStatKey, number][] = [],
  rarity: Rarity = 'common',
): GearItem {
  return {
    uid: `${mana}-${slot}`,
    slot,
    baseId: registry.getGearBasesForSlot(slot)[0].id,
    rarity,
    mana,
    ilvl: 3,
    name: 'Test',
    implicits: [],
    affixes: lines.map(([stat, value]) => ({ stat, value, roll: 0.5 })),
    upgrade: 0,
    reforges: 0,
    locked: false,
  };
}

type Of<K extends ArpgEvent['kind']> = Extract<ArpgEvent, { kind: K }>;
function only<K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K): Of<K>[] {
  return events.filter((e): e is Of<K> => e.kind === kind);
}

describe('balance: delve.pair', () => {
  it("loads the pair's numbers, and Prism speaks of your two elements", () => {
    expect(bal.pair).toEqual({
      overtakeMargin: 1.2,
      basicPowerPerAttune: 0.03,
      dropBias: 0.6,
      primaryShare: 0.6,
      salvageDust: { common: 1, uncommon: 2, magic: 3, rare: 5, epic: 8, legendary: 15 },
      reattuneDust: { common: 2, uncommon: 3, magic: 5, rare: 8, epic: 12, legendary: 20 },
      realignDust: 60,
      realignScrap: 200,
    });
    expect(registry.getLegendary('prism').text).toBe(
      '+{v} to the Attunement of your two elements.',
    );
  });
});

describe('stats with a pair', () => {
  const k = bal.pair.basicPowerPerAttune;

  it('filtered, attunement counts per element, only for the pair', () => {
    const equipped = {
      weapon: item('fire', 'weapon'), // fire 1
      ring: item('frost', 'ring', [
        ['stormAttune', 2], // an off-pair item's in-pair line counts
        ['frostAttune', 3],
      ]),
      amulet: item('storm', 'amulet', [['natureAttune', 4]]), // an in-pair item's off-pair line doesn't
    };
    const pair = { primary: 'fire', secondary: 'storm' } as const;
    expect(computeAttunement(equipped, registry, { pair, filterAttunement: true })).toEqual({
      fire: 1,
      frost: 0,
      storm: 3,
      earth: 0,
      shadow: 0,
      nature: 0,
    });
    const all = { fire: 1, frost: 4, storm: 3, earth: 0, shadow: 0, nature: 4 };
    expect(computeAttunement(equipped, registry, { pair })).toEqual(all);
    const none = { primary: null, secondary: null };
    expect(computeAttunement(equipped, registry, { pair: none, filterAttunement: true })).toEqual(
      all,
    );
  });

  it('Prism adds to the pair only', () => {
    const ring = { ...item('fire', 'ring'), legendary: { id: 'prism', value: 2, roll: 1 } };
    const pair = { primary: 'fire', secondary: 'storm' } as const;
    expect(computeAttunement({ ring }, registry, { pair, filterAttunement: true })).toEqual({
      fire: 3,
      frost: 0,
      storm: 2,
      earth: 0,
      shadow: 0,
      nature: 0,
    });
  });

  it("the pair's default basic chain: blows of the primary, the last the bound secondary, each powered by its element", () => {
    const staff = { weapon: gear('frost', 'weapon', 'staff') }; // frost 1
    const blows = (extra: HeroStatsExtra) => computeHeroStats(staff, registry, extra).weapon.blows;
    const elements = (extra: HeroStatsExtra) => blows(extra).map((b) => b.element);
    const power = (extra: HeroStatsExtra) => blows(extra).map((b) => b.attunePower);
    // No pair yet: the weapon's mana, and no attunement power.
    expect(elements({})).toEqual(['frost', 'frost', 'frost']);
    expect(power({})).toEqual([1, 1, 1]);
    expect(elements({ pair: { primary: 'fire', secondary: null } })).toEqual([
      'fire',
      'fire',
      'fire',
    ]);
    expect(power({ pair: { primary: 'fire', secondary: null } })).toEqual([1, 1, 1]);
    const paired = {
      pair: { primary: 'fire', secondary: 'frost' },
      attunement: { fire: 4 },
    } as const;
    expect(elements(paired)).toEqual(['fire', 'fire', 'frost']);
    expect(power(paired)[0]).toBeCloseTo(1 + 4 * k);
    expect(power(paired)[2]).toBeCloseTo(1 + 1 * k); // the frost staff's own 1
    // A secondary equal to the primary is unbound.
    expect(elements({ pair: { primary: 'fire', secondary: 'fire' } })).toEqual([
      'fire',
      'fire',
      'fire',
    ]);
    // Unarmed, you punch with your pair; with no pair and no weapon, with fire.
    const bare = (pair?: ManaPair) =>
      computeHeroStats({}, registry, { pair }).weapon.blows.map((b) => b.element);
    expect(bare({ primary: 'storm', secondary: 'nature' })).toEqual(['storm', 'storm', 'nature']);
    expect(bare()).toEqual(['fire', 'fire', 'fire']);
    // The hero's own basic chain wins over the default.
    expect(elements({ ...paired, basic: [{ kind: 'heavy', element: 'frost' }] })).toEqual([
      'frost',
    ]);
  });
});

describe('Power values the pair', () => {
  const weapon = gear('fire');
  const solo: ManaPair = { primary: 'fire', secondary: null };
  const bound: ManaPair = { primary: 'fire', secondary: 'storm' };

  it("estimateCombat values each blow by its element's attunement power", () => {
    const stats = computeHeroStats({ weapon }, registry, { pair: bound });
    const dps = (i: number) =>
      estimateCombat(
        {
          ...stats,
          weapon: {
            ...stats.weapon,
            blows: stats.weapon.blows.map((b, j) =>
              j === i ? { ...b, attunePower: b.attunePower * 2 } : b,
            ),
          },
        },
        registry,
        3,
      ).dps;
    const base = dps(-1);
    expect(dps(0)).toBeGreaterThan(base);
    expect(dps(2)).toBeGreaterThan(base);
  });

  it("the last blow strikes with the secondary's element power", () => {
    const plain = item('fire', 'ring');
    const charged = item('fire', 'ring', [['stormPower', 50]]);
    const dps = (pair: ManaPair, ring: GearItem) =>
      estimateCombat(computeHeroStats({ weapon, ring }, registry, { pair }), registry, 3).dps;
    expect(dps(bound, charged)).toBeGreaterThan(dps(bound, plain));
    expect(dps(solo, charged)).toBe(dps(solo, plain)); // no storm anywhere: no gain
  });

  it("Twin Fang's extra hit is worth the last blow, not the chain's average", () => {
    // Two chains worth the same without Twin Fang: one's last blow strikes with storm
    // power, the other's blows all carry the fire power that evens them out. Nature
    // abilities (no power either way) keep everything else equal.
    const stats = computeHeroStats({ weapon }, registry, { pair: bound });
    const blows = stats.weapon.blows;
    const last = blows[blows.length - 1].power;
    const even = (0.5 * last) / blows.reduce((a, s) => a + s.power, 0);
    const dps = (lastElement: ManaType, power: Partial<ManaMap>, twin: number) =>
      estimateCombat(
        {
          ...stats,
          weapon: {
            ...stats.weapon,
            blows: blows.map((b, i) => ({
              ...b,
              attunePower: 1,
              element: i === blows.length - 1 ? lastElement : 'fire',
            })),
          },
          elementPower: { ...stats.elementPower, fire: 0, storm: 0, ...power },
          legendaries: { twin_fang: twin },
        },
        registry,
        3,
        defaultChains(registry, 'nature', 'sword'),
      ).dps;
    const discharge = (twin: number) => dps('storm', { storm: 0.5 }, twin);
    const solo = (twin: number) => dps('fire', { fire: even }, twin);
    expect(discharge(0)).toBeCloseTo(solo(0), 6);
    expect(discharge(100) / solo(100)).toBeGreaterThan(1.01);
  });

  it('rises with primary attunement, and with secondary attunement only once bound', () => {
    const power = (pair: ManaPair, ring?: GearItem) =>
      heroPower(ring ? { weapon, ring } : { weapon }, registry, 3, pair);
    expect(power(solo, item('fire'))).toBeGreaterThan(power(solo));
    expect(power(solo, item('storm'))).toBe(power(solo)); // unbound: no attunement, no gain
    expect(power(bound, item('storm'))).toBeGreaterThan(power(bound));
    expect(compareItem({ weapon }, item('storm'), registry, 3, solo).attunementDelta).toEqual({});
    expect(compareItem({ weapon }, item('storm'), registry, 3, bound).attunementDelta).toEqual({
      storm: 1,
    });
  });
});

describe('saves through version 6', () => {
  /** A version 3 save of `p`: its builds (`OLD_BUILDS`), no pair, no Mana Dust. */
  function v3Of(p: DelveProfile) {
    const { pair: _pair, manaDust: _dust, ...rest } = asV4(p);
    return { ...rest, version: 3 };
  }
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));

  it('default chains are all one element, the Ward included', () => {
    const c = defaultChains(registry, 'storm', 'sword');
    const elements = [
      ...c.basic.map((b) => b.element),
      ...ABILITY_SLOTS.flatMap((s) => c[s].moves.flatMap((m) => m.elements)),
    ];
    expect(new Set(elements)).toEqual(new Set(['storm']));
    expect(c.defensive.moves.map((m) => m.form)).toEqual(['ward']);
  });

  it('a new profile is version 6 with no pair yet, no Mana Dust and no Links, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({
      version: 6,
      pair: { primary: null, secondary: null },
      manaDust: 0,
      links: 0,
    });
    expect(parseDelveProfile(registry, json(p))).toEqual({
      profile: p,
      fixed: [],
      dropped: [],
      movesetReset: false,
    });
  });

  it('refuses a secondary without a primary, or equal to it', () => {
    const p = createDelveProfile(registry, 3);
    const bad = (pair: object) => parseDelveProfile(registry, json({ ...p, pair }));
    expect(bad({ primary: null, secondary: 'fire' })).toBeNull();
    expect(bad({ primary: 'fire', secondary: 'fire' })).toBeNull();
  });

  it("migrates version 3: the most attunement is the primary, and each chain's moves are fixed to it", () => {
    const p = createDelveProfile(registry, 3); // an earth cuirass (1)
    // An epic sword (fire 2) carries all four chains; a legendary storm ring (3) outweighs it.
    const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
    const ring = { ...item('storm'), rarity: 'legendary' as const };
    const old = {
      ...v3Of(p),
      equipped: { ...p.equipped, weapon, ring },
      abilities: { ...OLD_BUILDS, defensive: { ...OLD_BUILDS.defensive, elements: ['frost'] } },
    };
    const res = parseDelveProfile(registry, json(old))!;
    expect(res.profile).toMatchObject({
      version: 6,
      pair: { primary: 'storm', secondary: null },
      manaDust: 0,
    });
    expect(chainsOf(res.profile).primary!.moves.map((m) => m.elements)).toEqual([
      ['storm'],
      ['storm'],
      ['storm'],
      ['storm'],
    ]);
    // The Bolt's default chain has four moves: a fix each.
    expect(res.fixed.map((f) => [f.skill, f.index, f.removed])).toEqual([
      ['primary', 0, ['fire']],
      ['primary', 1, ['fire']],
      ['primary', 2, ['fire']],
      ['primary', 3, ['fire']],
      ['defensive', 0, ['frost']],
      ['ultimate', 0, ['fire']],
    ]);
  });

  it('ties go to the weapon, then MANA_TYPES order; nothing equipped leaves the choice open', () => {
    const p = createDelveProfile(registry, 3);
    expect(parseDelveProfile(registry, json(v3Of(p)))!.profile.pair.primary).toBe('fire');
    // A nature weapon (1) ties the earth cuirass (1) and wins, though earth comes first.
    const late = { ...v3Of(p), equipped: { ...p.equipped, weapon: item('nature', 'weapon') } };
    expect(parseDelveProfile(registry, json(late))!.profile.pair.primary).toBe('nature');
    const { weapon: _weapon, ...noWeapon } = p.equipped;
    const tie = { ...v3Of(p), equipped: { ...noWeapon, ring: item('nature') } }; // earth 1, nature 1
    expect(parseDelveProfile(registry, json(tie))!.profile.pair.primary).toBe('earth');
    const bare = parseDelveProfile(registry, json({ ...v3Of(p), equipped: {} }))!;
    expect(bare.profile.pair.primary).toBeNull();
    expect(bare.fixed).toEqual([]);
  });

  it("migrates version 2 through versions 3 and 4: its new primary's default chains, nothing to fix; a dive stays", () => {
    const p = startDive(registry, createDelveProfile(registry, 3), 1);
    // A legendary storm ring (3) beats the epic fire sword's 2; the sword carries all four chains.
    const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
    const ring = { ...item('storm'), rarity: 'legendary' as const };
    const { abilities: _abilities, ...v2 } = v3Of({
      ...p,
      equipped: { ...p.equipped, weapon, ring },
    });
    const res = parseDelveProfile(
      registry,
      json({ ...v2, version: 2, skillSlots: [null, null, null] }),
    )!;
    expect(res.profile).toMatchObject({ version: 6, pair: { primary: 'storm', secondary: null } });
    expect(chainsOf(res.profile)).toEqual(defaultChains(registry, 'storm', 'sword'));
    expect(res.fixed).toEqual([]);
    expect(res.profile.dive).toEqual(p.dive);
  });

  it("fixChainsToPair keeps the weapon's in-pair elements, gives an emptied move or a blow the primary, a fix each", () => {
    const chains: Chains = {
      basic: [
        { kind: 'light', element: 'fire' },
        { kind: 'heavy', element: 'frost' },
      ],
      primary: {
        moves: [
          { kind: 'medium', form: 'lance', elements: ['storm', 'frost'] },
          { kind: 'hold', form: 'lance', elements: ['fire'] },
        ],
        payment: 'cast',
      },
      defensive: {
        moves: [{ kind: 'light', form: 'ward', elements: ['nature'] }],
        payment: 'charge',
      },
      ultimate: {
        moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }],
        payment: 'charge',
      },
    };
    const p: DelveProfile = {
      ...withChains(createDelveProfile(registry, 3), chains),
      pair: { primary: 'fire', secondary: 'storm' },
    };
    const res = fixChainsToPair(registry, p);
    const fixed = chainsOf(res.profile) as Chains;
    expect(fixed.basic).toEqual([chains.basic[0], { kind: 'heavy', element: 'fire' }]);
    expect(fixed.primary.moves).toEqual([
      { kind: 'medium', form: 'lance', elements: ['storm'] },
      chains.primary.moves[1],
    ]);
    expect(fixed.defensive.moves).toEqual([{ kind: 'light', form: 'ward', elements: ['fire'] }]);
    expect(fixed.ultimate).toEqual(chains.ultimate);
    expect(res.fixed).toEqual([
      { skill: 'basic', index: 1, removed: ['frost'], move: fixed.basic[1] },
      { skill: 'primary', index: 0, removed: ['frost'], move: fixed.primary.moves[0] },
      { skill: 'defensive', index: 0, removed: ['nature'], move: fixed.defensive.moves[0] },
    ]);
    expect(fixChainsToPair(registry, res.profile)).toEqual({ profile: res.profile, fixed: [] });
    // Unarmed, nothing is stored to fit.
    const bare = { ...p, equipped: {} };
    expect(fixChainsToPair(registry, bare)).toEqual({ profile: bare, fixed: [] });
  });
});

describe('the pair ops', () => {
  const fresh = () => createDelveProfile(registry, 3);
  /** A fire hero (sword and cuirass: fire 2) with storm bound. */
  const bound = (manaDust = 0, scrap = 0): DelveProfile => ({
    ...createDelveProfile(registry, 3, { primary: 'fire' }),
    pair: { primary: 'fire', secondary: 'storm' },
    manaDust,
    scrap,
  });

  it("chooseStartingMana: the primary, equipped gear re-attuned with its lines, the weapon's moveset rebuilt; once", () => {
    const p0 = fresh();
    const ring = item('earth', 'ring', [
      ['earthAttune', 2],
      ['stormAttune', 1],
      ['earthPower', 5],
    ]);
    const spare = item('earth', 'amulet');
    const res = chooseStartingMana(
      registry,
      { ...p0, equipped: { ...p0.equipped, ring }, bag: [spare] },
      'storm',
    );
    expect(res.ok).toBe(true);
    expect(res.profile.pair).toEqual({ primary: 'storm', secondary: null });
    expect(GEAR_SLOTS.flatMap((s) => res.profile.equipped[s]?.mana ?? [])).toEqual([
      'storm',
      'storm',
      'storm',
    ]);
    // Old-element lines convert; a new-element line already there swaps with them.
    expect(res.profile.equipped.ring!.affixes.map((l) => [l.stat, l.value])).toEqual([
      ['stormAttune', 2],
      ['earthAttune', 1],
      ['stormPower', 5],
    ]);
    expect(res.profile.bag).toEqual([spare]);
    const sword = res.profile.equipped.weapon!;
    expect(sword.moveset).toEqual(defaultMoveset(registry, sword, 'storm'));
    // A weapon with extra slots starts over at its base slots too.
    const roomy = withChains(p0, { primary: defaultChains(registry, 'fire', 'sword').primary });
    expect(roomy.equipped.weapon!.moveset!.slots.primary).toBe(4);
    const rebuilt = chooseStartingMana(registry, roomy, 'frost').profile.equipped.weapon!;
    expect(rebuilt.moveset).toEqual(defaultMoveset(registry, rebuilt, 'frost'));
    expect(chooseStartingMana(registry, res.profile, 'fire')).toMatchObject({
      ok: false,
      reason: 'Your mana is already chosen',
    });
    expect(createDelveProfile(registry, 3, { primary: 'storm' })).toEqual(
      chooseStartingMana(registry, fresh(), 'storm').profile,
    );
  });

  it('bindSecondary: free, once, never the primary, never mid-dive', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(bindSecondary(registry, p, 'fire').ok).toBe(false);
    expect(bindSecondary(registry, fresh(), 'storm').ok).toBe(false);
    expect(bindSecondary(registry, startDive(registry, p, 1), 'storm').reason).toBe(
      'Bind a second element between dives',
    );
    const res = bindSecondary(registry, p, 'storm');
    expect(res.profile.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(res.profile.scrap).toBe(p.scrap);
    // Every move keeps its elements.
    expect(res.profile.equipped).toEqual(p.equipped);
    expect(bindSecondary(registry, res.profile, 'nature').ok).toBe(false);
  });

  it("realign: charges Mana Dust and scrap, keeps the gear, fixes the equipped weapon's moves; refuses what it must", () => {
    const { realignDust, realignScrap } = bal.pair;
    const rich = bound(realignDust, realignScrap);
    const primary = chainsOf(rich).primary!;
    const fused = primary.moves.map((m) => ({ ...m, elements: ['fire', 'storm'] as ManaType[] }));
    const spare: GearItem = {
      ...withChains(rich, { primary: { ...primary, moves: fused } }).equipped.weapon!,
      uid: 'spare',
    };
    const stormy: DelveProfile = {
      ...withChains(rich, { primary: { ...primary, moves: fused } }),
      bag: [spare],
    };
    const res = realign(registry, stormy, { secondary: 'nature' });
    expect(res.ok).toBe(true);
    expect(res.profile).toMatchObject({
      pair: { primary: 'fire', secondary: 'nature' },
      manaDust: 0,
      scrap: 0,
    });
    const { weapon, ...rest } = res.profile.equipped;
    const { weapon: was, ...wasRest } = stormy.equipped;
    expect(rest).toEqual(wasRest);
    expect({ ...weapon, moveset: null }).toEqual({ ...was, moveset: null });
    // A bag weapon keeps its moves.
    expect(res.profile.bag).toEqual([spare]);
    // Storm's role (the secondary) goes to Nature: the fused moves stay fused.
    const moves = chainsOf(res.profile).primary!.moves;
    expect(moves.map((m) => m.elements)).toEqual(moves.map(() => ['fire', 'nature']));
    expect(res.fixed).toEqual(
      moves.map((move, index) => ({ skill: 'primary', index, removed: ['storm'], move })),
    );
    // A swap: charged the same; the chains (all fire) stay in the pair.
    expect(realign(registry, rich, { primary: 'storm', secondary: 'fire' })).toMatchObject({
      ok: true,
      profile: { pair: { primary: 'storm', secondary: 'fire' }, manaDust: 0, scrap: 0 },
      fixed: [],
    });
    expect(realign(registry, rich, {}).reason).toBe('Nothing to change');
    expect(realign(registry, rich, { primary: 'storm' }).reason).toBe(
      'Pick two different elements',
    );
    const solo = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(realign(registry, solo, { secondary: 'nature' }).reason).toBe(
      'Bind a second element first',
    );
    expect(
      realign(registry, bound(realignDust - 1, realignScrap), { secondary: 'nature' }).reason,
    ).toBe('Not enough Mana Dust');
    expect(
      realign(registry, bound(realignDust, realignScrap - 1), { secondary: 'nature' }).reason,
    ).toBe('Not enough scrap');
    expect(realign(registry, startDive(registry, rich, 1), { secondary: 'nature' }).reason).toBe(
      'Realign between dives',
    );
  });

  it('resolveOvertake: the secondary swaps in above 1.2 × the primary, never at 0 or mid-dive', () => {
    const p = bound();
    const slots = ['helm', 'gloves', 'boots'] as const;
    const wear = (n: number): DelveProfile => ({
      ...p,
      equipped: {
        ...p.equipped,
        ...Object.fromEntries(slots.slice(0, n).map((s) => [s, item('storm', s)])),
      },
    });
    expect(resolveOvertake(registry, wear(2)).swapped).toBe(false); // storm 2, fire 2 × 1.2
    const three = resolveOvertake(registry, wear(3)); // storm 3 > 2.4
    expect(three.swapped).toBe(true);
    expect(three.profile.pair).toEqual({ primary: 'storm', secondary: 'fire' });
    expect(resolveOvertake(registry, { ...p, equipped: {} }).swapped).toBe(false); // both 0
    expect(resolveOvertake(registry, startDive(registry, wear(3), 1)).swapped).toBe(false);
    const edge: DelveProfile = {
      ...p,
      equipped: {
        weapon: item('fire', 'weapon', [['fireAttune', 4]]), // fire 5
        ring: item('storm', 'ring', [['stormAttune', 5]]), // storm 6: equal to 1.2 × 5, not above
      },
    };
    expect(resolveOvertake(registry, edge).swapped).toBe(false);
  });

  it("a replaced element's moves and blows take its role's new element; an overtake replaces none", () => {
    const { realignDust, realignScrap } = bal.pair;
    const rich = bound(realignDust, realignScrap);
    const chains = chainsOf(rich) as Pick<Chains, 'basic' | 'primary'>;
    const fused = chains.primary.moves.map((m) => ({
      ...m,
      elements: ['fire', 'storm'] as ManaType[],
    }));
    const basic = chains.basic.map((b, i, all) => ({
      ...b,
      element: (i === all.length - 1 ? 'storm' : 'fire') as ManaType,
    }));
    const p = withChains(rich, { basic, primary: { ...chains.primary, moves: fused } });
    const kinds = (els: ManaType[]) => els.join('+');
    const after = (next: { primary?: ManaType; secondary?: ManaType }) =>
      chainsOf(realign(registry, p, next).profile) as Pick<Chains, 'basic' | 'primary'>;
    // The secondary goes from Storm to Nature: Storm's moves and blows take Nature.
    const nature = after({ secondary: 'nature' });
    expect(nature.primary.moves.map((m) => kinds(m.elements))).toEqual(
      fused.map(() => 'fire+nature'),
    );
    expect(nature.basic.map((b) => b.element)).toEqual(
      basic.map((b) => (b.element === 'storm' ? 'nature' : 'fire')),
    );
    // The primary goes from Fire to Frost: Fire's take Frost.
    const frost = after({ primary: 'frost' });
    expect(frost.primary.moves.map((m) => kinds(m.elements))).toEqual(
      fused.map(() => 'frost+storm'),
    );
    expect(frost.basic.map((b) => b.element)).toEqual(
      basic.map((b) => (b.element === 'storm' ? 'storm' : 'frost')),
    );
    // An overtake swaps the two: nothing left the pair, so nothing changes.
    const over: DelveProfile = { ...p, pair: { primary: 'storm', secondary: 'fire' } };
    expect(fixChainsToPair(registry, over, p.pair)).toEqual({ profile: over, fixed: [] });
  });

  it('once an element leaves the pair, every element of every move and blow takes its old role', () => {
    const was: ManaPair = { primary: 'fire', secondary: 'storm' };
    const hero = createDelveProfile(registry, 3, { primary: 'fire' });
    const basic: Blow[] = [
      { kind: 'light', element: 'fire' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'storm' },
    ];
    const moves: Move[] = [
      { kind: 'light', form: 'bolt', elements: ['fire', 'storm'] },
      { kind: 'medium', form: 'bolt', elements: ['storm'] },
      { kind: 'heavy', form: 'bolt', elements: ['fire'] },
    ];
    const p: DelveProfile = {
      ...withChains(hero, { basic, primary: { moves, payment: 'mana' } }),
      pair: was,
    };
    const to = (primary: ManaType, secondary: ManaType) =>
      fixChainsToPair(registry, { ...p, pair: { primary, secondary } }, was);
    type Fixed = ReturnType<typeof to>;
    const elements = ({ profile }: Fixed) => ({
      basic: chainsOf(profile).basic!.map((b) => b.element),
      primary: chainsOf(profile).primary!.moves.map((m) => m.elements),
    });
    /** Each move or blow reported: where it is, what it dropped, what it uses now. */
    const reported = ({ fixed }: Fixed) =>
      fixed.map((f) => [
        f.skill,
        f.index,
        f.removed,
        'element' in f.move ? [f.move.element] : f.move.elements,
      ]);

    // Fire+Storm → Storm+Nature: Fire's role goes to Storm, Storm's to Nature.
    const sn = to('storm', 'nature');
    expect(elements(sn)).toEqual({
      basic: ['storm', 'storm', 'nature'],
      primary: [['storm', 'nature'], ['nature'], ['storm']],
    });
    expect(reported(sn)).toEqual([
      ['basic', 0, ['fire'], ['storm']],
      ['basic', 1, ['fire'], ['storm']],
      ['basic', 2, ['storm'], ['nature']],
      ['primary', 0, ['fire'], ['storm', 'nature']],
      ['primary', 1, ['storm'], ['nature']],
      ['primary', 2, ['fire'], ['storm']],
    ]);
    // Fire+Storm → Frost+Fire: Fire's role goes to Frost, Storm's to Fire.
    const ff = to('frost', 'fire');
    expect(elements(ff)).toEqual({
      basic: ['frost', 'frost', 'fire'],
      primary: [['frost', 'fire'], ['fire'], ['frost']],
    });
    expect(reported(ff)).toEqual([
      ['basic', 0, ['fire'], ['frost']],
      ['basic', 1, ['fire'], ['frost']],
      ['basic', 2, ['storm'], ['fire']],
      ['primary', 0, ['storm'], ['frost', 'fire']],
      ['primary', 1, ['storm'], ['fire']],
      ['primary', 2, ['fire'], ['frost']],
    ]);
    // Fire+Storm → Fire+Frost: only Storm's moves and blows change.
    const fr = to('fire', 'frost');
    expect(elements(fr)).toEqual({
      basic: ['fire', 'fire', 'frost'],
      primary: [['fire', 'frost'], ['frost'], ['fire']],
    });
    expect(reported(fr)).toEqual([
      ['basic', 2, ['storm'], ['frost']],
      ['primary', 0, ['storm'], ['fire', 'frost']],
      ['primary', 1, ['storm'], ['frost']],
    ]);
    // A swap replaces nothing: nothing changes.
    const swap: DelveProfile = { ...p, pair: { primary: 'storm', secondary: 'fire' } };
    expect(fixChainsToPair(registry, swap, was)).toEqual({ profile: swap, fixed: [] });
  });

  it("overtakeProgress: the secondary's attunement against the margin × the primary's, as resolveOvertake reads it", () => {
    const p = bound(); // fire 2, storm 0
    const need = bal.pair.overtakeMargin * 2;
    expect(overtakeProgress(registry, p)).toEqual({ have: 0, need, ready: false });
    const storm = { ...p.equipped, helm: item('storm', 'helm'), gloves: item('storm', 'gloves') };
    const three = { ...storm, boots: item('storm', 'boots') };
    expect(overtakeProgress(registry, { ...p, equipped: storm })).toEqual({
      have: 2,
      need,
      ready: false,
    });
    expect(overtakeProgress(registry, { ...p, equipped: three })).toEqual({
      have: 3,
      need,
      ready: true,
    });
    // Above zero counts even against a primary at 0; never both at 0.
    const lone = { ring: item('storm', 'ring') };
    expect(overtakeProgress(registry, { ...p, equipped: lone })).toEqual({
      have: 1,
      need: 0,
      ready: true,
    });
    expect(overtakeProgress(registry, { ...p, equipped: {} }).ready).toBe(false);
    // Unbound: nothing to overtake.
    expect(
      overtakeProgress(registry, { ...p, pair: { primary: 'fire', secondary: null } }),
    ).toEqual({ have: 0, need: 0, ready: false });
  });

  it("reattuneCost: the item's rarity's Mana Dust", () => {
    for (const rarity of ['common', 'rare', 'legendary'] as const)
      expect(reattuneCost(registry, item('storm', 'helm', [], rarity))).toBe(
        bal.pair.reattuneDust[rarity],
      );
  });

  it('reattuneItem: to the pair only, for Mana Dust, converting the old lines', () => {
    const cost = bal.pair.reattuneDust.rare;
    const helm: GearItem = {
      ...item('storm', 'helm', [
        ['stormPower', 8],
        ['firePower', 3],
      ]),
      uid: 'h',
      rarity: 'rare',
    };
    const p = { ...bound(cost), bag: [helm] };
    const res = reattuneItem(registry, p, 'h', 'fire');
    expect(res.ok).toBe(true);
    expect(res.item!.mana).toBe('fire');
    expect(res.item!.affixes.map((l) => [l.stat, l.value])).toEqual([
      ['firePower', 8],
      ['stormPower', 3],
    ]);
    expect(res.profile.bag).toEqual([res.item]);
    expect(res.profile.manaDust).toBe(0);
    // Equipped gear re-attunes where it is.
    const chest = p.equipped.chest!; // the fire cuirass
    const chestCost = bal.pair.reattuneDust[chest.rarity];
    const worn = reattuneItem(registry, { ...p, manaDust: chestCost }, chest.uid, 'storm');
    expect(worn.ok).toBe(true);
    expect(worn.item!.mana).toBe('storm');
    expect(worn.profile.equipped.chest).toEqual(worn.item);
    expect(worn.profile.bag).toEqual([helm]);
    expect(worn.profile.manaDust).toBe(0);
    expect(reattuneItem(registry, p, 'nope', 'fire').reason).toBe('Item not found');
    expect(reattuneItem(registry, p, 'h', 'nature').reason).toBe(
      'Re-attune to one of your two elements',
    );
    expect(reattuneItem(registry, p, 'h', 'storm').reason).toBe('Already attuned to that element');
    expect(reattuneItem(registry, { ...p, manaDust: cost - 1 }, 'h', 'fire').reason).toBe(
      'Not enough Mana Dust',
    );
    expect(reattuneItem(registry, startDive(registry, p, 1), 'h', 'fire').reason).toBe(
      'Re-attune between dives',
    );
  });
});

describe("nothing re-colours a weapon's moves on its own", () => {
  /** A Fire+Storm sword hero: its sword's moves all Fire. */
  const hero = () =>
    bindSecondary(registry, createDelveProfile(registry, 3, { primary: 'fire' }), 'storm').profile;
  const built: Blow[] = [{ kind: 'heavy', element: 'fire' }];
  const maul: GearItem = { ...gear('storm', 'weapon', 'maul'), uid: 'maul' };
  const stormGear = {
    helm: item('storm', 'helm'),
    gloves: item('storm', 'gloves'),
    boots: item('storm', 'boots'),
  }; // storm 3 > 1.2 × fire 2

  it('followBasic (the Training Grounds): a default chain becomes the new default; a built one keeps its blows, by role once an element leaves', () => {
    const at = (weaponBaseId: string | null, primary: ManaType, secondary: ManaType | null) => ({
      weaponBaseId,
      primary,
      secondary,
    });
    const fireStorm = at('sword', 'fire', 'storm');
    const def = defaultBasic(registry, 'sword', 'fire', 'storm');
    const own: Blow[] = [
      { kind: 'heavy', element: 'storm' },
      { kind: 'light', element: 'fire' },
    ];
    expect(isDefaultBasic(registry, def, fireStorm)).toBe(true);
    expect(isDefaultBasic(registry, own, fireStorm)).toBe(false);
    // A weapon swap.
    const maulFS = at('maul', 'fire', 'storm');
    expect(followBasic(registry, def, fireStorm, maulFS)).toEqual(
      defaultBasic(registry, 'maul', 'fire', 'storm'),
    );
    expect(followBasic(registry, own, fireStorm, maulFS)).toEqual(own);
    // A bind.
    const fire = at('sword', 'fire', null);
    expect(followBasic(registry, defaultBasic(registry, 'sword', 'fire'), fire, fireStorm)).toEqual(
      def,
    );
    expect(followBasic(registry, built, fire, fireStorm)).toEqual(built);
    // A new primary: each blow takes its element's role's new element.
    expect(followBasic(registry, own, fireStorm, at('sword', 'frost', 'storm'))).toEqual([
      { kind: 'heavy', element: 'storm' },
      { kind: 'light', element: 'frost' },
    ]);
    // The secondary gone: its blows take the primary.
    expect(followBasic(registry, own, fireStorm, fire)).toEqual([
      { kind: 'heavy', element: 'fire' },
      { kind: 'light', element: 'fire' },
    ]);
  });

  it("a weapon change: the new weapon's own moves; unarmed, the defaults on the pair", () => {
    const p = { ...hero(), bag: [maul] };
    const sword = chainsOf(p);
    const worn = equipItem(registry, p, 'maul');
    expect(chainsOf(worn)).toEqual(maul.moveset!.chains); // Storm: the maul's own mana
    const bare = unequipSlot(registry, worn, 'weapon');
    expect(chainsOf(bare)).toEqual(defaultMoveset(registry, UNARMED, 'fire').chains);
    expect(chainsOf(equipItem(registry, bare, p.equipped.weapon!.uid))).toEqual(sword);
  });

  it('a bind, an overtake and a re-attune leave every move as it is', () => {
    const solo = createDelveProfile(registry, 3, { primary: 'fire' });
    const bound = bindSecondary(registry, solo, 'storm').profile;
    expect(chainsOf(bound)).toEqual(chainsOf(solo));
    const own = withChains(bound, { basic: built });
    const over = resolveOvertake(registry, { ...own, equipped: { ...own.equipped, ...stormGear } });
    expect(over.swapped).toBe(true);
    expect(chainsOf(over.profile)).toEqual(chainsOf(own));
    // Re-attuning the sword to Storm changes its mana, not its moves.
    const sword = over.profile.equipped.weapon!;
    const cost = bal.pair.reattuneDust[sword.rarity];
    const re = reattuneItem(registry, { ...over.profile, manaDust: cost }, sword.uid, 'storm');
    expect(re.item!.mana).toBe('storm');
    expect(chainsOf(re.profile)).toEqual(chainsOf(own));
  });

  it("a realign maps the equipped weapon's every move by role, its default basic chain too, a notice each", () => {
    const { realignDust, realignScrap } = bal.pair;
    const p = { ...hero(), manaDust: realignDust, scrap: realignScrap };
    // Fire's role (the primary) goes to Storm.
    const res = realign(registry, p, { primary: 'storm', secondary: 'nature' });
    expect(chainsOf(res.profile).basic).toEqual(defaultBasic(registry, 'sword', 'storm'));
    expect(res.fixed!.filter((f) => f.skill === 'basic').map((f) => [f.index, f.removed])).toEqual([
      [0, ['fire']],
      [1, ['fire']],
      [2, ['fire']],
    ]);
    const swap = realign(registry, p, { primary: 'storm', secondary: 'fire' });
    expect(chainsOf(swap.profile)).toEqual(chainsOf(p));
    expect(swap.fixed).toEqual([]);
  });

  it('an off-pair move still strikes and reacts in its element, but draws no attunement power', () => {
    const k = bal.pair.basicPowerPerAttune;
    // A Fire hero whose sword's last blow is Frost (as a Frost drop's would be), wearing Frost.
    const p0 = createDelveProfile(registry, 3, { primary: 'fire' }); // fire 2
    const basic: Blow[] = [
      { kind: 'light', element: 'fire' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'frost' },
    ];
    const p = withChains(p0, { basic });
    const worn = {
      ...p,
      equipped: { ...p.equipped, ring: item('frost', 'ring', [['frostAttune', 5]]) },
    };
    const blows = profileStats(registry, worn).weapon.blows;
    expect(blows.map((b) => b.element)).toEqual(['fire', 'fire', 'frost']);
    expect(blows[0].attunePower).toBeCloseTo(1 + 2 * k);
    expect(blows[2].attunePower).toBe(1);
    const w = strikeWorld(worn.equipped, { pair: worn.pair, filterAttunement: true, basic }, true);
    expect(only(firstBlow(w), 'hit').map((h) => h.element)).toEqual(['frost']);
    expect(w.monsters[0].status.stacks.frost).toBeGreaterThan(0);
  });
});

describe("Power values the hero's own chains", () => {
  /** A Fire+Storm sword hero: its sword's moves all Fire. */
  const hero = () =>
    bindSecondary(registry, createDelveProfile(registry, 3, { primary: 'fire' }), 'storm').profile;
  /** A ring powering `el`, of an element outside the pair (so no attunement). */
  const ring = (el: 'fire' | 'storm'): GearItem => ({
    ...item('earth', 'ring', [[`${el}Power` as HeroStatKey, 50]]),
    uid: el,
  });

  it("Power, Equip best and salvage go by the weapon's chains", () => {
    const h = hero();
    const { basic, primary } = defaultChains(registry, 'storm', 'sword');
    const stormy = withChains(h, { basic, primary });
    const wearing = (p: DelveProfile, r: GearItem): DelveProfile => ({
      ...p,
      equipped: { ...p.equipped, ring: r },
    });
    const power = (p: DelveProfile, r: GearItem) => profilePower(registry, wearing(p, r));
    expect(power(stormy, ring('storm'))).toBeGreaterThan(power(stormy, ring('fire')));
    expect(power(h, ring('fire'))).toBeGreaterThan(power(h, ring('storm')));
    const best = equipBest(registry, { ...stormy, bag: [ring('fire'), ring('storm')] });
    expect(best.equipped.map((i) => i.uid)).toEqual(['storm']);
    const withFire = { ...wearing(stormy, ring('fire')), bag: [ring('storm')] };
    expect(salvageCandidates(registry, withFire, 'common')).toEqual([]);
    const withStorm = { ...wearing(stormy, ring('storm')), bag: [ring('fire')] };
    expect(salvageCandidates(registry, withStorm, 'common')).toEqual(['fire']);
  });

  it('compareItem values a weapon with its own moveset', () => {
    const maul: GearItem = { ...gear('fire', 'weapon', 'maul'), uid: 'maul' };
    const built = setChain(registry, hero(), 'basic', [
      { kind: 'light', element: 'storm' },
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'fire' },
    ]).profile;
    for (const q of [hero(), built]) {
      const bagged = { ...q, bag: [maul] };
      const cmp = compareItem(q.equipped, maul, registry, 1, q.pair);
      expect(cmp.power).toBe(profilePower(registry, bagged));
      expect(cmp.newPower).toBe(profilePower(registry, equipItem(registry, bagged, 'maul')));
    }
    // The maul fights with its own blows whatever the sword held.
    expect(compareItem(built.equipped, maul, registry, 1, built.pair).newPower).toBe(
      compareItem(hero().equipped, maul, registry, 1, built.pair).newPower,
    );
  });
});

describe('real stats read the pair', () => {
  it('setChain refuses elements outside the pair (anything goes before the choice)', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const plague: Chain = {
      moves: [{ kind: 'medium', form: 'bolt', elements: ['fire', 'nature'] }],
      payment: 'mana',
    };
    expect(setChain(registry, p, 'primary', plague).reason).toBe('Pick from your two elements');
    expect(setChain(registry, p, 'basic', [{ kind: 'light', element: 'nature' }]).reason).toBe(
      'Pick from your two elements',
    );
    const withNature = bindSecondary(registry, p, 'nature').profile;
    const set = (q: DelveProfile) => chainsOf(setChain(registry, q, 'primary', plague).profile);
    expect(set(withNature).primary).toEqual(plague);
    expect(set(createDelveProfile(registry, 3)).primary).toEqual(plague);
  });

  it('Power, Equip best, salvage, the floor and max life ignore attunement outside the pair', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    // No stats, only earth 10 (1 + 9): unfiltered, that's the earth mastery (×1.2 max life).
    const ring = item('earth', 'ring', [['earthAttune', 9]]);
    const worn = { ...p, equipped: { ...p.equipped, ring } };
    expect(profilePower(registry, worn)).toBe(profilePower(registry, p));
    expect(equipBest(registry, { ...p, bag: [ring] }).equipped).toEqual([]);
    expect(salvageCandidates(registry, { ...p, bag: [ring] }, 'common')).toEqual([ring.uid]);
    const floor = beginFloor(registry, startDive(registry, worn, 1));
    expect(floor.hero.stats.attunement.earth).toBe(0);
    expect(heroMaxHp(registry, worn)).toBe(profileStats(registry, worn).maxHp);
    expect(heroMaxHp(registry, worn)).toBeLessThan(computeHeroStats(worn.equipped, registry).maxHp);
  });
});

describe('basic attacks with a pair', () => {
  const sword = { weapon: gear('fire') }; // reach 1.9
  const staff = { weapon: gear('fire', 'weapon', 'staff') };
  const FIRE_STORM: HeroStatsExtra = { pair: { primary: 'fire', secondary: 'storm' } };
  const k = bal.pair.basicPowerPerAttune;

  it('on the default chain, blows strike with the primary, the last with the secondary, always applying its status', () => {
    const blow = firstBlow(strikeWorld(sword, FIRE_STORM));
    expect(only(blow, 'basic')[0]).toMatchObject({ element: 'fire', moveKind: 'light' });
    expect(only(blow, 'hit').map((h) => h.element)).toEqual(['fire']);
    const w = strikeWorld(sword, FIRE_STORM, true);
    const fin = firstBlow(w);
    expect(only(fin, 'basic')[0]).toMatchObject({ element: 'storm', moveKind: 'heavy' });
    expect(only(fin, 'hit').map((h) => h.element)).toEqual(['storm']);
    // No 30% roll: every last blow shocks (fresh rolls each time), and none burns.
    for (let seed = 0; seed < 12; seed++) {
      const f = strikeWorld(sword, FIRE_STORM, true);
      f.rng = new SeededRNG(seed);
      firstBlow(f);
      expect(f.monsters[0].status.stacks.storm).toBeGreaterThan(0);
      expect(f.monsters[0].status.stacks.fire).toBe(0);
    }
  });

  it('fire blows, then a storm finisher on a burning foe: Overload', () => {
    const w = strikeWorld(sword, FIRE_STORM, true);
    const s = w.monsters[0].status;
    s.stacks.fire = 1;
    s.stackUntil.fire = 1e9;
    expect(only(firstBlow(w), 'reaction').map((e) => e.reaction)).toContain('overload');
  });

  it("Twin Fang's extra hit follows the last blow's element", () => {
    const w = strikeWorld(sword, { ...FIRE_STORM, legendaries: { twin_fang: 100 } }, true);
    const hits = only(firstBlow(w), 'hit').filter((h) => h.source === 'basic');
    expect(hits.map((h) => h.element)).toEqual(['storm', 'storm']);
  });

  it("a ranged last blow's shot carries the secondary, and its great-orb burst no infusion", () => {
    const w = strikeWorld(staff, FIRE_STORM, true, dummy(13, 30));
    const events = firstBlow(w);
    expect(only(events, 'basic')[0]).toMatchObject({ element: 'storm', moveKind: 'heavy' });
    w.hero.nextAttackAt = 1e9; // just this shot
    events.push(...run(w, 1));
    const bursts = only(events, 'explode');
    expect(bursts.length).toBeGreaterThan(0);
    for (const e of bursts) expect(e).toMatchObject({ element: 'storm', infusion: null });
    const hits = only(events, 'hit').filter((h) => h.source === 'basic');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.element).toBe('storm');
  });

  it('unarmed punches with the primary; without a secondary the last blow stays the primary', () => {
    const punch = firstBlow(strikeWorld({}, { pair: { primary: 'frost', secondary: null } }));
    expect(only(punch, 'hit')[0].element).toBe('frost');
    const solo = strikeWorld(sword, { pair: { primary: 'fire', secondary: null } }, true);
    expect(only(firstBlow(solo), 'basic')[0]).toMatchObject({ element: 'fire', moveKind: 'heavy' });
  });

  it('attunement powers each blow by its element: the primary, then the secondary last', () => {
    const amount = (extra: HeroStatsExtra, finisher: boolean) =>
      only(firstBlow(strikeWorld(sword, extra, finisher)), 'hit')[0].amount;
    const blow = amount(FIRE_STORM, false); // the sword's own fire 1
    expect(amount({ ...FIRE_STORM, attunement: { fire: 5 } }, false) / blow).toBeCloseTo(
      (1 + 6 * k) / (1 + k),
    );
    expect(amount({ ...FIRE_STORM, attunement: { storm: 5 } }, false)).toBe(blow);
    const finisher = amount(FIRE_STORM, true); // storm 0
    expect(amount({ ...FIRE_STORM, attunement: { storm: 5 } }, true) / finisher).toBeCloseTo(
      1 + 5 * k,
    );
  });
});

describe('drops lean toward the pair', () => {
  // Elite drops at depth 5 in a fire biome, seeds 0–7, recorded before the pair existed.
  const GOLDEN = [
    'fire:common:helm,frost:common:wand',
    'fire:common:ring,fire:common:helm',
    'frost:uncommon:bow,fire:rare:gauntlets,fire:magic:greaves',
    'fire:uncommon:amulet,storm:common:gauntlets',
    'fire:common:helm,shadow:magic:axe',
    'fire:common:ring,fire:uncommon:amulet',
    'frost:magic:cuirass,fire:common:gauntlets,earth:magic:helm',
    'earth:rare:gauntlets,storm:magic:greaves',
  ];

  it('with an empty pair, the seeded drop streams are unchanged', () => {
    const ctx = {
      depth: 5,
      kind: 'elite' as const,
      magicFind: 0,
      pity: 0,
      dropMult: 1,
      legendaryBoost: 1,
      forceLegendary: false,
      nextUid: 1,
      biomeMana: 'fire' as const,
      pair: [],
    };
    const got = GOLDEN.map((_, s) =>
      rollEncounterDrops(registry, ctx, new SeededRNG(s))
        .items.map((i) => `${i.mana}:${i.rarity}:${i.baseId}`)
        .join(','),
    );
    expect(got).toEqual(GOLDEN);
  });

  it.each([
    ['frost', 0],
    ['fire', 1],
  ] as const)(
    'with a pair in a %s biome, the in-pair rate matches the formula',
    (biome, inside) => {
      const pair: ManaType[] = ['fire', 'storm'];
      const { dropBias } = bal.pair;
      const bias = bal.loot.biomeManaBias;
      const expected = dropBias + (1 - dropBias) * (bias * inside + ((1 - bias) * pair.length) / 6);
      // The primary's share: primaryShare of the pair's drops, plus its biome and uniform rolls.
      const { primaryShare } = bal.pair;
      const expectedPrimary =
        dropBias * primaryShare + (1 - dropBias) * (bias * inside + (1 - bias) / 6);
      const N = 4000;
      let hits = 0;
      let primaryHits = 0;
      for (let i = 0; i < N; i++) {
        const opts = { uid: 'p', ilvl: 3, rarity: 'common' as const, biomeMana: biome, pair };
        const mana = generateItem(registry, opts, new SeededRNG(i)).mana;
        if (pair.includes(mana)) hits++;
        if (mana === pair[0]) primaryHits++;
      }
      expect(Math.abs(hits / N - expected)).toBeLessThan(0.03);
      expect(Math.abs(primaryHits / N - expectedPrimary)).toBeLessThan(0.03);
    },
  );

  it("the floor's loot context carries the pair, primary first", () => {
    const p = bindSecondary(
      registry,
      createDelveProfile(registry, 3, { primary: 'frost' }),
      'nature',
    ).profile;
    expect(beginFloor(registry, startDive(registry, p, 1)).loot.pair).toEqual(['frost', 'nature']);
    expect(
      beginFloor(registry, startDive(registry, createDelveProfile(registry, 3), 1)).loot.pair,
    ).toEqual([]);
  });
});

describe('Mana Dust from salvage', () => {
  const dust = bal.pair.salvageDust;
  const magic = (mana: ManaType, uid: string): GearItem => ({
    ...item(mana, 'helm'),
    uid,
    rarity: 'magic',
  });
  const fire = () => createDelveProfile(registry, 3, { primary: 'fire' });

  it('salvageDust: gear outside the pair only, and none before the choice', () => {
    expect(salvageDust(registry, magic('frost', 'a'), { primary: 'fire', secondary: null })).toBe(
      dust.magic,
    );
    expect(salvageDust(registry, magic('fire', 'a'), { primary: 'fire', secondary: null })).toBe(0);
    expect(salvageDust(registry, magic('frost', 'a'), { primary: null, secondary: null })).toBe(0);
  });

  it('salvageItems adds it', () => {
    const p = { ...fire(), bag: [magic('frost', 'a'), magic('fire', 'b')] };
    const res = salvageItems(registry, p, ['a', 'b']);
    expect(res.dust).toBe(dust.magic);
    expect(res.profile.manaDust).toBe(dust.magic);
  });

  it('auto-salvage and a full bag add it, and banking reports it', () => {
    const p = startDive(registry, setAutoSalvage(fire(), 'magic', true), 1);
    const w = beginFloor(registry, p);
    w.pending.items = [magic('frost', 'a'), magic('fire', 'b')];
    const res = bankWorld(registry, p, w);
    expect(res.dust).toBe(dust.magic);
    expect(res.profile.manaDust).toBe(dust.magic);
    expect(res.profile.dive!.dustEarned).toBe(dust.magic);

    const bag = Array.from({ length: bal.loot.bagSize }, (_, i) => magic('fire', `f${i}`));
    const full = { ...startDive(registry, fire(), 1), bag };
    const w2 = beginFloor(registry, full);
    w2.pending.items = [{ ...magic('frost', 'r'), rarity: 'rare' }];
    expect(bankWorld(registry, full, w2)).toMatchObject({ bagFull: true, dust: dust.rare });
  });
});

describe('the autopilot and the pair', () => {
  /** The Primary chain's element sets, one entry per distinct set. */
  const primaryElements = (p: DelveProfile) => [
    ...new Set(chainsOf(p).primary!.moves.map((m) => m.elements.join('+'))),
  ];

  /** Storm gear worse than the starter sword (no damage line): junk, salvaged between dives. */
  const junk = (uid: string): GearItem => ({ ...item('storm', 'weapon'), uid, baseId: 'sword' });

  it('binds the element it owns most before salvaging, and builds its Primary from both', () => {
    const p = {
      ...createDelveProfile(registry, 5, { primary: 'fire' }),
      bag: [junk('j1'), junk('j2')],
    };
    const after = betweenDives(registry, p);
    expect(after.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(after.bag.map((i) => i.uid)).not.toContain('j1'); // melted…
    expect(after.manaDust).toBe(0); // …after the bind: storm was in the pair by then
    expect(primaryElements(after)).toEqual(['fire+storm']);
  });

  it('skips the bind while it owns nothing of another element', () => {
    const after = betweenDives(registry, createDelveProfile(registry, 5, { primary: 'fire' }));
    expect(after.pair.secondary).toBeNull();
  });

  it('binds the element it owns most, whichever it is: every pair reacts', () => {
    const p = {
      ...createDelveProfile(registry, 5, { primary: 'fire' }),
      // earth 2 (Obsidian), frost 1 (Melt)
      bag: [item('earth', 'helm'), item('earth', 'gloves'), item('frost', 'boots')],
    };
    const after = betweenDives(registry, p);
    expect(after.pair).toEqual({ primary: 'fire', secondary: 'earth' });
    expect(primaryElements(after)).toEqual(['fire+earth']);
  });

  it('binds a given secondary before the first dive, and its fused Primary finds their reaction', () => {
    const { profile } = runAutopilot(registry, {
      seed: 1,
      dives: 1,
      primary: 'storm',
      secondary: 'earth',
    });
    expect([profile.pair.primary, profile.pair.secondary].sort()).toEqual(['earth', 'storm']);
    expect(primaryElements(profile).map((e) => e.split('+').sort().join('+'))).toEqual([
      'earth+storm',
    ]);
    expect(profile.reactionsSeen).toContain('lightning_rod');
  });

  it('lets an overtaking secondary swap in, and rebuilds its Primary to match', () => {
    const p0 = createDelveProfile(registry, 5, { primary: 'fire' }); // fire 2
    const p: DelveProfile = {
      ...p0,
      pair: { primary: 'fire', secondary: 'storm' },
      equipped: {
        ...p0.equipped,
        helm: item('storm', 'helm'),
        gloves: item('storm', 'gloves'),
        boots: item('storm', 'boots'),
      }, // storm 3 > 2.4
    };
    const after = betweenDives(registry, p);
    expect(after.pair).toEqual({ primary: 'storm', secondary: 'fire' });
    expect(primaryElements(after)).toEqual(['storm+fire']);
  });

  it('starts from the primary it is given', () => {
    const { profile } = runAutopilot(registry, { seed: 1, dives: 1, primary: 'frost' });
    expect(profile.pair.primary).toBe('frost'); // unaided, seed 1 ends at fire/frost
  });
});
