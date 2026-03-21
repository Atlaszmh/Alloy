const MIN_DELAY = 1000;
const MAX_DELAY = 5000;

/** Calculate AI thinking delay with jitter. Base delay comes from AI_CONFIGS. */
export function calcAiDelay(baseMs: number): number {
  const jitter = 0.6 + Math.random() * 0.8; // 0.6x to 1.4x
  return Math.max(MIN_DELAY, Math.min(MAX_DELAY, Math.round(baseMs * jitter)));
}
