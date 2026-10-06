# The Materials bench, Temper's list and the kit Stepper Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Forge tab has three benches on LT/RT: Forge, Temper and Materials. Materials holds the bars, flux, shards and essences as rows with Refine on the row, then the shard bench (an affix stepper and Buy) and the rune pouch with Fuse. Temper is one list of the six operations (Upgrade, Reforge, Hone, Imprint, Re-attune, Awaken), each row its price and, when it can't be done, the reason on the same row, beside the item's detail (no stops). The kit gains a `Stepper` (left/right over a list of values, for the pad, the keys and the mouse), which the shard bench uses here and the Forge bench's rows use in plan 05. The Forge tab remembers its bench and the gear row.

**Architecture:** the kit `Stepper` is a focusable `role="spinbutton"` marked `[data-pad-step]`; the gamepad nav's `moveFocus` sends a focused `[data-pad-step]` a `PAD_STEP` event for left/right instead of moving the focus (as it nudges a range or steps a select today); the keys' arrows step it through its own `onKeyDown`; its ◂ ▸ are mouse-only (`data-pad-skip`). `ForgeTab` gains the `materials` bench; `MaterialsPane` leaves both other benches and becomes that bench's three panes. `Temper` returns two panels, its list and its detail. The Forge bench's third column is empty until plan 05 fills it with the preview.

**Why this plan comes before the Forge bench's rows:** moving the Materials pane off the Forge bench first means the forge rows (plan 05) land in a bench whose third column is already free, and every E2E that refines or fuses moves once.

**Tech Stack:** React 19, Zustand, Vitest (jsdom), Playwright; one engine type.

Read `00-overview.md` first. Plans 01 to 03 are done. Spec: section 4, "Materials" and "Temper", with the overview's edits 8 and 11.

**The guided start, checked against `tutorial.json`:**

| Target | Before | After | Steps |
|---|---|---|---|
| `forge.refine:<metal>` | each bar's Refine, beside both benches | the same Refine on the bar's row, on the Materials bench | `l1-refine` (trail `forge.refine:rusty`, highlight `forge.refine`) |
| `forge.refine` | the Bars section | the Bars section on the Materials bench | `l1-refine`'s highlight |
| `forge.materials` | — | the Materials bench's sub tab (new target): `WAY_TO['forge.refine'] = 'forge.materials'`, `WAY_TO['forge.materials'] = 'hub.tab.forge'` | the way to `l1-refine`'s controls |
| `temper.hone` | Temper's "Hone…" | Temper's Hone row | `l2-hone` |
| `temper.line`, `temper.go` | the line pick | unchanged | `l2-hone` |

