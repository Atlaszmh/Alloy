import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createDelveProfile, startDive } from '@alloy/engine';
import { createArenaInput } from '@/features/delve/arena/input';
import { getDelveRegistry } from '@/features/delve/registry';
import { useDelveStore } from '@/stores/delveStore';
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

describe('DelveRun', () => {
  beforeEach(() => {
    const registry = getDelveRegistry();
    useDelveStore.setState({ profile: startDive(registry, createDelveProfile(registry, 7), 1) });
  });

  it('lays the purse, the right column and the skill dock on the HUD grid, beside the arena host', () => {
    render(
      <MemoryRouter>
        <DelveRun />
      </MemoryRouter>,
    );
    const top = screen.getByTestId('purse-bar').closest('[data-hud="top"]');
    expect(top).not.toBeNull();
    expect(screen.getByTestId('skill-bar').closest('[data-hud="dock"]')).not.toBeNull();
    const grid = top!.parentElement!;
    expect(grid).toHaveClass('delve-hud-zoom');
    expect(grid.contains(screen.getByTestId('arena'))).toBe(false);
  });

  it("the purse's Menu opens the dive menu and never toggles it closed", () => {
    render(
      <MemoryRouter>
        <DelveRun />
      </MemoryRouter>,
    );
    const menu = screen.getByRole('button', { name: 'Dive menu' });
    fireEvent.click(menu);
    expect(screen.getByTestId('attack-mode-toggle')).toBeInTheDocument();
    fireEvent.click(menu);
    expect(screen.getByTestId('attack-mode-toggle')).toBeInTheDocument();
  });

  it('at the stop, the stop screen covers the arena and its Menu opens the dive menu over it', () => {
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
    render(
      <MemoryRouter>
        <DelveRun />
      </MemoryRouter>,
    );
    const stop = screen.getByTestId('door-choice');
    expect(screen.getByTestId('door-winding')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-bar')).toBeNull();
    fireEvent.click(within(stop).getByRole('button', { name: 'Menu' }));
    const menu = screen.getByTestId('attack-mode-toggle');
    expect(stop.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
