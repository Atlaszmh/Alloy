# Rummikub Sound Effects Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synthesized audio fallbacks with real Rummikub tile WAV files for draft and forge screen sounds, with multiple variants per sound for natural variation.

**Architecture:** Copy selected WAV files into `public/assets/audio/sfx/`, refactor `SoundManager` to load individual `Howl` instances per file (instead of sprite-based), and randomly select from variant arrays on each `play()` call. Synth fallbacks remain for sounds without files.

**Tech Stack:** Howler.js (already a dependency), WAV files from Rummikub sound pack.

---

## File Structure

- **Modify:** `packages/client/src/shared/utils/sound-manager.ts` — add `files` array to `SoundEntry`, load individual `Howl` instances, random variant selection in `play()`
- **Create:** `packages/client/public/assets/audio/sfx/*.wav` — 33 WAV files (renamed from Rummikub pack)

No new source files needed. No test files needed (audio playback is not unit-testable; manual verification).

**Intentionally synth-only** (no Rummikub sound is a good fit): `upgradeTier`, `synergyActivate`, `buttonClick`, `timerTick`, `matchFound`, `roundStart`, and all duel/results sounds (`attack`, `crit`, `dodge`, `block`, `death`, `victory`, `defeat`). These keep their existing Web Audio synth generators.

---

## Chunk 1: Copy and Rename Audio Files

### Task 1: Copy WAV files into public assets

**Files:**
- Create: `packages/client/public/assets/audio/sfx/` (directory + 33 WAV files)

Source directory: `C:\Projects\Misc\Sounds\cardandboardgamessfxandmusic_row\Card&Board SFX and Music Pack\AUDIO\SFX\In-game SFX\Rummikub`

- [ ] **Step 1: Create the sfx directory**

```bash
mkdir -p packages/client/public/assets/audio/sfx
```

- [ ] **Step 2: Copy and rename files**

Use the mapping below. Pick spread-out numbered variants from each source folder for tonal variety.

