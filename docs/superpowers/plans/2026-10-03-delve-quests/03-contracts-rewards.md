# Delve quests · B2: contracts, rewards and the content — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill Phase A's B2 stubs and write the content: `resolveReward` makes each reward concrete (the rule rewards `metal: 'depth'`, a shard by family and tier, `essence: 'fit'`, `pattern: 'unknown'` with its fallback) on the claim's stream and adds it to the stockpile; the Contract board's `generateContract`, `refillBoard` and `rerollContract` offer only contracts the hero can do, seeded on `contract:<boardCount>`; and `quests.json` holds main chapter 1 "Embers of the Anvil" (6 quests), the 8 side quests and the 9 contract templates, each with a line from Hesta.

**Architecture:** Three files, each B2's alone. `delve/rewards.ts`: `resolveReward` turns a `Reward` into a `RewardRef` (one draw on the claim's stream for a rule) and grants it through `stockHaul` (a pattern is learned, an essence seen too). `delve/contracts.ts`: `possible` lists what a contract may name for this hero (the biomes of depths 1 to max(1, bestDepth) and their mana, the pair's reaction and the reactions seen, the depth window, the flag floors' depth, common up to the best flux grade owned), `generateContract` draws a template (one not already on the board while another can be offered), a tier, the filter, the count and the hard tier's essence on `contract:<boardCount>`, scales the rewards by `1 + depthScale × bestDepth` and fills the template's `{count}`, `{biome}`, `{element}`, `{reaction}`, `{depth}`, `{rarity}` from the data's names; `refillBoard` fills the empty slots and gives the visit's reroll back; `rerollContract` replaces one slot once a visit. `src/data/quests.json` holds the content. Phase A's two call sites (`createDelveProfile`, `settleDive`) turn on by themselves once the templates exist (their guard is `contractTemplates.length > 0`); no other file changes.

