import { describe, it, expect } from 'vitest';
import { defaultAbilities } from '../src/arpg/abilities/resolve.js';
import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';
import { bankWorld, beginFloor, heroMaxHp, startDive } from '../src/delve/dive.js';
import {
  bindSecondary,
  chooseStartingMana,
  fixBuildsToPair,
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
  parseDelveProfile,
  profilePower,
  salvageCandidates,
  salvageItems,
  setAbility,
  setAutoSalvage,
} from '../src/delve/profile.js';
import type { AbilityBuild, AbilityBuilds } from '../src/types/ability.js';
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
import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';
import type { DelveProfile, HeroWeapon, ManaPair } from '../src/types/delve.js';
import {
  GEAR_SLOTS,
  type EquippedGear,
  type GearItem,
  type GearSlot,
  type HeroStatKey,
  type Rarity,
} from '../src/types/gear.js';
import type { ManaMap, ManaType } from '../src/types/mana.js';
import { STEP, arena, bal, dummy, gear, registry, run } from './fixtures/arena.js';

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

  it('blows strike with the primary and the finisher discharges a bound secondary, stronger with attunement', () => {
    const staff = { weapon: gear('frost', 'weapon', 'staff') }; // frost 1
    const weapon = (extra: HeroStatsExtra) => computeHeroStats(staff, registry, extra).weapon;
    expect(weapon({})).toMatchObject({
      element: 'frost',
      infusion: null,
      blowPower: 1,
      finisherPower: 1,
    });
    expect(weapon({ pair: { primary: 'fire', secondary: null } })).toMatchObject({
      element: 'fire',
      infusion: null,
      blowPower: 1,
      finisherPower: 1,
    });
    const paired = weapon({
      pair: { primary: 'fire', secondary: 'frost' },
      attunement: { fire: 4 },
    });
    expect(paired).toMatchObject({ element: 'fire', infusion: 'frost' });
    expect(paired.blowPower).toBeCloseTo(1 + 4 * k);
    expect(paired.finisherPower).toBeCloseTo(1 + 1 * k); // the frost staff's own 1
    // No secondary: the finisher stays the primary, just as strong.
    const solo = weapon({ pair: { primary: 'frost', secondary: null } });
    expect(solo.blowPower).toBeGreaterThan(1);
    expect(solo.finisherPower).toBe(solo.blowPower);
    // A secondary equal to the primary is unbound.
    expect(weapon({ pair: { primary: 'fire', secondary: 'fire' } }).infusion).toBeNull();
    // Unarmed, you punch with your primary.
    expect(
      computeHeroStats({}, registry, { pair: { primary: 'storm', secondary: 'nature' } }).weapon,
    ).toMatchObject({ baseId: null, element: 'storm', infusion: 'nature' });
    expect(computeHeroStats({}, registry).weapon).toMatchObject({ element: null, infusion: null });
  });
});

describe('Power values the pair', () => {
  const weapon = gear('fire');
  const solo: ManaPair = { primary: 'fire', secondary: null };
  const bound: ManaPair = { primary: 'fire', secondary: 'storm' };

  it('estimateCombat reads blowPower for ordinary blows and finisherPower for the finisher', () => {
    const stats = computeHeroStats({ weapon }, registry, { pair: bound });
    const dps = (w: Partial<HeroWeapon>) =>
      estimateCombat({ ...stats, weapon: { ...stats.weapon, ...w } }, registry, 3).dps;
    const base = dps({});
    expect(dps({ blowPower: stats.weapon.blowPower * 2 })).toBeGreaterThan(base);
    expect(dps({ finisherPower: stats.weapon.finisherPower * 2 })).toBeGreaterThan(base);
  });

  it("the finisher strikes with the secondary's element power", () => {
    const plain = item('fire', 'ring');
    const charged = item('fire', 'ring', [['stormPower', 50]]);
    const dps = (pair: ManaPair, ring: GearItem) =>
      estimateCombat(computeHeroStats({ weapon, ring }, registry, { pair }), registry, 3).dps;
    expect(dps(bound, charged)).toBeGreaterThan(dps(bound, plain));
    expect(dps(solo, charged)).toBe(dps(solo, plain)); // no storm anywhere: no gain
  });

  it("Twin Fang's extra hit is worth the finisher, not the string's average", () => {
    // Two strings worth the same without Twin Fang: one's finisher discharges storm
    // power, the other's blows all carry the fire power that evens them out. Nature
    // abilities (no power either way) keep everything else equal.
    const stats = computeHeroStats({ weapon }, registry, { pair: bound });
    const combo = stats.weapon.combo;
    const last = combo[combo.length - 1].power;
    const even = (0.5 * last) / combo.reduce((a, s) => a + s.power, 0);
    const dps = (infusion: ManaType | null, power: Partial<ManaMap>, twin: number) =>
      estimateCombat(
        {
          ...stats,
          weapon: { ...stats.weapon, infusion, blowPower: 1, finisherPower: 1 },
          elementPower: { ...stats.elementPower, fire: 0, storm: 0, ...power },
          legendaries: { twin_fang: twin },
        },
        registry,
        3,
        defaultAbilities('nature'),
      ).dps;
    const discharge = (twin: number) => dps('storm', { storm: 0.5 }, twin);
    const solo = (twin: number) => dps(null, { fire: even }, twin);
    expect(discharge(0)).toBeCloseTo(solo(0), 6);
    expect(discharge(100) / solo(100)).toBeGreaterThan(1.01);
  });

  it('rises with primary attunement, and with secondary attunement only once bound', () => {
    const power = (pair: ManaPair, ring?: GearItem) =>
      heroPower(ring ? { weapon, ring } : { weapon }, registry, 3, undefined, pair);
    expect(power(solo, item('fire'))).toBeGreaterThan(power(solo));
    expect(power(solo, item('storm'))).toBe(power(solo)); // unbound: no attunement, no gain
    expect(power(bound, item('storm'))).toBeGreaterThan(power(bound));
    expect(
      compareItem({ weapon }, item('storm'), registry, 3, undefined, solo).attunementDelta,
    ).toEqual({});
    expect(
      compareItem({ weapon }, item('storm'), registry, 3, undefined, bound).attunementDelta,
    ).toEqual({ storm: 1 });
  });
});

