import { useMemo } from 'react';
import {
  EQUIP_BEST_SLOTS,
  compareItem,
  isDiveActive,
  referenceDepth,
  salvageCandidates,
  rarityIndex,
  type Rarity,
} from '@alloy/engine';
import { partsText, useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { getDelveRegistry } from './registry';
import { ItemTile } from './ItemTile';
import { RARITY_COLOR, RARITY_LABEL, UPGRADE_EPSILON, formatNumber } from './format';

const AUTO_RARITIES: Rarity[] = ['common', 'uncommon', 'magic', 'rare', 'epic'];

export function BagPanel({ onSelect }: { onSelect: (uid: string) => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const newUids = useDelveStore((s) => s.newUids);
  const bagSize = registry.getDelveBalance().loot.bagSize;
  const depth = referenceDepth(profile);

  const rows = useMemo(() => {
    return profile.bag
      .map((item) => ({
        item,
        delta: compareItem(profile.equipped, item, registry, depth, profile.pair).powerPct,
      }))
      .sort(
        (a, b) =>
          rarityIndex(b.item.rarity) - rarityIndex(a.item.rarity) ||
          b.delta - a.delta ||
          b.item.ilvl - a.item.ilvl,
      );
  }, [profile.bag, profile.equipped, profile.pair, registry, depth]);

  // Equip best leaves weapons alone: a weapon changes through its sheet (Equip or Transfer).
  const upgrades = rows.filter(
    (r) => r.delta > UPGRADE_EPSILON && EQUIP_BEST_SLOTS.includes(r.item.slot),
  ).length;
  const diving = isDiveActive(profile);
  const junk = useMemo(() => salvageCandidates(registry, profile, 'magic'), [registry, profile]);

  const onEquipBest = () => {
    const equipped = useDelveStore.getState().equipBest();
    if (equipped.length > 0) {
      playSound('orbConfirm');
      vibrate('success');
      showToast(`Equipped ${equipped.length} upgrade${equipped.length > 1 ? 's' : ''}`);
    }
  };

  const onSalvageJunk = () => {
    const { scrap, dust, links, runes, destroyed } = useDelveStore.getState().salvage(junk);
    if (scrap > 0) {
      playSound('gemScatter');
      vibrate('medium');
      const dustText = dust > 0 ? ` · +${formatNumber(dust)} Mana Dust` : '';
      const linkText = links > 0 ? ` · +${links} Link${links > 1 ? 's' : ''}` : '';
      const parts = partsText(registry, runes, destroyed);
      showToast(
        `Salvaged ${junk.length} items · +${formatNumber(scrap)} scrap${dustText}${linkText}${parts ? ` · ${parts}` : ''}`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="bag-panel">
      <div className="flex gap-2">
        <button
          className={`delve-btn flex-1 text-sm ${upgrades > 0 && !diving ? 'delve-btn-green' : ''}`}
          disabled={upgrades === 0 || diving}
          onClick={onEquipBest}
          data-testid="equip-best"
        >
          {diving ? 'Equip between dives' : `▲ Equip best${upgrades > 0 ? ` (${upgrades})` : ''}`}
        </button>
        <button
          className="delve-btn flex-1 text-sm"
          disabled={junk.length === 0 || diving}
          onClick={onSalvageJunk}
          data-testid="salvage-junk"
        >
          {diving
            ? 'Salvage between dives'
            : `Salvage junk${junk.length > 0 ? ` (${junk.length})` : ''}`}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-stone-400">
        <span>
          Bag{' '}
          <span className={profile.bag.length >= bagSize ? 'text-red-400' : 'text-stone-200'}>
            {profile.bag.length}
          </span>
          /{bagSize}
        </span>
        <div className="flex items-center gap-1">
          <span className="mr-1">Auto-salvage</span>
          {AUTO_RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={profile.autoSalvage[r]}
              aria-label={`Auto-salvage ${RARITY_LABEL[r]}`}
              title={`Auto-salvage ${RARITY_LABEL[r]}`}
              onClick={() => useDelveStore.getState().setAutoSalvage(r, !profile.autoSalvage[r])}
              className="h-5 w-5 rounded-full border"
              style={{
                borderColor: RARITY_COLOR[r],
                background: profile.autoSalvage[r] ? RARITY_COLOR[r] : 'transparent',
                opacity: profile.autoSalvage[r] ? 1 : 0.55,
              }}
            />
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="delve-panel px-4 py-8 text-center text-sm text-stone-400">
          Your bag is empty. Monsters in the depths drop gear — go get some.
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
        >
          {rows.map(({ item, delta }) => (
            <div key={item.uid} className="flex justify-center">
              <ItemTile
                item={item}
                size={56}
                delta={delta}
                isNew={newUids[item.uid]}
                onClick={() => onSelect(item.uid)}
                testId="bag-item"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
