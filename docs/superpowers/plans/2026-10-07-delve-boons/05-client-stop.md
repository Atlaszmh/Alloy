# Delve boons · C1: the stop screen — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `boons` stop's step 1 shows three boon cards (`BoonCards`, `stop-boon`): each a kit plate with its family's colour on its edge, its tier mark (I / II / III in the common, rare and epic colours), the name, the tier's line and, when worn, "Taken n of cap". A click, A or Enter takes it; X or S skips to the road; Menu opens the pause. A `powerups` stop (the guided start's) shows `StopPanel` as today. The first-visit line reads "Take a boon" on a boons stop (seen key `stop`). The kit gallery shows a `BoonCard` per tier.

**Architecture:** Two new files in `features/delve/stop/`: `boon-style.ts` (`BOON_STYLE`, each family's ENDESGA 32 colour and name) and `BoonCards.tsx` (`BoonCard`, presentational, and `BoonCards`, which reads the registry and takes through the store's `takeStop`). `StopScreen` branches its step 1 on `stop.kind` and words its Skip, Back and notes by it. The store's `takeStop` already passes any `StopAction` to the engine, so the contract's `{ kind: 'boon'; index }` needs no store code; only its comment changes, and its test waits for B1 (Task 5). Every client test here drives the store with a stubbed `takeStop` where it needs a take to succeed, since in Phase A the engine refuses the boon action.

**Tech Stack:** TypeScript 5.7, React 19, Zustand 5, Vitest 3 + Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-delve-boons-design.md` §6 (the stop) and §7 (client and E2E tests). Overview and contract: `00-overview.md`.

---

## Base

- **Starts from:** `boons/main` with Phase A merged, in the worktree `C:/Projects/alloy-boons-c1` on branch `boons/c1`:

```bash
cd /c/Projects/Alloy && git worktree add ../alloy-boons-c1 -b boons/c1 boons/main
```

  Every path below is relative to that worktree's root (`/c/Projects/alloy-boons-c1` in Git Bash).
- **Before Task 1:** build the engine (the client reads its bundle) and run the stop's tests as they stand:

```bash
cd /c/Projects/alloy-boons-c1
(cd packages/engine && npx tsup)
(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/stop src/features/delve/__tests__/StopPanel.test.tsx src/features/delve/__tests__/onboarding.test.ts src/features/delve/kit/__tests__/KitGallery.test.tsx --reporter=dot)
```

  Expected: no type errors; every test passes.
- **No engine change**, so no engine suite, pacing or fingerprint here.

## What this plan assumes Phase A left (confirmed with A's drafter)

- `@alloy/engine` exports `BOON_FAMILIES`, `BOON_TIER_NAMES` (`['common', 'rare', 'epic']`), the types `BoonFamily`, `BoonTierIndex`, `BoonOffer`, `Buff`, `BoonStop` (`Extract<DiveStop, { kind: 'boons' }>`) and `PowerupStop` (`Extract<DiveStop, { kind: 'powerups' }>`), `boonCount(buffs, id)` and `registry.getBoon(id)`.
- `StopAction` includes `{ kind: 'boon'; index: number }`; Phase A's `takeStop` refuses it ("Not offered at this stop"). B1 makes it push `{ boon, tier, effect }` onto `DiveState.diveBuffs` and mark the stop taken.
- The overview's pinned selectors: the step `data-testid="stop-boon"`, each card a button with `data-boon={id}` and `data-tier={1|2|3}` (this plan adds `data-testid="boon-card"` and `data-family` beside them); boon ids are lower kebab case (`keen-edge`), the shrine rows' single words (`vigor`) unchanged.
- `boons.json` holds at least the six shrine rows (`vigor` offense, `renewal` defense, `clarity` tempo, `fortune` and `mercy` fortune, `devotion` offense), `cap` 1. The tests below read names and lines from the registry, so B1's rows change nothing here.
- A added `kind: 'powerups'` to every client stop literal (the tests' `atStop` helpers, `FloorDialogs.tsx`, `delveStore.test.ts`, the E2E fixtures), typed `StopPanel`'s `stop` prop `PowerupStop`, and narrowed `StopScreen` to `const stop = dive.stop?.kind === 'powerups' ? dive.stop : null;` under the comment `// The power-up cards (a boons stop's cards are the boons spec's C1; until then it goes to the road).` (`01-contract.md` Task 10), so a boons stop goes to the road. Task 3 anchors on those lines; the rest of `StopScreen` is as on `main`.
- `registry.getBoon(id)` returns `BoonDef | undefined` (`01-contract.md`, decision 5): `BoonCards` renders nothing for an offer with no row; the toast and tests use `getBoon(id)!`.

## Files

| File | Change |
|---|---|
| `packages/client/src/features/delve/stop/boon-style.ts` (new) | `BOON_STYLE` (Task 1) |
| `packages/client/src/features/delve/stop/BoonCards.tsx` (new) | `BoonCard`, `BoonCards` (Task 1, Task 2) |
| `packages/client/src/features/delve/stop/__tests__/BoonCards.test.tsx` (new) | the cards, the take, a refusal (Task 1, Task 2) |
| `packages/client/src/features/delve/onboarding.ts` | `BOON_HINT` (Task 3) |
| `packages/client/src/features/delve/stop/StopScreen.tsx` | step 1 by the stop's kind; Skip, Back, notes and the hint by it (Task 3) |
| `packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx` | a boons stop's step 1, skip, back, take, hint (Task 3) |
| `packages/client/src/features/delve/kit/KitGallery.tsx`, `kit/__tests__/KitGallery.test.tsx` | a `BoonCard` per tier (Task 4) |
| `packages/client/src/stores/delveStore.ts`, `src/stores/delveStore.test.ts` | the comment; a boon take through the store (Task 5, the test run in Phase D) |
| `packages/client/e2e/fixtures/delve.ts`, `e2e/delve-pad-nav.spec.ts` | `toRoad` either kind; PN06 on the boon step (Task 6, run in Phase D) |
| `packages/client/src/features/delve/stop/DoorPane.tsx` | `doorTerms`'s boon line (Task 7) |

## Where the spec left room