Without `forge.materials`, `findWay('forge.refine:rusty')` on the Forge bench would walk to the Forge tab (selected: done) and mark nothing. The new target is one string in the engine's `TUTORIAL_TARGETS` (a type list, no data); no step names it, `WAY_TO` does. Every such change re-runs the engine's tutorial tests and the bot (the overview's commands), though no step's play can change.

---

### Task 1: the kit Stepper, and the nav's left/right for it

**Files:**
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts` (`PAD_STEP`)
- Modify: `packages/client/src/features/delve/kit/controls.tsx` (`Stepper`), `kit/types.ts` (`StepperProps`), `kit/index.ts`, `kit/kit.css` (`.k-stepper`)
- Test: `packages/client/src/features/delve/kit/__tests__/controls.test.tsx`, `kit/__tests__/kit-index.test.ts`, `features/gamepad/__tests__/use-gamepad-nav.test.ts`

- [ ] **Step 1: Write the failing tests.** In `controls.test.tsx` (import `Stepper`; `PAD_STEP` from `@/features/gamepad/use-gamepad-nav`):

```tsx
describe('Stepper', () => {
  const OPTIONS = [
    { id: 'none', label: 'None', text: 'None' },
    { id: 'uncommon', label: 'Uncommon ×5', text: 'Uncommon ×5' },
    { id: 'magic', label: 'Magic ×1', text: 'Magic ×1' },
  ] as const;
  type Id = (typeof OPTIONS)[number]['id'];
  function Harness({ start = 'none' as Id, onChange = (_: Id) => {} }) {
    const [value, setValue] = useState<Id>(start);
    return (
      <Stepper
        label="Flux"
        options={[...OPTIONS]}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
        tutorial="forge.flux"
        done={value !== 'none'}
        note="Better flux drops deeper"
        testId="forge-flux"
      />
    );
  }
  const stepper = () => screen.getByTestId('forge-flux');

  it('is one focusable control that says its value; the arrows are the mouse\'s, off the D-pad', () => {
    render(<Harness />);
    expect(stepper()).toHaveAttribute('role', 'spinbutton');
    expect(stepper()).toHaveAttribute('tabindex', '0');
    expect(stepper()).toHaveAttribute('data-pad-step');
    expect(stepper()).toHaveAttribute('aria-valuetext', 'None');
    expect(stepper()).toHaveAccessibleName('Flux');
    for (const b of within(stepper()).getAllByRole('button')) {
      expect(b).toHaveAttribute('tabindex', '-1');
      expect(b.closest('[data-pad-skip]')).not.toBeNull();
    }
    expect(screen.getByText('Better flux drops deeper')).toBeInTheDocument();
  });

  it('steps right and left, clamped at its ends: by the arrow keys, by the pad (PAD_STEP) and by its arrows', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(stepper(), { key: 'ArrowLeft' }); // at the start: nothing
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(stepper(), { key: 'ArrowRight' });
    expect(stepper()).toHaveAttribute('aria-valuetext', 'Uncommon ×5');
    act(() => void stepper().dispatchEvent(new CustomEvent(PAD_STEP, { detail: 1 })));
    expect(stepper()).toHaveAttribute('aria-valuetext', 'Magic ×1');
    act(() => void stepper().dispatchEvent(new CustomEvent(PAD_STEP, { detail: 1 }))); // at the end
    expect(stepper()).toHaveAttribute('aria-valuetext', 'Magic ×1');
    fireEvent.click(within(stepper()).getByRole('button', { name: 'Previous' }));
    expect(stepper()).toHaveAttribute('aria-valuetext', 'Uncommon ×5');
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(['uncommon', 'magic', 'uncommon']);
  });

  it("carries its guided-start target and says it is done from the state its owner gives", () => {
    render(<Harness />);
    expect(stepper()).toHaveAttribute('data-tutorial', 'forge.flux');
    expect(stepper()).toHaveAttribute('data-tutorial-done', 'false');
    fireEvent.keyDown(stepper(), { key: 'ArrowRight' });
    expect(stepper()).toHaveAttribute('data-tutorial-done', 'true');
  });
});
```

  `kit-index.test.ts` lists the kit's exports: add `Stepper`. In `use-gamepad-nav.test.ts` (the harness of plan 01's right-stick test):

```ts
  it('left/right on a focused [data-pad-step] control step it (PAD_STEP), never moving the focus; up and down move on', () => {
    // A button either side of the stepper, which a plain left/right would move to, and one below.
    el('button', {}, document.body, 0, 0);
    const stepper = el('div', { 'data-pad-step': '', tabindex: '0' }, document.body, 20, 0);
    el('button', {}, document.body, 40, 0);
    const below = el('button', {}, document.body, 20, 20);
    const heard: number[] = [];
    stepper.addEventListener(PAD_STEP, (e) => heard.push((e as CustomEvent<number>).detail));
    stepper.focus();
    tap(PAD.right);
    tap(PAD.left);
    expect(heard).toEqual([1, -1]);
    expect(document.activeElement).toBe(stepper);
    tap(PAD.down);
    expect(document.activeElement).toBe(below);
  });
```

  (`PAD` gains `left: 14, down: 13` if it lacks them.)

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/kit src/features/gamepad)`
Expected: FAIL (no `Stepper`, no `PAD_STEP`).

- [ ] **Step 3: Implement.** In `use-gamepad-nav.ts`:

```ts
/**
 * The event a focused `[data-pad-step]` control hears for left/right (`detail`: -1 or 1), in
 * place of a focus move: the kit's `Stepper`.
 */
export const PAD_STEP = 'padstep';
```

  and in `moveFocus`, after the `<select>` case:

```ts
  if (active instanceof HTMLElement && active.matches('[data-pad-step]') && (dir === 'left' || dir === 'right')) {
    active.dispatchEvent(new CustomEvent(PAD_STEP, { detail: dir === 'right' ? 1 : -1 }));
    return;
  }
```

  The header comment's "left/right adjust a focused slider or list" becomes "a slider, a list or a stepper (`PAD_STEP`)". In `kit/types.ts`:

