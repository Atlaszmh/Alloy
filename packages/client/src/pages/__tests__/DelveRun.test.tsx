import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  createDelveProfile,
  questStates,
  settleDive,
  startDive,
  type DelveProfile,
  type QuestState,
} from '@alloy/engine';
import { createArenaInput } from '@/features/delve/arena/input';
import { getDelveRegistry } from '@/features/delve/registry';
import { useDelveStore } from '@/stores/delveStore';
import type { PauseScreenProps } from '@/features/delve/hub/PauseScreen';
import type { StopScreenProps } from '@/features/delve/stop/StopScreen';
import type { ArenaUiEvent } from '@/features/delve/arena/useArena';
import { DelveRun } from '../DelveRun';

/** What the mocks saw: each render's props, the arena's `paused` and HUD tick, and the pad's owner. */
const seen = vi.hoisted(() => ({
  pause: [] as object[],
  stop: [] as object[],
  paused: [] as boolean[],
  live: [] as boolean[],
  tick: null as null | (() => void),
  onUi: null as null | ((e: ArenaUiEvent) => void),
  /** The order the arena's flush and the engine's settle ran in. */
  calls: [] as string[],
}));

// The engine's settle is stage 4c's B1: here an abandon settles the dive, two Iron bars lost.
vi.mock('@alloy/engine', async (orig) => {
  const real = await orig<typeof import('@alloy/engine')>();
  return {
    ...real,
    // The engine's quests are B1's: each test says what the HUD tracker reads.
    questStates: vi.fn((): QuestState[] => []),
    settleDive: vi.fn(
      (_registry: unknown, p: DelveProfile) => (
        seen.calls.push('settle'),
        {
          ...p,
          dive: {
            ...p.dive!,
            settled: true,
            lost: real.addMaterial(real.emptyHaul(), { kind: 'metal', metal: 'iron' }, 2),
          },
        }
      ),
    ),
  };
});

vi.mock('@/features/gamepad/gamepad-hub', async (orig) => ({
  ...(await orig<object>()),
  setArenaLive: (on: boolean) => seen.live.push(on),
}));

// The arena itself (Pixi) stands still: the page's HUD is what's under test. `seen.tick` re-renders
// the page as the arena's 80 ms HUD refresh does.
vi.mock('@/features/delve/arena/useArena', async () => {
  const { useState } = await import('react');
  return {
    useArena: (_host: unknown, opts: { paused: boolean; onUi: (e: ArenaUiEvent) => void }) => {
      seen.paused.push(opts.paused);
      seen.onUi = opts.onUi;
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
        flush: () => seen.calls.push('flush'),
        leave: () => seen.calls.push('leave'),
        alcove: () => (seen.calls.push('alcove'), { ok: true }),
      };
    },
  };
});

