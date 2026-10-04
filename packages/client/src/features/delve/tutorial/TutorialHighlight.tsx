import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { TutorialTarget } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { layerZoom, reducedMotion, scopedLast } from '../kit';
import { getDelveRegistry } from '../registry';

/** What the pad's focus lands on (the menu navigation's own list). */
const FOCUSABLE =
  'button:not(:disabled), a[href], [role="tab"], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Design px between the target and the outline, and the outline's width. */
const GAP = 6;
const WIDTH = 3;

/** Forge gold (`--k-hot-hi`) over the well's ink, glowing hot (`--k-hot`); placed each frame. */
const RING: CSSProperties = {
  position: 'fixed',
  display: 'none',
  zIndex: 80,
  pointerEvents: 'none',
  boxSizing: 'border-box',
  borderStyle: 'solid',
  borderColor: '#fee761',
  boxShadow: '0 0 0 3px #181425, 0 0 18px 4px #feae34',
};

/** The current step's highlight (`TutorialStep.highlight`): null with no tutorial, or a step naming none. */
export function useTutorialTarget(): TutorialTarget | null {
  const step = useDelveStore((s) => s.profile.tutorial?.step ?? null);
  if (!step) return null;
  const def = getDelveRegistry()
    .getTutorialData()
    .steps.find((s) => s.id === step);
  return def?.highlight ?? null;
}

/** The target's element: the last visible `[data-tutorial="<target>"]` in the topmost pad scope, on screen; else null. */
export function findTarget(target: TutorialTarget): HTMLElement | null {
  const el = scopedLast(`[data-tutorial="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const onScreen =
    r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
  return onScreen ? el : null;
}

/**
 * Where an Anvil target lives when it is not on screen: the control that opens its view or
 * bench, else its hub tab (each hub tab is `hub.tab.<id>`). The highlight follows these to the
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

/**
 * The target on screen (`findTarget`), else the nearest way to it that is (`WAY_TO`), passing
 * over one already open (a selected tab: what it holds just isn't showing); else null.
 */
export function findWay(target: TutorialTarget): HTMLElement | null {
  for (let t: TutorialTarget | undefined = target; t; t = WAY_TO[t]) {
    const el = findTarget(t);
    if (el && (t === target || el.getAttribute('aria-selected') !== 'true')) return el;
  }
  return null;
}

/** Under the pad, the focus moves to the target (or the first control in it); never onto the HUD's slots. */
function focusTarget(el: HTMLElement): void {
  if (useInputDeviceStore.getState().device !== 'gamepad' || el.closest('.delve-hud-zoom')) return;
  const to = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE);
  to?.focus();
}

/**
 * The guided start's highlight (see the tutorial spec's client): a pulsing forge-gold outline
 * round the element the current step names, in the topmost pad scope only, following it as the
 * layout moves (it is placed every frame); while the target isn't on screen it outlines the way
 * there (`findWay`: the hub tab or the view that holds it), else nothing.
 * Under the pad the focus moves to the target once each time it appears. It never takes the
 * pointer. Mounted once, by AppShell.
 */
export function TutorialHighlight(): ReactElement | null {
  const target = useTutorialTarget();
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const div = ring.current;
    if (!target || !div) return;
    const pulse = reducedMotion()
      ? undefined
      : div.animate?.([{ opacity: 1 }, { opacity: 0.35 }], {
          duration: 700,
          direction: 'alternate',
          iterations: Infinity,
          easing: 'ease-in-out',
        });
    let shown: HTMLElement | null = null;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = findWay(target);
      div.style.display = el ? 'block' : 'none';
      if (el !== shown && el) focusTarget(el);
      shown = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const z = layerZoom(el);
      const out = (GAP + WIDTH) * z;
      div.style.left = `${r.left - out}px`;
      div.style.top = `${r.top - out}px`;
      div.style.width = `${r.width + out * 2}px`;
      div.style.height = `${r.height + out * 2}px`;
      div.style.borderWidth = `${WIDTH * z}px`;
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      pulse?.cancel();
    };
  }, [target]);
  if (!target) return null;
  return createPortal(
    <div
      ref={ring}
      aria-hidden
      style={RING}
      data-testid="tutorial-highlight"
      data-target={target}
    />,
    document.body,
  );
}
