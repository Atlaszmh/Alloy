# Delve chain feel: tempo, holds and beats

**Status:** approved design, 2026-09-29. It follows v0.46.0 (`2026-09-29-delve-moves-and-chains-design.md`), and ships as v0.47.0.

## Why

Playing v0.46.0, the user found that mashing a skill fires its whole chain faster than anyone can follow. The engine confirms it:
- Mashing Q fires the default Bolt chain (light, medium, medium, heavy) in about 0.7 s, with moves landing 0.13–0.3 s apart.
- Every Primary form's default chain behaves the same: 0.6–1.0 s for the chain.

Only each move's wind-up paces a chain. A move's recovery slows movement but a new cast cancels it, and each move has its own cooldown, so nothing holds the chain back.

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
| What sets hold times and beats? | **One tempo stat.** Each weapon base has a tempo that scales every hold's charge time and every beat, for basics and abilities; future modifiers adjust the same stat. |
| How does the HUD show a beat? | **Like a short cooldown.** The button shows the cooldown sweep while the beat runs. |
| Pad chords | They match the keys: a second ability button releases a charging hold, whichever slots they are. |
| Aiming | While a skill's button is held to aim, its chain's restart window pauses. |
| Power | Power and item comparisons count beats and value hold moves as charged. |
| Balance | Tune later; nail the feel now. The DPS Lab and pacing are measured before and after. The pacing rails must hold; if the beats break one, stop and bring the numbers to the user rather than tune. |

## Design

### Tempo
- **Weapon data.** Each weapon base in `delve.json` gets `tempo`. The starting values are its swing speed relative to the sword, softened:

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
- **The stat.** `HeroStats.tempo` is the weapon's tempo, or the hero's when unarmed. `computeHeroStats` computes it, and that is where future modifiers (affixes, legendaries, a Surge) multiply in. None exist yet.
- **What it scales:** every hold's charge time and auto-fire time, and every chain beat. It doesn't touch the basic attack's swing cycle; the weapon's `attackInterval` already sets that.
- **Where it shows:** a weapon's item sheet shows its tempo, e.g. "Tempo 1.3×: slower holds and chain beats". The builder's readout shows the timings it produces.

### Holds
- **Timing.** A hold's full charge takes `holdTime` × tempo, where `holdTime` is 1.0 s. `holdStages` becomes [0.5, 1]:
  - stage 1 arrives at half the charge;
  - stage 2, full power, arrives exactly when the charge is full.
- **Schema.** Stage values may now equal 1, but still rise.
- **Auto-fire.** A hold fires by itself at `holdMax` × tempo (`holdMax` stays 2.0 s).
- **Both kinds of hold.** This covers ability holds and a manual hold blow of the basic attack alike.
- **API.** `holdCharge(bal, start, t, tempo)` gives the charge (0..1 over `holdTime × tempo`) and the stage. Every caller passes the hero's tempo: the engine's hold and hold-blow ticks, the bot, the DPS sim, and the client's HUD snapshot, anticipation FX and readout.
- **HUD bar.** It shows one tick, at the halfway stage; its end is full power.
- **Readout.** "Fully charged (1.3s)" shows `holdTime × tempo`.
- **Bot and DPS Lab.** Both still release at full charge, which is now stage 2, so no charge time is wasted.

### Beats
- **The rule.** When a move lands (`fire` in `abilities/cast.ts`), its slot waits a beat before the chain's next move can start:

  beat = `chains.beat[kind]` × `chains.beatSlot[slot]` × tempo

  - `kind` is the kind the move played as. For a released hold that's its stage's kind (`HOLD_STAGE_KINDS`): medium, heavy or hold.
  - Starting values: `beat` {light 0.25, medium 0.4, heavy 0.6, hold 0.8} and `beatSlot` {primary 1, defensive 0.75, ultimate 1.5}. Both live in `balance.json → delve.chains`.
