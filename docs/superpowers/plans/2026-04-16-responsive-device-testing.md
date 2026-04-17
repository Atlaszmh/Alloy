# Responsive & Device Testing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Playwright-based responsive-testing harness that exercises Alloy's 5 gameplay-critical screens across 13 viewport profiles, with 6 layout-integrity probes that produce a triage report driving a follow-up fix plan.

**Architecture:** Two parallel lanes — Harness (probes, fixtures, reporting) and Screens (per-screen specs that consume the harness). The Harness lane publishes its public surface (`viewports.ts`, `types.ts`, fixture skeleton, required test-hook attributes) up front so the Screens lane can write specs against the contract before probes are filled in. Specs iterate the viewport matrix inside a single test file (one process × N viewports) and call `runProbes(screen, vp)`, which runs all probes, appends findings to a shared JSON report, and throws on any `fail`-severity finding so Playwright marks the test red.

**Tech Stack:** Playwright 1.x (existing), TypeScript 5.7+, Node 20+, pnpm 9+. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-16-responsive-device-testing-design.md`

**Key paths the plan touches:**
- `packages/client/playwright.config.ts` — add `globalSetup`, register new test dir, optionally enable parallel for `responsive/`
- `packages/client/src/components/TabBar.tsx` — add `data-tabbar` attribute
- `packages/client/src/pages/{MainMenu,Draft,Forge,Duel}.tsx` — add `data-primary-action` and `data-screen-section` attributes
- `packages/client/e2e/responsive/**` — entirely new directory (this plan creates it)
- `packages/client/e2e/fixtures/match.ts` — read-only reference; do not modify
- `packages/client/src/index.css` — read-only reference for min-clamp values

---

## Chunk 1: Harness Foundations (Lane A, blocks Screens lane)

This chunk publishes the shared contract: viewport matrix, type definitions, fixture skeleton, required test-hook attributes, and `globalSetup` wiring. Once committed, the Screens lane is unblocked.

### Task 1: Create the viewport matrix

**Files:**
- Create: `packages/client/e2e/responsive/viewports.ts`

- [ ] **Step 1: Write the file**

```ts
// packages/client/e2e/responsive/viewports.ts

export type DeviceTag =
  | 'mobile'
  | 'mobile-landscape'
  | 'tablet'
  | 'tablet-landscape'
  | 'desktop'
  | 'ultrawide';

export interface Viewport {
  name: string;
  width: number;
  height: number;
  device: DeviceTag;
}

export const VIEWPORTS: readonly Viewport[] = [
  { name: 'galaxy-fold',       width: 344,  height: 882,  device: 'mobile' },
  { name: 'iphone-se',         width: 375,  height: 667,  device: 'mobile' },
  { name: 'iphone-15-pro',     width: 393,  height: 852,  device: 'mobile' },
  { name: 'pixel-7',           width: 412,  height: 915,  device: 'mobile' },
  { name: 'iphone-14-pro-max', width: 430,  height: 932,  device: 'mobile' },
  { name: 'iphone-landscape',  width: 852,  height: 393,  device: 'mobile-landscape' },
  { name: 'ipad-portrait',     width: 768,  height: 1024, device: 'tablet' },
  { name: 'ipad-landscape',    width: 1024, height: 768,  device: 'tablet-landscape' },
  { name: 'desktop-1280',      width: 1280, height: 800,  device: 'desktop' },
  { name: 'fhd',               width: 1920, height: 1080, device: 'desktop' },
  { name: '2k-dci',            width: 2048, height: 1080, device: 'desktop' },
  { name: 'qhd-1440p',         width: 2560, height: 1440, device: 'desktop' },
  { name: 'ultrawide',         width: 2560, height: 1080, device: 'ultrawide' },
] as const;
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/e2e/responsive/viewports.ts
git commit -m "test(responsive): add 13-viewport matrix"
```

---

### Task 2: Create the probe type contract

**Files:**
- Create: `packages/client/e2e/responsive/probes/types.ts`

- [ ] **Step 1: Write the file**

```ts
// packages/client/e2e/responsive/probes/types.ts
import type { Page } from '@playwright/test';
import type { Viewport } from '../viewports';

export type Severity = 'fail' | 'warn';

export interface Finding {
  screen: string;
  viewport: string;
  probe: string;
  severity: Severity;
  detail: string;
  measured?: number;
  expected?: number;
}

export interface ProbeCtx {
  screen: string;
  viewport: Viewport;
}

export type Probe = (page: Page, ctx: ProbeCtx) => Promise<Finding[]>;
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/e2e/responsive/probes/types.ts
git commit -m "test(responsive): add probe type contract"
```

---

### Task 3: Stub out the six probes (return empty arrays)

**Files:**
- Create: `packages/client/e2e/responsive/probes/overflow.ts`
- Create: `packages/client/e2e/responsive/probes/tabbar.ts`
- Create: `packages/client/e2e/responsive/probes/reachability.ts`
- Create: `packages/client/e2e/responsive/probes/dead-space.ts`
- Create: `packages/client/e2e/responsive/probes/min-size.ts`

These exist so the Screens lane can import the public probe surface immediately; real implementations land in Chunk 2.

- [ ] **Step 1: Write each stub file with the same shape**

```ts
// packages/client/e2e/responsive/probes/overflow.ts
import type { Probe } from './types';

export const overflowX: Probe = async () => [];
export const overflowY: Probe = async () => [];
```

```ts
// packages/client/e2e/responsive/probes/tabbar.ts
import type { Probe } from './types';

export const tabBarVisibility: Probe = async () => [];
```

```ts
// packages/client/e2e/responsive/probes/reachability.ts
import type { Probe } from './types';

export const primaryActionReachable: Probe = async () => [];
```

```ts
// packages/client/e2e/responsive/probes/dead-space.ts
import type { Probe, ProbeCtx, Finding } from './types';

export interface DeadSpaceOptions {
  /** Minimum acceptable contentHeight / frameHeight ratio. Default 0.80. */
  minRatio?: number;
}

export const deadSpace = (options: DeadSpaceOptions = {}): Probe =>
  async (_page, _ctx: ProbeCtx): Promise<Finding[]> => {
    void options;
    return [];
  };

// Default no-options probe used by run-all when no override supplied.
export const deadSpaceDefault: Probe = deadSpace();
```

```ts
// packages/client/e2e/responsive/probes/min-size.ts
import type { Probe } from './types';

export const minSize: Probe = async () => [];
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/e2e/responsive/probes/overflow.ts \
        packages/client/e2e/responsive/probes/tabbar.ts \
        packages/client/e2e/responsive/probes/reachability.ts \
        packages/client/e2e/responsive/probes/dead-space.ts \
        packages/client/e2e/responsive/probes/min-size.ts
git commit -m "test(responsive): stub probe modules with public types"
```

---

### Task 4: Build the report module

**Files:**
- Create: `packages/client/e2e/responsive/probes/report.ts`

- [ ] **Step 1: Write the file**

```ts
// packages/client/e2e/responsive/probes/report.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Finding } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_PATH = path.resolve(
  __dirname,
  '..', '..', '..', // packages/client/
  'test-results',
  'responsive-report.json',
);

export function reportPath(): string {
  return REPORT_PATH;
}

export function truncateReport(): void {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, '[]', 'utf8');
}

export function appendFinding(finding: Finding): void {
  // File-locking via append-then-rewrite. Workers are likely serial; if
  // parallelism is enabled later, this is the place to add a lockfile.
  let existing: Finding[] = [];
  try {
    const raw = fs.readFileSync(REPORT_PATH, 'utf8');
    existing = JSON.parse(raw) as Finding[];
  } catch {
    existing = [];
  }
  existing.push(finding);
  fs.writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2), 'utf8');
}

