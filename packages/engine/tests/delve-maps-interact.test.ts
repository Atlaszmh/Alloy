import { describe, it, expect } from 'vitest';
import { killMonster, makeCtx } from '../src/arpg/combat.js';
import { applyShrine, exitFloor, openedAlcove, rollVault } from '../src/arpg/interact.js';
import { isWalkable } from '../src/arpg/grid.js';
import { stepWorld } from '../src/arpg/step.js';
import { manaPool } from '../src/delve/hero-stats.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { ArpgEvent, ArpgWorld, Drop } from '../src/types/arpg.js';
import type { RoomKind } from '../src/types/floor-map.js';
import { arena, bal, dummy, registry, run, STEP } from './fixtures/arena.js';
import { floorWorld, twoRooms } from './fixtures/flow-map.js';

// The floor flow (see the floor maps spec's "Interacting, special rooms and the exit").

const still = { x: 0, y: 0 };
const press = (w: ArpgWorld): ArpgEvent[] =>
  stepWorld(registry, w, { move: still, interact: true }, STEP);
const of = <K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K) =>
  events.filter((e): e is Extract<ArpgEvent, { kind: K }> => e.kind === kind);

/** A world on the two rooms with room 1's interactable (`kind`), the hero beside it. */
function beside(kind: 'chest' | 'alcove' | 'gate', roomKind: RoomKind = 'vault') {
  const w = floorWorld(twoRooms(roomKind, { kind }));
  Object.assign(w.hero, { x: 19, y: 7 });
  return w;
}

describe("a room's last foe", () => {
  const loot = (w: ArpgWorld, roomId?: number): Drop => {
    const d: Drop = {
      id: w.nextId++,
      kind: 'scrap',
      x: 20,
      y: 8,
      amount: 1,
      born: 0,
      vacuum: false,
      dead: false,
      roomId,
    };
    w.drops.push(d);
    return d;
  };

  it("clears its room (roomCleared) and pulls in its foes' drops, no other", () => {
    const w = floorWorld(twoRooms('combat'), [
      dummy(16, 3, { roomId: 1 }),
      dummy(22, 3, { roomId: 1 }),
    ]);
    const [mine, hall] = [loot(w, 1), loot(w)];
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    killMonster(ctx, w.monsters[0]);
    expect([w.map.rooms[1].cleared, of(events, 'roomCleared')]).toEqual([false, []]);
    killMonster(ctx, w.monsters[1]);
    expect(of(events, 'roomCleared')).toEqual([{ kind: 'roomCleared', roomId: 1 }]);
    expect(w.map.rooms[1].cleared).toBe(true);
    expect([mine.vacuum, hall.vacuum]).toEqual([true, false]);
  });

  it('pulls nothing in when ai.roomVacuum is off, and a roomless foe clears nothing', () => {
    const w = floorWorld(twoRooms('combat'), [dummy(16, 3, { roomId: 1 }), dummy(5, 3)]);
    const mine = loot(w, 1);
    const events: ArpgEvent[] = [];
    const ctx = {
      ...makeCtx(registry, w, events),
      bal: { ...bal, ai: { ...bal.ai, roomVacuum: false } },
    };
    killMonster(ctx, w.monsters[1]);
    killMonster(ctx, w.monsters[0]);
    expect(of(events, 'roomCleared')).toHaveLength(1);
    expect(mine.vacuum).toBe(false);
  });
});

describe('the exit', () => {
  it('exitFloor takes it: world.exited (the open room ends on cleared instead)', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }));
    expect(w.exited).toBe(false);
    exitFloor(w);
    expect(w.exited).toBe(true);
  });

  it('nothing moves once it is taken: a last hit never turns the exit into a death', () => {
    const w = floorWorld(twoRooms('exit', { kind: 'gate' }), [
      dummy(5, 6, { damage: 1e6, aggro: true }),
    ]);
    exitFloor(w);
    const t = w.t;
    expect(run(w, 1)).toEqual([]);
    expect([w.t, w.heroDead]).toEqual([t, false]);
  });
});

