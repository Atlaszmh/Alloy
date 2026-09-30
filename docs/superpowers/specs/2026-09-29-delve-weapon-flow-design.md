# Delve weapon flow: blows and casts that move with the fight

**Status:** approved design, 2026-09-29. It follows v0.47.0 (`2026-09-29-delve-chain-feel-design.md`) and ships as v0.48.0.

## Why

The user wants combat to flow: the player weaving through a fight in full control while basic attacks and abilities keep firing, with a movement style that changes with each weapon and ability kit. Today the opposite happens:
- A committed basic swing, an ability's wind-up and a charging hold all root the hero (`step.ts`: `rooted = windup || hold || swing.committed`).
- An automatic swing commits only while the hero stands still; moving releases it and drops its lunge.
- While a push (a lunge, a step-in or a recoil) runs, it places the hero absolutely, and steering does nothing.
- Only melee lunges, from 0.4 to 1.2 units on a sword; staves, wands and bows barely recoil (0.05 to 0.3).

## Decisions (the user's)

| Question | Decision |
|---|---|
| How does a blow's motion meet the player's movement? | **It blends with steering.** No basic attack roots the hero. Each blow adds a short burst of motion on top of the player's movement, and the stick bends it: a staff sidesteps toward the side being steered. |
| Each weapon's style | **The table below.** Dagger darts in and hops out; sword steps in and lunges; axe steps in and wades; maul plants, then leaps; staff sways; wand flicks and circles; bow steps back from danger. Distances grow with the blow's kind: light, medium, heavy, then a charged hold. |
| When a blow's motion points against the steering | **Steering wins.** The part of the motion that fights the steering is dropped; the rest applies. Standing still, the whole motion applies. |
| Abilities | **They stop rooting.** Wind-ups and charging holds let the hero move, slowed. Each form's own motion (Strike's step-in, Bolt's recoil) blends with steering like a blow's. |
| Balance | Measure pacing before and after. If a rail breaks, stop and bring the numbers to the user rather than tune. |

## Design

### Weapon styles

Each weapon's `feel` rows in `delve.json` hold these per kind, as starting values tunable in data:
- `move`: along the attack direction, positive in and negative back.
- `side` (new): sideways.
- `hop` (new): a step back after the strike.

| Weapon | `move` light · medium · heavy · hold | `side` light · medium · heavy · hold | `hop` heavy · hold | Sway |
|---|---|---|---|---|
| dagger | 0.25 · 0.3 · 0.7 · 0.9 | 0 | 0.8 · 0.8 | – |
| sword | 0.4 · 0.8 · 1.2 · 1.6 | 0 | 0 | – |
| axe | 0.3 · 0.4 · 0.9 · 1.2 | 0 | 0 | – |
| maul | 0.15 · 0.3 · 1.6 · 2.0 | 0 | 0 | – |
| staff | 0 | 0.5 · 0.7 · 1.0 · 1.3 | 0 | alternate |
| wand | 0 | 0.35 · 0.45 · 0.6 · 0.8 | 0 | orbit |
| bow | −0.4 · −0.6 · −0.9 · −1.2 | 0 | 0 | – |

- **Direction.** The attack direction is the swing's own: toward its target (the nearest foe in reach) or the manual aim.
  - A forward `move` goes along it and stops at the contact gap of the foe it lunges at.
  - A negative `move` and a `hop` go away from it.
  - A `side` step is perpendicular to it.
- **Timing.**
  - A forward `move` is the blow's **lunge**. It runs during the startup, as today: planted for `lungeHold`, then the lunge. The hero can steer during the planted part; it no longer pins them.
  - A negative `move`, a `side` and a `hop` together make the blow's **step**, one push that is their sum. It runs from the strike, over `feel.stepSeconds` (new, 0.15 s). The blow lands, then the hero steps.
  - `recoilSeconds` stays, but only for the forms' recoils.
- **Which side.**
  - When the steering's lateral part, relative to the attack direction, is at least `feel.sideSteer` (new, 0.3) of the stick, the side step goes that way.
  - Otherwise the weapon's `sway` rule (new, on the weapon base) picks it: `alternate` (the staff) flips side each blow, and `orbit` (the wand) keeps the last side, so the hero circles the target.
  - Every side step records the side it took in `HeroEntity.swaySide` (1 or −1, starting at 1), so `alternate` flips from the side actually taken. `world.ts` sets it, and `respawnHero` resets it.
