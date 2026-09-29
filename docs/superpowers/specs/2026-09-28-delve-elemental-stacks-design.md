# Delve Elemental Stacks Design

**Date:** 2026-09-28
**Status:** Draft.
**Follows:** `2026-09-28-delve-pair-reactions-design.md` (v0.44.0, binary marks) and the DPS Lab (`2026-09-28-delve-dps-lab-design.md`). Stage 2 of the skill refactor; stage 3 (moves and chains) builds on the stack counts this stage defines.

**Engine** (`packages/engine/`):
- `src/types/arpg.ts`, `src/types/delve.ts`, `src/arpg/world.ts`
- `src/arpg/combat.ts`, `src/arpg/step.ts`, `src/arpg/basic.ts`, `src/arpg/abilities/impact.ts`, `src/arpg/abilities/defend.ts`, `src/arpg/abilities/resolve.ts`, `src/arpg/abilities/forms.ts`
- `src/data/balance.json`, `src/data/schemas.ts`, `src/data/arpg.json` (texts), `src/index.ts`
- tests: `tests/delve-stacks.test.ts` (new); updated: `delve-reactions`, `ability-status`, `ability-forms`, `arpg-sim`, `delve-infusion`, `delve-pair`, `delve-training`, `delve-dps-sim`, `delve-dodge`, `delve-combat-weight`, `delve-pacing`

**Client** (`packages/client/src/features/delve/`):
- `arena/fx/draw-world.ts`, `arena/fx/reactions.ts`, `arena/fx/__tests__/reactions.test.ts`, `arena/ArenaRenderer.ts`
- `training/meter.ts`, `training/MeterView.tsx`, `AbilitiesPanel.tsx`, `ManaChoice.tsx`

## Goal

Elemental marks become **stacks**. Every hit applies stacks of its element to the foe; stacks of two different elements pair off to fire the pair's reaction, once per pair for damage and once in total for effects; leftover stacks stay on the foe. The stack count *is* the status and its intensity, so a foe with 3 fire stacks burns harder than one with 1. The player builds combos across moves: two quick fire blows leave 2 fire stacks, a medium frost hit applies 2 frost stacks and pairs them all off into a double Melt.

## Decisions

| Question | Decision |
|---|---|
| Can a hit's own stacks pair with each other? | No. A hit's stacks pair only with stacks already on the foe from earlier hits. A fused ability sets up on one hit and pairs on the next (which may be the next dart of the same Volley, 0.1 s later). |
| What is a stack? | One counter per element per foe. The count is the status and its intensity; consuming a pair spends both statuses. |
| Several pairs at once | All matching pairs go at once. Damage reactions multiply per pair; effect reactions fire once. |
| How stacks build and fade | Every hit applies (no 30% roll any more). Each element caps at 5 per foe and has one timer that any new stack of it refreshes; at the timer all of that element's stacks lapse together. |
| Fused abilities reacting every hit | A per-foe reaction lockout: after a reaction fires on a foe, none fires on it for 1 s. Stacks still build meanwhile. |

## The model

### State (`StatusState`)

Per foe:
- `stacks: Record<ManaType, number>` (0..cap) and `stackUntil: Record<ManaType, number>`: the count and timer per element.
- `burnRef`, `poisonRef`: the strongest applying hit's damage × `status.burnDps` / `status.poisonDps` (today's `burnDps` / `poisonDps`, renamed), plus `burnTickAt`, `poisonTickAt`, `burnSlot`, `poisonSlot` as today. A ref is meaningless while its count is 0 and is replaced by the next application.
- `freezeUntil`, `freezeImmuneUntil`, `staggerUntil`, `staggerImmuneUntil`, `rootUntil`, `rootImmuneUntil`, `blindUntil`, `brandUntil`, `sunderUntil`: unchanged.
- `reactionLockUntil`: the per-foe lockout.

Removed: `burnUntil`, `chillStacks`, `chillUntil`, `shockUntil`, `hexUntil`, `rattledUntil`, `poisonStacks`, `poisonUntil`. `emptyStatus()` (`world.ts`) starts every count and timer at 0. `Zone.applies`, written and never read, goes too.

