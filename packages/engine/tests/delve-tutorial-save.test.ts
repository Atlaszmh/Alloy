import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import type { DelveProfile, TutorialEntry } from '../src/types/delve.js';

// See the tutorial spec: save v11 (`DelveProfile.tutorial`, `DiveState.tutorialEntry`, a
// stop's `required`); no migration.

const registry = createDefaultRegistry();
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
const diving = () => startDive(registry, createDelveProfile(registry, 4, { primary: 'fire' }), 1);
/** `p` (diving) on a tutorial step, holding its depth's entry and a required stop. */
function guided(p: DelveProfile): DelveProfile {
  const { tutorialEntry: _e, ...dive } = p.dive!;
  const entry: TutorialEntry = { ...p, dive };
  return {
    ...p,
    tutorial: { step: 'walk', count: 1, misses: 2 },
    dive: {
      ...p.dive!,
      tutorialEntry: entry,
      stop: { kind: 'powerups', offers: ['equip'], taken: false, required: true },
    },
  };
}

describe('save v11', () => {
  it('a new save has no tutorial; a dive starts with no entry', () => {
    const p = diving();
    expect(p.version).toBe(14);
    expect(p.tutorial).toBeNull();
    expect(p.dive!.tutorialEntry).toBeNull();
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
  });

  it('round-trips the tutorial, its depth entry and a required stop', () => {
    const p = guided(diving());
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p });
  });

  it("an entry never nests: its dive's own entry is dropped", () => {
    const p = guided(diving());
    const nested = {
      ...p,
      dive: { ...p.dive!, tutorialEntry: { ...p.dive!.tutorialEntry!, dive: p.dive } },
    };
    const parsed = parseDelveProfile(registry, json(nested)) as { profile: DelveProfile };
    expect(parsed.profile.dive!.tutorialEntry!.dive).not.toHaveProperty('tutorialEntry');
  });

  it('resets a version 10 save; refuses a bad tutorial state or entry', () => {
    const p = guided(diving());
    expect(parseDelveProfile(registry, json({ ...p, version: 10 }))).toEqual({ reset: true });
    const state = (t: object) => json({ ...p, tutorial: { ...p.tutorial, ...t } });
    expect(parseDelveProfile(registry, state({ step: '' }))).toBeNull();
    expect(parseDelveProfile(registry, state({ count: -1 }))).toBeNull();
    const { tutorial: _t, ...noTutorial } = p;
    expect(parseDelveProfile(registry, json(noTutorial))).toBeNull();
    const { scrap: _s, ...badEntry } = p.dive!.tutorialEntry!;
    expect(
      parseDelveProfile(registry, json({ ...p, dive: { ...p.dive!, tutorialEntry: badEntry } })),
    ).toBeNull();
  });
});
