# Alloy → Godot Port: Feasibility Analysis

**Date:** 2026-04-21
**Audience:** project owner considering a graphically rich, Steam-bound version of Alloy
**TL;DR:** A full Godot port is a 4–9 month single-dev project, mostly spent rebuilding UI and tooling you already have working. The current web stack is **not** the thing holding back graphical richness — the rendering ceiling today is a self-imposed 600×320 PixiJS canvas, not the technology. A hybrid path (double-down on PixiJS/WebGL, ship via Tauri) gets you 80% of the visual win for ~20% of the cost. Read this before committing.

---

## 1. Current State — Honest Inventory

### 1.1 Engine (`@alloy/engine`)

| Metric | Value |
|---|---|
| Source TS files | 59 |
| Source LOC | **7,348** |
| Test files | 38 |
| Test LOC | 8,309 |
| Production deps | **1** (`zod` — data validation only) |

Subsystems: [ai/](packages/engine/src/ai/) (2,174 LOC), [duel/](packages/engine/src/duel/) (1,085), [forge/](packages/engine/src/forge/) (1,159), [match/](packages/engine/src/match/) (949), [combine/](packages/engine/src/combine/) (762), [balance/](packages/engine/src/balance/) (613), [types/](packages/engine/src/types/) (668), [data/](packages/engine/src/data/) (480), [run/](packages/engine/src/run/) (396), [pool/](packages/engine/src/pool/) (319), [draft/](packages/engine/src/draft/) (159), [rng/](packages/engine/src/rng/) (113).

Data: 33 affixes, 44 combinations, 150 recipes, 14 synergies, 14 base items — all JSON, all validated by Zod at load. Determinism anchored on a custom xoshiro128** RNG in [seeded-rng.ts](packages/engine/src/rng/seeded-rng.ts) with `fork(label)` for stream isolation.

**This code is exceptionally portable.** Pure synchronous state machines, zero async I/O, zero framework coupling, test-to-code ratio 1.13:1. Losing this would be a tragedy. Any port strategy must preserve it as the source of truth.

### 1.2 Client (`packages/client`)

| Metric | Value |
|---|---|
| Source files | 171 |
| Source LOC | **20,964** |
| Pages | 11 |
| Components | 56 |
| Stores (Zustand) | 11 |
| Custom hooks | 10 |
| Production deps | 9 |

Rendering split (this is the key finding):
- **~85% React DOM + Tailwind v4** — every page, modal, HUD, draft screen, forge, leaderboard, encyclopedia, settings
- **~15% PixiJS 8** — confined to 17 files under [features/duel/pixi/](packages/client/src/features/duel/pixi/), rendering a single **600×320 canvas** for the combat arena

The PixiJS work that exists ([DuelScene.ts](packages/client/src/features/duel/pixi/DuelScene.ts), [VFXManager.ts](packages/client/src/features/duel/pixi/VFXManager.ts), [GladiatorSprite.ts](packages/client/src/features/duel/pixi/GladiatorSprite.ts), damage numbers, status icons, cooldown rings) is competent but small: particle cap of 200, static sprite animation, no shaders, no sprite atlases, no lighting, no post-processing.

Animations: three-tier (Framer Motion for page transitions, Web Animations API for HUD effects, PixiJS ticker for arena VFX).

Assets: 382 files / 382 MB. Notably: **308 discrete PNGs for gems** (4 shapes × 7 color variants × 11 tiers/states) with no atlas. 42 individual WAV files. No sprite sheets anywhere.

### 1.3 Backend & Tooling

- [packages/supabase](packages/supabase/): 11 migrations, 13 edge functions. Primarily persistence + matchmaking + auth; no game logic of consequence.
- [packages/tools](packages/tools/): internal balance simulator (React + Express). Depends on `@alloy/engine` directly.
- 114 test files total (38 engine + 42 client unit + 27 E2E + 5 tools).
- Playwright runs on 5 profiles: iphone-se, iphone-15-pro, pixel-7, desktop, and a 6-probe responsive suite across 13 viewports.
- **No desktop wrapper today** — zero references to Electron, Tauri, Godot, or Steam anywhere in the repo.

### 1.4 Architectural Strengths That Matter For Any Port

1. **Gateway abstraction** ([LocalGateway / RemoteGateway](packages/client/src/gateway/)) cleanly separates transport from engine. The engine doesn't know whether it's talking to AI or Supabase Realtime.
2. **Engine is framework-free.** It would drop into Node, Deno, a web worker, a Rust host, or a Godot extension with equal ease.
3. **CLAUDE.md rule "no game logic in client"** has been held. Stores own visual state only. This is rare and valuable.

---

## 2. What "Refactor to Godot" Actually Means

There is no single "port to Godot" path. There are three realistic variants, and they have wildly different cost profiles.

### Path A — Full GDScript rewrite
Engine and client both reimplemented in GDScript. Tests rewritten in GDUnit. Data files re-validated in GDScript. One codebase, one language, native-feeling Godot project.

