import { describe, it, expect } from 'vitest';
import { computeAggregateStats } from '../src/balance/stats-collector.js';
import type { MatchReport } from '../src/types/match-report.js';
import type { CombatLog } from '../src/types/combat.js';

/**
 * Build a minimal MatchReport carrying combat-log events. Only fields the
 * stats collector reads need to be populated; the rest can be zero-values.
 */
function fakeReport(opts: {
  winner: 0 | 1 | null;
  combinationIds: [string[], string[]];
  combatLogs: CombatLog[];
  affixIds?: [string[], string[]];
}): MatchReport {
  const aff = opts.affixIds ?? [[], []];
  return {
    source: 'simulation',
    winner: opts.winner,
    rounds: 1,
    durationMs: 1000,
    players: [
      {
        playerId: 'p0',
        loadout: undefined as never,
        finalStats: undefined as never,
        affixIds: aff[0],
        synergyIds: [],
        combinationIds: opts.combinationIds[0],
        genericUpgradeCount: 0,
        weaponBaseId: 'sword',
        armorBaseId: 'chainmail',
        weaponBaseStats: null,
        armorBaseStats: null,
      },
      {
        playerId: 'p1',
        loadout: undefined as never,
        finalStats: undefined as never,
        affixIds: aff[1],
        synergyIds: [],
        combinationIds: opts.combinationIds[1],
        genericUpgradeCount: 0,
        weaponBaseId: 'sword',
        armorBaseId: 'chainmail',
        weaponBaseStats: null,
        armorBaseStats: null,
      },
    ],
    roundDetails: [{ round: 1, duration: 1, winner: opts.winner === null ? 0 : opts.winner }],
    combatLogs: opts.combatLogs,
    playerStats: undefined as never,
  };
}

function fakeLog(events: CombatLog['frames'][number]['events']): CombatLog {
  return {
    seed: 0,
    frames: [{ time: 0, events }],
    result: { round: 1, winner: 0, finalHP: [100, 0], duration: 1, wasTiebreak: false, p0DamageDealt: 0, p1DamageDealt: 0 },
  };
}

describe('computeAggregateStats — compound runtime metrics', () => {
  it('counts compound_trigger events as procs and tags matches with at least one proc', () => {
    const reports: MatchReport[] = [
      fakeReport({
        winner: 0,
        combinationIds: [['ignite'], []],
        combatLogs: [
          fakeLog([
            { type: 'compound_trigger', player: 0, compoundId: 'ignite', displayName: 'IGNITE!' },
            { type: 'compound_trigger', player: 0, compoundId: 'ignite', displayName: 'IGNITE!' },
          ]),
        ],
      }),
      fakeReport({
        winner: 1,
        combinationIds: [['ignite'], []],
        combatLogs: [
          fakeLog([
            { type: 'compound_trigger', player: 0, compoundId: 'ignite', displayName: 'IGNITE!' },
          ]),
        ],
      }),
      fakeReport({
        winner: 0,
        combinationIds: [[], []],
        combatLogs: [fakeLog([])],
      }),
    ];

    const stats = computeAggregateStats(reports);
    const ignite = stats.compoundRuntime.get('ignite');
    expect(ignite).toBeDefined();
    expect(ignite!.totalProcs).toBe(3); // 2 + 1
    expect(ignite!.matchesWithProc).toBe(2); // 2 of 3 matches saw a proc
  });

  it('attributes DOT damage to the source compound via sourceAffixId prefix', () => {
    const reports: MatchReport[] = [
      fakeReport({
        winner: 0,
        combinationIds: [['ignite'], []],
        combatLogs: [
          fakeLog([
            {
              type: 'dot_tick',
              target: 1,
              sourceAffixId: 'compound:ignite',
              breakdown: {
                element: 'fire',
                damagePerSecond: 10,
                stacks: 1,
                rawTotal: 10,
                resistPoints: 0,
                elementalPenetration: 0,
                effectiveResist: 0,
                reductionPct: 0,
                netDamage: 10,
              },
            },
            {
              type: 'dot_tick',
              target: 1,
              sourceAffixId: 'compound:ignite',
              breakdown: {
                element: 'fire',
                damagePerSecond: 12,
                stacks: 1,
                rawTotal: 12,
                resistPoints: 0,
                elementalPenetration: 0,
                effectiveResist: 0,
                reductionPct: 0,
                netDamage: 12,
              },
            },
            // legacy non-compound DOT — should NOT count toward ignite
            {
              type: 'dot_tick',
              target: 1,
              sourceAffixId: 'trigger',
              breakdown: {
                element: 'poison',
                damagePerSecond: 5,
                stacks: 1,
                rawTotal: 5,
                resistPoints: 0,
                elementalPenetration: 0,
                effectiveResist: 0,
                reductionPct: 0,
                netDamage: 5,
              },
            },
          ]),
        ],
      }),
    ];

    const stats = computeAggregateStats(reports);
    expect(stats.compoundRuntime.get('ignite')?.attributedDotDamage).toBe(22);
    expect(stats.compoundRuntime.has('trigger')).toBe(false);
  });

  it('compound-heavy slice tracks builds with ≥2 socketed compounds', () => {
    const reports: MatchReport[] = [
      fakeReport({ winner: 0, combinationIds: [['ignite', 'frostbite'], []], combatLogs: [fakeLog([])] }), // p0 wins, heavy
      fakeReport({ winner: 1, combinationIds: [['ignite', 'frostbite', 'soul_rend'], []], combatLogs: [fakeLog([])] }), // p0 loses, heavy
      fakeReport({ winner: 0, combinationIds: [['ignite'], []], combatLogs: [fakeLog([])] }), // p0 single compound, NOT heavy
      fakeReport({ winner: 1, combinationIds: [[], []], combatLogs: [fakeLog([])] }), // no compounds
    ];

    const stats = computeAggregateStats(reports);
    expect(stats.compoundHeavyMatchCount).toBe(2);
    expect(stats.compoundHeavyWinRate).toBeCloseTo(0.5);
  });

  it('returns null compoundHeavyWinRate when no qualifying matches', () => {
    const reports: MatchReport[] = [
      fakeReport({ winner: 0, combinationIds: [['ignite'], []], combatLogs: [fakeLog([])] }),
    ];
    const stats = computeAggregateStats(reports);
    expect(stats.compoundHeavyWinRate).toBeNull();
    expect(stats.compoundHeavyMatchCount).toBe(0);
  });

  it('zero matches returns empty maps and null heavy slice', () => {
    const stats = computeAggregateStats([]);
    expect(stats.compoundRuntime.size).toBe(0);
    expect(stats.compoundHeavyWinRate).toBeNull();
    expect(stats.compoundHeavyMatchCount).toBe(0);
  });
});
