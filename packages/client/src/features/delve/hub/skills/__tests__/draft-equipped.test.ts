import { describe, it, expect } from 'vitest';
import { createDelveProfile, heroChains, movesetOf, type Chains } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { armed } from '../../../__tests__/armed';
import { absentText, cantExpress, draftEquipped } from '../useAnvilChains';

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

  it("merges the draft's chains over the weapon's own, the rest of the moveset kept", () => {
    const p = armed(createDelveProfile(registry, 1234, { primary: 'fire' }));
    const weapon = p.equipped.weapon!;
    const own = movesetOf(registry, weapon);
    const primary = { ...own.chains.primary!, payment: 'charge' as const };
    const out = draftEquipped(registry, p.equipped, { primary }).weapon!;
    expect(out.moveset!.chains.primary).toEqual(primary);
    expect(out.moveset!.chains.basic).toEqual(own.chains.basic);
    expect(out.moveset!.slots).toEqual(own.slots);
  });

  it('cantExpress names the form a weapon of another class holds; absentText the slot it lacks', () => {
    const p = armed(createDelveProfile(registry, 1234, { primary: 'fire' })); // an uncommon sword
    const sword = p.equipped.weapon!;
    expect(cantExpress(registry, sword, { kind: 'light', form: 'bolt', elements: ['fire'] })).toBe(
      "A sword can't express Bolt",
    );
    expect(
      cantExpress(registry, sword, { kind: 'light', form: 'lance', elements: ['fire'] }),
    ).toBeNull();
    expect(cantExpress(registry, sword, { kind: 'light', element: 'fire' })).toBeNull();
    expect(absentText(registry, null, 'primary')).toBe('Equip a weapon to build your moves.');
    expect(absentText(registry, sword, 'ultimate')).toBe(
      "No Ultimate slot yet: Open a skill on the Forge's Temper bench",
    );
    expect(absentText(registry, { ...sword, rarity: 'common' }, 'ultimate')).toBe(
      'No Ultimate slot on a common weapon',
    );
  });
});
