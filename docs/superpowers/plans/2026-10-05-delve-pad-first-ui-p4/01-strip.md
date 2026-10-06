# The skill strip Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Skills tab's left pane goes. The four skills are a strip across the top, a kit sub `Tabs` that LT/RT step (off the D-pad), each tab its name and one line (its moves of its slots and its payment, or, dimmed, what carries it); no combat glyph labels a skill (grammar rule 4). The mana pair and its Realign sit at the strip's right end. Under the strip, the chain lane (now carrying the chosen skill's summary line) and the move pane. The chosen card carries `data-pad-first` and a focused card is the chosen one, so LB/RB into Skills, and LT/RT, land the pad on the chain.

**Architecture:** `SkillStrip.tsx` replaces `SkillList.tsx` (its `skillBinding` export has no other user: check with `grep -rn skillBinding packages/client/src`; if one exists, move the function into that file instead of deleting it). `SkillsTab` lays out two rows: the strip, then a two-column grid (the lane, the 500 px pane). The pane (`MoveInspector`, or the Mana view) is untouched here; plan 02 rebuilds it.

**Tech Stack:** React 19, Vitest (jsdom), Playwright.

Read `00-overview.md` first.

---

### Task 1: the strip

**Files:**
- Create: `packages/client/src/features/delve/hub/skills/SkillStrip.tsx`
- Delete: `packages/client/src/features/delve/hub/skills/SkillList.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/SkillsTab.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/harness.tsx`
- Test: `packages/client/src/features/delve/hub/skills/__tests__/SkillStrip.test.tsx` (new)

- [ ] **Step 1: Write the failing test.**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { carriedByText, defaultMoveset, type ChainSkill } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { renderSkills } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const tab = (s: ChainSkill) => screen.getByTestId(`chain-skill-${s}`);

/** The starting sword made epic (all four skills), its chains at five slots. */
function roomy() {
  const p = store().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const moveset = defaultMoveset(registry, weapon, 'fire', { basic: 3, primary: 4, defensive: 1, ultimate: 1 });
  const slots = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
  store().setProfile({ ...p, equipped: { ...p.equipped, weapon: { ...weapon, moveset: { chains: moveset.chains, slots } } } });
}

describe('the skill strip', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it("is a kit sub tab list, off the D-pad, each skill its moves of its slots and its payment, and no combat glyph", () => {
    roomy();
    renderSkills();
    const strip = screen.getByTestId('skill-strip');
    const list = within(strip).getByRole('tablist');
    expect(list).toHaveAttribute('data-pad-tabs', 'sub');
    expect(list).toHaveAttribute('data-pad-skip');
    expect(within(list).getAllByRole('tab').map((t) => t.dataset.testid)).toEqual([
      'chain-skill-basic',
      'chain-skill-primary',
      'chain-skill-defensive',
      'chain-skill-ultimate',
    ]);
    // The tab says the chain's size and payment; it never names the skill's fight input (Q, RT…).
    expect(tab('primary').textContent).toMatch(/^Primary\s*4 of 5 · mana$/);
    expect(tab('basic').textContent).toMatch(/^Basic\s*3 of 5 · free$/);
  });

  it("an uncarried skill is a dimmed tab whose line says what carries it; it can still be chosen", () => {
    renderSkills(); // the new save's common sword: the Basic alone
    for (const s of ['primary', 'defensive', 'ultimate'] as const) {
      const line = within(tab(s)).getByText(carriedByText(registry, s));
      expect(line).toHaveAttribute('data-absent');
      expect(tab(s)).toBeEnabled();
      fireEvent.click(tab(s));
      expect(tab(s)).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('abilities-summary')).toHaveTextContent(carriedByText(registry, s));
    }
  });

  it('holds the mana pair, whose Realign opens the Mana view in the pane', () => {
    store().setProfile(armed(store().profile));
    renderSkills();
    const pair = within(screen.getByTestId('skill-strip')).getByTestId('mana-pair');
    expect(pair).toHaveTextContent('Fire · 2');
    fireEvent.click(within(pair).getByTestId('mana-realign'));
    expect(screen.getByTestId('mana-view')).toBeInTheDocument();
  });

  it('the chosen card carries data-pad-first, and focusing a card chooses it', () => {
    roomy();
    renderSkills();
    expect(screen.getByTestId('move-0')).toHaveAttribute('data-pad-first');
    fireEvent.focus(screen.getByTestId('move-2'));
    expect(screen.getByTestId('move-2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('move-2')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('move-0')).not.toHaveAttribute('data-pad-first');
  });
});
```

  The `5 of 5` / `of 5` text is `caps[s]` from `useAnvilChains` (the weapon's slots), as the old list showed it. `armed` makes the sword uncommon (it carries the Primary); `Fire · 2` is the mana box's existing text (copied from the old test).

- [ ] **Step 2: Run it**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillStrip.test.tsx)`
Expected: FAIL (`skill-strip` not found).

