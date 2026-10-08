import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDelveProfile,
  defaultBasic,
  defaultChains,
  generateItem,
  SeededRNG,
  type Blow,
  mintMoveset,
} from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import { armed } from '@/features/delve/__tests__/armed';
import {
  MAX_DUMMY_GROUPS,
  SANDBOX_DEFAULTS,
  SANDBOX_KEY,
  parseSandbox,
  sandboxEquipped,
  sandboxStats,
  useSandboxStore,
} from './sandboxStore';

const registry = getDelveRegistry();
const store = () => useSandboxStore.getState();

describe('sandboxStore', () => {
  beforeEach(() => {
    localStorage.clear();
    store().reset();
  });

  it('starts from the defaults: a rare fire sword, every toggle on, depth 5', () => {
    expect(parseSandbox(undefined)).toEqual(SANDBOX_DEFAULTS);
    expect(store()).toMatchObject({
      weapon: { baseId: 'sword', mana: 'fire', rarity: 'rare' },
      loadedWeapon: null,
      toggles: { infiniteMana: true, noCooldowns: true, invulnerable: true },
      depth: 5,
      slowmo: 1,
      dummyElement: null,
      dummies: [],
    });
    const stats = sandboxStats(registry, store());
    expect(stats.weapon.baseId).toBe('sword');
    expect(stats.weapon.blows.map((b) => b.element)).toEqual(['fire', 'fire', 'fire']);
  });

  it('saves every change under its own key and reads it back', () => {
    store().setDepth(9);
    store().setLegendary('glass_cannon', true);
    store().setAttunement('storm', 99);
    store().addDummyGroup({ layout: 'row', element: 'frost' });
    const saved = parseSandbox(JSON.parse(localStorage.getItem(SANDBOX_KEY)!));
    expect(saved.depth).toBe(9);
    expect(saved.legendaries).toEqual({ glass_cannon: registry.getLegendary('glass_cannon').max });
    expect(saved.attunement).toEqual({ storm: 15 });
    expect(saved.dummies).toEqual([{ layout: 'row', element: 'frost' }]);
    expect(localStorage.getItem('alloy:delve:v2')).toBeNull(); // never the Delve save
  });

  it('falls back field by field on bad or missing data', () => {
    expect(parseSandbox('not an object')).toEqual(SANDBOX_DEFAULTS);
    const s = parseSandbox({
      depth: 99,
      weapon: { baseId: 'spoon', mana: 'fire', rarity: 'rare' },
      slowmo: 0.5,
      toggles: { infiniteMana: false, noCooldowns: true, invulnerable: true },
      legendaries: { not_a_power: 5 },
    });
    expect(s.depth).toBe(SANDBOX_DEFAULTS.depth);
    expect(s.weapon).toEqual(SANDBOX_DEFAULTS.weapon);
    expect(s.slowmo).toBe(0.5);
    expect(s.toggles.infiniteMana).toBe(false);
    expect(s.legendaries).toEqual({});
    expect(parseSandbox({ weapon: null }).weapon).toBeNull();
    const nine = Array.from({ length: 9 }, () => ({ layout: 'single', element: null }));
    expect(parseSandbox({ dummies: nine }).dummies).toEqual(nine.slice(0, MAX_DUMMY_GROUPS));
  });

  it("keeps saved chains, but falls back when a move's form is another slot's", () => {
    const D = SANDBOX_DEFAULTS.chains;
    const lance = {
      moves: [{ kind: 'heavy', form: 'lance', elements: ['storm'] }],
      payment: 'cast',
    };
    expect(parseSandbox({ chains: { ...D, primary: lance } }).chains).toEqual({
      ...D,
      primary: lance,
    });
    const ward = { moves: [{ kind: 'medium', form: 'ward', elements: ['fire'] }], payment: 'mana' };
    expect(parseSandbox({ chains: { ...D, primary: ward } }).chains).toEqual(D);
  });

  it('a save from before chains keeps its pair: its basics-only infusion is the secondary, and the chains are the defaults on it', () => {
    const old = parseSandbox({ primary: 'frost', basicInfusion: 'storm' });
    expect(old).toMatchObject({ primary: 'frost', secondary: 'storm' });
    expect(old.chains).toEqual({
      ...defaultChains(registry, 'frost', 'sword'),
      basic: defaultBasic(registry, 'sword', 'frost', 'storm'),
    });
    expect(parseSandbox({ primary: 'frost', basicInfusion: 'frost' }).secondary).toBeNull();
    // Valid chains stay as they are.
    const chains = {
      ...defaultChains(registry, 'nature', 'sword'),
      basic: [{ kind: 'heavy', element: 'fire' }],
    };
    expect(parseSandbox({ primary: 'frost', basicInfusion: 'storm', chains }).chains).toEqual(
      chains,
    );
  });

  it('keeps a saved loaded weapon only while the weapon choice still names it', () => {
    const rolled = generateItem(
      registry,
      { uid: 'L1', ilvl: 9, rarity: 'legendary', slot: 'weapon', baseId: 'bow', mana: 'storm' },
      new SeededRNG(3),
    );
    // A saved weapon's constructs carry their uids (save v14).
    const [moveset] = mintMoveset(createDelveProfile(registry, 7), rolled.moveset!);
    const bow = { ...rolled, moveset };
    const named = { baseId: 'bow', mana: 'storm', rarity: 'legendary' };
    expect(parseSandbox({ weapon: named, loadedWeapon: bow }).loadedWeapon).toEqual(bow);
    const other = { baseId: 'sword', mana: 'fire', rarity: 'rare' };
    expect(parseSandbox({ weapon: other, loadedWeapon: bow }).loadedWeapon).toBeNull();
    expect(parseSandbox({ weapon: null, loadedWeapon: bow }).loadedWeapon).toBeNull();
  });

  it(`keeps at most ${MAX_DUMMY_GROUPS} dummy groups`, () => {
    for (let i = 0; i < MAX_DUMMY_GROUPS + 1; i++)
      store().addDummyGroup({ layout: 'single', element: null });
    expect(store().dummies).toHaveLength(MAX_DUMMY_GROUPS);
  });

  it("Load my build copies the real weapon, the other gear and the weapon's chains, and clears the extras", () => {
    const profile = createDelveProfile(registry, 7);
    const bow = generateItem(
      registry,
      { uid: 'L1', ilvl: 9, rarity: 'legendary', slot: 'weapon', baseId: 'bow', mana: 'storm' },
      new SeededRNG(3),
    );
    store().setLegendary('glass_cannon', true);
    store().setAttunement('fire', 5);
    store().loadMyBuild({ ...profile, equipped: { ...profile.equipped, weapon: bow } });
    const s = store();
    expect(s.loadedWeapon).toEqual(bow);
    expect(s.weapon).toEqual({ baseId: 'bow', mana: 'storm', rarity: 'legendary' });
    expect(s.gear).toEqual({ chest: profile.equipped.chest });
    expect(s.chains).toEqual(bow.moveset!.chains); // a legendary carries all four
    expect(s.legendaries).toEqual({});
    expect(s.attunement).toEqual({});
    expect(sandboxEquipped(registry, s).weapon).toEqual(bow);
    expect(sandboxStats(registry, s).legendaries[bow.legendary!.id]).toBe(bow.legendary!.value);

    // Re-picking the same choice (the pressed chip) keeps the real weapon; any change drops it.
    s.setWeapon({ baseId: 'bow', mana: 'storm', rarity: 'legendary' });
    expect(store().loadedWeapon).toEqual(bow);
    s.setWeapon({ baseId: 'bow', mana: 'storm', rarity: 'rare' });
    expect(store().loadedWeapon).toBeNull();
    expect(sandboxEquipped(registry, store()).weapon?.legendary).toBeUndefined();
  });

  it("Load my build keeps the sandbox's chains for the skills the weapon doesn't carry", () => {
    const profile = createDelveProfile(registry, 7, { primary: 'frost' });
    const before = store().chains;
    store().loadMyBuild(profile); // a common sword: its Basic and a two-slot Primary
    const sword = profile.equipped.weapon!.moveset!.chains;
    expect(store().chains).toEqual({
      basic: sword.basic,
      primary: sword.primary,
      defensive: before.defensive,
      ultimate: before.ultimate,
    });
  });

  it('Load my build without a weapon leaves the hero unarmed', () => {
    const profile = createDelveProfile(registry, 7);
    const { weapon: _weapon, ...rest } = profile.equipped;
    store().loadMyBuild({ ...profile, equipped: rest });
    expect(store().weapon).toBeNull();
    expect(store().loadedWeapon).toBeNull();
    expect(sandboxEquipped(registry, store()).weapon).toBeUndefined();
    expect(sandboxStats(registry, store()).weapon.baseId).toBeNull();
  });

  it('keeps a pair for the basic blows, saved, never the same element; the blows follow it', () => {
    const elements = () => store().chains.basic.map((b) => b.element);
    expect(store()).toMatchObject({ primary: 'fire', secondary: null });
    store().setSecondary('storm'); // bound from none: the last blow takes it
    expect(elements()).toEqual(['fire', 'fire', 'storm']);
    store().setChain('basic', [
      { kind: 'light', element: 'fire' },
      { kind: 'heavy', element: 'storm' },
    ]);
    expect(sandboxStats(registry, store()).weapon.blows.map((b) => b.element)).toEqual([
      'fire',
      'storm',
    ]);
    store().setSecondary('fire'); // the primary: ignored
    expect(store().secondary).toBe('storm');
    store().setPrimary('frost'); // the primary's blows follow it
    expect(parseSandbox(JSON.parse(localStorage.getItem(SANDBOX_KEY)!))).toMatchObject({
      primary: 'frost',
      secondary: 'storm',
    });
    expect(elements()).toEqual(['frost', 'storm']);
    store().setSecondary('nature'); // and the secondary's
    expect(elements()).toEqual(['frost', 'nature']);
    store().setPrimary('nature'); // the secondary's element: the secondary goes, its blows too
    expect(store().secondary).toBeNull();
    expect(elements()).toEqual(['nature', 'nature']);
    expect(parseSandbox({ primary: 'plasma', secondary: 'plasma' })).toMatchObject({
      primary: 'fire',
      secondary: null,
    });
    expect(parseSandbox({ primary: 'storm', secondary: 'storm' }).secondary).toBeNull();
  });

  it('the basic chain on its default follows the weapon; a built one survives a swap and a bind', () => {
    store().setSecondary('storm');
    store().setWeapon({ baseId: 'maul', mana: 'fire', rarity: 'rare' });
    expect(store().chains.basic).toEqual(defaultBasic(registry, 'maul', 'fire', 'storm'));
    store().setSecondary(null);
    const built: Blow[] = [
      { kind: 'heavy', element: 'fire' },
      { kind: 'light', element: 'fire' },
    ];
    store().setChain('basic', built);
    store().setWeapon({ baseId: 'dagger', mana: 'fire', rarity: 'rare' });
    store().setSecondary('storm');
    expect(store().chains.basic).toEqual(built);
  });

  it('the weapon keeps its own mana for attunement; unarmed punches with the pair', () => {
    store().setWeapon({ baseId: 'staff', mana: 'storm', rarity: 'rare' });
    const stats = sandboxStats(registry, store());
    expect(stats.weapon.baseId).toBe('staff');
    expect(stats.weapon.blows.every((b) => b.element === 'fire')).toBe(true);
    expect(stats.attunement.storm).toBeGreaterThan(0); // unrestricted: every element attunes
    store().setWeapon(null);
    const bare = sandboxStats(registry, store()).weapon;
    expect(bare.baseId).toBeNull();
    expect(bare.blows.every((b) => b.element === 'fire')).toBe(true);
    store().setSecondary('storm'); // the default's last blow takes it
    expect(sandboxStats(registry, store()).weapon.blows.map((b) => b.element)).toEqual([
      'fire',
      'fire',
      'storm',
    ]);
  });

  it('Load my build brings your pair in', () => {
    const profile = createDelveProfile(registry, 7, { primary: 'frost' });
    store().loadMyBuild({ ...profile, pair: { primary: 'frost', secondary: 'nature' } });
    expect(store()).toMatchObject({ primary: 'frost', secondary: 'nature' });
    expect(store().loadedWeapon?.mana).toBe('frost'); // the real item, its real mana
  });

  const split = { id: 'split', tier: 3 } as const;

  it("keeps the moves' runes: saved, and copied by Load my build", () => {
    const primary = store().chains.primary;
    store().setChain('primary', {
      ...primary,
      moves: [{ ...primary.moves[0], runes: [split, null] }],
    });
    const saved = parseSandbox(JSON.parse(localStorage.getItem(SANDBOX_KEY)!));
    expect(saved.chains.primary.moves[0].runes).toEqual([split, null]);
    const profile = armed(createDelveProfile(registry, 7, { primary: 'fire' }));
    const sword = profile.equipped.weapon!;
    const ms = sword.moveset!;
    const bolt = { ...ms.chains.primary!.moves[0], runes: [split] };
    const weapon = {
      ...sword,
      moveset: {
        ...ms,
        chains: { ...ms.chains, primary: { ...ms.chains.primary!, moves: [bolt] } },
      },
    };
    store().loadMyBuild({ ...profile, equipped: { ...profile.equipped, weapon } });
    expect(store().chains.primary.moves[0].runes).toEqual([split]);
  });

  it('a rune the game no longer knows leaves its socket empty when the loadout loads', () => {
    const primary = SANDBOX_DEFAULTS.chains.primary;
    const moves = [{ ...primary.moves[0], runes: [{ id: 'gone', tier: 2 }, split] }];
    const chains = { ...SANDBOX_DEFAULTS.chains, primary: { ...primary, moves } };
    expect(parseSandbox({ ...SANDBOX_DEFAULTS, chains }).chains.primary.moves[0].runes).toEqual([
      null,
      split,
    ]);
  });

  it('a default basic chain that follows a new weapon keeps each blow’s runes by position, if they fit', () => {
    const chain = { id: 'chain', tier: 2 } as const;
    const linger = { id: 'linger', tier: 1 } as const;
    // The sword's default (light, light, heavy) with Chain on its first blow and Linger on its third.
    const basic = store().chains.basic;
    const runes: (typeof chain | typeof linger)[][] = [[chain], [], [linger]];
    store().setChain(
      'basic',
      basic.map((b, i) => (runes[i].length > 0 ? { ...b, runes: runes[i] } : b)),
    );
    store().setWeapon({ baseId: 'dagger', mana: 'fire', rarity: 'rare' });
    const blows = store().chains.basic;
    expect(blows.map((b) => b.kind)).toEqual(['light', 'light', 'medium', 'heavy']); // the dagger's
    expect(blows.map((b) => (b.runes ?? []).filter(Boolean))).toEqual([[chain], [], [linger], []]);
    // Split fits a bow's blows, not a sword's: following a sword, it goes.
    store().setWeapon({ baseId: 'bow', mana: 'fire', rarity: 'rare' });
    const bow = store().chains.basic;
    store().setChain(
      'basic',
      bow.map((b, i) => (i === 0 ? { ...b, runes: [split] } : b)),
    );
    store().setWeapon({ baseId: 'sword', mana: 'fire', rarity: 'rare' });
    expect((store().chains.basic[0].runes ?? []).filter(Boolean)).toEqual([]);
  });
});