1. **The family colours** (ENDESGA 32): offense `#e43b44` red, element `#b55088` violet (the palette's nearest; the epic tier mark uses `RARITY_TEXT.epic`, `#d7a6e8`, so the two don't read alike), defense `#8b9bb4` steel blue, tempo `#feae34` amber, fortune `#fee761` gold, pact `#a22633` crimson, floor `#3e8948` green. The colour is the edge only; the family's name above the title is in `--k-text-3` (crimson and green fail contrast as text on the plate).
2. **The tier mark** is `TIER_NUMERAL` (runes' I–V map) in `RARITY_TEXT[BOON_TIER_NAMES[tier − 1]]`.
3. **Words by kind:** Skip reads "Skip boon" / "Skip power-up", the road's way back "Boons" / "Power-ups", the notes "Boon taken." / "Power-up taken." and "Boon skipped." / "Power-up skipped."; "No power-up at this stop." (a null stop) is unchanged.
4. **The hint:** `BOON_HINT` beside `ONBOARDING` ("Take a boon: it lasts the dive. Then choose your road: deeper, or home with the haul."); `StopScreen` swaps it in for `ONBOARDING.stop` on a boons stop, so the seen key stays `stop`. A boon taken marks `stop` seen, as a power-up does.
5. **After a take** the stop is taken, `StopScreen`'s step goes to the road and its layout effect focuses the first road (as for a power-up); `BoonCards` moves no focus itself. A refusal plays `combineFail` and shows the engine's reason under the cards (`boon-refused`).
6. **The store** needs no code: `takeStop(action: StopAction)` forwards to the engine, and its `equip` branch narrows on `action.kind`. Its doc comment names boons.

## Conventions

The overview's. One commit a task on `boons/c1`, staged by path, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; don't push or merge. Keep each file's line endings (new files LF); Prettier only as `npx prettier --end-of-line auto`. "Replace: … with: …" is one Edit; within a file apply edits top to bottom.

**Commands** (from the worktree root):

| What | Command |
|---|---|
| Typecheck and some client tests | `(cd packages/client && npx tsc --noEmit -p . && npx vitest run <files> --reporter=dot)` |

---

## Task 1: The family style and a boon card

**Files:** create `stop/boon-style.ts`, `stop/BoonCards.tsx`, `stop/__tests__/BoonCards.test.tsx`.

- [ ] **Step 1: The failing test.** Create `packages/client/src/features/delve/stop/__tests__/BoonCards.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RARITY_TEXT } from '../../format';
import { BOON_STYLE } from '../boon-style';
import { BoonCard } from '../BoonCards';

// The boons spec, 6: a card's family edge, its tier mark, the name, the tier's line, the taken count.

describe('a boon card', () => {
  it('shows its family on its edge, its tier mark in the tier colour, the name and the line', () => {
    const onTake = vi.fn();
    render(
      <BoonCard
        id="glass-cannon"
        family="pact"
        tier={3}
        name="Glass Cannon"
        text="+45% damage, −20% max life"
        count={0}
        cap={2}
        first
        onTake={onTake}
      />,
    );
    const card = screen.getByTestId('boon-card');
    expect(card.tagName).toBe('BUTTON');
    expect(card).toHaveAttribute('data-boon', 'glass-cannon');
    expect(card).toHaveAttribute('data-family', 'pact');
    expect(card).toHaveAttribute('data-tier', '3');
    expect(card).toHaveAttribute('data-pad-first');
    expect(card.querySelector<HTMLElement>('[data-boon-edge]')!.style.background).toBe(
      'rgb(162, 38, 51)', // #a22633
    );
    expect(BOON_STYLE.pact.color).toBe('#a22633');
    const mark = card.querySelector<HTMLElement>('[data-boon-tier]')!;
    expect(mark).toHaveTextContent('III');
    expect(mark.style.color).toBe('rgb(215, 166, 232)'); // RARITY_TEXT.epic
    expect(RARITY_TEXT.epic).toBe('#d7a6e8');
    expect(card).toHaveTextContent('Pact');
    expect(card).toHaveTextContent('Glass Cannon');
    expect(card).toHaveTextContent('+45% damage, −20% max life');
    expect(screen.queryByTestId('boon-taken')).toBeNull();
    fireEvent.click(card);
    expect(onTake).toHaveBeenCalledOnce();
  });

  it('says how many of it are worn, against its cap, once one is', () => {
    render(
      <BoonCard id="keen-edge" family="offense" tier={1} name="Keen Edge" text="+10% damage" count={2} cap={3} onTake={() => {}} />,
    );
    expect(screen.getByTestId('boon-taken')).toHaveTextContent('Taken 2 of 3');
    expect(screen.getByTestId('boon-card')).not.toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('boon-card').querySelector('[data-boon-tier]')).toHaveTextContent('I');
  });
});
```

- [ ] **Step 2: Run it.** `(cd packages/client && npx vitest run src/features/delve/stop/__tests__/BoonCards.test.tsx --reporter=dot)` → FAIL (cannot resolve `../boon-style`).

- [ ] **Step 3: Implement.** Create `packages/client/src/features/delve/stop/boon-style.ts`:

```ts
import type { BoonFamily } from '@alloy/engine';

/**
 * Each boon family's colour (a stop card's edge; the HUD's boon tile) and name, in ENDESGA 32:
 * offense red, element violet, defense steel blue, tempo amber, fortune gold, pact crimson,
 * floor green.
 */
export const BOON_STYLE: Record<BoonFamily, { color: string; label: string }> = {
  offense: { color: '#e43b44', label: 'Offense' },
  element: { color: '#b55088', label: 'Element' },
  defense: { color: '#8b9bb4', label: 'Defense' },
  tempo: { color: '#feae34', label: 'Tempo' },
  fortune: { color: '#fee761', label: 'Fortune' },
  pact: { color: '#a22633', label: 'Pact' },
  floor: { color: '#3e8948', label: 'Floor' },
};
```

Create `packages/client/src/features/delve/stop/BoonCards.tsx`:

```tsx
import type { ReactElement } from 'react';
import { BOON_TIER_NAMES, type BoonFamily, type BoonTierIndex } from '@alloy/engine';
import { RARITY_TEXT } from '../format';
import { TIER_NUMERAL } from '../runes/rune-style';
import { BOON_STYLE } from './boon-style';

export interface BoonCardProps {
  /** The boon's id (the card's `data-boon`). */
  id: string;
  family: BoonFamily;
  tier: BoonTierIndex;
  name: string;
  /** The tier's whole card line, from the data. */
  text: string;
  /** How many of this boon the dive wears (its entries in `diveBuffs`). */
  count: number;
  cap: number;
  /** The step's first focus. */
  first?: boolean;
  onTake: () => void;
}

/**
 * One boon on offer (the boons spec, 6): a plate with its family's colour on its edge, the
 * family's name and the tier mark (I / II / III in the common, rare and epic colours), the name,
 * the tier's line and, once one is worn, "Taken n of cap". Presentational: the kit gallery shows it too.
 */
export function BoonCard({
  id,
  family,
  tier,
  name,
  text,
  count,
  cap,
  first,
  onTake,
}: BoonCardProps): ReactElement {
  const { color, label } = BOON_STYLE[family];
  return (
    <button
      type="button"
      className="k-plate relative flex flex-col gap-[14px] p-6 pl-8 text-left text-[var(--k-text)]"
      onClick={onTake}
      data-pad-first={first || undefined}
      data-primary-action={first ? 'boon' : undefined}
      data-boon={id}
      data-family={family}
      data-tier={tier}
      data-testid="boon-card"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[6px]" style={{ background: color }} data-boon-edge />
      <span className="flex items-baseline justify-between gap-3">
        <span className="k-label text-[var(--k-text-3)]">{label}</span>
        <span className="k-label" style={{ color: RARITY_TEXT[BOON_TIER_NAMES[tier - 1]] }} data-boon-tier>
          {TIER_NUMERAL[tier]}
        </span>
      </span>
      <span className="k-disp text-[30px]">{name}</span>
      <span className="text-[18px] leading-normal text-[var(--k-text-2)]">{text}</span>
      {count > 0 && (
        <span className="k-caption mt-auto text-[var(--k-text-3)]" data-testid="boon-taken">
          Taken {count} of {cap}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/stop/boon-style.ts src/features/delve/stop/BoonCards.tsx src/features/delve/stop/__tests__/BoonCards.test.tsx && npx vitest run src/features/delve/stop/__tests__/BoonCards.test.tsx --reporter=dot)` → no type errors; 2 tests PASS.

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-c1
git add packages/client/src/features/delve/stop/boon-style.ts packages/client/src/features/delve/stop/BoonCards.tsx packages/client/src/features/delve/stop/__tests__/BoonCards.test.tsx
git commit -m "feat(client): a boon card and the boon families' colours" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: The stop's three cards and the take

**Files:** modify `stop/BoonCards.tsx`, `stop/__tests__/BoonCards.test.tsx`.

- [ ] **Step 1: The failing tests.** In `BoonCards.test.tsx`:

Replace:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RARITY_TEXT } from '../../format';
import { BOON_STYLE } from '../boon-style';
import { BoonCard } from '../BoonCards';
```
with:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { BoonStop, Buff, ProfileActionResult, StopAction } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';
import { getDelveRegistry } from '../../registry';
import { RARITY_TEXT } from '../../format';
import { BOON_STYLE } from '../boon-style';
import { BoonCard, BoonCards } from '../BoonCards';

const registry = getDelveRegistry();
const realTake = useDelveStore.getState().takeStop;
/** The store's take, stubbed: Phase A's engine refuses every boon take. */
const stubTake = (result: Partial<ProfileActionResult>) => {
  const take = vi.fn(
    (_: StopAction): ProfileActionResult => ({ ok: true, profile: useDelveStore.getState().profile, ...result }),
  );
  useDelveStore.setState({ takeStop: take });
  return take;
};
const STOP: BoonStop = {
  kind: 'boons',
  offers: [
    { id: 'vigor', tier: 1 },
    { id: 'renewal', tier: 2 },
    { id: 'clarity', tier: 3 },
  ],
  taken: false,
};
const worn = (id: string, tier: 1 | 2 | 3): Buff => ({
  boon: id,
  tier,
  effect: registry.getBoon(id)!.tiers[tier - 1].effect,
});
```

