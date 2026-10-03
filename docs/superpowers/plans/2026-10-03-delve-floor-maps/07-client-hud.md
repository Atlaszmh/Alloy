# Delve floor maps C2 · HUD, dialogs and floor flow (client) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dive's client side of a generated floor: the HUD snapshot reads the engine's map (`hudMapOf`) and its interact prompts; the minimap draws the fog, the revealed rooms and their icons, the exit and the compass toward it, and only the foes in sight; the floor panel counts "Rooms explored n / m"; a plaque over the interactable in reach names the device's input and what it does ("C Open", "A Pray") with the engine's words and a prayer's progress; the shrines' blessings join the buff row; the exit gate asks first ("Leave the floor? n rooms unexplored", a kit dialog) and the anvil alcove opens the stop's power-up cards, each pausing the arena; a generated floor ends on `world.exited`, the open room still on `cleared`; and under `alloy:delve:autopilot` the bot takes the exit and the alcove itself, with no dialog.

**Architecture:** `snapshot(world, renderer, prompt)` (`arena/useArenaCore.ts`) gains `map.floor` (the engine's `HudMap` from `hudMapOf`, with the world's own `cells` and `fog` arrays by reference, only on a generated floor), `prompt` (`InteractHud`, from the latest `interactPrompt` event, which the core keeps across a step with `promptAfter`, else from `world.channel`) and the shrine blessings in `buffs` (`HudBuff` becomes a union). `Minimap` keeps a generated floor's fog layer on its own canvas (`drawFog`), redrawn only when `fogVersion` (or the scale) moves. `StopPanel` takes optional `ops` (`StopOps`: its dry runs and its take), so `AlcoveDialog` (`arena/FloorDialogs.tsx`, with `ExitConfirm`) reuses its cards over `takeAlcove`, dry-running on the stop's own rules (`takeStop` on the profile as if at a stop). `InteractPlaque` (`arena/hud/InteractPlaque.tsx`) sits over the arena outside the HUD grid and follows its prop each frame from `heroScreen()` and `pixelsPerUnit()` (no renderer change). `useArena.ts` ends a floor on `floorOver` (`exited` at once), routes `exitRequest` and `alcoveOpen` (`routeFloorEvents`: to the page, or under the autopilot straight to `exitFloor` and the bot's alcove pick), banks before an alcove's offers and its take (`alcoveTake`), and returns `leave` and `alcove`; `DelveRun.tsx` holds the two dialogs, pauses under them and draws the plaque. Nothing here touches `ArenaRenderer.ts` or `arena/pixel/*` (C1's), nor any engine file.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, Vitest 3 (jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-03-delve-floor-maps-design.md` (authoritative): "Interacting, special rooms and the exit" (the exit gate, the anvil alcove, the shrine, "HUD count"), "Fog of war and the minimap" (`hudMapOf`, the exit hint, the fog layer's redraw), "Rendering" (interact plaques, dialogs), "Testing → Client", and the C2 row of "Phases and parallel areas". Phase A's plan, `01-contract.md` in this folder ("For the areas → C2", "Where the spec left room"), is the contract built on. The overview is `00-overview.md`.

---

## Base

- **Starts from:** `maps/main` at `eb4742c5` (Phase A merged), in this area's worktree `C:/Projects/alloy-maps-c2` on branch `maps/c2`:

```powershell
C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/mkwt.ps1 -Name alloy-maps-c2 -Branch maps/c2 -Base maps/main
```

  Every path below is relative to that worktree's root, `/c/Projects/alloy-maps-c2` in Git Bash.
- **Needs nothing merged first.** Tasks 1–8 build on Phase A's stubs and mock them in their tests (`hudMapOf`, `exitFloor`, `alcoveOffers`, `takeAlcove` throw until B3 fills them; the client never calls one on the open room, so every floor plays as before until B1 turns the generated path on). **Task 9 waits for B4** (it imports `takeBestAlcove`, see Cross-area needs).
- **Anchors:** every edit was generated from, and checked against, `maps/main` at `eb4742c5`: applied in this plan's order, task by task, they give exactly the files the tests below were run on (see Verification).
- **Before Task 1:** build the engine once for the client's junction, and measure the client:

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run)
```

  Expected: tsup's "Build success" lines; no type errors; at `eb4742c5` the client suite reads **1256 tests in 154 files**. Call them **N** tests in **G** files; each task says where they go.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/arena/useArenaCore.ts` | `HudMap.floor`; `InteractHud`, `PromptEvent`, `promptAfter`; `snapshot(world, renderer, prompt)` with the generated floor's map, `prompt` and the shrine blessings; `HudBuff` a union; the core keeps the latest prompt; `readArenaFlags` exported |
| `packages/client/src/features/delve/arena/hud/BuffRow.tsx` | a shrine blessing's tile (no countdown; the floor's cyan, the dive's gold) |
| `packages/client/src/features/delve/kit/glyph-art.ts`, `kit/types.ts` | the `shrine` glyph (a mana crystal on an altar); `types.ts` is hand-edited, never formatted |
| `packages/client/src/features/delve/arena/hud/Minimap.tsx` | `minimapScale`, `drawFog`, the generated floor in `drawMinimap` (fog layer, rooms, icons, exit, compass), the kept fog canvas |
| `packages/client/src/features/delve/arena/hud/FloorColumn.tsx` | "Rooms explored n / m" on a generated floor |
| `packages/client/src/features/delve/StopPanel.tsx` | `StopOps` and the optional `ops` prop (dry runs and the take) |
| `packages/client/src/features/delve/arena/FloorDialogs.tsx` (new) | `ExitConfirm`, `AlcoveDialog` |
| `packages/client/src/features/delve/arena/hud/InteractPlaque.tsx` (new) | `INTERACT_VERB`, `screenOf`, `InteractPlaque` |
| `packages/client/src/features/delve/arena/hud/SkillDock.tsx` | `bindingOf` exported |
| `packages/client/src/features/delve/arena/useArena.ts` | `ArenaUiEvent`'s `exitRequest` and `alcove`; `floorOver`, `routeFloorEvents`, `alcoveTake`; `checkEnd` on `exited`; `leave`, `alcove` |
| `packages/client/src/pages/DelveRun.tsx` | the exit confirm and the alcove dialog, pausing under them; the plaque |
| tests: `features/delve/__tests__/arena-hud-snapshot.test.ts`, `arena/hud/__tests__/SkillDock.test.tsx`, `arena/hud/__tests__/Minimap.test.tsx`, `arena/hud/__tests__/FloorColumn.test.tsx`, `__tests__/StopPanel.test.tsx`, `pages/__tests__/DelveRun.test.tsx` | the above |
| tests (new): `features/delve/__tests__/FloorDialogs.test.tsx`, `arena/hud/__tests__/InteractPlaque.test.tsx`, `features/delve/__tests__/arena-floor.test.ts` | the dialogs, the plaque, the floor flow |

Not touched: `ArenaRenderer.ts`, `arena/pixel/*` (C1's), the engine, the stores, the E2E specs (Phase D's).

## Cross-area needs

**X1 · B3 (`arpg/interact.ts`, `arpg/fog.ts`, `delve/stops.ts`): what the client reads.** Nothing here edits B3's files; the client relies on:
1. `interactPrompt` is sent **every tick** while an unused interactable is in reach (Phase A's doc on `interactTick`: "its `interactPrompt` each step"): `promptAfter` drops the plaque after a tick without one. `text` is the thing's name, and a shrine's blessing ("Shrine of Vigor: +20% damage for this floor", from `shrines.json`'s `name` and `text`); the verb ("Open", "Pray", "Forge", "Leave") is the client's, by `interactable`. A refilled-potions shrine's text says so ("Refill your potions").
2. `hudMapOf` is only ever called on a generated floor (`!world.map.open`); its `foes` are those in sight and its `rooms` the revealed ones; a room whose `icon` is `'gate'` is drawn at `exit` (only once `exit` is non-null) rather than at the room's centre.
3. `takeAlcove(registry, profile, world, action)` acts on the alcove the hero opened (the client passes no id); the client banks the world just before it (and before `alcoveOffers`), so its own bank finds `pending` empty. A refused take leaves the alcove and the world untouched (the dialog stays open on the reason). The client's dry runs never call it: they ask `takeStop` on the profile as if at a stop offering the alcove's kinds (`FloorDialogs.tsx`'s `atStop`), so `takeAlcove`'s rules should match `takeStop`'s op for op (payment from `banked` and the haul, then the stockpile).
4. `exitFloor(world)` only sets `world.exited`; the page's `checkEnd` ends the floor on the next frame (`clearFloor` → `completeFloor`, which B3 makes complete on `exited`). The 'cleared' UI event (the "DEPTH N CLEARED" banner) follows as for the open room.
5. A shrine blessing is on `hero.floorBuffs` / `hero.diveBuffs` (the HUD lists both, by `Buff.shrine`'s name); if the potion refill is pushed there too it shows as a tile.

**X2 · B4 (`delve/autopilot.ts`, `src/index.ts`): `takeBestAlcove`.** For the client's autopilot path (Task 9) the bot's alcove pick, exported from the engine:

```ts
/**
 * At an anvil alcove mid-floor, the bot's pick (the stop's preference ladder over
 * `alcoveOffers`), taken through `takeAlcove`; the profile unchanged when it takes nothing.
 */
export function takeBestAlcove(
  registry: DataRegistry,
  profile: DelveProfile,
  world: ArpgWorld,
  id: string,
): DelveProfile;
```

  with `takeBestAlcove` added to `src/index.ts`'s `export { runAutopilot, takeBestStop } from './delve/autopilot.js';`. `playFloor` can use the same function. The bot also presses `interact` at the gate; the client then calls `exitFloor` at once (Task 7).

**X3 · Phase D (E2E, docs, version).**
1. **E2E that wait for B:** every autopilot dive on a generated floor (`e2e/delve.spec.ts`, `delve-gamepad.spec.ts`, `delve-runes.spec.ts`, `delve-quests.spec.ts`) needs B1 (the map), B3 (`exitRequest`, `completeFloor` on exit) and B4 (the bot walking to the gate and pressing interact): once B1 turns the generated path on, an autopilot floor only ends when the bot takes the exit. "Opening a vault and taking the exit" needs B1 + B3. The responsive probes for the exit confirm and the alcove dialog need B3's events (or a dev hook raising them).
2. A manual check with a pad: A at the gate opens the confirm with Leave focused, a second A leaves; B or Esc stays; an alcove's first card has the focus.
3. CLAUDE.md (the dive's HUD paragraph: the plaque, the dialogs, the minimap's fog, "Rooms explored") and the bump to 0.60.0 are Phase D's.

## Where the spec left room

1. **Where the engine's map rides.** The client's `HudMap` keeps its fields (`view`, `hero`, `foes` by rank, `drops` by colour) and gains `floor?: HudMap(engine) & { cells, fog }` on a generated floor: `foes` then come from `hudMapOf` (in sight only) and `drops` are the world's coloured drops whose cell the fog has seen (the engine's `drops` carry no item, so no colour). `cells` and `fog` are the world's own arrays (never copied); the minimap redraws its fog layer only when `fogVersion` or its scale moves. On the open room nothing changes (no `floor`, and `hudMapOf` is never called), so the Training Grounds and every floor before B1 draw as today.
2. **The prompt across frames.** The engine sends `interactPrompt` each tick in reach; a frame that runs no tick keeps the last one, a tick without one clears it (`promptAfter`). A shrine's prayer keeps its plaque from `world.channel` whether or not a prompt came.
3. **The plaque** is DOM over the arena (outside the HUD grid, in the HUD's zoom), placed every frame at the prop's point lifted by its size (`layouts.json → props`), from `heroScreen()` + (point − hero) × `pixelsPerUnit()`: the renderer (C1's) is not touched. The verbs: chest **Open**, shrine **Pray** (**Praying** with a bar while the channel runs), alcove **Forge**, gate **Leave**. It hides while anything pauses the arena.
4. **The exit confirm** always asks, even with every room explored ("Every room explored."), and says "Loot left on the floor is lost." (the spec's drops rule). Leave is focused (A or Enter), Back stays (B or Esc).
5. **The alcove's dry runs** use the stop's own op on the profile as if at a stop (`takeStop`), since `takeAlcove` banks and marks the world. Its offers come with a bank first, so they and the dry runs see the floor's pickups. Back leaves the alcove unused (the engine rolls the same offers again).
6. **Ending on the exit** is immediate (a clear waits 0.4 s, a death `END_DELAY`): the floor's loot is left behind.
7. **Blessings in the buff row** come after the timed buffs, the dive's then the floor's, each a 38 px tile with the new `shrine` glyph and no countdown, bordered cyan (the floor) or gold (the dive), named in its label and title ("Shrine of Vigor, this floor").
8. **The minimap's colours** (ENDESGA 32): seen floor `#262b44`, in sight `#3a4466`, a revealed room's walls `#8b9bb4`, a sealed room's `#a22633`, the exit and its compass `#63c74d`; icons are the kit's glyphs (chest, shrine, anvil, skull; the gate is the door glyph), half a unit a glyph pixel, a used one at 45%.
9. **"Rooms explored n / m"** sits above the foes-left line, which stays (the E2E read it).
10. **Autopilot:** `alloy:delve:autopilot` is read once when the dive's arena mounts (`readArenaFlags`); under it `exitRequest` calls `exitFloor` and `alcoveOpen` banks and hands the alcove to the bot (`takeBestAlcove`, Task 9; until then an alcove is left alone), and no dialog opens.

## Conventions

The overview's shared conventions. In short:
- **One commit per task** on `maps/c2`, staged by path, never `git add -A`. The trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` is the last `-m`. Don't push and don't merge.
- **Every command runs from the worktree root** in a subshell, and every commit block starts with `cd /c/Projects/alloy-maps-c2`.
- **Line endings:** the worktree's files are CRLF (`core.autocrlf`); keep each file's own (the Edit tool does); new files are LF. Prettier runs as `npx prettier --end-of-line auto`.
- **Prettier:** every file this plan edits passes `prettier --check --end-of-line auto` at the base except `packages/client/src/features/delve/kit/types.ts` (its `GlyphId` union is laid out by hand): that one is only hand-edited, never formatted. The code below is already formatted, so the commit blocks' `--write` changes nothing if typed as written.
- **How the edits read:** "In `f`:" names the file for the edits under it. "Replace:" (a block) "with:" (a block) is one Edit (old, new). "Append at the end of the file:" adds a blank line and the block after the last line. "Create `f`:" is a Write. Within a file, apply its edits top to bottom; every old block is unique in its file at that point.
- **The client only:** no engine edit, so the bundle built before Task 1 serves every task (Task 9 needs B4's merged and rebuilt).
- **Vitest doesn't type-check:** every task runs the client typecheck too.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |
| Engine bundle | `(cd packages/engine && npx tsup)` |

---

## Chunk 1: The snapshot and the buff row

### Task 1: The snapshot reads a generated floor and the interact prompt

The engine's map (`hudMapOf`, B3's stub) only on a generated floor, with the world's grid and fog by reference; only the foes in sight and the loot in seen cells; the interactable in reach (`prompt`) from the latest `interactPrompt`, kept across a frame that ran no tick (`promptAfter`), or from a prayer under way.

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts`
- Modify: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`:

Replace:

```ts
import { describe, it, expect } from 'vitest';
```

with:

```ts
import { describe, it, expect, vi } from 'vitest';
```

Replace:

```ts
  defaultMoveset,
  sandboxWeapon,
```

with:

```ts
  defaultMoveset,
  hudMapOf,
  sandboxWeapon,
```

Replace:

```ts
  type HeroStatsExtra,
  type MonsterEntity,
} from '@alloy/engine';
import { snapshot } from '../arena/useArena';
```

with:

```ts
  type HeroStatsExtra,
  type HudMap,
  type MonsterEntity,
} from '@alloy/engine';
import { snapshot } from '../arena/useArena';
import { promptAfter, type PromptEvent } from '../arena/useArenaCore';
```

Replace:

```ts
const registry = getDelveRegistry();
const STEP
```

with:

```ts
// The floor flow's map (B3's) is a stub until it lands: each test says what it returns.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  hudMapOf: vi.fn(),
}));

