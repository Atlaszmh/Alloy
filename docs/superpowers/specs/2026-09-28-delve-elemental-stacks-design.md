# Delve Elemental Stacks Design

**Date:** 2026-09-28
**Status:** Draft.
**Follows:** `2026-09-28-delve-pair-reactions-design.md` (v0.44.0, binary marks) and the DPS Lab (`2026-09-28-delve-dps-lab-design.md`). Stage 2 of the skill refactor; stage 3 (moves and chains) builds on the stack counts this stage defines.

**Engine** (`packages/engine/`):
- `src/types/arpg.ts`, `src/types/delve.ts`, `src/arpg/world.ts`
- `src/arpg/combat.ts`, `src/arpg/step.ts`, `src/arpg/basic.ts`, `src/arpg/abilities/impact.ts`, `src/arpg/abilities/defend.ts`, `src/arpg/abilities/resolve.ts`
- `src/data/balance.json`, `src/data/schemas.ts`, `src/data/arpg.json` (texts)
- tests: `tests/delve-stacks.test.ts` (new), `delve-reactions.test.ts`, `ability-status.test.ts`, `arpg-sim.test.ts`, `delve-infusion.test.ts`, `delve-pair.test.ts`, `delve-dps-sim.test.ts`, `delve-pacing.test.ts`

**Client** (`packages/client/src/features/delve/`):
- `arena/fx/draw-world.ts`, `arena/fx/reactions.ts`, `arena/ArenaRenderer.ts`
- `training/meter.ts`, `training/MeterView.tsx`, `AbilitiesPanel.tsx`, `ManaChoice.tsx`

## Goal

Elemental marks become **stacks**. Every hit applies stacks of its element to the foe; stacks of two different elements pair off to fire the pair's reaction, once per pair for damage, once in total for effects; leftover stacks stay on the foe. The stack count *is* the status and its intensity, so a foe with 3 fire stacks burns harder than one with 1. The player builds combos across moves: two quick fire blows leave 2 fire stacks, a medium frost hit applies 2 frost stacks and pairs them all off into a double Melt.

## Decisions

| Question | Decision |
|---|---|
| Can a hit's own stacks pair with each other? | No. A hit's stacks pair only with stacks already on the foe from earlier hits. A fused ability sets up on one hit and pairs on the next. |
| What is a stack? | One counter per element per foe. The count is the status and its intensity; consuming a pair spends both statuses. |
| Several pairs at once | All matching pairs go at once. Damage reactions multiply per pair; effect reactions fire once. |
| How stacks build and fade | Every hit applies (no 30% roll any more). Each element caps at 5 per foe and has one timer that any new stack of it refreshes; at the timer all of that element's stacks lapse together. |
| Fused abilities reacting every hit | A per-foe reaction lockout: after a reaction fires on a foe, none fires on it for 1 s. Stacks still build meanwhile. |

## The model

### State (`StatusState`)

Per foe:
- `stacks: Record<ManaType, number>` (0..cap) and `stackUntil: Record<ManaType, number>`: the count and timer per element.
- `burnRef`, `poisonRef`: the strongest applying hit's damage × `status.burnDps` / `status.poisonDps`, as today's `burnDps` / `poisonDps` (renamed), plus `burnTickAt`, `poisonTickAt`, `burnSlot`, `poisonSlot` as today.
- `freezeUntil`, `freezeImmuneUntil`, `staggerUntil`, `staggerImmuneUntil`, `rootUntil`, `rootImmuneUntil`, `blindUntil`, `brandUntil`, `sunderUntil`: unchanged.
- `reactionLockUntil`: the per-foe lockout.

Removed: `burnUntil`, `chillStacks`, `chillUntil`, `shockUntil`, `hexUntil`, `rattledUntil`, `poisonStacks`, `poisonUntil`. `emptyStatus()` (`world.ts`) starts every count and timer at 0.

### What the count does (the status)

Per-stack values are set so 2 stacks ≈ today's effect. Every "while" below means `stacks[el] > 0` (the timer keeps the count alive; at `stackUntil` the count drops to 0).

| Element | While stacked | Per-stack value (`delve.stacks`) |
|---|---|---|
| Fire | burns: `burnRef × stacks × firePerStack` per second, ticking every 0.5 s as today | `firePerStack` 0.5 |
| Frost | slowed by `min(frostSlowCap, stacks × frostSlowPerStack)`; **reaching `freezeAt` stacks freezes** for `status.freezeDuration` with today's immunity; while immune no re-freeze happens, and the stacks stay | `frostSlowPerStack` 0.2, `frostSlowCap` 0.6, `freezeAt` 3 |
| Storm | takes `+stacks × shockPerStack` damage (Tempest doubles it) | `shockPerStack` 0.1 |
| Earth | rattled (the mark). Stagger stays a separate crowd control that Earth hits also apply, with its immunity | — |
| Shadow | takes `+stacks × hexPerStack` damage | `hexPerStack` 0.075 |
| Nature | poisoned: `poisonRef × stacks` per second, as today | cap ×2 with Plaguebearer |

