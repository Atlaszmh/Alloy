import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  defaultMoveset,
  generateItem,
  heroChains,
  SeededRNG,
  pouchCount,
  type ChainFix,
  type Chains,
  type DelveProfile,
  type DraftPrice,
  type GearItem,
  type GearSlot,
  type ManaType,
  type RuneRef,
} from '@alloy/engine';
import {
  useDelveStore,
  DELVE_SAVE_KEY,
  MANUAL_ATTACK_KEY,
  RESET_NOTICE,
  fixNotices,
  loadDelveProfile,
  overtakeNotice,
  UNSOCKET_KEY,
  applyLabel,
  draftApply,
  partsText,
  selectDraftApply,
} from './delveStore';
import { getDelveRegistry } from '@/features/delve/registry';

const registry = getDelveRegistry();
/** The hero's chains, as its equipped weapon carries them. */
const chains = () => {
  const { equipped, pair } = useDelveStore.getState().profile;
  return heroChains(registry, equipped, pair) as Chains;
};

/** Equip the starting sword made epic (all four skills), its chains the defaults but for `over`. */
function epicSword(over: Partial<Chains> = {}) {
  const p = useDelveStore.getState().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const moveset = defaultMoveset(registry, weapon, 'fire');
  useDelveStore.getState().setProfile({
    ...p,
    equipped: {
      ...p.equipped,
      weapon: { ...weapon, moveset: { ...moveset, chains: { ...moveset.chains, ...over } } },
    },
  });
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
    expect(loadDelveProfile()).toMatchObject({ profile: { dive: { depth: 1 } } });
  });

  it('resets a save of another version, and falls back to a new profile when the save is corrupt', () => {
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":7,"broken":true}');
    expect(loadDelveProfile()).toEqual({ reset: true });
    localStorage.setItem(DELVE_SAVE_KEY, '{"version":8,"broken":true}');
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

  it('salvage returns the scrap, Mana Dust and Links gained', () => {
    const item = generateItem(
      registry,
      { uid: 'x2', ilvl: 3, rarity: 'magic', slot: 'ring' },
      new SeededRNG(2),
    );
    const s = useDelveStore.getState();
    // Frost is outside the fire hero's pair, so it melts into Mana Dust too.
    s.setProfile({ ...s.profile, bag: [{ ...item, mana: 'frost' }], scrap: 0 });
    const { scrap, dust, links } = useDelveStore.getState().salvage(['x2']);
    expect(scrap).toBeGreaterThan(0);
    expect(dust).toBe(registry.getDelveBalance().pair.salvageDust.magic);
    expect(links).toBe(0); // not a weapon
    expect(useDelveStore.getState().profile).toMatchObject({ scrap, manaDust: dust });
    // The crafting yields come with stage 4c's B2: none yet.
    expect(useDelveStore.getState().salvage([])).toMatchObject({
      shards: [],
      patterns: [],
      essences: [],
    });
    // A weapon gives a Link for each slot past its base.
    const sword = useDelveStore.getState().profile.equipped.weapon!;
    const roomy = {
      ...sword,
      uid: 'x3',
      moveset: defaultMoveset(registry, sword, 'fire', { primary: 3 }),
    };
    s.setProfile({ ...useDelveStore.getState().profile, bag: [roomy] });
    expect(useDelveStore.getState().salvage(['x3']).links).toBe(2);
    expect(useDelveStore.getState().profile.links).toBe(2);
  });

  it('upgrade reports failure reasons', () => {
    useDelveStore.getState().setProfile({ ...useDelveStore.getState().profile, scrap: 0 });
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

  it("sets the weapon's chains and persists them", () => {
    const chain = {
      moves: [{ kind: 'heavy' as const, form: 'burst' as const, elements: ['fire' as const] }],
      payment: 'cast' as const,
    };
    const basic = [{ kind: 'hold' as const, element: 'fire' as const }];
    expect(useDelveStore.getState().setChains({ primary: chain, basic }).ok).toBe(true);
    expect(chains().primary).toEqual(chain);
    expect(loadDelveProfile()).toMatchObject({
      profile: { equipped: { weapon: { moveset: { chains: { primary: chain, basic } } } } },
    });
  });

  it('refuses a form from another slot, and changes nothing', () => {
    const res = useDelveStore.getState().setChains({
      basic: [{ kind: 'hold', element: 'fire' }],
      primary: { moves: [{ kind: 'medium', form: 'nova', elements: ['fire'] }], payment: 'mana' },
    });
    expect(res).toMatchObject({ ok: false, reason: 'Nova is not a primary form' });
    expect(chains().primary.moves[0].form).toBe('bolt');
    expect(chains().basic).toHaveLength(3);
  });

  it('adds a slot for Links and scrap', () => {
    const s = () => useDelveStore.getState();
    expect(s().addSlot('primary')).toMatchObject({ ok: false, reason: 'Not enough Links' });
    s().setProfile({ ...s().profile, links: 1, scrap: 20 });
    expect(s().addSlot('primary').ok).toBe(true);
    expect(s().profile).toMatchObject({ links: 0, scrap: 0 });
    expect(chains().primary.moves).toHaveLength(2);
    expect(s().addSlot('defensive')).toMatchObject({
      ok: false,
      reason: 'Carried by magic weapons and better',
    });
  });

  it("takes the door screen's power-up", () => {
    const s = () => useDelveStore.getState();
    const helm = generateItem(
      registry,
      { uid: 'x4', ilvl: 3, rarity: 'rare', slot: 'helm' },
      new SeededRNG(4),
    );
    s().setProfile({ ...s().profile, bag: [helm] });
    s().startDive(1);
    s().markNew(['x4']);
    // At the door screen after a depth, a stop offering an equip.
    const dive = { ...s().profile.dive!, phase: 'choosing' as const };
    s().setProfile({
      ...s().profile,
      dive: { ...dive, stop: { offers: ['equip'], taken: false } },
    });
    expect(s().takeStop({ kind: 'equip', uid: 'x4' }).ok).toBe(true);
    expect(s().profile.equipped.helm?.uid).toBe('x4');
    expect(s().profile.dive!.stop!.taken).toBe(true);
    expect(s().newUids.x4).toBeUndefined();
    expect(s().takeStop({ kind: 'equip', uid: 'x4' }).ok).toBe(false);
  });

  it('a reset takes a primary; without one the choice is still to make', () => {
    expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'fire', secondary: null });
    useDelveStore.getState().resetProfile(99);
    expect(useDelveStore.getState().profile.pair.primary).toBeNull();
  });

  it('a save of another version starts afresh: written back at once, with one notice', async () => {
    const old = { ...useDelveStore.getState().profile, version: 7, scrap: 999 };
    localStorage.setItem(DELVE_SAVE_KEY, JSON.stringify(old));
    // A fresh module and no cached store, as on a page load.
    (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
      'delveStore',
    );
    vi.resetModules();
    const fresh = (await import('./delveStore')).useDelveStore;
    expect(fresh.getState().notices).toEqual([RESET_NOTICE]);
    expect(fresh.getState().profile).toMatchObject({ version: 8, scrap: 50 }); // the kit's
    expect(JSON.parse(localStorage.getItem(DELVE_SAVE_KEY)!)).toMatchObject({
      version: 8,
      scrap: 50,
    });
    // The written-back save loads as it is: no second notice.
    (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
      'delveStore',
    );
    vi.resetModules();
    const again = (await import('./delveStore')).useDelveStore;
    expect(again.getState().notices).toEqual([]);
  });

  it('wraps every crafting op of the engine (stage 4c fills them)', () => {
    const s = useDelveStore.getState();
    for (const op of [s.forge, s.hone, s.imprint, s.refine, s.buyShard])
      expect(op).toBeTypeOf('function');
    expect('fuse' in s).toBe(false);
  });

  it('chooses the mana once, binds a second element, and remembers a declined bind this session', () => {
    const s = () => useDelveStore.getState();
    s().resetProfile(5);
    expect(s().chooseMana('frost').ok).toBe(true);
    expect(s().profile.pair.primary).toBe('frost');
    expect(loadDelveProfile()).toMatchObject({ profile: { pair: { primary: 'frost' } } });
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
    epicSword({
      ultimate: {
        moves: [{ kind: 'medium', form: 'maelstrom', elements: ['storm'] }],
        payment: 'charge',
      },
    });
    const s = useDelveStore.getState();
    s.setProfile({
      ...s.profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: 500,
      scrap: 500,
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
      dust - registry.getDelveBalance().pair.reattuneDust.epic,
    );
  });

  it('a realign that changes a whole chain says so in one notice', () => {
    const s = () => useDelveStore.getState();
    expect(s().bindSecondary('storm').ok).toBe(true);
    s().setProfile({ ...s().profile, manaDust: 500, scrap: 500 });
    expect(s().realign({ primary: 'frost' }).ok).toBe(true);
    // The weapon's every chain says so once, the basic one too.
    expect(s().takeNotices()).toEqual([
      "Your basic attack's 1st, 2nd and 3rd blows used Fire, which isn't in your pair; they now use Frost",
      "Your Bolt's 1st move used Fire, which isn't in your pair; it now uses Frost",
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

const split = { id: 'split', tier: 1 } as const;
const s = () => useDelveStore.getState();

/** A fresh store module, as on a page load: the override it reads back. */
async function freshUnsocket() {
  (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
    'delveStore',
  );
  vi.resetModules();
  return (await import('./delveStore')).useDelveStore.getState().unsocket;
}

describe('delveStore: runes in the draft', () => {
  beforeEach(() => {
    localStorage.clear();
    s().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
  });

  /**
   * The starting sword (common: one socket a move) with a two-Bolt Primary, each Bolt's sockets
   * as given (none open when missing), and the profile's `over`.
   */
  function bolts(runes: ((RuneRef | null)[] | undefined)[], over: Partial<DelveProfile> = {}) {
    const p = s().profile;
    const sword = p.equipped.weapon!;
    const moveset = defaultMoveset(registry, sword, 'fire', { primary: 2 });
    const primary = moveset.chains.primary!;
    const moves = primary.moves.map((m, i) => (runes[i] ? { ...m, runes: runes[i] } : m));
    const weapon = {
      ...sword,
      moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
    };
    s().setProfile({ ...p, ...over, equipped: { ...p.equipped, weapon } });
  }
  const view = () => draftApply(registry, s().profile, s().chainDraft, s().unsocket);

  it('with nothing pending, Apply has no total', () => {
    expect(view()).toMatchObject({ changes: {}, price: null, dry: null });
    expect(applyLabel(registry, null)).toBe('Apply');
  });

  it("words Apply's total without emoji, as its Price draws it", () => {
    const price: DraftPrice = {
      dust: 5,
      links: 2,
      refundLinks: 0,
      scrap: 1200,
      destroys: [],
      returns: [],
      pouch: {},
    };
    expect(applyLabel(registry, price)).toBe('Apply · 5 Mana Dust · 2 Links · 1,200 scrap');
  });

  it('socketing a pouch rune is free: Apply takes it from the pouch', () => {
    bolts([[null]], { runes: { split: [1, 0, 0, 0, 0] } });
    const primary = chains().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [split] }, second] });
    expect(s().chainDraft?.origins).toEqual({ primary: [0, 1] });
    expect(view().price).toMatchObject({ dust: 0, links: 0, scrap: 0, refundLinks: 0 });
    expect(pouchCount(view().pouch, split)).toBe(0); // what the picker has left to offer
    expect(applyLabel(registry, view().price)).toBe('Apply');
    expect(s().applyDraft().ok).toBe(true);
    expect(chains().primary.moves[0].runes).toEqual([split]);
    expect(pouchCount(s().profile.runes, split)).toBe(0);
  });

  it("composes the builder's maps into origins; moved and moved back, nothing is left", () => {
    bolts([[split], [null]]);
    const primary = chains().primary;
    const [a, b] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [b, a] }, [1, 0]); // ▸ on the first
    expect(s().chainDraft?.origins).toEqual({ primary: [1, 0] });
    const added = { kind: 'light' as const, form: 'bolt' as const, elements: ['fire' as const] };
    s().editDraft('primary', { ...primary, moves: [b, a, added] }, [0, 1, null]); // +
    expect(s().chainDraft?.origins).toEqual({ primary: [1, 0, null] });
    s().editDraft('primary', { ...primary, moves: [b, a] }, [0, 1]); // × on the new one
    s().editDraft('primary', { ...primary, moves: [a, b] }, [1, 0]); // ◂ back
    expect(s().chainDraft?.chains).toEqual({});
    expect(s().chainDraft?.origins).toEqual({});
  });

  it('a removed move refunds its socket as a Link, netted in the label; its rune goes by the rule', () => {
    bolts([[split], [null]]);
    const primary = chains().primary;
    s().editDraft('primary', { ...primary, moves: [primary.moves[1]] }, [1]); // × on the Split Bolt
    expect(view().price).toMatchObject({ links: 0, refundLinks: 1, destroys: [split] });
    expect(applyLabel(registry, view().price)).toBe('Apply · +1 Link · destroys Split I');
    expect(s().applyDraft().ok).toBe(true);
    expect(chains().primary.moves).toEqual([primary.moves[1]]);
    expect(s().profile.links).toBe(1);
  });

  it('a new socket costs Links and scrap by its index, and Apply needs them', () => {
    bolts([], { links: 0, scrap: 20 });
    const primary = chains().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [null] }, second] });
    expect(view().price).toMatchObject({ links: 1, scrap: 20 });
    expect(applyLabel(registry, view().price)).toBe('Apply · 1 Link · 20 scrap');
    expect(view().dry).toMatchObject({ ok: false, reason: expect.stringMatching(/Links/) });
    s().setProfile({ ...s().profile, links: 1 });
    expect(s().applyDraft().ok).toBe(true);
    expect(s().profile).toMatchObject({ links: 0, scrap: 0 });
  });

  it("when the engine won't price the draft, says why, and the pouch stays as it is", () => {
    bolts([[null]], { runes: {} });
    const primary = chains().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [split] }, second] });
    expect(view()).toMatchObject({ price: null, refused: 'Not enough runes in your pouch' });
    expect(view().pouch).toEqual({});
  });

  it('is one memoised result for the store until the profile, the draft or the pull rule changes', () => {
    bolts([[null]]);
    const primary = chains().primary;
    s().editDraft('primary', { ...primary, moves: [primary.moves[1], primary.moves[0]] }, [1, 0]);
    const first = selectDraftApply(s());
    expect(first.price).not.toBeNull();
    expect(selectDraftApply(s())).toBe(first);
    s().setUnsocket('pay');
    const paying = selectDraftApply(s());
    expect(paying).not.toBe(first);
    expect(selectDraftApply(s())).toBe(paying);
  });

  it('the dev override sets the pull rule: paying, a pull costs scrap and the rune comes back', () => {
    bolts([[split]], { scrap: 100 });
    s().setUnsocket('pay');
    expect(localStorage.getItem(UNSOCKET_KEY)).toBe('pay');
    const primary = chains().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [null] }, second] });
    expect(view().price).toMatchObject({ scrap: 15, destroys: [], returns: [split] });
    expect(applyLabel(registry, view().price)).toBe('Apply · 15 scrap');
    expect(pouchCount(view().pouch, split)).toBe(1); // free to socket elsewhere in this Apply
    expect(s().applyDraft().ok).toBe(true);
    expect(s().profile.scrap).toBe(85);
    expect(pouchCount(s().profile.runes, split)).toBe(1);
  });

  it('reads the override back on this device, in dev builds only', async () => {
    localStorage.setItem(UNSOCKET_KEY, 'pay');
    expect(await freshUnsocket()).toBe('pay');
    localStorage.setItem(UNSOCKET_KEY, 'free'); // not a rule
    expect(await freshUnsocket()).toBeNull();
    const dev = import.meta.env.DEV;
    import.meta.env.DEV = false as unknown as boolean;
    try {
      localStorage.setItem(UNSOCKET_KEY, 'pay');
      expect(await freshUnsocket()).toBeNull();
    } finally {
      import.meta.env.DEV = dev;
    }
  });
});

