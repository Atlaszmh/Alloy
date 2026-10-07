# Delve boons Implementation Plan — Overview

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordinary stops between depths offer three dive-scoped **boons** (free, three tiers, stacking to a per-boon cap) instead of the paid power-ups; the guided start's stops and the anvil alcoves keep the power-ups; shrines become boon rows; echo hits stop costing hit-stop and frame budget. Ships as client v0.70.0, save v13.

**Architecture:** Phase A lays the contract with **nothing changed in play**: the boon types and `boons.json` (the six shrines as rows, in their old order), the registry, the full `BoonEffect` and its schema, `buffSum`, `diveStats`, boon knobs threaded into blows and moves (inert with no boon worn), the `stackTime` knob (neutral), the `DiveStop` union, the `boon` stop action (refused), `DoorMods.boons`, `delve.boons` balance, the `hit` event's `echo` flag, save v13. Phase B fills the engine in three parallel areas that own disjoint files. Phase C builds the client in three parallel areas. Phase D measures, tunes and finishes.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, React 19, Zustand 5, PixiJS 8, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-delve-boons-design.md` (authoritative). Section numbers below are the spec's.

## Phases

| Phase | Area | Plan file | Base | Owns (only this area edits these) |
|---|---|---|---|---|
| A | Contract | `01-contract.md` | `main` | the types, schemas, registry, `boons.json`, `delve/boons.ts`, `delve/pair.ts`'s `diveStats`, `hero-stats.ts`'s `computeHeroStats` knob threading, `resolve.ts`'s `boonKnobs` append, the save version |
| B | B1 the stop, the first batch, the bot | `02-stop.md` | A merged | `delve/stops.ts`, `boons.json`'s stop rows, `data/boons-check.ts`, `delve/autopilot.ts`, `delve/economy.ts` |
| B | B2 combat fields | `03-combat-fields.md` | A merged | `hero-stats.ts`'s `applyBuffs`, `abilities/impact.ts`, `dodge.ts`, `abilities/cast.ts`, `defend.ts`, `combat.ts`, `combat.ts`'s `applyStacks` (`stackTime`) |
| B | B3 world fields | `04-world-fields.md` | A merged | `world.ts` (floor start, spawn), `step.ts` (magnet), `interact.ts` (`healOnClear`, `shrinesLastDive`), `material-drops.ts`, `rune-drops.ts`, `dive.ts` (`settleDive`, `chooseDoor`), `fog.ts`, `terrain.ts`, `objects.ts` |
| C | C1 the stop screen | `05-client-stop.md` | A merged | `features/delve/stop/`, `StopPanel.tsx`'s caller, `onboarding.ts`, the kit gallery, `stores/delveStore.ts`'s stop action |
| C | C2 the HUD and summaries | `06-client-hud.md` | A merged | `arena/hud/BuffRow.tsx`, `useArenaCore.ts`'s `HudBuff`, `hub/PauseScreen.tsx`'s state, `DiveSummary`, Help's dive topic |
| C | C3 performance | `07-client-perf.md` | A merged | `fx/hitstop.ts`, the camera shake, `arena-sounds.ts`, `fx/mana-fx.ts`'s `HIT_FX_BUDGET`, `pixel/arena-effects.ts`, `training/` `FrameChip` |
| D | Perf gate, pacing, docs, bump, E2E | `08-finish.md` | everything merged | `tests/delve-sim-perf.test.ts`, pacing reads and tuning, `CLAUDE.md`, the version, the E2E specs |

B1, B2, B3, C1, C2 and C3 run in parallel worktrees off the merged contract. No two areas edit one file. Where an area needs another's file it says so under "Needs routed", and the integrator applies it at merge.

## The contract (Phase A lands exactly these; every later phase builds on them as written)

`packages/engine/src/types/boon.ts` (new):

