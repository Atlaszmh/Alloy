# Forge Screen Redesign — Design Spec

**Date:** 2026-03-29 (updated)
**Status:** Approved
**Branch:** `feature/forge-screen-ux`
**Mockup:** `packages/client/forge-mockup-v7.html`

## Problem Statement

The current forge screen is a 1170-line monolith with critical UX issues:

1. **Stockpile hidden below the fold** — players can't see their gems on any phone resolution
2. **Combination workbench eats 25% of viewport** but could be contextual
3. **Item cards are text-heavy WoW tooltips** — no visual socket system
4. **No visual hierarchy** — everything competes for attention
5. **Stats bar is tiny and unreadable**
6. **No mobile hardening** — missing touch-action, context menu overrides
7. **No entry animations or satisfying feedback**
8. **No responsive gem scaling** for varying stockpile sizes
9. **Hard-coded colors instead of design system tokens** — breaks theme cohesion
10. **Raw buttons instead of HapticButton** — no haptic/sound feedback on actions

## Design Direction

**Blacksmith lore, strategist UX** — the visual theme says "forge" but interactions optimize for fast number-crunching and min/maxing. The #1 priority is seeing ALL gems at once alongside the active tool (combine workbench or item sockets) to enable strategic planning.

## Shared System Compliance

The forge screen MUST reuse the game's shared UI/UX systems. No screen-specific reimplementations of patterns that already exist.

### Shared Components (reuse, don't recreate)
- **GemCard** (`components/GemCard.tsx`) — all gems in tray, workbench slots, and socket fills
- **HapticButton** (`components/HapticButton.tsx`) — ALL buttons (COMBINE, CLEAR, Done, modal, item tabs)
- **Timer** (`components/Timer.tsx`) — forge countdown timer
- **Modal** (`components/Modal.tsx`) — commit confirmation dialog

### Shared Hooks (extend, don't duplicate)
- **useGemSize** (`hooks/useGemSize.ts`) — extend with forge-specific breakpoints via a `context` parameter rather than creating a separate `useForgeGemSize.ts`. Both draft and forge share one sizing system.

### Shared Theme System (use, don't hard-code)
- **ELEMENT_GRADIENTS** (`shared/utils/element-theme.ts`) — for gem backgrounds, socket fills, workbench slot fills. Never hand-roll element colors.
- **ELEMENT_COLORS**, **ELEMENT_EMOJIS**, **TIER_COLORS** — from the same file
- **CSS custom properties** (`index.css`) — all colors must come from design tokens

### New Design Tokens (add to index.css)

The forge screen needs 6 new color tokens. Add them to `index.css` alongside the existing theme:

```css
--color-affix: #1eff00;           /* Socketed affix text */
--color-compound: #ecd06a;        /* Compound/combined affix text */
--color-inherent: #2dd4bf;        /* Base item inherent bonuses (same as teal) */
--color-base-stat: #b89868;       /* Base stat labels (same as bronze-light) */
--color-empty-socket: #4a4a68;    /* Empty socket borders (same as surface-400) */
--color-locked: #6a6a88;          /* Locked slot indicators (same as surface-300) */
```

### Bug Fix: Missing pop-in Keyframe

`GemChip.tsx` references `animation: 'pop-in 0.4s ease-out'` but this keyframe doesn't exist in `index.css`. Add it:

```css
@keyframes pop-in {
  0% { transform: scale(0); opacity: 0; }
  70% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}
```

## Architecture: Two-Tab Layout

The forge screen is split into two tabs matching distinct player actions:

### Tab 1: Plan & Combine
- **Purpose:** Survey all gems, discover combinations, craft compound gems
- **Middle:** Combination workbench with 3 combine slots (supports upcoming 3-gem combine mechanic)
- **Bottom:** Gem tray grid (all stockpile orbs, scrollable, thumb-friendly)

### Tab 2: Equip
- **Purpose:** Socket gems into weapon and armor
- **Middle:** Item view with visual socket grid
- **Bottom:** Same gem tray grid (persistent across tabs)

Players freely switch between tabs at any time — no forced flow.

### Layout Order (top to bottom)

1. **Header** (~28px) — phase title, round, timer progress bar, Done button
2. **Flux bar** (~40px) — prominent bolt icons + "X / Y FLUX" text
3. **Stats row** (~24px) — HP/DMG/ARM/CRT colored pills
4. **Base stat selectors** (R1 only, ~28px) — weapon/armor stat dropdowns
5. **Tab bar** (~36px) — "⚒ Plan & Combine" / "⚔ Equip"
6. **Action area** (flex middle) — workbench or item sockets
7. **Gem tray / Stockpile** (bottom, scrollable) — always visible near thumbs

## Store State

The `forgeStore.ts` is refactored to include:

