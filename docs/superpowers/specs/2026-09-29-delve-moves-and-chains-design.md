# Delve Moves and Chains Design

**Date:** 2026-09-29
**Status:** Draft.
**Follows:** `2026-09-28-delve-elemental-stacks-design.md` (v0.45.0). Stage 3 of the skill refactor. Stage 4 (weapon slot caps and acquired modifiers) builds on the chain caps this stage introduces.

**Engine** (`packages/engine/`):
- `src/types/ability.ts`, `src/types/delve.ts`, `src/types/arpg.ts`
- `src/arpg/abilities/resolve.ts`, `cast.ts`, `forms.ts`, `impact.ts`, `defend.ts`, `targeting.ts`; `src/arpg/world.ts`, `step.ts`, `basic.ts`, `action.ts`, `dodge.ts`, `bot.ts`, `sandbox.ts`, `dps-sim.ts`, `combat.ts` (Nightstalker, Galvanize)
- `src/delve/hero-stats.ts`, `profile.ts`, `profile-schema.ts`, `pair.ts`, `autopilot.ts`
- `src/data/arpg.json`, `delve.json`, `balance.json`, `schemas.ts`, `src/index.ts`
- tests: `tests/delve-chains.test.ts` (new); updated: `ability-forms`, `ability-resolve`, `ability-cast`, `delve-combat-weight`, `delve-training`, `delve-pair`, `delve-reactions`, `delve-profile-abilities`, `delve-infusion`, `delve-stacks`, `delve-dps-sim`, `delve-dodge`, `delve-manual-attack`, `fixtures/arena.ts`, `delve-pacing`

**Client** (`packages/client/src/`):
- `features/delve/AbilitiesPanel.tsx` (the chain builder), `features/delve/chains/` (new: `ChainEditor.tsx`, `MoveEditor.tsx`, `chain-text.ts`), `ManaPanel.tsx`, `training/TrainingPanel.tsx`, `pages/DelveCamp.tsx`
- `features/delve/arena/{ArenaHud.tsx, useArenaCore.ts, input.ts, ArenaRenderer.ts, fx/anticipation.ts, fx/draw-world.ts, fx/mana-fx.ts, fx/lifecycles.ts}`, `features/gamepad/arena-pad.ts`, `features/controls/controls.ts`
- `stores/delveStore.ts`, `stores/sandboxStore.ts`, `features/delve/lab/` (dims), `e2e/delve*.spec.ts`

## Goal

Every skill (Basic, Primary, Defensive, Ultimate) becomes a **chain of moves**. A move has a kind (light, medium, heavy, or hold), a form from the skill's list, and one or two elements from the hero's pair; a basic blow has a kind and an element. Each press casts the chain's next move; a hold move charges while the button is held and fires on release. The player builds combos across skills and across moves, on top of the stacks from stage 2: two quick fire blows, a medium frost Bolt, a double Melt.

## Decisions

| Question | Decision |
|---|---|
| How a chain plays | Each press casts the next move within the combo window; a pause restarts at move 1; a held button repeats presses (hold-to-repeat), so it flows through the chain at the moves' cadence. Basics auto-chain as today. |
| Hold | A fourth kind: holding the button charges (rooted, mana gathering), releasing fires. Three charge stages over `holdTime`, mapping to weights 0, +1, +2, so a tap is a medium hit and a full hold is beyond heavy. |
| What a slot holds | Kind, form (from that skill's list) and elements (from the pair), per move. Payment stays one per skill. Acquired modifiers are stage 4. |
| Basics | Per blow: kind and element (either of the pair). The weapon owns melee-or-bolt, tempo, arc, range, and a feel table per kind. The last blow is no longer special. |
| Caps | Up to 5 moves per skill, the cap held per skill on the profile. This stage: every cap starts at the balance default (5). Stage 4 sets starting caps and growth by investment (crafting, experience, or both). |
| Migration | Save v5. An ability migrates to its form's default chain (Bolt's presses become light, light, medium, heavy) shifted by the old weight; basics to the weapon's default chain with the last blow on the secondary. |

