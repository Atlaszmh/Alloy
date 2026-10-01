# Delve Runes, Wave 2E: Client Wiring — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

## Re-anchored onto wave 1 (4e3f449+)

Checked against `runes/wave1` at `4e3f449` (wave 0 `b216703` + 1A `11e78d0` + 1B `a660405` + 1C `d5d8419`): every edit applied in order with `apply.mjs` to a `git archive` copy, and every `Run:` step executed there against the merged engine's bundle (the client's `@alloy/engine` pointing at wave 1's built engine). Base measured there: **N = 801 tests in F = 96 files**, as estimated. Changes made to this plan:

1. **Task 6, `STOP_TEXT`: edit dropped** (the only anchor mismatch of the 143). Wave 0 already added `rune: { icon: '💠', name: 'Socket a rune', text: 'One rune from your pouch into an open socket. Free.' }` (`29140ca`), so Task 6 no longer touches `STOP_TEXT`; the icon stays wave 0's 💠, not this plan's ◈. Cross-area needs 3 and the Files rows say so.
2. **Task 5, the Forge's fuse button: `fuse-split-1` is `rune-fuse-split-1`.** Wave 1C's `RunePouchPanel` names it `rune-fuse-<id>-<tier>` (as wave 3's E2E wants). It was the only failing test of the whole plan applied at once.
3. **Cross-area needs 5: the id-mapping note is gone.** 1C's ids already match 08's E2E (`data-rune` on `SocketRow`'s pips, `rune-pick-<id>`, `rune-picker-close`, `rune-fuse-<id>-<tier>`).
4. **Task 8 gains the sandbox's unknown-rune guard** (`sandboxStore.ts`, `knownRunes` in `parseSandbox`): `RuneRefSchema` accepts any id and `runeText` throws on one the registry doesn't know (`registry.getRune`), so a loaded sandbox empties those sockets by `registry.findRune`. One test more in `sandboxStore.test.ts`: the plan now ends at **N + 36** (was N + 35), Task 8's runs at 33 tests (2 failing first), and the commit and the end check's Prettier list include `sandboxStore.ts`.
5. **Task 1 → Task 2: the test file's `quick` constant moved to Task 2's append.** Declared in Task 1 but first used in Task 2, it failed Task 1's typecheck (`TS6133: 'quick' is declared but its value is never read`).
6. **1B's ops as built match this plan's calls.** The whole plan applied typechecks against the merged bundle (`unsocketMode`, `runeChange`, `draftPrice`, `SetChainsOptions`, `setChains`, `sameChain`, `fusePrice`, `fuseRunes`, `salvageItems`/`fuseGear`/`transferMoveset` with `opts.unsocket` and their `runes`/`destroyed`, `MovesetTransfer.sockets`/`.runes`, `ParsedDelveProfile.runesLost`, `bankWorld`'s `runes`, `StopAction`'s `{ kind: 'rune'; skill; index; socket; rune }` in `delve/stops.ts`). No signature changed.
7. **Every step's expected FAIL and PASS was run and matches** (Tasks 1 to 8; the whole-client counts N + 7, + 12, + 21, + 24, + 27, + 29, + 32, + 36 as measured: 808 … 837 tests in 96 files). The "Checked on a scratch copy" note under Conventions describes the original check at `81b0e31`; this one supersedes it.
8. **Line endings.** At `4e3f449` every file here is LF in the index and CRLF in a Windows working tree (`core.autocrlf=true`), `sandboxStore.ts` included; `--end-of-line auto` keeps either.

No file here is edited by plans 05 or 07.

---

**Goal:** The runes reach the player. The Anvil's chain builder shows each move's sockets, opens one at its price ("+ socket", disabled with the engine's reason), sockets and pulls runes through the picker, and Apply settles it all with the move edits: its label holds the draft's total (Dust, net Links, scrap, and in destroy mode "destroys Split III"). The store keeps the draft's origins (where each move came from, as the builder reports it), the dev pull-rule override (a chip beside Restart Delve), the runes found this dive, fusing, and the rune toasts (load-time losses, salvage, fuse and transfer parts). The Forge tab gets the pouch with 3 → 1 fusing, the item sheet a weapon's sockets and a transfer's runes, the stop its fifth kind ("Socket a rune"), the loot tray, the pickup feed and the dive summary the runes found, and the Training Grounds any rune at any tier in up to three sockets a move, free.

**Architecture:** Every rule stays in the engine; the client only asks. The store (`stores/delveStore.ts`) gains `ChainDraft.origins` (composed from `ChainEditor`'s `onChange(skill, chain, map)`), one helper that answers what Apply would do (`draftApply`: the changed chains, `SetChainsOptions`, the engine's `draftPrice`, a `setChains` dry run, and the pouch the draft leaves for the picker), Apply's label (`applyLabel`), the dev override (`unsocket`, localStorage `alloy:delve:unsocket`, read only in dev builds) passed to every op that can pull or return parts, `fuseRunes`, `diveRunes`, and the rune notices and toasts' text (`runeLostNotices`, `partsText`, `runeNames`). `ChainEditor` takes an optional `runes: ChainRunes` (the spec's interface plus an optional `openWhy`): each card gets wave 1C's `SocketRow`, the chosen move a "Sockets n/cap · + socket" bar inside `chain-cards`, and a socket tap opens wave 1C's `RunePicker` (which portals itself and returns the focus to its pip). The Anvil, the stop and the Training Grounds pass their own `ChainRunes`; the stop's `'move'` picker passes none.

**Tech Stack:** React 19, TypeScript 5.7, Zustand 5, TailwindCSS v4 (the Delve's `delve-chip`, `delve-btn`, `delve-panel` classes), Vitest 3 with jsdom and Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-30-delve-runes-design.md` ("Changing runes: the draft and its price", "Stops: the fifth kind", "The client", "Build waves → Wave 2 → E"). The overview is `00-overview.md` in this folder; wave 1C's components are `04-wave1c-components.md`.

---

## Base

- **Starts from:** the controller's merge of wave 0 (`01-wave0-contract.md`) and wave 1 (A `02-wave1a-sim.md`, B `03-wave1b-economy.md`, C `04-wave1c-components.md`). It needs from them, exactly as the spec and 04 give them:
  - **Wave 0:** the types (`RuneRef`, `RuneTier`, `RunePouch`, `UnsocketMode`, `ChainOrigins`, `RuneTarget`, `MAX_SOCKETS`; `Move.runes`/`Blow.runes`; `DelveProfile.runes`; `DiveState.runesEarned`; `HeroBlow.runes`; `ResolvedAbility.runes`; `ParsedDelveProfile.runesLost`; `BankResult.runes`; `StopKind` with `'rune'`; `ProfileActionResult.runes`/`destroyed`), the registry's `getRunes`/`findRune`/`getRune`, `balance.json → delve.runes`, the save at version 7 (`MoveSchema`/`BlowSchema` accept `runes`, so the sandbox's saved chains keep them), `fitMovesets`' load-time trims, the pure helpers (`runeFits`, `socketCap`, `socketPrice`, `pouchCount`, `addToPouch`, `takeFromPouch`, `socketsOf`, `runeText`), and `moveBeat` with the builder's readout already reading it (the spec: "its callers switch to it in wave 0 too"; see Cross-area needs, 2).
  - **Wave 1A:** runes merged into `ResolvedAbility.runes` and `HeroBlow.runes` (the active ones: dormant and empty sockets left out), `quick` in the beat, and `followBasic` keeping blow runes by position (Task 8 only tests it).
  - **Wave 1B:** `unsocketMode`, `runeChange`, `draftPrice`, `setChains` with `SetChainsOptions` (origins, the pull mode, net Links, the refusals), `sameChain` comparing runes, `fusePrice`, `fuseRunes`, `salvageItems`/`fuseGear`/`transferMoveset` with `opts.unsocket` and their `runes`/`destroyed`, `MovesetTransfer.sockets` and `.runes`, `bankWorld`'s `runes`, and the stop's `'rune'` kind (`StopAction` `{ kind: 'rune'; skill; index; socket; rune }`).
  - **Wave 1C:** `features/delve/runes/`: `RuneGlyph`, `SocketRow`, `RunePicker` (with its optional `on` and `dormant`), `RunePouchPanel`, `ItemSockets`, and `rune-style.ts`'s `runeName`.
- **Worktree** (the overview's rule; skip it if the controller already made `C:\Projects\alloy-wiring`). PowerShell; `<wave-1 merge>` is the commit the controller names:

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-wiring -b runes/wiring <wave-1 merge>
$W = 'C:\Projects\alloy-wiring'; $R = 'C:\Projects\Alloy'
cmd /c mklink /J "$W\node_modules" "$R\node_modules"
cmd /c mklink /J "$W\packages\engine\node_modules" "$R\packages\engine\node_modules"
New-Item -ItemType Directory -Force "$W\packages\client\node_modules\@alloy" | Out-Null
Get-ChildItem -Force "$R\packages\client\node_modules" | Where-Object Name -ne '@alloy' | ForEach-Object { cmd /c mklink /J "$W\packages\client\node_modules\$($_.Name)" $_.FullName }
cmd /c mklink /J "$W\packages\client\node_modules\@alloy\engine" "$W\packages\engine"
```

  (Remove the links with `cmd /c rmdir`, never by deleting through them.)
- **Before Task 1, build the merged engine into the bundle the client reads, and measure the suite:**

```bash
cd /c/Projects/alloy-wiring
(cd packages/engine && npx tsup)
grep -c "draftPrice\|runeChange\|fuseRunes\|unsocketMode\|socketCap" packages/engine/dist/index.d.ts
(cd packages/client && npx vitest run && npx tsc --noEmit -p .)
```

  Expected: the grep counts at least 5; the client suite passes and the typecheck prints nothing. HEAD `81b0e31` has 781 tests in 91 files and wave 1C adds 20 in 5 (04's own count), so about 801 in 96. Call the measured count **N tests in F files**. This area ends at **N + 36 tests in F files** (it adds tests only to existing files).

## Files

| File | Change |
|---|---|
| `packages/client/src/stores/delveStore.ts` | `ChainDraft.origins` and their composition in `editDraft`; `draftApply`, `applyLabel`; the pull-rule override (`unsocket`, `setUnsocket`, `UNSOCKET_KEY`) passed to Apply, salvage, fuse and transfer; `fuseRunes`; `diveRunes`/`pushDiveRunes`; `runeLostNotices` on load; `partsText`, `runeNames` |
| `packages/client/src/stores/delveStore.test.ts` | the draft's origins, price and Apply in both modes; the override; notices, parts, fusing, the runes found |
| `packages/client/src/stores/sandboxStore.ts` | `knownRunes`: a saved rune the registry doesn't know (`findRune`) leaves its socket empty on load |
| `packages/client/src/stores/sandboxStore.test.ts` | the sandbox's chains keep runes: saved, by Load my build, and through `followBasic`; unknown ids emptied on load |
| `packages/client/src/features/delve/chains/chain-text.ts` | `listed` (moved from the store), `runeTarget`, `runeCandidates`, `countRunes` |
| `packages/client/src/features/delve/chains/ChainEditor.tsx` | `ChainRunes`; `onChange`'s `map`; each card's `SocketRow`; the chosen move's sockets bar; the `RunePicker`; the + card without sockets |
| `packages/client/src/features/delve/chains/MoveEditor.tsx` | a form a socketed rune doesn't fit is off, with a note |
| `packages/client/src/features/delve/AbilitiesPanel.tsx` | the Anvil's `ChainRunes` (the draft's pouch, the rarity's cap, the price, the pull text, the `setChains` dry run per "+ socket"); the price line and Apply's label from `draftApply` |
| `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx` | the builder's sockets, picker, pull, dormant mark, fit, origins, beat; `ChainEditor`'s map |
| `packages/client/src/pages/DelveCamp.tsx` | the Delve button's Apply from `draftApply`; the dev chip "Pull: destroys" / "Pull: pays" |
| `packages/client/src/pages/__tests__/DelveCamp.test.tsx` | the chip; Apply's total |
| `packages/client/src/features/delve/ForgePanel.tsx` | the Runes section (`RunePouchPanel`) and its fuse toast; a gear fuse's rune toast (CRLF, never format) |
| `packages/client/src/features/delve/ItemDetailSheet.tsx` | `ItemSockets` in the moveset; a transfer's sockets and leaving runes; the salvage and transfer rune toasts |
| `packages/client/src/features/delve/BagPanel.tsx` | Salvage junk's rune toast (CRLF, never format) |
| `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx` | the sheet's sockets, a transfer's runes, the Forge's fusing (never format) |
| `packages/client/src/features/delve/StopPanel.tsx` | `RunePick` (`STOP_TEXT.rune` is already wave 0's) |
| `packages/client/src/features/delve/__tests__/StopPanel.test.tsx` | the stop's rune pick |
| `packages/client/src/features/delve/LootTray.tsx` | the runes found this dive (CRLF, never format) |
| `packages/client/src/features/delve/arena/PickupFeed.tsx` | the runes found this dive |
| `packages/client/src/features/delve/DiveSummary.tsx` | `runesEarned`, named |
| `packages/client/src/features/delve/arena/useArena.ts` | a rune pickup banks at once; the runes found go to the store |
| `packages/client/src/features/delve/__tests__/LootTray.test.tsx`, `__tests__/DiveSummary.test.tsx` | the tray, the feed, the summary |
| `packages/client/src/features/delve/training/TrainingPanel.tsx` | the Training Grounds' `ChainRunes`: every rune, every tier, three sockets, free |
| `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx` | the unrestricted socket |

`sandboxStore.ts` needs one change (Task 8): its saved chains go through the engine's `ChainSchema`/`BlowSchema`, which keep `runes` from wave 0 but accept any id (`RuneRefSchema.id` is a string), and `runeText` throws on an id the registry doesn't know, so `parseSandbox` empties those sockets (`knownRunes`, by `registry.findRune`). Load my build copies `heroChains`, runes included; `followBasic` is wave 1A's.

**Owned outside the overview's list** (no other area touches them; the spec assigns the first three to E): `AbilitiesPanel.tsx`, `DiveSummary.tsx`, `arena/useArena.ts`, and the tests in `features/delve/__tests__/` and `pages/__tests__/` named above. See Cross-area needs, 1.

## Cross-area needs

1. **The overview's Owns column** omits files this area must change: `features/delve/AbilitiesPanel.tsx` (where the store meets the builder; the spec's wiring row lists it), `features/delve/DiveSummary.tsx` (the spec: "`DiveSummary` … `runesEarned`"), `features/delve/arena/useArena.ts` (a rune pickup must bank: today `onEvents` banks only on items or reactions), and the existing test files beside them. No other plan edits them. The controller adds them to E's row.
2. **Wave 0, `MoveEditor.tsx`'s readout:** this plan assumes wave 0 switched it to `moveBeat`, as the spec's contract says. If 01 leaves the client alone, wave 0 (or this area, as its first edit to `MoveEditor.tsx`) makes exactly these two edits in `packages/client/src/features/delve/chains/MoveEditor.tsx`: replace `  beatFor,` (in the engine import) with `  moveBeat,`, and replace

   ```
       `then a ${secs(beatFor(bal, a.slot, playedKind(a), stats.tempo))} beat`;
   ```

   with

   ```
       `then a ${secs(moveBeat(bal, a, stats.tempo))} beat`;
   ```

   (then `playedKind` is unused there: drop it from the import too). Task 3's beat test checks it either way. No edit below touches those lines.
3. **Wave 0, `StopPanel.tsx`'s `STOP_TEXT`:** done. Wave 0 added the `rune:` entry below the `upgrade:` one (icon 💠, "Socket a rune", the same text), so Task 6 has no `STOP_TEXT` edit.
4. **Wave 1C:** used as 04 gives it: `SocketRow` with `nextPrice={null}` on the cards (its own "+ socket" is never shown by the builder: the chosen move's bar holds a "+ socket" that can be **disabled with the engine's reason**, which `SocketRowProps` has no room for); `RunePicker` with `on` and `dormant`; `RunePouchPanel`; `ItemSockets`; `runeName`. The bar's button keeps 1C's id, `data-testid="socket-open"`, and sits inside `chain-cards`, so wave 3's E2E finds it where it looks (08's R01, G07, T02).
5. **Wave 3 (08's E2E):** `stop-rune-move-<skill>-<index>` groups each hold their move's `SocketRow` (Task 6), and the Training Grounds' "+ socket" is `socket-open` in `chain-cards` (Task 8). Wave 1C's ids already match 08's (`data-rune` on `SocketRow`'s pips, `rune-pick-<id>`, `rune-picker-close`, `rune-fuse-<id>-<tier>`), so nothing is mapped.

## Where the spec left room

- **`ChainRunes.openWhy`** (optional, added to the spec's interface): why "+ socket" on a move is off, from the engine's `setChains` run dry with one more socket on that move. A draft that Apply already refuses gives no socket reason (Apply's own says why). "Opening a socket is priced and disabled with the engine's dry-run reason."
- **The "+ socket" bar.** A move's pips sit under its card (`SocketRow`); "Sockets 1/2 · + socket · 🔗 2 · ⚙ 40" and its reason sit once, for the chosen move, under the cards, as "Slots 1/5 · + Add slot" does for the chain. A free socket (the Training Grounds: `socketPrice` null) reads "+ socket".
- **Origins in the store.** `ChainDraft.origins` holds, per changed chain, each draft move's index in the saved chain. `editDraft(skill, chain, map?)` composes the builder's map (over the chain it showed) with the draft's origins; a missing map keeps each move in place. A chain that ends up equal to the saved one (by `sameChain`, runes included) leaves the draft with its origins: moving a card and moving it back costs nothing. Apply and every price pass the draft's origins, which the engine ignores for a skill the chain map doesn't hold.
- **The picker's counts** are the pouch less what the draft already sockets, plus what it pulls in pay mode (the engine's `runeChange`), so a rune socketed on one card isn't offered again on another; Apply still checks the pouch.
- **Pull text** is by the mode: "Pull · destroys it" or "Pull · ⚙ 50, back to your pouch" (`pullScrap` by tier). A rune socketed in this same draft and pulled again is free whatever the text says (the engine prices it).
- **Apply's price line** lists what it costs against what the hero holds ("Changes cost ✦ 5 Mana Dust (you have ✦ 4) and 🔗 1 Link (you have 🔗 0)"); "Changes are free until your first dive" only when nothing at all is due, and "Changes are free" after it.
- **A form a socketed rune doesn't fit** is off in `MoveEditor` ("Split doesn't fit a Burst" as its title, and a note: "Split doesn't fit every form: pull it to pick another."), as the engine would refuse it. Kind and element changes keep the runes.
- **The stop's picker** lists each move with an empty socket as its name and its `SocketRow`; tapping a filled pip does nothing (the stop never pulls). The pick is taken after the picker closes (an effect), so the take's own focus move, on to the first door, comes last.
- **The runes found this dive** are a session list in the store (`diveRunes`, newest first, cleared by a new dive), fed from `bankWorld`'s and `completeFloor`'s `runes`; the loot tray and the pickup feed name them grouped ("Split III ×2"); the dive summary counts `runesEarned` (saved) and names this session's.
- **Toasts:** a load-time loss "Split III was lost: its socket no longer exists" (unknown ids skipped); parts "Split I back to your pouch", "2 runes back to your pouch", "destroys Split III", joined with " · " onto the salvage, fuse and transfer toasts; a rune fuse "Fused 3 Split I into Split II".
- **The dev chip** reads the effective rule (`unsocketMode` with the override) and sets the other; production builds neither show it nor read the key.

## Conventions

The overview's shared conventions, plus:
- Run every command from the worktree root, `/c/Projects/alloy-wiring` (Git Bash). Every command line runs in a subshell, as the 4a plan's do.
- **Prettier:** the commit blocks format only files that were Prettier-clean at `81b0e31` (checked: every file here but the four below) with `npx prettier --write --end-of-line auto`, which keeps a CRLF working tree as it is. **Never format** `ForgePanel.tsx`, `BagPanel.tsx`, `LootTray.tsx` (CRLF) and `__tests__/ItemDetailSheet.test.tsx`: hand-edit them only. The code below was checked with Prettier 3.8.1 on a scratch copy (every edit applied to HEAD's files), so `--write` changes nothing typed as written.
- **Checked on a scratch copy.** All 143 edits applied in order to HEAD `81b0e31`'s client with the controller's `apply2.mjs`, with no mismatch. The result, with 04's five components added, typechecks with no error (the whole client, tests included) against a stand-in for waves 0–1: HEAD's engine bundle with the contract's types, interface fields and signatures added as the spec gives them. `ChainEditor`'s four tests ran and passed with `socketsOf` shimmed; the other new tests need waves 0–1's engine, so their expected failures and passes below are worked out by hand from the spec and 04.
- **Line endings:** at `81b0e31` the three CRLF files above are CRLF and every other file here LF; keep each (`file <path>`).
- **The edits** use the 4a plan's language; every anchor was checked unique against HEAD `81b0e31`, edits applied top to bottom per file. None of these anchors sits in a line that waves 0 and 1 change (they change no file here but, possibly, `MoveEditor.tsx`'s beat line and `StopPanel.tsx`'s `STOP_TEXT`, both left alone below except as Cross-area needs 2 and 3 say).
- Each task ends with the whole client suite and the typecheck. Vitest doesn't type-check.
- Test fixtures: the starting sword is common (one socket a move, `socketCap.common`), its Primary one light Fire Bolt, its basic chain light, light, heavy. The first socket costs 1 Link and 20 scrap. Edits are free before the first dive (Dust only). Split fits Bolt and Volley among the Primary's forms (and bow and wand blows); Quick fits every form and weapon; Widen fits Burst, Strike, Ward, Nova and Maelstrom; Linger acts only on heavy and hold blows.

**Commands:**

| What | Command (from the worktree root) |
|---|---|
| Some client test files | `(cd packages/client && npx vitest run <paths>)` |
| Client tests | `(cd packages/client && npx vitest run)` |
| Client typecheck | `(cd packages/client && npx tsc --noEmit -p .)` |
| Client build | `(pnpm -F @alloy/client build)` |
| Prettier check | `(cd packages/client && npx prettier --check --end-of-line auto <paths>)` |
| Engine bundle | `(cd packages/engine && npx tsup)` |

---

## Chunk 1: The store: the draft

### Task 1: The draft's origins, its total and Apply, and the pull rule

The store's draft learns where each move came from, and the one question the builder and the Delve button both ask (what would Apply do?) gets one answer: `draftApply`. Apply passes the origins and the pull rule; the dev override lives in localStorage and is read only in dev builds.

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts` (imports; `MANUAL_ATTACK_KEY`; `listed`; `ChainDraft`; after `draftChanges`; the store's interface, initial state, `editDraft`, `applyDraft`, `addSlot`, `setManualAttack`)
- Modify: `packages/client/src/features/delve/chains/chain-text.ts` (`listed`)
- Test: `packages/client/src/stores/delveStore.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/stores/delveStore.test.ts`:

Replace:

```ts
  SeededRNG,
  type ChainFix,
  type Chains,
  type GearSlot,
  type ManaType,
} from '@alloy/engine';
```

with:

```ts
  SeededRNG,
  pouchCount,
  type ChainFix,
  type Chains,
  type DelveProfile,
  type GearSlot,
  type ManaType,
  type RuneRef,
} from '@alloy/engine';
```

Replace:

```ts
  movesetNotices,
  overtakeNotice,
} from './delveStore';
```

with:

```ts
  movesetNotices,
  overtakeNotice,
  UNSOCKET_KEY,
  applyLabel,
  draftApply,
} from './delveStore';
```

Append at the end of the file:

```ts
const split = { id: 'split', tier: 1 } as const;
const s = () => useDelveStore.getState();

/** A fresh store module, as on a page load: the override it reads back. */
async function freshUnsocket() {
  (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
    'delveStore',
  );
  vi.resetModules();
  return (await import('./delveStore')).useDelveStore.getState().unsocket;
}

describe('delveStore: runes in the draft', () => {
  beforeEach(() => {
    localStorage.clear();
    s().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
  });

  /**
   * The starting sword (common: one socket a move) with a two-Bolt Primary, each Bolt's sockets
   * as given (none open when missing), and the profile's `over`.
   */
  function bolts(runes: ((RuneRef | null)[] | undefined)[], over: Partial<DelveProfile> = {}) {
    const p = s().profile;
    const sword = p.equipped.weapon!;
    const moveset = defaultMoveset(registry, sword, 'fire', { primary: 2 });
    const primary = moveset.chains.primary!;
    const moves = primary.moves.map((m, i) => (runes[i] ? { ...m, runes: runes[i] } : m));
    const weapon = {
      ...sword,
      moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
    };
    s().setProfile({ ...p, ...over, equipped: { ...p.equipped, weapon } });
  }
  const view = () => draftApply(registry, s().profile, s().chainDraft, s().unsocket);

  it('with nothing pending, Apply has no total', () => {
    expect(view()).toMatchObject({ changes: {}, price: null, dry: null });
    expect(applyLabel(registry, null)).toBe('Apply');
  });

  it('socketing a pouch rune is free: Apply takes it from the pouch', () => {
    bolts([[null]], { runes: { split: [1, 0, 0, 0, 0] } });
    const primary = chains().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [split] }, second] });
    expect(s().chainDraft?.origins).toEqual({ primary: [0, 1] });
    expect(view().price).toMatchObject({ dust: 0, links: 0, scrap: 0, refundLinks: 0 });
    expect(pouchCount(view().pouch, split)).toBe(0); // what the picker has left to offer
    expect(applyLabel(registry, view().price)).toBe('Apply');
    expect(s().applyDraft().ok).toBe(true);
    expect(chains().primary.moves[0].runes).toEqual([split]);
    expect(pouchCount(s().profile.runes, split)).toBe(0);
  });

  it("composes the builder's maps into origins; moved and moved back, nothing is left", () => {
    bolts([[split], [null]]);
    const primary = chains().primary;
    const [a, b] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [b, a] }, [1, 0]); // ▸ on the first
    expect(s().chainDraft?.origins).toEqual({ primary: [1, 0] });
    const added = { kind: 'light' as const, form: 'bolt' as const, elements: ['fire' as const] };
    s().editDraft('primary', { ...primary, moves: [b, a, added] }, [0, 1, null]); // +
    expect(s().chainDraft?.origins).toEqual({ primary: [1, 0, null] });
    s().editDraft('primary', { ...primary, moves: [b, a] }, [0, 1]); // × on the new one
    s().editDraft('primary', { ...primary, moves: [a, b] }, [1, 0]); // ◂ back
    expect(s().chainDraft?.chains).toEqual({});
    expect(s().chainDraft?.origins).toEqual({});
  });

  it('a removed move refunds its socket as a Link, netted in the label; its rune goes by the rule', () => {
    bolts([[split], [null]]);
    const primary = chains().primary;
    s().editDraft('primary', { ...primary, moves: [primary.moves[1]] }, [1]); // × on the Split Bolt
    expect(view().price).toMatchObject({ links: 0, refundLinks: 1, destroys: [split] });
    expect(applyLabel(registry, view().price)).toBe('Apply · 🔗 +1 · destroys Split I');
    expect(s().applyDraft().ok).toBe(true);
    expect(chains().primary.moves).toEqual([primary.moves[1]]);
    expect(s().profile.links).toBe(1);
  });

  it('a new socket costs Links and scrap by its index, and Apply needs them', () => {
    bolts([], { links: 0, scrap: 20 });
    const primary = chains().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [null] }, second] });
    expect(view().price).toMatchObject({ links: 1, scrap: 20 });
    expect(applyLabel(registry, view().price)).toBe('Apply · 🔗 1 · ⚙ 20');
    expect(view().dry).toMatchObject({ ok: false, reason: expect.stringMatching(/Links/) });
    s().setProfile({ ...s().profile, links: 1 });
    expect(s().applyDraft().ok).toBe(true);
    expect(s().profile).toMatchObject({ links: 0, scrap: 0 });
  });

  it('the dev override sets the pull rule: paying, a pull costs scrap and the rune comes back', () => {
    bolts([[split]], { scrap: 100 });
    s().setUnsocket('pay');
    expect(localStorage.getItem(UNSOCKET_KEY)).toBe('pay');
    const primary = chains().primary;
    const [first, second] = primary.moves;
    s().editDraft('primary', { ...primary, moves: [{ ...first, runes: [null] }, second] });
    expect(view().price).toMatchObject({ scrap: 15, destroys: [], returns: [split] });
    expect(applyLabel(registry, view().price)).toBe('Apply · ⚙ 15');
    expect(pouchCount(view().pouch, split)).toBe(1); // free to socket elsewhere in this Apply
    expect(s().applyDraft().ok).toBe(true);
    expect(s().profile.scrap).toBe(85);
    expect(pouchCount(s().profile.runes, split)).toBe(1);
  });

  it('reads the override back on this device, in dev builds only', async () => {
    localStorage.setItem(UNSOCKET_KEY, 'pay');
    expect(await freshUnsocket()).toBe('pay');
    localStorage.setItem(UNSOCKET_KEY, 'free'); // not a rule
    expect(await freshUnsocket()).toBeNull();
    const dev = import.meta.env.DEV;
    import.meta.env.DEV = false as unknown as boolean;
    try {
      localStorage.setItem(UNSOCKET_KEY, 'pay');
      expect(await freshUnsocket()).toBeNull();
    } finally {
      import.meta.env.DEV = dev;
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: FAIL, 7 failed and 21 passed (28): `draftApply is not a function` (no total, the removal, the new socket), `expected undefined to deeply equal { primary: [ 0, 1 ] }` and `… { primary: [ 1, 0 ] }` (the draft has no origins), `s(...).setUnsocket is not a function`, and the read-back's `expected undefined to be 'pay'`.

- [ ] **Step 3: `listed` moves to `chain-text.ts`**

In `packages/client/src/features/delve/chains/chain-text.ts`:

Replace:

```ts
/** A chain's names in order: "light Fire Bolt · medium Fire Bolt". */
```

with:

```ts
/** "a", "a and b", "a, b and c". */
export function listed(items: readonly string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join('');
}

/** A chain's names in order: "light Fire Bolt · medium Fire Bolt". */
```

- [ ] **Step 4: The store**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  setChains as engineSetChains,
  addSlot as engineAddSlot,
```

with:

```ts
  setChains as engineSetChains,
  addSlot as engineAddSlot,
  addToPouch,
  draftPrice,
  movesOf,
  runeChange,
  takeFromPouch,
  unsocketMode,
```

Replace:

```ts
  type ChainFix,
  type Chains,
```

with:

```ts
  type ChainFix,
  type ChainOrigins,
  type Chains,
```

Replace:

```ts
  type Rarity,
  type StopAction,
} from '@alloy/engine';
import { SKILL_NAME } from '@/features/delve/chains/chain-text';
import { getDelveRegistry } from '@/features/delve/registry';
```

with:

```ts
  type Rarity,
  type DraftPrice,
  type RunePouch,
  type RuneRef,
  type SetChainsOptions,
  type StopAction,
  type UnsocketMode,
} from '@alloy/engine';
import { SKILL_NAME, listed } from '@/features/delve/chains/chain-text';
import { formatNumber } from '@/features/delve/format';
import { getDelveRegistry } from '@/features/delve/registry';
import { runeName } from '@/features/delve/runes/rune-style';
```

Replace:

```ts
/** Device preference: basic attacks on a button ("1") instead of automatic. */
export const MANUAL_ATTACK_KEY = 'alloy:delve:manualAttack';
```

with:

```ts
/** Device preference: basic attacks on a button ("1") instead of automatic. */
export const MANUAL_ATTACK_KEY = 'alloy:delve:manualAttack';
/** Dev builds: the pull rule chosen on the Anvil's chip ("destroy" or "pay"). */
export const UNSOCKET_KEY = 'alloy:delve:unsocket';
```

Replace:

```ts
/**
 * The saved profile (migrated when older, with the moves it fixed), or null;
```

with:

```ts
/** The pull rule this device chose (dev builds only; production never reads it), or null. */
function loadUnsocket(): UnsocketMode | null {
  if (!import.meta.env.DEV) return null;
  try {
    const mode = localStorage.getItem(UNSOCKET_KEY);
    return mode === 'destroy' || mode === 'pay' ? mode : null;
  } catch {
    return null;
  }
}

/**
 * The saved profile (migrated when older, with the moves it fixed), or null;
```

Delete the lines from `/** "a", "a and b", "a, b and c". */` up to (not including) `const manaNames = (registry: DataRegistry, els: ManaType[]) =>`.

Replace:

```ts
  chains: Partial<Chains>;
}

/**
 * The draft's chains that still differ from the equipped weapon's; none when
```

with:

```ts
  chains: Partial<Chains>;
  /** For each chain in `chains`, the saved move each of its moves came from (null: a new one). */
  origins: ChainOrigins;
}

/** `origins` for the skills `chains` holds. */
function originsFor(origins: ChainOrigins, chains: Partial<Chains>): ChainOrigins {
  return Object.fromEntries(
    CHAIN_SKILLS.filter((s) => chains[s] && origins[s]).map((s) => [s, origins[s]]),
  );
}

/**
 * The draft's chains that still differ from the equipped weapon's; none when
```

Replace:

```ts
interface DelveStore {
  profile: DelveProfile;
```

with:

```ts
/** Apply's options: the draft's origins and the pull rule (the dev override, else the balance's). */
function applyOpts(draft: ChainDraft | null, unsocket: UnsocketMode | null): SetChainsOptions {
  return { origins: draft?.origins ?? {}, unsocket: unsocket ?? undefined };
}

/** What Apply would do with the draft: the Anvil's builder and its Delve button both show it. */
export interface DraftApply {
  /** The chains it would set: the draft's that differ from the weapon's. */
  changes: Partial<Chains>;
  opts: SetChainsOptions;
  /** The total, from the engine's `draftPrice`; null with nothing pending, or when it refuses. */
  price: DraftPrice | null;
  /** The engine's `setChains` as a dry run: whether Apply goes through, and why not. */
  dry: ProfileActionResult | null;
  /** The pouch once Apply has taken what it sockets (and, paying, given back what it pulls). */
  pouch: RunePouch;
}

export function draftApply(
  registry: DataRegistry,
  profile: DelveProfile,
  draft: ChainDraft | null,
  unsocket: UnsocketMode | null,
): DraftApply {
  const changes = draftChanges(registry, profile, draft);
  const opts = applyOpts(draft, unsocket);
  if (Object.keys(changes).length === 0)
    return { changes, opts, price: null, dry: null, pouch: profile.runes };
  const price = draftPrice(registry, profile, changes, opts);
  const change = runeChange(registry, profile, changes, opts);
  let pouch = profile.runes;
  if (!('refused' in change)) {
    const back = unsocketMode(registry, unsocket) === 'pay' ? change.pulled : [];
    // Short of a rune, Apply refuses; the picker shows the pouch as it is.
    pouch = takeFromPouch(addToPouch(pouch, back), change.socketed) ?? pouch;
  }
  return {
    changes,
    opts,
    price: 'refused' in price ? null : price,
    dry: engineSetChains(registry, profile, changes, opts),
    pouch,
  };
}

/** Runes by name: "Split III", "Split III and Quick I". */
export function runeNames(registry: DataRegistry, refs: readonly RuneRef[]): string {
  return listed(refs.map((r) => runeName(registry, r)));
}

/**
 * Apply's label with the draft's total: "Apply · ✦ 15 · 🔗 2 · ⚙ 40 · destroys Split III". Links
 * are netted (the sockets of moves removed pay for those opened): a refund beyond them reads
 * "🔗 +1".
 */
export function applyLabel(registry: DataRegistry, price: DraftPrice | null): string {
  if (!price) return 'Apply';
  const links = price.links - price.refundLinks;
  return [
    'Apply',
    price.dust > 0 ? `✦ ${price.dust}` : null,
    links !== 0 ? `🔗 ${links > 0 ? links : `+${-links}`}` : null,
    price.scrap > 0 ? `⚙ ${formatNumber(price.scrap)}` : null,
    price.destroys.length > 0 ? `destroys ${runeNames(registry, price.destroys)}` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

interface DelveStore {
  profile: DelveProfile;
```

Replace:

```ts
  /** The chain builder's unapplied edits (never saved; a dive can't start over them). */
  chainDraft: ChainDraft | null;
```

with:

```ts
  /** The chain builder's unapplied edits (never saved; a dive can't start over them). */
  chainDraft: ChainDraft | null;
  /** Dev builds: the pull rule chosen on the Anvil's chip (null: the balance's). */
  unsocket: UnsocketMode | null;
```

Replace:

```ts
  /** Put a chain into the builder's draft (a chain back as it was leaves it). */
  editDraft: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
```

with:

```ts
  /**
   * Put a chain into the builder's draft (a chain back as it was leaves it). `map`: for each of
   * its moves, the index in the chain the builder showed (null: a new move); missing, each move
   * stays where it was.
   */
  editDraft: <S extends ChainSkill>(skill: S, chain: Chains[S], map?: (number | null)[]) => void;
```

Replace:

```ts
  setManualAttack: (on: boolean) => void;
}
```

with:

```ts
  setManualAttack: (on: boolean) => void;
  /** Dev builds: choose the pull rule, kept on this device. */
  setUnsocket: (mode: UnsocketMode) => void;
}
```

Replace:

```ts
    chainDraft: null,

    setProfile: (profile) => commit(profile),
```

with:

```ts
    chainDraft: null,
    unsocket: loadUnsocket(),

    setProfile: (profile) => commit(profile),
```

Replace:

```ts
      set({ manualAttack: on });
    },
```

with:

```ts
      set({ manualAttack: on });
    },

    setUnsocket: (mode) => {
      try {
        localStorage.setItem(UNSOCKET_KEY, mode);
      } catch {
        /* storage unavailable: keep it for this session */
      }
      set({ unsocket: mode });
    },
```

Replace the lines from `editDraft: (skill, chain) => {` up to (not including) `revertDraft: () => set({ chainDraft: null }),` with:

```ts
    editDraft: (skill, chain, map) => {
      const { profile, chainDraft } = get();
      const weapon = profile.equipped.weapon;
      if (!weapon) return;
      const changes = draftChanges(registry(), profile, chainDraft);
      // The builder's map is over the chain it showed (the draft's, else the saved one):
      // composed with the draft's own origins, it gives each move's index in the saved chain.
      const shown = changes[skill] ?? heroChains(registry(), profile.equipped, profile.pair)[skill];
      const from: (number | null)[] =
        (changes[skill] ? chainDraft?.origins[skill] : undefined) ??
        movesOf(shown).map((_, i) => i);
      const handed = map ?? movesOf(chain).map((_, j) => j);
      const origins = {
        ...originsFor(chainDraft?.origins ?? {}, changes),
        [skill]: handed.map((k) => (k === null ? null : (from[k] ?? null))),
      };
      // Only what differs from the weapon is kept: an edit undone by hand leaves nothing.
      const next = {
        uid: weapon.uid,
        pair: profile.pair,
        chains: { ...changes, [skill]: chain },
        origins,
      };
      const chains = draftChanges(registry(), profile, next);
      set({ chainDraft: { ...next, chains, origins: originsFor(origins, chains) } });
    },

    applyDraft: () => {
      const { profile, chainDraft, unsocket } = get();
      const changes = draftChanges(registry(), profile, chainDraft);
      const res = applyResult(
        engineSetChains(registry(), profile, changes, applyOpts(chainDraft, unsocket)),
      );
      if (res.ok) set({ chainDraft: null });
      return res;
    },

```

Replace:

```ts
        const { [skill]: _gone, ...chains } = draft.chains;
        set({ chainDraft: { ...draft, chains } });
```

with:

```ts
        const { [skill]: _gone, ...chains } = draft.chains;
        set({ chainDraft: { ...draft, chains, origins: originsFor(draft.origins, chains) } });
```

- [ ] **Step 5: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: PASS, 28 tests.

- [ ] **Step 6: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 7 tests pass in F files.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/alloy-wiring
(cd packages/client && npx prettier --write --end-of-line auto src/stores/delveStore.ts src/stores/delveStore.test.ts src/features/delve/chains/chain-text.ts)
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/chains/chain-text.ts
git commit -m "feat(client): the chain draft keeps its origins; one answer to what Apply would do; the pull-rule override" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: The store outside the draft; the builder's tests (Task 3, part 1)

### Task 2: Rune notices, parts, fusing and the runes found this dive

What the engine says about runes outside the draft reaches the player: a rune a load-time trim destroyed is a notice; salvage, gear fusing and transfers pass the pull rule and report the runes their parts returned or destroyed; three runes fuse into one; and the store keeps the runes picked up this dive for the tray, the feed and the summary (Task 7).

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts` (imports; after `applyLabel`; the store's interface, initial state, `notify`, `resetProfile`, `startDive`, `salvage`, `fuse`, `pushDiveDrops`, `revertDraft`, `transfer`)
- Test: `packages/client/src/stores/delveStore.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/stores/delveStore.test.ts`:

Replace:

```ts
  type DelveProfile,
  type GearSlot,
```

with:

```ts
  type DelveProfile,
  type GearItem,
  type GearSlot,
```

Replace:

```ts
  applyLabel,
  draftApply,
} from './delveStore';
```

with:

```ts
  applyLabel,
  draftApply,
  partsText,
  runeLostNotices,
} from './delveStore';
```

Append at the end of the file:

```ts
const quick = { id: 'quick', tier: 1 } as const;

describe('delveStore: runes outside the draft', () => {
  beforeEach(() => {
    localStorage.clear();
    s().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
  });

  /** The starting sword, its one Bolt's sockets `runes` (under `uid` when given: a bag copy). */
  function swordWith(runes: (RuneRef | null)[], uid?: string): GearItem {
    const sword = s().profile.equipped.weapon!;
    const moveset = defaultMoveset(registry, sword, 'fire');
    const primary = moveset.chains.primary!;
    const moves = [{ ...primary.moves[0], runes }];
    const chains = { ...moveset.chains, primary: { ...primary, moves } };
    return { ...sword, uid: uid ?? sword.uid, moveset: { ...moveset, chains } };
  }

  it('a rune a load-time trim destroys becomes a notice, its socket a Link', async () => {
    const p = s().profile;
    // Two sockets on a common sword (one a move): the second goes, and its Quick with it.
    const weapon = swordWith([split, quick]);
    localStorage.setItem(
      DELVE_SAVE_KEY,
      JSON.stringify({ ...p, equipped: { ...p.equipped, weapon } }),
    );
    (globalThis as { __alloyStoreCache?: Map<string, unknown> }).__alloyStoreCache?.delete(
      'delveStore',
    );
    vi.resetModules();
    const fresh = (await import('./delveStore')).useDelveStore;
    expect(fresh.getState().notices).toEqual(['Quick I was lost: its socket no longer exists']);
    expect(fresh.getState().profile.links).toBe(p.links + 1);
    expect(
      runeLostNotices(registry, [
        { id: 'split', tier: 3 },
        { id: 'nope', tier: 1 },
      ]),
    ).toEqual(['Split III was lost: its socket no longer exists']);
  });

  it('salvage gives a socket back as a Link; its rune follows the pull rule', () => {
    s().setProfile({ ...s().profile, bag: [swordWith([split], 'x5'), swordWith([split], 'x6')] });
    expect(s().salvage(['x5'])).toMatchObject({ links: 1, runes: [], destroyed: [split] });
    s().setUnsocket('pay');
    expect(s().salvage(['x6'])).toMatchObject({ links: 1, runes: [split], destroyed: [] });
    expect(pouchCount(s().profile.runes, split)).toBe(1);
  });

  it('says what became of the runes', () => {
    expect(partsText(registry, [split], [])).toBe('Split I back to your pouch');
    expect(partsText(registry, [split, split], [{ id: 'quick', tier: 3 }])).toBe(
      '2 runes back to your pouch · destroys Quick III',
    );
    expect(partsText(registry, [], [])).toBeNull();
    expect(partsText(registry)).toBeNull();
  });

  it('fuses three of a rune into one of the next tier, for scrap', () => {
    s().setProfile({ ...s().profile, scrap: 20, runes: { split: [3, 0, 0, 0, 0] } });
    expect(s().fuseRunes(split).ok).toBe(true);
    expect(s().profile).toMatchObject({ scrap: 0, runes: { split: [0, 1, 0, 0, 0] } });
    expect(s().fuseRunes(split).ok).toBe(false);
  });

  it('keeps the runes found this dive, newest first, until the next dive', () => {
    s().pushDiveRunes([split, quick]);
    expect(s().diveRunes).toEqual([quick, split]);
    s().startDive(1);
    expect(s().diveRunes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: FAIL, 5 failed and 28 passed (33): the notice test's `expected [] to deeply equal [ 'Quick I was lost: …' ]`, the salvage test's `expected { scrap: …, dust: 0, links: 1 } to match object { …, runes: [], destroyed: [ … ] }`, `partsText is not a function`, `s(...).fuseRunes is not a function` and `s(...).pushDiveRunes is not a function`.

- [ ] **Step 3: The store**

In `packages/client/src/stores/delveStore.ts`:

Replace:

```ts
  fuseGear,
  setAutoSalvage,
```

with:

```ts
  fuseGear,
  fuseRunes as engineFuseRunes,
  setAutoSalvage,
```

Replace:

```ts
          ...fixNotices(getDelveRegistry(), loaded.fixed, loaded.profile.pair),
        ]
      : [],
```

with:

```ts
          ...fixNotices(getDelveRegistry(), loaded.fixed, loaded.profile.pair),
          ...runeLostNotices(getDelveRegistry(), loaded.runesLost),
        ]
      : [],
```

Replace:

```ts
interface DelveStore {
  profile: DelveProfile;
```

with:

```ts
/** The runes a load-time trim destroyed: "Split III was lost: its socket no longer exists". */
export function runeLostNotices(registry: DataRegistry, lost: readonly RuneRef[]): string[] {
  return lost
    .filter((r) => registry.findRune(r.id))
    .map((r) => `${runeName(registry, r)} was lost: its socket no longer exists`);
}

/**
 * What became of the runes an op's parts brought back (salvage, a fuse, a transfer):
 * "Split I back to your pouch", "2 runes back to your pouch · destroys Quick III"; null for none.
 */
export function partsText(
  registry: DataRegistry,
  runes: readonly RuneRef[] = [],
  destroyed: readonly RuneRef[] = [],
): string | null {
  const out: string[] = [];
  if (runes.length > 0)
    out.push(
      `${runes.length === 1 ? runeName(registry, runes[0]) : `${runes.length} runes`} back to your pouch`,
    );
  if (destroyed.length > 0) out.push(`destroys ${runeNames(registry, destroyed)}`);
  return out.length > 0 ? out.join(' · ') : null;
}

interface DelveStore {
  profile: DelveProfile;
```

Replace:

```ts
  /** Drops from the current dive, newest first (session only). */
  diveDrops: string[];
```

with:

```ts
  /** Drops from the current dive, newest first (session only). */
  diveDrops: string[];
  /** Runes picked up this dive, newest first (session only). */
  diveRunes: RuneRef[];
```

Replace:

```ts
  /** Melt bag items; what they gave. */
  salvage: (uids: string[]) => { scrap: number; dust: number; links: number };
```

with:

```ts
  /** Melt bag items; what they gave (their runes back to the pouch, or destroyed, by the rule). */
  salvage: (uids: string[]) => {
    scrap: number;
    dust: number;
    links: number;
    runes: RuneRef[];
    destroyed: RuneRef[];
  };
```

Replace:

```ts
  pushDiveDrops: (uids: string[]) => void;
```

with:

```ts
  pushDiveDrops: (uids: string[]) => void;
  pushDiveRunes: (runes: RuneRef[]) => void;
  /** Fuse `fuseCount` of a rune and tier into one of the next tier, for scrap (the Forge tab). */
  fuseRunes: (ref: RuneRef) => ProfileActionResult;
```

Replace:

```ts
  const notify = (text: string) => set({ notices: [...get().notices, text] });
```

with:

```ts
  const notify = (text: string) => set({ notices: [...get().notices, text] });
  // The pull rule for the ops whose parts can return or destroy a rune.
  const pull = () => ({ unsocket: get().unsocket ?? undefined });
```

Replace:

```ts
    diveDrops: [],
    manualAttack: loadManualAttack(),
```

with:

```ts
    diveDrops: [],
    diveRunes: [],
    manualAttack: loadManualAttack(),
```

Replace:

```ts
      set({ newUids: {}, diveDrops: [], notices: [], bindDeclined: [], chainDraft: null });
```

with:

```ts
      set({
        newUids: {},
        diveDrops: [],
        diveRunes: [],
        notices: [],
        bindDeclined: [],
        chainDraft: null,
      });
```

Replace:

```ts
      set({ diveDrops: [], chainDraft: null });
```

with:

```ts
      set({ diveDrops: [], diveRunes: [], chainDraft: null });
```

Replace:

```ts
    salvage: (uids) => {
      const res = salvageItems(registry(), get().profile, uids);
      commit(res.profile);
      set({ newUids: withoutUids(get().newUids, uids) });
      return { scrap: res.scrap, dust: res.dust, links: res.links };
    },
```

with:

```ts
    salvage: (uids) => {
      const res = salvageItems(registry(), get().profile, uids, pull());
      commit(res.profile);
      set({ newUids: withoutUids(get().newUids, uids) });
      const { scrap, dust, links, runes, destroyed } = res;
      return { scrap, dust, links, runes, destroyed };
    },
```

Replace:

```ts
      const res = applyResult(fuseGear(registry(), get().profile, uids));
```

with:

```ts
      const res = applyResult(fuseGear(registry(), get().profile, uids, pull()));
```

Replace:

```ts
      set({ diveDrops: [...uids.slice().reverse(), ...get().diveDrops].slice(0, 60) });
    },
```

with:

```ts
      set({ diveDrops: [...uids.slice().reverse(), ...get().diveDrops].slice(0, 60) });
    },

    pushDiveRunes: (runes) => {
      if (runes.length === 0) return;
      set({ diveRunes: [...runes.slice().reverse(), ...get().diveRunes].slice(0, 60) });
    },
```

Replace:

```ts
    revertDraft: () => set({ chainDraft: null }),
```

with:

```ts
    revertDraft: () => set({ chainDraft: null }),

    fuseRunes: (ref) => applyResult(engineFuseRunes(registry(), get().profile, ref)),
```

Replace:

```ts
      const res = applyResult(transferMoveset(registry(), get().profile, uid));
```

with:

```ts
      const res = applyResult(transferMoveset(registry(), get().profile, uid, pull()));
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts)`
Expected: PASS, 33 tests.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 12 tests pass in F files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-wiring
(cd packages/client && npx prettier --write --end-of-line auto src/stores/delveStore.ts src/stores/delveStore.test.ts)
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts
git commit -m "feat(client): rune notices, the parts toasts' text, fusing and the runes found this dive" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: Sockets in the chain builder

Each move card shows its sockets (`SocketRow`); the chosen move's bar shows "Sockets 0/1 · + socket · 🔗 1 · ⚙ 20", off with the engine's reason when it can't be paid; a pip opens the picker (`RunePicker`): an empty socket takes a fitting pouch rune, a filled one shows its rune with Pull and the runes to replace it; a dormant rune shows dimmed with its reason (`SocketRow`'s and the picker's). Every change goes into the draft, and the builder reports, with each change, where each move came from. A form a socketed rune doesn't fit is off. The Anvil's price line and Apply read `draftApply`.

**Files:**
- Modify: `packages/client/src/features/delve/chains/chain-text.ts` (imports; `runeTarget`, `runeCandidates`)
- Modify: `packages/client/src/features/delve/chains/ChainEditor.tsx` (imports, props, `ChainRunes`, `fitted`, the component)
- Modify: `packages/client/src/features/delve/chains/MoveEditor.tsx` (imports; the form chips and their note)
- Modify: `packages/client/src/features/delve/AbilitiesPanel.tsx` (imports; the draft's view; the price line, Apply; `ChainRunes`)
- Test: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`:

Replace:

```tsx
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  computeHeroStats,
  defaultChains,
  defaultMoveset,
  heroChains,
  type Chains,
  type ChainSkill,
  type Move,
  type MoveKind,
} from '@alloy/engine';
```

with:

```tsx
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import {
  computeHeroStats,
  defaultChains,
  defaultMoveset,
  heroChains,
  pouchCount,
  socketsOf,
  type Chains,
  type ChainSkill,
  type Move,
  type MoveKind,
  type RuneRef,
  type RunePouch,
} from '@alloy/engine';
```

Replace:

```tsx
describe('ChainEditor', () => {
  const stats = computeHeroStats({}, registry);
```

with:

```tsx
const split = { id: 'split', tier: 1 } as const;

describe('AbilitiesPanel: sockets and runes', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
  });

  /**
   * The starting sword (common: one socket a move): its Primary Bolt's sockets `bolt` (none
   * open when null), its blows' sockets `blows`, and the pouch `pouch`.
   */
  function socketed(
    bolt: (RuneRef | null)[] | null,
    pouch: RunePouch = {},
    blows: ((RuneRef | null)[] | null)[] = [],
  ) {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const moveset = defaultMoveset(registry, sword, 'fire');
    const primary = moveset.chains.primary!;
    const chains = {
      ...moveset.chains,
      basic: moveset.chains.basic!.map((b, i) => (blows[i] ? { ...b, runes: blows[i] } : b)),
      primary: { ...primary, moves: primary.moves.map((m) => (bolt ? { ...m, runes: bolt } : m)) },
    };
    store().setProfile({
      ...p,
      runes: pouch,
      equipped: { ...p.equipped, weapon: { ...sword, moveset: { ...moveset, chains } } },
    });
  }
  /** Tap socket `n` (1-based, by its name) under card `i`. */
  const tapSocket = (i: number, name: string) =>
    fireEvent.click(within(screen.getByTestId(`sockets-${i}`)).getByRole('button', { name }));
  const picker = () => within(screen.getByTestId('rune-picker'));

  it('+ socket opens one on the chosen move at its price; Apply pays the Links and scrap', () => {
    store().setProfile({ ...store().profile, links: 1, scrap: 20 });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 0/1');
    const open = screen.getByTestId('socket-open');
    expect(within(screen.getByTestId('chain-cards')).getByTestId('socket-open')).toBe(open);
    expect(open).toHaveTextContent('+ socket · 🔗 1 · ⚙ 20');
    fireEvent.click(open);
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 1/1');
    expect(screen.queryByTestId('socket-open')).toBeNull(); // a common weapon's cap
    expect(screen.getByTestId('chain-price')).toHaveTextContent(
      'Changes cost 🔗 1 Link (you have 🔗 1) and ⚙ 20 scrap (you have ⚙ 20)',
    );
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · 🔗 1 · ⚙ 20');
    apply();
    expect(chains().primary.moves[0].runes).toEqual([null]);
    expect(store().profile).toMatchObject({ links: 0, scrap: 0 });
  });

  it("+ socket is off without the Links, saying why in the engine's words", () => {
    store().setProfile({ ...store().profile, links: 0, scrap: 20 });
    render(<AbilitiesPanel />);
    const open = screen.getByTestId('socket-open');
    expect(open).toBeDisabled();
    const why = document.getElementById(open.getAttribute('aria-describedby')!);
    expect(why).toHaveTextContent(/Links/);
  });

  it('an empty socket offers the pouch runes that fit the move; picking one sockets it, free', () => {
    socketed([null], { split: [1, 0, 0, 0, 0], quick: [0, 0, 2, 0, 0], widen: [1, 0, 0, 0, 0] });
    render(<AbilitiesPanel />);
    tapSocket(0, 'Socket 1: empty');
    expect(picker().getByRole('button', { name: 'Quick III ×2' })).toBeInTheDocument();
    // Widen fits a Burst, a Strike or a Ward, never a Bolt.
    expect(picker().queryByRole('button', { name: /^Widen/ })).toBeNull();
    fireEvent.click(picker().getByRole('button', { name: 'Split I ×1' }));
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: Split I' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('chain-apply')).toHaveTextContent(/^Apply$/); // socketing is free
    apply();
    expect(chains().primary.moves[0].runes).toEqual([split]);
    expect(pouchCount(store().profile.runes, split)).toBe(0);
  });

  it('a filled socket offers Pull: destroyed by the rule, or for scrap and back to the pouch', () => {
    socketed([split]);
    render(<AbilitiesPanel />);
    tapSocket(0, 'Socket 1: Split I');
    expect(picker().getByTestId('rune-pull')).toHaveTextContent('Pull · destroys it');
    fireEvent.click(picker().getByTestId('rune-pull'));
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · destroys Split I');
    fireEvent.click(screen.getByTestId('chain-revert'));
    act(() => {
      store().setUnsocket('pay');
      store().setProfile({ ...store().profile, scrap: 15 });
    });
    tapSocket(0, 'Socket 1: Split I');
    expect(picker().getByTestId('rune-pull')).toHaveTextContent('Pull · ⚙ 15, back to your pouch');
    fireEvent.click(picker().getByTestId('rune-pull'));
    expect(screen.getByTestId('chain-apply')).toHaveTextContent('Apply · ⚙ 15');
    apply();
    expect(chains().primary.moves[0].runes).toEqual([null]);
    expect(store().profile.scrap).toBe(0);
    expect(pouchCount(store().profile.runes, split)).toBe(1);
  });

  it('a rune that does nothing on its move is dimmed, with why: Linger on a light blow', () => {
    const linger = { id: 'linger', tier: 1 } as const;
    socketed(null, {}, [[linger]]);
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('chain-skill-basic'));
    tapSocket(0, 'Socket 1: Linger I, dormant: works on heavy and hold blows');
    expect(picker().getByTestId('rune-dormant')).toHaveTextContent('Works on heavy and hold blows');
    fireEvent.click(picker().getByRole('button', { name: 'Back' }));
    // A kind change keeps the rune, and a heavy blow wakes it.
    fireEvent.click(screen.getByTestId('kind-heavy'));
    expect(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: Linger I' }),
    ).toBeInTheDocument();
    apply();
    expect(chains().basic[0]).toMatchObject({ kind: 'heavy', runes: [linger] });
  });

  it("a form a socketed rune doesn't fit is off; the kind stays free", () => {
    socketed([split]);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('form-volley')).toBeEnabled();
    for (const f of ['lance', 'burst', 'strike'])
      expect(screen.getByTestId(`form-${f}`), f).toBeDisabled();
    expect(screen.getByTestId('form-burst')).toHaveAttribute('title', "Split doesn't fit a Burst");
    expect(screen.getByTestId('form-rune-note')).toHaveTextContent(
      "Split doesn't fit every form: pull it to pick another.",
    );
    fireEvent.click(screen.getByTestId('kind-heavy'));
    apply();
    expect(chains().primary.moves[0]).toMatchObject({ kind: 'heavy', runes: [split] });
  });

  it('a reorder carries the runes with their move', () => {
    const bolt: Move = { kind: 'light', form: 'bolt', elements: ['fire'] };
    roomy(5, {
      primary: {
        moves: [
          { ...bolt, runes: [split] },
          { ...bolt, kind: 'heavy' },
        ],
        payment: 'mana',
      },
    });
    render(<AbilitiesPanel />);
    fireEvent.click(screen.getByTestId('move-right-0'));
    apply();
    expect(chains().primary.moves.map((m) => m.kind)).toEqual(['heavy', 'light']);
    expect(chains().primary.moves[1].runes).toEqual([split]);
    expect(socketsOf(chains().primary.moves[0])).toEqual([]);
  });

  it("the readout's beat counts a Quick rune", () => {
    socketed([null], { quick: [0, 0, 0, 0, 1] });
    render(<AbilitiesPanel />);
    const beat = () =>
      Number(/then a ([\d.]+)s beat/.exec(screen.getByTestId('ability-readout').textContent!)![1]);
    const before = beat();
    tapSocket(0, 'Socket 1: empty');
    fireEvent.click(picker().getByRole('button', { name: 'Quick V ×1' }));
    expect(beat()).toBeCloseTo(before * 0.7, 1);
  });
});

describe('ChainEditor', () => {
  const stats = computeHeroStats({}, registry);
```

Replace:

```tsx
    expect(onChange).toHaveBeenCalledWith('primary', {
      ...given.primary,
      moves: [{ ...first, form: 'lance' }, ...rest],
    });
```

with:

```tsx
    expect(onChange).toHaveBeenCalledWith(
      'primary',
      { ...given.primary, moves: [{ ...first, form: 'lance' }, ...rest] },
      given.primary.moves.map((_, i) => i), // an edit keeps every move where it was
    );
```

Replace:

```tsx
    expect(screen.queryByTestId('payment-mana')).toBeNull();
  });
});
```

with:

```tsx
    expect(screen.queryByTestId('payment-mana')).toBeNull();
  });

  it('reports where each move came from: ◂ ▸ move it, × drops it, + is new, an edit keeps it', () => {
    const onChange = vi.fn();
    const [m] = given.primary.moves;
    const three = {
      ...given,
      primary: {
        ...given.primary,
        moves: [
          m,
          { ...m, kind: 'medium' as const },
          { ...m, kind: 'heavy' as const, runes: [split] },
        ],
      },
    };
    render(
      <ChainEditor
        chains={three}
        caps={caps}
        stats={stats}
        reactionsSeen={[]}
        locked={false}
        onChange={onChange}
      />,
    );
    const last = () => onChange.mock.lastCall!;
    fireEvent.click(screen.getByTestId('move-right-0'));
    expect(last()[2]).toEqual([1, 0, 2]);
    fireEvent.click(screen.getByTestId('move-remove-1'));
    expect(last()[2]).toEqual([0, 2]);
    fireEvent.click(screen.getByTestId('move-2'));
    fireEvent.click(screen.getByTestId('move-add')); // a copy of the heavy, with no sockets
    expect(last()[2]).toEqual([0, 1, 2, null]);
    expect(last()[1].moves[3]).toEqual({ kind: 'heavy', form: m.form, elements: m.elements });
    fireEvent.click(screen.getByTestId('kind-light'));
    expect(last()[2]).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/AbilitiesPanel.test.tsx)`
Expected: FAIL, 10 failed and 25 passed (35): the eight socket tests (`Unable to find an element by: [data-testid="socket-count"]`, `… [data-testid="sockets-0"]`, the form test's `expected element to be disabled`, and the reorder's `expected [ 'light', 'heavy' ] to deeply equal [ 'heavy', 'light' ]`: without the builder's map the swap reads as two edited moves, and Apply refuses the Split Bolt's socket closing), the changed `toHaveBeenCalledWith` (called with two arguments, not three) and the map test (`expected undefined to deeply equal [ 1, 0, 2 ]`).

## Chunk 3: The builder's sources (Task 3, part 2)

Task 3 continues (its tests are in Chunk 2).

- [ ] **Step 3: `runeTarget` and `runeCandidates`**

In `packages/client/src/features/delve/chains/chain-text.ts`:

Replace:

```ts
import type { ChainSkill, DataRegistry, ManaType, MoveKind } from '@alloy/engine';
import { manaStyle } from '../format';
```

with:

```ts
import {
  runeFits,
  type Blow,
  type ChainSkill,
  type DataRegistry,
  type ManaType,
  type Move,
  type MoveKind,
  type RunePouch,
  type RuneRef,
  type RuneTarget,
  type RuneTier,
} from '@alloy/engine';
import { manaStyle } from '../format';
```

Append at the end of the file:

```ts
/** What a move's runes are socketed on: an ability move's form, or a blow of `weaponBaseId`. */
export function runeTarget(m: Move | Blow, weaponBaseId: string | null): RuneTarget {
  return 'form' in m ? { form: m.form } : { weapon: weaponBaseId, kind: m.kind };
}

/**
 * The runes a socket can take: each that fits `on` and isn't in the move's other sockets
 * (`others`), by tier with its count from `pouch`; or, from 'any' (the Training Grounds, which
 * pick the tier in the picker), once each.
 */
export function runeCandidates(
  registry: DataRegistry,
  on: RuneTarget,
  others: readonly (RuneRef | null)[],
  pouch: RunePouch | 'any',
): { rune: RuneRef; count: number | null }[] {
  const taken = new Set(others.map((r) => r?.id));
  return registry
    .getRunes()
    .filter((def) => runeFits(def, on) && !taken.has(def.id))
    .flatMap((def): { rune: RuneRef; count: number | null }[] =>
      pouch === 'any'
        ? [{ rune: { id: def.id, tier: 1 }, count: null }]
        : (pouch[def.id] ?? []).flatMap((n, i) =>
            n > 0 ? [{ rune: { id: def.id, tier: (i + 1) as RuneTier }, count: n }] : [],
          ),
    );
}
```

- [ ] **Step 4: The builder**

In `packages/client/src/features/delve/chains/ChainEditor.tsx`:

Replace:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CHAIN_SKILLS,
  MANA_TYPES,
  manaPool,
  resolveChain,
```

with:

```tsx
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  CHAIN_SKILLS,
  MANA_TYPES,
  manaPool,
  resolveChain,
  socketsOf,
```

Replace:

```tsx
  type ManaType,
  type Move,
} from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { AttunementBars, Chip } from '../AbilitiesPanel';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { KIND_ICON, SKILL_NAME, blowText, chainText, moveText } from './chain-text';
```

with:

```tsx
  type ManaType,
  type Move,
  type RunePouch,
  type RuneRef,
} from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { AttunementBars, Chip } from '../AbilitiesPanel';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';
import { RunePicker } from '../runes/RunePicker';
import { SocketRow } from '../runes/SocketRow';
import {
  KIND_ICON,
  SKILL_NAME,
  blowText,
  chainText,
  moveText,
  runeCandidates,
  runeTarget,
} from './chain-text';
```

Replace:

```tsx
  footer?: (skill: ChainSkill) => ReactNode;
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S]) => void;
```

with:

```tsx
  footer?: (skill: ChainSkill) => ReactNode;
  /**
   * A change to one chain, with `map`: for each of its moves, the index in the chain handed in
   * that it came from (◂ ▸ move it, × drops it, + gives null, an edit keeps it).
   */
  onChange: <S extends ChainSkill>(skill: S, chain: Chains[S], map: (number | null)[]) => void;
  /** The sockets and runes on each move (the Anvil, the Training Grounds); none without it. */
  runes?: ChainRunes;
```

Replace:

```tsx
/** Move `from` of `list` to `to` (the others keep their order). */
```

with:

```tsx
/** The runes a chain builder offers (see the runes spec, "The client"). */
export interface ChainRunes {
  /** Pouch counts, or 'any' (Training Grounds: every rune, every tier). */
  pouch: RunePouch | 'any';
  /** Most sockets a move may open (the weapon's rarity's; 3 in the Training Grounds). */
  socketCap: number;
  /** The next socket's price when a move has `open`; null: free. */
  socketPrice: (open: number) => { links: number; scrap: number } | null;
  /** The weapon whose blows the basic chain's runes must fit. */
  weaponBaseId: string | null;
  pullText: (rune: RuneRef) => string;
  /** Why "+ socket" on move `index` of `skill` is off (the engine's dry run), or null. */
  openWhy?: (skill: ChainSkill, index: number) => string | null;
}

/** Move `from` of `list` to `to` (the others keep their order). */
```

Replace:

```tsx
/** A copy of `m` in `allowed` elements only: its own where allowed, else the first allowed. */
function fitted(m: Move | Blow, allowed: readonly ManaType[]): Move | Blow {
  if ('element' in m)
    return { ...m, element: allowed.includes(m.element) ? m.element : allowed[0] };
  const kept = m.elements.filter((e) => allowed.includes(e));
  return { ...m, elements: kept.length > 0 ? kept : [allowed[0]] };
}
```

with:

```tsx
/**
 * A new move like `m`, in `allowed` elements only (its own where allowed, else the first
 * allowed), with no sockets: a new move starts at none.
 */
function fitted(m: Move | Blow, allowed: readonly ManaType[]): Move | Blow {
  if ('element' in m)
    return { kind: m.kind, element: allowed.includes(m.element) ? m.element : allowed[0] };
  const kept = m.elements.filter((e) => allowed.includes(e));
  return { kind: m.kind, form: m.form, elements: kept.length > 0 ? kept : [allowed[0]] };
}
```

Replace:

```tsx
 * off-pair. The Anvil binds it to a draft of the weapon's moveset; the
 * Training Grounds to their own loadout. See the moves and chains spec.
```

with:

```tsx
 * off-pair. With `runes`, each card shows its sockets: a tap opens the rune
 * picker (socket, pull or replace), and "+ socket" opens one on the chosen
 * move. The Anvil binds it to a draft of the weapon's moveset; the Training
 * Grounds to their own loadout. See the moves and chains spec, and the runes spec.
```

Replace:

```tsx
  blowElements = elements,
  mana,
}: ChainEditorProps) {
```

with:

```tsx
  blowElements = elements,
  mana,
  runes,
}: ChainEditorProps) {
```

Replace:

```tsx
  const [focusOn, setFocusOn] = useState<string[] | null>(null);
  const pool = manaPool(stats, registry).max;
```

with:

```tsx
  const [focusOn, setFocusOn] = useState<string[] | null>(null);
  // The chosen move's socket whose rune picker is open.
  const [socket, setSocket] = useState<number | null>(null);
  const id = useId();
  const pool = manaPool(stats, registry).max;
```

Replace:

```tsx
  const commit = (next: (Move | Blow)[], payment = chain?.payment) => {
    if (locked) return;
    playSound('buttonClick');
    if (skill === 'basic') onChange('basic', next as Blow[]);
    else onChange(skill, { moves: next as Move[], payment: payment! } as Chain);
  };
```

with:

```tsx
  // Each move's index in the chain handed in: the map a change reports (an edit keeps them all).
  const order: (number | null)[] = entries.map((_, j) => j);
  const commit = (next: (Move | Blow)[], payment = chain?.payment, map = order) => {
    if (locked) return;
    playSound('buttonClick');
    if (skill === 'basic') onChange('basic', next as Blow[], map);
    else onChange(skill, { moves: next as Move[], payment: payment! } as Chain, map);
  };
  // The sockets of move `i` whose rune does nothing there now: socketed, but missing from the
  // runes the engine resolved it with.
  const dormant = (i: number): number[] => {
    const on = (resolved ? resolved.moves[i]?.runes : stats.weapon.blows[i]?.runes) ?? [];
    return socketsOf(entries[i]).flatMap((r, s) =>
      r && !on.some((a) => a.id === r.id) ? [s] : [],
    );
  };
  // The chosen move's sockets: the next one's price (undefined at the cap, null when free), why
  // the engine would refuse it, the socket whose picker is open, and a change to them.
  const move: Move | Blow | undefined = entries[index];
  const sockets = move ? socketsOf(move) : [];
  const nextSocket =
    runes && sockets.length < runes.socketCap ? runes.socketPrice(sockets.length) : undefined;
  const openWhy =
    runes && nextSocket !== undefined && !locked ? (runes.openWhy?.(skill, index) ?? null) : null;
  const current = socket === null ? null : (sockets[socket] ?? null);
  const setSockets = (next: (RuneRef | null)[]) =>
    commit(entries.map((e, j) => (j === index ? { ...e, runes: next } : e)));
```

Replace:

```tsx
                    commit(moved(entries, i, i - 1));
```

with:

```tsx
                    commit(moved(entries, i, i - 1), undefined, moved(order, i, i - 1));
```

Replace:

```tsx
                    commit(moved(entries, i, i + 1));
```

with:

```tsx
                    commit(moved(entries, i, i + 1), undefined, moved(order, i, i + 1));
```

Replace:

```tsx
                    commit(entries.filter((_, j) => j !== i));
```

with:

```tsx
                    commit(
                      entries.filter((_, j) => j !== i),
                      undefined,
                      order.filter((j) => j !== i),
                    );
```

Replace:

```tsx
                  ×
                </button>
              </span>
            </div>
          );
        })}
```

with:

```tsx
                  ×
                </button>
              </span>
              {runes && (
                <div data-testid={`sockets-${i}`}>
                  <SocketRow
                    runes={socketsOf(e)}
                    cap={runes.socketCap}
                    nextPrice={null}
                    dormant={dormant(i)}
                    locked={locked}
                    onSocketTap={(s) => {
                      setPicked(i);
                      setSocket(s);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
```

Replace:

```tsx
              commit([...entries, fitted(entries[index], allowed)]);
```

with:

```tsx
              commit([...entries, fitted(entries[index], allowed)], undefined, [...order, null]);
```

Replace:

```tsx
            +
          </button>
        )}
      </div>
      {!absent && footer?.(skill)}
```

with:

```tsx
            +
          </button>
        )}
        {runes && runes.socketCap > 0 && move && (
          <div
            className="flex w-full flex-wrap items-center gap-2 text-xs text-stone-400"
            data-testid="socket-bar"
          >
            <span data-testid="socket-count">
              Sockets {sockets.length}/{runes.socketCap}
            </span>
            {nextSocket !== undefined && (
              <button
                type="button"
                className="delve-chip"
                disabled={locked || !!openWhy}
                onClick={() => setSockets([...sockets, null])}
                aria-describedby={openWhy ? `${id}-socket` : undefined}
                data-testid="socket-open"
              >
                + socket
                {nextSocket && ` · 🔗 ${nextSocket.links} · ⚙ ${nextSocket.scrap}`}
              </button>
            )}
            {openWhy && (
              <span id={`${id}-socket`} className="text-amber-200/80" data-testid="socket-open-why">
                {openWhy}
              </span>
            )}
          </div>
        )}
      </div>
      {!absent && footer?.(skill)}
```

Replace:

```tsx
        </div>
      </section>
    </div>
  );
}
```

with:

```tsx
        </div>
      </section>
      {runes && move && socket !== null && (
        <RunePicker
          candidates={runeCandidates(
            registry,
            runeTarget(move, runes.weaponBaseId),
            sockets.filter((_, k) => k !== socket),
            runes.pouch,
          )}
          current={current}
          pullText={current ? runes.pullText(current) : undefined}
          tierChoice={runes.pouch === 'any'}
          on={runeTarget(move, runes.weaponBaseId)}
          dormant={dormant(index).includes(socket)}
          onPick={(rune) => setSockets(sockets.map((r, k) => (k === socket ? rune : r)))}
          onPull={
            current ? () => setSockets(sockets.map((r, k) => (k === socket ? null : r))) : undefined
          }
          onClose={() => setSocket(null)}
        />
      )}
    </div>
  );
}
```

In `packages/client/src/features/delve/chains/MoveEditor.tsx`:

Replace:

```tsx
  type MoveKind,
  type ResolvedAbility,
} from '@alloy/engine';
```

with:

```tsx
  type MoveKind,
  type ResolvedAbility,
  runeFits,
  socketsOf,
  type FormId,
} from '@alloy/engine';
```

Replace:

```tsx
import { KIND_ICON, KIND_LABEL } from './chain-text';
```

with:

```tsx
import { KIND_ICON, KIND_LABEL, listed } from './chain-text';
```

Replace:

```tsx
  const takes = (els: readonly ManaType[]) => takesElements(elements, own, els);
```

with:

```tsx
  const takes = (els: readonly ManaType[]) => takesElements(elements, own, els);
  // A form a socketed rune doesn't fit is off (the engine refuses it): pull the rune to pick it.
  const misfits = (form: FormId): string[] =>
    socketsOf(move).flatMap((r) => {
      const def = r ? registry.findRune(r.id) : undefined;
      return def && !runeFits(def, { form }) ? [def.name] : [];
    });
  const blocking = [
    ...new Set(data.forms.filter((f) => f.slot === slot).flatMap((f) => misfits(f.id))),
  ];
```

Replace the lines from `{data.forms` up to (not including) `<div className="text-xs text-stone-400">{registry.getForm(move.form).text}</div>` with:

```tsx
              {data.forms
                .filter((f) => f.slot === slot)
                .map((f) => {
                  const out = f.id === move.form ? [] : misfits(f.id);
                  return (
                    <Chip
                      key={f.id}
                      pressed={move.form === f.id}
                      onClick={() => set({ form: f.id })}
                      testId={`form-${f.id}`}
                      disabled={out.length > 0}
                      title={out.length > 0 ? `${listed(out)} doesn't fit a ${f.name}` : undefined}
                    >
                      {f.icon} {f.name}
                    </Chip>
                  );
                })}
            </div>
            {blocking.length > 0 && (
              <div className="text-[11px] text-amber-200/90" data-testid="form-rune-note">
                {listed(blocking)} {blocking.length > 1 ? "don't" : "doesn't"} fit every form: pull{' '}
                {blocking.length > 1 ? 'them' : 'it'} to pick another.
              </div>
            )}