const quick = { id: 'quick', tier: 1 } as const;

describe('delveStore: runes outside the draft', () => {
  beforeEach(() => {
    localStorage.clear();
    s().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
  });

  /** The starting sword, its one Bolt's sockets `runes` (under `uid` when given: a bag copy). */
  function swordWith(runes: (RuneRef | null)[], uid?: string): GearItem {
    const sword = s().profile.equipped.weapon!;
    const moveset = defaultMoveset(registry, sword, 'fire');
    const primary = moveset.chains.primary!;
    const moves = [{ ...primary.moves[0], runes }];
    const chains = { ...moveset.chains, primary: { ...primary, moves } };
    return { ...sword, uid: uid ?? sword.uid, moveset: { ...moveset, chains } };
  }

  it('a load-time trim takes a socket past the cap off: a Link, its rune by the rule, no notice', async () => {
    const p = s().profile;
    // Two sockets on a common sword (one a move): the second goes, and its Quick with it.
    const weapon = swordWith([split, quick]);
    localStorage.setItem(
      DELVE_SAVE_KEY,
      JSON.stringify({ ...p, equipped: { ...p.equipped, weapon } }),
    );
    (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
      'delveStore',
    );
    vi.resetModules();
    const fresh = (await import('./delveStore')).useDelveStore;
    expect(fresh.getState().notices).toEqual([]);
    expect(fresh.getState().profile.links).toBe(p.links + 1);
  });

  it('salvage gives a socket back as a Link; its rune follows the pull rule', () => {
    s().setProfile({ ...s().profile, bag: [swordWith([split], 'x5'), swordWith([split], 'x6')] });
    expect(s().salvage(['x5'])).toMatchObject({ links: 1, runes: [], destroyed: [split] });
    s().setUnsocket('pay');
    expect(s().salvage(['x6'])).toMatchObject({ links: 1, runes: [split], destroyed: [] });
    expect(pouchCount(s().profile.runes, split)).toBe(1);
  });

  it("choosing the mana gives the weapon's runes back by the pull rule", () => {
    s().resetProfile(5);
    const p = s().profile;
    const weapon = swordWith([split]);
    s().setProfile({ ...p, equipped: { ...p.equipped, weapon } });
    s().setUnsocket('pay');
    expect(s().chooseMana('frost')).toMatchObject({ ok: true, runes: [split], destroyed: [] });
    expect(pouchCount(s().profile.runes, split)).toBe(1);
  });

  it('says what became of the runes', () => {
    expect(partsText(registry, [split], [])).toBe('Split I back to your pouch');
    expect(partsText(registry, [split, split], [{ id: 'quick', tier: 3 }])).toBe(
      '2 runes back to your pouch · destroys Quick III',
    );
    expect(partsText(registry, [], [])).toBeNull();
    expect(partsText(registry)).toBeNull();
  });

  it('fuses three of a rune into one of the next tier, for scrap', () => {
    s().setProfile({ ...s().profile, scrap: 20, runes: { split: [3, 0, 0, 0, 0] } });
    expect(s().fuseRunes(split).ok).toBe(true);
    expect(s().profile).toMatchObject({ scrap: 0, runes: { split: [0, 1, 0, 0, 0] } });
    expect(s().fuseRunes(split).ok).toBe(false);
  });

  it('keeps the runes found this dive, newest first, until the next dive', () => {
    s().pushDiveRunes([split, quick]);
    expect(s().diveRunes).toEqual([quick, split]);
    s().startDive(1);
    expect(s().diveRunes).toEqual([]);
  });
});

