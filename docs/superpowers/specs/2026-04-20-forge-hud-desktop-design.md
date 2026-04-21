# Forge HUD Desktop Redesign

**Date:** 2026-04-20
**Status:** Draft
**Scope:** Redesign the Forge screen as a desktop-first HUD layout targeting Steam-quality feel. Establish the pattern for gem-dense screens (Forge, Draft, Inspect) so stockpile density is consistent across phases. Mobile portrait is explicitly deferred.

## Problem

The Forge screen today is a portrait-first (9:16) layout that letterboxes on desktop (~608px wide inside a 1920×1080 window) and still feels cramped inside that frame:

- Equipped sockets overflow their half-card columns at the shared stockpile gem size, forcing a horizontal scrollbar inside the items scroll ancestor ([fixed 2026-04-20](../../../packages/client/src/components/ItemSocketView.tsx) via a local `--gem-size` scope — but the underlying tightness remains).
- The items area is a scroll-container: only the first row of sockets is visible without scrolling; the equipped-affix list below the sockets is entirely out of view in most run-mode states.
- Stockpile gems use `--gap-md` (~14px) in a 4-column grid, leaving noticeable empty space between gems and between rows — wastes area on wide screens and looks "mobile stretched."
- On 1920×1080 monitors the Steam-target audience will be using, ~60% of horizontal pixels are solid black letterbox.

The project is targeting Steam (see `project_steam_target.md`); desktop parity is a first-class requirement, not a polish pass. The previous responsive-sweep (2026-04-17) deferred "Option B" — widening aspect for desktop — to a dedicated spec. This is that spec.

## Goals

- All Forge UI visible on a single 1200×900 desktop viewport with no scrolling, in both empty and fully-socketed states.
- Desktop-native HUD layout that reads as a crafting station, not a mobile form. Full-bleed (no letterbox) at desktop widths. Anchored panels rather than vertically stacked sections.
- Tighter, more consistent gem density across Forge and Draft (and anywhere else a gem stockpile grid appears).
- Establish a reusable "desktop HUD" layout pattern that subsequent phase screens (Draft, Duel) can adopt incrementally without requiring another full redesign.
- Preserve the existing engine/store contracts (`forgeStore`, `matchStore`, `ForgePlan`, gateway actions) — this is a UI refactor, not a logic refactor.

## Non-Goals

- Mobile portrait polish. The existing portrait layout stays as-is for viewports under the desktop breakpoint. A separate "mobile revisit" pass is planned after this lands.
- Draft and Duel layout changes beyond stockpile density alignment. Draft gets the same gem-grid tightening; its pool/opponent regions are out of scope.
- Real art assets. Ambient backdrop, weapon/armor silhouettes, and gem art remain CSS/placeholder in the first implementation. Real art is a parallel track that will swap into the same regions.
- Engine or data-model changes. Sockets still store `EquippedSlot[]`; affixes still resolve through the existing registry.
- Animation polish beyond what the existing token system supports.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Target surface priority | Desktop-first; mobile deferred | Steam target; user explicit (2026-04-20). One-pass density work is higher leverage than trying to serve both surfaces in the same redesign |
| Layout direction | "HUD" (full-bleed, docked panels) | Selected from 3 mockup directions (Portrait+, Workshop 2-col, HUD). Most Steam-native; leaves the most room for real art to land without layout churn |
| Desktop breakpoint | Aspect ratio, not width | Current frame clamps to 9:16 via `@media (min-aspect-ratio: 9/16)`. Add a second clamp: at `(min-aspect-ratio: 4/3)` release the frame to full-bleed. Below that, mobile portrait as today |
| Socket layout | Rectangular grid (2×3 weapon, 3×2 armor) | User preference (2026-04-20). Silhouette-with-socket-points was considered but rejected in favor of grid; clearer spatial mapping to the affix list |
| Stockpile layout | 2-row grid, up to ~5 cols | User preference (2026-04-20) over 1-row hotbar. Reduces scrolling pressure as inventory grows mid-forge |
| Affix list placement | Below each item's socket grid, in socket reading order | 1:1 spatial mapping (socket position ↔ affix line) — easier to trace what each gem contributes than a free-form list |
| Ambient backdrop | CSS placeholder now; real art swap later | Decouples layout landing from art production. The backdrop region is a single positioned layer behind the UI; art replaces the CSS fills |
| Component approach | Extract layout regions as new components; keep existing `ItemSocketView` / `CombineWorkbench` / `ForgeGemTray` / `ForgeHeader` (minor prop additions only) | Isolates HUD-specific composition from the gem-rendering primitives. The primitives stay usable in mobile + other screens |

## Architecture

