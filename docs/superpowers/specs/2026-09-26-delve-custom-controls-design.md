# Delve Custom Controls Design

**Date:** 2026-09-26
**Status:** Built in v0.37.0.
**Client only:** `features/controls/` (config, editor), `stores/controlsStore.ts`, the pad hub, `arena-pad`, the keyboard handler, the HUD hints.

## Goal

The player rebinds the controller and the keyboard, tunes how the pad feels, and tries it straight away (the editor opens mid-fight too). When a setup feels right, **Copy setup** gives a JSON block that becomes the new `DEFAULT_CONTROLS` in code.

## The config (`features/controls/controls.ts`)

```ts
type ControlAction = 'primary' | 'defensive' | 'ultimate' | 'dodge' | 'attack' | 'potion' | 'menu';
interface ControlsConfig {
  version: 1;
  pad: Record<ControlAction, PadButton | null>;
  keys: Record<ControlAction | 'up' | 'down' | 'left' | 'right', string | null>; // KeyboardEvent.code
  repeat: { primary: boolean; defensive: boolean; ultimate: boolean };         // controller: hold keeps casting
  deadzone: { left: number; right: number };                                    // 0.05–0.5 / 0.1–0.6
  aimReach: number;                                                             // placed abilities at full tilt: 0.3–1 × range
}
```

- **Defaults** are today's setup:
  - pad: RT Primary, LB Defensive, R3 Ultimate, LT dodge, RB attack, D-pad ▼ potion, Menu menu;
  - keys: Q/E/R, Space, F, WASD, Esc, and no attack key (the mouse attacks);
  - repeat: Primary only;
  - deadzones 0.2 / 0.35;
  - reach 1.
- **Binding** a button or key that another action already uses swaps the two, so nothing is ever bound twice.
- **Persistence**: `localStorage` key `alloy:controls:v1`.
- **Parsing**: `parseControls` keeps every valid field and falls back to the default for the rest, so a bad save never breaks input.
- The arrow keys always move as well.
- Hold-to-repeat is controller-only, since holding a key aims with the mouse.

## Wiring

- **Pad hub**: reads with the configured deadzones, and has `capturePadButton(cb)`. While capturing, the next press goes to the editor and not to the arena or the menus.
- **`padToArena(state, pressed, config)`**: ability presses come from the bindings. `castHeld` is the first ability with repeat on whose button is held; the arena casts it again whenever the engine's `abilityReady` says so.
- **Stick aim**: placed forms reach `range × max(0.3, tilt × aimReach)`.
- **Keyboard**: the handler reads the bindings when a key goes down.
  - A bound attack key holds manual attacks, aimed at the mouse.
  - The menu key presses `[data-pad-menu]`.
- **HUD hints** come from the config.

## Editor (`ControlsPanel`)

- **Where**: a 🎮 Controls button at the Anvil, and in the dive menu (which pauses while it's open).
- **Rows**: each action, with a controller cell and a keyboard cell; the move keys show in the keyboard column only. Selecting a cell shows "Press…" until the next button or key; Esc cancels a keyboard capture.
- **Toggles and sliders**: repeat toggles for the three abilities; sliders for the left deadzone, right deadzone and full-tilt reach.
- **Buttons**:
  - **Reset to default**;
  - **Copy setup**: to the clipboard, with a text box as a fallback;
  - **Close**: marked `[data-pad-back]`, and the panel is a `[data-pad-scope]`, so a controller can drive it.

## Tests

- **controls**: swap on bind, parse fallback, export round trip, labels.
- **gamepad**: custom bindings, per-ability repeat, deadzones from the config.
- **store**: persistence and reset.
- **keyboard**: rebound keys.
- **editor**:
  - capturing a key rebinds it (and swaps);
  - sliders and toggles update the config;
  - reset;
  - copy.
- **E2E** (fake pad): rebind the dodge to A in the editor mid-dive, and A then dodges.
