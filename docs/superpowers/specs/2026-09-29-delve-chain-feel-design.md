# Delve chain feel: tempo, holds and beats

**Status:** approved design, 2026-09-29. It follows v0.46.0 (`2026-09-29-delve-moves-and-chains-design.md`) and ships as v0.47.0.

## Why

Playing v0.46.0, the user found that mashing a skill fires its whole chain faster than anyone can follow. The engine confirms it:
- Mashing Q fires the default Bolt chain (light, medium, medium, heavy) in about 0.7 s, with moves landing 0.13–0.3 s apart.
- Every Primary form's default chain behaves the same: 0.6–1.0 s for the chain.

Only each move's wind-up paces a chain. A move's recovery slows movement, but a new cast cancels it, and each move has its own cooldown, so nothing holds the chain back.

The final review of v0.46.0 found four more rough edges:
- **Charging past stage 2 is wasted.** A hold reaches full power at 0.66 s, but the bar, the bot and the DPS Lab wait the full 1 s.
- **Pad chords depend on button order.** A second button pressed while R3 charges fires the hold early; pressed while RT charges, it waits.
- **Aiming can reset the chain.** Holding a skill's button to aim for longer than the 1.2 s restart window resets the chain.
- **Power misjudges holds.** It values a hold move as a tap.

## Decisions (the user's)

| Question | Decision |
|---|---|
| When does a hold reach full power? | At 100% of the bar, 1 s. Hold time is a stat that slow weapons and future modifiers can change. |
| How is a chain paced? | A **per-slot beat, buffered**. After a move lands, that slot's next move waits a beat set by the move's kind and its slot. Presses during the beat wait and fire when it ends. Other slots and the dodge stay free. |
| What sets hold times and beats? | **One tempo stat.** Each weapon base has a tempo that scales every hold's charge time and every beat, for basics and abilities. Future modifiers adjust the same stat. |
| How does the HUD show a beat? | **Like a short cooldown.** The button shows the cooldown sweep while the beat runs. |
| What does the basic attack do while a press waits on a beat? | **It swings only if the blow lands in time.** With a press waiting, a basic swing starts only if its blow strikes before that beat ends; otherwise the hero waits. |
| Pad chords | They match the keys: a second ability button releases a charging hold, whichever slots they are. |
| Aiming | While a skill's button is held to aim, its chain's restart window pauses. |
| Power | Power and item comparisons count beats and value hold moves as charged. |
| Balance | Tune later; nail the feel now. The DPS Lab and pacing are measured before and after. The pacing rails must hold; if the beats break one, stop and bring the numbers to the user rather than tune. |

## Design

### Tempo
- **Weapon data.** Each weapon base in `delve.json` gets `tempo`. The starting values are its swing speed relative to the sword's, softened:

  | Weapon | Tempo |
  |---|---|
  | wand | 0.8 |
  | dagger | 0.85 |
  | bow | 0.95 |
  | sword | 1.0 |
  | staff | 1.05 |
  | axe | 1.15 |
  | maul | 1.3 |

  Unarmed uses `balance.json → delve.hero.tempo`, which is 1.0.
- **The stat.** `HeroStats.tempo` is the weapon's tempo, or the hero's when unarmed. `computeHeroStats` computes it. That is where future gear modifiers (affixes, legendaries) will multiply in; none exist yet. A live buff would apply where tempo is read, not here.
- **What it scales:** every hold's charge time and auto-fire time, and every chain beat. It doesn't touch the basic attack's swing cycle; the weapon's `attackInterval` already sets that.
- **Where it shows:**
  - A weapon's item sheet shows its tempo, e.g. "Tempo 1.3×: slower holds and chain beats".
  - The builder's readout shows the timings it produces (see Readout).

### Holds
- **Charge time.** A hold's full charge takes `holdTime` × tempo, where `holdTime` is 1.0 s. `holdStages` becomes [0.5, 1]:
  - stage 1 arrives at half the charge;
  - stage 2, full power, arrives exactly when the charge is full.
