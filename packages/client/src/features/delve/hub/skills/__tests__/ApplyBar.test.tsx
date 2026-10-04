import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { heroChains, type Chains } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { getDelveRegistry } from '../../../registry';
import { ApplyBar } from '../ApplyBar';

const onDelve = vi.fn();

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const chains = () => heroChains(registry, store().profile.equipped, store().profile.pair) as Chains;
const price = () => screen.getByTestId('chain-price');
const renderBar = () =>
  render(
    <MemoryRouter>
      <ApplyBar onDelve={onDelve} />
    </MemoryRouter>,
  );
/** The Primary's Bolt made a Lance: one unapplied change. */
const draftLance = () => {
  const primary = chains().primary;
  act(() =>
    store().editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], form: 'lance' }] }),
  );
};

describe('ApplyBar', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile(armed(store().profile)); // an uncommon sword: it carries the Primary
    onDelve.mockClear();
  });

  it('with nothing unapplied: "No changes", Revert and Apply off, the Delve button on', () => {
    renderBar();
    expect(price()).toHaveTextContent('No changes');
    expect(screen.getByTestId('chain-revert')).toBeDisabled();
    expect(screen.getByTestId('chain-apply')).toBeDisabled();
    expect(screen.getByTestId('delve-button')).toBeEnabled();
    expect(screen.getByTestId('delve-button')).toHaveAttribute('data-pad-menu');
  });

  it('counts the unapplied changes with their price; Revert drops them and Apply applies them', () => {
    renderBar();
    draftLance();
    expect(price()).toHaveTextContent('1 unapplied change · free until your first dive');
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName('Apply');
    fireEvent.click(screen.getByTestId('chain-revert'));
    expect(price()).toHaveTextContent('No changes');
    draftLance();
    fireEvent.click(screen.getByTestId('chain-apply'));
    expect(chains().primary.moves[0].form).toBe('lance');
    expect(price()).toHaveTextContent('No changes');
  });

  it("the compact Delve waits while changes are unapplied, else is the hub's Delve", () => {
    renderBar();
    draftLance();
    const delve = screen.getByTestId('delve-button');
    expect(delve).toBeDisabled();
    expect(delve).toHaveAttribute('aria-describedby', price().id);
    fireEvent.click(screen.getByTestId('chain-revert'));
    fireEvent.click(screen.getByTestId('delve-button'));
    expect(onDelve).toHaveBeenCalledOnce();
  });
});