```

- [ ] **Step 5: The Anvil's sockets, price line and Apply**

In `packages/client/src/features/delve/AbilitiesPanel.tsx`:

Replace:

```tsx
  carriedByText,
  editPrice,
  heroChains,
```

with:

```tsx
  carriedByText,
  heroChains,
```

Replace:

```tsx
  setChains,
  slotPrice,
  type ChainSkill,
```

with:

```tsx
  movesOf,
  setChains,
  slotPrice,
  socketCap,
  socketPrice,
  socketsOf,
  unsocketMode,
  withMove,
  type ChainSkill,
```

Replace:

```tsx
import { draftChanges, useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { applyLabel, draftApply, useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
import { ChainEditor } from './chains/ChainEditor';
```

with:

```tsx
import { ChainEditor, type ChainRunes } from './chains/ChainEditor';
import { listed } from './chains/chain-text';
```

Replace:

```tsx
 * chain's slots, with Add slot's price; and your Mana view. Read-only while a
 * dive is under way, and unarmed (the unarmed default shows).
```

with:

```tsx
 * chain's slots, with Add slot's price; each move's sockets and runes, which
 * the draft carries too; and your Mana view. Read-only while a dive is under
 * way, and unarmed (the unarmed default shows).
```

Replace:

```tsx
  const draft = useDelveStore((s) => s.chainDraft);
  const { equipped, pair } = profile;
```

with:

```tsx
  const draft = useDelveStore((s) => s.chainDraft);
  const unsocket = useDelveStore((s) => s.unsocket);
  const { equipped, pair } = profile;
```

Replace:

```tsx
  // The skills whose draft differs from the weapon's, and the chains shown.
  const changed = useMemo(() => draftChanges(registry, profile, draft), [registry, profile, draft]);
  const chains = useMemo(() => ({ ...saved, ...changed }), [saved, changed]);
```

with:

```tsx
  // The draft against the weapon: the skills it changes, Apply's options and total, the
  // engine's dry run and the pouch it leaves; and the chains shown.
  const view = useMemo(
    () => draftApply(registry, profile, draft, unsocket),
    [registry, profile, draft, unsocket],
  );
  const changed = view.changes;
  const chains = useMemo(() => ({ ...saved, ...changed }), [saved, changed]);
```

Replace:

```tsx
  const pending = Object.keys(changed).length > 0;
  const price = pending ? editPrice(registry, profile, changed) : 0;
  // The engine's own op as a dry run: whether Apply goes through, and why not.
  const applying = pending ? setChains(registry, profile, changed) : null;
  const applyWhy = applying && !applying.ok ? applying.reason : null;
```

with:

```tsx
  const pending = Object.keys(changed).length > 0;
  const { price, dry: applying } = view;
  const applyWhy = applying && !applying.ok ? applying.reason : null;
  // What Apply spends, each against what the hero holds (Links netted: the sockets of moves
  // removed pay for those opened).
  const links = price ? price.links - price.refundLinks : 0;
  const costs = [
    price && price.dust > 0
      ? `✦ ${price.dust} Mana Dust (you have ✦ ${formatNumber(profile.manaDust)})`
      : null,
    links > 0 ? `🔗 ${links} Link${links === 1 ? '' : 's'} (you have 🔗 ${profile.links})` : null,
    price && price.scrap > 0
      ? `⚙ ${formatNumber(price.scrap)} scrap (you have ⚙ ${formatNumber(profile.scrap)})`
      : null,
  ].filter((c) => c !== null);
  const mode = unsocketMode(registry, unsocket);
  const pullScrap = registry.getDelveBalance().runes.pullScrap;
  // The weapon's sockets in the builder: the pouch the draft leaves, the rarity's cap, the price
  // by index, the pull rule's text, and the engine's own op run dry with one more socket on a
  // move: why "+ socket" is off (a draft Apply already refuses says so itself).
  const runes: ChainRunes | undefined = weapon && {
    pouch: view.pouch,
    socketCap: socketCap(registry, weapon.rarity),
    socketPrice: (open) => socketPrice(registry, open),
    weaponBaseId: weapon.baseId,
    pullText: (r) =>
      mode === 'destroy'
        ? 'Pull · destroys it'
        : `Pull · ⚙ ${pullScrap[r.tier - 1]}, back to your pouch`,
    openWhy: (skill, index) => {
      const chain = chains[skill];
      if (!chain || (applying && !applying.ok)) return null;
      const m = movesOf(chain)[index];
      const next = withMove(chain, index, { ...m, runes: [...socketsOf(m), null] });
      const res = setChains(registry, profile, { ...changed, [skill]: next }, view.opts);
      return res.ok ? null : (res.reason ?? null);
    },
  };
```

Replace:

```tsx
            {profile.stats.dives === 0
              ? 'Changes are free until your first dive'
              : `Changes cost ✦ ${price} Mana Dust (you have ✦ ${formatNumber(profile.manaDust)})`}
```

with:

```tsx
            {costs.length > 0
              ? `Changes cost ${listed(costs)}`
              : profile.stats.dives === 0
                ? 'Changes are free until your first dive'
                : 'Changes are free'}
```

Replace:

```tsx
            Apply{price > 0 ? ` · ✦ ${price}` : ''}
```

with:

```tsx
            {applyLabel(registry, price)}
```

Replace:

```tsx
        onChange={(skill, chain) => {
          useDelveStore.getState().editDraft(skill, chain);
```

with:

```tsx
        onChange={(skill, chain, map) => {
          useDelveStore.getState().editDraft(skill, chain, map);
```

Replace:

```tsx
        elements={elements.length > 0 ? elements : undefined}
        mana={<ManaPanel stats={stats} />}
```

with:

```tsx
        elements={elements.length > 0 ? elements : undefined}
        mana={<ManaPanel stats={stats} />}
        runes={runes}
```

- [ ] **Step 6: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/AbilitiesPanel.test.tsx)`
Expected: PASS, 35 tests.

- [ ] **Step 7: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 21 tests pass in F files (the Training Grounds and the stop's move picker still pass: the first passes no `runes` until Task 8, the second none at all, and both ignore `map`).

- [ ] **Step 8: Commit**

```bash
cd /c/Projects/alloy-wiring
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/chains/chain-text.ts src/features/delve/chains/ChainEditor.tsx src/features/delve/chains/MoveEditor.tsx src/features/delve/AbilitiesPanel.tsx src/features/delve/__tests__/AbilitiesPanel.test.tsx)
git add packages/client/src/features/delve/chains/chain-text.ts packages/client/src/features/delve/chains/ChainEditor.tsx packages/client/src/features/delve/chains/MoveEditor.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx
git commit -m "feat(client): sockets and runes in the chain builder, priced through the draft" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 4: The Anvil's Apply, the forge and the sheet

### Task 4: The Delve button's Apply and the dev pull chip

The Anvil's Apply beside the Delve button reads the same `draftApply` as the builder's; a dev-only chip beside "↺ Restart Delve (dev)" flips the pull rule ("Pull: destroys" / "Pull: pays"), kept on this device.

**Files:**
- Modify: `packages/client/src/pages/DelveCamp.tsx` (imports; the draft's Apply; the dev row)
- Test: `packages/client/src/pages/__tests__/DelveCamp.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/pages/__tests__/DelveCamp.test.tsx`:

Replace:

```tsx
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { UNSOCKET_KEY, useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
    expect(screen.getByTestId('draft-discard-delve')).toBeEnabled();
  });
```

with:

```tsx
    expect(screen.getByTestId('draft-discard-delve')).toBeEnabled();
  });

  it("Apply's total holds a socket's Links and scrap, and the engine's reason", () => {
    const s = useDelveStore.getState();
    const primary = heroChains(getDelveRegistry(), s.profile.equipped, s.profile.pair).primary!;
    act(() => {
      s.setProfile({ ...s.profile, scrap: 20 });
      s.editDraft('primary', { ...primary, moves: [{ ...primary.moves[0], runes: [null] }] });
    });
    renderCamp();
    const apply = screen.getByTestId('draft-apply');
    expect(apply).toHaveTextContent('Apply · 🔗 1 · ⚙ 20');
    expect(apply).toBeDisabled(); // the scrap is there, but a new hero has no Links
    expect(screen.getByTestId('draft-apply-why')).toHaveTextContent(/Links/);
  });

  it('the dev chip flips the pull rule and keeps it on this device', () => {
    act(() => useDelveStore.setState({ unsocket: null }));
    renderCamp();
    const chip = screen.getByTestId('unsocket-chip');
    expect(chip).toHaveTextContent('Pull: destroys'); // the balance's rule
    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Pull: pays');
    expect(useDelveStore.getState().unsocket).toBe('pay');
    expect(localStorage.getItem(UNSOCKET_KEY)).toBe('pay');
    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Pull: destroys');
  });

  it('a production build shows no pull chip', () => {
    const dev = import.meta.env.DEV;
    import.meta.env.DEV = false as unknown as boolean;
    try {
      renderCamp();
      expect(screen.queryByTestId('unsocket-chip')).toBeNull();
    } finally {
      import.meta.env.DEV = dev;
    }
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveCamp.test.tsx)`
Expected: FAIL, 2 failed and 12 passed (14): Apply's `expected element to have text content 'Apply · 🔗 1 · ⚙ 20'` (received "Apply"), and `Unable to find an element by: [data-testid="unsocket-chip"]`. (The production test passes already: there is no chip.)

- [ ] **Step 3: The Anvil**

In `packages/client/src/pages/DelveCamp.tsx`:

Replace:

```tsx
import {
  MANA_TYPES,
  editPrice,
  isDiveActive,
  profilePower,
  profileStats,
  setChains,
  startDepthOptions,
} from '@alloy/engine';
import { draftChanges, useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import {
  MANA_TYPES,
  isDiveActive,
  profilePower,
  profileStats,
  startDepthOptions,
  unsocketMode,
} from '@alloy/engine';
import { applyLabel, draftApply, useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
  const draft = useDelveStore((s) => s.chainDraft);
  const [tab, setTab] = useState<Tab>('bag');
```

with:

```tsx
  const draft = useDelveStore((s) => s.chainDraft);
  const unsocket = useDelveStore((s) => s.unsocket);
  const [tab, setTab] = useState<Tab>('bag');
```

Replace:

```tsx
  // The chain builder's unapplied changes: a new dive waits until they're applied or discarded.
  const changes = useMemo(() => draftChanges(registry, profile, draft), [registry, profile, draft]);
  const unapplied = Object.keys(changes).length;
  const blocked = unapplied > 0 && !active;
  // The builder's Apply, here too: its price, and the engine's op as a dry run (why it can't go).
  const price = blocked ? editPrice(registry, profile, changes) : 0;
  const applying = blocked ? setChains(registry, profile, changes) : null;
  const applyWhy = applying && !applying.ok ? applying.reason : null;
```

with:

```tsx
  // The chain builder's unapplied changes: a new dive waits until they're applied or discarded.
  // The builder's Apply, here too: its total, and the engine's op as a dry run (why it can't go).
  const view = useMemo(
    () => draftApply(registry, profile, draft, unsocket),
    [registry, profile, draft, unsocket],
  );
  const unapplied = Object.keys(view.changes).length;
  const blocked = unapplied > 0 && !active;
  const applying = blocked ? view.dry : null;
  const applyWhy = applying && !applying.ok ? applying.reason : null;
  // Dev builds: what pulling a rune does here (the balance's rule until the chip picks one).
  const pull = unsocketMode(registry, unsocket);
```

Replace:

```tsx
                    Apply{price > 0 ? ` · ✦ ${price}` : ''}
```

with:

```tsx
                    {applyLabel(registry, view.price)}
```

Replace the lines from `{import.meta.env.DEV && (` up to (not including) `{selected && (` with:

```tsx
          {import.meta.env.DEV && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="delve-chip"
                onClick={() => {
                  if (!confirmRestart) return setConfirmRestart(true);
                  setConfirmRestart(false);
                  setTab('bag');
                  useDelveStore.getState().resetProfile();
                }}
                onBlur={() => setConfirmRestart(false)}
                data-testid="restart-delve"
              >
                {confirmRestart ? '⚠ Press again to wipe this save' : '↺ Restart Delve (dev)'}
              </button>
              <button
                type="button"
                className="delve-chip"
                onClick={() =>
                  useDelveStore.getState().setUnsocket(pull === 'destroy' ? 'pay' : 'destroy')
                }
                data-testid="unsocket-chip"
              >
                {pull === 'destroy' ? 'Pull: destroys' : 'Pull: pays'}
              </button>
            </div>
          )}
        </div>
      </div>

```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveCamp.test.tsx)`
Expected: PASS, 14 tests.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 24 tests pass in F files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-wiring
(cd packages/client && npx prettier --write --end-of-line auto src/pages/DelveCamp.tsx src/pages/__tests__/DelveCamp.test.tsx)
git add packages/client/src/pages/DelveCamp.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): the Anvil's Apply shows the draft's total; a dev chip flips the pull rule" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: The Forge's pouch, a weapon's sockets on its sheet, and the parts toasts

The Forge tab gets a Runes section (`RunePouchPanel`, fusing 3 → 1); a weapon's sheet lists its sockets (`ItemSockets`); a transfer's price line counts the sockets it moves and its notes name the runes that leave (destroyed, or back to the pouch, by the rule); salvage, a gear fuse and a transfer toast what became of their runes.

**Files:**
- Modify: `packages/client/src/features/delve/ForgePanel.tsx` (imports; the gear fuse's toast; `onFuseRunes`; the Runes section; CRLF, never format)
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx` (imports; `MovesetView`; the transfer's line, notes and toast; the salvage toast)
- Modify: `packages/client/src/features/delve/BagPanel.tsx` (imports; Salvage junk's toast; CRLF, never format)
- Test: `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx` (never format)

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`:

Replace:

```tsx
import { act, render, screen, fireEvent } from '@testing-library/react';
```

with:

```tsx
import { act, render, screen, fireEvent, within } from '@testing-library/react';
```

Replace:

```tsx
  type GearItem,
  type ManaType,
} from '@alloy/engine';
```

with:

```tsx
  type GearItem,
  type ManaType,
  type RuneRef,
} from '@alloy/engine';
```

Append at the end of the file:

```tsx
describe('ItemDetailSheet and the Forge: runes', () => {
  const split = { id: 'split', tier: 3 } as const;
  const quick = { id: 'quick', tier: 1 } as const;
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
    useDelveStore.setState({ unsocket: null });
  });

  /** `w` with its Primary's first move holding `runes`. */
  const withRunes = (w: GearItem, runes: (RuneRef | null)[]): GearItem => {
    const moveset = w.moveset!;
    const primary = moveset.chains.primary!;
    const moves = [{ ...primary.moves[0], runes }, ...primary.moves.slice(1)];
    return { ...w, moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } } };
  };

  it("a weapon's sheet lists each move's open sockets and their runes, read-only", () => {
    const p = store().profile;
    const sword = withRunes(p.equipped.weapon!, [split]);
    store().setProfile({ ...p, equipped: { ...p.equipped, weapon: sword } });
    render(<ItemDetailSheet uid={sword.uid} onClose={() => {}} />);
    expect(screen.getByTestId('item-sockets')).toHaveTextContent('Sockets · up to 1 a move');
    expect(screen.getByTestId('item-sockets-primary-0')).toHaveTextContent('Primary 1');
    expect(screen.getByRole('img', { name: 'Socket 1: Split III' })).toBeInTheDocument();
    expect(within(screen.getByTestId('item-sockets')).queryAllByRole('button')).toHaveLength(0);
  });

  it("a transfer counts the sockets it moves and names the runes that leave, by the pull rule", () => {
    const p = store().profile;
    // A rare sword's two sockets onto a common one (one a move): Quick has no socket there.
    const worn = withRunes(rareSword('w1'), [split, quick]);
    const common = { ...p.equipped.weapon!, uid: 'w2' };
    store().setProfile({ ...p, scrap: 999, equipped: { ...p.equipped, weapon: worn }, bag: [common] });
    render(
      <>
        <ItemDetailSheet uid="w2" onClose={() => {}} />
        <ToastContainer />
      </>,
    );
    expect(screen.getByTestId('item-compare')).toHaveTextContent('to move it, its 1 socket included');
    expect(screen.getByTestId('transfer-runes')).toHaveTextContent('Destroys Quick I: no socket for it there');
    act(() => store().setUnsocket('pay'));
    expect(screen.getByTestId('transfer-runes')).toHaveTextContent('Quick I back to your pouch');
    act(() => store().setUnsocket('destroy'));
    fireEvent.click(screen.getByTestId('transfer-button'));
    expect(screen.getByText(/Your moveset moved onto .+ · \+1 Link · destroys Quick I$/)).toBeInTheDocument();
    expect(store().profile.equipped.weapon!.uid).toBe('w2');
  });

  it('the Forge tab holds the pouch: three of a rune fuse into one of the next tier, for scrap', () => {
    store().setProfile({ ...store().profile, scrap: 20, runes: { split: [3, 0, 0, 0, 0] } });
    render(
      <>
        <ForgePanel onSelect={() => {}} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(within(screen.getByTestId('forge-runes')).getByTestId('rune-fuse-split-1'));
    expect(store().profile).toMatchObject({ scrap: 0, runes: { split: [0, 1, 0, 0, 0] } });
    expect(screen.getByText('Fused 3 Split I into Split II')).toBeInTheDocument();
    expect(screen.getByTestId('pouch-split-2')).toHaveTextContent('Split II ×1');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: FAIL, 3 failed and 22 passed (25): `Unable to find an element by: [data-testid="item-sockets"]`, the transfer's `expected element to have text content 'to move it, its 1 socket included'`, and `Unable to find an element by: [data-testid="forge-runes"]`.

- [ ] **Step 3: The Forge tab**

In `packages/client/src/features/delve/ForgePanel.tsx` (CRLF; hand-edit, never format):

Replace:

```tsx
  upgradeCost,
  GEAR_SLOTS,
  type GearItem,
  type Rarity,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
  upgradeCost,
  fusePrice,
  GEAR_SLOTS,
  type GearItem,
  type Rarity,
  type RuneRef,
  type RuneTier,
} from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
import { RARITY_COLOR, RARITY_LABEL, formatNumber } from './format';
```

with:

```tsx
import { RARITY_COLOR, RARITY_LABEL, formatNumber } from './format';
import { RunePouchPanel } from './runes/RunePouchPanel';
import { runeName } from './runes/rune-style';
```

Replace:

```tsx
    if (res.links)
      showToast(`+${res.links} Link${res.links > 1 ? 's' : ''} from the weapons' extra slots`);
```

with:

```tsx
    if (res.links)
      showToast(`+${res.links} Link${res.links > 1 ? 's' : ''} from the weapons' extra slots`);
    const parts = partsText(registry, res.runes, res.destroyed);
    if (parts) showToast(parts);
```

Replace:

```tsx
  // The forge waits for the dive to end, as all gear does (a stop's upgrade aside).
```

with:

```tsx
  const fuseCount = registry.getDelveBalance().runes.fuseCount;
  const onFuseRunes = (ref: RuneRef) => {
    const res = useDelveStore.getState().fuseRunes(ref);
    if (!res.ok) {
      playSound('combineFail');
      showToast(res.reason ?? 'Cannot fuse');
      return;
    }
    playSound('combineMerge');
    vibrate('success');
    const made = { ...ref, tier: (ref.tier + 1) as RuneTier };
    showToast(`Fused ${fuseCount} ${runeName(registry, ref)} into ${runeName(registry, made)}`);
  };

  // The forge waits for the dive to end, as all gear does (a stop's upgrade aside).
```

Replace:

```tsx
          })}
        </div>
      </section>
    </div>
  );
}
```

with:

```tsx
          })}
        </div>
      </section>

      {/* Runes: the pouch, fused 3 → 1 (socketed in the chain builder) */}
      <section data-testid="forge-runes">
        <RunePouchPanel
          pouch={profile.runes}
          fuseCount={fuseCount}
          fusePrice={(ref) => fusePrice(registry, ref)}
          scrap={profile.scrap}
          locked={false}
          onFuse={onFuseRunes}
        />
      </section>
    </div>
  );
}
```

(Mid-dive the whole tab is the "forge and salvage between dives" note, so the pouch is never shown unlocked during a dive.)

- [ ] **Step 4: The item sheet**

In `packages/client/src/features/delve/ItemDetailSheet.tsx`:

Replace:

```tsx
  salvageDust,
  salvageValue,
  upgradeCost,
