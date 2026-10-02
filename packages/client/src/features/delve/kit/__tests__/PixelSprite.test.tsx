import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useUIStore } from '@/stores/uiStore';
import { PixelSprite } from '../PixelSprite';

const ATLAS = {
  frames: {
    'hero/0': { frame: { x: 154, y: 180, w: 16, h: 16 } },
    'hero/1': { frame: { x: 171, y: 180, w: 16, h: 16 } },
  },
  animations: { hero: ['hero/0', 'hero/1'] },
  meta: { image: 'atlas.png', size: { w: 255, h: 228 } },
};

const fetchAtlas = vi.fn(async () => ({ json: async () => ATLAS }));

beforeAll(() => {
  vi.stubGlobal('fetch', fetchAtlas);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  useUIStore.setState({ uiScale: 1, hudScale: 1 });
});

describe('PixelSprite', () => {
  it('draws a frame of the atlas at its scale, fetching the atlas once', async () => {
    render(
      <>
        <PixelSprite id="hero" scale={10} context="ui" label="Your hero" />
        <PixelSprite id="hero" scale={4} context="ui" frame={1} />
      </>,
    );
    const hero = await screen.findByRole('img', { name: 'Your hero' });
    await waitFor(() => expect(hero).toHaveStyle({ width: '160px' }));
    expect(hero).toHaveStyle({
      height: '160px',
      backgroundImage: 'url(/sprites/delve/atlas.png)',
      backgroundSize: '2550px 2280px',
      backgroundPosition: '-1540px -1800px',
    });
    const small = document.querySelectorAll('[data-sprite="hero"]')[1];
    expect(small).toHaveAttribute('aria-hidden', 'true');
    expect(small).toHaveStyle({ width: '64px', backgroundPosition: '-684px -720px' });
    expect(fetchAtlas).toHaveBeenCalledOnce();
  });

  it('snaps to whole device pixels under the zoom of its context', async () => {
    useUIStore.setState({ uiScale: 1, hudScale: 1.25 });
    render(
      <>
        <PixelSprite id="hero" scale={3.3} context="ui" label="ui" />
        <PixelSprite id="hero" scale={3.3} context="hud" label="hud" />
      </>,
    );
    const ui = await screen.findByRole('img', { name: 'ui' });
    const hud = screen.getByRole('img', { name: 'hud' });
    const width = (el: HTMLElement) => parseFloat(el.style.width);
    await waitFor(() => expect(width(ui)).toBe(48)); // 3.3 device px → 3 a sprite pixel
    expect(width(hud)).toBeCloseTo(16 * (4 / 1.25), 5); // zoom 1.25: 4.125 → 4 device px
    act(() => useUIStore.setState({ uiScale: 1.5 }));
    expect(width(ui)).toBeCloseTo(16 * (5 / 1.5), 5); // 4.95 → 5
    expect(width(hud)).toBeCloseTo(16 * (7 / 2), 5); // zoom 1.875 → 2: 6.6 → 7
  });

  it('stays empty for an id without art', async () => {
    render(<PixelSprite id="chest" scale={4} context="ui" label="Chest" />);
    await act(async () => {});
    expect(screen.getByRole('img', { name: 'Chest' })).not.toHaveAttribute('style');
  });
});
