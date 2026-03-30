import type { AffixDef, DataRegistry, EquippedSlot, ForgedItem, ForgePlan, OrbInstance } from '@alloy/engine';
import { ELEMENT_GRADIENTS, ELEMENT_EMOJIS } from '@/shared/utils/element-theme';
import { getGemArt } from '@/shared/utils/art-registry';
import { getStatLabel } from '@/shared/utils/stat-label';

interface ItemSocketViewProps {
  item: ForgedItem;
  cardId: 'weapon' | 'armor';
  registry: DataRegistry;
  plan: ForgePlan;
  selectedOrbUid: string | null;
  onSocketClick: (slotIndex: number) => void;
  onSocketRemove: (slotIndex: number) => void;
}

const ELEMENTS = ['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos'] as const;

function getSlotOrb(slot: EquippedSlot): OrbInstance {
  return slot.kind === 'compound' ? slot.orbs[0] : slot.orb;
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
  onSocketClick,
  onSocketRemove,
}: ItemSocketViewProps) {
  const baseItem = registry.getBaseItem(item.baseItemId);
  const cols = Math.ceil(item.slots.length / 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Item info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-family-display)',
              fontWeight: 700,
              fontSize: 16,
              color: 'white',
            }}
          >
            {baseItem.name}
          </span>
          <span
            style={{
              fontSize: 8,
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

        {/* Inherent bonuses */}
        {baseItem.inherentBonuses.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {baseItem.inherentBonuses.map((bonus, i) => {
              const isPositive = bonus.value >= 0;
              const sign = isPositive ? '+' : '';
              const label =
                bonus.op === 'percent'
                  ? `${sign}${Math.round(bonus.value * 100)}% ${bonus.stat}`
                  : `${sign}${bonus.value} ${bonus.stat}`;
              return (
                <span
                  key={i}
                  style={{
                    fontSize: 11,
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
              fontSize: 10,
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

      {/* Socket grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 48px)`,
          gridTemplateRows: 'repeat(2, 48px)',
          gap: 6,
        }}
      >
        {item.slots.map((slot, index) => {
          if (slot === null) {
            // Empty socket
            const isPulsing = selectedOrbUid !== null;
            return (
              <button
                key={index}
                onClick={() => onSocketClick(index)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: 'var(--color-surface-800)',
                  border: '1.5px dashed var(--color-empty-socket)',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                  cursor: 'pointer',
                  touchAction: 'none',
                  animation: isPulsing ? 'orb-glow 1.5s ease-in-out infinite' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              />
            );
          }

          const orb = getSlotOrb(slot);
          const affix = registry.getAffix(orb.affixId);
          const tag = getElementTag(affix);
          const gradient = ELEMENT_GRADIENTS[tag];
          const isLocked = plan.lockedOrbUids.has(orb.uid);
          const emoji = ELEMENT_EMOJIS[tag] ?? '\u2694';
          const gemArt = getGemArt(orb.affixId);

          if (isLocked) {
            // Locked socket
            return (
              <div
                key={index}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${gradient.bg})`,
                  border: '2px solid var(--color-locked)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  touchAction: 'none',
                  cursor: 'default',
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{'\uD83D\uDD12'}</span>
              </div>
            );
          }

          // Filled socket (removable)
          return (
            <button
              key={index}
              onClick={() => onSocketRemove(index)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${gradient.bg})`,
                border: `2px solid ${gradient.border}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                touchAction: 'none',
                padding: 0,
                gap: 1,
              }}
            >
              {gemArt ? (
                <img src={gemArt} alt={affix.name} style={{ width: 20, height: 20 }} />
              ) : (
                <span style={{ fontSize: 20, lineHeight: 1 }}>{emoji}</span>
              )}
              <span
                style={{
                  fontSize: 7,
                  fontFamily: 'var(--font-family-display)',
                  color: 'white',
                  lineHeight: 1,
                  maxWidth: 44,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {affix.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Equipped affixes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {item.slots.map((slot, index) => {
          if (!slot) return null;
          const orb = getSlotOrb(slot);
          const affix = registry.getAffix(orb.affixId);
          const tag = getElementTag(affix);
          const emoji = ELEMENT_EMOJIS[tag] ?? '\u2694';
          const isLocked = plan.lockedOrbUids.has(orb.uid);
          const statValue = getStatLabel(affix, orb, cardId);

          return (
            <div
              key={index}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-family-display)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>{emoji}</span>
              <span>{affix.name}</span>
              {statValue && (
                <span style={{ color: 'var(--color-surface-300)' }}>{statValue}</span>
              )}
              {isLocked && <span>{'\uD83D\uDD12'}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
