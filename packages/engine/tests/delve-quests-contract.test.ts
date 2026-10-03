import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { emptyPending } from '../src/arpg/world.js';
import { bankWorld, beginFloor, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';

// The quests contract (see the quests spec's "Phases and parallel areas"): the
// fields and exports the areas fill in exist from the start.

const registry = createDefaultRegistry();
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);

describe('quest events in the arena', () => {
  it('a floor starts with no quest events and its flags down; a bank takes the events', () => {
    const p = diving();
    const world = beginFloor(registry, p);
    expect(world.pending.questEvents).toEqual([]);
    expect([world.potionDrunk, world.hurt]).toEqual([false, false]);
    expect(emptyPending().questEvents).toEqual([]);
    world.pending.questEvents.push({ type: 'perfectDodge' });
    bankWorld(registry, p, world);
    expect(world.pending.questEvents).toEqual([]);
  });
});
