import type { RuneRef } from '@alloy/engine';
import { formatNumber } from '../format';
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
  onOpenSocket?: () => void;
  onSocketTap?: (socket: number) => void;
}

/**
 * A move's sockets, under its card: each open socket as a pip (its rune's
 * glyph, dimmed with its reason when dormant, or an empty ring), then
 * "+ socket" with the next one's price while the move is below its cap.
 * Tapping a pip calls `onSocketTap`; locked (a dive, the item sheet), the pips
 * are marks, not buttons. A move with no socket and none to open shows nothing.
 */
export function SocketRow({
  runes,
  cap,
  nextPrice,
  dormant = [],
  locked = false,
  onOpenSocket,
  onSocketTap,
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
          <span className="px-1 text-[11px] leading-none text-stone-500">◇</span>
        );
        return tap ? (
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
          className="delve-chip px-1.5 py-0 text-[10px]"
          onClick={onOpenSocket}
          data-testid="socket-open"
        >
          + socket
          {open.links > 0 && ` · 🔗 ${open.links}`}
          {open.scrap > 0 && ` · ⚙ ${formatNumber(open.scrap)}`}
        </button>
      )}
    </span>
  );
}