- **Auto-fire.** A hold fires by itself at `holdMax` × tempo; `holdMax` stays 2.0 s. This covers ability holds and a manual hold blow of the basic attack alike.
- **Both times are fixed when the charge starts.** The full-charge and auto-fire times are kept on the hold (`HeroEntity.hold`) or on the swing (for a hold blow). A weapon swap mid-charge (the Training Grounds swap weapons live) doesn't make the charge jump.
- **`holdCharge`.** It takes the hold's full-charge time instead of reading `bal.chains.holdTime`, and returns the charge (0..1) and the stage. Its callers are:
  - the engine's `holdTick` and `releaseHold` (`abilities/cast.ts`) and `basicHoldTick` (`basic.ts`);
  - the bot and the DPS sim;
  - the client: the HUD snapshot, `aimedMove` and `padAimView` (`useArenaCore.ts`), the anticipation FX and the readout.

  The auto-fire checks (`cast.ts` `holdTick`, `basic.ts` `basicHoldTick`) read the hold's own auto-fire time.
- **HUD bar.** It shows one tick, at the halfway stage; its end is full power.
- **Bot and DPS Lab.** Both still release at full charge, which is now stage 2, so no charge time is wasted.

### Beats
- **The rule.** When a move lands (`fire` in `abilities/cast.ts`), its slot waits a beat before the chain's next move can start. One helper computes it, and `fire`, the HUD and Power all use it:

  `beatFor(bal, slot, kind, tempo)` = `chains.beat[kind]` × `chains.beatSlot[slot]` × tempo

  - `kind` is the kind the move played as. A hold move always plays as its stage's kind (`HOLD_STAGE_KINDS[stage]`), so a tap on a hold (stage 0) takes the medium beat, stage 1 the heavy beat, and full charge the hold beat.
  - Starting values: `beat` {light 0.25, medium 0.4, heavy 0.6, hold 0.8} and `beatSlot` {primary 1, defensive 0.75, ultimate 1.5}, in `balance.json → delve.chains`.
- **State.** `HeroEntity.beatUntil[slot]` and `HeroEntity.beatFrom[slot]` hold the beat's end and start, so the HUD knows its full length.
- **Refusals.** `castAbility` and `startHold` refuse a slot until its beat ends, and so does `abilityReady` (which the bot uses). The HUD snapshot works out readiness itself and includes the beat (see HUD).
- **One buffer per slot.** Today `world.queuedCast` holds one press, and any new press replaces it. That would let a press waiting out Q's beat be lost to an E press, so the buffer becomes per slot: each slot keeps its own waiting press and its expiry.
  - **Firing.** Each tick, of the waiting presses whose slot is free, the one pressed first fires. A slot is free when its beat is over and its next move's cooldown is up, and the hero isn't winding up, holding or dashing. The dequeue checks all of this before taking the press, so a refusal never eats it.
  - **Ageing.** A waiting press doesn't age while the hero is winding up, holding or dashing, or while its slot's beat runs. It gets `feel.buffer` from when it is free. After the beat, a press whose move is still on cooldown ages as a cooldown-held press does today, firing only if the cooldown ends within the buffer.
  - **Releases.** A press of the slot whose hold runs is still that hold's release, and a dropped hold's release is still swallowed. These go through the per-slot buffer as today.
  - **Aim.** A waiting press keeps its aim. An aimed press lands where the player aimed when pressing. An auto-aimed press picks its target when it fires.
