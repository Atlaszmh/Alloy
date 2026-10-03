import { describe, it, expect } from 'vitest';
import {
  BASIC_STATUS,
  applyStatus,
  hitMonster,
  hurtHero,
  killMonster,
  makeCtx,
} from '../src/arpg/combat.js';
import { stepWorld } from '../src/arpg/step.js';
import type { ArpgWorld } from '../src/types/arpg.js';
import { STEP, arena, dodge, dummy, registry, run } from './fixtures/arena.js';

// Where quest events come from (see the quests spec's "Quest events (the engine)").

const ctxOf = (w: ArpgWorld) => makeCtx(registry, w, []);
/** Set off fire + frost's reaction on the world's first foe. */
function react(w: ArpgWorld): void {
  const ctx = ctxOf(w);
  applyStatus(ctx, w.monsters[0], BASIC_STATUS.fire, 100, true);
  hitMonster(ctx, w.monsters[0], 10, 'frost', { source: 'skill' });
}

describe('quest events in the arena', () => {
  it("a kill carries the foe's kind, biome and element; a boss's carries nothing", () => {
    const w = arena([
      dummy(13, 20),
      dummy(15, 20, { kind: 'elite', element: 'frost' }),
      dummy(17, 20, { kind: 'boss' }),
    ]);
    for (const m of [...w.monsters]) killMonster(ctxOf(w), m);
    expect(w.pending.questEvents).toEqual([
      { type: 'kill', kind: 'normal', biome: w.biomeId, element: 'fire' },
      { type: 'kill', kind: 'elite', biome: w.biomeId, element: 'frost' },
    ]);
  });

  it('a reaction and a perfect dodge each add one', () => {
    const w = arena([dummy(13, 20)], { noBasic: true });
    react(w);
    dodge(w);
    hurtHero(ctxOf(w), 50, null, null);
    expect(w.pending.questEvents).toEqual([
      { type: 'reaction', reaction: registry.getReactionFor('fire', 'frost').id },
      { type: 'perfectDodge' },
    ]);
  });

  it('the floor flags: damage taken (not a dodged hit) and a potion drunk', () => {
    const w = arena([], { noBasic: true });
    dodge(w);
    hurtHero(ctxOf(w), 50, null, null);
    expect([w.hurt, w.potionDrunk]).toEqual([false, false]);
    run(w, 1);
    hurtHero(ctxOf(w), 50, null, null);
    expect([w.hurt, w.potionDrunk]).toEqual([true, false]);
    stepWorld(registry, w, { move: { x: 0, y: 0 }, potion: true }, STEP);
    expect(w.potionDrunk).toBe(true);
  });

  it('the Training Grounds add none', () => {
    const w = arena([dummy(13, 20), dummy(15, 20)], { noBasic: true });
    w.sandbox = { infiniteMana: false, noCooldowns: false, invulnerable: false };
    react(w);
    killMonster(ctxOf(w), w.monsters[1]);
    dodge(w);
    hurtHero(ctxOf(w), 50, null, null);
    expect(w.pending.questEvents).toEqual([]);
  });
});
