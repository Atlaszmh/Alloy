import { SeededRNG } from '../src/rng/seeded-rng.js';

describe('SeededRNG', () => {
  it('determinism: same seed produces same sequence', () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);

    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it('fork isolation: forked RNG does not affect parent sequence', () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);

    // Advance both once
    a.next();
    b.next();

    // Fork from a and consume several values from the fork
    const forked = a.fork('subsystem');
    forked.next();
    forked.next();
    forked.next();

    // Parent sequences should still be identical after the fork
    const restA = Array.from({ length: 50 }, () => a.next());
    const restB = Array.from({ length: 50 }, () => b.next());

    expect(restA).toEqual(restB);
  });

  it('fork determinism: same fork label produces same sub-sequence', () => {
    const a = new SeededRNG(99);
    const b = new SeededRNG(99);

    const forkA = a.fork('loot');
    const forkB = b.fork('loot');

    const seqA = Array.from({ length: 100 }, () => forkA.next());
    const seqB = Array.from({ length: 100 }, () => forkB.next());

    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = new SeededRNG(1);
    const b = new SeededRNG(2);

    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());

    // It is theoretically possible for them to collide, but astronomically unlikely
    expect(seqA).not.toEqual(seqB);
  });

  it('distribution: next() produces values roughly uniformly distributed', () => {
    const rng = new SeededRNG(12345);
    const buckets = 10;
    const counts = new Array(buckets).fill(0);
    const n = 10_000;

    for (let i = 0; i < n; i++) {
      const v = rng.next();
      const bucket = Math.min(Math.floor(v * buckets), buckets - 1);
      counts[bucket]++;
    }

    const expected = n / buckets;
    for (let i = 0; i < buckets; i++) {
      // Each bucket should be within 20% of the expected count
      expect(counts[i]).toBeGreaterThan(expected * 0.8);
      expect(counts[i]).toBeLessThan(expected * 1.2);
    }
  });

  it('nextInt stays within bounds', () => {
    const rng = new SeededRNG(777);

    for (let i = 0; i < 1000; i++) {
      const val = rng.nextInt(3, 7);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(7);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('nextBool(0) always returns false, nextBool(1) always returns true', () => {
    const rng = new SeededRNG(555);

    for (let i = 0; i < 100; i++) {
      expect(rng.nextBool(0)).toBe(false);
      expect(rng.nextBool(1)).toBe(true);
    }
  });
});
