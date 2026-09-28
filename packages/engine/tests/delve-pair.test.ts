import { describe, it, expect } from 'vitest';
import { defaultAbilities } from '../src/arpg/abilities/resolve.js';
import { startDive } from '../src/delve/dive.js';
import { fixBuildsToPair } from '../src/delve/pair.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import type { AbilityBuilds } from '../src/types/ability.js';
import {
  compareItem,
  computeAttunement,
  computeHeroStats,
  estimateCombat,
  heroPower,
  type HeroStatsExtra,
} from '../src/delve/hero-stats.js';
import type { DelveProfile, HeroWeapon, ManaPair } from '../src/types/delve.js';
import type { GearItem, GearSlot, HeroStatKey, Rarity } from '../src/types/gear.js';
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
