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
 *
 * If containerWidth is provided, gems shrink to fit the available space.
 */
export function useGemSize(poolCount: number, containerWidth?: number): GemSizeConfig {
  return useMemo(() => {
    // Keep existing pool-count breakpoints as-is
    let config: GemSizeConfig;
    if (poolCount <= 8) {
      config = { gemSize: 100, columns: 4, emojiSize: 36, statSize: 15, nameSize: 15, catSize: 12 };
    } else if (poolCount <= 12) {
      config = { gemSize: 88, columns: 4, emojiSize: 32, statSize: 14, nameSize: 14, catSize: 12 };
    } else if (poolCount <= 16) {
      config = { gemSize: 82, columns: 4, emojiSize: 30, statSize: 14, nameSize: 13, catSize: 11 };
    } else if (poolCount <= 24) {
      config = { gemSize: 68, columns: 5, emojiSize: 26, statSize: 12, nameSize: 11, catSize: 10 };
    } else {
      config = { gemSize: 62, columns: 5, emojiSize: 24, statSize: 12, nameSize: 11, catSize: 10 };
    }

    // If container width is known, shrink to fit
    if (containerWidth && containerWidth > 0) {
      const gap = 4;
      const padding = 12; // 6px padding on each side
      const availableWidth = containerWidth - padding;
      const maxGemWidth = Math.floor((availableWidth - (config.columns - 1) * gap) / config.columns);
      const MIN_GEM_SIZE = 48; // minimum touch target

      if (maxGemWidth < config.gemSize) {
        const clampedWidth = Math.max(MIN_GEM_SIZE, maxGemWidth);
        const scale = clampedWidth / config.gemSize;
        config = {
          ...config,
          gemSize: clampedWidth,
          emojiSize: Math.round(config.emojiSize * scale),
          statSize: Math.round(config.statSize * scale),
          nameSize: Math.round(config.nameSize * scale),
          catSize: Math.round(config.catSize * scale),
        };
      }
    }

    return config;
  }, [poolCount, containerWidth]);
}