## The model

### Types

```ts
type MoveKind = 'light' | 'medium' | 'heavy' | 'hold';           // MOVE_KINDS in that order
interface Move { kind: MoveKind; form: FormId; elements: ManaType[] }  // 1–2 distinct elements
interface Chain { moves: Move[]; payment: AbilityPayment }        // 1..cap moves
interface Blow { kind: MoveKind; element: ManaType }
type ChainSkill = 'basic' | AbilitySlot;                          // CHAIN_SKILLS: basic, primary, defensive, ultimate
interface Chains { basic: Blow[]; primary: Chain; defensive: Chain; ultimate: Chain }
DelveProfile.chains: Chains; DelveProfile.chainCaps: Record<ChainSkill, number>;
```

`AbilitySlot` stays the three ability slots (0, 1, 2 keep their meanings everywhere); the basic chain feeds the weapon, not a slot. `AbilityBuild`/`AbilityBuilds` survive only in the frozen v3/v4 save schemas and the migration.

**Kind → weight.** `chains.kindWeight` = light −1, medium 0, heavy +1. Every existing per-weight table (power, cost, cooldown, conjure, recovery, heft, size, speed, stacks `byWeight`) is read through it, so nothing is retuned. Swift (−2) and Crushing (+2) are no longer fixed picks; hold's stages reach 0, +1 and +2.

### Resolving a chain

`resolveChain(registry, stats, slot, chain) → ResolvedChain { moves: ResolvedAbility[]; payment; hold: ResolvedAbility[][] }`. Each move resolves through today's `resolveAbility` at its kind's weight with the chain's payment; a hold move resolves three times (weights 0, +1, +2) and `hold[i]` holds them. The form's `combo` multipliers and `comboCount` leave the data: a chain's escalation is its kinds, and Volley's dart count becomes `countByKind` on the form (3, 3, 5, 5). `stepHeft`'s +0.2 on the last press of a 2+ chain stays, keyed on the chain's length.

The hero holds `chains: ResolvedChain[]` (index = slot). `nextMove(h, slot, t)` is the move the next press would cast (honouring the combo window; the chain wraps after its last move), `activeMove(h, slot)` the move winding up, holding, or, for the Defensive, the one whose effect is up. Every reader of `h.abilities[slot]` today (the bot's range check, `defendingAbility`, Nightstalker, Galvanize, the HUD snapshot, `refreshWorldHero`, the DPS sim) reads one of those; `h.abilities` goes.

### Chain play

- **Stepping.** `pressStep` keeps its rule against the chain's length: within `comboWindow` (1.2 s) of the last move landing, the next move; otherwise move 1. `comboStep`/`comboAt` per slot as today.
- **Payment.** One per chain. Each move pays its own resolved cost through it: mana at the press, charge from the slot's meter (`chargeNeed` is the *next* move's need; the meter fills toward it), cast with its channel and discount. A move that can't be afforded is refused as today (`noMana`), and the chain doesn't advance.
- **Cooldown** is per slot, set to the landed move's cooldown, so the next press waits for it as press-combos do today.
- **Wrapping.** After the last move the next press within the window is move 1 again. A Defensive chain's next press replaces the active defensive with the next move's effect (`h.defend` is cleared as a changed Defensive is today).

### Hold

