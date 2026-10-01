# Delve UI v1: PC hub, Hades-style HUD, forge pixel-art kit

**Status:** approved direction, 2026-10-01 ("lock it in as v1 UI/UX to build now"). The build starts from v0.53.0 (`84a2c8a`) and ships in five releases over four phases: v0.54.0, v0.55.0, v0.56.0, v0.57.0 and v0.57.1. The engine owns every rule and number. The build makes one small engine addition (`chainCycle`, Phase 2) and no other engine change. Saves (`alloy:delve:v2`, `alloy:controls:v1`, `alloy:delve:sandbox:v1`) keep their shape.

**Sources:**
- **Mockups.** The canvas "Alloy PC UI Redesign" (https://claude.ai/artifact/FYid3YsXypifppvgVe4VzD) has eight 1920×1080 boards: Main (flow and input map), Anvil · Loadout, Anvil · Skills, Anvil · Quests, Dive HUD, Pause, Between depths and UI kit. They are the source of truth for layout and look. Every size in this spec is in **design px at 1920×1080**, read from their markup. Appendix A copies the forge theme CSS from their helmet, so this spec stands without them.
- **Audit.** The audit of v0.53.0 (session scratchpad, `ui-audit/audit.md`) is cited below as "audit §n".
- **Decisions.** The user approved them on 2026-10-01; the table below restates them.
- **Zoom.** The user added a ~25% dive zoom-out the same day.

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
| Zoom | The dive camera zooms out about 25% for a wider view. It stays crisp (whole pixels) and is tunable. |

## The input map

One map for every Delve screen. A prompt draws the glyph of whichever device spoke last (`inputDeviceStore`).

| Action | Mouse · keys | Pad | Where |
|---|---|---|---|
| Switch hub tab | 1 – 5 | LB · RB | hub, pause |
| Select · confirm | Click | A | everywhere |
| Back · close | Esc | B | everywhere (the topmost `[data-pad-back]`) |
| Equip | Right-click | A | Loadout (bag tile) |
| Salvage | Del | X | Loadout |
| Lock | L | Y | Loadout |
| Full compare | hold Shift | hold LT | Loadout, pause |
| Apply chain changes | Ctrl + Enter | hold Y | Skills |
| Remove move | Del | Y (tap) | Skills |
| Reorder move | Drag | X (pick up, move, X to drop) | Skills |
| Next skill | Tab | RS | Skills |
| Track quest | T | Y | Quests |
| Training | T | View | hub footer |
| Start the dive | Enter | Start (the pad's Menu button) | hub |
| Pause | Esc | Menu | dive |
| Journal | J | View | dive (opens the pause on Quests) |
| Show all loot labels | hold Alt | hold LS | dive |
| Take · inspect · skip | Click · hover · S | A · Y · X | stop |

**Notes on the map:**
- **In the hub, Esc / B opens the system menu.** That menu holds Resume, Controls, Settings and Main menu, plus Restart and Pull mode in dev builds. On the pause screen, Resume carries both `data-pad-back` and `data-pad-menu`.
- **Y on Skills.** A tap removes the move, firing on release under 400 ms. A 600 ms hold applies, with a fill on the Apply glyph. The two never both fire (decided in the spec: the mockup gives Y both jobs, and a release-fired tap keeps them apart).

## Decided in the spec

Each line names the decision and its reason. The sections below give the detail.

1. **Scaling.**
   - One CSS `zoom: var(--ui-scale)` on every Delve UI root, never on the Pixi canvas. Code is authored in 1080p design px.
   - `--ui-scale = clamp(0.75, min(innerWidth/1920, innerHeight/1080), 2)`, and the HUD gets `--hud-scale = --ui-scale × HUD scale` (Settings, 80–125%).
   - Reason: builders copy the mockups' px verbatim, everything scales together, and the 0.75 floor keeps 14 px captions at 10.5 CSS px or more at 1280×720.
2. **Arena zoom.**
   - `ARENA_VIEW_UNITS = 25` arena units of window height, rounded to whole device pixels per sprite pixel, and no longer tied to the HUD insets. At 1080p that is 4 px per sprite pixel (27 units tall, against today's 19.7), a 27% zoom-out.
   - "View distance" in Settings sets it from 20 to 30.
   - Reason: only whole-pixel scales keep the sprites, the effect pixels and the floor crisp. Today's 5.47 px per pixel at 1080p isn't one.
3. **Camera insets.** These become four sides `{ top, right, bottom, left }`, measured with `getBoundingClientRect`, and they only move the camera's centre, never the zoom. Reason: the new HUD covers the top, the right column and the bottom-left; `offsetHeight` is unreliable under `zoom`.
4. **Minimap.**
   - A DOM `<canvas>` (2D, smoothing off) in the floor panel. It draws the arena rectangle, the camera's view, the hero, foes (elites and the boss bigger) and drops in rarity colour.
   - It fits inside its box at a whole number of px per arena unit and redraws on the HUD's 80 ms refresh from a `map` field on the HUD snapshot.
   - Reason: the arena is one 26×40 rectangle with no rooms, so dots on a frame are the whole map. A second Pixi app would cost a WebGL context, and 12.5 Hz is plenty for dots.
5. **Quests.**
   - Client view types (`QuestView`) and a `useQuests()` hook that returns no quests in v1.
   - The tab ships its full layout with an empty state, and the HUD tracker renders nothing while nothing is tracked.
   - A dev flag (`alloy:delve:questPreview = "1"`) fills both from a fixture.
   - A future engine `src/quest/` plugs in behind `useQuests()` alone.
   - Reason: it settles the tab, the tracker and their inputs without inventing a quest engine.
6. **Training Grounds.**
   - They use the dive's HUD grid. The Training panel becomes the right-column dock (400 px) for every device, and the top bar becomes the Training bar with one "◂ Anvil".
   - With the pad, View moves focus into the dock and pauses the sandbox; B returns to the fight. The `sheet` layout and `openLayout` go.
   - Reason: one layout, the same skill dock as the dive, and the pad still never fights the menus.
7. **DPS Lab.** It takes the kit's shell (wall, steel header with kit Tabs, kit Buttons and Chips) and keeps its native selects, chart and table. Reason: it is a dev tool; a coherent frame is enough.
8. **Touch.**
   - The Delve's touch paths are removed: the joystick, drag-to-aim and drag-back-to-cancel (`aim-gestures.ts`), the touch-only attack button and the dock-or-sheet logic.
   - The mouse's hold-to-walk and hold-to-attack stay. A click on a HUD slot still casts it auto-aimed.
   - `InputDevice` keeps `'touch'` for the classic screens, and the Delve shows mouse and key glyphs for it.
   - Reason: the Delve is PC-only, and the classic Draft is touch-first and out of scope.
9. **Fonts.**
   - Jersey 10, Pixelify Sans and Silkscreen are self-hosted as unmodified woff2 files from the Google Fonts repository in `public/fonts/`, each with its `OFL.txt`.
   - `@font-face` uses `font-display: block`, and `document.fonts.load` runs before Pixi makes label text.
   - The Google Fonts `<link>` stays for Rajdhani and DM Sans (classic).
   - Reason: all three are SIL OFL 1.1, which allows bundling with the licence. A Steam build can't depend on a CDN. Unmodified files avoid any Reserved Font Name question.
10. **Sprites in the DOM.**
    - `PixelSprite` reads frame rectangles from `atlas.json` (fetched once).
    - It sets `background-image: atlas.png`, `background-size` and `background-position` at a scale snapped to whole device pixels per sprite pixel (`round(scale × uiScale × dpr) / (uiScale × dpr)`), with `image-rendering: pixelated`.
    - Reason: it uses the same atlas as the arena and stays crisp at every window size.
11. **Item icons.**
    - Today's 12 SVG silhouettes become pixel maps: 10×10 ASCII grids in `ItemIcon.tsx`, one per gear base, drawn as SVG `<rect>`s with `shape-rendering: crispEdges`.
    - The fill is the rarity colour with a `#181425` outline. The props stay the same.
    - Reason: the mockups' look with no atlas rebuild. Pixel-forge stays for creatures.
12. **The classic Arena screens.** Every route outside `/delve*` keeps the 9:16 letterbox, the TabBar, the Settings drawer, `index.css`'s tokens and focus ring, and Rajdhani / DM Sans. The main menu is untouched too: the Main board is a flow map, not a menu design. Reason: they are out of scope, and Draft is locked.
13. **Contrast.** Rarity colours are always fine as borders and fills on a dark well. As text:
    - Epic text uses `#f6757a`.
    - A ▼ or loss as text uses `#f6757a`.
    - `#8b9bb4` is never text on `#3a4466`.
    - The full table is in the Accessibility section.
    - Reason: `#b55088` on steel is 2.96:1, `#e43b44` on steel 3.31:1, and `#8b9bb4` on `#3a4466` 3.39:1.
14. **Reduced motion.**
    - Under `prefers-reduced-motion` the kit has no pulsing glows, WAAPI movement becomes a fade, and the camera's shake and strike kick are zeroed.
    - Hit-stop and the perfect dodge's slow motion stay, because they carry game information.
    - Reason: the motion that is decoration goes, and the information stays.
15. **Nested tab lists.**
    - LB/RB always step the screen's top-level `[data-pad-tabs]`. LT/RT step a nested list marked `data-pad-tabs="sub"`, on screens that don't bind a trigger.
    - Skills' skill list also takes RS and Tab, as its mockup shows.
    - Reason: one rule whose meaning never depends on where the focus sits.
16. **Item actions split by place.**
    - Loadout's compare pane holds Equip, Salvage, Lock, the inline bind choice and a weapon's moveset Transfer.
    - Upgrade, Reforge and Re-attune move to the Forge's Temper bench ("Forge it ›" jumps there with the item).
    - `ItemDetailSheet` is retired.
    - Reason: the audit found Upgrade in three places and the sheet hiding the bag it compares against.
17. **Reactions, records and dev chips.**
    - The Reactions grid moves from Abilities to the Codex.
    - The lifetime stats move to the Codex's Records.
    - The dev chips (Restart, Pull mode) move to the system menu.
    - Reason: the Main board's Codex is "legendaries, reactions", and the hub has no scrolling column left to hang them on.
18. **Settings.**
    - A kit `SettingsPanel` binds the same `uiStore` fields as the classic drawer: volumes, mute, colorblind mode. It adds Display: HUD scale and View distance.
    - It shows `v{version}`, since the Delve hides the TabBar that carries the version today.
    - The basic attack's Auto / Manual moves into the Controls panel (`attack-mode-toggle` kept).
    - Reason: one Esc menu, and the attack mode is an input preference, saved per device.
19. **The prompt runtime.**
    - Footer prompts are data (`Prompt[]`). `usePrompts` binds their keys and pad buttons for the topmost scope.
    - Esc presses the topmost `[data-pad-back]` (the pad's B rule). Enter presses `[data-pad-menu]` only when no control has the focus.
    - Kit buttons blur after a mouse click (today's `blurOnPointerUp`, moved into the kit).
    - Reason: one declarative layer beside the existing pad markers, and Enter never fights a focused button.
20. **Stop cards.** Each card names its power-up kind, as the engine offers kinds, not items. Taking a card that needs a choice expands its picker in place in the centre column, with Back. Reason: no sheets over the stop, and no engine change.
21. **"Found this floor".**
    - The store records `floorDropsFrom`, the length of `diveDrops` when a floor begins.
    - The log and the stop list `diveDrops` from there, with the floor's runes.
    - Reason: the dive's list exists; a per-floor view is one index of UI state.
22. **Loot labels.**
    - The labels stay Pixi text in the screen-space text layer.
    - They become rarity plaques in Jersey 10 at 14 × `--hud-scale` px, with ▲ for upgrades.
    - Rare and above, runes and upgrades always show; Alt / hold LS shows every drop.
    - While all show, overlapping plaques stack upward (one greedy pass sorted by y).
    - Reason: a wider view puts more drops on screen, so the plaques need a de-overlap pass.
23. **Rebindable actions.** `labels` (Alt / LS) and `journal` (J / View) join `CONTROL_ACTIONS`. `parseControls` already fills missing actions with defaults, so saved setups keep working.
24. **Compare stats.** The compare table is built from the engine's `itemStatLines` for both items: one row per stat, a stat's lines summed for display, formatted by `formatStat`. Reason: the engine values are re-presented; no stat math is invented.
25. **Chain stats.** The one engine addition, `chainCycle(registry, stats, chain)`, returns `{ damage, seconds, mana, steps: { cast, beat }[], restart }`, composed from `damagePerUse`, `useInterval`, `valuedChain` and `beatFor`. Reason: the Skills tiles and the rhythm strip need cycle totals, and the client may not compute them.
26. **First focus.** `keepFocus` prefers `[data-pad-first]` when a scope has no remembered focus. The hub marks the Delve button with it. Reason: the audit found the first pad focus on a tiny Controls chip.
27. **Emoji.** The Delve's UI chrome swaps emoji (⚙ 🔗 ✦ 🧪 💨 ⚔️ 🎮 🎯 ☠) for kit pixel glyphs. The Pixi monster fallback keeps its emoji. Reason: emoji render differently per OS, which is a risk for a Steam build (audit §6).
28. **Toasts.** `components/Toast.tsx` is shared with the classic screens, so it stays as it is. The Delve restyles it with CSS scoped to `.delve-ui`. Reason: no change to a shared component.
29. **Boss bar and banners.**
    - The boss bar sits under the top bar, centred in the middle column, and only while a boss lives.
    - The banners stay at 26% from the top in the middle column. They use Jersey 10 with a 2 px hard shadow instead of the glow.
    - Reason: the middle stays clear, and the shadow keeps them legible over any floor.
30. **Test ids.**
    - Every id the e2e specs use is kept, except the hub tabs: `tab-bag` becomes `tab-loadout` and `tab-abilities` becomes `tab-skills`. That is 11 mechanical updates.
    - `tab-forge` and `tab-codex` stay; `tab-quests` is new.
    - Reason: an id that names the wrong tab would rot.

## Architecture

### Where the new code lives

All paths are under `packages/client/src/`:
- **`features/delve/kit/`**: the forge kit. It holds `kit.css` (tokens, `@font-face`, materials, the focus ring, `.delve-ui`) and the components in the contract below. It also holds `prompts.ts` (the prompt runtime) and `index.ts`.
- **`features/delve/items/`**: the item views extracted from `ItemDetailSheet.tsx`.
- **`features/delve/hub/`**:
  - `AnvilHub.tsx`, the screen in `mode: 'anvil' | 'pause'`
  - `HubHeader.tsx`, `HubFooter.tsx`, `SystemMenu.tsx` and `SettingsPanel.tsx`
  - one folder per tab: `loadout/`, `skills/`, `forge/`, `codex/`, `quests/`
- **`features/delve/quests/`**: `types.ts`, `useQuests.ts`, `QuestTracker.tsx` and `sample.ts`.
- **`features/delve/arena/hud/`**:
  - the grid and top bar: `HudGrid.tsx`, `PurseBar.tsx`, `BossBar.tsx`
  - the dock: `SkillDock.tsx`, `SkillSlot.tsx`, `SkillTooltip.tsx`, `BuffRow.tsx`, `Vitals.tsx`
  - the right column: `FloorColumn.tsx`, `Minimap.tsx`, `FoundLog.tsx`
- **`features/delve/arena/camera.ts`**: the zoom rule (`ARENA_VIEW_UNITS`, `spritePixelScale`).
- **`features/delve/stop/`**: `StopScreen.tsx` and `DoorPane.tsx`. It reuses `StopPanel.tsx`'s pickers.

### What changes, and what replaces it

| Today | v1 | Phase |
|---|---|---|
| `components/AppShell.tsx`: 9:16 letterbox below 3:2; TabBar hidden only on `/delve/run`, `/delve/training` and `/delve/lab` | `data-frame="full"` on `.app-frame` for every `/delve*` route (CSS releases the letterbox), the TabBar hidden on all of them, and `--ui-scale` / `--hud-scale` set on `:root` beside `--frame-h` | 1 |
| `components/TabBar.tsx` (version label), `SettingsDrawer.tsx` | Untouched; Delve routes don't render them. The Delve shows its version in `SettingsPanel` | 1 |
| `index.css`: the `html[data-input='gamepad'] :focus` ring | Kept for the classic screens. `kit.css` adds the Delve ring for `:focus-visible` and pad focus | 1 |
| `features/delve/delve.css`: rounded gradient `.delve-btn`, `.delve-chip`, `.delve-panel`, `.delve-tile`, `.delve-sheet` and `.delve-hpbar`; `.delve-column` (560 px) | Phase 1 re-skins the legacy classes to the forge materials, so screens not yet rebuilt match. Phases 2–3 delete each class as its last user goes; `.delve-column` and `.delve-sheet` go in Phase 3b | 1–3 |
| `pages/DelveCamp.tsx`: one scrolling column with the header, how-to, `PaperDoll`, mana strip, CTA, tabs, lifetime stats and dev chips | Renders `<AnvilHub mode="anvil" />` and `ManaChoice`. Everything else moves into the hub | 1 (shell), 2 (panes) |
| `BagPanel`, `PaperDoll`, `ItemTile` | `hub/loadout/BagPane`, `EquippedPane`; `ItemTile` wraps kit `Tile` | 2 |
| `ItemDetailSheet.tsx` (bottom sheet) | Phase 1 splits it into `items/*` while it keeps working. Phase 2 drops it from the hub (compare pane, item tooltip, Forge bench). Phase 3b deletes it (pause, stop) | 1–3 |
| `BindPrompt.tsx` (modal) | Inline in the compare pane, the same engine op (`bindSecondary`) | 2 |
| `AbilitiesPanel.tsx`, `chains/ChainEditor.tsx`, `chains/MoveEditor.tsx`, `ManaPanel.tsx`, `runes/SocketRow.tsx`, `runes/RunePicker.tsx` (sheet) | `useChainEditor` (state and handlers out of `ChainEditor`). The three panes are `hub/skills/SkillList`, `ChainLane` with `ChainStats` and `RhythmStrip`, and `MoveInspector`. The Mana view takes the right pane, and the rune picker goes inline in the inspector. `ChainEditor` stays as the one-column composition for the Training dock and the stop's "Adjust a move" | 2 |
| `ForgePanel.tsx`, `runes/RunePouchPanel.tsx` | `hub/forge/`: `GearList` · `Bench` (Temper: upgrade, reforge, re-attune; Fuse) · `RunePane` | 2 |
| `CodexPanel.tsx`, and the reactions grid in `AbilitiesPanel` | `hub/codex/`: `CodexSections` · `CodexGrid` · `CodexDetail` (Legendaries, Reactions, Records) | 2 |
| none | `hub/quests/` (journal, detail, rewards) and `quests/*` | 2 |
| `features/controls/ControlsPanel.tsx` (centred modal) | The same content in a kit `Dialog`, plus Auto / Manual basic attack. It opens from the system menu, the pause footer and the Training bar | 1 (dialog), 3b (toggle) |
| `ManaChoice.tsx` | Kit `Dialog`, forced (no back) | 1 |
| `pages/DelveRun.tsx`: `TopHud`, a 520 px bottom strip (`Vitals`, `SkillBar`, `AttackButton`), the kebab menu, `PickupFeed`, the door overlay with `LootTray` | `HudGrid` with `PurseBar`, `FloorColumn` and `SkillDock`, then `AnvilHub mode="pause"`, `StopScreen` and a kit `DiveSummary` | 3a, 3b |
| `arena/ArenaHud.tsx` (712 lines: round thumb buttons with drag-to-aim) | Split into `arena/hud/*`. `floatPay` stays (it finds `[data-testid="ability-N"]`) and floats beside the slot. `keyHints` / `padHints` give way to `InputGlyph` | 3a |
| `arena/ArenaControls.tsx` | Mouse only: the joystick branch, `STICK_RADIUS` and the "Drag to move" hint go. A device-aware hint clears on the first move by any device | 3a |
| `arena/aim-gestures.ts` (+ test) | Deleted | 3a |
| `arena/PickupFeed.tsx` | `arena/hud/FoundLog.tsx` | 3a |
| `arena/ArenaRenderer.ts`: `unit = max(16, min(w/13.5, playH/15))`, `setInsets(top, bottom)`, 13 px drop labels for rare and above | `camera.ts` zoom, `setInsets(Insets)`, `viewRect()`, rarity plaques, whole-pixel root position | 3a |
| `arena/useArenaCore.ts` snapshot | Adds `buffs` and `map`, the `labels` hold, and the `journal` press | 3a |
| `DoorChoice.tsx`, `LootTray.tsx`, `StopPanel.tsx`'s sheet portal | `stop/StopScreen.tsx` (found · power-ups · doors). The pickers keep their code and lose the sheet | 3b |
| `DiveSummary.tsx`, `LegendaryFanfare.tsx` | Kit re-skin, same content and ids | 3b |
| `pages/DelveTraining.tsx`, `training/TrainingPanel.tsx` (dock or sheet, 5 tiny tabs, two "◂ Anvil") | `HudGrid` with a `TrainingBar` and the panel as the right-column dock. Kit Tabs; the `sheet` layout goes | 3b |
| `pages/DelveLab.tsx`, `lab/*` | Kit shell only | 4 |
| `features/gamepad/use-gamepad-nav.ts` | Routes X, Y, View, LS, RS and the LT/RT holds to `usePrompts`, `data-pad-tabs="sub"` and `data-pad-first`. The rest of its rules stay | 1 |
| `features/gamepad/arena-pad.ts`, `controls/controls.ts` | `labels` and `journal` actions | 3a |
| `stores/inputDeviceStore.ts` | Unchanged | none |
| `stores/uiStore.ts` | `hudScale` (`alloy:delve:hudScale`, default 1) and `arenaViewUnits` (`alloy:delve:viewUnits`, default 25) | 1, 3a |
| `stores/delveStore.ts` | `floorDropsFrom` | 3a |

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
| `--r-epic-text` | `#f6757a` | epic as text; the other rarities use their own colour |
| `--k-font-display` / `-body` / `-label` | `'Jersey 10'`, `'Pixelify Sans'`, `'Silkscreen'` | |
| Type scale (design px) | display 64, heading 32, section 22, body 18, body-2 16, caption 14 (the smallest text), label 11 (Silkscreen, uppercase only) | |

**Global rules on `.delve-ui`:**
- `border-radius: 0`, font smoothing off and `svg { shape-rendering: crispEdges }`.
- Display text gets `text-shadow: 2px 2px 0 #181425`.
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

### The kit contract

Several builders work on the kit at once against this contract. Everything is exported from `features/delve/kit/index.ts`, with sizes in design px.

```ts
import type { ButtonHTMLAttributes, HTMLAttributes, ReactElement, ReactNode, RefObject } from 'react';
import type { ManaType, Rarity } from '@alloy/engine';
import type { PadButton } from '@/features/gamepad/gamepad';

// ── Input (prompts.ts) ───────────────────────────────────────────────────
/** One action's inputs on both devices. */
export interface Binding {
  /** KeyboardEvent.code: 'Delete', 'KeyL', 'Enter', 'Digit1', 'AltLeft'… */
  key?: string;
  ctrl?: boolean;
  /** A pointer gesture shown instead of (or beside) a key. */
  mouse?: 'click' | 'rmb' | 'lmb' | 'drag' | 'hover';
  pad?: PadButton;
  /** Pad: fires once held this long (ms). 'Hold Y' apply is 600, 'Hold LT' compare 0 with onHold. */
  padHold?: number;
  /** A key held down rather than pressed: Shift compare, Alt labels (calls onHold). */
  whileHeld?: boolean;
}

export interface Prompt {
  id: string;
  label: string;
  binding: Binding;
  /** A press of its key or pad button while its scope is the topmost visible one. None: display only. */
  onPress?: () => void;
  /** whileHeld / hold bindings: true on down, false on up. */
  onHold?: (held: boolean) => void;
  disabled?: boolean;
}

/** Binds the prompts' keys and pad buttons while mounted, for the topmost `[data-pad-scope]` that contains `scopeRef` (the document when absent). Ignores keys typed into inputs. */
export function usePrompts(prompts: Prompt[], scopeRef?: RefObject<HTMLElement | null>): void;

// ── Glyphs ───────────────────────────────────────────────────────────────
export function Keycap(props: { label: string; size?: 'sm' | 'md' }): ReactElement;
/** Octagonal pad glyph: A #63c74d, B #e43b44, X #0099db, Y #fee761, the rest #c0cbdc; ink #181425. */
export function PadGlyph(props: { button: PadButton; hold?: boolean; size?: 'sm' | 'md' }): ReactElement;
/** The keycap or pad glyph for the device that holds the input lock ('touch' draws the mouse/key side). */
export function InputGlyph(props: { binding: Binding; size?: 'sm' | 'md' }): ReactElement;

export type GlyphId =
  | 'scrap' | 'link' | 'dust' | 'rune' | 'potion' | 'dodge' | 'attack' | 'lock' | 'check'
  | 'skull' | 'anvil' | 'chest' | 'up' | 'down' | 'new' | ManaType;
/** A pixel glyph drawn as crisp SVG rects (replaces emoji in the Delve's chrome). */
export function Glyph(props: { id: GlyphId; size?: number; color?: string; title?: string }): ReactElement;

// ── Surfaces ─────────────────────────────────────────────────────────────
export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'aside';
  /** 'plate': wood-framed riveted steel (hub). 'glass': HUD steel. 'well': a dark inset. */
  material?: 'plate' | 'glass' | 'well';
  /** Header row: title on the left, aside on the right. */
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
  /** 'wall': the wood wall. 'arena': the dimmed arena behind (pause rgba(24,20,37,.86), stop rgba(6,6,11,.82)). */
  backdrop: 'wall' | 'arena-pause' | 'arena-stop';
  testId?: string;
}
/** A 1080p-design screen: 72 px band header, flexible main, 76 px plank footer. Carries `.delve-ui` and `data-pad-scope`. */
export function Screen(props: ScreenProps): ReactElement;
export function Header(props: { title: ReactNode; subtitle?: ReactNode; nav?: ReactNode; aside?: ReactNode }): ReactElement;
export function Footer(props: { prompts: Prompt[]; children?: ReactNode }): ReactElement;

export interface DialogProps {
  title: ReactNode;
  /** Absent: forced (no back, no Esc), e.g. the mana choice. */
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Focus on open; else the first control. Focus returns to the opener on close. */
  initialFocus?: RefObject<HTMLElement | null>;
  testId?: string;
}
/** A centred plate over a dim, in a portal under `#delve-ui-layer` (zoomed). `data-pad-scope`; its Back is `data-pad-back`. */
export function Dialog(props: DialogProps): ReactElement;

// ── Controls ─────────────────────────────────────────────────────────────
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: hot metal. secondary: wood plank. danger. go: green (Equip best). quiet: text only. */
  variant?: 'primary' | 'secondary' | 'danger' | 'go' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
  /** Draws its glyph at the right end. Display only: `usePrompts` binds it. */
  binding?: Binding;
  testId?: string;
}
/** Blurs itself after a mouse click (so Enter/Esc reach the screen); never after a key or pad press. */
export function Button(props: ButtonProps): ReactElement;

export interface TabsProps<T extends string> {
  tabs: { id: T; label: ReactNode; badge?: ReactNode; disabled?: boolean; testId?: string }[];
  value: T;
  onChange: (id: T) => void;
  /** 'top': LB/RB (+ digits 1..n when `digits`). 'sub': LT/RT. */
  level: 'top' | 'sub';
  digits?: boolean;
  /** Draws the bumper/trigger (or 1 / n) glyphs either side. */
  glyphs?: boolean;
  size?: 'lg' | 'md';
  'aria-label': string;
}
/** role="tablist" with data-pad-tabs (="sub" for level 'sub'); each tab role="tab" aria-selected. */
export function Tabs<T extends string>(props: TabsProps<T>): ReactElement;

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  on?: boolean;
  testId?: string;
}
export function Chip(props: ChipProps): ReactElement;

export interface SegmentedProps<T extends string> {
  options: { id: T; label: ReactNode; color?: string; disabled?: boolean; title?: string; testId?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  /** A grid of this many columns (forms); a row when absent. */
  columns?: number;
  'aria-label': string;
}
export function Segmented<T extends string>(props: SegmentedProps<T>): ReactElement;

export interface BarProps {
  value: number;
  max: number;
  kind: 'life' | 'mana' | 'charge' | 'progress';
  /** An extra segment after the fill (the barrier). */
  extra?: { value: number; color: string };
  label?: ReactNode;
  /** Design px; life 32, mana 24, progress 6. */
  height?: number;
  /** progress: segmented 8 px blocks with 2 px gaps. */
  segmented?: boolean;
  testId?: string;
}
export function Bar(props: BarProps): ReactElement;

// ── Items ────────────────────────────────────────────────────────────────
export interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** null: an empty socket. */
  rarity: Rarity | null;
  icon?: ReactNode;
  /** Design px; default 84. */
  size?: number;
  delta?: 'up' | 'down' | 'potential' | null;
  fresh?: boolean;
  locked?: boolean;
  equipped?: boolean;
  selected?: boolean;
  /** aria-label, also the tooltip's fallback title. */
  label: string;
  testId?: string;
}
export function Tile(props: TileProps): ReactElement;

// ── Tooltips ─────────────────────────────────────────────────────────────
export interface TooltipProps {
  /** Built only while open. */
  content: () => ReactNode;
  /** The anchor: a focusable element. Opens on hover (150 ms), on keyboard or pad focus, and stays while hovered. */
  children: ReactElement;
  placement?: 'right' | 'left' | 'top' | 'bottom';
  /** HUD rows: also open while the slot's own pad button is held. */
  openWhile?: boolean;
}
export function Tooltip(props: TooltipProps): ReactElement;
export function TooltipCard(props: {
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  children: ReactNode;
  prompts?: Prompt[];
  width?: number; // default 420
}): ReactElement;

// ── Art ──────────────────────────────────────────────────────────────────
export interface PixelSpriteProps {
  /** An atlas animation id: 'hero', a monster defId. */
  id: string;
  /** Design px per sprite pixel (snapped to whole device px). */
  scale: number;
  frame?: number;
  /** role="img" aria-label; decorative (aria-hidden) when absent. */
  label?: string;
}
export function PixelSprite(props: PixelSpriteProps): ReactElement;

// ── Scale ────────────────────────────────────────────────────────────────
/** The current --ui-scale and --hud-scale (uiStore), for JS that sizes pixels. */
export function useUiScale(): { ui: number; hud: number };
```

**Rules every builder keeps:**
- **No `data-testid` on a kit internal.** A screen passes `testId`, so ids stay where the e2e specs expect them.
- **Text.** Kit components never set a text colour below 4.5:1 on their own ground. Rarity text uses `--r-*` except epic, which uses `--r-epic-text`.
- **Gestures.** No component handles touch gestures.
- **Glyph or label.** A `Button` with a `binding` shows the glyph for the locked device. With no binding, it shows only its label.

## Phase 1: Foundation (v0.54.0)

**What ships:**
- the kit
- the forge look on every Delve screen, through the re-skinned legacy classes
- the Delve full-window, free of the letterbox and the TabBar
- UI scaling
- self-hosted fonts
- the prompt runtime with hotkeys
- the focus ring
- one system menu with Controls and Settings
- the Anvil shell: header, tabs and footer around today's panels

### Areas

**1A · Kit visuals (parallel).**
- **Built:** `kit.css` (tokens, materials, fonts, focus) and the font files with their `OFL.txt` under `public/fonts/`.
- **Components:** every component in the contract except `prompts.ts`.
- **Legacy re-skin:** `delve.css`'s legacy classes move to the materials:
  - `.delve-btn` becomes a plank and `-gold` hot metal
  - `.delve-panel` becomes a plate
  - `.delve-tile` becomes a socket
  - `.delve-chip` and `.delve-hpbar` take the forge look
  - `.delve-sheet` becomes a steel plate with no radius
- **Icons:** the pixel `ItemIcon` maps.
- **Tests:**
  - each component renders its role and aria state
  - `InputGlyph` switches with `inputDeviceStore`
  - `Tile` states
  - `PixelSprite`'s snapping (a pure `snapScale(scale, ui, dpr)` helper, tested)

**1B · Shell and input plumbing (parallel; no visuals).**
- **AppShell:**
  - `data-frame="full"` for `/delve*`
  - `hideTabBar` for `/delve*`
  - `--ui-scale` and `--hud-scale` computed in the existing resize handling and mirrored into `uiStore`
- **The prompt runtime** (`kit/prompts.ts`):
  - a registry keyed by scope; key handling (chords, `whileHeld`, inputs ignored)
  - Esc presses `[data-pad-back]`; Enter presses `[data-pad-menu]` when nothing is focused
- **`use-gamepad-nav.ts`:**
  - dispatches X, Y, View, LS, RS, LT and RT (with holds) to the registry
  - adds `data-pad-tabs="sub"` (LT/RT)
  - makes `data-pad-first` win in `keepFocus`
- **`uiStore`:** `hudScale`.
- **Tests:**
  - `use-gamepad-nav.test.ts` additions: sub-tabs and first focus
  - a `prompts.test.ts`: key chord, hold timing, the topmost scope only, ignoring a focused input

**1C · Item views (parallel).** Split `ItemDetailSheet.tsx` into `features/delve/items/` with no visual change. The sheet composes these until Phase 3b:

```ts
export function useItemComparison(uid: string | null): {
  item: GearItem | null; worn: GearItem | null; where: 'bag' | 'equipped' | null;
  cmp: ItemComparison | null; /** a weapon as it comes (no Transfer) */ asIs: ItemComparison | null;
};
export function ItemHeader(props: { item: GearItem; size?: 'md' | 'lg' }): ReactElement;          // tile, name, "Epic chest · item level 21 · Storm", tags
export function PowerDelta(props: { cmp: ItemComparison | null; label?: string }): ReactElement;   // "+6.4% Power if equipped"
export function ItemStatLines(props: { item: GearItem }): ReactElement;                             // implicits + affixes, quality bars
export function CompareTable(props: { item: GearItem; worn: GearItem | null }): ReactElement;       // Stat · Worn · This, from itemStatLines
export function LegendaryBox(props: { item: GearItem }): ReactElement;
export function MovesetView(props: { item: GearItem }): ReactElement;                               // moved as is
export function ItemTooltip(props: { uid: string; prompts?: Prompt[] }): ReactElement;              // TooltipCard: header, 3 key lines, PowerDelta
```

Its existing test (`ItemDetailSheet.test.tsx`) keeps passing. The new pieces get render tests.

**1D · Anvil shell and menus (after 1A, 1B and 1C merge).**
- **`AnvilHub`** (`mode: 'anvil' | 'pause'`, the pause wired in 3b), as a `Screen` on the wall:
  - **Header:** the anvil glyph, "The Anvil", "Deepest N · n of 12 legendaries", the Tabs (top, digits, glyphs), then scrap, Links and Mana Dust with their glyphs, a divider and Power (`hero-power`, `scrap-count` and `links-count` kept).
  - **Footer:** the tab's prompts, Training (T / View, `training-button`), the start-depth chips (`start-depths`) and the hot-metal Delve button (`delve-button`, `data-pad-menu`, `data-pad-first`). The draft block (`draft-block`, `draft-apply`, `draft-discard-delve`) is in a footer slot until Phase 2's Apply bar.
- **Interim main area:** each tab shows today's panel in a centred 960 px column. Loadout holds `PaperDoll` and `BagPanel`. Skills holds `AbilitiesPanel`. Forge and Codex hold their panels. Quests holds the empty state.
- **How-to:** "How to delve" (`delve-howto`, first save) is rewritten per device with `InputGlyph`s. It sits at the top of the Loadout tab.
- **`SystemMenu`** (Esc / B): Resume, Controls, Settings, Main menu, and dev Restart and Pull mode (`restart-delve`, `unsocket-chip`). `open-controls` is kept on its Controls entry.
- **`SettingsPanel`:** volumes, mute and colorblind mode, plus HUD scale and `v{version}`.
- **Dialogs:** `ControlsPanel` and `ManaChoice` move into kit `Dialog`s.
- **Dive screen:** `DelveRun`'s HUD layer is wrapped in `.delve-ui`, and its inset measurement moves to `getBoundingClientRect`.

### Contract between 1A, 1B and 1C

The kit contract above. 1B owns `prompts.ts`, AppShell, `use-gamepad-nav.ts` and `uiStore.ts`. 1A owns everything else under `kit/`, plus `delve.css` and `ItemIcon.tsx`. 1C owns `items/` and `ItemDetailSheet.tsx`. No file has two owners.

### E2E in Phase 1

- **Phone projects.** `playwright.config.ts`'s three phone projects add `delve*.spec.ts` to `testIgnore`. The desktop project (1280×800) runs them.
- **Tab ids.** `tab-bag` becomes `tab-loadout` and `tab-abilities` becomes `tab-skills` in `delve.spec.ts`, `delve-runes.spec.ts` and `delve-gamepad.spec.ts`.
- **Interim locations.** `mana-strip` sits on the Loadout's attunement line, and `delve-howto` keeps its id.
- **G03.** Updated to the five tabs.

**Bump:** `chore(client): bump version to 0.54.0`.

## Phase 2: The Anvil hub (v0.55.0)

Each tab becomes its three panes, and the interim column goes.

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
  /** 'pause': read-only. Item actions become "locked until the Anvil" notes, and dive finds carry NEW. The engine's own locks (isDiveActive) still apply. */
  mode: HubMode;
  /** The tab's prompts, drawn at the left of the footer. Call on change (the hub keeps the latest). */
  setPrompts: (prompts: Prompt[]) => void;
  /** Replaces the footer's right-hand group while set (Skills' Apply bar); null restores Training / start / Delve. */
  setFooterAction: (node: ReactNode | null) => void;
  /** Open another tab with something selected. */
  go: (to: HubLink) => void;
  /** The link this tab was opened with, if any. */
  link?: HubLink;
}
// Each area exports exactly one of:
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

**Scrolling.** Panes scroll inside themselves; the screen never does. At the 0.75 floor (a 1707×960 design canvas), the Loadout's moveset box and the Skills inspector may scroll inside their panes.

### Areas (all parallel; the integrator only wires `AnvilHub`)

**2A · Loadout.**

*Equipped pane* (`EquippedPane`, `paper-doll`, `slot-<slot>` kept):
- **Paper doll:** an 84 / 200 / 84 grid with three slots on the left (Weapon, Gloves, Ring) and four on the right (Helm, Amulet, Chest, Boots). Each slot is a kit `Tile` with a 12 px slot label.
- **Centre:** the hero `PixelSprite` at scale 10 on the anvil pedestal glyph, over a stepped cyan glow.
- **Stats:** a two-column table from `profileStats`: Damage, Life, Attack speed, Armor, Mana and Regen (mana values in `--k-mana`).
- **Attunement:** bars for the pair. The block is `mana-strip`; a click goes to `{ tab: 'skills', view: 'mana' }`.
- **Moveset box:** "Moveset · <weapon>" with "Skills ›" and each skill's slots used of its cap.

*Bag pane* (`bag-panel`, `bag-item`, `equip-best`, `salvage-junk` kept):
- **Header row:** "Bag 22 / 40", filter chips (All, Weapons, Armor, Jewelry, ▲ Upgrades n) and a Sort chip (Power, Rarity, Slot, Newest).
- **Grid:** `repeat(8, minmax(56px, 84px))` with 14 px gaps.
- **Tiles:**
  - ▲, ▼ or ◇ from `compareItem` (as `BagPanel` does today), NEW from `newUids`, and a lock mark
  - hover or focus sets the compare pane's item
  - right-click (`onContextMenu`, default prevented) equips
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

*Deletes:* `BagPanel.tsx`, `PaperDoll.tsx` and `BindPrompt.tsx` (its content moves into the pane).

**2B · Skills.**

*Split:* `ChainEditor.tsx` into `useChainEditor(props: ChainEditorProps)`, which keeps today's props unchanged, and presentational pieces. `ChainEditor` itself stays, as the one-column composition the Training dock and the stop use.

*Skill list* (`SkillList`, a sub-level `Tabs`, `chain-skill-<s>` kept):
- **Rows:** four plate buttons (Basic, Primary, Defensive, Ultimate), each with:
  - the glyph of its bound key or pad button (from `controlsStore`)
  - its payment
  - five slot dots (filled = moves, steel = open, dark = past the cap)
  - its summary line (`abilities-summary`)
- **Mana pair box:** "Fire · 6", "Storm · 8", the overtake line and the reaction. "Realign ›" swaps the right pane to the Mana view (today's `ManaPanel`, `mana-view` and its ids kept); Esc / B returns.

*Chain lane* (`ChainLane`, `chain-cards`):
- **Header:** "Primary", then "4 of 5 slots · pays mana · each press casts the next move".
- **Move cards** (`move-<i>`): each shows "Move n" and its kind, the element tile and form name, the element (fusion name for two), the socket pips (`socket-<i>`, `socket-open`) and the cost.
- **Arrows:** › between cards.
- **"+ Slot"** (`add-slot`, `move-add`): its price from the engine's slot price, e.g. "1 Link · 20 scrap".
- **Reorder:** drag with the mouse. With the pad, X picks the card up, the D-pad moves it and X drops it. The ◂ ▸ × chips go, and their ids (`move-left-<i>`, `move-right-<i>`, `move-remove-<i>`) move onto hidden-until-focus buttons. A unit test checks the reorder through them.

*Chain stats* (`ChainStats`, from `chainCycle` and `manaSupport`): four tiles:
- chain damage per full cycle
- cycle seconds ("casts plus beats")
- mana per cycle (with the runes' load and attunement's ease)
- mana support "spend / refill" (`mana-support`), amber when the spend outruns the refill

*Rhythm strip* (`RhythmStrip`): one block per cast, sized by `steps[i].cast`; one line per beat, by `steps[i].beat`; the restart pause at the end.

*Inspector* (`MoveInspector`, `ability-readout`):
- **Title:** "Move n · <name>", with "edited" while drafted.
- **Segments:** Kind (Light, Medium, Heavy, Hold), Form (a 5-column grid; `form-<id>`), Elements (the pair, then the fusion; off-pair marked).
- **Sockets:** "n of m", each a row with the rune glyph, name, effect and "+x% cost" (`rune-ease`). A click on a row opens the rune picker inline in place of the numbers: today's `RunePicker` list, ids kept (`rune-picker`, `rune-picker-close` on its Back, `rune-current`, `rune-pull`, `rune-tier-<t>`, `rune-pick-<id>`).
- **Numbers:** Hit, the radius, Cost and Beat after, from `moveNumbers` and the chain.
- **Ease line:** "Attunement eases rune cost by n%".
- **Warnings:** `cost-warning`.
- **Basic chain:** its blows show Kind and Element only.

*Apply bar* (`setFooterAction`, `chain-draft`):
- **Contents:** "n unapplied changes · price" (`chain-price`), Revert (`chain-revert`), and Apply (`chain-apply`, binding Ctrl+Enter / hold Y; `chain-apply-why` when refused).
- **Visibility:** while changes exist. The Delve button hides, and Enter does nothing, until they are applied or reverted, as today's draft block does.

*Engine:* `chainCycle` in `packages/engine/src/delve/hero-stats.ts`, with a test in `tests/`. Rebuild the engine (`pnpm -F @alloy/engine build`).

*Deletes:* `AbilitiesPanel.tsx`. Its reactions grid moves to 2C, and `AttunementBars` and `Chip` move to the kit or `items/`.

**2C · Forge and Codex.**
- **Forge:**
  - **`GearList`:** equipped items first, then the bag, with filter chips. A row is a tile, the name and its upgrade level (`temper-row`).
  - **`Bench`**, with a sub-level Tabs of Temper and Fuse:
    - **Temper** works the selected item: Upgrade +1 (`upgrade-button`, `upgradeCost`), Reforge (pick an affix line, then `reforgeAffix`, `reforgeCost`) and Re-attune (element chips, `reattune-<m>`, `reattuneCost`). Each shows its price against the wallet.
    - **Fuse** is today's Alloy Fusion: rarity chips, three inputs to one output, Auto-pick, `fusion-result` and `fuse-button`.
  - **`RunePane`:** today's pouch (`rune-pouch`, `pouch-<key>`, `rune-fuse-<key>`). A row has a visible "Fuse 3 → 1" button, which fixes the audit's unclear affordance.
  - **Ids:** `forge-panel` stays on the tab root.
- **Codex:**
  - **`CodexSections`:** Legendaries n/12, Reactions n/15 and Records.
  - **`CodexGrid`:** the section's cards (`codex-unknown`, `reaction-unknown`).
  - **`CodexDetail`:** the hovered or focused entry.
  - **Records:** the lifetime stats from `DelveCamp.tsx`.
  - **Ids:** `codex-panel` stays.
- **Deletes:** `ForgePanel.tsx`, `CodexPanel.tsx` and `runes/RunePouchPanel.tsx`. Their parts move into the panes.

**2D · Quests (placeholder) and the quest view.**

```ts
// features/delve/quests/types.ts — the view a future engine fills; nothing here is a rule.
export type QuestKind = 'main' | 'side' | 'bounty';
export interface QuestObjective { id: string; text: string; hint?: string; done: boolean; progress?: { value: number; max: number } }
export interface QuestReward { id: string; name: string; sub?: string; color: string }
export interface QuestView {
  id: string; kind: QuestKind; name: string; sub: string;
  chapter?: string; story?: string;
  /** An atlas sprite id for the giver's portrait. */
  giver?: string;
  objectives: QuestObjective[]; rewards: QuestReward[]; tracked: boolean;
}
export const MAX_TRACKED = 3;
/** v1: no quests. With localStorage `alloy:delve:questPreview` = "1", the fixture in sample.ts (tracking is local state). */
export function useQuests(): { quests: QuestView[]; setTracked: (id: string, on: boolean) => void };
```

**The tab:**
- **Journal** (`quest-journal`): grouped Main / Side / Bounties.
- **Detail:** the giver `PixelSprite` at scale 4, kind, chapter, name and story, then the objectives with check boxes, counts and progress bars.
- **Rewards**, and "Tracked on the HUD" (T / Y).
- **Empty state** (`quests-empty`), with no quests: "Quests arrive in a later update. The journal and the HUD tracker are ready for them." It keeps the three panes, drawn as dashed placeholders.

**`QuestTracker`** (for Phase 3), props `{ quests: QuestView[] }`:
- **Contents:** the tracked quests, up to three, each with its kind tag, name and objectives (box, text, count, a segmented bar).
- **Header:** "Quests" with J / View "Journal".
- **No quests tracked:** it renders `null`.

**Tests:** the tab's empty state and its preview render; the tracker shows up to three.

### Integration and E2E in Phase 2

The integrator wires the five tabs and deletes the interim column. The integrator also updates the specs the rebuild changes:
- **`delve.spec.ts`:** D02 (equip at the Anvil through the compare pane), D04 (the tabs render) and D08 (the mana choice and frost gear).
- **`delve-runes.spec.ts`:** R01 (socket in the inspector), R04 (fuse on the Rune pane), R05 and R06.
- **`delve-gamepad.spec.ts`:** G03; G06 (pick a skill with RS or LT/RT, a move and its kind); G07 (socket through the inline picker; B backs out).

**Unit tests:** `AbilitiesPanel.test.tsx` and `ManaPanel.test.tsx` move to the new panes, with the same assertions where the behaviour is unchanged.

**Bump:** `chore(client): bump version to 0.55.0`.

## Phase 3: The dive

### 3a · The HUD, the map and the zoom (v0.56.0)

#### The HUD grid

`HudGrid` sits under `.delve-ui` with `zoom: var(--hud-scale)`:
- **Frame:** `position: absolute; inset: 24px`, `grid-template-columns: 380px minmax(0,1fr) 340px`, `grid-template-rows: 48px minmax(0,1fr)` and a 16 px gap.
- **Top bar:** columns 1–2, row 1.
- **Right column:** column 3, rows 1–2.
- **Dock:** columns 1–2, row 2, `align-self: end`, 600 px wide.
- **Pointer events:** the grid has `pointer-events: none`, and only its panels and slots take them.

**Insets.** `HudGrid` reports the camera's insets in viewport px:
- `top` = the top bar's bottom edge
- `right` = window width minus the right column's left edge
- `bottom` = window height minus the life bar's top edge
- `left` = 0

The dock sits bottom-left beside a hero centred in the clear rectangle. At 1080p, the hero sits near (770, 520) and the dock's top near y 640.

#### Purse bar (`PurseBar`, glass)

**Contents, left to right:**
- **"Purse"**, then each resource with its swatch, the amount held and this dive's gain:
  - Scrap: `profile.scrap`, with `dive.bounty` in amber
  - Links: `+dive.linksEarned`
  - Mana Dust: `+dive.dustEarned`
  - Runes: `pouchCount`, `+dive.runesEarned`
  - Items: bag n / cap, `+diveDrops.length`
- **"+N banks on extract"** (`bounty` kept).
- **At the right end:** the Labels (Alt / hold LS) and Menu (Esc / Menu, `data-pad-menu`) hints. Clicking Menu opens the pause.

#### Skill dock (`SkillDock`, `skill-bar` kept)

`text-shadow: 2px 2px 0 #181425`; no box of its own.

**Skill rows.** Each of Q, E and R (`ability-<slot>` on the slot) is a 76 px steel slot in its element's border:
- **The slot:**
  - the move's icon as a pixel glyph
  - the bound glyph at the bottom-right corner (−14, −10)
  - rune dots at the top-left
  - a cooldown fill rising from the bottom with its seconds, shown also for a beat but without the seconds (the snapshot's `beat` flag)
  - a hold's charge as a tick bar
  - Galvanize's spark
  - `floatPay`'s spend, which floats from the slot
- **Beside the slot:** the name (22 px), the chain-step bar (16×5 segments) and the cost line ("16 mana · move 3 of 4", "charge 62%", "87 mana · cast"), amber when unaffordable.
- **Click:** casts the slot auto-aimed, as today's tap does.
- **Tooltip** (`SkillTooltip`): beside the row (left 380, 320 wide) on hover, on pad focus, or while the slot's own button is held. It shows the move's name, "move n of m · kind", Hit, Cost with the runes' load, Beat after, and the runes, all from `moveNumbers` and the hero's resolved chain.

**Row 2.** 56 px slots:
- Dodge (`dodge-button`), with charge pips and its refill
- Potion ×n (`potion-button`)
- Attack (`attack-button`; click = an attack tap; its glyph is LMB / RB)

Then the buff row (`BuffRow`): 38 px tiles for each `HudBuff` with its seconds left (Riposte, Galvanize, Quick, Barrier).

**Bars** (`Vitals`):
- **Life** (`hero-hp`): 32 px, green planks, with the barrier as a pale segment (`hp-barrier`) and the label "226 / 289 · barrier 34", inside a steel frame.
- **Mana** (`mana-bar`): 24 px, cyan with the stepped mana glow, and the label "74 / 102".
- **No-mana warning:** the old 8 px "mana" warning becomes the cost line's amber.

**Deletes from `ArenaHud.tsx`:** `TopHud`, `SkillBar`, `AbilityButton`'s pointer logic, `AttackButton`, `DodgeButton`, `ChainDots`, `HoldBar` and `RunePips` (redrawn in `arena/hud/`), and `keyHints` / `padHints`. `floatPay` and `BossBar` move to `arena/hud/`.

#### Right column (`FloorColumn`)

**Floor panel (glass):**
- **Header:** "Depth N" (`depth-label`) and the biome name.
- **Minimap:** 150 px tall, full width.
- **Resists and weakness:** two tiles (`biome-element`).
- **Counts:** "n foes left" (`monsters-left`) and the bounty.

**`Minimap`:**
- **Size:** a canvas sized by device pixels.
- **Fit:** the arena fitted at `floor(min(w/W, h/H))` px per unit and centred, the void left dark.
- **Drawn:**
  - the arena border (2 px `#3a4466`)
  - the camera's `view` (a 1 px `#2ce8f5` outline at 35%)
  - drops (2×2, rarity colour)
  - foes (2×2 `#e43b44`; elites 3×3; the boss 4×4 `#f77622`)
  - the hero (3×3 `#fee761`)
- **Redraw:** whenever `hud.map` changes (80 ms).

**Quests:** `QuestTracker` (null in v1).

**Found this floor** (`FoundLog`, `pickup-feed` kept on it):
- **Rows:** each pickup since `floorDropsFrom`, newest first: a rarity swatch, the name, and ▲ / ▼ / ◇ or "rune".
- **Overflow:** up to as many as fit, then "+n more".
- **Hover:** shows `ItemTooltip`.
- **Click:** in 3a, opens the existing `ItemDetailSheet`; in 3b, opens the pause on Loadout with the item. Each item row carries `loot-item`, as the feed's tiles do today, and `upgrades-locked`, `upgrades-potential` and `feed-rune` are kept.

#### Arena core and renderer (`useArenaCore.ts`, `ArenaRenderer.ts`, `camera.ts`)

```ts
// The snapshot additions (useArenaCore.ts)
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface HudMap {
  width: number; height: number;          // world.width, world.height (26 × 40 today)
  view: ViewRect;                          // renderer.viewRect()
  hero: { x: number; y: number };
  foes: { x: number; y: number; rank: 'normal' | 'elite' | 'boss' }[];   // from MonsterEntity.kind / world.bossId
  drops: { x: number; y: number; color: string }[];                      // RARITY_COLOR / rune colour
}
export interface HudBuff {
  id: 'riposte' | 'galvanize' | 'quick' | 'barrier';
  /** Seconds left (null: no timer), from riposteUntil, galvanizedAt + its window, quickUntil, barrier.until. */
  left: number | null;
  total: number | null;
}
// ArenaHud gains: buffs: HudBuff[]; map: HudMap
// ArenaRenderer: setInsets(insets: Insets): void; viewRect(): ViewRect; setLabelsHeld(held: boolean): void;
//                setUpgradeTest(isUpgrade: (item: GearItem) => boolean): void
// ArenaOptions.insets: Insets (was { top, bottom })
```

**Inputs.**
- **New actions.** `labels` (Alt / LS, a hold) and `journal` (J / View, a press) join `CONTROL_ACTIONS`, with defaults in `DEFAULT_CONTROLS`.
- **Routing.**
  - `padToArena` reports them, and `attachKeyboard` handles them (Alt's default is prevented).
  - `labels` calls `renderer.setLabelsHeld`.
  - `journal` clicks `[data-pad-journal]`, which opens the pause on Quests in 3b and does nothing in 3a.

**Loot plaques.** These follow decided item 22.
- **Drawing.** `syncDrops` makes a plaque per labelled drop: a `#181425` 86% fill, a 1 px rarity border at 60%, and the name in the rarity's text colour, with " ▲" for an upgrade.
- **The upgrade test.** `isUpgrade` is `compareItem(...).powerPct > UPGRADE_EPSILON`, computed once when the drop's view is made.

**Reduced motion.** Under `prefers-reduced-motion`, `shake` and `kick` stay 0.

**Touch.** The joystick branch and the "Drag to move" hint leave `ArenaControls.tsx`, and `aim-gestures.ts` and its test are deleted.

#### The zoom (decided in the spec)

**Today.**
- The rule is `unit = max(16, min(width / 13.5, playH / 15))` px per arena unit, where `playH` is the window height less the HUD's top and bottom insets.
- At 1920×1080 with today's insets (70, 190), `unit` is 54.7. That is 5.47 screen px per sprite pixel (`SPRITE_PIXEL` = 0.1), with 19.7 units of floor visible top to bottom.
- That scale isn't whole, so sprite pixels render 5 or 6 px wide.
- The view depends on the HUD's pixel insets, so it differs by resolution: 23.5 units at 720p, 18.3 at 1440p.

**v1** (`features/delve/arena/camera.ts`):

```ts
/** Arena units of window height the dive aims to show. Today's 1080p view is ~19.7; 25 is ~25% further out. Settings → View distance sets 20–30. */
export const ARENA_VIEW_UNITS = 25;
/** Render pixels per sprite pixel: whole, nearest to the target, at least 2. `renderH` = screen height × the renderer's resolution. */
export function spritePixelScale(renderH: number, viewUnits = ARENA_VIEW_UNITS): number {
  return Math.max(2, Math.round((renderH * SPRITE_PIXEL) / viewUnits));
}
```

**How the renderer uses it:**
- **Scale.** `resize()` sets `unit = spritePixelScale(height × resolution, uiStore.arenaViewUnits) / SPRITE_PIXEL / resolution`, from the window height alone. The insets no longer change the zoom.
- **Centre.** `update()` centres the camera in the clear rectangle that the four insets leave.
- **Position.** It rounds `root.position` to whole render pixels, so the sprites, the effect layers and the floor share one pixel grid.
- **Unchanged.** `PixelLayer` (10 px per unit, nearest) and the floor (`FLOOR_PPU` 5 × `FLOOR_SCALE` 2) already work in arena units.

**Results at device-pixel ratio 1:**

| Window | Today: px per sprite px, units tall | v1: px per sprite px, units tall | More floor shown |
|---|---|---|---|
| 1280×720 | 3.07, 23.5 | 3, 24.0 | +2% |
| 1280×800 (Deck) | 3.6, 22.2 | 3, 26.7 | +20% |
| 1920×1080 | 5.47, 19.7 | 4, 27.0 | +37% (scale −27%) |
| 2560×1440 | 7.87, 18.3 | 6, 24.0 | +31% |
| 3840×2160 | 12.7, 17.1 | 9, 24.0 | +41% |

**Rounding.**
- Whole scales are coarse at 1080p: 5 would show 21.6 units (+9%), and 4 shows 27.0.
- 4 matches "about 25% out" in scale terms (5.47 → 4 is −27%), so the rule rounds to nearest.
- At other ratios (1.25, 1.5, 2) the same rule runs in render pixels, so the result stays whole on the device.
- Width is not a constraint: every 16:9 or 4:3 window shows the arena's full 26-unit width.

**Ripple effects, each handled:**
- **Loot labels.** These are screen-space text sized by `--hud-scale`, not by the zoom, so they stay readable. More drops on screen means more plaques, hence the rare-and-above default, Alt for all, and the de-overlap pass.
- **The minimap's view box.** It draws `viewRect()`, which grows with the zoom (about 48×27 units at 1080p, clipped to the 26×40 arena).
- **Aim.** `stickAimPoint(…, aimReach)` works in arena units as a fraction of each move's range, so the zoom doesn't change it. Mouse aim and hold-to-walk go through `screenToWorld` and `pixelsPerUnit`, which follow the new `unit`. The walk's slow radius (0.6 units) stays the same in the world and shrinks on screen.
- **Mouse to world.** `screenToWorld` divides by `unit`, which is correct automatically. A unit test checks that a world point round-trips through `toScreen` and `screenToWorld` at each scale.
- **Off-screen work.** The renderer culls nothing today: entity views live for the whole floor, and Pixi draws them all. The two effect layers rasterise only `view` (about 1.9× the area at 1080p, 480×270 texels). `INFUSION_BUDGET` caps the infusion work whatever the view.
- **The pixel floor.** The worker paints the visible window, clipped to the floor's world (`floor-engine.ts` clamps `needW` and `x0`/`y0`). That means about 37% more rows at 1080p and the full width as now. Measure the worker's frame time (DevTools, a busy floor at depth 10, 1080p) before and after. If it passes 8 ms, lower the floor's `MAX_SCALE` work for off-centre rows before touching the zoom.
- **Tests.** No e2e or unit test reads the camera scale today. `delve.spec.ts` D06 checks the skill dock's box against the viewport, which is unaffected. New: `camera.test.ts` checks `spritePixelScale` against the table above, plus the minimum of 2.

**Tunable.** Settings → Display → View distance is a slider from 20 to 30 (`uiStore.arenaViewUnits`), showing its result, e.g. "4 px per pixel · 27 units tall". Many slider values round to the same scale at a given window; the readout says so.

#### Parallel areas in 3a

| Area | Owns | Codes against |
|---|---|---|
| **3A · HUD dock and top bar** | `arena/hud/HudGrid`, `PurseBar`, `SkillDock`, `SkillSlot`, `SkillTooltip`, `BuffRow`, `Vitals`, `BossBar`; `ArenaHud.tsx` deletions; `DelveRun.tsx` layout; `ArenaHud.test.tsx` rewrite | `ArenaHud` with `buffs` (3C) |
| **3B · Right column** | `FloorColumn`, `Minimap`, `FoundLog`; `delveStore.floorDropsFrom`; `QuestTracker` wiring | `HudMap` (3C), `QuestTracker` (2D) |
| **3C · Arena core and renderer** | `camera.ts`, `ArenaRenderer.ts`, `useArenaCore.ts` (snapshot, insets, labels, journal), `ArenaControls.tsx`, `controls.ts`, `arena-pad.ts`, `input.ts`, `uiStore.arenaViewUnits`, Settings → View distance | `Insets`, `HudMap`, `HudBuff` above |

```ts
// The 3A ⇄ 3B ⇄ 3C seams
export interface HudGridProps {
  top: ReactNode;          // PurseBar (dive) or TrainingBar (3F)
  right: ReactNode;        // FloorColumn (dive) or the Training dock (3F)
  dock: ReactNode;         // SkillDock
  onInsets: (insets: Insets) => void;   // → useArena's insets option
  testId?: string;
}
export interface SkillDockProps {
  hud: ArenaHud | null;
  onCast: (slot: 0 | 1 | 2) => void;
  onDodge: () => void;
  onPotion: () => void;
  onAttack: () => void;
}
export interface FloorColumnProps {
  dive: DiveState | null;        // null in the Training Grounds
  biome: BiomeDef;
  hud: ArenaHud | null;
  quests: QuestView[];
  onInspect: (uid: string) => void;
  onJournal: () => void;
}
```

**E2E in 3a:**
- **`delve.spec.ts`:** D01 (`depth-label`, `monsters-left` kept), D02 (inspect a pickup from the Found log, `pickup-feed`), D06 (`skill-bar` within the viewport).
- **`delve-runes.spec.ts`:** R02 (rune dots on `ability-0`).
- **`delve-gamepad.spec.ts`:** G02 (the glyphs switch: assert the pad glyph's text in `ability-0`), G04.
- **New:** a hold-Alt plaque test in `arena-renderer.test.ts`.

**Bump:** `chore(client): bump version to 0.56.0`.

### 3b · Pause, stop and Training (v0.57.0)

**3D · Pause (parallel).**
- **What it renders.** `DelveRun` renders `<AnvilHub mode="pause" />` over the dimmed arena when `menuOpen`. `paused` keeps today's meaning, so `setArenaLive` still flips in the layout effect.
- **Header:** "Paused", "Depth N · biome · n foes left", the Tabs (Forge disabled at 45%, with a tooltip "Forge at the Anvil"), and the note "Gear is locked until you are back at the Anvil".
- **Tabs:** Loadout, Skills, Codex and Quests browse read-only (`mode: 'pause'`):
  - the compare pane's actions become "Locked during the dive" (`equip-locked`)
  - bag tiles found this dive show NEW
  - the chain editor is locked by the engine's `isDiveActive`, as today
- **Footer:** Inspect, Full compare and Tabs prompts, then Controls (`open-controls`), Settings, "Anvil · floor restarts", "Abandon · lose bounty" (danger) and Resume (hot metal, Esc / Menu, `data-pad-back` and `data-pad-menu`, first focus).
- **Retired:** the kebab menu (`DelveRun.tsx` lines 284–319).
- **Attack mode.** "Basic attack: Auto / Manual" moves into `ControlsPanel` (`attack-mode-toggle` kept).
- **Journal.** View / J opens the pause on Quests, via `[data-pad-journal]` on the purse's Journal hint.
- **Found log.** Its clicks open the pause on Loadout with the item.
- **Deletes:** `ItemDetailSheet.tsx` and its test. Its pieces live in `items/`, with tests.

**3E · Stop and summary (parallel).**
- **What it renders.** `StopScreen` (`door-choice` kept on its root) replaces the `choosing` overlay.
- **Header:** the biome label, "Depth N cleared", then "n scrap bounty", "n items" and "n rune".
- **Grid:** `380px minmax(0,1fr) 420px`, padding 56 / 72.
- **Left, "Found this floor":** rows from `floorDropsFrom` with a tile, name, kind and ▲ / ▼, then "Banked when you leave this stop". It replaces `LootTray`; `loot-item`, `loot-runes` and `loot-rune` are kept on its rows.
- **Centre, power-ups** (`stop`, or `stop-taken` once taken):
  - "Take one power-up · or skip it".
  - One plate card per offered kind (`stop-<kind>`): the kind label, title, text and its price line.
  - **Expansion.** Taking a card with a choice expands it in place to its picker (`stop-picker` on the expanded pane, Back = Esc / B). The pickers keep their code: `EquipPick`, `SlotPick`, `MovePick` (the one-column `ChainEditor`), `UpgradePick` and `RunePick` (the inline rune list; `stop-rune-move-<skill>-<i>` kept).
  - The `createPortal` sheet goes.
- **Right, "Choose your path":** each door as a plate button (`door-<id>`) with an 84×96 door frame and its art: the biome's first monster `PixelSprite` at 4, the chest glyph for a treasure door, or the hero for Extract (`extract-button`).
- **Below the doors:** "Life n% · n potions" and "Drink potion" (`door-potion`).
- **Footer prompts:** Take, Inspect item, Skip power-up and Menu.
- **Summary.** `DiveSummary` and `LegendaryFanfare` take the kit (`Screen` with `arena-stop`, plates, hot-metal "Return to the Anvil"). Their content and ids are unchanged.
- **Deletes:** `DoorChoice.tsx`, `LootTray.tsx` (and their tests' assertions moved to `StopScreen`) and `.delve-sheet`.

**3F · Training Grounds (after 3A merges; parallel with 3D and 3E).**
- **Layout.** `DelveTraining.tsx` uses `HudGrid`:
  - **`top`:** a `TrainingBar` (glass): "◂ Anvil" (`training-back`, the only one), `DepthLabel`, `MeterChip`, "DPS Lab" (dev) and "Panel" (`training-panel-toggle`).
  - **`right`:** the `TrainingPanel` dock at 400 px, or nothing when closed.
  - **`dock`:** the same `SkillDock`.
- **Arena width.** The arena no longer narrows; the dock's inset centres the camera.
- **The panel:**
  - kit Panel and Tabs (`training-tab-<id>`, level `top` on this screen)
  - its Abilities tab keeps the one-column `ChainEditor`
  - Targets keeps native selects restyled by the kit
  - `PanelLayout`, `openLayout`, `DOCK_MIN_WIDTH` and the sheet path go
  - `training-panel-exit` goes with the panel's second Anvil button
- **Pad.** View focuses the dock (`data-pad-scope`) and pauses the sandbox. B, or Panel again, returns.
- **Esc.** Opens the `SystemMenu` with an extra "Anvil" entry.
- **Ids:** `training-panel` and `training-panel-close` are kept.

**Contracts in 3b.**
- **Hub.** 3D uses `AnvilHub` and `HubTabProps.mode` as Phase 2 built them. It adds no props, only the pause header and footer.
- **Stop.** 3E uses `StopPanel.tsx`'s pickers as they are, exported.
- **Training.** 3F uses `HudGridProps` and `SkillDockProps` from 3a.

**E2E in 3b:**
- **`delve.spec.ts`:** D01 (pause, then return); D02 (a `loot-item` click opens the pause, and `equip-locked`'s text becomes "Locked during the dive"); D03 (the stop screen); D05 (`attack-mode-toggle` in Controls, from the pause); D07.
- **`delve-runes.spec.ts`:** R03 (the stop's rune card expands; `stop-picker`).
- **`delve-gamepad.spec.ts`:** G01 (Menu opens the pause with Resume focused; A presses it; B resumes), G05 (rebind from the pause's Controls).
- **`delve-training.spec.ts`:** T01 and T02, with T01's top-bar geometry check now on `TrainingBar`.

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
  - **Dead space.** It is skipped over the arena (`deadSpace: { minRatio: 0 }` on the dive specs).
  - **Minimum size.** A Delve mode in `min-size.ts` checks text ≥ 10 px CSS and click targets ≥ 24×24 CSS px, the WCAG 2.2 target-size minimum.
- **New specs:** `e2e/responsive/specs/delve-anvil.spec.ts` (each tab), `delve-dive.spec.ts` (the HUD, autopilot), `delve-pause.spec.ts`, `delve-stop.spec.ts` and `delve-training.spec.ts`, each over `PC_VIEWPORTS`.
- **Unchanged:** the classic specs keep `VIEWPORTS`.
- **Gate:** `pnpm --filter @alloy/client run test:responsive` passes with zero Delve failures.
- **Playwright projects:** the phone projects ignore `delve*.spec.ts` (since Phase 1). A `desktop-1080` project (1920×1080) runs the Delve e2e alongside `desktop` (1280×800).

**4B · Docs and the DPS Lab (parallel).**
- **DPS Lab.** `DelveLab.tsx` takes the kit `Screen` (wall), a band header with kit `Tabs` (`lab-tab-<v>`) and "◂ Training" (`lab-back`), kit `Chip`s for the filter rows, and `Panel`s around the chart and table. Its native selects and the chart stay. R07 is unchanged.
- **`CLAUDE.md`, the Delve section.** Rewrite these:
  - the client paragraph: hub tabs and panes, the pause, the stop, the HUD grid, the kit, the prompt runtime and input map, `--ui-scale`, and the zoom constant
  - the Training Grounds paragraph: the dock
  - the controller paragraph: X, Y, View, LS, the sub-tabs on LT/RT, `data-pad-first` and `data-pad-journal`
  - Add the kit's location and the "copy the mockups' design px" rule.
- **Memory notes.** `project_responsive_system.md` and `project_responsive_testing.md` note that the Delve uses design px under `--ui-scale`, not the `--frame-h` tokens, and the PC viewport list.

**Bump:** `chore(client): bump version to 0.57.1` (the Lab is dev-only, so this is a patch).

## Accessibility

**Contrast** (WCAG 2.1, computed for this spec):

| Pairing | Ratio | Use |
|---|---|---|
| `#ffffff` on `#262b44` | 13.89 | body on steel |
| `#c0cbdc` on `#262b44` | 8.48 | secondary text |
| `#8b9bb4` on `#262b44` | 4.93 | captions and labels on steel |
| `#8b9bb4` on `#181425` | 6.39 | captions on a well |
| `#8b9bb4` on `#3a4466` | **3.39** | not allowed as text; chips use `#ffffff` (9.55) |
| `#fee761` on `#262b44` | 11.13 | the active tab, headings |
| `#feae34` on `#262b44` | 7.49 | amber warnings |
| `#2ce8f5` on `#262b44` | 9.24 | mana values |
| `#63c74d` on `#262b44` | 6.49 | gains, ▲ |
| `#e43b44` on `#262b44` | **3.31** | ▼ glyphs only (non-text needs 3:1); loss text uses `#f6757a` (5.12) |
| `#f6757a` on `#3e2731` | 5.03 | danger button text |
| `#3e2731` on `#feae34` | 7.35 | hot-metal button text |
| `#ead4aa` on `#733e39` | 5.85 | plank button text |
| `#ead4aa` on `#5c3434` | 7.26 | footer prompts on wood |
| `#193c3e` on `#63c74d` | 5.58 | "Equip best" text |
| rarities on `#181425` | 11.00 / 8.41 / 5.64 / 14.43 / **3.83** / 6.49 | common, uncommon, magic, rare, epic, legendary as tile borders and text on wells |
| `#b55088` on `#262b44` | **2.96** | epic never as text on steel; it uses `#f6757a` (5.12) |
| `#0099db` on `#262b44` | **4.35** | magic text on steel only at display sizes ≥ 22 px (large text, 3:1) |
| pad glyph ink `#181425` on A / B / X / Y / neutral | 8.41 / 4.30 / 5.64 / 14.43 / 11.00 | glyphs |
| `#5a6988` on `#262b44` | 2.52 | disabled only (exempt) |

**Other rules:**
- **Focus.** One visible ring for keys and pad (above). Every hub control is reachable by Tab and by the D-pad. Tooltips open on focus as well as hover.
- **Motion.** Reduced motion follows decided item 14. The existing global `animation-duration: 0s` rule covers CSS animations, and kit WAAPI animations check the media query, as `floatPay` already does.
- **Text size.** Caption 14 design px is the smallest body text, at least 10.5 CSS px at the 0.75 floor. Silkscreen 11 appears only in uppercase labels.

## Constraints kept

- **Engine split.** The engine owns rules and numbers, and the UI re-presents engine values: `resolveChain`, `moveNumbers`, `compareItem`, `itemStatLines`, `profileStats`, `heroPower`, `draftPrice`, `manaSupport`, `chainCycle` and the price functions. Nothing is recomputed in the client.
- **Renderer.** Pixi stays the arena renderer, and the HUD is DOM over it that reports its insets.
- **The input lock.** `inputDeviceStore`, `claimDevices` (the 16 px mouse threshold), one pad reader with one owner per press (`setArenaLive` in a layout effect), and focus never dropping under the pad (`keepFocus`). Every new screen and overlay is a `data-pad-scope` with a pad-reachable first focus, and it keeps the focus when its content unmounts. The stop's inline pickers return the focus to their card on Back, as `StopPanel` does today.
- **The pad markers** keep their meaning: `data-pad-scope`, `data-pad-back`, `data-pad-tabs` and `data-pad-menu`. The new ones are `data-pad-tabs="sub"`, `data-pad-first` and `data-pad-journal`.
- **The locked Draft screen and the classic Arena** are untouched.
- **Saves.** Persisted saves keep their shape. New keys live only in `uiStore` (`alloy:delve:hudScale`, `alloy:delve:viewUnits`) and in `ControlsConfig`'s two new actions, which `parseControls` fills with defaults.

## Every phase's gate

Before each release:
- `pnpm -F @alloy/engine build` (only Phase 2 changes the engine)
- `pnpm -F @alloy/client build` (it typechecks) and `test`
- the Delve e2e on `desktop` (and on `desktop-1080` from Phase 4)
- a manual pass at 1280×720, 1920×1080 and 2560×1440 with mouse and keys, then with a pad
- the version bump in `packages/client/package.json` with its `chore(client)` commit

Phase 2 also runs `tests/delve-pacing.test.ts`. `chainCycle` changes no balance, but the run confirms it.

## Appendix A: forge theme CSS (from the mockups' helmet)

Copied verbatim from `Main.dc.html` and `Arena-HUD.dc.html`, the source for `kit.css`. Selectors are the mockups' own. Port the values, not the `!important` or the attribute-selector hooks, which only re-skinned the mockup's inline styles. The blob URLs were the atlas and an arena screenshot.

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

## Open questions for the user

1. **Epic as text.** Epic item names and text in `#f6757a` (pink) instead of `#b55088`, which fails contrast as text on steel (2.96:1). Borders and swatches keep `#b55088`. Is that acceptable, or should epic text sit only on dark wells at display size, where `#b55088` passes 3:1?
2. **Nested tabs on the pad.** Should nested tab lists step on LT/RT (this spec) or on the bumpers? The decision said bumpers, but the bumpers then can't also step the hub's tabs without a focus-dependent rule.
3. **Stop cards.** The mockup's cards name a specific item ("Upgrade · Ember Fang"). The engine offers kinds, so v1 cards name the kind and the pick happens in the expanded card. Should the engine pre-pick a suggestion per card? That would be an engine change.
4. **The 1080p zoom.** At 1080p the nearest whole scale gives 27 units tall (+37% floor, a 27% zoom-out). The alternative, 21.6 units (+9%), is barely different from today. View distance can tune it, but the steps are coarse. Is 4 px per pixel right at 1080p?
5. **The 0.75 UI-scale floor at 1280×720.** It keeps captions at 10.5 px or more, but the hub's panes scroll a little there instead of matching the 1080p mockup exactly. Is that acceptable, or should 720p scale purely (captions at 9.3 px)?
6. **Y on Skills.** Y taps to remove a move and holds to apply, as the mockup shows. Keep both on Y, or move Remove elsewhere?
7. **Quest preview flag.** Keep the dev-only `alloy:delve:questPreview` fixture so the board and tracker can be seen before quests exist?
