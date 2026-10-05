import { expect, type Page } from '@playwright/test';
import {
  bindSecondary,
  createDefaultRegistry,
  createDelveProfile,
  defaultMoveset,
  type DataRegistry,
  type DelveProfile,
  type ManaType,
} from '@alloy/engine';

export const SAVE_KEY = 'alloy:delve:v2';
/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
export const ARENA_READY = 30_000;
/** The bot clearing a generated floor: slow at 1080p while many test browsers run at once. */
export const FLOOR_CLEAR = 120_000;

/**
 * `p` with its equipped weapon made uncommon, holding that rarity's base moveset in its mana: a
 * new save's common sword carries the basic chain alone (see the tutorial spec's carries), so a
 * test of the Primary arms the hero first, as its first forge would.
 */
export function armed(registry: DataRegistry, p: DelveProfile): DelveProfile {
  const w = p.equipped.weapon!;
  const moveset = defaultMoveset(registry, { baseId: w.baseId, rarity: 'uncommon' }, w.mana);
  return { ...p, equipped: { ...p.equipped, weapon: { ...w, rarity: 'uncommon', moveset } } };
}

/**
 * Seed a deterministic Delve save (a fire hero armed with an uncommon sword (`armed`), `secondary`
 * bound if given, `over` on top) and
 * let the engine bot play the arena ('ask': the bot plays, but the test presses interact and
 * answers the gate's and the alcove's dialogs).
 */
export async function seedProfile(
  page: Page,
  seed = 4242,
  autopilot: boolean | 'ask' = true,
  secondary?: ManaType,
  over: Partial<DelveProfile> = {},
): Promise<void> {
  const registry = createDefaultRegistry();
  let profile = armed(registry, createDelveProfile(registry, seed, { primary: 'fire' }));
  if (secondary) profile = bindSecondary(registry, profile, secondary).profile;
  profile = { ...profile, ...over };
  const save = JSON.stringify(profile);
  await page.addInitScript(
    ([key, value, bot]) => {
      if (sessionStorage.getItem('delve-e2e')) return;
      localStorage.clear();
      localStorage.setItem(key, value);
      if (bot) localStorage.setItem('alloy:delve:autopilot', bot === 'ask' ? 'ask' : '1');
      localStorage.setItem('alloy:delve:timescale', '2');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('delve-e2e', '1');
    },
    [SAVE_KEY, save, autopilot] as const,
  );
}

/** From the Anvil: the footer's Delve opens the Depart sheet, whose Delve starts (or resumes) the dive. */
export async function startDive(page: Page): Promise<void> {
  await page.getByTestId('depart-button').click();
  await page.getByTestId('delve-button').click();
}

/** At a stop: past the power-up (Skip) to the road. Nothing to do when the stop opened there. */
export async function toRoad(page: Page): Promise<void> {
  const stop = page.getByTestId('door-choice');
  if (await stop.getByTestId('stop-powerup').isVisible())
    await stop.getByRole('button', { name: 'Skip power-up' }).click();
  await expect(stop.getByTestId('stop-road')).toBeVisible();
}

/** From the Anvil: the Depart sheet's Training. */
export async function openTraining(page: Page): Promise<void> {
  await page.getByTestId('depart-button').click();
  await page.getByTestId('training-button').click();
}