- **Input.** `ArpgInput` gains `holding?: number | null`: the ability slot whose button is held this tick. `cast` stays the press edge for every move and the *release* edge for a hold move. The client sends `holding` while a button is down and `cast` on release (keyboard, HUD button and controller already fire on release or the press edge; see the client section).
- **Charging.** When `holding` names a slot whose `nextMove` is a hold and the hero is free (no wind-up, dash or swing) and the move is affordable at stage 0, `h.hold = { slot, start, aim }` begins. While it runs the hero is rooted like a wind-up, the anticipation FX gather mana, and the combo window is paused (the `comboAt` clock stops). `charge = min(1, (t − start) / holdTime)`; the stage is 0, 1 or 2 by `holdStages` ([0.33, 0.66]). A `holdStage` event fires when the stage rises.
- **Release.** A `cast` for that slot while `h.hold` runs fires `hold[stage]` at the release aim, paying that stage's cost and setting its cooldown and stacks. Past `holdMax` (2 s) it fires by itself at stage 2. A dodge cancels it, unpaid. If `holding` stops without a `cast` (a lost release), it fires at the current stage. A hold that can't be afforded at its stage's cost on release fires at the highest stage it can afford (never lower than stage 0's refusal, which cancels).
- **Hold-to-repeat.** A held button doesn't re-press while the next move is a hold: the client sends `holding` instead. So "quick, quick, hold, heavy" under a held button plays quick, quick, then charges until the button lifts, then heavy on the next press.
- **Basics.** A hold blow is a charged attack: in manual attack mode holding the attack button charges it (the same stages); in automatic mode it charges itself to stage 2 (a slower, harder blow in the string).

### Basics

- `GearBaseDef.combo` becomes `GearBaseDef.feel: Record<MoveKind, ComboStepDef>` and `GearBaseDef.defaultChain: MoveKind[]`. The feel table is derived from today's strings so that **the default chain reproduces today's string blow for blow**: light = today's first blow, heavy = today's finisher, medium = today's middle blow where the string has three or more distinct ones, else halfway between light and heavy, hold = the finisher with `startup` × 1.5 and `power` × 1.3 at stage 2 (stages 0 and 1 scale between the heavy blow and that). Default chains: dagger light, light, light, heavy; sword, axe, staff, wand, bow light, light, heavy; maul medium, heavy. The unarmed string in `balance.json → delve.hero.defaultCombo` becomes a feel table and default chain likewise.
- `HeroWeapon` carries `blows: (ComboStepDef & { kind; element; power: number })[]` built from the basic chain and the feel table, where `power` = `1 + basicPowerPerAttune × att[element]` (today's `blowPower`/`finisherPower`, per blow). `element`, `infusion`, `blowPower`, `finisherPower` and `combo` go. `computeHeroStats` takes the chain through `HeroStatsExtra.basic?: Blow[]` (the profile's; the Training Grounds pass their own); with none it uses the weapon's default chain on the pair (last blow the secondary when bound, else the primary).
- `strike` reads the blow's element, power and kind: its status is `BASIC_STATUS[element]`, its stacks `byWeight[kindWeight]` (a hold blow's stage's), Twin Fang still doubles the last blow. The finisher discharge rule and its "always applies" go: every blow applies its element's stack, as stage 2 made it. The `basic` event carries `kind` and `element`.
- `estimateCombat` values the chain: each blow's power × its element's power, summed over the string's time, as today's formula with per-blow terms.

### Save v5

