import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MAX_DUMMY_GROUPS, useSandboxStore } from '@/stores/sandboxStore';
import { DamageMeter } from '../training/meter';
import { TrainingPanel, type TrainingTab } from '../training/TrainingPanel';
import type { TrainingActions } from '../training/useTrainingArena';

function renderPanel(tab: TrainingTab) {
  const actions: TrainingActions = {
    addDummies: vi.fn(),
    spawn: vi.fn(),
    clear: vi.fn(),
    resetDummies: vi.fn(),
    fillCharge: vi.fn(),
    resetMeter: vi.fn(),
  };
  const onClose = vi.fn();
  const onExit = vi.fn();
  render(
    <TrainingPanel
      layout="sheet"
      tab={tab}
      onTab={vi.fn()}
      onClose={onClose}
      onExit={onExit}
      actions={actions}
      meter={new DamageMeter().summary(0)}
      onOpenControls={vi.fn()}
    />,
  );
  return { actions, onClose, onExit };
}

describe('TrainingPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useSandboxStore.getState().reset();
  });

  it('a weapon chip sets the sandbox weapon', () => {
    renderPanel('loadout');
    fireEvent.click(screen.getByTestId('weapon-base-staff'));
    expect(useSandboxStore.getState().weapon).toMatchObject({ baseId: 'staff' });
    expect(screen.getByTestId('weapon-name')).toHaveTextContent('Staff');
  });

  it('adds dummies through the arena, and stops at the cap', () => {
    const { actions } = renderPanel('targets');
    fireEvent.click(screen.getByTestId('add-dummy-row'));
    expect(actions.addDummies).toHaveBeenCalledWith('row');
    act(() => {
      for (let i = 0; i < MAX_DUMMY_GROUPS; i++)
        useSandboxStore.getState().addDummyGroup({ layout: 'single', element: null });
    });
    expect(screen.getByTestId('add-dummy-single')).toBeDisabled();
    expect(screen.getByTestId('dummies-full')).toBeInTheDocument();
  });

  it("the sheet's Close answers the controller's B; Back to the Anvil carries no marker", () => {
    const { onClose, onExit } = renderPanel('toggles');
    const close = screen.getByTestId('training-panel-close');
    expect(close).toHaveAttribute('data-pad-back');
    expect(screen.getByRole('tablist')).toHaveAttribute('data-pad-tabs');
    const exit = screen.getByTestId('training-panel-exit');
    expect(exit).not.toHaveAttribute('data-pad-back');
    expect(exit).not.toHaveAttribute('data-pad-menu');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(exit);
    expect(onExit).toHaveBeenCalled();
  });

  it('a control lets go of focus when the pointer does; a list only when the pointer chose it', () => {
    renderPanel('targets');
    const button = screen.getByTestId('reset-dummies');
    button.focus();
    fireEvent.pointerUp(button);
    expect(document.activeElement).not.toBe(button);

    const depth = screen.getByTestId('training-depth') as HTMLSelectElement;
    depth.focus();
    fireEvent.change(depth, { target: { value: '7' } }); // reached with the keyboard: focus stays
    expect(document.activeElement).toBe(depth);
    fireEvent.pointerDown(depth);
    fireEvent.change(depth, { target: { value: '8' } }); // picked with the pointer: let go
    expect(document.activeElement).not.toBe(depth);
    expect(useSandboxStore.getState().depth).toBe(8);
  });
});
