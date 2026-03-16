import { useState, useCallback, useRef } from 'react';
import {
  loadAndValidateData,
  DataRegistry,
  AIController,
  SeededRNG,
  createMatch,
  applyAction,
  calculateStats,
} from '@alloy/engine';
import type {
  MatchState,
  AITier,
  GameAction,
} from '@alloy/engine';
import type { SimulationConfig, SimulationResults, MatchResult } from '../types';

interface SimulationState {
  running: boolean;
  progress: number;
  total: number;
  results: SimulationResults | null;
  error: string | null;
}

function getAffixIds(state: MatchState, player: 0 | 1): string[] {
  const loadout = state.players[player].loadout;
  const ids: string[] = [];
  for (const item of [loadout.weapon, loadout.armor]) {
    for (const slot of item.slots) {
      if (!slot) continue;
      if (slot.kind === 'single' || slot.kind === 'upgraded') {
        ids.push(slot.orb.affixId);
      } else if (slot.kind === 'compound') {
        ids.push(slot.orbs[0].affixId);
        ids.push(slot.orbs[1].affixId);
      }
    }
  }
  return ids;
}

function runSingleMatch(
  matchIndex: number,
  seed: number,
  aiTier1: AITier,
  aiTier2: AITier,
  registry: DataRegistry,
): MatchResult {
  const masterRng = new SeededRNG(seed);
  const ai0 = new AIController(aiTier1, registry, masterRng.fork('ai0'));
  const ai1 = new AIController(aiTier2, registry, masterRng.fork('ai1'));

  let state = createMatch(
    `sim-${matchIndex}`,
    seed,
    'quick',
    ['ai-p0', 'ai-p1'],
    'sword',
    'chainmail',
    registry,
  );

  const maxIterations = 5000;
  let iterations = 0;

  while (state.phase.kind !== 'complete' && iterations < maxIterations) {
    iterations++;
    const phase = state.phase;

    let action: GameAction;

    if (phase.kind === 'draft') {
      const activePlayer = phase.activePlayer;
      const ai = activePlayer === 0 ? ai0 : ai1;
      const myStockpile = state.players[activePlayer].stockpile;
      const oppStockpile = state.players[activePlayer === 0 ? 1 : 0].stockpile;
      const orbUid = ai.pickOrb(state.pool, myStockpile, oppStockpile);
      action = { kind: 'draft_pick', player: activePlayer, orbUid };
    } else if (phase.kind === 'forge') {
      // Run forge actions for both players
      for (const p of [0, 1] as const) {
        if (state.forgeComplete?.[p]) continue;
        const ai = p === 0 ? ai0 : ai1;
        const playerState = state.players[p];
        const flux = state.forgeFlux?.[p] ?? 0;
        const oppStockpile = state.players[p === 0 ? 1 : 0].stockpile;
        const forgeActions = ai.planForge(
          playerState.stockpile,
          playerState.loadout,
          flux,
          phase.round as 1 | 2 | 3,
          oppStockpile,
        );

        for (const fa of forgeActions) {
          const result = applyAction(state, { kind: 'forge_action', player: p, action: fa }, registry);
          if (result.ok) {
            state = result.state;
          }
        }

        const completeResult = applyAction(state, { kind: 'forge_complete', player: p }, registry);
        if (completeResult.ok) {
          state = completeResult.state;
        }
      }
      continue;
    } else if (phase.kind === 'adapt') {
      // Run adapt for both players
      for (const p of [0, 1] as const) {
        const ai = p === 0 ? ai0 : ai1;
        const prevLog = state.duelLogs[state.duelLogs.length - 1];
        const oppLoadout = state.players[p === 0 ? 1 : 0].loadout;
        const myLoadout = state.players[p].loadout;
        const flux = state.forgeFlux?.[p] ?? 0;
        const adaptActions = ai.planAdapt(
          prevLog,
          oppLoadout,
          myLoadout,
          state.players[p].stockpile,
          flux,
        );

        for (const fa of adaptActions) {
          const result = applyAction(state, { kind: 'forge_action', player: p, action: fa }, registry);
          if (result.ok) {
            state = result.state;
          }
        }

        const completeResult = applyAction(state, { kind: 'forge_complete', player: p }, registry);
        if (completeResult.ok) {
          state = completeResult.state;
        }
      }
      continue;
    } else if (phase.kind === 'duel') {
      action = { kind: 'advance_phase' };
    } else {
      break;
    }

    const result = applyAction(state, action, registry);
    if (result.ok) {
      state = result.state;
    } else {
      break;
    }
  }

  const finalPhase = state.phase;
  const winner = finalPhase.kind === 'complete' ? finalPhase.winner : ('draw' as const);
  const scores: [number, number] = finalPhase.kind === 'complete'
    ? finalPhase.scores
    : [0, 0];

  let p0Stats = null;
  let p1Stats = null;
  try {
    p0Stats = calculateStats(state.players[0].loadout, registry);
    p1Stats = calculateStats(state.players[1].loadout, registry);
  } catch {
    // Stats may fail if loadout is incomplete
  }

  return {
    matchIndex,
    seed,
    winner,
    scores,
    duelLogs: state.duelLogs,
    roundResults: state.roundResults,
    finalState: state,
    player0Stats: p0Stats,
    player1Stats: p1Stats,
    player0Affixes: getAffixIds(state, 0),
    player1Affixes: getAffixIds(state, 1),
  };
}

export function useSimulation() {
  const [state, setState] = useState<SimulationState>({
    running: false,
    progress: 0,
    total: 0,
    results: null,
    error: null,
  });

  const cancelRef = useRef(false);

  const run = useCallback((config: SimulationConfig) => {
    cancelRef.current = false;
    setState({ running: true, progress: 0, total: config.matchCount, results: null, error: null });

    const startedAt = Date.now();

    // Use setTimeout to keep UI responsive
    let data: ReturnType<typeof loadAndValidateData>;
    let registry: DataRegistry;

    try {
      data = loadAndValidateData();
      registry = new DataRegistry(
        data.affixes,
        data.combinations,
        data.synergies,
        data.baseItems,
        data.balance,
      );
    } catch (err) {
      setState((s) => ({ ...s, running: false, error: String(err) }));
      return;
    }

    const matches: MatchResult[] = [];
    let i = 0;

    function runBatch() {
      if (cancelRef.current) {
        setState((s) => ({ ...s, running: false }));
        return;
      }

      const batchSize = 5;
      const end = Math.min(i + batchSize, config.matchCount);

      for (; i < end; i++) {
        const seed = config.startingSeed + i;
        try {
          const result = runSingleMatch(i, seed, config.aiTier1, config.aiTier2, registry);
          matches.push(result);
        } catch (err) {
          console.error(`Match ${i} failed:`, err);
        }
      }

      setState((s) => ({ ...s, progress: i }));

      if (i < config.matchCount) {
        setTimeout(runBatch, 0);
      } else {
        const results: SimulationResults = {
          config,
          matches,
          startedAt,
          completedAt: Date.now(),
        };
        setState({ running: false, progress: i, total: config.matchCount, results, error: null });
      }
    }

    setTimeout(runBatch, 0);
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { ...state, run, cancel };
}