```

with:

```tsx
  salvageDust,
  salvageValue,
  socketCap,
  unsocketMode,
  upgradeCost,
```

Replace:

```tsx
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { partsText, runeNames, useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
import { SKILL_NAME, blowText, chainText, moveText } from './chains/chain-text';
```

with:

```tsx
import { SKILL_NAME, blowText, chainText, moveText } from './chains/chain-text';
import { ItemSockets } from './runes/ItemSockets';
```

Replace:

```tsx
        );
      })}
    </div>
  );
}

/** Power, Damage and Toughness against what's worn. */
```

with:

```tsx
        );
      })}
      <ItemSockets chains={chains} cap={socketCap(registry, item.rarity)} />
    </div>
  );
}

/** Power, Damage and Toughness against what's worn. */
```

Replace:

```tsx
  const profile = useDelveStore((s) => s.profile);
  const store = useDelveStore.getState;
```

with:

```tsx
  const profile = useDelveStore((s) => s.profile);
  const unsocket = useDelveStore((s) => s.unsocket);
  const store = useDelveStore.getState;
```

Replace:

```tsx
  const diving = isDiveActive(profile);
```

with:

```tsx
  const diving = isDiveActive(profile);
  // What a transfer's leaving runes become: destroyed, or back to the pouch.
  const pull = unsocketMode(registry, unsocket);
