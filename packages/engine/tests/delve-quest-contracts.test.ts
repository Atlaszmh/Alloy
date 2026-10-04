import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { closeDive, extractDive, startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateContract, refillBoard, rerollContract } from '../src/delve/contracts.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Contract } from '../src/types/quests.js';

// See the quests spec's Contract board: seeded generation, only possible
// contracts, the refill after a dive that cleared a depth, one reroll a visit.

const registry = createDefaultRegistry();
const { contracts } = registry.getDelveBalance().quests;
const fresh = (seed = 5) => createDelveProfile(registry, seed, { primary: 'fire' });
const at = (p: DelveProfile, boardCount: number): DelveProfile => ({
  ...p,
  quests: { ...p.quests, board: [null, null, null], boardCount },
});
/** 200 contracts the profile could be offered (an empty board, so every template is open). */
const offers = (p: DelveProfile): Contract[] =>
  Array.from({ length: 200 }, (_, n) => generateContract(registry, at(p, n)));
/** Every contract's goal. */
const goals = (cs: Contract[]) => cs.map((c) => c.objectives[0]);

describe('generateContract', () => {
  it('is seeded: the same profile and count give the same contract, its id contract:<n>', () => {
    const p = fresh();
    expect(generateContract(registry, at(p, 4))).toEqual(generateContract(registry, at(p, 4)));
    expect(generateContract(registry, at(p, 4)).id).toBe('contract:4');
    expect(fresh(5).quests.board).toEqual(fresh(5).quests.board);
    expect(fresh(5).quests.board).not.toEqual(fresh(6).quests.board);
  });

  it('a new save starts with a full board of three templates, fresh progress, its reroll unspent', () => {
    const p = fresh();
    const board = p.quests.board as Contract[];
    expect(board.map((c) => c.id)).toEqual(['contract:0', 'contract:1', 'contract:2']);
    expect(new Set(board.map((c) => c.template)).size).toBe(3);
    expect(board.every((c) => c.progress.length === 1 && c.progress[0].value === 0)).toBe(true);
    expect([p.quests.boardCount, p.quests.rerollUsed]).toEqual([3, false]);
  });

  it('offers a new save only what it can do', () => {
    const p = { ...fresh(), reactionsSeen: [] };
    const cs = offers(p);
    const all = goals(cs);
    // Every template but the reaction one (no pair bound, no reaction seen) and the boss one (no
    // boss within reach: depth 5 lies past the depth window's 0 + 3).
    expect(new Set(cs.map((c) => c.template)).size).toBe(7);
    expect(all.some((o) => o.type === 'reaction')).toBe(false);
    expect(all.some((o) => o.type === 'boss')).toBe(false);
    for (const o of all) {
      if (o.filter?.biome) expect(o.filter.biome).toBe('cinder_mines');
      if (o.filter?.element) expect(o.filter.element).toBe('fire');
      if (o.type === 'extract') expect([2, 3]).toContain(o.filter!.minDepth);
      if (o.type === 'clearFloor') expect(o.filter!.minDepth).toBe(1);
      // The kit holds uncommon flux, no better.
      if (o.type === 'forge') expect(['common', 'uncommon']).toContain(o.filter!.minRarity);
      expect(o.text).not.toMatch(/[{}]/);
    }
  });

  it('offers a deeper hero the biomes it reached, its reactions and its depth window', () => {
    const p: DelveProfile = {
      ...fresh(),
      bestDepth: 12,
      pair: { primary: 'fire', secondary: 'frost' },
      reactionsSeen: ['overload'],
      materials: { ...fresh().materials, flux: { uncommon: 0, magic: 2, rare: 0, epic: 0 } },
    };
    const all = goals(offers(p));
    const values = (f: (o: (typeof all)[number]) => unknown) =>
      [...new Set(all.map(f).filter((v) => v !== undefined))].sort();
    expect(values((o) => o.filter?.biome)).toEqual(['cinder_mines', 'frostvault', 'storm_foundry']);
    expect(values((o) => o.filter?.element)).toEqual(['fire', 'frost', 'storm']);
    expect(values((o) => o.filter?.reaction)).toEqual(['melt', 'overload']);
    expect(values((o) => o.filter?.minRarity)).toEqual(['common', 'magic', 'uncommon']);
    for (const o of all.filter((x) => x.type === 'extract')) {
      expect(o.filter!.minDepth).toBeGreaterThanOrEqual(12 + contracts.depthWindow[0]);
      expect(o.filter!.minDepth).toBeLessThanOrEqual(12 + contracts.depthWindow[1]);
    }
    for (const o of all.filter((x) => x.type === 'clearFloor'))
      expect(o.filter).toEqual({
        noPotion: true,
        minDepth: 12 - contracts.flagDepthBelow,
        minRoomsCleared: 2,
      });
    expect(all.find((o) => o.type === 'reaction')!.text).toMatch(
      /^Trigger (Melt|Overload) \d+ times$/,
    );
  });

  it("offers a biome's boss only once its boss depth is within the depth window's reach", () => {
    const bosses = (bestDepth: number) => [
      ...new Set(
        goals(offers({ ...fresh(), bestDepth }))
          .filter((o) => o.type === 'boss')
          .map((o) => o.filter!.biome),
      ),
    ];
    const reach = contracts.depthWindow[1];
    expect(bosses(4 - reach)).toEqual([]);
    expect(bosses(5 - reach)).toEqual(['cinder_mines']);
    // Depth 11 reaches the Storm Foundry's floors (elites there) but not its boss at 15.
    expect(bosses(11).sort()).toEqual(['cinder_mines', 'frostvault']);
    const elites = goals(offers({ ...fresh(), bestDepth: 11 })).filter((o) => o.type === 'kill');
    expect(elites.some((o) => o.filter?.biome === 'storm_foundry')).toBe(true);
  });

  it("draws counts from the tier's range (kills and reactions grown with the best depth) and scales rewards with it", () => {
    const templates = registry.getQuestsData().contractTemplates;
    const grown = new Set<string>();
    for (const bestDepth of [0, 20]) {
      const scale = 1 + contracts.depthScale * bestDepth;
      for (const c of offers({ ...fresh(), bestDepth, reactionsSeen: ['melt'] })) {
        const t = templates.find((x) => x.id === c.template)!;
        const by = 1 + (contracts.countScale[t.type] ?? 0) * bestDepth;
        if (by > 1) grown.add(t.type);
        const [lo, hi] = t.count[c.tier];
        expect(c.objectives[0].count).toBeGreaterThanOrEqual(Math.round(lo * by));
        expect(c.objectives[0].count).toBeLessThanOrEqual(Math.round(hi * by));
        const base = t.rewards[c.tier];
        expect(c.rewards.slice(0, base.length).map((r) => r.count)).toEqual(
          base.map((r) => Math.max(1, Math.round(r.count * scale))),
        );
        // Only a hard contract may add an essence.
        const extra = c.rewards.slice(base.length);
        expect(extra).toEqual(
          c.tier === 'hard' && extra.length ? [{ kind: 'essence', id: 'fit', count: 1 }] : [],
        );
      }
    }
    expect([...grown].sort()).toEqual(['kill', 'reaction']);
  });

  it("a new save's kill goals take one or two dives (about 20 foes and 1 elite a floor)", () => {
    for (const c of offers(fresh())) {
      const o = c.objectives[0];
      if (o.type !== 'kill') continue;
      expect(o.count).toBeLessThanOrEqual(o.filter?.kind === 'elite' ? 6 : 40);
    }
  });

  it('rolls the hard essence at generation, at its chance, from a best depth of 20', () => {
    const hard = (bestDepth: number) =>
      offers({ ...fresh(), bestDepth }).filter((c) => c.tier === 'hard');
    const share = (cs: Contract[]) =>
      cs.filter((c) => c.rewards.some((r) => r.kind === 'essence')).length / cs.length;
    const deep = hard(registry.getDelveBalance().drops.essenceMinDepth);
    expect(deep.length).toBeGreaterThan(20);
    expect(share(deep)).toBeGreaterThan(0);
    expect(share(deep)).toBeLessThan(0.4);
    expect(share(hard(registry.getDelveBalance().drops.essenceMinDepth - 1))).toBe(0);
  });
});

