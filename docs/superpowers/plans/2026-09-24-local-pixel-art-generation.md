# Local Pixel Art Generation Plan (RTX 5070 Ti, 16 GB)

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(you)** happen on the owner's PC; steps marked **(Claude)** happen in the repo.

**Goal:** Generate Alloy's sprites with open models on the owner's RTX 5070 Ti (16 GB VRAM) at no per-image cost, feed them through the existing `pixel-forge` cleanup, and end with a custom Alloy style LoRA so new sprites come out on-style for this and future projects.

**Architecture:** ComfyUI runs the models on the PC and listens on `127.0.0.1:8188`. `pixel-forge generate --workflow` fills an API-format workflow file (`packages/pixel-forge/workflows/`) per candidate and fetches the results. Everything after that (cleanup, candidates, review sheets, `pick`, `build`) is unchanged, so local, Gemini API and Gemini app sprites mix freely. `pixel-forge` runs on the PC next to ComfyUI; ComfyUI is never exposed to the internet.

**Tech stack:** ComfyUI (portable, Windows), FLUX.2 [klein] 4B and Z-Image Turbo (both Apache 2.0), Ostris AI Toolkit for LoRA training, Node 20 + pnpm for `pixel-forge`.

**Related:** `packages/pixel-forge` (see CLAUDE.md → Pixel art pipeline), spec section "Pixel Sprites" in `docs/superpowers/specs/2026-09-24-delve-loot-mode-design.md`.

---

## What fits in 16 GB

| Job | Model | Fits? | Notes |
|---|---|---|---|
| Generate | FLUX.2 klein 4B (distilled, 4 steps) | Yes: ~13 GB bf16, ~7 GB fp8 | Also edits from reference images, so it can copy our existing sprites' style |
| Generate | Z-Image Turbo (8 steps) | Yes: 16 GB bf16 is tight, fp8 ~8 GB is comfortable | Text-to-image only |
| Generate | Qwen-Image 2512 (20B) | Only as GGUF Q4, slowly | Not planned |
| Train LoRA | Z-Image Turbo + training adapter | Yes, with the transformer in float8 | Best-documented 16 GB route |
| Train LoRA | FLUX.2 klein 4B **base** | Reported to fit 12–16 GB, but tight | Second choice; fallback is an hour on a rented 24 GB GPU |

Avoid for shipped art: Qwen-Image-2.1 (research-only license) and FLUX.2 klein 9B (check its license first; it is not Apache 2.0). Check each community LoRA's license on its page before shipping art made with it.

## Phase 0: PC setup (done 2026-09-24)

- [x] NVIDIA driver 610.88 (current enough for the 50 series).
- [x] ComfyUI v0.37.0 Windows portable (NVIDIA build: embedded Python 3.13, PyTorch 2.13 + CUDA 13.0, `sm_120` supported) at `C:\AI\ComfyUI_windows_portable`. Start it with `run_nvidia_gpu.bat`; it serves `http://127.0.0.1:8188` only.
- [x] Models, taken from the stock templates' own download lists (big files checked against Hugging Face's SHA-256): `diffusion_models/flux-2-klein-4b.safetensors` (distilled, bf16), `diffusion_models/z_image_turbo_bf16.safetensors`, `text_encoders/qwen_3_4b.safetensors` (shared by both), `vae/flux2-vae.safetensors`, `vae/ae.safetensors`. Not downloaded until needed: the fp8 klein (bf16 fits) and klein base 4B (LoRA training only).
- [x] Pixel art LoRAs in `models/loras/`: `limbicnation_pixel_art_klein4b.safetensors` (Limbicnation/pixel-art-lora, Apache 2.0) and `pixel_art_style_z_image_turbo.safetensors` (tarn59, Apache 2.0). Not tried yet.
- [x] Test generations at 1024×1024, `frost_wolf` prompt, no LoRA: klein 4B ~2.2 s per image (4 steps), Z-Image Turbo ~6.3 s (8 steps), first run +5–7 s for loading. No out-of-memory.
- [x] ~~Export the templates as API workflows by hand~~: not needed. Claude builds API-format graphs that mirror the templates (klein: `CFGGuider` cfg 1, `Flux2Scheduler` 4 steps, euler, `ConditioningZeroOut` negative; Z-Image: `ModelSamplingAuraFlow` shift 3, `KSampler` 8 steps, cfg 1, `res_multistep` / `simple`) and reads node inputs from `GET /object_info`.
- [x] Node 24 + pnpm 9 on the PC, `pnpm install` done, pixel-forge tests pass on Windows. Claude Code runs locally.
- [x] ComfyUI bound to `127.0.0.1`; no custom nodes installed.

