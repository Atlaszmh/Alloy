# The stop in two steps Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the stop asks one thing at a time. Step 1, "Take one power-up": the cards in a row, A takes, X skips. Step 2, "Choose your road": the doors, Extract and (when it helps) the potion in one row, each door's cost and gain on their own lines in words. The floor's finds are one line that opens a sheet; Y does nothing at the stop.

**Architecture:** `StopScreen` derives its step from the stop (`offering`: a stop not yet taken) and one bit of its own state (`skipped`). Step 1 renders today's `StopPanel` unchanged; step 2 renders `DoorPane`, rebuilt as a row. A move between the steps puts the focus on the new step's `[data-pad-first]`. The finds list moves verbatim into a kit `Dialog` opened by the summary line. The risk line and Hesta's strip sit in the header on both steps.

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright.

Read `00-overview.md` first (branch, baseline, commands, the `padPress` convention, the test-id table). Spec: section 3, "The stop in two steps", with the overview's edits 1, 3 and 4.

**The guided start, checked against `packages/engine/src/data/tutorial.json`:** no step, trail or target changes, and `WAY_TO` needs no entry.

| Target | Where it was | Where it is | The steps that name it |
|---|---|---|---|
| `stop.powerup` | the centre column | step 1's body (`stop-powerup`) | `s1-equip`, `s2-move`, `s4-upgrade`, `s5-power` (each a `takeStop` step, so its stop is `required` and opens on step 1, which it holds) |
| `stop.card:<kind>`, `stop.pick` | `StopPanel` | unchanged | the same steps' trails |
| `stop.doors` | the right column's `door-list` | step 2's `door-list` | `s1-door`, `s2-door`, `s4-door`, `s5-door` (their stop is taken, so the screen is on step 2 once the take lands), `s6-doors`, `s7-door` (no kinds: `rollStop` returns null, so the stop opens on step 2) |
| `stop.extract` | Extract | step 2's Extract | `s8-home` (no kinds: step 2) |
| `stop.risk` | the left panel's foot | the header, both steps | `s3-home` (no kinds: step 2; this is why the risk line is not step 1's alone) |

A guided stop's `required` power-up holds step 1: the Skip prompt is disabled, `roads-held` says why, and the doors are not on screen until the take. `tutorial-targets.test.tsx` keeps passing: every target is still placed by name in the source.

**The client autopilot** never plays the stop (see the overview); the E2E answers both steps (Task 3).

---

### Task 1: the road row (`DoorPane`, `doorTerms`)

**Files:**
- Modify: `packages/client/src/features/delve/stop/DoorPane.tsx`
- Test: `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx` (the `doorLoot` case becomes `doorTerms`; the door rendering case moves to Task 2, which owns the steps)

- [ ] **Step 1: Write the failing test.** Replace the test "words a door's loot multipliers from its mods, leaving out what it doesn't change" and the `doorLoot` import (`import { doorTerms } from '../DoorPane';`):

```tsx
  it("words a door's cost and its gain from its mods, each a list for its own line", () => {
    const terms = (id: string) => doorTerms(registry.getDoor(id).mods);
    expect(doorTerms({})).toEqual({ cost: [], gain: [] });
    expect(terms('winding')).toEqual({ cost: [], gain: [] });
    expect(terms('gilded')).toEqual({
      cost: ['Foes +25% life'],
      gain: ['Flux ×1.5', 'Essences ×1.5', 'Find +75%'],
    });
    expect(terms('champions')).toEqual({ cost: ['An elite leads every pack'], gain: ['Bounty ×1.5'] });
    expect(terms('shrine')).toEqual({
      cost: ['Materials ×0.5', 'Runes ×0.5'],
      gain: ['Heal to full', '+1 potion'],
    });
    expect(terms('plunge')).toEqual({ cost: ['2 depths deeper'], gain: ['Bounty ×2'] });
    // A minus sign, not a hyphen.
    expect(terms('swarm')).toEqual({ cost: ['50% more foes'], gain: ['Foes −30% life', 'Materials ×1.3'] });
    expect(terms('cursed')).toEqual({ cost: ['Foes hit 40% harder'], gain: ['Tier up 35%'] });
  });
```

  The expectations are `delve.json`'s doors as of v0.65.0 (`node -e "for (const d of require('./packages/engine/src/data/delve.json').doors) console.log(JSON.stringify(d))"`). If a door's mods differ, correct the expectation to the data, not the function.

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/client && npx vitest run src/features/delve/stop/__tests__/StopScreen.test.tsx -t "cost and its gain")`
Expected: FAIL, `doorTerms` is not exported.

- [ ] **Step 3: Implement.** In `DoorPane.tsx`, replace `doorLoot` with:

```tsx
/** A door's terms in words, for its two lines: what it costs (red, "Cost: …") and what it gives (green, "Gain: …"). */
export interface DoorTerms {
  cost: string[];
  gain: string[];
}

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;

/**
 * A door's mods as words (the pad-first spec, 3: each door's cost and gain on separate lines,
 * worded as well as coloured). A harder or longer road is a cost, a richer or kinder one a gain;
 * a loot multiplier under 1 is a cost ("Materials ×0.5"). A door with neither (the Winding Path)
 * shows its own text instead.
 */
