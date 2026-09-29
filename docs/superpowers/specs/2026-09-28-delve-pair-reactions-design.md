# Delve Pair Reactions Design

**Date:** 2026-09-28
**Status:** Built in v0.44.0.
**Follows:** `2026-09-27-delve-elemental-affinity-design.md` (v0.43.0). The hero holds two elements, but only 7 of the 15 pairs have a reaction today.

**Engine** (`packages/engine/src/`):
- `types/arpg.ts`, `types/delve.ts`
- `data/arpg.json`, `data/balance.json`, `data/schemas.ts`, `data/registry.ts`
- `arpg/combat.ts`, `arpg/step.ts`, `arpg/dodge.ts`, `arpg/world.ts`, `arpg/sandbox.ts`, `arpg/abilities/defend.ts`, `arpg/abilities/impact.ts`, `arpg/basic.ts`
- `delve/profile-schema.ts`, `delve/autopilot.ts`

**Client** (`packages/client/src/features/delve/`):
- `arena/palette.ts`, `arena/ArenaRenderer.ts`, `arena/ArenaHud.tsx`, `arena/useArenaCore.ts`, `arena/arena-sounds.ts`
- `arena/fx/reactions.ts` (new), `arena/fx/draw-world.ts`, `arena/fx/mana-fx.ts`
- `arena/pixel/arena-effects.ts`

## Goal

Every pair of elements gets a reaction. Whichever of the pair's two elements hits a foe carrying the other's mark sets it off. The eight new reactions each give their pair its own role: defense, mobility, debuff, sustain, resource, burst, area defense or tempo. None repeats that pair's fusion (Magma already leaves burning ground, Magnetism already pulls, Overgrowth already roots).

## Marks

> **Superseded** by `2026-09-28-delve-elemental-stacks-design.md` (v0.45.0): a mark is now its element's stack count (`StatusState.stacks`; `hasMark` is a count above 0, or frozen for frost), and a reaction pairs a hit's stacks with another element's from earlier hits.

An element's **mark** on a foe is its status. The checks sit beside the existing `is*` helpers in `combat.ts`, as `hasMark(ctx, m, element)`.

| Element | Mark |
|---|---|
| Fire | burning |
| Frost | chilled or frozen |
| Storm | shocked |
| Earth | rattled (new, below) |
| Shadow | hexed |
| Nature | poisoned |

