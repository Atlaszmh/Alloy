import type { ArpgEvent, Vec } from '@alloy/engine';
import { MANA_HEX } from '../palette';
import type { ManaFx } from './mana-fx';

/**
 * The room objects' moments (see the room objects spec), from their events: a
 * hazard set off and its burst, a prop breaking, a structure crumbling, a foe
 * slammed into a wall and a charger stunned on one. A hazard's telegraph while
 * its fuse burns is the world's state (`drawHazards` in draw-world.ts).
 * Cosmetic, so it may use Math.random (ManaFx does).
 */

/** The room objects' events. */
export type RoomObjectEvent = Extract<
  ArpgEvent,
  { kind: 'propBreak' | 'hazardPrime' | 'hazardBurst' | 'crumble' | 'wallSlam' | 'chargeStun' }
>;

/** Debris (light, since the air layer only adds light): a prop's splinters, and stone's chips and dust. */
export const SPLINTER = 0xe4a672;
export const STONE = 0xc0cbdc;
/** A stunned charger's daze: the stagger's gold. */
export const DAZE = 0xfde68a;

/** Where an event happens (a crumble at each of its cells' centres): the hero must see one of them. */
export function roomObjectPoints(e: RoomObjectEvent): Vec[] {
  return e.kind === 'crumble' ? e.cells.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 })) : [e];
}

/** Draws an event's moment; returns how hard it shakes the screen. */
export function roomObjectFx(fx: ManaFx, e: RoomObjectEvent): number {
  switch (e.kind) {
    case 'propBreak':
      // A debris puff: splinters thrown out, dust drifting up.
      fx.burst(e.x, e.y, SPLINTER, 10, 3.5, true);
      fx.disperse(e.x, e.y, 0.3, STONE, 12);
      return 0.04;
    case 'hazardPrime':
      // Set off: a flash at its body, mana drawn in (the telegraph follows its fuse).
      fx.ring(e.x, e.y, 0.8, MANA_HEX[e.element], true, 0.25);
      fx.gather(e.x, e.y - 0.3, MANA_HEX[e.element], 8);
      return 0;
    case 'hazardBurst': {
      const color = MANA_HEX[e.element];
      fx.ring(e.x, e.y, e.radius, color, true, 0.4);
      fx.ring(e.x, e.y, e.radius, 0xffffff, false, 0.3);
      fx.burst(e.x, e.y, color, 16, 6);
      // Its element's motif on the growing rim, as an infused blast's.
      fx.infuse('blast', e.element, { kind: 'ring', x: e.x, y: e.y, r: e.radius });
      return 0.18;
    }
    case 'crumble':
      for (const c of e.cells) {
        fx.burst(c.x + 0.5, c.y + 0.5, STONE, 8, 4, true);
        fx.disperse(c.x + 0.5, c.y + 0.5, 0.4, STONE, 6);
      }
      return 0.25;
    case 'wallSlam':
      fx.burst(e.x, e.y, STONE, 8, 4);
      fx.ring(e.x, e.y, 0.9, 0xffffff, false, 0.2);
      return 0.08;
    case 'chargeStun':
      fx.burst(e.x, e.y, STONE, 10, 4, true);
      fx.ring(e.x, e.y, 1.1, DAZE, false, 0.3);
      return 0.12;
  }
}