```ts
export interface StepperProps<T extends string> {
  label: string;
  /** In order; `text` is what assistive tech reads (`aria-valuetext`). */
  options: { id: T; label: ReactNode; text: string }[];
  value: T;
  onChange: (id: T) => void;
  /** One line under it: what the save lacks and where it drops. */
  note?: ReactNode;
  /** Its guided-start target (`data-tutorial`), and whether its step is done (`data-tutorial-done`). */
  tutorial?: string;
  done?: boolean;
  testId?: string;
}
```

  In `controls.tsx`:

```tsx
/**
 * One value of several, stepped left and right (the pad-first spec, 4: the Forge's rows): one
 * focusable control (`role="spinbutton"`, `[data-pad-step]`), so the D-pad's left/right step it
 * (`PAD_STEP`) and up/down move on; the arrow keys step it while focused; ◂ ▸ are the mouse's.
 * Clamped at its ends. A guided-start target says it is done by `done`, its owner's state.
 */
export function Stepper<T extends string>({
  label,
  options,
  value,
  onChange,
  note,
  tutorial,
  done,
  testId,
}: StepperProps<T>): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  const step = (d: number) => {
    const next = options[i + d];
    if (next) onChange(next.id);
  };
  const latest = useRef(step);
  latest.current = step;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = (e: Event) => latest.current((e as CustomEvent<number>).detail);
    el.addEventListener(PAD_STEP, on);
    return () => el.removeEventListener(PAD_STEP, on);
  }, []);
  return (
    <div className="k-stepper-row">
      <span className="k-label" aria-hidden>{label}</span>
      <div
        ref={ref}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuetext={options[i]?.text}
        aria-valuenow={i}
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        className="k-stepper"
        data-pad-step=""
        data-tutorial={tutorial}
        data-tutorial-done={done === undefined ? undefined : String(done)}
        data-testid={testId}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          step(e.key === 'ArrowRight' ? 1 : -1);
        }}
      >
        <button type="button" tabIndex={-1} data-pad-skip="" aria-label="Previous" disabled={i === 0} onClick={() => step(-1)} onPointerUp={blurAfterMouse}>
          ◂
        </button>
        <span className="k-stepper-value">{options[i]?.label}</span>
        <button type="button" tabIndex={-1} data-pad-skip="" aria-label="Next" disabled={i === options.length - 1} onClick={() => step(1)} onPointerUp={blurAfterMouse}>
          ▸
        </button>
      </div>
      {note && <span className="k-caption">{note}</span>}
    </div>
  );
}
```

  (`PAD_STEP` from `@/features/gamepad/use-gamepad-nav`: the kit already imports from the gamepad layer.) `kit.css` gains `.k-stepper` (a raised-steel well like `.k-segs`, its value centred between the arrows, a focus ring as the kit's buttons have) and `.k-stepper-row` (a column, the label over the control). Add a Stepper to the dev gallery (`KitGallery.tsx`) beside Segmented. `index.ts` exports `Stepper`.

  The keys' arrows on a focused stepper: the prompt runtime's window listener runs after the element's handler, which `preventDefault`s, so no prompt sees them (`onKeyDown` skips a prevented event).

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/kit src/features/gamepad)`
Expected: PASS.

- [ ] **Step 5: The audit's `next` knows a stepper.** In `e2e/delve-pad-nav.spec.ts`'s `audit`, `next`'s `own` becomes:

```ts
      const own =
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLInputElement && el.type === 'range') ||
        el.matches('[data-pad-step]');
```

  and its comment: "A slider, a list or a stepper takes left/right itself."

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "feat(client): the kit Stepper, stepped by the D-pad's left/right, the arrow keys and the mouse"
```

---

### Task 2: the Materials bench

**Files:**
- Modify (engine): `packages/engine/src/types/tutorial.ts` (`'forge.materials'` after `'forge.temper'`)
- Modify: `packages/client/src/features/delve/hub/forge/ForgeTab.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/MaterialsPane.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/materials-text.ts` (`DROPS_FROM`)
- Modify: `packages/client/src/features/delve/tutorial/marked.ts` (`WAY_TO`)
- Test: `forge/__tests__/ForgeTab.test.tsx`, `forge/__tests__/MaterialsPane.test.tsx`, `tutorial/__tests__/marked-trails.test.ts`

