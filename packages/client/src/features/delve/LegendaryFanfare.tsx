import { useEffect, useRef } from 'react';
import type { GearItem } from '@alloy/engine';
import { baseDisplayName } from '@alloy/engine';
import { getDelveRegistry } from './registry';
import { ItemIcon } from './ItemIcon';
import { legendaryText } from './format';

interface LegendaryFanfareProps {
  item: GearItem;
  firstTime: boolean;
  onDone: () => void;
}

/** Full-screen celebration for a legendary drop. Tap to continue. */
export function LegendaryFanfare({ item, firstTime, onDone }: LegendaryFanfareProps) {
  const registry = getDelveRegistry();
  const rootRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    titleRef.current?.animate(
      [
        { transform: 'scale(3)', opacity: 0, filter: 'blur(8px)' },
        { transform: 'scale(0.95)', opacity: 1, filter: 'blur(0)', offset: 0.6 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 520, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
    );
    iconRef.current?.animate(
      [
        { transform: 'translateY(60px) scale(0.2) rotate(-40deg)', opacity: 0 },
        { transform: 'translateY(-10px) scale(1.2) rotate(8deg)', opacity: 1, offset: 0.6 },
        { transform: 'translateY(0) scale(1) rotate(0)', opacity: 1 },
      ],
      { duration: 700, delay: 150, easing: 'cubic-bezier(0.2, 1.3, 0.4, 1)', fill: 'backwards' },
    );
    const id = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={onDone}
      className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-3 overflow-hidden border-0 px-6 text-center"
      style={{
        background:
          'radial-gradient(circle at 50% 42%, rgba(251,146,60,0.6), rgba(60,20,0,0.96) 55%, rgba(0,0,0,0.98)), rgba(8,4,0,0.9)',
      }}
      data-testid="legendary-fanfare"
    >
      {/* Rotating god-rays */}
      <div
        className="pointer-events-none absolute left-1/2 top-[42%] h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'repeating-conic-gradient(from 0deg, rgba(253,230,138,0.16) 0deg 8deg, transparent 8deg 22deg)',
          animation: 'delve-rays 12s linear infinite',
          maskImage: 'radial-gradient(circle, #000 0%, transparent 55%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 55%)',
        }}
      />
      <div
        ref={titleRef}
        className="delve-display relative text-4xl font-bold tracking-[0.18em]"
        style={{ color: '#fed7aa', textShadow: '0 0 24px #fb923c, 0 0 60px #ea580c' }}
      >
        LEGENDARY!
      </div>
      <div
        ref={iconRef}
        className="relative h-36 w-36"
        style={{ filter: 'drop-shadow(0 0 30px #fb923c)' }}
      >
        <ItemIcon baseId={item.baseId} rarity="legendary" />
      </div>
      <div className="relative">
        <div
          className="delve-display text-3xl font-bold text-orange-400"
          data-testid="fanfare-name"
        >
          {item.name}
        </div>
        <div className="text-sm text-orange-100/80">
          Legendary {baseDisplayName(registry, item)}
        </div>
      </div>
      {item.legendary && (
        <div className="relative max-w-[340px] text-sm text-orange-100">
          {legendaryText(registry, item.legendary.id, item.legendary.value)}
        </div>
      )}
      {firstTime && (
        <div className="relative text-xs font-bold uppercase tracking-widest text-amber-300">
          New codex entry!
        </div>
      )}
      <div className="relative mt-2 text-[11px] uppercase tracking-widest text-orange-200/50">
        Tap to continue
      </div>
    </button>
  );
}
