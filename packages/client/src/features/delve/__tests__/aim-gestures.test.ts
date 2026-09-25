import { describe, it, expect } from 'vitest';
import { aimMarkerFor, classifyPress, isCancelled } from '../arena/aim-gestures';

describe('aim gestures', () => {
  it('a quick, still press is a tap; a long or dragged one aims', () => {
    expect(classifyPress(80, 3)).toBe('tap');
    expect(classifyPress(400, 0)).toBe('aim');
    expect(classifyPress(60, 40)).toBe('aim');
  });

  it('placed forms show a circle, directional ones a line, self-centred ones nothing', () => {
    expect(aimMarkerFor('burst')).toBe('circle');
    expect(aimMarkerFor('maelstrom')).toBe('circle');
    expect(aimMarkerFor('bolt')).toBe('line');
    expect(aimMarkerFor('blink')).toBe('line');
    expect(aimMarkerFor('nova')).toBe('none');
    expect(aimMarkerFor('ward')).toBe('none');
  });

  it('releasing over the button cancels', () => {
    expect(isCancelled({ x: 102, y: 98 }, { x: 100, y: 100, r: 34 })).toBe(true);
    expect(isCancelled({ x: 100, y: 20 }, { x: 100, y: 100, r: 34 })).toBe(false);
  });
});