**Lapsing.** At the top of `monstersTick` (before its dummy `continue`, so dummies lapse too), any element whose `stackUntil` has passed has its count set to 0. Everything else reads `stacks[el]` raw: `before[]`, the predicates, the ticks, the pips.

### What the count does (the status)

Per-stack values are set so 2 stacks ≈ today's effect. "While stacked" means `stacks[el] > 0`.

| Element | While stacked | Per-stack value (`delve.stacks`) |
|---|---|---|
| Fire | burns: `burnRef × stacks × firePerStack` per second, ticking every 0.5 s as today (ticks still skip element power and apply resist and the shock/hex/sunder bonuses, as today) | `firePerStack` 0.5 |
| Frost | slowed by `min(frostSlowCap, stacks × frostSlowPerStack)`; **crossing `freezeAt`** freezes (below) | `frostSlowPerStack` 0.2, `frostSlowCap` 0.6, `freezeAt` 3 |
| Storm | takes `+stacks × shockPerStack` damage: +50% at the cap, doubled by Tempest | `shockPerStack` 0.1 |
| Earth | rattled (the mark). Stagger stays a separate crowd control that Earth hits also apply, with its immunity | — |
| Shadow | takes `+stacks × hexPerStack` damage: +37.5% at the cap | `hexPerStack` 0.075 |
| Nature | poisoned: `poisonRef × stacks` per second, as today | cap ×2 with Plaguebearer |

The predicates keep their names: `isBurning` = fire > 0, `isChilled` = frost > 0, `isFrozen` = `t < freezeUntil` (unchanged), `isShocked`, `isHexed` (Night's Embrace reads it), `isRattled`, `isPoisoned` = nature > 0. `hasMark(el)` = `stacks[el] > 0`, except frost, where a bare freeze counts: `hasMark(frost)` = frost > 0 or frozen (today's "chilled or frozen").

**Freeze.** Frost's threshold fires only on *crossing*: `before < freezeAt ≤ after`. It calls today's `freeze(ctx, m, freezeDuration)` with its boss scaling, Permafrost and immunity; while immune the crossing is ignored. Inside `hitMonster` the check is suppressed per application and evaluated once at the end of step 6, on the final count. A direct `applyStatus` outside a hit (Crystallize's neighbour chill, the Defensive's non-Armor retaliation, the test fixtures) evaluates the crossing itself, with `before` the count on entry and `after` the count on exit, so a Frost Ward still freezes the attacker whose chills cross the threshold. The stacks stay while frozen. A foe holding ≥ 3 frost stacks past immunity doesn't re-freeze until its count drops below 3 (a pairing, or the lapse) and climbs back over, which mirrors today's fresh chills per freeze and gives the rhythm freeze → pair off → re-stack → freeze. Glacier's `freeze` knob raises frost to at least `freezeAt` (so its first hit crosses), and Superconduct calls `freeze(superconductFreeze)` directly, as today.

### Stacks per hit

Every hit carries one count, `HitOpts.stacks` (and `Projectile.stacks` for shots), applied to every element status the hit carries. `applyStatus(status, hitAmount, rattles, slot, n)` maps the six element statuses to their element through `BASIC_STATUS`'s inverse (`burn` → fire … `poison` → nature; the map stays and is still exported) and calls `applyStacks(ctx, m, element, n, ref, slot)`, which adds `n` (capped), refreshes `stackUntil[element] = t + duration[element]`, and updates the ref and slot under the DPS Lab's rule (`!active || ref >= current`). `stagger` still applies the stagger CC; it adds Earth stacks only with `rattles` (an Earth source), as today's rattle rule.

