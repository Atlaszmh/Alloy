import type { TutorialStep, TutorialTarget } from '@alloy/engine';
import { scopedLast } from '../kit';

/**
 * What the guided start's marker points at (see the pad-nav and guidance spec, 2.2): a step's
 * target on screen, or the way to it. The marker (`TutorialHighlight`) and the strip's Continue
 * (`TutorialPanel`) both ask `findMarked`.
 */

/**
 * Where an Anvil target lives when it is not on screen: the control that opens its view or
 * bench, else its hub tab (each hub tab is `hub.tab.<id>`). The marker follows these to the
 * first one on screen, so the player is always shown where to go next.
 */
export const WAY_TO: Partial<Record<TutorialTarget, TutorialTarget>> = {
  'loadout.equip': 'hub.tab.loadout',
  'loadout.salvage': 'hub.tab.loadout',
  'loadout.compare': 'hub.tab.loadout',
  'loadout.transfer': 'hub.tab.loadout',
  'skills.mana': 'hub.tab.skills',
  'mana.bind': 'skills.mana',
  'skills.primary': 'hub.tab.skills',
  'skills.addSlot': 'skills.primary',
  'skills.elements': 'skills.primary',
  'skills.socket': 'skills.primary',
  'skills.apply': 'hub.tab.skills',
  'forge.pattern': 'hub.tab.forge',
  'forge.bar': 'hub.tab.forge',
  'forge.flux': 'hub.tab.forge',
  'forge.shard': 'hub.tab.forge',
  'forge.go': 'hub.tab.forge',
  'forge.refine': 'hub.tab.forge',
  'forge.temper': 'hub.tab.forge',
  'temper.hone': 'forge.temper',
  'quests.claim': 'hub.tab.quests',
  'quests.board': 'hub.tab.quests',
};

/** The last visible `[data-tutorial="<target>"]` in the topmost pad scope, on screen; else null. */
export function findTarget(target: string): HTMLElement | null {
  const el = scopedLast(`[data-tutorial="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const onScreen =
    r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
  return onScreen ? el : null;
}

/** What the marker points at: the element, and the target it stands for (the step's own, a way to it, or 'back'). */
export interface Marked {
  el: HTMLElement;
  id: string;
}

/**
 * The target on screen (`findTarget`), else the nearest way to it that is (`WAY_TO`), passing
 * over a way already open (a selected tab: what it holds just isn't showing); else null.
 */
export function findWay(target: TutorialTarget): Marked | null {
  for (let t: TutorialTarget | undefined = target; t; t = WAY_TO[t]) {
    const el = findTarget(t);
    if (el && (t === target || el.getAttribute('aria-selected') !== 'true')) return { el, id: t };
  }
  return null;
}

/** The step's marked control: its `highlight`, by `findWay`; null for a step that names none. */
export function findMarked(step: TutorialStep): Marked | null {
  return step.highlight ? findWay(step.highlight) : null;
}
