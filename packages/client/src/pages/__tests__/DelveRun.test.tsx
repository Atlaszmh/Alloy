import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createDelveProfile, startDive } from '@alloy/engine';
import { createArenaInput } from '@/features/delve/arena/input';
import { getDelveRegistry } from '@/features/delve/registry';
import { useDelveStore } from '@/stores/delveStore';
import type { PauseScreenProps } from '@/features/delve/hub/PauseScreen';
import { DelveRun } from '../DelveRun';

// The arena itself (Pixi) stands still: the page's HUD is what's under test.
vi.mock('@/features/delve/arena/useArena', () => ({
  useArena: () => ({
    input: createArenaInput(),
    heroScreen: () => null,
    pixelsPerUnit: () => 30,
    hud: null,
    worldRef: { current: null },
    cast: () => {},
    potion: () => {},
    dodge: () => {},
    attack: () => {},
  }),
}));

// The pause (3D's) as its contract: which tab it opens on, and Resume.
vi.mock('@/features/delve/hub/PauseScreen', () => ({
  PauseScreen: ({ link, onResume }: PauseScreenProps) => (
    <div data-testid="pause-stub" data-link={JSON.stringify(link ?? null)}>
      <button type="button" onClick={onResume}>
        Resume
      </button>
    </div>
  ),
}));

const renderRun = () =>
  render(
    <MemoryRouter>
      <DelveRun />
    </MemoryRouter>,
  );
const pauseLink = () => JSON.parse(screen.getByTestId('pause-stub').dataset.link!);

describe('DelveRun', () => {
  beforeEach(() => {
    const registry = getDelveRegistry();
    useDelveStore.setState({
      profile: startDive(registry, createDelveProfile(registry, 7), 1),
      diveDrops: [],
      floorDropsFrom: 0,
    });
  });

  it('lays the purse, the right column and the skill dock on the HUD grid, beside the arena host', () => {
    renderRun();
    const top = screen.getByTestId('purse-bar').closest('[data-hud="top"]');
    expect(top).not.toBeNull();
    expect(screen.getByTestId('skill-bar').closest('[data-hud="dock"]')).not.toBeNull();
    const grid = top!.parentElement!;
    expect(grid).toHaveClass('delve-hud-zoom');
    expect(grid.contains(screen.getByTestId('arena'))).toBe(false);
  });

  it("the purse's Menu opens the pause and never toggles it closed; Resume returns to the fight", () => {
    renderRun();
    const menu = screen.getByRole('button', { name: 'Dive menu' });
    fireEvent.click(menu);
    expect(screen.getByTestId('dive-pause')).toHaveClass('z-40');
    expect(pauseLink()).toBeNull();
    fireEvent.click(menu);
    expect(screen.getByTestId('pause-stub')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByTestId('pause-stub')).toBeNull();
    // The kebab menu is gone.
    expect(screen.queryByTestId('attack-mode-toggle')).toBeNull();
  });

  it('the Journal opens the pause on Quests', () => {
    const { container } = renderRun();
    fireEvent.click(container.querySelector<HTMLElement>('[data-pad-journal]')!);
    expect(pauseLink()).toEqual({ tab: 'quests' });
  });

  it("a find in the Found log opens the pause's Loadout on it", () => {
    const uid = useDelveStore.getState().profile.equipped.weapon!.uid;
    useDelveStore.getState().pushDiveDrops([uid]);
    renderRun();
    fireEvent.click(within(screen.getByTestId('pickup-feed')).getByTestId('loot-item'));
    expect(pauseLink()).toEqual({ tab: 'loadout', uid });
  });

  it('at the stop, the stop screen covers the arena; its Menu opens the pause over it, and Resume returns to it', () => {
    const { profile } = useDelveStore.getState();
    useDelveStore.setState({
      profile: {
        ...profile,
        dive: {
          ...profile.dive!,
          phase: 'choosing',
          doorChoices: ['winding'],
          stop: { offers: ['equip'], taken: false },
        },
      },
    });
    renderRun();
    const stop = screen.getByTestId('door-choice');
    expect(screen.getByTestId('door-winding')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-bar')).toBeNull();
    fireEvent.click(within(stop).getByRole('button', { name: 'Menu' }));
    const pause = screen.getByTestId('pause-stub');
    expect(stop.compareDocumentPosition(pause) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByTestId('pause-stub')).toBeNull();
    expect(screen.getByTestId('door-choice')).toBeInTheDocument();
  });
});