export function readReport(): Finding[] {
  try {
    return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')) as Finding[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/e2e/responsive/probes/report.ts
git commit -m "test(responsive): add JSON finding report module"
```

---

### Task 5: Build the run-all probe aggregator

**Files:**
- Create: `packages/client/e2e/responsive/probes/run-all.ts`

- [ ] **Step 1: Write the file**

```ts
// packages/client/e2e/responsive/probes/run-all.ts
import type { Page } from '@playwright/test';
import type { Finding, ProbeCtx } from './types';
import { overflowX, overflowY } from './overflow';
import { tabBarVisibility } from './tabbar';
import { primaryActionReachable } from './reachability';
import { deadSpace, type DeadSpaceOptions } from './dead-space';
import { minSize } from './min-size';

export interface ProbeOverrides {
  deadSpace?: DeadSpaceOptions;
}

const FRAME_MISSING_PROBE = 'frame-missing';

export async function runAllProbes(
  page: Page,
  ctx: ProbeCtx,
  overrides?: ProbeOverrides,
): Promise<Finding[]> {
  // Frame-missing guard: if .app-frame never rendered, emit one finding and bail.
  const frameExists = await page.evaluate(() =>
    Boolean(document.querySelector('.app-frame')),
  );
  if (!frameExists) {
    return [{
      screen: ctx.screen,
      viewport: ctx.viewport.name,
      probe: FRAME_MISSING_PROBE,
      severity: 'fail',
      detail: '.app-frame element not present at probe time',
    }];
  }

  const probes = [
    { name: 'overflow-x', fn: overflowX },
    { name: 'overflow-y', fn: overflowY },
    { name: 'tabbar-visibility', fn: tabBarVisibility },
    { name: 'primary-action-reachable', fn: primaryActionReachable },
    { name: 'dead-space', fn: deadSpace(overrides?.deadSpace ?? {}) },
    { name: 'min-size', fn: minSize },
  ];

  const all: Finding[] = [];
  for (const { name, fn } of probes) {
    try {
      const findings = await fn(page, ctx);
      all.push(...findings);
    } catch (err) {
      all.push({
        screen: ctx.screen,
        viewport: ctx.viewport.name,
        probe: `${name}-error`,
        severity: 'fail',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return all;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/e2e/responsive/probes/run-all.ts
git commit -m "test(responsive): add probe aggregator with frame-missing guard"
```

---

### Task 6: Build the responsive fixture

**Files:**
- Create: `packages/client/e2e/responsive/fixtures/responsive-fixture.ts`

- [ ] **Step 1: Write the file**

```ts
// packages/client/e2e/responsive/fixtures/responsive-fixture.ts
import { test as base } from '@playwright/test';
import { runAllProbes, type ProbeOverrides } from '../probes/run-all';
import { appendFinding } from '../probes/report';
import type { Viewport } from '../viewports';

export interface RunProbesOptions {
  /** Per-probe threshold overrides (e.g., { deadSpace: { minRatio: 0.6 } }). */
  overrides?: ProbeOverrides;
}

export type RunProbes = (
  screen: string,
  vp: Viewport,
  options?: RunProbesOptions,
) => Promise<void>;

export const test = base.extend<{ runProbes: RunProbes }>({
  runProbes: async ({ page }, use) => {
    await use(async (screen, vp, options) => {
      const findings = await runAllProbes(
        page,
        { screen, viewport: vp },
        options?.overrides,
      );
      findings.forEach(appendFinding);
      const failures = findings.filter((f) => f.severity === 'fail');
      if (failures.length > 0) {
        throw new Error(
          `Responsive violations on ${screen} @ ${vp.name}:\n` +
            failures.map((f) => `  [${f.probe}] ${f.detail}`).join('\n'),
        );
      }
    });
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/e2e/responsive/fixtures/responsive-fixture.ts
git commit -m "test(responsive): add fixture exposing runProbes helper"
```

---

### Task 7: Add `data-tabbar` to TabBar

**Files:**
- Modify: `packages/client/src/components/TabBar.tsx:28-41`

- [ ] **Step 1: Edit the root `<div>` of TabBar.tsx to add `data-tabbar`**

Find the outer `<div>` opening tag (around line 29) and add the attribute:

```tsx
<div
  data-tabbar
  style={{
    height: 'var(--tabbar-h)',
    flexShrink: 0,
    // ... rest unchanged
  }}
>
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
pnpm --filter @alloy/client test --run
```

Expected: all pass (data-attributes don't change behavior).

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/TabBar.tsx
git commit -m "test(client): add data-tabbar hook for responsive probes"
```

---

### Task 8: Wire globalSetup + dedicated `responsive` Playwright project

**Files:**
- Create: `packages/client/e2e/responsive/global-setup.ts`
- Modify: `packages/client/playwright.config.ts`

The existing config has 4 device projects (iphone-se, iphone-15-pro, pixel-7, desktop). Without scoping, every responsive spec would run 4× (once per project) and duplicate-append findings to the report — same `(screen, viewport, probe)` tuple appearing 4 times. The fix is two-part: add a single dedicated `responsive` project that runs only the responsive directory, and exclude the responsive directory from the 4 device projects.

- [ ] **Step 1: Write the global-setup script**

```ts
// packages/client/e2e/responsive/global-setup.ts
import { truncateReport } from './probes/report';

export default async function globalSetup(): Promise<void> {
  truncateReport();
}
```

- [ ] **Step 2: Edit `playwright.config.ts`**

Open `packages/client/playwright.config.ts`. Make three changes:

1. Add `globalSetup: './e2e/responsive/global-setup.ts'` near the top of `defineConfig`.
2. Add `testIgnore: ['responsive/**']` to each of the 4 existing projects (iphone-se, iphone-15-pro, pixel-7, desktop).
3. Append a new project at the end of the `projects` array:

```ts
{
  name: 'responsive',
  testMatch: /responsive\/.*\.spec\.ts$/,
  use: {
    browserName: 'chromium',
    // Viewport overridden per-test via page.setViewportSize.
    // Probes care about layout, not touch/DPR semantics.
    viewport: { width: 1280, height: 800 },
  },
},
```

The full edited config should look like:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/responsive/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],

  projects: [
    {
      name: 'iphone-se',
      testIgnore: ['responsive/**'],
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'iphone-15-pro',
      testIgnore: ['responsive/**'],
      use: {
        browserName: 'chromium',
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'pixel-7',
      testIgnore: ['responsive/**'],
      use: {
        browserName: 'chromium',
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2.625,
      },
    },
    {
      name: 'desktop',
      testIgnore: ['responsive/**'],
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'responsive',
      testMatch: /responsive\/.*\.spec\.ts$/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: {
    command: 'npx vite --port 5199',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:5199',
  },
});
```

- [ ] **Step 3: Verify project lists without error**

```bash
pnpm --filter @alloy/client exec playwright test --list
```

Expected: lists existing tests under their device projects, plus responsive specs (will be empty until Chunk 4) under the `responsive` project.

- [ ] **Step 4: Verify the responsive project is the only one that picks up `e2e/responsive/`**

```bash
pnpm --filter @alloy/client exec playwright test --list --project=iphone-se 2>&1 | grep -c responsive || echo "0 (expected)"
pnpm --filter @alloy/client exec playwright test --list --project=responsive 2>&1 | grep -c responsive || echo "0 for now (specs land in Chunk 1 task 9 + Chunk 4)"
```

Expected: `0 (expected)` from iphone-se. Responsive project may show 0 until Task 9 lands.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/responsive/global-setup.ts packages/client/playwright.config.ts
git commit -m "test(responsive): dedicated playwright project + globalSetup, exclude from device projects"
```

---

### Task 9: Smoke-test the harness contract end-to-end

**Files:**
- Create: `packages/client/e2e/responsive/probes/__tests__/contract.spec.ts`

This spec runs the stubbed probes against a trivial page to prove the wiring works (fixture → run-all → report → assertion). It will pass with stubs returning `[]`; in Chunk 2 it confirms real probes don't break the wiring either.

- [ ] **Step 1: Write the test**

```ts
// packages/client/e2e/responsive/probes/__tests__/contract.spec.ts
import { test, expect } from '../../fixtures/responsive-fixture';
import { VIEWPORTS } from '../../viewports';
import { readReport } from '../report';

test('contract: stubbed probes produce no findings, fixture writes empty report', async ({
  page,
  runProbes,
}) => {
  // Minimal HTML containing .app-frame so the frame-missing guard passes.
  await page.setContent(`
    <!doctype html>
    <html><body>
      <div class="app-frame" style="width: 100px; height: 100px;"></div>
    </body></html>
  `);
  const vp = VIEWPORTS[0];
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await runProbes('contract-smoke', vp);

  const findings = readReport();
  expect(findings.length).toBe(0);
});
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/contract.spec.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/responsive/probes/__tests__/contract.spec.ts
git commit -m "test(responsive): contract smoke spec for harness wiring"
```

---

### Task 10: Chunk 1 plan-review checkpoint

- [ ] **Step 1: Verify deliverables**

Confirm all of these exist and import without error:

```bash
ls packages/client/e2e/responsive/viewports.ts \
   packages/client/e2e/responsive/probes/types.ts \
   packages/client/e2e/responsive/probes/run-all.ts \
   packages/client/e2e/responsive/probes/report.ts \
   packages/client/e2e/responsive/fixtures/responsive-fixture.ts \
   packages/client/e2e/responsive/global-setup.ts
grep -q 'data-tabbar' packages/client/src/components/TabBar.tsx
```

Expected: all paths listed; grep finds the attribute.

- [ ] **Step 2: Commit checkpoint marker (no code change)**

```bash
git commit --allow-empty -m "test(responsive): chunk 1 (harness foundations) complete"
```

---

## Chunk 2: Real Probes (Lane A)

Replace each stub with the real implementation. Each probe is built TDD-style: a self-test under `__tests__/` first (using `page.setContent()` with planted violations), then the real probe code, then re-run the test.

### Task 11: Implement `overflowX` probe

**Files:**
- Create: `packages/client/e2e/responsive/probes/__tests__/overflow.spec.ts`
- Modify: `packages/client/e2e/responsive/probes/overflow.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/e2e/responsive/probes/__tests__/overflow.spec.ts
import { test, expect } from '@playwright/test';
import { overflowX, overflowY } from '../overflow';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1]; // iphone-se 375x667
const CTX = { screen: 'test', viewport: VP };

test.describe('overflowX', () => {
  test('clean fixture produces no findings', async ({ page }) => {
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 375px; height: 667px;"></div>
      </body></html>
    `);
    const findings = await overflowX(page, CTX);
    expect(findings).toEqual([]);
  });

  test('detects element wider than viewport', async ({ page }) => {
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 375px; height: 667px;"></div>
        <div id="bad" style="width: 9999px; height: 10px; background: red;"></div>
      </body></html>
    `);
    const findings = await overflowX(page, CTX);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatchObject({
      probe: 'overflow-x',
      severity: 'fail',
    });
    expect(findings[0].detail).toContain('#bad');
  });
});
```

- [ ] **Step 2: Run the test, watch it fail**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/overflow.spec.ts
```

Expected: "detects element wider than viewport" fails (stub returns `[]`).

- [ ] **Step 3: Implement `overflowX`**

Replace the stub in `packages/client/e2e/responsive/probes/overflow.ts`:

```ts
// packages/client/e2e/responsive/probes/overflow.ts
import type { Probe, Finding } from './types';

const PROBE_X = 'overflow-x';
const PROBE_Y = 'overflow-y';

export const overflowX: Probe = async (page, ctx) => {
  const data = await page.evaluate((vw) => {
    const docW = document.documentElement.scrollWidth;
    if (docW <= vw) return { docW, offenders: [] as string[] };
    const offenders: string[] = [];
    document.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (offenders.length >= 5) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 0.5) {
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}`
          : '';
        offenders.push(`${el.tagName.toLowerCase()}${id}${cls}`);
      }
    });
    return { docW, offenders };
  }, ctx.viewport.width);

  if (data.docW <= ctx.viewport.width) return [];
  const finding: Finding = {
    screen: ctx.screen,
    viewport: ctx.viewport.name,
    probe: PROBE_X,
    severity: 'fail',
    detail: `documentElement.scrollWidth=${data.docW} exceeds viewport ${ctx.viewport.width}; offenders: ${data.offenders.join(', ') || '(unidentified)'}`,
    measured: data.docW,
    expected: ctx.viewport.width,
  };
  return [finding];
};

export const overflowY: Probe = async () => []; // implemented in next task
```

- [ ] **Step 4: Re-run the test, watch it pass**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/overflow.spec.ts -g overflowX
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/responsive/probes/overflow.ts \
        packages/client/e2e/responsive/probes/__tests__/overflow.spec.ts
git commit -m "test(responsive): implement overflowX probe"
```

---

### Task 12: Implement `overflowY` probe

**Files:**
- Modify: `packages/client/e2e/responsive/probes/__tests__/overflow.spec.ts`
- Modify: `packages/client/e2e/responsive/probes/overflow.ts`

- [ ] **Step 1: Add failing tests**

Append to `overflow.spec.ts`:

```ts
test.describe('overflowY', () => {
  test('clean fixture produces no findings', async ({ page }) => {
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 375px; height: 667px; position: relative;">
          <div id="ok" style="width: 100px; height: 50px; background: green;"></div>
        </div>
      </body></html>
    `);
    const findings = await overflowY(page, CTX);
    expect(findings).toEqual([]);
  });

  test('detects descendant spilling past .app-frame bottom', async ({ page }) => {
    await page.setViewportSize({ width: VP.width, height: VP.height });
    await page.setContent(`
      <html><body style="margin:0">
        <div class="app-frame" style="width: 375px; height: 667px; position: relative; overflow: visible;">
          <div id="bad" style="position: absolute; top: 700px; width: 100px; height: 50px; background: red;"></div>
        </div>
      </body></html>
    `);
    const findings = await overflowY(page, CTX);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatchObject({
      probe: 'overflow-y',
      severity: 'fail',
    });
    expect(findings[0].detail).toContain('#bad');
  });
});
```

- [ ] **Step 2: Run, watch the new tests fail**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/overflow.spec.ts -g overflowY
```

Expected: clean passes, descendant test fails.

- [ ] **Step 3: Implement `overflowY`**

Replace the stub in `overflow.ts`:

```ts
export const overflowY: Probe = async (page, ctx) => {
  const data = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (!frame) return null;
    const frameBottom = frame.getBoundingClientRect().bottom;
    const offenders: { selector: string; bottom: number }[] = [];
    frame.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (offenders.length >= 5) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > frameBottom + 0.5) {
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}`
          : '';
        offenders.push({ selector: `${el.tagName.toLowerCase()}${id}${cls}`, bottom: r.bottom });
      }
    });
    return { frameBottom, offenders };
  });

  if (!data || data.offenders.length === 0) return [];
  return [{
    screen: ctx.screen,
    viewport: ctx.viewport.name,
    probe: PROBE_Y,
    severity: 'fail',
    detail: `descendants spill past .app-frame bottom (${data.frameBottom.toFixed(1)}): ${data.offenders.map(o => `${o.selector}@${o.bottom.toFixed(1)}`).join(', ')}`,
    measured: Math.max(...data.offenders.map(o => o.bottom)),
    expected: data.frameBottom,
  }];
};
```

- [ ] **Step 4: Re-run, watch it pass**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/overflow.spec.ts
```

Expected: 4 passed (overflowX clean+bad, overflowY clean+bad).

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/responsive/probes/overflow.ts \
        packages/client/e2e/responsive/probes/__tests__/overflow.spec.ts
git commit -m "test(responsive): implement overflowY probe"
```

---

### Task 13: Implement `tabBarVisibility` probe

**Files:**
- Create: `packages/client/e2e/responsive/probes/__tests__/tabbar.spec.ts`
- Modify: `packages/client/e2e/responsive/probes/tabbar.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/e2e/responsive/probes/__tests__/tabbar.spec.ts
import { test, expect } from '@playwright/test';
import { tabBarVisibility } from '../tabbar';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1]; // iphone-se
const CTX = { screen: 'test', viewport: VP };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VP.width, height: VP.height });
});

test('clean: tab bar visible, primary action above it → no findings', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width: 375px; height: 667px; position: relative;">
        <button data-primary-action style="position:absolute; top: 100px; width: 100px; height: 40px;">CTA</button>
        <div data-tabbar style="position:absolute; bottom:0; left:0; right:0; height: 50px; background:#222;"></div>
      </div>
    </body></html>
  `);
  expect(await tabBarVisibility(page, CTX)).toEqual([]);
});

test('fail: tab bar missing → finding with probe=tabbar-visibility', async ({ page }) => {
  await page.setContent(`
    <html><body><div class="app-frame" style="width:375px;height:667px"></div></body></html>
  `);
  const findings = await tabBarVisibility(page, CTX);
  expect(findings.length).toBeGreaterThan(0);
  expect(findings[0].probe).toBe('tabbar-visibility');
  expect(findings[0].detail).toMatch(/missing|not found/i);
});

test('fail: primary action overlaps tab bar', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width: 375px; height: 667px; position: relative;">
        <button data-primary-action style="position:absolute; bottom: 10px; left:10px; width: 100px; height: 40px;">CTA</button>
        <div data-tabbar style="position:absolute; bottom:0; left:0; right:0; height: 50px; background:#222;"></div>
      </div>
    </body></html>
  `);
  const findings = await tabBarVisibility(page, CTX);
  expect(findings.some(f => f.detail.match(/overlap/i))).toBe(true);
});
```

- [ ] **Step 2: Run, watch fail**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/tabbar.spec.ts
```

Expected: stub returns `[]`, the two fail-cases fail.

- [ ] **Step 3: Implement**

```ts
// packages/client/e2e/responsive/probes/tabbar.ts
import type { Probe, Finding } from './types';

const PROBE = 'tabbar-visibility';

export const tabBarVisibility: Probe = async (page, ctx) => {
  const result = await page.evaluate(() => {
    const tabbar = document.querySelector<HTMLElement>('[data-tabbar]');
    if (!tabbar) return { missing: true } as const;
    const r = tabbar.getBoundingClientRect();
    const styles = window.getComputedStyle(tabbar);
    const visible =
      styles.display !== 'none' &&
      styles.visibility !== 'hidden' &&
      parseFloat(styles.opacity) > 0 &&
      r.width > 0 &&
      r.height > 0;
    const inViewport =
      r.top < window.innerHeight && r.bottom > 0 &&
      r.left < window.innerWidth && r.right > 0;

    const overlaps: string[] = [];
    document.querySelectorAll<HTMLElement>('[data-primary-action]').forEach((el) => {
      const er = el.getBoundingClientRect();
      const intersects =
        er.right > r.left && er.left < r.right &&
        er.bottom > r.top && er.top < r.bottom;
      if (intersects) {
        overlaps.push(el.id ? `#${el.id}` : el.tagName.toLowerCase());
      }
    });
    return { missing: false, visible, inViewport, overlaps, rect: { top: r.top, bottom: r.bottom } };
  });

  const findings: Finding[] = [];
  if (result.missing) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'fail', detail: '[data-tabbar] element missing from DOM',
    });
    return findings;
  }
  if (!result.visible) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'fail', detail: 'tab bar present but not visible (display/opacity/zero size)',
    });
  }
  if (!result.inViewport) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'fail', detail: 'tab bar rect outside viewport',
    });
  }
  if (result.overlaps && result.overlaps.length > 0) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'fail',
      detail: `tab bar overlaps primary action(s): ${result.overlaps.join(', ')}`,
    });
  }
  return findings;
};
```

- [ ] **Step 4: Re-run, watch all pass**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/tabbar.spec.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/responsive/probes/tabbar.ts \
        packages/client/e2e/responsive/probes/__tests__/tabbar.spec.ts
git commit -m "test(responsive): implement tabBarVisibility probe"
```

---

### Task 14: Implement `primaryActionReachable` probe

**Files:**
- Create: `packages/client/e2e/responsive/probes/__tests__/reachability.spec.ts`
- Modify: `packages/client/e2e/responsive/probes/reachability.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/e2e/responsive/probes/__tests__/reachability.spec.ts
import { test, expect } from '@playwright/test';
import { primaryActionReachable } from '../reachability';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1];
const CTX = { screen: 'test', viewport: VP };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VP.width, height: VP.height });
});

test('clean: 40x40 primary action on-screen → no findings', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <button data-primary-action style="width:40px;height:40px">OK</button>
      </div>
    </body></html>
  `);
  expect(await primaryActionReachable(page, CTX)).toEqual([]);
});

