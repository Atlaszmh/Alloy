# Delve quests (main line, side quests, the bounty board)

**Status:** design approved in conversation, 2026-10-03. Builds on v0.58.0 (component crafting, save v8) and fills the Quests tab, journal and HUD tracker shipped as placeholders in v0.55.0. Ships as **v0.59.0** with **save v9** (old saves reset; no migration).

## Why

The Delve has deep build systems (chains, runes, crafting) but little that tells a player why to take the next dive. Quests give each run a goal and a **steerable source of the rare crafting inputs** (flux grades, high-tier shards, essences, patterns) on top of drop luck. The UI already exists and is empty.

## Decisions (the user's)

| # | Question | Decision |
|---|---|---|
| 1 | What are quests for? | **Goals and rewards.** Quests never lock features; nothing a player needs is behind one. |
| 2 | Bounties | A **rotating board** of 3, seeded (reloading never rerolls), refilled after the next dive. |
| 3 | Death | **Progress always counts** the moment it happens, death or not. Only rewards wait to be claimed. |
| 4 | Flavour | A **light voice**: one giver at the Anvil, the Foreman (sprite `foreman_grask`), with a line or two per quest; all text in JSON. |
| 5 | Tracking | **Quest events** from the engine advance data-driven objectives (not stat snapshots, not client tracking). |
| 6 | Content | Main chapter 1 (6 quests), about 8 side quests, bounty templates. |
| 7 | Saves | No migration: save v9 resets older saves. |
| 8 | Tuning | Every number in data. |

## The quest model

**Kinds:**
- **Main:** a chain; each unlocks when the previous is claimed. The current main quest is tracked by default.
- **Side:** each unlocks on a condition (a `when` objective, e.g. reach depth 8, forge a first rare, bind a second element). Optional.
- **Bounty:** generated from templates onto the board (below).

**A quest** (`quests.json → quests[]`): `{ id, kind, name, chapter?, story (the Foreman's line), unlock?: Unlock, objectives: Objective[] (1–3), rewards: Reward[] }`.