| Target filename | Source file |
|----------------|------------|
| `orb-select-1.wav` | `Rummikub_Tile_Slide_on_Rack/Single/..._Slide_onRack_001.wav` |
| `orb-select-2.wav` | `Rummikub_Tile_Slide_on_Rack/Single/..._Slide_onRack_003.wav` |
| `orb-select-3.wav` | `Rummikub_Tile_Slide_on_Rack/Single/..._Slide_onRack_005.wav` |
| `orb-confirm-1.wav` | `Rummikub_Tile_Place_on_Rack/..._Place_onRack_002.wav` |
| `orb-confirm-2.wav` | `Rummikub_Tile_Place_on_Rack/..._Place_onRack_006.wav` |
| `orb-confirm-3.wav` | `Rummikub_Tile_Place_on_Rack/..._Place_onRack_010.wav` |
| `orb-place-1.wav` | `Rummikub_Attach_to_Rack/..._Attach_toRack_001.wav` |
| `orb-place-2.wav` | `Rummikub_Attach_to_Rack/..._Attach_toRack_004.wav` |
| `orb-place-3.wav` | `Rummikub_Attach_to_Rack/..._Attach_toRack_007.wav` |
| `orb-place-4.wav` | `Rummikub_Attach_to_Rack/..._Attach_toRack_010.wav` |
| `orb-remove-1.wav` | `Rummikub_Tile_Pull_From_Rack/..._Pull_fromRack_001.wav` |
| `orb-remove-2.wav` | `Rummikub_Tile_Pull_From_Rack/..._Pull_fromRack_004.wav` |
| `orb-remove-3.wav` | `Rummikub_Tile_Pull_From_Rack/..._Pull_fromRack_007.wav` |
| `drag-start-1.wav` | `Rummikub_Tile_Slide_on_Rack/Single/..._Slide_onRack_002.wav` |
| `drag-start-2.wav` | `Rummikub_Tile_Slide_on_Rack/Single/..._Slide_onRack_004.wav` |
| `drop-success-1.wav` | `Rummikub_Tile_Place_on_Rack/..._Place_onRack_004.wav` |
| `drop-success-2.wav` | `Rummikub_Tile_Place_on_Rack/..._Place_onRack_008.wav` |
| `drop-success-3.wav` | `Rummikub_Tile_Place_on_Rack/..._Place_onRack_012.wav` |
| `combine-merge-1.wav` | `Rummikub_Tile_Place_on_Tile_Stack/..._Place_onTileStack_002.wav` |
| `combine-merge-2.wav` | `Rummikub_Tile_Place_on_Tile_Stack/..._Place_onTileStack_006.wav` |
| `combine-merge-3.wav` | `Rummikub_Tile_Place_on_Tile_Stack/..._Place_onTileStack_010.wav` |
| `combine-fail-1.wav` | `Rummikub_KnockOver/..._Rack_KnockOver_001.wav` |
| `combine-fail-2.wav` | `Rummikub_KnockOver/..._Rack_KnockOver_003.wav` |
| `combine-fail-3.wav` | `Rummikub_KnockOver/..._Rack_KnockOver_005.wav` |
| `forge-submit-1.wav` | `Rummikub_Tile_Shuffle/Short/..._Shuffle_Short_001.wav` |
| `forge-submit-2.wav` | `Rummikub_Tile_Shuffle/Short/..._Shuffle_Short_005.wav` |
| `forge-submit-3.wav` | `Rummikub_Tile_Shuffle/Short/..._Shuffle_Short_009.wav` |
| `flux-spend-1.wav` | `Rummikub_Tile_Slide_on_Rack/Multiple/..._Multiple_Slide_onRack_001.wav` |
| `flux-spend-2.wav` | `Rummikub_Tile_Slide_on_Rack/Multiple/..._Multiple_Slide_onRack_004.wav` |
| `timer-urgent-1.wav` | `Rummikub_KnockOver/..._Rack_KnockOver_002.wav` |
| `timer-urgent-2.wav` | `Rummikub_KnockOver/..._Rack_KnockOver_004.wav` |
| `phase-transition-1.wav` | `Rummikub_Tile_Shuffle/Medium/..._Shuffle_Medium_001.wav` |
| `phase-transition-2.wav` | `Rummikub_Tile_Shuffle/Medium/..._Shuffle_Medium_003.wav` |

