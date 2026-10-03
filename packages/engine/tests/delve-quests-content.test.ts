import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { questsDataProblems } from '../src/data/quests-check.js';
import { QuestsDataSchema } from '../src/data/schemas.js';
import questsData from '../src/data/quests.json';

// See the quests spec's Content: main chapter 1, the side quests and the
// contract templates, each with a line from Hesta.

const registry = createDefaultRegistry();
const { quests, contractTemplates } = registry.getQuestsData();

describe("quests.json's content", () => {
  it('passes the schema and the registry checks', () => {
    expect(QuestsDataSchema.safeParse(questsData).success).toBe(true);
    expect(questsDataProblems(registry)).toEqual([]);
  });

  it('holds chapter 1, "Embers of the Anvil", as one chain of six', () => {
    const mains = quests.filter((q) => q.kind === 'main');
    expect(mains.map((q) => q.name)).toEqual([
      'First Steps',
      'Bring It Home',
      'Strike the Anvil',
      'A Second Flame',
      'Spark and Counterspark',
      'The Cinder Warden',
    ]);
    mains.forEach((q, i) => {
      expect(q.chapter).toBe('Embers of the Anvil');
      expect(q.unlock).toEqual(i === 0 ? undefined : { after: mains[i - 1].id });
    });
  });

  it('holds the eight side quests with their unlocks', () => {
    const id = (name: string) => quests.find((q) => q.name === name)!.id;
    const sides = quests.filter((q) => q.kind === 'side');
    expect(Object.fromEntries(sides.map((q) => [q.name, q.unlock]))).toEqual({
      'Deep Diver': { after: id('Bring It Home') },
      'Perfect Form': { after: id('Bring It Home') },
      Smelter: { after: id('Strike the Anvil') },
      Collector: { after: id('Strike the Anvil') },
      'Fully Socketed': { after: id('A Second Flame') },
      Elementalist: { after: id('Spark and Counterspark') },
      Untouchable: { bestDepth: 6 },
      'Iron Will': { bestDepth: 10 },
    });
  });

  it('holds the nine contract templates, one per kind of goal', () => {
    expect(contractTemplates.map((t) => [t.type, t.filter ?? {}])).toEqual([
      ['kill', { kind: 'elite', biome: 'reached' }],
      ['kill', { element: 'reached' }],
      ['reaction', { reaction: 'known' }],
      ['perfectDodge', {}],
      ['extract', { minDepth: 'window' }],
      ['clearFloor', { noPotion: true, minDepth: 'flag', minRoomsCleared: 2 }],
      ['boss', { biome: 'reached' }],
      ['forge', { minRarity: 'owned' }],
      ['refine', {}],
    ]);
  });

  it("gives every quest and template Hesta's line: one or two short sentences, no emoji", () => {
    for (const { id, line } of [...quests, ...contractTemplates]) {
      expect(line.split(/[.!?](\s|$)/).filter((s) => s.trim()).length, id).toBeLessThanOrEqual(2);
      expect(line.length, id).toBeLessThanOrEqual(110);
      expect(line, id).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
