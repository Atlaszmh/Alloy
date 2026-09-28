# Delve Pair Reactions Design

**Date:** 2026-09-28
**Status:** Draft.
**Follows:** `2026-09-27-delve-elemental-affinity-design.md` (v0.43.0). The hero holds two elements, and today only 7 of the 15 pairs have a reaction.

**Engine:** `packages/engine/src/`
- `types/arpg.ts`, `data/arpg.json`, `data/balance.json`, `data/schemas.ts`, `data/registry.ts`
- `arpg/combat.ts`, `arpg/step.ts`, `arpg/dodge.ts`
- `delve/profile-schema.ts`, `delve/autopilot.ts`

**Client:** `packages/client/src/features/delve/`
- `arena/palette.ts`, `arena/ArenaRenderer.ts`, `arena/ArenaHud.tsx`, `arena/arena-sounds.ts`
- `arena/fx/reactions.ts` (new), `arena/fx/draw-world.ts`, `arena/fx/mana-fx.ts`
- `arena/pixel/arena-effects.ts`

## Goal

Every pair of elements has a reaction, and a reaction triggers whichever of its two elements hits a foe carrying the other's mark. The new eight each give their pair a distinct role (defense, mobility, debuff, sustain, resource, burst, area defense, tempo). None of them repeats that pair's fusion: Magma already leaves burning ground, Magnetism already pulls and Overgrowth already roots.

## The trigger model

- **Data:** each `ReactionDef` in `arpg.json` gains `elements: [ManaType, ManaType]`. The schema checks that the 15 reactions cover the 15 pairs exactly once. `registry.getReactionFor(a, b)` returns the pair's reaction, in either order.
- **Marks:** an element's mark on a foe is its status:

  | Element | Mark |
  |---|---|
  | Fire | burning |
  | Frost | chilled or frozen |
  | Storm | shocked |
  | Earth | rattled (new, below) |
  | Shadow | hexed |
  | Nature | poisoned |

- **Rattled:** Earth's stagger lasts 0.6 s, too short to react with. So applying `stagger` also sets `status.rattledUntil = t + status.rattleDuration` (balance, 2 s). It does so even when stagger immunity refuses the stagger itself.
- **Lookup:** in `hitMonster`, a hit of element E checks the foe's marks in `MANA_TYPES` order. The first mark F ≠ E picks `getReactionFor(E, F)`.
  - A hit with no element, `noReact`, or no other element's mark reacts with nothing.
  - This replaces today's if/else chain.
- **Consuming:** a reaction uses up the mark F that set it off, unless the reaction says `consumes: false` (Soulfire and Blight, as today).
  - Using up the Frost mark clears chill stacks, chill and freeze.
  - Using up the Earth mark clears `rattledUntil`.
- **Both ways:** Storm on a burning foe and Fire on a shocked foe are both Overload. The first uses up the burn, the second the shock.
- **Catalyst** (the legendary) scales every reaction's damage multiplier, as today.

## The existing seven

Their effects are unchanged. Each gains its reverse trigger, and its text in `arpg.json` names both elements (e.g. "Fire and Storm meet: the foe explodes, hitting everything nearby.").

| Reaction | Pair | Effect |
|---|---|---|
| Melt | Fire + Frost | ×`meltMult` |
| Shatter | Earth + Frost | ×`shatterMult` |
| Overload | Storm + Fire | a Storm blast of ×`overloadMult` around the foe |
| Superconduct | Frost + Storm | freezes for `superconductFreeze`, respecting freeze immunity |
| Soulfire | Fire + Shadow | heals `soulfireHeal` of the hit; doesn't consume |
| Combust | Fire + Nature | ×`combustMult` plus a Fire blast around the foe |
| Blight | Shadow + Nature | the foe's poison and hex spread to foes within `blightRadius`; doesn't consume |

Blight now spreads hex as well as poison, so Nature hitting a hexed foe does something.

## The new eight

All numbers live in `balance.json → delve.reactions`; the ones below are starting values.

| Reaction | Pair | Role | Effect |
|---|---|---|---|
| **Obsidian** | Fire + Earth | Defense | A hero barrier: `h.barrier = { hp, max, until }`, with hp = the hit's damage × `obsidianSoak` (0.5), for `obsidianDuration` (5 s). A new barrier keeps the larger hp. |
| **Lightning Rod** | Storm + Earth | Mobility | +1 dodge charge, up to the max. Also `h.quickUntil = t + lightningRodDuration` (2 s), during which movement is × (1 + `lightningRodMove`) (0.3). |
| **Sunder** | Earth + Shadow | Debuff | `status.sunderUntil = t + sunderDuration` (4 s). A sundered foe takes × (1 + `sunderBonus`) (0.25) from every hit, applied next to hex. |
| **Seedling** | Earth + Nature | Sustain | Drops a healing orb at the foe: `spawnDrop(ctx, 'orb', m.x, m.y, { amount: seedlingHeal, seed: true })`, where `seedlingHeal` (0.08) is a share of max life. |
| **Siphon** | Frost + Shadow | Resource | Spawns 3 mana motes at the foe with `vacuum: true` and `siphon: true`, together worth `siphonMana` (0.15) × max mana. |
| **Crystallize** | Frost + Nature | Burst | Multiplies the hit by `crystallizeMult` (1.8) and chills every other foe within `crystallizeRadius` (2). It pushes an `explode` event (Frost, that radius). |
| **Blackout** | Storm + Shadow | Area defense | Blinds the foe and every foe within `blackoutRadius` (2.5) for `status.blindDuration`. |
| **Galvanize** | Storm + Nature | Tempo | Every ability slot still cooling down gets `galvanizeSeconds` (1) off, never below now. |

