import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from './controls';
import { PromptBar } from './glyphs';
import { uiLayer } from './layer';
import type { DialogProps, PanelProps, Prompt, ScreenProps } from './types';

/** A pane: a plate (wood-framed riveted steel, the hub), glass (HUD steel) or a well (a dark inset). */
export function Panel({
  as: Tag = 'section',
  material = 'plate',
  title,
  aside,
  accent,
  scroll = material === 'plate',
  testId,
  className = '',
  style,
  children,
  ...rest
}: PanelProps): ReactElement {
  const titleId = useId();
  return (
    <Tag
      {...rest}
      className={`k-panel k-${material} ${className}`}
      style={accent ? { ...style, borderColor: accent } : style}
      aria-labelledby={title !== undefined && !rest['aria-label'] ? titleId : undefined}
      data-testid={testId}
    >
      {(title !== undefined || aside !== undefined) && (
        <div className="k-panel-head">
          {title !== undefined && (
            <h2 id={titleId} className="k-section" style={{ margin: 0 }}>
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}
      <div className={`k-panel-body ${scroll ? 'k-scroll' : ''}`}>{children}</div>
    </Tag>
  );
}

/** A 1080p-design screen (.delve-ui.delve-zoom, a pad scope): a 72 px header, the main area, a 76 px plank footer. */
export function Screen({
  header,
  footer,
  children,
  backdrop,
  headerStyle = 'band',
  testId,
}: ScreenProps): ReactElement {
  return (
    <div
      className={`delve-ui delve-zoom k-screen ${backdrop === 'wall' ? 'k-wall' : `k-screen-${backdrop}`}`}
      data-pad-scope
      data-testid={testId}
    >
      <header
        className={`k-screen-head ${headerStyle === 'band' ? 'k-band' : ''}`}
        data-screen-section="screen-head"
      >
        {header}
      </header>
      <main className="k-screen-main" data-screen-section="screen-main">
        {children}
      </main>
      <footer className="k-screen-foot k-planks" data-screen-section="screen-foot">
        {footer}
      </footer>
    </div>
  );
}

/** A screen's header row: the title and subtitle, the nav (tabs), and the right-hand group. */
export function Header({
  title,
  subtitle,
  nav,
  aside,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  nav?: ReactNode;
  aside?: ReactNode;
}): ReactElement {
  return (
    <div className="k-header">
      <h1 className="k-header-title">
        <span className="k-disp">{title}</span>
        {subtitle !== undefined && <span className="k-caption">{subtitle}</span>}
      </h1>
      {nav !== undefined && <nav className="k-header-nav">{nav}</nav>}
      {aside !== undefined && <div className="k-header-aside">{aside}</div>}
    </div>
  );
}

/** A screen's footer row: its prompts, then `children` at the right. Draws only: the screen calls usePrompts. */
export function Footer({
  prompts,
  children,
}: {
  prompts: Prompt[];
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="k-footer">
      <PromptBar prompts={prompts} />
      {children !== undefined && <div className="k-footer-aside">{children}</div>}
    </div>
  );
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A centred plate in uiLayer() (zoomed), its own pad scope. Back carries `data-pad-back` (Esc and B
 * press it); with no `onClose` the dialog is forced and has no Back. The focus goes to
 * `initialFocus`, else the first `[data-pad-first]` inside, else Back, else the first control,
 * and back to the opener on close.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 640,
  initialFocus,
  testId,
}: DialogProps): ReactElement {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    const first =
      initialFocus?.current ??
      ref.current?.querySelector<HTMLElement>('[data-pad-first]') ??
      ref.current?.querySelector<HTMLElement>('[data-pad-back]') ??
      ref.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      ref.current;
    first?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocus, opener]);

  // Tab and Shift+Tab wrap inside the dialog: the screen behind never takes the focus.
  const trapTab = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const all = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.tabIndex >= 0,
    );
    if (all.length === 0) return;
    const [first, last] = [all[0], all[all.length - 1]];
    const at = document.activeElement;
    if (e.shiftKey ? at !== first && at !== ref.current : at !== last) return;
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  };

  return createPortal(
    <div className="k-dialog-backdrop" data-pad-scope>
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="k-panel k-plate k-dialog"
        style={{ width }}
        data-testid={testId}
        onKeyDown={trapTab}
      >
        <div className="k-panel-head">
          <h2 id={titleId} className="k-heading" style={{ margin: 0 }}>
            {title}
          </h2>
          {onClose && (
            <Button
              variant="quiet"
              size="sm"
              binding={{ key: 'Escape', pad: 'b' }}
              data-pad-back
              onClick={onClose}
            >
              Back
            </Button>
          )}
        </div>
        <div className="k-panel-body k-scroll">{children}</div>
        {footer !== undefined && <div className="k-footer">{footer}</div>}
      </section>
    </div>,
    uiLayer(),
  );
}
