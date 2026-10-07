import { useEffect, useState } from 'react';
import { FrameWindow } from './frame-window';

/** How often the readout re-renders, in ms (never every frame). */
const SHOW_EVERY_MS = 500;

/**
 * The dev frame readout in the Training bar (spec §8): the 95th-percentile frame time over the
 * last 5 s, from `requestAnimationFrame` deltas. Nothing outside dev builds.
 */
export function FrameChip() {
  return import.meta.env.DEV ? <FrameReadout /> : null;
}

function FrameReadout() {
  const [p95, setP95] = useState<number | null>(null);
  useEffect(() => {
    const frames = new FrameWindow();
    let last: number | null = null;
    let shown = -Infinity;
    let id = 0;
    const tick = (now: number) => {
      if (last !== null) frames.push(now, now - last);
      last = now;
      if (now - shown >= SHOW_EVERY_MS && frames.percentile(0.95) !== null) {
        shown = now;
        setP95(frames.percentile(0.95));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span
      className="k-well whitespace-nowrap px-3 py-0.5 text-[16px] text-[var(--k-text-2)]"
      title="95th-percentile frame time over the last 5 s (dev builds)"
      data-testid="training-frame"
    >
      {p95 === null ? '—' : p95.toFixed(1)} ms p95
    </span>
  );
}
