import type { LookId } from '@alloy/engine';

/**
 * The cover looks drawn as atlas sprites (`room-sprites.ts`), one a cell, each 16 px (size 1,
 * one cell) standing on its cell; every other look is the pixel floor's. Pure, so the pixel
 * floor's worker can read it too.
 */
export const SPRITE_LOOKS: readonly LookId[] = [
  'statue',
  'boulder',
  'spire',
  'ice_pillar',
  'minecart',
  'tomb',
  'machinery',
];