- [ ] **Step 1: The engine's target.** Add `'forge.materials'` to `TUTORIAL_TARGETS` after `'forge.temper'`, then:

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run tests/delve-tutorial-data.test.ts tests/delve-tutorial-contract.test.ts && npx tsup)`
Expected: clean; PASS; the bundle rebuilt. Start the bot in the background now (`(cd packages/engine && npx vitest run tests/delve-tutorial-bot.test.ts)`) and read it before the commit: PASS, as before (no step names the target).

- [ ] **Step 2: Write the failing tests.** `ForgeTab.test.tsx`:
  - The first test becomes "names the three benches' sub tabs for the guided start: forge.bench, forge.temper and forge.materials", adding `expect(screen.getByTestId('bench-materials')).toHaveAttribute('data-tutorial', 'forge.materials')`.
  - "opens on the Forge bench; Temper lists…" no longer finds `materials-pane` on the Forge bench (`expect(screen.queryByTestId('materials-pane')).toBeNull()`), nor on Temper; a new step clicks `bench-materials` and finds `materials-pane`, `shard-bench` and `rune-pouch`, and the pattern list and gear list gone.
  - "the Materials pane's runes fuse three of a rune…" clicks `bench-materials` first.
  - New: "a link opens the Materials bench (`{ tab: 'forge', bench: 'materials' }`)", and "the hub's memory keeps the bench and the gear row":

```tsx
  it("comes back to its bench and its gear row from the hub's memory", () => {
    store().setProfile({ ...store().profile, bag: [item('h1', 'helm'), item('w1', 'weapon')] });
    const memory = {};
    const first = render(<ForgeTab {...props({ memory })} />);
    fireEvent.click(screen.getByTestId('bench-temper'));
    const row = (name: string) => screen.getAllByTestId('temper-row').find((r) => r.textContent!.includes(name))!;
    const helmName = store().profile.bag[0].name;
    fireEvent.click(row(helmName));
    first.unmount();
    render(<ForgeTab {...props({ memory })} />);
    expect(screen.getByTestId('bench-temper')).toHaveAttribute('aria-selected', 'true');
    expect(row(helmName)).toHaveAttribute('aria-pressed', 'true');
    expect(row(helmName)).toHaveAttribute('data-pad-first');
  });
```

  `MaterialsPane.test.tsx`:
  - "keys each bar's Refine by its metal for the guided start (forge.refine), and no other row's" stays.
  - "lists what's held by kind…" stays; add that a row is one line: `within(screen.getByTestId('material-metal-rusty')).getByTestId('refine-metal-rusty')` is in the same row element as the name.
  - "the shard bench sells a tier I shard of the affix picked" becomes:

```tsx
  it('the shard bench steps through every affix and buys a tier I shard of the one shown', () => {
    store().setProfile({ ...store().profile, scrap: 1000, manaDust: 1000 });
    render(<MaterialsPane locked={false} />);
    const affix = screen.getByTestId('bench-affix');
    expect(affix).toHaveAttribute('role', 'spinbutton');
    const first = registry.getDelveData().affixes[0];
    expect(affix).toHaveAttribute('aria-valuetext', affixLabel(registry, first.stat));
    fireEvent.keyDown(affix, { key: 'ArrowRight' });
    const second = registry.getDelveData().affixes[1];
    expect(affix).toHaveAttribute('aria-valuetext', affixLabel(registry, second.stat));
    fireEvent.click(screen.getByTestId('bench-buy'));
    expect(store().profile.materials.shards[second.stat]?.[0]).toBe(1);
    expect(screen.queryAllByTestId(/^bench-affix-/)).toHaveLength(0); // the chips are gone
  });
```

  `marked-trails.test.ts`: "the Forge bench's controls go by its sub tab; the Materials pane's Refine, beside both benches, by the tab alone" becomes "… the Materials bench's Refine by its own sub tab": the page gains `<button id="materials" role="tab" aria-selected="false" data-tutorial="forge.materials"></button>`, and `expect(at(findWay('forge.refine:rusty'))).toEqual(['forge.materials', 'materials'])`; on the Materials bench (its tab `aria-selected="true"`) with no Refine showing, `findWay('forge.refine:rusty')` is null.

- [ ] **Step 3: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge src/features/delve/tutorial/__tests__/marked-trails.test.ts)`
Expected: FAIL.