test('warn-but-no-fail when no primary action present', async ({ page }) => {
  // If a screen has no data-primary-action, that's a setup gap, not a layout bug.
  // Probe should emit a warn-severity finding so it surfaces in triage.
  await page.setContent(`
    <html><body><div class="app-frame" style="width:375px;height:667px"></div></body></html>
  `);
  const findings = await primaryActionReachable(page, CTX);
  expect(findings.length).toBe(1);
  expect(findings[0].severity).toBe('warn');
});

test('fail: action below 36px touch target', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <button data-primary-action style="width:20px;height:20px">x</button>
      </div>
    </body></html>
  `);
  const findings = await primaryActionReachable(page, CTX);
  expect(findings.some(f => f.severity === 'fail' && f.detail.match(/touch.*target|too small/i))).toBe(true);
});

test('fail: action off-screen', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px;position:relative">
        <button data-primary-action style="position:absolute;top:9999px;width:40px;height:40px">x</button>
      </div>
    </body></html>
  `);
  const findings = await primaryActionReachable(page, CTX);
  expect(findings.some(f => f.severity === 'fail' && f.detail.match(/off-?screen|outside viewport/i))).toBe(true);
});
```

- [ ] **Step 2: Run, watch fail**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/reachability.spec.ts
```

- [ ] **Step 3: Implement**

