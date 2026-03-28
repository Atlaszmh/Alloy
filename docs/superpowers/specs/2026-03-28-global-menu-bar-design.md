# Global Menu Bar & Dev Tools — Design Spec

**Date:** 2026-03-28
**Status:** Draft

## Overview

Add a persistent bottom tab bar across all app phases, a settings drawer that works without leaving the game, a confirm-leave dialog for active matches, and a dev-only debug menu for rapid phase/animation testing.

## Architecture

### AppShell Layout

A new `AppShell` component wraps all routes via a React Router layout route. It replaces the existing `app-shell` / `app-frame` wrapper divs in `App.tsx` — the AppShell component takes over their layout responsibilities (full viewport height, flex column).

```
<AppShell>
  ├─ <main>              flex-1, overflow-y-auto — page content
  │   └─ <Outlet />      React Router renders current page
  ├─ <TabBar />           fixed bottom, 46px
  ├─ <SettingsDrawer />   slides up when open
  ├─ <DevDrawer />        slides up when open (dev mode only)
  └─ <ConfirmLeaveDialog />
</AppShell>
```

**Route changes in App.tsx:**

```tsx
// Before: flat routes
<Route path="/" element={<MainMenu />} />
<Route path="/settings" element={<Settings />} />
...

// After: layout route wrapping all pages
<Route element={<AppShell />}>
  <Route path="/" element={<MainMenu />} />
  <Route path="/settings" element={<Settings />} />
  ...
</Route>
```

Existing per-page "Back" buttons on Settings, Leaderboard, Collection, Profile, and RecipeBook are removed — the tab bar handles navigation globally. The MainMenu Settings button is also removed since Settings is now accessible via the tab bar.

The `<main>` element gets `padding-bottom: 46px` to prevent content being obscured by the tab bar.

## Components

### 1. TabBar

**File:** `packages/client/src/components/TabBar.tsx`

**Visual spec:**
- Height: 46px
- Background: `linear-gradient(180deg, #1a1d25, #12141a)` (solid dark gradient)
- Top edge: 1px with `linear-gradient(90deg, transparent, rgba(212,168,52,0.4), transparent)` (gold accent)
- Shadow: `0 -4px 16px rgba(0,0,0,0.5)` (upward)
- Icons: 18px, SVG outline style
- Active tab: gold stroke (`--color-accent-400`), 2px gold indicator bar above icon, 9px uppercase label shown
- Inactive tab: gray stroke (`#6b7280`), no label (keeps bar thin)
- Dev tab: green accent (`#22c55e`), only visible when dev mode is enabled

**Tabs:**

| Tab | Icon | Action | During Active Game |
|-----|------|--------|-------------------|
| Home | House | Navigate to `/` | Confirm dialog |
| Ranks | Trophy/podium | Navigate to `/leaderboard` | Confirm dialog |
| Settings | Gear | Open SettingsDrawer | No confirm (overlay) |
| Dev | Code brackets | Open DevDrawer | No confirm (overlay) |

**Active game detection:**
- Current route matches `/match/:code` and phase is not `complete`
- Also applies on `/queue` when the player is actively searching/waiting
- When active: Home and Ranks taps open `ConfirmLeaveDialog` instead of navigating
- On `/queue`, leaving calls `leaveQueue()` before navigating
- On PostMatch (route is `/match/:code` but phase is `complete`): no confirm needed, navigate freely

**Dev tab visibility:**
- Visible when `import.meta.env.DEV` is true OR `uiStore.devMode` is enabled
- `devMode` flag toggled via a button on the MainMenu (see below)

### 2. SettingsDrawer

**File:** `packages/client/src/components/SettingsDrawer.tsx`

**Behavior:**
- Triggered by tapping the Settings tab
- Slides up from the tab bar edge, covers ~60% of screen height
- Semi-transparent dark backdrop (`rgba(0,0,0,0.5)`), tap backdrop to dismiss
- Swipe-down to dismiss (optional, nice-to-have)
- Content: identical to current Settings page sections (Accessibility, Feedback, Audio, Developer)

**Implementation:**
- Extract settings content from `pages/Settings.tsx` into a shared `SettingsContent` component
- `SettingsDrawer` renders `SettingsContent` inside a slide-up panel
- The standalone `/settings` route also uses `SettingsContent` (for direct URL access)
- Works identically during active games and on non-game screens — no navigation occurs
- Promote `colorblindMode` and `hapticEnabled` from local `useState` in Settings.tsx to `uiStore` so state persists when the drawer unmounts
- Both drawers (Settings and Dev) auto-close on route navigation

