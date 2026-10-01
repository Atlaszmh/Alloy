import type { MonsterEntity } from '../types/arpg.js';
import type { SimCtx } from './combat.js';

/**
 * A slain foe's rune drop (see the runes spec): rolled on `ArpgWorld.runeRng`
 * by `rollRuneDrop`, spawned as a `Drop` of kind `'rune'`. `killMonster` calls
 * it inside its `!world.sandbox` guard, so the Training Grounds drop none.
 */
export function dropRune(_ctx: SimCtx, _m: MonsterEntity): void {
  throw new Error('not built yet');
}