The predicates keep their names (`isBurning` = fire > 0, `isChilled` = frost > 0, `isFrozen` as today, `isShocked`, `isHexed`, `isRattled`, `isPoisoned` = nature > 0); `hasMark(el)` = `stacks[el] > 0`.

### Stacks per hit

`applyStacks(ctx, m, element, n, ref, slot)` adds `n` (capped), refreshes `stackUntil[element] = t + duration[element]`, updates the ref under the DPS Lab's rule (`!active || ref >= current` also moves the slot), and for frost checks the freeze threshold.

| Source | Stacks | Balance key |
|---|---|---|
| Ability hit, by weight (Swift, Light, Balanced, Heavy, Crushing) | 1, 1, 2, 3, 3 | `byWeight` |
| Basic blow | 1 | `basicBlow` |
| Basic finisher (and its discharge of the secondary) | 2 | `basicFinisher` |
| Zone tick, ember, chain jump, Surge's statuses on a blow, the Defensive's retaliation, Rimeheart's chill | 1 | `tick` |
| Reaction splash | 0 | as today (`noReact`, applies nothing) |

The element knobs `burn`, `chill`, `shock`, `hex`, `poison` and `stagger` in `arpg.json` mean "this element's stacks" (`stagger` also applies the stagger CC). `BASIC_STATUS`, the 30% basic roll and Earth's 18% go: every blow applies its element. Crushing's `heavyStagger` and the riposte apply stagger only (no Earth stacks), as today's rattle rule. Bedrock adds stagger only. Glacier's `freeze` knob applies `freezeAt` frost stacks (capped), so it still freezes outright. Steam's blind, Hellfire's brand, Overgrowth's root, Soulfrost's execute (needs frozen) are unchanged. Plague's spread copies the dying foe's nature and shadow counts to neighbours (capped); Inferno's corpse flames copy its fire count.

### Pairing

