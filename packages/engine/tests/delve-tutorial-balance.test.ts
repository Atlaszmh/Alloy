import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { CraftingBalanceSchema, DropsBalanceSchema } from '../src/data/schemas.js';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { createDelveProfile } from '../src/delve/profile.js';

// See the tutorial spec: Awaken's price, `drops.essenceMinDepth` and `GearItem.awakened`.

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();

describe('the tutorial stage balance', () => {
  it("holds Awaken's price and the essence floor (depth 20)", () => {
    expect(bal.crafting.awaken).toEqual({ epicFlux: 1, links: 2, scrap: 120 });
    expect(bal.drops.essenceMinDepth).toBe(20);
  });

  it('refuses a negative price and an essence floor under 1', () => {
    const awaken = (a: object) =>
      CraftingBalanceSchema.safeParse({ ...bal.crafting, awaken: { ...bal.crafting.awaken, ...a } })
        .success;
    expect(awaken({})).toBe(true);
    expect(awaken({ links: -1 })).toBe(false);
    expect(awaken({ epicFlux: 0.5 })).toBe(false);
    const floor = (d: number) =>
      DropsBalanceSchema.safeParse({ ...bal.drops, essenceMinDepth: d }).success;
    expect([floor(1), floor(0), floor(2.5)]).toEqual([true, false, false]);
  });
});

describe('GearItem.awakened', () => {
  it('round-trips on a saved item, and an item without it stays without', () => {
    const sword = createDelveProfile(registry, 3).equipped.weapon!;
    expect(sword.awakened).toBeUndefined();
    expect(GearItemSchema.parse(sword)).not.toHaveProperty('awakened');
    expect(GearItemSchema.parse({ ...sword, awakened: true }).awakened).toBe(true);
    expect(GearItemSchema.safeParse({ ...sword, awakened: 'yes' }).success).toBe(false);
  });
});