- **Holding through a beat.** Holding a hold move's button through the beat starts the charge when the beat ends.
- **Per slot.** The beat holds only its own slot. Other slots, the dodge and the basic attack stay free. A dodge neither ends nor shortens a beat.
- **The basic swing while a press waits.** While any press waits on its slot's beat, a basic swing (automatic or manual) starts only if its strike point comes before that beat ends. With several waiting, the earliest beat end counts. Otherwise no swing starts until the press has fired. The swing strikes before the press fires, so no swing is ever cut off mid-lunge, and longer beats still fill with a basic hit.
- **The restart window counts from the beat's end.** `fire` sets `comboAt[slot]` to the landing time plus the beat. So a long beat never resets the chain, and during the beat the next press still reads the chain's next move: every reader goes through `pressStep`, where `t − comboAt` is negative until the beat ends.
- **Chain edits and respawns.** A chain changed mid-fight (`refreshWorldHero`) clears that slot's beat and its waiting press. `respawnHero` clears them all.
- **Nightstalker** reads the Defensive's chain step through `pressStep` (`combat.ts`). It is unchanged.
- **Charge payment.** A charge-paid chain's charge keeps filling during a beat.
- **Galvanize** cuts cooldowns, not beats.
- **The Training Grounds.** "No cooldowns" leaves beats on. They're the rhythm the user tunes there, and the sandbox starts with No cooldowns on. Its hint changes from "An ability can go again as soon as it lands" to "Cooldowns are off; each move still waits its beat".
- **Basic attacks** get no beat: the weapon's swing cycle already paces them.
- **Worked example.** On a sword (tempo 1), mashing Q through the Bolt chain lands the moves about 0.45, 0.6 and 0.7 s apart: today's gaps plus each beat. That's about 1.75 s from the light to the heavy, up from 0.7 s. The heavy's 0.6 s beat then comes before the chain loops.

### HUD
- **The sweep.** While a slot's beat runs, its button shows the cooldown sweep for the beat, and `ready` is false.
  - The HUD snapshot's `cooldown` and `cooldownTotal` cover whichever wait is longer: the next move's cooldown or the slot's beat.
  - A new `beat` flag says when it's the beat. The button then draws the sweep without the countdown number, and animates it in CSS over the beat's length from `beatFrom`, since the HUD refreshes only every 80 ms.
- **Galvanize.** Its spark shows only on a real cooldown, not during a beat.
- **Readiness.** The next move's glyph lights when the slot is ready.

### Readout
- The builder's readout gains the move's beat, e.g. "then a 0.4s beat", from `beatFor` with the hero's tempo.
- For a hold move it shows:
  - the tap's beat on the line for stage 0;
  - the full-charge time and the full charge's beat on its "Fully charged" line, e.g. "Fully charged (1.3s): hits for 25, 13 mana, then a 1.04s beat".

### Input
- **Pad chords.**
  - **The rule.** The pad's `holding` is the latest ability button pressed, while it stays held. An earlier button counts again only when it is pressed again.
  - **What happens.** A second ability button pressed while another's hold charges sends the first's release. The second's press follows on the next frame, as the chord carry does today. This works for any pair of slots, and is how keys and HUD buttons already behave.
  - **Where the order lives.** `PadMemory` keeps the press order. Two presses in the same frame count in slot order: the lower slot is sent as a press first and the higher becomes `holding`.
  - **Hold-to-repeat.** `castHeld` follows the same button.
- **Aiming.** While a slot's button is held (the engine's `holding`), its restart window doesn't run: `comboAt[slot]` moves on by `dt`. This covers both a charging hold and aiming a move that isn't a hold. However long the player aims, the chain doesn't reset. The rule replaces today's `comboAt += dt` in `holdTick`, so a charging hold's window isn't advanced twice.

### Power
- **The cadence term.** `estimateCombat` counts each move's cadence as a third term inside `useInterval`'s max, next to the cooldown term and the mana or charge term. The cadence is the move's wind-up plus its beat. It isn't added to either of the other terms: both already run during the wind-up and the beat, and `castTime` already includes the channel.
  - This moves every chain's Power, and with it the autopilot's gear choices.
