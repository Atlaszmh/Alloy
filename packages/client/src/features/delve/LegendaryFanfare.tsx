import { useEffect, useRef } from 'react';
import type { GearItem } from '@alloy/engine';
import { baseDisplayName } from '@alloy/engine';
import { reducedMotion } from './kit';
import { getDelveRegistry } from './registry';
import { ItemIcon } from './ItemIcon';
import { legendaryText } from './format';

interface LegendaryFanfareProps {
  item: GearItem;
  firstTime: boolean;
  onDone: () => void;
}

/** Full-screen celebration for a legendary drop, in the forge kit. Tap to continue. */
export function LegendaryFanfare({ item, firstTime, onDone }: LegendaryFanfareProps) {
  const registry = getDelveRegistry();
  const rootRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(onDone, 3200);
    rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    // Under reduced motion only the fade: no zoom, no flying icon.
    if (reducedMotion()) return () => window.clearTimeout(id);
    titleRef.current?.animate(
      [
        { transform: 'scale(3)', opacity: 0 },
        { transform: 'scale(0.95)', opacity: 1, offset: 0.6 },
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
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={onDone}
      className="delve-ui delve-zoom absolute inset-0 z-[70] flex flex-col items-center justify-center gap-4 overflow-hidden border-0 px-8 text-center text-[var(--k-text)]"
      style={{
        background:
          'radial-gradient(circle at 50% 42%, rgba(247,118,34,0.45) 0 22%, rgba(247,118,34,0.22) 22% 40%, transparent 40%), rgba(24,20,37,0.96)',
      }}
      data-testid="legendary-fanfare"
    >
      {/* Rotating rays */}
      <div
        className="pointer-events-none absolute left-1/2 top-[42%] h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'repeating-conic-gradient(from 0deg, rgba(254,231,97,0.16) 0deg 8deg, transparent 8deg 22deg)',
          animation: 'delve-rays 12s linear infinite',
          maskImage: 'radial-gradient(circle, #000 0 30%, transparent 30%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0 30%, transparent 30%)',
        }}
      />
      <div ref={titleRef} className="k-display relative" style={{ color: 'var(--k-hot-hi)' }}>
        LEGENDARY!
      </div>
      <div ref={iconRef} className="relative h-36 w-36">
        <ItemIcon baseId={item.baseId} rarity="legendary" />
      </div>
      <div className="relative flex flex-col gap-2">
        <div className="k-disp text-[44px]" data-testid="fanfare-name">
          {item.name}
        </div>
        <div className="text-[16px] text-[var(--k-wood-text)]">
          Legendary {baseDisplayName(registry, item)}
        </div>
      </div>
      {item.legendary && (
        <div className="relative max-w-[520px] text-[18px]">
          {legendaryText(registry, item.legendary.id, item.legendary.value)}
        </div>
      )}
      {firstTime && (
        <div className="k-label relative" style={{ color: 'var(--k-hot)' }}>
          New codex entry!
        </div>
      )}
      <div className="k-label relative">Tap to continue</div>
    </button>
  );
}
