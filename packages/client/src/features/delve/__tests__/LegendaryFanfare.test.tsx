import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { generateItem, SeededRNG } from '@alloy/engine';
import { LegendaryFanfare } from '../LegendaryFanfare';
import { getDelveRegistry } from '../registry';

beforeAll(() => {
  // jsdom has no Web Animations; the entrance is cosmetic.
  if (!Element.prototype.animate)
    Element.prototype.animate = function () {
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
});

describe('LegendaryFanfare', () => {
  it('celebrates the legendary in the kit, and a click goes on', () => {
    const item = generateItem(
      getDelveRegistry(),
      { uid: 'l1', ilvl: 10, rarity: 'legendary', slot: 'weapon', mana: 'fire' },
      new SeededRNG(1),
    );
    const onDone = vi.fn();
    render(<LegendaryFanfare item={item} firstTime onDone={onDone} />);
    const root = screen.getByTestId('legendary-fanfare');
    expect(root).toHaveClass('delve-ui', 'delve-zoom');
    expect(screen.getByTestId('fanfare-name')).toHaveTextContent(item.name);
    expect(root).toHaveTextContent('New codex entry!');
    fireEvent.click(root);
    expect(onDone).toHaveBeenCalledOnce();
  });
});
