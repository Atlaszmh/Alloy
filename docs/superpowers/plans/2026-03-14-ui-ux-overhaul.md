# UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Alloy from a functional prototype into a visually distinctive, satisfying-to-play game with a forged-metal aesthetic identity, smooth transitions, rich audio feedback, and production-grade polish across all screens.

**Architecture:** This overhaul starts by establishing a visual foundation (typography, texture, palette refinement) then layers interaction polish on top. A Web Audio sound system and shared animation utilities are created as reusable infrastructure. Changes are verified via the existing Playwright E2E test suite which regenerates 50 screenshots for design comparison.

**Tech Stack:** Tailwind CSS 4, Google Fonts (Rajdhani + DM Sans), CSS animations/transitions, Web Audio API, React transition patterns, PixiJS (existing duel renderer)

**Design Direction:** *Forged metal* — angular, sharp, industrial warmth. Dark surfaces with subtle noise texture. Gold reserved for primary actions only. Cool teal as secondary accent for informational elements. Typography with geometric, condensed display headers that feel stamped/forged.

**Reviewer findings synthesized from:** UX Flow & Navigation review, Visual Design & Polish review, Game Feel & Interaction review, Frontend Design aesthetic review (4 specialist reviews analyzing all 50 Playwright screenshots)

---

## File Structure

```
packages/client/
├── index.html                            # MODIFY: Google Fonts link tags
├── src/
│   ├── index.css                         # MODIFY: Complete visual foundation overhaul
│   ├── shared/
│   │   └── utils/
│   │       ├── audio.ts                  # CREATE: Web Audio synthesized sound system
│   │       └── animations.ts            # CREATE: Shared animation utilities
│   ├── components/
│   │   ├── OrbIcon.tsx                   # MODIFY: Element gradients, halos, hover states
│   │   ├── Timer.tsx                     # MODIFY: Progress bar, escalation tiers, audio
│   │   ├── HapticButton.tsx             # MODIFY: Beveled depth, gradient face, ripple
│   │   ├── PhaseTransition.tsx          # CREATE: Full-screen phase transition overlay
│   │   ├── MatchProgressBar.tsx         # CREATE: Persistent match phase indicator
│   │   ├── Toast.tsx                    # CREATE: Action feedback toasts
│   │   └── CelebrationOverlay.tsx       # CREATE: Victory/synergy celebration effects
│   ├── pages/
│   │   ├── MainMenu.tsx                  # MODIFY: Atmospheric bg, desktop grid, depth
│   │   ├── Draft.tsx                     # MODIFY: Mobile grid, workshop feel, audio
│   │   ├── Forge.tsx                     # MODIFY: Anvil slots, side-by-side desktop, stats
│   │   ├── Duel.tsx                      # MODIFY: Arena atmosphere, celebrations, audio
│   │   ├── PostMatch.tsx                 # MODIFY: Celebrations, match stats, staggered reveal
│   │   └── RecipeBook.tsx               # MODIFY: Human-readable stats, formatted display
│   └── App.tsx                           # MODIFY: Transition system, progress bar
```

---

## Task 0: Visual Foundation — Identity, Typography, Texture

**Priority:** Critical — MUST run before all other tasks. Everything else builds on this.
**Files:**
- Modify: `packages/client/index.html`
- Modify: `packages/client/src/index.css`

This task establishes Alloy's visual identity: distinctive typography, atmospheric backgrounds, refined palette, and texture.

- [ ] **Step 1: Add Google Fonts to index.html**

