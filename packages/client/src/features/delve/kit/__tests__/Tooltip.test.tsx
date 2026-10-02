import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useUIStore } from '@/stores/uiStore';
import { Tooltip, TooltipCard } from '../Tooltip';

afterEach(() => {
  document.getElementById('delve-ui-layer')?.remove();
  useUIStore.setState({ uiScale: 1, hudScale: 1 });
});

/** Puts the trigger at a known viewport box (jsdom lays nothing out). */
function at(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }) as DOMRect;
}

describe('the kit tooltip', () => {
  it('opens on hover and on focus, described by the trigger, in the zoomed layer', () => {
    render(
      <Tooltip content={() => <TooltipCard title="Voidweave Plate">Armor 41</TooltipCard>}>
        <button type="button">Chest</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Chest' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(trigger);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Voidweave PlateArmor 41');
    expect(tip.closest('#delve-ui-layer')).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-describedby', tip.id);
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('places the card from the trigger box divided by the zoom it renders under', () => {
    useUIStore.setState({ uiScale: 1.5, hudScale: 1 });
    const { rerender } = render(
      <Tooltip content={() => 'tip'}>
        <button type="button">Slot</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button');
    at(trigger, 300, 150, 60, 30);
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveStyle({ left: '252px', top: '100px' }); // 360 / 1.5 + 12
    rerender(
      <Tooltip content={() => 'tip'} placement="top">
        <button type="button">Slot</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveStyle({
      left: '220px', // (300 + 30) / 1.5
      top: '88px', // 150 / 1.5 − 12
      transform: 'translate(-50%, -100%)',
    });
  });

  it('renders inline under the HUD zoom with portal off, and stays open while asked', () => {
    useUIStore.setState({ uiScale: 1, hudScale: 1.25 });
    const ref = createRef<HTMLButtonElement>();
    render(
      <div className="delve-hud-zoom">
        <Tooltip content={() => 'Plasma Bolt'} portal={false} openWhile>
          <button type="button" ref={ref}>
            Q
          </button>
        </Tooltip>
      </div>,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip.closest('.delve-hud-zoom')).not.toBeNull();
    expect(document.getElementById('delve-ui-layer')).toBeNull();
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Q' }));
  });

  it('draws a card as a plate or glass, with its accent and prompts', () => {
    const { container, rerender } = render(
      <TooltipCard
        title="Voidweave Plate"
        subtitle="Epic chest"
        accent="#b55088"
        prompts={[{ id: 'equip', label: 'Equip', binding: { mouse: 'rmb', pad: 'a' } }]}
      >
        stats
      </TooltipCard>,
    );
    const card = container.firstElementChild!;
    expect(card).toHaveClass('k-tipcard', 'k-plate');
    expect(card).toHaveStyle({ width: '420px', borderColor: '#b55088' });
    expect(card).toHaveTextContent('Voidweave PlateEpic cheststatsRMBEquip');
    rerender(
      <TooltipCard title="Plasma Bolt" material="glass" width={320}>
        hit
      </TooltipCard>,
    );
    expect(container.firstElementChild).toHaveClass('k-glass');
    expect(container.firstElementChild).toHaveStyle({ width: '320px' });
  });
});
