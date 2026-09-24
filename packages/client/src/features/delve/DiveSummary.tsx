import { useEffect, useRef } from 'react';
import type { DiveState } from '@alloy/engine';
import { RARITY_ORDER } from '@alloy/engine';
import { ItemTile } from './ItemTile';
import { RARITY_COLOR, RARITY_LABEL, formatNumber } from './format';

interface DiveSummaryProps {
  dive: DiveState;
  biomeName: string;
  onCamp: () => void;
  onAgain: () => void;
  againLabel: string;
}

export function DiveSummary({ dive, biomeName, onCamp, onAgain, againLabel }: DiveSummaryProps) {
  const died = dive.phase === 'dead';
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    titleRef.current?.animate(
      [
        { transform: 'scale(2.2)', opacity: 0, letterSpacing: '0.5em' },
        { transform: 'scale(1)', opacity: 1, letterSpacing: '0.12em' },
      ],
      { duration: 550, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
    );
  }, []);

  const totalFound = RARITY_ORDER.reduce((n, r) => n + dive.found[r], 0);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 px-4"
      style={{
        background: died
          ? 'radial-gradient(ellipse at 50% 35%, rgba(90,10,10,0.85), rgba(0,0,0,0.96))'
          : 'radial-gradient(ellipse at 50% 35%, rgba(90,70,10,0.8), rgba(0,0,0,0.96))',
      }}
      data-testid="dive-summary"
    >
      <div
        ref={titleRef}
        className="delve-display text-5xl font-bold"
        style={{
          color: died ? '#f87171' : '#fcd34d',
          textShadow: `0 0 30px ${died ? '#dc2626' : '#d4a834'}`,
        }}
      >
        {died ? 'YOU FELL' : 'EXTRACTED'}
      </div>
      <div className="text-sm text-stone-300">
        Depth {dive.depth} · {biomeName}
      </div>

      <div className="delve-panel grid w-full max-w-[420px] grid-cols-3 gap-2 p-3 text-center">
        <div>
          <div className="delve-display text-2xl font-bold">{dive.depthsCleared}</div>
          <div className="text-[11px] text-stone-400">depths cleared</div>
        </div>
        <div>
          <div className="delve-display text-2xl font-bold">{dive.kills}</div>
          <div className="text-[11px] text-stone-400">kills</div>
        </div>
        <div>
          <div className="delve-display text-2xl font-bold">{totalFound}</div>
          <div className="text-[11px] text-stone-400">items found</div>
        </div>
        <div className="col-span-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
          {RARITY_ORDER.filter((r) => dive.found[r] > 0).map((r) => (
            <span key={r} style={{ color: RARITY_COLOR[r] }}>
              {dive.found[r]} {RARITY_LABEL[r]}
            </span>
          ))}
        </div>
      </div>

      {dive.bestFind && (
        <div className="flex items-center gap-3">
          <ItemTile item={dive.bestFind} size={58} />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-stone-500">Best find</div>
            <div
              className="delve-display text-lg font-bold"
              style={{ color: RARITY_COLOR[dive.bestFind.rarity] }}
            >
              {dive.bestFind.name}
            </div>
          </div>
        </div>
      )}

      <div className="text-center text-sm">
        {died ? (
          <span className="text-stone-400">
            Bounty lost:{' '}
            <span className="text-red-400 line-through">⚙ {formatNumber(dive.bounty)}</span>
          </span>
        ) : (
          <span className="text-stone-300">
            Bounty claimed:{' '}
            <span className="font-bold text-amber-300">⚙ {formatNumber(dive.bounty)}</span>
          </span>
        )}
        <div className="text-xs text-stone-500">
          ⚙ {formatNumber(dive.scrapEarned)} scrap earned this dive
        </div>
      </div>

      <div className="flex w-full max-w-[420px] flex-col gap-2">
        <button
          className="delve-btn delve-btn-gold py-3 text-base"
          onClick={onCamp}
          data-testid="return-camp"
        >
          RETURN TO THE ANVIL
        </button>
        <button className="delve-btn py-2.5" onClick={onAgain} data-testid="dive-again">
          {againLabel}
        </button>
      </div>
    </div>
  );
}
