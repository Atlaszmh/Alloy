import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useSandboxStore } from '@/stores/sandboxStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { DamageMeter } from '../training/meter';
import { DepthLabel, TrainingBar } from '../training/TrainingBar';

describe('TrainingBar', () => {
  beforeEach(() => {
    useSandboxStore.getState().reset();
    useInputDeviceStore.setState({ device: 'keyboard' });
  });

  const bar = (panelOpen: boolean) => {
    const on = { back: vi.fn(), panel: vi.fn(), menu: vi.fn(), reset: vi.fn() };
    const view = render(
      <MemoryRouter>
        <TrainingBar
          meter={new DamageMeter().summary(0)}
          onResetMeter={on.reset}
          panelOpen={panelOpen}
          onBack={on.back}
          onPanel={on.panel}
          onMenu={on.menu}
        />
      </MemoryRouter>,
    );
    return { on, view };
  };

  it('holds one Anvil, the depth and the meter, then Panel (the journal marker) and Menu (the menu marker)', () => {
    const { on } = bar(true);
    fireEvent.click(screen.getByTestId('training-back'));
    expect(on.back).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Back to the Anvil' })).toHaveTextContent('◂ Anvil');
    expect(screen.getByTestId('training-depth-label')).toHaveTextContent('Depth 5');
    expect(screen.getByTestId('meter-dps')).toHaveTextContent('0 DPS');
    fireEvent.click(screen.getByTestId('meter-reset'));
    expect(on.reset).toHaveBeenCalledTimes(1);

    const panel = screen.getByTestId('training-panel-toggle');
    expect(panel).toHaveAttribute('data-pad-journal');
    expect(panel).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveTextContent('JPanel');
    fireEvent.click(panel);
    expect(on.panel).toHaveBeenCalledTimes(1);
    const menu = screen.getByTestId('training-menu');
    expect(menu).toHaveAttribute('data-pad-menu');
    expect(menu).toHaveTextContent('EscMenu');
    fireEvent.click(menu);
    expect(on.menu).toHaveBeenCalledTimes(1);
    // Glyphs, not emoji.
    expect(screen.getByTestId('training-bar').textContent).not.toMatch(
      /\p{Extended_Pictographic}/u,
    );
  });

  it("Panel says when the dock is closed, and the dev build's DPS Lab button wears a glyph", () => {
    bar(false);
    expect(screen.getByTestId('training-panel-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('training-lab').querySelector('[data-glyph="lab"]')).not.toBeNull();
  });
});

describe('DepthLabel', () => {
  beforeEach(() => useSandboxStore.getState().reset());

  it('shows the depth, and the slow-motion speed when it is not 1×', () => {
    render(<DepthLabel />);
    expect(screen.getByTestId('training-depth-label')).toHaveTextContent('Depth 5');
    expect(screen.queryByTestId('training-slowmo')).toBeNull();
    act(() => useSandboxStore.getState().setSlowmo(0.5));
    expect(screen.getByTestId('training-slowmo')).toHaveTextContent('0.5×');
  });
});