**First look:** both models draw pixel art on magenta as asked, but finer than 16 px (Z-Image ~30 blocks across, klein finer still), so cleanup resamples and loses faces and legs. Phase 2 has to close that gap: the pixel art LoRAs, prompt wording, and possibly generating at 20/32 px canvases.

## Phase 1: ComfyUI backend in pixel-forge (done 2026-09-24)

`pnpm -F @alloy/pixel-forge forge generate <id…> --workflow <name> [--count N] [--url U]` runs `workflows/<name>.json` once per candidate on the local ComfyUI, then cleans, numbers and reviews the results like every other source.

| File | What it does |
|---|---|
| `src/workflow.ts` | API-format workflows with `{{prompt}}`, `{{subject}}`, `{{size}}`, `{{seed}}`, `{{reference}}` placeholders. An input that is exactly one placeholder keeps the value's type (seeds stay numbers); unknown placeholders are named in the error |
| `src/comfyui.ts` | `uploadImage` (`POST /upload/image`) and `runWorkflow` (`POST /prompt`, poll `/history/{id}`, fetch `/view`). Errors say what to do: ComfyUI not running, a missing model file (from `node_errors`, which ComfyUI can return with a 200 while still running the valid parts), or a failure mid-run |
| `workflows/*.json` | `klein4b-pixel` (klein 4B + pixel art LoRA, 512 px, the LoRA's own prompt shape), `klein4b-edit` (klein 4B with our reference sheet through `ReferenceLatent`, 1024 px; replaced by `klein4b-sheet` in Phase 2), `zimage-pixel` (Z-Image Turbo + pixel art LoRA, 1024 px). Outputs use `PreviewImage`, so ComfyUI keeps nothing |
| `src/candidates.ts` | `<n>.json` per candidate: `via` (workflow, `gemini` or `import`), seed, prompt. Review sheets label each candidate with its `via` |

Changed from the original plan, simpler:
- Workflows are files Claude writes from the stock templates (reading `/object_info` for node inputs), with placeholders, instead of exported templates plus slot detection. Each file is one complete setup, including its LoRA and trigger words, so there is no `local` block in `style.json`.
- No `--backend` flag: `--workflow` means ComfyUI. No `comfy-check`: the first request already explains an unreachable server or a missing model.
- Seeds are random and recorded in `<n>.json`, not derived from the id.

- [x] Tests: `tests/workflow.test.ts` (filling, and every shipped workflow is well-formed), `tests/comfyui.test.ts` (the client against a fake ComfyUI).
- [x] Real run: 2 `frost_wolf` candidates per workflow on the RTX 5070 Ti in 7 s (klein4b-pixel), 14 s (klein4b-edit) and 19 s (zimage-pixel), including model loads.
- [x] Docs: CLAUDE.md pipeline bullet and the spec.

Known: ComfyUI loads 166 of the klein pixel art LoRA's 172 keys. The 3 global modulation layers (4.4% of its weights) are skipped with "lora key not loaded" warnings. The Z-Image LoRA loads fully.

**First findings for Phase 2** (`frost_wolf`, 2 each):
- `klein4b-pixel` draws a head-and-shoulders portrait on white, as its LoRA was trained on "transparent background" sprites. White-on-white then breaks background keying.
- `klein4b-edit` gives a clean, full-body wolf on magenta, but on a grid much finer than 16 px.
- `zimage-pixel` overlays faint graph-paper lines on the magenta, which stops the background flood fill at the lines.

## Phase 2: Bake-off (done 2026-09-24)

**Fixes first** (from `frost_wolf` experiments in a scratch copy of the project):
- `klein4b-pixel`: asking for "full body … plain solid magenta background" instead of the LoRA's "transparent background" gives whole creatures on magenta instead of portraits on white.
- `zimage-pixel`: generating at 512 px instead of 1024 px removes the graph-paper background and gives chunkier pixels; "no grid lines" alone did not.
- The cleaner's grid detection never fired on real output: models draw "pixels" of uneven size (an eye's blocks ~14 px, fur 15–60 px on one image) with drifting edges, so no single lattice fits. Every image is resampled to fit, and the real lever is getting the model to draw near the target size.
- **Sprite-sheet completion** (new `klein4b-sheet`, replaces `klein4b-edit`): the reference is a 3×2 sheet of our sprites at 12× with the last cell empty (`src/sheet.ts`); klein fills the empty cell at the sheet's own size, and pixel-forge cuts that cell back out. klein reproduces the other five sprites almost exactly and draws the new one full-body, on-palette and at about half the reference's pixel size, which is the closest to 16 px any setup got. Asking for a new image with the sheet merely attached gave busts at a much finer grid.
- Cleanup: a model that paints the magenta as a card on a white page gets the card keyed too, in the shade it used (`card` option); lone pixels whose 3–4 neighbours share a colour less than 0.24 apart in OKLab (a shading step) take that colour, while eyes, sparks and runes (0.35+ apart) stay. `forge reclean` re-runs cleanup on existing raws, so cleanup changes need no GPU time.

