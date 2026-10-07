import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FrameChip } from '../training/FrameChip';

describe('FrameChip', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Run the next animation frame at `t` ms. */
  const frame = (t: number) => act(() => frames.shift()!(t));

  it('in dev: the 95th-percentile frame time, refreshed twice a second', () => {
    render(<FrameChip />);
    expect(screen.getByTestId('training-frame')).toHaveTextContent('— ms p95');
    for (let i = 0; i <= 60; i++) frame(1000 + i * 10);
    expect(screen.getByTestId('training-frame')).toHaveTextContent('10.0 ms p95');
  });

  it('outside dev: nothing', () => {
    vi.stubEnv('DEV', false);
    render(<FrameChip />);
    expect(screen.queryByTestId('training-frame')).toBeNull();
    expect(frames).toHaveLength(0);
  });
});
