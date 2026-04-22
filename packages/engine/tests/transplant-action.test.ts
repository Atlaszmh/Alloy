import { describe, it, expect } from 'vitest';
import { applyForgeAction, createForgeState } from '../src/forge/forge-state.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { createGem, type SecondarySlot } from '../src/types/gem.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { liveSlots } from '../src/types/slot-array.js';

const data = loadAndValidateData();
const registry = new DataRegistry(
  data.affixes,
  data.combinations,
  data.synergies,
  data.baseItems,
  data.balance,
  data.recipes,
);

// unlockThreshold = 6: tier + rarityIndex(rarity) >= 6 → has secondary slot
// rarityIndex: common=0, uncommon=1, magic=2, rare=3, epic=4, legendary=5
// T5 + rare(3) = 8 >= 6 → has secondary slot
// T5 + common(0) = 5 < 6 → no secondary slot

function makeState(gems: ReturnType<typeof createGem>[], rng?: SeededRNG) {
  const state = createForgeState(gems, 'iron_sword', 'iron_armor', 1, data.balance, false);
  return { ...state, rng: rng ?? new SeededRNG(0) };
}

describe('applyTransplantGem via applyForgeAction', () => {
  it('rejects when target does not have an open slot', () => {
    // T5 common: tier(5) + rarityIndex(common=0) = 5 < 6 → no secondary slot
    const target = createGem('target1', 'flat_physical', 5, 'common');
    const source = createGem('source1', 'flat_hp', 3, 'magic');
    const state = makeState([target, source]);

    const result = applyForgeAction(state, {
      kind: 'transplant_gem',
      targetGemUid: 'target1',
      sourceGemUid: 'source1',
    }, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/open.*slot/i);
  });

  it('rejects when target already has a filled secondary', () => {
    const existingSecondary: SecondarySlot = {
      affixId: 'armor_rating',
      tier: 2,
      rarity: 'magic',
      sourceGemUid: 'some_old_gem',
    };
    // T5 + rare(3) = 8 >= 6 → has secondary slot
    const target: ReturnType<typeof createGem> = {
      ...createGem('target2', 'flat_physical', 5, 'rare'),
      secondary: existingSecondary,
    };
    const source = createGem('source2', 'flat_hp', 3, 'magic');
    const state = makeState([target, source]);

    const result = applyForgeAction(state, {
      kind: 'transplant_gem',
      targetGemUid: 'target2',
      sourceGemUid: 'source2',
    }, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already filled|secondary slot is already/i);
  });

  it('rejects when source === target', () => {
    const gem = createGem('gem1', 'flat_physical', 5, 'rare');
    const state = makeState([gem]);

    const result = applyForgeAction(state, {
      kind: 'transplant_gem',
      targetGemUid: 'gem1',
      sourceGemUid: 'gem1',
    }, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/different/i);
  });

  it('rejects when chosenAffix=secondary but source has no secondary', () => {
    const target = createGem('target3', 'flat_physical', 5, 'rare');
    const source = createGem('source3', 'flat_hp', 3, 'magic');
    const state = makeState([target, source]);

    const result = applyForgeAction(state, {
      kind: 'transplant_gem',
      targetGemUid: 'target3',
      sourceGemUid: 'source3',
      chosenAffix: 'secondary',
    }, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no secondary/i);
  });

  it('rejects when target not in stockpile', () => {
    const source = createGem('source4', 'flat_hp', 3, 'magic');
    const state = makeState([source]);

    const result = applyForgeAction(state, {
      kind: 'transplant_gem',
      targetGemUid: 'nonexistent_target',
      sourceGemUid: 'source4',
    }, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/target gem not found/i);
  });

  it('rejects when source not in stockpile', () => {
    const target = createGem('target5', 'flat_physical', 5, 'rare');
    const state = makeState([target]);

    const result = applyForgeAction(state, {
      kind: 'transplant_gem',
      targetGemUid: 'target5',
      sourceGemUid: 'nonexistent_source',
    }, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/source gem not found/i);
  });

  it('rejects when ForgeState has no rng', () => {
    const target = createGem('target6r', 'flat_physical', 5, 'rare');
    const source = createGem('source6r', 'flat_hp', 3, 'magic');
    const baseState = createForgeState([target, source], 'iron_sword', 'iron_armor', 1, data.balance, false);
    // Deliberately omit rng

    const result = applyForgeAction(baseState, {
      kind: 'transplant_gem',
      targetGemUid: 'target6r',
      sourceGemUid: 'source6r',
    }, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/rng/i);
  });

  it('succeeds: target gains secondary, source removed from stockpile', () => {
    // Rare T5 target + Magic T3 flat_hp source
    const target = createGem('target6', 'flat_physical', 5, 'rare');
    const source = createGem('source6', 'flat_hp', 3, 'magic');
    const state = makeState([target, source]);

    const result = applyForgeAction(state, {
      kind: 'transplant_gem',
      targetGemUid: 'target6',
      sourceGemUid: 'source6',
    }, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const updatedTarget = liveSlots(result.state.stockpile).find(g => g.uid === 'target6');
    const sourceInStockpile = liveSlots(result.state.stockpile).find(g => g.uid === 'source6');

    expect(updatedTarget).toBeDefined();
    expect(sourceInStockpile).toBeUndefined();

    // Source has no secondary, so primary affix transplants
    expect(updatedTarget!.secondary).toBeDefined();
    expect(updatedTarget!.secondary!.affixId).toBe('flat_hp');
    expect(updatedTarget!.secondary!.tier).toBe(3);
    expect(updatedTarget!.secondary!.rarity).toBe('magic');

    // target.tags should include the transplanted affixId
    expect(updatedTarget!.tags).toContain('flat_hp');
  });

  it('dedups affixId into target.tags (does not duplicate existing entry)', () => {
    // Build target whose tags already include the source's affixId
    const target = createGem('target7', 'flat_physical', 5, 'rare', { tags: ['flat_physical', 'flat_hp'] });
    const source = createGem('source7', 'flat_hp', 3, 'magic');
    const state = makeState([target, source]);

    const result = applyForgeAction(state, {
      kind: 'transplant_gem',
      targetGemUid: 'target7',
      sourceGemUid: 'source7',
    }, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const updatedTarget = liveSlots(result.state.stockpile).find(g => g.uid === 'target7');
    expect(updatedTarget).toBeDefined();

    // Should have exactly one 'flat_hp' entry in tags, not duplicated
    const flatHpCount = updatedTarget!.tags.filter(t => t === 'flat_hp').length;
    expect(flatHpCount).toBe(1);
  });
});