Append at the end of the file:
```tsx
describe("a stop's boon cards", () => {
  afterEach(() => {
    useDelveStore.setState({ takeStop: realTake });
    vi.restoreAllMocks();
  });

  it('shows each offer as a card from the data, in order, the first the first focus, and counts what is worn', () => {
    const real = registry.getBoon.bind(registry);
    vi.spyOn(registry, 'getBoon').mockImplementation((id) => ({ ...real(id)!, cap: 3 }));
    render(<BoonCards stop={STOP} worn={[worn('renewal', 1), worn('renewal', 2), worn('vigor', 1)]} />);
    const step = screen.getByTestId('stop-boon');
    expect(step).toHaveTextContent('Take one boon');
    const cards = within(step).getAllByTestId('boon-card');
    expect(cards.map((c) => [c.dataset.boon, c.dataset.family, c.dataset.tier])).toEqual(
      STOP.offers.map((o) => [o.id, registry.getBoon(o.id)!.family, String(o.tier)]),
    );
    STOP.offers.forEach((o, i) => {
      const def = registry.getBoon(o.id)!;
      expect(cards[i]).toHaveTextContent(def.name);
      expect(cards[i]).toHaveTextContent(def.tiers[o.tier - 1].text);
    });
    expect(cards.map((c) => c.hasAttribute('data-pad-first'))).toEqual([true, false, false]);
    expect(cards.map((c) => within(c).queryByTestId('boon-taken')?.textContent ?? null)).toEqual([
      'Taken 1 of 3',
      'Taken 2 of 3',
      null,
    ]);
  });

  it('a click takes that boon through the store, and marks the stop hint seen', () => {
    useUIStore.setState({ seen: [] });
    const take = stubTake({});
    render(<BoonCards stop={STOP} worn={[]} />);
    fireEvent.click(screen.getAllByTestId('boon-card')[1]);
    expect(take).toHaveBeenCalledWith({ kind: 'boon', index: 1 });
    expect(useUIStore.getState().seen).toContain('stop');
    expect(screen.queryByTestId('boon-refused')).toBeNull();
  });

  it("a refused take says the engine's reason and marks nothing", () => {
    useUIStore.setState({ seen: [] });
    stubTake({ ok: false, reason: 'Not offered at this stop' });
    render(<BoonCards stop={STOP} worn={[]} />);
    fireEvent.click(screen.getAllByTestId('boon-card')[0]);
    expect(screen.getByTestId('boon-refused')).toHaveTextContent('Not offered at this stop');
    expect(useUIStore.getState().seen).not.toContain('stop');
  });
});
```