const registry = getDelveRegistry();
const STEP
```

Append at the end of the file:

```ts
describe('arena HUD snapshot: a generated floor', () => {
  /** The sandbox's open room marked generated, its fog all unseen: what the HUD reads from a map. */
  function generated() {
    const w = sandbox();
    w.map = { ...w.map, open: false };
    w.fog = new Uint8Array(w.width * w.height);
    return w;
  }
  const FLOOR: HudMap = {
    width: 26,
    height: 40,
    rooms: [
      {
        id: 0,
        kind: 'combat',
        rect: { x: 0, y: 0, w: 26, h: 40 },
        icon: null,
        used: false,
        cleared: false,
        sealed: false,
      },
    ],
    exit: null,
    hint: { x: 20, y: 2 },
    foes: [{ x: 3, y: 4, kind: 'elite' }],
    drops: [],
    explored: 1,
    total: 6,
    fogVersion: 4,
  };
  const prompt: PromptEvent = {
    kind: 'interactPrompt',
    id: '1:0',
    interactable: 'shrine',
    text: 'Shrine of Vigor: +20% damage for this floor',
  };

  it('maps it from the engine: its rooms, the foes in sight, the seen loot, and the grid and fog as they are', () => {
    vi.mocked(hudMapOf).mockReturnValue(FLOOR);
    const w = generated();
    w.monsters.push({ x: 9, y: 9, kind: 'normal' } as MonsterEntity); // not in sight
    const at = { born: 0, amount: 0, vacuum: false, dead: false };
    const rare = { rarity: 'rare' } as GearItem;
    w.drops.push(
      { ...at, id: 1, kind: 'item', x: 5.5, y: 6.5, item: rare },
      { ...at, id: 2, kind: 'item', x: 7.5, y: 8.5, item: rare },
    );
    w.fog[6 * w.width + 5] = 1; // the first drop's cell has been seen
    const map = snapshot(w, null).map;
    expect(hudMapOf).toHaveBeenCalledWith(w);
    expect(map.foes).toEqual([{ x: 3, y: 4, rank: 'elite' }]);
    expect(map.drops).toEqual([{ x: 5.5, y: 6.5, color: RARITY_COLOR.rare }]);
    expect(map.floor).toMatchObject({
      explored: 1,
      total: 6,
      fogVersion: 4,
      hint: { x: 20, y: 2 },
    });
    expect(map.floor!.fog).toBe(w.fog);
    expect(map.floor!.cells).toBe(w.map.cells);
  });

  it('never asks the engine on the open room', () => {
    vi.mocked(hudMapOf).mockClear();
    expect(snapshot(sandbox(), null).map.floor).toBeUndefined();
    expect(hudMapOf).not.toHaveBeenCalled();
  });

  it("shows the prompt's interactable where it stands, and a shrine's prayer as it goes", () => {
    const w = sandbox();
    w.map.rooms[0].interactable = { id: '1:0', kind: 'shrine', x: 10, y: 12, used: false };
    expect(snapshot(w, null).prompt).toBeUndefined();
    expect(snapshot(w, null, prompt).prompt).toEqual({
      id: '1:0',
      interactable: 'shrine',
      text: prompt.text,
      x: 10,
      y: 12,
      channel: null,
    });
    w.t = 5;
    w.channel = { id: '1:0', x: 10, y: 12, start: 4.75, until: 5.25 };
    expect(snapshot(w, null, prompt).prompt!.channel).toBeCloseTo(0.5);
    // The prayer keeps its plaque, prompt or not.
    expect(snapshot(w, null).prompt).toMatchObject({ id: '1:0', text: '', channel: 0.5 });
  });

  it('keeps the prompt through a step that ran no tick, and drops it after a tick without one', () => {
    const later: PromptEvent = { ...prompt, id: '1:3' };
    expect(promptAfter(null, [prompt], true)).toBe(prompt);
    expect(promptAfter(prompt, [], false)).toBe(prompt);
    expect(promptAfter(prompt, [], true)).toBeNull();
    expect(promptAfter(prompt, [prompt, later], true)).toBe(later);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts)`
Expected: FAIL, 3 failed | 12 passed (15): "maps it from the engine…" (`AssertionError: expected "spy" to be called with arguments`), "shows the prompt's interactable…" (`expected undefined to deeply equal { id: '1:0', …(5) }`), "keeps the prompt…" (`TypeError: promptAfter is not a function`). "never asks the engine on the open room" already passes.

- [ ] **Step 3: The snapshot**

In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:

```ts
  holdFull,
  moveNumbers,
```

with:

```ts
  holdFull,
  hudMapOf,
  moveNumbers,
```

Replace:

```ts
  type HeroStats,
  type ManaType,
```

with:

```ts
  type HeroStats,
  type HudMap as FloorHudMap,
  type InteractableKind,
  type ManaType,
```

Replace:

```ts
  /** Blocked cells, if the engine ever adds terrain; [] today. */
  terrain: { x: number; y: number; w: number; h: number }[];
}
```

with:

```ts
  /** Blocked cells, if the engine ever adds terrain; [] today. */
  terrain: { x: number; y: number; w: number; h: number }[];
  /**
   * A generated floor's map (`hudMapOf`: revealed rooms and their icons, the exit, its hint, the
   * rooms explored), with the grid and the fog it is drawn from (the world's own arrays, never
   * copied: the minimap redraws its fog when `fogVersion` moves); absent on the open room, whose
   * `foes` are then every foe and `drops` every drop.
   */
  floor?: FloorHudMap & { cells: Uint8Array; fog: Uint8Array };
}

/** The interactable in reach, for its plaque: the engine's prompt, where it stands, and a prayer's progress. */
export interface InteractHud {
  id: string;
  interactable: InteractableKind;
  /** The engine's words (`interactPrompt.text`): its name, and a shrine's blessing. */
  text: string;
  x: number;
  y: number;
  /** A shrine's prayer under way (`world.channel`), 0..1; null when none. */
  channel: number | null;
}

/** An `interactPrompt` event. */
export type PromptEvent = Extract<ArpgEvent, { kind: 'interactPrompt' }>;
```

Replace:

```ts
  buffs: HudBuff[];
  map: HudMap;
}
```

with:

```ts
  buffs: HudBuff[];
  map: HudMap;
  /** The interactable in reach (or the shrine being prayed at); absent when none. */
  prompt?: InteractHud;
}
```

Replace:

```ts
export function snapshot(world: ArpgWorld, renderer: { viewRect(): ViewRect } | null): ArenaHud {
  const h = world.hero;
```

with:

```ts
/**
 * The interact prompt after a step: the last one it sent; none when it ran a tick without one
 * (the engine sends it every tick while one is in reach); the one before when it ran no tick.
 */
export function promptAfter(
  prev: PromptEvent | null,
  events: readonly ArpgEvent[],
  ticked: boolean,
): PromptEvent | null {
  if (!ticked) return prev;
  let last: PromptEvent | null = null;
  for (const e of events) if (e.kind === 'interactPrompt') last = e;
  return last;
}

/** The plaque's interactable: the prompt's, else the shrine being prayed at; with its prayer's progress. */
function promptOf(world: ArpgWorld, e: PromptEvent | null): InteractHud | undefined {
  const id = e?.id ?? world.channel?.id;
  const it = id ? world.map.rooms.find((r) => r.interactable?.id === id)?.interactable : undefined;
  if (!it) return undefined;
  const ch = world.channel?.id === it.id ? world.channel : null;
  return {
    id: it.id,
    interactable: it.kind,
    text: e?.text ?? '',
    x: it.x,
    y: it.y,
    channel: ch ? Math.min(1, (world.t - ch.start) / Math.max(0.01, ch.until - ch.start)) : null,
  };
}

/** Whether a generated floor's fog has seen the cell at (x, y). */
function seenAt(world: ArpgWorld, x: number, y: number): boolean {
  const cx = Math.min(world.width - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(world.height - 1, Math.max(0, Math.floor(y)));
  return world.fog[cy * world.width + cx] > 0;
}

export function snapshot(
  world: ArpgWorld,
  renderer: { viewRect(): ViewRect } | null,
  prompt: PromptEvent | null = null,
): ArenaHud {
  const h = world.hero;
```

Replace:

```ts
  const held = h.swing?.released === null ? h.swing.held : null;
  return {
```

with:

```ts
  const held = h.swing?.released === null ? h.swing.held : null;
  // A generated floor's map comes from the engine: only the foes in sight, only seen loot.
  const floor = world.map.open ? null : hudMapOf(world);
  return {
```

Replace:

```ts
      foes: world.monsters.map((m) => ({ x: m.x, y: m.y, rank: m.kind })),
      drops: world.drops.flatMap((d) => {
        const color = mapColor(d);
        return color ? [{ x: d.x, y: d.y, color }] : [];
      }),
      terrain: [],
    },
  };
}
```

with:

```ts
      foes: (floor?.foes ?? world.monsters).map((m) => ({ x: m.x, y: m.y, rank: m.kind })),
      drops: world.drops.flatMap((d) => {
        const color = mapColor(d);
        return color && (!floor || seenAt(world, d.x, d.y)) ? [{ x: d.x, y: d.y, color }] : [];
      }),
      terrain: [],
      ...(floor && { floor: { ...floor, cells: world.map.cells, fog: world.fog } }),
    },
    prompt: promptOf(world, prompt),
  };
}
```

Replace:

```ts
  const manualRef = useRef(opts.manualAttack);
  modeRef.current = mode;
