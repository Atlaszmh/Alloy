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

type TriggerProps = {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  'aria-describedby'?: string;
  ref?: Ref<HTMLElement>;
};

/** Where the card goes: the trigger's viewport box ÷ the zoom the card renders under, beside it. */
function place(
  rect: DOMRect,
  z: number,
  placement: NonNullable<TooltipProps['placement']>,
): CSSProperties {
  const midX = (rect.left + rect.width / 2) / z;
  switch (placement) {
    case 'right':
      return { left: rect.right / z + GAP, top: rect.top / z };
    case 'left':
      return { left: rect.left / z - GAP, top: rect.top / z, transform: 'translateX(-100%)' };
    case 'top':
      return { left: midX, top: rect.top / z - GAP, transform: 'translate(-50%, -100%)' };
    case 'bottom':
      return { left: midX, top: rect.bottom / z + GAP, transform: 'translateX(-50%)' };
  }
}

/**
 * Shows `content()` beside its child on hover and on focus (the pad's focus too), or while
 * `openWhile`. Portalled into uiLayer() by default; `portal={false}` renders it inline, under
 * the zoom the child sits under (the HUD).
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
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [, rerender] = useState(0);
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

  // `openWhile` on the first render: draw again once the trigger is in the DOM.
  useLayoutEffect(() => {
    if (openWhile) rerender((n) => n + 1);
  }, [openWhile]);

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
  const el = anchor.current;
  if (open && el) {
    const z = layerZoom(portal ? uiLayer() : el);
    card = (
      <div
        role="tooltip"
        id={id}
        className="k-tip"
        style={place(el.getBoundingClientRect(), z, placement)}
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
