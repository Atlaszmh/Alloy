import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { BalanceConfigSchema, DropsBalanceSchema } from '../src/data/schemas.js';
import balanceData from '../src/data/balance.json';
import { GearItemSchema } from '../src/delve/profile-schema.js';
import { createDelveProfile } from '../src/delve/profile.js';

// See the tutorial spec and the constructs spec §3.2: Open a skill's prices (Awaken's heir),
// `drops.essenceMinDepth`, and a save without the retired `awakened`.

const registry = createDefaultRegistry();
const bal = registry.getDelveBalance();

describe('the tutorial stage balance', () => {
  it("holds Open a skill's prices (the rare's at Awaken's old Links and scrap) and the essence floor (depth 20)", () => {
    expect(bal.movesets.openSkill.rare).toEqual({ flux: { rare: 1 }, links: 2, scrap: 120 });
    expect(bal.crafting).not.toHaveProperty('awaken');
    expect(bal.drops.essenceMinDepth).toBe(20);
  });

  it('refuses a negative price, a fractional or common flux, and an essence floor under 1', () => {
    const open = (patch: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: {
          ...balanceData.delve,
          movesets: {
            ...balanceData.delve.movesets,
            openSkill: {
              ...balanceData.delve.movesets.openSkill,
              rare: { ...balanceData.delve.movesets.openSkill.rare, ...patch },
            },
          },
        },
      }).success;
    expect(open({})).toBe(true);
    expect(open({ links: -1 })).toBe(false);
    expect(open({ flux: { rare: 0.5 } })).toBe(false);
    expect(open({ flux: { common: 1 } })).toBe(false);
    const floor = (d: number) =>
      DropsBalanceSchema.safeParse({ ...bal.drops, essenceMinDepth: d }).success;
    expect([floor(1), floor(0), floor(2.5)]).toEqual([true, false, false]);
  });
});

describe('GearItem.awakened is gone', () => {
  it('a saved item carries no such flag, and one in an old save is dropped at load', () => {
    const sword = createDelveProfile(registry, 3).equipped.weapon!;
    expect(sword).not.toHaveProperty('awakened');
    expect(GearItemSchema.parse({ ...sword, awakened: true })).not.toHaveProperty('awakened');
  });
});
