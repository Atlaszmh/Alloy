import type { RuneRef } from '@alloy/engine';
import { Price } from '@/features/delve/kit';
import { getDelveRegistry } from '../registry';
import { RuneGlyph } from './RuneGlyph';
import { dormantText, runeName } from './rune-style';

export interface SocketRowProps {
  runes: readonly (RuneRef | null)[];
  cap: number;
  /** The next socket's price; null hides "+ socket" (at the cap, or locked). 0 and 0: free. */
  nextPrice: { links: number; scrap: number } | null;
  /** Socket indexes whose rune does nothing on this move now. */
  dormant?: readonly number[];
  locked?: boolean;
  /** Only the empty sockets take a tap (a stop's rune pick); filled ones are marks. */
  emptyOnly?: boolean;
  onOpenSocket?: () => void;
  onSocketTap?: (socket: number) => void;
  /** Why "+ socket" is off: the id of the text that says so (it is disabled while set). */
  whyId?: string;
}

/**
 * A move's sockets, under its card: each open socket as a pip (its rune's
 * glyph, dimmed with its reason when dormant, or an empty ring), then
 * "+ socket" with the next one's price while the move is below its cap (off,
 * and described by it, while `whyId` names a reason).
 * Tapping a pip calls `onSocketTap`; locked (a dive, the item sheet), the pips
 * are marks, not buttons (with `emptyOnly`, the filled ones). A move with no
 * socket and none to open shows nothing.
 */
export function SocketRow({
  runes,
  cap,
  nextPrice,
  dormant = [],
  locked = false,
  emptyOnly = false,
  onOpenSocket,
  onSocketTap,
  whyId,
}: SocketRowProps) {
  const registry = getDelveRegistry();
  const tap = locked ? undefined : onSocketTap;
  const open = !locked && nextPrice !== null && runes.length < cap ? nextPrice : null;
  if (runes.length === 0 && !open) return null;
  return (
    <span className="flex flex-wrap items-center justify-center gap-0.5" data-testid="socket-row">
      {runes.map((r, i) => {
        const off = !!r && dormant.includes(i);
        const why = off ? dormantText(registry.getRune(r.id)) : undefined;
        const label = `Socket ${i + 1}: ${r ? runeName(registry, r) : 'empty'}${why ? `, dormant: ${why.toLowerCase()}` : ''}`;
        const rune = r ? `${r.id}:${r.tier}` : undefined;
        const pip = r ? (
          <RuneGlyph rune={r} dormant={off} size="sm" />
        ) : (
          <span className="px-1 text-[16px] leading-none text-stone-500">◇</span>
        );
        return tap && !(emptyOnly && r) ? (
          <button
            key={i}
            type="button"
            className="delve-chip px-0.5 py-0"
            aria-label={label}
            title={why}
            onClick={() => tap(i)}
            data-testid={`socket-${i}`}
            data-rune={rune}
          >
            {pip}
          </button>
        ) : (
          <span
            key={i}
            role="img"
            aria-label={label}
            title={why}
            data-testid={`socket-${i}`}
            data-rune={rune}
          >
            {pip}
          </span>
        );
      })}
      {open && (
        <button
          type="button"
          className="delve-chip inline-flex flex-wrap items-center justify-center gap-x-1 px-1.5 py-0 text-[16px] [&_.k-price]:flex-wrap"
          disabled={!!whyId}
          aria-describedby={whyId}
          onClick={onOpenSocket}
          data-testid="socket-open"
        >
          + socket
          {(open.links > 0 || open.scrap > 0) && (
            <>
              {' · '}
              <Price
                links={open.links > 0 ? open.links : undefined}
                scrap={open.scrap > 0 ? open.scrap : undefined}
              />
            </>
          )}
        </button>
      )}
    </span>
  );
}
