import { describe, it, expect } from 'vitest';
import {
  createDelveProfile,
  movesetOf,
  profileStats,
  type Chains,
  type Construct,
  type Move,
} from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { armed } from '../../../__tests__/armed';
import { draftLines } from '../draft-lines';
import { stamped } from './harness';

const registry = getDelveRegistry();
const profile = stamped(armed(createDelveProfile(registry, 1234, { primary: 'fire' })));
const stats = profileStats(registry, profile);
// The weapon's own chains, every construct with its uid (the uid diff's saved side).
const saved = movesetOf(registry, profile.equipped.weapon!).chains as Chains;
const [first, second] = saved.primary.moves;
const name = (m: Move) => `${m.kind} Fire ${registry.getForm(m.form).name}`;

describe('draftLines', () => {
  it("one line a changed skill, in the chains' order: its chain before and after, a changed construct noted", () => {
    const heavy: Move = { ...first, kind: 'heavy' };
    const lines = draftLines(registry, stats, saved, {
      primary: { ...saved.primary, moves: [heavy, second] },
      basic: saved.basic.map((b, i) => (i === 0 ? { ...b, kind: 'medium' as const } : b)),
    });
    expect(lines.map((l) => l.skill)).toEqual(['basic', 'primary']);
    expect(lines[1].before).toMatch(new RegExp(`^${name(first)} · `));
    expect(lines[1].after).toMatch(new RegExp(`^${name(heavy)} · `));
    expect(lines[1].notes).toEqual([`Changed: ${name(first)} → ${name(heavy)}`]);
    expect(lines[1].free).toEqual([]);
    expect(lines[0].notes).toEqual(['Changed: light Fire blow → medium Fire blow']);
  });

  it('notes a payment change, the sockets opened, the runes socketed and pulled, and a new construct', () => {
    const withRune: Move = { ...first, runes: [{ id: 'quick', tier: 3 }] };
    const fresh: Move = { kind: 'light', form: 'lance', elements: ['fire'] }; // no uid: new
    const [line] = draftLines(registry, stats, saved, {
      primary: { moves: [withRune, fresh], payment: 'charge' },
    });
    expect(line.notes).toEqual([
      'Pays with charge (was mana)',
      'Socket Quick III',
      'Opens 1 socket',
      'New: light Fire Lance',
    ]);
    const savedRuned = { ...saved, primary: { ...saved.primary, moves: [withRune, second] } };
    const [back] = draftLines(registry, stats, savedRuned, {
      primary: { ...saved.primary, moves: [{ ...first, runes: [null] }, second] },
    });
    expect(back.notes).toEqual(['Pull Quick III']);
  });

  it('the free moves apart: to the bag, from the bag, and a reorder', () => {
    const spare: Construct = { uid: 'spare', kind: 'hold', form: 'burst', elements: ['fire'] };
    const [line] = draftLines(
      registry,
      stats,
      saved,
      { primary: { ...saved.primary, moves: [spare, first] } },
      [second],
      [spare],
    );
    expect(line.free).toEqual([`To the bag: ${name(second)}`, 'From the bag: held Fire Burst']);
    expect(line.notes).toEqual([]);
    const [swapped] = draftLines(registry, stats, saved, {
      primary: { ...saved.primary, moves: [second, first] },
    });
    expect(swapped.free).toEqual(['Reordered']);
    expect(swapped.notes).toEqual([]);
  });
});
