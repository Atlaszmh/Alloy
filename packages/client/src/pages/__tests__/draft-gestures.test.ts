import { describe, it, expect } from 'vitest';
import { classifyGesture } from '../draft-gestures';

describe('draft gesture classification', () => {
  it('classifies small movement + short hold as tap', () => {
    expect(classifyGesture({ x: 100, y: 100 }, { x: 102, y: 103 }, 100)).toBe('tap');
  });

  it('classifies zero movement + short hold as tap', () => {
    expect(classifyGesture({ x: 100, y: 100 }, { x: 100, y: 100 }, 50)).toBe('tap');
  });

  it('classifies large movement as drag', () => {
    expect(classifyGesture({ x: 100, y: 100 }, { x: 100, y: 120 }, 50)).toBe('drag');
  });

  it('classifies exactly threshold distance as drag', () => {
    expect(classifyGesture({ x: 100, y: 100 }, { x: 108, y: 100 }, 50)).toBe('drag');
  });

  it('classifies zero movement + long hold as hold (no-op)', () => {
    expect(classifyGesture({ x: 100, y: 100 }, { x: 100, y: 100 }, 500)).toBe('hold');
  });

  it('classifies small movement + long hold as hold (no-op)', () => {
    expect(classifyGesture({ x: 100, y: 100 }, { x: 102, y: 101 }, 400)).toBe('hold');
  });
});