```ts
interface ForgeStore {
  // Existing (keep)
  plan: ForgePlan | null;
  selectedOrbUid: string | null;
  comboSlots: [OrbInstance | null, OrbInstance | null, OrbInstance | null]; // 3 combine slots
  confirmModalOpen: boolean;

  // New
  activeTab: 'combine' | 'equip';       // Default: 'combine'
  activeItemTab: 'weapon' | 'armor';    // Default: 'weapon'

  // Removed
  // dragSource — replaced by tap-to-place interaction
  // comboSlotA / comboSlotB — replaced by comboSlots array
}
```

**Reset behavior:** On round change (new forge phase), `activeTab` resets to `'combine'`, `activeItemTab` resets to `'weapon'`, combo slots clear, selection clears.

## Layout Specification

### Header (sticky, ~28px)

```
FORGE PHASE   [R1]   [════════90s]   [DONE]
```
- "FORGE PHASE" — gold (var(--color-accent-500)), Rajdhani 700, 14px, tracking 0.04em
- Round pill — bg var(--color-surface-600), border var(--color-surface-500), text var(--color-bronze-light), 10px
- Timer — reuse shared `<Timer>` component, styled as progress bar
- Done button — `<HapticButton variant="primary" size="sm">DONE</HapticButton>`

### Flux Bar (prominent, ~40px)