describe("delveStore: the floor's finds", () => {
  beforeEach(() => {
    localStorage.clear();
    s().resetProfile(1234, 'fire');
  });

  /** The dive's state as a bank, a clear or a door leaves it. */
  const at = (phase: 'fighting' | 'choosing', depth: number) =>
    s().setProfile({ ...s().profile, dive: { ...s().profile.dive!, phase, depth } });
  const floorDrops = () => s().diveDrops.slice(0, s().diveDrops.length - s().floorDropsFrom);

  it("marks where each floor begins in the dive's drops and runes", () => {
    s().pushDiveDrops(['before']);
    expect(s().startDive(1)).toBe(true);
    expect(s()).toMatchObject({ floorDropsFrom: 0, floorRunesFrom: 0 });
    s().pushDiveDrops(['a', 'b']);
    s().pushDiveRunes([{ id: 'split', tier: 1 }]);
    at('fighting', 1);
    at('choosing', 1);
    expect(s()).toMatchObject({ floorDropsFrom: 0, floorRunesFrom: 0 });
    at('fighting', 2);
    expect(s()).toMatchObject({ floorDropsFrom: 2, floorRunesFrom: 1 });
    s().pushDiveDrops(['c']);
    expect(floorDrops()).toEqual(['c']);
    s().closeDive();
    expect(s().startDive(1)).toBe(true);
    expect(s()).toMatchObject({ floorDropsFrom: 0, floorRunesFrom: 0 });
  });

  it('keeps the mark on its floor as the oldest drops fall off', () => {
    s().startDive(1);
    s().pushDiveDrops(Array.from({ length: 50 }, (_, i) => `a${i}`));
    at('choosing', 1);
    at('fighting', 2);
    s().pushDiveDrops(Array.from({ length: 15 }, (_, i) => `b${i}`));
    expect(s().diveDrops).toHaveLength(60);
    expect(floorDrops()).toEqual(Array.from({ length: 15 }, (_, i) => `b${14 - i}`));
  });
});
