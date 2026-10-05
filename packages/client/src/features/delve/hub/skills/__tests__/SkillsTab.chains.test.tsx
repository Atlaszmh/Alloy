import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, fireEvent, within } from '@testing-library/react';
import {
  carriedByText,
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
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { edit, pickForm, renderSkills, stepTo, valuesOf } from './harness';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
/** The hero's chains, as its equipped weapon carries them. */
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const apply = () => fireEvent.click(screen.getByTestId('chain-apply'));
/** The Apply bar's line: "No changes", or "n unapplied changes · price". */
const priceLine = () => screen.getByTestId('chain-price');

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

describe('SkillsTab', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile(armed(store().profile)); // an uncommon sword: it carries the Primary
  });

  it("lists the four skills, Basic first, and names the chosen skill's chain", () => {
    roomy();
    renderSkills();
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
    edit(0);
    expect(screen.queryByTestId('move-form')).toBeNull(); // a blow has no form
    expect(screen.queryByText('Quick and cheap.')).toBeNull(); // nor a cost
  });

  it("a new hero's common sword carries Basic alone; the others show locked, saying what carries them", () => {
    store().resetProfile(1234, 'fire'); // the common sword, as a new save has it
    renderSkills();
    expect(screen.getByTestId('mana-pair')).toHaveTextContent('Fire · 2');
    expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
    for (const [skill, text] of [
      ['primary', 'Carried by uncommon weapons and better'],
      ['defensive', 'Carried by rare weapons and better'],
      ['ultimate', 'Carried by epic weapons and better, or an awakened rare'],
    ]) {
      // The tab's own line says what carries it.
      expect(screen.getByTestId(`chain-skill-${skill}`)).toHaveTextContent(text);
      fireEvent.click(screen.getByTestId(`chain-skill-${skill}`));
      expect(screen.getByTestId('abilities-summary')).toHaveTextContent(text);
      expect(screen.queryByTestId('move-0')).toBeNull();
      expect(screen.queryByTestId('move-add')).toBeNull();
      expect(screen.queryByTestId('add-slot')).toBeNull();
    }
  });

  it('unarmed, the default chains show at their base slots: the basic chain alone', () => {
    store().unequip('weapon');
    renderSkills();
    expect(screen.getByTestId('chain-skill-basic')).toHaveTextContent('3 of 3');
    for (const s of ['primary', 'defensive'] as const)
      expect(screen.getByTestId(`chain-skill-${s}`)).toHaveTextContent(carriedByText(registry, s));
  });

  it('edits a draft: Apply commits it, free before the first dive, and Revert drops it', () => {
    roomy();
    renderSkills();
    expect(priceLine()).toHaveTextContent('No changes');
    edit(0);
    pickForm('lance');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
    expect(chains().primary.moves[0].form).toBe('bolt'); // not yet
    expect(priceLine()).toHaveTextContent('free until your first dive');
    fireEvent.click(screen.getByTestId('chain-revert'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Bolt');
    expect(priceLine()).toHaveTextContent('No changes');
    pickForm('lance');
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply'); // free: no price
    apply();
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(priceLine()).toHaveTextContent('No changes');
    expect(store().profile.manaDust).toBe(0);
  });

  it('keeps the draft when the tab closes; a dive starts only once it is discarded', () => {
    roomy();
    const { unmount } = renderSkills();
    edit(0);
    pickForm('lance');
    unmount();
    renderSkills();
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('light Fire Lance');
    expect(priceLine()).toHaveTextContent('1 unapplied change');
    expect(store().startDive(1)).toBe(false);
    expect(priceLine()).toHaveTextContent('1 unapplied change');
    act(() => {
      store().revertDraft();
      store().startDive(1);
    });
    expect(priceLine()).toHaveTextContent('No changes');
    expect(chains().primary.moves[0].form).toBe('bolt');
  });

  it('Apply is off while the engine would refuse the draft, and says why; the draft stays', () => {
    roomy();
    renderSkills();
    // A storm move the pair (Fire alone) doesn't hold: the engine refuses it.
    const storm: Move = { kind: 'medium', form: 'bolt', elements: ['storm'] };
    act(() => store().editDraft('primary', { moves: [storm], payment: 'mana' }));
    const button = screen.getByTestId('chain-apply');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('chain-apply-why')).toHaveTextContent('Pick from your two elements');
    expect(button).toHaveAttribute('aria-describedby', screen.getByTestId('chain-apply-why').id);
    apply();
    expect(priceLine()).toHaveTextContent('1 unapplied change');
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
    renderSkills();
    edit(0);
    pickForm('lance');
    expect(screen.getByTestId('add-slot')).toBeDisabled();
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent(
      'Apply or revert this chain first',
    );
    pickForm('bolt'); // back as it was
    expect(priceLine()).toHaveTextContent('No changes');
    expect(store().chainDraft?.chains.primary).toBeUndefined();
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 2 slots');
    expect(priceLine()).toHaveTextContent('No changes');
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
    renderSkills();
    edit(0);
    pickForm('lance');
    act(() => store().equip('spare'));
    expect(priceLine()).toHaveTextContent('No changes');
    act(() => store().equip(sword.uid));
    expect(priceLine()).toHaveTextContent('No changes'); // gone, not waiting on the sword
    // A realign re-maps the moves the draft was made on.
    act(() => {
      store().bindSecondary('storm');
      store().setProfile({ ...store().profile, manaDust: 500, scrap: 500 });
    });
    edit(0);
    pickForm('lance');
    expect(priceLine()).toHaveTextContent('1 unapplied change');
    act(() => {
      expect(store().realign({ primary: 'frost' }).ok).toBe(true);
    });
    expect(priceLine()).toHaveTextContent('No changes');
    expect(chains().primary.moves[0]).toMatchObject({ form: 'bolt', elements: ['frost'] });
  });

  it('after the first dive the draft shows its price in Mana Dust, and Apply pays it', () => {
    roomy();
    const p = store().profile;
    store().setProfile({ ...p, stats: { ...p.stats, dives: 1 }, manaDust: 4 });
    renderSkills();
    edit(0);
    pickForm('lance'); // a changed form: editDust
    expect(priceLine()).toHaveTextContent('1 unapplied change · 5 Mana Dust');
    expect(screen.getByTestId('chain-apply')).toBeDisabled();
    expect(screen.getByTestId('chain-apply-why')).toHaveTextContent('Not enough Mana Dust');
    act(() => store().setProfile({ ...store().profile, manaDust: 20 }));
    stepTo('move-kind', 'Heavy');
    // Still one move changed: its kind and form together cost editDust once.
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · 5 Mana Dust');
    apply();
    expect(chains().primary.moves[0]).toEqual({ kind: 'heavy', form: 'lance', elements: ['fire'] });
    expect(store().profile.manaDust).toBe(15);
  });

  it('edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap', () => {
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'nature' } });
    renderSkills();
    edit(1);
    pickForm('burst');
    stepTo('move-elements', 'Fire + Nature');
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
    stepTo('move-elements', 'Nature + Fire'); // the swap is a set of its own
    apply();
    expect(chains().primary.moves[1].elements).toEqual(['nature', 'fire']);
    stepTo('move-elements', 'Nature');
    apply();
    expect(chains().primary.moves[1].elements).toEqual(['nature']);
  });

  it("sets a move's kind, and the chain's one payment with its wind-up", () => {
    roomy();
    renderSkills();
    edit(0);
    stepTo('move-kind', 'Hold');
    expect(screen.getByTestId('num-full')).toHaveTextContent(/\d+ mana/);
    stepTo('chain-payment', 'Charge');
    expect(screen.getByTestId('num-full')).toHaveTextContent(/Charge \d+/);
    stepTo('move-kind', 'Heavy');
    for (const payment of ['Cast', 'Mana', 'Charge']) {
      stepTo('chain-payment', payment);
      expect(screen.getByTestId('num-windup')).toHaveTextContent(/^\d\.\d\ds$/);
    }
    apply();
    expect(chains().primary.payment).toBe('charge');
    expect(chains().primary.moves[0].kind).toBe('heavy');
  });

  it("says each move's beat, and a hold's full-charge time and beat, by the weapon's tempo", () => {
    roomy();
    const num = (id: string) => screen.getByTestId(`num-${id}`);
    const { unmount } = renderSkills();
    // The Primary's first move, a light Bolt, on the starting sword (tempo 1).
    expect(num('beat')).toHaveTextContent(/^0\.25s$/);
    edit(0);
    stepTo('move-kind', 'Hold');
    // A tap plays as a medium; a full charge as a hold.
    expect(num('beat')).toHaveTextContent(/^0\.4s$/);
    expect(num('full')).toHaveTextContent(/^1s: .+ mana, then a 0\.8s beat$/);
    unmount();
    store().revertDraft(); // the draft outlives the panel
    // On a maul (tempo 1.3), the charge and every beat take longer.
    const p = store().profile;
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: { ...p.equipped.weapon!, baseId: 'maul' } },
    });
    renderSkills();
    expect(num('beat')).toHaveTextContent(/^0\.33s$/);
    edit(0);
    stepTo('move-kind', 'Hold');
    expect(num('beat')).toHaveTextContent(/^0\.52s$/);
    expect(num('full')).toHaveTextContent(/^1\.3s: .+ mana, then a 1\.04s beat$/);
  });

  it('adds, reorders and removes moves within the slots, never below one', () => {
    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
    roomy(5, { primary: { moves: [bolt], payment: 'mana' } });
    renderSkills();
    edit(0);
    expect(screen.getByTestId('move-remove')).toBeDisabled();
    expect(screen.getByTestId('move-remove')).toHaveAccessibleName('Remove light Fire Bolt');
    fireEvent.click(screen.getByTestId('move-editor-back'));
    fireEvent.click(screen.getByTestId('move-add'));
    expect(document.activeElement).toBe(screen.getByTestId('move-1')); // the new card
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('move-add'));
    expect(screen.getAllByTestId(/^move-\d$/)).toHaveLength(5);
    expect(screen.queryByTestId('move-add')).toBeNull(); // every slot used
    expect(document.activeElement).toBe(screen.getByTestId('move-4'));
    // The new move is picked: make it heavy, then bring it forward.
    edit(4);
    stepTo('move-kind', 'Heavy');
    stepTo('move-position', 'Position 4 of 5');
    expect(screen.getByTestId('move-3')).toHaveAttribute('aria-pressed', 'true'); // the heavy
    edit(0);
    fireEvent.click(screen.getByTestId('move-remove'));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('move-0'));
    apply();
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'light', 'heavy', 'light']);
  });

  it('Position moves a card; the selection follows it', () => {
    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
    roomy(5, {
      primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
    });
    renderSkills();
    edit(0);
    // The ends: the first place and the last.
    expect(screen.getByTestId('move-position')).toHaveAttribute('aria-valuemin', '0');
    expect(screen.getByTestId('move-position')).toHaveAttribute('aria-valuemax', '2');
    stepTo('move-position', 'Position 2 of 3');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'medium Fire Bolt · light Fire Bolt · heavy Fire Bolt',
    );
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('light Fire Bolt');
  });

  it('two steps of Position move a card two places, the selection with it and the focus kept', () => {
    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
    roomy(5, {
      primary: { moves: [bolt('light'), bolt('medium'), bolt('heavy')], payment: 'mana' },
    });
    renderSkills();
    edit(2);
    const position = screen.getByTestId('move-position');
    position.focus();
    fireEvent.keyDown(position, { key: 'ArrowLeft' });
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(position, { key: 'ArrowLeft' });
    expect(screen.getByTestId('move-0')).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('move-position'));
    apply();
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light', 'medium']);
  });

  it("shows each chain's slots, and Add slot's price in Links and scrap", () => {
    renderSkills();
    expect(screen.queryByTestId('move-add')).toBeNull(); // the Primary's one slot is used
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('1 of 1 slots');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Slot1 Link · 20 scrap');
    expect(screen.getByTestId('add-slot')).toBeDisabled(); // no Links yet
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough Links');
    expect(screen.getByTestId('add-slot')).toHaveAttribute(
      'aria-describedby',
      screen.getByTestId('add-slot-why').id,
    );
    act(() => store().setProfile({ ...store().profile, links: 1, scrap: 0 }));
    expect(screen.getByTestId('add-slot-why')).toHaveTextContent('Not enough scrap');
    act(() => store().setProfile({ ...store().profile, links: 1, scrap: 25 }));
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(store().profile).toMatchObject({ links: 0, scrap: 5 });
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('2 of 2 slots');
    expect(screen.getByTestId('chain-skill-primary')).toHaveTextContent('2 of 2');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('2 Links · 40 scrap');
    // The sword's basic chain starts at its string's 3 slots: its 4th costs 3 Links.
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 3 slots');
    expect(screen.getByTestId('add-slot')).toHaveTextContent('3 Links · 60 scrap');
  });

  it('offers + Slot beside + Move while the chain is under five slots, and none at five', () => {
    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
    roomy(3, { primary: { moves: [bolt], payment: 'mana' } });
    renderSkills();
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(screen.getByTestId('add-slot')).toHaveTextContent('+ Slot');
    act(() => roomy(5, { primary: { moves: [bolt], payment: 'mana' } }));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(screen.queryByTestId('add-slot')).toBeNull();
  });

  it("a refused Add slot or Apply says the engine's reason on the lane's message line", () => {
    store().setProfile({ ...store().profile, links: 1, scrap: 25 });
    renderSkills();
    const refuse = (reason: string) => ({ ok: false, profile: store().profile, reason });
    vi.spyOn(store(), 'addSlot').mockReturnValueOnce(refuse('Not now'));
    fireEvent.click(screen.getByTestId('add-slot'));
    expect(screen.getByTestId('chain-message')).toHaveTextContent('Not now');
    edit(0);
    pickForm('lance');
    vi.spyOn(store(), 'applyDraft').mockReturnValueOnce(refuse('The forge is cold'));
    apply();
    expect(screen.getByTestId('chain-message')).toHaveTextContent('The forge is cold');
    apply();
    expect(screen.queryByTestId('chain-message')).toBeNull();
  });

  it('marks a move outside the pair off-pair, and never offers its element to another', () => {
    const storm: Move = { kind: 'medium', form: 'bolt', elements: ['storm'] };
    const fire: Move = { kind: 'medium', form: 'bolt', elements: ['fire'] };
    roomy(5, { primary: { moves: [storm, fire], payment: 'mana' } });
    renderSkills();
    expect(screen.getAllByTestId('card-off-pair')).toHaveLength(1);
    expect(screen.getByTestId('move-0')).toHaveAccessibleName('medium Storm Bolt, off-pair');
    edit(0);
    expect(screen.getByTestId('move-elements')).toHaveAttribute(
      'aria-valuetext',
      'Storm · off-pair',
    );
    // It keeps Storm, but takes no new off-pair set (Apply would refuse it): Fire, then Storm.
    expect(screen.getByTestId('move-elements')).toHaveAttribute('aria-valuemax', '1');
    fireEvent.keyDown(screen.getByTestId('move-elements'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('move-elements')).toHaveAttribute('aria-valuetext', 'Fire');
    act(() => store().revertDraft());
    expect(screen.getByTestId('off-pair-note')).toHaveTextContent('Storm off-pair: no attunement');
    edit(1);
    expect(valuesOf('move-elements').some((t) => t.includes('Storm'))).toBe(false);
    // A copy of the off-pair move takes the pair's element instead.
    edit(0);
    fireEvent.click(screen.getByTestId('move-add'));
    apply();
    expect(chains().primary.moves[2].elements).toEqual(['fire']);
  });

  it('each ability offers only its own forms; a blow picks from the pair', () => {
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    renderSkills();
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    edit(0);
    fireEvent.click(screen.getByTestId('move-form'));
    expect(screen.getByTestId('form-ward')).toBeInTheDocument();
    expect(screen.queryByTestId('form-bolt')).toBeNull();
    fireEvent.click(screen.getByTestId('form-armor'));
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    edit(0);
    fireEvent.click(screen.getByTestId('move-form'));
    expect(screen.getByTestId('form-maelstrom')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    edit(2);
    expect(valuesOf('move-elements')).toEqual(['Fire', 'Storm']);
    stepTo('move-elements', 'Storm');
    apply();
    expect(chains().defensive.moves[0].form).toBe('armor');
    expect(chains().basic[2]).toEqual({ kind: 'heavy', element: 'storm' });
  });

  it('warns when a mana cost is bigger than the pool', () => {
    roomy();
    renderSkills();
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    edit(0);
    stepTo('chain-payment', 'Mana');
    stepTo('move-kind', 'Heavy');
    expect(screen.getByTestId('cost-warning')).toHaveTextContent('your pool holds');
  });

  it("warns when a hold move's full charge costs more than the pool", () => {
    roomy();
    renderSkills();
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    edit(0);
    stepTo('chain-payment', 'Mana');
    stepTo('move-kind', 'Hold');
    expect(screen.getByTestId('cost-warning')).toHaveTextContent(
      /^A full charge needs \d+ mana; your pool holds \d+\.$/,
    );
  });

  it('is read-only while a dive is under way', () => {
    roomy();
    store().startDive(1);
    renderSkills();
    expect(screen.getByTestId('abilities-locked')).toBeInTheDocument();
    expect(screen.getByTestId('move-add')).toBeDisabled();
    // A card only selects: no editor opens on a read-only chain.
    edit(0);
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(priceLine()).toHaveTextContent('No changes');
  });

  it('mid-dive every move can still be picked and read, but not moved, removed or added', () => {
    roomy();
    store().startDive(1);
    renderSkills();
    expect(screen.getByTestId('move-2')).toBeEnabled();
    fireEvent.click(screen.getByTestId('move-2'));
    expect(screen.getByTestId('move-2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('medium Fire Bolt');
    expect(screen.queryByTestId('move-editor')).toBeNull();
    expect(screen.getByTestId('move-add')).toBeDisabled();
  });

  it('unarmed, it shows the default chains read-only', () => {
    store().unequip('weapon');
    renderSkills();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('abilities-locked')).toHaveTextContent(
      'Equip a weapon to build your moves.',
    );
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire blow · light Fire blow · heavy Fire blow',
    );
    expect(screen.getByTestId('chain-slots')).toHaveTextContent('3 of 3 slots');
    expect(screen.queryByTestId('add-slot')).toBeNull();
    edit(0);
    expect(screen.queryByTestId('move-editor')).toBeNull();
  });
});