**Obsidian's barrier** soaks damage in `hurtHero` before the Ward does. It pushes `{ kind: 'barrierBreak', x, y }` when it runs out, and it lapses silently at `until`.

**Buff reactions have their own cooldown.** Obsidian, Lightning Rod, Seedling, Siphon and Galvanize each keep `h.reactionReadyAt[id]`, set to `t + reactionCooldown` (1.5 s) when they fire. While a reaction's own cooldown runs, the hit is a plain hit: no reaction, no event, no mark used up.

**Types:**
- `ReactionId` gains the eight ids.
- `DropState` gains optional `seed` and `siphon` flags; they are only for drawing.
- `MonsterStatus` gains `rattledUntil` and `sunderUntil`.
- `HeroEntity` gains `barrier`, `quickUntil` and `reactionReadyAt`.
- `ArpgEvent` gains `barrierBreak`.
- `world.ts` and `sandbox.ts` initialise the new fields.

**The save:** `DelveProfileSchema` overrides `reactionsSeen` with the 15-id enum. The frozen `DelveProfileV3Schema` keeps its 7, so old saves still parse. No migration and no version bump: seen ids are unchanged.

**Autopilot:** every pair reacts now, so `REACTION_PAIRS` and the bind preference in `bindBest` go. The bot binds the non-primary element with the most attunement again, and its test changes to match.

## What you see

Everything here is cosmetic. It lives in a new `fx/reactions.ts` plus `draw-world.ts`, and follows the mana-pixel rules. The motifs hash `seed` and `time`, so they don't shimmer.

**On every reaction event.** The reaction keeps its name label and ring (`REACTION_HEX` in `palette.ts` gains 8 colours). `ArenaRenderer` then calls `reactionFx(fx, e, world)`, which draws the reaction's signature effect:
- **Obsidian:** ember pixels cool inward onto the hero.
- **Lightning Rod:** a bolt drops into the ground at the hero.
- **Sunder:** a burst of rock chips off the foe.
- **Seedling:** a green puff where the seed lands.
- **Siphon:** a violet flash at the foe (the motes carry the rest).
- **Crystallize:** frost spikes burst outward.
- **Blackout:** a dark smoke cloud of `blackoutRadius`.
- **Galvanize:** storm sparks at the hero.

**While a state lasts** (`draw-world.ts`):
- **Obsidian:** a dark shell of cooling-ember pixels round the hero while `h.barrier` holds, thinning as its hp falls. `barrierBreak` shatters it (in `mana-fx`).
- **Lightning Rod:** a storm-pixel trail behind the hero while `t < h.quickUntil`.
- **Sunder:** a crack mark on the foe while it is sundered, drawn like the Hellfire brand.
- **Blackout:** a dim smoke mark over any blinded foe (Steam's blind shows it too).

**Pickups:**
- A `seed` orb draws as a green sprout that grows in, not the red orb.
- `siphon` motes are tinted Shadow violet.

**HUD** (`ArenaHud`):
- The life bar shows the barrier's hp as a pale segment after the fill.
- On a `galvanize` reaction, each ability button still cooling down gets a short spark.

**Pixel floor.** `arena-effects.ts` stamps Crystallize's frost burst through the existing `explode` handling, and gives a Seedling reaction a small nature growth stamp.

**Sounds.** Reactions keep their sound. `barrierBreak` plays the existing ward-break sound.

**The Anvil** needs no code change: the reactions list and the Training meter read `arpg.json`, so they show 15, and "N/15 discovered" and the both-element texts follow from the data.

## Testing

**Engine.** A new file, `tests/delve-reactions.test.ts`:
- For each of the 15 reactions, a hit of each element on a foe carrying the other's mark fires that reaction. It uses up the right mark (Soulfire and Blight keep theirs), and does its effect.
- An element hitting its own mark does nothing.
- With two marks on a foe, the first in `MANA_TYPES` order decides.
- Rattled is set by stagger even while stagger immunity refuses the stagger, and it lapses after `rattleDuration`.
- Obsidian's barrier soaks before the Ward, breaks with its event, and lapses.
- Lightning Rod caps dodge charges and speeds movement.
- Sunder multiplies damage taken.
- Seedling's orb heals when picked up.
- Siphon's motes restore mana.
- Galvanize never pushes a cooldown below now.
- A buff reaction on its own cooldown is a plain hit that keeps the mark.
- The same seed gives the same events twice.
- The schema refuses a reaction set that misses a pair or repeats one.

Existing reaction tests keep passing, with their texts updated.

**Pacing.** `tests/delve-pacing.test.ts` stays the gate, with every run, Fire and Frost, finding at least one reaction by dive 12. Reactions now fire about twice as often. If a rail breaks, tune in this order:
1. the damage reactions' multipliers (`meltMult`, `shatterMult`, `overloadMult`, `combustMult`, `crystallizeMult`);
2. `reactionCooldown`;
3. the new eight's amounts;
4. anything else only after asking.

**Client.** Tests cover:
- `reactionFx` draws something for each of the 15 ids;
- the shell, trail, crack and smoke marks draw only while their state lasts;
- the seed and siphon drops draw their variants;
- the barrier segment on the life bar;
- the Galvanize spark.

The Anvil test expects 15 reactions.

**Release:** v0.44.0 (`chore(client): bump version to 0.44.0`), plus a CLAUDE.md note that every pair reacts, both ways, and where the reaction table lives.