```

with:

```ts
  const manualRef = useRef(opts.manualAttack);
  /** The engine's latest interact prompt (`promptAfter`), for the snapshot. */
  const promptRef = useRef<PromptEvent | null>(null);
  modeRef.current = mode;
```

Replace:

```ts
    worldRef.current = world;
    hitstopRef.current.reset();
    finishedRef.current = false;
```

with:

```ts
    worldRef.current = world;
    hitstopRef.current.reset();
    finishedRef.current = false;
    promptRef.current = null;
```

Replace:

```ts
            const wasDead = world.heroDead;
            const events = stepWorld(
```

with:

```ts
            const wasDead = world.heroDead;
            const t0 = world.t;
            const events = stepWorld(
```

Replace:

```ts
              dt * flags.timescale,
            );
            if (events.length > 0) {
```

with:

```ts
              dt * flags.timescale,
            );
            promptRef.current = promptAfter(promptRef.current, events, world.t > t0);
            if (events.length > 0) {
```

Replace:

```ts
            setHud(snapshot(world, renderer));
          }
        });
```

with:

```ts
            setHud(snapshot(world, renderer, promptRef.current));
          }
        });
```

Replace:

```ts
      setHud(snapshot(world, rendererRef.current));
    }
  }, [mode.loadout, registry]);
```

with:

```ts
      setHud(snapshot(world, rendererRef.current, promptRef.current));
    }
  }, [mode.loadout, registry]);
```

- [ ] **Step 4: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts)`
Expected: PASS (15 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 4 tests in G files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/useArenaCore.ts src/features/delve/__tests__/arena-hud-snapshot.test.ts)
git add packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts
git commit -m "feat(client): the HUD snapshot reads a generated floor's map and the interact prompt" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: The shrines' blessings in the buff row

`HudBuff` becomes a union: the timed buffs as before, then a shrine's blessing (`{ id: 'shrine', shrine, name, dive }`), the dive's then the floor's, from `hero.diveBuffs` and `hero.floorBuffs`. `BuffRow` draws a blessing as a tile with the new `shrine` glyph and no countdown.

**Files:**
- Modify: `packages/client/src/features/delve/kit/types.ts` (hand-edited only), `kit/glyph-art.ts`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts`, `arena/hud/BuffRow.tsx`
- Modify: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`, `arena/hud/__tests__/SkillDock.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`:

Replace:

```ts
    w.t = 12; // Riposte and Quick are over
    expect(snapshot(w, null).buffs.map((b) => b.id)).toEqual(['barrier']);
  });
```

with:

```ts
    w.t = 12; // Riposte and Quick are over
    expect(snapshot(w, null).buffs.map((b) => b.id)).toEqual(['barrier']);
  });

  it("lists the shrines' blessings after them, the dive's then the floor's, by their shrine's name", () => {
    const w = sandbox();
    w.hero.floorBuffs = [{ shrine: 'vigor', effect: { damage: 0.2 } }];
    w.hero.diveBuffs = [{ shrine: 'devotion', effect: { damage: 0.1 } }];
    expect(snapshot(w, null).buffs).toEqual([
      { id: 'shrine', shrine: 'devotion', name: 'Shrine of Devotion', dive: true },
      { id: 'shrine', shrine: 'vigor', name: 'Shrine of Vigor', dive: false },
    ]);
  });
```

In `packages/client/src/features/delve/arena/hud/__tests__/SkillDock.test.tsx`:

Replace:

```tsx
  it("puts the snapshot's buffs beside them", () => {
    render(dock({ buffs: [{ id: 'barrier', left: 5, total: 6 }] }));
    expect(screen.getByRole('img', { name: 'Barrier, 5s left' })).toBeInTheDocument();
  });
```

with:

```tsx
  it("puts the snapshot's buffs beside them", () => {
    render(dock({ buffs: [{ id: 'barrier', left: 5, total: 6 }] }));
    expect(screen.getByRole('img', { name: 'Barrier, 5s left' })).toBeInTheDocument();
  });

  it("shows a shrine's blessing as a tile with no countdown: for the floor or the dive", () => {
    render(
      dock({
        buffs: [
          { id: 'shrine', shrine: 'devotion', name: 'Shrine of Devotion', dive: true },
          { id: 'shrine', shrine: 'vigor', name: 'Shrine of Vigor', dive: false },
        ],
      }),
    );
    const dive = screen.getByRole('img', { name: 'Shrine of Devotion, this dive' });
    const floor = screen.getByRole('img', { name: 'Shrine of Vigor, this floor' });
    expect(dive.querySelector('[data-glyph="shrine"]')).not.toBeNull();
    expect(dive).toHaveStyle({ borderColor: '#feae34' });
    expect(floor).toHaveStyle({ borderColor: '#2ce8f5' });
    expect(floor).not.toHaveTextContent(/\ds/);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/arena/hud/__tests__/SkillDock.test.tsx)`
Expected: FAIL, 2 failed | 36 passed (38): the snapshot's (`expected [] to deeply equal [ { id: 'shrine', …(3) }, …(1) ]`) and the dock's (`TypeError: Cannot destructure property 'name' of 'BUFF[b.id]' as it is undefined.`).

- [ ] **Step 3: The glyph, the union, the tile**

In `packages/client/src/features/delve/kit/types.ts`:

Replace:

```ts
  | 'skull' | 'anvil' | 'chest' | 'up' | 'down' | 'new' | 'potential'
```

with:

```ts
  | 'skull' | 'anvil' | 'chest' | 'shrine' | 'up' | 'down' | 'new' | 'potential'
```

In `packages/client/src/features/delve/kit/glyph-art.ts`:

Replace:

```ts
  // ── marks ──
  up: {
```

with:

```ts
  // A sanctum's shrine: a mana crystal on a stone altar (the floor maps' rooms, the buff row).
  shrine: {
    palette: { c: '#2ce8f5', g: '#8b9bb4' },
    rows: ['...c...', '..ccc..', '..ccc..', '...c...', '.ggggg.', '..ggg..', '.ggggg.'],
  },
  // ── marks ──
  up: {
```

In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:

```ts
/** A timed buff on the hero, for the HUD's buff row. No Galvanize: its spark is on the slots. */
export interface HudBuff {
  id: 'riposte' | 'quick' | 'barrier';
  /** Seconds left, from riposteUntil, quickUntil and barrier.until. */
  left: number;
  /** Its whole length when the balance fixes one; null for the barrier (its source sets it). */
  total: number | null;
}
```

with:

```ts
/** A buff on the hero, for the HUD's buff row. No Galvanize: its spark is on the slots. */
export type HudBuff =
  | {
      id: 'riposte' | 'quick' | 'barrier';
      /** Seconds left, from riposteUntil, quickUntil and barrier.until. */
      left: number;
      /** Its whole length when the balance fixes one; null for the barrier (its source sets it). */
      total: number | null;
    }
  /** A shrine's blessing (see the floor maps spec): for this floor or the rest of the dive. */
  | { id: 'shrine'; shrine: string; name: string; dive: boolean };
```

Replace:

```ts
/** Whether a generated floor's fog has seen the cell at (x, y). */
```

with:

```ts
/** The shrines' blessings on the hero, the dive's then the floor's, by their shrine's name. */
function blessings(h: ArpgWorld['hero']): HudBuff[] {
  const shrines = getDelveRegistry().getDelveData().shrines;
  return [h.diveBuffs, h.floorBuffs].flatMap((list, i) =>
    list.map((b) => ({
      id: 'shrine' as const,
      shrine: b.shrine,
      name: shrines.find((s) => s.id === b.shrine)?.name ?? b.shrine,
      dive: i === 0,
    })),
  );
}

/** Whether a generated floor's fog has seen the cell at (x, y). */
```

Replace:

```ts
    buffs: (
      [
        ['riposte', h.riposteUntil, bal.dodge.riposteWindow],
        ['quick', h.quickUntil, bal.reactions.lightningRodDuration],
        ['barrier', h.barrier?.until ?? 0, null],
      ] as const
    ).flatMap(([id, until, total]) => (until > t ? [{ id, left: until - t, total }] : [])),
```

with:

```ts
    buffs: [
      ...(
        [
          ['riposte', h.riposteUntil, bal.dodge.riposteWindow],
          ['quick', h.quickUntil, bal.reactions.lightningRodDuration],
          ['barrier', h.barrier?.until ?? 0, null],
        ] as const
      ).flatMap(([id, until, total]) => (until > t ? [{ id, left: until - t, total }] : [])),
      ...blessings(h),
    ],
```

In `packages/client/src/features/delve/arena/hud/BuffRow.tsx`:

Replace:

```tsx
const BUFF: Record<HudBuff['id'], { name: string; color: string }> = {
```

with:

```tsx
const BUFF: Record<Exclude<HudBuff['id'], 'shrine'>, { name: string; color: string }> = {
```

Replace:

```tsx
/** The dock's buff tiles: 38 px each, its glyph and its seconds left. */
export function BuffRow({ buffs }: { buffs: readonly HudBuff[] }) {
  if (buffs.length === 0) return null;
  return (
    <div className="ml-3 flex gap-[6px]">
      {buffs.map((b) => {
        const { name, color } = BUFF[b.id];
```

with:

```tsx
/** A shrine's blessing: for the floor, or the rest of the dive. */
const BLESSING = { floor: '#2ce8f5', dive: '#feae34' };

/** The dock's buff tiles: 38 px each, its glyph and its seconds left (a blessing has none). */
export function BuffRow({ buffs }: { buffs: readonly HudBuff[] }) {
  if (buffs.length === 0) return null;
  return (
    <div className="ml-3 flex gap-[6px]">
      {buffs.map((b, i) => {
        if (b.id === 'shrine') {
          const label = `${b.name}, ${b.dive ? 'this dive' : 'this floor'}`;
          return (
            <span
              key={`shrine-${i}`}
              role="img"
              aria-label={label}
              title={label}
              data-buff="shrine"
              className="flex h-[38px] w-[38px] items-center justify-center bg-[var(--k-well)]"
              style={{ border: `2px solid ${b.dive ? BLESSING.dive : BLESSING.floor}` }}
            >
              <Glyph id="shrine" size={20} />
            </span>
          );
        }
        const { name, color } = BUFF[b.id];
```

- [ ] **Step 4: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/arena/hud/__tests__/SkillDock.test.tsx src/features/delve/kit)`
Expected: PASS (the kit's glyph tests take the new glyph's grid).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 6 tests in G files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/kit/glyph-art.ts src/features/delve/arena/useArenaCore.ts src/features/delve/arena/hud/BuffRow.tsx src/features/delve/__tests__/arena-hud-snapshot.test.ts src/features/delve/arena/hud/__tests__/SkillDock.test.tsx)
git add packages/client/src/features/delve/kit/types.ts packages/client/src/features/delve/kit/glyph-art.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/hud/BuffRow.tsx packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts packages/client/src/features/delve/arena/hud/__tests__/SkillDock.test.tsx
git commit -m "feat(client): the shrines' blessings in the buff row, and a shrine glyph" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The minimap and the stop's cards

### Task 3: The minimap from fog and icons, and "Rooms explored n / m"

On a generated floor `drawMinimap` lays the fog layer (seen floor cells, those in sight brighter), frames the revealed rooms (a sealed one in red), draws their icons and the exit, and points a three-dot compass from the hero toward the exit hint until the exit is found. `Minimap` keeps the fog layer on its own canvas, redrawn only when `fogVersion` or the scale moves. The floor panel counts the rooms explored.

**Files:**
- Modify: `packages/client/src/features/delve/arena/hud/Minimap.tsx`, `arena/hud/FloorColumn.tsx`
- Modify: `packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx`, `arena/hud/__tests__/FloorColumn.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx`:

Replace:

```tsx
import { Minimap, drawMinimap } from '../Minimap';
```

with:

```tsx
import { Minimap, drawFog, drawMinimap } from '../Minimap';
```

Replace:

```tsx
  const ctx = {
    fillStyle: '',
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
```

with:

```tsx
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
```

Replace:

```tsx
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, clear: ctx.clearRect };
}
```

with:

```tsx
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fills,
    clear: ctx.clearRect,
    image: ctx.drawImage,
  };
}
```

Replace:

```tsx
  terrain: [{ x: 2, y: 2, w: 2, h: 1 }],
};
```

with:

```tsx
  terrain: [{ x: 2, y: 2, w: 2, h: 1 }],
};

