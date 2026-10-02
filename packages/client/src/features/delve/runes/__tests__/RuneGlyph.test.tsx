import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RUNE_FAMILIES } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { RuneGlyph } from '../RuneGlyph';
import { FAMILY_STYLE, dormantText, runeName } from '../rune-style';

const registry = getDelveRegistry();

describe('RuneGlyph and the rune style', () => {
  it('names a rune with its tier, and every family has a colour and a name', () => {
    expect(runeName(registry, { id: 'split', tier: 3 })).toBe('Split III');
    expect(runeName(registry, { id: 'quick', tier: 5 })).toBe('Quick V');
    for (const f of RUNE_FAMILIES) expect(FAMILY_STYLE[f].label).toBeTruthy();
    expect(FAMILY_STYLE.shape).toEqual({ color: '#22d3ee', label: 'Shape' });
  });

  it("says why a rune is dormant: Linger's kinds, else nothing on this move", () => {
    expect(dormantText(registry.getRune('linger'))).toBe('Works on heavy and hold blows');
    expect(dormantText(registry.getRune('split'))).toBe('Does nothing on this move');
  });

  it("shows its family's pixel glyph and the tier in its family colour, and dims a dormant rune", () => {
    const { rerender } = render(<RuneGlyph rune={{ id: 'split', tier: 3 }} />);
    const glyph = screen.getByRole('img', { name: 'Split III' });
    expect(glyph).toHaveTextContent(/^III$/);
    expect(glyph.querySelector('[data-glyph="rune-shape"] rect')).toHaveAttribute(
      'fill',
      '#22d3ee',
    );
    expect(glyph).toHaveStyle({ borderColor: '#22d3ee', opacity: '1' });
    rerender(<RuneGlyph rune={{ id: 'split', tier: 3 }} dormant />);
    expect(screen.getByRole('img', { name: 'Split III, dormant' })).toHaveStyle({
      opacity: '0.4',
    });
  });

  it('every rune wears a glyph, never emoji, and no text under 14 px, at both sizes', () => {
    for (const def of registry.getRunes())
      for (const size of ['sm', 'md'] as const) {
        const { container, unmount } = render(
          <RuneGlyph rune={{ id: def.id, tier: 1 }} size={size} />,
        );
        expect(container.querySelector(`[data-glyph="rune-${def.family}"]`)).not.toBeNull();
        expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(container.innerHTML).not.toMatch(/text-(\[(\d|1[0-3])px\]|xs\b)/);
        unmount();
      }
  });
});
