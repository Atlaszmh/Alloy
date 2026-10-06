import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../../registry';
import { SAMPLE_QUESTS } from '../../../quests/__tests__/quest-fixture';
import { LeanCorner } from '../LeanCorner';

const store = () => useDelveStore.getState();

describe('LeanCorner', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().startDive(1);
  });

  const corner = (quests = SAMPLE_QUESTS) => {
    const on = { onMenu: vi.fn(), onJournal: vi.fn(), onPeek: vi.fn() };
    const dive = store().profile.dive!;
    render(
      <LeanCorner
        dive={dive}
        biome={getDelveRegistry().getBiomeForDepth(dive.depth)}
        quests={quests}
        map={null}
        {...on}
      />,
    );
    return on;
  };

  it('holds the depth, the minimap and one tracked objective, on its line', () => {
    corner();
    const root = screen.getByTestId('lean-corner');
    expect(within(root).getByTestId('depth-label')).toHaveTextContent('DEPTH 1');
    expect(within(root).getByTestId('minimap')).toHaveAttribute('data-tutorial', 'hud.minimap');
    const [first, second] = SAMPLE_QUESTS.filter((q) => q.tracked);
    const line = within(root).getByTestId(`tracked-${first.id}`);
    expect(line).toHaveTextContent(first.name);
    expect(line).toHaveTextContent(first.objectives.find((o) => !o.done)!.text);
    expect(within(root).queryByTestId(`tracked-${second.id}`)).toBeNull();
    expect(within(root).queryByRole('progressbar')).toBeNull();
  });

  it('with no tracked quest (or a guided step on the floor) holds no objective line', () => {
    corner([]);
    expect(screen.queryByTestId('quest-tracker')).toBeNull();
  });

  it("Journal, Menu and Map for the mouse, the pad's and the keys' targets in the fight", () => {
    const on = corner();
    const journal = screen.getByTestId('lean-corner').querySelector<HTMLElement>('[data-pad-journal]')!;
    fireEvent.click(journal);
    expect(on.onJournal).toHaveBeenCalledOnce();
    const menu = screen.getByRole('button', { name: 'Dive menu' });
    expect(menu).toHaveAttribute('data-pad-menu');
    fireEvent.click(menu);
    expect(on.onMenu).toHaveBeenCalledOnce();
    const map = screen.getByTestId('peek-button');
    expect(map).toHaveAttribute('data-pad-peek');
    fireEvent.click(map);
    expect(on.onPeek).toHaveBeenCalledOnce();
  });
});