/** A generated floor: a chest room seen, a sealed den, the exit unfound with its hint straight up. */
const FLOOR: NonNullable<HudMap['floor']> = {
  width: 26,
  height: 40,
  rooms: [
    {
      id: 0,
      kind: 'vault',
      rect: { x: 2, y: 2, w: 10, h: 8 },
      icon: 'chest',
      used: false,
      cleared: false,
      sealed: false,
    },
    {
      id: 1,
      kind: 'den',
      rect: { x: 14, y: 20, w: 8, h: 8 },
      icon: 'skull',
      used: false,
      cleared: false,
      sealed: true,
    },
  ],
  exit: null,
  hint: { x: 13, y: 2 },
  foes: [],
  drops: [],
  explored: 2,
  total: 5,
  fogVersion: 1,
  cells: new Uint8Array(26 * 40),
  fog: new Uint8Array(26 * 40).fill(1),
};
const GENERATED: HudMap = { ...MAP, terrain: [], floor: FLOOR };
```

Replace:

```tsx
describe('Minimap', () => {
```

with:

```tsx
describe('drawMinimap on a generated floor', () => {
  const hint = '#63c74d';

  it('lays the fog layer at the origin, then frames the revealed rooms (a sealed one in red) and draws their icons', () => {
    const { ctx, fills, image } = fakeContext();
    const fog = {} as CanvasImageSource;
    drawMinimap(ctx, GENERATED, 300, 150, fog);
    // 3 px per unit, the floor at (111, 15) as above.
    expect(image).toHaveBeenCalledWith(fog, 111, 15);
    const room = fills.filter((f) => f.color === '#8b9bb4');
    expect(room[0]).toEqual({ x: 117, y: 21, w: 30, h: 1, color: '#8b9bb4' });
    const sealed = fills.filter((f) => f.color === '#a22633');
    expect(sealed[0]).toEqual({ x: 153, y: 75, w: 24, h: 1, color: '#a22633' });
    // The chest's glyph at its room's centre (7, 6): (132, 33), two device px a glyph pixel.
    const chest = fills.filter((f) => f.color === '#e4a672');
    expect(chest.length).toBeGreaterThan(0);
    for (const f of chest) {
      expect(f.x).toBeGreaterThanOrEqual(120);
      expect(f.x + f.w).toBeLessThanOrEqual(144);
    }
  });

  it('points from the hero toward the exit hint until the exit is found, then marks the exit', () => {
    const { ctx, fills } = fakeContext();
    drawMinimap(ctx, GENERATED, 300, 150);
    const arrow = fills.filter((f) => f.color === hint);
    expect(arrow).toHaveLength(3);
    for (const f of arrow) {
      expect(Math.abs(f.x + f.w / 2 - (111 + 13 * 3))).toBeLessThanOrEqual(0.5); // straight up
      expect(f.y).toBeLessThan(15 + 36 * 3);
    }
    const found = fakeContext();
    drawMinimap(found.ctx, { ...GENERATED, floor: { ...FLOOR, exit: { x: 20, y: 5 } } }, 300, 150);
    const gate = found.fills.filter((f) => f.color === hint);
    expect(gate.length).toBeGreaterThan(3);
    for (const f of gate) {
      expect(f.x).toBeGreaterThanOrEqual(164);
      expect(f.x + f.w).toBeLessThanOrEqual(178);
    }
  });

  it('draws the fog: each seen floor cell, the ones in sight brighter, never a wall', () => {
    const { ctx, fills } = fakeContext();
    const floor = {
      ...FLOOR,
      width: 3,
      height: 2,
      cells: Uint8Array.from([0, 1, 0, 2, 0, 0]),
      fog: Uint8Array.from([1, 2, 0, 1, 2, 2]),
    };
    drawFog(ctx, floor, 2);
    expect(fills).toEqual([
      { x: 0, y: 0, w: 2, h: 2, color: '#262b44' },
      { x: 0, y: 2, w: 2, h: 2, color: '#262b44' },
      { x: 2, y: 2, w: 2, h: 2, color: '#3a4466' },
      { x: 4, y: 2, w: 2, h: 2, color: '#3a4466' },
    ]);
  });
});

describe('Minimap', () => {
```

Replace:

```tsx
    rerender(<Minimap map={{ ...MAP, hero: { x: 12, y: 30 } }} />);
    expect(clear).toHaveBeenCalledTimes(2);
  });
```

with:

```tsx
    rerender(<Minimap map={{ ...MAP, hero: { x: 12, y: 30 } }} />);
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it('keeps the fog layer while the fog stands still, and redraws it when fogVersion moves', () => {
    const { ctx, fills, image } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 150,
    } as DOMRect);
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
    const seen = () => fills.filter((f) => f.color === '#262b44').length;
    const { rerender } = render(<Minimap map={GENERATED} />);
    const once = seen();
    expect(once).toBeGreaterThan(0);
    rerender(<Minimap map={{ ...GENERATED, hero: { x: 12, y: 30 } }} />);
    expect(seen()).toBe(once);
    expect(image).toHaveBeenCalledTimes(2);
    rerender(<Minimap map={{ ...GENERATED, floor: { ...FLOOR, fogVersion: 2 } }} />);
    expect(seen()).toBe(2 * once);
  });
```

In `packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx`:

Replace:

```tsx
  it('shows no foe count until the arena reports', () => {
```

with:

```tsx
  it('counts the rooms explored on a generated floor, and not on the open room', () => {
    const floor = { explored: 2, total: 6 } as NonNullable<HudMap['floor']>;
    const { rerender } = render(<FloorColumn {...props} />);
    expect(screen.queryByTestId('rooms-explored')).toBeNull();
    rerender(<FloorColumn {...props} hud={{ ...HUD, map: { ...MAP, floor } }} />);
    expect(screen.getByTestId('rooms-explored')).toHaveTextContent('Rooms explored 2 / 6');
    expect(screen.getByTestId('monsters-left')).toHaveTextContent('12 foes left');
  });

  it('shows no foe count until the arena reports', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/Minimap.test.tsx src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx)`
Expected: FAIL, 5 failed | 8 passed (13): the generated floor's `drawMinimap` (`AssertionError: expected "spy" to be called with arguments: [ {}, 111, 15 ]`), the compass (`expected [] to have a length of 3 but got +0`), the fog (`TypeError: (0 , drawFog) is not a function`), the kept fog layer (`expected 0 to be greater than 0`) and the rooms count (`Unable to find an element by: [data-testid="rooms-explored"]`).

- [ ] **Step 3: The minimap and the count**

In `packages/client/src/features/delve/arena/hud/Minimap.tsx`:

Replace:

```tsx
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { useUiScale } from '../../kit';
import type { HudMap } from '../useArenaCore';
```

with:

```tsx
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { HudIcon } from '@alloy/engine';
import { useUiScale, type GlyphId } from '../../kit';
import { GLYPH_ART, pixelRuns } from '../../kit/glyph-art';
import type { HudMap } from '../useArenaCore';
```

Replace:

```tsx
const HERO = '#fee761';
```

with:

```tsx
const HERO = '#fee761';
/** A generated floor's: seen floor, floor in sight now, a revealed room's walls, a sealed room's. */
const SEEN = '#262b44';
const LIT = '#3a4466';
const ROOM = '#8b9bb4';
const SEALED = '#a22633';
/** The exit and the compass hint toward it. */
const EXIT = '#63c74d';
/** Each room icon's pixel glyph (the exit gate is the kit's door), and its tint where it has one colour. */
const ICON: Record<HudIcon, { glyph: GlyphId; tint: string }> = {
  chest: { glyph: 'chest', tint: ROOM },
  shrine: { glyph: 'shrine', tint: ROOM },
  anvil: { glyph: 'anvil', tint: ROOM },
  skull: { glyph: 'skull', tint: SEALED },
  gate: { glyph: 'door', tint: EXIT },
};
```

Replace:

```tsx
/**
 * Draws `map` on a `w` × `h` device-px canvas: the arena fitted at whole device px per unit and
 * centred, then its terrain, border, the camera's view, the drops, the foes and the hero.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: HudMap,
  w: number,
  h: number,
): void {
  const s = Math.max(1, Math.floor(Math.min(w / map.width, h / map.height)));
```

with:

```tsx
/** Device px per arena unit: the most whole px that fit the floor in `w` × `h`, at least 1. */
export function minimapScale(map: { width: number; height: number }, w: number, h: number): number {
  return Math.max(1, Math.floor(Math.min(w / map.width, h / map.height)));
}

/**
 * A generated floor's fog layer at `s` device px a cell: each floor cell the hero has seen, those in
 * sight now brighter. The minimap keeps it and redraws it only when the fog moves (`fogVersion`).
 */
export function drawFog(
  ctx: CanvasRenderingContext2D,
  floor: NonNullable<HudMap['floor']>,
  s: number,
): void {
  ctx.clearRect(0, 0, floor.width * s, floor.height * s);
  for (const [level, color] of [
    [1, SEEN],
    [2, LIT],
  ] as const) {
    ctx.fillStyle = color;
    floor.fog.forEach((f, i) => {
      if (f === level && floor.cells[i] !== 1)
        ctx.fillRect((i % floor.width) * s, Math.floor(i / floor.width) * s, s, s);
    });
  }
}

/**
 * Draws `map` on a `w` × `h` device-px canvas: the arena fitted at whole device px per unit and
 * centred, then its terrain; on a generated floor the fog layer (`fog`, from `drawFog`), the revealed
 * rooms and their icons and the exit; the border, the camera's view, the drops, the foes, the
 * compass toward an unfound exit once hinted, and the hero.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: HudMap,
  w: number,
  h: number,
  fog?: CanvasImageSource,
): void {
  const s = minimapScale(map, w, h);
```

Replace:

```tsx
    ctx.fillRect(X(x) - Math.floor(d / 2), Y(y) - Math.floor(d / 2), d, d);
  };
```

with:

```tsx
    ctx.fillRect(X(x) - Math.floor(d / 2), Y(y) - Math.floor(d / 2), d, d);
  };
  /** A room icon's glyph centred on (x, y), half a unit a glyph pixel; a used one faded. */
  const icon = (id: HudIcon, x: number, y: number, used: boolean) => {
    const art = GLYPH_ART[ICON[id].glyph];
    const k = Math.max(1, Math.round(s / 2));
    const l = X(x) - Math.floor((art.rows[0].length * k) / 2);
    const t = Y(y) - Math.floor((art.rows.length * k) / 2);
    ctx.globalAlpha = used ? 0.45 : 1;
    for (const r of pixelRuns(art.rows)) {
      ctx.fillStyle = (r.ch === '#' ? ICON[id].tint : art.palette?.[r.ch]) ?? ICON[id].tint;
      ctx.fillRect(l + r.x * k, t + r.y * k, r.w * k, k);
    }
    ctx.globalAlpha = 1;
  };
```

Replace:

```tsx
    ctx.fillRect(X(c.x), Y(c.y), Math.round(c.w * s), Math.round(c.h * s));
  frame(X(0), Y(0), X(map.width), Y(map.height), BORDER);
```

with:

```tsx
    ctx.fillRect(X(c.x), Y(c.y), Math.round(c.w * s), Math.round(c.h * s));
  const floor = map.floor;
  if (floor) {
    if (fog) ctx.drawImage(fog, ox, oy);
    for (const { rect: r, sealed } of floor.rooms)
      frame(X(r.x), Y(r.y), X(r.x + r.w), Y(r.y + r.h), sealed ? SEALED : ROOM);
    for (const r of floor.rooms)
      if (r.icon && r.icon !== 'gate')
        icon(r.icon, r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2, r.used);
    if (floor.exit) icon('gate', floor.exit.x, floor.exit.y, false);
  }
  frame(X(0), Y(0), X(map.width), Y(map.height), BORDER);
```

Replace:

```tsx
  for (const f of map.foes) dot(f.x, f.y, FOE_SIZE[f.rank], FOE);
  dot(map.hero.x, map.hero.y, 1.2, HERO);
```

with:

```tsx
  for (const f of map.foes) dot(f.x, f.y, FOE_SIZE[f.rank], FOE);
  const hint = floor && !floor.exit ? floor.hint : null;
  if (hint) {
    // A compass out of the hero toward the unfound exit: three dots, the head the biggest.
    const dx = hint.x - map.hero.x;
    const dy = hint.y - map.hero.y;
    const len = Math.hypot(dx, dy) || 1;
    [3, 4, 5].forEach((u, i) =>
      dot(map.hero.x + (dx / len) * u, map.hero.y + (dy / len) * u, 0.5 + i * 0.3, EXIT),
    );
  }
  dot(map.hero.x, map.hero.y, 1.2, HERO);
```

Replace:

```tsx
/**
 * The floor panel's map: a 2D canvas whose backing store is its zoomed box × devicePixelRatio
 * (re-measured on resize and on a HUD scale change), redrawn whenever `map` changes.
 */
```

with:

```tsx
/**
 * The floor panel's map: a 2D canvas whose backing store is its zoomed box × devicePixelRatio
 * (re-measured on resize and on a HUD scale change), redrawn whenever `map` changes; a generated
 * floor's fog layer is kept on its own canvas until the fog moves.
 */
```

Replace:

```tsx
  const [size, setSize] = useState({ w: 0, h: 0 });
```

with:

```tsx
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** The fog layer, with the fog, version and scale it was drawn at. */
  const fogRef = useRef<{ canvas: HTMLCanvasElement; fog: Uint8Array; key: string } | null>(null);
```

Replace:

```tsx
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx && map && size.w > 0 && size.h > 0) drawMinimap(ctx, map, size.w, size.h);
  }, [map, size]);
