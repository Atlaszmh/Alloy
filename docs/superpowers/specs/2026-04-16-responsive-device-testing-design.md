# Responsive & Device Testing Design

**Date:** 2026-04-16
**Status:** Draft
**Scope:** Playwright-based automated testing of responsive behavior across a 13-viewport matrix for the 5 gameplay-critical screens, plus a triage-to-plan workflow for issues found.

## Problem

Alloy targets browser, mobile, tablet, and eventually standalone platforms. The responsive token system (`docs/superpowers/specs/2026-03-31-responsive-token-system-design.md`) established a vocabulary and layout patterns, and listed a manual verification checklist at 667/812/932 px frame heights — but that checklist was never automated. Today there is no regression gate that catches:

- Horizontal overflow (content pushing the viewport wider than it should be)
- Vertical overflow inside `.app-frame` (content spilling past the frame)
- Tab bar overlapping content or primary CTAs being covered
- Primary actions falling outside the viewport or below the 36×36px touch-target floor
- Dead space (content filling less than 80% of the frame height)
- Tokens dropping below their min-size clamp floors

The existing Playwright suite covers functional flows across 4 device profiles but does not assert layout integrity. Without a responsive gate, every new feature risks silent regressions on less-common resolutions, and the 9:16 aspect-ratio frame mode (activated on wider viewports via `@media (min-aspect-ratio: 9/16)` with letterboxing) is untested.

## Goals

- Automate layout-integrity assertions for the 5 gameplay-critical screens across a broad viewport matrix
- Provide a structured, parseable report of findings (screen × viewport × probe) to feed into a follow-up implementation plan
- Establish reusable probe infrastructure that future screens and additional assertions can plug into without rework
- Keep the suite fast enough to run frequently (target: full matrix completes in under 5 minutes locally)

## Non-Goals

- Visual regression testing (screenshot diffs) — separate follow-up; the noise profile warrants its own design
- Animation stability tests — too fragile without targeted investment; separate follow-up
- Meta/settings screens (Profile, Settings, Leaderboard, GemEncyclopedia, SettingsDrawer, DevDrawer) — follow-up after gameplay-critical coverage is in place
- CI pipeline integration — this spec produces a local test suite; CI wiring is a separate concern
- Changes to the responsive token system itself — this spec tests the existing system, it does not modify it
- Addressing the findings — that is the output of this spec, handled by a subsequent implementation plan

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test framework | Playwright (existing) | Already in the project, supports viewport control, integrates with existing fixtures |
| Assertion style | Programmatic probes, not snapshots | Visual regression is noisy and requires deliberate baseline management; programmatic probes catch layout bugs without noise |
| Viewport iteration | Inside test files, not via Playwright projects | Playwright projects create N processes; we want one process × N viewports per screen for faster runs and simpler reporting |
| Failure handling | Collect all findings, then assert | Lets us produce a complete triage report in a single run rather than stopping at the first failure |
| Scope | Gameplay-critical 5 screens only | Draft, Forge (equip + combine), Duel, MainMenu, PhaseRouter transitions — the screens where responsive bugs actually affect gameplay |
| Dead-space threshold | 80% of frame height | Starting value from the responsive-token spec's goals; tunable per-screen via overrides |
| Team composition | Two-phase, two-agent team | Harness agent builds infrastructure in parallel with Screens agent writing per-screen specs; clean lane separation |

## Architecture

### 1. Directory Layout

```
packages/client/e2e/
├── responsive/
│   ├── viewports.ts              # 13-profile matrix
│   ├── probes/
│   │   ├── types.ts              # Finding, Probe, ProbeCtx interfaces
│   │   ├── overflow.ts           # probes 1, 2
│   │   ├── tabbar.ts             # probe 3
│   │   ├── reachability.ts       # probe 4
│   │   ├── dead-space.ts         # probe 5
│   │   ├── min-size.ts           # probe 6
│   │   ├── run-all.ts            # runs every probe, aggregates findings
│   │   └── report.ts             # writes/reads responsive-report.json
│   ├── fixtures/
│   │   └── responsive-fixture.ts # extends Playwright test with probe helpers
│   ├── triage/
│   │   └── generate-report.ts    # consumes responsive-report.json → markdown matrix
│   └── specs/
│       ├── main-menu.spec.ts
│       ├── draft.spec.ts
│       ├── forge-equip.spec.ts
│       ├── forge-combine.spec.ts
│       ├── duel.spec.ts
│       └── phase-transitions.spec.ts
└── (existing e2e specs untouched)

test-results/
└── responsive-report.json        # aggregated findings, one object per (screen, viewport, probe)

packages/client/src/test-utils/
└── probe-fixtures/
    └── *.html                    # tiny HTML fixtures used by probe unit tests
```

Existing e2e specs are untouched. The new responsive suite lives under `e2e/responsive/` so it can be run, excluded, or iterated independently.

### 2. Viewport Matrix (`viewports.ts`)

The 13-profile set is chosen to exercise every branch of the responsive system:

