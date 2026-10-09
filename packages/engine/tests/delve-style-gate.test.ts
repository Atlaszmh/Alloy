import { describe, it, expect } from 'vitest';
import { DPS_SECONDS, dpsCombos, dpsKey, simulateDps, type DpsSetup } from '../src/arpg/dps-sim.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { weaponClass } from '../src/loot/moveset.js';
import { ABILITY_SLOTS } from '../src/types/ability.js';

/**
 * The constructs spec's style gate (§4.4), at depth 10 and eight combat seeds a row, on one
 * dummy and on the pack: every weapon × attack form its class allows (the Lab's style view).
 * A form's rows are read against the median of that form across its class's weapons (a
 * shared form once per class), each within PAIR_BAND; each weapon's mean ratio over its forms
 * against the mean of all weapons, within WEAPON_BAND. A charge-paid Ultimate (every Ultimate
 * form's default payment) is read per cast, its damage over the run ÷ its casts: its cast rate
 * comes from the charge the basics build and the charge lockout, which no style scales, so its
 * DPS over 30 s (one to five casts) would measure the basic attack, not the style (the overview's
 * Integrator notes, B1). Everything is printed. When it fails,
 * tune the style's numbers (`delve.json`), then its trait; never the band. The pairs one tuning
 * pass left out of band are waived by name in WAIVED (decided with the user: the overview's
 * Integrator notes, B1), printed on every run; every other pair and every weapon is held to
 * its band. Skipped unless
 * STYLE_GATE is set (a few minutes): `STYLE_GATE=1 npx vitest run tests/delve-style-gate.test.ts`.
 */

const DEPTH = 10;
const PAIR_BAND = [0.85, 1.2];
const WEAPON_BAND = [0.9, 1.1];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const x = (n: number) => n.toFixed(2);

/**
 * The pairs left out of band after B1's tuning pass, by layout, form and weapon, each with its
 * value then and its reason. Every weapon's mean is within WEAPON_BAND on both layouts. LEFT is
 * the reason when no single style number explains the gap.
 */
const LEFT =
  'left by the tuning pass (no 0.05 step of an allowed number brought it in without pushing another check out)';
const WAIVED: Record<string, string> = {
  'one dummy: lance maul': `0.84: ${LEFT}`,
  'one dummy: nova axe': `0.78 per cast: ${LEFT}`,
  'one dummy: maelstrom dagger': `0.83 per cast: ${LEFT}`,
  'one dummy: maelstrom staff':
    '1.30 per cast: the Channeled duration (×1.15) stretches the 6 s storm',
  'one dummy: maelstrom bow': `0.84 per cast: ${LEFT}; pierce's ×0.95 power trade-off is 5% of it`,
  'one dummy: volley bow': `0.80: ${LEFT}; pierce's ×0.95 power trade-off is 5% of it`,
  'pack: lance bow': `0.79: ${LEFT}; pierce's ×0.95 power trade-off is 5% of it`,
  'pack: nova sword': `1.28 per cast: ${LEFT}`,
  'pack: nova axe': `0.83 per cast: ${LEFT}`,
  'pack: maelstrom dagger': '0.72 per cast: the Quick radius (×0.9) on a storm over the clump',
  'pack: maelstrom maul': '1.23 per cast: the Heavy radius (×1.15) on a storm over the clump',
  'pack: maelstrom staff':
    '1.30 per cast: the Channeled radius (×1.2) and duration (×1.15) over the clump',
  'pack: bolt bow': "1.28: the bow's pierce trait carries each shot into the clump",
  'pack: volley staff': `0.84: ${LEFT}`,
  'pack: volley bow': "2.09: the bow's pierce trait carries every dart into the clump",
  'pack: barrage staff': '1.33 per cast: the Channeled radius (×1.2) on seven impacts in the clump',
};

describe.skipIf(!process.env.STYLE_GATE)('the style gate (depth 10, eight seeds)', () => {
  const registry = createDefaultRegistry();
  const rows = dpsCombos(registry).filter((s) => s.view === 'style');
  const runs = new Map<string, number>();
  /** A row's measure: its DPS, or a charge-paid row's damage per cast. */
  const dps = (s: DpsSetup, pack: boolean) => {
    const key = `${pack}|${dpsKey(s)}`;
    if (!runs.has(key)) {
      const r = simulateDps(registry, s, { depth: DEPTH, pack });
      const slot = s.hold === 'attack' ? null : s.hold.slot;
      const charged = slot !== null && s.chains[ABILITY_SLOTS[slot]]?.payment === 'charge';
      runs.set(key, charged ? (r.dps * DPS_SECONDS) / r.casts : r.dps);
    }
    return runs.get(key)!;
  };

  for (const pack of [false, true])
    it(`${pack ? 'the pack' : 'one dummy'}: each pair within ${PAIR_BAND.join('–')}× its form's class median, each weapon within ${WEAPON_BAND.join('–')}× the weapons' mean`, () => {
      /** Each row's ratio to the median of its form over its class's weapons. */
      const ratio = new Map<string, number>();
      const layout = pack ? 'pack' : 'one dummy';
      const named = (r: DpsSetup) => `${layout}: ${r.dims.form} ${r.dims.weapon}`;
      const forms = [...new Set(rows.map((r) => r.dims.form))];
      const lines: string[] = [];
      for (const form of forms)
        for (const cls of ['melee', 'ranged'] as const) {
          const group = rows.filter(
            (r) => r.dims.form === form && weaponClass(registry, r.dims.weapon) === cls,
          );
          if (group.length === 0) continue;
          const med = median(group.map((r) => dps(r, pack)));
          for (const r of group) ratio.set(named(r), dps(r, pack) / med);
          lines.push(
            `${form.padEnd(10)} ${cls.padEnd(6)} ${group
              .map(
                (r) => `${r.dims.weapon} ${x(ratio.get(named(r))!)}${WAIVED[named(r)] ? '*' : ''}`,
              )
              .join('  ')}`,
          );
        }
      const weapons = [...new Set(rows.map((r) => r.dims.weapon))];
      const weaponMean = new Map(
        weapons.map((w) => [
          w,
          mean(rows.filter((r) => r.dims.weapon === w).map((r) => ratio.get(named(r))!)),
        ]),
      );
      const all = mean([...weaponMean.values()]);
      lines.push(
        `weapons: ${weapons.map((w) => `${w} ${x(weaponMean.get(w)! / all)}`).join('  ')}`,
      );
      for (const [key, r] of ratio) if (WAIVED[key]) lines.push(`* waived ${key}: ${WAIVED[key]}`);
      console.log(`${layout}\n${lines.join('\n')}`);
      for (const [key, r] of ratio) {
        if (WAIVED[key]) continue;
        expect(r, key).toBeGreaterThanOrEqual(PAIR_BAND[0]);
        expect(r, key).toBeLessThanOrEqual(PAIR_BAND[1]);
      }
      for (const [w, m] of weaponMean) {
        expect(m / all, w).toBeGreaterThanOrEqual(WEAPON_BAND[0]);
        expect(m / all, w).toBeLessThanOrEqual(WEAPON_BAND[1]);
      }
    }, 900_000);
});