```

with:

```tsx
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !map || size.w <= 0 || size.h <= 0) return;
    /** The kept fog layer, redrawn when the fog, its version or the scale moves. */
    const fogLayer = (floor: NonNullable<HudMap['floor']>) => {
      const s = minimapScale(map, size.w, size.h);
      const key = `${floor.fogVersion}:${s}`;
      const kept = fogRef.current;
      if (kept && kept.fog === floor.fog && kept.key === key) return kept.canvas;
      const canvas = kept?.canvas ?? document.createElement('canvas');
      canvas.width = floor.width * s;
      canvas.height = floor.height * s;
      const fctx = canvas.getContext('2d');
      if (fctx) drawFog(fctx, floor, s);
      fogRef.current = { canvas, fog: floor.fog, key };
      return canvas;
    };
    drawMinimap(ctx, map, size.w, size.h, map.floor && fogLayer(map.floor));
  }, [map, size]);
```

In `packages/client/src/features/delve/arena/hud/FloorColumn.tsx`:

Replace:

```tsx
        <div className="flex items-baseline justify-between text-[15px] text-[var(--k-text-3)]">
          {hud && (
```

with:

```tsx
        {hud?.map.floor && (
          <span className="text-[15px] text-[var(--k-text-3)]" data-testid="rooms-explored">
            Rooms explored{' '}
            <b className="k-disp text-[20px] text-[var(--k-text)]">
              {hud.map.floor.explored} / {hud.map.floor.total}
            </b>
          </span>
        )}
        <div className="flex items-baseline justify-between text-[15px] text-[var(--k-text-3)]">
          {hud && (
```

- [ ] **Step 4: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud)`
Expected: PASS.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 11 tests in G files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/Minimap.tsx src/features/delve/arena/hud/FloorColumn.tsx src/features/delve/arena/hud/__tests__/Minimap.test.tsx src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx)
git add packages/client/src/features/delve/arena/hud/Minimap.tsx packages/client/src/features/delve/arena/hud/FloorColumn.tsx packages/client/src/features/delve/arena/hud/__tests__/Minimap.test.tsx packages/client/src/features/delve/arena/hud/__tests__/FloorColumn.test.tsx
git commit -m "feat(client): the minimap draws a generated floor's fog, rooms, icons, exit and compass; rooms explored" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: `StopPanel` over other ops

The stop's cards and pickers run their dry runs and their take through `ops` (`StopOps`), defaulting to the stop's own (`takeStop`), so the alcove dialog can reuse them over `takeAlcove`.

**Files:**
- Modify: `packages/client/src/features/delve/StopPanel.tsx`
- Modify: `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`:

Replace:

```tsx
  it('Back has the focus; Escape closes the picker, and the focus returns to its card', () => {
```

with:

```tsx
  it('runs its dry runs and its take through `ops` when given (the Anvil alcove), never the stop', () => {
    store().setProfile({ ...store().profile, bag: [helm] });
    store().startDive(1);
    const profile = store().profile;
    const dry = vi.fn(() => ({ ok: false, profile, reason: 'Not at this alcove' }));
    const take = vi.fn(() => ({ ok: true, profile }));
    render(<StopPanel stop={{ offers: ['equip', 'slot'], taken: false }} ops={{ dry, take }} />);
    fireEvent.click(screen.getByTestId('stop-slot'));
    expect(dry).toHaveBeenCalledWith(profile, expect.objectContaining({ kind: 'slot' }));
    expect(screen.getAllByText('Not at this alcove').length).toBeGreaterThan(0);
    fireEvent.click(back());
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(take).toHaveBeenCalledWith({ kind: 'equip', uid: 'h1' });
    expect(store().profile.equipped.helm?.uid).not.toBe('h1');
  });

  it('Back has the focus; Escape closes the picker, and the focus returns to its card', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx)`
Expected: FAIL, 1 failed | 14 passed (15): `AssertionError: expected "spy" to be called with arguments: [ …(2) ]` (the panel still asks `takeStop`).

- [ ] **Step 3: The ops**

In `packages/client/src/features/delve/StopPanel.tsx`:

Replace:

```tsx
  type Move,
  type StopAction,
  type StopKind,
} from '@alloy/engine';
```

with:

```tsx
  type Move,
  type ProfileActionResult,
  type StopAction,
  type StopKind,
} from '@alloy/engine';
```

Replace:

```tsx
/**
 * The stop's power-ups (see the weapon movesets spec): the kinds offered after the depth just
 * cleared, as plate cards. A card expands in place to its picker, its own pad scope with a Back;
 * taking one spends the stop (the engine's `takeStop`), and skipping it is choosing a door.
 */
export function StopPanel({ stop }: { stop: DiveStop }) {
```

with:

```tsx
/** What a stop's pickers run: the op as a dry run (whether it goes through, and why not), and the take. */
export interface StopOps {
  dry: (profile: DelveProfile, action: StopAction) => ProfileActionResult;
  take: (action: StopAction) => ProfileActionResult;
}

/** The stop's own: the engine's `takeStop`, the take through the store. */
const STOP_OPS: StopOps = {
  dry: (profile, action) => takeStop(getDelveRegistry(), profile, action),
  take: (action) => useDelveStore.getState().takeStop(action),
};

/**
 * The stop's power-ups (see the weapon movesets spec): the kinds offered after the depth just
 * cleared, as plate cards. A card expands in place to its picker, its own pad scope with a Back;
 * taking one spends the stop (the engine's `takeStop`), and skipping it is choosing a door. The
 * Anvil alcove (see the floor maps spec) shows the same cards over its own `ops`.
 */
export function StopPanel({ stop, ops = STOP_OPS }: { stop: DiveStop; ops?: StopOps }) {
```

Replace:

```tsx
        <StopPicker kind={open} onClose={close} onTaken={taken} />
```

with:

```tsx
        <StopPicker kind={open} onClose={close} onTaken={taken} ops={ops} />
```

Replace:

```tsx
  onTaken,
}: {
  kind: StopKind;
  onClose: () => void;
  onTaken: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const take = (action: StopAction) => {
    const res = useDelveStore.getState().takeStop(action);
```

with:

```tsx
  onTaken,
  ops,
}: {
  kind: StopKind;
  onClose: () => void;
  onTaken: () => void;
  ops: StopOps;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const take = (action: StopAction) => {
    const res = ops.take(action);
```

Replace:

```tsx
      {kind === 'slot' && <SlotPick take={take} />}
      {kind === 'move' && <MovePick take={take} />}
```

with:

```tsx
      {kind === 'slot' && <SlotPick take={take} dryRun={ops.dry} />}
      {kind === 'move' && <MovePick take={take} dryRun={ops.dry} />}
```

Replace:

```tsx
type Take = (action: StopAction) => void;
```

with:

```tsx
type Take = (action: StopAction) => void;
type DryRun = StopOps['dry'];
```

Replace:

```tsx
function SlotPick({ take }: { take: Take }) {
```

with:

```tsx
function SlotPick({ take, dryRun }: { take: Take; dryRun: DryRun }) {
```

Replace:

```tsx
        const dry = takeStop(registry, profile, { kind: 'slot', skill: s });
```

with:

```tsx
        const dry = dryRun(profile, { kind: 'slot', skill: s });
```

Replace:

```tsx
function MovePick({ take }: { take: Take }) {
```

with:

```tsx
function MovePick({ take, dryRun }: { take: Take; dryRun: DryRun }) {
```

Replace:

```tsx
  const dry = edit && changed ? takeStop(registry, profile, { kind: 'move', ...edit }) : null;
```

with:

```tsx
  const dry = edit && changed ? dryRun(profile, { kind: 'move', ...edit }) : null;
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx src/features/delve/stop)`
Expected: PASS.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 12 tests in G files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/StopPanel.tsx src/features/delve/__tests__/StopPanel.test.tsx)
git add packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/__tests__/StopPanel.test.tsx
git commit -m "refactor(client): StopPanel takes its dry runs and its take as ops" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: The dialogs and the plaque

### Task 5: The exit confirm and the alcove dialog

Two kit dialogs: `ExitConfirm` ("Leave the floor?", the rooms unexplored, the loot left behind; Leave focused, Back stays) and `AlcoveDialog` (the stop's cards over the alcove's offers; a take goes to `onTake` and closes it on success; the dry runs ask `takeStop` on the profile as if at a stop).

**Files:**
- Create: `packages/client/src/features/delve/arena/FloorDialogs.tsx`
- Create: `packages/client/src/features/delve/__tests__/FloorDialogs.test.tsx`

- [ ] **Step 1: The failing tests**

Create `packages/client/src/features/delve/__tests__/FloorDialogs.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { generateItem, SeededRNG, type ProfileActionResult } from '@alloy/engine';
import { AlcoveDialog, ExitConfirm } from '../arena/FloorDialogs';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

describe('ExitConfirm', () => {
  it('asks before leaving: the rooms unexplored, Leave first, Back stays', () => {
    const onLeave = vi.fn();
    const onStay = vi.fn();
    render(<ExitConfirm unexplored={2} onLeave={onLeave} onStay={onStay} />);
    const dialog = screen.getByTestId('exit-confirm');
    expect(dialog).toHaveTextContent('Leave the floor?');
    expect(screen.getByTestId('exit-unexplored')).toHaveTextContent('2 rooms unexplored.');
    expect(dialog).toHaveTextContent('Loot left on the floor is lost.');
    expect(screen.getByTestId('exit-leave')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onStay).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('exit-leave'));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('counts one room, or none', () => {
    const { rerender } = render(<ExitConfirm unexplored={1} onLeave={vi.fn()} onStay={vi.fn()} />);
    expect(screen.getByTestId('exit-unexplored')).toHaveTextContent('1 room unexplored.');
    rerender(<ExitConfirm unexplored={0} onLeave={vi.fn()} onStay={vi.fn()} />);
    expect(screen.getByTestId('exit-unexplored')).toHaveTextContent('Every room explored.');
  });
});

describe('AlcoveDialog', () => {
  const helm = generateItem(
    registry,
    { uid: 'h1', ilvl: 3, rarity: 'rare', slot: 'helm', mana: 'fire' },
    new SeededRNG(4),
  );
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    store().setProfile({ ...store().profile, bag: [helm] });
    store().startDive(1); // mid-floor: the dive is fighting
  });

  it("shows the stop's cards for its offers; a take goes to onTake and closes it", () => {
    const onTake = vi.fn((): ProfileActionResult => ({ ok: true, profile: store().profile }));
    const onClose = vi.fn();
    render(<AlcoveDialog offers={['equip', 'upgrade']} onTake={onTake} onClose={onClose} />);
    expect(screen.getByTestId('alcove-dialog')).toHaveTextContent('Anvil alcove');
    expect(screen.getByTestId('stop')).toHaveTextContent('Take one power-up');
    expect(screen.getByTestId('stop-upgrade')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(onTake).toHaveBeenCalledWith({ kind: 'equip', uid: 'h1' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("a refused take keeps it open with the engine's reason; Back closes it", () => {
    const onTake = vi.fn(
      (): ProfileActionResult => ({ ok: false, profile: store().profile, reason: 'Used' }),
    );
    const onClose = vi.fn();
    render(<AlcoveDialog offers={['equip']} onTake={onTake} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getByTestId('stop-equip-item'));
    expect(screen.getByRole('status')).toHaveTextContent('Used');
    expect(onClose).not.toHaveBeenCalled();
    // The picker's Back, then the dialog's.
    fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("dry-runs its pickers by the stop's rules mid-floor, never refusing for want of a stop", () => {
    render(<AlcoveDialog offers={['slot']} onTake={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('stop-slot'));
    expect(screen.queryByText('No stop here')).toBeNull();
    expect(screen.getByTestId('stop-slot-primary')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/FloorDialogs.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../arena/FloorDialogs" from "src/features/delve/__tests__/FloorDialogs.test.tsx". Does the file exist?`

- [ ] **Step 3: The dialogs**

Create `packages/client/src/features/delve/arena/FloorDialogs.tsx`:

```tsx
import { useMemo } from 'react';
import {
  takeStop,
  type DelveProfile,
  type ProfileActionResult,
  type StopAction,
  type StopKind,
} from '@alloy/engine';
import { Button, Dialog } from '../kit';
import { StopPanel, type StopOps } from '../StopPanel';
import { getDelveRegistry } from '../registry';

/**
 * The exit gate's confirm (see the floor maps spec): the arena waits under it; Leave takes the
 * exit, Back (Esc or B) stays on the floor.
 */
export function ExitConfirm({
  unexplored,
  onLeave,
  onStay,
}: {
  /** Rooms not yet revealed (`exitRequest.roomsUnexplored`). */
  unexplored: number;
  onLeave: () => void;
  onStay: () => void;
}) {
  return (
    <Dialog
      title="Leave the floor?"
      onClose={onStay}
      width={560}
      testId="exit-confirm"
      footer={
        <Button variant="go" onClick={onLeave} data-pad-first testId="exit-leave">
          Leave the floor
        </Button>
      }
    >
      <p className="m-0 text-[18px]" data-testid="exit-unexplored">
        {unexplored === 0
          ? 'Every room explored.'
          : `${unexplored} ${unexplored === 1 ? 'room' : 'rooms'} unexplored.`}
      </p>
      <p className="k-body-2 m-0">Loot left on the floor is lost.</p>
    </Dialog>
  );
}

/** `profile` at a stop offering `offers`: the alcove's dry runs ask the stop's own op, whose rules it shares. */
function atStop(profile: DelveProfile, offers: StopKind[]): DelveProfile {
  return profile.dive
    ? { ...profile, dive: { ...profile.dive, phase: 'choosing', stop: { offers, taken: false } } }
    : profile;
}

/**
 * An Anvil alcove (see the floor maps spec): the stop's power-up cards over its `offers`, taken
 * with `onTake` (the engine's `takeAlcove`, through the dive). A take closes it; Back leaves the
 * alcove unused, to open again.
 */
export function AlcoveDialog({
  offers,
  onTake,
  onClose,
}: {
  offers: StopKind[];
  onTake: (action: StopAction) => ProfileActionResult;
  onClose: () => void;
}) {
  const ops = useMemo<StopOps>(() => {
    const registry = getDelveRegistry();
    return {
      dry: (profile, action) => takeStop(registry, atStop(profile, offers), action),
      take: (action) => {
        const res = onTake(action);
        if (res.ok) onClose();
        return res;
      },
    };
  }, [offers, onTake, onClose]);
  return (
    <Dialog title="Anvil alcove" onClose={onClose} width={1120} testId="alcove-dialog">
      <StopPanel stop={{ offers, taken: false }} ops={ops} />
    </Dialog>
  );
}
```

- [ ] **Step 4: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/FloorDialogs.test.tsx)`
Expected: PASS (5 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 17 tests in G + 1 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/FloorDialogs.tsx src/features/delve/__tests__/FloorDialogs.test.tsx)
git add packages/client/src/features/delve/arena/FloorDialogs.tsx packages/client/src/features/delve/__tests__/FloorDialogs.test.tsx
git commit -m "feat(client): the exit confirm and the anvil alcove dialog" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: The interact plaque

Over the interactable in reach: the interact binding for the device holding the input lock and the verb ("C Open", "A Pray", "Forge", "Leave"), the engine's words, a prayer's bar; placed every frame over its prop from the hero's screen point.

**Files:**
- Create: `packages/client/src/features/delve/arena/hud/InteractPlaque.tsx`
- Create: `packages/client/src/features/delve/arena/hud/__tests__/InteractPlaque.test.tsx`
- Modify: `packages/client/src/features/delve/arena/hud/SkillDock.tsx` (`bindingOf` exported)

- [ ] **Step 1: The failing tests**

Create `packages/client/src/features/delve/arena/hud/__tests__/InteractPlaque.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ArpgWorld } from '@alloy/engine';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useControlsStore } from '@/stores/controlsStore';
import { DEFAULT_CONTROLS } from '@/features/controls/controls';
import { InteractPlaque } from '../InteractPlaque';
import type { InteractHud } from '../../useArenaCore';