### 3. DevDrawer

**File:** `packages/client/src/components/DevDrawer.tsx`

**Behavior:**
- Same drawer pattern as SettingsDrawer (slides up ~60%, backdrop dismiss)
- Only rendered when dev mode is active

**Sections:**

**Jump to Phase:**
- Buttons: Draft, Forge, Duel, Adapt, PostMatch
- Each calls `matchStore.startLocalMatch()` with a fixed seed and default AI tier, then navigates to `/match/ai-{randomId}`
- The `ai-` prefix is what `useMatchGateway` uses to route to `LocalGateway` — no new prefix needed
- To jump to a specific phase, the dev drawer advances the match state programmatically after creation (dispatch actions to skip phases)

**Animations:**
- Trigger swoop animation
- Trigger phase transition overlay (with phase name selector)
- Trigger celebration overlay

**Debug:**
- Toggle debug overlays (reuses existing `uiStore.toggleDebug`)

**Reset:**
- Reset current match state (clears matchStore, navigates to `/`)

**Extensibility:** Designed as a simple vertical list of sections with buttons — easy to add more tools later.

### 4. ConfirmLeaveDialog

**File:** `packages/client/src/components/ConfirmLeaveDialog.tsx`

**Behavior:**
- Uses existing `Modal` component (native `<dialog>`)
- Triggered when player taps Home or Ranks during an active game

**Content:**
- Title: "Leave match?"
- Body (in-match): "You're in an active game. Leaving will forfeit the match."
- Body (in-queue): "You're searching for an opponent. Leaving will cancel matchmaking."
- Buttons:
  - "Stay" — closes dialog, no action
  - "Leave" — navigates to the requested destination

**Navigation ownership:** TabBar holds the pending destination in local state. When the player confirms, TabBar calls `onConfirm`, which navigates to the stored destination. The dialog itself is stateless regarding destination.

**Props:**
```tsx
interface ConfirmLeaveDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}
```

### 5. MainMenu Dev Mode Button

**File:** `packages/client/src/pages/MainMenu.tsx`

- Add a subtle button at the bottom of the button stack: "Dev Mode"
- Styled like the existing Settings button but more muted (smaller text, dimmer)
- Toggles `uiStore.devMode` flag
- When active, shows a small green indicator
- Easy to remove/hide later — single button, single store flag

### 6. uiStore Changes

**File:** `packages/client/src/stores/uiStore.ts`

Add:
- `devMode: boolean` — controls Dev tab visibility in tab bar (persisted to localStorage so it survives reloads during development; production builds ignore this flag since `import.meta.env.DEV` is false)
- `toggleDevMode: () => void`
- `colorblindMode: ColorblindMode` — promoted from Settings local state
- `hapticEnabled: boolean` — promoted from Settings local state
- `setColorblindMode: (mode: ColorblindMode) => void`
- `setHapticEnabled: (enabled: boolean) => void`

## Interaction Flows

### Player on Main Menu taps Ranks
1. TabBar handles tap → navigates to `/leaderboard`
2. No confirm dialog (not in active game)

### Player in Draft phase taps Home
1. TabBar detects active game (route = `/match/:code`, phase !== `complete`)
2. Opens ConfirmLeaveDialog
3. Player taps "Stay" → dialog closes, back to draft
4. Player taps "Leave" → navigates to `/`

### Player in Forge phase taps Settings
1. TabBar opens SettingsDrawer (no confirm needed)
2. Player adjusts audio volume
3. Player taps backdrop → drawer closes, back to forge
4. No game state was lost

### Player taps Dev tab
1. DevDrawer opens
2. Player taps "Jump to Duel"
3. Mock match created, navigates to duel phase with test data
4. Drawer auto-closes on navigation

## File Summary

| File | Action |
|------|--------|
| `src/components/AppShell.tsx` | New — layout wrapper with TabBar + drawers |
| `src/components/TabBar.tsx` | New — bottom tab bar |
| `src/components/SettingsDrawer.tsx` | New — slide-up settings panel |
| `src/components/DevDrawer.tsx` | New — slide-up dev tools panel |
| `src/components/ConfirmLeaveDialog.tsx` | New — leave-game confirmation |
| `src/components/SettingsContent.tsx` | New — extracted from Settings.tsx |
| `src/pages/Settings.tsx` | Modified — uses SettingsContent |
| `src/pages/MainMenu.tsx` | Modified — add Dev Mode button |
| `src/stores/uiStore.ts` | Modified — add devMode flag |
| `src/App.tsx` | Modified — wrap routes in AppShell layout route |
