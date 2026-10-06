# Effects' strength and the loot sounds Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings gains **Effects**: three sliders, 0 to 100%, **Screen shake**, **Hit-stop** and **Flashes**, each scaling its effect and turning it off at 0, saved per device in `uiStore`. And two drops sound like themselves: gear that is an upgrade as it comes (the ▲ on its loot label) plays `lootUpgrade`, an essence plays `lootEssence`, in place of the rarity's sound.

**One slider each, not one combined (the call this plan makes).** The three serve different players for different reasons: shake (the screen shake and the camera's kick toward a strike) is a motion-comfort setting; flashes (the floor's full-screen lightning, the light flashes of blasts, the hero's hurt flash) a photosensitivity one; hit-stop is not visual comfort at all but timing (the freeze pauses the sim's clock, `useArenaCore`: a dt of 0), which a player may want off for flow while keeping the shake. One slider would make a photosensitive player give up the freeze, or a motion-sick one the flashes. Three sliders in one section cost two rows.

**What each strength scales (read from the code):**

| Strength | Where | How |
|---|---|---|
| Shake | `ArenaRenderer.addShake` (every shake: hits, hazards, crumbles, a boss's slam) and `kickCamera` (the kick toward a strike) | each amount × strength; at 0 nothing moves. The OS's reduced motion (`still`) still turns both off whatever the slider says. |
| Hit-stop | `HitStop.onEvents` (`fx/hitstop.ts`) | the freeze's ms × strength (rounded); at 0 never frozen. The perfect dodge's slow motion (`SLOWMO_SCALE`) is a mechanic's feedback, not a hit-stop: untouched. |
| Flashes | the pixel floor's `PixelWorld.flash` (a storm's lightning lights the whole floor: `render.ts` adds it to the ambient light) and `pw.flashes` (each blast's light), drawn in the floor's worker; the hero's hurt flash (`ArenaRenderer.heroFlashUntil`) | the lightning's and the flashes' light × strength (the worker gets it on each frame, `FloorFrame.flash`); the hurt flash lasts 0.12 s × strength, none at 0. The rune glyphs' white (`mana-fx.ts`) is a sprite's colour over a few pixels, not a flash of the screen: untouched. |

**How the client tells an upgrade or an essence (read from the code).** The engine's `drop` event carries `dropId`, `dropKind` and the item's `rarity`, not the item or the material. But the world the client holds does: `world.drops` has the drop (`item`, `material`) under that id when the event is handled (it is spawned and the event pushed in the same tick, `spawnDrop` / `dropMaterials`, and only dead drops are pruned, `step.ts`; gear and essences are walked over after `drops.pickupDelay`, never picked up the tick they fall). The ▲ test is the loot plaque's own (`ArenaMode.isUpgrade`: `compareItem(…, 'asIs').powerPct > UPGRADE_EPSILON`, the engine's), and an essence is `material.kind === 'essence'`. So `lootCues(world, events, isUpgrade)` reads both and hands the dive's sounds a map by drop id. No engine change, no rule of the client's.

**Tech Stack:** TypeScript, React 19, PixiJS 8 (untouched), Web Audio (the synth fallback), Vitest (jsdom).

Read `00-overview.md` first.

---

### Task 1: the store and Settings → Effects

**Files:**
- Modify: `packages/client/src/stores/uiStore.ts`
- Modify: `packages/client/src/features/delve/hub/SettingsPanel.tsx`
- Test: `packages/client/src/features/delve/hub/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 1: Write the failing test** (its `afterEach` puts each back: `for (const k of ['shake', 'hitstop', 'flash'] as const) useUIStore.getState().setFx(k, 1);` and removes the three keys):

```tsx
  it('Effects: Screen shake, Hit-stop and Flashes, 0 to 100%, full by default, saved for this device', () => {
    render(<SettingsPanel onClose={() => {}} />);
    for (const [id, kind] of [['fx-shake', 'shake'], ['fx-hitstop', 'hitstop'], ['fx-flash', 'flash']] as const) {
      const slider = screen.getByTestId(id);
      expect(slider).toHaveAttribute('min', '0');
      expect(slider).toHaveAttribute('max', '100');
      expect(slider).toHaveValue('100');
      fireEvent.change(slider, { target: { value: '0' } });
      expect(useUIStore.getState()[kind]).toBe(0);
      expect(localStorage.getItem(`alloy:delve:fx:${kind}`)).toBe('0');
    }
    expect(screen.getByTestId('fx-off-note')).toHaveTextContent('0 turns an effect off');
  });
