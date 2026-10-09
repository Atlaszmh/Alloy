import { test, expect, type Page } from '@playwright/test';
import {
  createDefaultRegistry,
  createDelveProfile,
  defaultMoveset,
  generateItem,
  SeededRNG,
  startDive as beginDive,
  type DataRegistry,
  type DelveProfile,
} from '@alloy/engine';
import { ARENA_READY, armed, seedProfile, startDive, stepTo } from './fixtures/delve';

/**
 * The Delve's type floor (the pad-first spec, 6): every drawn text's design px, the share under
 * 14, 16 and 18 per screen (TYPE_REPORT=1 prints them), and none under 16. Design px are the
 * computed font-size: the screens' zoom applies after it, and at 1920×1080 it is 1 anyway.
 */
const FLOOR = 16;

// A rare bag axe (a frame to compare and Move all onto) and two loose constructs in the bag.
const CONSTRUCTS = (registry: DataRegistry) => {
  const axe = generateItem(registry, { uid: 'bag-axe', ilvl: 4, rarity: 'rare', slot: 'weapon', baseId: 'axe', mana: 'fire' }, new SeededRNG(7));
  return {
    bag: [{ ...axe, moveset: defaultMoveset(registry, axe, 'fire') }],
    constructs: [
      { uid: 'c9001', kind: 'medium', form: 'strike', elements: ['fire'], runes: [null] },
      { uid: 'c9002', kind: 'light', form: 'bolt', elements: ['fire'] },
    ],
    nextConstructUid: 9100,
  } satisfies Partial<DelveProfile>;
};

interface Run {
  size: number;
  where: string;
  text: string;
}

/** One entry per element that draws text of its own, as the responsive probe walks them. */
async function runs(page: Page): Promise<Run[]> {
  return page.evaluate(() => {
    const out: { size: number; where: string; text: string }[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      const text = n.textContent?.trim();
      if (!el || !text || seen.has(el) || el.closest('.sr-only')) continue;
      seen.add(el);
      let box: Element | null = el;
      while (box && getComputedStyle(box).display === 'contents') box = box.parentElement;
      if (!box) continue;
      const r = box.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!box.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      out.push({
        size: parseFloat(getComputedStyle(el).fontSize),
        where: el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName.toLowerCase(),
        text: text.slice(0, 40),
      });
    }
    return out;
  });
}

/** Measure the screen on show: report its shares, and hold the floor. */
async function measure(page: Page, screen: string): Promise<void> {
  const all = await runs(page);
  const share = (px: number) => Math.round((100 * all.filter((r) => r.size < px - 0.01).length) / all.length);
  const smallest = Math.min(...all.map((r) => r.size));
  if (process.env.TYPE_REPORT)
    console.log(`TY ${screen}: ${all.length} runs · <14 ${share(14)}% · <16 ${share(16)}% · <18 ${share(18)}% · smallest ${smallest}`);
  const under = all.filter((r) => r.size < FLOOR - 0.01).map((r) => `${r.size}px ${r.where}: "${r.text}"`);
  expect.soft(under, `${screen}: text under ${FLOOR} design px`).toEqual([]);
}

test.describe('the type floor', () => {
  // Design px equal CSS px only at --ui-scale 1.
  test.skip(({ viewport }) => viewport?.width !== 1920, 'measured at 1920×1080 (desktop-1080)');

  test('TY01: the Anvil: every tab, the benches, the editor, the sheets and the dialogs', async ({ page }) => {
    await seedProfile(page, 4242, false, undefined, CONSTRUCTS(createDefaultRegistry()));
    await page.goto('/delve');
    for (const tab of ['loadout', 'skills', 'forge', 'codex', 'quests'] as const) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
      await measure(page, tab);
    }
    // The Loadout's compare pane on a bag weapon: the frame line and Move all here.
    await page.getByTestId('tab-loadout').click();
    await page.locator('[data-uid="bag-axe"]').click();
    await expect(page.getByTestId('weapon-frame')).toBeVisible();
    await measure(page, 'loadout-weapon');
    // The Skills tab's bag pane with constructs in it.
    await page.getByTestId('tab-skills').click();
    await expect(page.getByTestId('construct-bag').locator('[data-construct]')).toHaveCount(2); // the Primary's filter: the Strike, and the Bolt a sword can't express (dormant, with its reason)
    await measure(page, 'skills-bag');
    await page.getByTestId('move-0').click();
    await expect(page.getByTestId('move-editor')).toBeVisible();
    await measure(page, 'skills-editor');
    await page.getByTestId('move-editor-back').click();
    await page.getByTestId('tab-forge').click();
    await page.getByTestId('pattern-cuirass').click();
    await stepTo(page, 'forge-flux', /^Uncommon/);
    await measure(page, 'forge-pattern');
    await page.getByTestId('bench-temper').click();
    await measure(page, 'temper');
    await page.getByTestId('bench-materials').click();
    await measure(page, 'materials');
    await page.getByTestId('depart-button').click();
    await expect(page.getByTestId('depart-sheet')).toBeVisible();
    await measure(page, 'depart');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('depart-sheet')).toHaveCount(0);
    await page.keyboard.press('Escape'); // the system menu
    await expect(page.getByTestId('open-settings')).toBeVisible();
    await measure(page, 'system-menu');
    await page.getByTestId('open-help').click();
    await expect(page.getByTestId('help-dialog')).toBeVisible();
    await measure(page, 'help');
    await page.keyboard.press('Escape'); // back to the menu
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings-close')).toBeVisible();
    await measure(page, 'settings');
    await page.getByTestId('settings-close').click();
    await page.getByTestId('open-controls').click();
    await expect(page.getByTestId('controls-panel')).toBeVisible();
    await measure(page, 'controls');
  });

  test('TY02: the dive: the lean HUD, the pause list and the stop', async ({ page }) => {
    // A dive in progress wearing two Devotion entries: the HUD's boon tile shows its count.
    const registry = createDefaultRegistry();
    const fresh = armed(registry, createDelveProfile(registry, 4242, { primary: 'fire' }));
    const { dive } = beginDive(registry, fresh, 1);
    const devotion = { boon: 'devotion', tier: 1 as const, effect: registry.getBoons().find((b) => b.id === 'devotion')!.tiers[0].effect };
    await seedProfile(page, 4242, true, undefined, { dive: { ...dive!, diveBuffs: [devotion, devotion] } }); // the bot clears depth 1
    await page.goto('/delve');
    await startDive(page);
    await expect(page.getByTestId('dodge-button')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.locator('[data-buff="boon"][data-boon="devotion"] [data-count]')).toHaveText('2');
    await measure(page, 'hud');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-screen')).toBeVisible();
    await measure(page, 'pause-list');
    await page.keyboard.press('Escape');
    // About 2× the 60 s this wait took on the Linux software renderer, two workers (26 s
    // with one).
    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: 120_000 });
    await measure(page, 'stop');
  });
});