```

Replace:

```tsx
      const links = res.links ? ` · +${res.links} Link${res.links > 1 ? 's' : ''}` : '';
      showToast(`Your moveset moved onto ${item.name}${links}`);
```

with:

```tsx
      const links = res.links ? ` · +${res.links} Link${res.links > 1 ? 's' : ''}` : '';
      const parts = partsText(registry, res.runes, res.destroyed);
      showToast(`Your moveset moved onto ${item.name}${links}${parts ? ` · ${parts}` : ''}`);
```

Replace:

```tsx
    const { scrap, links } = store().salvage([item.uid]);
    playSound('orbRemove');
    vibrate('light');
    if (links > 0) showToast(`+${links} Link${links > 1 ? 's' : ''} from its extra slots`);
```

with:

```tsx
    const { scrap, links, runes, destroyed } = store().salvage([item.uid]);
    playSound('orbRemove');
    vibrate('light');
    if (links > 0) showToast(`+${links} Link${links > 1 ? 's' : ''} from its extra slots`);
    const parts = partsText(registry, runes, destroyed);
    if (parts) showToast(parts);
```

Replace:

```tsx
                  With your moveset · ⚙ {formatNumber(transfer.scrap)} to move it
                </div>
```

with:

```tsx
                  With your moveset · ⚙ {formatNumber(transfer.scrap)} to move it
                  {transfer.sockets > 0 &&
                    `, its ${transfer.sockets} socket${transfer.sockets === 1 ? '' : 's'} included`}
                </div>
