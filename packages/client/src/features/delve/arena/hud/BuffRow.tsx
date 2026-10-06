import { Glyph } from '@/features/delve/kit';

import type { HudBuff } from '../useArenaCore';

export type { HudBuff };

const BUFF: Record<Exclude<HudBuff['id'], 'shrine'>, { name: string; color: string }> = {
  riposte: { name: 'Riposte', color: '#fee761' },
  quick: { name: 'Quick', color: '#feae34' },
  barrier: { name: 'Barrier', color: '#ead4aa' },
};

/** A shrine's blessing: for the floor, or the rest of the dive. */
const BLESSING = { floor: '#2ce8f5', dive: '#feae34' };

/** The dock's buff tiles: 38 px each, its glyph and its seconds left (a blessing has none). */
export function BuffRow({ buffs }: { buffs: readonly HudBuff[] }) {
  if (buffs.length === 0) return null;
  return (
    <div className="ml-3 flex gap-[6px]">
      {buffs.map((b, i) => {
        if (b.id === 'shrine') {
          const label = `${b.name}, ${b.dive ? 'this dive' : 'this floor'}`;
          return (
            <span
              key={`shrine-${i}`}
              role="img"
              aria-label={label}
              title={label}
              data-buff="shrine"
              className="flex h-[38px] w-[38px] items-center justify-center bg-[var(--k-well)]"
              style={{ border: `2px solid ${b.dive ? BLESSING.dive : BLESSING.floor}` }}
            >
              <Glyph id="shrine" size={20} />
            </span>
          );
        }
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
            <span className="k-disp text-[16px]">{secs}s</span>
          </span>
        );
      })}
    </div>
  );
}