Add to `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Font choices rationale:
- **Rajdhani** (display): Geometric, condensed, angular — feels stamped into metal. Used for headers, game titles, phase labels, stat numbers.
- **DM Sans** (body): Clean geometric sans with warmth and good readability at small sizes. Used for body text, descriptions, UI labels.

- [ ] **Step 2: Overhaul design tokens in index.css**

Replace the entire `@theme` block with the refined palette:

```css
@theme {
  /* Surface colors — wider spread for visible layering */
  --color-surface-950: #060608;
  --color-surface-900: #0a0a0f;
  --color-surface-800: #111118;
  --color-surface-700: #1a1a26;
  --color-surface-600: #252536;
  --color-surface-500: #363650;
  --color-surface-400: #4a4a68;
  --color-surface-300: #6a6a88;

  /* Primary accent — bright gold, reserved for CTAs and key highlights only */
  --color-accent-500: #d4a834;
  --color-accent-400: #e0bc4a;
  --color-accent-300: #ecd06a;

  /* Secondary accent — cool teal for informational elements */
  --color-teal-500: #2dd4bf;
  --color-teal-400: #5eead4;

  /* Muted gold — for headers, labels, secondary text (not CTAs) */
  --color-bronze-500: #a08050;
  --color-bronze-400: #b89868;
  --color-bronze-300: #c8a878;

  /* Element colors — refined for distinctiveness */
  --color-fire: #e8553a;
  --color-cold: #3a9be8;
  --color-lightning: #d4c040;
  --color-poison: #2db369;
  --color-shadow: #8b3ae8;
  --color-chaos: #e83a8b;

  /* Tier border colors */
  --color-tier-1: #8a8a8a;
  --color-tier-2: #3a9be8;
  --color-tier-3: #9b59b6;
  --color-tier-4: #e8553a;

  /* Feedback */
  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-danger: #f87171;
  --color-info: #60a5fa;

  /* Typography */
  --font-family-display: 'Rajdhani', system-ui, sans-serif;
  --font-family-body: 'DM Sans', system-ui, sans-serif;
  --font-family-mono: 'JetBrains Mono', monospace;

  /* Shadows */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.05);
  --shadow-button: 0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  --shadow-button-active: 0 1px 4px rgba(0, 0, 0, 0.5);
  --shadow-glow-accent: 0 0 16px rgba(212, 168, 52, 0.25);
  --shadow-glow-teal: 0 0 12px rgba(45, 212, 191, 0.2);
  --shadow-inset: inset 0 2px 4px rgba(0, 0, 0, 0.4);

  /* Spacing */
  --spacing-safe-bottom: env(safe-area-inset-bottom, 0px);

  /* Animations */
  --animate-pulse-glow: pulse-glow 2s ease-in-out infinite;
  --animate-slide-up: slide-up 0.2s ease-out;
  --animate-fade-in: fade-in 0.15s ease-out;
  --animate-scale-in: scale-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  --animate-scale-pop: scale-pop 0.3s ease-out;
  --animate-phase-enter: phase-enter 0.35s ease-out;
}
```

- [ ] **Step 3: Add atmospheric background and texture**

Add after the `@theme` block:

```css
/* Atmospheric background — subtle radial gradient + noise texture */
body {
  background:
    radial-gradient(ellipse at 50% 0%, rgba(30, 25, 40, 0.4) 0%, transparent 60%),
    var(--color-surface-950);
  font-family: var(--font-family-body);
}

