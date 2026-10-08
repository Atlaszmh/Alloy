import { describe, it, expect } from 'vitest';
import { createDelveProfile, heroChains, profileStats, type Chains, type Move } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { armed } from '../../../__tests__/armed';
import { draftLines } from '../draft-lines';

const registry = getDelveRegistry();
const profile = armed(createDelveProfile(registry, 1234, { primary: 'fire' }));
const stats = profileStats(registry, profile);
const saved = heroChains(registry, profile.equipped, profile.pair) as Chains;
const bolt = saved.primary.moves[0];

describe('draftLines', () => {
  it('one line a changed skill, in the chains’ order: its chain before and after', () => {
    const heavy: Move = { ...bolt, kind: 'heavy' };
    const lines = draftLines(registry, stats, saved, {
      primary: { ...saved.primary, moves: [heavy] },
      basic: saved.basic.map((b, i) => (i === 0 ? { ...b, kind: 'medium' as const } : b)),
    });
    expect(lines.map((l) => l.skill)).toEqual(['basic', 'primary']);
    expect(lines[1]).toMatchObject({
      before: 'medium Fire Strike · medium Fire Strike',
      after: 'heavy Fire Strike',
      notes: [],
    });
    expect(lines[0].after).toMatch(/^medium Fire blow/);
  });

  it('notes a payment change, the sockets opened, and the runes socketed and pulled', () => {
    const withRune: Move = { ...bolt, runes: [{ id: 'quick', tier: 3 }] };
    const [line] = draftLines(registry, stats, saved, {
      primary: { moves: [withRune], payment: 'charge' },
    });
    expect(line.notes).toEqual(['Pays with charge (was mana)', 'Socket Quick III', 'Opens 1 socket']);
    const savedRuned = { ...saved, primary: { ...saved.primary, moves: [withRune] } };
    const [back] = draftLines(registry, stats, savedRuned, {
      primary: { ...saved.primary, moves: [{ ...bolt, runes: [null] }] },
    });
    expect(back.notes).toEqual(['Pull Quick III']);
  });
});
