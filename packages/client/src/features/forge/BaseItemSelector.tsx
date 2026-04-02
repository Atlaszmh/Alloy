import { useState } from 'react';
import type { BaseItemDef } from '@alloy/engine';
import { BaseItemCard } from './BaseItemCard.js';

interface BaseItemSelectorProps {
  itemType: 'weapon' | 'armor';
  items: BaseItemDef[];
  onSelect: (item: BaseItemDef) => void;
}

export function BaseItemSelector({ itemType, items, onSelect }: BaseItemSelectorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  function handleConfirm() {
    if (selectedItem) {
      onSelect(selectedItem);
    }
  }

  function handleRandom() {
    const pick = items[Math.floor(Math.random() * items.length)];
    if (pick) {
      onSelect(pick);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 16 }}>
      <h2 style={{ margin: 0, color: '#e0e0e0', fontSize: 20 }}>
        Choose your {itemType}
      </h2>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'center',
        }}
      >
        {items.map((item) => (
          <BaseItemCard
            key={item.id}
            item={item}
            isSelected={item.id === selectedId}
            onClick={() => setSelectedId(item.id)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={handleConfirm}
          disabled={!selectedItem}
          style={{
            padding: '8px 24px',
            borderRadius: 6,
            border: 'none',
            background: selectedItem ? '#4a9eff' : '#555',
            color: selectedItem ? '#fff' : '#888',
            cursor: selectedItem ? 'pointer' : 'default',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Confirm
        </button>
        <button
          onClick={handleRandom}
          style={{
            padding: '8px 24px',
            borderRadius: 6,
            border: '1px solid #666',
            background: 'transparent',
            color: '#ccc',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Random
        </button>
      </div>
    </div>
  );
}