- **A manual hold blow** starts on the medium row, as today, and so lunges medium's `move` during its startup. When it strikes at stage 1 or 2, its stage's row gives an extra lunge at the release: the stage row's `move` minus medium's, if positive, toward the re-aimed direction, over `stepSeconds`. Then the stage row's step follows. So a charged maul still leaps.
- **Acquisition.** Every swing now looks for a foe within reach plus its lunge (plus 1 for a manual swing), as a committed swing does today, so a swing on the move reaches as far as one standing. The larger heavy lunges (maul 0.7 → 1.6, axe 0.5 → 0.9) widen this; it's a pacing lever, measured below.
- **Unarmed** (`hero.feel`) keeps today's small lunge and no side step.

### Pushes and blending
- **Pushes become a list.** `HeroEntity.pushes`, replacing `HeroEntity.push`, holds each running push. Each push has:
  - its kind: `lunge` (a swing's), `stepIn` (a form's), `step` (a blow's strike step, a hold blow's release lunge, a form's recoil);
  - its direction and distance, and its start and end;
  - an optional foe to stop at;
  - the progress it has applied so far (new).
- **A push's slice.** Each tick, a push's slice is its progress change times its displacement. The planted part of a lunge has no slice.
- **One movement per tick.** Each tick, in this order:
  1. The hero moves by its steering, at its pace. It is slowed as below and clamped to the arena.
  2. Each push's slice is added, clamped to the arena. While the player steers (stick above 0.05, direction `u`), a slice `d` with `d·u < 0` becomes `d − (d·u)u`. With the steering exactly against a push, its slice is nothing and its progress still runs out: the push expires quietly.
  3. A push with a stop foe is cut at that foe's contact gap: only its own slice is cut, never the steering. If the hero is already inside the gap, that push ends.
- **What ends a push.**
  - `cancelSwing` ends only that swing's `lunge`.
  - `castAbility` and `startHold` no longer clear pushes, so a blow's step survives the chain's next cast.
  - A dodge clears them all, as today.
  - A wind-up landing (`castTick`) finishes its own `stepIn` at once: the remaining slice is applied unprojected, since steering isn't known yet at that point in the tick.
- **Swings and pushes.** A swing waits for a `lunge` or a `stepIn` to finish, but no longer for a `step`, so fast weapons never lose a swing to their own step.
- **Side steps, back steps and hops have no stop.** One that runs into a foe goes through `separate`, which shoves normal foes aside while dummies and bosses push the hero out; arena edges clamp. That is intended.

### No rooting
- **Moving while acting.** A basic swing (startup to strike), a manual hold blow charging at its strike point, an ability's wind-up and a charging hold no longer root the hero. While any of them runs, the hero moves at `feel.actionMove` (new, 0.6) of its pace. A recovery's `recoveryMove` (0.4) still applies, and the slower pace wins.
- **Facing.**
  - While any of those runs, the hero faces its action: the swing's direction, the wind-up's `at`, or the hold's aim. So steering strafes rather than turning, and the lean and the sprite agree.
  - Otherwise it faces its steering, as today.
- **`h.moving`** means steering above 0.05 and not dashing.
- **Recovery and commitment.** A blow's motion no longer depends on `committed`. Moving during an automatic swing's startup still clears `committed`, as today, but now only for the recovery: a swing steered away from sets no recovery.
- **The anticipation lean** (`anticipation.ts`) follows any swing in its startup, no longer only a committed one.

### Abilities
- **Form motion blends.** A form's step-in (`motion > 0`, during the conjure) and its recoil (`motion < 0`, after it fires) are pushes, blended with steering like a blow's. The step-in still never passes the aim point on its own, and still stops at a foe.
- **Past the aim point.** If steering carries the hero past a manual aim point (the direction from the hero to `at` has turned more than 90° from the press's direction), the form fires along the press's direction and doesn't turn round.
- **Unchanged:** Blink's dash, the Defensive effects, and each form's reach and aim.

## Engine surface
- **Data:**
  - `delve.json`: feel rows gain `side` and `hop` (default 0), and weapon bases gain `sway` (`alternate` or `orbit`, default `alternate`).
  - `balance.json → delve.feel`: `stepSeconds` 0.15, `actionMove` 0.6, `sideSteer` 0.3.
- **Types and schemas:**
  - `ComboStepDef` and `ComboStepSchema` gain `side` and `hop`; this covers `hero.feel` too.
  - `GearBaseDef` and `HeroWeapon` gain `sway`, carried by `computeHeroStats` (`hero-stats.ts`).
  - `HeroEntity` has `pushes` in place of `push`, plus `swaySide`.
- **Code:**
  - `action.ts`: pushes, slices, contact stop, `cancelSwing`.
  - `basic.ts`: the lunge on every swing, the strike's step, a hold blow's release lunge, acquisition.
  - `step.ts`: the movement block, no rooting, the slowdown, facing, `h.moving`, the swing gate.
  - `abilities/cast.ts`: form pushes, `castTick`'s finish, the fire direction past the aim point; `holdTick`'s doc comment.
  - `dodge.ts`, `world.ts` and `sandbox.ts`: clearing and initialising pushes and `swaySide`.
  - `dps-sim.ts`: the held position, below.

## Balance and gates
- **DPS Lab.** The sim puts every position back after each tick. Its hero goes back to its start plus the displacement its running pushes have applied, so a lunge still plays out and the hero returns when it ends. The `dps-sim.ts` comment changes with it.
  - Save the grid before any code change.
  - After it, the basic grid should come out identical. Any row that moves by more than 1% is reported and explained.
- **Pacing.**
  - Capture the before numbers with `runAutopilot()`, using `tests/delve-pacing.test.ts`'s seeds, before any change.
  - Compare after. Bows now kite, melee lunges and leaps, and every hero walks while casting.
  - Every rail must hold. If one breaks, stop and report the numbers; the fix is the user's call.

## Testing
- **Engine:**
  - Each weapon's motion by kind:
    - a lunge's distance, stopping at contact;
    - a bow's step back;
    - a staff alternating its side and a wand keeping it;
    - a dagger's hop after its heavy blow;
    - a maul's leap;
    - a charged maul hold blow's release lunge.
  - The side:
    - it follows the steering's lateral part above `sideSteer`;
    - `swaySide` records a steered step.
  - The projection:
    - a lunge while steering away moves the hero only along the steering, and a sideways part survives;
    - exactly opposite, the lunge expires.
  - A blow's step survives the next cast; `cancelSwing` ends only its swing's lunge.
  - No rooting: steering during a swing's startup, a charging hold blow, a wind-up and a charging hold moves the hero at `actionMove`, and a recovery's slower pace wins.
  - Facing holds on the action while strafing.
  - An automatic swing started on the move lunges and acquires at reach plus lunge.
  - Form step-ins and recoils blend, and a form fires along the press's direction once the hero passes the aim point.
  - Determinism at any frame rate.
- **Existing tests this changes** (update each one to the new rules):
  - `ability-cast.test.ts` (around 60): the wind-up roots.
  - `delve-combat-weight.test.ts` (around 284, 326, 336, 483): committed lunges, a moving automatic swing released, recoils on `recoilSeconds`.
  - `delve-chains.test.ts` (around 612, 626).
  - The client's `anticipation.test.ts`: `committed` false is ignored.
  - Client fixtures that build a `HeroEntity` (`reactions.test.ts` and others): `pushes` and `swaySide`.
- **E2E:** the Delve specs pass.

## Docs and version
- **CLAUDE.md:** the Delve paragraph's "committed blows lunge in, shots and bolts recoil" becomes the weapon styles, the blend and no rooting.
- **Superseded notes:**
  - On the combat-weight spec: the "Hades commit" decision, the `move` definition (ranged recoil over `recoilSeconds`, committed only), the acquisition rule, the lean rule, and rooting.
  - On the ability-system spec: "cast wind-up (roots …)".
  - On the chains spec: "the hero stays rooted" while a hold charges.
- **Comments:** `swingReach`, `startSwing`, `holdTick` and the `dps-sim.ts` comments.
- **Version:** `chore(client): bump version to 0.48.0`.
