import { BOON_FAMILIES, type BoonDef } from '../types/boon.js';
import type { DataRegistry } from './registry.js';
import { KnobsSchema } from './schemas.js';

/**
 * `boons.json`'s problems the schema can't see, or that a registry built from other data may hold
 * (see the boons spec's load checks), as messages naming the row: ids unique; three tiers, each
 * with a card line; every knob a `Knobs` key; every attunement role the primary or the secondary;
 * a cap of 1 to 3. `createDefaultRegistry` refuses data with any.
 */
export function boonsProblems(registry: DataRegistry): string[] {
  const problems: string[] = [];
  const knobKeys = new Set(Object.keys(KnobsSchema.shape));
  const seen = new Set<string>();
  for (const b of registry.getBoons()) {
    if (seen.has(b.id)) problems.push(`${b.id}: a second row with this id`);
    seen.add(b.id);
    if (b.tiers.length !== 3) problems.push(`${b.id}: three tiers, not ${b.tiers.length}`);
    b.tiers.forEach((t, i) => {
      if (!t.text.trim()) problems.push(`${b.id}: tier ${i + 1} has no text`);
      for (const k of Object.keys(t.effect.knobs ?? {}))
        if (!knobKeys.has(k)) problems.push(`${b.id}: tier ${i + 1}'s knob ${k} is no Knobs key`);
      const role = t.effect.attune?.role;
      if (role !== undefined && role !== 'primary' && role !== 'secondary')
        problems.push(
          `${b.id}: tier ${i + 1}'s attunement role ${role} is neither primary nor secondary`,
        );
    });
    if (![1, 2, 3].includes(b.cap)) problems.push(`${b.id}: a cap of ${b.cap}, not 1 to 3`);
  }
  problems.push(...stopRowProblems(registry.getBoons()), ...shrineRowProblems(registry.getBoons()));
  return problems;
}

/**
 * The stop rows' checks (the boons spec §1): every family has a row a stop
 * can draw, and no such row's three tiers carry the same effect. A shrine row
 * (no stop weight) copies its tier, so it is left out.
 */
export function stopRowProblems(boons: readonly BoonDef[]): string[] {
  const problems: string[] = [];
  const atStop = boons.filter((b) => b.weight.common + b.weight.rare + b.weight.epic > 0);
  for (const f of BOON_FAMILIES)
    if (!atStop.some((b) => b.family === f)) problems.push(`no stop boon in ${f}`);
  for (const b of atStop) {
    const [first, ...rest] = b.tiers.map((t) => JSON.stringify(t.effect));
    if (rest.every((e) => e === first)) problems.push(`${b.id}: its three tiers are the same`);
  }
  return problems;
}

/** What only a stop boon may carry: knobs and attunement (the boons spec §2a). */
const STOP_ONLY = ['knobs', 'attune'] as const;
/** Fields that shape a floor, never on a floor shrine (it is prayed mid-floor). */
const FLOOR_SHAPING = [
  'exitRevealed',
  'shrinesLastDive',
  'noSlow',
  'hazardsFriendly',
  'skip',
  'eliteChance',
  'noPotions',
] as const;

/**
 * The shrine rows' check (the boons spec §1): a shrine's effect holds only what
 * a shrine or a dive stat can, so never knobs or attunement, and a `floor`
 * shrine never a floor-shaping field. One message a field a row.
 */
export function shrineRowProblems(boons: readonly BoonDef[]): string[] {
  const problems: string[] = [];
  for (const b of boons) {
    if (!b.shrine) continue;
    const fields = new Set(b.tiers.flatMap((t) => Object.keys(t.effect)));
    for (const f of STOP_ONLY)
      if (fields.has(f)) problems.push(`${b.id}: a shrine can't carry ${f}`);
    if (b.duration === 'floor')
      for (const f of FLOOR_SHAPING)
        if (fields.has(f)) problems.push(`${b.id}: a floor shrine can't carry ${f}`);
  }
  return problems;
}
