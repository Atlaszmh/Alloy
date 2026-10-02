import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { padPrompts } from '@/features/delve/kit/prompts';
import type { PadButton } from '@/features/gamepad/gamepad';
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
      actions: { resetMeter: () => {} },
      cast: () => {},
      aim: () => {},
      cancelHold: () => {},
      potion: () => {},
      dodge: () => {},
      attack: () => {},
    };
  },
}));

/** The dock: a tab list, a socket that opens a picker (as the Abilities tab's builder does), and Close. */
vi.mock('@/features/delve/training/TrainingPanel', () => ({
  TrainingPanel: function Docked({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <aside data-testid="training-panel">
        <div role="tablist" data-pad-tabs="">
          <button type="button" role="tab" aria-selected="false">
            Loadout
          </button>
          <button type="button" role="tab" aria-selected="true">
            Targets
          </button>
        </div>
        <button type="button" onClick={() => setOpen(true)}>
          Socket 1
        </button>
        <button type="button" onClick={onClose} data-testid="training-panel-close">
          Close
        </button>
        {open && <RunePicker candidates={[]} onPick={() => {}} onClose={() => setOpen(false)} />}
      </aside>
    );
  },
}));

/** Every element given a box while `run` runs (jsdom lays nothing out; the scopes need one). */
function boxed(run: () => void) {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    act(run);
  } finally {
    box.mockRestore();
  }
}
const key = (code: string) => boxed(() => fireEvent.keyDown(document.body, { code }));
const pad = (button: PadButton) =>
  boxed(() => padPrompts(new Set([button]), {} as Record<PadButton, boolean>, 0));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/delve/training']}>
      <Routes>
        <Route path="/delve/training" element={<DelveTraining />} />
        <Route path="/delve" element={<div data-testid="anvil" />} />
      </Routes>
    </MemoryRouter>,
  );
}
const isPaused = () => live.paused.at(-1);
const dock = () => screen.getByTestId('training-panel').parentElement!;

describe('DelveTraining', () => {
  beforeEach(() => {
    live.calls.length = 0;
    live.paused.length = 0;
    useInputDeviceStore.setState({ device: 'keyboard' });
  });
  afterEach(() => useInputDeviceStore.setState({ device: 'keyboard' }));

  it('lays the Training bar, the 400 px dock (open on entry) and the skill dock on the HUD grid', () => {
    renderPage();
    expect(screen.getByTestId('training-bar').closest('[data-hud="top"]')).not.toBeNull();
    expect(screen.getAllByTestId('training-back')).toHaveLength(1);
    expect(screen.getByTestId('training-panel').closest('[data-hud="right"]')).not.toBeNull();
    expect(dock().getAttribute('style')).toBeNull();
    const grid = screen.getByTestId('training-panel').closest('.delve-hud-zoom')!;
    expect(grid.getAttribute('style')).toContain(
      'grid-template-columns: 380px minmax(0,1fr) 400px',
    );
    expect(screen.getByTestId('skill-bar').closest('[data-hud="dock"]')).not.toBeNull();
  });

  it('with the mouse, Panel opens and closes the dock and the fight runs on', () => {
    renderPage();
    expect(live.calls.at(-1)).toBe(true);
    const toggle = screen.getByTestId('training-panel-toggle');
    fireEvent.click(toggle);
    expect(screen.queryByTestId('training-panel')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId('training-panel')).toBeInTheDocument();
    expect(dock()).not.toHaveAttribute('data-pad-scope');
    expect(isPaused()).toBe(false);
    expect(live.calls.at(-1)).toBe(true);
    fireEvent.click(screen.getByTestId('training-panel-close'));
    expect(screen.queryByTestId('training-panel')).toBeNull();
    expect(isPaused()).toBe(false);
  });

  it('under the pad, View focuses the dock and pauses; B hands the pad back, the dock staying open', () => {
    renderPage();
    useInputDeviceStore.setState({ device: 'gamepad' });
    fireEvent.click(screen.getByTestId('training-panel-toggle')); // the arena's View
    expect(dock()).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('tab', { name: 'Targets' })).toHaveFocus();
    expect(isPaused()).toBe(true);
    expect(live.calls.at(-1)).toBe(false);
    pad('b');
    expect(dock()).not.toHaveAttribute('data-pad-scope');
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByTestId('training-panel')).toBeInTheDocument();
    expect(isPaused()).toBe(false);
    expect(live.calls.at(-1)).toBe(true);
  });

  it('View again, or Esc, hands the pad back too; Menu opens the menu over the focused dock', () => {
    renderPage();
    useInputDeviceStore.setState({ device: 'gamepad' });
    const toggle = screen.getByTestId('training-panel-toggle');
    fireEvent.click(toggle);
    pad('view');
    expect(isPaused()).toBe(false);
    fireEvent.click(toggle);
    key('Escape');
    expect(isPaused()).toBe(false);
    fireEvent.click(toggle);
    pad('menu');
    expect(screen.getByTestId('system-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('menu-resume'));
    expect(screen.queryByTestId('system-menu')).toBeNull();
    expect(dock()).toHaveAttribute('data-pad-scope');
    expect(isPaused()).toBe(true);
  });

  it('the pad leaving (a key, the mouse) hands the fight back: the dock lets go of the focus and unpauses', () => {
    renderPage();
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    fireEvent.click(screen.getByTestId('training-panel-toggle'));
    expect(isPaused()).toBe(true);
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
    expect(isPaused()).toBe(false);
    expect(dock()).not.toHaveAttribute('data-pad-scope');
    expect(live.calls.at(-1)).toBe(true);
  });

  it('Menu opens the system menu over the paused fight; Resume resumes and Anvil leaves', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('training-menu'));
    const menu = screen.getByTestId('system-menu');
    expect(isPaused()).toBe(true);
    expect(live.calls.at(-1)).toBe(false);
    fireEvent.click(within(menu).getByTestId('menu-resume'));
    expect(screen.queryByTestId('system-menu')).toBeNull();
    expect(isPaused()).toBe(false);
    fireEvent.click(screen.getByTestId('training-menu'));
    fireEvent.click(screen.getByTestId('menu-anvil'));
    expect(screen.getByTestId('anvil')).toBeInTheDocument();
  });

  it('pauses the arena while a rune picker is open in the dock', () => {
    renderPage();
    expect(isPaused()).toBe(false);
    fireEvent.click(screen.getByText('Socket 1'));
    expect(live.calls.at(-1)).toBe(false);
    expect(isPaused()).toBe(true);
    fireEvent.click(screen.getByTestId('rune-picker-close'));
    expect(live.calls.at(-1)).toBe(true);
    expect(isPaused()).toBe(false);
  });
});
