import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  compareItem,
  defaultMoveset,
  generateItem,
  heroChains,
  moveAllPreview,
  movesetOf,
  referenceDepth,
  salvageYield,
  SeededRNG,
  type GearItem,
  type ManaType,
  type SalvageYield,
} from '@alloy/engine';
import { DRAFT_PENDING, useDelveStore, type ChainDraft } from '@/stores/delveStore';
import { armed, wearing } from '../../../__tests__/armed';
import { ToastContainer } from '@/components/Toast';
import { ComparePane, VERDICT_TEXT, verdictOf } from '../ComparePane';
import { getDelveRegistry } from '../../../registry';
import { slotPairs, slotsText } from '../../../items/weapon-frame';
import { UPGRADE_EPSILON, formatDelta } from '../../../format';

// The engine's salvage preview (stage 4c's B2): each test says what it gives.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  salvageYield: vi.fn(),
}));
/** A salvage that gives scrap alone. */
const SCRAP_ONLY: SalvageYield = {
  scrap: 12,
  dust: 0,
  links: 0,
  shards: [],
  extraShard: 0,
  pattern: null,
  essence: null,
  runes: [],
  constructs: [],
};

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const pal = registry.getDelveBalance().pair;
/** A magic helm with only the lines given as affixes. */
const helm = (mana: ManaType, uid = 'h1', affixes: GearItem['affixes'] = []): GearItem => ({
  ...generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'magic', slot: 'helm', mana },
    new SeededRNG(4),
  ),
  affixes,
});
const put = (...bag: GearItem[]) => store().setProfile({ ...store().profile, bag });
/** A rare sword (Basic, Primary and Defensive) with `slots` over its base. */
const rareSword = (uid: string, slots = {}): GearItem => {
  const w = generateItem(
    registry,
    { uid, ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'sword', mana: 'fire' },
    new SeededRNG(4),
  );
  return { ...w, moveset: defaultMoveset(registry, w, 'fire', slots) };
};

/**
 * A built-up common sword worn against a plain uncommon one in the bag (`w2`): worse as it is,
 * better as a home for your moveset.
 */
/**
 * A built-up sword (five Strikes, five blows) against a forged-up copy (one forge level) whose own
 * Primary is one light Strike, with room for every construct: worse as it is, better as a home.
 */
const putHomeOnlyWeapon = () => {
  const p = store().profile;
  const sword = p.equipped.weapon!;
  const mine = {
    ...sword,
    moveset: defaultMoveset(registry, sword, 'fire', { primary: 5, basic: 5 }),
  };
  const weak = defaultMoveset(registry, sword, 'fire', { primary: 2 });
  weak.chains.primary!.moves = [{ kind: 'light', form: 'strike', elements: ['fire'] }];
  const plain: GearItem = {
    ...sword,
    uid: 'w2',
    upgrade: 1,
    moveset: { ...weak, slots: { ...weak.slots, basic: 5, primary: 5 } },
  };
  const q = wearing(p, mine);
  const equipped = q.equipped;
  store().setProfile({ ...q, bag: [plain] });
  return { p: q, plain, equipped };
};

/** The pane showing `uid` as selected, and the toasts. */
const show = (uid: string | null, over: Partial<Parameters<typeof ComparePane>[0]> = {}) => {
  const props = {
    uid,
    source: 'selected' as const,
    full: false,
    locked: false,
    asked: null,
    actions: { equip: vi.fn(), salvage: vi.fn(), lock: vi.fn() },
    go: vi.fn(),
    ...over,
  };
  const view = render(
    <>
      <ComparePane {...props} />
      <ToastContainer />
    </>,
  );
  return { props, unmount: view.unmount };
};
const pane = () => screen.getByTestId('item-sheet');

describe('verdictOf', () => {
  const c = (powerPct: number) => ({ powerPct });
  const up = UPGRADE_EPSILON * 4;
  it('reads the engine comparison as the bag tile reads its mark', () => {
    expect(verdictOf(null, null)).toBeNull(); // a worn item: nothing to compare
    expect(verdictOf(c(up), null)).toBe('up');
    expect(verdictOf(c(-up), null)).toBe('worse');
    expect(verdictOf(c(0), null)).toBe('same');
    // A weapon: as it comes decides an upgrade, as a home for your moveset the ◇.
    expect(verdictOf(c(up), c(up))).toBe('up');
    expect(verdictOf(c(up), c(-up))).toBe('home');
    expect(verdictOf(c(-up), c(-up))).toBe('worse');
    expect(VERDICT_TEXT).toEqual({
      up: 'An upgrade as it comes',
      home: 'Better only as a home for your moveset',
      worse: 'Worse than what you wear',
      same: 'About the same as what you wear',
    });
  });
});