```ts
// packages/client/e2e/responsive/probes/reachability.ts
import type { Probe, Finding } from './types';

const PROBE = 'primary-action-reachable';
const MIN_TOUCH = 36;

export const primaryActionReachable: Probe = async (page, ctx) => {
  const findings: Finding[] = [];
  const items = await page.evaluate(({ vw, vh }) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-primary-action]'));
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        id: el.id || el.tagName.toLowerCase(),
        rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        visible: styles.display !== 'none' && styles.visibility !== 'hidden' && parseFloat(styles.opacity) > 0,
        offscreen: r.top < 0 || r.left < 0 || r.right > vw || r.bottom > vh,
      };
    });
  }, { vw: ctx.viewport.width, vh: ctx.viewport.height });

  if (items.length === 0) {
    findings.push({
      screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
      severity: 'warn',
      detail: 'no [data-primary-action] element found on this screen — add the attribute or expect this warning',
    });
    return findings;
  }
  for (const it of items) {
    if (!it.visible) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail', detail: `primary action ${it.id} not visible`,
      });
      continue;
    }
    if (it.offscreen) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `primary action ${it.id} off-screen (rect outside viewport ${ctx.viewport.width}×${ctx.viewport.height})`,
      });
    }
    if (it.rect.width < MIN_TOUCH || it.rect.height < MIN_TOUCH) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `primary action ${it.id} below 36×36 touch target (measured ${it.rect.width.toFixed(1)}×${it.rect.height.toFixed(1)})`,
        measured: Math.min(it.rect.width, it.rect.height),
        expected: MIN_TOUCH,
      });
    }
  }
  return findings;
};
```

- [ ] **Step 4: Re-run, all pass**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/reachability.spec.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/responsive/probes/reachability.ts \
        packages/client/e2e/responsive/probes/__tests__/reachability.spec.ts
