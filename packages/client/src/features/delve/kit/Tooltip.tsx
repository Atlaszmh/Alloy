import {
  cloneElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { PromptBar } from './glyphs';
import { uiLayer } from './layer';
import type { Prompt, TooltipProps } from './types';
import { layerZoom } from './zoom';

/** The gap between a trigger and its card, in design px. */
const GAP = 12;

type Placement = NonNullable<TooltipProps['placement']>;

const OPPOSITE: Record<Placement, Placement> = {
  right: 'left',
  left: 'right',
  top: 'bottom',
  bottom: 'top',
};

type TriggerProps = {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  'aria-describedby'?: string;
  ref?: Ref<HTMLElement>;
};

/**
 * The card's top-left, in the px of the layer it renders under (every box ÷ that zoom `z`):
 * beside the trigger on `placement`'s side, on the other side when it would leave the viewport
 * there and fits on that one, then clamped inside the viewport.
 */
function place(trigger: DOMRect, card: DOMRect, z: number, placement: Placement): CSSProperties {
  const [l, t, r, b] = [trigger.left, trigger.top, trigger.right, trigger.bottom].map((v) => v / z);
  const [w, h] = [card.width / z, card.height / z];
  const [vw, vh] = [window.innerWidth / z, window.innerHeight / z];
  const midX = (l + r) / 2 - w / 2;
  const at: Record<Placement, { left: number; top: number }> = {
    right: { left: r + GAP, top: t },
    left: { left: l - GAP - w, top: t },
    top: { left: midX, top: t - GAP - h },
    bottom: { left: midX, top: b + GAP },
  };
  const spills: Record<Placement, (p: { left: number; top: number }) => boolean> = {
    right: (p) => p.left + w > vw,
    left: (p) => p.left < 0,
    top: (p) => p.top < 0,
    bottom: (p) => p.top + h > vh,
  };
  const other = OPPOSITE[placement];
  const p =
    spills[placement](at[placement]) && !spills[other](at[other]) ? at[other] : at[placement];
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(max, 0));
  return { left: clamp(p.left, vw - w), top: clamp(p.top, vh - h) };
}

/**
 * Shows `content()` beside its child on hover and on focus (the pad's focus too), or while
 * `openWhile`. Portalled into uiLayer() by default; `portal={false}` renders it inline, under
 * the zoom the child sits under (the HUD). Placed once drawn (it measures itself), flipped or
 * clamped at the viewport's edge, and placed again on any scroll (a focus scrolling its trigger
 * into view) and on resize.
 */
export function Tooltip({
  content,
  children,
  placement = 'right',
  openWhile,
  portal = true,
}: TooltipProps): ReactElement {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const open = (openWhile ?? false) || hovered || focused;
  const own = children.props as TriggerProps;
  const ownRef = own.ref;

  const ref = useCallback(
    (el: HTMLElement | null) => {
      anchor.current = el;
      if (typeof ownRef === 'function') ownRef(el);
      else if (ownRef) ownRef.current = el;
    },
    [ownRef],
  );

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const measure = () => {
      const el = anchor.current;
      const card = tip.current;
      if (!el || !card) return;
      const z = layerZoom(portal ? uiLayer() : el);
      setPos(place(el.getBoundingClientRect(), card.getBoundingClientRect(), z, placement));
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, placement, portal]);

  const trigger = cloneElement(children as ReactElement<TriggerProps>, {
    ref,
    onMouseEnter: (e) => {
      own.onMouseEnter?.(e);
      setHovered(true);
    },
    onMouseLeave: (e) => {
      own.onMouseLeave?.(e);
      setHovered(false);
    },
    onFocus: (e) => {
      own.onFocus?.(e);
      setFocused(true);
    },
    onBlur: (e) => {
      own.onBlur?.(e);
      setFocused(false);
    },
    'aria-describedby': open ? id : own['aria-describedby'],
  });

  let card: ReactNode = null;
  if (open) {
    card = (
      <div
        ref={tip}
        role="tooltip"
        id={id}
        className="k-tip"
        style={pos ?? { left: 0, top: 0, visibility: 'hidden' }}
      >
        {content()}
      </div>
    );
    if (portal) card = createPortal(card, uiLayer());
  }

  return (
    <>
      {trigger}
      {card}
    </>
  );
}

/** A tooltip's card: a plate (the hub) or glass (the HUD), with a title row and optional prompts. */
export function TooltipCard({
  title,
  subtitle,
  accent,
  children,
  prompts,
  material = 'plate',
  width = 420,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  children: ReactNode;
  prompts?: Prompt[];
  material?: 'plate' | 'glass';
  width?: number;
}): ReactElement {
  return (
    <div className={`k-tipcard k-${material}`} style={{ width, borderColor: accent }}>
      <div className="k-tipcard-head">
        <span className="k-disp">{title}</span>
        {subtitle !== undefined && <span className="k-caption">{subtitle}</span>}
      </div>
      {children}
      {prompts && prompts.length > 0 && <PromptBar prompts={prompts} />}
    </div>
  );
}