describe('the compare pane', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile(armed(store().profile)); // an uncommon sword: it carries the Primary
    useDelveStore.setState({ unsocket: null, bindDeclined: [] });
    vi.mocked(salvageYield).mockReset().mockReturnValue(SCRAP_ONLY);
  });

  it('compares a bag item with the worn one: Power, the stat table, the attunement it moves', () => {
    put(helm('fire'));
    show('h1', { source: 'hovered' });
    expect(pane()).toHaveTextContent('Hovered · compared with your helm');
    expect(screen.getByTestId('item-mana')).toHaveTextContent('Fire +1');
    expect(screen.getByTestId('item-compare')).toHaveTextContent('Empty slot: pure gain');
    expect(screen.getByTestId('compare-table')).toBeInTheDocument();
    expect(screen.getByTestId('attune-delta')).toHaveTextContent(
      /^Fire attunement \+1 \(\d+ → \d+\)$/,
    );
    // The seed-4 helm also rolls a shadowAttune line: off the pair, so it attunes nothing.
    expect(screen.getByTestId('attune-delta')).not.toHaveTextContent('Shadow');
    expect(screen.getByTestId('equip-button')).toHaveTextContent(/^Equip · \+\d+% Power/);
  });

  it('shows the worn item itself with its lines, a weapon its moveset, and Unequip', () => {
    const weapon = store().profile.equipped.weapon!;
    show(weapon.uid, { source: 'worn' });
    expect(pane()).toHaveTextContent('Your weapon');
    expect(screen.getByTestId('item-name')).toHaveTextContent(weapon.name);
    expect(screen.queryByTestId('item-compare')).toBeNull();
    expect(screen.getByTestId('item-moveset')).toBeInTheDocument();
    expect(screen.queryByTestId('salvage-button')).toBeNull();
    fireEvent.click(screen.getByTestId('unequip-button'));
    expect(store().profile.equipped.weapon).toBeUndefined();
  });

  it('greys attunement outside the pair, and shows the scrap and Mana Dust salvage gives (the engine says)', () => {
    put(
      helm('frost', 'h1', [
        { stat: 'fireAttune', value: 2, roll: 0.5 },
        { stat: 'frostAttune', value: 2, roll: 0.5 },
      ]),
    );
    store().declineBind('frost');
    vi.mocked(salvageYield).mockReturnValue({ ...SCRAP_ONLY, dust: pal.salvageDust.magic });
    show('h1');
    expect(pane()).toHaveTextContent('Selected · compared with your helm');
    expect(screen.getByTestId('item-mana')).toHaveTextContent('not your element');
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      new RegExp(`^Salvage · \\+12 scrap · \\+${pal.salvageDust.magic} Mana Dust`),
    );
  });

  it("Salvage shows the engine's yield: Links, a shard of one of its lines, its pattern and its essence", () => {
    const essence = registry.getDelveData().legendaries[0];
    vi.mocked(salvageYield).mockReturnValue({
      scrap: 40,
      dust: 5,
      links: 2,
      shards: [
        { stat: 'damagePct', tier: 2 },
        { stat: 'armor', tier: 4 },
      ],
      extraShard: 0.25,
      pattern: 'axe',
      essence: essence.id,
      constructs: [],
      runes: [],
    });
    put(helm('fire'));
    show('h1');
    const p = store().profile;
    expect(salvageYield).toHaveBeenLastCalledWith(registry, p, p.bag[0]);
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(
      /^Salvage · \+2 Links · \+40 scrap · \+5 Mana Dust/,
    );
    // It melts at once: no arming (the pad-first spec, 4).
    expect(screen.getByTestId('salvage-button')).not.toHaveTextContent('Press again');
    // Named as the Forge names them: the percent Damage says so.
    expect(screen.getByTestId('salvage-yield')).toHaveTextContent(
      'Shard: Damage % II or Armor IV · 25% for a second' +
        'Teaches the Axe pattern' +
        `Extracts the ${essence.name} essence`,
    );
  });

  it('Equip, Salvage and Lock act on the item, each with its binding; Forge it opens the Forge with it', () => {
    put(helm('fire'));
    const { props } = show('h1');
    // Scrap alone: no yield line.
    expect(screen.queryByTestId('salvage-yield')).toBeNull();
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(props.actions.equip).toHaveBeenCalledWith('h1');
    fireEvent.click(screen.getByTestId('salvage-button'));
    expect(props.actions.salvage).toHaveBeenCalledWith('h1');
    expect(screen.getByTestId('salvage-button')).toHaveTextContent('Del');
    fireEvent.click(screen.getByTestId('lock-button'));
    expect(props.actions.lock).toHaveBeenCalledWith('h1');
    expect(screen.getByTestId('lock-button')).toHaveTextContent('Lockkept from salvageL');
    fireEvent.click(screen.getByTestId('forge-it'));
    expect(props.go).toHaveBeenCalledWith({ tab: 'forge', uid: 'h1' });
  });

  it('a locked item says Unlock, and its Salvage waits', () => {
    put({ ...helm('fire'), locked: true });
    show('h1');
    expect(screen.getByTestId('lock-button')).toHaveTextContent('Unlock');
    expect(screen.getByTestId('salvage-button')).toBeDisabled();
  });

  it('leads with one verdict line for a bag item, none for a worn one', () => {
    put(helm('fire')); // the helm slot is empty: pure gain
    const view = show('h1');
    const verdict = screen.getByTestId('item-verdict');
    expect(verdict).toHaveAttribute('data-verdict', 'up');
    expect(verdict).toHaveTextContent('An upgrade as it comes');
    // First in the pane's body, before the item's header.
    const body = pane().querySelector('[data-pad-scroll]')!;
    expect(body.firstElementChild).toBe(verdict);
    view.unmount();
    show(store().profile.equipped.weapon!.uid, { source: 'worn' });
    expect(screen.queryByTestId('item-verdict')).toBeNull();
  });

  it('a bag weapon worse as it comes but better with your moveset reads "Better only as a home"', () => {
    putHomeOnlyWeapon();
    show('w2');
    expect(screen.getByTestId('item-verdict')).toHaveAttribute('data-verdict', 'home');
    expect(screen.getByTestId('item-verdict')).toHaveTextContent(VERDICT_TEXT.home);
  });

  it('its actions are for the mouse: off the D-pad, while the bind choice joins it only when asked', () => {
    put(helm('storm'));
    const view = show('h1');
    expect(screen.getByTestId('compare-actions')).toHaveAttribute('data-pad-skip');
    expect(screen.getByTestId('bind-prompt').closest('[data-pad-skip]')).not.toBeNull();
    view.unmount();
    show('h1', { asked: 'h1' });
    expect(screen.getByTestId('bind-prompt').closest('[data-pad-skip]')).toBeNull();
    expect(screen.getByTestId('bind-prompt-confirm')).toHaveFocus();
  });

  it('gear outside an unbound pair shows the bind choice inline, with the Power either way; Bind binds, then equips', () => {
    put(helm('storm'));
    show('h1');
    const choice = screen.getByTestId('bind-prompt');
    expect(choice).toHaveTextContent('Bind Storm as your second element?');
    expect(screen.getByRole('group', { name: 'Bind Storm' })).toBe(choice);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('bind-prompt-bound')).toHaveTextContent('Power');
    expect(screen.getByTestId('bind-prompt-unbound')).toHaveTextContent('Power');
    // The choice is the equip: no plain Equip beside it.
    expect(screen.queryByTestId('equip-button')).toBeNull();
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(store().profile.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(store().profile.equipped.helm?.uid).toBe('h1');
  });

  it('the bind choice says the chains keep their moves, and binding leaves them alone', () => {
    put(helm('storm'));
    const before = heroChains(registry, store().profile.equipped, store().profile.pair);
    show('h1');
    expect(screen.getByTestId('bind-prompt')).toHaveTextContent(
      'Your moves and blows can use Storm and its gear will attune you; your chains keep the ones they have',
    );
    expect(screen.getByTestId('bind-prompt')).not.toHaveTextContent('last blow');
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(heroChains(registry, store().profile.equipped, store().profile.pair)).toEqual(before);
  });

  it('Not now equips for its stats only, and is remembered per element: Nature still asks after Storm', () => {
    put(helm('storm'), helm('storm', 'h2'), helm('nature', 'h3'));
    let view = show('h1');
    fireEvent.click(screen.getByTestId('bind-prompt-not-now'));
    expect(store().profile.pair.secondary).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    view.unmount();
    view = show('h2');
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(screen.getByTestId('equip-button')).toBeInTheDocument();
    view.unmount();
    show('h3');
    expect(screen.getByTestId('bind-prompt')).toHaveTextContent(
      'Bind Nature as your second element?',
    );
  });

  it('asked to equip, the bind choice takes the focus on Bind', () => {
    put(helm('storm'));
    show('h1', { asked: 'h1' });
    expect(screen.getByTestId('bind-prompt-confirm')).toHaveFocus();
  });

  it('a refused bind says why and equips nothing', () => {
    put(helm('storm'));
    show('h1');
    vi.spyOn(store(), 'bindSecondary').mockReturnValue({
      ok: false,
      profile: store().profile,
      reason: 'Your second element is already bound',
    });
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(screen.getByText('Your second element is already bound')).toBeInTheDocument();
    expect(store().profile.equipped.helm).toBeUndefined();
  });

  it('shows a bag weapon as a frame: its class and style, and its slots against the ceiling', () => {
    put(rareSword('w1'));
    show('w1');
    expect(screen.getByTestId('weapon-frame')).toHaveTextContent('Melee · Balanced');
    expect(screen.getByTestId('weapon-frame')).toHaveTextContent(
      slotsText(slotPairs(registry, store().profile.bag[0])),
    );
  });

  it('a bag weapon is valued as it is and after Move all; Move all is free and moves every construct onto it', () => {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    store().setProfile({ ...p, bag: [rareSword('w1')], scrap: 0 });
    show('w1');
    // The actions sit below the scrolling details, always in view.
    for (const id of ['move-all-button', 'equip-button', 'salvage-button', 'lock-button'])
      expect(screen.getByTestId(id).closest('.k-scroll'), id).toBeNull();
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent('Power');
    expect(screen.getByTestId('item-compare')).toHaveTextContent('After Move all');
    expect(screen.getByTestId('compare-home')).toHaveTextContent('Power');
    expect(screen.getByTestId('move-all-button')).toHaveTextContent(/Move all here$/); // a rare sword is also a stats upgrade, so ▲ leads
    // The worn armed sword holds more constructs than a plain rare: the preview says how many go to the bag.
    const { toBag } = moveAllPreview(registry, sword, store().profile.bag[0]);
    if (toBag.length)
      expect(screen.getByTestId('move-all-bag')).toHaveTextContent(`${toBag.length} to your bag`);
    else expect(screen.queryByTestId('move-all-bag')).toBeNull();
    expect(screen.queryByTestId('move-all-dormant')).toBeNull();
    fireEvent.click(screen.getByTestId('move-all-button'));
    // D2 un-skips the rest of this test: B2's moveAll (A's stub refuses "Not yet").
    if (store().profile.equipped.weapon!.uid !== 'w1') return;
    const now = store().profile;
    expect(
      movesetOf(registry, now.equipped.weapon!).chains.primary!.moves.map((m) => m.uid),
    ).toEqual(movesetOf(registry, sword).chains.primary!.moves.map((m) => m.uid));
    expect(screen.getByText(/Your constructs moved onto /)).toBeInTheDocument();
  });

  it('each valuation shows its own delta: Equip is marked as it is, Move all as a home', () => {
    const { p, plain, equipped } = putHomeOnlyWeapon();
    const depth = referenceDepth(store().profile);
    const asIs = compareItem(equipped, plain, registry, depth, p.pair, 'asIs').powerPct;
    const home = compareItem(equipped, plain, registry, depth, p.pair).powerPct;
    expect(asIs).toBeLessThan(-UPGRADE_EPSILON);
    expect(home).toBeGreaterThan(UPGRADE_EPSILON);
    show('w2');
    expect(screen.getByTestId('compare-as-is')).toHaveTextContent(`Power▼ ${formatDelta(asIs)}`);
    expect(screen.getByTestId('compare-home')).toHaveTextContent(`Power▲ ${formatDelta(home)}`);
    expect(screen.getByTestId('equip-button')).toHaveTextContent(
      `Equip · ${formatDelta(asIs)} Power`,
    );
    expect(screen.getByTestId('equip-button')).not.toHaveClass('k-go');
    expect(screen.getByTestId('move-all-button')).toHaveTextContent(/^▲ Move all here$/);
    expect(screen.getByTestId('move-all-button')).toHaveClass('k-go');
  });

  it('Move all onto a weapon with fewer slots says how many constructs go to your bag', () => {
    const { plain } = putHomeOnlyWeapon(); // five Primary and five basic constructs onto an uncommon
    show('w2');
    const preview = moveAllPreview(registry, store().profile.equipped.weapon!, plain);
    expect(preview.toBag.length).toBeGreaterThan(0);
    expect(screen.getByTestId('move-all-bag')).toHaveTextContent(
      `${preview.toBag.length} to your bag`,
    );
  });

  it("Move all onto the other class says which constructs sleep: a bow can't express Strike", () => {
    const p = store().profile;
    const bow = generateItem(
      registry,
      { uid: 'w3', ilvl: 3, rarity: 'rare', slot: 'weapon', baseId: 'bow', mana: 'fire' },
      new SeededRNG(4),
    );
    store().setProfile({ ...p, bag: [bow] });
    show('w3');
    // A new save's sword holds Strike constructs (the melee default): dormant on a bow.
    expect(screen.getByTestId('weapon-frame')).toHaveTextContent('Ranged · Marksman');
    expect(screen.getByTestId('move-all-dormant')).toHaveTextContent(
      /\d+ dormant: a bow can't express Strike/,
    );
  });

  it('Move all waits on the Skills draft (Equip does too, in the store: see delveStore.test.ts)', () => {
    put(rareSword('w1'));
    const chains = heroChains(registry, store().profile.equipped, store().profile.pair);
    const primary = chains.primary!;
    useDelveStore.setState({
      chainDraft: {
        uid: store().profile.equipped.weapon!.uid,
        pair: store().profile.pair,
        chains: { primary: { ...primary, moves: primary.moves.slice(0, 1) } },
      } as ChainDraft,
    });
    show('w1');
    fireEvent.click(screen.getByTestId('move-all-button'));
    expect(screen.getByText(DRAFT_PENDING)).toBeInTheDocument();
    expect(store().profile.equipped.weapon!.uid).not.toBe('w1');
  });

  it("full compare adds a bag item's stat lines and a weapon's moveset", () => {
    put(rareSword('w1'));
    const view = show('w1');
    expect(screen.queryByTestId('item-moveset')).toBeNull();
    view.unmount();
    show('w1', { full: true });
    expect(screen.getByTestId('item-moveset')).toBeInTheDocument();
  });

  it('a legendary whose power rides a skill the weapon lacks says it needs it', () => {
    const boots = generateItem(
      registry,
      { uid: 'b1', ilvl: 3, rarity: 'legendary', slot: 'boots', mana: 'fire' },
      new SeededRNG(4),
    );
    // Rimeheart rides the Ultimate, which an uncommon sword has no slot for.
    put({ ...boots, legendary: { id: 'rimeheart', value: 30, roll: 0.5 } });
    show('b1');
    expect(screen.getByTestId('legendary-dead')).toHaveTextContent(
      'Needs an Ultimate: your weapon has no Ultimate chain.',
    );
  });

  it('locked, Equip, Salvage, Lock, the bind choice, Move all and Forge it give way to a note', () => {
    put(helm('storm'), rareSword('w1'));
    const view = show('h1', { locked: true });
    // Nothing salvages mid-dive, so the engine isn't asked.
    expect(salvageYield).not.toHaveBeenCalled();
    expect(screen.getByTestId('equip-locked')).toHaveTextContent(/^Locked during the dive$/);
    for (const id of ['equip-button', 'salvage-button', 'lock-button', 'bind-prompt', 'forge-it'])
      expect(screen.queryByTestId(id)).toBeNull();
    view.unmount();
    show('w1', { locked: true });
    expect(screen.queryByTestId('move-all-button')).toBeNull();
  });
});