```
⚡⚡⚡⚡⚡⚡⚡⚡
    8 / 8 FLUX
```
- Row of lightning bolt icons (one per max flux)
- Filled bolts: var(--color-warning) (#fbbf24)
- Spent bolts: var(--color-surface-600) (#252536)
- Text: "X / Y FLUX" centered, Rajdhani 700, 12px
- **Flux at 0:** text var(--color-danger), row uses `timer-pulse` animation
- **Flux at 1-2:** remaining bolts pulse subtly

### Stats Row (~24px)

```
HP 228   DMG 2   ARM 53%   CRT 0%
```
- Stats as colored mini pills: HP var(--color-success), DMG white, ARM var(--color-teal-500), CRT var(--color-danger) when 0%
- Stat label 9px uppercase, var(--color-surface-300), value 11px Rajdhani 700

### Tab Bar (~36px)
- Two tabs, 50/50 split: "⚒ Plan & Combine" / "⚔ Equip"
- Active: text var(--color-accent-400), 2px gold underline (var(--color-accent-500))
- Inactive: text var(--color-surface-300)
- `aria-selected` on active tab

### Action Area (flex middle)

#### Combination Workbench (Tab 1)

**Header:** "⚒ COMBINATION WORKBENCH" — 10px uppercase var(--color-bronze-light), centered

**Layout:** 3 slots + "▶" arrow (16px, var(--color-surface-300)) + result box, centered
- "+" symbols between slots (16px, var(--color-surface-300), Rajdhani 700)
- Each slot: 52px rounded square (border-radius 8px)
  - Empty: dashed border 2px var(--color-surface-500), dark inset background
  - Filled: solid border from `ELEMENT_GRADIENTS[tag].border`, gem art image centered, abbreviated stat text
- Glow signals (no text preview):
  - **White glow** = basic combo (box-shadow 0 0 12px rgba(255,255,255,0.3))
  - **Gold glow** = unique compound (box-shadow 0 0 16px rgba(212,168,52,0.5), border var(--color-compound), 1.5s pulse)
- Result box: 52px, "?" when empty, "?" pulsing white (white glow), "✦" gold shimmer (gold glow)
- `<HapticButton variant="primary" size="sm">COMBINE</HapticButton>` + `<HapticButton variant="secondary" size="sm">CLEAR</HapticButton>`
- `aria-live="polite"` on result region
- Warm container: box-shadow inset 0 0 30px rgba(212,168,52,0.04)

#### Item Socket View (Tab 2)

**Item tab switcher:** `<HapticButton>` pills for Sword/Chainmail
- Active: variant="primary" styling, Inactive: variant="secondary"

**Item card:**
- Name + type badge ("WEAPON"/"ARMOR")
- Inherent bonuses: var(--color-inherent) positive, var(--color-danger) negative
- Base stats: var(--color-base-stat)
- Socket grid adapts to slot count (3×2 for 6 slots)
  - Each socket: 48px rounded square
  - Empty: bg var(--color-surface-800), dashed border var(--color-surface-500), inset shadow
  - Filled: element bg from `ELEMENT_GRADIENTS` at 20%, solid element border, gem art image + stat text
  - Selected gem in tray: empty sockets pulse gold glow (`orb-glow` keyframe from index.css)
  - Locked (previous round): 🔒 overlay, border var(--color-locked), no interaction
- Equipped affixes list (10px): gem art mini (14px) + "Fire Attack +23 Phys Dmg"
- Arrow key navigation between sockets for accessibility

**Mini preview bar** (other item, 36px):
- Full width, bg var(--color-surface-800), border-top var(--color-surface-600)
- Item icon + name, socket dots (● element-colored, ○ var(--color-surface-500)), count "2/6"
- Tappable (cursor pointer, hover brightens)

### Gem Tray / Stockpile (bottom, scrollable)

**Label:** "STOCKPILE · {count} ORBS" — 10px uppercase, var(--color-bronze-light), Rajdhani

**Empty state:** "All orbs assigned" centered, var(--color-surface-300), 12px. Min height ~120px.

**Responsive sizing** via extended `useGemSize` hook:

| Context | Gem Count | Columns | Gem Size | Emoji/Art | Stat Text | Name Text |
|---------|-----------|---------|----------|-----------|-----------|-----------|
| forge   | ≤8        | 4       | 76px     | 28px      | 10px      | 9px       |
| forge   | 9-12      | 4       | 68px     | 26px      | 9px       | 9px       |
| forge   | 13-16     | 5       | 58px     | 22px      | 8px       | 8px       |
| forge   | 17+       | 5       | 52px     | 20px      | 8px       | 8px       |

Minimum gem size: 48px. Scrollable with thin scrollbar (4px, var(--color-surface-500) thumb).

**Gem card:** Uses shared `<GemCard>` component with `gemSize`, `emojiSize`, `statSize`, `nameSize`, `catSize` from the sizing hook. Art via `getGemArt(affixId)` with emoji fallback.

**States:**
- Selected: `selected={true}` prop → gold glow via GemCard's built-in styling
- Equipped: opacity 0.35, "⚔" badge top-right
- Staged: opacity 0.35, "⚒" badge top-right

**Sizes lock to initial count per round.** Combine consumption reflows grid but retains size tier until next round.

### Base Stat Selection (Round 1 only)

Compact row between stats and tab bar:
```
Weapon: [STR ▾] [VIT ▾]    Armor: [VIT ▾] [STR ▾]
```
- Styled pill dropdowns (bg var(--color-surface-600), border var(--color-surface-500), Rajdhani)
- Free action (no flux cost)
- Hidden in rounds 2-3

### Flux Exhaustion

When flux reaches 0:
- All flux bolt icons dark, text var(--color-danger), row pulses
- COMBINE button disabled (HapticButton handles disabled state)
- Assign orb disabled (costs flux)
- Remove orb still works (free, refunds flux)
- Toast: "Not enough flux" (0.8s fadeInOut, near flux bar)

## Standard Stat Abbreviations

| Full Stat | Abbreviation |
|-----------|-------------|
| Physical Damage | Phys Dmg |
| Cold Damage | Cold Dmg |
| Poison Damage | Psn Dmg |
| Chaos Damage | Chaos Dmg |
| Attack Speed | Atk Spd |
| Crit Chance | Crit |
| Max HP | HP |
| Cold Resistance | Cold Res |
| Fire Penetration | Fire Pen |
| Dodge Chance | Dodge |
| HP Regen | Regen |
| Barrier | Barrier |
| Armor | Armor |
| Block Chance | Block |

**Rule:** Element name stays full. Stat type abbreviates. Never less than 3 characters.

**Implementation:** Extend existing `shared/utils/stat-label.ts`.

## Interaction Design

### Gem Selection
- Tap gem to select (GemCard `selected` prop → gold glow + scale). Tap again to deselect.
- Only one gem selected at a time.

### Combining (Tab 1)
1. Tap gem in tray → gem highlights
2. Tap empty combine slot → gem stages into slot, dims in tray with ⚒ badge
3. When 2-3 slots filled, glow signal appears (white = basic, gold = unique)
4. Tap COMBINE → gems consumed, new gem appears in tray with scale-pop
5. Tap filled slot to unstage (gem returns to tray at full opacity)

### Equipping (Tab 2)
1. Tap gem in tray → gem highlights
2. Tap empty socket → gem placed, fills socket with element color, dims in tray with ⚔ badge
3. Tap filled socket → gem removed, returns to tray at full opacity (if removable)
4. Tap item tab or mini preview bar to switch items

### Round-Locking Rules
- Gems socketed in previous rounds are locked (cannot be removed)
- Locked sockets show 🔒 icon, no hover/tap interaction
- Gems socketed in the current round can be freely removed

### Drag-and-Drop (future enhancement)
Same gesture system as draft (8px threshold via shared constants). Not required for initial implementation.

## Sound Design

| Action | Sound | Notes |
|--------|-------|-------|
| Select gem | orbSelect | Existing |
| Stage in combine slot | orbSelect | Stub for future "clink" asset |
| Unstage from slot | orbRemove | Existing |
| Combine (execute) | combineMerge | Stub for future "forgeHammer" asset |
| Combine fail | combineFail | Existing |
| Place in socket | orbPlace | Existing |
| Remove from socket | orbRemove | Existing |
| Tab switch | buttonClick | Via HapticButton (automatic) |
| Done forging | forgeSubmit | Existing |
| Timer tick | timerTick | Existing, last 10s |
| Timer urgent | timerUrgent | Existing, last 3s |
| Drag start (future) | dragStart | Existing, for future drag-and-drop |
| Drop success (future) | dropSuccess | Existing, for future drag-and-drop |

## Animation Design

All animations use **Web Animations API** on actual DOM elements (matching draft pattern). No Framer Motion for new animations.

### Entry Animation
- Page enters with `phase-enter` (from index.css, translateY 12px + fade-in, 0.35s)
- Gems cascade via WAAPI: `element.animate([{opacity:0, transform:'scale(0.7)'}, {opacity:1, transform:'scale(1)'}], {duration: 300, easing: 'cubic-bezier(0.34,1.56,0.64,1)', delay: index * 25})`
- Action area slides up via WAAPI (translateY 20px → 0, 300ms ease-out)

### Combine Animation
- Staged gems shrink + glow → flash → new gem pops with `scale-pop` (from index.css)
- Gold compound: brief golden particle burst

### Socket Placement
- Gem animates from tray to socket via WAAPI (400ms arc path, matching draft's swoop pattern)
- Socket fills with element color via expanding radial gradient (200ms)

### Tab Switching
- Action area crossfades (opacity 0→1, 200ms)
- Gem tray stays static

## Mobile Hardening

Match draft screen patterns exactly:
- `touchAction: 'none'` on all gem cards and interactive elements
- `WebkitTouchCallout: 'none'` + `userSelect: 'none'` on gem cards
- `onContextMenu={e => e.preventDefault()}` on gem tray container
- Pointer lock during drag to prevent multi-touch exploits
- Min 44px touch targets on all interactive elements

## Accessibility

- Tab bar: `role="tablist"`, tabs are `role="tab"` with `aria-selected`
- Gem cards: `role="button"`, `aria-label` with name, stat, tier, state
- Combine result: `aria-live="polite"` announces glow signal changes
- Modal: existing focus-trap pattern
- Socket grid: arrow key navigation

## File Organization (target: 10 files)

| File | Role |
|------|------|
| `pages/Forge.tsx` | Orchestrator: layout, tabs, state wiring, commit flow, animations |
| `stores/forgeStore.ts` | Zustand: selection, activeTab, activeItemTab, comboSlots (refactor) |
| `components/ForgeGemTray.tsx` | Gem grid using shared GemCard + extended useGemSize |
| `components/CombineWorkbench.tsx` | 3-slot workbench, glow signals, HapticButton actions |
| `components/ItemSocketView.tsx` | Item display, adaptive socket grid, equipped list |
| `components/ItemMiniPreview.tsx` | Compact other-item bar with socket dots |
| `components/ForgeHeader.tsx` | Header + flux bar + stats, uses shared Timer |
| `hooks/useGemSize.ts` | EXTEND existing hook with forge context breakpoints |
| `shared/utils/stat-label.ts` | EXTEND with abbreviation map |
| `index.css` | ADD forge color tokens + pop-in keyframe |

## Testing Requirements

### Unit Tests
- `forgeStore.test.ts` — tab switching, selection, 3-slot combo staging, reset
- `stat-label.test.ts` — all abbreviation mappings
- `useGemSize.test.ts` — EXTEND with forge breakpoints (8, 12, 16, 17+)

### E2E Tests (4 device profiles)
- F01: All stockpile gems visible on initial load
- F02: Tap gem to select, tap again to deselect
- F03: Tab switching preserves gem tray state
- F04: Stage gem in combine slot, gem dims in tray
- F05: Unstage gem from combine slot, gem restores in tray
- F06: Glow signal appears when 2+ slots filled
- F07: Combine produces new gem in tray
- F08: Equip tab — place gem in socket, gem dims in tray
- F09: Equip tab — remove gem from socket, gem restores
- F10: Item tab switching shows correct item
- F11: Mini preview bar tappable to switch items
- F12: Timer visible and counting down
- F13: Done button opens confirmation modal
- F14: No console errors during full flow
- F15: Touch-action: none on interactive elements
- F16: Context menu blocked on gem tray
- F17: Flux exhaustion disables combine/assign, shows toast
- F18: Base stat selectors visible in round 1, hidden in round 2+
- F19: Round-locked sockets show lock icon, not removable
- F20: All buttons use HapticButton (haptic feedback fires on click)
