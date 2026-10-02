import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createDelveProfile, startDive } from '@alloy/engine';
import { createArenaInput } from '@/features/delve/arena/input';
import { getDelveRegistry } from '@/features/delve/registry';
import { useDelveStore } from '@/stores/delveStore';
import type { PauseScreenProps } from '@/features/delve/hub/PauseScreen';
import type { StopScreenProps } from '@/features/delve/stop/StopScreen';
import { DelveRun } from '../DelveRun';

/** What the mocks saw: each render's props, and the arena's HUD tick. */
const seen = vi.hoisted(() => ({
  pause: [] as object[],
  stop: [] as object[],
  tick: null as null | (() => void),
}));

// The arena itself (Pixi) stands still: the page's HUD is what's under test. `seen.tick` re-renders
// the page as the arena's 80 ms HUD refresh does.
vi.mock('@/features/delve/arena/useArena', async () => {
  const { useState } = await import('react');
  return {
    useArena: () => {
      const [, setTick] = useState(0);
      seen.tick = () => setTick((n) => n + 1);
      return {
        input: createArenaInput(),
        heroScreen: () => null,
        pixelsPerUnit: () => 30,
        hud: null,
        worldRef: { current: null },
        cast: () => {},
        potion: () => {},
        dodge: () => {},
        attack: () => {},
      };
    },
  };
});

// The pause (3D's) as its contract: which tab it opens on, and Resume.
vi.mock('@/features/delve/hub/PauseScreen', () => ({
  PauseScreen: (props: PauseScreenProps) => {
    seen.pause.push(props);
    return (
      <div data-testid="pause-stub" data-link={JSON.stringify(props.link ?? null)}>
        <button type="button" onClick={props.onResume}>
          Resume
        </button>
      </div>
    );
  },
}));

// The stop as it is, its props recorded.
vi.mock('@/features/delve/stop/StopScreen', async (orig) => {
  const real = await orig<typeof import('@/features/delve/stop/StopScreen')>();
  return {
    ...real,
    StopScreen: (props: StopScreenProps) => {
      seen.stop.push(props);
      return <real.StopScreen {...props} />;
    },
  };
});

/** The last two renders' props are the same values, key by key (so a memo skips the second). */
const heldStill = (renders: object[]) => {
  const [a, b] = renders.slice(-2) as Record<string, unknown>[];
  expect(Object.keys(b)).toEqual(Object.keys(a));
  for (const k of Object.keys(a)) expect(b[k], k).toBe(a[k]);
};

const renderRun = () =>
  render(
    <MemoryRouter>
      <DelveRun />
    </MemoryRouter>,
  );
const pauseLink = () => JSON.parse(screen.getByTestId('pause-stub').dataset.link!);

describe('DelveRun', () => {
  beforeEach(() => {
    seen.pause.length = 0;
    seen.stop.length = 0;
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

  it('a HUD tick hands the stop and the pause over it the same props, so their memos skip it', () => {
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
    fireEvent.click(
      within(screen.getByTestId('door-choice')).getByRole('button', { name: 'Menu' }),
    );
    const [pauses, stops] = [seen.pause.length, seen.stop.length];
    act(() => seen.tick!());
    expect(seen.pause.length).toBe(pauses + 1);
    expect(seen.stop.length).toBe(stops + 1);
    heldStill(seen.pause);
    heldStill(seen.stop);
  });
});
