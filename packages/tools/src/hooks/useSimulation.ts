import { useState, useCallback, useRef } from 'react';
import {
  loadAndValidateData,
  DataRegistry,
  runSimulation,
} from '@alloy/engine';
import type {
  SimulationConfig as EngineSimConfig,
  MatchReport,
} from '@alloy/engine';
import type { SimulationConfig, SimulationResults } from '../types';

interface SimulationState {
  running: boolean;
  progress: number;
  total: number;
  results: SimulationResults | null;
  error: string | null;
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

    let registry: DataRegistry;

    try {
      const data = loadAndValidateData();
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

    const matches: MatchReport[] = [];
    let completed = 0;

    function runBatch() {
      if (cancelRef.current) {
        setState((s) => ({ ...s, running: false }));
        return;
      }

      const batchSize = Math.min(5, config.matchCount - completed);

      const engineConfig: EngineSimConfig = {
        matchCount: batchSize,
        aiTier1: config.aiTier1,
        aiTier2: config.aiTier2,
        seedStart: config.startingSeed + completed,
        mode: 'quick',
        baseWeaponId: 'sword',
        baseArmorId: 'chainmail',
      };

      try {
        const batchResult = runSimulation(engineConfig, registry);
        matches.push(...batchResult.matches);
      } catch (err) {
        console.error(`Batch at offset ${completed} failed:`, err);
      }

      completed += batchSize;
      setState((s) => ({ ...s, progress: completed }));

      if (completed < config.matchCount) {
        setTimeout(runBatch, 0);
      } else {
        const results: SimulationResults = {
          config,
          matches,
          startedAt,
          completedAt: Date.now(),
        };
        setState({ running: false, progress: completed, total: config.matchCount, results, error: null });
      }
    }

    setTimeout(runBatch, 0);
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { ...state, run, cancel };
}