```

Replace:

```tsx
              Leaves your {leaves.map((s) => SKILL_NAME[s]).join(' and ')} behind
            </div>
          )}
```

with:

```tsx
              Leaves your {leaves.map((s) => SKILL_NAME[s]).join(' and ')} behind
            </div>
          )}
          {transfer && !diving && transfer.runes.length > 0 && (
            <div
              className="col-span-2 text-center text-[11px] text-amber-200/90"
              data-testid="transfer-runes"
            >
              {pull === 'destroy'
                ? `Destroys ${runeNames(registry, transfer.runes)}: no socket for ${transfer.runes.length === 1 ? 'it' : 'them'} there`
                : `${runeNames(registry, transfer.runes)} back to your pouch`}
            </div>
          )}
```

In `packages/client/src/features/delve/BagPanel.tsx` (CRLF; hand-edit, never format):

Replace:

```tsx
import { useDelveStore } from '@/stores/delveStore';
```

with:

```tsx
import { partsText, useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
    const { scrap, dust, links } = useDelveStore.getState().salvage(junk);
```

with:

```tsx
    const { scrap, dust, links, runes, destroyed } = useDelveStore.getState().salvage(junk);
```

Replace:

```tsx
      showToast(
        `Salvaged ${junk.length} items · +${formatNumber(scrap)} scrap${dustText}${linkText}`,
      );
```

with:

```tsx
      const parts = partsText(registry, runes, destroyed);
      showToast(
        `Salvaged ${junk.length} items · +${formatNumber(scrap)} scrap${dustText}${linkText}${parts ? ` · ${parts}` : ''}`,
      );
```

- [ ] **Step 5: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: PASS, 25 tests.

- [ ] **Step 6: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 27 tests pass in F files.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/alloy-wiring
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/ItemDetailSheet.tsx)
git add packages/client/src/features/delve/ForgePanel.tsx packages/client/src/features/delve/ItemDetailSheet.tsx packages/client/src/features/delve/BagPanel.tsx packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx
git commit -m "feat(client): the Forge's rune pouch and fusing, a weapon's sockets on its sheet, and the parts toasts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 5: The stop and the runes found

### Task 6: The stop's fifth kind

"Socket a rune: one rune from your pouch into an open socket. Free." Its picker lists each move of the equipped weapon with an empty socket, by its name, with its `SocketRow`; tapping an empty pip opens the `RunePicker` with the pouch runes that fit and aren't on the move; a pick takes the stop (`takeStop` with `{ kind: 'rune', skill, index, socket, rune }`), after the picker has closed, so the focus goes on to the first door.

**Files:**
- Modify: `packages/client/src/features/delve/StopPanel.tsx` (imports; the picker's kinds; `RunePick`; `STOP_TEXT.rune` is wave 0's, icon 💠)
- Test: `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/__tests__/StopPanel.test.tsx`:

Replace:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import {
  generateItem,
  heroChains,
  movesetOf,
```

with:

```tsx
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  generateItem,
  heroChains,
  movesetOf,
  pouchCount,
```

Replace:

```tsx
    expect(store().profile.bag[0].upgrade).toBe(1);
    expect(store().profile.scrap).toBe(0);
  });
});
```

with:

```tsx
    expect(store().profile.bag[0].upgrade).toBe(1);
    expect(store().profile.scrap).toBe(0);
  });

  /** At a stop offering a rune: the sword's Bolt has one open, empty socket. */
  function atRuneStop() {
    const p = store().profile;
    const sword = p.equipped.weapon!;
    const moveset = movesetOf(registry, sword);
    const primary = moveset.chains.primary!;
    const moves = [{ ...primary.moves[0], runes: [null] }];
    const weapon = {
      ...sword,
      moveset: { ...moveset, chains: { ...moveset.chains, primary: { ...primary, moves } } },
    };
    atStop(['rune'], {
      equipped: { ...p.equipped, weapon },
      runes: { split: [1, 0, 0, 0, 0], widen: [1, 0, 0, 0, 0] },
    });
    fireEvent.click(screen.getByTestId('stop-rune'));
    const move = screen.getByTestId('stop-rune-move-primary-0');
    expect(move).toHaveTextContent('Primary · light Fire Bolt');
    fireEvent.click(within(move).getByRole('button', { name: 'Socket 1: empty' }));
    return within(screen.getByTestId('rune-picker'));
  }

  it('sockets a fitting pouch rune into an empty socket, free, and the focus goes on to the doors', () => {
    const picker = atRuneStop();
    expect(screen.getByTestId('stop-rune')).toHaveTextContent('Socket a rune');
    // Widen doesn't fit a Bolt.
    expect(picker.queryByRole('button', { name: /^Widen/ })).toBeNull();
    fireEvent.click(picker.getByRole('button', { name: 'Split I ×1' }));
    expect(chains().primary.moves[0].runes).toEqual([{ id: 'split', tier: 1 }]);
    expect(pouchCount(store().profile.runes, { id: 'split', tier: 1 })).toBe(0);
    expect(store().profile.dive!.stop!.taken).toBe(true);
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.getByText('Socket a rune: done')).toBeInTheDocument();
    expect(screen.getByTestId('door-first')).toHaveFocus();
  });

  it("Escape closes the rune picker, not the stop's", () => {
    atRuneStop();
    fireEvent.keyDown(within(screen.getByTestId('rune-picker')).getByRole('dialog'), {
      key: 'Escape',
    });
    expect(screen.queryByTestId('rune-picker')).toBeNull();
    expect(screen.getByTestId('stop-picker')).toBeInTheDocument();
    expect(store().profile.dive!.stop!.taken).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx)`
Expected: FAIL, 2 failed and 9 passed (11): `Unable to find an element by: [data-testid="stop-rune-move-primary-0"]` in both (the card shows, with no text of its own, and its picker is empty).

- [ ] **Step 3: The stop's rune**

In `packages/client/src/features/delve/StopPanel.tsx`:

Replace:

```tsx
import { useId, useMemo, useRef, useState } from 'react';
```

with:

```tsx
import { useEffect, useId, useMemo, useRef, useState } from 'react';
```

Replace:

```tsx
  referenceDepth,
  slotPrice,
  takeStop,
```

with:

```tsx
  referenceDepth,
  resolveChain,
  slotPrice,
  socketCap,
  socketsOf,
  takeStop,
```

Replace:

```tsx
  withMove,
  type Blow,
  type ChainSkill,
```

with:

```tsx
  withMove,
  type AbilitySlot,
  type Blow,
  type ChainSkill,
```

Replace:

```tsx
import { SKILL_NAME } from './chains/chain-text';
import { ChainEditor } from './chains/ChainEditor';
```

with:

```tsx
import { SKILL_NAME, blowText, moveText, runeCandidates, runeTarget } from './chains/chain-text';
import { ChainEditor } from './chains/ChainEditor';
import { RunePicker } from './runes/RunePicker';
import { SocketRow } from './runes/SocketRow';
```

Replace:

```tsx
        {kind === 'upgrade' && <UpgradePick take={take} />}
```

with:

```tsx
        {kind === 'upgrade' && <UpgradePick take={take} />}
        {kind === 'rune' && <RunePick take={take} />}
```

Append at the end of the file:

```tsx
/**
 * Each move of the equipped weapon with an empty socket, with its sockets: tapping an empty one
 * opens the rune picker (the pouch's runes that fit the move and aren't on it), and a pick takes
 * the stop. A filled socket stays as it is: the stop never pulls.
 */
function RunePick({ take }: { take: Take }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const { equipped, pair } = profile;
  const [at, setAt] = useState<{ skill: ChainSkill; index: number; socket: number } | null>(null);
  // The pick is taken once the picker has closed (and given the focus back to its socket), so
  // the take's own move of the focus, on to the first door, comes last.
  const [chosen, setChosen] = useState<StopAction | null>(null);
  useEffect(() => {
    if (!chosen) return;
    setChosen(null);
    take(chosen);
  }, [chosen, take]);
  const chains = useMemo(() => heroChains(registry, equipped, pair), [registry, equipped, pair]);
  const stats = useMemo(
    () => profileStats(registry, { equipped, pair }),
    [registry, equipped, pair],
  );
  const weapon = equipped.weapon;
  if (!weapon) return null;
  const rows = CHAIN_SKILLS.flatMap((skill) => {
    const chain = chains[skill];
    if (!chain) return [];
    const names = Array.isArray(chain)
      ? chain.map((b) => blowText(registry, b))
      : resolveChain(registry, stats, skill as AbilitySlot, chain).moves.map(moveText);
    return movesOf(chain).flatMap((move, index) =>
      socketsOf(move).includes(null) ? [{ skill, index, move, name: names[index] }] : [],
    );
  });
  const picked = at && rows.find((r) => r.skill === at.skill && r.index === at.index);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(({ skill, index, move, name }) => (
        <div
          key={`${skill}-${index}`}
          role="group"
          aria-label={`${SKILL_NAME[skill]} · ${name}`}
          className="delve-panel flex items-center justify-between gap-2 p-2 text-sm"
          data-testid={`stop-rune-move-${skill}-${index}`}
        >
          <span>
            {SKILL_NAME[skill]} · {name}
          </span>
          <SocketRow
            runes={socketsOf(move)}
            cap={socketCap(registry, weapon.rarity)}
            nextPrice={null}
            onSocketTap={(socket) => {
              if (socketsOf(move)[socket] === null) setAt({ skill, index, socket });
            }}
          />
        </div>
      ))}
      {at && picked && (
        <RunePicker
          candidates={runeCandidates(
            registry,
            runeTarget(picked.move, weapon.baseId),
            socketsOf(picked.move),
            profile.runes,
          )}
          on={runeTarget(picked.move, weapon.baseId)}
          onPick={(rune) => setChosen({ kind: 'rune', ...at, rune })}
          onClose={() => setAt(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/StopPanel.test.tsx)`
Expected: PASS, 11 tests.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 29 tests pass in F files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-wiring
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/StopPanel.tsx src/features/delve/__tests__/StopPanel.test.tsx)
git add packages/client/src/features/delve/StopPanel.tsx packages/client/src/features/delve/__tests__/StopPanel.test.tsx
git commit -m "feat(client): the stop's fifth kind: socket a pouch rune into an open socket" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 7: The runes found this dive

