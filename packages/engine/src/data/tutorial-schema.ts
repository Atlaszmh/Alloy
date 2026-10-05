import { z } from 'zod';
import { MANA_TYPES, type ManaType } from '../types/mana.js';
import { TUTORIAL_TARGETS, TUTORIAL_TRIGGERS, TUTORIAL_WHERE } from '../types/tutorial.js';
import { ManaTypeSchema } from './schemas.js';
import { TutorialFloorSchema } from './tutorial-floor-schema.js';

// The guided start's script (`tutorial.json`; see the tutorial spec). The floors' shapes are
// `TutorialFloorSchema`'s.

const StopKindsSchema = z.array(z.enum(['equip', 'slot', 'move', 'upgrade', 'rune']));

/** One step: what it waits for, where, and what it gates (`tutorialDataProblems` checks its references). */
export const TutorialStepSchema = z
  .object({
    id: z.string().min(1),
    where: z.enum(TUTORIAL_WHERE),
    floor: z.string().min(1).optional(),
    line: z.string().min(1),
    objective: z.string().min(1),
    highlight: z.enum(TUTORIAL_TARGETS).optional(),
    // Each entry's target and key are `tutorialDataProblems`'.
    trail: z.array(z.string().min(1)).min(1).optional(),
    beat: z.boolean().optional(),
    trigger: z.object({
      type: z.enum(TUTORIAL_TRIGGERS),
      filter: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      count: z.number().int().min(1),
    }),
    gate: z
      .object({ door: z.number().int().min(0).optional(), exit: z.literal(true).optional() })
      .strict()
      .optional(),
    skipAfter: z.number().int().min(1).optional(),
    marker: z.string().min(1).optional(),
    stop: z
      .object({ kinds: StopKindsSchema, doors: z.array(z.string().min(1)), extract: z.boolean() })
      .optional(),
    alcove: z.object({ kinds: StopKindsSchema }).optional(),
  })
  .strict();

/** `tutorial.json`: the steps, a partner for every primary (never itself), and the floors. */
export const TutorialDataSchema = z.object({
  steps: z
    .array(TutorialStepSchema)
    .refine((ss) => new Set(ss.map((s) => s.id)).size === ss.length, 'step ids differ'),
  partners: z
    .record(ManaTypeSchema, ManaTypeSchema)
    .refine(
      (p) => MANA_TYPES.every((m) => p[m] !== undefined && p[m] !== m),
      'a partner for every primary, never itself',
    )
    .transform((p) => p as Record<ManaType, ManaType>),
  floors: z.array(TutorialFloorSchema),
});
