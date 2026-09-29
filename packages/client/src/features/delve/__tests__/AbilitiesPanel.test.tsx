import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { computeHeroStats, defaultChains, type Move, type MoveKind } from '@alloy/engine';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { ChainEditor } from '../chains/ChainEditor';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const store = () => useDelveStore.getState();
const chains = () => store().profile.chains;

describe('AbilitiesPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("lists the four skills, Basic first, and names the chosen skill's chain", () => {
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
    expect(screen.getByTestId('attune-fire')).toHaveAttribute('data-value', '2');
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent(
      'light Fire blow · light Fire blow · heavy Fire blow',
    );
    expect(screen.queryByTestId('form-bolt')).toBeNull(); // a blow has no form
    expect(screen.queryByText('Quick and cheap.')).toBeNull(); // nor a cost
  });

  it('edits a move: a Wildfire Burst from its form and a Nature infusion, then a swap', () => {
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
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(chains().primary.moves[0].kind).toBe('hold');
    expect(screen.getByTestId('ability-readout')).toHaveTextContent(/Fully charged .+ \d+ mana/);
    fireEvent.click(screen.getByTestId('payment-charge'));
    expect(screen.getByTestId('ability-readout')).toHaveTextContent(/Fully charged .+ Charge \d+/);
    fireEvent.click(screen.getByTestId('kind-heavy'));
    for (const payment of ['cast', 'mana', 'charge'] as const) {
      fireEvent.click(screen.getByTestId(`payment-${payment}`));
      expect(chains().primary.payment).toBe(payment);
      expect(screen.getByTestId('ability-readout')).toHaveTextContent(/\d\.\d\ds wind-up/);
    }
    expect(chains().primary.moves[0].kind).toBe('heavy');
  });

  it('adds, reorders and removes moves within the cap, never below one', () => {
    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
    store().setChain('primary', { moves: [bolt], payment: 'mana' });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('move-remove-0')).toBeDisabled();
    expect(screen.getByTestId('move-remove-0')).toHaveAccessibleName('Remove light Fire Bolt');
    fireEvent.click(screen.getByTestId('move-add'));
    expect(document.activeElement).toBe(screen.getByTestId('move-1')); // the new card
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('move-add'));
    expect(chains().primary.moves).toHaveLength(5);
    expect(screen.queryByTestId('move-add')).toBeNull(); // the cap
    expect(document.activeElement).toBe(screen.getByTestId('move-4'));
    // The new move is picked: make it heavy, then bring it forward.
    fireEvent.click(screen.getByTestId('kind-heavy'));
    expect(chains().primary.moves[4].kind).toBe('heavy');
    fireEvent.click(screen.getByTestId('move-left-4'));
    expect(chains().primary.moves.map((m) => m.kind)).toEqual([
      'light',
      'light',
      'light',
      'heavy',
      'light',
    ]);
    fireEvent.click(screen.getByTestId('move-remove-0'));
    expect(chains().primary.moves).toHaveLength(4);
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('move-2')); // the heavy, still picked
  });

  it('▸ moves a card later and the selection follows it; the ends are off', () => {
    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
    store().setChain('primary', {
      moves: [bolt('light'), bolt('medium'), bolt('heavy')],
      payment: 'mana',
    });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('move-left-0')).toBeDisabled();
    expect(screen.getByTestId('move-right-2')).toBeDisabled();
    fireEvent.click(screen.getByTestId('move-right-0'));
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['medium', 'light', 'heavy']);
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('light Fire Bolt');
    expect(document.activeElement).toBe(screen.getByTestId('move-right-1'));
  });

  it('two ◂ presses move a card two places, the selection and the focus with it', () => {
    const bolt = (kind: MoveKind): Move => ({ kind, form: 'bolt', elements: ['fire'] });
    store().setChain('primary', {
      moves: [bolt('light'), bolt('medium'), bolt('heavy')],
      payment: 'mana',
    });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('move-left-2'));
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['light', 'heavy', 'medium']);
    expect(screen.getByTestId('move-1')).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('move-left-1'));
    fireEvent.click(document.activeElement!);
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light', 'medium']);
    expect(screen.getByTestId('move-0')).toHaveAttribute('aria-pressed', 'true');
    // At the front its ◂ is off: the card itself keeps the focus.
    expect(document.activeElement).toBe(screen.getByTestId('move-0'));
  });

  it("stops at the skill's own cap", () => {
    store().setProfile({
      ...store().profile,
      chainCaps: { ...store().profile.chainCaps, primary: 4 },
    });
    render(<AbilitiesPanel />);
    expect(screen.queryByTestId('move-add')).toBeNull();
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    expect(screen.getByTestId('move-add')).toBeInTheDocument();
  });

  it('each ability offers only its own forms; a blow picks from the pair', () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-defensive'));
    expect(screen.getByTestId('form-ward')).toBeInTheDocument();
    expect(screen.queryByTestId('form-bolt')).toBeNull();
    fireEvent.click(screen.getByTestId('form-armor'));
    expect(chains().defensive.moves[0].form).toBe('armor');
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    expect(screen.getByTestId('form-maelstrom')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    expect(screen.getAllByTestId(/^element-/).map((c) => c.getAttribute('data-testid'))).toEqual([
      'element-fire',
      'element-storm',
    ]);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(chains().basic[2]).toEqual({ kind: 'heavy', element: 'storm' });
  });

  it('warns when a mana cost is bigger than the pool', () => {
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    fireEvent.click(screen.getByTestId('payment-mana'));
    fireEvent.click(screen.getByTestId('kind-heavy'));
    expect(screen.getByTestId('cost-warning')).toHaveTextContent('your pool holds');
  });

  it("warns when a hold move's full charge costs more than the pool", () => {
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-ultimate'));
    fireEvent.click(screen.getByTestId('payment-mana'));
    fireEvent.click(screen.getByTestId('kind-hold'));
    expect(screen.getByTestId('cost-warning')).toHaveTextContent(
      /^A full charge needs \d+ mana; your pool holds \d+\.$/,
    );
  });

  it('is read-only while a dive is under way', () => {
    store().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-locked')).toBeInTheDocument();
    expect(screen.getByTestId('form-lance')).toBeDisabled();
    expect(screen.getByTestId('move-add')).toBeDisabled();
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(chains().primary.moves[0].form).toBe('bolt');
  });

  it('mid-dive every move can still be picked and read, but not moved, removed or added', () => {
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
  const registry = getDelveRegistry();
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