git commit -m "test(responsive): implement primaryActionReachable probe"
```

---

### Task 15: Implement `deadSpace` probe

**Files:**
- Create: `packages/client/e2e/responsive/probes/__tests__/dead-space.spec.ts`
- Modify: `packages/client/e2e/responsive/probes/dead-space.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/e2e/responsive/probes/__tests__/dead-space.spec.ts
import { test, expect } from '@playwright/test';
import { deadSpace } from '../dead-space';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1];
const CTX = { screen: 'test', viewport: VP };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VP.width, height: VP.height });
});

test('clean: sections sum to 90% of frame → no findings', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:600px">
        <div data-screen-section style="height:300px"></div>
        <div data-screen-section style="height:240px"></div>
      </div>
    </body></html>
  `);
  expect(await deadSpace()(page, CTX)).toEqual([]);
});

test('fail: sections sum to 50% → finding', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:600px">
        <div data-screen-section style="height:300px"></div>
      </div>
    </body></html>
  `);
  const findings = await deadSpace()(page, CTX);
  expect(findings.length).toBe(1);
  expect(findings[0]).toMatchObject({ probe: 'dead-space', severity: 'fail' });
  expect(findings[0].measured).toBeLessThan(0.55);
});

test('respects override: 0.4 threshold accepts 50% fill', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:600px">
        <div data-screen-section style="height:300px"></div>
      </div>
    </body></html>
  `);
  expect(await deadSpace({ minRatio: 0.4 })(page, CTX)).toEqual([]);
});

test('warns when no [data-screen-section] markers present', async ({ page }) => {
  await page.setContent(`
    <html><body><div class="app-frame" style="width:375px;height:600px"></div></body></html>
  `);
  const findings = await deadSpace()(page, CTX);
  expect(findings.length).toBe(1);
  expect(findings[0].severity).toBe('warn');
});
```

- [ ] **Step 2: Run, watch fail**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/dead-space.spec.ts
```

- [ ] **Step 3: Implement**

```ts
// packages/client/e2e/responsive/probes/dead-space.ts
import type { Probe, ProbeCtx, Finding } from './types';

const PROBE = 'dead-space';
const DEFAULT_MIN_RATIO = 0.80;

export interface DeadSpaceOptions {
  /** Minimum acceptable contentHeight / frameHeight ratio. Default 0.80. */
  minRatio?: number;
}

export const deadSpace = (options: DeadSpaceOptions = {}): Probe =>
  async (page, ctx: ProbeCtx): Promise<Finding[]> => {
    const minRatio = options.minRatio ?? DEFAULT_MIN_RATIO;
    const data = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('.app-frame');
      if (!frame) return null;
      const fr = frame.getBoundingClientRect();
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-screen-section]'));
      const totalHeight = sections.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
      return {
        frameHeight: fr.height,
        sectionCount: sections.length,
        totalHeight,
      };
    });

    if (!data) return []; // frame-missing handled upstream
    if (data.sectionCount === 0) {
      return [{
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'warn',
        detail: 'no [data-screen-section] markers present — add them for dead-space measurement',
      }];
    }

    const ratio = data.frameHeight > 0 ? data.totalHeight / data.frameHeight : 0;
    if (ratio < minRatio) {
      return [{
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `content fills ${(ratio * 100).toFixed(1)}% of frame (${data.totalHeight.toFixed(0)}/${data.frameHeight.toFixed(0)}), below ${(minRatio * 100).toFixed(0)}% threshold`,
        measured: ratio,
        expected: minRatio,
      }];
    }
    return [];
  };

export const deadSpaceDefault: Probe = deadSpace();
```

- [ ] **Step 4: Re-run, all pass**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/dead-space.spec.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/responsive/probes/dead-space.ts \
        packages/client/e2e/responsive/probes/__tests__/dead-space.spec.ts
git commit -m "test(responsive): implement deadSpace probe"
```

---

### Task 16: Implement `minSize` probe

**Files:**
- Create: `packages/client/e2e/responsive/probes/__tests__/min-size.spec.ts`
- Modify: `packages/client/e2e/responsive/probes/min-size.ts`

The probe asserts gem cards (`[data-gem]`) are ≥ 90px (the `--gem-size` clamp floor in `index.css`), forge sockets (`.forge-socket`) are ≥ 40px (`--socket-size` floor), and any text inside `[data-screen-section]` has `font-size` ≥ 8px (`--text-2xs` floor).

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/e2e/responsive/probes/__tests__/min-size.spec.ts
import { test, expect } from '@playwright/test';
import { minSize } from '../min-size';
import { VIEWPORTS } from '../../viewports';

const VP = VIEWPORTS[1];
const CTX = { screen: 'test', viewport: VP };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VP.width, height: VP.height });
});

test('clean: gem at 90px, socket at 40px, text at 12px → no findings', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <div data-gem style="width:90px;height:90px"></div>
        <div class="forge-socket" style="width:40px;height:40px"></div>
        <div data-screen-section><span style="font-size:12px">hi</span></div>
      </div>
    </body></html>
  `);
  expect(await minSize(page, CTX)).toEqual([]);
});

test('fail: gem below 90px floor', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <div data-gem id="tiny-gem" style="width:50px;height:50px"></div>
      </div>
    </body></html>
  `);
  const findings = await minSize(page, CTX);
  expect(findings.some(f => f.detail.includes('gem') && f.severity === 'fail')).toBe(true);
});

test('fail: socket below 40px floor', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <div class="forge-socket" id="tiny-sock" style="width:20px;height:20px"></div>
      </div>
    </body></html>
  `);
  const findings = await minSize(page, CTX);
  expect(findings.some(f => f.detail.includes('socket') && f.severity === 'fail')).toBe(true);
});

test('fail: text below 8px floor inside [data-screen-section]', async ({ page }) => {
  await page.setContent(`
    <html><body style="margin:0">
      <div class="app-frame" style="width:375px;height:667px">
        <div data-screen-section><span style="font-size:6px">tiny</span></div>
      </div>
    </body></html>
  `);
  const findings = await minSize(page, CTX);
  expect(findings.some(f => f.detail.includes('font-size') && f.severity === 'fail')).toBe(true);
});
```

- [ ] **Step 2: Run, watch fail**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/min-size.spec.ts
```

- [ ] **Step 3: Implement**

```ts
// packages/client/e2e/responsive/probes/min-size.ts
import type { Probe, Finding } from './types';

const PROBE = 'min-size';

// Mirrors clamp() floors in packages/client/src/index.css.
// If those clamps change, update this table in the same commit.
const MIN_GEM_SIZE = 90;
const MIN_SOCKET_SIZE = 40;
const MIN_TEXT_PX = 8;

export const minSize: Probe = async (page, ctx) => {
  const data = await page.evaluate(() => {
    const elementMin = (selector: string) => {
      return Array.from(document.querySelectorAll<HTMLElement>(selector)).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.id || el.tagName.toLowerCase(),
          width: r.width,
          height: r.height,
        };
      });
    };
    const texts: { id: string; size: number }[] = [];
    document.querySelectorAll<HTMLElement>('[data-screen-section]').forEach((section) => {
      section.querySelectorAll<HTMLElement>('*').forEach((el) => {
        if (el.textContent && el.textContent.trim().length > 0) {
          const fs = parseFloat(window.getComputedStyle(el).fontSize);
          if (Number.isFinite(fs)) {
            texts.push({ id: el.id || el.tagName.toLowerCase(), size: fs });
          }
        }
      });
    });
    return {
      gems: elementMin('[data-gem]'),
      sockets: elementMin('.forge-socket'),
      texts,
    };
  });

  const findings: Finding[] = [];
  for (const g of data.gems) {
    if (g.width > 0 && g.height > 0 && (g.width < MIN_GEM_SIZE || g.height < MIN_GEM_SIZE)) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `gem ${g.id} ${g.width.toFixed(1)}×${g.height.toFixed(1)} below ${MIN_GEM_SIZE}px floor`,
        measured: Math.min(g.width, g.height),
        expected: MIN_GEM_SIZE,
      });
    }
  }
  for (const s of data.sockets) {
    if (s.width > 0 && s.height > 0 && (s.width < MIN_SOCKET_SIZE || s.height < MIN_SOCKET_SIZE)) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `socket ${s.id} ${s.width.toFixed(1)}×${s.height.toFixed(1)} below ${MIN_SOCKET_SIZE}px floor`,
        measured: Math.min(s.width, s.height),
        expected: MIN_SOCKET_SIZE,
      });
    }
  }
  for (const t of data.texts) {
    if (t.size < MIN_TEXT_PX) {
      findings.push({
        screen: ctx.screen, viewport: ctx.viewport.name, probe: PROBE,
        severity: 'fail',
        detail: `${t.id} font-size ${t.size.toFixed(1)}px below ${MIN_TEXT_PX}px floor`,
        measured: t.size,
        expected: MIN_TEXT_PX,
      });
    }
  }
  return findings;
};
```

- [ ] **Step 4: Re-run, all pass**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/min-size.spec.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/responsive/probes/min-size.ts \
        packages/client/e2e/responsive/probes/__tests__/min-size.spec.ts
git commit -m "test(responsive): implement minSize probe"
```