On a hit of element E that isn't `noReact`:
1. Take `before[F]` = each element's count before this hit.
2. `total_E` = `min(cap, before[E] + k)` where `k` is this hit's E stacks.
3. Walk F over `MANA_TYPES` (fire, frost, storm, earth, shadow, nature), skipping E. The first F with `before[F] > 0` whose reaction can fire pairs: `n = min(total_E, before[F])`. A reaction can't fire while the foe's `reactionLockUntil` runs, while a buff reaction's hero-side cooldown runs, or for Earth on a foe that is chilled but not frozen (Shatter needs the freeze).
4. If `n > 0`: the reaction fires with `n` (below), and `reactionLockUntil = t + reactionLockout`.
5. Damage is dealt (the reaction's multiplier scales this hit, as today).
6. If the foe survived: this hit's stacks are applied (all the elements it carries), then `n` is removed from E and from F; a count at 0 ends its status (a burn stops, a slow ends).

A fused hit carries stacks of both its elements, but only `before[]` counts as "earlier", so it never pairs with itself. `useUpMark` becomes `consumePairs(m, E, F, n, reaction)`.

**Freeze rules stay:** Melt ends a freeze (and takes the pairs); Shatter from an Earth hit needs a frozen foe and ends the freeze; Superconduct keeps a freeze it finds and adds its own if none. Soulfire and Blight now consume their pairs like every other reaction (`consumes` leaves `arpg.json`).

### Reaction strength

| Reaction | With `n` pairs |
|---|---|
| Melt | hit × (1 + (meltMult − 1) × n × catalyst) |
| Shatter | hit × (1 + (shatterMult − 1) × n × catalyst) |
| Overload | the blast is hit × overloadMult × n × catalyst |
| Combust | hit × (1 + (combustMult − 1) × n × catalyst), splash likewise |
| Crystallize | hit × (1 + (crystallizeMult − 1) × n × catalyst); neighbours get 1 frost stack once |
| Superconduct, Soulfire, Blight, Obsidian, Lightning Rod, Sunder, Seedling, Siphon, Blackout, Galvanize | once, whatever `n` (Soulfire heals from the hit; Obsidian's barrier from the hit) |

The `reaction` event and the `hit` event's `reaction` gain `pairs: n`.

### Per-foe lockout

`reactionLockout` (1 s) on `status.reactionLockUntil`. While it runs, step 3 finds nothing, stacks build on both sides, and the next hit past the lockout pairs a bigger `n`. The hero-side cooldown on the five buff reactions (`reactionReadyAt`) stays.

### Balance

New block `balance.json → delve.stacks` (typed in `DelveBalance`, validated in `schemas.ts`):
`cap` 5, `duration` {fire 3, frost 4, storm 4, earth 4, shadow 4, nature 4}, `byWeight` [1, 1, 2, 3, 3], `basicBlow` 1, `basicFinisher` 2, `tick` 1, `freezeAt` 3, `firePerStack` 0.5, `frostSlowPerStack` 0.2, `frostSlowCap` 0.6, `shockPerStack` 0.1, `hexPerStack` 0.075, `reactionLockout` 1.0.

`delve.status` loses `burnDuration`, `chillSlow`, `chillDuration`, `chillToFreeze`, `shockBonus`, `shockDuration`, `hexBonus`, `hexDuration`, `rattleDuration`, `poisonDuration`, `poisonMaxStacks` (moved or replaced above) and keeps `burnDps`, `poisonDps`, `freezeDuration`, `freezeImmunity`, stagger, root and blind. `delve.reactions` is unchanged.

Timers and caps against measured hit rates (depth 10, one dummy, 30 s hold; the probe is `scratchpad/stack-rates/report.md`): blows per second are wand 1.93, dagger 1.83, bow 1.27, sword 1.20, staff 1.07, axe 0.90, maul 0.63, with the finisher about a third of them, so the fastest weapons reach the cap in 2–3 s and the maul's 1.6 s between blows keeps even fire's 3 s timer alive. A mana-paid Balanced Bolt casts 1.37 times a second (2 stacks each) and caps in about 2 s; Ultimates cast 2–4 times in 30 s (3 stacks each) and rarely cap alone.

**Basics burn far more often than today.** Today a blow applies its status on a 30% roll (measured 0.30–0.31 burns per blow over 40 seeds), at the blow's full strength. Now every blow applies 1 stack at half strength, and five blows reach 2.5× today's burn. The DPS Lab before/after (below) is where that lands; `firePerStack` (and the other per-stack values) is the first knob, and the basic stack stays 1 per blow, because two quick blows leaving 2 stacks is the point.

### Unchanged

The 15 reactions' effects, `getReactionFor` and the fixed walk, discovery and `reactionsSeen` (no save change), the hero-side buff cooldown, monsters applying nothing to the hero, dummies (a lethal hit resets them and they still take stacks), determinism (no new rng), and the DPS Lab's attribution (`burnSlot`/`poisonSlot` follow the ref rule).

## What you see

- **Stack pips.** `drawMonsterMarks` draws, per element with a count, a row of mana pixels in the element's colour, one pip per stack (up to 5), stacked in element order under the foe. They replace the hex motes, shock ring, poison dust and rattle chips. The burn flicker and frost tint stay, freeze still holds the sprite, and the brand, sunder, blind, root and stagger marks stay.
- **Label.** A reaction that consumed more than one pair floats "MELT! ×2" (`ArenaRenderer` from `hit.pairs`); `reactionFx` is unchanged.
- **Training meter.** Reaction counts sum the pairs consumed. The reactions list, `MeterView`'s note and the `AbilitiesPanel`/`ManaChoice` texts say stacks ("3 frost stacks freeze", "every blow applies a stack").

## Testing

**Engine** (`tests/delve-stacks.test.ts`):
- Build: a blow applies 1, a Balanced ability 2, a Crushing one 3, a finisher 2; the cap holds; a new stack refreshes the timer; at the timer all of that element's stacks lapse together; every blow applies (no roll).
- Status: burn per second scales with fire stacks and stops at 0; slow scales and caps; 3 frost stacks freeze with immunity, stacks stay, no re-freeze while immune; shock and hex bonuses scale; rattled while earth ≥ 1; poison as today with the cap and Plaguebearer.
- Pairing: earlier-only (a fused hit doesn't pair with itself, the next hit does); the fixed order with two other elements present; `n = min`; leftovers stay; Earth on a chilled-not-frozen foe walks on.
- Strength: each damage reaction's bonus is × n (n = 1, 2, 3); each effect reaction fires once with n = 3; Catalyst scales the bonus.
- Lockout: a second reaction within 1 s doesn't fire, stacks build meanwhile, and the next past the lockout pairs the bigger n. The hero-side buff cooldown still applies.
- Consuming: a status ends at 0; Melt ends a freeze; Shatter needs the freeze and ends it; Superconduct keeps it; Soulfire and Blight consume.
- All 15 reactions both ways with stacks; `pairs` on the events; determinism (same seed, same events twice).
- The existing reaction, status, sim, infusion, pair and DPS-sim tests are updated to stacks, not weakened.

**Pacing** (`tests/delve-pacing.test.ts`): the rails hold unchanged, including each run finding its own pair's reaction and the 15-pair sweep. Tuning order: the per-stack values, then `reactionLockout`, then `cap`/`duration`, then nothing else without asking.

**DPS Lab before/after** (scratch script over `dpsCombos`, depth 10, one dummy and the pack, before and after): single-element basics stay within about 15% of today; a Nature+Fire Burst against the pack falls under about twice its unpacked figure; no pair vanishes from the top of the basics table. The shifts go in this spec's status note when it ships.

**Client:** pips per count and element; the ×n label; the meter's pair sums; the texts.

**Release:** v0.45.0 (`chore(client): bump version to 0.45.0`); CLAUDE.md's reactions bullet says stacks; a superseded note on the pair-reactions spec's Marks and Using-up sections.