- [ ] **Step 4: Implement.**
  - `materials-text.ts`:

```ts
/** Where each kind of material comes from: the one line a bench shows for what the save lacks. */
export const DROPS_FROM = {
  metal: 'Foes drop bars: deeper floors drop better metal',
  flux: 'Elites and bosses drop flux: better grades deeper',
  shard: 'Foes drop shards, and salvage gives them',
  essence: 'Bosses drop essences from depth 20',
} as const;
```

    Check the essence line against `balance.json → delve.drops.essenceMinDepth` (20 at v0.62.0): read it from the registry instead of hard-coding if the number differs (`` `Bosses drop essences from depth ${registry.getDelveBalance().drops.essenceMinDepth}` `` as a function). `MaterialsPane`'s "None yet" lines read `DROPS_FROM`.
  - `marked.ts`: `'forge.refine': 'forge.materials'` (its comment: "The Materials bench's Refine.") and `'forge.materials': 'hub.tab.forge'`.
  - `ForgeTab.tsx`: `type Bench` is `ForgeBenchId` from `../types`; the tabs gain `{ id: 'materials', label: 'Materials', testId: 'bench-materials', tutorial: 'forge.materials' }`; the state reads and writes the hub's memory:

```tsx
  const kept = memory?.forge;
  const [selected, setSelected] = useState<string | null>(forgeLink(link)?.uid ?? kept?.uid ?? null);
  const [bench, setBench] = useState<ForgeBenchId>(forgeLink(link) ? benchOf(link) : (kept?.bench ?? 'forge'));
  useEffect(() => {
    if (memory) memory.forge = { bench, uid: selected, baseId: memory.forge?.baseId ?? null };
  }, [memory, bench, selected]);
```

    The grid's children: on `forge`, `<ForgeBench …/>` and an empty third column (plan 05 fills it); on `temper`, `<GearList …/>` and `<Temper …/>` (Task 3's two panels; `ForgeLocked` in the actions panel when locked); on `materials`, `<MaterialsPane locked={locked} />`, which now draws all three columns. The doc comment: "The Forge tab: three benches (a sub tab, LT/RT): Forge (a new item from a pattern), Temper (the gear list, the operations on the picked item, its detail) and Materials (refining, the shard bench, the rune pouch). Its bench and gear row live in the hub's memory; a `{ tab: 'forge', uid, bench }` link picks them."
  - `MaterialsPane.tsx` returns three panels for the bench's three columns: **Materials** (`materials-pane`: the purse in its `aside`, the locked note, Bars (`forge.refine`), Flux, Shards by family, Essences), **Shard bench** (`shard-bench`) and **Runes** (`RunePane` as is: `rune-pouch`, Fuse). `MaterialRow` becomes one line: `flex items-center justify-between gap-3`, the name and count on the left, Refine (or nothing) and its "Needs …" on the right, so a row without a refine is no stop. The shard bench:

```tsx
      <Panel title="Shard bench" testId="shard-bench">
        <p className="k-caption">
          Buy a tier I shard of any affix: <Price scrap={bench.scrap} dust={bench.dust} />
        </p>
        <Stepper
          label="Affix"
          options={affixes.map((a) => ({ id: a.stat, label: affixLabel(registry, a.stat), text: affixLabel(registry, a.stat) }))}
          value={buying}
          onChange={setBuying}
          testId="bench-affix"
        />
        <Button variant="primary" disabled={locked || benchShort} onClick={onBuy} aria-describedby={benchShort && !locked ? `${id}-bench` : undefined} testId="bench-buy">
          Buy {materialLabel(registry, { kind: 'shard', stat: buying, tier: 1 })} · <Price scrap={bench.scrap} dust={bench.dust} />
        </Button>
        {benchShort && !locked && (
          <span id={`${id}-bench`} className="k-caption">Needs <Price scrap={bench.scrap} dust={bench.dust} /></span>
        )}
      </Panel>
```

    with `const [buying, setBuying] = useState<HeroStatKey>(affixes[0].stat)` ("Pick an affix" goes: a stepper always shows one). Its doc comment says the three panels.

