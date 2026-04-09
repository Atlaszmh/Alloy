import { describe, it, expect } from 'vitest';
import { DiscoveryState } from '../src/combine/discovery-state.js';

describe('DiscoveryState', () => {
  it('starts empty', () => {
    const ds = new DiscoveryState();
    expect(ds.discoveredCount).toBe(0);
    expect(ds.attemptedCount).toBe(0);
  });

  it('records a discovered recipe', () => {
    const ds = new DiscoveryState();
    ds.recordDiscovery('burn');
    expect(ds.isDiscovered('burn')).toBe(true);
    expect(ds.discoveredCount).toBe(1);
  });

  it('deduplicates discoveries', () => {
    const ds = new DiscoveryState();
    ds.recordDiscovery('burn');
    ds.recordDiscovery('burn');
    expect(ds.discoveredCount).toBe(1);
  });

  it('records attempted combos with normalized keys', () => {
    const ds = new DiscoveryState();
    // Order-independent: fire+cold === cold+fire
    ds.recordAttempt('fire_damage', 'cold_damage');
    expect(ds.hasAttempted('fire_damage', 'cold_damage')).toBe(true);
    expect(ds.hasAttempted('cold_damage', 'fire_damage')).toBe(true);
  });

  it('serializes for future codex support', () => {
    const ds = new DiscoveryState();
    ds.recordDiscovery('burn');
    ds.recordAttempt('fire_damage', 'dot_multiplier');
    const serialized = ds.serialize();
    expect(serialized.discoveredRecipes).toContain('burn');
    expect(serialized.attemptedCombos).toContain('dot_multiplier+fire_damage');
  });

  it('deserializes back', () => {
    const ds = new DiscoveryState();
    ds.recordDiscovery('burn');
    ds.recordAttempt('fire_damage', 'dot_multiplier');
    const serialized = ds.serialize();

    const ds2 = DiscoveryState.deserialize(serialized);
    expect(ds2.isDiscovered('burn')).toBe(true);
    expect(ds2.hasAttempted('fire_damage', 'dot_multiplier')).toBe(true);
    expect(ds2.discoveredCount).toBe(1);
  });

  it('records synergy discoveries', () => {
    const ds = new DiscoveryState();
    ds.recordSynergyDiscovery('assassin');
    expect(ds.isSynergyDiscovered('assassin')).toBe(true);
  });
});