- **State.** The beat is kept in `HeroEntity.beatUntil[slot]`.
- **What checks it.** `castAbility`, `startHold` and `abilityReady` all refuse until the beat ends, so the HUD and the bot see it too.
- **Buffering.** A press during its slot's beat is buffered. It waits without ageing, as it waits out a wind-up, a hold or a dash, and fires the tick the beat ends. Holding a hold move's button through the beat starts the charge when the beat ends.
- **Per slot.** The beat holds only its own slot: other slots, the dodge and the basic attack stay free.
- **The restart window.** It counts from the beat's end: `fire` sets `comboAt[slot]` to the landing time plus the beat. So a long beat never resets the chain, and during the beat the next press still reads the chain's next move.
- **Chain edits.** A chain changed mid-fight (`refreshWorldHero`) clears that slot's beat, and `respawnHero` clears them all.
- **The sandbox.** Its "No cooldowns" toggle leaves beats on: they're the rhythm, not a cooldown.
- **Basic attacks** get no beat: the weapon's swing cycle already paces them.
- **Worked example.** On a sword (tempo 1), mashing Q through the Bolt chain lands the moves about 0.45, 0.6 and 0.7 s apart (today's gaps plus each beat): about 1.75 s from the light to the heavy, up from 0.7 s. The heavy's 0.6 s beat then comes before the chain loops.

### HUD
- **The sweep.** While a slot's beat runs, its button shows the cooldown sweep for the beat.
  - The HUD snapshot's `cooldown` and `cooldownTotal` cover whichever wait is longer: the next move's cooldown or the slot's beat.
  - A new flag says when it's a beat, and the button draws the sweep without the countdown number.
- **Readiness.** `ready` is false during a beat, so the button reads as not ready, and the next move's glyph lights when it is.

### Input
- **Pad chords.** The pad's `holding` follows the most recently pressed ability button still held, not the first in slot order.
  - A second ability button pressed while another's hold charges sends the first's release. The second's press follows on the next frame, as the chord carry already does.
  - This works for any pair of slots, and is how keys and HUD buttons already behave.
- **Aiming.** While a slot's button is held (the engine's `holding`), that slot's restart window doesn't run (`comboAt[slot]` moves on by `dt`). This covers both a charging hold, as today, and aiming a move that isn't a hold. However long the player aims, the chain doesn't reset.

### Power
- **Beats and wind-ups.** `estimateCombat` counts each move's wind-up (`castTime`) and its beat in the move's use interval, alongside the cooldown and the mana or charge rate.
- **Holds.** A hold move is valued at full charge: its stage-2 move's damage and cost, over `holdTime × tempo` (the charge covers the wind-up), plus its beat.
- **Consistency.** Item comparisons use the same estimate, so they follow.

## Data and schemas
- `delve.json`: weapon bases gain `tempo`, a required positive number on weapons.
- `balance.json → delve`:
  - `hero.tempo` 1.0;
  - `chains.holdStages` [0.5, 1];
  - `chains.beat` {light, medium, heavy, hold};
  - `chains.beatSlot` {primary, defensive, ultimate}.
- `schemas.ts`:
  - hold stages are allowed in (0, 1] and must still rise;
  - `beat` and `beatSlot` values are positive;
  - weapon `tempo` is positive.

## Testing
- **Engine:**
  - Tempo per weapon, and unarmed.
  - A hold at stage 1 by half its time and full at 100%, both scaled by tempo; auto-fire at `holdMax × tempo`; a manual hold blow scaled the same way.
  - Beats:
    - each kind's and slot's value, scaled by tempo;
    - a press during a beat buffered and fired at its end;
    - a hold held through a beat starting at its end;
    - other slots and the dodge free during a beat;
    - the restart window from the beat's end;
    - a released hold's beat by its stage;
    - a changed chain clearing its beat.
  - The aiming pause.
  - Power with beats and charged holds.
  - Determinism: a scripted sequence gives the same events at any frame rate.
- **Client:**
  - The sweep during a beat, without a number.
  - The hold bar's single tick.
  - The readout's hold time and the tempo line on the weapon's sheet.
  - Pad chords in either slot order.
- **E2E:** the Delve specs pass. G04's "held RT steps through the chain" allows for the beats.

## Balance
- Beats cut damage wherever a skill is limited by time rather than mana, most of all with the cast payment. Play limited by mana changes less.
- **DPS Lab:** report its grid before and after (one dummy and the pack, depth 10); no gate.
- **Pacing:** the rails in `tests/delve-pacing.test.ts` must hold. If the beats break one, stop and report the numbers. The fix is the user's call: shorter beats, stronger skills, or a changed rail.

## Docs and version
- **CLAUDE.md:** the Delve section gains tempo, beats and the new hold stages.
- **The chains spec:** it gets a superseded note on `holdStages` and the hold stages.
- **Version:** `chore(client): bump version to 0.47.0`.