A rune pickup banks at once (today `onEvents` banks only on items or reactions), and the runes it banks go to the store's `diveRunes`, as the floor's end's do. The loot tray and the arena's pickup feed name them grouped ("Split III ×2"); the dive summary counts `runesEarned` and names this session's.

**Files:**
- Modify: `packages/client/src/features/delve/arena/useArena.ts` (`bank`, `checkEnd`, `onEvents`)
- Modify: `packages/client/src/features/delve/chains/chain-text.ts` (`countRunes`)
- Modify: `packages/client/src/features/delve/LootTray.tsx` (CRLF, never format), `packages/client/src/features/delve/arena/PickupFeed.tsx`, `packages/client/src/features/delve/DiveSummary.tsx`
- Test: `packages/client/src/features/delve/__tests__/LootTray.test.tsx`, `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/__tests__/LootTray.test.tsx`:

Replace:

```tsx
    render(<LootTray originRef={{ current: null }} onSelect={() => {}} />);
    expect(screen.getByTestId('equip-upgrades')).toHaveTextContent('▲ Equip upgrades (1)');
  });
});
```

with:

```tsx
    render(<LootTray originRef={{ current: null }} onSelect={() => {}} />);
    expect(screen.getByTestId('equip-upgrades')).toHaveTextContent('▲ Equip upgrades (1)');
  });

  const found = () =>
    store().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);

  it('the tray names the runes found this dive, grouped', () => {
    dive();
    found();
    render(<LootTray originRef={{ current: null }} onSelect={() => {}} />);
    // Each after its glyph, newest first.
    const [first, second, ...more] = screen.getAllByTestId('loot-rune');
    expect(first).toHaveTextContent(/Quick I$/);
    expect(second).toHaveTextContent(/Split III ×2$/);
    expect(more).toEqual([]);
  });

  it('the feed shows them too, even with no item found', () => {
    store().startDive(1);
    found();
    render(<PickupFeed onSelect={() => {}} top={0} />);
    expect(screen.getByTestId('pickup-feed')).toBeInTheDocument();
    const [first, second, ...more] = screen.getAllByTestId('feed-rune');
    expect(first).toHaveTextContent(/Quick I$/);
    expect(second).toHaveTextContent(/Split III ×2$/);
    expect(more).toEqual([]);
  });
});
```

