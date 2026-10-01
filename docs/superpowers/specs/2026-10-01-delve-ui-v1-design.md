# Delve UI v1: PC hub, Hades-style HUD, forge pixel-art kit

**Status:** approved direction, 2026-10-01 ("lock it in as v1 UI/UX to build now"); revised the same day after the spec review. Every change from the review is marked **(revision)**, here and in the "Decided in the spec" index. Changes from the second review are marked **(revision 2)**.
- **Releases.** The build starts from v0.53.0 (`84a2c8a`) and ships in five releases over four phases: v0.54.0, v0.55.0, v0.56.0, v0.57.0 and v0.57.1.
- **Engine.** The engine owns every rule and number. The build makes one small engine addition (`chainCycle`, with `expectedHit` extracted for it; Phase 2) and no other engine change.
- **Saves.** `alloy:delve:v2`, `alloy:controls:v1` and `alloy:delve:sandbox:v1` keep their shape.

**Sources:**
- **Mockups.** The canvas "Alloy PC UI Redesign" (https://claude.ai/artifact/FYid3YsXypifppvgVe4VzD) has eight 1920×1080 boards: Main (flow and input map), Anvil · Loadout, Anvil · Skills, Anvil · Quests, Dive HUD, Pause, Between depths and UI kit. They are the source of truth for layout and look. Every size in this spec is in **design px at 1920×1080**, read from their markup. Appendix A copies the forge theme CSS from their helmet, so this spec stands without them. Where this spec departs from a mockup it says so (see "Departures from the mockups").
- **Audit.** The audit of v0.53.0 (session scratchpad, `ui-audit/audit.md`) is cited below as "audit §n".
- **Decisions.** The user approved them on 2026-10-01; the table below restates them.
- **Zoom.** The user added a ~25% dive zoom-out the same day. **(revision)** The user then chose 4 px per sprite pixel at 1080p.

## Why

The Delve was laid out for one portrait phone column, and the move to PC only widened the backdrop (audit §0):
- **The Anvil** is a 560 px column, and its Abilities tab runs 3,209 px tall.
- **The dive HUD** is a 520 px strip.
- **Windows narrower than 3:2** fall back to a 9:16 letterbox.
- **Modals** are bottom sheets.
- **Text** is 8–11 px and doesn't scale.
- **Inputs:** there are no hover tooltips, no hotkeys outside combat and no button prompts. The controller paths are long (audit §2, §3, top 10).

The Delve is now PC-only (possibly console later). Mobile is dropped, not deferred. Mouse and keyboard and the controller are both first-class.

## Decisions (the user's)

| Question | Decision |
|---|---|
| Platform | PC, 16:9 from 1280×720 to 2560×1440, scaling with the window. The phone column, bottom sheets, the Delve's bottom TabBar, the thumb HUD and the 9:16 letterbox all go. The classic Arena and Draft screens keep the shared shell as it is. |
| Look | Crisp pixel art in a "forge" theme. The palette is ENDESGA 32 (the sprites' palette). Fonts are Jersey 10 (display, numbers), Pixelify Sans (body) and Silkscreen (small labels, key glyphs). No rounded corners, soft gradients or blur. |
| Materials | Walls are dark wood planks with a warm stepped glow from below. A panel is a wood frame around a riveted steel plate. The header is a riveted steel band with a glowing mana line, and the footer is wood. The primary action is hot-metal gold; a secondary action is a wood plank. Item slots are steel sockets with a rarity border. Anything magical gets a stepped cyan glow. Drop shadows are hard pixel shadows, and text on the arena gets a 2 px hard shadow. |
| Rarity colours | common `#c0cbdc`, uncommon `#63c74d`, magic `#0099db`, rare `#fee761`, epic `#b55088`, legendary `#f77622`. |
| Art | Real sprites from `public/sprites/delve/atlas.png`: the hero on an anvil pedestal, monsters behind the doors, the quest giver. Pixel placeholders where no art exists (anvil logo, chest). Item icons on the pixel grid. |
| Anvil hub | One screen with tabs Loadout · Skills · Forge · Codex · Quests (1–5 or LB/RB). A steel header bar: title, tabs, currencies (scrap, Links, Mana Dust) and Power. A wood footer bar: prompts for the last-used device, Training, start-depth chips and the hot-metal "Delve ▸ depth N" (Enter / Start). |
| Loadout | Three panes: equipped (paper doll around the hero on an anvil, stats, attunement, moveset summary) · bag (filters, sort, 8 columns, ▲/▼, Equip best, Salvage junk, auto-salvage) · compare (hovered or focused item against the worn one, Power delta, stat table, bind choice inline, Equip / Salvage / Lock). |
| Skills | Skill list and the mana pair box · the chain lane (move cards, "+ Slot" with its price) with chain stats and a rhythm strip · the inspector (kind, form and element segments, sockets with the rune picker inline, numbers, easing). The Apply bar is always visible. |
| Forge, Codex | Today's content, re-laid into panes in the same kit (this spec decides the panes). |
| Quests | A placeholder board: a journal grouped Main / Side / Bounties, a detail pane, rewards and "Tracked on the HUD". No quest system exists, and none is invented. |
| Dive HUD | One grid inside a 24 px safe margin with 16 px gaps. A 48 px top bar holds the Purse and the Labels / Menu hints. A 340 px right column holds the floor panel with the minimap, the Quests tracker and the "Found this floor" log. A bottom-left dock with no box (Hades style) holds Q/E/R stacked, then dodge / potion / attack and buffs, then the life and mana bars. The middle stays clear. Floor loot labels stay in Pixi. |
| Pause | Esc / Menu opens a read-only mirror of the hub over the dimmed arena. Forge is locked, item actions become "locked until the Anvil" notes, and items found this dive carry NEW tags. The footer holds Resume, Controls, Settings, Anvil (the floor restarts) and Abandon (the bounty is lost). It replaces the kebab menu. There is one Esc menu everywhere, and the TabBar's Settings drawer goes for the Delve. |
| Stop | A full screen over the dimmed arena: "Depth N cleared" with the bounty, items and runes; on the left, what was found this floor; in the centre, three power-up cards (take one or skip); on the right, the doors as large choices with art. No stacked sheets. |
| Inputs | One input map (below). Prompts follow the last-used device through the existing input lock. Hover shows a tooltip, and the pad gets the same card on focus. The pad markers keep working, and the bumpers reach nested tab lists. |
| Zoom | The dive camera zooms out about 25% for a wider view. It stays crisp (whole pixels) and is tunable. **(revision)** At 1080p this is 4 px per sprite pixel (27 units tall). |

## The input map

One map for every Delve screen. A prompt draws the glyph of whichever device spoke last (`inputDeviceStore`).

| Action | Mouse · keys | Pad | Where |
|---|---|---|---|
| Switch hub tab | 1 – 5 | LB · RB | hub, pause |
| Step a nested tab list **(revision)** | none (click) | LT · RT | Skills (the skill list), Forge (Temper / Fuse), Codex (sections) |
| Move focus **(revision)** | Tab / Shift+Tab | D-pad, left stick | everywhere |
| Select · confirm | Click, Enter on the focused control | A | everywhere |
| Back · close | Esc | B | everywhere (the topmost scope's `[data-pad-back]`) |
| Equip | Right-click | A on a focused bag tile **(revision)** | Loadout |
| Salvage | Del | X | Loadout |
| Lock | L | Y | Loadout |
| Full compare | hold Shift | hold LT | Loadout, pause |
| Apply chain changes | Ctrl + Enter | hold Y (600 ms) | Skills |
| Remove move | Del | tap Y | Skills |
| Reorder move | Drag, or Alt+← / Alt+→ **(revision)** | X picks up, D-pad moves, X drops, B cancels | Skills |
| Next · previous skill **(revision)** | `]` · `[` | RT · LT | Skills |
| Track quest **(revision)** | G | Y | Quests |
| Training | T | View | hub footer |
| Start the dive | Enter (nothing focused) | Start (the pad's Menu button) | hub |
| Pause | Esc | Menu | dive, stop |
| Journal | J | View | dive (opens the pause on Quests) |
| Panel (focus the dock) **(revision)** | click Panel | View | Training Grounds |
| Show all loot labels | hold Alt | hold LS | dive |
| Take · inspect · skip | Click · hover · S | A · Y · X | stop |

**Notes on the map:**
- **(revision) No key clashes.**
  - Tab stays the browser's focus traversal everywhere.
  - Skills uses `[` and `]` for the previous and next skill.
  - Track is G, so T stays Training.
- **In the hub, Esc / B opens the system menu.** The footer's "Menu" prompt is a real button that carries `data-pad-back`. The menu holds Resume, Controls, Settings and Main menu, plus Restart and Pull mode in dev builds.
- **Y on Skills** (decided by the coordinator). A tap removes the move, firing on release under 400 ms. A hold applies at 600 ms, with a fill on the Apply glyph. The two never both fire; see the prompt contract.

## Decided in the spec

The index of every decision this spec makes. Each line names the decision and its reason, and the sections below give the detail. Items changed or added by the review say **(revision)**.

1. **Scaling (revision).**
   - Delve UI is authored in 1080p design px under a CSS `zoom`.
   - `--ui-scale = clamp(0.75, floor(min(innerWidth/1920, innerHeight/1080) × 4) / 4, 2)`: steps of 0.25 (0.75, 1, 1.25, 1.5, 1.75, 2), not continuous.
   - `--hud-scale = max(0.75, round(ui × HUD scale × 4) / 4)`, where HUD scale is a Settings value from 80 to 125%.
   - Rounding down guarantees the 1920×1080 design fits whenever the window allows it.
   - Reason: builders copy the mockups' px verbatim, and whole quarter steps keep pixel fonts and 3 px borders on whole or regular device pixels. The 0.75 floor keeps text at least 10.5 CSS px (item 33).
2. **Arena zoom (revision, the user's choice).**
   - The camera shows the whole number of px per sprite pixel whose view height is nearest `ARENA_VIEW_UNITS = 27` arena units, with ties going to the larger scale:
     - 1080p → 4 px (27.0 units)
     - 720p → 3 (24.0)
     - 1440p → 5 (28.8)
     - 2160p → 8 (27.0)
   - The zoom no longer depends on the HUD insets.
   - Settings → View distance moves the target from 20 to 30.
   - Reason: only whole-pixel scales keep the sprites, the effect pixels and the floor crisp.
3. **Camera insets (revision).**
   - Four sides `{ top, right, bottom, left }`, from `getBoundingClientRect` (viewport px).
   - They are recomputed on window resize and on a `hudScale` change.
   - They only move the camera's centre, never the zoom. The camera's edge clamp uses the clear rectangle, not the window.
   - Reason: the HUD covers the top, the right column and the bottom-left, and `offsetHeight` is unreliable under `zoom`.
4. **Minimap (revision).**
   - A DOM `<canvas>` (2D, smoothing off) in the floor panel.
   - It draws the arena rectangle, plus terrain and obstacles if the world ever has any. `ArpgWorld` has none today: it is a 26×40 rectangle with no rooms, and the mockup's rooms were placeholders.
   - It also draws the camera's view, the hero, foes and drops.
   - Its backing store is sized from its zoomed `getBoundingClientRect` × `devicePixelRatio`, and it redraws on the HUD's 80 ms refresh from a `map` field on the snapshot.
   - Reason: dots on a frame are the whole map, and a second Pixi app would cost a WebGL context.
5. **Quests (revision: the preview flag is kept).**
   - Client view types (`QuestView`) and a `useQuests()` hook that returns no quests in v1.
   - The tab ships its full layout with an empty state, and the HUD tracker renders nothing while nothing is tracked.
   - The dev-only flag `alloy:delve:questPreview = "1"` fills both from a fixture.
   - A future engine `src/quest/` plugs in behind `useQuests()` alone.
   - Reason: it settles the tab, the tracker and their inputs without inventing a quest engine.
6. **Training Grounds (revision).**
   - Phase 3a ports them to the HUD grid minimally: `SkillDock`, with today's panel in the right column.
   - Phase 3b finishes the dock: a 400 px right-column panel for every device, one "◂ Anvil", View focusing the dock through `[data-pad-journal]` and pausing, and a `data-pad-menu` Menu button for the system menu.
   - **(revision 2)** The sandbox pauses only when the pad focuses the dock (View), not whenever the panel is open. With the mouse the fight stays live beside the open dock, as today, and T01 still holds.
   - The `sheet` layout and `openLayout` go.
   - Reason: every file has one owner per phase, and the pad never fights the menus.
7. **DPS Lab.** It takes the kit's shell (wall, steel header with kit Tabs, kit Buttons and Chips) and keeps its native selects, chart and table. Reason: it is a dev tool; a coherent frame is enough.
8. **Touch (revision).**
   - The Delve's touch paths are removed:
     - the joystick
     - drag-to-aim and drag-back-to-cancel
     - the touch-only attack button
     - the dock-or-sheet logic
   - From `aim-gestures.ts`, only `DRAG_PX` and `isOverButton` are deleted. `classifyPress`, `TAP_MS`, `aimMarkerFor` and `AimMarker` move to a new `arena/aim.ts`, and its importers are updated:
     - `input.ts`
     - `useArenaCore.ts`
     - `fx/draw-world.ts`
     - `arena-input.test.ts`
     - `aim-gestures.test.ts`, which becomes `aim.test.ts` without the `isOverButton` cases
   - The mouse's hold-to-walk and hold-to-attack stay. A click on a HUD slot still casts it auto-aimed.
   - `InputDevice` keeps `'touch'` for the classic screens, and the Delve shows mouse and key glyphs for it.
   - Reason: the Delve is PC-only, and the keyboard and pad still need press classification and aim markers.
9. **Fonts.**
   - Jersey 10, Pixelify Sans and Silkscreen are self-hosted as unmodified woff2 files from the Google Fonts repository in `public/fonts/`, each with its `OFL.txt`.
   - `@font-face` uses `font-display: block`, and `document.fonts.load` runs before Pixi makes label text.
   - The Google Fonts `<link>` stays for Rajdhani and DM Sans (classic).
   - Reason: all three are SIL OFL 1.1, which allows bundling with the licence. A Steam build can't depend on a CDN. Unmodified files avoid any Reserved Font Name question.
10. **Sprites in the DOM (revision).**
    - `PixelSprite` reads frame rectangles from `atlas.json`, fetched once.
    - It draws the frame as a `background-position` of the atlas, at a scale snapped to whole device pixels per sprite pixel: `round(scale × z × dpr) / (z × dpr)`, with `image-rendering: pixelated`.
    - `z` is `--ui-scale` or `--hud-scale`, chosen by a required `context: 'ui' | 'hud'` prop.
    - Reason: the same atlas as the arena, and crisp under either zoom.
11. **Item icons.**
    - Today's 12 SVG silhouettes become pixel maps: 10×10 ASCII grids in `ItemIcon.tsx`, one per gear base, drawn as SVG `<rect>`s with `shape-rendering: crispEdges`.
    - The fill is the rarity colour with a `#181425` outline. The props stay the same.
    - Reason: the mockups' look with no atlas rebuild. Pixel-forge stays for creatures.
12. **The classic Arena screens (revision).**
    - Every route outside `/delve*` keeps:
      - the 9:16 letterbox, the TabBar and the Settings drawer
      - `index.css`'s tokens, and Rajdhani / DM Sans
    - The main menu is untouched too: the Main board is a flow map, not a menu design.
    - `index.css` changes in two places only, owned by 1B. `.app-frame[data-frame="full"]` releases the letterbox, and the gamepad ring becomes `html[data-input='gamepad'] :focus:not(.delve-ui *)`, so the Delve shows one ring, not two.
    - Reason: they are out of scope, and Draft is locked.
13. **Contrast (revision).**
    - A `RARITY_TEXT` map in `format.ts` gives each rarity's text colour: its own colour, except epic, which is `#d7a6e8` (one off-palette light purple: 6.95:1 on steel, 9.02 on a well, 4.78 on raised steel). Borders keep `#b55088`, and loss text keeps `#f6757a`, so the meanings don't collide.
    - Coloured text on raised steel (`#3a4466`) is limited to the passing set in the Accessibility table. Other colours there become a swatch beside white text.
    - Reason: `#b55088` on steel is 2.96:1, and several colours fail on `#3a4466`.
14. **Reduced motion.**
    - Under `prefers-reduced-motion` the kit has no pulsing glows, WAAPI movement becomes a fade, and the camera's shake and strike kick are zeroed.
    - Hit-stop and the perfect dodge's slow motion stay, because they carry game information.
    - Reason: the motion that is decoration goes, and the information stays.
15. **Nested tab lists (revision).**
    - LB/RB always step the topmost scope's top-level `[data-pad-tabs]`. LT/RT step its `data-pad-tabs="sub"` list, on screens that don't bind a trigger.
    - The Skills skill list is a sub list. On the keyboard it takes `[` and `]`; RS is dropped.
    - Disabled tabs are skipped by LB/RB, LT/RT and the digit keys.
    - Reason: one rule whose meaning never depends on where the focus sits.
16. **Item actions split by place.**
    - Loadout's compare pane holds Equip, Salvage, Lock, the inline bind choice and a weapon's moveset Transfer.
    - Upgrade, Reforge and Re-attune move to the Forge's Temper bench ("Forge it ›" jumps there with the item).
    - `ItemDetailSheet` is retired.
    - Reason: the audit found Upgrade in three places and the sheet hiding the bag it compares against.
17. **Reactions, records and dev chips.**
    - The Reactions grid moves out of `ChainEditor` to the Codex.
    - The lifetime stats move to the Codex's Records.
    - The dev chips (Restart, Pull mode) move to the system menu.
    - Reason: the Main board's Codex is "legendaries, reactions", and the hub has no scrolling column left to hang them on.
18. **Settings.**
    - A kit `SettingsPanel` binds the same `uiStore` fields as the classic drawer: volumes, mute, colorblind mode. It adds Display: HUD scale and View distance.
    - It shows `v{version}`, since the Delve hides the TabBar that carries the version today.
    - The basic attack's Auto / Manual moves into the Controls panel (`attack-mode-toggle` kept).
    - Reason: one Esc menu, and the attack mode is an input preference, saved per device.
19. **The prompt runtime and Esc / Menu ownership (revision).**
    - **Prompts are data.** Footer prompts are `Prompt[]`. `Footer` and `PromptBar` only draw them, and the screen calls `usePrompts` with the same array.
    - **One owner per state.** While the arena is live (`isArenaLive()` from `gamepad-hub.ts`, the flag `setArenaLive` already keeps), the arena owns Esc, the menu key and the pad's Menu. Otherwise `usePrompts`' global handler owns them.
    - **Scoped lookups.** Every marker lookup takes the last visible match inside the topmost visible `[data-pad-scope]`, falling back to the document only when no scope exists. That covers the arena's `attachKeyboard` (`input.ts`) and `padFrame` (`useArenaCore.ts`), and the nav's `press` and `stepTabs`. **(revision 2)** In Phase 1, 1B changes only the menu lines of `attachKeyboard` and `padFrame`; from 3a, 3C owns both files.
    - **Esc** presses the topmost scope's `[data-pad-back]`, else its `[data-pad-menu]`. **Enter** presses `[data-pad-menu]` only when no control has focus.
    - **One global listener (revision 2).** 1B installs a single window `keydown` listener in the bubble phase, from `useGamepadNav` in AppShell. It is active on every `/delve*` route whether or not any prompts are registered, so Esc still closes the dive's kebab menu and the Training sheet in Phase 1. `usePrompts` registers prompts with that one listener and never adds its own.
    - **Already handled.** The listener skips events already `defaultPrevented`. **(revision 2)** The arena's menu-key handler (`attachKeyboard` in `input.ts`) calls `e.preventDefault()`, so one Esc can never open the menu and then close it.
    - **Mouse clicks.** Kit buttons blur after a mouse click (today's `blurOnPointerUp`, moved into the kit).
    - Reason: no Esc or Menu press can act twice, and Enter never fights a focused button.
20. **Stop cards (revision: confirmed).**
    - Each card names its power-up kind; the engine pre-picks nothing.
    - Taking a card that needs a choice expands its picker in place in the centre column. The expanded picker is its own `data-pad-scope` with a Back.
    - At the stop's top level there is no back. Esc / Menu open the pause over the stop.
    - Reason: no sheets over the stop, and no engine change.
21. **"Found this floor" (revision).**
    - The store records `floorDropsFrom` and `floorRunesFrom`, the lengths of `diveDrops` and `diveRunes` when a floor begins.
    - The log and the stop list from those indexes.
    - Reason: the dive's lists exist; a per-floor view is two indexes of UI state.
22. **Loot labels (revision).**
    - The labels stay Pixi text in the screen-space text layer.
    - They become rarity plaques in Jersey 10 at 14 × `--hud-scale` px, with ▲ for upgrades.
    - Rare and above, runes and upgrades always show; Alt / hold LS shows every drop.
    - The Alt hold ends on `keyup` and on window `blur` (an Alt+Tab never delivers the keyup), and the LS hold ends on release or when the pad disconnects.
    - While all show, overlapping plaques stack upward (one greedy pass sorted by y).
    - Reason: a wider view puts more drops on screen.
23. **Rebindable actions (revision).**
    - `labels` (Alt / LS) and `journal` (J / View) join `CONTROL_ACTIONS`.
    - `parseControls` fills a missing action with its default unless the saved setup already uses that key or button for another action, in which case the new action starts unbound (`null`).
    - Reason: saved setups keep working, and no default lands on a button the player already uses.
24. **Compare stats.** The compare table is built from the engine's `itemStatLines` for both items: one row per stat, a stat's lines summed for display, formatted by `formatStat`. Reason: the engine values are re-presented; no stat math is invented.
25. **Chain stats (revision).** The one engine addition, `chainCycle`, has a full contract under Phase 2B. It takes the resolved draft chain, uses `moveBeat` and `expectedHit`, excludes the basic chain, and defines `restart` and `steps`. Reason: the Skills tiles and the rhythm strip need cycle totals, and the client may not compute them.
26. **Focus order (revision).**
    - `keepFocus` prefers `[data-pad-first]` when a scope has no remembered focus. The hub marks the Delve button with it.
    - `pickNext` measures "across" as the gap between the two rectangles' spans on the cross axis (0 when they overlap) instead of the distance between centres. That stops it skipping wide buttons, such as the full-width Delve button the audit found skipped (§7).
    - Prompt-bar buttons carry `data-pad-skip`, which takes them out of D-pad candidates.
    - Reason: the first focus and the paths the audit measured.
27. **Emoji (revision).**
    - The Delve's UI chrome swaps emoji (⚙ 🔗 ✦ 🧪 💨 ⚔️ 🎮 🎯 ☠) for kit pixel glyphs, in the phase that rebuilds each surface:
      - the hub header and currencies: 1D
      - prices and the Apply label: 2B
      - Forge and Codex: 2C
      - the HUD and purse: 3A and 3B
      - the stop and summary: 3E
      - Training: 3F
    - Each phase updates the e2e assertions that read that text.
    - The Pixi monster fallback keeps its emoji.
    - Reason: emoji render differently per OS, which is a risk for a Steam build (audit §6).
28. **Toasts.** `components/Toast.tsx` is shared with the classic screens, so it stays as it is. The Delve restyles it with CSS scoped to `.delve-ui`. Reason: no change to a shared component.
29. **Boss bar and banners.**
    - The boss bar sits under the top bar, centred in the middle column, and only while a boss lives.
    - The banners stay at 26% from the top in the middle column. They use Jersey 10 with a 2 px hard shadow instead of the glow.
    - Reason: the middle stays clear, and the shadow keeps them legible over any floor.
30. **Test ids (revision).**
    - Every id the e2e specs use is kept, except the hub tabs: `tab-bag` becomes `tab-loadout` and `tab-abilities` becomes `tab-skills`. That is 11 mechanical updates.
    - The role names the specs use are also kept until their phase updates them: the purse's Menu hint keeps the accessible name "Dive menu".
    - Reason: an id that names the wrong tab would rot.
31. **Zoom ownership (revision).**
    - `.delve-ui` carries the tokens and the look only.
    - `.delve-zoom` (`zoom: var(--ui-scale)`) goes on the root of every kit `Screen` and on `#delve-ui-layer`. That layer is the portal root for dialogs and portalled tooltips, created once by `kit/layer.ts`'s `uiLayer()` (owner 1A).
    - `.delve-hud-zoom` (`zoom: var(--hud-scale)`) goes on `HudGrid`'s root, which has no zoomed ancestor.
    - **Rule:** the Pixi canvas host never has a zoomed ancestor. `kit/zoom.ts`'s `hasZoomedAncestor(el)` checks it: it has a unit test, `useArenaCore` calls it in dev builds (a `console.error`), and the dive e2e asserts it.
    - Phase 1 does not zoom the legacy dive HUD, because its 8–11 px text would fall below the minimum.
    - Reason: a canvas under `zoom` would desync Pixi's pointer mapping and its whole-pixel scale.
32. **Coordinates under zoom (revision).**
    - `getBoundingClientRect` and pointer coordinates are viewport px. Inside a zoomed layer, they are divided by that layer's zoom (`layerZoom(el)`, from the class it sits under) before being used as CSS lengths.
    - This applies to the `Tooltip`'s position and the `ChainLane` drag.
    - The camera insets and the minimap's backing store use viewport and device px directly.
    - Supported engines: Chromium 128 or later (standardized `zoom`; a Steam shell must embed Chromium 128 or later), and Firefox 126 or later as best effort.
    - Reason: the standardized `zoom` reports boxes in viewport px.
33. **Minimum text size (revision).**
    - No text is smaller than 14 design px (10.5 CSS px at the 0.75 floor). That covers:
      - Silkscreen labels: up from the mockups' 11 px
      - glyph text: 14 in `sm`, 16 in `md`
      - buff tile timers and NEW tags: up from 12 and 9
    - Reason: readability at 1280×720.
34. **Apply bar (revision, the user's).**
    - Always visible on Skills: "n unapplied changes · price", Revert and Apply.
    - With nothing unapplied, the group shows "No changes", disabled.
    - Reason: the user's decision.
35. **Galvanize (revision).** Galvanize shows as the spark on cooling skill slots only. It is never a buff tile with a timer, since the engine gives it no duration. Reason: no invented timer.
36. **Bag tiles on the pad (revision).**
    - Under the pad, focusing a bag tile already selects it for the compare pane, so A on it equips.
    - Under the mouse, a click selects (pins the compare pane) and a right-click equips. Enter on a keyboard-focused tile selects.
    - The tile reads `inputDeviceStore` to choose.
    - Reason: on the pad, focus is the selection.
37. **Reordering moves (revision).**
    - The selected move card shows a visible toolbar of ◂ ▸ × buttons, 32 px, carrying `move-left-<i>`, `move-right-<i>` and `move-remove-<i>`. Because it is visible, the D-pad and tests reach it.
    - With the mouse, drag. With the keyboard, Alt+← / Alt+→.
    - With the pad, X picks the card up and the prompt registry captures the D-pad while carrying (`captureNav`): left and right move it, X drops it, and B puts it back.
    - Reason: no hidden controls that the pad nav, which skips zero-size elements, couldn't reach.
38. **Legacy content under a zoom (revision 2).**
    - Phase 1's interim panel column (today's panels inside the new hub) gets `zoom: calc(1 / var(--ui-scale))`, so today's small text doesn't shrink before Phase 2 replaces it.
    - In 3a, today's `TrainingPanel` in the HUD's right column gets `zoom: calc(1 / var(--hud-scale))` for the same reason, until 3F rebuilds it.
    - Reason: 8–11 px legacy text at 0.75 would fall under the minimum size.
39. **In-pane sub-modes are scopes (revision 2).**
    - The Mana view in the Skills right pane, Reforge's affix pick on the Forge bench, the inline rune picker and every other mode that temporarily replaces a pane's content is its own `data-pad-scope` with a Back (`data-pad-back`).
    - So Esc and B return to the pane, never past it to the hub's system menu.
    - Reason: the scoped lookups of item 19 find the innermost Back first.

## Architecture

### Where the new code lives

All paths are under `packages/client/src/`:
- **`features/delve/kit/`**: the forge kit.
  - `kit.css`: tokens, `@font-face`, materials, the focus ring, `.delve-ui`, `.delve-zoom`, `.delve-hud-zoom`
  - `types.ts` **(revision)**: the shared types
  - `prompts.ts`: the prompt runtime
  - `layer.ts` and `zoom.ts` **(revision)**
  - the components in the contract below, and `index.ts`
- **`features/delve/items/`**: the item views extracted from `ItemDetailSheet.tsx`, and **(revision)** `AttunementBars.tsx`.
- **`features/delve/hub/`**:
  - `AnvilHub.tsx`, the screen in `mode: 'anvil' | 'pause'`
  - `HubHeader.tsx`, `HubFooter.tsx`, `SystemMenu.tsx`, `SettingsPanel.tsx` and **(revision)** `PauseScreen.tsx`
  - one folder per tab: `loadout/`, `skills/`, `forge/`, `codex/` (with `ReactionsGrid.tsx`), `quests/`
- **`features/delve/quests/`**: `types.ts`, `useQuests.ts`, `QuestTracker.tsx` and `sample.ts`.
- **`features/delve/arena/hud/`**:
  - the grid and top bars: `HudGrid.tsx`, `PurseBar.tsx`, `TrainingBar.tsx`, `BossBar.tsx`
  - the dock: `SkillDock.tsx`, `SkillSlot.tsx`, `SkillTooltip.tsx`, `BuffRow.tsx`, `Vitals.tsx`
  - the right column: `FloorColumn.tsx`, `Minimap.tsx`, `FoundLog.tsx`
- **`features/delve/arena/camera.ts`**: the zoom rule. **(revision)** **`features/delve/arena/aim.ts`**: from `aim-gestures.ts`.
- **`features/delve/stop/`**: `StopScreen.tsx` and `DoorPane.tsx`. It reuses `StopPanel.tsx`'s pickers.

### What changes, and what replaces it

| Today | v1 | Phase |
|---|---|---|
| `components/AppShell.tsx`: 9:16 letterbox below 3:2; TabBar hidden only on `/delve/run`, `/delve/training` and `/delve/lab` | `data-frame="full"` on `.app-frame` for every `/delve*` route, the TabBar hidden on all of them, and `--ui-scale` / `--hud-scale` set on `:root`. **(revision)** They are recomputed on resize and on a `hudScale` change, and mirrored into `uiStore` | 1 |
| `components/TabBar.tsx` (version label), `SettingsDrawer.tsx` | Untouched; Delve routes don't render them. The Delve shows its version in `SettingsPanel` | 1 |
| `index.css`: the letterbox, and the `html[data-input='gamepad'] :focus` ring | **(revision)** Owned by 1B: `[data-frame="full"]` releases the letterbox, and the ring skips `.delve-ui` | 1 |
| `features/delve/format.ts`: `RARITY_COLOR` | **(revision)** Owned by 1A: ENDESGA values, plus `RARITY_TEXT` | 1 |
| `features/delve/delve.css`: rounded gradient `.delve-btn`, `.delve-chip`, `.delve-panel`, `.delve-tile`, `.delve-sheet` and `.delve-hpbar`; `.delve-column` (560 px) | Phase 1 re-skins the legacy classes to the forge materials, so screens not yet rebuilt match. Phases 2–3 delete each class as its last user goes; `.delve-column` and `.delve-sheet` go in Phase 3b | 1–3 |
| `pages/DelveCamp.tsx`: one scrolling column with the header, how-to, `PaperDoll`, mana strip, CTA, tabs, lifetime stats and dev chips | Renders `<AnvilHub mode="anvil" />` and `ManaChoice`. Everything else moves into the hub | 1 (shell), 2 (panes) |
| `BagPanel`, `PaperDoll`, `ItemTile` | `hub/loadout/BagPane`, `EquippedPane`; `ItemTile` wraps kit `Tile` | 2 |
| `ItemDetailSheet.tsx` (bottom sheet) | Phase 1 splits it into `items/*` while it keeps working. Phase 2 drops it from the hub (compare pane, item tooltip, Forge bench). Phase 3b deletes it (pause, stop) | 1–3 |
| `BindPrompt.tsx` (modal) | Inline in the compare pane, the same engine op (`bindSecondary`) | 2 |
| `AbilitiesPanel.tsx` (also exports `AttunementBars` and `Chip`, imported by `ChainEditor`, `MoveEditor`, `ManaPanel`, `TrainingPanel` and `DelveLab`) | **(revision)** Step 2·0 moves `AttunementBars` to `items/AttunementBars.tsx` and swaps every old `Chip` for the kit `Chip` (same `pressed` prop). Then 2B deletes `AbilitiesPanel.tsx` | 2 |
| `chains/ChainEditor.tsx` (incl. the reactions grid), `chains/MoveEditor.tsx`, `ManaPanel.tsx`, `runes/SocketRow.tsx`, `runes/RunePicker.tsx` (sheet) | **(revision)** Step 2·0 moves the reactions grid to `hub/codex/ReactionsGrid.tsx`. 2B then builds:<br>• `useChainEditor`, which takes the state and handlers out of `ChainEditor`<br>• the panes `SkillList`, `ChainLane` with `ChainStats` and `RhythmStrip`, and `MoveInspector`<br>• the Mana view in the right pane<br>• **(revision)** `RunePicker` with `variant: 'sheet' \| 'inline'`: the inline picker in the inspector, while the sheet variant serves Training and the stop until 3b removes it<br>`ChainEditor` stays as the one-column composition for the Training dock and the stop's "Adjust a move" | 2, 3b |
| `ForgePanel.tsx`, `runes/RunePouchPanel.tsx` | `hub/forge/`: `GearList` · `Bench` (Temper: upgrade, reforge, re-attune; Fuse) · `RunePane` | 2 |
| `CodexPanel.tsx` | `hub/codex/`: `CodexSections` · `CodexGrid` (with `ReactionsGrid`) · `CodexDetail` (Legendaries, Reactions, Records) | 2 |
| none | `hub/quests/` (journal, detail, rewards) and `quests/*` | 2 |
| `features/controls/ControlsPanel.tsx` (centred modal) | The same content in a kit `Dialog`, plus Auto / Manual basic attack. It opens from the system menu, the pause footer and the Training bar | 1 (dialog), 3b (toggle) |
| `ManaChoice.tsx` | Kit `Dialog`, forced (no back) | 1 |
| `pages/DelveRun.tsx`: `TopHud`, a 520 px bottom strip (`Vitals`, `SkillBar`, `AttackButton`), the kebab menu, `PickupFeed`, the door overlay with `LootTray` | `HudGrid` with `PurseBar`, `FloorColumn` and `SkillDock`, then `PauseScreen`, `StopScreen` and a kit `DiveSummary`. **(revision)** Owned by 3A in 3a and by 3E in 3b | 3a, 3b |
| `pages/DelveTraining.tsx` | **(revision)** 3a, owned by 3A: `HudGrid` + `SkillDock`, with today's top-bar contents in a glass bar and today's `TrainingPanel` in the right column. 3b, owned by 3F: the `TrainingBar` and the finished dock | 3a, 3b |
| `arena/useArena.ts`, `training/useTrainingArena.ts` (`insets: { top, bottom }`) | **(revision)** Owned by 3C in 3a: `insets: Insets` | 3a |
| `arena/ArenaHud.tsx` (712 lines: round thumb buttons with drag-to-aim) | Split into `arena/hud/*`. `floatPay` stays (it finds `[data-testid="ability-N"]`) and floats beside the slot. `keyHints` / `padHints` give way to `InputGlyph` | 3a |
| `arena/ArenaControls.tsx` | Mouse only: the joystick branch, `STICK_RADIUS` and the "Drag to move" hint go. A device-aware hint clears on the first move by any device | 3a |
| `arena/aim-gestures.ts` (+ test) | **(revision)** `arena/aim.ts`, keeping `classifyPress`, `TAP_MS`, `aimMarkerFor` and `AimMarker`; `DRAG_PX` and `isOverButton` deleted | 3a |
| `arena/PickupFeed.tsx` | `arena/hud/FoundLog.tsx` | 3a |
| `arena/ArenaRenderer.ts`: `unit = max(16, min(w/13.5, playH/15))`, `setInsets(top, bottom)`, 13 px drop labels for rare and above | `camera.ts` zoom, `setInsets(Insets)`, `viewRect()`, rarity plaques, whole-pixel root position, a clear-rectangle clamp | 3a |
| `arena/useArenaCore.ts`: `snapshot(world)` | **(revision)** `snapshot(world, renderer)` with `buffs` and `map`, plus the `labels` hold and the `journal` press. `arena-hud-snapshot.test.ts` passes `null` for the renderer | 3a |
| `arena/input.ts`: the menu key works while paused | **(revision)** 1B: the menu key acts only while `isArenaLive()`, through the scoped lookup. 3C: `labels`, `journal`, and the Alt `keyup`/`blur` | 1, 3a |
| `DoorChoice.tsx`, `LootTray.tsx`, `StopPanel.tsx`'s sheet portal | `stop/StopScreen.tsx` (found · power-ups · doors). The pickers keep their code and lose the sheet | 3b |
| `DiveSummary.tsx`, `LegendaryFanfare.tsx` | Kit re-skin, same content and ids | 3b |
| `training/TrainingPanel.tsx` (dock or sheet, 5 tiny tabs, two "◂ Anvil") | The panel as the right-column dock, kit Tabs, the `sheet` layout gone | 3b |
| `pages/DelveLab.tsx`, `lab/*` | Kit shell only | 4 |
| `features/gamepad/use-gamepad-nav.ts`, `spatial-nav.ts`, `gamepad-hub.ts` | Covered by decided items 15, 19 and 26 **(revision)**:<br>• X, Y, View, LS, LT and RT, and the holds, routed to `usePrompts`<br>• `data-pad-tabs="sub"`, `data-pad-first` and `data-pad-skip`<br>• scoped `press` and `stepTabs`<br>• disabled tabs skipped<br>• the `pickNext` fix<br>• `isArenaLive()` | 1 |
| `features/gamepad/arena-pad.ts`, `controls/controls.ts` | `labels` and `journal` actions, and the default dedupe in `parseControls` | 3a |
| `stores/inputDeviceStore.ts` | Unchanged | none |
| `stores/uiStore.ts` | `uiScale`, `hudScale` (`alloy:delve:hudScale`, default 1) and `arenaViewUnits` (`alloy:delve:viewUnits`, default 27). **(revision)** All three names land in step 1·0 | 1, 3a |
| `stores/delveStore.ts` | 2B: `applyLabel` without emoji. 3B: `floorDropsFrom` and `floorRunesFrom` | 2, 3a |

## The forge kit (Phase 1)

### Tokens (`kit.css`, on `.delve-ui`)

| Token | Value | Use |
|---|---|---|
| `--k-well` | `#181425` | tile wells, bars' tracks, the darkest ground, outlines |
| `--k-steel` / `-1` / `-2` / `-3` | `#262b44` / `#3a4466` / `#5a6988` / `#8b9bb4` | plates, raised steel, rivets and edges, labels |
| `--k-text` / `-2` / `-3` | `#ffffff` / `#c0cbdc` / `#8b9bb4` | body, secondary, caption |
| `--k-wood-0` / `-1` / `-hi` / `-text` | `#3e2731` / `#733e39` / `#b86f50` / `#ead4aa` | frames, planks, plank highlight, text on wood |
| `--k-hot` / `-hi` / `-lo` / `-ink` | `#feae34` / `#fee761` / `#f77622` / `#3e2731` | the primary action |
| `--k-mana` / `-1` / `-2` | `#2ce8f5` / `#0099db` / `#124e89` | anything magical |
| `--k-ok` / `--k-bad` / `--k-bad-text` | `#63c74d` / `#e43b44` / `#f6757a` | gain, loss (glyph), loss (text) |
| `--r-common` … `--r-legendary` | as the decisions table | borders, fills, swatches |
| `--rt-common` … `--rt-legendary` **(revision)** | `RARITY_TEXT`: the rarity colours, except epic `#d7a6e8` | rarity as text |
| `--k-font-display` / `-body` / `-label` | `'Jersey 10'`, `'Pixelify Sans'`, `'Silkscreen'` | |
| Type scale (design px) **(revision)** | display 64, heading 32, section 22, body 18, body-2 16, caption 14, label 14 (Silkscreen, uppercase only). Nothing is smaller than 14 | |

**Global rules on `.delve-ui`:**
- `border-radius: 0`, font smoothing off and `svg { shape-rendering: crispEdges }`.
- Display text gets `text-shadow: 2px 2px 0 #181425`.
- **(revision)** `.delve-ui` sets no `zoom`; that is `.delve-zoom`'s and `.delve-hud-zoom`'s job (decided item 31).
- `format.ts`'s `RARITY_COLOR` takes the ENDESGA values, so every Delve use (tiles, the arena's drop tint, the codex) changes at once.

### Materials

These are copied from the mockups (Appendix A):
- **Wall** (`.k-wall`): the wood-plank backdrop with the stepped orange floor glow.
- **Plate** (`.k-plate`, hub panels):
  - a 6 px `#733e39` wood frame around `#262b44` steel, with 4 px rivets inset 10 px
  - a 3 px `#181425` outline
  - a 6 px hard drop shadow
- **Glass** (`.k-glass`, HUD panels): `rgba(38,43,68,.94)` steel, a 4 px `#3a4466` border and `#5a6988` rivets.
- **Band** (`.k-band`, header): `#3a4466` steel with two rivet rows and the mana line (`0 4px 0 #0099db, 0 8px 0 rgba(44,232,245,.28)`).
- **Planks** (`.k-planks`, footer): `#5c3434` / `#4a2a2e` planks with a `#b86f50` top light.
- **Hot metal** (`.k-hot`): `#feae34` with a `#fee761` top bevel, a `#f77622` bottom bevel and a stepped orange glow (3 px and 8 px rings).
- **Plank button** (`.k-plank`).
- **Socket** (`.k-socket`, tiles): a `#181425` well, insets of `#262b44` (3 px) and `#3a4466` (5 px), and a rarity border.
- **Mana glow** (`.k-mana`): stepped cyan rings, 3, 6, 10 and 14 px.

### Focus

**One ring.** Every kit control uses `outline: 3px solid #fee761; outline-offset: 3px` plus a 4 px `#181425` hard shadow.

**When it shows:**
- under `:focus-visible` (keyboard)
- on any `:focus` while `html[data-input='gamepad']`
- never for a mouse click

**(revision)** `index.css`'s classic gamepad ring skips `.delve-ui`, so the Delve never draws two rings.

### The kit contract

Several builders work on the kit at once against this contract. Everything is exported from `features/delve/kit/index.ts`, with sizes in design px.

**(revision)** The types land first, in step 1·0. That step adds `kit/types.ts`, a stub `index.ts` whose components render `null` and whose hooks are no-ops, and the `uiStore` field names. **(revision 2)** The stub `useUiScale` returns `{ ui: 1, hud: 1 }`. 1A, 1B and 1C then build against real imports.

```ts
// ── kit/types.ts (step 1·0) ──────────────────────────────────────────────
import type { ReactNode } from 'react';
import type { FormId, ManaType } from '@alloy/engine';
import type { PadButton } from '@/features/gamepad/gamepad';

/** One action's inputs on both devices. */
export interface Binding {
  /** KeyboardEvent.code, or several ('Delete' | ['BracketRight']…). The first is the one drawn. (revision) */
  key?: string | string[];
  ctrl?: boolean;
  alt?: boolean;
  /** A pointer gesture shown instead of (or beside) a key. */
  mouse?: 'click' | 'rmb' | 'lmb' | 'drag' | 'hover';
  pad?: PadButton;
  /** Pad: this binding is a hold, firing `onHold(true)` after this many ms (default 600). (revision) */
  padHold?: number;
  /** A key held down rather than pressed: Shift compare, Alt labels (onHold true on down, false on up/blur). */
  whileHeld?: boolean;
}

/**
 * One prompt. (revision) Press timing:
 * - A prompt with only `onPress` fires on press down.
 * - Two prompts may share a pad button in a scope only if exactly one of them has `padHold`
 *   (Skills: Y Remove and hold-Y Apply). Then the tap's `onPress` fires on release under 400 ms,
 *   the hold's `onHold(true)` fires at `padHold`, and a press released between them fires neither.
 * - `whileHeld` and LT-hold prompts get `onHold(true)` on down and `onHold(false)` on up.
 */
export interface Prompt {
  id: string;
  label: string;
  binding: Binding;
  /** None: display only (e.g. "Select"). */
  onPress?: () => void;
  onHold?: (held: boolean) => void;
  disabled?: boolean;
  /** Drawn as a real (non-navigable, data-pad-skip) button that the mouse can click, e.g. the hub's "Menu" (data-pad-back). */
  asButton?: boolean;
  padBack?: boolean;
}

export type GlyphId =
  | 'scrap' | 'link' | 'dust' | 'rune' | 'potion' | 'dodge' | 'attack' | 'lock' | 'check'
  | 'skull' | 'anvil' | 'chest' | 'up' | 'down' | 'new' | 'potential'
  | 'controls' | 'settings' | 'training' | 'menu' | 'journal' | 'lab' | 'door' | 'extract'   // (revision)
  | 'riposte' | 'quick' | 'barrier' | 'galvanize'                                         // buffs (revision)
  | ManaType | FormId;                                                                  // 6 elements, 12 forms (revision)

export type ScaleContext = 'ui' | 'hud';                                                 // (revision)

// ── prompts.ts (1B) ──────────────────────────────────────────────────────
/**
 * Binds the prompts' keys and pad buttons while mounted, for the topmost visible
 * `[data-pad-scope]` containing `scopeRef` (the document when absent). Ignores keys typed into
 * inputs and events already `defaultPrevented`, and is inert while `isArenaLive()`.
 */
export function usePrompts(prompts: Prompt[], scopeRef?: RefObject<HTMLElement | null>): void;
/** While carrying (Skills' pad reorder): the D-pad and A/B/X go to `handler` instead of the nav. Returns release. (revision) */
export function captureNav(handler: (input: NavDir | 'a' | 'b' | 'x') => void): () => void;
/** The topmost visible [data-pad-scope] (or the document), and the last visible match inside it. (revision) */
export function topScope(): HTMLElement | Document;
export function scopedLast(selector: string): HTMLElement | null;

// ── Glyphs (1A) ──────────────────────────────────────────────────────────
/** (revision) sm: 28 px tall, 14 px text (HUD corners, inline prompts); md: 32 px tall, 16 px text (footers, buttons). */
export function Keycap(props: { label: string; size?: 'sm' | 'md' }): ReactElement;
/** Octagonal pad glyph: A #63c74d, B #e43b44, X #0099db, Y #fee761, the rest #c0cbdc; ink #181425. */
export function PadGlyph(props: { button: PadButton; hold?: boolean; size?: 'sm' | 'md' }): ReactElement;
/** The keycap or pad glyph for the device that holds the input lock ('touch' draws the mouse/key side). */
export function InputGlyph(props: { binding: Binding; size?: 'sm' | 'md' }): ReactElement;
/** A pixel glyph drawn as crisp SVG rects (replaces emoji in the Delve's chrome). */
export function Glyph(props: { id: GlyphId; size?: number; color?: string; title?: string }): ReactElement;
/** A price or a purse amount with its glyphs: "1 Link · 20 scrap". Its text content reads the same as the aria label. (revision) */
export function Price(props: { scrap?: number; links?: number; dust?: number; signed?: boolean }): ReactElement;
/** Prompts drawn in a row. Draws only; the screen calls usePrompts with the same array. (revision) */
export function PromptBar(props: { prompts: Prompt[]; className?: string }): ReactElement;

// ── Surfaces (1A) ────────────────────────────────────────────────────────
export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'aside';
  /** 'plate': wood-framed riveted steel (hub). 'glass': HUD steel. 'well': a dark inset. */
  material?: 'plate' | 'glass' | 'well';
  title?: ReactNode;
  aside?: ReactNode;
  /** Border colour override: a rarity, the selected state. */
  accent?: string;
  /** Scrolls inside itself; the screen never scrolls. Default true for 'plate'. */
  scroll?: boolean;
  testId?: string;
}
export function Panel(props: PanelProps): ReactElement;

export interface ScreenProps {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  /** 'wall': the wood wall. 'arena-pause': rgba(24,20,37,.86) over the arena. 'arena-stop': rgba(6,6,11,.82). */
  backdrop: 'wall' | 'arena-pause' | 'arena-stop';
  /** 'band': the steel header band (hub, pause). 'bare': text over the backdrop (stop). (revision) */
  headerStyle?: 'band' | 'bare';
  testId?: string;
}
/** A 1080p-design screen with .delve-ui.delve-zoom and data-pad-scope: a 72 px header, flexible main, 76 px plank footer. */
export function Screen(props: ScreenProps): ReactElement;
export function Header(props: { title: ReactNode; subtitle?: ReactNode; nav?: ReactNode; aside?: ReactNode }): ReactElement;
/** Draws only (revision): the screen calls usePrompts. */
export function Footer(props: { prompts: Prompt[]; children?: ReactNode }): ReactElement;

export interface DialogProps {
  title: ReactNode;
  /** Absent: forced (no back, no Esc), e.g. the mana choice. */
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  initialFocus?: RefObject<HTMLElement | null>;
  testId?: string;
}
/** A centred plate in uiLayer() (zoomed). data-pad-scope; its Back is data-pad-back; focus returns to the opener. */
export function Dialog(props: DialogProps): ReactElement;
/** (revision) The portal root #delve-ui-layer (.delve-ui.delve-zoom), created on first call. */
export function uiLayer(): HTMLElement;
/** (revision) The zoom an element sits under (1 when none), and the dev check for the canvas host. */
export function layerZoom(el: Element): number;
export function hasZoomedAncestor(el: Element): boolean;

// ── Controls (1A) ────────────────────────────────────────────────────────
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'go' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
  /** Draws its glyph at the right end. Display only: usePrompts binds it. */
  binding?: Binding;
  testId?: string;
}
/** Blurs itself after a mouse click (so Enter/Esc reach the screen); never after a key or pad press. */
export function Button(props: ButtonProps): ReactElement;

export interface TabsProps<T extends string> {
  tabs: { id: T; label: ReactNode; badge?: ReactNode; disabled?: boolean; title?: string; testId?: string }[];
  value: T;
  onChange: (id: T) => void;
  /** 'top': LB/RB. 'sub': LT/RT. Disabled tabs are skipped. */
  level: 'top' | 'sub';
  /** (revision 2) Draws the 1..n digit glyphs only. The screen binds the digit keys through its prompts (AnvilHub, 1D), skipping disabled tabs. */
  digits?: boolean;
  glyphs?: boolean;
  size?: 'lg' | 'md';
  'aria-label': string;
}
export function Tabs<T extends string>(props: TabsProps<T>): ReactElement;

/** (revision) `pressed`, as the old AbilitiesPanel Chip, so step 2·0 is an import swap. */
export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  testId?: string;
}
export function Chip(props: ChipProps): ReactElement;

export interface SegmentedProps<T extends string> {
  options: { id: T; label: ReactNode; color?: string; disabled?: boolean; title?: string; testId?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  columns?: number;
  'aria-label': string;
}
/** `color` tints the label only when it passes on #3a4466 (the Accessibility table); otherwise it shows as a swatch. (revision) */
export function Segmented<T extends string>(props: SegmentedProps<T>): ReactElement;

export interface BarProps {
  value: number;
  max: number;
  kind: 'life' | 'mana' | 'charge' | 'progress';
  extra?: { value: number; color: string };
  label?: ReactNode;
  height?: number;
  segmented?: boolean;
  testId?: string;
}
export function Bar(props: BarProps): ReactElement;

// ── Items (1A) ───────────────────────────────────────────────────────────
export interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  rarity: Rarity | null;
  icon?: ReactNode;
  size?: number;
  delta?: 'up' | 'down' | 'potential' | null;
  fresh?: boolean;
  locked?: boolean;
  equipped?: boolean;
  selected?: boolean;
  label: string;
  testId?: string;
}
export function Tile(props: TileProps): ReactElement;

// ── Tooltips (1A) ────────────────────────────────────────────────────────
export interface TooltipProps {
  content: () => ReactNode;
  children: ReactElement;
  placement?: 'right' | 'left' | 'top' | 'bottom';
  openWhile?: boolean;
  /** Default true: into uiLayer(). The HUD passes false and the card renders inline, under the HUD's zoom. (revision) */
  portal?: boolean;
}
/** Positions from getBoundingClientRect ÷ layerZoom (revision). */
export function Tooltip(props: TooltipProps): ReactElement;
export function TooltipCard(props: {
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  children: ReactNode;
  prompts?: Prompt[];
  /** 'plate' (hub: the UI kit board's tooltip) or 'glass' (HUD: the skill tooltip). (revision) */
  material?: 'plate' | 'glass';
  width?: number;
}): ReactElement;

// ── Art (1A) ─────────────────────────────────────────────────────────────
export interface PixelSpriteProps {
  id: string;
  scale: number;
  /** Which zoom it sits under, for the whole-device-pixel snap. Required. (revision) */
  context: ScaleContext;
  frame?: number;
  label?: string;
}
export function PixelSprite(props: PixelSpriteProps): ReactElement;

// ── Scale (1B) ───────────────────────────────────────────────────────────
export function useUiScale(): { ui: number; hud: number };
```

**Rules every builder keeps:**
- **No `data-testid` on a kit internal.** A screen passes `testId`, so ids stay where the e2e specs expect them.
- **Text.** Kit components never set a text colour below 4.5:1 on their own ground. Rarity text uses `RARITY_TEXT`, and no text is under 14 design px.
- **Gestures.** No component handles touch gestures.
- **Glyph or label.** A `Button` with a `binding` shows the glyph for the locked device. With no binding, it shows only its label.

## Phase 1: Foundation (v0.54.0)

**What ships:**
- the kit
- the forge look on every Delve screen, through the re-skinned legacy classes
- the Delve full-window, free of the letterbox and the TabBar
- UI scaling on the hub and dialogs; **(revision)** the legacy dive HUD is not zoomed
- self-hosted fonts
- the prompt runtime with hotkeys and scoped Esc / Menu
- the focus ring
- one system menu with Controls and Settings
- the Anvil shell: header, tabs and footer around today's panels

### Step 1·0 · Shared types (revision; first, by the integrator, tiny)

`kit/types.ts` as above, a stub `kit/index.ts`, and the `uiStore` field names (`uiScale`, `hudScale`, `arenaViewUnits`; values wired in 1B and 3C). It merges before the areas start.

### Areas

**1A · Kit visuals (parallel).**
- **Built:** `kit.css` (tokens, materials, fonts, focus, `.delve-zoom`, `.delve-hud-zoom`) and the font files with their `OFL.txt` under `public/fonts/`.
- **Components:** every component in the contract except those in `prompts.ts` and `useUiScale`.
- **Also:** `layer.ts` and `zoom.ts`.
- **Legacy re-skin:** `delve.css`'s legacy classes move to the materials:
  - `.delve-btn` becomes a plank and `-gold` hot metal
  - `.delve-panel` becomes a plate
  - `.delve-tile` becomes a socket
  - `.delve-chip` and `.delve-hpbar` take the forge look
  - `.delve-sheet` becomes a steel plate with no radius
- **(revision) `format.ts`:** `RARITY_COLOR` takes the ENDESGA values, and `RARITY_TEXT` is added.
- **(revision 2) Legacy rarity text.** Grep the Delve for `RARITY_COLOR` used as a text `color` (item names, rarity labels, counts) and switch those uses to `RARITY_TEXT`, so epic text on the re-skinned legacy screens passes contrast. Borders, glows and swatches keep `RARITY_COLOR`.
- **Icons:** the pixel `ItemIcon` maps.
- **Tests:**
  - each component renders its role and aria state
  - `InputGlyph` switches with `inputDeviceStore`
  - `Tile` states
  - `snapScale(scale, z, dpr)`
  - `hasZoomedAncestor` and `layerZoom`

**1B · Shell and input plumbing (parallel; no visuals).**
- **AppShell:**
  - `data-frame="full"` for `/delve*`
  - `hideTabBar` for `/delve*`
  - `--ui-scale` and `--hud-scale` (quarter steps) computed on resize and on a `uiStore.hudScale` change, then mirrored into `uiStore`
- **`index.css`:** the letterbox release, and the ring scoped away from `.delve-ui`.
- **(revision 2) The global key listener:** one window `keydown` listener (bubble phase), installed by `useGamepadNav` in AppShell. It is active on every `/delve*` route, with or without registered prompts, and it skips `defaultPrevented` events (decided item 19).
- **`kit/prompts.ts`:**
  - the registry keyed by scope, feeding that one listener
  - the tap and hold timing
  - `captureNav`, `topScope` and `scopedLast`
  - the global Esc / Enter rules of decided item 19, inert while `isArenaLive()`
  - `useUiScale`
- **`use-gamepad-nav.ts`:**
  - routes X, Y, View, LS, LT and RT, and the holds, to the registry
  - scopes `press` and `stepTabs`
  - adds `data-pad-tabs="sub"`, `data-pad-first` and `data-pad-skip`
  - skips disabled tabs
- **`spatial-nav.ts`:** the `pickNext` cross-axis fix.
- **`gamepad-hub.ts`:** exports `isArenaLive()`.
- **`arena/input.ts`:** the menu key acts only while live, and through `scopedLast('[data-pad-menu]')`. **(revision 2)** It calls `e.preventDefault()`, so the global listener skips that Esc. This fixes today's double handling of Esc when the kebab is open.
- **`arena/useArenaCore.ts` (revision 2):** `padFrame`'s menu line only, to `scopedLast('[data-pad-menu]')`. 3C owns the file from 3a.
- **Tests:**
  - `use-gamepad-nav.test.ts`: sub-tabs, first focus, the scoped back, disabled tabs
  - `gamepad.test.ts`: `pickNext` reaches a wide button below a small off-centre one
  - `prompts.test.ts`: chords, the tap and hold split, the topmost scope only, an input focused, `defaultPrevented`, arena live, and **(revision 2)** Esc closing a scope's Back with no prompts registered

**1C · Item views (parallel).** Split `ItemDetailSheet.tsx` into `features/delve/items/` with no visual change. The sheet composes these until Phase 3b:

```ts
export function useItemComparison(uid: string | null): {
  item: GearItem | null; worn: GearItem | null; where: 'bag' | 'equipped' | null;
  cmp: ItemComparison | null; asIs: ItemComparison | null;
};
export function ItemHeader(props: { item: GearItem; size?: 'md' | 'lg' }): ReactElement;
export function PowerDelta(props: { cmp: ItemComparison | null; label?: string }): ReactElement;
export function ItemStatLines(props: { item: GearItem }): ReactElement;
export function CompareTable(props: { item: GearItem; worn: GearItem | null }): ReactElement;
export function LegendaryBox(props: { item: GearItem }): ReactElement;
export function MovesetView(props: { item: GearItem }): ReactElement;
```

**(revision)** `ItemTooltip` moves to 1D, because it needs the kit's `TooltipCard`. **(revision 2)** It lives in `items/ItemTooltip.tsx`, written by 1D after 1C merges. `ItemDetailSheet.test.tsx` keeps passing, and the new pieces get render tests.

**1D · Anvil shell and menus (after 1A, 1B and 1C merge).**
- **`AnvilHub`** (`mode: 'anvil' | 'pause'`, the pause wired in 3b), as a `Screen` on the wall:
  - **Header:** the anvil glyph, "The Anvil", "Deepest N · n of 12 legendaries", the Tabs (top, digits, glyphs), then the currencies as `Price` glyphs, a divider and Power (`hero-power`, `scrap-count` and `links-count` kept).
  - **Footer:** the tab's prompts, including the "Menu" `asButton` prompt (`data-pad-back`). Then Training (T / View, `training-button`), the start-depth chips (`start-depths`) and the hot-metal Delve button (`delve-button`, `data-pad-menu`, `data-pad-first`). The draft block (`draft-block`, `draft-apply`, `draft-discard-delve`) is in a footer slot until Phase 2's Apply bar.
- **Interim main area:** each tab shows today's panel in a centred 960 px column. Loadout holds `PaperDoll` and `BagPanel`. Skills holds `AbilitiesPanel`. Forge and Codex hold their panels. Quests holds the empty state.
  - **(revision 2)** The column gets `zoom: calc(1 / var(--ui-scale))` (decided item 38).
  - **(revision 2)** The `mana-strip` moves onto the interim Loadout tab, under the paper doll. It reads "Skills ›" and opens the Skills tab.
- **(revision 2) Digit keys.** `AnvilHub` binds 1–5 through its own prompts, skipping disabled tabs; `Tabs` only draws the digit glyphs.
- **How-to:** "How to delve" (`delve-howto`, first save) is rewritten per device with `InputGlyph`s. It sits at the top of the Loadout tab.
- **`ItemTooltip`** **(revision)**, in `items/ItemTooltip.tsx` **(revision 2)**.
- **`SystemMenu`** (Esc / B): Resume, Controls, Settings, Main menu, and dev Restart and Pull mode (`restart-delve`, `unsocket-chip`). `open-controls` is kept on its Controls entry. **(revision 2)** Its contract:

  ```ts
  // hub/SystemMenu.tsx (1D)
  export interface SystemMenuProps {
    onClose: () => void;
    /** Screen-specific entries above Controls (the Training Grounds' "Anvil"). */
    extra?: { id: string; label: string; onSelect: () => void }[];
  }
  ```
- **`SettingsPanel`:** volumes, mute and colorblind mode, plus HUD scale and `v{version}`.
- **Dialogs:** `ControlsPanel` and `ManaChoice` move into kit `Dialog`s.
- **Emoji (revision):** the hub header and currencies swap emoji for glyphs.

### Contract between the Phase 1 areas

The kit contract above. Every file has one owner:
- **1·0:** `kit/types.ts`, the stub `index.ts` and the `uiStore` field names.
- **1A:** everything else under `kit/` except `prompts.ts`, plus `delve.css`, `format.ts` and `ItemIcon.tsx`.
- **1B:** `prompts.ts`, AppShell, `index.css`, `use-gamepad-nav.ts`, `spatial-nav.ts`, `gamepad-hub.ts`, `arena/input.ts` (the menu key only), `arena/useArenaCore.ts` (`padFrame`'s menu line only, **(revision 2)**) and `uiStore.ts` (values).
- **1C:** `items/` and `ItemDetailSheet.tsx`.
- **1D:** `hub/`, `DelveCamp.tsx`, `ControlsPanel.tsx` and `ManaChoice.tsx`, and fills `kit/index.ts`'s exports.

### E2E in Phase 1

- **Phone projects.** `playwright.config.ts`'s three phone projects add `delve*.spec.ts` to `testIgnore`. The desktop project (1280×800) runs them.
- **Tab ids.** `tab-bag` becomes `tab-loadout` and `tab-abilities` becomes `tab-skills` in `delve.spec.ts`, `delve-runes.spec.ts` and `delve-gamepad.spec.ts`.
- **G03.** Updated to the five tabs.
- **(revision) Emoji.**
  - **D01:** its `scrap-count` "not" assertion becomes real: `toHaveText(/[1-9][\d,]* scrap/)` instead of `not.toHaveText('⚙ 0 scrap')`.
  - **R04:** `scrap-count` reads `'0 scrap'`.
  - **D04:** `mana-strip` contains 'Skills', not 'Abilities'. The strip is the Loadout's attunement line, linking to Skills.
- **(revision 2) More Phase 1 updates.**
  - **D04:** `links-count` becomes glyph text; assert `toHaveText(/\d+ Links?/)`.
  - **G06 and G07:** verify their D-pad paths through the interim hub (the new footer and the `pickNext` fix change what each press reaches), and update the press sequences where they changed.

**Bump:** `chore(client): bump version to 0.54.0`.

## Phase 2: The Anvil hub (v0.55.0)

Each tab becomes its three panes, and the interim column goes.

### Step 2·0 · Unblock the deletions (revision; first, by the integrator)

- Move `AttunementBars` from `AbilitiesPanel.tsx` to `items/AttunementBars.tsx`.
- Swap every old `Chip` (imported from `AbilitiesPanel` by `ChainEditor`, `MoveEditor`, `ManaPanel`, `TrainingPanel` and `DelveLab`) for the kit `Chip`, which takes the same `pressed` prop.
- Move the reactions grid out of `ChainEditor.tsx` to `hub/codex/ReactionsGrid.tsx`, unchanged; `ChainEditor` stops rendering it.
- Until 2C lands the Codex panes, `ReactionsGrid` renders on the Codex tab under `CodexPanel`, which keeps D04's `reaction-unknown` count working.
- **(revision 2)** Add `hub/types.ts`, the shared hub contract below, so every area imports it.
- It merges before 2A–2D start.

### Shared contract (the hub)

```ts
// features/delve/hub/types.ts
export type HubMode = 'anvil' | 'pause';
export type HubTab = 'loadout' | 'skills' | 'forge' | 'codex' | 'quests';
export type HubLink =
  | { tab: 'loadout'; uid?: string }
  | { tab: 'skills'; skill?: ChainSkill; view?: 'mana' }
  | { tab: 'forge'; uid?: string; bench?: 'temper' | 'fuse' }
  | { tab: 'codex'; section?: 'legendaries' | 'reactions' | 'records' }
  | { tab: 'quests'; questId?: string };

export interface HubTabProps {
  /** 'pause': read-only. Item actions become notes, and dive finds carry NEW. The engine's own locks (isDiveActive) still apply. */
  mode: HubMode;
  /** The tab's prompts. The hub draws them in its Footer and passes them to usePrompts. (revision) */
  setPrompts: (prompts: Prompt[]) => void;
  /** Replaces the footer's right-hand group while set (Skills: the Apply bar and a compact Delve button); null restores Training / start / Delve. */
  setFooterAction: (node: ReactNode | null) => void;
  go: (to: HubLink) => void;
  link?: HubLink;
}
export function LoadoutTab(props: HubTabProps): ReactElement;
export function SkillsTab(props: HubTabProps): ReactElement;
export function ForgeTab(props: HubTabProps): ReactElement;
export function CodexTab(props: HubTabProps): ReactElement;
export function QuestsTab(props: HubTabProps): ReactElement;
```

**Layout.** The hub's `main` is a grid with 24 px padding top and bottom, 32 px at the sides and a 24 px gap. Each tab sets its own `grid-template-columns`:
- Loadout: `430px minmax(0,1fr) 470px`
- Skills: `340px minmax(0,1fr) 500px`
- Forge: `430px minmax(0,1fr) 470px`
- Codex: `340px minmax(0,1fr) 470px`
- Quests: `400px minmax(0,1fr) 440px`

**Scrolling.** Panes scroll inside themselves; the screen never does. **(revision, accepted)** At the 0.75 floor (a 1707×960 design canvas), the Loadout's moveset box and the Skills inspector scroll a little inside their panes.

### Areas (all parallel; the integrator only wires `AnvilHub`)

One owner per file:
- **2A:** `hub/loadout/`, `ItemTile.tsx`, and deleting `BagPanel.tsx`, `PaperDoll.tsx` and `BindPrompt.tsx`.
- **2B:** `hub/skills/`, `chains/`, `ManaPanel.tsx`, `runes/SocketRow.tsx`, `runes/RunePicker.tsx`, `delveStore.ts` (`applyLabel`), deleting `AbilitiesPanel.tsx`, and the engine's `hero-stats.ts`.
- **2C:** `hub/forge/`, `hub/codex/`, and deleting `ForgePanel.tsx`, `CodexPanel.tsx` and `runes/RunePouchPanel.tsx`.
- **2D:** `hub/quests/` and `quests/`.

**2A · Loadout.**

*Equipped pane* (`EquippedPane`, `paper-doll`, `slot-<slot>` kept):
- **Paper doll:** an 84 / 200 / 84 grid with three slots on the left (Weapon, Gloves, Ring) and four on the right (Helm, Amulet, Chest, Boots). Each slot is a kit `Tile` with a 14 px slot label.
- **Centre:** the hero `PixelSprite` (scale 10, `context: 'ui'`) on the anvil pedestal glyph, over a stepped cyan glow.
- **Stats:** a two-column table from `profileStats`: Damage, Life, Attack speed, Armor, Mana and Regen.
- **Attunement:** bars for the pair (`AttunementBars`). The block is `mana-strip`, containing "Skills ›"; a click goes to `{ tab: 'skills', view: 'mana' }`.
- **Moveset box:** "Moveset · <weapon>" with "Skills ›" and each skill's slots used of its cap.

*Bag pane* (`bag-panel`, `bag-item`, `equip-best`, `salvage-junk` kept):
- **Header row:** "Bag 22 / 40", filter chips (All, Weapons, Armor, Jewelry, ▲ Upgrades n) and a Sort chip (Power, Rarity, Slot, Newest).
- **Grid:** `repeat(8, minmax(56px, 84px))` with 14 px gaps.
- **Tiles:**
  - ▲, ▼ or ◇ from `compareItem` (as `BagPanel` does today), NEW from `newUids`, and a lock mark
  - selection and equipping follow decided item 36
  - Del salvages; a precious item needs a second press within 2 s, today's sheet rule
  - L locks
- **Footer row:** "▲ Equip best (n)" (kit `go`), "Salvage junk (n)", and "Auto-salvage up to" as a chip that opens a `Segmented` of rarities, replacing the five rings.

*Compare pane* (`item-sheet` kept on the pane):
- **Header:** "Hovered · compared with your <slot>", then `ItemHeader`.
- **Delta:** `PowerDelta` (`item-compare`).
- **Table:** `CompareTable`.
- **Attunement line:** the attunement delta (`attune-delta`).
- **Bind choice:** an off-pair item shows today's `BindPrompt` content inline (`bind-prompt*` ids kept).
- **Transfer:** a weapon's "Transfer moveset" (`transfer-*`).
- **Actions:** buttons with bindings: Equip (`equip-button`) and Salvage (`salvage-button`), each with its gain, then Lock.
- **Forge link:** "Forge it ›" opens `{ tab: 'forge', uid }`.
- **Empty states:** with nothing hovered, the pane shows the worn weapon. On a first save it shows the how-to.

*Prompts:* Select, Equip, Full compare (hold Shift / LT: the pane shows every stat and the moveset), Salvage, and Menu.

*Tooltip:* `ItemTooltip` on equipped tiles. A bag tile needs none, because the compare pane is its tooltip.

**2B · Skills.**

*Split:* `ChainEditor.tsx` into `useChainEditor(props: ChainEditorProps)`, which keeps today's props unchanged, and presentational pieces. `ChainEditor` itself stays, as the one-column composition the Training dock and the stop use.

*Skill list* (`SkillList`, a `level="sub"` `Tabs`, `chain-skill-<s>` kept): keys `[` / `]`, pad LT / RT **(revision)**.
- **Rows:** four plate buttons (Basic, Primary, Defensive, Ultimate), each with:
  - the glyph of its bound key or pad button (from `controlsStore`)
  - its payment
  - five slot dots
  - its summary line (`abilities-summary`)
- **Mana pair box:** "Fire · 6", "Storm · 8", the overtake line and the reaction. "Realign ›" swaps the right pane to the Mana view (today's `ManaPanel`, `mana-view` and its ids kept); Esc / B returns. **(revision 2)** The Mana view is its own `data-pad-scope` with a Back (decided item 39).

*Chain lane* (`ChainLane`, `chain-cards`):
- **Header:** "Primary", then "4 of 5 slots · pays mana · each press casts the next move".
- **Move cards** (`move-<i>`): each shows "Move n" and its kind, the element tile and form glyph, the element (the fusion name for two), the socket pips (`socket-<i>`, `socket-open`) and the cost.
- **Reorder toolbar:** the selected card shows the visible toolbar from decided item 37.
- **"+ Slot"** (`add-slot`, `move-add`): its price as a `Price`.
- **Reorder:** follows decided item 37. The drag converts pointer deltas with `layerZoom`.
- **Basic chain:** the lane shows its blows (kind and element) and no stats tiles or rhythm strip.

*Chain stats* (`ChainStats`, from `chainCycle` and `manaSupport`; abilities only): four tiles:
- chain damage per full cycle
- cycle seconds ("casts plus beats")
- mana per cycle
- mana support "spend / refill" (`mana-support`), amber when the spend outruns the refill

*Rhythm strip* (`RhythmStrip`; abilities only) **(revision)**:
- one block per step, its width from `steps[i].cast` and its colour from the step's first element
- a hold step hatched
- an echo step followed by a ghost block a quarter of its width
- one line per beat, from `steps[i].beat`
- the restart pause at the end, labelled "pause n s restarts"

*Inspector* (`MoveInspector`, `ability-readout`):
- **Title:** "Move n · <name>", with "edited" while drafted.
- **Segments:** Kind (Light, Medium, Heavy, Hold), Form (a 5-column grid; `form-<id>`), Elements (the pair, then the fusion; off-pair marked).
- **Sockets:** "n of m", each a row with the rune glyph, name, effect and "+x% cost" (`rune-ease`). A click on a row opens `RunePicker variant="inline"` in place of the numbers, as its own `data-pad-scope` **(revision)**. Its ids are kept: `rune-picker`, `rune-picker-close` on its Back, `rune-current`, `rune-pull`, `rune-tier-<t>` and `rune-pick-<id>`.
- **Numbers:** Hit, the radius, Cost and Beat after, from `moveNumbers` and `moveBeat`.
- **Ease line:** "Attunement eases rune cost by n%".
- **Warnings:** `cost-warning`.
- **Basic chain:** its blows show Kind and Element only.

*Apply bar* **(revision)**, through `setFooterAction` (`chain-draft`), always shown on Skills:
- "n unapplied changes · price" (`chain-price`, a `Price`)
- Revert (`chain-revert`)
- Apply (`chain-apply`, Ctrl+Enter / hold Y; `chain-apply-why` when refused)
- then a compact Delve button (`delve-button`, `data-pad-menu`), disabled while changes are unapplied, as the draft block is today
- With nothing unapplied, the group shows "No changes", disabled.
- Training and the start chips show on the other tabs only.
- **(revision 2)** In `mode: 'pause'`, `SkillsTab` sets no footer action, so the pause's own footer stays.

*`applyLabel`* (`delveStore.ts`) **(revision)**: the label text has no emoji, e.g. "Apply · 5 Mana Dust · 1 Link · 20 scrap"; the bar draws it with `Price`.

*`RunePicker`* **(revision)**: gains `variant: 'sheet' | 'inline'`. The sheet stays the default for `TrainingPanel` and `StopPanel` until 3b.

*Engine* **(revision)**: in `packages/engine/src/delve/hero-stats.ts`, with tests in `packages/engine/tests/`:

```ts
/** The expected hit before a move's power: weapon damage × damage multiplier × the crit factor. Extracted from estimateCombat, which then calls it. */
export function expectedHit(stats: HeroStats): number;

export interface ChainCycle {
  /** One full cycle's damage: damagePerUse(chain, expectedHit(stats), stats, bal) × moves. */
  damage: number;
  /** One full cycle's seconds: useInterval(bal, chain, stats.tempo, Infinity, Infinity) × moves. */
  seconds: number;
  /** Mana spent in one cycle: Σ valuedMove(chain, i).cost for a mana chain; 0 for charge and cast. */
  mana: number;
  /** Each move as valued (a hold at full charge). */
  steps: {
    /** Its conjure or cast time; a hold's max(holdFull(bal, tempo), castTime). */
    cast: number;
    /** moveBeat(bal, ab, stats.tempo). */
    beat: number;
    kind: MoveKind;
    elements: ManaType[];
    hold: boolean;
    /** Its runes repeat it (knobs.echo > 0). */
    echo: boolean;
  }[];
  /** bal.abilities.comboWindow: the pause after the last beat that starts the chain over. */
  restart: number;
}
/** An ability chain only (the basic chain is excluded). `chain` is the resolved draft: resolveChain(registry, stats, slot, draft), as the builder already makes. */
export function chainCycle(registry: DataRegistry, stats: HeroStats, chain: ResolvedChain): ChainCycle;
```

Rebuild the engine (`pnpm -F @alloy/engine build`). `estimateCombat`'s numbers are unchanged; its existing tests and `tests/delve-pacing.test.ts` confirm that.

**2C · Forge and Codex.**
- **Forge:**
  - **`GearList`:** equipped items first, then the bag, with filter chips (`temper-row`).
  - **`Bench`**, with `level="sub"` Tabs of Temper and Fuse:
    - **Temper** works the selected item: Upgrade +1 (`upgrade-button`, `upgradeCost`), Reforge (pick an affix line, then `reforgeAffix`, `reforgeCost`) and Re-attune (element chips, `reattune-<m>`, `reattuneCost`). Each shows its `Price` against the wallet. **(revision 2)** Reforge's affix pick is its own `data-pad-scope` with a Back (decided item 39).
    - **Fuse** is today's Alloy Fusion (`fusion-result`, `fuse-button`).
  - **`RunePane`:** today's pouch (`rune-pouch`, `pouch-<key>`, `rune-fuse-<key>`), with a visible "Fuse 3 → 1" button per row.
  - **Ids:** `forge-panel` stays on the tab root.
- **Codex:**
  - **`CodexSections`** (`level="sub"`): Legendaries n/12, Reactions n/15 and Records.
  - **`CodexGrid`:** the section's cards (`codex-unknown`; `ReactionsGrid`'s `reaction-unknown`).
  - **`CodexDetail`:** the hovered or focused entry.
  - **Records:** the lifetime stats.
  - **Ids:** `codex-panel` stays.
- **Emoji (revision):** the Forge and Codex swap theirs for glyphs.

**2D · Quests (placeholder) and the quest view.**

```ts
// features/delve/quests/types.ts — the view a future engine fills; nothing here is a rule.
export type QuestKind = 'main' | 'side' | 'bounty';
export interface QuestObjective { id: string; text: string; hint?: string; done: boolean; progress?: { value: number; max: number } }
export interface QuestReward { id: string; name: string; sub?: string; color: string }
export interface QuestView {
  id: string; kind: QuestKind; name: string; sub: string;
  chapter?: string; story?: string;
  giver?: string;
  objectives: QuestObjective[]; rewards: QuestReward[]; tracked: boolean;
}
export const MAX_TRACKED = 3;
/** v1: no quests. With localStorage `alloy:delve:questPreview` = "1", the fixture in sample.ts (tracking is local state). */
export function useQuests(): { quests: QuestView[]; setTracked: (id: string, on: boolean) => void };
```

**The tab:**
- **Journal** (`quest-journal`): grouped Main / Side / Bounties.
- **Detail:** the giver `PixelSprite` (scale 4, `context: 'ui'`), kind, chapter, name and story, then the objectives.
- **Rewards**, and "Tracked on the HUD" (G / Y) **(revision)**.
- **Empty state** (`quests-empty`), with no quests: "Quests arrive in a later update. The journal and the HUD tracker are ready for them." It keeps the three panes, drawn as dashed placeholders.

**`QuestTracker`** (for Phase 3), props `{ quests: QuestView[] }`:
- **Contents:** the tracked quests, up to three, each with its kind tag (14 px), name and objectives.
- **Header:** "Quests" with the J / View "Journal" hint.
- **No quests tracked:** it renders `null`.

**Tests:** the tab's empty state and its preview render; the tracker shows up to three.

### Integration and E2E in Phase 2

The integrator wires the five tabs and deletes the interim column. The integrator also updates the specs the rebuild changes:
- **`delve.spec.ts`:** D02 (equip at the Anvil through the compare pane), D04 (the tabs render; `reaction-unknown` on the Codex tab) and D08.
- **`delve-runes.spec.ts`** **(revision)**:
  - R01: socket in the inspector; `chain-apply` contains '1 Link' and '20 scrap'
  - R04: fuse on the Rune pane
  - R05 and R06
- **`delve-gamepad.spec.ts`:**
  - G03
  - G06: pick a skill with LT/RT, a move and its kind
  - G07: socket through the inline picker; B backs out of the picker's scope

**Unit tests:** `AbilitiesPanel.test.tsx`, `ManaPanel.test.tsx`, `RunePicker.test.tsx` and `chains/__tests__/rune-costs.test.tsx` move to the new panes, with the same assertions where the behaviour is unchanged.

**Bump:** `chore(client): bump version to 0.55.0`.

## Phase 3: The dive

### 3a · The HUD, the map and the zoom (v0.56.0)

#### The HUD grid

`HudGrid` is a `.delve-ui.delve-hud-zoom` root, a sibling of the arena host inside the unzoomed page root (decided item 31):
- **Frame:** `position: absolute; inset: 24px`, `grid-template-columns: 380px minmax(0,1fr) 340px`, `grid-template-rows: 48px minmax(0,1fr)` and a 16 px gap.
- **Top bar:** columns 1–2, row 1.
- **Right column:** column 3, rows 1–2.
- **Dock:** columns 1–2, row 2, `align-self: end`, 600 px wide.
- **Pointer events:** the grid has `pointer-events: none`, and only its panels and slots take them.

**Insets** **(revision)**. `HudGrid` reports the camera's insets in viewport px from `getBoundingClientRect`, on mount, on a `ResizeObserver` firing, on window resize and on a `hudScale` change:
- `top` = the top bar's bottom edge
- `right` = window width minus the right column's left edge
- `bottom` = window height minus the life bar's top edge
- `left` = 0

#### Purse bar (`PurseBar`, glass)

**Contents, left to right:**
- **"Purse"**, then each resource as a `Price`-style glyph with the amount held and this dive's gain:
  - Scrap: `profile.scrap`, with `dive.bounty` in amber
  - Links: `+dive.linksEarned`
  - Mana Dust: `+dive.dustEarned`
  - Runes: `pouchCount`, `+dive.runesEarned`
  - Items: bag n / cap, `+diveDrops.length`
- **"+N banks on extract"** (`bounty` kept).
- **At the right end** **(revision)**:
  - **Labels** (Alt / hold LS).
  - **Journal** (J / View, `data-pad-journal`; it opens nothing until 3b).
  - **Menu** (Esc / Menu, `data-pad-menu`, accessible name "Dive menu"). Clicking it opens the menu and never toggles it closed.

#### Skill dock (`SkillDock`, `skill-bar` kept)

`text-shadow: 2px 2px 0 #181425`; no box of its own.

**Skill rows.** Each of Q, E and R (`ability-<slot>` on the slot) is a 76 px steel slot in its element's border:
- **The slot:**
  - the move's form glyph
  - the bound glyph (`sm`) at the bottom-right corner (−14, −10)
  - rune dots
  - a cooldown fill rising from the bottom with its seconds, shown also for a beat but without the seconds
  - a hold's charge as a tick bar
  - Galvanize's spark only **(revision)**
  - `floatPay`'s spend, which floats from the slot
- **Beside the slot:** the name (22 px), the chain-step bar (16×5 segments) and the cost line, amber when unaffordable.
- **Click:** casts the slot auto-aimed.
- **Tooltip** (`SkillTooltip`, `TooltipCard material="glass"`, inline, `portal={false}`): beside the row (left 380, 320 wide) on hover, on pad focus, or while the slot's own button is held. It shows the move's name, "move n of m · kind", Hit, Cost with the runes' load, Beat after, and the runes, all from `moveNumbers` and `moveBeat` on the hero's resolved chain.

**Row 2.** 56 px slots:
- Dodge (`dodge-button`), with charge pips and its refill
- Potion ×n (`potion-button`)
- Attack (`attack-button`) **(revision)**: shown in both modes; in Auto it reads "Auto", dimmed, with `data-mode="auto"`; a click is an attack tap in Manual

Then the buff row (`BuffRow`): 38 px tiles, each with its glyph and its seconds left in 14 px Jersey 10, one per `HudBuff` (Riposte, Quick, Barrier) **(revision)**.

**Bars** (`Vitals`):
- **Life** (`hero-hp`): 32 px, green planks, with the barrier as a pale segment (`hp-barrier`) and the label "226 / 289 · barrier 34".
- **Mana** (`mana-bar`): 24 px, cyan with the stepped mana glow, and the label "74 / 102".

**Deletes from `ArenaHud.tsx`:** `TopHud`, `SkillBar`, `AbilityButton`'s pointer logic, `AttackButton`, `DodgeButton`, `ChainDots`, `HoldBar` and `RunePips`, and `keyHints` / `padHints`. `floatPay` and `BossBar` move to `arena/hud/`.

**Emoji (revision):** the HUD swaps its emoji for glyphs.

#### Right column (`FloorColumn`)

**Floor panel (glass):**
- **Header:** "Depth N" (`depth-label`) and the biome name.
- **Minimap:** 150 px tall, full width.
- **Resists and weakness:** two tiles (`biome-element`).
- **Counts:** "n foes left" (`monsters-left`) and the bounty.

**`Minimap`** **(revision)**:
- **Backing store:** its zoomed `getBoundingClientRect` × `devicePixelRatio`, re-measured on resize and on a `hudScale` change.
- **Fit:** the arena fitted at `floor(min(w/W, h/H))` device px per unit and centred.
- **Drawn:**
  - the arena border
  - `terrain` cells, when `HudMap` ever carries them (none today)
  - the camera's `view`
  - drops (rarity colour)
  - foes (elites and the boss bigger)
  - the hero
- **Redraw:** whenever `hud.map` changes.

**Quests:** `QuestTracker` (null in v1).

**Found this floor** (`FoundLog`, `pickup-feed` kept on it):
- **Rows:** each pickup since `floorDropsFrom` and `floorRunesFrom` **(revision)**, newest first: a rarity swatch, the name in `RARITY_TEXT`, and ▲ / ▼ / ◇ or "rune".
- **Overflow:** up to as many as fit, then "+n more".
- **Hover:** shows `ItemTooltip` (inline, `portal={false}`).
- **Click:** in 3a, opens the existing `ItemDetailSheet`; in 3b, opens the pause on Loadout with the item. Each item row carries `loot-item`, and `upgrades-locked`, `upgrades-potential` and `feed-rune` are kept.

#### Arena core and renderer (`useArenaCore.ts`, `ArenaRenderer.ts`, `camera.ts`)

```ts
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface HudMap {
  width: number; height: number;
  view: ViewRect;
  hero: { x: number; y: number };
  foes: { x: number; y: number; rank: 'normal' | 'elite' | 'boss' }[];
  drops: { x: number; y: number; color: string }[];
  /** Blocked cells, if the engine ever adds terrain; [] today. (revision) */
  terrain: { x: number; y: number; w: number; h: number }[];
}
/** (revision) No galvanize: its spark is on the slots. */
export interface HudBuff {
  id: 'riposte' | 'quick' | 'barrier';
  /** Seconds left, from riposteUntil, quickUntil and barrier.until. */
  left: number;
  total: number | null;
}
// (revision) snapshot(world: ArpgWorld, renderer: { viewRect(): ViewRect } | null): ArenaHud
// ArenaHud gains: buffs: HudBuff[]; map: HudMap (map.view is the arena when renderer is null)
// ArenaRenderer: setInsets(insets: Insets); viewRect(): ViewRect; setLabelsHeld(held: boolean);
//                setUpgradeTest(isUpgrade: (item: GearItem) => boolean)
// useArena / useTrainingArena / useArenaCore options: insets: Insets   (revision: 3C owns all three)
```

**Inputs** **(revision)**.
- **New actions.** `labels` (AltLeft / LS, a hold) and `journal` (J / View, a press) join `CONTROL_ACTIONS`, with the default dedupe of decided item 23.
- **Labels.** `attachKeyboard` prevents Alt's default and releases the hold on `keyup` and on window `blur`. `padToArena` reports LS held. Both call `renderer.setLabelsHeld`.
- **Journal.** It clicks `scopedLast('[data-pad-journal]')`.
- **Menu.** The menu key and the pad's Menu click `scopedLast('[data-pad-menu]')`, only while live.

**Loot plaques.** These follow decided item 22. `isUpgrade` is `compareItem(...).powerPct > UPGRADE_EPSILON`, computed once when the drop's view is made.

**Reduced motion.** `shake` and `kick` stay 0.

**Touch and aim** **(revision)**:
- The joystick branch and the "Drag to move" hint leave `ArenaControls.tsx`.
- `aim-gestures.ts` becomes `aim.ts` per decided item 8, with its importers and tests updated.

**Canvas host.** `useArenaCore` checks `hasZoomedAncestor(host)` in dev builds **(revision)**.

#### The zoom (decided in the spec; revision)

**Today.**
- The rule is `unit = max(16, min(width / 13.5, playH / 15))` px per arena unit, where `playH` is the window height less the HUD's top and bottom insets.
- At 1920×1080 with today's insets (70, 190), `unit` is 54.7. That is 5.47 screen px per sprite pixel (`SPRITE_PIXEL` = 0.1), with 19.7 units visible top to bottom.
- That scale isn't whole, so sprite pixels render 5 or 6 px wide.
- The view depends on the HUD's pixel insets, so it differs by resolution: 23.5 units at 720p, 18.3 at 1440p.

**v1** (`features/delve/arena/camera.ts`, the user's choice of 4 px at 1080p):

```ts
/** Arena units of window height the dive aims to show: 27 is the user's 1080p choice (4 px per sprite pixel). View distance sets 20–30. */
export const ARENA_VIEW_UNITS = 27;
/**
 * Render pixels per sprite pixel: the whole number whose view height (renderH × SPRITE_PIXEL / p units)
 * is nearest `viewUnits`, ties to the larger p, at least 2. `renderH` = screen height × the renderer's resolution.
 */
export function spritePixelScale(renderH: number, viewUnits = ARENA_VIEW_UNITS): number {
  const exact = (renderH * SPRITE_PIXEL) / viewUnits;
  const lo = Math.max(2, Math.floor(exact));
  const hi = Math.max(2, Math.ceil(exact));
  const off = (p: number) => Math.abs((renderH * SPRITE_PIXEL) / p - viewUnits);
  return off(lo) < off(hi) ? lo : hi;
}
```

**How the renderer uses it** **(revision)**:
- **Scale.** `resize()` sets `unit = spritePixelScale(height × resolution, uiStore.arenaViewUnits) / SPRITE_PIXEL / resolution`, from the window height alone.
- **Centre and clamp.**
  - `update()` centres the camera in the clear rectangle that the four insets leave.
  - The edge clamp uses that rectangle's half-width and half-height, not the window's. So in a narrow window, such as 1280×1024 with the right column taking 285 px, the camera still follows sideways when the arena's 26 units are wider than the clear width.
- **Position.** It rounds `root.position` to whole render pixels.
- **Resolution.** It stays `min(2, devicePixelRatio)`. Above a ratio of 2, the browser scales the canvas by ratio ÷ 2, which is whole only at 4. That is accepted, since PC displays above 200% scaling are rare. The scale is still whole in render pixels.

**Results at device-pixel ratio 1:**

| Window | Today: px per sprite px, units tall | v1: px per sprite px, units tall | More floor shown |
|---|---|---|---|
| 1280×720 | 3.07, 23.5 | 3, 24.0 | +2% |
| 1280×800 (Deck) | 3.6, 22.2 | 3, 26.7 | +20% |
| 1280×1024 | 5.1, 20.1 | 4, 25.6 | +27% |
| 1920×1080 | 5.47, 19.7 | **4, 27.0** | +37% (scale −27%) |
| 1920×1200 | 6.27, 19.1 | 5, 24.0 (a tie with 4 → 30.0, to the larger scale) | +26% |
| 2560×1440 | 7.87, 18.3 | 5, 28.8 | +57% |
| 3840×2160 | 12.7, 17.1 | 8, 27.0 | +58% |

At other device-pixel ratios the rule runs in render pixels, so the result stays whole on the device.

**Ripple effects, each handled:**
- **Loot labels.** These are screen-space text sized by `--hud-scale`, not by the zoom, so they stay readable. The wider view brings the default set and Alt-for-all.
- **The minimap's view box.** It draws `viewRect()`, which grows with the zoom.
- **Aim.** `stickAimPoint(…, aimReach)` works in arena units, so the zoom doesn't change it. Mouse aim and hold-to-walk follow the new `unit` through `screenToWorld` and `pixelsPerUnit`.
- **Mouse to world.** Correct automatically. A unit test checks that a point round-trips through `toScreen` and `screenToWorld` at each scale.
- **Off-screen work.** The renderer culls nothing today. The effect layers rasterise only `view`, and `INFUSION_BUDGET` caps the infusion pass.
- **The pixel floor.** The worker's window is clipped to the floor's world, so at 1080p it paints about 37% more rows. Measure its frame time before and after (a busy floor at depth 10). If it passes 8 ms, lighten the off-centre rows before touching the zoom.
- **Tests.** Nothing reads the camera scale today. New: `camera.test.ts` checks `spritePixelScale` against the table above (ties and the minimum included).

**Tunable.** Settings → Display → View distance is a slider from 20 to 30 (`uiStore.arenaViewUnits`, default 27), showing its result, e.g. "4 px per pixel · 27 units tall".

#### Parallel areas in 3a (revision: one owner per file)

| Area | Owns | Codes against |
|---|---|---|
| **3A · HUD dock and top bar** | `arena/hud/HudGrid`, `PurseBar`, `SkillDock`, `SkillSlot`, `SkillTooltip`, `BuffRow`, `Vitals`, `BossBar`; `ArenaHud.tsx`; **`DelveRun.tsx`**; **`DelveTraining.tsx`** (the minimal port: `HudGrid` + `SkillDock`, today's top-bar contents in a glass bar, today's `TrainingPanel` in the right column, under `zoom: calc(1 / var(--hud-scale))` **(revision 2)**); `ArenaHud.test.tsx` | `ArenaHud` with `buffs` (3C) |
| **3B · Right column** | `FloorColumn`, `Minimap`, `FoundLog`, `PickupFeed.tsx` (deleted); `delveStore.ts` (`floorDropsFrom`, `floorRunesFrom`); the `QuestTracker` wiring | `HudMap` (3C), `QuestTracker` (2D) |
| **3C · Arena core and renderer** | `camera.ts`, `aim.ts` (from `aim-gestures.ts`), `ArenaRenderer.ts`, `useArenaCore.ts`, **`useArena.ts`**, **`useTrainingArena.ts`**, `ArenaControls.tsx`, `input.ts`, `fx/draw-world.ts` (the import), `controls.ts`, `arena-pad.ts`, `uiStore` (`arenaViewUnits`), Settings → View distance; their tests (`arena-input.test.ts`, `aim.test.ts`, `arena-hud-snapshot.test.ts`, `arena-renderer.test.ts`, `controls.test.ts`) | `Insets`, `HudMap`, `HudBuff` above |

```ts
export interface HudGridProps {
  top: ReactNode;
  right: ReactNode;
  dock: ReactNode;
  onInsets: (insets: Insets) => void;
  testId?: string;
}
export interface SkillDockProps {
  hud: ArenaHud | null;
  onCast: (slot: 0 | 1 | 2) => void;
  onDodge: () => void;
  onPotion: () => void;
  onAttack: () => void;
  manualAttack: boolean;   // (revision) the Attack slot's mode
}
export interface FloorColumnProps {
  dive: DiveState | null;
  biome: BiomeDef;
  hud: ArenaHud | null;
  quests: QuestView[];
  onInspect: (uid: string) => void;
  onJournal: () => void;
}
```

**Sequencing in 3a (revision 2).**
- 3C deletes `aim-gestures.ts` only after 3A has merged, because `ArenaHud.tsx` (3A's) imports `DRAG_PX`, `classifyPress` and `isOverButton` from it until 3A's rewrite lands.
- The integrator then fixes the `floatPay` import, which moves from `ArenaHud.tsx` to `arena/hud/`, at its callers.

**E2E in 3a** **(revision)**:
- **`delve.spec.ts`:**
  - D01: `depth-label` and `monsters-left` kept; its `bounty` "not" assertion becomes real, `toHaveText(/[1-9]\d*/)`
  - D02: inspect a pickup from the Found log (`loot-item`); 'Dive menu' still names the purse's Menu
  - D05: the `attack-button` assertions become `data-mode` checks, since the slot shows in both modes
  - D06: `skill-bar` within the viewport
  - a new check that the arena host has no zoomed ancestor
- **`delve-runes.spec.ts`:** R02 (rune dots on `ability-0`).
- **`delve-gamepad.spec.ts`:** G02 (the pad glyph's text in `ability-0`) and G04.
- **`delve-training.spec.ts`:** T01's top-bar geometry check, on the 3a glass bar.
- **Unit:** a hold-Alt plaque test in `arena-renderer.test.ts`, including the release on `blur`.

**Bump:** `chore(client): bump version to 0.56.0`.

### 3b · Pause, stop and Training (v0.57.0)

**One owner per file (revision):**
- **3D:** `hub/PauseScreen.tsx`, the pause's header and footer, and `ControlsPanel.tsx` (the attack toggle). It deletes `ItemDetailSheet.tsx`.
- **3E:** **`DelveRun.tsx`** (it wires `PauseScreen`), `stop/`, `StopPanel.tsx`, `RunePicker.tsx` (removing the sheet variant), `DiveSummary.tsx` and `LegendaryFanfare.tsx`. It deletes `DoorChoice.tsx`, `LootTray.tsx` and `.delve-sheet`.
- **3F:** `DelveTraining.tsx`, `TrainingPanel.tsx`, `TrainingBar.tsx` and `MeterView.tsx`.

**Sequencing in 3b (revision 2).** 3F merges before 3E removes `RunePicker`'s sheet variant, because `TrainingPanel` uses the sheet until 3F switches it to `variant="inline"`. If 3E is ready first, it removes the variant as its last commit, after 3F's merge.

**3D · Pause (parallel).**

```ts
// hub/PauseScreen.tsx (3D) — 3E renders it from DelveRun while menuOpen
export interface PauseScreenProps {
  dive: DiveState;
  biome: BiomeDef;
  foesLeft: number;
  link?: HubLink;              // the Found log's item, or { tab: 'quests' } from the journal
  onResume: () => void;
  onAnvil: () => void;         // floor restarts
  onAbandon: () => void;       // lose bounty
}
```

- **Header** (band): "Paused", "Depth N · biome · n foes left", the Tabs (Forge disabled, skipped by LB/RB and the digits, with a tooltip "Forge at the Anvil"), and the note "Gear is locked until you are back at the Anvil".
- **Tabs:** Loadout, Skills, Codex and Quests browse read-only (`mode: 'pause'`):
  - the compare pane's actions become "Locked during the dive" (`equip-locked`)
  - NEW tags on dive finds
  - the chain editor is locked by `isDiveActive`
- **Footer:** Inspect, Full compare and Tabs prompts, then Controls (`open-controls`), Settings, "Anvil · floor restarts", "Abandon · lose bounty" and Resume. Resume is hot metal with Esc / Menu, `data-pad-back`, `data-pad-menu` and `data-pad-first`.
- **Retired:** the kebab menu (`DelveRun.tsx` lines 284–319). "Basic attack: Auto / Manual" moves into `ControlsPanel` (`attack-mode-toggle` kept).
- **Deletes:** `ItemDetailSheet.tsx` and its test.

**3E · Stop and summary (parallel).**
- **What it renders.** `StopScreen` (`door-choice` kept on its root) replaces the `choosing` overlay. A `Screen` with `backdrop="arena-stop"` and **`headerStyle="bare"`** **(revision)**.
- **Header:**
  - the biome label (Silkscreen 14, cyan)
  - "Depth N cleared" (64)
  - on a boss floor, "Boss slain · checkpoint at depth N+1" under it
  - on the right: "n scrap bounty", "n items" and "n runes"
- **Grid:** `380px minmax(0,1fr) 420px`, padding 56 / 72.
- **Left, "Found this floor":** rows from `floorDropsFrom` and `floorRunesFrom`, then "Banked when you leave this stop". It replaces `LootTray`; `loot-item`, `loot-runes` and `loot-rune` are kept.
- **Centre, power-ups** (`stop`, or `stop-taken`):
  - one plate card per offered kind (`stop-<kind>`)
  - taking a card with a choice expands it in place to its picker (`stop-picker`), its own `data-pad-scope` with Back = Esc / B **(revision)**
  - the pickers keep their code: `EquipPick`, `SlotPick`, `MovePick` (the one-column `ChainEditor`), `UpgradePick` and `RunePick` (`RunePicker variant="inline"`; `stop-rune-move-<skill>-<i>` kept)
  - the `createPortal` sheet goes
- **Right, "Choose your path":** each door as a plate button (`door-<id>`) with an 84×96 door frame and its art: the biome's first monster `PixelSprite` (4, `context: 'ui'`), the chest glyph, or the hero for Extract (`extract-button`).
- **Below the doors:** "Life n% · n potions" and "Drink potion" (`door-potion`).
- **Esc / B (revision).**
  - With a picker open, they press its Back.
  - Otherwise there is no back at the stop: Esc and Menu press the stop's `data-pad-menu` (the footer's Menu prompt), which opens `PauseScreen` over the stop. Resume returns to the stop.
- **Footer prompts:** Take, Inspect item, Skip power-up and Menu.
- **Summary.** `DiveSummary` and `LegendaryFanfare` take the kit. Their content and ids are unchanged.
- **Emoji (revision):** the stop and summary swap theirs for glyphs.

**3F · Training Grounds (parallel with 3D and 3E).**
- **Layout.** `DelveTraining.tsx` keeps 3a's `HudGrid` and finishes it:
  - **`top`:** `TrainingBar` (glass), holding:
    - "◂ Anvil" (`training-back`, the only one)
    - `DepthLabel` and `MeterChip`
    - "DPS Lab" (dev)
    - "Panel" (`training-panel-toggle`, carrying `data-pad-journal`, View) **(revision)**
    - "Menu" (Esc / Menu, `data-pad-menu`), which opens the `SystemMenu` with an extra "Anvil" entry **(revision)**
  - **`right`:** the `TrainingPanel` dock at 400 px.
  - **`dock`:** the `SkillDock`.
- **Pad routes (revision).**
  - While the sandbox is live, the arena owns the pad. Its `journal` action (View) clicks `scopedLast('[data-pad-journal]')`, the Panel button, which opens the dock and focuses it.
  - **(revision 2)** Opening the dock with View, which gives it the pad's focus, sets `paused`. Opening the menu also sets `paused`. Then `setArenaLive(false)` hands the pad to the menu layer, as the dive's pause does.
  - **(revision 2)** Opening the panel with the mouse doesn't pause: the fight stays live beside it, as today, so T01 still holds.
  - B, or View again, takes the pad's focus out of the dock and resumes. The dock stays open.
- **The panel:**
  - kit Panel and Tabs (`training-tab-<id>`, level `top`)
  - Abilities keeps the one-column `ChainEditor`, with `RunePicker variant="inline"`
  - `PanelLayout`, `openLayout`, `DOCK_MIN_WIDTH`, the sheet path and `training-panel-exit` go
- **Ids:** `training-panel` and `training-panel-close` are kept.
- **Emoji (revision):** Training swaps its emoji for glyphs.

**E2E in 3b** **(revision)**:
- **`delve.spec.ts`:**
  - D01: pause, then return
  - D02: a `loot-item` click opens the pause; `equip-locked` reads "Locked during the dive"; Abandon's button name is "Abandon · lose bounty"
  - D03: the stop screen
  - D05: `attack-mode-toggle` in Controls, from the pause
  - D07
- **`delve-runes.spec.ts`:** R03 (the stop's rune card expands; `stop-picker`).
- **`delve-gamepad.spec.ts`:**
  - G01: "Menu opens the pause with Resume focused; RB steps its tabs, skipping Forge; B resumes; Menu opens it again, and A on Resume resumes"
  - G05: rebind from the pause's Controls
- **`delve-training.spec.ts`:** T01 and T02, with T01's geometry on `TrainingBar`.

**Unit tests:** `StopPanel.test.tsx`, `LootTray.test.tsx`, `TrainingPanel.test.tsx` and `DiveSummary.test.tsx` follow their components.

**Bump:** `chore(client): bump version to 0.57.0`.

## Phase 4: E2E and docs (v0.57.1)

**4A · The responsive harness at PC sizes (parallel).**
- **Viewports.** `e2e/responsive/viewports.ts` gains `PC_VIEWPORTS`:
  - `hd-720` 1280×720
  - `deck` 1280×800
  - `fhd` 1920×1080
  - `qhd-1440p` 2560×1440
  - `sxga` 1280×1024 (5:4)
  - `ultrawide` 3440×1440
- **The six probes change for the Delve:**
  - **Overflow.** The page never scrolls; panes may.
  - **TabBar.** The probe asserts there is *no* `[data-tabbar]`.
  - **Reachability.** It checks `data-primary-action`: the Delve button, Resume and the first door.
  - **Dead space.** It is skipped over the arena.
  - **Minimum size** **(revision)**. A Delve mode in `min-size.ts` checks text ≥ 10 CSS px (the 14-design-px floor at 0.75 is 10.5) and click targets ≥ 24×24 CSS px.
- **New specs:** `e2e/responsive/specs/delve-anvil.spec.ts`, `delve-dive.spec.ts`, `delve-pause.spec.ts`, `delve-stop.spec.ts` and `delve-training.spec.ts`, each over `PC_VIEWPORTS`.
- **Unchanged:** the classic specs keep `VIEWPORTS`.
- **Gate:** `pnpm --filter @alloy/client run test:responsive` passes with zero Delve failures.
- **Playwright projects:** a `desktop-1080` project (1920×1080) runs the Delve e2e alongside `desktop` (1280×800).

**4B · Docs and the DPS Lab (parallel).**
- **DPS Lab.** `DelveLab.tsx` takes the kit `Screen`, a band header with kit `Tabs` (`lab-tab-<v>`) and "◂ Training" (`lab-back`), kit `Chip`s and `Panel`s. Its native selects and the chart stay. R07 is unchanged.
- **`CLAUDE.md`, the Delve section.** Rewrite these:
  - the client paragraph: hub tabs and panes, the pause, the stop, the HUD grid, the kit and its zoom classes, the prompt runtime and input map, `--ui-scale`, and `ARENA_VIEW_UNITS`
  - the Training Grounds paragraph: the dock
  - the controller paragraph: X, Y, View, LS, LT/RT sub-tabs, `data-pad-first`, `data-pad-skip`, `data-pad-journal` and the scoped lookups
- **Memory notes.** `project_responsive_system.md` and `project_responsive_testing.md` note the Delve's design px under `--ui-scale` and the PC viewport list.

**Bump:** `chore(client): bump version to 0.57.1`.

## Accessibility

**Contrast** (WCAG 2.1, computed for this spec; **(revision)** raised steel and `#d7a6e8` added):

| Text | on steel `#262b44` | on a well `#181425` | on raised steel `#3a4466` | Rule |
|---|---|---|---|---|
| `#ffffff` | 13.89 | 18.02 | 9.55 | body; text on chips and segments |
| `#c0cbdc` (common) | 8.48 | 11.00 | 5.83 | secondary |
| `#8b9bb4` | 4.93 | 6.39 | **3.39** | captions; never on `#3a4466` |
| `#fee761` (rare) | 11.13 | 14.43 | 7.65 | active tab, headings |
| `#feae34` | 7.49 | 9.71 | 5.15 | amber warnings |
| `#2ce8f5` | 9.24 | 11.98 | 6.35 | mana values |
| `#63c74d` (uncommon) | 6.49 | 8.41 | **4.46** | gains; on `#3a4466` only at ≥ 22 px display, else a swatch |
| `#f6757a` (loss text) | 5.12 | 6.64 | **3.52** | loss text; never on `#3a4466` |
| `#d7a6e8` (epic text) | 6.95 | 9.02 | 4.78 | `RARITY_TEXT.epic` |
| `#0099db` (magic) | **4.35** | 5.64 | **2.99** | magic text on wells, or ≥ 22 px display on steel; never on `#3a4466` |
| `#f77622` (legendary) | 5.01 | 6.49 | **3.44** | never as text on `#3a4466` |
| `#ead4aa` (wood text) | 9.59 | 12.44 | 6.59 | also 5.85 on `#733e39` and 7.26 on `#5c3434` |
| `#e8b796` (Dust) | 7.70 | 9.99 | 5.30 | |
| `#b55088` (epic border) | **2.96** | 3.83 | n/a | borders and swatches only (non-text needs 3:1, met on wells) |
| `#e43b44` (loss glyph) | **3.31** | 4.30 **(revision 2)** | n/a | ▼ glyphs only (non-text, 3:1, met on both); never text on either ground |

**Buttons and glyphs:**

| Pairing | Ratio |
|---|---|
| `#3e2731` on `#feae34` (hot metal) | 7.35 |
| `#193c3e` on `#63c74d` (go) | 5.58 |
| `#f6757a` on `#3e2731` (danger) | 5.03 |
| pad ink `#181425` on A | 8.41 |
| pad ink `#181425` on B | 4.30 |
| pad ink `#181425` on X | 5.64 |
| pad ink `#181425` on Y | 14.43 |
| pad ink `#181425` on neutral | 11.00 |
| `#ffffff` keycap text on `#3a4466` | 9.55 |

`#5a6988` on steel (2.52) marks the disabled state only, which is exempt.

**Fixes the table drives:**
- `Segmented` tints an element's label only with a passing colour on `#3a4466`; Frost, Shadow and Nature labels get a swatch.
- The bag's Upgrades chip shows ▲ in a well, not green text on raised steel.

**Other rules:**
- **Focus.** One visible ring for keys and pad. Every hub control is reachable by Tab and by the D-pad. Tooltips open on focus as well as hover.
- **Motion.** Reduced motion follows decided item 14. The existing global `animation-duration: 0s` covers CSS animations, and kit WAAPI animations check the media query.
- **Text size (revision).** Nothing is under 14 design px, which is 10.5 CSS px at the 0.75 floor. That includes Silkscreen labels, glyph text, buff timers and NEW tags. The HUD's effective scale never drops below 0.75.

## Departures from the mockups (revision)

- **Small text.** The mockups' Silkscreen labels at 11 px, buff text at 12, NEW tags at 9 and key glyphs at 26–30 px tall become 14 px text, with `sm` / `md` glyphs at 28 / 32 px (decided item 33).
- **Epic text** is `#d7a6e8`, not `#b55088` (decided item 13).
- **Tooltips.** The UI kit board's tooltip is a plate, and the HUD's skill tooltip is glass: `TooltipCard`'s `material` prop.
- **Stop.** The mockup's header is bare text over the arena (no band); this spec keeps that with `headerStyle="bare"`. Its footer takes the planks, as the theme's `footer` rule did.
- **Quests.** The mockup's footer has no Delve group; the hub keeps it on every tab except Skills, which has the compact Delve button beside the Apply bar.
- **Skills currencies.** The Skills and Quests mockups show the currencies without glyphs; the hub uses the Loadout board's version, with glyphs.
- **Skills prompts.** RS "Next skill" becomes LT/RT and `[` / `]`, and "Tab" is focus traversal (decided item 15 and the key clashes).
- **Minimap.** The mockup's rooms and corridors were placeholders: the minimap draws the arena rectangle (decided item 4).
- **Buffs.** The mockup's three buff tiles include Galvanize-like timing; Galvanize is the slot spark only (decided item 35).

## Constraints kept

- **Engine split.** The engine owns rules and numbers, and the UI re-presents engine values: `resolveChain`, `moveNumbers`, `moveBeat`, `compareItem`, `itemStatLines`, `profileStats`, `heroPower`, `draftPrice`, `manaSupport`, `chainCycle` and the price functions.
- **Renderer.** Pixi stays the arena renderer; the HUD is DOM over it, reports its insets, and the canvas host is never zoomed.
- **The input lock.** `inputDeviceStore`, `claimDevices`, one pad reader with one owner per press (`setArenaLive` in a layout effect, read through `isArenaLive()`), and focus never dropping under the pad (`keepFocus`).
  - Every new screen, overlay and inline picker is a `data-pad-scope` with a pad-reachable first focus.
  - Every one keeps the focus when its content unmounts.
- **The pad markers** keep their meaning: `data-pad-scope`, `data-pad-back`, `data-pad-tabs` and `data-pad-menu`. The new ones are `data-pad-tabs="sub"`, `data-pad-first`, `data-pad-skip` and `data-pad-journal`. Every lookup is scoped to the topmost scope.
- **The locked Draft screen and the classic Arena** are untouched.
- **Saves.** Persisted saves keep their shape. The new keys are `uiStore`'s `alloy:delve:hudScale` and `alloy:delve:viewUnits`, plus `ControlsConfig`'s two new actions (decided item 23).

## Every phase's gate

Before each release:
- `pnpm -F @alloy/engine build` (only Phase 2 changes the engine; also `pnpm -F @alloy/engine test`)
- `pnpm -F @alloy/client build` (it typechecks) and `test`
- the Delve e2e on `desktop` (and on `desktop-1080` from Phase 4)
- a manual pass at 1280×720, 1920×1080 and 2560×1440 with mouse and keys, then with a pad
- the version bump with its `chore(client)` commit

Phase 2 also runs `tests/delve-pacing.test.ts`.

## Appendix A: forge theme CSS (from the mockups' helmet)

Copied verbatim from `Main.dc.html` and `Arena-HUD.dc.html`, the source for `kit.css`. Selectors are the mockups' own. Port the values, not the `!important` or the attribute-selector hooks. **(revision)** Font sizes under 14 px here are superseded by decided item 33.

```css
.disp{font-family:'Jersey 10',sans-serif;font-size-adjust:.56;letter-spacing:.05em;text-transform:uppercase;text-shadow:2px 2px 0 #181425}
.lbl{font-family:'Silkscreen',monospace;font-size:11px;letter-spacing:.06em;color:#8b9bb4}
*{border-radius:0}
html,body{-webkit-font-smoothing:none;font-smooth:never}
svg{shape-rendering:crispEdges}
/* the wall (screen background) */
background: radial-gradient(ellipse at 50% 115%, rgba(247,118,34,.20) 0 28%, rgba(247,118,34,.10) 28% 44%, transparent 44%),
  repeating-linear-gradient(90deg, rgba(24,20,37,.35) 0 3px, transparent 3px 190px),
  repeating-linear-gradient(0deg, #2d1e24 0 52px, #22161b 52px 56px, #33222a 56px 108px, #22161b 108px 112px);
/* plate: wood frame, riveted steel */
.panel{background:linear-gradient(#8b9bb4,#8b9bb4) 10px 10px/4px 4px no-repeat,linear-gradient(#8b9bb4,#8b9bb4) calc(100% - 14px) 10px/4px 4px no-repeat,linear-gradient(#8b9bb4,#8b9bb4) 10px calc(100% - 14px)/4px 4px no-repeat,linear-gradient(#8b9bb4,#8b9bb4) calc(100% - 14px) calc(100% - 14px)/4px 4px no-repeat,repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 2px,transparent 2px 6px),#262b44;border:6px solid #733e39;box-shadow:0 0 0 3px #181425,inset 0 0 0 2px #3e2731,inset 0 3px 0 2px #5a6988,6px 6px 0 3px rgba(24,20,37,.6)}
/* glass: HUD steel */
.glass{background:linear-gradient(#5a6988,#5a6988) 10px 10px/4px 4px no-repeat,linear-gradient(#5a6988,#5a6988) calc(100% - 14px) 10px/4px 4px no-repeat,linear-gradient(#5a6988,#5a6988) 10px calc(100% - 14px)/4px 4px no-repeat,linear-gradient(#5a6988,#5a6988) calc(100% - 14px) calc(100% - 14px)/4px 4px no-repeat,rgba(38,43,68,.94);border:4px solid #3a4466;box-shadow:0 0 0 2px #181425,inset 0 2px 0 #5a6988}
/* header band with the mana line */
header{background:repeating-linear-gradient(90deg,transparent 0 58px,#8b9bb4 58px 62px,transparent 62px 120px) 0 8px/100% 4px no-repeat,repeating-linear-gradient(90deg,transparent 0 58px,#181425 58px 62px,transparent 62px 120px) 0 calc(100% - 12px)/100% 4px no-repeat,#3a4466;border-bottom:4px solid #181425;box-shadow:inset 0 3px 0 #5a6988,0 4px 0 #0099db,0 8px 0 rgba(44,232,245,.28)}
/* footer planks */
footer{background:repeating-linear-gradient(0deg,#5c3434 0 22px,#4a2a2e 22px 24px),#733e39;border-top:4px solid #181425;box-shadow:inset 0 3px 0 #b86f50}
/* hot metal (primary) */
.hot{background:#feae34;color:#3e2731;border:3px solid #181425;box-shadow:inset 0 3px 0 #fee761,inset 0 -4px 0 #f77622,0 0 0 3px rgba(247,118,34,.55),0 0 0 8px rgba(247,118,34,.18)}
/* wood plank (secondary) */
.plank{background:repeating-linear-gradient(0deg,#733e39 0 10px,#6a3934 10px 12px);color:#ead4aa;border:3px solid #181425;box-shadow:inset 0 3px 0 #b86f50,inset 0 -3px 0 #3e2731}
/* green (Equip best) */
.go{background:#63c74d;color:#193c3e;border:3px solid #181425;box-shadow:inset 0 3px 0 #a8e090,inset 0 -4px 0 #3e8948}
/* danger */
.danger{background:#3e2731;color:#f6757a;border:3px solid #a22633}
/* tabs */
.tab{font-family:'Jersey 10',sans-serif;font-size:24px;color:#8b9bb4}
.tab.on{color:#fee761;border-bottom:4px solid #feae34;text-shadow:2px 2px 0 #181425,0 3px 0 #f77622}
/* socket (item tile, 84 px) */
.tile{border:3px solid <rarity>;background:#181425;box-shadow:inset 0 0 0 3px #262b44,inset 0 0 0 5px #3a4466,3px 3px 0 #181425}
/* segmented and chips */
.seg{font-family:'Silkscreen',monospace;font-size:11px;background:#3a4466;border:2px solid #5a6988;color:#fff}
.seg.on,.chip.on{background:#feae34;border-color:#fee761;color:#3e2731;box-shadow:0 0 0 3px rgba(247,118,34,.45)}
.chip{font-family:'Pixelify Sans',sans-serif;background:#3a4466;border:2px solid #5a6988;color:#fff}
/* sockets (rune) and mana glow */
.sock{border-width:3px;box-shadow:0 0 0 3px rgba(44,232,245,.2),inset 0 0 0 2px rgba(44,232,245,.25)}
.managlow{box-shadow:0 0 0 3px #181425,0 0 0 6px #0099db,0 0 0 10px rgba(44,232,245,.22),0 0 0 14px rgba(44,232,245,.08)}
.lifeframe{box-shadow:0 0 0 3px #181425,0 0 0 6px #5a6988,0 0 0 9px #181425}
/* glyphs */
.key{min-width:30px;height:30px;padding:0 8px;background:#3a4466;border:2px solid #8b9bb4;border-bottom-width:4px;color:#fff;font:11px 'Silkscreen',monospace;box-shadow:inset 0 2px 0 #8b9bb4}
.pad{min-width:30px;height:30px;padding:0 8px;clip-path:polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%);font:11px 'Silkscreen',monospace;color:#181425}
/* HUD */
.slot{width:76px;height:76px;background:#262b44;border:4px solid #5a6988;box-shadow:0 0 0 3px #181425,inset 0 3px 0 #8b9bb4,inset 0 -3px 0 #181425}
.glyph{position:absolute;bottom:-10px;right:-14px;min-width:28px;height:26px;padding:0 7px}
.buff{width:38px;height:38px;font:12px 'Jersey 10',sans-serif}
.plaque{padding:3px 9px;background:rgba(10,10,16,.86);font:14px 'Jersey 10',sans-serif;letter-spacing:.05em}
/* life: repeating-linear-gradient(90deg,#63c74d 0 12px,#3e8948 12px 14px); barrier: (#ead4aa 0 12px,#c28569 12px 14px)
   mana: repeating-linear-gradient(90deg,#2ce8f5 0 2px,#0099db 2px 12px,#124e89 12px 14px)
   progress: repeating-linear-gradient(90deg,<colour> 0 8px,transparent 8px 10px) on #181425 with 0 0 0 2px #3a4466 */
```

## Answers to the open questions (revision)

The first draft's seven open questions and the reviewer's eight items for the user are settled. Each is folded in above:
- **Zoom:** the user chose 4 px per sprite pixel at 1080p; the rule is "nearest 27 units" (item 2).
- **UI scale:** quarter steps, with the HUD clamped at 0.75 or above (item 1), and the 0.75 floor's light pane scrolling accepted.
- **Apply bar:** always visible (item 34).
- **Tabs:** LB/RB top-level and LT/RT nested (item 15).
- **Key clashes:** Tab traversal, `[` / `]` for skills, and G to track (the input map).
- **Epic:** `#d7a6e8` text and `RARITY_TEXT` (item 13).
- **Galvanize:** the slot spark only (item 35).
- **Minimap:** the arena plus any terrain, no rooms (item 4).
- **Stop cards:** they name a kind (item 20).
- **Y on Skills:** tap removes, hold applies (the prompt contract).
- **Quest preview:** the dev-only flag is kept (item 5).

No questions remain open.
