import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import { learnWeaponPatterns, skipTutorial, startTutorial } from '../src/delve/tutorial.js';
import { questStates } from '../src/delve/quests.js';

// A weapon is the hero's identity: every weapon's pattern is known outside the guided start.

const registry = createDefaultRegistry();
const WEAPONS = registry.getGearBasesForSlot('weapon').map((b) => b.id);
const KIT = registry.getCraftingData().startingPatterns;
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('weapon patterns', () => {
  it('a Jump in save knows every weapon from the start', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    for (const id of WEAPONS) expect(p.patterns).toContain(id);
  });

  it('the guided start keeps to the kit, and its skip opens every weapon', () => {
    const guided = startTutorial(registry, createDelveProfile(registry, 7));
    expect(guided.patterns).toEqual(KIT);
    const skipped = skipTutorial(registry, guided);
    for (const id of WEAPONS) expect(skipped.patterns).toContain(id);
    expect(skipped.patterns.slice(0, KIT.length)).toEqual(KIT);
  });

  it('a save without them learns them at load, a guided one not', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    const old = parseDelveProfile(registry, json({ ...p, patterns: [...KIT] }));
    expect(old && 'profile' in old && old.profile.patterns.sort()).toEqual([...new Set([...KIT, ...WEAPONS])].sort());
    const guided = startTutorial(registry, createDelveProfile(registry, 7));
    const kept = parseDelveProfile(registry, json(guided));
    expect(kept && 'profile' in kept && kept.profile.patterns).toEqual(KIT);
  });

  it('is idempotent, and the Collector still asks for more than the weapons', () => {
    const p = createDelveProfile(registry, 7, { primary: 'fire' });
    expect(learnWeaponPatterns(registry, p)).toBe(p);
    const collector = registry.getQuestsData().quests.find((q) => q.id === 'collector')!;
    expect(collector.objectives[0].count).toBeGreaterThan(p.patterns.length);
    expect(questStates(registry, p).find((q) => q.id === 'collector')?.status ?? 'locked').not.toBe('complete');
  });
});