In `packages/client/src/features/delve/__tests__/DiveSummary.test.tsx`:

Replace:

```tsx
import { DiveSummary } from '../DiveSummary';
import { getDelveRegistry } from '../registry';
```

with:

```tsx
import { DiveSummary } from '../DiveSummary';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
```

Replace:

```tsx
function summary(dustEarned: number, linksEarned = 0) {
```

with:

```tsx
function summary(dustEarned: number, linksEarned = 0, runesEarned = 0) {
```

Replace:

```tsx
      dive={{ ...dive, phase: 'extracted', dustEarned, linksEarned }}
```

with:

```tsx
      dive={{ ...dive, phase: 'extracted', dustEarned, linksEarned, runesEarned }}
```

Replace:

```tsx
    expect(screen.getByTestId('dive-links')).toHaveTextContent('🔗 2 Links from salvaged weapons');
  });
});
```

with:

```tsx
    expect(screen.getByTestId('dive-links')).toHaveTextContent('🔗 2 Links from salvaged weapons');
    expect(screen.queryByTestId('dive-runes')).toBeNull();
  });

  it('counts the runes found this dive, and names them', () => {
    useDelveStore.getState().pushDiveRunes([
      { id: 'split', tier: 3 },
      { id: 'quick', tier: 1 },
    ]);
    summary(0, 0, 2);
    expect(screen.getByTestId('dive-runes')).toHaveTextContent(
      '◈ 2 runes found: Quick I, Split III',
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/LootTray.test.tsx src/features/delve/__tests__/DiveSummary.test.tsx)`
Expected: FAIL, 3 failed and 10 passed (13): `Unable to find an element by: [data-testid="loot-rune"]`, `… [data-testid="pickup-feed"]` and `… [data-testid="dive-runes"]`.

- [ ] **Step 3: Banking a rune, and the runes found**

In `packages/client/src/features/delve/arena/useArena.ts`:

Replace:

```ts
    store.pushDiveDrops(res.kept.map((i) => i.uid));
    store.markNew(res.kept.map((i) => i.uid));
```

with:

```ts
    store.pushDiveDrops(res.kept.map((i) => i.uid));
    store.pushDiveRunes(res.runes);
    store.markNew(res.kept.map((i) => i.uid));
```

Replace:

```ts
      store.pushDiveDrops(res.kept.map((i) => i.uid));
      onUiRef.current({
```

with:

```ts
      store.pushDiveDrops(res.kept.map((i) => i.uid));
      store.pushDiveRunes(res.runes);
      onUiRef.current({
```

Replace:

```ts
      if (world.pending.items.length > 0 || world.pending.reactions.length > 0) bank(world);
```

with:

```ts
      const { items, reactions, runes } = world.pending;
      if (items.length + reactions.length + runes.length > 0) bank(world);
```

In `packages/client/src/features/delve/chains/chain-text.ts`:

Append at the end of the file:

```ts
/** Runes counted by id and tier, in the order first seen: [{ Quick I, 1 }, { Split III, 2 }]. */
export function countRunes(refs: readonly RuneRef[]): { rune: RuneRef; count: number }[] {
  const out: { rune: RuneRef; count: number }[] = [];
  for (const r of refs) {
    const seen = out.find((o) => o.rune.id === r.id && o.rune.tier === r.tier);
    if (seen) seen.count++;
    else out.push({ rune: r, count: 1 });
  }
  return out;
}
```

In `packages/client/src/features/delve/LootTray.tsx` (CRLF; hand-edit, never format):

Replace:

```tsx
import { UPGRADE_EPSILON } from './format';
```

with:

```tsx
import { UPGRADE_EPSILON } from './format';
import { countRunes } from './chains/chain-text';
import { RuneGlyph } from './runes/RuneGlyph';
import { runeName } from './runes/rune-style';
```

Replace:

```tsx
  const newUids = useDelveStore((s) => s.newUids);
```

with:

```tsx
  const newUids = useDelveStore((s) => s.newUids);
  const diveRunes = useDelveStore((s) => s.diveRunes);
```

Replace:

```tsx
        {rows.length === 0 && (
```

with:

```tsx
        {rows.length === 0 && diveRunes.length === 0 && (
```

Replace:

```tsx
        )}
      </div>
    </div>
  );
}
```

with:

```tsx
        )}
      </div>
      {diveRunes.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-300" data-testid="loot-runes">
          {countRunes(diveRunes).map(({ rune, count }) => (
            <span key={`${rune.id}-${rune.tier}`} className="inline-flex items-center gap-1" data-testid="loot-rune">
              <RuneGlyph rune={rune} size="sm" />
              {runeName(registry, rune)}
              {count > 1 && ` ×${count}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

In `packages/client/src/features/delve/arena/PickupFeed.tsx`:

Replace:

```tsx
import { UPGRADE_EPSILON } from '../format';
```

with:

```tsx
import { UPGRADE_EPSILON } from '../format';
import { countRunes } from '../chains/chain-text';
import { RuneGlyph } from '../runes/RuneGlyph';
import { runeName } from '../runes/rune-style';
```

Replace:

```tsx
 * The last few items picked up this dive, stacked on the right edge of the
```

with:

```tsx
 * The last few items picked up this dive (and the runes, by name), stacked on the right edge of the
```

Replace:

```tsx
  const newUids = useDelveStore((s) => s.newUids);
```

with:

```tsx
  const newUids = useDelveStore((s) => s.newUids);
  const diveRunes = useDelveStore((s) => s.diveRunes);
```