---

### Task 17: Re-run the contract smoke spec to confirm probes don't break wiring

- [ ] **Step 1: Run**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/contract.spec.ts
```

Expected: still passes (clean fixture has no violations across any of the 6 real probes — the warn for "no primary action" in reachability is a `warn`, not a `fail`, and the warn for "no screen-section markers" in dead-space is also a `warn`; both are appended to the report but do not throw).

- [ ] **Step 2: Verify the contract spec still asserts findings.length === 0**

The original contract test asserted zero findings. With real probes, two warns now exist. Update the assertion:

```ts
const findings = readReport();
const fails = findings.filter(f => f.severity === 'fail');
expect(fails.length).toBe(0);
```

Apply that edit, re-run, expect 1 passed.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/responsive/probes/__tests__/contract.spec.ts
git commit -m "test(responsive): contract spec asserts on fail-severity only"
```

---

### Task 18: Chunk 2 checkpoint

- [ ] **Step 1: Run all probe self-tests + contract**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/
```

Expected: every spec passes.

- [ ] **Step 2: Commit checkpoint marker**

```bash
git commit --allow-empty -m "test(responsive): chunk 2 (probe implementations) complete"
```

---

## Chunk 3: Reporting & Triage (Lane A)

### Task 19: Build the triage report generator

**Files:**
- Create: `packages/client/e2e/responsive/triage/generate-report.ts`

- [ ] **Step 1: Write the file**

```ts
// packages/client/e2e/responsive/triage/generate-report.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReport } from '../probes/report';
import type { Finding } from '../probes/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRIAGE_PATH = path.resolve(
  __dirname,
  '..', '..', '..',
  'test-results',
  'responsive-triage.md',
);

function groupBy<K extends string | number>(
  rows: Finding[],
  key: (f: Finding) => K,
): Map<K, Finding[]> {
  const map = new Map<K, Finding[]>();
  for (const f of rows) {
    const k = key(f);
    const arr = map.get(k) ?? [];
    arr.push(f);
    map.set(k, arr);
  }
  return map;
}

function buildMatrix(findings: Finding[]): string {
  const screens = Array.from(new Set(findings.map((f) => f.screen))).sort();
  const viewports = Array.from(new Set(findings.map((f) => f.viewport))).sort();
  if (screens.length === 0 || viewports.length === 0) {
    return '_(no findings recorded)_';
  }
  const counts = new Map<string, number>();
  for (const f of findings) {
    if (f.severity !== 'fail') continue;
    const k = `${f.screen}|${f.viewport}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const header = `| Screen \\ Viewport | ${viewports.join(' | ')} |`;
  const sep = `| --- | ${viewports.map(() => '---').join(' | ')} |`;
  const rows = screens.map((s) => {
    const cells = viewports.map((v) => {
      const c = counts.get(`${s}|${v}`) ?? 0;
      return c === 0 ? '·' : String(c);
    });
    return `| **${s}** | ${cells.join(' | ')} |`;
  });
  return [header, sep, ...rows].join('\n');
}

function buildTopFindings(findings: Finding[]): string {
  const fails = findings.filter((f) => f.severity === 'fail');
  if (fails.length === 0) return '_(no fail-severity findings)_';
  const byProbe = groupBy(fails, (f) => f.probe);
  const sortedProbes = Array.from(byProbe.entries()).sort((a, b) => b[1].length - a[1].length);
  const sections = sortedProbes.map(([probe, items]) => {
    const lines = items
      .slice(0, 10)
      .map((f) => `- **${f.screen}** @ ${f.viewport}: ${f.detail}`);
    const more = items.length > 10 ? `\n  - _(${items.length - 10} more)_` : '';
    return `### ${probe} (${items.length})\n${lines.join('\n')}${more}`;
  });
  return sections.join('\n\n');
}

export function generateTriage(): string {
  const findings = readReport();
  const fails = findings.filter((f) => f.severity === 'fail').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const md = [
    `# Responsive Triage Report`,
    ``,
    `**Total findings:** ${findings.length} (${fails} fail, ${warns} warn)`,
    ``,
    `## Severity Matrix (fail counts)`,
    ``,
    buildMatrix(findings),
    ``,
    `## Top Findings by Probe`,
    ``,
    buildTopFindings(findings),
    ``,
  ].join('\n');
  fs.mkdirSync(path.dirname(TRIAGE_PATH), { recursive: true });
  fs.writeFileSync(TRIAGE_PATH, md, 'utf8');
  return TRIAGE_PATH;
}

// Allow `node generate-report.ts` invocation.
const isCli = import.meta.url === `file://${process.argv[1]}` ||
              process.argv[1]?.endsWith('generate-report.ts');
if (isCli) {
  const outPath = generateTriage();
  console.log(`Triage report written to: ${outPath}`);
}
```

- [ ] **Step 2: Quick sanity check the formatter**

The script will be runnable after Task 20 adds `tsx` as a devDep. Skip the standalone invocation here; Task 21 verifies it end-to-end via the npm script.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/responsive/triage/generate-report.ts
git commit -m "test(responsive): triage report generator (matrix + top findings)"
```

---

### Task 20: Add convenience npm scripts (and `tsx` devDep)

**Files:**
- Modify: `packages/client/package.json`

The triage report generator is TypeScript and needs to run as a Node script. The repo's engines pin is `node >=20`, which predates stable `--experimental-strip-types`, so add `tsx` as a devDep.

- [ ] **Step 1: Add `tsx` to devDependencies**

```bash
pnpm --filter @alloy/client add -D tsx
```

Expected: `tsx` (latest 4.x) added to `packages/client/package.json` devDependencies. The lockfile is updated automatically.

- [ ] **Step 2: Add two new scripts**

Open `packages/client/package.json`. Inside the `"scripts"` object, add:

```json
"test:responsive": "playwright test --project=responsive",
"test:responsive:report": "tsx e2e/responsive/triage/generate-report.ts"
```

`--project=responsive` ensures the responsive specs run **once** (in the dedicated project added in Task 8), not 4× across all device projects.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @alloy/client run | grep responsive
```

Expected: both scripts listed.

- [ ] **Step 4: Commit**

```bash
git add packages/client/package.json pnpm-lock.yaml
git commit -m "test(responsive): add tsx devDep + test:responsive npm scripts"
```

---

### Task 21: Chunk 3 checkpoint

- [ ] **Step 1: Run probe self-tests + invoke triage generator end-to-end**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/
pnpm --filter @alloy/client run test:responsive:report
cat packages/client/test-results/responsive-triage.md
```

Expected: tests pass; triage file exists and renders cleanly.

- [ ] **Step 2: Commit checkpoint marker**

```bash
git commit --allow-empty -m "test(responsive): chunk 3 (reporting + triage) complete"
```