(The spec's "X skips" for `BoonCards.test.tsx` is the stop screen's prompt, so Task 3's "X (or S) skips to the road" covers it.)

- [ ] **Step 2: Run it.** `(cd packages/client && npx vitest run src/features/delve/stop/__tests__/BoonCards.test.tsx --reporter=dot)` → FAIL (`BoonCards` is not exported).

- [ ] **Step 3: Implement.** In `BoonCards.tsx`:

Replace:
```tsx
import type { ReactElement } from 'react';
import { BOON_TIER_NAMES, type BoonFamily, type BoonTierIndex } from '@alloy/engine';
import { RARITY_TEXT } from '../format';
```
with:
```tsx
import { useState, type ReactElement } from 'react';
import {
  BOON_TIER_NAMES,
  boonCount,
  type BoonFamily,
  type BoonStop,
  type BoonTierIndex,
  type Buff,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from '../registry';
import { RARITY_TEXT } from '../format';
```

Append at the end of the file:
```tsx
/**
 * A boons stop's step 1 (the boons spec, 6): its offers as cards, each taken by a click, A or
 * Enter through the store's `takeStop` (free; the stop is then taken and `StopScreen` moves to
 * the road). A refusal shows the engine's reason under the cards.
 */
export function BoonCards({ stop, worn }: { stop: BoonStop; worn: readonly Buff[] }): ReactElement {
  const registry = getDelveRegistry();
  const [message, setMessage] = useState<string | null>(null);
  const take = (index: number) => {
    const res = useDelveStore.getState().takeStop({ kind: 'boon', index });
    if (res.ok) {
      playSound('upgradeTier');
      vibrate('success');
      showToast(`${registry.getBoon(stop.offers[index].id)!.name}: taken`);
      useUIStore.getState().markSeen('stop');
    } else {
      playSound('combineFail');
      setMessage(res.reason ?? 'Cannot take it');
    }
  };
  return (
    <section aria-label="Boons" className="flex min-h-0 flex-1 flex-col gap-4" data-testid="stop-boon">
      <div className="flex items-baseline justify-between">
        <h2 className="k-section m-0 text-[26px] text-[var(--k-hot-hi)]">Take one boon</h2>
        <span className="text-[16px] text-[var(--k-text-3)]">it lasts the dive, or skip it</span>
      </div>
      <div className="grid min-h-0 grid-cols-3 items-stretch gap-[18px]">
        {stop.offers.map((offer, i) => {
          const def = registry.getBoon(offer.id);
          if (!def) return null; // a row the data no longer holds
          return (
            <BoonCard
              key={offer.id}
              id={offer.id}
              family={def.family}
              tier={offer.tier}
              name={def.name}
              text={def.tiers[offer.tier - 1].text}
              count={boonCount(worn, offer.id)}
              cap={def.cap}
              first={i === 0}
              onTake={() => take(i)}
            />
          );
        })}
      </div>
      {message && (
        <span role="alert" className="text-[18px] text-[var(--k-hot)]" data-testid="boon-refused">
          {message}
        </span>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/stop/BoonCards.tsx src/features/delve/stop/__tests__/BoonCards.test.tsx && npx vitest run src/features/delve/stop/__tests__/BoonCards.test.tsx --reporter=dot)` → no type errors; 5 tests PASS.

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-c1
git add packages/client/src/features/delve/stop/BoonCards.tsx packages/client/src/features/delve/stop/__tests__/BoonCards.test.tsx
git commit -m "feat(client): a boons stop's three cards, taken through the store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: The stop screen by the stop's kind, and the boon hint

**Files:** modify `onboarding.ts`, `stop/StopScreen.tsx`, `stop/__tests__/StopScreen.test.tsx`.

- [ ] **Step 1: The failing tests.** In `StopScreen.test.tsx`:

Replace:
```tsx
  type DiveState,
  type Haul,
  type StopKind,
} from '@alloy/engine';
```
with:
```tsx
  type BoonOffer,
  type DiveState,
  type Haul,
  type ProfileActionResult,
  type StopKind,
} from '@alloy/engine';
```

Replace:
```tsx
import { ONBOARDING } from '../../onboarding';
```
with:
```tsx
import { BOON_HINT, ONBOARDING } from '../../onboarding';
```

Replace (the end of the first `describe`, before the guided one):
```tsx
    expect(screen.queryByTestId('floor-finds')).toBeNull();
  });
});

describe("StopScreen (a guided start's stops)", () => {
```
with:
```tsx
    expect(screen.queryByTestId('floor-finds')).toBeNull();
  });
});

describe('StopScreen (a boons stop)', () => {
  const OFFERS: BoonOffer[] = [
    { id: 'vigor', tier: 1 },
    { id: 'renewal', tier: 2 },
    { id: 'clarity', tier: 3 },
  ];
  const atBoons = (taken = false) =>
    atStop(null, { stop: { kind: 'boons', offers: OFFERS, taken } });
  const realTake = store().takeStop;
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });
  afterEach(() => {
    vi.useRealTimers();
    useDelveStore.setState({ takeStop: realTake });
  });

  it('opens on the boon cards (the first the first focus), never the power-ups, and Skip says boon', () => {
    atBoons();
    const step = screen.getByTestId('stop-boon');
    expect(screen.getAllByTestId('boon-card')).toHaveLength(3);
    expect(screen.getAllByTestId('boon-card')[0]).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('door-choice').querySelectorAll('[data-pad-first]')).toHaveLength(1);
    expect(step).toContainElement(screen.getAllByTestId('boon-card')[0]);
    expect(screen.queryByTestId('stop-powerup')).toBeNull();
    expect(screen.queryByTestId('stop-road')).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip boon' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip power-up' })).toBeNull();
  });

  it('X (or S) skips to the road, the first road focused; B (or Boons) comes back to the cards', () => {
    atBoons();
    arm();
    padPress('x');
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    expect(screen.getByTestId('stop-skipped')).toHaveTextContent('Boon skipped.');
    expect(firstDoor()).toHaveFocus();
    padPress('b');
    expect(screen.getAllByTestId('boon-card')[0]).toHaveFocus();
    press('KeyS');
    fireEvent.click(screen.getByRole('button', { name: 'Boons' }));
    expect(screen.getByTestId('stop-boon')).toBeInTheDocument();
  });

  it('a take moves to the road for good, the first road focused; the first visit says "Take a boon" until then', () => {
    useUIStore.setState({ seen: [] });
    atBoons();
    arm();
    expect(screen.getByTestId('onboarding-hint')).toHaveTextContent(BOON_HINT);
    expect(document.querySelector('.k-prompt[data-pulse]')).toHaveTextContent('Take');
    // B1's engine marks the stop taken; Phase A's refuses, so the store's take is stubbed.
    useDelveStore.setState({
      takeStop: (): ProfileActionResult => {
        const d = store().profile.dive!;
        store().setProfile({ ...store().profile, dive: { ...d, stop: { ...d.stop!, taken: true } } });
        return { ok: true, profile: store().profile };
      },
    });
    fireEvent.click(screen.getAllByTestId('boon-card')[0]);
    expect(useUIStore.getState().seen).toContain('stop');
    expect(screen.queryByTestId('onboarding-hint')).toBeNull();
    expect(screen.getByTestId('stop-taken')).toHaveTextContent('Boon taken.');
    expect(firstDoor()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Boons' })).toBeNull();
  });

  it("a taken boons stop (a reload's) opens on the road", () => {
    atBoons(true);
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    expect(screen.getByTestId('stop-taken')).toHaveTextContent('Boon taken.');
    expect(screen.queryByRole('button', { name: 'Skip boon' })).toBeNull();
  });
});

describe("StopScreen (a guided start's stops)", () => {
```

- [ ] **Step 2: Run it.** `(cd packages/client && npx vitest run src/features/delve/stop/__tests__/StopScreen.test.tsx --reporter=dot)` → FAIL (`BOON_HINT` is not exported; once it is, the four new tests fail on `stop-boon`).

- [ ] **Step 3: Implement.** In `packages/client/src/features/delve/onboarding.ts`:

Replace:
```ts
/** A screen with a first-visit hint. */
```
with:
```ts
/** The stop's line on a boons stop (the boons spec, 6); its seen key stays `stop`. */
export const BOON_HINT = 'Take a boon: it lasts the dive. Then choose your road: deeper, or home with the haul.';

/** A screen with a first-visit hint. */
```

In `packages/client/src/features/delve/stop/StopScreen.tsx`:

Replace:
```tsx
import { DoorPane } from './DoorPane';
import { useOnboarding } from '../onboarding';
```
with:
```tsx
import { DoorPane } from './DoorPane';
import { BoonCards } from './BoonCards';
import { BOON_HINT, useOnboarding } from '../onboarding';
```

Replace (Phase A's lines, `01-contract.md` Task 10):
```tsx
  // The power-up cards (a boons stop's cards are the boons spec's C1; until then it goes to the road).
  const stop = dive.stop?.kind === 'powerups' ? dive.stop : null;
  const offering = !!stop && !stop.taken;
  // A guided stop's required power-up holds step 1 (the engine refuses a door until it's taken).
  const required = !!stop?.required && !stop.taken;
```
with:
```tsx
  // Step 1's cards: a boons stop's boons, or a guided stop's power-ups.
  const stop = dive.stop;
  const offering = !!stop && !stop.taken;
  const boons = stop?.kind === 'boons';
  /** What step 1 offers, in the prompts and notes: "Boon" or "Power-up". */
  const what = boons ? 'Boon' : 'Power-up';
  // A guided stop's required power-up holds step 1 (the engine refuses a door until it's taken).
  const required = stop?.kind === 'powerups' && !!stop.required && !stop.taken;
```

Replace:
```tsx
  // A first stop's line rides Take; the picker marks it done (StopPanel's StopPicker).
  const { hint } = useOnboarding('stop');
```
with:
```tsx
  // A first stop's line rides Take; a take marks it done (StopPanel's StopPicker, BoonCards).
  const { hint: stopHint } = useOnboarding('stop');
  const hint = stopHint && (boons ? BOON_HINT : stopHint);
```

Replace:
```tsx
            label: 'Skip power-up',
```
with:
```tsx
            label: `Skip ${what.toLowerCase()}`,
```

Replace:
```tsx
                  label: 'Power-ups',
```
with:
```tsx
                  label: boons ? 'Boons' : 'Power-ups',
```

Replace:
```tsx
    <span data-testid="stop-taken">Power-up taken.</span>
  ) : skipped ? (
    <span data-testid="stop-skipped">Power-up skipped.</span>
```
with:
```tsx
    <span data-testid="stop-taken">{what} taken.</span>
  ) : skipped ? (
    <span data-testid="stop-skipped">{what} skipped.</span>
```

Replace (the step-1 branch, as Phase A left it):
```tsx
        {step === 'powerup' ? (
          <div
            className="flex min-h-0 flex-1 flex-col gap-4"
            data-tutorial="stop.powerup"
            data-testid="stop-powerup"
          >
            {required && (
              <span className="text-[18px] text-[var(--k-hot)]" data-testid="roads-held">
                Take the power-up to go on
              </span>
            )}
            <StopPanel stop={stop!} />
          </div>
        ) : (
```
with:
```tsx
        {step === 'powerup' ? (
          stop?.kind === 'boons' ? (
            <BoonCards stop={stop} worn={dive.diveBuffs} />
          ) : (
            <div
              className="flex min-h-0 flex-1 flex-col gap-4"
              data-tutorial="stop.powerup"
              data-testid="stop-powerup"
            >
              {required && (
                <span className="text-[18px] text-[var(--k-hot)]" data-testid="roads-held">
                  Take the power-up to go on
                </span>
              )}
              {stop?.kind === 'powerups' && <StopPanel stop={stop} />}
            </div>
          )
        ) : (
```

Update the component's doc comment's step 1 sentence: replace
```tsx
 * of this floor's finds (an item in it opens the pause on that item). Step 1, while a power-up is
 * on offer: the cards (`StopPanel`, each expanding in place to its picker); A takes, X (or S)
```
with:
```tsx
 * of this floor's finds (an item in it opens the pause on that item). Step 1, while the stop is
 * untaken: a boons stop's three boons (`BoonCards`, the boons spec, 6), or a guided stop's
 * power-ups (`StopPanel`, each expanding in place to its picker); A takes, X (or S)
```

- [ ] **Step 4: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/onboarding.ts src/features/delve/stop/StopScreen.tsx src/features/delve/stop/__tests__/StopScreen.test.tsx && npx vitest run src/features/delve/stop src/features/delve/__tests__/onboarding.test.ts src/features/delve/__tests__/StopPanel.test.tsx --reporter=dot)` → no type errors; every test PASS (the old power-up tests unchanged, the four new ones and BoonCards' five).

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-c1
git add packages/client/src/features/delve/onboarding.ts packages/client/src/features/delve/stop/StopScreen.tsx packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx
git commit -m "feat(client): the stop offers boons on an ordinary stop, power-ups on a guided one" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: The kit gallery's boon cards

**Files:** modify `kit/KitGallery.tsx`, `kit/__tests__/KitGallery.test.tsx`.

- [ ] **Step 1: The failing test.** In `KitGallery.test.tsx`:

Replace:
```tsx
    expect(
      screen.getByRole('button', { name: 'Ember Fang, downgrade, locked, equipped' }),
    ).toBeInTheDocument();
```
with:
```tsx
    expect(
      screen.getByRole('button', { name: 'Ember Fang, downgrade, locked, equipped' }),
    ).toBeInTheDocument();
    // A boon card at each tier.
    expect(screen.getAllByTestId('boon-card').map((c) => c.dataset.tier)).toEqual(['1', '2', '3']);
```

- [ ] **Step 2: Run it.** `(cd packages/client && npx vitest run src/features/delve/kit/__tests__/KitGallery.test.tsx --reporter=dot)` → FAIL (no `boon-card`).

- [ ] **Step 3: Implement.** In `KitGallery.tsx`:

Replace:
```tsx
import { ItemIcon } from '../ItemIcon';
```
with:
```tsx
import { ItemIcon } from '../ItemIcon';
import { BoonCard, type BoonCardProps } from '../stop/BoonCards';
```

Replace:
```tsx
const TABS = ['loadout', 'skills', 'forge', 'codex', 'quests'] as const;
```
with:
```tsx
/** A boon card at each tier, in three families' colours. */
const BOONS: Omit<BoonCardProps, 'onTake'>[] = [
  { id: 'keen-edge', family: 'offense', tier: 1, name: 'Keen Edge', text: '+10% damage', count: 0, cap: 3 },
  { id: 'third-wind', family: 'defense', tier: 2, name: 'Third Wind', text: '+1 dodge charge, dodges recharge 15% faster', count: 0, cap: 1 },
  { id: 'glass-cannon', family: 'pact', tier: 3, name: 'Glass Cannon', text: '+45% damage, −20% max life', count: 1, cap: 2 },
];

const TABS = ['loadout', 'skills', 'forge', 'codex', 'quests'] as const;
```

Replace:
```tsx
              <span>Hit 412 · Beat after 0.32 s</span>
            </TooltipCard>
```
with:
```tsx
              <span>Hit 412 · Beat after 0.32 s</span>
            </TooltipCard>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 300px)', gap: 18 }}>
              {BOONS.map((b) => (
                <BoonCard key={b.tier} {...b} onTake={() => {}} />
              ))}
            </div>
