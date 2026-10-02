import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RARITY_COLOR } from '../format';
import { ItemIcon } from '../ItemIcon';
import { getDelveRegistry } from '../registry';

function fills(svg: Element): string[] {
  return [...new Set([...svg.querySelectorAll('rect')].map((r) => r.getAttribute('fill')!))];
}

describe('ItemIcon', () => {
  it('draws every gear base from its own pixel map', () => {
    for (const base of getDelveRegistry().getDelveData().bases) {
      const { container, unmount } = render(<ItemIcon baseId={base.id} rarity="magic" />);
      expect(container.querySelector('svg')).toHaveAttribute('data-base', base.id);
      unmount();
    }
  });

  it('fills the rarity colour inside a #181425 outline, on a crisp 10×10 grid', () => {
    const { container } = render(<ItemIcon baseId="sword" rarity="legendary" size={40} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 10 10');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('shape-rendering', 'crispEdges');
    expect(fills(svg).sort()).toEqual(['#181425', RARITY_COLOR.legendary].sort());
  });

  it('falls back to the ring, and draws a ghost dim with no outline', () => {
    const { container, rerender } = render(<ItemIcon baseId="nope" rarity="common" />);
    expect(container.querySelector('svg')).toHaveAttribute('data-base', 'ring');
    rerender(<ItemIcon baseId="helm" rarity="common" ghost />);
    const svg = container.querySelector('svg')!;
    expect(fills(svg)).toEqual(['#5a6988']);
    expect(svg).toHaveStyle({ opacity: '0.35' });
  });
});
