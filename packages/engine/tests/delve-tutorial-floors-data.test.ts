import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { tutorialDoorCount } from '../src/data/tutorial-floor-schema.js';

// See the tutorial spec's "The player's path" and "Hand-built floors": the eight floors hold the
// names the script's steps use (doors, markers, spawns, set drops, interactables) and its beats.

const registry = createDefaultRegistry();
const { floors } = registry.getTutorialData();
const floor = (id: string) => floors.find((f) => f.id === id)!;
const drop = (id: string, dropId: string) => floor(id).drops.find((d) => d.id === dropId)!.drop;

describe("the guided start's eight floors", () => {
  it('hold the names the script uses: doors, markers, spawns, set drops and interactables', () => {
    expect(
      floors.map((f) => [
        f.id,
        tutorialDoorCount(f),
        f.markers.map((m) => m.id).join(),
        f.spawns.map((s) => s.id).join(),
        f.drops.map((d) => `${d.id}@${d.on}`).join(),
        f.rooms.map((r) => r.kind).join(),
        f.rows.join('').replace(/[#.0-9S]/g, ''),
      ]),
    ).toEqual([
      [
        'd1-1',
        2,
        'walk',
        'rat1,rat2,rat3',
        'ore@spawn:rat1,scraps@spawn:rat2,blade@spawn:rat3',
        'start,combat,exit',
        'X',
      ],
      [
        'd1-2',
        4,
        '',
        'beetle1,beetle2,slinger,brute',
        'shard@chest,dust@chest,scraps@spawn:brute',
        'start,combat,vault,sanctum,exit',
        'CXH',
      ],
      [
        'd1-3',
        2,
        '',
        'elite1,elite2',
        'charm@spawn:elite1,links@spawn:elite2,purse@spawn:elite2',
        'start,den,exit',
        'X',
      ],
      ['d2-1', 2, '', 'beetle,rat1,rat2,rat3', 'dust@spawn:beetle', 'start,combat,exit', 'X'],
      [
        'd2-2',
        3,
        '',
        'beetle1,rat1,rat2,beetle2,bat1,bat2',
        'links@spawn:beetle2',
        'start,combat,combat,exit',
        'X',
      ],
      [
        'd2-3',
        3,
        '',
        'slinger,rat1,rat2,bat1',
        'purse@spawn:slinger',
        'start,combat,alcove,exit',
        'AX',
      ],
      ['d2-4', 2, '', 'champion,rat1,rat2', 'purse@spawn:champion', 'start,combat,exit', 'X'],
      ['d2-5', 1, '', 'grask', 'crown@boss,hoard@boss', 'start,boss', 'X'],
    ]);
  });

  it("set the beats: the uncommon weapon, the brute's slam, the den's elites, the rune, Grask's rare", () => {
    expect(drop('d1-1', 'blade')).toEqual({
      kind: 'gear',
      base: 'sword',
      rarity: 'uncommon',
      element: 'primary',
      slots: { primary: 2 },
    });
    expect(floor('d1-2').spawns.find((s) => s.id === 'brute')!.script).toBe('slamOnly');
    const shard = drop('d1-2', 'shard');
    expect(shard.kind === 'material' && shard.material.kind === 'shard' && shard.material).toEqual({
      kind: 'shard',
      stat: 'maxHp',
      tier: 1,
    });
    expect(registry.getGearAffix('maxHp')!.slots).toContain('chest');
    expect(floor('d1-3').spawns.map((s) => [!!s.elite, s.damageMult])).toEqual([
      [true, 2],
      [true, 2],
    ]);
    expect(drop('d1-3', 'charm')).toEqual({ kind: 'rune', rune: 'fitsPrimary', tier: 1 });
    expect(floor('d2-5').spawns[0]).toMatchObject({
      monster: registry.getBiomeForDepth(5).boss.id,
      boss: true,
    });
    expect(drop('d2-5', 'crown')).toEqual({
      kind: 'gear',
      base: 'sword',
      rarity: 'rare',
      element: 'primary',
    });
  });
});
