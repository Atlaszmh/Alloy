import { describe, it, expect } from 'vitest';
import { defaultAbilities } from '../src/arpg/abilities/resolve.js';
import { beginFloor, heroMaxHp, startDive } from '../src/delve/dive.js';
import {
  bindSecondary,
  chooseStartingMana,
  fixBuildsToPair,
  profileStats,
  realign,
  reattuneItem,
  resolveOvertake,
} from '../src/delve/pair.js';
import {
  createDelveProfile,
  equipBest,
  parseDelveProfile,
  profilePower,
  salvageCandidates,
  setAbility,
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
import type { DelveProfile, HeroWeapon, ManaPair } from '../src/types/delve.js';
import {
  GEAR_SLOTS,
  type GearItem,
  type GearSlot,
  type HeroStatKey,
  type Rarity,
} from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';
import { bal, gear, registry } from './fixtures/arena.js';

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