describe('save version 4', () => {
  /** A version 3 save of `p`: no pair, no Mana Dust. */
  function v3Of(p: DelveProfile) {
    const { pair: _pair, manaDust: _dust, ...rest } = p;
    return { ...rest, version: 3 };
  }
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));

  it('default builds are all one element, the Ward included', () => {
    expect(defaultAbilities('storm')).toEqual({
      primary: { form: 'bolt', elements: ['storm'], weight: 0, payment: 'mana' },
      defensive: { form: 'ward', elements: ['storm'], weight: 0, payment: 'mana' },
      ultimate: { form: 'nova', elements: ['storm'], weight: 0, payment: 'charge' },
    });
  });

  it('a new profile is version 4 with no pair yet and no Mana Dust, and round-trips', () => {
    const p = createDelveProfile(registry, 3);
    expect(p).toMatchObject({ version: 4, pair: { primary: null, secondary: null }, manaDust: 0 });
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p, fixed: [] });
  });

  it('refuses a secondary without a primary, or equal to it', () => {
    const p = createDelveProfile(registry, 3);
    const bad = (pair: object) => parseDelveProfile(registry, json({ ...p, pair }));
    expect(bad({ primary: null, secondary: 'fire' })).toBeNull();
    expect(bad({ primary: 'fire', secondary: 'fire' })).toBeNull();
  });

  it('migrates version 3: the most attunement is the primary, and the builds are fixed to it', () => {
    const p = createDelveProfile(registry, 3); // a fire sword (1), an earth cuirass (1)
    const ring = { ...item('storm'), rarity: 'rare' as const }; // storm 2
    const old = {
      ...v3Of(p),
      equipped: { ...p.equipped, ring },
      abilities: { ...p.abilities, defensive: { ...p.abilities.defensive, elements: ['frost'] } },
    };
    const res = parseDelveProfile(registry, json(old))!;
    expect(res.profile).toMatchObject({
      version: 4,
      pair: { primary: 'storm', secondary: null },
      manaDust: 0,
    });
    expect(res.profile.abilities.primary.elements).toEqual(['storm']);
    expect(res.fixed.map((f) => [f.slot, f.removed])).toEqual([
      ['primary', ['fire']],
      ['defensive', ['frost']],
      ['ultimate', ['fire']],
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

  it("migrates version 2 through version 3: its new primary's default builds, nothing to fix; a dive stays", () => {
    const p = startDive(registry, createDelveProfile(registry, 3), 1);
    const ring = { ...item('storm'), rarity: 'rare' as const }; // storm 2 beats the fire sword's 1
    const { abilities: _abilities, ...v2 } = v3Of({ ...p, equipped: { ...p.equipped, ring } });
    const res = parseDelveProfile(
      registry,
      json({ ...v2, version: 2, skillSlots: [null, null, null] }),
    )!;
    expect(res.profile).toMatchObject({ version: 4, pair: { primary: 'storm', secondary: null } });
    expect(res.profile.abilities).toEqual(defaultAbilities('storm'));
    expect(res.fixed).toEqual([]);
    expect(res.profile.dive).toEqual(p.dive);
  });

  it('fixBuildsToPair keeps in-pair elements and gives an emptied slot the primary', () => {
    const abilities: AbilityBuilds = {
      primary: { form: 'lance', elements: ['storm', 'frost'], weight: 1, payment: 'cast' },
      defensive: { form: 'ward', elements: ['nature'], weight: -1, payment: 'charge' },
      ultimate: { form: 'nova', elements: ['fire'], weight: 0, payment: 'charge' },
    };
    const p: DelveProfile = {
      ...createDelveProfile(registry, 3),
      pair: { primary: 'fire', secondary: 'storm' },
      abilities,
    };
    const res = fixBuildsToPair(p);
    expect(res.profile.abilities.primary).toEqual({ ...abilities.primary, elements: ['storm'] });
    expect(res.profile.abilities.defensive).toEqual({ ...abilities.defensive, elements: ['fire'] });
    expect(res.profile.abilities.ultimate).toBe(abilities.ultimate);
    expect(res.fixed).toEqual([
      { slot: 'primary', removed: ['frost'], build: res.profile.abilities.primary },
      { slot: 'defensive', removed: ['nature'], build: res.profile.abilities.defensive },
    ]);
    expect(fixBuildsToPair(res.profile)).toEqual({ profile: res.profile, fixed: [] });
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

  it('chooseStartingMana: the primary, equipped gear re-attuned with its lines, default builds; once', () => {
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
    expect(res.profile.abilities).toEqual(defaultAbilities('storm'));
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
    expect(bindSecondary(p, 'fire').ok).toBe(false);
    expect(bindSecondary(fresh(), 'storm').ok).toBe(false);
    expect(bindSecondary(startDive(registry, p, 1), 'storm').reason).toBe(
      'Bind a second element between dives',
    );
    const res = bindSecondary(p, 'storm');
    expect(res.profile.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(res.profile.scrap).toBe(p.scrap);
    expect(bindSecondary(res.profile, 'nature').ok).toBe(false);
  });

  it('realign: charges Mana Dust and scrap, keeps the gear, fixes the builds; refuses what it must', () => {
    const { realignDust, realignScrap } = bal.pair;
    const rich = bound(realignDust, realignScrap);
    const stormy: DelveProfile = {
      ...rich,
      abilities: {
        ...rich.abilities,
        primary: { ...rich.abilities.primary, elements: ['fire', 'storm'] },
      },
    };
    const res = realign(registry, stormy, { secondary: 'nature' });
    expect(res.ok).toBe(true);
    expect(res.profile).toMatchObject({
      pair: { primary: 'fire', secondary: 'nature' },
      manaDust: 0,
      scrap: 0,
    });
    expect(res.profile.equipped).toEqual(rich.equipped);
    expect(res.profile.abilities.primary.elements).toEqual(['fire']);
    expect(res.fixed).toEqual([
      { slot: 'primary', removed: ['storm'], build: res.profile.abilities.primary },
    ]);
    // A swap: charged the same; the builds (all fire) stay in the pair.
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

describe('real stats read the pair', () => {
  it('setAbility refuses elements outside the pair (anything goes before the choice)', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    const plague: AbilityBuild = {
      form: 'bolt',
      elements: ['fire', 'nature'],
      weight: 0,
      payment: 'mana',
    };
    expect(() => setAbility(registry, p, 'primary', plague)).toThrow(/two elements/);
    const withNature = bindSecondary(p, 'nature').profile;
    expect(setAbility(registry, withNature, 'primary', plague).abilities.primary.elements).toEqual([
      'fire',
      'nature',
    ]);
    expect(
      setAbility(registry, createDelveProfile(registry, 3), 'primary', plague).abilities.primary
        .elements,
    ).toEqual(['fire', 'nature']);
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

  /** One sturdy foe (in a sword's reach by default), the hero on `extra`; `finisher` starts on the string's last blow. */
  function strikeWorld(
    equipped: EquippedGear,
    extra: HeroStatsExtra,
    finisher = false,
    foe: Partial<MonsterEntity> = dummy(13, 34.5),
  ): ArpgWorld {
    const w = arena([foe], { equipped });
    w.hero.stats = computeHeroStats(equipped, registry, extra);
    if (finisher) {
      w.hero.attackCount = w.hero.stats.weapon.combo.length - 1;
      w.hero.lastBasicAt = 0;
    }
    return w;
  }

  /** Step until the first blow lands (its `basic` event), returning every event. */
  function firstBlow(w: ArpgWorld): ArpgEvent[] {
    const events: ArpgEvent[] = [];
    for (let i = 0; i < 300 && !events.some((e) => e.kind === 'basic'); i++)
      events.push(...run(w, STEP));
    return events;
  }

  it('blows strike with the primary; the finisher with the secondary, always applying its status', () => {
    const blow = firstBlow(strikeWorld(sword, FIRE_STORM));
    expect(only(blow, 'basic')[0]).toMatchObject({ element: 'fire', finisher: false });
    expect(only(blow, 'hit').map((h) => h.element)).toEqual(['fire']);
    const w = strikeWorld(sword, FIRE_STORM, true);
    const fin = firstBlow(w);
    expect(only(fin, 'basic')[0]).toMatchObject({ element: 'storm', finisher: true });
    expect(only(fin, 'hit').map((h) => h.element)).toEqual(['storm']);
    // No 30% roll: every finisher shocks (fresh rolls each time), and none burns.
    for (let seed = 0; seed < 12; seed++) {
      const f = strikeWorld(sword, FIRE_STORM, true);
      f.rng = new SeededRNG(seed);
      firstBlow(f);
      expect(f.monsters[0].status.shockUntil).toBeGreaterThan(f.t);
      expect(f.monsters[0].status.burnUntil).toBe(0);
    }
  });

  it('fire blows, then a storm finisher on a burning foe: Overload', () => {
    const w = strikeWorld(sword, FIRE_STORM, true);
    w.monsters[0].status.burnUntil = 1e9;
    expect(only(firstBlow(w), 'reaction').map((e) => e.reaction)).toContain('overload');
  });

  it("Twin Fang's extra hit follows the finisher's element", () => {
    const w = strikeWorld(sword, { ...FIRE_STORM, legendaries: { twin_fang: 100 } }, true);
    const hits = only(firstBlow(w), 'hit').filter((h) => h.source === 'basic');
    expect(hits.map((h) => h.element)).toEqual(['storm', 'storm']);
  });

  it("a ranged finisher's shot carries the secondary, and its great-orb burst no infusion", () => {
    const w = strikeWorld(staff, FIRE_STORM, true, dummy(13, 30));
    const events = firstBlow(w);
    expect(only(events, 'basic')[0]).toMatchObject({ element: 'storm', finisher: true });
    w.hero.nextAttackAt = 1e9; // just this shot
    events.push(...run(w, 1));
    const bursts = only(events, 'explode');
    expect(bursts.length).toBeGreaterThan(0);
    for (const e of bursts) expect(e).toMatchObject({ element: 'storm', infusion: null });
    const hits = only(events, 'hit').filter((h) => h.source === 'basic');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.element).toBe('storm');
  });

  it('unarmed punches with the primary; without a secondary the finisher stays the primary', () => {
    const punch = firstBlow(strikeWorld({}, { pair: { primary: 'frost', secondary: null } }));
    expect(only(punch, 'hit')[0].element).toBe('frost');
    const solo = strikeWorld(sword, { pair: { primary: 'fire', secondary: null } }, true);
    expect(only(firstBlow(solo), 'basic')[0]).toMatchObject({ element: 'fire', finisher: true });
  });

  it('attunement powers each: blows by the primary, the finisher by the secondary', () => {
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

    const bag = Array.from({ length: bal.loot.bagSize }, (_, i) => magic('fire', `f${i}`));
    const full = { ...startDive(registry, fire(), 1), bag };
    const w2 = beginFloor(registry, full);
    w2.pending.items = [{ ...magic('frost', 'r'), rarity: 'rare' }];
    expect(bankWorld(registry, full, w2)).toMatchObject({ bagFull: true, dust: dust.rare });
  });
});

describe('the autopilot and the pair', () => {
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
    expect(after.abilities.primary.elements).toEqual(['fire', 'storm']);
  });

  it('skips the bind while it owns nothing of another element', () => {
    const after = betweenDives(registry, createDelveProfile(registry, 5, { primary: 'fire' }));
    expect(after.pair.secondary).toBeNull();
  });

  it('prefers a partner that reacts with the primary, even owning less of it', () => {
    const p = {
      ...createDelveProfile(registry, 5, { primary: 'fire' }),
      // earth 2 (no reaction with fire), frost 1 (Melt)
      bag: [item('earth', 'helm'), item('earth', 'gloves'), item('frost', 'boots')],
    };
    const after = betweenDives(registry, p);
    expect(after.pair).toEqual({ primary: 'fire', secondary: 'frost' });
    expect(after.abilities.primary.elements).toEqual(['fire', 'frost']);
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
    expect(after.abilities.primary.elements).toEqual(['storm', 'fire']);
  });

  it('starts from the primary it is given', () => {
    const { profile } = runAutopilot(registry, { seed: 1, dives: 1, primary: 'frost' });
    expect(profile.pair.primary).toBe('frost'); // unaided, seed 1 ends at fire/frost
  });
});