export function doorTerms(mods: DoorMods): DoorTerms {
  const cost: string[] = [];
  const gain: string[] = [];
  if (mods.skip) cost.push(`${mods.skip} depths deeper`);
  if (mods.monsterHp)
    (mods.monsterHp > 0 ? cost : gain).push(
      `Foes ${mods.monsterHp > 0 ? '+' : '−'}${pct(mods.monsterHp)} life`,
    );
  if (mods.monsterDmg)
    (mods.monsterDmg > 0 ? cost : gain).push(
      `Foes hit ${pct(mods.monsterDmg)} ${mods.monsterDmg > 0 ? 'harder' : 'softer'}`,
    );
  if (mods.eliteChance)
    cost.push(mods.eliteChance >= 1 ? 'An elite leads every pack' : `Elite packs ${pct(mods.eliteChance)}`);
  if (mods.packs && mods.packs !== 1)
    (mods.packs > 1 ? cost : gain).push(`${pct(mods.packs - 1)} ${mods.packs > 1 ? 'more' : 'fewer'} foes`);
  if (mods.healFull) gain.push('Heal to full');
  if (mods.potions) gain.push(`+${mods.potions} potion${mods.potions === 1 ? '' : 's'}`);
  if (mods.bountyMult && mods.bountyMult !== 1) gain.push(`Bounty ×${mods.bountyMult}`);
  const times: [number | undefined, string][] = [
    [mods.materials, 'Materials'],
    [mods.runes, 'Runes'],
    [mods.gear, 'Gear'],
    [mods.flux, 'Flux'],
    [mods.essence, 'Essences'],
  ];
  for (const [v, label] of times) if (v !== undefined && v !== 1) (v > 1 ? gain : cost).push(`${label} ×${v}`);
  if (mods.find) gain.push(`Find +${mods.find}%`);
  if (mods.shardTier) gain.push(`Tier up ${pct(mods.shardTier)}`);
  return { cost, gain };
}
```

  Then rebuild the pane as the road row. `DoorButton` loses `body`, `aside` and `disabled` and takes `lines`; it is a column plate (art on top) so three doors, Extract and the potion fit across at 1280×720:

```tsx
function DoorButton({
  art,
  title,
  lines,
  first,
  primary,
  tutorial,
  onClick,
  testId,
}: {
  art: ReactNode;
  title: ReactNode;
  lines: ReactNode;
  first?: boolean;
  /** The first door: the responsive harness's reachability probe checks it. */
  primary?: boolean;
  tutorial?: TutorialTarget;
  onClick: () => void;
  testId: string;
}): ReactElement {
  return (
    <button
      type="button"
      className="k-plate flex min-w-0 flex-1 basis-0 flex-col items-center gap-2 p-5 text-center text-[var(--k-text)] [@media(max-height:809px)]:p-3"
      onClick={onClick}
      data-tutorial={tutorial}
      data-door
      data-pad-first={first || undefined}
      data-primary-action={primary ? 'door' : undefined}
      data-testid={testId}
    >
      {art}
      <span className="k-disp text-[24px]">{title}</span>
      {lines}
    </button>
  );
}
```

  and `DoorPane` (its doc comment: "Step 2's row (the pad-first spec, 3): each door as a plate with its art in a doorway, its depth, a boss mark, and its cost and gain on their own lines (`doorTerms`), or its own text when it has neither; Extract, with the hero leaving; and, while life is below full and a potion is left, the potion. The first road is the pad's first focus. A guided stop that doesn't extract hides Extract."):

```tsx
export function DoorPane({
  dive,
  onChoose,
  onExtract,
  onPotion,
}: {
  dive: DiveState;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
  onPotion: () => void;
}): ReactElement {
  const registry = getDelveRegistry();
  const finds = RARITY_ORDER.reduce((n, r) => n + dive.found[r], 0);
  const tutorial = useDelveStore((s) => s.profile.tutorial);
  const extract = tutorialStop(tutorial)?.extract ?? true;
  const doors = dive.doorChoices.length > 0;
  const thirsty = dive.potions > 0 && dive.heroHpFrac < 1;
  return (
    <div className="flex min-h-0 items-stretch gap-5 [@media(max-height:809px)]:gap-3">
      <div
        className="flex min-w-0 flex-[3] items-stretch gap-5 [@media(max-height:809px)]:gap-3"
        data-testid="door-list"
        data-tutorial="stop.doors"
      >
        {dive.doorChoices.map((id, i) => {
          const door = registry.getDoor(id);
          const next = dive.depth + 1 + (door.mods.skip ?? 0);
          const monster = registry.getBiomeForDepth(next).monsters[0];
          const treasure = (door.mods.gear ?? 1) > 1 || (door.mods.essence ?? 1) > 1;
          const { cost, gain } = doorTerms(door.mods);
          return (
            <DoorButton
              key={id}
              first={i === 0}
              primary={i === 0}
              testId={`door-${id}`}
              art={
                <Doorway fill={treasure ? 'var(--k-wood-0)' : 'var(--k-mana-2)'}>
                  {treasure ? (
                    <span className="pb-[6px]">
                      <Glyph id="chest" size={60} />
                    </span>
                  ) : (
                    <PixelSprite id={monster.id} scale={4} context="ui" label={monster.name} />
                  )}
                </Doorway>
              }
              title={door.name}
              lines={
                <>
                  <span className="flex items-center gap-2 text-[18px] text-[var(--k-text-2)]">
                    Depth {next}
                    {isBossDepth(registry, next) && (
                      <span className="flex items-center gap-1 text-[var(--k-bad-text)]">
                        <Glyph id="skull" size={14} /> Boss
                      </span>
                    )}
                  </span>
                  {cost.length > 0 && (
                    <span className="text-[16px] leading-tight text-[var(--k-bad-text)]" data-door-cost>
                      Cost: {cost.join(' · ')}
                    </span>
                  )}
                  {gain.length > 0 && (
                    <span className="text-[16px] leading-tight text-[var(--k-ok)]" data-door-gain>
                      Gain: {gain.join(' · ')}
                    </span>
                  )}
                  {cost.length + gain.length === 0 && (
                    <span className="text-[16px] leading-tight text-[var(--k-text-3)]">{door.text}</span>
                  )}
                </>
              }
              onClick={() => {
                playSound('phaseTransition');
                vibrate('medium');
                onChoose(id);
              }}
            />
          );
        })}
      </div>
      {extract && (
        <DoorButton
          testId="extract-button"
          tutorial="stop.extract"
          first={!doors}
          art={
            <Doorway fill="var(--k-steel)">
              <PixelSprite id="hero" scale={4} context="ui" label="Your hero leaving" />
            </Doorway>
          }
          title="Extract"
          lines={
            <span className="text-[16px] leading-tight text-[var(--k-ok)]">
              Leave with {formatNumber(dive.bounty)} scrap and {finds} finds.
            </span>
          }
          onClick={() => {
            playSound('victory');
            vibrate('success');
            onExtract();
          }}
        />
      )}
      {thirsty && (
        <button
          type="button"
          className="k-plate flex w-[220px] flex-none flex-col items-center justify-center gap-2 p-5 text-center text-[var(--k-text)] [@media(max-height:809px)]:p-3"
          onClick={onPotion}
          data-testid="door-potion"
        >
          <Glyph id="potion" size={40} />
          <span className="k-disp text-[22px]">Drink a potion</span>
          <span className="text-[16px] text-[var(--k-text-2)]">
            Life {Math.round(dive.heroHpFrac * 100)}% · {dive.potions} potion
            {dive.potions === 1 ? '' : 's'}
          </span>
        </button>
      )}
    </div>
  );
}
```

  Drop the `Button` import if unused. `--k-ok` is the green the purse bar's gains use; if `kit.css` names it differently, use that name.

- [ ] **Step 4: Run it to see it pass**

Run: `(cd packages/client && npx vitest run src/features/delve/stop/__tests__/StopScreen.test.tsx -t "cost and its gain")`
Expected: PASS. `StopScreen.tsx` still passes `padFirst` and `held`, so `tsc` fails until Task 2: Tasks 1 and 2 share Task 2's commit (the one exception to one commit a task in this phase).

---

### Task 2: the two steps, the finds line and its sheet

**Files:**
- Modify: `packages/client/src/features/delve/stop/StopScreen.tsx`
- Modify: `packages/client/src/features/delve/arena/hud/FoundLog.tsx` (export `countUpgrades`)
- Modify: `packages/client/src/features/delve/StopPanel.tsx` (the first card's `data-primary-action`)
- Test: `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx`, `packages/client/src/pages/__tests__/DelveRun.test.tsx`

- [ ] **Step 1: Rewrite the tests that encode one screen** (they must fail before the code changes). In `StopScreen.test.tsx`, add beside `press`:

```tsx
import { scopedLast } from '../../kit/prompts';

