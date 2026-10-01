import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createArenaInput } from '@/features/delve/arena/input';
import { RunePicker } from '@/features/delve/runes/RunePicker';
import { DamageMeter } from '@/features/delve/training/meter';
import { DelveTraining } from '../DelveTraining';

const live = vi.hoisted(() => ({ calls: [] as boolean[], paused: [] as boolean[] }));

vi.mock('@/features/gamepad/gamepad-hub', async (orig) => ({
  ...(await orig<object>()),
  setArenaLive: (on: boolean) => live.calls.push(on),
}));

// The arena itself (Pixi) stands still: the page's pause is what's under test.
vi.mock('@/features/delve/training/useTrainingArena', () => ({
  useTrainingArena: (_host: unknown, opts: { paused: boolean }) => {
    live.paused.push(opts.paused);
    return {
      input: createArenaInput(),
      heroScreen: () => null,
      pixelsPerUnit: () => 30,
      hud: null,
      meter: new DamageMeter().summary(0),
      actions: {},
      cast: () => {},
      aim: () => {},
      cancelHold: () => {},
      potion: () => {},
      dodge: () => {},
      attack: () => {},
    };
  },
}));

/** The docked panel, holding a socket that opens a picker (as the Abilities tab's builder does). */
vi.mock('@/features/delve/training/TrainingPanel', async (orig) => ({
  ...(await orig<object>()),
  openLayout: () => 'dock',
  TrainingPanel: function Docked() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Socket 1
        </button>
        {open && <RunePicker candidates={[]} onPick={() => {}} onClose={() => setOpen(false)} />}
      </>
    );
  },
}));

describe('DelveTraining', () => {
  beforeEach(() => {
    live.calls.length = 0;
    live.paused.length = 0;
  });

  it('pauses the arena while a rune picker is open over the docked panel', () => {
    render(
      <MemoryRouter>
        <DelveTraining />
      </MemoryRouter>,
    );
    expect(live.calls.at(-1)).toBe(true);
    expect(live.paused.at(-1)).toBe(false);
    fireEvent.click(screen.getByText('Socket 1'));
    expect(live.calls.at(-1)).toBe(false);
    expect(live.paused.at(-1)).toBe(true);
    fireEvent.click(screen.getByTestId('rune-picker-close'));
    expect(live.calls.at(-1)).toBe(true);
    expect(live.paused.at(-1)).toBe(false);
  });
});
