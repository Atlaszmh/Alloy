import type { Page } from '@playwright/test';
import {
  bindSecondary,
  createDefaultRegistry,
  createDelveProfile,
  type DelveProfile,
  type ManaType,
} from '@alloy/engine';

export const SAVE_KEY = 'alloy:delve:v2';
/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
export const ARENA_READY = 30_000;

/**
 * Seed a deterministic Delve save (a fire hero, `secondary` bound if given, `over` on top) and
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
  let profile = createDelveProfile(registry, seed, { primary: 'fire' });
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
