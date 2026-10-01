import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  computeHeroStats,
  defaultChains,
  defaultMoveset,
  heroChains,
  type Chains,
  type ChainSkill,
  type Move,
  type MoveKind,
} from '@alloy/engine';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { ChainEditor } from '../chains/ChainEditor';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
/** The hero's chains, as its equipped weapon carries them. */
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;

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

  it('edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap', () => {
    roomy();
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'nature' } });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('move-1'));
    fireEvent.click(screen.getByTestId('form-burst'));
    fireEvent.click(screen.getByTestId('infusion-nature'));
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
    expect(chains().primary.moves[1].elements).toEqual(['nature', 'fire']);
    fireEvent.click(screen.getByTestId('infusion-none'));
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
    // On a maul (tempo 1.3), the charge and every beat take longer.
    const p = store().profile;
    store().setProfile({
      ...p,
      equipped: { ...p.equipped, weapon: { ...p.equipped.weapon!, baseId: 'maul' } },
    });
    render(<AbilitiesPanel />);
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
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light', 'medium']);
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
    expect(chains().primary.moves[0].form).toBe('bolt');
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
    expect(onChange).toHaveBeenCalledWith('primary', {
      ...given.primary,
      moves: [{ ...first, form: 'lance' }, ...rest],
    });
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
});
