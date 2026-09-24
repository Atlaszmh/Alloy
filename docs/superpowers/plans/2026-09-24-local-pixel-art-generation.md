# Local Pixel Art Generation Plan (RTX 5070 Ti, 16 GB)

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(you)** happen on the owner's PC; steps marked **(Claude)** happen in the repo.

**Goal:** Generate Alloy's sprites with open models on the owner's RTX 5070 Ti (16 GB VRAM) at no per-image cost, feed them through the existing `pixel-forge` cleanup, and end with a custom Alloy style LoRA so new sprites come out on-style for this and future projects.

**Architecture:** ComfyUI runs the models on the PC and listens on `127.0.0.1:8188`. `pixel-forge` gains a `comfyui` backend that fills a stock ComfyUI workflow (exported in API format) per candidate and fetches the results. Everything after that (cleanup, candidates, review sheets, `pick`, `build`) is unchanged, so local, Gemini API and Gemini app sprites mix freely. `pixel-forge` runs on the PC next to ComfyUI; ComfyUI is never exposed to the internet.

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

## Phase 0: PC setup (you, ~1 hour)

- [ ] Update the NVIDIA driver (the 50 series needs a current one).
- [ ] Install ComfyUI: the current Windows portable build from the ComfyUI GitHub releases. Older guides that install an older PyTorch fail on the 50 series with "sm_120 is not compatible"; current builds ship a PyTorch that supports it.
- [ ] In ComfyUI, open **Templates → FLUX.2 Klein 4B** (text to image) and let it download the files it asks for (the klein 4B model, the `qwen_3_4b` text encoder, `flux2-vae`). Generate one test image and note the seconds per image.
- [ ] Do the same with the **Z-Image Turbo** template.
- [ ] Put the pixel art LoRAs in `ComfyUI/models/loras/`: `Limbicnation/pixel-art-lora` (klein 4B) and `tarn59/pixel_art_style_lora_z_image_turbo` (Z-Image Turbo, Apache 2.0).
- [ ] For each template, **Workflow → Export (API)** and save it as `packages/pixel-forge/workflows/klein4b.json`, `klein4b-edit.json` (the image-edit template), and `zimage-turbo.json`. Commit and push them.
- [ ] Install Node 20+, then `corepack enable`, `git clone`, check out this branch, `pnpm install`.
- [ ] Optional: install Claude Code on the PC, so Claude can run the generate → review → pick loop there and look at the review sheets directly.
- [ ] Keep ComfyUI bound to `127.0.0.1`, and only install custom nodes you trust (they run arbitrary code).

## Phase 1: ComfyUI backend in pixel-forge (Claude, TDD)

| Action | File | Responsibility |
|---|---|---|
| Create | `src/comfyui.ts` | HTTP client: `GET /system_stats`, `POST /upload/image`, `POST /prompt`, poll `GET /history/{id}`, fetch `GET /view`. Clear errors ("Is ComfyUI running at …?", missing model files from `node_errors`) |
| Create | `src/workflow.ts` | Load an API-format workflow and find its slots: prompt, seed, size, reference image, LoRA, output. Nodes titled `forge:prompt`, `forge:seed`, etc. win; otherwise detect by node type so stock templates work unmodified. Fill one copy per candidate |
| Modify | `src/cli.ts` | `generate … --backend comfyui [--workflow klein4b] [--url …] [--count 8]`, and `comfy-check` (server reachable, GPU and VRAM, workflow slots found) |
| Modify | `src/style.ts`, `art/alloy/style.json` | `local: { url, workflow, prefix, lora, loraStrength }`: default workflow, trigger words, LoRA name and strength |
| Modify | `src/candidates.ts` | `meta.json` per candidate: backend, workflow, seed, prompt, so a good one can be re-rolled or varied |
| Create | `tests/workflow.test.ts`, `tests/comfyui.test.ts` | Slot detection on fixture workflows; the client against a mocked ComfyUI |

- [ ] Seeds are derived from the asset id and candidate number, so reruns reproduce.
- [ ] With `klein4b-edit`, `reference.png` is uploaded and wired into the reference slot, as the Gemini route does today.
- [ ] Docs: CLAUDE.md pipeline bullet and the spec.

## Phase 2: Bake-off (you run it, Claude reviews, one evening)

Four monsters that stress different shapes: `frost_wolf` (16 px beast), `storm_hawk` (flier), `living_obelisk` (object), `hollow_king` (32 px boss). Eight candidates each, per setup:

| Setup | What it tests |
|---|---|
| A. klein 4B + pixel art LoRA | Text only |
| B. klein 4B edit + `reference.png` | Style copied from our sprites |
| C. Z-Image Turbo + pixel art LoRA | The other model family |
| D. Gemini (if the key is set) | Baseline |

- [ ] Run the setups and commit the review sheets (or run the loop in local Claude Code).
- [ ] Judge after cleanup: grid snapped vs resampled, readable at 1×, silhouette, closeness to the existing sprites.
- [ ] Pick the default setup and its prompt prefix.

## Phase 3: Fill the roster (a few evenings of picking)

- [ ] Generate 8 candidates for each of the 25 remaining monsters (~200 images; minutes of GPU time).
- [ ] Pick, `build`, play-test in the arena, commit.
- [ ] Target: at least 20 sprites that clearly belong together, which becomes the LoRA training set.

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
