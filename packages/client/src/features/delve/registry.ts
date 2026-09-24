import { createDefaultRegistry, type DataRegistry } from '@alloy/engine';

let registry: DataRegistry | null = null;

/** Shared registry for the Delve mode (includes delve.json + balance). */
export function getDelveRegistry(): DataRegistry {
  registry ??= createDefaultRegistry();
  return registry;
}
