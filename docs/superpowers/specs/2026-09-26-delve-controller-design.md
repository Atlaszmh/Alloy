# Delve Controller Support Design

**Date:** 2026-09-26
**Status:** Approved in conversation.
**Client only:** `packages/client/src/features/gamepad/`, `stores/inputDeviceStore.ts`, the arena (`useArena`, `input.ts`, `ArenaHud`), `DelveRun`, `DelveCamp`, `AppShell`. The engine is unchanged: the pad maps onto `ArpgInput` like the keyboard does.

## Goal

An Xbox controller (the browser's "standard" gamepad mapping) plays a whole run: fights, doors, the dive summary and the Anvil.

## Arena (Hades-style)

| Input | Action |
|---|---|
| Left stick | move (radial deadzone 0.2, rescaled) |
| Right stick | aim (deadzone 0.35); centred = auto-aim |
| A | dodge (along the left stick) |
| X / B / Y | Primary / Defensive / Ultimate, on press |
| RT (hold) | basic attack, in manual mode |
| LB | potion |
| Menu | open / close the dive menu |

- **Aim point** with the right stick tilted: `hero + dir × reach`.
  - Placed forms: reach = range × max(0.3, tilt).
  - Directional forms: reach = range, or 4 when the range is 0.
  - Manual basic attacks: reach = the weapon's range.
- **Movement**: the pad's left stick overrides the keyboard and pointer when it's past the deadzone.
- **Reticle**: while the right stick is tilted, the aim marker shows at the aim point, drawn for the Primary's form.
- **Rumble**, where the pad supports it (`vibrationActuator.playEffect('dual-rumble')`):
  - a dodge: 60 ms, weak;
  - a PERFECT: two 90 ms strong pulses;
  - a hero hit worth 15% or more of max life: 120 ms, strong.
- The autopilot test hook still overrides input, but Menu still works.

## Menus

- **Nav layer** (one hook in `AppShell`): it polls the pad, and it is off while the arena is live (`setArenaLive`).
  - **D-pad**, or a left-stick flick (past 0.6, re-armed below 0.3): move focus to the nearest visible, enabled control in that direction. Holding repeats after 350 ms, every 150 ms.
  - **A** clicks the focused control; with nothing focused, it focuses the first one.
  - **B** clicks the visible `[data-pad-back]`.
  - **LB / RB** step through the `[data-pad-tabs]` tablist.
  - **Menu** clicks `[data-pad-menu]`.
- **Scope**: the last visible `[data-pad-scope]` (a modal, a sheet or the door choice) confines focus to it.
- **Focus ring**: shown while the pad is the active device (a `data-input="gamepad"` attribute on `<html>`).

## Button hints

`inputDeviceStore.device` is `'keyboard' | 'touch' | 'gamepad'`, set by the most recent input. The HUD shows X/B/Y, A, LB and RT for a pad, Q/E/R, Space and F for a keyboard, and nothing for touch.

## Units

- `gamepad/gamepad.ts` (pure): `radialDeadzone`, `readPad(pad) → PadState`, `edges(prev, next)`.
- `gamepad/arena-pad.ts` (pure): `padToArena(state, edges)` gives move, aim direction and tilt, cast slot, dodge, potion, attack held and menu.
- `gamepad/spatial-nav.ts` (pure): `pickNext(from, candidates, dir)`.
- `gamepad/use-gamepad-nav.ts`: the menu nav hook.
- `gamepad/rumble.ts`: `rumble(kind)`.
- `stores/inputDeviceStore.ts`: `device`, `setDevice`.

## Build order

1. Pure units with tests (`gamepad`, `arena-pad`, `spatial-nav`, the store).
2. The arena: `useArena` polls in its ticker; `CastPress.aimWorld`; the reticle; rumble; hints.
3. Menu nav: the hook in `AppShell`; `data-pad-*` markers on the dive menu, item sheet, door choice, summary and Anvil tabs; the focus ring CSS.
4. E2E with a fake pad (`navigator.getGamepads` stubbed in an init script):
   - Menu opens the dive menu;
   - D-pad and A toggle the attack mode;
   - B closes the menu;
   - A dodges (the dodge button's charges drop);
   - RB switches the Anvil tab.
5. Docs, and the version bump to 0.36.0.

**Out of scope:** button remapping and PlayStation glyphs (a PlayStation pad works with the same layout).