**An objective** is one data row: `{ id, type, filter?, count, scope, text }`:
- `type`, the events it counts:
  - `kill`: foes killed (filter: `rank` normal/elite/boss, `biome`, `element` of the foe's biome or its mana, `monster` id);
  - `reachDepth`: the deepest depth reached in a dive (`count` is the depth; it completes when a dive reaches it);
  - `clearFloor`: floors cleared (filter: `biome`, `noPotion`, `noDamage`);
  - `extract`: extracts (filter: `minDepth`);
  - `boss`: bosses killed (filter: `biome`);
  - `reaction`: reactions triggered (filter: `reaction` id, or `pair` meaning the hero's pair's reaction);
  - `perfectDodge`;
  - `forge` (filter: `minRarity`, `legendary`), `refine`, `salvage`, `hone`, `imprint`;
  - `bind` (a secondary bound), `openSocket`, `learnPattern`, `discoverReaction` (counts `reactionsSeen` growth).
- `scope`: `total` (accumulates from when the quest unlocks) or `dive` (accumulates within one dive; resets when the dive starts and ends).
- Progress is capped at `count`; an objective completes at `count`; a quest completes when all its objectives do.

**Unlock** (side quests and the main chain): `{ after?: questId (claimed), bestDepth?: number, reactionsSeen?: number, patterns?: number, pair?: true }`, all required. Unlocked quests track progress from the moment they unlock (no retroactive credit, except `reachDepth`, `learnPattern` and `discoverReaction`, which read current state at unlock so a deep player isn't asked to "reach depth 5").

**Rewards** (`Reward`): `{ kind: 'scrap' | 'dust' | 'links' | 'metal' | 'flux' | 'shard' | 'essence' | 'pattern' | 'rune', id?, tier?, count }`. A reward may name a concrete material or ask for one by rule (e.g. `{ kind: 'metal', id: 'depth' }` = the metal of the hero's best depth; `{ kind: 'shard', family: 'offense', tier: 3 }` = a tier-III shard of a random affix of that family, rolled when claimed on `quest:<id>`; `{ kind: 'essence', id: 'pairFit' }` = an essence of a legendary whose slots fit a learned pattern). Rewards go **straight to the stockpile when claimed** (never into a dive's haul).

**Claiming:** at the Anvil only (refused mid-dive, like the forge). `claimQuest(registry, profile, questId)`; a claimed main quest unlocks the next.

**Tracking:** up to `MAX_TRACKED` (3) quests on the HUD; the current main quest is tracked by default; tracking is saved.

## Quest events (the engine)

- **Events** (`QuestEvent`): a typed union mirroring the objective types, each carrying its filter fields (e.g. `{ type: 'kill', rank, biome, monster, element }`, `{ type: 'reaction', reaction }`, `{ type: 'forge', rarity, legendary }`).
- **During a dive:** the sim already reports kills, reactions, perfect dodges, clears and the boss through `ArpgEvent`s and `WorldPending`. `WorldPending` gains `questEvents: QuestEvent[]`, appended in `stepWorld` where those happen (kill, reaction, perfect dodge, potion drunk and damage taken for the floor's flags). `bankWorld` applies and clears them, so they count whenever the client or the autopilot banks (timing doesn't change the totals). `completeFloor` adds `clearFloor` (with `noPotion` / `noDamage` from the floor's flags), `boss`, and `reachDepth`; `extractDive` adds `extract`; a dive's start and end reset `dive`-scoped progress.
- **At the Anvil:** each profile op appends its event: `forge`, `refine`, `salvage` (per item), `hone`, `imprint`, `bindSecondary` → `bind`, `openSocket`, and pattern learning (from salvage or pickup) → `learnPattern`; `reactionsSeen` growth → `discoverReaction`.
- **One function:** `applyQuestEvents(registry, profile, events): { profile, completed: QuestId[], objectivesDone: { quest, objective }[] }` advances every unlocked, unclaimed quest's matching objectives, then runs unlocks. Pure and deterministic. The ops above return its `completed` / `objectivesDone` so the client can toast.
- **Progress always counts** (decision 3): dive events apply at each bank, before any death settles; a death or abandon never removes quest progress.
- **The sandbox** (Training Grounds) emits no quest events.

## The bounty board

- `profile.quests.board`: 3 slots, each a generated bounty quest (or empty, waiting to refill).
- **Generation:** from `quests.json → bountyTemplates[]` on the stream `bounty:<boardCount>` from the profile seed (`boardCount` increments per generated bounty), so reloading never rerolls.
- **Template:** `{ id, type, filter rules, count: [lo, hi] by tier, scope, text template, reward table }`.
- **Only possible bounties:**
  - biome filters only for biomes the hero has reached (by `bestDepth` and the biome order);
  - reaction filters only for the pair's reaction or reactions in `reactionsSeen`;
  - depth goals within `[bestDepth − 2, bestDepth + 3]` (at least 2);
  - forge goals only for rarities the hero has forged or can afford.
- **Tiers:** each bounty rolls easy / normal / hard (`delve.quests.bounties.tierWeights`). The tier scales its count and rewards (`tierScale`), and so does the hero's `bestDepth` (`depthScale`). A hard bounty can include a tier-up shard or, at `essenceChance`, an essence.
- **Refill:** a claimed slot stays empty until the **next dive ends**, then refills (no farming at the Anvil). A new save starts with a full board.
- **Reroll:** one bounty slot per Anvil visit (between two dives) can be rerolled for `rerollScrap × rerollGrowth^rerollsThisVisit` scrap; refused mid-dive.
- **No expiry** in v1: a bounty stays until completed and claimed, or rerolled.

## Content (the first pass)

All text and numbers live in `quests.json`; the following is the starting content, which the plan writes in full.

**Main chapter 1, "Embers of the Anvil"** (each with a Foreman line):
1. **First Steps:** reach depth 2. Reward: bars of the depth's metal and scrap.
2. **Bring It Home:** extract from a dive. Reward: uncommon flux.
3. **Strike the Anvil:** forge an uncommon or better item. Reward: shards.
4. **A Second Flame:** bind a second element. Reward: Mana Dust and Links.
5. **Spark and Counterspark:** trigger your pair's reaction 5 times. Reward: a magic flux.
6. **The Cinder Warden:** beat the Cinder Mines boss, then forge a legendary. Reward: an epic flux and a tier-III shard.

**Side quests** (unlock condition in brackets):
- **Deep Diver:** reach depth 10 [after quest 2].
- **Perfect Form:** 10 perfect dodges in one dive [after 2].
- **Smelter:** refine 10 times [after 3].
- **Collector:** learn 6 patterns [after 3].
- **Fully Socketed:** open 3 sockets [after 4].
- **Elementalist:** discover 5 reactions [after 5].
- **Untouchable:** clear a floor without drinking a potion and without taking damage [best depth 6].
- **Iron Will:** extract from depth 15 or deeper [best depth 10].

**Bounty templates** (about 9):
- elite kills in a biome;
- kills of an element;
- reaction N times;
- perfect dodges;
- extract from depth X+;
- clear a floor without a potion;
- beat a biome's boss;
- forge an item of rarity R+;
- refine N times.

## The client

**Quests tab** (`hub/quests/QuestsTab.tsx`, today a placeholder over `useQuests`):
- `useQuests` reads `profile.quests` through an engine view (`questViews(registry, profile): QuestView[]`); the dev-only sample fixture and the `alloy:delve:questPreview` flag go.
- The journal groups Main / Side / Bounties, with NEW (unlocked, unseen) and DONE (claimable) badges.
- **Detail pane:** the Foreman's sprite and line, objectives with progress bars, rewards with names and counts.
- **Claim** (A / Enter) on a completed quest; disabled with "Claim at the Anvil" mid-dive (the pause).
- **Track** (G / Y) as today, up to 3.
- **The bounty board** in the Bounties group: 3 slots (empty slots read "New bounty after your next dive") and **Reroll** with its price (X / R; one per visit).

**The tab's pip:** the hub header shows a count of claimable quests on the Quests tab (the kit's tab badge).

**HUD tracker** (`QuestTracker`, rendered by `FloorColumn` today but fed no quests): shows the tracked quests with live progress. During a dive, progress updates when the world banks.

**Toasts:** "Objective done: …" and "Quest complete: claim at the Anvil" from the ops' `objectivesDone` / `completed` (through the store's existing notices queue).

**Anvil footer:** "n to claim" beside the Delve button when there are any (a click goes to the Quests tab).

**Pause:** the Quests tab is browsable (read-only) as today; Claim and Reroll are disabled.

## Data, tuning and the save

- **`src/data/quests.json`** (new, `QuestsDataSchema`, `registry.getQuestsData()`): `quests[]`, `bountyTemplates[]`, `giver` (name, sprite). The schema checks:
  - quest and objective ids are unique;
  - main-chain `after` links form one chain;
  - filters name real biomes, reactions, monsters, rarities and patterns;
  - reward ids are real.
- **`balance.json → delve.quests`** (`QuestsBalanceSchema`):
  - `bounties { slots, tierWeights, tierScale, depthScale, rerollScrap, rerollGrowth, essenceChance }`;
  - reward tables by tier.
- **Profile v9:** `quests { unlocked: Record<QuestId, ProgressState>, claimed: QuestId[], tracked: QuestId[], seen: QuestId[], board: (BountyQuest | null)[], boardCount, rerollsThisVisit }`. `ProgressState` holds each objective's value and `scope: 'dive'` objectives' current-dive value. Older saves reset (the v8 reset path, bumped).
- **Determinism:** quest progress comes only from engine events; bounty generation and rule-based rewards draw from forked streams of the profile seed.

## The autopilot and the Economy view

- The autopilot claims completed quests and bounties between dives, and never rerolls.
- `economySim` counts quest rewards as their own income line (`quests`) so the Economy view shows them.
- The pacing rails stay green with quest rewards added; Phase D may lower other rewards if quests push progression past the rails' ceilings.

## Phases and parallel areas

| Phase | Areas | Owns |
|---|---|---|
| **A · Contract** | One area | `types/quests.ts`; `quests.json` + schema + registry getter; `balance.json → delve.quests`; profile v9 + reset; typed stubs (`applyQuestEvents`, `questViews`, `claimQuest`, `rerollBounty`, `refillBoard`, `generateBounty`); `WorldPending.questEvents`; store actions (`claimQuest`, `rerollBounty`, `trackQuest`) as wrappers; the client's `useQuests` switched to `questViews` (with the stub) |
| **B · Engine** (B1 ∥ B2) | **B1** events and progress | `delve/quests.ts` (`applyQuestEvents`, unlocks, `claimQuest`, `questViews`); the event emission in `arpg/step.ts` / `combat.ts` / `dive.ts` / `crafting.ts` / `pair.ts` / `runes.ts` / `profile.ts` |
| | **B2** bounties and rewards | `delve/bounties.ts` (`generateBounty`, `refillBoard`, `rerollBounty`, the possible-filters rules, reward resolution); the content in `quests.json` |
| **C · Client** (after A; real data after B) | **C1** Quests tab | `hub/quests/*` (claim, badges, the board, reroll); the hub's tab pip; the Anvil footer's "n to claim" |
| | **C2** HUD and toasts | `quests/QuestTracker.tsx` live progress; toasts from the store; the pause's disabled Claim |
| **D · Autopilot, balance, docs** | One area | The autopilot's claiming; `economySim`'s `quests` line; the pacing rails; CLAUDE.md; bump **v0.59.0** |

## Tests

- **Engine:**
  - objectives:
    - each type matches its events and filters;
    - `total` vs `dive` scope;
    - the cap;
    - completion.
  - progress always counts:
    - a death after a kill keeps the progress;
    - banking timing doesn't change totals.
  - unlocks: the main chain, side conditions, and current-state credit for `reachDepth` / `learnPattern` / `discoverReaction`.
  - claims:
    - claiming grants rewards to the stockpile and is refused mid-dive;
    - rule-based rewards resolve deterministically.
  - the board:
    - seeded generation (same seed → same board);
    - only possible bounties are offered;
    - a claimed slot refills only after the next dive;
    - reroll pricing, one per visit.
  - the sandbox emits nothing;
  - the schemas reject bad data.
- **Pacing:** the rails pass with the autopilot claiming quests.
- **Client:**
  - the Quests tab: journal, badges, claim, track and the board with reroll;
  - the tab pip and footer count;
  - the HUD tracker's live progress;
  - toasts.
  - **E2E:** complete "First Steps" in a dive, claim it at the Anvil, see the next main quest; reroll a bounty.

## Out of scope

- More chapters, more givers, dialogue panels (the data model allows them).
- Quests that lock features.
- Real-time (daily / weekly) bounties.
- Achievements (a later, separate feature).
