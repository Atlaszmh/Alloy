import { describe, it, expect } from 'vitest';
import { createDelveProfile, heroChains, type Chains } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { armed } from '../../../__tests__/armed';
import { draftEquipped } from '../useAnvilChains';

const registry = getDelveRegistry();

describe('draftEquipped', () => {
  it("puts the draft's chains on the worn weapon, so heroChains reads them; the rest of the gear is as worn", () => {
    const p = armed(createDelveProfile(registry, 1234, { primary: 'fire' }));
    const saved = heroChains(registry, p.equipped, p.pair) as Chains;
    const primary = {
      ...saved.primary,
      moves: [{ ...saved.primary.moves[0], form: 'lance' as const }],
    };
    const equipped = draftEquipped(registry, p.equipped, { ...saved, primary });
    expect(heroChains(registry, equipped, p.pair).primary).toEqual(primary);
    expect(equipped.weapon!.uid).toBe(p.equipped.weapon!.uid);
    expect(equipped.chest).toBe(p.equipped.chest);
    // The save's own weapon is untouched.
    expect(heroChains(registry, p.equipped, p.pair).primary!.moves[0].form).toBe('strike');
  });

  it('unarmed, the gear is as worn', () => {
    const p = createDelveProfile(registry, 1234, { primary: 'fire' });
    const bare = { ...p.equipped, weapon: undefined };
    expect(draftEquipped(registry, bare, {})).toBe(bare);
  });
});
