import type { ArpgEvent, ArpgWorld, ReactionId } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { MANA_HEX } from '../palette';
import type { ManaFx } from './mana-fx';

/**
 * What the reactions look like the moment they fire. The seven older ones
 * keep the hit's label and ring (ArenaRenderer); the eight new ones each draw
 * a signature here, from the `reaction` event (at the foe). Their lasting
 * states (Obsidian's shell, Lightning Rod's trail, the marks) are in
 * draw-world.ts. Cosmetic, so it may use Math.random (ManaFx does).
 */

type Of<K extends ArpgEvent['kind']> = Extract<ArpgEvent, { kind: K }>;

/** Obsidian's colours: embers cooling onto glass (light: the air layer only adds light). */
export const EMBER = 0xff7a3c;
export const OBSIDIAN = 0xdcd0e6;

/** A reaction's floating label: its name from arpg.json, shouted. */
export function reactionLabel(id: ReactionId): string {
  return `${getDelveRegistry().getReaction(id).name.toUpperCase()}!`;
}

/** The moment a reaction fires: a signature for each of the eight new ones, nothing for the seven. */
export function reactionFx(fx: ManaFx, e: Of<'reaction'>, w: ArpgWorld): void {
  const h = w.hero;
  const chest = h.y - 0.3;
  const r = getDelveRegistry().getDelveBalance().reactions;
  switch (e.reaction) {
    case 'obsidian':
      // Embers cool inward onto the hero.
      fx.gather(h.x, chest, EMBER, 18);
      fx.ring(h.x, chest, 1.1, OBSIDIAN, true, 0.4);
      break;
    case 'lightning_rod':
      // A bolt drops into the ground at the hero.
      fx.bolt(
        [
          { x: h.x, y: h.y - 3 },
          { x: h.x, y: h.y + 0.4 },
        ],
        MANA_HEX.storm,
        0.25,
        true,
      );
      fx.burst(h.x, h.y + 0.4, MANA_HEX.earth, 10, 3);
      break;
    case 'sunder':
      // Rock chips burst off the foe.
      fx.burst(e.x, e.y, MANA_HEX.earth, 14, 5, true);
      break;
    case 'seedling':
      fx.burst(e.x, e.y, MANA_HEX.nature, 10, 2);
      fx.ring(e.x, e.y, 0.8, MANA_HEX.nature, true, 0.35);
      break;
    case 'siphon':
      // A violet flash; the motes carry the rest.
      fx.ring(e.x, e.y, 1, MANA_HEX.shadow, true, 0.25);
      break;
    case 'crystallize':
      // Frost spikes burst outward (the frost motif on a growing ring).
      fx.infuse('blast', 'frost', { kind: 'ring', x: e.x, y: e.y, r: r.crystallizeRadius });
      break;
    case 'blackout':
      // A dark cloud: the shadow motif's smoke on the ground, its wisps above.
      fx.infuse('blast', 'shadow', { kind: 'ring', x: e.x, y: e.y, r: r.blackoutRadius });
      break;
    case 'galvanize':
      // Storm sparks at the hero.
      fx.burst(h.x, chest, MANA_HEX.storm, 12, 3);
      break;
    default:
      break;
  }
}

/** Obsidian's shell shatters: its embers scatter and glass flies. */
export function barrierBreakFx(fx: ManaFx, e: Of<'barrierBreak'>): void {
  fx.disperse(e.x, e.y - 0.3, 1.1, EMBER, 24);
  fx.burst(e.x, e.y - 0.3, OBSIDIAN, 14, 5, true);
}
