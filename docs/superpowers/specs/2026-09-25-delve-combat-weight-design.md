# Delve Combat Weight Design

**Date:** 2026-09-25
**Status:** Approved in conversation.
**Engine:** `packages/engine/src/arpg/` (`step.ts`, `world.ts`, `dodge.ts`, `combat.ts`, `bot.ts`, `abilities/cast.ts`, `abilities/forms.ts`, `abilities/impact.ts`, `abilities/resolve.ts`), `src/delve/hero-stats.ts`, `src/types/` (`arpg.ts`, `ability.ts`, `delve.ts`), `src/data/schemas.ts`, `balance.json → delve.feel`, `delve.json` (weapon combos, Twin Fang text), `arpg.json` (form motion)
**Client:** `packages/client/src/features/delve/` (`arena/useArena.ts`, `arena/ArenaRenderer.ts`, `arena/fx/`, `arena/ArenaHud.tsx`, `AbilitiesPanel.tsx`, the paper doll's attack rate)

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

1. **Startup.** The hero is committed: move input is ignored and facing is locked. Melee and forward-moving forms **step in** during it.
2. **Strike.** The hit or release happens at one moment, from wherever the startup left the hero.
3. **Recovery.** A short tail after the strike. Movement runs at `recoveryMove` (0.4×) until `recoverUntil`. An ability press, a dodge or the next basic ends it early.

### Committed and free

**Committed** means an ability wind-up (`windup`), a committed swing's startup (including its lunge) or a dash.

- Only a wind-up or a dash **holds** an ability press in the buffer. A swing's startup is cancelled by one instead (see Cancels).
- A recoil push (after a release) moves the hero but doesn't commit: presses fire during it.

### Hero state

- `swing: { step, dir, targetId, start, strikeAt, cycle, committed } | null`: a basic attack in its startup. `committed` is decided when the swing starts (see Automatic mode).
- `push: { fromX, fromY, dx, dy, start, until, stopId } | null`: motion imposed by an action (a lunge, an ability step-in or a recoil). It replaces move input while `t < until`.
  - **Placement:** the hero is placed by progress along it, as `dodgeTick` places the dash, so even a push shorter than one tick covers its full distance.
  - **Contact stop:** with `stopId` set, the push ends as soon as the gap between the hero and that monster is at most `contactGap` (0.15), so a lunge stops at the foe and never passes through it. A lunge whose foe dies ends at once.
  - **Walls** clamp it as they clamp movement.
  - A swing's lunge belongs to the swing and ends with it.
- `recoverUntil`: slowed movement until this time.
- `windup` (existing) gains `step` (the press-combo step, chosen at the press) and `conjureUntil` (the end of the conjure part; any channel follows).

### `heroTick` order

1. **Potion** (unchanged).
2. **Dash**, then a **queued dodge** (`tryDodge`, which also cancels: see Cancels).
3. **Queued cast.** A stale press (past its `queuedCastUntil`, see Input buffer) is dropped. During a wind-up or a dash, a fresh press stays queued. Otherwise, if the cast can go ahead (ready, affordable, something to aim at), any swing in its startup is cancelled **first** (see Cancels), then `castAbility` starts the cast, so the ability's own step-in isn't cleared by the cancel. If it can't (cooldown, no mana with its `noMana` event, nothing to aim at), the press is used up and the swing carries on.
4. **`castTick`**: land a finished wind-up, then apply its recoil push and recovery.
5. **Movement**:
   1. an active push moves the hero;
   2. otherwise, during a wind-up or a committed swing, there is no movement;
   3. otherwise, before `recoverUntil`, the hero moves at `recoveryMove` × speed;
   4. otherwise, normal movement.

   `h.moving` is true only in cases 3 and 4.
6. **Strike**: if a swing's `strikeAt` has come, resolve it (see Basic attacks).
7. **New swing**: if there is no swing or wind-up, no push is still moving the hero (a lunge, an ability step-in or a recoil), the hero isn't dashing, `t ≥ nextAttackAt`, and the mode wants to attack, start one.
8. **Mana regen, lull charge, `defendTick`** (unchanged).

### Cancels

- **Dodge** cancels any phase:
  - **Swing:** it ends with no hit, the combo step doesn't advance, and `nextAttackAt = t`, so a dash can go straight into an attack.
  - **Wind-up:** the mana stays spent and the cooldown resets (today's rule). A charge payment is refunded (`charge[slot]` is restored), so a dodge never throws away a charged Ultimate.
  - **Push and recovery:** both end.
- **Ability press** (fresh, no wind-up or dash in progress):
  - **During a swing's startup** (lunge included): if the cast can go ahead, the swing is cancelled first (as the dodge does: no hit, no step, lunge ended, `nextAttackAt = t`) and then the cast starts. If it can't, the swing is untouched, so mashing Q on cooldown never stops the basics.
  - **During any recovery or recoil:** it casts now and ends them.
- **Basic attack:** none during a wind-up, and none while a push is still moving the hero, so a lunge never swallows an ability's recoil or step-in (it costs at most `recoilSeconds` after a recoil). During an ability's recovery it may start once `nextAttackAt` allows and the push has ended. A committed swing ends the recovery; an automatic one on the move doesn't.
- **Weapon swap** (`refreshWorldHero`) to a different weapon base drops a swing in progress (and its lunge), resets the string to its first step and readies the weapon (`nextAttackAt` no later than now). Gear with the same weapon base leaves the swing alone.

### Input buffer

A press is kept `buffer` (0.25 s) seconds. While a wind-up or a dash holds it (for a tap, also a swing, a push or the weapon's current cycle), it doesn't age: `heroTick` renews its deadline (`world.queuedCastUntil`, `queuedAttack.until`) every tick it is held. Past the deadline it is dropped (step 3). A press nothing holds is used at once, and a tap left behind when the input turns automatic is dropped (automatic swings would otherwise hold it forever). Manual attack taps get the same treatment:

- `ArpgInput` gains `attackTap?: boolean`, true on the frame the button was pressed. Mouse and keyboard already track this, and the controller sets it on the press edge of its attack button.
- In manual mode, `stepWorld` records a tap as `world.queuedAttack = { until, aim }` **before** running any tick, as it does `queuedCast`. So a tap made during a hit-stop freeze (a `dt` of 0 runs no ticks) isn't lost.
- A fresh queued tap starts the next swing once one is allowed (step 7). A held attack keeps attacking without the buffer.

### Automatic mode

Automatic attacks **commit only while the hero stands still**. A swing's `committed` flag is set at its start:

| Mode | `committed` |
|---|---|
| Manual | Always true. |
| Automatic | True only when the move input is zero (length ≤ 0.05). |

An uncommitted swing:

- has no lunge and no recoil;
- doesn't stop movement during its startup;
- leaves no recovery slow.

It still strikes at `strikeAt`, from wherever the hero is by then. Automatic mode acquires targets within `range + reach + move` when standing (the lunge closes the gap), and within `range` on the move.

So a planted fight gets the full weight, while kiting and running past foes play as they do today. The bot uses automatic mode, and its ranged retreat keeps firing.

## Basic attacks: weapon combo strings

Each weapon base in `delve.json` gains a `combo` array, validated by Zod (optional in the gear-base schema). A weapon without one, including the unarmed fallback in `hero-stats.ts`, uses `balance.json → delve.hero.defaultCombo`. `HeroWeapon` gains `combo`.

The string advances one step at each strike and resets after `attackInterval + basicComboGrace` without a strike (today's rule, measured from the last strike). One entry per step:

| Field | Meaning |
|---|---|
| `time` | This step's share of `attackInterval`. The step's **cycle** is `attackInterval × time`, and attack speed and Surge scale it as they scale the interval today. |
| `startup` | Share of the cycle before the strike. |
| `move` | Units of motion. Melee: a lunge over the startup toward the target or aim, contact-stopped on the target. Ranged: recoil (negative) over `recoilSeconds` (0.08) after the release. |
| `power` | Damage multiplier. Replaces today's fixed 1.5× every third hit. |
| `heft` | 0–1: how hard the step lands (hit-stop, camera kick, sparks). |
| `arc`, `reach` | Melee: swing arc (degrees; defaults to the weapon's) and extra range. |
| `knockback`, `stagger` | Optional shove, and whether the step applies `stagger`. |
| `size`, `explode`, `speed` | Ranged: projectile size multiplier, burst radius, speed multiplier. |

**Timing.** At the start, `strikeAt = start + cycle × startup` and `nextAttackAt = start + cycle`. At the strike, a committed swing sets `recoverUntil = min(nextAttackAt, strikeAt + cycle × basicRecovery)`, where `basicRecovery` is 0.35. The rest of the cycle is free movement.

**Direction.** The swing's direction is set when it starts (aim, else the target, else the facing) and doesn't track afterwards. The lunge closes the gap instead.

**Strike.** Hits resolve with today's rules (arc, range and one crit roll per swing, status chances, mana on a connecting swing or on a shot with a foe in range) from the hero's position at the strike. The `basic` event fires at the strike, not at the start. The client reads `h.swing` for the startup.

**Exploding shots** (`explode` > 0, the staff's great orb). On its first hit, or at the end of its flight, the shot bursts:

- it deals its damage to every foe within `explode` (each foe once);
- hits follow the basic rules (`source: 'basic'`, can crit, the shot's statuses);
- it pushes an `explode` event.

Mana is unchanged: once per shot, at the release.

Starting strings (tuned against the pacing guard rails). Across a full string, damage per interval stays within 10% of today's 1.167 for melee and 1.0 for ranged.

| Weapon (interval) | Steps: time / startup / move / power / heft, extras |
|---|---|
| Dagger (0.55) | jab .8/.3/.25/.8/.15 ×2, jab .8/.3/.3/.9/.15, **flurry** 1.4/.35/.7/1.7/.6 (arc 150, knockback .3) |
| Sword (0.8) | slash .9/.3/.4/1.0/.3, backslash .9/.3/.4/1.0/.3, **thrust** 1.3/.4/1.2/1.7/.8 (arc 50, reach +.9, knockback .6) |
| Axe (1.05) | sweep .9/.35/.3/1.0/.4 ×2, **spin** 1.3/.4/.5/1.7/.8 (arc 360, knockback .5) |
| Maul (1.4) | **overhead** 1.0/.45/.5/1.0/.6 (arc 140), **slam** 1.3/.5/.7/1.8/1.0 (arc 360, reach +.4, knockback .8, stagger) |
| Wand (0.5) | flick .9/.2/−.05/.9/.1 ×2, **flare** 1.2/.25/−.1/1.3/.3 (size 1.5) |
| Staff (0.9) | orb .9/.3/−.1/.9/.2 ×2, **great orb** 1.3/.45/−.3/1.4/.6 (size 1.8, explode 1.0) |
| Bow (0.75) | shot .85/.35/−.05/.85/.2 ×2, **drawn shot** 1.4/.6/−.2/1.6/.6 (speed 1.4) |
| Default / unarmed | punch .9/.3/.3/1.0/.2 ×2, **haymaker** 1.2/.35/.5/1.3/.4 (knockback .3) |

**Twin Fang** fires on each string's **last** step instead of every third attack. Each trigger is worth what it is today; only how often it triggers changes with the string length. Its text in `delve.json` changes to match.

- **Melee:** the extra hit is `twin_fang%` of weapon damage × 1.5 (today's finisher).
- **Ranged:** the extra shot deals `twin_fang%` of weapon damage (×1.0, as today). It copies the step's `size` and `speed` but never `explode`, so the staff's great orb doesn't burst twice.

**Stats and UI:**

- The ⚔️ button's combo pips read the string length.
- The paper doll's attacks per second becomes `steps / Σ cycle`.
- `estimateCombat` (`hero-stats.ts`) uses the string's `Σ power / Σ time` in place of today's hard-coded finisher factor, and Twin Fang's rate becomes `1 / steps`. Its ability `useInterval` becomes `cooldown + channel`, since the conjure no longer slows the fire rate.

## Abilities: weight in time

`ResolvedAbility` gains `conjure`, `channel` and `heft`, and `castTime = conjure + channel`:

- `conjure = feel.conjure[weight + 2] × feel.conjureSlot[slot]`. Swift to Crushing is 0.04 / 0.08 / 0.14 / 0.24 / 0.38 s, and the slot multipliers are primary 1, defensive 0.5, ultimate 1.6.
- `channel` is today's cast-payment time. It is 0 for mana and charge payments.

Every ability now winds up through the existing machinery: auto-aim re-chosen at landing, the landing fallback point and dodge cancels.

- **Payment:** mana and charge are still paid at the press.
- **Cooldown:** it now counts from `press + channel`, not from the landing. The conjure overlaps the cooldown, so it doesn't lower the fire rate. A Balanced primary still fires every 0.45 s when held.
- **Press-combo step:** chosen at the press (`t_press − comboAt[slot] ≤ comboWindow` → next step, else 0) and stored on the wind-up. `comboStep` and `comboAt` update at landing, as today.
- **HUD and Abilities panel:**
  - The wind-up progress ring and bar, and the "busy" dimming, show only for the channel (`channel > 0`). A conjure shows as anticipation in the arena, not in the HUD.
  - The "busy" comment is updated, because presses now buffer.
  - The Abilities panel lists the total wind-up (conjure + channel) for every ability, since weight now changes timing.

### Motion

Each form in `arpg.json` gains `motion` in units, scaled by `1 + motionPerWeight × weight` (0.3) and by the step's press-combo multiplier.

| Motion | When it happens | Forms |
|---|---|---|
| Positive (step in) | Spread over the **conjure** (never the channel, where the hero stands and channels), toward the aim point and never past it. It is contact-stopped on the nearest monster within 1.5 units of that point, if any; if that foe dies mid-conjure, the step-in ends at once (as a lunge does). | Strike .5 (its 1.8× slam press leaps about .9), Burst .2, Barrage .15, Maelstrom .2 |
| Negative (recoil) | After the release, over `recoilSeconds` | Bolt −.15, Volley −.1, Lance −.3 |
| None | — | Nova, Ward, Armor and Surge (Blink keeps its own dash) |

The Strike form's hits resolve at landing, from where the step-in left the hero.

### Recovery

After an ability lands, `recoverUntil = t + feel.recovery[weight + 2]`: 0.06 / 0.1 / 0.16 / 0.24 / 0.34 s. The Defensive slot has **no** recovery, so a Blink or Ward can always be moved out of.

### Heavy payoff

- `ResolvedAbility` gains `heavyKnockback` (`heavyKnockback` 0.25 per weight step above Balanced) and `heavyStagger` (Crushing only). These are separate fields, **not knobs**, so they never reach Surge's basic statuses, Armor or Ward retaliation, zone ticks or embers.
- `hitOpts(ab, from, tick = false, direct = !tick)` gains a `direct` flag. It only decides the heavy payoff and heft; `tick` keeps its current meaning (no crit, no knockback).
- **Direct** hits get them:
  - `impact` without `tick`: bolt, volley and Burst explosions, Barrage impacts, Nova, the Ward's closing burst;
  - Lance, Strike and the Blink trail.
- Chain jumps pass `direct: false`: they keep today's crit and element knockback but get no heavy payoff and no heft.
- Zone and ember ticks, DoTs, reactions and thorns never get them.
- Stagger uses the normal rules and immunity.

### Burst is thrown

Burst spawns a hero zone (`source: 'burst'`) at the aim point:

- `detonateAt = t + lobBase + distance / speed`, the same path as a Barrage impact.
- It explodes with the step's radius and damage when it lands.
- `lobBase` is 0.12 s, and the Burst form gains `speed` 30, so weight slows or quickens the throw through the existing speed knob. That is about 0.33–0.47 s at 8 units.
- Zones gain optional `fromX` and `fromY` (the launch point) so the client can draw the arc. Other zone builders leave them unset.

Lance stays an instant line at release. Its motion is the recoil, and its look is the extension (see Feel).

### Heft

Heft (0–1) measures how hard something lands. It drives the client's feel and never the rules. Only **direct hits** carry it; every other hit has heft 0.

| Source | Heft |
|---|---|
| Basic strikes (melee hits, basic shots, exploding shots) | the step's `heft` |
| Ability direct hits (those that get the heavy payoff) | the ability's `heft` |
| Barrage impacts | half the ability's `heft` |
| Chains, ticks, DoTs, reactions, thorns | 0 |

The ability's heft is `feel.heft[weight + 2]` (0.15 / 0.3 / 0.45 / 0.7 / 1.0), plus 0.2 for the Ultimate slot, plus 0.2 on the last step of a press-combo of two or more steps, capped at 1.

**Events:**

- `HitOpts.heft` flows into the `hit` event (`heft`).
- `basic` gains `heft`, `step`, `dir` and `finisher` (the last step).
- `cast` and `windup` gain `heft`.

### `delve.feel` (balance.json, Zod-validated, `DelveBalance` type updated)

| Key | Value |
|---|---|
| `conjure` | [0.04, 0.08, 0.14, 0.24, 0.38] |
| `conjureSlot` | { primary 1, defensive 0.5, ultimate 1.6 } |
| `recovery` | [0.06, 0.1, 0.16, 0.24, 0.34] |
| `heft` | [0.15, 0.3, 0.45, 0.7, 1.0] |
| `recoveryMove` | 0.4 |
| `basicRecovery` | 0.35 |
| `motionPerWeight` | 0.3 |
| `recoilSeconds` | 0.08 |
| `contactGap` | 0.15 |
| `buffer` | 0.25 |
| `heavyKnockback` | 0.25 |
| `lobBase` | 0.12 |

`delve.hero.defaultCombo` holds the default string.

## Feel (client, display only)

The simulation stays fixed-step and deterministic. All of this changes only the display clock and drawing.

- **Hit-stop:**
  - The display clock freezes for the frame's largest direct hit: 0 ms below heft 0.3, otherwise `90 × heft` ms.
  - A crit adds 20 ms, and killing an elite or boss is at least 120 ms. The cap is 120 ms.
  - A new freeze can't start within 150 ms of the last one ending, so a dagger, Volley and Barrage together don't stutter.
  - It sits beside the perfect-dodge slow-mo in `useArena`, and a freeze beats slow-mo.
  - Inputs made during a freeze are recorded by `stepWorld` (see Input buffer).
- **Camera:**
  - A strike or release kicks the camera `0.12 × heft` units in its direction, easing back over about 0.12 s.
  - Heft ≥ 0.7 also adds shake.
- **Anticipation:**
  - During a committed swing's startup or a wind-up, the hero sprite leans 1 px back from the aim, and lifts 1 px at heft ≥ 0.7. It snaps forward at the strike.
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

The bot plays under the same rules: automatic mode, so it commits when planted and swings on the move while retreating. One change: it doesn't press the Primary while a swing is in its startup, so heavy weapons' blows land instead of being cancelled every time the Primary is ready. Pacing is re-checked with `tests/delve-pacing.test.ts`. Expected drift:

- basic mana gain shifts with strike rates;
- a Burst now misses more often (0.33–0.47 s of flight);
- planted melee fights commit.

If a band drifts, tune in this order:

1. the weapon strings;
2. the `feel` numbers;
3. monsters, only as a last resort.

## Testing

Engine tests (TDD, `tests/delve-combat-weight.test.ts`). In `tests/fixtures/arena.ts`, `press()` now steps past the wind-up, so the existing ability tests that expect the effect keep working. A new `pressOnly()` keeps today's single step for the three tests that need the wind-up still in progress:

- `delve-dodge.test.ts`: "cancels a cast wind-up" and "holds a cast pressed mid-dash";
- `ability-cast.test.ts`: "roots the hero through the wind-up".

`ability-cast.test.ts`'s "every third swing is a finisher" test becomes a string test. Every other existing test that expects an instant cast or an instant basic hit is updated to step past the conjure or startup. Known ones:

- `arpg-sim.test.ts` (the cast-tap tests);
- `delve-manual-attack.test.ts` (it counts `basic` events on the press step);
- `delve-dodge.test.ts` ("holds a cast pressed mid-dash" runs through the dash and the conjure).

- **Lunge:** a committed melee swing moves the hero toward a dummy during startup by at most `move`, stopping at `contactGap`.
- **Strike timing:** damage lands at `strikeAt`, not at the start, and the `basic` event fires then.
- **Commit and recovery:**
  - Move input is ignored during a committed startup.
  - The hero moves at `recoveryMove` × speed during recovery, and at full speed for the rest of the cycle.
- **Automatic mode:** a swing started while moving doesn't push, root or slow.
- **Swing cancels:**
  - A dodge, or a **successful** ability press, during startup (lunge included) cancels the swing: no damage, no step, `nextAttackAt = t`.
  - A press on cooldown leaves the swing untouched.
  - A Strike pressed during a swing's startup still steps in.
- **Wind-up dodge-cancel:** mana stays spent, charge is refunded and the cooldown resets.
- **Combo strings:**
  - The sword's third step reaches `reach` further with its narrow arc and knockback.
  - The maul's string has two steps, the second a 360° staggering slam.
  - A string resets after the grace period.
  - A weapon swap resets it.
- **Ranged:**
  - A committed ranged step recoils the hero after the release. An uncommitted one doesn't.
  - The staff's great orb bursts on a crowd.
- **Buffer:**
  - A Q press during another wind-up fires when it lands.
  - A press is dropped `buffer` after whatever kept the hero busy ends.
  - A tap recorded while `dt` is 0 is not lost.
- **Conjure and cooldown:**
  - The wind-up equals `conjure` for mana and charge payments, and `conjure + channel` for cast payment. Defensives take half and ultimates 1.6×.
  - A held Balanced primary keeps its 0.45 s cadence.
- **Ability motion:**
  - Bolt recoils after release.
  - Strike steps in during the conjure and hits from there.
  - The combo step is fixed at the press.
- **Heavy payoff:** Crushing adds knockback and stagger to direct hits, but not to a Maelstrom's ticks, chain jumps or Surge's basic hits. Chain jumps still crit.
- **Burst:** no damage before the lob lands, then an explosion at the aim point.
- **Heft:** heft appears on direct `hit` events, and is 0 on ticks and chains.
- **Twin Fang:** it triggers on the last step, at today's per-trigger value for melee and ranged.
- **Determinism:** the same seed and inputs give the same world.

Client:

- unit tests for the hit-stop function (events → ms, spacing) and the HUD pips;
- the existing Delve and controller E2E suites still pass.

## Delivery

One spec, built in two parts. Each part ships and bumps the client version.

1. **Engine:** the action model, strings, ability timing, Burst, heft and the bot/pacing re-tune. It also carries the client reads that must match right away: the HUD pips and channel-only wind-up display, the Abilities panel's wind-up, the paper doll's attack rate, and the `attackTap` input. The weight is already felt, because the hero really lunges, commits and recoils.
2. **Client feel:** hit-stop, camera, anticipation, sweeping smears, the Burst and lance visuals, and dissolving endings.

CLAUDE.md's Delve section is updated: per-weapon strings replace the "3-hit combo" line.

## Out of scope

- Per-tick sweeping hitboxes, multi-hit moves and frame-precise cancel windows (the "state machine" follow-up).
- Hero sprite attack poses (art, via `pixel-forge`).
- Rhythm or timing bonuses.
- Monster attack changes.