- **Engine port:** 7,348 LOC of dense, branchy TypeScript → idiomatic GDScript. The AI (2,174 LOC of heuristics), duel engine (650 LOC with trigger chaining), stat calculator (451 LOC with modifier-ordering subtleties), and combination engine (454 LOC with recipe/category/fallback layers) are the landmines. **xoshiro128\*\* must be bit-exact** or save replays break.
- **Estimate:** 6–10 weeks for engine, 10–16 weeks for client UI (all 11 pages + animations + gateway), 4–6 weeks for test rebuild, 2–4 weeks for polish, integration, and pipeline. **Realistic total: 5–9 months for one developer.** Sub-agent "4–6 weeks" estimates are optimistic and should not be used for planning.
- **Risk:** you are rewriting ~28,000 LOC of tested, working code in a less-mature language ecosystem. Bug introduction is near-certain.

### Path B — Engine-as-library, Godot client only
Keep `@alloy/engine` in TypeScript. Compile to JS bundle and run inside Godot via a QuickJS binding (or run a headless Node sidecar, or transpile to C# via a shared schema). Godot owns only rendering, input, UI, and transport.

- **Engine:** unchanged. Keep the test suite. Keep `packages/tools`. Keep the balance simulator.
- **Client in Godot:** ~10–14 weeks. Everything except game rules needs rebuilding in GDScript.
- **Risk:** the JS↔GDScript bridge is a real dependency. QuickJS in Godot works, but debugging across the boundary is unpleasant. C# transpile path means maintaining two engine implementations.
- **Total:** 3–5 months.

### Path C — Don't port. Invest in the current stack + desktop wrapper.
Wrap the existing web app in **Tauri** (preferred — Rust-based, small binary, native webview) or Electron. Ship to Steam via Steamworks SDK with a thin launcher. Simultaneously, grow the existing PixiJS footprint: move the draft and forge screens into PixiJS, add shaders, sprite atlases, particle richness, camera effects.

- **Tauri wrapper:** 1–2 weeks.
- **PixiJS expansion** (draft + forge + HUD moved into canvas with proper asset pipeline): 8–12 weeks.
- **Steamworks integration** (achievements, cloud saves, overlay): 2–3 weeks.
- **Total:** 3–4 months, **with zero engine risk and zero UI regressions.**

---

## 3. The Graphical-Richness Question — The Core Issue

You framed this as "limitations of the current code vs refactoring into an actual game engine." The honest answer:

**PixiJS 8 is an actual game engine.** It has:
- WebGL 2 / WebGPU rendering
- Custom fragment/vertex shaders
- Mesh rendering, filters (bloom, blur, displacement, CRT, outline, etc.)
- Particle containers with tens of thousands of sprites at 60fps
- Spine / DragonBones / Lottie integration
- Sprite atlases, tilemaps, 9-slice scaling

The current game looks modest because **you haven't used any of this.** The arena is a 600×320 canvas with ~200 particles and static sprites. The gems are individual unoptimized PNGs rendered as DOM `<img>` tags. There are no atlases, no shaders, no post-processing, no lighting. Moving to Godot does not automatically change this — you'd still need to author the content.

Things Godot gives you that web genuinely cannot match:
1. **True native controller input** (SteamInput via Steamworks). Web has Gamepad API but it's awkward.
2. **Native file I/O, OS integration, discord RPC, Steam overlay** — all easier in Godot.
3. **Lower input-to-photon latency** on lower-end hardware. Web adds ~1 frame.
4. **3D rendering** if you ever want to go there. PixiJS is 2D-only.
5. **No browser tab killing your process.** Desktop process lifecycle is simpler.
6. **GDScript hot-reload for gameplay tuning** — though you already have Vite HMR.

Things the web stack gives you that Godot doesn't:
1. **Vite HMR + React DevTools + Chrome DevTools** — the iteration loop is faster than any game engine's.
2. **Tailwind v4 + responsive token system** — your [responsive_system.md](C:/Users/hahnz/.claude/projects/c--Projects-Alloy/memory/project_responsive_system.md) work is sophisticated and has no GDScript analogue. Godot Control nodes require much more manual responsive logic.
3. **The existing test harness** (Vitest + jsdom + Playwright with 5 device profiles + 6 responsive probes across 13 viewports). Rebuilding this in GDUnit is months of work.
4. **Instant-on web distribution** — useful for playtesting, demos, streamers, link-shares. Losing this hurts more than people expect.
5. **Supabase Realtime client maturity** — the Godot SDK exists but is community-maintained.
6. **The balance simulator tool** ([packages/tools/](packages/tools/)) — tightly coupled to the JS engine. A Godot port either orphans it or requires dual implementation.

---

## 4. Benefits of a Full Godot Port

- **Steam-native shipping.** No wrapper, no webview quirks.
- **Controller/HDR/high-refresh-rate parity** with other indie titles in the genre.
- **Shader-first visual pipeline** (though PixiJS also supports this — it's more about team familiarity with GDScript shader workflow vs WebGL GLSL).
- **Physics, tilemaps, animation trees, AnimationPlayer** — Godot primitives that, if your design evolves toward them, are free. E.g., if you ever want a dungeon-crawler overlay, a map, a world view, Godot handles these better than DOM+PixiJS.
- **Mod support** via GDScript sandboxing — easier than shipping a JS interpreter.
- **Single-binary distribution.** Easier updates, no webview dependency.
- **Clearer perception as "a real game"** in marketing, press, and audience perception. Non-trivial.

## 5. Drawbacks of a Full Godot Port

- **5–9 months of engineering time** during which you ship nothing new. Opportunity cost is enormous for a solo/small team.
- **Regression surface.** 114 test files' worth of behavior to revalidate. Combat math, AI heuristics, and stat calculation are the areas most likely to quietly drift.
- **Responsive system loss.** Rebuilding [project_responsive_system.md](C:/Users/hahnz/.claude/projects/c--Projects-Alloy/memory/project_responsive_system.md) in Godot is non-trivial; Godot's Container/anchor system is less expressive than Tailwind for fluid layouts.
- **Tooling regression.** The [packages/tools/](packages/tools/) balance simulator would need rebuilding or orphaning. Playwright → GUT or manual QA.
- **Hiring/collaboration narrowing.** The web stack (TS/React/Tailwind) has a wider contributor pool than GDScript.
- **Godot ecosystem maturity for live-service features.** Realtime multiplayer, anti-cheat, server validation patterns are less documented for Godot than for web.
- **Your [draft screen](C:/Users/hahnz/.claude/projects/c--Projects-Alloy/memory/project_draft_locked_in.md) is locked in and polished.** That polish is in Framer Motion + Tailwind + gesture hooks. Porting it faithfully is a weeks-long subtask by itself.

---

## 6. Recommendation

### Primary recommendation: Path C first, reassess later.

The evidence says the current stack is *not* your graphical ceiling. Before spending 5–9 months on a port, spend 3–4 months proving you can hit the visual bar you want on the current stack:

1. **Wrap in Tauri** (1–2 weeks). You now have a Steam-shippable binary.
2. **Integrate Steamworks** via a thin Rust sidecar or `tauri-plugin-steamworks` (2–3 weeks).
3. **Audit asset pipeline.** Move gems to a single sprite atlas. Compress audio. Add texture packer to the build.
4. **Expand PixiJS footprint.** Move the duel arena from 600×320 to full-viewport. Add shaders (bloom on crits, chromatic aberration on combo hits, screen-space distortion, vignette). Build a proper particle system (10k+ particles). This is where graphical richness actually comes from — not engine choice.
5. **Re-evaluate.** After 3 months, you have a Steam build and a graphically richer product. At that point, if you still feel Godot offers meaningfully more (likely reasons: you want 3D, you want SteamInput at a depth Tauri can't give you, you want mod support), you commit to Path B (engine reuse) — never Path A.

### If you want to port anyway: Path B, not A.

Never throw away [packages/engine](packages/engine/). It is the single most valuable asset in this repo: 7,348 lines of tested, deterministic game rules with a 1.13:1 test ratio. Running it via QuickJS-in-Godot or a headless Node sidecar is unpleasant but it's a solved problem, and it eliminates the highest-risk part of a port.

### Red flags that would shift the recommendation:

- If you want **3D combat** → Godot is correct, PixiJS can't do it.
- If you want **deep mod support** shipped to users → Godot is correct.
- If you want a **team of more than 1–2 people** working on gameplay — and they prefer GDScript — → Godot. For a solo dev, the web stack's iteration speed is probably worth more.
- If Steamworks integration **specifically** is giving you trouble in Tauri after a genuine attempt → reconsider.

---

## 7. Risk Register (for whichever path you choose)

| Risk | Path A | Path B | Path C |
|---|---|---|---|
| Engine math drift (RNG, stat calc, duel) | **High** | Low | None |
| UI regression vs current polish | High | Medium | None |
| Test suite loss | **High** | Medium | Low |
| Steam ship risk | Low | Low | Medium (Tauri Steamworks) |
| Opportunity cost (months not shipping) | **5–9mo** | 3–5mo | 3–4mo + shippable throughout |
| Content velocity post-launch | Low | Medium | **High** |
| Responsive/mobile web retention | Lost | Lost | Retained |

---

## 8. What To Do Before Deciding

1. **Spike a Tauri build of the current app.** ~3 days. If it ships clean, you've established the desktop floor.
2. **Spike a PixiJS-based forge screen.** ~1 week. If it feels dramatically better than the current DOM version, the stack is not your ceiling — your content is. If it feels worse or equally constrained, that's a real signal toward Godot.
3. **Write a "graphically rich Alloy" design doc.** Concretely: what does "graphically rich" mean? Shaders on hits? Animated backgrounds? Full-bleed duel arena with parallax? 3D camera? Each of these has very different stack requirements. "Godot" is not the answer until the question is specific.
4. **Only after steps 1–3,** make the port decision with real data.