| Source | `stacks` | Balance key |
|---|---|---|
| Ability direct hit, by weight (Swift, Light, Balanced, Heavy, Crushing) | 1, 1, 2, 3, 3 | `byWeight` (`hitOpts` sets it when `direct`) |
| Basic blow | 1 | `basicBlow` (set in `basic.ts` on the strike and on the shot) |
| Basic finisher, and its discharge of the secondary | 2 | `basicFinisher` |
| Zone tick, ember, chain jump, Lance/Strike/Blink and Ward burst when not `direct`, Rimeheart's chill, Crystallize's neighbour chill, Hellfire Brand's corpse explosion, the Defensive's retaliation (both paths) | 1 | `tick` |
| Reaction splash | 0 | as today (`noReact`, applies nothing) |

A Surge's extra statuses ride the blow's count (a Fire Surge on a fire finisher is 2). Twin Fang's extra hit applies nothing (0) and can only pair leftovers (harmless behind the finisher's lockout). Crushing's `heavyStagger` and the riposte apply stagger only, never Earth stacks. `BASIC_STATUS`'s 30% roll and Earth's 18% go: every blow applies its element. This removes one `rng.next()` per blow, so seed-exact tests shift. Steam's blind, Hellfire's brand, Overgrowth's root and Soulfrost's execute (needs frozen) are unchanged.

### Pairing

