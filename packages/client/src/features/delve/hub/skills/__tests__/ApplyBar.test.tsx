import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { movesetOf, type Chains } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { getDelveRegistry } from '../../../registry';
import { ApplyBar } from '../ApplyBar';
import { stamped } from './harness';

const onDelve = vi.fn();
const onApply = vi.fn();

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const chains = () => movesetOf(registry, store().profile.equipped.weapon!).chains as Chains;
const price = () => screen.getByTestId('chain-price');
const renderBar = () =>
  render(
    <MemoryRouter>
      <ApplyBar onDelve={onDelve} onApply={onApply} />
    </MemoryRouter>,
  );
/** The Primary's Strike made a Lance: one unapplied change. */
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
    store().setProfile(stamped(armed(store().profile))); // an uncommon sword: it carries the Primary
    onDelve.mockClear();
    onApply.mockClear();
  });

  it('with nothing unapplied: "No changes", Revert and Apply off, the Delve button on', () => {
    renderBar();
    expect(price()).toHaveTextContent('No changes');
    expect(screen.getByTestId('chain-revert')).toBeDisabled();
    expect(screen.getByTestId('chain-apply')).toBeDisabled();
    expect(screen.getByTestId('depart-button')).toBeEnabled();
    expect(screen.getByTestId('depart-button')).toHaveAttribute('data-pad-menu');
  });

  it('counts the unapplied changes with their price; Revert drops them and Apply opens the sheet', () => {
    renderBar();
    draftLance();
    // Its price is B2's engine (D2 reads "free until your first dive" here); the count is the bar's.
    expect(price()).toHaveTextContent('1 unapplied change');
    expect(screen.getByTestId('chain-apply')).toHaveAccessibleName(/^Apply/);
    fireEvent.click(screen.getByTestId('chain-revert'));
    expect(price()).toHaveTextContent('No changes');
    draftLance();
    fireEvent.click(screen.getByTestId('chain-apply'));
    expect(onApply).toHaveBeenCalledOnce();
    expect(chains().primary.moves[0].form).toBe('strike'); // the save untouched
    expect(price()).toHaveTextContent('1 unapplied change');
  });

  it('Revert and Apply are the mouse’s, off the D-pad; the Delve button is a stop', () => {
    renderBar();
    expect(screen.getByTestId('chain-revert')).toHaveAttribute('data-pad-skip');
    expect(screen.getByTestId('chain-apply')).toHaveAttribute('data-pad-skip');
    expect(screen.getByTestId('depart-button')).not.toHaveAttribute('data-pad-skip');
  });

  it("the compact Delve is the hub's (it opens the Depart sheet), unapplied changes or not", () => {
    renderBar();
    draftLance();
    // The sheet says what holds a dive: the button itself never waits.
    const delve = screen.getByTestId('depart-button');
    expect(delve).toBeEnabled();
    expect(delve).not.toHaveAttribute('aria-describedby');
    fireEvent.click(delve);
    expect(onDelve).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('chain-revert'));
    fireEvent.click(screen.getByTestId('depart-button'));
    expect(onDelve).toHaveBeenCalledTimes(2);
  });
});