- **Hold moves** are valued at full charge:
  - its damage and cost are the stage-2 move's;
  - its cadence is max(`holdTime × tempo`, the stage-2 move's `castTime`) plus the full charge's beat. The wind-up can outlast the charge, e.g. a cast-paid Ultimate's 2.4 s.
  - its cooldown counts from the landing.
- **A Defensive hold's effect.** When the Defensive's first move is a hold, its effect (Ward, Armor or Surge, and its duration) is read from its stage-2 move (`chainMove(defensive, 0, 2)`).
- **Consistency.** Item comparisons use the same estimate, so they follow.

## Data and schemas
- `delve.json`: weapon bases gain `tempo`.
- `balance.json → delve`:
  - `hero.tempo` 1.0;
  - `chains.holdStages` [0.5, 1];
  - `chains.beat` {light, medium, heavy, hold};
  - `chains.beatSlot` {primary, defensive, ultimate}.
- `schemas.ts`:
  - `holdStages` values in (0, 1], changing `.lt(1)` to `.lte(1)`, and still rising;
  - `holdMax >= holdTime` stays;
  - `beat` and `beatSlot` values positive;
  - `hero.tempo` positive;
  - a refine on gear bases: a weapon base must have a positive `tempo`. The base schema's weapon fields are optional today, so this needs a new refine.

## Testing
- **Engine (new):**
  - Tempo: per weapon, and unarmed.
  - Holds:
    - a hold at stage 1 by half its time and full at 100%, scaled by tempo;
    - auto-fire at `holdMax × tempo`;
    - a manual hold blow scaled the same way;
    - a weapon swap mid-charge that doesn't jump the charge.
  - Beats and buffering:
    - each kind's and slot's value, scaled by tempo, and a tap on a hold taking the medium beat;
    - a press during a beat buffered and fired at its end;
    - a Q press waiting on its beat surviving an E press, and both firing;
    - a press whose move is still on cooldown after the beat ageing as today;
    - a hold held through a beat starting at its end;
    - other slots and the dodge free during a beat;
    - a dodge not ending a beat;
    - the restart window from the beat's end;
    - a changed chain clearing its beat and its waiting press.
  - The basic swing: one that would land in time strikes before the waiting press fires, and one that wouldn't doesn't start. Nothing is cut mid-lunge.
  - The aiming pause, and a charging hold's window paused once.
  - Power:
    - the cadence term;
    - a charged hold with a long cast-paid wind-up;
    - a Defensive hold's effect at stage 2.
  - Determinism: a scripted sequence gives the same events at any frame rate.
- **Engine (existing tests this changes):**
  - `delve-chains`: the `holdStages` fixtures and the 0.33/0.66 stage test.
  - `delve-combat-weight`: its buffer tests, now per slot.
  - `delve-training`: "no cooldowns: the same ability fires again right after it lands" becomes "right after its beat".
  - `delve-dps-sim`: its cast counts.
- **Client:**
  - The sweep during a beat, without a number, animated over its length.
  - No Galvanize spark during a beat.
  - The hold bar's single tick.
  - The readout's hold time and beats.
  - The tempo line on a weapon's sheet.
  - Pad chords in either slot order, including the earlier button not coming back when the later one lets go.
  - Hold-to-repeat following the latest button.
- **Client (existing tests this changes):** `gamepad.test.ts`'s `holding` by slot order.
- **E2E:** the Delve specs pass. G04's "held RT steps through the chain" allows for the beats.

## Balance
- Beats cut damage wherever a skill is limited by time rather than mana, most of all with the cast payment. Play limited by mana changes less. The swing rule gives back some basic hits, and some mana, during longer beats.
- **DPS Lab:** report its grid before and after (one dummy and the pack, depth 10); no gate. Its ability rows all use a sword (tempo 1), so also spot-check a maul and a wand.
- **Pacing:** the rails in `tests/delve-pacing.test.ts` must hold. The new Power estimate also moves the autopilot's gear choices. If a rail breaks, stop and report the numbers. The fix is the user's call: shorter beats, stronger skills, or a changed rail.

## Docs and version
- **CLAUDE.md:** the Delve section gains tempo, beats, the per-slot buffer, the swing rule and the new hold stages.
- **Superseded notes:**
  - on the chains spec: `holdStages` and the hold stages;
  - on the Training Grounds spec (`2026-09-26-delve-training-grounds-design.md`, its "No cooldowns" line): beats stay on.
- **Version:** `chore(client): bump version to 0.47.0`.
