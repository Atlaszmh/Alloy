import { describe, it, expect } from 'vitest';
import { TAP_MS, aimMarkerFor, classifyPress } from '../arena/aim';

describe('aim', () => {
  it('a quick press is a tap; a long one aims', () => {
    expect(classifyPress(80)).toBe('tap');
    expect(classifyPress(TAP_MS - 1)).toBe('tap');
    expect(classifyPress(TAP_MS)).toBe('aim');
    expect(classifyPress(400)).toBe('aim');
  });

  it('placed forms show a circle, directional ones a line, self-centred ones nothing', () => {
    expect(aimMarkerFor('burst')).toBe('circle');
    expect(aimMarkerFor('maelstrom')).toBe('circle');
    expect(aimMarkerFor('bolt')).toBe('line');
    expect(aimMarkerFor('blink')).toBe('line');
    expect(aimMarkerFor('nova')).toBe('none');
    expect(aimMarkerFor('ward')).toBe('none');
  });
});
