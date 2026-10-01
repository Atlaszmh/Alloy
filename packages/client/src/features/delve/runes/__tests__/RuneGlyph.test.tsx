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

  it('shows the icon and the tier in its family colour, and dims a dormant rune', () => {
    const { rerender } = render(<RuneGlyph rune={{ id: 'split', tier: 3 }} />);
    const glyph = screen.getByRole('img', { name: 'Split III' });
    expect(glyph).toHaveTextContent('✳️III');
    expect(glyph).toHaveStyle({ borderColor: '#22d3ee', opacity: '1' });
    rerender(<RuneGlyph rune={{ id: 'split', tier: 3 }} dormant />);
    expect(screen.getByRole('img', { name: 'Split III, dormant' })).toHaveStyle({
      opacity: '0.4',
    });
  });
});
