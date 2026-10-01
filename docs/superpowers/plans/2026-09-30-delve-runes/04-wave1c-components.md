# Delve Runes, Wave 1C: Client Presentational Components — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The rune pieces the client shows, built before anything wires them: a rune's glyph, a move's socket pips, the socket picker, the Forge tab's pouch with 3 → 1 fusing, and the item sheet's sockets block. Wave 2E mounts them in the chain builder, the Forge tab, the item sheet, the stop and the Training Grounds; wave 2F reads their family colours for the HUD dots.

**Architecture:** One new folder, `packages/client/src/features/delve/runes/`. Every component is presentational: props in, callbacks out, no store, no game rules. They read only the contract's types and its pure helpers (`runeText`, `socketsOf`, `movesOf`) and the registry's `getRunes`/`getRune` through `getDelveRegistry()`. Rune numbers are never formatted here: every effect and trade-off is `runeText`'s. The picker is a modal dialog in a portal, the last `data-pad-scope`, with the StopPanel's focus rules (Back has the focus, Escape and the backdrop close it, the focus goes back to its opener).

**Tech Stack:** React 19, TypeScript 5.7, TailwindCSS v4 classes and the Delve's own (`delve-chip`, `delve-btn`, `delve-panel`, `delve-sheet`), Vitest 3 with jsdom and Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-30-delve-runes-design.md`, "The client" and "Build waves → Wave 1 → C". The overview is `00-overview.md` in this folder.

---

## Base

