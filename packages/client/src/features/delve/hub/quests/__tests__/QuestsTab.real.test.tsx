import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../../registry';
import { QuestsTab } from '../QuestsTab';

// The Quests tab on a real save: no mock of useQuests or the engine.

const store = () => useDelveStore.getState();
const renderTab = () => {
  const props = { setPrompts: vi.fn(), setFooterAction: vi.fn(), go: vi.fn(), onDelve: vi.fn() };
  render(<QuestsTab mode="anvil" {...props} />);
};
/** The contract in slot `i` of the board. */
const contract = (i: number) => store().profile.quests.board[i]!;
const open = (id: string) => fireEvent.click(screen.getByTestId(`quest-${id}`));
const track = () => screen.getByTestId('quest-track');

describe('QuestsTab on a new save', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(11, 'fire');
  });

  it('shows First Steps from Hesta and the three contracts of the board', () => {
    renderTab();
    expect(
      within(screen.getByTestId('quest-group-main')).getByTestId('quest-first_steps'),
    ).toBeInTheDocument();
    const detail = screen.getByTestId('quest-detail');
    expect(detail).toHaveTextContent('First Steps');
    expect(detail).toHaveTextContent('Reach depth 2');
    expect(detail.querySelector('[data-sprite="hesta"]')).not.toBeNull();
    for (const i of [0, 1, 2])
      expect(
        within(screen.getByTestId(`contract-slot-${i}`)).getByTestId(`quest-${contract(i).id}`),
      ).toBeInTheDocument();
  });

  it('tracks and untracks through the engine, which refuses past maxTracked', () => {
    const { maxTracked } = getDelveRegistry().getDelveBalance().quests;
    expect(maxTracked).toBe(3);
    renderTab();
    // First Steps is tracked from the start: two contracts fill the tracker.
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('1 tracked of 3');
    for (const i of [0, 1]) {
      open(contract(i).id);
      fireEvent.click(track());
      expect(track()).toHaveAttribute('aria-pressed', 'true');
    }
    expect(store().profile.quests.tracked).toEqual(['first_steps', contract(0).id, contract(1).id]);
    open(contract(2).id);
    expect(track()).toBeDisabled();
    expect(store().trackQuest(contract(2).id, true)).toMatchObject({
      ok: false,
      reason: 'Track at most 3 quests',
    });
    open(contract(0).id);
    fireEvent.click(track());
    expect(track()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('2 tracked of 3');
    open(contract(2).id);
    expect(track()).toBeEnabled();
  });

  it("enables Reroll by the engine's dry run, and spends the visit's one", () => {
    renderTab();
    const old = contract(1).id;
    open(old);
    const reroll = () => screen.getByTestId('quest-reroll');
    expect(reroll()).toBeEnabled();
    expect(screen.queryByTestId('quest-reroll-why')).toBeNull();
    fireEvent.click(reroll());
    expect(contract(1).id).not.toBe(old);
    // The new contract is open, and the visit's reroll is spent.
    expect(screen.getByTestId(`quest-${contract(1).id}`)).toHaveAttribute('aria-current', 'true');
    expect(reroll()).toBeDisabled();
    expect(screen.getByTestId('quest-reroll-why')).toHaveTextContent(
      'One reroll a visit: clear a depth to reroll again',
    );
  });
});
