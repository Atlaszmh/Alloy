import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { candidates } from '@/features/gamepad/use-gamepad-nav';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { Glyph, layerZoom, reducedMotion } from '../kit';
import { findMarked } from './marked';
import { useTutorialStep } from './tutorial-view';

/** Design px: how far outside the target the brackets stand, and how far they breathe out. */
const GAP = 10;
const BREATH = 4;
/** Design px: a bracket's arm and its thickness. */
const ARM = 16;
const THICK = 4;
/** Design px: the arrow, its gap to the brackets and its bounce; so, the room it needs above the target. */
const ARROW = 28;
const ARROW_GAP = 6;
const BOUNCE = 6;
const ROOM = BREATH + ARROW_GAP + ARROW + BOUNCE;
/** The marker's motion: out and back, for ever. */
const SWING: KeyframeAnimationOptions = {
  duration: 600,
  direction: 'alternate',
  iterations: Infinity,
  easing: 'ease-in-out',
};

/** The marker's root, placed each frame: over everything, never taking the pointer. */
const ROOT: CSSProperties = {
  position: 'fixed',
  display: 'none',
  zIndex: 80,
  pointerEvents: 'none',
};
/** The brackets' box: the root's, under the target's zoom (set each frame), over an ink shadow (`--k-well`). */
const BOX: CSSProperties = {
  position: 'absolute',
  inset: 0,
  filter: 'drop-shadow(2px 2px 0 #181425)',
};
/** One bracket: a white corner, its two outer sides drawn. */
const CORNER: CSSProperties = { position: 'absolute', width: ARM, height: ARM, boxSizing: 'border-box' };
const LINE = `${THICK}px solid #ffffff`;
const CORNERS: CSSProperties[] = [
  { top: 0, left: 0, borderTop: LINE, borderLeft: LINE },
  { top: 0, right: 0, borderTop: LINE, borderRight: LINE },
  { bottom: 0, left: 0, borderBottom: LINE, borderLeft: LINE },
  { bottom: 0, right: 0, borderBottom: LINE, borderRight: LINE },
];
/** The arrow's arm: centred above the box (each frame turns it under the box when there is no room above). */
const ARROW_ARM: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: '100%',
  paddingBottom: ARROW_GAP,
  transform: 'translateX(-50%)',
};

/**
 * Under the pad, the focus moves to the marked control, or to the first D-pad stop inside a
 * marked pane: never onto a control the D-pad passes by (a kit tab), never onto the HUD.
 */
function focusMarked(el: HTMLElement): void {
  if (useInputDeviceStore.getState().device !== 'gamepad' || el.closest('.delve-hud-zoom')) return;
  candidates(document.activeElement)
    .find((c) => el.contains(c))
    ?.focus();
}

/**
 * The guided start's marker (see the pad-nav and guidance spec, 1.5 and 2.2): four white corner
 * brackets round the control the current step marks (`findMarked`: its target, or the way to
 * it), breathing, under a bouncing forge-orange arrow (`--k-hot`) that points at it from above,
 * or from below when there is no room. It can't be read as the focus ring, and both can sit on
 * one control. It looks only in the topmost pad scope, follows its target as the layout moves
 * (it is placed every frame), stands still under reduced motion and never takes the pointer.
 * `data-target` names what it marks. Under the pad the focus moves to the marked control once
 * each time the marked target changes: keyed on the step, the target's id and the pad scope it
 * is found in (a picker opened over a field of the same target is a new one), never on the
 * target's DOM node, so a re-render moves nothing. Mounted once, by AppShell.
 */
export function TutorialHighlight(): ReactElement | null {
  const step = useTutorialStep();
  const root = useRef<HTMLDivElement>(null);
  const brackets = useRef<HTMLDivElement>(null);
  const arrowArm = useRef<HTMLSpanElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const [div, box, arm, tip] = [root.current, brackets.current, arrowArm.current, arrow.current];
    if (!step || !div || !box || !arm || !tip) return;
    const moving = reducedMotion()
      ? []
      : [
          box.animate?.([{ inset: '0px' }, { inset: `${-BREATH}px` }], SWING),
          tip.animate?.(
            [{ transform: 'translateY(0)' }, { transform: `translateY(${-BOUNCE}px)` }],
            SWING,
          ),
        ];
    /** The marked target the focus last followed (`<step>:<target>`), and the pad scope it was in. */
    let followed = '';
    let followedIn: Element | null = null;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const marked = findMarked(step);
      div.style.display = marked ? 'block' : 'none';
      if (!marked) return div.removeAttribute('data-target');
      div.dataset.target = marked.id;
      const key = `${step.id}:${marked.id}`;
      const scope = marked.el.closest('[data-pad-scope]');
      if (key !== followed || scope !== followedIn) focusMarked(marked.el);
      followed = key;
      followedIn = scope;
      const r = marked.el.getBoundingClientRect();
      const z = layerZoom(marked.el);
      const out = GAP * z;
      div.style.left = `${r.left - out}px`;
      div.style.top = `${r.top - out}px`;
      div.style.width = `${r.width + out * 2}px`;
      div.style.height = `${r.height + out * 2}px`;
      // The brackets and the arrow are in design px, under the zoom of what they mark.
      box.style.zoom = String(z);
      const below = r.top - out < ROOM * z;
      arm.style.top = below ? '100%' : '';
      arm.style.bottom = below ? '' : '100%';
      arm.style.transform = below ? 'translateX(-50%) rotate(180deg)' : 'translateX(-50%)';
      div.dataset.arrow = below ? 'below' : 'above';
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      for (const a of moving) a?.cancel();
    };
  }, [step]);
  if (!step) return null;
  return createPortal(
    <div ref={root} aria-hidden style={ROOT} data-testid="tutorial-highlight">
      <div ref={brackets} style={BOX}>
        {CORNERS.map((corner, i) => (
          <span key={i} data-corner style={{ ...CORNER, ...corner }} />
        ))}
        <span ref={arrowArm} style={ARROW_ARM}>
          <span ref={arrow} style={{ display: 'flex' }}>
            <Glyph id="down" size={ARROW} color="#feae34" />
          </span>
        </span>
      </div>
    </div>,
    document.body,
  );
}
