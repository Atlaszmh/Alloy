# Delve Dodge Design

**Date:** 2026-09-26
**Status:** Approved in conversation.
**Engine:** `packages/engine/src/arpg/` (a new `dodge.ts`, `step.ts`, `combat.ts`), `balance.json → delve.dodge`
**Client:** `packages/client/src/features/delve/arena/` (input, HUD, renderer, `useArena`)

## Goal

A quick, tactical dodge with a few charges that refill over time. Short i-frames allow split-second dodges, and a well-timed one (a **perfect dodge**) should feel great.

## Decisions

| Question | Decision |
|---|---|
| Payoff | **Perfect dodge**: a hit that would have landed early in the dodge gives the charge back, a riposte and a slow-motion beat. |
| Controls | **Space** on desktop; a **dodge button** on phones. The potion moves to **F** only. |
| Wind-ups | A dodge **cancels** a cast wind-up. The mana stays spent, but the ability's **cooldown resets**, so it can be recast at once. |
| Detection | In the engine, where each monster attack resolves: it counts if the attack would have hit the hero **where the dodge began** (see Perfect dodge). |

## The move

- **Direction**: the move input when there is one; otherwise away from the nearest foe within 8 units; otherwise the facing.
- **Dash**: `distance` 3 units over `duration` 0.2 s. It is a smooth dash over several steps, not a teleport, so the renderer can show it.
- **I-frames**: `iframes` 0.25 s from the start, written as `invulnUntil = max(invulnUntil, start + iframes)` so Blink and Phoenix are unaffected.
- **During the dash**:
  - no basic attacks and no movement input;
  - walls clamp it as they clamp movement;
  - `separate()` skips the hero, so it passes through monsters;
  - potions still work.
