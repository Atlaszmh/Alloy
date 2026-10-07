import { describe, it, expect } from 'vitest';
import { BOON_FAMILIES, type BoonDef } from '../src/types/boon.js';
import { registry } from './fixtures/arena.js';

// See the boons spec: §1 the row, §3 the first batch.

const SHRINES = ['vigor', 'renewal', 'clarity', 'fortune', 'mercy', 'devotion'];
const atStop = (b: BoonDef) => b.weight.common + b.weight.rare + b.weight.epic > 0;
const row = (id: string) => registry.getBoon(id)!;
const effects = (id: string) => row(id).tiers.map((t) => t.effect);

describe('the first batch of boons', () => {
  it('follows the six shrine rows, 40 stop rows, every one a dive boon and never a shrine', () => {
    const boons = registry.getBoons();
    expect(boons.slice(0, 6).map((b) => b.id)).toEqual(SHRINES);
    const stop = boons.slice(6);
    expect(stop).toHaveLength(40);
    expect(boons.filter(atStop)).toEqual(stop);
    for (const b of stop) {
      expect(b.duration, b.id).toBe('dive');
      expect(b.shrine, b.id).toBeUndefined();
      expect(b.id, b.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      for (const t of b.tiers) expect(t.text.length, b.id).toBeGreaterThan(0);
    }
    const count = Object.fromEntries(
      BOON_FAMILIES.map((f) => [f, stop.filter((b) => b.family === f).length]),
    );
    expect(count).toEqual({
      offense: 6,
      element: 5,
      defense: 7,
      tempo: 5,
      fortune: 7,
      pact: 6,
      floor: 4,
    });
  });

  it('draws by tier: pacts and floor boons rarer than the rest', () => {
    for (const b of registry.getBoons().filter(atStop)) {
      const want =
        b.family === 'pact'
          ? { common: 4, rare: 3, epic: 2 }
          : b.family === 'floor'
            ? { common: 6, rare: 4, epic: 2 }
            : { common: 10, rare: 6, epic: 3 };
      expect(b.weight, b.id).toEqual(want);
    }
  });

  it('caps and depth gates as the spec table says', () => {
    const caps = Object.fromEntries(registry.getBoons().slice(6).map((b) => [b.id, b.cap]));
    expect(caps).toEqual({
      'keen-edge': 3, 'heavy-hand': 2, opener: 2, closer: 2, executioner: 1, 'pack-breaker': 2,
      catalyst: 2, saturate: 1, 'lingering-mark': 2, 'pure-flame': 3, 'second-flame': 3,
      'third-wind': 1, 'perfect-form': 2, bulwark: 2, 'stone-skin': 2, 'deep-breath': 2,
      'vampires-tithe': 2, 'last-stand': 1,
      quickstep: 2, 'swift-hands': 2, 'free-cast': 1, echo: 1, overflow: 2,
      magpie: 2, 'wide-net': 1, prospector: 2, 'flux-nose': 2, 'rune-sense': 2, scrapper: 2,
      insurance: 1,
      'glass-cannon': 2, 'blood-price': 1, hunted: 1, 'no-retreat': 1, famine: 1,
      'deeper-still': 1,
      cartographer: 1, sanctuary: 1, trailblazer: 1, arsonist: 1,
    });
    const gated = registry
      .getBoons()
      .filter((b) => b.minDepth !== undefined)
      .map((b) => [b.id, b.minDepth]);
    expect(Object.fromEntries(gated)).toEqual({
      executioner: 3, saturate: 3, 'second-flame': 2, 'free-cast': 3, echo: 5,
      'glass-cannon': 4, 'blood-price': 6, hunted: 6, 'no-retreat': 4, famine: 4,
      'deeper-still': 4,
    });
  });

  it("holds each tier's numbers in the effect's units", () => {
    expect(effects('keen-edge')).toEqual([{ damage: 0.1 }, { damage: 0.15 }, { damage: 0.25 }]);
    expect(effects('swift-hands')).toEqual([
      { knobs: { quick: { cooldown: 0.92 } } },
      { knobs: { quick: { cooldown: 0.88 } } },
      { knobs: { quick: { cooldown: 0.82 } } },
    ]);
    expect(effects('saturate')).toEqual([
      { knobs: { stacksBonus: 1 } },
      { knobs: { stacksBonus: 1, stackTime: 0.2 } },
      { knobs: { stacksBonus: 2 } },
    ]);
    expect(effects('executioner')).toEqual([
      { lowLife: { below: 0.25, mult: 0.4 } },
      { lowLife: { below: 0.25, mult: 0.6 } },
      { lowLife: { below: 0.35, mult: 0.6 } },
    ]);
    expect(effects('third-wind')).toEqual([
      { dodgeCharges: 1 },
      { dodgeCharges: 1, dodgeRecharge: 0.15 },
      { dodgeCharges: 1, dodgeWindow: 0.3 },
    ]);
    expect(effects('second-flame')[2]).toEqual({ attune: { role: 'secondary', points: 10 } });
    expect(effects('flux-nose')).toEqual([{ flux: 1.3 }, { flux: 1.5 }, { flux: 1.8 }]);
    expect(effects('insurance')).toEqual([
      { deathLoss: 0.1 },
      { deathLoss: 0.15 },
      { deathLoss: 0.2 },
    ]);
    expect(effects('glass-cannon')[0]).toEqual({ damage: 0.25, maxLife: -0.2 });
    expect(effects('blood-price')[2]).toEqual({ bloodPrice: 0.5, damage: 0.4 });
    expect(effects('hunted')[1]).toEqual({ eliteChance: 1, gear: 1.8, scrap: 0.4 });
    expect(effects('no-retreat')[0]).toEqual({ dodgeCharges: -1, perfectAlways: true });
    expect(effects('deeper-still')).toEqual([
      { skip: 1, find: 20 },
      { skip: 2, find: 30 },
      { skip: 2, find: 50 },
    ]);
    expect(effects('cartographer')[0]).toEqual({ exitRevealed: true });
    expect(effects('arsonist')).toEqual([
      { hazardsFriendly: 0.5 },
      { hazardsFriendly: 0.65 },
      { hazardsFriendly: 0.8 },
    ]);
    expect(row('vampires-tithe').name).toBe("Vampire's Tithe");
  });

  it('a gilded or a champion door leans the next stop rarer', () => {
    expect(registry.getDoor('gilded').mods.boons).toBe(0.5);
    expect(registry.getDoor('champions').mods.boons).toBe(0.3);
    expect(registry.getDoor('winding').mods.boons).toBeUndefined();
  });
});
