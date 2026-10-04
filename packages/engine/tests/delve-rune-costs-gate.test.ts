import { describe, it, expect } from 'vitest';
import { resolveChain } from '../src/arpg/abilities/resolve.js';
import {
  dpsCombos,
  dpsKey,
  labHero,
  runeComboSetups,
  simulateDps,
  type DpsOptions,
  type DpsSetup,
} from '../src/arpg/dps-sim.js';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { valuedMove } from '../src/delve/hero-stats.js';

/**
 * The rune costs spec's two-build gate ("Balance and gates"), at depth 10 and eight combat
 * seeds a row. For each Primary form, its best three-rune tier-III set (the highest pack ratio
 * at full mana with the loads zeroed, among `runeComboSetups`) against the rune-less chain:
 * - supported (`sustained: 'supported'`) must sustain at least 1.5× on the pack;
 * - the starved hero's mana per press (the mean cost of the chain's moves, runed over rune-less)
 *   must sit in 2.0–3.0×.
 * Everything else is printed: the full-mana, starved and supported ratios, loaded and with the
 * loads zeroed (in brackets), on the pack and on one dummy; the supported mana per press; and
 * whether each price bites (a loaded sustained ratio below its unloaded one). When it fails,
 * tune `byForm`, then `bySlot`, then `easePerAttune` / `easeCap`, then the rune rows; never the
 * floor or the band. Skipped unless RUNE_COST_GATE is set (about 30 s):
 * `RUNE_COST_GATE=1 npx vitest run tests/delve-rune-costs-gate.test.ts`.
 */

const FORMS = ['bolt', 'volley', 'lance', 'burst', 'strike'];
const DEPTH = 10;
const FLOOR = 1.5;
const BAND = [2.0, 3.0];

describe.skipIf(!process.env.RUNE_COST_GATE)('the rune costs gate (depth 10, eight seeds)', () => {
  const registry = createDefaultRegistry();
  const d = loadAndValidateData();
  d.balance.delve.runes.load.bySlot = { primary: 0, defensive: 0, ultimate: 0 };
  /** The runes without their price. */
  const unloaded = new DataRegistry(d);
  const byKey = new Map(dpsCombos(registry).map((s) => [dpsKey(s), s]));
  const baseOf = (s: DpsSetup) => byKey.get(s.base!)!;
  /** Each run once: a baseline serves every set on its form. */
  const runs = new Map<string, number>();
  const dps = (r: DataRegistry, s: DpsSetup, o: DpsOptions) => {
    const key = `${r === registry}|${o.pack}|${o.sustained ?? 'full'}|${dpsKey(s)}`;
    if (!runs.has(key)) runs.set(key, simulateDps(r, s, o).dps);
    return runs.get(key)!;
  };
  /** A set's DPS over its rune-less chain's, under `r` (the loads in, or zeroed). */
  const ratio = (r: DataRegistry, s: DpsSetup, o: DpsOptions) =>
    dps(r, s, o) / dps(r, baseOf(s), o);
  /** The mean cost of a setup's Primary moves (a hold at full charge) on the hero `o` builds. */
  const perPress = (s: DpsSetup, o: DpsOptions) => {
    const { stats, chains } = labHero(registry, s, o);
    const chain = resolveChain(registry, stats, 'primary', chains.primary);
    return chain.moves.reduce((a, _, i) => a + valuedMove(chain, i).cost, 0) / chain.moves.length;
  };
  const x = (n: number) => n.toFixed(2);

  for (const form of FORMS)
    it(`${form}: supported at least ${FLOOR}× on the pack, the starved mana per press in ${BAND[0]}–${BAND[1]}×`, () => {
      const full = (pack: boolean): DpsOptions => ({ depth: DEPTH, pack });
      const sets = runeComboSetups(registry, form).map((s) => ({
        s,
        unloaded: ratio(unloaded, s, full(true)),
      }));
      sets.sort((a, b) => b.unloaded - a.unloaded);
      const set = sets[0].s;
      /** One layout's ratios: full mana, starved and supported, each loaded and unloaded. */
      const layout = (pack: boolean) => {
        const at = (sustained?: DpsOptions['sustained']) => {
          const o = { ...full(pack), sustained };
          return { loaded: ratio(registry, set, o), unloaded: ratio(unloaded, set, o) };
        };
        return { full: at(), starved: at('starved'), supported: at('supported') };
      };
      const [pack, one] = [layout(true), layout(false)];
      const press = {
        starved:
          perPress(set, { ...full(true), sustained: 'starved' }) /
          perPress(baseOf(set), { ...full(true), sustained: 'starved' }),
        supported:
          perPress(set, { ...full(true), sustained: 'supported' }) /
          perPress(baseOf(set), { ...full(true), sustained: 'supported' }),
      };
      const row = (l: typeof pack) =>
        `full ${x(l.full.unloaded)} → ${x(l.full.loaded)}, starved ${x(l.starved.loaded)} (${x(l.starved.unloaded)}), supported ${x(l.supported.loaded)} (${x(l.supported.unloaded)})`;
      const bites = [pack, one].every(
        (l) => l.starved.loaded < l.starved.unloaded && l.supported.loaded < l.supported.unloaded,
      );
      console.log(
        [
          `${form.padEnd(6)} ${set.dims.rune} (next: ${sets
            .slice(1, 3)
            .map((c) => `${c.s.dims.rune} ${x(c.unloaded)}`)
            .join('; ')})`,
          `  pack: ${row(pack)}`,
          `  one:  ${row(one)}`,
          `  mana per press ${x(press.starved)}× starved, ${x(press.supported)}× supported; the price ${bites ? 'bites' : 'DOES NOT BITE'}`,
        ].join('\n'),
      );
      expect(pack.supported.loaded).toBeGreaterThanOrEqual(FLOOR);
      expect(press.starved).toBeGreaterThanOrEqual(BAND[0]);
      expect(press.starved).toBeLessThanOrEqual(BAND[1]);
    }, 120_000);
});