**Tech Stack:** TypeScript 5.7, Zod 3 (Phase A's schemas, unchanged), Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-03-delve-quests-design.md` (authoritative): "The quest model" → Rewards, "The Contract board", "Content (the first pass)", "Phases and parallel areas" (the B2 row), "Tests" → Claims and The board. Phase A: `01-contract.md` in this folder ("For the areas" → B2). The overview is `00-overview.md`.

---

## Base

- **Starts from:** `quest/main` at `7bc2d20` (Phase A merged), in this area's worktree `C:/Projects/alloy-quest-b2` on branch `quest/b2`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-quest-b2 -Branch quest/b2 -Base quest/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-quest-b2` in Git Bash.
- **Before Task 1:** build the engine once for the client's junction, and measure both suites:

```bash
cd /c/Projects/alloy-quest-b2
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; the engine suite **1787 passed | 5 skipped** tests in **98 passed | 1 skipped** files (the pacing rails included); the client suite **1224 tests in 152 files**. Call them **N** engine tests in **F** files and **M** client tests in **G** files.
- **Runs beside B1.** B1 owns `delve/quests.ts` and every emission site; this plan edits none of them. Nothing here needs B1: `claimQuest` (B1) reaches `resolveReward` through Phase A's `grantRewards`, and Phase A's wired calls reach `refillBoard`.

## Files

| File | Change |
|---|---|
| `packages/engine/src/delve/rewards.ts` | **Overwritten:** `resolveReward` (Phase A's stub); a private `grant` |
| `packages/engine/src/delve/contracts.ts` | **Overwritten:** `generateContract`, `refillBoard`, `rerollContract` (Phase A's stubs); the private `possible`, `offered`, `place` |
| `packages/engine/src/data/quests.json` | **Overwritten** (Task 2): chapter 1's six main quests and the eight side quests; Task 3 adds the nine contract templates |
| `packages/engine/tests/delve-quest-rewards.test.ts` (new) | every reward kind, the rules, the fallback, determinism, the claim's stream |
| `packages/engine/tests/delve-quests-content.test.ts` (new) | the content: the schema and the registry checks, the main chain, the side quests' unlocks, the templates, Hesta's lines |
| `packages/engine/tests/delve-quest-contracts.test.ts` (new) | seeded generation, only possible contracts (a new save and a deeper hero), counts and reward scaling, the hard essence, the refill rule (start-and-abandon included), the reroll's rules |

Not edited: `types/quests.ts` and `schemas.ts` (Phase A's `ContractFilterRules` and `ContractTemplateSchema` already take every filter the nine templates need), `delve/profile.ts` and `delve/dive.ts` (Phase A's guards stay; see below), `delve/quests.ts` (B1's).

## Cross-area needs

None blocking. For the integrator and the later areas:

1. **B1 (`delve/quests.ts`).** A contract's one objective has id `'goal'` and a concrete `ObjectiveFilter` (`biome`, `element`, `reaction` (a reaction id, never `pair`), `minDepth`, `minRarity`, `kind`, `noPotion`), so `applyQuestEvents` matches it as any quest objective. A claimed contract's rewards go through `grantRewards` with its id, so they draw on `quest:contract:<n>:<claimCount>`. B1's tests run on fixture quests: with this plan's content a default-registry save unlocks `first_steps` at creation and starts with a full board, which B1's fixtures don't see.
2. **C1 (the Quests tab).** The engine fills a contract's objective text (`"Slay 5 elites in Cinder Mines"`, `"Trigger Melt 12 times"`, `"Extract from depth 4 or deeper"`, `"Forge items of uncommon rarity or better"`); a contract carries its `tier` (easy / normal / hard) for a tag. `rerollContract`'s refusals read: "Reroll at the Anvil, between dives", "No contract to reroll", "One reroll a visit: clear a depth to reroll again", "Not enough scrap" (player-facing, shown as they read); `rerollContract` is pure, so the tab may call it as a dry run to enable Reroll (an allowed one generates one contract: a few table lookups, and the hero's stats only for a hard tier); a reroll never gives back the template it replaced while another is possible. Rule rewards C1 names until claimed: `metal` `'depth'`, `shard` with `family` and `tier`, `essence` `'fit'`, `pattern` `'unknown'` (with `fallback`).
3. **Phase D.** The reward numbers below are first-pass (see "Where the spec left room", 9); the main quests' names "First Steps" and "Bring It Home" are the E2E's anchors and stay; the autopilot's claiming and `economySim`'s `quests` line may move them. Phase A's guards in `profile.ts` and `dive.ts` stay: `refillBoard` needs a template to draw from.

## Where the spec left room

1. **S2, checked.** Phase A's `settleDive` refills when `dive.depthsCleared > 0` (with templates), so a start-and-abandon (`closeDive` settling an untouched dive) refills nothing, and a settled dive returns early, so `closeDive` after an extract or a death never refills twice. "After the dive's events apply" is B1's half: `extractDive` applies its `extract` before calling `settleDive`, and `failFloor` banks (applying the pending events) first. Task 3's test covers the refill and the start-and-abandon.
2. **Contract text.** A contract must carry its objective's text, and the spec keeps all text in JSON, so a template's `text` holds placeholders the generator fills from the data's names: `{count}`, `{biome}` (the biome's `name`), `{element}` (`arpg.json → mana[el].name`), `{reaction}` (the reaction's `name`), `{depth}` (the filter's `minDepth`), `{rarity}` (the rarity id, lower case: "uncommon"). No other formatting happens in the engine.
3. **One template once on the board.** `generateContract` passes over a template already on the board while another can be offered, so a board shows three kinds of goal and a reroll brings a different one. The spec doesn't ask for it; a board of three Smelting Orders would read as a bug.
4. **The reaction rule names a reaction.** `reaction: 'known'` becomes one concrete reaction id, drawn from the pair's reaction (when a secondary is bound) and `reactionsSeen`; with neither, the template isn't offered (a new save never sees it).
5. **The forge rule.** `minRarity: 'owned'` draws uniformly from common up to the best flux grade with a count above 0 (common when none). Epic is the top: a legendary needs an essence too, which the main chapter's last quest asks for on its own.
6. **Scaling.** Every reward count of the tier's table, a fallback's too, is `max(1, round(count × (1 + depthScale × bestDepth)))`; the hard essence is one, unscaled. Lucky Charm's boost is read as `dive.ts` reads it for the floors (`profileStats(…).legendaries.lucky_charm ? 2 : 1`).
7. **Counts.** The extract and boss templates have a count of 1 at every tier (the tiers differ in rewards); "clear a floor without a potion" takes `noPotion` only (`noDamage` is Untouchable's), its `minDepth` the flag depth, counts 1 / 2–3 / 4–5.
8. **Rule rewards.** A shard's affix is drawn by the affixes' `weight` among its family (as drops weigh them), its tier clamped to the affix's tiers (an `*Attune` shard tops out at II); `essence: 'fit'` draws uniformly among legendaries whose slots meet a known pattern's slot (all legendaries if none, as the first boss's essence does) and marks it seen; a `pattern` reward teaches one pattern whatever its count; `pattern: 'unknown'` with every pattern known resolves its `fallback` on the same stream.
9. **The numbers** (first pass, against v0.58.0's economy: kill scrap 9 / 27 / 90, forge scrap 10–240, refine 3 + 10–25 scrap, Mana Dust edits 5–15, slot Links 1–4, a new save's 5 Rusty bars and 5 uncommon flux): main quests give a step of the next thing the chapter asks for (bars, then uncommon flux to forge, shards to forge better, Dust and Links to edit, magic then epic flux); side quests a little more, Untouchable an essence; contracts 30–160 scrap plus one material by tier (easy: bars, Dust or a tier-I shard; normal: uncommon flux or a tier-II shard; hard: magic or rare flux, a tier-III shard), before the depth scale (×2 at depth 20).

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `quest/b2`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-quest-b2`.
- **Line endings:** `contracts.ts` and `rewards.ts` are CRLF in the worktree (`core.autocrlf`), `quests.json` LF; an overwrite with the Write tool writes LF, which git stores the same (no diff noise). New files are LF.
- **Prettier:** every file this plan writes passes `npx prettier --check` (the code below is already formatted; checked on the scratch copy), so the commit blocks' `--write` changes nothing if typed as written. `balance.json`, `dive.ts`, `profile.ts` and `delve-pacing.test.ts` aren't touched.
- **How the edits read** (the earlier plans' language): "Create `f`:" is a Write of a new file; "Overwrite `f`:" a Write over an existing one (its whole new content follows). "Replace: A with: B" is one Edit (old A, new B), its anchor unique in its file.
- **Import cycles:** `contracts.ts` imports `dive.ts` (`isDiveActive`), `pair.ts` (`profileStats`) and `profile.ts` (a type), all of which import each other: it reads them only inside functions, as the rest of `delve/` does.
- **Every engine task runs the whole engine suite** (about 80 s; the pacing rails run while the files load) and the engine typecheck. The client reads the engine's bundle, which only the Verification rebuilds.
- **Checked on a scratch copy:** `git archive` of `quest/main` at `7bc2d20` with junctioned `node_modules`; every edit below applied by a script that checks each anchor, giving the trees every FAIL, PASS, suite and typecheck below ran on.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine bundle (the client's) | `(cd packages/engine && npx tsup)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |

---

## Chunk 1: Rewards and the content

### Task 1: `resolveReward`

Every reward kind made concrete and added to the stockpile; a rule drawn on the claim's stream.

**Files:**
- Create: `packages/engine/tests/delve-quest-rewards.test.ts`
- Overwrite: `packages/engine/src/delve/rewards.ts`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-quest-rewards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { grantRewards } from '../src/delve/quests.js';
import { resolveReward } from '../src/delve/rewards.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Reward } from '../src/types/quests.js';

// See the quests spec's Rewards: concrete and rule rewards, resolved on the
// claim's stream, straight to the stockpile.

const registry = createDefaultRegistry();
const fresh = () => createDelveProfile(registry, 11, { primary: 'fire' });
const resolve = (p: DelveProfile, r: Reward, label = 'x') =>
  resolveReward(registry, p, r, new SeededRNG(p.seed).fork(label));

describe('resolveReward', () => {
  it('adds scrap, Mana Dust, Links, a metal and a flux to the stockpile', () => {
    const p = fresh();
    const cases: [Reward, (q: DelveProfile) => number][] = [
      [{ kind: 'scrap', count: 40 }, (q) => q.scrap],
      [{ kind: 'dust', count: 7 }, (q) => q.manaDust],
      [{ kind: 'links', count: 2 }, (q) => q.links],
      [{ kind: 'metal', id: 'steel', count: 3 }, (q) => q.materials.metals.steel],
      [{ kind: 'flux', grade: 'rare', count: 1 }, (q) => q.materials.flux.rare],
    ];
    for (const [reward, read] of cases) {
      const r = resolve(p, reward);
      expect(read(r.profile) - read(p), reward.kind).toBe(reward.count);
      expect(r.granted.count).toBe(reward.count);
    }
    expect(resolve(p, { kind: 'scrap', count: 40 }).granted.ref).toEqual({ kind: 'scrap' });
  });

  it("gives the metal of the hero's best depth for 'depth'", () => {
    const at = (bestDepth: number) =>
      resolve({ ...fresh(), bestDepth }, { kind: 'metal', id: 'depth', count: 2 }).granted.ref;
    expect(at(0)).toEqual({ kind: 'metal', metal: 'rusty' });
    expect(at(7)).toEqual({ kind: 'metal', metal: 'iron' });
    expect(at(12)).toEqual({ kind: 'metal', metal: 'steel' });
  });

  it("gives a shard of the family at the tier, clamped to the affix's tiers", () => {
    const { families } = registry.getCraftingData();
    for (let i = 0; i < 40; i++) {
      const p = fresh();
      const r = resolve(p, { kind: 'shard', family: 'element', tier: 3, count: 1 }, `s${i}`);
      const ref = r.granted.ref as { kind: 'shard'; stat: string; tier: number };
      expect(families[ref.stat as keyof typeof families]).toBe('element');
      expect(ref.tier).toBe(ref.stat.endsWith('Attune') ? 2 : 3);
      expect(r.profile.materials.shards[ref.stat as 'damage']![ref.tier - 1]).toBe(1);
    }
  });

  it("gives an essence that fits a learned pattern for 'fit', seen at once", () => {
    const { bases, legendaries } = registry.getDelveData();
    const p = { ...fresh(), patterns: ['ring'] };
    for (let i = 0; i < 20; i++) {
      const r = resolve(p, { kind: 'essence', id: 'fit', count: 1 }, `e${i}`);
      const { essence } = r.granted.ref as { kind: 'essence'; essence: string };
      const def = legendaries.find((l) => l.id === essence)!;
      expect(def.slots).toContain(bases.find((b) => b.id === 'ring')!.slot);
      expect(r.profile.materials.essences[essence]).toBe(1);
      expect(r.profile.essencesSeen).toContain(essence);
    }
  });

  it('teaches an unknown pattern, or gives the fallback once every pattern is known', () => {
    const p = fresh();
    const reward: Reward = {
      kind: 'pattern',
      id: 'unknown',
      count: 1,
      fallback: { kind: 'dust', count: 30 },
    };
    const r = resolve(p, reward);
    const { pattern } = r.granted.ref as { kind: 'pattern'; pattern: string };
    expect(p.patterns).not.toContain(pattern);
    expect(r.profile.patterns).toEqual([...p.patterns, pattern]);
    const all = { ...p, patterns: registry.getDelveData().bases.map((b) => b.id) };
    const f = resolve(all, reward);
    expect(f.granted).toEqual({ ref: { kind: 'dust' }, count: 30 });
    expect(f.profile.manaDust).toBe(all.manaDust + 30);
    expect(f.profile.patterns).toEqual(all.patterns);
  });

  it('resolves the same on the same stream, and goes to the stockpile mid-dive too', () => {
    const p = fresh();
    const rule: Reward = { kind: 'shard', family: 'offense', tier: 2, count: 1 };
    expect(resolve(p, rule, 'same')).toEqual(resolve(p, rule, 'same'));
    const diving = startDive(registry, p, 1);
    const r = resolve(diving, { kind: 'flux', grade: 'magic', count: 1 });
    expect(r.profile.materials.flux.magic).toBe(diving.materials.flux.magic + 1);
    expect(r.profile.dive!.haul).toEqual(diving.dive!.haul);
  });
});

describe('a claim through grantRewards', () => {
  it("resolves every reward on the claim's stream, deterministically", () => {
    const p = fresh();
    const rewards: Reward[] = [
      { kind: 'metal', id: 'depth', count: 3 },
      { kind: 'shard', family: 'utility', tier: 1, count: 2 },
      { kind: 'essence', id: 'fit', count: 1 },
    ];
    const a = grantRewards(registry, p, 'first_steps', rewards);
    expect(a).toEqual(grantRewards(registry, p, 'first_steps', rewards));
    expect(a.granted.map((g) => g.ref.kind)).toEqual(['metal', 'shard', 'essence']);
    expect(a.profile.materials.metals.rusty).toBe(p.materials.metals.rusty + 3);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quest-rewards.test.ts)`
Expected: FAIL, 7 failed (7), each with `Error: resolveReward: not implemented`.

- [ ] **Step 3: `resolveReward`**

Overwrite `packages/engine/src/delve/rewards.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import { weightedPick } from '../loot/item-generator.js';
import { addMaterial, emptyHaul, metalAt, shardTiersOf, stockHaul } from '../loot/materials.js';
import type { SeededRNG } from '../rng/seeded-rng.js';
import type { MetalId } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { Reward, RewardGrant, RewardRef } from '../types/quests.js';

/**
 * Quest and contract rewards (see the quests spec's Rewards): `resolveReward`
 * settles a reward, its rule resolved against the profile on `rng`, and adds
 * it to the stockpile (never a dive's haul). `grantRewards` (`delve/quests.ts`)
 * calls it for each reward of a claim, on the claim's stream.
 */

/** `count` of `ref` into the stockpile: a pattern learned, an essence seen too. */
function grant(
  profile: DelveProfile,
  ref: RewardRef,
  count: number,
): { profile: DelveProfile; granted: RewardGrant } {
  const granted = { ref, count };
  if (ref.kind === 'pattern') {
    const known = profile.patterns.includes(ref.pattern);
    return {
      profile: known ? profile : { ...profile, patterns: [...profile.patterns, ref.pattern] },
      granted,
    };
  }
  const haul =
    ref.kind === 'scrap' ? { ...emptyHaul(), scrap: count } : addMaterial(emptyHaul(), ref, count);
  const next = stockHaul(profile, haul);
  if (ref.kind !== 'essence' || next.essencesSeen.includes(ref.essence))
    return { profile: next, granted };
  return { profile: { ...next, essencesSeen: [...next.essencesSeen, ref.essence] }, granted };
}

/**
 * `reward` made concrete (`granted`) and added to the stockpile: `metal:
 * 'depth'` the metal of the best depth, a shard rule a random affix of its
 * family (by the affixes' weights) at its tier (clamped to the affix's tiers),
 * `essence: 'fit'` a legendary whose slots fit a learned pattern, `pattern:
 * 'unknown'` a random unknown pattern (learned), else its `fallback`. A pattern
 * reward teaches one pattern.
 */
export function resolveReward(
  registry: DataRegistry,
  profile: DelveProfile,
  reward: Reward,
  rng: SeededRNG,
): { profile: DelveProfile; granted: RewardGrant } {
  const { count } = reward;
  const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(0, xs.length - 1)];
  switch (reward.kind) {
    case 'scrap':
    case 'dust':
    case 'links':
      return grant(profile, { kind: reward.kind }, count);
    case 'metal': {
      const metal =
        reward.id === 'depth' ? metalAt(registry, profile.bestDepth).id : (reward.id as MetalId);
      return grant(profile, { kind: 'metal', metal }, count);
    }
    case 'flux':
      return grant(profile, { kind: 'flux', grade: reward.grade! }, count);
    case 'shard': {
      const { families } = registry.getCraftingData();
      const affixes = registry
        .getDelveData()
        .affixes.filter((a) => families[a.stat] === reward.family);
      const { stat } = weightedPick(affixes, (a) => a.weight, rng);
      const tier = Math.min(reward.tier!, shardTiersOf(registry, stat).length);
      return grant(profile, { kind: 'shard', stat, tier }, count);
    }
    case 'essence': {
      if (reward.id !== 'fit')
        return grant(profile, { kind: 'essence', essence: reward.id! }, count);
      const { bases, legendaries } = registry.getDelveData();
      const slots = bases.filter((b) => profile.patterns.includes(b.id)).map((b) => b.slot);
      const fits = legendaries.filter((l) => l.slots.some((s) => slots.includes(s)));
      return grant(
        profile,
        { kind: 'essence', essence: pick(fits.length > 0 ? fits : legendaries).id },
        count,
      );
    }
    case 'pattern': {
      if (reward.id !== 'unknown')
        return grant(profile, { kind: 'pattern', pattern: reward.id! }, 1);
      const unknown = registry.getDelveData().bases.filter((b) => !profile.patterns.includes(b.id));
      if (unknown.length === 0) return resolveReward(registry, profile, reward.fallback!, rng);
      return grant(profile, { kind: 'pattern', pattern: pick(unknown).id }, 1);
    }
  }
}
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quest-rewards.test.ts)`
Expected: PASS, 7 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 7 tests in F + 1 files pass (1794 passed | 5 skipped in 99 passed | 1 skipped at the base's counts).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/rewards.ts tests/delve-quest-rewards.test.ts)
git add packages/engine/src/delve/rewards.ts packages/engine/tests/delve-quest-rewards.test.ts
git commit -m "feat(engine): resolveReward: quest rewards and their rules into the stockpile" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Chapter 1 and the side quests

The main chain "Embers of the Anvil" and the eight side quests, each with Hesta's line. No contract templates yet: Phase A's guards keep `refillBoard` (still a stub) uncalled until Task 3.

**Files:**
- Create: `packages/engine/tests/delve-quests-content.test.ts`
- Overwrite: `packages/engine/src/data/quests.json`

- [ ] **Step 1: The failing test**

Create `packages/engine/tests/delve-quests-content.test.ts`:

```ts
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

  it("gives every quest and template Hesta's line: one or two short sentences, no emoji", () => {
    for (const { id, line } of [...quests, ...contractTemplates]) {
      expect(line.split(/[.!?](\s|$)/).filter((s) => s.trim()).length, id).toBeLessThanOrEqual(2);
      expect(line.length, id).toBeLessThanOrEqual(110);
      expect(line, id).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-content.test.ts)`
Expected: FAIL, 2 failed | 2 passed (4): the main chain holds only `'First Steps'`, and the side quests are `{}`.

- [ ] **Step 3: The content**

Overwrite `packages/engine/src/data/quests.json`:

```json
{
  "giver": { "name": "Hesta", "sprite": "hesta" },
  "quests": [
    {
      "id": "first_steps",
      "kind": "main",
      "name": "First Steps",
      "chapter": "Embers of the Anvil",
      "line": "The Anvil wants metal, and the deep has it. Go down a little way, then come back to me.",
      "objectives": [
        {
          "id": "depth",
          "type": "reachDepth",
          "count": 2,
          "scope": "total",
          "text": "Reach depth 2"
        }
      ],
      "rewards": [
        { "kind": "metal", "id": "depth", "count": 3 },
        { "kind": "scrap", "count": 40 }
      ]
    },
    {
      "id": "bring_it_home",
      "kind": "main",
      "name": "Bring It Home",
      "chapter": "Embers of the Anvil",
      "line": "Anyone can fall in a hole. Climbing out with your pockets full is the trade.",
      "unlock": { "after": "first_steps" },
      "objectives": [
        {
          "id": "extract",
          "type": "extract",
          "count": 1,
          "scope": "total",
          "text": "Extract from a dive"
        }
      ],
      "rewards": [{ "kind": "flux", "grade": "uncommon", "count": 2 }]
    },
    {
      "id": "strike_the_anvil",
      "kind": "main",
      "name": "Strike the Anvil",
      "chapter": "Embers of the Anvil",
      "line": "Bar, flux, and a steady arm. Make me something better than common.",
      "unlock": { "after": "bring_it_home" },
      "objectives": [
        {
          "id": "forge",
          "type": "forge",
          "filter": { "minRarity": "uncommon" },
          "count": 1,
          "scope": "total",
          "text": "Forge an uncommon or better item"
        }
      ],
      "rewards": [
        { "kind": "shard", "family": "offense", "tier": 2, "count": 1 },
        { "kind": "shard", "family": "defense", "tier": 2, "count": 1 }
      ]
    },
    {
      "id": "a_second_flame",
      "kind": "main",
      "name": "A Second Flame",
      "chapter": "Embers of the Anvil",
      "line": "One element is a habit; two is a craft. Bind another and let them argue.",
      "unlock": { "after": "strike_the_anvil" },
      "objectives": [
        {
          "id": "bind",
          "type": "bind",
          "count": 1,
          "scope": "total",
          "text": "Bind a second element"
        }
      ],
      "rewards": [
        { "kind": "dust", "count": 30 },
        { "kind": "links", "count": 2 }
      ]
    },
    {
      "id": "spark_and_counterspark",
      "kind": "main",
      "name": "Spark and Counterspark",
      "chapter": "Embers of the Anvil",
      "line": "Strike with one, follow with the other. When they meet, you'll hear it.",
      "unlock": { "after": "a_second_flame" },
      "objectives": [
        {
          "id": "react",
          "type": "reaction",
          "filter": { "pair": true },
          "count": 5,
          "scope": "total",
          "text": "Trigger your pair's reaction 5 times"
        }
      ],
      "rewards": [{ "kind": "flux", "grade": "magic", "count": 1 }]
    },
    {
      "id": "the_cinder_warden",
      "kind": "main",
      "name": "The Cinder Warden",
      "chapter": "Embers of the Anvil",
      "line": "Grask runs the Cinder Mines like he owns them. Break him, then forge something worthy of the story.",
      "unlock": { "after": "spark_and_counterspark" },
      "objectives": [
        {
          "id": "boss",
          "type": "boss",
          "filter": { "biome": "cinder_mines" },
          "count": 1,
          "scope": "total",
          "text": "Defeat Foreman Grask in the Cinder Mines"
        },
        {
          "id": "legendary",
          "type": "forge",
          "filter": { "legendary": true },
          "count": 1,
          "scope": "total",
          "text": "Forge a legendary"
        }
      ],
      "rewards": [
        { "kind": "flux", "grade": "epic", "count": 1 },
        { "kind": "shard", "family": "offense", "tier": 3, "count": 1 }
      ]
    },
    {
      "id": "deep_diver",
      "kind": "side",
      "name": "Deep Diver",
      "line": "The good ore sits low. Go deeper than is sensible.",
      "unlock": { "after": "bring_it_home" },
      "objectives": [
        {
          "id": "depth",
          "type": "reachDepth",
          "count": 10,
          "scope": "total",
          "text": "Reach depth 10"
        }
      ],
      "rewards": [
        { "kind": "flux", "grade": "rare", "count": 1 },
        { "kind": "scrap", "count": 150 }
      ]
    },
    {
      "id": "perfect_form",
      "kind": "side",
      "name": "Perfect Form",
      "line": "Don't block what you can step around. Show me ten clean dodges in one dive.",
      "unlock": { "after": "bring_it_home" },
      "objectives": [
        {
          "id": "dodge",
          "type": "perfectDodge",
          "count": 10,
          "scope": "dive",
          "text": "Make 10 perfect dodges in one dive"
        }
      ],
      "rewards": [{ "kind": "shard", "family": "defense", "tier": 2, "count": 2 }]
    },
    {
      "id": "smelter",
      "kind": "side",
      "name": "Smelter",
      "line": "Three poor bars make one good one. Learn the heat of it.",
      "unlock": { "after": "strike_the_anvil" },
      "objectives": [
        {
          "id": "refine",
          "type": "refine",
          "count": 10,
          "scope": "total",
          "text": "Refine 10 times"
        }
      ],
      "rewards": [
        { "kind": "metal", "id": "depth", "count": 5 },
        { "kind": "scrap", "count": 100 }
      ]
    },
    {
      "id": "collector",
      "kind": "side",
      "name": "Collector",
      "line": "A smith is only as good as the shapes she knows. Bring me patterns.",
      "unlock": { "after": "strike_the_anvil" },
      "objectives": [
        {
          "id": "patterns",
          "type": "knowPatterns",
          "count": 6,
          "scope": "total",
          "text": "Know 6 patterns"
        }
      ],
      "rewards": [
        {
          "kind": "pattern",
          "id": "unknown",
          "count": 1,
          "fallback": { "kind": "dust", "count": 30 }
        },
        { "kind": "scrap", "count": 80 }
      ]
    },
    {
      "id": "fully_socketed",
      "kind": "side",
      "name": "Fully Socketed",
      "line": "A weapon with empty sockets is a promise. Open a few and keep it.",
      "unlock": { "after": "a_second_flame" },
      "objectives": [
        {
          "id": "sockets",
          "type": "openSocket",
          "count": 3,
          "scope": "total",
          "text": "Open 3 sockets"
        }
      ],
      "rewards": [
        { "kind": "links", "count": 3 },
        { "kind": "dust", "count": 20 }
      ]
    },
    {
      "id": "elementalist",
      "kind": "side",
      "name": "Elementalist",
      "line": "Every pair of elements has its own temper. Find five of them.",
      "unlock": { "after": "spark_and_counterspark" },
      "objectives": [
        {
          "id": "reactions",
          "type": "discoverReaction",
          "count": 5,
          "scope": "total",
          "text": "Discover 5 reactions"
        }
      ],
      "rewards": [
        { "kind": "flux", "grade": "rare", "count": 1 },
        { "kind": "shard", "family": "element", "tier": 3, "count": 1 }
      ]
    },
    {
      "id": "untouchable",
      "kind": "side",
      "name": "Untouchable",
      "line": "No potions, no scratches, a deep floor. Do that and I'll part with something rare.",
      "unlock": { "bestDepth": 6 },
      "objectives": [
        {
          "id": "clean",
          "type": "clearFloor",
          "filter": { "noPotion": true, "noDamage": true, "minDepth": 5 },
          "count": 1,
          "scope": "total",
          "text": "Clear a floor of depth 5 or deeper without a potion or taking damage"
        }
      ],
      "rewards": [
        { "kind": "essence", "id": "fit", "count": 1 },
        { "kind": "scrap", "count": 100 }
      ]
    },
    {
      "id": "iron_will",
      "kind": "side",
      "name": "Iron Will",
      "line": "Going down is easy. Walking out of depth fifteen is what I'd call a smith's nerve.",
      "unlock": { "bestDepth": 10 },
      "objectives": [
        {
          "id": "extract",
          "type": "extract",
          "filter": { "minDepth": 15 },
          "count": 1,
          "scope": "total",
          "text": "Extract from depth 15 or deeper"
        }
      ],
      "rewards": [
        { "kind": "flux", "grade": "epic", "count": 1 },
        { "kind": "metal", "id": "depth", "count": 5 }
      ]
    }
  ],
  "contractTemplates": []
}
```

- [ ] **Step 4: Run it to see it pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quests-content.test.ts tests/delve-quests-data.test.ts tests/delve-quests-contract.test.ts)`
Expected: PASS, 19 tests in 3 files (Phase A's data and contract tests still pass on the content).

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 11 tests in F + 2 files pass (1798 | 5 skipped in 100 | 1 skipped).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/data/quests.json tests/delve-quests-content.test.ts)
git add packages/engine/src/data/quests.json packages/engine/tests/delve-quests-content.test.ts
git commit -m "feat(engine): quests.json: chapter 1, Embers of the Anvil, and the side quests" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The Contract board

### Task 3: The Contract board and its templates

`generateContract`, `refillBoard` and `rerollContract`, with the nine templates that turn Phase A's call sites on: a new save starts with a full board, and a dive that cleared a depth refills it.

**Files:**
- Create: `packages/engine/tests/delve-quest-contracts.test.ts`
- Overwrite: `packages/engine/src/delve/contracts.ts`
- Modify: `packages/engine/src/data/quests.json`, `packages/engine/tests/delve-quests-content.test.ts`

- [ ] **Step 1: The failing tests**

Create `packages/engine/tests/delve-quest-contracts.test.ts`:

```ts
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
    // Every template but the reaction one (no pair bound, no reaction seen).
    expect(new Set(cs.map((c) => c.template)).size).toBe(8);
    expect(all.some((o) => o.type === 'reaction')).toBe(false);
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
      expect(o.filter).toEqual({ noPotion: true, minDepth: 12 - contracts.flagDepthBelow });
    expect(all.find((o) => o.type === 'reaction')!.text).toMatch(
      /^Trigger (Melt|Overload) \d+ times$/,
    );
  });

  it("draws counts from the tier's range and scales rewards with the best depth", () => {
    const templates = registry.getQuestsData().contractTemplates;
    const scale = 1 + contracts.depthScale * 20;
    for (const c of offers({ ...fresh(), bestDepth: 20 })) {
      const t = templates.find((x) => x.id === c.template)!;
      const [lo, hi] = t.count[c.tier];
      expect(c.objectives[0].count).toBeGreaterThanOrEqual(lo);
      expect(c.objectives[0].count).toBeLessThanOrEqual(hi);
      const base = t.rewards[c.tier];
      expect(c.rewards.slice(0, base.length).map((r) => r.count)).toEqual(
        base.map((r) => Math.round(r.count * scale)),
      );
      // Only a hard contract may add an essence.
      const extra = c.rewards.slice(base.length);
      expect(extra).toEqual(
        c.tier === 'hard' && extra.length ? [{ kind: 'essence', id: 'fit', count: 1 }] : [],
      );
    }
  });

  it('rolls the hard essence at generation, at its chance', () => {
    const hard = offers(fresh()).filter((c) => c.tier === 'hard');
    const share =
      hard.filter((c) => c.rewards.some((r) => r.kind === 'essence')).length / hard.length;
    expect(hard.length).toBeGreaterThan(20);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.4);
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

  it('refuses mid-dive, an empty slot, a spent reroll and too little scrap', () => {
    const p = { ...fresh(), scrap: 100 };
    const refused = (q: DelveProfile, slot = 0) => {
      const r = rerollContract(registry, q, slot);
      expect(r.ok).toBe(false);
      expect(r.profile).toBe(q);
      return r.reason;
    };
    expect(refused(startDive(registry, p, 1))).toBe('Reroll at the Anvil, between dives');
    const board = p.quests.board.slice();
    board[2] = null;
    expect(refused({ ...p, quests: { ...p.quests, board } }, 2)).toBe('No contract to reroll');
    expect(refused({ ...p, quests: { ...p.quests, rerollUsed: true } })).toBe(
      'One reroll a visit: clear a depth to reroll again',
    );
    expect(refused({ ...p, scrap: contracts.rerollScrap - 1 })).toBe('Not enough scrap');
  });
});
```

In `packages/engine/tests/delve-quests-content.test.ts`:

Replace:

```ts
  it("gives every quest and template Hesta's line: one or two short sentences, no emoji", () => {
```

with:

```ts
  it('holds the nine contract templates, one per kind of goal', () => {
    expect(contractTemplates.map((t) => [t.type, t.filter ?? {}])).toEqual([
      ['kill', { kind: 'elite', biome: 'reached' }],
      ['kill', { element: 'reached' }],
      ['reaction', { reaction: 'known' }],
      ['perfectDodge', {}],
      ['extract', { minDepth: 'window' }],
      ['clearFloor', { noPotion: true, minDepth: 'flag' }],
      ['boss', { biome: 'reached' }],
      ['forge', { minRarity: 'owned' }],
      ['refine', {}],
    ]);
  });

  it("gives every quest and template Hesta's line: one or two short sentences, no emoji", () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-quest-contracts.test.ts tests/delve-quests-content.test.ts)`
Expected: FAIL, 11 failed | 4 passed (15): `Error: generateContract: not implemented` (5), `refillBoard: not implemented` and `rerollContract: not implemented` (1 each), `TypeError: Cannot read properties of null (reading 'id')` (3: a new save's board is still `[null, null, null]`), and the templates test (`expected [] to deeply equal [ [ 'kill', …(1) ], …(8) ]`). The content test's other four pass.

- [ ] **Step 3: The board and the templates**

Overwrite `packages/engine/src/delve/contracts.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import { weightedPick } from '../loot/item-generator.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { FLUX_GRADES } from '../types/crafting.js';
import type { DelveProfile } from '../types/delve.js';
import type { Rarity } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import {
  CONTRACT_TIERS,
  type Contract,
  type ContractTemplate,
  type ObjectiveFilter,
  type Reward,
} from '../types/quests.js';
import type { ReactionId } from '../types/arpg.js';
import { isDiveActive } from './dive.js';
import { profileStats } from './pair.js';
import type { ProfileActionResult } from './profile.js';

/**
 * The Contract board (see the quests spec): `profile.quests.board`'s
 * contracts, generated from `quests.json → contractTemplates` on forks of the
 * profile seed (reloading never rerolls), refilled after a dive that cleared a
 * depth, one reroll an Anvil visit. No expiry.
 */

/** What a contract's filter may name for this hero: only what is possible (the spec's Contract board). */
interface Possible {
  /** The biomes of depths 1 to max(1, bestDepth), in order (they cycle). */
  biomes: string[];
  /** Their mana: a foe's element is its biome's. */
  elements: ManaType[];
  /** The pair's reaction, when bound, and every reaction seen. */
  reactions: ReactionId[];
  /** Depth goals: [max(2, bestDepth + lo), bestDepth + hi]. */
  window: [number, number];
  /** The `noPotion` / `noDamage` floors' minDepth. */
  flagDepth: number;
  /** Common up to the best flux grade owned. */
  rarities: Rarity[];
}

function possible(registry: DataRegistry, profile: DelveProfile): Possible {
  const { depthWindow, flagDepthBelow } = registry.getDelveBalance().quests.contracts;
  const best = profile.bestDepth;
  const reached = Array.from({ length: Math.max(1, best) }, (_, i) =>
    registry.getBiomeForDepth(i + 1),
  );
  const { primary, secondary } = profile.pair;
  const reactions = [
    ...(primary && secondary ? [registry.getReactionFor(primary, secondary).id] : []),
    ...(profile.reactionsSeen as ReactionId[]),
  ];
  const owned = FLUX_GRADES.filter((g) => profile.materials.flux[g] > 0);
  const top = owned.length > 0 ? FLUX_GRADES.indexOf(owned[owned.length - 1]) + 1 : 0;
  const lo = Math.max(2, best + depthWindow[0]);
  return {
    biomes: [...new Set(reached.map((b) => b.id))],
    elements: [...new Set(reached.map((b) => b.mana))],
    reactions: [...new Set(reactions)],
    window: [lo, Math.max(lo, best + depthWindow[1])],
    flagDepth: Math.max(1, best - flagDepthBelow),
    rarities: ['common', ...FLUX_GRADES.slice(0, top)],
  };
}

/** A template is offered only when every filter rule it names has a value (a reaction rule needs one known). */
function offered(t: ContractTemplate, can: Possible): boolean {
  return t.filter?.reaction === undefined || can.reactions.length > 0;
}

/**
 * The next contract, `contract:<boardCount>`, from a template and a tier
 * (`contracts.tierWeights`) drawn on `contract:<boardCount>` from the profile
 * seed, its filter filled with only what is possible for the hero, its count
 * from the tier's range and its rewards × (1 + depthScale × bestDepth); a
 * hard one may add an essence (`essence: 'fit'`) at `essenceChance` × Lucky
 * Charm's boost. A template already on the board is passed over while another
 * can be offered. Its text's `{count}`, `{biome}`, `{element}`, `{reaction}`,
 * `{depth}` and `{rarity}` are filled from the data's names. The caller moves
 * `boardCount` on.
 */
export function generateContract(registry: DataRegistry, profile: DelveProfile): Contract {
  const { tierWeights, depthScale, essenceChance } = registry.getDelveBalance().quests.contracts;
  const n = profile.quests.boardCount;
  const rng = new SeededRNG(profile.seed).fork(`contract:${n}`);
  const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(0, xs.length - 1)];
  const can = possible(registry, profile);
  const all = registry.getQuestsData().contractTemplates.filter((t) => offered(t, can));
  const onBoard = new Set(profile.quests.board.map((c) => c?.template));
  const fresh = all.filter((t) => !onBoard.has(t.id));
  const t = pick(fresh.length > 0 ? fresh : all);
  const tier = weightedPick(CONTRACT_TIERS, (k) => tierWeights[k], rng);

  const rule = t.filter ?? {};
  const filter: ObjectiveFilter = {};
  if (rule.kind) filter.kind = rule.kind;
  if (rule.biome) filter.biome = pick(can.biomes);
  if (rule.element) filter.element = pick(can.elements);
  if (rule.reaction) filter.reaction = pick(can.reactions);
  if (rule.minDepth === 'window') filter.minDepth = rng.nextInt(...can.window);
  if (rule.minDepth === 'flag') filter.minDepth = can.flagDepth;
  if (rule.minRarity) filter.minRarity = pick(can.rarities);
  if (rule.noPotion) filter.noPotion = true;
  if (rule.noDamage) filter.noDamage = true;
  const count = rng.nextInt(...t.count[tier]);

  const scale = 1 + depthScale * profile.bestDepth;
  const scaled = (r: Reward): Reward => ({
    ...r,
    count: Math.max(1, Math.round(r.count * scale)),
    ...(r.fallback && { fallback: scaled(r.fallback) }),
  });
  const rewards = t.rewards[tier].map(scaled);
  if (tier === 'hard') {
    const boost = profileStats(registry, profile).legendaries.lucky_charm ? 2 : 1;
    if (rng.next() < Math.min(1, essenceChance * boost))
      rewards.push({ kind: 'essence', id: 'fit', count: 1 });
  }

  const names: Record<string, string | number> = {
    count,
    depth: filter.minDepth ?? '',
    rarity: filter.minRarity ?? '',
    biome: registry.getDelveData().biomes.find((b) => b.id === filter.biome)?.name ?? '',
    element: filter.element ? registry.getArpgData().mana[filter.element].name : '',
    reaction: filter.reaction ? registry.getReaction(filter.reaction).name : '',
  };
  return {
    id: `contract:${n}`,
    template: t.id,
    tier,
    name: t.name,
    line: t.line,
    objectives: [
      {
        id: 'goal',
        type: t.type,
        ...(Object.keys(filter).length > 0 && { filter }),
        count,
        scope: t.scope,
        text: t.text.replace(/\{(\w+)\}/g, (_, k: string) => String(names[k] ?? '')),
      },
    ],
    rewards,
    progress: [{ value: 0, done: false }],
  };
}

/** `profile` with `slot` holding the next contract, `boardCount` moved on. */
function place(registry: DataRegistry, profile: DelveProfile, slot: number): DelveProfile {
  const contract = generateContract(registry, profile);
  const board = profile.quests.board.slice();
  board[slot] = contract;
  return {
    ...profile,
    quests: { ...profile.quests, board, boardCount: profile.quests.boardCount + 1 },
  };
}

/**
 * Every empty slot filled (`generateContract` each, in slot order), and the
 * visit's reroll back (`rerollUsed` false). `createDelveProfile`, and
 * `settleDive` after a dive that cleared a depth, call it while
 * `contractTemplates` holds any.
 */
export function refillBoard(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let next = profile;
  profile.quests.board.forEach((c, slot) => {
    if (!c) next = place(registry, next, slot);
  });
  return { ...next, quests: { ...next.quests, rerollUsed: false } };
}

/**
 * Slot `slot`'s contract replaced (`generateContract`) for `rerollScrap`, once
 * an Anvil visit; refused mid-dive, on an empty slot, or once the visit's
 * reroll is spent. The old contract's id leaves `tracked` and `seen`. Pure:
 * the Quests tab calls it as a dry run, and shows its refusals as they read.
 */
export function rerollContract(
  registry: DataRegistry,
  profile: DelveProfile,
  slot: number,
): ProfileActionResult {
  const no = (reason: string): ProfileActionResult => ({ ok: false, profile, reason });
  const old = profile.quests.board[slot];
  const price = registry.getDelveBalance().quests.contracts.rerollScrap;
  if (isDiveActive(profile)) return no('Reroll at the Anvil, between dives');
  if (!old) return no('No contract to reroll');
  if (profile.quests.rerollUsed) return no('One reroll a visit: clear a depth to reroll again');
  if (profile.scrap < price) return no('Not enough scrap');
  const placed = place(registry, profile, slot);
  const keep = (ids: string[]) => ids.filter((id) => id !== old.id);
  return {
    ok: true,
    profile: {
      ...placed,
      scrap: placed.scrap - price,
      quests: {
        ...placed.quests,
        rerollUsed: true,
        tracked: keep(placed.quests.tracked),
        seen: keep(placed.quests.seen),
      },
    },
  };
}
```

In `packages/engine/src/data/quests.json`:

Replace:

```json
  "contractTemplates": []
```

with:

```json
  "contractTemplates": [
    {
      "id": "elite_cull",
      "name": "Elite Cull",
      "line": "The big ones are getting bold. Thin them out.",
      "type": "kill",
      "filter": { "kind": "elite", "biome": "reached" },
      "count": { "easy": [4, 6], "normal": [8, 12], "hard": [14, 20] },
      "scope": "total",
      "text": "Slay {count} elites in {biome}",
      "rewards": {
        "easy": [
          { "kind": "scrap", "count": 50 },
          { "kind": "metal", "id": "depth", "count": 2 }
        ],
        "normal": [
          { "kind": "scrap", "count": 80 },
          { "kind": "flux", "grade": "uncommon", "count": 1 }
        ],
        "hard": [
          { "kind": "scrap", "count": 120 },
          { "kind": "flux", "grade": "magic", "count": 1 }
        ]
      }
    },
    {
      "id": "element_hunt",
      "name": "Element Hunt",
      "line": "I need cores that still hum with their element. Bring down the ones that carry it.",
      "type": "kill",
      "filter": { "element": "reached" },
      "count": { "easy": [12, 18], "normal": [25, 35], "hard": [45, 60] },
      "scope": "total",
      "text": "Slay {count} {element} foes",
      "rewards": {
        "easy": [
          { "kind": "scrap", "count": 40 },
          { "kind": "dust", "count": 5 }
        ],
        "normal": [
          { "kind": "dust", "count": 10 },
          { "kind": "shard", "family": "element", "tier": 2, "count": 1 }
        ],
        "hard": [
          { "kind": "dust", "count": 15 },
          { "kind": "shard", "family": "element", "tier": 3, "count": 1 }
        ]
      }
    },
    {
      "id": "reaction_drill",
      "name": "Reaction Drill",
      "line": "Do it until your hands know it. Then do it again.",
      "type": "reaction",
      "filter": { "reaction": "known" },
      "count": { "easy": [5, 8], "normal": [10, 15], "hard": [20, 30] },
      "scope": "total",
      "text": "Trigger {reaction} {count} times",
      "rewards": {
        "easy": [{ "kind": "dust", "count": 8 }],
        "normal": [
          { "kind": "dust", "count": 12 },
          { "kind": "links", "count": 1 }
        ],
        "hard": [
          { "kind": "dust", "count": 20 },
          { "kind": "links", "count": 2 }
        ]
      }
    },
    {
      "id": "light_feet",
      "name": "Light Feet",
      "line": "A smith who can't step aside loses fingers. Practise.",
      "type": "perfectDodge",
      "count": { "easy": [3, 5], "normal": [6, 10], "hard": [12, 18] },
      "scope": "total",
      "text": "Make {count} perfect dodges",
      "rewards": {
        "easy": [
          { "kind": "scrap", "count": 40 },
          { "kind": "shard", "family": "defense", "tier": 1, "count": 1 }
        ],
        "normal": [
          { "kind": "scrap", "count": 60 },
          { "kind": "shard", "family": "defense", "tier": 2, "count": 1 }
        ],
        "hard": [
          { "kind": "scrap", "count": 90 },
          { "kind": "shard", "family": "defense", "tier": 3, "count": 1 }
        ]
      }
    },
    {
      "id": "deep_haul",
      "name": "Deep Haul",
      "line": "Go past where you're comfortable, and walk back out with it.",
      "type": "extract",
      "filter": { "minDepth": "window" },
      "count": { "easy": [1, 1], "normal": [1, 1], "hard": [1, 1] },
      "scope": "total",
      "text": "Extract from depth {depth} or deeper",
      "rewards": {
        "easy": [
          { "kind": "scrap", "count": 60 },
          { "kind": "metal", "id": "depth", "count": 2 }
        ],
        "normal": [
          { "kind": "scrap", "count": 90 },
          { "kind": "flux", "grade": "uncommon", "count": 1 },
          { "kind": "metal", "id": "depth", "count": 2 }
        ],
        "hard": [
          { "kind": "scrap", "count": 140 },
          { "kind": "flux", "grade": "magic", "count": 1 },
          { "kind": "metal", "id": "depth", "count": 3 }
        ]
      }
    },
    {
      "id": "dry_run",
      "name": "Dry Run",
      "line": "Potions are a crutch. Clear a floor without one and tell me how it felt.",
      "type": "clearFloor",
      "filter": { "noPotion": true, "minDepth": "flag" },
      "count": { "easy": [1, 1], "normal": [2, 3], "hard": [4, 5] },
      "scope": "total",
      "text": "Clear floors of depth {depth} or deeper without a potion",
      "rewards": {
        "easy": [
          { "kind": "scrap", "count": 50 },
          { "kind": "shard", "family": "sustain", "tier": 1, "count": 1 }
        ],
        "normal": [
          { "kind": "scrap", "count": 80 },
          { "kind": "shard", "family": "sustain", "tier": 2, "count": 1 }
        ],
        "hard": [
          { "kind": "scrap", "count": 120 },
          { "kind": "shard", "family": "sustain", "tier": 3, "count": 1 }
        ]
      }
    },
    {
      "id": "warden_bounty",
      "name": "Warden's Due",
      "line": "Every biome has a warden who thinks the place is theirs. Remind one.",
      "type": "boss",
      "filter": { "biome": "reached" },
      "count": { "easy": [1, 1], "normal": [1, 1], "hard": [1, 1] },
      "scope": "total",
      "text": "Defeat the boss of {biome}",
      "rewards": {
        "easy": [
          { "kind": "scrap", "count": 80 },
          { "kind": "flux", "grade": "uncommon", "count": 1 }
        ],
        "normal": [
          { "kind": "scrap", "count": 120 },
          { "kind": "flux", "grade": "magic", "count": 1 }
        ],
        "hard": [
          { "kind": "scrap", "count": 160 },
          { "kind": "flux", "grade": "rare", "count": 1 }
        ]
      }
    },
    {
      "id": "fine_work",
      "name": "Fine Work",
      "line": "A buyer wants quality, not quantity. Well, some quantity.",
      "type": "forge",
      "filter": { "minRarity": "owned" },
      "count": { "easy": [1, 1], "normal": [2, 2], "hard": [3, 3] },
      "scope": "total",
      "text": "Forge items of {rarity} rarity or better",
      "rewards": {
        "easy": [
          { "kind": "scrap", "count": 30 },
          { "kind": "metal", "id": "depth", "count": 2 }
        ],
        "normal": [
          { "kind": "scrap", "count": 50 },
          { "kind": "shard", "family": "utility", "tier": 2, "count": 1 }
        ],
        "hard": [
          { "kind": "scrap", "count": 80 },
          { "kind": "shard", "family": "offense", "tier": 3, "count": 1 }
        ]
      }
    },
    {
      "id": "smelting_order",
      "name": "Smelting Order",
      "line": "My furnace is idle and that offends me. Refine something.",
      "type": "refine",
      "count": { "easy": [2, 3], "normal": [4, 6], "hard": [8, 10] },
      "scope": "total",
      "text": "Refine {count} times",
      "rewards": {
        "easy": [
          { "kind": "scrap", "count": 30 },
          { "kind": "dust", "count": 5 }
        ],
        "normal": [
          { "kind": "scrap", "count": 50 },
          { "kind": "metal", "id": "depth", "count": 3 }
        ],
        "hard": [
          { "kind": "scrap", "count": 80 },
          { "kind": "flux", "grade": "uncommon", "count": 2 }
        ]
      }
    }
  ]
```

- [ ] **Step 4: Run them to see them pass, then the suite**

Run: `(cd packages/engine && npx vitest run tests/delve-quest-contracts.test.ts tests/delve-quests-content.test.ts)`
Expected: PASS, 15 tests.

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 22 tests in F + 3 files pass (1809 | 5 skipped in 101 | 1 skipped). The pacing rails pass unchanged: the board draws only on its own `contract:<n>` streams, and the autopilot doesn't claim until Phase D.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-quest-b2
(cd packages/engine && npx prettier --write --end-of-line auto src/delve/contracts.ts src/data/quests.json tests/delve-quest-contracts.test.ts tests/delve-quests-content.test.ts)
git add packages/engine/src/delve/contracts.ts packages/engine/src/data/quests.json packages/engine/tests/delve-quest-contracts.test.ts packages/engine/tests/delve-quests-content.test.ts
git commit -m "feat(engine): the Contract board: seeded, possible contracts, the refill and one reroll a visit; the nine templates" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

After Task 3, from the worktree root:

```bash
(cd packages/engine && npx tsup && npx tsc --noEmit -p . && npx vitest run)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
git status --short
```

Expected: tsup's "Build success" lines; both typechecks clean; the engine suite **N + 22 tests in F + 3 files** (1809 | 5 skipped in 101 | 1 skipped, the pacing rails included); the client suite **M tests in G files** unchanged (1224 in 152: `questStates` is B1's and still shows nothing, so the client sees no content yet); `git status` clean but for untracked plan docs the worktree may hold. Three commits on `quest/b2`.