// The pause (3D's) as its contract: which tab it opens on, Resume, the Anvil and Abandon.
vi.mock('@/features/delve/hub/PauseScreen', () => ({
  PauseScreen: (props: PauseScreenProps) => {
    seen.pause.push(props);
    return (
      <div data-testid="pause-stub" data-link={JSON.stringify(props.link ?? null)}>
        <button type="button" onClick={props.onResume}>
          Resume
        </button>
        <button type="button" onClick={props.onAnvil}>
          Anvil
        </button>
        <button type="button" onClick={props.onAbandon}>
          Abandon
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
    <MemoryRouter initialEntries={['/delve/run']}>
      <Routes>
        <Route path="/delve/run" element={<DelveRun />} />
        <Route path="/delve" element={<div data-testid="anvil" />} />
      </Routes>
    </MemoryRouter>,
  );
const pauseLink = () => JSON.parse(screen.getByTestId('pause-stub').dataset.link!);

describe('DelveRun', () => {
  beforeAll(() => {
    // jsdom has no Web Animations; the summary's title entrance is cosmetic.
    if (!Element.prototype.animate)
      Element.prototype.animate = function () {
        return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
      };
  });

  beforeEach(() => {
    seen.pause.length = 0;
    seen.stop.length = 0;
    seen.paused.length = 0;
    seen.live.length = 0;
    seen.calls.length = 0;
    vi.mocked(questStates).mockImplementation(() => []);
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

  it('the pause stops the fight: the arena is paused and the pad goes to the menus', () => {
    renderRun();
    expect(seen.paused.at(-1)).toBe(false);
    expect(seen.live.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    expect(seen.paused.at(-1)).toBe(true);
    expect(seen.live.at(-1)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(seen.paused.at(-1)).toBe(false);
    expect(seen.live.at(-1)).toBe(true);
  });

  it('the exit gate asks first, over the paused arena: Back stays, Leave takes the exit', () => {
    renderRun();
    act(() => seen.onUi!({ kind: 'exitRequest', unexplored: 2 }));
    const confirm = screen.getByTestId('exit-confirm');
    expect(confirm).toHaveTextContent('2 rooms unexplored.');
    expect(seen.paused.at(-1)).toBe(true);
    expect(seen.live.at(-1)).toBe(false);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Back' }));
    expect(screen.queryByTestId('exit-confirm')).toBeNull();
    expect(seen.paused.at(-1)).toBe(false);
    expect(seen.calls).toEqual([]);
    act(() => seen.onUi!({ kind: 'exitRequest', unexplored: 0 }));
    fireEvent.click(screen.getByTestId('exit-leave'));
    expect(seen.calls).toEqual(['leave']);
    expect(screen.queryByTestId('exit-confirm')).toBeNull();
    expect(seen.paused.at(-1)).toBe(false);
  });

  it("an anvil alcove opens the stop's cards over the paused arena; a take goes through the dive and closes them", () => {
    renderRun();
    act(() => seen.onUi!({ kind: 'alcove', offers: ['equip', 'upgrade'] }));
    const dialog = screen.getByTestId('alcove-dialog');
    expect(within(dialog).getByTestId('stop-equip')).toBeInTheDocument();
    expect(seen.paused.at(-1)).toBe(true);
    fireEvent.click(within(dialog).getByTestId('stop-upgrade'));
    fireEvent.click(within(dialog).getAllByTestId('stop-upgrade-item')[0]);
    expect(seen.calls).toEqual(['alcove']);
    expect(screen.queryByTestId('alcove-dialog')).toBeNull();
    expect(seen.paused.at(-1)).toBe(false);
  });

  it("the pause's Anvil goes to the Anvil keeping the dive; Abandon settles it as a death, shows the summary, then closes it", () => {
    renderRun();
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anvil' }));
    expect(screen.getByTestId('anvil')).toBeInTheDocument();
    expect(useDelveStore.getState().profile.dive).not.toBeNull();
    // The floor restarts on the way back: what it picked up since the last bank banks first.
    expect(seen.calls).toEqual(['flush']);

    seen.calls.length = 0;
    cleanup();
    renderRun();
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
    expect(settleDive).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'abandon');
    // What the floor picked up since the last bank banks first, so the summary counts it lost.
    expect(seen.calls).toEqual(['flush', 'settle']);
    expect(screen.queryByTestId('pause-stub')).toBeNull();
    const summary = screen.getByTestId('dive-summary');
    expect(summary).toHaveTextContent('ABANDONED');
    expect(within(screen.getByTestId('dive-lost')).getByTestId('haul-row')).toHaveTextContent(
      'Iron bar×2',
    );
    // The fight stays paused under the summary.
    expect(seen.paused.at(-1)).toBe(true);
    fireEvent.click(screen.getByTestId('return-camp'));
    expect(screen.getByTestId('anvil')).toBeInTheDocument();
    expect(useDelveStore.getState().profile.dive).toBeNull();
  });

  it('an abandon at the stop takes the stop away for the summary', () => {
    const { profile } = useDelveStore.getState();
    useDelveStore.setState({
      profile: {
        ...profile,
        dive: { ...profile.dive!, phase: 'choosing', doorChoices: ['winding'], stop: null },
      },
    });
    renderRun();
    fireEvent.click(
      within(screen.getByTestId('door-choice')).getByRole('button', { name: 'Menu' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
    expect(screen.queryByTestId('door-choice')).toBeNull();
    expect(screen.getByTestId('dive-summary')).toHaveTextContent('ABANDONED');
  });

  it('a pattern picked up is learned at once, with a toast', () => {
    renderRun();
    act(() => seen.onUi!({ kind: 'patterns', ids: ['maul'] }));
    expect(screen.getByText('Pattern learned: Maul')).toBeInTheDocument();
  });

  it('the HUD tracker moves as the dive banks, and the bank that finishes a quest toasts it', () => {
    const first = getDelveRegistry().getQuestsData().quests[0];
    const { count } = first.objectives[0];
    // `questStates` as the tracker reads it: the first quest, tracked, its progress the save's.
    vi.mocked(questStates).mockImplementation((_registry, p: DelveProfile) => [
      {
        id: first.id,
        kind: first.kind,
        status: 'active',
        isNew: false,
        tracked: true,
        name: first.name,
        line: first.line,
        objectives: first.objectives.map((o, i) => ({
          id: o.id,
          text: o.text,
          count: o.count,
          ...(p.quests.progress[first.id]?.[i] ?? { value: 0, done: false }),
        })),
        rewards: [],
      },
    ]);
    /** A bank: the save's progress on each of the first quest's objectives. */
    const bank = (value: number, done: boolean) =>
      act(() => {
        const s = useDelveStore.getState();
        const progress = { [first.id]: first.objectives.map(() => ({ value, done })) };
        s.setProfile({ ...s.profile, quests: { ...s.profile.quests, progress } });
      });
    bank(0, false);
    renderRun();
    const tracked = () => screen.getByTestId(`tracked-${first.id}`);
    expect(tracked()).toHaveTextContent(`0 / ${count}`);
    bank(1, false);
    expect(tracked()).toHaveTextContent(`1 / ${count}`);
    expect(within(tracked()).getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '1');
    bank(count, true);
    expect(within(tracked()).getAllByRole('img', { name: 'Done' })).toHaveLength(
      first.objectives.length,
    );
    expect(
      screen.getByText(`Quest complete: ${first.name} · claim at the Anvil`),
    ).toBeInTheDocument();
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
    // Back from the Anvil, the dive is still at this stop: its Anvil says so.
    expect(seen.pause.at(-1)).toMatchObject({ atStop: true });
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByTestId('pause-stub')).toBeNull();
    expect(screen.getByTestId('door-choice')).toBeInTheDocument();
  });

  it('the pause makes the stop and the HUD behind it inert, and the stop the HUD: Tab stays in the top screen', () => {
    renderRun();
    const hud = () => screen.getByTestId('purse-bar').closest('.delve-hud-zoom')!;
    expect(hud()).not.toHaveAttribute('inert');
    expect(hud()).not.toHaveStyle({ visibility: 'hidden' });
    fireEvent.click(screen.getByRole('button', { name: 'Dive menu' }));
    expect(hud()).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(hud()).not.toHaveAttribute('inert');

    const { profile } = useDelveStore.getState();
    act(() =>
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
      }),
    );
    const stop = screen.getByTestId('door-choice').parentElement!;
    expect(hud()).toHaveAttribute('inert');
    // The stop has its own counts, finds and Menu: the HUD is laid out under it, not drawn.
    expect(hud()).toHaveStyle({ visibility: 'hidden' });
    expect(stop).not.toHaveAttribute('inert');
    fireEvent.click(within(stop).getByRole('button', { name: 'Menu' }));
    expect(stop).toHaveAttribute('inert');
    expect(hud()).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(stop).not.toHaveAttribute('inert');
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