**Bake-off:** `frost_wolf`, `storm_hawk`, `living_obelisk`, `hollow_king` × `klein4b-sheet`, `klein4b-pixel`, `zimage-pixel` × 4 candidates = 48 images in 3 minutes. After re-cleaning, all 48 key cleanly.

| Setup | Verdict |
|---|---|
| `klein4b-sheet` | Closest to our sprites (palette, outline, accent colours). Best hawks and liches. Busy textures (runes, robes) come out speckled |
| `klein4b-pixel` | Clearest silhouettes: the best wolf and obelisks. Less of our style; some quadrupeds stand upright |
| `zimage-pixel` | Flattest, cleanest shapes (a good lich and obelisk), but often off-subject (abstract blue hawks) or off-colour |

- [x] Run the setups (Claude, locally).
- [x] Judge after cleanup.
- [ ] Owner picks favourites from `art/alloy/candidates/*/review.png`, which settles the default. Claude's recommendation: `klein4b-sheet` as the default, as it is the one that keeps the set consistent and gets better as more sprites are picked (they join the sheet), with `klein4b-pixel` as a second opinion for creatures whose silhouette matters most. Small white creatures (`frost_wolf`) are the weakest case for all three.

## Decision: 16 px density, sizes vary (2026-09-24, v0.31.0)

A 32 px prototype (half-size pixels) made AI art easier but was set aside for a minimal
look. Instead, every sprite keeps one pixel density (0.1 arena units, the floor's) and its
canvas follows the monster's size at 16 px per unit, after Animal Well: tiny critters are
10–13 px, standard monsters 16–19, brutes 22–32, bosses 38–54. Monster sizes in
`delve.json` were widened to match (autopilot pacing unchanged within its guard rails).
For boss-sized canvases `klein4b-sheet` overflows its cell (the small reference sprites make
the model draw a zoomed-in giant); `klein4b-pixel` works well, so generate bosses with it.

## Phase 3: Fill the roster (done 2026-09-24, v0.32.0)

- [x] 25 monsters generated on the RTX 5070 Ti: bosses 8× `klein4b-pixel`, the rest 4× `klein4b-sheet` + 4× `klein4b-pixel` (about 190 images). With the GPU to itself a monster takes under a minute; with a game running it took 3–7 minutes, as Windows spills VRAM into system RAM instead of failing.
- [x] Both klein workflows now run the Qwen3-4B text encoder on the CPU (`CLIPLoader` device `cpu`): it encodes once per monster (ComfyUI caches it across candidates) and leaves 7.7 GB of VRAM for the image model.
- [x] Cleanup reserves the outline colour for the outline, so "black-scaled" creatures (magma lizard, hellboar, Magmasaur) read as dark bodies inside a black edge instead of solid black.
- [x] Picked by Claude from the review sheets; any can be swapped with `forge pick <id> <n>`. Weakest, to replace first: arc imp, mud toad, fire imp and nightstalker (10–13 px, too small for the models) and the snow stalker (white on white).

## Phase 4: Alloy style LoRA

- [ ] **(Claude)** `forge dataset`: export the code-drawn and picked sprites, upscaled nearest-neighbour to 1024 px on the key color, with captions built from each asset's subject plus a trigger word.
- [ ] **(you)** Train with Ostris AI Toolkit: Z-Image Turbo with the training adapter, transformer in float8, rank 16–32, ~3,000 steps, 15–25 images. Then try klein 4B base if VRAM allows.
- [ ] Put the LoRA in `ComfyUI/models/loras/`, set it in `style.json → local`, regenerate the weakest sprites and compare.
- [ ] For other projects: each gets its own `style.json`, manifest and LoRA; the pipeline is shared.

## Later

- Animation frames: klein edit with the picked sprite as the reference ("same creature, mid-stride"), cleaned with the same palette; or a spritesheet LoRA. Until then the automatic idle bob stays.
- Item and spell icons through the same pipeline.
- NVFP4 builds of klein run faster on the 50 series; worth trying once everything works.

## Risks

| Risk | Mitigation |
|---|---|
| PyTorch doesn't support the 50 series | Current ComfyUI build; the error names `sm_120` |
| Diffusion models draw a finer grid than 16 px | Cleanup resamples; the Alloy LoRA, trained on true 16 px art, is the real fix |
| Local models ignore "solid magenta background" | Import already keys the background from the borders; add a background-removal node if needed |
| Workflow node names change between ComfyUI versions | Slots come from exported workflows plus `forge:` titles, never hard-coded node ids; `comfy-check` reports what it found |
| LoRA training runs out of memory on 16 GB | Z-Image Turbo first (documented at 16 GB); otherwise rent a 24 GB GPU for about an hour |