```

- [ ] **Step 2: Run it** — `(cd packages/client && npx vitest run src/features/delve/hub/__tests__/SettingsPanel.test.tsx)`. Expected: FAIL.
- [ ] **Step 3: `uiStore`.**

```ts
/** Settings → Effects: what each slider scales (the effects plan's table). */
export type FxKind = 'shake' | 'hitstop' | 'flash';
/** Settings → Effects' range: 0 (off) to 1 (full). */
export const FX_RANGE = [0, 1] as const;
```

  Fields `shake`, `hitstop`, `flash` (each "Delve UI: Settings → Effects → …, 0 (off) to 1 (`alloy:delve:fx:<kind>`)"), loaded with `loadNumber(\`alloy:delve:fx:${kind}\`, 1, FX_RANGE)`; `setFx(kind, value)` clamps, persists and sets `{ [kind]: v }`.
- [ ] **Step 4: Settings.** A section **Effects** between Display and HUD (HUD stays last, over Done):

```tsx
        <Section title="Effects">
          {FX.map(({ kind, label }) => (
            <Slider
              key={kind}
              id={`fx-${kind}`}
              label={label}
              min={0}
              max={100}
              step={10}
              value={Math.round(ui[kind] * 100)}
              shown={`${Math.round(ui[kind] * 100)}%`}
              onChange={(v) => ui.setFx(kind, v / 100)}
            />
          ))}
          <p className="k-note" data-testid="fx-off-note">
            0 turns an effect off. Your system's reduced motion turns off the shake whatever this says.
          </p>
        </Section>
```

  with `const FX: { kind: FxKind; label: string }[] = [{ kind: 'shake', label: 'Screen shake' }, { kind: 'hitstop', label: 'Hit-stop' }, { kind: 'flash', label: 'Flashes' }];` at module scope.
- [ ] **Step 5: Run it** — Expected: PASS (and the file's other tests).
- [ ] **Step 6: Commit**

```bash
git add packages/client/src/stores/uiStore.ts packages/client/src/features/delve/hub
git commit -m "feat(client): Settings → Effects: screen shake, hit-stop and flashes, each 0 to 100%"
```

---

### Task 2: shake and the camera kick

**Files:**
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts`
- Test: `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`

- [ ] **Step 1: Write the failing test** (the file has `stage()`, `floor()` and `show()`; `useUIStore` is imported):

```ts
describe("Settings → Effects' strengths", () => {
  afterEach(() => {
    for (const k of ['shake', 'hitstop', 'flash'] as const) useUIStore.getState().setFx(k, 1);
  });

  it('scales the screen shake and the camera kick; at 0 neither moves', () => {
    const { r } = stage();
    show(r, floor());
    const view = r as unknown as {
      shake: number;
      kick: { x: number; y: number };
      kickCamera(dir: { x: number; y: number }, heft: number): void;
    };
    useUIStore.getState().setFx('shake', 0.5);
    r.addShake(0.2);
    expect(view.shake).toBeCloseTo(0.1);
    view.kickCamera({ x: 1, y: 0 }, 1);
    expect(view.kick.x).toBeCloseTo(0.06); // 0.12 × heft × 0.5
    view.shake = 0;
    view.kick = { x: 0, y: 0 };
    useUIStore.getState().setFx('shake', 0);
    r.addShake(0.5);
    view.kickCamera({ x: 1, y: 0 }, 1);
    expect([view.shake, view.kick.x]).toEqual([0, 0]);
  });

  it("the hero's hurt flash lasts its time × the strength, and is off at 0", () => {
    const { r } = stage();
    const w = floor();
    show(r, w);
    const view = r as unknown as { heroFlashUntil: number; time: number };
    const hurt: ArpgEvent = { kind: 'heroHit', x: w.hero.x, y: w.hero.y, amount: 5, dodged: false, element: null };
    useUIStore.getState().setFx('flash', 0);
    r.handleEvents([hurt]);
    expect(view.heroFlashUntil).toBe(0);
    useUIStore.getState().setFx('flash', 0.5);
    r.handleEvents([hurt]);
    expect(view.heroFlashUntil).toBeCloseTo(view.time + 0.06);
  });
});
```

  If the `heroHit` event's type wants more fields (`blocked`), add `blocked: false`; the file's existing events show the shape.

- [ ] **Step 2: Run it** — `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts -t "Effects")`. Expected: FAIL.
- [ ] **Step 3: The renderer.**

```ts
  addShake(amount: number): void {
    const strength = useUIStore.getState().shake;
    if (this.still || strength <= 0) return;
    this.shake = Math.min(0.6, this.shake + amount * strength);
  }

  /** Nudge the camera toward a strike, by its heft and Settings → Effects → Screen shake; heavy ones shake too. */
  private kickCamera(dir: Vec, heft: number): void {
    const strength = useUIStore.getState().shake;
    if (this.still || strength <= 0) return;
    const len = Math.hypot(dir.x, dir.y) || 1;
    this.kick.x += (dir.x / len) * 0.12 * heft * strength;
    this.kick.y += (dir.y / len) * 0.12 * heft * strength;
    if (heft >= 0.7) this.addShake(0.15 * heft);
  }
```

  (`addShake` applies the strength once: the kick's heavy shake goes through it.) The hurt flash (where `heroFlashUntil = this.time + 0.12`): `const flash = useUIStore.getState().flash; if (flash > 0) this.heroFlashUntil = this.time + 0.12 * flash;`. Import `useUIStore` if the file doesn't (it reads View distance from it already: check).
- [ ] **Step 4: Run it** — Expected: PASS; then the whole file (the room objects' shake test runs at full strength).
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts
git commit -m "feat(client): the screen shake, the camera kick and the hurt flash follow Settings → Effects"
```

---

### Task 3: hit-stop

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/hitstop.ts`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts`
- Test: `packages/client/src/features/delve/arena/fx/__tests__/hitstop.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
  it('scales by Settings → Effects → Hit-stop, and never freezes at 0', () => {
    const half = new HitStop();
    half.onEvents([hit(1)], 1000, 0.5);
    expect(half.frozen(1040)).toBe(true); // 90 ms × 0.5 = 45
    expect(half.frozen(1046)).toBe(false);
    const off = new HitStop();
    off.onEvents([hit(1, true), death('boss')], 1000, 0);
    expect(off.frozen(1000)).toBe(false);
    const full = new HitStop();
    full.onEvents([hit(1)], 1000); // the default: full
    expect(full.frozen(1089)).toBe(true);
  });
```

- [ ] **Step 2: Run it** — Expected: FAIL (the third argument is ignored).
- [ ] **Step 3: The code.** `onEvents(events, now, strength = 1)`: `const ms = Math.round(hitstopMs(events) * strength); if (ms > 0) this.until = …` (an elite or boss kill still skips the gap, but at 0 its ms is 0). Its doc: "… × `strength` (Settings → Effects → Hit-stop: 0 never freezes)". In `useArenaCore.ts`: `hitstopRef.current.onEvents(events, performance.now(), useUIStore.getState().hitstop);` (import the store if it doesn't).
- [ ] **Step 4: Run it** — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/fx packages/client/src/features/delve/arena/useArenaCore.ts
git commit -m "feat(client): the hit-stop follows Settings → Effects; at 0 the display never freezes"
```

---

### Task 4: the floor's flashes

**Files:**
- Modify: `packages/client/src/features/delve/arena/pixel/world.ts` (`PixelWorld.flashStrength`)
- Modify: `packages/client/src/features/delve/arena/pixel/render.ts`
- Modify: `packages/client/src/features/delve/arena/pixel/floor-engine.ts` (`FloorFrame.flash`, set on the world each frame)
- Modify: `packages/client/src/features/delve/arena/pixel/pixel-floor.ts` (puts the store's value on the frame)
- Test: `packages/client/src/features/delve/__tests__/pixel-terrain.test.ts` (it has `floor(furnished())`)

- [ ] **Step 1: Write the failing test.**

```ts
  it("Settings → Effects → Flashes scales the lightning's light over the floor: at 0 it draws as with none", () => {
    const pw = floor(furnished());
    const light = (o: Uint8ClampedArray) => o.reduce((s, v, i) => (i % 4 === 3 ? s : s + v), 0);
    const draw = () => {
      const out = new Uint8ClampedArray(pw.size * 4);
      renderPixelWorld(pw, out, 1);
      return light(out);
    };
    const calm = draw();
    pw.flash = 1;
    const full = draw();
    expect(full).toBeGreaterThan(calm * 1.05);
    pw.flashStrength = 0;
    expect(draw()).toBeCloseTo(calm, -2);
    pw.flashStrength = 0.5;
    const half = draw();
    expect(half).toBeGreaterThan(calm);
    expect(half).toBeLessThan(full);
  });
```

  `toBeCloseTo(calm, -2)` allows ±50 over the whole picture's sum, in case the render reads anything time-dependent; if two draws of the same state already differ (`draw()` twice with nothing changed), compare against that spread instead and say so in the test.

- [ ] **Step 2: Run it** — `(cd packages/client && npx vitest run src/features/delve/__tests__/pixel-terrain.test.ts)`. Expected: FAIL (`flashStrength` is not a field; at 0 it still flashes).
- [ ] **Step 3: The code.**
  - `world.ts`, beside `flash`: `/** Settings → Effects → Flashes (0–1): how much of the lightning and the blasts' flashes lights the floor. */ flashStrength = 1;`.
  - `render.ts`: `for (const f of pw.flashes) splat(F, f, f.life * 0.5 * pw.flashStrength);` and `const flash = pw.flash * pw.flashStrength;`.
  - `floor-engine.ts`: `FloorFrame` gains `/** Settings → Effects → Flashes, 0–1 (none: full). */ flash?: number;`; where `FloorEngine.frame(frame)` takes a frame, before it renders: `this.pw.flashStrength = frame.flash ?? 1;` (read the method for the world's field name).
  - `pixel-floor.ts` `update`: `const frame = { ...snapshotArena(…), ...changes, flash: useUIStore.getState().flash };`.
- [ ] **Step 4: Run it** — Expected: PASS; then the pixel tests (`npx vitest run src/features/delve/__tests__/pixel-*.test.ts`).
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/pixel packages/client/src/features/delve/__tests__/pixel-terrain.test.ts
git commit -m "feat(client): the floor's lightning and blast flashes follow Settings → Effects; at 0 none"
```

---

### Task 5: the upgrade and essence sounds

**Files:**
- Modify: `packages/client/src/shared/utils/sound-manager.ts`
- Modify: `packages/client/src/features/delve/arena/arena-sounds.ts`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (`CoreUiEvent`'s `events` carries `cues`)
- Modify: `packages/client/src/pages/DelveRun.tsx` (passes them on)
- Test: `packages/client/src/features/delve/__tests__/arena-sounds.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
import { computeHeroStats, createSandboxWorld, defaultChains, generateItem, SeededRNG, type Drop } from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { lootCues } from '../arena/arena-sounds';

describe('loot cues', () => {
  beforeEach(() => vi.clearAllMocks());
  const registry = getDelveRegistry();
  const world = () =>
    createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry),
      chains: defaultChains(registry, 'fire', null),
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
  const drop = (id: number, over: Partial<Drop>): Drop => ({
    id, kind: 'material', x: 1, y: 1, amount: 1, born: 0, vacuum: false, dead: false, ...over,
  });
  const fell = (id: number, dropKind: Drop['kind'], rarity?: 'rare') =>
    ({ kind: 'drop', dropId: id, x: 1, y: 1, dropKind, rarity }) as const;

  it("finds this frame's essences and upgrades in the world's drops, by drop id", () => {
    const w = world();
    const helm = generateItem(registry, { uid: 'h', ilvl: 5, rarity: 'rare', slot: 'helm', mana: 'fire' }, new SeededRNG(1));
    const boots = generateItem(registry, { uid: 'b', ilvl: 5, rarity: 'rare', slot: 'boots', mana: 'fire' }, new SeededRNG(2));
    w.drops.push(
      drop(1, { material: { kind: 'essence', essence: registry.getDelveData().legendaries[0].id } }),
      drop(2, { kind: 'item', item: helm }),
      drop(3, { kind: 'item', item: boots }),
      drop(4, { material: { kind: 'metal', metal: 'iron' } }),
    );
    const events = [fell(1, 'material'), fell(2, 'item', 'rare'), fell(3, 'item', 'rare'), fell(4, 'material')];
    expect(lootCues(w, events, (item) => item.uid === 'h')).toEqual({ 1: 'essence', 2: 'upgrade' });
    // No upgrade test (the Training Grounds): essences only.
    expect(lootCues(w, events)).toEqual({ 1: 'essence' });
  });

  it('an upgrade and an essence play their own sounds, in place of the rarity's', () => {
    playArenaEvents([fell(2, 'item', 'rare'), fell(1, 'material'), fell(3, 'item', 'rare')], { 2: 'upgrade', 1: 'essence' });
    expect(vi.mocked(playSound).mock.calls.map(([s]) => s)).toEqual(['lootUpgrade', 'lootEssence', 'lootRare']);
  });
});
```

  Check against the engine's types before running: `generateItem`'s options and slot names (the responsive spec calls `generateItem(registry, { uid, ilvl, rarity, slot: 'helm', mana: 'fire' }, new SeededRNG(n))`; use a second slot it accepts), `registry.getDelveData().legendaries` (the essence's id is a legendary's), the metal id `'iron'` (`crafting.json → metals`), and whether `Drop` is exported from `@alloy/engine` (else `ArpgWorld['drops'][number]`).

- [ ] **Step 2: Run them** — `(cd packages/client && npx vitest run src/features/delve/__tests__/arena-sounds.test.ts)`. Expected: FAIL.
- [ ] **Step 3: The sounds.** In `sound-manager.ts`: `SoundName` gains `| 'lootUpgrade' | 'lootEssence'` (under `// Delve`); `SOUND_REGISTRY` gains

```ts
  lootUpgrade:     { sprite: 'loot-upgrade',      volume: 0.6, category: 'sfx', cooldownMs: 150 },
  lootEssence:     { sprite: 'loot-essence',      volume: 0.75, category: 'sfx' },
```

  and `SYNTH_SOUNDS` (no audio file exists for any loot sound: they are all synthesized; use only the `AudioParam` calls the others use, `setValueAtTime` and `exponentialRampToValueAtTime`, which `src/test-setup.ts`'s `MockAudioContext` provides):

```ts
  lootUpgrade(vol) {
    // Two bright notes rising a fourth, square: "better", unlike the rare's soft three-note sine.
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    [783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'square'; osc.frequency.value = freq;
      const s0 = t + i * 0.09;
      g.gain.setValueAtTime(0.001, t); g.gain.setValueAtTime(vol * 0.22, s0);
      g.gain.exponentialRampToValueAtTime(0.001, s0 + 0.24);
      osc.connect(g).connect(ctx.destination); osc.start(s0); osc.stop(s0 + 0.24);
    });
  },
  lootEssence(vol) {
    // A low hum swelling under a slow shimmer: rarer than a rare, short of the legendary's boom.
    const ctx = getAudioContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const hum = ctx.createOscillator(); const hg = ctx.createGain();
    hum.type = 'sine'; hum.frequency.value = 196;
    hg.gain.setValueAtTime(0.001, t); hg.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.15);
    hg.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    hum.connect(hg).connect(ctx.destination); hum.start(t); hum.stop(t + 1.1);
    [987.77, 1174.66, 1479.98].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = freq;
      const s0 = t + 0.1 + i * 0.12;
      g.gain.setValueAtTime(0.001, t); g.gain.setValueAtTime(vol * 0.3, s0);
      g.gain.exponentialRampToValueAtTime(0.001, s0 + 0.6);
      osc.connect(g).connect(ctx.destination); osc.start(s0); osc.stop(s0 + 0.6);
    });
  },
```

- [ ] **Step 4: `arena-sounds.ts`.**

```ts
/** A drop with a sound of its own: gear that is an upgrade as it comes (▲), or an essence. */
export type LootCue = 'upgrade' | 'essence';

/**
 * This frame's drops that sound like themselves, by drop id: an essence (its material), or gear
 * `isUpgrade` calls an upgrade as it comes (the loot plaque's own test: ▲). The `drop` event
 * carries neither; the world's drops do, under the event's id, the frame it falls.
 */
export function lootCues(
  world: ArpgWorld,
  events: readonly ArpgEvent[],
  isUpgrade?: (item: GearItem) => boolean,
): Record<number, LootCue> {
  const cues: Record<number, LootCue> = {};
  for (const e of events) {
    if (e.kind !== 'drop') continue;
    const d = world.drops.find((x) => x.id === e.dropId);
    if (d?.material?.kind === 'essence') cues[e.dropId] = 'essence';
    else if (d?.item && isUpgrade?.(d.item)) cues[e.dropId] = 'upgrade';
  }
  return cues;
}
```

  `playArenaEvents(events, cues: Record<number, LootCue> = {})`, its `drop` case:

```ts
      case 'drop': {
        const cue = cues[ev.dropId];
        if (cue === 'essence') playSound('lootEssence');
        else if (cue === 'upgrade') playSound('lootUpgrade');
        else if (ev.rarity === 'rare' || ev.rarity === 'epic') playSound('lootRare');
        else if (ev.dropKind === 'item' || ev.dropKind === 'rune') playSound('lootDrop');
        break;
      }
```

- [ ] **Step 5: The wiring.** `useArenaCore.ts`: `CoreUiEvent`'s `{ kind: 'events'; events: ArpgEvent[]; cues: Record<number, LootCue> }`, and in `handleEvents` `onUiRef.current({ kind: 'events', events, cues: lootCues(world, events, modeRef.current.isUpgrade) });`. `DelveRun.tsx`: `playArenaEvents(e.events, e.cues);`. `DelveTraining.tsx` keeps `playArenaEvents(e.events)` (the sandbox drops no gear and no essence). `grep -rn "kind: 'events'" packages/client/src` lists every place that makes or reads the event (tests that build one add `cues: {}`).
- [ ] **Step 6: The timing holds (read, don't test).** A drop can't be picked up before `drops.pickupDelay` (0.35 sim s, `step.ts`), and one frame steps at most 0.1 s × the timescale (1 in play; up to 4 under the E2E's `alloy:delve:timescale`), so in play the drop is always in `world.drops` when its frame's events are handled. Only a 4× E2E frame could miss one, and then the sound is the rarity's, as today: acceptable, no fallback. If the user reports a silent upgrade in play, the fallback is the engine's, kept to one field: `drop` events gain `essence?: string` (set in `dropMaterials` and the vault's spawn, `packages/engine/src/arpg/material-drops.ts` and `interact.ts`; the type at `types/arpg.ts` ~707), with a test in `packages/engine/tests/` that a boss's essence drop names it, then `npx tsup`; the upgrade needs no field (the renderer makes each drop's plaque from `world.drops` the same frame).
- [ ] **Step 7: Run** — `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/arena-sounds.test.ts)`. Expected: PASS.
- [ ] **Step 8: Commit**

```bash
git add packages/client/src/shared/utils/sound-manager.ts packages/client/src/features/delve/arena packages/client/src/pages/DelveRun.tsx packages/client/src/features/delve/__tests__/arena-sounds.test.ts
git commit -m "feat(client): an upgrade drop (▲) and an essence each play a sound of their own"
```

  Before it: `(cd packages/client && npx vitest related --run src/shared/utils/sound-manager.ts src/features/delve/arena/arena-sounds.ts src/features/delve/arena/useArenaCore.ts src/pages/DelveRun.tsx)`.

---

### Task 6: the plan's run

With plans 03 and 04 folded in (group B), the union:

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-05.txt" 2>&1; tail -n 15 "$SCRATCH/unit-05.txt")
(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-hud.spec.ts e2e/delve-training.spec.ts e2e/delve-pad-nav.spec.ts --project=desktop --reporter=line > "$SCRATCH/e2e-05.txt" 2>&1; tail -n 30 "$SCRATCH/e2e-05.txt")
```

  Expected: the unit suite at the baseline plus the three plans' tests, all passing; the specs PASS on `desktop`. D02 (loot drops mid-dive) plays the drop sounds through `lootCues` (muted in the E2E: the path runs, no sound); D09 and H01 open Settings (it has a new section); the pad audit runs because Settings gained stops: `ALLOW.settings` must stay `[0, 0]` (the sliders are full-width rows like the ones above them). No layout changed outside a dialog: no `desktop-1080`. Known flakes: D02 alone once.