describe("a contract's text", () => {
  it('shows the count of every counted goal, singular or plural, and a rarity by its name', () => {
    const p: DelveProfile = {
      ...fresh(),
      bestDepth: 8,
      materials: { ...fresh().materials, flux: { uncommon: 1, magic: 1, rare: 0, epic: 0 } },
    };
    const cs = offers(p);
    const names = registry.getQuestsData().rarityNames;
    expect(names.common).toBe('Common');
    const of = (template: string) => cs.filter((c) => c.template === template);
    expect(of('fine_work').length).toBeGreaterThan(0);
    for (const c of of('fine_work')) {
      const o = c.objectives[0];
      const item = o.count === 1 ? 'item' : 'items';
      expect(o.text).toBe(
        `Forge ${o.count} ${item} of ${names[o.filter!.minRarity!]} rarity or better`,
      );
    }
    expect(of('dry_run').length).toBeGreaterThan(0);
    for (const c of of('dry_run')) {
      const o = c.objectives[0];
      const floors = o.count === 1 ? 'floor' : 'floors';
      expect(o.text).toBe(
        `Clear ${o.count} ${floors} of depth ${o.filter!.minDepth} or deeper, ${o.filter!.minRoomsCleared} rooms or more, without a potion`,
      );
    }
  });
});