- [ ] **Step 5: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge src/features/delve/tutorial)`
Expected: PASS but Task 3's Temper tests.

- [ ] **Step 6: Commit** (after the bot's PASS)

```bash
git add packages/engine/src/types/tutorial.ts packages/client/src/features/delve
git commit -m "feat(client): Materials is the Forge tab's third bench (rows with Refine, the shard bench's stepper, the runes); the tab remembers its bench and gear row"
```

---

### Task 3: Temper as one list

**Files:**
- Modify: `packages/client/src/features/delve/hub/forge/Temper.tsx`
- Modify: `packages/client/src/features/delve/hub/forge/GearList.tsx`
- Test: `packages/client/src/features/delve/hub/forge/__tests__/Temper.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `Temper.test.tsx` add (the file's `bench`, `sword`, `helm` helpers):

```tsx
  it('lists the six operations as rows, each with its price; one it can\'t do is off and says why on its row', () => {
    const lines = [{ stat: 'armor' as const, value: 5, roll: 0.5 }];
    bench(helm('fire', lines), { scrap: 0, manaDust: 0 });
    const rows = screen.getAllByTestId(/^temper-op-/).map((r) => r.dataset.testid);
    expect(rows).toEqual([
      'temper-op-upgrade', 'temper-op-reforge', 'temper-op-hone',
      'temper-op-imprint', 'temper-op-reattune', 'temper-op-awaken',
    ]);
    const item = store().profile.bag[0];
    const op = (id: string) => screen.getByTestId(`temper-op-${id}`);
    const why = (id: string) => document.getElementById(op(id).getAttribute('aria-describedby')!);
    expect(op('upgrade')).toHaveTextContent(`${upgradeCost(registry, item)} scrap`);
    expect(op('upgrade')).toBeDisabled();
    expect(why('upgrade')).toHaveTextContent(`Needs ${upgradeCost(registry, item)} scrap`);
    expect(op('hone')).toHaveTextContent(`${honeCost(registry, item)} scrap`);
    expect(op('reforge')).toHaveTextContent(`${reforgeCost(registry, item)} scrap`);
    // No shard held fits a helm line: Imprint says so.
    expect(why('imprint')).toHaveTextContent('No shard you hold fits a helm');
    // A pair of one element: nothing to re-attune to.
    expect(why('reattune')).toHaveTextContent('Bind a second element first');
    // Not a rare weapon.
    expect(why('awaken')).toHaveTextContent('Only a rare weapon awakens');
    // The reason sits in the row itself, beside its button.
    expect(op('awaken').closest('[data-temper-row]')!.contains(why('awaken'))).toBe(true);
  });

  it("an item with no lines can't Reforge, Hone or Imprint: each row says so", () => {
    bench(helm('fire'), { scrap: 1000 });
    for (const id of ['reforge', 'hone', 'imprint']) {
      const row = screen.getByTestId(`temper-op-${id}`);
      expect(row).toBeDisabled();
      expect(document.getElementById(row.getAttribute('aria-describedby')!)).toHaveTextContent('No lines to work');
    }
  });

  it("the item's detail sits beside the list, with no stops", () => {
    bench(helm('fire', [{ stat: 'armor', value: 5, roll: 0.5 }]));
    const detail = screen.getByTestId('temper-detail');
    expect(detail).toHaveTextContent(store().profile.bag[0].name);
    expect(detail.querySelectorAll('button, [tabindex="0"]')).toHaveLength(0);
    expect(detail.querySelector('[data-pad-scroll]')).not.toBeNull();
  });
```

  The existing tests move to the rows: `upgrade-button` → `temper-op-upgrade`; `reforge-open`, `hone-open`, `imprint-open` → `temper-op-reforge` (and so on; the picks' ids, `<op>-pick`, `<op>-line-<i>`, `<op>-button`, `<op>-back`, stay); `reattune-<mana>` → `temper-op-reattune` when the pair's other element is the one target (a second-bound pair: "re-attunes to the pair's other element for Mana Dust" binds a secondary first, as it does); `awaken-button` → `temper-op-awaken`, `awaken-refused` → the row's reason. "an item with no affixes has no Reforge, Hone or Imprint" is replaced by the second test above. "offers Awaken only on a rare weapon not yet awakened" becomes "Awaken is enabled only on a rare weapon not yet awakened, as the dry run allows; an awakened one says it is". "at the top forge level Upgrade says so" reads the row's reason ("At the top forge level, +N").

  When the item's mana is off the pair, it has two re-attune targets: the rows are `temper-op-reattune-<mana>` each. Assert that in "re-attunes…" with an off-pair helm (`helm('storm')` on a fire/frost pair): two rows.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge/__tests__/Temper.test.tsx)`
Expected: FAIL.

- [ ] **Step 3: Implement.** `Temper` returns two panels (`temper-bench`, the list or the open line pick; `temper-detail`, the item). The list:

```tsx
/** One of Temper's operations: its label and price, and why it can't be done (null: it can). */
interface Op {
  id: string;
  label: string;
  price: ReactNode;
  why: ReactNode | null;
  run: () => void;
  tutorial?: TutorialTarget;
}

  const shardFits = heldShards(registry, profile.materials.shards, item.slot, []).length > 0;
  const lineWhy = (cost: number): ReactNode | null =>
    affixes.length === 0 ? 'No lines to work' : cost > scrap ? <>Needs <Price scrap={cost} /></> : null;
  const ops: Op[] = [
    {
      id: 'upgrade',
      label: 'Upgrade +1',
      price: upCost !== null && <Price scrap={upCost} />,
      why: upCost === null ? `At the top forge level, +${max}` : upShort ? <>Needs <Price scrap={upCost} /></> : null,
      run: onUpgrade,
    },
    { id: 'reforge', label: 'Reforge a line', price: <Price scrap={reforgeCost(registry, item)} />, why: lineWhy(reforgeCost(registry, item)), run: () => open('reforge') },
    { id: 'hone', label: 'Hone a line', price: <Price scrap={honeCost(registry, item)} />, why: lineWhy(honeCost(registry, item)), run: () => open('hone'), tutorial: 'temper.hone' },
    {
      id: 'imprint',
      label: 'Imprint a shard',
      price: <Price scrap={imprintCost(registry, item)} />,
      why: lineWhy(imprintCost(registry, item)) ?? (shardFits ? null : `No shard you hold fits a ${SLOT_LABEL[item.slot].toLowerCase()}`),
      run: () => open('imprint'),
    },
    ...(reattuneTo.length > 0
      ? reattuneTo.map((m) => ({
          id: reattuneTo.length > 1 ? `reattune-${m}` : 'reattune',
          label: `Re-attune to ${manaStyle(registry, m).name}`,
          price: <Price dust={raCost} />,
          why: raCost > dust ? <>Needs <Price dust={raCost} /></> : null,
          run: () => onReattune(m),
        }))
      : [{ id: 'reattune', label: 'Re-attune', price: null, why: 'Bind a second element first', run: () => {} }]),
    {
      id: 'awaken',
      label: 'Awaken',
      price: awakenCost && (
        <>
          {awakenCost.epicFlux} {materialLabel(registry, { kind: 'flux', grade: 'epic' })} · <Price links={awakenCost.links} scrap={awakenCost.scrap} />
        </>
      ),
      why: item.awakened
        ? 'Awakened: it carries the Ultimate'
        : !awakenable
          ? 'Only a rare weapon awakens'
          : awakenTry && !awakenTry.ok
            ? awakenTry.reason
            : null,
      run: onAwaken,
    },
  ];
```

  each drawn as

```tsx
        <div className="flex flex-col gap-2" data-testid="temper-ops">
          {ops.map((o) => (
            <div key={o.id} className="flex items-center gap-3" data-temper-row>
              <Button
                className="flex-1 justify-between"
                disabled={o.why !== null}
                aria-describedby={o.why !== null ? `${id}-${o.id}` : undefined}
                onClick={o.run}
                data-tutorial={o.tutorial}
                testId={`temper-op-${o.id}`}
              >
                <span>{o.label}</span>
                {o.price && <span>{o.price}</span>}
              </Button>
              {o.why !== null && (
                <span id={`${id}-${o.id}`} className="k-caption w-[200px] flex-none" style={{ color: 'var(--k-bad-text)' }}>
                  {o.why}
                </span>
              )}
            </div>
          ))}
        </div>
```

  The line pick (its own pad scope) is unchanged and replaces the list while open. The detail panel:

```tsx
      <Panel aria-label="Item" testId="temper-detail" scroll={false}>
        <div className="k-scroll flex min-h-0 flex-1 flex-col gap-3" data-pad-scroll>
          <ItemHeader item={item} size="lg" />
          <div ref={statsRef}><ItemStatLines item={item} /></div>
          <p className="k-caption">Each forge level adds +{Math.round(upgradeStep * 100)}% to every stat on the item.</p>
          {item.hones > 0 && <p className="k-caption" data-testid="hone-count">Honed {item.hones} {item.hones === 1 ? 'time' : 'times'}: each hone costs more.</p>}
          {item.awakened && <p className="k-caption" data-testid="awakened">Awakened: it carries the Ultimate.</p>}
        </div>
      </Panel>
```

  (`hone-count` moves from the hone pick to the detail; "Hone's picker carries the guided start's trail…" and "hones a line through the engine…" read it there.) Check `ItemHeader` and `ItemStatLines` hold no focusable control (the test above checks it); if one does (a tooltip trigger), give it `tabIndex={-1}` in this use or wrap the panel in `data-pad-skip`.

  `GearList.tsx`: the chips' row gains `data-pad-skip` (the mouse's; the D-pad walks the rows: overview edit 8), and the selected row `data-pad-first`. Its doc comment says so.

  The doc comment of `Temper`: "The Temper bench on the picked item: one list of its six operations (Upgrade +1, Reforge, Hone and Imprint a line, Re-attune to the pair's other element, Awaken a rare weapon once), each row with the engine's price and, when it can't be done, why on the same row; Reforge, Hone and Imprint open a line pick in its own pad scope. Beside it, the item's detail (no stops)."

- [ ] **Step 4: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/forge)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/hub/forge
git commit -m "feat(client): Temper is one list of six operations, each row its price and its reason, beside the item's detail"
```

---

### Task 4: the E2E that refine, fuse or temper

**Files:**
- Modify: `packages/client/e2e/delve-runes.spec.ts` (R04), `delve.spec.ts` (D10's last check), `delve-tutorial.spec.ts` (TU01's `l1-refine`), `e2e/responsive/specs/delve-anvil.spec.ts` (the Temper probe; a Materials probe)
- Read: `delve.spec.ts` line 293 (`bench-temper`, then `temper-row` ×2: unchanged)

- [ ] **Step 1: R04.** After `await page.getByTestId('tab-forge').click();` add `await page.getByTestId('bench-materials').click();`.
- [ ] **Step 2: D10.** Its `material-metal-rusty` check moves after `await page.getByTestId('bench-materials').click();` (plan 05 replaces this test's bench steps; this line stays as rewritten here).
- [ ] **Step 3: TU01's refine.** Its block becomes:

```ts
    if ((await step(page)) === 'l1-refine') {
      await page.getByTestId('tab-forge').click();
      // The Materials bench is the way to the refine: its sub tab is marked first.
      await marked('forge.materials');
      await page.getByTestId('bench-materials').click();
      await marked('forge.refine:rusty');
      await page.getByTestId('refine-metal-rusty').click();
    }
```

- [ ] **Step 4: The responsive Anvil spec.** The `temper` probe is unchanged (it opens `bench-temper` and waits for `temper`: keep `temper` as the actions panel's inner test id, or wait for `temper-ops`). Add `'materials'` to the loop: `await page.getByTestId('bench-materials').click(); await expect(page.getByTestId('materials-pane')).toBeVisible();`, probing `delve-anvil-materials`.

- [ ] **Step 5: Run them**

Run: `(cd packages/client && npx playwright test e2e/delve-runes.spec.ts e2e/delve.spec.ts e2e/delve-tutorial.spec.ts --project=desktop && npx playwright test --project=responsive e2e/responsive/specs/delve-anvil.spec.ts)`
Expected: PASS. An overflow at 1280×720 on the Temper rows (the reason column) is the layout's: let the reason wrap under the button there (`[@media(max-height:809px)]:flex-col`), not the probe's threshold.

- [ ] **Step 6: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): refining and fusing on the Materials bench; the marker's way to the refine"
```
