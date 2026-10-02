import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactionsGrid } from '../ReactionsGrid';

describe('ReactionsGrid', () => {
  it('names the reactions it is told about and hides the rest', () => {
    render(<ReactionsGrid reactionsSeen={['melt']} />);
    expect(screen.getByTestId('reaction-melt')).toBeInTheDocument();
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(14);
    expect(screen.getAllByTestId('reaction-unknown')[0]).toHaveTextContent(
      'Stack one element on a foe, then hit it with another, to discover.',
    );
    expect(screen.getByText('1/15 discovered')).toBeInTheDocument();
  });
});

describe('ReactionsGrid in the Codex', () => {
  it("draws a discovered reaction's two elements as glyphs, and reports the card hovered or focused", () => {
    const onActive = vi.fn();
    render(<ReactionsGrid reactionsSeen={['melt']} active="melt" onActive={onActive} />);
    const melt = screen.getByTestId('reaction-melt');
    expect(
      [...melt.querySelectorAll('[data-glyph]')].map((g) => g.getAttribute('data-glyph')),
    ).toEqual(['fire', 'frost']);
    expect(melt).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseEnter(screen.getAllByTestId('reaction-unknown')[0]);
    fireEvent.focus(melt);
    expect(onActive.mock.calls.map(([id]) => id)).toEqual([expect.any(String), 'melt']);
    expect(screen.getAllByTestId('reaction-unknown')[0].querySelector('[data-glyph]')).toBeNull();
  });
});
