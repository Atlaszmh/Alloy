# Forge Screen Redesign — Design Spec

**Date:** 2026-03-28
**Status:** Approved
**Branch:** `feature/forge-screen-ux`
**Mockup:** `packages/client/forge-mockup-v4.html`

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

## Design Direction

**Blacksmith lore, strategist UX** — the visual theme says "forge" but interactions optimize for fast number-crunching and min/maxing. The #1 priority is seeing ALL gems at once alongside the active tool (combine workbench or item sockets) to enable strategic planning.

## Architecture: Two-Tab Layout

The forge screen is split into two tabs matching distinct player actions:

### Tab 1: Plan & Combine
- **Purpose:** Survey all gems, discover combinations, craft compound gems
- **Top:** Gem tray grid (all stockpile orbs, scrollable)
- **Bottom:** Combination workbench with 3 combine slots (supports upcoming 3-gem combine mechanic)

### Tab 2: Equip
- **Purpose:** Socket gems into weapon and armor
- **Top:** Same gem tray grid (persistent across tabs)
- **Bottom:** Item view with visual socket grid

Players freely switch between tabs at any time — no forced flow.

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
}
```

**Reset behavior:** On round change (new forge phase), `activeTab` resets to `'combine'`, `activeItemTab` resets to `'weapon'`, combo slots clear, selection clears.

## Layout Specification

### Header (sticky, 2 rows, ~56px)

**Row 1 (28px):**
```
FORGE PHASE   [R3]                    [87s]  [DONE]
```
- "FORGE PHASE" — gold (#d4a834), Rajdhani 700, 14px, tracking 0.04em
- Round pill — background #252536, border #363650, text #b89868, 10px
- Timer badge — background #252536, text white, 12px
- Done button — gold background (#d4a834), dark text, Rajdhani 700, 12px

**Row 2 (24px):**
```
HP 228   DMG 2   ARM 53%   CRT 0%        ⚡8
```
- Stats as colored mini pills: HP green (#34d399), DMG white, ARM teal (#2dd4bf), CRT red (#f87171) when 0%
- Stat label 9px uppercase #6a6a88, value 11px Rajdhani 700
- Flux right-aligned, #fbbf24, 12px
- **Flux at 0:** text #f87171 (danger red), counter pulses with `timer-pulse` animation

### Tab Bar (~36px)
- Two tabs, 50/50 split: "⚒ Plan & Combine" / "⚔ Equip"
- Active: text #e0bc4a, 2px gold underline (#d4a834)
- Inactive: text #6a6a88

### Gem Tray (persistent, both tabs)

**Label:** "STOCKPILE · {count} ORBS" — 10px uppercase, #b89868, Rajdhani

**Empty state (0 gems):** Show centered message "All orbs assigned" in #6a6a88, 12px. Gem tray maintains minimum height (~120px) so layout doesn't collapse.

**Responsive grid sizing:**

| Gem Count | Columns | Gem Size | Emoji | Stat Text | Name Text |
|-----------|---------|----------|-------|-----------|-----------|
| ≤8        | 4       | 76px     | 28px  | 10px      | 9px       |
| 9-12      | 4       | 68px     | 26px  | 9px       | 9px       |
| 13-16     | 5       | 58px     | 22px  | 8px       | 8px       |
| 17+       | 5       | 52px     | 20px  | 8px       | 8px       |

Tested against target viewports: 375px (iPhone SE) = 4×76=304+gaps OK, 5×52=260+gaps OK. 393px (iPhone 15) and 412px (Pixel 7) have more room.

Minimum gem size: 48px (touch target). Container scrolls with styled thin scrollbar (4px, #363650 thumb).

**Gem card styling:**
- Rounded square, element-colored gradient border (2px)
- Specular highlight: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), transparent 55%)
- Content: emoji centered, stat value below, name below card, tier dots below name
- T3+ glow: box-shadow 0 0 {4+tier×2}px tierColor
- Selected state: gold border (#d4a834), drop-shadow glow, scale(1.05)
- Equipped state: opacity 0.35, "⚔" badge top-right (8px)
- Staged state: opacity 0.35, "⚒" badge top-right (8px)

**Gem sizes lock to initial count per round** — don't shrink as gems are placed (matches draft pattern). When a combine consumes 2 gems and produces 1, the grid retains its original column/size tier. The consumed gems are removed and the grid reflows to fill gaps (no empty placeholders). The size tier only recalculates on round transitions.

### Base Stat Selection (Round 1 only)

In round 1, base stat selectors appear as a compact row between the header and gem tray:
```
Weapon: [STR ▾] [VIT ▾]    Armor: [VIT ▾] [STR ▾]
```
- Styled as game-UI pill dropdowns (background #252536, border #363650, text white, Rajdhani)
- NOT raw `<select>` elements — use custom dropdown or styled selects
- Free action (no flux cost)
- Hidden in rounds 2-3 (base stats are locked after round 1)

### Combination Workbench (Tab 1, bottom ~40%)

**Header:** "⚒ COMBINATION WORKBENCH" — 10px uppercase #b89868, centered

**Layout:** 3 slots + "→" arrow (▶, 16px, #6a6a88) + result box, centered horizontally
- "+" symbols between slots (16px, #6a6a88, Rajdhani 700)
- Each slot: 52px rounded square (border-radius 8px)
  - Empty: dashed border 2px #363650, dark inset background
  - Filled: solid element-colored border, emoji + abbreviated stat inside

**Glow signals (no text preview):**
- **White glow** = basic stat boost / level up (box-shadow 0 0 12px rgba(255,255,255,0.3))
- **Gold glow** = unique compound gem (box-shadow 0 0 16px rgba(212,168,52,0.5), border #ecd06a, 1.5s ease-in-out pulse animation)

**Result box:** 52px rounded square
- No signal: dashed border #363650, "?" centered
- White signal: dashed white border at 30%, "?" pulses white
- Gold signal: solid border #ecd06a, "✦" star in gold, subtle shimmer

**Buttons:** COMBINE (gold, disabled when <2 slots filled) + CLEAR (surface-600)

**Warm border glow** on workbench container: box-shadow inset 0 0 30px rgba(212,168,52,0.04) (gold tint matching forge theme)

### Flux Exhaustion

When flux reaches 0:
- Flux counter turns red (#f87171) and pulses
- Combine button disabled if combine cost > 0 flux
- Assign orb disabled (costs flux)
- Remove orb still works (free action, refunds flux)
- Tapping a disabled action shows a brief toast: "Not enough flux" (0.8s fade-out, positioned near the flux counter)

### Item Section (Tab 2, bottom ~45%)

**Item tab switcher:** Two pill buttons
- Active: background #252536, border #d4a834, text #e0bc4a
- Inactive: transparent, border #252536, text #6a6a88

**Item card:**
- Name + type badge ("WEAPON" / "ARMOR")
- Inherent bonuses: teal (#2dd4bf) positive, red (#f87171) negative
- Base stats: bronze (#b89868)
- Socket grid adapts to item's actual slot count:
  - 6 slots (standard): 3×2 grid, gap 6px
  - Fewer slots: center in available space (e.g., 4 slots = 2×2)
  - More slots (future): 4×2 or scrollable row
  - Each socket: 48px rounded square
  - Empty: background #111118, dashed border #363650, inset shadow
  - Filled: element-colored bg at 20%, solid element border, emoji + short stat text
  - When gem selected: empty sockets pulse gold glow (0 0 8px → 0 0 16px rgba(212,168,52,0.3-0.5))
- Equipped affixes list below sockets (10px): "🔥 Fire Attack +23 Phys Dmg"

**Mini preview bar** (other item, 36px):
- Full width, background #111118, border-top #252536
- Item icon + name, socket dots (● filled in element color, ○ empty #363650), count "2/6"
- Tappable to switch items

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

**Rule:** Element name stays full (Fire, Cold, Shadow, etc.). Stat type abbreviates (Damage→Dmg, Penetration→Pen, Resistance→Res). Never less than 3 characters.

**Implementation:** Extend the existing `shared/utils/stat-label.ts` with an abbreviation lookup rather than creating a separate file. Add a `getStatAbbreviation(stat: string): string` export.

## Interaction Design

### Gem Selection
- Tap gem to select (gold glow + scale). Tap again to deselect.
- Only one gem selected at a time.

### Combining (Tab 1)
1. Tap gem in tray → gem highlights
2. Tap empty combine slot → gem stages into slot, dims in tray with ⚒ badge
3. When 2-3 slots filled, glow signal appears (white = basic, gold = unique)
4. Tap COMBINE → gems consumed, new gem appears in tray with scale-pop animation
5. Tap filled slot to unstage (gem returns to tray at full opacity)

### Equipping (Tab 2)
1. Tap gem in tray → gem highlights
2. Tap empty socket → gem placed, fills socket with element color, dims in tray with ⚔ badge
3. Tap filled socket → gem removed, returns to tray at full opacity (if removable — see round-locking rules below)
4. Tap item tab or mini preview bar to switch items

### Round-Locking Rules
- Gems socketed in previous rounds are locked (cannot be removed)
- Locked sockets show 🔒 icon, no hover/tap interaction
- Gems socketed in the current round can be freely removed

### Drag-and-Drop (future enhancement)
Drag from tray to combine slot or socket. Same gesture system as draft screen (8px threshold, pointer events). Not required for initial implementation — tap-to-place is the primary interaction.

## Sound Design

| Action | Sound | Notes |
|--------|-------|-------|
| Select gem | orbSelect | Existing sound |
| Stage in combine slot | clink (new) | Metallic tap, short. Stub with orbSelect until asset arrives. |
| Unstage from slot | orbRemove | Existing sound |
| Combine (execute) | forgeHammer (new) | Heavy, satisfying impact. Stub with combineMerge until asset arrives. |
| Combine fail | combineFail | Existing sound |
| Place in socket | orbPlace | Existing sound |
| Remove from socket | orbRemove | Existing sound |
| Tab switch | buttonClick | Existing sound |
| Done forging | forgeSubmit | Existing sound |
| Timer tick | timerTick | Existing, last 10s |
| Timer urgent | timerUrgent | Existing, last 3s |

## Animation Design

### Entry Animation
- Page enters with `phase-enter` animation (translateY 12px + fade-in, 0.35s)
- Gems cascade in with staggered spring (index × 0.025s delay, stiffness 400, damping 25)
- Workbench/item section slides up from bottom (0.3s ease-out)

### Combine Animation
- On COMBINE press: staged gems shrink + glow → flash → new gem pops into tray with scale-pop animation
- Gold compound result: brief golden particle burst around new gem

### Socket Placement
- Gem shrinks from tray position → animates into socket position (Web Animations API, 400ms arc)
- Socket fills with element color via expanding radial gradient (200ms)

### Tab Switching
- Bottom section crossfades (opacity 0→1, 200ms)
- Gem tray stays static (no animation needed)

## Mobile Hardening

Match draft screen patterns:
- `touchAction: 'none'` on all gem cards and interactive elements
- `WebkitTouchCallout: 'none'` + `userSelect: 'none'` on gem cards
- `onContextMenu={e => e.preventDefault()}` on gem tray container
- Pointer lock during drag to prevent multi-touch exploits
- Min 44px touch targets on all interactive elements

## Accessibility

- Tab switching: focusable with keyboard, aria-selected on active tab
- Gem cards: `role="button"`, `aria-label` including gem name, stat, and state (e.g., "Fire Attack, +23 Phys Dmg, Tier 2, equipped")
- Combine result: `aria-live="polite"` region announces glow signal change ("Unique combination available" / "Basic combination available")
- Confirmation modal: follow existing Modal component's focus-trap pattern
- Socket grid: arrow key navigation between sockets within the grid

## File Organization (target: 10-11 files)

| File | Role |
|------|------|
| `pages/Forge.tsx` | Main component — layout, tab switching, animation orchestration |
| `stores/forgeStore.ts` | Zustand — selection, activeTab, activeItemTab, combine slots (refactor existing) |
| `components/ForgeGemTray.tsx` | Gem grid with responsive sizing, selection, dimming |
| `components/CombineWorkbench.tsx` | 3-slot workbench, glow signals, combine button |
| `components/ItemSocketView.tsx` | Item display, socket grid, equipped list |
| `components/ItemMiniPreview.tsx` | Compact other-item bar with socket dots |
| `components/ForgeHeader.tsx` | 2-row header with stats, timer, flux, base stat selectors |
| `hooks/useForgeGemSize.ts` | Responsive gem sizing for forge (adapt existing useGemSize) |
| `animation/hooks/useForgeAnimations.tsx` | Combine + socket placement animations |
| `shared/utils/stat-label.ts` | Extend with abbreviation map (existing file) |

**Note:** Gesture handling is inline in `Forge.tsx` for the initial tap-to-place implementation. A separate `forge-gestures.ts` will be extracted when drag-and-drop is added as a future enhancement.

## Testing Requirements

### Unit Tests
- `forgeStore.test.ts` — tab switching, selection, combine slot staging, reset on round change
- `stat-label.test.ts` — all abbreviation mappings (extend existing tests)
- `useForgeGemSize.test.ts` — all breakpoints (8, 12, 16, 17+ gems), container shrinking, minimum size

### E2E Tests (4 device profiles)
- F01: All stockpile gems visible on initial load (no scrolling needed for ≤12 gems)
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
