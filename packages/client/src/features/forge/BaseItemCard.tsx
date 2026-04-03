import type { BaseItemDef } from '@alloy/engine';

interface BaseItemCardProps {
  item: BaseItemDef;
  isSelected: boolean;
  onClick: () => void;
}

function formatPrimaryStat(item: BaseItemDef): string {
  if (item.type === 'weapon') {
    return `DMG: ${item.baseStats.physicalDamage ?? 0}`;
  }
  return `Armor: ${item.baseStats.armor ?? 0}`;
}

function formatSecondaryStat(item: BaseItemDef): string {
  if (item.type === 'weapon') {
    return `Speed: ${(item.baseStats.attackSpeed ?? 1.0).toFixed(1)}s`;
  }
  return `+${item.baseStats.hp ?? 0} HP`;
}

export function BaseItemCard({ item, isSelected, onClick }: BaseItemCardProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '12px 16px',
        border: isSelected ? '2px solid #4a9eff' : '2px solid #555',
        borderRadius: 8,
        background: isSelected ? 'rgba(74, 158, 255, 0.1)' : 'rgba(30, 30, 40, 0.8)',
        color: '#e0e0e0',
        cursor: 'pointer',
        minWidth: 120,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 16 }}>{item.name}</span>
      <span style={{ fontSize: 12, color: '#aaa' }}>{item.description}</span>
      <span style={{ fontSize: 14 }}>{formatPrimaryStat(item)}</span>
      <span style={{ fontSize: 12, color: '#aaa' }}>{formatSecondaryStat(item)}</span>
    </button>
  );
}
