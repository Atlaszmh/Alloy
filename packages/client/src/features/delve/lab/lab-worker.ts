/// <reference lib="webworker" />
import {
  createDefaultRegistry,
  dpsCombos,
  dpsKey,
  simulateDps,
  type DpsOptions,
} from '@alloy/engine';
import type { LabRow } from './lab-model';

/**
 * Runs the DPS Lab's whole grid for one request, posting its rows in batches
 * of 50. The page starts a fresh worker for every request.
 */

const BATCH = 50;
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<DpsOptions>) => {
  const registry = createDefaultRegistry();
  let batch: LabRow[] = [];
  for (const setup of dpsCombos(registry)) {
    batch.push({ key: dpsKey(setup), setup, result: simulateDps(registry, setup, e.data) });
    if (batch.length === BATCH) {
      scope.postMessage(batch);
      batch = [];
    }
  }
  if (batch.length > 0) scope.postMessage(batch);
};
