import { describe, it, expect } from 'vitest';
import { addMaterial, emptyHaul, generateItem, SeededRNG } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import {
  FEED_MAX,
  FEED_MS,
  NOTICE_MS,
  feedAfter,
  feedNotice,
  feedTally,
  feedText,
  type FeedTally,
} from '../gain-feed';

/** A tally of plain counts, each kind named for itself. */
const tally = (counts: Record<string, number>): FeedTally =>
  new Map(Object.entries(counts).map(([k, count]) => [k, { name: k, color: '#fff', count }]));

describe('the gain feed', () => {
  it('a gain is a line; more of the same kind grows it ("+159 scrap") and holds it FEED_MS from the last', () => {
    let lines = feedAfter([], tally({}), tally({ scrap: 12 }), 0);
    expect(lines.map(feedText)).toEqual(['+12 scrap']);
    lines = feedAfter(lines, tally({ scrap: 12 }), tally({ scrap: 159 }), 1000);
    expect(lines.map(feedText)).toEqual(['+159 scrap']);
    expect(lines[0].until).toBe(1000 + FEED_MS);
  });

  it("a line goes FEED_MS after its last gain; the kind's next gain starts a new line", () => {
    const lines = feedAfter([], tally({}), tally({ scrap: 12 }), 0);
    const later = feedAfter(lines, tally({ scrap: 12 }), tally({ scrap: 20 }), FEED_MS);
    expect(later.map(feedText)).toEqual(['+8 scrap']);
    expect(feedAfter(lines, tally({ scrap: 12 }), tally({ scrap: 12 }), FEED_MS)).toEqual([]);
  });

  it("a loss (a death's share, a stop's spend) or a kind gone is no line", () => {
    expect(feedAfter([], tally({ scrap: 50, iron: 2 }), tally({ scrap: 20 }), 0)).toEqual([]);
  });

  it('each kind its own line, newest last; FEED_MAX at most, the oldest giving way', () => {
    let lines = feedAfter([], tally({}), tally({ a: 1, b: 1, c: 1 }), 0);
    lines = feedAfter(lines, tally({ a: 1, b: 1, c: 1 }), tally({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 }), 10);
    expect(lines).toHaveLength(FEED_MAX);
    expect(lines.map((l) => l.name)).toEqual(['b', 'c', 'd', 'e', 'f']);
    // A merge keeps the line where it is.
    lines = feedAfter(lines, tally({ b: 1 }), tally({ b: 3 }), 20);
    expect(lines.map(feedText)).toEqual(['+3 b', '+1 c', '+1 d', '+1 e', '+1 f']);
  });

  it('a notice is a plain line of its own, never merged, for NOTICE_MS', () => {
    let lines = feedNotice([], 'Quest complete: First Steps · claim at the Anvil', 0);
    lines = feedNotice(lines, 'Quest complete: First Steps · claim at the Anvil', 5);
    expect(lines.map(feedText)).toEqual([
      'Quest complete: First Steps · claim at the Anvil',
      'Quest complete: First Steps · claim at the Anvil',
    ]);
    expect(new Set(lines.map((l) => l.key)).size).toBe(2);
    expect(lines[0].until).toBe(NOTICE_MS);
  });

  it("tallies the dive's haul as the purse names it, and each item found by its uid, plainly", () => {
    const registry = getDelveRegistry();
    const haul = addMaterial({ ...emptyHaul(), scrap: 5 }, { kind: 'metal', metal: 'iron' }, 3);
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
      new SeededRNG(4),
    );
    const t = feedTally(registry, haul, [helm]);
    const lines = feedAfter([], new Map(), t, 0);
    expect(lines.map(feedText)).toEqual(['+3 Iron bar', '+5 Scrap', helm.name]);
    expect(lines.at(-1)!.key).toBe('item:h1');
  });
});