**Rattled.** Stagger lasts 0.6 s, which is too short to react with. Earth's mark is `StatusState.rattledUntil` instead (`isRattled`), set to `t + bal.status.rattleDuration` (2 s).
- Only a source that includes Earth sets it. An ability hits with its first element but applies both elements' statuses, so keying on the hit's element would miss every build with Earth second.
- `HitOpts` gains `rattles?: boolean`, and `applyStatus` gains an optional `rattles` parameter. A `stagger` applied with `rattles` rattles the foe. It rattles even when stagger immunity refuses the stagger itself.
- Who sets `rattles`:
  - `hitOpts` (`impact.ts`), from `ab.elements.includes('earth')`;
  - `basic.ts`'s strike, when the blow's element is `earth` (an Earth finisher's discharge included) or an Earth Surge is up (`surge.elements.includes('earth')`, whose statuses every blow applies). A ranged blow carries the flag on its projectile (`Projectile.rattles`), and both places a hero shot lands pass it on: the projectile hit in `step.ts` and `burstShot`;
  - `defend.ts`, from `ab.elements.includes('earth')`, on both paths (Armor's `hitMonster` and the other forms' `applyStatus`).
- `hitMonster`'s status loop passes `opts.rattles` to `applyStatus`.
- Stagger from anything else doesn't rattle: Crushing weight's `heavyStagger`, a non-Earth weapon blow's `stagger` (such as the Maul finisher), and the riposte.

## The trigger model

**Data.** Each `ReactionDef` in `arpg.json` gains:
- `elements: [ManaType, ManaType]`;
- an optional `consumes: false` (Soulfire and Blight);
- an optional `cooldown: true` (the five buff reactions, below).

The Zod schema:
- takes the 15 reactions;
- refines them to cover the 15 pairs exactly once;
- exports one `ReactionIdSchema`, used by both `arpg.json`'s schema and the save schema.

`registry.getReactionFor(a, b)` returns the pair's reaction in either order.

**Lookup.** In `hitMonster`, a hit of element E (not `noReact`) reacts as follows:
1. It walks the foe's marks in `MANA_TYPES` order (fire, frost, storm, earth, shadow, nature).
2. It takes the first mark F ≠ E whose reaction can fire now. A buff reaction on its own cooldown can't fire, and neither can an Earth hit on a foe that is chilled but not frozen (Shatter, below).
3. It runs `getReactionFor(E, F)`.

This replaces today's if/else chain. Hits with no element, `noReact` hits (reaction splashes, damage-over-time ticks) and hits with no other element's mark don't react, and keep every mark.

> **Superseded** by the elemental stacks spec (v0.45.0): a reaction takes pairs of stacks off both sides (`consumePairs`: every pair for a damage reaction, one for an effect), Soulfire and Blight included (`consumes` is gone), and a freeze ends only when frost was the partner, except under Superconduct.

**Using up the mark.** A reaction clears the mark F that set it off, with these exceptions:
- Soulfire and Blight (`consumes: false`) clear nothing, as today.
- **Shatter:**
  - An Earth hit needs the foe frozen, not just chilled (as today), and clears only the freeze.
  - A Frost hit on any rattled foe shatters it, frozen or not, and clears only rattled.
- **Superconduct:** on the Frost side it clears only chill and its stacks, so a frozen foe stays frozen. Otherwise, clearing the freeze and then calling `freeze()` would be refused by freeze immunity and thaw the foe.
- **Melt** (Frost side): clears chill, stacks and freeze, as today.

The mark is cleared before the reaction's effect runs.

**Both ways.** Storm on a burning foe and Fire on a shocked foe are both Overload. The first uses up the burn, the second the shock.

**What changes for today's reactions**, stated so it isn't a surprise:
- each gains its reverse trigger;
- Blight spreads hex as well as poison;
- when a foe carries several marks, `MANA_TYPES` order decides, not today's chain. For example, Fire on a hexed and poisoned foe was Combust and is now Soulfire. Only a hero with more than two elements can hit that case: the Training Grounds, or several abilities.

**Catalyst** (the legendary) scales the damage multipliers (Melt, Shatter, Overload, Combust, Crystallize) and Soulfire's hit, as today. It doesn't scale the effects of the buff reactions.

**Fused abilities.** A two-element ability hits with its first element and applies both elements' statuses, so from its second hit on it sets off its own pair's reaction every time. That already happens for today's seven pairs in one direction (Wildfire does it with Combust). It now happens for all 15, which is why the pair sweep under Testing exists.

## The existing seven

The effects are unchanged apart from the notes above. Each reaction's text in `arpg.json` names both elements, e.g. "Fire and Storm meet: the foe explodes, hitting everything nearby."

| Reaction | Pair | Effect |
|---|---|---|
| Melt | Fire + Frost | ×`meltMult` |
| Shatter | Earth + Frost | ×`shatterMult`; an Earth hit needs a freeze |
| Overload | Storm + Fire | Storm blast of ×`overloadMult` within `overloadRadius` |
| Superconduct | Frost + Storm | `freeze(ctx, m, superconductFreeze)` |
| Soulfire | Fire + Shadow | heals `soulfireHeal` of the hit; doesn't consume |
| Combust | Fire + Nature | ×`combustMult`, plus a Fire blast within `combustRadius` |
| Blight | Shadow + Nature | `spreadAffliction(ctx, m)`: the foe's poison and hex pass to foes within `blightRadius`, each only if present; doesn't consume |

## The new eight

All numbers go in `balance.json → delve.reactions` (typed in `DelveBalance`, validated in `schemas.ts`); those below are starting values. "Nearby foes" means every living monster, dummies included, with `dist ≤ radius + o.radius` from the reacting foe, which is Overload's rule. "The hit" means `amount` at the reaction step, after crit, resistance, shock, hex and sunder.

| Reaction | Pair | Role | Effect |
|---|---|---|---|
| **Obsidian** | Fire + Earth | Defense | A barrier on the hero (below) worth the hit × `obsidianSoak` (0.5), capped at `obsidianCap` (0.3) × max life, for `obsidianDuration` (5 s) |
| **Lightning Rod** | Storm + Earth | Mobility | Refunds a dodge charge through a shared `refundDodgeCharge(ctx)`, which `notePerfect` also uses: +1 up to `bal.dodge.charges`, with `dodgeRechargeAt = 0` when full. Also `h.quickUntil = t + lightningRodDuration` (2 s): movement × (1 + `lightningRodMove`) (0.3), multiplying with Surge and the recovery slow in `step.ts`'s pace |
| **Sunder** | Earth + Shadow | Debuff | `m.status.sunderUntil = t + sunderDuration` (4 s). A sundered foe (`isSundered`) takes × (1 + `sunderBonus`) (0.25) from every later hit, applied beside hex. The hit that sunders doesn't get it |
| **Seedling** | Earth + Nature | Sustain | `spawnDrop(ctx, 'orb', m.x, m.y, { amount: seedlingHeal, mana: 'nature' })`, where `seedlingHeal` (0.08) is a share of max life, as for orbs |
| **Siphon** | Frost + Shadow | Resource | 3 mana motes, each worth `siphonMana` (0.15) × max mana / 3, fixed at spawn, with `mana: 'shadow'` and `vacuum: true`. They sit at fixed offsets 0.4 units from the foe, 120° apart (no rng). `spawnDrop`'s `extra` gains an optional `vacuum` that overrides `world.cleared` |
| **Crystallize** | Frost + Nature | Burst | The hit × `crystallizeMult` (1.8) × Catalyst. Every other nearby foe within `crystallizeRadius` (2) gets one chill stack through `applyStatus` (which can freeze at `chillToFreeze`). It pushes an `explode` event (Frost, that radius, no infusion) |
| **Blackout** | Storm + Shadow | Area defense | The foe and every nearby foe within `blackoutRadius` (2.5): `blindUntil = t + bal.status.blindDuration` |
| **Galvanize** | Storm + Nature | Tempo | Per ability slot, like Nightstalker: a slot that pays by charge gains 1 unit (capped at `chargeNeed`); any other slot still cooling down gets `galvanizeSeconds` (1) off, never below now |

**Obsidian's barrier**, `h.barrier: { hp, max, until } | null`:
- **Creating and refreshing:** a new barrier replaces the old one when its hp is larger, setting all three fields with `max = hp`. Otherwise it only extends the old one's `until`.
- **Where it soaks:** `shieldHero` (`defend.ts`) is reworked so the barrier soaks after the Defensive's reductions and retaliation, and just before the Ward. It soaks even with no Defensive up, and it soaks what the Ward would (including `unavoidable` damage).
- **Invulnerable (Training Grounds):** the barrier drains like the Ward does. `hurtHero` runs `shieldHero` before it checks `invulnerable`, so nothing about that order changes.
- **Breaking:** when its hp runs out it pushes `{ kind: 'barrierBreak', x, y }` and becomes null.
- **Lapsing:** the hero tick clears it silently once `t ≥ until`.

**Buff reactions' own cooldown.** Obsidian, Lightning Rod, Seedling, Siphon and Galvanize (`cooldown: true`) set `h.reactionReadyAt[id] = t + reactionCooldown` (1.5 s) when they fire.
- `reactionReadyAt` is a `Partial<Record<ReactionId, number>>`, starting as `{}`.
- While a reaction's cooldown runs, the lookup skips it.
- The Training Grounds' No cooldowns toggle covers abilities only, not these. Under it, Galvanize finds nothing to shorten.

**Types:**
- `ReactionId` gains the eight new ids.
- `StatusState` gains `rattledUntil` and `sunderUntil`, both 0 in `emptyStatus()`.
- `HeroEntity` gains `barrier`, `quickUntil` and `reactionReadyAt`, set in `createHeroEntity`.
- `ArpgEvent` gains `barrierBreak`.
- `DelveBalance.status` gains `rattleDuration`. `DelveBalance.reactions` gains the numbers above.
- `respawnHero` (`sandbox.ts`) also clears `barrier`, `quickUntil` and `reactionReadyAt`.

**Training Grounds.** Seedling orbs and Siphon motes appear there: they are the reaction, not loot. The sandbox's "drops nothing" doc gets that exception.

**Save.** `DelveProfileSchema` overrides `reactionsSeen` with `z.array(ReactionIdSchema)`. The frozen `DelveProfileV3Schema` keeps its seven ids, so older saves still parse and migrate. No version bump is needed: ids already seen don't change. As before, a 0.43 tab can't read a save that has seen a new reaction.

**Autopilot.** Every pair now reacts, so `REACTION_PAIRS` and the bind preference in `bindBest` go. The bot binds the non-primary element with the most attunement again, and its test changes to match.

## What you see

Everything here is cosmetic and follows the mana-pixel rules. Signature effects hash `seed` and `time`, so they don't shimmer. The seven existing reactions keep today's look.

**Label and ring.** They stay on the `hit` event's `reaction` (`ArenaRenderer`).
- `REACTION_HEX` gains 8 colours.
- `REACTION_LABEL` is deleted. The label is now `registry.getReaction(id).name.toUpperCase() + '!'`, so a new reaction can't float "undefined".

**The moment it fires.** `ArenaRenderer` handles the `reaction` event (x, y at the foe) by calling `reactionFx(fx, e, world)` in the new `fx/reactions.ts`. It draws nothing for the seven, and for the eight:

| Reaction | Effect |
|---|---|
| Obsidian | ember pixels cool inward onto the hero |
| Lightning Rod | a bolt drops into the ground at the hero |
| Sunder | rock chips burst off the foe |
| Seedling | a green puff at the foe |
| Siphon | a violet flash at the foe (the motes carry the rest) |
| Crystallize | frost spikes burst outward |
| Blackout | a dark smoke cloud of `blackoutRadius` |
| Galvanize | storm sparks at the hero |

**While a state lasts** (`draw-world.ts`):
- **Obsidian:** a shell of cooling-ember pixels round the hero while `h.barrier` holds. It thins as `hp / max` falls, and `barrierBreak` shatters it (`mana-fx`, handled in `ArenaRenderer`).
- **Lightning Rod:** a storm-pixel trail behind the hero while `t < h.quickUntil`.
- **Rattled:** a few earth-coloured rock chips circling low round a rattled foe, in `drawMonsterMarks` beside the other marks.
- **Sunder:** a crack mark on a sundered foe, drawn like the Hellfire brand.
- **Blind:** a dim smoke mark over any blinded foe (Steam's blind too).

**Pickups.** An orb with `mana: 'nature'` draws as a green sprout that grows in. A mote with `mana: 'shadow'` is violet already (`MANA_HEX`).

**HUD.** It goes through the `ArenaHud` snapshot, since the HUD has no event channel:
- the snapshot gains `barrier: { hp, max } | null`, and the life bar shows it as a pale segment after the fill;
- the snapshot gains `galvanizedAt`, read as `reactionReadyAt.galvanize - reactionCooldown`. For 0.4 s after it, each ability button still cooling down shows a spark.

**Pixel floor.**
- Crystallize's frost burst stamps through the existing `explode` handling.
- Seedling gets a small nature growth stamp, keyed on the `hit` event's `reaction === 'seedling'`. That event already crosses to the floor worker; the `reaction` event doesn't (`FLOOR_EVENTS`).

**Sound.** `barrierBreak` plays `orbRemove`. Reactions keep their sound.

**The Anvil.** No code change. The reactions list and the Training meter read `arpg.json`, so they show 15, with "N/15 discovered" and the texts naming both elements.

## Testing

**Engine: new `tests/delve-reactions.test.ts`.**
- **All 15, both ways.** For each of the 15 reactions, a hit of each element on a foe carrying the other's mark:
  - fires that reaction;
  - uses up the right mark (Shatter and Superconduct as above; Soulfire and Blight keep theirs);
  - does its effect.
- **When nothing fires:**
  - An element hitting its own mark does nothing.
  - A `noReact` hit (an Overload splash, a poison tick) on a marked foe fires nothing and keeps the mark.
  - An Earth hit on a merely chilled foe doesn't Shatter; a Frost hit on a rattled, unfrozen foe does.
- **Two marks:** with two marks on a foe, the first in `MANA_TYPES` order decides.
- **Rattled:**
  - Earth's stagger rattles even under stagger immunity, and rattled lapses after `rattleDuration`.
  - A fused ability with Earth second (for example Fire + Earth) rattles, and so does an Earth finisher's discharge.
  - A ranged Earth blow (a staff's shot and its burst) rattles, and so does any blow while an Earth Surge is up.
  - A Maul finisher that discharges a non-Earth secondary, Crushing weight and a riposte don't rattle.
  - An Earth Defensive's retaliation rattles, with Earth first or second.
- **Superconduct reverse:** on a frozen foe it keeps the freeze.
- **Blight reverse:** on a hexed foe that isn't poisoned, it spreads hex and no empty poison.
- **Obsidian:**
  - it soaks after Armor's reduction and retaliation, and before the Ward;
  - it keeps the larger barrier and caps it;
  - it breaks with its event, and lapses silently.
- **Lightning Rod** refunds as a perfect dodge does and speeds movement.
- **Sunder:**
  - it multiplies later hits;
  - the hit that sunders isn't boosted.
- **Seedling's orb** heals when picked up.
- **Siphon's motes** fly in and restore mana.
- **Galvanize:**
  - a charge slot gains a unit;
  - a cooldown slot never drops below now.
- **Buff cooldown:** a buff reaction on its own cooldown leaves a plain hit that keeps the mark.
- **Resets and determinism:**
  - `respawnHero` clears barrier, quick and cooldowns;
  - the same seed gives the same events twice.
- **Schema and saves:**
  - the schema refuses a reaction set that misses or repeats a pair;
  - a v4 save with a new id parses;
  - a v3 save with the seven still migrates.
- Existing reaction tests keep passing, with their texts updated.

**Pacing** (`tests/delve-pacing.test.ts`). The reactions rail becomes: every run, Fire and Frost, has discovered its own pair's reaction (`getReactionFor(primary, secondary)`) by dive 12. The comment about "at most one reaction" goes.

**Pair sweep** (new, in the pacing file). One seed per pair for all 15 pairs: a 6-dive `runAutopilot` with the pair forced, using `AutopilotOptions.primary` plus a new `secondary`. Each pair's dive-6 depth must stay within 0.6–1.6 × the median of the 15. That catches a fused ability that reacts every hit too hard.

**Tuning order if a rail breaks:**
1. the damage multipliers (`meltMult`, `shatterMult`, `overloadMult`, `combustMult`, `crystallizeMult`);
2. `reactionCooldown`;
3. the new eight's amounts;
4. anything else, only after asking.

**Client:**
- `reactionFx` draws for each of the eight new ids and nothing for the seven;
- the label comes from data for a new id;
- the shell, trail, rattled chips, crack and smoke marks draw only while their state lasts;
- the nature orb and shadow mote draw their looks;
- the HUD barrier segment and the Galvanize spark come from the snapshot;
- a Seedling hit reaches the floor worker's stamp;
- the Anvil shows 15 reactions.

**Release.** v0.44.0 (`chore(client): bump version to 0.44.0`), plus a CLAUDE.md note that every pair reacts, both ways, with the reaction table in `arpg.json` (`elements`) and the marks in `combat.ts`.
