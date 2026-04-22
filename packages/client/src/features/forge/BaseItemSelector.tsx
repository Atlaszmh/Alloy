import { useState } from 'react';
import type { BaseItemDef } from '@alloy/engine';
import { BaseItemCard } from './BaseItemCard.js';

interface BaseItemSelectorProps {
  weapons: BaseItemDef[];
  armors: BaseItemDef[];
  onSelect: (weapon: BaseItemDef, armor: BaseItemDef) => void;
}

export function BaseItemSelector({ weapons, armors, onSelect }: BaseItemSelectorProps) {
  const [selectedWeaponId, setSelectedWeaponId] = useState<string | null>(null);
  const [selectedArmorId, setSelectedArmorId] = useState<string | null>(null);

  const selectedWeapon = weapons.find((i) => i.id === selectedWeaponId) ?? null;
  const selectedArmor = armors.find((i) => i.id === selectedArmorId) ?? null;
  const canConfirm = selectedWeapon !== null && selectedArmor !== null;

  function handleConfirm() {
    if (selectedWeapon && selectedArmor) {
      onSelect(selectedWeapon, selectedArmor);
    }
  }

  function handleRandom() {
    const w = weapons[Math.floor(Math.random() * weapons.length)];
    const a = armors[Math.floor(Math.random() * armors.length)];
    if (w && a) {
      onSelect(w, a);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        padding: 16,
        width: '100%',
        maxWidth: 960,
      }}
    >
      <h2 style={{ margin: 0, color: '#e0e0e0', fontSize: 22 }}>Choose your loadout</h2>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <Section
          title="Weapon"
          items={weapons}
          selectedId={selectedWeaponId}
          onSelect={setSelectedWeaponId}
        />
        <Section
          title="Armor"
          items={armors}
          selectedId={selectedArmorId}
          onSelect={setSelectedArmorId}
        />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          style={{
            padding: '8px 24px',
            borderRadius: 6,
            border: 'none',
            background: canConfirm ? '#4a9eff' : '#555',
            color: canConfirm ? '#fff' : '#888',
            cursor: canConfirm ? 'pointer' : 'default',
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

function Section({
  title,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  items: BaseItemDef[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const itemType = title.toLowerCase();
  return (
    <section
      data-base-item-section={itemType}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        flex: '1 1 320px',
        minWidth: 280,
      }}
    >
      <h3
        style={{
          margin: 0,
          color: '#e0e0e0',
          fontSize: 16,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Choose your {itemType}
      </h3>
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
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>
    </section>
  );
}