const split = { id: 'split', tier: 1 } as const;

describe('SkillsTab: sockets and runes', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile(armed(store().profile)); // an uncommon sword: it carries the Primary
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
    renderSkills();
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets · 0 of 1');
    edit(0);
    const open = screen.getByTestId('socket-open');
    expect(open).toHaveTextContent('Open a socket');
    expect(open).toHaveTextContent('1 Link');
    expect(open).toHaveTextContent('20 scrap');
    fireEvent.click(open);
    expect(screen.getAllByTestId(/^inspect-socket-/)).toHaveLength(1);
    expect(screen.queryByTestId('socket-open')).toBeNull(); // a common weapon's cap
    expect(priceLine()).toHaveTextContent('1 unapplied change · 1 Link · 20 scrap');
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · 1 Link · 20 scrap');
    apply();
    expect(chains().primary.moves[0].runes).toEqual([null]);
    expect(store().profile).toMatchObject({ links: 0, scrap: 0 });
  });

  it("a draft the engine won't price says why in place of a price, once", () => {
    socketed([null]);
    renderSkills();
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
    renderSkills();
    edit(0);
    const open = screen.getByTestId('socket-open');
    expect(open).toBeDisabled();
    const why = document.getElementById(open.getAttribute('aria-describedby')!);
    expect(why).toHaveTextContent(/Links/);
  });

  it('an empty socket offers the pouch runes that fit the move; picking one sockets it, free', () => {
    socketed([null], { split: [1, 0, 0, 0, 0], quick: [0, 0, 2, 0, 0], widen: [1, 0, 0, 0, 0] });
    renderSkills();
    tapSocket(0, 'Socket 1: empty');
    expect(picker().getByRole('button', { name: 'Quick III ×2' })).toBeInTheDocument();
    // Widen fits a Burst, a Strike or a Ward, never a Bolt.
    expect(picker().queryByRole('button', { name: /^Widen/ })).toBeNull();
    fireEvent.click(picker().getByRole('button', { name: 'Split I ×1' }));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: Split I' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply'); // socketing is free
    apply();
    expect(chains().primary.moves[0].runes).toEqual([split]);
    expect(pouchCount(store().profile.runes, split)).toBe(0);
  });

  it('a filled socket offers Pull: destroyed by the rule, or for scrap and back to the pouch', () => {
    socketed([split]);
    renderSkills();
    tapSocket(0, 'Socket 1: Split I');
    expect(picker().getByTestId('rune-pull')).toHaveTextContent('Pull · destroys it');
    fireEvent.click(picker().getByTestId('rune-pull'));
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · destroys Split I');
    expect(priceLine()).toHaveTextContent('1 unapplied change · destroys Split I');
    fireEvent.click(screen.getByTestId('chain-revert'));
    act(() => {
      store().setUnsocket('pay');
      store().setProfile({ ...store().profile, scrap: 15 });
    });
    tapSocket(0, 'Socket 1: Split I');
    expect(picker().getByTestId('rune-pull')).toHaveTextContent(
      'Pull · 15 scrap, back to your pouch',
    );
    fireEvent.click(picker().getByTestId('rune-pull'));
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply · 15 scrap');
    apply();
    expect(chains().primary.moves[0].runes).toEqual([null]);
    expect(store().profile.scrap).toBe(0);
    expect(pouchCount(store().profile.runes, split)).toBe(1);
  });

  it('a rune that does nothing on its move is dimmed, with why: Linger on a light blow', () => {
    const linger = { id: 'linger', tier: 1 } as const;
    socketed(null, {}, [[linger]]);
    renderSkills();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    tapSocket(0, 'Socket 1: Linger I, dormant: works on heavy and hold blows');
    expect(picker().getByTestId('rune-dormant')).toHaveTextContent('Works on heavy and hold blows');
    fireEvent.click(picker().getByRole('button', { name: 'Back' }));
    // A kind change keeps the rune, and a heavy blow wakes it.
    stepTo('move-kind', 'Heavy');
    expect(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: Linger I' }),
    ).toBeInTheDocument();
    apply();
    expect(chains().basic[0]).toMatchObject({ kind: 'heavy', runes: [linger] });
  });

  it("a form a socketed rune doesn't fit is off; the kind stays free", () => {
    socketed([split]);
    renderSkills();
    edit(0);
    fireEvent.click(screen.getByTestId('move-form'));
    expect(screen.getByTestId('form-volley')).toBeEnabled();
    for (const f of ['lance', 'burst', 'strike'])
      expect(screen.getByTestId(`form-${f}`), f).toBeDisabled();
    // Each off form says why beside itself.
    expect(screen.getByTestId('form-burst')).toHaveTextContent("Split doesn't fit a Burst");
    fireEvent.click(screen.getByTestId('form-picker-back'));
    stepTo('move-kind', 'Heavy');
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
    renderSkills();
    edit(0);
    stepTo('move-position', 'Position 2 of 2');
    apply();
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light']);
    expect(chains().primary.moves[1].runes).toEqual([split]);
    expect(socketsOf(chains().primary.moves[0])).toEqual([]);
  });

  it("the editor's socket rows open the rune grid under the rows, as a scope", () => {
    socketed([null], { split: [1, 0, 0, 0, 0] });
    renderSkills();
    const readout = within(screen.getByTestId('ability-readout'));
    expect(readout.getByTestId('socket-count')).toHaveTextContent('Sockets · 1 of 1');
    edit(0);
    fireEvent.click(readout.getByTestId('inspect-socket-0'));
    expect(readout.getByTestId('rune-picker')).toHaveAttribute('data-pad-scope');
    expect(readout.getByTestId('rune-pick-split').parentElement!.className).toMatch(/grid-cols-2/);
    fireEvent.click(readout.getByTestId('rune-picker-close'));
    expect(readout.queryByTestId('rune-picker')).toBeNull();
    expect(readout.getByTestId('inspect-socket-0')).toBeInTheDocument();
  });

  it("the readout's beat counts a Quick rune", () => {
    socketed([null], { quick: [0, 0, 0, 0, 1] });
    renderSkills();
    const beat = () => parseFloat(screen.getByTestId('num-beat').textContent!);
    const before = beat();
    tapSocket(0, 'Socket 1: empty');
    fireEvent.click(picker().getByRole('button', { name: 'Quick V ×1' }));
    expect(beat()).toBeCloseTo(before * 0.7, 1);
  });
});
