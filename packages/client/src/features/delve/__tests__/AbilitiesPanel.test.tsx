import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import {
  computeHeroStats,
  defaultChains,
  defaultMoveset,
  heroChains,
  pouchCount,
  socketsOf,
  type Chains,
  type ChainSkill,
  type Move,
  type MoveKind,
  type RuneRef,
  type RunePouch,
} from '@alloy/engine';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { ChainEditor } from '../chains/ChainEditor';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
/** The hero's chains, as its equipped weapon carries them. */
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const apply = () => fireEvent.click(screen.getByTestId('chain-apply'));

/**
 * The starting sword made epic (it carries all four skills), every chain at
 * `slots` slots, holding its default moves (the Primary 4, the basic chain the
 * sword's 3, the others 1), or `chains` over them.
 */
function roomy(slots = 5, over: Partial<Chains> = {}) {
  const p = store().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const lengths = { basic: 3, primary: 4, defensive: 1, ultimate: 1 };
  const moveset = defaultMoveset(registry, weapon, 'fire', lengths);
  const all: Record<ChainSkill, number> = {
    basic: slots,
    primary: slots,
    defensive: slots,
    ultimate: slots,
  };
  store().setProfile({
    ...p,
    equipped: {
      ...p.equipped,
      weapon: { ...weapon, moveset: { chains: { ...moveset.chains, ...over }, slots: all } },
    },
  });
}