describe('refillBoard', () => {
  /** A save at the Anvil with slot 1 claimed and the visit's reroll spent. */
  const spent = (): DelveProfile => {
    const p = fresh();
    const board = p.quests.board.slice();
    board[1] = null;
    return { ...p, quests: { ...p.quests, board, rerollUsed: true } };
  };

  it('fills only the empty slots, moves the count on and gives the reroll back', () => {
    const p = spent();
    const r = refillBoard(registry, p);
    expect(r.quests.board[0]).toBe(p.quests.board[0]);
    expect(r.quests.board[2]).toBe(p.quests.board[2]);
    expect(r.quests.board[1]!.id).toBe('contract:3');
    expect([r.quests.boardCount, r.quests.rerollUsed]).toEqual([4, false]);
  });

  it('runs after a dive that cleared a depth, never after a start-and-abandon', () => {
    const abandoned = closeDive(registry, startDive(registry, spent(), 1));
    expect(abandoned.quests.board[1]).toBeNull();
    expect(abandoned.quests.rerollUsed).toBe(true);
    const p = startDive(registry, spent(), 1);
    const cleared = { ...p, dive: { ...p.dive!, phase: 'choosing' as const, depthsCleared: 1 } };
    const extracted = extractDive(registry, cleared);
    expect(extracted.quests.board[1]!.id).toBe('contract:3');
    expect(extracted.quests.rerollUsed).toBe(false);
    // Settled once: closing the dive refills nothing more.
    expect(closeDive(registry, extracted).quests.boardCount).toBe(4);
  });
});

describe('rerollContract', () => {
  it("replaces one slot's contract for its price, once a visit; its id leaves tracked and seen", () => {
    const p0 = fresh();
    const old = p0.quests.board[0]!;
    const p = {
      ...p0,
      scrap: 100,
      quests: { ...p0.quests, tracked: [old.id, 'first_steps'], seen: [old.id] },
    };
    const r = rerollContract(registry, p, 0);
    expect(r.ok).toBe(true);
    const q = r.profile.quests;
    expect(q.board[0]!.id).toBe('contract:3');
    expect(q.board[0]!.template).not.toBe(old.template);
    expect(q.board.slice(1)).toEqual(p.quests.board.slice(1));
    expect([q.boardCount, q.rerollUsed, q.tracked, q.seen]).toEqual([4, true, ['first_steps'], []]);
    expect(r.profile.scrap).toBe(100 - contracts.rerollScrap);
    expect(rerollContract(registry, r.profile, 1)).toMatchObject({ ok: false, profile: r.profile });
  });

  it('refuses mid-dive, an empty slot, a completed contract, a spent reroll and too little scrap', () => {
    const p = { ...fresh(), scrap: 100 };
    const refused = (q: DelveProfile, slot = 0) => {
      const r = rerollContract(registry, q, slot);
      expect(r.ok).toBe(false);
      expect(r.profile).toBe(q);
      return r.reason;
    };
    expect(refused(startDive(registry, p, 1))).toBe('Finish or leave the dive first');
    const board = p.quests.board.slice();
    board[2] = null;
    expect(refused({ ...p, quests: { ...p.quests, board } }, 2)).toBe('No contract to reroll');
    const complete = board.map(
      (c) => c && { ...c, progress: [{ value: c.objectives[0].count, done: true }] },
    );
    expect(refused({ ...p, quests: { ...p.quests, board: complete } })).toBe('Claim it first');
    expect(refused({ ...p, quests: { ...p.quests, rerollUsed: true } })).toBe(
      'One reroll a visit: clear a depth to reroll again',
    );
    expect(refused({ ...p, scrap: contracts.rerollScrap - 1 })).toBe('Not enough scrap');
  });
});
