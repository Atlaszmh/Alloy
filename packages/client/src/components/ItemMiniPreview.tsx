import type { AffixDef, DataRegistry, EquippedSlot, ForgedItem } from '@alloy/engine';
import { ELEMENT_COLORS } from '@/shared/utils/element-theme';

interface ItemMiniPreviewProps {
  item: ForgedItem;
  itemType: 'weapon' | 'armor';
  registry: DataRegistry;
  onClick: () => void;
}

const ELEMENTS = ['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos'] as const;

function getElementTag(affix: AffixDef): string {
  return affix.tags.find(t => (ELEMENTS as readonly string[]).includes(t)) ?? 'physical';
}

export function ItemMiniPreview({ item, itemType, registry, onClick }: ItemMiniPreviewProps) {
  const baseItem = registry.getBaseItem(item.baseItemId);
  const filled = item.slots.filter(s => s !== null).length;
  const total = item.slots.length;
  const icon = itemType === 'weapon' ? '\u2694' : '\uD83D\uDEE1';

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        height: 36,
        background: 'var(--color-surface-800)',
        borderTop: '1px solid var(--color-surface-600)',
        border: 'none',
        borderTopStyle: 'solid',
        borderTopWidth: 1,
        borderTopColor: 'var(--color-surface-600)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        cursor: 'pointer',
        transition: 'filter 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.filter = 'none';
      }}
    >
      {/* Left: icon + name */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 11,
            color: 'white',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {baseItem.name}
        </span>
      </div>

      {/* Center: socket dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {item.slots.map((slot, index) => {
          if (slot === null) {
            return (
              <span
                key={index}
                style={{
                  fontSize: 8,
                  color: 'var(--color-surface-500)',
                  lineHeight: 1,
                }}
              >
                {'\u25CB'}
              </span>
            );
          }

          const orb = slot.kind === 'compound' ? slot.orbs[0] : (slot as Extract<EquippedSlot, { kind: 'single' }> | Extract<EquippedSlot, { kind: 'upgraded' }>).orb;
          const affix = registry.getAffix(orb.affixId);
          const tag = getElementTag(affix);
          const color = ELEMENT_COLORS[tag] ?? '#c0c0c0';

          return (
            <span
              key={index}
              style={{
                fontSize: 8,
                color,
                lineHeight: 1,
              }}
            >
              {'\u25CF'}
            </span>
          );
        })}
      </div>

      {/* Right: count */}
      <span
        style={{
          fontFamily: 'var(--font-family-display)',
          fontSize: 10,
          color: 'var(--color-surface-300)',
          whiteSpace: 'nowrap',
        }}
      >
        {filled}/{total}
      </span>
    </button>
  );
}
