# Delve quests (main line, side quests, the Contract board)

**Status:** design approved in conversation, 2026-10-03; revised after the spec review the same day. Builds on v0.58.0 (component crafting, save v8) and fills the Quests tab, journal and HUD tracker shipped as placeholders in v0.55.0. Ships as **v0.59.0** with **save v9** (old saves reset; no migration).

## Why

The Delve has deep build systems (chains, runes, crafting) but little that tells a player why to take the next dive. Quests give each run a goal and a **steerable source of the rare crafting inputs** (flux grades, high-tier shards, essences, patterns) on top of drop luck. The UI already exists and is empty.

## Decisions (the user's)

| # | Question | Decision |
|---|---|---|
| 1 | What are quests for? | **Goals and rewards.** Quests never lock features; nothing a player needs is behind one. |
| 2 | Repeatables | A **rotating board** of 3, seeded (reloading never rerolls), refilled after the next dive. Named **Contracts** on the **Contract board** ("bounty" already means the dive's scrap bounty). |
| 3 | Death | **Progress always counts** the moment it happens, death or not. Only rewards wait to be claimed. |
| 4 | Flavour | A **light voice**: one giver at the Anvil, **Hesta, the Anvil-keeper**, a new sprite (a code-drawn placeholder through pixel-forge, regenerated later). Foreman Grask stays the Cinder Mines boss. A line or two per quest; all text in JSON. |
| 5 | Tracking | **Quest events** from the engine advance data-driven objectives. |
| 6 | Content | Main chapter 1 (6 quests), 8 side quests, contract templates. |
| 7 | Saves | No migration: save v9 resets older saves. |
| 8 | Tuning | Every number in data. |

### Decided in the spec (the user can override)

| # | Question | Decision |
|---|---|---|
| S1 | Contract rerolls | **One per Anvil visit**, at a flat `rerollScrap`; an empty slot can't be rerolled. |
| S2 | When the board refills | After a dive that **cleared at least one depth** (so start-and-abandon refills nothing), at the dive's settle, after the dive's quest events apply. |
| S3 | Pattern objectives | Count patterns **known** (`profile.patterns.length`; a new save knows 3). "Collector" = know 6. |
| S4 | Boss kills | Count only through the `boss` objective (emitted when a boss floor completes), never through `kill`, so a floor replay can't double a boss. Ordinary kills on a replayed floor count again (same effort as new play). |
| S5 | Claimed quests | Main and side quests move to a collapsed "Done" group in the journal. A claimed contract leaves the save (only a lifetime count is kept). |
| S6 | Objective types | Only the types the content uses (below); the model makes more cheap to add later. |

## The quest model

**Kinds:**
- **Main:** a chain; each unlocks when the previous is claimed. The current main quest is tracked by default.
- **Side:** each unlocks on a condition; optional.
- **Contract:** generated from templates onto the Contract board.

**A quest** (`quests.json → quests[]`): `{ id, kind, name, chapter?, line (Hesta's), unlock?: Unlock, objectives: Objective[] (1–3), rewards: Reward[] }`. A quest with no `unlock` is unlocked on a new save.

**An objective:** `{ id, type, filter?, count, scope, text }`.
- `type` and how its progress grows:

| type | events | progress | filters |
|---|---|---|---|
| `kill` | a foe killed (not a boss) | sum | `kind` (normal / elite), `biome`, `element` (the foe's `element`) |
| `reachDepth` | a depth entered (`startDive`, `chooseDoor`) | **max** of the depth | — |
| `clearFloor` | a floor completed | sum | `biome`, `noPotion`, `noDamage`, `minDepth` |
| `extract` | an extract | sum | `minDepth` |
| `boss` | a boss floor completed | sum | `biome` |
| `reaction` | a reaction triggered (each, not deduplicated) | sum | `reaction` id, or `pair` (the hero's pair's reaction, resolved against `profile.pair` when the event applies) |
| `perfectDodge` | a perfect dodge | sum | — |
| `forge` | an item forged | sum | `minRarity`, `legendary` |
| `refine` | a refine | sum | — |
| `bind` | a secondary bound | **state**: 1 when `pair.secondary` is set | — |
| `openSocket` | a socket opened (through `setChains`' Apply or `openSocket`) | sum | — |
| `knowPatterns` | a pattern learned | **state**: `profile.patterns.length` | — |
| `discoverReaction` | `reactionsSeen` grows | **state**: `reactionsSeen.length` | — |

- `scope`: `total` (from when the quest unlocks) or `dive` (within one dive; reset when a dive starts and when it settles). `scope: 'dive'` is rejected on Anvil-only types (`forge`, `refine`, `bind`, `openSocket`, `knowPatterns`).
- **State types** (`reachDepth` reads `bestDepth`, `bind`, `knowPatterns`, `discoverReaction`) are **re-read from the profile on every `applyQuestEvents` call** (and when the quest unlocks), so an early bind, a deep player, or known patterns credit at once, and they need no emission sites of their own: any op that changes the state just calls `applyQuestEvents` (with no events if it has none).
- Progress is capped at `count`. An objective completes at `count` and **stays complete** (a `dive` reset never clears a completed objective). A quest completes when all its objectives do.

**Unlock** (side quests and the main chain): `{ after?: questId (claimed), bestDepth?: number, reactionsSeen?: number, patterns?: number, pair?: true }`, all required. Unlocks are checked once at profile creation, inside every `applyQuestEvents`, in `claimQuest`, and when `bestDepth` changes.

**Rewards:** `Reward = { kind: 'scrap' | 'dust' | 'links' | 'metal' | 'flux' | 'shard' | 'essence' | 'pattern', id?: string, grade?: FluxGrade, family?: Family, tier?: number, count: number }`. Concrete ids or rules:
- `metal` with `id: 'depth'`: the metal of the hero's best depth;
- `shard` with `family` + `tier`: a random affix of that family at that tier (clamped to the affix's tier count);
- `essence` with `id: 'fit'`: a legendary whose slots fit a learned pattern;
- `pattern` with `id: 'unknown'`: a random unknown pattern, or its `fallback` reward when every pattern is known.

Rules resolve when claimed, on `quest:<id>:<claimCount>` from the profile seed (`resolveReward`). Rewards go **straight to the stockpile** (never a dive's haul). The quest view shows a rule as text ("a tier III offense shard") until claimed.

**Claiming:** `claimQuest(registry, profile, questId)` at the Anvil only (refused mid-dive). A claimed main quest unlocks the next. A claimed quest leaves `tracked`; a newly unlocked main quest takes the tracked slot the old main held (or the first free one).

**Tracking:** up to `delve.quests.maxTracked` (3); saved. `trackQuest` and `markQuestSeen` work mid-dive (the pause allows them); only `claimQuest` and `rerollContract` are Anvil-only.

**Seen:** a quest unlocked but not yet opened in the journal shows NEW; opening it calls `markQuestSeen`.

## Quest events (the engine)

**`QuestEvent`:** a typed union mirroring the event column above, with its filter fields.

**During a dive:**
- `WorldPending.questEvents: QuestEvent[]`. Sandbox worlds emit none (every emission sits under `!world.sandbox`).
- Kills: in `combat.ts` `killMonster`, under its sandbox guard, push `{ type: 'kill', kind: m.kind, biome: world.biomeId, element: m.element }` (bosses excluded, S4).
- Reactions: in `combat.ts` `noteReaction` push `{ type: 'reaction', reaction }` for each reaction (the existing `pending.reactions` set stays for `reactionsSeen`).
- Perfect dodges: in `dodge.ts` where a perfect dodge pays out.
- Floor flags: plain world booleans `ArpgWorld.potionDrunk` (set where a potion is drunk in `step.ts`) and `ArpgWorld.hurt` (set where the hero takes damage > 0 in `combat.ts`). `completeFloor` reads them for `clearFloor`'s `noPotion` / `noDamage`. A potion drunk at the door screen (`drinkPotionBetweenFloors`) doesn't count against the next floor.
- `bankWorld` applies the pending events (`applyQuestEvents`) and clears them, so they count whenever the client or the autopilot banks.
- `completeFloor` emits `clearFloor` (with the flags and the depth) and, on a boss floor, `boss`.
- `startDive` and `chooseDoor` emit `reachDepth` with the depth entered (checkpoint starts and a door's skip included).
- `extractDive` emits `extract` with the depth.
- A dive's start and its settle reset `dive`-scoped progress.

**At the Anvil:**
- `forge` (`delve/crafting.ts`) emits `forge` with the rarity.
- `refine` emits `refine`.
- `bindSecondary` (`delve/pair.ts`) emits `bind`.
- `setChains` (`delve/moveset.ts`) emits one `openSocket` per socket its Apply opens; `openSocket` (`delve/runes.ts`) emits one.
- `knowPatterns` and `discoverReaction` are state types: `bankWorld` (pickups, `reactionsSeen`), `applySalvage` (`loot/salvage-yield.ts`, incl. mid-dive auto-salvage) and `claimQuest` (a `pattern` reward) call `applyQuestEvents` after changing the state; nothing emits them.

**One function:** `applyQuestEvents(registry, profile, events): DelveProfile`. It advances every unlocked, unclaimed quest's matching objectives (including the board's contracts), then runs unlocks. It is pure and deterministic. Each emitting op calls it internally and returns the updated profile; **no op's result type changes**.

**Notices:** the client's store diffs `profile.quests` before and after each `setProfile` and queues "Objective done: …" / "Quest complete: claim at the Anvil" into its existing `notices` queue. One place covers every path, banking included.

**Progress always counts** (decision 3): dive events apply at each bank, before any death settles; a death or abandon never removes quest progress. The client banks pending quest events like other pickups (throttled by `BANK_EVERY`) and flushes before "Anvil · floor restarts" and abandon.

## The Contract board

- `profile.quests.board`: `slots` (3) entries, each a generated contract or empty.
- **Generation:** `generateContract(registry, profile)` from `quests.json → contractTemplates[]` on `contract:<boardCount>` from the profile seed. `boardCount` increments per contract and gives each its unique id (`contract:<n>`). Reloading never rerolls.
- **Template:** `{ id, type, filter rules, count: { easy: [lo, hi], normal, hard }, scope, text, rewards by tier }`.
- **Only possible contracts:**
  - biome filters for biomes reached: `getBiomeForDepth(d)` for `d` in `1..max(1, bestDepth)` (biomes cycle);
  - element filters only for the mana of biomes reached (a foe's element is its biome's mana);
  - reaction filters for the pair's reaction (when bound) or reactions in `reactionsSeen`;
  - depth goals within `[max(2, bestDepth + depthWindow[0]), bestDepth + depthWindow[1]]` (`depthWindow` in data, starting `[-2, 3]`);
  - forge goals only up to the highest flux grade the hero currently owns (common when none);
  - `noPotion` / `noDamage` floor contracts carry `minDepth = max(1, bestDepth − flagDepthBelow)` (data).
- **Tiers:** easy / normal / hard by `tierWeights`; the count comes from the tier's range, and reward counts from the template's tier table × `(1 + depthScale × bestDepth)` (rounded). A hard contract may add an essence (`essence: 'fit'`, resolved at claim) at `essenceChance` (× Lucky Charm's `legendaryBoost`), **rolled at generation** so the board shows it.
- **Progress lives on the board entry** (one home); a claimed contract is removed (its slot empties) and `contractsClaimed` +1. A claimed or rerolled contract's id leaves `tracked` and `seen`.
- **Refill (S2):** `refillBoard` runs in `settleDive` (`delve/dive.ts`) when the dive cleared at least one depth, after the dive's events applied, and fills every empty slot. It also resets the visit's reroll. A new save starts with a full board (`createDelveProfile` → `refillBoard`).
- **Reroll (S1):** `rerollContract(registry, profile, slot)` replaces one filled slot's contract for `rerollScrap`, once per Anvil visit; a visit ends only with a settled dive that cleared a depth (when `refillBoard` resets `rerollUsed`). Refused mid-dive, on an empty slot, or after the visit's reroll is spent.
- **No expiry** in v1.

## Content (the first pass)

All text and numbers live in `quests.json`; the plan writes them in full.

**Main chapter 1, "Embers of the Anvil"** (each with a line from Hesta):
1. **First Steps:** reach depth 2. Reward: bars of the depth's metal and scrap.
2. **Bring It Home:** extract from a dive. Reward: uncommon flux.
3. **Strike the Anvil:** forge an uncommon or better item. Reward: shards.
4. **A Second Flame:** bind a second element (credits an earlier bind). Reward: Mana Dust and Links.
5. **Spark and Counterspark:** trigger your pair's reaction 5 times. Reward: a magic flux.
6. **The Cinder Warden:** beat the Cinder Mines boss (Foreman Grask), then forge a legendary. Reward: an epic flux and a tier-III shard.

**Side quests** (unlock in brackets):
- **Deep Diver:** reach depth 10 [after main 2].
- **Perfect Form:** 10 perfect dodges in one dive [after main 2].
- **Smelter:** refine 10 times [after main 3].
- **Collector:** know 6 patterns [after main 3].
- **Fully Socketed:** open 3 sockets [after main 4].
- **Elementalist:** discover 5 reactions [after main 5].
- **Untouchable:** clear a floor of depth 5 or deeper without drinking a potion and without taking damage [best depth 6].
- **Iron Will:** extract from depth 15 or deeper [best depth 10].

**Contract templates** (9):
- elite kills in a biome;
- kills of an element;
- a reaction N times;
- perfect dodges;
- extract from depth X or deeper;
- clear a floor without a potion;
- beat a biome's boss;
- forge an item of rarity R or better;
- refine N times.

Anvil-only contracts (forge, refine) are priced in the Economy view's `quests` income line.

**Hesta's sprite:**
- She is a code-drawn sprite in `packages/pixel-forge` (`art/alloy/sprites/hesta.ts`, a `code` entry in `manifest.json`), built into the atlas by `forge build`.
- Her canvas follows the atlas rule: 16 px per unit at a size of about 1.6, so about 26 px.
- Two frames: idle and a hammer lift.

## The client

**An engine view, a client adapter:**
- The engine exports `questStates(registry, profile): QuestState[]` with `{ id, kind, status: 'active' | 'complete' | 'claimed', isNew, tracked, name, line, chapter?, objectives: { id, text, value, count, done }[], rewards: RewardView[] }`, where `RewardView = { ref: MaterialRef | 'scrap' | 'dust' | 'links', count } | { rule: Reward }` is data (the engine formats nothing).
- A client adapter maps it to the existing `QuestView` (colours, `sub`, kind tags), naming rewards (concrete and rule) with `features/delve/hub/forge/materials-text.ts`, and the giver from `registry.getQuestsData().giver`.
- `useQuests` reads it. The sample fixture and the `alloy:delve:questPreview` flag go.

**Quests tab** (`hub/quests/QuestsTab.tsx`):
- The journal groups Main / Side / Contracts / Done.
- Each row has a NEW and DONE (claimable) badge; opening a quest marks it seen.
- **Detail:** Hesta's sprite and line, objectives with progress bars, rewards.
- **Claim** (A / Enter) on a completed quest; in the pause it is disabled and reads "Claim at the Anvil".
- **Track** (G / Y), up to `maxTracked`.
- **The Contract board** in the Contracts group: its slots, with empty ones reading "New contract after your next dive", and **Reroll** with its price (X / R), disabled once used this visit.

**Other screens:**
- **The tab's pip:** the hub header shows the count of claimable quests on the Quests tab (the kit's tab badge).
- **The Anvil footer:** shows "n to claim" beside Delve when there are any; a click opens the Quests tab.
- **HUD tracker** (`QuestTracker` in `FloorColumn`): shows the tracked quests with live progress, which moves at each bank.
- **Toasts:** from the store's diff (above).

## Data, tuning and the save

- **`src/data/quests.json`** (`QuestsDataSchema`, `registry.getQuestsData()`): `giver { name, sprite }`, `quests[]`, `contractTemplates[]`. The schema checks shapes and unique ids; the **registry** checks the cross-file references (biomes, reactions, rarities, patterns, monster kinds) and that the main chain's `after` links form one chain, as other cross-file keys are checked.
- **`balance.json → delve.quests`** (`QuestsBalanceSchema`):
  - `maxTracked`;
  - `contracts { slots, tierWeights, depthScale (rewards × (1 + depthScale × bestDepth)), depthWindow, flagDepthBelow, rerollScrap, essenceChance }`.
- **Profile v9:** `quests { progress: Record<QuestId, ObjectiveProgress[]>, unlocked: QuestId[], claimed: QuestId[], tracked: QuestId[], seen: QuestId[], board: (Contract | null)[], boardCount, contractsClaimed, rerollUsed, claimCount }`. Older saves reset (the v8 reset path, bumped).
- **Determinism:** quest progress comes only from engine events; contract generation and rule-based rewards draw from forked streams of the profile seed.

## The autopilot and the Economy view

- The autopilot claims completed quests and contracts between dives, and never rerolls.
- `economySim` adds a `quests` income line (rewards claimed per dive).
- The pacing rails stay green with quest rewards added; Phase D may trim quest rewards if they push progression past the rails' ceilings.

## Phases and parallel areas

| Phase | Area | Owns |
|---|---|---|
| **A · Contract** | One area | <ul><li>`types/quests.ts`</li><li>`quests.json` schema + registry getter + cross-file checks (with a minimal placeholder `quests.json`)</li><li>`balance.json → delve.quests`</li><li>profile v9 + reset</li><li>`WorldPending.questEvents`, `ArpgWorld.potionDrunk` / `hurt`</li><li>**typed stubs** for `applyQuestEvents`, `questStates`, `claimQuest`, `markQuestSeen`, `trackQuest`, `resolveReward`, `generateContract`, `refillBoard`, `rerollContract`</li><li>**the call sites wired to the stubs**: `createDelveProfile` → `refillBoard`; `settleDive` → `refillBoard`; `claimQuest` → `resolveReward`</li><li>store actions (`claimQuest`, `rerollContract`, `trackQuest`, `markQuestSeen`) as wrappers</li><li>`useQuests` on `questStates` via a minimal adapter (C1 extends it)</li></ul> |
| **B · Engine** | **B1** events and progress | `delve/quests.ts` (`applyQuestEvents`, unlocks, state types, `claimQuest`, `questStates`, `markQuestSeen`, `trackQuest`); every emission site (`arpg/combat.ts`, `arpg/dodge.ts`, `arpg/step.ts`, `delve/dive.ts`, `delve/crafting.ts`, `delve/pair.ts`, `delve/moveset.ts`, `delve/runes.ts`, `loot/salvage-yield.ts`); tests on fixture quests |
| | **B2** contracts and rewards | `delve/contracts.ts` (`generateContract`, `refillBoard`, `rerollContract`, the possible-filters rules); `delve/rewards.ts` (`resolveReward`); the content in `quests.json` |
| **C · Client** | **C1** Quests tab | `hub/quests/*` (claim, badges, Done group, the board, reroll, the pause's disabled Claim); the hub's tab pip; the Anvil footer's "n to claim"; the adapter |
| | **C2** HUD, toasts, banking | `quests/QuestTracker.tsx` live progress; the store's notice diff in `setProfile`; `arena/useArena.ts` (bank on quest events); `pages/DelveRun.tsx` (flush before "Anvil · floor restarts") |
| | **C3** Hesta's sprite | `packages/pixel-forge` (`art/alloy/sprites/hesta.ts`, the manifest entry, `forge build` → the atlas); `client/src/features/delve/__tests__/sprite-atlas.test.ts` (`hesta` in `known`, size 1.6 → 26 px) |
| **D · Autopilot, balance, docs** | One area | The autopilot's claiming; `economySim`'s `quests` line; the pacing rails; CLAUDE.md; bump **v0.59.0** |

## Tests

- **Engine** (on fixture quests, independent of the content):
  - **Objectives:**
    - each type matches its events and filters;
    - sum vs max vs state;
    - `total` vs `dive` scope (a completed objective survives the reset);
    - the cap;
    - completion.
  - **Progress always counts:** a death after a kill keeps the progress, and bank timing doesn't change totals.
  - **Unlocks:** the main chain, side conditions, and state credit (an early bind completes quest 4 when it unlocks).
  - **No double counts:** a boss floor replayed doesn't double the `boss` objective.
  - **Claims:**
    - rewards land in the stockpile;
    - claiming is refused mid-dive;
    - rule-based rewards resolve deterministically;
    - `pattern: 'unknown'` falls back when every pattern is known.
  - **The board:**
    - seeded generation (same seed → same board);
    - only possible contracts are offered (a new save included);
    - refill only after a dive with a cleared depth, and not after start-and-abandon;
    - one reroll per visit;
    - an empty slot can't be rerolled.
  - **Emission:** `setChains` emits `openSocket` per socket opened, and patterns learned by salvage emit `knowPatterns`.
  - **The sandbox** emits nothing.
  - **Schemas and the registry** reject bad data.
- **Pacing:** the rails pass with the autopilot claiming quests.
- **Client:**
  - **Quests tab:** the journal, badges, claim, track, the board, reroll, and the Done group.
  - **Hub and Anvil:** the tab pip and the footer count.
  - **HUD:** the tracker's live progress.
  - **Toasts:** the store's notice diff.
  - **The pause:** Claim is disabled.
  - **E2E:** complete "First Steps" in a dive, claim it at the Anvil and see the next main quest; reroll a contract.

## Out of scope

- More chapters, more givers, dialogue panels (the data model allows them).
- Quests that lock features.
- Real-time (daily / weekly) contracts.
- Achievements (a later, separate feature).
- Objective types the content doesn't use yet (salvage, hone, imprint, a specific monster).