---

## Chunk 4: Per-Screen Specs (Lane B — Screens)

This chunk can begin in parallel with Chunk 2 once Chunk 1 is committed (the public surface is stable). Each screen needs:
1. `data-primary-action` on its main CTA
2. `data-screen-section` on each top-level layout region
3. A spec file under `e2e/responsive/specs/` that iterates the matrix

### Task 22: Tag MainMenu screen

**Files:**
- Modify: `packages/client/src/pages/MainMenu.tsx`

- [ ] **Step 1: Read MainMenu.tsx**

```bash
cat packages/client/src/pages/MainMenu.tsx | head -80
```

- [ ] **Step 2: Add the attributes**

- Add `data-primary-action` to the **Play** button (the one that navigates to `/queue`).
- Add `data-screen-section` to each top-level layout region (typically a header/title block, the button group, and any footer).

If the layout doesn't have natural sections (e.g., it's a single centered column), add `data-screen-section` to the main column wrapper so the dead-space probe has at least one region to measure.

- [ ] **Step 3: Run existing tests, confirm green**

```bash
pnpm --filter @alloy/client test --run
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/MainMenu.tsx
git commit -m "test(client): tag MainMenu sections + primary action for responsive probes"
```

---

### Task 23: Write `main-menu.spec.ts`

**Files:**
- Create: `packages/client/e2e/responsive/specs/main-menu.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// packages/client/e2e/responsive/specs/main-menu.spec.ts
import { test, expect } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';

for (const vp of VIEWPORTS) {
  test(`MainMenu @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 10_000 });
    await runProbes('main-menu', vp);
  });
}
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/specs/main-menu.spec.ts
```

Expected: tests run across all 13 viewports. Some may fail with real findings — that is the desired signal. Do not "fix" the underlying screen here; record what failed and continue.

- [ ] **Step 3: Inspect findings**

```bash
cat packages/client/test-results/responsive-report.json | jq '[.[] | select(.screen == "main-menu")] | length'
```

Expected: integer ≥ 0. Findings (if any) are real bugs to be addressed in the follow-up plan.

- [ ] **Step 4: Commit (regardless of pass/fail of the spec itself)**

```bash
git add packages/client/e2e/responsive/specs/main-menu.spec.ts
git commit -m "test(responsive): main-menu spec across 13 viewports"
```

---

### Task 24: Tag Draft screen

**Files:**
- Modify: `packages/client/src/pages/Draft.tsx`

- [ ] **Step 1: Identify the primary action**

Draft's primary action is the gem-pick button. Per `e2e/fixtures/match.ts`, picks happen on `[data-gem]` taps. There isn't a single "primary CTA" button — but the closest equivalent is the player's currently-selected gem confirmation (the second-tap target). For probe purposes, mark the **first visible gem in the pool** when it is the player's turn, OR add a wrapper element with `data-primary-action` over the active-pool region.

Pragmatic choice: add `data-primary-action` to the parent container of the gem pool (the element that holds the active gems), so the probe verifies the pool itself is on-screen and large enough. This is a real layout assertion.

- [ ] **Step 2: Add the attributes**

- `data-primary-action` on the gem-pool container (the wrapper around `[data-gem]` cards in the active region).
- `data-screen-section` on each top-level region: opponent-zone header, gem-pool content, player drop-zone (if present).

- [ ] **Step 3: Run unit tests**

```bash
pnpm --filter @alloy/client test --run -- src/pages/__tests__/Draft.test.tsx
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Draft.tsx
git commit -m "test(client): tag Draft sections + primary action for responsive probes"
```

---

### Task 25: Write `draft.spec.ts`

**Files:**
- Create: `packages/client/e2e/responsive/specs/draft.spec.ts`

- [ ] **Step 1: Write the spec**

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
    await runProbes('draft', vp);
  });
}
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/specs/draft.spec.ts
```

Expect: viewports may fail with findings. Record, don't fix.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/responsive/specs/draft.spec.ts
git commit -m "test(responsive): draft spec across 13 viewports"
```

---

### Task 26: Tag Forge screen

**Files:**
- Modify: `packages/client/src/pages/Forge.tsx`

Forge has two tabs (equip + combine). They share the same outer page but differ in the workbench area.

- [ ] **Step 1: Add the attributes**

- `data-primary-action` on the **Done Forging** button (the action that ends the phase).
- `data-screen-section` on: forge header, equip area (or combine workbench, depending on tab), gem tray.

- [ ] **Step 2: Run unit tests**

```bash
pnpm --filter @alloy/client test --run -- src/pages/__tests__/Forge.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/Forge.tsx
git commit -m "test(client): tag Forge sections + primary action for responsive probes"
```

---

### Task 27: Write `forge-equip.spec.ts`

**Files:**
- Create: `packages/client/e2e/responsive/specs/forge-equip.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// packages/client/e2e/responsive/specs/forge-equip.spec.ts
import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startMatch, waitForPhase, completeDraft } from '../../fixtures/match';

for (const vp of VIEWPORTS) {
  test(`Forge equip @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    // Equip tab is the default forge view
    await runProbes('forge-equip', vp);
  });
}
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/specs/forge-equip.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/responsive/specs/forge-equip.spec.ts
git commit -m "test(responsive): forge-equip spec across 13 viewports"
```

---

### Task 28: Write `forge-combine.spec.ts`

**Files:**
- Create: `packages/client/e2e/responsive/specs/forge-combine.spec.ts`

- [ ] **Step 1: Write the spec**

The combine tab requires switching tabs after entering forge. Look at existing forge tests for the tab-switching mechanism.

```bash
grep -rn 'Combine' packages/client/e2e/forge-redesign.spec.ts | head -10
```

Use the same tab-switch pattern. Spec template:

```ts
// packages/client/e2e/responsive/specs/forge-combine.spec.ts
import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startMatch, waitForPhase, completeDraft } from '../../fixtures/match';

for (const vp of VIEWPORTS) {
  test(`Forge combine @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    // Switch to Combine tab — name from existing tests
    await page.getByRole('tab', { name: /combine/i }).click().catch(async () => {
      // Fallback: button-styled tab
      await page.getByRole('button', { name: /combine/i }).click();
    });
    await runProbes('forge-combine', vp);
  });
}
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/specs/forge-combine.spec.ts
```

If the tab-switch selector is wrong, the test will time out. Inspect existing combine tests for the right selector and update accordingly.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/responsive/specs/forge-combine.spec.ts
git commit -m "test(responsive): forge-combine spec across 13 viewports"
```

---

### Task 29: Tag Duel screen

**Files:**
- Modify: `packages/client/src/pages/Duel.tsx`

The Duel screen has 5 sections (opponent HP, playback controls, canvas+log, player HP, post-duel breakdown). The PixiJS canvas is the visual centerpiece but the "primary action" during a duel is the **Skip** button.

- [ ] **Step 1: Add the attributes**

- `data-primary-action` on the **Skip** button.
- `data-screen-section` on each of the 5 vertical sections (opponent HP, playback controls, canvas wrapper, event log + player HP combined region, post-duel breakdown if visible).

The canvas wrapper section may have a smaller dead-space contribution if the canvas uses `aspect-ratio` — that's OK; the per-screen override below addresses this.

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/pages/Duel.tsx
git commit -m "test(client): tag Duel sections + primary action for responsive probes"
```

---

### Task 30: Write `duel.spec.ts`

**Files:**
- Create: `packages/client/e2e/responsive/specs/duel.spec.ts`

- [ ] **Step 1: Write the spec**

The Duel screen has a large aspect-ratio-locked canvas. On extreme aspect ratios (ultrawide, phone-landscape) the canvas may not fill 80% of the frame — that's expected, not a bug. Use a per-screen override.

```ts
// packages/client/e2e/responsive/specs/duel.spec.ts
import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startMatch, waitForPhase, completeDraft, completeForge } from '../../fixtures/match';