describe('AbilitiesPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("lists the four skills, Basic first, and names the chosen skill's chain", () => {
    roomy();
    render(<AbilitiesPanel />);
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('data-testid'))).toEqual([
      'chain-skill-basic',
      'chain-skill-primary',
      'chain-skill-defensive',
      'chain-skill-ultimate',
    ]);
    expect(screen.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire Bolt · medium Fire Bolt · medium Fire Bolt · heavy Fire Bolt',
    );
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(4);
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire blow · light Fire blow · heavy Fire blow',
    );
    expect(screen.queryByTestId('form-bolt')).toBeNull(); // a blow has no form
    expect(screen.queryByText('Quick and cheap.')).toBeNull(); // nor a cost
  });

  it("a new hero's common sword carries Basic and a one-move Primary; the others show locked", () => {
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('attune-fire')).toHaveAttribute('data-value', '2');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('1 of 1');
    expect(screen.queryByTestId('move-add')).toBeNull(); // the Primary's one slot holds its move
    expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
    expect(screen.getByTestId('chain-skill-defensive')).toHaveTextContent('🔒');
    expect(screen.getByTestId('chain-skill-defensive')).toHaveTextContent('Locked');
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'Carried by magic weapons and better',
    );
    expect(screen.queryByTestId('move-0')).toBeNull();
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.queryByTestId('add-slot')).toBeNull();
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'Carried by epic weapons and better',
    );
  });

  it('unarmed, the default chains show at their base slots', () => {
    store().unequip('weapon');
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('1 of 1');
    expect(screen.getByTestId('chain-skill-defensive')).toHaveTextContent('Locked');
  });

  it('edits a draft: Apply commits it, free before the first dive, and Revert drops it', () => {
    roomy();
    render(<AbilitiesPanel />);
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
    expect(chains().primary.moves[0].form).toBe('bolt'); // not yet
    expect(screen.getByTestId('chain-price')).toHaveTextContent('free until your first dive');
    fireEvent.click(screen.getByTestId('chain-revert'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Bolt');
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('chain-apply')).toHaveTextContent(/^Apply$/); // free: no price
    apply();
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    expect(store().profile.manaDust).toBe(0);
  });

  it('keeps the draft when the tab closes; a dive starts only once it is discarded', () => {
    roomy();
    const { unmount } = render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('form-lance'));
    unmount();
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
    expect(screen.getByTestId('chain-draft')).toBeInTheDocument();
    expect(store().startDive(1)).toBe(false);
    expect(screen.getByTestId('chain-draft')).toBeInTheDocument();
    act(() => {
      store().revertDraft();
      store().startDive(1);
    });
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    expect(chains().primary.moves[0].form).toBe('bolt');
  });

  it('Apply is off while the engine would refuse the draft, and says why; the draft stays', () => {
    roomy();
    render(<AbilitiesPanel />);
    // A storm move the pair (Fire alone) doesn't hold: the engine refuses it.
    const storm: Move = { kind: 'medium', form: 'bolt', elements: ['storm'] };
    act(() => store().editDraft('primary', { moves: [storm], payment: 'mana' }));
    const button = screen.getByTestId('chain-apply');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('chain-apply-why')).toHaveTextContent('Pick from your two elements');
    expect(button).toHaveAttribute('aria-describedby', screen.getByTestId('chain-apply-why').id);
    apply();
    expect(screen.getByTestId('chain-draft')).toBeInTheDocument();
    // Back in the pair, it goes through.
    act(() =>
      store().editDraft('primary', { moves: [{ ...storm, elements: ['fire'] }], payment: 'mana' }),
    );
    expect(screen.queryByTestId('chain-apply-why')).toBeNull();
    apply();
    expect(chains().primary.moves).toEqual([{ ...storm, elements: ['fire'] }]);
  });

  it('Add slot waits while its chain has a change pending; an edit undone by hand leaves none', () => {
    store().setProfile({ ...store().profile, links: 1, scrap: 25 });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('add-slot')).toBeDisabled();
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent(
      'Apply or revert this chain first',
    );
    fireEvent.click(screen.getByTestId('form-bolt')); // back as it was
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    expect(store().chainDraft?.chains.primary).toBeUndefined();
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 2/5');
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    // A chain's edit made on fewer slots goes when a slot is added to it (the store's rule).
    const primary = chains().primary;
    act(() => {
      store().setProfile({ ...store().profile, links: 2, scrap: 40 });
      store().editDraft('primary', {
        ...primary,
        moves: [{ ...primary.moves[0], form: 'lance' }, primary.moves[1]],
      });
      expect(store().addSlot('primary').ok).toBe(true);
    });
    expect(store().chainDraft?.chains.primary).toBeUndefined();
  });

  it('equipping another weapon, or a realign, drops the draft', () => {
    roomy();
    const p = store().profile;
    const sword = p.equipped.weapon!;
    store().setProfile({ ...p, bag: [{ ...sword, uid: 'spare' }] });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('form-lance'));
    act(() => store().equip('spare'));
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    act(() => store().equip(sword.uid));
    expect(screen.queryByTestId('chain-draft')).toBeNull(); // gone, not waiting on the sword
    // A realign re-maps the moves the draft was made on.
    act(() => {
      store().bindSecondary('storm');
      store().setProfile({ ...store().profile, manaDust: 500, scrap: 500 });
    });
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.getByTestId('chain-draft')).toBeInTheDocument();
    act(() => {
      expect(store().realign({ primary: 'frost' }).ok).toBe(true);
    });
    expect(screen.queryByTestId('chain-draft')).toBeNull();
    expect(chains().primary.moves[0]).toMatchObject({ form: 'bolt', elements: ['frost'] });
  });

  it('after the first dive the draft shows its price in Mana Dust, and Apply pays it', () => {
    roomy();
    const p = store().profile;
    store().setProfile({ ...p, stats: { ...p.stats, dives: 1 }, manaDust: 4 });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('form-lance')); // a changed form: editDust
    expect(screen.getByTestId('chain-price')).toHaveTextContent('✦ 5 Mana Dust (you have ✦ 4)');
    expect(screen.getByTestId('chain-apply')).toBeDisabled();
    expect(screen.getByTestId('chain-apply-why')).toHaveTextContent('Not enough Mana Dust');
    act(() => store().setProfile({ ...store().profile, manaDust: 20 }));
    fireEvent.click(screen.getByTestId('kind-heavy'));
    // Still one move changed: its kind and form together cost editDust once.
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · ✦ 5');
    apply();
    expect(chains().primary.moves[0]).toEqual({ kind: 'heavy', form: 'lance', elements: ['fire'] });
    expect(store().profile.manaDust).toBe(15);
  });

  it('edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap', () => {
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'nature' } });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('move-1'));
    fireEvent.click(screen.getByTestId('form-burst'));
    fireEvent.click(screen.getByTestId('infusion-nature'));
    apply();
    expect(chains().primary.moves[1]).toEqual({
      kind: 'medium',
      form: 'burst',
      elements: ['fire', 'nature'],
    });
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('medium Wildfire Burst');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire Bolt · medium Wildfire Burst',
    );
    expect(screen.getByTestId('element-effect')).toHaveTextContent('Wildfire');
    fireEvent.click(screen.getByTestId('swap-elements'));
    apply();
    expect(chains().primary.moves[1].elements).toEqual(['nature', 'fire']);
    fireEvent.click(screen.getByTestId('infusion-none'));
    apply();
    expect(chains().primary.moves[1].elements).toEqual(['nature']);
  });

  it("sets a move's kind, and the chain's one payment with its wind-up", () => {
    roomy();
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(screen.getByTestId('ability-readout')).toHaveTextContent(/Fully charged .+ \d+ mana/);
    fireEvent.click(screen.getByTestId('payment-charge'));
    expect(screen.getByTestId('ability-readout')).toHaveTextContent(/Fully charged .+ Charge \d+/);
    fireEvent.click(screen.getByTestId('kind-heavy'));
    for (const payment of ['cast', 'mana', 'charge'] as const) {
      fireEvent.click(screen.getByTestId(`payment-${payment}`));
      expect(screen.getByTestId('ability-readout')).toHaveTextContent(/\d\.\d\ds wind-up/);
    }
    apply();
    expect(chains().primary.payment).toBe('charge');
    expect(chains().primary.moves[0].kind).toBe('heavy');
  });

  it("says each move's beat, and a hold's full-charge time and beat, by the weapon's tempo", () => {
    roomy();
    const readout = () => screen.getByTestId('ability-readout');
    const { unmount } = render(<AbilitiesPanel />);
    // The Primary's first move, a light Bolt, on the starting sword (tempo 1).
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.25s beat/);
    fireEvent.click(screen.getByTestId('kind-hold'));
    // A tap plays as a medium; a full charge as a hold.
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.4s beat/);
    expect(readout()).toHaveTextContent(/Fully charged \(1s\): .+ mana, then a 0\.8s beat/);
    unmount();
    store().revertDraft(); // the draft outlives the panel
    // On a maul (tempo 1.3), the charge and every beat take longer.
    const p = store().profile;
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: { ...p.equipped.weapon!, baseId: 'maul' } },
    });
    render(<AbilitiesPanel />);
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.33s beat/);
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(readout()).toHaveTextContent(/cooldown, then a 0\.52s beat/);
    expect(readout()).toHaveTextContent(/Fully charged \(1\.3s\): .+ mana, then a 1\.04s beat/);
  });

  it('adds, reorders and removes moves within the slots, never below one', () => {
    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
    roomy(5, { primary: { moves: [bolt], payment: 'mana' } });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('move-remove-0')).toBeDisabled();
    expect(screen.getByTestId('move-remove-0')).toHaveAccessibleName('Remove light Fire Bolt');
    fireEvent.click(screen.getByTestId('move-add'));
    expect(document.activeElement).toBe(screen.getByTestId('move-1')); // the new card
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('move-add'));
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(5);
    expect(screen.queryByTestId('move-add')).toBeNull(); // every slot used
    expect(document.activeElement).toBe(screen.getByTestId('move-4'));
    // The new move is picked: make it heavy, then bring it forward.
    fireEvent.click(screen.getByTestId('kind-heavy'));
    fireEvent.click(screen.getByTestId('move-left-4'));
    fireEvent.click(screen.getByTestId('move-remove-0'));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('move-2')); // the heavy, still picked
    apply();
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'light', 'heavy', 'light']);
  });

  it('▸ moves a card later and the selection follows it; the ends are off', () => {
    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
    roomy(5, {
      primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
    });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('move-left-0')).toBeDisabled();
    expect(screen.getByTestId('move-right-2')).toBeDisabled();
    fireEvent.click(screen.getByTestId('move-right-0'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'medium Fire Bolt · light Fire Bolt · heavy Fire Bolt',
    );
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('light Fire Bolt');
    expect(document.activeElement).toBe(screen.getByTestId('move-right-1'));
  });

  it('two ◂ presses move a card two places, the selection and the focus with it', () => {
    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
    roomy(5, {
      primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
    });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('move-left-2'));
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('move-left-1'));
    fireEvent.click(document.activeElement!);
    expect(screen.getByTestId('move-0')).toHaveAttribute('aria-pressed', 'true');
    // At the front its ◂ is off: the card itself keeps the focus.
    expect(document.activeElement).toBe(screen.getByTestId('move-0'));
    apply();
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light', 'medium']);
  });

  it("shows each chain's slots, and Add slot's price in Links and scrap", () => {
    render(<AbilitiesPanel />);
    expect(screen.queryByTestId('move-add')).toBeNull(); // the Primary's one slot is used
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 1/5');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Add slot · 🔗 1 · ⚙ 20');
    expect(screen.getByTestId('add-slot')).toBeDisabled(); // no Links yet
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough Links');
    expect(screen.getByTestId('add-slot')).toHaveAttribute(
      'aria-describedby',
      screen.getByTestId('add-slot-why').id,
    );
    act(() => store().setProfile({ ...store().profile, links: 1 }));
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough scrap');
    act(() => store().setProfile({ ...store().profile, links: 1, scrap: 25 }));
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(store().profile).toMatchObject({ links: 0, scrap: 5 });
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 2/5');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('2 of 2');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('🔗 2 · ⚙ 40');
    // The sword's basic chain starts at its string's 3 slots: its 4th costs 3 Links.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 3/5');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('🔗 3 · ⚙ 60');
  });

  it('marks a move outside the pair off-pair, and never offers its element to another', () => {
    const storm: Move = { kind: 'medium', form: 'bolt', elements: ['storm'] };
    const fire: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
    roomy(5, { primary: { moves: [storm, fire], payment: 'mana' } });
    render(<AbilitiesPanel />);
    expect(screen.getAllByTestId('card-off-pair')).toHaveLength(1);
    expect(screen.getByTestId('move-0')).toHaveAccessibleName('medium Storm Bolt, off-pair');
    expect(screen.getByTestId('element-storm')).toHaveTextContent('Storm · off-pair');
    expect(screen.getByTestId('element-storm')).toHaveAttribute('aria-pressed', 'true');
    // It keeps Storm, alone or infused, but takes no new off-pair set (Apply would refuse it).
    expect(screen.getByTestId('element-storm')).toBeEnabled();
    expect(screen.getByTestId('infusion-fire')).toBeDisabled();
    expect(screen.getByTestId('element-fire')).toBeEnabled();
    expect(screen.getByTestId('off-pair-note')).toHaveTextContent('Storm off-pair: no attunement');
    fireEvent.click(screen.getByTestId('move-1'));
    expect(screen.queryByTestId('element-storm')).toBeNull();
    expect(screen.queryByTestId('infusion-storm')).toBeNull();
    // A copy of the off-pair move takes the pair's element instead.
    fireEvent.click(screen.getByTestId('move-0'));
    fireEvent.click(screen.getByTestId('move-add'));
    apply();
    expect(chains().primary.moves[2].elements).toEqual(['fire']);
  });

  it('each ability offers only its own forms; a blow picks from the pair', () => {
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    expect(screen.getByTestId('form-ward')).toBeInTheDocument();
    expect(screen.queryByTestId('form-bolt')).toBeNull();
    fireEvent.click(screen.getByTestId('form-armor'));
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    expect(screen.getByTestId('form-maelstrom')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getAllByTestId(/^element-/).map((c) => c.getAttribute('data-testid'))).toEqual([
      'element-fire',
      'element-storm',
    ]);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('element-storm'));
    apply();
    expect(chains().defensive.moves[0].form).toBe('armor');
    expect(chains().basic[2]).toEqual({ kind: 'heavy', element: 'storm' });
  });

  it('warns when a mana cost is bigger than the pool', () => {
    roomy();
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    fireEvent.click(screen.getByTestId('payment-mana'));
    fireEvent.click(screen.getByTestId('kind-heavy'));
    expect(screen.getByTestId('cost-warning')).toHaveTextContent('your pool holds');
  });

  it("warns when a hold move's full charge costs more than the pool", () => {
    roomy();
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    fireEvent.click(screen.getByTestId('payment-mana'));
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(screen.getByTestId('cost-warning')).toHaveTextContent(
      /^A full charge needs \d+ mana; your pool holds \d+\.$/,
    );
  });

  it('is read-only while a dive is under way', () => {
    roomy();
    store().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-locked')).toBeInTheDocument();
    expect(screen.getByTestId('form-lance')).toBeDisabled();
    expect(screen.getByTestId('move-add')).toBeDisabled();
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(screen.queryByTestId('chain-draft')).toBeNull();
  });

  it('mid-dive every move can still be picked and read, but not moved, removed or added', () => {
    roomy();
    store().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('move-2')).toBeEnabled();
    fireEvent.click(screen.getByTestId('move-2'));
    expect(screen.getByTestId('move-2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('medium Fire Bolt');
    for (const id of ['move-left-2', 'move-right-2', 'move-remove-2', 'move-add'])
      expect(screen.getByTestId(id), id).toBeDisabled();
  });

  it('unarmed, it shows the default chains read-only', () => {
    store().unequip('weapon');
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-locked')).toHaveTextContent(
      'Equip a weapon to build your moves.',
    );
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Bolt');
    expect(screen.getByTestId('form-lance')).toBeDisabled();
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('Slots 1/5');
    expect(screen.queryByTestId('add-slot')).toBeNull();
  });
});

