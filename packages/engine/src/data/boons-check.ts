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
  return problems;
}