```bash
SRC="C:/Projects/Misc/Sounds/cardandboardgamessfxandmusic_row/Card&Board SFX and Music Pack/AUDIO/SFX/In-game SFX/Rummikub"
DST="packages/client/public/assets/audio/sfx"

# orbSelect (Slide Single)
cp "$SRC/Rummikub_Tile_Slide_on_Rack/Single/SFX_TABLETOPGAME_Tile_Rummikub_Slide_onRack_001.wav" "$DST/orb-select-1.wav"
cp "$SRC/Rummikub_Tile_Slide_on_Rack/Single/SFX_TABLETOPGAME_Tile_Rummikub_Slide_onRack_003.wav" "$DST/orb-select-2.wav"
cp "$SRC/Rummikub_Tile_Slide_on_Rack/Single/SFX_TABLETOPGAME_Tile_Rummikub_Slide_onRack_005.wav" "$DST/orb-select-3.wav"

# orbConfirm (Place on Rack)
cp "$SRC/Rummikub_Tile_Place_on_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Place_onRack_002.wav" "$DST/orb-confirm-1.wav"
cp "$SRC/Rummikub_Tile_Place_on_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Place_onRack_006.wav" "$DST/orb-confirm-2.wav"
cp "$SRC/Rummikub_Tile_Place_on_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Place_onRack_010.wav" "$DST/orb-confirm-3.wav"

# orbPlace (Attach to Rack)
cp "$SRC/Rummikub_Attach_to_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Attach_toRack_001.wav" "$DST/orb-place-1.wav"
cp "$SRC/Rummikub_Attach_to_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Attach_toRack_004.wav" "$DST/orb-place-2.wav"
cp "$SRC/Rummikub_Attach_to_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Attach_toRack_007.wav" "$DST/orb-place-3.wav"
cp "$SRC/Rummikub_Attach_to_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Attach_toRack_010.wav" "$DST/orb-place-4.wav"

# orbRemove (Pull from Rack)
cp "$SRC/Rummikub_Tile_Pull_From_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Pull_fromRack_001.wav" "$DST/orb-remove-1.wav"
cp "$SRC/Rummikub_Tile_Pull_From_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Pull_fromRack_004.wav" "$DST/orb-remove-2.wav"
cp "$SRC/Rummikub_Tile_Pull_From_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Pull_fromRack_007.wav" "$DST/orb-remove-3.wav"

# dragStart (Slide Single - different variants)
cp "$SRC/Rummikub_Tile_Slide_on_Rack/Single/SFX_TABLETOPGAME_Tile_Rummikub_Slide_onRack_002.wav" "$DST/drag-start-1.wav"
cp "$SRC/Rummikub_Tile_Slide_on_Rack/Single/SFX_TABLETOPGAME_Tile_Rummikub_Slide_onRack_004.wav" "$DST/drag-start-2.wav"

# dropSuccess (Place on Rack - different variants)
cp "$SRC/Rummikub_Tile_Place_on_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Place_onRack_004.wav" "$DST/drop-success-1.wav"
cp "$SRC/Rummikub_Tile_Place_on_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Place_onRack_008.wav" "$DST/drop-success-2.wav"
cp "$SRC/Rummikub_Tile_Place_on_Rack/SFX_TABLETOPGAME_Tile_Rummikub_Place_onRack_012.wav" "$DST/drop-success-3.wav"

# combineMerge (Place on Tile Stack)
cp "$SRC/Rummikub_Tile_Place_on_Tile_Stack/SFX_TABLETOPGAME_Tile_Rummikub_Place_onTileStack_002.wav" "$DST/combine-merge-1.wav"
cp "$SRC/Rummikub_Tile_Place_on_Tile_Stack/SFX_TABLETOPGAME_Tile_Rummikub_Place_onTileStack_006.wav" "$DST/combine-merge-2.wav"
cp "$SRC/Rummikub_Tile_Place_on_Tile_Stack/SFX_TABLETOPGAME_Tile_Rummikub_Place_onTileStack_010.wav" "$DST/combine-merge-3.wav"

# combineFail (KnockOver)
cp "$SRC/Rummikub_KnockOver/SFX_TABLETOPGAME_Rummikub_Rack_KnockOver_001.wav" "$DST/combine-fail-1.wav"
cp "$SRC/Rummikub_KnockOver/SFX_TABLETOPGAME_Rummikub_Rack_KnockOver_003.wav" "$DST/combine-fail-2.wav"
cp "$SRC/Rummikub_KnockOver/SFX_TABLETOPGAME_Rummikub_Rack_KnockOver_005.wav" "$DST/combine-fail-3.wav"

# forgeSubmit (Shuffle Short)
cp "$SRC/Rummikub_Tile_Shuffle/Short/SFX_TABLETOPGAME_Tile_Rummikub_Shuffle_Short_001.wav" "$DST/forge-submit-1.wav"
cp "$SRC/Rummikub_Tile_Shuffle/Short/SFX_TABLETOPGAME_Tile_Rummikub_Shuffle_Short_005.wav" "$DST/forge-submit-2.wav"
cp "$SRC/Rummikub_Tile_Shuffle/Short/SFX_TABLETOPGAME_Tile_Rummikub_Shuffle_Short_009.wav" "$DST/forge-submit-3.wav"

# fluxSpend (Multiple Slide)
cp "$SRC/Rummikub_Tile_Slide_on_Rack/Multiple/SFX_TABLETOPGAME_Tile_Rummikub_Multiple_Slide_onRack_001.wav" "$DST/flux-spend-1.wav"
cp "$SRC/Rummikub_Tile_Slide_on_Rack/Multiple/SFX_TABLETOPGAME_Tile_Rummikub_Multiple_Slide_onRack_004.wav" "$DST/flux-spend-2.wav"

# timerUrgent (KnockOver - different variants)
cp "$SRC/Rummikub_KnockOver/SFX_TABLETOPGAME_Rummikub_Rack_KnockOver_002.wav" "$DST/timer-urgent-1.wav"
cp "$SRC/Rummikub_KnockOver/SFX_TABLETOPGAME_Rummikub_Rack_KnockOver_004.wav" "$DST/timer-urgent-2.wav"

# phaseTransition (Shuffle Medium)
cp "$SRC/Rummikub_Tile_Shuffle/Medium/SFX_TABLETOPGAME_Tile_Rummikub_Shuffle_Medium_001.wav" "$DST/phase-transition-1.wav"
cp "$SRC/Rummikub_Tile_Shuffle/Medium/SFX_TABLETOPGAME_Tile_Rummikub_Shuffle_Medium_003.wav" "$DST/phase-transition-2.wav"
```

