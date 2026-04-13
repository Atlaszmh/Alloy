import { Router } from 'express';
import { supabase, batchInsert } from '../supabase.js';
import { WorkerPool } from '../worker-pool.js';
import { addSSEClient, sendProgress, closeSSE } from '../sse.js';
import type { MatchReport, RunSimulationResult } from '@alloy/engine';

const router = Router();
const activeRuns = new Map<string, WorkerPool>();

// List all simulation runs
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('simulation_runs')
    .select('id, config_id, match_count, ai_tiers, status, progress, started_at, completed_at')
    .order('started_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// Start a simulation
router.post('/', async (req, res) => {
  const {
    configId, matchCount, aiTiers, seedStart, mode, baseWeaponId, baseArmorId,
    simulationMode, maxRounds, startingLives, goalRound,
  } = req.body;

  // Fetch the config
  const { data: configRow, error: configErr } = await supabase
    .from('game_configs')
    .select('config')
    .eq('id', configId)
    .single();
  if (configErr) return res.status(400).json({ error: configErr.message });

  // Create run record
  const { data: run, error: runErr } = await supabase
    .from('simulation_runs')
    .insert({
      config_id: configId,
      match_count: matchCount,
      ai_tiers: aiTiers,
      seed_start: seedStart,
      status: 'running',
    })
    .select()
    .single();
  if (runErr) return res.status(500).json({ error: runErr.message });

  res.status(201).json(run);

  // Run simulation in background
  const pool = new WorkerPool();
  activeRuns.set(run.id, pool);

  if (simulationMode === 'run') {
    // Run simulation mode: simulate full runs with lives
    pool.runSimulation(
      {
        configJson: JSON.stringify(configRow.config),
        matchCount: 1, // Single worker handles all runs
        aiTier1: aiTiers[0],
        aiTier2: aiTiers[1] ?? aiTiers[0],
        seedStart,
        mode: mode || 'ranked',
        baseWeaponId: baseWeaponId || 'sword',
        baseArmorId: baseArmorId || 'chainmail',
        simulationMode: 'run',
        runConfig: {
          runCount: matchCount, // reuse matchCount as runCount
          maxRounds: maxRounds ?? 20,
          startingLives: startingLives ?? 3,
          goalRound: goalRound ?? 10,
        },
      },
      (_report: MatchReport) => {
        // Individual match reports are not emitted in run mode;
        // the run_result message contains the aggregate.
      },
      (completed: number, total: number) => {
        const progress = completed / total;
        sendProgress(run.id, { progress, completed, total, status: 'running' });
      },
    ).then(async ({ completed, failed }) => {
      const failRate = failed / (completed + failed || 1);
      const status = failRate > 0.1 ? 'failed' : 'complete';
      await supabase.from('simulation_runs')
        .update({ status, progress: 1.0, completed_at: new Date().toISOString() })
        .eq('id', run.id);
      sendProgress(run.id, { progress: 1, completed, total: matchCount, status });
      closeSSE(run.id);
      activeRuns.delete(run.id);
    });
  } else {
    // Standard match simulation mode
    const resultBuffer: MatchReport[] = [];
    const FLUSH_SIZE = 100;

    const flushResults = async () => {
      if (resultBuffer.length === 0) return;
      const batch = resultBuffer.splice(0, resultBuffer.length);

      const matchRows = batch.map(r => ({
        run_id: run.id, config_id: configId, source: r.source,
        seed: r.seed, winner: r.winner, rounds: r.rounds,
        duration_ms: r.durationMs,
      }));
      const { data: insertedMatches } = await supabase
        .from('match_results').insert(matchRows).select('id');

      if (insertedMatches) {
        const playerRows = insertedMatches.flatMap((m: { id: string }, i: number) =>
          batch[i].players.map(p => ({
            match_id: m.id, player_index: p.playerIndex,
            ai_tier: p.aiTier ?? null, final_hp: p.finalHP,
            affix_ids: p.affixIds, combination_ids: p.combinationIds,
            synergy_ids: p.synergyIds, loadout: p.loadout,
          }))
        );
        await batchInsert('match_player_stats', playerRows);

        const roundRows = insertedMatches.flatMap((m: { id: string }, i: number) =>
          batch[i].roundDetails.map(rd => ({
            match_id: m.id, round: rd.round, winner: rd.winner,
            duration_ticks: rd.duration, // TODO: rename DB column in separate migration
            p0_hp_final: rd.p0HpFinal, p1_hp_final: rd.p1HpFinal,
            p0_damage_dealt: rd.p0DamageDealt, p1_damage_dealt: rd.p1DamageDealt,
          }))
        );
        await batchInsert('match_round_details', roundRows);
      }
    };

    pool.runSimulation(
      {
        configJson: JSON.stringify(configRow.config),
        matchCount,
        aiTier1: aiTiers[0],
        aiTier2: aiTiers[1],
        seedStart,
        mode: mode || 'quick',
        baseWeaponId: baseWeaponId || 'sword',
        baseArmorId: baseArmorId || 'chainmail',
      },
      (report: MatchReport) => {
        resultBuffer.push(report);
        if (resultBuffer.length >= FLUSH_SIZE) flushResults();
      },
      (completed: number, total: number) => {
        const progress = completed / total;
        sendProgress(run.id, { progress, completed, total, status: 'running' });
        if (completed % Math.ceil(total / 10) === 0) {
          supabase.from('simulation_runs')
            .update({ progress })
            .eq('id', run.id)
            .then(() => {});
        }
      },
    ).then(async ({ completed, failed }) => {
      await flushResults();
      const failRate = failed / matchCount;
      const status = failRate > 0.1 ? 'failed' : 'complete';
      await supabase.from('simulation_runs')
        .update({ status, progress: 1.0, completed_at: new Date().toISOString() })
        .eq('id', run.id);
      sendProgress(run.id, { progress: 1, completed, total: matchCount, status });
      closeSSE(run.id);
      activeRuns.delete(run.id);
    });
  }
});

// Get simulation status
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('simulation_runs')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// SSE progress stream
router.get('/:id/progress', (req, res) => {
  addSSEClient(req.params.id, res);
});

// Cancel simulation
router.post('/:id/cancel', async (req, res) => {
  const pool = activeRuns.get(req.params.id);
  if (pool) {
    pool.cancel();
    activeRuns.delete(req.params.id);
  }
  await supabase.from('simulation_runs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', req.params.id);
  closeSSE(req.params.id);
  res.json({ status: 'cancelled' });
});

export default router;
