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
  const cols = Math.ceil(item.slots.length / 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
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

      {/* Socket grid — sockets fill available width.
          Pulse animation lives on the grid container so all empty sockets
          stay in sync regardless of when they become empty. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 'var(--gap-sm)',
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
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 'var(--socket-radius)',
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
