import { HOLD_STAGE_KINDS, type ResolvedAbility } from '../../types/ability.js';
import type { Echo } from '../../types/arpg.js';
import { landBlow } from '../basic.js';
import type { SimCtx } from '../combat.js';
import { executeForm } from './forms.js';

/** Queue a move's or a blow's echo on `ArpgWorld.echoes` (see `echoTick`). */
export function queueEcho(ctx: SimCtx, echo: Echo): void {
  ctx.world.echoes.push(echo);
}

/**
 * Run the echoes that are due, in the order they were queued (called right
 * after `castTick`; see the runes spec's Echo). An ability's runs its move as it
 * landed (its stage, its step bonus, its extra shots and split) through
 * `executeForm` at `power × echo`, with no echo or Guard of its own, from where
 * the hero stands toward where the move landed (a Nova goes off round the hero).
 * It costs nothing, starts no beat, cooldown or recoil, makes no `cast` event,
 * and leaves the hero's facing as it was. A blow's strikes again (a held blow at
 * its stage) from where the hero stands, along its way, at `echo` × its power:
 * no step, mana, chain step or Twin Fang. Neither sets a room object off nor
 * wears cover (`replay`, `echo`). A `runeFx` marks each that goes off.
 */
export function echoTick(ctx: SimCtx): void {
  const { world } = ctx;
  const due = world.echoes.filter((e) => world.t >= e.at - 1e-9);
  if (due.length === 0) return;
  world.echoes = world.echoes.filter((e) => !due.includes(e));
  const h = world.hero;
  for (const e of due) {
    if (e.ability) {
      const ab = e.ability;
      const knobs = { ...ab.knobs, echo: 0, guardOnLand: 0 };
      const copy: ResolvedAbility = { ...ab, power: ab.power * ab.knobs.echo, knobs, replay: true };
      const facing = h.facing;
      const res = executeForm(ctx, copy, e.aim);
      h.facing = facing;
      if (res.ok)
        ctx.events.push({
          kind: 'runeFx',
          effect: 'echo',
          x: res.tx,
          y: res.ty,
          element: ab.element,
        });
    } else if (e.blow !== null && e.dir) {
      const blow = h.stats.weapon.blows[e.blow];
      // A gear or chain change since it was queued may have taken the blow's Echo.
      if (!blow || blow.knobs.echo <= 0) continue;
      const kind = e.stage === null ? blow.kind : HOLD_STAGE_KINDS[e.stage];
      landBlow(ctx, blow, kind, e.dir, blow.knobs.echo, { echo: true });
      ctx.events.push({ kind: 'runeFx', effect: 'echo', x: h.x, y: h.y, element: blow.element });
    }
  }
}
