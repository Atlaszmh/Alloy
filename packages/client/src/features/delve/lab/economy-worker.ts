/// <reference lib="webworker" />
import { createDefaultRegistry, economySim, type EconomyReport } from '@alloy/engine';
import type { EconomyRequest } from './economy-model';

/**
 * Runs the Economy view's request: the economy sim of each seed in turn,
 * posting each report as it finishes. The view starts a fresh worker per Run.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<EconomyRequest>) => {
  const registry = createDefaultRegistry();
  for (const seed of e.data.seeds)
    scope.postMessage(economySim(registry, seed, e.data.dives) satisfies EconomyReport);
};
