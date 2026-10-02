import { Glyph } from '@/features/delve/kit';

/**
 * A timed buff on the hero (the spec's contract; 3C's snapshot fills `ArenaHud.buffs`). No
 * Galvanize: its spark is on the slots.
 */
export interface HudBuff {
  id: 'riposte' | 'quick' | 'barrier';
  /** Seconds left, from riposteUntil, quickUntil and barrier.until. */
  left: number;
  total: number | null;
}

const BUFF: Record<HudBuff['id'], { name: string; color: string }> = {
  riposte: { name: 'Riposte', color: '#fee761' },
  quick: { name: 'Quick', color: '#feae34' },
  barrier: { name: 'Barrier', color: '#ead4aa' },
};

/** The dock's buff tiles: 38 px each, its glyph and its seconds left. */
export function BuffRow({ buffs }: { buffs: readonly HudBuff[] }) {
  if (buffs.length === 0) return null;
  return (
    <div className="ml-3 flex gap-[6px]">
      {buffs.map((b) => {
        const { name, color } = BUFF[b.id];
        const secs = Math.ceil(b.left);
        return (
          <span
            key={b.id}
            role="img"
            aria-label={`${name}, ${secs}s left`}
            data-buff={b.id}
            className="flex h-[38px] w-[38px] flex-col items-center justify-end bg-[var(--k-well)] pb-px"
            style={{ border: `2px solid ${color}`, color }}
          >
            <Glyph id={b.id} size={16} />
            <span className="k-disp text-[14px]">{secs}s</span>
          </span>
        );
      })}
    </div>
  );
}
