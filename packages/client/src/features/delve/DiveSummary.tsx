import { useEffect, useRef } from 'react';
import type { DiveState } from '@alloy/engine';
import { RARITY_ORDER } from '@alloy/engine';
import { Button, Price, reducedMotion } from './kit';
import { ItemTile } from './ItemTile';
import { RARITY_LABEL, RARITY_TEXT } from './format';
import { getDelveRegistry } from './registry';
import { haulRows } from './materials/material-style';
import { HaulList } from './materials/HaulList';

interface DiveSummaryProps {
  dive: DiveState;
  biomeName: string;
  onCamp: () => void;
  /** None while the guided start runs: its next step waits at the Anvil. */
  onAgain?: () => void;
  againLabel?: string;
}

/** A stepped glow behind the title: red for a fall or an abandon, forge orange for an extract. */
const glow = (rgb: string) =>
  `radial-gradient(ellipse at 50% 35%, rgba(${rgb},0.22) 0 30%, rgba(${rgb},0.1) 30% 48%, transparent 48%), rgba(6,6,11,0.94)`;

/**
 * The dive's end, extracted, fallen or abandoned (an abandon settles the dive and leaves its
 * phase: it counts as a death): the depth and biome, what it cleared, killed and found, the best
 * find, the bounty claimed or lost, what it brought home (`dive.banked`) and what a death or an
 * abandon lost (`dive.lost`), then back to the Anvil or straight in again.
 */
export function DiveSummary({ dive, biomeName, onCamp, onAgain, againLabel }: DiveSummaryProps) {
  const extracted = dive.phase === 'extracted';
  const title = extracted ? 'EXTRACTED' : dive.phase === 'dead' ? 'YOU FELL' : 'ABANDONED';
  const titleRef = useRef<HTMLHeadingElement>(null);
  const registry = getDelveRegistry();
  const home = haulRows(registry, dive.banked);
  const lost = dive.lost ? haulRows(registry, dive.lost) : [];

  useEffect(() => {
    if (reducedMotion()) return;
    titleRef.current?.animate(
      [
        { transform: 'scale(2.2)', opacity: 0, letterSpacing: '0.5em' },
        { transform: 'scale(1)', opacity: 1, letterSpacing: '0.05em' },
      ],
      { duration: 550, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
    );
  }, []);

  const totalFound = RARITY_ORDER.reduce((n, r) => n + dive.found[r], 0);
  const stats: [number, string][] = [
    [dive.depthsCleared, 'depths cleared'],
    [dive.kills, 'kills'],
    [totalFound, 'items found'],
  ];

  return (
    <div
      className="delve-ui delve-zoom absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8"
      style={{ background: glow(extracted ? '247,118,34' : '228,59,68') }}
      data-testid="dive-summary"
      data-pad-scope
    >
      <h1
        ref={titleRef}
        className="k-display m-0"
        style={{ color: extracted ? 'var(--k-hot-hi)' : 'var(--k-bad-text)' }}
      >
        {title}
      </h1>
      <p className="k-body-2 m-0">
        Depth {dive.depth} · {biomeName}
      </p>

      <div className="k-plate grid w-[560px] grid-cols-3 gap-4 p-[22px] text-center">
        {stats.map(([n, label]) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="k-disp text-[40px]">{n}</span>
            <span className="k-caption">{label}</span>
          </div>
        ))}
        {totalFound > 0 && (
          <div className="col-span-3 flex flex-wrap justify-center gap-x-4 gap-y-1 bg-[var(--k-well)] px-3 py-2 text-[16px]">
            {RARITY_ORDER.filter((r) => dive.found[r] > 0).map((r) => (
              <span key={r} style={{ color: RARITY_TEXT[r] }}>
                {dive.found[r]} {RARITY_LABEL[r]}
              </span>
            ))}
          </div>
        )}
      </div>

      {dive.bestFind && (
        <div className="flex items-center gap-4">
          <ItemTile item={dive.bestFind} size={64} />
          <div className="flex flex-col gap-1">
            <span className="k-label">Best find</span>
            <span
              className="k-disp text-[26px]"
              style={{ color: RARITY_TEXT[dive.bestFind.rarity] }}
            >
              {dive.bestFind.name}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-2 text-center">
        {extracted ? (
          <span className="text-[18px] text-[var(--k-text-2)]">
            Bounty claimed:{' '}
            <b className="text-[var(--k-hot)]">
              <Price scrap={dive.bounty} />
            </b>
          </span>
        ) : (
          <span className="text-[18px] text-[var(--k-text-2)]">
            Bounty lost:{' '}
            <s className="text-[var(--k-bad-text)]">
              <Price scrap={dive.bounty} />
            </s>
          </span>
        )}
      </div>

      <div className="flex w-[560px] gap-4">
        <section
          className="k-plate k-scroll flex max-h-[240px] flex-1 flex-col gap-2 p-4"
          data-testid="dive-home"
        >
          <span className="k-label">Brought home</span>
          {home.length > 0 ? <HaulList rows={home} /> : <span className="k-caption">Nothing</span>}
        </section>
        {lost.length > 0 && (
          <section
            className="k-plate k-scroll flex max-h-[240px] flex-1 flex-col gap-2 p-4"
            data-testid="dive-lost"
          >
            <span className="k-label text-[var(--k-bad-text)]">Lost</span>
            <HaulList rows={lost} struck />
          </section>
        )}
      </div>

      <div className="flex w-[560px] flex-col gap-3">
        <Button variant="primary" size="lg" onClick={onCamp} data-pad-first testId="return-camp">
          RETURN TO THE ANVIL
        </Button>
        {onAgain && (
          <Button onClick={onAgain} testId="dive-again">
            {againLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
