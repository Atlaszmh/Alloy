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
| Detection | In the engine, at the moment a hit is blocked (every monster hit already goes through `hurtHero`). |

## The move

- **Direction**: the move input when there is one; otherwise away from the nearest foe within 8 units; otherwise the facing.
- **Dash**: `distance` 3 units over `duration` 0.2 s. It is a smooth dash over several steps, not a teleport, so the renderer can show it.
- **I-frames**: `iframes` 0.25 s from the start.
- **During the dash**:
  - no basic attacks, no casting, and no movement input;
  - walls clamp it as they clamp movement;
  - it passes through monsters (no separation push until it ends).
- **Blocked** with no charges, or while already dashing. A dodge during a wind-up cancels the wind-up: the mana stays spent, `cooldowns[slot]` is reset to now, and the combo step is unchanged.

## Charges

- `charges` 2. One charge refills every `recharge` 2.5 s, one at a time; the timer only runs while below the maximum.
- Every floor starts with full charges.
- Gear and legendary bonuses to dodge are out of scope (project 2).

## Perfect dodge

- **Trigger**: a hit that i-frames block within `perfectWindow` 0.15 s of the dodge's start. That covers melee swings, charger rushes, projectiles and boss slams. At most one per dodge.
- **Effects**:
  - the charge comes back (capped at the maximum);
  - an `ArpgEvent` `{ kind: 'perfectDodge', x, y }`;
  - **riposte**: until `riposteWindow` 1.5 s later, the hero's next damaging hit (basic or ability) is a crit and staggers. It is used up by that first hit; one Nova that hits many foes spends it on the first.
- **Client feel** (display only; the simulation stays fixed-step and deterministic):
  - `slowmo` of 0.2 s at 30% speed on the display clock;
  - a white flash on the hero, "PERFECT" text, a ring and a small shake;
  - the dodge button pulses.

## Engine

- `HeroEntity` gains:
  - `dodgeCharges`;
  - `dodgeRechargeAt` (when the next charge arrives, or 0 when full);
  - `dash: { dir, until, start } | null`;
  - `perfectUsed` (whether this dodge already gave its PERFECT);
  - `riposteUntil`.
- `ArpgInput.dodge?: boolean` is queued like `potion`, so a tap between frames is not lost.
- `arpg/dodge.ts`:
  - `tryDodge(ctx, move)`: charge check, direction, wind-up cancel, `dash` start, `dodge` event `{ kind: 'dodge', fromX, fromY, dirX, dirY }`;
  - `dodgeTick(ctx, dt)`: dash movement, recharge.
- In `hurtHero`: when blocked by i-frames and a dash started within `perfectWindow`, it's a PERFECT (as above). Blocked hits send no `heroHit` event, as now.
- In `hitMonster`: an active riposte forces a crit, adds `stagger` and ends the riposte.
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
  - on `perfectDodge`, scale the display `dt` by 0.3 for 0.2 real seconds;
  - the HUD snapshot gains `dodgeCharges`, `dodgeMax` and `dodgeRefill` (0..1).
- Rename the gear stat's **label** "Dodge" to **Evasion** in `delve.json` and the floating text ("DODGE" becomes "EVADE"). The key `dodge` stays, so saves are unchanged.

## Testing

**Engine (`tests/delve-dodge.test.ts`):**
- a dodge spends a charge and moves the hero about 3 units along the move direction;
- standing still, it goes away from the nearest foe;
- i-frames block a hit;
- charges refill one at a time;
- no dodge at zero charges;
- a hit early in the dodge is a PERFECT (charge back, event, riposte), and one after `perfectWindow` is not;
- the riposte makes the next hit crit and stagger, then it ends;
- a dodge cancels a wind-up with the mana spent and the cooldown reset;
- a dodge tap between frames is not lost.

**Client:**
- `input` maps Space to dodge and F to the potion;
- the HUD shows the dodge button with its pips.

**E2E:** `dodge-button` is visible in the arena on every device.
