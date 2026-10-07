import type { BoonFamily, BoonId, Buff, DataRegistry } from '@alloy/engine';

/** One boon worn: its entries counted, and each entry's tier line in the order taken. */
export interface WornBoon {
  boon: BoonId;
  name: string;
  family: BoonFamily;
  count: number;
  lines: string[];
}

/**
 * A list of boon entries (a dive's or a floor's) grouped by boon, first taken first; unknown ids
 * passed over. With `dive`, a floor shrine's line (worn for the dive under Sanctuary) says so.
 */
export function wornBoons(registry: DataRegistry, buffs: readonly Buff[], dive = false): WornBoon[] {
  const rows = registry.getBoons();
  const out = new Map<BoonId, WornBoon>();
  for (const b of buffs) {
    const def = rows.find((r) => r.id === b.boon);
    if (!def) continue;
    const text = def.tiers[b.tier - 1]?.text ?? def.name;
    const line = dive && def.duration === 'floor' ? text.replace(/ for this floor$/, ' for the dive (Sanctuary)') : text;
    const seen = out.get(b.boon);
    if (seen) {
      seen.count += 1;
      seen.lines.push(line);
    } else out.set(b.boon, { boon: b.boon, name: def.name, family: def.family, count: 1, lines: [line] });
  }
  return [...out.values()];
}

/** "Keen Edge ×2 · Shrine of Vigor": the pause's and the summary's line. */
export const boonsLine = (worn: readonly WornBoon[]): string =>
  worn.map((w) => (w.count > 1 ? `${w.name} ×${w.count}` : w.name)).join(' · ');
