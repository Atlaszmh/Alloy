# Delve weapon flow: blows and casts that move with the fight

**Status:** approved design, 2026-09-29. It follows v0.47.0 (`2026-09-29-delve-chain-feel-design.md`) and ships as v0.48.0.

## Why

The user wants combat to flow: the player weaving through a fight, in full control, while basic attacks and abilities keep firing, with a movement style that changes with each weapon and ability kit. Today the opposite happens:
- **Attacks root the hero.** A committed basic swing, an ability's wind-up and a charging hold all root the hero (`step.ts`: `rooted = windup || hold || swing.committed`).
- **Moving drops a swing's motion.** An automatic swing commits only while the hero stands still, and moving releases it, dropping its lunge.
- **A push replaces steering.** While a lunge, step-in or recoil runs, the stick does nothing.
- **Little motion to begin with.** Only melee weapons lunge (sword 0.4 to 1.2 units). Staves, wands and bows barely recoil (0.05 to 0.3).

## Decisions (the user's)

| Question | Decision |
|---|---|
| How does a blow's motion meet the player's movement? | **It blends with steering.** No basic attack roots the hero. Each blow adds a short burst of motion on top of the player's movement, and the stick bends it: a staff sidesteps toward the side being steered. |
| Each weapon's style | **The table below.** Dagger darts in and hops out; sword steps in and lunges; axe steps in and wades; maul plants, then leaps; staff sways; wand flicks and circles; bow steps back from danger. Distances grow with the blow's kind: light, medium, heavy, then a charged hold. |
| When a blow's motion points against the steering | **Steering wins.** The part of the motion that fights the steering is dropped; the rest applies. Standing still, the full motion applies. |
| Abilities | **They stop rooting.** Wind-ups and charging holds let the hero move, slowed. Each form's own motion (Strike's step-in, Bolt's recoil) blends with steering like a blow's. |
| Balance | Measure pacing before and after. If a rail breaks, stop and bring the numbers to the user rather than tune. |

## Design

### Weapon styles

Each weapon's `feel` rows in `delve.json` hold these per kind. All are starting values, tunable in data:
- `move`: distance along the attack direction; positive is in, negative is back.
- `side` (new): sideways distance.
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

- **Direction.** The attack direction is the swing's direction: toward its target, the nearest foe in reach, or the manual aim.
  - A forward `move` goes along it and stops at the contact gap of the foe it lunges at, as today.
  - A negative `move` and a `hop` go away from it.
  - A `side` step is perpendicular to it.
- **Timing.**
  - A forward `move` runs during the blow's startup, as today's lunge: planted for `lungeHold`, then the lunge.
  - A negative `move`, a `side` and a `hop` run from the strike, over `feel.stepSeconds` (new, 0.15 s). So the blow lands, then the hero steps.
  - A strike that has both a back step and a side step makes one push, their sum.
- **Which side.** When the player steers with a lateral part (relative to the attack direction) above the stick's deadzone, the side step goes that way. Otherwise the weapon's sway rule (new `sway` on the weapon base) picks it:
  - `alternate` (the staff) flips side each blow;
  - `orbit` (the wand) keeps the last side, so the hero circles the target.

  The last side is kept on the hero (`HeroEntity.swaySide`, 1 or −1, starting at 1).
- **A manual hold blow** moves by the row it strikes with: its stage's kind.
- **Unarmed** (`hero.feel`) keeps today's small lunge and no side step.

### Blend and control
- **One movement per tick.** The hero's displacement each tick is its steering's, plus that tick's slice of any push. A push still advances by progress (its start, end and hold) as today; `pushTick` hands the slice back instead of moving the hero alone.
- **Steering wins.** While the player steers (stick speed above 0.05), the part of a push's slice pointing against the steering direction is dropped: with `u` the steering direction, a slice `d` with `d·u < 0` becomes `d − (d·u)u`. Standing still, the whole slice applies.
  - A lunge still stops at its foe's contact gap, measured along the path actually taken.
  - The arena's edges still clamp.
- **No rooting from attacks.** A basic swing, an ability's wind-up and a charging hold no longer root the hero.
  - While any of them runs, the hero moves at `feel.actionMove` (new, 0.6) of its pace.
  - A recovery's `recoveryMove` (0.4) still applies, and the slower of the two wins.
  - The dodge's dash still takes over completely.
- **Moving no longer releases a swing.** An automatic swing started while moving still makes its motion.
  - Today's `committed` flag stops gating motion and rooting. It keeps deciding whether a blow sets a recovery (a manual blow, or an automatic one started standing still), as today.
  - A swing whose target dies in its startup is still dropped.
- **Facing.** The hero faces the attack direction for the blow's startup, and faces its steering again once the blow strikes.

### Abilities
- **No rooting.** Wind-ups (`h.windup`) and charging holds (`h.hold`) move the hero at `actionMove`.
- **Form motion blends.** A form's step-in (`motion > 0`, during the conjure) and recoil (`motion < 0`, after it fires) blend with steering like a blow's. The step-in still never passes the aim point, and still stops at a foe.
- **Unchanged:** Blink's dash, the Defensive effects, and every form's reach and aim.

## Engine surface
- `delve.json`: feel rows gain `side` and `hop` (default 0); weapon bases gain `sway` (`alternate` or `orbit`, default `alternate`).
- `balance.json → delve.feel`: `stepSeconds` 0.15 and `actionMove` 0.6.
- `schemas.ts`: the new fields, validated.
- `types/arpg.ts`: `HeroEntity.swaySide`.
- `basic.ts`: the startup lunge on every swing; the strike's step (back, side, hop).
- `action.ts`: `pushTick` returns its slice.
- `step.ts`: one movement per tick, with the projection; no rooting from attacks; the slowdown; no release of a moving swing.
- `abilities/cast.ts`: form motion through the same path.

## Balance and gates
- **The DPS Lab** holds every position after each step, so its grid should come out byte-identical to v0.47.0. That's the gate for "no unintended rule change".
- **Pacing:** measure `pacing.mjs` before and after. Bows now kite, and melee lunges and leaps. Every rail must hold. If one breaks, stop and report the numbers; the fix is the user's call.

## Testing
- **Engine:**
  - Each weapon's motion by kind: the lunge distance to contact, a bow's step back, a staff alternating its side, a wand keeping its side, a dagger's hop after its heavy blow, and a maul's leap.
  - The side follows the steering's lateral part.
  - The projection: a lunge while steering away moves the hero only along the steering, and a sideways component survives.
  - No rooting: steering during a swing's startup, a wind-up and a charging hold moves the hero at `actionMove`, and a recovery's slower pace wins.
  - An automatic swing started on the move still lunges.
  - Form step-ins and recoils blend.
  - Determinism at any frame rate.
- **Existing tests this changes:** any that assert rooting or a released automatic swing (the combat-weight and chains tests). Update them to the new rules and list them in the plan.
- **E2E:** the Delve specs pass.

## Docs and version
- **CLAUDE.md:** the Delve paragraph's "committed blows lunge in, shots and bolts recoil" becomes the weapon styles and the blend.
- **Superseded notes:**
  - the combat-weight spec: rooting, and a moving automatic swing released;
  - the chains spec: "the hero stays rooted" while a hold charges.
- **Version:** `chore(client): bump version to 0.48.0`.
