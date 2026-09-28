import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { computeHeroStats, defaultAbilities } from '@alloy/engine';
import { AbilitiesPanel, AbilityEditor } from '../AbilitiesPanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const abilities = () => useDelveStore.getState().profile.abilities;

describe('AbilitiesPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
  });

  it('shows the three default abilities and starter attunement', () => {
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('Fire Bolt');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('Fire Ward');
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('Fire Nova');
    expect(screen.getByTestId('attune-fire')).toHaveAttribute('data-value', '2');
  });

  it('builds a Wildfire Burst: form, a Nature infusion, then a swap', () => {
    const s = useDelveStore.getState();
    s.setProfile({ ...s.profile, pair: { primary: 'fire', secondary: 'nature' } });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('form-burst'));
    fireEvent.click(screen.getByTestId('infusion-nature'));
    expect(abilities().primary).toMatchObject({ form: 'burst', elements: ['fire', 'nature'] });
    expect(screen.getByTestId('ability-readout')).toHaveTextContent('Wildfire Burst');
    expect(screen.getByTestId('element-effect')).toHaveTextContent('Wildfire');
    fireEvent.click(screen.getByTestId('swap-elements'));
    expect(abilities().primary.elements).toEqual(['nature', 'fire']);
    fireEvent.click(screen.getByTestId('infusion-none'));
    expect(abilities().primary.elements).toEqual(['nature']);
  });

  it('sets weight and payment, and shows the wind-up for every payment', () => {
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('weight-2'));
    for (const payment of ['cast', 'mana', 'charge'] as const) {
      fireEvent.click(screen.getByTestId(`payment-${payment}`));
      expect(abilities().primary).toMatchObject({ weight: 2, payment });
      expect(screen.getByTestId('ability-readout')).toHaveTextContent(/\d\.\d\ds wind-up/);
    }
  });

  it('each slot offers only its own forms', () => {
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('ability-slot-defensive'));
    expect(screen.getByTestId('form-ward')).toBeInTheDocument();
    expect(screen.queryByTestId('form-bolt')).toBeNull();
    fireEvent.click(screen.getByTestId('form-armor'));
    expect(abilities().defensive.form).toBe('armor');
    fireEvent.click(screen.getByTestId('ability-slot-ultimate'));
    expect(screen.getByTestId('form-maelstrom')).toBeInTheDocument();
  });

  it('warns when a mana cost is bigger than the pool', () => {
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('ability-slot-ultimate'));
    fireEvent.click(screen.getByTestId('payment-mana'));
    fireEvent.click(screen.getByTestId('weight-2'));
    expect(screen.getByTestId('cost-warning')).toHaveTextContent('your pool holds');
  });

  it('is read-only while a dive is under way', () => {
    useDelveStore.getState().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('abilities-locked')).toBeInTheDocument();
    expect(screen.getByTestId('form-lance')).toBeDisabled();
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(abilities().primary.form).toBe('bolt');
  });
});

describe('AbilityEditor', () => {
  const stats = computeHeroStats({}, getDelveRegistry());
  const builds = defaultAbilities('storm');

  it('edits the builds it is given through onChange, and names the reactions it is told about', () => {
    const onChange = vi.fn();
    render(
      <AbilityEditor
        builds={builds}
        stats={stats}
        reactionsSeen={['melt']}
        locked={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('Storm Bolt');
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(onChange).toHaveBeenCalledWith('primary', { ...builds.primary, form: 'lance' });
    expect(screen.getByTestId('reaction-melt')).toBeInTheDocument();
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(6);
    expect(screen.getAllByTestId(/^attune-/)).toHaveLength(6);
  });

  it('changes nothing while locked', () => {
    const onChange = vi.fn();
    render(
      <AbilityEditor builds={builds} stats={stats} reactionsSeen={[]} locked onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