| Profile | Width × Height | Regime |
|---------|----------------|--------|
| `galaxy-fold` | 344 × 882 | Narrowest viable phone |
| `iphone-se` | 375 × 667 | Small-phone baseline (existing) |
| `iphone-15-pro` | 393 × 852 | Standard modern phone (existing) |
| `pixel-7` | 412 × 915 | Large Android (existing) |
| `iphone-14-pro-max` | 430 × 932 | Largest-tier phone |
| `iphone-landscape` | 852 × 393 | Phone landscape — flips `@media (max-aspect-ratio: 9/16)` branch |
| `ipad-portrait` | 768 × 1024 | Tablet portrait |
| `ipad-landscape` | 1024 × 768 | Tablet landscape |
| `desktop-1280` | 1280 × 800 | Small laptop (existing) |
| `fhd` | 1920 × 1080 | Full-HD desktop |
| `2k-dci` | 2048 × 1080 | 2K cinema width |
| `qhd-1440p` | 2560 × 1440 | Common gaming monitor |
| `ultrawide` | 2560 × 1080 | Ultrawide — aggressive letterboxing |

Each profile carries a `device` tag (`mobile` | `mobile-landscape` | `tablet` | `tablet-landscape` | `desktop` | `ultrawide`) so probes can apply device-aware thresholds (e.g., letterboxed frames don't need to hit 80% of the viewport width for dead-space; they hit 80% of the frame width).

### 3. Probe Contract

```ts
// packages/client/e2e/responsive/probes/types.ts

export type Severity = 'fail' | 'warn';

export interface Finding {
  screen: string;       // 'draft', 'forge-equip', etc.
  viewport: string;     // matches VIEWPORTS[i].name
  probe: string;        // 'overflow-x' | 'dead-space' | ...
  severity: Severity;
  detail: string;       // human-readable description of the violation
  measured?: number;    // actual value observed
  expected?: number;    // threshold that was violated
}

export interface ProbeCtx {
  screen: string;
  viewport: {
    name: string;
    width: number;
    height: number;
    device: string;
  };
}

export type Probe = (page: Page, ctx: ProbeCtx) => Promise<Finding[]>;
```

Every probe returns an array of findings (empty array = pass). Probes never throw on violations — they record findings. The `run-all` helper aggregates findings across all probes; the spec then asserts `findings.filter(f => f.severity === 'fail').length === 0` at the end, so a single test invocation captures every violation at once rather than stopping at the first.

### 4. The Six Probes

Each probe is a small pure function that takes the Playwright `Page` plus a context object and returns findings. Unit-testable in isolation against static HTML.

**`overflow.ts`** exports two probes:
- `overflowX`: fails if `document.documentElement.scrollWidth > viewport.width`. Detail includes the overflowing element (queried via `document.querySelectorAll('*')` filtered to those whose `getBoundingClientRect().right > viewport.width`).
- `overflowY`: fails if any descendant of `.app-frame` has a bounding rect bottom exceeding the frame's bottom. Detail includes the element's selector.

**`tabbar.ts`** — `tabBarVisibility`: locates `.tab-bar` (or equivalent test hook), asserts it is visible (`opacity > 0`, `display !== 'none'`, rect within viewport). Then asserts no element marked with `data-primary-cta` has a rect overlapping the tab bar's rect.

**`reachability.ts`** — `primaryActionReachable`: each spec tags the screen's primary action with `data-primary-action`. Probe asserts it is on-screen (rect fully within viewport), and that its rendered size ≥ 36 × 36 px.

**`dead-space.ts`** — `deadSpace`: measures the frame's `getBoundingClientRect()` as the container, then sums the vertical extent of direct-descendant content regions (matched via `[data-screen-section]` attributes that specs add). Computes `contentHeight / frameHeight`. Fails if < 0.80 by default; per-screen overrides allowed via options parameter.

**`min-size.ts`** — `minSize`: queries elements with responsive tokens applied (`[data-gem]`, `.forge-socket`, elements with `data-size-token` attribute) and asserts computed width/height ≥ the token's min-clamp value. Text size probe checks computed `font-size` against the `--text-*` min floors. Uses `window.getComputedStyle()` and reads CSS custom-property values directly.

### 5. Fixture and Spec Pattern

```ts
// packages/client/e2e/responsive/fixtures/responsive-fixture.ts
import { test as base } from '@playwright/test';
import { runAllProbes } from '../probes/run-all';
import { appendFinding } from '../probes/report';

export const test = base.extend<{ runProbes: (screen: string) => Promise<void> }>({
  runProbes: async ({ page }, use, testInfo) => {
    await use(async (screen: string) => {
      const vp = testInfo.project.metadata.viewport;
      const findings = await runAllProbes(page, { screen, viewport: vp });
      findings.forEach(appendFinding);
      const failures = findings.filter(f => f.severity === 'fail');
      if (failures.length > 0) {
        throw new Error(
          `Responsive violations on ${screen} @ ${vp.name}:\n` +
          failures.map(f => `  [${f.probe}] ${f.detail}`).join('\n')
        );
      }
    });
  },
});
```

```ts
// packages/client/e2e/responsive/specs/draft.spec.ts
import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startMatch, waitForPhase } from '../../fixtures/match';

for (const vp of VIEWPORTS) {
  test(`Draft @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await runProbes('draft');
  });
}
```

Iterating the matrix inside the file (rather than via Playwright projects) runs all 13 viewports sequentially in a single worker — one browser launch, 13 tests. This is faster than 13 separate Playwright projects, keeps reporting centralized, and avoids project-config duplication.

### 6. Reporting & Triage

During runs, each finding is appended to `test-results/responsive-report.json`. The structure is flat — one object per finding — because that is trivial to group and filter.

After a run, `triage/generate-report.ts` reads the JSON and emits a markdown file:

```
test-results/responsive-triage.md
```

Format: a severity matrix (screen × viewport, cells show probe failure counts), followed by a per-finding breakdown sorted by severity and frequency. The top issues become the direct input to the follow-up implementation plan.

### 7. Probe Unit Tests

Each probe has a vitest unit test in `packages/client/src/test-utils/probe-fixtures/` that uses a minimal HTML fixture (served from a string via `page.setContent()`) to verify the probe detects a planted violation and passes on a clean fixture. These unit tests run in the main vitest suite, not in Playwright, keeping feedback fast for probe development.

### 8. Build Sequence

The two-agent team operates across these steps. Steps 1–3 block step 4+; within each phase, adjacent steps can progress in parallel.

| Step | Owner | Deliverable | Blocks |
|------|-------|-------------|--------|
| 1 | Harness | `viewports.ts`, `probes/types.ts`, empty probe stubs, `responsive-fixture.ts` skeleton | 4, 5 |
| 2 | Harness | Full implementation of all 6 probes + vitest unit tests for each | 6 |
| 3 | Harness | `report.ts` (JSON append), `triage/generate-report.ts` | 7 |
| 4 | Screens | `main-menu.spec.ts`, `draft.spec.ts` (no runtime state needed beyond existing `startMatch`) | 6 |
| 5 | Screens | `forge-equip.spec.ts`, `forge-combine.spec.ts`, `duel.spec.ts`, `phase-transitions.spec.ts` | 6 |
| 6 | Single | Run full matrix end-to-end, confirm report generation works | 7 |
| 7 | Single | Generate triage markdown, hand off to the implementation-plan phase | — |

### 9. Interfaces Between Agents

To prevent the Screens agent from blocking on a moving target, the Harness agent publishes the following up front (step 1), and treats changes to them as breaking:

- `VIEWPORTS` array shape and field names
- `Finding` interface
- `ProbeCtx` interface
- `runProbes(screen: string)` fixture signature
- Required data attributes each spec must add (`data-primary-action`, `data-screen-section`)

The Screens agent writes specs against this published surface even before the probes are fully implemented (they will pass trivially with empty `findings` arrays until probes are filled in, which is fine — no false negatives, and the skeleton is exercised).

### 10. Error Handling

- **Probe throws unexpectedly** (e.g., selector not found): caught by `run-all`, converted to a `fail`-severity finding with probe='<probe-name>-error'. The suite continues.
- **Screen never reaches ready state** (timeout): the spec itself fails with a normal Playwright timeout. Recorded as a separate error in the triage report but does not block other viewports in the matrix (Playwright runs subsequent tests regardless).
- **Report JSON already exists from prior run**: `report.ts` truncates on first write each run (keyed on a Playwright `globalSetup`).

### 11. Testing the Tests

Probe correctness is the only thing in this system that can silently lie — if a probe always returns `[]`, every test passes. Mitigations:

1. Each probe ships with vitest unit tests covering: a clean fixture (expect zero findings), a planted-violation fixture (expect ≥1 finding), edge cases (zero elements, viewport boundary conditions).
2. A smoke spec (`probe-smoke.spec.ts`) deliberately renders broken HTML via `page.setContent()` and asserts the aggregated probes detect ≥1 failure — catches "probe wiring" bugs where unit tests pass but the fixture doesn't actually invoke them.

## How to Build a New Screen Responsive Spec (for future use)

When adding responsive coverage for a new screen:

1. Add `data-primary-action` to the screen's main CTA.
2. Add `data-screen-section` to each top-level layout region that should count toward frame-fill (header, content, tray, footer).
3. Create `e2e/responsive/specs/<screen>.spec.ts` using the matrix-iteration pattern above.
4. Navigate to the screen's ready state, then call `runProbes('<screen-name>')`.
5. If the screen has a legitimate reason to violate a default threshold, pass an options object to `runProbes` overriding that probe's config (e.g., `runProbes('my-screen', { deadSpace: { minRatio: 0.6 } })`).

## Follow-Up Work (out of scope, tracked here)

- Visual regression suite (assertion 7 from brainstorm)
- Animation stability (assertion 8)
- Meta/settings screen coverage
- CI integration: run the responsive suite on PR, surface triage report as an artifact
- Per-device-tag probe overrides if it turns out ultrawide needs different thresholds than portrait mobile