describe('the interactable in reach', () => {
  it('prompts each step while one is within interactRadius, never beyond it', () => {
    const w = beside('chest');
    expect(of(run(w, STEP), 'interactPrompt')).toEqual([
      { kind: 'interactPrompt', id: '2:1', interactable: 'chest', text: 'Chest' },
    ]);
    w.hero.y = 6 + bal.ai.interactRadius + 0.2;
    expect(of(run(w, STEP), 'interactPrompt')).toEqual([]);
  });

  it('drops a press with nothing in reach, and does nothing on the open room', () => {
    const w = floorWorld(twoRooms('vault', { kind: 'chest' }));
    press(w);
    expect(w.queuedInteract).toBe(false);
    Object.assign(w.hero, { x: 19, y: 7 });
    expect(of(run(w, STEP), 'drop')).toEqual([]);
    const open = arena([dummy(13, 20)]);
    expect(of(press(open), 'interactPrompt')).toEqual([]);
    expect(open.queuedInteract).toBe(false);
  });
});

describe('the vault', () => {
  it("opens once: its haul bursts onto walkable cells, materials only, and it's recorded used", () => {
    const w = beside('chest');
    const drops = of(press(w), 'drop');
    expect(drops.length).toBeGreaterThan(0);
    expect(w.drops.every((d) => d.kind === 'material' && !d.item)).toBe(true);
    expect(w.drops.every((d) => isWalkable(w.map, d.x, d.y))).toBe(true);
    expect(w.map.rooms[1].interactable!.used).toBe(true);
    expect(w.pending.used).toEqual(['2:1']);
    expect(of(press(w), 'interactPrompt')).toEqual([]);
    expect(w.drops).toHaveLength(drops.length);
  });

  it('rolls drops.vault: its flux and shards, the shards a tier up, no essence at depth 2, the same from the same seed', () => {
    const w = beside('chest');
    const roll = (seed: number) => rollVault(registry, w, new SeededRNG(seed));
    expect(roll(5)).toEqual(roll(5));
    const vault = bal.drops.vault;
    let essences = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const haul = roll(seed);
      const count = (kind: string) =>
        haul.filter((h) => h.material.kind === kind).reduce((n, h) => n + h.amount, 0);
      expect(count('flux')).toBeGreaterThanOrEqual(vault.flux.count[0]);
      expect(count('flux')).toBeLessThanOrEqual(vault.flux.count[1]);
      expect(count('shard')).toBeGreaterThanOrEqual(vault.shards.count[0]);
      expect(count('shard')).toBeLessThanOrEqual(vault.shards.count[1]);
      // Depth 2 drops tier I shards (II at Find's chance): the vault's are a tier up.
      for (const { material } of haul)
        if (material.kind === 'shard') expect(material.tier).toBeGreaterThanOrEqual(2);
      expect(haul.every((h) => ['flux', 'shard', 'essence'].includes(h.material.kind))).toBe(true);
      essences += count('essence');
    }
    // Essences come from drops.essenceMinDepth (see the tutorial spec).
    expect(essences).toBe(0);
  });
});

describe('the alcove and the gate', () => {
  it('an alcove opens (alcoveOpen; the world keeps which) and stays unused until an op is taken', () => {
    const w = beside('alcove', 'alcove');
    expect(of(run(w, STEP), 'interactPrompt')[0].text).toBe('Anvil');
    expect(openedAlcove(w)).toBeNull();
    expect(of(press(w), 'alcoveOpen')).toEqual([{ kind: 'alcoveOpen', id: '2:1' }]);
    expect(openedAlcove(w)).toBe('2:1');
    expect(w.map.rooms[1].interactable!.used).toBe(false);
  });

  it('the gate asks to leave (the client confirms), counting the rooms unexplored', () => {
    const w = beside('gate', 'exit');
    w.map.rooms[1].revealed = true;
    expect(of(run(w, STEP), 'interactPrompt')[0].text).toBe('Exit gate');
    expect(of(press(w), 'exitRequest')).toEqual([{ kind: 'exitRequest', roomsUnexplored: 1 }]);
    expect(w.exited).toBe(false);
  });

  it("is shut on a boss floor until the boss is dead; foes left alive don't hold it", () => {
    const w = floorWorld(twoRooms('boss', { kind: 'gate' }), [
      dummy(22, 3, { kind: 'boss', roomId: 1 }),
      dummy(3, 3, { roomId: 0 }),
    ]);
    Object.assign(w.hero, { x: 19, y: 7 });
    expect(of(press(w), 'exitRequest')).toEqual([]);
    killMonster(makeCtx(registry, w, []), w.monsters[0]);
    expect(of(press(w), 'exitRequest')).toHaveLength(1);
  });
});

