# Delve Combat Weight Design

**Date:** 2026-09-25
**Status:** Approved in conversation.
**Engine:** `packages/engine/src/arpg/` (`step.ts`, `abilities/cast.ts`, `abilities/forms.ts`, `abilities/resolve.ts`, `combat.ts`, `bot.ts`), `balance.json → delve.feel`, `delve.json` (weapon combos), `arpg.json` (form motion)
**Client:** `packages/client/src/features/delve/arena/` (`useArena.ts`, `ArenaRenderer.ts`, `fx/`, `ArenaHud.tsx`)

## Goal

Attacks should have weight. Today the hero runs at full speed through every attack, basic hits land on the frame they start, and a Crushing ability fires as instantly as a Swift one, so combat reads as linear running while effects pop in and out. After this change every press does what it looks like:

- a melee strike steps the hero into the blow;
- a combo carries a string of stronger blows forward;
- a bolt is conjured and hurled, a burst is thrown, a lance kicks back;
- quick moves are fast with little motion and chain quickly;
- heavy moves take a moment to wind up and land harder, both visually and mechanically.

The references are Hades and Windblown.

## Decisions

| Question | Decision |
|---|---|
| Movement while attacking | **Hades commit.** Each action takes over movement for its startup, then leaves a short, slowed recovery. The dodge cancels anything. |
| Ability weight | **Weight sets a conjure time**, even for mana-paid abilities, with a heavier payoff (knockback, stagger, hit-stop). The cast payment's channel is added on top. |
| Weapon combos | **Per-weapon strings**, melee and ranged. |
| Scope | **Plan A**: the engine models each action as startup → strike → recovery with one strike moment. Per-tick sweeping hitboxes, multi-hit moves and sprite attack poses are later work. The per-step data leaves room for them. |

## The action model (engine)

Every basic attack and every ability runs through three phases.

1. **Startup.** The hero is committed: move input is ignored and facing is locked. Melee (and forward-moving forms) **step in** during startup. See Motion.
2. **Strike.** The hit or release happens at one moment, from wherever the startup left the hero.
3. **Recovery.** Movement runs at `recoveryMove` (0.4×) until the recovery ends. An ability press, a dodge or the next basic (once allowed) ends it early.

### Hero state

- `swing: { step, dir, targetId, start, strikeAt } | null`: a basic attack in its startup.
- `push: { vx, vy, until, stopId } | null`: motion imposed by an action. It replaces move input while `t < until`. With `stopId` set, the push ends as soon as the gap to that monster is at most `contactGap`, so a lunge stops at the foe and never passes through it.
- `recoverUntil`: slowed movement until this time.
- The existing `windup` is the startup for abilities.

### Movement order in `heroTick`

1. The dash (unchanged).
2. Otherwise, an active `push` moves the hero, clamped to walls like movement, and ends at contact.
3. Otherwise, during `windup` or `swing`, there is no movement.
4. Otherwise, before `recoverUntil`, the hero moves at `recoveryMove` × speed.
5. Otherwise, normal movement.

`h.moving` is only true in cases 4 and 5.

### Cancels

- **Dodge** cancels any phase:
  - A swing ends with no hit and no combo step.
  - A wind-up follows the existing rule: the mana stays spent and the cooldown resets.
  - The push and recovery end.
- **Ability press:**
  - During a swing's startup, it is buffered and fires right after the strike.
  - During any recovery, it fires now and ends the recovery.
  - During another ability's wind-up, it is buffered.
- **Basic attack** during an ability's wind-up: none. During an ability's recovery: it may start once `nextAttackAt` allows, and starting it ends the recovery.

### Input buffer

A Q/E/R press or a manual attack tap made while the hero is committed (wind-up, swing, push or dash) is kept for `buffer` 0.25 s and fires on the first step the hero is free.

- `world.queuedCast` gains a time stamp so it can expire.
- A new `world.queuedAttack` (time plus aim) does the same for taps.
- A held attack keeps attacking without the buffer.

### Automatic mode

Automatic basic attacks don't start a swing while the move input points away from the target (`dot(move, dirToTarget) < retreatDot`, −0.25). The lunge must never drag a retreating hero back into a fight. Manual mode always swings where it is aimed.

## Basic attacks: weapon combo strings

Each weapon base in `delve.json` gains a `combo` array, validated by Zod. The combo step advances at each strike and resets after `attackInterval + basicComboGrace` without a strike (the existing rule). One entry per step:

| Field | Meaning |
|---|---|
| `time` | This step's share of `attackInterval`. The step's cycle is `attackInterval × time`, and attack speed and Surge scale it as they scale the interval today. |
| `startup` | Share of the cycle before the strike. |
| `step` | Units of motion. Melee: a lunge toward the target or aim during startup (contact-stopped). Ranged: recoil (negative) over `recoilSeconds` after the release. |
| `power` | Damage multiplier. Replaces today's fixed 1.5× every third hit. |
| `heft` | 0–1: how hard the step lands (hit-stop, camera kick, sparks). |
| `arc`, `reach` | Melee: swing arc (degrees; defaults to the weapon's) and extra range. |
| `knockback`, `stagger` | Optional shove, and whether the step applies `stagger`. |
| `size`, `explode`, `speed` | Ranged: projectile size multiplier, burst radius on impact, speed multiplier. |

The next swing may start at `start + cycle` (`nextAttackAt`). The recovery lasts from the strike to that moment.

Starting strings (tuned against the pacing guard rails). Across a full string, damage per second stays within about 10% of today's.

| Weapon (interval) | Steps: time / startup / step / power / heft, extras |
|---|---|
| Dagger (0.55) | jab .8/.3/.25/.8/.15 ×2, jab .8/.3/.3/.9/.15, **flurry** 1.4/.35/.7/1.7/.6 (arc 150, knockback .3) |
| Sword (0.8) | slash .9/.3/.4/1.0/.3, backslash .9/.3/.4/1.0/.3, **thrust** 1.3/.4/1.2/1.7/.8 (arc 50, reach +.9, knockback .6) |
| Axe (1.05) | sweep .9/.35/.3/1.0/.4 ×2, **spin** 1.3/.4/.5/1.7/.8 (arc 360, knockback .5) |
| Maul (1.4) | **overhead** 1.0/.45/.5/1.1/.6 (arc 140), **slam** 1.3/.5/.7/2.0/1.0 (arc 360, reach +.4, knockback .8, stagger) |
| Wand (0.5) | flick .9/.2/−.05/.9/.1 ×2, **flare** 1.2/.25/−.1/1.3/.3 (size 1.5) |
| Staff (0.9) | orb .9/.3/−.1/.9/.2 ×2, **great orb** 1.3/.45/−.3/1.4/.6 (size 1.8, explode 1.0) |
| Bow (0.75) | shot .85/.35/−.05/.85/.2 ×2, **drawn shot** 1.4/.6/−.2/1.6/.6 (speed 1.4) |

- **Direction:** the swing's direction is set when the swing starts (aim, else the target, else the facing) and doesn't track afterwards. The lunge closes the gap instead.
- **Strike:** hits resolve with today's rules (arc, range and crit roll, status chances, mana on a connecting swing or on a shot with a foe in range) from the hero's position at the strike.
- **Twin Fang** now fires on each string's last step instead of every third attack.
- **HUD:** the ⚔️ button's combo pips read the weapon's string length.

## Abilities: weight in time

In `resolveAbility`, `castTime` (the existing wind-up) becomes `conjure + channel`:

- `conjure = feel.conjure[weight + 2] × feel.conjureSlot[slot]`. Swift to Crushing is 0.04 / 0.08 / 0.14 / 0.24 / 0.38 s, and the slot multipliers are primary 1, defensive 0.5, ultimate 1.6.
- `channel` is today's cast-payment time, and only applies to that payment.

The existing wind-up logic carries this unchanged: mana paid at the press, auto-aim re-chosen at landing, dodge-cancel rules and the `windup` event.

### Motion

Each form in `arpg.json` gains a `motion` value in units, scaled by `1 + motionPerWeight × weight` (0.3) and by the press-combo multiplier.

| Motion | When it happens | Forms |
|---|---|---|
| Positive (step in) | During the wind-up, toward the aim point, contact-stopped | Strike .5 (its slam press leaps: the 1.8× combo step gives about .9), Burst .2, Barrage .15, Maelstrom .2 |
| Negative (recoil) | After the release, over `recoilSeconds` 0.08 | Bolt −.15, Volley −.1, Lance −.3 |
| None | — | Nova, Ward, Armor and Surge (Blink keeps its own dash) |

### Recovery and payoff

- **Recovery** after an ability fires lasts `feel.recovery[weight + 2]`: 0.06 / 0.1 / 0.16 / 0.24 / 0.34 s.
- **Heavy payoff:** each weight step above Balanced adds `heavyKnockback` 0.25 knockback, and Crushing abilities also apply `stagger` (normal stagger rules and immunity). Both merge into the ability's knobs.

### Burst is thrown

Burst spawns a hero zone (`source: 'burst'`) at the aim point with `detonateAt = t + lobBase + distance / speed`. That is the same path as a Barrage impact. It explodes with the step's radius and damage when it lands.

- `lobBase` is 0.12 s.
- The Burst form gains `speed` 30, so weight slows or quickens the throw through the existing speed knob. That gives about 0.33–0.47 s at 8 units.
- The zone records the launch point (`fromX`, `fromY`) so the client can draw the arc.

Lance stays an instant line at release. Its motion is the recoil, and its look is the extension (see Feel).

### Heft

Heft (0–1) measures how hard something lands. It drives the client's feel and never the rules.

- **Basics:** the step's `heft`.
- **Abilities:** `feel.heft[weight + 2]` (0.15 / 0.3 / 0.45 / 0.7 / 1.0), +0.2 on a press-combo's last step and +0.2 for ultimates, capped at 1.
- **Events:**
  - `HitOpts.heft` flows into the `hit` event (`heft`).
  - `basic` gains `heft`, `step` and `dir`.
  - `cast` gains `heft`.

## Feel (client, display only)

The simulation stays fixed-step and deterministic. All of this changes only the display clock and drawing.

- **Hit-stop:**
  - The display clock freezes for the frame's largest hit: 0 ms below heft 0.3, otherwise `90 × heft` ms.
  - A crit adds 20 ms, and killing an elite or boss is at least 120 ms. The cap is 120 ms.
  - It sits beside the perfect-dodge slow-mo in `useArena`, and a freeze beats slow-mo.
- **Camera:**
  - A strike or release kicks the camera `0.12 × heft` units in its direction, easing back over about 0.12 s.
  - Heft ≥ 0.7 also adds shake.
- **Anticipation:**
  - During a swing's startup or a wind-up, the hero sprite leans 1 px back from the aim, and lifts 1 px at heft ≥ 0.7. It snaps forward at the strike.
  - Mana pixels gather at the hand, more with heft.
  - Heavy conjures (heft ≥ 0.7) spiral in and grow a pixel orb at the hand.
- **Swings sweep:**
  - A melee strike draws a pixel smear that travels across its arc over about 0.1 s. Steps alternate sides (slash, then backslash).
  - Finishers are longer and brighter, with a pixel shockwave at the tip.
  - Spins sweep the full circle.
  - Slams burst a ring of ground pixels and dust.
- **Nothing blinks:**
  - Projectiles pop in at the hand over their first 0.05 s with a muzzle spark.
  - A thrown Burst flies an arc (drawn height `sin(πp) × 0.25 × distance`) above a ground shadow, with a hero-coloured landing ring.
  - A lance extends from the hand over 0.06 s, then fades from base to tip, shedding pixels.
  - When a projectile, zone, ward or buff ends, its pixels scatter and drift instead of vanishing. The renderer notices removed ids and the end of `h.defend`.
- **The sprite-only lunge is removed** from `ManaFx`, since the engine now moves the hero.

## Bot and pacing

The bot keeps its inputs and plays under the same commit rules. Pacing is re-checked with `tests/delve-pacing.test.ts`. If a band drifts, tune in this order:

1. the weapon strings;
2. the `feel` numbers;
3. monsters, only as a last resort.

## Testing

Engine tests (TDD, `tests/delve-combat-weight.test.ts`, using the shared arena fixture):

- **Lunge:** a melee swing moves the hero toward a dummy during startup by at most `step`, stopping at `contactGap`.
- **Strike timing:** damage lands at `strikeAt`, not at the press.
- **Commit and recovery:** move input is ignored during startup, and the hero moves at `recoveryMove` × speed during recovery.
- **Dodge cancel:** a dodge during startup cancels the swing (no damage, combo unchanged).
- **Combo strings:**
  - The sword's third step reaches `reach` further with its narrow arc and knockback.
  - The maul's string has two steps, the second a 360° staggering slam.
  - A string resets after the grace period.
- **Ranged:** a ranged step recoils the hero after the release.
- **Buffer:** a Q press during a swing's startup fires right after the strike. A press older than `buffer` is dropped.
- **Automatic mode:** it doesn't start a swing while retreating.
- **Conjure:** the wind-up equals `conjure` for mana-paid abilities of each weight, and `conjure + channel` for cast-paid. Defensives take half and ultimates 1.6×.
- **Ability motion:** Bolt recoils after release. Strike steps in before its hit.
- **Heavy payoff:** Crushing adds knockback and stagger.
- **Burst:** no damage before the lob lands, then an explosion at the aim point.
- **Heft:** heft appears on `hit`, `basic` and `cast` events.
- **Determinism:** the same seed and inputs give the same world.

Existing engine tests that expect instant hits or instant ability fires are updated to step past the startup or wind-up.

Client:

- a unit test for the hit-stop function (events → ms);
- the existing Delve and controller E2E suites still pass.

## Out of scope

- Per-tick sweeping hitboxes, multi-hit moves and frame-precise cancel windows (the "state machine" follow-up).
- Hero sprite attack poses (art, via `pixel-forge`).
- Rhythm or timing bonuses.
- Monster attack changes.