const split = { id: 'split', tier: 1 } as const;

describe('AbilitiesPanel: sockets and runes', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
  });

  /**
   * The starting sword (common: one socket a move): its Primary Bolt's sockets `bolt` (none
   * open when null), its blows' sockets `blows`, and the pouch `pouch`.
   */
  function socketed(
    bolt: (RuneRef | null)[] | null,
    pouch: RunePouch = {},
    blows: ((RuneRef | null)[] | null)[] = [],
  ) {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const moveset = defaultMoveset(registry, sword, 'fire');
    const primary = moveset.chains.primary!;
    const chains = {
      ...moveset.chains,
      basic: moveset.chains.basic!.map((b, i) => (blows[i] ? { ...b, runes: blows[i] } : b)),
      primary: { ...primary, moves: primary.moves.map((m) => (bolt ? { ...m, runes: bolt } : m)) },
    };
    store().setProfile({
      ...p,
      runes: pouch,
      equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...moveset, chains } } },
    });
  }
  /** Tap socket `n` (1-based, by its name) under card `i`. */
  const tapSocket = (i: number, name: string) =>
    fireEvent.click(within(screen.getByTestId(`sockets-${i}`)).getByRole('button', { name }));
  const picker = () => within(screen.getByTestId('rune-picker'));

  it('+ socket opens one on the chosen move at its price; Apply pays the Links and scrap', () => {
    store().setProfile({ ...store().profile, links: 1, scrap: 20 });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 0/1');
    const open = screen.getByTestId('socket-open');
    expect(within(screen.getByTestId('chain-cards')).getByTestId('socket-open')).toBe(open);
    expect(open).toHaveTextContent('+ socket · 🔗 1 · ⚙ 20');
    fireEvent.click(open);
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 1/1');
    expect(screen.queryByTestId('socket-open')).toBeNull(); // a common weapon's cap
    expect(screen.getByTestId('chain-price')).toHaveTextContent(
      'Changes cost 🔗 1 Link (you have 🔗 1) and ⚙ 20 scrap (you have ⚙ 20)',
    );
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · 🔗 1 · ⚙ 20');
    apply();
    expect(chains().primary.moves[0].runes).toEqual([null]);
    expect(store().profile).toMatchObject({ links: 0, scrap: 0 });
  });

  it("a draft the engine won't price says why in place of a price, once", () => {
    socketed([null]);
    render(<AbilitiesPanel />);
    const primary = chains().primary;
    const moves = primary.moves.map((m) => ({ ...m, runes: [{ id: 'split', tier: 1 as const }] }));
    act(() => store().editDraft('primary', { ...primary, moves }));
    const price = screen.getByTestId('chain-price');
    expect(price).toHaveTextContent('Not enough runes in your pouch');
    expect(price).not.toHaveTextContent(/free/);
    expect(screen.getAllByText('Not enough runes in your pouch')).toHaveLength(1);
    const button = screen.getByTestId('chain-apply');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-describedby', price.id);
  });

  it("+ socket is off without the Links, saying why in the engine's words", () => {
    store().setProfile({ ...store().profile, links: 0, scrap: 20 });
    render(<AbilitiesPanel />);
    const open = screen.getByTestId('socket-open');
    expect(open).toBeDisabled();
    const why = document.getElementById(open.getAttribute('aria-describedby')!);
    expect(why).toHaveTextContent(/Links/);
  });

  it('an empty socket offers the pouch runes that fit the move; picking one sockets it, free', () => {
    socketed([null], { split: [1, 0, 0, 0, 0], quick: [0, 0, 2, 0, 0], widen: [1, 0, 0, 0, 0] });
    render(<AbilitiesPanel />);
    tapSocket(0, 'Socket 1: empty');
    expect(picker().getByRole('button', { name: 'Quick III ×2' })).toBeInTheDocument();
    // Widen fits a Burst, a Strike or a Ward, never a Bolt.
    expect(picker().queryByRole('button', { name: /^Widen/ })).toBeNull();
    fireEvent.click(picker().getByRole('button', { name: 'Split I ×1' }));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: Split I' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('chain-apply')).toHaveTextContent(/^Apply$/); // socketing is free
    apply();
    expect(chains().primary.moves[0].runes).toEqual([split]);
    expect(pouchCount(store().profile.runes, split)).toBe(0);
  });

  it('a filled socket offers Pull: destroyed by the rule, or for scrap and back to the pouch', () => {
    socketed([split]);
    render(<AbilitiesPanel />);
    tapSocket(0, 'Socket 1: Split I');
    expect(picker().getByTestId('rune-pull')).toHaveTextContent('Pull · destroys it');
    fireEvent.click(picker().getByTestId('rune-pull'));
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · destroys Split I');
    expect(screen.getByTestId('chain-price')).toHaveTextContent('Changes cost Split I (destroyed)');
    fireEvent.click(screen.getByTestId('chain-revert'));
    act(() => {
      store().setUnsocket('pay');
      store().setProfile({ ...store().profile, scrap: 15 });
    });
    tapSocket(0, 'Socket 1: Split I');
    expect(picker().getByTestId('rune-pull')).toHaveTextContent('Pull · ⚙ 15, back to your pouch');
    fireEvent.click(picker().getByTestId('rune-pull'));
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · ⚙ 15');
    apply();
    expect(chains().primary.moves[0].runes).toEqual([null]);
    expect(store().profile.scrap).toBe(0);
    expect(pouchCount(store().profile.runes, split)).toBe(1);
  });

  it('a rune that does nothing on its move is dimmed, with why: Linger on a light blow', () => {
    const linger = { id: 'linger', tier: 1 } as const;
    socketed(null, {}, [[linger]]);
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    tapSocket(0, 'Socket 1: Linger I, dormant: works on heavy and hold blows');
    expect(picker().getByTestId('rune-dormant')).toHaveTextContent('Works on heavy and hold blows');
    fireEvent.click(picker().getByRole('button', { name: 'Back' }));
    // A kind change keeps the rune, and a heavy blow wakes it.
    fireEvent.click(screen.getByTestId('kind-heavy'));
    expect(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: Linger I' }),
    ).toBeInTheDocument();
    apply();
    expect(chains().basic[0]).toMatchObject({ kind: 'heavy', runes: [linger] });
  });

  it("a form a socketed rune doesn't fit is off; the kind stays free", () => {
    socketed([split]);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('form-volley')).toBeEnabled();
    for (const f of ['lance', 'burst', 'strike'])
      expect(screen.getByTestId(`form-${f}`), f).toBeDisabled();
    expect(screen.getByTestId('form-burst')).toHaveAttribute('title', "Split doesn't fit a Burst");
    expect(screen.getByTestId('form-rune-note')).toHaveTextContent(
      "Split doesn't fit every form: pull it to pick another.",
    );
    fireEvent.click(screen.getByTestId('kind-heavy'));
    apply();
    expect(chains().primary.moves[0]).toMatchObject({ kind: 'heavy', runes: [split] });
  });

  it('a reorder carries the runes with their move', () => {
    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
    roomy(5, {
      primary: {
        moves: [
          { ...bolt, runes: [split] },
          { ...bolt, kind: 'heavy' },
        ],
        payment: 'mana',
      },
    });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('move-right-0'));
    apply();
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light']);
    expect(chains().primary.moves[1].runes).toEqual([split]);
    expect(socketsOf(chains().primary.moves[0])).toEqual([]);
  });

  it("the readout's beat counts a Quick rune", () => {
    socketed([null], { quick: [0, 0, 0, 0, 1] });
    render(<AbilitiesPanel />);
    const beat = () =>
      Number(/then a ([\d.]+)s beat/.exec(screen.getByTestId('ability-readout').textContent!)![1]);
    const before = beat();
    tapSocket(0, 'Socket 1: empty');
    fireEvent.click(picker().getByRole('button', { name: 'Quick V ×1' }));
    expect(beat()).toBeCloseTo(before * 0.7, 1);
  });
});

