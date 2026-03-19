import { describe, it, expect } from 'vitest';
import { WorkerPool } from './worker-pool.js';
import type { SimulationRequest } from './worker-pool.js';
import { defaultConfig } from '@alloy/engine';
import type { MatchReport } from '@alloy/engine';

describe('WorkerPool', () => {
  it(
    'runs 10 matches and returns 10 MatchReport results',
    async () => {
      const config = defaultConfig();
      const request: SimulationRequest = {
        configJson: JSON.stringify(config),
        matchCount: 10,
        aiTier1: 1,
        aiTier2: 1,
        seedStart: 1000,
        mode: 'quick',
        baseWeaponId: 'sword',
        baseArmorId: 'chainmail',
      };

      const pool = new WorkerPool(2);
      const reports: MatchReport[] = [];
      let lastProgress = 0;

      const result = await pool.runSimulation(
        request,
        (report) => reports.push(report),
        (completed, _total) => {
          lastProgress = completed;
        },
      );

      expect(result.completed).toBe(10);
      expect(result.failed).toBe(0);
      expect(reports).toHaveLength(10);
      expect(lastProgress).toBe(10);

      // Each report should have the expected shape
      for (const report of reports) {
        expect(report.source).toBe('simulation');
        expect(report.winner === 0 || report.winner === 1 || report.winner === null).toBe(true);
        expect(typeof report.rounds).toBe('number');
        expect(report.players).toHaveLength(2);
      }

      // Seeds should be distinct (each match has a unique seed)
      const seeds = reports.map((r) => r.seed);
      const uniqueSeeds = new Set(seeds);
      expect(uniqueSeeds.size).toBe(10);
    },
    30_000, // 30s timeout — real matches are slow
  );
});
