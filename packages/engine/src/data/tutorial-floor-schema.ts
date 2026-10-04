import { z } from 'zod';
import { FLUX_GRADES, METAL_IDS } from '../types/crafting.js';
import type { Vec } from '../types/arpg.js';
import { TUTORIAL_CELLS, type TutorialFloorDef } from '../types/tutorial-floor.js';
import type { DataRegistry } from './registry.js';
import { HeroStatKeySchema, MonsterTraitSchema, RaritySchema } from './schemas.js';

// The guided start's hand-built floors (`tutorial.json → floors`; see the tutorial spec).

const VecSchema = z.object({ x: z.number(), y: z.number() });
const count = z.number().int().min(1);

const TutorialDropSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('gear'),
    base: z.string().min(1),
    rarity: RaritySchema,
    element: z.enum(['primary', 'secondary']),
    slots: z
      .object({ primary: z.number().int().min(1).optional() })
      .strict()
      .optional(),
    sockets: z.number().int().min(0).optional(),
  }),
  z.object({
    kind: z.literal('rune'),
    rune: z.literal('fitsPrimary'),
    tier: z.number().int().min(1).max(5),
  }),
  z.object({
    kind: z.literal('material'),
    // No essence: the guided start gives none.
    material: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('metal'), metal: z.enum(METAL_IDS) }),
      z.object({ kind: z.literal('flux'), grade: z.enum(FLUX_GRADES) }),
      z.object({
        kind: z.literal('shard'),
        stat: HeroStatKeySchema,
        tier: z.number().int().min(1).max(5),
      }),
      z.object({ kind: z.literal('dust') }),
      z.object({ kind: z.literal('links') }),
    ]),
    count,
  }),
  z.object({ kind: z.literal('scrap'), count }),
]);

/** A hand-built floor: its shapes (`tutorialFloorProblems` checks its geometry and references). */
export const TutorialFloorSchema = z.object({
  id: z.string().min(1),
  dive: z.number().int().min(1),
  depth: z.number().int().min(1),
  rows: z
    .array(z.string().min(1))
    .min(1)
    .refine((rs) => rs.every((r) => r.length === rs[0].length), 'rows of one length')
    .refine(
      (rs) => rs.every((r) => [...r].every((c) => TUTORIAL_CELLS.includes(c))),
      `cells from ${TUTORIAL_CELLS}`,
    ),
  rooms: z.array(
    z.object({
      id: z.number().int().min(0),
      kind: z.enum(['start', 'combat', 'den', 'vault', 'sanctum', 'alcove', 'exit', 'boss']),
      rect: z.object({
        x: z.number().int().min(0),
        y: z.number().int().min(0),
        w: z.number().int().min(1),
        h: z.number().int().min(1),
      }),
    }),
  ),
  spawns: z.array(
    z.object({
      id: z.string().min(1),
      monster: z.string().min(1),
      at: VecSchema,
      room: z.number().int().min(0),
      boss: z.literal(true).optional(),
      elite: z.object({ traits: z.array(MonsterTraitSchema) }).optional(),
      script: z.literal('slamOnly').optional(),
      hpMult: z.number().positive().optional(),
      damageMult: z.number().positive().optional(),
    }),
  ),
  markers: z.array(z.object({ id: z.string().min(1), at: VecSchema })),
  drops: z.array(
    z.object({
      id: z.string().min(1),
      on: z.string().regex(/^(spawn:.+|chest|boss)$/, "'spawn:<id>', 'chest' or 'boss'"),
      drop: TutorialDropSchema,
    }),
  ),
});

/** The doors a floor's rows place: one more than its highest door digit (0 for none). */
export function tutorialDoorCount(floor: Pick<TutorialFloorDef, 'rows'>): number {
  const digits = floor.rows.join('').match(/[0-9]/g) ?? [];
  return digits.length === 0 ? 0 : Math.max(...digits.map(Number)) + 1;
}

/** The cell (x, y) of the floor's rows, or `#` outside them. */
function cellAt(floor: TutorialFloorDef, p: Vec): string {
  const row = floor.rows[Math.floor(p.y)];
  return row?.[Math.floor(p.x)] ?? '#';
}

const distinct = (ids: readonly string[]) => new Set(ids).size === ids.length;

/**
 * The hand-built floors' problems the schema can't see (see the tutorial
 * spec): ids and (dive, depth) unique; one start and one exit gate; doors
 * numbered from 0 with none missing; rooms by index, inside the rows;
 * markers, and spawns inside their rooms, on walkable cells; spawns of known
 * monsters; set drops on a known spawn, the floor's chest or its boss, gear of
 * a known base, and dive 1's in the primary only. One line a problem;
 * `createDefaultRegistry` refuses data with any.
 */
export function tutorialFloorProblems(registry: DataRegistry): string[] {
  const { floors } = registry.getTutorialData();
  const delve = registry.getDelveData();
  const monsters = new Set(delve.biomes.flatMap((b) => [...b.monsters, b.boss].map((m) => m.id)));
  const bases = new Set(delve.bases.map((b) => b.id));
  const problems: string[] = [];
  if (!distinct(floors.map((f) => f.id))) problems.push('floor ids differ');
  if (!distinct(floors.map((f) => `${f.dive}:${f.depth}`)))
    problems.push('one floor a dive and depth');
  for (const f of floors) {
    const at = (what: string) => `${f.id}: ${what}`;
    const cells = f.rows.join('');
    for (const c of ['S', 'X']) if (cells.split(c).length !== 2) problems.push(at(`one ${c}`));
    const doors = tutorialDoorCount(f);
    for (let d = 0; d < doors; d++)
      if (!cells.includes(String(d))) problems.push(at(`no door ${d}`));
    f.rooms.forEach((r, i) => {
      if (r.id !== i) problems.push(at(`room ${i}'s id is its index`));
      if (r.rect.x + r.rect.w > f.rows[0].length || r.rect.y + r.rect.h > f.rows.length)
        problems.push(at(`room ${i} inside the rows`));
    });
    const walkable = (p: Vec) => cellAt(f, p) !== '#';
    if (!distinct(f.markers.map((m) => m.id))) problems.push(at('marker ids differ'));
    for (const m of f.markers) if (!walkable(m.at)) problems.push(at(`marker ${m.id} on a wall`));
    if (!distinct(f.spawns.map((s) => s.id))) problems.push(at('spawn ids differ'));
    for (const s of f.spawns) {
      if (!monsters.has(s.monster)) problems.push(at(`no monster ${s.monster}`));
      const rect = f.rooms[s.room]?.rect;
      const inside =
        !!rect &&
        s.at.x >= rect.x &&
        s.at.x <= rect.x + rect.w &&
        s.at.y >= rect.y &&
        s.at.y <= rect.y + rect.h;
      if (!inside || !walkable(s.at)) problems.push(at(`spawn ${s.id} on its room's floor`));
    }
    if (!distinct(f.drops.map((d) => d.id))) problems.push(at('drop ids differ'));
    for (const d of f.drops) {
      const known =
        d.on === 'chest'
          ? cells.includes('C')
          : d.on === 'boss'
            ? f.spawns.some((s) => s.boss)
            : f.spawns.some((s) => `spawn:${s.id}` === d.on);
      if (!known) problems.push(at(`drop ${d.id} falls on nothing (${d.on})`));
      if (d.drop.kind !== 'gear') continue;
      if (!bases.has(d.drop.base)) problems.push(at(`no base ${d.drop.base}`));
      if (f.dive === 1 && d.drop.element !== 'primary')
        problems.push(at(`drop ${d.id}: dive 1's gear is in the primary`));
    }
  }
  return problems;
}
