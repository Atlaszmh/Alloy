import { useMemo } from 'react';

export interface GemSizeConfig {
  gemSize: number;
  columns: number;
  emojiSize: number;
  statSize: number;
  nameSize: number;
  catSize: number;
}

/**
 * Compute gem rendering sizes based on pool count.
 * Fewer gems = bigger gems. Tuned so all columns fit on screen:
 *   ≤8:  100px, 4 cols (ranked R2-R3 late picks)
 *   ≤12:  88px, 4 cols (ranked R2-R3 start)
 *   ≤16:  82px, 4 cols (quick match mid)
 *   ≤24:  68px, 5 cols (ranked R1 — 24 gems)
 *   >24:  62px, 5 cols (quick full pool)
 */
export function useGemSize(poolCount: number): GemSizeConfig {
  return useMemo(() => {
    if (poolCount <= 8) {
      return { gemSize: 100, columns: 4, emojiSize: 36, statSize: 15, nameSize: 15, catSize: 12 };
    }
    if (poolCount <= 12) {
      return { gemSize: 88, columns: 4, emojiSize: 32, statSize: 14, nameSize: 14, catSize: 12 };
    }
    if (poolCount <= 16) {
      return { gemSize: 82, columns: 4, emojiSize: 30, statSize: 14, nameSize: 13, catSize: 11 };
    }
    if (poolCount <= 24) {
      return { gemSize: 68, columns: 5, emojiSize: 26, statSize: 12, nameSize: 11, catSize: 10 };
    }
    return { gemSize: 62, columns: 5, emojiSize: 24, statSize: 12, nameSize: 11, catSize: 10 };
  }, [poolCount]);
}
