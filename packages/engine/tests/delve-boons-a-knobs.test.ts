import { describe, it, expect } from 'vitest';
import { NEUTRAL, mergeKnobs, resolveAbility } from '../src/arpg/abilities/resolve.js';
import { BoonEffectSchema } from '../src/data/schemas.js';
import { applyBuffs, computeHeroStats } from '../src/delve/hero-stats.js';
import { profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import type { Blow, Move } from '../src/types/ability.js';
import { gear, registry } from './fixtures/arena.js';

// See the boons spec, "2a. Knobs and attunement": a dive boon's knobs reach every basic blow
// (beside its runes, never in its `runes`) and every move (beside the legendaries'), and
// `stackTime` is a new knob, neutral at 0 and additive.

const SWORD = { weapon: gear('fire') };
const ECHO_III = { id: 'echo', tier: 3 as const };
const light = (runes: Blow['runes'] = []): Blow => ({ kind: 'light', element: 'fire', runes });
const bolt = (over: Partial<Move> = {}): Move => ({
  kind: 'medium',
  form: 'bolt',
  elements: ['fire'],
  ...over,
});

describe('the stackTime knob', () => {
  it('is neutral at 0, adds in mergeKnobs and is a knob boons.json may set', () => {
    expect(NEUTRAL.stackTime).toBe(0);
    expect(mergeKnobs({ stackTime: 0.3 }, { power: 2 }, { stackTime: 0.5 }).stackTime).toBeCloseTo(
      0.8,
      12,
    );
    expect(BoonEffectSchema.safeParse({ knobs: { stackTime: 0.3 } }).success).toBe(true);
    expect(BoonEffectSchema.safeParse({ knobs: { stackTime: -0.3 } }).success).toBe(false);
  });
});

describe("a boon's knobs on the basic blows (computeHeroStats)", () => {
  it('none by default: the blows keep NEUTRAL and the stats carry no boon knobs', () => {
    const s = computeHeroStats(SWORD, registry, { basic: [light()] });
    expect(s.boonKnobs).toEqual([]);
    expect(s.weapon.blows[0].knobs).toBe(NEUTRAL);
  });

  it("merges after the blow's runes, keeps them on the stats, and leaves the blow's runes its sockets'", () => {
    const boonKnobs = [{ echo: 0.15 }, { stacksBonus: 1 }];
    const s = computeHeroStats(SWORD, registry, { basic: [light(), light([ECHO_III])], boonKnobs });
    expect(s.boonKnobs).toEqual(boonKnobs);
    const [bare, echoing] = s.weapon.blows;
    expect([bare.knobs.echo, bare.knobs.stacksBonus]).toEqual([0.15, 1]);
    expect(bare.runes).toEqual([]);
    // Echo takes the largest of the runes' and the boons'.
    expect(echoing.knobs.echo).toBe(0.45);
    expect(echoing.runes).toEqual([ECHO_III]);
    expect(
      computeHeroStats(SWORD, registry, { basic: [light()], boonKnobs: [{ echo: 0.6 }] }).weapon
        .blows[0].knobs.echo,
    ).toBe(0.6);
  });

  it('applyBuffs passes them through', () => {
    const s = computeHeroStats(SWORD, registry, { boonKnobs: [{ echo: 0.15 }] });
    expect(applyBuffs(s, [{ boon: 'vigor', tier: 1, effect: { damage: 0.2 } }]).boonKnobs).toEqual([
      { echo: 0.15 },
    ]);
  });

  it('profileStats carries none', () => {
    expect(
      profileStats(registry, createDelveProfile(registry, 1, { primary: 'fire' })).boonKnobs,
    ).toEqual([]);
  });
});

describe("a boon's knobs on the moves (resolveAbility)", () => {
  const bare = computeHeroStats({}, registry);
  const withBoons = (...boonKnobs: object[]) => ({ ...bare, boonKnobs });

  it('none: the move resolves as before', () => {
    expect(resolveAbility(registry, 'primary', bolt(), 'mana', withBoons())).toEqual(
      resolveAbility(registry, 'primary', bolt(), 'mana', bare),
    );
  });

  it("two Swift Hands entries multiply; Echo takes the larger of a rune's and a boon's", () => {
    const swift = resolveAbility(
      registry,
      'primary',
      bolt(),
      'mana',
      withBoons({ quick: { cooldown: 0.92 } }, { quick: { cooldown: 0.88 } }),
    );
    expect(swift.knobs.quick.cooldown).toBeCloseTo(0.92 * 0.88, 12);
    const echoing = bolt({ runes: [ECHO_III] });
    expect(
      resolveAbility(registry, 'primary', echoing, 'mana', withBoons({ echo: 0.4 })).knobs.echo,
    ).toBe(0.45);
    expect(
      resolveAbility(registry, 'primary', echoing, 'mana', withBoons({ echo: 0.6 })).knobs.echo,
    ).toBe(0.6);
    expect(
      resolveAbility(registry, 'primary', bolt(), 'mana', withBoons({ echo: 0.4 })).knobs.echo,
    ).toBe(0.4);
  });

  it("puts nothing in the move's runes", () => {
    const r = resolveAbility(registry, 'primary', bolt(), 'mana', withBoons({ echo: 0.4 }));
    expect(r.runes).toEqual([]);
  });
});
