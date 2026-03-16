/**
 * Seeded RNG using xoshiro128** algorithm.
 * Provides deterministic pseudo-random number generation for all engine systems.
 */
export class SeededRNG {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    // Use splitmix32 to initialize the four state words from a single seed
    seed = seed | 0;
    this.s0 = splitmix32(seed);
    this.s1 = splitmix32(this.s0);
    this.s2 = splitmix32(this.s1);
    this.s3 = splitmix32(this.s2);
  }

  /**
   * Returns a float in [0, 1).
   */
  next(): number {
    const result = this.xoshiro128ss();
    return (result >>> 0) / 0x100000000;
  }

  /**
   * Returns an integer in [min, max] (inclusive).
   */
  nextInt(min: number, max: number): number {
    min = Math.floor(min);
    max = Math.floor(max);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /**
   * Returns true with the given probability (0-1).
   */
  nextBool(chance: number): boolean {
    if (chance <= 0) return false;
    if (chance >= 1) return true;
    return this.next() < chance;
  }

  /**
   * Create a deterministic child RNG seeded from the parent state + label hash.
   * The parent's state is NOT advanced, so forking does not affect the parent sequence.
   */
  fork(label: string): SeededRNG {
    const labelHash = hashString(label);
    // Combine current state with label hash to produce a deterministic child seed
    const childSeed = (this.s0 ^ labelHash) | 0;
    return new SeededRNG(childSeed);
  }

  /**
   * Returns a single number representing the current state, for serialization.
   * This is a hash/compression of the four internal state words.
   */
  getState(): number {
    // Combine the 4 state words into a single 32-bit value
    return ((this.s0 ^ this.s1 ^ this.s2 ^ this.s3) >>> 0);
  }

  /**
   * Core xoshiro128** generator. Returns a raw 32-bit integer.
   */
  private xoshiro128ss(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9);

    const t = this.s1 << 9;

    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;

    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);

    return result;
  }
}

/**
 * 32-bit left rotation.
 */
function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/**
 * splitmix32 — used to expand a single seed into multiple state words.
 */
function splitmix32(state: number): number {
  state = (state + 0x9e3779b9) | 0;
  let z = state;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) | 0;
}

/**
 * Simple string hash (djb2 variant).
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}