/**
 * A pad button as the nav hears it (use-gamepad-nav.ts): the topmost scope's prompts first, else
 * its default (B presses the scope's [data-pad-back], Menu its [data-pad-menu] or its back).
 */
const padPress = (button: PadButton) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    const took = padPrompts(new Set([button]), {} as Record<PadButton, boolean>, 0);
    if (took.has(button)) return;
    if (button === 'b') scopedLast('[data-pad-back]')?.click();
    if (button === 'menu') (scopedLast('[data-pad-menu]') ?? scopedLast('[data-pad-back]'))?.click();
  } finally {
    box.mockRestore();
  }
};
/** The first door of the stop's dive. */
const firstDoor = () => screen.getByTestId(`door-${store().profile.dive!.doorChoices[0]}`);
```

  Then, by test name (`atStop`'s dive has bounty 26, doors `winding` and `gilded`, the floor's finds the helm and the weapon, Split III ×2 and Quick I):

  - "is a kit screen over the arena: the depth cleared, its biome, the bounty and the floor's finds" → keep the root, heading and biome checks; replace the `floor-counts` line with

    ```tsx
    expect(screen.getByTestId('stop-finds')).toHaveTextContent(
      /^26 scrap bounty · 2 items · 3 runes · ▲ [12] upgrades? waiting$/,
    );
    const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
    const risk = screen.getByTestId('risk-line');
    expect(risk).toHaveTextContent(`Banked this dive · dying loses ${loss}% of it`);
    expect(risk).toHaveAttribute('data-tutorial', 'stop.risk');
    ```

    (The helm's slot is empty, so it is ▲; whether the rare weapon also is depends on the seeded sword: the regex takes either. If you can pin it, pin it.)
  - "lists this floor's items with their marks and its runes grouped, over the risk line" → "A on the finds line opens the sheet: the items with their marks, the runes grouped; an item closes it and opens the pause on it":

    ```tsx
    const { onInspect } = atStop(['equip']);
    arm();
    fireEvent.click(screen.getByTestId('stop-finds'));
    const found = screen.getByTestId('floor-finds');
    expect(found).toHaveAttribute('role', 'dialog');
    const items = within(found).getAllByTestId('loot-item');
    expect(items.map((b) => b.dataset.uid)).toEqual(['w1', 'h1']);
    expect(items[1]).toHaveTextContent(item('h1', 'helm', 4).name);
    expect(items[1]).toHaveTextContent('▲');
    const runes = within(within(found).getByTestId('loot-runes')).getAllByTestId('loot-rune');
    expect(runes.map((r) => r.textContent)).toEqual([
      'Quick IRune, to your pouch',
      'Split III ×2Rune, to your pouch',
    ]);
    fireEvent.click(items[1]);
    expect(screen.queryByTestId('floor-finds')).toBeNull();
    expect(onInspect).toHaveBeenCalledWith('h1');
    ```

  - "groups the floor's materials and currencies above its items, its essences below them, and counts them" → open the sheet first (`fireEvent.click(screen.getByTestId('stop-finds'))`), take `found` as `screen.getByTestId('floor-finds')`, keep the row order and texts, and replace the counts line with `expect(screen.getByTestId('stop-finds')).toHaveTextContent('5 materials')`.
  - "shows the doors with their art and depth, Extract with the hero, and the potion" → step 2 first, and the terms:

    ```tsx
    const { onChoose, onExtract, onPotion } = atStop(['equip'], { heroHpFrac: 0.5, potions: 2 });
    arm();
    press('KeyS');
    const door = firstDoor();
    const first = store().profile.dive!.doorChoices[0];
    expect(door).toHaveTextContent(registry.getDoor(first).name);
    expect(door.querySelector('[data-sprite], [data-glyph="chest"]')).not.toBeNull();
    const line = (id: string, kind: 'cost' | 'gain') =>
      screen.getByTestId(`door-${id}`).querySelector(`[data-door-${kind}]`)?.textContent ?? null;
    const gilded = doorTerms(registry.getDoor('gilded').mods);
    expect(line('gilded', 'cost')).toBe(`Cost: ${gilded.cost.join(' · ')}`);
    expect(line('gilded', 'gain')).toBe(`Gain: ${gilded.gain.join(' · ')}`);
    expect(line('winding', 'cost')).toBeNull();
    expect(screen.getByTestId('door-winding')).toHaveTextContent(registry.getDoor('winding').text);
    fireEvent.click(door);
    expect(onChoose).toHaveBeenCalledWith(first);
    const extract = screen.getByTestId('extract-button');
    expect(extract).toHaveTextContent('Leave with 26 scrap');
    expect(extract.querySelector('[data-sprite="hero"]')).not.toBeNull();
    fireEvent.click(extract);
    expect(onExtract).toHaveBeenCalledOnce();
    const potion = screen.getByTestId('door-potion');
    expect(potion).toHaveTextContent('Life 50% · 2 potions');
    fireEvent.click(potion);
    expect(onPotion).toHaveBeenCalledOnce();
    ```

    and add "the potion is offered only while life is below full and a potion is left": `atStop(null, { heroHpFrac: 1, potions: 2 })` → no `door-potion`; then `act(() => store().setProfile({ ...store().profile, dive: { ...store().profile.dive!, heroHpFrac: 0.4, potions: 0 } }))` → still none.
  - "S skips the power-up: the cards go and the focus moves to the first door" → replace with the two-step tests below.
  - "for ARM_MS after it mounts, its prompts and buttons are inert…" → keep, but drop the lines that focus a `loot-item` inside `floor-finds` and press the pad's Y (the finds are a sheet now, and Y does nothing); press X instead: `padPress('x')` before arming leaves `stop` in the document. Drop the `onInspect` destructuring and its expectation.
  - "the pad's first focus is the first power-up card while one is on offer, the first door once it is skipped" → unchanged in intent; skip with `press('KeyS')` as now. It passes once step 2 marks its first road.
  - "with no power-up to offer, says so" → `expect(screen.getByTestId('stop-none')).toHaveTextContent('No power-up at this stop.')` and `expect(screen.getByTestId('stop-road')).toBeInTheDocument()`.
  - "Y (Inspect item) opens the focused find" → "Y does nothing at the stop, and no prompt names it":

    ```tsx
    const { onInspect, onChoose } = atStop(['equip']);
    arm();
    const root = screen.getByTestId('door-choice');
    expect(root).not.toHaveTextContent('Inspect');
    screen.getByTestId('stop-finds').focus();
    padPress('y');
    expect(onInspect).not.toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('floor-finds')).toBeNull();
    ```

  In the guided `describe`:
  - "a required power-up holds every road, and Skip with them, until it is taken" → "a required power-up holds step 1: Skip is off and says why, and the roads come once it is taken":

    ```tsx
    atStop(['equip'], { stop: { offers: ['equip'], taken: false, required: true } });
    arm();
    const skip = screen.getByRole('button', { name: 'Skip power-up' });
    expect(skip).toBeDisabled();
    expect(screen.getByTestId('roads-held')).toHaveTextContent('Take the power-up to go on');
    press('KeyS');
    padPress('x');
    expect(screen.getByTestId('stop-powerup')).toBeInTheDocument();
    expect(screen.queryByTestId('door-list')).toBeNull();
    const dive = store().profile.dive!;
    act(() =>
      store().setProfile({ ...store().profile, dive: { ...dive, stop: { ...dive.stop!, taken: true } } }),
    );
    expect(screen.queryByTestId('roads-held')).toBeNull();
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    for (const id of store().profile.dive!.doorChoices) expect(screen.getByTestId(`door-${id}`)).toBeEnabled();
    expect(screen.getByTestId('extract-button')).toBeEnabled();
    ```

  - "with no doors, Extract stands alone, the first focus" → `not.toHaveTextContent('Choose your road')` (the heading reads "The way home").
  - "a guided stop shows Hesta's strip in the header row, between the title and the counts" → "…between the title and the finds line": `const counts = screen.getByTestId('stop-finds');` in place of `floor-counts`, the rest as is.

  And add, in the first `describe`:

```tsx
  it('opens on step 1 while a power-up is offered: the cards (the first the first focus), the finds line and the risk line, no roads', () => {
    atStop(['equip', 'upgrade']);
    const step = screen.getByTestId('stop-powerup');
    expect(step).toHaveAttribute('data-tutorial', 'stop.powerup');
    expect(step).toContainElement(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-equip')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('stop-equip')).toHaveAttribute('data-primary-action', 'powerup');
    expect(screen.queryByTestId('stop-road')).toBeNull();
    expect(screen.queryByTestId('door-list')).toBeNull();
    expect(screen.queryByTestId('extract-button')).toBeNull();
    expect(screen.getByTestId('door-choice').querySelectorAll('[data-pad-first]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Skip power-up' })).toBeInTheDocument();
  });

  it('X (or S) skips to step 2, the first road focused; B (or its button) goes back while nothing was taken', () => {
    atStop(['equip', 'upgrade']);
    arm();
    padPress('x');
    const road = screen.getByTestId('stop-road');
    expect(road).toHaveTextContent('Choose your road');
    expect(screen.getByTestId('stop-skipped')).toHaveTextContent('Power-up skipped.');
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(firstDoor()).toHaveFocus();
    padPress('b');
    expect(screen.queryByTestId('stop-road')).toBeNull();
    expect(screen.getByTestId('stop-equip')).toHaveFocus();
    press('KeyS');
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Power-ups' }));
    expect(screen.getByTestId('stop')).toBeInTheDocument();
  });

  it('a take moves to step 2 for good: the first road focused, and no way back', () => {
    atStop(['equip', 'upgrade']);
    arm();
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getAllByTestId('stop-equip-item')[0]);
    expect(store().profile.dive!.stop!.taken).toBe(true);
    expect(screen.getByTestId('stop-taken')).toHaveTextContent('Power-up taken.');
    expect(firstDoor()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Power-ups' })).toBeNull();
    padPress('b');
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
  });

  it("opens on step 2 when the stop offers nothing, or what it offered is taken (a reload's)", () => {
    atStop(['equip'], { stop: { offers: ['equip'], taken: true } });
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip power-up' })).toBeNull();
    expect(screen.getByTestId('stop-finds')).toBeInTheDocument();
    expect(screen.getByTestId('risk-line')).toBeInTheDocument();
  });
