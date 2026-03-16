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
 * Fewer gems = bigger gems. Matches approved mockup:
 *   ≤8:  110px, 4 cols (late draft / ranked R2-R3)
 *   ≤16: 100px, 4 cols (ranked R1)
 *   ≤20:  90px, 5 cols (mid quick)
 *   >20:  82px, 5 cols (quick full pool)
 */
export function useGemSize(poolCount: number): GemSizeConfig {
  return useMemo(() => {
    if (poolCount <= 8) {
      return { gemSize: 110, columns: 4, emojiSize: 40, statSize: 16, nameSize: 17, catSize: 14 };
    }
    if (poolCount <= 16) {
      return { gemSize: 100, columns: 4, emojiSize: 36, statSize: 15, nameSize: 16, catSize: 13 };
    }
    if (poolCount <= 20) {
      return { gemSize: 90, columns: 5, emojiSize: 32, statSize: 14, nameSize: 14, catSize: 12 };
    }
    return { gemSize: 82, columns: 5, emojiSize: 30, statSize: 14, nameSize: 13, catSize: 11 };
  }, [poolCount]);
}
