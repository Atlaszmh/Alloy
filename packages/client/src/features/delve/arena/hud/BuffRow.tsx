import type { BoonFamily } from '@alloy/engine';
import { Glyph, Tooltip, TooltipCard, type GlyphId } from '@/features/delve/kit';

import type { HudBuff } from '../useArenaCore';

export type { HudBuff };

type BoonBuff = Extract<HudBuff, { id: 'boon' }>;

const BUFF: Record<Exclude<HudBuff['id'], 'boon'>, { name: string; color: string }> = {
  riposte: { name: 'Riposte', color: '#fee761' },
  quick: { name: 'Quick', color: '#feae34' },
  barrier: { name: 'Barrier', color: '#ead4aa' },
};

/** A boon's border: for the floor, or the rest of the dive. */
const BLESSING = { floor: '#2ce8f5', dive: '#feae34' };

/** Each family's glyph on its tile (existing art; `quick` is left to the timed buff). */
const FAMILY_GLYPH: Record<BoonFamily, GlyphId> = {
  offense: 'attack',
  element: 'rune-elemental',
  defense: 'barrier',
  tempo: 'rune-tempo',
  fortune: 'chest',
  pact: 'skull',
  floor: 'door',
};

/** The dock's buff tiles: 38 px each, its glyph and its seconds left (a boon has none: its count instead). */
export function BuffRow({ buffs }: { buffs: readonly HudBuff[] }) {
  if (buffs.length === 0) return null;
  return (
    <div className="ml-3 flex gap-[6px]">
      {buffs.map((b) => {
        if (b.id === 'boon') return <BoonTile key={`boon-${b.dive ? 'dive' : 'floor'}-${b.boon}`} b={b} />;
        const { name, color } = BUFF[b.id];
        // Stone Skin's barrier lasts the floor: no countdown.
        const timed = Number.isFinite(b.left);
        const secs = Math.ceil(b.left);
        return (
          <span
            key={b.id}
            role="img"
            aria-label={timed ? `${name}, ${secs}s left` : `${name}, this floor`}
            data-buff={b.id}
            className="flex h-[38px] w-[38px] flex-col items-center justify-end bg-[var(--k-well)] pb-px"
            style={{ border: `2px solid ${color}`, color }}
          >
            <Glyph id={b.id} size={16} />
            {timed && <span className="k-disp text-[16px]">{secs}s</span>}
          </span>
        );
      })}
    </div>
  );
}

/** One worn boon: its family glyph, its count when stacked, and its tiers' lines on hover or focus. */
function BoonTile({ b }: { b: BoonBuff }) {
  const label = `${b.name}${b.count > 1 ? ` ×${b.count}` : ''}, ${b.dive ? 'this dive' : 'this floor'}`;
  return (
    <Tooltip
      placement="top"
      portal={false}
      content={() => (
        <TooltipCard title={b.name} subtitle={b.dive ? 'This dive' : 'This floor'} material="glass" width={340}>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {b.lines.map((line, i) => (
              <li key={i} className="k-body-2">
                {line}
              </li>
            ))}
          </ul>
        </TooltipCard>
      )}
    >
      <span
        role="img"
        tabIndex={0}
        aria-label={label}
        data-buff="boon"
        data-boon={b.boon}
        className="pointer-events-auto relative flex h-[38px] w-[38px] items-center justify-center bg-[var(--k-well)]"
        style={{ border: `2px solid ${b.dive ? BLESSING.dive : BLESSING.floor}` }}
      >
        <Glyph id={FAMILY_GLYPH[b.family]} size={20} />
        {b.count > 1 && (
          <span
            data-count
            className="k-disp absolute bottom-0 right-[2px] text-[16px] leading-none text-[var(--k-text)]"
          >
            {b.count}
          </span>
        )}
      </span>
    </Tooltip>
  );
}
