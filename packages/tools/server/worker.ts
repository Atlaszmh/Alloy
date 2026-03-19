/**
 * Simulation worker thread.
 *
 * Receives a WorkerData payload via workerData, runs a batch of matches
 * sequentially, and posts results back to the parent thread via parentPort.
 */
import { workerData, parentPort } from 'node:worker_threads';
import {
  DataRegistry,
  createMatch,
  applyAction,
  AIController,
  SeededRNG,
  extractMatchReport,
} from '@alloy/engine';
import type { AITier, MatchMode, MatchReport, GameConfig } from '@alloy/engine';

export interface WorkerData {
  configJson: string; // JSON.stringify'd GameConfig
  seedStart: number;
  matchCount: number;
  aiTier1: AITier;
  aiTier2: AITier;
  mode: MatchMode;
  baseWeaponId: string;
  baseArmorId: string;
}

export type WorkerMessage =
  | { type: 'result'; report: MatchReport }
  | { type: 'error'; seed: number; error: string }
  | { type: 'done' };

function buildRegistry(config: GameConfig): DataRegistry {
  return new DataRegistry(
    config.affixes,
    config.combinations,
    config.synergies,
    config.baseItems,
    config.balance,
  );
}

function runAIMatch(
  seed: number,
  tier1: AITier,
  tier2: AITier,
  mode: MatchMode,
  baseWeaponId: string,
  baseArmorId: string,
  registry: DataRegistry,
): MatchReport {
  let state = createMatch(
    'sim_' + seed,
    seed,
    mode,
    ['ai_0', 'ai_1'],
    baseWeaponId,
    baseArmorId,
    registry,
  );

  const rng0 = new SeededRNG(seed).fork('ai_0');
  const rng1 = new SeededRNG(seed).fork('ai_1');
  const ai0 = new AIController(tier1, registry, rng0);
  const ai1 = new AIController(tier2, registry, rng1);

  // Draft phase
  while (state.phase.kind === 'draft') {
    const player = state.phase.activePlayer;
    const ai = player === 0 ? ai0 : ai1;
    const orbUid = ai.pickOrb(
      state.pool,
      state.players[player].stockpile,
      state.players[1 - player as 0 | 1].stockpile,
    );
    const result = applyAction(state, { kind: 'draft_pick', player, orbUid }, registry);
    if (!result.ok) throw new Error(`Draft failed: ${result.error}`);
    state = result.state;
  }

  // Forge + Duel rounds
  while (state.phase.kind !== 'complete') {
    if (state.phase.kind === 'forge') {
      const forgePhase = state.phase;
      for (const player of [0, 1] as const) {
        const ai = player === 0 ? ai0 : ai1;
        const actions = ai.planForge(
          state.players[player].stockpile,
          state.players[player].loadout,
          state.forgeFlux?.[player] ?? 0,
          forgePhase.round,
          state.players[1 - player as 0 | 1].stockpile,
        );
        for (const action of actions) {
          const result = applyAction(state, { kind: 'forge_action', player, action }, registry);
          if (result.ok) state = result.state;
        }
        const completeResult = applyAction(state, { kind: 'forge_complete', player }, registry);
        if (completeResult.ok) state = completeResult.state;
      }
    }

    if (state.phase.kind === 'duel') {
      const result = applyAction(state, { kind: 'advance_phase' }, registry);
      if (!result.ok) throw new Error(`Duel failed: ${result.error}`);
      state = result.state;
      const cont = applyAction(state, { kind: 'duel_continue' }, registry);
      if (!cont.ok) throw new Error(`Duel continue failed: ${cont.error}`);
      state = cont.state;
    }

    if (state.phase.kind === 'adapt') {
      const result = applyAction(state, { kind: 'advance_phase' }, registry);
      if (result.ok) {
        state = result.state;
      } else {
        break;
      }
    }
  }

  return extractMatchReport(state, 'simulation', seed, registry);
}

// --- Main worker logic ---

if (!parentPort) throw new Error('worker.ts must run inside a Worker thread');

const data = workerData as WorkerData;
const config = JSON.parse(data.configJson) as GameConfig;
const registry = buildRegistry(config);

(async () => {
  for (let i = 0; i < data.matchCount; i++) {
    const seed = data.seedStart + i;
    try {
      const report = runAIMatch(
        seed,
        data.aiTier1,
        data.aiTier2,
        data.mode,
        data.baseWeaponId,
        data.baseArmorId,
        registry,
      );
      parentPort!.postMessage({ type: 'result', report } satisfies WorkerMessage);
    } catch (err) {
      parentPort!.postMessage({
        type: 'error',
        seed,
        error: err instanceof Error ? err.message : String(err),
      } satisfies WorkerMessage);
    }
  }
  parentPort!.postMessage({ type: 'done' } satisfies WorkerMessage);
})();
