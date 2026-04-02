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
  isDragging?: boolean;
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
  isDragging,
  onSocketClick,
  onSocketRemove,
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

      {/* Socket grid — sockets fill available width */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 'var(--gap-sm)',
        }}
      >
        {item.slots.map((slot, index) => {
          if (slot === null) {
            // Empty socket
            const isPulsing = selectedOrbUid !== null || isDragging;
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
                  animation: isPulsing ? 'orb-glow 1.5s ease-in-out infinite' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'box-shadow 0.2s, border-color 0.2s',
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

          // Shared socket styles — Option B gem card layout
          const socketStyle: React.CSSProperties = {
            width: '100%',
            aspectRatio: '1',
            borderRadius: 'var(--socket-radius)',
            background: `linear-gradient(135deg, ${gradient.bg})`,
            border: isLocked ? '2px solid var(--color-locked)' : `2px solid ${gradient.border}`,
            position: 'relative',
            overflow: 'hidden',
            cursor: isLocked ? 'default' : 'pointer',
            touchAction: 'none',
            padding: 0,
          };

          const socketContent = (
            <>
              {/* Full gem art or emoji */}
              {gemArt ? (
                <img src={gemArt} alt={affix.name} style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover', zIndex: 1,
                }} />
              ) : (
                <span style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: 'var(--icon-md)', zIndex: 1,
                }}>{emoji}</span>
              )}
              {/* Specular highlight */}
              <div style={{
                position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
                background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), transparent 55%)',
              }} />
              {/* Name in bottom gradient band */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
                background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)',
                padding: '4px 4px 3px', textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: 'var(--font-family-display)', fontWeight: 700,
                  fontSize: 'var(--text-2xs)', color: 'white', lineHeight: 1.15,
                  textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{affix.name}</div>
              </div>
              {/* Lock icon overlay */}
              {isLocked && (
                <div style={{
                  position: 'absolute', top: 4, right: 4, zIndex: 3,
                  fontSize: 'var(--text-xs)',
                }}>{'\uD83D\uDD12'}</div>
              )}
            </>
          );

          if (isLocked) {
            return <div key={index} style={socketStyle}>{socketContent}</div>;
          }

          return (
            <button key={index} onClick={() => onSocketRemove(index)} style={socketStyle}>
              {socketContent}
            </button>
          );
        })}
      </div>

      {/* Equipped affixes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
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