On a hit of element E that isn't `noReact`:
1. `before[F]` = each element's count before this hit. For frost as a *partner* only, a bare freeze counts as one: `before[frost] = max(stacks.frost, frozen ? 1 : 0)`.
2. `total_E = min(cap, stacks[E] + k)`, from the raw count (no pseudo-stack: a frost hit never pairs a stack it doesn't have), where `k` is this hit's `stacks`.
3. Walk F over `MANA_TYPES` (fire, frost, storm, earth, shadow, nature), skipping E. The first F with `before[F] > 0` whose reaction can fire pairs: `n = min(total_E, before[F])`. A reaction can't fire while the foe's `reactionLockUntil` runs, while a buff reaction's hero-side cooldown runs, or for an Earth hit on a foe that is chilled but not frozen (Shatter needs the freeze).
4. If `n > 0`: the reaction fires with `n`, reading the foe's *pre-consumption* state (Blight spreads what the foe has now), and `reactionLockUntil = t + reactionLockout`.
5. Damage is dealt, scaled by the reaction as today. A kill ends here: a killing reaction never consumes, and kill-time readers (Inferno's flames, Night's Embrace, Plague's spread) see the pre-consumption counts.
6. If the foe survived, in this order: apply this hit's E stacks; remove `n` from E and from F (a count stops at 0 and its status ends: a burn stops, a slow ends); apply the hit's other elements' stacks; then evaluate frost's crossing once on the final count.

A fused hit carries stacks of both its elements, but only `before[]` counts as earlier, so it never pairs with itself; the order in step 6 keeps its second element from crossing the freeze threshold before the pairs come off. `useUpMark` becomes `consumePairs(m, E, F, n)`.

**Which reactions end a freeze:** a freeze ends only when frost was the *partner* F that paired (a Fire hit's Melt, an Earth hit's Shatter, a Nature hit's Crystallize, a Shadow hit's Siphon…), never when frost is the hit's own element: a frost hit that Shatters a rattled frozen foe leaves it frozen, as today's `useUpMark` touches only the F side. Superconduct is the exception and keeps a freeze it finds (pseudo-stack included), adding its own if none. Shatter from an Earth hit still needs the foe frozen. Soulfire and Blight consume like every other reaction (`consumes` leaves `arpg.json`).

### Reaction strength

| Reaction | With `n` pairs |
|---|---|
| Melt | hit × (1 + (meltMult − 1) × n × catalyst) |
| Shatter | hit × (1 + (shatterMult − 1) × n × catalyst) |
| Overload | the blast is hit × overloadMult × n × catalyst |
| Combust | hit × (1 + (combustMult − 1) × n × catalyst); the splash deals the same amount |
| Crystallize | hit × (1 + (crystallizeMult − 1) × n × catalyst); neighbours get `tick` frost stacks, once |
| Blight | once: Plague's spread. Neighbours within `blightRadius` take the foe's nature and shadow counts (`max(theirs, the foe's)`, capped), with the poison ref and slot under the ref rule |
| Superconduct, Soulfire, Obsidian, Lightning Rod, Sunder, Seedling, Siphon, Blackout, Galvanize | once, whatever `n` (Soulfire heals from the hit; Obsidian's barrier from the hit) |

Bosses take stacks and n-scaled reactions unscaled (only freeze and stagger keep their ×0.4), deliberately. The `reaction` event and the `hit` event gain `pairs?: number`.

### Per-foe lockout

`reactionLockout` (1 s) on `status.reactionLockUntil`. While it runs, step 3 finds nothing, stacks build on both sides, and the next hit past the lockout pairs a bigger `n`. The hero-side cooldown on the five buff reactions (`reactionReadyAt`) stays.

### Balance

New block `balance.json → delve.stacks` (typed in `DelveBalance`, validated in `schemas.ts`):
- `cap` 5;
- `duration` per element, today's values: fire 3, frost 3, storm 4, earth 2, shadow 6, nature 4;
- `byWeight` [1, 1, 2, 3, 3], `basicBlow` 1, `basicFinisher` 2, `tick` 1;
- `freezeAt` 3, `firePerStack` 0.5, `frostSlowPerStack` 0.2, `frostSlowCap` 0.6, `shockPerStack` 0.1, `hexPerStack` 0.075;
- `reactionLockout` 1.0.

`delve.status` loses `burnDuration`, `chillSlow`, `chillDuration`, `chillToFreeze`, `shockBonus`, `shockDuration`, `hexBonus`, `hexDuration`, `rattleDuration`, `poisonDuration`, `poisonMaxStacks` (moved or replaced) and keeps `burnDps`, `poisonDps`, `freezeDuration`, `freezeImmunity`, stagger, root and blind. `delve.reactions` is unchanged.

**Against measured hit rates** (depth 10, one dummy, 30 s hold; the probe is `scratchpad/stack-rates/report.md`): blows per second are wand 1.93, dagger 1.83, bow 1.27, sword 1.20, staff 1.07, axe 0.90, maul 0.63, with the finisher about a third of them, so the fastest weapons reach the cap in 2–3 s and the maul's 1.6 s between blows keeps even earth's 2 s timer alive. A mana-paid Balanced Bolt casts 1.37 times a second (2 stacks each) and caps in about 2 s; Ultimates cast 2–4 times in 30 s (2 stacks Balanced, 3 Heavy or Crushing) and rarely cap alone.

**Expected shifts, stated so they aren't surprises:**
- **Basics burn far more often.** Today a blow applies its status on a 30% roll (measured 0.30–0.31 burns per blow over 40 seeds), at full strength. Now every blow applies 1 stack at half strength, and five blows reach 2.5× today's burn. `firePerStack` is the first knob; the basic stack stays 1 per blow, because two quick blows leaving 2 stacks is the point.
- **Burn amplification across sources.** The ref is the strongest applier's, so an Ultimate's burn × five cheap wand stacks lasts as long as basics refresh the timer. Intended: stacking is the combo. The DPS Lab ability target below guards it.
- **Frost freezes sooner.** Basics freeze on the third blow (about the seventh today), and a Heavy or Crushing frost ability freezes on its first hit; Glacier's outright freeze is then only a guarantee. `freezeAt` is a knob.

### Unchanged

The 15 reactions' effects, `getReactionFor` and the fixed walk, discovery and `reactionsSeen` (no save change: `StatusState` lives on `MonsterEntity`, nothing about stacks is persisted), the hero-side buff cooldown, monsters applying nothing to the hero, dummies (a lethal hit resets them and they still take stacks), determinism (no new rng), and the DPS Lab's attribution (`burnSlot`/`poisonSlot` follow the ref rule).

## What you see

- **Stack pips.** `drawMonsterMarks` draws, per element with a count, a row of mana pixels in the element's colour, one pip per stack (up to 5), stacked in element order under the foe. They replace the hex motes, shock ring, poison dust and rattle chips. The burn flicker and frost tint stay, freeze still holds the sprite, and the brand, sunder, blind, root and stagger marks stay.
- **Label.** A reaction that consumed more than one pair floats "MELT! ×2" (`ArenaRenderer` from `hit.pairs`); Soulfrost's execute pseudo-hit has no `pairs` and keeps its plain label. `reactionFx` is unchanged.
- **Training meter.** Reaction counts sum the pairs consumed. The reactions list, `MeterView`'s note, the `AbilitiesPanel` trait texts and `ManaChoice`'s "Basic status" line say stacks ("every blow applies a fire stack: burn", "3 frost stacks freeze").

## Testing

**Engine** (`tests/delve-stacks.test.ts`):
- Build: a blow applies 1, a Balanced ability 2, a Crushing one 3, a finisher 2, a chain jump and a zone tick 1; the cap holds; a new stack refreshes the timer; at the timer all of that element's stacks lapse together (and a lapsed count can't pair); every blow applies (no roll).
- Status: burn per second scales with fire stacks and stops at 0; slow scales and caps; shock and hex bonuses scale; rattled while earth ≥ 1; poison as today with the cap and Plaguebearer.
- Freeze: crossing 3 freezes with immunity and the stacks stay; a foe at 3+ past immunity doesn't re-freeze on the next frost hit; dropping below 3 and climbing back does; a fused Steam hit on a foe with 2 frost Melts without a phantom freeze; Glacier freezes on its first hit; a frozen foe with 0 frost stacks can still be Shattered by Earth and Melted by Fire (the bare freeze counts as one partner stack), and that ends the freeze; a frost hit on a frozen foe with 0 frost stacks pairs nothing of its own and never unfreezes it; a Frost Ward's retaliation still freezes an attacker whose chills cross 3.
- Pairing: earlier-only (a fused hit doesn't pair with itself, the next hit does); the fixed order with two other elements present; `n = min`; leftovers stay; Earth on a chilled-not-frozen foe walks on; a killing reaction leaves the counts.
- Strength: each damage reaction's bonus is × n (n = 1, 2, 3); each effect reaction fires once with n = 3; Blight spreads the pre-consumption counts; Catalyst scales the bonus.
- Lockout: a second reaction within 1 s doesn't fire, stacks build meanwhile, and the next past the lockout pairs the bigger n. The hero-side buff cooldown still applies.
- Consuming: a status ends at 0; Melt ends a freeze; Shatter needs the freeze and ends it; Superconduct keeps it; Crystallize and Siphon end it; Soulfire and Blight consume.
- All 15 reactions both ways with stacks; `pairs` on the events; determinism (same seed, same events twice).
- The existing reaction, status, forms, sim, infusion, pair, training, dodge, combat-weight and DPS-sim tests are updated to stacks, not weakened.

**Pacing** (`tests/delve-pacing.test.ts`): the rails hold unchanged, including each run finding its own pair's reaction and the 15-pair sweep. Tuning order: the per-stack values (`firePerStack` first), then `freezeAt`, then `reactionLockout`, then `cap`/`duration`, then nothing else without asking.

**DPS Lab before/after** (a scratch script over `dpsCombos`, depth 10, one dummy and the pack; the "before" grid is saved from the pre-stacks engine): single-element basics stay within about 15% of today; a Fire Bolt (Balanced, mana) on one dummy stays within about 25% of today; a Nature+Fire Burst against the pack falls under about twice its unpacked figure; against one dummy the best fused Burst stays under twice the best single-element Burst; no pair vanishes from the top of the basics table. The shifts go in this spec's status note when it ships.

**Client:** pips per count and element; the ×n label; the meter's pair sums; the texts; the fake `StatusState` in `reactions.test.ts` updated.

**Release:** v0.45.0 (`chore(client): bump version to 0.45.0`); CLAUDE.md's reactions bullet says stacks; a superseded note on the pair-reactions spec's Marks and Using-up sections.