- [ ] **Step 3: `SkillStrip.tsx`.**

```tsx
import { CHAIN_SKILLS, movesOf, overtakeProgress, type HeroStats } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { Button, Glyph, Tabs } from '@/features/delve/kit';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME } from '../../chains/chain-text';
import type { ChainEditorModel } from '../../chains/useChainEditor';
import type { AnvilChains } from './useAnvilChains';

/**
 * The Skills tab's strip (the pad-first spec, 5): the four skills as a kit sub tab list (LT/RT,
 * `[` `]`; off the D-pad), each its name and one line, its moves of its slots and its payment, or,
 * dimmed, what carries it; then the mana pair, whose Realign opens the Mana view. No skill shows
 * its fight input: a combat glyph never labels a menu control (the grammar, rule 4).
 */
export function SkillStrip({
  ed,
  anvil,
  onMana,
}: {
  ed: ChainEditorModel;
  anvil: AnvilChains;
  onMana: () => void;
}) {
  const { chains, caps, absentText } = anvil.editor;
  return (
    <div className="flex flex-none items-center gap-6" data-testid="skill-strip">
      <Tabs
        aria-label="Skills"
        level="sub"
        glyphs
        value={ed.skill}
        onChange={ed.pick}
        tabs={CHAIN_SKILLS.map((s) => {
          const chain = chains[s];
          const n = chain ? movesOf(chain).length : 0;
          return {
            id: s,
            testId: `chain-skill-${s}`,
            tutorial: s === 'primary' ? 'skills.primary' : undefined,
            label: (
              <span className="flex flex-col items-start leading-tight">
                <span>{SKILL_NAME[s]}</span>
                {chain ? (
                  <span className="k-caption">
                    {n} of {caps[s]} · {s === 'basic' ? 'free' : chains[s]!.payment}
                  </span>
                ) : (
                  <span className="k-caption opacity-60" data-absent="">
                    {absentText?.(s)}
                  </span>
                )}
              </span>
            ),
          };
        })}
      />
      <ManaPair stats={anvil.editor.stats} onMana={onMana} />
    </div>
  );
}
```

  Move `ManaPair` over from `SkillList.tsx` unchanged but for its frame: drop `mt-auto` and lay it as one row (`flex items-center gap-3`: the two element wells, the overtake and reaction line as `k-caption`, then Realign); keep `data-testid="mana-pair"`, `mana-realign` and `data-tutorial="skills.mana"`. If the kit `Tabs` sets its tab text with `white-space: nowrap` and the carried-by line pushes the strip past the pane's width at 1280×800, give the line `max-w-[220px] whitespace-normal` rather than shortening the engine's text.

- [ ] **Step 4: `SkillsTab`'s layout.** Replace the three-column grid:

