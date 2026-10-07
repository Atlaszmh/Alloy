import { describe, it, expect } from 'vitest';
import { FrameWindow } from '../training/frame-window';

describe('FrameWindow', () => {
  it('reads nothing until a frame is in', () => {
    expect(new FrameWindow().percentile(0.95)).toBeNull();
  });

  it('takes the nearest-rank percentile of the frames in it', () => {
    const w = new FrameWindow();
    for (let i = 1; i <= 100; i++) w.push(i * 10, i);
    expect(w.percentile(0.95)).toBe(95);
    expect(w.percentile(0.5)).toBe(50);
    expect(w.percentile(1)).toBe(100);
    const one = new FrameWindow();
    one.push(0, 7);
    expect(one.percentile(0.95)).toBe(7);
  });

  it('forgets frames older than its span (5 s)', () => {
    const w = new FrameWindow();
    w.push(0, 100); // a hitch, then 5 s of smooth frames past it
    for (let t = 16; t <= 5100; t += 16) w.push(t, 16);
    expect(w.percentile(1)).toBe(16);
    const short = new FrameWindow(1000);
    short.push(0, 50);
    short.push(999, 10);
    expect(short.percentile(1)).toBe(50);
    short.push(1001, 10);
    expect(short.percentile(1)).toBe(10);
  });
});
