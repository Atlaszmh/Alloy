/**
 * Frame times over the last `spanMs` (5 s), for the dev frame readout (`FrameChip`). A plain time
 * window: at most a few hundred frames, so a sort a read is nothing.
 */
export class FrameWindow {
  private at: number[] = [];
  private ms: number[] = [];

  constructor(private readonly spanMs = 5000) {}

  /** A frame that ended at `now` (ms) and took `frameMs`. */
  push(now: number, frameMs: number): void {
    this.at.push(now);
    this.ms.push(frameMs);
    while (this.at.length > 0 && this.at[0] < now - this.spanMs) {
      this.at.shift();
      this.ms.shift();
    }
  }

  /** The nearest-rank `p` percentile (0–1] of the frames in the window; null with none. */
  percentile(p: number): number | null {
    if (this.ms.length === 0) return null;
    const sorted = [...this.ms].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1))];
  }
}