```tsx
    <div ref={root} className="flex h-full min-h-0 flex-col gap-5 px-8 py-6" data-testid="abilities-panel">
      <SkillStrip ed={ed} anvil={anvil} onMana={() => setMana(true)} />
      <div className="grid min-h-0 flex-1 gap-6" style={{ gridTemplateColumns: 'minmax(0, 1fr) 500px' }}>
        <ChainLane ed={ed} anvil={anvil} carrying={carry !== null} />
        {mana ? (
          <ManaPanel stats={anvil.editor.stats} onBack={() => setMana(false)} />
        ) : (
          <MoveInspector ed={ed} anvil={anvil} />
        )}
      </div>
    </div>
```

  Drop the `SkillList` import. The prompts keep their shape in this plan (plan 03 rebuilds them): only the `select` prompt's label, "Select move", stays.

- [ ] **Step 5: The harness.** In `harness.tsx`, `Panes` draws `<SkillStrip ed={ed} anvil={anvil} onMana={() => {}} />` in place of `SkillList`.

- [ ] **Step 6: Run it** — Expected: still FAIL on the last test (the cards). Go on to Task 2 before committing.

---

### Task 2: the chain lane's summary, its first card and focus

**Files:**
- Modify: `packages/client/src/features/delve/hub/skills/ChainLane.tsx`

- [ ] **Step 1: The summary line.** Under the lane's heading row add the chosen skill's line, the one the list row showed:

```tsx
      <p className="k-caption m-0" data-testid="abilities-summary">
        {absent ? absentText?.(skill) : chainText(names)}
      </p>
```

  (`chainText` from `../../chains/chain-text`; `names` is `ed.names`.) The absent block under it (the lock and the text) goes: the summary says it. Keep `abilities-locked` (mid-dive) as it is.

- [ ] **Step 2: The card.** On the card button (`data-testid={`move-${i}`}`) add

```tsx
                  data-pad-first={on ? '' : undefined}
                  onFocus={() => ed.select(i)}
```

  `ed.select` clears the open rune picker when the move changes, as a click did.

- [ ] **Step 3: Run the strip's test**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills/__tests__/SkillStrip.test.tsx)`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/delve/hub/skills
git commit -m "feat(client): the Skills tab's strip: the four skills on LT/RT with no combat glyph, the mana pair beside them; the chosen card leads the pad"
```

  Before it: `(cd packages/client && npx vitest related --run src/features/delve/hub/skills/SkillStrip.tsx src/features/delve/hub/skills/SkillsTab.tsx src/features/delve/hub/skills/ChainLane.tsx)`. Its failures are Task 3's to fix; commit after Task 3 if any test fails here.

---

### Task 3: the tests that read the list

**Files:**
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.chains.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/SkillsTab.test.tsx`
- Modify: `packages/client/src/features/delve/hub/skills/__tests__/ManaView.test.tsx` (only if it fails)