- [ ] **Step 3: Verify all 33 files are in place**

```bash
ls -la packages/client/public/assets/audio/sfx/ | wc -l
# Expected: 35 (33 files + . + ..)
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/public/assets/audio/sfx/
git commit -m "assets: add Rummikub WAV sound effects for draft and forge screens"
```

---

## Chunk 2: Refactor SoundManager for Individual File Loading with Variants

### Task 2: Add variant file support to SoundEntry and SoundManager

**Files:**
- Modify: `packages/client/src/shared/utils/sound-manager.ts`

The changes:
1. Add optional `files?: string[]` to `SoundEntry` — paths relative to `/assets/audio/sfx/`
2. Add `files` arrays to the registry entries that have WAV files
3. Add a `private howls: Map<string, Howl>` to `SoundManager` for loaded individual files
4. Add a `loadFiles()` method that iterates the registry and creates a `Howl` per file path
5. In `play()`, if the sound has loaded `Howl` instances, randomly pick one; otherwise fall through to synth

- [ ] **Step 1: Add `files` field to `SoundEntry` interface**

In `SoundEntry` interface, add:
```typescript
/** Individual audio file paths relative to /assets/audio/sfx/ (used instead of sprite) */
files?: string[];
```

- [ ] **Step 2: Add `files` arrays to registry entries**

Update each mapped entry in `SOUND_REGISTRY` with its file list. Example:

```typescript
orbSelect: {
  sprite: 'orb-select',
  volume: 0.6,
  category: 'sfx',
  varyPitch: true,
  files: ['orb-select-1.wav', 'orb-select-2.wav', 'orb-select-3.wav'],
},
```

Full list of entries to update:
- `orbSelect`: `['orb-select-1.wav', 'orb-select-2.wav', 'orb-select-3.wav']`
- `orbConfirm`: `['orb-confirm-1.wav', 'orb-confirm-2.wav', 'orb-confirm-3.wav']`
- `orbPlace`: `['orb-place-1.wav', 'orb-place-2.wav', 'orb-place-3.wav', 'orb-place-4.wav']`
- `orbRemove`: `['orb-remove-1.wav', 'orb-remove-2.wav', 'orb-remove-3.wav']`
- `dragStart`: `['drag-start-1.wav', 'drag-start-2.wav']`
- `dropSuccess`: `['drop-success-1.wav', 'drop-success-2.wav', 'drop-success-3.wav']`
- `combineMerge`: `['combine-merge-1.wav', 'combine-merge-2.wav', 'combine-merge-3.wav']`
- `combineFail`: `['combine-fail-1.wav', 'combine-fail-2.wav', 'combine-fail-3.wav']`
- `forgeSubmit`: `['forge-submit-1.wav', 'forge-submit-2.wav', 'forge-submit-3.wav']`
- `fluxSpend`: `['flux-spend-1.wav', 'flux-spend-2.wav']`
- `timerUrgent`: `['timer-urgent-1.wav', 'timer-urgent-2.wav']`
- `phaseTransition`: `['phase-transition-1.wav', 'phase-transition-2.wav']`