/* Noise texture overlay — applied to main container */
#root::before {
  content: '';
  position: fixed;
  inset: 0;
  opacity: 0.03;
  pointer-events: none;
  z-index: 9999;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px;
}
```

- [ ] **Step 4: Add display typography styles**

```css
/* Display font for headers, phase names, game title */
h1, h2, h3, .display-text {
  font-family: var(--font-family-display);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* Strict type scale */
.text-display-xl { font-size: 3rem; line-height: 1; }     /* Game title */
.text-display-lg { font-size: 1.75rem; line-height: 1.1; } /* Phase names */
.text-display-md { font-size: 1.25rem; line-height: 1.2; } /* Section headers */
.text-display-sm { font-size: 0.875rem; line-height: 1.3; } /* Labels */

/* Stat numbers — Rajdhani + tabular */
.stat-number {
  font-family: var(--font-family-display);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Add all keyframe animations**

```css
@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
@keyframes slide-up {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes scale-in {
  from { transform: scale(0.85); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes scale-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}
@keyframes number-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.25); filter: brightness(1.4); }
  100% { transform: scale(1); }
}
@keyframes phase-enter {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes confetti-fall {
  from { transform: translateY(-10px) rotate(0deg); opacity: 1; }
  to { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}
@keyframes hp-flash {
  0% { filter: brightness(1); }
  50% { filter: brightness(1.5); }
  100% { filter: brightness(1); }
}
@keyframes timer-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
@keyframes orb-glow {
  0%, 100% { filter: brightness(1) drop-shadow(0 0 0px transparent); }
  50% { filter: brightness(1.15) drop-shadow(0 0 6px currentColor); }
}
```

- [ ] **Step 6: Add global interaction polish**

```css
/* Smooth transitions on all interactive elements */
button, a, [role="button"] {
  transition: transform 0.15s ease-out, box-shadow 0.15s ease-out, background-color 0.15s ease-out, filter 0.15s ease-out;
}

/* Page entrance */
.page-enter { animation: phase-enter 0.35s ease-out; }

/* HP bar smooth width transitions */
.hp-bar-fill { transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }

/* Stat value transitions */
.stat-value { transition: all 0.3s ease-out; }

/* Scrollbar styling */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-surface-500); border-radius: 2px; }

/* Base styles */
html, body, #root { height: 100%; overscroll-behavior: none; }
* { -webkit-tap-highlight-color: transparent; }
```

- [ ] **Step 7: Verify build passes**

```bash
pnpm -F @alloy/client build
```

- [ ] **Step 8: Run E2E tests to capture new baseline screenshots**

```bash
pnpm -F @alloy/client test:e2e
```

---

## Task 1: Audio System

**Priority:** Critical — most impactful single addition per all reviewers
**Files:**
- Create: `packages/client/src/shared/utils/audio.ts`

- [ ] **Step 1: Create the Web Audio synthesized sound system**

Build a lightweight audio system using Web Audio API with `OscillatorNode` and `GainNode`. No external audio files — generate tones procedurally. All sounds are short (50ms–1s), designed for responsiveness.

Sounds to implement:
- `orbSelect` — soft sine click (200ms, C4, quick fade)
- `orbConfirm` — ascending 2-note sine (E4→G4, 300ms)
- `orbPlace` — bright triangle bell (400ms, A4)
- `timerTick` — short square bleep (100ms, D5)
- `timerUrgent` — fast square beep (200ms, F5, louder)
- `attack` — punchy filtered noise thump (150ms)
- `crit` — bright sine ding + noise thump layered (200ms)
- `dodge` — ascending filtered noise whoosh (200ms)
- `block` — metallic square clang (150ms, E3)
- `death` — descending sine (G3→C2, 800ms)
- `victory` — ascending 3-note sine fanfare (C5→E5→G5, 1s)
- `defeat` — descending minor (E4→C4→A3, 800ms)
- `synergyActivate` — bright chime cascade (600ms, C5+E5+G5 staggered)
- `combineMerge` — sparkle whoosh (ascending + noise, 500ms)
- `buttonClick` — subtle sine tick (50ms, A4, very quiet)
- `phaseTransition` — filtered noise swoosh (400ms, bandpass sweep)

The system must:
- Respect `isMuted` flag from `uiStore`
- Lazy-create `AudioContext` on first user interaction (browser autoplay policy)
- Export a `playSound(name)` function and individual named exports
- Keep master volume at 0.3 (subtle, not intrusive)

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/client && npx tsc --noEmit
```

---

## Task 2: Phase Transition System

**Priority:** Critical — phase changes are currently instant/jarring
**Files:**
- Create: `packages/client/src/components/PhaseTransition.tsx`
- Create: `packages/client/src/components/MatchProgressBar.tsx`
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Create PhaseTransition component**

Full-screen overlay (z-50) that shows for 0.8s on phase changes. Uses `font-family-display` (Rajdhani) for the phase name. Fade-in → scale → hold → fade-out. Background: semi-transparent dark with subtle radial glow in accent color. Examples:
- "DRAFT" (gold text)
- "ROUND 1 — FORGE" (bronze text + round number)
- "ROUND 1 — FIGHT!" (red-orange text, urgent feel)
- "VICTORY!" (gold text + glow)
- "DEFEAT" (muted red, dim)

Play `phaseTransition` sound on display.

- [ ] **Step 2: Create MatchProgressBar component**

Persistent thin bar (h-8) at top of all match screens. Shows the match flow as connected dots:
`Draft → R1 → R2 → R3 → Result`
Current phase highlighted with accent glow. Completed phases filled. Shows score (e.g., "1 - 0"). Uses `font-family-display` for labels.

- [ ] **Step 3: Integrate into App.tsx**

Wrap match routes with transition provider. Trigger PhaseTransition on route changes within `/match/*`. Add MatchProgressBar inside all match layouts.

- [ ] **Step 4: Run E2E tests**

```bash
pnpm -F @alloy/client test:e2e
```

---

## Task 3: Button & Component Depth

**Priority:** Critical — everything currently feels flat
**Files:**
- Modify: `packages/client/src/components/HapticButton.tsx`
- Modify: `packages/client/src/pages/MainMenu.tsx`
- Modify: `packages/client/src/pages/Matchmaking.tsx`
- Modify: `packages/client/src/pages/PostMatch.tsx`

- [ ] **Step 1: Redesign HapticButton with depth and character**

Primary buttons get:
- Subtle gradient face (not flat fill): `linear-gradient(180deg, accent-400, accent-500)`
- `box-shadow: var(--shadow-button)`
- `active:translateY(1px)` + reduced shadow
- Hover: glow intensifies (`box-shadow: var(--shadow-glow-accent)`)
- Height: 48px for primary, 40px for secondary
- `font-family-display` for button text
- Play `buttonClick` sound on press
- Haptic feedback on mobile

Secondary buttons get:
- `background: surface-700` with `border: 1px solid surface-500`
- Subtle hover glow (teal: `var(--shadow-glow-teal)`)

- [ ] **Step 2: Redesign MainMenu**

- Title "ALLOY" in `font-family-display`, `text-display-xl`, with subtle text-shadow glow
- Tagline "Forge. Fight. Prevail." in `font-family-body`, `bronze-400`
- Background: add subtle radial gradient behind title (warm glow)
- Desktop (>768px): 2×3 button grid. Play button spans full width on top, 5 others in 2-col grid below.
- Mobile: vertical stack (current) but with proper depth on all buttons

- [ ] **Step 3: Update Matchmaking and PostMatch**

Apply new button system. Use `font-family-display` for tier labels and result text. Add `page-enter` animation on load.

- [ ] **Step 4: Run E2E tests**

```bash
pnpm -F @alloy/client test:e2e
```

---

## Task 4: OrbIcon & Draft Screen Polish

**Priority:** Major — core gameplay screen
**Files:**
- Modify: `packages/client/src/components/OrbIcon.tsx`
- Modify: `packages/client/src/pages/Draft.tsx`
- Modify: `packages/client/src/components/Timer.tsx`

- [ ] **Step 1: Redesign OrbIcon with element identity**

Each orb gets:
- Inner radial gradient based on element (fire: orange→dark red center, cold: blue→dark blue, etc.)
- Tier-based ambient halo: T1 none, T2 subtle, T3 visible, T4 bright glow
- Hover: `scale(1.08)`, brightness increase, shadow grows
- Selected: strong element-colored glow ring, `scale-pop` animation
- `scale-in` animation on first mount
- Play `orbSelect` on click

- [ ] **Step 2: Improve Draft mobile layout**

- Pool grid: `grid-cols-4 sm:grid-cols-6 md:grid-cols-8`, `gap-3` (up from 5 cols, gap-2)
- Pool container: subtle inner shadow (`box-shadow: var(--shadow-inset)`) for "workshop table" feel
- Add instruction text: "Tap to select, tap again to confirm" in `bronze-400`
- Stockpile panels: increase spacing, add card depth
- "Your Turn" / "AI's Turn" badge: larger, more prominent, use `font-family-display`
- Use `page-enter` animation on load

- [ ] **Step 3: Enhance Timer with visual escalation**

Replace plain text timer with:
- Circular or bar progress indicator that shrinks as time elapses
- Tiered urgency: `>10s` accent, `5-10s` warning/orange + gentle `timer-pulse`, `≤5s` danger/red + fast pulse
- Play `timerTick` each second when ≤10s
- Play `timerUrgent` at 3s remaining
- `font-family-display` for the number

- [ ] **Step 4: Add AI pick visual feedback**

When AI picks an orb, highlight it in the pool with a brief red glow (0.5s) before removing, so the player sees what was denied.

- [ ] **Step 5: Add audio to draft actions**

`orbSelect` on first tap, `orbConfirm` on confirm, `phaseTransition` when draft completes.

- [ ] **Step 6: Run E2E tests**

```bash
pnpm -F @alloy/client test:e2e
```

---

## Task 5: Forge Screen Polish

**Priority:** Major — most complex screen, most design problems
**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`
- Create: `packages/client/src/components/Toast.tsx`

- [ ] **Step 1: Create Toast component**

Bottom-center overlay, auto-dismiss 2s. Slide-up entrance, fade-out exit. Dark background with accent border. Messages: "Orb placed in Slot 1", "Combined: Ignite!", "Synergy: Assassin activated!". Uses `font-family-display` for the message.

- [ ] **Step 2: Redesign empty slots**

Replace dashed boxes with proper "anvil slot" feel:
- Dark inset background: `background: surface-950`, `box-shadow: var(--shadow-inset)`
- Subtle `+` icon centered, in `surface-400`
- Hover: glow border (`shadow-glow-accent`), `+` brightens
- No dashed borders — use solid 1px `surface-500` border

- [ ] **Step 3: Improve forge layout**

Mobile:
- Prioritize: item panel (larger) → synergies → stockpile
- Base stat selectors: compact inline pills, not dropdown rows
- Stats preview bar at bottom: icon-led stat blocks (sword icon + DMG value), `font-family-display` numbers

Desktop (>768px):
- Side-by-side weapon + armor panels (not tabbed)
- Stockpile across full width below
- Stats preview as a proper sidebar or footer bar

- [ ] **Step 4: Add slot placement feedback**

On orb placement: `scale-in` animation, play `orbPlace`, slot briefly glows element color. On removal: fade-out animation, orb returns to stockpile with slide animation.

- [ ] **Step 5: Add combination and synergy feedback**

Combination: play `combineMerge`, show toast with name, compound slot pulses with `scale-pop`.
Synergy activation: play `synergyActivate`, badge pulses green glow, show toast.

- [ ] **Step 6: Animate stat changes**

Stats bar numbers use `number-pop` animation on change. Green flash for increases, red for decreases. Flux counter: `font-family-display`, prominent, pulses on spend.

- [ ] **Step 7: Run E2E tests**

```bash
pnpm -F @alloy/client test:e2e
```

---

## Task 6: Duel Screen Polish

**Priority:** Major — the spectacle screen
**Files:**
- Modify: `packages/client/src/pages/Duel.tsx`
- Modify: `packages/client/src/components/DuelRenderer.tsx`
- Create: `packages/client/src/components/CelebrationOverlay.tsx`

- [ ] **Step 1: Create CelebrationOverlay**

CSS confetti (20-30 absolutely positioned divs) with randomized `confetti-fall` animation, delays, and colors. Triggered on round win. Smaller variant for synergy procs. Auto-cleans after 2s.

- [ ] **Step 2: Add arena atmosphere to DuelRenderer**

- Background gradient (dark radial, slightly warm)
- Gladiator silhouettes: replace circle+box with proper humanoid silhouette shape (still Graphics, but better proportions — head, torso, arms, legs as simple paths)
- Subtle floor shadow under each gladiator

- [ ] **Step 3: Improve duel layout**

Mobile: canvas (280px) stacked above event log (last 5 events). Desktop: side-by-side.
Add playback speed buttons: 0.5x, 1x, 2x.
HP bars: `font-family-display` numbers, `hp-bar-fill` transition, pulse at <30%.

- [ ] **Step 4: Add round intro overlay**

Before playback: "ROUND 1 — FIGHT!" in `font-family-display`, `text-display-lg`, centered overlay for 1.5s with `scale-pop` + `phaseTransition` sound. Then auto-play.

- [ ] **Step 5: Add combat audio**

Sync sounds to tick events: `attack`, `crit`, `dodge`, `block`, `death`. Victory/defeat sounds at duel end.

- [ ] **Step 6: Add victory/defeat celebration**

Player win: `CelebrationOverlay` confetti + `victory` sound.
Player loss: `defeat` sound, brief screen dim overlay.

- [ ] **Step 7: Improve post-duel breakdown**

Stack vertically on mobile. Stat bars (green=player, red=AI) instead of plain numbers. Numbers animate counting up from 0 on reveal (stagger 100ms per stat). Use `font-family-display` for stat values.

- [ ] **Step 8: Run E2E tests**

```bash
pnpm -F @alloy/client test:e2e
```

---

## Task 7: Post-Match & Result Screen

**Priority:** Major — the payoff moment
**Files:**
- Modify: `packages/client/src/pages/PostMatch.tsx`

- [ ] **Step 1: Victory/defeat celebration**

Victory: "VICTORY!" in `font-family-display`, `text-display-xl`, gold glow text-shadow, `CelebrationOverlay` confetti, `victory` sound. Score counts up.
Defeat: "DEFEAT" in muted red, subtle `shake` animation, dim overlay, `defeat` sound.

- [ ] **Step 2: Add match statistics summary**

Below round results, show: Total Damage, Total Healing, Synergies Activated, Combinations Used, Critical Hits. Numbers animate counting up with stagger. Icon-led blocks using `font-family-display`.

- [ ] **Step 3: Improve round result cards**

Stagger reveal (200ms each). Color-coded borders (green win, red loss). Show HP delta prominently. `scale-in` animation per card.

- [ ] **Step 4: Run E2E tests**

```bash
pnpm -F @alloy/client test:e2e
```

---

## Task 8: Meta Screen Polish

**Priority:** Minor — less time-critical than gameplay screens
**Files:**
- Modify: `packages/client/src/pages/Profile.tsx`
- Modify: `packages/client/src/pages/RecipeBook.tsx`
- Modify: `packages/client/src/pages/Collection.tsx`
- Modify: `packages/client/src/pages/Leaderboard.tsx`
- Modify: `packages/client/src/pages/Settings.tsx`

- [ ] **Step 1: Apply visual foundation to all meta screens**

All pages: `page-enter` animation, `font-family-display` for headers, card depth on panels.
All list rows: hover state with `translateX(2px)` + subtle background tint.

- [ ] **Step 2: Redesign Recipe Book stat display**

Replace raw keys like `compound.ignite.dotMultiplier` with human-readable formatted lines:
- "15% chance to ignite on hit"
- "2x DOT multiplier"
- "+120 tick burn duration"
Color-code by element. Use `font-family-mono` for numeric values. 2-column grid on desktop.

- [ ] **Step 3: Improve Collection affix cards**

Add left border colored by category (offensive=red, defensive=blue, sustain=green, utility=yellow, trigger=purple). Stagger entrance animations. Expanded tier view: cleaner weapon/armor columns with element-colored values.

- [ ] **Step 4: Enhance Leaderboard**

Tier-based row tinting: Alloy=warm gold/5%, Mythril=purple/5%, Steel=teal/5%.
Player names: `font-weight-600`. Rank numbers: `font-family-display`.
Top 3 rows: subtle gold/silver/bronze left border.
Stagger row entrance animation.

- [ ] **Step 5: Fix contrast issues**

All secondary text: minimum `opacity-60` or use `surface-300` (#6a6a88) for readable gray.
Ensure 4.5:1 WCAG AA contrast on all body text.

- [ ] **Step 6: Run E2E tests**

```bash
pnpm -F @alloy/client test:e2e
```

---

## Task 9: Final Integration & Verification

**Priority:** Required

- [ ] **Step 1: Run full E2E suite**

```bash
pnpm -F @alloy/client test:e2e
```

All 12 tests must pass. 50 screenshots regenerated.

- [ ] **Step 2: Verify engine tests unaffected**

```bash
pnpm -F @alloy/engine test
```

167/167 must pass.

- [ ] **Step 3: Verify client build**

```bash
pnpm -F @alloy/client build
```

Exit 0, no TypeScript errors.

- [ ] **Step 4: Review screenshot diff**

Compare new screenshots against pre-overhaul baseline. Verify:
- Rajdhani display font visible on headers, phase names, stat numbers
- DM Sans body font on descriptions, labels
- Background has subtle noise texture and radial gradient
- Buttons have gradient face, shadow depth, hover glow
- Orbs have element gradients, tier halos, hover scale
- Empty forge slots look like inset anvil slots (not dashed wireframes)
- Phase transitions show full-screen overlay with display text
- Timer has progress bar and tiered urgency
- Duel has arena atmosphere, round intro, celebrations
- Post-match has confetti (victory) or dim (defeat)
- Recipe Book shows human-readable stat descriptions
- Leaderboard has tier-tinted rows
- All text passes contrast check

---

## Verification Checklist

- [ ] All 12 E2E tests pass
- [ ] 50 screenshots regenerated with new UI
- [ ] Engine tests: 167/167 pass
- [ ] Client build: exit 0
- [ ] Typography: Rajdhani (display) + DM Sans (body) rendering
- [ ] Background: noise texture + radial gradient visible
- [ ] Buttons: gradient, shadow, hover glow, active press
- [ ] OrbIcon: element gradients, tier halos, hover/selected states
- [ ] Timer: progress bar, tiered urgency colors
- [ ] Phase transitions: full-screen overlay with display text
- [ ] Audio: sounds play on interactions (manual browser test)
- [ ] Forge slots: inset anvil style, not dashed wireframe
- [ ] Duel: arena atmosphere, round intro, celebrations
- [ ] Recipe Book: human-readable compound stats
- [ ] All text: WCAG AA contrast (4.5:1 minimum)