```

  In `pages/__tests__/DelveRun.test.tsx`, "at the stop, the stop screen covers the arena; its Menu opens the pause over it, and Resume returns to it": its stop offers Equip, so the screen opens on step 1: replace `expect(screen.getByTestId('door-winding')).toBeInTheDocument()` with `expect(within(stop).getByTestId('stop-equip')).toBeInTheDocument()`; at its end (after Resume) keep `door-choice` and assert `stop-equip` again (the step survives the pause: `StopScreen` stays mounted under it).

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/stop src/pages/__tests__/DelveRun.test.tsx)`
Expected: FAIL on every rewritten and new case (`stop-finds`, `stop-powerup`, `stop-road` not found; the doors are on screen at step 1).

- [ ] **Step 3: `countUpgrades` in `FoundLog.tsx`.** Above `FoundLog`:

```tsx
/** How many of `items` are upgrades as they come (▲): what waits to be equipped at the Anvil. */
export function countUpgrades(items: readonly { asIs: number | null }[]): number {
  return items.filter((r) => r.asIs !== null && r.asIs > UPGRADE_EPSILON).length;
}
```

  and in `FoundLog`, `const upgrades = countUpgrades(items);` (the `up` helper stays for `potential`).

- [ ] **Step 4: `StopPanel.tsx`.** On the card button, beside `data-pad-first`: `data-primary-action={i === 0 ? 'powerup' : undefined}` (the responsive harness's reachability probe needs a primary action on step 1; the alcove's cards carry it too, harmlessly). Nothing else in `StopPanel` changes: the alcove still uses it as it is.