- [ ] **Step 3: Add `howls` map and `loadFiles()` method to SoundManager**

Add to the `SoundManager` class:

```typescript
private howls: Map<string, Howl[]> = new Map();
private filesLoaded = false;

/** Load individual audio files for all registry entries that have `files`. */
loadFiles(basePath = '/assets/audio/sfx/'): void {
  // Pre-compute total to avoid race between onload callbacks and loop
  let pending = 0;
  for (const entry of Object.values(SOUND_REGISTRY)) {
    pending += entry.files?.length ?? 0;
  }
  if (pending === 0) { this.filesLoaded = true; return; }

  let loaded = 0;
  for (const [name, entry] of Object.entries(SOUND_REGISTRY)) {
    if (!entry.files?.length) continue;
    const howls: Howl[] = [];
    for (const file of entry.files) {
      const howl = new Howl({
        src: [basePath + file],
        preload: true,
        onload: () => { if (++loaded === pending) this.filesLoaded = true; },
        onloaderror: (_id: number, err: unknown) => {
          console.warn(`[SoundManager] Failed to load ${file}:`, err);
          if (++loaded === pending) this.filesLoaded = true;
        },
      });
      howls.push(howl);
    }
    this.howls.set(name, howls);
  }
}
```

- [ ] **Step 4: Update `play()` to use individual files with random variant selection**

Insert the following **before** the existing Howler sprite block in `play()`. Note: when file variants are present, skip `varyPitch` — the multiple files already provide natural variation:

```typescript
// Try individual file variants first (skip varyPitch — files provide natural variation)
const variants = this.howls.get(name);
if (variants?.length) {
  const howl = variants[Math.floor(Math.random() * variants.length)];
  const id = howl.play();
  howl.volume(effectiveVolume, id);
  // Don't apply varyPitch rate to file variants — they already differ naturally
  return;
}

// Then try Howler sprite (kept for future sprite support)
if (this.spriteLoaded && this.sprite) {
  const id = this.sprite.play(entry.sprite);
  this.sprite.volume(effectiveVolume, id);
  if (rate !== 1.0) this.sprite.rate(rate, id);
  return;
}

// Fall back to synthesized audio
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shared/utils/sound-manager.ts
git commit -m "feat(sound): support individual file loading with random variant selection"
```

---

## Chunk 3: Initialize File Loading on App Start

### Task 3: Call `loadFiles()` on app startup

**Files:**
- Modify: `packages/client/src/main.tsx`

- [ ] **Step 1: Add `soundManager.loadFiles()` call**

In `main.tsx`, after imports, add:

```typescript
import { soundManager } from '@/shared/utils/sound-manager';

// Load individual sound files
soundManager.loadFiles();
```

This should go near the top level, before `ReactDOM.createRoot`. If `soundManager` is already imported, just add the `loadFiles()` call.

- [ ] **Step 2: Verify app starts without errors**

```bash
cd packages/client && npx vite --port 5173
```

Open in browser, check console for errors. Verify no 404s for WAV files.

- [ ] **Step 3: Manual test — open draft screen, click orbs, verify real sounds play**

Navigate to a match, enter draft phase. Click orbs to select and confirm. Listen for tile sounds instead of synthesized beeps.

- [ ] **Step 4: Manual test — open forge screen, drag gems, combine, verify sounds**

Enter forge phase. Socket gems, remove them, try combining. Verify varied tile sounds play for each action.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/main.tsx
git commit -m "feat(sound): initialize file-based sound loading on app start"
```