### Layout Regions (desktop 1200×900)

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOPBAR                                                             │
│  lives · VS AI T2 · Round 1/10 · ★ 0            FORGE PHASE   DONE  │
├──────────┬───────────────────────────────────────────────┬──────────┤
│  LEFT    │  CENTER — gear workspace                      │  RIGHT   │
│  RAIL    │                                               │  RAIL    │
│          │  ┌─ MACE (WEAPON) ─────────────────────────┐  │          │
│  HP  258 │  │ stats · sockets 2×3 · affix list       │  │  FLUX    │
│  DMG 12  │  └────────────────────────────────────────┘  │  7/20    │
│  ARM 36  │  ┌─ PLATE (ARMOR) ─────────────────────────┐  │  Boost   │
│  CRT  0  │  │ stats · sockets 3×2 · affix list       │  │  Reroll  │
│          │  └────────────────────────────────────────┘  │  Rarity  │
│  W STR   │                                               │          │
│  W VIT   │                                               │          │
│  A VIT   │                                               │          │
│  A STR   │                                               │          │
├──────────┴───────────────────────────────────────────────┴──────────┤
│  COMBINE WORKBENCH (docked)                                         │
│  KEEP + slot + slot ▶ result              COMBINE   CLEAR           │
├─────────────────────────────────────────────────────────────────────┤
│  STOCKPILE (2 rows × 5 cols, tight gaps)                            │
│  ◆ ◆ ◆ ◆ ◆                                                         │
│  ◆ ◆ ◆ ◆ ◆                                                         │
├─────────────────────────────────────────────────────────────────────┤
│  TAB BAR                                                            │
└─────────────────────────────────────────────────────────────────────┘
```

Ambient backdrop (anvil silhouette + embers) sits behind all panels, dimmed enough that UI stays legible. Panels are opaque-enough-with-gradient surfaces over the backdrop.

### Responsive Strategy

Two CSS thresholds, one JS signal, applied in `AppShell` / `.app-frame`:

| Viewport aspect | Frame treatment (CSS) | Layout mode (JS signal) | Notes |
|-----------------|----------------------|-------------------------|-------|
| `< 9/16` (portrait-ish) | Full-bleed, no letterbox | `portrait` | Existing mobile layout, unchanged |
| `9/16` ≤ aspect `< 3/2` | Letterboxed 9:16 | `portrait` | Existing letterbox + mobile layout, unchanged |
| `≥ 3/2` (desktop landscape) | Full-bleed, no letterbox | `desktop` | **New** — this spec |

The two CSS thresholds are independent knobs: the 9:16 letterbox media query already exists and keeps doing what it does today. The new `(min-aspect-ratio: 3/2)` rule releases the letterbox for desktop. The JS signal (`frame-mode: 'portrait' | 'desktop'`) is binary and drives the component-level branch.

**Threshold rationale:** `3/2` (1.5) was chosen over `4/3` (1.333) so iPad landscape (1024×768 = exactly 4:3) stays on portrait. The HUD layout needs ≥1100px horizontal to fit comfortably and tablets don't hit that even in landscape.

The desktop HUD layout is implemented as a conditional branch inside `Forge.tsx`, selected by a `useFrameMode()` hook. The hook reads the signal that AppShell publishes: today's ResizeObserver already writes `--frame-h` on `:root`; it will be extended to also write `--frame-w` and `data-frame-mode="portrait" | "desktop"` based on the width/height ratio.

**Sizing token convention:** HUD layout tokens (rail widths, stockpile height, etc.) are defined in terms of `--frame-h`, not `--frame-w`. This is intentional and aspect-locked — scaling everything off one reference keeps proportions consistent, and desktop HUDs at any width look balanced relative to their height. Width-proportional sizing would make ultrawide monitors produce unreasonably wide rails.

### Component Changes

New components (all under `packages/client/src/components/forge-desktop/`):

- `ForgeDesktop.tsx` — desktop HUD shell, composes the regions. Consumes the same props the existing Forge orchestrator collects from stores, so `Forge.tsx` becomes a thin switch between portrait and desktop trees.
- `ForgeTopBar.tsx` — desktop topbar (merges `ForgeHeader`'s responsibilities into the topbar span). Portrait keeps `ForgeHeader`.
- `CharacterRail.tsx` — left rail with stats readout + base-stat selectors. Takes `derivedStats` + stat-change callbacks.
- `FluxRail.tsx` — right rail with flux meter + 3 flux actions. Takes `currentFlux`, `maxFlux`, action dispatchers.
- `GearWorkspace.tsx` — center region wrapping two `ItemSocketView` instances plus their affix lists.
- `SocketedAffixList.tsx` — the new affix-line list that sits below the socket grid, iterating in socket reading order with element-colored dots, affix names, and stat values.
- `CombineDock.tsx` — re-composes `CombineWorkbench` inside a docked bottom-center panel.
- `StockpileStrip.tsx` — 2-row × ≤5-col stockpile grid with empty-cell placeholders when inventory is sparse. Uses the existing `ForgeGemTray` gem primitive rendering.

Touched existing components (light prop additions only, no logic changes):

- `Forge.tsx` — reads frame mode, branches to desktop vs portrait tree. Stockpile size computation moves into `StockpileStrip`.
- `ItemSocketView.tsx` — exports its inner socket grid as a `<SocketGrid>` subcomponent so the desktop `GearWorkspace` can consume the grid without the card chrome. The existing ResizeObserver logic that computes the local `--gem-size` for socket fit (added 2026-04-20) moves into `<SocketGrid>` so both the portrait `ItemSocketView` and the desktop `GearWorkspace` get adaptive sockets without duplicating the observer. Existing portrait behavior preserved.
- `CombineWorkbench.tsx` — accepts an optional `layout: 'portrait' | 'desktop-dock'` prop to adjust padding/spacing. Prop name deliberately avoids `variant` because `HapticButton` inside already owns a `variant` prop for its color scheme and overloading terms gets confusing. Logic unchanged.
- `AppShell` — extends the ResizeObserver to publish `data-frame-mode` on `:root`. Media queries in `index.css` release the letterbox at `(min-aspect-ratio: 4/3)`.

### Design Tokens

Additions to `index.css`:

```
/* Desktop HUD layout tokens */
--hud-rail-w:        clamp(140px, calc(var(--frame-h, 812px) * 0.20), 220px);
--hud-workbench-h:   clamp(100px, calc(var(--frame-h, 812px) * 0.14), 150px);
--hud-stockpile-h:   clamp(180px, calc(var(--frame-h, 812px) * 0.26), 280px);
--hud-topbar-h:      clamp(44px,  calc(var(--frame-h, 812px) * 0.06), 70px);