```

- [ ] **Step 4: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/kit/KitGallery.tsx src/features/delve/kit/__tests__/KitGallery.test.tsx && npx vitest run src/features/delve/kit/__tests__ --reporter=dot)` → no type errors; PASS (`kit-index.test.ts` unchanged: `BoonCard` isn't a kit export).

- [ ] **Step 5: Commit.**

```bash
cd /c/Projects/alloy-boons-c1
git add packages/client/src/features/delve/kit/KitGallery.tsx packages/client/src/features/delve/kit/__tests__/KitGallery.test.tsx
git commit -m "feat(client): the kit gallery shows a boon card at each tier" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: The store's take, for boons

**Files:** modify `src/stores/delveStore.ts`, `src/stores/delveStore.test.ts`. The comment lands now; **the test is written now and run in Phase D** (it needs B1's `takeStop`; on `boons/c1` it fails on Phase A's refusal, so commit it as `it.skip` and Phase D removes the `.skip`).

- [ ] **Step 1: The comment.** In `packages/client/src/stores/delveStore.ts`:

Replace:
```ts
  /** Take the door screen's power-up. */
```
with:
```ts
  /** Take the stop's boon (`{ kind: 'boon', index }`) or a guided stop's power-up. */
```

- [ ] **Step 2: The test.** In `packages/client/src/stores/delveStore.test.ts`:

Replace:
```ts
  it('a reset takes a primary; without one the choice is still to make', () => {
```
with:
```ts
  // Phase D: remove the .skip once B1 has merged (Phase A's engine refuses every boon take).
  it.skip("takes the stop's boon: free, worn on the dive, once", () => {
    const s = () => useDelveStore.getState();
    s().startDive(1);
    const dive = { ...s().profile.dive!, phase: 'choosing' as const };
    const before = { ...s().profile };
    s().setProfile({
      ...s().profile,
      dive: { ...dive, stop: { kind: 'boons', offers: [{ id: 'keen-edge', tier: 2 }], taken: false } },
    });
    expect(s().takeStop({ kind: 'boon', index: 0 }).ok).toBe(true);
    expect(s().profile.dive!.diveBuffs.at(-1)).toMatchObject({ boon: 'keen-edge', tier: 2 });
    expect(s().profile.dive!.stop!.taken).toBe(true);
    expect(s().profile.scrap).toBe(before.scrap);
    expect(s().takeStop({ kind: 'boon', index: 0 }).ok).toBe(false);
  });

  it('a reset takes a primary; without one the choice is still to make', () => {
```

- [ ] **Step 3: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/stores/delveStore.test.ts --reporter=dot)` → no type errors; PASS with 1 skipped.

- [ ] **Step 4: Commit.**

```bash
cd /c/Projects/alloy-boons-c1
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts
git commit -m "test(client): the store takes a stop's boon (skipped until B1 merges)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: The E2E edits (written now, run in Phase D)

**Files:** modify `e2e/fixtures/delve.ts`, `e2e/delve-pad-nav.spec.ts`. These run only once B1 makes ordinary stops boon stops; **don't run Playwright here** (`feedback_test_scope_tokens`). Typecheck only.

- [ ] **Step 1: `toRoad` skips either step.** In `packages/client/e2e/fixtures/delve.ts`:

Replace:
```ts
  const stop = page.getByTestId('door-choice');
  if (await stop.getByTestId('stop-powerup').isVisible())
    await stop.getByRole('button', { name: 'Skip power-up' }).click();
  await expect(stop.getByTestId('stop-road')).toBeVisible();
```
with:
```ts
  const stop = page.getByTestId('door-choice');
  // Step 1 is a boons stop's cards, or a guided stop's power-ups.
  if (await stop.getByTestId('stop-powerup').or(stop.getByTestId('stop-boon')).isVisible())
    await stop.getByRole('button', { name: /^Skip (power-up|boon)$/ }).click();
  await expect(stop.getByTestId('stop-road')).toBeVisible();
```

Update its doc comment if it names "power-up" only (`toRoad`'s comment above line 100): "skips the stop's step 1 (its boons or power-ups) to its road".

- [ ] **Step 2: PN06 walks the boon cards.** In `packages/client/e2e/delve-pad-nav.spec.ts` (the seed's stop, `completeFloor` at depth 1, is an ordinary stop: boons after B1):

Replace:
```ts
  'stop-powerup': [0, 0],
```
with:
```ts
  'stop-powerup': [0, 0],
  'stop-boon': [0, 0],
```

Replace (in `CEILING`):
```ts
  'stop-powerup': 4,
```
with:
```ts
  'stop-powerup': 4,
  // The finds line and the three boon cards.
  'stop-boon': 4,
```

Replace:
```ts
  test('PN06: the stop by the pad: the cards, X to the road, B back; Menu opens the pause list on Resume, B resumes', async ({ page }) => {
```
with:
```ts
  test('PN06: the stop by the pad: the boon cards, X to the road, B back; Menu opens the pause list on Resume, B resumes', async ({ page }) => {
```

Replace:
```ts
    expect((await where(page)).id).toMatch(/^stop-(equip|slot|move|upgrade|rune)$/);
    await check(page, 'stop-powerup');
```
with:
```ts
    expect((await where(page)).id).toBe('boon-card');
    await check(page, 'stop-boon');
    // Every card is a stop the D-pad reaches (check's audit), and right walks them in order.
    for (let i = 1; i < 3; i++) {
      await tap(page, BUTTON.right);
      await expect(stop.getByTestId('boon-card').nth(i)).toBeFocused();
    }
```

Replace:
```ts
    await tap(page, BUTTON.b);
    await expect(stop.getByTestId('stop-powerup')).toBeVisible();
    expect((await where(page)).id).toMatch(/^stop-/);
```
with:
```ts
    await tap(page, BUTTON.b);
    await expect(stop.getByTestId('stop-boon')).toBeVisible();
    expect((await where(page)).id).toBe('boon-card');
```

Replace:
```ts
    await expect(page.getByTestId('pause-screen')).toHaveCount(0);
    await expect(stop.getByTestId('stop-powerup')).toBeVisible();
  });
```
with:
```ts
    await expect(page.getByTestId('pause-screen')).toHaveCount(0);
    await expect(stop.getByTestId('stop-boon')).toBeVisible();
  });
```

(`BUTTON.right` is the D-pad right, 15. The cards sit in one row of three at both projects' sizes; if Phase D finds them wrapped, the loop's presses follow the rows.)

- [ ] **Step 3: Parse check.** The client's `tsconfig.json` includes only `src`, so the E2E files have no typecheck; Playwright's listing parses them without running a browser: `(cd packages/client && npx playwright test --list e2e/delve-pad-nav.spec.ts e2e/delve.spec.ts > /dev/null && echo OK)` → `OK`.

- [ ] **Step 4: Commit.**

```bash
cd /c/Projects/alloy-boons-c1
git add packages/client/e2e/fixtures/delve.ts packages/client/e2e/delve-pad-nav.spec.ts
git commit -m "test(e2e): toRoad skips a boons step; PN06 walks the boon cards (run in Phase D)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: A door's boon line

`DoorMods.boons` (Phase A's field; B1 sets Gilded Halls 0.5 and Champion's Den 0.3 in `delve.json`) is the chance each card of the next stop rolls a tier up. The road words it as a gain, like the shard bump's "Tier up 35%".

**Files:** modify `stop/DoorPane.tsx`, `stop/__tests__/StopScreen.test.tsx`.

- [ ] **Step 1: The failing test.** In `StopScreen.test.tsx`:

Replace:
```tsx
    expect(terms('cursed')).toEqual({ cost: ['Foes hit 40% harder'], gain: ['Tier up 35%'] });
  });
```
with:
```tsx
    expect(terms('cursed')).toEqual({ cost: ['Foes hit 40% harder'], gain: ['Tier up 35%'] });
  });

  it("words a door's boon bump as a gain: the next stop's cards a tier up at its chance", () => {
    expect(doorTerms({ boons: 0.5 })).toEqual({ cost: [], gain: ['Rarer boons 50%'] });
    expect(doorTerms({ boons: 0 })).toEqual({ cost: [], gain: [] });
  });
```

- [ ] **Step 2: Run it.** `(cd packages/client && npx vitest run src/features/delve/stop/__tests__/StopScreen.test.tsx --reporter=dot)` → FAIL (the new test: `gain` is `[]`).

- [ ] **Step 3: Implement.** In `packages/client/src/features/delve/stop/DoorPane.tsx`:

Replace:
```tsx
  if (mods.shardTier) gain.push(`Tier up ${pct(mods.shardTier)}`);
  return { cost, gain };
```
with:
```tsx
  if (mods.shardTier) gain.push(`Tier up ${pct(mods.shardTier)}`);
  // The next stop's boon cards a tier up at this chance (the boons spec, 4).
  if (mods.boons) gain.push(`Rarer boons ${pct(mods.boons)}`);
  return { cost, gain };
```

- [ ] **Step 4: Run it.** `(cd packages/client && npx tsc --noEmit -p . && npx prettier --end-of-line auto --write src/features/delve/stop/DoorPane.tsx src/features/delve/stop/__tests__/StopScreen.test.tsx && npx vitest run src/features/delve/stop --reporter=dot)` → no type errors; PASS. The existing `gilded` and `champions` expectations still pass on `boons/c1` because Phase A's data sets no `boons`; see the next step.

- [ ] **Step 5: After B1 merges** (Phase D, or the integrator at merge): B1's data gives Gilded Halls and Champion's Den their `boons`, so the "words a door's cost and its gain" test's two expectations gain the line. In `StopScreen.test.tsx`, replace:
```tsx
      gain: ['Flux ×1.5', 'Essences ×1.5', 'Find +75%'],
```
with:
```tsx
      gain: ['Flux ×1.5', 'Essences ×1.5', 'Find +75%', 'Rarer boons 50%'],
```
and replace:
```tsx
    expect(terms('champions')).toEqual({ cost: ['An elite leads every pack'], gain: ['Bounty ×1.5'] });
```
with:
```tsx
    expect(terms('champions')).toEqual({
      cost: ['An elite leads every pack'],
      gain: ['Bounty ×1.5', 'Rarer boons 30%'],
    });
```
The gain lines follow `doorTerms`'s order, so if B1 tunes the numbers, the percentages follow them.

- [ ] **Step 6: Commit** (Steps 1–4 only).

```bash
cd /c/Projects/alloy-boons-c1
git add packages/client/src/features/delve/stop/DoorPane.tsx packages/client/src/features/delve/stop/__tests__/StopScreen.test.tsx
git commit -m "feat(client): a door's boon bump on the road (Rarer boons 50%)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Client tests that reach a stop through the engine

Searched the client for `completeFloor`, `stop-powerup`, `stop-equip`, "Skip power-up", `.stop` and `phase: 'choosing'` in tests. **No client unit test reads a stop that the real `rollStop` made.** Each one builds its stop as a literal, or reads only the phase:
- `features/delve/__tests__/arena-bank.test.ts` runs the real `completeFloor` through `useArena`'s `clearFloor`, but checks only `dive.phase === 'choosing'` and the haul. It needs no fix.
- `pages/__tests__/DelveRun.test.tsx` (lines 360, 399, 425), `stores/delveStore.test.ts` (202) and `stop/__tests__/StopScreen.test.tsx` use power-up literals. Phase A gives them `kind: 'powerups'`. A `powerups` stop still renders `StopPanel`, so they stay valid after B1 and need no fix.
- `DelveRun.test.tsx`'s alcove (228), `FloorDialogs.test.tsx` and `arena-floor.test.ts` test alcoves, which keep power-ups. No fix.
- `DelveRun.tutorial.test.tsx` (148) uses `stop: null`. No fix.

Only the E2E reaches a real stop: Task 6 handles `toRoad` and PN06, and `e2e/delve.spec.ts` near line 151 is Phase D's (see Needs routed). The doors' gain test is in Task 7, Step 5.

**The store:** `takeStop: (action) => applyResult(engineTakeStop(registry(), get().profile, action))` forwards any `StopAction`. Its only branch is `action.kind === 'equip'`, which narrows the union, so `{ kind: 'boon', index }` typechecks and passes through unchanged once Phase A widens `StopAction`. Task 5 changes only its comment.

## Area close

- [ ] `(cd packages/client && npx tsc --noEmit -p . && npx vitest run --reporter=dot)` → no type errors; the whole client suite passes (one skipped: Task 5's).
- [ ] `(pnpm -F @alloy/client build)` → builds.

## Needs routed

- **After B1 merges (Phase D or the integrator):** Task 7 Step 5, the `gilded` and `champions` door expectations gain "Rarer boons 50%" / "30%".
- **Phase D:** remove the `.skip` from `delveStore.test.ts`'s "takes the stop's boon" (Task 5) once B1 has merged, and run it. Run Task 6's E2E: `toRoad`'s callers (`delve.spec.ts`, `delve-quests.spec.ts`, `responsive/specs/delve-stop.spec.ts`) and PN06 on both `desktop` and `desktop-1080`. `e2e/delve.spec.ts` near line 151 branches on `stop-powerup` itself (taking a power-up): with ordinary stops now boons, it becomes the spec's "take a boon, see its tile on the next floor" stop spec (D owns it; click `boon-card` 0, then the road). TY02 / the responsive text probe over `stop-boon` (the card's labels are 16 design px, its lines 18).
- **C2 (the HUD):** `BOON_STYLE` (`stop/boon-style.ts`) holds each family's colour and name; the HUD's boon tile should import it rather than define a second map (merge C1 before C2, or the integrator swaps C2's copy for the import). Sent to C2's drafter.
- **D (docs):** CLAUDE.md's Client paragraph, the stop: step 1 is `BoonCards` (`stop-boon`; each card a button, `boon-card`, with `data-boon`, `data-tier` and `data-family`; "Skip boon", "Boons" back) on an ordinary stop and `StopPanel` (`stop-powerup`) on a guided one; `BOON_STYLE`'s family colours; `BOON_HINT`; the kit gallery's boon cards.
- **A:** nothing beyond the assumptions above.
