import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { generateItem, SeededRNG, type ProfileActionResult } from '@alloy/engine';
import { AlcoveDialog, ExitConfirm } from '../arena/FloorDialogs';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

describe('ExitConfirm', () => {
  it('asks before leaving: the rooms unexplored, Back focused (A-A never leaves), Back stays', () => {
    const onLeave = vi.fn();
    const onStay = vi.fn();
    render(<ExitConfirm unexplored={2} onLeave={onLeave} onStay={onStay} />);
    const dialog = screen.getByTestId('exit-confirm');
    expect(dialog).toHaveTextContent('Leave the floor?');
    expect(screen.getByTestId('exit-unexplored')).toHaveTextContent('2 rooms unexplored.');
    expect(dialog).toHaveTextContent('Loot left on the floor is lost.');
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onStay).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('exit-leave'));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('counts one room, or none', () => {
    const { rerender } = render(<ExitConfirm unexplored={1} onLeave={vi.fn()} onStay={vi.fn()} />);
    expect(screen.getByTestId('exit-unexplored')).toHaveTextContent('1 room unexplored.');
    rerender(<ExitConfirm unexplored={0} onLeave={vi.fn()} onStay={vi.fn()} />);
    expect(screen.getByTestId('exit-unexplored')).toHaveTextContent('Every room explored.');
  });
});

describe('AlcoveDialog', () => {
  const helm = generateItem(
    registry,
    { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
    new SeededRNG(4),
  );
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile({ ...store().profile, bag: [helm] });
    store().startDive(1); // mid-floor: the dive is fighting
  });

  it("shows the stop's cards for its offers; a take goes to onTake and closes it", () => {
    const onTake = vi.fn((): ProfileActionResult => ({ ok: true, profile: store().profile }));
    const onClose = vi.fn();
    render(<AlcoveDialog offers={['equip', 'upgrade']} onTake={onTake} onClose={onClose} />);
    expect(screen.getByTestId('alcove-dialog')).toHaveTextContent('Anvil alcove');
    expect(screen.getByTestId('stop')).toHaveTextContent('Take one power-up');
    expect(screen.getByTestId('stop-upgrade')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(onTake).toHaveBeenCalledWith({ kind: 'equip', uid: 'h1' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("a refused take keeps it open with the engine's reason; Back closes it", () => {
    const onTake = vi.fn(
      (): ProfileActionResult => ({ ok: false, profile: store().profile, reason: 'Used' }),
    );
    const onClose = vi.fn();
    render(<AlcoveDialog offers={['equip']} onTake={onTake} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(screen.getByRole('status')).toHaveTextContent('Used');
    expect(onClose).not.toHaveBeenCalled();
    // The picker's Back, then the dialog's.
    fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("dry-runs its pickers by the stop's rules mid-floor, never refusing for want of a stop", () => {
    render(<AlcoveDialog offers={['slot']} onTake={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('stop-slot'));
    expect(screen.queryByText('No stop here')).toBeNull();
    expect(screen.getByTestId('stop-slot-primary')).toBeInTheDocument();
  });
});