- [ ] **Step 1: What changes, test by test.**
  - `SkillsTab.chains.test.tsx` › "lists the four skills, Basic first…": unchanged but for `getAllByRole('tab')`, which now also finds nothing else (the harness has no hub tabs); keep it.
  - › "a new hero's common sword carries Basic alone; the others show locked…": `toHaveTextContent('Locked')` on the tab becomes `toHaveTextContent(text)` (the tab's own line now says what carries it); the summary assertions stay.
  - › "unarmed, the default chains show at their base slots": `'Locked'` becomes the skill's `carriedByText` (read it from the engine, as the strip test does).
  - `SkillsTab.test.tsx` › "draws its prompts in the hub's footer": unchanged in this plan.
  - `ManaView.test.tsx` › "opens from the mana pair's Realign as its own pad scope; Back returns to the move": unchanged (the Realign kept its id). If it reads the pair box by position, read it by `mana-pair`.
- [ ] **Step 2: Run them**

Run: `(cd packages/client && npx vitest run src/features/delve/hub/skills)`
Expected: PASS.

- [ ] **Step 3: Commit** (with Task 2's work if it waited)

```bash
git add packages/client/src/features/delve/hub/skills
git commit -m "test(client): the Skills tests read the strip: an uncarried skill's tab says what carries it"
```

---

### Task 4: the E2E that start from a list row

The list rows were D-pad stops; the strip's tabs are not, so the pad now lands on the chosen card.

**Files:**
- Modify: `packages/client/e2e/delve-pad-nav.spec.ts` (PN03)
- Modify: `packages/client/e2e/delve-gamepad.spec.ts` (G06, G07)

- [ ] **Step 1: PN03** becomes the strip and the chain (plan 02 adds the editor):

```ts
  test('PN03: Skills: RB lands on the chosen card; up to the strip\'s Realign, down to the footer, and straight back', async ({ page }) => {
    await seed(page);
    await page.goto('/delve');
    await tap(page, BUTTON.rb);
    await expect(page.getByTestId('tab-skills')).toHaveAttribute('aria-selected', 'true');
    // LB/RB never leave the focus on a tab: the chosen card leads.
    expect((await where(page)).tab).toBe(false);
    await expect(page.locator('[data-testid^="move-"][data-pad-first]')).toBeFocused();
    await leave(page, 'up', 'card');
    expect((await where(page)).id).toBe('mana-realign');
    await back(page, 'down', 'card');
    await leave(page, 'down', 'card');
    expect((await where(page)).foot).toBe(true);
    await back(page, 'up', 'card');
  });
```

  If `leave(page, 'up', …)` from a card reaches the strip's Realign only past the lane's heading (no control there, so it should not), and lands elsewhere, read where with `NAV_REPORT=1` before changing the layout: the strip is a `data-pad-group` of one control, so up from any card's column must find it.

- [ ] **Step 2: G06's head.** After `await tap(page, BUTTON.rb)` the focus is on `move-0` (the Primary's chosen card), and LT keeps it there (the card survives the switch):

```ts
    await expect(page.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('move-0')).toBeFocused();
    await tap(page, BUTTON.lt);
    const basic = page.getByTestId('chain-skill-basic');
    await expect(basic).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('move-0')).toBeFocused();
    await tap(page, BUTTON.rt);
    await expect(page.getByTestId('chain-skill-primary')).toHaveAttribute('aria-selected', 'true');
    await tap(page, BUTTON.lt);
    await expect(basic).toHaveAttribute('aria-selected', 'true');
    // Along the chain's cards.
    await tap(page, BUTTON.right);
    await expect(page.getByTestId('move-1')).toBeFocused();
```

  The rest of G06 (A, the kind radios, Apply) stays until plan 02.

- [ ] **Step 3: G07's head.** Replace "LT / RT step the skill list…, focusing its row" and "From the row, right to the Primary's card's one open socket" with: after RB, `await expect(page.getByTestId('move-0')).toBeFocused();`, then define `padTo` before its first use and `await padTo('socket-0');` (the socket pip under the card is still a stop in this plan; plan 02 rewrites G07 on the editor).

- [ ] **Step 4: Run the plan's specs.** (If the same agent does plan 02 next, skip this step: plan 02's last task runs these with its own.)

```bash
(cd packages/client && npx tsc --noEmit -p . && npx vitest run > "$SCRATCH/unit-01.txt" 2>&1; tail -n 15 "$SCRATCH/unit-01.txt")
(cd packages/client && npx playwright test e2e/delve-pad-nav.spec.ts e2e/delve-gamepad.spec.ts e2e/delve.spec.ts --project=desktop --project=desktop-1080 --reporter=line > "$SCRATCH/e2e-01.txt" 2>&1; tail -n 30 "$SCRATCH/e2e-01.txt")
```

  Expected: the full unit suite at the baseline count plus `SkillStrip.test.tsx`, all passing; the three specs PASS. `desktop-1080` and the pad audit run here because the layout and the stops changed. `delve.spec.ts` covers D04 (the Mana view from the Loadout's strip) and D08 (the uncarried skills' summary). PN01's `skills` screen may now count fewer stops and fewer unreversed moves: lowering `ALLOW.skills` is plan 06's; a rise above `[2, 4]` is a layout bug to fix here.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e
git commit -m "test(client): PN03, G06 and G07 start from the chosen card: the strip's tabs are off the D-pad"
```
