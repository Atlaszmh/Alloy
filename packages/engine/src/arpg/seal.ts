import type { SimCtx } from './combat.js';

/**
 * Sealed rooms (see the floor maps spec): a den or the boss room closes its
 * doors while the hero is inside with a foe of it awake (`ArpgWorld.sealing`,
 * `seal`), and opens them when none is left alive (`unseal`). The floor flow
 * area fills it; a no-op on the open room.
 */
export function sealTick(_ctx: SimCtx): void {}
