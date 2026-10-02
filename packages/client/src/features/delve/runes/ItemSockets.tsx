import { CHAIN_SKILLS, movesOf, socketsOf, type Chains } from '@alloy/engine';
import { SKILL_NAME } from '../chains/chain-text';
import { SocketRow } from './SocketRow';

/**
 * A weapon's sockets on its item sheet, read-only: each move with an open
 * socket ("Primary 2", then its pips), or, with none open, how to open them.
 */
export function ItemSockets({ chains, cap }: { chains: Partial<Chains>; cap: number }) {
  const rows = CHAIN_SKILLS.flatMap((s) =>
    movesOf(chains[s])
      .map((m, i) => ({ s, i, runes: socketsOf(m) }))
      .filter((r) => r.runes.length > 0),
  );
  return (
    <div className="flex flex-col gap-0.5" data-testid="item-sockets">
      <div className="delve-display text-[14px] font-bold uppercase tracking-widest text-amber-300/80">
        Sockets · up to {cap} a move
      </div>
      {rows.length === 0 && (
        <div className="text-stone-500">None open yet: open them in the chain builder.</div>
      )}
      {rows.map(({ s, i, runes }) => (
        <div
          key={`${s}-${i}`}
          className="flex items-center gap-1.5 text-stone-300"
          data-testid={`item-sockets-${s}-${i}`}
        >
          <span>
            {SKILL_NAME[s]} {i + 1}
          </span>
          <SocketRow runes={runes} cap={cap} nextPrice={null} locked />
        </div>
      ))}
    </div>
  );
}