describe('ChainEditor', () => {
  const stats = computeHeroStats({}, registry);
  const given = defaultChains(registry, 'storm', null);
  const caps = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };

  it('edits the chains it is given through onChange, and names the reactions it is told about', () => {
    const onChange = vi.fn();
    render(
      <ChainEditor
        chains={given}
        caps={caps}
        stats={stats}
        reactionsSeen={['melt']}
        locked={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Storm Bolt');
    fireEvent.click(screen.getByTestId('form-lance'));
    const [first, ...rest] = given.primary.moves;
    expect(onChange).toHaveBeenCalledWith(
      'primary',
      { ...given.primary, moves: [{ ...first, form: 'lance' }, ...rest] },
      given.primary.moves.map((_, i) => i), // an edit keeps every move where it was
    );
    expect(screen.getByTestId('reaction-melt')).toBeInTheDocument();
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(14);
    expect(screen.getAllByTestId('reaction-unknown')[0]).toHaveTextContent(
      'Stack one element on a foe, then hit it with another, to discover.',
    );
    expect(screen.getByText('1/15 discovered')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^attune-/)).toHaveLength(6);
  });

  it('changes nothing while locked', () => {
    const onChange = vi.fn();
    render(
      <ChainEditor
        chains={given}
        caps={caps}
        stats={stats}
        reactionsSeen={[]}
        locked
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('form-lance'));
    fireEvent.click(screen.getByTestId('move-add'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with a fixed shape, moves change but never move, go or come, and the payment stays', () => {
    render(
      <ChainEditor
        chains={given}
        caps={caps}
        stats={stats}
        reactionsSeen={[]}
        locked={false}
        fixedShape
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('form-lance')).toBeEnabled();
    expect(screen.queryByTestId('move-add')).toBeNull();
    expect(screen.getByTestId('move-left-1')).not.toBeVisible();
    expect(screen.queryByTestId('payment-mana')).toBeNull();
  });

  it('reports where each move came from: ◂ ▸ move it, × drops it, + is new, an edit keeps it', () => {
    const onChange = vi.fn();
    const [m] = given.primary.moves;
    const three = {
      ...given,
      primary: {
        ...given.primary,
        moves: [
          m,
          { ...m, kind: 'medium' as const },
          { ...m, kind: 'heavy' as const, runes: [split] },
        ],
      },
    };
    render(
      <ChainEditor
        chains={three}
        caps={caps}
        stats={stats}
        reactionsSeen={[]}
        locked={false}
        onChange={onChange}
      />,
    );
    const last = () => onChange.mock.lastCall!;
    fireEvent.click(screen.getByTestId('move-right-0'));
    expect(last()[2]).toEqual([1, 0, 2]);
    fireEvent.click(screen.getByTestId('move-remove-1'));
    expect(last()[2]).toEqual([0, 2]);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('move-add')); // a copy of the heavy, with no sockets
    expect(last()[2]).toEqual([0, 1, 2, null]);
    expect(last()[1].moves[3]).toEqual({ kind: 'heavy', form: m.form, elements: m.elements });
    fireEvent.click(screen.getByTestId('kind-light'));
    expect(last()[2]).toEqual([0, 1, 2]);
  });
});