- **Presses during the dash**: a Q/E/R press stays queued (`queuedCast` isn't consumed), and so does a second dodge (`queuedDodge`). Each fires the step the dash ends, so neither is lost.
- **Order in `heroTick`**: the potion first, then the dash (move, end), then a queued dodge, then a queued cast.
- **Blocked** with no charges, or while already dashing.
- **Wind-up**: a dodge during a wind-up cancels it. The mana stays spent, `cooldowns[slot]` is reset to now, and the combo step is unchanged.

## Charges

- `charges` 2. One charge refills every `recharge` 2.5 s, one at a time; the timer only runs while below the maximum.
- Every floor starts with full charges.
- Gear and legendary bonuses to dodge are out of scope (project 2).

## Perfect dodge

- **Trigger**: a monster attack that resolves within `perfectWindow` 0.15 s of the dodge's start, and that would have hit either the hero (blocked by i-frames) or the hero's position **where the dodge began**. At most one per dodge. The second case matters: a dash away from a melee swing makes it miss outright, and that should still count. Each place a monster attack resolves checks both:
  - **melee** swing end (`gap <= attackRange + 0.5`);
  - **charger** contact (`gap <= 0.25`);
  - **boss slam** detonation (inside the circle);
  - **projectile** contact (within its radius).

  A shared helper, `perfectOrigin(ctx)`, returns the dodge's start point while the window is open and unused (else null). A match on the start point only calls `notePerfect`: it never uses up the attack, ends a charge or deals damage. (A projectile that crosses the start point keeps flying.)
- **Effects**:
  - the charge comes back (capped at the maximum), unless a riposte is already active. So chaining PERFECTs inside 1.5 s doesn't make dodges free in a crowd;
  - an `ArpgEvent` `{ kind: 'perfectDodge', x, y }`;
  - **riposte**: until `riposteWindow` 1.5 s later, the hero's next real hit is a crit and applies `stagger` (normal stagger rules: shorter on bosses, immunity applies). A real hit is `source` `basic` or `skill` that may crit: `opts.crit !== undefined || opts.canCrit`, which covers melee swings and their pre-rolled crit. That excludes zone ticks, DoTs, reactions and thorns. The riposte is used up by that first hit; one Nova that hits many foes spends it on the first.
- **Client feel** (display only; the simulation stays fixed-step and deterministic):
  - `slowmo` of 0.2 s at 30% speed on the display clock;
  - a white flash on the hero, "PERFECT" text, a ring and a small shake;
  - the dodge button pulses.

## Engine

- `HeroEntity` gains:
  - `dodgeCharges`;
  - `dodgeRechargeAt` (when the next charge arrives, or 0 when full);
  - `dodge: { dir, fromX, fromY, start, until, perfect } | null`. It's the last dodge, kept after the dash ends so the perfect check can read its start; the hero is dashing while `t < until`, and `perfect` records that it already paid out;
  - `riposteUntil`.
- `ArpgInput.dodge?: boolean`; `ArpgWorld.queuedDodge` (false in `createFloorWorld`) queues it like the potion, so a tap between frames is not lost.
- The schema requires `perfectWindow ≤ iframes`.
- `arpg/dodge.ts`:
  - `tryDodge(ctx, move)`: charge check, direction, wind-up cancel, dodge start, event `{ kind: 'dodge', fromX, fromY, dirX, dirY }` (the name `dash` is already Blink's event);
  - `dodgeTick(ctx, dt)`: dash movement, recharge;
  - `perfectOrigin(ctx)` and `notePerfect(ctx)`.
- In `hurtHero`: a hit blocked by i-frames calls `notePerfect` (it checks the window itself). Blocked hits still send no `heroHit` event.
- In `step.ts`: the melee, charger, slam and projectile checks also test `perfectOrigin`.
- In `hitMonster`: a real hit during an active riposte forces a crit, adds `stagger` and ends the riposte.
- `balance.json → delve.dodge`: `{ charges 2, recharge 2.5, distance 3, duration 0.2, iframes 0.25, perfectWindow 0.15, riposteWindow 1.5 }`, validated in `schemas.ts` and typed in `DelveBalance`.
- **Bot**: it dodges (when it has a charge) if standing in a boss slam's telegraph, or if a melee or charger foe is within 0.15 s of landing on it. Re-check `delve-pacing.test.ts`; tune only the bot's thresholds if the guard rails drift.

## Client

- `input.ts`:
  - **Space** sets `dodge`; **F** is the potion;
  - `useArena` passes `dodge` in `ArpgInput`, and the HUD button sets it too.
- `ArenaHud.tsx`: a **dodge button** (💨) left of the potion, with charge pips, a refill arc, a `Space` key hint and a pulse on a PERFECT. `data-testid="dodge-button"`.
- `ArenaRenderer.ts`:
  - a short streak trail while dashing;
  - the hero drawn translucent during i-frames (it is already translucent while `invulnUntil`);
  - on `perfectDodge`: flash, "PERFECT", ring and shake.
- `useArena.ts`:
  - on `perfectDodge`, for 0.2 real seconds multiply both the `stepWorld` dt and the `renderer.update` dt by 0.3 (on top of `timescale`);
  - the HUD snapshot gains `dodgeCharges`, `dodgeMax` and `dodgeRefill` (0..1).
- Rename the gear stat's **label** "Dodge" to **Evasion** in `delve.json` and the floating text ("DODGE" becomes "EVADE"; blind misses show it too). The key `dodge` stays, so saves are unchanged.

## Testing

**Engine (`tests/delve-dodge.test.ts`):**
- a dodge spends a charge and moves the hero about 3 units along the move direction;
- standing still, it goes away from the nearest foe;
- i-frames block a hit;
- charges refill one at a time;
- no dodge at zero charges;
- a hit early in the dodge is a PERFECT (charge back, event, riposte), and one after `perfectWindow` is not;
- dodging away from a melee swing (so it misses) is still a PERFECT, and so is leaving a slam circle;
- a projectile that crosses the dodge's start point keeps flying (the start point is not a target);
- a second PERFECT during an active riposte doesn't refund the charge;
- the riposte makes the next real hit crit and stagger, then it ends; a burn tick doesn't spend it;
- a cast pressed mid-dash fires when the dash ends;
- standing still with nothing near, the dodge goes along the facing;
- a dodge cancels a wind-up with the mana spent and the cooldown reset;
- a dodge tap between frames is not lost.

**Client:**
- `input` maps Space to dodge and F to the potion;
- the HUD shows the dodge button with its pips.

**E2E:** `dodge-button` is visible in the arena on every device.
