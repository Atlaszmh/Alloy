import type { CombatEvent } from '@alloy/engine';

export interface SwingGroup {
  type: 'attack' | 'dot_tick' | 'heal' | 'death';
  time: number;
  attacker?: 0 | 1;
  target?: 0 | 1;
  events: Array<{ time: number; event: CombatEvent }>;
}

/**
 * Groups a flat list of tick events into logical "swing groups" for display
 * in the combat log.
 *
 * Grouping rules:
 * - An `attack` event starts a new group; subsequent events at the same tick
 *   (heal, hp_change, trigger_proc, etc.) attach to it.
 * - A `dot_tick` always gets its own group.
 * - A `death` always gets its own group.
 * - A standalone `heal` (not following an attack at the same tick) gets its own group.
 * - Other events (hp_change, trigger_proc, etc.) attach to the current group
 *   if they share the same tick; otherwise they start a new miscellaneous group.
 */
export function groupEventsIntoSwings(
  flatEvents: Array<{ time: number; event: CombatEvent }>,
): SwingGroup[] {
  const groups: SwingGroup[] = [];
  let current: SwingGroup | null = null;

  for (const entry of flatEvents) {
    const { time, event } = entry;

    if (event.type === 'death') {
      // Death always gets its own group
      groups.push({
        type: 'death',
        time,
        target: event.player,
        events: [entry],
      });
      current = null;
      continue;
    }

    if (event.type === 'dot_tick') {
      // DOT ticks always get their own group
      groups.push({
        type: 'dot_tick',
        time,
        target: event.target,
        events: [entry],
      });
      current = null;
      continue;
    }

    if (event.type === 'attack') {
      // Attack starts a new group
      current = {
        type: 'attack',
        time,
        attacker: event.attacker,
        target: event.attacker === 0 ? 1 : 0,
        events: [entry],
      };
      groups.push(current);
      continue;
    }

    if (event.type === 'heal') {
      // If there's a current group at the same time (e.g. lifesteal after attack), attach
      if (current && current.time === time) {
        current.events.push(entry);
      } else {
        // Standalone heal gets its own group
        current = {
          type: 'heal',
          time,
          target: event.player,
          events: [entry],
        };
        groups.push(current);
      }
      continue;
    }

    // All other events (hp_change, trigger_proc, stun, dot_apply, etc.)
    // attach to the current group if same time, otherwise start a new group
    if (current && current.time === time) {
      current.events.push(entry);
    } else {
      // Orphan event at a new time — create a minimal group
      current = {
        type: 'attack',
        time,
        events: [entry],
      };
      groups.push(current);
    }
  }

  return groups;
}