Replace:

```tsx
  if (rows.length === 0) return null;
```

with:

```tsx
  if (rows.length === 0 && diveRunes.length === 0) return null;
```

Replace:

```tsx
      {visible.map(({ item, equipped, delta }) => (
```

with:

```tsx
      {countRunes(diveRunes)
        .slice(0, SHOWN)
        .map(({ rune, count }) => (
          <span
            key={`${rune.id}-${rune.tier}`}
            className="delve-display flex items-center gap-1 text-[10px] uppercase tracking-wider text-violet-200"
            data-testid="feed-rune"
          >
            <RuneGlyph rune={rune} size="sm" />
            {runeName(registry, rune)}
            {count > 1 && ` ×${count}`}
          </span>
        ))}
      {visible.map(({ item, equipped, delta }) => (
```

In `packages/client/src/features/delve/DiveSummary.tsx`:

Replace:

```tsx
import { ItemTile } from './ItemTile';
import { RARITY_COLOR, RARITY_LABEL, formatNumber } from './format';
```

with:

```tsx
import { useDelveStore } from '@/stores/delveStore';
import { ItemTile } from './ItemTile';
import { RARITY_COLOR, RARITY_LABEL, formatNumber } from './format';
import { countRunes } from './chains/chain-text';
import { getDelveRegistry } from './registry';
import { runeName } from './runes/rune-style';
```

Replace:

```tsx
  const titleRef = useRef<HTMLDivElement>(null);
```

with:

```tsx
  const titleRef = useRef<HTMLDivElement>(null);
  const registry = getDelveRegistry();
  // The runes picked up this dive by name: this session's (after a reload, only their count).
  const diveRunes = useDelveStore((s) => s.diveRunes);
  const runeNames = countRunes(diveRunes)
    .map(({ rune, count }) => `${runeName(registry, rune)}${count > 1 ? ` ×${count}` : ''}`)
    .join(', ');
```

Replace:

```tsx
              · 🔗 {dive.linksEarned} Link{dive.linksEarned > 1 ? 's' : ''} from salvaged weapons
            </span>
          )}
```

with:

```tsx
              · 🔗 {dive.linksEarned} Link{dive.linksEarned > 1 ? 's' : ''} from salvaged weapons
            </span>
          )}
          {dive.runesEarned > 0 && (
            <span data-testid="dive-runes">
              {' '}
              · ◈ {dive.runesEarned} rune{dive.runesEarned > 1 ? 's' : ''} found
              {runeNames && `: ${runeNames}`}
            </span>
          )}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/LootTray.test.tsx src/features/delve/__tests__/DiveSummary.test.tsx)`
Expected: PASS, 13 tests.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 32 tests pass in F files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-wiring
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/arena/useArena.ts src/features/delve/chains/chain-text.ts src/features/delve/arena/PickupFeed.tsx src/features/delve/DiveSummary.tsx src/features/delve/__tests__/LootTray.test.tsx src/features/delve/__tests__/DiveSummary.test.tsx)
git add packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/chains/chain-text.ts packages/client/src/features/delve/LootTray.tsx packages/client/src/features/delve/arena/PickupFeed.tsx packages/client/src/features/delve/DiveSummary.tsx packages/client/src/features/delve/__tests__/LootTray.test.tsx packages/client/src/features/delve/__tests__/DiveSummary.test.tsx
git commit -m "feat(client): runes picked up bank at once and show in the tray, the feed and the dive summary" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 6: The Training Grounds, and the end check

### Task 8: The Training Grounds

Every move takes up to three sockets, free; the picker offers every rune that fits, at a tier chosen in it; Load my build copies the runes with the chains; a default basic chain that follows a new weapon keeps each blow's runes by position, less any that don't fit it (wave 1A's `followBasic`); and the sandbox's saved chains keep their runes (wave 0's schemas).

**Files:**
- Modify: `packages/client/src/features/delve/training/TrainingPanel.tsx` (imports; `TrainingAbilities`; Load my build's text)
- Modify: `packages/client/src/stores/sandboxStore.ts` (`knownRunes` in `parseSandbox`; CRLF in the working tree)
- Test: `packages/client/src/stores/sandboxStore.test.ts`, `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/stores/sandboxStore.test.ts`:

Replace:

```ts
    store().loadMyBuild({ ...profile, pair: { primary: 'frost', secondary: 'nature' } });
    expect(store()).toMatchObject({ primary: 'frost', secondary: 'nature' });
    expect(store().loadedWeapon?.mana).toBe('frost'); // the real item, its real mana
  });
});
```

with:

```ts
    store().loadMyBuild({ ...profile, pair: { primary: 'frost', secondary: 'nature' } });
    expect(store()).toMatchObject({ primary: 'frost', secondary: 'nature' });
    expect(store().loadedWeapon?.mana).toBe('frost'); // the real item, its real mana
  });

  const split = { id: 'split', tier: 3 } as const;

  it("keeps the moves' runes: saved, and copied by Load my build", () => {
    const primary = store().chains.primary;
    store().setChain('primary', {
      ...primary,
      moves: [{ ...primary.moves[0], runes: [split, null] }],
    });
    const saved = parseSandbox(JSON.parse(localStorage.getItem(SANDBOX_KEY)!));
    expect(saved.chains.primary.moves[0].runes).toEqual([split, null]);
    const profile = createDelveProfile(registry, 7, { primary: 'fire' });
    const sword = profile.equipped.weapon!;
    const ms = sword.moveset!;
    const bolt = { ...ms.chains.primary!.moves[0], runes: [split] };
    const weapon = {
      ...sword,
      moveset: {
        ...ms,
        chains: { ...ms.chains, primary: { ...ms.chains.primary!, moves: [bolt] } },
      },
    };
    store().loadMyBuild({ ...profile, equipped: { ...profile.equipped, weapon } });
    expect(store().chains.primary.moves[0].runes).toEqual([split]);
  });

  it('a rune the game no longer knows leaves its socket empty when the loadout loads', () => {
    const primary = SANDBOX_DEFAULTS.chains.primary;
    const moves = [{ ...primary.moves[0], runes: [{ id: 'gone', tier: 2 }, split] }];
    const chains = { ...SANDBOX_DEFAULTS.chains, primary: { ...primary, moves } };
    expect(parseSandbox({ ...SANDBOX_DEFAULTS, chains }).chains.primary.moves[0].runes).toEqual([
      null,
      split,
    ]);
  });

  it('a default basic chain that follows a new weapon keeps each blow’s runes by position, if they fit', () => {
    const chain = { id: 'chain', tier: 2 } as const;
    const linger = { id: 'linger', tier: 1 } as const;
    // The sword's default (light, light, heavy) with Chain on its first blow and Linger on its third.
    const basic = store().chains.basic;
    const runes: (typeof chain | typeof linger)[][] = [[chain], [], [linger]];
    store().setChain(
      'basic',
      basic.map((b, i) => (runes[i].length > 0 ? { ...b, runes: runes[i] } : b)),
    );
    store().setWeapon({ baseId: 'dagger', mana: 'fire', rarity: 'rare' });
    const blows = store().chains.basic;
    expect(blows.map((b) => b.kind)).toEqual(['light', 'light', 'medium', 'heavy']); // the dagger's
    expect(blows.map((b) => (b.runes ?? []).filter(Boolean))).toEqual([[chain], [], [linger], []]);
    // Split fits a bow's blows, not a sword's: following a sword, it goes.
    store().setWeapon({ baseId: 'bow', mana: 'fire', rarity: 'rare' });
    const bow = store().chains.basic;
    store().setChain(
      'basic',
      bow.map((b, i) => (i === 0 ? { ...b, runes: [split] } : b)),
    );
    store().setWeapon({ baseId: 'sword', mana: 'fire', rarity: 'rare' });
    expect((store().chains.basic[0].runes ?? []).filter(Boolean)).toEqual([]);
  });
});
```

In `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`:

Replace:

```tsx
import { act, render, screen, fireEvent } from '@testing-library/react';
```

with:

```tsx
import { act, render, screen, fireEvent, within } from '@testing-library/react';
```

Replace:

```tsx
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(useSandboxStore.getState().chains.basic[0].element).toBe('storm');
  });
```

with:

```tsx
    fireEvent.click(screen.getByTestId('element-storm'));
    expect(useSandboxStore.getState().chains.basic[0].element).toBe('storm');
  });

  it('the Abilities tab sockets any rune at any tier, free, up to three a move', () => {
    renderPanel('abilities', 'dock');
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 0/3');
    expect(screen.getByTestId('socket-open')).toHaveTextContent(/^\+ socket$/);
    fireEvent.click(screen.getByTestId('socket-open'));
    fireEvent.click(
      within(screen.getByTestId('sockets-0')).getByRole('button', { name: 'Socket 1: empty' }),
    );
    const picker = within(screen.getByTestId('rune-picker'));
    fireEvent.click(picker.getByRole('button', { name: 'Tier III' }));
    fireEvent.click(picker.getByRole('button', { name: 'Split III' }));
    expect(useSandboxStore.getState().chains.primary.moves[0].runes).toEqual([
      { id: 'split', tier: 3 },
    ]);
    expect(screen.getByTestId('socket-count')).toHaveTextContent('Sockets 1/3');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/stores/sandboxStore.test.ts src/features/delve/__tests__/TrainingPanel.test.tsx)`
Expected: FAIL, 2 failed and 31 passed (33): the Training Grounds' `Unable to find an element by: [data-testid="socket-count"]`, and the load test's `expected [ { id: 'gone', tier: 2 }, …(1) ] to deeply equal [ null, { id: 'split', tier: 3 } ]`. The other two store tests pass already (the schemas, `heroChains` and `followBasic` are waves 0 and 1A's); they pin that for the sandbox. If either fails, the failure is wave 0's or 1A's: report it rather than patching the sandbox store.

- [ ] **Step 3: The Training Grounds' sockets**

In `packages/client/src/stores/sandboxStore.ts`:

Replace:

```ts
  type AbilitySlot,
  type Chains,
```

with:

```ts
  type AbilitySlot,
  type Chain,
  type Chains,
```

Replace:

```ts
  type Rarity,
  type SandboxToggles,
```

with:

```ts
  type Rarity,
  type RuneRef,
  type SandboxToggles,
```

Replace:

```ts
/**
 * A saved loadout; whatever is missing or bad takes its default.
```

with:

```ts
/**
 * The chains with every rune the game doesn't know (`findRune`) taken out of its
 * socket, which stays open: `runeText` throws on an unknown id.
 */
function knownRunes(registry: DataRegistry, chains: Chains): Chains {
  const known = <T extends { runes?: (RuneRef | null)[] }>(m: T): T =>
    m.runes ? { ...m, runes: m.runes.map((r) => (r && registry.findRune(r.id) ? r : null)) } : m;
  const moves = (c: Chain): Chain => ({ ...c, moves: c.moves.map(known) });
  return {
    basic: chains.basic.map(known),
    primary: moves(chains.primary),
    defensive: moves(chains.defensive),
    ultimate: moves(chains.ultimate),
  };
}

/**
 * A saved loadout; whatever is missing or bad takes its default.
```

Replace:

```ts
  const s = { ...parsed.data, secondary, chains };
```

with:

```ts
  const s = { ...parsed.data, secondary, chains: knownRunes(registry, chains) };
```

In `packages/client/src/features/delve/training/TrainingPanel.tsx`:

Replace:

```tsx
import {
  memo,
  useRef,
```

with:

```tsx
import {
  memo,
  useMemo,
  useRef,
```

Replace:

```tsx
  MANA_TYPES,
  MAX_CHAIN,
  RARITY_ORDER,
  itemStatLines,
```

with:

```tsx
  MANA_TYPES,
  MAX_CHAIN,
  MAX_SOCKETS,
  RARITY_ORDER,
  itemStatLines,
```

Replace:

```tsx
import { ChainEditor } from '../chains/ChainEditor';
```

with:

```tsx
import { ChainEditor, type ChainRunes } from '../chains/ChainEditor';
```

Replace:

```tsx
        Copies your equipped gear, your weapon's chains and your pair in. Nothing here ever changes
        your save.
```

with:

```tsx
        Copies your equipped gear, your weapon's chains with their runes, and your pair in. Nothing
        here ever changes your save.
```

Replace:

```tsx
 * The Anvil's chain builder, bound to the sandbox: never locked, any element for
 * an ability, the pair for a blow, every reaction named (it's a testing tool).
 */
```

with:

```tsx
 * The Anvil's chain builder, bound to the sandbox: never locked, any element for
 * an ability, the pair for a blow, every reaction named, and every rune at any
 * tier in up to MAX_SOCKETS sockets a move, free (it's a testing tool).
 */
```

Replace:

```tsx
  const secondary = useSandboxStore((s) => s.secondary);
  const stats = useSandboxStats();
```

with:

```tsx
  const secondary = useSandboxStore((s) => s.secondary);
  const baseId = useSandboxStore((s) => s.weapon?.baseId ?? null);
  const stats = useSandboxStats();
  const runes = useMemo<ChainRunes>(
    () => ({
      pouch: 'any',
      socketCap: MAX_SOCKETS,
      socketPrice: () => null,
      weaponBaseId: baseId,
      pullText: () => 'Pull · free',
    }),
    [baseId],
  );
```

Replace:

```tsx
      onChange={(skill, chain) => useSandboxStore.getState().setChain(skill, chain)}
      blowElements={secondary ? [primary, secondary] : [primary]}
```

with:

```tsx
      onChange={(skill, chain) => useSandboxStore.getState().setChain(skill, chain)}
      blowElements={secondary ? [primary, secondary] : [primary]}
      runes={runes}
```

- [ ] **Step 4: Run them to see them pass**

Run: `(cd packages/client && npx vitest run src/stores/sandboxStore.test.ts src/features/delve/__tests__/TrainingPanel.test.tsx)`
Expected: PASS, 33 tests.

- [ ] **Step 5: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; N + 36 tests pass in F files.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-wiring
(cd packages/client && npx prettier --write --end-of-line auto src/features/delve/training/TrainingPanel.tsx src/stores/sandboxStore.ts src/stores/sandboxStore.test.ts src/features/delve/__tests__/TrainingPanel.test.tsx)
git add packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/stores/sandboxStore.ts packages/client/src/stores/sandboxStore.test.ts packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx
git commit -m "feat(client): the Training Grounds socket any rune at any tier, free; unknown saved runes empty their sockets" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Verification

- [ ] **The area's end check**

```bash
cd /c/Projects/alloy-wiring
(cd packages/client && npx tsc --noEmit -p .)
(cd packages/client && npx vitest run)
(pnpm -F @alloy/client build)
(cd packages/client && npx prettier --check --end-of-line auto src/stores/delveStore.ts src/stores/delveStore.test.ts src/stores/sandboxStore.ts src/stores/sandboxStore.test.ts src/features/delve/chains src/features/delve/AbilitiesPanel.tsx src/features/delve/__tests__/AbilitiesPanel.test.tsx src/pages/DelveCamp.tsx src/pages/__tests__/DelveCamp.test.tsx src/features/delve/ItemDetailSheet.tsx src/features/delve/StopPanel.tsx src/features/delve/__tests__/StopPanel.test.tsx src/features/delve/arena/useArena.ts src/features/delve/arena/PickupFeed.tsx src/features/delve/DiveSummary.tsx src/features/delve/__tests__/LootTray.test.tsx src/features/delve/__tests__/DiveSummary.test.tsx src/features/delve/training/TrainingPanel.tsx src/features/delve/__tests__/TrainingPanel.test.tsx)
file packages/client/src/features/delve/ForgePanel.tsx packages/client/src/features/delve/BagPanel.tsx packages/client/src/features/delve/LootTray.tsx
git status --short
git diff --stat <wave-1 merge>..HEAD
```

Expected:
- the typecheck prints nothing;
- the client suite: **N + 36 tests in F files**, all passing (7 + 5 in the store, 9 in the builder (one more changed), 3 at the Anvil, 3 on the sheet and the Forge, 2 at the stop, 3 for the runes found, 4 in the Training Grounds);
- the client build succeeds;
- Prettier: "All matched files use Prettier code style!";
- `file` still says CRLF for the three hand-edited CRLF files;
- `git status` clean; the diff touches only the files in this plan's Files table, in 8 commits. No engine file changes, so the engine's determinism check (the wave-0 "before" files) is the engine areas'; this area changes no number.

- [ ] **In the browser (dev server on 5288, the 4a plan's block, from this worktree)**

With a fresh save (dev "↺ Restart Delve"): on the Abilities tab the Primary's card shows no pips and the bar reads "Sockets 0/1 · + socket · 🔗 1 · ⚙ 20", disabled with "Not enough Links"; with a pad, the D-pad reaches the pips and "+ socket", A opens the picker on a pip, B backs out with the focus on the pip. The chip beside Restart reads "Pull: destroys" and flips. Nothing else to check here: wave 3's E2E drives the flows end to end.