- [ ] **Step 5: `StopScreen.tsx`.** Replace the file's body below the imports with the following (keep `sendTutorial`, `ARM_MS`, `ROW`, `CAPTION` and `HaulStopRow` as they are; the imports gain `useLayoutEffect`, `Dialog`; `MARK` and `countUpgrades` from `../arena/hud/FoundLog`; `Panel` goes).

```tsx
/**
 * The finds line's words (the pad-first spec, 3): the bounty, then what else the floor found,
 * leaving out what it found none of: "26 scrap bounty · 18 materials · 1 rune · ▲ 1 upgrade waiting".
 */
export function findsSummary(n: {
  bounty: number;
  materials: number;
  items: number;
  runes: number;
  upgrades: number;
}): string {
  const some = (k: number, one: string) => `${formatNumber(k)} ${one}${k === 1 ? '' : 's'}`;
  return [
    `${formatNumber(n.bounty)} scrap bounty`,
    n.materials > 0 && some(n.materials, 'material'),
    n.items > 0 && some(n.items, 'item'),
    n.runes > 0 && some(n.runes, 'rune'),
    n.upgrades > 0 && `▲ ${some(n.upgrades, 'upgrade')} waiting`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface StopScreenProps {
  dive: DiveState;
  /** The floor's haul as the clear banked it; null after a reload (then its items and runes show). */
  haul: Haul | null;
  onChoose: (doorId: string) => void;
  onExtract: () => void;
  onPotion: () => void;
  /** The footer's Menu (Esc, the pad's Menu): the pause, over the stop. */
  onMenu: () => void;
  /** A find picked in the finds sheet: the pause's Loadout, on that item. */
  onInspect: (uid: string) => void;
}

/**
 * The stop between depths, over the dimmed arena, in two steps (the pad-first spec, 3). The
 * header, on both: "Depth N cleared", the risk line (the dive's banked haul and the share a death
 * loses), Hesta's strip on a guided stop, and the finds line, which A or a click opens as a sheet
 * of this floor's finds (an item in it opens the pause on that item). Step 1, while a power-up is
 * on offer: the cards (`StopPanel`, each expanding in place to its picker); A takes, X (or S)
 * skips, but not a guided stop's required one, which holds the step. Step 2: the roads
 * (`DoorPane`); B (or Backspace) goes back to the cards while nothing was taken. Each move between
 * the steps puts the focus on the new step's first control. There is no back at the top level:
 * Esc (or the menu key) and the pad's Menu are its Menu prompt, which opens the pause over it; it
 * is no `[data-pad-menu]`, so Enter with nothing focused never opens the pause. Y does nothing here.
 */
export const StopScreen = memo(function StopScreen({
  dive,
  haul,
  onChoose,
  onExtract,
  onPotion,
  onMenu,
  onInspect,
}: StopScreenProps): ReactElement {
  const registry = getDelveRegistry();
  const biome = registry.getBiomeForDepth(dive.depth);
  const { items, runes } = useFloorFinds();
  const found = haul ? haulRows(registry, haul) : [];
  const materials = found.filter((r) => r.group === 'material' || r.group === 'currency');
  const essences = found.filter((r) => r.group === 'essence');
  const deathLoss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(t);
  }, []);
  const mainRef = useRef<HTMLDivElement>(null);
  const stop = dive.stop;
  const offering = !!stop && !stop.taken;
  // A guided stop's required power-up holds step 1 (the engine refuses a door until it's taken).
  const required = !!stop?.required && !stop.taken;
  /** X's move to the road; B undoes it while nothing was taken. */
  const [skipped, setSkipped] = useState(false);
  const step: 'powerup' | 'road' = offering && !skipped ? 'powerup' : 'road';
  const [findsOpen, setFindsOpen] = useState(false);
  const runeCount = runes.reduce((n, r) => n + r.count, 0);
  const menuKey = useControlsStore((s) => s.config.keys.menu);
  const tutorial = useDelveStore((s) => s.profile.tutorial);

  // A move between the steps (a skip, a take, a back) puts the focus on the new step's first
  // control: the first card, or the first road. The first step's own first focus is the screen's.
  const shown = useRef(step);
  useLayoutEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    mainRef.current?.querySelector<HTMLElement>('[data-pad-first]')?.focus();
  }, [step]);

  const prompts: Prompt[] =
    step === 'powerup'
      ? [
          { id: 'take', label: 'Take', binding: { mouse: 'click', pad: 'a' } },
          {
            id: 'skip',
            label: 'Skip power-up',
            binding: { key: 'KeyS', pad: 'x' },
            onPress: () => setSkipped(true),
            disabled: !armed || required,
            asButton: true,
          },
        ]
      : [
          { id: 'choose', label: 'Choose', binding: { mouse: 'click', pad: 'a' } },
          ...(offering && skipped
            ? [
                {
                  id: 'back',
                  label: 'Power-ups',
                  binding: { key: 'Backspace', pad: 'b' },
                  onPress: () => setSkipped(false),
                  disabled: !armed,
                  asButton: true,
                } satisfies Prompt,
              ]
            : []),
        ];
  // Drawn as the footer's Menu button, not in the prompt bar.
  const menu: Prompt = {
    id: 'menu',
    label: 'Menu',
    binding: { key: menuKey && menuKey !== 'Escape' ? ['Escape', menuKey] : 'Escape', pad: 'menu' },
    onPress: onMenu,
    disabled: !armed,
  };
  usePrompts([...prompts, menu], mainRef);

  const note = stop?.taken ? (
    <span data-testid="stop-taken">Power-up taken.</span>
  ) : skipped ? (
    <span data-testid="stop-skipped">Power-up skipped.</span>
  ) : !stop ? (
    <span data-testid="stop-none">No power-up at this stop.</span>
  ) : null;

  return (
    <Screen
      backdrop="arena-stop"
      headerStyle="bare"
      testId="door-choice"
      header={null}
      footer={
        <Footer prompts={prompts}>
          <Button
            variant="quiet"
            size="sm"
            binding={{ key: 'Escape', pad: 'menu' }}
            onClick={onMenu}
            tabIndex={-1}
            data-pad-skip
          >
            Menu
          </Button>
        </Footer>
      }
    >
      <div ref={mainRef} className="box-border flex h-full flex-col gap-8 px-[72px]" inert={!armed}>
        <div className="flex items-end justify-between gap-6">
          <div className="flex flex-none flex-col gap-[6px]">
            <span className="k-label" style={{ color: 'var(--k-mana)' }}>
              {biome.name}
            </span>
            <h1 className="k-display m-0">Depth {dive.depth} cleared</h1>
            {isBossDepth(registry, dive.depth) && (
              <span className="k-section text-[var(--k-hot-hi)]" data-testid="boss-slain">
                Boss slain · checkpoint at depth {dive.depth + 1}
              </span>
            )}
            <span className="text-[16px] text-[var(--k-text-3)]" data-testid="risk-line" data-tutorial="stop.risk">
              Banked this dive · dying loses {deathLoss}% of it
            </span>
          </div>
          {/* Hesta's strip: a stop's steps only (it gives way when the row is short). */}
          {tutorial && (
            <TutorialPanel state={tutorial} where={SHOWN_AT.stop} place="stop" onEvent={sendTutorial} />
          )}
          <button
            type="button"
            className="k-well flex flex-none items-center gap-3 px-4 py-3 text-[18px] text-[var(--k-text-2)]"
            aria-haspopup="dialog"
            onClick={() => setFindsOpen(true)}
            data-testid="stop-finds"
          >
            {findsSummary({
              bounty: dive.bounty,
              materials: haul ? materialCount(haul) : 0,
              items: items.length,
              runes: runeCount,
              upgrades: countUpgrades(items),
            })}
          </button>
        </div>
        {step === 'powerup' ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4" data-tutorial="stop.powerup" data-testid="stop-powerup">
            {required && (
              <span className="text-[16px] text-[var(--k-hot)]" data-testid="roads-held">
                Take the power-up to go on
              </span>
            )}
            <StopPanel stop={stop!} />
          </div>
        ) : (
          <section aria-label="Choose your road" className="flex min-h-0 flex-1 flex-col gap-4" data-testid="stop-road">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="k-section m-0 text-[26px]">
                {dive.doorChoices.length > 0 ? 'Choose your road' : 'The way home'}
              </h2>
              {note && <span className="text-[16px] text-[var(--k-text-3)]">{note}</span>}
            </div>
            <DoorPane dive={dive} onChoose={onChoose} onExtract={onExtract} onPotion={onPotion} />
          </section>
        )}
      </div>
      {findsOpen && (
        <Dialog title="Found this floor" onClose={() => setFindsOpen(false)} width={640} testId="floor-finds">
          <FindsList
            registry={registry}
            materials={materials}
            essences={essences}
            items={items}
            runes={runes}
            onInspect={(uid) => {
              // The sheet goes first: the pause opens over the stop, never under a dialog.
              setFindsOpen(false);
              onInspect(uid);
            }}
          />
        </Dialog>
      )}
    </Screen>
  );
});
```

  `FindsList` is today's `Panel title="Found this floor"` body moved verbatim into a function component in the same file (the "Nothing found on this floor." caption, `loot-materials`, the `loot-item` buttons inside `ItemTooltip` with `data-uid` and their `MARK`, the essences, `loot-runes`), less the risk line (now in the header), its `onClick` calling the `onInspect` it is given. Type its props from what it uses (`ReturnType<typeof useFloorFinds>['items']` and `['runes']`, `HaulRow[]`, `DataRegistry`). Give it a doc comment: "The finds sheet's list: this floor's materials and currencies grouped, its items newest first with their marks (each opens the pause on it), its essences, then its runes grouped."

  Check against the real kit: the `Dialog` portals to `uiLayer()` and is its own pad scope, so while it is open the stop's prompts are inert and Esc presses its Back (the runtime's fallback), which closes it and gives the focus back to the finds line. `StopPanel`'s `taken()` focuses the next control after its section before step 2 renders; the layout effect then moves the focus to the first road, which is the behaviour the tests pin.