describe('the shrine', () => {
  const shrine = (id: string) => registry.getBoon(id)!;
  /** The hero beside a sanctum's shrine of `id`. */
  function praying(id: string) {
    const w = floorWorld(twoRooms('sanctum', { kind: 'shrine', shrine: id }));
    Object.assign(w.hero, { x: 19, y: 7 });
    return w;
  }

  it("under Sanctuary a floor shrine's prompt says its blessing lasts the dive", () => {
    const w = praying('vigor');
    w.hero.boon = { ...w.hero.boon, shrinesLastDive: true };
    const prompt = of(run(w, STEP), 'interactPrompt')[0];
    expect(prompt.text).toBe('Shrine of Vigor: +20% damage for the dive (Sanctuary)');
  });

  it('prompts with its blessing; a press prays for ai.shrineChannel, then blesses the floor and is spent', () => {
    const w = praying('vigor');
    const prompt = of(run(w, STEP), 'interactPrompt')[0];
    expect(prompt.text).toBe('Shrine of Vigor: +20% damage for this floor');
    const damage = w.hero.stats.damageMult;
    press(w);
    expect(w.channel).toMatchObject({ id: '2:1', until: w.t + bal.ai.shrineChannel });
    run(w, bal.ai.shrineChannel - 2 * STEP);
    expect(w.hero.floorBuffs).toEqual([]);
    run(w, 3 * STEP);
    expect(w.channel).toBeNull();
    expect(w.hero.floorBuffs).toEqual([
      { boon: 'vigor', tier: 1, effect: shrine('vigor').tiers[0].effect },
    ]);
    expect(w.hero.stats.damageMult).toBeCloseTo(damage * 1.2, 9);
    expect(w.map.rooms[1].interactable!.used).toBe(true);
    expect(w.pending.used).toEqual(['2:1']);
    expect(of(press(w), 'interactPrompt')).toEqual([]);
  });

  it('a move, a dodge or a hit breaks the prayer: nothing is spent', () => {
    const moved = praying('vigor');
    press(moved);
    run(moved, 0.1, { x: 1, y: 0 });
    const dodged = praying('vigor');
    press(dodged);
    stepWorld(registry, dodged, { move: still, dodge: true }, STEP);
    run(dodged, STEP);
    const hit = praying('vigor');
    press(hit);
    hit.hero.lastHitAt = hit.t;
    run(hit, STEP);
    for (const w of [moved, dodged, hit]) {
      expect(w.channel).toBeNull();
      run(w, 1);
      expect([w.hero.floorBuffs, w.map.rooms[1].interactable!.used]).toEqual([[], false]);
    }
  });

  it('a dive blessing goes under the floor’s and into pending.diveBuffs; mana regen resizes the pool', () => {
    const w = praying('devotion');
    applyShrine(registry, w, shrine('devotion'));
    applyShrine(registry, w, shrine('clarity'));
    const devotion = { boon: 'devotion', tier: 1, effect: shrine('devotion').tiers[0].effect };
    expect(w.hero.diveBuffs).toEqual([devotion]);
    expect(w.pending.diveBuffs).toEqual([devotion]);
    expect(w.hero.floorBuffs.map((b) => b.boon)).toEqual(['clarity']);
    expect(w.hero.baseStats.damageMult).toBeCloseTo(w.hero.stats.damageMult, 9);
    expect(w.hero.manaRegen).toBeCloseTo(manaPool(w.hero.stats, registry).regen, 9);
    expect(w.hero.stats.manaRegenMult).toBeCloseTo(w.hero.baseStats.manaRegenMult * 1.5, 9);
  });

  it('Find goes on the loot; a refill fills the flasks and leaves no blessing', () => {
    const w = praying('fortune');
    const find = w.loot.find;
    applyShrine(registry, w, shrine('fortune'));
    expect(w.loot.find).toBe(find + 50);
    w.hero.potions = 0;
    applyShrine(registry, w, shrine('mercy'));
    expect(w.hero.potions).toBe(bal.dive.maxPotions);
    expect(w.hero.floorBuffs.map((b) => b.boon)).toEqual(['fortune']);
  });
});