```ts
import type { KnobsData } from './ability.js';

export const BOON_FAMILIES = ['offense', 'element', 'defense', 'tempo', 'fortune', 'pact', 'floor'] as const;
export type BoonFamily = (typeof BOON_FAMILIES)[number];
export type BoonId = string;
export type BoonTierIndex = 1 | 2 | 3;
export const BOON_TIER_NAMES = ['common', 'rare', 'epic'] as const;

/**
 * What a boon or shrine does. Every field optional. Units: a bonus is the added fraction
 * (`damage: 0.25` is +25%); a drop multiplier (`flux`, `runes`, `gear`) is the raw factor (1.3).
 * Stacking (spec §2): counts and additive bonuses sum; `damage`, `manaRegen`, `maxLife`, `tempo`,
 * `flux`, `runes`, `gear` multiply per entry; `hazardsFriendly` takes the largest; `knobs` merge
 * per entry through `mergeKnobs`.
 */
export interface BoonEffect {
  // stats (applyBuffs)
  damage?: number;
  manaRegen?: number;
  lifeRegen?: number;
  maxLife?: number;
  tempo?: number;
  lifesteal?: number;
  bloodPrice?: number;
  // stats before stats exist (diveStats)
  attune?: { role: 'primary' | 'secondary'; points: number };
  knobs?: KnobsData;
  // the damage path
  byKind?: Partial<Record<'light' | 'medium' | 'heavy' | 'hold', number>>;
  firstMove?: number;
  stepBonus?: number;
  lowLife?: { below: number; mult: number };
  nearFoes?: { per: number; cap: number; radius: number };
  // defence and tempo
  dodgeCharges?: number;
  dodgeWindow?: number;
  dodgeRecharge?: number;
  perfectAlways?: true;
  freeCast?: { seconds: number; damage: number };
  defendDuration?: number;
  barrierOnFloor?: number;
  healOnClear?: number;
  lastStand?: { below: number; reduce: number; seconds: number };
  // loot and the dive
  find?: number;
  magnet?: number;
  metalUp?: number;
  flux?: number;
  runes?: number;
  gear?: number;
  scrap?: number;
  deathLoss?: number;
  potions?: true;
  noPotions?: true;
  eliteChance?: number;
  skip?: number;
  // the floor
  exitRevealed?: true;
  shrinesLastDive?: true;
  noSlow?: true;
  hazardsFriendly?: number;
}

export interface BoonTier { text: string; effect: BoonEffect }

export interface BoonDef {
  id: BoonId;
  name: string;
  family: BoonFamily;
  duration: 'dive' | 'floor';
  cap: 1 | 2 | 3;
  minDepth?: number;
  /** A sanctum's draw weight; absent: never a shrine. */
  shrine?: number;
  /** A stop's draw weight by tier; all 0: never at a stop. */
  weight: { common: number; rare: number; epic: number };
  tiers: [BoonTier, BoonTier, BoonTier];
}

/** A boon on the hero (`HeroEntity.floorBuffs`, `diveBuffs`, `DiveState.diveBuffs`). */
export interface Buff { boon: BoonId; tier: BoonTierIndex; effect: BoonEffect }

export interface BoonOffer { id: BoonId; tier: BoonTierIndex }

/** `buffSum`'s combined view (spec §2), kept on `HeroEntity.boon`. Absent fields: neutral. */
export type BoonSum = Omit<BoonEffect, 'knobs' | 'attune'> & {
  knobs: KnobsData[];
  attune: { primary: number; secondary: number };
};
```