- [ ] **Step 6: Run the stop's tests, then the suite**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve src/pages)`
Expected: types clean; all passing. `StopPanel.test.tsx` passes unchanged (the panel only gained an attribute). If `DelveRun.tutorial.test.tsx`'s stop case fails, read it: its `toStop()` must open on the step its stop says; adjust the assertion, never the component.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): the stop in two steps: one power-up (A takes, X skips), then the road; the finds as one line and a sheet; doors say their cost and gain"
```

---

### Task 3: the E2E answers both steps

**Files:**
- Modify: `packages/client/e2e/fixtures/delve.ts`
- Modify: `packages/client/e2e/delve.spec.ts` (D01, D02, D03, D07, D11)
- Modify: `packages/client/e2e/delve-quests.spec.ts` (Q01)
- Modify: `packages/client/e2e/delve-tutorial.spec.ts` (TU01's stops)

`delve-runes.spec.ts` R03 needs nothing: it takes the rune (step 1), and `stop-taken` shows on step 2.

- [ ] **Step 1: The fixture.** In `e2e/fixtures/delve.ts`, import `expect` (`import { expect, type Page } from '@playwright/test';`) and add:

```ts
/** At a stop: past the power-up (Skip) to the road. Nothing to do when the stop opened there. */
export async function toRoad(page: Page): Promise<void> {
  const stop = page.getByTestId('door-choice');
  if (await stop.getByTestId('stop-powerup').isVisible())
    await stop.getByRole('button', { name: 'Skip power-up' }).click();
  await expect(stop.getByTestId('stop-road')).toBeVisible();
}
```

  (The Skip button is disabled for `ARM_MS` after the stop mounts; Playwright's click waits for it.)

- [ ] **Step 2: The call sites.** Find them: `grep -n "extract-button\|door-list\|bounty\|loot-material\|risk-line\|floor-finds" packages/client/e2e/*.spec.ts`. Then:
  - **D01**: in the `if (await door.isVisible())` branch, replace `expect(page.getByTestId('bounty')).toHaveText(/[1-9]\d*/)` with `await expect(door.getByTestId('stop-finds')).toHaveText(/^[1-9][\d,]* scrap bounty/)`, then `await toRoad(page)` before the Extract click.
  - **D02**: before `door.getByTestId('door-list')…click()`, `await toRoad(page)`.
  - **D07**: `await toRoad(page)` before the Extract click.
  - **D03** is the stop's own walk; replace its body after `startDive(page)` with:

```ts
    const door = page.getByTestId('door-choice');
    await expect(door).toBeVisible({ timeout: FLOOR_CLEAR });
    await expect(door.getByRole('heading', { level: 1 })).toHaveText('Depth 1 cleared');
    await expect(door.getByTestId('risk-line')).toHaveText(
      /^Banked this dive · dying loses \d+% of it$/,
    );
    // Step 1, when the stop offers a power-up: the first card expands in place; Esc presses the
    // picker's Back and the focus returns to the card. Then Skip: the road.
    const stop = door.getByTestId('stop');
    if (await door.getByTestId('stop-powerup').isVisible()) {
      await expect(door.getByTestId('door-list')).toHaveCount(0);
      const card = stop.locator('[data-testid^="stop-"]').first();
      await card.click();
      const picker = stop.getByTestId('stop-picker');
      await expect(picker).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(picker).toBeHidden();
      await expect(card).toBeFocused();
    }
    await toRoad(page);
    // At 1280×720 every road sits in one row on screen, the row unscrolled.
    await page.setViewportSize({ width: 1280, height: 720 });
    const list = door.getByTestId('door-list');
    await expect
      .poll(() => list.evaluate((el) => el.scrollWidth - el.clientWidth))
      .toBeLessThanOrEqual(0);
    const roads = door.getByTestId('stop-road').locator('[data-door], [data-testid="door-potion"]');
    for (let i = 0; i < (await roads.count()); i++) {
      const box = (await roads.nth(i).boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(1280);
      expect(box.y + box.height).toBeLessThanOrEqual(720);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await list.locator('[data-door]').first().click();
    await expect(door).toBeHidden();
    await expect(page.getByTestId('depth-label')).not.toHaveText('DEPTH 1');
    await expect(page.getByTestId('rooms-explored')).toContainText('Rooms explored');
```

  Rename the test "D03: the stop asks for a power-up, then a road, and the road leads to the next depth".
  - **D11**: the floor's materials are in the sheet now: replace `await expect(door.getByTestId('loot-material').first()).toBeVisible();` with

```ts
    await door.getByTestId('stop-finds').click();
    const sheet = page.getByTestId('floor-finds');
    await expect(sheet.getByTestId('loot-material').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
```

    (the sheet is portalled out of `door-choice`: look it up from `page`).
  - **Q01** (`delve-quests.spec.ts`): before `door.getByTestId('door-list')…click()`, `await toRoad(page)`; import it.
  - **TU01** (`delve-tutorial.spec.ts`), stop 1: replace `await expect(roads.first()).toBeDisabled();` and the `extract-button` count check with

```ts
          await expect(door.getByRole('button', { name: 'Skip power-up' })).toBeDisabled();
          await expect(roads).toHaveCount(0);
```

    and after `await expect(door.getByTestId('stop-taken')).toBeVisible();` add `await marked('stop.doors');` and `await expect(door.getByTestId('extract-button')).toHaveCount(0);` (the step's stop doesn't extract), then click the road as now. Stop 2: `await expect(roads.first()).toBeDisabled();` becomes `await expect(roads).toHaveCount(0);`. Stop 3 is unchanged (no power-up: it opens on the road).

- [ ] **Step 3: Run the stop's E2E on one project**

Run: `(cd packages/client && npx playwright test e2e/delve.spec.ts e2e/delve-quests.spec.ts e2e/delve-runes.spec.ts e2e/delve-tutorial.spec.ts --project=desktop)`
Expected: PASS. A long run: give it a 10-minute timeout, or run it in the background and read the report. D02 alone failing on a loaded machine: rerun it alone (`CLAUDE.md`, Room objects).

- [ ] **Step 4: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): the E2E answers the stop's two steps (toRoad), and reads the finds from their sheet"
```
