import { describe, it, expect, afterEach } from 'vitest';
import { useUIStore } from '@/stores/uiStore';
import { hasZoomedAncestor, hudZoom, layerZoom, snapScale } from '../zoom';
import { uiLayer } from '../layer';

afterEach(() => {
  document.body.innerHTML = '';
  useUIStore.setState({ uiScale: 1, hudScale: 1 });
});

function nest(...classes: string[]): HTMLElement {
  let parent: HTMLElement = document.body;
  for (const c of classes) {
    const el = document.createElement('div');
    el.className = c;
    parent.appendChild(el);
    parent = el;
  }
  return parent;
}

describe('the kit zoom', () => {
  it('snaps a sprite scale to whole device pixels per sprite pixel', () => {
    expect(snapScale(10, 1, 1)).toBe(10);
    expect(snapScale(10, 1.25, 1)).toBe(10.4); // 12.5 rounds to 13 device px
    expect(snapScale(4, 0.75, 1)).toBe(4); // 3 device px
    expect(snapScale(4, 0.75, 2)).toBeCloseTo(4, 10); // 6 device px
    expect(snapScale(4, 1.5, 1.25)).toBeCloseTo(8 / 1.875, 10); // 7.5 device px rounds to 8
    expect(snapScale(0.1, 1, 1)).toBe(1); // never under one device pixel
  });

  it('steps the HUD zoom by quarters, never under 0.75', () => {
    expect(hudZoom(1, 1)).toBe(1);
    expect(hudZoom(1.5, 1.1)).toBe(1.75); // 1.65 → 1.75
    expect(hudZoom(0.75, 0.8)).toBe(0.75); // 0.6 → the floor
    expect(hudZoom(2, 1.1)).toBe(2.25);
  });

  it('reads the zoom an element sits under from its layer class', () => {
    useUIStore.setState({ uiScale: 1.5, hudScale: 1.1 });
    expect(layerZoom(nest('a', 'b'))).toBe(1);
    expect(layerZoom(nest('delve-ui delve-zoom', 'x'))).toBe(1.5);
    expect(layerZoom(nest('delve-hud-zoom', 'x'))).toBe(1.75);
    expect(layerZoom(nest('delve-zoom'))).toBe(1.5); // the layer itself
  });

  it('finds a zoomed ancestor by class or by a zoom style, never the element itself', () => {
    expect(hasZoomedAncestor(nest('delve-ui', 'host'))).toBe(false);
    expect(hasZoomedAncestor(nest('delve-zoom', 'wrap', 'host'))).toBe(true);
    expect(hasZoomedAncestor(nest('delve-hud-zoom', 'host'))).toBe(true);
    expect(hasZoomedAncestor(nest('delve-zoom'))).toBe(false);
    const styled = nest('wrap', 'host');
    styled.parentElement!.style.zoom = '1.5';
    expect(hasZoomedAncestor(styled)).toBe(true);
  });

  it('makes the portal layer once, zoomed with the kit look', () => {
    const layer = uiLayer();
    expect(layer.id).toBe('delve-ui-layer');
    expect(layer).toHaveClass('delve-ui', 'delve-zoom');
    expect(layer.parentElement).toBe(document.body);
    expect(uiLayer()).toBe(layer);
    expect(document.querySelectorAll('#delve-ui-layer')).toHaveLength(1);
  });
});
