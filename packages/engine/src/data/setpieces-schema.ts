import { z } from 'zod';
import { LOOK_IDS, PIECE_TAGS } from '../types/floor-map.js';
import type { DataRegistry } from './registry.js';
import { ManaTypeSchema } from './schemas.js';

/**
 * `setpieces.json` (see the room objects spec): the props, the hazards, the
 * hand-drawn set pieces and each biome's palette. The schema checks each
 * part's shape; `setPiecesProblems` checks its references at load.
 */

const distinctIds = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;
const LookSchema = z.enum(LOOK_IDS);

/** A piece: rows of one width over the legend `# c f ~ u h . ?`. */
const SetPieceSchema = z
  .object({
    id: z.string().min(1),
    rows: z.array(z.string().regex(/^[#cf~uh.?]+$/, 'a row is legend cells')).min(1),
    tags: z.array(z.enum(PIECE_TAGS)).min(1),
    biomes: z.array(z.string().min(1)).min(1).optional(),
    weight: z.number().positive(),
    turns: z.boolean(),
    looks: z
      .object({ '#': LookSchema, c: LookSchema, f: LookSchema, '~': LookSchema })
      .partial()
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (p) => p.rows.every((r) => r.length === p.rows[0].length),
    "a piece's rows are one width",
  );

const PaletteSchema = z
  .object({
    looks: z
      .object({
        cover: z.array(LookSchema).min(1),
        crumbling: z.array(LookSchema).min(1),
        foliage: z.array(LookSchema),
        slow: z.array(LookSchema).min(1),
      })
      .strict(),
    props: z.array(z.string().min(1)),
    hazards: z.array(z.string().min(1)),
  })
  .strict();

export const SetPiecesDataSchema = z
  .object({
    props: z
      .array(z.object({ id: z.string().min(1), radius: z.number().positive() }).strict())
      .min(1)
      .refine(distinctIds, 'prop ids differ'),
    hazards: z
      .array(
        z
          .object({
            id: z.string().min(1),
            element: ManaTypeSchema,
            radius: z.number().positive(),
            burst: z.number().positive(),
          })
          .strict(),
      )
      .min(1)
      .refine(distinctIds, 'hazard ids differ'),
    pieces: z.array(SetPieceSchema).min(1).refine(distinctIds, 'piece ids differ'),
    palettes: z.record(z.string(), PaletteSchema),
  })
  .strict();

/** `setpieces.json`'s references: a palette for every biome and only for biomes, known props and hazards. */
export function setPiecesProblems(registry: DataRegistry): string[] {
  const data = registry.getSetPieces();
  const biomes = registry.getDelveData().biomes.map((b) => b.id);
  const problems: string[] = [];
  for (const b of biomes) if (!data.palettes[b]) problems.push(`no palette for ${b}`);
  for (const [id, p] of Object.entries(data.palettes)) {
    if (!biomes.includes(id)) problems.push(`palette ${id}: no such biome`);
    for (const x of p.props)
      if (!data.props.some((d) => d.id === x)) problems.push(`palette ${id}: no prop ${x}`);
    for (const x of p.hazards)
      if (!data.hazards.some((d) => d.id === x)) problems.push(`palette ${id}: no hazard ${x}`);
  }
  for (const piece of data.pieces)
    for (const b of piece.biomes ?? [])
      if (!biomes.includes(b)) problems.push(`piece ${piece.id}: no biome ${b}`);
  return problems;
}
