# Draft Screen — Acceptance Criteria

> Phase-specific AC for the Draft screen, prioritized into P0 (must work), P1 (polish), and P2 (future).
> Written from the player's perspective; implementation notes included as sub-sections.

---

## P0: Core Experience (Must Work)

### AC-D01: Pool is visible and readable

When the draft begins, I see all available gems laid out in a grid. Each gem clearly shows its element (color), tier (visual distinction), stat value, and name. I can tell gems apart at a glance without hovering.

**Impl:** GemCard renders element gradient, tier glow, stat value inside, name + category below. Grid auto-scales via `useGemSize` — 4 cols for ≤16 gems, 5 cols for larger pools.

---

### AC-D02: Clean tap selects, second tap confirms

When I tap a gem once, it highlights visually (glow/scale). When I tap the same gem again, it's picked and moves to my stockpile. If I tap a different gem instead, the first deselects and the new one highlights. There is no ambiguity about what's selected.

**Impl:** draftStore two-tap pattern — `selectOrb()` on first tap, `confirmPick()` on second. Visual: selected gem gets element-colored glow drop-shadow + scale 1.08.

---

### AC-D03: Drag-to-stockpile picks a gem

When I press and drag a gem down into my stockpile zone, releasing it there confirms the pick. The gem appears in my stockpile and leaves the pool.

**Impl:** Drag ghost follows pointer. Drop zone detection on release. Dispatch `draft_pick` action on valid drop.

---

### AC-D04: Hold-and-release-in-place is a no-op

If I press and hold a gem, then release without dragging it away from its original position, **nothing happens** — no selection, no pick, no state change. A drag intent that doesn't reach the stockpile zone is cancelled cleanly.

**Impl:** Must distinguish tap (mousedown+mouseup with negligible movement) from drag (movement exceeds threshold). Hold-release-in-place should not trigger `selectOrb()`. If drag starts but doesn't reach drop zone, reset drag state without side effects.

---

### AC-D05: Turn clarity

I always know whose turn it is. When it's my turn, I see a clear "YOUR PICK" indicator. When it's my opponent's turn (AI or human), I see "OPPONENT PICKING" and the pool is **informationally interactive only** — I can still view gem stats and pop-up details, but I cannot select, drag, or take any pick actions.

**Impl:** TurnIndicator component + pool interaction gating based on `phase.activePlayer`. Hover/long-press detail views remain enabled during opponent's turn; only pick actions (tap-to-select, drag-to-stockpile) are blocked.

---

### AC-D06: Timer creates urgency without panic

A visible countdown timer runs during my turn. As time runs low, the timer communicates urgency (color change, pulse, sound). If I run out of time, a gem is auto-picked for me and play continues without breaking.

**Impl:** Timer component with urgency states. Auto-pick via `autoPickRandom()` on expiry. Exact timer duration is a balance value (currently 15s, GDD says 8s — treat as tunable).

---

### AC-D07: Stockpiles show what's been picked

I can see both my stockpile (bottom) and my opponent's stockpile (top) at all times. Each stockpile clearly shows the gems that have been picked so far. My stockpile feels like "mine" (warm/gold tint), opponent's feels distinct (red/cool tint).

**Impl:** StockpileZone with GemChip components. Opponent zone at top, player zone at bottom. Visual differentiation via background tinting.

---

### AC-D08: Picks are validated and consistent

I can only pick gems that are in the pool, and only on my turn. If something goes wrong (network issue, race condition), the UI doesn't show an invalid state — it either rolls back gracefully or shows a brief error.

**Impl:** Engine validates via `validateActivePlayer()`, `validateOrbInPool()`, `validateDraftNotComplete()`. Client handles `ActionResult.ok === false` by reverting optimistic update.

---

### AC-D09: Draft completes and transitions smoothly

When all picks are exhausted, the draft ends and I transition to the Forge phase. This transition is clear — I understand that drafting is over and forging is beginning. No abrupt jump.

**Impl:** `isComplete` triggers `getNextPhase()`. PhaseRouter navigates to Forge. Transition should have at minimum a brief visual indicator (e.g., "Draft Complete" flash before forge loads).

---

### AC-D10: Multi-round draft flow (Ranked/Unranked)

In ranked/unranked matches, I draft three times — once before each forge round. Round 1 has a bigger pool (24 gems, 8 picks each), rounds 2 and 3 are smaller (12 gems, 4 picks each). Not all gems are selected — the leftover gems create variety and force strategic choices about which synergies to pursue. Each round feels like a fresh mini-draft with a new pool. I understand which round I'm in.