/* Gem density — tighter variant for HUD stockpile and any other dense grid */
--gem-gap-tight:     clamp(4px, calc(var(--frame-h, 812px) * 0.006), 8px);

/* Socket grid size — own clamp, smaller than stockpile gems */
--socket-gem-size:   clamp(52px, calc(var(--frame-h, 812px) * 0.085), 88px);
```

No changes to existing tokens. Portrait path keeps using them exactly as-is.

### Data Flow

Unchanged. The desktop tree consumes the same selectors from `forgeStore` and `matchStore`, dispatches the same gateway actions. Only the render topology changes.

## Testing Strategy

- Unit tests: the new layout components are pure-composition — snapshot tests are low value; skip. Existing unit tests for `ItemSocketView`, `CombineWorkbench`, `ForgeGemTray`, and the stores cover logic already.
- Responsive harness: add two desktop-HUD specs to `packages/client/e2e/responsive/specs/` — `forge-desktop-equip.spec.ts` and `forge-desktop-combine.spec.ts`. Both run the full probe matrix across the 13-viewport set. The existing portrait specs keep running for viewports below the 4:3 aspect threshold.
- New probe (cheap to add): a `forge-desktop-all-visible` probe that asserts both socket grids, both affix lists, the combine workbench, the flux meter, and **both stockpile rows** (the whole 2-row grid, including empty-placeholder cells) are rendered inside the frame without `scrollHeight > clientHeight`. Asserting both rows rather than just the first catches regressions where the panel collapses back to one row under tight conditions.
- E2E smoke: one Playwright test that lands in the desktop HUD, socks a gem into a weapon slot, and verifies the affix list updates — confirms the desktop tree dispatches gateway actions identically to the portrait tree.
- Visual check (manual): verify empty and fully-socketed states at 1280×800, 1920×1080, 2560×1440, ultrawide 2560×1080.

## Open Questions

- **Real art swap timing** — this spec ships with CSS placeholder backdrop/silhouettes. When real art is ready, does it land alongside this spec's implementation or as a follow-up commit? Defaulting to follow-up so we can land the layout first and iterate on art separately. Flag for the implementation plan.
- **Gem Library panel** — still accessed via the top-right link. Behavior unchanged in this spec; it opens over the HUD. If it needs its own desktop layout that's a separate spec.
- **Keyboard / focus flow** — the HUD introduces new tab-order surface area (left rail dials, right rail flux actions, docked combine, stockpile strip). Today's portrait Forge relies on pointer interaction almost exclusively; no explicit tab order spec exists. This spec keeps the focus model simple (natural DOM order top-left → bottom-right, no roving tab index, no arrow-key grid nav), and a full keyboard/controller pass is deferred to a follow-up spec. Flag for the implementation plan: ensure all interactive elements are focusable and hit the natural DOM-order path, nothing more.

## References

- Mockups (point-in-time): `.superpowers/brainstorm/forge-redesign/mockup-c-hud-v2.html` (empty state) and `mockup-c-hud-v2-filled.html` (fully socketed)
- Earlier directions explored but rejected: `mockup-a-portrait-plus.html`, `mockup-b-workshop.html`, `mockup-c-hud.html` (v1)
- Prior work: `docs/superpowers/specs/2026-03-31-responsive-token-system-design.md`, `docs/superpowers/specs/2026-04-16-responsive-device-testing-design.md`
- Related project memories: `project_steam_target.md`, `project_desktop_first.md`