- `types/floor-map.ts`: `Buff` and `ShrineEffect` are removed there and re-exported from `types/boon.ts` (`export type { Buff } from './boon.js'`) so old imports keep compiling; `ShrineDef` and `ShrineId` are deleted; `Interactable.shrine` becomes a `BoonId`.
- `types/delve.ts`: `DiveStop = { kind: 'boons'; offers: BoonOffer[]; taken: boolean } | { kind: 'powerups'; offers: StopKind[]; taken: boolean; required?: boolean }`. `DoorMods.boons?: number`. `version: 13`.
- `delve/stops.ts`: `StopAction` gains `| { kind: 'boon'; index: number }`; in A, `takeStop` refuses it ("Not offered at this stop") and `rollStop` returns `kind: 'powerups'` everywhere (B1 switches ordinary stops). Every reader of `stop.offers` narrows on `kind` first.
- `types/arpg.ts`: `HeroEntity.boon: BoonSum`; the `hit` event gains `echo?: true`, set in A where a hit comes from an echo (`landBlow`'s `echo` option, an ability with `replay`). `HitOpts` carries it from those sites.
- `types/delve.ts` `HeroStats.boonKnobs: KnobsData[]`; `delve/hero-stats.ts` `HeroStatsExtra.boonKnobs?: KnobsData[]` (default `[]`), merged into each blow's knobs after its runes, and copied onto `HeroStats.boonKnobs`; `applyBuffs` passes it through.
- `arpg/abilities/resolve.ts`: `resolveAbility` appends `stats.boonKnobs` to its `mergeKnobs` partials.
- `Knobs.stackTime: number` (neutral 0, additive in `mergeKnobs`, in `KnobsSchema`); read in B2.
- `src/delve/boons.ts` (new): `buffSum(buffs: readonly Buff[]): BoonSum` (pure, complete in A, with its tests), `boonCount(buffs, id): number`.
- `src/delve/pair.ts`: `diveStats(registry, profile: Pick<DelveProfile, 'equipped' | 'pair' | 'dive'>): HeroStats` = `computeHeroStats` with `pairExtra`'s fields plus the dive boons' attunement (roles resolved against the pair; a secondary while unbound to the primary) and their knob partials. `beginFloor` and `takeAlcove`'s `refreshWorldHero` use it; `profileStats` is unchanged.
- `data/boons.json` (new): the six shrine rows, in `shrines.json`'s order, ids unchanged (`vigor`, `renewal`, `clarity`, `fortune`, `mercy`, `devotion`), `shrine` their old weight, `weight` all 0, `family` `'fortune'` for `fortune` and `mercy`, `'offense'` for `vigor` and `devotion`, `'defense'` for `renewal`, `'tempo'` for `clarity`, `cap` 1, the effect copied into all three tiers. `shrines.json` and its schema deleted. `registry.getBoons()`, `getBoon(id): BoonDef | undefined` (never throws), `shrineBoons()` (the rows with `shrine > 0`, file order). `src/index.ts` exports every type and const in `types/boon.ts`, `buffSum`, `boonCount` and `diveStats`.
- **Boon ids** (B1's rows): the name in lower kebab case, without the apostrophe: `keen-edge`, `heavy-hand`, `opener`, `closer`, `executioner`, `pack-breaker`, `catalyst`, `saturate`, `lingering-mark`, `pure-flame`, `second-flame`, `third-wind`, `perfect-form`, `bulwark`, `stone-skin`, `deep-breath`, `vampires-tithe`, `last-stand`, `quickstep`, `swift-hands`, `free-cast`, `echo`, `overflow`, `magpie`, `wide-net`, `prospector`, `flux-nose`, `rune-sense`, `scrapper`, `insurance`, `glass-cannon`, `blood-price`, `hunted`, `no-retreat`, `famine`, `deeper-still`, `cartographer`, `sanctuary`, `trailblazer`, `arsonist`.
- **Selectors:** the stop's step `data-testid="stop-boon"`, each card a button with `data-boon={id}` and `data-tier={1|2|3}`; the HUD tile `data-buff="boon"` with `data-boon={id}` and `data-count`; the summaries' `data-testid="dive-boons"`.
- `balance.json → delve.boons`: `{ "offers": 3, "tierWeights": [...] }` as the spec's §4; `BoonsBalanceSchema`.
- `data/boons-check.ts`: `boonsProblems(registry)` with the checks that hold in A (unique ids, tier text, knob keys, roles, cap); B1 adds the family and identical-tier checks with its rows.

## Shared conventions

- One worktree an area: `git worktree add ../alloy-boons-<area> -b boons/<area> boons/main`. Remove only with `rmdir /s /q` from cmd then `git worktree prune` (never `git worktree remove --force`: it follows the `node_modules` junctions).
- One commit a task, ending with the attribution trailer. Never push or merge an area branch yourself.
- Keep line endings (the repo is CRLF in places). Prettier only with `--end-of-line auto`. Never reformat `balance.json`, `dive.ts`, `autopilot.ts`, the `delve-pacing*.test.ts` files, `CLAUDE.md` or the specs.
- Engine tasks run the engine typecheck and the files they touch: `cd packages/engine && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot`. The whole engine suite (about 12 minutes) runs at each area's last task. Rebuild the bundle before any client check: `cd packages/engine && npx tsup`.
- Client tasks: `cd packages/client && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot`.
- **The fingerprint** (Phase A and every B task that must not move play): a whole-autopilot hash, as in `docs/superpowers/plans/2026-10-04-delve-room-objects/01-contract.md` "The fingerprint, before", saved under the session's scratchpad and never committed. A must leave it identical. B2 and B3 tasks must too while no boon is worn (B1 changes stops, so B1's later tasks and D re-measure instead).
- No save migrations: v12 resets.
- Pacing and E2E run in D only (`feedback_test_scope_tokens`).

## Integrator notes

- **C2 (HUD):** drafted (8 tasks). Shared helper `features/delve/boons-text.ts` (`wornBoons`, `boonsLine`) for the HUD, the pause and the summary. Family glyphs: offense `attack`, element `rune-elemental`, defense `barrier`, tempo `rune-tempo`, fortune `chest`, pact `skull`, floor `door`. Help has no dive topic: the line goes in the banking topic. C1: a family colour map lives only in `stop/boon-style.ts` (`BOON_STYLE`); C2 imports it if it ever wants one.
- **C3 (perf):** drafted (6 tasks, 13 new tests). C3 also owns `shared/utils/sound-manager.ts` (an optional `gain` argument on `play`/`playSound`; `ECHO_GAIN = 0.5`). `hitFxPicks(events, budget)` in `fx/mana-fx.ts`; the renderer sends the pixel floor the frame's events minus unpicked hits, so `pixel/arena-effects.ts` is untouched. `training/frame-window.ts` + `FrameChip.tsx`. Echoes emit no `basic` or `cast` event today (the only camera kicks); if A or B2 ever makes one, guard `kickCamera` with `!e.echo`. D: CLAUDE.md lines for the budget, echo hit-stop/shake/sound and the chip.
- **D (finish):** drafted (7 tasks). Perf gate on an epic bow (Split and Multi-shot fit only bows and wands): Echo/Split/Multi-shot III on a two-move Volley Primary and every blow, Hunted and Echo worn at epic, mana refilled each step. E2E D14 in `e2e/delve.spec.ts`. The 16-seed pacing read uses a temporary sweep file (never committed). Version 0.69.2 → 0.70.0. CLAUDE.md placeholders `{{...}}` filled from the pacing and frame tasks.
- **C1 (stop screen):** drafted (7 tasks). `BOON_STYLE` family colours (offense `#e43b44`, element `#b55088`, defense `#8b9bb4`, tempo `#feae34`, fortune `#fee761`, pact `#a22633`, floor `#3e8948`); cards carry `data-testid="boon-card"`, `data-boon`, `data-tier`, `data-family`. A names the union's halves `BoonStop` / `PowerupStop`. The store's boon-take test lands `it.skip`: **D un-skips it once B1 merges**, and turns `e2e/delve.spec.ts`'s `stop-powerup` check (about line 151) into the take-a-boon case (D14), with TY02 and the responsive probe over `stop-boon`.
- **B3 (world fields):** drafted (9 tasks, one file `tests/delve-boons-world.test.ts`). Prospector and Flux Nose apply to foe drops and vault chests, not prop drops (decided). Routed to B2: the `gear` multiplier in `combat.ts`'s `dropLoot`; Obsidian/Guard extension keeps the later `until` so Stone Skin's floor barrier survives. **Integrator:** Task 7 edits one line in `action.ts` (no area owns it: Trailblazer through `groundSpeed`). (C2's Task 3 draws a floor-long barrier as `Barrier, this floor`, no seconds.) A must set `hero.boon = buffSum(diveBuffs)` in `createHeroEntity`, and `applyShrine` takes a `BoonDef` and refreshes `hero.boon`.
- **B1 (stop):** drafted (8 tasks). The 40 rows after `devotion`; door `mods.boons` (gilded 0.5, champions 0.3) in `delve.json` (B1 owns that edit); `stopRowProblems`; `rollBoons`; the stop switch and `boon` take (Task 4: **the fingerprint changes here**, and `delve-runes.test.ts`'s 40-seed power-up pin is deleted); the bot's pick; `EconomyDive.boons`; the Economy view's chart and column. **A must** narrow every reader of `stop.offers` on `kind` (`bestStop`, `takeBestAlcove`, `takeGuidedStop`, `run.stops`, `chooseDoor`, `runStop`) and export `BOON_FAMILIES`. Routed to C1: the `doorTerms` line for `mods.boons` and client tests reaching a stop through `completeFloor`. **D:** likely to move: `delve-pacing`, `delve-pacing-robust`, `delve-pacing-pairs`, `delve-pair`'s seeded reaction test, `delve-autopilot-crafting` (timeouts).
- **B2 (combat fields):** drafted (11 tasks, one file `tests/delve-boons-combat.test.ts`). The step bonus is a function, not `ResolvedChain.stepBonus`: `stepBonus(bal, index, extra = 0)`. Defend's duration lives in `forms.ts`'s `buff` closure. B2 also edits a few lines in `basic.ts` and `forms.ts` (no other area touches them), adds `freeCastUntil`, `lastStandUsed`, `lastStandUntil` and `windup.free` to `types/arpg.ts`, and exports `dodgeMax`, `dodgeRecharge`, `lifeCost` from `src/index.ts`. **Integrator:** one line in B3's `world.ts` — `createHeroEntity` sets `dodgeCharges: dodgeMax(bal, boon)` — applied at B2's merge. Guard keeps today's rule except for an `Infinity` barrier (a `Math.max` there would change play). Routed to C2: the HUD's dodge max and refill through the helpers (after B2 merges).
- **A (contract):** drafted and **checked on a scratch copy** of d3b5e447 (10 tasks). **Main already fails 2 tests in `delve-pacing-robust`** before any change: base engine 1699 passed, 2 failed, 5 skipped of 1706 (132 files); after Task 9 1739 / 2 / 5 of 1746 (141 files); client 1361 in 146 files, before and after. Fingerprint identical after Tasks 2, 4, 5, 6, 7, 9 (the probe maps the new Buff and stop shapes back to the old before hashing). Additions to the contract: `BoonsBalance`, `PowerupStop` / `BoonStop`, `KnobsSchema` exported; the door's `boons` is inline in both schemas (no named `DoorModsSchema`); `buffSum` sums an object field's bonus part and takes the largest threshold. `arena/useArena.ts`'s dive hero refresh moves to `diveStats` (Task 10). Never run Prettier on `autopilot.ts`, `dive.ts`, `hero-stats.ts`, `delve-autopilot-crafting.test.ts`. Routed: B1 sets door `boons` in `delve.json` and replaces A's boon-refusal test in `delve-boons-a-stop`; B2 refreshes `h.boon` wherever it adds a buff.
- **A executed** on `boons/main` (04207a0b..79404b17, 11 commits; engine 1740 passed / 2 known failures / 5 skipped, client 1361; fingerprint identical). Spec ✅ (plus 79404b17: an echoed shot's Chain jumps flagged; an echo never reaches Twin Fang). Quality approved. **Minor, for D's cleanup:** `refreshWorldHero`'s doc still says `profileStats`; `byKind` should be `Partial<Record<MoveKind, number>>` (type and schema); `dive.ts:834`'s long line; a banked Devotion mid-floor now refreshes the hero (idempotent). **Routed to B3:** `dive.ts`'s `heroMaxHp` (~499) moves to `diveStats` so B2's `maxLife` carries between floors. B1's `shrineRowProblems` covers knobs/attune on shrine rows.
- **C1, C2 executed and reviewed** (spec ✅, quality approved; small fixes applied). **At their merge (integrator):** move `stop/boon-style.ts` to `features/delve/boon-style.ts`, add `glyph: GlyphId` to each `BOON_STYLE` entry (C2's `FAMILY_GLYPH` values), delete `FAMILY_GLYPH` from `BuffRow.tsx`, and tint the HUD tile's glyph with the family colour (the border stays gold/cyan by duration); fix `boon-style.ts`'s doc comment to match. **Stash incident:** git's stash is shared across worktrees; B2's and C3's stashes crossed and were restored with the user's approval from stash commits b1d9244f / b908a13f. Never use `git stash` in parallel worktrees.