**Impl:** Phase machine cycles draft→forge→duel three times. Pool generated per round via `rng.fork('pool_r{n}')`. Round number shown in UI header: "ROUND 1 DRAFT" / "ROUND 2 DRAFT" / "ROUND 3 DRAFT". Balance config updated: `draftPoolPerRound: [24, 12, 12]`, `draftPicksPerPlayer: [8, 4, 4]`.

---

### AC-D11: AI opponent feels natural

When playing against AI, the opponent's picks happen at a natural pace — not instant, not glacially slow. I can see what the AI picked. The experience feels like playing against someone, not watching a script execute.

**Impl:** AI pick delay should be a random range (1000–5000ms), not a fixed 500ms. Higher-tier AI should trend toward the longer end (more deliberate). AI pick animation should mirror player pick animation.

---

## P1: Polish and Clarity

### AC-D12: Gem comparison is easy

I can quickly compare gems in the pool without memorizing stats. Hovering or long-pressing a gem shows additional detail (full affix description, tags, synergy hints). I can evaluate trade-offs between picks without friction.

**Impl:** Tooltip or detail panel on hover/long-press. Could show affix effects, relevant archetype tags, tier info.

---

### AC-D13: Archetype guidance

As I pick gems, I get some visual signal about what archetype(s) I'm building toward. I don't need to memorize the tag system — the UI helps me see patterns forming. Similar gems are grouped visually — e.g., fire gems cluster together with a shared fiery border, cold gems with an icy border, etc.

**Impl:** Stockpile grouping by element/archetype with shared visual borders/backgrounds. Pool gems matching the player's emerging build could be subtly highlighted. Grouping makes archetype direction visible without explicit labels.

---

### AC-D14: Opponent pick feedback

When my opponent picks a gem, I clearly see which gem was taken — it animates out of the pool toward their stockpile with a swooping motion (like watching a drag-and-drop action). I don't have to scan the pool to figure out what disappeared.

**Impl:** Pick animation showing gem leaving pool → swooping arc → opponent stockpile. Brief highlight or trail effect. Motion should feel like a physical "grab and place."

---

### AC-D15: Round transitions feel intentional

Between draft rounds (after a duel ends, before the next draft starts), there's a moment of orientation — I see "Round 2 Draft" or similar, understand I'm getting a fresh pool, and feel ready to pick again. It doesn't feel like the same screen just reset.

**Impl:** Transition overlay or brief interstitial between duel result and next draft. Pool animates in rather than just appearing.

---

### AC-D16: Sound design supports the experience

Audio reinforces the draft without being annoying. Picking a gem has a satisfying confirm sound. Timer urgency sounds escalate naturally. Opponent picks have a distinct but non-distracting sound. Sounds can be muted.

**Impl:** SoundManager integration. Currently has drag, confirm, and timer sounds. Verify they feel cohesive and aren't jarring on repeat.

---

### AC-D17: Responsive layout

The draft screen works on different screen sizes. The gem grid scales down gracefully. Stockpile zones remain usable. Nothing overflows or gets cut off. Touch targets remain large enough on smaller screens.

**Impl:** `useGemSize` handles grid scaling. Verify stockpile zones, timer, and status bar at common breakpoints.

---

### AC-D18: Disconnect handling (multiplayer)

If my opponent disconnects during a draft, I see a clear indicator (overlay/message) and understand what's happening. The game either waits, substitutes AI, or ends gracefully — I'm never stuck on a frozen draft screen.

**Impl:** Disconnect overlay already exists for non-AI matches. Verify it appears promptly and communicates next steps.

---

## P2: Nice-to-Have / Future

### AC-D19: Spectator mode

A spectator can watch a draft in progress, seeing both players' picks in real-time without being able to interact with the pool.

**Impl:** Currently stubbed. Would need read-only draft view with both stockpiles visible.

---

### AC-D20: Pre-draft banning

Before the draft begins, each player can ban 1-2 gems from the pool, adding a layer of strategy. Banning is **optional and mode-specific** — available in certain events or competitive modes, not always-on.

**Impl:** Not yet designed. Would add an optional ban phase before the draft phase in the phase machine. Mode/event config determines whether banning is enabled.

---

### AC-D21: Match replay / draft history

After a match, I can review a replay of the entire match — including the draft sequence (who picked what, in which order), forge decisions, and duel outcomes — to learn from my decisions.

**Impl:** Would require storing full match action history with timestamps. Draft pick order is one component of a broader match replay system.

---

### AC-D22: Custom gem art

Gems display custom artwork instead of (or in addition to) emoji/placeholders, making the draft visually rich.

**Impl:** ArtRegistry system designed in GDD. `registerAllGemArt()` maps affix IDs to image URLs. GemCard already has `getGemArt()` hook point.