- `DelveProfile.version` 5, `chains`, `chainCaps`; `abilities` goes. `DelveProfileSchema` v5 with `MoveSchema`, `BlowSchema`, `ChainSchema` (1–5 moves; forms of the right slot; 1–2 distinct elements) and `chainCaps` (1–5 each). The frozen v4 schema is kept as `DelveProfileV4Schema` (today's), v3 and v2 as they are; `parseDelveProfile` chains v2 → v3 → v4 → v5.
- **Migration v4 → v5.** Per ability slot: kinds from the form's `defaultChain` (in `arpg.json`, replacing `combo`; derived from the old multipliers: ≤ 0.9 light, ≤ 1.1 medium, else heavy: Bolt L L M H, Volley M M M, Lance M M H, Burst M M H, Strike M M M H; Defensive and Ultimate forms a single medium), each shifted one step lighter for weight −2/−1 and one heavier for +1/+2 (clamped to light..heavy; hold never appears from migration), elements and payment from the build. Basics: the weapon's `defaultChain` with the last blow the secondary when bound, else the primary. Caps: the balance default. The migration's `fixed` notices become per-move (`ChainFix { skill, index, removed, move }`).
- **Ops** (`profile.ts`/`pair.ts`): `setChain(registry, profile, skill, chain)` replaces `setAbility` (refuses mid-dive, more than the cap or fewer than 1 move, a form from another slot, an off-pair or duplicate element, an unknown kind); `defaultChains(registry, element, weaponBaseId)` replaces `defaultAbilities` (Bolt/Ward/Nova as single medium moves on the element, the weapon's default basic chain on it); `fixChainsToPair` replaces `fixBuildsToPair` (per move; an emptied move takes the primary; blows likewise); `chooseStartingMana`, `bindSecondary`, `realign` and `reattune` keep their contracts on the new shapes. The chain caps are written by nothing yet (stage 4 adds the growth).

### Balance

`balance.json → delve.chains`: `cap` {basic 5, primary 5, defensive 5, ultimate 5}, `maxCap` 5, `kindWeight` {light −1, medium 0, heavy 1}, `holdTime` 1.0, `holdMax` 2.0, `holdStages` [0.33, 0.66], `holdStageWeight` [0, 1, 2]. `arpg.json` forms lose `combo`/`comboCount` and gain `defaultChain` and (Volley) `countByKind`. `delve.json` bases lose `combo` and gain `feel` and `defaultChain`. `comboWindow` stays in `delve.abilities`.

### Bot and autopilot

- The bot presses as today, so chains flow. When `nextMove` is a hold it sets `holding` until `charge` reaches 1, then sends `cast`; it never taps a hold.
- `bindBest` sets every move of the Primary chain to `[primary, secondary]`; the sweep and the reactions rail keep their meaning. Defaults come from `defaultChains`.

### DPS Lab

`dpsCombos` enumerates single-move chains: non-Defensive forms × 36 ordered element sets × 4 kinds × 3 payments (3,456), dims `{ form, first, second, kind, payment }`, each on `defaultChains(first, 'sword')` with that slot's chain replaced. A hold move is held to full charge each press (the sim sends `holding` for `holdTime`, then `cast`). Basics: each weapon's default chain × the pair (252, as today). `simulateDps` needs no other change (`hold: 'attack' | { slot }`).

## What you see

- **The chain builder** (`AbilitiesPanel` → `ChainEditor`). The Abilities tab lists the four skills, Basic first, as tabs. A skill shows a row of slot cards, one per move, up to its cap: each card shows the kind (an icon: ▪ light, ▪▪ medium, ▪▪▪ heavy, ◉ hold), the form's icon and name (basics: the weapon's blow), and its element chip(s). Tapping a card opens the move editor below the row: kind chips, the skill's form chips (none for basics), main element and infusion chips from the pair (basics: one element), and the readout (cost, wind-up, stacks). Between the cards: ◂ ▸ to reorder, × to remove (not the last), and a + card while under the cap. Payment chips sit once per ability chain. The summary line reads "light Bolt · light Bolt · heavy Lance" (`chain-text.ts`, shared with the HUD's aria-labels). The Training Grounds' editor is the same component on the sandbox store, unrestricted as today.
- **Controller.** The cards, chips and buttons are focusable; the existing scope/focus nav covers them; the skill tabs get `data-pad-tabs` so LB/RB step skills. Nothing new in the hub.
- **HUD.** Each ability button shows its chain as step dots (the next move's dot lit; `chainStep`/`chainLength` replace `comboNext`/`comboLength`), a kind glyph for the next move, and while holding a charge fill that ticks through the three stages. The manual attack button shows the basic chain the same way. `AbilityHud` gains `nextKind` and `hold: { charge, stage } | null`.
- **Input.** Keyboard: keydown sends `holding` (and starts aiming as today), keyup sends `cast`. HUD buttons: pointer-down `holding`, pointer-up `cast`. Controller: a held RT/LB/R3 sends `holding`; its press edge sends `cast`, except when the HUD snapshot says the next move is a hold, when the *release* edge sends it and hold-to-repeat is suppressed for that slot.
- **Arena.** The anticipation FX read the active move (and grow with the charge during a hold); the `holdStage` event pings a ring; the cast fling, finisher ring and basic swing FX read the blow's kind and element instead of the string's last step. Reaction and stack visuals are unchanged.
- **Texts.** DelveCamp's how-to describes chains; the Training Grounds' "Basic infusion" row becomes "Your secondary" (the basics-only pair's second element, which the basic chain's blows can pick).

## Testing

**Engine** (`tests/delve-chains.test.ts`, plus the updated files):
- Resolve: a chain resolves each move at its kind's weight with the chain's payment; a hold resolves three stages; Volley's `countByKind`; the last-press heft bonus keys on the chain length; `nextMove` honours the window and wraps; `activeMove` during a wind-up, a hold and a defensive.
- Play: presses step through a 3-move chain and wrap; a pause restarts; each move pays its own cost and sets its cooldown; a refused move doesn't advance; a Defensive chain's second press replaces the first's effect; the bot flows through a chain; the DPS sim's held button flows through one.
- Hold: `holding` starts a charge only for a hold next-move, rooted, with the window paused; stages at 0.33 and 0.66 with `holdStage` events; release fires the stage's move with its cost, cooldown and stacks; auto-fire at `holdMax`; a dodge cancels unpaid; a lost release fires at the current stage; an unaffordable stage falls to the highest affordable; a manual-mode hold blow charges and an automatic one fires at stage 2.
- Basics: the feel tables reproduce today's strings for every weapon's default chain blow for blow (timing, power, heft, move, arc, reach, knockback, size, explode, speed, stagger) and for the unarmed string; a blow strikes with its own element and power and applies its kind's stacks; Twin Fang doubles the last blow; `estimateCombat` on the default chain equals today's value.
- Save: v5 round-trips; v4 → v5 migrates every slot to the shifted default chain with the build's elements and payment, and basics to the weapon's default with the secondary last; v3 and v2 still migrate through; `setChain` refuses each bad input; `defaultChains`; `fixChainsToPair` with per-move notices; `chooseStartingMana`/`realign`/`bindSecondary` on chains; caps validated.
- Determinism: same seed, same events twice, chains and holds included.

**Pacing** (`tests/delve-pacing.test.ts`): the rails hold. The bot's builds are the default chains, whose kinds reproduce the press-combos it cycles today. Tuning order if a rail breaks: `kindWeight` (never), so: the forms' `defaultChain` kinds, then `holdStageWeight`, then nothing else without asking.

**DPS Lab before/after** (depth 10, one dummy and pack; the "before" grid from the pre-chains engine): basics unchanged for every weapon and pair (the default chain equals today's string; ±1%); single-move ability chains within ±5% of today's rows at the equivalent weight (light ↔ −1, medium ↔ 0, heavy ↔ +1) for every form, element set and payment; hold at full charge within ±5% of today's Crushing (+2) rows for mana and charge payments. Anything outside is a bug, not a tuning matter.

**Client:** the builder adds, removes, reorders and edits moves within the cap and refuses beyond it; the controller path (tabs, cards, chips); the summary text; the HUD dots, kind glyph and charge fill; keyboard, HUD-button and controller input send `holding`/`cast` as specified; the sandbox store's chains and Load my build; the migration notice text per move.

**E2E:** D01's aria-labels ("Primary: medium Fire Bolt"), D04's builder flow (add a move, pick Wildfire Burst, the summary), D08, G04 (RT hold repeats a non-hold chain), T01.

**Release:** v0.46.0 (`chore(client): bump version to 0.46.0`); CLAUDE.md's ability, basics, stacks and DPS Lab bullets say chains; superseded notes on the ability-system, combat-weight, affinity, stacks and DPS Lab specs' build and string sections.
