import { useEffect, useRef, useState } from 'react';
import type { AffixDef, DataRegistry, EquippedSlot, ForgedItem, ForgePlan, GemInstance } from '@alloy/engine';
import { ELEMENT_EMOJIS } from '@/shared/utils/element-theme';
import { GemCard } from '@/components/GemCard';
import { getStatLabel } from '@/shared/utils/stat-label';

interface ItemSocketViewProps {
  item: ForgedItem;
  cardId: 'weapon' | 'armor';
  registry: DataRegistry;
  plan: ForgePlan;
  selectedOrbUid: string | null;
  isDragging?: boolean;
  onSocketClick: (slotIndex: number) => void;
  onSocketRemove: (slotIndex: number) => void;
  onGemPointerDown?: (uid: string, e: React.PointerEvent) => void;
}

const ELEMENTS = ['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos'] as const;


function getSlotGem(slot: EquippedSlot): GemInstance {
  return slot.gem;
}

function getElementTag(affix: AffixDef): string {
  return affix.tags.find(t => (ELEMENTS as readonly string[]).includes(t)) ?? 'physical';
}

export function ItemSocketView({
  item,
  cardId,
  registry,
  plan,
  selectedOrbUid,
  isDragging,
  onSocketClick,
  onSocketRemove,
  onGemPointerDown,
}: ItemSocketViewProps) {
  const baseItem = registry.getBaseItem(item.baseItemId);
  const maxCols = Math.ceil(item.slots.length / 2);

  // Socket grid uses fixed tracks at `var(--gem-size)` — but `--gem-size` is
  // sized for 5-per-row in the stockpile (full width). The socket grid lives
  // in half the page width, so a 3-col grid at the stockpile size overflows
  // the card column and spills a horizontal scrollbar into the items scroll
  // ancestor. Scope a smaller --gem-size locally so the grid fits, and drop
  // to fewer columns on very narrow viewports.
  const MIN_SOCKET_SIZE = 48;
  const rootRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<{ size: number; cols: number } | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const styles = getComputedStyle(el);
      const parentGem = parseFloat(styles.getPropertyValue('--gem-size')) || 100;
      const gap = parseFloat(styles.getPropertyValue('--gap-sm')) || 6;
      // Pick the largest col count that fits at >= MIN_SOCKET_SIZE.
      let nextCols = 1;
      let nextSize = Math.max(MIN_SOCKET_SIZE, Math.min(parentGem, width));
      for (let c = maxCols; c >= 1; c--) {
        const fit = Math.floor((width - (c - 1) * gap) / c);
        if (fit >= MIN_SOCKET_SIZE || c === 1) {
          nextCols = c;
          nextSize = Math.max(MIN_SOCKET_SIZE, Math.min(parentGem, fit));
          break;
        }
      }
      setSocket({ size: nextSize, cols: nextCols });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxCols]);

  const cols = socket?.cols ?? maxCols;
  const localGemStyle: React.CSSProperties = socket
    ? ({
        '--gem-size': `${socket.size}px`,
        '--gem-radius': `${socket.size * 0.16}px`,
      } as React.CSSProperties)
    : {};

  return (
    <div
      ref={rootRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)', ...localGemStyle }}
    >
      {/* Item info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-xs)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
          <span
            style={{
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              fontSize: 'var(--text-md)',
              color: 'white',
            }}
          >
            {baseItem.name}
          </span>
          <span
            style={{
              fontSize: 'var(--text-2xs)',
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              textTransform: 'uppercase',
              background: 'var(--color-surface-600)',
              color: 'var(--color-bronze-light)',
              borderRadius: 4,
              padding: '2px 6px',
              letterSpacing: '0.05em',
            }}
          >
            {cardId}
          </span>
        </div>

        {/* Base item stats */}
        {Object.keys(baseItem.baseStats).length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--gap-sm)', flexWrap: 'wrap' }}>
            {Object.entries(baseItem.baseStats).map(([stat, value]) => {
              const isPositive = value >= 0;
              const sign = isPositive ? '+' : '';
              const label = `${sign}${value} ${stat}`;
              return (
                <span
                  key={stat}
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-family-display)',
                    color: isPositive ? 'var(--color-inherent)' : 'var(--color-danger)',
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {/* Base stats */}
        {item.baseStats && (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-family-display)',
              color: 'var(--color-base-stat)',
              display: 'flex',
              gap: 12,
            }}
          >
            <span>{item.baseStats.stat1}</span>
            <span>{item.baseStats.stat2}</span>
          </div>
        )}
      </div>

      {/* Socket grid — fixed-size slots matching GemCard dimensions so
          empty and filled sockets stay the same size.
          Pulse animation lives on the grid container so all empty sockets
          stay in sync regardless of when they become empty. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, var(--gem-size))`,
          gap: 'var(--gap-sm)',
          justifyContent: 'center',
          animation: (selectedOrbUid !== null || isDragging) ? 'orb-glow 1.5s ease-in-out infinite' : 'none',
        }}
      >
        {item.slots.map((slot, index) => {
          if (slot === null) {
            // Empty socket
            return (
              <button
                key={index}
                data-forge-socket={index}
                onClick={() => onSocketClick(index)}
                style={{
                  width: 'var(--gem-size)',
                  height: 'var(--gem-size)',
                  borderRadius: 'var(--gem-radius)',
                  background: 'var(--color-surface-800)',
                  border: isDragging ? '1.5px dashed var(--color-bronze-light)' : '1.5px dashed var(--color-empty-socket)',
                  boxShadow: isDragging
                    ? '0 0 12px rgba(212,168,52,0.4), inset 0 2px 4px rgba(0,0,0,0.5)'
                    : 'inset 0 2px 4px rgba(0,0,0,0.5)',
                  cursor: 'pointer',
                  touchAction: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                }}
              />
            );
          }

          const orb = getSlotGem(slot);
          const affix = registry.getAffix(orb.affixId);
          const isLocked = plan.lockedGemUids.has(orb.uid);
          const statLabel = getStatLabel(affix, orb, cardId);

          if (isLocked) {
            return (
              <div key={index} data-forge-socket={index} style={{ display: 'flex', justifyContent: 'center' }}>
                <GemCard
                  uid={orb.uid}
                  affixId={orb.affixId}
                  affixName={affix.name}
                  tier={orb.tier}
                  rarity={orb.rarity}
                  category={affix.category}
                  tags={affix.tags}
                  statLabel={statLabel}
                />
              </div>
            );
          }

          return (
            <div key={index} data-forge-socket={index} style={{ display: 'flex', justifyContent: 'center' }}>
              <GemCard
                uid={orb.uid}
                affixId={orb.affixId}
                affixName={affix.name}
                tier={orb.tier}
                rarity={orb.rarity}
                category={affix.category}
                tags={affix.tags}
                statLabel={statLabel}
                onClick={() => onSocketRemove(index)}
                onPointerDown={(e) => onGemPointerDown?.(orb.uid, e)}
              />
            </div>
          );
        })}
      </div>

      {/* Equipped affixes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
        {item.slots.map((slot, index) => {
          if (!slot) return null;
          const orb = getSlotGem(slot);
          const affix = registry.getAffix(orb.affixId);
          const tag = getElementTag(affix);
          const emoji = ELEMENT_EMOJIS[tag] ?? '\u2694';
          const isLocked = plan.lockedGemUids.has(orb.uid);
          const statValue = getStatLabel(affix, orb, cardId);

          return (
            <div
              key={index}
              style={{
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-family-display)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--gap-sm)',
              }}
            >
              <span>{emoji}</span>
              <span style={{ fontWeight: 600 }}>{affix.name}</span>
              {statValue && (
                <span style={{ color: 'var(--color-surface-300)', fontSize: 'var(--text-xs)' }}>{statValue}</span>
              )}
              {isLocked && <span>{'\uD83D\uDD12'}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