- **Starts from:** the commit where wave 0 (`01-wave0-contract.md`) is merged. Nothing from waves 1A or 1B is needed: this area reads only wave 0's types, `runes.json`, the registry's rune getters and the pure helpers `runeText` and `socketsOf` (which wave 0 writes in full, not as stubs).
- **Worktree** (the overview's rule; skip it if the controller already made `C:\Projects\alloy-components`). PowerShell, from anywhere; `<wave-0 merge>` is the commit the controller names:

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-components -b runes/components <wave-0 merge>
$W = 'C:\Projects\alloy-components'; $R = 'C:\Projects\Alloy'
cmd /c mklink /J "$W\node_modules" "$R\node_modules"
cmd /c mklink /J "$W\packages\engine\node_modules" "$R\packages\engine\node_modules"
New-Item -ItemType Directory -Force "$W\packages\client\node_modules\@alloy" | Out-Null
Get-ChildItem -Force "$R\packages\client\node_modules" | Where-Object Name -ne '@alloy' | ForEach-Object { cmd /c mklink /J "$W\packages\client\node_modules\$($_.Name)" $_.FullName }
cmd /c mklink /J "$W\packages\client\node_modules\@alloy\engine" "$W\packages\engine"
```

  (From Git Bash, `cmd //c mklink /J` mangles the switch; use PowerShell for the links. Remove them with `cmd /c rmdir`, never by deleting through them.)
- **Before Task 1, build wave 0's engine into the bundle** the client reads, and check the contract is there:

```bash
cd /c/Projects/alloy-components
(cd packages/engine && npx tsup)
grep -c "runeText\|socketsOf\|RUNE_FAMILIES\|getRune(" packages/engine/dist/index.d.ts
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
```

  Expected: the grep counts at least 4; the client suite passes (about 781 tests in 91 files: HEAD `81b0e31` has exactly that, and wave 0 changes one expectation in `delveStore.test.ts`, adding no client test); the typecheck prints nothing. Call this suite count **N tests in F files**; this area ends at N + 20 in F + 5.

## Files

All new; this area changes no existing file.

| File | Responsibility |
|---|---|
| `packages/client/src/features/delve/runes/rune-style.ts` | `FAMILY_STYLE` (each family's colour and name), `TIERS`, `TIER_NUMERAL`, `runeName` ("Split III"), `dormantText` (why a socketed rune does nothing) |
| `packages/client/src/features/delve/runes/RuneGlyph.tsx` | a rune at a glance: icon and tier numeral in a ring of its family's colour; dimmed when dormant |
| `packages/client/src/features/delve/runes/SocketRow.tsx` | a move's socket pips: each rune's glyph or an empty ring, then "+ socket" with its price; plain marks when locked |
| `packages/client/src/features/delve/runes/RunePicker.tsx` | the socket picker: the current rune with Pull, the fitting runes with effect, trade-off and count; the Training Grounds' tier chips |
| `packages/client/src/features/delve/runes/RunePouchPanel.tsx` | the Forge tab's runes: every rune held, by tier, with Fuse 3 → 1 at its price |
| `packages/client/src/features/delve/runes/ItemSockets.tsx` | the item sheet's sockets block: each move with an open socket, read-only |
| `packages/client/src/features/delve/runes/__tests__/RuneGlyph.test.tsx` | the glyph and the style helpers |
| `packages/client/src/features/delve/runes/__tests__/SocketRow.test.tsx` | pips, "+ socket", dormant, locked |
| `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx` | the list, its texts, the modal's focus rules, Pull, tier chips, `on` |
| `packages/client/src/features/delve/runes/__tests__/RunePouchPanel.test.tsx` | the pouch's rows, fusing, its refusals and the lock |
| `packages/client/src/features/delve/runes/__tests__/ItemSockets.test.tsx` | the sheet's block |

Component tests live in a `__tests__` folder beside them, as `features/delve/__tests__/` does today (CLAUDE.md's "not `__tests__`" rule is for store tests).

## Cross-area needs

No edit in another area's files. Two things the other areas should know:

**Wave 0 (`runes.json` and `runeText`): the tests pin these texts.** Every one comes from the spec, so wave 0 should already produce it; if one differs, report it rather than editing the test.

| What | Expected | From the spec |
|---|---|---|
| ids | `split`, `quick`, `linger` (Multi-shot is looked up by name) | the rune table's names, lower-case |
| names | Split, Quick, Linger, Multi-shot | the rune table |
| order | `runes.json` in the table's order (Split before Quick) | "the 14 rows of the rune table, in that order" |
| Split's icon and family | `✳️`, `shape` | the `runes.json` example row |
| Linger's `fits.kinds` | `["heavy", "hold"]` | "Adding a rune" |
| `runeText` Split I effect | `Splits into 2 shards on hit, each at 30% power` | the example row's template |
| `runeText` Split IV effect | `Splits into 3 shards on hit, each at 45% power` | the same, tier IV |
| `runeText` Quick III effect | `Beat −20%, cooldown −20%` (U+2212 minus) | "Adding a rune": Quick's template and its output |
| `runeText` Multi-shot II, no target | holds `68.75%` | the tier table, "no rounding" |
| `runeText` Multi-shot II, `on: { form: 'volley' }` | holds `84.375%` | the tier table's Volley column |

The last four assume `{path:%}` prints `+(v × 100).toFixed(3)` or equivalent: `0.3 × 100` is `30.000000000000004` in floating point, so wave 0 must round, but not below three decimals (the spec's 68.75% and 84.375%). Quick's and Multi-shot's trade-off wording, and every other rune's, the tests read from `runeText` itself.

**Wave 2E (wiring) and 2F (arena): what these components give and expect.** The contract's props are kept exactly; the picker gains two optional props (see "Where the spec left room").
- `RunePicker`'s `on?: RuneTarget` (the socket's move: `{ form }` for an ability move, `{ weapon, kind, explode }` for a blow) and `dormant?: boolean` (the current rune does nothing on this move now). Pass both from the builder.
- A pick calls `onPick(rune)` then `onClose()`; a pull calls `onPull()` then `onClose()`; so E's `onPick` and `onPull` only edit the draft, and `onClose` only closes. The picker returns the focus to whatever had it when it first rendered (the socket pip), so E needs no opener ref.
- The picker portals itself to `document.body`; it can be rendered from inside the stop's picker (its clicks and Escape stop at its own backdrop and dialog).
- A free socket (the Training Grounds, `ChainRunes.socketPrice` returning null) is `nextPrice={{ links: 0, scrap: 0 }}` on `SocketRow`, which shows a bare "+ socket"; `null` hides it.
- `SocketRow`'s `dormant` indexes: the socketed runes missing from the move's `ResolvedAbility.runes` (or the blow's `HeroBlow.runes`), the spec's one rule.
- `ItemSockets({ chains, cap })` is the item sheet's block: `chains` is `movesetOf(registry, item).chains`, `cap` is `socketCap(registry, item.rarity)`; mount it inside `MovesetView`.
- `runeName(registry, ref)` ("Split III") is for E's toasts ("destroys Split III"), the pickup feed and the dive summary; `FAMILY_STYLE[family].color` for F's HUD dots and rune drops.

## Where the spec left room

- **`RunePicker` gains `on` and `dormant`, both optional.** The spec says `runeText`'s target "applies the same rules as the resolver (… the picker passes the move)", and that "a dormant rune shows dimmed with its reason", but the contract's `RunePickerProps` carries neither. Optional props keep every caller of the contract's shape valid.
- **The picker owns the focus return.** It keeps the element focused at its first render (a `useState` initialiser, run during render, before its own `autoFocus` moves the focus) and focuses it again in its close handler. Done in the event handler, not an effect cleanup, so StrictMode's double effects can't move the focus behind the dialog.
- **The tier chips start at I**, and with `tierChoice` the candidates are one row per rune id (their tiers ignored), every row at the chosen tier.
- **The item sheet's block is its own component, `ItemSockets`** (the task names it; the spec only says "`SocketRow` locked"). It labels each move by its skill and place ("Primary 1", "Basic 2"), as resolving names would need the hero's stats.
- **Colours** (the spec names the hues): Shape cyan `#22d3ee`, Tempo amber `#fbbf24`, Elemental violet `#a78bfa`, Sustain green `#4ade80` (Tailwind's 400s, as the Delve's other accents).
- **Dormant reasons:** a rune with `fits.kinds` reads "Works on heavy and hold blows"; any other dormant rune (Pierce on a bursting staff row or an infinite pierce) "Does nothing on this move".

## Conventions

The overview's shared conventions, plus:
- Run every command from the worktree root, `/c/Projects/alloy-components` (Git Bash). Every command line runs in a subshell, as the 4a plan's do.
- Every file here is new and LF; the commit blocks format them with the repo's Prettier (3.8.1). The code below is already Prettier-formatted (checked on a scratch copy), so `--write` changes nothing if typed as written.
- **Checked on a scratch copy.** The code and tests below were run on HEAD `81b0e31`'s client against a stand-in for wave 0 (the real engine bundle plus the contract's rune types, `runeText` over a five-rune `runes.json` filled per the spec, and the registry's getters): each task's test fails to import first, then passes; the whole client suite went from 781 tests in 91 files to 801 in 96, and the typecheck stayed clean. The stand-in's `runeText` printed numbers as the table above says.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| The rune component tests | `(cd packages/client && npx vitest run src/features/delve/runes)` |
| One test file | `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/<File>.test.tsx)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Prettier check | `(cd packages/client && npx prettier --check src/features/delve/runes)` |
| Engine bundle | `(cd packages/engine && npx tsup)` |

---

## Chunk 1: The glyph, the sockets and the picker

### Task 1: A rune's glyph and the family style

`FAMILY_STYLE`, the tier numerals, `runeName` and `dormantText`, then `RuneGlyph`, which every other piece draws.

**Files:**
- Create: `packages/client/src/features/delve/runes/rune-style.ts`
- Create: `packages/client/src/features/delve/runes/RuneGlyph.tsx`
- Test: `packages/client/src/features/delve/runes/__tests__/RuneGlyph.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/runes/__tests__/RuneGlyph.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RUNE_FAMILIES } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { RuneGlyph } from '../RuneGlyph';
import { FAMILY_STYLE, dormantText, runeName } from '../rune-style';

const registry = getDelveRegistry();

describe('RuneGlyph and the rune style', () => {
  it('names a rune with its tier, and every family has a colour and a name', () => {
    expect(runeName(registry, { id: 'split', tier: 3 })).toBe('Split III');
    expect(runeName(registry, { id: 'quick', tier: 5 })).toBe('Quick V');
    for (const f of RUNE_FAMILIES) expect(FAMILY_STYLE[f].label).toBeTruthy();
    expect(FAMILY_STYLE.shape).toEqual({ color: '#22d3ee', label: 'Shape' });
  });

  it("says why a rune is dormant: Linger's kinds, else nothing on this move", () => {
    expect(dormantText(registry.getRune('linger'))).toBe('Works on heavy and hold blows');
    expect(dormantText(registry.getRune('split'))).toBe('Does nothing on this move');
  });

  it('shows the icon and the tier in its family colour, and dims a dormant rune', () => {
    const { rerender } = render(<RuneGlyph rune={{ id: 'split', tier: 3 }} />);
    const glyph = screen.getByRole('img', { name: 'Split III' });
    expect(glyph).toHaveTextContent('✳️III');
    expect(glyph).toHaveStyle({ borderColor: '#22d3ee', opacity: '1' });
    rerender(<RuneGlyph rune={{ id: 'split', tier: 3 }} dormant />);
    expect(screen.getByRole('img', { name: 'Split III, dormant' })).toHaveStyle({
      opacity: '0.4',
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/RuneGlyph.test.tsx)`
Expected: FAIL, `Error: Failed to resolve import "../RuneGlyph" from "src/features/delve/runes/__tests__/RuneGlyph.test.tsx". Does the file exist?` (Test Files 1 failed, no tests).

- [ ] **Step 3: Write the style and the glyph**

Create `packages/client/src/features/delve/runes/rune-style.ts`:

```ts
import type { DataRegistry, RuneDef, RuneFamily, RuneRef, RuneTier } from '@alloy/engine';

/** Each family's colour (a glyph's ring, the HUD's dots) and name. */
export const FAMILY_STYLE: Record<RuneFamily, { color: string; label: string }> = {
  shape: { color: '#22d3ee', label: 'Shape' },
  tempo: { color: '#fbbf24', label: 'Tempo' },
  elemental: { color: '#a78bfa', label: 'Elemental' },
  sustain: { color: '#4ade80', label: 'Sustain' },
};

/** The tiers in order, I to V. */
export const TIERS: readonly RuneTier[] = [1, 2, 3, 4, 5];

/** A tier as the game writes it: 3 → "III". */
export const TIER_NUMERAL: Record<RuneTier, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
};

/** A rune with its tier: "Split III" (the picker, the pouch, toasts, the pickup feed). */
export function runeName(registry: DataRegistry, ref: RuneRef): string {
  return `${registry.getRune(ref.id).name} ${TIER_NUMERAL[ref.tier]}`;
}

/** Why a socketed rune does nothing on its move now: "Works on heavy and hold blows". */
export function dormantText(def: RuneDef): string {
  const kinds = def.fits.kinds;
  if (!kinds) return 'Does nothing on this move';
  const list = kinds.length < 2 ? kinds[0] : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}`;
  return `Works on ${list} blows`;
}
```

Create `packages/client/src/features/delve/runes/RuneGlyph.tsx`:

```tsx
import type { RuneRef } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { FAMILY_STYLE, TIER_NUMERAL, runeName } from './rune-style';

/**
 * A rune at a glance: its icon and tier ("✳️ III") in a ring of its family's
 * colour. Dimmed when dormant: socketed, but doing nothing on its move now.
 */
export function RuneGlyph({
  rune,
  dormant = false,
  size = 'md',
}: {
  rune: RuneRef;
  dormant?: boolean;
  size?: 'sm' | 'md';
}) {
  const registry = getDelveRegistry();
  const def = registry.getRune(rune.id);
  const color = FAMILY_STYLE[def.family].color;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 leading-none ${size === 'sm' ? 'py-0.5 text-[10px]' : 'py-1 text-xs'}`}
      style={{ borderColor: color, opacity: dormant ? 0.4 : 1 }}
      role="img"
      aria-label={`${runeName(registry, rune)}${dormant ? ', dormant' : ''}`}
      data-testid="rune-glyph"
    >
      <span aria-hidden>{def.icon}</span>
      <span aria-hidden className="font-bold" style={{ color }}>
        {TIER_NUMERAL[rune.tier]}
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/RuneGlyph.test.tsx)`
Expected: PASS, 3 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: N + 3 tests in F + 1 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-components
(cd packages/client && npx prettier --write src/features/delve/runes/rune-style.ts src/features/delve/runes/RuneGlyph.tsx src/features/delve/runes/__tests__/RuneGlyph.test.tsx)
git add packages/client/src/features/delve/runes/rune-style.ts packages/client/src/features/delve/runes/RuneGlyph.tsx packages/client/src/features/delve/runes/__tests__/RuneGlyph.test.tsx
git commit -m "feat(client): a rune's glyph, its family colours and its name with tier" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: A move's socket pips

`SocketRow`, under each move card (wired by E) and, locked, on the item sheet (Task 5).

**Files:**
- Create: `packages/client/src/features/delve/runes/SocketRow.tsx`
- Test: `packages/client/src/features/delve/runes/__tests__/SocketRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/runes/__tests__/SocketRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocketRow } from '../SocketRow';

describe('SocketRow', () => {
  it('shows each open socket, its rune or empty, and "+ socket" with the next price', () => {
    const onOpenSocket = vi.fn();
    const onSocketTap = vi.fn();
    render(
      <SocketRow
        runes={[{ id: 'split', tier: 3 }, null]}
        cap={3}
        nextPrice={{ links: 3, scrap: 60 }}
        onOpenSocket={onOpenSocket}
        onSocketTap={onSocketTap}
      />,
    );
    expect(screen.getByRole('button', { name: 'Socket 1: Split III' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Socket 2: empty' }));
    expect(onSocketTap).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('socket-open')).toHaveTextContent('+ socket · 🔗 3 · ⚙ 60');
    fireEvent.click(screen.getByTestId('socket-open'));
    expect(onOpenSocket).toHaveBeenCalledOnce();
  });

  it('hides "+ socket" at the cap or with no price, and shows a free one bare', () => {
    const { rerender } = render(
      <SocketRow runes={[null, null]} cap={2} nextPrice={{ links: 3, scrap: 60 }} />,
    );
    expect(screen.queryByTestId('socket-open')).toBeNull();
    rerender(<SocketRow runes={[null]} cap={2} nextPrice={null} />);
    expect(screen.queryByTestId('socket-open')).toBeNull();
    rerender(<SocketRow runes={[]} cap={3} nextPrice={{ links: 0, scrap: 0 }} />);
    expect(screen.getByTestId('socket-open').textContent).toBe('+ socket');
  });

  it('a dormant rune is dimmed and says why', () => {
    render(
      <SocketRow
        runes={[{ id: 'linger', tier: 2 }]}
        cap={1}
        nextPrice={null}
        dormant={[0]}
        onSocketTap={() => {}}
      />,
    );
    const pip = screen.getByRole('button', {
      name: 'Socket 1: Linger II, dormant: works on heavy and hold blows',
    });
    expect(pip).toHaveAttribute('title', 'Works on heavy and hold blows');
    expect(screen.getByRole('img', { name: 'Linger II, dormant' })).toHaveStyle({ opacity: '0.4' });
  });

  it('locked, the pips are marks, not buttons, and nothing opens', () => {
    render(
      <SocketRow
        runes={[{ id: 'split', tier: 1 }, null]}
        cap={3}
        nextPrice={{ links: 3, scrap: 60 }}
        locked
        onSocketTap={() => {}}
        onOpenSocket={() => {}}
      />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('img', { name: 'Socket 1: Split I' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Socket 2: empty' })).toBeInTheDocument();
  });

  it('a move with no socket and none to open shows nothing', () => {
    const { container } = render(<SocketRow runes={[]} cap={0} nextPrice={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/SocketRow.test.tsx)`
Expected: FAIL, `Error: Failed to resolve import "../SocketRow" from "src/features/delve/runes/__tests__/SocketRow.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the row**

Create `packages/client/src/features/delve/runes/SocketRow.tsx`:

```tsx
import type { RuneRef } from '@alloy/engine';
import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { RuneGlyph } from './RuneGlyph';
import { dormantText, runeName } from './rune-style';

export interface SocketRowProps {
  runes: readonly (RuneRef | null)[];
  cap: number;
  /** The next socket's price; null hides "+ socket" (at the cap, or locked). 0 and 0: free. */
  nextPrice: { links: number; scrap: number } | null;
  /** Socket indexes whose rune does nothing on this move now. */
  dormant?: readonly number[];
  locked?: boolean;
  onOpenSocket?: () => void;
  onSocketTap?: (socket: number) => void;
}

/**
 * A move's sockets, under its card: each open socket as a pip (its rune's
 * glyph, dimmed with its reason when dormant, or an empty ring), then
 * "+ socket" with the next one's price while the move is below its cap.
 * Tapping a pip calls `onSocketTap`; locked (a dive, the item sheet), the pips
 * are marks, not buttons. A move with no socket and none to open shows nothing.
 */
export function SocketRow({
  runes,
  cap,
  nextPrice,
  dormant = [],
  locked = false,
  onOpenSocket,
  onSocketTap,
}: SocketRowProps) {
  const registry = getDelveRegistry();
  const tap = locked ? undefined : onSocketTap;
  const open = !locked && nextPrice !== null && runes.length < cap ? nextPrice : null;
  if (runes.length === 0 && !open) return null;
  return (
    <span className="flex flex-wrap items-center justify-center gap-0.5" data-testid="socket-row">
      {runes.map((r, i) => {
        const off = !!r && dormant.includes(i);
        const why = off ? dormantText(registry.getRune(r.id)) : undefined;
        const label = `Socket ${i + 1}: ${r ? runeName(registry, r) : 'empty'}${why ? `, dormant: ${why.toLowerCase()}` : ''}`;
        const pip = r ? (
          <RuneGlyph rune={r} dormant={off} size="sm" />
        ) : (
          <span className="px-1 text-[11px] leading-none text-stone-500">◇</span>
        );
        return tap ? (
          <button
            key={i}
            type="button"
            className="delve-chip px-0.5 py-0"
            aria-label={label}
            title={why}
            onClick={() => tap(i)}
            data-testid={`socket-${i}`}
          >
            {pip}
          </button>
        ) : (
          <span key={i} role="img" aria-label={label} title={why} data-testid={`socket-${i}`}>
            {pip}
          </span>
        );
      })}
      {open && (
        <button
          type="button"
          className="delve-chip px-1.5 py-0 text-[10px]"
          onClick={onOpenSocket}
          data-testid="socket-open"
        >
          + socket
          {open.links > 0 && ` · 🔗 ${open.links}`}
          {open.scrap > 0 && ` · ⚙ ${formatNumber(open.scrap)}`}
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/SocketRow.test.tsx)`
Expected: PASS, 5 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: N + 8 tests in F + 2 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-components
(cd packages/client && npx prettier --write src/features/delve/runes/SocketRow.tsx src/features/delve/runes/__tests__/SocketRow.test.tsx)
git add packages/client/src/features/delve/runes/SocketRow.tsx packages/client/src/features/delve/runes/__tests__/SocketRow.test.tsx
git commit -m "feat(client): a move's socket pips with + socket and its price" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: The socket picker

`RunePicker`: a modal over the builder (or the stop's picker), with the StopPanel's focus rules.

**Files:**
- Create: `packages/client/src/features/delve/runes/RunePicker.tsx`
- Test: `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { runeText, type RuneRef } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { RunePicker, type RunePickerProps } from '../RunePicker';

const registry = getDelveRegistry();
const multishot = registry.getRunes().find((r) => r.name === 'Multi-shot')!.id;
const quick3: RuneRef = { id: 'quick', tier: 3 };

/** A socket pip that opens the picker, as the builder's does. */
function Harness(props: Partial<RunePickerProps>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Socket 1
      </button>
      {open && (
        <RunePicker
          candidates={[{ rune: { id: 'split', tier: 1 }, count: 2 }]}
          onPick={() => {}}
          onClose={() => setOpen(false)}
          {...props}
        />
      )}
    </>
  );
}

describe('RunePicker', () => {
  it('lists each fitting rune with its count, its effect and its trade-off; a pick picks and closes', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <RunePicker
        candidates={[
          { rune: { id: 'split', tier: 1 }, count: 2 },
          { rune: quick3, count: 1 },
        ]}
        onPick={onPick}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Socket a rune' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(screen.getByTestId('rune-picker')).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('button', { name: 'Split I ×2' })).toHaveAccessibleDescription(
      'Splits into 2 shards on hit, each at 30% power',
    );
    const q = runeText(registry, quick3);
    expect(q.effect).toBe('Beat −20%, cooldown −20%');
    expect(screen.getByRole('button', { name: 'Quick III ×1' })).toHaveAccessibleDescription(
      `${q.effect} · ${q.tradeoff}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Quick III ×1' }));
    expect(onPick).toHaveBeenCalledWith(quick3);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("is a modal: Back has the focus and is the pad's back; Escape, a pick or the backdrop close it, the focus back on its opener", () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Socket 1' });
    opener.focus();
    fireEvent.click(opener);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveFocus();
    expect(back).toHaveAttribute('data-pad-back');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Split I ×2' }));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByTestId('rune-picker'));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('a filled socket shows its rune with Pull, dormant with its reason, then the runes to replace it', () => {
    const onPull = vi.fn();
    const onClose = vi.fn();
    render(
      <RunePicker
        candidates={[{ rune: { id: 'split', tier: 1 }, count: 1 }]}
        current={{ id: 'linger', tier: 2 }}
        dormant
        pullText="Pull · destroys it"
        onPick={() => {}}
        onPull={onPull}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Linger II' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Linger II, dormant' })).toBeInTheDocument();
    expect(screen.getByTestId('rune-dormant')).toHaveTextContent('Works on heavy and hold blows');
    expect(screen.getByText('Replace with')).toBeInTheDocument();
    expect(screen.getByTestId('rune-pull')).toHaveTextContent('Pull · destroys it');
    fireEvent.click(screen.getByTestId('rune-pull'));
    expect(onPull).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('the Training Grounds pick the tier: one row a rune, no count', () => {
    const onPick = vi.fn();
    render(
      <RunePicker
        candidates={[
          { rune: { id: 'split', tier: 1 }, count: null },
          { rune: { id: 'split', tier: 2 }, count: null },
        ]}
        tierChoice
        onPick={onPick}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Tier I' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Tier IV' }));
    expect(screen.getAllByRole('button', { name: /^Split/ })).toHaveLength(1);
    const row = screen.getByRole('button', { name: 'Split IV' });
    expect(row).toHaveAccessibleDescription('Splits into 3 shards on hit, each at 45% power');
    fireEvent.click(row);
    expect(onPick).toHaveBeenCalledWith({ id: 'split', tier: 4 });
  });

  it("words a rune by its move's rules: Multi-shot's cut is halved on a Volley", () => {
    const rune: RuneRef = { id: multishot, tier: 2 };
    const { rerender } = render(
      <RunePicker candidates={[{ rune, count: 1 }]} onPick={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('68.75%');
    rerender(
      <RunePicker
        candidates={[{ rune, count: 1 }]}
        on={{ form: 'volley' }}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('84.375%');
  });

  it('with nothing that fits, says so', () => {
    render(<RunePicker candidates={[]} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('rune-none')).toHaveTextContent(
      'No rune in your pouch fits this move.',
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/RunePicker.test.tsx)`
Expected: FAIL, `Error: Failed to resolve import "../RunePicker" from "src/features/delve/runes/__tests__/RunePicker.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the picker**

Two details the tests pin: each row's accessible name is an `aria-label` ("Split I ×2"), and the separator before a trade-off is a text node outside its span, because the accessible-name and description computation trims each element's text (a `<span> ×2</span>` reads "Split I×2").

Create `packages/client/src/features/delve/runes/RunePicker.tsx`:

```tsx
import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { runeText, type RuneRef, type RuneTarget, type RuneTier } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { RuneGlyph } from './RuneGlyph';
import { TIERS, TIER_NUMERAL, dormantText, runeName } from './rune-style';

export interface RunePickerProps {
  /** Runes that fit the move and aren't on it; count null = unlimited (Training Grounds). */
  candidates: readonly { rune: RuneRef; count: number | null }[];
  /** A filled socket's rune, shown with Pull. */
  current?: RuneRef | null;
  /** "Pull · destroys it", or "Pull · ⚙ 50, back to your pouch". */
  pullText?: string;
  /** Training Grounds: pick the tier in the picker (I–V chips). */
  tierChoice?: boolean;
  /** The move the socket is on: the texts follow its rules (Multi-shot's cut on a Volley). */
  on?: RuneTarget;
  /** The current rune does nothing on this move now: dimmed, with its reason. */
  dormant?: boolean;
  /** A pick, then `onClose`. */
  onPick: (rune: RuneRef) => void;
  /** A pull, then `onClose`. */
  onPull?: () => void;
  onClose: () => void;
}

/** A rune's effect and its trade-off, as the engine words them at its tier (and on its move). */
function RuneEffect({ rune, on, id }: { rune: RuneRef; on?: RuneTarget; id?: string }) {
  const { effect, tradeoff } = runeText(getDelveRegistry(), rune, on);
  return (
    <span id={id} className="text-[11px] leading-snug text-stone-400">
      {effect}
      {tradeoff && ' · '}
      {tradeoff && <span className="text-amber-200/80">{tradeoff}</span>}
    </span>
  );
}

/**
 * A socket's picker, over the builder: a filled socket's rune with Pull, then
 * the runes that fit the move and aren't on it, each with its effect and
 * trade-off at its tier and its count. The Training Grounds pick the tier here
 * (I–V chips). A modal dialog in a portal (the last pad scope): Back has the
 * focus, Escape and the backdrop close it, and closing it (a pick, a pull or
 * Back) returns the focus to the control that opened it.
 */
export function RunePicker({
  candidates,
  current = null,
  pullText,
  tierChoice = false,
  on,
  dormant = false,
  onPick,
  onPull,
  onClose,
}: RunePickerProps) {
  const registry = getDelveRegistry();
  const id = useId();
  // The control that had the focus as the picker first rendered: its opener.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const [tier, setTier] = useState<RuneTier>(1);
  const close = () => {
    onClose();
    opener?.focus();
  };
  // With a tier choice, one row per rune, at the chosen tier.
  const rows = tierChoice
    ? candidates
        .filter((c, i) => candidates.findIndex((d) => d.rune.id === c.rune.id) === i)
        .map((c) => ({ rune: { id: c.rune.id, tier }, count: c.count }))
    : candidates;
  const title = current ? runeName(registry, current) : 'Socket a rune';
  return createPortal(
    <div
      className="delve-sheet-backdrop fixed inset-0 select-none text-white"
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
      data-testid="rune-picker"
      data-pad-scope
    >
      <div
        className="delve-sheet flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          close();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between">
          <span className="delve-display text-lg font-bold text-amber-200">{title}</span>
          <button
            type="button"
            className="delve-btn px-3 py-1 text-sm"
            onClick={close}
            autoFocus
            data-pad-back
          >
            Back
          </button>
        </div>
        {current && (
          <div className="delve-panel flex flex-col gap-1.5 p-2" data-testid="rune-current">
            <div className="flex items-center gap-2">
              <RuneGlyph rune={current} dormant={dormant} />
              <RuneEffect rune={current} on={on} />
            </div>
            {dormant && (
              <span className="text-[11px] text-amber-200/90" data-testid="rune-dormant">
                {dormantText(registry.getRune(current.id))}
              </span>
            )}
            {onPull && (
              <button
                type="button"
                className="delve-btn delve-btn-danger text-sm"
                onClick={() => {
                  onPull();
                  close();
                }}
                data-testid="rune-pull"
              >
                {pullText ?? 'Pull'}
              </button>
            )}
          </div>
        )}
        {tierChoice && (
          <div className="flex flex-wrap gap-1.5">
            {TIERS.map((t) => (
              <button
                key={t}
                type="button"
                className="delve-chip"
                aria-pressed={tier === t}
                aria-label={`Tier ${TIER_NUMERAL[t]}`}
                onClick={() => setTier(t)}
                data-testid={`rune-tier-${t}`}
              >
                {TIER_NUMERAL[t]}
              </button>
            ))}
          </div>
        )}
        {current && rows.length > 0 && (
          <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
            Replace with
          </div>
        )}
        {rows.length === 0 && (
          <div className="text-xs text-stone-400" data-testid="rune-none">
            {tierChoice ? 'No rune fits this move.' : 'No rune in your pouch fits this move.'}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {rows.map(({ rune, count }) => {
            const key = `${rune.id}-${rune.tier}`;
            return (
              <div key={key} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className="delve-btn flex items-center gap-2 text-left text-sm"
                  onClick={() => {
                    onPick(rune);
                    close();
                  }}
                  aria-label={`${runeName(registry, rune)}${count === null ? '' : ` ×${count}`}`}
                  aria-describedby={`${id}-${key}`}
                  data-testid={`rune-pick-${key}`}
                >
                  <RuneGlyph rune={rune} />
                  <span className="flex-1">{runeName(registry, rune)}</span>
                  {count !== null && <span className="text-xs text-stone-400">×{count}</span>}
                </button>
                <RuneEffect rune={rune} on={on} id={`${id}-${key}`} />
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/RunePicker.test.tsx)`
Expected: PASS, 6 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: N + 14 tests in F + 3 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-components
(cd packages/client && npx prettier --write src/features/delve/runes/RunePicker.tsx src/features/delve/runes/__tests__/RunePicker.test.tsx)
git add packages/client/src/features/delve/runes/RunePicker.tsx packages/client/src/features/delve/runes/__tests__/RunePicker.test.tsx
git commit -m "feat(client): the rune picker: fitting runes with effect, trade-off and count; Pull; tier chips" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The pouch and the item sheet

### Task 4: The pouch and fusing

`RunePouchPanel`, which E mounts on the Forge tab.

**Files:**
- Create: `packages/client/src/features/delve/runes/RunePouchPanel.tsx`
- Test: `packages/client/src/features/delve/runes/__tests__/RunePouchPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

The test's `fusePrice` is the balance's `fuseScrap` written out (wave 1B's `fusePrice` is a stub until B lands, and the component takes the price as a prop anyway). `ghost` is an id the data doesn't know: the panel skips it.

Create `packages/client/src/features/delve/runes/__tests__/RunePouchPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RunePouch, RuneRef } from '@alloy/engine';
import { RunePouchPanel } from '../RunePouchPanel';

/** `delve.runes.fuseScrap` (20, 40, 80, 160 to make II to V); tier V doesn't fuse. */
const fusePrice = (r: RuneRef) => [20, 40, 80, 160][r.tier - 1] ?? null;
const pouch: RunePouch = {
  quick: [0, 0, 0, 0, 4],
  split: [3, 0, 1, 0, 0],
  ghost: [5, 0, 0, 0, 0],
};

function panel(over: { scrap?: number; locked?: boolean; pouch?: RunePouch } = {}) {
  const onFuse = vi.fn();
  render(
    <RunePouchPanel
      pouch={over.pouch ?? pouch}
      fuseCount={3}
      fusePrice={fusePrice}
      scrap={over.scrap ?? 100}
      locked={over.locked ?? false}
      onFuse={onFuse}
    />,
  );
  return onFuse;
}

describe('RunePouchPanel (the Forge tab)', () => {
  it("lists every rune held by tier in the data's order, and fuses three where it can", () => {
    const onFuse = panel();
    const rows = screen.getAllByTestId(/^pouch-/).map((r) => r.dataset.testid);
    expect(rows).toEqual(['pouch-split-1', 'pouch-split-3', 'pouch-quick-5']);
    expect(screen.getByTestId('pouch-split-1')).toHaveTextContent('Split I ×3');
    expect(screen.getByTestId('pouch-split-1')).toHaveTextContent(
      'Splits into 2 shards on hit, each at 30% power',
    );
    expect(screen.getByTestId('pouch-quick-5')).toHaveTextContent('Quick V ×4');
    expect(screen.getByTestId('fuse-split-1')).toHaveTextContent('Fuse 3 → 1 · ⚙ 20');
    // One Split III is short of three; tier V doesn't fuse.
    expect(screen.queryByTestId('fuse-split-3')).toBeNull();
    expect(screen.queryByTestId('fuse-quick-5')).toBeNull();
    fireEvent.click(screen.getByTestId('fuse-split-1'));
    expect(onFuse).toHaveBeenCalledWith({ id: 'split', tier: 1 });
  });

  it("a fuse it can't pay is disabled and says why", () => {
    panel({ scrap: 10 });
    const fuse = screen.getByTestId('fuse-split-1');
    expect(fuse).toBeDisabled();
    expect(fuse).toHaveAccessibleDescription('Needs ⚙ 20 scrap');
  });

  it('locked mid-dive, as the rest of the forge', () => {
    const onFuse = panel({ locked: true });
    const fuse = screen.getByTestId('fuse-split-1');
    expect(fuse).toBeDisabled();
    expect(fuse).toHaveAccessibleDescription('A dive is under way: fuse runes between dives.');
    fireEvent.click(fuse);
    expect(onFuse).not.toHaveBeenCalled();
  });

  it('an empty pouch says where runes come from', () => {
    panel({ pouch: {} });
    expect(screen.getByTestId('rune-pouch')).toHaveTextContent(
      'No runes yet. Foes drop them now and then, and every boss drops one.',
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/RunePouchPanel.test.tsx)`
Expected: FAIL, `Error: Failed to resolve import "../RunePouchPanel" from "src/features/delve/runes/__tests__/RunePouchPanel.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the panel**

Create `packages/client/src/features/delve/runes/RunePouchPanel.tsx`:

```tsx
import { useId } from 'react';
import { runeText, type RunePouch, type RuneRef, type RuneTier } from '@alloy/engine';
import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { RuneGlyph } from './RuneGlyph';
import { runeName } from './rune-style';

export interface RunePouchPanelProps {
  pouch: RunePouch;
  fuseCount: number;
  /** Scrap to fuse `fuseCount` of a rune into one of the next tier; null: it doesn't fuse (tier V). */
  fusePrice: (ref: RuneRef) => number | null;
  scrap: number;
  locked: boolean;
  onFuse: (ref: RuneRef) => void;
}

/**
 * The Forge tab's runes: every rune held, by tier, with its count and effect,
 * and Fuse 3 → 1 at its scrap price where enough are held (never at tier V).
 * Locked mid-dive, as the rest of the forge; a fuse it can't pay says why.
 */
export function RunePouchPanel({
  pouch,
  fuseCount,
  fusePrice,
  scrap,
  locked,
  onFuse,
}: RunePouchPanelProps) {
  const registry = getDelveRegistry();
  const id = useId();
  // In the data's order, then by tier; ids the data doesn't know are skipped.
  const held = registry
    .getRunes()
    .flatMap((def) =>
      (pouch[def.id] ?? []).flatMap((n, i) =>
        n > 0 ? [{ rune: { id: def.id, tier: (i + 1) as RuneTier }, n }] : [],
      ),
    );
  return (
    <section className="delve-panel flex flex-col gap-2 p-3" data-testid="rune-pouch">
      <div className="delve-display text-[11px] font-bold uppercase tracking-widest text-amber-300/80">
        Runes
      </div>
      {locked && (
        <div id={`${id}-locked`} className="text-xs text-amber-200" data-testid="rune-pouch-locked">
          A dive is under way: fuse runes between dives.
        </div>
      )}
      {held.length === 0 && (
        <div className="text-xs text-stone-400">
          No runes yet. Foes drop them now and then, and every boss drops one.
        </div>
      )}
      {held.map(({ rune, n }) => {
        const key = `${rune.id}-${rune.tier}`;
        const price = n >= fuseCount ? fusePrice(rune) : null;
        const short = price !== null && price > scrap;
        return (
          <div key={key} className="flex items-center gap-2" data-testid={`pouch-${key}`}>
            <RuneGlyph rune={rune} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-stone-200">
                {runeName(registry, rune)} ×{n}
              </span>
              <span className="text-[11px] leading-snug text-stone-400">
                {runeText(registry, rune).effect}
              </span>
            </span>
            {price !== null && (
              <span className="flex flex-col items-end gap-0.5">
                <button
                  type="button"
                  className="delve-btn whitespace-nowrap px-2 py-1 text-xs"
                  disabled={locked || short}
                  onClick={() => onFuse(rune)}
                  aria-describedby={locked ? `${id}-locked` : short ? `${id}-${key}` : undefined}
                  data-testid={`fuse-${key}`}
                >
                  Fuse {fuseCount} → 1 · ⚙ {formatNumber(price)}
                </button>
                {short && !locked && (
                  <span id={`${id}-${key}`} className="text-[10px] text-amber-200/80">
                    Needs ⚙ {formatNumber(price)} scrap
                  </span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/RunePouchPanel.test.tsx)`
Expected: PASS, 4 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: N + 18 tests in F + 4 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-components
(cd packages/client && npx prettier --write src/features/delve/runes/RunePouchPanel.tsx src/features/delve/runes/__tests__/RunePouchPanel.test.tsx)
git add packages/client/src/features/delve/runes/RunePouchPanel.tsx packages/client/src/features/delve/runes/__tests__/RunePouchPanel.test.tsx
git commit -m "feat(client): the rune pouch panel with 3 to 1 fusing" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: The item sheet's sockets block

`ItemSockets`, which E mounts in the weapon's `MovesetView`.

**Files:**
- Create: `packages/client/src/features/delve/runes/ItemSockets.tsx`
- Test: `packages/client/src/features/delve/runes/__tests__/ItemSockets.test.tsx`

- [ ] **Step 1: Write the failing test**

The chains are hand-made: `runes` is optional on `Move` and `Blow` (wave 0), so the moves without it have no sockets.

Create `packages/client/src/features/delve/runes/__tests__/ItemSockets.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Chains } from '@alloy/engine';
import { ItemSockets } from '../ItemSockets';

describe('ItemSockets (the item sheet)', () => {
  it('lists each move with an open socket and its runes, read-only', () => {
    const chains: Partial<Chains> = {
      basic: [
        { kind: 'light', element: 'fire' },
        { kind: 'heavy', element: 'fire', runes: [{ id: 'linger', tier: 1 }] },
      ],
      primary: {
        moves: [
          {
            kind: 'medium',
            form: 'bolt',
            elements: ['fire'],
            runes: [{ id: 'split', tier: 3 }, null],
          },
          { kind: 'light', form: 'bolt', elements: ['fire'] },
        ],
        payment: 'mana',
      },
    };
    render(<ItemSockets chains={chains} cap={2} />);
    expect(screen.getByTestId('item-sockets')).toHaveTextContent('Sockets · up to 2 a move');
    expect(screen.getByTestId('item-sockets-basic-1')).toHaveTextContent('Basic 2');
    expect(screen.getByTestId('item-sockets-primary-0')).toHaveTextContent('Primary 1');
    expect(screen.getByRole('img', { name: 'Socket 1: Split III' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Socket 2: empty' })).toBeInTheDocument();
    expect(screen.queryByTestId('item-sockets-basic-0')).toBeNull();
    expect(screen.queryByTestId('item-sockets-primary-1')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('with none open, says where to open them', () => {
    render(<ItemSockets chains={{ basic: [{ kind: 'light', element: 'fire' }] }} cap={1} />);
    expect(screen.getByTestId('item-sockets')).toHaveTextContent(
      'None open yet: open them in the chain builder.',
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/ItemSockets.test.tsx)`
Expected: FAIL, `Error: Failed to resolve import "../ItemSockets" from "src/features/delve/runes/__tests__/ItemSockets.test.tsx". Does the file exist?`

- [ ] **Step 3: Write the block**

Create `packages/client/src/features/delve/runes/ItemSockets.tsx`:

```tsx
import { CHAIN_SKILLS, movesOf, socketsOf, type Chains } from '@alloy/engine';
import { SKILL_NAME } from '../chains/chain-text';
import { SocketRow } from './SocketRow';

/**
 * A weapon's sockets on its item sheet, read-only: each move with an open
 * socket ("Primary 2", then its pips), or, with none open, how to open them.
 */
export function ItemSockets({ chains, cap }: { chains: Partial<Chains>; cap: number }) {
  const rows = CHAIN_SKILLS.flatMap((s) =>
    movesOf(chains[s])
      .map((m, i) => ({ s, i, runes: socketsOf(m) }))
      .filter((r) => r.runes.length > 0),
  );
  return (
    <div className="flex flex-col gap-0.5" data-testid="item-sockets">
      <div className="delve-display text-[11px] font-bold uppercase tracking-widest text-amber-300/80">
        Sockets · up to {cap} a move
      </div>
      {rows.length === 0 && (
        <div className="text-stone-500">None open yet: open them in the chain builder.</div>
      )}
      {rows.map(({ s, i, runes }) => (
        <div
          key={`${s}-${i}`}
          className="flex items-center gap-1.5 text-stone-300"
          data-testid={`item-sockets-${s}-${i}`}
        >
          <span>
            {SKILL_NAME[s]} {i + 1}
          </span>
          <SocketRow runes={runes} cap={cap} nextPrice={null} locked />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass, then the whole suite and the typecheck**

Run: `(cd packages/client && npx vitest run src/features/delve/runes/__tests__/ItemSockets.test.tsx)`
Expected: PASS, 2 tests.

Run: `(cd packages/client && npx vitest run)` then `(cd packages/client && npx tsc --noEmit -p .)`
Expected: N + 20 tests in F + 5 files, all passing; the typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/alloy-components
(cd packages/client && npx prettier --write src/features/delve/runes/ItemSockets.tsx src/features/delve/runes/__tests__/ItemSockets.test.tsx)
git add packages/client/src/features/delve/runes/ItemSockets.tsx packages/client/src/features/delve/runes/__tests__/ItemSockets.test.tsx
git commit -m "feat(client): the item sheet's sockets block" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Verification

- [ ] **The area's end check**

```bash
cd /c/Projects/alloy-components
(cd packages/client && npx vitest run src/features/delve/runes)
(cd packages/client && npx vitest run)
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx prettier --check src/features/delve/runes)
git status --short
git log --oneline <wave-0 merge>..HEAD
```

Expected:
- the rune components: 20 tests in 5 files, all passing;
- the client suite: N + 20 tests in F + 5 files (about 801 in 96), all passing;
- the typecheck prints nothing; Prettier: "All matched files use Prettier code style!";
- `git status` shows nothing to commit (the junctions are git-ignored `node_modules`);
- five commits, one per task, each touching only `packages/client/src/features/delve/runes/`.

There is no engine change here, so there is no determinism check: the DPS Lab grid, the pacing rails and the items hash can't move. No version bump either: nothing is mounted until wave 2E, and wave 3 bumps to v0.51.0.