for (const vp of VIEWPORTS) {
  test(`Duel @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await completeForge(page);
    await waitForPhase(page, 'duel');
    // Canvas-heavy screen: relax dead-space threshold to 0.65
    await runProbes('duel', vp, { overrides: { deadSpace: { minRatio: 0.65 } } });
  });
}
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/specs/duel.spec.ts
```

The duel spec is the slowest (full draft + forge + duel start). Expect ~2-4 min for all 13 viewports.

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/responsive/specs/duel.spec.ts
git commit -m "test(responsive): duel spec across 13 viewports (relaxed dead-space)"
```

---

### Task 31: Write `phase-transitions.spec.ts`

**Files:**
- Create: `packages/client/e2e/responsive/specs/phase-transitions.spec.ts`

Probes the moment after each phase transition (draft → forge, forge → duel) on a smaller subset of viewports. The matrix is overkill here — phase transitions are about timing and state, not aspect-ratio behavior. Use 4 representative profiles.

- [ ] **Step 1: Write the spec**

```ts
// packages/client/e2e/responsive/specs/phase-transitions.spec.ts
import { test } from '../fixtures/responsive-fixture';
import { VIEWPORTS } from '../viewports';
import { startMatch, waitForPhase, completeDraft, completeForge } from '../../fixtures/match';

const TRANSITION_PROFILES = VIEWPORTS.filter((v) =>
  ['iphone-se', 'pixel-7', 'desktop-1280', 'qhd-1440p'].includes(v.name),
);

for (const vp of TRANSITION_PROFILES) {
  test(`Transition draft→forge @ ${vp.name}`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    // Probe immediately after transition — catches mid-animation layout breaks
    await runProbes('transition-draft-forge', vp);
  });

  test(`Transition forge→duel @ ${vp.name}`, async ({ page, runProbes }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startMatch(page);
    await waitForPhase(page, 'draft');
    await completeDraft(page);
    await waitForPhase(page, 'forge');
    await completeForge(page);
    await waitForPhase(page, 'duel');
    await runProbes('transition-forge-duel', vp, { overrides: { deadSpace: { minRatio: 0.65 } } });
  });
}
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/specs/phase-transitions.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/e2e/responsive/specs/phase-transitions.spec.ts
git commit -m "test(responsive): phase-transitions spec on representative viewports"
```

---

### Task 32: Chunk 4 checkpoint

- [ ] **Step 1: Run the entire responsive suite end-to-end**

```bash
pnpm --filter @alloy/client run test:responsive
```

Expect failures with real findings — that is exactly the goal. Note the duration.

- [ ] **Step 2: Commit checkpoint marker**

```bash
git commit --allow-empty -m "test(responsive): chunk 4 (per-screen specs) complete"
```

---

## Chunk 5: Run, Triage, Memory, and Hand-Off

### Task 33: Run the full matrix and capture the triage report

- [ ] **Step 1: Clean run**

```bash
rm -f packages/client/test-results/responsive-report.json
pnpm --filter @alloy/client run test:responsive || true
pnpm --filter @alloy/client run test:responsive:report
```

The `|| true` is intentional: spec failures are the signal, not a blocker for triage generation.

- [ ] **Step 2: Inspect the triage report**

```bash
cat packages/client/test-results/responsive-triage.md
```

Expected: a markdown file with a severity matrix and a per-probe top-findings breakdown.

- [ ] **Step 3: Save triage to docs for the follow-up plan**

```bash
mkdir -p docs/superpowers/triage
cp packages/client/test-results/responsive-triage.md docs/superpowers/triage/2026-04-16-responsive-triage.md
git add docs/superpowers/triage/2026-04-16-responsive-triage.md
git commit -m "docs(triage): capture initial responsive findings snapshot"
```

---

### Task 34: Update memory files

The user requested memory updates. Add a new project memory documenting the responsive testing harness so future sessions know where to look and what conventions to follow.

**Files:**
- Create: `C:/Users/hahnz/.claude/projects/C--Projects-Alloy/memory/project_responsive_testing.md`
- Modify: `C:/Users/hahnz/.claude/projects/C--Projects-Alloy/memory/MEMORY.md`
- Modify: `C:/Users/hahnz/.claude/projects/C--Projects-Alloy/memory/project_responsive_system.md`

- [ ] **Step 1: Create the new memory file**

```markdown
---
name: responsive-testing-harness
description: Where the responsive/device test harness lives, how to run it, and how to add new screens
type: project
---

## Responsive Testing Harness (added 2026-04-16)

Lives under `packages/client/e2e/responsive/`. Built around 6 layout-integrity probes (overflow-x, overflow-y, tabbar-visibility, primary-action-reachable, dead-space, min-size) running across a 13-viewport matrix (galaxy-fold → ultrawide). See spec: `docs/superpowers/specs/2026-04-16-responsive-device-testing-design.md`.

### Run it

```bash
pnpm --filter @alloy/client run test:responsive
pnpm --filter @alloy/client run test:responsive:report
```

Triage markdown lands at `packages/client/test-results/responsive-triage.md`.

### Adding a new screen

1. Add `data-primary-action` to the screen's main CTA element.
2. Add `data-screen-section` to each top-level layout region.
3. Create `e2e/responsive/specs/<screen>.spec.ts` iterating `VIEWPORTS` and calling `runProbes(<screen-name>, vp)`.
4. If the screen has a legitimate dead-space exemption (e.g., aspect-ratio canvas), pass `{ overrides: { deadSpace: { minRatio: 0.65 } } }`.

### Why probes return findings instead of throwing

`runAllProbes` collects findings across all probes before the spec asserts; a single failing run captures every violation per (screen × viewport) for triage. If a probe threw on first violation, downstream probes wouldn't run and the report would be incomplete.

### Files that anchor the contract

- `e2e/responsive/viewports.ts` — matrix of 13 profiles + `Viewport` type
- `e2e/responsive/probes/types.ts` — `Finding`, `ProbeCtx`, `Probe` interfaces
- `e2e/responsive/fixtures/responsive-fixture.ts` — `runProbes` fixture exposed to specs
- `e2e/responsive/probes/run-all.ts` — aggregator with frame-missing guard
- TabBar root `<div>` carries `data-tabbar` — touched by `tabbar` probe
```

- [ ] **Step 2: Index the new memory in MEMORY.md**

Add this line under the `## Project` section:

```markdown
- [project_responsive_testing.md](project_responsive_testing.md) — Responsive testing harness: where probes live, how to run, how to add a new screen
```

- [ ] **Step 3: Add a cross-reference to the existing responsive-system memory**

In `project_responsive_system.md`, add a final section so anyone reading the responsive-system memory knows about the test harness:

```markdown
## Test Harness

Layout integrity is enforced by the responsive testing harness — see `project_responsive_testing.md` for how to run it and add coverage for new screens.
```

(No git commit needed — memory files live outside the project repo.)

---

### Task 35: Final verification + plan complete

- [ ] **Step 1: Confirm all chunks committed**

```bash
cd C:/Projects/Alloy && git log --oneline -30
```

Expected: 5 chunk-completion markers plus all task commits.

- [ ] **Step 2: Verify the harness is invokable end-to-end one more time**

```bash
pnpm --filter @alloy/client exec playwright test --project=responsive e2e/responsive/probes/__tests__/
```

Expected: every probe self-test passes.

- [ ] **Step 3: Hand off**

The triage report at `docs/superpowers/triage/2026-04-16-responsive-triage.md` is the input to the follow-up brainstorm/plan that addresses the responsive bugs found. That work is **explicitly out of scope** for this plan — this plan delivers the harness and the report; a subsequent brainstorm + plan addresses the findings.

- [ ] **Step 4: Commit final marker**

```bash
git commit --allow-empty -m "test(responsive): chunk 5 (triage + handoff) — implementation plan complete"
```

---

## Done

The harness is in place. The triage report at `docs/superpowers/triage/2026-04-16-responsive-triage.md` lists the responsive bugs the harness found. Address those bugs in a follow-up plan; do not bundle that work here.
