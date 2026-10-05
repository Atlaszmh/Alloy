import type {
  TutorialKeyedTarget,
  TutorialStep,
  TutorialTarget,
  TutorialTrailTarget,
} from '@alloy/engine';
import { scopedLast, topScope } from '../kit';

/**
 * What the guided start's marker points at (see the pad navigation and guidance spec, 2.2 and
 * 2.3): the first control of the step's trail still to do, a way to it, the step's `highlight`,
 * or the way out of a view left open over them. All of it is read from the topmost pad scope's
 * DOM: a control names its target with `data-tutorial` (`<target>`, or `<target>:<key>` for one
 * control among several) and says it is done with an attribute it sets itself (`isDone`). The
 * marker (`TutorialHighlight`) and the strip's Continue (`TutorialPanel`) both ask `findMarked`.
 */

/** A target as `WAY_TO` knows it: without its key. */
type Bare = TutorialTarget | TutorialKeyedTarget;

/** `forge.pattern:cuirass` is `forge.pattern`. */
const bare = (target: string): Bare => target.split(':')[0] as Bare;

/**
 * Where a target lives when it is not on screen: the control that opens its view or bench or
 * selects its move, else its hub tab (each hub tab is `hub.tab.<id>`). Keyed on the target
 * without its key (every pattern row's way is the Forge bench); a way may itself be keyed
 * (`skills.card:last`: the card to select).
 */
export const WAY_TO: Partial<Record<Bare, TutorialTrailTarget>> = {
  // Training lives in the Depart sheet, which the footer's Delve opens.
  'hub.training': 'hub.delve',
  'loadout.bag': 'hub.tab.loadout',
  'loadout.equip': 'hub.tab.loadout',
  'loadout.salvage': 'hub.tab.loadout',
  'loadout.compare': 'hub.tab.loadout',
  'loadout.transfer': 'hub.tab.loadout',
  'skills.mana': 'hub.tab.skills',
  'mana.bind': 'skills.mana',
  'mana.confirm': 'mana.bind',
  'skills.primary': 'hub.tab.skills',
  'skills.card': 'skills.primary',
  'skills.addSlot': 'skills.primary',
  'skills.elements': 'skills.card:last',
  'skills.socket': 'skills.card:first',
  'skills.rune': 'skills.card:first',
  'skills.apply': 'hub.tab.skills',
  'forge.bench': 'hub.tab.forge',
  'forge.pattern': 'forge.bench',
  'forge.bar': 'forge.bench',
  'forge.flux': 'forge.bench',
  'forge.shard': 'forge.bench',
  'forge.go': 'forge.bench',
  // The Materials pane sits beside both benches.
  'forge.refine': 'hub.tab.forge',
  'forge.temper': 'hub.tab.forge',
  'temper.hone': 'forge.temper',
  'temper.line': 'temper.hone',
  'temper.go': 'temper.hone',
  'quests.done': 'hub.tab.quests',
  'quests.claim': 'hub.tab.quests',
  'quests.board': 'hub.tab.quests',
};

/** What the marker points at: the element, and the target it stands for (an entry of the trail, the step's `highlight`, a way to one of them, or `'back'`). */
export interface Marked {
  el: HTMLElement;
  id: string;
}

function shown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
}

/**
 * The target's element in the topmost pad scope, on screen; else null. Of several visible
 * `[data-tutorial="<target>"]`, a keyed target takes the first (the bag's first tile of that
 * slot and rarity), a plain one the last, as ever.
 */
export function findTarget(target: string): HTMLElement | null {
  const selector = `[data-tutorial="${target}"]`;
  const el = target.includes(':')
    ? [...topScope().querySelectorAll<HTMLElement>(selector)].find(shown)
    : scopedLast(selector);
  return el && onScreen(el) ? el : null;
}

const DONE = ['aria-selected', 'aria-pressed', 'aria-checked', 'data-tutorial-done'];

/** Whether a control says its click is made: chosen, selected or pressed, or `data-tutorial-done`, each `"true"`. */
export function isDone(el: HTMLElement): boolean {
  return DONE.some((attr) => el.getAttribute(attr) === 'true');
}

/**
 * The target on screen (`findTarget`), else the nearest way to it that is (`WAY_TO`), passing
 * over one that is done (a selected tab or card: what it shows is open already); else null.
 */
export function findWay(target: TutorialTrailTarget): Marked | null {
  const own = findTarget(target);
  if (own) return { el: own, id: target };
  for (let way = WAY_TO[bare(target)]; way; way = WAY_TO[bare(way)]) {
    const el = findTarget(way);
    if (el && !isDone(el)) return { el, id: way };
  }
  return null;
}

/**
 * The way out of a view or picker left open inside the screen: the topmost scope's
 * `[data-pad-back]`, when that scope is nested in another (the Mana view, a rune or shard
 * picker, a stop card's picker). A kit dialog or the pause is not nested: the player opened it
 * on purpose, and it gets no marker.
 */
function wayOut(): Marked | null {
  const scope = topScope();
  if (!(scope instanceof HTMLElement) || !scope.parentElement?.closest('[data-pad-scope]'))
    return null;
  const el = scopedLast('[data-pad-back]');
  return el && onScreen(el) ? { el, id: 'back' } : null;
}

/**
 * The step's marked control. Its trail is walked in order: an entry on screen that is done
 * (`isDone`) or disabled is passed over; the first one on screen, enabled and not done is
 * marked; one that is not on screen is marked by its way (`findWay`), or passed over when no way
 * shows. After the trail, the step's `highlight` (by `findWay`, as ever). When none of that gives
 * anything in the topmost scope, the way out of it (`wayOut`).
 */
export function findMarked(step: TutorialStep): Marked | null {
  for (const entry of step.trail ?? []) {
    const el = findTarget(entry);
    if (el && (isDone(el) || el.matches(':disabled, [aria-disabled="true"]'))) continue;
    const marked = el ? { el, id: entry } : findWay(entry);
    if (marked) return marked;
  }
  const own = step.highlight ? findWay(step.highlight) : null;
  return own ?? (step.trail || step.highlight ? wayOut() : null);
}
