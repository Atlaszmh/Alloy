import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLYPH_ART } from '../glyph-art';
import { KitGallery } from '../KitGallery';

describe('the kit gallery (dev)', () => {
  it('draws every kit piece on one screen', () => {
    render(<KitGallery />);
    expect(screen.getByTestId('kit-gallery')).toBeInTheDocument();
    for (const id of Object.keys(GLYPH_ART)) {
      expect(screen.getByRole('img', { name: id })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('tablist')).toHaveLength(2);
    expect(screen.getAllByRole('progressbar')).toHaveLength(4);
    expect(screen.getByRole('radiogroup', { name: 'Auto-salvage up to' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ember Fang, downgrade, locked, equipped' }),
    ).toBeInTheDocument();
  });
});
