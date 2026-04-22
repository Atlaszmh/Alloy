import type { DataRegistry } from '../data/registry.js';
import type { GemInstance } from './gem.js';
import { hasSecondarySlot } from './gem.js';

export function hasSecondarySlotFromRegistry(gem: GemInstance, registry: DataRegistry): boolean {
  return hasSecondarySlot(gem, registry.getBalance().transplant!.unlockThreshold);
}
