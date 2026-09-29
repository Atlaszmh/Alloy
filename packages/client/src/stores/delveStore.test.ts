import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateItem,
  SeededRNG,
  type ChainFix,
  type GearSlot,
  type ManaType,
} from '@alloy/engine';
import {
  useDelveStore,
  BIND_HINT,
  DELVE_SAVE_KEY,
  MANUAL_ATTACK_KEY,
  fixNotices,
  loadDelveProfile,
  overtakeNotice,
} from './delveStore';
import { getDelveRegistry } from '@/features/delve/registry';

const registry = getDelveRegistry();

/** The store's save as version 3 (builds, no pair): a Frost Ward and Fire's Bolt and Nova. */
function v3Save() {
  const {
    pair: _pair,
    manaDust: _dust,
    chains: _chains,
    chainCaps: _caps,
    ...rest
  } = useDelveStore.getState().profile;
  const build = (form: string, elements: string[], payment = 'mana') => ({
    form,
    elements,
    weight: 0,
    payment,
  });
  return {
    ...rest,
    version: 3,
    abilities: {
      primary: build('bolt', ['fire']),
      defensive: build('ward', ['frost']),
      ultimate: build('nova', ['fire'], 'charge'),
    },
  };
}

describe('delveStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('starts a fresh profile with starter gear', () => {
    const { profile } = useDelveStore.getState();
    expect(profile.equipped.weapon).toBeDefined();
    expect(profile.bag).toHaveLength(0);
  });

  it('persists every profile change to localStorage', () => {
    useDelveStore.getState().startDive(1);
    const saved = JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!);
    expect(saved.dive.depth).toBe(1);
    expect(loadDelveProfile()?.profile.dive?.depth).toBe(1);
  });

  it('falls back to a new profile when the save is corrupt', () => {
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":1,"broken":true}');
    expect(loadDelveProfile()).toBeNull();
    localStorage.setItem(DELVE_SAVE_KEY, 'not json');
    expect(loadDelveProfile()).toBeNull();
  });

  it('equips from the bag and tracks new items', () => {
    const item = generateItem(
      registry,
      { uid: 'x1', ilvl: 3, rarity: 'rare', slot: 'helm' },
      new SeededRNG(1),
    );
    const s = useDelveStore.getState();
    s.setProfile({ ...s.profile, bag: [item] });
    s.markNew(['x1']);
    expect(useDelveStore.getState().newUids.x1).toBe(true);
    useDelveStore.getState().equip('x1');
    expect(useDelveStore.getState().profile.equipped.helm?.uid).toBe('x1');
    expect(useDelveStore.getState().newUids.x1).toBeUndefined();
  });

  it('salvage returns the scrap and Mana Dust gained', () => {
    const item = generateItem(
      registry,
      { uid: 'x2', ilvl: 3, rarity: 'magic', slot: 'ring' },
      new SeededRNG(2),
    );
    const s = useDelveStore.getState();
    // Frost is outside the fire hero's pair, so it melts into Mana Dust too.
    s.setProfile({ ...s.profile, bag: [{ ...item, mana: 'frost' }] });
    const { scrap, dust } = useDelveStore.getState().salvage(['x2']);
    expect(scrap).toBeGreaterThan(0);
    expect(dust).toBe(registry.getDelveBalance().pair.salvageDust.magic);
    expect(useDelveStore.getState().profile).toMatchObject({ scrap, manaDust: dust });
  });

  it('upgrade reports failure reasons', () => {
    const uid = useDelveStore.getState().profile.equipped.weapon!.uid;
    const res = useDelveStore.getState().upgrade(uid);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/scrap/i);
  });

  it('remembers the basic attack mode on this device', () => {
    expect(useDelveStore.getState().manualAttack).toBe(false);
    useDelveStore.getState().setManualAttack(true);
    expect(useDelveStore.getState().manualAttack).toBe(true);
    expect(localStorage.getItem(MANUAL_ATTACK_KEY)).toBe('1');
    useDelveStore.getState().setManualAttack(false);
    expect(localStorage.getItem(MANUAL_ATTACK_KEY)).toBe('0');
  });

  it('sets a chain and persists it', () => {
    const chain = {
      moves: [{ kind: 'heavy' as const, form: 'burst' as const, elements: ['fire' as const] }],
      payment: 'cast' as const,
    };
    useDelveStore.getState().setChain('primary', chain);
    expect(useDelveStore.getState().profile.chains.primary).toEqual(chain);
    expect(loadDelveProfile()?.profile.chains.primary).toEqual(chain);
    useDelveStore.getState().setChain('basic', [{ kind: 'hold', element: 'fire' }]);
    expect(loadDelveProfile()?.profile.chains.basic).toEqual([{ kind: 'hold', element: 'fire' }]);
  });

  it('refuses a form from another slot', () => {
    expect(() =>
      useDelveStore.getState().setChain('primary', {
        moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }],
        payment: 'mana',
      }),
    ).toThrow(/primary/);
    expect(useDelveStore.getState().profile.chains.primary.moves[0].form).toBe('bolt');
  });

  it('a reset takes a primary; without one the choice is still to make', () => {
    expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'fire', secondary: null });
    useDelveStore.getState().resetProfile(99);
    expect(useDelveStore.getState().profile.pair.primary).toBeNull();
  });

  it('reads an older save back migrated, with the moves it fixed', () => {
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(v3Save()));
    const loaded = loadDelveProfile()!;
    expect(loaded.profile).toMatchObject({
      version: 5,
      pair: { primary: 'fire', secondary: null },
    });
    expect(loaded.fixed.map((f) => [f.skill, f.index])).toEqual([['defensive', 0]]);
    expect(loaded.gainedPair).toBe(true);
  });

  it('a new store migrates the save, writes it back and queues the fixed moves as notices', async () => {
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(v3Save()));
    // A fresh module and no cached store, as on a page load.
    (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
      'delveStore',
    );
    vi.resetModules();
    const fresh = (await import('./delveStore')).useDelveStore;
    expect(fresh.getState().notices).toEqual([
      BIND_HINT,
      "Your Ward's 1st move used Frost, which isn't in your pair; it now uses Fire",
    ]);
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!).version).toBe(5);
  });

  it('a save that already has its pair (version 4 or 5) gets no bind hint', async () => {
    const { chains: _chains, chainCaps: _caps, ...v4 } = useDelveStore.getState().profile;
    const bolt = { form: 'bolt', elements: ['fire'], weight: 0, payment: 'mana' };
    const abilities = {
      primary: bolt,
      defensive: { ...bolt, form: 'ward' },
      ultimate: { ...bolt, form: 'nova' },
    };
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify({ ...v4, version: 4, abilities }));
    expect(loadDelveProfile()).toMatchObject({ gainedPair: false, profile: { version: 5 } });
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(useDelveStore.getState().profile));
    (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
      'delveStore',
    );
    vi.resetModules();
    const fresh = (await import('./delveStore')).useDelveStore;
    expect(fresh.getState().notices).toEqual([]);
  });

  it('chooses the mana once, binds a second element, and remembers a declined bind this session', () => {
    const s = () => useDelveStore.getState();
    s().resetProfile(5);
    expect(s().chooseMana('frost').ok).toBe(true);
    expect(s().profile.pair.primary).toBe('frost');
    expect(loadDelveProfile()?.profile.pair.primary).toBe('frost');
    expect(s().chooseMana('fire').ok).toBe(false);
    expect(s().bindSecondary('storm').ok).toBe(true);
    expect(s().profile.pair).toEqual({ primary: 'frost', secondary: 'storm' });
    s().declineBind('nature');
    s().declineBind('nature');
    expect(s().bindDeclined).toEqual(['nature']);
    s().resetProfile(5);
    expect(s().bindDeclined).toEqual([]);
  });

  it('closing a dive lets an overtaking secondary swap in, with a notice', () => {
    const storm = (slot: GearSlot) =>
      generateItem(
        registry,
        { uid: `s-${slot}`, ilvl: 1, rarity: 'common', slot, mana: 'storm' },
        new SeededRNG(1),
      );
    const s = useDelveStore.getState();
    s.setProfile({
      ...s.profile,
      pair: { primary: 'fire', secondary: 'storm' },
      equipped: {
        ...s.profile.equipped,
        helm: storm('helm'),
        gloves: storm('gloves'),
        boots: storm('boots'),
      },
    }); // storm 3 > 1.2 × fire 2
    useDelveStore.getState().startDive(1);
    useDelveStore.getState().closeDive();
    expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'storm', secondary: 'fire' });
    expect(useDelveStore.getState().takeNotices()).toEqual([
      'Storm now outweighs Fire: Storm is your primary',
    ]);
    expect(useDelveStore.getState().takeNotices()).toEqual([]);
  });

  it('realign charges and says which moves it changed; re-attune spends Mana Dust', () => {
    const s = useDelveStore.getState();
    s.setProfile({
      ...s.profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: 500,
      scrap: 500,
      chains: {
        ...s.profile.chains,
        ultimate: {
          moves: [{ kind: 'medium', form: 'maelstrom', elements: ['storm'] }],
          payment: 'charge',
        },
      },
    });
    expect(useDelveStore.getState().realign({ secondary: 'frost' }).ok).toBe(true);
    expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'fire', secondary: 'frost' });
    // Storm's role (the secondary) went to Frost.
    expect(useDelveStore.getState().takeNotices()).toEqual([
      "Your Maelstrom's 1st move used Storm, which isn't in your pair; it now uses Frost",
    ]);
    const uid = useDelveStore.getState().profile.equipped.weapon!.uid;
    const dust = useDelveStore.getState().profile.manaDust;
    expect(useDelveStore.getState().reattune(uid, 'frost').ok).toBe(true);
    expect(useDelveStore.getState().profile.equipped.weapon!.mana).toBe('frost');
    expect(useDelveStore.getState().profile.manaDust).toBe(
      dust - registry.getDelveBalance().pair.reattuneDust.common,
    );
  });

  it('a realign that changes a whole chain says so in one notice', () => {
    const s = () => useDelveStore.getState();
    expect(s().bindSecondary('storm').ok).toBe(true);
    s().setProfile({ ...s().profile, manaDust: 500, scrap: 500 });
    expect(s().realign({ primary: 'frost' }).ok).toBe(true);
    // The default basic chain follows the pair silently; each ability chain says so once.
    expect(s().takeNotices()).toEqual([
      "Your Bolt's 1st, 2nd, 3rd and 4th moves used Fire, which isn't in your pair; they now use Frost",
      "Your Ward's 1st move used Fire, which isn't in your pair; it now uses Frost",
      "Your Nova's 1st move used Fire, which isn't in your pair; it now uses Frost",
    ]);
  });

  it('words the notices plainly: one a skill for its moves that changed the same way', () => {
    const pair = { primary: 'fire', secondary: 'storm' } as const;
    const move = (
      index: number,
      removed: ManaType[],
      elements: ManaType[],
      form: 'bolt' | 'lance' = 'bolt',
    ): ChainFix => ({
      skill: 'primary',
      index,
      removed,
      move: { kind: 'medium', form, elements },
    });
    const blow = (index: number): ChainFix => ({
      skill: 'basic',
      index,
      removed: ['frost'],
      move: { kind: 'light', element: 'fire' },
    });
    expect(fixNotices(registry, [move(2, ['frost', 'nature'], ['fire'])], pair)).toEqual([
      "Your Bolt's 3rd move used Frost and Nature, which aren't in your pair; it now uses Fire",
    ]);
    const moves = [
      move(0, ['frost'], ['storm']),
      move(1, ['frost'], ['storm']),
      move(2, ['frost'], ['fire']),
      move(3, ['frost'], ['storm']),
    ];
    expect(fixNotices(registry, moves, pair)).toEqual([
      "Your Bolt's 1st, 2nd and 4th moves used Frost, which isn't in your pair; they now use Storm",
      "Your Bolt's 3rd move used Frost, which isn't in your pair; it now uses Fire",
    ]);
    expect(fixNotices(registry, [blow(1)], pair)).toEqual([
      "Your basic attack's 2nd blow used Frost, which isn't in your pair; it now uses Fire",
    ]);
    expect(fixNotices(registry, [blow(0), blow(2)], pair)).toEqual([
      "Your basic attack's 1st and 3rd blows used Frost, which isn't in your pair; they now use Fire",
    ]);
    // Moves of different forms go by their skill.
    const mixed = [move(0, ['frost'], ['fire']), move(1, ['frost'], ['fire'], 'lance')];
    expect(fixNotices(registry, mixed, pair)).toEqual([
      "Your Primary's 1st and 2nd moves used Frost, which isn't in your pair; they now use Fire",
    ]);
    // An element still in the pair (Storm took the primary's role) needs no clause.
    const stormy = { primary: 'storm', secondary: 'nature' } as const;
    expect(fixNotices(registry, [move(1, ['storm'], ['nature'])], stormy)).toEqual([
      "Your Bolt's 2nd move used Storm; it now uses Nature",
    ]);
    expect(overtakeNotice(registry, 'storm', 'fire')).toBe(
      'Storm now outweighs Fire: Storm is your primary',
    );
  });
});
