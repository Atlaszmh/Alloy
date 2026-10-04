import type { SimCtx } from './combat.js';

/**
 * The pack director (B4; see the room objects spec's "Smarter packs"): every
 * `ai.pack.directorEvery` (`ArpgWorld.director.nextAt`) it gives each awake
 * foe a job (`MonsterEntity.job`) and a goal (`goal`), in list order; off on
 * the open room and hand-built floors. Stub: a no-op.
 */
export function directorTick(_ctx: SimCtx): void {}