const CHEST: InteractHud = {
  id: '2:1',
  interactable: 'chest',
  text: 'Treasure vault',
  x: 12,
  y: 10,
  channel: null,
};
/** The hero at (10, 10), drawn at (400, 300) at 30 px a unit. */
const world = { current: { hero: { x: 10, y: 10 } } as ArpgWorld };
const plaque = (prompt: InteractHud) => (
  <InteractPlaque
    prompt={prompt}
    world={world}
    heroScreen={() => ({ x: 400, y: 300 })}
    pixelsPerUnit={() => 30}
  />
);

describe('InteractPlaque', () => {
  afterEach(() => {
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
    useControlsStore.setState({ config: DEFAULT_CONTROLS });
  });

  it("names the interact input for the device holding the lock, and what it does: 'C Open', 'A Pray'", () => {
    const { rerender } = render(plaque(CHEST));
    const el = screen.getByTestId('interact-plaque');
    expect(el).toHaveAttribute('data-interactable', 'chest');
    expect(el).toHaveTextContent(/^COpenTreasure vault$/);
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    rerender(plaque({ ...CHEST, interactable: 'shrine', text: 'Shrine of Vigor: +20% damage' }));
    expect(screen.getByRole('img', { name: 'A' })).toBeInTheDocument();
    expect(el).toHaveTextContent('Pray');
    expect(el).toHaveTextContent('Shrine of Vigor: +20% damage');
  });

  it("follows the player's binding, and says what the alcove and the gate do", () => {
    useControlsStore.setState({
      config: { ...DEFAULT_CONTROLS, keys: { ...DEFAULT_CONTROLS.keys, interact: 'KeyG' } },
    });
    const { rerender } = render(plaque({ ...CHEST, interactable: 'alcove', text: '' }));
    expect(screen.getByTestId('interact-plaque')).toHaveTextContent(/^GForge$/);
    rerender(plaque({ ...CHEST, interactable: 'gate', text: '' }));
    expect(screen.getByTestId('interact-plaque')).toHaveTextContent(/^GLeave$/);
  });

  it("shows a shrine's prayer as it goes", () => {
    render(plaque({ ...CHEST, interactable: 'shrine', channel: 0.5 }));
    expect(screen.getByTestId('interact-plaque')).toHaveTextContent('Praying');
    expect(screen.getByTestId('interact-channel')).toHaveAttribute('aria-valuenow', '50');
  });

  it('stands over its prop on screen: the prop lifts it by its size', () => {
    render(plaque({ ...CHEST, interactable: 'shrine' }));
    // (12, 10 − 1.4): 60 px right of the hero and 42 px up.
    expect(screen.getByTestId('interact-plaque').style.transform).toBe('translate(460px, 258px)');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/InteractPlaque.test.tsx)`
Expected: FAIL, no tests: `Error: Failed to resolve import "../InteractPlaque" from "src/features/delve/arena/hud/__tests__/InteractPlaque.test.tsx". Does the file exist?`

- [ ] **Step 3: The plaque**

In `packages/client/src/features/delve/arena/hud/SkillDock.tsx`:

Replace:

```tsx
const bindingOf = (cfg: ControlsConfig, action: ControlAction): Binding => ({
```

with:

```tsx
export const bindingOf = (cfg: ControlsConfig, action: ControlAction): Binding => ({
```

Create `packages/client/src/features/delve/arena/hud/InteractPlaque.tsx`:

```tsx
import { useEffect, useRef, type RefObject } from 'react';
import type { ArpgWorld, InteractableKind, PropId, Vec } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import { Bar, InputGlyph } from '../../kit';
import { getDelveRegistry } from '../../registry';
import type { InteractHud } from '../useArenaCore';
import { bindingOf } from './SkillDock';

/** What the interact press does to each, as its plaque says it. */
export const INTERACT_VERB: Record<InteractableKind, string> = {
  chest: 'Open',
  shrine: 'Pray',
  alcove: 'Forge',
  gate: 'Leave',
};

/** Each one's prop: its size (`layouts.json → props`) lifts the plaque above it. */
const PROP: Record<InteractableKind, PropId> = {
  chest: 'chest',
  shrine: 'shrine',
  alcove: 'alcove_anvil',
  gate: 'exit_gate',
};

/** A world point on screen, from the hero's point there (`heroScreen`) and the camera's scale. */
export function screenOf(hero: Vec, heroScreen: Vec, at: Vec, pixelsPerUnit: number): Vec {
  return {
    x: heroScreen.x + (at.x - hero.x) * pixelsPerUnit,
    y: heroScreen.y + (at.y - hero.y) * pixelsPerUnit,
  };
}

/**
 * The plaque over the interactable in reach (see the floor maps spec): the interact input for the
 * device holding the input lock and what it does ("C Open", "A Pray"), the engine's words under it,
 * and a prayer's progress. It follows its prop on screen every frame, in the HUD's zoom.
 */
export function InteractPlaque({
  prompt,
  world,
  heroScreen,
  pixelsPerUnit,
}: {
  prompt: InteractHud;
  world: RefObject<ArpgWorld | null>;
  heroScreen: () => Vec | null;
  pixelsPerUnit: () => number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const config = useControlsStore((s) => s.config);
  const lift = getDelveRegistry().getDelveData().layouts.props[PROP[prompt.interactable]];
  const { x, y } = prompt;
  useEffect(() => {
    let frame = 0;
    const place = () => {
      const el = ref.current;
      const hero = world.current?.hero;
      const at = heroScreen();
      if (el && hero && at) {
        const p = screenOf(hero, at, { x, y: y - lift }, pixelsPerUnit());
        el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [x, y, lift, world, heroScreen, pixelsPerUnit]);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 top-0 z-10"
      data-testid="interact-plaque"
      data-interactable={prompt.interactable}
    >
      <div className="delve-ui delve-hud-zoom">
        <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1 whitespace-nowrap border-2 border-[var(--k-steel-2)] bg-[var(--k-well)] px-3 py-2 [text-shadow:2px_2px_0_#181425]">
          <span className="flex items-center gap-2">
            <InputGlyph binding={bindingOf(config, 'interact')} size="sm" />
            <span className="k-disp text-[20px]">
              {prompt.channel === null ? INTERACT_VERB[prompt.interactable] : 'Praying'}
            </span>
          </span>
          {prompt.text && <span className="text-[14px] text-[var(--k-text-2)]">{prompt.text}</span>}
          {prompt.channel !== null && (
            <Bar
              kind="progress"
              value={prompt.channel * 100}
              max={100}
              height={6}
              testId="interact-channel"
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/hud/__tests__/InteractPlaque.test.tsx)`
Expected: PASS (4 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 21 tests in G + 2 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/hud/InteractPlaque.tsx src/features/delve/arena/hud/__tests__/InteractPlaque.test.tsx src/features/delve/arena/hud/SkillDock.tsx)
git add packages/client/src/features/delve/arena/hud/InteractPlaque.tsx packages/client/src/features/delve/arena/hud/__tests__/InteractPlaque.test.tsx packages/client/src/features/delve/arena/hud/SkillDock.tsx
git commit -m "feat(client): the interact plaque, per device, over its prop" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The floor flow

### Task 7: The dive ends on the exit and routes the gate and the alcove

`floorOver` (the open room's clear as before, a generated floor's `exited` at once); `routeFloorEvents` (an `exitRequest` to the page, or `exitFloor` under the autopilot; an `alcoveOpen` banks, then its offers to the page); `alcoveTake` (bank, then `takeAlcove` on the save that bank left); the hook's `leave` and `alcove`.

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArena.ts`, `arena/useArenaCore.ts` (`readArenaFlags` exported)
- Create: `packages/client/src/features/delve/__tests__/arena-floor.test.ts`

- [ ] **Step 1: The failing tests**

Create `packages/client/src/features/delve/__tests__/arena-floor.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alcoveOffers,
  beginFloor,
  createDelveProfile,
  exitFloor,
  startDive,
  takeAlcove,
  type ArpgEvent,
  type ArpgWorld,
  type DelveProfile,
} from '@alloy/engine';
import { alcoveTake, floorOver, routeFloorEvents, type ArenaUiEvent } from '../arena/useArena';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

// The floor flow's ops (B3's) are stubs until it lands: each test says what they do.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  exitFloor: vi.fn(),
  alcoveOffers: vi.fn(),
  takeAlcove: vi.fn(),
}));

const registry = getDelveRegistry();

describe("a floor's end", () => {
  it('comes when the hero falls, takes the exit, or clears the open room and its loot', () => {
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 7), 1));
    expect(floorOver(w)).toBe(false);
    expect(floorOver({ ...w, exited: true })).toBe(true);
    expect(floorOver({ ...w, heroDead: true })).toBe(true);
    expect(floorOver({ ...w, cleared: true, drops: [] })).toBe(true);
    const loot = [{ id: 1 }] as ArpgWorld['drops'];
    expect(floorOver({ ...w, cleared: true, clearedAt: w.t, drops: loot })).toBe(false);
  });
});

describe("a generated floor's requests", () => {
  const world = {} as ArpgWorld;
  let calls: string[];
  let ui: ArenaUiEvent[];
  const route = (events: ArpgEvent[], autopilot = false) =>
    routeFloorEvents(registry, world, events, {
      autopilot,
      bank: () => calls.push('bank'),
      onUi: (e) => ui.push(e),
    });
  beforeEach(() => {
    calls = [];
    ui = [];
    vi.mocked(exitFloor).mockClear();
    vi.mocked(alcoveOffers).mockImplementation(() => (calls.push('offers'), ['slot', 'upgrade']));
  });

  it('asks the page before the exit; the autopilot takes it at once', () => {
    route([{ kind: 'exitRequest', roomsUnexplored: 3 }]);
    expect(ui).toEqual([{ kind: 'exitRequest', unexplored: 3 }]);
    expect(exitFloor).not.toHaveBeenCalled();
    ui = [];
    route([{ kind: 'exitRequest', roomsUnexplored: 3 }], true);
    expect(exitFloor).toHaveBeenCalledWith(world);
    expect(ui).toEqual([]);
  });

  it("opens an alcove's dialog with its offers, priced on the save as a bank leaves it", () => {
    route([{ kind: 'alcoveOpen', id: '2:4' }]);
    expect(calls).toEqual(['bank', 'offers']);
    expect(alcoveOffers).toHaveBeenCalledWith(
      registry,
      useDelveStore.getState().profile,
      world,
      '2:4',
    );
    expect(ui).toEqual([{ kind: 'alcove', offers: ['slot', 'upgrade'] }]);
  });

  it('passes every other event by', () => {
    route([
      { kind: 'roomCleared', roomId: 1 },
      { kind: 'seal', roomId: 2 },
    ]);
    expect([calls, ui]).toEqual([[], []]);
  });
});

describe("taking an alcove's power-up", () => {
  it('banks first, runs takeAlcove on the save that bank left, and keeps what it gives', () => {
    const store = useDelveStore.getState();
    const before = startDive(registry, createDelveProfile(registry, 7), 1);
    store.setProfile(before);
    const banked: DelveProfile = { ...before, scrap: before.scrap + 40 };
    const after: DelveProfile = { ...banked, scrap: banked.scrap - 25 };
    vi.mocked(takeAlcove).mockReturnValue({ ok: true, profile: after });
    const world = {} as ArpgWorld;
    const action = { kind: 'upgrade', uid: 'h1' } as const;
    const res = alcoveTake(registry, world, action, () =>
      useDelveStore.getState().setProfile(banked),
    );
    expect(takeAlcove).toHaveBeenCalledWith(registry, banked, world, action);
    expect(res.ok).toBe(true);
    expect(useDelveStore.getState().profile).toEqual(after);
    vi.mocked(takeAlcove).mockReturnValue({ ok: false, profile: banked, reason: 'Used' });
    expect(alcoveTake(registry, world, action, () => {}).reason).toBe('Used');
    expect(useDelveStore.getState().profile).toEqual(after);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-floor.test.ts)`
Expected: FAIL, 5 failed (5): `TypeError: floorOver is not a function`, `TypeError: routeFloorEvents is not a function` (three), `TypeError: alcoveTake is not a function`.

- [ ] **Step 3: The floor flow**

In `packages/client/src/features/delve/arena/useArenaCore.ts`:

Replace:

```ts
function readArenaFlags(): { autopilot: boolean; timescale: number } {
```

with:

```ts
export function readArenaFlags(): { autopilot: boolean; timescale: number } {
```

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
import { useMemo, useRef, type RefObject } from 'react';
import {
  bankWorld,
```

with:

```ts
import { useMemo, useRef, type RefObject } from 'react';
import {
  alcoveOffers,
  bankWorld,
```

Replace:

```ts
  emptyHaul,
  failFloor,
  heroChains,
  type DataRegistry,
  profileStats,
  type ArpgWorld,
```

with:

```ts
  emptyHaul,
  exitFloor,
  failFloor,
  heroChains,
  takeAlcove,
  type DataRegistry,
  profileStats,
  type ArpgEvent,
  type ArpgWorld,
```

Replace:

```ts
  type Haul,
  type ReactionId,
  type WorldPending,
} from '@alloy/engine';
```

with:

```ts
  type Haul,
  type ProfileActionResult,
  type ReactionId,
  type StopAction,
  type StopKind,
  type WorldPending,
} from '@alloy/engine';
```

Replace:

```ts
import { useArenaCore, type ArenaMode, type CoreUiEvent } from './useArenaCore';
```

with:

```ts
import { readArenaFlags, useArenaCore, type ArenaMode, type CoreUiEvent } from './useArenaCore';
```

Replace:

```ts
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean; haul: Haul }
  | { kind: 'fell' };
```

with:

```ts
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean; haul: Haul }
  | { kind: 'fell' }
  /** The exit gate asks (a generated floor): `unexplored` rooms are left. */
  | { kind: 'exitRequest'; unexplored: number }
  /** An anvil alcove opened: its power-ups (`alcoveOffers`), the arena to pause under them. */
  | { kind: 'alcove'; offers: StopKind[] };
```

Replace:

```ts
/**
 * The arena's world key: a floor under way.
```

with:

```ts
/**
 * Whether the floor is over: the hero fell, took the exit (a generated floor), or cleared the open
 * room and its loot is picked up (or 2.5 s passed).
 */
export function floorOver(world: ArpgWorld): boolean {
  return (
    world.heroDead ||
    world.exited ||
    (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 2.5))
  );
}

/**
 * A generated floor's requests (see the floor maps spec). The gate's `exitRequest`: the page
 * confirms it, the autopilot takes the exit at once (`exitFloor`). An alcove's `alcoveOpen`: what
 * waits banks first, so its offers (`alcoveOffers`) are priced on the save, then the page opens
 * them; under the autopilot the bot has the alcove.
 */
export function routeFloorEvents(
  registry: DataRegistry,
  world: ArpgWorld,
  events: readonly ArpgEvent[],
  opts: { autopilot: boolean; bank: (world: ArpgWorld) => void; onUi: (e: ArenaUiEvent) => void },
): void {
  for (const e of events) {
    if (e.kind === 'exitRequest') {
      if (opts.autopilot) exitFloor(world);
      else opts.onUi({ kind: 'exitRequest', unexplored: e.roomsUnexplored });
    } else if (e.kind === 'alcoveOpen' && !opts.autopilot) {
      opts.bank(world);
      const offers = alcoveOffers(registry, useDelveStore.getState().profile, world, e.id);
      opts.onUi({ kind: 'alcove', offers });
    }
  }
}

/**
 * Take an alcove's power-up: what waits banks first (`bank`), then `takeAlcove` runs on the save
 * that bank left, and the save keeps what it gives.
 */
export function alcoveTake(
  registry: DataRegistry,
  world: ArpgWorld,
  action: StopAction,
  bank: (world: ArpgWorld) => void,
): ProfileActionResult {
  bank(world);
  const store = useDelveStore.getState();
  const res = takeAlcove(registry, store.profile, world, action);
  if (res.ok) store.setProfile(res.profile);
  return res;
}

/**
 * The arena's world key: a floor under way.
```

Replace:

```ts
  const endAtRef = useRef<number | null>(null);
```

with:

```ts
  const endAtRef = useRef<number | null>(null);
  const autopilot = useMemo(() => readArenaFlags().autopilot, []);
```

Replace:

```ts
  /** The clear timers and, after a death, the END_DELAY beat; true once the floor has ended. */
  function checkEnd(world: ArpgWorld): boolean {
    const done =
      world.heroDead ||
      (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 2.5));
    if (!done) return false;
    const now = performance.now() / 1000;
    endAtRef.current ??= now;
    if (now - endAtRef.current < (world.heroDead ? END_DELAY : 0.4)) return false;
```

with:

```ts
  /** The clear timers and, after a death, the END_DELAY beat; true once the floor has ended. */
  function checkEnd(world: ArpgWorld): boolean {
    if (!floorOver(world)) return false;
    const now = performance.now() / 1000;
    endAtRef.current ??= now;
    // A death waits its beat and a clear 0.4 s; the exit goes at once.
    const wait = world.heroDead ? END_DELAY : world.exited ? 0 : 0.4;
    if (now - endAtRef.current < wait) return false;
```

Replace:

```ts
    onEvents: () => {},
    onHeroDead: () => {},
```

with:

```ts
    onEvents: (world, events) =>
      routeFloorEvents(registry, world, events, { autopilot, bank, onUi: onUiRef.current }),
    onHeroDead: () => {},
```

Replace:

```ts
    if (world && dive?.phase === 'fighting' && !dive.settled) bank(world);
  };
  return { ...core, flush };
}
```

with:

```ts
    if (world && dive?.phase === 'fighting' && !dive.settled) bank(world);
  };
  /** The exit confirm's Leave: `world.exited`, and the next frame ends the floor (`checkEnd`). */
  const leave = () => {
    const world = core.worldRef.current;
    if (world) exitFloor(world);
  };
  /** The alcove dialog's take (`alcoveTake`). */
  const alcove = (action: StopAction): ProfileActionResult => {
    const world = core.worldRef.current;
    if (world) return alcoveTake(registry, world, action, bank);
    return { ok: false, profile: useDelveStore.getState().profile, reason: 'No floor under way' };
  };
  return { ...core, flush, leave, alcove };
}
```

- [ ] **Step 4: Run them to see them pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-floor.test.ts src/features/delve/__tests__/arena-bank.test.ts)`
Expected: PASS (12 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 26 tests in G + 3 files pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/useArena.ts src/features/delve/arena/useArenaCore.ts src/features/delve/__tests__/arena-floor.test.ts)
git add packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/__tests__/arena-floor.test.ts
git commit -m "feat(client): a generated floor ends on the exit; the gate and the alcove go to the page or the autopilot" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: The page holds the dialogs and the plaque

`DelveRun` opens the exit confirm on `exitRequest` and the alcove dialog on `alcove`, pauses the arena under them (the pad goes to the menus, the HUD goes inert), calls the hook's `leave` and `alcove`, and draws the plaque while the fight is live.

**Files:**
- Modify: `packages/client/src/pages/DelveRun.tsx`
- Modify: `packages/client/src/pages/__tests__/DelveRun.test.tsx`

- [ ] **Step 1: The failing tests**

In `packages/client/src/pages/__tests__/DelveRun.test.tsx`:

Replace:

```tsx
        flush: () => seen.calls.push('flush'),
      };
```

with:

```tsx
        flush: () => seen.calls.push('flush'),
        leave: () => seen.calls.push('leave'),
        alcove: () => (seen.calls.push('alcove'), { ok: true }),
      };
```

Replace:

```tsx
  it("the pause's Anvil goes to the Anvil keeping the dive; Abandon settles it as a death, shows the summary, then closes it", () => {
```

with:

```tsx
  it('the exit gate asks first, over the paused arena: Back stays, Leave takes the exit', () => {
    renderRun();
    act(() => seen.onUi!({ kind: 'exitRequest', unexplored: 2 }));
    const confirm = screen.getByTestId('exit-confirm');
    expect(confirm).toHaveTextContent('2 rooms unexplored.');
    expect(seen.paused.at(-1)).toBe(true);
    expect(seen.live.at(-1)).toBe(false);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Back' }));
    expect(screen.queryByTestId('exit-confirm')).toBeNull();
    expect(seen.paused.at(-1)).toBe(false);
    expect(seen.calls).toEqual([]);
    act(() => seen.onUi!({ kind: 'exitRequest', unexplored: 0 }));
    fireEvent.click(screen.getByTestId('exit-leave'));
    expect(seen.calls).toEqual(['leave']);
    expect(screen.queryByTestId('exit-confirm')).toBeNull();
    expect(seen.paused.at(-1)).toBe(false);
  });

  it("an anvil alcove opens the stop's cards over the paused arena; a take goes through the dive and closes them", () => {
    renderRun();
    act(() => seen.onUi!({ kind: 'alcove', offers: ['equip', 'upgrade'] }));
    const dialog = screen.getByTestId('alcove-dialog');
    expect(within(dialog).getByTestId('stop-equip')).toBeInTheDocument();
    expect(seen.paused.at(-1)).toBe(true);
    fireEvent.click(within(dialog).getByTestId('stop-upgrade'));
    fireEvent.click(within(dialog).getAllByTestId('stop-upgrade-item')[0]);
    expect(seen.calls).toEqual(['alcove']);
    expect(screen.queryByTestId('alcove-dialog')).toBeNull();
    expect(seen.paused.at(-1)).toBe(false);
  });

  it("the pause's Anvil goes to the Anvil keeping the dive; Abandon settles it as a death, shows the summary, then closes it", () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: FAIL, 2 failed | 12 passed (14): `Unable to find an element by: [data-testid="exit-confirm"]` and `[data-testid="alcove-dialog"]`.

- [ ] **Step 3: The page**

In `packages/client/src/pages/DelveRun.tsx`:

Replace:

```tsx
  startDepthOptions,
  type GearItem,
  type Haul,
} from '@alloy/engine';
```

with:

```tsx
  startDepthOptions,
  type GearItem,
  type Haul,
  type StopAction,
  type StopKind,
} from '@alloy/engine';
```

Replace:

```tsx
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
```

with:

```tsx
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import { AlcoveDialog, ExitConfirm } from '@/features/delve/arena/FloorDialogs';
import { InteractPlaque } from '@/features/delve/arena/hud/InteractPlaque';
```

Replace:

```tsx
  const [banners, setBanners] = useState<BannerState[]>([]);
```

with:

```tsx
  const [banners, setBanners] = useState<BannerState[]>([]);
  /** The exit gate's question (the rooms left unexplored), or null. */
  const [exitAsk, setExitAsk] = useState<number | null>(null);
  /** An open anvil alcove's offers, or null. */
  const [alcove, setAlcove] = useState<StopKind[] | null>(null);
```

Replace:

```tsx
        case 'fell':
          break;
      }
```

with:

```tsx
        case 'fell':
          break;
        case 'exitRequest':
          setExitAsk(e.unexplored);
          break;
        case 'alcove':
          setAlcove(e.offers);
          break;
      }
```

Replace:

```tsx
  const paused = !!pause || fanfares.length > 0 || choosing || finished;
```

with:

```tsx
  // The floor's dialogs (the exit confirm, an alcove) pause the fight under them.
  const asking = exitAsk !== null || !!alcove;
  const paused = !!pause || fanfares.length > 0 || choosing || finished || asking;
```

Replace:

```tsx
  const resume = useCallback(() => setPause(null), []);
```

with:

```tsx
  const resume = useCallback(() => setPause(null), []);
  const stay = useCallback(() => setExitAsk(null), []);
  /** The exit confirm's Leave: the floor ends on the arena's next frame. */
  const leave = useCallback(() => {
    arenaRef.current?.leave();
    setExitAsk(null);
  }, []);
  const closeAlcove = useCallback(() => setAlcove(null), []);
  const takeAlcove = useCallback((action: StopAction) => arenaRef.current!.alcove(action), []);
```

Replace:

```tsx
        manualAttack={manualAttack}
      />

      <HudGrid
        onInsets={setInsets}
        inert={!!pause || choosing}
```

with:

```tsx
        manualAttack={manualAttack}
      />
      {!paused && arena.hud?.prompt && (
        <InteractPlaque
          prompt={arena.hud.prompt}
          world={arena.worldRef}
          heroScreen={arena.heroScreen}
          pixelsPerUnit={arena.pixelsPerUnit}
        />
      )}

      <HudGrid
        onInsets={setInsets}
        inert={!!pause || choosing || asking}
```

Replace:

```tsx
      {finished && (
        <DiveSummary
```

with:

```tsx
      {exitAsk !== null && <ExitConfirm unexplored={exitAsk} onLeave={leave} onStay={stay} />}
      {alcove && <AlcoveDialog offers={alcove} onTake={takeAlcove} onClose={closeAlcove} />}

      {finished && (
        <DiveSummary
```

- [ ] **Step 4: Run them to see them pass, then the whole client and the build**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveRun.test.tsx)`
Expected: PASS (14 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 28 tests in G + 3 files pass.

Run: `(pnpm -F @alloy/client build)`
Expected: `✓ built in …` (the chunk-size warning is the base's).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/client && npx prettier --write --end-of-line auto src/pages/DelveRun.tsx src/pages/__tests__/DelveRun.test.tsx)
git add packages/client/src/pages/DelveRun.tsx packages/client/src/pages/__tests__/DelveRun.test.tsx
git commit -m "feat(client): the dive pauses under the exit confirm and the alcove dialog, and shows the interact plaque" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9 (after B4 merges): The autopilot takes the alcove itself

Under `alloy:delve:autopilot` an `alcoveOpen` banks, then `takeBestAlcove` (B4's, X2) takes the bot's pick on the save that bank left; no dialog opens.

**Base:** `maps/c2` with B4 merged into it (or `maps/main` after B4), the engine bundle rebuilt (`(cd packages/engine && npx tsup)`); the anchors below are Task 7's text, which B4 doesn't touch.

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArena.ts`
- Modify: `packages/client/src/features/delve/__tests__/arena-floor.test.ts`

- [ ] **Step 1: The failing test**

In `packages/client/src/features/delve/__tests__/arena-floor.test.ts`:

Replace:

```ts
  startDive,
  takeAlcove,
  type ArpgEvent,
```

with:

```ts
  startDive,
  takeAlcove,
  takeBestAlcove,
  type ArpgEvent,
```

Replace:

```ts
  takeAlcove: vi.fn(),
}));
```

with:

```ts
  takeAlcove: vi.fn(),
  takeBestAlcove: vi.fn(),
}));
```

Replace:

```ts
  it('passes every other event by', () => {
```

with:

```ts
  it("under the autopilot, the bot takes an alcove's power-up itself, on the save a bank leaves", () => {
    const store = useDelveStore.getState();
    const before = startDive(registry, createDelveProfile(registry, 7), 1);
    const taken: DelveProfile = { ...before, scrap: before.scrap - 25 };
    store.setProfile(before);
    vi.mocked(takeBestAlcove).mockReturnValue(taken);
    route([{ kind: 'alcoveOpen', id: '2:4' }], true);
    expect(calls).toEqual(['bank']);
    expect(takeBestAlcove).toHaveBeenCalledWith(registry, before, world, '2:4');
    expect(useDelveStore.getState().profile).toBe(taken);
    expect(ui).toEqual([]);
  });

  it('passes every other event by', () => {
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-floor.test.ts)`
Expected: FAIL, 1 failed | 5 passed (6): `AssertionError: expected [] to deeply equal [ 'bank' ]` (the autopilot still leaves an alcove alone).

- [ ] **Step 3: The bot's pick**

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
  takeAlcove,
  type DataRegistry,
```

with:

```ts
  takeAlcove,
  takeBestAlcove,
  type DataRegistry,
```

Replace:

```ts
/**
 * A generated floor's requests (see the floor maps spec). The gate's `exitRequest`: the page
 * confirms it, the autopilot takes the exit at once (`exitFloor`). An alcove's `alcoveOpen`: what
 * waits banks first, so its offers (`alcoveOffers`) are priced on the save, then the page opens
 * them; under the autopilot the bot has the alcove.
 */
```

with:

```ts
/**
 * A generated floor's requests (see the floor maps spec). The gate's `exitRequest`: the page
 * confirms it, the autopilot takes the exit at once (`exitFloor`). An alcove's `alcoveOpen`: what
 * waits banks first, so its offers (`alcoveOffers`) are priced on the save, then the page opens
 * them; the autopilot takes the bot's pick at once (`takeBestAlcove`).
 */
```

Replace:

```ts
    } else if (e.kind === 'alcoveOpen' && !opts.autopilot) {
      opts.bank(world);
      const offers = alcoveOffers(registry, useDelveStore.getState().profile, world, e.id);
      opts.onUi({ kind: 'alcove', offers });
    }
```

with:

```ts
    } else if (e.kind === 'alcoveOpen') {
      opts.bank(world);
      const { profile, setProfile } = useDelveStore.getState();
      if (opts.autopilot) setProfile(takeBestAlcove(registry, profile, world, e.id));
      else opts.onUi({ kind: 'alcove', offers: alcoveOffers(registry, profile, world, e.id) });
    }
```

- [ ] **Step 4: Run it to see it pass, then the whole client**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-floor.test.ts)`
Expected: PASS (6 tests).

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 29 tests in G + 3 files pass (plus whatever B4 added to the client).

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-maps-c2
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/useArena.ts src/features/delve/__tests__/arena-floor.test.ts)
git add packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/__tests__/arena-floor.test.ts
git commit -m "feat(client): under the autopilot the bot takes an anvil alcove itself" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Verification

- **Checked on a scratch copy:** `git archive` of `maps/main` at `eb4742c5` with junctioned `node_modules` and the engine bundle built; every task's edits applied by a script that checks each anchor is unique where the plan applies it, test edits first (each Step 2's FAIL above is what it printed), then the source (each Step 4's PASS, typecheck and suite count). Task 9 ran against a stand-in `takeBestAlcove` (returning the profile) added to the scratch engine and bundled, standing for B4's. Every file a commit block formats passed `prettier --check --end-of-line auto`.
- **After Task 8:** `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` reads **N + 28 tests in G + 3 files** (1284 in 157 at `eb4742c5`); `pnpm -F @alloy/client build` succeeds.
- **After Task 9 (with B4):** N + 29 tests.
- **Nothing changes on the open room:** the Training Grounds and every floor before B1's generated path draw and end exactly as before (no `floor`, no prompt, `hudMapOf` never called; `checkEnd` on `cleared` with its 0.4 s).
- **Not C2's files:** `git diff --stat maps/main` lists only the files in "Files" (no `ArenaRenderer.ts`, no `arena/pixel/*`, no engine file).
- **Once B1 + B3 (+ B4) are merged (the integrator):** a dive in the dev server: the plaque over a chest reads "C Open" with the keys and "A Open" with a pad; a shrine's prayer fills its bar and its blessing joins the buff row; the gate's confirm pauses the fight, Back resumes, Leave ends the floor at once on the stop; an alcove's dialog shows the stop's cards and a take closes it; the minimap fills in as rooms are seen, a sealed den's walls turn red, the compass points to the exit after `ai.exitHintSeconds`; "Rooms explored n / m" counts up. Phase D's E2E (X3) covers the autopilot dives and the dialogs' probes.
